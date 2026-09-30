---
title: "MCP Beyond the Spec: Inside Codex and Claude Code"
source: https://www.outflank.nl/blog/2026/09/30/mcp-design/
source_host: www.outflank.nl
clip_date: 2026-10-01T02:50:26+08:00
trace_id: 8c53562d-5a58-4ee3-b32a-6bb45c22f088
content_hash: 22718c6c4f41ef03df1be335e0448ecd0ac55307d5d5294a0278211902f14ade
status: synced
tags:
  - 协议分析
  - AI应用
series: null
feed_source: Outflank·红队研究
ai_summary: Codex 与 Claude Code 会在 MCP 规范之外自行裁剪、延迟加载和改写工具定义与输出，导致模型所见与服务器所发并不一致。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-8199-9aaa-c9e95ce13b64
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Codex 与 Claude Code 会在 MCP 规范之外自行裁剪、延迟加载和改写工具定义与输出，导致模型所见与服务器所发并不一致。
> 
> - **客户端差异：** MCP 规范只管通信，模型可见内容由客户端决定；仅用 MCP Inspector 验证不够，Codex 需借助 mitmproxy 抓包，Claude Code 需用模拟模型做动态分析。
> - **工具搜索：** 两者默认延迟加载 MCP 工具。Codex 对 GPT-5.6+ 用 code mode，初始提示不含工具名与定义；Claude Code 可见服务器说明和工具名但隐藏定义，按名称、`anthropic/searchHint`、描述排序，可用 `anthropic/alwaysLoad` 强制提前加载。
> - **静默裁剪：** Codex 对 Agent Plugin 安装的服务器截断超 1,000 字节的描述，并把输入 schema 转成 TypeScript，丢弃 `default`、`minimum`、`pattern`、`examples` 等关键字；Claude Code 默认截断 2,048 字符，可用 `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` 调整。
> - **输出截断：** Codex 按 4 字节/token 估算，默认裁到 40,000 字节并删掉中段；Claude Code 超 50,000 字符的结果写入文件，仅给前 2,000 字符预览，超 `MAX_MCP_OUTPUT_TOKENS`（默认 25,000）时只给路径。
> - **结果与审批：** Claude Code 成功且含 `structuredContent` 时丢弃 `content` 文本、`isError` 为真时只显示 `content`，且从不把 `_meta` 给模型；Codex 对缺失的 `destructiveHint`/`openWorldHint` 按 true 处理并要求审批。

Security tool developers like Outflank can expose capabilities to AI agents using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro). On the surface, this seems easy: define your tools, write short descriptions, and return some JSON. It seems to work fine, but sometimes an agent can’t find a tool, ignores your constraints, or misses an important tool output. Debugging the server with [MCP Inspector](https://github.com/modelcontextprotocol/inspector) yields no obvious bugs. What went wrong?

The MCP specification defines how clients and servers communicate, but it leaves many decisions about what the model actually sees up to the client. Popular MCP clients like Codex and Claude Code make their own choices about what the model sees, and they don’t always document those choices or make them predictable. This post details the MCP client implementations of [Codex 0.157.1](https://github.com/openai/codex/releases/tag/rust-v0.157.1) and [Claude Code 2.1.283](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21283). As Codex and Claude Code evolve, the quirks described here may change or disappear, and new ones may emerge. So treat the findings below as a snapshot of the client versions we tested.

## Client Validation

We recommend testing with [MCP Inspector](https://github.com/modelcontextprotocol/inspector) first to validate functionality and find bugs in your MCP server. This isn’t sufficient, though, as such tools only show tool definitions and raw outputs. The client sits between your server and the model, and it can hide tool definitions until the model searches for them, cut descriptions, drop schema keywords, and discard or truncate parts of a result. The schema shown in MCP Inspector may be materially different than what a model sees.

Because Codex is open source, we based most of our analysis on its [GitHub repository](https://github.com/openai/codex). Codex also saves each session to a rollout file, but that file can differ from what was actually sent. To check what Codex sends a model for your own server, capture its API traffic with a local proxy such as [mitmproxy](https://mitmproxy.org/):

```

HTTP_PROXY=http://127.0.0.1:8080 \
HTTPS_PROXY=http://127.0.0.1:8080 \
ALL_PROXY=http://127.0.0.1:8080 \
CODEX_CA_CERTIFICATE="$HOME/.mitmproxy/mitmproxy-ca-cert.pem" \
codex
```

Claude Code, on the other hand, is closed source. While an approach using mitmproxy could work, we relied on an emulated model in place of the Anthropic API to speed up dynamic analysis. The emulated model calls the same tools on every run, so the results don’t depend on a real model deciding to call them.

## Annotations

MCP clients can use [annotations](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool) to decide whether a tool requires user approval. We found annotations in Codex and Claude Code fairly predictable.

Codex’s default approval mode for MCP tools, “auto,” [requires approval](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/mcp_tool_call.rs#L2436-L2467) for tools with `**destructiveHint=true**`. Otherwise, it does not require approval for tools with `**readOnlyHint=true**`, or for tools that set both `**destructiveHint=false**` and `**openWorldHint=false**`. A missing `**destructiveHint**` or `**openWorldHint**` is treated as `**true**`, so tools without annotations require approval. When the session’s approval policy is “never,” Codex never prompts. If the session has no Codex-managed sandbox, or its sandbox allows writes anywhere on disk, Codex [skips these checks](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/codex-mcp/src/mcp/mod.rs#L91-L110) and runs every tool. Under a more restrictive sandbox, it denies any call that would have needed approval. By default, read-only tools are also the only tools Codex will call in parallel.

Claude Code uses `**readOnlyHint**` in two places: the plan-mode permission check and the decision to run tool calls in parallel. None of the modes we tested skips approval just because a tool has `**readOnlyHint=true**`. In plan mode, a tool without `**readOnlyHint=true**` requires approval, even if an allow rule matches it. Claude Code also reads `**_meta["anthropic/requiresUserInteraction"]**`, which [forces a prompt on every call](https://code.claude.com/docs/en/mcp#require-approval-for-a-specific-tool), regardless of allow rules and [bypass mode](https://code.claude.com/docs/en/permission-modes#skip-all-checks-with-bypasspermissions-mode). The [“don’t ask” mode](https://code.claude.com/docs/en/permission-modes#allow-only-pre-approved-tools-with-dontask-mode) will automatically deny tool calls with this attribute.

To confirm these rules for Claude Code, we had the emulated model call five tools with different annotations in five of Claude Code’s six permission modes, with and without an allow rule. Auto mode sends tool calls to a classifier that we couldn’t emulate, so we did not test it.

```

run = called without asking, ask = asked for approval, deny = refused without asking

With an allow rule for mcp__demo__*
  tool                                          default  acceptEdits  plan  bypassPermissions  dontAsk
  readOnlyHint: true                            run      run          run   run                run
  no annotations                                run      run          ask   run                run
  destructiveHint: true                         run      run          ask   run                run
  destructiveHint: false, openWorldHint: false  run      run          ask   run                run
  _meta anthropic/requiresUserInteraction       ask      ask          ask   ask                deny

Without an allow rule
  tool                                          default  acceptEdits  plan  bypassPermissions  dontAsk
  readOnlyHint: true                            ask      ask          ask   run                deny
  no annotations                                ask      ask          ask   run                deny
  destructiveHint: true                         ask      ask          ask   run                deny
  destructiveHint: false, openWorldHint: false  ask      ask          ask   run                deny
  _meta anthropic/requiresUserInteraction       ask      ask          ask   ask                deny
```

To test parallel calls, the emulated model sent two messages, each requesting three tools at once: first three read-only tools, then three tools with no annotations. Each tool took one second, and the test server logged when each call started and ended. Claude Code ran the read-only calls at the same time and the others one at a time.

```yaml

tool     annotation           start   end    timeline (1 character = 0.1 s)
read_a   readOnlyHint: true   0.00s   1.01s  ##########
read_b   readOnlyHint: true   0.00s   1.01s  ##########
read_c   readOnlyHint: true   0.00s   1.01s  ##########
write_a  no annotations       1.03s   2.03s            ##########
write_b  no annotations       2.04s   3.04s                      ##########
write_c  no annotations       3.04s   4.05s                                ##########
```

## Tool Search

To reduce context usage, both [Codex](https://github.com/openai/codex/pull/29486) and [Claude Code](https://code.claude.com/docs/en/mcp#configure-tool-search) defer MCP tools by default.

Codex uses [code mode](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/models-manager/models.json#L4-L20) (not to be confused with MCP code mode discussed below) for GPT-5.6+ models, which means the model calls tools from JavaScript. The model sees no MCP server instructions, tool names, or tool definitions in the initial prompt. It is [instructed](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/code-mode-protocol/src/description.rs#L15-L16) to write JavaScript to filter a list of available tool names and descriptions, and each server’s instructions are [prepended](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/code_mode.rs#L86-L94) to its tools’ descriptions in that list. This is likely why Codex users must sometimes tell the model about a tool or MCP in order to use it.

Claude Code [always sees](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search) MCP server instructions and tool names, but it does not see tool definitions. The harness includes a tool for keyword search. It ranks whole words in the server and tool names highest, splitting names on `**_**` but not on camelCase. Partial matches inside those words come next, then words in `**_meta["anthropic/searchHint"]**`, then whole words in tool descriptions. For example, a search for “invoice” won’t match a description that only says “invoices”.

Below is the first request Claude Code sent to our emulated API, followed by the results of two `**ToolSearch**` calls. Because ties are broken alphabetically, we named each test tool to sort ahead of the tools that should outrank it, so the “invoice” ranking comes entirely from Claude Code’s scoring. In the “billing” query, every billing tool matches the server name and ties, so those five fall back to alphabetical order. The `**add_notes**` tool sorts ahead of every billing tool but ranks last because it matches only through its description.

```sql

First request, before any search
  tools array:          ToolSearch, DeferredToolPlaceholder (defer_loading), mcp__billing__customer_lookup (alwaysLoad)
  deferred tool names:  mcp__accounts__add_notes, mcp__billing__digest, mcp__billing__export, mcp__billing__findInvoice,
                        mcp__billing__invoice_lookup, mcp__billing__ledger
  server instructions:  accounts, billing

ToolSearch query "invoice"
  rank  tool                           description                anthropic/searchHint
  1     mcp__billing__invoice_lookup   Looks up one record by ID.
  2     mcp__billing__findInvoice      Finds records.
  3     mcp__billing__export           Pushes data.               invoice export
  4     mcp__billing__digest           Summarizes each invoice.
  -     mcp__accounts__add_notes       Adds billing notes.
  -     mcp__billing__ledger           Summarizes invoices.

ToolSearch query "billing"
  rank  tool                           description                anthropic/searchHint
  1     mcp__billing__digest           Summarizes each invoice.
  2     mcp__billing__export           Pushes data.               invoice export
  3     mcp__billing__findInvoice      Finds records.
  4     mcp__billing__invoice_lookup   Looks up one record by ID.
  5     mcp__billing__ledger           Summarizes invoices.
  6     mcp__accounts__add_notes       Adds billing notes.
```

Claude Code also has a `**_meta["anthropic/alwaysLoad"]**` attribute that can be used to include a tool’s definition in the initial prompt, like `**customer_lookup**` above. Codex has no comparable per-tool flag. Only the user can opt a server out of deferral, with `**omit_tools_from = ["deferred"]**` under `**[mcp_servers.<name>]**` in `**config.toml**`.

## Silent Tool Definition Changes

Besides its name, the model sees two components of a tool definition: the description and the input schema. The description is free text about the tool.

Codex silently cuts any tool descriptions and [server instructions](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/tools/handlers/mcp.rs#L48-L89) longer than [1,000 bytes](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/mcp_tool.rs#L8-L55) for servers installed as [Agent Plugins](https://agent-plugins.org/). Tool descriptions for an MCP server added via `**config.toml**` are not truncated, but developers don’t have control over how an MCP gets installed.

By default, Claude Code truncates any tool description or server instructions longer than [2,048 characters](https://code.claude.com/docs/en/mcp#for-mcp-server-authors) and appends `**… [truncated]**`. Users can change this limit with `**CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH**`. To confirm the default limit, we connected two test servers. One sends a tool description and server instructions of exactly 2,048 ASCII characters, and the other sends 2,049. The output shows how long each text was when it reached our emulated API.

```css

MCP text              server sent   model received   received text ends with
tool description      2,048 chars   2,048 chars      ...ng. This sentence ends the text.
tool description      2,049 chars   2,061 chars      ...tence ends the text… [truncated]
server instructions   2,048 chars   2,048 chars      ...ng. This sentence ends the text.
server instructions   2,049 chars   2,061 chars      ...tence ends the text… [truncated]
```

The input schema is a JSON Schema object that defines the parameters for a tool. Codex normalizes every input schema into TypeScript and [only keeps](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/json_schema/types.rs#L36-L72) these standard keywords: **`type`**, **`description`**, **`enum`**, **`properties`**, **`required`**, **`additionalProperties`**, **`items`**, **`minItems`**, **`anyOf`**, **`oneOf`**, **`allOf`**, **`$ref`**, `**$defs**`, and **`definitions`**. Codex [silently drops](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/json_schema.rs#L45-L54) every other keyword, including `**default**`, `**minimum**`, `**maximum**`, `**pattern**`, `**format**`, `**minLength**`, `**maxLength**`, `**title**`, and `**examples**`. It also [empties](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/json_schema.rs#L114-L142) any nested schema that has no `**type**` and no keyword Codex can infer a type from, including its description. Schemas that use `**$ref**` or a combinator like `**anyOf**` are exempt. If the normalized schema is still over [5,000 bytes](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/json_schema/compaction.rs#L16-L39), Codex compacts it in up to [four passes](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/json_schema/compaction.rs#L34-L39). The first pass strips every `**description**`, so a large schema loses even the comments shown below. Codex then converts the normalized schema into TypeScript, with property descriptions [converted to comments](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/code-mode-protocol/src/json_schema_types.rs#L345-L360). For example, consider this input schema we sent to a proxied Codex instance:

```powershell

"count": {"type": "integer", "minimum": 1, "maximum": 7, "default": 3, "description": "Use an integer from 1 to 7; default 3."},
"tag": {"type": "string", "minLength": 2, "maxLength": 8, "pattern": "^[a-z]+$", "title": "Synthetic tag", "examples": ["demo"], "description": "Use 2 to 8 lowercase letters, such as demo."},
"untyped": {"description": "UNTYPED_DESCRIPTION_SENTINEL"}
```

Codex generated the following TypeScript for a tool with these parameters. By default, the model only sees it when its script prints the tool’s entry from the tool list.

```css

declare const tools: { mcp__probe__probe_schema(args: {
  // Use an integer from 1 to 7; default 3.
  count?: number;
  // Use 2 to 8 lowercase letters, such as demo.
  tag?: string;
  untyped?: unknown;
}): Promise<CallToolResult>; };
```

Every bound, default, pattern, and example is gone, `**integer**` became `**number**`, and only the descriptions survive as comments. The `**untyped**` field lost its description because it has no type.

## Truncated Tool Outputs

MCP tools can return data in two fields: `**content**` and `**structuredContent**`. The [spec recommends](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content) sending structured results in both fields. There is also a boolean `**isError**` flag and an optional `**_meta**` object.

Codex [passes](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/tools/src/tool_output.rs#L209-L218) `**content**`, `**structuredContent**`, and `**isError**` to the model’s script, and the model only sees what the script prints. If the script prints the whole result, the model sees both copies of your data.

When a successful result includes `**structuredContent**`, Claude Code discards the text in `**content**` and only shows `**structuredContent**` to the model. Images in `**content**` still reach the model. When `**isError**` is `**true**`, Claude Code only shows `**content**`. We found this behavior surprising. Claude Code does not show `**_meta**` to the model.

We had a test server return three results with different markers in `**content**` and `**structuredContent**`, then recorded what Claude Code sent to the model:

```css

1. Success with text and structuredContent
   MCP server returned   content: [text 'TEXT_CONTENT']
                         structuredContent: {"marker": "STRUCTURED_CONTENT"}
                         _meta: {"marker": "META"}
   model received        content: [text '{"marker":"STRUCTURED_CONTENT"}']

2. Error with text and structuredContent
   MCP server returned   content: [text 'TEXT_CONTENT']
                         structuredContent: {"marker": "STRUCTURED_CONTENT"}
                         isError: true
   model received        content: [text 'TEXT_CONTENT']
                         is_error: true

3. Success with text, an image and structuredContent
   MCP server returned   content: [text 'TEXT_CONTENT', image/png image]
                         structuredContent: {"marker": "STRUCTURED_CONTENT"}
   model received        content: [image/png image, text '{"marker":"STRUCTURED_CONTENT"}']
```

There are also limits on how much output reaches the model. Codex gives the script the whole result, but [cuts the script output](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/core/src/tools/code_mode/mod.rs#L311-L327) to [40,000 bytes](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/code-mode-protocol/src/description.rs#L28) by default. That limit is labeled as 10,000 tokens, but Codex never runs a tokenizer on the output. Instead, it [assumes four bytes per token](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/utils/string/src/truncate.rs#L4) and cuts by UTF-8 bytes, so non-ASCII text keeps fewer characters. Unexpectedly, Codex removes data from [the middle](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/utils/string/src/truncate.rs#L56-L145) of long outputs, keeping about 20,000 bytes from each end. It [prepends a warning](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/utils/output-truncation/src/lib.rs#L20-L31) with the original token count and line count, and inserts `**…N tokens truncated…**` at the cut.

With default settings and no per-tool size override, Claude Code writes text-only tool responses over [50,000 characters](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#2151) to a file. The model is shown the file path and a [preview](https://github.com/anthropics/claude-code/issues/23948) of the first 2,000 characters. For a result without `**structuredContent**`, the preview shows the JSON-encoded `**content**` array, so the JSON wrapper and escaped newlines use part of those 2,000 characters. If the result exceeds **`MAX_MCP_OUTPUT_TOKENS`** (25,000 by default), the model receives the file path without a preview. Tool errors and results containing images follow separate truncation paths. A tool can override the text limits with `**_meta["anthropic/maxResultSizeChars"]**`.

We had a test server return text results of 50,000, 50,001, and 100,000 characters. Claude Code estimates four characters per token, rounded to the nearest token. Once that estimate passes 12,500 tokens, half the limit, it asks the API for an exact count. Our emulated API answered those requests with the numbers shown, so the last two rows differ only in the token count.

```

row  MCP text result      count_tokens reply   model received
A    50,000 characters    (not requested)      the full text (50,000 characters)
B    50,001 characters    (not requested)      file path + 2,000-character preview
C    100,000 characters   25,000 tokens        file path + 2,000-character preview
D    100,000 characters   25,001 tokens        file path only (1,551-character notice)

Preview in row C starts:
  [
    {
      "type": "text",
      "text": "Row C line 00001: synthetic output for a size check.\nRow C line 00002: synthetic output for a size chec...

Notice in row D starts:
  Error: result (100,000 characters across 1,887 lines) exceeds maximum allowed tokens. Output has been saved to <path>.
```

## Code Mode Servers

Hex-Rays recently [announced](https://hex-rays.com/blog/hex-rays-ida-mcp-server) the official IDA MCP server. They decided to follow Cloudflare’s “ [code mode](https://blog.cloudflare.com/code-mode/) ” architecture. Cloudflare argues, “LLMs have seen a lot of code. They have not seen a lot of ‘tool calls’.” The basic idea is this: instead of creating tools for capabilities in your application, provide models with an API and prompt them to interact with your application using Python or JavaScript.

Anthropic [published](https://www.anthropic.com/engineering/code-execution-with-mcp) a code mode write-up where they dropped tokens in one workflow by over 98%! Code mode is especially useful for exposing applications with a wide range of functionality that might otherwise require many tools, or for workflows where intermediate output is often used as the input for subsequent tools instead of consumed directly. That said, some workflows may not benefit much from reducing intermediate outputs. Smaller models may also struggle without the guidance provided by purpose-built tools. An MCP server can also provide specific tools alongside code mode to support a wider range of use cases. The decision of whether to use traditional tools, code mode, or both will be specific to the application you are exposing to an agent.

## Conclusion

Exposing capabilities to AI agents provides new use cases for existing applications. While MCP is a great choice for many scenarios, one must be aware of the quirks and constraints imposed by popular clients. In this post, we analyzed two of the most popular MCP clients, but there are other clients worth investigating, like [Cursor](https://cursor.com/) and [OMP](https://github.com/can1357/oh-my-pi). We encourage security tool developers to research the clients preferred by their users and do similar analysis to ensure optimal compatibility.

Outflank continually expands the tools and techniques available in Outflank Security Tooling ([OST](https://outflank.nl/services/outflank-security-tooling/)), a broad set of evasive tools that allow users to safely and easily perform complex offensive security tasks. We aim to expand the options available to red team operators through development of [AI skills](https://www.outflank.nl/blog/2026/09/02/red-team-ai-skills/) and MCP servers. Consider scheduling an expert-led demo to learn more about the diverse offerings in OST.

The post [MCP Beyond the Spec: Inside Codex and Claude Code](https://www.outflank.nl/blog/2026/09/30/mcp-design/) appeared first on [Outflank](https://www.outflank.nl/).
