---
title: 【微信】Silverseal：一个在开机流程中「加载 rootkit」的 Linux UEFI bootkit
source: https://mp.weixin.qq.com/s/rqLG2Z3AjxVEZdIOBSXEhQ
source_host: mp.weixin.qq.com
clip_date: 2026-09-16T15:02:38+08:00
trace_id: 024beb07-808d-4b68-8c9b-ae6283f4b164
content_hash: c05321e7123b709d80925b3b91113ad1db5553dd8ab256fe50ef6b70a39af06d
status: synced
tags:
  - 微信
  - Linux安全
  - 内核
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Silverseal 是开源 Linux UEFI bootkit：开机时替换 grubx64.efi 并两次 hook，改写内核 late_initcall 表，最终由 kworker 加载未签名 LKM。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3dd75244-d011-81d0-bede-d2c809e622ec
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Silverseal 是开源 Linux UEFI bootkit：开机时替换 grubx64.efi 并两次 hook，改写内核 late_initcall 表，最终由 kworker 加载未签名 LKM。
> 
> - **核心链条：** UEFI 阶段备份并替换 `grubx64.efi`，在 GRUB 内按签名 `48 89 75 B8 FF D0` 挂钩装内核函数（13 字节 `call r10` detour），再钩 `zstd_decompress_dctx` 取得解压后 vmlinux 的地址与大小。
> - **关键写入：** 解析 ELF 定位 `.init.data + 0x40` 的 `initcall_levels[8]`，覆写 LateInitcall 区间最后一条 4 字节 prel32 entry，指向 `.text` cave 中的 stager。
> - **加载手法：** stager → `schedule_work` → kworker 中 `msleep(10000)` → `call_usermodehelper("/sbin/insmod","/silverseal_rootkit.ko")`，用户态无 `execve` 事件、进程树父节点为 `kworker/*`。
> - **无需 KASLR/`/dev/mem`：** 借助内核自身解压输出参数获得目标地址；地址翻译靠 PT_LOAD 段反查，函数定位靠模式串+固定回退距离（0x40/8/0x1E），换内核即需重新逆向。
> - **边界与检测：** 强耦合 Ubuntu 24.04 6.8.x，未解决 Secure Boot，需 ESP 可写与重启；首要 IOC 是 `\EFI\ubuntu\failsafe` 文件，另可查 `tainted` 位 E、根目录 `.ko`、`late_initcall` 表尾部 prel32 异常，作者已附带 YARA 规则。

**赛博57库** *2026年9月16日 14:20*

TECH EVANGELISM · LINUX UEFI BOOTKIT

## Silverseal：一个在开机流程中「加载 rootkit」的 Linux UEFI bootkit

八步链条讲清全篇：替换 grubx64.efi → 双 detour → 内核解压期改写 late_initcall → kworker 里 insmod 未签名 LKM；附红队用法、边界与 9 个检测点（成稿 2026-09-15）

赛博57库

2026-09-15 · 红蓝对抗 · 引导级持久化 / 内核加载链 / 检测工程

📌 本文怎么读

第 01 节先声明威胁模型，第 02 节用一张表把八步链条做一个全局展示（第一屏即可通读全局）；第 03～06 节按源码顺序拆解两处 detour、initcall 表改写与三段 shellcode；第 07～09 节回答「为什么不需要 KASLR」、红队怎么用、边界在哪；第 10 节是九个检测点与加固优先级（含git仓库看作者自带 YARA 规则的要点）。

⚠ 边界与授权

① 本文不复现攻击：不含可运行的 bootkit/rootkit 部署包，也未在实机验证引导链，全部结论来自公开源码逐行审阅（仓库状态 2026-05-01）；② 文中字节、偏移、magic 常量均可在仓库里逐条核对；③ 演练脚本与检测规则仅限授权范围内的快照虚拟机与自查使用；④ 检测与加固建议请在自有环境验证后落地。

**一句话说清**：Idov31/Silverseal 把「加载一个未签名 Linux 内核模块」这件事从用户态搬进了开机流程——UEFI 阶段替换 `grubx64.efi` ，hook在 GRUB 装载内核的函数，在内核刚解压出的 vmlinux 镜像上改写 `late_initcall` 表里的一条 4 字节 entry，最后由内核自己的工作队列调 `call_usermodehelper("/sbin/insmod", "/silverseal_rootkit.ko")` 完成加载。全程不产生用户态进程痕迹、不依赖 KASLR 泄漏、不碰 `/dev/mem` 。 **三件套**： `silverseal-bootkit` （Rust/UEFI，x64 EFI 应用，内含 4 段 NASM 模板）＋ 三段 shellcode 装载器（stager / worker / worker_tail）＋ `silverseal-rootkit` （Rust-for-Linux LKM，当前是 hello-world 骨架）。 **红队看它**：T1542.001 引导级持久化 + T1014 rootkit + T1574 模块加载路径劫持；写入点在 ESP（FAT32，常规文件完整性监控不覆盖），执行点在开机早期（任何 HIDS/EDR agent 都还没加载），加载动作发生在内核线程上下文（没有用户态 `execve` 事件可审计）。 **蓝队看它**：作者随源码一并发布了 YARA 规则（罕见）；本文把检测点整理成 9 个位置，首重—— `/boot/efi/EFI/ubuntu/failsafe` 这个文件 **只由该 bootkit 创建**，正常 Ubuntu 根本没有它。

|     |     |
| --- | --- |
| 项目  | 事实  |
| 仓库  | github.com/Idov31/Silverseal（分支 master，GPL-3.0） |
| 作者  | Ido Veltzman（Idov31）——Nidhogg、Venom、Cronos、Sandman、NovaHypervisor 的作者 |
| 体量  | 125 stars；建库 2026-03-20；最后提交 2026-05-01（ `Added YARA rule` ） |
| 定位  | 自我描述为 Linux 后渗透框架：bootkit + rootkit loader + rootkit |
| 平台  | x86_64 Linux；目标内核为 Ubuntu 24.04 LTS 6.8.x（脚本另有 6.17 Rust 内核构建流程） |
| 构建  | bootkit： `cargo build --release` （需要 `nasm` 预汇编 4 段 shellcode）；rootkit：Kbuild `make` （Rust-for-Linux 外部模块） |

口径声明：本文是 **源码级审阅** （ `boot_hooks.rs` 697 行、 `kernel_hooks.rs` 586 行、4 个 asm 模板、YARA 规则、commit 史与 README）， **未在实机复现引导链**。文中所有字节、偏移、magic 常量都可在仓库里逐条核对；涉及"会发生什么"的判断，凡是我没有实测的都会写明。本文不提供可直接武器化的部署包，脚本与规则仅用于授权范围内的演练与检测开发。

## 01 · 威胁模型：为什么 Linux 红队开始往引导层走

Linux 上的常规持久化路径，防守方这些年已经铺满了检测：cron/ `systemd` 单元有文件监控，SSH key 有目录基线， `LD_PRELOAD` 有动态库加载审计，LKM 有模块加载审计与 `taint` 标记，eBPF 有加载器审计与签名策略。真正难防的一层不在操作系统内部，而在 **操作系统启动之前**：

01 **写入点**： `/boot/efi` 是 FAT32 的 ESP 分区。日志采集器装在内核里，文件完整性监控通常只覆盖根文件系统——ESP 常常是一块"没人看"的可写区域；

02 **执行点**：UEFI 引导阶段，Linux 内核还没开始执行，更没有 LSM 策略、模块签名强制、EDR 的内核组件。此时往内存里写什么，就是"既成事实"；

03 **证据点**：如果加载内核模块的动作由内核线程（ `kworker` ）发起，用户态审计看不到 `insmod` 进程，进程树检测断链。

Windows 世界早已把这条路走熟（BlackLotus、memN0p 的 RedLotus——README 里就引用了它）。Silverseal 的意义是：把同一套范式 **完整地、用现代 Rust 工具链、开源可读地** 移植到 Linux，并顺手给防守方留了一份 YARA 规则。它是一件"教材型武器"。

## 02 · 一次开机里的八步：先给全局印象

![img1：Silverseal 八步链条与三个检测面（ESP 写点 / 引导期执行点 / 内核线程加载点）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c6c5c434297dd1a.jpg)

img1：Silverseal 八步链条与三个检测面（ESP 写点 / 引导期执行点 / 内核线程加载点）

|     |     |     |     |
| --- | --- | --- | --- |
| 步   | 位置  | 动作  | 结果  |
| 1   | 安装期（root 用户态） | `grubx64.efi`<br><br>→ `grubx64.efi.original` ，bootkit EFI → `grubx64.efi` | ESP 上引导程序被换掉 |
| 2   | UEFI | bootkit 入口 `main()` ，日志走 COM1 串口 | bootkit 拿到控制权 |
| 3   | UEFI | `load_original_grub()`<br><br>：按自身设备路径拼出 `\EFI\ubuntu\grubx64.efi.original` 并 `load_image` | 原 GRUB 被载入，但还没执行 |
| 4   | UEFI | 在 GRUB 镜像里按 6 字节签名 `48 89 75 B8 FF D0` 找到 `grub_arch_efi_linux_boot_image` ，写入 13 字节 detour | GRUB 的装内核函数被挂钩 |
| 5   | UEFI | `start_image()`<br><br>启动原 GRUB | 用户看到的是 **熟悉的 GRUB 菜单，毫无异常** |
| 6   | 引导尾段 | 选内核后 GRUB 调被钩函数 → bootkit 在 vmlinuz 里按签名 `F3 0F 1E FA 53 48 89 FB 48` 找到 `zstd_decompress_dctx` ，jmp detour | 内核解压函数被挂钩 |
| 7   | 内核解压瞬间 | 钩子拿到解压后 vmlinux 的地址与大小 → 找 `.text` /`.data` 空洞、写 4 段载荷、解析 `.init.data` 覆写 `late_initcall` 最后一条 entry | 内核镜像在 **运行前** 被改写 |
| 8   | 内核 late_initcall | stager → `schedule_work` → `kworker` → `msleep(10s)` → `call_usermodehelper("/sbin/insmod","/silverseal_rootkit.ko")` | 未签名 LKM 装载完成 |

第 5 步值得单独圈出来：这不是"替换 GRUB"，而是 **寄生在 GRUB 上**。菜单、倒计时、内核参数、恢复模式全部照旧，运维看不出任何差异——这是引导级持久化最需要的属性。

## 03 · 第一处 detour：13 字节点在 GRUB 里

bootkit 先在自己的加载镜像上做定位。 `binary_search()` 就是个朴素字节扫描（未用 SIMD），扫的是 6 字节签名，注释直接写明了它的来源—— `grub_arch_efi_linux_boot_image` 的这段汇编：

`mov     [rbp+var_48], rsi   ; 48 89 75 B8`

`call    rax                 ; FF D0`

`rax` 里是内核入口， `rsi` 是参数——这就是签名被选中的原因： **它同时命中了函数入口特征与调用现场**。找到地址后写 13 字节 detour：

`49 BA <imm64>  41 FF D2     ; mov r10, <hook>; call r10`

仓库里有两个版本，区别只在最后一个字节： `inline_hook()` 用 `41 FF D2` （ `call r10` ，会压入返回地址）， `inline_jump_hook()` 用 `41 FF E2` （ `jmp r10` ，不改栈）。这个区分不是风格问题：

• **GRUB 这处用 `call`**：被 patch 的是一条真实调用点，压栈的返回地址让钩子函数返回时能回到原函数内的下一条指令，天然形成 trampoline；

• **内核那处用 `jmp`**：目标是函数 **入口**，x64 下被调用者可能读取栈上传参，多压一个返回地址会破坏栈布局，注释里写得很直白——"keeps the original caller's stack layout intact"。

钩子函数里有一个很有味道的技巧：

`core::arch::asm!("mov {}, rax", out(reg) original_fn_addr, ...);`

`core::arch::asm!("mov {}, r12", out(reg) real_kernel_entry, ...);`

它不去解析 X64 ABI 的栈帧，而是 **直接读调用点没被覆盖的寄存器**： `rax` 里还留着原函数指针（GRUB 那句 `call rax` 的目标）， `r12` 里是真正的内核入口。随后先 `restore_inline_hook()` 把原字节写回去、再调用原函数——"用一次就撤钩"，避免自己钩自己造成递归。

## 04 · 第二处 detour：在内核解压的那一刻拿到整块 vmlinux

![img2：解压 hook 的时序——引导服务之外，用裸内存与 ELF 解析改写内核](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/78657e9dc59fda1d.jpg)

img2：解压 hook 的时序——引导服务之外，用裸内存与 ELF 解析改写内核

上一处钩子只是入场券。真正的关键判断是 **钩哪个函数**： `zstd_decompress_dctx` 。理由是它的原型把答案直接递到手上：

`pub extern "sysv64" fn zstd_decompress_dctx_hook(`

    `dctx: usize, dst: usize, dst_capacity: usize,`

    `src: usize, src_size: usize) -> isize`

`dst` / `dst_capacity` 就是 **解压后 vmlinux 在内存中的起点与容量**。这一手一次解决四个问题：

• 不需要 KASLR 泄漏——内核自己把自己解压到了这个地址；

• 不需要读 `/proc/kallsyms` 、不需要 `/dev/mem` 、不需要页表遍历；

• 不需要猜内核物理位置—— `dst` 就是物理内存里可直接写的目标；

• 时序上完美：此刻内核一行 C 代码都没跑，模块签名强制、LSM、EDR 的内核组件全都还在磁盘上躺着。

钩子先 `restore` 再调原函数，拿到返回值后立刻动手（完整流程 697 行，每一步都带 `checked_add` 溢出检查与失败回退——失败就"什么都不做"，让系统正常启动）。此时它已处于 `ExitBootServices` 之后的时段，之所以还能工作，是因为 **新代码只做裸内存读写与纯 ELF 解析**，不调用任何 UEFI 引导服务（日志走 COM1 端口 I/O）。

## 05 · 改写一条 4 字节：initcall 表的 prel32 算术

Linux 把各阶段初始化函数放在 `.initcall6.init` 之类的段里，每个 entry 是 **4 字节有符号相对偏移**： `entry_virt + i32 = target_fn` 。而每个阶段的区间边界，由 `.init.data` 里的 `initcall_levels[]` 指针数组给出（索引 0=early、…、8=late、9=console）。Silverseal 的实现：

01 用 `elf` crate 解析内存里的 vmlinux，定位 `.init.data` ；

02 从 `.init.data + 0x40` 读 `levels[8]` （LateInitcall）与 `levels[9]` ，得到该阶段的 entry 区间；

03 取区间 **最后 4 字节** 作为目标 entry，用 PT_LOAD 段反查把它翻译成物理地址；

04 读回原来的 i32，还原出被顶掉的那个初始化函数地址（留给 stager 尾跳用）；

05 写入新的 prel32： `stager_cave_virt - entry_virtual_address` 。

为什么是 **late** initcall：initcall 从 early 一路执行到 console，到 late 阶段 rootfs 已挂载， `/sbin/insmod` 与 `/silverseal_rootkit.ko` 都已经能被访问。为什么挑 **最后一条**：它位于表尾，改写它不会动到其它 entry 的相对跳转链，而它本身依然会被正常执行到——用最小的改动面换最大的确定性。

## 06 · 三段 shellcode：10 秒等待与 kworker 里的 insmod

![img3：三段 shellcode 分工——stager 排队、worker 计时、worker\_tail 调 call\_usermodehelper](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ef26d2eec71b939c.jpg)

img3：三段 shellcode 分工——stager 排队、worker 计时、worker_tail 调 call_usermodehelper

载荷分成 4 个"洞"（cave），扫描规则是 **连续 `0x00` / `0x90` 块**，并且只在指定 ELF 段里找：三个可执行洞放 `.text` ，一个数据洞放 `.data` ——因为内核会把 `.data` 的 NX 位打开，从数据段取指会直接翻车。commit 史里留着这堂课： `Work item executed but getting permission violation error in dmesg` 。`.text` 洞还会跳过段内前 `0x1000` 字节，避开 ELF 头附近的敏感区域；三个洞之间用"已占用区间"互斥，防止互相覆写。

`stager` 只有 4 条语义（NASM 里用哨兵常量占位，Rust 侧回填 disp32/rel32）：

lea rdi, \[rip + 0x11223344\]; &work_struct（.data 洞）

`lea     rax, [rdi + 8]`

mov \[rdi + 8\], rax; work->entry 自指，初始化链表

`lea     rax, [rip + 0xAABBCCEE]`

`mov     [rdi + 24], rax           ; work->func = worker`

`call    schedule_work             ; rel32`

jmp original_initcall; rel32，尾跳原初始化函数

`work_struct` 的 `data` 字段被写成 `0x000F_FFFF_FFE0_0000` ，也就是 `WORK_DATA_INIT()` 里的 `WORK_STRUCT_NO_POOL` —— **这里有个必须记住的版本耦合点**：它成立的前提是目标内核 `CONFIG_DEBUG_OBJECTS_WORK=n` （Ubuntu 24.04 的 6.8 内核正是如此）。换一个打开该选项的内核，这个 magic 值就是错的。

`worker` 干一件事： `mov edi, 10000; call msleep` —— **在 workqueue 里睡 10 秒**。这是整个链条里最"土"也最实用的一步：late initcall 阶段虽然 rootfs 已挂载，但 systemd、udev、模块工具链都还没就绪，睡 10 秒是给文件系统与 `/sbin/insmod` 一个宽裕的可用窗口。它不是精确同步，是"赌 10 秒够了"——顺便留下一个可被蓝队利用的时序特征（见第 10 节）。

`worker_tail` 组好参数后收网：

lea rsi, \[rip +...\]; argv 数组（.data 洞）

`lea     rdi, [rip + ...]   ; "/sbin/insmod\0"`

`mov     [rsi], rdi         ; argv[0] = "/sbin/insmod"`

lea rax, \[rdi + 0x0D\]; 0x7F 哨兵被回填成 13

`mov     [rsi + 8], rax     ; argv[1] = "/silverseal_rootkit.ko"`

`xor     edx, edx           ; envp = NULL`

`push    2`

`pop     rcx                ; UMH_WAIT_PROC`

`call    call_usermodehelper`

于是 `/sbin/insmod` 由 **内核工作队列线程** 拉起——进程树上的父进程是 `kworker/*` ，用户态审计里没有对应的 `execve` 链。这就是"把加载动作藏进内核上下文"的全部技术含量：不是破解签名算法，而是让行为链失去可审计的起点。顺带说清边界：Ubuntu 默认内核允许加载未签名模块（只打 `taint` 标记），所以这个演示能成；若目标内核设了 `module.sig_enforce=1` 或 `lockdown=confidentiality` ，这条链会止步于 `insmod` 的拒绝。

## 07 · 工程亮点：为什么它不需要 KASLR、不需要 /dev/mem、还不容易变砖

把源码读完，真正值得红队借鉴的是这几个设计决策：

01 **借内核自己的手拿目标**：钩解压函数的输出参数，而不是去泄漏内核基址。这比"写驱动直接改内存"优雅一个量级，也更抗内核加固；

02 **纯 ELF + PT_LOAD 反查做地址翻译**：虚拟↔物理双向换算都靠段表，不依赖页表遍历，代码量小、失败模式清晰；

03 **模式串定位代替符号表**： `call_usermodehelper` 、 `schedule_work` 、 `msleep` 三个函数都是"签名 + 固定回退距离"定位（0x40 / 8 / 0x1E 字节），规避了符号表在不同构建下的差异——代价是 **换内核就要重新逆向**；

04 **重定位在 Rust 侧完成**：shellcode 模板里全是 4 字节哨兵（ `0x11223344` 、 `0xAABBCCDD` 、 `0xDDEEFF00` …），运行时算好 disp32/rel32 回填，代码段不需要可写；

05 **防砖保险丝**：ESP 上的 `\EFI\ubuntu\failsafe` 文件存一个 u16 失败计数，上限是 **1**；一旦定位或挂钩失败，写 1 后 **永久停用 hook**，之后老老实实启动原 GRUB。这个设计是负责的——但它不复位，等于一次失败就"自我钉死"，实战里要手动删文件才能恢复；

06 **每一处失败都回退到"什么都不做"**：所有 `None` / `Err` 分支都是打印日志 + 调原函数。对一个要在别人机器上开机运行的组件来说，这比任何花哨技术都重要。

## 08 · 红队视角：它值什么、怎么落地、哪些地方露马脚

|     |     |     |
| --- | --- | --- |
| 战术项 | Silverseal 的实现 | 绕开的检测面 |
| T1542.001 引导级持久化 | ESP 上替换 `grubx64.efi` ，链式加载原 GRUB | 文件完整性监控通常不覆盖 ESP；重装系统不清理 ESP |
| T1014 Rootkit | 引导期改写内核镜像，可加载任意 LKM | 内核态 EDR/内核组件尚未加载，无法观测"被改之前"的状态 |
| T1574 劫持执行流 | 走内核 `call_usermodehelper` + `insmod` | 用户态 `execve` 审计、进程树父子关系检测 |
| 反取证 | 无需在磁盘上留载荷执行器；`.ko` 放在根目录 | 常规磁盘镜像取证（ESP 常被遗漏）、用户态持久化清理无效 |

**落地前置条件（必须说清）**：root 权限、ESP 可写、以及"允许重启"（或虚拟机快照/物理接触）。Secure Boot 这一环项目没有解决—— `setup_silverseal.sh` 就两句 `mv` ，直接替换 `grubx64.efi` ，既不带签名也不走 shim，所以实机上要么关掉 Secure Boot，要么自己拿密钥签。

**OPSEC 瑕疵清单（原作者显然是为教学而非实战交付的）**：

• 二进制的日志等级是 `LevelFilter::Debug` （走 COM1 串口）， **几十条调试字符串整句编进了 EFI 文件**——YARA 规则里的 `$hook_log_*` 直接拿它们做特征；

• 明文常量 `"/sbin/insmod"` 与 `"/silverseal_rootkit.ko"` 既留在 EFI 里，也留在内核内存的 `.data` 洞里（后者运行时不会被改写）；

• 文件名带刺： `grubx64.efi.original` 、 `failsafe` 、根目录的 `silverseal_rootkit.ko` ——每一个都是自查清单上的一行；

• 4 字节哨兵常量（ `0x11223344` 等）在 **未打补丁的模板** 里原样存在，二进制扫描直接命中。

换句话说：把这份代码当"实战载荷"用，第一天就会被自己的特征抓住；把它当"引导层作战的工程范式"读，才是它真正的价值。

## 09 · 边界：它不是魔法，失败模式要背下来

• **版本强耦合**：zstd 签名、三个函数的回退距离（0x40/8/0x1E）、 `initcall_levels` 偏移 0x40、 `WORK_STRUCT_NO_POOL` 取值，全部对着 Ubuntu 24.04 LTS 6.8.x 调的。内核一升级，大概率全链路静默失效（代码会退化成"正常启动"）；

• **Secure Boot 未解决**：见上。这决定了它当前只能在关闭安全启动或自有密钥的环境里演示；

• **直接改内存 = 直接承担 hang 的风险**：cave 找不到、rel32 溢出、initcall 写错，任一情况都可能让机器卡在启动阶段；仓库里 4 月末那几条 commit（ `Maybe with queue delayed work pattern` 、 `Kinda works better with a work queue` ）就是踩坑过程；

• **rootkit 本身还是 hello world**： `silverseal_rootkit.rs` 只有 `pr_info!("hello world")` ， `module!` 元数据里写着 GPL。 **这个项目的交付物是"装载链"，不是"后门功能"**——真正的 rootkit 面（syscall hook、隐藏文件/进程、凭证窃取）留白给读者。把它读成"Linux 后门一键部署"就完全跑偏了。

## 10 · 蓝队/紫队：把检测点钉在九处

![img4：九个检测点与三类盲区——引导侧基线、运行时模块审计、内存取证](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/82647a34ec474417.jpg)

img4：九个检测点与三类盲区——引导侧基线、运行时模块审计、内存取证

**引导侧（事后核查最有效）**

01 **ESP 基线比对**： `sha256` 你的 `grubx64.efi` ，与发行版包内文件（ `dpkg -S` / `apt-get download grub-efi-amd64` 解包）逐字节对照；大小、PE 编译时间戳与包内不一致即为强信号；

02 **`\EFI\ubuntu\failsafe` 文件存在**：这是该 bootkit 独有产物，正常 Ubuntu 没有这个文件—— **最便宜、最直接的 IOC**；

03 **YARA 扫 ESP**：直接用作者自带的 `silverseal.yara` 。规则要点是一组"必须同时命中"的条件： `uint16(0)==0x5A4D` + `pe.machine==0x8664` + `pe.subsystem==10` （EFI 应用）+ `filesize<256KB` + 两条 `\EFI\ubuntu\...` 宽字符串 + 两个 loader 串（ `/sbin/insmod` 、 `/silverseal_rootkit.ko` ）+ 至少 2 条调试串 + 至少 2 个代码模式 + 至少 2 个哨兵常量。这种"多条件与"的写法误报率极低，值得抄进自家规则集；

04 **度量启动**：TPM PCR（尤其 PCR4/PCR7）变化 + 远端证明/IMA appraisal。这才是这个威胁的正解——不是"装个 agent 看文件"，而是让启动链的可信度可被验证；

05 **应急修复**： `apt reinstall grub-efi-amd64` 重铺 ESP 上的引导程序（记得先留存证据），这是最快的"拔钉子"手段。

**运行时（能不能看见第 8 步）**

01 **模块加载事件审计**：auditd `-a always,exit -F arch=b64 -S init_module,finit_module` ；eBPF 侧挂 `module:module_load` tracepoint。关键不是"有没有加载"，而是 **发起者的上下文**：父进程是 `kworker/*` 、 `insmod` 路径来自内核线程、且没有对应的用户态 `execve` ——这三条合起来就是异常；

02 **内核污染位**： `cat /proc/sys/kernel/tainted` ， `E` （bit 12 = 4096，unsigned module）在"没有做任何模块安装操作"的机器上出现，就是告警；

03 **模块与文件基线**： `lsmod` / `/proc/modules` 与"包管理记录 + 已知模块清单"做差集； **根目录下出现 `.ko` 文件** 本身就是异常（ `/silverseal_rootkit.ko` ），再用 `modinfo` 看 `vermagic` 是否精确匹配当前内核（手工编译模块的典型指纹）；

04 **内存取证**：在内核空间扫明文串 `"/sbin/insmod"` 与 `"_rootkit.ko"` （这两个字符串运行时不会被回填）；检查 `late_initcall` 表最后一条 entry 的 prel32 是否指向 `.text` 之外或指向一个只含 `0x00/0x90` 的"空洞"；有条件时用同版本 `vmlinux` 对 `.text` 做逐段哈希比对——cave 与 patch 会立刻现形。

**加固优先级（按性价比排序）**：① 打开 Secure Boot 并 **用你自己的密钥**，或至少每次启动校验 ESP；② 需要强制签名模块的内核启动参数（ `module.sig_enforce=1` ）或在合适的机器上用 `lockdown=confidentiality` ；③ 用 TPM 绑定磁盘自动解密（PCR 变了就解不开）；④ 内核升级后 **重设基线**，因为这条链本身就是"跟着内核版本走"的；⑤ 把 ESP 纳进变更审计范围——它现在多半是个监控盲区。

## 11 · 收尾：把它当教材，而不是当武器

引导层攻防有一个残酷的结论： **比的不是谁有 0day，而是谁先在内核里跑起来。** Silverseal 用一段不到 700 行的 Rust 钩子 + 四段几十字节的 shellcode，把"内核模块加载"这件被审计得最透的动作，搬到了所有审计组件都还没醒来的时间点上。它对红队的价值是范式——目标源码级的时间窗（解压回调）比任何漏洞都稳；对蓝队的价值是靶场——一份可复现的 T1542.001 样本，外加一份作者主动送上的 YARA 规则。

作者本人是防守出身、写过 Nidhogg 这类攻击工具的人，又在仓库里一并交付检测规则——这本身就是他想表达的态度： **工具的意义在于把对抗的边界画清楚**。建议的读法是：先读 `boot_hooks.rs` 第 1～160 行理解两级挂钩，再读第 200～500 行理解 cave 与重定位，最后拿第 11 节的九个检测点回去量一遍自己的云主机与物理机。至于真要动手，务必在快照虚拟机里、并在你自己拥有明确授权的目标上——毕竟这条链失败时的表现，是一台起不来的机器。

参考与延伸：Idov31/Silverseal（GPL-3.0）；uefi-rs 文档；Elixir Bootlin 内核源码；memN0p/redlotus-rs（Windows UEFI bootkit 的开源先例）；MITRE ATT&CK T1542.001 / T1014 / T1574。
