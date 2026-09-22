---
title: Cyhub CTF 2025 - Oh My BSD | Varik's Blog
source: https://varik.dev/blog/cyhubctf2025/oh-my-bsd
source_host: varik.dev
clip_date: 2026-09-22T10:16:17+08:00
trace_id: e380c1d1-8b4c-4b13-8cb7-ac6d72c5800e
content_hash: 2b0a63ff15b98e6c827bfbf2bda93ecb587bd512ae4751872812f6a9fde425d6
status: synced
tags:
  - 游戏安全
  - Android逆向
series: null
feed_source: Varik
ai_summary: Godot 游戏逆向挑战：玩家跳跃速度被故意设为 -300.1337，需改到至少 -500 才能跳到 FreeBSD 徽标拿 flag。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-8190-ac9c-f6a9bedd3286
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Godot 游戏逆向挑战：玩家跳跃速度被故意设为 -300.1337，需改到至少 -500 才能跳到 FreeBSD 徽标拿 flag。
> 
> - **核心障碍：** 跳跃速度 `-300.1337` 不足以够到目标，正常游玩无法通关。
> - **方法一（内存修改，最快）：** 用 cheat-engine-rs 扫十六进制 `9a779ca223c272c0`，命中 2 处地址，全部改为 `-500.1337`（即 `9a779ca223427fc0`）即可通关。
> - **方法二（完整逆向）：** 用 GDRE Tools（gdsdecomp）从 `.dmg`/`.exe`/Linux 二进制中提取整个 Godot 项目，找到玩家脚本（如 `player.gd`）并修改 `jump_velocity`，再用 Godot 打开运行拿 flag。
> - **Godot 特性：** 脚本、场景与资源以较易提取的格式打包，所以比普通编译二进制更易反编译与改包。
> - **推荐工具：** cheat-engine-rs、GDRE Tools、Godot Engine；flag 格式 `cyhub{xxxxx}`，题干源码在作者 GitHub 仓库。

## Oh My BSD

For Cyhub CTF 2025, I created a reverse engineering challenge centered around a Godot game. The challenge combined game hacking with traditional reverse engineering techniques, offering players multiple paths to victory. Several teams managed to solve it, with some opting for the quick memory editing approach while others went the full reverse engineering route.

## Challenge Description

> Jump to reach the FreeBSD logo and capture the flag! But wait... something seems off with the jump mechanics...

Players were provided with a game executable (macOS `.dmg` or Linux binary) where the objective appeared simple: jump to reach the FreeBSD logo. However, upon playing, it quickly becomes clear that the player's jump velocity is intentionally set too low, making it impossible to reach the goal through normal gameplay.

**Category:** Reverse Engineering  
**Difficulty:** Easy  
**Flag Format:** `cyhub{xxxxx}`

## Challenge Overview

The game is built with Godot Engine, which presents an interesting reverse engineering target. Unlike compiled binaries where source code is compiled to machine code, Godot games package their project files (scripts, scenes, assets) in a relatively accessible format. This makes them vulnerable to extraction and modification.

The core issue: the jump velocity is set to `-300.1337`, but reaching the FreeBSD logo requires at least `-500` to make the jump possible.

## Solution Walkthrough

### Method 1: Memory Editing (Quick and Dirty)

The fastest way to solve this challenge is by using memory editing tools to directly modify the jump velocity in the running game process.

**Using [cheat-engine-rs](https://github.com/var77/cheat-engine-rs):**

1.  **Launch the game** and keep it running
    
2.  **Identify the target value:** The game displays the jump velocity on screen: `-300.1337`
    
    -   This value in hexadecimal is: `9a779ca223c272c0`
3.  **Scan memory:**
    
    -   Use cheat-engine-rs to scan the game process memory for the hex value `9a779ca223c272c0`
    -   This will return 2 results (the value is stored in multiple locations)
4.  **Modify the values:**
    
    -   Edit both memory addresses to the new value: `-500.1337`
    -   In hexadecimal: `9a779ca223427fc0`
5.  **Win the game:**
    
    -   With the increased jump velocity, you can now jump high enough to reach the FreeBSD logo and capture the flag!

This method bypasses the need to extract and decompile the entire Godot project, making it much faster and easier for players familiar with memory editing techniques.

### Method 2: Full Reverse Engineering

For those who want to take the traditional reverse engineering approach:

**Stage 1: Extracting the Godot Project**

1.  **Use GDRE Tools:** Download and install the [Godot Reverse Engineering Tools (gdsdecomp)](https://github.com/GDRETools/gdsdecomp)
    
2.  **Extract the project:**
    
    -   Open GDRE Tools
    -   Load the game executable (`.dmg`, `.exe`, or Linux binary)
    -   Extract the entire Godot project to a directory

**Stage 2: Analyzing the Jump Mechanics**

1.  **Locate the player script:** Find the player character's script in the extracted project (typically in a file like `player.gd` or similar)
    
2.  **Find the jump velocity:** Look for the jump mechanics in the code:
    
    ```gdscript
    var jump_velocity = -300.1337
    ```
    
3.  **Identify the problem:** The current jump velocity of `-300.1337` is insufficient to reach the FreeBSD logo
    

**Stage 3: Modifying the Game**

1.  **Edit the jump velocity:** Change the jump velocity to at least `-500`:
    
    ```gdscript
    var jump_velocity = -500.1337
    ```
    
2.  **Save the changes**
    

**Stage 4: Running the Modified Game**

1.  **Open in Godot:** Open the extracted and modified project in Godot Engine
    
2.  **Run the game:** Press the play button or F5 to run the game
    
3.  **Reach the goal:** With the increased jump velocity, you can now jump high enough to reach the FreeBSD logo
    
4.  **Capture the flag:** When you reach the FreeBSD logo, the flag will be revealed
    

## Solution Video

Here's a video walkthrough showing the memory editing approach:

## Key Technical Details

-   **Original jump velocity:** `-300.1337` (insufficient)
-   **Required jump velocity:** `-500` or higher
-   **Game Engine:** Godot Engine
-   **Extraction method:** GDRE Tools to decompile the game binary
-   **Memory editing:** Two instances of the jump velocity in memory

## Tools Recommended

-   **[cheat-engine-rs](https://github.com/var77/cheat-engine-rs)** - Rust-based memory scanner/editor (quickest solution)
-   **[GDRE Tools (gdsdecomp)](https://github.com/GDRETools/gdsdecomp)** - Godot Reverse Engineering and decompilation toolkit
-   **[Godot Engine](https://godotengine.org/)** - To run and test the modified project

The challenge source code can be found [here](https://github.com/var77/cyhubctf2025/tree/main/oh_my_bsd)
