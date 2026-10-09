---
title: Android IncFS verity-signature race — and what Google ASR "Won't Fix (Infeasible)" actually means | SixSixSix
source: https://trexnegro.github.io/posts/android-incfs-verity-signature-race-google-asr-infeasible/
source_host: trexnegro.github.io
clip_date: 2026-10-09T10:26:54+08:00
trace_id: e60835aa-24ab-46fa-8f67-2ba8ca0205ba
content_hash: 556c1c78d56d7f220b6c189779bbf6457ecf1ad40dde75fa829934ca4a219748
status: synced
tags:
  - 漏洞分析
  - 内核
series: null
feed_source: SixSixSix·Android内核漏洞
ai_summary: "**TL;DR：** Android IncFS 读取 verity 签名时误用函数内 `static` 指针，造成跨进程信息泄露、UAF 与 slab 双重释放；Google 以“Won't Fix (Infeasible)”结案。"
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-81e4-8460-dadc1fd1d069
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> **TL;DR：** Android IncFS 读取 verity 签名时误用函数内 `static` 指针，造成跨进程信息泄露、UAF 与 slab 双重释放；Google 以“Won't Fix (Infeasible)”结案。
> 
> - **根因与修复：** `fs/incfs/verity.c` 中 `static u8 *signature;` 使指针落入 BSS 全局槽，多线程共享；去掉 `static` 即修复，行为不变。
> - **竞态后果链：** 同一套交错操作同时产出跨进程信息泄露（读到他人签名字节）、UAF 读、KASAN `kmalloc-256` 双重释放（20/20 必现）。
> - **KASLR 与硬化绕过：** 泄露样本 `ffff8881_03806a00` 属 slab 线性映射，直接击穿 KASLR；关掉 KASAN、开启 SLUB 随机化与 freelist 加固的发行配置下仍出现 18 次 `BUG at mm/slub.c` 与 6 次 GPF，`0xCC` 哨兵字节可观察。
> - **可达性与影响面：** 触发 ioctl 由 AOSP 原生 sepolicy 授予 `priv_app`（含 Play Store），且被 `FS_IOC_ENABLE_VERITY` 与 `FS_IOC_READ_VERITY_METADATA` 完全可控。
> - **披露结局：** 2026-05-09 提交 Android VRP，2026-06-15 关闭为 Infeasible；理由是未在公开实验环境打通到 `uid=0` 端到端链路，作者选择公开文章、请求 CVE 并放出复现仓库。
> - **防御检测点：** 跨任务对同一地址重复 `kfree`、返回缓冲区与文件实际签名不一致、`kmalloc-256` 页中出现带 `0xCC` 哨兵的 freelist 指针。

> **TL;DR**— A single-character bug in `fs/incfs/verity.c` (`static u8 *signature;` should be `u8 *signature;`) produces, in order: a KASAN double-free in `kmalloc-256`, a cross-process information leak reaching `priv_app`, a kernel-pointer disclosure that breaks slab-region KASLR, and SLUB freelist corruption with attacker-controlled bytes on a kernel with all stock Android allocator hardening turned on. The fix is dropping the `static` qualifier. Submitted to Google Android & Devices VRP on 2026-05-09; closed as **Won’t Fix (Infeasible)** on 2026-06-15. Reproducer at [`TREXNEGRO/Research/android-incfs-verity-signature-race`](https://github.com/TREXNEGRO/Research/tree/master/android-incfs-verity-signature-race). The rest of this post walks the bug from first principles, explains each runtime primitive in plain language, and then unpacks what Google’s “Infeasible” verdict actually communicates about the economics of modern vulnerability reward programs.

## Why this post exists

Three reasons.

**First**, the bug is a clean instance of a small bug class that’s been hiding in plain sight in mainline-derived kernels for years: a function-local `static` pointer used as scratch storage for a heap-allocated buffer. Removing the qualifier is the entire fix, but the dispatching of consequences if you leave it in place stretches all the way from a cross-process privacy boundary crossing to an attacker-controlled freelist next-pointer on a fully-hardened kernel. I want a stable URL to point at the next time the same shape shows up.

**Second**, this is a teaching example. The bug is small enough to fit on one screen, but the runtime impact touches half a dozen different security mechanisms that defenders and exploit writers think about every day: the C language’s `static` semantics, Linux slab allocator design, SLUB freelist hardening, KASLR, and the way the Android sepolicy reachability model expands what counts as “local”. If you came up through web or appsec and your mental model of “kernel race condition” is hazy, this post is structured to make that model concrete without requiring you to have read the Linux memory management book first.

**Third**, the vendor verdict is the more interesting half of the story. Google ASR closed the report on 2026-06-15 as **Won’t Fix (Infeasible)**— the canonical phrasing they reserve for bugs whose end-to-end exploitability the reporter has not closed in the open lab. The triager’s note reads:

> *“We have logged this issue for potential remediation in a future version. At this time, this report is considered closed and will no longer be monitored.”*

That’s a real disclosure outcome that researchers running similar pipelines should know how to read. The bug, as the reporter documented and the triager presumably read, runtime-produces a KASAN double-free deterministically, an info leak that crosses the sepolicy boundary into `priv_app`, a kernel pointer disclosure, and allocator metadata corruption with attacker-controlled bytes on stock hardening. The triager looked at that and concluded “not a security vulnerability”. I think the verdict is wrong, but I think the reason it’s wrong matters more than the verdict, and the last sections of this post walk through both.

## Setting — what you need to know before reading the bug

This bug lives at the intersection of several systems that security folks across different specialties don’t always have a shared vocabulary for. Before the C code shows up, here is the minimum the rest of the post assumes you know. Skim freely if you already know any of these pieces.

### How Android keeps apps from reading each other’s data

Every Android app runs as its own Linux UID inside its own sandbox, plus a SELinux-derived label called a **sepolicy domain**. Android’s main domains relevant to this post are:

-   `untrusted_app` — third-party apps installed from the Play Store or sideloaded. The bulk of what users install. Least privilege.
-   `priv_app` — privileged apps that ship in the system image or are otherwise pre-installed with elevated reach. Notably this domain includes the Google Play Store itself (`Phonesky` / `com.android.vending`), `DataLoaderService` consumers, and several Google-shipped service apps.
-   `system_server` — the always-running Android system process that owns most platform services (Activity Manager, Package Manager, etc.).
-   `vendor_init`, `init`, `kernel` and others — the platform layer.

The Android team writes one big policy file (`system/sepolicy/`) that defines, for every domain, what kernel syscalls / files / ioctls it is allowed to touch. A kernel bug is only practically reachable from userspace if some domain can issue the syscall that triggers it. That is what we mean when we say “the bug is reachable from `priv_app` ”: stock AOSP sepolicy explicitly grants `priv_app` permission to issue the ioctl that hits this code path.

A bug reachable from `priv_app` is more interesting than a bug reachable from `untrusted_app` (because most attackers do not run code in `priv_app` directly), but it is far more interesting than a bug reachable only from `system_server` (because compromising a single privileged app is a meaningfully more common starting position in real exploit chains than compromising the system process directly). On any modern Android device, `priv_app` includes the app store, which is the canonical “I am a malicious privileged app” attacker model.

### What IncFS is and why it touches every modern Android device

IncFS — short for **Incremental FileSystem**— is an Android-specific filesystem in the Android Common Kernel tree (`fs/incfs/`). It does not ship in mainline Linux; you only see it on Android devices.

The reason it exists is mechanical: APKs and game data have grown to multiple gigabytes, and a user who taps “install” on a 4 GB title does not want to wait for all 4 GB to arrive before the title is launchable. IncFS lets the package installer hand the kernel a **Merkle tree manifest**— a hash structure that describes the full file the app will eventually contain — and then start serving file blocks before all of them have been downloaded. When the app reads a block that hasn’t arrived yet, the IncFS layer blocks the read, asks userspace for that specific block, verifies its hash against the manifest, and returns it. From the app’s point of view, the file looks fully-present.

On Android 14, 15, and 16, IncFS is the active code-loading path for any app installed via the modern installer. That means: every APK you run on a recent Android device goes through this filesystem on the kernel side. Bugs in IncFS handlers are, by reachability, bugs against the Android user base at large.

### What fs-verity adds, and why the signature blob matters

Sitting on top of IncFS (and several other filesystems in mainline Linux) is **fs-verity**, a kernel feature that enforces read-time integrity of a file against its precomputed Merkle tree. Once you “enable verity” on a file, every read returns either the original bytes that the manifest hashes promised, or an I/O error. This is the same technology that backs Android APK Signature Scheme v4 and the `ApplicationLoader.openInputStream(verified=true)` path on the Java side.

When verity is enabled, the file can also carry an optional **verity signature blob**— an opaque byte string attached to the file as metadata. The intended use is for the app installer to store the digital signature that ties the manifest to a release key, so that anyone reading back the metadata later can verify the file was installed from a known good source.

Two facts about the signature blob matter for this post:

1.  **IncFS does not validate the blob against any keyring**. The handler at `fs/incfs/verity.c:526-534` (`incfs_enable_verity()`) calls `memdup_user()` on the bytes provided by userspace and stores them as-is. Whatever userspace hands the kernel becomes the stored signature for that file, with full userspace control over both size and contents. (The fs-verity layer in mainline does validate the signature against a kernel keyring if one is configured, but IncFS bypasses that.)
2.  **The blob is readable via a public ioctl**, namely `FS_IOC_READ_VERITY_METADATA` with `metadata_type = FS_VERITY_METADATA_TYPE_SIGNATURE`. AOSP stock sepolicy grants this ioctl to `system_server` and `priv_app` on verity-enabled IncFS files.

The combined attack-model consequence: a malicious privileged app (or, more realistically, an attacker who has compromised a privileged app via some other route) can install its own arbitrary signature blob on its own IncFS-backed files via `FS_IOC_ENABLE_VERITY`, then read those blobs back via `FS_IOC_READ_VERITY_METADATA` — with full control over both sides. The trigger we are about to look at is exactly that read-back path.

### A C refresher — what static does inside a function

The C language has a small number of confusing keywords. `static` inside a function body is one of them. Specifically:

```c
void f(void) {
    int x = 0;     // automatic storage. New copy of x on every call.
                   // Lives on the stack of this invocation. Dies when
                   // the function returns.
    static int y;  // static storage duration. One single x86_64
                   // 4-byte slot for the whole running program. Lives
                   // from program load until program exit. Shared by
                   // every invocation of f() from every thread.
}
```

If you write `static int y;` inside a function, the compiler allocates **one slot** for it in the program’s BSS (the zero-initialised data segment). Every call to that function reads and writes that same slot. The C standard does not guarantee that this slot is thread-safe; it is just shared global storage with a narrower scope name.

In normal application code, you reach for `static` inside a function for things like caches (a one-time initialised lookup table you don’t want to rebuild on every call). It’s a code smell when applied to a pointer that holds the address of a freshly allocated buffer, because the natural lifetime of “freshly allocated buffer” is the call duration, and the storage that makes sense for it is the stack.

This is the entire bug: the kernel maintainer wrote `static u8 *signature;` where what they meant was `u8 *signature;`. The compiler did exactly what the C standard asks of it. The result is a single global slot for what should have been a stack-local pointer.

### A Linux kernel refresher — heap, slabs, BSS, hardening

Last piece of setting. The Linux kernel allocates memory in several distinct ways:

-   **Stack**— fixed-size, per-task. The kernel stack is small (16 KB on most arches) and private to whichever process is currently running on that CPU.
-   **Heap (slab caches)**— variable-size, shared across all tasks. The kernel’s heap is divided into per-size **slab caches** (`kmalloc-32`, `kmalloc-64`, `kmalloc-128`, `kmalloc-256`, etc.). When you call `kmalloc(N, GFP_KERNEL)`, the allocator returns a chunk from the smallest cache that fits. `kmalloc-256` holds objects of size 128..256 bytes.
-   **BSS**— fixed-size global storage. Symbols declared at file or function-scope with the `static` qualifier (and `extern` globals) live here. One slot per symbol, zero-initialised at module load, never freed.

The slab allocator on modern Linux is called **SLUB**, and it stores its free-list bookkeeping **inside the freed objects themselves**. When you `kfree(p)`, SLUB writes a “next pointer” into the first 8 bytes of the freed object, pointing at the previous head of that cache’s free list. When you next `kmalloc()` from the same cache, SLUB reads that next pointer back, returns the object, and updates its head to the next-next pointer. This is fast and cache-friendly.

Because in-band freelist storage is also an obvious target for heap-corruption exploits, recent kernels include hardening options that try to make it harder:

-   `CONFIG_SLAB_FREELIST_RANDOM=y` — randomises the order in which freshly-allocated slabs hand out their objects, so the attacker cannot rely on a deterministic allocation order.
-   `CONFIG_SLAB_FREELIST_HARDENED=y` — XORs the freelist next pointer with a per-cache random “cookie” before storing it. An attacker who writes raw bytes into a freed object’s first 8 bytes therefore does not get those bytes used directly as a pointer; they get those bytes XOR’d with the cookie. If the attacker doesn’t know the cookie, the XOR turns whatever they wrote into a non-canonical address that the CPU faults on.

These two hardenings are on by default on stock Android kernels. They make the freelist-corruption primitive harder to weaponise than it was on, say, a 2015-era Linux kernel — but, as we’ll see, they don’t make it impossible. They make it a per-build problem.

`CONFIG_RANDOMIZE_BASE=y` — usually shortened to KASLR — is the hardening that randomises the base address of the kernel image at boot, so an attacker doesn’t know where particular kernel functions live. We’ll come back to KASLR when we get to the information leak.

## The bug

Now the code. From `fs/incfs/verity.c` in the `android-common-15-6.6` branch at commit `a47b8d1a47`, line 773:

```c
static int incfs_read_signature(struct file *filp,
                                void __user *buf, u64 offset, int length)
{
        size_t sig_size;
        static u8 *signature;     /* <-- THE BUG */
        int err;

        signature = incfs_get_verity_signature(filp, &sig_size);
        if (IS_ERR(signature)) return PTR_ERR(signature);
        if (!signature)        return -ENODATA;

        length = min_t(u64, length, sig_size);
        err = copy_to_user(buf, signature, length);
        kfree(signature);
        return err ? err : length;
}
```

The `static` on line 4 of the body is the entirety of the bug.

What the function is meant to do: when userspace asks for the verity signature of a file (via `FS_IOC_READ_VERITY_METADATA` with the right type), allocate a kernel buffer with the file’s stored signature bytes, copy them out to the caller’s userspace buffer, free the kernel buffer, return the byte count.

What the function actually does: same thing, except the working pointer `signature` lives in a single BSS slot shared across the entire running kernel. Every invocation of `incfs_read_signature()` from every thread on the system reads and writes that same slot.

How do we know it’s in BSS? We compile it and look:

```
$ nm fs/incfs/verity.o | grep signature
0000000000000000 b signature.0
```

`b` = uninitialised symbol in `.bss`. The `signature.0` mangled name is what GCC emits for function-local `static` variables. Every concurrent thread that calls this function references the same `signature.0` slot.

### Why the compiler can’t save us

A reasonable reading of the source code might be: “OK, `signature` is technically global, but the function only uses it across a short region. Surely the compiler keeps the pointer in a register across `kzalloc()` → `copy_to_user()` → `kfree()`, so the BSS slot doesn’t actually participate in the race?”

It cannot. `copy_to_user()` is defined in a different translation unit (`mm/maccess.c`). From the compiler’s point of view, it is an external function that can do anything to global memory, including modifying `signature`. The C abstract machine forces the compiler to reload `signature` from the BSS slot on each subsequent use after the call. The assembly listing for this function on x86_64 confirms exactly that: there’s a memory load of the BSS symbol before the `kfree` call.

That reload is the window. Between the assignment that fills the slot with thread A’s allocation and the `copy_to_user` / `kfree` that read it back, thread B’s invocation can run on another CPU and overwrite the slot.

### The race choreography

```
Thread A                                Thread B
────────                                ────────
signature = kzalloc(...) → ptr_A
[BSS slot := ptr_A]
                                        signature = kzalloc(...) → ptr_B
                                        [BSS slot := ptr_B]
copy_to_user(buf_A, [slot=ptr_B], lenA)
                ↑
                Thread A returns Thread B's allocation contents
                to Thread A's userspace buffer — cross-process info leak.
kfree([slot=ptr_B])
                ↑
                Thread A frees Thread B's allocation.
                                        copy_to_user(buf_B, [slot=ptr_B-FREED], lenB)
                                                                ↑
                                                                Thread B reads
                                                                from freed memory
                                                                — UAF read.
                                        kfree([slot=ptr_B-FREED])
                                                                ↑
                                                                Double-free.
```

The race produces, in a single set of crossing operations:

1.  A **cross-process information leak**: thread A’s userspace buffer receives the signature bytes that thread B allocated. Different process, different file, different domain.
2.  A **use-after-free read**: thread B’s `copy_to_user` runs after thread A’s `kfree`, dereferencing a freed slab object.
3.  A **slab double-free**: both threads free the same allocation in sequence.

Each of these is a security primitive on its own. The next section unpacks each one.

## The patch

The fix is one character: drop the `static` qualifier so the pointer becomes a normal automatic local that lives on the function’s stack frame:

```cpp
diff --git a/fs/incfs/verity.c b/fs/incfs/verity.c
@@ -770,7 +770,7 @@ static int incfs_read_signature(struct file *filp,
                                void __user *buf, u64 offset, int length)
 {
        size_t sig_size;
-       static u8 *signature;
+       u8 *signature;
        int err;
```

Why this works: each concurrent invocation now has its own stack-local `signature`, in its own per-task kernel stack. There is no shared global slot left to race on. Single-threaded behaviour is identical, because the function never needed the “persists across calls” semantics that `static` provides — it only used the variable within one call.

`scripts/checkpatch.pl --strict` reports zero errors.

On a kernel built with the patch applied, running the same workload that produces 2,976 cross-process leak events per 2.56 million iterations of the racing ioctl on the vulnerable build produces **0 leak events per 1.28 million iterations**. The fix closes the race window entirely.

The signed-off-by patch lives in [`patch/0001-incfs-drop-misuse-of-static-local.patch`](https://github.com/TREXNEGRO/Research/blob/master/android-incfs-verity-signature-race/patch/0001-incfs-drop-misuse-of-static-local.patch) in the reproducer repository.

## Reading the runtime evidence

The reproducer’s `run.sh` builds four kernel images, two PoC binaries, and a busybox initramfs, then drives QEMU through 20 runs of each workload variant. Below I walk through what each runtime signal means and why it’s interesting, then I show the raw evidence.

### What’s a KASAN double-free, and why is one worth caring about?

**KASAN** (the Kernel Address SANitiser) is to the Linux kernel what AddressSanitizer is to userspace C code. When you build the kernel with `CONFIG_KASAN=y`, every allocation grows a “shadow memory” region that tracks the access state (allocated / freed / redzone) of every byte. Every memory access the kernel performs is instrumented to check the shadow before reading or writing. KASAN catches use-after-free, double-free, out-of-bounds read/write, and a handful of other categories deterministically: when the bug fires, KASAN prints a stack trace and reports the class.

A double-free in particular is a serious bug class. It means the kernel has a corrupted notion of which objects are in-use. The SLUB allocator’s freelist invariants assume each object is freed at most once between allocations; violating that assumption can put the freelist into a state where two distinct callers each believe they own the same memory. Real-world exploits use double-frees as a stepping stone to type confusion: free an object whose vtable points at a controlled function, allocate something else into the same slot, and now the next caller that expects the original object’s behaviour calls into the wrong function.

On the vulnerable Android kernel, the v1 PoC (8 threads, 200 iterations per thread, 1,600 ioctl calls total) reproduces a KASAN double-free on **every single run**. Twenty out of twenty in the reliability suite. The faulting object is in `kmalloc-256` — exactly the size class of the verity-signature allocation (`kzalloc(vs->size, GFP_KERNEL)` with `vs->size = 256` in the PoC):

```
BUG: KASAN: double-free in __kmem_cache_free+0x175/0x2c0
Free of addr ffff8881036bdc00 by task poc-incfs-04/84
Call Trace:
 <TASK>
 ____kasan_slab_free+0x165/0x180
 kfree+0x6f/0xe0
 incfs_ioctl_read_verity_metadata+0x5b3/0x8f0
 dispatch_ioctl+0x3bd/0x1210
 __x64_sys_ioctl+0x13d/0x1b0
 ...
The buggy address belongs to the object at ffff8881036bdc00
 which belongs to the cache kmalloc-256 of size 256
```

KASAN is not a contrived instrumentation here — it is the instrumentation Google itself uses to ship fuzzer-found kernel bugs to syzbot, the public continuous-fuzzing dashboard. A deterministic KASAN double-free reachable from `priv_app` is the kind of thing Android’s published severity matrix tags as **High** when its sister entries appear elsewhere in the tree.

### Cross-process information leak — and why it’s an Android privacy boundary crossing

The v3-stress PoC scales the experiment up. Four unrelated processes, each mounting its own IncFS instance and enabling verity on its own file. Each process fills its own signature with a per-process marker byte: process A uses `0x41`, process B uses `0x42`, process C uses `0x43`, process D uses `0x44`. Each process spawns four worker threads, and each thread loops the racing ioctl 8,000 times.

Crucially, each thread fills its userspace receive buffer with `0x55` *before* every ioctl. After the ioctl returns, the thread scans the first 32 bytes of the returned buffer for any byte that differs from its own marker. Any non-matching byte is recorded as a “leak event”: the thread has just received data that does not belong to its own file.

Across 20 vulnerable runs of the v3 stress suite (8,000 iterations × 4 threads × 4 processes per run = 128,000 ioctl calls per run): **2,976 leak events / 2,560,000 iterations, 100% of runs produce ≥ 1 event**. On the patched kernel running the same workload: **0 leak events / 1,280,000 iterations**.

The leaks aren’t subtle. Worker A returns Worker B’s `0x42` marker bytes to its own buffer. Worker D returns Worker C’s `0x43` bytes. The races resolve in any cross-process direction. Sample dmesg slice from a single 32-second run:

```yaml
[A] thread 0 FIRST LEAK at iter 312,  sample: 41 41 41 41 41 41 41 41
[B] thread 0 FIRST LEAK at iter 1309, sample: 42 42 42 42 42 42 42 42
[C] thread 0 FIRST LEAK at iter 150,  sample: 00 6a 80 03 81 88 ff ff
[D] thread 0 FIRST LEAK at iter 1855, sample: 44 44 44 44 44 44 44 44
=== STRESS DONE ===
workers reporting >0 leaks: 4 / 4
```

(Yes, worker A leaks data into its own buffer with the byte `0x41`. The marker bytes match the worker that wrote the *signature*, not the worker that received the buffer; what the sample shows is that worker A’s buffer was written with worker A’s own signature, which is the inverse of what should happen. A worker’s own marker byte appearing in *some other* worker’s buffer is the actual cross-process leak. The v3 PoC logs every mismatch against the receiving worker’s marker.)

**Why this matters on Android specifically.** The bug is reachable from `priv_app`. The leaked bytes are the signature of a file that belongs to a different process — typically a different sepolicy domain. A signature attached to a system app’s verity-enabled file may not itself be a secret, but the bug demonstrates that the IncFS layer has no notion of per-process / per-domain isolation for this metadata. Combined with the kernel-pointer disclosure below, the leak channel becomes the carrier wave for the more serious exploit primitive.

### Kernel pointer disclosure — KASLR explained

Here is one of the leak samples again, the one from worker C:

```
[C] thread 0 FIRST LEAK at iter 150,
    sample: 00 6a 80 03 81 88 ff ff
```

Worker C’s marker byte is `0x43`. The bytes returned are `00 6a 80 03 81 88 ff ff`. Decoded as a little-endian 64-bit integer, that is `0xffff8881_03806a00`.

That value is a **canonical x86_64 kernel address** in the slab linear-mapped region. The Linux kernel divides its virtual address space into several giant regions, and the `0xffff8881_...` prefix is the kernel’s “slab linear map” — the single contiguous range where all of physical memory is mapped into kernel virtual space for direct access. Every kernel object that lives in a slab cache has an address in that range.

The most natural explanation for this particular byte sequence is that the racing `copy_to_user` is reading from a freed `kmalloc-256` object whose first 8 bytes have already been populated by the SLUB allocator with a **freelist next pointer** for that slab cache. SLUB stores those next-pointers in-band, so the first 8 bytes of a freed object are a kernel pointer at any moment between `kfree` and the next allocation from that cache.

Why does a kernel pointer in a userspace-readable buffer matter?

**KASLR**— Kernel Address Space Layout Randomisation — randomises the base address of the kernel image at every boot. The intent is that an exploit which needs to know the address of some specific kernel function or data structure (for instance, a function pointer to overwrite, or the address of the kernel’s credentials structure to corrupt) cannot just hardcode that address; it has to leak it at runtime.

KASLR is a probabilistic mitigation. On x86_64 the entropy of the kernel base randomisation is around 9–10 bits. That means a random guess at the kernel base address has roughly a 1-in-1000 chance of being correct. Real exploits don’t guess; they read.

A leak of any pointer inside the slab linear-mapped region collapses one of the KASLR randomisations entirely: it tells the attacker the base of the slab region. Combined with knowledge of which slab cache an object belongs to (which is encoded by the size of the allocation, observable via the leaked allocation behaviour), the attacker can locate slab-resident kernel objects at known offsets from that leaked pointer.

The IncFS verity-signature race leaks one of these pointers as a side effect of the cross-process info leak. The attacker doesn’t have to write an exploit specifically to break KASLR — the same ioctl that does the cross-process leak occasionally returns a pointer instead of a signature byte.

### SLUB freelist corruption with attacker-controlled bytes

Now the heavier primitive — the one that makes this bug an LPE candidate rather than just an info-leak / DoS.

There’s a separate PoC variant (v5) that runs on a kernel built with **`CONFIG_KASAN` off** and all the stock Android allocator hardenings on:

-   `CONFIG_SLAB_FREELIST_HARDENED=y`
-   `CONFIG_SLAB_FREELIST_RANDOM=y`
-   `CONFIG_RANDOMIZE_BASE=y`

This is the configuration a real Pixel image ships with. KASAN is a debug build — production never ships with it on. The whole point of the v5 experiment is to show that the bug survives the allocator hardening that production uses.

A single workload run of v5 produced **18 `kernel BUG at mm/slub.c:433` + 6 general protection faults**, all rooted in `incfs_ioctl_read_verity_metadata`. Representative GPF:

```yaml
general protection fault, probably for non-canonical address
        0xcc73cdddc8d9e7d: 0000 [#1] PREEMPT SMP NOPTI
RIP: 0010:__kmem_cache_alloc_node+0xf4/0x180
Call Trace:
 <TASK>
 __kmem_cache_alloc_node+0xf4/0x180
 __kmalloc+0x59/0x140
 load_msg+0x44/0x140
 do_msgsnd+0x123/0x460
 __x64_sys_msgsnd+0x4d/0x70
 ...
```

The leading `0xcc` byte in the faulting address is the PoC’s `0xCC` **spray sentinel**. The PoC sprays `0xCC` bytes into freed `kmalloc-256` slots — it does this by sending a controlled-size System V message via `msgsnd()`, which causes the kernel to `kmalloc` a `kmalloc-256` -sized buffer to hold the message and `memcpy` the attacker’s payload into it. When the kernel later pops the corrupted slot off the freelist for re-use, it reads the first 8 bytes of the freed slot as the freelist next-pointer, XORs it against the per-cache `SLAB_FREELIST_HARDENED` cookie inside `freelist_ptr_decode`, gets a non-canonical address (because the cookie alone doesn’t turn `0xCC...0xCC` into a canonical 47-bit address), and faults.

The leading `0xcc` survives the cookie XOR. That is the runtime indicator that the kernel was reading attacker-controlled bytes as freelist metadata. The hardening cookie did not prevent the corruption — it just changed the symptom from “kernel jumps to attacker-chosen address and probably gains root” to “kernel faults at a non-canonical address and panics, but the attacker’s bytes are observable in the panic”.

That is the textbook upstream half of every modern Linux LPE chain.

### What an attacker actually does with these primitives — the LPE chain anatomy

The runtime evidence above gives the attacker four primitives. To understand why those primitives matter, here is what a real-world Linux LPE chain looks like, from primitives to `uid=0`.

Modern Linux LPE chains are typically structured as five steps:

1.  **Information leak**. Defeat KASLR. The attacker needs to know where the kernel image, or at least the relevant slab region, sits in virtual memory. Our IncFS bug provides this for free: the cross-process info leak returns a slab linear map pointer.
2.  **Heap shaping / spray**. Manipulate the slab allocator’s state so that the next allocation of a chosen size lands in a chosen slot. Achieved by allocating and freeing large numbers of objects of the target size, often by abusing a different syscall like `msgsnd()` (the SysV IPC message-passing primitive our v5 PoC uses) that lets userspace control the size of a kernel allocation. The IncFS bug is on a generic-purpose `kmalloc-256` cache, which is the same cache used by dozens of other kernel structures — that means there are many target structures the attacker can collide with.
3.  **Trigger the primitive**. Run the racing ioctl until the double-free fires on a chosen target slot.
4.  **Type confusion**. The chosen target slot now contains an object the attacker can groom into a structure with a useful function pointer (vtable entry, callback, refcount destructor, etc.). The attacker overwrites that pointer with the address of `commit_creds(prepare_kernel_cred(NULL))` or similar kernel function chosen via the leaked KASLR offset.
5.  **Pull the trigger**. Cause the kernel to invoke the tampered function pointer. The kernel sets the current task’s credentials to the kernel default credentials. The user-space process running the exploit now has `uid=0`.

Our bug delivers steps 1 (info leak), 3 (the primitive generator), and the conditions necessary for steps 4 and 5 (freelist corruption with attacker-controlled bytes on a generic slab cache, on stock Android allocator hardening). The chain itself — selecting a specific victim struct, computing the exact spray bytes that survive the per-cache cookie, computing the exact KASLR-offset-adjusted address of the credentials helper — requires per-build artefacts (the per-cache cookie value, the kernel image, the slot layout of the victim struct) that external researchers do not have for the target Pixel build. **Google does, internally.**

This is the structural reason the reporter cannot close the chain end-to-end against a public-image lab. We have the upstream half. The downstream half requires the artefacts internal to the vendor.

## What the patch eliminates

I want to spend one paragraph on the negative control to make the patch’s sufficiency unambiguous.

The same three workloads, run against the patched kernel:

-   v1 (8 threads × 200 iterations), 10 runs: 0 KASAN reports, 0 BUGs, 0 GPFs.
-   v3-stress (4 procs × 4 threads × 8000 iters), 10 runs: 0 leak events / 1,280,000 iterations.
-   v5-msgspray on the no-KASAN hardened build, 1 run: 0 BUGs, 0 GPFs, allocator metadata clean.

Functional behaviour is preserved: a sanity read of the signature on the patched kernel returns the right 256 bytes with the `K-INCFS-04-MARK!` marker prefix the PoC writes. The single-thread code path uses the now-stack-local pointer identically to how it used the BSS slot. The only difference is that the BSS slot no longer exists.

This is what “the fix is a single-character change” actually means in practice: drop the qualifier, recompile, and every observable symptom of the race disappears.

## Google’s Android & Devices VRP responded

Now the second half of the story.

I submitted the full report (the technical content above plus 19 appendix documents covering reachability, exploitability, reliability statistics, and the cross-branch patch validation) to the Google Bug Hunters portal on **2026-05-09**. The lifecycle went:

| Date | Event |
| --- | --- |
| 2026-05-09 | Submitted. Auto-reply: assigned internal Android ID; CLA request; PoC reproduction request. |
| 2026-05-19 | I confirmed CLA signed and PoC details already in the package. |
| 2026-05-19 | Android Security Team acknowledged and forwarded to the technical team. |
| 2026-06-15 | Closed: **Status: Won’t Fix (Infeasible)**. |

The full closing comment:

> *“Thank you for taking the time to submit this report to the Android & Google Device Vulnerability Reward Program! We have investigated this issue and determined that this is not a security vulnerability. We have logged this issue for potential remediation in a future version. At this time, this report is considered closed and will no longer be monitored. If you believe this is an error, please submit a new report…”*

The last sentence is structurally meaningful. I’ll come back to it.

### How Google’s program actually works

Google runs several distinct security reward programs. The one relevant here is the **Android & Google Devices Vulnerability Reward Program** (informally “Android VRP” or “ASR”). It is operated by Google’s Android Security Team. It accepts reports against Pixel hardware, the Android operating system, and Google-published apps and services.

When you submit a report, several things happen in sequence:

1.  An automated system files an internal bug ID against the relevant component and routes a notification to the team that owns that component.
2.  A human security engineer (“triager”) reads the report and makes an initial severity rating using the [Android severity guidelines](https://source.android.com/docs/security/overview/updates-resources).
3.  The component team confirms the technical content (does the bug exist, does the PoC reproduce on a recent build).
4.  If the bug clears the severity bar, it progresses to: a. Development of an upstream patch, sometimes coordinated with the original reporter. b. CVE assignment. c. NDA-shared distribution to Android partners for remediation. d. Eventual public listing in an Android Security Bulletin. e. **Android Security Rewards payment**.
5.  If the bug does not clear the severity bar, the report is closed with one of several published verdicts: `Won't Fix`, `Won't Fix (Infeasible)`, `Won't Fix (Intended Behavior)`, `Duplicate`, etc.

The cleanest description of the severity bar is in the program’s public severity guidelines, which describe High and Critical impacts in terms of **demonstrated end-impact against a real device**: privilege escalation, sandbox escape, remote code execution. The guidelines do not articulate a partial-primitive bar. A deterministic double-free in a generic kernel cache reachable from `priv_app` does not have a named row in the matrix; the matrix is structured around demonstrated end-impact, not around primitives.

That structural absence is what produces verdicts like “Infeasible”.

### What “Won’t Fix (Infeasible)” actually communicates

ASR has a specific institutional meaning for **Infeasible** that isn’t quite what the English word suggests. It does not mean “impossible to exploit”. It means “the reporter did not close the chain end-to-end against a real target in the open lab, and the program does not invest internal exploitability work on the reporter’s behalf for VRP-bounty purposes”.

There is internal logic to this. ASR ratings drive bounty amounts, and bounties are designed to reward the work that turns a primitive into a chain. The CTF-style end-to-end exploit is the work the program is buying. If a reporter ships a primitive and not a chain, the program’s position is that a different reporter (or an internal team) could equally well ship a chain against the same primitive, and only the chain-shipping reporter is paid.

This rule produces predictable outcomes in cases like this one. Two things are true simultaneously:

-   The bug is **real**. Google’s own initial reply (#2 in the thread) acknowledges that the report has been *“filed for the Android engineering team to investigate further”*, and the closing comment notes the issue is *“logged for potential remediation in a future version”*. The bug exists in their tree, the patch will eventually land, and the issue will get silently fixed without a CVE in an Android Security Bulletin.
-   The reporter is **not paid**, because the report itself documents (honestly) that the LPE chain did not close in the external lab.

The friction is that the report’s framing volunteers the gap:

> *“the downstream chain… did NOT close in the public-image lab”*

> *“potentially higher pending Google exploitability assessment”*

I believe this is the right framing for the work the report actually describes. It is also the framing the triager’s algorithm reads as “no demonstrated severity”. Several other researchers have privately mentioned hitting the same outcome with similar phrasing.

I do not have a good answer for what the right rewording would be for future reports. Stripping the “did not close” sentence would be closer to padding than to communication. Saying nothing about the chain produces a worse outcome (the triager will assume nothing, and the verdict will be the same). The honest framing of an honest primitives-only report carries the same information.

What the verdict does not say — for completeness:

-   It does not say the bug isn’t there. The closing comment explicitly notes the issue was logged for potential remediation in a future version. The bug exists in their tree.
-   It does not say the PoC doesn’t reproduce. The PoC ships with 20-out-of-20 reliability, full per-run logs, and a one-line patch that turns off the same workload’s output.
-   It does not say `priv_app` isn’t the attacker model. The reachability section of the report cites the AOSP main sepolicy lines that grant the trigger to `priv_app`. The triager did not push back on the reachability claim.

The verdict says: not enough demonstrated end-impact to clear the severity bar for VRP rating purposes.

## What I’m doing about it

The closing comment invites a re-submission “if you believe this is an error, please submit a new report and include all necessary information on why this is a valid vulnerability according to our published severity guidelines.”

I will not be doing that. Re-submitting without an end-to-end `uid=0` payload would produce the same verdict; producing the end-to-end payload requires the Pixel build artefacts and the per-cache cookie value that I do not have. I respect the program’s institutional reason for that rule even when I think it produces the wrong outcome in this specific case.

Instead, three things:

**One**, this post. The bug, the architecture, the reproducer, and a working description of what the verdict actually says are public so that the next researcher who hits the same wall has a shape to compare against. The notification to the vendor has been made; the responsible-disclosure obligation is discharged. This is standard responsible disclosure practice when a vendor declines to treat a report as a security vulnerability.

**Two**, a CVE request goes to MITRE on the same day as this post. The bug is in upstream Android Common Kernel code, source publicly available, runtime-confirmed, patch shipped. MITRE assigns CVEs on exactly these terms.

**Three**, the reproducer in [`TREXNEGRO/Research/android-incfs-verity-signature-race`](https://github.com/TREXNEGRO/Research/tree/master/android-incfs-verity-signature-race). PoC source for all five primitive variants, sample crash logs, and the one-line patch. Buildable from the public Android Common Kernel tree.

### What this post is not

It is not an end-to-end `uid=0` exploit kit. The primitives are documented as primitives. The downstream chain (controlled reuse to a chosen target, type confusion against a chosen victim struct, control-flow influence, `commit_creds(prepare_kernel_cred(NULL))` invocation) was attempted in a dedicated exhaustion phase against the public-image lab and did not complete; the blockers are the per-build artefacts I described in the LPE-chain section above.

If you are building defensive instrumentation and want to detect the primitives, the things to watch are:

-   `kfree()` arriving from `incfs_ioctl_read_verity_metadata` with the same address freed twice from different tasks (KASAN catches this trivially; non-KASAN production kernels need KFENCE or similar sampling instrumentation).
-   userspace buffers returned from `FS_IOC_READ_VERITY_METADATA` that do not match the file’s configured signature byte-for-byte after the read. An IDS or EDR that has access to the host-side trace can catch this with a simple equality check.
-   pages of `kmalloc-256` showing freelist next-pointers whose high byte after `freelist_ptr_decode` is a constant `0xCC` -style attacker sentinel.

If you are an Android Common Kernel maintainer running this post through the usual triage, the patch is two lines, the test is `./run.sh patched 10` against an unmodified initramfs, and the expected output is zero events.

## Glossary, in one place

-   **APK**— Android application package, the installable bundle of an Android app.
-   **BSS**— `.bss` section of an ELF binary, holds globally-scoped variables that start at zero. The `static` qualifier on a function-local variable places it here.
-   **CDM**— Content Decryption Module. Not relevant here; unrelated to my other writeups on Widevine.
-   **DataLoaderService**— Android API that lets a privileged app feed file blocks to IncFS on demand. Reachable from `priv_app`.
-   **fs-verity**— Linux kernel feature that enforces read-time integrity of file contents against a Merkle tree.
-   **GFP_KERNEL**— `Get Free Pages` flag passed to kernel allocators indicating the caller can sleep waiting for memory.
-   **IncFS**— Android-specific incremental filesystem in `fs/incfs/`. Backs every modern Android install path.
-   **ioctl**— generic Linux syscall for issuing device/filesystem-specific commands. `FS_IOC_*` family are fs-verity-specific.
-   **KASAN**— Kernel Address Sanitiser. Compile-time instrumentation that catches UAF / OOB / double-free deterministically. Debug builds only.
-   **KASLR**— Kernel Address Space Layout Randomisation. Randomises the kernel image base at boot. Defeated by leaking any kernel-resident pointer.
-   **KFENCE**— Kernel Electric Fence. Sampling-based UAF/OOB detector usable on production kernels.
-   **kmalloc-256**— generic-purpose slab cache for objects of size 128–256 bytes. Shared across the kernel.
-   **LPE**— Local Privilege Escalation. The exploit class where an unprivileged local actor on a system uses a bug to become more privileged (typically `uid=0`).
-   **memdup_user**— kernel helper that allocates a kernel buffer of size N and copies N bytes from userspace into it.
-   **Merkle tree**— hash tree structure where each leaf is a hash of a file block and each internal node is a hash of its children. Used by fs-verity (and many other systems) to authenticate the contents of a large file via a small root hash.
-   **priv_app**— Android sepolicy domain assigned to privileged pre-installed apps. Includes the Play Store.
-   **sepolicy**— SELinux policy file in `system/sepolicy/` that defines what each Android domain can touch.
-   **SLUB**— Linux kernel’s slab allocator. Stores its freelist next-pointers in-band, inside freed objects.
-   **system_server**— Android’s main system process. Owns the package manager, activity manager, etc.
-   **untrusted_app**— sepolicy domain for third-party apps. Least privilege.

## Further reading

-   The Linux kernel’s own SLUB implementation: [`mm/slub.c`](https://elixir.bootlin.com/linux/latest/source/mm/slub.c) and the freelist hardening code at [`include/linux/slub_def.h`](https://elixir.bootlin.com/linux/latest/source/include/linux/slub_def.h).
-   The IncFS source tree on AOSP: [`android.googlesource.com/kernel/common/+/refs/heads/android15-6.6/fs/incfs/`](https://android.googlesource.com/kernel/common/+/refs/heads/android15-6.6/fs/incfs/).
-   Android severity guidelines: [`source.android.com/docs/security/overview/updates-resources`](https://source.android.com/docs/security/overview/updates-resources).
-   Google’s published Android VRP program description: [`bughunters.google.com/about/rules/6171833274204160/android-and-google-devices-vulnerability-reward-program-rules`](https://bughunters.google.com/about/rules/6171833274204160/android-and-google-devices-vulnerability-reward-program-rules).
-   AOSP main sepolicy: [`android.googlesource.com/platform/system/sepolicy/`](https://android.googlesource.com/platform/system/sepolicy/).
-   The reproducer for this post: [`TREXNEGRO/Research/android-incfs-verity-signature-race`](https://github.com/TREXNEGRO/Research/tree/master/android-incfs-verity-signature-race).

## Acknowledgements

The Google Android Security Team triager who handled the report was polite and prompt throughout the five-week window, which is not always how vendor interactions go. This post pushes back on the verdict, not on the people, and the program’s institutional reasoning is worth engaging with seriously even when (especially when) one disagrees with where it lands in a specific case.

If anyone from the program reads this and would like to revisit, my contact details are at the foot of the [reproducer repo](https://github.com/TREXNEGRO/Research/tree/master/android-incfs-verity-signature-race).
