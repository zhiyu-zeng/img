---
title: EnvMe
source: https://tsingshui.art/work/envme/
source_host: tsingshui.art
clip_date: 2026-11-23T10:38:12+08:00
trace_id: 3bba0fca-f809-47f2-bb5f-00c94f8a7829
content_hash: e643ef2a4d8fc5e3a27e4e5dc56c0b1058f760e5850843e5c590b50a4d73fd0a
status: synced
tags: []
series: null
feed_source: 清水·Android/内核逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42175244-d011-8127-b9ba-cf2db4d89964
ioc: null
---

## My Coding Env Setup

-   reverse:
    -   rasc（jadx 的替代品）: [https://github.com/TsingShui/rasc](https://github.com/TsingShui/rasc) — `cargo install --git https://github.com/TsingShui/rasc`
    -   kuna: [git@github.com](mailto:git@github.com):Noelo-Lab/kuna.git
    -   mitm: brew install mitm
    -   llvm-cxxfilt: [https://llvm.org/docs/CommandGuide/llvm-cxxfilt.html](https://llvm.org/docs/CommandGuide/llvm-cxxfilt.html) — `brew install llvm`
-   agent:
    -   pi: [https://pi.dev](https://pi.dev/) — `npm i -g @earendil-works/pi-coding-agent`
        -   extensions (pi packages, `pi list` 查看已装):
            -   pi-fff: `pi install npm:@ff-labs/pi-fff` — 模糊文件名/内容搜索（fff + fd）
            -   pi-subagents: `pi install npm:pi-subagents` — 子代理委派与脚本化多智能体工作流
            -   pi-web-access: `pi install npm:pi-web-access` — 网页搜索、URL 抓取、PDF、YouTube
            -   pi-autoresearch: `pi install npm:pi-autoresearch` — 自主实验循环（跑→测→留/弃）
            -   pi-goal-x: `pi install npm:pi-goal-x` — `/goal` 目标规划、进度持久化与完成度审计
            -   pi-zentui: `pi install npm:pi-zentui` — Starship 风格状态栏 + opencode 风格 TUI
        -   skills:
            -   codebase-design / grill-me / teach: `npx skills@latest add mattpocock/skills`
        -   config:
            -   `~/.pi/agent/settings.json`:
                
                ```json
                {
                  "theme": "dark",
                  "defaultProvider": "deepseek",
                  "defaultModel": "deepseek-v4-flash",
                  "defaultThinkingLevel": "max",
                  "hideThinkingBlock": true
                }
                ```
                
                （ `packages` 字段即上面的扩展列表）
            -   `~/.pi/agent/web-search.json`: provider 为 exa（key 走环境变量 `EXA_API_KEY` ），关闭交互式 curation（ `workflow: none` ）
            -   `~/.pi/agent/zentui.json`: zentui 的 editor / statusline 等组件配置
-   shell:
    -   gh: brew install gh
    -   otty: [https://otty.sh/](https://otty.sh/)
        -   config: `~/Library/Application Support/com.mitchellh.ghostty/config`
            
            ```ini
            font-family = Maple Mono NF CN
            font-size = 16
            theme = Nord
            keybind = shift+enter=text:\n
            keybind = global:cmd+backquote=toggle_quick_terminal
            ```
            
    -   fish shell: [https://fishshell.com](https://fishshell.com/) — `brew install fish`
        -   config: `~/.config/fish/config.fish`
            -   镜像源:
                
                ```fish
                set -gx HOMEBREW_BOTTLE_DOMAIN "https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles"
                set -gx HOMEBREW_API_DOMAIN "https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api"
                set -gx HOMEBREW_BREW_GIT_REMOTE "https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git"
                set -gx HOMEBREW_CORE_GIT_REMOTE "https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-core.git"
                set -gx HOMEBREW_AUTO_UPDATE_SECS 604800
                ```
                
            -   别名:
                
                ```fish
                alias cls "stty sane; printf '\033c'; clear"
                alias where="which"
                ```
                
    -   starship: [https://starship.rs](https://starship.rs/) — `brew install starship`
        -   config: `~/.config/starship.toml`
            
            ```toml
            format = "$username$all$time$line_break$character"
            add_newline = false
            
            [username]
            show_always = true
            
            [time]
            disabled = false
            format = "when [$time]($style) "
            
            [character]
            success_symbol = "[\\$](bold green)"
            error_symbol = "[\\$](bold red)"
            
            [battery]
            full_symbol = "• "
            charging_symbol = "⇡ "
            discharging_symbol = "⇣ "
            unknown_symbol = "❓ "
            empty_symbol = "❗ "
            
            [erlang]
            symbol = "ⓔ "
            
            [nodejs]
            symbol = "[⬢](bold green) "
            
            [pulumi]
            symbol = "🧊 "
            
            [typst]
            symbol = "t "
            ```
            
    -   zoxide: [https://github.com/ajeetdsouza/zoxide](https://github.com/ajeetdsouza/zoxide) — `brew install zoxide`
    -   fnm: Node.js 版本管理 — `curl -fsSL https://fnm.vercel.app/install | bash`
    -   uv: Python 包管理器 — `curl -LsSf https://astral.sh/uv/install.sh | sh`
    -   cargo: Rust 构建工具 — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
