---
title: "Watch Out for Your Watchers: How a File-Watch Bug Froze Our Encrypted Folders (and a One-Line Bug in macFUSE)"
source: https://reversea.me/index.php/watch-out-for-your-watchers-how-a-file-watch-bug-froze-our-encrypted-folders-and-a-one-line-bug-in-macfuse/
source_host: reversea.me
clip_date: 2026-11-18T13:14:45+08:00
trace_id: 76d32fd8-eabc-4c98-a61b-30db95aea174
content_hash: 77f6eb56e814180a884fd5e1f3bb04b8770e80b699508ed7be9d28ab048c1285
status: synced
tags:
  - macOS
  - FUSE
series: null
feed_source: RME-DisCo·取证研究
ai_summary: macFUSE 5.1.0 引入的 `FUSE_MONITOR` 处理函数缺少一行 `free_path()`，导致路径锁泄漏，可在特定 `FORGET` 条件下永久耗尽 worker 线程池，冻死整个 FUSE 挂载卷；已于 5.3.1 修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41c75244-d011-81b9-8e80-f7877bbc2255
ioc:
  cves: []
  cwes:
    - CWE-764
    - CWE-772
    - CWE-833
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> macFUSE 5.1.0 引入的 `FUSE_MONITOR` 处理函数缺少一行 `free_path()`，导致路径锁泄漏，可在特定 `FORGET` 条件下永久耗尽 worker 线程池，冻死整个 FUSE 挂载卷；已于 5.3.1 修复。
> 
> - **根因：** macFUSE 5.1.0（2025-10-30）新增 `FUSE_MONITOR`（opcode 60）消息，`fuse_lib_monitor()` 调用 `get_path()` 拿读锁后从不 `free_path()`，每次消息泄漏节点及其祖先目录的 `treelock`；文件系统是否实现 `.monitor` 操作无关紧要，因为 handler 被无条件注册。即使本地文件系统未受影响，这个 Bug 也会在 watch attach/detach 周期中各泄漏一次。
> - **触发链路：** XNU 中 vnode kqueue 过滤器成功 attach 后会调用 `VNOP_MONITOR(BEGIN)`，detach 时调用 `VNOP_MONITOR(END)`；macOS 上 `fs.watch()` 对单个文件恰好产生一个 BEGIN/END 对。但当前证据（shutdown stall 报告仅保留线程栈，不保留发起进程信息）无法确认究竟是 VS Code 的 LaTeX Workshop 还是其他应用触发了作者实际遇到的冻结。
> - **终态机制：** 最后一次 lookup 引用被丢弃时，`forget_node()` 在 `pthread_cond_wait` 上等待已泄漏的 `treelock` 归零，worker 永久挂起；而 `fuse_loop_mt.c` 中一个古老优化（不把处理 `FORGET` 的 worker 计入 busy，即不减 `numavail`）意味着不会启动替代 worker，最终无人读 `/dev/macfuse`，unmount 和关机全部卡死。
> - **验证：** 通过 `spindump -i` 解码关机卡死报告，`otool -arch arm64 -tV` 反汇编 `libfuse.2.dylib`，用数百行 C 的 `memfs.c` + `kqwatch.c` PoC 完整复现：5.1.3 库下 `rm` 挂死、unmount 时 4 个 worker 全部 park 且无人读 device；5.5.0 库则全部正常。
> - **修复与边界：** 修复仅需在 `fuse_fs_monitor()` 后加一行 `free_path()`（commit `c3ff8d98`，2026-06-08，发布于 5.3.1）。影响评估为本地 DoS（CWE-764/772），无 CVE。`FORGET` 计数快捷方式仍存在，同类锁泄漏仍可能再次演变为卷冻结。

**TL;DR** We write our papers in LaTeX, inside folders encrypted with [EncFS](https://github.com/vgough/encfs) on top of [macFUSE](https://macfuse.github.io/), with VS Code rebuilding and refreshing the PDF preview on every save. One evening the encrypted volume froze so hard that even shutting down the Mac stalled, twice in fifteen minutes. In this post we walk through how we went from the macOS shutdown-stall reports to the root cause: since macFUSE 5.1.0, the `libfuse` handler for the new `FUSE_MONITOR` message takes a path lock and never releases it. A normal attach/detach cycle for a per-file kqueue watch generates a `MONITOR` BEGIN/END pair, and the affected handler leaks one read lock for each message. A later `FORGET` that drops the last lookup reference to a leaked node can then park a worker thread forever. An old accounting shortcut in `libfuse` leaves blocked `FORGET` workers counted as available, so enough such requests can exhaust the real worker pool without starting replacements. We show the bug in the source, confirm its affected release window in the binaries and source history, and reproduce the full freeze with a toy file system of a few hundred lines of C. The mechanism is demonstrated end to end; the shutdown-stall reports do not, however, identify which application created the original watches. The bug was already reported upstream ([macfuse/macfuse#1168](https://github.com/macfuse/macfuse/issues/1168)) and is fixed since macFUSE 5.3.1, so the short version is: *update macFUSE*. The long version is below:).

* * *

## How It Started: a.tex, a PDF Preview, and a Frozen Mac

Our day-to-day paper writing is pretty boring, which is how we like it: `.tex` sources, VS Code with the [LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop) extension, `latexmk` building on every save, and the PDF preview tab refreshing itself a second later. The only slightly unusual part is *where* the sources live. Our research folders are encrypted with EncFS, and the ciphertext is synced to our own Nextcloud server (when it works). EncFS is a FUSE file system, so on macOS it runs on top of macFUSE: the kernel extension forwards operations that require user-space handling to the `encfs` process, which decrypts on the fly.

On November 5, 2026, in the middle of an evening of writing, everything that touched the encrypted folder stopped responding (this was happening us few weeks ago, but we did not have enough time to dig into it until now…). The editor hung, terminals hung on `ls`, and `diskutil unmount` did not help. We rebooted. Eleven minutes after remounting the folder and getting back to work, *it happened again*. Second reboot.

Two freezes in fifteen minutes is not bad luck, it is a bug. And since the Mac kept forensic breadcrumbs of both incidents, we went digging (well, *spoiler here*: **the culprit is a missing `free_path()` call, otherwise you would not be reading this**).

## First Clues: Reading the Shutdown-Stall Reports

When macOS takes too long to shut down, `launchd` records a *shutdown stall* report in `/Library/Logs/DiagnosticReports/`. These reports are binary spindumps, but `spindump` itself can turn them into text:

```
spindump -i /Library/Logs/DiagnosticReports/shutdown_stall_2026-11-05-215306_atropos.shutdownStall -o stall1.txt
```

Each report contains the stack of every thread of every process still alive while the system was trying to shut down. Of course, the `encfs` processes were there. Figure 1 shows the process serving our research folder: the main thread waits in the `libfuse` session loop, as expected, while every worker thread sits on exactly the same stack. Note the `last ran` column: one worker had not run for 38 hours, another for 21 hours, and the rest had stopped at the same instant, less than three minutes before the shutdown.

![Excerpt of the decoded shutdown-stall report: the encfs process serving our research folder.](https://reversea.me/wp-content/uploads/2026/11/fig1_spindump-1024x596.png)

*Figure 1: Excerpt of the decoded shutdown-stall report: the `encfs` process serving our research folder (annotations ours).*

The library is stripped, but the arm64 slice of `libfuse.2.dylib` disassembles nicely with `otool -arch arm64 -tV`. The four `libfuse` offsets in the worker stack (59684, 69888, 26228 and 48904, that is, `0xe924`, `0x11100`, `0x6674` and `0xbf08`) are, respectively, the worker loop right after `fuse_session_process_buf()`, the request dispatcher, a small handler that prints `"FORGET %llu/%llu\n"` in debug mode, and a `pthread_cond_wait()` inside the function that handler calls. In other words: **every worker is processing a `FORGET` request and waiting on a condition variable**.

And it was not alone. Counting threads across both reports:

| Report | `encfs` process | Workers waiting at `0xbf08` | Workers reading `/dev/macfuse` | Notes |
| --- | --- | --- | --- | --- |
| 21:52 (first freeze) | research folder | **9 / 9** | 0   | 2 of them had been parked for 38 h and 21 h; the other 7 since 21:50:01 |
| 21:52 (first freeze) | second encrypted folder | 3 / 9 | 6   | 2 parked for ~37 h, 1 since 21:49: quietly heading the same way |
| 22:09 (second freeze) | research folder, remounted | **10 / 10** | 0   | all parked within 11 minutes of mounting |

So the workers were not stuck on I/O, on decryption, or on Nextcloud. They were waiting, one by one, for something that never came, and once the last one got in line, nobody was left to read requests from the kernel. Time to read some source code.

## Into the Source: Path Locks in High-Level libfuse

EncFS uses the *high-level* FUSE API, where the file system receives paths (`/papers/draft/paper.pdf`) instead of inode numbers. To keep paths consistent while requests run concurrently, `libfuse` maintains an in-memory tree of nodes and a per-node lock counter, `treelock`: positive values count readers, `-1` (`TREELOCK_WRITE`) marks a writer. macFUSE maintains its own fork of `libfuse` 2.9 in [macfuse/library](https://github.com/macfuse/library) (branch `support/libfuse-2.9`), and the read-locking part of `try_get_path()` in `lib/fuse.c` looks like this:

```
for (node = get_node(f, nodeid); node->nodeid != FUSE_ROOT_ID;
     node = node->parent) {
	...
	if (need_lock) {
		err = -EAGAIN;
		if (node->treelock < 0)
			goto out_unlock;

		node->treelock++;
	}
}
```

Note the loop: a read lock on a path increments `treelock` on the node **and on every ancestor directory** up to (but not including) the root. Every `get_path()` must be paired with a `free_path()`, which walks the same chain decrementing the counters.

Now, the function our threads were stuck in. The `FORGET` handler calls `forget_node()`:

```rust
static void forget_node(struct fuse *f, fuse_ino_t nodeid, uint64_t nlookup)
{
	...
	/*
	 * Node may still be locked due to interrupt idiocy in open,
	 * create and opendir
	 */
	while (node->nlookup == nlookup && node->treelock) {
		struct lock_queue_element qe = {
			.nodeid1 = nodeid,
		};

		debug_path(f, "QUEUE PATH (forget)", nodeid, NULL, false);
		queue_path(f, &qe);

		do {
			pthread_cond_wait(&qe.cond, &f->lock);
		} while (node->nlookup == nlookup && node->treelock);
		...
```

When the kernel asks the file system to drop the *last lookup reference* known to `libfuse` (`node->nlookup == nlookup`), `forget_node()` waits until nobody holds a path lock on that node. That `pthread_cond_wait()` is our `0xbf08`. If `treelock` never goes back to zero, the thread never comes back. So the question becomes: **who is leaking path locks?**

## The Bug: a MONITOR That Never Lets Go

macFUSE 5.1.0 (October 30, 2025) added support for a new macOS-specific message, `FUSE_MONITOR` (opcode 60), in commit [`67aa41ee`](https://github.com/macfuse/library/commit/67aa41ee6c8456180526e1023217a1c6a3eff921). The kernel sends it to tell the file system that the number of watchers of a file has changed (`FUSE_MONITOR_BEGIN` / `FUSE_MONITOR_END`). Here is the high-level handler as it shipped:

```cpp
static void fuse_lib_monitor(fuse_req_t req, fuse_ino_t ino, uint32_t flags)
{
	struct fuse *f = req_fuse_prepare(req);
	char *path;
	int err;

	err = get_path(f, ino, &path);   /* read lock on the node and its ancestors */
	if (err) {
		fuse_reply_none(req);
		return;
	}

	fuse_fs_monitor(f->fs, path, flags);
	fuse_reply_none(req);            /* ...and no free_path(). Ever. */
}
```

There is a `get_path()` but no `free_path()`. Every `MONITOR` message leaves `treelock` incremented by one on the watched node and on each parent directory up to, but not including, the root. Two details make this worse than it looks:

-   **It does not matter whether the file system cares about monitoring.** EncFS does not implement the `.monitor` operation (`fuse_fs_monitor()` simply does nothing), but `fuse_lib_monitor()` is registered unconditionally in `fuse_path_ops`, so the lock is taken anyway.
-   **A normal per-file watch lifecycle costs two leaks.** To know where `VNOP_MONITOR` comes from, we looked at XNU. In [`bsd/vfs/vfs_vnops.c`](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/vfs/vfs_vnops.c), the vnode kqueue attach path calls `VNOP_MONITOR(vp, 0, VNODE_MONITOR_BEGIN, ...)` after a filter is attached successfully, and `filt_vndetach()` normally calls it again with `VNODE_MONITOR_END` when the filter goes away. macFUSE forwards both as `FUSE_MONITOR`. Thus a successful attach plus detach leaks two locks; either message by itself leaks one.

Who generates those per-file kqueue filters? [Node.js documents](https://nodejs.org/api/fs.html#availability) that `fs.watch()` uses kqueue for files and FSEvents for directories on macOS. Against a test mount, `fs.watch()` on a single file produced exactly one `MONITOR` BEGIN/END pair, while `fs.watch()` on a directory and `fs.watchFile()` (polling) produced none. This proves a concrete trigger, but not the identity of the process that triggered our incident.

Our LaTeX workflow initially looked like the obvious suspect, but a closer check sets an important limit on that claim. The installed LaTeX Workshop 10.20.0 creates VS Code `FileSystemWatcher` s from [directory glob patterns](https://github.com/James-Yu/LaTeX-Workshop/blob/2f5a60a11a99f33013c1235f0499546cc831cfcb/src/core/watcher.ts), and normally [refreshes the project PDF directly after a successful build](https://github.com/James-Yu/LaTeX-Workshop/blob/2f5a60a11a99f33013c1235f0499546cc831cfcb/src/compile/executor.ts). The shutdown-stall reports preserve thread stacks, not the process that originally installed the watches. We therefore cannot name the PDF preview—or even LaTeX Workshop—as the culprit from the surviving evidence. Another VS Code component or any other application using a per-file kqueue watch could have supplied the `MONITOR` traffic. What the reports, source analysis and PoC establish together is the failure chain once those stale path locks exist.

The fix, in commit [`c3ff8d98`](https://github.com/macfuse/library/commit/c3ff8d98e06c7194591dbf8076da4ada1c97f519) (June 8, 2026), is literally one line:

```
	fuse_fs_monitor(f->fs, path, flags);
+	free_path(f, ino, path);
 	fuse_reply_none(req);
```

## From a Leaked Lock to a Frozen Volume

A leaked read lock has two visible effects. The first one is the symptom described in issue [#1168](https://github.com/macfuse/macfuse/issues/1168): an operation that needs a *write* lock on the leaked node or path (`unlink`, `rmdir`, `rename`) finds `treelock > 0`, queues up, and waits forever. That is bad, but it consumes one thread per stuck request, and ordinary requests decrement `numavail`, allowing `libfuse` to start replacement workers.

The second effect matches the terminal mechanism in our shutdown-stall reports. When the kernel reclaims a vnode and sends a `FORGET` that drops its final lookup count (for example after cache reclamation, deletion or during unmount), `forget_node()` can park the worker forever on the leaked `treelock`. And here comes the second ingredient, which has been in upstream `libfuse` for years. In `lib/fuse_loop_mt.c`:

```rust
/*
 * This disgusting hack is needed so that zillions of threads
 * are not created on a burst of FORGET messages
 */
if (!(fbuf.flags & FUSE_BUF_IS_FD)) {
	struct fuse_in_header *in = fbuf.mem;

	if (in->opcode == FUSE_FORGET ||
	    in->opcode == FUSE_BATCH_FORGET)
		isforget = 1;
}

if (!isforget)
	mt->numavail--;
if (mt->numavail == 0)
	fuse_loop_start_thread(mt);
```

A worker handling a `FORGET` does *not* decrement `numavail`, an optimisation intended to avoid spawning many threads for a burst of one-way `FORGET` requests. With the leak, the request is no longer quick: each final `FORGET` on a leaked node can park one worker while the accounting still treats it as available. As long as the stale counter remains nonzero, no replacement is started. Once enough workers are parked, nobody reads `/dev/macfuse` anymore, and every operation that requires a request to the file system daemon—including unmount and shutdown work—waits forever. Figure 2 puts the whole chain together.

![From a kqueue watch to a frozen FUSE volume.](https://reversea.me/wp-content/uploads/2026/11/fig2_deadlock-1024x546.png)

*Figure 2: From a kqueue watch to a frozen FUSE volume.*

This mechanism is also consistent with the timeline in the stall reports: a couple of workers had been parked over a day and a half of normal use, and then the remaining seven stopped within the same second during a busy writing session. The stacks prove where the workers ended up; the source history and PoC explain how the `MONITOR` leak can put them there.

## Confirming It in the Binaries

Reading source is nice, but what runs on the machine is the binary. We downloaded the official packages from the [macFUSE releases page](https://github.com/macfuse/macfuse/releases), extracted `libfuse.2.dylib` with `pkgutil --expand-full`, and located `fuse_lib_monitor()` in the arm64 slice by following the calls to the exported `fuse_fs_monitor()` (the other callers are the stacking modules, such as `iconv` or `volicon`). This is the official version 5.1.3 binary—the version installed on the affected Mac—and its worker-stack offsets match those in the shutdown-stall reports (only the calls are shown):

```
abc8  sub  sp, sp, #0x40
abe8  bl   0xb9f0                   ; req_fuse_prepare()
ac00  bl   0xc068                   ; get_path()  -> read lock taken
ac14  bl   _fuse_fs_monitor
ac1c  bl   _fuse_reply_none         ; ...and that's it
```

And this is version 5.5.0, where `free_path()` has been inlined after the call:

```
b058  bl   0xbea4                   ; req_fuse_prepare()
b070  bl   0xc528                   ; get_path()
b084  bl   _fuse_fs_monitor
b094  bl   _pthread_mutex_lock      ; free_path(), inlined:
b0a8  bl   0xcb08                   ;   unlock_path()
b0b8  bl   0xcbe0                   ;   wake_up_queued()
b0c0  bl   _pthread_mutex_unlock
b0c8  bl   _free
b0d0  bl   _fuse_reply_none
```

Repeating the check on other releases gives the window of affected versions:

| macFUSE | Release date | `FUSE_MONITOR` handler | Lock released |
| --- | --- | --- | --- |
| 5.0.7 | 2025-09-30 | no  | n/a |
| 5.1.0 | 2025-10-30 | yes | **no** |
| 5.3.0 | 2026-06-07 | yes | **no** |
| 5.3.1 | 2026-06-13 | yes | yes |
| 5.5.0 | 2026-10-17 | yes | yes |

We checked the binaries listed in the table directly. The introducing code landed before 5.1.0 and remained unchanged until the fix released in 5.3.1, which brackets the intermediate 5.1.1–5.2.0 releases as affected; a commenter on issue #1168 also independently reported the bug on 5.2.0. We confirmed in the 5.1.3 binary that the `FORGET` shortcut is present too: the worker loop compares the opcode against `0x2` (`FUSE_FORGET`) and `0x2a` (`FUSE_BATCH_FORGET`) and skips the `numavail` decrement for both.

## Reproducing the Freeze (Without Rebooting This Time)

The bug lives entirely in user space, inside `libfuse.2.dylib`, so there is no need to downgrade the kernel extension to reproduce it: a test file system linked against the old library runs fine on top of the current, fixed macFUSE. We wrote three small pieces:

-   `memfs.c`, a minimal in-memory high-level FUSE file system that, like EncFS, does not implement `.monitor`;
-   `kqwatch.c`, which attaches and detaches an `EVFILT_VNODE` kqueue filter on each path it receives (i.e., it is a very boring file watcher);
-   `repro.sh`, which mounts `memfs` with `libfuse` debug output (`-d`), runs each step under a hard timeout, and kills the file system with `SIGKILL` at the end, so a frozen mount cannot outlive the experiment.

The core of `kqwatch` is just this:

```sql
int fd = open(path, O_EVTONLY);
int kq = kqueue();
struct kevent ev;
EV_SET(&ev, fd, EVFILT_VNODE, EV_ADD | EV_CLEAR,
       NOTE_WRITE | NOTE_DELETE | NOTE_RENAME, 0, NULL);
kevent(kq, &ev, 1, NULL, 0, NULL);   /* attach -> MONITOR(BEGIN) */
close(kq);                           /* detach -> MONITOR(END)   */
close(fd);
```

Each scenario was run twice: once linked against `libfuse` 5.1.3 (affected) and once against the installed 5.5.0 (fixed). The `leak` scenario watches `d/x` three times and then deletes it; the `wedge` scenario watches 24 files once each and then unmounts the volume, which makes the kernel send one `FORGET` per file:

| Scenario | `libfuse` | `MONITOR` | `FORGET` | `QUEUE PATH` / `DEQUEUE` | Outcome |
| --- | --- | --- | --- | --- | --- |
| leak | 5.5.0 | 6   | 0   | 0 / 0 | `rm` completes |
| leak | 5.1.3 | 6   | 0   | 1 / 0 | `rm` hangs (killed after 10 s) |
| wedge | 5.5.0 | 48  | 24  | 0 / 0 | unmount completes |
| wedge | 5.1.3 | 48  | 4   | 4 / 0 | unmount hangs, all 4 workers parked, 0 reading `/dev/macfuse` |

The debug log of the `leak` run tells the story in a few lines (flags `1` and `2` are `BEGIN` and `END`):

```
unique: 4, opcode: MONITOR (60), nodeid: 3, insize: 48, pid: 90437
monitor /d/x 2
...
QUEUE PATH 3 (w)
```

There is no matching `DEQUEUE PATH`. In the `wedge` run, the file system had four workers alive, and the first four `FORGET` s took all of them:

```
unique: 50, opcode: FORGET (2), nodeid: 25, insize: 48, pid: 90614
FORGET 25/1
QUEUE PATH (forget) 25
...
```

The other 20 `FORGET` s and the final `DESTROY` were never read. The stacks of the parked workers, taken with `sample`, show the same return addresses we had found in the shutdown-stall reports of our real `encfs`: `0xe924` → `0x11100` → `0x6674` → `0xbf08`. The PoC therefore reproduces the terminal worker-pool state on demand, although it cannot retrospectively identify the application that created the original watches. Good news for our blood pressure: after the driver timed out and killed the blocked `rm` or `umount`, killing the test file system with `SIGKILL` and force-unmounting recovered the mount point in every run; no reboot was needed.

## Is This a Vulnerability?

The impact is a local denial of service. The most specific CWE mapping is [CWE-764](https://cwe.mitre.org/data/definitions/764.html), *Multiple Locks of a Critical Resource*: every `MONITOR` takes the path lock again without the matching unlock. [CWE-772](https://cwe.mitre.org/data/definitions/772.html), *Missing Release of Resource after Effective Lifetime*, also describes the missing release. We avoid CWE-833 here because its definition requires threads or executable segments waiting for *each other*; this failure is an indefinite wait on an abandoned lock count, not a circular deadlock. Creating a leaked lock requires only read access to a file on the volume: `open(O_EVTONLY)` plus a kqueue filter, with no special entitlement. One watched node is enough to wedge a later write-locking operation on that path; driving the whole volume into the worker-pool failure requires enough leaked nodes to reach final `FORGET` s. By default, macFUSE limits a volume to the user who mounted it, so in most setups the triggering software runs as that same user. With `allow_other`, any local user who can open suitable files on the volume can trigger the same denial of service for all its users. The bug was reported publicly in May 2026 and fixed in June 2026; we are not aware of a CVE assigned to it.

## Takeaways

-   **Update macFUSE to 5.3.1 or later.** If you installed it with Homebrew, note that the cask is marked `auto_updates`, so a plain `brew upgrade` skips it, and Homebrew may even report an outdated version. Use `brew upgrade --cask --greedy macfuse`, or check the real version with `defaults read /Library/Filesystems/macfuse.fs/Contents/Info.plist CFBundleShortVersionString`.
-   **If a FUSE volume freezes,** look at the threads of the file system process (`sample <pid> 1`) before rebooting. Workers parked in `pthread_cond_wait` under the `FORGET` handler are consistent with an unreleased high-level path lock; check the macFUSE version and debug log for `MONITOR` plus `QUEUE PATH (forget)` before attributing it to this specific bug. `kill -9` on the file system process followed by `umount -f` was enough to recover in our tests.
-   **Watchers are not free.** A per-file kqueue watcher looks like a passive observer, but on macOS a successful attach and normal detach on a macFUSE vnode each become a round trip to the file system daemon—and, in the affected releases, a leaked path lock.
-   **The `FORGET` shortcut is still there.** The fix removes this leak, but `fuse_loop_mt.c` still does not count `FORGET` workers as busy. Another bug that leaves high-level path locks held could again escalate into a frozen volume if enough final `FORGET` s block. A defensive fix (for instance, counting a `FORGET` worker as busy while it blocks in `forget_node()`) would make this failure mode much less dramatic.

* * *

*And that’s all, folks! The PoC (toy file system, watcher, test driver, a script to check macFUSE releases at the binary level, and the debug logs of the runs above) is [available on GitHub](https://github.com/reverseame/macfuse-monitor-repro). Many thanks to the macFUSE maintainer and to the reporters of [#1168](https://github.com/macfuse/macfuse/issues/1168), who had already done the hard part. If you are into file system internals, crash-report forensics, or reverse engineering stripped libraries, [reach out to us](mailto:reverseame@unizar.es). Thanks for reading, and stay secure (and keep your macFUSE updated)!*

* * *

## Declaration of Generative AI Technologies in the Writing Process

During the preparation of this post, the author used Claude (Claude Opus 5.5 model) to analyze the shutdown-stall reports, disassemble the `libfuse` binaries, build and run the reproduction, and improve readability and language. After using this tool, the author reviewed and edited the content as necessary and takes full responsibility for the content of this publication.
