---
title: Keeping Claude at Bay - Old Models are Still Useful
source: https://blog.zsec.uk/claude-tips/
source_host: blog.zsec.uk
clip_date: 2026-09-15T10:21:05+08:00
trace_id: a1a87876-5009-4f35-97cd-0a5cc559249e
content_hash: 6cae8643a212f4992c91936db998fcf475d230fa9d7306c8cbb23b39215bbc84
status: synced
tags:
  - 安全工具
  - AI应用
series: null
feed_source: zsec·逆向安全
ai_summary: 新版本 Claude 的安全审查会拦住网络安全类请求并自动降级到审查更严的模型，可通过配置把旧模型重新固定进 `/model` 选择器继续使用。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3dc75244-d011-8135-8f29-d136597626cb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 新版本 Claude 的安全审查会拦住网络安全类请求并自动降级到审查更严的模型，可通过配置把旧模型重新固定进 `/model` 选择器继续使用。
> 
> - **触发拦截：** 请求被 Fable 5.1 标记为 `[cyber]` 后回落到 Opus 4.8，随后再次被拦并提示申请 Cyber Verification Program。
> - **三种固定方式：** 会话内直接写 `/model claude-opus-4-6`；在 `~/.claude/settings.json` 加 `"model"` 键设为默认；加 `"modelPicker": {"options": [...]}` 生成持久的选择器行。
> - **行字段：** `model`（必填，目录 ID 或经 `modelOverrides` 映射的 provider ID）、`label`、`description`，以及 `behavesAs`——当前构建不认识该 ID 时借用指定模型的提示档案与能力标志，但发往 API 的仍是原 ID；同级设 `replaceBuiltInOptions: true` 只保留默认项加自定义行。
> - **版本差异：** 4.7/4.8 为原生 1M 上下文并支持 effort、xhigh、adaptive；4.6 与 Sonnet 4.6 是 200K（`[1m]` beta 可扩展）但不支持 xhigh；Opus 4.5 无 effort 能力，其 `[1m]` 后缀只是能解析，不会真正扩窗。
> - **踩坑与升级找回：** `modelPicker` 不跨设置源合并，且只在托管设置、`--settings`/SDK 与用户设置中读取，项目级配置被忽略；需写裸 ID 让 CLI 自行解析快照日期；改设置后必须开新会话。构建内嵌的模型目录会随升级丢失条目，可用 `strings -a` 过滤 `~/.local/share/claude/versions/` 下的对应二进制来 dump 目录或单个模型条目，再配合 `behavesAs` 让该行重新出现。

![Keeping Claude at Bay - Old Models are Still Useful](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d7181ccc5d317fec.jpg)

Anyone who is playing around with AI for offensive and defensive tooling has likely already hit the dreaded safeguard warnings when doing something so benign but claude decides you're on the naughty step and will continue to refuse:

```
Fable 5.1's safeguards flagged this message. Our intentionally broad safeguards allow us to deliver more capabilities faster, but can sometimes flag legitimate coding, cybersecurity, and biology tasks. Switched to Opus 4.8. Send feedback with /feedback or learn more

Details: `[cyber]`
```

Then when it falls back it then proceeds to thow you on the second naughty step:

```
API Error: Opus 4.8's safeguards flagged this message. Our intentionally broad safeguards allow us to deliver more capabilities faster, but can sometimes flag legitimate cybersecurity work. Apply to the Cyber Verification Program to reduce these interruptions.
```

It feels like back in the good old days 4.6/4.7 were the last models to happily comply and with every iteration of Claude the model selector gets updated and in some instances you will lose your beloved 4.6 models. So this blog post pulls together a quick guide to bring them back and embed them in your config for easier reference:

![Keeping Claude at Bay - Old Models are Still Useful](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a0681c58c0ec6e38.png)

Keeping Claude at Bay - Old Models are Still Useful

## Pinning Older Models in Model Picker

Claude Code's `/model` picker only shows the current generation of models, but the CLI's built-in model catalog goes back further than that. Older models are already there; the picker just doesn't surface them by default. Getting to them is a matter of telling the CLI you want them, and there are a few ways to do that depending on how permanent you want the choice to be.

Pick whichever matches how long you want the choice to stick around. These are alternatives.

**Just for this session**, simply type the model ID directly into `/model`. The picker filters the list it shows you, but the underlying command accepts any valid catalog ID:

`/model claude-opus-4-6`

**As your default for every session:** add a `model` key to `~/.claude/settings.json`. Both full IDs and aliases work here:

```
json"model": "claude-opus-4-6[1m]"
```

**As permanent picker rows:** add a `modelPicker` block to the same file. This gives you labelled rows you can arrow through in the picker, and they persist across upgrades.

```json
"modelPicker": {
  "options": [
    { "model": "claude-opus-4-8",   "label": "Opus 4.8",   "description": "Previous-gen Opus - 1M native" },
    { "model": "claude-opus-4-7",   "label": "Opus 4.7",   "description": "Previous-gen Opus - 1M native" },
    { "model": "claude-opus-4-6",   "label": "Opus 4.6",   "description": "Previous-gen Opus - 200K, [1m] beta" },
    { "model": "claude-opus-4-5",   "label": "Opus 4.5",   "description": "Previous-gen Opus - 200K" },
    { "model": "claude-sonnet-4-6", "label": "Sonnet 4.6", "description": "Previous-gen Sonnet - 200K, [1m] beta" }
  ]
}
```

### Row Schema

Each row in `options` supports four fields which can be useful for additional expansion for example if you're using claude code as a harness for other local models this sometimes works nicely.

-   `model` (required) - the catalog ID, or a provider ID you've mapped via `modelOverrides`.
-   `label` (optional) - what the picker displays. This is entirely yours to name; it doesn't have to match the catalogs own `display_name`.
-   **`description`** (optional) - the dimmer second line shown under the label.
-   **`behavesAs`** (optional) - only useful when the current CLI build doesn't know the model ID you're specifying. Set it to a model the build *does* know, and the CLI borrows that model's prompt profile, capability flags, and effort defaults. It doesn't change the label or the ID sent to the API.  
      
    There's one more sibling field worth knowing: `**replaceBuiltInOptions**`. Set that to `true` at the same level as `options` and the picker shows only the Default entry plus your rows, hiding the built-in lineup entirely. Leave it unset and your rows will append after the defaults.

### What Each Row Gets You

**So now we're a bit more familiar with the options available, the models themselves hold some slightly different benefits. All of it very much matters what you're feeding the model as input. And, a harness which depends on the output you get and how heavy the guard rails end up being, I've written about harnesses in the** [**past which you can find more about here**](https://blog.zsec.uk/harnessing-harnesses/#what-is-a-harness)**.**

These figures come straight from the catalog compiled into Claude Code build `2.1.261`. Capability flags matter more than version numbers here they determine whether `effortLevel` settings and the `[1m]` suffix do anything at all.

Every row below has `context_management`. Max output is listed as default / upper.

| Row | Catalog ID | Context | Max Output | Capabilities |
| --- | --- | --- | --- | --- |
| Opus 4.8 | `claude-opus-4-8` | 1M native | 64K / 128K | effort, xhigh, adaptive |
| Opus 4.7 | `claude-opus-4-7` | 1M native | 64K / 128K | effort, xhigh, adaptive |
| Opus 4.6 | `claude-opus-4-6` | 200K · 1M beta | 64K / 128K | effort, no xhigh, no adaptive |
| Opus 4.5 | `claude-opus-4-5` | 200K | 32K / 64K | no effort, no adaptive |
| Sonnet 4.6 | `claude-sonnet-4-6` | 200K · 1M beta | 32K / 128K | effort, no xhigh, no adaptive |

## Things That Will Catch You Out

**Precedence**: `modelPicker` doesn't merge across settings sources. Whichever source has the highest precedence and defines `modelPicker` wins outright so if you mess this up the others are ignored entirely. The key is also only read from managed settings, `--settings` /SDK, and user settings. A project-level `.claude/settings.json` is ignored for this key specifically so you need to set it globally for it to work properly.

**Effort levels**: A global `"effortLevel": "high"` does nothing on Opus 4.5, which has no effort capability at all. On Opus 4.6 and Sonnet 4.6, `high` and `max` work but `xhigh` doesn't as that flag only arrived with 4.7.

**Snapshot IDs**: Write the bare model ID not the dated snapshot to load it into Claude Code, for example `claude-opus-4-5` resolves to the correct dated snapshot (`claude-opus-4-5-20251101`) automatically on a per-provider basis. Writing the date yourself risks creating a string the catalog won't match.

**The `[1m]` suffix**: "1M context" covers three different things. `native_1m` means the window is already a million tokens (4.7, 4.8). `supports_1m_beta` means the suffix genuinely widens a 200K window (4.6, Sonnet 4.6). `supports_1m_suffix` on its own just means the suffix parses without erroring Opus 4.5 has that flag and nothing more, so the suffix won't actually get you more context.

**Allowlists:** if `availableModels` is set anywhere in your config, it still filters these rows. An undefined `availableModels` permits everything; an empty array permits only the default model.

**Restart required** picker rows are read at startup. A settings change needs a new session, not just a new prompt.

## After a CLI Upgrade

The model catalog is compiled into each build, so a model can disappear when you upgrade, and an ID you want might predate a given build entirely. Both situations are recoverable.

**Dump the catalog of whatever build is installed:**

```bash
# the CLI is a standalone binary, one file per version
F=~/.local/share/claude/versions/$(claude --version | awk '{print $1}')

strings -a "$F" | grep -o 'id:"claude-[a-z0-9-]*",family:"[a-z]*",display_name:"[^"]*"' | sort -u
```

**Read one model's full entry:**

```bash
strings -a "$F" | grep -o 'id:"claude-opus-4-6".\{0,650\}' | head -1

# look for: context{}, max_output_tokens{}, capabilities[], provider_ids{}
```

If a build no longer recognises an ID, its picker row is silently dropped rather than flagged as an error. That's what `behavesAs` is for, so if you point it at a model the current build does know and the row reappears, while still sending your original ID to the API:

```json
{ "model": "claude-opus-4-6", "label": "Opus 4.6", "behavesAs": "claude-opus-4-8" }
```

For Bedrock or Vertex users, the parallel to `modelPicker` is `modelOverrides` a flat map from Anthropic model IDs to the provider's own IDs or inference-profile ARNs.

### Not Yet Verified

I haven't been able to verify some of the settings in Claude Code but from what I can tell The binary also carries `ANTHROPIC_CUSTOM_MODEL_OPTION` (plus `_NAME`, `_DESCRIPTION`, `_SUPPORTED_CAPABILITIES`) and per-family overrides like `ANTHROPIC_DEFAULT_OPUS_MODEL`, which remap what the `opus` alias resolves to. In the source these sit grouped with the Bedrock, Vertex, and Foundry variables, so they look gateway-oriented. They weren't tested on a first-party account also `modelPicker` is the documented, first-party path, grab that first.

A lot of this might not be new knowledge to many reading but if it's been useful to one person you've learnt a lesson much like me 😄
