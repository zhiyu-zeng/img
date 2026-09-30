---
title: A revisit of remote Spectre attacks on Cloudflare Workers
source: https://blog.cloudflare.com/revisiting-spectre-attacks-on-workers/
source_host: blog.cloudflare.com
clip_date: 2026-09-30T10:32:07+08:00
trace_id: eeb6ff9b-a916-44e1-8e8a-41729d84fb5a
content_hash: 69fd00860229c727d2c36a37993a8b5d7566ac1b71fe14e169389ba13bb9739b
status: synced
tags:
  - 漏洞分析
  - 侧信道攻击
series: null
feed_source: Cloudflare·漏洞研究
ai_summary: Cloudflare 重测 Workers 上的远程 Spectre 攻击，在生产环境实现 12 bit/s、99% 准确率的跨租户比特级泄漏，并据此加固 DyPrIs、引入 V8 Sandbox 与 MPK 进程内隔离。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-8151-b366-decb1d224b8d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Cloudflare 重测 Workers 上的远程 Spectre 攻击，在生产环境实现 12 bit/s、99% 准确率的跨租户比特级泄漏，并据此加固 DyPrIs、引入 V8 Sandbox 与 MPK 进程内隔离。
> 
> - **攻击成果：** 2024 至 2025 年初在 Workers 生产环境（自控 Worker）完成端到端验证，最终按位泄漏受害者 Worker 中的 JWT，泄漏速率 12 bit/s、准确率 >99%，牺牲准确率还可更快。
> - **关键原语：** 用树形 PLRU 缓存替换策略放大单次缓存事件；按鸽笼原理分配远超缓存（如 64MB 对 256KB L2）的对象对做随机免驱逐测量；以 WebSocket 远程计时器跨越噪声获取亚毫秒分辨率。
> - **绕过平台限制：** `fetch` 受害者脚本即可让其被调度到同一进程；Durable Object 的 WebSocket 保活把单次调用延续 5–20 小时，突破 30 秒 CPU 与 1000 子请求限制；`/cdn-cgi/trace` 的 *fl* 值确认机器位置，并可挑非高峰机房提升稳定性。
> - **未被检测的原因：** DyPrIs 只在调用结束后隔离脚本，保活使泄漏早于隔离完成；且其把分支误预测按 iTLB 访问数归一化，WebSocket I/O 抬高 iTLB，使比率低于检测阈值。
> - **修复措施：** DyPrIs 改为把长时执行、I/O 密集负载作为一类安全场景；V8 Sandbox 消除大量原始 64 位指针（该 64 位泄漏 gadget 失效）；2025 年 9 月用 MPK 为同进程各 isolate 堆加硬件访问边界。三者均只收窄泄漏面而非完全缓解。

In 2021, we assessed [remote Spectre attacks](https://blog.cloudflare.com/spectre-research-with-tu-graz/) against Cloudflare Workers. Based on the results, we shipped a production defense called [Dynamic Process Isolation](https://blog.cloudflare.com/spectre-research-with-tu-graz/) (DyPrIs), which identifies maliciously looking scripts and isolates them into separate processes. Since then, newer techniques in the area of stabilizing Spectre attacks have been discovered. To understand if these techniques posed a threat to our Workers production environment, we decided to internally reassess the remote Spectre attack. Building an updated proof-of-concept on the production environment allowed us to empirically assess the risk of Spectre attacks under production workloads.

To mount a successful side-channel attack in production, an external attacker has to overcome additional obstacles such as activity on shared hardware resources, interrupts, context switches, and coarse-grained timers. Our research uncovered a limitation in the implementation of DyPrIs and we managed to demonstrate a remote Spectre attack reliably leaking up to 12 bit/s with a 99% accuracy in the production environment of Cloudflare Workers. As a consequence of this research, we improved DyPrIs, integrated the V8 Sandbox and [an in-process isolation mechanism](https://blog.cloudflare.com/safe-in-the-sandbox-security-hardening-for-cloudflare-workers/) to further reduce the risk of memory disclosure attacks.

Today we are [publishing a paper](https://arxiv.org/pdf/2608.17043) describing our findings, co-authored by Albert Pedersen, Haocheng Xiao, Sam Ainsworth, Nigel Topham, and Martin Schwarzl. This paper covers research done in 2024 and early 2025.

Note that the presented attack is mitigated already in the production system due to countermeasures applied by Cloudflare Workers Runtime team. We did not find any indicators of active exploitation over the last three years.

## Cloudflare Workers security model

Cloudflare Workers runs untrusted JavaScript on the edge. Leveraging language-level isolation, in the form of V8 isolates, tens of thousands of tenants can share the same operating-system process. Each Worker has its own separate JavaScript heap. This design keeps startup latency low and lets us run many tenants very efficiently compared to full process isolation. Around the runtime we have multiple layers of defense such as automated V8 patch pipelines, a two-layered sandbox consisting of Linux namespaces and seccomp filters, Cap’n Proto RPC, and the possibility to schedule certain scripts in separate process sandboxes. Still, a single arbitrary read vulnerability within a Worker process can lead to cross-tenant leakage. One vulnerability that is very hard to mitigate exploits the nature of speculative execution, namely in-process **Spectre**.

## Spectre

You can think of speculative execution in terms of hiking. At some point you arrive at a branch and have to predict where to go. If the prediction was correct, you saved some time and could enjoy the sun and a refreshing drink at a mountain hut. However, if you speculate in the wrong direction, you have to turn back. The trail looks untouched, but your footsteps remain in the mud.

Speculative execution in CPUs works similarly. The branch prediction performs an educated guess about a branch’s outcome ahead of time and the CPU speculatively executes it. If the prediction was correct, speculative execution saved some time. However, if the prediction is incorrect, the CPU has to discard the results, roll back and execute the other branch. Because these speculatively executed instructions only exist temporarily in the CPU pipeline and are never permanently retired or committed, the literature refers to them as transient instructions and generalizes the concept as transient execution.

However, due to the transient execution, there are still some traces left in the microarchitectural state for instance in CPU caches. Thus, an attacker can use Spectre to transiently access memory out of bounds, encode a single bit of information into the cache state and exploit the latency of reaccessing data to infer whether the bit was set or not.

To [mitigate against in-process Spectre attacks](https://blog.cloudflare.com/spectre-research-with-tu-graz/), Cloudflare Workers freezes local timers, disallows multithreading and shared memory and actively detects, periodically shuffles memory and isolates malicious-looking scripts into separate processes.

## Attack primitives

The Cloudflare Workers platform deliberately [restricts timers](https://blog.cloudflare.com/mitigating-spectre-and-other-security-threats-the-cloudflare-workers-security-model/). During CPU-only execution, time is effectively frozen. `Date.now()` and `performance.now()` do not provide a continuously advancing high-resolution clock. There is no shared memory and no multithreading, so the classic counter-thread timer via a `SharedArrayBuffer` is not available.

To successfully mount an attack, several challenges have to be solved. First, Workers runtime is limited and co-location between an attacker and victim has to be guaranteed. Second, a reliable, ideally co-located, remote timer has to be discovered, which allows stable timing measurements.  
Third, the attack runs under production conditions, meaning it requires additional stability measures such as a reliable Spectre gadget enabling transient 64-bit out-of-bounds accesses, robust signal amplification to deal with systems and networking noise, and a primitive to reliably evict data out of the cache.

### Spectre gadget

*Speculative type confusion Spectre gadget*

With the right Spectre gadget (snippet above), an attacker can transiently access out-of-bounds memory and encode a single bit into the cache (`probeArray`). The attacker then measures the memory access latency to confirm whether data has been cached or not. A faster access means the line was cached and the bit was 1. Conversely, a slower access means it was uncached and the bit was 0. In our attack, we use two different Spectre gadget types. The first one leaks compressed heap pointers, e.g., the isolate’s heap base address (root), and the other one leverages a speculative type confusion to leak from an arbitrary, attacker-crafted userspace 64-bit pointer. At the time of performing the research, the V8 Sandbox was not yet implemented at Cloudflare Workers. Under pointer compression, most objects use 32-bit compressed pointers. `TypedArray` was one of the few exceptions that still stored a raw 64-bit pointer to its backing store, which is exactly what our gadget abuses.

The branch `obj instanceof ObjP` performs a type check, i.e., a branch. To mistrain the branch prediction, we call the gadget many times on real `ObjP` instances, then call it on a different object with an attacker-controlled memory layout `ObjI`. The CPU speculates on the taken branches and follows `obj.ptr[0]`, even though the object has a different type. To leak a single bit, we mask out one bit and use it to select one of two `probeArray` lines. Whether that line is cached encodes the bit.

Exploiting the heap leakage gadget, we map neighboring objects and locate an attacker-controlled array. Our second gadget confuses two large objects that span several cache lines, so the type field lands on a different cache line than the field we read. Evicting the type field opens the speculation window while the target field stays cached, and the transient read follows an attacker-controlled 64-bit value. That turns the leak into an arbitrary-address read. A more thorough description of this technique can be found in the paper.

**Local demo of leaking an arbitrary 64-bit address.**

### Signal amplification

A cache hit and a cache miss differ by a few nanoseconds. Moreover, a remote timer is noisy at the scale of a few microseconds up to a few milliseconds. Therefore, some form of signal amplification is required to differentiate a cache hit from a miss. Stephen Röttger and Artur Janc discovered a way to [amplify a single memory access](https://security.googleblog.com/2021/03/a-spectre-proof-of-concept-for-spectre.html), by exploiting the tree-based pseudo least recently used (PLRU) cache-replacement policy in L1 caches. Tree-based PLRU organizes each cache set as a binary tree whose nodes point to the side used least recently, so the CPU evicts by following those pointers. With the right access pattern, an attacker can keep a target line cached indefinitely by touching its tree neighbor whenever the pointers turn toward the target. Quite elegant, right? Leveraging that behavior, the timing of a single cache event can be arbitrarily amplified such that it leads to a lot of L1 hits (faster) compared to lots of L1 misses in the opposite case.  
  
The figure below illustrates whether a memory address X is cached or not. If it’s not cached, the access pattern leads to a lot of cache hits. If it is present, it occupies one node in the tree, and subsequently four cache lines try to fit into three nodes, which results in a lot of L1 misses.

### Remote timer

As long as the signal can be amplified, a noisy remote timer is sufficient to differentiate an encoded bit. For instance, a WebSocket connection to an external server serving high-resolution timestamps is enough. The timer could be hosted at Cloudflare or at a co-located data center to the target data center running the Worker. The Worker asks the remote timer to mark a timestamp for a certain event and compute the delta for another request once the event has stopped.

In the paper, we evaluated several different timer setups and were able to reliably achieve sub-ms resolutions on the Median with only a handful of samples even over larger topological distances. The figure below shows an amplified cache event using the tree-based PLRU amplification.

### Repeatable measurements

A single measurement is not enough to differentiate timing-encoded data reliably. Production machines are noisy, thus an attacker has to repeat each measurement at least a few times and use some statistical discriminator. Repeating a measurement in our case means resetting the cache state. Two things have to be uncached before each round. The value the speculative branch depends on has to be evicted, so branch resolution stalls long enough to open a speculation window. The probe line that encodes the leaked bit has to be evicted, so the next transient access can re-cache it.

Since there is no direct instruction available in JavaScript, the classic way to do this is to build an eviction set. An eviction set is a group of addresses that map to the same cache set as the target. Accessing them in the right pattern pushes the target out of the cache. In their attack, Stephen Röttger and Artur Janc used an eviction list to reliably evict at least into the L2 cache. This works, but it is expensive. Constructing a precise eviction set requires many timed measurements, and our timer is a noisy remote timer. The previous remote attack against Workers sidestepped the search by traversing an array larger than the L1 and L2 caches on every round. That is an option, but even slower.

Dougall Johnson described a more elegant way in his really cool blog post on [portable JavaScript Spectre exploitation](https://dougallj.wordpress.com/2021/03/16/another-approach-to-portable-javascript-spectre-exploitation/). The idea follows directly from the pigeonhole principle. If you allocate far more data than the cache can hold, a randomly chosen cache line is almost certainly not cached. For a 256 KB L2 cache, allocating 64 MB leaves at most a **1/256** chance that a random cache line is still in L2. So instead of evicting a specific line, you never evict at all. You pick a fresh random location that is already evicted with overwhelming probability. The cool side effect of looping frequently over that array of objects is that this will lead to an auto-eviction effect.

To leverage this in JavaScript, we allocate a large pool of attacker and victim object pairs that exceeds the last-level cache. Each measurement round selects a fresh random pair. The object's map pointer, the hidden-class descriptor that the speculative type check reads, is therefore almost certainly already evicted.

### Co-locating the attacker and victim isolate

For the attack to work, both the attacker and victim isolate must be scheduled in the same process on the same edge server. One might intuitively think this would be difficult, considering Cloudflare operates tens of thousands of edge servers, but this is in fact quite trivial on Cloudflare Workers. Because Cloudflare Workers are designed to execute on any Cloudflare edge server, invoking the victim script from the attacker script with a `fetch(“https://victim.example”)` will in most cases cause the scheduler to spin up an instance of the victim worker in the exact same process. The victim isolate can be kept alive by repeatedly making subrequests to it at a certain interval.

What is more, because the attack stability is highly dependent on the CPU load of the edge server running the worker script, this allows an attacker to strategically run the attack in an off-peak colo (e.g. in an Australian colo during European business hours) where the traffic levels are comparatively low.

### Defeating isolate resource limits

The Cloudflare Workers runtime [enforces a set of limits](https://developers.cloudflare.com/workers/platform/limits/) on all isolates to protect the platform and prevent abuse. For the purposes of conducting this attack, the relevant limits were 30 seconds of CPU time and 1,000 subrequests per invocation. These limits have since been [increased](https://developers.cloudflare.com/workers/platform/limits/#account-plan-limits), but the following principles are still relevant.

For a regular Worker, each HTTP request, a fetch event, is a new invocation that resets these limits. The catch is landing sequential requests on the same edge server. Load balancing and shifting network conditions make that unreliable. Durable Objects solve it for us.

[Durable Objects](https://developers.cloudflare.com/durable-objects/) are built for real-time coordination between clients, so the runtime treats every incoming WebSocket message as an invocation that resets the CPU time and request limits. The attacker opens a persistent WebSocket to a Durable Object worker and sends regular keep-alive messages. This keeps a single isolate alive and gives us a persistent, bi-directional channel to run the attack over.

One quirk cost us some time. An isolate is single-threaded, so incoming WebSocket messages are only processed when the script hands control back to the event loop. During synchronous code the runtime never sees the keep-alive, so it never resets the CPU time. If the thread stays blocked for more than 30 seconds, the runtime kills the isolate. This puts an upper bound on how much we can amplify in a single synchronous burst. Yielding regularly between bursts lets us keep an isolate alive from five to more than 20 hours.

### Putting everything together

The previous attack relied mostly on repetition to amplify a single cache access, and therefore, was slowly leaking 120 bit/h. We combined tree-based PLRU amplification with measurement loops. Each iteration re-creates the cache state and thereby adds more timing difference. If an interrupt destroys the cache state in one iteration, it doesn’t matter, since later iterations cancel it out. This made the signal strong enough to classify bits with a remote WebSocket timer. The overall idea is now to combine.

We demonstrated the full end-to-end attack in the Cloudflare Workers production environment, against Workers we controlled. We first leaked memory from the attacker Worker. From there, we leaked data from a co-located victim Worker where we had intentionally placed a secret.

First, we established co-location between an attacker Worker, a victim Worker we owned, and a remote timer. Durable Objects gave us a long-lived execution context. WebSocket messages gave us a repeatable timing source. The `/cdn-cgi/trace` endpoint helped us confirm machine placement by looking at the *fl* value.

Second, we added a calibration step to probe the timer with speculatively reachable values. This step matters because production machines are noisy. Per-invocation calibration lets us classify bits from the relative difference between the zero and one distribution. This last test should lead to two clearly separable distributions.

As a first step, we leaked the isolate root from one Worker and in another Worker we used the speculative type confusion with 64-bit pointers to read from the isolate root.

As an intermediate step, we confirmed 64-bit leakage with the second gadget by reading memory from the vDSO region. The vDSO is a convenient target because it contains human-readable strings such as `gettimeofday`.

**Demo Video leaking data from the JavaScript heap**

Finally, we placed a JWT token in the victim Worker and leaked it bitwise. The first byte was the character e, represented as 0b01100101. The figure below shows the per-bit classification for that byte. To classify we use a two-sided test to test for both outcomes. Using a majority vote and a percentile-based threshold, we infer the bit. In production, we achieved a leakage rate of up to 12 bit/s with an accuracy of more than 99%. Note that higher leakage rates are possible with the cost of losing accuracy.

### Robustness

Depending on the time of the day, the utilization of a machine increases strongly. This slows down the attack since more data has to be sampled. Still, even with high CPU utilization, the attack is still feasible.

## Why was this not detected?

DyPrIs watches hardware performance counters and isolates a script into its own process once it looks like a Spectre attack. Two things kept the attack under the radar. First, DyPrIs isolates a script only after its invocation finishes, and the Durable Object keep-alive trick we used in the attack can run for a few hours up to a day. WebSocket keep-alive messages hold a single invocation open for hours, so the leak completes long before isolation would kick in. Second, DyPrIs normalizes branch mispredictions by the number of iTLB accesses. Our remote timer is one large I/O loop, and that WebSocket traffic inflates iTLB activity. The normalized ratio drops below the detection threshold, so the attack looks like an ordinary I/O-heavy Worker.

## What we changed

We focus on the three areas of continued V8 hardening, providing stronger in-process isolation, and improving detection.

### V8 sandbox

The V8 memory sandbox's final goal is to remove raw 64-bit pointers from large parts of the JavaScript heap, which reduces the usefulness of many memory-corruption primitives. It also makes the specific speculative type-confusion gadgets in this work harder to reuse, because typed-array backing stores no longer expose the same raw pointer structure.

The V8 sandbox is not a complete Spectre mitigation. While the presented 64-bit leak gadget does not work anymore, there might be other Spectre variants or gadgets exploitable to achieve arbitrary out-of-bounds memory accesses.

### Hardware-assisted in-process isolation

In September 2025, we deployed [in-process isolation](https://blog.cloudflare.com/safe-in-the-sandbox-security-hardening-for-cloudflare-workers/) for Workers using Memory Protection Keys (MPK). MPK lets a process divide memory into protection domains and switch access rights cheaply. Workers use it to protect each heap from being accessible to the other isolates within the same process.

This changes the Spectre risk model. Each isolate heap now sits behind a hardware-enforced access boundary. A memory access to a page protected with the wrong key is denied by hardware. This blocks the straightforward cross-isolate heap read that this work relied on.

Unfortunately, MPK is not a complete answer to remediate Spectre, but it strictly reduces the leakage surface. It has limits, including a finite number of hardware domains and the need to manage protection-key state carefully.

### Improved DyPrIs

We improved DyPrIs so that long-lived executions and I/O-heavy workloads are handled as first-class security cases. Detection cannot happen only after a script finishes. A Durable Object or a WebSocket-heavy Worker can run long enough that post-execution isolation arrives too late.

We are currently investigating whether remote timing behavior could be added as an additional dimension to DyPrIs. While we cannot eliminate remote communication with attacker-controlled infrastructure, the timing data reveals very interesting exfiltration bit patterns. The better approach is to treat repeated timer-like I/O around compute-heavy sections as part of the behavioral signal, not as background noise.

## Acknowledgments

We especially thank Haocheng Xiao from University of Edinburgh and his supervisors, Sam Ainsworth and Nigel Topham, for their contributions to the reliability of Spectre in JavaScript.

## Call for participation

We are always looking for high-quality submissions through our [Bug Bounty program](https://hackerone.com/cloudflare). Memory safety bugs in the runtime are high-value targets. You can find the [Fuzzilli integration for workerd](https://github.com/cloudflare/workerd/pull/4917) and the [workerd source code](https://github.com/cloudflare/workerd) on GitHub.
