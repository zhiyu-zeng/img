---
title: 【微信】夫人 你也不想你丈夫的马全被杀了吧-AV/EDR 家族化检测机制拆解与样本存活实验
source: https://mp.weixin.qq.com/s/weeEakmhURp0i_2PTTOY2Q
source_host: mp.weixin.qq.com
clip_date: 2026-09-20T14:48:13+08:00
trace_id: c8ab4a07-47e6-4485-a084-bfec974b416b
content_hash: efe9578e2d5469d4b56dadf514b7293a090d41ac6481f2e1f620270db72940db
status: synced
tags:
  - 微信
  - 恶意样本
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 10 个无害 PE 变体经本地与 VirusTotal 双端实测证明：模糊哈希被打散并不改变家族归属，imphash 与结构画像才是 AV/EDR 家族聚类的决定因素。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3e175244-d011-81f9-a660-eb10b828053c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 10 个无害 PE 变体经本地与 VirusTotal 双端实测证明：模糊哈希被打散并不改变家族归属，imphash 与结构画像才是 AV/EDR 家族聚类的决定因素。
> 
> - **检测分层：** 家族化检测按精确哈希→模糊哈希（ssdeep/TLSH/vhash）→语义特征（imphash/YARA/节区）→图匹配（BinDiff）与行为聚类四层接力；对抗必须先说明在打哪一层。
> - **本地实测：** 源码级多态与手工控制流平坦化把 ssdeep 相似度压到 0 分（变体互为 Singleton），但 imphash 仅因 `-O0/-Os` 改变而分成 A/B/C 三组；`-O1` 与 `-O2` 产物相似度高达 97，属无效换皮。
> - **VT 实测：** imphash 相同的 A 组 7 个样本（含全部多态与平坦化样本）统一获得 `krypt` 家族标签，检出率 1/70~3/70，命中全部来自 Ikarus、Microsoft `Wacatac.*!ml`、Elastic 等泛化启发式/ML 判定，无一条真实特征码。
> - **边界判断：** BinDiff 类图匹配怕库函数 wrapper 化与模块边界随机化，不怕字节噪声；OLLVM 只能拉高单样本分析成本，统一配置反而给家族盖"混淆钢印"，且反混淆生态成熟。
> - **工程结论：** 万台投放应分 20-50 个构建簇、簇间差异打在 imphash/模块边界/API 调用面、混淆参数按簇随机化、灰度监控并按簇熔断，把防守方成本从 O(1) 拉回 O(N)；蓝队则按 imphash 建簇告警、为平坦化分发器与 `x*(x-1)&1` 类不透明谓词写规则、给 Singleton 保留人工复核配额。

**DeepDark Sec** *2026年9月20日 14:27*

合规声明：本文所有实验样本、思路结论仅用于研究杀毒软件与 EDR 的家族化聚类行为。文中技术讨论仅适用于已获得书面授权的红队评估与攻防演练场景。文章同时给出蓝队检测建议。

一晃停更5个月了，还是老规矩腿在最后。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ffb4589cfc92dd21.png)

## 前言：一个样本被抓，为什么一万台会跟着死

做过大规模批量上线的都遇到过：同一个加载器模板编译的样本，第一天上线几千台顺风顺水，第三天某台终端被 AV 云传擒获，48 小时内全线告警——剩下的样本明明哈希完全不同，却像被连坐一样成片倒下。

家族化检测（malware family clustering）。现代 AV/EDR 和 VirusTotal 这类多引擎平台早已不依赖单样本哈希做判定，而是把样本扔进相似度聚类流水线：新样本一旦与已知家族"长得足够像"，就继承整个家族的判定——你的另外九千台，在引擎眼里是同一个东西。

本文做三件事：拆解家族化检测在"比"什么；用一组可控无害变体做本地与 VirusTotal 双端实测（数据全部真实可复现）；说清 BinDiff、OLLVM、多态各自的战场与边界，最后给出万台规模的工程化结论与蓝队反向清单。

## 一、技术栈全景：四层接力

| 层级  | 代表技术 | 比较对象 | 成本  | 抗变换能力 |
| --- | --- | --- | --- | --- |
| L1 精确匹配 | MD5/SHA-256 | 文件字节序列 | 极低  | 改 1 bit 即失效 |
| L2 相似度哈希 | ssdeep、TLSH、VT vhash | 文件分片/结构特征 | 低   | 抗小修改，怕结构性重写 |
| L3 语义特征 | imphash、YARA、节区/编译器指纹 | 导入表、特征串、节布局 | 低-中 | 取决于特征选取 |
| L4 结构/行为 | BinDiff 类 CFG 图匹配、沙箱行为聚类、ML embedding | 控制流图、API 序列、网络行为 | 高   | 最强，难以全量实时 |

三个关键事实：

-   Google 公开承认用 BinDiff 核心引擎做大规模恶意软件聚类：自 2011 年收购 zynamics 起，BinDiff 引擎在其内部恶意代码处理系统中完成数十亿次样本比对，把全球样本聚成家族 \[1\]。
    
-   VT 的 vhash 是其专有结构相似度哈希，学术界已用它把 33 万样本聚成 7.4 万个簇；VT Collections 直接把 "Similarity Hashes（VTHash、视觉相似度）"开放为聚类维度 \[2\]\[3\]。
    
-   ssdeep/TLSH/imphash 是公开聚类管线标配：2025 年的对比研究表明 TLSH 与 imphash 产出语义更清晰的家族簇，ssdeep 适合粗粒度预筛 \[4\]；YARA 规则融合模糊哈希可把家族检出率推到 90%+ \[5\]。
    

对抗视角：L1 是用来绕的，L2/L3 是用来赌的，L4 才决定家族命运。

## 二、各检测面在"比"什么

ssdeep/TLSH：ssdeep 是上下文触发分片哈希（CTPH），TLSH 统计滑动窗口字节分布。共同弱点是对整体字节分布敏感——塞 30% 随机填充分数就崩，这是多态的生存缝隙 \[4\]。

imphash：把 PE 导入表按序哈希，比的不是字节而是"你调用了谁"。同一套源码无论怎么混淆代码，导入表往往雷打不动，是家族化检测里性价比最高的一环，也是多态最容易翻车的地方（后文实测）。

YARA：分析师提取的"独特字符串+代码片段+结构条件"。软肋是特征由人选、有偏好、有规律，可被针对性打散。

BinDiff 类图匹配：把函数调用图/控制流图抽象为图匹配问题，对字节级变换天然免疫。但天花板明显：面向"同一程序的不同版本"设计，对非图同构变种匹配率骤降；实测对多样化后的同一程序相似度最高仅 53.8%；库函数调用点是其最重要的结构锚点，把库调用包进随机 wrapper 会显著拉低相似度 \[6\]。

行为层：沙箱引爆后的 API 序列、网络行为、TTP 映射。静态特征可以全改，功能不变行为就趋同——纯静态对抗到此见顶。

## 三、实验设计

为避免合规风险，实验不用真实木马，而是 85 行的"结构仿真"程序 template.c：内置 XOR 编码数据、解码函数、CRC32 自检、分阶段主流程——结构上模拟典型加载器的"初始化→解码→执行"三段式，功能上只是打印一句话。不联网、不落盘、不碰注册表。多态垃圾代码由 mutate.py 按随机种子生成：随机垃圾函数（内置 x\*(x-1)&1==0 不透明谓词，即 OLLVM BCF 同款原理）、随机长度只读填充、随机算术恒等变换（对应指令替换 SUB），全部无实际功能。

变体分组：

| 组别  | 变换  | 模拟的现实手段 |
| --- | --- | --- |
| G0  | 基线 `-O2` | 裸编译出货 |
| G1  | 仅改编译选项 `-O0/-O1/-Os/-Os -s` | 换参数重新出包 |
| G2  | 源码级多态：4 种子 ×（垃圾函数+随机密钥+随机填充） | 多态构建器批量出包 |
| G3  | 手工控制流平坦化等价改写 | OLLVM `-fla` 的结构效果 |

工具链：zig cc -target x86_64-windows-gnu 直接产出 10 个 Windows PE；分析脚本计算 SHA-256/ssdeep/imphash，全部开源（附录）。

## 四、本地实测：哪层被打穿，哪层没有

精确哈希：10 个变体 SHA-256 两两不同。这层改一个字节就过，"改 MD5 过云查杀"在 2015 年后只剩心理安慰。

ssdeep 两两相似度（0-100，越高越像）：

| 组内/跨组 | 样本对数 | 最低  | 平均  | 最高  |
| --- | --- | --- | --- | --- |
| G1 组内（换编译选项） | 6   | 0   | 16  | 97  |
| G2 组内（多态互比） | 6   | 0   | 0   | 0   |
| G0 基线 vs G2 多态 | 4   | 0   | 0   | 0   |
| G0 基线 vs G3 平坦化 | 1   | 0   | 0   | 0   |

两个细节值得玩味：G1 里 -O1 与 -O2 产物相似度高达 97——换优化级别这种"低端换皮"约等于没换；而 -O0（体积 184KB→767KB）与 -Os（收缩到 56KB）直接把相似度打到 0，体积剧烈变化本身就是最强也最不可控的模糊哈希干扰。另外 G2 多态组内部互比也是 0 分——样本不仅和基线不像，彼此也不像，全成了孤立样本（VT 术语 Singleton），而 Singleton 反而更吸引人工分析 \[7\]。

imphash：唯一的幸存者，也是唯一的叛徒：

| 变体  | imphash |
| --- | --- |
| g0_base / g1_O1 / 全部 G2 多态 / g3_fla | `a2cd59cc…da7efbd`<br><br>（完全相同） |
| g1_O0 | `a81ecc16…14a524` |
| g1_Os / g1_Os_strip | `1e495dbe…c45a2b3` |

所有多态变换、垃圾代码、平坦化改写，imphash 纹丝不动——API 调用面没变，导入表一字未改。反倒是 -O0/-Os 这种无心之举改变了 imphash（链接器在不同优化级别对 CRT 的裁剪策略不同）。推论很直白：想动 imphash 就得动 API 调用面（动态解析、导入表隐藏），而这些动作又会在行为层留下新画像——对抗是逐层转移的，不是免费的。

## 五、VirusTotal 实测：家族标签把结论钉死了

本地测量只能证明"特征变了没有"，引擎买不买账要上传才知道。10 个变体于 2026-09-19 全部上传 VT（首次分析，判定逐字转录）：

| 样本  | imphash 组 | 检出  | 命中引擎判定 | VT Family labels |
| --- | --- | --- | --- | --- |
| g0_base.exe | A   | 2/70 | Google；Ikarus `Trojan.Win64.Krypt` | krypt |
| g1_O1.exe | A   | 3/70 | Google；Ikarus `Trojan.Win64.Krypt` ；McAfee `Tl!6CF8C0A3438E` | krypt |
| g2_seed11.exe | A   | 1/69 | Ikarus `Trojan.Win64.Krypt` | krypt |
| g2_seed22.exe | A   | 2/70 | Google；Ikarus `Trojan.Win64.Krypt` | krypt |
| g2_seed33.exe | A   | 1/68 | Ikarus `Trojan.Win64.Krypt` | krypt |
| g2_seed44.exe | A   | 1/69 | Ikarus `Trojan.Win64.Krypt` | krypt |
| g3_fla.exe | A   | 3/70 | Google；Ikarus `Trojan.Win64.Krypt` ；McAfee `Tl!51CA632B359F` | krypt |
| g1_O0.exe | B   | 1/70 | Microsoft `Trojan:Win32/Wacatac.C!ml` | 无   |
| g1_Os.exe | C   | 3/70 | Elastic Malicious(moderate)；McAfee `Tl!…` ；Microsoft `Wacatac.B!ml` | 无   |
| g1_Os_strip.exe | C   | 2/69 | Elastic Malicious(moderate)；McAfee `Tl!AA3013AB5AE4` | 无   |

（A/B/C 即第四节的三个 imphash 取值组。）

图 5-1 基线样本 g0_base 检出页：2/70，VT 直接挂上 Family labels: krypt

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/567a91a732812e0a.png)

图 5-2 多态变体 g2_seed33：ssdeep 与基线相似度为 0，仍被判 Trojan.Win64.Krypt 并归入 krypt 家族

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6f8bfdde86e85f8c.png)

图 5-3 平坦化变体 g3_fla：控制流完全重写，3/70 检出，家族标签依旧是 krypt

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d15fb3c32832033.png)

图 5-4 对照组 g1_O0：仅因 -O0 改变了导入表与体积，落入 Wacatac.C!ml，无任何家族标签

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/183aab586dbd979d.png)

四个超出预期的发现：

1.  家族归属与 imphash 组严丝合缝。 拿到 `krypt` 家族标签的 7 个样本恰好是 imphash 相同的 A 组全体——ssdeep 互比 0 分的多态变体和平坦化变体，在引擎眼里和基线是同一个家族；仅因优化级别改变导入表/体积的 B、C 组则流向 Wacatac 或无标签。本地实验"imphash 是唯一叛徒"的判断，在真实多引擎平台上以家族标签的形式复现。
    
2.  所有命中都是泛化启发式/ML 判定，没有一条特征码。 `Krypt` 是 Ikarus 对可疑打包/混淆 PE 的通用家族名， `Wacatac.*!ml` 是微软 ML 泛化判定，Elastic "moderate Confidence" 与 McAfee Tl!<哈希前缀> 同理。10 个完全无害的样本检出率 1/70～3/70——无签名、小体积、非微软工具链的 PE 天然落在多家引擎的灰区。对红队这是噪音红利，对蓝队这是误报重灾区。
    
3.  换编译选项改变了家族归属，但方向不可控。 B 组从 krypt "跳槽"到 Wacatac——检出没变少，只是换了引擎的泛化家族兜底。换皮不是掷骰子，簇画像调整后要对照 VT 家族标签做定向验证，确认没从"小家族"跳进更醒目的大家族。
    
4.  Google 引擎的 Detected 集中在 A 组。 结合第一章"Google 用 BinDiff 引擎做家族聚类"的公开事实，结构画像在家族归属中的权重可见一斑。
    

诚实标注边界：样本量 10 个、单次上传、引擎黑盒——"imphash 组与家族标签对齐"是强相关观测，不能排除引擎实际使用与导入表高度共线的其他结构特征（节区布局、CRT 指纹）。但对工程决策没有影响：你要管理的正是这一整束共线的"工具链画像"特征，imphash 只是它最容易计算的代表。

## 六、BinDiff、OLLVM、多态：各自的战场与边界

多态打散的是"字节"，不是"语义"。实测它对 ssdeep 是毁灭性的（0 分），但不动导入表则 imphash 存活、不动控制流骨架则图匹配存活、不动行为则沙箱聚类存活。多态解决的是"不要被批量关联"，不是"不要被发现"——万台场景里它的真实价值是避免"一条 YARA/一个 vhash 簇打死全部"，把防守方清除成本从 O(1) 拉回 O(N)。

OLLVM 三件套对应三个检测面：sub 指令替换对抗字节特征码；bcf 虚假控制流对抗 CFG 匹配与人工分析；fla 平坦化对抗图匹配与反编译。但 OLLVM 的反混淆生态已非常成熟（angr deflat、D810、符号执行还原均有公开方案与期刊级系统研究 \[8\]\[9\]），其正确定位是提高单样本分析成本（分析师 1 小时变 1 天），而不是切断家族关联。更危险的是：一万台全用同一个 OLLVM 配置编译，等于给家族盖了统一的"混淆钢印"——防守方写一条检测平坦化分发器的 YARA，一锅端得比不混淆还快。

对 BinDiff 类图匹配真正值钱的变换，按性价比排序：① 包装库函数调用（wrapper 化，直击其结构锚点 \[6\]）；② 函数内联/拆分随机化（改变调用图节点度分布）；③ 模块边界随机化（同家族木马复用通信/加密模块是模块级同源检测的命脉，ModDiff 这类方法 F1 已达 0.89 \[10\]）；④ 平坦化/虚假控制流有效但指纹重，需配合参数随机化。

## 七、万台规模的工程化思考（授权红队场景）

万台投放的"存活率管理"本质是检测面分层预算管理：

1.  分簇构建，而不是逐台多态。 万台切成 20-50 个构建簇，簇间差异打在 imphash/模块边界这类 L3/L4 层面（不同 API 调用面、不同模块划分），簇内用多态打散字节。全量逐台多态会制造一万个 Singleton，反而提高抽样分析命中的期望值。
    
2.  混淆参数也要多态。 同一 OLLVM 配置=同一指纹。bcf_loop、bcf_prob、子分发器数量应按簇随机化，定期更换混淆器版本/种类。
    
3.  灰度投放+回传监控。 先上 1% 观察各引擎检出与聚类反应（VT 的 vhash 簇、沙箱报告是免费的侦察面），确认簇间未被关联再放量；样本失陷后按簇熔断，而不是全线静默。
    
4.  行为层是天花板。 静态做得再干净，网络行为、上线节奏、C2 画像趋同就会在行为聚类里重新汇合。行为层簇间隔离与静态层同等重要，展开超出本文范围。
    

一句话：万台存活的核心不是"每个样本都查不出来"，而是"任何一次捕获都无法外推到其余样本"——打散家族化检测的聚类收益，让防守方回到逐样本分析的人力成本上。

## 八、蓝队视角：把这篇文章反过来用

-   把 imphash 当一等公民：多态/平坦化对导入表零影响（本地与 VT 双端验证）。入库样本按 imphash 建簇告警，配合动态解析监控补"导入表隐藏"的空窗。
    
-   模糊哈希用组合而非单点：TLSH 主聚类+ssdeep 预筛+imphash 分桶的融合方案在公开研究中有 +6~10% F1 提升 \[11\]。
    
-   为混淆特征写规则：平坦化分发器、不透明谓词模式（ `x*(x-1)&1` 族）是稳定检测素材，多数企业环境里"混淆即可疑"成立。
    
-   警惕 Singleton：孤立样本不等于干净样本，聚类管线里给 Singleton 保留人工/沙箱复核配额。
    
-   投资行为层：静态对抗存在理论天花板，行为聚类（API 序列 embedding、网络画像）是防守方成本递增最慢的一层。
    

## 九、总结

1.  家族化检测是四层接力：精确哈希→模糊哈希→语义特征→图/行为。对抗必须说清在打哪一层，否则就是自嗨。
    
2.  本地实测：源码级多态把 ssdeep 打到 0 分，但 imphash 完全存活；VT 实测钉死结论——imphash 相同的 7 个变体（含全部多态与平坦化样本）被统一挂上 krypt 家族标签，imphash 不同的 3 个流向 Wacatac 或无家族。
    
3.  BinDiff 类图匹配怕 wrapper 化和模块边界随机化，不怕字节噪声；OLLVM 提高的是分析成本而非关联难度，用错反而制造统一指纹。
    
4.  万台存活率是工程问题：分簇构建、混淆参数多态化、灰度监控、按簇熔断，目标是把防守方从 O(1) 聚类清除拖回 O(N) 逐样本分析。
    
5.  对蓝队，以上每条都是反向的检测建设清单。
    

## 参考链接

1.  Google's Binary Comparison Tool "BinDiff" Available for Free - SecurityWeek
    
2.  VT Collections: citius, altius, fortius - VirusTotal Blog
    
3.  No Spring Chicken: Quantifying the Lifespan of Exploits in IoT Malware - ACM AsiaCCS'22
    
4.  Comparative Analysis of Hash-based Malware Clustering via K-Means - arXiv
    
5.  Fuzzy Hashing Aided Enhanced YARA Rules for Malware Analysis - Northumbria University
    
6.  Similarity-based matching meets Malware Diversity - arXiv
    
7.  Understanding Uses and Misuses of Similarity Hashing - Marcus Botacin
    
8.  基于 Capstone 和流敏感混合执行的自动化反混淆技术 - 软件学报
    
9.  OLLVM 混淆技术与反混淆实战 - CN-SEC
    
10.  ModDiff: Modularity Similarity-Based Malware Homologation Detection - MDPI
     
11.  Evidence-based YARA malware detection strategy - GitHub
     

## 附录 A：样本完整源代码

以下三个文件即本文全部 10 个 PE 变体的来源，可直接编译验证"无害"性质。

A.1 基线样本 \`template.c\`\*\*（G0/G1/G2 均由它编译，差异仅在编译选项与 \`gen\_junk.h\` 内容）：

````cpp
/*
 * template.c —— 家族化聚类实验基线样本
 *
 * 功能：解码一段内置的 XOR 字符串并打印，附带一个 CRC32 自检。
 * 不联网、不写文件、不读写注册表、不创建进程，仅用于演示
 * "同一套源码 -> 不同构建变体"在相似度聚类下的表现。
 *
 * 纯标准 C，可在 macOS/Linux(clang/gcc) 与 Windows(MSVC/MinGW) 下编译。
 */
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stddef.h>

#ifndef BUILD_KEY
#define BUILD_KEY 0x5A
#endif

#ifndef BUILD_TAG
#define BUILD_TAG "BASELINE"
#endif

#include "gen_junk.h"   /* 由 mutate.py 按种子生成的多态垃圾代码块 */

typedef struct {
    uint8_t  key;
    char     tag[16];
    uint32_t expect_crc;
} config_t;

/* 内置数据：明文为一段提示语，按 BUILD_KEY(0x5A) 异或后的结果 */
static const uint8_t g_payload[] = {
    0x2e, 0x32, 0x33, 0x29, 0x7a, 0x33, 0x29, 0x7a,
    0x3b, 0x7a, 0x38, 0x3f, 0x34, 0x33, 0x3d, 0x34,
    0x7a, 0x2a, 0x35, 0x36, 0x23, 0x37, 0x35, 0x28,
    0x2a, 0x32, 0x33, 0x29, 0x37, 0x7a, 0x28, 0x3f,
    0x29, 0x3f, 0x3b, 0x28, 0x39, 0x32, 0x7a, 0x29,
    0x3b, 0x37, 0x2a, 0x36, 0x3f, 0x7a, 0x3c, 0x35,
    0x28, 0x7a, 0x3b, 0x2c, 0x7a, 0x39, 0x36, 0x2f,
    0x29, 0x2e, 0x3f, 0x28, 0x33, 0x34, 0x3d, 0x7a,
    0x29, 0x2e, 0x2f, 0x3e, 0x23, 0x74, 0x7a, 0x34,
    0x35, 0x7a, 0x34, 0x3f, 0x2e, 0x2d, 0x35, 0x28,
    0x31, 0x76, 0x7a, 0x34, 0x35, 0x7a, 0x3c, 0x33,
    0x36, 0x3f, 0x76, 0x7a, 0x34, 0x35, 0x7a, 0x32,
    0x3b, 0x28, 0x37, 0x74
};

static uint32_t crc32_calc(const uint8_t *data, size_t len) {
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++)
            crc = (crc >> 1) ^ (0xEDB88320u & (uint32_t)-(int32_t)(crc & 1u));
    }
    return ~crc;
}

static void stage_init(config_t *cfg) {
    cfg->key = (uint8_t)BUILD_KEY;
    memset(cfg->tag, 0, sizeof(cfg->tag));
    strncpy(cfg->tag, BUILD_TAG, sizeof(cfg->tag) - 1);
    cfg->expect_crc = 0;
}

static void stage_decode(const config_t *cfg, uint8_t *out, size_t len) {
    for (size_t i = 0; i < len; i++)
        out[i] = g_payload[i] ^ cfg->key;
}

static void stage_run(config_t *cfg) {
    uint8_t buf[sizeof(g_payload) + 1];
    stage_decode(cfg, buf, sizeof(g_payload));
    buf[sizeof(g_payload)] = 0;
    cfg->expect_crc = crc32_calc(g_payload, sizeof(g_payload));
    printf("[%s] crc32(payload)=0x%08X\n", cfg->tag, cfg->expect_crc);
    printf("[%s] msg: %s\n", cfg->tag, (char *)buf);
    junk_touch(cfg->expect_crc);   /* 锚定多态垃圾块，防止被完全裁剪 */
}

int main(void) {
    config_t cfg;
    stage_init(&cfg);
    stage_run(&cfg);
    return 0;
}
```

````

A.2 手工平坦化等价变体 \`flattened.c\`\*\*（G3，与 A.1 逻辑完全等价，仅控制流结构不同）：

```cpp
/*
 * flattened.c —— 手工"控制流平坦化"等价变体（完全无害）
 *
 * 与 template.c 逻辑完全等价，但把 stage_* 的线性调用改写为
 * "分发器 + 状态变量"结构，模拟 OLLVM -fla 产物的典型 CFG 形态，
 * 用于验证：仅改变控制流结构时，基于 CFG 的相似度匹配（BinDiff 类）
 * 与模糊哈希聚类（vhash/ssdeep/TLSH）会如何漂移。
 */
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stddef.h>

#ifndef BUILD_KEY
#define BUILD_KEY 0x5A
#endif

static const uint8_t g_payload[] = {
    0x2e, 0x32, 0x33, 0x29, 0x7a, 0x33, 0x29, 0x7a,
    0x3b, 0x7a, 0x38, 0x3f, 0x34, 0x33, 0x3d, 0x34,
    0x7a, 0x2a, 0x35, 0x36, 0x23, 0x37, 0x35, 0x28,
    0x2a, 0x32, 0x33, 0x29, 0x37, 0x7a, 0x28, 0x3f,
    0x29, 0x3f, 0x3b, 0x28, 0x39, 0x32, 0x7a, 0x29,
    0x3b, 0x37, 0x2a, 0x36, 0x3f, 0x7a, 0x3c, 0x35,
    0x28, 0x7a, 0x3b, 0x2c, 0x7a, 0x39, 0x36, 0x2f,
    0x29, 0x2e, 0x3f, 0x28, 0x33, 0x34, 0x3d, 0x7a,
    0x29, 0x2e, 0x2f, 0x3e, 0x23, 0x74, 0x7a, 0x34,
    0x35, 0x7a, 0x34, 0x3f, 0x2e, 0x2d, 0x35, 0x28,
    0x31, 0x76, 0x7a, 0x34, 0x35, 0x7a, 0x3c, 0x33,
    0x36, 0x3f, 0x76, 0x7a, 0x34, 0x35, 0x7a, 0x32,
    0x3b, 0x28, 0x37, 0x74
};

enum { S_INIT = 0, S_DECODE, S_CRC, S_PRINT, S_DONE };

int main(void) {
    int state = S_INIT;
    uint8_t key = 0;
    uint8_t buf[sizeof(g_payload) + 1];
    uint32_t crc = 0xFFFFFFFFu;
    size_t i = 0;

    /* 平坦化主分发器：所有真实块挂在一个 while+switch 下 */
    while (state != S_DONE) {
        switch (state) {
        case S_INIT:
            key = (uint8_t)BUILD_KEY;
            i = 0;
            state = S_DECODE;
            break;
        case S_DECODE:
            if (i < sizeof(g_payload)) {
                buf[i] = g_payload[i] ^ key;
                i++;
            } else {
                buf[sizeof(g_payload)] = 0;
                i = 0;
                state = S_CRC;
            }
            break;
        case S_CRC:
            if (i < sizeof(g_payload)) {
                crc ^= g_payload[i];
                for (int b = 0; b < 8; b++)
                    crc = (crc >> 1) ^ (0xEDB88320u & (uint32_t)-(int32_t)(crc & 1u));
                i++;
            } else {
                crc = ~crc;
                state = S_PRINT;
            }
            break;
        case S_PRINT:
            printf("[FLA] crc32(payload)=0x%08X\n", crc);
            printf("[FLA] msg: %s\n", (char *)buf);
            state = S_DONE;
            break;
        default:
            state = S_DONE;
            break;
        }
    }
    return 0;
}
```

A.3 源码级多态生成器 \`mutate.py\`\*\*（G2 的 \`gen\_junk.h\` 来源）：

```python
#!/usr/bin/env python3
"""
mutate.py —— 源码级多态变体生成器

用法: python3 mutate.py <seed> > gen_junk.h

模拟真实多态构建器的三类变换：
  1. 随机数量的垃圾函数（含不透明谓词，模拟 BCF 的效果）
  2. 随机长度/随机内容的只读填充区（打乱节布局与模糊哈希分片）
  3. 随机化的算术恒等变换（模拟指令替换 SUB 的效果）
所有生成代码，仅改变二进制结构与字节分布。
"""
import random
import sys

seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
rng = random.Random(seed)

VAR = f"junk_state_{seed}"

def opaque_predicate(v):
    """经典不透明谓词：x*(x-1) 恒为偶数，&1 恒为 0"""
    x = rng.randint(2, 1000000)
    return f"((({v} * ({v} - 1)) & 1) == 0 || {x} < 0)"

def junk_func(idx):
    name = f"jf_{seed}_{idx}"
    n_ops = rng.randint(3, 9)
    parts = []
    for _ in range(n_ops):
        c = rng.randint(1, 0xFFFF)
        op = rng.choice(["+", "-", "^", "*"])
        # 随机化运算顺序与常量，等价于"指令替换"的字节级效果
        if op == "*":
            parts.append(f"    {VAR} = ({VAR} * {c}u) + {rng.randint(0,255)}u;")
        else:
            parts.append(f"    {VAR} = ({VAR} {op} {c}u) & 0xFFFFFFu;")
    sink = "".join(parts)
    return f"""
__attribute__((used)) static unsigned {name}(unsigned x) {{
    unsigned acc = x ^ {rng.randint(1, 0xFFFFFFFF)}u;
    {VAR} = acc;
{sink}
    if {opaque_predicate(VAR)} {{
        acc = ({VAR} >> {rng.randint(1,7)}) ^ {rng.randint(0,0xFFF)}u;
    }} else {{
        acc = ~acc + {rng.randint(1, 999)}u;   /* 永不到达的死分支 */
    }}
    return acc;
}}"""

def padding_blob(idx):
    n = rng.randint(64, 640)
    data = ",".join(str(rng.randint(0, 255)) for _ in range(n))
    return (f"__attribute__((used)) static const unsigned char "
            f"jpad_{seed}_{idx}[] = {{{data}}};")

n_funcs = rng.randint(2, 5)
funcs = "\n".join(junk_func(i) for i in range(n_funcs))
pads = "\n".join(padding_blob(i) for i in range(rng.randint(1, 3)))

calls = []
for i in range(n_funcs):
    calls.append(f"    v ^= jf_{seed}_{i}(v + {rng.randint(0,255)}u);")

print(f"""/* Auto-generated by mutate.py seed={seed}. 无实际功能，仅改变二进制形态。 */
#ifndef GEN_JUNK_H
#define GEN_JUNK_H
static unsigned {VAR};
{funcs}
{pads}
__attribute__((used)) static void junk_touch(unsigned v) {{
{chr(10).join(calls)}
    (void)v;
}}
#endif /* GEN_JUNK_H */
""")
```

附录 B：构建与复现命令

```bash
# zig cc 内置 mingw-w64，直接产出 Windows PE
cd samples/
python3 -m venv ../.venv && ../.venv/bin/pip install ziglang ppdeep pefile
PY=../.venv/bin/python ./build.sh      # 产出 10 个 PE 变体到 out/
../.venv/bin/python analyze.py         # 输出 ssdeep/imphash 相似度报告

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/79c39fb617e6420d.jpg)
```

bypass · 目录
