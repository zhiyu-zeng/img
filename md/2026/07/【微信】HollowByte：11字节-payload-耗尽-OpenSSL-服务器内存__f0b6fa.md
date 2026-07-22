---
title: 【微信】HollowByte：11字节 payload 耗尽 OpenSSL 服务器内存
source: https://mp.weixin.qq.com/s/7UZpHD2ODjF-HBUyARQB-w
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T16:33:38+08:00
trace_id: 81544050-a174-4ac5-937c-cf70c95fc71a
content_hash: a98e44d30dd81fec9c195355d1b8f660f4c234a8a7ef61bd0cfacc9181d81566
status: summarized
tags:
  - 微信
  - 协议分析
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: HollowByte 漏洞允许未认证攻击者通过仅 11 字节的恶意 payload 触发 OpenSSL 服务器拒绝服务，需立即升级修复版本以防止内存耗尽。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3a575244-d011-811d-b0a2-ce81cc451d71
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> HollowByte 漏洞允许未认证攻击者通过仅 11 字节的恶意 payload 触发 OpenSSL 服务器拒绝服务，需立即升级修复版本以防止内存耗尽。
> 
> - **漏洞原理：** TLS 握手过程中，服务器先根据消息头声明分配内存而不验证实际数据大小，攻击者可声明大消息但发送小数据，导致内存过度分配。
> - **攻击效果：** 通过重复连接发送随机大小声明，堆被碎片化，服务器常驻内存（RSS）持续攀升，即使断开连接后内存仍不释放，需重启进程恢复。
> - **影响范围：** OpenSSL 嵌入于 NGINX、Apache、Node.js、Python 等流行软件中，低容量环境易被耗尽，高规格服务器可能损失高达 25% 内存。
> - **修复措施：** OpenSSL 已在 4.0.1 及多个旧版本中修复，修复方式为仅在数据到达时扩展缓冲区，忽略标头中的大小声明。

**代码卫士** *2026年7月22日 16:11*

聚焦源代码安全，网罗国内外最新资讯！

**编译：代码卫士**

**一个名为** **“HollowByte** **（空心字节）”** **的漏洞可导致未认证攻击者，通过仅有** **11** **个字节大小的恶意** **payload** **在** **OpenSSL** **服务器上触发拒绝服务条件。** **OpenSSL** **团队已悄悄修复该漏洞（无编号）并将补丁向后移植到老旧版本。**

由于OpenSSL 软件是安全互联网通信的基础性支柱，各组织机构应优先切换到已修复版本的库。

**“空心字节”详情**

前不久，Okta 公司发布公告说明了“空心字节” DoS漏洞的工作原理及其在实际场景中的影响。研究人员解释称，在TLS握手过程中，每条消息都有一个4字节的标头，用于声明传入消息的大小。然而，受影响的OpenSSL版本在接收 payload 并检查大小之前，会先按声明的长度分配内存。每条TLS握手消息均以一个4字节的握手标头开始，其中包含一个三字节的长度字段，用于说明后续握手数据的大小。服务器在没有验证 payload 的情况下，会信任数据包的声明并按指示分配内存。“工作线程随后阻塞，无限期地等待永远不会到达的数据”。

未经身份验证的攻击者可以通过打开一个TLS连接并发送一个11字节的恶意输入来触发“空心字节”，该输入在标头中声明将有一个大得多的消息体紧随其后。攻击者在多个连接上重复相同过程，导致服务器通过相对少量的已传输数据分配大量内存。

研究人员指出，虽然OpenSSL在连接断开时会释放缓冲区，但GNU C库（glibc）对内存的处理方式不同，“不会立即将小到中等大小的分配归还给操作系统，而是保留它们以备将来重用。通过发起一系列连接，并随机化声明的大小，攻击者可以阻止分配器重用那些已被释放的内存块。堆被严重碎片化，导致服务器的常驻集大小（RSS）持续攀升。即使在攻击者断开连接后，服务器仍然永久性地膨胀。”完全回收这些空间的唯一方法是重新启动进程。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ae040977292eb598.gif)

**影响与修复**

OpenSSL开源库被嵌入到流行的软件项目中，如NGINX和Apache Web服务器、语言运行时（例如Node.js、Python、Ruby、PHP）以及数据库（MySQL、PostgreSQL）中。它预装在大多数Linux发行版中，用于TLS加密和证书处理。

Okta对NGINX的测试表明，低容量环境可以很容易地通过“空心字节”耗尽内存，而更高规格的服务器可能会损失多达25%的内存，同时攻击带宽仍低于安全告警阈值。尽管DoS漏洞被视为不如数据窃取或代码执行漏洞严重，但它们可能导致运营中断和声誉损害。

OpenSSL 已在 4.0.1 版本中修复“空心字节” DoS 问题，并向后移植到3.6.3、3.5.7、3.4.6和3.0.21版本，这些版本现在仅在数据到达时才扩展缓冲区，而忽略标头中的大小声明。尽管该问题被作为“加固修复”而非安全漏洞处理，但研究人员仍建议“立即升级所用发行版的OpenSSL软件包”。

开源卫士试用地址：https://oss.qianxin.com/

代码卫士试用地址：https://sast.qianxin.com/

* * *

**推荐阅读**

[OpenSSL 漏洞可导致密钥恢复、代码执行、DoS 攻击](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247524150&idx=2&sn=340e39d88a6552181d0f4433ab94ef67&scene=21#wechat_redirect)

[OpenSSL 高危漏洞可用于中间人攻击](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247522210&idx=2&sn=98a6271cd5d293a67b756477a83dfab3&scene=21#wechat_redirect)

[戴尔、惠普等设备被指使用过期的OpenSSL版本，易引发供应链攻击](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247514771&idx=3&sn=c830e03f4b8b8fc4ad7c8ce0406d934a&scene=21#wechat_redirect)

**原文链接**

https://www.bleepingcomputer.com/news/security/hollowbyte-ddos-flaw-bloats-openssl-server-memory-with-11-byte-payload/

题图：Pixabay License

**本文由奇安信编译，不代表奇安信观点。转载请注明“转自奇安信代码卫士 https://codesafe.qianxin.com”。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/878750e44b5287d5.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/054b399b906220a0.jpg)

**奇安信代码卫士 (codesafe)**

国内首个专注于软件开发安全的产品线。

觉得不错，就点个 “在看” 或 "赞” 吧~

开源 · 目录
