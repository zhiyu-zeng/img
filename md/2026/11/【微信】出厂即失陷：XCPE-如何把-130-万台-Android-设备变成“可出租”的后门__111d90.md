---
title: 【微信】出厂即失陷：XCPE 如何把 130 万台 Android 设备变成“可出租”的后门
source: https://mp.weixin.qq.com/s/m6zfyklxpY50HmGkwuVByQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T19:57:28+08:00
trace_id: c5c6c95a-fc46-4302-bb6d-85c09286ba3f
content_hash: 52287183aa1a3d1c76438eb10766d25305b89377ead4eb130863aaab9904b40a
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 41475244-d011-81ee-8fc7-e2b837159024
ioc:
  cves: []
  cwes: []
  hashes:
    - 1f2ab93c35f0c37d9b88f82268183a2f77491aa6b142a48381524b18e217b960
    - 350d6db477e8567cf9347c1144b3a0b25550e7ce63bb800b056b8a7a8ef56af4
    - 3768f470934a111f1c3e3d098eb1392a3cb6f3e298ef5fd2a6309e6a98ee1e18
    - 42be8f18d6006ca092de191331d38e70a0d8383db701a759466dec59a0986135
    - 7830ce3c3222dd9b25a77a16116dcf832a24b4b9a0bc998501e12415a828fb42
    - b3690b3b013ac60752a6d05c3f53ea1f3e844d4603c5b90d258a30c596d0691b
    - ebcca22b96f7a30ae155efa2f25af29a369c6e9cfc99cb3bb0b72f35bc5528ed
  domains: []
  tools: []
  techniques: []
---

**奇安信威胁情报中心** *2026年11月10日 15:36*

供应链安全 · 恶意软件分析

出厂即失陷：XCPE 如何把 130 万台  
Android 设备变成“可出租”的后门

一台 Android 机顶盒，即使用户从未安装过来路不明的应用，也可能在第一次开机后就接入攻击者控制的消息通道；即使用户删除了可疑组件，重启后它仍会回来。

· 出厂预装　· MQTT C2　· 住宅代理/广告欺诈　· 供应链归因　· 信息截至 2026.11.10

这不是假设。2026 年 11 月 2 日，Google Threat Intelligence Group（GTIG）披露 XCPE 后门及僵尸网络处置行动：超过 **130 万台** 设备被纳入该网络，受感染设备以 Android TV 机顶盒为主，也包括投影仪、Soundbar、卡拉 OK 设备、数字标牌和远程医疗设备等 Android IoT 终端。

GTIG 以高置信度评估，XCPE 后门及僵尸网络由 Android OEM/ODM 厂商 Videostrong Technology Co.（深圳市视壮科技有限公司）为经济利益故意开发、部署和运营。Google 已切断与该厂商的合作，并禁止其及未来子公司、关联公司制造和销售认证 Android 设备，或向其他认证厂商供应软件。

**但控制服务器被拆除，不等于设备已经恢复干净。** 预装组件仍可能留在固件中，普通卸载和恢复出厂设置都不能被视为可靠的清除方案。

本文重点回答五个问题：

-   XCPE 为什么不是普通的“恶意 App”？
-   设备如何在 HTTP 与 MQTT 之间建立持续控制链？
-   被控制的设备如何变成住宅代理、广告欺诈和恶意软件分发资源？
-   130 万、147 万、80 万等不同数字应该怎样理解？
-   控制端被处置后，用户和机构还能做什么？

01 感染发生在用户拆箱之前

XCPE 的核心组件名为 x.cpe，在部分固件中以 com.oemservice 运行。它随固件预装，并以 android.uid.system 权限运行。这个起点决定了它与普通恶意应用的三项本质差异。

1\. 它自带系统级信任

x.cpe 不需要诱导用户点击安装，也不依赖用户授予常规权限。它从系统环境启动，可以承担远程配置、命令转发、应用安装和设备信息采集等任务。

因此，把 XCPE 描述为“用户下载了带毒播放器”并不准确。更准确的说法是： **设备在交付时已经带有可被远程激活和扩展的控制入口，后续恶意能力再按运营需要下发。**

2\. 它把重装机制写进了启动流程

设备启动时，XCPE 会检查 /oem/ 目录中的对应安装包，并将其安装到 /data/app/。如果用户删除 /data/app/ 中的组件，BootReceiver 会在重启后执行同样的安装流程。

这解释了两个现象：

-   删除可见应用，不代表删除其固件中的安装来源
-   对这种依赖 /oem/ 重装的机制，恢复出厂设置不能被视为有效清除手段

这也不意味着“整个 Android 系统都是恶意软件”。恶意能力集中在预装组件、外部加载器及其后续模块中，但它们借助系统分区和系统权限获得了普通应用难以具备的持久性。

3\. 送检时看到的，不一定是长期使用中的状态

GTIG 指出，Videostrong 使用混淆技术利用测试缺口，并在设备首次启动后加载恶意代码，从而绕过发布前检查。至少从 2024 年末开始，XCPE 又由单阶段投递器演化为模块化架构，将通信、执行和变现能力拆分。

这意味着，仅检查出厂固件中的单个 APK，可能无法看到完整攻击链。首次开机后的动态配置、外部加载器和按需下载模块，都是理解 XCPE 不可缺少的部分。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0b78d7c034a34535.jpg)

**图1｜XCPE 预装持久化与首次开机后加载过程**

图源：依据 Google Threat Intelligence Group（GTIG）公开技术细节绘制。

02 控制链：先取配置，再接入 MQTT

XCPE 的通信过程可分为初始配置、持久控制和模块执行三个层次。GTIG 的总体架构图展示了 x.cpe、com.abc.nexus、变现模块与远程基础设施之间的关系：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d422214d3f9b7fd1.png)

**图2｜XCPE 恶意软件总体架构：预装后门、加载器、变现模块与远程基础设施**

图源：Google Threat Intelligence Group（GTIG）。

HTTP 阶段：设备先拿到“接入说明书”

XCPE 会向 \*.anyevonline\[.\]com 的相关服务发起 HTTP POST 请求，提交的硬件遥测信息包括序列号、MAC 地址、设备型号和固件版本等，JSON 数据在此阶段使用 AES 加密。

主要配置端点包括：

-   /router/config/mqtt：返回 MQTT Broker 地址、端口、认证信息和 Topic 结构
-   /router/config/acs：返回地理位置与 STUN 服务信息、文件上传地址及部分功能开关
-   /router/config/app：返回模块级配置，随后由 x.cpe 解密并交给相关组件使用

x.cpe 还导出 com.release.debug.provider 和 com.oem.share.provider 两个 ContentProvider，用于在同固件生态的系统应用之间共享运行参数、设备标识、代理配置和执行标志。这使 XCPE 不只是一个孤立的恶意包，也能成为其他组件读取远程配置的中心节点。

MQTT 阶段：设备保持在线，等待任务下发

拿到配置后，设备连接 MQTT Broker。GTIG 所分析的样本均使用 mqtt.szbboys\[.\]com，其解析地址包括 219.134.163\[.\]210 和 219.134.163\[.\]211，设备通信端口为 TCP 3885—3887。

Topic 采用以下结构：

/device/{model}/{chipId}/{action}

其中，model 是设备型号，chipId 是设备标识，action 对应安装应用、读取属性、执行命令等具体操作。NICT 在分析样本中确认了 40 种以上已定义的 MQTT action。

这里有一个容易造成误判的技术细节： **HTTP 初始配置使用 AES 加密，不代表后续 MQTT 通信也加密。** NICT 与 Plume 均指出，相关 MQTT 连接未使用 TLS，UTF-8 JSON 负载也没有额外加密。

NICT 进一步发现，设备连接 C2 时上报的 JSON 可包含 59 类字段，涉及 Google 账号邮箱、LAN/WAN IP、MAC 地址、Wi-Fi SSID、默认网关、DNS、Android 版本、CPU 与内存状态等。这些信息既描述设备，也暴露其所在网络环境。

03 从“可控制”到“可变现”

XCPE 的价值不在于长期占用一台盒子本身，而在于把设备持续转化为可调度资源。GTIG 将其后期典型结构拆分为三部分：负责通信的 x.cpe、负责执行的 com.abc.nexus，以及由其他参与方开发的变现模块。

com.abc.nexus 通过 IPC 接收 x.cpe 转发的 JSON 指令和配置，再初始化模块。模块可以以三种形态出现：随 Nexus 携带的原生 ELF 后台程序、直接编译进 Nexus DEX 的 SDK，或从远程基础设施下载的独立 APK。

部分版本还会释放 libseccomp_guard.so，通过过滤系统调用、限制跨进程干预和阻止子进程创建等方式增加沙箱与调试分析难度。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/72afbb4109af6287.png)

**图3｜com.abc.nexus 版本与模块演化（2025 年至 2026 年 6 月）**

图源：TrendAI。

第一类收入：出租家庭网络出口

GTIG 披露的住宅代理或带宽共享模块包括 Linkfog、AppSalt/Honeygain、BWM/IPWeb、GaGaNode/IPCola、NetNut/Popanet、Traffmonetizer、EarnFM 等。

这些模块可把感染设备变成代理出口，使外部流量从普通家庭或办公网络的 IP 地址发出。部分实现使用 WebSocket、UDP/QUIC、TCP 多路复用隧道或 FRP 反向隧道。GTIG 曾观察到一台设备同时运行多达三个住宅代理 SDK。

AppSalt 的一个细节尤其能说明“用户同意”是如何被绕过的：Nexus 初始化 SDK 时不展示同意界面，而是直接调用 optIn() 设置同意状态；当应用安装来源为 Google Play 时，该组件反而停止执行。

需要强调的是， **住宅代理、PCDN 或带宽共享服务本身不必然等于恶意服务。XCPE 事件中的问题在于设备被静默纳入、流量被非知情调度，用户没有获得清晰、可验证的知情同意。**

第二类收入：制造不存在的广告行为

Fission、HiddenView 等模块可在后台请求广告、触发展示追踪地址，或借助隐藏 WebView、透明窗口模拟滚动、点击、输入和播放。

以 GTIG 分析的 Fission 样本为例，其第二阶段负载无需展示真实广告画面，即可请求广告位并访问展示监测 URL，从而登记虚假展示。设备可维持表面正常使用，后台却可能正在进行另一套不可见操作。

第三类收入：继续分发其他后门

Moyu、Spirit、Bird 等模块使 XCPE 又成为其他恶意能力的分发入口。它们可继续下载阶段负载、执行动态代码，或引入剪贴板劫持、代理和广告滥用等功能。

因此，XCPE 不是一张固定功能清单，而是一条可按设备、版本和配置调整的分发链。不同样本携带的模块数量与种类并不相同，不能把全部模块行为直接套用到每一台设备上。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b8d268c76a5dc124.jpg)

**图04｜XCPE 三类变现路径与外部数据流向**

图源：依据 Google Threat Intelligence Group（GTIG）与 TrendAI 公开技术细节绘制；模块并非在所有设备上同时出现。

04 它确实能做什么，运营者又实际做过什么

从能力上看，XCPE 可通过 MQTT 执行以下任务：

-   静默安装、卸载应用
-   以 system UID 执行 Shell 命令，下载并执行脚本
-   修改 package_verifier_user_consent 为 -1，关闭 Google Play Protect 的应用校验
-   调用 Instrumentation.sendKeyDownUpSync() 注入按键
-   通过反射调用 SurfaceControl 相关隐藏 API 连续截屏，压缩为 JPEG 后经 MQTT 回传
-   收集账号信息、设备信息、已安装包清单和系统日志
-   使用 ping、traceroute、AS/WHOIS 查询等进行网络侦察
-   建立反向 Shell，下载并配置代理、广告及其他恶意模块

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd764b49318cbeea.png)

**图5｜XCPE 代理组件支持的远程操作与命令类型示例**

图源：TrendAI。

“具备能力”与“实际使用”需要分开描述。GTIG 对 C2 数据的分析显示，大多数交互与模块安装、卸载和配置有关；同时，调查人员确实观察到运营者执行过实时截屏、按键注入、敏感数据外泄、Shell 命令与脚本执行，以及建立反向 Shell 等敏感操作。

这些事实足以确认设备远程控制与数据外泄风险，但公开材料并未证明每一台感染设备都经历了全部操作，也不能据此推定所有同网其他终端均已遭到入侵。

05 2026 年 8 月后的变化：从通用加载器转向专用 Dropper

XCPE 并未停留在 x.cpe + com.abc.nexus 的固定组合。GTIG 观察到，自 2026 年 8 月起，新的 Dropper 通过 MQTT 通道安装，其出现与僵尸网络中大规模卸载 com.abc.nexus 在时间上同步。

这些新包使用 com.android.system.ntp、com.android.sso.auth.handler 等名称伪装成 Android 系统应用，通常只承载一个变现模块，例如 AppSalt。其持久化过程更加激进：

1.  释放原生 ELF 文件 libexploit.so
2.  调用 nativeAdbRoot() 和 nativeAdbShell()，将本地 adbd 重启为 root，并建立 ADB Shell 连接
3.  将 /system 重新挂载为可写，把自身复制到 /system/priv-app/
4.  在 /system/etc/permissions/ 下创建 privapp-permissions-<app name>.xml，授予 INSTALL_PACKAGES、REBOOT 等权限
5.  通过 persist.networkstack.install_time 覆盖应用时间戳，使其与系统内其他包的安装时间保持一致，形成时间戳伪装

与 Nexus 不同，这些新包不监听来自 x.cpe 的 IPC 消息，而是使用硬编码参数配置模块，再由运营者通过 MQTT 下发脚本、经 x.cpe 执行来控制。

这一变化说明，后期 XCPE 已不只是“预装通信组件 + 外部模块”的简单结构，而是能够把后续载荷进一步写入系统应用区域。对防守方而言，只检查 Nexus 是否仍存在，可能漏掉其替代形态。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1a6dd2443d716c80.png)

**图6｜2026 年 8 月后专用 Dropper 的投递、提权与系统分区持久化过程**

图源：依据 Google Threat Intelligence Group（GTIG）公开技术细节绘制；时间同步现象不等于所有设备均已完成迁移。

06 130 万、147 万、80 万：规模数字并不矛盾

多个研究团队公布的数字不同，主要因为观测窗口、数据源和统计对象不同，不能直接相加，也不能全部理解为“同一时刻在线设备数”。

|     |     |     |
| --- | --- | --- |
| 来源  | 公布数字 | 统计口径 |
| Google GTIG | 超过 130 万台 | 被纳入 XCPE 僵尸网络的设备规模 |
| Synthient | 至少 130 万台；约 50 万台每日通信 | 总量估计与每日同后端基础设施通信的设备量 |
| TrendAI | 1,472,554 台，涉及 206 个型号、170 多个国家和地区 | 2026 年 6 月 3 日至 10 月 1 日的间歇性遥测；研究团队明确表示各项数据均为下限 |
| NICT | 800,521 台唯一设备，覆盖 213 个国家和地区 | 基于 MQTT 通信中的 chipId 去重；其中日本为 1,891 台 |

TrendAI 还观测到约 133 万台设备被调度代理和广告欺诈模块。在其观测窗口内，相关住宅代理出口平均每天约有 182,025 个可用 IP，峰值为 366,562 个。这里的“设备数”“在线数”“出口 IP 数”同样是不同指标：一台设备的出口地址可能变化，一个地址也不应被简单等同为一台永久在线设备。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0be58954a96f7516.png)

**图7｜GTIG 观测到的 XCPE 全球感染分布**

图源：Google Threat Intelligence Group（GTIG）。

NICT 对日本样本的观测还提示了设备类型的多样性。其确认的 1,891 台日本境内设备中，SviCloud 9P 为 826 台，约占 44%；实机固件调查则在流媒体终端、Soundbar 和 Yaber 投影仪中确认了 XCPE 相关组件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/758bc07cac71c607.png)

**图8｜NICT 实机调查中的投影仪与零售设备**

图源：日本国家信息通信技术研究机构（NICT）。

因此，事件范围不宜只概括为“某一个品牌的某一款机顶盒”，也不宜反向扩大为“某品牌全部产品均受影响”。更稳妥的排查依据是具体型号、固件、包名、签名和网络行为的组合。

07 归因证据与需要守住的边界

GTIG 的归因结论建立在跨品牌、跨型号、跨年度固件，以及专用基础设施和持续演化的配置之上。其判断是：这不是孤立员工行为或开发疏忽，而是为经济利益进行的系统性开发、部署和运营。

Synthient 对一台 2025 年末购入的 MECOOL KM9PRO Max 进行实机分析，也给出了高置信度归因。其公开证据包括：相关域名与视壮网站曾解析到相同 IP、后门签名中出现视壮邮箱，以及基础设施文件目录中存在由视壮研发负责人签署的设备声明。

与此同时，Synthient 与 NICT 均在部分样本中发现 Skyworth Digital Technology 相关签名信息。NICT 还在 Shenzhen Skyworth Digital Technology 制造的设备固件中检测到 XCPE。另在 MECOOL KM2、KM7、KD3 以及 LEAP-S1 的相关样本中，NICT 发现其 APK 签名邮箱为 skydigital@skyworth.com。

这里必须守住证据边界： **APK 签名信息可以证明样本与特定证书或固件链条存在关联，但不能单独证明签名主体开发或运营了后门。** 对签名主体具体角色的判断，需要更多独立证据。

08 拆除控制端之后，风险为什么仍在

在此次联合行动中，Google 与日本警察厅、Lumen、HUMAN Security、Plume、Synthient、TrendAI 等合作，对 XCPE 的域名和服务器采取法律行动，同时处置了十余个经由该后门加载的恶意软件家族所使用的 C2 域名。

由于这些下游恶意软件家族还通过 XCPE 以外的渠道分发，Google 评估，此次相关 C2 处置可切断至少 1000 万台其他受感染设备的控制链路。这个数字描述的是下游生态的额外影响，不能与 XCPE 自身的 130 万台设备简单合并为同一个感染总数。

行动还包括封禁 Videostrong，以及改进认证 Android TV 设备的固件完整性审查流程。但 TrendAI 与 NICT 均指出： **基础设施被移除，只会切断运营者与设备之间的现有控制路径，不会自动删除已售设备中的植入组件。**

对普通用户，NICT 建议在确认安装 XCPE 后停止使用设备，并将其从家庭网络断开；Synthient 建议用户永久停用并处置相关设备。仅执行删除应用、恢复出厂设置或屏蔽一个域名，都不足以证明风险已经清除。

用户可以做什么

1.  先隔离。 若设备出现下文所述高置信度指标，应断开网线和 Wi-Fi，避免继续作为代理出口或接收任务。
2.  组合核查。 查看应用列表中是否出现 XCPE，结合包名、安装路径、签名、DNS 和 MQTT 连接判断；不要只凭“发热”“卡顿”或单一应用名称定性。
3.  不要把恢复出厂设置当作清除。 对确认感染的设备，优先寻求可信厂商提供的干净固件或更换设备。来源不明的第三方刷机包可能引入新的风险。
4.  减少横向暴露。 在替换前如确需保留，应将其放入独立访客网络或隔离 VLAN，禁止其访问电脑、NAS 和其他重要终端，并在网关侧阻断已核验指标。
5.  检查账号与网络异常。 关注在设备上使用过的账号是否出现异常活动，以及家庭宽带是否出现与本人使用不符的代理或滥用投诉；不要把“账号信息被收集”直接等同于“账号口令已经泄露”。

企业与机构可以做什么

-   盘点 Android TV、数字标牌、会议终端、远程医疗和其他 Android IoT 资产，将型号、固件版本、签名证书和预装包纳入资产记录
-   在 DNS、代理、防火墙和 NetFlow 中回溯相关域名、IP、端口及 MQTT Topic，保存证据后再实施阻断
-   将疑似设备从办公和生产网络隔离，必要时提取固件、APK、签名、系统属性与网络流量进行联合判断
-   对供应商提出预装软件清单、固件完整性证明、首次开机后和 OTA 后的安全复检要求
-   不把“通过认证”视为永久安全证明，也不把住宅 IP 或数据中心 IP 作为唯一的风控判断依据

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/037312fb205f19ff.png)

**图9｜XCPE 感染排查与分级处置流程**

图源：依据 NICT、Synthient 与 TrendAI 公开处置建议整理绘制；具体响应应遵循所在机构流程。

09 结语：真正需要重估的是设备信任的起点

XCPE 事件最值得警惕的，不只是后门拥有截屏、反向 Shell 或代理能力，而是这些能力被放进了设备交付和持续运营的流程里。

用户买到设备时，恶意入口可能已经存在；安全检测看到固件时，真正的变现模块可能尚未下发；控制端被拆除时，设备中的持久化组件仍可能保留。防守因此不能只看某个 APK、某次认证或某次域名封禁，而要把固件来源、首次开机行为、动态加载、长期网络连接和供应商责任放在同一条链上审视。

对一台已经确认预装后门的设备，最可靠的处置目标不是“让它暂时连不上 C2”，而是 **恢复可信固件，或彻底替换不可信硬件**。

10 技术附录

附录 A：MITRE ATT&CK 技术映射

以下映射依据公开样本行为整理，混合使用 ATT&CK Mobile 与 Enterprise 矩阵，便于同时描述 Android 设备机制和通用攻击行为。它是本文的分析归并，不代表 MITRE 已发布 XCPE 官方映射。

|     |     |     |
| --- | --- | --- |
| 技术编号 / 矩阵 | 技术名称 | XCPE 对应行为 |
| T1474<br><br>Mobile | Supply Chain Compromise | 恶意组件随设备固件预装，在用户收到设备前进入交付链 |
| T1624.001<br><br>Mobile | Event Triggered Execution: Broadcast Receivers | BootReceiver<br><br>在启动流程中运行，并从 /oem/ 恢复安装组件 |
| T1548<br><br>Enterprise | Abuse Elevation Control Mechanism | 后期 Dropper 将本地 adbd 重启为 root，再利用 ADB Shell 写入系统区域 |
| T1575<br><br>Mobile | Native API | 通过 libexploit.so 等原生库调用 nativeAdbRoot()、nativeAdbShell() 等函数 |
| T1059.004<br><br>Enterprise | Command and Scripting Interpreter: Unix Shell | 以 system UID 执行远程 Shell 命令、下载并执行 Shell 脚本 |
| T1544<br><br>Mobile | Ingress Tool Transfer | 下载 Nexus、专用 Dropper、原生 ELF、APK 和其他阶段模块 |
| T1071.001<br><br>Enterprise | Application Layer Protocol: Web Protocols | 通过 HTTP POST 获取初始配置，并按任务下载文件 |
| T1071.005<br><br>Enterprise | Application Layer Protocol: Publish/Subscribe Protocols | 使用持久 MQTT 连接接收任务、发布执行结果和设备信息 |
| T1629.003<br><br>Mobile | Impair Defenses: Disable or Modify Tools | 将 package_verifier_user_consent 设为 -1，关闭应用校验 |
| T1513<br><br>Mobile | Screen Capture | 反射调用 SurfaceControl 相关隐藏 API 截屏并回传 JPEG |
| T1082<br><br>Enterprise | System Information Discovery | 收集型号、固件、Android 版本、硬件状态、已安装包和系统日志 |
| T1016<br><br>Enterprise | System Network Configuration Discovery | 收集 LAN/WAN IP、MAC、SSID、网关、DNS，并执行网络侦察 |
| T1646<br><br>Mobile | Exfiltration Over C2 Channel | 通过 MQTT 等既有控制通道回传账号、设备、日志和截屏信息 |
| T1027<br><br>Enterprise | Obfuscated Files or Information | 使用代码与配置混淆、加密配置及分阶段负载降低静态可见性 |
| T1622<br><br>Mobile | Debugger Evasion | libseccomp_guard.so<br><br>限制调试、插桩、跨进程干预和子进程创建 |
| T1036.005<br><br>Enterprise | Masquerading: Match Legitimate Resource Name or Location | 使用系统应用风格包名，并写入 /system/priv-app/ 伪装为特权系统应用 |
| T1070.006<br><br>Enterprise | Indicator Removal: Timestomp | 通过 persist.networkstack.install_time 修改应用时间戳以匹配系统包 |
| T1572<br><br>Enterprise | Protocol Tunneling | Linkfog 等模块使用 FRP 反向隧道或其他多路复用通道转发流量 |
| T1090.002<br><br>Enterprise | Proxy: External Proxy | 将感染设备转为住宅代理出口，代表远程用户转发 TCP/UDP 流量 |

附录 B：失陷指标（IOC）

> 以下为公开研究中的代表性指标，并非完整清单。域名与 IP 已做防误触处理。IP 指标具有时效性，落地长期封禁前应结合当前解析、历史流量和业务影响复核；包名、路径和设置项也应与签名、网络行为组合判断。

B.1 核心包名与组件

|     |     |     |
| --- | --- | --- |
| 类型  | 指标  | 说明  |
| 包名  | x.cpe | 核心预装后门组件 |
| 包名  | com.oemservice | x.cpe<br><br>在部分固件中的运行名称 |
| 包名  | com.abc.nexus | 通用加载器与执行引擎，后期逐渐被专用 Dropper 替代 |
| 包名  | com.android.system.ntp | 伪装为系统应用的后期 Dropper |
| 包名  | com.android.sso.auth.handler | 伪装为系统应用的后期 Dropper，可投递 AppSalt 等模块 |
| 关联包名 | com.vs.grass | 与 Grass 变现模块相关的组件线索 |
| ContentProvider | com.release.debug.provider | 共享 C2 配置等数据 |
| ContentProvider | com.oem.share.provider | ShareProvider<br><br>，共享模块与代理配置 |
| 原生文件 | libseccomp_guard.so | Nexus 反分析与进程加固组件 |
| 原生文件 | libexploit.so | 后期 Dropper 释放的提权与 ADB 利用组件 |
| 原生文件 | libtraceroute.so | 网络侦察组件 |
| 系统属性 | persist.networkstack.install_time | 后期 Dropper 用于时间戳伪装 |
| 系统属性 | persist.networkstack.uninstall | 触发卸载和清理的控制属性 |
| 系统属性 | persist.networkstack.skip_system_install | 跳过系统分区安装、保留在 /data/app/ 的控制属性 |

B.2 文件与目录线索

/oem/ 预装 APK 的重装来源之一

/data/app/ x.cpe 的安装位置之一

/system/priv-app/ 后期 Dropper 的持久化位置

/system/etc/permissions/privapp-permissions-<app name>.xml

后期 Dropper 创建的特权权限配置

上述目录本身均为 Android 正常路径，不能单独作为感染判据；应关注其中的可疑 APK、包名、签名、创建时间和权限配置是否相互印证。

B.3 网络指标

|     |     |     |
| --- | --- | --- |
| 类型  | 指标  | 用途或备注 |
| 域名  | anyevonline\[.\]com、\*.anyevonline\[.\]com | HTTP bootstrap、配置与文件基础设施 |
| 域名  | extstb\[.\]anyevonline\[.\]com | Synthient 实机观测到的初始通信域名 |
| 域名  | file\[.\]anyevonline\[.\]com | 文件与后门相关目录，观测端口为 TCP 8000 |
| 域名  | mqtt\[.\]szbboys\[.\]com | 核心 MQTT Broker |
| 域名  | ott\[.\]szbboys\[.\]com | 早期 C2、文件上传及服务器池配置 |
| 域名  | tms\[.\]szbboys\[.\]com、ota\[.\]szbboys\[.\]com | 早期版本相关基础设施 |
| URL | hxxp://ott\[.\]szbboys\[.\]com:8000/cpe/file/upload | 文件、日志或诊断数据上传端点 |
| IPv4 | 219\[.\]134\[.\]163\[.\]210 | mqtt\[.\]szbboys\[.\]com<br><br>解析地址 |
| IPv4 | 219\[.\]134\[.\]163\[.\]211 | mqtt\[.\]szbboys\[.\]com<br><br>解析地址 |
| IPv4 | 38\[.\]145\[.\]197\[.\]135 | 运营者控制的文件服务器 |
| IPv4 | 23\[.\]94\[.\]49\[.\]57 | 运营者控制的文件服务器 |
| 历史仓库 | hxxps://github\[.\]com/Aviciiii/ott | 载荷、固件及相关文件分发仓库；当前可用性可能变化 |
| 端口  | TCP 8000 | HTTP 配置与文件服务 |
| 端口  | TCP 3885、3886、3887 | 感染设备使用的非标准 MQTT 端口 |

Plume 还公开了以下补充基础设施观测，可用于扩展历史流量狩猎：

|     |     |     |
| --- | --- | --- |
| 类型  | 指标  | 说明  |
| 域名 / IP | usamqtt\[.\]szbboys\[.\]com<br><br>/ 38\[.\]145\[.\]197\[.\]30 | YOKATV 相关 MQTT 部署 |
| 域名 / 端口 | tms\[.\]yokatvonline\[.\]com:8443 | YOKATV 相关配置服务 |
| 域名 / IP | vstms\[.\]tv2consulting\[.\]com<br><br>/ 192\[.\]188\[.\]183\[.\]111 | TV2 Consulting 相关配置与 MQTT 部署 |

Broker 节点还曾开放 TCP 8082、8083 和 18083，分别对应 HTTP REST、WebSocket 与 EMQX 管理控制台。 **这些端口主要是基础设施调查线索，不应直接解释为每台感染设备都会产生相应出站连接。**

B.4 代表性 SHA256

|     |     |
| --- | --- |
| 组件或文件 | SHA256 |
| x.cpe | 3768f470934a111f1c3e3d098eb1392a3cb6f3e298ef5fd2a6309e6a98ee1e18 |
| com.oemservice | 350d6db477e8567cf9347c1144b3a0b25550e7ce63bb800b056b8a7a8ef56af4 |
| com.abc.nexus | 1f2ab93c35f0c37d9b88f82268183a2f77491aa6b142a48381524b18e217b960 |
| libseccomp_guard.so | b3690b3b013ac60752a6d05c3f53ea1f3e844d4603c5b90d258a30c596d0691b |
| com.android.sso.auth.handler | ebcca22b96f7a30ae155efa2f25af29a369c6e9cfc99cb3bb0b72f35bc5528ed |
| libexploit.so | 42be8f18d6006ca092de191331d38e70a0d8383db701a759466dec59a0986135 |
| libnative_keys.so | 7830ce3c3222dd9b25a77a16116dcf832a24b4b9a0bc998501e12415a828fb42 |

> 完整样本哈希、证书指纹、SDK 标识及受影响型号清单可持续查阅 Synthient 公共研究仓库。

B.5 设备与型号线索

以下为公开研究中提到的实机分析、签名关联或网络观测线索，不是完整受影响清单，也不表示相应品牌的全部产品均受影响。

|     |     |
| --- | --- |
| 设备或型号 | 公开研究中的确认方式 |
| MECOOL KM9PRO Max | Synthient 购入实机并发现预装 com.oemservice |
| MECOOL KM2、KM7、KD3，以及 LEAP-S1 | NICT 分析的相关样本带有 skydigital@skyworth.com 签名信息 |
| COOCAA LEAP-S1、MECOOL KD3 | NICT 实机固件调查确认 XCPE 相关预装组件 |
| SviCloud 9P | NICT 日本境内 MQTT 观测中数量最多的型号 |
| Soundbar、Yaber 投影仪 | NICT 实机固件调查确认 XCPE 相关预装组件 |

附录 C：检测与狩猎建议

**C.1 设备侧检查示例**

以下命令适用于具备合法 ADB 调试条件的技术人员。不同固件的权限和返回结果可能不同，命令无输出不等于设备安全。

\# 检索核心包名与后期 Dropper

adb shell pm list packages | grep -E \\

'x\\.cpe|com\\.oemservice|com\\.abc\\.nexus|com\\.android\\.system\\.ntp|com\\.android\\.sso\\.auth\\.handler'

\# 查看可疑包的安装路径与详细信息

adb shell pm path com.oemservice

adb shell dumpsys package com.oemservice

\# 检查 /oem/ 与特权系统应用目录

adb shell ls -l /oem

adb shell ls -l /system/priv-app

\# 查看应用校验相关设置

adb shell settings get global package_verifier_user_consent

在本事件样本中，package_verifier_user_consent=-1 与关闭应用校验有关，但该设置不应脱离设备基线单独用于定性。NICT 调查的部分设备会在 Android 应用列表中直接显示“XCPE”，这一特征也不能假定存在于所有固件。

**C.2 网络侧狩猎重点**

-   查询 anyevonline\[.\]com、szbboys\[.\]com 及其子域名的历史 DNS 与代理解析记录
-   排查通往上述历史 IP 的 TCP 3885—3887 长连接，以及异常 MQTT 会话
-   检索 /router/config/mqtt、/router/config/acs、/router/config/app 和 /cpe/file/upload 等 URI
-   在可解密或可见流量中检索 /device/{model}/{chipId}/{action} 形式的 Topic，以及 ext/lib/config、function/cmd/read、function/script、properties/report 等 action
-   将告警与设备资产、固件版本和包名结果关联，避免只凭共享 IP、域名泛匹配或单一端口造成误报

**C.3 响应优先级建议**

**高置信度命中包名或样本哈希：** 立即隔离设备，保存固件与日志，评估替换或可信重刷；不要仅结束进程后继续投入使用。

**命中历史网络指标但无设备侧证据：** 回溯连接主体与时间，核对当前 DNS 解析和资产归属，再决定是否封禁及开展固件核查。

**只有非特异现象：** 例如发热、卡顿、上行流量增加，只能作为排查起点，不能据此认定感染 XCPE。

11 参考链接

**1\. Google Threat Intelligence Group：Shutting the Door on the XCPE Botnet**  
https://cloud.google.com/blog/topics/threat-intelligence/shutting-the-door-on-the-xcpe-botnet

**2\. Synthient：The Internals of a Badbox Operation**  
https://synthient.com/blog/the-internals-of-a-badbox-operation

**3\. Synthient：XCPE / Videostrong 公共 IOC 与样本仓库**  
https://github.com/synthient/public-research/blob/main/2026/11/Videostrong/README.md

**4\. NICT：XCPE マルウェアの解析と国内における観測実態**  
https://blog.nicter.jp/2026/11/xcpe_campaign/

**5\. TrendAI：TrendAI Research Helps Disrupt Botnet of More Than 1.3 Million Pre-Infected Set-Top Boxes**  
https://www.trendaisecurity.com/en-us/resources-insights/trendai-security-blog/trendaitm-research-helps-disrupt-android-tv-botnet-of-more-than-13-million-pre-infected-devices

**6\. Plume：The X.CPE Botnet**  
https://cdn.plume.com/3d/92/f7c576bd4afabd79df4e7b39ca7f/xcpe-botnet-whitepaper-10-2026.pdf

**7\. MITRE ATT&CK Mobile Matrix**  
https://attack.mitre.org/matrices/mobile/

**8\. MITRE ATT&CK：Application Layer Protocol: Publish/Subscribe Protocols（T1071.005）**  
https://attack.mitre.org/techniques/T1071/005/

安全事件分析研判 · 目录
