---
title: 【微信】【2026鲲鹏杯】OSINT方向 Writeup:从线索到答案!
source: https://mp.weixin.qq.com/s/eqraKWZ8hRtG0BTiySQhLg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T13:17:59+08:00
trace_id: d7e399a9-42df-42b2-95ea-bbf5b0a9a0a1
content_hash: af322bd6e52b09bbe85791286b6df7c7806d723efd9af35d8654f509637afb8d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 52
  succeeded: 52
  failed_urls: []
notion_page_id: 41475244-d011-8143-8194-fd4dd21665ca
ioc: null
---

编者荐语：

2026鲲鹏杯-OSINT方向官方WP

**鱼影安全** *2026年11月10日 09:36*

## 纪念日

题目

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d63397e3d9ca5305.jpg)

来到YunSee官网（搜索引擎搜得到，微信公众号也有），在团队开源项目这里能访问到YunSee官方Github仓库

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e5a49be7360fd875.jpg)

通过Google 搜索 Github 注册时间在线查询 会有相关教程让你访问相关接口或是在线查询网站

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8de92104e5e4c7f5.jpg)

https://xyl1null.github.io/GittyAge/

查到创建日期 与 时间：2026727135813 （GMT+8）

题目给到的描述是（GMT-4）

也就是202672715813

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/89aa18f0b454cc86.jpg)

多次尝试搜索 去除年份 72715813 搜到奶娃头像账号

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/65b91ff06a47df3c.jpg)

主页有科普视频

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cddff76aa8991e85.png)

在视频中有部分帧会出现一部分flag，需要手动拼接

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67d6e3fb16b68a56.jpg)

## 《春》

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a91e31b9b9448d87.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/54209a798a982189.jpg)

解题思路: 这道题目主要考的是对于 OSINT 开源情报信息的 搜集能力 以及对其的利用，这个诗句是个兔子洞，当时我设计题目的时候会想到 有会去直接搜诗句的；本题目的核心在于 **苏轼** 走过的路， **我** 也走过一遭。然后需要提交 附近一个带桥字的路牌名字的md5值;

首先我们能确认的信息有 苏轼 我(Dark_River) 还有上面的这张图片, 可以在QQ群找到我，利用QQ 的公开空间去确认我走过一遭到底的哪个地方这题我在群中也有过提示 他并不是简单的图寻，是一道OSINT 题目，其实打开我的QQ空间就能看到我最近游山玩水的地方就是 **西湖**，我还用了苏轼的诗句:**“欲把西湖比西子，淡妆浓抹总相宜”**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5f05b19280042fd5.jpg)

知道大概位置后可以通过 百度地图进行搜寻，因为考虑到时间问题我还加了句提示 在苏轼建造的水利工程附近，那么现在得到的信息就有 ①地点:西湖+苏堤附近 ②图片中应该是水杉树林 ③名字中带一个桥,那就对于百度地图进行3D 浏览查看

1.  首先找到西湖的苏堤:
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/629283f05e1db08d.jpg)

2.  开启全景地图 对附近进行查看 可以对附近的全景划分未4个区
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3f1cc52ddeceee2a.jpg)

3.  接着又是一个坑点 大部分到这都会去搜寻各种各样的桥，什么饮马桥什么的.接下来应该对于这4个区进行大概的 信息考察 看看其植被的品种 环境等.
    

**A 区有点像图片中拍摄的地方 先标注**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e35c83c782d18ca7.jpg)

**B区 明显不是**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aed2b096aa992b3c.jpg)

**C区 有点异常 里面有个延伸到 景区内的路段，一看名字 清波桥河下**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8e62d06f2cb522f6.jpg)

**用全景进行探索**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40474d3674f0f56e.jpg)

发现了题目中给到的位置 答案就是 **清波桥河下**，名字带桥不是桥.当然要提交其md5值(小写)

## 收手吧阿祖!!!

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/afbea08e546784ac.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/05227ea6f250fcf3.png)

这道题难度较高,是我在练习国外的 OSINT题目后自己琢磨制作的(题目全程可以直接访问没有特殊动作 特殊地区请谅解) 这道题目准确的来说是OSINT + 一些MISC;

先从文件层面来分析 有2 我累铜泥完压缩包中存在2个 文件 一个的flag.7z 一个是 wyz.png,MISC做的多的都知道 flag.7z 大概率就是flag了。

首先本题目给的信息几乎没有，只是个梗，那么只能对图片和7z 文件动手了,7z 文件对其进行简单的文件检查和exif信息等，然后重点是png 文件 用010 打开 开局看扁所有人的 各位彦祖，可以看到 文件头是完整的 在注释出现了很多 yunsee.team 的网址

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5fe654d4f337bf96.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e67fd99bf1066d48.jpg)

访问后可以看到是我们团队的 简介/介绍页面 这里先埋下一个伏笔，我们接着区审阅png 文件 当然如果你对网页感兴趣的也可以看看源码什么的，可能有些会藏下一步的指引之类的。

为了防止有些小帅哥和小美女不动脑筋，直接用某位随波逐流去梭哈，我特意测试过了 需要手动去提取才好搞到 下一步的关键道具: （古法） 在这里我们需要知道 在计算机系统中各种文件 是有他们各自的文件头和文件尾巴，文件头是用于计算机去分辨他是什么类型的文件 而不仅限于所谓的后缀，文件尾是用于结束一个文件的标识，PNG 的文件尾常常可以看到是一个可见字符串 IEND......进行封闭的，那么我们就能通过文件尾巴来判断 有没有藏匿文件

先记住”本文件”正常的文件尾

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c5f5d6ac40da677.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c57711bec51ecc8d.jpg)

接着我们简单搜寻 IEND可以看到出现了2个IEND ，还需要进行跟踪以防有概率是文件他的16进制可能翻译为ASCII 的时候正好是IEND 因为我们是通过 明文来的 准确的来讲应该通过完整的 文件尾16进制来进行跟踪

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96e7cfc4d1baeaf8.png)

能看到 第一个文件尾是正确的，这就说明该png文件中可能还藏匿了其他文件 ，我们可以直接将 逗号后的全部内容都剪切到另一个文件中，然后先看看 刚才的文件有没有出现异常,然后通过对剪切部分的 文件头修补来得到 一张图片

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e1ca80136ad702b9.png)

有些没了解过 CTF 历史的可能不知道这个标识，他是 国外DEFCON黑客大会 CTF的标志,我国蓝莲花战队曾经在2013年成为首支成功闯入DEFCON黑客大会 CTF全球总决赛的华人队伍。 然后提示中说过要结合 yunsee.team 官网来进行搜寻，官网中最突出的是名字 通过名字 + defcon 的形式来搜索, 这里其实可以直接用作者也就是我的名字来进行尝试 (这和前文的yunsee.team 有关)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d3a1247ded94f345.png)

能搜到 defcon 的user Profile 网页

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96adf418bc419e90.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0a4f1f96d1a78226.jpg)

然后能在 About 中看到 16进制信息

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd8e509685ccd2f1.jpg)

这里用 chef 解密后是一个网址

`https://cn.anotepad.com/notes/am4hp97p` 

一个在线的网页记事本里面

复制出来对其进行检测 可以看到一个 ASCII 艺术 其实他是个彦祖的ASCII 图，但是 网页的问题会变形 ，然后最上方为英文版三国演义，最下文有个提示: 有些事情在不同的角度看，会得到不同的结果，一千个人心中有着一千本哈姆雷特，找到那些相同的东西

通过查看 我们发现了一个 **base64**

解码后是一个兔子洞

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/760a651f72022590.jpg)

提示中说不同角度 去看相同的东西 这里面相同的东西 有看起来很奇怪的字符串

`/KXXt@Vuay\d9Nwv>EC<U*,f%tXc/N^vG-\![Bk8K/YcEk?2:>`

从不同角度也就是说将其反转试试

`>:2?kEcY/K8kB[!\-Gv^N/cXt%f,*U<CE>vwN9d\yauV@tXXK/`

然后去尝试解他可以在base92 中得到密码

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/87f3bda2f0022de1.jpg)

这就是flag.7z 的解压密码 wo_cong_lai_dou_wu_hui_shu 最终得到

`flag{YUN533_15_V3rY_600D}`

## 记得回头

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4149b103527ff324.jpg)

通过yuiiijuk和YunSee从github上找到关键账号

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/56d6512eca176730.jpg)

找到关键信息假flag，可以得知要去说see999!!! 以及一个cartg的名字 在微信公众号搜索 cartg

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a78aacbbcee6252f.jpg)

进行关注

关键信息里面有一段假flag

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a495b6fc64acee80.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/26431aa6a7db1265.png)

发送see999!!!

即可获取真flag

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c4f30a399b54a85.jpg)

`flag{YunSee_Os1n7_g0od_HC_yuiiijuk_666}`

## 加州大道东

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9b9ce3dac067a6b2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/90118e3cd33e1cd1.jpg)

题目中给出的提示有加州大道东和san jose，虽然我知道加州大道东不一定有多少人能猜到我想表达这是在圣荷西的东边，要是你猜到了也是一个很不错的提示

首先我们先用谷歌识图来完整的搜一下互联网上有没有和这个图片相关的信息，我们可以在很前面找到VTA

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1d013f00ee1009bb.png)

我们可以搜索到VTA是圣荷西的交通网

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2809bf3fe3fa3929.png)

这个题难就难在我打算让你通过www.vta.org，结合前面的加州大道东和圣荷西的地图，每条线路去看一遍找到这条道路的地址

最后你可以在找31号线的时候用谷歌街景扫到这个站点

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fecd34e6c3b10c68.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb653685312f9e8f.jpg)

找到一样的地方37.268018,-121.8224694保留三位37.268\_-121.822

圣荷西很美，希望可以来圣荷西找我

* * *

欢迎师傅加入交流群学习/招新简历可以联系小编！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/71b3d79534c6dc78.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e2123f38187482db.png)

* * *

* * *

排版偏手机观看，手机看效果体验更好哦！

需要交流或者培训可以联系小编加群交流！

2025第二届全国行业赛-电子取证师需要资源dd

初赛培训班10+学员全部晋级复赛，可以指导！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0b41763051f9c0f4.webp)

此次2025行业赛圆满结束！

需要备战2027第三届网络安全行业赛-电子取证赛道的可以联系小编.适合取证感兴趣的小伙伴，0基础也能学。

PS：数证杯、美亚杯辅导需要可以联系！

* * *

数据安全/信息安全评估赛项星球

第二届数字化职工组/数据安全技能大赛（备战第三届可以培训）

第四届全国数据安全职业技能竞赛（美亚数据安全管理员/可培训）

知识星球799/年（后续有最新资源可能涨价，购买前私信小编！）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ecd1fc0b33c0a5c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fbf45b20847f9e1d.webp)

****关注我们/战队招新****

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8f79e578003edd34.webp)

招新要求：

热爱安全，不止围观。

为了聚集更多热爱网络安全与 CTF 的伙伴，鱼影安全现面向全网招募战队成员。无论你是在校学生、安全从业者，还是正在自学的新人，只要愿意持续投入、认真钻研，都欢迎加入我们。

### 招募方向：

Web安全/Pwn/Reverse/Crypto/Misc/Ai安全及相关方向

### 我们希望你：

1.对网络安全和 CTF 有长期兴趣，能够保持稳定学习，而不是三分钟热度；

2.至少掌握一项基础能力，例如 Linux、Python、Web 基础、逆向分析或密码学基础；

3.能够独立完成简单题目，并清晰整理、复现解题过程；

4.有责任心和团队意识，比赛期间能够及时沟通、合理配合；

5.遵守法律法规和团队纪律，技术仅用于合法授权的学习、研究与竞赛。

没有比赛经验也可以报名。相比“现在有多强”，我们更看重你的学习能力、执行力和持续投入。

### 加入后你可以获得：

1.日常刷题、技术交流与经验分享；

2.CTF 赛事组队及实战机会(线下组局认识大佬机会）

3.优质题目、工具和学习资料共享；（内部比赛环境资源）

4.Writeup、原创文章及个人成果展示机会；

5.与团队成员共同研究、共同进步的技术氛围。

我们不要求你一开始就很强，但希望你靠谱、主动、愿意坚持。

如果你也想从“看别人做题”走向“自己拿下 Flag”

欢迎加入鱼影安全CTF战队

联系方式：添加上面小编绿泡泡发简历即可

欢迎关注 **鱼影安全** 社区,专注CTF,职业技能大赛中高职技能培训,信息安全评估高职组赛项,金砖一带一路诸暨技能大赛:企业信息安全赛道-攻防治理赛道-首届金砖虚拟网络建设赛道-创信大赛,世界技能大赛省选拔赛,企业赛,行业赛,电子取证和CTF系列培训,工控CTF系列，第二届网络安全行业职业技能大赛（电子取证师、渗透测试员、网络安全管理员、网络信息审核员）全国运维赛等。

鱼影安全团队招人啦,有感兴趣的师傅可以私信我

电子取证培训、盘古石、美亚杯、内部比武可以一对一指导！

需要学习数据安全管理员和CTF安全培训,可以联系小编！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed114c9d78bdbf8d.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/849bf68f70a42413.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9236b4b18fa0d732.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7bc7aa814bb33e63.gif)

**点分享**

**点收藏**

**点在看**

**点点赞**
