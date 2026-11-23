---
title: Dumpling：基于 eBPF 的 Android DEX 内存 Dump 工具
source: https://tsingshui.art/work/dumpling/
source_host: tsingshui.art
clip_date: 2026-11-23T10:29:47+08:00
trace_id: 74aea2cb-9add-405d-ae41-055f3543f53e
content_hash: e0160eac270f7248cc5988f42bc2577c8a7efb8d8e80967e75c8e54c33f5ed62
status: synced
tags: []
series: null
feed_source: 清水·Android/内核逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42175244-d011-818d-b424-c5c4bb09c495
ioc: null
---

> Rust + eBPF uprobe hook ART ClassLinker::DefineClass，从目标进程内存中提取运行时 DEX。无注入、无 ptrace、单文件静态分发。

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Kernel Space                          │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  eBPF uprobe @ ClassLinker::DefineClass             │   │
│   │                                                     │   │
│   │  1. bpf_get_current_uid_gid() → check target UID   │   │
│   │  2. read arg6 (DexFile* pointer)                    │   │
│   │  3. PerfEventArray.output(DexEvent)                 │   │
│   └───────────────────────┬─────────────────────────────┘   │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │ perf event
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        User Space (tokio async)              │
│                                                             │
│   ┌──────────┐    mpsc     ┌──────────┐    /proc/pid/mem   │
│   │ ipc.rs   │ ──────────→ │ dex.rs   │ ──────────────→    │
│   │ (per-CPU │   channel   │ (worker) │   read memory      │
│   │  reader) │             │          │                     │
│   └──────────┘             └────┬─────┘                     │
│                                 │                            │
│                                 ▼                            │
│                          ┌─────────────┐                     │
│                          │dex_parser.rs│                     │
│                          │ calc real   │                     │
│                          │ file size   │                     │
│                          └──────┬──────┘                     │
│                                 │                            │
│                                 ▼                            │
│                          dump to disk                        │
└─────────────────────────────────────────────────────────────┘
```

* * *

## eBPF 内核程序

```rust
#![no_std]
#![no_main]

#[map]
static UID: Array<u32> = Array::with_max_entries(1, 0);
#[map]
static DEX_FILE_PTR_EVENT: PerfEventArray<DexEvent> = PerfEventArray::new(0);

fn try_dumpling(ctx: ProbeContext) -> Result<u32, u32> {
    // UID 不匹配直接返回，全设备只多几条指令的开销
    if let Some(target_uid) = UID.get(0) {
        if target_uid != &ctx.uid() {
            return Ok(0);
        }
    }
    // arg5 = const DexFile&
    let dex_base_ptr = ctx.arg::<u64>(5).unwrap_or(0);
    DEX_FILE_PTR_EVENT.output(&ctx, &DexEvent {
        dex_file_base: dex_base_ptr,
        pid: ctx.pid(),
        _padding: 0,
    }, 0);
    Ok(0)
}
```

挂载到 `/apex/com.android.art/lib64/libart.so` 的 `ClassLinker::DefineClass` ，第 6 个参数是 `const DexFile&` 。无论什么加壳方案，类加载都绕不过这个入口。

* * *

## 进程内存读取

封装了一个 `Ptr` 类型，通过 `/proc/{pid}/mem` seek + read 实现跨进程内存读取，不需要 ptrace attach：

```rust
pub struct Ptr {
    pub addr: u64,
    reader: Rc<RefCell<ProcessMemoryReader>>,
}

impl Ptr {
    pub fn add(&self, offset: u64) -> Self { ... }
    pub fn read_pointer(&self) -> Result<Self> { ... }
    pub fn read_u32(&self) -> Result<u32> { ... }
    pub fn read_cpp_string(&self, max_len: usize) -> Result<String> { ... }
}
```

其中 `read_cpp_string` 处理了 libc++ `std::string` 的 SSO 布局——最低 bit 为 1 是长字符串（堆指针在 +0x10），为 0 是短字符串（数据 inline 在对象里）。用来读 `DexFile::location_` 判断是否系统 DEX。

* * *

## DEX 解析核心：真实大小计算

壳经常篡改 DEX header 的 `file_size` ，不能信。思路是遍历 class_defs → 解析每个类的方法 → 找到 code_off/annotation_off/static_values_off/class_data_off 四个维度的最远偏移 → 加上该数据项自身大小。

```rust
pub fn parse(&self) -> Result<DexParseResult> {
    let dex_ptr = base.add(POINTER_SIZE).read_pointer()?;     // begin_
    let dex_size = base.add(POINTER_SIZE * 2).read_usize()?;  // size_

    // 先读 1.5 倍
    let dex_bytes = dex_ptr.read_byte_array(dex_size * 3 / 2)?;

    // 解析结构算真实大小
    let last_item_offset = DexParser::from_bytes(&dex_bytes)?.get_farthest_offset()?;
    let actual_size = last_item_offset.farthest_offset as usize;

    // 不够再读一次
    let dex_bytes = if actual_size > dex_size {
        dex_ptr.read_byte_array(actual_size)?
    } else {
        dex_bytes
    };
    Ok(DexParseResult { dex_bytes, is_system: false })
}
```

这里读 1.5 倍并不准确，权宜之策，想要精准的确定大小需要额外的工作量，当时只是想临时用下就没有继续开发了。

* * *

## 去重

同一个 DEX 每个类加载都会触发 uprobe，用 checksum 做 key， `Arc<Mutex<HashMap<u32, &str>>>` 跟踪状态。每个事件 spawn 一个 tokio task 处理，已见过的 checksum 直接跳过。

> 实际上发现，Jadx 自己就会去重，这一步除了省内存之外没什么太大的用处。

## 对抗

1.  Uprobe 并不是无感，虽然是Kernel接管的断点，实际上依然会 patch 成 BKR指令，和软断点没区别，CRC32 一致性过不了。
2.  Uprobe 会覆盖 maps，增加一个 \[uprobe\] 断点
3.  Uprobe 会修改目标的页属性
4.  从内存直接解析 Dex 存在一个 Timing ，这个时间点足够壳销毁、Patch Dex 文件所在的内存，可能残缺、格式错误。

## 局限

-   需要 root（CAP_BPF + CAP_PERFMON）
-   `DexFile` 对象布局偏移写死，不同 Android 版本可能不同
-   compact DEX (cdex) 直接跳过
-   内核需要支持 eBPF uprobe、 PerfEventArray，大概 5.2 以上的内核版本就能用。
