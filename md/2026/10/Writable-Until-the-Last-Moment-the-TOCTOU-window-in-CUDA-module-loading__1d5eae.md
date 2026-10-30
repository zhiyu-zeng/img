---
title: "Writable Until the Last Moment: the TOCTOU window in CUDA module loading"
source: https://machinemodesecurity.ie/cuda-module-loading-toctou-window/
source_host: machinemodesecurity.ie
clip_date: 2026-10-31T03:36:57+08:00
trace_id: a87c0154-429b-48dd-8e61-01cb6aa72985
content_hash: 0beca3c00c7a86deefc1b8f17d75efd309c1555bdd185eb679cdda0e1c895361
status: synced
tags:
  - CUDA
  - 内核
series: null
feed_source: MachineMode·固件/硬件逆向
ai_summary: CUDA 模块加载存在 TOCTOU 窗口：GPU 实际执行的内核代码在通过所有校验后才落入普通可写宿主内存页，无需调试器或特权即可改写。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40975244-d011-813c-8af3-cdef977f7382
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> CUDA 模块加载存在 TOCTOU 窗口：GPU 实际执行的内核代码在通过所有校验后才落入普通可写宿主内存页，无需调试器或特权即可改写。
> 
> - **内核从不接触代码：** 一次模块加载在 nvidia 驱动入口产生 789 次 ioctl、零次 write(2)，最大声明参数仅 2,304 字节，远小于 32,176 字节的 fatbin；驱动源码零处提及 cubin/fatbin，执行的 SASS 由用户态 libcuda 写入 /dev/nvidiactl 的宿主 RAM staging 映射（Rss 实证，非设备 BAR）。
> - **篡改前提很低：** 只需加载进程内的一个线程，或对该进程内存的写权限（同 uid 且 ptrace_scope=0、父子进程或 CAP_SYS_PTRACE）；跨用户、MIG、独立虚拟机均可阻断，故属后渗透手段而非未披露漏洞。
> - **无工具也可赢：** 纯普通线程轮询并覆写自身进程内存，不依赖 mprotect、单步或 ptrace，5/5 次改换 GPU 执行的内核，写入落在目标字节出现后 1.5–2.6 微秒。
> - **窗口时长差异巨大：** 空闲时 RTX 6000 Ada 约 1.4 ms，RTX PRO 6000 Blackwell 仅约 1 μs；另一进程跑满 SM 可将 Blackwell 窗口拉宽到约 50 μs（25–50 倍），窗口随 SM 占用变化而与 PCIe 带宽无关，且在 cuLaunchKernel 提交前关闭。
> - **持久化与缓解线索：** 启动时赢一次竞争即永久生效，PyTorch 形态服务 200/200 请求运行被替换内核；staging 地址按进程内固定步长（10,240 字节等）递增，一次观测即可推算后续地址——每次加载随机化 staging 偏移是最廉价的防御，纯 Python 轮询（约 1.07 μs/次）则慢到无法赢下竞争。

## Summary

A CUDA fat binary holds several compiled versions of the same GPU kernel. [Part 1](https://machinemodesecurity.ie/undocumented-cuda-kernel-selection/) measured which one the driver picks. This post follows the one it picked the rest of the way, from the library call to the streaming multiprocessor that runs it.

The machine code the GPU executes is written into a host buffer by user space, after the container is parsed, after an entry is chosen and after any just in time compilation, with no traced function of the `nvidia` module running while it lands and every driver entry point among the traced ones. Writing to it while it is still mutable changes which kernel the GPU runs, with no debugger, no privilege and no page protection tricks. How long that lasts is not one number. Idle, it is 1.4 ms on an RTX 6000 Ada and about a microsecond on an RTX PRO 6000 Blackwell; a second process keeping that same Blackwell busy widens it to about 50 microseconds. The card matters, and so does what else the GPU is running.

## What it takes, and the three GPUs it ran on

That window is not a defect in anything. It exists because of where the code sits, which is why the first half of this post is the evidence for the second. Each test narrows where the executed bytes are, and they end up in an ordinary page of process memory that nothing in the stack guards.

**What it requires, before anything else.** A thread inside the loading process, or write access to that process’s memory from outside it: the same uid with `ptrace_scope` at 0, a parent relationship, or `CAP_SYS_PTRACE`. It crosses Linux process memory and no GPU isolation boundary. Separate users, MIG instances, NVIDIA’s hardware partitioning of one card, and separate virtual machines all stop it; separate containers stop it to exactly the degree they stop one process writing another’s memory. Nothing here is an undisclosed vulnerability. It is a measurement of how much a host side control can know about the code a GPU is about to run, and the answer is less than it looks.

Measured on an A100-SXM4-80GB, an RTX 6000 Ada Generation and an RTX PRO 6000 Blackwell Server Edition, driver branches 580.178.04, 610.57.04 and 615.71.09, CUDA 13.0, 13.2 and 13.4, Ubuntu 26.04 VM, open kernel modules, and PyTorch 2.14.1 for the serving shape. Every number below comes from a run on rented hardware, and every run sets `CUDA_MODULE_LOADING=EAGER`. Lazy loading, the CUDA default since 12.2 on Linux, defers the device side load from `cuModuleLoadData` to the first `cuModuleGetFunction`; forcing eager loading puts the upload where an instrument can bracket it. Whether the window keeps its shape and timing under the default is not measured here. Part 1 covers the five levels of precedence that decide which entry wins: [The undocumented rules behind CUDA kernel selection](https://machinemodesecurity.ie/undocumented-cuda-kernel-selection/).

## Does the kernel driver ever hold the code

![Layered diagram: the CUDA application and libcuda in user space, three /dev/nvidia character devices, nvidia.ko and nvidia-uvm.ko in the kernel, and below the PCIe line the GSP firmware, the GPU side engines and the SM. A teal control path runs down through every layer; a red code path runs from the host staging buffer out across PCIe to the GPU, outside the kernel modules. The control counts are 728 ioctls and 28,864 B declared at /dev/nvidiactl, 61 and 1,904 B at /dev/nvidia0, 184 at /dev/nvidia-uvm, and 789 at nvidia\_unlocked\_ioctl](https://machinemodesecurity.ie/wp-content/uploads/2026/10/stack-two-routes-2-1024x576.png)

Two routes through the same stack. Control is counted at every boundary, 789 ioctls at the nvidia driver entry for one module load. The code goes from libcuda into a host buffer and out across PCIe. nvidia.ko allocated that buffer and built the mapping, but no kernel module ever copies, parses or validates what lands in it. Tap to open it full size.

First, what is being followed. Compile one kernel twice so the variants differ only in a marker, and a 440 byte PTX container runs a 3,112 byte cubin that occurs nowhere in it: the driver JITs the PTX, caches the output, and the marker is in that cubin alone. On the ELF path the cubin is in the container but is still copied elsewhere before it runs. So the bytes that execute are not the bytes that were handed over, and the question is where they go.

**The question.** The code has to reach the GPU somehow. Does it cross the kernel driver on the way, and if it does not, what does the kernel actually see.

**Method.** Two independent vantage points on one module load, because one instrument that misses something looks identical to an absence. First, `strace -f -e trace=ioctl,mmap,write` on every `/dev/nvidia*` file, decoding the ioctl number, direction and declared argument size. Second, kprobes on the driver’s own entry points, which see calls `strace` attributes to the wrong file and cannot be bypassed by a library.

**Result.** One load of a 32,176 byte container. A 24,264 byte container built with CUDA 13.4 gave identical counts, so these are a property of the load path rather than of one file, and it is the container the figures are drawn from:

| Vantage point | Calls | Declared `_IOC_SIZE` | Largest single |
| --- | --- | --- | --- |
| strace, all `/dev/nvidia*` | 973 | 30,768 B | 2,304 B |
| of which `/dev/nvidiactl` | 728 | 28,864 B | 2,304 B |
| of which `/dev/nvidia-uvm` | 184 | no declared size | fixed per command |
| of which `/dev/nvidia0` | 61  | 1,904 B | 560 B |
| kprobe, `nvidia_unlocked_ioctl` | 789 | 30,768 B | 2,304 B |
| kprobe, `uvm_unlocked_ioctl_entry` | 185 | no declared size | fixed per command |
| kprobe, `nvidia_mmap` | 49  | no argument buffer |     |

The two instruments agree: 728 plus 61 is the 789 seen at the nvidia entry, and the UVM calls arrive at their own. There were zero `write(2)` calls to any device file, and the largest argument declared at the `nvidia` entry is 2,304 bytes. What the calls do is allocate, map, control and free driver objects, through the escapes `escape.c` dispatches.

Those totals are declared sizes rather than bytes crossing the boundary, and the ABI caps them: the `_IOC` size field is 14 bits, so a request code can declare at most 16,383 bytes, and the one escape that needs more, `NV_ESC_IOCTL_XFER_CMD`, is capped at 16,384 in `nv.h` and checked on that path in `nv.c`; an XFER’d call appears in the census above as its 16 byte transfer struct rather than its real size. UVM request numbers carry no `_IOC` encoding at all, `UVM_IOCTL_BASE(i) i`, so a UVM argument’s size is fixed in its handler. Either ceiling is an order of magnitude under a 32,176 byte container, and the code does not cross the kernel because the path is built not to copy it: the staging buffer is a mapping the process already holds, 98,304 KB on the A100 and 40,960 KB on the Blackwell. Zero files in the driver source mention cubin or fatbin.

The driver does copy from user memory, just not this. `_IOC_SIZE` bounds only the top level struct, and parameters behind pointers are copied separately, so the bytes copied run higher than the declared sizes: widen the window from the load to the whole run and `os_memcpy_from_user` moves 72,224 bytes in 524 calls, the largest 13,344 against a largest declared argument of 2,304. Every one has a stack source address and none begins with ELF magic: they are RM control parameter structures, not the payload. Two copy paths sit outside that census, `nv.c` ’s top level argument copy and UVM’s own, each bounded by a fixed per command struct size, so neither can carry a module image.

**What this settles.** The kernel driver is told what to do constantly, and handed the code never.

## The code lands in an ordinary page of host RAM

**The question.** If no ioctl carries it, where does the executed SASS, the GPU’s own machine code, exist on the host.

**Method.** Take write permission away from every writable `/dev/nvidia*` mapping while the load runs, and let the page faults report each store as it happens. Anonymous regions cannot be armed while single stepping, and an earlier run arming the 51 anonymous regions of 2 to 4 MB had already excluded them. The handler calls `mprotect` and `memcpy`, neither async signal safe, and depends on the load being single threaded at that instant: a limit of the instrument rather than a result.

```cpp
/* fault-capture.c, condensed. Nothing is allocated inside a handler:
   the snapshot arena is mapped before the load starts. */

static uintptr_t t_page;         /* page the pending store is landing in */
static int       s;              /* snapshot index into the arena */

/* 1. on entry to cuModuleLoadData, take write away from each interposed
      /dev/nvidia* mapping (anonymous regions only under WC_UNSAFE_ANON) */
mprotect(p, len, prot & ~PROT_WRITE);

/* 2. the next store traps here. Restore write, remember the page, and
      set the x86 trap flag so the retried store is single stepped */
static void on_fault(int sig, siginfo_t *si, void *uc)
{
    uintptr_t page = (uintptr_t)si->si_addr & ~(uintptr_t)(g_pagesz - 1);
    mprotect((void *)page, g_pagesz, PROT_READ | PROT_WRITE);
    t_page = page;
    ((ucontext_t *)uc)->uc_mcontext.gregs[REG_EFL] |= TF;
}

/* 3. one instruction later SIGTRAP arrives, the store has landed. Copy
      the page, clear the flag, drop write so the next store faults too */
static void on_trap(int sig, siginfo_t *si, void *uc)
{
    ((ucontext_t *)uc)->uc_mcontext.gregs[REG_EFL] &= ~TF;
    __builtin_ia32_sfence();     /* flush any write combining buffer */
    memcpy(g_arena + s * g_pagesz, (void *)t_page, g_pagesz);
    mprotect((void *)t_page, g_pagesz, PROT_READ);
}

/* 4. after the load, each snapshot is searched for the cubin's bytes */
```

What comes out is a sampled log of trapped stores, each tagged with the address just after the storing instruction, so the pages can be diffed snapshot by snapshot and matched against the cubin the GPU is known to have run. It is sampled rather than complete: between restoring write and re-protecting, the page is writable process wide, and CUDA is multithreaded, so stores from other threads land untrapped.

```toml
WC_CUBIN=a80.cubin WC_NEEDLE_HEX=02780500aaaa0000000f \
CUDA_MODULE_LOADING=EAGER CUDA_CACHE_DISABLE=1 \
LD_PRELOAD=./fault-capture.so ./loader ctl80.fatbin

# [FC] /dev/nvidiactl  98304 KB  base 0x200600000  faults 65
# [FC] page 0x20064b000 /dev/nvidiactl  faults 65 snaps 65 distinct 51 needle 38
#      ... first writer libcuda.so.1+0x179951
# [FC]   best run 448 bytes, snap 36, corpus a80.cubin, page_off 2996
```

**Result.** The executed kernel’s `.text.probe` arrives verbatim in a page of the `/dev/nvidiactl` mapping: 384 bytes carrying the marker, at offset 2,996 of page `0x20064b000`, matching `a80.cubin[1664:2048]` exactly. The matched run reads 448 because the 64 zero bytes after the section match too. Eight libcuda store sites wrote that page and `libcuda.so.1+0x179951` was the first of them, but no trapped store carries the payload itself, so this does not name the writer. The kernel side rules itself out separately: with ftrace filtered to the `nvidia` module, not one traced driver function ran within 5 ms either side of the moment the payload appeared, in three runs of three, and every driver entry point is among the traced ones.

On a 96,168 byte cubin the capture recovered 10,646 bytes and not the section that ran. What travels looks like code rather than the container around it. On Blackwell it recovered 1,296 bytes of a 5,360 byte cubin, one contiguous range, with nothing from the ELF header or the section headers and no ELF magic in three runs. The A100’s larger cubin did produce one ELF magic hit in 4,236 corpus matches, so the answer is not the same at every size.

These are host virtual addresses in the loading process, not GPU or physical ones: on the A100 `0x20064b000` is one 4 KB page of the 98,304 KB mapping that begins at `0x200600000`, both readable in `/proc/<pid>/maps`.

What that memory is on the A100, read from `/proc/<pid>/smaps`:

| Mapping | Size | `VmFlags` | Meaning |
| --- | --- | --- | --- |
| `/dev/nvidiactl` staging | 98,304 KB, `Rss` 98,304 KB | `rd wr sh mr mw me ms mm` | every page struct page backed, so host RAM |
| `/dev/nvidia0` BAR window | 2,048 KB, `Rss` 0 KB | `rd wr sh mr mw me ms pf io` | `VM_PFNMAP VM_IO`, device MMIO |

`Rss` is the evidence rather than the flags: smaps counts only pages with a struct page behind them, so `Rss` equal to `Size` says every page of the staging region is system RAM while the BAR window counts zero, so the code sits in host RAM mapped from `/dev/nvidiactl`, not in a device aperture. Two pages of the BAR window are written during the load, and one page of a separate 64 KB `/dev/nvidia0` mapping, and no cubin bytes appeared in the snapshots taken of any of them.

## The GPU runs what is in that page

**The question.** Is that buffer the source the GPU uses, or a copy of it.

**Method.** Substitution. Replace the bytes while the load is in flight and see which kernel runs. Two variants that differ only in a marker make the answer a single value.

```
PI_TARGET=./ta.bin PI_REPL=./tb.bin CUDA_CACHE_DISABLE=1 \
LD_PRELOAD=./patch-inflight.so ./loader one.fatbin

# marker  : 0xBBBB -> variant_b
```

**Result.** The GPU runs the substituted code. Four runs of four on the A100, reproduced on the RTX 6000 Ada and on the RTX PRO 6000 Blackwell. The JIT path stages through the same page from the same store site as the cubin path, so code the driver compiles and code read from a container reach the GPU by one mechanism. On Blackwell the cubin is 10,904 bytes and `.text.probe` straddles a page, so the substitution needs a seven byte anchor rather than the whole block.

![Six frame animation of one module load: the container with entry 4 selected, the control path lighting up with 789 ioctls against the 16,383 byte ceiling, the code path into the /dev/nvidiactl staging page, the kernel band greyed out while the code lands, the GPU pulling the bytes and the marker flipping to 0xBBBB, then both paths shown together](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/db02054216b0a86e.gif)

One module load, six steps. The kernel band stays grey while the code lands: zero nvidia module calls in the 5 ms around it. The pull is drawn around that band, not through it.

## How long it stays writable

**The question.** The substitution above used `mprotect` and single stepping, which invites the reply that it is a debugger trick. So: is the code changeable without any instrument, and for how long.

**Method.** Drop the instrument entirely. One thread polls the staging page with plain loads, about four million polls a run, and overwrites the known bytes when they appear. Sweeping the delay between the two measures the window.

```cpp
/* race-fast.c, condensed. No mprotect, no ptrace, no single stepping:
   an ordinary thread reading and writing its own process memory. */

/* the driver remaps the region while we poll, so a pointer into it can
   go stale. Catch the fault instead of dying on it. */
static void onfault(int sig) { if (g_guard) siglongjmp(g_jb, 1); _exit(139); }

g_spot = find_spot();            /* the page in the /dev/nvidiactl mapping */

while (!g_stop) {
    g_guard = 1;
    if (sigsetjmp(g_jb, 1) == 0) {
        while (!g_stop) {
            /* scan the page, not one offset: the payload moves with load,
               0xb00 idle, 0xb30 under compute, 0xb48 under host to device */
            unsigned char *p = memmem((const void *)g_spot, g_span, g_pat, g_len);
            if (!p) continue;

            if (g_delay_ns > 0) {    /* busy wait: the window is microseconds */
                double t = now_us();
                while ((now_us() - t) * 1000.0 < (double)g_delay_ns) ;
            }

            memcpy(p, g_rep, g_len);

            /* several copies of the same bytes can be present and only one
               is the copy the GPU takes. RF_ALL overwrites them all */
            size_t left = g_span - (size_t)(p - (unsigned char *)g_spot) - g_len;
            while (g_all && (p = memmem(p + g_len, left, g_pat, g_len))) {
                memcpy(p, g_rep, g_len);
                left = g_span - (size_t)(p - (unsigned char *)g_spot) - g_len;
            }
        }
    }
    g_guard = 0;
    g_spot = find_spot();        /* remapped under us: find it again */
}
```

```
RF_HINT_OFF=0x42b00 RF_TARGET=./ta.bin RF_REPL=./tb.bin RF_DELAY_NS=0 \
CUDA_CACHE_DISABLE=1 LD_PRELOAD=./race-fast.so ./loader one.fatbin

# marker  : 0xBBBB -> variant_b
```

**Result.** The racer’s write lands 1.5 to 2.6 microseconds after the bytes appear and changes the executed kernel, in 5 runs of 5, with no `mprotect`, no single stepping and no ptrace. That is the instrument’s latency, not the window. Sweeping the delay then measures how long the write keeps working, 10 trials per row:

On the Ada: 10 of 10 up to 1,400 us, 7 of 10 at 1,600, 5 of 10 at 1,800, 0 of 10 at 2,000. Reliable to 1.4 ms, half at 1.8. A second idle sweep, the baseline for the load comparison below, still won 2 of 5 at 2.0 ms, so 2 ms is the edge rather than a hard close. The window closes **before the launch is submitted**: in one timeline the bytes appear 3.9 ms before `cuLaunchKernel` is entered.

![Six frame animation on a 0 to 4 millisecond timeline: the payload appears in the staging page, a window bar runs teal to 1.4 ms, amber to 2.0 ms and red after, carrying 10 of 10, 5 of 10 and 0 of 10 runs won, a write at plus 2 microseconds flips the marker to 0xBBBB, a write at 2.0 ms leaves 0xAAAA, and a compute load bar reaches 3 ms at 10 of 10](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6dea0a520d608eb6.gif)

The delay sweep on one timeline, measured on the RTX 6000 Ada. Writing inside the teal band changes the executed kernel in every run; by 2.0 ms the same write no longer changes which kernel runs. A saturating compute kernel stretches the band to 3 ms. The Blackwell equivalent is the same shape a thousand times narrower.

**The same measurement on another card gives a different answer, and nearly broke the instrument.** On an RTX PRO 6000 Blackwell this racer wins 0 of 10 at every delay from 0 to 6 ms, delay 0 included. In observe mode it first sees the payload 210 microseconds after the launch has already returned. The reason is the poller: scanning a 4 KB page with `memmem` costs about 40 microseconds on that mapping, so a pass is wider than the whole window. Narrowing the poll to an eight byte compare at a known offset, same thread, same lack of privilege, wins 10 of 10 at delay 0. The sweep then reads:

| Delay before writing | Runs won on Blackwell, idle |
| --- | --- |
| 0 to 1,000 ns | 10 of 10 |
| 2,000 ns | 6 of 10 |
| 3,000 ns | 0 of 10 |
| 5 us to 6 ms | 0 of 10 at every step |

Reliable to 1 microsecond, half at 2, closed by 3. Against 1.4 ms on the Ada that is roughly a thousand times narrower, on the same driver branch and victim shape but not the same instrument: the Ada figure comes from the page scanning poller, the Blackwell figure from the eight byte compare that replaced it. The direction is not in doubt; the exact ratio awaits the narrow poller on the Ada. A window figure without the part it was measured on says very little.

**What widens it.** On the Ada, load from a second process: a saturating compute kernel takes the half point from about 1.8 ms to about 4 ms, and UVM migration widens it too, though less, to about 3 ms. Saturating PCIe in either direction does not widen it at all, so the window tracks SM occupancy rather than PCIe bandwidth.

On Blackwell the same dependence is far stronger, and it is the clearest sign that this is not a property of the part alone. Same card, same driver, same binary, 10 trials a row:

| Delay | Idle | Saturating compute | 30 CPU spinners, GPU idle |
| --- | --- | --- | --- |
| 1 us | 9 of 10 | 10 of 10 | 5 of 10 |
| 2 us | 6 of 10 | 10 of 10 | 5 of 10 |
| 3 us | 0 of 10 | 10 of 10 | 0 of 10 |
| 10 us | 1 of 10 | 10 of 10 | 0 of 10 |
| 50 us |     | 9 of 10 |     |
| 100 us |     | 0 of 10 |     |

A second process occupying the SMs moves the window from about 1 microsecond to about 50, twenty five to fifty times wider, on one machine. Saturating the CPUs instead makes it slightly worse than idle, which is the racer’s own thread losing the processor rather than the window moving. The per trial log in the repository covers the rows up to 10 us; the 50 and 100 us rows come from a follow up sweep recorded in the analysis notes. A serving process is not idle when it loads a module, so the busy column is the one closer to deployment, under the eager loading this sweep forces.

**What this is not.** We never established that a DMA copy is what consumes the bytes: the engine evidence is consistent with an engine side pull and does not prove one. What is measured is that the bytes in that buffer determine the code the GPU runs, and that the window closes before the launch is submitted.

## The practical threat model

**What is already known.** That the module image sits in host memory before the GPU takes it is not a new observation. [Mitigating Code Injection Attacks on Modern GPUs](https://adriaanjacobs.github.io/files/ccs26cudep.pdf) records it while building a device side defence, and [WarpGuard](https://arxiv.org/abs/2607.13640) names host memory kernel patching as a threat class and states that the GPU runtime verifies nothing about the image it dispatches. Both act before the API call. What is measured here is the window inside the call: how long the bytes stay writable after a verifier has already read them, and what that number depends on.

**The question.** Does this matter outside a test harness.

**Method.** A victim shaped like an inference server rather than a one shot test. It launches once per request, and it loads a tenant plugin through `dlopen` the way a real server loads a custom backend. There is no `LD_PRELOAD` in any row of the table below.

| Deployment shape | Result |
| --- | --- |
| Tenant plugin inside the serving process | 20 of 20 server starts fully tampered |
| Module loaded once, then served | 200 of 200 requests ran the attacker’s kernel |
| Module reloaded per request | 1 to 5 of 30 requests |
| Under CUDA MPS | 10 of 10 server starts fully tampered |
| Parent process racing its own child, ordinary user | 3 of 3 |
| Unrelated process, same user, `ptrace_scope` 1 | Refused, EPERM |
| Unrelated process, same user, `ptrace_scope` 0 | Write permitted, race not won here |

What follows from that.

**One won race at load time is permanent.** With the module loaded once and launched repeatedly, every launch ran the substituted kernel. Real servers load a model’s kernels at startup and serve for hours, so the startup window is the only one an attacker needs.

**Locating the bytes is the real constraint, not reaching them.** In a minimal victim the address repeats: five consecutive loads on Blackwell staged at the same page, `0x200835000`, with the same first writer. In a PyTorch process it does not. Ten loads gave ten different pages spread over about 4 MB, and the offset inside the page moves too. Searching is not an option either: the 40 microsecond page scan above is forty windows wide on an idle card. An attacker who has to look is already too late.

What makes it work anyway is a regularity we did not expect. Inside one process the staging address walks forward by a fixed stride, 10,240 bytes a load across four consecutive loads in our test. The stride is a property of the victim rather than of the card: 10,240 bytes in that one, 10,496 in the serving victim below and 12,288 in a bare load loop. So one observed load gives the address, and a tenant that has also measured the stride for its victim computes the rest. That is also the cheapest thing to take away: randomising the staging offset per load would cost the attacker the only regularity they have.

**In a PyTorch process, with the address supplied.** The victim is a serving process: torch produces a score per request and a compiled custom op makes a moderation decision, one comparison against a threshold that is an immediate in the SASS. The tenant is an imported package that rewrites that constant while the module stages, but it did not find the constant unaided: a capture library preloaded into the victim supplied the staging address, the stride came in as a parameter, and a tenant deriving both for itself is the step we have not measured. As built the gate blocks 3 of 6 requests; rewritten to be always false it blocks 0 of 6, in 4 runs of 5, and always true, 6 of 6, in 3 of 3. The source on disk and its hash are unchanged, the kernel keeps its name, the launch count is unchanged, and the model’s score is unchanged and still logged beside the verdict. Denial and bypass cost the same four bytes.

One thing that did not work is worth as much as the ones that did. The same tenant written in pure Python, `ctypes` onto libc with no compiled code of its own, polls about 930,000 times a second, which is roughly 1.07 microseconds a poll: about the whole idle window on that card, and twenty times inside the loaded one. It still won nothing in 15 runs. The attack needed a compiled poller. That is a low bar, since wheels ship compiled extensions routinely, but it is not the same claim as a malicious pure Python dependency.

The attacker also has to know what to look for: the racer compares against bytes from the kernel it means to replace, which is realistic for a published container image and not for a private model. CUDA MPS changes none of this: it moves the staging page and nothing else, and the `nvidia-cuda-mps-control` process we inspected holds 45 mappings and none of them a device, and the staging stays in each client’s own host address space.

**The boundary that holds is `ptrace_scope`, not anything in the GPU stack.** In the headline result above, a tenant plugin inside the serving process, it crosses nothing at all, and `ptrace_scope` governs only the cross process variant. It is post exploitation, and an attacker who already has a thread in the process has easier options, such as hooking `cuLaunchKernel`. What makes it worth measuring is that it happens **after** every inspection point, so a hash taken at the container or at the driver API still matches while different code executes. That is a limit on a class of control, not a vulnerability.

**The defensive reading, with the same constraint.** That window is the only point at which the code the GPU will actually run exists in host memory, at a predictable page, before the GPU takes the bytes and before the launch is submitted. Reachable is not the same as readable, though. Hashing what will run means enumerating the stream through that page rather than recognising a pattern in it, and our capture only samples it, as the 96,168 byte cubin in “The code lands in an ordinary page of host RAM” shows. The window is where a sensor would have to stand. Whether one can read it out from there is a measurement we have not made.

**What is still open.** Whether the staged code can be found by its structure rather than by a pattern known in advance. Inside the process a scanner needs no privilege; from outside it needs the access listed at the top of this post. Until that is measured this is a characterised window, not a tool for either side.

## What a host observer can actually know

The opacity is real, but not for the reason usually given. It is not that the kernel driver is closed: this is the open module, the default on current drivers, and it never sees the code. What parses the container, applies the selection, JITs and writes the staging buffer is libcuda, with the GSP firmware below it, and both are closed whichever flavour is installed. The part you can read never touches the code; the part that handles it you cannot read.

A host observer is not blind either. One module load on the A100 produces 789 ioctls at the driver entry, 185 UVM calls and 49 mmaps, and 457 and 465 on the two newer cards. It is content blind: none of them carries a byte of the code, and no traced driver function runs while the code lands.

So a hash taken at the container or at the driver API describes an input, not what ran, and the window above is the only place what ran can be described.

## What is still out of reach

Two stages stay out of reach. The resource manager to GSP hop is a source reading, descriptors only with the queue element capped at sixteen times its minimum size, 64 KB, and it is not traceable: only 935 of the module’s roughly 34,000 functions carry a call site and `kprobe_events` refuses the rest, which fits the resource manager shipping as the prebuilt `nv-kernel.o_binary` outside kbuild, though we did not establish that as the cause. The GSP to GPU stage is signed firmware and opaque.

Also open, and the right first test for Part 3: Confidential Computing on H100 or H200, where the stated guarantee is that the host cannot tamper with what the GPU executes. The question is whether the executed code ever appears in plaintext in memory the host can read.

## Reproduce

The kit, the containers and the raw results are in the repository below. Measure your own window before trusting any number here: ours moved by three orders of magnitude between two cards and by fifty times with machine state. One part does not re-run as shipped: the `fc_*` entry points the PyTorch rows depend on were reconstructed from the patches afterwards and have not been run against a GPU since. Seven of this post’s eight driver citations were re-derived automatically at tag 580.178.04 and the eighth resolved by hand.

Compare the address a working instrument patches before concluding anything from a miss. Twice, an instrument rather than the card produced the number we first measured: a watcher pinned to one offset lost every race on the Ada, because the page holds a second copy nothing reads, and a page scanning watcher measured no window at all on Blackwell.

## References

### This project

1.  [Part 1: the undocumented rules behind CUDA kernel selection](https://machinemodesecurity.ie/undocumented-cuda-kernel-selection/)
2.  [cuda-fatbin-precedence: the kit, the containers and the raw results](https://github.com/bechirBOUALI/cuda-fatbin-precedence)

### Driver source

1.  [nv.h: NV_ABSOLUTE_MAX_IOCTL_SIZE, the 16,384 byte ceiling](https://github.com/NVIDIA/open-gpu-kernel-modules/blob/580.178.04/kernel-open/common/inc/nv.h#L70)
2.  [nv.c: where that ceiling is checked, on the one escape that can exceed the \_IOC layout](https://github.com/NVIDIA/open-gpu-kernel-modules/blob/580.178.04/kernel-open/nvidia/nv.c#L2433)
3.  [nv_escape.h: the escape numbers counted in this post](https://github.com/NVIDIA/open-gpu-kernel-modules/blob/580.178.04/src/nvidia/arch/nvalloc/unix/include/nv_escape.h)
4.  [escape.c: the escape dispatch and its parameter copies](https://github.com/NVIDIA/open-gpu-kernel-modules/blob/580.178.04/src/nvidia/arch/nvalloc/unix/src/escape.c)
5.  [nv-mmap.c: how the staging mapping is set up](https://github.com/NVIDIA/open-gpu-kernel-modules/blob/580.178.04/kernel-open/nvidia/nv-mmap.c#L506)
6.  [message_queue_priv.h: the GSP queue element cap, sixteen times the minimum](https://github.com/NVIDIA/open-gpu-kernel-modules/blob/580.178.04/src/nvidia/inc/kernel/gpu/gsp/message_queue_priv.h#L92)

### NVIDIA documentation

1.  [NVIDIA: the open and proprietary kernel module flavours, and which GPUs each supports](https://download.nvidia.com/XFree86/Linux-x86_64/595.84/README/kernel_open.html)
2.  [NVIDIA: MPS architecture, where each Volta era client owns its own GPU address space](https://docs.nvidia.com/deploy/mps/latest/architecture.html)
3.  [NVIDIA: lazy loading, the default since CUDA 12.2 on Linux](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/lazy-loading.html)
