---
title: 【微信】我做了一个用自然语言挖漏洞的 AI 渗透工具：VulnClaw
source: https://mp.weixin.qq.com/s/fnuSmqUoRNglZ3tu4ceb6Q
source_host: mp.weixin.qq.com
clip_date: 2026-07-27T17:02:20+08:00
trace_id: 63417dee-87ee-424c-a820-5ecc6647ba8a
content_hash: 2bf5141f648be56811294ae5d7944c7d4c2dcf353dc762569311b4bf49ca4f57
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3aa75244-d011-8119-b2d4-c9ffacd8a50b
ioc: null
---

**C4安全** *2026年7月27日 16:44*

## VulnClaw：说人话，打漏洞

**AI 驱动的渗透测试 CLI 工具，让安全测试像聊天一样简单**

> GitHub: Unclecheng-li/VulnClaw | Star: 23 | Fork: 6 | License: MIT

* * *

## 0x00 先说痛点

做渗透测试，你是否经历过这些：

-   **信息收集**
    
    阶段，Nmap、Masscan、Subfinder…工具一堆，命令记不住
    
-   **漏洞发现**
    
    时，面对大量扫描结果，不知道先打哪个
    
-   **漏洞利用**
    
    阶段，POC 要自己改，EXP 要自己找
    
-   **报告编写**
    
    更是噩梦，截图、整理、格式化…测试1小时，写报告3小时
    

**VulnClaw 的诞生，就是为了解决这些问题。**

* * *

## 0x01 VulnClaw 是什么

VulnClaw 是一个 **AI 驱动的渗透测试 CLI 工具** ，基于 LLM Agent + MCP 工具链 + 渗透 Skill 编排。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/564e42fc3b3a8b88.png)

### 核心价值

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b61a0b1ee8137676.png)

**你只需要说「帮我测试这个站」，剩下的，VulnClaw 来做。**

* * *

## 0x02 核心特性一览

### 特性分布热力图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/49def1a9a3193bf2.png)

### 1\. 自然语言驱动

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8a1094da6a413ae3.png)

不再需要记命令，你说什么，AI 就懂什么。

### 2\. 多模型支持（8 个 Provider）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/31f8850b6ca0b215.png)

一键切换，想用哪个用哪个。

### 3\. MCP 工具链（11 服务 / 23 工具）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ab2ba5944b7f02b5.png)

### 4\. 渗透 Skill 体系

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e517005747f98601.png)

**20 个 Skill，138 个参考文档** ，覆盖渗透测试全流程。

### 5\. 编解码/加解密工具（29 种）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2313179b26d77e09.png)

### 6\. 持续性渗透测试

-   **默认配置**
    
    ：100 轮/周期 × 10 周期 = 1000 轮
    
-   **每周期**
    
    自动生成报告
    
-   **跨周期**
    
    状态保持，越打越深入
    

### 7\. 自动化报告 & PoC 生成

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/65f6263b0bf7388e.png)

* * *

## 0x03 快速上手

### 安装

```bash
# 一键安装
curl -fsSL https://raw.githubusercontent.com/Unclecheng-li/VulnClaw/main/scripts/install.sh | bash
# 或 pip 安装
pip install vulclaw
```

### 使用方式

```apache
# 方式一：REPL 交互模式（推荐）
vulnclaw
# 方式二：单命令全流程
vulnclaw run 192.168.1.100
# 方式三：持续性渗透
vulnclaw persistent 192.168.1.100
# 方式四：仅信息收集
vulnclaw recon target.com
# 方式五：漏洞扫描
vulnclaw scan target.com --ports 80,443,8080
```

### REPL 交互示例

```cs
$ vulnclaw
████████╗██╗  ██╗ █████╗ ██████╗ ███████╗
╚══██╔══╝██║  ██║██╔══██╗██╔══██╗██╔════╝
   ██║   ███████║███████║██████╔╝███████╗
   ██║   ██╔══██║██╔══██║██╔═══╝ ╚════██║
   ██║   ██║  ██║██║  ██║██║     ███████║
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝
> 说人话，打漏洞
[主机] 请输入目标: 192.168.1.100
[模式] 选择模式 (1.自动 2.交互): 1
[AI] 正在分析目标...
[AI] 开始信息收集阶段...
[MCP] 调用 http_scan 工具
[发现] 目标开放端口: 80, 443, 8080
[发现] Web服务: Apache/2.4.41
[漏洞] 检测到可疑端点: /admin/login.php
[AI] 开始漏洞利用阶段...
[利用] 尝试 SQL注入检测... [疑似] 参数 id 未过滤
[报告] 报告已生成: report_192.168.1.100_20260426.md
[PoC] PoC脚本已生成: poc_sqli_192.168.1.100.py
```

* * *

## 0x04 架构解析

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e22591bc35d0cd31.png)

* * *

## 0x05 使用场景

| 场景  | 适用度 | 说明  |
| --- | --- | --- |
| **CTF 竞赛** | ⭐⭐⭐⭐⭐ | CTF Web/Crypto/Misc 专项，快速解题 |
| **授权渗透测试** | ⭐⭐⭐⭐⭐ | 自动化流程，提升效率 |
| **安全教学** | ⭐⭐⭐⭐ | 学习渗透测试思路和流程 |
| **红队演练** | ⭐⭐⭐⭐ | 持续性渗透，深度利用 |

* * *

## 0x06 与传统工具对比

| 维度  | VulnClaw | 传统工具 |
| --- | --- | --- |
| **学习成本** | 低，说人话就行 | 高，需要记忆大量命令 |
| **自动化程度** | 高，全流程 AI 驱动 | 低，需要手动切换工具 |
| **工具数量** | 统一入口，11 MCP 服务 | Nmap+Burp+SQLMap+… |
| **报告生成** | 自动，Markdown + PoC | 手动，耗时耗力 |
| **上下文保持** | 跨周期状态记忆 | 每次任务重头来 |
| **模型支持** | 8 种，灵活切换 | 固定工具集 |
| **扩展性** | Skill + MCP，插件化 | 依赖工具更新 |

* * *

## 0x07 安全声明

> ⚠️ **VulnClaw 仅用于已授权的安全测试**
> 
> 使用前需确保：
> 
> -   已获得目标系统的 **明确书面授权**
>     
> -   测试范围已与目标所有者 **书面确认**
>     
> -   遵守 **当地法律法规**
>     
> 
> **未经授权进行渗透测试是违法行为。**

* * *

## 0x08 Roadmap

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fc988f9ede2fb92a.png)

* * *

## 0x09 总结

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f2cafa03bf340837.png)

**VulnClaw 不是要取代安全工程师，而是让安全工程师更高效。**

* * *

## Links

-   **GitHub**
    
    : https://github.com/Unclecheng-li/VulnClaw
    
-   **文档**
    
    : README.md
    
-   **Issue**
    
    : 欢迎提 Bug 和 Feature
    

* * *

*如果你觉得这个项目有帮助，请给个 Star ⭐*
