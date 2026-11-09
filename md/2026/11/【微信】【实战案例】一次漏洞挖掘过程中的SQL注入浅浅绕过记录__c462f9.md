---
title: 【微信】【实战案例】一次漏洞挖掘过程中的SQL注入浅浅绕过记录
source: https://mp.weixin.qq.com/s/zC8EvYIExXLfnGCjaJPsbQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:50:13+08:00
trace_id: 59dc0cfe-d799-4369-ae01-5c9ec7e4d7c8
content_hash: f8855c426a3b025ce37e02a623503926b58ae82e532ddcb30e1c4f9294fe65e2
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 54
  succeeded: 54
  failed_urls: []
notion_page_id: 41375244-d011-815c-b50c-ec1add653e6a
ioc: null
---

**神农Sec** *2026年11月9日 09:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96f7f735433653a7.png)

课程培训

扫码咨询

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2bc33e78036ad313.jpg)

专注于SRC漏洞挖掘、红蓝对抗、渗透测试、代码审计JS逆向，CNVD和EDUSRC漏洞挖掘，以及工具分享、前沿信息分享、POC、EXP分享。不定期分享各种好玩的项目及好用的工具，欢迎关注。加内部圈子，文末有彩蛋（课程培训限时优惠）。

文章作者：消失的猪猪

文章来源：https://xz.aliyun.com/news/17077

01

0x1 【实战案例】一次漏洞挖掘过程中的SQL注入浅浅绕过记录

## 0x00 文章背景

日常测试时发现客户网站存在注入，我看着这界面的样子就像是个CMS来的，搜集一会之后确认了，果然是。本来还想着以为可以捡到一本证书了，结果显然运气不够，开发厂商的注册资产没达标。

那怎么办了，挖都挖了，记录一下吧~~

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9dab349e3a50a82b.png)

## 0x01 报错出现

在瞎注的帮助下，发了有几个数据包出现了报错。同时，发现报错信息中返回了SQL语句。最后在逐步测试中，确认了这个包的参数存在注入：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53ada7d35761bded.png)

哎，那很好了。通过上图的报错信息我们可得，最后面的报错信息是：in('')，说明呢，这一段语句原来应该是：

```
select * from xlz where id in ($id);
```

我就简单还原一下，大致是这样基本没有问题了。那么同时，单引号被转换成了反斜杠+单引号，说明这里有函数对单引号进行转义。经过测试呢，这个位置出现单引号、双引号、斜杠之类的会直接报错：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9b4bd88a885b2d59.png)

接下来，在数据库里造一下语句给大家展示一下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/547c5df4cd2ceb14.png)

那么我们后续的Payload，基于这个格式就包没有问题。

## 0x02 长度判断

经过构造构造构造，最后使用的Payload如下所示：

```
11)AND(CASE+WHEN(1=1)+THEN+1+ELSE+exp(710)+END
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/43136b31bca93841.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/646ac3d758a563ed.png)

很显然没毛病，接下来二分法判断库名长度： 14

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/feb4f8a2e94a7ff0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/80bc3790714e9bba.png)

接下来，尝试截取字符串，获取库名。但是，显然某个地方出现了问题，我盲猜一波，有东西被过滤了：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0b1d0c3a7d4fcfad.png)

## 0x03 手拿把掐

依照我一坤年的注入经验来看，前面的语句都没有问题，但是来到 substr() 函数时爆炸了。那么，大概率是逗号被干掉了，那么我们可以：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/da3cc2f0fdd064f2.png)

可以用from for来代替逗号，如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/16e9ccc0ccf4e03b.png)

让我们套进数据包，发包看看怎么事：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/585c1c465d4d206a.png)

果然我的经验没毛病，接下来直接改一下再往里套：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d07502bd9977280e.png)

又忘了件事，出现单引号会被转义。但是获取库名时，字符串是需要被引号包裹的。此时引号又不能用怎么办？那就改造Payload，加入Ascii码函数来转换为十进制：

```sql
11)AND(CASE+WHEN(ascii(Substr(database()+from+1+for+1))=1)+THEN+1+ELSE+exp(710)+END
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/971de4b5e08c463a.png)

没问题了，直接开爆：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35e9f819d234f121.png)

库名已出，点到即止，噢耶~

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/60bc0609075f542f.png)

02

0x2 培训课程介绍

26

**SRC漏洞挖掘培训课程**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/30696f066aca437e.png)

**1.课程价格目前是575（后面也会随着人数越多，涨价）🌟师傅们还可以上车补票，冲冲冲！**

**2.报名成功送知识星球一个，拉内部小圈子交流群+SRC直播通知群！✨**

**3.一周2节课程，直播+录播形式，课程内容大家可以看课表，目前是第一期，一次报名永久无限听课！❤️**

**4.目前是第一期课程，后面比如说开了二、三期，都是不用在花钱的！**

**5.上课结束后，会把视频录播+课件笔记一起打包发直播群！**

**6.哔哩哔哩SRC课程公开课，链接🔗直达：**

**https://space.bilibili.com/642258933**

SRC课程详情🔎： [学了一堆理论，还是挖不到漏洞？你缺的是实战！](https://mp.weixin.qq.com/s?__biz=Mzk0Mzc1MTI2Nw==&mid=2247510755&idx=1&sn=6214a7f5fa76f846db1f5f8808455767&scene=21#wechat_redirect)

内部小圈子知识星球详情🔎： [50 元封顶！渗透攻防 + SRC 漏洞星球限时开放！](https://mp.weixin.qq.com/s?__biz=Mzk0Mzc1MTI2Nw==&mid=2247509408&idx=1&sn=2e12452dfc2d34631af5109af28a6758&scene=21#wechat_redirect)

欢迎关注公众号：神农Sec，报名咨询添加VX：routing_love

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/49edaeffc5fd8a78.webp)

开课快五个月时间，课程目前已经累计加入了1000+个学员了，课程培训招生任火热持续中，师傅们对于我们课程感兴趣的，想要学习技术，找工作的可以咨询我报名。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c93856cfd8baa34.png)

课程培训记录📝，每次上车在1-3小时之间，上课包括课程内部群大家交流氛围很好！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5acca83fd28abe10.webp)

课程上课笔记课件📒都会打包给师傅们，笔记都非常详细，很多几k价格的培训机构哪怕是课件笔记都没有的，我这里都是下课第一时间把录播+笔记打包发给大家！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4d1b43ddd120c479.png)

平常也都会给学员进行一些项目发布，包括后面的工作、护网内推等，经常上麦交流，大家互相学习，简历优化等。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6220f4e0fd5430f2.webp)

SRC漏洞挖掘课程培训已经两个星期了，期间也是创建了“回本小群”，希望学员回本越来越多，创建这个群主要是鼓励学员学习进步，以及不定时发小项目！

最后也是希望大家都可以赚钱，找到好工作🎉

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/07b0bd5174f5f3cf.png)

培训时间不长，感谢🙏师傅们的喜报，很开心看到师傅们给我分享自己的成果，希望师傅们越来越强！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/218b99f47894b863.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/115df9b5eb5a7df9.webp)

平常也会分享项目，下面是一些学员项目成果，群里报课的学员都是不抽成的，主要是帮助学员进行回本，让大家都可以进步！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2596a929ec4ad27a.webp)

上课结束后，会把视频录播+课件笔记一起打包发直播群

**「神农安全」** 知识星球目前已经累计2500+网络安全爱好者的加入！

后面也是小圈子做大起来了，师傅们也都喜欢看我文章，想着给大家教下src漏洞挖掘思路，所以自己花了很长时间做了✨课件和课表，都是纯自己手搓的，大家也可以看下课表的内容。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/564320ddc2cc4ae3.png)

03

0x3 课程特色

课程主打真实，一线SRC漏洞挖掘师傅是如何学习和挖掘SRC漏洞的，让你真正了解SRC漏洞挖掘，助力在岗人员和大学生的能力提升，掌握新的技能树，为下一次跳槽涨薪做好准备。本课程内容覆盖企业SRC、众测项目挖掘、护网HVV红蓝攻防技巧、CVE、CNVD、EDUSRC等平台通杀案例技巧挖掘方法。

本课程适合人群（光看不挖啥也不会）

```objectivec
1、有计算机经验，想从0转行入行的大学生或自学者
2、想从CTF比赛/Web或SRC进阶到项目实战的选手
3、想参与项目/找工作/提高收入的转型者
4、想通过挖SRC赏金做副业的师傅们
5、挖SRC漏洞遇到瓶颈的师傅们
6、想学习AI安全自动化渗透测试漏洞挖掘的师傅
```

课程价格：575 元

报课成功的师傅们直接免费送内部小圈：一个知识星球+内部小圈子交流群

```apache
1、课程价格真心实惠，绝不割韭菜
2、四五百的课程价格让你体会大几千的培训课程内容
3、带着大家从0到1，本人上课坚持手搓课件（实战案例+知识体系）
4、拒绝使用PPT演讲模式（无实操，很枯燥）
```

直播培训教学方式

课程一周1-2节课，课程特色涵盖直播多人上麦活跃回答，直播过程中有问题随时解决或私信我。拉群：一个知识星球内部小圈子交流群+课程培训直播通知群。有项目/工作/护网第一时间内推报课的师傅，一对一简历优化，助力在岗人员和大学生的能力提升。

一次报名每期均可永久学习，并且赠送内部「神农安全」知识星球，一对一永久解答、无保留教学！

欢迎关注公众号：神农Sec，报名咨询添加VX：routing_love

课程均为线上交付，报名成功后不支持退款

内部小圈子（知识星球+内部小圈子交流群+知识库）

对内部小圈子感兴趣的师傅们也可以看下下面的这个跳转链接，里面有对小圈子的详细介绍，报名课程成功的师傅们直接免费送一个（直接点击下面直接可以跳转）。

[强烈推荐一个永久的SRC挖掘、渗透攻防内部知识库！](https://mp.weixin.qq.com/s?__biz=Mzk0Mzc1MTI2Nw==&mid=2247510184&idx=1&sn=3f1f8405d9bd8d029b00c74958a7560b&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b6e528fc13805e31.png)

讲师介绍

id：一个想当文人的黑客

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e761c5e7d4d77a46.png)

欢迎关注公众号：神农Sec，报名咨询添加VX：routing_love

04

0x4 第一期挖洞培训课表内容

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ebd5ec881b4efed.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c775f15318c469fa.png)

**内部圈子介绍（报课赠送）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d578b870c416b0ea.gif)

**圈子专注于更新src/红蓝攻防相关：**

```css
1、维护更新src专项漏洞知识库，包含原理、挖掘技巧、实战案例
2、知识星球专属微信“小圈子交流群”
3、微信小群一起挖洞
4、内部团队专属EDUSRC证书站漏洞报告
5、分享src优质视频课程（企业src/EDUSRC/红蓝队攻防）
6、分享src挖掘技巧tips
7、不定期有众测、渗透测试项目（一起挣钱）
8、不定期有工作招聘内推（工作/护网内推）
9、送全国职业技能大赛环境+WP解析（比赛拿奖）
10、十个专栏会持续更新~提前续费有优惠，好用不贵很实惠
11、每日内部资料分享，内部圈子资料1000+
12、联系圈主获取：内部漏洞知识库+圈子使用手册+内部圈子交流群
13、VX：routing_love，技术交流+疑问解决
```

**内部圈子** **专栏介绍**

知识星球内部共享资料截屏详情如下

（只要没有特殊情况，每天都保持更新）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/799067304ffb2ace.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4fc1507467bedba0.png)

05

0x5 优秀学员报喜

下面是最近两个月培训期间，很多优秀学员进行报喜，看到师傅们有收获，也是感到很开心的！拉回本小群，就是为了促进大家学习，在群里发学员成果，也是为了让大家学习优秀的师傅们。

加油，你我皆是黑马！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1bd556842e53cb47.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a8150e035d1ee1d7.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/428c676eb211a785.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/332c52b1309d3556.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/259707ae93a69579.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad35214f6f83a035.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a910585eda0ae686.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/110d047f209f3918.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/56ce4623cd88d9de.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9bd324e079dfb496.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67387178a1e437c2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e6a0a5eec818024.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/555a73cdb5734c03.png)

****神农安全公开交流群****

有需要的师傅们直接扫描文章二维码加入，然后要是后面群聊二维码扫描加入不了的师傅们，直接扫描文章开头的二维码加我（备注加群）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c922f67c60d4be5f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/20c044c923ced634.jpg)

```
申明：本公众号所分享内容仅用于网络安全技术讨论，切勿用于违法途径，所有渗透都需获取授权，违者后果自行承担，与本号及作者无关，请谨记守法.
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e4196feae5a8fe9.gif)

SRC培训课程 · 目录

作者提示: 个人观点，仅供参考
