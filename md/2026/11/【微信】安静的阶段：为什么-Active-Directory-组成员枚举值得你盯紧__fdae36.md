---
title: 【微信】安静的阶段：为什么 Active Directory 组成员枚举值得你盯紧
source: https://mp.weixin.qq.com/s/OMn0pLJ8Cd_dMiNhklYd4w
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T13:31:42+08:00
trace_id: 6c4d1700-7859-499d-a1d8-3fb28cce5bfd
content_hash: b1a65a932b9895f307baa40efb87c117862a93694b8d52bfc45f496aefd96e7c
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41475244-d011-819d-8f14-d2df728a403c
ioc:
  cves:
    - CVE-2024-37085
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**幻泉之洲** *2026年11月10日 10:29*

> 攻击者动手改组成员之前，一定会先花几天甚至几周搞清楚"谁在 Domain Admins 里""哪个服务账号能摸到 Tier 0"。几乎每个安全团队都为"有人被加进 Domain Admins"配了告警，却几乎没人管"有人在查 Domain Admins 的成员名单"。这篇讲的是怎么用 Windows 原生审计抓到这段安静期，以及为什么一个假组能把几千条噪音变成一个高置信度报警。

## 盯着门，忘了窗

绝大多数安全团队的告警规则是这样的：有人被加进 Domain Admins，响铃。这没错。但等到这一步发生，攻击者已经拿到了特权访问，损失已经开始了。

把他送进这一步的侦察动作——摸清哪些人是管理员、哪些账号值得偷——发生在几天或几周之前。它很安静，但只要你开了对的审计，它就在日志里明明白白。

这篇文章讲三件事：组枚举为什么该进你的 AD 监控清单；怎么用 Windows 自带功能做审计；以及为什么把枚举审计和蜜罐组配对之后，一个嘈杂的信号会变成高置信度的警报。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/58d5ca68a8003992.png)

## 为什么枚举是最该抓的那个信号

枚举是攻击者把"一个被拿下的账号"变成"一份作战计划"的过程。第一脚踩进来之后（通常是一个钓鱼用户或者一个暴露的服务），他想知道的是：

-   Domain Admin、Enterprise Admin 或者其他 Tier 0 权限在谁手上？
    
-   哪些服务账号或 Help Desk 组能通向这些权限？
    
-   这些账号里，下一个最值得偷凭证的是哪个？
    

MITRE ATT&CK 把它归类为 Permission Groups Discovery: Domain Groups（T1069.002）。BloodHound 的 SharpHound 采集器、PowerView，甚至普通的 ActiveDirectory PowerShell 命令，几分钟就能把这份名单拉完。

关键在于： **任何已认证用户默认都能读组成员**。这就是它值得检测的原因。它发生在整个链条的最前端——在提权之前、在横向移动之前、在数据外带之前。在攻击者手里还只有低权限的时候报警，你的响应成本是最低的。等到他改了组成员你再动手，那已经不是响应，那是应急。

> 看组变更，你知道入侵正在进行；看组读取，你知道入侵正在被策划。

下面这套审计方法全部基于 Windows 内置功能，不需要买新东西，瞄准的就是响应最便宜的那个阶段。

## 审计是怎么跑起来的

要让域控记录枚举行为，两个部件缺一不可。很多环境装了一个，几乎没环境装第二个。

### 前提一：域控上的审计策略

在"高级审计策略 > DS 访问"里启用 **Audit Directory Service Access（成功）**。最好做成一个链接到 Domain Controllers OU 的 GPO，别一台台手动点。

### 前提二：组对象上的 SACL

你关心的每个组都得有系统访问控制列表（SACL）。加一条审计项，主体选 Everyone（或 Authenticated Users），类型 Success，应用范围 This object only，权限选 Read member。

策略有没有生效，一行命令就能在域控上确认：

auditpol /get /subcategory:"{0CCE923B-69AE-11D9-BED3-505054503030}"

给组加 SACL 也就是几行 PowerShell。注意下面那几个 `.psbase` 调用，它绕过了 PowerShell 的 DirectoryEntry 适配器，不加就读不到 SACL：

$dn = 'CN=Domain Admins,CN=Users,DC=contoso,DC=com'  
$de = \[ADSI\]"LDAP://$dn"  
$de.psbase.Options.SecurityMasks = 'Sacl'  
$rule = \[System.DirectoryServices.ActiveDirectoryAuditRule\]::new(  
\[System.Security.Principal.SecurityIdentifier\]'S-1-1-0', # Everyone  
'ReadProperty', 'Success',  
\[guid\]'bf9679c0-0de6-11d0-a285-00aa003049e2', # member attribute  
'None')  
$de.psbase.ObjectSecurity.AddAuditRule($rule)  
$de.psbase.CommitChanges()

两件事都到位之后，每一次对组成员列表的读取，都会在应答这次查询的那台域控的安全日志里生成一条 **事件 4662** （An operation was performed on an object）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3f857468e860cce0.png)

▲ Figure 1 - Event ID 4662

看懂 4662，重点看这几个字段：

| 字段  | 要匹配的值 | 含义  |
| --- | --- | --- |
| ObjectName | %{} | 读的是哪个组 |
| Properties | {bf9679c0-0de6-11d0-a285-00aa003049e2} | member 属性 |
| AccessMask | 0x10 | Read Property |
| SubjectUserName / SubjectUserSid | 账号名和 SID | 是谁发起的读取 |
| SubjectLogonId | 例如 0x3A7F21 | 拿去关联 4624，拿到源 IP 和工作站 |

### 内置组不一样，走 4799

对 Administrators 这类内置组，枚举行为会以 **事件 4799** 的形式出现。要抓到它，配置略有不同：

-   审计策略：在"高级审计策略配置 > 账户管理 > 审核安全组管理"里启用 **Audit Security Group Management（成功）**，同样建议走 GPO 覆盖 Domain Controllers OU。
    
-   SACL：和前面一样，在你要看的组上加审计项，主体 Everyone（或 Authenticated Users），类型 Success，范围 This object only，权限 Read member。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/acbf9714f770975e.jpg)
    

▲ Figure 2 - EventID 4799（用于审计域本地组）

### 4662 不记来源，自己去关联

4662 本身不告诉你请求从哪来。要定位源头，拿这条事件的 SubjectLogonId 去同一台域控上匹配 4624 登录事件的 TargetLogonId，就能还原出源 IP 和工作站名。这一步很多人漏掉，结果拿到告警也不知道该隔离哪台机器。

## 噪音和盲区

在真实的高价值组上，这个信号很吵。大量正常软件会读组成员：

-   目录同步工具，比如 Entra Connect，还有身份治理平台和 PAM 平台
    
-   Exchange 以及其它靠 LDAP 查组成员来做授权的应用
    
-   资产盘点、监控、安全评估工具
    
-   管理员在 ADUC 里点开一个组看一眼，以及每一个跑 Get-ADGroupMember 的脚本
    

每一次读取，都会在应答的那台域控上按组生成一条 4662/4799。在一个繁忙的域里，光定时任务一天就能堆出几千条。下面是动手前该想清楚的事。

### 先算日志量，再挂 SACL

审计策略本身挺安静的，真正制造事件的是每一个 SACL。你加的每一条规则，都会在 **每一台** 域控上持续产生新事件，这些事件会流进安全日志、流进日志转发器、流进你的 SIEM 计费单。

先按最坏情况算一遍每台域控的安全日志容量，确保日志在被采集走之前不会卷掉；再确认 SIEM 吃得下这个增量。顺便说一句： **这套配置是跟 CIS 建议相左的**。这不是笔误。如果你所在的合规环境以 CIS 为基线，提前打好招呼，准备好例外说明。

### SIEM 过滤不是可选项

不过滤，分析师会被合法读取淹没，真正的侦察就藏在明处。做法是先跑一个月基线，把正常流量背后的服务账号和主机认出来，然后在 SIEM 里建允许列表。

注意： **在 SIEM 里过滤，不要去删审计规则**。原始证据得留着，出了事要能回溯。

### 还有几条绕得过去的路

事件只记在应答查询的那台域控上。哪台域控没配审计策略，那里就是个盲区——攻击者甚至不需要知道，顺手就用了。

另外，读物件的 memberOf，或者查 tokenGroups，同样能推出归属关系，但压根不碰组的 member 属性。基于 SAMR 协议的工具（比如 `net group /domain` ）走的完全是另一条路，绕开这套信号。这些都得上单独的检测手段：

-   **终端侧**
    
    ：为 net.exe 和 net1.exe 带 group... /domain 参数的情况做进程创建日志（4688 含命令行、Sysmon 事件 1，或 EDR）
    
-   **网络侧**
    
    ：Microsoft Defender for Identity 原生就能识别 SAMR 侦察，IDS 传感器也能标记走 SMB 的 SAMR RPC 接口
    

还有一个坑： `adminCount=1` 的组会阻断继承，并且大约每 60 分钟被 AdminSDHolder 重置一次。审计规则要同时加到 AdminSDHolder 和组本身上，否则过一小时它可能就没了，你还在纳闷为什么告警突然不响了。

> 噪音和盲区这两件事，正是枚举审计必须和"任何合法进程都不该碰的东西"配对的原因。

## 蜜罐组：把噪音变成绊线

蜜罐组就是一个诱饵：看起来有价值，实际上什么也不做。没有应用用它，没有管理员管它，没有任何合法进程有理由去读它的成员。

所以，任何一条针对它的 4662，都是真阳性。

在 Domain Admins 上，一次成员读取是几千条里的一条。在一个叫 `Tier0-Server-Admins` 、 `SQL-Prod-Admins` 或者 `VMware ESXi Admins` 的假组上（后面这个名字懂的人自然懂，CVE-2024-37085 之后这类组是攻击者的心头好），一次读取就是一条警报。

怎么做才能既像真的、又干净：

-   **起个勾人的名字**
    
    ：命名、描述、所在 OU 都贴合你的真实规范。攻击者扫的就是 admin、prod、backup、DBA 这些词。
    
-   **塞几个成员进去**
    
    ：放一两个名字逼真的诱饵账号，配上登录时段限制或者白名单工作站，让它们实际上登录不了；再挂个假 SPN 去钓 Kerberoasting（对应事件 4769）。
    
-   **把合法读者挡在外面**
    
    ：放在排除于目录同步和盘点工具扫描范围之外的 OU 里；实在排不掉的扫描，加允许列表。
    
-   **在诱饵上放开了审**
    
    ：因为量接近于零，你可以直接审计所有属性的 Success 读取，不止 member，信号照样干净。
    

想深挖蜜罐账号的做法，可以去看 Sean Metcalf 写的 The Art of the Honeypot Account: Making the Unusual Look Normal \[1\] 。

真正的价值在关联。SharpHound 这类采集器会把能读的组全读一遍。当 **同一个 SubjectLogonId** 在几分钟内既读了你的诱饵组、又读了真实的管理员组，那你几乎肯定是在看侦察行为——而那次 4624 关联会告诉你该隔离哪台机器。

$decoy = Get-ADGroup 'Tier0-Server-Admins'  
Get-WinEvent -ComputerName $dc -FilterHashtable @{ LogName='Security'; Id=4662; StartTime=(Get-Date).AddHours(-1) } |  
Where-Object { $\_.Message -match $decoy.ObjectGUID }

生产环境里把这段逻辑搬进 SIEM，做成高严重度规则。上面这段 PowerShell 是给你在实验室里验证"它确实能抓到"用的。

## 落地节奏

分阶段推，日志量可控，价值也出得快：

1.  通过 GPO 在所有域控上开审计策略，然后逐台用 auditpol 验证。别假设 GPO 一定生效了。
    
2.  先上 **一到两个蜜罐组**，配 SACL 和一条 SIEM 告警。这是最快能拿到的高置信度检测。
    
3.  在 SIEM 里跑一个月基线，过滤掉合法读取，然后再对真实组告警；接着写关联规则，把诱饵读取和真实组读取串起来。
    
4.  给顶层 Tier 0 组加 SACL，尤其是自建的特权组。注意：一旦 SACL 加到 AdminSDHolder，它会同步作用到所有 `adminCount=1` 的组，比如 Domain Admins 和 Enterprise Admins——也就是量会一次性放大。所以这一步必须分批，配合 SIEM 持续过滤。
    
5.  用攻击者的工具自测。拿一个测试账号跑 SharpHound 或 PowerView，确认你的告警真的会响。
    

## QuietPhase：先体检，再动手

上面这套流程，检查环节最枯燥——十几台域控、一堆知名组的 SACL，全靠手工核对很容易漏。QuietPhase 就是为这个写的 PowerShell 脚本。

它默认 **只报告，不改任何东西**，除非你明确要求。下载地址：https://github.com/d3lightfu1/QuietPhase  
要求：PowerShell 7.2 以上、ActiveDirectory 模块（RSAT）、以 Domain Admin 提权会话运行（林根组需要 Enterprise Admin）。脚本依赖 Microsoft.PowerShell.ConsoleGuiTools，缺了会自动从 PowerShell Gallery 安装。检查远程域控需要 WinRM。

它干三件事：

**第一，查环境就绪度。** 逐台域控检查 Audit Directory Service Access（必需）、Audit Security Group Management（建议启用，用于内置组的 4799）以及强制审计策略子类别设置。如果 Directory Service Access 是关的，它直接把 GPO 和 auditpol 的修法打出来然后停下。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f64dce07c728d601.jpg)

▲ Figure 3 - Reviewing environment readiness

**第二，查知名特权组的 SACL。** 覆盖 Domain Admins、Enterprise Admins、Schema Admins、Key Admins、Enterprise Key Admins、Group Policy Creator Owners、Builtin 里的几个操作员组（Account Operators、Server Operators、Print Operators、Backup Operators）、Administrators 和 DnsAdmins。组是按 SID 定位的，所以任何语言的域都能用。已经配好的显示绿色，需要改的显示黄色。AdminSDHolder 也会被检查，因为受保护组是从它那儿重置的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a3fcec1622180d7.jpg)

▲ Figure 4 - Well-known privileged group status

**第三，查自定义组。** 评估完知名组之后，脚本会让你输入组名片段，用来挑选自建特权组（包括你的蜜罐组），然后检查它们的 SACL，确认就绪或者给出修改建议。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7541493b4f354c0e.jpg)

▲ Figure 5 - Defining custom groups to be audited

判定标准很直接：组的 SACL 里，有 Everyone 或 Authenticated Users 对 member 属性（或所有属性）Success 读取的审计项，就算配置到位。

只要有任何一项被标成 NeedsChange，脚本会先列出受影响的对象，最后给一段 NEXT STEPS，里面是可直接粘贴、并且带上了你刚才所跑参数的命令。你可以用 `-Apply` 直接改（先配 `-WhatIf` 预览），用 `-FixScriptPath` 导出，或者照着它给出的 ADUC 手工步骤做。修复代码只会写进导出的修复脚本，按章节和组标注好，控制台保持干净可读。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1fe0c6a06be751dd.jpg)

▲ Figure 6 - Options to apply recommended changes

## 参数和用法

| 参数  | 默认值 | 作用  |
| --- | --- | --- |
| \-Server | 自动发现的 DC | 目标域控或域 |
| \-AllDomainControllers | 关   | 检查所有域控的审计策略，而不只是目标那台 |
| \-AuditPrincipal | Everyone | 拟用规则的主体：Everyone 或 Authenticated Users |
| \-Apply | 关   | 应用建议变更，每一项都弹确认 |
| \-SkipCustomGroups | 关   | 跳过第三阶段 |
| \-FixScriptPath | 无   | 把所有建议的修复导出成.ps1，便于评审、修改或走变更审批 |
| \-WhatIf / -Confirm | 标准  | 配合 -Apply 使用，预览变更或控制提示 |

### 几个典型用法

不带参数跑一遍，看看今天你的环境到底能不能检出枚举。这份报告拿去应对审计或者给领导汇报都挺合适：

.\\QuietPhase.ps1 -AllDomainControllers

导出修复建议，砍到本次批准的范围，附在变更单后面提交：

.\\QuietPhase.ps1 -AllDomainControllers -SkipCustomGroups -FixScriptPath.\\EnumAuditFix.ps1

建好蜜罐组之后跑一遍，在第三阶段按名字搜到它，把 SACL 加上：

.\\QuietPhase.ps1 -Apply -WhatIf # 先预览  
.\\QuietPhase.ps1 -Apply

另外两个值得排进日程的习惯：定时跑一次只读报告，专门抓那些新上线却没配审计策略的域控，以及被悄悄删掉的 SACL；先在实验室里加好 SACL、跑一遍你的枚举工具、确认 4662/4799 真的出来了，再碰生产。

他们管这段叫"安静的阶段"，因为没人在听。但这件事你可以改。 **对一个诱饵组的一次读取，就是攻击者在主动报名**。而每一条在提权之前响起的告警，都是一次没发生的入侵。

* * *

### 参考资料

\[1\] https://adsecurity.org/?p=4510

\[2\] https://trustedsec.com/blog/the-quiet-phase-active-directory-group-enumeration
