---
title: 【微信】开箱即用的Windows应急响应神器，还能让AI帮你自动排查
source: https://mp.weixin.qq.com/s/lRB0MOcdGLtaj3pG1RuJQg
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:48:27+08:00
trace_id: 46c562fb-f112-45c4-9d6c-0b0f40629f89
content_hash: af738e9f89fcd11caeff8c83ce9d79b8bcc46292d701a8c4668a0d95edb19f3a
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 24
  succeeded: 24
  failed_urls: []
notion_page_id: 41d75244-d011-817e-befa-d4b87ee9fc4d
ioc: null
---

**Hack分享吧** *2026年11月18日 08:30*

| Ima知识库名称 | 加入条件 |
| --- | --- |
| 潇湘信安协同知识库（更新~ing!） | 免费加入 |
| 潇湘信安学习资料库（更新~ing!） | ≥3年粉丝 |
| 潇湘信安内部知识库（更新~ing!） | 星球成员 |

现在只对常读和星标公众号才展示大图推送，建议大家把“Hack分享吧”设为星标，否则可能看不到了！

## 一、工具简介

在应急响应现场，时间就是生命线。每多花一分钟手动排查，攻击者就可能多完成一次横向移动或数据窃取。 **SWAY_WIN_IR_TOOLS** 正是为了打破这一困局而生——它是一款综合全面的 Windows 应急响应工具，凝结了作者多年一线实战经验，并融合了业内顶尖的应急响应思路，让你在图形界面中就能逐项完成浏览器、进程、持久化、日志、文件和网络等全维度痕迹排查，快速定位可疑程序、账户、启动项和外联行为。

更令人眼前一亮的是，工具同时提供 **MCP 接口**。接入后，AI Agent 可以按照排查流程自动调用各项能力收集证据、完成分析，并给出处置建议，由现场工程师确认后执行。最关键的是—— **MCP 服务的所有工具都是只读的**，从根本上排除了模型误调用增删改操作的风险，让 AI 辅助应急响应既高效又安全。

* * *

## 二、支持的操作系统

工具仅支持 **64 位 Windows 系统**，具体包括：

-   Windows 10、Windows 11
    
-   Windows Server 2012 R2 及以上的服务器系统
    

> ⚠️ 32 位 Windows 和 ARM64 Windows 不在支持范围内。部分排查功能（如安全日志读取、进程内存分析等）需要 **管理员权限** 才能获取完整数据，建议始终以管理员身份运行。

* * *

## 三、核心排查功能

## 3.1 浏览器排查

浏览器往往是攻击者进入内网的第一道门——钓鱼下载、恶意插件、浏览器落地样本，都可以在这里找到蛛丝马迹。

**插件视图** 下，可以查看本机 Chrome 与 Edge 的全部插件记录，包括插件来源、权限、安装时间等关键信息，帮助你快速发现恶意插件和从浏览器侧落地的样本。更贴心的是，工具支持 **右键隔离并删除**：点击后会将该插件从浏览器中移除，并把相关文件保存在隔离证据目录 `./evidence/browser_extensions` ![浏览器插件排查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/daa002dd9cc5c878.png)

浏览器插件排查

**下载记录视图** ![浏览器下载记录](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4561a1b5ba0dc71e.jpg)

浏览器下载记录

## 3.2 进程分析

进程分析是应急响应的核心环节。工具会列出所有进程的名称、PID、父进程 ID、用户、启动时间、是否签名、公司、文件路径等关键信息。点击单个进程还可查看更多详情。

右键菜单更是功能强大：

-   计算进程所属文件的 **SHA256 和 MD5 哈希值**
    
-   查看进程加载的 **所有 DLL 模块**
    
-   查看 **进程树信息**
    
-   进行 **内存取证** （Mini Dump 或 Full Dump）
    
-   一键查询 **微步、VT 沙箱**，快速判断文件是否为恶意
    

![进程分析界面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e5871182837bd00d.png)

进程分析界面

说到 DLL 模块，这可是排查"白进程 + 黑 DLL"场景的关键阵地。选择某个进程右键查看 DLL 模块后，你需要重点关注那些 **签名异常和未签名的 DLL** ![DLL模块查看](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d19428bf45ce1165.png)

DLL模块查看

## 3.3 威胁检索

手里有 IOC（Indicators of Compromise）？威胁检索功能可以让你快速确认主机是否已被植入对应程序。支持按 **进程名、路径、命令行、模块、文件哈希或内存特征** 在本机进程中检索，哈希支持 MD5、SHA1 和 SHA256。

比如，在真实攻防场景中，如果态势感知设备告警有恶意外联 IP，你可以直接输入该 IP 进行内存搜索，瞬间定位恶意进程。

> 💡 内存限制默认为 256MB：如果一个进程占用 1GB 内存，工具只会扫描前 256MB，没命中就跳过该进程——这在保证覆盖面的同时兼顾了扫描效率。

![威胁检索](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/581277ad0b9000f5.png)

威胁检索

## 3.4 Beacon 扫描

Cobalt Strike 是红队和 APT 组织最常用的 C2 框架之一，Beacon 植入的检测一直是应急响应的重点和难点。

Beacon 扫描功能会 **扫描进程堆内存，查找 Cobalt Strike Beacon 的配置** ![Beacon扫描](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8f273e9a387ed51f.png)

Beacon扫描

## 3.5 进程扫描

有些恶意代码只存在于内存中，磁盘上根本找不到完整文件——这就是所谓的"无文件攻击"。进程扫描功能使用 **YARA 规则** ![进程YARA扫描](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/652d2a191aba133b.png)

进程YARA扫描

## 3.6 用户排查

攻击者入侵后，往往会新建账户或隐藏账户来维持访问。用户排查功能会列出本机账户的 **启用、锁定、管理员和当前登录状态**，并自动标出 **隐藏账户和 RID 劫持迹象** ![用户排查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bdea8736e62141c2.png)

用户排查

## 3.7 计划任务

计划任务是最常见的持久化手段之一。相比网上其他应急响应工具，这个模块的亮点在于会显示 **计划任务的创建时间和是否签名**。

它的原理很巧妙：创建计划任务时会在 `C:\Windows\System32\Tasks\` 目录下生成文件，工具就利用这个文件的创建时间作为计划任务的创建时间。而签名则是根据计划任务指定运行的载荷文件来判断的——载荷文件有签名则认为有签名，没有签名就是无签名。

此外，还可以查看计划任务的程序、参数、运行身份、触发器、状态和签名，并对计划任务实际运行的程序做 **YARA 磁盘扫描** ![计划任务排查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7c9a37c605e41c4b.jpg)

计划任务排查

## 3.8 服务排查

服务排查模块会列出服务的 **创建时间、启动类型、状态、程序路径和签名**，并对服务程序或参数中的载荷做 YARA 扫描，用于发现伪装成服务的恶意程序。

![服务排查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aafc18ab6887c008.jpg)

服务排查

## 3.9 驱动排查

内核级威胁越来越常见，驱动排查也成了应急响应的必查项。工具会列出 **内核驱动、文件系统驱动和已加载模块** ![驱动排查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/757cf84eb0f6c230.png)

驱动排查

## 3.10 自启动排查

攻击者的持久化手法五花八门，自启动排查就是把网上大部分能持久化的地方统一扫一遍。它覆盖了：

-   登录运行（Run / RunOnce）
    
-   启动文件夹
    
-   Winlogon
    
-   映像劫持（IFEO）
    
-   AppInit
    
-   WMI 订阅
    
-   BITS 任务
    
-   COM 劫持
    
-   等等常见持久化点位
    

![自启动排查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de09f2e30df1f440.png)

自启动排查

## 3.11 文件排查

文件排查模块会扫描 **下载目录、桌面、临时目录和 C 盘非系统目录** 中的可执行文件、脚本、压缩包与快捷方式，查看创建时间、签名、来源区域和异常标记，并可对选中文件做 YARA 扫描。

这个功能特别适合发现 **新落地的样本、双扩展名文件和隐藏文件** ![文件排查](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/09783c13e3ce6065.png)

文件排查

## 3.12 事件日志

Windows 事件日志是溯源的金矿，但海量日志往往让人无从下手。事件日志模块按照应急响应的实际需求，将日志按类型分类提取：

-   登录认证
    
-   远程桌面
    
-   账户变更
    
-   权限组
    
-   共享访问
    
-   持久化
    
-   进程创建
    
-   PowerShell
    
-   防御规避
    

![事件日志](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39f6054b0e7f8f04.png)

事件日志

## 3.13 活动痕迹

有些程序执行完就退出了，当前进程列表里根本看不到——这时候就需要历史活动痕迹来补充。

活动痕迹模块从多个来源汇总历史操作记录：

-   **系统事件**
    
-   **Prefetch** （预读取）
    
-   **UserAssist** （用户 Assist 记录）
    
-   **最近访问**
    
-   **卸载记录**
    
-   **Amcache**
    
-   **PowerShell 控制台历史**
    

![活动痕迹](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/43cdf3de87f543fc.jpg)

活动痕迹

## 3.14 网络连接

网络连接排查有两种视图，各有侧重。

**当前连接视图** 可以查看各个进程的 TCP、UDP 连接情况，并自动筛选区分 **外联外网、内网和监听端口** ![网络连接-当前连接](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6f3c08ef7b9a58c1.png)

网络连接-当前连接

**外联记录视图** 则更强大——点击"开始监听"后，可以实时记录哪个进程外联了哪些 IP 地址。如果有态势感知设备告警了木马外联的恶意 IP，配合这个功能可以秒级定位恶意进程。

更有意思的是第四列的 **间隔秒数** ![网络连接-外联记录](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eade7a8851d2a14a.png)

网络连接-外联记录

## 3.15 域名解析监听

![域名解析监听](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/467fe26f415446ea.png)

域名解析监听

* * *

## 四、MCP AI 自动化功能

## 4.1 MCP 是什么？为什么它是核心亮点？

如果说前面的功能已经足够强大，那 MCP 功能就是这款工具真正的"杀手锏"。

**MCP（Model Context Protocol）** 是一种让 AI Agent 能够调用外部工具的协议。把 SWAY IR Tools 在受害机器上作为 MCP 服务启动后，AI Agent 就可以通过 MCP 服务作为媒介，自动调用上述所有排查功能来分析受害机器。

但这里有个关键问题：AI 不是万能的，模型可能会因为分析错误而误删文件、误改配置——在应急响应场景中，这绝对是灾难性的。

**SWAY IR Tools 的解决方案非常聪明：所有 MCP 工具都是只读的！** 工具只会进行数据查询操作，不会对系统做任何增删改。AI 可以通过只读接口调取浏览器排查、进程分析、威胁检索、Beacon 扫描、进程扫描、用户排查、计划任务、服务排查、驱动排查、自启动排查、事件日志、活动痕迹、网络连接和域名解析监听等全部功能的结果，连续核对证据并给出处置方法，然后由安全人员确认无误后再手动执行处理。

简单说就是： **AI 负责分析和出方案，人负责拍板和执行——既高效又安全。**

## 4.2 MCP 启动方式

工具有两种启动方式：

1.  **双击打开** → 图形化应急响应工具
    
2.  **命令行启动** → 作为 MCP 服务运行
    

> 💡 建议都以 **管理员身份** 启动，否则可能因权限问题无法查询到全部信息。

### 本地 MCP 模式

在工具所在目录执行以下命令，默认只监听本机，AI 客户端连接 `http://127.0.0.1:8765/mcp` ：

```
SWAY_WIN_IR_TOOLS.exe --mcp --port 8765
```

### 远程 MCP 模式

当需要让其他机器的 Agent 访问受害机器的 MCP 服务时，需指定监听地址，然后把连接地址 http://受害机器IP:8765/mcp 发给 Agent，Agent 就会自动进行应急响应分析：

```
SWAY_WIN_IR_TOOLS.exe --mcp --mcp_ip 受害机器IP --port 8765
```

> ⚠️ `--port` 参数必须填写。不写 `--mcp_ip` 时只监听 `127.0.0.1` 。读取安全日志和进程内存时，请以管理员身份启动。

![MCP启动方式](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2aec798cb8264b9.png)

MCP启动方式

## 4.3 MCP 工具清单

MCP 共提供 **27 个只读工具**，覆盖了几乎所有图形界面中的排查能力（文件排查仅在图形界面中使用，不在 MCP 工具里）。

| 排查模块 | 工具名称 | 作用说明 |
| --- | --- | --- |
| 浏览器 | `browser_extensions_list`<br><br>、 `browser_extension_detail` | 查询 Chrome、Edge 插件列表和单条详情 |
| 浏览器 | `browser_downloads_list`<br><br>、 `browser_download_detail` | 查询下载记录和单条详情 |
| 进程分析 | `process_list`<br><br>、 `process_detail` | 查询进程列表，以及某个进程的哈希、命令行、模块和进程链 |
| 威胁检索 | `threat_scan` | 按 IOC 检索进程名、路径、命令行、模块、哈希和内存 |
| Beacon 扫描 | `beacon_scan` | 扫描进程堆内存中的 Cobalt Strike Beacon 配置 |
| 进程扫描 | `process_scan` | 用 YARA 规则扫描进程内存 |
| 用户排查 | `user_list`<br><br>、 `user_detail` | 查询本机账户列表和单个账户详情 |
| 计划任务 | `task_list`<br><br>、 `task_detail` | 查询计划任务并对程序做 YARA，再查看单个任务 |
| 服务排查 | `service_list`<br><br>、 `service_detail` | 查询服务并对程序做 YARA，再查看单个服务 |
| 驱动排查 | `driver_list`<br><br>、 `driver_detail` | 查询驱动并对程序做 YARA，再查看单个驱动 |
| 自启动排查 | `autorun_list`<br><br>、 `autorun_detail` | 查询自启动项并对程序做 YARA，再按返回的键查看详情 |
| 事件日志 | `event_list`<br><br>、 `event_detail` | 按类型查询事件，再按返回的键查看单条详情 |
| 活动痕迹 | `activity_list`<br><br>、 `activity_detail` | 按来源查询活动痕迹，再按返回的键查看单条详情 |
| 网络连接 | `connection_list`<br><br>、 `connection_watch` | 查询当前连接，或在限定时间内监听出站 TCP |
| 域名解析 | `dns_listen`<br><br>、 `dns_detail` | 在限定时间内监听域名解析，再查看单条请求详情 |

## 4.4 实战效果展示

作者做了一个非常有说服力的测试：在靶机中模拟植入了白加黑免杀木马，并设置了多个持久化项。然后在靶机启动 MCP 服务，在另一台机器使用主流 Agent（如 Cursor）调用 MCP 进行自动化应急响应分析。

测试结果令人惊艳—— **Agent 成功发现了所有的持久化项，并给出了完整的应急处置建议**

![AI自动化分析截图1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/36f920f0113a809f.png)

AI自动化分析截图1

![AI自动化分析截图2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/25ce5749ebe84596.png)

AI自动化分析截图2

![AI自动化分析截图3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af2fec0dd0e29de1.png)

AI自动化分析截图3

![AI自动化分析截图4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ea176eaf3c6f672.png)

AI自动化分析截图4

AI自动化分析截图4

关于 Agent 的使用，作者表示不过多介绍——只要支持 MCP 且能联网访问 MCP 服务的 Agent 都可以，比如 **Cursor、Trae、Codex** 等，大家可以根据自己的习惯选择。

* * *

## 五、总结

SWAY_WIN_IR_TOOLS 不是一款简单的应急响应工具，它更像是一个 **集大成的应急响应工作台**：

-   🛡️ **15+ 排查模块**，从浏览器到内核驱动，覆盖应急响应全维度
    
-   🤖 **MCP AI 自动化**，让 AI 帮你做分析，人来做决策
    
-   🔒 **只读 MCP 接口**，从设计上杜绝 AI 误操作风险
    
-   🎯 **图形化界面**，新手也能快速上手
    
-   ⚡ **一键多平台查杀查询**，集成微步、VT 等威胁情报
    

无论是刚入行的安全新人，还是身经百战的应急响应老兵，这款工具都能显著提升你的排查效率。尤其是 MCP 功能的加入，让"AI + 安全运营"从概念走向了实战——而且是以一种安全可控的方式。

如果你也在寻找一款趁手的 Windows 应急响应工具，不妨试试这款 SWAY IR Tools，相信它会给你带来惊喜。

> 🔗 项目地址：https://github.com/lmhsw1/SWAY_IR_Tools

* * *

**知 识 星 球**

星球已过800人，暂不再发放优惠券，如还有需要的师傅可加我VX： **S_3had0w， **等你一起来学习**...！**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d3a8885d1a2498aa.jpg)

| Ima知识库名称 | 加入条件 |
| --- | --- |
| 潇湘信安协同知识库（更新~ing!） | 限时免费 |
| 潇湘信安学习资料库（更新~ing!） | ≥3年粉丝 |
| 潇湘信安内部知识库（更新~ing!） | 星球成员 |

往期推荐工具

[红队必备：不进系统，扒光虚拟机所有密码](https://mp.weixin.qq.com/s?__biz=MzA4NzU1Mjk4Mw==&mid=2247493081&idx=1&sn=5b6d531e21f4d4c7e5f3f99547e13ca2&scene=21#wechat_redirect)

[微信小程序捡洞神器：自动反编译+扫密钥](https://mp.weixin.qq.com/s?__biz=MzA4NzU1Mjk4Mw==&mid=2247493056&idx=1&sn=8b89bb66e8f0e141149cf8803a8fd953&scene=21#wechat_redirect)

[高级WebShell管理与后渗透神器](https://mp.weixin.qq.com/s?__biz=MzA4NzU1Mjk4Mw==&mid=2247492971&idx=1&sn=431cbbda7d6da109c86dd2c9254b0ed1&scene=21#wechat_redirect)

[263+上传漏洞检测与绕过工具](https://mp.weixin.qq.com/s?__biz=MzA4NzU1Mjk4Mw==&mid=2247492915&idx=1&sn=156543f9b79e9cde446cd8bae695ee43&scene=21#wechat_redirect)

[基佬的"自动化"渗透测试扫描工具](https://mp.weixin.qq.com/s?__biz=MzA4NzU1Mjk4Mw==&mid=2247492716&idx=1&sn=a9b49b3ddf8da8f73008d36764b4eddf&scene=21#wechat_redirect)

[最好用的下一代目录爆破工具](https://mp.weixin.qq.com/s?__biz=MzA4NzU1Mjk4Mw==&mid=2247492620&idx=1&sn=b3f78bc0af5e231ea4cae18b381b8afa&scene=21#wechat_redirect)

项目推荐 · 目录

作者提示: 内容由AI生成
