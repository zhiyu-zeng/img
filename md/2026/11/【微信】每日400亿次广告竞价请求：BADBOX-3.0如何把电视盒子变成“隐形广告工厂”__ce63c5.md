---
title: 【微信】每日400亿次广告竞价请求：BADBOX 3.0如何把电视盒子变成“隐形广告工厂”
source: https://mp.weixin.qq.com/s/ilbpJ8tEtCYkoba4rrtedA
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T11:00:42+08:00
trace_id: 056153dc-ffa5-4c4f-a071-7f681596b230
content_hash: 725b4f10e253e0b7513e3302c4a7df0fcb15c8572a9a23c8dbf101977f3096bf
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 42375244-d011-81d6-8588-dda467708267
ioc: null
---

**奇安信威胁情报中心** *2026年11月23日 17:00*

威胁情报 · 广告欺诈 · 住宅代理

每日 400 亿次广告竞价请求：  
BADBOX 3.0 如何把电视盒子变成“隐形广告工厂”

BADBOX 3.0为迄今公开竞价量最大广告欺诈行动，峰值每日约400亿次竞价请求。

· BADBOX 3.0　· CTV 广告欺诈　· 住宅代理　· 2026.11.23

屏幕上没有广告，设备却在播放视频广告；合法应用没有运行，广告请求却挂着它的名字；家庭宽带仍在正常使用，出口 IP 却可能已被接入住宅代理网络。BADBOX 3.0 真正值得关注的，不只是感染量或广告请求量，而是一套把设备、应用身份和家庭网络资源同时商品化的模块化运营体系。

2026 年 11 月 18 日，HUMAN Security 旗下 Satori 威胁情报与研究团队披露 BADBOX 3.0。该活动在高峰期每天产生约 **400 亿次广告竞价请求，** 占 Human Defense Platform 观测到的全部 CTV 流量的 **4% 以上，** 日竞价请求量超过此前纪录保持者 VASTFLUX 的三倍。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68e15b012e78469a.png)

**图1｜公开广告欺诈行动日竞价请求量对比**

图源：HUMAN Security Satori

01 事件速览：这次到底发生了什么

|     |     |
| --- | --- |
| 维度  | 核心信息 |
| 主要受害载体 | 低成本、非知名品牌、未经认证的 AOSP 设备，尤其包括 CTV 机顶盒；并非 Android TV OS 设备，也未通过 Play Protect 认证 |
| 初始立足点 | 伪装成系统应用的新后门，内置模块获取与日志上报端点 |
| 核心交付机制 | C2 下发结构化模块清单，设备再从公共代码仓库、备用平台、文件服务器及公共 CDN 拉取载荷 |
| 两类主要载荷 | 隐蔽视频广告欺诈模块；住宅代理注册与投递模块 |
| 广告侧规模 | 高峰期约 400 亿次竞价请求/日，占 HUMAN 平台观测 CTV 流量的 4% 以上 |
| 代理侧规模 | 可将设备接入 10 个商业代理服务及运营者自己的 PXYEDGE 网络 |
| 其他欺诈形式 | 伪造服务器端广告插入（SSAI）流量；这类流量不需要真实受感染设备 |
| 关联线索 | HUMAN 通过 C2、域名、设备属性、预装启动器及仓库历史，将模块目录与电子产品制造商 TXCZ 关联 |
| 协同处置 | Google 主导的 XCPE 处置行动涉及多个承载 BADBOX 3.0 部分功能的 C2 域名，但 XCPE 与 BADBOX 3.0 并非同一事件 |

BADBOX 3.0 的关键变化，是运营者把持续维护的“模块目录”放到了公开可访问的代码托管体系中。广告欺诈和代理劫持不再只是两个孤立样本的功能，而成为可以按设备选择、按版本更新、按通道切换的后端能力。

02 屏幕一切正常，广告却在“看不见的地方”播放

BADBOX 3.0 的广告欺诈并不是传统意义上的弹窗广告。恶意模块会加载合法的视频广告 SDK，并在用户不可见的窗口中渲染视频广告；在一个样本中，播放器被设为透明并放置在屏幕可视区域之外。设备收到真实广告活动和素材，用户看到的却是正常界面。

HUMAN 分析的一个样本中，名为 com.android.systemsafe 的系统应用通过 com.speed.adv 广告包加载三个不同的 VAST 视频广告 SDK。另一个冒充“GoogleAd”的系统应用暴露了 com.google.AdActivity 活动，包含两条路径：

-   showAd：播放可见、非静音的视频广告；
-   showHideWindowAd：启动后台服务，通过隐藏视图渲染广告。

第二条路径完整存在于代码中。HUMAN 在测试环境中没有收到对应广告配置，推测可能与设备指纹识别或服务端定向投放有关；但在受感染实验设备上，研究人员关闭隐藏逻辑后，原本不可见的广告随即出现在屏幕上。

**这里的核心不是“伪造一次广告点击”，** 而是 **让真实广告在无人观看的环境中完成请求和渲染。**

03 流量假象：设备、应用与网络的三层包装

1\. 设备侧：少数廉价 AOSP 设备贡献异常集中的流量

高流量主要集中在少数低成本、未经认证的 AOSP 设备型号上。这些设备几乎只向某一族被冒用应用发送请求，与正常 CTV 设备通常访问多种应用的行为分布明显不同。

2\. 应用身份：官方应用没有运行，请求却使用它的名字

被冒用的合法应用并不需要安装，更没有在受感染设备上运行。恶意程序直接联系这些官方应用使用的广告服务器，并模仿官方应用的通信方式，从而获得相似的广告配置与素材。最终发出的竞价请求携带合法应用名称，下游供应链看到的便像是发生在该应用内部的广告机会。

HUMAN 对其中一个被冒用应用及其适配硬件进行了测试，未发现恶意行为。换言之， **被冒用身份不等于官方应用被植入恶意代码。** 恶意应用还发送硬编码的归因参数，使广告服务器将流量归到运营者一侧；这些恶意应用与被冒用应用之间没有业务关系，也不会出现在后者的 sellers.json 或 app-ads.txt 中（存在这些文件时）。

3\. 网络身份：住宅代理让机器流量看起来像家庭观看

对某一个被冒用应用身份，HUMAN 观察到约 40% 的整体请求、以及约 80% 的美国请求来自被标记为住宅代理出口的 IP 地址。不同应用身份的请求还会共用 IP 地址。与此同时，流量每天在近乎相同的时间突然上升；其中一个被冒用应用身份下，几乎所有流量都报告了来自内部测试版本的浏览器标识，这显然不是消费级电视的正常特征。

住宅 IP、知名应用和完整视频广告组合在一起，使流量在广告供应链中呈现为“优质 CTV 库存”。但从设备型号集中度、代理出口占比、跨应用共享 IP、时间节律和浏览器标识看，它又具有高度一致的自动化特征。

此外，HUMAN 还观察到伪造 SSAI 流量通过许多相同供应路径变现。请求声称 SSAI 服务器已在观看者的视频流中插入广告，但对应设备并不存在，广告也从未加载。

**这部分 SSAI 伪造流量并不依赖受感染设备，不能与设备端广告欺诈混为一谈。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bff7d4d10d5cb1a1.jpg)

**图2｜BADBOX 3.0 隐蔽广告欺诈与身份冒用过程图**

图源：根据 HUMAN Security Satori 团队公开的 BADBOX 3.0 技术细节整理绘制

04 真正的中枢：一份可持续更新的“恶意模块目录”

BADBOX 3.0 的调查起点，是一个伪装成系统应用的后门。它硬编码了两个端点：一个用于在后台获取待加载模块列表，另一个用于日志记录。沿着模块加载端点，HUMAN 找到了公共代码仓库中的载荷集合，其中既有 BADBOX 和 BADBOX 2.0 时期出现过的模块，也有新的投递器、住宅代理模块和广告欺诈模块。

受感染设备上线后，C2 返回的不是一条简单下载地址，而是一份结构化清单。每条记录可以包含：

-   模块名称、内部标识和版本；
-   需要调用的类与方法；
-   运行所需参数；
-   主下载地址及一个或多个备用地址。

这意味着运营者可以先决定“哪台设备运行什么”，再由设备按清单获取载荷。多数目录条目与住宅代理及其投递器有关；广告欺诈模块数量较少，却贡献了 BADBOX 3.0 最大的流量部分。部分广告样本与代理模块还共同使用 api.drgdj\[.\]top 这一模块加载后端。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/397fae93a9674818.png)

**图3｜C2 返回模块清单及主备下载地址**

图源：HUMAN Security Satori

模块类名采用 com.google.system.\* 命名以混入系统进程，部分代码经过混淆。到 2026 年初，模块清单的版本计数已达到 550 左右；HUMAN 分析时，较新模块的杀毒覆盖几乎为空。目录中还包含多个 vo1d 模块，这与 BADBOX 2.0 时期 BB2DOOR 和 vo1d 共享修改版 Android 原生库的线索相互呼应，但不能据此把 BADBOX 3.0 整体简单等同于 vo1d。

多活投递：删掉一个仓库，并不等于切断供应链

这套投递体系包含多层安排：

1.  公共代码仓库作为主要载荷来源；
2.  另一代码平台与运营者控制的文件服务器作为备份；
3.  部分载荷再由公共开源 CDN 自动镜像；
4.  自建 GitHub 代理 gh.drgdj\[.\]top 利用 Cloudflare Workers，从可访问仓库的服务器拉取文件并转发给设备，以绕过针对仓库的网络封锁。

公共 CDN 公布的统计为观察投递活动提供了一个局部参照：单个仓库镜像在一个月内处理了 **367,023 次请求，** 传输约 **482.7 GB**，平均每次约 1.31 MB，与模块大小相符。但这些请求不是独立设备数，其中还包括研究人员和扫描器；更重要的是，它只覆盖一个仓库的一条备用通道。

仓库历史同样显示出持续运营特征：较旧仓库创建于 2023 年 11 月底，即初代 BADBOX 披露后的数周内；它在 2026 年 1 月最后一次更新，同一天第二个仓库创建并开始频繁更新。这一“旧仓库停更、新仓库同日接手”的交接特征，更像是计划内迁移，而非运营中断。

05 住宅代理不是附属品，而是另一套变现网络

BADBOX 3.0 的另一类核心载荷是代理劫持（proxyjacking）：在设备所有者不知情、未同意的情况下，把设备注册为住宅代理出口。设备所有者承担带宽成本，代理服务则向其他客户出售对这些家庭 IP 的访问能力。

目录中的模块可将设备接入 10 个商业代理服务：

Pawns、Earn、Packet、GaGaNode、HoneyGain、Repocket、Bright、Cashraven、MystNodes、Infatica

第 11 个网络是 PXYEDGE。HUMAN 认为它是 BADBOX 2.0 中 IpMoYu 网络的更名后继者，依据包括基础设施复用、代理模块谱系延续以及任务服务器重叠。

其中一条关键线索是代理模块 myic。该模块自初代 BADBOX 调查起便与相关运营者关联，并有数据表明其曾直接向 IpMoYu 提供节点。2026 年 3 月首次出现的第 66 版保留原有功能，同时加入新的代码混淆。PXYEDGE 域名于 2026 年 3 月 15 日注册，网站报告约 20 万个可用节点；HUMAN 通过公开可访问的监控服务器测得，所有受监测服务的独立连接峰值约 34 万，服务器命名所显示的集群编号至少达到 43 个。这些数字分别描述服务侧报告的可用节点、监测连接和集群规模，不能直接换算为 BADBOX 3.0 感染设备数。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/305fef7769311b9b.png)

**图4｜代理服务后端拒绝可疑注册尝试**

图源：HUMAN Security Satori

住宅代理与广告欺诈在同一批设备上形成配合：代理模块提供看似普通的家庭网络出口，广告模块再借助这些出口，让自动化 CTV 流量更接近正常家庭观看。HUMAN 在 IpMoYu 地址上观察到大量冒用某一合法应用身份的流量，正是两条业务线交汇的直接体现。

需要区分的是，住宅代理技术本身并不必然恶意；恶意点在于未经用户同意劫持设备与家庭连接，以及利用这一通道隐藏自动化欺诈和其他攻击的来源。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57efe4b1fb646f5e.jpg)

**图5｜BADBOX 3.0 住宅代理劫持与双重变现过程图**

图源：根据 HUMAN Security Satori 团队公开的 BADBOX 3.0 技术细节整理绘制

06 TXCZ 关联链：不是一条域名，而是五组相互印证的线索

HUMAN 将 BADBOX 3.0 模块目录与 TXCZ 关联，依据并非单一 WHOIS 信息或一次 IP 解析，而是以下多组技术与运营痕迹。

1\. C2 命名与通信路径重合

模块分发后端使用 drgdj\[.\]top，其 URL 包含 /dd/cc2 路径。TXCZ 自有品牌网站的设备通信中出现一致的 /dd/cc 命名形式。承载多个 TXCZ 网站的 IP 还曾接收早期模块直接连接：47.113.90\[.\]237:8081/dd/cc。

2\. TXCZ 域名同时提供载荷与广告配置

shzhtxcz\[.\]com 为设备提供 APK 主、备下载路由；其子域 api.shzhtxcz\[.\]com 还向广告欺诈样本提供隐藏广告配置，路径为 /videoadmin/api/advertisement/getByModel。

3\. 模块明确检查 TXCZ 设备环境

TXCZ 设备预装具有系统权限的启动器 com.shzhtxcz.txbox。相关模块在运行前检查 ro.txcz.model、persist.sys.txcz.adopen1 等 TXCZ 特定构建属性，样本中的混淆包名经两步还原后也指向该启动器。这说明代码针对特定设备环境进行了适配。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f840e6613a927b9f.png)

**图6｜BADBOX 3.0 模块检查 TXCZ 设备属性**

图源：HUMAN Security Satori

4\. 仓库账户与已删除文件留下运营痕迹

一个分发广告欺诈启动器的仓库，其账户名包含“TXCZ”。HUMAN 还从版本历史中恢复了已删除文件，其中一份是按设备型号和固件版本整理的活跃 TXCZ 设备分发清单。

5\. 维护者关联

Satori 团队进一步将维护模块列表的一名威胁行为者与 TXCZ 联系起来。

这些证据支持的是 **模块目录及其基础设施与 TXCZ 的关联，** 不能把它简化为“所有 TXCZ 设备均已感染”，也不应将 TXCZ 与 Google 在 XCPE 事件中点名的另一家厂商 Videostrong 混为一谈。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1754ca07c37703ce.jpg)

**图7｜BADBOX 3.0 调查与 TXCZ 关联分析过程图**

图源：根据 HUMAN Security Satori 团队公开的 BADBOX 3.0 技术细节整理绘制

07 从 BADBOX 到 3.0：基础设施会重建，变现能力会迁移

BADBOX 家族的发展并不是简单更换恶意软件名称，而是不断调整立足点和交付方式。

|     |     |
| --- | --- |
| 阶段  | 关键特征 |
| BADBOX（2023） | HUMAN 观测到超过 74,000 台受感染设备；低成本 AOSP 手机、平板和 CTV 盒子在制造至转售之间的某个环节被植入基于 Triada 的固件后门，PEACHPIT 承担广告欺诈变现 |
| BADBOX 2.0（2025） | BB2DOOR 提供持久化高权限访问，支持点击欺诈、两类广告欺诈和 IpMoYu 住宅代理；HUMAN 观测到相关活动覆盖 222 个国家和地区，并识别出四个相互协作的威胁行为者团体 |
| BADBOX 3.0（2026） | 新后门与持续维护的公共代码仓库目录结合，投递通道多活化；隐藏视频广告重新成为流量核心，PXYEDGE 延续 IpMoYu 代理业务 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ba33d47a41235805.png)

**图8｜BADBOX 家族基础设施与模块关系图**

图源：HUMAN Security Satori

与 BADBOX 3.0 调查并行，HUMAN 还参与了由 Google 主导的 XCPE 处置行动，合作方包括 Plume、TrendAI、Lumen 和 Synthient。Google 披露 XCPE 涉及超过 130 万台机顶盒，HUMAN 称相关设备分布在 200 多个国家和地区。XCPE 处置行动同时打击了多个承载 BADBOX 3.0 部分功能的 C2 域名。

**但两者不能画等号：XCPE 是独立但相关的调查，Google 将其与 Videostrong 关联；BADBOX 3.0 则由 HUMAN 围绕另一套模块目录展开，并将其与 TXCZ 关联。** 联合处置打击了部分相关 C2 基础设施，却不等于所有受感染设备已经完成清除。

08 检测与防护：不要只盯着“恶意应用名单”

对家庭和个人用户

-   优先选择可信品牌，并检查设备是否通过 Play Protect 认证；
-   只从官方应用市场下载应用，谨慎使用来源不明的固件、IPTV 应用和系统更新包；
-   如果设备持续出现异常流量、莫名后台活动或其他难以解释的行为，应将其断网并考虑停用、更换；
-   不要因为被冒用的是知名应用，就误以为该应用官方版本必然存在问题。

对企业与网络防守团队

-   将办公网络中的机顶盒、数字标牌及其他 Android IoT 设备纳入资产清单，识别非认证 AOSP 设备；
-   对访客、消费 IoT 与办公终端实施网络分区，限制不必要的东西向访问和出站连接；
-   使用文末指标回溯 DNS、代理、防火墙和 NetFlow 日志，重点关注系统应用访问模块清单端点后，再从代码仓库、CDN 或备用文件服务器下载 APK、JAR 等载荷的组合行为；
-   将设备型号、应用身份、住宅代理出口、目的 IP 共享情况和访问时间节律联合起来研判，避免只依赖单一 IP 信誉；
-   对命中云存储、代码托管或公共 CDN 的告警结合完整域名、端口、URL 路径和终端类型复核，不宜把托管平台整体等同于恶意基础设施。

对广告平台与供应链安全团队

-   检查设备型号与应用分布是否异常集中，识别“少量设备只服务单一应用族”的模式；
-   监测住宅代理出口占比、不同应用身份共享 IP、每日固定时段突增及内部测试浏览器标识；
-   核验流量声明方与 sellers.json、app-ads.txt 中的授权关系，同时结合竞价前和竞价后检测；
-   不要按被冒用应用名称一刀切封禁，因为官方应用本身可能完全正常，检测对象应是伪造流量及其行为特征。

09 结语

BADBOX 3.0 展示的不是一次简单的“恶意软件复活”，而是一套运营条件的延续：受感染设备仍在，模块可以持续更新，公共仓库和 CDN 提供冗余，代理网络更名后继续运行，合法应用身份则被用来包装无效流量。

因此，打击 C2 和清理仓库是必要动作，但并不等于消除产生这类活动的基础。只要设备供应链、模块交付链和流量变现链仍能重新连接，BADBOX 家族就仍可能以新的名称和新的基础设施出现。

10 技术附录

附录 A：MITRE ATT&CK 技术映射

以下映射沿用 HUMAN Satori 团队披露的技术编号，并按事件中的实际行为重新整理说明。

|     |     |     |     |
| --- | --- | --- | --- |
| 技术编号 | 技术名称 | 战术  | BADBOX 3.0 中的对应行为 |
| T1071.001 | Application Layer Protocol: Web Protocols（应用层协议：Web 协议） | 命令与控制 | 后门及广告样本通过 Web 端点获取模块清单、提交日志、请求广告配置，并与任务服务器通信 |
| T1105 | Ingress Tool Transfer（传入工具传输） | 命令与控制 | 设备依据 C2 清单，从公共代码仓库、备用代码平台、文件服务器或 CDN 下载代理、加载器和广告欺诈模块 |
| T1573 | Encrypted Channel（加密通道） | 命令与控制 | 模块下载器 C2 涉及加密二级载荷的传输与投递 |
| T1608.001 | Stage Capabilities: Upload Malware（准备能力：上传恶意软件） | 资源开发 | 运营者预先将恶意模块上传至公共代码仓库，并借助多平台镜像和公共 CDN 建立可替换的投递资源 |
| T1407 | Download New Code at Runtime（运行时下载新代码） | 防御规避 | Android 后门在运行过程中获取新的 DEX/JAR 等代码模块，使功能不必全部包含在初始应用中 |
| T1406 | Obfuscated Files or Information（混淆文件或信息） | 防御规避 | 样本使用代码混淆，部分包名经过轻度混淆，增加静态分析和识别难度 |
| T1620 | Reflective Code Loading（反射式代码加载） | 防御规避 | 模块清单指定待调用的类和方法，下载后的代码被动态加载执行，运行逻辑与初始应用分离 |
| T1104 | Multi-Stage Channels（多阶段通道） | 命令与控制 | 设备先连接 C2 取得模块与参数清单，再经主备地址从不同托管平台取得载荷，任务下发与文件投递分阶段完成 |

附录 B：无效流量（IVT）分类映射

|     |     |
| --- | --- |
| IVT 分类 | 对应行为 |
| False Representation（虚假陈述） | 冒用合法 CTV 应用身份，伪造、误导或虚构流量属性；伪造 SSAI 请求，声称并不存在的设备已加载广告 |
| Automated Browsing（自动化浏览） | 恶意模块自动请求并渲染隐藏视频广告，流量呈现固定时间节律、测试浏览器标识等自动化特征 |

附录 C：失陷指标（IOC）

以下指标按 HUMAN 公开清单整理，保留 \[.\] 去武器化格式。建议用于历史日志回溯与关联分析；排查时应结合角色、端口、路径和设备行为，而不是仅凭单次命中下结论。

C2 与载荷托管

|     |     |
| --- | --- |
| 指标  | 角色  |
| api.drgdj\[.\]top | 后门获取模块列表及日志上报端点；广告欺诈样本使用的模块加载后端 |
| file.drgdj\[.\]top | 运营者控制的载荷托管服务器 |
| gh.drgdj\[.\]top | 自建 GitHub 代理，用于绕过针对仓库的网络封锁 |
| drgdj\[.\]top | 上述基础设施的父域 |
| api.pixelpioneerss\[.\]com | 模块 C2 |
| bur.thedynamicleap\[.\]com | 模块 C2 |
| 47.113.90\[.\]237:8081 | 早期 C2；已知路径包括 /dd/cc |

广告欺诈与模块下载

|     |     |
| --- | --- |
| 指标  | 角色  |
| adv.speed25\[.\]top:6789 | com.speed.adv<br><br>样本的广告行为管理 |
| 39.108.226\[.\]196:8801 | 模块下载器 C2，涉及加密二级载荷 |
| 47.106.197\[.\]183:8802 | 模块下载器 C2，涉及加密二级载荷 |
| ad3g\[.\]com | 广告欺诈与任务下发 C2 |
| moyu88\[.\]xyz | 广告欺诈与任务下发 C2 |
| ziyemy\[.\]shop | 广告欺诈与任务下发 C2 |
| terrtest.oss-cn-hangzhou.aliyuncs\[.\]com | 广告欺诈模块访问的云存储端点 |
| api.shzhtxcz\[.\]com |     |

PXYEDGE 及相关基础设施

|     |     |
| --- | --- |
| 指标  | 角色  |
| pxyedge\[.\]com | PXYEDGE 服务站点，域名注册于 2026 年 3 月 15 日 |
| 129.227.67\[.\]234 | 命令服务器；同时列入 myic 服务器 |
| 128.14.141\[.\]107 | 数据面中继，与 BADBOX 共享 |
| 128.14.201\[.\]106 | 数据库／状态服务器 |
| 128.14.207\[.\]34 | 代理角色；此前曾被观测为 BADBOX 任务服务器 |
| 128.14.207\[.\]18 | 消息队列 |
| 107.151.239\[.\]17 | 前端、API 与管理 |
| 107.151.248\[.\]132 | myic 服务器 |
| 128.14.209\[.\]54 | myic 服务器 |
| 128.14.210\[.\]58 | myic 服务器 |
| 128.14.211\[.\]172 | myic 服务器 |
| 165.154.199\[.\]119 | myic 服务器 |
| 165.154.202\[.\]29 | myic 服务器 |
| 165.154.239\[.\]242 | myic 服务器 |
| 165.154.254\[.\]58 | myic 服务器 |
| 199.190.45\[.\]202 | myic 服务器 |
| 23.251.108\[.\]30 | myic 服务器 |
| 80.209.241\[.\]40 | myic 服务器 |

附录 D：样本与设备分析线索

以下内容适合作为样本聚类、设备排查和威胁狩猎线索，不应单独作为网络封禁指标。

|     |     |     |
| --- | --- | --- |
| 类型  | 线索  | 说明  |
| 模块文件 | admoyu_dex.jar | 包含与早期 MoYu 广告欺诈模块相关的 Java 类引用 |
| Java 类 | com.ast.sdk、com.m.s.a.admy、com.mo.gd.inter.SDKMain | HUMAN 在早期研究中识别的 MoYu 广告欺诈模块类 |
| 系统应用包名 | com.android.systemsafe | 通过 com.speed.adv 加载多个 VAST 视频广告 SDK 的样本 |
| 广告包 | com.speed.adv | 与隐藏广告样本相关的广告包族 |
| 活动名称 | com.google.AdActivity | 冒充“GoogleAd”的样本暴露的广告活动，包含 showAd 与 showHideWindowAd 路径 |
| 预装启动器 | com.shzhtxcz.txbox | TXCZ 设备上的系统级 CTV 启动器，相关模块对其进行了针对性引用 |
| 设备属性 | ro.txcz.model、persist.sys.txcz.adopen1 | 模块运行前检查的 TXCZ 特定构建属性 |
| 命名特征 | com.google.system.\* | 恶意模块用于混入系统进程的类名命名方式 |
| 代码与样本关联字符串 | Chihi | 在初代 BADBOX、BADBOX 2.0 及部分 BADBOX 3.0 广告样本中出现的关联线索 |
| 代理模块 | myic | 与 IpMoYu／PXYEDGE 节点供应和基础设施关联的代理模块 |

11 参考链接

1.  HUMAN Security（2026-11-18）：Satori Threat Intelligence Disruption: BADBOX 3.0 Hides the Largest Ad Fraud Operation Ever Disclosed Inside Infected TV Boxes  
    https://www.humansecurity.com/learn/blog/satori-threat-intelligence-disruption-badbox-3-0-hides-the-largest-ad-fraud-operation-ever-disclosed-inside-infected-tv-boxes/
2.  Google Threat Intelligence Group（2026-11-02）：Shutting the Door on the XCPE Botnet  
    https://cloud.google.com/blog/topics/threat-intelligence/shutting-the-door-on-the-xcpe-botnet
3.  HUMAN Security（2025-03-05）：Satori Threat Intelligence Disruption: BADBOX 2.0 Targets Consumer Devices with Multiple Fraud Schemes  
    https://www.humansecurity.com/learn/blog/satori-threat-intelligence-disruption-badbox-2-0/
4.  HUMAN Security：Unpacking BADBOX  
    https://www.humansecurity.com/company/satori-threat-intelligence/badbox/
5.  Doctor Web（2024-09-12）：Void captures over a million Android TV boxes  
    https://news.drweb.com/show/?i=14900
6.  Kaspersky（2026-08-20）：Kaspersky discovers a malware campaign targeting car head units  
    https://www.kaspersky.com/about/press-releases/kaspersky-discovers-a-malware-campaign-targeting-car-head-units
7.  MITRE：ATT&CK® 知识库  
    https://attack.mitre.org/

本文已发布于NCC国家网络安全云社区https://nccsec.cn/security-community

安全事件分析研判 · 目录
