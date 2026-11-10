---
title: 【微信】法国指责伊朗制造超市冰箱攻击事件
source: https://mp.weixin.qq.com/s/GMa1ZWiyjRMZeUJGw2hJjQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:58:10+08:00
trace_id: 90dc63a7-7cf3-46ae-8095-ad93f5bde3e2
content_hash: e71ce575a5e69ed84ee62902f9c47efd1ca2a8bee80ba6885fbe619fd525d998
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
notion_page_id: 41475244-d011-8173-af25-c2e5ea82eefe
ioc:
  cves:
    - CVE-2026-124033
    - CVE-2026-19868
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**爱拍照的老李** *2026年11月10日 09:00*

**导 读**

法国政府将超市冰箱袭击事件归咎于伊朗。目前已知的情况、仍不明确的细节，以及如何保障裸露控制器的安全。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/595c38057fe51483.jpg)

法国外交部长让-诺埃尔·巴罗表示，伊朗革命卫队是10月11日和12日法国超市冰柜遭袭事件的幕后黑手。他称该组织袭击了700个地点，并调高了冰箱的温度。部分商店丢弃了全部易腐食品库存，还有数家店铺发生了火灾。

“法国将针对其利益的破坏活动和破坏行动归咎于伊朗伊斯兰共和国（伊朗伊斯兰革命卫队电子和网络中心——IRGC-ECC）。”法国网络安全机构ANSSI发布的公告中写道：“经调查，将这些破坏性行动归咎于隶属于伊朗伊斯兰革命卫队电子和网络中心（IRGC-ECC）的沙希德·卡韦网络进攻单位：依据是基础设施特征、签名工具的使用、由与沙希德·卡韦相关联的宣传机构发起的攻击中继，以及攻击基础设施中存在的波斯语使用痕迹。”

法国外长让-诺埃尔·巴拉罗将此次袭击描述为“在规模和攻击性程度上都前所未有”，并称这是首次在法国本土发生的重大网络破坏行动。他承诺将实施欧盟层面的制裁，法国也召见了伊朗大使。欧盟外交政策负责人卡娅·卡拉斯表示，应对措施应强硬，并补充称她才刚刚得知法国的归因结论。

“我可以确认此次袭击是由伊朗伊斯兰共和国伊斯兰革命卫队实施的。”外交部长让-诺埃尔·巴罗谈及10月11日和12日发生的针对法国超市的网络袭击时表示，据《世界报》报道。

“这次攻击在规模和攻击性程度上都前所未有。”巴罗说。“这是首次针对我国领土的大规模破坏性质网络攻击，也是对国家利益和法国人民安全的重大攻击。”

“我们将在欧洲层面对所有责任人实施制裁。”他补充道。

巴黎检察官对与伊朗革命卫队电子和网络中心相关的攻击性网络单位沙希德·卡韦赫负责人及其两名副手展开了司法调查。他们认定的其他人员均可被纳入该案。

该归因提及了共享基础设施、攻击工具、波斯语相关线索以及一个与该组织关联的宣传机构所进行的放大操作。

法国当局表示，针对法国利益的伊朗网络行动至少可追溯至2020年。此前的相关事件包括一起针对《查理周刊》的预谋袭击、2023年该刊网上商店遭名为“埃门内特·帕萨加尔”的组织入侵，以及2024年巴黎奥运会前夕有人试图劫持数字广告终端以播放反以色列信息的行为。C4将这些行动归咎于与伊斯兰革命卫队有关联的“沙希德·舒斯塔里”分队。

并非只有法国遭遇此类情况。11月2日，至少其他九个欧洲国家的超市报告其冷冻系统疑似遭袭。巴罗仅谈及了法国的情况，目前尚无官方信息将第二波袭击与伊朗关联。

这一点我们需要格外谨慎。当某国政府指认某一国家对袭击负责时，这是一项严重的指控。但我读到的相关报道并未解释其背后的技术证据。我们应将其视为官方声明，而非已证实的事实，只依据已知信息进行判断。恐惧与不确定性可能被用来散布不信任，这一风险同样适用于此事涉及的所有各方。

关键问题不仅在于识别攻击者，还在于弄清是否有人利用这些事件渲染混合战争的论调。黑客行动组织的声明或许更多是为了宣传和博取关注，而非真正承担了责任。如果法国的调查证实伊朗参与了10月的袭击，那么声称对11月事件负责的亲俄组织可能会面临严重的信誉危机。他们或许曾试图将他人的行动据为己功。不过，他们参与部分事件仍存在可能性。

在当今的混合战争中，归因不明、战略模糊与信息操纵使得区分真实攻击与宣传宣传变得愈发困难。

11月5日，美国网络安全与基础设施安全局（CISA）、联邦调查局（FBI）等美国机构发布了一份关于此类活动的情况说明书。攻击者可能会利用未打补丁或可联网的控制器中的漏洞或弱点，远程更改设置，迫使设备持续运行加热和除霜循环，这会造成大规模的库存损失和设备安全隐患。

这些机构列出了三种入侵途径：绕过身份验证、注入代码以及配置设置薄弱。他们还警告称，操作人员可能会忽略实际温度，而这在奶酪变质后才发现则是一件糟糕的事。

这些修复方法虽不起眼但却有效。让控制器脱离互联网，若需要远程访问，就在其前端部署更新后的防火墙。将工业设备与办公网络分离开，修改默认密码，添加可抵御钓鱼攻击的多因素身份验证，为固件打补丁，并更换制造商已停止支持的设备。

然后通过批准的设备和IP地址白名单来限制可更改设置的人员。将经过测试的备份存放在异地且离线位置，启用日志记录并查看日志。最后一项控制措施成本最低：为控制器下游运行的设备定义并维持合理的设定值限制，使其保持在安全范围内，并为偏差情况设置警报机制。

新闻链接：

https://securityaffairs.com/202742/hacking/france-blames-iran-for-the-supermarket-fridge-attacks.html

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0877e2d01c065e08.svg)

**今日安全资讯速递**

**APT事件**

Advanced Persistent Threat

1\. ARTEX 网络攻击：AI 代理窃取凭据和签名证书

Check Point 详细说明了罪犯如何滥用 ARTEX AI 代理窃取凭据和签名证书，并为防御者提供了实用的安全检查措施。

🔗https://www.esecurityplanet.com/threats/news-artex-ai-agents-credential-theft/

2\. 法国指责伊朗制造超市冰箱攻击事件

法国将超市冰箱袭击事件归咎于伊朗。目前已知的情况、仍不明确的细节，以及如何保障裸露控制器的安全。

🔗https://securityaffairs.com/202742/hacking/france-blames-iran-for-the-supermarket-fridge-attacks.html

**一般威胁事件**

General Threat Incidents

1\. 攻击者向受信任的 AWS 集成植入后门以窃取机密

Wiz 研究人员发现了这起窃取机密的供应链攻击。

🔗https://www.theregister.com/security/2026/11/09/attackers-backdoor-trusted-aws-integrations-to-steal-secrets/5308553

2\. 黑客平均只需 8 分钟即可使用被盗凭据登录

根据来自 Elastic Security Threat Command 的一份报告，在 27 个确认的窃取者案例中，攻击者平均在感染后 8 分钟内使用被盗凭据登录。

🔗https://www.helpnetsecurity.com/2026/11/09/elastic-businesses-remote-access-attacks-report/

3\. PolinRider 恶意软件卷土重来，通过 10 个被劫持的 npm 包利用以太坊区块链投放恶意代码

在 10 个被劫持的 npm 包的 12 个版本中发现隐藏的 JavaScript 加载器，将入侵与之前记录的 PolinRider 活动联系起来。

🔗https://gbhackers.com/polinrider-malware-attack/

4\. ArmorSteal 恶意软件窃取密码和加密钱包数据，并在任务管理器打开时隐藏挖矿

ArmorSteal 是一个基于 Python 的 Windows 恶意软件套件。它窃取凭据和加密货币钱包，劫持剪贴板地址，并运行隐藏的 Monero 风格挖矿程序。每当用户打开任务管理器或其他监控工具时，挖矿程序就会关闭。

🔗https://gbhackers.com/armorsteal-malware-attack/

5\. 助听器巨头 Amplifon 数据泄露影响数千人

国际助听器公司 Amplifon 的美国分部一直在通知客户今年早些时候发生的数据泄露事件，其中包括医疗信息。

🔗https://therecord.media/amplifon-hearing-aid-company-data-breach

**漏洞事件**

Vulnerability Incidents

1\. SonicWall 警告存在正在被积极利用的 SSL-VPN 漏洞，该漏洞可绕过 SAML 和 MFA 保护

SonicWall 呼吁客户解决一个 SSL-VPN 认证漏洞，该漏洞可以绕过 SAML 控制，包括相关的多因素认证措施。该问题被跟踪为 CVE-2026-19868，影响使用 SAML 进行 SSL-VPN 登录的 SonicOS 部署。

🔗https://gbhackers.com/sonicwall-warns-of-actively-exploited-ssl-vpn-vulnerability/

2\. 允许黑客通过SSH访问Linux设备的漏洞正被积极利用

多名研究人员报告称，黑客正在积极利用一个新发现的严重漏洞，该漏洞使他们能够登录许多Linux系统上的特权账户。

🔗https://arstechnica.com/security/2026/11/vulnerability-that-lets-hackers-ssh-into-linux-devices-is-under-active-exploitation/

3\. CVE-2026-124033 – AWS ParallelCluster CLI 日志导出命令中的相对路径遍历

AWS ParallelCluster CLI 是一个开源命令行工具，在 PyPI 上以 aws-parallelcluster 的形式发布。研究人员发现 CVE-2026-124033漏洞，AWS ParallelCluster CLI 在 3.16.0 版本之前的 export-cluster-logs 和 export-image-logs 命令存在相对路径遍历漏洞。

🔗https://aws.amazon.com/security/security-bulletins/rss/2026-174-aws/

4\. 严重 React 服务器组件漏洞允许未认证攻击者在服务器上执行恶意代码

React Server Components 中的一个严重漏洞可能允许未经身份验证的攻击者在受影响的服务器上执行恶意代码。该安全公告于 2026 年 10 月 14 日发布，将该问题评为 CVSS v4.0 9.5 分。

🔗https://gbhackers.com/critical-react-server-components-vulnerability/

5\. CISA 将四个已知被利用漏洞加入目录

CISA 根据积极利用的证据，将其目录中的四个新漏洞添加到了 Known Exploited Vulnerabilities (KEV) 目录中。

🔗https://www.cisa.gov/news-events/alerts/2026/11/09/cisa-adds-four-known-exploited-vulnerabilities-catalog

6\. NotC2 AI 驱动的黑客工具将 Amazon Bedrock 变成了云命令与控制系统

NotC2 是一个概念验证框架，它结合合法的 AWS 服务与 Amazon Bedrock 来运行入侵后的命令与控制 (C2) 操作。该研究于 11 月 6 日发布，展示了被盗的云凭据如何能够实现对话式侦察，同时命令流量融入受信任的基础设施。

🔗https://gbhackers.com/notc2-ai-powered-hacking/

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e3d8ac7aa217378.jpg)

扫码关注

爱拍照的老李

**讲述普通人能听懂的安全故事**

收录于高级威胁
