---
title: 【微信】GhostLock 移植实录：红米 A7 Pro 免解锁 root 与每启动 P0 推导
source: https://mp.weixin.qq.com/s/tDt2dCeUKLJxcA6Hy3fMrg
source_host: mp.weixin.qq.com
clip_date: 2026-10-25T09:33:20+08:00
trace_id: 1aa6085f-f9a7-4b56-b7af-60c89c635620
content_hash: 52efbfd72d6d45275b79184040cd1063056c5cbea2c3689f35bcddc65dd234e5
status: synced
tags:
  - 微信
  - Android逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 在 Bootloader 锁定、verified boot 已通过的 Redmi A7 Pro（展锐 T8300）上，用公开的 GhostLock（CVE-2026-43499）漏洞从 ADB shell 拿到 uid-0 内核凭据，关键是把每次启动随机的物理加载地址 P0 精确算出来。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 40475244-d011-81e3-a216-fe701abf1c0a
ioc:
  cves:
    - CVE-2026-43499
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 在 Bootloader 锁定、verified boot 已通过的 Redmi A7 Pro（展锐 T8300）上，用公开的 GhostLock（CVE-2026-43499）漏洞从 ADB shell 拿到 uid-0 内核凭据，关键是把每次启动随机的物理加载地址 P0 精确算出来。
> 
> - **漏洞本质：** futex 优先级继承路径 `remove_waiter()` 在 FUTEX_CMP_REQUEUE_PI 回滚时把 requeuer 当 waiter，留下悬垂的 `pi_blocked_on` 指针；用三线程三 futex 触发死锁返回来命中释放路径。
> - **P0 推导：** 写入 `trace_marker` 再读 `trace_pipe_raw`，从 `_THIS_IP_` 减固定偏移 `0x1f4ccc` 得 `_text`；由 slide 低 21 位反推 TOS 字节，公式为 `P0 = 0x80080000 + (byte << 15)`，范围 0x80080000–0x80878000，步进 32 KiB。
> - **为何必须每次推导：** 引导字节由 SprdBoot.efi 取 TrustZone 命令 0x50 应答首字节左移 15 位写入 PCD31，同时决定物理加载地址与 kaslr-seed；该字节不在 OTA 镜像中，DTB 属性被内核早期清零，活着的 slide 是唯一副本。
> - **绕过 KCFI：** 伪造 fops 表的每个槽位都是类型哈希匹配的真实内核函数（configfs 读写迭代器、`copy_splice_read`、`noop_llseek`），不靠关闭缓解措施。
> - **实战结果与风险：** 三次启动均成功，首次 56 秒无 panic；读取 debugfs `clk_summary`/`regulator_summary` 与双 socket 构建的 `module_put` panic 各崩一次，重启后 root、Permissive、P0 全部消失，无跨重启持久化。

**黑白之道** *2026年10月25日 09:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：CVE-2026-43499 是 Linux 内核里藏了十五年的 futex 优先级继承栈释放后重用漏洞，公开的利用链在 Pixel 上早就跑通了。难的是换到展锐 T8300 芯片的红米 A7 Pro 上——内核镜像每次启动都装在不同的物理地址，而利用链需要这个地址才能写伪造的 file_operations 表。作者用一次 tracefs 泄漏把这个地址算了出来，在不解锁 Bootloader、不刷任何镜像的前提下三次拿到 root。本文是完整复盘。

![GhostLock 攻击链示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8fb8553b201358eb.png "GhostLock 攻击链示意")

* * *

## 一、TL;DR

一台上了锁的手机，一个公开的漏洞，一个每次启动都会变的物理地址。

说人话就是：作者在一台 Bootloader 锁死、verified boot 校验通过的 Redmi A7 Pro 5G（展锐 T8300）上搞到了 root， **全程没有刷任何 boot 镜像，也没有解锁 Bootloader**。这不是锁屏绕过、不是密码绕过——手机正常开机，利用链从一个已授权的 ADB shell 里跑起来。

用到的公开内核漏洞是 GhostLock（CVE-2026-43499）。真正卡住人的是 KASLR 随机化带来的物理地址漂移。作者把 GhostLock 移植到了这台手机上，在三次独立启动里都拿到了 uid-0 的内核凭据补丁，第一次 root 用了 56 秒。不用暴力猜、不用串口，root 是每次启动现给的。

后面还有两次内核 panic，也都写在这篇里。

## 二、设备与威胁模型

目标机是零售版 Redmi A7 Pro 5G，代号 somalia，展锐 T8300（UMS9632），两颗 Cortex-A78 加六颗 Cortex-A55， Mali-G57 MC2 显卡，4 GB 内存，128 GB UFS 存储，Android 16，安全补丁停在 2026-08-01。

这是 user build： `ro.debuggable=0` 、 `ro.secure=1` ， `adb root` 直接被拒绝。

有意思的是安全姿态本身。Bootloader 锁着，verified boot 是绿的，AVB 版本 1.3，八个 erofs 分区通过 dm-verity 只读挂载。设备是 A/B 双槽，但 A 槽已经起不来（ `tries_remaining: 0` ），所以 B 槽是唯一的 Android 启动路径，misc 分区里还压着一条待执行的 one-shot Bootloader 命令。 **每次重启都有掉进 Bootloader 而不是 Android 的风险。**

这个约束塑造了整个过程：任何会让内核 panic 的操作，同时也威胁着这台设备最后一条能用的启动路径。

内核是 6.6.118-android15。 `CONFIG_FUTEX_PI=y` ，KASLR 开着，KCFI 开着， `kptr_restrict=2` ， `CONFIG_STRICT_KERNEL_RWX=y` ， `CONFIG_HARDENED_USERCOPY=y` 。 `CONFIG_USER_NS` 是关的，这堵掉了一整类基于容器的提权路径。shell 进程跑在 uid 2000，但带 readtracefs 组权限——这一点后面很关键。

整个过程默认只读，每次会话都有书面的所有者授权。没有写任何分区，没有解锁 Bootloader，没有改 boot 镜像。payload 只改内存里的内核状态。 `/data/local/tmp` 之外唯一的持久化改动，是在 `/data/misc/adb` 下追加了一条 ADB 公钥（用于无线调试引导），做了备份，可还原。

## 三、这个 CVE 到底是谁的

这篇研究不声称自己发现了漏洞。

GhostLock 就是 CVE-2026-43499，由 NebuSec 在《IonStack Part II: GhostLock》里披露，2026-05-21 起在 NVD 和 MITRE 上公开。漏洞在 futex 优先级继承路径的 `remove_waiter()` 里。

具体机制：出问题的版本给 `current->pi_lock` 加了锁，清掉了 `current->pi_blocked_on` ，但在 FUTEX_CMP_REQUEUE_PI 的回滚路径上， `current` 实际是 requeuer 而不是 waiter。于是 waiter 带着一个悬垂的 `pi_blocked_on` 指针回到用户态，而这个指针指向的内核栈帧早就被释放了。

公开的说法是「所有 Linux 发行版都存在了 15 年」——这正是这个漏洞比这台手机有意思的地方。

作者用的利用链是公开的那条：aarch64 移植来自 JingMatrix/pixel-ksu-root（commit 65762e7），OnePlus 设备矩阵来自 JoinChang/ghostlock-oneplus，堆指针侧信道的思路来自 TU Graz 的 KernelSnitch。

这个项目自己加的东西是：展锐 T8300 移植、每启动 P0 推导、QEMU 对等实验室，以及那两份事故记录。致谢在 NOTICE 里，完整清单在文末的参考部分。

## 四、利用链

这台设备上的完整顺序：

1.  **泄漏虚拟 KASLR 基址**。普通 shell 往 `trace_marker` 写一个标记，然后读 `per_cpu/cpu0/trace_pipe_raw` 。记录里的 `ip` 字段保存的是 `tracing_mark_write()` 内部的 `_THIS_IP_` 值，减去这个镜像的固定偏移 `0x1f4ccc` 就得到 `_text` 。能这么干是因为 `trace_marker` 全局可写、shell 在 readtracefs 组里、而 raw pipe 不受 `kptr_restrict` 过滤。
    
2.  **从这个 slide 反推 P0**。这是设备定制的步骤，下一节专门讲。
    
3.  **触发 futex UAF**。三个线程加三个 futex 字就能复现 FUTEX_CMP_REQUEUE_PI 的死锁循环，内核返回 `-EDEADLK` 并执行那条会释放 waiter、却留下悬垂指针的回滚路径。
    
4.  **用 pselect6 复用被释放的 waiter 栈**。一个大的 `fd_set` 被拷到已死的 `rt_mutex_waiter` 留下的栈槽上。描述符字节完全由攻击者控制，下一次 PI 链遍历就会把它们当成 waiter 字段读。
    
5.  **把 rb-tree 摘除变成任意写**。unlink 操作会把选定值写到选定内核地址。目标是 ashmem miscdevice 的 fops 指针，通过 P0 提供的物理别名打过去。
    
6.  **伪造 ashmem 的 file_operations**。假表里的槽位不是用户态代码，而是真实内核函数的地址：configfs 的 read 和 write iterators、 `copy_splice_read` 、 `noop_llseek` 。这正是它能在 KCFI 下活下来的原因——KCFI 会拿间接调用目标跟调用点的类型哈希做比对。
    
7.  **通过伪造的表打开 `/dev/ashmem`**，拿到内核读写原语。
    
8.  **升级成基于管道的物理读写**，然后 patch 掉 root 子进程的 `cred` 和 `real_cred` ：uid 和 gid 置 0，能力集填满，seccomp 清空，SELinux SID 设成内核 SID。
    
9.  **写 `selinux_state.enforcing = 0`**。这台设备会一直报 Permissive，直到下次重启。
    

![GhostLock 五步攻击链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/35c94a11c959b78c.png "GhostLock 五步攻击链")

*五步：泄漏、释放、复用、写、拿 root。设备定制的部分，是从同一次 tracefs 泄漏里推出 P0。*

结果是利用子进程里的内核凭据补丁，不是一个交互式 root shell。新的 `adb shell id` 依然是 uid 2000。为了保住一个 uid-0 进程做侦察，第二次运行会先从那个子进程里起一个 abstract socket root server，等子进程退出后它被 init 收养，活到本次启动结束。

## 五、每启动 P0：推导过程

这段是整个项目最值得细读的地方，因为移植能成立全靠它。

上游的 Pixel 利用假设内核镜像坐在一个编译期固定的物理地址上。但展锐这条启动链上没有 U-Boot 环境，也没有 `kernel_addr_r` 。内核由 EDK2 固件卷里的 SprdBoot.efi 加载，加载地址是运行时才决定的。

![Boot 链与 TOS 字节](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/be22ca89bbcdc645.png "Boot 链与 TOS 字节")

*加载器、TrustZone 应答，以及同一个字节最终出现的两个位置：物理加载地址和 KASLR 种子。*

正常启动时，SprdBoot.efi 会用命令 `0x50` 调 TrustZone 协议，带一个 4 字节输出缓冲区。它只读应答的第一个字节，左移 15 位，写进 PCD token 31。这个值随后用在三处：内核读取的目的地址、入口 PC、以及 DTB 属性 `/chosen/kaslr-seed` 。也就是说：

```
PCD31        = byte0 << 15
phys(_text)  = 0x80080000 + PCD31
kaslr-seed   = byte0 << 15
```

这个字节是 0 到 255 之间的随机值，所以物理加载地址在 `0x80080000` 到 `0x80878000` 之间，以 32 KiB 为步进。基址 `0x80080000` 本身不是 2 MiB 对齐的。

项目早期有两次尝试用了固定 P0： `0x80000000` 和 `0x80200000` 。前者永远低于加载器基址，后者只在 256 个字节里恰好命中一个才正确。 **这两次失败不是竞态输了，是压根打到了错误的物理页。**

![P0 加载范围](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e5e0ed820c40493c.png "P0 加载范围")

*加载器基址与 256 个 32 KiB 步进。原先的固定值根本不在候选范围里。*

关键洞察是： **同一个字节既种了虚拟 KASLR，又被 arm64 内核把物理位置的低 21 位编进了虚拟 slide**。源码里写得很直白——KASLR 偏移对 MIN_KIMG_ALIGN 取模来自物理放置位置，而不是来自种子。 `head.S` 把 identity map 的物理低位 or 进偏移，MIN_KIMG_ALIGN 是 2 MiB。所以 slide 的低 21 位就是物理加载地址的低 21 位，而字节的高 2 位在 `(slide >> 21) & 3` 里露出来。

给定泄漏出来的 `_text` ，推导是精确的，不需要暴力：

```
KIMAGE_VADDR = 0xffffffc080000000

slide = leaked_text - KIMAGE_VADDR
byte  = (((slide >> 21) & 3) << 6) | \
        ((((slide & 0x1fffff) - 0x80000) & 0x1fffff) >> 15)
P0    = 0x80080000 + (byte << 15)
```

合理性检查是 `0x80080000 <= P0 <= 0x80878000` 和 `(P0 - 0x80080000) % 0x8000 == 0` 。算术在 `scripts/ghostlock_p0_from_slide.py` 里。

固件这一侧是反汇编验证的，不是猜的。SprdBoot.efi 调了一个 TOS 随机数辅助函数——TrustZone 命令 `0x50` ，4 字节应答，只读第 0 字节，把 `byte << 15` 写进 PCD token 31。应答里另外三个字节直接丢弃。

PCD 31 之后被读了三处：内核读取目的地、入口 PC、以及写 DTB 属性 `/chosen/kaslr-seed` 的地方，写出去时做了字节序翻转。内核的 `kaslr_early_init` 消费掉这个属性之后就把它清零了。

![TOS 字节流向](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/353720d36d25003d.png "TOS 字节流向")

*这就是为什么静态分析 OTA 镜像得不到 P0——那个字节不在镜像里。内核的 kaslr_early_init 消费并清零了该属性，因此早期启动之后就无法恢复。这就是活着的 slide 成为唯一幸存副本的原因。*

算出来的结果跟实际记录吻合：

| 泄漏的 \_text | Slide | TOS 字节 | P0  | 结果  |
| --- | --- | --- | --- | --- |
| 0xffffffd080628000 | 0x1000628000 | 0xf5 | 0x80828000 | 第一次 root |
| 0xffffffd080720000 | 0x1000720000 | 0xd4 | 0x80720000 | debugfs panic 之后重新拿 root |
| 0xffffffd0801f0000 | 0x10001f0000 | 0x2e | 0x801f0000 | binder panic 之后重新拿 root |

中间那组数值也解释了之前固定 P0 为什么失败。第二次固定尝试用的是 `0x80200000` ，但那次启动的实际加载地址是 `0x80368000` ，差了 `0x168000` 。伪造的写落在了错误的物理页上。 **从头到尾就不是时序问题。**

第一次用推导 P0 的运行，泄漏到的 `_text` 是 `0xffffffd080628000` ，slide 算出 `0x1000628000` ，得到字节 `0xf5` 、P0 `0x80828000` 。用这个值构建的 payload 第一次尝试就命中： **56 秒，没有 panic**。

事后有两次独立的 root-only 读取印证了这个值： `uboot_log` 里有 `Start linux at PC:0x80828000` 这行， `/proc/iomem` 报告 `Kernel code at 0x80838000` ，正好是 `_text + 0x10000` 。这两次读取对利用本身都不是必需的——tracefs 泄漏先给出了答案。

推导是每次启动算一次。TOS 字节不在 OTA 镜像里，DTB 种子被内核早期清零， `/proc/iomem` 对 shell 是拒绝的。 **这个值唯一的幸存副本就是活着的 slide。** 运行时的启动器把闭环合上了——泄漏 KASLR、在 payload 里算 P0、然后直接跑，下一次启动不需要在主机侧重新构建。

## 六、QEMU 实验室与 KCFI

在一台只有一个可启动槽位的设备上盲跑内核利用是个坏主意。所以上真机之前，整条链先在 QEMU 实验室里验证过。

厂商那个精确的 Image 能在 QEMU 里一路启动到 `/init` ，并在虚拟机内复现 tracefs 泄漏。另一个源码对等的 GKI 6.6.118 构建在同一 banner commit 也能启动，但它的 clang 和配置不同，会把 `_THIS_IP_` 偏移从厂商的 `0x1f4ccc` 变成 `0x19ac64` 。

**这个差异正是为什么偏移量是目标头文件的一部分，而不是一个通用常量。** 原版利用链在虚拟机内第一次尝试就完成了完整的 uid-0 凭据补丁。

实验室定下了两件真机运行依赖的事。

第一件是 KCFI（内核控制流完整性）。KCFI 会拿间接调用的目标跟调用点的类型哈希做比对。伪造的 fops 表里每个槽位都是类型正确的真实内核函数，所以这张表在不禁用任何缓解措施的情况下就是合法的——伪造的 fops 表能过检查，是因为每个槽位都是类型哈希匹配的真实内核函数，而不是因为 KCFI 缺席。

第二件是 pselect 重试逻辑。进程内刷新在 CFI 未命中之后会卡在一次慢速的第二次 groom 上，而进程级的 SIGALRM 看门狗跨线程也不可用。最后接受的修法是：每个进程只做一次 pselect 尝试，由外层循环重新 fork 出一个全新的第一次 groom。这就是移植材料里的 `pselect-attempts1.patch` 。

实验室还提前抓到一个测试脚本自己的 bug，免得浪费一次真机运行：initramfs 里 `/dev/ashmem` 上的 `umask(0)` 问题，会让一次 open 失败看起来像是利用失败。根因在实验室的 init，不在利用链。

## 七、失败记录

这台设备上最早搞的并不是 GhostLock，而是 Mali GPU 驱动 `kbase_do_syncset()` 里的一个 UAF——出厂 r54p1 模块中的 per-context shrinker 竞态。

竞态是真的：两次受控的 crash-oracle 运行让内核在 `kbase_sync_single` 读取被污染的 struct page 时 panic。这验证了漏洞存在，但没拿到写原语，也没回答它对应哪个 CVE。继续为了一个出不来的原语去反复搞崩日常使用的驱动不划算，于是项目转向 GhostLock——一条有公开可用的写原语、到凭据修改路径更短的链。

固定 P0 打偏是下一处失败。两次真机运行用了 `0x80000000` 和 `0x80200000` ，两次都走到了 CFI open 那一步然后落空，因为伪造的写打到了错误的物理页。P0 固件审计解释了两个：前者低于加载器基址，后者只在 256 个可能的 TOS 字节里正确一个。

**错误的 P0 表现为静默落空，很容易被误判成竞态输了。** 推导公式消除了这个失败模式。

然后才是接下来那两起真正的事故。

## 八、结果：root，但每次启动现给

| 能力  | 状态  |
| --- | --- |
| uid-0 内核凭据补丁（uid 2000 → 0） | 三次启动均已验证 |
| 完整能力集 | 已验证 |
| SELinux Permissive（本次启动内） | 已验证，仅内存 |
| uid-0 root socket server（u:r:kernel:s0） | 已验证，每次启动 |
| 设备端 Termux 无线 ADB 引导 | 已验证，每次启动 |
| 私有 su/sudo（私有 socket） | 已验证，观察中 |
| 常驻 su 或 boot 镜像改动 | 未做  |
| 跨重启持久化 | 无   |

三次启动依次是：第一次推导 P0 的 root（P0 `0x80828000` ，56 秒，一次 pselect 尝试）、debugfs panic 之后重新拿 root（P0 `0x80720000` ）、binder panic 之后重新拿 root（P0 `0x801f0000` ，selective-fd 修复版）。当前状态是最后一个，观察中，没有证明稳定。

这里"root"的含义很窄，值得再说一遍： **它是利用子进程里的内核凭据补丁，加上一个 SELinux 字节的内存写入。** 不是常驻 su，不是挂载了 root 文件系统，不是装了什么包，也不是改了 boot 镜像。重启会恢复 Enforcing、改变 P0、干掉所有 root server。 **没有任何东西能以 root 身份活过这次启动。**

![设备端 root 验证](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bae1ac969624b56d.jpg "设备端 root 验证")

*第三次 root 运行时的设备端检查，不是 ADB 转发过来的主机 shell。 `su -c` 返回 uid=0(root)、内核 SELinux 上下文 `u:r:kernel:s0` 、Permissive；Bootloader 和 AVB 都没动。那句 can't find tty fd 是 socket shell 缺 TTY 导致的，所以交互式 su 提示符很别扭， `su -c` 才是可靠路径。*

## 九、两起事故

两次 panic 都作为一等公民文档记录下来，因为它们正是这项工作"每次启动现给"性质的痛点所在。

**第一次是读 debugfs。** 第一次 root 之后，一轮只读侦察挂了载 debugfs（这是获得授权的状态变更），读了 `clk_summary` 和 `regulator_summary` 。设备直接 synchronous external abort、fatal exception、自动重启。root、Permissive、P0 全部丢失，因为这三个都是每次启动现给的。

好在设备从 B 槽正常进了 Android，这次 panic 没把它变砖。但它确认了在这台设备上那几个 debugfs 摘要读不得。它们至今仍然被排除在外。

**第二次是 binder 线程析构 panic。** 重新拿到 root 之后，装了一个双 socket 构建，在 abstract socket root server 之外加了条私有 Termux su/sudo 通道。冒烟测试都过了： `su -c id` 通过私有 socket 返回 uid 0，Termux app 的 UID 在 abstract socket 上被拒，主机转发正常。

然后设备在清理阶段 panic 了：

```
pc : module_put+0x18/0x12c
lr : __fput+0xc4/0x2b8
Comm: binder:1234_7
```

`module_put` 是从 `__fput` 调用的，那个文件的 `f_op->owner` 是个被破坏的非内核指针。出问题的任务是 binder 线程，不是 root server。

怀疑指向 server 里新加的 `close_inherited_fds()` ：它关掉了继承来的利用 fd，其中某个可能把伪造的 fops 表带进了析构路径。 **这是个说得通的触发因素，不是被证实的触发因素。** 无法排除潜伏的 GhostLock 伪造 fops 连带 panic，而且 binder 线程这种延迟时序让单一归因并不安全。

修法是让 server 只关管道和普通文件 fd，不关 char/ashmem/socket fd。在新的启动上重新拿 root，P0 `0x801f0000` ，两条通道都工作：私有的 `~/.gl/root.sock` 给 `su -c id` 用，abstract 的 `@ghostlock-root` 给主机转发用。短观察窗口内没有新 panic。

**这个修复处于观察状态，没有被证明稳定**，之前那个双 socket 构建仍然是「不要用」。

## 十、局限

-   Root 是每次启动现给的。这是锁定 Bootloader 和 AVB 的设计决定，重启后没有任何东西以 root 身份存活。
    
-   selective-fd 修复处于观察状态。它替换掉的构建在 `module_put` 里 panic 过，短暂干净窗口不等于稳定。
    
-   单一设备。没有第二台机器，也没有跨设备可复现性。
    
-   没有完整的设备外备份，所以涉及崩溃的工作在这台设备上被卡住了。
    
-   debugfs 的 `clk_summary` 和 `regulator_summary` 读取被排除在外，它们把设备搞崩过。
    
-   A 槽起不来，B 槽是唯一的 Android 启动路径。所以每次重启、每次 panic 都被当作恢复风险对待。
    

## 十一、伦理与披露

CVE-2026-43499 是公开的。NVD 条目 2026-05-21 发布，发现者的研究报告日期是 2026-07-07，这个 bug 已经被广泛讨论。这个仓库是在一个公开漏洞之上加了一个设备定制的结论，不是新的漏洞披露。

整个工作在所有者拥有的设备上完成，每次会话都有书面授权，默认姿态是只读。仓库不发布任何武器化的工具、不发布给其他设备用的预编译 `.so` 、不发布固件。这棵树里的 boot ID、P0 数值和事故记录是针对一台机器的审计证据，不是给另一台机器的操作手册。

**要用就用在你自己的硬件上，先读 SECURITY.md。**

## 十二、时间线

| 日期  | 事件  |
| --- | --- |
| 2026-10-22/23 | 提取固件；验证 Mali `kbase_do_syncset()` 页级 UAF 竞态，两次受控 panic；写原语受阻，转向 GhostLock |
| 2026-10-23 | 通过 tracefs 验证当前启动的 KASLR 泄漏 |
| 2026-10-23 | QEMU 实验室启动精确的厂商 Image；原版利用链在虚拟机内完成完整 root |
| 2026-10-23 | 两次固定 P0 真机运行落空（物理目标错误） |
| 2026-10-23 | 从 tracefs slide 推导出 P0 公式 |
| 2026-10-23 | 第一次 root，P0 `0x80828000` ，56 秒，无 panic |
| 2026-10-23 | 常驻 root socket 与侦察；发现 A 槽起不来 |
| 2026-10-23 | 读 debugfs `clk_summary` / `regulator_summary` 导致设备 panic；root 丢失 |
| 2026-10-24 | 新启动上重新拿 root，P0 `0x80720000` ；自包含的运行时 P0 启动器 |
| 2026-10-24 | 设备端 Termux 无线 ADB 引导 |
| 2026-10-24 | 双 socket su 构建在 `module_put` panic；重启 |
| 2026-10-24 | selective-fd 修复；重新拿 root，P0 `0x801f0000` ；观察中 |

## 十三、参考

-   NebuSec，《IonStack Part II: GhostLock》，https://nebusec.ai/research/ionstack-part-2/ （主要来源）
    
-   NebuSec/CyberMeowfia，https://github.com/NebuSec/CyberMeowfia
    
-   JingMatrix/pixel-ksu-root，commit 65762e7
    
-   JoinChang/ghostlock-oneplus
    
-   Linuxoid-cn/CVE-2026-43499-Poc-Analysis
    
-   KernelSnitch，Lukas Maar 等，TU Graz，NDSS 2025
    
-   NVD CVE-2026-43499，MITRE CVE-2026-43499
    
-   Hacker News 讨论帖，https://news.ycombinator.com/item?id=48834309
    

细节、偏移量和脱敏后的证据链都在 `docs/` 、 `reference/` 、 `evidence/` 目录里。

**原文地址**：https://tusharpandey.com/blogs/ghostlock-somalia/ **研究仓库**：https://github.com/tusharpandey13/ghostlock-somalia

**版权声明**：本文根据 Tushar Pandey 的公开研究博客翻译整理，保留原作者所有技术内容与署名，配图来自原文仓库，授权使用。

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
