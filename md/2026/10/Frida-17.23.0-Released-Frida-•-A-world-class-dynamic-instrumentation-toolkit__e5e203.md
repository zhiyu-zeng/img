---
title: Frida 17.23.0 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/07/frida-17-23-0-released/
source_host: frida.re
clip_date: 2026-10-07T22:53:25+08:00
trace_id: 2aecd69d-df01-407f-ae2c-a648b58a90b5
content_hash: ed4afe2415c362dbe346f80dc3124f6799cc349d374dc8c00b0eeeab41bf4ad9
status: synced
tags:
  - Frida
  - Hook
series: null
feed_source: Frida Releases
ai_summary: Frida 17.23.0 发布：PatternCompiler 支持宿主注入预处理宏，并收窄 arm64 上 hook 时的竞态、修复 Windows 导入枚举与 Windows 9x 后端缺陷。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f275244-d011-8146-9215-d8bdc4004ecc
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.23.0 发布：PatternCompiler 支持宿主注入预处理宏，并收窄 arm64 上 hook 时的竞态、修复 Windows 导入枚举与 Windows 9x 后端缺陷。
> 
> - **defines 机制：** `PatternCompiler.compile()` 新增 `defines` 字典，作用等同于入口顶部的 `#define`，且随模块传递，解码与 `call_function()` 共用同一预处理状态；语言服务器从 `settings.patterns.defines`（`workspace/didChangeConfiguration`）读取，用于区分"文件内联 payload"与"内存映射后为指针"两种布局。
> - **arm64 Linux/Android hook 改动（@pandasauce）：** 默认 hook 原先改写前 16 字节（ADRP+BR 或 LDR+BR+literal），被暂停在函数内的线程可能恢复进半打补丁的序言；现改为在 B 跳转范围内寻找 trampoline 切片，使重定向成为单条 B 指令、补丁与还原各为一次对齐写入。代码分配器在七页批量放不下时改为单页重试。该改动只是收窄而非消除竞态（架构手册仍视"替换正在执行的指令"为不可预测），代价是目标附近空间被更快耗尽，而该空间是 hook 单指令长度函数的唯一选择。
> - **Windows 修复（@tshivaneshk）：** `Module.enumerateImports()` 此前把每条导入的 slot 都报成 IAT 基址、且在导入模块中查找地址；现改为遍历 IAT 并报告绑定值。QuickJS 中 `Process.id` 保持无符号，因 Windows 9x 会分配超过 2^31 的进程 ID。
> - **Pattern 语言角落用例：** 修复模板递归超 64 层报告、`ref` 参数拿到 pattern（以便格式化 bitfield/struct）、共享模板按名回退查找局部与字段、元素内 `array_index()`、成员访问保留枚举名及 `formatted_value()` 格式化标量与 bitfield。
> - **Barebone 与其它：** 修复 Windows 9x 注入 agent 的五处问题（模块加载破坏已退出线程记录、主线程驻留内存被后续注入复用、启动栈泄漏、detach 超时蓝屏、分页内存故障未交还 Windows）；Swift 侧为 `PatternCompiler.compile()` 添加 `defines`；回退 termux-elf-cleaner 升级（其新代码需要宿主工具链未使用的 C++20）。

## Frida 17.23.0 Released

release

This release lets hosts hand preprocessor macros to patterns, fixes a batch of pattern language corner cases I ran into while wiring patterns into the upcoming Luma, and narrows a race when hooking on arm64 Linux and Android, thanks to [@pandasauce](https://github.com/pandasauce). There are Windows fixes as well, with [@tshivaneshk](https://github.com/tshivaneshk) fixing import enumeration, and a round of Barebone fixes for Windows 9x.

## Defines

A pattern often needs to know where its data comes from. A file format on disk has its payload inline, but once the same format is mapped into memory, what follows the header may be a pointer instead. ImHex patterns handle this kind of thing with the preprocessor, and so can ours now: *PatternCompiler* takes a *defines* dictionary, which behaves like a *#define* at the top of the entrypoint. Say we have *image.hexpat*:

```cpp
#pragma abi native

struct Header {
    u32 magic;
    u32 size;
};

struct Image {
    Header header;
#ifdef MAPPED
    u64 base;
#else
    u8 payload[header.size];
#endif
};
```

Compiling it with and without *MAPPED* defined gives two different layouts from one source:

```python
import frida

compiler = frida.PatternCompiler()

for defines in (None, {"MAPPED": 1}):
    options = {"platform": "darwin", "arch": "arm64"}
    if defines is not None:
        options["defines"] = defines
    module = compiler.compile("image.hexpat", **options)
    image = module.lookup("Image")
    fields = [(f.name, f.type_ref.display) for f in image.fields]
    print(f"defines={defines}: {fields}, size={image.size}")
```

```bash
defines=None: [('header', 'Header'), ('payload', 'u8[...]')], size=-1
defines={'MAPPED': 1}: [('header', 'Header'), ('base', 'u64')], size=16
```

The defines travel with the module, so decoding and *call_function()* see the same preprocessor state as the compile did. The language server takes its defines from *settings.patterns.defines* on *workspace/didChangeConfiguration*, so an editor can keep its diagnostics in sync with how the host will compile the pattern. This is what lets Luma tell a pattern whether it’s decoding a file or a mapped image, without the pattern having to know anything about Luma.

Beyond that, a week of feeding real-world patterns through the upcoming Luma surfaced a handful of corner cases in our implementation, around templates, *ref* parameters, enum names and *array_index()*. All of them are fixed in this release, and the changelog below has the details.

## Interceptor on arm64 Linux

Georgi Boiko ([@pandasauce](https://github.com/pandasauce)) chased down crashes on Android that came from the interplay between our arm64 redirects and threads that happened to be paused inside the function being hooked. On arm64, a default hook rewrote the first 16 bytes of the function with an ADRP+BR or LDR+BR+literal sequence, and a thread paused anywhere past the first instruction could resume into a half-patched prologue.

Interceptor now tries to find a slice for the trampoline within B range on Linux and Android, for default hooks with at least eight relocatable bytes, so the redirect is a single B instruction. A paused thread then resumes on untouched original bytes, and the patch itself is one aligned store. Restoring the redirect is one store too. To make such nearby slices available more often, the code allocator now retries a near allocation with a single page when a full seven-page batch doesn’t fit in the free space around the target.

The Arm Architecture Reference Manual still leaves replacing an arbitrary instruction with a branch, while another core may be executing it, unpredictable. So this narrows the race rather than closing it, but in practice it makes a big difference. One trade-off to be aware of: hooks that would have used the 16-byte redirect now use up the space near their targets sooner, and that space is the only option for hooking a function that is a single instruction long, as nothing else fits in it. Thanks a lot, Georgi!

## Windows

[@tshivaneshk](https://github.com/tshivaneshk) noticed that *Module.enumerateImports()* on Windows reported every import with the IAT base as its slot, and looked up each address in the importing module instead of reading it from the IAT. It now walks the IAT alongside the lookup table and reports each entry along with its bound value, and our test checks the reported address. Thanks!

Also, *Process.id* stays unsigned in QuickJS now. Windows 9x hands out process ids above 2^31, which turned negative in our JavaScript runtime.

## Barebone

Speaking of Windows 9x, a few sessions against Explorer and friends on the Barebone backend turned up five bugs in the agent we inject into user processes there, from module loads corrupting its record of exited threads to detaches that timed out and bluescreened the guest. All fixed, with the details in the changelog.

## EOF

Enjoy!

### Changelog

-   patterns: Let hosts define preprocessor macros through *PatternCompileOptions.defines*, carried into decode and call, and through *settings.patterns.defines* in the language server. (Covered above.)
-   patterns: Report endless template recursion after 64 nested instantiations.
-   patterns: Hand *ref* parameters the pattern, so functions formatting a bitfield or struct find its members.
-   patterns: Find template locals and fields by name as a fallback, for templates shared between enclosing types.
-   patterns: Answer *array_index()* inside an element.
-   patterns: Keep enum names through member access, and let *formatted_value()* format scalars and bitfields.
-   interceptor: Use 4-byte redirects on arm64 Linux and Android when a slice within B range is available. Thanks [@pandasauce](https://github.com/pandasauce)!
-   codeallocator: Retry near batches with one page on Linux and Android. Thanks [@pandasauce](https://github.com/pandasauce)!
-   windows: Fix import slots and addresses. Thanks [@tshivaneshk](https://github.com/tshivaneshk)!
-   gumjs: Keep *Process.id* unsigned in QuickJS.
-   barebone: Fix five Windows 9x issues in the agent injected into user processes: module loads corrupting its record of exited threads, the main thread parking in memory that a later injection could reuse, the start stack leaking, detach timing out because the worker was never woken, and faults on paged-out memory not being handed back to Windows.
-   swift: Add *defines* to *PatternCompiler.compile()*.
-   subprojects: Revert the termux-elf-cleaner bump, as its new code needs C++20, which the host tool build does not use.
