---
title: 【微信】吃透APP逻辑漏洞挖掘思路：汇总越权、信息泄露、重放刷VIP、加固后仍挖出高危逻辑漏洞等真实实战案例
source: https://mp.weixin.qq.com/s/kX3gnGpTPU06rrJTsEyb6A
source_host: mp.weixin.qq.com
clip_date: 2026-07-27T00:34:42+08:00
trace_id: 62c95539-a540-4ad0-8492-1abb137eb0e3
content_hash: 7de655cea3d7e1ae1c162d9094fb9e8ee8c4d7326ae3408d24e9bc97552a9130
status: summarized
tags:
  - 微信
  - APP逻辑漏洞
  - 渗透测试
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 通过业务逻辑分析，即使APP进行签名加固，仍可挖掘出短信轰炸、越权、SSRF、付费内容泄露和无限刷VIP等高危漏洞。
ai_summary_style: key-points
images_status:
  total: 28
  succeeded: 28
  failed_urls: []
notion_page_id: 3a975244-d011-8140-9995-c223156c5ad6
ioc:
  cves: []
  cwes: []
  hashes:
    - b43369da38154cd9757706e3b709682c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过业务逻辑分析，即使APP进行签名加固，仍可挖掘出短信轰炸、越权、SSRF、付费内容泄露和无限刷VIP等高危漏洞。
> 
> - **短信轰炸漏洞：** 登录页面验证码接口缺少频率限制，通过抓包重复发送请求可导致短信轰炸。
> - **无回显SSRF漏洞：** 意见反馈的图片上传功能中，image参数为URL，替换为外部链接后可在VPS上收到请求，证实SSRF。
> - **越权漏洞：** 订单ID和优惠券ID可遍历，通过修改请求中的ID值可越权评价他人订单或使用他人优惠券。
> - **信息泄露漏洞：** 聊天接口数据包泄露服务者真实手机号和imId，且imId可遍历，导致敏感信息暴露。
> - **加固后高危漏洞：** 即使APP有签名加固，VIP课程内容直接暴露在数据包中，无需付费即可访问；邀请绑定接口存在重放漏洞，可无限次发送请求刷取VIP天数。

**渗透安全HackTwo** *2026年7月27日 00:08*

**0x01 简介**

APP逻辑漏洞的逐级挖掘实战思路与全过程，从基础登录页面漏洞测试入手，逐一复现短信轰炸、无回显SSRF、订单与优惠券越权、用户信息泄露等常见高危漏洞。同时突破传统挖掘局限，针对APP签名加固防护环境展开深度测试，成功发现付费内容泄露、数据包重放无限刷VIP等高阶漏洞，全方位讲解依托业务逻辑突破安全防护的渗透技巧。

> 本文仅用于技术学习与合规交流，严禁非法滥用。因违规使用产生的一切后果，由使用者自行承担，与作者无关。

现在只对常读和星标的公众号才展示大图推送，建议大家把 **渗透安全HackTwo **“设为星标”，否则可能就看不到了啦！****

参考文章：

```bash
https://xz.aliyun.com/spa/#/news/18760
https://www.hacktwohub.com/
```

****末尾可领取挖洞资料/加圈子 #渗透安全HackTwo****

****0x02 正文详情****

记录一下自己之前所挖的APP的一些思路，主要以逻辑漏洞为主

## 挖掘思路

首先我们拿到一个APP时，首先应该要先熟悉整个APP的业务逻辑是什么样的，才有利于我们进行后续的漏洞挖掘，接下来我将从低到高的讲解挖掘过程。

## 短信轰炸

首先打开APP映入眼帘的就是我们熟悉的登录页面

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/152de67a8d67afec.png)

这里首先我们便可以测试一下是否有短信轰炸，任意用户登录等漏洞。而测试发现的确是存在短信轰炸漏洞

这里填入手机号后点击获取验证码抓包如下：

```apache
POST /user/getCode HTTP/1.1
Host: xxx
User-Agent: SM-G9810 Android25 V1.9.0.1
Platform: android
Appversion: 1.9.0.1
Showtest: 0
Oaid: 
Vaid: 
Aaid: 
Imei: 
Androidvendors: samsung
Originalua: Mozilla/5.0 (Linux; Android 7.1.2; SM-G9810 Build/N2G48H; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/75.0.3770.143 Mobile Safari/537.36
Accept: application/vnd.edusoho.v2+json
Appbizsource: 0
Content-Type: application/x-www-form-urlencoded
Content-Length: 28
Accept-Encoding: gzip, deflate
Connection: close
phone=13555555555&codeType=1
```

这里修改phone参数对上面的数据进行重复发包即可打出短信轰炸。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/477bdb21a59e84a0.png)

登录页面测试完后，我们就该进入到APP中进行测试了。

## 无回显SSRF

进入APP后，注意到意见反馈这里

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/da72f99e15ec8adf.png)

意见反馈这里可以看到有图片上传的功能，可以抓包看看是否为url传图片

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ecdce0220dae5d1e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3c576487153a76c9.png)

数据包如下：

将image参数的url先换成自己的vps看看能否请求外部链接

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/85d79e4e91e5237f.png)

也是在vps中收到了请求，src中给出了ssrf的测试连接，打入后截图时间给审核验证了。

## 越权

### 越权评价他人订单

APP中的服务内容为用户下单后可以获取到对应的服务内容，而这过程中发现评价订单的接口处存在越权

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0e2d4e802c12cd85.png)

这里我们下单后先不用付款，当然付款也可以，之前该APP不付款也可以直接获取到评价接口

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5af3b7cfef87d3cf.png)

来到订单详情，点击去评价，填写评价内容后发表，然后使用bp抓包

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/702bddebf04d9086.png)

可以看到我们虽然点击去评价了，但是由于没付款完成服务无法评价，但是我们可以注意到orderId的值只有六位数，很容易进行遍历，这里我们进行遍历

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e8d0b70b33e882f6.png)

可以看到遍历后可以对其他人创建的订单进行服务评价。

### 越权使用他人优惠券

我们选择一个服务进行下单并抓包

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3a72ba5f4022ede5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4551aa4194af9cdb.png)

数据包如下：

之前我们是新用户时，系统会自动赠送一张优惠券，当时的优惠券id couponId=1085908，猜测优惠券id也是可遍历的

这里我们抓包后添加couponId=1085907

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cebb9f3a04a2290f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9da03560dc464f64.png)

然后放包

来到订单处可以看到我们成功使用了别人的新用户5折券。

## 信息泄露

我们在下单服务前可以进行沟通，沟通生成的聊天页面如下

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9b6033bdb8c0cfcd.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/03a45cfc02705899.png)

在bp中的抓包如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b42879e011a57493.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5544712fa45f64a4.png)

之前我们是新用户时，系统会自动赠送一张优惠券，当时的优惠券id couponId=1085908，猜测优惠券id也是可遍历的

这里我们抓包后添加couponId=1085907

然后放包

来到订单处可以看到我们成功使用了别人的新用户5折券。

## 信息泄露

我们在下单服务前可以进行沟通，沟通生成的聊天页面如下

在bp中的抓包如下：

可以看到数据包泄露了服务者的手机号码，而服务内容主要也是通过虚拟号码电话进行服务，这里直接泄露服务者的真实手机号，并且imId也可以进行遍历。（当然就算不遍历也可以想查哪个人直接点开聊天框即可通过传入的上面的数据包直接确定）

## 后续

某APP在被提交了上面的多个漏洞后痛定思痛，对APP进行了签名加固防篡改，假设我们在不进行签名绕过的情况下还能挖到漏洞吗？能挖到高危漏洞吗？

## 挖掘思路

## 付费内容泄露

在平台上有着一些vip才能使用的服务课程如下图

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2cca624543a14954.png)

但是我们其实在点入上面的页面时，bp抓的数据包里面就已经包含有了vip课程中需要用的的mp3网上链接了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/83a89e43b4dd77fe.png)

课程内容是直接挂到阿里云服务器下的，我们可以直接访问使用，完全不需要充值vip

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/73f3a63a1931f1de.png)

## 无限刷取网站vip

APP上有一处邀请有礼

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4a00ae2e4aa60c9b.png)

这里点击邀请有礼后会可以获得一张邀请的截图，发送后扫码可以得到下面的url

```apache
https://test.com/cashback/investMidPage?userId=950485&sourceId=6&userRole=1
```

我们可以直接将上面的url发送到微信中，然后点击链接会跳转到小程序

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5687638b1f11983e.png)

这里点击填入账号会提示邀请绑定成功，绑定成功后bp数据包会有下面这条数据包

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fe4331dc7ec74966.png)

```makefile
POST /applets/userRegister?sign=B43369DA38154CD9757706E3B709682C×tamp=1729442602682 HTTP/1.1
Host: xxx
Content-Length: 110
Devicetype: 0
Xweb_xhr: 1
Usertoken: 
Usepaltform: 1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090c11)XWEB/11275
Content-Type: application/json
Accept: */*
Sec-Fetch-Site: cross-site
Sec-Fetch-Mode: cors
Sec-Fetch-Dest: empty
Referer: xxx
Accept-Encoding: gzip, deflate
Accept-Language: zh-CN,zh;q=0.9
Connection: close
{"referrerId":"950485","code":"","mobile":"13555555555","sourceId":"6","stuInfo":"","timestamp":1729442602682}
```

发现这条数据包会在用户绑定好手机号后给该手机号用户+7天会员，而最重要的是该数据包可以无限重发，也就是说我们可以无限重发来刷取vip

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fecfafac9ccf3d40.png)

重发后都返回成功，我们查看一下vip天数

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ce7f0c6e7f5f3741.png)

直接刷到了2年后。

由于签名+时间戳校验只校验我们不能篡改内容，但是没有校验内容无法进行重放因此也间接导致了这个漏洞的出现。

## 0x03 总结很多人看到APP签名加固就直接摆烂跑路，其实业务逻辑漏洞才是“隐藏大彩蛋”！本次实战挖掘踩遍各类常见漏洞，短信轰炸、越权扒信息、SSRF漏洞一应俱全。哪怕平台做了加固防护，依旧靠重放漏洞白嫖数年VIP、扒取付费课程内容。由此可见，渗透挖掘别只盯技术防护，吃透业务逻辑，漏洞往往一抓一个准！🔥喜欢这类文章或挖掘SRC技巧文章师傅可以点赞转发支持一下谢谢！内部星球VIP介绍V1.5（更多未公开挖洞技术欢迎加入星球）如果你想学习更多另类渗透SRC挖洞技术/攻防/免杀/应急溯源/赏金赚取/工作内推，欢迎加入我们内部星球可获得内部工具字典和享受内部资源/内部群🔥🚀1.每周更新1day/0day漏洞刷分上分，目前已更新至12494+;🧰2.包含网上的各种付费工具/各种Burp漏洞检测插件/fuzz字典等等;3.Fofa/Hunter/Ctfshow/360Quake/Shadon/零零信安/Zoomeye各种账号VIP会员共享等等;🎥5.最新SRC挖洞文库/红队/代审/免杀/逆向视频资源等等;🧪6.内部自动化漏扫赚赏金捡洞工具，免杀CS/Webshell工具等等;💡7.漏洞报告文库、共享SRC漏洞报告学习挖洞技巧；🎯6.最新0Day1Day漏洞POC/EXP分享地址（同步更新）;https://t.zsxq.com/jVcxV(全网最新最完整的漏洞库)🔥7.详情直接点击下方链接进入了解，后台回复" 星球 "获取优惠先到先得！后续资源会更丰富在加入还是低价！（即将涨价）以上仅介绍部分内容还没完！点击下方地址全面了解👇🏻👉点击了解加入-->>2026内部VIP星球福利介绍V1.5版本-1day/0day漏洞库及内部资源更新结尾获取方法回复“app" 获取 app渗透和app抓包教程回复“渗透字典" 获取 一些字典已重新划分处理（需要内部专属fuzz字典可加入星球获取，内部字典多年积累整理好用！持续整理中！）回复“书籍" 获取 网络安全相关经典书籍电子版pdf最后必看 文章中的案例或工具仅面向合法授权的企业安全建设行为，如您需要测试内容的可用性，请自行搭建靶机环境，勿用于非法行为。如用于其他用途，由使用者承担全部法律及连带责任，与作者和本公众号无关。本项目所有收录的poc均为漏洞的理论判断，不存在漏洞利用过程，不会对目标发起真实攻击和漏洞利用。文中所涉及的技术、思路和工具仅供以安全为目的的学习交流使用。如您在使用本工具或阅读文章的过程中存在任何非法行为，您需自行承担相应后果，我们将不承担任何法律及连带责任。本工具或文章或来源于网络，若有侵权请联系作者删除，请在24小时内删除，请勿用于商业行为，自行查验是否具有后门，切勿相信软件内的广告！往期推荐1.内部VIP知识星球福利介绍V1.5版本0day推送渗透安全HackTwo微信号：关注公众号获取后台回复星球加入：知识星球扫码关注 了解更多上一篇文章：Nacos配置文件攻防思路总结|揭秘Nacos被低估的攻击面喜欢的师傅可以点赞转发支持一下

![图片](https://mmbiz.qpic.cn/mmbiz_png/ibrevicNauKAU4ZkjJvWUibxdPYrmw6yu1YbAEzdcrbaJ2q7wuia4JzJM0Q5NUJ0vJZlAKxibia7Ca8WSMFP8kbjJYFUPd2rAtiaEHLY4fLV06icXxE/640?wx_fmt=png&watermark=1#imgIndex=28 "二维码")

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/475167c83dd90967.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9d55dabdcd6c7794.png)

挖洞技巧合集 · 目录

作者提示: 个人观点，仅供参考
