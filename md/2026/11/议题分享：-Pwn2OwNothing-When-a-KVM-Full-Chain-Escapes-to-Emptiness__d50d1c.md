---
title: "议题分享： Pwn2OwNothing: When a KVM Full-Chain Escapes to Emptiness"
source: https://bestwing.me/hitcon-2026-pwn2ownothing-when-a-kvm-full-chain-escapes-to-emptiness.html
source_host: bestwing.me
clip_date: 2026-11-04T10:29:52+08:00
trace_id: b1e7f783-d185-4bb2-912d-055b4603bfef
content_hash: 14cb64e28bee48f8b244a9635025c3de9136d291714208b9fad85884a0f454b5
status: synced
tags:
  - 漏洞分析
  - 虚拟化逃逸
series: null
feed_source: Swings·漏洞/二进制
ai_summary: 安全团队针对 Pwn2Own Berlin 的 QEMU-KVM 目标打造三漏洞全链利用：virtio-gpu 越界写逃逸、结构体改写泄露、unix_gc 提权，实现跨租户代码执行。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-81b9-bf03-e3bbae2cff30
ioc:
  cves:
    - CVE-2026-23394
    - CVE-2026-3886
    - CVE-2026-9539
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 安全团队针对 Pwn2Own Berlin 的 QEMU-KVM 目标打造三漏洞全链利用：virtio-gpu 越界写逃逸、结构体改写泄露、unix_gc 提权，实现跨租户代码执行。
> 
> - **赛题背景：** Pwn2Own Berlin 2026 的 KVM 类目奖金 $50,000，达成 cross-tenant 执行另有 $50,000 加成；目标环境为 RHEL 10.1 上的 qemu-kvm 10.0.0-14.el10_1.5，需依次完成 VM escape（控制 qemu 进程）→ 内核 LPE → 借宿主机攻击租户 B。
> - **Bug 1（VM escape）：** virtio-gpu `calc_image_hostmem` 32 位整数溢出（CVE-2026-3886，属未修复的 N-day），设 `width=0x10000001` 使分配远小于实际需求，获得最大约 1 GiB 越界写；覆写 ld-linux 的 `_ns_loaded` 挂伪造 link_map，进程退出时 `_dl_fini()` 遍历调用 `DT_FINI_ARRAY[0]`，RIP 与 RDI（即 fake link_map）同时可控。
> - **Bug 2（信息泄露）：** SLIRP 被划出攻击范围后改用新思路——用已有 OOB write 改写某结构体，QEMU 将其成员当长度把进程内存拷入 GPA 且无边界检查，Guest 直接从 GPA 读回泄露数据（组件暂被打码，细节待 QEMU 官方公开）。
> - **Bug 3（LPE）：** CVE-2026-23394，`__unix_gc` 不持 iolock purge skb 与 `unix_stream_read_generic` 持锁 peek 形成竞争窗口，释放后仍被 `consume_skb` 使用造成 UAF；用 skb_data 喷 order-0 页占回，伪造 `skb->destructor` 控制内核 RIP。
> - **缓解措施：** seccomp 禁 fork/execve 但保留 open/read/write/ioctl/socket 等；SELinux sVirt 结合 MCS level 隔离租户且强制 W^X，无法落地常规 shellcode；Intel CET 侧 user 有 SHSTK 挡 ROP、kernel 有 IBT 挡 JOP/COP，需逐一绕过。

BEGIN_PAYLOAD20261013

…

## 前言

这个议题于2026年8月21日在 HITCON 2026 上分享，由 Bruce Chen、Peterpan0927、Jheng Bing Jhong 还有我作为 Co-write，议题详情见官方议程 [1](#fn:1) 。

大致的议题介绍：

This year’s Pwn2Own Berlin introduced QEMU-KVM on RHEL as a target, with an additional prize awarded for achieving cross-tenant code execution during the competition. Motivated by this challenge, we began an in-depth security research of the QEMU-KVM virtualization stack, spending around one month on both vulnerability research and exploit development across the QEMU-KVM and RHEL environment.

During our research, we successfully developed a full-chain exploit capable of achieving cross-tenant code execution by compromising both QEMU-KVM and the underlying host system. Although we were ultimately unable to register our entry in time due to submission limitations and the high number of participants, we believe the journey and findings are still worth sharing with the community.

In this talk, we will present our research methodology, discuss the vulnerabilities used throughout the exploit chain, and explain how we bypassed modern mitigations including seccomp sandboxing, SELinux, and Intel CET. We will also share interesting stories and challenges encountered during the process, as well as how we turned individual vulnerabilities into a reliable cross-tenant attack in a real-world virtualization environment.

……

## 议题分析

Pwn2Own Berlin 2026 中 KVM 类目的奖金是 $50,000（5 个 Master of Pwn 积分），在此基础上完成 cross-tenant 代码执行还有 $50,000 的 Add-on Bonus。议题的攻击场景非常明确：宿主机是裸机 RHEL（qemu-kvm 版本 10.0.0-14.el10_1.5，RHEL 10.1，VM 由 Cockpit 拉起并默认开启沙箱），攻击者控制租户 A 的 Guest（已拿到 root）我们的目标是打穿 Qemu 并且完成跨租户攻击：

1.  VM escape，控制宿主机上的 qemu-kvm 进程（ring 3）
2.  LPE，进入宿主机内核（ring 0）
3.  以宿主机的控制权攻击租户 B 的 VM，完成 cross-tenant 代码执行

整条链路一共用了 3 个漏洞，加上一连串针对缓解措施的绕过技巧。

### 漏洞链

-   **Bug 1 — virtio-gpu `calc_image_hostmem` 整数溢出（OOB write）**： `hw/display/virtio-gpu.c` 中 `width` 可控且按 32 位有符号整数运算，取 `width = 0x10000001` 时 `width*bpp` 被截断，导致分配远小于实际需求的 buffer，最终拿到一个最大约 1 GiB 的越界写。有意思的是这其实是个 N-day（CVE-2026-3886，DEVCORE 上报），团队直到对比上游 QEMU 代码时才发现，但目标版本直到比赛当天都没修。
    -   利用方式也很巧妙：OOB write 的目标选的是动态链接器 ld-linux.so 里的全局数据 `_rtld_local` （buffer 与它的偏移每次启动固定），覆写 `_ns_loaded` （link_map 链表头）挂上伪造的 link_map；关闭 Guest VM 触发进程退出时的 `_dl_fini()` ，遍历链表调用伪造的 `DT_FINI_ARRAY[0]` ，此时 RDI 就是 fake link_map 本身 —— RIP 和第一个参数同时可控。
-   **Bug 2 — Buffer OOB read（信息泄露）**：正式比赛环境用 VM manager 启动，SLIRP 被 ZDI 划出攻击范围（我一开始在 SLIRP 里找到的泄露洞 CVE-2026-9539 因而作废，赛后才上报）。于是换个思路：既然手里有 OOB write，就用它改掉某个”特定结构体”，之后 QEMU 会把其中一个成员当作长度，把 QEMU 进程内存拷贝进 GPA（Guest 物理地址），长度可控且无边界检查，Guest 直接从 GPA 读回泄露数据。（slide 中该漏洞组件被打码，细节等 QEMU 官方公开，见 qemu work_items/3863）
-   **Bug 3 — CVE-2026-23394：unix_gc 竞争条件（LPE）**： `__unix_gc` 在不持 iolock 的情况下 purge skb，而 `unix_stream_read_generic` 持锁 peek skb，两者之间存在竞争窗口；skb 被 `__skb_queue_purge` 释放后，另一侧 `consume_skb` 仍在使用，造成 UAF。用 skb_data 喷 order-0 页面占回被释放的 skb，伪造 `skb->destructor` 即可控制 RIP。

### 缓解措施与绕过

这部分是议题比较有意思的地方：

-   **seccomp**：Cockpit 拉起 qemu-kvm 时带 `-sandbox on,...,spawn=deny` ， `fork/execve` 全被禁， `system()` 直接没戏；但 `open/read/write/lseek/ioctl/socket` 还留着。
-   **SELinux（sVirt）**：qemu-kvm 进程域为 `svirt_t` ，配合 MCS level 做租户间隔离，且 W^X —— 不能 mmap/mprotect 出可执行内存、不能 memfd_create + mmap(RX)、不能写文件再执行，常规 shellcode 落地手法没办法使用。
-   **Intel CET**：理论上 user space 有 SHSTK（挡 ROP）、kernel 有 IBT（挡 JOP/COP）。

## 公开 slide

[https://github.com/star-sg/Presentations/blob/main/HITCON%202026/Pwn2OwNothing\_%20When%20a%20KVM%20Full-Chain%20Escapes%20to%20Emptiness.pdf](https://github.com/star-sg/Presentations/blob/main/HITCON%202026/Pwn2OwNothing_%20When%20a%20KVM%20Full-Chain%20Escapes%20to%20Emptiness.pdf)

## Reference link

EOFCHECKSUM_OK

1.  1.https://hitcon.org/2026/en-US/agenda/ff905983-75ff-4cc6-9082-3cb9796f070f/ [↩](#fnref:1 "return to article")
