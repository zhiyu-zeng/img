---
title: 【微信】拆解小红书存储底座 04｜从对象到文件：RedStore SSD 引擎与 RedFS 的设计与实践
source: https://mp.weixin.qq.com/s/pPKANOZ5N1pSV3lM5O-dWQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T20:46:35+08:00
trace_id: e4c982e4-5272-4111-9dfd-1b7873ce6512
content_hash: c589d010b3e18125c2177fb8abac6bdf2206760737bc4998f339cffa609d4d94
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
notion_page_id: 41475244-d011-818f-9642-c4357e763999
ioc: null
---

**小红书技术REDtech** *2026年11月10日 17:59*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/739314b6ecb1903a.jpg)

**导读**

小红书的存储与数据库体系覆盖 MySQL、RedKV、Redis、ROS 等产品，DMS、RedDTS 等公共能力分别提供统一管控和数据传输支持。RedStore 是小红书对象存储 ROS 与文件系统 RedFS 共用的池化存储底座。其 SSD 引擎从支撑高性能对象存储 ROS Express 起步，进一步通过 RedFS 扩展到 AI 训练文件场景，服务样本读取与 Checkpoint 读写。

本文先介绍 SSD 引擎在网络通信、本地 IO 与数据放置上的优化，再展开 RedFS 在文件元数据、访问路径和写入一致性上的设计，说明从高性能对象存储扩展到并行文件系统所需的关键能力与工程取舍。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/118640b0b602b7de.png)

**01**

**共享底座的设计挑战**

如图 1 所示，ROS Express 与 RedFS 通过不同接入路径共享 RedStore SSD 数据面，并在此基础上推进对象与文件的协议融合。要同时支撑高性能对象与 AI 训练文件场景，这套底座面临三项设计挑战。

**高密机型的带宽利用。** 为降低单位存储成本，我们采用高密机型，提高单机和单位机架空间的容量密度。数据面需要充分利用磁盘与网络带宽，让高密部署同时满足业务的吞吐需求。

**容量成本与介质选择。** RedStore 按负载选择介质。对读多写少、容量需求大的训练数据集和对象数据，优先用 QLC 降低单位容量成本。写入更集中的 Checkpoint 则优先用 TLC。采用 QLC 时，还需控制写放大，减少额外写入对带宽和耐久度的消耗。

**共享引擎与文件语义。** 从对象扩展到文件，RedStore 引擎需要支持可追加分片（Append）；RedFS 则需要支持目录与文件元数据的独立扩展，并解决多客户端访问下的写入一致性问题。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8f07491d98bae7c.png)

图 1｜共享底座架构与对象、文件协议融合方向。对象侧（RedIndex）与文件侧（HNS、FNS）元数据均属 RedDB MetaKV 系列，当前正在推进对象向 HNS/FNS 的协议融合。

**02**

**RedStore SSD 数据节点的读写路径与性能优化**

在 RedStore 的 2U 存储节点上，24 块 QLC SSD 的顺序读带宽估算约为 192 GB/s，与四张 400G 网卡的单向总带宽（200 GB/s）相近。客户端实际能读多快，还取决于软件如何在 SSD 与网卡之间传递数据，以及如何分配处理并发请求的 CPU 资源。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b6e0b6ea7d2ad1d.png)

图 2｜RedStore SSD 引擎的读写路径、线程分工与 2U 24 盘机型的 NUMA 拓扑

**内存访问优化。** 在零拷贝路径上，网卡和 SSD 共用 DMA 缓冲区，缓冲区按 NUMA 就近分配。网卡直接将 SSD 读出的数据发回客户端，写入时则由数据节点用 RDMA READ 拉取客户端数据，再通过 SPDK 写盘。

**4 KB 对齐写与盘端读校验。** 在 4 KB + 64 B 格式下，RedStore 将保护信息（PI）、分片编号和分片内页号存入 64 B 元数据区。业务数据独占 4 KB 数据区，一次对齐的 4 KB 写入不会因附加数据头而跨逻辑块。读取时，SSD 利用 PI 校验数据，省去 CPU 对整块数据的额外扫描。

**同核与分核的取舍。** 对时延敏感的负载，RedStore 可采用同核模式（RTC），让同一线程处理网络收发和磁盘 IO，省去跨核投递。近几代服务器 CPU 主频提升有限，而 NVMe SSD 的单盘随机读 IOPS 增长较快。小块读请求密集时，盘还有余力，这个核却可能已经跑满。这时可以分核处理，RDMA 线程通过消息把请求交给单盘独占的 SPDK 线程，分担单核压力并保持磁盘操作无锁。

**单机吞吐实测。** 采用 128 KB IO 时，随机读吞吐达到 **184.8 GB/s**。读路径上，SSD 写一次内存，网卡读一次内存。实测内存读写带宽之和约为业务读带宽的 2.25 倍，接近 2 倍的理论下限。读写比为 4∶1 时， **读写双向合计吞吐达到 232.2 GB/s。**

**03**

**降低 QLC SSD 的写放大**

在我们的业务中，QLC SSD 主要承载读多写少的热数据，以降低单位容量成本。部分数据转冷后，可按生命周期策略沉降到 HDD。如果失效时间不同的数据混在同一擦除单元里，SSD 在垃圾回收（GC）时就可能需要搬迁仍然有效的数据。这些额外写入既占用写带宽，也会加快闪存磨损，对擦写耐久度较低的 QLC 尤其不利。

**TRIM 与 FDP 的分工。** 接入层根据对象的 TTL（存活时间）和过期策略给出预计失效时间。写入时，RedStore 数据节点按剩余 TTL 将数据分为四档。对启用 FDP（Flexible Data Placement）的 SSD，数据节点在 NVMe 写命令中附上该档的放置标识，让预计失效时间相近的数据写在一起。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/752a8c79075c5fb3.png)

图 3a｜FDP 写入路径。四档各对应一个回收单元句柄（RUH），右侧色块表示写入当前回收单元（RU）的数据。

分片删除后，RedStore 再通过 TRIM 批量告知 SSD 哪些逻辑块已经释放。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f9884eaf298d8252.png)

图 3b｜删除 Transient（极短寿命）数据后的回收差异。两列各取一个 RU，右列以 Transient 档为例。

如果实际删除时间偏离预期，SSD 回收时可能仍需搬迁部分有效数据，但分档偏差不影响读写的正确性。RedStore 按盘使用 FDP，同一集群可以混用启用和未启用 FDP 的盘，上层业务沿用原有的对象或文件接口。

我们在大普微 R6060 和华为 OceanDisk 上适配了同一套 FDP 放置策略，并与大普微联合优化了 R6060 的固件。双方在 FMS 2026（https://en.dapustor.com/news/155.html）分享了 R6060 的对照测试结果。在相同写入负载下，混合放置时的稳态写放大约为 1.78，按剩余寿命分组后降至约 1.11。

**04**

**RedFS 在 RedStore SSD 引擎上的读写路径**

本系列 03 篇介绍了 RedStore 如何支撑 ROS Express 的对象读写。在后续迭代中，我们将这套底座扩展到文件场景，首先在 RedStore SSD 引擎上构建了面向 AI 训练的高性能并行文件系统 RedFS。

**文件访问。** RedFS 客户端 RedFuse 借鉴了开源项目 DeepSeek 3FS（https://github.com/deepseek-ai/3FS）将文件挂载与用户态 IO 结合的设计，感谢 DeepSeek 团队的开源分享。训练程序既可以通过 FUSE 挂载直接按标准文件接口访问（无需修改代码），也可以通过 USRBIO 零拷贝接口直接提交大块读写请求。RedFuse 根据文件布局把文件偏移映射到分片，经 RDMA 直接访问对应的数据节点。

**文件元数据。** 我们参考 Mantle（https://dl.acm.org/doi/10.1145/3731569.3764824）的设计，基于 RedDB 自研了元数据服务，目标是管理百亿级元数据记录。HNS（层级命名空间）集中存储目录树并在内存中缓存目录信息，缩短按路径查找文件的时间。FNS（扁平命名空间）分散存储文件大小和数据位置，可以并行处理对不同文件的查询。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/911febca053d4866.png)

图 4｜RedFS 的文件访问路径与元数据分工

**客户端纠删码（EC）。** RedFS 按 4 MiB 逻辑块管理文件，支持最小 64 KiB 粒度的追加写入。RedFuse 将已有 Redo 尾部与新数据拼合，凑满的完整条带逐条编码并释放旧 Redo，剩余未满条带的尾部通过 RedStore 的 Append 接口写入 Redo 日志分片。以 4+2 为例，每个条带的四个数据段直接引用原始内存，客户端用它们生成两个等长的校验段。一次写入多个条带时，同一列的数据追加到同一个分片，六个分片并行写入对应的数据节点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2f3b71f47fd5d1a2.png)

图 5｜RedFuse 文件追加中的条带式纠删码（4+2 示例）

**文件级写委托（Write Delegation）。** 追加数据、覆盖已有内容或截断文件，都需要写委托。为避免多个客户端同时修改同一文件，HNS 同一时刻只把该文件的写委托授予一个客户端。交接时，原客户端完成在途写入、提交文件布局并交还委托，再由新客户端接手；数据节点也会校验写者身份，拒绝旧写者的过期写入。

**05**

**未来展望**

我们正在推进对象与文件的协议融合，目标是让目录桶中的 ROS 对象名和 RedFS 文件路径指向同一份数据。文件生命周期管理以透明沉降为核心。冷数据按策略迁移到低成本存储层后，业务仍可通过原文件路径访问。

接下来，我们会继续与更多厂商合作，协同优化存储引擎与盘框等存储硬件，以更低的成本提供高性能存储。

下一篇我们将拆解 RedTAO 2.0，看万亿级图数据库如何撑起推荐与搜索里的关系数据。

.

**作者简介**

-   小粟，小红书文件与块存储组负责人。主导 RedStore SSD 引擎的设计与研发，目前负责面向 AI 训练的并行文件系统 RedFS 与块存储系统。
    
-   子原，小红书资深存储研发工程师。负责面向 AI 训练的并行文件系统 RedFS 与 高性能 IO 链路的设计与研发。
    
-   许临，小红书资深存储研发工程师。负责 RedStore SSD 存储引擎及 RedFS 数据面的设计与研发。
    
-   淳风，小红书资深存储研发工程师。主要负责 RedFS 文件系统与元数据服务的设计与研发。
    
-   沃奇，小红书存储研发工程师。负责 RedFS 扁平命名空间（FNS）及元数据客户端 SDK 的设计与研发。
    

**部门介绍：**

存储&数据库部，为小红书全业务场景打造行业领先的高可用、高可靠、高性能、低成本的存储和数据库类产品技术服务。团队致力于用精英化的组织和行业领先的技术理念，先于业务布局和行动，为公司业务的快速发展提供充足“弹药”，同时也让小红书存储和数据库成为行业该领域的标杆。

.

**招聘**

分布式存储研发工程师（文件/块存储）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/19e92b44690c8e60.png)

小红书招聘

精彩回顾：

[拆解小红书存储底座 00｜从孤岛走向融合：小红书存储与数据库架构进化](https://mp.weixin.qq.com/s?__biz=Mzg4OTc2MzczNg==&mid=2247496855&idx=1&sn=f426a8f58708ca0fbef34b7e3308e468&scene=21#wechat_redirect)

[拆解小红书存储底座 01｜多源数据传输总线 RedDTS 2.0](https://mp.weixin.qq.com/s?__biz=Mzg4OTc2MzczNg==&mid=2247496885&idx=1&sn=fcecfc62b3f876191ebaf931ace2ecc4&scene=21#wechat_redirect)

[拆解小红书存储底座 02｜让 AI 成为团队的一员：存储数据库助理实践](https://mp.weixin.qq.com/s?__biz=Mzg4OTc2MzczNg==&mid=2247496958&idx=1&sn=bafda0c7a7030b5542ae6c54f26876d5&scene=21#wechat_redirect)

[拆解小红书存储底座 03｜从存得下到读得快：小红书自研对象存储实践](https://mp.weixin.qq.com/s?__biz=Mzg4OTc2MzczNg==&mid=2247496995&idx=1&sn=4f8f5120b9fff8d77f0c8c9d9c590fee&scene=21#wechat_redirect)
