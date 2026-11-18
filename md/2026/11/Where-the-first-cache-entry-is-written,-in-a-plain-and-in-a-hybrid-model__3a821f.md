---
title: Where the first cache entry is written, in a plain and in a hybrid model
source: https://sigreturn.com/blog/recovering-llm-prompts-from-vram/
source_host: sigreturn.com
clip_date: 2026-11-18T13:12:28+08:00
trace_id: b35c8584-7ae7-4c1e-a81d-ba03c240b0ac
content_hash: dce1b418499843fa0c1bbe4b6c884a478cb2e6e7233768b4a20a9a38ba1f726f
status: synced
tags:
  - Linux安全
  - 协议分析
series: null
feed_source: Sigreturn Labs·Apple internals
ai_summary: 即使本地模型零磁盘日志，只要推理进程仍存活且机器开着，取证者可让目标进程自己拷贝 VRAM 中 KV cache，从而逐 token 还原完整提示词（普通 Transformer 精确还原，混合架构仅部分还原）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41c75244-d011-815b-bfc4-e4bc0215874b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 即使本地模型零磁盘日志，只要推理进程仍存活且机器开着，取证者可让目标进程自己拷贝 VRAM 中 KV cache，从而逐 token 还原完整提示词（普通 Transformer 精确还原，混合架构仅部分还原）。
> 
> - **技术路线：** 四种读取 VRAM 的途径中三条被封死——驱动清空回收内存、Secure Boot 的内核 lockdown 禁止 BAR1/`/dev/mem` 映射、`/proc/pid/mem` 读 CUDA 指针返回误导性零页；唯一可行的是 root 下附加调试器，让进程在自身 CUDA 上下文内调用 `cuMemcpyDtoH` 自拷贝内存（3B 模型 8.5 MiB 冻结 0.16 秒）。
> - **还原原理：** 第一层注意力的 V 向量在 attention 混合前写入 cache，仅取决于该 token 本身；先用模型自身跑全词表（151,936 token，19 次共 2.5 秒冻结）建指纹表，再最近邻匹配即可逐 token 还原，Qwen2.5-3B 上 82/82 全部精确命中。
> - **混合架构弱点：** Qwen3.8-27B 每 4 个块才有 1 个注意力块，前三层 state-space 块先混入前文，导致精确率仅 44.6%–48.3%；数字最易存活（82%）、空白字符为 0%，密码如 `ZQX-2773DE77` 无法完整还原，且错误 token 无法由距离值区分。
> - **取证陷阱：** `sudo grep` 把搜索的秘密写进 `auth.log`，作者踩中三次；演示改用 `grep -f` 从 RAM 文件读模式。进程退出或断电即销毁证据（驱动同步清内存，实测 112ms kill + 116ms 重新分配后已干净），故扣押时必须先捕获再停服务。
> - **工程坑点：** 注入 `malloc` 会因持有分配器锁死锁，改用 `mmap`；CUDA 调用须在 libcuda 帧之外的线程执行；`cuMemGetAddressRange` 扫描是定位 cache 的关键（450 探测 1.7 秒），ggml 张量间有 384 字节填充，盲用理论步长会静默产生 NaN。

A local language model can be set up to leave nothing on disk. Ollama can be told to keep no history, its journal can be silenced, and the model answers from a GPU that nothing on the disk ever records. With an abliterated model, one whose ability to refuse has been removed, someone can have it write malware on their own computer without leaving a line anywhere an examiner usually looks.

This post is for forensic examiners and law enforcement. Everything a model reads goes through its KV cache, which holds one vector per token, and the KV cache sits in VRAM for as long as the model stays loaded. Those vectors can be turned back into the text of the prompt, even when nothing was logged on disk, as long as the machine is still on: token for token on a classic transformer, and only partly on the newer hybrid architectures. The work was done on my own machine, an RTX 3090, with a proof of concept I wrote for the purpose.

Danger

This is post-access forensics. Everything below needs root on the machine and a live inference process, and the goal is to help investigators recover evidence from a machine they are entitled to examine. The mechanisms are explained and the measurements given; the tooling is not published.

## Why a local model leaves nothing behind

Local models have become good enough to matter. Qwen3.8 27B runs at a usable speed on an RTX 3090, a card that costs around 800 dollars, and abliterated versions of the same weights are one download away. The technique behind them is public: refusal in a chat model is carried by a single direction in its activations, and removing that direction removes the refusals ([Arditi et al.](https://arxiv.org/abs/2406.11717)).

On the machine used here, the “no logs” setup is real and was in place before this work started. `OLLAMA_NOHISTORY=1` stops the interactive client from writing `~/.ollama/history`, and the Ollama service runs with its journal silenced. After a conversation, the canary I typed into the model was nowhere: not in the inference server’s log, not in 24 hours of `journalctl`, not in any file modified within two hours.

Today the practical value of recovering such a prompt is limited. As local models get more capable, though, I expect malicious actors to use them more and more, and investigators need to be able to handle those cases before they become common.

## The demo

Here is the whole thing on `qwen2.5:3b`, filmed in one take. The model is profiled once beforehand, off camera (more on that below), and the canary is a random string kept in a file under `/dev/shm`, which is RAM.

The same session, step by step, as text you can copy.

First the “victim” talks to the model, through Ollama’s normal interactive client:

```
adam@demo:/tmp/$ ollama run qwen2.5:3b
>>> My wallet key is ZQX-DBAC3316 and my PIN is 4417. Just answer OK.
OK

>>> /bye
```

Then we look for a trace on the disk. The history is empty, Ollama’s journal has no entries for the day, and a root `grep` finds the canary in no file under `/var/log` or `~/.ollama`:

```typescript
adam@demo:/tmp/$ cat ~/.ollama/history
adam@demo:/tmp/$ journalctl -u ollama --since today --no-pager
-- No entries --
adam@demo:/tmp/$ sudo grep -rlFf /dev/shm/canary /var/log ~/.ollama 2>/dev/null
adam@demo:/tmp/$
```

`grep -f` reads its pattern from the file, so the canary never appears on a command line. That detail matters, and the section on traces explains why.

Then the recovery. This is the complete output of that run:

```
adam@demo:/tmp/$ sudo python3 recover.py --profile profiles/qwen2.5_3b.json --secret-file /dev/shm/canary

##########################################################################
# gpu-forensics :: prompt recovery from kv-cache residue
##########################################################################

[*] target
    gpu .......... NVIDIA GeForce RTX 3090 / 24576 MiB / drv 595.84
    lockdown ..... integrity  (bar1 mmap + /dev/mem denied, even as root)
    runner ....... llama-server[209934]  qwen2.5:3b
    kv ........... 32768 ctx x 256 dim, q8_0

[*] sweeping device allocations via cuMemGetAddressRange
      0x730cf0000000     1834.8 MiB
      0x730d94000000       80.1 MiB
      0x730d9a000000      217.1 MiB
      0x730dae000000      612.0 MiB   <-- kv cache
    swept ........ 4 allocs, 450 probes, 1.7s
[+] kv cache @ 0x730dae000000  72 tensors  stride 8913280 (+384 pad)

[*] injecting into pid 209934
    thread ....... 1 (lwp 209934) @ __syscall_cancel_arch   [outside libcuda]
    mmap ......... 0x730e02f7f000  8912896 B
    cuMemcpyDtoH . 0 (CUDA_SUCCESS)
[+] 8.5 MiB @ 2911 MB/s   target frozen 0.16s

[*] raw bytes @ 0x730dae880180  (position 0)
    730dae880180  ba 1e 2d a3 d3 1e 65 f1 2f 5e b2 08 43 eb 05 95  |..-...e./^..C...|
    730dae880190  34 19 7f e3 e6 f5 5e 13 fd 3e ca 1a 71 21 9f e9  |4.....^..>..q!..|
    730dae8801a0  c9 1f 95 1e 26 ab dd 1d 1c e8 ed 31 ba 31 08 a6  |....&......1.1..|
    blk[0] d=0.006569
          q  =  +45  -93  -45  +30 +101  -15  +47  +94 ...
          ->    +0.296  -0.611  -0.296  +0.197  +0.663  -0.099  +0.309  +0.617 ...

[*] nn search : 58 vectors x 151936 fingerprints (256d)
     pos     tok       d2       2nd    margin  piece
       0  151644   0.0000    151658       4.9  <|im_start|>
       1    8948   0.0000      2320       5.7  system
       2     198   0.0000       271       4.3  \n
       3    2610   0.0000      1446       2.4  You
       4     525   0.0000       374       8.8   are
       5    1207   0.0000        48       3.3   Q
       6   16948   0.0000     37357      14.6  wen
       7      11   0.0000      3837       3.8  ,
       8    3465   0.0000      7120       6.4   created
       9     553   0.0000      3216       6.7   by
      10   54364   0.0000     28260      19.9   Alibaba
      11   14817   0.0000     16055       2.9   Cloud
    ... 46 more
[+] 58/58 unambiguous in 0.64s

---- recovered ----
<|im_start|>system
You are Qwen, created by Alibaba Cloud. You are a helpful assistant.<|im_end|>
<|im_start|>user
My wallet key is ZQX-DBAC3316 and my PIN is 4417. Just answer OK.<|im_end|>
<|im_start|>assistant
OK
-------------------

[+] canary ZQX-DBAC3316 recovered from vram
```

The whole context comes back, including things the user never typed: the chat template’s control tokens, Ollama’s default system prompt for Qwen, and the model’s own answer. All 58 positions match a token at distance zero with a clear margin over the runner-up, and the search takes 0.64 s. The copy out of the GPU is 8.5 MiB, and the inference server is frozen for 0.16 s while it happens.

Note the cache type on the `kv` line: `q8_0`, 8-bit quantized, which is what the Ollama runner uses in production here. The addresses, the PID and the raw bytes belong to that run and change every time.

The rest of the post is how each block of that output works.

## Four ways into VRAM, one that works

The prompt lives in GPU memory owned by another process. There are four obvious ways to read it, and I measured all four on this box: Ubuntu 26.04, kernel 7.0, Secure Boot on, driver 595.84, CUDA 13.2.

| Path | Result | Why |
| --- | --- | --- |
| Unprivileged leftovers in freshly allocated VRAM | closed | the driver clears memory before handing it out |
| Mapping VRAM through the PCIe BAR1 window | closed | kernel lockdown, enforced by Secure Boot |
| `/proc/<pid>/mem` on a CUDA pointer | misleading | returns zeros |
| Making the target process copy its own memory | open | the owning process can always read it |

The first path is the classic GPU leak: allocate memory without initialising it and read what the previous owner left. [Lee et al.](https://doi.org/10.1109/SP.2014.9) used it in 2014 to recover browser pages, and [LeftoverLocals](https://blog.trailofbits.com/2024/01/16/leftoverlocals-listening-to-llm-responses-through-leaked-gpu-local-memory/) did the same with LLM output on Apple, AMD, Qualcomm and Imagination GPUs in 2024. It does not work on this NVIDIA driver. A process that grabs all free VRAM reads back 24.7 GB with not one non-zero byte, whether the previous process exited cleanly or was killed with `SIGKILL` and its memory reallocated 228 ms later. I measured the race rather than assume it: the kill takes 112 ms and the reallocation of 23,552 MiB another 116 ms, and the memory is already clean. The scrubbing looks synchronous with the allocation, so a faster attacker would gain nothing.

The second path looked open. The card exposes a 32 GiB resizable BAR, more than its 24 GiB of VRAM, and this kernel is not built with `CONFIG_IO_STRICT_DEVMEM`. The first `mmap` of the PCI resource answers:

```
Lockdown: python3: direct PCI access is restricted; see man kernel_lockdown.7
```

With Secure Boot on, the kernel runs in [lockdown](https://man7.org/linux/man-pages/man7/kernel_lockdown.7.html) mode `integrity`, which denies mapping PCI resources and `/dev/mem` to every process, root included. Secure Boot is usually discussed as a boot protection; here it also closes direct hardware access to someone who is already root.

The third path is the dangerous one, because it seems to work. `cudaMalloc` returns an address that is valid in the process’s address space, so reading it through `/proc/<pid>/mem` succeeds. The mapping behind it, though, is an anonymous reservation with no access rights and no backing, and the kernel serves the read with fresh zero pages. An examiner who stops here concludes that the VRAM is empty, and nothing in the output says otherwise. The read also creates host pages inside a range the driver reserved for itself.

That leaves the process that owns the memory. Only the process that holds a CUDA context can translate one of its device addresses, so the copy has to happen inside it. As root, we attach a debugger to the inference server and have it call `cuMemcpyDtoH`, the CUDA driver function that copies device memory to the host, inside its own context. The copy lands in a buffer mapped in the target, and the target is released before we read that buffer. On the production runner this captured 3.42 GB of KV cache at 2,900 MB/s, for 1.98 s of total freeze, and the service kept answering afterwards.

Three things killed the target while I built this, each one for real. An injected `malloc` deadlocked, because the debugger stops all 55 threads of the server and one of them can hold the allocator’s lock, so the buffer is obtained with `mmap`, a system call that takes no userland lock. On a busy server, the thread the debugger lands on is often stopped inside `libcuda.so` itself, and asking it for a CUDA call means asking for a lock it already holds; the call has to run on a thread whose current frame is outside the driver, which is the `[outside libcuda]` in the demo output. And the CUDA context is per thread, so another thread does not hang but fails with error 201, an invalid context. None of the three showed up on a small test target. They came back only against a real 55-thread server.

## Finding the KV cache

Next question: where is the cache? The usual answer is `/proc/<pid>/maps`, and it is not enough. CUDA reservations often appear there as anonymous mappings, but on the Ollama runner 4.5 GB out of 21.9 GB have no mapping at all, and the KV cache was part of those 4.5 GB.

The primitive that works is `cuMemGetAddressRange`. Given any address, it returns the exact bounds of the device allocation that contains it, and it reads the driver’s own tables without touching memory. Sweeping the address space and jumping over each allocation found accounts for 21,828 MiB of the 21,932 MiB `nvidia-smi` reports, in 501 probes on the Ollama runner. On the 3B demo it took 450 probes and 1.7 s. Checking an address before copying from it also matters for the target’s health: a blind copy at something that is not device memory raises a signal inside the server and can wedge it.

Inside the allocation, the cache is a set of tensors, one K and one V per attention layer. On the 3B that is 72 tensors for 36 layers, and the allocation is 641,756,160 bytes. Divide by 72 and you get the wrong stride, because ggml, the tensor library under llama.cpp and Ollama, leaves 384 bytes of padding after each tensor, which is the `(+384 pad)` in the output. Reading at the theoretical stride shifts every block, produces absurd scales for the quantized values, and fills the result with NaNs, without raising any error.

## Why the KV cache gives the prompt back

A prompt does not exist as text in VRAM. `strings` on a dump finds nothing, and the token IDs themselves live in a 2 KB input buffer that the next batch overwrites. The KV cache, on the other hand, holds one vector per token for every token still in the context, and on a classic transformer those vectors can be inverted.

The reason is in the first attention layer. Its V vector is a linear projection of the normalised embedding of the token at that position. No attention has run yet, so nothing from the other positions has been mixed in, and the rotary position encoding (RoPE) is applied to K, not to V. That vector depends on the token’s identity and on nothing else: not its position, not the surrounding text. It works as a fingerprint.

Where the first cache entry is written, in a plain and in a hybrid model Two columns. On the left, a plain transformer: the token’s embedding goes straight into the first attention layer, whose V vector is written to the cache. That vector depends on the token alone, so it can be matched back to the token. On the right, a hybrid model: the embedding first goes through three state-space blocks, which mix in everything that came earlier in the context, and only then reaches the first attention layer. The V vector written to the cache now depends on the context, and matching it back to a token is only approximate. Plain transformer Qwen2.5-3B Hybrid Qwen3.8-27B Token embedding Token embedding 3 state-space blocks mix in every earlier token First attention layer V written to the cache First attention layer V written to the cache depends on the token alone exact match, token for token depends on the context approximate match

I checked this experimentally rather than trusting the derivation. Feed the model the same token 100 times: exactly one of the 72 cache tensors is identical at every position. In every other tensor the values move, K because of RoPE, and V from the second layer on because attention has started mixing positions.

Matching a cached vector back to a token needs a table: the fingerprint of every token in the vocabulary. Building it does not require reading the weights or dequantizing a single matrix. We push the whole vocabulary through the model itself and read the fingerprints out of its own KV cache. That only takes the ability to submit token IDs, which the llama.cpp API inside Ollama’s runner accepts, without authentication, on localhost. For the 3B, the table covers all 151,936 tokens with 256 values each, and it was built in 19 passes for 2.5 s of total freeze, with no empty entry. It is the off-camera step of the demo, and it does not depend on the victim’s prompt: it is what an examiner does once per model they find on a machine. The table carries over to any other instance of the same model. The demo’s profile was built through the same `q8_0` runner, so each fingerprint is the very vector the cache stores, and the distances come out at zero.

The search itself is a nearest-neighbour lookup. For each position, the cached vector is compared against the 151,936 fingerprints, and the output gives the winner, its distance, the runner-up and the margin between them. One trap there: the fast form of the distance drops a term that is constant for a given position, which makes the raw value negative, and a display that clamps negatives at zero prints a reassuring `0.0000` for every position, right or wrong. The demo’s distances include that term again, so its zeros are real.

## Exact recovery on a plain transformer

On Qwen2.5-3B the recovery is exact. The first measurement used `llama-server` directly, with a 16-bit (f16) cache, and an 82-token note in French full of codes:

```
Note confidentielle. Code secret: LICORNE-BLEUE-8430B108DE. Le code du portail
est 4417, la carte de Sabina finit par 8823 et son code est 9160. Rendez-vous
notaire mardi 14h pour la succession. Reponds uniquement OK.
```

Rebuilt from the VRAM capture alone:

```
Note confidentielle. Code secret: LICORNE-BLEUE-8430B108DE. Le code du portail
est 4417, la carte de Sabina finit par 8823 et son code est 9160. Rendez-vous
notaire mardi 14h pour la succession. Reponds uniquement OK. OK
```

That is 82 tokens out of 82, no ambiguous position, plus the model’s answer at the end. A control prompt made of one token repeated 100 times also came back 100 out of 100. Through Ollama, with the 8-bit `q8_0` cache it uses in production, the same pipeline recovered every position without ambiguity, system template and answer included, and the filmed run above is that configuration.

## A hybrid model gives back only part of it

The model this machine serves day to day is Qwen3.8-27B, through the same Ollama runner: 96k tokens of context, a `q8_0` cache, flash attention, multi-token prediction. Its cache is 3,422,552,064 bytes, which works out exactly to 16 attention layers. The model has 65 blocks. The GGUF header explains the gap:

```
qwen35.block_count               65
qwen35.full_attention_interval   4
qwen35.ssm.state_size            128
qwen35.ssm.conv_kernel           4
qwen35.ssm.inner_size            6144
qwen35.attention.head_count_kv   4
```

One block in four is full attention. The other 49 are state-space blocks, which keep no KV cache at all. A state-space block is recurrent: its output at a position is computed from a running state accumulated over every earlier position. Three of them sit before the first attention layer, so by the time a token reaches it, the whole prefix has already been mixed into its hidden state. The V vector written to the cache now depends on the context, and the property that made inversion exact is gone before the first cache entry is written.

The repeated-token test shows it. On the 3B, the best tensor varies by 0% across 100 copies of the same token. On the 27B, the best one still varies by 66%, and it is the same tensor, 29 of 32, on runs 11 days apart.

Recovery still produces something. Across runs, between 44.6% and 48.3% of the prompt tokens come back exact. On the run detailed here, a 75-token prompt, 29 of the 65 aligned prompt tokens were exact, and the errors are not spread evenly:

| Token class | Count | Exact | Rate |
| --- | --- | --- | --- |
| digits and hex | 17  | 14  | **82%** |
| ASCII words | 35  | 14  | 40% |
| punctuation | 9   | 1   | 11% |
| whitespace | 4   | 0   | 0%  |

The original read `Vault code: NARWHAL-GREEN-7F31C0. The gate PIN is 4417, Sabina card ends 8823 and her code is 9160. Notary appointment Tuesday 2pm`. An excerpt of what came back:

```
Conf confidential note <|endoftext|> Vault code ... N nar nhã -G _GREEN ...
7F3 ... C0 vault ... gate PIN ... 4417 gate Sab Sabrina card ends ... 8823
... her code ... 916 ... Not appointment Tuesday ... estate Answer OK
```

`4417` and `8823` are exact, `9160` comes back as `916`, and the vault code comes back in pieces, `N`, `nar`, `-G`, `_GREEN`, `7F3`, `C0`, each one right and the assembly wrong. Why do digits survive better than words? Context shifts a fingerprint by a roughly fixed relative amount, and whether that lands on another token depends on how many tokens sit close by. A digit has almost no neighbours in a multilingual vocabulary of 248,320 tokens. A common word is surrounded by its own inflections and its translations, which is how `Sabina` became `Sabrina` and `card` became `카드`: the error lands on a related word, often in another language.

It is tempting to conclude that secrets survive. They do not. On another run, the secret `ZQX-2773DE77`, aligned against the truth, came back as `ZQX?2?73DE7?`: 9 characters of 12 right and in place, 3 wrong, and the string itself is not recoverable from the output. I first made the mistake of reading the wrong tokens for their meaning. Two of them were `二十七` (27) and `七七` (77), and each had replaced a single `7`; substituting them gives `ZQX-22773DE777`, which is longer than the secret. The neighbour is close in meaning, not in position.

On that run, the three wrong tokens inside the secret happened to be non-ASCII, so they stood out in a hex string and narrowed the unknowns to three positions. That is an observation on one run, not a rule. At position 24, a `.` came back as `PIN`, and nothing flags that error. The distances do not help either: the median is 4,665 on correct tokens and 4,763 on wrong ones, and every one of the 100 positions had a clear winner. The method cannot tell you which half of its output to trust.

So a hybrid architecture makes this kind of recovery much weaker, and nobody designed it to. The meaning of a prompt still reads; a password or a key does not come back exactly. Two leads are unexplored: refining the result iteratively, and the recurrent state of the state-space blocks, a fixed-size summary of the whole prefix that I never examined.

## The only trace was mine

On this machine the canary appears in no log and no file. While building the demo, exactly one trace turned up, and the measuring tool wrote it. `sudo` records its full command line in `/var/log/auth.log`, so my own `sudo grep` for the secret had written the secret into the log I was searching. It happened three times before I understood it. Hence `grep -f` and `--secret-file` in the demo: both read the pattern from a file in RAM. Measured with `-f`, `auth.log` holds no match; with the pattern on the command line, it holds two.

It is a small trap with a general point for anyone examining a live machine: every command typed as root can end up in a log, including the search for the evidence.

## The limits

This needs root. Attaching a debugger to another user’s process requires it, so this is forensics on a machine you already control, not a privilege escalation.

The inference process has to be alive. Once it exits, or is killed, the driver has cleared its memory, as the first section measured. Pulling the power cord or stopping the service destroys the evidence; capture comes first.

The cache only holds what has not been overwritten. A new conversation, or a context shift on a long one, replaces positions.

And the recovery is exact only on a plain transformer. On a hybrid model, it is partial in the way described above.

## Where this leaves us

A local model that logs nothing still holds its whole context in VRAM while it runs. The only way in, on a current NVIDIA driver with Secure Boot, is to make the inference process copy its own memory, and the copy costs it a fraction of a second. From there, the first layer’s V vectors identify each token, and a table built from the model itself turns them back into text: on Qwen2.5-3B, every token of the prompt, Ollama’s hidden system prompt and the model’s answer, in under a second.

The second result matters as much as the first. A hybrid architecture like Qwen3.8 mixes the context before anything is cached, and recovery falls to under half the tokens, enough to read what the prompt was about and not enough to bring back a secret. For an investigator, the practical point is simple: a machine running a local model is evidence while the model is loaded, and the order of operations at seizure decides whether that evidence exists.

## Notes and sources

Everything here comes from measurements on my own machine (RTX 3090, driver 595.84, Ubuntu 26.04 with Secure Boot), using a proof of concept written for this work, and from the public sources below.

-   [Lee, Kim, Kim and Kim, “Stealing Webpages Rendered on Your Browser by Exploiting GPU Vulnerabilities”, IEEE S&P 2014](https://doi.org/10.1109/SP.2014.9): the original uninitialised GPU memory leak, which the driver tested here no longer allows.
-   [Trail of Bits, “LeftoverLocals: Listening to LLM responses through leaked GPU local memory”](https://blog.trailofbits.com/2024/01/16/leftoverlocals-listening-to-llm-responses-through-leaked-gpu-local-memory/): the 2024 leak of LLM output through GPU local memory on Apple, AMD, Qualcomm and Imagination hardware.
-   [Arditi et al., “Refusal in Language Models Is Mediated by a Single Direction”](https://arxiv.org/abs/2406.11717): the result behind abliterated models.
-   [kernel_lockdown(7)](https://man7.org/linux/man-pages/man7/kernel_lockdown.7.html): what lockdown mode `integrity` denies, including PCI resource mapping and `/dev/mem`.
-   [CUDA Driver API, memory management](https://docs.nvidia.com/cuda/cuda-driver-api/group__CUDA__MEM.html): `cuMemGetAddressRange` and `cuMemcpyDtoH`.
