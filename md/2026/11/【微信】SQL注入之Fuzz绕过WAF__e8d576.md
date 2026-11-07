---
title: 【微信】SQL注入之Fuzz绕过WAF
source: https://mp.weixin.qq.com/s/d_i5ef6cgFutlDoQI8vEBQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T14:50:08+08:00
trace_id: 9a2856af-fec9-4d62-8c46-7343665e7ef2
content_hash: c50c8bede189ffdb03eb9119636e001b3b86c405e22c31c847b8c12cb6d21ceb
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
notion_page_id: 41175244-d011-81ea-8691-c6439a57aeb5
ioc: null
---

**菜鸟学安全** *2026年11月7日 10:02*

## 前言

打 SQL 注入的时候，最常见也最憋屈的一幕：payload 刚发出去，页面直接给你拍回来一个 WAF 拦截页。安全狗、云锁这一挂，手工去猜哪种混淆能过，基本等于大海捞针——猜一个错一个，测试节奏全被打断。

其实换个角度想，WAF 的本质就是拿规则库去匹配请求里的参数内容：规则是有限的，而注入语句的变形组合是无限的。既然人肉猜不动，那就把这个"猜"的过程交给工具批量去试——这就是 Fuzz 的思路：生成大量混淆变形的 payload 批量提交，按返回差异筛出 WAF 不拦的那种写法。

这篇用 sqli-labs 第一关挂上网站安全狗做靶场，完整走一遍：payload 被拦 → 抓包定位被检点（空格）→ 用 / *a* / 这类变形构造字典 → Burp Intruder 批量跑 → 按返回包差异确认绕过成功，最后拿到数据库信息。这套思路不挑 WAF，换成别的防守产品照样能套。

## 一、什么是Fuzz

在讲fuzz与sql注入结合绕waf之前我们先来讲讲什么是fuzz，fuzz其实就是一种对请求参数的模糊测试，简单来说就是对一个接口的某个参数或多个参数用自定义的内容进行批量提交，根据接口返回内容来判断自定义内容参数对接口的影响。

首先先说waf防御的原理，简单来说waf就是解析http请求，检测http请求中的参数是否存在恶意的攻击行为，如果请求中的参数和waf中的规则库所匹配，那么waf则判断此条请求为攻击行为并进行阻断，反之则放行。

常见的sql注入绕过waf有两种方式，一种是利用waf可能存在的http协议解析缺陷来绕过waf，另外一种是利用各种方式来包装sql注入语句进行混淆来绕过waf的规则库。

FUZZ与sql注入waf绕过结合  
首先来说说造轮子的原理，fuzz是对某个接口的一个参数或多个参数进行自定义参数批量请求的模糊测试，sql注入的漏洞成因是某个接口中后端没有对某个参数或多个参数的内容进行过滤并将参数内容直接合并到sql语句中进行查询，waf的防御原理是解析http请求，对里面每个参数的内容根据规则库进行匹配，那么通过fuzz结合sql注入对waf进行绕过的原理也就显而易见了。

首先我们生成大量经过混淆的sql注入语句，然后填入对应参数中，进行批量发送，根据返回内容进行判断waf是否对这种混淆方式进行拦截，如果拦截则判断这种混淆方式不可取，如果不拦截则可以用这种混淆的方式对所有的sql注入语句进行包装。

然后用burp生成fuzz字典，进行爆破就可以了。

## 二、利用Fuzz绕过WAF获取数据库信息

### 1.Fuzz绕过方法

这里我们下载网站安全狗作为WAF，用sqli-labs实验第一关进行测试 首先我们输入 http://192.168.222.4/sqli-labs/Less-1/?id=1’

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ff427a9cff40ca2.png)

发现报错，进行SQL注入试试，输入 http://192.168.222.4/sqli-labs/Less-1/?id=1’ and ‘1’=‘1

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d10e2db20acce735.png)

发现WAF进行了拦截，无法进行注入，这时我们就要借助burp进行抓包，进行Fuzz绕过。

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57f5be9fabde385b.png)

这时我们发送到intruder进行爆破，这里我补充一些知识，如何进行设置参数爆破， 我们可以对空格进行转义，空格有很多的编码表现形式，（’ '==%20）

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/927b6b39e497d665.png)

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4e19215e01ab835.png)

像我们黑盒测试绕过方法中有对空格进行转义的字符，可以利用构造特殊字符进行爆破，这里我们利用/ *xxx* /进行实验。

### 2.利用Fuzz绕过WAF获取数据库信息

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a4043315ea6846ba.png)

http://192.168.222.4/sqli-labs/Less-1/?id=1%27%20and%20%271%27=%271 我们就可以将%20进行转换为/ *a* /，设置参数，设置字符a1!%(/)，和payload

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df0d46373cfc1336.png)

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4251a2f468eb8472.png)

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0d6e49f0897b75e2.png)

设置线程为20

进行攻击

这里返回不一样的数据包，再查看一下图片，看一下render

![在这里插入图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c320ec4f6ab5a31b.png)

发现返回了用户信息，绕过成功。 这里同样可以通过查询语句注入，在进行burp爆破就可以了，找不同的数据包就可以成功绕过，查看数据库信息了。

## 总结

Fuzz 绕 WAF 说白了，就是把"人肉猜混淆"变成"批量试混淆"：WAF 拦的是规则库里已有的写法，而空格、注释符、URL 编码这些元素排列组合起来近乎无限，让 Burp 按字典把组合跑一遍，哪个返回包长度、内容不一样，能过的混淆方式自己就浮出来了。

落到操作上就四步：先确认注入点，再抓包看 WAF 到底拦在哪个字符（这篇里是空格），然后针对被拦点构造变形字典（/ *a* /、%20、/\*\*/ 混着来），最后 Intruder 批量跑、按返回差异筛选，用能过的姿势去包装完整的注入语句。字典质量决定上限——平时实战里撞到的新变形随手记进字典，攒得越多越能打。

反过来看防守侧：规则库挡得住已知姿势，挡不住变形组合，真正的根子还是参数化查询把注入堵死，WAF 只当第二道保险；再定期把拦截日志里的攻击样本反哺进规则库，让"批量试"的字典失效速度跟上攻击者的更新速度，才算闭环。

渗透测试 · 目录

作者提示: 个人观点，仅供参考
