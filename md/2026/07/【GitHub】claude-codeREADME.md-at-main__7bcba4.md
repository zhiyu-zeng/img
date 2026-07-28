---
title: 【GitHub】claude-code/README.md at main
source: https://github.com/anthropics/claude-code/blob/main/README.md
source_host: github.com
clip_date: 2026-07-02T10:36:23+08:00
trace_id: a7e43e7e-ec04-426a-bd52-8922b5f8ff94
content_hash: 74ace637e8fa3351e466eb6f6f8800822bd06b850cdee079cfa57d6db1b4fea4
status: synced
tags:
  - GitHub
  - 开发工具
  - AI应用
series: null
feed_source: null
ai_summary: Claude Code 是一个运行在终端中的代理式编程助手，能用自然语言理解代码库、执行日常任务并处理 Git 工作流。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 0
  failed_urls:
    - https://camo.githubusercontent.com/92c4b317cff472ae3476218ac6a59a4e1e2071b074166d0a003953d6a4408ff1/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4e6f64652e6a732d31382532422d627269676874677265656e3f7374796c653d666c61742d737175617265
    - https://camo.githubusercontent.com/54fc0e51d112658ac0d5ef0a25e03c9ebcbf5bf0068b35d818cdc18825f97bf8/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f762f40616e7468726f7069632d61692f636c617564652d636f64652e7376673f7374796c653d666c61742d737175617265
    - /anthropics/claude-code/raw/main/demo.gif
notion_page_id: 3ab75244-d011-814d-9fb5-e509bcc32f69
ioc:
  cves: []
  cwes: []
  hashes:
    - 54fc0e51d112658ac0d5ef0a25e03c9ebcbf5bf0068b35d818cdc18825f97bf8
    - 92c4b317cff472ae3476218ac6a59a4e1e2071b074166d0a003953d6a4408ff1
  domains:
    - anthropic.com
    - camo.githubusercontent.com
    - code.claude.com
    - github.com
    - install.sh
    - www.anthropic.com
    - www.npmjs.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Claude Code 是一个运行在终端中的代理式编程助手，能用自然语言理解代码库、执行日常任务并处理 Git 工作流。
> 
> - **安装方式：** Mac/Linux 推荐使用 `curl -fsSL https://claude.ai/install.sh | bash`，Windows 推荐 `irm https://claude.ai/install.ps1 | iex`；也支持 Homebrew、WinGet 等包管理器，npm 安装已弃用。
> - **功能特性：** 支持在终端、IDE 内使用，或在 GitHub 上通过 @claude 调用，可解释复杂代码、自动化例行任务并处理 Git 操作。
> - **插件系统：** 仓库内附带多个插件，通过自定义命令和代理扩展功能，详细用法参见 plugins 目录。
> - **数据收集与隐私：** 会收集反馈、使用数据（如代码接受/拒绝）及关联对话，但不会用反馈数据训练模型，并设有访问限制和保留周期等隐私保护措施。
> - **反馈渠道：** 在 Claude Code 内使用 `/bug` 命令可直接报告问题，或通过 GitHub issue 提交反馈；社区交流可在 Claude Developers Discord 中进行。

## Claude Code

[![](⚠️ https://camo.githubusercontent.com/92c4b317cff472ae3476218ac6a59a4e1e2071b074166d0a003953d6a4408ff1/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4e6f64652e6a732d31382532422d627269676874677265656e3f7374796c653d666c61742d737175617265)](https://camo.githubusercontent.com/92c4b317cff472ae3476218ac6a59a4e1e2071b074166d0a003953d6a4408ff1/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4e6f64652e6a732d31382532422d627269676874677265656e3f7374796c653d666c61742d737175617265) [![npm](⚠️ https://camo.githubusercontent.com/54fc0e51d112658ac0d5ef0a25e03c9ebcbf5bf0068b35d818cdc18825f97bf8/68747470733a2f2f696d672e736869656c64732e696f2f6e706d2f762f40616e7468726f7069632d61692f636c617564652d636f64652e7376673f7374796c653d666c61742d737175617265)](https://www.npmjs.com/package/@anthropic-ai/claude-code)

Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks, explaining complex code, and handling git workflows -- all through natural language commands. Use it in your terminal, IDE, or tag @claude on Github.

**Learn more in the [official documentation](https://code.claude.com/docs/en/overview)**.

[![](⚠️ https://github.com/anthropics/claude-code/raw/main/demo.gif)](https://github.com/anthropics/claude-code/blob/main/demo.gif)

## Get started

Note

Installation via npm is deprecated. Use one of the recommended methods below.

For more installation options, uninstall steps, and troubleshooting, see the [setup documentation](https://code.claude.com/docs/en/setup).

1.  Install Claude Code:
    
    **MacOS/Linux (Recommended):**
    
    ```
    curl -fsSL https://claude.ai/install.sh | bash
    ```
    
    **Homebrew (MacOS/Linux):**
    
    ```
    brew install --cask claude-code
    ```
    
    **Windows (Recommended):**
    
    ```
    irm https://claude.ai/install.ps1 | iex
    ```
    
    **WinGet (Windows):**
    
    ```
    winget install Anthropic.ClaudeCode
    ```
    
    **NPM (Deprecated):**
    
    ```
    npm install -g @anthropic-ai/claude-code
    ```
    
2.  Navigate to your project directory and run `claude`.
    

## Plugins

This repository includes several Claude Code plugins that extend functionality with custom commands and agents. See the [plugins directory](https://github.com/anthropics/claude-code/blob/main/plugins/README.md) for detailed documentation on available plugins.

## Reporting Bugs

We welcome your feedback. Use the `/bug` command to report issues directly within Claude Code, or file a [GitHub issue](https://github.com/anthropics/claude-code/issues).

## Connect on Discord

Join the [Claude Developers Discord](https://anthropic.com/discord) to connect with other developers using Claude Code. Get help, share feedback, and discuss your projects with the community.

## Data collection, usage, and retention

When you use Claude Code, we collect feedback, which includes usage data (such as code acceptance or rejections), associated conversation data, and user feedback submitted via the `/bug` command.

### How we use your data

See our [data usage policies](https://code.claude.com/docs/en/data-usage).

### Privacy safeguards

We have implemented several safeguards to protect your data, including limited retention periods for sensitive information, restricted access to user session data, and clear policies against using feedback for model training.

For full details, please review our [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms) and [Privacy Policy](https://www.anthropic.com/legal/privacy).
