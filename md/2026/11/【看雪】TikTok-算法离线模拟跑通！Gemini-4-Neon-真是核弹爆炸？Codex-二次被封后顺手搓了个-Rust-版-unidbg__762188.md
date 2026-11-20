---
title: 【看雪】TikTok 算法离线模拟跑通！Gemini 4 Neon 真是核弹爆炸？Codex 二次被封后顺手搓了个 Rust 版 unidbg
source: https://bbs.kanxue.com/thread-293615.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-20T11:19:02+08:00
trace_id: 77a60f22-7060-4d0a-871a-2292619803df
content_hash: 48bd903cfe05b804ff8c7810f483f66e6acd76e3aa79833c30bd10f6d163330b
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41e75244-d011-818f-945a-d5f60761721d
ioc:
  cves: []
  cwes: []
  hashes:
    - d8b674543fc0b023b69f6a3f5a0f287d458ea204
  domains: []
  tools: []
  techniques: []
---

> **声明**：本文及开源项目 `runidbg` 仅用于二进制安全研究、逆向工程学习与性能评测。文中示例脚本与测试数据均已脱敏，不含任何真实会话凭据，请遵守相关法律法规。

## 前言

前两天第二个 x20 的 Codex 账号也被封了，心态本来就有点麻；更巧的是临走还手滑把电脑上的 ToDesk 给关了，回家连不上机器，手头原本在跟的活直接断档。

闲着也是闲着，再加上之前一直在等发财哥开源他的魔改 unidbg，左等右等也没等到，正好看到刚放出来的 **Gemini 4 Neon**，干脆拿来试下水，把以前用 Codex 试着写过、但一直没能收尾的项目重新捡起来自己开源：用纯 Rust 实现一套轻量级 Android ARM64 `.so` 仿真与二进制追踪工具 **`runidbg`** （名字很直白，就是 **Rust + unidbg**）。之前用 GPT/Codex 写这类底层项目，总觉得是纯提示词驱动，得一路拿各种细节提示词追着修这修那，最后往往不了了之；但这次上手 Neon 的感觉完全不一样，它更像一个真正在旁边的老工程师，很多东西不用说得太细，自己就能顺着意图把上下文和边界都替你想好，这波用下来确实有点“核弹爆炸”的意思。

本来没抱太大指望，结果一个晚上就把 ELF 动态链接器、HLE libc、JNI 1.6、QuickJS 脚本引擎、mmap 双流 Tracer、异步多核 RPC、MCP 服务端和 GDB RSP 调试全搭了出来。第二天回到电脑前，拿之前在 Java `unidbg` 里调了 **98 轮、 `0x3000001` 路径始终卡在空数组 `[]`** 的 `libmetasec_ov.so` 实测了一下，顺手修了几处兼容性问题后四个签名头直接跑通，没想到第二天就直接用上了生产。

下面把整体架构、与 `unidbg` 的同口径对比以及 `libmetasec_ov.so` 的完整排查过程记录一下，供坛友参考指正。

-   仓库地址（MIT 开源）：https://github.com/tiwe0/runidbg
-   欢迎 Star / Fork，也欢迎提 Issue 提交不兼容的脱敏 ARM64 `.so` 样本。

* * *

## 一、整体架构与核心模块

`runidbg` 基于 Unicorn 2.1 与 `goblin` 构建，最终编译为单个原生二进制 `runidbg-cli` （Release 约 19 MB，不依赖 JVM）。整体分为四层：

![runidbg 整体四层架构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/844dd08d937dc864.webp)

日常补环境与分析的闭环流程如下：

![runidbg 日常补环境与离线分析闭环](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a97e34a8e47c6cb.webp)

### 1\. QuickJS 补环境与 DeviceProfile 联动

执行 `runidbg-cli init-types examples/scripts` 可导出 `runidbg.d.ts` ，在编辑器里写 JS 脚本有完整类型提示。

考虑到部分安全库会交叉校验 `__system_property_get` 、 `/proc/cpuinfo` 、 `uname()` 和 JNI `android.os.Build` ，这里抽了一层统一的 `DeviceProfile` （内置 `pixel5` / `pixel8pro` / `s24ultra` / `xiaomi14` ，支持字段覆盖），一处配置自动同步上述四处数据源：

```javascript
/// <reference path="./runidbg.d.ts" />

const emu = Emu.create({
  packageName: "com.example.app",
  searchPaths: ["./libs"],
  device: "pixel8pro",
  realClock: true,   // 默认确定性虚拟时钟，实签场景可切为宿主机实时时间戳
});

emu.diag.enable();
const mod = emu.load("./libs/libtarget.so");
emu.jniOnLoad(mod);

// Native Hook 回调内已处理 RefCell 重入，可直接调用 emu.jni.getString / getBytes
emu.hook.attach(mod.base + 0x12340, {
  onEnter(ctx) { console.log("x0=", ctx.x0, "str=", emu.jni.getString(ctx.x1)); },
  onLeave(ctx) { console.log("ret=", ctx.retval); },
});
```

### 2\. 崩溃现场 CrashReport

遇到异常或触达指令预算上限时， `emu.lastCrash()?.formatted` 会输出故障 PC、相对偏移、周边 ARM64 反汇编、X0–X30 寄存器、FP 调用栈、最近 HLE/JNI/VFS 面包屑及 VMA 映射。以下是 `libmetasec_ov.so` 触发指令预算时的实测日志：

```
==================== runidbg Guest Crash Report ====================
Reason   : ExecutionTimeout(timeout_us=15000000, max_instructions=5000000)
Fault PC : 0x000000004012ef20 (libmetasec_ov.so+0x12ef20 (JNI_OnLoad+0xdfd70))
Return LR: 0x000000004012ec9c (libmetasec_ov.so+0x12ec9c (JNI_OnLoad+0xdfaec))
SP / FP  : SP=0x00000000707ffbc0  FP=0x00000000707ffc50  NZCV=0x80000000

--- Disassembly (ARM64) ---
    0x000000004012ef10: b9001bed  str w13, [sp, #0x18]
    0x000000004012ef14: b9401fe2  ldr w2, [sp, #0x1c]
    0x000000004012ef18: b9401be3  ldr w3, [sp, #0x18]
    0x000000004012ef1c: 71065c7f  cmp w3, #0x197
>>> 0x000000004012ef20: 540001ac  b.gt 0x4012ef54
    0x000000004012ef24: 1b027c42  mul w2, w2, w2

--- Backtrace (FP Chain) ---
  #0  0x000000004012ef20  libmetasec_ov.so+0x12ef20 (JNI_OnLoad+0xdfd70)
  #1  0x000000004012ec9c  libmetasec_ov.so+0x12ec9c (JNI_OnLoad+0xdfaec)
  #3  0x0000000040050758  libmetasec_ov.so+0x50758 (JNI_OnLoad+0x15a8)
  #5  0x00000000dead0000  <RET_MAGIC_ADDR>

--- Recent Breadcrumbs (HLE / JNI / Syscall) ---
  [00] [VFS ENOENT] open(/proc/self/exe)
  [01] [VFS ENOENT] open(/system/lib64/libc.so)
====================================================================
```

### 3\. 零拷贝二进制 Tracer 与离线分析命令

热路径不做反汇编，仅向 `mmap` 写入 32 字节定长主记录（ `full` 模式同步写 `.ext` 内存读写流，结束时截断至实际字节数），离线阶段用 `bad64` 解码。以下是在 `libmetasec_ov.so` 上采集 `full` Trace 后的离线分析输出：

```bash
# 1. 反汇编 + 寄存器增量 + 内存写入（--base 输出相对偏移，自动探测同级 .ext）
$ ./target/release/runidbg-cli dump trace_full.idx --base 0x40000000 --limit 10
# trace.idx: 2000000 条指令 | trace.ext: 635891 条扩展事件
#000000 [+0x120be0] 0x0000000040120be0: stp fp, lr, [sp, #0xfffffffffffffff0]!
    [MEM W8] [0x00000000707ffef0] <- 0x0000000000000000
    [MEM W8] [0x00000000707ffef8] <- 0x00000000dead0000
#000001 [+0x120be4] 0x0000000040120be4: mov fp, sp                       ; SP <- 0x00000000707ffef0
#000002 [+0x120be8] 0x0000000040120be8: mov w1, w3                       ; X29 <- 0x00000000707ffef0
#000003 [+0x120bec] 0x0000000040120bec: mov w0, w2                       ; X1 <- 0x0000000000000000
#000004 [+0x120bf0] 0x0000000040120bf0: mov x2, x4                       ; X0 <- 0x0000000003000001
#000008 [+0x120c00] 0x0000000040120c00: stp fp, lr, [sp, #0x40]          ; SP <- 0x00000000707ffea0
    [MEM W8] [0x00000000707ffee0] <- 0x00000000707ffef0
    [MEM W8] [0x00000000707ffee8] <- 0x00000000dead0000

# 2. 热点统计（唯一 PC、Top-N 热点 BL 调用目标与热点 PC）
$ ./target/release/runidbg-cli stats trace_full.idx --base 0x40000000 --top 8
# Trace 统计: 总指令=2000000 | 唯一 PC=30834 | 扩展事件=635891 | 唯一 BL 目标=254

=== Top 8 热点调用目标 (BL) ===
  0x0000000040153734 [+0x153734]  x367
  0x0000000040153f40 [+0x153f40]  x316
  0x0000000040159ba0 [+0x159ba0]  x316
  0x0000000040031990 [+0x31990]   x288
  0x0000000040031910 [+0x31910]   x232

=== Top 8 热点指令地址 (PC) ===
  0x0000000040053f68 [+0x53f68]   x7451
  0x0000000040053f6c [+0x53f6c]   x7451

# 3. 检索指定寄存器值（定位 opcode 0x03000001 的传播点）
$ ./target/release/runidbg-cli search trace_full.idx --base 0x40000000 --val 0x03000001
# 命中寄存器值 0x0000000003000001: 10 条
#000004 [+0x120bf0] 0x0000000040120bf0: mov x2, x4                       ; X0 <- 0x0000000003000001
#002356 [+0x120ff0] 0x0000000040120ff0: cmp w11, w23                     ; X11 <- 0x0000000003000001
#002364 [+0x121010] 0x0000000040121010: cmp w8, w23                      ; X8 <- 0x0000000003000001

# 4. 导出 IDA Pro / Binary Ninja 覆盖率高亮脚本
$ ./target/release/runidbg-cli export-ida trace_full.idx --base 0x40000000 --out ida_cov.py
$ ./target/release/runidbg-cli export-bn  trace_full.idx --base 0x40000000 --out bn_cov.py
```

### 4\. 内置 RPC、MCP 与 GDB 远程调试

```bash
# 多核 HTTP / JSON-RPC 2.0 服务（提供 /health、/metrics?format=prom、/call/<m>、/rpc、/admin/reload）
./target/release/runidbg-cli serve examples/scripts/tiktok_metasec.js \
  --listen 127.0.0.1:8080 --workers auto --timeout-ms 15000 --allow-reload

# MCP 服务端（支持 stdio / Streamable HTTP，内置 15 个逆向工具，附 docs/SKILL.md）
./target/release/runidbg-cli mcp --http 127.0.0.1:8090 --cwd .

# ARM64 GDB RSP 远程调试（IDA Pro / Binary Ninja / pwndbg 中 target remote 127.0.0.1:1234）
./target/release/runidbg-cli debug samples/libstatic-webp.so WebPGetDecoderVersion --listen 127.0.0.1:1234
```

* * *

## 二、与 unidbg 的同口径性能对比

测试环境：Apple Silicon（10 核 ARM64 macOS）、JDK 21（ `unidbg 0.9.9` ）vs `runidbg-cli --release` 。测试样本取自 **TikTok 47.6.3（Google Play 版） **的 `libmetasec_ov.so` （2 MB stripped，附 `libc++_shared.so` ），对照真机为 **OnePlus 13 粉红版**。  
为了保证对比口径一致，以下三组均在** 两边都能 100% 产出相同有效结果** 的 `X-Cylons` （ `100663297` ）路径上实测。

### 1\. 冷启动与进程内热态调用

| 指标  | Java `unidbg 0.9.9` | Rust `runidbg-cli` | 倍率  |
| --- | --- | --- | --- |
| 环境初始化 + `.so` 加载 | 1,666 ms | **40 ms** | **41.7×** |
| `JNI_OnLoad` | 72 ms | **37 ms** | **1.9×** |
| **总冷启动耗时** | 1,738 ms | **77 ms** | **22.6×** |
| 进程内单核热态调用（50 次均值） | 3.80 ms（263.4 QPS） | **1.30 ms（769.2 QPS）** | **2.92×** |

![冷启动与进程内热态调用耗时对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/facbd851ee03992e.webp)

### 2\. HTTP RPC 并发压测（每次请求均校验返回值）

Java 侧用 JDK 21 内置 `HttpServer` 封装 `synchronized` 单实例 `unidbg` ，Rust 侧直接使用 `runidbg-cli serve` 。原始输出如下：

```
Java unidbg (1 worker)         | ok=100/100 | QPS=  254.7 | p50= 38.35ms | p95= 41.03ms | RSS= 122.1MB
Rust runidbg (workers=1)       | ok=100/100 | QPS=  628.7 | p50= 15.83ms | p95= 15.99ms | RSS=  21.7MB
Rust runidbg (workers=auto)    | ok=200/200 | QPS= 1141.0 | p50=  8.74ms | p95= 35.94ms | RSS= 127.5MB
```

单核模式下吞吐为 `unidbg` 的 **2.47×**，常驻内存为 **1/5.6** （21.7 MB vs 122.1 MB）；10 核并发下达到 **1,141 QPS**，总内存 `127.5 MB` 与 Java 单实例接近。

![HTTP RPC 并发压测对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e1f64d9fbbc020a0.webp)

### 3\. 全模块指令级 Trace（\[base, base+size\]）

| 引擎 / 模式 | 耗时  | 记录条数 | 归一化吞吐 | 单条体积 | 吞吐倍率 |
| --- | --- | --- | --- | --- | --- |
| Java `unidbg` （ `traceCode` 文本流） | 1,851.1 ms | 275,381 | 0.149 M insns/s | ~118 B/条（31 MB） | `1×` |
| Rust `runidbg` （ `fast` 二进制 mmap） | **64 ms** | 1,090,194 | **17.03 M insns/s** | 32 B/条（33 MB） | **114×** |
| Rust `runidbg` （ `reg_delta` 二进制 mmap） | **212 ms** | 1,090,194 | **5.14 M insns/s** | 32 B/条（33 MB） | **34.5×** |
| Rust `runidbg` （ `full` 双流 + 20.1 万内存事件） | **233 ms** | 1,090,194 + 201,209 ext | **4.68 M insns/s** | 32 B/条（33 MB + 6.1 MB） | **31.4×** |

![全模块指令级 Trace 归一化吞吐对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/115d1e7fc20eef98.webp)

## 三、libmetasec_ov.so 离线模拟排查记录

下面记录用 **TikTok 47.6.3（Google Play 版）** 的 `libmetasec_ov.so` （对照真机 OnePlus 13 粉红版）实测 `0x3000001` 路径时依次踩到并修复的几个底层问题。

### 1\. 初次调用返回 array length = 4，但元素读出为 null

`runidbg` 加载依赖、执行 `.init_array` 与 `JNI_OnLoad` （返回 `0x10006` ）共耗时 75 ms。向门控全局 `[base + 0x209198]` 写入 `java/lang/String` 类引用后调用 `0x120be0` （ `opcode = 50331649` ），返回数组长度为 4，但读取元素全为 `null` ，日志如下：

```
WARN runidbg::hle: 调用未实现的外部符号 symbol=asprintf x0=0x707ffa08 x1=0x707ff2e0
WARN runidbg::jni: [JNI] 未处理的 CallObjectMethod: <unknown>.getBytes(Ljava/lang/String;)[B
```

对 `NewStringUTF` 和 `SetObjectArrayElement` 下 hook 后定位到原因：

-   native 在 `SetObjectArrayElement(arr, idx, str)` 之后紧接着调用了 `DeleteLocalRef(str)` ，原先 `ObjectTable::delete_local` 未检查对象是否仍被 `ObjectArray` 引用，直接移除了底层对象；
-   顺带补齐了 `asprintf` HLE、 `java/lang/String.<init>([B...)` 构造函数与 `Thread.currentThread()` 默认实现。

修复后再次运行，4 个签名头均正常返回：

```
=== [X-Gorgon] opcode=0x3000001 | 19 ms | len=8 ===
  X-Argus   (len=280): x3wjY/XBIM8EZmBXNDLgA0dFVueqsE+jh1Qj3fTp+gkac6i+...
  X-Gorgon  (len=52) : 840400f100001700ba9baf305623f8989808f5d7ff41b4a3b616
  X-Khronos (len=10) : 1700000000
  X-Ladon   (len=28) : lexhS621gsJTL3AAgh46BAlO7W4=
```

### 2\. X-Ladon 长度偏短（28B vs 48B）与 \_FORTIFY_SOURCE=2 问题

对比真机结果发现 `X-Ladon` 应为 48 字节。用 `jadx` 查看 `classes5.dex` 中的 `ms.bd.o.h2` / `c0` / `e` / `u0` / `i1` / `k1` ，理清了初始化流程：

-   `MS.b(65539)` ：返回 `.msdata` 目录路径
-   `MS.b(16777233)` ：返回 `PackageInfo.versionName`
-   `k.a(67108865, ...)` ：传入 15 项配置 `JSONArray` 完成实例初始化

接入 `67108865` 初始化后，日志暴露了另一处底层缺陷：

```
[MS.b] op=0x1000023 (16777251) s=d8b674543fc0b023b69f6a3f5a0f287d458ea204|%s-%d-%d-semithc
WARN runidbg::hle: 调用未实现的外部符号 symbol=sscanf
WARN runidbg::hle: 调用未实现的外部符号 symbol=atoll
```

`%s-%d-%d-semithc` 未被格式化，排查发现两处原因：

1.  Android NDK 默认 `_FORTIFY_SOURCE=2` ， `__snprintf_chk(dst, size, flags, destlen, fmt, ...)` 的 `fmt` 位于 **`x4`** （变参从 `x5` 起），此前与普通 `snprintf` 共用 `x2` 导致参数错位；
2.  之前的 `vsnprintf` / `__vsnprintf_chk` 未按 AAPCS64 `va_list` （32 字节结构）展开变参。

在 `src/loader/trampoline.rs` 中补齐真实 AAPCS64 `va_list` 格式化、 `__snprintf_chk` 、 `sscanf` 、 `atoll` 以及 JNI 基础类型装箱 `valueOf` ：

```rust
fn format_guest_vprintf<D>(uc: &Unicorn<'_, D>, fmt: &str, va_list_ptr: u64) -> String {
    let mut raw = [0u8; 32];
    if va_list_ptr == 0 || uc.mem_read(va_list_ptr, &mut raw).is_err() {
        return fmt.to_string();
    }
    let mut stack_ptr = u64::from_le_bytes(raw[0..8].try_into().unwrap());
    let gr_top = u64::from_le_bytes(raw[8..16].try_into().unwrap());
    let mut gr_offs = i32::from_le_bytes(raw[24..28].try_into().unwrap());

    format_guest_printf_with_reader(uc, fmt, || {
        let addr = if gr_offs < 0 {
            let a = (gr_top as i64).wrapping_add(gr_offs as i64) as u64;
            gr_offs = gr_offs.saturating_add(8);
            a
        } else {
            let a = stack_ptr;
            stack_ptr = stack_ptr.wrapping_add(8);
            a
        };
        let mut buf = [0u8; 8];
        if uc.mem_read(addr, &mut buf).is_ok() { u64::from_le_bytes(buf) } else { 0 }
    })
}
```

修复后复测， `%s-%d-%d` 正常展开为 `1233-0-0-semithc` ， `X-Ladon` 恢复至 48 字节， `missingJni` 归零：

```
[metasec] JNI_OnLoad=0x10006
[metasec] X-Cylons: len=24
[metasec] X-Argus (len=368): x3xgM2fC/jTaNLxc3zEZ7TYY0j6wuPq8nEx0L0xzoB4MJzLx...
[metasec] X-Gorgon (len=52): 840480d000007e8fa04b4b7ec2740e98c00fc4b2aeacc073...
[metasec] X-Khronos (len=10): 1795138677
[metasec] X-Ladon (len=48): lexhS6sT3IGEB2Z3MfNeduK98iQltdbahM1TfvLjlbvoQCXl
```

用 `runidbg-cli serve --workers auto` 压测全 4 头并发，单机吞吐 **837.5 QPS** （p50 13.1 ms）。对照组测试中，不带签名头返回 `0 bytes` 空体，带上这组离线签名头可正常拿到完整业务 JSON。 **脱敏后的脚本与用例已合入仓库 [`examples/scripts/tiktok_metasec.js`](https://github.com/tiwe0/runidbg/blob/main/examples/scripts/tiktok_metasec.js) 与 [`tests/metasec_compat.rs`](https://github.com/tiwe0/runidbg/blob/main/tests/metasec_compat.rs) 。**

* * *

## 四、与 unidbg 的实际开发体验对比

以同一份 `libmetasec_ov.so` 为例，对比两边写补环境脚本的日常流程：

| 环节  | Java `unidbg` （原 `CallNative3.java` 实录） | Rust `runidbg` （ `tiktok_metasec.js` ） |
| --- | --- | --- |
| **依赖准备** | 需准备 JDK + 15 个 jar + **8 MB `classes5.dex`** 用于 `resolveClass` | **零 DEX 依赖**，单二进制 `runidbg-cli` + `.so` 直接运行 |
| **JNIEnv 与虚表** | 需反射 `DalvikVM64._JNIEnv` 获取 `UnidbgPointer` （默认 JNA `Pointer` 读模拟地址会崩宿主 JVM）；并手写反射覆盖 `index 10/31/171/173/228` 共 5 个 JNI 槽位 | `emu.jni.envPtr` / `findClass` / `newStringArray` / `getStringArray` 直接可用，无需反射改虚表 |
| **未知 Syscall** | 需反射 `SvcMemory.svcMap` 为 `0x1a0` / `0x1a2` 注册 `-ENOSYS` ，否则抛 `BackendException` | 未实现 syscall 默认返回 `-ENOSYS` 并记入 `EnvDiag` ，需要时 `emu.hook.syscall` 拦截 |
| **排查与迭代** | 靠 `vm.setVerbose(true)` 翻日志，改完补丁需 `javac` 编译 + ~2s 冷启动 | `emu.diag.enable()` 直接输出缺失清单，改完 JS **~80 ms** 复测 |
| **上线 RPC** | 需自行封装 HTTP 框架与多线程实例池 | 同脚本挂 `rpc.exports` ，直接 `runidbg-cli serve --workers auto` |

* * *

## 五、目前存在的不足

最后客观列一下 `runidbg` 当前的局限：

1.  **仅支持 Android ARM64（ `aarch64` ）**，暂不支持 ARM32 与 iOS；
2.  **项目尚处于早期**，长尾系统库、冷门 syscall 与 Android 框架类覆盖远不如沉淀多年的 `unidbg` ；
3.  与 `unidbg` 同样不内置 DEX 字节码解释器，Java 侧逻辑依赖内置模型与 JS Hook 补全。

仓库目前以 MIT 协议开源，包含中英文 README、组件使用文档 [`docs/GUIDE.md`](https://github.com/tiwe0/runidbg/blob/main/docs/GUIDE.md) 、给 AI Agent 用的 [`docs/SKILL.md`](https://github.com/tiwe0/runidbg/blob/main/docs/SKILL.md) 以及 40 项集成测试：

```bash
git clone https://github.com/tiwe0/runidbg.git
cd runidbg
cargo test
cargo run --release --bin runidbg-cli -- run examples/scripts/tiktok_metasec.js
```

欢迎各位大佬试用指正、Star / Fork，更欢迎在 GitHub Issue 里提交跑不通的脱敏 ARM64 `.so` 样本（附带 `EnvDiag` 与 `CrashReport` 即可），一起把兼容性慢慢补齐。

-   GitHub：https://github.com/tiwe0/runidbg

### 致谢

特别致谢 [**unidbg**](https://github.com/zhkl0228/unidbg) 及作者 **`zhkl0228`**：项目名 `runidbg` （ `Rust + unidbg` ）本身就是向 `unidbg` 致敬，Android 沙箱、JNI 桥接与补环境思路都深受其启发。自己动手写过一轮之后，尤其对 `zhkl0228` 心生佩服：在那个没有 AI 辅助、全靠纯手搓的年代，能够凭借如此扎实的底层技术功底和毅力，一路把覆盖 Android ARM32/ARM64 乃至 iOS 的这么一套优秀项目写出来并持续维护至今，确实非常了不起。同时感谢 Unicorn Engine、QuickJS / `rquickjs` 、 `goblin` 、 `bad64` 等底层开源项目。

### 附：一点感想

写完这个项目，心里多少还是有点感慨。AI 发展的速度确实太快了，现在干活真正重要的，很多时候已经不再是一行行抠代码、单步盯调试或者死磕某个算法细节，而是能不能把最终可用的产物交付出来。

但话说回来，底层知识依然非常关键。像这次排查 `DeleteLocalRef` 生命周期、 `_FORTIFY_SOURCE=2` 变参偏移、AAPCS64 `va_list` 结构这些问题，懂逆向底层的人用 AI，和不懂底层的人拿同一个模型去处理，效率和最终能到达的高度绝对是天壤之别。底层功底决定了你能不能一眼看出方向、问出对的问题、判断 AI 给出的方案靠不靠谱。

只是有点矛盾的是，AI 越强、交付门槛越低，客观上又在很大程度上劝退甚至“杀死”了还愿意静下心来啃底层知识的从业人员。工具越来越趁手，愿意往深处挖的人却越来越少，挺让人唏嘘的。
