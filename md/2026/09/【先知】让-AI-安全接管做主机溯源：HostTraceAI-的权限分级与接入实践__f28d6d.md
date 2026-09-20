---
title: 【先知】让 AI 安全接管做主机溯源：HostTraceAI 的权限分级与接入实践
source: https://xz.aliyun.com/news/92857
source_host: xz.aliyun.com
clip_date: 2026-09-20T21:46:14+08:00
trace_id: 13a7c586-25d4-4a56-b00d-466ae5826892
content_hash: fed39aafef068696b84a26a269d27d105ad02cece57a820b0a3697d12a5d6d7e
status: synced
tags:
  - 先知
  - 安全工具
  - AI应用
series: null
feed_source: 先知安全技术社区
ai_summary: HostTraceAI 用三级权限分级与回滚记录，让 AI 在授权主机上做可审计的溯源调查；配套 WindowsSSHKit 解决 Windows 默认无 SSH 的接入难题。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e175244-d011-8163-bb75-de12ee224f7b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> HostTraceAI 用三级权限分级与回滚记录，让 AI 在授权主机上做可审计的溯源调查；配套 WindowsSSHKit 解决 Windows 默认无 SSH 的接入难题。
> 
> - **权限分级：** 一级采集类默认只读直行，二级处置类需策略允许或人工审批，三级（删文件、密码尝试、横向连接、扫描、未知脚本）默认禁止，分界线是"是否改变主机状态"。
> - **可回滚审计：** 每个处置动作记录回滚信息（原启动命令、服务启动类型、原防火墙规则），证据文件存文件系统、数据库只存元数据与哈希。
> - **reset 故障根因：** OpenSSH 9.8 起将 sshd 拆为监听进程与每连接会话进程，老系统缺 API 致会话进程被杀，表现为端口开放、服务 RUNNING 但握手后连接重置；程序目录须仅 SYSTEM 与 Administrators 可写。
> - **真实自检判据：** 用 `ssh-keyscan -T 8 -t rsa,ed25519 127.0.0.1`，返回主机公钥即健康，仅返回 banner 则说明会话进程起不来。
> - **部署要点：** 需 Go 1.25+，首次启动打印一次性 admin 强口令；必须配置 AI 通道后才可对话；Python 非必需，`mcp.enabled: false` 是刻意默认。仅供授权主机调查。

## 让 AI 安全地做主机溯源：HostTraceAI 的权限分级与 Windows 接入实践两个项目地址：

-   HostTraceAI： [https://github.com/hattrick-V/HostTraceAI](https://github.com/hattrick-V/HostTraceAI)
-   WindowsSSHKit： [https://github.com/hattrick-V/HostTraceAI-WindowsSSHKit](https://github.com/hattrick-V/HostTraceAI-WindowsSSHKit)

## 一、主机溯源的两个真实障碍

### 1.1 动作不难，难在重复与拼凑

一次典型的主机应急，目标是一台疑似被植入 WebShell 的服务器。要做的动作清单大致是这样：

-   看进程： `ps auxf` / `tasklist /v`
-   看服务： `systemctl list-units` / `sc query`
-   看启动项与计划任务
-   看外联： `ss -antp` / `netstat -ano`
-   翻 Web 目录最近被修改的文件
-   查登录日志与认证失败记录

每一条命令都不复杂。真正的成本在于：动作高度重复、容易漏项、发现散落在终端滚动历史里、事后写报告要重新拼凑一遍。同一台主机换个人做，结论顺序和覆盖范围都可能不一样。

### 1.2 更根本的问题：凭什么让 AI 动手

把 LLM 接到生产主机上，最坏的情况不是它查不出来，而是它自作主张执行了不该执行的操作——删文件、清防火墙规则、批量禁用服务，而且事后无法追溯它究竟做了什么、依据是什么。

大量"AI + 安全"的项目卡在这一步。不是能力不够，是没人敢用。

HostTraceAI 的工程设计，基本围绕第二个问题展开。

## 二、定位与边界

HostTraceAI 是面向授权运维与安全响应的 AI 主机溯源平台。它通过 SSH/MCP 连接 Linux 或 Windows 主机，由 AI 在调查过程中 **根据已获取的证据动态选择下一步动作**，而不是执行一条预设的固定剧本。

调查过程中，平台记录进程、服务、启动项、计划任务、网络连接、文件和登录活动；管理木马、WebShell、后门、挖矿和可疑持久化发现；按主机保存样本、证据包、哈希和调查时间线。

它的产品边界同样明确， **不是**：

-   告警中心
-   漏洞扫描器
-   资产测绘平台
-   渗透测试框架
-   C2 平台

主机列表只用于管理溯源目标，发现项只表示主机调查证据，不等同于漏洞。

技术基础：Go + Eino Agent 编排、MCP 工具与能力中心、Hermes 风格 Markdown Skill 加载、SQLite 主库与独立知识库、WebSocket 对话与任务进度、RBAC 与审计。

## 三、安全设计：三级权限模型

这是整个平台最值得展开的部分。

HostTraceAI 把主机上可以执行的动作分成三级，分界线画在\*\*"是否改变主机状态"\*\*上：

|     |     |     |
| --- | --- | --- |  
| 级别  | 动作类型 | 默认行为 |
| 一级  | 采集类：读进程、读服务、读日志、读网络连接、提取文件哈希 | 默认只读，直接执行 |
| 二级  | 处置类：终止进程、禁用服务、隔离主机、阻断 C2 | 需策略允许或人工审批 |
| 三级  | 高风险：删除文件、密码尝试、横向连接、网段扫描、未知脚本 | 默认禁止 |

这个设计的价值在于把"AI 能做什么"变成了一个 **可以被审计和讨论的显式清单**，而不是埋在提示词里的模糊约束。安全团队在评估引入时，可以直接对着这张表问：一级动作我们接受吗？二级动作谁来审批？三级里有没有需要放开的具体项？

### 3.1 审批不只是点同意

每个处置动作都要求记录回滚方式：

-   终止进程 → 记录原始启动命令与参数
-   禁用服务 → 记录原始启动类型
-   阻断 C2 → 记录原始防火墙规则

这样调查结束后可以完整复原，而不是留下一个"当时 AI 改了什么"的黑盒。

\[此处插入截图：审批处置界面，每个动作记录回滚方式 — images/screenshot-approval-execution.png\]

### 3.2 证据链的存储取舍

证据文件存储在文件系统，数据库只保存元数据、哈希和关联关系。

这个取舍是有意的：原始证据不会随数据库事务、迁移或版本升级而受影响，而关联关系放在结构化存储里，可以被快速查询并重建时间线。对事后出具报告和复盘来说，这比把所有东西塞进数据库更可靠。

\[此处插入截图：病毒木马溯源 — 发现项、外联与样本哈希 — images/screenshot-malware-triage.png\]

### 3.3 角色可扩展，不动核心

第一期内置两个溯源角色： **病毒木马溯源专家**、 **WebShell 后门溯源专家**。

后续角色通过 Skill 和 MCP 工具注册，不需要改动平台核心代码。这一点对安全团队比较实用——每个组织关注的威胁类型不同，能自己加角色比等上游更新更现实。

## 四、前置环节：把 Windows 主机接进来

上面讲的都是"连上之后"的事。但在真实环境里，第一步就可能卡住： **Windows 主机默认不开 SSH。**

Linux 服务器一般都有 sshd，Windows 没有。而应急场景下，你通常没法要求业务方停机装软件、重启、改系统配置。

这就是配套工具 [HostTraceAI-WindowsSSHKit](https://github.com/hattrick-V/HostTraceAI-WindowsSSHKit) 要解决的问题。

### 4.1 现象：端口开着，连接就断

一个很典型的失败现场：

```plain
Connection reset by 192.168.1.100 port 22
```

但逐项检查下来都是"正常"的：服务状态 `RUNNING` ，端口是开的， `ssh -vvv` 能看到 banner 正常返回。然后连接在客户端发出 `KEXINIT` 之后被重置。

服务健康、端口开放、协议握手走两步就死——常规健康检查完全看不出问题。

### 4.2 根因：OpenSSH 9.8 的进程拆分

OpenSSH 9.8 把 `sshd` 拆成了两个进程：

-   `sshd.exe` ：监听进程
-   `sshd-session.exe` ：每连接派生的会话进程

在老版本 Windows 上， `sshd.exe` 能正常启动，所以服务看起来健康、banner 也能正常返回；但会话子进程在调用该系统中并不存在的 API 时被杀掉。表现就是"端口开着，协议走两步就死"。

上游文档已明确说明 9.8/10.x 需要 Windows 10 1809+ / Server 2019+。

还有一个不那么明显、但症状完全相同的原因： **程序目录必须只有 SYSTEM 和 Administrators 可写**。从桌面、下载目录或 U 盘直接运行 OpenSSH，会触发一模一样的 reset。

### 4.3 解法：版本阶梯 + 真实密钥交换自检

WindowsSSHKit 打包了三个 **未经修改的** 上游构建：

|     |     |     |     |
| --- | --- | --- | --- |   
| 版本  | 上游 release | 架构  | 适用系统 |
| 7.7.2.0 | v7.7.2.0p1-Beta | 单进程 sshd | Windows 7 / 2008 R2 / 2012 / 2012 R2 / 2016 |
| 8.9.1.0 | v8.9.1.0p1-Beta | 过渡版本 | 兜底  |
| 10.0.0.0 | 10.0.0.0p2-Preview | 拆分式 | Windows 10 1809+ / Server 2019+ |

启用脚本 `1-启用SSH.bat` 的执行逻辑：

1.  读取 OS build number，生成版本阶梯——新系统从新到旧，老系统从旧到新；
2.  复制到 `C:\Program Files\OpenSSH-Win64` ，按 **SID** 收紧目录 ACL（SYSTEM 与 Administrators 可写，Authenticated Users 只读加执行），中英文系统结果一致；
3.  生成 host key、写 `sshd_config` 、安装 sshd 服务；
4.  **通过 ssh-keyscan 在回环接口上走一次真实的密钥交换自检**；
5.  失败则自动回退到下一个版本重试；
6.  三个版本全部失败，运行 `sshd -ddd` 并打印调试输出；
7.  开放防火墙端口（默认 22）。

第 4 步是设计上最值得说的部分。

常规健康检查看的是"端口是否开放"或"服务是否 RUNNING"，而在这个故障下这两个指标 **都是正常的**——这正是它难以排查的原因。只有真正完成一次密钥交换、拿回主机公钥，才能证明会话进程可以启动：

```plain
bin\7.7.2.0\ssh-keyscan.exe -T 8 -t rsa,ed25519 127.0.0.1
```

-   返回 `127.0.0.1 ssh-ed25519 AAAA...` → 服务健康
-   只返回 `# 127.0.0.1:22 SSH-2.0-...` → 服务活着但会话进程起不来，正是 reset 故障

这个判据可以直接用在日常排查里，不依赖这个工具。

### 4.4 完整回滚

`2-停止卸载.bat` 负责还原，且区分两种情况：

-   如果 sshd 是本工具安装的 → 停止服务、删除防火墙规则、卸载服务、删除程序目录
-   如果机器原本就有自己的 sshd → 只从备份恢复原 `sshd_config` ， **不动原有服务**

### 4.5 授权前提

这个工具会启用内置 `administrator` 账户、设置其密码、开放防火墙端口。它只应用于 **你拥有或获得书面授权调查** 的主机，且调查结束应立即运行卸载脚本。

工具提供了干跑模式，建议在新机器上首次使用前先执行，它会在不安装服务、不修改系统的前提下把真实子流程走一遍：

```plain
set SSH_TRACE_TEST=1
1-启用SSH.bat
```

## 五、串联起来的一次调查

把两个部分接起来，一次 Windows 主机木马溯源的流程大致是：

1.  **接入**：在目标 Windows 主机上运行 `1-启用SSH.bat` 。脚本自动挑选可用的 OpenSSH 版本并通过真实密钥交换自检，开放端口。
2.  **连接**：在 HostTraceAI 中添加该主机为溯源目标，平台通过 SSH/MCP 建立连接。
3.  **调查**：选择"病毒木马溯源专家"角色发起对话。AI 依据已获取的证据动态决定下一步——查进程、查外联、提取可疑文件哈希、比对持久化项，而不是按固定脚本走。
4.  **发现归集**：可疑进程、外联地址、样本哈希按主机归集为发现项，证据文件落盘，元数据与哈希入库。
5.  **处置**：若需终止进程或阻断 C2，动作进入审批流程，同时记录回滚方式。人工确认后执行。
6.  **收尾**：生成调查时间线与报告；在目标主机上运行 `2-停止卸载.bat` ，还原所有改动。

## 六、与上游 CyberStrikeAI 的关系

HostTraceAI 的架构与工程骨架衍生自 [CyberStrikeAI](https://github.com/AIPentest/CyberStrikeAI) （Copyright 2025 Ed1s0nZ，Apache License 2.0），沿用同一许可，保留原始版权声明，并在 `NOTICE` 中说明具体改动。

复用的骨架与收窄后的差异：

|     |     |     |
| --- | --- | --- |  
| 维度  | CyberStrikeAI（上游） | HostTraceAI |
| 产品域 | 通用 AI 渗透测试 | 主机溯源与事件响应 |
| 内置工具 | 大而全的渗透工具集 | 收敛为经审核的主机取证工具：binwalk、exiftool、foremost、strings、exec |
| 角色设计 | 渗透角色 | 病毒木马溯源专家、WebShell 后门溯源专家 |
| 处置动作 | —   | 审批门控 + 回滚路径 |
| 复用骨架 | —   | Go 服务端结构、MCP 能力中心、Markdown Skill 加载、RBAC / 审批 / 审计、Web 控制台结构 |

需要说明的是，两者的产品目标不同：上游是攻击面视角的工具平台，HostTraceAI 是防守视角的调查工作台。如果你需要的是渗透测试能力，应该直接使用上游项目。

## 七、部署与试用

需要 Go 1.25 或更高版本。

```bash
git clone https://github.com/hattrick-V/HostTraceAI.git
cd HostTraceAI
cp config.example.yaml config.yaml
go run ./cmd/server --config config.yaml --http --port 19088
```

打开 `http://127.0.0.1:19088/` 。首次启动会创建 `admin` 账号并打印一次性随机强口令， **只显示一次**，请立即保存。

首次使用必须配置 AI 通道（ `config.example.yaml` 里是占位值，填好之前对话不可用）：

**设置 → 基础设置 → AI 通道**，填写 Base URL、API Key、模型名，点"测试连接"确认后保存。兼容 OpenAI 协议的服务均可直接使用（OpenAI、DeepSeek、通义千问、智谱、本地 vLLM/Ollama 等）。

两点容易误解的地方：

-   **Python 不是必需项**。平台本体（Go 服务、Web 控制台、内置取证工具）在没有 Python 的环境下可完整运行， `requirements.txt` 只服务于 `mcp-servers/` 下的可选辅助脚本。
-   `mcp.enabled: false` **是刻意的默认值**。内置工具不依赖 HTTP MCP 服务，开箱即用不缺能力；需要连接远程主机或接入外部 MCP 时再打开。

内置取证工具位于 `tools/` （binwalk、exiftool、foremost、strings、exec），需要相应命令行程序已安装在目标主机上。

## 八、小结

把 AI 引入主机应急响应，能力本身不是最难的部分， **可控性** 才是。HostTraceAI 的做法是把"AI 能做什么"显式分级、把"改了主机什么"记录回滚方式、把原始证据与关联关系分开存储。这些设计不炫技，但决定了安全团队敢不敢真的用起来。

配套的 WindowsSSHKit 解决的是更靠前的一步——让默认不开 SSH 的 Windows 主机能被安全地接进来，并且调查结束后不留痕迹。它处理的那个"端口开着但连接就断"的故障，根因在 OpenSSH 9.8 的进程拆分，而判据用一条 `ssh-keyscan` 就能验证，这个技巧本身也值得单独记住。

**最后需要强调**：本项目及配套工具仅用于获得明确授权的主机调查与事件响应。请勿在未授权的系统上使用。
