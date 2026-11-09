---
title: 【微信】从反编译到响应体：两款 App 会员/广告权益越权的完整挖掘链
source: https://mp.weixin.qq.com/s/oauqwvb67ydp01blky1raw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:29:07+08:00
trace_id: 2386ea7e-0ceb-49a9-8e59-d67dc392071d
content_hash: ccd7ad3cf5e2afc0306babf7a05e901c2d5471bd264c230e3287ba2802655b8b
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 96
  succeeded: 96
  failed_urls: []
notion_page_id: 41375244-d011-812a-8647-d0b6a271cebc
ioc:
  cves: []
  cwes: []
  hashes:
    - bd060519f29a48600791b3595e15feb1
  domains: []
  tools: []
  techniques: []
---

**猎洞时刻** *2026年11月9日 08:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/34d708b406f0dce5.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a730f5206a2911f.png)

```javascript
本公众号“猎洞时刻”旨在分享网络安全领域的相关知识，仅限于学习和研究之用。本公众号并不鼓励或支持任何非法活动。
本公众号中提供的所有内容都是基于作者的经验和知识，并仅代表作者个人的观点和意见。这些观点和意见仅供参考，不构成任何形式的承诺或保证。
本公众号不对任何人因使用或依赖本公众号提供的信息、工具或技术所造成的任何损失或伤害负责。
本公众号提供的技术和工具仅限于学习和研究之用，不得用于非法活动。任何非法活动均与本公众号的立场和政策相违背，并将依法承担法律责任。
本公众号不对使用本公众号提供的工具和技术所造成的任何直接或间接损失负责。使用者必须自行承担使用风险，同时对自己的行为负全部责任。
```

仅供漏洞思路学习分享，实战漏洞均已修复，勿测试。

以下图片进行了脱敏和替换，非真实漏洞业务图片，替换成其他无关app的图。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/07a99c137b8bb3a4.png)

漏洞一：反编译挖出权益 ID，想什么权限就有什么权限

App A 是阅读产品，会员分好几档：SVIP、免广告 VIP、出版 VIP，每档给的权益不一样——免广告、离线阅读、自动阅读、出版书畅读、听书消耗等等。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/36c55a9965e81f51.png)

阅读的时候顺手抓包，捞到这么一个接口，这个接口是新人账号的时候，可以免费领取三天出版VIP会员的接口，但是是最低权限的出版vip，只有一个“畅读出版”的特权。

注意这里有一个关键参数pxxx_id_xxx

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/930404cbb30411b7.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/54d6337decca75b7.png)

对应的是这个会员功能。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d030c598f94fc6ef.png)

然后就猜测，竟然通过一个api就能直接免费领取其中一个低权益免费vip权限三天，是不是修改这个pxxx_id_xxx的值，能领取其他的vip?，比如svip？

具体这么干的：

1、用 MT 管理器把安装包解包到指定目录；

2、进打包目录，选 dex2++ 反编译；

3、先全局搜接口路径（smali 层），把范围缩到权益相关的那几个类；

4、再搜 pxxx_id_xxx，看命中位置，确定主属性文件；

5、用 MT 管理器自带的功能把 smali 还原成 Java，最后拿到 PxxxMxxxxer 这个类。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/92844e1190febb8f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6aa36548f55aabf0.png)

阅读完成反编译源码后才发现，pxxx_id_xxx并不是代表svip、vip之类的，他是代表的svip、vip的某个具体特权。

比如svip有五个特权，就是包含了5个pxxx_id_xxx的值。

普通vip有三个特权，就是包含了3个pxxx_id_xxx的值。

因为上面的赠送的出版vip，只有一个功能，所以发包pxxx_id_xxx只有一个值。

总结来说，仅仅只是本地校验这个pxxx_id_xxx的值，如果值对的上，就有对应的权限，服务端只验登录，不验这个编号该不该给你。

结果就是一张完整的对照表，整理出来是这样：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/664332e19769a66d.png)

于是我们通过burpsuite，不断的修改pxxx_id_xxx值给自己增加权限。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad77873658d5d4d4.png)

提权成功，具有对应的新权限。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d7af734807ce405d.png)

同一个账号，把编号依次换成短剧中插免广、听书消耗、自动翻页等对应的pxxx_id_xxx值都给加上。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b1c75f76d6b5f04b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/21650741abc691a7.png)

刷新一下，发现提权成功，增加了很多新的权限，相当于svip。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c332433849785d7.png)

漏洞二：改个响应参数，白拿一天会员

App B 是个听书产品，主打“免费畅听”，但免费是有条件的：看广告换时长。你看够指定数量的激励视频，就能拿到当天一定时长，甚至全天不限时。

对平台来说，这事一举两得：用户拿注意力换内容，平台拿广告费抵版权成本。所以“你到底看没看够广告”这个问题，本质上就是平台的收银台。收银台要是能自己改数，那这个模式就白搭了。

漏洞复现

先打开“我的—我的资产”，能看到一个“剩余时长”。

接着把几个接口的返回拉出来横向比，发现有个字段很扎眼：

ad_free_privilege_unlock_times 本应是服务器维护的已观看广告次数，漏洞在于允许客户端直接控制这个关键参数。

具体来说：正常流程: 观看广告 → 服务器计数+1 → 达到阈值 → 解锁权益

攻击流程: 修改参数为过更大数值 → 直接（接近）满足条件 → 解锁权益

（值为-1=未参与看广告，值为0=开始，值为1=第一档广告，值为2=第二档广告）

第 1 步：先记个底。进“我的资产”，剩余时长 299 分钟，没有全天免费播放权益。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/46b859938aa5a0a3.png)

第 2 步：把规则读明白。活动说明写得很清楚：时长是分段给的，全天畅听要“按页面提示看完 x 个指定视频”才解锁。这就是我们的对照标准——按规则，看 1 个视频只能拿到一个视频对应的时长，不可能直接全天免费。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4d23c66c8739626e.png)

第 3 步：找到入口。进“免费领时长”，页面显示当前剩余时长。

比如看一个广告，给60分钟，看5个广告，就是60*5=300分钟，

在这看广告中间，如果你能看其中第x个广告，就是解锁当天免费看视频，剩下如果再看广告，可以继续叠加免费时长，明天使用。（x的值是随机的，每个账号不一样。）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c483a285921c41ab.png)

第 4 步：配一条自动替换响应体规则。这个 App 对请求和响应都做了签名，在 Repeater 里手工改包会因为签名对不上被丢掉，时灵时不灵。

所以换个玩法：用代理工具的“匹配替换”（Match and Replace），在响应回来的路上直接改，App 收到的报文表面上看还是“原装”的。规则就一行：

比如我这个是再看满3个广告，今天就能免费看，我把值改成2试一试。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a2e0bbbc257e4de.png)

第 5 步：让页面重新算一次。回到“剩余时长”页面，重新触发查询。这时候页面上的提示变了——从“再看 N 个”变成了“再看 1 个即可领取全天”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5e30d8be895a27c8.png)

第 6 步：后面就看了 1 个激励视频，页面直接弹“恭喜解锁 全天免费畅听”

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2346cbc602642f66.png)

结论：规则要求看 x 个，实际看 1 个就解锁了，造成了漏洞。

如有是要求看10个广告，你直接修改值为9或者10，就只需要看一次广告，或者不看广告，就能直接解锁全天免费。

网安交流学习欢迎加群！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/53308653ce3c7407.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b527d932334fc40.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8606ac1236eec5b9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/affe94f02b9f1c34.png)

挖洞、赏金和入职实战班

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d5fe7dd04fc120b.gif)

NEW JOURNEY IN TECHNOLOGY

AI赋能挖洞培训

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64c26b362af0decd.png)

网安新人应该做什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/79582102c146626d.gif)

经常有新人问我，我明明自学了那么多网安技术，B站也学了很多，一两年了为什么迟迟在实战无法上手？只能去打靶场？ 那是因为你没经过系统化实战训练，你学的技术全是碎片化的，今天学Web漏洞，明天学python，后天被抖音的人忽悠学Kali，今天靶场明天又实战，实战挖洞还不会，硬要学内网渗透，最后技术存在断崖鸿沟，这样学一辈子难以入门，更有垃圾网安培训，全程只有靶场，根本就没有带学员去实战挖洞培训。

其次还有些新人，大三大四了还不会实战挖洞，只会点DVWA靶场，完全走的是学校老师的路线，太慢了！很多大学老师到大三才开始教学漏洞原理和靶场，而你的同龄人已经早已去大厂实习了，所以说别幻想学校老师能教会你什么。是不是温水青蛙，自己学的水不水，你自己清楚，别再欺骗自己了！

只有真正的实战挖洞能力，永远都是你在网安这个行业的核心竞争力！挖洞足够强，无论是就业大厂，还是实现SRC赏金，都是水到渠成！这些远比其他的更重要！

如果有挖洞入职培训咨询、网安考证、扩列等，欢迎加我。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ecd78d0058f82697.png)

猎洞时刻团队介绍

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/59c73f57dbd67a81.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4f7e72f6165e7f2a.gif)

我们团队自从2023年成立以来，历经三年发展，已经在安全圈内获取超多学员的加入，并且经过培训和一对一指点解答后，成员已经遍布网络安全大厂，如长亭科技、奇安信、绿盟科技、安恒信息、360、深信服科技、启明星辰、亚信、微步等多个安全厂商，现在经常在安全厂商，同一个办公室、区域，可能就有我们多个学员，也非常感谢各位师傅们的支持，往后的课程，内容和质量只增不减！

团队学员对于一些SRC平台，如EDUSRC平台，2026年斩获团队榜单第二、2026个人榜第一，在2025斩获团队榜单第四、成员个人榜单第一，诞生多个千分Rank和证书大满贯的师傅。

在企业SRC方面，网易SRC2026年榜第一、蚂蚁集团SRC2026年榜第五、看云SRC2026年榜第二、爱奇艺SRC2026年榜第四、麦当劳SRC2026年榜第三、国通星驿2026SRC年榜第一，等等其他多个SRC年榜前十，还有CNVD单人获取证书量摆不下展台，并且在AI时代的来临，我们也是同样推出AI自动化挖洞等AI系列课程。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64521a588e83819c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/61ac5f7ea50a289e.png)

我们的上面介绍的挖洞排名下面文章有真实图文介绍：

[猎洞时刻SRC挖洞&入职培训｜近期成绩 （文末抽奖）](https://mp.weixin.qq.com/s?__biz=MzkyNTUyNTE5OA==&mid=2247490991&idx=1&sn=478c4ec5cd1d512c79492d10a93addab&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/160ae8c08f95307e.png)

PART.01

网安大厂真的很难进入吗？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/470d7c3b18f1460d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1f6ba9b2fa703146.png)

我们团队学员，进入网安大厂的非常之多，并且我们在这方面也很有培训入职经验，本质上就业安全大厂并不难，原因如下：

比如：网安大厂卡学历吗？

网安大厂，只是在网安行业是大厂，放眼全国，实际上也只是规模上千人或者勉强上万人的企业，是没法和互联网大厂企业的规模比拟的，所以说，他并没有那么高的难度，并且也不怎么卡学历，很多都是双非本科可以随便去，剩下主要看技术能力！当然，专科的也可以，比如长亭，不卡专科，只看技术。

那么剩下的就是技术能力的要求，那么现代网安大厂，需要什么技术能力？

简单就是下面几个要求：

1、对于常规实战挖洞必须非常熟练，至少Web、小程序和APP你都能渗透测试，还有云安全相关渗透经验。

2、其次具有丰富的项目经验，那么项目经验从哪来的？也就是你平时参与一些护网项目、渗透项目，还有实习时候的项目都可以。

3、掌握学习前沿技术的能力，比如目前的AI非常火爆，现在很多安全企业，在面试时候，会把AI能力纳入面试要求。

4、这个就是拔尖要求了，你如果没有，也不影响你就业，你如果会，那么就是加分项，比如过硬的代码审计、Java安全、内网渗透、CTF之类的加分项。

前面三个算是必须项，第四个算是加分项，所以从此可以看出来，都是围绕着实战挖洞进行的，你只有掌握实战挖洞，才能做到去做项目、去实习和就业。

如果你只会打靶场的水平，那么在我看来，你和零基础没有多少区别，远远达不到就业和挖赏金的要求，这种完全零基础和靶场水平的差距，花一个月系统化培训就能抹平。

我们猎洞网安主要做实战方面的培训，近两年，在我们猎洞团队内出来的，入职这几个安全大厂，比如长亭科技、奇安信、360、绿盟科技、安恒信息、亚信安全、启明星辰等安全公司，起码也有上百个。几乎每个安全大厂，每个地区分公司，每个安全技术部门，都有好几个学员是来自我们这里。

其次还有入职字节跳动、腾讯、智谱、快手、希音、bilibili等互联网大厂的安全部门！

口说无凭，证据呢？如下，可以左右翻转看一看，这也只是一部分成绩

（这个动图显示不全，只截取了三分之一，实际上更多offer）：

《--可以左右滑动看猎洞学员offer--》

←左右滑动查看更多→  
实际offer比这个多的多。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1de92dc0c530f6e9.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/94d570239d3e7fe5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a76b7acac418859a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/713ac40ca2461a09.png)

PART.02

猎洞培训有没有学员成绩介绍？

01

EDUSRC&CNVD&企业SRC

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10b63b6e62d15a59.png)

下面是我们团队成员的一些荣誉总结，欢迎随时查询，我们只做真材实料的培训，助力你完成自己的就业网安大厂目标 or 副业赏金目标！

（2026年未截止，部分排名会有上下微小浮动）

EDUSRC 2026年榜个人榜单第一

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e6cc3ad98faf6cb.png)

EDUSRC 2026年榜团队榜第二

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9e03f4322a73a408.png)

EDUSRC 2026年榜个人榜单第五

EDUSRC 2026年榜个人榜单第九

EDUSRC 2026年榜个人榜单第十

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/789f54aa3d3e5e58.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2721febca82d6fc.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ef342eb02d3714db.jpg)

EDUSRC 2025年榜个人榜单第一

EDUSRC 2025年榜团队榜第四

EDUSRC 全平台团队榜第三

EDUSRC 全平台个人榜第四

EDUSRC 常态化演习个人榜单第四

蚂蚁集团SRC 2026年榜第五

国通星驿SRC 2026年榜第一

国通星驿SRC 2026总榜第三

网易SRC 2026年榜第一

理想汽车SRC2026年榜第五

理想汽车SRC2026年榜第九

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/51240fb6bcd333d5.png)

看云SRC 2026年榜第二

法大大SRC 2026年榜第二

补天-北森云SRC 2026年榜第二

补天-人教社SRC 2026年榜第四

微博SRC2026年榜第八

微博SRC2026年榜第十

UCloud-SRC 2026年榜第三

UCloud-SRC 2026年榜第四

新浪SRC 2026年榜第七

新浪SRC 总榜第九

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/624f4763cb5f4200.png)

麦当劳SRC 2026年榜第三

麦当劳SRC 2026年榜第八

爱奇艺SRC 2026年榜第四

爱奇艺SRC 2026年版第十

喜马拉雅SRC 2026年榜第五

喜马拉雅SRC 2026年榜第十

Soul-SRC 2026年榜第七

途虎安全SRC 2026年榜第五

途虎安全SRC 2026年榜第八

途虎安全SRC 2026年榜第十

知识星球SRC 2026年榜第四

敦煌网SRC 2026年榜第三

合合安全SRC 2026年榜第九

新东方SRC 2026年榜第九

哈罗出行SRC 2025年榜第八

唯品会SRC 2025年榜第六

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ec5292f979b1a25.webp)

NCC国家网络空间安全云社区-产能榜第六

更多成绩具体详情图可以看这个：

[猎洞时刻SRC挖洞&入职培训｜近期成绩 （文末抽奖）](https://mp.weixin.qq.com/s?__biz=MzkyNTUyNTE5OA==&mid=2247490991&idx=1&sn=478c4ec5cd1d512c79492d10a93addab&scene=21#wechat_redirect)

EDUSRC 2026年榜个人榜单第一

EDUSRC 2026年榜团队榜第二

![bd060519f29a48600791b3595e15feb1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a607722b9ed1c19.webp)

2026EDUSRC个人榜，前十名，有四个是来自我们猎洞团队。

EDUSRC 2026年榜个人榜单第一

EDUSRC 2026年榜个人榜单第五

EDUSRC 2026年榜个人榜单第九

EDUSRC 2026年榜个人榜单第十

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/775d2a02cafa4faf.webp) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6eded3f6167bf199.jpg)

蚂蚁集团SRC2026年榜第五

网易SRC2026年榜第一

看云SRC2026年榜第二，单个漏洞破万元赏金。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/493f6495ae65963b.png)

法大大SRC2026年榜第二

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6786308ecf3fc175.webp)

麦当劳SRC2026年榜第三

麦当劳SRC2026年榜第八

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/18ccc29077b77614.png)

新浪SRC 2026年榜第七

新浪SRC 总榜第九

爱奇艺SRC 2026年榜第四

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9652aef81c95ed44.webp)

微博SRC2026年榜第八

微博SRC2026年榜第十

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24f2a1a0f33664aa.jpg)

Soul SRC 2026年榜第七

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d792ef082d8ee8c0.webp)

Ucloud SRC 2026年榜第四和第五

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e52f3a2fd447e005.png)

唯品会SRC2025年榜第六

理想汽车SRC 2026年榜第五

理想汽车SRC 2026年榜第九

还有其他多个企业SRC年榜前十，就不一一列举了。

以下众多学员漏洞赏金，单个漏洞赏金破万等。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed173d8a154463cc.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8683bdf012abfcbe.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fe9d86251bf97d6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70041050303c6a8c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2c1a4490a8518e66.png)

更多成绩内容欢迎加我了解！

PART.03

AI自动化渗透挖洞

01

培训内容是否包含AI自动化渗透和AI安全相关内容？

关于AI自动化挖洞，这方面我们课程也是当然包含的！我们目前猎洞培训课程第四期，一直都是持续更新与时俱进的！目前AI如此火热，我们当然也会开展相关的能力提升，祝学员们也能掌握AI能力，赋能挖洞和就业！

有想要了解的也可以看看下面的文章哦，关于AI挖洞方面的。点击下方链接即可跳转！

[AI挖洞目前已经是大势所趋](https://mp.weixin.qq.com/s?__biz=MzkyNTUyNTE5OA==&mid=2247490564&idx=1&sn=fe84fc6c251f6037fa6f67003f149055&scene=21#wechat_redirect)

也有学员通过AI挖洞，拿到单洞6000元赏金。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9f0d2f3ade58ef2.png)

猎洞第四期挖洞入职培训介绍

01

如何联系？价格怎么样？福利有哪些？

1、我们目前第四期培训的价格为 1888¥ ，第五期价格预估涨价到两千多。

2、一次报名可以永久每期学习，报名后，之前的1～4期，包含以后的第五期、第六期等都能永久学习，不会二次收费。

3、报名包含一对一解答，包含网安的挖洞实战问题、技术问题、大厂入职规划等问题。

4、报名培训，包含直播课程、录播课程、对应详情课件、工具和赠送知识星球，内部交流技术群。

5、如果是完全零基础的学员，报名第四期，会额外赠送一套打基础课程，1～2内足够完成零基础阶段，剩下直接学第四期实战，可以的短期内挖到自己第一个实战漏洞。

6、对于网安方面的考证，如CISP、NISP、PTE均有超低内部价格。

报名如何联系？扫码加我微信，备注“培训”即可，我来给你详情解答！可以找我了解更多我们的学员成绩！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ca79de5c379a095.png)

下面就是贴一下第四期实战课程课表和赠送的零基础课程课表。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/83b80b20dc489205.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b22659ecda58cfd4.gif)

Part 01

第四期实战培训课表

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7dc380eb71142904.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a20ad91029ff2707.png)

覆盖企业赏金SRC，众测赏金，Edusrc，cnvd和工作项目渗透挖掘。

内容方面主要是AI大模型赋能网络安全、AI自动化挖洞和逆向、Web挖洞、小程序挖洞、APP挖洞、JS逆向、云安全、护网培训、项目漏洞实战、前端vue路由渗透等内容。

你直接按照我这个课程路线走（送零基础），半年可以达到人家学生无指导情况下自学2–3年的效果，很多学生还在学C语言、学PHP、Java的时候，你已经步入实战搞赏金了。

下面都是一些课件内容。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7bd81973b2012a02.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ae762489c063ef0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6d0734f9959c5a3b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5cadc9349fb5525b.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4463d51a5aafb2db.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9e394fad4e5827f9.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/678aa20eea125be5.png)

Part 02

零基础培训课表

END

有想法的朋友，欢迎来找我咨询！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/177358ce2b2f6611.png)
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2b4d1b28aabf113.png)
