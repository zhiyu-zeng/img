---
title: 【GitHub】claude-code/README.md at main
source: https://github.com/anthropics/claude-code/blob/main/README.md
source_host: github.com
clip_date: 2026-06-11T10:54:23+08:00
trace_id: 3948c131-7591-4de4-81f0-ec19ebf71eb3
content_hash: 8c6e9a205a6a479e60dfcdb9a62fe18b8cccb181d9c3f8b2d64e65008bfa2074
status: imaged
tags:
  - GitHub
series: null
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: null
---

## Claude Code

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8d6af8ee9fb1e7c1.bin)](https://camo.githubusercontent.com/92c4b317cff472ae3476218ac6a59a4e1e2071b074166d0a003953d6a4408ff1/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f4e6f64652e6a732d31382532422d627269676874677265656e3f7374796c653d666c61742d737175617265) [![npm](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/54b1a05d0657ac6b.bin)](https://www.npmjs.com/package/@anthropic-ai/claude-code)

Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks, explaining complex code, and handling git workflows -- all through natural language commands. Use it in your terminal, IDE, or tag @claude on Github.

**Learn more in the [official documentation](https://code.claude.com/docs/en/overview)**.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/461cf109f5264892.gif)](https://github.com/anthropics/claude-code/blob/main/demo.gif)

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
