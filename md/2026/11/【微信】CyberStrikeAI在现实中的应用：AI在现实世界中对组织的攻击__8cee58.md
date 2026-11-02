---
title: 【微信】CyberStrikeAI在现实中的应用：AI在现实世界中对组织的攻击
source: https://mp.weixin.qq.com/s/MPaacfp8wfIHy-q-tJUJQg
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T17:09:22+08:00
trace_id: ef25e042-d08c-4d38-98ac-02d005682de0
content_hash: 83b60fde117eb0727f278dc5e53bc096faa52291b97fd2f01215e91908ad5e1d
status: synced
tags:
  - 微信
  - 恶意样本
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 卡巴斯基披露首批公开的 LLM 编排在野攻击：CyberStrikeAI 平台主导后渗透，非洲与拉美教育机构 3–4 天内域管沦陷，但检测无需全新规则。
ai_summary_style: key-points
images_status:
  total: 63
  succeeded: 63
  failed_urls: []
notion_page_id: 40c75244-d011-81ef-8834-cd513ff3c6d3
ioc:
  cves: []
  cwes: []
  hashes:
    - 09e1da2afa1216ecc55648ec8e122d2a
    - 0bbd08af95f877f1d568b03de2eb76b4
    - 2770562d104391b92b42671c270079bb
    - 29efd64dd3c7fe1e2b022b7ad73a1ba5
    - 74f57b3e897a4960dcdd5b7e8a54f9df
    - 805b9e4ae74c903787416800999b8418
    - d726a8b4886c636f76ca6d30ef6a6ff4
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 卡巴斯基披露首批公开的 LLM 编排在野攻击：CyberStrikeAI 平台主导后渗透，非洲与拉美教育机构 3–4 天内域管沦陷，但检测无需全新规则。
> 
> - **速度对比：** 人工阶段花近 24 小时经失陷 SQL Server 踩点后静默两周；agent 部署后 2 分钟完成持久化与本地侦察、5 小时完成域内侦察，从植入到域管沦陷仅 3–4 天。
> - **架构设计：** CyberStrikeAI 是 Go 编写的开源平台，LLM 编排器与 C2 服务端同处一个 server 进程，"智能"全在控制端；植入体无 AI 能力，仅做轮询 C2、执行 shell 命令、读写文件三件事。
> - **决策分层：** 操作员用概括语言下达任务，模型决定向哪台主机发什么命令、按什么顺序发；战略规划仍归人（HITL 机制可人工批准），战术执行交给模型。
> - **归因痕迹：** 自签名 TLS 证书（issuer/subject 含框架名、not_before 记录启动时刻）、go 构建元数据、每个 C2 唯一的 X-Implant-Token 头可串样本；脚本中文注释与 UTC+8 时区重启规律指向中文使用者关联，但两组样本间无法合并归因。
> - **检测结论：** 攻击用的仍是 Kerberoasting、LSASS 转储、DCSync、Golden Ticket、WMI 横向等经典手法，AI 带来的差别主要是速度与门槛，既有 EDR/NDR/SIEM 相关性与行为规则即可覆盖全部攻击阶段。

**网络与信息安全参考** *2026年11月2日 16:35*

安全情报译介2026.11.02

LLM 坐在 C2 后面 · 在野实录

卡巴斯基公开一起由 LLM 编排器主导后渗透的入侵：目标为非洲与拉美多国的教育机构，从植入体落地到域管沦陷只用 3–4 天

DOODLE

智能留在服务端，主机上跑的还是旧手法

威胁情报框架分析

![原文封面：一只由数据流与闪电构成的手砸向校舍，隐喻 AI 驱动的攻击精准命中教育机构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4ed09941dbf9cccd.jpg)

图｜原文封面：一只由数据流与闪电构成的手砸向校舍，隐喻 AI 驱动的攻击精准命中教育机构

导语

INTRO

卡巴斯基威胁情报（CTI）团队在主动威胁监测中发现一起由 AI 控制的 C2 agent 主导的攻击活动，已确认的受害者为非洲与拉美多个国家的教育机构。按卡巴斯基的说法，这是目前最早一批公开披露的“LLM 参与在野入侵”案例之一。

变化不在工具，而在分工。LLM 以前主要出现在准备阶段——写钓鱼邮件、调试代码、找漏洞。这一次，它被放进了攻击链路的内核：载荷执行、主机持久化、信息收集、横向移动、数据收集与外传，每一环都有它参与，尤其是后渗透这个过去必须由有经验的操盘手手工完成的阶段。

## LLM主导后渗透

更关键的结构性变化是：植入体不再是“执行操作员命令的简单工具”。决策被拆成两层——操作员用概括的语言描述任务，模型决定怎么落地：往哪台主机发什么命令、以什么顺序发。战略规划仍属于人，技术路径的选择交给了模型，植入体只负责执行模型的决定。

关于本文

SOURCE

本文译自卡巴斯基 Securelist 2026 年 11 月 2 日发布的《CyberStrikeAI in the wild: the use of AI in real-world attacks on organizations》。原文按证据链顺序给出 64 张取证截图，本文保持同一顺序逐图对应；命令、路径、哈希、域名一律照原文记录。

01

PART

## 攻击时间线复盘

时间线：人工踩点一整天，机器接管后按分钟计

TIMELINE

先看一起具体事件的时间线。第一阶段是常规打法：操作员通过一台失陷的 SQL Server（版本 16.0.1000）进入受害者基础设施，随后收集主机基本信息、投放工具、做网络侦察。这一整段花了将近一天，之后静默两周。

![攻击时间线：灰色为人工阶段，绿色为 agent 接手后各阶段的耗时标记](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73a23862a895ecb0.jpg)

图｜攻击时间线：灰色为人工阶段，绿色为 agent 接手后各阶段的耗时标记

第二阶段性质完全不同。第一步是部署 CyberStrikeAI 的 C2 agent，它从服务端的 LLM 编排器接收命令。此后 agent 的每个动作都可以按分钟记账：2 分钟内完成持久化建立与本地侦察；接下来 5 小时做完域内侦察；短暂停顿数天后进入收尾——通过 SMB 与 WMI 横向移动、在主机上批量转储凭据、导出数据库，整段操作不超过一小时。

**两段放在一起看，对比很刺眼。** 人工阶段用 24 小时铺路，机器接手后，同样的活按分钟和小时结算。

## CyberStrikeAI架构解剖

02

PART

框架解剖：智能层留在服务端，agent 只是一双手

ANATOMY

CyberStrikeAI 是一个用 Go 编写的开源模块化渗透测试自动化平台。它的关键设计是把 LLM 攻击编排 与 内置 C2 服务端和 agent（beacon） 收进同一个 server 进程。

整个“智能”层被隔离在控制端。调用侦察与利用工具、管理 webshell 连接、给 agent 派任务、读取执行结果，这些 C2 功能都以 MCP 工具 的形式暴露给模型。植入体则是标准的 C2 agent，没有任何 AI 能力：没有 API key，不访问任何 AI 服务接口，也没有自主逻辑。它只做三件事——通过 HTTP/S、TCP 或 WebSocket 周期性地向 listener 轮询，执行 shell 命令，读写文件系统。

对受害者来说，这些行为看起来就是一次普通的远程控制会话，只不过在服务端排队派活的是 LLM 编排器，而不是活人。模型影响的是“怎么决策”，而不是“命令怎么送达主机”。

框架本身公开可得，但具体的部署实例仍能与特定攻击者或行动挂钩。归因与检测可以依靠三类痕迹：

控制面板 / 自签名 TLS 证书

进程启动时生成自签名证书，签发者与主体字段里带着框架名称。证书在每次启动时于内存中重新生成，因此 not_before 字段实际记录了进程启动时刻。与 Cobalt Strike 类似，可以从扫描历史重建它的重启时间线。

![控制面板的自签名 TLS 证书：issuer 与 subject 字段直接暴露框架名称，not\_before 可反推进程启动时刻](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f16435091b3efd8c.png)

图｜控制面板的自签名 TLS 证书：issuer 与 subject 字段直接暴露框架名称，not_before 可反推进程启动时刻

植入体 / 构建元数据

go version -m 输出的构建元数据里包含主包路径，其中带有指向内置生成器的信息——一个带构建标识符的临时目录。所有载荷的这段路径完全一致，是可靠的指纹。build info 中的版本控制元数据还可以用来做样本间比对。

认证 / X-Implant-Token 头

植入体与服务端通信时在 HTTP 请求里带一个固定值的 X-Implant-Token 头。该 token 每个 C2 服务器唯一，构建阶段被写入载荷，因此既是网络侧指标，也是判断样本是否同源的依据。

![植入体向服务端发送的 HTTP 头参数，X-Implant-Token 在构建阶段被写死进载荷](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b51e11d3472b1a3b.png)

图｜植入体向服务端发送的 HTTP 头参数，X-Implant-Token 在构建阶段被写死进载荷

这里有个容易误判的点：植入体版本并不反映服务端版本。操作员可以持续更新服务端组件，listener 配置与密钥在更新中保留，而植入体在主机上跑上几个月。在我们发现的几起事件中，整个事件周期内只出现了一个 agent 版本。这种情况下，样本的构建日期只能说明 CyberStrikeAI 基础设施最早可能的部署时间，仍不足以估计失陷持续了多久。

03

PART

入口与提权：命令都从 sqlservr.exe 里出来

EXECUTION

在调查的这起行动中，受害系统上最早的恶意命令都源自 sqlservr.exe 进程。这既指向初始访问向量，也说明了攻击者获得代码执行能力时所处的上下文。需要区分的是：标记为“agent 安装之前”的那些命令，是操作员在这个进程上下文里手工执行的，此时还不存在自动化 agent 的活动。

在往机器上放 agent 之前，攻击者先用 PowerShell 脚本检查它是否已经存在。从这段脚本可以反推出默认投放路径：C:\\Windows\\Temp\\、C:\\Windows\\、C:\\ProgramData\\、C:\\Temp。同时 agent 的文件名可以伪装成合法系统进程——下图这个样本伪装的是 svchost.exe（实际文件名 svchosts.exe）。

![检查系统中是否已存在 CyberStrikeAI agent 的脚本，顺带暴露了四个默认投放路径](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d0c1db89a3db51c0.png)

图｜检查系统中是否已存在 CyberStrikeAI agent 的脚本，顺带暴露了四个默认投放路径

![agent 的投放与执行过程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d402fb4a07dd6020.png)

图｜agent 的投放与执行过程

和大多数 Windows 平台的 C2 agent 一样，CyberStrikeAI 通过 PowerShell 执行载荷。收到操作员请求后，实际要执行的命令还会再做一次 Base64 编码，以绕过基于关键词的检测。

![编码后的命令：整段以 Base64 形式下发，规避关键词匹配](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fb5b5d0418b9c29d.png)

图｜编码后的命令：整段以 Base64 形式下发，规避关键词匹配

![同一段命令解码后的实际内容](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd96bc45f23b323b.png)

图｜同一段命令解码后的实际内容

当手上握有管理员权限（例如域管理员账号）时，agent 在远程主机上通常不直接执行命令，而是创建计划任务，让恶意载荷以 SYSTEM 权限运行：

![通过 schtasks 在远程主机创建计划任务，使载荷以 SYSTEM 身份运行](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5aad61a497615ff6.png)

图｜通过 schtasks 在远程主机创建计划任务，使载荷以 SYSTEM 身份运行

另一条不依赖 schtasks 工具的路径，是通过 Schedule.Service COM 对象创建任务：

![通过 Schedule.Service COM 对象创建计划任务的写法，绕开 schtasks.exe](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e7687e25ecc0e4e8.png)

图｜通过 Schedule.Service COM 对象创建计划任务的写法，绕开 schtasks.exe

上例中的载荷 p1.ps1 是一个反向 shell，连回 185.186.245\[.\]144:5501：

![p1.ps1 反向 shell 的代码，连接地址为 185.186.245\[.\]144:5501](https://mmbiz.qpic.cn/mmbiz_png/Oy7lbA08GzaReHMSLbTzwIpQrNtMzSdrVwe10PHL9ZTtrsWOUFJxWicC2ticulibf6h2qWx2ibnN6sjCH546wZlLzTQh5PdjVHpbHeGdlWWBMbY/640?wx_fmt=png&from=appmsg#imgIndex=10)

图｜p1.ps1 反向 shell 的代码，连接地址为 185.186.245\[.\]144:5501

p1.ps1 及同类脚本通过共享的网络管理文件夹和 WMI 协议在网络内扩散，具体手法见横向移动一节。

04

PART

## 隐蔽与持久化

隐蔽与持久化：把载荷切成碎片，再留三条自启动路径

STEALTH & PERSISTENCE

除了把命令 Base64 编码、混淆 SQL 与 LDAP 查询（分别在数据收集、信息收集两节展开），攻击者还把恶意载荷拆成多个文件下发。值得注意的是，这种传输方式在 agent 装上之前就已经在用——也就是本该由人介入的阶段——但这些脚本明显带着 LLM 生成的痕迹。

下面是把几段脚本依次写入 d3.b64 的记录。

![多段脚本被依次追加写入 d3.b64，载荷被切成碎片分批落地](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/958698c2f9b5ed8b.png)

图｜多段脚本被依次追加写入 d3.b64，载荷被切成碎片分批落地

随后用 certutil 解码这个文件并执行：

![用 certutil 对拼装后的文件进行解码的命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a6cf32d79c6e0508.png)

图｜用 certutil 对拼装后的文件进行解码的命令

![解码后的执行步骤，拼装结果被交给 PowerShell 运行](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/65b8feb3916643e8.png)

图｜解码后的执行步骤，拼装结果被交给 PowerShell 运行

拼装、解码完成后，脚本内容如下：

![还原后的脚本：从 C:\\ProgramData\\dsn\_line.txt 中解密 DPAPI 机密](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af2a0e0a222ecd81.png)

还 原 后 的 脚 本 ： 从 C:\\ProgramData \\dsn l i n e.t x t 中 解 密 D P A P I 机 密

图｜还原后的脚本：从 C:\\ProgramData\\dsn_line.txt 中解密 DPAPI 机密

这个脚本是一个工具，用于从 C:\\ProgramData\\dsn_line.txt 解密 DPAPI 机密。而 dsn_line.txt 的内容由下面这条命令写入：它在 SQL Server Reporting Services 的配置文件 rsreportserver.config 中搜索含连接设置的 DSN 字符串，并把内容复制到 dsn_line.txt。

![从 rsreportserver.config 提取 DSN 连接串并写入 dsn\_line.txt 的命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca5a163cec844dc1.png)

图｜从 rsreportserver.config 提取 DSN 连接串并写入 dsn_line.txt 的命令

还有一点值得记下：上述投递并执行的脚本中，有一部分带着 中文注释（下图中以 ## 标注的研究者注释）。

![脚本中的中文注释（原文以 ## 标出），是后续归因时的语言线索](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/115965b845875f15.png)

图｜脚本中的中文注释（原文以 ## 标出），是后续归因时的语言线索

持久化：Windows 两条，Linux 两条

agent 成功落地后，第一步是在目标系统上建立持久化。它创建一个名为 SystemUpdate 的计划任务，把植入体路径写为要执行的动作：

![名为 SystemUpdate 的计划任务，动作指向植入体路径](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1742b51aa1139d14.png)

图｜名为 SystemUpdate 的计划任务，动作指向植入体路径

分析框架源码还发现了另一种 Windows 持久化方式：向注册表 HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run 添加键值，键名与任务名一致（SystemUpdate）。

![注册表 Run 键的写入方式，键名与计划任务名保持一致的 SystemUpdate](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2813c9771507b84.png)

图｜注册表 Run 键的写入方式，键名与计划任务名保持一致的 SystemUpdate

Linux 上同样有两种：往用户 crontab 里加 @reboot <path_to_beacon> &（开机启动），或往 ~/.bashrc 里加 (nohup <path_to_beacon> &>/dev/null &)（打开交互式 bash 时启动）。

![Linux 侧的 crontab 与 .bashrc 两种自启动写法](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b59d2b80fef610ee.png)

图｜Linux 侧的 crontab 与.bashrc 两种自启动写法

具体选哪种持久化方式，交给接入 CyberStrikeAI 的 LLM 判断。但因为有 人在回路（HITL） 机制，操作员仍掌握完整控制权：模型生成的命令在执行前可能需要人工批准或修正。

05

PART

侦察：两分钟摸清一台机器，五小时画完一张网

DISCOVERY

本地侦察

在往失陷主机装 agent 之前，攻击者先用手工方式收集基础系统信息，命令集相当常规：

![手工执行的基础系统信息收集命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/415641de3ac4bfc8.png)

图｜手工执行的基础系统信息收集命令

攻击者还手工确认了主机能否访问互联网，并借助中文服务 dnslog\[.\]cn 获取失陷机器的出口 IP。手法是：先在服务上生成一个随机三级域名，再在失陷机器上尝试解析它。

![用 dnslog\[.\]cn 生成的随机三级域名探测外网连通性](https://mmbiz.qpic.cn/mmbiz_png/Oy7lbA08GzYe3ALyWARE7ric6YoBPOh2aiaK6tjQOXjFInWnY2ic8FjrpbVlNTDsxGibjic8CvtYKLJtSDRQAV2rz6HkuBib8C4ZAomL480Dpw0ibQ/640?wx_fmt=png&from=appmsg#imgIndex=21)

图｜用 dnslog\[.\]cn 生成的随机三级域名探测外网连通性

如果机器能上外网，解析就会成功，攻击者在服务页面上读到失陷设备的出口 IP。

![解析成功后，在 dnslog\[.\]cn 页面上读到失陷主机的出口 IP](https://mmbiz.qpic.cn/sz_mmbiz_png/Oy7lbA08Gzaovx9nKnG6nVLVtWBaicdOx0c3LuDJEDUHrSpP6sve7NJGRSBwLtx4icSmPGGPJ1icb7BTzndboK7Ia7ic5CdT8LjYs9ay22omN9E/640?wx_fmt=png&from=appmsg#imgIndex=22)

图｜解析成功后，在 dnslog\[.\]cn 页面上读到失陷主机的出口 IP

为后续提权铺路，agent 会生成一段更复杂的脚本，用于寻找可行路径——攻陷 SCCM，或利用 msiexec 的 AlwaysInstallElevated 键：

![针对 SCCM 与 msiexec（AlwaysInstallElevated）的提权路径探测脚本](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b10f2e5fe4e02794.png)

图｜针对 SCCM 与 msiexec（AlwaysInstallElevated）的提权路径探测脚本

此外，为在本地找提权机会，agent 会执行脚本清点 以域账号运行的服务，以及 以 SYSTEM 账号运行的任务：

![清点以域账号运行的服务与以 SYSTEM 运行的计划任务，用于定位本地提权机会](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1f9d8daaedf7d5d7.png)

图｜清点以域账号运行的服务与以 SYSTEM 运行的计划任务，用于定位本地提权机会

活动期间，攻击者会周期性检查 Microsoft Defender 是否已经产生告警：

![定期查询 Defender 检测记录的 PowerShell 代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/08b540adea4d43f6.png)

图｜定期查询 Defender 检测记录的 PowerShell 代码

远程侦察

摸清失陷主机后，攻击者转向网络内部。在攻击的准备阶段，他们用 net.exe 手工收集远程主机信息：

![用 net.exe 手工收集远程主机信息](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3dc53e381d5d4115.png)

图｜用 net.exe 手工收集远程主机信息

进入主阶段后，agent 改用 PowerShell 的内置能力探测可访问主机，不再依赖 nmap、fscan 这类额外工具：

![用 PowerShell 内置能力做主机存活与可达性探测，无需外部扫描工具](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d357bdf5ba0acfb0.png)

图｜用 PowerShell 内置能力做主机存活与可达性探测，无需外部扫描工具

配合针对 Active Directory 对象的 LDAP 查询，网络拓扑就画出来了：

![针对 AD 对象的 LDAP 查询，用于拼出网络结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d3968e9a095f72b7.png)

图｜针对 AD 对象的 LDAP 查询，用于拼出网络结构

远程主机上是否已装有 agent，则用 WMI 确认：

![通过 WMI 检查远程主机上是否已部署 agent](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/15a8f042043e2161.png)

图｜通过 WMI 检查远程主机上是否已部署 agent

域内侦察

下一步是收集受害者域的信息。在 agent 安装之前，攻击者用的是系统自带工具：

![用系统自带命令收集域信息](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0da1d8ee68f83018.png)

图｜用系统自带命令收集域信息

之后改由 CyberStrikeAI 植入体，通过生成的 PowerShell 脚本完成：

![由 agent 生成的 PowerShell 域侦察脚本](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c59f390ce52d0868.png)

图｜由 agent 生成的 PowerShell 域侦察脚本

除基础域信息，agent 还执行 LDAP 查询，为 Kerberoasting 与 AS-REP Roasting 收集素材：

![为 Kerberoasting 与 AS-REP Roasting 准备的 LDAP 查询](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/47bf4974d09d96c1.png)

图｜为 Kerberoasting 与 AS-REP Roasting 准备的 LDAP 查询

最后，agent 会检查域内是否存在 LAPS 与 Microsoft Azure：

![域内 LAPS 部署情况检查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bed0d4939c4e3f1e.png)

图｜域内 LAPS 部署情况检查

![域内 Microsoft Azure 使用情况检查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/09b09cb36f0a9cbc.png)

图｜域内 Microsoft Azure 使用情况检查

为了判断基础设施里是否有 Azure 使用痕迹，攻击者还会在用户主目录下搜索.azcopy 目录——它由 AzCopy（Microsoft Azure Storage Copy）工具创建：

![在用户主目录搜索 .azcopy 目录，判断是否有 Azure 存储操作痕迹](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf14005d73304e48.png)

图｜在用户主目录搜索.azcopy 目录，判断是否有 Azure 存储操作痕迹

06

PART

凭据、横向与 C2：老工具，新节奏

CREDENTIALS & MOVEMENT

凭据获取

完成侦察与网络测绘后，攻击者进入下一阶段——转储凭据。agent 用的是一套经典的 LOLBIN 加知名第三方工具组合。

先用 reg.exe 导出含凭据的注册表配置单元：

![用 reg.exe 导出含凭据的注册表配置单元](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b16178f075e11e0.png)

图｜用 reg.exe 导出含凭据的注册表配置单元

再用 comsvcs.dll 的 MiniDump 函数转储 lsass.exe 进程。这里有个细节：命令里用目标进程的 PID 而不是进程名，让基于命令行的静态检测更难命中。

![用 comsvcs.dll 的 MiniDump 转储 lsass.exe，参数用 PID 而非进程名](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd5797e416009ac3.png)

图｜用 comsvcs.dll 的 MiniDump 转储 lsass.exe，参数用 PID 而非进程名

拿到高权限域账号（具体是内置域管理员）之后，攻击者还通过 agent、用改名后的 mimikatz 执行 DCSync 与 Golden Ticket 攻击：

![改名 mimikatz 执行的 DCSync 与 Golden Ticket 攻击](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67fc3bcd35168d42.png)

图｜改名 mimikatz 执行的 DCSync 与 Golden Ticket 攻击

横向移动

用失陷账号在网络内扩散时，攻击者使用了 Impacket 工具集，具体是 WMIExec——从它特征明显的命令行可以认出来：

![Impacket WMIExec 的特征命令行](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/66934ebe83f10436.png)

图｜Impacket WMIExec 的特征命令行

agent 装好之后，则更偏好系统自带机制，例如共享网络文件夹。

![通过共享网络文件夹投放与执行载荷](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5147a619a7107057.png)

图｜通过共享网络文件夹投放与执行载荷

![共享目录操作的另一处记录，脚本与工具经由管理共享扩散](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d87140e17512cad2.png)

图｜共享目录操作的另一处记录，脚本与工具经由管理共享扩散

另一种远程命令执行方式是 WMI 协议。agent 用它分发前面提到的 p1.ps1 反向 shell，前提是手上有对目标主机具备本地管理员权限的失陷账号：

![通过 WMI 分发 p1.ps1 反向 shell，使用具备本地管理员权限的失陷账号](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf001cc404c558d5.png)

图｜通过 WMI 分发 p1.ps1 反向 shell，使用具备本地管理员权限的失陷账号

第二条 WMI 横向路径用的是 Invoke-CimMethod 命令：

![用 Invoke-CimMethod 实现远程命令执行](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/93381f0cc380ef3b.png)

图｜用 Invoke-CimMethod 实现远程命令执行

命令与控制

把工具（恶意脚本、mimikatz、agent 本体）送到感染链起始节点时，攻击者用的是系统自带工具：

![用系统自带工具把工具与脚本投递到起始节点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e905c9140fe69db.png)

图｜用系统自带工具把工具与脚本投递到起始节点

![把工具投递到起始节点的另一段命令记录](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/300f5c47d8a19ffb.png)

图｜把工具投递到起始节点的另一段命令记录

agent 装好后，会先检查 C2 服务器端口的可用性。这一环的实现方式几乎没有限制，取决于接入服务端的 LLM agent 有多“会想”：

![agent 检查 C2 服务器端口可用性的实现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e7bcd3375612bcd.png)

图｜agent 检查 C2 服务器端口可用性的实现

下载额外工具时，植入体同样复用系统内置程序（LOLBIN）。工具可以托管在攻击者自己的服务器上，也可以直接从 GitHub 拉取：

![借助系统内置程序从远端或 GitHub 下载额外工具](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/640bd6043ad67e3a.png)

图｜借助系统内置程序从远端或 GitHub 下载额外工具

07

PART

收尾：数据库导出、文件收集与屏幕截图

COLLECTION & EXFILTRATION

数据收集阶段值得单独看。它展示了 LLM 编排的另一种能力：按任务现场生成 SQL 与 LDAP 查询。

在其中一起事件里，攻击者把 CyberStrikeAI 植入体部署在教育机构的 SQL Server 上，通过 PowerShell 从数据库收集信息。下面是 agent 执行的一条命令：

![agent 通过 PowerShell 从数据库取数的命令（编码形态）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/878138ed6afcb78c.png)

图｜agent 通过 PowerShell 从数据库取数的命令（编码形态）

带注释的规范化视图：

![规范化后的脚本与注释，把编码命令还原成可读形态](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ddcaf1e99b5e8dc.png)

图｜规范化后的脚本与注释，把编码命令还原成可读形态

在访问数据之前，agent 先检查了它连数据库所用账号的权限：

![连接数据库所用账号的权限检查命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e6d99658f4b54b0e.png)

图｜连接数据库所用账号的权限检查命令

解码之后，检查语句是这样的：

![解码后的权限检查语句](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7b0cf60a2b8c6041.png)

图｜解码后的权限检查语句

在网络资源上，文件收集之前会先做一次 递归目录扫描，筛出值得拿的文件。

![递归目录扫描，用于定位需要收集的文件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b96b12bc52441194.png)

图｜递归目录扫描，用于定位需要收集的文件

植入体内置了文件系统接口，支持直接上传与下载。文件通过主加密通道（HTTP 或 TCP）与 C2 服务器直接传输，数据本身以 Base64 编码，封装进 agent 的标准 JSON 响应里。

另一个内置能力是截屏。和其他动作一样，植入体不会自行发起：截屏指令由 LLM 编排器下达，agent 只负责执行，并通过同一控制通道回传结果。

Windows 上的截屏命令：

![Windows 版截屏命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cb9a7441e55db0a3.png)

图｜Windows 版截屏命令

Linux 版本：

![Linux 版截屏命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aa6d04a4387bda50.png)

图｜Linux 版截屏命令

**在我们检测到的事件中，数据收集就是攻击的终点。** 链路到此为止，之后没有再观察到进一步活动。

08

PART

归因：构建指纹能串起样本，串不起人

ATTRIBUTION

这起行动里用于归因的核心痕迹是植入体的构建元数据。攻击者是在项目的 Git 克隆 里构建恶意载荷的，Go 编译器因此把版本控制信息写进了二进制——提交哈希、提交时间，以及 vcs.modified=true 标记（相当于 +dirty 后缀），说明工作副本存在未提交的本地修改。这几个字段组合起来，构成某次构建的唯一指纹。

按这个指纹，样本可以分成两个互不相关的小组，每组内 Windows 与 Linux 植入体的构建元数据完全一致。一致意味着：同一组里的两个载荷出自同一份项目工作副本。

![Windows 与 Linux 植入体样本的构建元数据完全一致，说明二者出自同一构建环境](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9deec49735e99d59.png)

图｜Windows 与 Linux 植入体样本的构建元数据完全一致，说明二者出自同一构建环境

但两个组之间没有交集。它们不共享 C2 基础设施，控制服务器上部署的 CyberStrikeAI 版本也不同。也就是说，构建元数据能在组内可靠地把样本串起来，却不足以把两个组合并。

![两台控制服务器上 CyberStrikeAI 版本的差异](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c965293966536430.png)

图｜两台控制服务器上 CyberStrikeAI 版本的差异

现有数据既不足以把活动归到任何已知攻击团伙，也无法断定两起行动背后是同一个操作员。有两个因素在挡路。第一是工具的开放性：CyberStrikeAI 公开可得，不同操作员完全可能各自部署、在相似条件下构建载荷。第二是命令由模型生成：属于某个操作员的“签名”很大程度上不是人塑造的，而是 LLM 塑造的。这既增加了命令的多样性（同一条命令生成多次可能长得不一样），也抹掉了个体特征，让行为指标的归因价值下降。

不过，攻击者脚本里的中文注释、以及对中文服务的使用，仍然指向与中文使用者有关联。分析师还注意到控制服务器的重启时间规律：自签名 TLS 证书在每次进程启动时重新生成，not_before 字段因此记录了重启时刻，而这些重启大多落在 UTC+8 时区的办公时间。工具本身的来源也间接指向同一方向：CyberStrikeAI 由中文网络安全社区开发，在该社区内广为人知。

09

PART

检测：AI 没有让老规则失效

DETECTION

## 检测与防护规则

看起来，用 AI agent 发起的攻击应该需要一套全新检测规则。确实，要在基础设施内发现装在主机上的 LLM agent，需要针对 agent 的具体特征建立检测逻辑——这类规则可以在 Hunt Hub 里按下面的条件筛出来。

![在 Hunt Hub 中按条件筛选 LLM agent 相关的检测规则](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a6e4f74f586d3089.png)

图｜在 Hunt Hub 中按条件筛选 LLM agent 相关的检测规则

但在这起攻击里，逻辑是另一套。差别出在攻击架构本身：LLM agent 不在企业网络边界内。它在远端通过 C2 agent 行动、编排动作，在基础设施里没有留下任何存在痕迹——没有对本地 LLM 的特定 API 请求，也没有主机资源消耗的异常模式。

这类活动与“有经验的人类操作员”之间的关键差别，很大程度上只有速度。战术、技术、方法论上，AI 用的绝大多数就是同一批工具、实用程序和手法。它不会从零写全新的漏洞利用，而是 把已知方法组合起来，动态适配现场情况，并自行处理工具报错。

既然 AI agent 在网络上的动作与人的动作难以区分，那么 调好的相关性规则与行为分析规则就足够。以下是 Kaspersky Next EDR Expert 检出这条链路的三个例子：

① 远程计划任务执行恶意脚本

需要监控带 /s 参数的 schtasks.exe 进程创建。对应规则：

create_task_on_remote_host_using_standard_tool、scheduled_task_creation_as_system_via_schtasks、scheduled_task_with_powershell_execution。

![EDR Expert 告警：远程创建计划任务并执行 PowerShell 脚本](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a21222d89f4d1fa.png)

图｜EDR Expert 告警：远程创建计划任务并执行 PowerShell 脚本

② 转储 LSASS

本案通过合法工具调用 comsvcs.dll 的 MiniDump 函数取凭据。对应规则：

dumping_memory_with_com_services_dll、suspicious_lsass_memory_access。

![EDR Expert 告警：通过 comsvcs.dll 转储进程内存](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c031563cefaec6d8.png)

图｜EDR Expert 告警：通过 comsvcs.dll 转储进程内存

③ 横向移动

本案通过 WinRM 直接从 PowerShell 发起连接，无需额外网络隧道，属于标准手法。对应规则：

using_powershell_for_remote_execution_via_wmi、winrm_send_command。

![EDR Expert 告警：PowerShell 经 WinRM 远程执行命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/71a503103cdfa2fb.png)

图｜EDR Expert 告警：PowerShell 经 WinRM 远程执行命令

Kaspersky Anti Targeted Attack（KATA）负责在网络流量中发现恶意活动。CyberStrikeAI agent 与 C2 服务器之间的通信不经过 ChatGPT、Claude 这类 AI 平台；agent 的 C2 服务器是攻击者预先搭好的基础设施，与不使用 AI agent 的攻击没有区别。对解密后的流量做 NDR 分析，可以识别出 agent 通信的特征模式，命中后 KATA 给出 Backdoor.CyberStrikeAI.HTTP.C&C 的判定。

![KATA 告警：检出与 C2 服务器的 CyberStrikeAI 通信](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bfd2314e34530b27.png)

图｜KATA 告警：检出与 C2 服务器的 CyberStrikeAI 通信

后渗透活动不只能靠 IDS 发现，也可以用 NAD（网络异常检测）。它会分析全部流量，找出与节点正常行为不符的可疑指标。举例来说，CyberStrikeAI 在域侦察阶段的动作，会被一条名为“Scanning domain records via LDAP queries”的 NDR:NAD 规则命中。

![NDR:NAD 告警：检出通过 LDAP 查询进行的域记录扫描](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac90699a12210630.png)

图｜NDR:NAD 告警：检出通过 LDAP 查询进行的域记录扫描

在 Kaspersky Threat Intelligence Portal 的 Research Graph 里，可以把 C2 地址与攻击者使用的文件之间的关联可视化，也能跟踪与恶意地址通信的新植入体的出现。

![Threat Intelligence Portal 上 Research Graph 的关联可视化](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e3aa17a2ab0c8582.png)

图｜Threat Intelligence Portal 上 Research Graph 的关联可视化

门户上的 Threat Lookup 服务提供另一种判断方式：基于可执行文件代码的归因机制，判定某个恶意文件是否属于 CyberStrikeAI。

![将恶意植入体归因到 CyberStrikeAI 框架的演示](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c85d7aa90089bd0a.png)

图｜将恶意植入体归因到 CyberStrikeAI 框架的演示

Kaspersky SIEM 覆盖 agent 攻击的全部阶段。产品规则库中，针对本文讨论的手法有 100 多条规则，下面列出最关键的一批（R 编号为规则 ID）：

-   从 sqlservr.exe 执行命令 — R300_04_Windows shell started by a web application
    
-   PowerShell 下载并执行载荷 — R110_03_PowerShell code downloaded and executed
    
-   创建 Windows 计划任务 — R099_04_Suspicious arguments when running schtasks.exe / R300_03_Windows shell started by the scheduler
    
-   通过 crontab 或 bashrc 持久化 — R099_06_Suspicious cron job activity / R405_02_UNIX shell configuration modification
    
-   侦察行为聚合 — R224_14_Windows reconnaissance activity / R224_09_System information discovery by running multiple utilities within a short period / R224_04_System information discovery via standard Linux tools
    
-   Kerberoasting 与 AS-REP Roasting — R034_01_Multiple TGS ticket requests / R452_18_AS-REP Roasting
    
-   reg.exe 导出含凭据的注册表 — R230_02_Copying data containing credentials from the Windows registry
    
-   comsvcs.dll 内存转储 — R233_04_Process memory dump via comsvcs.dll / R262_Suspicious access to the LSASS process
    
-   DCSync 与 Golden Ticket — R073_DC Sync attack / R450_41_Golden Ticket Attack / R100_03_Traces of Mimikatz use via cmd
    
-   WMIExec 横向 — R460_08_Lateral movement using WMIexec Impacket / R460_09_Lateral movement using WMIExec and Impacket
    

规则要生效，SIEM 需要接上相应事件源：

-   进程启动（Windows 安全日志 4688、auditd execve）与 PowerShell 命令（4104）
    
-   用户登录（Windows 安全日志 4624、4768、4769）
    
-   各类对象操作（Windows 安全日志 4662、4663、4656；auditd openat）
    
-   共享资源访问（Windows 安全日志 5145）
    

10

PART

## 关键结论

关键结论：变的是速度与门槛，不是手法

TAKEAWAYS

CyberStrikeAI 是一个有说服力的样本，但不是孤例。它显示 C2 框架这一类工具正在发生位移——LLM 编排器不再只是侦察的附加件，而成了后渗透的控制层。如果说 HexStrike AI 一类工具覆盖“找漏洞、打进去”，Sliver、Mythic、Havoc 覆盖“站稳、控住”，那么 CyberStrikeAI 补上了链条的后半段：一个 Go 编写的服务端进程通过 MCP 调用实用程序、处理 webshell 连接、给植入体派任务，模型分析结果并决定下一步。

核心结论是：把 AI 引入攻击链，目前并没有给检测带来本质上的新难题。所有“智能”都留在攻击者一侧，失陷主机上发生的仍是熟悉动作——从 Kerberoasting、AS-REP Roasting 侦察，到 LSASS 转储、DCSync、Golden Ticket。这是一套典型的、文档齐全的域控沦陷手法。这起攻击的新意不在方法，而在执行的速度与门槛：AI 编排降低了操作员的技能要求，但没有把攻击带到防守方未知、无法检测的领域。

时间数据同样说明问题：活动中几个关键阶段（站稳、横向、拿凭据）只花了几小时，整场攻击——从 agent 部署到域管理员沦陷——在 3 到 4 天内完成。

不过，CyberStrikeAI 的架构并不把使用者限制在这个剧本里。同一套机制可以按需拼出更复杂的链路，包括 DPAPI 机密提取、对 SCCM 与 Azure IMDS 的攻击——都在同一批行为体的能力范围内，技能门槛相对较低。随着模型演进，编排的复杂度与实际使用的技术水平之间的差距会收窄，操作员的角色也会从“下任务”逐渐转向“盯住模型的每一步”。

TAKEAWAY

AI 让攻击更快、更省人力，但并没有变得更陌生。防线上的缺口，多半还是那些一直没补齐的老问题。

11

PART

附录：失陷指标（IOC）

INDICATORS

文件类指标

...ioc · file

\# CyberStrikeAI Windows Beacon

D726A8B4886C636F76CA6D30EF6A6FF4

　c:\\windows\\temp\\svchosts.exe

2770562d104391b92b42671c270079bb

　c:\\windows\\temp\\svcmon32.exe

　c:\\programdata\\svcmon32.exe

\# CyberStrikeAI Linux Beacon

09e1da2afa1216ecc55648ec8e122d2a

805B9E4AE74C903787416800999B8418

\# Tools & Scripts

29EFD64DD3C7FE1E2B022B7AD73A1BA5

　C:\\Windows\\Temp\\wdiag2.exe（mimikatz）

74F57B3E897A4960DCDD5B7E8A54F9DF

　c:\\rwx\\RogueWinRM.exe

0BBD08AF95F877F1D568B03DE2EB76B4

　c:\\ProgramData\\p1.ps1（reverse shell）

网络类指标

...ioc · network

185.186.245\[.\]144

　C2 for Windows Beacon

fastcdn\[.\]bar

　C2 for Windows Beacon

media.fastcdn\[.\]bar

　C2 for Linux Beacon

104.234.26\[.\]163

　C2 for Payload Delivery + Linux Beacon

域名为方便阅读做了处理（方括号替换点号），实际使用时请还原。文中所有哈希、路径、域名仅用于威胁情报共享与检测排查。

DISCLAIMER

本文为卡巴斯基 Securelist 原文的中文翻译与编译，内容仅供网络安全研究与防御参考。文中提及的恶意软件行为、命令、哈希、路径与域名仅用于威胁情报共享和检测排查，请勿用于非法用途。译文力求技术细节准确完整，如有歧义以英文原文为准；威胁态势与归因结论可能随时间推移发生变化。原文中的产品能力描述与归因推断代表原作者及卡巴斯基立场，不代表译者立场。

来源信息

SOURCE

原文标题：CyberStrikeAI in the wild: the use of AI in real-world attacks on organizations

作者：Kirill Antonov、Vladislav Vlasov、Dmitry Chizhmak

发布时间：2026 年 11 月 2 日 · 分类：Threat Response · 来源：Securelist（卡巴斯基）

原文链接：https://securelist.com/tr/cyberstrikeai-attacks/121715/

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b722abdf614c3dfa.webp)

更多 山东区域 卡巴斯基 威胁情报 & Next 解决方案 详情，请联系：

高进 - 186 6376 1060

如果你觉得今天这篇有收获，欢迎点赞、在看、转发三连，我们下篇见

赞

在看

收藏

THANKS FOR READING
