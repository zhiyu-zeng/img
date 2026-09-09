---
title: security things in Linux v5.10
source: https://outflux.net/blog/archives/2022/04/04/security-things-in-linux-v5-10/
source_host: outflux.net
clip_date: 2026-09-09T10:55:53+08:00
trace_id: ab9e0d0c-3d5f-4027-8403-0bf644f797b2
content_hash: 3bfec1c54b72e3dd2e2348aab63d33fcc30ceb5ed951af8577a7f587c1f14daa
status: synced
tags:
  - Linux安全
  - 内核
series: null
feed_source: Kees Cook·Linux
ai_summary: Linux v5.10 从寄存器加密、间接调用消除、网络随机性强化和地址空间隔离等方向修复多项安全缺口，并加入对 ARMv8.5 内存标签扩展的初步支持。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d675244-d011-8172-b985-cb4c256869f7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Linux v5.10 从寄存器加密、间接调用消除、网络随机性强化和地址空间隔离等方向修复多项安全缺口，并加入对 ARMv8.5 内存标签扩展的初步支持。
> 
> - **AMD SEV-ES 寄存器加密：** 在 SEV 内存加密基础上新增寄存器状态加密，使虚拟机宿主更难重构客户机 CPU 状态。
> - **x86 static calls：** 将函数指针间接调用改写为编译期确定的直接调用，消除该场景对 Retpoline 等 Spectre 缓解的依赖，并避免指针内存查找；调度器等热路径性能收益明显，兼具控制流完整性效果。
> - **网络 RNG 改进：** 用 SipHash round function 替换自研伪随机数生成器，并混入难以预测的内核内部状态，使攻击者难以仅凭网络流量猜测端口号或报文序号；同时调整 ICMP 全局限速器，避免泄露网络状态，缓解 DNS 缓存投毒攻击。
> - **set_fs() 全面移除：** x86、riscv、powerpc 已彻底移除 set_fs()，使这些架构不再受“内核地址限制”攻击影响，这类攻击原先只需破坏 thread_info 中的单个地址限制值。
> - **ARMv8.5 MTE 支持：** 新增内存标签扩展支持，用 4 位标签覆盖 16 字节粒度地址；借助释放/相邻分配间的标签旋转，可确定性消除线性堆缓冲区溢出，并显著提高 use-after-free 和越界访问的利用难度。

Previously: [v5.9](https://outflux.net/blog/archives/2021/04/05/security-things-in-linux-v5-9/)

Linux [v5.10 was released in December, 2020](https://lore.kernel.org/lkml/CAHk-=whCKhxNyKn1Arut8xUDKTwp3fWcCj_jbL5dbzkUmo45gQ@mail.gmail.com). Here’s my summary of various security things that I found interesting:

## AMD SEV-ES 寄存器加密

**AMD SEV-ES**  
While guest VM memory encryption with AMD SEV has been supported for a while, Joerg Roedel, Thomas Lendacky, and others added [register state encryption (SEV-ES)](https://git.kernel.org/linus/da9803dfd3955bd2f9909d55e23f188ad76dbe58). This means it’s even harder for a VM host to reconstruct a guest VM’s state.

## x86 静态调用

**x86 static calls**  
Josh Poimboeuf and Peter Zijlstra implemented [static calls](https://git.kernel.org/linus/dd502a81077a5f3b3e19fa9a1accffdcab5ad5bc) for x86, which operates very similarly to the “static branch” infrastructure in the kernel. With static branches, an `if` / `else` choice can be hard-coded, instead of being run-time evaluated every time. Such branches can be updated too (the kernel just rewrites the code to switch around the “branch”). All these principles apply to static calls as well, but they’re for replacing indirect function calls (i.e. a call through a function pointer) with a direct call (i.e. a hard-coded call address). This eliminates the need for Spectre mitigations (e.g. RETPOLINE) for these indirect calls, and avoids a memory lookup for the pointer. For hot-path code (like the scheduler), this has a measurable performance impact. It also serves as a kind of Control Flow Integrity implementation: an indirect call got removed, and the potential destinations have been explicitly identified at compile-time.

## 网络 RNG 改进

**network RNG improvements**  
In an effort to improve the pseudo-random number generator used by the network subsystem (for things like port numbers and packet sequence numbers), Linux’s home-grown [pRNG has been replaced by the SipHash round function](https://git.kernel.org/linus/c51f8f88d705e06bd696d7510aff22b33eb8e638), and [perturbed](https://git.kernel.org/linus/3744741adab6d9195551ce30e65e726c7a408421) by (hopefully) hard-to-predict internal kernel states. This should make it very hard to brute force the internal state of the pRNG and make predictions about future random numbers just from examining network traffic. Similarly, [ICMP’s global rate limiter](https://git.kernel.org/linus/b38e7819cae946e2edf869e604af1e65a5d241c5) was adjusted to avoid leaking details of network state, as a start to fixing recent [DNS Cache Poisoning](https://www.saddns.net/) attacks.

**SafeSetID handles GID**  
Thomas Cedeno improved the [SafeSetID LSM](https://www.kernel.org/doc/html/latest/admin-guide/LSM/SafeSetID.html) to [handle group IDs](https://git.kernel.org/linus/5294bac97e12bdabbb97e9adf44d388612a700b8) (which required teaching the kernel about which syscalls were [actually performing setgid](https://git.kernel.org/linus/5294bac97e12bdabbb97e9adf44d388612a700b8).) Like the earlier [setuid policy](https://outflux.net/blog/archives/2019/05/27/security-things-in-linux-v5-1/#v5.1-safesetid), this lets the system owner define an explicit list of allowed group ID transitions under `CAP_SETGID` (instead of to just any group), providing a way to keep the power of granting this capability much more limited. (This isn’t complete yet, though, since handling `setgroups()` is still needed.)

**improve kernel’s internal checking of file contents**  
The kernel provides LSMs (like the Integrity subsystem) with details about files as they’re loaded. (For example, loading modules, new kernel images for kexec, and firmware.) There wasn’t very good coverage for cases where the contents were coming from things that weren’t files. To deal with this, [new hooks were added](https://git.kernel.org/linus/b64fcae74b6d6940d14243c963ab0089e8f0d82d) that allow the LSMs to introspect the contents directly, and to do partial reads. This will give the LSMs much finer grain visibility into these kinds of operations.

## setfs 移除

**set_fs removal continues**  
With the [earlier work](https://outflux.net/blog/archives/2021/02/08/security-things-in-linux-v5-8/#v5.8-set_fs) landed to free the core kernel code from `set_fs()`, Christoph Hellwig made it possible for [set_fs() to be optional for an architecture](https://git.kernel.org/linus/3c57fa13f6bf3906643034c57736c778ce63fa55). Subsequently, he then removed `set_fs()` entirely for [x86](https://git.kernel.org/linus/47058bb54b57962b3958a936ddbc59355e4c5504), [riscv](https://git.kernel.org/linus/e8d444d3e98c255f91d228984abc46cfdfaf48b4), and [powerpc](https://git.kernel.org/linus/5ae4998b5d6fc703a16c9fa935fb7d335843bf22). These architectures will now be free from the entire class of “kernel address limit” attacks that only needed to corrupt a single value in `struct thead_info`.

**sysfs_emit() replaces sprintf() in /sys**  
Joe Perches tackled one of the most common bug classes with `sprintf()` and `snprintf()` in `/sys` handlers by creating a new helper, [`sysfs_emit()`](https://git.kernel.org/linus/2efc459d06f1630001e3984854848a5647086232). This will handle the cases where kernel code was not correctly dealing with the length results from `sprintf()` calls, which might lead to buffer overflows in the `PAGE_SIZE` buffer that `/sys` handlers operate on. With the helper in place, it was possible to [start the refactoring](https://git.kernel.org/linus/aa838896d87af561a33ecefea1caa4c15a68bc47) of the many `sprintf()` callers.

**nosymfollow mount option**  
Mattias Nissler and Ross Zwisler implemented the [`nosymfollow` mount option](https://git.kernel.org/linus/dab741e0e02bd3c4f5e2e97be74b39df2523fc6e). This entirely disables symlink resolution for the given filesystem, similar to other mount options where `noexec` disallows `execve()`, `nosuid` disallows setid bits, and `nodev` disallows device files. Quoting the patch, it is “useful as a defensive measure for systems that need to deal with untrusted file systems in privileged contexts.” (i.e. for when `/proc/sys/fs/protected_symlinks` isn’t a big enough hammer.) Chrome OS uses this option for its stateful filesystem, as symlink traversal as been a .

## ARMv8.5 内存标签支持

**ARMv8.5 Memory Tagging Extension support**  
Vincenzo Frascino added support to arm64 for the coming Memory Tagging Extension, which will be available for ARMv8.5 and later chips. It provides 4 bits of tags (covering multiples of 16 byte spans of the address space). This is enough to deterministically eliminate all linear heap buffer overflow flaws (1 tag for “free”, and then rotate even values and odd values for neighboring allocations), which is probably one of the most common bugs being currently exploited. It also makes use-after-free and over/under indexing much more difficult for attackers (but still possible if the target’s tag bits can be exposed). Maybe some day we can switch to 128 bit virtual memory addresses and have fully versioned allocations. But for now, 16 tag values is better than none, though we do still need to wait for anyone to actually be shipping ARMv8.5 hardware.

**fixes for flaws found by UBSAN**  
The work to make [UBSAN generally usable](https://outflux.net/blog/archives/2020/09/21/security-things-in-linux-v5-7/#v5.7-array-bounds) under [syzkaller](https://syzkaller.appspot.com/upstream#open) continues to bear fruit, with various [fixes](https://git.kernel.org/linus/2c334e12f957) all over the kernel for stuff like [shift](https://git.kernel.org/linus/eb2667b34336) -out-of- [bounds](https://git.kernel.org/linus/0425e7badbdc), [divide-by-zero](https://git.kernel.org/linus/22f760941844), and [integer overflow](https://git.kernel.org/linus/cb47755725da). Seeing these kinds of patches land reinforces the the rationale of shifting the burden of these kinds of checks to the toolchain: these run-time bugs continue to pop up.

**flexible array conversions**  
The work on [flexible array conversions](https://outflux.net/blog/archives/2021/04/05/security-things-in-linux-v5-9/) continues. Gustavo A. R. Silva and others continued to grind on the [conversions](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/log/?h=v5.10&qt=grep&q=flex.*array), getting the kernel ever closer to being able to enable the `-Warray-bounds` compiler flag and clear the path for saner bounds checking of array indexes and `memcpy()` usage.

That’s it for now! Please let me know if you think anything else needs some attention. Next up is Linux v5.11.
