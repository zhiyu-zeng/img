---
title: "VESQER: DPCM+RLE Hybrid Shellcode Compression in x64 Assembly | C2 Payload Size Reduction & OPSEC | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/compressdpcm-rle/
source_host: netacoding.com
clip_date: 2026-10-01T10:17:40+08:00
trace_id: d91b0ebe-7ac2-4344-a4b7-51cb4b376e13
content_hash: e04101c863f4cfcb3841b2f36e0838a647033b0c06bb9149ac9539b5a0d8ee5f
status: synced
tags:
  - 网络工具
  - 恶意样本
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 纯 x64 汇编实现的 DPCM+RLE 混合压缩器，用约 100 条指令把 C2 回传数据缩小 40-60%，换来更少的 ICMP 包和更难被指纹识别的载荷。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8168-bb12-cdd354f2d708
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 纯 x64 汇编实现的 DPCM+RLE 混合压缩器，用约 100 条指令把 C2 回传数据缩小 40-60%，换来更少的 ICMP 包和更难被指纹识别的载荷。
> 
> - **核心算法：** 先对相邻字节做差分（DPCM），再对重复的差分值做游程编码（RLE），格式仅由「1 字节锚点 + (计数, 增量) 对」串成，无魔术字节、无头、无字典。
> - **汇编约束：** 仅用寄存器（RSI/RDI/RCX/R8B/R9B/AL/BL/DL），无堆分配、无栈帧；匹配命中时热路径每字节 8 条指令，计数超 255 时触发 mini-flush 写 `(255, delta)` 并保留当前增量。
> - **解压极简：** 约 15 条指令，靠 `add bl, al` 累加增量重建数据，因此 `(3,+1)` 能还原出 ABCD 序列。
> - **压缩率实测：** 日志约 40-55%、数据库导出约 30-45% 缩减；随机/加密数据反而膨胀 50-80%（熵定理决定），明显弱于 gzip/LZ4/zstd，胜在零内存开销与极小代码体积。
> - **C2 集成：** 位于 `命令输出 → VESQER 压缩 → Rolling XOR → ICMP 分片` 管道中，`ls -la` 输出从 9 个包降到 5 个，压缩后的高熵再叠 XOR 使 DPI 无法识别结构。

## The Origin Story

At 5 AM, while brainstorming ways to minimize the wire footprint of a custom ICMP-based C2 agent, an idea hit me: *“What if I just store the first byte, calculate the difference to the next one, and count how many times that same difference repeats?”*

The logic was dead simple. No dictionaries, no Huffman trees, no frequency tables — just subtraction and counting. Two primitive operations that could fit in a handful of x64 instructions.

I felt like a genius… until I realized I had just accidentally reinvented **Differential Pulse-Code Modulation (DPCM) combined with Run-Length Encoding (RLE)**— techniques formalized by telecom engineers in the 1950s-1970s.

But here’s the thing: writing it completely from scratch in **pure x86-64 Assembly**, with zero libc, zero dependencies, and under 200 instructions — that part was entirely new. And it works *beautifully* for its intended purpose.

## The Problem: Why Compress C2 Traffic?

In a covert channel scenario, every byte matters. Consider a typical `ls -la /root` output: ~450 bytes. Over ICMP with 56-byte chunk fragmentation, that’s **9 packets** on the wire. Each packet is a detection opportunity — a chance for an IDS to correlate, flag, and alert.

Now compress that 450 bytes down to ~250 bytes. You just dropped to **5 packets**. Fewer packets means less traffic, smaller timing windows, and a reduced statistical footprint. The math is simple: **less wire time = less detection surface**.

But the compressor itself must be tiny. In a PIC (Position Independent Code) shellcode context, you can’t afford to drag in zlib or LZ4. You need something that compiles to a few dozen instructions and requires zero heap allocation.

## The Algorithm: DPCM + RLE Hybrid

The VESQER algorithm operates in two conceptual layers that execute in a single pass:

**Layer 1 — Delta Encoding (DPCM):** Instead of storing raw byte values, we store the *difference* (delta) between consecutive bytes. If the input is `A B C D` (ASCII 65, 66, 67, 68), the deltas are all `+1`. This transforms sequential patterns into repetitive values.

**Layer 2 — Run-Length Encoding (RLE):** Once the deltas are calculated, identical consecutive deltas are collapsed into a single `(count, delta)` pair. Those four bytes `A B C D` become: `Anchor: A` + `(3, +1)` — just 3 bytes instead of 4.

The real power appears with longer sequences. `ABCDEFGHIJ` (10 bytes) becomes `A` + `(9, +1)` — only 3 bytes. That’s a **70% reduction** from two simple operations.

### The Compression Format

The output binary format is minimal and signature-free:

```css
[Anchor Byte] [Count₁] [Delta₁] [Count₂] [Delta₂] ... [CountN] [DeltaN]
```

-   **Anchor (1 byte):** The literal first byte of the input. This is the reference point for the entire stream.
-   **Count (1 byte, unsigned):** How many times to apply the associated delta. Range: 0–255.
-   **Delta (1 byte, signed via two’s complement):** The difference to add for each step. Range: -128 to +127.

No magic bytes. No headers. No metadata. Just raw compressed data — exactly what you want when avoiding static signatures.

## Walk-Through: How It Actually Works

Let’s trace the algorithm with a concrete example. Given the input string:

```
"AABCDFFF333A"  (12 bytes)
```

**Step 1 — Anchor Setup:** Read the first byte `A` (0x41) and write it directly to the output. This is our anchor — the starting reference point. The compressor now peeks at the second byte `A` and calculates the initial delta: `0x41 - 0x41 = 0`. Active Delta is set to `0`.

**Step 2 — Main Compression Loop:** The compressor walks through the remaining bytes. For each byte, it calculates `current - previous` and compares it to the Active Delta:

| Position | Char | Value | Previous | Delta | Active Delta | Match? | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1   | A   | 0x41 | A (0x41) | 0   | 0   | ✅   | Count++ → 1 |
| 2   | B   | 0x42 | A (0x41) | +1  | 0   | ❌   | **FLUSH** (1, 0) → New delta: +1 |
| 3   | C   | 0x43 | B (0x42) | +1  | +1  | ✅   | Count++ → 2 |
| 4   | D   | 0x44 | C (0x43) | +1  | +1  | ✅   | Count++ → 3 |
| 5   | F   | 0x46 | D (0x44) | +2  | +1  | ❌   | **FLUSH** (3, +1) → New delta: +2 |
| 6   | F   | 0x46 | F (0x46) | 0   | +2  | ❌   | **FLUSH** (1, +2) → New delta: 0 |
| 7   | F   | 0x46 | F (0x46) | 0   | 0   | ✅   | Count++ → 2 |
| 8   | 3   | 0x33 | F (0x46) | \-19 | 0   | ❌   | **FLUSH** (2, 0) → New delta: -19 |
| 9   | 3   | 0x33 | 3 (0x33) | 0   | \-19 | ❌   | **FLUSH** (1, -19) → New delta: 0 |
| 10  | 3   | 0x33 | 3 (0x33) | 0   | 0   | ✅   | Count++ → 2 |
| 11  | A   | 0x41 | 3 (0x33) | +14 | 0   | ❌   | **FLUSH** (2, 0) → New delta: +14 |
| —   | EOF | —   | —   | —   | —   | —   | **FINAL FLUSH** (1, +14) |

**Compressed Output:**

```css
[0x41] [01,00] [03,01] [01,02] [02,00] [01,ED] [02,00] [01,0E]
  A     1×(0)  3×(+1)  1×(+2)  2×(0)  1×(-19) 2×(0)   1×(+14)
```

Result: **15 bytes** from 12. In this particular short example, the overhead of frequent delta changes actually *expands* the data. This is expected — the algorithm’s strength is with longer, more predictable sequences.

### Where It Dominates

Consider a typical log line repeated across thousands of entries:

```
"192.168.1.96  - - [10/Apr/2026:05:38:27 +0000] "GET /index.html..."
```

The spaces, repeated digits, sequential timestamps, and identical structural characters create long delta runs. A 1KB log block can easily compress to 400-500 bytes — a **50-60% reduction** with zero dictionary overhead.

## The x64 Assembly Implementation

### Register Architecture

The compressor is designed for maximum register economy — critical for shellcode deployments where every byte of machine code counts:

```java
RSI  →  Source pointer (raw input data)
RDI  →  Destination pointer (compressed output)
RCX  →  Remaining bytes counter (loop control)
R8B  →  RLE Count (0–255, single-byte register)
R9B  →  Active Delta (current difference being tracked)
AL   →  Working register (current byte / delta calculation)
BL   →  Previous byte value (the "anchor" for delta math)
DL   →  Temporary save register (preserves current byte)
```

No heap. No stack frames. No memory allocation. Everything lives in registers during the hot loop.

### The Compressor Core

The heart of the algorithm — the main loop — is remarkably compact:

```nasm
_compress_loop:
    test rcx, rcx
    jz _end
    mov al, byte[rsi]       ; Read current byte
    mov dl, al              ; Save it (we'll need the original)
    sub al, bl              ; Calculate delta: current - previous
    cmp al, r9b             ; Does it match our Active Delta?
    jne _flush              ; No → flush the current run

_inc_r8b:
    inc r8b                 ; Yes → extend the run
    inc rsi                 ; Advance source pointer
    dec rcx                 ; Decrement remaining counter
    jz _end                 ; If zero → final flush and exit
    mov bl, dl              ; Update "previous" byte
    cmp r8b, 255            ; Overflow guard (max 1-byte count)
    jne _compress_loop      ; Continue scanning
```

The hot path — when deltas match — executes in just **8 instructions per byte**. No branches taken, no memory writes, pure register operations. Branch prediction loves this because `jne _flush` is “not taken” for the majority of iterations in sequential data.

### The Flush Mechanism

When a delta mismatch occurs, the current run is written to the output and a new sequence begins:

```nasm
_flush:
    mov byte [rdi], r8b     ; Write RLE count to output
    inc rdi
    mov byte [rdi], r9b     ; Write Active Delta to output
    inc rdi

    ; Start tracking the new sequence
    mov r9b, al             ; New Active Delta = the mismatched delta
    mov r8b, 1              ; Reset count to 1 (this byte starts a new run)
    mov bl, dl              ; Update previous byte

    inc rsi
    dec rcx
    jz _end
    jmp _compress_loop
```

### The 255 Overflow Guard

A single byte can only represent counts up to 255. When a run exceeds this limit, a “mini-flush” writes the current state and resets the counter — without changing the Active Delta:

```nasm
_flush_255:
    mov byte [rdi], r8b     ; Write 255 to output
    inc rdi
    mov byte [rdi], r9b     ; Write current delta
    inc rdi
    mov r8b, 0              ; Reset counter, KEEP the same delta
    jmp _compress_loop      ; Continue — same series, new count
```

This ensures seamless handling of runs longer than 255 bytes — they simply produce multiple `(255, delta)` pairs followed by the remainder.

## The Decompressor

Decompression is the inverse operation and is intentionally simpler — this is critical because in a C2 context, the decompressor runs on the client side where code complexity is less constrained, but in the agent-side PIC context, simplicity means fewer instructions and smaller shellcode.

```nasm
_decompress_loop:
    test rcx, rcx
    jz _print_and_exit

    mov dl, byte [rsi]      ; Read Count
    inc rsi
    dec rcx

    test rcx, rcx
    jz _print_and_exit

    mov al, byte [rsi]      ; Read Delta
    inc rsi
    dec rcx

    test dl, dl             ; Count == 0? Skip (edge case)
    jz _decompress_loop

_write_loop:
    add bl, al              ; Apply delta: previous + delta = current
    mov byte [rdi], bl      ; Write reconstructed byte
    inc rdi
    dec dl
    jnz _write_loop         ; Repeat for the full count

    jmp _decompress_loop
```

The key detail is in `_write_loop`: the delta is applied **cumulatively**. Each iteration adds the delta to the running byte value. This is what reconstructs sequences like `A → B → C → D` from a single `(3, +1)` pair — not by writing `B` three times, but by computing `A+1=B`, `B+1=C`, `C+1=D`.

## Performance: Compression Scenarios

Here’s what to expect with real-world data on a 1GB file scale:

### Scenario 1: Server Log Files (access.log)

Repeated IP addresses, timestamps with sequential seconds, identical HTTP status codes, recurring URL paths.

**Expected Compression: ~40-55% reduction → ~450-600 MB output**

Delta encoding crushes timestamp sequences (incrementing seconds produce delta=1 runs). Repeated structural elements (spaces, brackets, quotes) create long zero-delta runs.

### Scenario 2: Random / Encrypted Binary Data

Uniform byte distribution, no patterns, no sequential relationships.

**Expected Compression: 0% — data EXPANDS by ~50-80% → ~1.5-1.8 GB output**

Every delta change triggers a flush, producing 2 bytes (count + delta) for almost every input byte, plus the anchor overhead. This is mathematically unavoidable — Shannon’s entropy theorem guarantees no lossless algorithm can compress truly random data.

### Scenario 3: Database Exports (CSV / SQL Dumps)

Sequential IDs (1, 2, 3…), repeated column names, consistent delimiters, similar numeric values.

**Expected Compression: ~30-45% reduction → ~550-700 MB output**

Auto-incrementing IDs produce perfect delta=1 runs. Repeated commas, quotes, and fixed-width fields compress well. Variable-length string fields (names, addresses) reduce overall effectiveness.

### Versus Traditional Algorithms

| Algorithm | Log File | Random | DB Dump | Dictionary? | Decode Complexity |
| --- | --- | --- | --- | --- | --- |
| **VESQER (DPCM+RLE)** | ~50% | Expands | ~40% | ❌ No | Trivial (~15 instructions) |
| gzip (LZ77+Huffman) | ~80% | ~0% | ~70% | ✅ Yes | Heavy (sliding window + tree) |
| LZ4 | ~65% | ~0% | ~55% | ✅ Yes | Medium (hash table lookups) |
| zstd | ~85% | ~0% | ~75% | ✅ Yes | Heavy (FSE + match finder) |

VESQER doesn’t compete with dictionary-based algorithms on raw compression ratio. It was never designed to. Its advantages are elsewhere:

-   **Zero memory overhead:** No hash tables, no sliding windows, no frequency tables.
-   **Tiny code footprint:** The entire compressor fits in ~100 instructions. Critical for PIC shellcode.
-   **Trivial decompression:** ~15 instructions to decompress. The client-side decoder is negligible.
-   **No signatures:** No magic bytes, no headers, no identifiable structure. The output is indistinguishable from random noise.

## C2 Integration: The Real Purpose

In the [Ghost-C2](https://github.com/JM00NJ/ICMP-Ghost-A-Fileless-x64-Assembly-C2-Agent) project, VESQER sits in the data pipeline between command execution and network transmission:

```
Command Output (RAM) → VESQER Compress → Rolling XOR → ICMP Chunking → Wire
```

The compression step achieves two things simultaneously:

**1\. Reduced Wire Footprint:** A `ls -la` output that would normally require 9 ICMP packets now fits in 5. Fewer packets = fewer detection opportunities = lower IDS correlation probability.

**2\. Double-Layer Obfuscation:** Compressed data already has high entropy — it looks like random noise. When Rolling XOR is applied on top, the result is indistinguishable from encrypted random data. A DPI engine analyzing the payload sees no ASCII patterns, no structural markers, nothing to fingerprint.

The PIC-integrated version of the compressor is called via a simple function convention:

```nasm
; RSI = Source buffer (raw command output)
; RDI = Destination buffer (compressed output)
; RCX = Input length
call _vesqer_compress
; RAX = Compressed length (new size for chunking)
```

All registers are preserved via push/pop, making it a clean drop-in function within the agent’s execution pipeline.

## The “Accidental Reinvention” Reflection

The irony isn’t lost on me. DPCM was formalized in the 1950s for voice digitization. RLE dates back to the 1960s. Combining predictive coding with run-length encoding has been done in countless forms — JPEG uses a variant, video codecs use it, even fax machines used it.

But none of those implementations were written in pure x86-64 Assembly, with zero dependencies, optimized for shellcode deployment inside a fileless C2 agent running inside a hijacked `cron` process.

Sometimes reinventing the wheel is the whole point — when you need that wheel to be invisible.

## 📖 Source Code & Implementation

The complete standalone compressor and decompressor are available as open-source tools:

**VESQER Compressor Repository:** [dpcm-rle-hybrid-x64-compressor on GitHub](https://github.com/JM00NJ/dpcm-rle-hybrid-x64-compressor)

**Ghost-C2 (Integrated Version):** [Ghost-C2 on GitHub](https://github.com/JM00NJ/ICMP-Ghost-A-Fileless-x64-Assembly-C2-Agent)

## ⚠️ Legal Disclaimer

This project is created for **educational purposes and security research only**. The compression algorithm itself is a general-purpose tool, but its integration with C2 frameworks is discussed purely in the context of authorized penetration testing and red team operations. Unauthorized access to computer systems is illegal. The author is not responsible for any misuse of this tool.
