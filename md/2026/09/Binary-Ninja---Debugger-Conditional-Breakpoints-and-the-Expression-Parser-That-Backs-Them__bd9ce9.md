---
title: Binary Ninja - Debugger Conditional Breakpoints and the Expression Parser That Backs Them
source: https://binary.ninja/2026/09/29/debugger-conditional-breakpoint.html
source_host: binary.ninja
clip_date: 2026-09-30T06:31:36+08:00
trace_id: 932cf351-2281-40d2-ba98-88f1567cfb59
content_hash: 90e7c89e6f071a307f5ad9bebcccbfb553931e6a7b104764cf512d5952e840ce
status: synced
tags:
  - 安全工具
  - 逆向调试
series: null
feed_source: Binary Ninja Blog
ai_summary: Binary Ninja 的条件断点之所以用约 500 行代码就能实现，是因为它把条件字符串直接交给已有的表达式解析器求值，而非重写一套条件引擎。
ai_summary_style: key-points:weak
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3ea75244-d011-814e-8b87-ea4d7db1a913
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> Binary Ninja 的条件断点之所以用约 500 行代码就能实现，是因为它把条件字符串直接交给已有的表达式解析器求值，而非重写一套条件引擎。
> 
> - **解析器能力：** 导航对话框 `G` 背后是完整表达式解析器，支持算术、位运算、比较与括号，可引用段（`.text + 0x100`）、符号、解引用（`[.data + 0x20]`）及大小后缀 `.b/.w/.d/.q`，特殊值 `$here`、`$start`、`$end`。
> - **数字格式：** 无前缀数字默认为十六进制（`10` 即十六），`0n10` 表示十进制 10，`010` 表示八进制。
> - **魔法值：** 调试会话自动把 CPU 寄存器与模块基址注册进解析器，因此可直接写 `rbp - 0x20`、`kernel32 + 0x1000`（ASLR 下同样有效）；插件可用 `add_expression_parser_magic_value` 注册自定义值。寄存器名历史上需 `$` 前缀，现可省略。
> - **求值逻辑：** `EvaluateBreakpointCondition` 调用 `ParseExpression`，结果非 0 即条件成立；条件为空则总是停下，解析失败也停下以求稳妥。比较运算符于 2022 年 12 月加入，成立返回 1、不成立返回 0。
> - **功能落地：** 条件断点由社区贡献者 3rdit 的 PR #941 于 2025 年 12 月合并，因其在调试核心层求值，各调试适配器共享同一套语法，但寄存器与模块名随目标变化。
> - **使用方式：** 在 Breakpoints 控件右键 “Edit Condition…” 填写表达式，或用 API `dbg.set_breakpoint_condition` / `get_breakpoint_condition`（支持 `ModuleNameAndOffset`），传空字符串即清除条件。
> - **后续设想：** 可能增加字符串比较函数，如 `streq(rdi, "password")`，目前尚不可用。

In Binary Ninja’s debugger, when you set a breakpoint and add a condition like `rax == 0x1234`, it just works. Let’s take a look into how that works and what sorts of conditions you can use.

This post tells the story of the [conditional breakpoint](https://docs.binary.ninja/guide/debugger/index.html#conditional-breakpoints) with a side-quest to explore Binary Ninja’s [expression parser](https://api.binary.ninja/binaryninja.binaryview-module.html#binaryninja.binaryview.BinaryView.parse_expression) which is the feature that makes it possible.

## It Started with Navigation

If you’ve used Binary Ninja, you’ve probably pressed `G` to open the navigation dialog and typed in a function name. But did you know that dialog is powered by a full expression parser? This means you can type `main + 0x10` to navigate 16 bytes past the start of `main`, or `.text + 0x100` to jump to an offset within a section, or even `[.data + 0x20]` to dereference a pointer.

The expression parser can do a lot more than you would probably guess. Here’s some examples:

### Expression Parser Capabilities

| Feature | Example | Description |
| --- | --- | --- |
| Arithmetic | `main + 0x10` | Navigate 16 bytes after main |
| Sections | `.text + 0x100` | Offset into a section |
| Symbols | `data_00005000` | Unnamed data variables |
| Dereference | `[.data + 0x20]` | Read pointer at address |
| Size suffix | `[.data + 0x20].q` | Read 8 bytes (quadword) |
| Special values | `$here`, `$start`, `$end` | Current address, file boundaries |

The supported operators include arithmetic (`+`, `-`, `*`, `/`, `%`), bitwise operations (`&`, `|`, `^`, `~`), comparisons (`==`, `!=`, `>`, `<`, `>=`, `<=`), and grouping with parentheses.

For memory dereferences, you can specify the size: `[expr].b` for a byte, `[expr].w` for a word, `[expr].d` for a dword, and `[expr].q` for a quadword. Without a suffix, it reads an address-sized value.

Numbers default to hexadecimal, but you can use `0n10` for decimal or `010` for octal when needed.

For the complete specification, see the [parse_expression API documentation](https://api.binary.ninja/binaryninja.binaryview-module.html#binaryninja.binaryview.BinaryView.parse_expression).

## Making It Dynamic: Magic Values

The expression parser becomes even more powerful during debugging thanks to “magic values” which are name-value pairs that can be registered at runtime.

When you’re in a debug session, the debugger automatically registers all CPU registers (`rax`, `rbx`, `rsp`, `rbp`, `rip`, etc.) and module bases (`kernel32`, `ntdll`, `libc`, etc.) into the expression parser. This enables some useful workflows:

-   Type `rbp - 0x20` to navigate directly to a stack variable — no manual calculation needed
-   Type `kernel32 + 0x1000` to navigate into a loaded module, even with ASLR
-   Type `rsp` to jump straight to the stack pointer

![Navigate dialog with register expression](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e20ba4b177467456.png)

Navigate dialog with register expression

*A quick note: historically, register names required a `$` prefix (e.g., `$rax`). Register names can now be used directly, as in `rax`.*

Plugin authors can take advantage of this system too. The [add_expression_parser_magic_value](https://api.binary.ninja/binaryninja.binaryview-module.html#binaryninja.binaryview.BinaryView.add_expression_parser_magic_value) API lets you register custom values. Imagine registering heap chunk addresses or TLS slots that users can then reference directly in expressions.

## The 500-Line Feature

Conditional breakpoint support landed in December 2025, thanks to a PR from community contributor [3rdit](https://github.com/3rdit). The entire feature (condition evaluation, UI, and API) took about 500 lines of code.

How is it possible to implement such a major feature in just 500 lines? The secret is that the condition evaluation uses the expression parser we just discussed. Here’s a simplified version of [how it works](https://github.com/Vector35/debugger/blob/2e0c5f6d031bf4a2e30c0333715fbafbfd714115/core/debuggercontroller.cpp#L2559-L2577):

```cpp
bool DebuggerController::EvaluateBreakpointCondition(uint64_t address)
{
    const std::string condition = m_state->GetBreakpoints()->GetConditionAbsolute(address);
    if (condition.empty())
        return true;  // No condition means always stop

    // Use the expression parser to evaluate the condition
    uint64_t result = 0;
    std::string error;
    if (!BinaryView::ParseExpression(GetData(), condition, result, address, error))
        return true;  // Parse error, stop to be safe

    return result != 0;  // Non-zero means condition is true
}
```

The debugger simply calls `ParseExpression` on the condition string. If the result is non-zero, the condition is true and the debugger stops. That’s it. All the heavy lifting including parsing the expression, reading register values, performing arithmetic and comparisons is handled by the expression parser.

Because the condition is evaluated at the debugger core level rather than the adapter level, the same expression syntax is available across supported debugger adapters. The register and module names in an expression still depend on the target.

## But Wait — Comparison Operators?

You might be wondering: how does the expression parser handle conditions like `rax == 0x1234`? After all, it was originally a navigation feature. What does a comparison even mean in that context?

Back in December 2022, while I was adding the magic value support for register values, I also added comparison operators to the expression parser: `==`, `!=`, `>`, `<`, `>=`, `<=`. These operators return `1` if the condition is true, `0` otherwise.

I was already thinking ahead for conditional breakpoints. The expression parser already knew how to read register values and dereference memory locations making it a perfect match for evaluating breakpoint conditions. Adding comparison operators made it ready to use.

Then in December 2025, [3rdit](https://github.com/3rdit) reached out asking about adding conditional breakpoint support. I was excited — the foundation I’d laid three years earlier was finally going to be used. I told him that the expression parser was already there to support it so it shouldn’t be hard. He came back with [PR #941](https://github.com/Vector35/debugger/pull/941), which was merged with little modification.

Thanks to 3rdit for the contribution!

## How to Use Conditional Breakpoints

Here’s how to add a condition to a breakpoint.

### Setting a Condition

1.  Add a breakpoint at the desired location
2.  Right-click the breakpoint in the Breakpoints widget
3.  Select “Edit Condition…”
4.  Enter your condition expression
5.  Click OK

![Edit condition dialog](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8530a12f05ea5505.png)

Edit condition dialog

You can also view and edit conditions in the “Condition” column of the Breakpoints widget.

![Breakpoint condition in the breakpoint widget](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ec75c1660c37bc35.png)

Breakpoint condition in the breakpoint widget

### Example Conditions

These examples use x86-64 register names. Use the register names for your target architecture.

| Condition | When to stop |
| --- | --- |
| `rax == 0x1234` | `rax` equals a specific value |
| `rax != 0` | `rax` is non-zero |
| `rcx < 0n10` | `rcx` is less than decimal 10 |
| `[rsp] == 0` | The address-sized value at the stack pointer is zero |
| `rdi == rbp - 0x20` | `rdi` equals a stack address |

Remember that unprefixed numbers are hexadecimal: `10` means sixteen; `0n10` means ten.

### Using the API

In Binary Ninja’s Python console, `dbg` is the debugger controller for the current view. These examples assume you have already added breakpoints at the specified locations. Replace the addresses and module name with values from your target.

```python
from binaryninja.debugger import ModuleNameAndOffset

# Set a condition
dbg.set_breakpoint_condition(0x401000, "rax == 0x1234")

# With module-relative address
dbg.set_breakpoint_condition(ModuleNameAndOffset("myprogram", 0x1000), "rdi != 0")

# Get current condition
condition = dbg.get_breakpoint_condition(0x401000)

# Clear condition (set to empty string)
dbg.set_breakpoint_condition(0x401000, "")
```

For more details, see the [conditional breakpoints documentation](https://docs.binary.ninja/guide/debugger/index.html#conditional-breakpoints).

## What’s Next

The expression parser continues to evolve. One possible extension would be a string comparison function such as `streq`. For example, a hypothetical `streq(rdi, "password")` could stop when `rdi` points to that string. This is an idea for future work, not syntax you can use today.

We’d love to hear your feedback on what would make conditional breakpoints even more useful for your workflows.

Next time you press `G` in Binary Ninja, remember that you have a full expression parser at your fingertips. Skip the calculator and just use `rbp - 0x20` during your next debugging session.

## References

### Documentation

-   [Expression Parser API (parse_expression)](https://api.binary.ninja/binaryninja.binaryview-module.html#binaryninja.binaryview.BinaryView.parse_expression)
-   [Magic Values API (add_expression_parser_magic_value)](https://api.binary.ninja/binaryninja.binaryview-module.html#binaryninja.binaryview.BinaryView.add_expression_parser_magic_value)
-   [Conditional Breakpoints Guide](https://docs.binary.ninja/guide/debugger/index.html#conditional-breakpoints)
