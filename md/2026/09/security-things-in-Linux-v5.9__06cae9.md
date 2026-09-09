---
title: security things in Linux v5.9
source: https://outflux.net/blog/archives/2021/04/05/security-things-in-linux-v5-9/
source_host: outflux.net
clip_date: 2026-09-09T10:54:57+08:00
trace_id: 3854ced8-0e5f-40a7-a610-723da82b2c79
content_hash: 4a7c85eb4a3b086251e2179d9f402bd7a4a04bff22ad12f7fe180abcb22df513
status: synced
tags:
  - Linux安全
  - 内核
series: null
feed_source: Kees Cook·Linux
ai_summary: TL;DR：Linux 5.9 内核安全更新包括 seccomp 文件描述符注入、栈变量零初始化、SLAB 释放检测加固，并新增 CAP_CHECKPOINT_RESTORE 能力。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d675244-d011-81a2-893f-ca68db0cf76f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Linux 5.9 内核安全更新包括 seccomp 文件描述符注入、栈变量零初始化、SLAB 释放检测加固，并新增 CAP_CHECKPOINT_RESTORE 能力。
> 
> - **seccomp fd 注入：** 新增 `SECCOMP_IOCTL_NOTIF_ADDFD` ioctl，使 `SECCOMP_RET_USER_NOTIF` 过滤器可以向目标进程注入 fd，让容器管理器能完整模拟 `open()`、`connect()` 等需要返回 fd 的系统调用；同时修复相关 bug 并重构 fd 接收代码。
> - **栈变量零初始化：** Clang 新增 `CONFIG_INIT_STACK_ALL_ZERO`，用置零替代早期模式化初始化；速度更快，并为字符串、指针、索引和大小提供安全默认值，可阻断整类未初始化栈变量漏洞。
> - **SLAB `kfree()` 加固：** SLAB 分配器补齐跨缓存释放检测与朴素双重释放检测，对齐 SLUB 的 `CONFIG_SLAB_FREELIST_HARDENED` 能力；主要保护使用 SLAB 的小型设备。
> - **新权限拆分：** 从 `CAP_SYS_ADMIN` 拆出 `CAP_CHECKPOINT_RESTORE`，用于容器进程 checkpoint/restore、修改 `/proc/self/exe` 等操作，安全影响低于原超级权限。
> - **其它安全硬化：** syscall 入口/出口改为架构无关例程，目前仅 x86 切换；`debugfs` 增加启动参数限制可见性；RISC-V 开始支持 stack protector；x86 对用户态 MSR 写入默认记录并 taint 内核，也支持运行时禁用。

Previously: [v5.8](https://outflux.net/blog/archives/2021/02/08/security-things-in-linux-v5-8/)

Linux [v5.9 was released in October, 2020](https://lore.kernel.org/lkml/CAHk-=wi-u86++np80GQvgDuARdt9xpBNho6SjHLmYgm8jibGag@mail.gmail.com). Here’s my summary of various security things that I found interesting:

## seccomp 文件描述符注入

**seccomp user_notif file descriptor injection**  
Sargun Dhillon added the ability for `SECCOMP_RET_USER_NOTIF` filters to [inject file descriptors into the target process](https://git.kernel.org/linus/7cf97b12545503992020796c74bd84078eb39299) using `SECCOMP_IOCTL_NOTIF_ADDFD`. This lets container managers fully emulate syscalls like `open()` and `connect()`, where an actual file descriptor is expected to be available after a successful syscall. In the process I [fixed](https://git.kernel.org/linus/d9539752d23283db4692384a634034f451261e29) a couple [bugs](https://git.kernel.org/linus/4969f8a073977123504609d7310b42a588297aa4) and [refactored](https://git.kernel.org/linus/c0029de50982c1fb215330a5f9d433cec0cfd8cc) the file descriptor receiving code.

## 栈变量零初始化

**zero-initialize stack variables with Clang**  
When Alexander Potapenko landed support for Clang’s [automatic variable initialization](https://outflux.net/blog/archives/2019/07/17/security-things-in-linux-v5-2/#v5.2-var-init), it did so with a byte pattern designed to really stand out in kernel crashes. Now he’s added support for doing [zero initialization](https://git.kernel.org/linus/f0fe00d4972a8cd4b98cc2c29758615e4d51cdfe) via `CONFIG_INIT_STACK_ALL_ZERO`, which besides actually being faster, has a few behavior benefits as well. “Unlike pattern initialization, which has a higher chance of triggering existing bugs, zero initialization provides safe defaults for strings, pointers, indexes, and sizes.” Like the pattern initialization, this feature stops entire classes of uninitialized stack variable flaws.

**common syscall entry/exit routines**  
Thomas Gleixner created [architecture-independent code to do syscall entry/exit](https://git.kernel.org/linus/fc4177be963dccad73b98d7db3a8a38911f952b7), since much of the kernel’s work during a syscall entry and exit is the same. There was no need to repeat this in each architecture, and having it implemented separately meant bugs (or features) might only get fixed (or implemented) in a handful of architectures. It means that features like seccomp become much easier to build since it wouldn’t need per-architecture implementations any more. Presently only [x86 has switched over to the common routines](https://git.kernel.org/linus/27d6b4d14f5c3ab21c4aef87dd04055a2d7adf14).

## SLAB 加固

**SLAB `kfree()` hardening**  
To reach `CONFIG_SLAB_FREELIST_HARDENED` feature-parity with the SLUB heap allocator, I added [naive double-free detection](https://git.kernel.org/linus/dabc3e291d56e3125113101bc6d53d1a1738294d) and the ability to [detect cross-cache freeing](https://git.kernel.org/linus/3404be67bf73515babd74acd8525d09dafe4234d) in the SLAB allocator. This should keep a class of type-confusion bugs from biting kernels using SLAB. (Most distro kernels use SLUB, but some smaller devices prefer the slightly more compact SLAB, so this hardening is mostly aimed at those systems.)

## 新增 CAPCHECKPOINTRESTORE

**new `CAP_CHECKPOINT_RESTORE` capability**  
Adrian Reber added the [new `CAP_CHECKPOINT_RESTORE` capability](https://git.kernel.org/linus/124ea650d3072b005457faed69909221c2905a1f), splitting this functionality off of `CAP_SYS_ADMIN`. The needs for the kernel to correctly checkpoint and restore a process (e.g. used to move processes between containers) continues to grow, and it became clear that the security implications were lower than those of `CAP_SYS_ADMIN` yet distinct from other capabilities. Using this capability is now the preferred method for doing things like [changing `/proc/self/exe`](https://git.kernel.org/linus/ebd6de6812387a2db9a52842cfbe004da1dd3be8).

## debugfs 可见性限制

**`debugfs` boot-time visibility restriction**  
Peter Enderborg added the [`debugfs` boot parameter](https://git.kernel.org/linus/a24c6f7bc923d5e2f3139855eb09b0d480d6b410) to control the visibility of the kernel’s debug filesystem. The contents of debugfs continue to be a common area of sensitive information being exposed to attackers. While this was effectively possible by unsetting `CONFIG_DEBUG_FS`, that wasn’t a great approach for system builders needing a single set of kernel configs (e.g. a distro kernel), so now it can be disabled at boot time.

**more seccomp architecture support**  
Michael Karcher implemented the [SuperH seccomp hooks](https://git.kernel.org/linus/0bb605c2c7f2b4b314b91510810b226de7f34fa1), Guo Ren implemented the [C-SKY seccomp hooks](https://git.kernel.org/linus/e95a4f8cb985e759648b32ed0b721a472deb86a5), and Max Filippov implemented the [xtensa seccomp hooks](https://git.kernel.org/linus/da94a40f72859ce24dc72de9292981513a33e427). Each of these included the ever-important updates to the seccomp regression testing suite in the kernel selftests.

**stack protector support for RISC-V**  
Guo Ren implemented [`-fstack-protector` (and `-fstack-protector-strong`) support for RISC-V](https://git.kernel.org/linus/f2c9699f65557a31fed4ddb9e5b4d9489b1bf32f). This is the initial global-canary support while the patches to GCC to support per-task canaries is getting finished (similar to the per-task canaries done for arm64). This will mean nearly all stack frame write overflows are no longer useful to attackers on this architecture. It’s nice to see this finally land for RISC-V, which is quickly approaching architecture feature parity with the other major architectures in the kernel.

**new `tasklet` API**  
Romain Perier and Allen Pais [introduced a new `tasklet` API](https://git.kernel.org/linus/12cc923f1ccc1df467e046b02a72c2b3b321b6a2) to make their use safer. Much like the [`timer_list` refactoring](https://outflux.net/blog/archives/2018/02/05/security-things-in-linux-v4-15/#v4.15-timer_list) work done earlier, the `tasklet` API is also a potential source of simple function-pointer-and-first-argument controlled exploits via linear heap overwrites. It’s a smaller attack surface since it’s used much less in the kernel, but it is the same weak design, making it a sensible thing to replace. While the use of the `tasklet` API is [considered deprecated](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/linux/interrupt.h?h=v5.9#n588) (replaced by [threaded IRQs](https://lore.kernel.org/lkml/20200716081538.2sivhkj4hcyrusem@linutronix.de)), it’s not always a simple mechanical refactoring, so the old API still needs refactoring (since that CAN be done mechanically is most cases).

**x86 `FSGSBASE` implementation**  
Sasha Levin, Andy Lutomirski, Chang S. Bae, Andi Kleen, Tony Luck, Thomas Gleixner, and others landed the long-awaited [`FSGSBASE` series](https://git.kernel.org/linus/4da9f3302615f4191814f826054846bf843e24fa). This provides task switching performance improvements while keeping the kernel safe from modules accidentally (or maliciously) trying to use the features directly (which exposed an [unprivileged direct kernel access hole](https://lwn.net/Articles/821723/)).

**filter x86 MSR writes**  
While it’s been long understood that writing to CPU Model-Specific Registers (MSRs) from userspace was a [bad idea](https://lore.kernel.org/lkml/20130208191213.GA25081@www.outflux.net/), it has been left enabled for things like [`MSR_IA32_ENERGY_PERF_BIAS`](http://manpages.ubuntu.com/manpages/xenial/man8/x86_energy_perf_policy.8.html). Boris Petkov has decided enough is enough and has now enabled logging and kernel tainting (`TAINT_CPU_OUT_OF_SPEC`) by default and a way to [disable MSR writes](https://git.kernel.org/linus/a7e1f67ed29f0c339e2aa7483d13b085127566ab) at runtime. (However, since this is controlled by a normal module parameter and the root user can just turn writes back on, I continue to recommend that people build with `CONFIG_X86_MSR=n`.) The expectation is that userspace MSR writes will be entirely removed in future kernels.

**`uninitialized_var()` macro removed**  
I made [treewide changes](https://git.kernel.org/linus/3f649ab728cda8038259d8f14492fe400fbab911) to [remove the `uninitialized_var()` macro](https://git.kernel.org/linus/63a0895d960aa3d3653ef0ecad5bd8579388f14b), which had been used to silence compiler warnings. The rationale for this macro was weak to begin with (“the compiler is reporting an uninitialized variable that is clearly initialized”) since it was mainly papering over compiler bugs. However, it creates a much more fragile situation in the kernel since now such uses can actually [disable automatic stack variable initialization](https://lore.kernel.org/lkml/20200603174714.192027-1-glider@google.com/), as well as mask legitimate “unused variable” warnings. The proper solution is to just initialize variables the compiler warns about.

**function pointer cast removals**  
Oscar Carter has started [removing](https://git.kernel.org/linus/5cdfbdce5de6b5b56e104676409762fc1289a9c2) function pointer [casts](https://git.kernel.org/linus/875102ea4b7700330a33c0db71555d91dafa9c82) from the kernel, in an effort to allow the kernel to build with `-Wcast-function-type`. The future use of Control Flow Integrity checking (which does validation of function prototypes matching between the caller and the target) tends not to work well with function casts, so it’d be [nice to get rid of these](https://github.com/KSPP/linux/issues/20) before CFI lands.

**flexible array conversions**  
As part of Gustavo A. R. Silva’s [on-going work](https://outflux.net/blog/archives/2021/02/08/security-things-in-linux-v5-8/#v5.8-flex-array) to replace [zero-length](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/log/?h=v5.9&qt=grep&q=zero-length+array) and [one-element](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/log/?h=v5.9&qt=grep&q=one-element+array) arrays with flexible arrays, he has [documented the details of the flexible array conversions](https://git.kernel.org/linus/68e4cd17e218971a2fd60c30fe14078dc0d8a68e), and the [various helpers](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/log/?h=v5.9&qt=grep&q=flex_array_size) to be used in kernel code. Every commit gets the kernel closer to building with `-Warray-bounds`, which catches a lot of potential buffer overflows at compile time.

That’s it for now! Please let me know if you think anything else needs some attention. Next up is Linux [v5.10](https://outflux.net/blog/archives/2022/04/04/security-things-in-linux-v5-10/).
