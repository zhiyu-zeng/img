---
title: security things in Linux v5.8
source: https://outflux.net/blog/archives/2021/02/08/security-things-in-linux-v5-8/
source_host: outflux.net
clip_date: 2026-09-09T10:54:38+08:00
trace_id: 8b88e1dc-0f98-4185-940f-cce5ac7ac865
content_hash: 516474d60a7f9a355b607855f0d63372bde2710bb12ba6d10e1a9d21bfff1114
status: synced
tags:
  - Linux安全
  - 安全工具
series: null
feed_source: Kees Cook·Linux
ai_summary: Linux v5.8 引入多项安全机制，其中 arm64 硬件 BTI 与内核 Shadow Call Stack 分别削弱 JOP/ROP 攻击面，并新增 CAP_PERFMON、CAP_BPF 实现权限细分。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d675244-d011-816a-8c19-e36ab1ace4d7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Linux v5.8 引入多项安全机制，其中 arm64 硬件 BTI 与内核 Shadow Call Stack 分别削弱 JOP/ROP 攻击面，并新增 CAP_PERFMON、CAP_BPF 实现权限细分。
> 
> - **arm64 BTI：** 支持 ARMv8.5 分支目标识别，在 execve 用户态和内核态全程启用，需手动标记汇编与 JIT 代码；可阻止跳转导向编程（JOP），将攻击可用目标从任意内核文本字缩减到函数入口，属于低粒度的前向边 CFI。
> - **arm64 Shadow Call Stack：** 合入 Clang SCS 内核实现，用独立寄存器 x18 保存返回地址副本以对抗 ROP；属于软件防御，依赖影子栈地址保密，预期在 ARMv8.3 PAC 硬件可用前使用。
> - **内核 KCSAN：** 新增 Kernel Concurrency Sanitizer 调试基础设施（CONFIG_KCSAN）用于发现数据竞争，上线即发现并修复了真实 bug。
> - **新能力位：** CAP_PERFMON 放开 perf() 只读访问，CAP_BPF 拆分 BPF 权限；二者均取代原先必须的 CAP_SYS_ADMIN，但修改内核完整性（写操作）仍需 CAP_SYS_ADMIN。
> - **其他加固：** 网络 RNG 状态更难预测；修复多处向非 CAP_SYSLOG 用户泄露内核地址的问题；RISCV 增加 CONFIG_DEBUG_WX 检测可写可执行内存；execve() 重构去递归并补 binfmt_script 回归测试；支持同 PID 命名空间挂载多个 /proc 实例（含 hidepid=4、subset=pid）；持续移除 set_fs() 接口；原生 64 位进程不再获得 READ_IMPLIES_EXEC；继续柔性数组与 scnprintf() 替换工作。

Previously: [v5.7](https://outflux.net/blog/archives/2020/09/21/security-things-in-linux-v5-7/)

Linux [v5.8 was released in August, 2020](https://lore.kernel.org/lkml/CAHk-=wj+mDPbj8hXspXRAksh+1TmPjubc9RNEbu8EVpYyypX=w@mail.gmail.com). Here’s my summary of various security things that caught my attention:

**arm64 Branch Target Identification**  
Dave Martin [added support for ARMv8.5’s Branch Target Instructions](https://git.kernel.org/linus/8ef8f360cf30be12382f89ff48a57fbbd9b31c14) ([BTI](https://developer.arm.com/architectures/learn-the-architecture/providing-protection-for-complex-software/single-page)), which are enabled in [userspace at execve()](https://git.kernel.org/linus/ab7876a98a2160092133de4c648e94b18bc3f139) time, and all the time [in the kernel](https://git.kernel.org/linus/92e2294d870bc9e77592c2454f565c3bd6bb79ad) (which required manually marking up a lot of non-C code, like assembly and [JIT code](https://git.kernel.org/linus/fa76cfe65c1d748ef418e930a4b631a03b28f04c)).

## BTI对JOP的缓解

With this in place, Jump-Oriented Programming (JOP, where code gadgets are chained together with jumps and calls) is no longer available to the attacker. An attacker’s code must make direct function calls. This basically reduces the “usable” code available to an attacker from every word in the kernel text to only function entries (or jump targets). This is a “low granularity” forward-edge Control Flow Integrity (CFI) feature, which is important (since it greatly reduces the potential targets that can be used in an attack) and cheap (implemented in hardware). It’s a good first step to strong CFI, but (as we’ve seen with things like CFG) it isn’t usually strong enough to stop a motivated attacker. “High granularity” CFI (which uses a more specific branch-target characteristic, like function prototypes, to track expected call sites) is not yet a hardware supported feature, but the software version will be coming in the future by way of [Clang’s CFI implementation](https://github.com/samitolvanen/linux/commits/clang-cfi).

**arm64 Shadow Call Stack**  
Sami Tolvanen landed the [kernel implementation of Clang’s Shadow Call Stack](https://git.kernel.org/linus/5287569a790d2546a06db07e391bf84b8bd6cf51) ([SCS](https://clang.llvm.org/docs/ShadowCallStack.html)), which protects the kernel against Return-Oriented Programming (ROP) attacks (where code gadgets are chained together with returns). This backward-edge CFI protection is implemented by keeping a second dedicated stack pointer register (`x18`) and keeping a copy of the return addresses stored in a separate “shadow stack”. In this way, manipulating the regular stack’s return addresses will have no effect. (And since a copy of the return address continues to live in the regular stack, no changes are needed for back trace dumps, etc.)

## SCS与硬件方案对比

It’s worth noting that unlike BTI (which is hardware based), this is a software defense that relies on the location of the Shadow Stack (i.e. the value of `x18`) staying secret, since the memory could be written to directly. Intel’s hardware ROP defense (CET) uses a hardware shadow stack that isn’t directly writable. ARM’s hardware defense against ROP is [PAC](https://outflux.net/blog/archives/2020/09/21/security-things-in-linux-v5-7/#v5.7-pac) (which is actually designed as an arbitrary CFI defense — it can be used for forward-edge too), but that depends on having ARMv8.3 hardware. The expectation is that SCS will be used until PAC is available.

**Kernel Concurrency Sanitizer infrastructure added**  
Marco Elver landed support for the [Kernel Concurrency Sanitizer](https://git.kernel.org/linus/dfd402a4c4baae42398ce9180ff424d589b8bffc), which is a new debugging infrastructure to find data races in the kernel, via `CONFIG_KCSAN`. This immediately found real bugs, with some fixes having [already](https://git.kernel.org/linus/d6c1f098f2a7ba62627c9bc17cda28f534ef9e4a) [landed](https://git.kernel.org/linus/68ace460c5b2a96a82ee49ab0b589ceed8abd000) too. For more details, see the [KCSAN documentation](https://www.kernel.org/doc/html/latest/dev-tools/kcsan.html).

## 新增能力位权限拆分

**new capabilities**  
Alexey Budankov [added `CAP_PERFMON`](https://git.kernel.org/linus/980737282232b752bb14dab96d77665c15889c36/), which is designed to allow access to `perf()`. The idea is that this capability gives a process access to only read aspects of the running kernel and system. No longer will access be needed through the much more powerful abilities of `CAP_SYS_ADMIN`, which has many ways to change kernel internals. This allows for a split between controls over the confidentiality (read access via CAP_PERFMON) of the kernel vs control over integrity (write access via CAP_SYS_ADMIN).

Alexei Starovoitov [added `CAP_BPF`](https://git.kernel.org/linus/a17b53c4a4b55ec322c132b6670743612229ee9c/), which is designed to separate BPF access from the all-powerful `CAP_SYS_ADMIN`. It is designed to be used in combination with `CAP_PERFMON` for tracing-like activities and `CAP_NET_ADMIN` for networking-related activities. For things that could change kernel integrity (i.e. write access), `CAP_SYS_ADMIN` is still required.

**network random number generator improvements**  
Willy Tarreau made the [network code’s random number generator less predictable](https://git.kernel.org/linus/f227e3ec3b5cad859ad15666874405e8c1bbc1d4). This will further frustrate any attacker’s attempts to recover the state of the RNG externally, which might lead to the ability to hijack network sessions (by correctly guessing packet states).

## 修复地址泄露等加固项

**fix various kernel address exposures to non- `CAP_SYSLOG`**  
I fixed several situations where kernel addresses were still being exposed to unprivileged (i.e. non- `CAP_SYSLOG`) users, though usually only through odd corner cases. After [refactoring how capabilities were being checked](https://git.kernel.org/linus/60f7bb66b88b649433bf700acfc60c3f24953871) for files in `/sys` and `/proc`, the [kernel modules sections](https://git.kernel.org/linus/b25a7c5af9051850d4f3d93ca500056ab6ec724b), [kprobes](https://git.kernel.org/linus/60f7bb66b88b649433bf700acfc60c3f24953871), and [BPF](https://git.kernel.org/linus/63960260457a02af2a6cb35d75e6bdb17299c882) exposures got fixed. (Though in doing so, I briefly made things much worse before getting it [properly fixed](https://git.kernel.org/linus/11990a5bd7e558e9203c1070fc52fb6f0488e75b). Yikes!)

**RISCV W^X detection**  
Following up on his recent work to [enable strict kernel memory protections on RISCV](https://outflux.net/blog/archives/2020/09/21/security-things-in-linux-v5-7/#v5.7-wx-riscv), Zong Li has now added [support for `CONFIG_DEBUG_WX`](https://git.kernel.org/linus/b422d28b21773bbfc9e84dbb5579a8ce355279ca) as seen for other architectures. Any writable and executable memory regions in the kernel (which are lovely targets for attackers) will be loudly noted at boot so they can get corrected.

**`execve()` refactoring continues**  
Eric W. Biederman continued working on [`execve()` refactoring](https://git.kernel.org/linus/56305aa9b6fab91a5555a45796b79c1b0a6353d1), including getting rid of the [frequently problematic recursion](https://git.kernel.org/linus/bc2bf338d54b7aadaed49bb45b9e10d4592b2a46) used to locate binary handlers. I used the opportunity to dust off some old [`binfmt_script` regression tests](https://git.kernel.org/linus/b081320f0693cce0394f7c8bad9fba0b25982186) and get them into the kernel selftests.

**multiple `/proc` instances**  
Alexey Gladkov modernized `/proc` internals and provided a way to have [multiple `/proc` instances](https://git.kernel.org/linus/fa10fed30f2550313a8284365b3e2398526eb42c) mounted in the same PID namespace. This allows for having multiple views of `/proc`, with different features enabled. (Including the newly added [hidepid=4](https://git.kernel.org/linus/24a71ce5c47f6b1b3cdacf544cb24220f5c3b7ef) and [subset=pid](https://git.kernel.org/linus/6814ef2d992af09451bbeda4770daa204461329e) mount [options](https://www.kernel.org/doc/html/latest/filesystems/proc.html#mount-options).)

**`set_fs()` removal continues**  
Christoph Hellwig, with Eric W. Biederman, Arnd Bergmann, and others, have been diligently working to entirely remove the kernel’s `set_fs()` interface, which has long been a source of security flaws due to weird confusions about which address space the kernel thought it should be accessing. Beyond things like the lower-level per-architecture [signal handling](https://git.kernel.org/linus/c3b3f52476412a3899f2c65b220075aceb18dd2c) code, this has needed to touch various [parts](https://git.kernel.org/linus/fa4751f454e6b51ef93babfd8b6c8b43a65c9db2) of the [ELF](https://git.kernel.org/linus/d2530b436f114dfbd1adc70c59d8d31038318726) loader, and [networking](https://git.kernel.org/linus/1f466e1f15cf1dac7c86798d694649fc42cd868a) code too.

**`READ_IMPLIES_EXEC` is no more for native 64-bit**  
The `READ_IMPLIES_EXEC` flag was a work-around for dealing with the addition of non-executable (NX) memory when x86_64 was introduced. It was designed as a way to mark a memory region as “well, since we don’t know if this memory region was expected to be executable, we must assume that if we need to read it, we need to be allowed to execute it too”. It was designed mostly for stack memory (where trampoline code might live), but it would carry over into all `mmap()` allocations, which would mean sometimes exposing a large attack surface to an attacker looking to find executable memory. While normally this didn’t cause problems on modern systems that correctly marked their ELF sections as NX, there were still some awkward corner-cases. I fixed this by splitting `READ_IMPLIES_EXEC` from the ELF `PT_GNU_STACK` marking on [x86](https://git.kernel.org/linus/122306117afe4ba202b5e57c61dfbeffc5c41387) and [arm/arm64](https://git.kernel.org/linus/eaf3f9e61887332d5097dbf0b327b8377546adc5), and declaring that a native 64-bit process would never gain `READ_IMPLIES_EXEC` on [x86_64](https://git.kernel.org/linus/9fccc5c0c99f238aa1b0460fccbdb30a887e7036) and [arm64](https://git.kernel.org/linus/6e0d6ac5f3d9d90271899f6d340872360fe1caee), which matches the behavior of other native 64-bit architectures that correctly didn’t ever implement `READ_IMPLIES_EXEC` in the first place.

**array index bounds checking continues**  
As part of the ongoing work to use modern flexible arrays in the kernel, Gustavo A. R. Silva added the [`flex_array_size()` helper](https://git.kernel.org/linus/b19d57d0f3cc6f1022edf94daf1d70506a09e3c2) (as a cousin to `struct_size()`). The [zero/one-member into flex array conversions](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/log/?h=v5.8&qt=grep&q=with+flexible-array) continue with over a hundred commits as we slowly get closer to being able to build with `-Warray-bounds`.

**`scnprintf()` replacement continues**  
Chen Zhou joined Takashi Iwai in [continuing](https://outflux.net/blog/archives/2020/09/21/security-things-in-linux-v5-7/#v5.7-scnprintf) to replace potentially unsafe uses of `sprintf()` with `scnprintf()`. Fixing all of these will make sure the kernel avoids nasty buffer concatenation surprises.

That’s it for now! Let me know if there is anything else you think I should mention here. Next up: Linux [v5.9](https://outflux.net/blog/archives/2021/04/05/security-things-in-linux-v5-9/).
