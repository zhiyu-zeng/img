---
title: 【微信】从 Bootkitty 到 Silverseal：Linux bootkit 进入「配型时代」
source: https://mp.weixin.qq.com/s/IjirPWeSTsX1CQne3PbMXQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-11T08:34:54+08:00
trace_id: 507f2001-fdda-4103-8cab-fd0c7d869fe6
content_hash: 4504e8606338b226304f8a793cbacef3e081599c754adc0943086c0a83ef30df
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41575244-d011-81a8-97c7-ce35b967158c
ioc: null
---

**赛博57库** *2026年11月11日 05:00*

恶意软件 / 攻防技术 / 行业洞察

Linux bootkit · 引导链持久化 · ARM64 配型 · 启动度量 · 检测滞后

📌 一句话介绍

2024 年的 Bootkitty 证明 Linux 引导链可以被改写；2026 年的 Silverseal 把改写过程做成了可复用框架，并在 11 月 9 日凌晨补上 ARM64。两次事件不是同一条代码血脉，却指向同一个变化：bootkit 的能力单位，正在从「一个样本」变成「框架 + 每目标一份 profile」。

2024 年 11 月 27 日，ESET 披露了 Bootkitty。它被称作「第一个针对 Linux 的 UEFI bootkit」，目标是少数 Ubuntu 版本、x86_64 架构；样本自签名，靠硬编码偏移改内核。ESET 在后续更新里称，它看起来是韩国 BoB 培训项目学生的作品，并基于遥测判断它没有在野部署。换句话说，它是一次成功的概念验证，不是一件成熟的武器。

2026 年 11 月 8 日 23:40（+0200，北京时间 11 月 9 日凌晨），Silverseal 仓库出现提交 `7ad1444` ，标题只有三个词：Add ARM support。到 11 月 10 日，这个由 Idov31 维护的 Rust bootkit 框架已经同时有 x86_64 与 ARM64 两条引导链，仓库约 184 stars。它同样不是「正在传播的病毒」：它是一个开源研究框架，需要 root、需要写 ESP、需要关闭 Secure Boot 或使用自己的密钥。

把这两件事放在一起，不是为了说「Linux 越来越危险」这种正确的废话。它们代表了两种工程形态：Bootkitty 是「一次性的利用样本」，Silverseal 是「可复用、可配型、跨架构的框架」。前者证明门可以被撬开，后者把撬门的工具做成了套装。对防守方来说，真正变化的是检测位置——从找某个样本的字节特征，转向量整条启动链。

这篇文章按三条线展开：先拆 Bootkitty 的技术链与它的脆弱点，再拆 Silverseal 从 x64 到 ARM64 的工程化路径，最后给出五个按性价比排序的检查动作。技术细节来自公开源码、提交记录与厂商分析；ARM64 部分没有在实机上跑通整链，文中会明确标注哪些是源码事实、哪些是推断。

![img1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/98d08fc2ce6f4bb6.jpg)

▲ 2024 → 2026：Linux bootkit 从「证明可能」走到「工程配型」

## 01 · Bootkitty：第一次证明 Linux 也会中招

Bootkitty 的样本是一个自签名 EFI 文件。自签名意味着它本身过不了严格开启的 Secure Boot；它能进入启动链，靠的是攻击者已经通过固件漏洞（例如 Binarly 报告的 LogoFAIL 链）或预先把自己的证书装进固件信任库。跑起来之后，它的做法不是去偷一把合法钥匙，而是把固件的验证函数改成「永远通过」。

具体来说，Secure Boot 开启时，它 hook 两个固件协议函数： `EFI_SECURITY2_ARCH_PROTOCOL` 的 `FileAuthentication` ，以及 `EFI_SECURITY_ARCH_PROTOCOL` 的 `FileAuthenticationState` 。前者负责验证 UEFI PE 镜像的完整性，后者根据验证状态执行平台策略。Bootkitty 让它们都返回成功，于是后面的镜像不再被真正检查。

过了这一关，它从 ESP 的硬编码路径 `\EFI\ubuntu\grubx64-real.efi` 加载攻击者备份的合法 GRUB。注意这个文件名： `grubx64-real.efi` 不是 Ubuntu 的默认命名，正常的 GRUB 叫 `grubx64.efi` 。攻击者先把原版 GRUB 改名藏起来，再让 bootkit 以「合法引导器」的身份把它拉起来。

GRUB 被加载、但还没有执行时，Bootkitty 继续改 GRUB 的内存：

01 改 `peimage` 模块里的 `start_image` 。这个函数负责启动已经加载的 PE 镜像，GRUB 用它来启动 Linux 内核的 EFI stub（也就是 vmlinuz）。

02 改 `grub_verifiers_open` ，让 GRUB 打开文件时直接跳过签名校验。

03 顺带改 `shim_lock_verifier_init` ，但因为上一步已经把文件校验绕开，这个 hook 实际上用不上。

然后它等 GRUB 选中内核。vmlinuz 被加载、还没执行时，Bootkitty 在 zstd 解压函数上装 hook；解压完成、内核镜像还躺在内存里没有跑起来的那一刻，它按硬编码偏移改三处：

• 把内核版本和 Linux banner 改成 `BoB13`

• 把 `module_sig_check` 改成永远返回 0，于是未签名内核模块也能加载；

• 把 init 进程的第一个环境变量改成 `LD_PRELOAD=/opt/injector.so` ，并在后面拼上 `/init` ，让 init 在启动时预加载一个共享库

结果是一条完整的链：未签名模块可以加载，init 被预加载，内核被打上 taint 标记。ESET 还发现了一个可能相关的未签名模块 BCDropper，以及它释放的 BCObserver；后者会等 gdm3 启动后，通过 `finit_module` 加载另一个内核模块，并具备隐藏模块、文件、进程和端口的能力。

Binarly 随后报告了另一条投递链：公开代码里出现了利用 LogoFAIL 图像解析漏洞投递 Bootkitty 的利用链。这里要把两件事分开——Bootkitty 自身的技术链是「自签名 + hook 固件认证 + 改 GRUB/内核」，LogoFAIL 是另一条把 payload 送进启动早期的路径。两者组合起来说明的是：bootkit 不一定要自己带 0day，它可以是别人漏洞链的最后一环。

Bootkitty 的局限同样明显。它用硬编码偏移改内核，没有版本检查；换一个内核构建，补丁可能落到随机代码或数据上，系统直接崩掉。它只覆盖 x86_64、少数 Ubuntu 版本，样本里还留着 `BoB13` 这种显眼的 banner。ESET 的判断是「概念验证」，不是「在野武器」。

它的检测点也因此很直白：

• `uname -v` 或 `dmesg` 里出现 `BoB13`

• `/proc/1/environ` 里出现 `LD_PRELOAD=/opt/injector.so`

• ESP 的 `/EFI/ubuntu/` 下出现 `grubx64-real.efi`

• `/proc/sys/kernel/tainted` 在没做模块操作的情况下带上 unsigned module 位；

• Secure Boot 开着，但未签名模块能加载——这本身就是异常。

Bootkitty 证明的是「Linux 的引导链可以被改写」，但它没有解决「换一台机器还能不能跑」的问题。这个问题，正是 Silverseal 要回答的。

## 02 · Silverseal x64：把 bootkit 做成工程

Silverseal 的仓库在 2026 年 3 月 20 日建立，到 11 月 10 日有 66 个提交、约 184 stars，GPL-3.0。作者 Idov31 此前写过 Nidhogg 等 Linux rootkit，这次的交付物分成三块： `silverseal-bootkit` （no_std 的 UEFI 应用）、 `silverseal-rootkit` （Kbuild 管理的 Rust 内核模块）、 `scripts` （部署与恢复），另外还有一份作者自己写的 YARA 规则。

x64 的链条可以压缩成六步：

01 部署脚本把 ESP 上的 `grubx64.efi` 换成 bootkit，原文件改名为 `grubx64.efi.original`

02 bootkit 启动后，用 `load_image` 把原 GRUB 加载进内存，但先不执行；

03 在 GRUB 镜像里按 6 字节签名 `48 89 75 B8 FF D0` 找到 `grub_arch_efi_linux_boot_image` ，写入 13 字节 detour

04 启动原 GRUB。用户看到的是熟悉的菜单，选内核后 GRUB 调用被 hook 的函数；

05 hook 在 vmlinuz 里找到 zstd 解压函数 `zstd_decompress_dctx` ，再装一处 detour；解压完成后拿到解压后 vmlinux 的地址与大小；

06 解析 ELF、在 `.text` /`.data` 里找 cave、改写 `late_initcall` 表最后一条 entry 的 prel32，让内核在初始化时跳到 stager；stager 用 `schedule_work` 把 worker 排进工作队列，worker 睡 10 秒后调用 `call_usermodehelper("/sbin/insmod", "/silverseal_rootkit.ko")` 。

13 字节 detour 的编码是 `49 BA <imm64> 41 FF D2` ，也就是 `mov r10, imm64; call r10` 。选 `call` 而不是 `jmp` ，是因为这里 patch 的是一条真实调用点，压入的返回地址让钩子返回时能回到原函数内的下一条指令；到了内核入口那处，代码改用 `41 FF E2` （ `jmp r10` ），避免多压一个返回地址破坏栈布局。

钩子还有一个很实用的技巧：它不去解析 x64 的栈帧，而是直接读调用点留下的寄存器。 `rax` 里是原函数指针（GRUB 那条 `call rax` 的目标）， `r12` 里是真正的内核入口；拿到之后先把原字节写回去，再调用原函数，避免自己钩自己造成递归。

zstd hook 的价值在于「目标不用猜」。它的函数原型把解压后的 `dst` 和 `dst_capacity` 直接递到钩子手上：这就是 vmlinux 在内存里的起点与容量。不需要 KASLR 泄漏，不需要读 `/proc/kallsyms` ，不需要 `/dev/mem` ，也不需要页表遍历。内核自己把自己解压到了这个地址，bootkit 只是接住了这个结果。

之后的 initcall 改写是纯算术：Linux 的 initcall 表每个 entry 是 4 字节有符号相对偏移， `entry_virt + i32 = target_fn` 。Silverseal 用 ELF 解析找到 `.init.data` ，从 `+0x40` 读出 late initcall 的区间，取区间最后 4 字节，读出原来的 i32，再写入 `stager_virt - entry_virt` 。选最后一条，是为了不动其它 entry 的相对跳转链，同时保证它自己一定会被执行到。

工程化体现在细节里，不是体现在「能跑」上：

• `\EFI\ubuntu\failsafe` 里存一个 u16 失败计数，上限是 1；任何一次定位或挂钩失败，写 1 后永久停用 hook，之后老老实实启动原 GRUB。它不复位，等于一次失败就自我钉死，实战里要手动删文件才能恢复，但这比反复把机器搞挂要好。

• 所有 `None` / `Err` 分支都回退到「什么都不做」，打印日志后继续走原路径。

• 作者把 YARA 规则、部署脚本、恢复脚本、README 一起放进仓库，等于把「怎么用、怎么查」也写清楚了。

• 内核模块本身还是 hello world： `silverseal_rootkit.rs` 只有 `pr_info!`。这个项目的交付物是「装载链」，不是「后门功能」。

它的局限也很清楚：需要 root、需要写 ESP、Secure Boot 这一环没有解决；内核版本强耦合，zstd 签名、三个函数的回退距离、 `initcall_levels` 偏移、 `WORK_STRUCT_NO_POOL` 的 magic 值，都是对着 Ubuntu 24.04 的 6.8 内核调的；10 秒 `msleep` 是「赌文件系统与 `/sbin/insmod` 已经就绪」，不是精确同步；rootkit 功能留白。

检测点：ESP 上的 `grubx64.efi.original` 、 `failsafe` 、根目录的 `/silverseal_rootkit.ko` 、 `taint` 的 unsigned module 位，以及最关键的运行时上下文—— `insmod` 的父进程是 `kworker/*` ，用户态审计里没有对应的 `execve` 链。

10 秒的 `msleep` 是这条链最脆弱、也最容易被忽略的检测窗口。late initcall 阶段文件系统虽然挂上了，但 systemd、udev、模块工具链还没完全就绪；作者选择睡 10 秒，是给 `/sbin/insmod` 和模块文件一个宽裕的可用窗口，也是在赌「10 秒足够」。对防守方来说，这 10 秒里如果抓到 `kworker` 的 workqueue 活动，或者看到 `call_usermodehelper` 的调用，就是一条强信号；但窗口很短，常规采样未必抓得住，所以它更适合事后审计，而不是实时拦截。

Silverseal x64 已经把 bootkit 从「一次性样本」推到了「可维护工程」，但它的适配仍然靠签名和固定回退距离。换一个内核，签名可能还在，回退距离可能已经变了；换一个架构，整套东西要重写。ARM64 提交要解决的，就是后一个问题。

![img2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1db49dba17f08ded.jpg)

▲ 两种工程形态：一次性利用样本 vs 框架 + 每目标一份 profile

## 03 · ARM64：同一套框架，换了一种「配型」

2026 年 11 月 8 日的 `7ad1444` 不是「加一个 target 编译」那么简单。随后 `cced9a9` 补上的 fixtures 和 README 说明了这次改动的核心：ARM64 版本需要一份 **v3 profile**，把目标内核的构建钉死。

项目的 fixture 目标是 Ubuntu `7.0.0-31-generic` ，解压后的内核镜像长度 `0x4540000` 。ARM64 的启动链与 x64 不同：

01 ESP 上的 `grubaa64.efi` 被替换，原文件保留为 `grubaa64.efi.original`

02 bootkit 链式加载原 GRUB，hook 它的 `grub_arch_efi_linux_boot_image`

03 GRUB 加载 vmlinuz。ARM64 的 vmlinuz 是一个 PE/COFF 的 zboot 镜像，压缩后的内核在 `.linux` 段里；

04 bootkit 在嵌套的 zboot PE 里找到 `.linux` 段，再 hook `efi_zboot_decompress` （项目里简称 zboot 解压函数）

05 解压完成，拿到解压后的 ARM64 Image，按 profile 校验长度、签名、cave，改写 late initcall；

06 stager 排 work、worker 睡 10 秒、 `call_usermodehelper("/sbin/insmod", module_path)` 。

x64 的 zstd hook 只需要在 vmlinuz 里找一个函数；ARM64 多了一层：vmlinuz 本身是 PE/COFF 的 zboot 镜像，压缩内核在 `.linux` 段里，bootkit 必须先解析外层 PE、找到 `.linux` 的 raw offset/size，再在嵌套镜像里找解压函数。 `find_unique_pe_section` 就是为这一层写的；它要求 `.linux` 段名唯一、raw range 在文件内，否则 fail-closed。

### 20 字节的自定位 detour

ARM64 的指令定长 4 字节，x64 那套 13 字节 patch 不能照搬。Silverseal 用的是 20 字节：

adr xN,.; 把当前地址（运行时入口）写进 xN

ldr x16, #8; 从 PC+8 取出目标地址

br x16; 跳到 hook

.quad hook; 8 字节绝对地址

`adr` 是 PC 相对的，不依赖重定位：镜像被 loader 搬到哪个地址，它就把哪个地址写进 xN。这样钩子不需要提前知道运行时入口，也能在恢复原字节时找到正确的位置。

N 的选择也有讲究。GRUB 的 `grub_arch_efi_linux_boot_image` 有三个参数（x0/x1/x2），x3 是空闲的，所以 GRUB 这处用 `adr x3, .`。zboot 的解压函数只有两个参数，x2 空闲，所以用 `adr x2, .`。钩子函数的签名相应多一个 `runtime_entry` 参数，从 x3 或 x2 接住这个地址。

还有一道容易被忽略的检查：被 patch 的 20 字节不能和加载器的重定位项重叠。GRUB 是 `ET_REL` 的 AArch64 ELF，Silverseal 会解析 `SHT_REL` / `SHT_RELA` ，确认 patch 区间不与任何重定位项相交；zboot 是 PE/COFF，会解析 base relocation 块，确认同样的区间不被重定位覆盖。重叠就拒绝安装，避免 loader 把 patch 字节改掉。

### profile v3：把「适配」变成一张配型单

ARM64 版本最关键的设计不是某条指令，而是 profile。它是一段 128 字节头 + 变长签名的二进制，magic 是 `SSARM64P` ，版本 3，随 EFI 一起编译进去。没有 profile 的 ARM64 构建会嵌入一个空占位符，运行时直接不装 hook——fail-closed。

profile 里锁定了这些东西：

|     |     |     |
| --- | --- | --- |
| 字段  | fixture 值 | 作用  |
| `kernel_image_len` | `0x4540000` | 解压后 Image 长度必须精确相等，否则拒绝注入 |
| 5 段签名 | GRUB / zboot / initcall / code cave / schedule_work | 每段在目标里必须唯一命中，0 个或多个都失败 |
| `initcall_entry`<br><br>/ `code_cave` / `data_cave` | `0xffff8000831ce498`<br><br>/ `0xffff800080010b84` / `0xffff8000843e6808` | 运行时地址锚点，配合 KASLR slide 一起平移 |
| cave 容量 | code 256 / data 2040 | 放 172 字节 trampoline 与 work_struct、路径、argv |
| `module_path` | `/silverseal_rootkit.ko` | 传给 `insmod` 的模块路径 |

生成 profile 之前， `verify_arm64_fixture.ps1` 会先做一轮硬校验：GRUB、vmlinux、vmlinuz、System.map 四个工件的 SHA256；五段签名是否唯一；vmlinuz 里是否真的有嵌套的 `.linux` PE；code/data cave 是否全零；initcall 的 prel32 是否能解回 `original_initcall` ；System.map 里是否有 `_text` 和 `schedule_work.isra.0` ；code cave 到原 initcall 的 `b` 、到 data cave 的 `adrp` 是否在编码范围内。全过了，才调用 `silverseal-arm64-tool profile` 生成 profile。

这套流程的潜台词是： **一份 profile 只对一次内核构建有效**。内核一升级，镜像长度、签名、地址、cave 都可能变，链条就失败关闭。攻击者要打一台机器，先得拿到与它完全匹配的内核构建；这和 x64 版本「签名 + 固定回退距离」的粗放适配，是两种成本结构。

### 172 字节的 trampoline

注入的代码只有 172 字节，分成 stager 和 worker 两段，放在 code cave 里；work_struct、路径、argv 放在 data cave 里。所有目标地址都用 `adrp/add` 、 `b` / `bl` 的相对编码，KASLR slide 对整条链一起平移，生成字节不变——单元测试里专门用两个不同的 slide 验证输出完全一致。

为简洁，下面用 `adrp/add` 表示 ADRP 取页 + ADD 取页内偏移两条指令。

stager 的指令序列是：

`bti c`

`paciasp`

str x30, \[x18\], #8; 影子栈压入 LR

`stp x29, x30, [sp, #-16]!`

`mov x29, sp`

`adrp/add x0, data_cave`

`add x1, x0, #8`

`str x1, [x0, #8]        ; work->entry.next = &entry`

`str x1, [x0, #16]       ; work->entry.prev = &entry`

`adrp/add x1, worker`

`str x1, [x0, #24]       ; work->func = worker`

`bl schedule_work`

ldr x30, \[x18, #-8\]!; 弹出 LR

`ldr x29, [sp], #16`

`autiasp`

b original_initcall; 尾跳，原 initcall 照常执行

worker 在 code cave 偏移 80 处：

`bti c`

`paciasp`

`str x30, [x18], #8`

`stp x29, x30, [sp, #-16]!`

`mov x29, sp`

`mov w0, #10000`

`bl msleep`

`adrp/add x0, helper_path`

`adrp/add x1, argv`

`str x0, [x1]`

`adrp/add x4, module_path`

`str x4, [x1, #8]`

`str xzr, [x1, #16]`

`mov x2, xzr`

`mov w3, #2              ; UMH_WAIT_PROC`

`bl call_usermodehelper`

`ldr x30, [x18, #-8]!`

`ldr x29, [sp], #16`

`autiasp`

`ret`

这段代码把 AArch64 的几个工程约束暴露得很清楚：

• **地址范围**： `adrp` 的寻址范围是 ±4GB， `b` 是 ±128MB， `prel32` 是 ±2GB。code cave、data cave、 `schedule_work` 、 `msleep` 、 `call_usermodehelper` 、原 initcall 必须落在这些范围里，否则编码直接失败；生成 profile 前的校验与 trampoline 构建都会检查这些范围。

• **缓存一致性**：AArch64 的 I-cache 与 D-cache 不保证一致。写完代码必须先 `dc cvac` 把数据清到 PoC，再按 64 字节行 `ic ivau` 失效指令缓存，最后 `dsb ish` / `isb` 。x86 上不需要这一步，移植时最容易漏。

• **BTI/PAC/SCS**： `bti c` / `bti j` 是间接跳转的着陆点； `paciasp` / `autiasp` 给 LR 签名；影子栈把 x30 存到 x18 指向的区域。这些是内核 hardening 的约定，trampoline 必须遵守，否则在开了 BTI/PAC/SCS 的内核上会挂在第一跳。这里也埋着一个版本耦合点：模板假定 x18 是影子栈指针，目标内核是否启用 SCS，要以它的 `/boot/config-*` 为准，而 profile 里并没有记录这个配置项。

• **结构体布局**： `work_struct` 在目标内核里是 32 字节， `entry` 偏移 8， `func` 偏移 24。README 要求用 BTF/DWARF 核对，布局不对就停。x64 版本同样依赖布局，但 ARM64 版本把它写进了显式的部署检查。

### 检测缺口：作者的 YARA 还停在 x86

Silverseal 仓库里的 `silverseal.yara` 只有一条规则： `silverseal_uefi_bootkit_x64` 。条件里写死 `pe.machine == 0x8664` ，匹配的字符串也都是 x64 路径（ `grubx64.efi.original` 、 `zstd_decompress_dctx_hook` 的日志、x64 的代码模式）。ARM64 的 `pe.machine == 0xAA64` 、 `grubaa64.efi.original` 、 `SSARM64P` 、ARM64 日志串，一个都不在规则里。

这不是作者疏忽那么简单。框架先支持新架构、检测规则后补，是结构性的时间差：写框架的人关心「能不能跑」，写规则的人关心「怎么识别」，两者的节奏天然不同。对蓝队来说，这个缺口是现成的：如果你只部署了作者那份 YARA，ARM64 版本从规则底下走过去，你不会收到告警。

ARM64 版本新增的可查痕迹至少有这些：

• ESP 上的 `\EFI\ubuntu\grubaa64.efi.original`

• 同目录的 `failsafe` （x64/ARM64 共用）；

• EFI 文件里的 `SSARM64P` profile magic；

• 字符串 `/sbin/insmod` 与默认模块路径 `/silverseal_rootkit.ko`

• ARM64 专属日志串，例如 `ARM64 GRUB hook is disabled` 、 `Installed ARM64 deferred root-filesystem module-loading trampoline` 、 `ARM64 stock zboot` 。

### 为什么 ARM64 重要

Bootkitty 只覆盖 x86_64；Silverseal 的 x64 版本也只覆盖 x86_64。ARM64 的加入，把这条链带到了另一类机器上：云上的 ARM 实例、Apple Silicon 上的 Linux 虚拟机、越来越多的 ARM 服务器与边缘设备。这些环境的启动链、GRUB 文件名、内核镜像格式都与 x86 不同，x86-only 的检测脚本、IR playbook、YARA 规则，在它们面前会直接失效。

这不是说 ARM64 马上会成为主战场。它说明的是： **bootkit 的框架已经跨过了架构边界，而检测还没有**。这个时间差，就是这篇文章想提醒的地方。

![img3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/34fcef56c58f5d5c.jpg)

▲ ARM64 链条与 profile：长度、签名、地址、cave 一起把攻击钉在一个内核构建上

## 04 · 对比：两次事件到底差在哪

把 Bootkitty 和 Silverseal 放在一张表里，差异比相似更值得看：

|     |     |     |
| --- | --- | --- |
| 维度  | Bootkitty（2024-11） | Silverseal（2026，x64 → ARM64） |
| 性质  | 首个 Linux UEFI bootkit PoC（ESET） | 开源 Rust 研究框架 |
| 架构  | x86_64 | x86_64 + ARM64 |
| 入口  | 自签名 EFI + hook 固件认证 | 替换 `grub*.efi` ，链加载原 GRUB |
| 内核改写 | 硬编码偏移 patch | zstd/zboot + initcall + cave |
| 前置条件 | 固件/证书 + 特定 Ubuntu | root + ESP + 精确内核 profile |
| 检测抓手 | `BoB13`<br><br>、 `LD_PRELOAD` 、taint | `.original`<br><br>、 `failsafe` 、 `SSARM64P` |
| 成熟度 | 未在野 PoC | 开源研究；ARM64 待 VM 验证 |

三个差异：

**入口不同。** Bootkitty 走的是「固件信任链」：自签名 + hook 认证函数，必要时再接一条 LogoFAIL 投递链。Silverseal 不走固件漏洞，它假设攻击者已经有 root、已经能写 ESP；它解决的是「拿到这些权限之后，怎么在启动时把 rootkit 装进去」。前者是突破边界，后者是后渗透持久化。

**适配方式不同。** Bootkitty 用硬编码偏移，换内核就可能崩；Silverseal 用签名 + 固定回退距离，再进一步用 profile 把长度、签名、地址、cave 全部钉死。前者是「碰运气」，后者是「配型」——配不上就失败关闭，不会把机器改崩。

**交付形态不同。** Bootkitty 是一个样本；Silverseal 是框架 + 规则 + 脚本 + 多架构。样本的价值在「证明」，框架的价值在「复用」。这也是为什么 Silverseal 的 ARM64 提交值得单独写一篇：它不是为了多支持一个架构，而是把「适配」这件事本身产品化了。

检测难度也不一样。Bootkitty 留下 `BoB13` 、 `LD_PRELOAD` 、 `grubx64-real.efi` 这些很响的信号；Silverseal 的痕迹更安静：`.original` 、 `failsafe` 、profile magic，外加一个从 `kworker` 发起的 `insmod` 。前者适合应急排查，后者更适合基线比对与启动度量。两者都会在 ESP 上留下备份文件，这是共同点，也是最好抓的一层。

没有变的三件事：都打 Ubuntu/GRUB 这条常见路径；都需要写 ESP、都需要重启；都会留下痕迹，也都受 Secure Boot、模块签名、lockdown 的限制。换句话说，bootkit 的「入口成本」没有消失，只是从「找固件 0day」部分转移到了「拿 root、拿 ESP、拿目标内核构建」。

## 05 · 趋势：为什么叫「配型时代」

「配型」这个词借自医学：不是有器官就能移植，得先配得上。Silverseal 的 profile 就是一张配型单——内核镜像长度、五段签名、三个虚拟地址、两个 cave 容量、模块路径，全部对上，链条才成立；对不上，fail-closed。

profile 同时也是取证锚点。 `SSARM64P` 、固定的 128 字节头、五段签名、精确的 image len，都是可扫描的构建特征；攻击者可以改 magic、删日志，但改不了「必须匹配目标内核长度」这个约束——长度不对，链条直接失败关闭。换句话说，profile 让攻击更工程化，也让失败更像失败：不会静默改错，而是明确不装。对防守方，这比一个「可能已经中招但看不出」的样本要好处理。

这带来三个变化。

**第一，攻击的成本结构变了。** 过去做 bootkit，一个核心难点是「找到一个能绕过 Secure Boot 的漏洞」；现在对 Silverseal 这条路来说，难点在「拿到目标的内核构建」：vmlinux、System.map、vmlinuz、grubaa64.efi，最好还有 BTF/DWARF。攻击者要收集这些工件，要确认内核版本，要在自己的环境里生成 profile，还要接受「内核一升级就失效」的维护成本。门槛对脚本小子更高了，对有能力的团队反而更低了——因为他们本来就有这些工件。

**第二，样本特征的生命周期变短。** 每台目标一份 profile，EFI 的哈希就可能不同；改一个签名、换一个 cave，字节特征就变。靠哈希和少量字符串的检测，会越来越吃力。相对稳定的，是行为与启动链：链加载原 GRUB、 `kworker` 里 `insmod` 、ESP 上多出备份文件、启动度量值变化。

**第三，检测的位置要前移。** 如果只在用户态看进程， `call_usermodehelper` 拉起的 `insmod` 父进程是 `kworker` ，没有对应的 `execve` ，进程树检测会断链；如果只在文件系统看 `.ko` ，模块可能已经被加载、文件被删；如果只扫 EFI 字符串，攻击者可以改 magic、改日志。真正稳的，是启动度量：TPM PCR、Secure Boot 状态、IMA、ESP 基线。这些不是「查样本」，是「量启动」。

三个判断，按置信度排序：

01 **更多「框架 + profile」式 bootkit** （高）。Silverseal 已经把工程模板摆出来了：no_std UEFI、Rust、签名扫描、cave、initcall、workqueue、UMH。复制这套结构的成本，比从零写一个 bootkit 低得多。

02 **更多 ARM64 bootkit 研究** （中高）。ARM 服务器、Apple Silicon 虚拟机、ARM 边缘设备都在增加；x86-only 的检测假设会逼着研究者和防守方补课。Silverseal 不是第一个 ARM64 相关研究，但它是少见的、公开可读的完整实现。

03 **检测从文件特征转向启动度量 + 供应链完整性** （高，但落地慢）。这不是新观点，但 bootkit 的配型化会让它从「最佳实践」变成「必须做」；落地慢，是因为 TPM/IMA/远程证明的运维成本高。

也要说反面。Secure Boot 用自己的密钥、 `module.sig_enforce=1` 、 `lockdown=confidentiality` 、TPM 绑定磁盘解密，任何一条做扎实，这条链都会断。root 门槛、ESP 写权限、重启窗口，也都不是随便就能拿到的。Bootkitty 没有在野，Silverseal 是研究框架；「配型时代」说的是能力形态，不是「明天就会大面积中招」。

## 06 · 蓝队：五个检查，按性价比排序

如果你只记五件事，按这个顺序做：

|     |     |     |
| --- | --- | --- |
| 检查  | 怎么做 | 建议  |
| ESP 基线 | hash `grub.efi` ；查 `.original` 、 `failsafe` 、 `SSARM64P` | 低 / 先做 |
| Secure Boot 与模块签名 | `mokutil --sb-state`<br><br>； `module.sig_enforce=1` ； `lockdown=confidentiality` | 中 / 高 |
| 启动度量 | TPM PCR 4/7/9 + 远程证明；IMA appraisal | 高 / 正解 |
| 运行时模块加载 | auditd/eBPF 看 `init_module/finit_module` ；父进程 `kworker` ；有无 `execve` | 中 / 排查 |
| 应急恢复 | 快照 ESP；按发行版重铺 GRUB；换密钥；重建基线 | 高 / 出事时 |

### 先做：ESP 基线

`#!/usr/bin/env bash`

`set -euo pipefail`

`esp=/boot/efi/EFI/ubuntu`

`sha256sum "$esp/grubaa64.efi" \`

          `"$esp/shimaa64.efi" 2>/dev/null || :`

`find "$esp" -maxdepth 1 -type f \`

  `\( -name '*.original' -o -name 'failsafe' \) \`

  `-printf '%f\n'`

`grep -a -o 'SSARM64P' \`

  `"$esp/grubaa64.efi" 2>/dev/null || :`

`*.original` 和 `failsafe` 是 Silverseal 的强特征；Bootkitty 用的是 `grubx64-real.efi` 。正常 Ubuntu 的 ESP 里不应该出现这些名字。哈希基线要和「已知良好」的包或金镜像比，不要拿被感染机器自己的第一次哈希当基线。

只押一个 IOC 不够

如果攻击者把 `SSARM64P` 和日志串都改了，ESP 基线仍可能抓到 `.original` / `failsafe` ；如果连备份文件也清了，启动度量就是最后一道。检测要按这个顺序叠，而不是只押一个字符串。

### 再补：Secure Boot 与模块签名

`mokutil --sb-state`

`cat /proc/cmdline | tr ' ' '\n' | grep -E 'module.sig_enforce|lockdown'`

如果业务允许，打开 `module.sig_enforce=1` ，或者在合适的机器上用 `lockdown=confidentiality` 。这不是「建议开启」的泛泛之谈：Silverseal x64 的链条最后一步就是 `insmod` 一个未签名模块，模块签名强制会直接把它挡在门口。

### 正解：启动度量

`tpm2_pcrread sha256:4,7,9`

`cat /sys/kernel/security/ima/ascii_runtime_measurements 2>/dev/null | tail`

PCR 4 覆盖启动管理器代码与配置，PCR 7 反映 Secure Boot 策略，PCR 9 覆盖 GRUB 加载的文件/命令（具体以发行版度量策略为准）。把 PCR 值和已知良好的启动路径比对，或者在 TPM 绑定磁盘解密里使用这些 PCR——启动链被改，PCR 就变，机器要么告警，要么根本解不开盘。

### 已感染排查：模块加载上下文

`# /etc/audit/rules.d/module.rules`

`-a always,exit -F arch=b64 -S init_module,finit_module -k module_load`

`ausearch -k module_load -i | grep -E 'kworker|insmod'`

`cat /proc/sys/kernel/tainted`

`lsmod | grep -i silverseal`

`taint` 的第 12 位（4096）是 unsigned module；没有做过模块操作却出现这一位，值得追。 `kworker` 父进程 + `insmod` + 无 `execve` ，这三条合起来，比单看「有没有加载模块」更有意义。

### 给 ARM64 补一条 YARA

作者的规则只覆盖 x64。下面这条是草案，基于源码字符串推导， **没有在真实 ARM64 样本上跑过**；上线前请用本地构建的样本验证，别直接当生产规则：

`rule silverseal_uefi_bootkit_arm64_draft`

`{`

    `meta:`

        `description = "Silverseal ARM64 bootkit draft"`

        `author = "cyber57"`

        `date = "2026-11-10"`

        `reference = "github.com/Idov31/Silverseal"`

    `strings:`

        `$grub = "grubaa64.efi.original" wide`

        `$failsafe = "failsafe" wide`

        `$profile = "SSARM64P" ascii`

        `$insmod = "/sbin/insmod" ascii`

        `$log1 = "ARM64 GRUB hook is disabled" ascii`

        `$log2 = "Installed ARM64 deferred" ascii`

        `$log3 = "ARM64 stock zboot" ascii`

    `condition:`

        `uint16(0) == 0x5A4D and`

        `pe.machine == 0xAA64 and`

        `pe.subsystem == 10 and`

        `filesize < 512KB and`

        `$profile and $grub and`

        `$failsafe and $insmod and`

        `1 of ($log*)`

`}`

这条规则的软肋也要说清楚： `SSARM64P` 是源码常量，攻击者可以改 magic 重新编译；日志串可以删；路径可以换。它的价值是「快速捞出未改动的公开版本」，不是「一劳永逸」。真正兜底的还是启动度量与 ESP 基线。

### 出事之后

先快照 ESP（ `dd` 或镜像），保留 `*.original` 、 `failsafe` 、EFI 文件、 `dmesg` 、 `/proc/1/environ` 、 `taint` 、模块列表，再动手恢复。恢复不要直接拿备份覆盖——先确认备份本身是否被替换；按发行版文档重铺 GRUB（例如 `apt reinstall grub-efi-arm64-signed` 后用 `grub-install` 重建），再重建哈希基线。如果攻击者已经拿到 root，换 GRUB 只是拔钉子，凭证、SSH key、内核模块、持久化项都要一起清。

![img4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/69b9999bff6f1a04.jpg)

▲ 三层检测：ESP 基线最便宜，启动度量最稳，运行时上下文用于已感染排查

## 07 · 收尾：Bootkitty 是警报，Silverseal 是信号

Bootkitty 证明的是「Linux 也能被 bootkit 改写」；Silverseal 证明的是「这件事可以被工程化、被配型、被跨架构复用」。前者是警报，后者是信号。

把两者放在一起，最值得记住的不是某个 magic 常量，而是一句成本判断： **比的不是谁有 0day，而是谁先把目标内核的构建吃透。** Bootkitty 靠硬编码偏移，所以换内核就崩；Silverseal 靠 profile，所以换内核就失败关闭，但换架构只需要重做一份配型单。攻击者在往「工程化」走，防守方如果还停在「找样本哈希」，就会一直慢半拍。

对蓝队，最实际的动作是三个：把 ESP 纳入基线，把 Secure Boot 和模块签名用起来，把启动度量接进告警。对红队，最值得研究的不是那 172 字节，而是 profile 的生成流程——它决定了这套东西能打谁、不能打谁、维护成本有多高。

最后把边界说清楚：本文是源码与公开报告层面的分析，ARM64 链条没有在实机上跑通，YARA 草案没有在真实样本上验证；Silverseal 是需要 root 与 ESP 写权限的研究框架，不是「一键感染」的工具。所有检测与演练，请限定在自有环境或明确授权的目标内。

## 参考

• ESET, *Bootkitty: Analyzing the first UEFI bootkit for Linux* （2024-11-27，含 12-02 更新）：https://www.welivesecurity.com/en/eset-research/bootkitty-analyzing-first-uefi-bootkit-linux/

• Binarly, *LogoFAIL Exploited to Deploy Bootkitty, the first UEFI bootkit for Linux*：https://www.binarly.io/blog/logofail-exploited-deploy-bootkitty-first-uefi-bootkit-linux

• Ars Technica, *Code found online exploits LogoFAIL to install Bootkitty Linux backdoor*：https://arstechnica.com/security/2024/11/code-found-online-exploits-logofail-to-install-bootkitty-linux-backdoor/

• USENIX WOOT 2025 / ACM, *BOOTKITTY: a stealthy bootkit-rootkit against modern operating systems*：https://dl.acm.org/doi/10.5555/3769714.3769732

• Silverseal 仓库：https://github.com/Idov31/Silverseal

• ARM64 支持提交：https://github.com/Idov31/Silverseal/commit/7ad1444e3c2bb6ae0d6b0f4ac3af365043c8f3fb

• 作者 YARA：https://github.com/Idov31/Silverseal/blob/master/silverseal.yara

• ARM64 fixture manifest：https://github.com/Idov31/Silverseal/blob/master/fixtures/arm64/7.0.0-31-generic/manifest.json

• Linux 内核模块签名文档：https://docs.kernel.org/admin-guide/module-signing.html

• Linux 内核 taint 文档：https://docs.kernel.org/admin-guide/tainted-kernels.html
