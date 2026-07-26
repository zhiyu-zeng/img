---
title: 【微信】Kimi K3撕开Redis防线，一条命令即可从存储直达Shell
source: https://mp.weixin.qq.com/s/axLEHwKCAu7sVL9anEFHqA
source_host: mp.weixin.qq.com
clip_date: 2026-07-26T13:45:52+08:00
trace_id: 700fe98f-dc43-4a4f-9f1a-fac5bc36712c
content_hash: 56432fef3e5e0820dc6c124faac9f03348bc831a3142288b005d26cb75f9e4f0
status: summarized
tags:
  - 微信
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Kimi K3 AI Agent揭露Redis多个版本存在远程代码执行漏洞，攻击者通过已认证凭证和特定命令即可从数据存储访问提升至宿主机Shell。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3a975244-d011-81d1-bded-e5e305c13ad2
ioc:
  cves:
    - CVE-2026-25589
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Kimi K3 AI Agent揭露Redis多个版本存在远程代码执行漏洞，攻击者通过已认证凭证和特定命令即可从数据存储访问提升至宿主机Shell。
> 
> - **漏洞根源：** 流NACK双重释放（CVE-2026-25589）和TDigest堆溢出漏洞，可组合利用实现远程代码执行。
> 
> - **影响范围：** Redis 6.2.22、7.4.9、8.6.4受双重释放影响；Redis 8.8.0中NACK已修复，但内置RedisBloom模块的TDigest漏洞仍可被利用。
> 
> - **利用前提：** 攻击者需获取认证凭证，并可执行EVAL、RESTORE、XGROUP等命令，这些命令在内部部署中通常保持启用。
> 
> - **攻击效果：** 一旦利用成功，可从数据存储权限升级到宿主机Shell，而不导致服务明显崩溃。
> 
> - **防御建议：** 及时升级修复版本、限制或禁用危险命令、网络隔离、强化认证密钥卫生、审计并卸载未使用模块。

**乌雲安全** *2026年7月26日 13:28*

一项与Kimi K3 AI Agent相关的最新研究成果披露了Redis（全球部署最广泛的内存数据存储系统之一）中存在多条已验证的远程代码执行（RCE）路径。

研究表明，研究人员alias Bera Buddies公开的发现涵盖了Redis 6.2.22、7.4.9、8.6.4及8.8.0的官方构建版本，其将流消费组中的共享NACK双重释放问题与RedisBloom TDigest模块中独立的堆溢出漏洞相结合。

Part01

Kimi K3 AI Agent发现0Day

研究人员描述了一种针对官方Redis Docker镜像的非破坏性RCE方法。涉及两类不同的漏洞：

-   流NACK双重释放（属于CVE-2026-25589不完全修复家族）——影响6.2.22、7.4.9和8.6.4版本。流消费组中的共享NACK路径可导致同一堆块被释放两次，为已认证客户端提供可靠的代码执行原语。
    
-   TDigest堆溢出（RedisBloom，内置于8.8.0）——在Redis 8.8.0中，NACK问题已得到修复（PR #15081），但默认TDigest实现中新增的堆溢出漏洞仍可在全新实例上实现RCE。
    

这两种漏洞均需要利用内部部署中通常保持启用的命令：EVAL、RESTORE和XGROUP。8.8.0版本还需要默认附带的RedisBloom模块。

Redis通常位于应用层之后，使用密码保护但暴露完整的命令接口。一旦攻击者通过密钥泄露、SSRF或配置错误的网络ACL获取凭证，便可以从“数据存储访问”升级为宿主机级别的Shell，而不会以明显的方式使服务崩溃。

研究表明，共享NACK双重释放仅在8.8.0版本中完全修复。如果运维人员未应用等效补丁，旧维护分支仍暴露在风险中。与此同时，8.8.0也并非绝对安全：披露时，内置模块中的TDigest漏洞尚未修复。

8.8.0版本的布局敏感性值得注意。TDigest路径依赖于通过堆喷射构造确定的jemalloc布局，因此在全新实例、低并发流量条件下成功率最高——这些条件与许多实验室、CI环境和轻负载生产Pod相符。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/577e67c6b766ec5b.png)

Part02

受影响版本概览

受影响版本及根本原因如下：

-   Redis 6.2.22：流NACK双重释放。官方镜像偏移量；其他构建版本需校准。
    
-   Redis 7.4.9：流NACK双重释放。标准镜像；无需调试标志。
    
-   Redis 8.6.4：流NACK双重释放。标准镜像；无需调试标志。
    
-   Redis 8.8.0：TDigest堆溢出（RedisBloom）。NACK已修复；模块漏洞独立存在。
    

后渗透残留可能留下惰性键或损坏的数据结构。运维人员切勿在不了解残留状态的情况下，对受感染的8.8.0主机盲目执行FLUSHALL/SAVE。

Part03

防御者要点

在厂商补丁覆盖所有分支及RedisBloom模块之前：

-   及时升级至已修复的Redis构建版本；如果Bloom/TDigest仍存在漏洞，切勿假定8.8.0完全安全。
    
-   使用rename-command限制EVAL、RESTORE及相关管理原语等危险命令，或通过Redis ACL禁止应用用户使用这些命令。
    
-   网络隔离——将Redis绑定到私有接口；切勿将6379端口暴露到互联网。
    
-   强化认证与密钥卫生——使用唯一密码，禁止默认凭据，疑似泄露后立即轮换。
    
-   模块审计——如果未使用RedisBloom/TDigest，将其禁用或卸载。
    
-   监控异常的XGROUP/RESTORE/EVAL使用行为及数据目录下意外的键。
    

与Kimi K3相关的研究揭示了2026年一个严酷的教训：AI辅助的漏洞发现正在加速，而像Redis这样的核心基础设施仍是高价值目标。通过不完全修复和内置模块实现的已认证RCE表明，“设置了密码”并非完整的安全策略。

运行Redis 6.2–8.8的组织应清点版本、锁定命令接口，并跟踪Redis和RedisBloom官方公告以获取完整修复方案。

参考来源：

New Kimi K3 AI Agent Uncovers 0-Day Exploits in Redis Server

https://cybersecuritynews.com/redis-server-0-day-exploit/
