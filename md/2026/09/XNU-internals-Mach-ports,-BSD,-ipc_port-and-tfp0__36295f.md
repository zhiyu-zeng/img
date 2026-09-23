---
title: "XNU internals: Mach ports, BSD, ipc_port and tfp0"
source: https://sigreturn.com/blog/xnu-under-the-hood/
source_host: sigreturn.com
clip_date: 2026-09-23T10:09:01+08:00
trace_id: dcdb1c3d-cde1-4a0d-b130-bd24841430f7
content_hash: 48060bd48114bf2df191b4b77d64d434ba18ff4f2e8c8eca62c566fe79899f3e
status: synced
tags:
  - iOS逆向
  - 内核
series: null
feed_source: Sigreturn Labs·Apple internals
ai_summary: XNU 是 Mach 与 BSD 混合内核，iOS 提权链的最终目标是用伪造的 task 控制端口（tfp0）换取用户态内核读写。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3e475244-d011-8168-ba38-f98b1c80f2ad
ioc:
  cves:
    - CVE-2019-6225
    - CVE-2019-8605
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> XNU 是 Mach 与 BSD 混合内核，iOS 提权链的最终目标是用伪造的 task 控制端口（tfp0）换取用户态内核读写。
> 
> - **端口即能力：** Mach 端口等价于文件描述符，名字是 `ipc_space` 表索引（`name>>8`）加代际；权限分 receive/send/send-once/dead-name，持有哪种权限决定能做什么。
> - **伪装内核 task：** 把 `io_bits` 设为 `IKOT_TASK_CONTROL`、`ip_kobject` 指向伪造的 `task`/`vm_map`，即可用 `mach_vm_read/write` 读写内核；iOS 14 起真内核 task 会触发 panic，arm64e 上指针有 PAC 签名。
> - **BSD 侧身份：** 进程同时是 `task` 与 `proc`；改写 `p_ucred` 的 `cr_uid` 得 root，改 `cr_label`（MACF/AMFI/sandbox）脱离沙箱；iOS 16 起 ucred 放入只读区。
> - **典型利用弧：** 内存安全漏洞 → 受控重分配 → 类型混淆成 kobject 端口 → 任意读写/tfp0 → 改凭证。
> - **2026 现状：** `kalloc_type` 按类型隔离堆并每次启动重随机，SPTM/TXM 接管页表与代码签名，A19 的 MIE 硬件标记让线性溢出直接崩溃；tfp0 只是硬仗起点。

[The previous post](https://sigreturn.com/blog/ios-chain-of-trust/) ended with the iPhone in a very specific state. The boot chain has verified and launched a kernelcache, and XNU, the kernel iOS and macOS share, is now running as the most privileged code on the application processor. That kernelcache is XNU plus every kext (kernel extension: a driver module) the device needs, prelinked into one image and loaded by iBoot.

Everything a process does to the kernel, and everything an exploit does to escalate, converges on one capability: a handle, held in userland, that reads and writes kernel memory. In iOS folklore that handle is called tfp0. Almost every iOS kernel exploit is the same arc toward it: a memory-safety bug, a controlled reallocation, a type confusion into a kernel object, kernel read/write, and a rewritten credential.

Note

Everything here is public: Apple’s open-source XNU, the Apple Platform Security documentation, and published research from Project Zero and others. It contains no exploit, private detail, or 0day.

## The Mach and BSD hybrid

XNU is a hybrid, and the word is doing real work. Its core is Mach, which owns inter-process communication, virtual memory, and scheduling. The other half is a BSD personality, which owns the POSIX (standard Unix) surface: processes, the syscall table, the filesystem layer, sockets, and credentials. IOKit, the C++ driver runtime covered in a later post, rounds it out. All of it is linked into a single image, the kernelcache, running in one privileged address space at EL1, the kernel’s privilege level.

The hybrid is a performance decision. A true microkernel would run BSD and IOKit as separate Mach servers reached by message passing; XNU co-locates them in kernel space and lets them call each other directly.

That decision has a consequence an attacker cares about. There is no internal privilege boundary between these subsystems below the guarded monitors Apple added later: the Page Protection Layer (PPL), then the Secure Page Table Monitor (SPTM), both discussed near the end. A memory-safety bug in a niche IOKit driver or a BSD socket option corrupts the *same* privileged address space that holds `ipc_port` objects and, before those monitors, the page tables, so a BSD bug regularly ends up as a Mach primitive.

If you come from Linux, start with two mappings. A Mach port is the exact analogue of a file descriptor. Both are a small integer, valid only inside one process, that indexes a per-process table in the kernel and names a kernel object you never touch directly. You read and write a file through an `int`; you talk to a service, a task, or a driver through a `mach_port_name_t`. And like a file descriptor, a port is transferable: you hand a port to another process inside a Mach message, the same way you hand a file descriptor to another process with `SCM_RIGHTS` over a Unix socket.

A Mach message is the analogue of writing to a socket or pipe, with one difference. It can carry port rights and out-of-line memory, not just bytes, so sending a message can transfer a capability. That is why the rest of iOS security is built on Mach IPC.

Both mappings are rows in a longer correspondence. Many concepts have a Mach half and a BSD half of the same underlying thing:

| Concept | Mach side | BSD side |
| --- | --- | --- |
| The process | `task` (address space, ports, threads) | `proc` (pid, credentials, file descriptors) |
| The thread of execution | `thread` (the schedulable entity) | `uthread` (syscall state) |
| The syscall table | `mach_trap_table` (negative numbers) | `sysent` (positive numbers) |
| The handle to a kernel object | **Mach port**: `mach_port_name_t` into `ipc_space` | **file descriptor**: `int` into `p_fd` |
| IPC | **Mach message** (`mach_msg`) | sockets, pipes, signals |
| Virtual memory | `vm_map`, `vm_object`, `pmap` (Mach owns it) | `mmap`, `mprotect` (BSD uses it) |
| The security model | **capabilities** (you can do what you hold) | **identity** (`kauth_cred_t`: uid, Mandatory Access Control label) |

A process is both a `task` and a `proc`, linked by a back-pointer, and a syscall from EL0, the unprivileged level where app code runs, lands in one of two dispatch tables depending on the sign of the syscall number.

## The Mach half

### Tasks and threads

A `task` is a container. It owns an address space (`vm_map`), a port namespace (`ipc_space`), a set of threads, and a handful of special ports it starts life with. A `thread` is the schedulable entity inside a task: it carries register state and its own control port. Both live in dedicated kernel zones (per-type allocator pools) and, on modern hardware, are increasingly kept in memory no other type can reuse, with their pointers signed.

For an attacker the `task` structure matters because it is the thing you eventually want to *forge*. A fake `task` you control, referenced by a port the kernel believes is a task control port, is a fake kernel task port.

### Ports and port rights

A Mach port is an object inside the kernel, a `struct ipc_port`. It is a message queue with an ownership and rights model attached. Userland never sees the object or its address. It sees only a *name*, a `mach_port_name_t`, a small integer valid inside the naming task. Everything a task is allowed to do it does by holding the right kind of port.

The authority is not the port, it is the *right* you hold to it. There are four kinds:

-   **receive**: unique, held by exactly one task, owns the message queue. Whoever holds the receive right *is* the service behind the port.
-   **send**: a copyable capability to enqueue messages onto that queue.
-   **send-once**: guarantees exactly one message, then is consumed. Reply ports use these.
-   **dead-name**: what a right becomes when its port dies.

The whole capability model is one sentence: *the right you hold decides what you are allowed to do.*

Most ports front a userland message queue. Some front a *kernel* object instead, and those are the ones that matter. Their `io_bits` field carries a **kobject type** from a fixed set (`IKOT_TASK_CONTROL`, `IKOT_THREAD_CONTROL`, `IKOT_HOST_PRIV`, `IKOT_IOKIT_CONNECT`), and `ip_kobject` points at the real kernel object: a `task`, a `thread`, an IOKit user client. `convert_port_to_task(port)` checks the kobject type in `io_bits`, dereferences `ip_kobject`, and hands back the `task`. That is what turns “I hold a port” into “I act on a kernel object.”

A task exercises all of its authority through ports. Its bootstrap port reaches launchd and, through it, other services. Its task self port lets it call the `mach_vm_*` family on its own address space. Its exception ports receive a thread’s state when it faults. Its host port answers unprivileged queries, and the separate host-priv port gates privileged host calls.

The one that matters most is a send right to an `IKOT_TASK_CONTROL` port whose `ip_kobject` is a `task` whose `vm_map` covers kernel memory. Hold that and you can call `mach_vm_read` and `mach_vm_write` against that memory. That single capability is kernel read/write from userland. It is tfp0. Since iOS 14 the kernel’s *own* task will not do: `convert_port_to_map_with_flavor` panics when the resolved map’s `pmap` is `kernel_pmap`, which is why a modern chain forges a fake `task` over a fake `vm_map` instead.

Make an `ipc_port` you control read back with `io_bits` set to `IKOT_TASK_CONTROL` and `ip_kobject` pointing at a `task` you also control, and you have a fake kernel task port even when the real one is out of reach. On arm64e devices (A12 and later) `ip_kobject` and the entry pointers are PAC-signed (Pointer Authentication: a cryptographic tag stored in a pointer’s unused high bits) with per-field discriminators, so you cannot copy a pointer in from elsewhere. That is a large part of why forging a port is hard today, and it is the subject of [the later post on pointer authentication](https://sigreturn.com/blog/pointer-authentication-arm64e/).

### ipc_space: a task’s table of capabilities

Ports are the objects. `ipc_space` is where a task keeps its *names* for them: the per-task table mapping the names userland sees to the real `ipc_port` objects. It hangs off the task as `itk_space`, and it is precisely the Mach counterpart of the file-descriptor table `p_fd`. Your authority as a task is the set of entries in your `ipc_space`.

The space holds `is_table`, an array of `struct ipc_entry`. A 32-bit port name splits into two parts:

-   an **index**, `MACH_PORT_INDEX(name) = name >> 8`, which slot in `is_table`,
-   a **generation**, `MACH_PORT_GEN(name) = (name & 0xff) << 24`, a counter used to detect stale names.

Each `ipc_entry` carries `ie_object`, a pointer to the `ipc_port` (PAC-signed on arm64e), and `ie_bits`, which packs the user-reference count in its low 16 bits (`IE_BITS_UREFS_MASK`, `0x0000ffff`), the right type just above them (`IE_BITS_TYPE_MASK`, `0x001f0000`), and the generation in its top bits (`IE_BITS_GEN_MASK`, `0xfc000000`). Resolving a name is therefore: look up `is_table[index]`, check the name’s generation against the one in `ie_bits`, check the right type, then dereference `ie_object`. Every Mach call that takes a port name walks this path, and with a kernel debugger, on a jailbroken device or in Corellium, you can walk the same chain live: task to space to table to entry to port.

When a slot is freed and later reused for a different port, its generation is bumped, so an old name that carried the old generation no longer validates. `ipc_entry_lookup()` returns `IE_NULL` on a generation mismatch and the caller turns that into `KERN_INVALID_NAME`, rather than silently aliasing the new port. Defeating that, by getting a name reused before the generation rolls over or by abusing a table-reallocation bug, is the classic **stale port name** primitive: an old name resolves to a *different* port than the one it named, which is capability-level type confusion.

And `is_table` is an ordinary kernel-heap object whose size and placement an attacker can influence by allocating ports. Corrupting an `ie_object` pointer means a name now resolves to an `ipc_port` you control, which is the fake task port again.

### Virtual memory, traps, zones, and messages

**Virtual memory.** Per task, a `vm_map` holds a sorted set of `vm_map_entry` ranges, each backed by a `vm_object` that owns physical pages, with `pmap` holding the hardware page tables. Two details recur in exploitation: `vm_map_copy`, the transient object that carries out-of-line message data, is a standard heap-spray and disclosure primitive, and `pmap` is what the page-table monitors (PPL, then SPTM) exist to protect.

**Mach traps** are the raw entry points, dispatched through `mach_trap_table` on *negated* syscall numbers from EL0. The ones an exploit drives constantly are the `_kernelrpc_*` port and memory calls (`mach_port_allocate`, `mach_port_insert_right`, `mach_port_mod_refs`, `mach_vm_allocate`) and `mach_msg2`, the modern consolidated message path. They are reachable from almost any sandbox, which is what makes them the core surface of nearly every escalation.

**Zones** are the allocator. `zalloc` slices pages into fixed-size elements of one kind, with dedicated zones for hot types such as `ipc ports`. This is where an exploit lines up its objects in memory.

**Messages** are what flows through ports. `mach_msg2` copies a user message into an `ipc_kmsg` and processes its typed descriptors, port-right transfers and out-of-line memory included. That descriptor handling is one of the densest bug surfaces in the kernel and where the interesting lifetime bugs live, and the dedicated IPC post takes it apart.

## The BSD half

The BSD side holds identity, and identity is what you eventually rewrite.

**Syscalls** dispatch through `sysent`, indexed by the positive syscall numbers, the BSD counterpart of the Mach trap table.

**`struct proc`** is the process from BSD’s point of view: `p_pid`, the file-descriptor table `p_fd`, a back-pointer to the `task`, and `p_ucred`, the pointer to its credentials (since the iOS 15 and macOS 12 line, reached through the read-only `proc_ro` structure rather than stored in `struct proc` itself).

**Credentials** are a `kauth_cred_t`, holding the familiar `cr_uid` and group set plus a field that matters more on iOS than the uid does: `cr_label`. That label is the slot for the Mandatory Access Control Framework (MACF), the kernel hook layer where AMFI (Apple Mobile File Integrity) and the sandbox attach their per-process policy, and the next two posts are about those two. Credentials are reference-counted and copy-on-write. The offensive use is direct: with kernel read/write, patching your process’s `p_ucred` to point at the kernel process’s credentials makes you root, and editing the MACF label takes you out of the sandbox and grants entitlements. That was the canonical thing an iOS kernel exploit did with its read/write through iOS 15. Since iOS 16 the credential is read-only memory, which changed the last step of every chain.

**VFS, sockets, and kauth** round out the surface, and they reach the same heap. The archetype is SockPuppet (Ned Williamson, CVE-2019-8605): a use-after-free in a BSD socket option, exploited entirely with Mach-port heap craft. A BSD bug turned into a Mach primitive.

## tfp0: the objective

`tfp0` is read “task-for-pid-zero.” `task_for_pid(pid)` is a Mach trap that returns a send right to that process’s task *control* port, and pid 0 is `kernproc`, the kernel’s own process, whose task is `kernel_task` and whose address space *is* kernel memory. So `task_for_pid(0)` once handed you arbitrary kernel read/write from userland, through ordinary, documented Mach APIs. That is where the name comes from.

tfp0 is a capability, not a technique. The bug and the work to exploit it are the technique; tfp0 is the result they produce, the stable kernel read/write primitive expressed as a Mach port.

The name has outlived the trap. On modern iOS `task_for_pid(0)` never returns the kernel task: the trap checks for pid 0 first and fails before it looks at credentials or entitlements at all. An exploit forges the port instead, exactly as the ports section described: same capability, obtained a different way. So when someone says a chain “gets tfp0,” they mean it reaches userland kernel read/write, not that it called a particular trap.

The APIs are ordinary. `mach_vm_read(task, addr, size, ...)` reads bytes from a task’s address space and `mach_vm_write(task, addr, data, ...)` writes them. These are the calls a debugger uses: lldb attaches to a process by taking its task port, then reads and writes the debuggee’s memory with exactly these functions. tfp0 is that mechanism pointed at a task whose address space is kernel memory. Everything comes from *which* task the port names, a task you were never supposed to be able to name.

Read and write are not interchangeable. A read primitive on its own is reconnaissance: it defeats KASLR (Kernel Address Space Layout Randomization, which shifts where the kernel is loaded) and locates the structures you care about, but it changes nothing. A write on its own is hard to aim: you need a leak, a target at a known offset, or a first write that manufactures the read you were missing. tfp0 is the objective because it packages both, arbitrarily and stably through `mach_vm_*`, rather than as a fragile one-shot you have to keep re-triggering. Turning a limited primitive into full read/write, upgrading a relative read or a single write-what-where into clean arbitrary access, is a craft of its own and the subject of a later post.

## The shape of a kernel exploit

Almost every iOS kernel exploit reads as the same pattern:

1.  a memory-safety bug gives limited control (an out-of-bounds write, a use-after-free, a refcount error);
2.  controlled reallocation reclaims the freed or adjacent memory with attacker bytes;
3.  that memory is type-confused into a kobject port or a disclosable `vm_map_copy`;
4.  which yields arbitrary read/write, a userland kernel task port, tfp0;
5.  which rewrites the process’s credentials and its MACF label, and the process is root and out of its sandbox.

Two historical bugs show the pattern cleanly. Brandon Azad’s voucher_swap (CVE-2019-6225) freed an `ipc_voucher` through a reference-counting error in MIG (the Mach Interface Generator, which auto-writes the code that unpacks Mach messages for kernel services), reallocated it as a port array, and used the dangling voucher to recover a send right to a fake port, and from there a fake task port. Ian Beer’s “task_t considered harmful” was a design-level capability confusion, where passing task ports across a privilege boundary let a caller confuse which task a kobject port referred to. Both end in the same place: a port that names a kernel object it should not.

## State in 2026

The abstractions above are stable; what changed is how hard they are to exploit.

Control ports such as the task self port are now *immovable* (they cannot be moved to another task) and *pinned* (they cannot be deallocated), so the old tricks that swapped or freed a task’s own control port fault instead. Reference counts moved to the hardened `os_refcnt` framework, which panics on overflow and on over-release rather than wrapping, closing the overflow-to-use-after-free class. `mach_port_guard` lets a holder bind a context to a port so unexpected operations fault.

The endgame moved too. Since the iOS 15 and macOS 12 line, `p_ucred` sits in the read-only `proc_ro` structure and `struct ucred` is allocated `ZC_READONLY`, through `zalloc_ro` rather than ordinary `zalloc`, so patching a credential is no longer a plain kernel write: it needs a gadget that goes through the read-only allocator’s own write path.

Bigger still: `kalloc_type` (iOS 15) segregates the heap by type signature, so a freed object can only be reclaimed by a type that lands in the same signature bucket, and the bucketing is re-randomized every boot. That breaks the generic “reallocate the freed slot as an `ipc_port` ” move that step 2 above relied on. On A15 and later hardware, from iOS 17 on, SPTM and TXM (the Trusted Execution Monitor) took page tables and code signing out of XNU entirely, so even a full kernel read/write can no longer rewrite page tables or forge a code-signing verdict. On A19, Memory Integrity Enforcement (always-on hardware memory tagging) makes many linear overflows and use-after-frees crash on the spot instead of corrupting anything. tfp0 is now the start of the hard part.

## Hands-on: reading the structures out of the kernelcache

The previous post pulled a kernelcache apart the long way, through the Image4 container. To just get one open in a disassembler, `ipsw` downloads and decompresses it in a single command, without fetching the whole IPSW firmware bundle:

```bash
ipsw download ipsw --device iPhone10,3 --version 15.0 --kernel
# writes a decompressed arm64 Mach-O under a build-named folder, e.g.
# 19A346__iPhone10,3/kernelcache.release.iPhone10,3_6

file 19A346__iPhone10,3/kernelcache.release.iPhone10,3_6
# Mach-O 64-bit executable arm64
```

iPhone10,3 is an A11, so this image is plain `arm64`, not `arm64e`, and the pointer fields you will see are not PAC-signed. That is what you want for a first read: the raw layout, without the signing A12 and later add on top.

Open the file in a disassembler with arm64 support: Hopper, Ghidra, or IDA Pro on macOS. IDA Home works as well, but it licenses one processor family at a time, so you need the ARM edition, and it ships without the decompiler. Point it at the whole kernelcache, kernel plus all kexts, and let the analysis finish.

A release kernelcache carries almost no symbol names, so recover them first. `ipsw kernel sym`, paired with blacktop’s `symbolicator` signatures, rebuilds most of them and writes a JSON you apply with the matching script for Ghidra, IDA Pro, or Binary Ninja. IDA users can additionally run `ida_kernelcache`, the maintained cellebrite-labs fork of Azad’s original, to rebuild the C++ vtables and `OSMetaClass` hierarchies.

Work through four things:

**1\. The syscall tables.** `mach_trap_table` and `sysent` both sit at the front of the kernel. `ipsw` dumps the BSD one in full, each entry with its number, handler, argument count, and C prototype:

```bash
ipsw kernel syscall kernelcache.release.iPhone10,3_6
```

![The BSD syscall table (sysent) dumped by ipsw: each entry's number, handler address, argument count, and prototype](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e57f3ec2a2656245.png)

In the disassembler `mach_trap_table` sits at its symbol as a raw array of `{ argument count, handler pointer }` entries.

**2\. Port to kernel object.** Decompile any member of the `convert_port_to_*` family; `convert_port_to_map_with_flavor` is a clean one. Its own body is the tail of the bridge, since the port-to-task translation and the kobject type check sit in the callee it opens with: it takes the task behind the port, checks the task is still active, walks to `task->map`, and compares `map->pmap` against `kernel_pmap`. When that comparison hits it panics with `userspace has access to a kernel map ... through task`. That is the iOS 14 check from the ports section, in the binary.

![convert\_port\_to\_map\_with\_flavor decompiled in Ghidra: it resolves the task behind the port, checks the task is active, walks to task->map, compares map->pmap against kernel\_pmap, and panics when they match](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e781a06ff33fb094.png)

**3\. The name lookup.** Decompile `ipc_right_lookup_read`, which resolves a port name for a read. The `ipc_space` walk is right there in the decompilation: `param_2 >> 8` for the table index, `* 0x18` to scale it by the `ipc_entry` size, then `ie_object` at offset 0 and `ie_bits` at `+ 8`.

![ipc\_right\_lookup\_read decompiled in Ghidra: the port name shifted right by 8 for the table index, scaled by the ipc\_entry size, resolving to the entry's ie\_object and ie\_bits](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ebccb07ef303d2f1.png)

**4\. Where identity lives.** The last piece is the write target. `struct proc` holds `p_ucred`, and the `kauth_cred_*` accessors that symbolication turns up read the very `cr_uid` and `cr_label` fields a chain overwrites at the end: patch `p_ucred` to a privileged cred and the process is root and out of its sandbox. On this iOS 15 image that is a plain kernel write; from iOS 16 the same fields sit in read-only zones.

## Where this leaves us

XNU is a Mach and BSD hybrid in one address space; authority is held as ports and named through `ipc_space`; and the objective every escalation shares is a single capability, tfp0, a userland handle to kernel read/write that you obtain today by forging the kernel task port rather than by asking for it.

That capability is only interesting because of what it is allowed to overwrite, and the next posts are about what sets those limits. The MACF label we just met inside `p_ucred` is where [the following article](https://sigreturn.com/blog/ios-code-signing-pipeline/) starts: the framework that decides, at every `exec`, what is even allowed to run, and how AMFI, code signing, and trust caches hang off it.

## Notes and sources

Everything here is drawn from open source, vendor documentation, and published research.

-   Apple’s open-source [XNU](https://github.com/apple-oss-distributions/xnu) is ground truth for every structure and macro named above: `osfmk/ipc/ipc_port.h`, `ipc_object.h`, `ipc_entry.h`, `osfmk/mach/port.h` (`MACH_PORT_INDEX` and `MACH_PORT_GEN`), `osfmk/kern/syscall_sw.c` (the trap table), `osfmk/kern/ipc_tt.c` (the `convert_port_to_*` helpers), `osfmk/kern/ipc_kobject.c` (the manual PAC of `ip_kobject`), and `osfmk/kern/kalloc.c` / `zalloc.c`.
-   Jonathan Levin, *\*OS Internals, Volume II: Kernel Mode* ([newosxbook.com](https://newosxbook.com/index.php)), is the reference for the Mach and BSD structures, trap tables, and zone allocator.
-   Brandon Azad, [“voucher_swap: Exploiting MIG reference counting in iOS 12”](https://projectzero.google/2019/01/voucherswap-exploiting-mig-reference.html) (Project Zero, CVE-2019-6225), and [“A survey of recent iOS kernel exploits”](https://projectzero.google/2020/06/a-survey-of-recent-ios-kernel-exploits.html) map the port and zone primitives named here.
-   Ian Beer, [“task_t considered harmful”](https://projectzero.google/2016/10/taskt-considered-harmful.html) (Project Zero), is the capability-confusion case study, and the `mach_portal` / `async_wake` writeups established the port-spray playbook.
-   Apple Security Research, [“Towards the next generation of XNU memory safety: kalloc_type”](https://security.apple.com/blog/towards-the-next-generation-of-xnu-memory-safety/), for the heap-segregation change that reshaped step 2 of the exploit arc.
