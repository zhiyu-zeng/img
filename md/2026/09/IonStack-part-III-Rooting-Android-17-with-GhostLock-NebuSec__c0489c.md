---
title: "IonStack part III: Rooting Android 17 with GhostLock | NebuSec"
source: https://nebusec.ai/research/ionstack-part-3/
source_host: nebusec.ai
clip_date: 2026-09-21T11:45:15+08:00
trace_id: 133b749c-b591-416d-b33b-fd9dffcc914e
content_hash: f4fae99da3135e4b09d1e22254ac4a7a3d2cf8f69d7ae51053f75a9bf67d7ec3
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: NebuSec
ai_summary: GhostLock（CVE-2026-43499）从 Linux 移植到 Android 17，用纯数据改写绕过 CFI、KASLR 与 KPTI，做出首个公开 Android 17 root。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3e275244-d011-8160-b7de-c7346102b332
ioc:
  cves:
    - CVE-2022-42703
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
> GhostLock（CVE-2026-43499）从 Linux 移植到 Android 17，用纯数据改写绕过 CFI、KASLR 与 KPTI，做出首个公开 Android 17 root。
> 
> - **CFI 约束：** Android 2022 年起改用基于函数签名（参数/返回类型哈希）的 Clang CFI，函数指针只能劫持到签名完全相同的目标；x86 上 ~50 万签名还会在启动时随机化。
> - **栈回收：** ARM 上改用 `pselect` 把 `fd_set` 位图拷上内核栈覆盖被释放的帧，伪造 `rt_mutex_waiter`；再以 `sendmsg` 喷 `sk_buff` 存放假 `rt_mutex`，靠 KernelSnitch + cross-cache 定位其地址。
> - **KASLR 泄露：** 用受限任意写改 `/proc/sys/kernel/random/boot_id` 的 sysctl `.data` 指针，指向已存活的 `loggers[0][1]`（`&nfulnl_logger`），读回 UUID 解码后减去已知偏移得到 slide。
> - **ashmem 劫持：** Android 17 经 `/dev/ashmem<boot_id>` 触及驱动，把 `ashmem_misc.fops` 换成同签名 `configfs` 的 `read_iter`/`write_iter`；`ASHMEM_SET_NAME` 改 `private_data` 后可任意内核读写。ashmem 的 Rust 重写不影响该路径。
> - **提权收尾：** 再次用 KernelSnitch 定位 `pipe_buffer` 并改其 `page`，把受限读写升级为完全任意读写；随后清 `cred` 的 uid/gid、securebits、seccomp 与 `no_new_privs`、置满 CAP_FULL，并把 `selinux_enforcing` 写 0 使 SELinux 全局宽容。

Need something less technical? Take a quick look at our bug summary.

[Read the bug summary →](https://nebusec.ai/buglist/CVE-2026-43499/)

> GhostLock (CVE-2026-43499) is a Linux kernel vulnerability found by Nebula Security that exists in every major distribution since 2011. After turning it into a stable privilege escalation and container escape and winning $92,337 in kernelCTF, we took one step further and used GhostLock to develop the world’s first public Android 17 root. This writeup covers the additional exploit techniques used to migrate the exploit for Android.

Your browser does not support the video tag.

In the [previous part](https://nebusec.ai/research/ionstack-part-2/), we discussed the root cause of GhostLock (CVE-2026-43499), how we reclaimed the ‘freed’ stack, faked a `rt_mutex_waiter` and got a constrained pointer write, and eventually got control flow hijack from `inet6_protos` and used [DirtyMode](https://nebusec.ai/research/ionstack-part-2/#the-pivot-and-dirtymode) to finish privilege escalation on Linux.

Since on Android Control Flow integrity (CFI) is enabled by default, we need to find another alternative to help us finish the last step of privilege escalation.

Besides, as we are now targeting ARM devices and KPTI is enabled, prefetch side channel is no longer easy to use, so we also need another approach to bypass KASLR.

And of course we also need to change our strategy to reclaim the stack.

> If there is no CFI protection (like `CFI_CLANG`, ARM `BTI`, or Intel `CET`) enabled, getting arbitrary code execution after controlling a function pointer is a much easier job: [RetSpill](https://dl.acm.org/doi/abs/10.1145/3576915.3623220), [Ret2BPFJIT](https://github.com/google/security-research/blob/master/pocs/linux/kernelctf/CVE-2024-36972_lts_cos/docs/exploit.md#achieve-container-escape), [KEPLER](https://www.usenix.org/system/files/sec19-wu-wei.pdf), [cpu_entry_area pivot](https://googleprojectzero.blogspot.com/2022/12/exploiting-CVE-2022-42703-bringing-back-the-stack-attack.html), [panic_on_oops disable](https://velog.io/@0range1337/CTF-corCTF-2025-zenerational-aura-Powerful-kernel-exploitation-primitive-via-paniconoops) … and regular ROP.

## Backgrounds

### (Kernel) Control Flow Integrity on Android

Before 2022, Android used a jump table based white list to check legit call/jump targets and protect CFI. This feature required LTO to be enabled, which introduced heavy compile overhead, and could not protect some flexible functions such as JITed BPF programs (there were no checks for those function calls at all).

In 2022, Android switched to the new Clang CFI feature based on function signature. It hashes the type of function arguments and return value and checks the target hash before each indirect call. This approach supports much more flexible targets and no longer depends on LTO.

The hash is baked in at compile time, emitted into a `__cfi_<func>` “preamble” that sits right before each function’s entry, and the caller checks the target’s hash before every indirect call.

The check itself is shown in the following figure:

![CFI overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/89342141ad8ff52b.svg)

![CFI overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/828442dd628f04fb.svg)

The caller loads the hash sitting ahead of the callee and compares it at callsite. In the figure, `proc_do_uuid` and `proc_dostring` share the same argument and return value types, so they would have the same hash and CFI will allow the indirect call to any of them, while for example, `commit_creds` has a different prototype and would trap into `report_cfi_failure()`.

With the latest CFI implementation on Android, we can only hijack the function pointer to another function that has the same signature, i.e. exact argument and return value types. In the following writeup, we swapped `ashmem` ’s `read_iter` / `write_iter` for `configfs` ’s, since they both are VFS handlers with type `ssize_t (struct kiocb *, struct iov_iter *)` (so they would have the same hash).

Can I forge the hash?

That said, the function hash is fixed for each build, so the attacker can forge a legit hash signature if they can spray executable memory in kernel. Which is in fact potentially feasible as unlike eBPF, cBPF program is not restricted by either `unpriv_bpf_disabled` sysctl or `bpf()` blacklist on SELinux. And `bpf_jit_harden={1,2}` really does little help (at least on x86), according to [this kernelCTF writeup](https://github.com/google/security-research/blob/bc107b0437c09e3b430948a60ab29f65338e4fff/pocs/linux/kernelctf/CVE-2025-21700_lts_cos_mitigation/docs/novel-techniques.md).

However, on x86, after [`0c3e806ec0f9`](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=0c3e806ec0f9), all ~500,000 signatures will be randomized once by XORing a shared key during the boot time. This prevents the attacker from predicting the signature without an (arbitrary) kernel memory read.

### Probe the address of (almost) arbitrary kernel objects

Accessing kernel data structures such as hash tables can take different numbers of cycles depending on their internal state (e.g., empty buckets versus collision chains). The [initial NDSS work](https://www.ndss-symposium.org/ndss-paper/kernelsnitch-side-channel-attacks-on-kernel-data-structures/) showed that an unprivileged process can amplify these **software-level** timing differences through controlled system calls and infer the state of a kernel data structure. When the targeted hash table folds the caller’s `mm_struct` pointer into its bucket index, timing the bucket traversal recovers the address of the current `mm_struct`.

[Lukas’s follow-up post](https://lukasmaar.github.io/posts/heap-kaslr-leak/index.html) combines this timing leak with cross-cache reuse targeting specific objects such as `msg_msg` and `pipe_buffer`. Because `mm_struct` is allocated from the dedicated `mm_cachep` slab, its leaked address gives the location of the backing slab page. By freeing that page and reclaiming it as a target slab through allocator manipulation, an attacker can get the precise address of the targeted object.

### Free (but limited) KASLR bypass with Linear Map

As [Project Zero showed](https://projectzero.google/2025/11/defeating-kaslr-by-doing-nothing-at-all.html), commit [`1db780bafa4c`](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=1db780bafa4c) removed linear map randomization on arm64, so the base of `physmap` is no longer randomized. This allows us to access a rw map of kernel image (read only for original ro or rx memory) at fixed address, as shown in following figure.

![Linear overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a4998f4c0b476d63.svg)

![Linear overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f67c3a8d258483fe.svg)

> Even if `physmap` is properly randomized (or physical ASLR is enabled), its base address can still be probed with [KernelSnitch](https://lukasmaar.github.io/posts/heap-kaslr-leak/index.html).

However, as the Linear Map is now mapped as non-executable, if we want to reuse some executable code, we will still need a separate KASLR bypass. So we still need the true KASLR slide.

## Exploit Summary

-   **GhostLock** -> Leave a dangling `rt_mutex_waiter` in the waiter task’s `pi_blocked_on`.
-   ① **Reclaim** -> Use `pselect` to reclaim the waiter’s frame and fake a `rt_mutex_waiter` over it.
-   ② **bootid** -> Overwrite `boot_id` ’s sysctl `.data`, read `&nfulnl_logger` back to leak KASLR slide.
-   ③ **ashmem** -> Hijack `ashmem` ’s `fops` with `configfs` handlers for a constrained kernel read-write.
-   ④ **pipe_buffer** -> Escalate `copy_{to,from}_user` to unlimited `page*` full address read & write.
-   ⑤ **Get root** -> Disable SELinux and patch `cred` struct to escape seccomp and become root.

> Note that the physmap base is fixed, and the same GhostLock primitive was used **twice**, first to leak the KASLR slide in **bootid**, then to overwrite the **`ashmem`** fops.

![Exploit overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/895aeb84601b9169.svg)

![Exploit overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/52b1407f7e466663.svg)

## Exploit Details

### Getting memory write primitive back

Recall the [initial primitive from GhostLock](https://nebusec.ai/research/ionstack-part-2/#the-initial-primitive-from-ghostlock). We can eventually write a pointer to an arbitrary (but constrained) address. To do so, we need to:

-   Get the freed stack memory back (spray): [\-> Reusing the stack](#reusing-the-stack)
-   Get the fake `rt_mutex_waiter` past its structural checks and dereferences: [\-> Fake a waiter](#fake-a-waiter)

#### Reusing the stack

We still start with spraying controlled bytes at the same stack offset, while the syscall that helps us reclaim the stack frame is target-specific, since both the frame depth and a syscall’s reach shift as the kernel image changes. On the Pixel 10 (Android 17) we use `pselect`, which copies our `fd_set` bitmaps onto the kernel stack, right over the freed frame.

> `clone` / `setsockopt` / `keyctl` and other syscalls with large controlled stack locals work the same way. Here are more that reclaim the frame in our [open-sourced PoC code](https://github.com/NebuSec/CyberMeowfia/blob/main/IonStack/CVE-2026-43499/poc/poc.c).

Over the reclaimed frame we forge the `rt_mutex_waiter`:

-   `tree` / `pi_tree`, rb nodes crafted so the erase operation will give us a write primitive.
-   `task`, set to `&init_task` through its `physmap` alias, so the chain walk’s task derefs are safe.
-   `lock`, pointing at a fake `rt_mutex` we spray into `sk_buff` data and locate with KernelSnitch.

#### Fake a waiter

Getting that fake waiter past its structural checks and pointer dereferences needs controlled kernel memory at a known address, the same role the CEA played on x86.

Since the CEA trick no longer holds on ARM, here we spray `sk_buff` data with `sendmsg`, a raw-byte elastic object, and locate it with [KernelSnitch](https://lukasmaar.github.io/posts/heap-kaslr-leak/index.html) plus cross-cache reuse. We then place the fake `rt_mutex` that `lock` points at into the located `sk_buff`, to pass the walk’s checks on `lock` and make the dequeue’s rb-erase our one constrained write.

### Hammer with a Nail

On Android, a data-only approach to LPE makes our life easier as we no longer need to deal with CFI. But now since all we get is a weak pointer write with lots of constraints, we look for a similar function-table hijack path, like we used in the Linux exploit.

Project Zero [analyzed a modern in-the-wild Android exploit](https://projectzero.google/2023/09/analyzing-modern-in-wild-android-exploit.html) and shared the trick that overwrites `ashmem` ’s `file_operations` with same-signature `configfs` handlers, turning its `read` / `write` into a constrained kernel read-write that CFI cannot tell apart.

However, reaching `ashmem` from an untrusted App has gotten harder over time:

-   Before SDK 29, `/dev/ashmem` could be opened directly and SELinux did not complain.
-   Apps targeting SDK 29 (Android 10) can no longer open `/dev/ashmem` directly, but for a while we could still dodge that by building against `targetSdkVersion` 28 or lower.
-   Now, even the old low `targetSdkVersion` trick is dead, but the untrusted App can still reach the driver by opening that device node directly under a per-boot name, `/dev/ashmem<boot_id>`.

On Android 17, we use `/dev/ashmem<boot_id>` to access `ashmem`, and hijack `ashmem_misc.fops` table in the same way, putting `configfs` ’s `read_iter` / `write_iter` into it (Those handlers are live `.text`, so this step needs the KASLR slide we recover in the next section).

![Ashmem arb rw overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3da0e0e8a92bfefb.svg)

![Ashmem arb rw overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/46f1bca99dabf6ce.svg)

As the above figure shows, we can first use `ASHMEM_SET_NAME` to modify `ashmem` ’s `private_data`, which will be later treated as a `struct configfs_buffer* buffer` in `configfs` ’s handlers. After we overwrote the `ashmem_misc.fops`, a `read(fd, addr, len)` will use `buffer->page` as the target address, and a `write(fd, addr, len)` will use `buffer->bin_buffer`, which eventually gives us an arbitrary kernel memory read and write (It comes from `copy_{from,to}_user`, so it has few extra checks and a length limit. But still, good enough to finish LPE).

Can Rust rewrite save us?

Android has rewritten `ashmem` in Rust since Linux mainline dropped it in 5.18.

However, that rewrite only hardens `ashmem` ’s own code, and it still plugs into the VFS through a C-style `file_operations` table which still sits in ordinary kernel memory.

So CFI bypass using `ashmem` is still effective even after Rust rewrite.

### Leak KASLR, as we still need it

Now the only problem is that we know many kernel addresses, but none of them is executable. The fake `fops` has to point at the real `configfs` handlers in executable memory, and the linear-map alias is not executable.

We already have our constrained arbitrary write from GhostLock, so we look for a more suitable address to overwrite, hopefully one that leaks KASLR, maybe by clobbering a length or a data pointer.

After a long search we landed on `/proc/sys/kernel/random/boot_id`. Its sysctl handler `proc_do_uuid` formats the 16 bytes at the table’s `.data` pointer as a UUID string.

So if we use the constrained write to repoint that `.data` at a slot the kernel already filled with a live kernel pointer, reading `boot_id` prints that pointer back as a UUID. Decoding it and subtracting its known image offset gives the KASLR slide. Here that slot is the netfilter `loggers[0][1]`, which holds `&nfulnl_logger`. The whole process is shown as follows:

![BootID KASLR leak overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6d5a6ffe8f5ca56f.svg)

![BootID KASLR leak overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a480895df249802b.svg)

> This is the same idea as the `sel_fs_type` name-pointer overwrite Project Zero read out through `/proc/self/mounts`, just via `boot_id` and `proc_do_uuid` instead.

### Final stage

Now that we have everything we need to replace `ashmem` ’s function table and get an arbitrary kernel memory read and write, it’s time to finish the first Android 17 root!

#### One step further

As [`STATIC_USERMODEHELPER`](https://nebusec.ai/research/ionstack-part-2/#static_usermode_helper) was enabled on Android, we need a few more steps instead of tricking `usermode_helper` into executing our backdoor directly as root.

Using a `pipe_buffer` (or a similar victim like a Page Table Entry) to read and write kernel memory is more convenient and has almost no checks. So we use KernelSnitch again to locate a `pipe_buffer`, then use the `configfs` write to overwrite the `pipe_buffer.page` and upgrade the read-write primitive to a fully arbitrary one.

> On our target, `VMEMMAP` is fixed, so we can perform virtual address to `struct page*` translation directly. Even where a device randomizes it, we can just scan all of nearby memory to recover everything we need, as a failed physical read-write will not panic the kernel.

#### Patch Cred

After we get unlimited read and write, we can walk the task list from `init_task` to the child we spawned and read its `cred`. Besides zeroing the `uid` / `gid` set (real, effective, saved, fs), we also clear `securebits`, set all five capability sets to `CAP_FULL`, and clear the task’s seccomp mode, filter, `TIF_SECCOMP`, and `no_new_privs`, so the root child breaks out of the app sandbox entirely.

#### SELinux bypass

After we locate the `task_security_struct` via `cred` ’s security pointer, we modify its SELinux `osid` and `sid` to the kernel `sid`. We also write `0` into `selinux_enforcing` directly through the physical read-write. This makes SELinux globally permissive, so a violating access is merely logged and allowed to proceed.

> `selinux_enforcing` is only writable when the kernel was built with `CONFIG_SECURITY_SELINUX_DEVELOP`. Otherwise the enforcing state is fixed at build time. Either way, our child can still escape seccomp and get root from the controlled `cred` struct.

## Appendix

The full exploit code can be found in our [open source security research project, CyberMeowfia](https://github.com/NebuSec/CyberMeowfia/tree/main/IonStack/CVE-2026-43499).

### Mitigations

Please check the [mitigation discussion section from our part II blog](https://nebusec.ai/research/ionstack-part-2/#mitigation).  
Note that the patch v1 has introduced CVE-2026-53166 (local DoS caused by NPD), which was fixed by [`40a25d59e85b`](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=40a25d59e85b).

#### RANDOMIZE_KSTACK_OFFSET

If [`CONFIG_RANDOMIZE_KSTACK_OFFSET_DEFAULT`](https://nebusec.ai/research/ionstack-part-2/#randomize_kstack_offset) is enabled on the target device, the exploit success rate will drop to 1/8 or less (if we can reclaim every possible stack frame and fill them with `rt_mutex_waiter`, otherwise less than ~1.5% in the worst case).

#### Kernel Integrity Check

Some vendors harden the kernel further to make the attack stay hard even after arbitrary kernel memory read and write. Samsung KNOX’s [Real-time Kernel Protection (RKP)](https://blog.longterm.io/samsung_rkp.html) runs a monitor at EL2 that keeps `cred`, `task_security_struct`, and the SELinux state read-only to the EL1 kernel. Its security hooks also check that the live `cred` and its `task_security_struct` sit in the protected slabs, so a `cred` forged in normal memory is rejected.

That said, it is not undefeatable once an attacker has unlimited arbitrary read and write. For example:

-   [BH USA 2023: bad io_uring](https://i.blackhat.com/BH-US-23/Presentations/US-23-Lin-bad_io_uring.pdf) forged a root `cred` with the matching back pointer and retagged its backing page’s `slab_cache` to `cred_jar_ro`.
-   [BH USA 2017: Defeating Samsung KNOX with Zero Privilege](https://blackhat.com/docs/us-17/thursday/us-17-Shen-Defeating-Samsung-KNOX-With-Zero-Privilege.pdf) called the hypervisor’s own credential update path `rkp_override_creds` to grant full capabilities and then trigger a legit UMH to have the kernel spawn a privileged process.
