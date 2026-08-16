---
title: 【微信】IonStack 第三部分：用 GhostLock 获取 Android 17 Root
source: https://mp.weixin.qq.com/s/E3kZcJQ5IuyNhaD6T9Y4MA
source_host: mp.weixin.qq.com
clip_date: 2026-08-16T14:47:16+08:00
trace_id: 4ad4fc1c-c41f-4b51-8dc9-b474e5ca900c
content_hash: 3a95dd1248785be060c4b8f89827f232c191600c365738fc83d8718295a6db83
status: synced
tags:
  - 微信
  - Android逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: GhostLock（CVE-2026-43499）被转化为全球首个公开的 Android 17 root，核心路径是绕过 CFI、用 boot_id 泄露 KASLR、劫持 ashmem fops 最终任意读写并篡改 cred。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3be75244-d011-819c-896d-fea0b65982d9
ioc:
  cves:
    - CVE-2026-43499
    - CVE-2026-53166
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GhostLock（CVE-2026-43499）被转化为全球首个公开的 Android 17 root，核心路径是绕过 CFI、用 boot_id 泄露 KASLR、劫持 ashmem fops 最终任意读写并篡改 cred。
> 
> - **内核原语：** 通过回收已释放的栈帧并伪造 `rt_mutex_waiter`，获得受限的任意指针写入；在 Android/ARM 上用 `pselect` 喷射栈帧，用 `sendmsg` 的 `sk_buff` 数据放置伪造 `rt_mutex`，并用 KernelSnitch 定位。
> - **CFI 绕过：** Android 17 默认启用基于函数签名的 Clang CFI，只能跳转到同签名函数；作者将 `ashmem` 的 `read_iter`/`write_iter` 替换为 `configfs` 的同签名 VFS 处理函数，形成受限内核读写。
> - **KASLR 泄露：** arm64 linear map 基址固定但不可执行，仍需真实 slide；通过覆盖 `/proc/sys/kernel/random/boot_id` 的 sysctl `.data`，使其指向 netfilter `loggers[0][1]` 中的 `&nfulnl_logger`，读回 UUID 格式并解码得到 KASLR slide。
> - **提权收尾：** 不受信任 App 以 `/dev/ashmem<boot_id>` 访问 ashmem；用 configfs 写覆盖 `pipe_buffer.page` 升级为无限制读写，遍历任务链修改子进程 `cred`（uid/gid 清零、capability 置满、清除 seccomp），并写 `selinux_enforcing=0` 及把 `sid` 改为内核 sid。
> - **缓解与生态：** 启用了 `CONFIG_RANDOMIZE_KSTACK_OFFSET_DEFAULT` 时成功率约 1/8 或更低，否则最坏约 1.5%；社区已把利用移植到 Samsung Galaxy、Vivo PD2405、Moto G05、Redmi K80 Ultra 等设备。

**securitainment** *2026年8月16日 14:26*

| 原文链接 | 作者  |
| --- | --- |
| https://nebusec.ai/research/ionstack-part-3/ | Nebula Security |

> GhostLock（CVE-2026-43499）是 Nebula Security 发现的一个 Linux 内核漏洞，自 2011 年以来存在于每个主要发行版中。在将其转化为稳定的提权和容器逃逸并在 kernelCTF 中赢得 $92,337 后，我们更进一步，用 GhostLock 开发了全球首个公开的 Android 17 root。本篇 writeup 涵盖了将利用程序迁移到 Android 所使用的额外利用技术。

在上一篇中，我们讨论了 GhostLock（CVE-2026-43499）的根因——如何回收"已释放"的栈、伪造 `rt_mutex_waiter` 并获得受限的指针写入、最终从 `inet6_protos` 获得控制流劫持，以及使用 DirtyMode 在 Linux 上完成提权。

由于 Android 上默认启用了控制流完整性（CFI），我们需要找到另一种替代方案来帮助我们完成提权的最后一步。

此外，由于我们现在针对的是 ARM 设备且 KPTI 已启用，prefetch 侧信道不再容易使用，因此我们还需要另一种方法来绕过 KASLR。

当然，我们也需要改变回收栈的策略。

> 如果没有启用 CFI 保护（如 `CFI_CLANG` 、ARM `BTI` 或 Intel `CET` ），在控制函数指针后获得任意代码执行要容易得多：RetSpill、Ret2BPFJIT、KEPLER、cpu_entry_area pivot、panic_on_oops disable……以及常规 ROP。

## 背景知识

> 我对 kCFI、KernelSnitch 和 linear map 很熟悉，想直接看利用细节。

### （内核）Android 上的控制流完整性

2022 年之前，Android 使用基于跳转表的白名单来检查合法的调用/跳转目标并保护 CFI。该功能需要启用 LTO，这带来了沉重的编译开销，而且无法保护一些灵活的函数，如 JIT 编译的 BPF 程序（对这些函数调用完全没有检查）。

2022 年，Android 切换到基于函数签名的新 Clang CFI 功能。它对函数参数和返回值的类型进行哈希，并在每次间接调用前检查目标哈希。这种方法支持更灵活的目标，且不再依赖 LTO。

哈希在编译时烘焙，发射到一个 `__cfi_<func>` "前导"中，位于每个函数入口的正前方，调用方在每次间接调用前检查目标的哈希。

检查本身如下图所示：

![CFI 概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/18f8d87d125ef2a3.svg)

CFI 概览

![CFI 概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e873f13733fb3689.svg)

CFI 概览

调用方加载被调用方前方的哈希，并在调用点进行比较。在上图中， `proc_do_uuid` 和 `proc_dostring` 共享相同的参数和返回值类型，因此它们会有相同的哈希，CFI 将允许对它们中任何一个的间接调用，而例如 `commit_creds` 具有不同的原型，会陷入 `report_cfi_failure()` 。

使用 Android 上最新的 CFI 实现，我们只能将函数指针劫持到具有相同签名（即完全相同的参数和返回值类型）的另一个函数。在下面的 writeup 中，我们将 `ashmem` 的 `read_iter` / `write_iter` 替换为 `configfs` 的，因为它们都是类型为 `ssize_t (struct kiocb *, struct iov_iter *)` 的 VFS 处理函数（因此它们会有相同的哈希）。

> **能否伪造哈希？**

### 探测（几乎）任意内核对象的地址

访问哈希表等内核数据结构所花费的周期数取决于其内部状态（例如空桶与冲突链）。NDSS 的初始工作表明，非特权进程可以通过受控的系统调用放大这些 **软件级** 的时间差异，并推断内核数据结构的状态。当目标哈希表将调用方的 `mm_struct` 指针折叠到其桶索引中时，对桶遍历进行计时可以恢复当前 `mm_struct` 的地址。

Lukas 的后续文章将这种时间泄漏与针对特定对象（如 `msg_msg` 和 `pipe_buffer` ）的跨缓存重用相结合。由于 `mm_struct` 从专用的 `mm_cachep` slab 分配，其泄露的地址给出了后备 slab 页的位置。通过释放该页并通过分配器操作将其回收为目标 slab，攻击者可以获得目标对象的精确地址。

### 利用 Linear Map 的免费（但有限的）KASLR 绕过

正如 Project Zero 所示，提交 `1db780bafa4c` 移除了 arm64 上的 linear map 随机化，因此 `physmap` 的基址不再被随机化。这使我们可以访问内核镜像的 rw 映射（对原始 ro 或 rx 内存为只读），地址固定，如下图所示。

![Linear map 概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/96467bbd46fca435.svg)

Linear map 概览

![Linear map 概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/48b68840ec982990.svg)

Linear map 概览

> 即使 `physmap` 被正确随机化（或启用了物理 ASLR），其基址仍然可以通过 KernelSnitch 探测。

然而，由于 Linear Map 现在被映射为不可执行，如果我们想复用一些可执行代码，仍然需要单独的 KASLR 绕过。因此我们仍然需要真正的 KASLR slide。

## 利用摘要

-   **GhostLock**
    
    \-> 在 waiter 任务的 `pi_blocked_on` 中留下一个悬垂的 `rt_mutex_waiter` 。
    
-   ① **回收** -> 使用 `pselect` 回收 waiter 的栈帧并在其上伪造 `rt_mutex_waiter` 。
    
-   ② **bootid** -> 覆盖 `boot_id` 的 sysctl `.data` ，读回 `&nfulnl_logger` 以泄露 KASLR slide。
    
-   ③ **ashmem** -> 用 `configfs` 处理函数劫持 `ashmem` 的 `fops` ，实现受限的内核读写。
    
-   ④ **pipe_buffer** -> 将 `copy_{to,from}_user` 升级为无限制的 `page*` 全地址读写。
    
-   ⑤ **获取 root** -> 禁用 SELinux 并修改 `cred` 结构体以逃逸 seccomp 并成为 root。
    

> 注意 physmap 基址是固定的，且同一个 GhostLock 原语被使用了 **两次**——第一次在 bootid 步骤中泄露 KASLR slide，然后覆盖 **`ashmem`** 的 fops。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4e8ff8660c79efa4.png)

利用概览

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/03797b44012ce720.png)

利用概览

## 利用细节

### 恢复内存写入原语

回顾 GhostLock 的初始原语。我们最终可以向一个任意（但受限的）地址写入一个指针。为此，我们需要：

-   取回已释放的栈内存（喷射）：-> 复用栈
    
-   让伪造的 `rt_mutex_waiter` 通过其结构检查和解引用：-> 伪造 waiter
    

#### 复用栈

我们仍然从在相同栈偏移处喷射受控字节开始，而帮助我们回收栈帧的系统调用是目标特定的，因为帧深度和系统调用的触及范围会随内核镜像的变化而改变。在 Pixel 10（Android 17）上，我们使用 `pselect` ，它将我们的 `fd_set` 位图复制到内核栈上，正好覆盖已释放的帧。

> `clone` / `setsockopt` / `keyctl` 及其他具有大量受控栈局部变量的系统调用工作方式相同。以下是我们的开源 PoC 代码中更多回收帧的方法。

在回收的帧上我们伪造 `rt_mutex_waiter` ：

-   `tree`
    
    / `pi_tree` ，rb 节点经过精心构造，使擦除操作能给我们一个写入原语。
    
-   `task`
    
    ，通过其 `physmap` 别名设置为 `&init_task` ，使链遍历的 task 解引用是安全的。
    
-   `lock`
    
    ，指向我们喷射到 `sk_buff` 数据中并用 KernelSnitch 定位的伪造 `rt_mutex` 。
    

#### 伪造 waiter

让伪造的 waiter 通过其结构检查和指针解引用需要在已知地址处有受控的内核内存，这与 CEA 在 x86 上扮演的角色相同。

由于 CEA 技巧在 ARM 上不再适用，这里我们用 `sendmsg` 喷射 `sk_buff` 数据——一种原始字节弹性对象——并用 KernelSnitch 加跨缓存重用来定位它。然后我们将 `lock` 指向的伪造 `rt_mutex` 放入已定位的 `sk_buff` 中，以通过遍历对 `lock` 的检查，并使出队的 rb-erase 成为我们唯一的受限写入。

### 用钉子锤击

在 Android 上，纯数据方式的 LPE 使我们的工作更轻松，因为我们不再需要应对 CFI。但现在我们得到的只是一个带有大量约束的弱指针写入，我们寻找一条类似的函数表劫持路径，就像我们在 Linux 利用中使用的那样。

Project Zero 分析了一个现代的在野 Android 利用，并分享了用相同签名的 `configfs` 处理函数覆盖 `ashmem` 的 `file_operations` 的技巧，将其 `read` / `write` 转变为 CFI 无法区分的受限内核读写。

然而，从不受信任的 App 访问 `ashmem` 随着时间推移变得越来越困难：

-   SDK 29 之前，可以直接打开 `/dev/ashmem` ，SELinux 不会报错。
    
-   面向 SDK 29（Android 10）的 App 不再能直接打开 `/dev/ashmem` ，但有一段时间我们仍然可以通过以 `targetSdkVersion` 28 或更低构建来规避这一点。
    
-   现在，即使旧的低 `targetSdkVersion` 技巧也失效了，但不受信任的 App 仍然可以通过直接以每次启动的名称打开设备节点来访问驱动程序，即 `/dev/ashmem<boot_id>` 。
    

在 Android 17 上，我们使用 `/dev/ashmem<boot_id>` 访问 `ashmem` ，并以相同方式劫持 `ashmem_misc.fops` 表，将 `configfs` 的 `read_iter` / `write_iter` 放入其中（这些处理函数是活跃的 `.text` ，因此此步骤需要我们在下一节中恢复的 KASLR slide）。

![Ashmem 任意读写概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a98007bd59dd5129.svg)

Ashmem 任意读写概览

![Ashmem 任意读写概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/da075dd1e786ea04.svg)

Ashmem 任意读写概览

如上图所示，我们可以首先使用 `ASHMEM_SET_NAME` 修改 `ashmem` 的 `private_data` ，它随后会在 `configfs` 的处理函数中被当作 `struct configfs_buffer* buffer` 处理。在我们覆盖了 `ashmem_misc.fops` 之后， `read(fd, addr, len)` 将使用 `buffer->page` 作为目标地址， `write(fd, addr, len)` 将使用 `buffer->bin_buffer` ，这最终给了我们任意内核内存读写（它来自 `copy_{from,to}_user` ，所以有少量额外检查和长度限制。但仍然足以完成 LPE）。

> **Rust 重写能拯救我们吗？**

### 泄露 KASLR，因为我们仍然需要它

现在唯一的问题是我们知道许多内核地址，但没有一个是可执行的。伪造的 `fops` 必须指向可执行内存中真正的 `configfs` 处理函数，而 linear-map 别名是不可执行的。

我们已经有来自 GhostLock 的受限任意写入，因此我们寻找一个更合适的地址来覆盖——希望是一个能泄露 KASLR 的地址，也许是通过覆盖一个长度或数据指针。

经过漫长的搜索，我们锁定了 `/proc/sys/kernel/random/boot_id` 。它的 sysctl 处理函数 `proc_do_uuid` 将表 `.data` 指针处的 16 字节格式化为 UUID 字符串。

因此，如果我们使用受限写入将该 `.data` 重定向到一个内核已经填入了活跃内核指针的槽位，读取 `boot_id` 就会将该指针以 UUID 格式打印回来。解码它并减去其已知的镜像偏移就得到了 KASLR slide。这里那个槽位是 netfilter 的 `loggers[0][1]` ，其中存放 `&nfulnl_logger` 。整个过程如下所示：

![BootID KASLR 泄露概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d0e7d82a2d4d9710.svg)

BootID KASLR 泄露概览

![BootID KASLR 泄露概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ed85142f08eb548c.svg)

BootID KASLR 泄露概览

> 这与 Project Zero 通过 `/proc/self/mounts` 读取的 `sel_fs_type` 名称指针覆盖是相同的思路，只是改经 `boot_id` 和 `proc_do_uuid` 实现。

### 最终阶段

现在我们拥有了替换 `ashmem` 函数表并获得任意内核内存读写所需的一切，是时候完成首个 Android 17 root 了！

#### 更进一步

由于 `STATIC_USERMODEHELPER` 在 Android 上已启用，我们需要多几个步骤，而不是直接欺骗 `usermode_helper` 以 root 身份执行我们的后门。

使用 `pipe_buffer` （或类似 Page Table Entry 的受害者）来读写内核内存更方便，且几乎没有检查。因此我们再次使用 KernelSnitch 定位一个 `pipe_buffer` ，然后使用 `configfs` 写入覆盖 `pipe_buffer.page` ，将读写原语升级为完全任意的一个。

> 在我们的目标上， `VMEMMAP` 是固定的，因此我们可以直接执行虚拟地址到 `struct page*` 的转换。即使设备对其进行了随机化，我们也可以扫描附近的所有内存来恢复所需的一切，因为失败的物理读写不会导致内核 panic。

#### 修改 Cred

获得无限制的读写后，我们可以从 `init_task` 遍历任务列表到我们生成的子进程并读取其 `cred` 。除了将 `uid` / `gid` 集合（real、effective、saved、fs）清零外，我们还清除 `securebits` ，将所有五个 capability 集设置为 `CAP_FULL` ，并清除任务的 seccomp mode、filter、 `TIF_SECCOMP` 和 `no_new_privs` ，使 root 子进程完全逃逸出应用沙箱。

#### SELinux 绕过

在我们通过 `cred` 的 security 指针定位到 `task_security_struct` 后，我们将其 SELinux `osid` 和 `sid` 修改为内核 `sid` 。我们还通过物理读写直接向 `selinux_enforcing` 写入 `0` 。这使 SELinux 全局变为宽容模式，因此违规访问仅被记录并允许继续。

> `selinux_enforcing` 仅在内核以 `CONFIG_SECURITY_SELINUX_DEVELOP` 构建时才可写。否则强制模式状态在构建时固定。无论哪种方式，我们的子进程仍然可以逃逸 seccomp 并从受控的 `cred` 结构体获得 root。

## 附录

完整的利用代码可以在我们的开源安全研究项目 CyberMeowfia中找到。

### 缓解措施

请查看我们第二篇博客中的缓解措施讨论部分。

注意 patch v1 引入了 CVE-2026-53166（由 NPD 引起的本地 DoS），该问题已由 `40a25d59e85b` 修复。

#### RANDOMIZE_KSTACK_OFFSET

如果目标设备上启用了 `CONFIG_RANDOMIZE_KSTACK_OFFSET_DEFAULT` ，利用成功率将降至 1/8 或更低（如果我们能回收每个可能的栈帧并用 `rt_mutex_waiter` 填充它们的话），否则在最坏情况下低于约 1.5%。

#### 内核完整性检查

一些厂商进一步加固内核，使攻击即使在任意内核内存读写之后仍然困难。Samsung KNOX 的 Real-time Kernel Protection (RKP) 在 EL2 运行一个监控器，将 `cred` 、 `task_security_struct` 和 SELinux 状态对 EL1 内核保持只读。其安全钩子还检查活跃的 `cred` 及其 `task_security_struct` 是否位于受保护的 slab 中，因此在普通内存中伪造的 `cred` 会被拒绝。

也就是说，一旦攻击者拥有无限制的任意读写，它并非不可击败。例如：

-   BH USA 2023: bad io_uring 伪造了一个带有匹配反向指针的 root `cred` ，并将其后备页的 `slab_cache` 重标记为 `cred_jar_ro` 。
    
-   BH USA 2017: Defeating Samsung KNOX with Zero Privilege 调用了 hypervisor 自身的凭证更新路径 `rkp_override_creds` 以授予全部 capability，然后触发一个合法的 UMH 让内核生成一个特权进程。
    

### 开源社区项目

我们很高兴看到社区已将 GhostLock 移植到更广泛的设备上，这里列出几个项目供参考。

-   Samsung Galaxy 系列：Root My Galaxy 及其 payloads 和 S25U 利用程序
    
-   Vivo PD2405：theVakhovskeIsTaken/CyberMeowfia
    
-   Moto G05：MhmRdd/CyberMeowfia
    
-   Redmi K80 Ultra：localhosts-A/CyberMeowfia
    

\---

Mobile · 目录
