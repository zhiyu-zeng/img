---
title: 【微信】OPTIMJACK事件：178家组织的受信任脚本，如何变成窃密入口
source: https://mp.weixin.qq.com/s/WUITkKDnSkyIjY_c5x5KWw
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T13:15:16+08:00
trace_id: f804b5bb-e703-404a-b92f-2d7fe6a36500
content_hash: 458117671c14ebdb12e83468393bbefb7eb53f9374ccc04b156d64fbead04e47
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
notion_page_id: 41d75244-d011-813e-ad8d-f06d3a244c89
ioc:
  cves: []
  cwes: []
  hashes:
    - 617df364120adc47fb4f55dcc0c69a9b6c9e108a92c60bc2b64a266254ab02f3
    - 814a963c0da480e2449d9b6664480156e1cd6d731014117401bf635badec3a0f
    - c2a34c579e4c2e8802752c93b3a9cca0230610f3e4dd6688f4272459c7c7c162
    - c4026b06d82b0f0b363eda0642d61cfbdc17884e
    - f7b84b9a94f749f8ced3f0112d0a66894e8bbc3b4aa5592021d1b8976a9bad40
  domains: []
  tools: []
  techniques: []
---

**奇安信威胁情报中心** *2026年11月18日 13:00*

供应链攻击 · 前端安全 · 事件复盘

OPTIMJACK 事件：  
178 家组织的受信任脚本，如何变成窃密入口

一段用于网站实验与个性化展示的第三方 JavaScript，被写入恶意代码后，沿既有信任链进入访问者浏览器。它既能替换加密货币地址，也能窃取支付卡信息，还会按条件收集页面截图与 Cookie，并针对 iOS 设备加载后续攻击代码。

· 恶意脚本注入　· 支付卡窃取　· 加密货币地址替换　· 信息截至 2026.11.18

2026年11月16日，Optimizely Web Experimentation 平台发生恶意脚本注入事件。Report URI 在检查的 1,611 个 Optimizely 脚本片段中，发现 **188 个片段遭到污染，涉及178家组织**，其中包括 Zoom、BBC、CNN、Salesforce、GitLab、IKEA、HSBC、Equifax、Air France-KLM、Ledger 和 Peacock 等。

这不是一起典型的“网站服务器被攻破”事件。恶意代码被写入 Optimizely 客户项目的 **Project JavaScript（projectJS）** 字段，再随正常脚本片段由 cdn.optimizely.com 下发。对浏览器而言，脚本仍来自原本就被网站信任的域名；对网站自身而言， **代码仓库和服务器上可能都找不到这次篡改的痕迹。**

Optimizely 随后确认，未授权方利用了 Experimentation 中的漏洞向部分客户项目添加恶意 JavaScript，并已完成漏洞修复和注入代码清除。本文依据截至2026年11月18日可检索的公开信息整理；除特别说明外，文中时间均为 UTC。

01 影响清单：186、188与178并不矛盾

事件早期曾出现“186个受影响网站”的统计。随着调查推进，Report URI 公布的完整口径是：

-   1,611个：实际检查的 Optimizely 脚本片段数量；
-   188个：发现恶意代码的脚本片段数量；
-   178家：这些脚本片段所属的组织数量。

需要区分的是： **进入受影响清单，不等于该组织的内部系统、应用后台或全部客户数据遭到入侵。** 例如，Smartsheet 表示，受影响的公开营销页面和帮助中心与其应用相互隔离，未发现 Smartsheet 应用及客户数据受到影响。

02 攻击链的关键：被利用的是既有信任，而不是浏览器漏洞

Optimizely Web 的客户通常会在页面中加载一个脚本片段，常见形式为 cdn.optimizely.com/js/<项目ID>.js。其中不仅包含平台代码和实验配置，还可以包含客户自定义的 Project JavaScript。

攻击者将代码写入该字段后，正常分发链路变成了恶意代码投递链路：

网站页面加载 Optimizely 片段 → projectJS 中的恶意加载器执行 → 获取 track.js，或运行内联备用载荷 → 在页面权限上下文中实施地址替换、数据收集与后续加载。

Report URI 明确指出， **这不是 CDN 缓存投毒：** CDN 分发的是项目中已经存在的恶意内容。部分客户虽然通过自有域名提供脚本片段，但内容仍来自同一个 Optimizely 项目，因此也可能受到影响。

调查人员观察到三种加载器变体：

1.  直接加载：创建 <script> 标签，请求 https://1688360\[.\]cc/track.js；
2.  Base64隐藏：使用 atob() 解码加载地址，仅搜索明文域名会漏报；
3.  内联备用载荷：将完整恶意代码嵌入受信任片段，在外部 track.js 被阻断或未能及时到达时，通过 eval 尝试运行。

第三种变体意味着， **只封禁恶意域名并不等于完成清除。** 如果项目字段中的内联代码仍然存在，风险就没有被彻底移除。

03 同一份载荷，在访问者浏览器中走向四条攻击路径

track.js 最终版本约为30 KB。它把多种相对独立的功能放在同一份脚本中，实际触发情况取决于页面内容、访问者操作、设备类型以及浏览器安全策略。

1\. 加密货币地址替换：复制完成时，地址可能已经被换掉

脚本内置了 ETH、TRX、BTC、TON、SOL、LTC、BCH 和 DOGE 等链的替换地址。它会校验地址格式及校验和，并结合 wallet、deposit、send 等支付相关词语判断上下文，再实施替换。

替换范围并不限于页面上的可见文本，还包括：

-   表单输入框、链接和图片属性；
-   copy 事件与剪贴板 API；
-   navigator.share 等分享操作；
-   fetch 与 XHR 请求的 URL 和请求体；
-   通过改写 Function.prototype.call 和 apply，介入字符串进入其他函数前的处理过程。

因此，用户从受影响页面复制地址后，粘贴到钱包中的内容可能已经是攻击者地址。 **仅凭网页上“看起来正确”或剪贴板中“刚刚复制过”都无法排除风险，** 应在钱包或硬件钱包的独立确认界面核对最终收款地址。

2\. 支付卡窃取：监听表单，也监听网络请求

Report URI 将支付卡窃取模块的加入时间定位为11月16日13:43。该模块监听表单提交，并封装 fetch 与 XHR，可检查 JSON 类请求体、URL 编码参数和 FormData，寻找同时满足以下条件的数据：

-   卡号通过 Luhn 校验，并带有已知卡组织前缀；
-   有效期格式有效；
-   CVV 为三位或四位数字。

满足条件后，卡号、有效期、CVV 与页面 URL 会通过 navigator.sendBeacon 发送至 /card.php。脚本还会将已捕获卡片写入以 cc\_ 开头的 sessionStorage 键，用于避免同一张卡被重复发送。

该模块不收集持卡人姓名和账单地址，也不能读取跨源支付 iframe 内部的卡片字段。换言之， **本站自有表单中的卡片信息可能暴露，而由支付服务商托管的跨源字段不在其读取范围内。**

3\. 页面截图与 Cookie 外发：有明确的触发条件

当脚本第一次在可见元素上完成地址替换后，才会从载荷服务器加载 html2canvas.min.js，将可见页面渲染为 JPEG 截图，并向 /hit.php 发送：

-   页面 URL；
-   最多8,000个字符的 document.cookie；
-   最多20个被替换前的原始地址。

该行为每次页面加载至多发生一次，并且以地址替换为前置条件。脚本无法通过 document.cookie 读取带有 HttpOnly 属性的 Cookie，因此 **不能将这一能力笼统表述为“窃取全部会话”。**

4\. iOS 分支：已确认投递行为，但未确认真实设备被攻陷

当 User-Agent 表明访问者使用 iPhone、iPad 或 iPod 时，脚本会从.icu 域名加载两个 boot.js。对于 iOS 18.6及更早版本，还会加入隐藏 iframe，请求 /JIUJIU888/weifile.html。

Report URI 将后续代码识别为 Coruna 与 DarkSword 利用工具包：前者覆盖 iOS 13至17，后者面向 iOS 18.x；另有一条 iOS 26 分支，在其观察时主要执行设备指纹识别。

这里必须保留证据边界：StepSecurity 未独立获取并分析这些后续文件；Hudson Rock 对更深层 DarkSword 阶段的转述，也没有构成真实受害设备被成功利用的证明。 **公开扫描能够证明 exploit 页面或代码被投递，不能据此断言设备已经失陷。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a818a59a6943f0be.png)

**图1｜OPTIMJACK 攻击过程全景图：从项目注入到浏览器端四条功能分支**

图源：根据 Optimizely、Report URI、StepSecurity 与 Hudson Rock 公开信息整理绘制。

04 从首次注入到清理完成：约19个小时的关键时间线

|     |     |
| --- | --- |
| 时间（UTC） | 事件  |
| 11月16日04:21 | 首次观察到 Optimizely 注入，BBC 片段加载 webshell\[.\]lol |
| 05:23 | 主载荷与数据接收域名 1688360\[.\]cc 完成注册 |
| 08:10 | 出现首个 track.js 构建版本，初期包含加密货币地址替换功能 |
| 08:28 | 公开扫描首次记录 BBC 页面请求 1688360\[.\]cc/track.js |
| 13:43 | 支付卡窃取模块加入 track.js |
| 16:38 | 新一批 iOS 路由域名完成注册 |
| 17:56 | StepSecurity 记录的最终 track.js 版本上线 |
| 约20:40—21:10 | 大规模清理展开 |
| 21:52 | Report URI 发现188个片段中仍有1个携带恶意代码 |
| 23:11 | Report URI 观察到其跟踪的受感染片段已全部清理 |
| 11月17日00:37 | 1688360\[.\]cc<br><br>被注册局置于 clientHold 状态 |
| 01:02 | Optimizely 发布安全事件通告 |
| 03:37 | webshell\[.\]lol<br><br>被置于 clientHold 状态 |

载荷并非一次性完成。Report URI 共记录到11月16日当天的 **26次构建**；StepSecurity 通过公开扫描观察到，文件解码后的体积曾从28,877字节逐步增长至30,430字节。对防守方而言，这也意味着 **仅依赖某一个 SHA-256 哈希，无法覆盖事件中的全部版本。**

05 影响评估：链上金额可见，真实数据损失仍不可见

Report URI 统计，截至11月16日19:25，相关钱包地址入账约合 **7,040美元**。但这一数字应理解为特定时间点的链上地址收款估值，而不是已经严格归因、最终确认的事件损失：部分地址在本次事件前已有活动，其他研究者也给出过更低估算。

链上记录同样无法回答以下问题：

-   有多少支付卡信息实际送达攻击者服务器；
-   有多少 Cookie、页面截图和原始钱包地址被收集；
-   是否有 iOS 设备被成功利用；
-   每个受影响组织中，究竟哪些页面和访问者执行了哪一版载荷。

Censys 称，其对一个备用域名进行 sinkhole 观测，在2.5小时内记录到 **509个受害主机名和13,808次请求**，观测到的系统版本覆盖 iOS 17.4至26.7。这组数据反映了相关投递活动的请求侧规模，但 **主机名和请求数都不等于独立访问者数量，更不等于成功被利用的 iOS 设备数量。**

此外，Hudson Rock 与独立研究人员的后续调查，还在 Kissmetrics、StorifyMe 和 minute-ly 的历史脚本响应中发现相关恶意代码，部分观察时间早于11月16日。共享加载器、基础设施和路由标记支持这些活动存在技术关联，但 **不能据此认定四家服务商分别遭到入侵，也不能据此完成攻击者归属。**

06 处置建议：清除项目代码、还原历史暴露、收敛前端权限

面向网站运营与安全团队

1.  检查项目源头，而不只是当前 CDN 文件。逐一审查 Optimizely Web 项目的 Project JavaScript 和实验自定义代码，同时检查通过自有域名分发的片段。除 1688360、.icu、track.js 外，还应关注 atob(、异常 eval、陌生脚本地址及无法解释的内联代码。
2.  保存历史证据。留存受污染片段的原始响应体、响应头、Last-Modified 时间、哈希、抓取时间和网络请求记录，不要只检查最终页面 DOM。相关样本存在执行后删除脚本元素的行为，当前 DOM 中看不到异常，并不能证明历史上没有执行。当前文件已经清理，也不能证明其在11月16日未被污染。
3.  审查账户与写入权限。核对 Optimizely 用户、API Token、集成和登录活动，移除异常访问并轮换相关凭据；向服务商确认项目是否被修改、修改时间和来源账户。
4.  分层确定回溯窗口。对 Optimizely 主波次，从11月16日04:00 UTC 起检索对本文 IOC 的请求，重点查看 /track.js、/hit.php、/card.php、/boot.js，以及 CSP 报告中的被阻断记录。如果站点还使用 Kissmetrics、StorifyMe 或 minute-ly，或者需要排查 webshell\[.\]lol 相关活动，应将关联排查窗口扩展至11月13日。被阻断的请求可以帮助定位曾存在加载器的页面，但不能单独证明数据已经外泄。
5.  重新评估敏感页面上的第三方脚本。尽可能从结账、支付和身份验证页面移除非必要标签。支付字段可采用支付服务商托管的跨源 iframe；这一措施针对本次脚本的有效依据，是其无法跨源读取字段，而不是“iframe 可以防御所有窃卡代码”。
6.  检查 CSP 是否真正覆盖执行与外发。Report URI 对256个相关主机的评估显示，68个没有 CSP，50个同时允许载荷运行和数据外发，17个虽然未能阻止载荷运行、但通过 connect-src 阻断了数据外发，24个被归类为阻断载荷。这组结果说明，阻断脚本加载、阻断数据外发和阻止地址替换，并不是同一件事：即使 connect-src 成功截断外发，页面内的钱包地址替换仍可能发生。  
      
    严格的 script-src 可以限制外部载荷，connect-src 可以限制数据外发，frame-src 可以限制隐藏框架。需要注意，strict-dynamic 与 nonce 的组合可能信任由已信任脚本动态插入的代码，而 unsafe-eval 会为内联备用载荷留下执行空间。对频繁变化的实验脚本，SRI 难以通过固定哈希长期实施。
7.  按实际暴露范围处置数据。如果网站自有表单在受影响时段收集过支付卡信息，应将相应卡片视为潜在暴露；如果 JavaScript 可读的 Cookie 中包含会话令牌或敏感信息，也应纳入轮换和会话失效评估。
8.  将第三方脚本纳入生产变更管理。对 Project JavaScript、实验自定义代码等具备任意脚本执行能力的字段设置变更审批和告警；持续监控供应商域名下脚本的内容变化，尤其是新增外部脚本地址、数据接收地址和 iframe 来源。不能因为下载域名没有变化，就默认脚本内容仍然可信。

面向可能在当天访问过相关页面的用户

-   如果复制过加密货币地址或发起转账，应核对交易记录，并在钱包或硬件钱包的独立界面确认最终地址；
-   如果在受影响页面的本站表单中输入过卡片信息，应关注账单异常，必要时联系发卡机构；
-   iPhone 和 iPad 用户应安装适用的最新系统更新。高风险场景下，可结合访问时间和设备版本开展进一步排查。

07 仍未公开解决的问题

截至目前，公开信息仍未完整解释：注册流程漏洞如何被转化为对多个无关客户项目的写入能力；相关活动背后的具体攻击者是谁；支付卡、Cookie 与截图的实际外泄规模；以及是否存在真实 iOS 设备被成功攻陷。

这些问题不应由推测补齐。对本次事件更稳妥的结论是： **攻击者滥用了第三方脚本项目的写入与分发能力，把多个网站已有的前端信任关系变成了恶意代码投递通道。**

08 技术附录

附录 A：MITRE ATT&CK 技术映射

以下为基于已公开行为所作的分析映射，不代表相关厂商发布了官方 ATT&CK 标注。

|     |     |     |     |
| --- | --- | --- | --- |
| 技术编号 | 技术名称 | 本次事件中的对应行为 | 映射说明 |
| T1195.002 | Compromise Software Supply Chain | 恶意代码被写入 Optimizely 客户项目，并随正常脚本片段分发 | 对应第三方脚本供应链被滥用，不代表每个下游组织的服务器均被入侵 |
| T1059.007 | JavaScript | 恶意 projectJS、track.js 与内联备用载荷在浏览器中执行 | 浏览器内 JavaScript 执行 |
| T1105 | Ingress Tool Transfer | 加载 track.js、html2canvas.min.js 和 iOS 分支的 boot.js | 对应远程工具或代码获取 |
| T1027 | Obfuscated Files or Information | 使用 Base64 隐藏加载地址，并以 atob() 解码 | 用于规避简单明文搜索，不代表样本整体均采用高强度混淆 |
| T1565.003 | Runtime Data Manipulation | 在页面、剪贴板及请求处理过程中替换加密货币地址 | 直接破坏访问者所见和所用数据的完整性 |
| T1056 | Input Capture | 监听表单提交并封装 fetch/XHR，捕获卡号、有效期和 CVV | 采用父级技术映射；该行为不是传统键盘记录 |
| T1539 |     |     |     |
| T1113 | Screen Capture | 使用 html2canvas 渲染可见页面并生成 JPEG | 由首次可见元素地址替换触发 |
| T1189 | Drive-by Compromise | 针对 iOS 访问者加载隐藏 iframe 和后续 exploit 代码 | 映射投递行为，不表示 exploit 已成功 |
| T1071.001 | Web Protocols | 通过 HTTP/HTTPS 请求载荷及攻击者控制的接收端点 | 对应 Web 协议通信 |
| T1041 | Exfiltration Over C2 Channel | 向 /hit.php POST 截图、Cookie 等数据，并向 /card.php 发送卡片信息 | 代码能力已确认，实际外泄数量未知 |

附录 B：失陷指标与调查线索

以下域名已做去武器化处理。部分基础设施在事件后已停止解析或响应，但仍适用于历史日志回溯。 **云服务 IP 可能承载其他租户资源，应结合域名、路径与时间窗使用，不建议脱离上下文长期封禁整个地址段。**

B.1 核心网络指标

|     |     |     |
| --- | --- | --- |
| 类型  | 指标  | 用途或备注 |
| 域名  | 1688360\[.\]cc | 主载荷与数据接收服务器 |
| 域名  | webshell\[.\]lol | 较早加载器 /get.js 使用；与其他活动的关联由 Report URI 提出 |
| 域名  | linkforge\[.\]cc | Report URI 列出的早期 SEO 面板脚本关联域名 |
| IPv4 | 136.113.106.136 | 1688360\[.\]cc<br><br>最后已知 A 记录 |
| 路径  | /track.js | 多功能恶意载荷 |
| 路径  | /html2canvas.min.js | 页面截图依赖 |
| 路径  | /hit.php |     |
| 路径  | /card.php | 支付卡信息接收端点 |
| 路径  | /px.gif | 内联载荷加载器的错误遥测路径 |
| SSH 主机密钥指纹 | 5e:7a:7f:b3:d7:22:ba:c7:f5:04:5a:b2:5c:0d:8a:73 | Shodan 在主载荷服务器 IP 上记录的 ed25519 指纹，可用于关联调查 |

B.2 iOS 分支相关指标

|     |     |
| --- | --- |
| 类型  | 指标  |
| 域名  | eil786npto9u5bq\[.\]icu |
| 域名  | 1y69gy2mdzaltz1\[.\]icu |
| 域名  | gm38duxoihbmy5o\[.\]icu |
| 域名  | 5vobauua3ojpklx\[.\]icu |
| 域名  | p55abnw2pnsz0bo\[.\]icu |
| 域名  | je4ft3gn8vxudum\[.\]icu |
| 域名  | l7bcsnwc7nzr3uo\[.\]icu |
| 域名  | q1ls1ho9x7wsxlu\[.\]icu |
| 域名  | ios-hack\[.\]icu |
| IPv4 | 34.87.36.58<br><br>、34.96.213.201 |
| 路径  | /boot.js、/JIUJIU888/weifile.html、/JIUJIU888/index.js、/A8/a.html、/api/iptj、/api/ip-sync/sync |
| 路由标记 | data-channel-code="02111110" |
| Coruna 遥测标记 | BIGNIAO |

其中，q1ls1ho9x7wsxlu\[.\]icu 与 ios-hack\[.\]icu 的注册时间晚于相关信息公开，注册者身份尚未确认， **宜作为关联调查线索，而非单独据此认定攻击者基础设施。**

B.3 文件哈希

|     |     |
| --- | --- |
| 文件或版本 | SHA-256 |
| track.js<br><br>早期公开扫描样本 | 617df364120adc47fb4f55dcc0c69a9b6c9e108a92c60bc2b64a266254ab02f3 |
| track.js<br><br>17:13构建版本 | 814a963c0da480e2449d9b6664480156e1cd6d731014117401bf635badec3a0f |
| track.js<br><br>后续版本 | f7b84b9a94f749f8ced3f0112d0a66894e8bbc3b4aa5592021d1b8976a9bad40 |
| 解码后的内联备用载荷 | c2a34c579e4c2e8802752c93b3a9cca0230610f3e4dd6688f4272459c7c7c162 |

载荷存在多个构建版本， **以上哈希不能作为完整性判断的唯一依据。**

B.4 浏览器侧检测线索

|     |     |
| --- | --- |
| 类型  | 线索  |
| 页面全局变量 | window.\_k7、window.\__k7b、window.\_cc、window.\_qxc、window.\_shot |
| 浏览器存储 | sessionStorage<br><br>中出现以 cc\_ 开头的键 |
| 函数完整性 | Function.prototype.call<br><br>或 apply 呈现非原生实现 |
| 网络行为 | 向 /hit.php 发送 text/plain POST；向 /card.php 发送包含 n、e、c、u 字段的 beacon |

这些线索应结合页面是否加载过受影响片段进行判断， **不宜在缺乏上下文时单独作为失陷结论。**

B.5 攻击者替换地址

|     |     |
| --- | --- |
| 链或资产 | 地址  |
| ETH／EVM | 0xC4026b06D82b0F0B363eda0642D61CfbDc17884e |
| BTC | 19g9rZcPeiz8rUvyWpTRyXXhPnjsWrc3kW |
| LTC | ltc1q3wp7g6ds0ggg6fl6kncpa4sepn0q3qfacgred5 |
| TRON | THvs6p56XkUiMkJeSc51cAP64u2RsTYqxa |
| TON | UQAgM1VqSZQiJLSG5w-ovurq5CZdxLEK3_7CMmwALTA5e09p |
| SOL | FVtL8NMYS9PA1v3HE67XUGCtGA9JaZUvqav2fU2LrV5n |
| BCH | qzkaaf8n6grmpr0d9lx8xutn3r9lk722f566hhpe58 |
| DOGE | DBEGrxRF7KMSuhTS4c1MFviStU6efdMnu5 |

09 参考链接

**1\. Optimizely：Web Experimentation Security Incident**  
https://status.optimizely.com/history

**2\. Report URI：World's Largest Brands Infected With Malware Via Optimizely**  
https://blog.report-uri.com/worlds-largest-brands-infected-with-malware-via-optimizely/

**3\. StepSecurity：OPTIMJACK——Optimizely-Hosted Scripts Loaded a Crypto Clipper and Card Skimmer**  
https://www.stepsecurity.io/blog/optimjack-optimizely-hosted-scripts-crypto-clipper-card-skimmer

**4\. Hudson Rock：Beyond Optimizely——Malicious Scripts Traced Across Four Web Services**  
https://www.hudsonrock.com/blog/beyond-optimizely-malicious-scripts-traced-across-four-web-services

**5\. Hudson Rock／InfoStealers：Poisoned Scripts on BBC, Zoom, GitLab and HSBC UAE**  
https://www.infostealers.com/article/poisoned-scripts-on-bbc-zoom-gitlab-hsbc-uae-optimizely-files-led-to-crypto-and-ios-theft/

**6\. Censys：OPTIMJACK 相关投递、iOS 套件与 sinkhole 观测线程**  
https://x.com/censysio/status/2122543399148437773

**7\. Amirul Cyber：CNN, Zoom, Fox News Served Visitors a Crypto-Stealing Skimmer——OPTIMJACK**  
https://amirulcyber.com/2026/11/16/optimjack-optimizely-skimmer/

**8\. Smartsheet：Security update——Optimizely Third-party Incident**  
https://www.smartsheet.com/content-center/security-update-optimizely-third-party-incident

**9\. MITRE ATT&CK：Enterprise Techniques**  
https://attack.mitre.org/techniques/enterprise/

本文已发布于NCC国家网络安全云社区https://nccsec.cn/security-community

供应链攻击 · 目录
