---
title: 【微信】安卓最新Root提权漏洞分析与利用
source: https://mp.weixin.qq.com/s?__biz=MzU3MTY5MzQxMA==&mid=2247485374&idx=1&sn=70e3f7da734cb81e92aedc72e7e58988
source_host: mp.weixin.qq.com
clip_date: 2026-07-31T01:11:01+08:00
trace_id: 77b2c3ee-1e80-4dad-8a72-8666fe2bf970
content_hash: 2635fb38a1c214571d14efef2d3ed618a3a6fd45a29dab335f2bf887b43f95b3
status: synced
tags:
  - 微信
  - Android逆向
  - 内核
series: null
feed_source: 公众号·软件安全与逆向分析
ai_summary: GhostLock（CVE-2026-43499）是Linux内核存在十余年的futex PI栈UAF漏洞，已出现针对锁BL机型（如OnePlus/OPPO）的安卓利用链，可在不解锁状态下获取root权限。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ad75244-d011-814e-9e27-dc2069b76ce9
ioc:
  cves:
    - CVE-2026-43499
  cwes:
    - CWE-416
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GhostLock（CVE-2026-43499）是Linux内核存在十余年的futex PI栈UAF漏洞，已出现针对锁BL机型（如OnePlus/OPPO）的安卓利用链，可在不解锁状态下获取root权限。
> 
> - **漏洞根源：** `rtmutex.c`中的`remove_waiter()`函数错误使用`current`指针，在`FUTEX_CMP_REQUEUE_PI`死锁回滚路径中清理了错误的任务的`pi_blocked_on`，导致waiter线程的内核栈帧被释放后仍存有悬挂指针，形成栈上Use-After-Free。
> - **公开利用链：** 利用过程通过构造三futex死锁触发GhostLock，随后使用`pselect6`系统调用将用户可控的`fd_set`数据铺回已释放的栈帧，伪造`rt_mutex_waiter`结构体，利用后续的PI链红黑树操作实现受约束的内核写原语。
> - **攻击效果：** 攻击者利用内核写原语关闭SELinux（将`selinux_enforcing`写为0），或修改当前任务的凭据指针指向`init_cred`，最终在未解锁bootloader的锁BL机型上获得root权限，并可后接KernelSU实现持久化。
> - **适配关键：** 利用成败高度依赖目标内核的编译产物栈布局，即`pselect6`的`stack_fds`缓冲区与释放后的`rt_mutex_waiter`结构体是否能在栈上精确重叠，这因SoC分支、编译器PGO/LTO/BOLT画像不同而异。
> - **修复与缓解：** 唯一有效修复是内核补丁（合并提交`3bfdc63936dd`），它使用`waiter->task`替代`current`来清理等待项。临时缓解可用seccomp过滤futex PI相关操作，但会影响依赖PI互斥量的工作负载。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ff15962949bbf9bd.jpg)

> 2026年7月，Linux内核本地提权漏洞GhostLock（CVE-2026-43499）公开完整利用链之后，安卓侧很快出现了面向锁BL机型的公开仓库：JoinChang的 `ghostlock-oneplus` ，以及YuKongA面向OPPO Find N5与Find X8的 `ghostlock-oplus` 。它们打的不是厂商私有驱动，而是GKI里那条已经存在十余年的futex PI栈UAF。公开仓已有完整实现，下文只谈公开机制与机型差异。
> 
> 文章作者：非虫（fei_cong@hotmail.com）

安卓本地Root近年常见目标仍是GPU驱动、binder与各类vendor ioctl。GhostLock不一样：缺陷在主线Linux的 `rtmutex` / `futex` 路径，和ColorOS、OxygenOS私有HAL无关。锁着bootloader的OnePlus、OPPO机型之所以能在未解锁状态下拿到root，是因为同一条内核洞被改成了arm64安卓利用链，再接上KernelSU的late-load。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ba4c811a63627f29.png)

两个仓库的关系如下：

1.  `JoinChang/ghostlock-oneplus`
    
    ：面向OnePlus/OPPO/realme等OPlus系锁BL机型的多设备偏移表与完整jailbreak链路，仓库创建于2026年7月12日。
    
2.  `YuKongA/ghostlock-oplus`
    
    ：在同一漏洞与相近代码骨架上，单独补齐OPPO Find N5与Find X8的偏移与构建入口，并显式声明参考了Nebula的CyberMeowfia、JoinChang仓库以及 `x-spy/CVE-2026-43499-popsicle` ；仓库创建于2026年7月29日。
    

## 漏洞定位与时间线

CVE-2026-43499要点如表1所示。

| 字段  | 内容  |
| --- | --- |
| CVE | CVE-2026-43499，俗称GhostLock |
| 组件  | Linux内核 `kernel/locking/rtmutex.c` ，经futex优先级继承（PI）路径触发 |
| 类型  | 栈上Use-After-Free，CWE-416 |
| CVSS | kernel.org给出CVSS 3.1：7.8 High， `AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H` |
| 引入  | Linux 2.6.39-rc1（约2011年5月），提交 `8161239a8bcc` |
| 修复  | 主线7.1，提交 `3bfdc63936dd` （rtmutex: Use waiter::task instead of current in remove_waiter） |
| 发现方 | Nebula Security（VEGA），Google kernelCTF奖励92337美元 |
| 公开分析 | Nebula《IonStack part II: GhostLock》，2026年7月7日 |
| 安卓侧公开利用 | JoinChang、YuKongA等仓库，面向锁BL的OPlus系机型与部分同SoC机型 |

表1 CVE-2026-43499要点

时间线按公开资料整理如下：

1.  约2011年：rtmutex PI重写引入错误假设， `remove_waiter()` 始终按 `current` 清理waiter。
    
2.  2026年4月：主线合入 `3bfdc63936dd` 修复。
    
3.  2026年5月21日：NVD收录CVE-2026-43499。
    
4.  2026年7月7日：Nebula公开完整writeup与通用Linux利用思路；同日前后发行版开始集中发补丁说明。
    
5.  2026年7月8日：oss-security出现GhostLock提醒邮件。
    
6.  2026年7月12日起：安卓侧锁BL jailbreak仓库陆续公开；YuKongA仓库约两周后补齐Find N5与Find X8。
    

这里可以看出：

1.  漏洞本体是通用Linux内核问题，不绑定某一OEM。
    
2.  安卓暴露面是开启 `CONFIG_FUTEX_PI` 的GKI/OEM内核；JoinChang README写明，安卓GKI 6.12.x在其写作时尚处受影响区间。
    
3.  两个GitHub仓库把漏洞利用做成“锁BL拿uid 0并装KernelSU”的工程实现；机型范围由偏移表与栈布局可行性决定，不是CVE影响名单本身。
    

## 威胁模型与影响面

对于安卓手机，威胁模型更贴近下面几条：

1.  攻击者已能在设备上运行本地代码：用户安装的App、调试shell，或其它远程洞拿到的同UID执行能力。
    
2.  目标内核仍未合入 `3bfdc63936dd` 及其stable回补；内核版本号“看起来很新”不等于已修，要以实际 `uname -r` 与厂商OTA为准。
    
3.  利用不依赖解锁bootloader，也不要求改写 `boot` 分区。公开仓库的目标正是：锁BL状态下拿到root，再靠 `ksud late-load` 装上KernelSU。
    
4.  成功后常见结果是：写掉 `selinux_enforcing` 、把当前进程凭据切到 `init_cred` ，或走UMH路径让内核以uid 0执行用户态载荷。
    

厂商品牌上，公开仓库当前主要覆盖OnePlus、OPPO，以及同SoC验证过的Xiaomi 17。realme等OPlus系机型在JoinChang的“不可行”表里也有条目，说明作者尝试过提取偏移，但栈布局不兼容。不要把“仓库名带了OnePlus”理解成“只有一加受影响”——洞在内核，仓库只是现成适配清单。

## 缺陷成因

Nebula的分析把成因说得很直白： `remove_waiter()` 最初只服务“线程自己阻塞、自己清理”的慢路径，于是一律操作 `current` 。Requeue-PI却通过 `rt_mutex_start_proxy_lock()` 让另一个线程代劳入队与回滚。此时 `current` 是发起 `FUTEX_CMP_REQUEUE_PI` 的requeuer，真正的waiter对象躺在睡眠线程自己的内核栈上。

出错路径可以压缩成：

```
waiter线程：持有f_pi_chain，再FUTEX_WAIT_REQUEUE_PI(f_wait -> f_pi_target)
owner线程：持有f_pi_target，再阻塞在f_pi_chain
主线程：FUTEX_CMP_REQUEUE_PI(f_wait -> f_pi_target)
  代理入队检测到死锁，返回-EDEADLK
  remove_waiter()清掉current->pi_blocked_on
  waiter任务自己的pi_blocked_on仍指向即将弹出的栈帧
  栈帧回收后形成栈UAF
```

后续任意一次会走PI链的操作，例如 `sched_setattr()` ，都可能顺着悬空指针去解引用已经返回用户态的栈帧。触发后没有紧迫的竞态窗口：waiter可以先回到用户态，攻击者再慢慢安排栈回收与伪造。

修复同样直接：在 `remove_waiter()` 及相关路径里，一律用 `waiter->task` 取代 `current` 去持锁、出队、清空 `pi_blocked_on` 。lockdep原先只检查“有没有持有某把 `pi_lock` ”，并不核对“持的是不是waiter所属任务的那把”，所以这类错误能藏很久。

## 从栈UAF到受控写

通用Linux链（Nebula / CyberMeowfia）与安卓仓共享同一起点：悬空的 `rt_mutex_waiter` 。后续差异主要在“如何把可控字节铺回那块栈”，以及“把有限写原语接到什么目标上”。

Nebula在x86通用环境里的轮廓是：

1.  用prefetch一类侧信道摸KASLR与physmap。
    
2.  触发GhostLock，留下悬空 `pi_blocked_on` 。
    
3.  用 `prctl(PR_SET_MM_MAP)` 等大块栈本地缓冲覆盖旧waiter帧，伪造 `rt_mutex_waiter` 。
    
4.  PI链上的 `rb_erase` 给出受约束的指针写，常见写入目标是 `inet6_protos[IPPROTO_UDP]` 一类函数表。
    
5.  再接控制流劫持与后续提权。
    

安卓公开仓把栈回收换成了更贴近手机环境的 `pselect6` 路径。JoinChang README写明： `pselect6` 会把 `fd_set` 拷到内核栈上的 `stack_fds` ；在合适的编译栈布局下，这块缓冲区与已释放的 `rt_mutex_waiter` 重叠，攻击者就能把伪造的 `task` 、 `lock` 等字段写进用户可控区。随后PI链walk时的红黑树再平衡，把受控值写到选定的内核地址。

安卓侧原语链可以写成：

```
三futex死锁触发GhostLock
  waiter任务悬空pi_blocked_on
  pselect6把可控fd_set铺回同一栈深
  伪造rt_mutex_waiter
  PI写原语（受约束的内核写）
  关闭SELinux enforcing，或改凭据，或建立更稳的读写原语
  可选：ksud late-load安装KernelSU
```

公开仓给出的两条Root路径，按设备能力自动选择：

1.  UMH路径（优先，需C ashmem且能拿到静态 `miscdevice` 偏移）：先用PI写把misc fops拐到伪造表，再经configfs与pipe物理内存读写把 `selinux_enforcing` 写成单字节0，最后向 `system_unbound_wq` 注入work，让内核执行 `/data/local/tmp/... --umh` 拿到uid 0。这条路少改活着的 `task_struct` 凭据，也能绕开部分seccomp对 `perf_event_open` 的限制。Rust ashmem的GKI 6.12上miscdevice在堆上分配，地址不稳定，通常走不通。
    
2.  直接PI写路径（回退）：先写 `selinux_enforcing` ，再把 `task->cred` 指到 `init_cred` ，随后装KernelSU，并视需要处理策略副作用。
    

还有bootstrap模式：App上下文先做不依赖perf的Write 1，再经本机mini-adb连回自己，在更宽松的shell上下文跑完整链。这是为了躲开App侧seccomp，不是第二条漏洞。

## 栈布局决定机型能不能打

CVE在很多内核上都在，但公开安卓利用能不能打通，取决于编译器给 `do_select` / `pselect` 栈帧排出来的布局。JoinChang把可行性写成硬规则：在 `NFDS=320` 时， `stack_fds` 前半是用户可控位图； `rt_mutex_waiter` 的 `task` 与 `lock` 字段必须落在可控区。waiter起始word超过3，通常就没有安全的 `PSELECT_SHIFT` 可调。

同一内核版本号、不同SoC分支，因为PGO/LTO/BOLT画像不同，栈布局可以完全不一样。所以“同为6.12”不等于都能打；反过来，6.6上只要布局合适、偏移齐备，也能成。YuKongA仓库里的Find N5与Find X8，正是6.6.118安卓15 GKI分支上的成功适配。

另外还有 `kernel_phys_load` ：bootloader决定的内核物理装载地址，不能从 `boot.img` 直接推出来。写错不会必然panic，写会落到无关RAM上，表现为“跑了没效果”。公开仓要求按机型填表，或在已有root的同型号机器上从 `/proc/iomem` 读取。

## 两个仓库的机型覆盖

两仓支持范围以各自README为准，摘要如表2、表3。状态会随作者更新变化，动手前请再对一下仓库当前表格。

| 设备  | SoC | 内核线索 | 状态  |
| --- | --- | --- | --- |
| OnePlus Ace 6T（PLR110） | SM8845 | 6.12.38，多build已列 | 已验证 |
| OnePlus 15（CPH2749） | SM8850 | 6.12.23 | 已验证 |
| Xiaomi 17（pudding） | SM8850 | 6.12.23 | 已验证 |
| OnePlus 15T（PLZ110） | SM8845 | 与Ace 6T同内核线索 | 偏移已提，待真机确认 |
| OnePlus 13（IN2060） | SM8750 | 6.6.89，需 `PSELECT_SHIFT=-2` | 偏移已提，UMH路径有公开线索 |

表2 JoinChang/ghostlock-oneplus支持摘要

JoinChang明确标为不可行的例子包括：OPPO Find X9 Ultra（栈SP差与Ace 6T相反）、OPPO Find X7与多款realme 6.1分支（waiter落在word 13）、OnePlus 13R/Ace 5、OPPO Pad 5，以及非OPlus的iQOO Z9（且5.15 waiter结构不兼容）。这些条目说明：洞可能仍在，但当前这条 `pselect` 叠栈打法在这些编译产物上走不通。

| 设备  | SoC | 内核线索 | 说明  |
| --- | --- | --- | --- |
| OPPO Find N5（PHK110） | SM8750 | `6.6.118-android15-8-...-ab15114928-4k` | 按 `uname -r` 选偏移表 |
| OPPO Find X8（PKB110） | MT6991 | `6.6.118-android15-8-...-ab15099304-4k` | 同上；天玑平台单独适配 |

表3 YuKongA/ghostlock-oplus支持摘要

两仓差异可以概括成：

1.  JoinChang覆盖更广，带可行性筛查、UMH与直接PI写双路径、bootstrap、多SoC的 `kernel_phys_load` 表，以及从 `boot.img` 批量抽kallsyms/BTF偏移的工具链。
    
2.  YuKongA收窄到Find N5与Find X8两条已验证内核，启动时读 `uname -r` ，不匹配直接拒绝；构建与安装脚本更轻，并写明继承Apache-2.0与上游参考列表。
    
3.  两者都把“提权”和“持久Root框架”拆开：没有 `ksud` 时，W1/W2仍可能拿到uid 0，但KernelSU不会装上， `su` 也不持久。
    

## 检测与缓解

真正有效的修复只有内核补丁。上游关键提交是 `3bfdc63936dd` ；各stable分支另有回补，NVD与发行版公告里能看到6.1、6.6、6.12、6.18、7.0等线的修复版本门槛。安卓侧不能只看AOSP安全公告月份，还要看OEM是否把对应GKI/vendor内核推进到已回补版本。JoinChang写作时点名的6.12.23、6.12.38，仍低于当时公开资料里常见的6.12.86一类修复门槛；具体以设备OTA与内核changelog为准。截至成稿，未看到OnePlus/OPPO就该CVE单独发布的中文用户公告可引用，仍应以内核版本与厂商安全更新频道为准。

临时缓解都有代价：

1.  用seccomp挡住 `FUTEX_LOCK_PI` 、 `FUTEX_WAIT_REQUEUE_PI` 、 `FUTEX_CMP_REQUEUE_PI` 及其time64/变体。能切断触发面，但会弄坏依赖优先级继承互斥量的工作负载。
    
2.  限制不可信本地代码执行，收紧侧载与调试接口。对锁BL手机上的恶意App模型，这比“指望用户别点安装”更实在，但挡不住已经拿到代码执行的攻击者。
    
3.  Nebula还讨论过 `RANDOMIZE_KSTACK_OFFSET` 对栈帧重叠的干扰：它会抬高利用难度，不是完整修复。安卓公开仓按机型实测栈布局，说明在目标编译产物上重叠仍可稳定发生。
    

尽快装厂商内核OTA。补丁到位前，别把来路不明的“一键Root”包当常规工具。两仓已把偏移提取办法公开到“只需 `boot.img` ”的程度，适配成本会继续下降，回补越慢，锁BL机型上的现成利用越多。

## 参考资料

-   Nebula Security，IonStack part II: GhostLock： [https://nebusec.ai/research/ionstack-part-2/](https://nebusec.ai/research/ionstack-part-2/)
    
-   NVD，CVE-2026-43499： [https://nvd.nist.gov/vuln/detail/CVE-2026-43499](https://nvd.nist.gov/vuln/detail/CVE-2026-43499)
    
-   上游修复提交： [https://git.kernel.org/stable/c/3bfdc63936dd4773109b7b8c280c0f3b5ae7d349](https://git.kernel.org/stable/c/3bfdc63936dd4773109b7b8c280c0f3b5ae7d349)
    
-   oss-security提醒： [https://www.openwall.com/lists/oss-security/2026/07/08/12](https://www.openwall.com/lists/oss-security/2026/07/08/12)
    
-   AlmaLinux补丁说明： [https://almalinux.org/blog/2026-07-09-ghostlock/](https://almalinux.org/blog/2026-07-09-ghostlock/)
    
-   JoinChang/ghostlock-oneplus： [https://github.com/JoinChang/ghostlock-oneplus](https://github.com/JoinChang/ghostlock-oneplus)
    
-   YuKongA/ghostlock-oplus： [https://github.com/YuKongA/ghostlock-oplus](https://github.com/YuKongA/ghostlock-oplus)
    
-   NebuSec/CyberMeowfia（YuKongA声明的参考之一）： [https://github.com/NebuSec/CyberMeowfia](https://github.com/NebuSec/CyberMeowfia)
