---
title: "Une nuit pour hacker 2026: Thread of Doom - RORO's blog"
source: https://blog.rodolpheg.xyz/posts/threadofdoom/
source_host: blog.rodolpheg.xyz
clip_date: 2026-10-02T10:32:59+08:00
trace_id: 73a928f6-ecb3-4564-a8b3-03d17581f7c0
content_hash: 8f6571ea93237b32f9577186d1d40525ac56d64657f8b70e7e0a3c71a3e8858c
status: synced
tags:
  - Windows逆向
  - CTF
series: null
feed_source: RORO·AppSec审计
ai_summary: 线程化 Windows crackme 的五层运行时防护被静态分析一次性绕过——flag 只经单字节 XOR（密钥 0x55）加密，密文与密钥都在反编译里明文可见。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ed75244-d011-819d-a8e4-e2a8a1b97140
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 线程化 Windows crackme 的五层运行时防护被静态分析一次性绕过——flag 只经单字节 XOR（密钥 0x55）加密，密文与密钥都在反编译里明文可见。
> 
> - **题目与目标：** `NHK_CrackMe_V3.exe`（PE32、x86、32 位 GUI、MSVC 调试版、未加壳），点击 "Demo" 按钮触发指针间接调用；flag 为 `NHK26{VirtualProtect_Overwritten}`。
> - **核心弱点：** flag 为 33 字节、单字节密钥 `0x55` 的 XOR 加密，以 UTF-16LE 宽字符存放；密文以 `MOV` 立即数分散入栈，故 `strings`/十六进制搜索找不到，但反编译中密文与密钥均为字面常量，静态解出即可。
> - **五层防护：** 堆上 4 字节 RWX 函数指针（默认指向报错处理，成功处理在 `0x00411b30`）；对 `0x4112ad` 起 256 字节的 DJB2 完整性哈希；扫描前 32 字节中的 `0xCC` 断点；调用者返回地址须落在模块范围内（否则 "DIRECT CALL BLOCKED"）；5 秒时间门（超时永久禁用计时器，触发 "TOO LATE"）。
> - **防护盲区：** 完整性校验只管 `.text`，不校验堆内容；断点扫描忽略硬件断点；未识别 `.textbss`、`.msvcjmc` 等调试构建节区属于干扰项。
> - **预期动态解法与结论：** 在初始化后用调试器、`WriteProcessMemory` 或 Cheat Engine 把 `*DAT_0041a300` 改写为 `0x00411b30` 并在 5 秒内点击按钮；但静态提取让所有运行时防护同时失效，弱点是可静态恢复的单字节密钥。

## Executive Summary

-   **Challenge**: Thread of Doom
-   **Category**: Reverse Engineering
-   **Flags**: `NHK26{VirtualProtect_Overwritten}`
-   **Binary:** `NHK_CrackMe_V3.exe` (PE32, x86, 43520 bytes)

* * *

Thread of Doom is a Windows crackme that presents a dialog with a “Demo” button. Clicking the button displays an error: *“Tu n’es pas premium! Prix: 2 BTC”*. The goal is to understand the binary’s protection mechanisms and extract the hidden flag.

## 核心弱点：单字节XOR

The flag is XOR-encrypted in memory with a single-byte key (`0x55`). The binary only decrypts it at runtime when several anti-tampering checks pass, but since both the ciphertext and key are visible in the decompilation, we can extract it statically without running the binary at all.

* * *

32-bit Windows GUI executable, targeting Vista+. The `file` output says “GUI” (not “console”), so we’re dealing with dialog boxes and WinMain rather than a console crackme. 9 sections is more than a typical release build (usually 4-5), which already hints at a debug build. No packing - packers like UPX would reduce section count and change names.

`MZ` at offset `0x00`, `PE\x00\x00` at `0xe8`, then `4c01` (i386) and `0900` (9 sections). The `Rich` header at `0xd0` is a Microsoft linker artifact, so this was built with MSVC (not MinGW or Borland). Headers are intact and standard - no obfuscation or packing at the format level.

A few things stand out:

## 节区与调试构建特征

-   `.textbss` (64KB) has CODE + ALLOC but no CONTENTS - writable and executable. Looks suspicious at first, but it’s actually MSVC’s Edit-and-Continue section for debug builds. Red herring.
-   `.text` (24KB) is the real code section, read-only + executable. All the functions we care about live here.
-   `.data` (512 bytes) is tiny. The program has very few globals, but they turn out to matter a lot: the function pointer, hash value, and timer state all live here.
-   `.msvcjmc` is the “Just My Code” section, another debug build marker. This confirms `__CheckForDebuggerJustMyCode()` calls will appear in every function.

From KERNEL32: `VirtualAlloc` allocates memory at runtime (interesting), `GetTickCount64` measures time (timing check?), `GetModuleHandleW` gets the module base (caller validation?), `IsDebuggerPresent` is a well-known anti-debug call, though it might just be pulled in by the CRT.

From USER32: `DialogBoxParamW` creates a modal dialog, `MessageBoxW` shows results. Standard dialog-based UI.

The trailing `D` in `VCRUNTIME140D.dll` means “Debug” - release builds link against `VCRUNTIME140.dll`. Same for `ucrtbased.dll`. Definitely a debug build.

![Disaster Girl - Definitely a debug build](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4cafee4952e582e1.jpg)

No networking, no file I/O, no crypto APIs. The flag decryption has to be implemented inline.

The `-e l` flag extracts UTF-16LE (wide) strings. These map to four program states:

| String | Meaning |
| --- | --- |
| `"Tu n'es pas premium ! Prix : 2 BTC"` | Error path, shown when the default function pointer is called |
| `"Success"` | Title of the flag MessageBox, our target |
| `"DIRECT CALL BLOCKED"` | Anti-tampering message, shown if decryption is called from outside the module or without a timer |
| `"TOO LATE"` | Time gate, shown if decryption takes longer than 5 seconds |
| `"Demo"` | Button label |
| `"Nuit du Hack 2026"` | Challenge event name in the dialog resource |

The flag itself doesn’t appear in the strings output. It’s either encrypted or constructed at runtime. The “DIRECT CALL BLOCKED” string tells us the decryption function has its own protections beyond the dialog handler’s integrity check.

* * *

Ghidra auto-detected x86 LE 32-bit with Windows compiler spec. No PDB found, so all function names are auto-generated (`FUN_XXXXXXXX`). Out of 301 functions, 163 are thunks to DLL imports or CRT functions. The 138 user-defined functions are what we need to look at, though most of those are MSVC CRT boilerplate. The crackme logic is about 10 functions.

* * *

The following diagram shows the complete program flow from startup to flag display, including all protection checks:

Ghidra decompilation:

Before showing the dialog, this function does three things:

1.  Stores the address `0x4112ad` and size `0x100` in globals, then computes a hash of that 256-byte code region. This hash gets checked every time the button is clicked.
2.  Calls `VirtualAlloc(NULL, 4, 0x3000, 0x40)` to allocate just 4 bytes (one pointer) with `PAGE_EXECUTE_READWRITE` permissions. Only 4 bytes. RWX.

![Is this memory protection?](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/74e10d6d609aaee5.jpg) 3. Writes the address of the error handler into that pointer: `*DAT_0041a300 = thunk_FUN_00411ac0`.

So instead of calling `error_handler(hwnd)` directly, the code reads a pointer from heap memory and calls whatever it points to. The flag name `VirtualProtect_Overwritten` gives the game away: the intended solution is to overwrite this pointer. And since it lives on the heap, not in the `.text` section the integrity check monitors, there’s nothing stopping us.

Standard Win32 dialog procedure. On `WM_INITDIALOG`, it sets the button text to “Demo”. When the button is clicked (control ID `0x3EB` = 1003):

1.  Run the integrity check (`FUN_004120b0`). If it fails, show the error.
2.  Check `DAT_0041a300` isn’t NULL.
3.  Dereference the pointer and call whatever function it points to.

That indirect call at `(*local_14)(param_1)` is where the runtime exploit happens. Overwrite `*DAT_0041a300` with `0x00411b30` (success handler) instead of `0x00411ac0` (error handler), click the button, done. The integrity check doesn’t verify the heap pointer.

Just shows the error MessageBox (`0x10` = `MB_ICONERROR`). This is what gets called by default.

![Shut up and take my 2 BTC](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ee5aa51b0924e304.jpg)

Three steps: start a timer, decrypt the flag, check if it all happened within 5 seconds. Even if we redirect execution here, the decryption function has its own protections (timer, caller validation). But for static analysis we just need to read the decompilation - we don’t need to execute any of this.

* * *

The following diagram shows how the protections layer and where the bypass opportunities are:

The button dispatches through a function pointer in heap memory (RWX). Default target is the error handler. To reach the success path, overwrite this pointer to `FUN_00411b30`.

## 堆上函数指针防护

This prevents the simplest attack - patching a `CALL` or `JMP` in `.text`. The call target comes from writable heap memory, so a static binary patch can’t change it (the heap address is different each run). But the heap pointer itself is unprotected. The integrity check watches `.text` code, not heap contents. A debugger, `WriteProcessMemory`, or Cheat Engine can overwrite those 4 bytes.

This runs every time the button is clicked, not just at startup. Two checks in sequence:

## 完整性哈希与断点扫描

1.  Scan the first `0x20` (32) bytes of the monitored region at `0x4112ad` for `0xCC` bytes. `0xCC` is the INT3 instruction debuggers use for software breakpoints.
2.  If no breakpoints found, recompute the hash of the full `0x100` (256) byte region and compare against the startup value.

This stops you from setting breakpoints in the monitored code or patching instructions there. But the monitored region is only 256 bytes, and it doesn’t cover the heap where the function pointer lives.

Byte-by-byte scan for `0xCC`. Ghidra shows `-0x34` because it’s treating the comparison as signed char, but `-0x34` in two’s complement is `0xCC`. Only scans the first `0x20` bytes. Misses hardware breakpoints entirely (DR0-DR3 registers are invisible to memory reads).

![Expanding brain: from IsDebuggerPresent to not knowing hardware breakpoints exist](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b77761fc1ea37e11.jpg)

A DJB2 variant (Dan Bernstein’s hash). Multiplier `0x21` = 33 is the characteristic DJB2 constant. Changing even a single byte in the 256-byte region at `0x4112ad` produces a different hash and fails the integrity check. No way to patch code there without detection.

Grabs its own return address off the stack and checks whether it falls within `[module_base, module_base + SizeOfImage)`. Called from the decryption function. If you call the decryptor from injected shellcode in another memory region, this returns 0 and you get “DIRECT CALL BLOCKED”. Doesn’t matter for static analysis since we never need to call it.

Uses `GetTickCount64()` (millisecond-resolution). If more than 5001ms have passed, the timer gets permanently disabled (`DAT_0041a310 = 0`). Can’t retry without restarting. Anti-debugging measure: single-stepping through the success handler would easily blow the 5-second window. Bypassable with hardware breakpoints, by hooking `GetTickCount64`, or by just not debugging this path.

Stores the current `GetTickCount64` value as two 32-bit DWORDs (32-bit binary, 64-bit value) and arms the timer.

* * *

This is where the flag actually gets decrypted. Ghidra decompilation:

Three layers of defense before it produces the flag:

1.  `FUN_00411ff0()` must return non-zero, meaning the timer was started and less than 5 seconds have passed. Call this directly without the success handler starting the timer and you get “DIRECT CALL BLOCKED”.
2.  `FUN_004119d0()` checks the return address is within the module. Call from injected code and you get “DIRECT CALL BLOCKED”.
3.  The flag is only decrypted once (guarded by `DAT_0041a2c8`). Afterward, the encrypted bytes get overwritten in reverse on the stack - an anti-dump technique.

## XOR解密与防转储

The decryption itself is simple: 33 bytes XORed with `0x55`, stored as UTF-16LE wide characters. The encrypted bytes aren’t contiguous in the binary - they’re loaded as individual `MOV` instructions (stack immediates), so `strings` or a hex search won’t find the ciphertext as a block.

But none of that matters. We have the 33 encrypted bytes as literal constants, the XOR key `0x55` as a literal constant, and the algorithm. That’s everything we need.

![Flex Tape: 7 layers of runtime protection patched by XOR key 0x55 hardcoded as a literal](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/65558566bb996406.jpg)

* * *

The following diagram shows the memory layout and attack surface:

We have the encrypted bytes and the XOR key from the decompilation. No need to run the binary:

Quick sanity check: `0x1b ^ 0x55 = 0x4E = 'N'`, `0x1d ^ 0x55 = 0x48 = 'H'`, `0x1e ^ 0x55 = 0x4B = 'K'` - that’s the expected flag prefix. `0x2e ^ 0x55 = 0x7b = '{'` at index 5 and `0x28 ^ 0x55 = 0x7d = '}'` at index 32 confirm the flag format.

The flag name tells us the intended runtime solution: overwrite the VirtualAlloc’d function pointer. We got it through static analysis instead, bypassing all the runtime protections at once.

| Index | Encrypted | XOR 0x55 | ASCII |
| --- | --- | --- | --- |
| 0x00 | 0x1B | 0x4E | N   |
| 0x01 | 0x1D | 0x48 | H   |
| 0x02 | 0x1E | 0x4B | K   |
| 0x03 | 0x67 | 0x32 | 2   |
| 0x04 | 0x63 | 0x36 | 6   |
| 0x05 | 0x2E | 0x7B | {   |
| 0x06 | 0x03 | 0x56 | V   |
| 0x07 | 0x3C | 0x69 | i   |
| 0x08 | 0x27 | 0x72 | r   |
| 0x09 | 0x21 | 0x74 | t   |
| 0x0A | 0x20 | 0x75 | u   |
| 0x0B | 0x34 | 0x61 | a   |
| 0x0C | 0x39 | 0x6C | l   |
| 0x0D | 0x05 | 0x50 | P   |
| 0x0E | 0x27 | 0x72 | r   |
| 0x0F | 0x3A | 0x6F | o   |
| 0x10 | 0x21 | 0x74 | t   |
| 0x11 | 0x30 | 0x65 | e   |
| 0x12 | 0x36 | 0x63 | c   |
| 0x13 | 0x21 | 0x74 | t   |
| 0x14 | 0x0A | 0x5F | \_  |
| 0x15 | 0x1A | 0x4F | O   |
| 0x16 | 0x23 | 0x76 | v   |
| 0x17 | 0x30 | 0x65 | e   |
| 0x18 | 0x27 | 0x72 | r   |
| 0x19 | 0x22 | 0x77 | w   |
| 0x1A | 0x27 | 0x72 | r   |
| 0x1B | 0x3C | 0x69 | i   |
| 0x1C | 0x21 | 0x74 | t   |
| 0x1D | 0x21 | 0x74 | t   |
| 0x1E | 0x30 | 0x65 | e   |
| 0x1F | 0x3B | 0x6E | n   |
| 0x20 | 0x28 | 0x7D | }   |

* * *

The flag name describes the intended approach. To solve this dynamically:

1.  Overwrite the function pointer at `*DAT_0041a300` with `0x00411b30` (success handler) instead of `0x00411ac0` (error handler)
2.  Don’t touch the `.text` code - the integrity hash covers `0x100` bytes at `0x004112ad`, and any patch there gets detected
3.  The pointer lives in heap memory (VirtualAlloc), outside the hashed region, so writing to it is invisible to the integrity check
4.  Click the button within 5 seconds of the timer starting

Ways to do it: set the value in a debugger after initialization, use `WriteProcessMemory` from an external tool, or use Cheat Engine to find and modify the pointer at runtime.

* * *

## 防护失效结论

1.  XOR encryption with a static key is not encryption. The key (`0x55`) and ciphertext are both in the binary. Static extraction takes about 30 seconds.
2.  Anti-debug checks don’t help if you can avoid the guarded path entirely. The flag data exists in `.text` regardless of whether the runtime checks pass.
3.  Function pointer indirection adds a layer of complexity but both the pointer target and the success handler are right there in the decompilation.
4.  The challenge stacks five protections (indirect call, integrity hash, breakpoint scan, caller validation, time gate) but they all become irrelevant when the XOR key is recoverable statically. The weakest link - single-byte XOR - collapses the entire scheme.

![Domino effect: single-byte XOR key visible in decompilation topples all 7 protections](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dd09e2264ed4c798.jpg)
