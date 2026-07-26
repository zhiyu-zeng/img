---
title: 【微信】SpecterAI AI 渗透系统
source: https://mp.weixin.qq.com/s/aBGlLpSQlN5mGgaxbYFntQ
source_host: mp.weixin.qq.com
clip_date: 2026-07-26T19:28:16+08:00
trace_id: e59750a8-a392-4feb-b193-456fcb3c6e01
content_hash: d5c2ab3ed93a62d3fea3898e6ce4081fe255c8fa765311837f276fc9b425164b
status: summarized
tags:
  - 微信
  - AI应用
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: SpecterAI V1.5 是基于 Kali Linux 深度定制的 AI 渗透测试系统，集成多款 AI 代理框架与自动化技能，旨在为安全研究人员提供开箱即用的智能化攻防环境。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3a975244-d011-81af-ab42-ea1e465f4cca
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SpecterAI V1.5 是基于 Kali Linux 深度定制的 AI 渗透测试系统，集成多款 AI 代理框架与自动化技能，旨在为安全研究人员提供开箱即用的智能化攻防环境。
> 
> - **系统基石：** 基于 Kali Linux 2026.1 定制，内核为 6.19.14，预置 Docker、Clash Verge 网络代理及 IntelliJ IDEA 等工具，优化了国内镜像源和中文输入。
> - **核心引擎：** 内置 HexStrike AI 与 CyberStrike AI。HexStrike 是集成 150+ 模块的渗透核心，可通过 Cherry Studio 或 Web API 调用；CyberStrike 提供 Web 仪表盘，整合 128 个 MCP 工具接口，支持与大模型联动。
> - **扩展能力：** 深度集成 Claude Code 及 CC Switch 代理，支持本地 AI 编程与渗透；新增 Hermas 多 Agent 框架与 Strix 自动化代理，可对 GitHub 仓库或线上目标进行批量安全评估。
> - **技能预置：** 提供丰富的 AI Skills，包括 `/secskills` 全自动渗透、`/code-audit` 代码审计、`/decompile` 安卓逆向及覆盖 OWASP Top 10 等领域的 817 项结构化安全技能。
> - **应用场景：** 支持快速黑盒渗透（CyberStrike）、源码审计（Claude Code）、CTF 解题、批量扫描（Strix）及红队攻防演练（Hermas）等多种安全任务。

**一个人挺好 wa** *2026年7月26日 19:09*

百度网盘下载链接:

```bash
https://pan.baidu.com/s/1kTha3A8q6-OPWMNG70l8Yw?pwd=q9gd
```

夸克网盘链接：

```bash
https://pan.quark.cn/s/e430c84b46b0?pwd=ajWE
```

**项目作者**

暗魂攻防实验室官网：https://www.anhunsec.cn

暗魂官方微信客服：anhunsec_kf

暗魂官方邮箱：anhunsec@126.com

**SpecterAI** 是由暗魂攻防实验室（AnHunSec）开发的面向网络安全渗透测试领域的集成化 AI 作战系统。该系统基于 **Kali Linux 2026.1** 深度定制，以 **AI 安全** 为核心目标，整合了渗透测试工具链、多模态 AI 代理框架及自动化攻防能力，旨在为安全研究人员提供开箱即用的智能化渗透攻防环境。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/77cab353f65bc3af.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ab2b5b2ea63b005b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/79fbd69aab9553b3.jpg)

## 系统基础环境

### 操作系统配置

| 配置项 | 详情  |
| :--- | :--- |
| **操作系统** | Kali Linux VMware 版（2026.1） |
| **内核版本** | Linux kali 6.19.14+kali-amd64 #1 SMP PREEMPT_DYNAMIC |
| **分区大小** | 100 GB |
| **root 密码** | root |
| **普通用户** | kali / kali（默认已锁定，可自行解锁） |

### 2.2 系统优化组件

-   **输入法** ：fcitx5，按 左 Shift 切换中英文
    
-   **系统清理**
    
    ```
    bleachbit
    ```
    
    启动图形界面）
    
-   **软件源** ：已预置 Kali 官方源及阿里云国内镜像源
    
    ```
    deb https://mirrors.aliyun.com/kali kali-rolling main non-free contrib
    deb-src https://mirrors.aliyun.com/kali kali-rolling main non-free contrib
    ```
    

### 容器化环境

| 组件  | 版本  | 备注  |
| :--- | :--- | :--- |
| Docker | 29.5.2 | ```<br>https://docker.1ms.run/<br>``` |
| Docker Compose | v5.1.4 | ```<br>docker compose<br>```<br><br>```<br>docker-compose<br>``` |

* * *

## AI 工具矩阵

SpecterAI V1.5 围绕 **AI 驱动的自动化渗透测试** 构建了完整的工具矩阵，涵盖从信息收集、漏洞挖掘到后渗透利用的全链路能力。

### HexStrike AI — 智能攻防核心

HexStrike AI 是 SpecterAI 的核心 AI 渗透引擎，提供 150+ 集成模块与自适应 AI 决策引擎。

| 属性  | 详情  |
| :--- | :--- |
| **安装路径** | ```<br>/root/hexstrike-ai/<br>``` |
| **启动方式** | 桌面双击启动器 或 终端执行<br><br>```<br>hexstrike_server --debug<br>``` |
| **服务地址** | ```<br>127.0.0.1:8888<br>``` |
| **前端交互** | Cherry Studio（桌面已预置） |

**远程访问配置** ：若需从物理机通过 MCP 协议连接 Kali 虚拟机，需修改配置文件：

```
# 修改 /usr/share/hexstrike-ai/hexstrike_Server.py
# 将 API_HOST 从 127.0.0.1 改为 0.0.0.0
```

**工作流** ：

1.  启动 HexStrike AI 服务（终端模式）
    
2.  打开 Cherry Studio，选择预置的「HexStrike AI」助手
    
3.  使用小米 MiMo V2.5 等大模型驱动自动化渗透任务
    

* * *

### CyberStrike AI — 可视化渗透平台

CyberStrike AI 提供 Web 化的 AI 渗透测试仪表盘，支持与 HexStrike 的 MCP 协议联动。

| 属性  | 详情  |
| :--- | :--- |
| **安装路径** | ```<br>/root/CyberStrikeAI/<br>``` |
| **启动命令** | ```<br>./run.sh<br>```<br><br>（桌面已添加启动器） |
| **访问地址** | ```<br>https://127.0.0.1:8080/#dashboard<br>``` |
| **默认账号** | ```<br>admin<br>``` |
| **默认密码** | ```<br>Mu1vLrbHN3wUtHmCAD6cObes<br>``` |

**核心功能模块** ：

-   **仪表盘** ：实时展示运行任务、漏洞总数、工具调用成功率
    
-   **对话系统** ：基于 Eino 推理引擎的交互式渗透测试
    
-   **信息收集** ：自动化资产测绘
    
-   **漏洞管理** ：严重/高危/中危/低危分级管理
    
-   **WebShell / C2 管理** ：后渗透阶段控制
    
-   **MCP 工具** ：128 个可用工具接口
    
-   **Skills / Agents / 角色** ：支持自定义安全能力
    

**大模型配置** ：在「系统设置」中配置 OpenAI 兼容接口，推荐使用小米 MiMo：

-   ```
    https://api.xiaomimimo.com/v1
    ```
    
-   ```
    mimo-v2.5
    ```
    
-   最大上下文 Token：120000
    

* * *

### Claude Code + CC Switch — 本地 AI 编程与渗透代理

SpecterAI 深度集成了 Claude Code 终端 AI 助手，并通过 CC Switch 实现国内大模型的路由代理。

#### CC Switch 配置

| 属性  | 详情  |
| :--- | :--- |
| **功能** | AI 供应商路由与代理中转 |
| **启动方式** | 桌面双击（开机自启） |
| **预置供应商** | Xiaomi MiMo、DeepSeek 等 |

#### Claude Code 权限模式

```haskell
# 自动批准文件编辑（读/写/编辑），Shell 命令仍需确认
claude --permission-mode acceptEdits

# 智能自动模式
claude --permission-mode auto

# 危险模式（完全禁用权限检查，慎用）
claude --dangerously-skip-permissions
```

**快捷键**

```
Shift + Tab
```

快速切换权限级别

* * *

### Hermas — 多 Agent 协同框架

Hermas 是 SpecterAI 的多 Agent 智能体框架，通过 CC Switch 右上角图标启动 Web UI。

| 属性  | 详情  |
| :--- | :--- |
| **启动方式** | CC Switch 界面右上角 → Hermes 图标 |
| **运行要求** | 终端进程不可关闭，最小化后台运行 |
| **访问地址** | 浏览器打开对应本地端口 |

**核心特性** ：

-   **多 Agent 配置** ：自动同步 CC Switch 中配置的所有 AI 供应商
    
-   **模型热切换** ：在「对话」页面右上角切换模型（修改配置后需重启 Hermas）
    
-   **Skills 集成** ：预置 69+ 工具处理能力
    

* * *

### Strix — AI 自动化渗透代理（V1.5 新增）

Strix 是 SpecterAI V1.5 新增的 AI 渗透测试代理，支持对 GitHub 仓库、线上应用及批量目标进行自动化安全评估。

**使用方式** ：

```bash
# 分析 GitHub 公开仓库（白盒测试）
strix --target https://github.com/org/repo

# 对线上应用进行黑盒测试
strix --target https://your-app.com

# 白盒+黑盒结合测试
strix -t https://github.com/org/repo -t https://your-app.com

# 批量目标扫描
strix --target-list targets.txt
```

**环境变量配置** ：

```toml
exportLLM_API_KEY='your-api-key'
exportSTRIX_LLM='openai/gpt-5.4'
```

* * *

## AI Skills 技能库

SpecterAI 预置了丰富的安全 Skills，可通过 Claude Code 或 Hermas 直接调用。

### 已预置 Skills 清单

| Skill 名称 | 调用命令 | 功能描述 |
| :--- | :--- | :--- |
| **渗透测试** | ```<br>/secskills<br>``` | 提供目标（IP/域名/URL+端口）即可启动全自动渗透测试流程 |
| **代码审计** | ```<br>/code-audit deep /path<br>``` | 覆盖 OWASP Top 10、注入、认证、授权、反序列化等 10 大维度 |
| **安卓逆向** | ```<br>/decompile<br>``` | 支持 APK/XAPK/JAR/AAR 反编译、Xposed 框架检测、动态加载分析 |
| **CTF 解题** | ```<br>/solve-challenge<br>``` | 覆盖 Crypto、Forensics、Pwn、Reverse、Web 等全类别 CTF 题目 |
| **Claude-Red** | 智能触发 | 58 个覆盖 13 大安全领域的红队技能库（SQLi、AD 域渗透、无线攻击等） |
| **Cybersecurity-Skills** | ```<br>/skills<br>``` | 817 项结构化技能，映射 MITRE ATT&CK、NIST CSF 2.0 等 6 大框架 |

### 渗透测试 Skill 能力示例

```
/secskills
```

可自动完成以下攻击链：

1.  **信息收集** ：nmap 端口扫描 + gobuster 目录爆破
    
2.  **漏洞发现** ：Reverse Tabnabbing、JWT 分析等
    
3.  **漏洞利用** ：钓鱼页面部署、凭据窃取
    
4.  **横向移动** ：SSH 登录、配置文件泄露、计划任务注入
    
5.  **权限提升** ：sudo 滥用提权、SUID 持久化
    

* * *

## 辅助工具集

### 网络代理

-   **Clash Verge** ：桌面双击启动，支持系统代理与 TUN 虚拟网卡模式（终端需开启虚拟网卡模式才能使用代理）
    

### 浏览器环境

-   **Google Chrome** ：预置 ChromeDriver 148.0.7778.178，为 HexStrike AI 的 Browser Agent 提供浏览器自动化能力
    

### 开发环境

-   **IntelliJ IDEA**
    
    ```
    /opt/idea-IU-261.24374.151/
    ```
    
    ，已激活至 2099 年
    

-   内置 AI Assistant 调用本地 Claude Code
    
-   配合 CC Switch 使用（首次打开选择 Anthropic 认证）
    
-   ```
    wget -q ckey.run -O ckey.run && bash ckey.run
    ```
    

* * *

## 版本演进

| 版本  | 发布日期 | 核心更新 |
| :--- | :--- | :--- |
| **V1.5** | 2026-07-26 | 新增 Strix；更新 Claude V2.1.220、CC Switch 3.18.0、Hermas 0.19.0、CyberStrikeAI V1.7.9；新增 Claude-Red、Cybersecurity-Skills |
| V1.4 | 2026-07-04 | 更新 Kali 源、优化 VMTools；Claude 启用自动审批；CC Switch 3.16.5 |
| V1.3 | 2026-06-18 | 新增 Hermas Desktop、CTF-Skills |
| V1.2 | 2026-06-12 | 修复 IDEA CC GUI root 模式问题；修复 Claude Code Segmentation Fault |
| V1.1 | 2026-06-05 | 安装 Kali 完整版工具；新增桌面快捷启动 HexStrike 与 CyberStrike |

* * *

## 快速启动指南

### 首次使用流程

1.  **启动代理** ：打开 Clash Verge → 开启「虚拟网卡模式」
    
2.  **启动 AI 服务** （三选一或多选）：
    

-   双击「HexStrike AI」启动器 → 打开 Cherry Studio
    
-   双击「CyberStrike AI」启动器 → 浏览器访问
    
    ```
    https://127.0.0.1:8080
    ```
    
-   打开终端 → 输入
    
    ```
    claude
    ```
    

4.  **配置大模型** ：在 CyberStrike / CC Switch 中填入小米 MiMo 或其他大模型 API Key
    
5.  **执行渗透任务** ：
    

-   HexStrike：在 Cherry Studio 中对话输入目标
    
-   CyberStrike：在「对话」页输入目标 IP/域名
    
-   ```
    /secskills
    ```
    

### 典型使用场景

| 场景  | 推荐工具 | 操作方式 |
| :--- | :--- | :--- |
| 快速黑盒渗透 | CyberStrike AI | Web 对话输入目标，启用 Eino 单代理 |
| 源码安全审计 | Claude Code | ```<br>/code-audit deep /path/to/project<br>``` |
| CTF 竞赛解题 | Claude Code | ```<br>/solve-challenge /path/to/attachment<br>``` |
| 批量资产扫描 | Strix | ```<br>strix --target-list targets.txt<br>``` |
| APK 逆向分析 | Claude Code | ```<br>/decompile /path/to/app.apk<br>``` |
| 红队攻防演练 | Hermas + CC Switch | 多 Agent 协同，加载 Claude-Red Skills |
