---
title: 【微信】黑客利用 Artex 扫描 GitHub 仓库以查找泄露的密钥
source: https://mp.weixin.qq.com/s/AdzC-XT3vanIS935TK0UvQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:52:12+08:00
trace_id: c6c3bd32-375f-4dc5-a655-abf082b97e2a
content_hash: 3fed5a7098ba25144846cdd62022e6456782a6bb33e0bcce1832b678383923e1
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
notion_page_id: 41375244-d011-8107-b823-edc6a198abdc
ioc:
  cves:
    - CVE-2024-27834
    - CVE-2025-53770
    - CVE-2025-53771
    - CVE-2026-119977
    - CVE-2026-123158
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**爱拍照的老李** *2026年11月9日 09:00*

**导 读**

根据微软威胁情报机构周四发布的一份报告，黑客正利用Artex及其他基于智能体AI的框架，在GitHub公共代码仓库中扫描泄露的凭证和API密钥。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ffb0c4e6ec91bfc0.jpg)

随后这些凭据被用于针对目标组织的后续攻击中。10月28日起，研究人员发现有一个IP地址利用已泄露但仍有效的应用凭据登录了后续租户。

在某起案例中，黑客成功窃取了Azure密钥库和存储账户的凭证并窃取数据，同时滥用了Azure人工智能服务。研究人员还发现，黑客会在用户代理中嵌入shell命令来利用漏洞，此外也存在窃取应用服务身份验证令牌的行为。

微软研究人员表示，此次威胁活动与一项使用相同IP地址的活动有关，正如托迪尔公司（Todyl）周三发布的研究所概述的那样。该报告展示了黑客如何利用窃取到的Entra ID凭据登录各类托管服务提供商的Microsoft 365和Azure环境。

此次威胁活动发生在一系列攻击之后，黑客利用了Artex及其他智能体式人工智能工具来实现攻击自动化。Artex是一款传统上用于渗透测试的工具，渗透测试指的是入侵内部信息技术环境，以检测可能在真实攻击中被利用的漏洞。

此前，一个威胁组织曾利用 Artex 滥用ConnectWise 云备份。这个被追踪为 Storm-0940 的攻击者，将目标对准了下游的微软 365 租户。

同一攻击者还与针对韩国多家银行以及数十家日本企业的攻击事件有关。目前尚不清楚是谁在扫描GitHub代码仓库。

CrowdStrike 本周早些时候发布了一份报告，详细说明了Artex是如何在全球多起间谍攻击活动中提供协助的。自10月中旬以来，全球已有200多家组织成为攻击目标。

微软研究人员表示，自8月以来，黑客已运用多种智能体框架来扫描GitHub上的机密信息。这些查询会要求提供目标组织名称、机密关键词、与云服务相关联的关键词，以及其他人工智能服务提供商相关的关键词。

微软研究人员表示，如果一家组织发现自己的密钥信息暴露在了公共代码仓库中，就应当认定这些密钥信息已遭泄露。

技术报告：

https://www.wiz.io/blog/artex-in-the-wild-storm-0940-expands-targeting-of-it-and-software-vendors

https://www.microsoft.com/en-us/security/blog/2026/10/21/storm-0940-uses-artex-agentic-ai-connectwise-supply-chain-compromise/

https://www.crowdstrike.com/en-us/blog/unknown-threat-actor-uses-artex-to-target-south-korean-finance/

https://blog.checkpoint.com/research/inside-artex-how-autonomous-ai-agents-are-being-used-in-real-world-cyberattacks/

https://censys.com/blog/artex-agentic-asbestos/

新闻链接：

https://www.cybersecuritydive.com/news/hackers-artex-github-repositories-exposed-secrets/874007/

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0877e2d01c065e08.svg)

**今日安全资讯速递**

**APT事件**

Advanced Persistent Threat

1\. 俄罗斯APT29组织通过水坑攻击针对移动用户

与俄罗斯有关联的APT29组织通过被劫持的网站和遭入侵的分析服务针对iOS和Android用户展开攻击。

🔗https://securityaffairs.com/202473/apt/russian-apt29-targets-mobile-users-with-watering-hole-attacks.html

2\. SOC 档案 5：管道中的幽灵，或 Storm-2603 发起的无文件 SharePoint 入侵事件

2025年，多名威胁行为者利用本地部署的Microsoft SharePoint中的CVE-2025-53770和CVE-2025-53771（ToolShell漏洞），通过构造的HTTP请求实现了远程代码执行。卡巴斯基对此活动进行回顾性分析。

🔗https://securelist.com/storm-2603-fileless-toolshell-attack/121467/

3\. 泰国反对派领导人警告间谍软件攻击

泰国两名反对党领导人表示，苹果公司已向他们通报了针对其的高级别攻击事件，这引发了人们对政治监控的担忧。

🔗https://www.silicon.co.uk/cybersecurity/thailand-spyware-attacks-632182

4\. 黑客利用 Artex 扫描 GitHub 仓库以查找泄露的密钥

微软研究人员表示，智能体式人工智能工具利用被盗凭证针对下游租户。

🔗https://www.cybersecuritydive.com/news/hackers-artex-github-repositories-exposed-secrets/874007/

**一般威胁事件**

General Threat Incidents

1\. GitHub上的虚假安全工具推送后门程序和信息窃取程序

网络安全专业人员正成为 GitHub 上被感染的安全项目的攻击目标，这些项目会部署后门程序和信息窃取恶意软件。

🔗https://www.bleepingcomputer.com/news/security/fake-security-tools-on-github-push-backdoors-and-infostealers/

2\. Chainalysis 称数据泄露暴露了所有客户的凭证

区块链情报公司 Chainalysis 表示，对其系统和内部工具的最近一次攻击已暴露了所有客户的凭据和实时代币。

🔗https://www.bleepingcomputer.com/news/security/chainalysis-says-breach-exposed-credentials-for-all-customers/

3\. 黑客在布里斯托尔学校遭黑客攻击后公布被盗数据

布里斯托尔市议会警告称，9月黑客攻击中窃取的大量数据已发布在网络上，敦促居民采取措施防范。

🔗https://www.silicon.co.uk/cybersecurity/bristol-schools-hack-632176

4\. 黑客利用虚假流媒体应用传播 Mirax Android 恶意软件并窃取银行账户

黑客正在利用流媒体应用诱饵分发 Mirax。这种 Android 银行木马允许操作员远程控制受害者的手机并发起欺诈性转账。

🔗https://gbhackers.com/mirax-android-malware/

5\. DreamHost 确认数据泄露事件暴露了 FTP 登录信息和网络邮件会话

DreamHost 发出数据泄露预警，此前攻击者已入侵其文件管理器平台长达两个月，并窃取了客户的文件传输协议/安全文件传输协议用户名和密码。

🔗https://www.bleepingcomputer.com/news/security/dreamhost-confirms-data-breach-exposed-ftp-logins-and-webmail-sessions/

6\. 菲律宾政府数据泄露事件或致69GB外籍劳工信息外泄

一名未知操作员似乎在不到半小时的时间内，从菲律宾海外就业管理局窃取了 SQL Server 备份。

🔗https://www.darkreading.com/cyberattacks-data-breaches/philippine-migrant-worker-data-69gb-government-breach

7\. 证书颁发机构 DigiCert 曝出数据泄露事件，涉商业客户信息

互联网安全公司 DigiCert 报告一起数据泄露事件，涉及一个内部业务系统，该系统处于暴露状态，最终被公司外部人员访问。

🔗https://therecord.media/digicert-certificate-authority-reports-data-breach

8\. Dark Project 勒索软件团伙声称在 8 个国家有 38 名受害者，目标为医疗和制造业

新兴的以牟利为目的的勒索软件组织“黑暗计划”（Dark Project）在提供的威胁情报快照中宣称已在八个国家造成38名受害者，其中制造业和医疗行业受影响最为严重。

🔗https://gbhackers.com/dark-project-ransomware/

9\. 黑客通过服务提供商实施1.33亿美元法国银行抢劫案

法国合作银行法国农业信贷互助银行（Crédit Mutuel Arkéa）遭遇网络攻击，导致高达1.33亿美元的欺诈交易，该行被迫暂停部分系统以应对此次事件。

🔗https://www.bleepingcomputer.com/news/security/hackers-pull-off-133-million-french-bank-heist-via-service-provider/

10\. CTM360曝光利用知名品牌的虚假礼品卡诈骗

全球范围内，欺诈性奖励门户和虚假礼品卡赠品活动激增，诱骗用户陷入虚假验证循环并订阅付费服务。

🔗https://www.bleepingcomputer.com/news/security/ctm360-exposes-fake-gift-card-scams-exploiting-trusted-brands/

11\. 仿冒ChatGPT和Claude应用程序使用签名可执行文件安装Yoba恶意软件

假冒的 ChatGPT 和 Claude 应用程序通过 GitHub 传播 Yoba 恶意软件，利用签名可执行文件在 Windows 电脑上加载加密挖矿程序，并支持其他有效载荷。

🔗https://hackread.com/fake-chatgpt-claude-apps-software-yoba-malware/

12\. 挪威援助机构遭黑客攻击，所有用户数据被盗

挪威国家援助机构诺拉德（Norad）已证实，网络犯罪分子入侵了其系统，窃取了其赠款门户网站所有注册用户的信息。

🔗https://www.theregister.com/cyber-crime/2026/11/05/norways-aid-agency-pwned-and-all-users-data-is-stolen/5307765

13\. 失控的人工智能黑客代理逃离沙箱后导致WorkOS数据泄露

WorkOS 表示，一款攻破其内部销售应用并获取客户信息的人工智能驱动黑客智能体，由一名安全研究人员操控。该研究人员称，这款工具脱离了测试环境，意外对该公司发起了攻击。

🔗https://www.bleepingcomputer.com/news/security/runaway-ai-hacking-agent-behind-workos-breach-after-escaping-sandbox/

14.Iris Ohyama数据云泄露事件导致770万客户信息曝光

日本制造商爱丽思欧雅玛（Iris Ohyama）是爱丽思广场（Iris Plaza）购物平台的运营方，该公司披露，在其使用的第三方云服务遭未经授权的入侵后，约770万人的个人信息可能已遭泄露。

🔗https://www.bleepingcomputer.com/news/security/iris-ohyama-data-cloud-breach-exposes-info-of-77-million-customers/

**漏洞事件**

Vulnerability Incidents

1\. Zyxel修复攻击近1,000台网络交换机的零日漏洞

Zyxel在其GS1900系列网络交换机中修补了一个零日漏洞，黑客利用该漏洞入侵了全球近1000台设备，并窃取了配置文件和凭据。

🔗https://www.bleepingcomputer.com/news/security/zyxel-fixes-zero-day-exploited-to-hack-nearly-1-000-network-switches/

2\. QNAP 表示黑客在 Plex2Shell 攻击中入侵 NAS 设备

QNAP 敦促用户将 Plex 媒体服务器更新至 QNAP 应用中心中可用的最新版本，因为黑客正在利用 Plex2Shell 漏洞链。

🔗https://www.bleepingcomputer.com/news/security/qnap-says-hackers-breaching-nas-devices-in-plex2shell-attacks/

3.D-Link 警告 DGS-3130 系列交换机存在多个零日漏洞

D-Link 发布了影响 DGS-3130 系列管理型千兆堆叠交换机的多个未修补安全漏洞的缓解措施。

🔗https://www.bleepingcomputer.com/news/security/d-link-warns-of-multiple-zero-days-in-dgs-3130-series-switches/

4\. 黑客利用已修复的苹果漏洞投放信息窃取恶意软件

所涉漏洞为 CVE-2024-27834（CVSS 评分：5.5），这是一处身份验证不当问题，可能让具备任意读写权限的攻击者绕过指针身份验证。

🔗https://thehackernews.com/2026/11/hackers-exploit-patched-apple-flaw-to.html

5\. CISA 确认黑客在软件升级期间利用 WordPress 核心漏洞

被追踪为 CVE-2026-119977 (CVSS 评分：8.1) 的高危漏洞是一个 TOCTOU 竞争条件案例，可被利用以实现任意代码执行。

🔗https://thehackernews.com/2026/11/cisa-confirms-hackers-exploiting.html

6\. OpenAI 发现重大漏洞后将 GPT-6 网络评为最高风险等级

OpenAI GPT-6 网络安全系统发现81个严重程度极高的火狐浏览器漏洞以及数百个Linux系统漏洞。

🔗https://securityaffairs.com/202546/ai/openai-rates-gpt-6-cyber-critical-after-major-vulnerability-discoveries.html

7\. CrowdStrike 发现黑客在公开 PoC 发布后 35 分钟内即利用漏洞

CrowdStrike 发现，在监测到的存在公开漏洞利用代码（PoCs）的被利用漏洞中，91% 在48小时内就遭到了攻击，最快的一次漏洞利用仅耗时35分钟。

🔗https://www.esecurityplanet.com/news/news-crowdstrike-vulnerability-exploits-35-minutes-public-poc/

8\. OpenSSH 漏洞在披露后仅数小时即被野外利用 (CVE-2026-123158)

该漏洞（CVE-2026-123158）被 Wakefield 研究员 Özgün Kültekin 起名为 sshole，已于 11 月 5 日在 OpenSSH 10.6p2 中修复。能够访问你的 SSH 端口的攻击者可以在不知道任何密码的情况下登录。只需一次连接，每次都能成功，且无需重试。

🔗https://www.helpnetsecurity.com/2026/11/06/openssh-sshole-cve-2026-123158-exploitation/

9\. SonicWall 警告新的 SSL-VPN MFA 绕过漏洞遭攻击利用

SonicWall 发布了安全更新以修复 SonicOS 防火墙中的七个漏洞，其中包括一个在攻击中被利用的 SSL-VPN 身份验证绕过漏洞。

🔗https://www.bleepingcomputer.com/news/security/sonicwall-warns-of-new-ssl-vpn-mfa-bypass-flaw-exploited-in-attacks/

10\. 黑客在超24万次攻击尝试中利用WordPress核心远程代码执行漏洞

攻击者针对 WordPress 核心升级流程漏洞发起了超过24万次漏洞利用尝试，该漏洞可实现未授权远程代码执行。漏洞编号CVE-2026-119977，通用漏洞披露系统（CVSS）评分为8.1分。

🔗https://gbhackers.com/exploit-wordpress-core-over-240000-attack/

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e3d8ac7aa217378.jpg)

扫码关注

爱拍照的老李

**讲述普通人能听懂的安全故事**

收录于高级威胁
