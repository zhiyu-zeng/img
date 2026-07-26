---
title: 【微信】【安全圈】Notepad++ 插件悄然安装恶意软件
source: https://mp.weixin.qq.com/s/MYmmH6mr90BGPHAJv_BK2Q
source_host: mp.weixin.qq.com
clip_date: 2026-07-26T19:27:18+08:00
trace_id: e5432d80-5643-4008-a503-39e7760f7c2d
content_hash: 75ec2964ff130d58f5cec5b02ecd20100d033a64b63f25e818d7b340ce77a389
status: summarized
tags:
  - 微信
  - 恶意样本
  - 开发工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 乌克兰 CERT 发现针对其组织的攻击活动，通过伪装成 Notepad++ 插件的恶意软件建立持久化访问。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3a975244-d011-8103-ae88-eaec9a79ed40
ioc:
  cves:
    - CVE-2025-56383
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 乌克兰 CERT 发现针对其组织的攻击活动，通过伪装成 Notepad++ 插件的恶意软件建立持久化访问。
> 
> - **攻击归因与目标：** 攻击活动被归因于威胁集群 UAC-0099，该集群主要针对乌克兰组织，并曾为 APT44（Sandworm）的攻击提供初始访问权限。
> - **攻击载体与手法：** 攻击者通过 ZIP 压缩包分发合法的 Notepad++ 与一个名为 NppExport.dll 的恶意插件（即 LunchPoke），利用应用程序正常的插件加载机制执行恶意代码。
> - **恶意软件功能：** 恶意插件 LunchPoke 会创建 Windows 计划任务，并解压包含 BurnyBear 加载器和 MatchBoil V2 恶意软件加载器的文件，旨在进行持久化。
> - **后备攻击机制：** 如果主要的恶意可执行文件启动失败，攻击代码会触发针对主机 RAM 和 CPU 的资源耗尽攻击作为后备手段。
> - **漏洞与修复建议：** 攻击涉及一个存在争议的 DLL 劫持漏洞（CVE-2025-56383），CERT-UA 建议将 Notepad++、WinRAR 等软件更新至最新版本以防御攻击。

**安全圈** *2026年7月26日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/830fccecd7453c2c.webp)

**关键词**

恶意软件

乌克兰 CERT 发现了一系列攻击，这些攻击分发了一个包含合法 Notepad++ 应用程序和名为 LunchPoke 的恶意工具（伪装成插件以建立持久性）的压缩包。

该活动被归因于一个跟踪为 UAC-0099 的威胁集群，该集群主要针对乌克兰的组织，此前曾被认为为 APT44（也称为 Sandworm）发起的攻击提供初始访问权限。

攻击者并未利用任何漏洞或影响该流行软件的供应链入侵。

CERT-UA 观察到 UAC-0099 最近改变了其作案手法，现在分发一个包含伪装成 PDF 文档的 VBS 脚本的 ZIP 压缩包。启动后，该 PDF 会检索另一个名为 Evernote.zip 的压缩文件。

第二个压缩包包含合法编辑器 Notepad++ 8.8.3 版本的完整副本、一个恶意插件（NppExport.dll）、一个受密码保护的压缩包（updater.rar）以及合法的 WinRAR 可执行文件。

VBS 脚本将软件包安装到一个随机命名的目录中，启动 Notepad++，然后通过应用程序正常的插件加载机制加载恶意的 NppExport.dll。

CERT-UA 解释说，这个 DLL 就是 LunchPoke，一个在 Windows 上创建计划任务并解压 RAR 文件内容的工具，包含 RemoteLibUpdater.exe 和 InitTest.dll。

RAR 文件中的可执行文件是 BurnyBear，它是 DLL 文件（即 MatchBoil V2 恶意软件加载器）的加载器。

BurnyBear 还具有一个后备机制，以防启动 RemoteLibUpdater.exe 失败，从而触发针对主机 RAM 和 CPU 的资源耗尽攻击。

后者会创建另一个计划任务，更新其配置和命令与控制（C2）地址，然后使用 WinRAR 解压下载的程序。

CERT-UA 未提及在观察到的攻击中交付的最终 payload、该活动的目的或目标组织。

研究人员提到了 CVE-2025-56383，这是 Notepad++ v8.8.3（这些攻击中使用的确切版本）中的一个 DLL 劫持漏洞，但指出 Notepad++ 团队对此问题提出了异议，声称插件加载是标准功能。

CERT-UA 建议系统管理员将 Notepad++ 更新到 8.9.7 版本、7-Zip 更新到 26.02 版本、WinRAR 更新到 7.23 版本，以防止黑客利用现有产品中的已知漏洞并实现隐蔽攻击。

***END***

阅读推荐

[【安全圈】马斯克为了安全，要把"X"完全开源？](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652077986&idx=1&sn=c72b731dda33c8916f4096cf332615db&scene=21#wechat_redirect)

[【安全圈】每单收超千元服务费，上海警方抓获 3 名外挂代拍违法犯罪人员](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652077986&idx=2&sn=11aa39242de4b5b0197f8676b1c497ea&scene=21#wechat_redirect)

[【安全圈】新型 Dolphin X 恶意软件利用 AI 对高价值目标进行评分排名](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652077986&idx=3&sn=7212e4b798829226046df566ed3e65d8&scene=21#wechat_redirect)

[【安全圈】数百万辆车可被远程熄火！这个漏洞比你想的更恐怖](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652077973&idx=1&sn=c5a357c37a1b18979e6b3c93d7117066&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cf59233925b190a5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8ef99978569138e4.gif)

**安全圈**

←扫码关注我们

**网罗圈内热点 专注网络安全**

**实时资讯一手掌握！**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e09a59ca7314db86.gif)

**好看你就分享 有用就点个赞**

**支持「安全圈」就点个三连吧！**
