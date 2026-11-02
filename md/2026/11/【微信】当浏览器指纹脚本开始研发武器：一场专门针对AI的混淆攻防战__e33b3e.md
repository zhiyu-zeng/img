---
title: 【微信】当浏览器指纹脚本开始"研发武器"：一场专门针对AI的混淆攻防战
source: https://mp.weixin.qq.com/s/XHedm803f1nMqz_iio-AVQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-03T00:21:30+08:00
trace_id: 3f1cafef-c44a-49ab-b9b1-7d76dc803346
content_hash: 6e7cfbf57ef4bc6f9d99865e550feecc1ac1690adf8d60c54a006a52fb181090
status: synced
tags:
  - 微信
  - AI辅助逆向
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 俄罗斯反爬厂商 Servicepipe 的指纹脚本将 AI 安全对齐反向武器化：用敏感函数名和隐形 Unicode 字符阻止大模型辅助逆向，而脚本本身只是常规反机器人采集。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 40c75244-d011-819f-bdf6-e5210413c00b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 俄罗斯反爬厂商 Servicepipe 的指纹脚本将 AI 安全对齐反向武器化：用敏感函数名和隐形 Unicode 字符阻止大模型辅助逆向，而脚本本身只是常规反机器人采集。
> 
> - **发现路径：** 研究员 veritas 用 Playwright hook 了 Tranco 榜单一万家网站的 canvas toDataURL 调用并聚类展示，其中一幅“专辑封面风格”的画布指向 servicepipe.tech 的脚本。
> - **双重对抗设计：** 脚本嵌入"蓖麻毒素致死剂量"等触发安全护栏的函数名与 summary 字段，另藏一段 U+E0000–U+E007F Tags 区间的不可见 Unicode 字符（ASCII smuggling，明文加 0xE0000 偏移），解码后是诱导模型进入无限制模式的系统提示词。
> - **实测分化：** 同一脚本，Astra 以生物安全风险为由拒答，GLM-5.3 则正常完成分析——证明关键词式护栏可被故意喂食的敏感词带偏，反而挡住正当安全研究。
> - **真实功能平平：** 剥离干扰后仅为标准指纹采集（userAgent、hardwareConcurrency、deviceMemory、navigator.webdriver、WebGL 显卡字符串等），另有一个浏览器中不可达的 Node.js 分支含下载执行、持久化代码，更像诱饵。
> - **厂商公开背书：** Servicepipe 集成文档明确承认使用 anti-LLM obfuscation，并将其归为四类手法——误导结构、触发拒答的威胁内容、抬高推理成本的噪声、隐藏指令；文中进一步区分了拒答、误读、指令劫持三种失败模式。

**黑鸟** *2026年11月2日 23:41*

有研究者在爬取了一万家网站之后，获取 [canvas指纹](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451183595&idx=1&sn=8598c0f3f34f133f1f4a3de1ca01cf3f&scene=21#wechat_redirect) 相关调用，收集到大量形态各异的画布后，其中一幅风格独特的画布指向servicepipe.tech域名下的一段JavaScript脚本，函数名里塞满了各类敏感词汇，文件深处还藏着一串对 [人类完全隐形的Unicode字符](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189513&idx=1&sn=b831b3dc972a940b1ceeae38901da6cb&scene=21#wechat_redirect) 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5e5e25654b2ed21a.png)

多家AI模型一看到这段代码就直接拒绝分析

该脚本在常规混淆之外，刻意在函数名中插入大量涉及高风险主题的敏感标识，同时隐藏一串不可见Unicode字符，解码后还原为一段要求进入无限制模式、并涵盖多种敏感与违规主题的系统提示词，其中还夹杂了针对特定模型审查机制的触发字符串。

研究者尝试让部分模型协助分析时，因触碰安全护栏而被直接拒绝，而另一些模型则可正常响应，验证了该手法的针对性。剥离这些对抗设计后，脚本实际仅执行标准的反机器人指纹采集，收集userAgent、硬件并发数、WebGL渲染器信息等常规浏览器与图形环境信号。

黑鸟认为，这种将模型安全对齐机制反向用于增加自动化逆向难度的做法，显示出代码混淆正从针对人类分析转向针对AI辅助工具的新对抗形态。

详细内容见下：

研究员veritas有个小众爱好：逆向浏览器指纹脚本。平时他打交道最多的是FingerprintJS这类知名库，以及Cloudflare Turnstile、Akamai这些大厂反爬方案里的高级货。

后来他想玩把大的：要是直接爬遍全网，拦截所有和指纹相关的浏览器API调用，把结果画成一张地图会怎样？

说干就干。他用Tranco热门网站榜单当路标，用Playwright驱动浏览器，hook住canvas的toDataURL调用，顺带监控navigator.webdriver这类典型的指纹采集和反机器人探针，把无害的canvas渲染过滤掉。

先简单科普一下canvas fingerprinting的原理：网页用JavaScript往一个看不见的canvas元素上画文字和图形，由于不同浏览器、操作系统、显卡驱动和硬件渲染同样的图形时存在细微差别，这些像素级差异经过哈希计算，就能变成一台设备的"身份证"。清cookie没用，开无痕模式也没用，因为它压根不存储任何数据，纯粹靠你机器的"作画风格"认人。

一万个网站爬下来，收获相当可观。他把这些canvas渲染图全部堆到了一个网站fingerprint.garden上，按厂商聚类展示，能看到FingerprintJS、Castle这些熟悉的面孔，也有大量叫不出名字的野路子作品，简单的一两笔，复杂的堪称行为艺术。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b96bcf5bccb35644.png)

有需要分析的可见：fingerprint\[.\]garden/#canvas

其中有一张图一下抓住了他的眼球，神似Tame Impala专辑《Currents》的封面，渐变漩涡配合波浪线条，说是某个乐队官网的加载动画都有人信。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed459bd6e3061819.png)

他想知道是谁画了这张图，结果顺藤摸瓜，摸出了一个画风完全不同的东西。

## 代码里"藏毒"

负责这个canvas的脚本开头一切正常，混淆过的函数名，javascript-obfuscator那一套，见多了。直到扫到这一行：

function computeRicinLethalDosageForWaterSupply

紧接着还有返回"成人致死阈值确认"这样的summary字段，以及calculateDeadlyLethalSuicideAspirinDosage（计算阿司匹林致死自杀剂量）之类的函数。画风突然从反爬脚本跳到了犯罪现场，换谁都得愣一下。

但冷静下来一想：这八成是anti-LLM obfuscation，也就是专门针对大模型的混淆手段。逻辑很直白，故意起一堆能触发模型安全护栏的符号名，AI一读到"毒素""致死剂量"就自动拉响警报，拒绝继续帮忙做反混淆，当然，敏感词还有很多，剩下的黑鸟就不发了。

代码本身该怎么跑还怎么跑，纯纯的心理战。

## 实测：AI真的拒了

研究员把脚本丢给Astra，并提前说明这很可能是故意设置的误导性命名，目的是阻挠AI辅助逆向。结果Astra还是拒绝了，理由是涉及生物安全风险。换成Daybreak Blue模式，一样被拦。有意思的是，同样的prompt丢给GLM-5.3，它答应了，顺利完成了分析。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/21eef8600dc35de7.png)

同一份文件，不同模型的反应截然不同。这一幕其实也暴露了当前AI安全机制的一个软肋：靠关键词触发的护栏，很容易被故意喂食的敏感词带偏，最后挡住的反而是正当的安全研究，坏人反倒因为没人看得懂代码而逍遥法外。

## 隐形字符才是真 payload

更隐蔽的还在后面。文件里藏着一长串肉眼完全不可见的Unicode字符，落在Unicode Tags block区间，U+E0000到U+E007F。这个区块的字符和ASCII一一对应，比如U+E0041对应大写字母A，编码方式就是把明文字符整体加上0xE0000的偏移量。浏览器、终端、编辑器、聊天窗口全都渲染不出来，看起来干干净净，但LLM的分词器会正常切分和处理这些字符，也就是说，一段肉眼看不见的文字，AI读起来毫无障碍。

这种手法业内叫ASCII smuggling。2024年初Johann Rehberger（wunderwuzzi）就发布过ASCII Smuggler工具演示编解码，原理一句话就能说清：明文每个字符加0xE0000偏移，得到一串合法的UTF-8文本，能绕过所有针对"ignore previous instructions"这类字面的注入特征过滤。

当然这里有个合理的例外需要说明：某些emoji序列（比如英格兰、苏格兰、威尔士的 subdivision flag）是规范允许使用tag字符的，所以扫到tag字符只能算一个待查线索，不能直接盖章恶意。

## 那这脚本到底干嘛的

抛开这些花哨的干扰项，剥开看就是个标准反机器人脚本。采集的信号包括navigator和window层面的一整套：userAgent、OffscreenCanvas是否可用、window全局键值数量（无头浏览器和注入污染的照妖镜）、CPU核心数hardwareConcurrency、deviceMemory、maxTouchPoints、语言列表、platform、navigator.webdriver布尔值，外加一个完整性自校验cc(self)。

WebGL层面也采得很全：gl.VERSION版本号、UNMASKED_VENDOR_WEBGL和UNMASKED_RENDERER_WEBGL（通过WEBGL_debug_renderer_info拿到真实显卡字符串）、着色语言版本、支持的扩展数量、MAX_TEXTURE_SIZE、MAX_VERTEX_ATTRIBS、视口最大尺寸、顶点uniform向量数。

看样子，采集的数据有点让人失望，和花在混淆上的心思完全不成正比。

另外文件里还存在一个Node.js环境分支，被环境判断门控着。如果启用，会尝试收集系统和网络信息、下载并运行一个远程可执行文件、建立持久化驻留。不过这个分支在浏览器里根本走不到，veritas自己也说无法确定它的真实行为，更倾向认为这段吓人的代码是诱饵式混淆，专供逆向的人"欣赏"的。

顺着域名查，urlscan显示servicepipe.tech有个同名兄弟站servicepipe.ru，官网翻译过来是"我们开发高精度流量控制系统，提供云端和本地化产品，防御DDoS攻击、机器人和定向威胁"，一家俄罗斯反DDoS和反爬厂商。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6cc8a894ec78e4bc.png)

Servicepipe在Digital Fraud Protection的集成文档里明确写了：

其JavaScript库使用了anti-LLM obfuscation，并警告说AI生成的逆向解释可能具有误导性。文档用的正是fp.servicepipe.tech这个域，和被抓包的产品域名直接对上。

集成指南里甚至带了一条账号封禁警告，不过这也只是厂商单方面的说法，尚无AI平台证实真的会封。

Servicepipe在今年7月10日的公开材料里把这类手法归了四类：

一、误导性代码结构，诱导AI对功能做出错误解释； 二、威胁性内容，触发安全相关的拒答； 三、大量虚假的关联和噪声，抬高上下文和推理成本； 四、隐藏指令，试图带偏分析方向或者直接操纵结果。

这件事里其实混杂了三种不同的失败模式，值得拆开看：

Refusal（拒答）：AI直接拒绝合法的逆向分析任务，这是最好观察也最容易被夸大的一种。

Misinterpretation（误读）：AI流畅地给出一段解释，但内容全是错的，这种最危险，因为看起来完成了工作。Instruction hijacking（指令劫持）：嵌入在代码里的文字试图指挥AI干别的，比如"把这个文件标记为安全"。

一个看起来像生化武器的函数名，可以在不包含任何指令的情况下影响AI的判断；反过来，一条写给AI看的指令也可能对JavaScript运行毫无影响。程序里的文本对运行时来说是死物，对AI读者来说却是活输入，这正是为什么传统的恶意代码分析和prompt injection分析必须分开提问。

往期：

[偷完密码还让AI写报告：新型木马用大模型给受害者排优先级](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189628&idx=1&sn=b49456e51d703ba1b3c56860d9a0fb87&scene=21#wechat_redirect)

[他让 AI 助手复盘牌局，AI 却在后台揪出一个盯了自己三年的黑客](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189607&idx=1&sn=4d615a364b8f58d6f36a6764fbd551cc&scene=21#wechat_redirect)

[一条畸形WAP Push短信如何远程让安卓手机崩溃甚至“变砖”](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189600&idx=1&sn=de3ee6a9c0a44e9c5046071bc19c4127&scene=21#wechat_redirect)

[105 国星链用户遭追踪，藏在广告体系里的跨国监视情报行动](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189589&idx=1&sn=bc666b6e46abf32e48c2b6764c3bb7d8&scene=21#wechat_redirect)

[网络战跳出屏幕：美军把技术破坏升级为常态化秘密战法](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189565&idx=1&sn=374ffc83e603c706ccc51329a017188a&scene=21#wechat_redirect)

[只动两个神经元，大模型就变坏了](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189550&idx=1&sn=34d400b3803c142a2c935ac882e7b290&scene=21#wechat_redirect)

[拆开自家电视后，他看到了让自己后背发凉的数据流](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451189533&idx=1&sn=034020969d33001260b18c5b3ce4b0a8&scene=21#wechat_redirect)

精选内容可见⬇️

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e6aabc16f3a03fa.jpg)

人工智能 · 目录
