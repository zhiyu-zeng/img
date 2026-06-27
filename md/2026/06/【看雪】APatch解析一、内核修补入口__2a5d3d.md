---
title: 【看雪】APatch解析一、内核修补入口
source: https://bbs.kanxue.com/thread-291802.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-27T17:09:53+08:00
trace_id: 975942b7-bb4c-4878-bdc6-7a0fddf3862c
content_hash: 32b33e1e96db8cc607fee88be3f2d412e9890240f5ad3485cf7038320f55ca0b
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: APatch 通过修改内核启动代码，在物理地址阶段切入，完成自定位、数据准备和关键函数Hook，从而实现内核修补与初始化。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38c75244-d011-8139-8be2-d7a807c3efcb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> APatch 通过修改内核启动代码，在物理地址阶段切入，完成自定位、数据准备和关键函数Hook，从而实现内核修补与初始化。
> 
> - **入口机制：** kptools工具将独立二进制blob（kpimg）嵌入内核镜像，并将内核入口指令修改为跳转到KP的`setup_entry`，从而在开机最早期获得控制权。
> - **自定位计算：** 在MMU开启前，代码利用ARM64的`adrp`指令进行PC相对寻址，计算出内核的物理基址（`kernel_pa`），以此作为后续所有地址计算的基准。
> - **核心Hook操作：** `map_prepare`阶段会修改`paging_init`函数的第一条指令为一条跳转指令，指向KP自己的`_paging_init`函数，从而在内核建立页表的关键节点插入自己的代码。
> - **内存搬迁与清理：** `_paging_init`利用内核的`memblock`分配器为KP核心代码分配独立的物理内存，并将其搬迁过去；之后立即恢复`paging_init`的原始指令，最后跳转到KP的C语言入口`start()`。
> - **无痕初始化：** 整个流程在完成数据准备和代码拷贝后，会恢复所有被修改的内核原始指令和内存数据，确保内核后续运行不受影响，实现了“插队”而非“替换”。

> 一定是练功的时候总是差不多、差不多，到了关键时刻，就总是差一点。

这是 APatch 的第一篇，聊聊 KernelPatch 是怎么在开机最早期切入内核、在物理地址阶段完成准备工作、hook paging\_init 完成内存搬迁，最后跑到 `start.c` 里真正开始干活的。

整个流程按时间顺序分成四个阶段来讲： **打补丁 → 物理地址阶段 → paging\_init hook → start 正式初始化** 。

开始之前，先搞清楚几个基本概念。

* * *

## 前置知识

### CPU 怎么执行代码

CPU 内部有一个寄存器叫 **PC** （Program Counter，ARM64 里也叫 IP）。执行循环就三件事：

```python
循环：
    1. 从 PC 指向的地址读 4 字节（一条指令）
    2. 执行这条指令
    3. PC += 4，回到 1
```

就这么简单。CPU 是个无脑的"读指令 → 执行 → 下一条"机器。

所以"函数的地址"本质上就是函数第一条指令在内存中的位置。比如内核编译完后， `paging_init` 函数的第一条指令在离内核开头 `0x1234000` 字节的位置，那 `paging_init` 的偏移就是 `0x1234000` 。等内核加载到物理地址 `0x40080000` 后， `paging_init` 的真实物理地址就是 `0x40080000 + 0x1234000 = 0x412B4000` 。

### 物理地址 vs 虚拟地址

**开机时** ，CPU 直接拿裸的地址访问内存，这就是 **物理地址** 。物理地址就是一个巨大的字节数组的下标，你的手机有 8GB 内存，物理地址范围就是 `0x00000000` 到 `0x1FFFFFFFF` 。

**操作系统启动后会开 MMU** （Memory Management Unit），在 CPU 和物理内存之间建一道翻译层：

```python
CPU 发出的地址            MMU 翻译            物理内存
（虚拟地址）            ──────────→
进程A: 0x1000  ── MMU ──→ 0x80001000
进程B: 0x1000  ── MMU ──→ 0x90005000
```

两个进程都以为自己在用 `0x1000` ，MMU 把它们翻译到不同的物理地址，互相不干扰。翻译规则存在 **页表** （Page Table）里。 `paging_init` 就是内核里负责建立完整页表的函数。

### 开机时的时间线

```python
电源打开
  │
  ▼  引导加载器把 kernel Image 加载到物理内存
  │  （比如物理地址 0x40080000）
  │
  ▼  跳到内核入口（head.S）
  │  此时 MMU 还没开，用的是物理地址
  │
  ▼  head.S 建一个临时的小页表，开启 MMU
  │  现在 CPU 用虚拟地址了，但页表很小
  │
  ▼  start_kernel() → setup_arch() → paging_init()
  │  建立完整页表，全量物理内存都有虚拟地址了
  │
  ▼  内核继续初始化...
```

KernelPatch 就是在这个时间线里巧妙地插入了自己的代码。

* * *

## 阶段 0：kptools 打补丁（刷入前）

kptools 是跑在电脑上的用户态工具，它的工作是：

1.  编译出 kpimg——一个独立的裸机二进制 blob
2.  分析原始内核 Image，找到所有需要的函数偏移
3.  把这些偏移填到 kpimg 里的 `setup_preset` 结构体
4.  把 kpimg 嵌入到内核镜像的某个偏移处
5.  把内核入口指令改成跳转到 `setup_entry`

### kpimg 的结构

kpimg 是 KernelPatch 自己编译出来的独立二进制，链接脚本 `kpimg.lds` 定义了它的布局：

```python
_link_base = 0xD000（虚拟链接基址）

┌──────────────────────────┐ _link_base
│ .setup.data（4K）        │ ← setup_header (64B) + setup_preset + stack (2KB)
├──────────────────────────┤
│ .setup.text              │ ← setup_entry, setup, map_prepare, start_prepare
├──────────────────────────┤ ALIGN(16)
│ .setup.map (< 0xa00 B)   │ ← _paging_init, map_data, get_myva 等
├──────────────────────────┤ ALIGN(64K)
│ _kp_start                │
│ .kp.text                 │ ← start(), hook 跳板, patch 代码, 所有 .rodata
├──────────────────────────┤ ALIGN(64K)
│ .kp.data                 │ ← start_preset, 全局变量, .bss, 符号表
├──────────────────────────┤ ALIGN(64K)
│ _kp_end                  │
├──────────────────────────┤
│ extra data               │ ← KPM 模块等附加数据（不在链接脚本内）
└──────────────────────────┘
```

关键点： **\_link\_base 之前的区域** （ `setup.xxx` 和 `setup.map` ）只在开机最早期临时使用，之后就没用了。 **\_kp\_start 之后的区域** 是 KP 的核心代码和数据，会被搬家到一个更安全的地方长期驻留。

### setup\_preset——kptools 和 setup1.S 之间的通信协议

`setup_preset` 是一个很大的结构体，定义在 `preset.h` 里：

```c
typedef struct _setup_preset_t {
    version_t kernel_version;           // 目标内核版本
    int64_t kimg_size;                  // 内核镜像大小
    int64_t kpimg_size;                 // kpimg 总大小
    int64_t kernel_size;                // 内核代码段大小
    int64_t page_shift;                 // 页大小（12=4K, 14=16K, 16=64K）
    int64_t setup_offset;               // kpimg 被塞在内核镜像的哪个偏移
    int64_t start_offset;               // KP 核心代码要搬到哪
    int64_t extra_size;                 // 附加数据大小
    int64_t map_offset;                 // map 代码要搬到哪
    int64_t kallsyms_lookup_name_offset; // kallsyms_lookup_name 的函数偏移
    int64_t paging_init_offset;         // paging_init 的函数偏移
    int64_t printk_offset;             // printk 的函数偏移
    int64_t sprintf_offset;            // sprintf 的函数偏移
    int64_t symbol_lookup_anchor_offset; // 符号查找锚点偏移
    map_symbol_t map_symbol;            // memblock 系列函数的偏移
    uint8_t header_backup[8];          // 原始内核入口的 8 字节备份
    uint8_t superkey[64];             // 超级密钥
    uint8_t root_superkey[32];        // root 密钥 hash
    patch_config_t patch_config;       // 预设的符号地址表
    // ...
} setup_preset_t;
```

kptools 编译好 kpimg 后（此时 `setup_preset` 全是 0），分析目标内核找到所有偏移，直接 **修改 kpimg 二进制文件里对应字段** ，填好数据后一起塞进内核镜像。

`setup_preset` 编译时放在 kpimg 的 `.setup.preset` section 里，位置是固定的。kptools 知道它相对 kpimg 开头的偏移，所以可以直接定位修改。

* * *

## 阶段 1：setup\_entry → setup → start\_prepare & map\_prepare（物理地址阶段）

修补后的内核镜像被引导加载器加载到物理内存。内核入口的第一条指令已经被改成跳到 `setup_entry` ，所以 CPU 上来就执行它。

### setup\_entry

```cpp
setup_entry:
    mov x9, sp                    // 保存引导加载器给的原始 sp
    adrp x11, stack               // 加载 KP 自己的栈地址
    add x11, x11, :lo12:stack
    add x11, x11, STACK_SIZE      // 栈顶 = stack + 2KB
    mov sp, x11                    // 切换到 KP 的栈
    stp x9, x10, [sp, -16]!       // 把原始 sp 压栈（后面恢复用）
    b setup                        // 跳到 setup
```

这里干的事情很简单：把引导加载器传进来的 `x0-x3` （FDT 地址等参数）保留在寄存器里， **切换到 KP 自己的栈** （因为这时还没有操作系统，没有栈分配器，KP 自己在 `.setup.data` 里预留了一块 `char stack[0x800]` ），然后跳到 `setup` 。

> **`:lo12:` 是什么？** ARM64 的地址是 64 位，没办法一条指令加载。所以拆成两步：
> 
> ```
> adrp x11, stack           // 加载 stack 所在的 4K 页的页地址（PC 相对）
> add x11, x11, :lo12:stack // 加上页内偏移（低 12 位）
> ```
> 
> `adrp` 是 PC 相对寻址，算出来的是代码实际被加载到哪个物理地址，而不是链接时的虚拟地址。所以只要 kpimg 内部相对位置不变（整体是一块搬来的）， `adrp + :lo12:` 就能算出正确的物理地址。

### setup

```asm
adrp x11, stack           // 加载 stack 所在的 4K 页的页地址（PC 相对）
add x11, x11, :lo12:stack // 加上页内偏移（低 12 位）
```

这一步是最核心的地址计算。 `_link_base` 是 kpimg 的起始位置（链接脚本写死 `0xD000` ），kpimg 被塞在距离内核开头 `setup_offset` 的地方。所以：

```asm
setup:
    // 把所有寄存器压栈（相当于做一个完整的现场保存）
    stp x29, x30, [sp, -16]!
    stp x0, x1, [sp, -16]!
    stp x2, x3, [sp, -16]!
    // ... 共 24 条 stp，保存了几乎所有寄存器

    // 计算 kernel_pa（内核物理基址）
    adrp x9, _link_base
    add x9, x9, :lo12:_link_base       // x9 = _link_base 的当前物理地址
    adrp x10, setup_preset
    add x10, x10, :lo12:setup_preset    // x10 = setup_preset 的当前物理地址
    ldr x11, [x10, #setup_setup_offset_offset]  // x11 = setup_offset
    sub x19, x9, x11                           // x19 = kernel_pa
```

举个例子：内核被引导加载器加载到物理地址 `0x40080000` ，kpimg 被塞在偏移 `0x00F80000` 处，那么 `_link_base` 的物理地址就是 `0x40F80000 + 0xD000 = 0x40F8D000` 。减掉 `0x00F80000` ，就得到 `kernel_pa = 0x40080000` 。

有了 `kernel_pa` ，后面所有需要定位内核内部函数的地方，统一用 **kernel\_pa + 偏移量** 来算出物理地址。

接着：

```python
kernel_pa = _link_base 的物理地址 - setup_offset
```

做完这一切后，setup 让 CPU 跳回内核原始入口，内核从自己正常的入口开始初始化——它完全不知道刚才有人来过了。

### start\_prepare：搬运 KP 核心代码

`start_prepare` 的核心任务： **把 `_kp_start` 之后的 KP 核心代码搬运到内核镜像内部的一个位置，同时把参数从 `setup_preset` 拷贝到 `start_preset`** 。

为什么要拷贝而不直接用 `setup_preset` ？因为 `setup_preset` 在 kpimg 的 setup 段里，这一段只是临时存在的（入口恢复后就没有意义了）。 `start_preset` 在 `.start.data` 段里，会跟着 KP 核心代码一起搬到最终目的地，长期存活。

逐段来看：

```asm
    mov x0, x19           // 参数：kernel_pa
    bl start_prepare       // 阶段 1a：准备参数，搬运 KP 核心代码
    mov x0, x19
    bl map_prepare         // 阶段 1b：hook paging_init，搬运 map 代码

    // 恢复内核入口原始指令（把备份的 8 字节写回去）
    mov x0, x19
    add x1, x20, #setup_header_backup_offset
    mov x2, #8
    bl memcpy8

    // 刷 I-cache（CPU 对指令的缓存），确保 CPU 看到刚恢复的指令
    dsb ish
    ic iallu
    dsb ish
    isb

    // 恢复所有寄存器，跳回内核入口
    mov x16, x19
    // ... 24 条 ldp 恢复所有寄存器 ...
    br x16        // 跳到 kernel_pa，内核正常启动
```

**第一步：逐字段拷贝参数**

```asm
start_prepare:
    // 保存寄存器
    stp x29, x30, [sp, -16]!
    stp x19, x20, [sp, -16]!
    stp x21, x22, [sp, -16]!
    stp x23, x24, [sp, -16]!
    mov x19, x0          // x19 = kernel_pa

    // 加载 4 个关键地址
    adrp x9, map_data          // x9  = map_data（map.c 用的控制块）
    add x9, x9, :lo12:map_data
    adrp x10, setup_preset     // x10 = setup_preset（源数据，kptools 填好的）
    add x10, x10, :lo12:setup_preset
    adrp x11, start_preset     // x11 = start_preset（目标数据，要搬过来的）
    add x11, x11, :lo12:start_preset
    adrp x12, header           // x12 = KP header
    add x12, x12, :lo12:header
```

为什么不用循环而是手写这么多 `ldr/str` ？因为在汇编里写循环反而麻烦，而且不是所有字段都需要拷贝（比如 `paging_init_offset` ，start.c 用不到）。手写虽然啰嗦，但清晰可控。

**第二步：拷贝大块数据**

```asm
    // 把 setup_preset 里的参数一个一个拷贝到 start_preset
    ldr w13, [x10, #setup_kernel_version_offset]
    str w13, [x11, #start_kernel_version_offset]

    ldr x13, [x10, #setup_kallsyms_lookup_name_offset_offset]
    str x13, [x11, #start_kallsyms_lookup_name_offset_offset]

    ldr x13, [x10, #setup_kernel_size_offset]
    str x13, [x11, #start_kernel_size_offset]

    ldr x13, [x10, #setup_start_offset_offset]
    str x13, [x11, #start_start_offset_offset]
    mov x21, x13                      // x21 = start_offset（后面搬家用）

    ldr x13, [x10, #setup_extra_size_offset]
    str x13, [x11, #start_extra_size_offset]

    str x19, [x11, #start_kernel_pa_offset]  // kernel_pa（自己算的，不是从 preset 读的）

    ldr x13, [x10, #setup_map_offset_offset]
    str x13, [x11, #start_map_offset_offset]
    mov x20, x13                      // x20 = map_offset（后面备份用）

    // sprintf_offset, symbol_lookup_anchor_offset 同理...
```

字段太大不能用一条 `ldr/str` 搞定的，就调 `memcpy8` ——KP 自己在文件开头写的逐字节拷贝函数（因为此时没有 libc 可用）。

**第三步：备份 map 区域**

```asm
    // 拷贝 KP header（64 字节）
    add x0, x11, #start_header_offset
    add x1, x12, #0
    mov x2, #KP_HEADER_SIZE
    bl memcpy8

    // 拷贝 superkey（64 字节）
    add x0, x11, #start_superkey_offset
    add x1, x10, #setup_superkey_offset
    mov x2, #SUPER_KEY_LEN
    bl memcpy8

    // 拷贝 root_superkey hash（32 字节）
    ...

    // 拷贝 patch_config（512 字节）
    ...
```

因为 `map_prepare` 马上会把 KP 的 map 代码覆盖写到 `kernel_pa + map_offset` 这个位置。这里先把那里的 **原始内核数据** 存起来，KP 初始化完成后由 `restore_map()` （在 start.c 里）写回去，消除痕迹。

**第四步：计算核心代码大小**

```asm
    // 计算 map 区域大小 = _map_end - _map_start
    adrp x13, _map_end
    add x13, x13, :lo12:_map_end
    adrp x14, _map_start
    add x14, x14, :lo12:_map_start
    sub x2, x13, x14

    // 存大小
    str x2, [x11, #start_map_backup_len_offset]

    // 把 kernel_pa + map_offset 处的原始数据备份到 start_preset.map_backup
    add x0, x11, #start_map_backup_offset
    add x1, x19, x20    // src = kernel_pa + map_offset
    bl memcpy8
```

`kpimg_size` 是整个 kpimg blob 的大小。 `_kp_start - _link_base` 是 setup 段 + map 段的大小。一减，就是核心代码（`.kp.text` + `.kp.data` ）的大小。后面 `_paging_init` 只搬这部分。

**第五步：搬运核心代码**

```asm
    // start_img_size = kpimg_size - (_kp_start - _link_base)
    ldr x22, [x10, #setup_kpimg_size_offset]  // 整个 kpimg 大小
    adrp x23, _kp_start
    add x23, x23, :lo12:_kp_start
    adrp x24, _link_base
    add x24, x24, :lo12:_link_base
    sub x23, x23, x24                          // _kp_start - _link_base（setup+map 部分）
    sub x22, x22, x23                          // x22 = 核心代码大小

    // 存到 map_data（_paging_init 阶段需要知道要搬多大）
    str x22, [x9, #map_start_img_size_offset]
```

用 `rmemcpy32` （反向 32 位拷贝）而不是正向的 `memcpy8` ，是因为 src 和 dst 可能有重叠—— `start_offset` 可能指向 kpimg 内部附近的位置，正向拷贝有可能把还没读的数据覆盖掉。反向拷贝从末尾开始，不存在这个问题。

画个图总结 `start_prepare` 做了什么：

```asm
    // 把 _kp_start 开始的代码拷贝到 kernel_pa + start_offset
    add x0, x19, x21                 // dst = kernel_pa + start_offset
    adrp x1, _kp_start
    add x1, x1, :lo12:_kp_start      // src = _kp_start（当前位置）
    ldr x2, [x10, #setup_extra_size_offset]
    add x2, x2, x22                   // len = start_img_size + extra_size
    bl rmemcpy32                       // 反向拷贝（从末尾开始）
```

核心代码在同一个内核镜像里有了两份：一份在 kpimg 原始位置，一份在新位置。后面 `_paging_init` 会把新位置的那份搬到 malloc 分配的新内存里。

### map\_prepare：hook paging\_init

`map_prepare` 的核心任务： **修改 `paging_init` 函数的第一条指令，让它跳到 KP 的 `_paging_init`** 。

```python
原状：
    内核镜像 │.......│  setup  │  map  │kp核心代码│ 原始内核数据  │
              kernel_pa    ↑        ↑       ↑          ↑
                       kpimg 被塞在这里    _kp_start   kernel_pa+start_offset
                                                  （这块原始数据要被覆盖）

搬运后：
    内核镜像 │.......│  setup  │  map  │kp核心代码│kp核心代码（备份）│extra│
              kernel_pa    ↑        ↑       ↑          ↑
                       kpimg 在这里    _kp_start   kernel_pa+start_offset
```

`paging_init_offset` 是 kptools 在修补时分析内核二进制找到的，存进 `setup_preset` 。这里读出来， `x15` 就拿到了 paging\_init 相对于内核基址的偏移量。

然后是核心的 hook 操作：

```asm
map_prepare:
    stp x29, x30, [sp, -16]!
    stp x19, x20, [sp, -16]!
    mov x19, x0                 // x19 = kernel_pa

    // 加载关键地址
    adrp x9, map_data
    add x9, x9, :lo12:map_data
    adrp x10, setup_preset
    add x10, x10, :lo12:setup_preset

    // 存 kernel_pa 到 map_data
    str x19, [x9, #map_kernel_pa_offset]

    // 获取 paging_init_offset，存到 map_data 和 x15
    ldr x11, [x10, #setup_paging_init_offset_offset]
    str x11, [x9, #map_paging_init_relo_offset]
    mov x15, x11                // x15 = paging_init_offset
```

等于读出 paging\_init 在物理内存里的第一条指令。比如读到 `0xD503201F` （ `PACIBSP` ）或别的什么。

**处理 PAC/BTI 指令：**

```asm
    // paging_init_pa = paging_init_offset + kernel_pa
    add x13, x15, x19           // x13 = paging_init 在当前物理内存中的地址

    // 备份 paging_init 的第一条指令（4 字节）
    ldr w12, [x13]
```

PAC（Pointer Authentication）是 ARMv8.3 引入的安全特性，用 `PACIASP` 和 `AUTIASP` 对一个函数的返回地址签名/验签。KP 要在这个位置插入跳转，这两个指令碍事（因为它们会修改 `x30/lr` 寄存器），所以换成 NOP。

然后 **写入跳转指令** ：

```asm
    // 构造一个 NOP 指令和一个比较用的 mask
    mov w3, #0x201F
    movk w3, #0xD503, lsl#16   // w3 = 0xD503201F（NOP 指令）
    orr w1, w3, #0x100         // w1 = 0xD503211F（PACIASP 指令）
    mov w2, #0xFFFFFD1F        // w2 = mask，屏蔽 bit5 和 bit8

    and w0, w12, w2            // 读到的指令 & mask
    cmp w0, w1                 // == PACIASP？(bit5+bit8 被 mask 掉了)
    b.ne .backup               // 不是 PAC，直接跳到备份

    // 是 PACIASP 指令，用 NOP 替换它（我们不需要做 PAC 签名）
    mov w12, w3                // w12 = NOP

    // 往前找跟在后面的 AUTIASP 指令，也换成 NOP
    add x11, x13, #4
.cmp_auti:
    ldr w0, [x11], #4
    and w0, w0, w2
    cmp w0, w1                 // 找到 AUTIASP？
    b.ne .cmp_auti              // 不是就继续找
    stur w3, [x11, #-4]        // 把 AUTIASP 也换成 NOP

.backup:
    str w12, [x9, #map_paging_init_backup_offset]  // 存备份
    dsb ish
```

这就是 hook 的关键： **往 paging\_init 的第一条指令位置写了一条 `B _paging_init` 指令** 。从此内核调用 `paging_init()` 时，CPU 执行的第一条指令就会跳到 KP 的代码。

注意这里用了 `adrp + add` 两次后一减的技巧：两个 `adrp` 算出来的都是物理地址，相减后绝对地址互相抵消，得到的是链接时常量 `_paging_init - _map_start` 。这个偏移加上 `map_offset` ，就是 map 代码被搬进内核镜像后 `_paging_init` 在内核中的新偏移。然后用这个偏移构造 B 指令——B 指令用的是 PC 相对偏移，和绝对地址无关，所以这段汇编正确性不依赖任何运行时状态，只依赖链接时算好的相对偏移。

**最后搬运 map 代码** ：

```asm
    // 计算 _paging_init 在目标位置（kernel_pa + map_offset）的偏移
    adrp x11, _paging_init
    add x11, x11, :lo12:_paging_init   // x11 = _paging_init 当前地址
    adrp x12, _map_start
    add x12, x12, :lo12:_map_start      // x12 = _map_start 当前地址
    sub x11, x11, x12                    // x11 = _paging_init 在 map 段内的偏移
    add x11, x11, x14                    // x11 = map_offset + 段内偏移
                                         //    = _paging_init 在目标内核中的偏移

    // 构造 ARM64 B 指令（无条件跳转）
    // B 指令格式：0x14000000 | ((offset >> 2) & 0x03FFFFFF)
    sub x15, x11, x15        // 跳转距离 = 目标偏移 - paging_init 偏移
    ubfx w15, w15, #2, #26   // 右移 2 位，取低 26 位
    mov w12, #0x14000000
    orr w15, w15, w12        // 组合成完整 B 指令
    str w15, [x13]            // 写入 paging_init 入口！
```

Map 代码必须搬过去，因为 `_paging_init` 里会调内核函数，必须在内核的虚拟地址空间里才能正常工作。

* * *

## 阶段 2：\_paging\_init（map.c，内核初始化早期）

CPU 跳到内核入口，内核开始正常初始化。走到 `start_kernel() → setup_arch() → paging_init()` 的时候，命中了那条 B 指令，跳进 KP 的 `_paging_init` 。

`_paging_init` 要完成的任务是： **等内核建好页表后，给 KP 分配一块干净的独立内存，把核心代码搬过去，然后调到 start()** 。

```asm
    // 把 map 代码拷贝到 kernel_pa + map_offset
    adrp x2, _map_end
    add x2, x2, :lo12:_map_end
    adrp x1, _map_start
    add x1, x1, :lo12:_map_start
    sub x2, x2, x1                      // x2 = map 段大小
    add x0, x19, x14                     // dst = kernel_pa + map_offset
    bl memcpy8

    dsb ish
    ret
```

### mem\_proc：做地址重定位

```c
void _paging_init() {
    map_data_t buf;
    map_data_t *data = &buf;
    mem_proc(data);  // 解析 MMU 参数
```

这里 `get_data()` 能工作是因为 map\_data 紧挨着 \_paging\_init 的代码，可以通过 `adr` 相对寻址拿到自己所在的地址，然后偏移回去。

关键操作： **把 kptools 填的函数偏移 + kernel\_va = 真实的函数虚拟地址** 。比如 `paging_init_offset = 0x1234000` ， `kernel_va = 0xFFFF000040080000` ，那么 `paging_init_relo = 0xFFFF000041A40000` ，就是一个可以直接 `((func_ptr)addr)()` 调用的函数指针了。

### 核心流程

```c
static void mem_proc(map_data_t *data) {
    *data = *get_data();           // 把 map_data 从全局区拷到栈上
    uint64_t kernel_va = get_kva();

    // 计算 kimage_voffset（内核虚拟地址 - 物理地址）
    data->kimage_voffset = kernel_va - data->kernel_pa;

    // 把 memblock 等函数指针从偏移量重定位为真实地址
    data->paging_init_relo += kernel_va;
    data->map_symbol.memblock_reserve_relo += kernel_va;
    data->map_symbol.memblock_free_relo += kernel_va;
    data->map_symbol.memblock_phys_alloc_relo += kernel_va;
    // ...

    // 读 TCR_EL1 寄存器解析页表参数
    uint64_t tcr_el1;
    asm volatile("mrs %0, tcr_el1" : "=r"(tcr_el1));
    // 解析 T1SZ（虚拟地址位数）、TG1（页粒度：4K/16K/64K）
    data->va1_bits = 64 - t1sz;
    data->page_shift = 12/14/16;

    // 通过 memblock 检测 linear map 和 physic 的偏移
    uint64_t detect_phys = memblock_phys_alloc(0, 0x10, NUMA_NO_NODE);
    uint64_t detect_virt = memblock_virt_alloc(0, 0x10, detect_phys, detect_phys, NUMA_NO_NODE);
    data->linear_voffset = detect_virt - detect_phys;
}
```

这张图更直观：

```c
    uint64_t page_size = 1 << data->page_shift;

    // 1. 保留旧的 start 区域（防止 memblock 把它分配出去）
    uint64_t old_start_pa = data->start_offset + data->kernel_pa;
    memblock_reserve(old_start_pa, reserve_size);

    // 2. 分配新物理内存 = start + extra + hook + rox + rw
    uint64_t start_pa = map_phys_alloc(data, all_size, page_size);
    memblock_mark_nomap(start_pa, all_size);  // 标注不要映射到线性区

    // 3. 恢复 paging_init 原始指令，调用真正的 paging_init()
    *(uint32_t *)(paging_init_va) = data->paging_init_backup;
    flush_icache_all();
    ((paging_init_f)(paging_init_va))();

    // 4. 页表已完全建立，为新分配的内存创建映射
    for (off = 0; off < all_size; off += page_size) {
        get_or_create_pte(data, start_va + off, start_pa + off, attr_indx);
    }

    // 5. 清除 WXN（Writeable XOR eXecutable Never），否则后面没法设置 RWX 内存
    sctlr_el1 &= ~(1 << 19);
    asm volatile("msr sctlr_el1, %0" : : "r"(sctlr_el1));

    // 6. 把 start image + extra 从旧位置搬到新内存
    for (i = 0; i < start_img_size; i += 8)
        *(uint64_t *)(start_va + i) = *(uint64_t *)(old_start_va + i);
    for (i = 0; i < extra_size; i += 8)
        *(uint64_t *)(start_va + data->start_size + i) =
            *(uint64_t *)(old_start_va + start_img_size + i);

    // 7. 释放旧位置内存，flush cache
    memblock_free(old_start_pa, reserve_size);
    flush_icache_all();

    // 8. 调用 start()！
    ((start_f)start_va)(data->kimage_voffset, data->linear_voffset);
}
```

注意第 3 步的时序： **先恢复 paging\_init 第一条指令，再调 paging\_init** 。这样 paging\_init 跑完后就没有任何 hook 痕迹了，后续代码再来看 paging\_init 的代码，看到的就是原始指令。

* * *

## 阶段 3：start（start.c，正式初始化）

`_paging_init` 最后通过函数指针调用 `start()` ，把控制权交给了 KP 的 C 代码入口：

```python
操作前（物理内存）：              操作后（新分配的物理内存）：

┌──────────────┐ kernel_pa        ┌──────────────┐ kernel_pa
│ 原始内核      │                  │ 原始内核       │
│              │                  │              │
│              │                  │              │
├──────────────┤ old_start_pa     │              │
│ KP核心代码    │ ← 从这里读         │              │
│ start_img    │                  │              │
│ extra data   │                  │              │
└──────────────┘                  ├──────────────┤ start_pa（新分配的）
                                  │ KP核心代码    │ ← 搬到这里
                                  │ extra data   │
                                  │ HOOK_ALLOC   │
                                  │ MEMORY_ROX   │
                                  │ MEMORY_RW    │
                                  └──────────────┘
```

### start\_init：获取所有内核函数地址

这是最关键的一步——通过 `kallsyms_lookup_name` 获取内核中所有需要的函数地址：

```c
int start(uint64_t kimage_voff, uint64_t linear_voff) {
    start_init(kimage_voff, linear_voff);  // 基础初始化，解析 kallsyms
    prot_myself();                          // 设置自身页表权限（text=RX, data=RW, hook=RWX）
    restore_map();                          // 恢复被 hook 的 map 区域
    log_regs();                             // dump CPU 寄存器信息（调试用）
    predata_init();                         // 初始化预设数据
    symbol_init();                          // 符号系统初始化
    patch();                                // 安装各种内核 hook
}
```

`kallsyms_lookup_name` 是内核里按函数名查找地址的函数。拿到了它，KP 就能在运行时找到任意内核函数的地址。这是整个 KP 体系的基础。

### prot\_myself：设置内存权限

```c
static int start_init(uint64_t kimage_voff, uint64_t linear_voff) {
    // 从 start_preset 拿参数
    kernel_pa = start_preset.kernel_pa;
    kernel_va = kimage_voff + kernel_pa;  // 计算内核虚拟基址
    kernel_size = start_preset.kernel_size;

    // 解析 kallsyms_lookup_name 的地址（优先用 symbol_lookup_anchor 方法，
    // 不行就用 kptools 预设的偏移量）
    kallsym_offset = resolve_kallsyms_lookup_name_by_symbol_lookup_anchor();
    if (!kallsym_offset) kallsym_offset = start_preset.kallsyms_lookup_name_offset;

    // 内核函数地址 = kernel_va + 偏移
    kallsyms_lookup_name = (typeof(kallsyms_lookup_name))(kernel_va + kallsym_offset);

    // 拿到了 kallsyms_lookup_name，就可以查找任意内核符号！
    kernel_stext_va = kallsyms_lookup_name("_stext");
    printk     = (typeof(printk))kallsyms_lookup_name("printk");
    vsnprintf  = (typeof(vsnprintf))kallsyms_lookup_name("vsnprintf");
    kallsyms_on_each_symbol = kallsyms_lookup_name("kallsyms_on_each_symbol");
    // ... 等等

    // 读 TCR_EL1 解析页表参数（页粒度、虚拟地址位数等）
    // 读 TTBR1_EL1 获取内核页表基址
}
```

通过直接操作页表项（PTE），KP 给自己的内存设置了和内核其他区域一样的访问权限，同时预留了 hook 跳板需要的 RWX 区域。

### restore\_map：擦除脚印

```c
static void prot_myself() {
    // text 段 → RX（可读可执行，不可写）
    for (i = _kp_text_start; i < _kp_text_end; i += page_size) {
        pte = pgtable_entry_kernel(i);
        *pte = (*pte | PTE_SHARED) & ~PTE_PXN;  // 清除 PXN，允许执行
        if (has_vmalloc_area()) *pte = (*pte | PTE_RDONLY) & ~PTE_DBM;
    }

    // data 段 → RW（可读可写，不可执行）
    for (i = _kp_data_start; i < _kp_data_end; i += page_size) {
        pte = pgtable_entry_kernel(i);
        *pte = (*pte | PTE_DBM | PTE_SHARED) & ~PTE_RDONLY;
        if (has_vmalloc_area()) *pte |= PTE_PXN;  // 设置 PXN，禁止执行
    }

    // hook 区域 → RWX（可读可写可执行，给 hook 跳板用）
    // ROX 内存 → RX
    // RW 内存 → RW
    // 并注册到 tlsf 内存分配器

    // 注册到内核 vmalloc 区域（让内核知道这块内存在用）
    vm_area_add_early(&kp_vm);
}
```

`map_offset` 那块区域之前被 map\_prepare 写入了 KP 的 map 代码。现在工作完成了，把备份的原始数据写回去， **内核完全看不出这里被动过** 。

* * *

## 完整流程图

```c
static void restore_map() {
    uint64_t start = kernel_va + start_preset.map_offset;
    // 把 map_backup 里备份的原始数据写回 map_offset 位置
    for (i = start; i < end; i += page_size) {
        pte = pgtable_entry_kernel(i);
        *pte |= PTE_DBM;  // 临时允许写入
        flush_tlb_kernel_page(i);
        memcpy((void *)i, map_backup, page_size);
        *pte = orig;      // 恢复原权限
    }
    flush_icache_all();
}
```

* * *

## 总结

KernelPatch 的入口修补方案有几个精妙的设计：

1.  **时机选择** ：在 MMU 开之前做最少的事（搬数据 + 改一条指令），等页表建好才做复杂初始化。太早没有 memblock 分配器，太晚有安全机制（CFI、SELinux）干扰。
    
2.  **adrp 自定位** ：利用 ARM64 的 `adrp` PC 相对寻址来获知自己的物理加载地址，不依赖任何绝对地址，这也是 "position-independent" 思想。
    
3.  **插队而非替换** ：hook paging\_init 只改一条指令 → 进来后第一件事就是恢复原始指令 → 然后调用真正的 paging\_init → 完全不受影响。是"插队"而不是"替换"。
    
4.  **数据传递** ： `setup_preset` 是 kptools（用户态修补工具）和 setup1.S（开机最早期汇编）之间的通信协议。编译时全零，修补时填入偏移，开机时读出使用。 `start_preset` 是从 setup\_preset 拷贝过来的，跟着 KP 核心代码一起搬家，在 start.c 阶段读取。
    
5.  **痕迹清理** ：入口指令被恢复、paging\_init 指令被恢复、map 区域数据被恢复——内核完全不知道刚才发生了什么。
