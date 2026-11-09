---
title: 【微信】恶意 AI 编程扩展的 SSH 后门、持久化与开发机响应
source: https://mp.weixin.qq.com/s/cGwPUGidPPhhP-bfhFJicw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T14:03:14+08:00
trace_id: 497ad543-bbd2-4e7f-a76c-76ee0b3a0e43
content_hash: 782ba75a891ff8b48bfb870407c0c685e489aedf7b25984d366acdd661aa5218
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41375244-d011-81e3-a740-ef91b56d4745
ioc: null
---

**ITPAPA** *2026年11月9日 13:08*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ddfb6db784289ca4.png)

恶意扩展一旦在 Extension Host 中执行，就已经越过“代码编辑辅助”的边界。它可以写 SSH 授权文件、启动系统命令、建立出站隧道，并把持久化留在扩展目录之外。

## 几个小时足以把开发机变成远程入口

2026 年 10 月 29 日，Cursor 披露其扩展市场曾短暂提供被篡改的 anthropic.claude-code 2.1.312 和 2.1.313。官方时间窗约为当天 2:27 至 13:35（太平洋夏令时）。Cursor 与 Microsoft 均说明，恶意包并非 Anthropic 开发；Microsoft Visual Studio Marketplace 和 npm 的 @anthropic-ai/claude-code 未受此事件影响，现有证据把分发范围限定在 Cursor 扩展市场。

Microsoft 对样本的分析显示，插入的 JavaScript 在扩展正常代码之前运行：收集主机信息，尝试追加攻击者 SSH 公钥、启用本地 SSH 服务、建立反向 SSH 转发，并在 macOS、Windows 和代码中包含的 Linux 分支上配置不同持久化。即使远端服务器不可用或权限不足导致隧道失败，公钥、脚本和启动项仍可能已经写入。

核心结论 事件响应不能停在“卸载恶意扩展”。必须把扩展来源与版本、模块加载、进程、文件、网络和身份活动串起来，分别判断代码是否执行、后门是否落地、远程通道是否建立以及凭据是否被使用。

## 为什么编辑器扩展拥有这样的能力

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/58aab75f821e844d.png)

图 1 扩展运行在 Extension Host 中，通常继承编辑器进程能够访问的本地资源。

VS Code 官方文档明确说明，Extension Host 与 VS Code 本身拥有相同级别的权限。扩展可以读写本机文件、发起网络请求、运行外部进程并修改工作区设置。对开发者而言，这意味着扩展往往能接触源码、Git 配置、SSH agent、云 CLI 缓存、包管理器令牌、代码签名工具和公司内网。

Workspace Trust 解决的是“是否允许不熟悉的工作区自动执行代码”。它可以限制任务、调试、终端、Agent 和部分扩展，但官方同样提醒：它不能阻止一个恶意扩展执行代码并忽略 Restricted Mode。因此，信任仓库作者和信任扩展发布者是两条不同的供应链。

| 信任对象 | 主要控制 | 能解决什么 | 不能解决什么 |
| --- | --- | --- | --- |
| 工作区内容 | Workspace Trust、Restricted Mode | 限制陌生仓库触发任务、终端、调试和 Agent | 不能约束恶意扩展自身。 |
| 扩展包完整性 | 签名与哈希校验 | 发现安装包被篡改或来源不受信 | 签名正确不代表发布者账号和构建流程未被滥用。 |
| 发布者身份 | Verified Publisher、批准列表 | 降低仿冒名称和未知发布者风险 | 同一 ID 在不同市场可能对应不同代码或发布链。 |
| 版本时间 | 安装冷却、分批更新 | 为短时恶意版本的撤回和情报传播留出窗口 | 无法防住长期潜伏或已批准恶意版本。 |
| 运行时行为 | EDR、出站控制、文件与进程审计 | 在包通过安装门禁后捕获恶意动作 | 需要完整遥测和低噪声关联。 |

## 攻击链 66 行加载器为什么足够

图 2 注入代码先获得 Extension Host 权限，再把持久化拆到编辑器目录之外。

## 模块加载与侦察

Microsoft 报告称，注入函数先于扩展预期逻辑执行。它收集 hostname、username、操作系统、架构、HOME、工作目录、Git 邮箱、公网 IP，以及环境变量的名称。环境变量名本身未必含秘密，但能告诉攻击者主机是否配置 AWS、Azure、GitHub、包仓库或其他高价值工具。

## SSH 授权与服务启用

加载器把带有 svc-telemetry 注释的攻击者公钥追加到 authorized_keys，并尝试启用本地 SSH 服务。Windows 分支还尝试安装 OpenSSH Server，macOS 分支调用 systemsetup 打开 Remote Login。能否成功取决于用户权限、系统配置和安全策略；“代码尝试”不能直接写成“每台主机都已开放 SSH”。

## 反向 SSH 转发

反向转发从开发机主动向外连接，因此不要求攻击者直接穿透企业入站防火墙。样本使用类似 ssh -N -R \*:0:localhost:22 的参数，请求远端服务器分配端口并转发回开发机的 22 端口。若成功，攻击者可通过其服务器进入本地 SSH 服务。严格关闭 host egress、阻断未知 SSH 目的地和监控 IDE 派生的 ssh 进程，比只看入站连接更有效。

## 独立持久化

macOS 使用 LaunchAgent 和 ~/.config/.smt；Windows 使用名为 SysMon 的计划任务、Startup 目录回退脚本以及 %USERPROFILE%\\.config 下的文件；样本代码还包含 Linux cron @reboot 路径。它们都位于扩展安装目录之外。因此，扩展市场下架、IDE 更新或卸载包不会自动撤销 SSH 公钥、删除脚本、停止隧道进程，也不会使已建立的远程会话失效。

| 平台  | 授权文件与脚本 | 启动机制 | 需要验证的执行证据 |
| --- | --- | --- | --- |
| macOS | ~/.ssh/authorized_keys、~/.config/.smt、.smtk | com.apple.sysmond LaunchAgent | launchctl、ssh/autossh、systemsetup 与出站会话。 |
| Windows | 用户或 ProgramData authorized_keys、smt.cmd、smtk | SysMon 计划任务、Startup sysmon.cmd | schtasks、PowerShell、OpenSSH 安装、sshd 与网络。 |
| Linux | authorized_keys、~/.config/.smt、.smtk | 用户 crontab @reboot | crontab 变更、shell 与 ssh/autossh。 |

Cursor 的事件通知将实际受影响安装范围表述为 Windows 和 macOS，并要求这些平台用户执行官方检查。Linux 行为来自 Microsoft 对样本分支的代码分析；没有公开证据证明本次市场分发中存在同等规模的 Linux 受害面。文章应把“代码具备能力”与“行为已成功执行”分开。

## 调查模型 不要把“安装过”直接写成“已入侵”

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fdfae3a082a622f3.png)

图 3 版本命中只是起点，影响结论取决于后续文件、进程、网络和身份活动。

| 证据等级 | 满足条件 | 可以写出的结论 | 仍不能声称 |
| --- | --- | --- | --- |
| 潜在暴露 | 时间窗内从 Cursor 市场安装或自动更新到 2.1.312/2.1.313 | 设备可能加载恶意包，需要取证 | 恶意代码已经运行。 |
| 代码执行 | IDE/Extension Host 后出现关联 shell、ssh、文件或启动项动作 | 恶意加载器在主机上执行 | 反向隧道已经建立。 |
| 后门落地 | 攻击者公钥指纹、隧道密钥或持久化对象被确认 | 主机被写入持久化访问能力 | 攻击者已经成功登录。 |
| 远程通道 | 到已知目的地或相符 SSH 反向转发会话成功 | 开发机建立了可用或尝试中的隧道 | 敏感数据已被访问。 |
| 确认影响 | 远程登录、后续命令、凭据使用、仓库或云资源访问有证据 | 存在具体未授权行为与影响范围 | 未调查资源没有影响。 |

Cursor 的远端服务器下线会中断后续连接，但不能删除端点上的 authorized_keys、计划任务和脚本。Microsoft 也提醒，未看到 svc-telemetry 字符串不能替代完整调查：文件可能被改名、删除，或执行只留下进程和网络痕迹。

## 防御性验证 用合成目录检查能力组合

下面的实验不安装扩展、不执行其中的 JavaScript，也不连接任何远端地址。它扫描一个解压后的合成扩展目录，寻找同时出现的高风险能力：写 authorized_keys、启动 ssh/autossh、反向转发参数、计划任务或 LaunchAgent。演示数据需要由读者自己创建，输出只能作为静态线索，不能替代样本哈希和运行时遥测。

scan_extension.py 安全静态实验，不运行被扫描代码

from pathlib import Path

import re, json, hashlib

ROOT = Path("synthetic_extension") # 只放自建文本样本

RULES = {

"ssh_key_write": r"authorized_keys|administrators_authorized_keys",

"reverse_forward": r"(?:ssh|autossh).{0,160}(?:-R|ExitOnForwardFailure)",

"persistence": r"LaunchAgents|schtasks|Startup|crontab|@reboot",

"process_exec": r"child_process|execFile|spawn|powershell|/bin/sh",

"beacon": r"https?://|fetch\\s\*\\(|\\.request\\s\*\\("

}

for path in ROOT.rglob("\*"):

if not path.is_file() or path.stat().st_size > 5_000_000:

continue

raw = path.read_bytes()

text = raw.decode("utf-8", errors="ignore")

hits = \[name for name, rx in RULES.items()

if re.search(rx, text, re.I | re.S)\]

if hits:

print(json.dumps({

"file": str(path),

"sha256": hashlib.sha256(raw).hexdigest(),

"capabilities": hits

}, ensure_ascii=False))

预期结果：普通扩展可能命中 process_exec 或 beacon，但同时命中 ssh_key_write、reverse_forward 和 persistence 才应提升优先级。检测逻辑应评价“能力组合”，而不是把 URL、child_process 或某个文件名单独当成恶意。复核时记录文件 SHA-256、包来源、扩展 ID、版本和安装时间。

## 检测工程 把 IDE、SSH 和持久化事件关联起来

单条 ssh.exe 网络连接通常噪声很高。更有价值的规则是：父进程属于 Cursor 或 Extension Host，随后出现 authorized_keys 写入、计划任务或 LaunchAgent 创建，再观察到未知外部 SSH 会话。事件时间窗应覆盖扩展激活后的几分钟到首次重启。

KQL 骨架 发布前按租户 schema、平台字段和已验证进程名调整

let SuspectIDE = dynamic(\["Cursor.exe", "cursor", "extensionHost"\]);

let Proc = DeviceProcessEvents

| where Timestamp > ago(30d)

| where InitiatingProcessFileName has_any (SuspectIDE)

| where FileName in~ ("ssh.exe","autossh.exe","powershell.exe","cmd.exe","sh","bash")

| project DeviceId, ProcTime=Timestamp, FileName, ProcessCommandLine,

InitiatingProcessFileName, InitiatingProcessCommandLine;

let Net = DeviceNetworkEvents

| where Timestamp > ago(30d)

| where RemotePort in (22, 8099)

| project DeviceId, NetTime=Timestamp, RemoteIP, RemotePort,

InitiatingProcessFileName, InitiatingProcessCommandLine;

Proc

| join kind=inner Net on DeviceId

| where NetTime between (ProcTime.. ProcTime + 15m)

| project DeviceId, ProcTime, NetTime, FileName, ProcessCommandLine,

RemoteIP, RemotePort

| 信号  | 高价值字段 | 关联方式 | 误报控制 |
| --- | --- | --- | --- |
| 扩展安装 | marketplace、extension_id、version、hash、install_time | 锁定曝光设备和时间窗 | 区分 Cursor、Microsoft Marketplace 和离线 VSIX。 |
| 进程  | 父进程、命令行、用户、完整路径、签名 | IDE → shell/ssh/autossh | 排除批准的远程开发和运维脚本。 |
| 文件  | authorized_keys、.smt、.smtk、plist、Startup | 进程与写入时间相邻 | 校验 SSH 公钥指纹和对象动作。 |
| 网络  | RemoteIP、端口、进程、会话时长、代理 | 反向转发参数与外连匹配 | 公网 IP 查询服务单独出现不是 IOC。 |
| 身份  | SSH 登录源、命令、云/代码托管会话 | 隧道建立后寻找后续行为 | 建立设备、用户、令牌与资源关联。 |

已公开 IOC 可以用于快速筛选，包括 134.209.82\[.\]225、svc-telemetry、公钥指纹和特定脚本路径。但路径名 SysMon、com.apple.sysmond、ifconfig.me 和 ipify.org 都可能出现在合法环境。IOC 命中应与扩展安装、父子进程、文件哈希和时间线关联。

## 响应顺序 先保全证据，再清理独立持久化

| 阶段  | 动作  | 完成标准 |
| --- | --- | --- |
| 1 定位暴露 | 查询扩展来源、版本、哈希、安装和自动更新时间 | 形成受影响设备清单，区分市场来源。 |
| 2 隔离与保全 | 隔离有执行证据的设备；保存 VSIX、扩展目录、authorized_keys、脚本、启动项、进程与网络记录 | 证据带时间、哈希、采集人和设备标识。 |
| 3 判断落地 | 验证公钥指纹、隧道密钥、LaunchAgent/计划任务/cron 的实际动作 | 确认对象内容，不按名称盲删。 |
| 4 移除通道 | 停止确认的隧道和重试进程；删除精确恶意公钥、脚本与启动项；移除恶意扩展 | 保留合法 SSH 键和正常远程开发配置。 |
| 5 身份处置 | 从干净设备撤销会话并轮换可达凭据 | 覆盖 Git、云、包仓库、签名和企业 SSO。 |
| 6 影响调查 | 检查远程登录、命令、仓库访问、云审计和数据访问 | 给出确认影响、未确认范围和证据缺口。 |
| 7 恢复验证 | 必要时重建；重启后复查启动项、进程、端口和外连 | 持久化不再出现，设备重新入网有审批。 |

如果设备承载生产云权限、代码签名密钥或高价值仓库，仅删除 IOC 很难恢复信任。是否重建应根据远程通道是否成功、攻击者可用权限、遥测完整性和凭据可撤销程度决定。清理脚本是执行工具，不是调查结论。

## 把扩展更新纳入软件供应链控制

这起事件说明，AI 编程助手正在把 IDE 变成新的高价值运行平台。扩展自动更新的速度原本是功能优势，但对拥有开发机权限的代码而言，也会缩短恶意版本从发布到执行的时间。企业需要像管理构建依赖和端点软件一样管理扩展。

| 控制  | 建议做法 | 代价与边界 |
| --- | --- | --- |
| 批准列表 | 按 extension ID、发布者和来源市场批准；不同市场分开记录 | 维护成本高，可能影响开发效率。 |
| 安装冷却 | 高权限扩展延迟 12—48 小时，先进入试点设备 | 延迟安全修复；紧急版本需例外流程。 |
| 签名验证 | 强制有效市场签名，拒绝关闭验证或未知侧载 | 签名证明包与市场发布链，不证明代码安全。 |
| 分阶段自动更新 | 安全试点 → 普通开发机 → 高权限开发机 | 需要版本遥测和快速回退。 |
| 运行时最小权限 | 开发机不常驻生产凭据；IDE 出站网络分区；SSH 服务默认关闭 | 部分远程开发场景需要受控例外。 |
| 可观测性 | 采集扩展清单、IDE 子进程、关键文件、网络和身份日志 | 数据量与隐私治理成本增加。 |

Cursor 当前文档提供企业扩展批准列表、Marketplace Install Cooldown 和签名验证选项，并强调同一个 publisher.extension 名称在不同市场可能指向不同发布者或代码。VS Code Marketplace 同样对发布包签名并在安装时验证完整性。任何单一控制都不够：身份、签名、时间缓冲和运行时检测需要共同工作。

## 适用边界与证据限制

第一，公开分析说明恶意加载器具备一组能力，并不证明所有动作在所有设备上成功。SSH 服务启用、计划任务提权和反向隧道受平台、权限、网络和远端服务器状态影响。

第二，公开证据没有说明每台安装设备都发生了远程登录或数据访问。文章应使用“尝试”“具备能力”“发现落地证据”和“确认后续行为”等不同表述。

第三，Cursor 说明受影响版本来自其扩展市场；Microsoft Marketplace 与 npm 包未受影响。不能仅凭相同扩展 ID 或版本字符串扩大事件范围，必须核查安装来源和包哈希。

第四，Workspace Trust、Verified Publisher 和签名校验都是有用控制，但它们分别解决不同问题。Verified Publisher 证明域名归属和身份历史，签名证明包的来源与完整性，Restricted Mode 约束陌生工作区；它们都不等价于扩展代码已经完成安全审计。

## 结语 开发工具已经是生产身份的入口

开发机通常同时连接源码、云平台、包仓库、CI/CD、SSH 和企业身份。恶意扩展不需要利用编辑器漏洞，只要作为可信更新进入 Extension Host，就能使用开发者已经拥有的权限。

防守方最容易犯的错误，是把事件缩成一个需要删除的插件。真正需要恢复的是设备信任：确认代码是否执行、持久化是否落地、通道是否建立、身份是否被使用，然后再决定清理、轮换还是重建。把扩展列入软件资产和供应链治理，才是这类事件留下的长期控制。

Security · 目录
