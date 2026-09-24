---
title: 【微信】【安全资讯】Linux内核四个本地提权漏洞公开，多个发行版受影响，有漏洞潜伏逾20年
source: https://mp.weixin.qq.com/s?__biz=Mzk0ODM3NTU5MA==&mid=2247498257&idx=1&sn=2d0f7df9b248ca8094c4220b323e5327&scene=58&subscene=0
source_host: mp.weixin.qq.com
clip_date: 2026-09-24T23:22:44+08:00
trace_id: 8163439a-b660-4ac9-8b8f-bb4c5d006820
content_hash: da464106bfa800a021f659366885ece61e375df4d617430c261fbfd0be18e8ca
status: synced
tags:
  - 微信
  - Linux安全
  - 漏洞分析
series: null
feed_source: 公众号·360漏洞研究院（weread）
ai_summary: Linux 内核四个本地提权漏洞（DirtyAH6、TUNderflow、PPPoEject、DiagSpill）被公开，均已实现普通用户到 root 的提权，其中两个还能远程触发，修复已进入上游稳定分支。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-8111-9a68-c9d871e1acb0
ioc:
  cves:
    - CVE-2026-68121
    - CVE-2026-74469
    - CVE-2026-80844
    - CVE-2026-81000
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Linux 内核四个本地提权漏洞（DirtyAH6、TUNderflow、PPPoEject、DiagSpill）被公开，均已实现普通用户到 root 的提权，其中两个还能远程触发，修复已进入上游稳定分支。
> 
> - **漏洞成因：** DirtyAH6 在 IPv6 AH 头处理中未校验 segments_left，越界指针交给 memmove；TUNderflow 借 netkit/VXLAN/OVS/TUN 链把过大 headroom 传入 TUN 引发长度下溢；PPPoEject 是底层重分配释放缓冲区后仍写旧地址的释放后使用；DiagSpill 在 SCTP 诊断导出中用 16 位计数，65,536 回绕为 0，导致约 8 MB 越界写。
> - **门槛差异：** DiagSpill 最危险，只需启用 SCTP 与 sctp_diag，普通本地用户无需用户命名空间或特权 capability 即可触发；其余三个要求允许创建非特权用户/网络命名空间，并具备 CAP_NET_ADMIN（DirtyAH6 另需 CAP_NET_RAW）。
> - **远程路径：** DirtyAH6 可打以传输模式添加 AH 的 IPv6 路由器或网关，导致远程崩溃乃至实验环境下的远程 root；DiagSpill 需远端启用 SCTP ASCONF/ADD-IP 且开启 SCTP-AUTH 或 addip_noauth_enable（默认关闭）。
> - **影响与验证：** 已在 Fedora 43/44 与 Ubuntu 24.04 系列完成提权验证，四个缺陷都能从容器触发宿主机内核内存破坏。
> - **修复处置：** 首批含全部修复的稳定版为 5.10.270、5.15.221、6.1.188、6.6.157、6.12.109、6.18.50、7.2.4；优先升级内核，无法升级时收紧非特权用户命名空间、核查 AH6/TUN/PPPoE/SCTP 模块加载，并审计容器进程的 CAP_NET_ADMIN、CAP_NET_RAW 授权。

9月18日，安全研究人员 Asim Manizada 在其博客上公开了四个Linux内核本地提权漏洞 DirtyAH6、TUNderflow、PPPoEject 和 DiagSpill；并且四个漏洞均完成了从普通用户到 root 的提权利用。其中，DirtyAH6 与 DiagSpill 漏洞具有远程触发路径，可导致内核崩溃和拒绝服务，并且研究员在实验环境下通过DirtyAH6 漏洞实现了远程 root利用。相关修复已进入上游稳定分支。

DirtyAH6（CVE-2026-80844）发生在 IPv6 AH 路由头处理过程。内核根据报文头长度计算地址数量后，未验证 segments_left 是否超出范围，可能将指针移到缓冲区外，再把错误长度交给 memmove()，造成越界访问。

TUNderflow（CVE-2026-81000）与 TUN 设备的接收预留空间有关。研究者构造了涉及 netkit、VXLAN、Open vSwitch 和原始 TUN 端口的网络设备处理链，使过大的接收预留空间（headroom）传给 TUN；后续长度计算发生下溢，最终使 skb 数据指针越过实际分配的缓冲区。

PPPoEject（CVE-2026-68121）是一次典型的“指针过期”：PPPoE 发送路径保留了指向数据包头部的指针，但底层设备在生成链路层头时可能重新分配并释放原缓冲区。代码随后继续写入旧地址，形成释放后使用。

## DiagSpill 计数回绕

DiagSpill（CVE-2026-74469）则出在 SCTP 诊断信息导出。对端传输地址计数使用16位字段，达到65,536时回绕为零；sctp_diag 依此预留了过小的 Netlink 响应空间，却仍复制完整列表，研究者称越界写入规模约为8 MB。

DiagSpill 尤其值得关注：在 SCTP 和 sctp_diag 被启用的系统上，普通本地用户无需创建非特权用户命名空间，也无需特权capability，就能触发内存破坏。前三个漏洞则需要系统允许创建非特权用户和网络命名空间，或在攻击者可控的网络命名空间内具备相应 capability：DirtyAH6 要求 CAP_NET_ADMIN 和 CAP_NET_RAW，TUNderflow 与 PPPoEject 要求 CAP_NET_ADMIN。三者分别涉及 AH6/XFRM、TUN 和 PPPoE 网络模块。

研究者已在 Fedora 43、Fedora 44 及 Ubuntu 24.04 系列系统上完成提权验证，公开 PoC 针对相应内核版本进行了适配。容器环境同样值得关注。研究者称，四个缺陷都可从容器触发宿主机内核内存破坏。

## DirtyAH6 远程利用

DirtyAH6 的远程攻击针对以传输模式添加 AH 的 IPv6 路由器或网关。攻击者可触发内核越界访问，造成远程崩溃或拒绝服务。研究者还在实验环境下，通过目标机上的辅助内存布局实现了远程 root。

DiagSpill 的远程触发需要启用 SCTP ASCONF/ADD-IP，并同时启用 SCTP-AUTH 或 net.sctp.addip_noauth_enable 配置（这些配置默认没有启用）。恶意对端可通过增加传输地址使计数回绕；目标机随后发起 sock_diag 请求时，内核会向 Netlink 响应缓冲区外写入数据，引发远程崩溃或拒绝服务。

## 修复版本与缓解措施

研究者列出的首批同时包含四项修复的上游稳定版本为 5.10.270、5.15.221、6.1.188、6.6.157、6.12.109、6.18.50 和 7.2.4。企业排查时应同时核对发行版安全公告和实际内核补丁；处置上应优先安装包含修复的内核版本。暂时无法更新的系统，可收紧非特权用户命名空间，并检查 AH6、TUN、PPPoE、SCTP/sctp_diag 的内核模块是否被加载，通过临时禁止不需要的相关模块被加载来缓解对应漏洞。

容器环境则应核查是否授予普通进程CAP_NET_ADMIN、CAP_NET_RAW 等 capability权限，以及宿主机相关内核模块的启用情况。

参考来源：

\[1\] Asim Manizada：A quartet of Linux local root vulns

https://heyitsas.im/posts/lpe-quartet/

\[2\] Asim Manizada：oss-security 邮件列表通报，2026年9月17日

https://www.mail-archive.com/oss-security@lists.openwall.com/msg04254.html

\[3\] https://github.com/manizada/DirtyAH6

\[4\] https://github.com/manizada/TUNderflow

\[5\] https://github.com/manizada/PPPoEject

\[6\] https://github.com/manizada/DiagSpill

建议您订阅360数字安全-漏洞情报服务，获取更多漏洞情报详情以及处置建议，让您的企业远离漏洞威胁。

邮箱：360VRI@360.cn

网址：https://vi.loudongyun.360.net

360 漏洞研究院，隶属于360数字安全集团。其成员常年入选谷歌、微软、华为等厂商的安全精英排行榜, 并获得谷歌、微软、苹果史上最高漏洞奖励。研究院是中国首个荣膺Pwnie Awards“史诗级成就奖”，并获得多个Pwnie Awards提名的组织。累计发现并协助修复谷歌、苹果、微软、华为、高通等全球顶级厂商CVE漏洞3000多个，收获诸多官方公开致谢。研究院也屡次受邀在BlackHat，Usenix Security，Defcon等极具影响力的工业安全峰会和顶级学术会议上分享研究成果，并多次斩获信创挑战赛、天府杯等顶级黑客大赛总冠军和单项冠军。研究院将凭借其在漏洞挖掘和安全攻防方面的强大技术实力，帮助各大企业厂商不断完善系统安全，为数字安全保驾护航，筑造数字时代的安全堡垒。
