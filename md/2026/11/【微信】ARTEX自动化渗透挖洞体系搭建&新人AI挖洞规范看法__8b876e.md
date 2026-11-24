---
title: 【微信】ARTEX自动化渗透挖洞体系搭建&新人AI挖洞规范看法
source: https://mp.weixin.qq.com/s/D4AEi9FoiAvqIb0Qe4A54w
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T01:38:04+08:00
trace_id: f48ed3d2-d374-405c-a880-815e089f8835
content_hash: 61fcc43fb65b64569f0324e9bd2771fd90cfbdddc171cb38402c8ac7d70a8cd5
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 95
  succeeded: 95
  failed_urls: []
notion_page_id: 42275244-d011-814f-bab3-dc40f63f3213
ioc:
  cves: []
  cwes: []
  hashes:
    - bd060519f29a48600791b3595e15feb1
  domains: []
  tools: []
  techniques: []
---

**猎洞时刻** *2026年11月23日 13:40*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/34d708b406f0dce5.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a730f5206a2911f.png)

```javascript
本公众号“猎洞时刻”旨在分享网络安全领域的相关知识，仅限于学习和研究之用。本公众号并不鼓励或支持任何非法活动。
本公众号中提供的所有内容都是基于作者的经验和知识，并仅代表作者个人的观点和意见。这些观点和意见仅供参考，不构成任何形式的承诺或保证。
本公众号不对任何人因使用或依赖本公众号提供的信息、工具或技术所造成的任何损失或伤害负责。
本公众号提供的技术和工具仅限于学习和研究之用，不得用于非法活动。任何非法活动均与本公众号的立场和政策相违背，并将依法承担法律责任。
本公众号不对使用本公众号提供的工具和技术所造成的任何直接或间接损失负责。使用者必须自行承担使用风险，同时对自己的行为负全部责任。
```

自动化渗透工具简介

ARTEX 是一个“让 AI 自己动手做渗透测试”的开源系统。你给它一个目标和一个授权范围，它就能像一支小型攻击队一样，自主规划、调用真实工具、发现漏洞、记录证据，全程几乎不需要人盯着。它曾拿下百度“agent+”攻防挑战赛冠军，但后来因为被恶意滥用，原作者已经下架了代码。

下面直接介绍如何快速安装，环境基于Linux Kali。

并且因为原本的项目已经下架，所以我们使用本地GO编译安装，然后下面的命令直接无脑复制使用即可，安装比较容易，保证有go和npm环境即可。

其次，使用该工具，要严格遵守法律法规，不要未授权渗透，严禁新人AI啥也不懂，乱用AI攻击目标。

## 先检查go环境

先检查你有没有go环境。

```nginx
go version
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd4f712d4ae8857b.png)

如果没有安装go，使用下面命令直接安装。

```bash
sudo apt update
sudo apt install golang
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6c1202aec988687f.png)

```nginx
go version
```

下面发现安装成功

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/33bd8a01df09caf8.png)

还有一个要注意，提前安装好docker 和 docker compose，可以AI生成命令安安装。

## 安装ARTEX

## 公众号后台回复“261103”下载artex压缩包，进行解压，然后把文件夹复制到kali里面。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd68874a4e9cea70.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de8797c2cb7d3781.png)

执行下面命令进行安装，下面安装方式都选择2、2、任意密码

```bash
sudo ./install.sh
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/75f6d52b1f3aeae0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/37f9ee80afe997f9.png)

没法直接访问，需要构造一下前端。

```javascript
http://127.0.0.1:8787
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eefb9b3efee9ac70.png)

## 构建前端

ARTEX 前端基于 Next.js，必须有 npm 才能构建。

使用下面命令安装npm环境

```bash
sudo apt update
sudo apt install nodejs npm -y
npm --version   # 验证安装
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/52f58196b75f6156.png)

重新进入到artex文件夹，把上面的那个artex的终端关了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5616351c39b189d4.png)

执行下面命令，构造前端，和重新编译带前端的artex

```bash
# 1. 进入前端目录
cd web
# 2. 安装依赖（用 npm ci 更稳定）
npm ci
# 3. 静态导出前端
npm run build:static
# 4. 回到项目根目录
cd ..
# 5. 确保嵌入目录存在，并把前端产物拷进去
mkdir -p server/webui/dist
cp -r web/out/* server/webui/dist/
# 6. 重新编译，这次加上 -tags embedui
CGO_ENABLED=0 go build -tags embedui -o artex ./cmd/artex
```

后面生成一个新的带有前端的artex

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5f90cf7f7a28b59.png)

然后进行sudo重新运行，把之前运行的artex关了。

```bash
sudo ./artex
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/65169c5c0a9f0c50.png)

访问下面命令，直接进入渗透系统。

```javascript
http://127.0.0.1:8787/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f824a051e222678b.png)

有了渗透agent，还需配置大模型，点击LLM

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8934eba919cd8042.png)

这里看你，可以deepseek，也可以claude、glm等模型。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/205d68b5ca8b07ea.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b87e68d81204a195.png)

创建后简单测试，可以直接使用AI，连接成功。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b23e5045dc6cde02.png)

进入任务模块，创建渗透任务。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/12f90d6171181a66.png)

下面是功能介绍，你需要渗透什么目标，达到什么效果，直接输入即可，利用简单。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/27885cf911698e86.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/99b8950e7fa4cd70.png)

关于AI自动化渗透和新手AI挖洞的看法

先把结论放在前面：不会实战手动挖洞、不了解挖洞规矩，就直接无脑用 AI 挖洞，是行业的毒瘤。现在 SRC 越来越乱，很大一部分就是这群人搞臭的。

但要说清楚，我反对的不是 AI，而是没有判断力的人把 AI 当外挂。AI 本身是工具，问题在于：用工具的人既不懂业务，也不懂漏洞，更不懂边界。

一、纯 AI 挖洞，坏处不只是“效率低”，而是三层风险

第一层：人被 AI 牵着走，听天由命。

挖到啥算啥，没有目标拆解，没有路径判断，也没有验证闭环。AI 给什么，人就信什么。

第二层：分不清有效漏洞和垃圾水洞。

AI 输出一堆“疑似漏洞”，自己却没有能力判断它是真洞、误报，还是毫无价值的噪音。最后不是挖洞，是给 SRC 制造垃圾数据。

第三层：看不懂流程，就可能造成真实破坏。

水平低的人看不懂 AI 在做什么，就可能在无意中触发删库、传马、恶意破坏等动作，造成业务损失，最后承担法律责任。这不是危言耸听，看不懂 AI 的每一步，就等于把风险外包给了一个你控制不了的黑盒。

二、正确关系只有一种：人牵 AI，不是 AI 牵人

手动懂挖洞 + AI 渗透，才是目前的答案。

AI 是能力放大器：你自身强，AI 才强；你自身没有判断框架，AI 只会把错误放大。

以前就业和挖赏金，可能需要 100 分的手动挖洞能力；AI 时代，大概 50～60 分的个人能力 + AI 补足，也能达到类似效果。但请注意，这远远不是 0～20 分、啥也不会的人能搞明白的。

纯手工挖洞效率低，纯 AI 挖洞容易造成风险破坏。版本答案只有一个：个人能力 + AI 赋能。

三、“AI 门槛低”不等于“能力门槛低”

很多人有个误区：AI 门槛很低，谁不会用？

但现实是：菜鸟会用 AI，高手也会用 AI。为什么相同的 AI，别人能挖到，你挖不到？

本质区别不是谁更会点按钮，而是：

高手深入理解业务场景，熟悉漏洞挖掘，能直接引导 AI 往深处走、往高效率出洞。

而啥也不懂的人，只能被 AI 牵着走。被 AI 牵着走的人，都是定时炸弹。

更值得警惕的是，AI 在早期确实能快速帮新手“出第一个漏洞”。那种感觉很容易让人沉浸其中，觉得自己很牛逼，仿佛已经入门了。但这往往是借来的能力，最后都会反噬：一旦遇到复杂业务、真实项目、需要判断真伪和边界的场景，就会露馅，最后还得回头从头补技术。第一个洞是糖衣，反噬才是账单。

最恐怖的是，无脑使用AI对业务造成了重大破坏，需要承担法律风险。

而且说到底，AI 工具挖洞本身并没有门槛，也没有护城河。其他新人真想学，几天就能把工具操作搞明白。真正拉开差距的，从来不是“谁会点 AI”，而是谁懂业务、谁懂漏洞、谁能判断 AI 输出的真假和边界。把“会用 AI”当成核心竞争力，本身就是一个幻觉，因为这个东西后面大家基本上都会。

更何况，很多攻防、渗透项目有时候根本不让用 AI，只能古法挖洞；而且还有一个现实问题：AI 不能帮你面试。

所以别太浮躁。别人用 AI，你啥也不会也跟着用 AI 去打，这种纯行业毒瘤，既对行业不负责，也对自己不负责。

收束

一句话：先懂网安技术，再去引导 AI 干活；不是啥也不懂，被 AI 牵着走。

AI 门槛很低，但判断力门槛不低。人牵 AI，是赋能；AI 牵人，是事故。

后台回复【261103】获得ARTEX工具下载链接

网安交流学习欢迎加群！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/53308653ce3c7407.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b527d932334fc40.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8606ac1236eec5b9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b114024267d8589.jpg)

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/160ae8c08f95307e.png)

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

其次还有入职字节跳动、腾讯、智谱、快手、希音、bilibili等会联网大厂的安全部门！

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b2721febca82d6fc.png)

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

理想汽车SRC2026年榜第四

理想汽车SRC2026年榜第十

看云SRC 2026年榜第二

法大大SRC 2026年榜第二

补天-北森云SRC 2026年榜第二

补天-人教社SRC 2026年榜第四

微博SRC2026年榜第八

微博SRC2026年榜第十

UCloud-SRC 2026年榜第三

UCloud-SRC 2026年榜第四

麦当劳SRC 2026年榜第三

麦当劳SRC 2026年榜第八

爱奇艺SRC 2026年榜第四

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

还有其他多个企业SRC年榜前十，就不一一列举了。

以下众多学员漏洞赏金，单个漏洞赏金破万等。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed173d8a154463cc.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8683bdf012abfcbe.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6fe9d86251bf97d6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/70041050303c6a8c.png)

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4ca79de5c379a095.png)

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
