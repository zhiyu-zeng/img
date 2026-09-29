---
title: 【微信】Linux容器逃逸漏洞细节及概念验证（PoC）代码披露
source: https://mp.weixin.qq.com/s/blesnGMBRJCqH2ImkBSaRg
source_host: mp.weixin.qq.com
clip_date: 2026-09-29T20:50:17+08:00
trace_id: 59aee6fb-c98b-4003-8107-679d59e5f3c6
content_hash: 6310f0384b8b39c29e996b8c4ed0f42f186d366f8a27faad3322e32fb3f3c5fe
status: synced
tags:
  - 微信
  - 漏洞分析
  - Linux安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Linux内核AF_UNIX垃圾回收机制存在释放后重用漏洞，未特权攻击者可借此逃逸容器并控制宿主机，PoC已公开且暂无野外利用。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ea75244-d011-810c-8ee2-f7c79c285eeb
ioc:
  cves:
    - CVE-2026-80521
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Linux内核AF_UNIX垃圾回收机制存在释放后重用漏洞，未特权攻击者可借此逃逸容器并控制宿主机，PoC已公开且暂无野外利用。
> 
> - **漏洞位置：** AF_UNIX套接字家族中处理SCM_RIGHTS消息的垃圾回收（GC）例程，影响支持该机制的Linux内核版本。
> - **触发机理：** 内核在将套接字缓冲区入队前先发布图边，GC可能过早观察到新边；若回收器释放顶点却未将其从持久化的scc_entry强连通分量环中摘除，下次回收即解引用悬空指针，形成UAF并实现内核级代码执行。
> - **披露情况：** DepthFirst AI研究员Zhenpeng Lin用dfs-large1检测模型发现，2026年7月在Google kernelCTF竞赛完成零日利用演示；安全团队确认尚无犯罪团伙在野主动利用，但技术分析与可用利用代码已公开。
> - **验证与影响：** 公开PoC在Ubuntu 26.04上可运行；漏洞同时削弱nsjail、Firejail、Bubblewrap等用户态隔离工具效果，逃逸后可访问底层主机并攻陷同一物理节点上的其他工作负载。
> - **缓解建议：** 上游正在准备修复GC逻辑的补丁；过渡期应以microVM（微虚拟机）平台隔离不可信负载，使攻击即使成功也仅危及一个临时虚拟客户机实例。

**sec随谈** *2026年9月29日 20:18*

**摘要**  
安全研究人员披露了一个影响核心操作系统内核的严重Linux容器逃逸漏洞。该漏洞允许未获得特权的攻击者通过触发一个释放后重用（use-after-free）条件从隔离环境中逃逸出来。目前该漏洞的技术细节和一个可用的利用程序已经公开，这使得未打补丁的云端部署面临主机被完全控制的风险。

**为何重要**  
数以百万计的企业服务器部署容器引擎来隔离微服务。因此，这种隔离模型的失效威胁到全球范围内的多租户云平台。攻击者一旦从容器中逃逸，就能直接访问底层主机系统。由此，入侵者可以攻陷同一物理节点上的所有其他工作负载。

来自DepthFirst AI的安全研究员Zhenpeng Lin使用dfs-large1漏洞检测模型发现了该漏洞。2026年7月，研究人员演示了一个零日漏洞利用，从而在谷歌的kernelCTF竞赛中赢得了一个席位。安全团队已确认目前没有网络犯罪团伙在野外进行主动利用。不过，研究人员已经公开发布了技术分析和可用的漏洞利用代码。Lin在公告中警告称："容器已不再是一个安全的边界了。"因此，防御方必须重新评估其安全边界假设。

**攻击原理**  
该漏洞存在于处理本地进程间通信的AF_UNIX套接字家族中。具体而言，该缺陷影响的是SCM_RIGHTS消息的垃圾回收（GC）例程。Lin解释说："该漏洞存在于AF_UNIX垃圾回收（GC）机制中，具体是在其处理SCM_RIGHTS消息的方式上。"当多个进程交换文件描述符时，内核会追踪循环的套接字引用以避免内存泄漏。

在消息传递过程中，内核会在安全地将套接字缓冲区加入队列之前先发布图的边（graph edges）。这一时序上的间隙使得垃圾回收器有可能过早地观察到新的边。如果回收器释放了一个顶点，它却未能将该顶点从缓存的强连通分量（SCC）环中解除关联。Lin指出："致命的缺陷在于，在顶点被释放之前，没有任何机制将其从持久化的scc_entry环中移除。"当下一次回收过程运行时，内核会解引用这个已失效的悬空指针。这一操作会触发释放后重用（use-after-free）的内存损坏。处于受限沙箱内的攻击者可以触发这一竞态条件，从而执行内核级别的代码。

**受影响版本**  
该漏洞影响支持AF_UNIX垃圾回收机制的Linux内核版本。测试证实，公开发布的漏洞利用代码可在Ubuntu 26.04系统上运行。此外，该漏洞还削弱了诸如nsjail、Firejail和Bubblewrap等用户空间隔离工具的防护效果。

**补丁或缓解措施**  
上游内核开发者正在准备安全补丁，以修复存在缺陷的垃圾回收逻辑。在此期间，管理员必须立即采取防御措施，以保护多租户基础设施的安全。

安全团队可以在DepthFirst AI研究门户上查阅完整的研究报告。此外，工程师们可以在GitHub上的kernelCTF漏洞利用代码库中审查已发布的概念验证（PoC）代码。为防范此Linux容器逃逸漏洞，各组织应使用microVM（微虚拟机）平台隔离不受信任的工作负载。这类虚拟化工具会为每个工作负载分配一个专用的轻量级内核。因此，即便该Linux容器逃逸漏洞被利用，也只会导致一个临时的虚拟客户机实例被攻陷。

参考链接：

https://depthfirst.com/research/containers-are-no-longer-safe

https://github.com/Markakd/security-research/tree/kernelctf-exp557-cve-2026-80521/pocs/linux/kernelctf/CVE-2026-80521_lts
