---
title: 【微信】Uber ADR Discovery 源码笔记
source: https://mp.weixin.qq.com/s/QUzdiDRV3ukKESsB2bATLQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T21:01:32+08:00
trace_id: eb9b7a5d-6582-4d32-a407-93916a413278
content_hash: a2fa61a596fe39e44c317fa6a63d0ef677547c2a3e8084f1f6f4e405a0172a1e
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-8169-b9db-e4ccb84b6b49
ioc:
  cves: []
  cwes: []
  hashes:
    - 2fc2d21afc0a9c41858a928e44b292ae
    - 34bc92dfda899a869c06b1e8843a9fab
    - bcc24be2621afa96a7cb6eb2c8f58acc
  domains: []
  tools: []
  techniques: []
---

**百晓安全** *2026年11月10日 18:00*

版本锚定： `uber/ADR` 仓库 `Discovery/` 目录，catalog `2026.10.12` ，schema `1.2` ，Python 3.11+，仅标准库。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/572102a304c2d45a.png)

## 目录

一、找什么

1.1 18 类 Kind

1.2 6 类证据通道与九个入口

1.3 37 条 catalog

1.4 6 类目录型 surface

1.5 Asset 字段

1.6 Evidence 阶梯与置信分档

二、怎么找

2.1 阶段契约

2.2 Budget 字段

2.3 M2 Enumerate

2.4 M3 Extract

2.5 M4 Identify

2.6 M5 Resolve

2.7 M6 Judge

2.8 M7 Report

三、横切约束

3.1 Coverage 七字段

3.2 Redaction 规则

3.3 预算与架构的对应

3.4 边界条件

四、三平台实现差异

五、CLI

六、实测（macOS，本机）

6.1 运行方式

6.2 CLI 输出原文

6.3 snapshot 顶层字段

6.4 单条资产原文

6.5 coverage 原文

6.6 findings 原文

6.7 汇总

6.8 catalog 外产品

6.9 diff

七、测试覆盖

八、缺口

8.1 代码限制

8.2 设计取舍

附录　代码坐标索引

* * *

## 一、找什么

### 1.1 18 类 Kind

`contracts/records.py::Kind` 是封闭枚举，注释写明：没有枚举成员的类别无法被上报。

```objectivec
class Kind(str, Enum):
    CLI_AGENT = "cli_agent"
    APP = "app"
    AI_BROWSER = "ai_browser"
    MODEL_RUNTIME = "model_runtime"
    MODEL_WEIGHTS = "model_weights"
    EXTENSION = "extension"
    MCP_SERVER = "mcp_server"
    MCP_BUNDLE = "mcp_bundle"
    SKILL = "skill"
    COMMAND = "command"
    PLUGIN = "plugin"
    OUTPUT_STYLE = "output_style"
    AGENT_DEFINITION = "agent_definition"
    HOOK = "hook"
    INSTRUCTIONS = "instructions"
    CI_AGENT = "ci_agent"
    CLOUD_AGENT = "cloud_agent"
    AGENT_PLATFORM = "agent_platform"
```

按性质分四组：

| 组   | 成员  |
| --- | --- |
| 可执行体 | `cli_agent` `app` `ai_browser` `model_runtime` |
| 模型资产 | `model_weights` |
| 扩展面 | `extension` `mcp_server` `mcp_bundle` `skill` `command` `plugin` `output_style` `agent_definition` `hook` `instructions` |
| 远端  | `ci_agent` `cloud_agent` `agent_platform` |

`instructions` 没有可执行代码，但决定 agent 的行为边界，同样计入资产。

### 1.2 6 类证据通道与九个入口

```cpp
class Channel(str, Enum):
    FILESYSTEM = "filesystem"
    PACKAGE = "package"
    REGISTRY = "registry"
    CONFIG = "config"
    RUNTIME = "runtime"
    NETWORK = "network"
```

| Channel | 入口函数 | 读什么 |
| --- | --- | --- |
| `package` | `sources/registries.py::from_packages` | brew / dpkg / apk / snap / flatpak / rpm / npm / pip |
| `registry` | `sources/registries.py::from_applications` | macOS LaunchServices、Windows Uninstall + AppX、Linux `.desktop` |
| `runtime` | `sources/registries.py::from_kernel` | 进程表、可执行路径、argv |
| `config` | `sources/appstate.py::from_app_state` | 26 个配置文件模板、14 个 state root、浏览器 profile、编辑器扩展目录 |
| `filesystem` | `sources/binaries.py::BIN_ROOTS`<br><br>、 `sources/modelstores.py` | 13 个 bin 目录、6 个模型目录 |
| `network` | `sources/network.py::from_network` | TCP 连接表、DNS cache、本地模型端口 |
| `runtime` | `sources/execjournal.py::from_exec_journal` | 扫描间隙内启动并退出的短命进程 |

`execjournal` 补的是「扫的时候没在跑」这个缺口。进程表抓不到几秒就退出的 agent，但 shell history 和审计日志里有记录。

### 1.3 37 条 catalog

`catalog/catalog.json` ，version `2026.10.12` 。按 kind 分布： `cli_agent` 12、 `app` 10、 `model_runtime` 7、 `extension` 6、 `ai_browser` 2。

| #   | id  | name | kind | vendor | 指纹键 | risk_factors |
| --- | --- | --- | --- | --- | --- | --- |
| 1   | `claude-code` | Claude Code | `cli_agent` | Anthropic | binaries, install_layouts, packages, state_dirs | executes_shell |
| 2   | `gemini-cli` | Gemini CLI | `cli_agent` | Google | binaries, packages, state_dirs | executes_shell |
| 3   | `antigravity-cli` | Antigravity CLI | `cli_agent` | Google | binaries, packages, state_dirs | executes_shell |
| 4   | `antigravity` | Google Antigravity | `app` | Google | bundle_ids, desktop_ids, state_dirs | \-  |
| 5   | `codex-cli` | Codex CLI | `cli_agent` | OpenAI | binaries, packages, state_dirs | executes_shell |
| 6   | `aider` | Aider | `cli_agent` | Aider AI | binaries, packages, state_dirs | executes_shell |
| 7   | `opencode` | opencode | `cli_agent` | opencode | binaries, packages, state_dirs | executes_shell |
| 8   | `goose` | goose | `cli_agent` | Block | binaries, state_dirs | executes_shell |
| 9   | `cursor` | Cursor | `app` | Anysphere | bundle_ids, desktop_ids, state_dirs | \-  |
| 10  | `claude-desktop` | Claude Desktop | `app` | Anthropic | bundle_ids, state_dirs | \-  |
| 11  | `vscode` | Visual Studio Code | `app` | Microsoft | bundle_ids, desktop_ids, state_dirs | \-  |
| 12  | `ollama` | Ollama | `model_runtime` | Ollama | binaries, model_dirs, ports, state_dirs | local_inference |
| 13  | `lm-studio` | LM Studio | `model_runtime` | LM Studio | bundle_ids, ports | local_inference |
| 14  | `continue` | Continue | `extension` | Continue | extension_ids, state_dirs | \-  |
| 15  | `github-copilot` | GitHub Copilot | `extension` | GitHub | extension_ids | \-  |
| 16  | `comet` | Comet | `ai_browser` | Perplexity | bundle_ids | browses_autonomously |
| 17  | `amp` | Amp | `cli_agent` | Sourcegraph | binaries, packages | \-  |
| 18  | `crush` | Crush | `cli_agent` | Charm | binaries, packages | \-  |
| 19  | `qwen-code` | Qwen Code | `cli_agent` | Alibaba | binaries, packages | \-  |
| 20  | `kilo-cli` | Kilo CLI | `cli_agent` | Kilo Code | binaries, packages | executes_shell |
| 21  | `github-copilot-cli` | GitHub Copilot CLI | `cli_agent` | GitHub | binaries, packages | \-  |
| 22  | `windsurf` | Windsurf | `app` | Codeium | bundle_ids, desktop_ids | \-  |
| 23  | `zed` | Zed | `app` | Zed Industries | bundle_ids, desktop_ids | \-  |
| 24  | `trae` | Trae | `app` | ByteDance | bundle_ids, desktop_ids | \-  |
| 25  | `chatgpt-desktop` | ChatGPT | `app` | OpenAI | bundle_ids | \-  |
| 26  | `perplexity-desktop` | Perplexity | `app` | Perplexity | bundle_ids | \-  |
| 27  | `cline` | Cline | `extension` | Cline | extension_ids | \-  |
| 28  | `roo-code` | Roo Code | `extension` | Roo Code | extension_ids | \-  |
| 29  | `kilo-code` | Kilo Code | `extension` | Kilo Code | extension_ids | \-  |
| 30  | `jetbrains-ai` | JetBrains AI Assistant | `extension` | JetBrains | extension_ids | \-  |
| 31  | `llama-cpp` | llama.cpp | `model_runtime` | ggml-org | binaries, packages | \-  |
| 32  | `vllm` | vLLM | `model_runtime` | vLLM | binaries, packages | \-  |
| 33  | `gpt4all` | GPT4All | `model_runtime` | Nomic | bundle_ids, desktop_ids | \-  |
| 34  | `jan` | Jan | `model_runtime` | Jan | bundle_ids, desktop_ids | \-  |
| 35  | `localai` | LocalAI | `model_runtime` | LocalAI | binaries, packages | \-  |
| 36  | `open-webui` | Open WebUI | `app` | Open WebUI | packages | \-  |
| 37  | `arc` | Arc | `ai_browser` | The Browser Company | bundle_ids | \-  |

不在表内的产品只能靠 M4 开放世界评分进 `review_queue` ，否则不被发现。

指纹键 9 种，全量使用次数： `binaries` 16、 `packages` 15、 `bundle_ids` 14、 `state_dirs` 13、 `desktop_ids` 8、 `extension_ids` 6、 `ports` 2、 `model_dirs` 1、 `install_layouts` 1。

条目结构：

```json
{
  "id": "claude-code", "name": "Claude Code", "vendor": "Anthropic", "kind": "cli_agent",
"fingerprints": {
    "binaries": ["claude"],
    "packages": ["npm:@anthropic-ai/claude-code"],
    "state_dirs": ["~/.claude"],
    "install_layouts": [{"target": "~/.local/share/claude/versions/*", "version_from": "basename"}]
  },
"proofs": {
    "provenance": ["npm:@anthropic-ai/claude-code", "brew:claude"],
    "version_probe": ["--version"],
    "version_shape": "^\\d+\\.\\d+\\.\\d+"
  },
"risk_factors": ["executes_shell"]
}
```

`proofs.version_probe` 是唯一会执行目标程序的地方。 `version_shape` 是正则，约束返回值形状。

### 1.4 6 类目录型 surface

```python
SURFACES = (
    ("skills",        Kind.SKILL,            (".md",),          True),
    ("commands",      Kind.COMMAND,          (".md", ".toml"),  False),
    ("prompts",       Kind.COMMAND,          (".md",),          False),
    ("agents",        Kind.AGENT_DEFINITION, (".md",),          False),
    ("output-styles", Kind.OUTPUT_STYLE,     (".md",),          False),
    ("plugins",       Kind.PLUGIN,           (".json",),        True),
)
```

第四列为是否需要 manifest：

```swift
MANIFESTS = {
    Kind.SKILL:  ("/SKILL.md",),
    Kind.PLUGIN: ("/.claude-plugin/plugin.json", "/.codex-plugin/plugin.json",
                  "/.cursor-plugin/plugin.json", "/plugin.json"),
}
```

`plugins` 有 4 个候选路径，对应 Claude / Codex / Cursor 三种宿主的 manifest 位置。

### 1.5 Asset 字段

| 字段  | 含义  |
| --- | --- |
| `asset_id` | 稳定哈希，三个输入不变时跨扫描不变，见 2.6.2 |
| `kind` | 18 类之一 |
| `name` | 展示名 |
| `catalog_id` | 命中目录时为目录 id，否则空 |
| `liveness` | `running`<br><br>/ `installed` / `declared_only` |
| `verification` | 证据等级元组，如 `["provenance"]` |
| `confidence` | `high`<br><br>/ `medium` / `low` / `none` |
| `install_path` | 安装位置 |
| `install_method` | 安装方式（npm / brew / 手动） |
| `evidence` | 证据链，每条带 stage / channel / proof |
| `risk` | 风险事实，见 2.7.2 |
| `sanction` | policy 判定结果，见 2.7.7 |
| `provenance` | 来源（包管理器、注册表等） |

`liveness` 取三档最大值， `resolver/__init__.py::_LIVENESS_RANK` ： `running(2) > installed(1) > declared_only(0)` 。

`declared_only` 表示配置里写了，但没有证据表明它正在运行。实测中 6 个 MCP server 全部落在这一档。

### 1.6 Evidence 阶梯与置信分档

```python
class Rung(str, Enum):
    PROVENANCE = "provenance"   # 包管理器 / 注册表 / installer 布局
    CONTENT    = "content"      # 已知 hash / 模型权重文件头
    CONVENTION = "convention"   # 命名 / 路径 / 目录形状

CONCLUSIVE_RUNGS = frozenset({Rung.PROVENANCE, Rung.CONTENT})
```

`CONCLUSIVE_RUNGS` 只有两级。 `convention` 只提高优先级，不单独确认身份。

`~/.claude/skills/foo/SKILL.md` 这种路径形状任何程序都能造出来，叫 `claude` 的可执行文件也可能是改名而来。只有包管理器记录、已知 hash、模型文件头这类证据才进入 `CONCLUSIVE_RUNGS` 。

置信分档按独立 channel 数：

| 独立 channel 数 | band |
| --- | --- |
| ≥ 3 | `high` |
| 2   | `medium` |
| 1   | `low` |
| 0   | `none` |

统计单位是 channel 而非证据条数。同一个 `.mcp.json` 读出的三条记录，channel 都是 `config` ，计 1 个。

* * *

## 二、怎么找

### 2.1 阶段契约

`pipeline.py::discover` 是 composition root：

```
M1 world access  → 构造 Gate，装配平台 provider 与 Budget
M2 enumerate     → Candidate 元组
M3 extract       → Extraction（Declaration 元组）
M4 identify      → Verdict（含 confidence 与 evidence）
M5 resolve       → Asset 元组（合并 + 定 liveness）
M6 judge         → Asset（带 risk/sanction）+ Finding
M7 report        → Snapshot
```

阶段间只通过 `contracts/` 的 dataclass 传递，无共享可变状态。例外是 `Ledger` ，它贯穿全程并在最后 freeze 成 `Coverage` 。

`pipeline.py` 写成函数而非 class：每阶段输入输出都是不可变元组，没有实例状态需要维护。

### 2.2 Budget 字段

`world/budget.py::Budget` ：

| 字段  | 默认值 | 作用  |
| --- | --- | --- |
| `max_read_bytes` | 4 MiB | 单文件读取上限 |
| `max_entries` | 200,000 | 全局目录条目上限 |
| `max_depth` | 12  | 目录递归深度 |
| `max_children` | 5,000 | 单目录子项上限 |
| `max_subprocess_seconds` | 5.0 | 单次子进程超时 |
| `max_subprocess_output_bytes` | 4 MiB | 子进程输出上限 |
| `max_seconds` | 120.0 | 整体墙钟时间 |
| `reserved_walk_entries` | `None` | walk 阶段预留条目 |
| `state_root_share` | 0.25 | state root 可用条目比例 |
| `max_hash_bytes` | 1 GiB | 参与 hash 的文件上限 |
| `max_tree_files` | 10,000 | 目录树文件数上限 |
| `max_tree_file_bytes` | 20 MiB | 目录树单文件上限 |
| `max_tree_bytes` | 100 MiB | 目录树总量上限 |

Budget 全局共享，不是每个 probe 独立限额。一个 probe 耗尽额度后，后续 probe 空手而归，不报错，只在 `coverage.boundaries_hit` 记一条 `budget_exhausted` 。

### 2.3 M2 Enumerate

执行顺序，先系统后文件：

1.  `from_packages` — 包数据库
    
2.  `from_applications` — 应用注册表
    
3.  `from_kernel` — 进程表
    
4.  `from_app_state` — 配置文件与 state 目录
    
5.  `from_binaries` — bin 目录
    
6.  `from_model_stores` — 模型目录
    
7.  `from_network` — TCP / DNS
    
8.  `from_exec_journal` — 执行日志
    
9.  `sweep` — marker 遍历
    

前三项是系统级查询，成本低、精度高。文件遍历成本高，放在后面共享剩余预算。

#### 2.3.1 目录标记

`DIR_MARKERS` ，20 个：

```
.git  .claude  .cursor  .windsurf  .aider  .continue  .codeium
.gemini  .goose  .opencode  .zed  agents  skills  commands
prompts  output-styles  plugins  .github  .devcontainer  .vscode
```

`FILE_MARKERS` ，14 个：

```
.mcp.json  .claude.json  mcp.json  settings.json  settings.local.json
config.toml  config.yaml  mcp_settings.json  mcp_config.json
cline_mcp_settings.json  managed-settings.json  managed-mcp.json
claude_desktop_config.json  opencode.json
```

`INSTRUCTION_MARKERS` ，7 个：

```
CLAUDE.md  AGENTS.md  AGENT.md  GEMINI.md  .cursorrules  .windsurfrules  copilot-instructions.md
```

`WORKFLOW_SUFFIXES` （2）：`.yml``.yaml`

`LOCATOR_ONLY` （2）：`.windsurfrules``.cursorrules`

这两个文件只用于定位，本身不作为资产上报。

#### 2.3.2 其余常量全量

`BROWSER_PROFILE_ROOTS` （7）：

```javascript
~/Library/Application Support/Google/Chrome
~/Library/Application Support/BraveSoftware/Brave-Browser
~/Library/Application Support/Microsoft Edge
~/Library/Application Support/Arc/User Data
~/.config/google-chrome
~/.config/chromium
~/.config/microsoft-edge
```

`FIREFOX_PROFILE_ROOTS` （2）： `~/Library/Application Support/Firefox/Profiles` `~/.mozilla/firefox`

`EDITOR_EXTENSION_ROOTS` （6）：

```javascript
~/.vscode/extensions
~/.vscode-server/extensions
~/.cursor/extensions
~/.windsurf/extensions
~/.trae/extensions
~/.kilo/extensions
```

`~/.vscode-server/extensions` 对应远程开发场景，扩展装在服务器侧。

`RESOLVABLE_PROVIDER_HOSTS` （7）：

```
api.anthropic.com  api.openai.com  api.mistral.ai  api.groq.com
api.together.xyz   api.x.ai       openrouter.ai
```

这 7 个域名能反解到具体厂商。连接表中的 IP 命中其一， `network_intent` 信号成立。

`MODEL_PROVIDER_SUFFIXES` （14）：

```
api.anthropic.com  api.openai.com  openai.azure.com
generativelanguage.googleapis.com  aiplatform.googleapis.com
bedrock-runtime.amazonaws.com  api.mistral.ai  api.cohere.ai
api.groq.com  api.together.xyz  api.deepseek.com  api.x.ai
openrouter.ai  huggingface.co
```

比上一组多 7 个，因为只判断是否模型厂商域名，不需要反解到厂商。Azure、GCP、AWS Bedrock 三个云厂商端点在内。

`BUNDLE_SUFFIXES` （3）：`.AppImage``.app``.exe`

`LOCAL_MODEL_PORTS` （6）： `11434` `1234` `8080` `8000` `5000` `7860`

11434 是 Ollama，1234 是 LM Studio，7860 是 Gradio。端口命中只作信号，不作身份证据。

`BIN_ROOTS` （13， `sources/binaries.py` ）：

```bash
/usr/local/bin  /usr/bin  /bin  /opt/homebrew/bin  /opt/local/bin
/snap/bin  ~/.local/bin  ~/bin  ~/.cargo/bin  ~/go/bin
~/.npm-global/bin  ~/.bun/bin  ~/.deno/bin
```

`MAX_PER_ROOT = 2_000` ，单个 bin 目录最多读 2000 个文件。

`MODEL_ROOTS` （6， `sources/modelstores.py` ）：

```bash
~/.ollama/models
~/.cache/huggingface/hub
~/.cache/lm-studio/models
~/Library/Application Support/LM Studio/models
~/.local/share/Jan/models
~/.cache/gpt4all
```

`MODEL_SUFFIXES = (".gguf", ".safetensors")` ， `MAX_MODELS = 500` 。

#### 2.3.3 state root 与预算分配

`STATE_ROOTS` （14）：

```bash
~/.claude
~/.codex
~/.cursor
~/.aider
~/.continue
~/.gemini
~/.config/goose
~/.config/opencode
~/.ollama
~/Library/Application Support/Claude
~/Library/Application Support/Code/User
~/.config/Code/User
~/.vscode/extensions
~/.vscode-server/extensions
```

这 14 条先扫，只能用 `max_entries × 0.25` 。AI 资产集中在这里，先扫能在预算耗尽前拿到主要部分。

`sweep.py` 的两段预算：

```sql
state_cap = min(
    budget.entries_used + int(budget.max_entries * budget.state_root_share),
    budget.max_entries - budget.reserved_walk_entries,
)
with budget.ceiling(state_cap):
    for root in state_roots(gate):
        ...

with budget.ceiling(budget.max_entries - budget.reserved_walk_entries):
    for root, priority in ordered_roots(gate):
        ...
```

#### 2.3.4 sweep 根模板

`ROOT_TEMPLATES` （14），4 档优先级：

| 优先级 | 根   |
| --- | --- |
| `HOME` | `~` |
| `CODE_ROOT` | `~/Projects` `~/src` `~/code` `~/work` `~/dev` `~/git` `~/repos` |
| `SYSTEM` | `/opt` `/srv` `/usr/local` `/workspace` |
| `BREADTH` | `/Users` `/home` |

`CODE_ROOT` 占 7 条，是最大组。agent 配置多跟随代码仓库（`.mcp.json` 、`.claude/` 、`.github/` ）。

`DEPENDENCY_CACHES` （9），默认跳过：

```
node_modules  .venv  venv  site-packages  go/pkg/mod
.cargo/registry  vendor  .gradle  .m2
```

`SKIP_ALWAYS` （10），始终跳过：

```swift
.git/objects  .Trash  Library/Caches  .cache  __pycache__
/.npm/  /.local/share/pipx/  /.cargo/registry/  /.gradle/  /.m2/
```

```python
def in_scope(path: str, include_dependency_caches: bool = False) -> bool:
    if any(seg in path for seg in SKIP_ALWAYS):
        return False
    return include_dependency_caches or not any(seg in path for seg in DEPENDENCY_CACHES)
```

`include_dependency_caches` 由 `--resolve` 打开，追依赖树时必须进 `node_modules` 。

#### 2.3.5 配置文件模板 26 条

| 宿主  | 路径数 | 位置  |
| --- | --- | --- |
| Claude Code | 3   | `~/.claude.json`<br><br>、 `~/.claude/settings.json` 、 `~/.claude/settings.local.json` |
| Claude Desktop | 3   | `~/.config/claude-desktop/`<br><br>、 `~/Library/Application Support/Claude/` 、 `~/AppData/Roaming/Claude/` |
| Cursor | 1   | `~/.cursor/mcp.json` |
| Windsurf | 1   | `~/.codeium/windsurf/mcp_config.json` |
| VS Code | 3   | `~/.config/Code/User/mcp.json`<br><br>、 `~/Library/Application Support/Code/User/mcp.json` 、 `~/AppData/Roaming/Code/User/mcp.json` |
| Cline | 3   | 三平台的 `globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Zed | 2   | `~/.config/zed/settings.json`<br><br>、 `~/AppData/Roaming/Zed/settings.json` |
| JetBrains | 1   | `~/.config/JetBrains/options/mcp.json` |
| opencode | 1   | `~/.config/opencode/opencode.json` |
| Codex | 1   | `~/.codex/config.toml` |
| goose | 1   | `~/.config/goose/config.yaml` |
| shell | 2   | `~/.bashrc`<br><br>、 `~/.zshrc` |
| 企业托管 | 4   | `/etc/claude-code/managed-settings.json`<br><br>、 `/Library/Application Support/ClaudeCode/managed-settings.json` 、 `/Library/Application Support/ClaudeCode/managed-mcp.json` 、 `/etc/adr/managed-mcp.json` |

shell profile 里可能写入厂商密钥的环境变量声明（凭据暴露面），以及命令别名（资产伪装）。

### 2.4 M3 Extract

`extractor/__init__.py::extract` 按 `candidate.kind` 分派：

| candidate.kind | 路径  | 产出  |
| --- | --- | --- |
| 配置文件 | `_server_block`<br><br>/ `_hook_records` / `_workflow` / `_mcpb` | MCP server、hook、CI agent、bundle |
| 目录型 surface | `surfaces.py::SURFACES` | skill、command、plugin 等 |
| 单个可执行体 | 无抽取 | 直接进 M4 |
| 模型文件 | 无抽取 | 直接进 M4 |

#### 2.4.1 四个 scope

```javascript
SCOPES = (
    ("user",          "settings.json"),
    ("project",       ".mcp.json"),
    ("project_local", "settings.local.json"),
    ("plugin",        "mcp.json"),
)
```

同一 MCP server 在四个 scope 出现会产生四条声明。scope 只影响「谁批准」的语义，不影响 identity。

#### 2.4.2 四种 MCP 配置键名

```python
def _server_block(document: dict) -> dict:
    """MCP servers live under different keys in different host apps."""
    for key in ("mcpServers", "mcp_servers", "servers", "mcp"):
        block = document.get(key)
        if isinstance(block, dict):
            inner = block.get("servers")
            return inner if isinstance(inner, dict) else block
    return {}
```

四种键名，加一层嵌套兜底。

#### 2.4.3 逐记录隔离

`RECORD_CAP = 500` 。单个配置文件最多读 500 条记录，超出记 `truncated` 。

`isolate.py` 实现逐记录隔离：单条记录解析失败只跳过该条，整个文件不作废。500 行的 `settings.json` 里有一行写错，其余 30 个 MCP server 仍能读出来。

#### 2.4.4 四种格式

| 格式  | 文件  | 处理  |
| --- | --- | --- |
| JSON | `.mcp.json`<br><br>、 `settings.json` | 标准库 `json` |
| TOML | `config.toml` | `tomllib`<br><br>（3.11+ 内置） |
| YAML | `config.yaml` | `formats/yaml.py`<br><br>，自实现子集解析器 |
| Frontmatter | `SKILL.md` | `formats/frontmatter.py`<br><br>，读 `---` 之间的元数据 |

YAML 自实现的原因是「仅标准库」约束不允许引入 PyYAML。代价是只支持配置文件常见子集，不支持锚点、标签、多文档。

### 2.5 M4 Identify

`identifier/ladder.py::identify` 的判定顺序：

```
特判（model weight 文件头）
  ↓ 不成立
rung 1: provenance
  ↓ 未命中
rung 2: content
  ↓ 未命中
rung 3: convention（仅作 hint）
  ↓ 未命中
开放世界打分 → review_queue 或丢弃
```

#### 2.5.1 特判

```python
def _is_model_weight(header: bytes, path: str) -> bool:
    if header.startswith(b"GGUF"):
        return True
    if path.endswith(".safetensors") and len(header) >= 9:
        ...
```

GGUF 看魔数，safetensors 看文件头长度字段。两类文件不看扩展名即可识别，放在阶梯之前。

#### 2.5.2 rung 1 provenance

证据来源：包管理器记录、应用注册表、扩展注册表、installer 布局。

`install_layouts` 的用法： `~/.local/share/claude/versions/*` ，从目录名取版本号。

#### 2.5.3 rung 2 content

证据来源：已知文件 hash、模型权重文件头。 `MAX_HASH_BYTES = 8 MiB` ，超过该大小的文件不参与 hash 比对。

#### 2.5.4 rung 3 convention

证据来源：命名、路径、目录形状。只提高优先级，不进 `CONCLUSIVE_RUNGS` 。

```
SOCKET_KINDS = frozenset({"network_peer", "model_port"})
LAYOUT_KINDS = frozenset({"binary", "process", "exec_event"}) | SOCKET_KINDS
```

#### 2.5.5 开放世界打分

```
WEIGHTS = {
    "network_intent":      0.35,
    "credential_affinity": 0.25,
    "mcp_participation":   0.20,
    "state_shape":         0.15,
    "runtime_shape":       0.05,
}
THRESHOLD = 0.40
```

权重之和 1.00，阈值 0.40。

| 信号  | 权重  | 判定依据 |
| --- | --- | --- |
| `network_intent` | 0.35 | 连接已知 AI 厂商域名或本地模型端口 |
| `credential_affinity` | 0.25 | 环境变量或配置中出现 AI 厂商密钥标识 |
| `mcp_participation` | 0.20 | 出现在 MCP 配置中 |
| `state_shape` | 0.15 | 有类似 agent 的状态目录结构 |
| `runtime_shape` | 0.05 | 进程形态接近 agent |

`network_intent` 是唯一的行为性证据：程序连 `api.anthropic.com` ，不论名称都记录。

阈值 0.40 要求单靠 `network_intent` （0.35）不足，至少叠加一个信号。只连过一次 AI 域名的程序包括浏览器、代理、监控 agent。

达到阈值进 `review_queue` ，不进 `assets` 。 `review_queue` 是待人工确认，不是已确认。

#### 2.5.6 候选的三个去向

一个对象要进 `assets` ，要过三道流程，中途失败就没有记录：

| 阶段  | 产出  | 本机实测 |
| --- | --- | --- |
| 候选发现（M2） | `Candidate` | `from_applications`<br><br>返回 73 条记录，每条一个候选 |
| 资产识别（M4） | `Observation`<br><br>、 `ReviewItem` ，或丢弃 | `/Applications/WorkBuddy AI.app`<br><br>未结论，开放世界得分 0，无信号 |
| 资产登记（M5、M7） | `assets`<br><br>里的 `Asset` | 该 app 不在 169 条资产里 |

识别失败的候选，得分 ≥ 0.40 或命中 `network_intent` 才进 `review_queue` ；两者都不满足就直接丢弃， `coverage` 不留记录， `snapshot` 里看不出它存在过。M4 循环里这类候选只有两种结局，进 `review_queue` 或什么都不做。

这个 app 的识别结果：

```
('application', False, 0, '/Applications/WorkBuddy AI.app')
```

四元组依次是 kind、是否结论、开放世界得分、路径。 `identify` 返回的证据只有一条 `filesystem / no conclusive evidence` 。

「没有出现在资产清单里」因此有三种可能：没有被枚举到、被枚举到但没有识别出来、识别出来但被合并进别的资产。三种在 `snapshot` 里结果相同。第一种有时能在 `coverage` 的 `denied` 与 `boundaries_hit` 里找到线索，后两种不留痕迹。

### 2.6 M5 Resolve

`resolver/merge.py` 用 union-find 分组，按固定顺序尝试 7 个键：

```
content → realpath → inode → package → install → catalog → identity
```

| 键   | 命中条件 | 取值  |
| --- | --- | --- |
| `content` | 文件内容 hash 相同 | `obs.content_hash` |
| `realpath` | 软链接解析后路径相同 | `obs.real_path` |
| `inode` | 同一文件系统上的同一 inode | `obs.inode` |
| `package` | 同一包管理器的同一包 | `obs.package_id` |
| `install` | 属性观测所属的安装路径相同 | `obs.attribute_of`<br><br>，缺省用 `obs.path` |
| `catalog` | 命中同一目录条目 | catalog_id\|owner\|归一化 install_root |
| `identity` | 同 kind、同 identity、同 owner | `kind\|identity\|owner` |

顺序决定尝试次序，不决定合并结果。每一次 `union` 都要过 2.6.1 的身份校验，键再硬也不能绕开。 `content` 相同只说明字节相同，落在两个目录里的同一份文件、同一工具的两个安装实例、vendored 副本与发行版，都可能有相同字节。 `test_u5_04` 断言内容合并成立时，两条观测的 identity 本来就是同一个； `test_u5_14` 断言同工具的两个安装实例保持两个资产。

本机 1899 个候选在 7 个键上的实际分布：

| 键   | 触发合并的键组 | 成功合并 | 被身份校验拒绝 |
| --- | --- | --- | --- |
| `content` | 0   | 0   | 0   |
| `realpath` | 0   | 0   | 0   |
| `inode` | 0   | 0   | 0   |
| `package` | 1   | 1   | 0   |
| `install` | 13  | 0   | 50  |
| `catalog` | 2   | 9   | 0   |
| `identity` | 0   | 0   | 0   |

`content` 键在本机 0 次触发，因为没有任何两条文件观测的 SHA-256 相同。 `content_hash` 只对文件计算（ `pipeline.py:248` ），skill 目录走 `hash_tree` 进 `skill_sha256` ，不参与这个键。这条键的行为只有测试覆盖，没有实测数据。

#### 2.6.1 identity guard

union-find 存在桥接误并：A 与 B 通过一个观察合并，B 与 C 通过另一个观察合并，最终 A 与 C 被并成一个。

`merge.py::_Groups.union` 在合并前检查合并后组内的 identity 集合，出现两个不同的 identity 字符串就返回 `False` 。校验对象是字符串本身，与 kind 无关。

合并过头的后果比漏合并严重。漏合并会看到重复项，容易被注意到；合并过头后总数正常，只是少了一个资产，不会被察觉。

本机的 50 次拒绝全部来自 `install` 键，分布在 13 个键组上：19 个观测一组拒绝 18 次，17 个一组拒绝 16 次，5 个一组拒绝 4 次，3 个一组两组各拒绝 2 次，2 个一组八组各拒绝 1 次。同一插件目录下的多个 skill 共享 `attribute_of` ，锚点之外的每一个都被拒绝。冲突形态是锚点对多个兄弟节点，不是 A-B-C 的链式桥接。

把校验去掉重跑，资产从 169 降到 119，MCP server 从 6 降到 2。少掉的 50 个里 48 个是插件缓存目录下的 skill，2 个来自同一 `settings.json` 里声明的三条观测。

#### 2.6.2 asset_id

```python
def asset_id(kind: str, identity: str, owner: str, install_root: str | None) -> str:
    root = normalize_root(install_root) or ""
    payload = f"{kind}\0{identity}\0{owner}\0{root}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
```

四个输入： `kind` 、 `identity` 、 `owner` 、归一化后的 `install_root` 。版本号与凭据不在输入里，所以升级和换 token 都不改 id。

`normalize_root` 只认三种内容寻址布局：

```python
_STORE_PATTERNS = (
    re.compile(r"^(/nix/store)/[a-z0-9]{32}-(.+?)(/.*)?$"),
    re.compile(r"^(/gnu/store)/[a-z0-9]{32}-(.+?)(/.*)?$"),
    re.compile(r"^(.*/\.pnpm)/[^/]+@[^/]+(/.*)?$"),
)
```

稳定性的前提是三个输入都不变：

| 变化  | id 是否变 | 原因  |
| --- | --- | --- |
| 版本升级 | 否   | `version`<br><br>不在输入里 |
| 更换密钥 | 否   | 凭据不进哈希 |
| nix / gnu store 重建 | 否   | build hash 被归一化 |
| 配置文件换位置 | 是   | identity 含路径，实测 `mcp_server:node_repl@/Users/<user>/.codex/config.toml` |
| 换 owner | 是   | `owner`<br><br>是输入 |
| 插件缓存换 hash 目录 | 是   | `plugins/cache/<vendor>/<name>/<hash>`<br><br>不匹配上面三个模式 |

`test_u5_09` 到 `test_u5_11` 覆盖前三行，断言同一组输入产生同一个 id。后三行没有测试，也没有实测数据。

排除版本号决定了 diff 能识别 `version_changed` 而不是 `disappeared + appeared` 。

### 2.7 M6 Judge

#### 2.7.1 LAUNCHING_KINDS

```
LAUNCHING_KINDS = frozenset({Kind.MCP_SERVER, Kind.MCP_BUNDLE, Kind.HOOK, Kind.CI_AGENT})
```

只有这四类走完整 risk 分析，因为它们是会被宿主拉起执行的对象。 `skill` 本身不执行，由宿主读入作为上下文。

```
if declaration.kind not in LAUNCHING_KINDS:
    return asset.risk
```

#### 2.7.2 Risk 字段

| 字段  | 含义  |
| --- | --- |
| `pinned` | 版本是否锁定， `True` / `False` / `None` （无法判断） |
| `factors` | 风险因子，来自目录 `risk_factors` 与运行时推断 |
| `credential_kinds` | 可获取的凭据类型，如 `["API_KEY"]` |
| `env_names` | 环境变量名（只留名字，不留值） |
| `transport` | 传输方式， `stdio` / `http` |
| `destinations` | 出站目的地 |
| `unattended` | 是否无人值守执行 |

`pinned` 三态中， `None` 表示未知， `False` 表示确定未锁定。

#### 2.7.3 pinning 判定

```
EPHEMERAL_RUNNERS = frozenset({"npx", "bunx", "uvx", "pipx", "pip"})
CONTAINER_RUNNERS = frozenset({"docker", "podman"})
```

`npx @acme/mcp-server` → `pinned = False` 。

`npx @acme/mcp-server@1.2.0` → `pinned = True` 。

容器类单独处理，因为 `docker run image:tag` 的 tag 语义与 npm 版本号不同。

#### 2.7.4 credential reach

```python
def credential_reach(env_names, env_declared):
    if not env_declared:
        return ("<inherits parent environment>",), ("inherited",)
    return env_names, redact.credential_kinds(env_names)
```

MCP 配置不写 `env` 时，子进程继承父进程全部环境变量。实测 6 个 MCP server 中 3 个是 `inherited` 。

#### 2.7.5 六条 finding 规则

| 规则  | 触发条件 |
| --- | --- |
| `forbidden_asset` | 命中 policy `forbidden` 或 `forbidden_indicators` |
| `unpinned_mcp_server` | MCP server 且 `pinned is False` |
| `undeclared_mcp_server` | 出现但不在 policy `approved` 中 |
| `plaintext_transport` | transport 为明文 |
| `unattended_execution` | `unattended is True` |
| `third_party_destination` | 出站目的地不在 `tenant_domains` 内 |

`unattended` 判定（ `sources/registries.py::_is_unattended` ）：

```python
def _is_unattended(argv):
    flags = set(argv)
    return bool(flags & {
        "--dangerously-skip-permissions", "--yolo",
        "--auto-approve", "--no-confirm",
    })
```

四个 flag 硬编码。宿主使用其他名字（如 `--yes` ）不会被识别为 unattended，只落到 `pinned` 与 `transport` 判定。

#### 2.7.6 精度门槛

```python
def _may_be_judged(asset: Asset) -> bool:
    if asset.kind is Kind.MCP_SERVER:
        return bool(asset.catalog_id) or asset.confidence.label != "none"
    return bool(asset.catalog_id)
```

MCP server 只要 `catalog_id` 非空，或 `confidence.label` 不是 `none` ，就通过；其他类型必须有 `catalog_id` 。

本机 6 个 MCP server 的 `confidence.label` 都是 `low` ，全部通过这道门槛。把门槛强制改成 `return True` 重跑，findings 仍然是 0。6.6 的 0 条 finding 与门槛无关，是六条规则各自的条件都没有满足。

门槛拦下的是另一类对象：只有命令行形态、没有配置声明的进程。 `findings.py` 的文件头记了两个已经付过代价的误报，其中 `npx eslint .` 被判成高危 MCP server，源码注释直接把这道门槛定义成「 `npx eslint .` 过不了的那一条」。 `test_u6_09` 断言这两个误报保持沉默。

#### 2.7.7 sanction 四态

`judge/sanction.py::state_for` ，优先级：

```
forbidden > approved > unsanctioned (only where addressed) > unknown
```

| 状态  | 含义  |
| --- | --- |
| `forbidden` | 明确禁止 |
| `approved` | 明确批准 |
| `unsanctioned` | policy 涉及该类别但未批准 |
| `unknown` | policy 完全未提及 |

`unsanctioned` 仅在 policy 确实涉及该对象时成立。policy 中未提及任何 MCP server 时，所有 MCP server 为 `unknown` 。

#### 2.7.8 policy indicator 五类

```
ECOSYSTEMS = frozenset({"npm", "pypi"})
INDICATOR_KINDS = frozenset({"skill_sha256", "file_sha256", "mcp_endpoint", "package", "name"})
```

| kind | 匹配依据 |
| --- | --- |
| `skill_sha256` | skill 内容 hash |
| `file_sha256` | 任意文件 hash |
| `mcp_endpoint` | MCP 服务 URL |
| `package` | 包名 + 版本 |
| `name` | 资产名 + asset_kind |

`package` 支持 `versions` 列表与 `all_versions: true` 。

### 2.8 M7 Report

#### 2.8.1 Snapshot 顶层字段

| 字段  | 类型  | 说明  |
| --- | --- | --- |
| `hostname` | str | 主机名 |
| `username` | str | 用户名 |
| `platform` | str | `darwin`<br><br>/ `linux` / `windows` |
| `timestamp` | str | ISO 8601 |
| `assets` | tuple\[Asset\] | 资产清单 |
| `findings` | tuple\[Finding\] | 判定结果 |
| `review_queue` | tuple\[ReviewItem\] | 待人工确认 |
| `coverage` | Coverage | 覆盖情况 |
| `catalog_version` | str | 如 `2026.10.12` |
| `schema_version` | str | `1.2` |

#### 2.8.2 Delta 七类变化

`reporter/delta.py::diff` ：

| 变化类型 | 触发条件 |
| --- | --- |
| `appeared` | 新资产 |
| `disappeared` | 资产消失 |
| `reinstalled` | 同 asset_id，install_path 变化 |
| `version_changed` | 版本号变化 |
| `config_changed` | 配置内容变化 |
| `content_changed` | 文件内容 hash 变化 |
| `risk_delta` | risk 字段变化 |

另有 `coverage_delta` 记录两次扫描的覆盖差异。资产数减少可能是卸载，也可能是本次扫描覆盖更少， `coverage_delta` 用于区分。

跨主机 diff 默认拒绝：

```
if before.hostname != after.hostname and not allow_cross_endpoint:
    raise DifferentEndpoints(...)
```

* * *

## 三、横切约束

### 3.1 Coverage 七字段

| 字段  | 含义  |
| --- | --- |
| `roots_swept` | 扫完的根，含条目数与到达深度 |
| `boundaries_hit` | 撞到的边界，含类型 |
| `denied` | 权限拒绝 |
| `truncated` | 被截断的文件 |
| `unavailable` | 不可用的 provider |
| `probes` | 每个探针的状态 |
| `out_of_scope` | 明确不在范围内的对象 |

`OUT_OF_SCOPE = ("scheduling_mechanisms",)` 。定时任务、cron、launchd 明确不扫。

`coverage/ledger.py::Ledger` 是唯一的共享可变状态：

```ruby
def swept(self, path, depth_reached, entries): ...
def boundary(self, path, boundary, detail=""): ...
def deny(self, path, reason): ...
def unavailable(self, provider, reason): ...
def truncate(self, path, kept, true_count): ...
def probe(self, name, status, detail=""): ...
def freeze(self) -> Coverage: ...
```

`freeze()` 之后不可变。

`Coverage.is_complete` 表示没有已知缺口，不等于资产清单完整。声明了 `OUT_OF_SCOPE` 的清单可以是 `is_complete = True` ，同时缺失该范围内的全部资产。

### 3.2 Redaction 规则

`redact/rules.py` 。脱敏在 `Declaration.__post_init__` 执行，不在最后统一过滤。

```python
CREDENTIAL_FLAGS = frozenset({
    "--api-key", "--auth", "--header", "--input", "--message", "--password",
    "--prompt", "--query", "--secret", "--system-prompt", "--token",
    "-m", "-p", "-H",
})
```

保留：

-   路径
    
-   metadata
    
-   hash
    
-   allowlisted config keys
    
-   环境变量名
    
-   flag 名
    

丢弃：

-   文件内容
    
-   环境变量值
    
-   URL 的 userinfo / query / fragment
    

放在 `__post_init__` 的原因是新增 extractor 无法绕过。放在最后统一过滤时，任何一个 extractor 忘记标记敏感字段都会导致泄露。

`PERSONAL_PATH_SEGMENTS` 在 M1 集中拒绝访问，不由各 extractor 自行判断。

`--explain` 输出即该规则的自我说明：

```
def explain():
    return (
        "paths, metadata, hashes and allowlisted config keys -- never file contents",
        ...
    )
```

### 3.3 预算与架构的对应

| 约束  | 架构后果 |
| --- | --- |
| 120 秒总时长 | 按优先级排序，state roots 先扫 |
| 20 万条目 | 需要 `SKIP_ALWAYS` 与 `DEPENDENCY_CACHES` |
| 单文件 4 MiB | 大文件跳过，记 `truncated` |
| 单子进程 5 秒 | `ps`<br><br>/ `lsof` 超时即放弃，不重试 |
| hash 上限 1 GiB | 大模型文件不参与 content 判定 |

`max_entries` 直接决定可见范围。实测从 12000 降到 3000，资产从 169 降到 58，MCP server 从 6 降到 1。该变化同时反映在 `boundaries_hit` （1879 降到 366）与 `denied` （149 降到 97），资产表本身看不出差别。

### 3.4 边界条件

| 场景  | 处理  |
| --- | --- |
| 配置文件损坏 | 逐记录隔离，坏记录跳过，同文件其余记录继续读 |
| 软链接与同一 inode | `realpath`<br><br>、 `inode` 键并成一个资产，软链接不算第二个证据通道 |
| 目录循环 | 递归深度上限 12，超过记 `boundaries_hit` |
| 单文件与单目录过大 | 超出调用方 `limit` 记 `truncated` ；单目录 5000 项、单 bin 目录 2000 个文件、单配置文件 500 条记录 |
| 权限不足 | 记 `denied` ，扫描继续 |
| 同名不同身份 | identity guard 拒绝合并 |
| 多用户 | `owner`<br><br>进 asset_id 与 `catalog` 键，本机单用户未测 |
| 扫描范围变化 | `--root`<br><br>改变会让资产整体 `disappeared` 加 `appeared` |

* * *

## 四、三平台实现差异

`world/platform/` 三个文件，均继承 `HostResolver` + `NullProviders` 。

三列的证据强度不同，读下面的表之前先看这张：

| 平台  | 本机实跑 | 单元测试 | 未覆盖 |
| --- | --- | --- | --- |
| darwin | 是   | 是   | 进程通道， `/bin/ps` 被沙箱拒绝， `sockets` 正常 |
| linux | 否   | 是（ `LinuxProviders` 夹具） | 无真机 |
| windows | 否   | 否   | 无真机、无用例， `WindowsProviders` 未出现在任何测试文件里 |

| 能力  | darwin | linux | windows |
| --- | --- | --- | --- |
| home 根 | `/Users`<br><br>\+ `/var/root` | `/home`<br><br>\+ `/root` | `/Users`<br><br>（ `DIRECT_HOMES` 为空） |
| 进程  | `/bin/ps -axo pid=,ppid=,user=,comm=` | `/proc/*/` | `Get-CimInstance Win32_Process` |
| 连接  | `/usr/sbin/lsof -nP -iTCP` | `/proc/net/tcp`<br><br>\+ `/proc/net/tcp6` | `Get-NetTCPConnection` |
| 应用注册 | `/Applications`<br><br>\+ `Info.plist` | `.desktop`<br><br>文件 | Uninstall 注册表 + AppX |
| 包管理 | brew Cellar | dpkg / apk / snap / flatpak / rpm | 无   |
| DNS cache | 不可用 | resolvectl，仅暴露 counters | 无   |

darwin 用 `lsof` 而非 `netstat` ，因为 `lsof` 提供进程与连接的对应关系。 `ps` 与 `lsof` 均走 `run_helper` ，超时 5 秒。本机 `/bin/ps` 调用失败，darwin 的进程侧实现没有经过实跑，只经过源码与 `DarwinProviders` 用例。

linux 直接读 `/proc` ，比调命令快且不需额外权限。 `/proc/net/tcp` 中地址为十六进制，需手工解析。resolvectl 只暴露 counters，因此 Linux 上 DNS cache 为 `unavailable` 。

windows 全部走 PowerShell CIM，输出 JSON 后解析。 `HOME_ROOTS = ("/Users",)` 用于 WSL 路径兼容。

未实现：Windows 的 winget / chocolatey、Linux 的 systemd 单元、三平台的浏览器扩展详细枚举。

## 六、实测（macOS，本机）

### 6.1 运行方式

```css
cd Discovery
python3 -c "import sys; from adr_discovery.cli import main; sys.exit(main())" \
  --dry-run --json --max-entries 12000 --max-children 800
```

耗时 24 秒，退出码 2。下文全部数字来自同一次运行。路径中的用户名替换为 `<user>` ，主机名替换为 `<host>` 。

2026-11-10 用同样参数复跑，候选 1899、扫描前条目 1925、sockets 183、boundaries 1882，资产仍是 169。机器上增删过文件，过程计数跟着变，资产数不变。

### 6.2 CLI 输出原文

不加 `--json` 时打印人类可读摘要：

```css
<host> · darwin · catalog 2026.10.12
  assets 169 · findings 0 · review queue 0 · coverage gaps 2034
    cli_agent      Codex CLI 0.163.0  [installed, low confidence]
    app            Cursor 3.24.12  [installed, low confidence]
    app            Visual Studio Code 1.138.0  [installed, low confidence]
    extension      Cline 4.1.17  [installed, low confidence]
    mcp_server     node_repl  [declared_only, low confidence]
    instructions   CLAUDE.md  [declared_only, low confidence]
    agent_definition ocx-gpt-5-6-sol  [declared_only, low confidence]
    agent_definition ocx-gpt-6-astra  [declared_only, low confidence]
    agent_definition ocx-minimax-m3  [declared_only, low confidence]
    skill          karpathy-llm-wiki  [declared_only, low confidence]
    instructions   AGENTS.md  [declared_only, low confidence]
    command        opsx-apply  [declared_only, low confidence]
    ...
  coverage: 149 denied · 5 unavailable · 1879 boundaries · 1 truncated
```

逐行对照：

| 原文  | 含义  |
| --- | --- |
| `<host> · darwin · catalog 2026.10.12` | 主机名、平台、目录版本 |
| `assets 169` | 资产总数，来自 `stats()['asset_count']` |
| `findings 0` | 未传 `--policy` ，判定层无输出 |
| `review queue 0` | 开放世界评分无对象达到 0.40 |
| `coverage gaps 2034` | denied 149 + unavailable 5 + boundaries 1879 + truncated 1 |
| `cli_agent Codex CLI 0.163.0 [installed, low confidence]` | kind、名称、版本、liveness、confidence.label |
| `coverage: 149 denied · 5 unavailable · 1879 boundaries · 1 truncated` | 四类缺口计数，仅 `is_complete` 为 false 时打印 |

资产行不排序，按 `snapshot.assets` 元组顺序输出。 `declared_only` 占多数，因为大量资产来自配置文件而非安装记录。

### 6.3 snapshot 顶层字段

```json
{
  "assets": "<169 条记录>",
"catalog_version": "2026.10.12",
"coverage": "<7 个字段>",
"findings": [],
"hostname": "<host>",
"platform": "darwin",
"review_queue": [],
"schema_version": "1.2",
"timestamp": "2026-11-09T11:53:20+00:00",
"username": "<user>"
}
```

| 字段  | 本机值 | 说明  |
| --- | --- | --- |
| `assets` | 169 条 | 合并后的资产 |
| `catalog_version` | `2026.10.12` | 随包发布，不随扫描变化 |
| `coverage` | 7 字段 | 见 6.5 |
| `findings` | 空   | 无 policy 时不产生 |
| `hostname` | `<host>` | 用于 diff 的跨主机校验 |
| `platform` | `darwin` | 决定 provider 实现 |
| `review_queue` | 空   | 无对象越过 0.40 |
| `schema_version` | `1.2` | 输出结构版本 |
| `timestamp` | ISO 8601 | 带时区 |
| `username` | `<user>` | 单用户扫描时该字段仅一人 |

### 6.4 单条资产原文

`node_repl` 的完整记录，未删字段：

```json
{
  "allowed_tools": [],
"archive": null,
"asset_id": "2fc2d21afc0a9c41858a928e44b292ae",
"catalog_id": null,
"confidence": {
    "channels": ["config"],
    "label": "low"
  },
"content_hash": null,
"evidence": [
    {
      "channel": "config",
      "confidence": 0.85,
      "path": "/Users/<user>/.codex/config.toml",
      "proof": "declared in project scope",
      "rung": null,
      "stage": "extractor"
    }
  ],
"flags": ["config_scope=project"],
"hook_event": null,
"hook_matcher": null,
"identity": "mcp_server:node_repl@/Users/<user>/.codex/config.toml",
"install_method": null,
"install_path": "/Users/<user>/.codex/config.toml",
"install_root": "/Users/<user>/.codex",
"kind": "mcp_server",
"last_used": null,
"liveness": "declared_only",
"location": "local",
"model": null,
"modified": "2026-11-04T05:57:40+00:00",
"name": "node_repl",
"owner": "system",
"package_id": null,
"plugin_asset_id": null,
"provenance": null,
"risk": {
    "credential_kinds": [],
    "destinations": [],
    "env_names": [
      "BROWSER_USE_AVAILABLE_BACKENDS",
      "BROWSER_USE_CODEX_APP_BUILD_FLAVOR",
      "BROWSER_USE_CODEX_APP_VERSION",
      "BROWSER_USE_TINYSKY_ENABLED",
      "CODEX_CLI_PATH",
      "CODEX_HOME",
      "NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER",
      "NODE_REPL_INSTRUCTIONS_USE_CASE_CHROME",
      "NODE_REPL_INSTRUCTIONS_USE_CASE_COMPUTER_USE",
      "NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS",
      "NODE_REPL_NODE_MODULE_DIRS",
      "NODE_REPL_NODE_PATH",
      "NODE_REPL_TRUSTED_CODE_PATHS",
      "NODE_REPL_TRUSTED_SERVICES",
      "SKY_CUA_SERVICE_PATH"
    ],
    "factors": [],
    "pinned": null,
    "transport": "stdio",
    "unattended": false
  },
"running_versions": [],
"sanction": "unknown",
"skill_sha256": null,
"vendor": null,
"verification": [],
"version": null
}
```

按组翻译：

| 字段  | 值   | 含义  |
| --- | --- | --- |
| `asset_id` | 32 位十六进制 | `sha256(kind\0identity\0owner\0root)[:32]` |
| `identity` | `mcp_server:node_repl@<path>` | kind + 名称 + 声明位置 |
| `catalog_id` | `null` | 37 条目录中无此条目 |
| `confidence.channels` | `["config"]` | 只有 config 一个独立通道 |
| `confidence.label` | `low` | 单通道 |
| `evidence[0].stage` | `extractor` | 证据由 M3 产生，M4 未追加 |
| `evidence[0].rung` | `null` | 未走三级阶梯，因无目录可匹配 |
| `evidence[0].proof` | `declared in project scope` | scope 判定结果 |
| `evidence[0].confidence` | `0.85` | 单条证据的置信分，非资产置信 |
| `flags` | `["config_scope=project"]` | 来自 `.codex/config.toml` ，非 user scope |
| `liveness` | `declared_only` | 配置中声明，无运行证据 |
| `install_path` | `<path>/config.toml` | MCP server 的「安装位置」是声明文件 |
| `install_root` | `~/.codex` | 用于 `asset_id` 归一化 |
| `owner` | `system` | 来自用户级配置文件 |
| `risk.pinned` | `null` | 无法判断，既非 `True` 也非 `False` |
| `risk.env_names` | 15 个 | 只保留变量名，值已丢弃 |
| `risk.credential_kinds` | `[]` | 15 个变量名均未匹配凭据模式 |
| `risk.transport` | `stdio` | 子进程通信 |
| `risk.unattended` | `false` | argv 无跳过确认的 flag |
| `risk.destinations` | `[]` | stdio 类型无出站地址 |
| `sanction` | `unknown` | 未传 policy |
| `verification` | `[]` | 无 conclusive rung，所以为空 |
| `version` | `null` | 无 `version_probe` 可执行 |
| `content_hash` | `null` | 声明文件不参与内容 hash |
| `running_versions` | `[]` | 无运行实例 |

`pinned` 为 `null` 而非 `false` ：该条目的 `command` 与 `args` 在 `.codex/config.toml` 中未给出可解析的包引用，pinning 判定返回未知。 `unpinned_mcp_server` 规则要求 `pinned is False` ，因此这条不触发。

`env_names` 有 15 个但 `credential_kinds` 为空：这 15 个名字（ `CODEX_HOME` 、 `NODE_REPL_NODE_PATH` 等）都不匹配 `redact.credential_kinds` 的凭据模式。凭据识别基于名称特征，不基于值的形态。

### 6.5 coverage 原文

#### 6.5.1 roots_swept

```json
[
  { "depth_reached": 3,  "entries": 84,   "path": "/Users/<user>/.claude" },
  { "depth_reached": 11, "entries": 2913, "path": "/Users/<user>/.codex" },
  { "depth_reached": 6,  "entries": 24,   "path": "/Users/Shared" },
  { "depth_reached": 8,  "entries": 5846, "path": "/Users/<user>" }
]
```

| 字段  | 含义  |
| --- | --- |
| `path` | 扫完的根 |
| `entries` | 该根下实际读取的条目数 |
| `depth_reached` | 到达的最大深度，上限 `max_depth = 12` |

只有 4 个根扫完。 `~/.codex` 占 2913 条， `~` 占 5846 条，两者合计 8759 条，接近 `max_entries` 的一半。

#### 6.5.2 denied

共 149 条，取前 2 条：

```json
[
  { "path": "/var/root/.npm-global/lib/node_modules", "reason": "Permission denied" },
  { "path": "/var/root/.nvm/versions/node", "reason": "Permission denied" }
]
```

| reason | 条数  | 含义  |
| --- | --- | --- |
| `Permission denied` | 94  | 文件权限不足 |
| `Operation not permitted` | 43  | 系统保护（SIP / TCC） |
| `personal_path` | 12  | `PERSONAL_PATH_SEGMENTS`<br><br>主动拒绝 |

`/var/root` 下的路径说明扫描覆盖了其他用户的 home，但读不进去。 `personal_path` 是主动跳过，不是读失败。

#### 6.5.3 boundaries_hit

共 1879 条，取 1 条：

```json
[
  {
    "boundary": "budget_exhausted",
    "detail": "cap 4927; directory truncated",
    "path": "/Users/<user>/.codex/plugins/cache/openai-bundled/computer-use/1.0.1001641/.codex-plugin"
  }
]
```

| boundary | 条数  | 含义  |
| --- | --- | --- |
| `budget_exhausted` | 1877 | 条目预算耗尽 |
| `fan_out` | 1   | 单目录子项超过 `max_children` |
| `cache_dir` | 1   | 命中依赖缓存目录 |

`cap 4927` 是当时的动态上限。1879 条里有 1877 条是预算耗尽，说明 `max_entries` 是主要瓶颈，不是深度或子项数。

#### 6.5.4 truncated

```json
[
  {
    "kept": 65536,
    "path": "/Users/<user>/.codex/plugins/cache/openai-primary-runtime/spreadsheets/26.1030.10813/skills/excel-live-control/SKILL.md",
    "true_count": 71942
  }
]
```

`kept` 为实际读取字节， `true_count` 为文件真实大小。差 6406 字节被丢弃，该 skill 的 frontmatter 完整但正文尾部缺失。

#### 6.5.5 unavailable

```json
[
  { "provider": "processes",     "reason": "not readable on this host" },
  { "provider": "resolver",      "reason": "name resolution not requested (--resolve)" },
  { "provider": "dns_cache",     "reason": "mDNSResponder cache is not enumerable" },
  { "provider": "exec_journal",  "reason": "not readable on this host" },
  { "provider": "package_owner", "reason": "not readable on this host" }
]
```

| provider | 原因  | 后果  |
| --- | --- | --- |
| `processes` | 进程表不可读 | 无 `running` 状态资产 |
| `resolver` | 未传 `--resolve` | 域名不反解 |
| `dns_cache` | mDNSResponder 不可枚举 | 无历史解析记录 |
| `exec_journal` | 不可读 | 扫描间隙内退出的进程漏掉 |
| `package_owner` | 不可读 | 文件与包的归属关系缺失 |

`processes` 不可读直接导致 `liveness` 全表没有 `running` 。这是环境限制，不是代码缺陷。

#### 6.5.6 probes

共 20 条： `failed` 5、 `ran` 12、 `degraded` 3。代表性 7 条：

```
{"detail": "41 records",  "name": "packages",     "status": "ran"}
{"detail": "73 records",  "name": "applications", "status": "ran"}
{"detail": "182 sockets", "name": "sockets",      "status": "ran"}
{"detail": "1898 candidates; 1927 entries before the sweep", "name": "enumerator", "status": "ran"}
{"detail": "2 marketplaces, 15 install records (0 missing on disk), 13 enablement entries, 14 marketplace listings, 0 cached versions", "name": "plugin_registries", "status": "ran"}
{"detail": "50 bridging merge(s) refused", "name": "resolver", "status": "ran"}
{"detail": "[Errno 1] Operation not permitted: '/bin/ps'", "name": "/bin/ps", "status": "failed"}
```

| probe | 原文  | 含义  |
| --- | --- | --- |
| `packages` | `41 records` | 包管理器返回 41 条 |
| `applications` | `73 records` | 应用注册表返回 73 条 |
| `sockets` | `182 sockets` | TCP 连接表 182 条 |
| `enumerator` | `1898 candidates; 1927 entries before the sweep` | 前八路来源产生 1898 个候选，sweep 前已用 1927 条目 |
| `plugin_registries` | `2 marketplaces, 15 install records (0 missing on disk), ...` | 2 个 marketplace、15 条安装记录、13 条启用记录、14 条上架记录、0 个缓存版本 |
| `resolver` | `50 bridging merge(s) refused` | identity guard 拒绝 50 次桥接合并 |
| `/bin/ps` | `Operation not permitted` | 沙箱禁止，进程侧为空 |

`50 bridging merge(s) refused` 是 identity guard 的拒绝次数，不是资产组数。把拒绝逐条记录后，50 次落在 13 个 `install` 键组上：

| 键组  | 观测数 | 拒绝次数 |
| --- | --- | --- |
| `~/.codex/plugins/cache/openai-api-curated/build-web-data-visualization/bd2122cb` | 19  | 18  |
| `~/.codex/plugins/cache/openai-api-curated/codex-security/b767f8fa` | 17  | 16  |
| `~/.codex/plugins/cache/openai-curated/github/d5f583fa...` | 5   | 4   |
| `~/.homebrew/Homebrew/.claude/settings.json` | 3   | 2   |
| `~/.codex/plugins/cache/openai-primary-runtime/spreadsheets/26.1030.10813` | 3   | 2   |
| 其余 8 组各 2 个观测 | 16  | 8   |

每次拒绝挡住一次合并，放行后的资产数正好少 50：169 降到 119，MCP server 从 6 降到 2。数值对得上，机制不是 50 组资产两两并成一个，而是 13 个安装路径各有一个锚点，锚点之外的兄弟节点逐个被拒。插件目录下的多个 skill 共享同一个 `attribute_of` ，这是 `install` 键对 skill 过粗的结果。

`0 missing on disk` 表示 15 条插件安装记录对应的目录都还在，没有 stale 记录。

另外 3 条 `degraded` ：

```
{"detail": "/Users/<user>/.homebrew/Homebrew/.vscode/settings.json: JSONDecodeError", "name": "extractor", "status": "degraded"}
{"detail": "unavailable", "name": "exec_journal", "status": "degraded"}
{"detail": "...: 17 unreadable key(s) skipped (description, metadata)", "name": "frontmatter", "status": "degraded"}
```

`JSONDecodeError` 来自文件里的尾随逗号（ `Illegal trailing comma before end of array: line 26 column 15` ）。逐记录隔离让这个文件被跳过，其余文件继续解析。

`frontmatter` 的 `unreadable key(s) skipped` 出现在 6 个目录，分别跳过 1 至 17 个键。这些 skill 的元数据不完整，但资产本身仍被记录。

### 6.6 findings 原文

传 `--policy` 后 3 条：

```json
{
  "asset_id": "2fc2d21afc0a9c41858a928e44b292ae",
"evidence": [
    {
      "channel": "config",
      "confidence": 0.9,
      "path": "/Users/<user>/.codex/config.toml",
      "proof": "matched a forbidden entry in the tenant policy",
      "rung": null,
      "stage": "judge"
    }
  ],
"rule": "forbidden_asset",
"severity": "high",
"summary": "node_repl is forbidden by policy"
}
```

```json
{
  "asset_id": "34bc92dfda899a869c06b1e8843a9fab",
"evidence": [
    {
      "channel": "config",
      "confidence": 0.9,
      "path": "/Users/<user>/.codex/plugins/cache/openai-api-curated/github/b767f8fa/.mcp.json",
      "proof": "destination outside the tenant domain list",
      "rung": null,
      "stage": "judge"
    }
  ],
"rule": "third_party_destination",
"severity": "medium",
"summary": "github reaches api.githubcopilot.com"
}
```

```json
{
  "asset_id": "bcc24be2621afa96a7cb6eb2c8f58acc",
"evidence": [
    {
      "channel": "config",
      "confidence": 0.9,
      "path": "/Users/<user>/.homebrew/Homebrew/.vscode/mcp.json",
      "proof": "matched a forbidden entry in the tenant policy",
      "rung": null,
      "stage": "judge"
    }
  ],
"rule": "forbidden_asset",
"severity": "high",
"summary": "Homebrew is forbidden by policy"
}
```

| 字段  | 含义  |
| --- | --- |
| `rule` | 六条规则之一 |
| `severity` | `high`<br><br>/ `medium` |
| `summary` | 人类可读结论 |
| `evidence[0].stage` | 固定为 `judge` ，说明证据由 M6 追加 |
| `evidence[0].proof` | 触发依据的原文 |
| `evidence[0].confidence` | 固定 0.9 |

三条 finding 对应的资产状态：

| 资产  | sanction |     | transport | 触发规则 |
| --- | --- | --- | --- | --- |
| `node_repl` | `forbidden` | `null` | `stdio` | `forbidden_asset` |
| `github` | `unknown` | `null` | `http` | `third_party_destination` |
| `Homebrew` | `forbidden` | `null` | `stdio` | `forbidden_asset` |

`github` 的 `sanction` 是 `unknown` 而非 `forbidden` ，它触发的规则是出站域名，不是授权状态。 `transport` 为 `http` ，但没有触发 `plaintext_transport` ，因为该规则判定的是明文而非加密传输， `http` 需要配合非 TLS 端口才成立。

policy 内容：

```json
{
  "tenant_domains": ["anthropic.com"],
  "approved": [],
  "forbidden": [],
  "approved_indicators": [],
  "forbidden_indicators": [
    {"kind": "name", "asset_kind": "mcp_server", "name": "node_repl"},
    {"kind": "name", "asset_kind": "mcp_server", "name": "Homebrew"}
  ]
}
```

未传 policy 时 findings 为 0。原因是六条规则各自的条件都没有满足，与 `_may_be_judged` 无关：6 个 MCP server 的 `confidence.label` 都是 `low` ，都通过了门槛，把门槛强制改成 `return True` 重跑，结果仍是 0。

逐个条件对照：

| 规则  | 条件  | 6 个 MCP server 的实际值 | 是否触发 |
| --- | --- | --- | --- |
| `forbidden_asset` | `sanction == "forbidden"` | 全部 `unknown` （无 policy） | 否   |
| `unpinned_mcp_server` | `pinned is False` | 全部 `null` | 否   |
| `undeclared_mcp_server` | `"undeclared" in flags` | 全部由配置声明，无该 flag | 否   |
| `plaintext_transport` | `"plaintext_transport" in risk.factors` | 全部空 | 否   |
| `unattended_execution` | `risk.unattended is True`<br><br>且 kind 不是 `ci_agent` | 全部 `false` | 否   |
| `third_party_destination` | 有出站目的地且 `policy.tenant_domains` 非空 | `github`<br><br>有 `api.githubcopilot.com` ，policy 为空 | 否   |

`third_party_destination` 的第二个条件在 `findings.py:100` ： `if third_party and policy.tenant_domains` 。没有 policy 时列表为空，域名判定不执行。传了 policy 之后 `github` 才被报出来，即本节开头第 2 条 finding。

### 6.7 汇总

169 个资产的 kind 分布：

| kind | 数量  |
| --- | --- |
| `skill` | 119 |
| `plugin` | 15  |
| `command` | 11  |
| `instructions` | 8   |
| `mcp_server` | 6   |
| `agent_definition` | 3   |
| `hook` | 3   |
| `app` | 2   |
| `cli_agent` | 1   |
| `extension` | 1   |

1898 个候选收敛为 169 个资产，比例 11.2 比 1，收敛发生在 M5。

预算对比，同一台机器、同一份目录：

| `--max-entries` | 资产  | `mcp_server` | denied | boundaries | truncated | gaps |
| --- | --- | --- | --- | --- | --- | --- |
| 3000 | 58  | 1   | 97  | 366 | 0   | 468 |
| 12000 | 169 | 6   | 149 | 1879 | 1   | 2034 |

预算收紧后 gaps 从 2034 降到 468，资产却从 169 降到 58。缺口计数统计的是撞边界与拒绝访问的次数，不统计漏掉的资产。预算小，遍历范围小，撞上的边界也少。 `coverage gaps` 不能用来判断清单完整度。

3000 预算下的 kind 分布： `skill` 20、 `plugin` 15、 `command` 11、 `instructions` 4、 `agent_definition` 3、 `app` 2、 `cli_agent` 1、 `extension` 1、 `mcp_server` 1。skill 从 119 掉到 20，是预算收紧后最先消失的类别。

### 6.8 catalog 外产品

`applications` 探针返回 73 条记录， `/Applications/WorkBuddy AI.app` 在其中。它作为 `application` 候选走完 M2，在 M4 没有识别出结论： `identify` 返回 `no conclusive evidence` ，开放世界得分 0，没有信号，于是被丢弃，不进 `assets` ，也不进 `review_queue` 。这是 2.5.6 里的第二种去向。

候选发现与资产登记是两件事。这个 app 已经被发现，只是没有通过识别。把它写成「没有被发现」会让读者以为枚举漏了这个目录。

向 `catalog.json` 追加一条后重扫，资产数从 169 变为 170，新增记录：

```json
{
  "kind": "app",
"name": "WorkBuddy AI",
"catalog_id": "workbuddy",
"liveness": "installed",
"confidence": {
    "channels": ["registry"],
    "label": "low"
  },
"verification": ["provenance"],
"install_path": "/Applications/WorkBuddy AI.app",
"install_method": null,
"sanction": "unknown"
}
```

追加的目录条目：

```json
{
  "id": "workbuddy",
"name": "WorkBuddy AI",
"vendor": "WorkBuddy",
"kind": "app",
"fingerprints": {
    "bundle_ids": ["com.workbuddy.workbuddy-ai"],
    "state_dirs": ["~/.workbuddy-ai"]
  },
"proofs": {},
"risk_factors": []
}
```

| 字段  | 值   | 说明  |
| --- | --- | --- |
| `confidence.channels` | `["registry"]` | 只有应用注册表一个通道 |
| `confidence.label` | `low` | 单通道 |
| `verification` | `["provenance"]` | 走的是 rung 1 |
| `install_path` | `/Applications/...` | 来自 LaunchServices |
| `install_method` | `null` | 目录未声明 |

`~/.workbuddy-ai/skills/` 下的 skill 在两次扫描中都被单独记录，因为目录名 `skills` 命中 `DIR_MARKERS` 。当前 7 条，与这个 app 资产无关联，各自持有独立 `asset_id` 。资产表中可见 app，不可见其携带的 skill 列表。

### 6.9 diff

两次扫描之间新增一个 skill 和一个 MCP server：

```css
python3 -c "import sys; from adr_discovery.cli import main; sys.exit(main())" \
  --root /tmp/demo --diff /tmp/demo-out/snapshot-2026-11-09T115502+0000.json --dry-run
```

输出：

```
<host> · darwin · catalog 2026.10.12
  assets 3 · findings 1 · review queue 0 · coverage gaps 6
    skill          alpha  [declared_only, low confidence]
    skill          beta  [declared_only, low confidence]
    mcp_server     loose  [declared_only, low confidence]
  ! medium  unpinned_mcp_server: loose resolves its package at launch time
  coverage: 0 denied · 6 unavailable · 0 boundaries · 0 truncated

delta vs the previous snapshot of <host>
  appeared         beta
  appeared         loose
```

| 原文  | 含义  |
| --- | --- |
| `assets 3` | 本次扫描结果，不是差值 |
| `! medium unpinned_mcp_server: loose resolves its package at launch time` | `npx -y @acme/loose-mcp`<br><br>未锁版本 |
| `coverage gaps 6` | fixture 模式下 provider 全部不可用 |
| `delta vs the previous snapshot of <host>` | 跨主机时此行会变成错误，需 `--allow-cross-endpoint` |
| `appeared beta`<br><br>/ `appeared loose` | 两条新增 |

`loose` 的 finding 说明 `unpinned_mcp_server` 在 fixture 下能触发： `command` 为 `npx` ， `args` 里是 `@acme/loose-mcp` 不带版本号，pinning 判定返回 `False` ，与 `node_repl` 的 `null` 不同。

* * *

## 七、测试覆盖

`adr_discovery/tests_unit/` 有 42 个测试文件、474 个用例（参数化展开后），按 M1 到 M7 命名，例如 `test_u5_06_two_tools_sharing_a_root_do_not_merge` 。本机执行 473 通过、1 跳过、0 失败， `test_traversal_budget.py` 单文件 433 秒。

未覆盖的部分：Windows provider 没有任何用例， `WindowsProviders` 未出现在测试文件里； `--resolve` 只测了未传时的 unavailable，依赖树遍历本身没有用例；多用户只测到枚举层，没有多 owner 下的 asset_id 与合并用例。

`tests/` 是另一套：黑盒保真度测量，用 120 条安装清单比对快照的 TP / FP / FN。Linux 与 macOS 有 guest driver 但未接 golden snapshot 自动恢复，Windows 没有 driver。

* * *

## 八、缺口

### 8.1 代码限制

| 限制  | 影响  |
| --- | --- |
| catalog 仅 37 条 | 表外产品依赖开放世界评分，0.40 阈值过滤大部分 |
| 识别失败即丢弃 | 得分低于 0.40 且无 `network_intent` 的候选不留任何记录， `coverage` 也不记，见 2.5.6 |
| `install`<br><br>键对 skill 过粗 | 同一插件下的 skill 共享 `attribute_of` ，全靠 identity guard 挡住，见 2.6.1 |
| 无资产关联 | skill 与宿主 app 不 join |
| 无历史 | 单次扫描，趋势需多次 snapshot 自行计算 |
| YAML 仅支持子集 | 复杂 YAML 配置无法解析 |
| Windows 包管理未实现 | winget / chocolatey 安装的 agent 仅靠注册表 |
| Windows 无测试 | provider 只有源码，没有用例 |
| DNS cache 多数不可用 | 域名反解依赖连接表与已知域名列表 |
| 定时任务不扫 | `OUT_OF_SCOPE`<br><br>声明 |

### 8.2 设计取舍

| 取舍  | 代价  |
| --- | --- |
| 精度优先于召回 | findings 为 0 时无法区分「干净」与「规则未覆盖」 |
| 约定不作证据 | 大量资产 `confidence=low` |
| 采集时脱敏 | 丢失部分上下文（如 URL query 参数） |
| 预算共享 | 后续 probe 可能空手而归 |
| 合并过头不可见 | 总数正常，少一个资产不会被察觉，靠 identity guard 兜住 |

* * *

## 附录　代码坐标索引

行号对应 commit `6b33dff` ，路径相对 `Discovery/adr_discovery/` 。

| 主题  | 坐标  |
| --- | --- |
| 18 类 Kind | `contracts/records.py:16` |
| Candidate | `contracts/records.py:55` |
| Declaration | `contracts/records.py:67` |
| Observation | `contracts/records.py:153` |
| Risk 字段 | `contracts/records.py:176` |
| Asset 字段 | `contracts/records.py:232` |
| Channel | `contracts/evidence.py:14` |
| Rung | `contracts/evidence.py:30` |
| CONCLUSIVE_RUNGS | `contracts/evidence.py:43` |
| Coverage | `contracts/snapshot.py:64` |
| Snapshot | `contracts/snapshot.py:85` |
| 目录标记 | `enumerator/markers.py:15` |
| 文件标记 | `enumerator/markers.py:25` |
| state root | `enumerator/markers.py:51` |
| 可反解厂商域名 | `enumerator/markers.py:124` |
| 本地模型端口 | `enumerator/markers.py:145` |
| 跳过规则 | `enumerator/roots.py:43` |
| sweep 入口 | `enumerator/sweep.py:15` |
| sweep 预算 | `enumerator/sweep.py:65` |
| 包来源 | `enumerator/sources/registries.py:18` |
| 应用注册表来源 | `enumerator/sources/registries.py:35` |
| 进程来源 | `enumerator/sources/registries.py:52` |
| unattended 判定 | `enumerator/sources/registries.py:95` |
| 配置来源 | `enumerator/sources/appstate.py:29` |
| bin 目录 | `enumerator/sources/binaries.py:20` |
| bin 目录上限 | `enumerator/sources/binaries.py:26` |
| 模型目录 | `enumerator/sources/modelstores.py:7` |
| 模型数量上限 | `enumerator/sources/modelstores.py:13` |
| 网络来源 | `enumerator/sources/network.py:21` |
| 执行日志来源 | `enumerator/sources/execjournal.py:18` |
| 目录型 surface | `extractor/surfaces.py:24` |
| manifest 路径 | `extractor/surfaces.py:95` |
| 单文件记录上限 | `extractor/__init__.py:35` |
| 三级阶梯入口 | `identifier/ladder.py:40` |
| 文件内容 hash | `identifier/ladder.py:28` |
| 开放世界阈值 | `identifier/openworld.py:25` |
| 开放世界打分 | `identifier/openworld.py:28` |
| 合并键 | `resolver/keys.py:42` |
| 身份取值 | `resolver/keys.py:72` |
| asset_id | `resolver/keys.py:90` |
| 安装根归一化 | `resolver/keys.py:32` |
| 分组与拒绝 | `resolver/merge.py:43` |
| 组内身份校验 | `resolver/merge.py:31` |
| 置信分档 | `resolver/confidence.py:13` |
| 精度门槛 | `judge/findings.py:24` |
| 六条规则 | `judge/findings.py:32` |
| 出站域名条件 | `judge/findings.py:100` |
| 启动类 Kind | `judge/__init__.py:25` |
| 授权状态 | `judge/sanction.py:234` |
| 第三方域名判定 | `judge/sanction.py:252` |
| 瞬时 runner | `judge/risk.py:45` |
| 凭据可达 | `judge/risk.py:227` |
| Delta | `reporter/delta.py:51` |
| Snapshot 序列化 | `reporter/snapshot.py:39` |
| 统计口径 | `reporter/snapshot.py:177` |
| Coverage ledger | `coverage/ledger.py:24` |
| 凭据 flag | `redact/rules.py:20` |
| 个人路径段 | `redact/rules.py:63` |
| 脱敏自述 | `redact/rules.py:163` |
| 预算  | `world/budget.py:17` |
| darwin provider | `world/platform/darwin.py:19` |
| linux provider | `world/platform/linux.py:16` |
| windows provider | `world/platform/windows.py:11` |
| composition root | `pipeline.py:61` |
| 文件 hash 赋值 | `pipeline.py:248` |
| CLI 参数 | `cli.py:37` |
| CLI 入口 | `cli.py:62` |

人工智能与网络安全 · 目录

作者提示: 个人观点，仅供参考
