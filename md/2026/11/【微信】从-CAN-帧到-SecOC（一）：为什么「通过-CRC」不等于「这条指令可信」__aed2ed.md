---
title: 【微信】从 CAN 帧到 SecOC（一）：为什么「通过 CRC」不等于「这条指令可信」
source: https://mp.weixin.qq.com/s/u1O87rfsza0n0UpefxrKVw
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T20:43:53+08:00
trace_id: 9cb978a6-8705-43da-8ead-8c162b0644c4
content_hash: 759f09637173bde358fcf8c034192cb3744b753c0b93ab19f145010256da41ba
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41475244-d011-8153-866f-dedd2c2232e8
ioc: null
---

**谈思实验室** *2026年11月10日 17:54*

谈思实验室

获取更多汽车网络安全资讯

这一栏关于汽车安全技术研究的板块我们会按篇往前推，不再是零散随笔。第一期先把最底层的账算清楚：CAN 到底保证了什么、没保证什么，SecOC 补上了哪三件事，以及为什么密钥和边界比算法选择更常决定成败。后续依次展开密钥管理与 HSM/SHE、TARA 驱动的覆盖率取舍、诊断与 OBD 安全、车载以太网与 SOME/IP、以及 GB 44495 通信安全域的证据组织。（末尾扫码加入汽车网安人专业社群，获取更多）

**CAN 保证了什么**

经典 CAN 数据帧的常引字段是：帧起始 SOF 1 位；仲裁场含 11 位标准标识符（扩展帧为 29 位）及 RTR 位；控制场含 IDE、保留位与 4 位 DLC；数据场 0—8 字节；CRC 序列 15 位加 1 位 CRC 界定符；ACK 槽与 ACK 界定符；帧结束 EOF 7 位。字段位数以所采用的 ISO 11898-1 版本与控制器手册为准，工程上不要只凭记忆填 ARXML。

仲裁采用非破坏性位仲裁：显性位覆盖隐性位，ID 数值越低优先级越高；多个节点同时发送时，低优先级节点在仲裁失败处自动转为接收并重试。CRC、ACK、位填充与错误帧机制服务于 **链路层错误检测与重传**，不是对发送方身份的密码学证明。

由此直接导出三类风险：

-   **伪造**。 任意拥有总线访问权的节点，或经某个被攻破 ECU 边界进入的攻击者，都可以按目标 ID 构造报文；接收 ECU 通常按 ID 与校验接收，难以判断「这条指令是谁发的」。
    
-   **重放**。 合法报文被捕获后在同一总线重发，CRC 与重传机制不会把「合法的旧报文」识别为攻击。
    
-   **可观测**。 CAN 广播、数据场短、无端到端加密，明文控制量、传感器状态与 ECU 交互关系可被长期观察与关联。
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/821bdef877dbe25a.png)

图 1｜CAN 帧结构示意（标准帧 / 扩展帧 / CAN FD 数据场对比）

要特别强调攻击成立的前提：攻击者通常需要物理接入 OBD-II，或已攻破具有 CAN 接口的可信 ECU / IVI，或拥有可写入目标总线的诊断权限。经典 CAN 不校验「报文语义是否符合车辆当前状态」，因此「报文通过 CRC」并不等于「指令合理」。这一点解释了 2015 年 Jeep 事件中车机被攻破后的 CAN 控制，也解释了本期新闻栏目里车机与 CAN 边界为何反复被提起。

**CAN FD 改了什么，没改什么**

CAN FD 保留 SOF、ID 仲裁、ACK、EOF 与逐位仲裁，在控制场增加 FDF、BRS（比特率切换）、ESI 等标志，允许数据段使用更高波特率，DLC 支持最多 64 字节有效载荷，并采用更强的 CRC 多项式与固定填充位机制以适应更大数据场。BOSCH 于 2012 年发布该协议，2015 年被纳入 ISO 11898-1:2015。

它改的是带宽与长帧的校验强度， **没改** 「无认证、无加密、广播」这三条。因此在 8 字节经典 CAN 上，SecOC 的截断压力很大；CAN FD 能缓解数据场被认证字段挤占的问题，但「上了 CAN FD 就安全」并不是可以从规范推出的结论。是否采用 CAN FD、如何分配数据 / 新鲜度值 / MAC、是否拆分 Secured I-PDU 与 Cryptographic I-PDU，应由总线负载、实时性预算、ECU 算力、密钥隔离和 TARA 结果共同决定。

**SecOC 补上的三件事：真实性、完整性、抗重放**

AUTOSAR SecOC 的目标是在已有车载通信之上提供消息真实性、完整性与抗重放能力，不提供保密性。规范定义的是「认证什么、怎么验证」，密钥的全生命周期管理仍由项目安全概念与硬件能力承担。

典型的发送侧流程：以受保护 I-PDU、Data ID、完整 Freshness Value 与密钥作为输入计算认证值（工程中常见 AES-128-CMAC，但这是项目配置，不是规范对所有项目的唯一强制）；随后按配置对 MAC 与新鲜度值做截断，与原始 I-PDU 一起组成 Secured I-PDU 发送。接收侧并不是简单比对帧尾几个字节，而是解析被截断字段、借助 FVM 重建预期新鲜度值、重新计算验证值、比较结果并完成重放检查；通过则向上层交付原始 I-PDU，失败则丢弃并记录安全事件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a657a5f6e27a666.png)

图 2｜SecOC 消息认证与新鲜度验证流程（Sender / Receiver）

这里有一个常被写错的表述：SecOC 验证失败后的整车行为（进入降级模式、保持上一有效值、触发安全状态等）属于项目安全概念，不是 SecOC 模块本身固有的唯一响应。把「验证失败就关闭发动机」写成规范结论，是典型的技术文章误导。

**新鲜度值：抗重放的核心，也是最容易配错的地方**

Freshness Value（FV）的作用是让同一份报文载荷在不同时刻生成不同的认证上下文，接收端据此拒绝旧报文。公开工程资料中常见的复合结构为 Trip Counter + Reset Counter + Message Counter（分 Upper / Lower）+ Reset Flag，并由 FVM（Freshness Value Manager）通过同步报文或同步请求维持收发端状态。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3511499781051d22.png)

图 3｜AUTOSAR SecOC Freshness Value 结构示意

两个长度参数值得单独记住：SecOCFreshnessValueLength 是完整新鲜度值的长度，SecOCFreshnessValueTxLength 是实际随报文传输的截断长度。截断能省带宽，但把「状态同步」变成了系统级问题——ECU 上电恢复、蓄电池断电、网关重启、总线长期静默、多接收节点失步，都可能导致合法报文被拒。因此重同步策略、超时窗口、FV 持久化与重启恢复策略，必须和报文周期、网络管理一起设计，而不是配置完 MAC 长度就算完。

**从真实攻击看边界：等级由「谁能写帧」决定**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/729e9a62748b4d79.png)

四类案例的共性是：攻击等级不取决于「CAN 有多老」，而取决于谁能往哪条总线、在什么条件下写入什么 ID。这也是网关隔离与诊断权限治理始终排在算法选型前面的原因。

**工程落地：开销、覆盖率与密钥**

开销要量化。 每个受保护报文会增加 FV、Authenticator、可能的同步报文，以及发送端计算与接收端验证延迟。经典 CAN 的 8 字节数据场里，认证字段会直接挤压应用信号；CAN FD 缓解了空间，但密钥刷新、重放窗口与验证失败处理仍会引入额外总线负载与任务抖动。做方案时应当给出「认证覆盖率 × 报文周期 × 总线负载率 × 验证时延」的预算表，而不是只写一句「有一定开销」。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e33a2c1df888f789.jpg)

图 4｜车载安全能力分层示意（应用 / 通信 / 模块 / 硬件信任根）

覆盖率由 TARA 决定，不由总线利用率单独决定。 正确顺序是：以 ISO/SAE 21434 的 TARA 识别资产、威胁场景、攻击路径与可行性 → 按损害场景与影响等级确定哪些信号需要真实性、完整性、新鲜度与故障安全响应 → 再结合负载、算力与实时性做工程取舍。直接影响车辆运动的信号优先强认证；诊断、标定、低价值状态信号则配合受限诊断会话、网关白名单、权限与审计，不能因为「SecOC 贵」就无差别降低全部报文的安全等级。

密钥是 SecOC 的边界外问题。 应按用途分层：设备唯一密钥、群组密钥、升级签名密钥、调试密钥，并明确注入、派生、轮换、吊销、销毁、故障替换与导出限制。NXP 的 SHE（Secure Hardware Extension）功能规范描述了这类硬件信任根的典型目标——保护密钥、支持安全启动、证明软件完整性、支撑安全车载通信，并提供随机数、密钥管理、MAC 生成/验证与计数器服务。这是供应商规范，不是 AUTOSAR 对车型架构的统一规定；是否用 HSM、SHE 还是 TEE，以及 MAC 算法与密钥长度，须在项目安全概念、芯片手册与 HSM 能力中核验。

与以太网的关系别想当然。 车载以太网使用 PDU、服务发现与 SOME/IP 等机制承载更高带宽服务，SecOC 可用在适用的 I-PDU 上，但也可采用 TLS、IPsec、MACsec 等机制。「以太网天然更安全」或「SOME/IP 默认已认证」都不是能从公开规范推出的一般事实。

**与 ISO/SAE 21434、GB 44495 的衔接**

ISO/SAE 21434:2021 于 2021 年 8 月 31 日发布，定位是覆盖概念、开发、生产、运行、维护与销毁全过程的网络安全工程标准，重点是工程过程，而非规定某一种技术方案。全国标准信息公共服务平台可查到《道路车辆 信息安全工程》等同采用 ISO/SAE 21434:2021 的计划信息，但截至本期截点未检得可公开访问的正式文本全文，故不引用具体条款号。

落到国内准入：GB 44495 的外部连接安全、通信安全、软件升级安全、数据安全四个域要求的是可复现的验证证据。SecOC 只是「通信安全」里的一类实现，不能替代 CSMS 体系、供应商安全协议、日志审计、事件响应与升级管理。把某一项技术当成合规的全部，是方案评审里最常见的偏差。

**本期三句话与下期预告**

CRC 管的是「传输过程中没出错」，SecOC 管的是「发送者可信、报文没被改、不是旧报文」。

截断能省带宽，代价是把新鲜度同步变成系统级设计问题。

密钥隔离、边界权限与 TARA 结论，决定 SecOC 在量产车上是否真的有效。

下期我们拆密钥管理与 HSM/SHE 工程实践：密钥怎么注入、怎么轮换、ECU 更换与售后场景怎么处理，以及为什么「首次烧录完成」远不是终点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fa5166cd5c57f14c.png)

**文章**

## 不要错过哦，这可能是汽车网络安全产业最大的专属社区！

[关于涉嫌仿冒AutoSec会议品牌的律师声明](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247531034&idx=2&sn=e466ca3e7c2927a91dd9a81be705afe1&chksm=e9273ec1de50b7d7f540ae2e4c255bfb42f842228a87f7dbc65297027a878544a9e796e09cf6&scene=21#wechat_redirect)

[一文带你了解智能汽车车载网络通信安全架构](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247517280&idx=2&sn=8bfafb17871598c9cc0041bc9ee5f65d&chksm=e927c0bbde5049ad8cdb3647f6cdfce00c2db7a7b484941027bb7edf3128e4eaa74d6727dd46&scene=21#wechat_redirect)

[网络安全：TARA方法、工具与案例](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247502093&idx=1&sn=ec4b373a33ca04d79afbb0b0b880bd4e&chksm=e9278dd6de5004c01bdd83ad0dd89c3549c7ae2ceb362959dbcb159324b2593d70bce78d82a9&scene=21#wechat_redirect)

[汽车数据安全合规重点分析](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247519068&idx=1&sn=78c66e13bd8798afd46c766b8f18abe7&chksm=e927cf87de504691c816f78b55daf93bdfb72fc1cb870d926de8b471eb3e1be61058498327b1&scene=21#wechat_redirect)

[浅析汽车芯片信息安全之安全启动](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247512151&idx=1&sn=7fabbeeec206ce615a5a3c574bed4c43&chksm=e927f48cde507d9ab6bfd4b8389b5eafea37586707682bfe60f294feb54e1c36cb07bad4d26d&scene=21#wechat_redirect)

[域集中式架构的汽车车载通信安全方案探究](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247519952&idx=2&sn=709860de942501f20e923d15330ced9a&chksm=e927ca0bde50431df0b47ad1a2da63bf98ee637c9c00482145fbdb8755851b61421357aab4bf&scene=21#wechat_redirect)

[系统安全架构之车辆网络安全架构](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247520446&idx=1&sn=27e10e455264cecb2a1b49d91484d036&chksm=e927d465de505d73c59a6fb4cb066c7c7d07a96ef49a841ffe598c23d28be545c5874dec7de4&scene=21#wechat_redirect)

[车联网中的隐私保护问题](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247521010&idx=1&sn=94ef379e2b877551093a869cf9d4897e&chksm=e927d629de505f3f3cbc102682f7a21a82372108776d3484d8ce619f7db1aae0ab0a001b9b41&scene=21#wechat_redirect)

[智能网联汽车网络安全技术研究](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247521302&idx=1&sn=01e9311cb2c84f3e64902abf5f6e7a9e&chksm=e927d0cdde5059db5fe18c5e27f830bbb6ea6df327088082e7844aa056b05f840ad4cf6e3b5a&scene=21#wechat_redirect)

[AUTOSAR 信息安全框架和关键技术分析](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247521661&idx=1&sn=a72381e326e3a226059954c74698e0dd&chksm=e927d1a6de5058b0297b91ba77fcf34bd3c581476a0790c5e0cfbcbe026b5a7c27d700bfb1ca&scene=21#wechat_redirect)

[AUTOSAR 信息安全机制有哪些？](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247522056&idx=1&sn=bbd03def212d085f533e0301f8c86f18&chksm=e927d3d3de505ac57099d5e42fb6726cf152de9aaa9590b095895874e7a4cc806abc84cc4ebf&scene=21#wechat_redirect)

[Autosar硬件安全模块HSM的使用](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247527177&idx=1&sn=984bfc845ef51ec1f32cd12d37430621&chksm=e9272fd2de50a6c4013f84ed2257f634a505a04a27b4b27c30e5af4492d5fc3b0099216b1f7d&scene=21#wechat_redirect)

[首发!小米雷军两会上就汽车数据安全问题建言：关于构建完善汽车数据安全管理体系的建议](http://mp.weixin.qq.com/s?__biz=MzIzOTc2OTAxMg==&mid=2247519331&idx=1&sn=925d48164f1c7d2d109ee433cde6805b&chksm=e927c8b8de5041aea58f73aed311cdd3bf913bbb73d8e175ac80ae643d944709e06ec418fb52&scene=21#wechat_redirect)
