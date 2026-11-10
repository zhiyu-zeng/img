---
title: 【微信】【鲲鹏杯】OSINT 方向 Writeup：从线索到答案
source: https://mp.weixin.qq.com/s/5ymzJwisECuJ42LzcnbgjQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T12:29:39+08:00
trace_id: 09547900-0db5-4dbb-a5bb-f637c2307e9a
content_hash: 5d79b69ed738a722e385738e86330f7e9532fbe7417854e5b9c4dd2593dcf727
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 42
  succeeded: 42
  failed_urls: []
notion_page_id: 41475244-d011-81f5-ac49-c01192e1c205
ioc: null
---

**云晞科技Sec** *2026年11月9日 20:11*

## 纪念日

题目

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/79fe99a447d1184b.jpg)

来到YunSee官网（搜索引擎搜得到，微信公众号也有），在团队开源项目这里能访问到YunSee官方Github仓库

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b409b9b1144755ee.jpg)

通过Google 搜索 Github 注册时间在线查询 会有相关教程让你访问相关接口或是在线查询网站

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/19cdd0152a2c67b0.jpg)

https://xyl1null.github.io/GittyAge/

查到创建日期 与 时间：2026727135813 （GMT+8）

题目给到的描述是（GMT-4）

也就是202672715813

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9ed82910347a55af.jpg)

多次尝试搜索 去除年份 72715813 搜到奶娃头像账号

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c02de338c27aa20.jpg)

主页有科普视频

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/34fbfaa5c84a3d20.png)

在视频中有部分帧会出现一部分flag，需要手动拼接

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b741a531d4ed06dc.jpg)

## 《春》

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/abb9dc2fff961e00.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aa907b1c67e06970.jpg)

解题思路: 这道题目主要考的是对于 OSINT 开源情报信息的 搜集能力 以及对其的利用，这个诗句是个兔子洞，当时我设计题目的时候会想到 有会去直接搜诗句的；本题目的核心在于 **苏轼** 走过的路， **我** 也走过一遭。然后需要提交 附近一个带桥字的路牌名字的md5值;

首先我们能确认的信息有 苏轼 我(Dark_River) 还有上面的这张图片, 可以在QQ群找到我，利用QQ 的公开空间去确认我走过一遭到底的哪个地方这题我在群中也有过提示 他并不是简单的图寻，是一道OSINT 题目，其实打开我的QQ空间就能看到我最近游山玩水的地方就是 **西湖**，我还用了苏轼的诗句:**“欲把西湖比西子，淡妆浓抹总相宜”**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf4e4b5fd6143803.jpg)

知道大概位置后可以通过 百度地图进行搜寻，因为考虑到时间问题我还加了句提示 在苏轼建造的水利工程附近，那么现在得到的信息就有 ①地点:西湖+苏堤附近 ②图片中应该是水杉树林 ③名字中带一个桥,那就对于百度地图进行3D 浏览查看

1.  首先找到西湖的苏堤:
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3d224a20ec581b98.jpg)

2.  开启全景地图 对附近进行查看 可以对附近的全景划分未4个区
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/37ad61a188ef08e6.jpg)

3.  接着又是一个坑点 大部分到这都会去搜寻各种各样的桥，什么饮马桥什么的.接下来应该对于这4个区进行大概的 信息考察 看看其植被的品种 环境等.
    

**A 区有点像图片中拍摄的地方 先标注**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ea9fb07d6f1c1f1.jpg)

**B区 明显不是**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6e64b74e3d09e321.jpg)

**C区 有点异常 里面有个延伸到 景区内的路段，一看名字 清波桥河下**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8185952006243cb2.jpg)

**用全景进行探索**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/16252c80e0a9c34b.jpg)

发现了题目中给到的位置 答案就是 **清波桥河下**，名字带桥不是桥.当然要提交其md5值(小写)

## 收手吧阿祖!!!

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73c67577d7e42300.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40185128604f7b2a.png)

这道题难度较高,是我在练习国外的 OSINT题目后自己琢磨制作的(题目全程可以直接访问没有特殊动作 特殊地区请谅解) 这道题目准确的来说是OSINT + 一些MISC;

先从文件层面来分析 有2 我累铜泥完压缩包中存在2个 文件 一个的flag.7z 一个是 wyz.png,MISC做的多的都知道 flag.7z 大概率就是flag了。

首先本题目给的信息几乎没有，只是个梗，那么只能对图片和7z 文件动手了,7z 文件对其进行简单的文件检查和exif信息等，然后重点是png 文件 用010 打开 开局看扁所有人的 各位彦祖，可以看到 文件头是完整的 在注释出现了很多 yunsee.team 的网址

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/becdbcf2961dc0af.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0c8ef7709fae098d.jpg)

访问后可以看到是我们团队的 简介/介绍页面 这里先埋下一个伏笔，我们接着区审阅png 文件 当然如果你对网页感兴趣的也可以看看源码什么的，可能有些会藏下一步的指引之类的。

为了防止有些小帅哥和小美女不动脑筋，直接用某位随波逐流去梭哈，我特意测试过了 需要手动去提取才好搞到 下一步的关键道具: （古法） 在这里我们需要知道 在计算机系统中各种文件 是有他们各自的文件头和文件尾巴，文件头是用于计算机去分辨他是什么类型的文件 而不仅限于所谓的后缀，文件尾是用于结束一个文件的标识，PNG 的文件尾常常可以看到是一个可见字符串 IEND......进行封闭的，那么我们就能通过文件尾巴来判断 有没有藏匿文件

先记住”本文件”正常的文件尾

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9ec646ee785a03d.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2de0920a217552af.jpg)

接着我们简单搜寻 IEND可以看到出现了2个IEND ，还需要进行跟踪以防有概率是文件他的16进制可能翻译为ASCII 的时候正好是IEND 因为我们是通过 明文来的 准确的来讲应该通过完整的 文件尾16进制来进行跟踪

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9957c9405422b1c4.png)

能看到 第一个文件尾是正确的，这就说明该png文件中可能还藏匿了其他文件 ，我们可以直接将 逗号后的全部内容都剪切到另一个文件中，然后先看看 刚才的文件有没有出现异常,然后通过对剪切部分的 文件头修补来得到 一张图片

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8c4c8b82d60b30dd.png)

有些没了解过 CTF 历史的可能不知道这个标识，他是 国外DEFCON黑客大会 CTF的标志,我国蓝莲花战队曾经在2013年成为首支成功闯入DEFCON黑客大会 CTF全球总决赛的华人队伍。 然后提示中说过要结合 yunsee.team 官网来进行搜寻，官网中最突出的是名字 通过名字 + defcon 的形式来搜索, 这里其实可以直接用作者也就是我的名字来进行尝试 (这和前文的yunsee.team 有关)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d3a1247ded94f345.png)

能搜到 defcon 的user Profile 网页

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e9d9a19aac97c0c7.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4340403145a3d52d.jpg)

然后能在 About 中看到 16进制信息

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/257c91a7247be827.jpg)

这里用 chef 解密后是一个网址

`https://cn.anotepad.com/notes/am4hp97p` 

一个在线的网页记事本里面

复制出来对其进行检测 可以看到一个 ASCII 艺术 其实他是个彦祖的ASCII 图，但是 网页的问题会变形 ，然后最上方为英文版三国演义，最下文有个提示: 有些事情在不同的角度看，会得到不同的结果，一千个人心中有着一千本哈姆雷特，找到那些相同的东西

通过查看 我们发现了一个 **base64**

解码后是一个兔子洞

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a43fce05ba721ab5.jpg)

提示中说不同角度 去看相同的东西 这里面相同的东西 有看起来很奇怪的字符串

`/KXXt@Vuay\d9Nwv>EC<U*,f%tXc/N^vG-\![Bk8K/YcEk?2:>`

从不同角度也就是说将其反转试试

`>:2?kEcY/K8kB[!\-Gv^N/cXt%f,*U<CE>vwN9d\yauV@tXXK/`

然后去尝试解他可以在base92 中得到密码

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c673bea493dddca6.jpg)

这就是flag.7z 的解压密码 wo_cong_lai_dou_wu_hui_shu 最终得到

`flag{YUN533_15_V3rY_600D}`

## 记得回头

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b356ab46a77e3310.jpg)

通过yuiiijuk和YunSee从github上找到关键账号

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9886f5f1aa03443a.jpg)

找到关键信息假flag，可以得知要去说see999!!! 以及一个cartg的名字 在微信公众号搜索 cartg

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3714855378f8921b.jpg)

进行关注

关键信息里面有一段假flag

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/379a0c5925320575.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ba7587d2c63b766e.png)

发送see999!!!

即可获取真flag

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f7aba4815fdeb242.jpg)

`flag{YunSee_Os1n7_g0od_HC_yuiiijuk_666}`

## 加州大道东

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4c9c4f84971fb5eb.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2d2c54cf5297add.jpg)

题目中给出的提示有加州大道东和san jose，虽然我知道加州大道东不一定有多少人能猜到我想表达这是在圣荷西的东边，要是你猜到了也是一个很不错的提示

首先我们先用谷歌识图来完整的搜一下互联网上有没有和这个图片相关的信息，我们可以在很前面找到VTA

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0a62f5b48906c484.png)

我们可以搜索到VTA是圣荷西的交通网

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/41b7f6f9d9dfaf65.png)

这个题难就难在我打算让你通过www.vta.org，结合前面的加州大道东和圣荷西的地图，每条线路去看一遍找到这条道路的地址

最后你可以在找31号线的时候用谷歌街景扫到这个站点

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9a29e81cdeadc46f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2ef483dd828a361a.jpg)

找到一样的地方37.268018,-121.8224694保留三位37.268\_-121.822

圣荷西很美，希望可以来圣荷西找我
