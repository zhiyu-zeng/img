---
title: 【看雪】【硬核实战】无内核源码攻破 Android 14 现代生产内核：纯二进制 LKM 绕过 Clang-CFI 与 ARM64 3级只读页表实录
source: https://bbs.kanxue.com/thread-293636.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-24T10:10:30+08:00
trace_id: e5372f37-13c9-4c04-9923-0fea7e1735d3
content_hash: 0d0f556d98435741ab6ef8ee5b19287445dc434fa7e31a66304098d2c0a15ee5
status: synced
tags:
  - 看雪
  - Android逆向
  - 内核
series: null
feed_source: 看雪·Android安全
ai_summary: 仅凭原厂运行中的厂配 `.ko` 提取 CRC 与相对偏移，构造一个零外部符号导入的自包含 LKM，在 Android 14 生产内核上绕过 CFI 与只读页表并完成系统调用拦截。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42275244-d011-81d0-b849-e437c3ee0ec7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 仅凭原厂运行中的厂配 `.ko` 提取 CRC 与相对偏移，构造一个零外部符号导入的自包含 LKM，在 Android 14 生产内核上绕过 CFI 与只读页表并完成系统调用拦截。
> 
> - **绕过 MODVERSIONS：** 解析 `/vendor/lib/modules/` 下官方驱动 ELF 的 `__versions`、`.modinfo` 节提取真实 CRC，手写 `shield.mod.c` 的 `modversion_info` 数组，免去原厂构建树依赖。
> - **KASLR 解算：** 模块坚持“零未导出外部导入符号”，内部自实现字符串、内存等例程；以 `sys_call_table` 等作为锚点，用固定相对偏移（如 `0x1a64c00`）一次解出全内核符号。
> - **绕过 CFI：** Clang 前向边 CFI 会在间接跳转前校验目标函数的签名，模块 vmalloc 区函数不在跳表即触发 `Kernel CFI violation` 直接 Panic；解法是汇编构造 `.cfi_jt` 对齐桩、配 `module.lds` 与 `-fno-pic/-fno-pie` 使跳转自闭环。
> - **改写只读页表：** 内核未导出 `set_memory_rw()`，故自写三级页表（PGD、PMD、PTE，shift 30/21/12）漫游器，区分 2MB 大页与 4KB 页，翻转 `PTE_RDONLY(bit7)`、`PTE_WRITE(bit51)`，收尾用 `dsb ishst; tlbi vmalle1is` 刷 TLB。
> - **热补丁与实测：** 采用“解除 2 页只读→批量替换 13 个 syscall→立即恢复只读”的原子闭环；MT6877 真机上初始化耗时 11 微秒，Momo 4.4.1、Hunter 6.69、Ruru 1.1.1 全部 0 检出（cmdline 伪装 green、TracerPid 恒 0、路径隐藏、录音静音）。

**作者**：哈吉米  
**适用平台**：看雪安全论坛（移动安全 / 内核安全版块）、FreeBuf 原创专栏、微信公众号  
**测试环境**：Redmi Note 12 Pro+ (rubypro) / MT6877 天玑 900 / Android 14 (HyperOS 1.0) / 内核 Linux 4.19.191 aarch64 (开启 Clang CFI、KASLR、Strict MMU PTE Protection)

* * *

## 0x00 前言

在现代移动安全领域，Android 14 引入的内核加固体系已经演进得极为严密。特别是在主流 OEM 厂商（如小米、OV）的商业生产级固件上，内核面临着多重铜墙铁壁般的安全防线：  
1\. **编译器级防护**：全面开启 Clang Forward-Edge CFI（ `CONFIG_CFI_CLANG=y` ），任何不符合跳表签名的函数间接跳转，CPU 会立即触发 `Kernel CFI violation` 导致设备直接 Panic 重启；  
2\. **硬件内存隔离**：基于 ARM64 MMU 的严格只读属性映射，关键内核结构（包括 `sys_call_table` ）所在的页被打上硬件级 `PTE_RDONLY` ，且内核严禁导出 `set_memory_rw()` 等修改接口；  
3\. **加载链完整性**：开启 `CONFIG_MODVERSIONS=y` ，非官方构建树产出的 LKM 驱动会被 CRC 校验机制无情拦截（ `disagrees about version of symbol` ）；  
4\. **动态基址防御**：KASLR 导致静态硬编码地址完全失效。

市面上绝大多数开源 Root 方案（如 KernelSU、APatch 等）均高度依赖 **“获取官方源码树重新编译 boot.img”**。而在缺少芯片原厂私有内核构建树、不可随意替换整机内核的环境下， **如何以纯原生外部 LKM（Loadable Kernel Module）为载体，在零源码条件下无缝攻破 Clang CFI 与硬件只读页表，并实现毫秒级（实测仅 11 微秒）系统调用拦截与硬件隐私防护？**

本文将完整复盘这一攻坚全链路的工程实现。

* * *

## 0x01 第一道坎：逆向提取闭源驱动，突破 CONFIG_MODVERSIONS

由于我们没有手机出厂时的完整内核源码环境，如果直接拉取 AOSP 4.19 编译 `.ko` ，在 `insmod` 时系统会直接抛出：

```
insmod: failed to load shield.ko: Exec format error
dmesg: shield: disagrees about version of symbol module_layout
```

### 1\. 深入 CONFIG_MODVERSIONS 的底层机制

Linux 在编译模块时， `genksyms` 会为每个导出的符号（如 `printk` 、 `module_layout` 等）计算一个 32 位的 CRC 校验码，并保存在目标内核的二进制符号表中。当第三方模块加载时，内核的 `check_version()` 会逐一比对模块 `.mod.c` 中的 CRC 数组。

### 2\. 逆向提取运行态 CRC

既然目标设备已经加载了原厂的硬件驱动（如 `/vendor/lib/modules/` 下的 `conninfra.ko` 、 `wlan_drv_gen4m.ko` ），其 ELF 文件中必然已经固化了与当前运行内核完全匹配的 CRC 字典。

我们编写脚本解析目标模块的 ELF Sections，提取 `.modinfo` 与 `__versions` 节：

```
# 提取官方运行模块中的真实 CRC
def extract_modversions(ko_path):
    # 解析 ELF 结构并抽取 symbol_name 与 crc 映射
    ...
    # 输出准确的 CRC 哈希字典
```

利用提取出的官方 CRC，我们手工生成了专属于目标内核的 `shield.mod.c` ：

```cpp
#include <linux/module.h>
#include <linux/compiler.h>

MODULE_INFO(name, KBUILD_MODNAME);

__visible struct module __this_module
__section(".gnu.linkonce.this_module") = {
    .name = KBUILD_MODNAME,
    .init = init_module,
#ifdef CONFIG_MODULE_UNLOAD
    .exit = cleanup_module,
#endif
    .arch = { },
};

static const struct modversion_info ____versions[]
__used __section("__versions") = {
    { 0xb62653fe, "module_layout" },
    { 0x27e1a049, "printk" },
    { 0x1fdc7df2, "_mcount" },
};
```

通过这种方式，我们彻底绕过了对原厂完整构建树的依赖。

* * *

## 0x02 第二道坎：零外部符号导入与 KASLR 动态锚定

在受保护的生产内核中，许多关键符号（例如 `sys_call_table` 、 `swapper_pg_dir` 、 `memstart_addr` ）根本没有被 `EXPORT_SYMBOL` 。如果模块的代码中包含对这些符号的外部未解析重定位项（Relocation），内核动态加载器会直接拒绝链接。

### 核心解法：自包含与相对偏移锚定

我们对 `shield.ko` 实施了 **“零未导出外部导入符号（Zero External Imports）”** 的极致原则：  
1\. 模块内部所有内存操作、字符串比较、格式转换全部内联自实现（如 `my_strcmp` 、自定义位运算操作）；  
2\. 动态基址解算：  
通过已知的系统调用表入口或导出函数作为锚点，根据静态反汇编分析得出的相对偏移，动态推导整个内核空间的基址：

```cpp
/* 目标内核 MTK 4.19 的固定相对偏移常数 */
#define OFFSET_SYS_CALL_TABLE      0x1a64c00UL
#define OFFSET_SWAPPER_PG_DIR      0x2b7e000UL
#define OFFSET_MEMSTART_ADDR       0x1fc1210UL
#define OFFSET_STRNCPY_USER        0x6171a8UL

static unsigned long sct_addr = 0;
module_param(sct_addr, ulong, 0644);

// 模块初始化时：
kbase = sct_addr - OFFSET_SYS_CALL_TABLE;
g_kbase = kbase;
g_memstart = *(unsigned long *)(kbase + OFFSET_MEMSTART_ADDR);
do_strncpy_from_user = (void *)(kbase + OFFSET_STRNCPY_USER);
```

无论系统开机时 KASLR 如何随机偏移，只要确定一个点，整个内核符号全图瞬间解出。

* * *

## 0x03 第三道坎：骗过 Clang Forward-Edge CFI（控制流完整性）

这是在 Android 14 上最凶险、也是无数开发者遇到手机毫无征兆瞬间黑屏重启的根本原因。

### 1\. 为什么替换函数指针会导致 CFI Panic？

Android 14 的 Clang 启用了基于跳转表（Jump Table）的 Forward-Edge CFI。当内核通过间接跳转执行一个函数指针时（例如通过 `sct[__NR_openat]` 调用系统调用），编译器会在跳转指令前插入类型校验桩：

```
; Clang CFI 检查伪汇编
ldr   w16, [x8, #-4]        ; 读取目标函数前方的签名 Magic
cmp   w16, #EXPECTED_TYPE   ; 校验签名是否匹配
b.eq  1f
brk   #0x800                ; 校验失败，触发内核 Panic！
1:
br    x8
```

如果直接把 `sct[__NR_openat]` 指向我们模块里的普通 C 函数，由于模块代码位于动态分配的 `vmalloc` 区域，没有在内核启动时编译进全局 CFI Jump Table，一旦非特权 App 触发系统调用，内核会立即以 `Kernel CFI violation` 崩溃。

### 2\. 伪造.cfi_jt 跳表桩与专用链接脚本

我们深入分析了内核驱动加载器对模块 CFI 的校验机制。我们发现只要在汇编层面为模块入口构造合规的 `.cfi_jt` 对齐桩，并由链接器正确定位，即可满足 Clang 的类型安全证明：

编写独立的 `cfi_check.s` 并内联入 C 代码：

```swift
/* MTK CFI: per-function .cfi_jt no-ops */
__asm__(".globl init_module.cfi_jt\n"
        ".balign 4\n"
        "init_module.cfi_jt:\n"
        "\tb .\n"
        ".globl cleanup_module.cfi_jt\n"
        ".balign 4\n"
        "cleanup_module.cfi_jt:\n"
        "\tb .\n");
```

配合专用的链接控制脚本 `module.lds` 与 Clang 编译开关：

```
clang -c shield.c -target aarch64-linux -fno-pic -fno-pie ... -O2
ld.lld -r shield.o shield.mod.o cfi_check.o -T module.lds -o shield.ko
```

强制取消位置无关代码（PIC）生成的全局偏移表（GOT）间接跳转，使模块内的所有跳转完全自闭环，彻底抹杀 CFI Panic 隐患。

* * *

## 0x04 第四道坎：ARM64 3级页表软件漫游与硬件 PTE_RDONLY 强剥离

在 ARM64 架构下， `sys_call_table` 所在的虚拟内存被严格映射到了内核只读数据段（`.rodata` ）。在 MMU 硬件层面，其页表描述符的第 7 位被硬件置为只读（ `PTE_RDONLY = 1UL << 7` ）。

由于内核根本没有导出 `set_memory_rw()` ，如果尝试直接使用指针给 `sct[__NR_newfstatat] = hook_func` 赋值，CPU 的 MMU 权限单元会立刻捕捉到 `Permission Fault (Level 3)` ，手机秒死机。

### 核心解法：手写纯 C ARM64 MMU 页表漫游器

既然操作系统不给我们修改接口，我们直接利用特权级（EL1）的身份，去修改 MMU 的硬件根基—— **`swapper_pg_dir` 全局页目录**！

#### 1\. 物理地址到虚拟地址转换

在 ARM64 39-bit VA（ `CONFIG_PGTABLE_LEVELS=3` ）配置下，内核虚拟地址空间为 `0xFFFFFF8000000000` 开始的高半区。我们通过基准物理偏移实现 `pa_to_va()` ：

```cpp
#define PAGE_OFFSET_VAL 0xFFFFFFC000000000UL

static inline void *pa_to_va(unsigned long pa)
{
    return (void *)(((pa - g_memstart) | PAGE_OFFSET_VAL));
}
```

#### 2\. 三级页表手工穿透与修改

页表从一级页目录逐级向下寻址：  
\* **Level 1: PGD** （Shift 30，索引取 bits 38-30）  
\* **Level 2: PMD** （Shift 21，索引取 bits 29-21）  
\* **Level 3: PTE** （Shift 12，索引取 bits 20-12）

我们实现了极其紧凑、无外部依赖的 `sct_set_ro()` 权限翻转函数：

```cpp
#define PTE_RDONLY  (1UL << 7)
#define PTE_WRITE   (1UL << 51)

static void sct_set_ro(unsigned long vaddr, int npages, int make_ro)
{
    unsigned long *pgd = (unsigned long *)(g_kbase + OFFSET_SWAPPER_PG_DIR);
    int i;

    for (i = 0; i < npages; i++) {
        unsigned long v = vaddr + (unsigned long)i * 0x1000UL;
        unsigned long pgd_e, pmd_e;
        unsigned long *pmd, *pte;

        /* Level 1: PGD -> 直指 PMD */
        pgd_e = pgd[(v >> 30) & 0x1ff];
        if (!(pgd_e & 1)) continue;

        /* Level 2: PMD */
        pmd = (unsigned long *)pa_to_va(pgd_e & 0x0000ffffffffff000UL);
        pmd_e = pmd[(v >> 21) & 0x1ff];
        if (!(pmd_e & 1)) continue;

        /* 判断是否为 2MB 大页 */
        if ((pmd_e & 2) == 0) {
            if (make_ro) {
                pmd[(v >> 21) & 0x1ff] |= PTE_RDONLY;
                pmd[(v >> 21) & 0x1ff] &= ~PTE_WRITE;
            } else {
                pmd[(v >> 21) & 0x1ff] &= ~PTE_RDONLY;
                pmd[(v >> 21) & 0x1ff] |= PTE_WRITE;
            }
        } else {
            /* Level 3: 4KB 标准 PTE */
            pte = (unsigned long *)pa_to_va(pmd_e & 0x0000ffffffffff000UL);
            if (make_ro) {
                pte[(v >> 12) & 0x1ff] |= PTE_RDONLY;
                pte[(v >> 12) & 0x1ff] &= ~PTE_WRITE;
            } else {
                pte[(v >> 12) & 0x1ff] &= ~PTE_RDONLY;
                pte[(v >> 12) & 0x1ff] |= PTE_WRITE;
            }
        }
    }

    /* 关键步骤：ARM64 内存屏障与全局 TLB 刷新 */
    asm volatile("dsb ishst; tlbi vmalle1is; dsb ish; isb" : : : "memory");
}
```

#### 3\. 极速注入与原子恢复

在修改系统调用表时，采用“ **剥离只读 ➔ 批量替换 ➔ 复原只读** ”的微秒级闭环：

```cpp
ps = ((unsigned long)sct) & ~0xfffUL;
sct_set_ro(ps, 2, 0); // 解除 2 页的只读保护

// 替换 13 个关键系统调用指针
sct[__NR_newfstatat]    = (unsigned long)hook_newfstatat;
sct[__NR_faccessat]     = (unsigned long)hook_faccessat;
sct[__NR_openat]        = (unsigned long)hook_openat;
sct[__NR_readlinkat]    = (unsigned long)hook_readlinkat;
...

sct_set_ro(ps, 2, 1); // 立即恢复只读属性！
```

恢复只读后，系统的内存状态与开机完全一致，常规内存扫描工具根本察觉不到页表曾被篡改。

* * *

## 0x05 实测效果：11 微秒执行完毕与全面反侦测

在 Redmi Note 12 Pro+（MT6877 / Android 14）真机上执行加载测试：

```
adb push shield.ko /data/local/tmp/
adb shell su -c "insmod /data/local/tmp/shield.ko sct_addr=0x... auth_key=0x534849454C443031"
```

### 1\. 启动耗时与内核日志

查看 `dmesg` 记录：

```yaml
[ 3143.455888] shield: init kbase=0xffffff8008080000 memstart=0x40000000 sct=...
[ 3143.455899] shield: hooks installed successfully
[ 3143.455899] shield: ALL SHIELD subsystems (H07, H01, H02, K03, K04, K05, K06, K07) ACTIVE
```

**整个初始化过程从开始到返回 0，耗时仅仅 11 微秒（11 μs）！** 对整机运行速度没有任何性能拖滞。

### 2\. 对抗现代风控与检测工具实测

在手机上安装最苛刻的开源反 Root 与环境检测工具（Momo 4.4.1、Hunter 6.69、Ruru 1.1.1）：  
\* **Bootloader 锁伪装（REQ-H07）**：  
修改 `/proc/cmdline` 缓存，将 `androidboot.verifiedbootstate=orange` 实时欺骗为 `green` ，状态变为 `locked` ；  
\* **TracerPid 反调试（REQ-K05）**：  
针对 `/proc/[pid]/status` 拦截，无论任何进程调试目标，读取到的 `TracerPid` 恒为 `0` ；  
\* **路径隐身（REQ-K03）**：  
对非 root 用户态进程（UID >= 1000），所有 Magisk、su、模块路径的 `stat` 、 `faccessat` 、 `openat` 一律返回 `-ENOENT` ；  
\* **硬件麦克风静音（REQ-H02）**：  
拦截底层音频 AFE（Audio Front End）驱动，应用录音时输出纯净 0uV（静音波形），杜绝任何后台恶意窃听。

**实测结果：Hunter、Momo、Ruru 全程全绿，0 检出！**

图：Momo 4.4.1 环境检测实测（内核态隐身与全绿通过）

图：Hunter 6.69 深度检测实测（无 Root、无注入全绿）

图：Ruru 1.1.1 硬件与系统调用检测全绿通过

* * *

## 0x06 总结与思考

在现代移动安全对抗中，攻守双方的博弈已经从早期的“用户态符号对抗”全面转移到了“编译器加固与硬件 MMU 权限控制”的深水区。

通过本次工程实战，我们证明了：  
1\. **即使在没有芯片原厂源码树的前提下**，通过严谨的二进制逆向与动态基址解算，依然可以构建高兼容性的原生内核模块；  
2\. **硬件级只读保护与编译器 CFI 并非不可逾越的天堑**，在特权级（EL1）下，理解并利用 CPU MMU 的多级页表组织逻辑，可以通过纯软件漫游实现极其优雅且安全的只读权限改写；  
3\. 将底层的内核拦截能力与用户态控制结合，能够为移动安全领域提供远超传统方案的硬件级隐私加固和防风控防护。

* * *

*声明：本文所涉技术仅用于移动安全底层学术研究与防御系统加固，代码与敏感硬件参数已做脱敏处理。*

* * *

## 评论

> **Zepp7289 · 3 楼**
> 
> APatch的特点就是在没有源码情况下进行patch，到你这里就是反过来要源码了？AI文好歹了解下再写
