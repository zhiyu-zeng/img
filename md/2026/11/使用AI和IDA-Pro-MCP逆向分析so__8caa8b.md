---
title: 使用AI和IDA Pro MCP逆向分析so
source: https://fatkun.github.io/post/2026/ida_pro_mcp/
source_host: fatkun.github.io
clip_date: 2026-11-05T10:26:46+08:00
trace_id: 400a3d54-2548-4004-9c5b-bd0adcf6b3d4
content_hash: 1f5ef0b662a34879849875cc04d001ce6f14f33b57da07473c4cf6fa559bb3aa
status: synced
tags:
  - AI辅助逆向
  - Android逆向
series: null
feed_source: Fatkun·安卓逆向
ai_summary: 通过 IDA Pro MCP 让 AI 逆向安卓 so 加密算法：静态分析配合精心设计的提示词与 frida hook 验证，可还原 AES/SM3 等可逆算法。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40f75244-d011-81b4-8a2f-dd0f78e5ceac
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 IDA Pro MCP 让 AI 逆向安卓 so 加密算法：静态分析配合精心设计的提示词与 frida hook 验证，可还原 AES/SM3 等可逆算法。
> 
> - **传统方案对比：** so 逆向三条路中，frida 调用最简单但需真机/模拟器，unidbg 需补环境，直接分析汇编最复杂；AI + ida-pro-mcp（在 IDA 的 Edit/Plugins 中开启）显著降低门槛，代码少可直接发 AI，多则走 MCP。
> - **提示词关键约束：** 禁止 AI 手动做进制转换（必须用 int_convert MCP 工具）、禁止暴力破解；要求重命名 v1/a1 等无意义变量与函数、修正类型、补充注释，最终产出 report.md 并在其上增量更新。
> - **frida17 API 破坏性变更：** AI 默认生成旧 API，需明确提供说明——Memory.readU32/writeU32 改为 NativePointer 的链式方法；Module.findExportByName/getBaseAddress 等静态方法已移除，改为 `Process.getModuleByName('libc.so').getExportByName('open')` 风格。
> - **静态分析局限：** 密钥可能运行时动态设置，静态分析拿不到正确密钥，可让 AI 编写 frida hook 脚本动态捕获；同时将抓到的输入输出单独保存提供给 AI，便于验证分析结论。
> - **效果与瓶颈：** 分析靠重命名和 report.md 推进，中断可指定函数继续；AES/SM3 类算法可让 AI 用 Python 实现还原密文验证。简单混淆无所遁形，但控制流扁平化耗时长、需人授权运行代码，且目前仅静态分析，动态分析 so 尚未解决。

## 背景

有些安卓应用会使用so来实现加密算法，来提高逆向的成本，而且so本身还会做了些混淆，检测是否在真机上运行。

一般逆向so的方法有这几种

-   使用frida调用（最简单，但是需要真机/模拟器）
-   使用unidbg模拟运行（有点复杂，需要补环境）
-   直接分析so算法（最复杂，需要基于汇编/伪代码分析）

目前有了AI之后，就算对逆向不是很了解，也有可能进行分析。

## 分析

如果so代码不多，可以把代码发给AI分析，如果比较多的话，还是通过MCP来分析。首先要安装 [IDA-PRO-MCP](https://github.com/mrexodia/ida-pro-mcp), 按文档安装。 使用ida-pro打开so文件，然后再 `Edit/Plugins` 里面开启MCP。

## 提示词

如果不添加提示词，AI可能处理不太准确，特别是一些数字的转换，首页上有提示词。这里给出我的提示词。

```md
你的任务是在 IDA Pro 中分析打开程序。
你可以使用 MCP 工具（如 ida-pro-mcp）来获取反编译、反汇编和程序结构信息。

请严格按照以下逆向分析策略执行：

1. 首先检查 IDA 的反编译结果（F5 输出），结合语义理解代码逻辑，并在关键位置添加注释。
2. 将无意义的变量名（如 v1、v3、a1 等）重命名为具有实际语义的名称。
3. 如有必要，修改变量和函数参数的类型，尤其是指针、数组和结构体类型，以提高代码可读性。
4. 将函数重命名为能够准确描述其行为的名称（例如校验函数、解密函数、初始化函数等）。
5. 当反编译信息不足或存在歧义时，请查看对应的反汇编代码，并基于汇编指令补充注释和分析结论。
6. 绝对不要自行进行任何数字进制转换（例如十六进制转十进制），如有需要，必须使用 int_convert MCP 工具。
7. 禁止尝试任何形式的暴力破解，所有结论必须通过反汇编逻辑分析和必要的简单 Python 推导脚本得出。
8. 分析过程中请始终关注：
   - 输入数据的来源与长度
   - 校验逻辑与失败分支
   - 字符串处理、循环结构、状态机或加密/混淆逻辑
9. 在分析完成后，请生成一个 report.md 文件，内容包括：
   - 程序整体结构概览
   - 关键函数说明（含重命名理由）
   - 校验/解密流程的完整逻辑说明
   - 得出最终结论的推导过程
10. 请不要随意生成文档，如果文档有更新，尽可能在原文档更新。代码也不要随意生成不同的文件。

请以“逆向工程师”的视角进行分析，避免臆测、过度抽象或脱离汇编语义的解释。
```

## 分析目标

说明你要分析的方法，如果你使用frida抓取到了输入输出，可以单独保存到一个文件，也一并提供给AI分析，便于后期验证。

另外由于这样分析so文件是静态的，可能有一些加密密钥是后面动态设置的，使用静态分析无法获取到正确的密钥。可以让AI帮你编写frida hook脚本，动态捕获信息。

使用frida需要注意，frida17版本后，API有不兼容变更，默认AI生成的代码还是用旧的版本，就算你提醒它使用17版本，它也可能生成错误。所以要明确告诉AI frida版本变更，提示词如下：

```javascript
frida17.5版本API说明
Memory read/write APIs
Back in the day, you’d access memory like this:

const playerHealthLocation = ptr('0x1234');
const playerHealth = Memory.readU32(playerHealthLocation);
Memory.writeU32(playerHealthLocation, 100);
The modern equivalent is:

const playerHealthLocation = ptr('0x1234');
const playerHealth = playerHealthLocation.readU32();
playerHealthLocation.writeU32(100);
Where each write-counterpart returns the NativePointer itself, to support chaining:

const playerData = ptr('0x1234');
playerData
    .add(4).writeU32(13)
    .add(4).writeU16(37)
    .add(2).writeU16(42)
    ;
The legacy versions of these are now also gone, and have been gone from our TypeScript bindings for as long as the legacy-style enumeration APIs. So this change should also not be noticable to most of you.

Static Module APIs
Now for the breaking changes that also affect users who were current with the TypeScript bindings, prior to 19.0.0, released together with Frida 17. The following static Module methods are now gone:

Module.ensureInitialized()
Module.findBaseAddress()
Module.getBaseAddress()
Module.findExportByName()
Module.getExportByName()
Module.findSymbolByName()
Module.getSymbolByName()
These are all straight-forward to migrate away from.

But first, let’s cover the odd one out:

Module.getSymbolByName(null, 'open')
This is now accomplished like this:

Module.getGlobalExportByName('open')
For the rest, you first need to look up the Module, and then access the desired property or method on it. For example, instead of:

Module.getExportByName('libc.so', 'open')
The new way is:

Process.getModuleByName('libc.so').getExportByName('open')
The equivalent for Module.getBaseAddress() is thus:

Process.getModuleByName('libc.so').base
This means there is now only one way to do Module introspection, and the API design is such that we encourage you to write performant code. For example, in the past you might have been tempted to do:

const openImpl = Process.getExportByName('libc.so', 'open');
const readImpl = Process.getExportByName('libc.so', 'read');
But now you’ll probably think twice before doing:

const openImpl = Process.getModuleByName('libc.so').getExportByName('open');
const readImpl = Process.getModuleByName('libc.so').getExportByName('read');
And instead do:

const libc = Process.getModuleByName('libc.so');
const openImpl = libc.getExportByName('open');
const readImpl = libc.getExportByName('read');
Which is both more readable and more performant.
```

## 分析过程

分析过程中会对方法、字段做重命名，帮助了解。另外会总结一个report.md，如果中途没分析完成中断，就让它继续分析某些方法。 最后如何分析成功的话，可以让AI判断算法是否可以逆向还原，一般像AES\\SM3之类的算法是可以还原的，可以让AI尝试用python实现还原算法，看看能否成功还原密文。

## 结论

AI让一些简单的混淆无所遁形，不过一些复杂的混淆，控制流扁平化，还是要让AI花比较多时间分析，而且目前需要人的参与比较多，可能是我提示词不够好，不能让它一直工作下去。另外由于它要运行一些代码验证，也需要对他进行授权。 另外目前我也只是静态分析so，不知道有没有办法动态分析so，如果动态分析so的话，应该就不用使用frida了。
