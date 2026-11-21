---
title: Lessons from Telegram's RCE:The Proper Way to Secure a JavaScript Runtime
source: https://nebusec.ai/research/telegram-widget-hardening/
source_host: nebusec.ai
clip_date: 2026-11-21T08:50:50+08:00
trace_id: 58767799-12e9-413a-a02c-4b90e2ce6132
content_hash: 07af54e36d61427d3be288e5ad8d155783a6797ed92ca87bd3996a8984d75046
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: NebuSec
ai_summary: Telegram 的组件 RCE 暴露了同一个问题：把 JavaScript 引擎本身当作安全边界；正确做法是默认引擎已被攻破，再叠加进程隔离、SFI、污点边界和允许列表。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41f75244-d011-81a8-ac0c-f7932521469d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Telegram 的组件 RCE 暴露了同一个问题：把 JavaScript 引擎本身当作安全边界；正确做法是默认引擎已被攻破，再叠加进程隔离、SFI、污点边界和允许列表。
> 
> - **时间线：** 11 月 10 日，Telegram 上线消息内组件；11 日，该组件被用于 RCE；12 日，Telegram 增加 seccomp 过滤并把功能改为仅允许名单；14 日，该过滤被绕过。
> - **原设计缺陷：** 首版 QuickJS 在 Telegram 应用进程的线程中运行；修复后虽改为独立进程，但 seccomp 采用约 30 个系统调用的拒绝列表，而且一个进程服务所有组件，QuickJS 与验证器、渲染器同处一个库，内部没有隔离。
> - **两条绕过路径：** 一条利用 seccomp 未覆盖的组件漏洞直接实现 RCE；另一条把 seccomp 覆盖的组件漏洞与内核漏洞串联起来，突破过滤。
> - **加固方案：** 使用专用 Android isolated 进程；把 QuickJS 编译为 WebAssembly，再经 wasm2c 生成 C 代码实现 SFI；用 RLBox 的 `tainted<T>` 标记跨边界值并强制校验；seccomp 改为按实际调用构建的允许列表，同时过滤参数（包括 `ioctl`）；每个组件使用独立线性内存。
> - **残留风险：** LiteHTML 渲染器也独立进程和沙箱，但 Skia 等路径仍在沙箱外；作者已利用 Skia 漏洞再次实现任意代码执行，SFI 只限制损害范围，不保证引擎无漏洞。

On Nov. 10, Telegram CEO Pavel Durov announced that any Telegram message can now become an app. A day later, a message became remote code execution instead. Telegram patched it with a seccomp filter, and two days after that we bypassed the filter.

Two exploits in four days suggest the issue is architectural, and that it needs more than another patch. So this post does two things. It recaps what happened, and it shows how to run JavaScript inside a chat message properly, using the hardened design we built.

Summary

Running third-party code inside a messenger is the same problem browsers face, and their answers carry over:

1.  Assume the engine is already compromised, and design for what the attacker holds next.
2.  Run it outside the process that holds accounts, messages and keys.
3.  Confine it inside that process with SFI, one instance per widget.
4.  Treat everything it says as tainted until the host validates it.
5.  Make seccomp an allowlist, and remember it can’t fix the kernel behind the calls it allows.

With those layers in place, an engine bug should end as a crashed widget instead of a compromised account. The same list applies to any app that runs code arriving in a message, a document or a file.

## Four Days, Two Exploits

| Date | What happened |
| --- | --- |
| Nov. 10 | [Pavel Durov announces the feature](https://x.com/durov/status/2120148866469376463): Any Telegram message can now become an app. |
| Nov. 11 | [V12 posts a video](https://x.com/v12sec/status/2120471754166415821) showing that any Telegram message can turn into RCE. |
| Nov. 12 | Telegram adds a seccomp filter to address the problem and makes the feature allowlist-only. |
| Nov. 14 | [We demonstrate](https://x.com/nebusecurity/status/2121776296829342128) that the seccomp filter can be bypassed. |

If you missed it: [Widgets](https://core.telegram.org/bots/widgets) arrived with [Bot API 10.4](https://core.telegram.org/bots/api-changelog#november-9-2026). A widget is a small HTML document that a bot sends inside a message, and Telegram runs its JavaScript on your device in QuickJS, a compact engine written in C.

The attacker is anyone who can register a bot. The input is a full programming language.

## The Sandbox That Wasn’t

Telegram’s documentation describes the widget sandbox as a set of JavaScript-level rules: no network access, checked page changes, and caps on CPU and memory.

Those rules live in the engine’s own code. One use-after-free or out-of-bounds write in QuickJS, and the script is reading and writing process memory. The rules stop mattering.

That is how the first release fell. At launch the engine ran on a thread inside the Telegram app, so an engine bug ran with everything the app holds.

The Nov. 12 fix moved the engine into its own process and put a seccomp filter on it. That was a real step forward, and it still wasn’t enough:

-   **The seccomp rules are a denylist.** [The filter](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/jni/twidget/twidget-seccomp.cpp) names roughly 30 calls, such as `ptrace`, `bpf` and `mount`. Everything else goes through, including every `ioctl`.
-   **One process serves every widget.** The [app manifest](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/AndroidManifest.xml) says so in a comment. A compromised widget from one bot shares an address space with every other bot’s widgets.
-   **Nothing confines QuickJS inside that process.** The engine sits in [one native library](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/utils/twidget/WidgetEngineService.java) with the validator and the renderer. A bug in the engine is a bug in everything next to it.

Seccomp decides which calls are permitted. It can’t make the permitted implementations safe.

We reached code execution outside the seccomp filter in two independent ways. The first uses a widget vulnerability that seccomp does not cover to get RCE directly. The second chains two vulnerabilities, a widget vulnerability that seccomp does cover and a kernel vulnerability, to break through seccomp. Given how the current implementation works, both paths admit many variants that would yield further bugs, so we are holding the details for now.

The lesson for anyone shipping a script engine: Assume the engine is already compromised, and design for what the attacker holds next.

Your browser does not support the video tag.

Telegram for Android 13.2.2 (7303): a bot-supplied widget bypasses the seccomp filter and launches the Android calculator.

## NebuSec Hardening for the Widget Runtime

Pointing out gaps is only useful if we can also show how to close them, so we built a hardened version of the widget runtime.

The goal is to strike a balance between flexibility, security and high performance. Our hardened widget runtime puts three boundaries around QuickJS:

1.  **A dedicated process.** Widget JavaScript runs in an Android isolated service and reaches Telegram only through explicit, validated instructions, with stricter seccomp rules on top.
2.  **Software fault isolation.** QuickJS is compiled with a constrained memory and execution model that confines memory corruption to a designated memory region.
3.  **A tainted boundary.** RLBox marks every value that leaves the engine as untrusted until the host validates it.

The rest of this post walks through each choice, starting with the one we didn’t make.

### Why Not Just Use V8?

QuickJS was not designed to run untrusted code. The first option to consider is replacing it with a more battle-tested JavaScript engine, such as V8, SpiderMonkey or JavaScriptCore.

> How many V8 engines are running on your device?

Had we made this decision before 2023, the only drawback might have been the size of these engines. Today, memory read/write primitives inside a complex JavaScript engine are within reach of a wide range of attackers, and a JIT compiler only adds more attack surface. We would be trading substantial storage overhead for little improvement in the isolation guarantees we actually need.

If attackers are ultimately destined to acquire arbitrary memory read and write primitives, why not embrace that inevitability and focus instead on fundamentally constraining the reach and capabilities of those primitives? Luckily, modern software development has set a clear path.

### If It Looks Like a Duck and Quacks Like a Duck

Telegram widgets parse HTML, run JavaScript and respond to user interaction. This is the same combination a web browser handles.

To be clear, we’re not going to embed an entire browser into an IM application, although some companies have already done that. Instead, we’re borrowing a page from the browser’s architecture.

> At launch, their biggest shortcoming lay in their approach to isolation: They relied on threads, which provide no memory isolation from the host application, since threads share the same address space.

To establish a proper isolation boundary, we run widget JavaScript in an Android isolated service, separate from Telegram’s main process. The isolated process communicates layout changes through explicit instructions. For example, consider the following JavaScript:

```javascript
document.getElementById("status").textContent = "NebuSec hardened Telegram";
```

The widget’s DOM layer records this modification and sends a batch of operations over a Unix domain socket from the isolated engine process. Telegram’s app process validates the batch and forwards accepted operations over a second IPC channel to an isolated LiteHTML renderer. Render output returns to the app, where the native graphics path redraws the widget. User interactions, dimensions and other events travel back through the engine socket to the JavaScript process.

Inside the trusted app process, the widget host coordinates those boundaries: one IPC client talks to the engine, a Rust validator checks every returned operation, a second client talks to the renderer, and Skia remains the final native drawing path.

Telegram bot widget message Telegram app process · normal app UID Skia · outside sandbox Chat UI Widget host Engine framed IPC client Rust validator Android isolated engine process Renderer IPC client Android isolated renderer process

Interactive architecture

Trace a trust boundary

Select any component or connection to highlight its direct path and inspect the security boundary.

The trusted app process validates engine output and coordinates both isolated services; Skia remains outside their RLBox sandboxes.

So the application keeps its flexibility while QuickJS runs in a dedicated process. What’s more, that process can be further confined with stricter seccomp rules, which limit what attackers can do after gaining code execution in the widget process.

Inside that engine process, framed IPC reaches `SandboxEngine`, which can enter the per-widget QuickJS sandbox only through the RLBox bridge.

Telegram app process · normal app UID Engine framed IPC client Android isolated engine process Framed IPC service SandboxEngine RLBox bridge Per-widget RLBox sandbox QuickJS

Interactive architecture

Trace a trust boundary

Select any component or connection to highlight its direct path and inspect the security boundary.

Each widget gets its own wasm2c linear memory inside the isolated engine process.

Stricter means an allowlist built from the calls the service actually makes, with arguments filtered too, `ioctl` included. A denylist only covers the kernel bugs someone has already thought of.

### Le Pouvoir Arrête le Pouvoir

Power checks power, as Montesquieu put it. Process isolation and seccomp are necessary, but they are not silver bullets. A vulnerability in the kernel code behind an allowed syscall can remain reachable after an attacker compromises QuickJS. Seccomp decides which calls are permitted, but it can’t make the permitted implementations safe.

This is where software fault isolation, or SFI, enters the picture.

SFI is a way to run a potentially vulnerable component inside a restricted part of a process. The component still executes native machine code, but its memory accesses and indirect calls are constrained. It can’t treat an arbitrary number as a pointer into the rest of the process or as an address to jump to.

That distinction matters here. Android process isolation keeps the widget service separate from Telegram’s main process, and seccomp restricts the service’s syscalls. Neither prevents a memory corruption bug in QuickJS from taking control of other native code in the widget service. If that happened, the attacker could try to use syscalls that the service legitimately needs and seccomp therefore permits. SFI places another boundary around QuickJS itself.

We’d like to enforce the following rules:

-   **Memory access stays within a specific range of linear memory.** We want to transform all absolute memory access into relative access by offset. Even if a corrupted QuickJS state produces an address outside the permitted memory, execution traps instead of accessing the service’s native heap.
-   **Indirect calls have constrained targets.** Attackers love gaining arbitrary function calls by abusing indirect calls or dynamic binding mechanisms. One possible approach is turning function calls into function table indexing, where type checking can be applied.

WebAssembly offers precisely the execution semantics we require. Our implementation enforces that boundary by compiling the C version of QuickJS to WebAssembly, translating the WebAssembly to C with `wasm2c`, and compiling the generated C into the Android library.

Here is an example. A QuickJS pointer becomes an offset into WebAssembly linear memory. A generated load looks like this:

```c
uint32_t value = i32_load_default32(memory_base, memory_size, memory, object_offset + 16);
```

`i32_load_default32` checks that the 4-byte read stays in linear memory before accessing `memory_base + offset`. Depending on the platform, wasm2c uses an explicit bounds check or guarded memory that traps on an invalid access. The offset cannot be used as a raw address into the widget service’s native heap.

In the same generated sequence, that loaded value is used as a function table index:

```c
uint32_t index = i32_load_default32(memory_base, memory_size, memory, object_offset + 16);

result = CALL_INDIRECT(table, expected_type, index, argument);
```

Conceptually, `CALL_INDIRECT` does this:

```c
if (index >= table.size ||
    table[index].function == NULL ||
    table[index].type != expected_type) {
    trap();
}

result = table[index].function(argument);
```

The real implementation has a fast type check and a slower fallback, but it enforces both the table bound and function type before calling. A corrupted index can select a permitted and type-compatible table entry or cause a trap, but it can’t directly call an arbitrary address.

SFI doesn’t make QuickJS correct. A memory bug still lets the script corrupt anything inside its own linear memory, and with it everything the engine reports to the host. What changes is where the damage stops.

Two bonuses come along. The generated code is portable C, so the same layer works on platforms where an app can’t easily spin up a locked-down helper process. The approach also has production precedent: Firefox has sandboxed libraries such as Hunspell and Ogg [the same way since 2021](https://hacks.mozilla.org/2021/12/webassembly-and-back-again-fine-grained-sandboxing-in-firefox-95/).

### Bridge the Gap

But as always, the devil is in the details. QuickJS doesn’t run a widget entirely on its own. It must receive scripts, return results and call a small set of host functions, and each exchange crosses the SFI boundary. In other words, we have to handle all of this cross-boundary traffic. [RLBox](https://rlbox.dev/) is the framework we use to manage that boundary, making sandbox values visibly untrusted and giving the host checked ways to call QuickJS and copy data in and out.

RLBox provides an elegant solution to this problem by leveraging the C++ type system to enforce security constraints at compile time.

At its core lies a simple yet powerful abstraction: `tainted<T>`. Any value originating from the sandbox is treated as untrusted, and the host must explicitly validate it before using it in trusted operations. RLBox also mediates pointer conversions, memory transfers and callbacks across the sandbox boundary.

Two habits make the boundary stronger:

-   **Keep the list of host functions short.** Each function the engine can call is a capability. A widget needs to emit page changes, set timers, read its state and post a request to the bot. It doesn’t need files, sockets or the host’s allocator.
-   **Give each widget its own sandbox instance.** Every instance has its own linear memory, so a compromised widget from one bot can’t read another bot’s widget, even inside one process.

In short, WebAssembly constrains what QuickJS can access, while RLBox governs how QuickJS interacts with the outside world.

The renderer repeats the same containment pattern independently. Its IPC service enters a separate RLBox bridge, and LiteHTML parses and lays out the widget inside its own wasm2c sandbox.

Telegram app process · normal app UID Renderer IPC client Android isolated renderer process Renderer IPC service Separate RLBox bridge RLBox wasm2c sandbox LiteHTML

Interactive architecture

Trace a trust boundary

Select any component or connection to highlight its direct path and inspect the security boundary.

LiteHTML has a separate process, bridge and software-fault-isolation boundary from QuickJS.

Together, these modules preserve the flexibility of native integration without collapsing their isolation boundaries. Zooming out, the complete runtime has three process modules and two explicit IPC relationships:

Select a process module to expand it. Select a component or connection to inspect its role.

Telegram app process · normal app UID Android isolated engine process Android isolated renderer process

Interactive architecture

Trace a trust boundary

Select any component or connection to highlight its direct path and inspect the security boundary.

The trusted app process brokers two Unix-socket channels; the engine and renderer do not communicate directly.

This architecture, however, is by no means a guarantee of security. It merely isolates QuickJS and LiteHTML, while other code paths involved in rendering, such as Skia, remain outside the sandbox’s protection. In fact, we successfully exploited a vulnerability in Skia to achieve arbitrary code execution once again.

## Conclusion

The broader lesson is not that applications can never run untrusted JavaScript; it is that the engine cannot also serve as the security boundary. Start from compromise: isolate the runtime from application secrets, confine each widget’s memory, keep host capabilities narrow and validate every value that crosses back. No layer is perfect, but together they can change the outcome of an engine exploit from application compromise to a contained widget failure.

## Sources

-   Telegram, [Bot API changelog: Bot API 10.4](https://core.telegram.org/bots/api-changelog#november-9-2026) and [Telegram Widgets](https://core.telegram.org/bots/widgets) documentation
-   Telegram for Android source, master at version 13.2.2 (7303), read Nov. 15, 2026: [AndroidManifest.xml](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/AndroidManifest.xml), [WidgetEngineService.java](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/utils/twidget/WidgetEngineService.java), [twidget-seccomp.cpp](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/jni/twidget/twidget-seccomp.cpp)
-   Mozilla Hacks, [WebAssembly and Back Again: Fine-Grained Sandboxing in Firefox 95](https://hacks.mozilla.org/2021/12/webassembly-and-back-again-fine-grained-sandboxing-in-firefox-95/), Dec. 6, 2021
