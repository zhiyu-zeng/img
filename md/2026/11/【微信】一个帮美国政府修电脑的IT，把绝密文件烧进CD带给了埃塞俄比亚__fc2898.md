---
title: 【微信】一个帮美国政府修电脑的IT，把绝密文件烧进CD带给了埃塞俄比亚
source: https://mp.weixin.qq.com/s/BTyensZmGEH2P6syqGCmUA
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T04:10:19+08:00
trace_id: ee4053ef-cb0c-44a6-8b2d-fdea31b2bb18
content_hash: f50d52cbc13c16e3ff4579aa5108f05926509b468c866cb1e0a4b5dced41754d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 41175244-d011-81a5-9d90-cf5078a04bca
ioc: null
---

**黑鸟** *2026年11月7日 23:25*

一个在国务院值夜班修电脑的IT技术员，白天在司法部做合同管理分析员。他手里攥着Top Secret安全许可，有权限在classified系统之间搬文件。

但他花了两年多时间，把至少133份情报报告里的内容偷偷拷出来，烧进CD，塞进夹克口袋带出SCIF，再通过encrypted messaging app发给埃塞俄比亚的高官。

2026年11月4日，美国司法部宣布，53岁的Abraham Teklu Lemma正式认罪，接受120到262个月的刑期，也就是至少10年起步，最高将近22年。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7cfc327ca1d1047a.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e61fe62212b69ba5.png)

图 FBI总部J.Edgar Hoover大楼

Lemma是归化入籍的美国公民，住在马里兰州。从2019年到2023年，他先后在National Reconnaissance Office（国家侦察局，简称NRO，负责美国侦察卫星的那个机构）、State Department（国务院，简称DoS）和Justice Department（司法部，简称DoJ）工作过。

关键在于他的双重身份。从2021年开始，他晚上在DoS做IT Help Desk技术员，白天在DoJ做合同管理分析员。这种跨部门的身份让他同时出现在两个完全不同的classified环境里。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/531e837d727f57bb.png)

他持有一项叫downdraft authority的权限。这个词听起来专业，说白了就是：他被允许在classified系统之间搬运机密文件，也被允许把unclassified的文件从classified系统导出到unclassified系统。注意，是单向的downdraft，只能从高密级往低密级走，不能反过来。

但规则留了一个口子：他要访问非DoS系统上的classified文件，必须有书面批准，证明这是他official duties的一部分。而且他必须在SCIF（Sensitive Compartmented Information Facility，敏感compartmented信息设施，就是那种专门用来处理最高机密的加密房间，手机不让带进去，门窗有电磁屏蔽）里工作。

从2020年起他就拿着Top Secret clearance。问题在于，有权限和该访问是两回事，美国的classified信息管理有一条核心原则叫need-to-know，你就算有Top Secret许可，不代表你能看所有Top Secret文件，你得证明你确实需要知道这份内容才能干活。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0f5bd01f670b4ebe.jpg)

刑事起诉书最初说他从2022年7月开始作案，但DoJ后来改口说时间线推到了2021年。不管从哪天算，他的作案手法堪称教科书级别。

第一步，他在非DoS的classified门户里到处翻，浏览了好几个不该他看的情报报告。起诉书说他在没有need-to-know授权的情况下，从至少133份情报报告里拷贝了信息。这些报告的密级是Secret和Top Secret两个等级。

第二步，他把超过100份文件下载下来，刻录到CD/DVD光盘上。这里有个细节特别说明问题：他用的是绿色标签的光盘。在美国政府的光盘管理规范里，绿色标签代表这是approved for employees的，盘里装的应该只有unclassified材料。他把Secret和Top Secret的内容烧进了绿色标签盘，等于给情报文件披了一层「普通光盘」的外衣。

第三步，他在班结束时把这些光盘塞进夹克口袋，大摇大摆走出SCIF。

除了烧盘，他还有另一套手法。监控拍到他在电脑上看classified材料时，拿起笔手写笔记，把纸折好也塞进口袋带走。这种手写摘抄的方式在数字化审计里更难追踪，因为系统日志只能记录你在屏幕上看了什么文件，记录不了你手抄了哪几行。

这套操作一直持续到2023年8月左右。

大约从2022年8月到9月，也就是他开始拷贝文件几周后，Lemma开始通过encrypted messaging app向埃塞俄比亚官员传输信息。DoJ说他的联系人里有不少是埃塞俄比亚政府里政治、军事和情报系统的高级官员。

传过去的东西五花八门：文档、照片、笔记、地图，还有跟埃塞俄比亚直接相关的情报。对方会主动点单，让他提供command center（指挥中心）、logistics center（后勤中心）、military compound（军事营地）这些具体设施的细节。

通信内容还涉及地缘政治。他们讨论了一个跟埃塞俄比亚接壤的未具名非洲国家的「局势」，以及跟埃塞俄比亚冲突的rebel group（反政府武装）。Lemma甚至多次在消息里鼓励对方对跟埃塞俄比亚交战的paramilitary group（准军事组织）采取行动。

起诉书记录了他的一条消息：We have to finish these people once and for all, otherwise there will never be peace in Ethiopia.（我们必须一劳永逸地解决这些人，否则埃塞俄比亚永远不会有和平。）

当天晚些时候，2021年12月18日，他又发了一条：Please send dro\[nes\].（请发无人机来。）发完这条之后他还附了更多情报。

Lemma还在自己的存储设备上留了classified文件的副本。检方说，2023年4月到6月期间，埃塞俄比亚官员多次远程访问了他自己硬盘上的这些文件。这个细节很关键，说明对方不是被动接收，而是主动拉取，双方有持续的技术通道。

黑鸟觉得有趣的是，他在替外国官员干活的这段时间里，往银行账户里存了好几笔钱，总额超过66000美元。

有一次他存一笔超过10000美元的款子。

根据美国的Bank Secrecy Act，银行对超过10000美元的现金交易必须提交Currency Transaction Report（货币交易报告，简称CTR）。

2023年7月15日，Lemma走进马里兰州一家银行，想存超过11700美元现金。监控拍到他当时愤怒地劝阻银行员工不要提交这份报告。。他试图说服员工这笔交易不需要申报。但银行最终还是在7月24日提交了CTR。具体存款金额是11773.84美元。时间点很微妙：7月11日到14日，他刚从DoS拷了至少16份情报报告下来。

起诉书第43段特别指出，Lemma之前在马里兰州一家银行工作过，他完全知道CTR的申报规则。他故意把超过11000的存款拆成8月17日和18日两天，把超过12000的存款拆到两家银行，这在法律上叫structuring，本身就是独立罪名。

从2022年1月到2023年7月，他在这家银行的大额存款总额超过55000美元。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/653223b61da318e5.png)

所以，FBI是怎么认出那个外国情报官的

黑鸟看了一下，起诉书第33段写了一套很漂亮的身份锁定链条。

Lemma在encrypted messaging app上联系的账号叫Account 1。

FBI先是查到那个外国情报官2022年5月申请美签时留的电话号码Telephone Number 1。

然后open-source调查发现这个号码绑在Encrypted Messaging Application A的一个profile上，头像(knot，一个绳结)。

2022年9月，Account 1的头像也是同一个绳结。而且Account 1显示的用户名跟签证申请表上的名字一致。到了2022年8月，Account 1的头像换成了一个人脸照片，跟签证照片和埃塞政府情报部门官网上的公开照片长得一样。

FBI就是这样把一个加密聊天账号跟一个具体的外国情报官员对上的。

那么，他们聊了什么

起诉书第34到35段摘录了聊天记录。

Lemma发了一张跟埃塞有关的图片过去，说：Your team analyze this and establish some sort of sense to this.（你们团队分析一下，搞出点眉目来。）

对方回复：We making significant progress on averting the...in few days we will achieve the critical milestones...not to happen again. Therefore, it's not a long time we are asking. Good if you can check and back to me what u can do.（我们在阻止……方面取得重大进展，几天后就能达到关键节点……不会再发生了。我们要求的时间不长，你看看你能做什么。）

Lemma跟对方聊到埃塞境内的一些地点，对方说：It is great to identify the forward deployed command centers and logistic centers.（能识别前沿部署的指挥中心和后勤中心太好了。）

对方还主动点单，要logistic centers的信息。Lemma回：Absolutely, I have been focusing on that all this week.（没问题，我这周一直在盯着这个。）

Lemma还给对方发过military compound(军事营地)的照片。2022年9月对方说：It's time to continue ur support.（该继续你的支持了。）Lemma回：Roger that!（收到！）

对方甚至给他发过一段感谢：Always this beautiful country have some special people who scarify their life to protect our proud history. You always remembered. It doesn't matter the results.（这个美丽的国家总有一些特别的人牺牲自己来保护我们骄傲的历史，你永远被记住，结果不重要。）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8af6ecf0f0d6de27.png)

起诉书第10页，FBI通过签证申请、电话号码和profile头像锁定外国情报官身份

31次来自埃塞IP的远程登录

起诉书第37段揭示了一个更隐蔽的通信手法。

2023年4月13日到6月21日期间，Lemma的Electronic Accounts(他自己的非政府账号)从埃塞的IP地址被访问了31次。问题在于，6月16日、20日、21日这三天，Lemma本人已经回到美国，还刷卡进了DoS上班。但他的账号在这几天依然从埃塞IP登录。

FBI探员在第38段解释了这叫advanced Operations Security(OPSEC，作战安全)：间谍之间不直接发消息，而是共享一个账号，一个人在一个地方登录写东西，另一个人在另一个地方登录看。这样通信记录里看不出两个人之间有直接对话，看起来就像是同一个人在不同地点登录。Lemma把自己的云账号变成了一个死信箱。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6f3367eb71d069d2.png)

起诉书第12页，记录Lemma的电子账号在他本人已回美国后仍从埃塞IP登录31次

FBI亲眼看到他把CD塞进口袋

起诉书第27到30段是监控记录，画面感极强。

2023年8月2日晚上，Lemma在DoS的classified电脑上访问非DoS门户看Top Secret情报。他一边看一边在纸上写东西，写完把纸折了好几折，塞进右裤兜，然后离开DoS走向自己的车。晚上10点35分，他把车停在住处附近的停车场车库里，车里灯亮着，坐了二十多分钟没动。

8月7日晚上，他把Top Secret情报报告的内容拷进Word文档，删掉了classification markings(密级标记)，烧进一张绿色标签的CD。DoS的绿色标签盘上明确印着Unclassified，只能存非机密材料。他把这张盘塞进夹克口袋，离开classified区域走出大楼。晚上8点35分他提前下班，穿着那件夹克上车，在车里坐了几分钟，然后把车开到工作场所车库，再开回马里兰州的家。

8月15日，他又看了15分钟classified portal，在纸上做笔记，折好塞进右前口袋，走出SCIF开车回家。

8月18日，他又烧了一张绿色标签CD塞进兜里。那天他一个人完成了大约10次下载，大部分是Top Secret或Secret级别的内容。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/23e7736111c4a7ca.png)

起诉书第8页，记录8月7日Lemma将Top Secret内容拷入Word、删除密级标记、烧入绿色标签CD并塞入口袋

存钱时间线如下：

2022年2月9日，Lemma飞回他的原籍国(起诉书里叫Relevant Country，就是埃塞俄比亚)，他在那里有家人。2月6日他在美国打印了一份classified文件，三天后上了飞机。他在埃塞待到4月30日才回来，落地当天就往银行存了4300美元现金。

2022年5月，那个后来被他联系的埃塞俄比亚情报官申请了访美签证，签证表上留了自己的电话号码和政府单位。

2022年7月，Lemma从埃塞回来后开始在DoS的classified系统里下载文件到CD/DVD。

2022年8月，他通过一款encrypted messaging app把Top Secret级别的satellite imagery(卫星图像)发给了对方账号。9月又发了SECRET级别的内容，关于第三国在该地区的活动。

2022年8月17日，他在DC的K Street存了9680.22美元。第二天8月18日在Metro Center又存了1936.06美元。两笔加起来超过11000，他故意拆成两天存，就是为了不触发CTR(Currency Transaction Report，货币交易报告)的1万美元申报门槛。

2022年12月7日，他在马里兰州Silver Spring存了10000美元，同一天还在另一家银行开了两个joint account，现金开户存了2000。一笔超过12000的钱，他拆到两家银行。

2023年2月23日，他又在Silver Spring存了11373.63美元。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c6f71c783231623e.jpg)

最后，FBI Counterintelligence and Espionage Division的助理局长Roman Rozhavsky在声明里说：Despite swearing an oath to defend the Constitution of the United States, Abraham Lemma betrayed our country by committing espionage on behalf of the Ethiopian government.（尽管宣誓捍卫美国宪法，Abraham Lemma却代表埃塞俄比亚政府从事间谍活动，背叛了自己的国家。）

他还特别提到，Lemma提供的classified national defense information被埃塞俄比亚官员用于一场正在进行的冲突中的军事行动。这就把事情从简单的「泄露文件」升级成了「直接影响军事冲突走向」。

黑鸟简单解释一下：

## SCIF是什么

Sensitive Compartmented Information Facility不是随便一间锁了门的办公室。它是经过专门认证的物理空间，有电磁屏蔽防止信号泄露，门口有安保检查，手机和个人电子设备严禁带入，进出要登记。美国情报系统里所有涉及Top Secret/SCI的工作都必须在SCIF里完成。Lemma能在里面干活，说明他通过了最严格的背景调查。但讽刺的是，他恰恰是利用了自己在SCIF里的合法位置来从事间谍活动。

## downdraft authority为什么危险

Downdraft权限允许把classified系统里的unclassified文件导出到普通网络。这个权限本身是合理的，因为日常工作中确实需要把一些已经脱敏的信息从高密级网络带到普通网络。但它创造了一个天然的数据外泄通道。攻击者不需要破解什么防火墙，只需要一个有downdraft权限的内鬼，就能把东西「合法」地搬出来再伪装成普通数据。Lemma把Top Secret文件烧进绿色标签光盘，本质上就是利用了这个信任链条。

## need-to-know原则为什么没能拦住他

Need-to-know是美国classified信息管理的底层逻辑：你有许可不等于你能看所有文件，每个访问都要对应你的工作需要。但Lemma的问题在于，他同时在DoS值夜班和DoJ白班，两个机构的classified系统之间存在天然的交叉地带。系统可能不会阻止他浏览某个报告，因为从技术上讲他「有权限登录这个系统」，而need-to-know的判断在很多时候依赖人工审批和事后审计，而不是实时拦截。他就是在这个缝隙里翻了133份报告。

## 为什么手写笔记比电子拷贝更难防

现代DLP（Data Loss Prevention，数据防泄漏）系统可以监控你复制粘贴了什么、下载了什么文件、发了什么邮件。但你在屏幕上看了一段情报，然后拿笔在纸上抄了几行字，DLP完全看不见。这也是为什么SCIF里对纸张的管理极其严格，带进带出的笔记本都要登记。Lemma能把手写纸条折好塞进口袋带出来，说明物理安全环节也出了漏洞。

* * *

《来设一下，给你大红花》

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5b01556ce9155b2.png)

美国 · 目录
