---
title: 【微信】给网站套上 Cloudflare，反而送了我一把更顺手的刀
source: https://mp.weixin.qq.com/s/nNSpuOLKSFobYW83-0k2sQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T08:08:00+08:00
trace_id: b5105381-fd45-4be1-9c7e-769019ac15b4
content_hash: 8b12979e2e2562366493fab14a8e6266b78cfa221c8ec6ff36709f8d672849f5
status: synced
tags:
  - 微信
  - 漏洞分析
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Cloudflare 的邮件地址混淆功能在重写 `<a>` 标签时会把正斜杠替换成空格，攻击者借此把刻意写残的 payload 在服务端"补全"为合法 XSS，一次绕过其 WAF、Chrome/Safari/Edge 过滤器和 NoScript。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f475244-d011-8186-8cd1-c34abfb78212
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Cloudflare 的邮件地址混淆功能在重写 `<a>` 标签时会把正斜杠替换成空格，攻击者借此把刻意写残的 payload 在服务端"补全"为合法 XSS，一次绕过其 WAF、Chrome/Safari/Edge 过滤器和 NoScript。
> 
> - **功能机制：** 邮件混淆会扫描响应里的邮箱与 mailto 链接，替换成 `/cdn-cgi/l/email-protection` 形式的 `data-cfemail` 密文锚点，并附带解码脚本，以此反爬。
> - **核心思路：** XSS 过滤器靠"既可疑又语法合法"的特征报警，而服务端重写恰好能把"看起来不像攻击、语法残缺"的输入补成可用载荷。
> - **斜杠怪癖利用：** 提交 `onmouseover/="alert(1)"`，斜杠被吃成空格后变为合法的 `onmouseover="alert(1)"`，可过 Chrome、Safari、Edge；再塞一个斜杠写成 `alert/(1)`，输出为 `alert (1)`，打散特征串从而绕过 NoScript 与 Cloudflare WAF。
> - **通用变体：** Gareth Heyes 设计的畸形语法载荷 `y='a@b'//a@b%0a\u0061lert(1)` 不依赖斜杠怪癖，通过迷惑云端 HTML 解析器生效，且明显更难修复。
> - **边界与缓解：** 攻击成立前提是目标站点本身存在未修复 XSS；该缺陷公开后 24 小时内即被修复；建议关闭不使用的功能，缩小攻击面优于叠加脆弱缓解措施。

**升斗安全** *2026年10月9日 07:55*

**【文章说明】**

-   **目的**：本文内容仅为网络安全 **技术研究与教育** 目的而创作。
    
-   **红线**：严禁将本文知识用于任何 **未授权** 的非法活动。使用者必须遵守《网络安全法》等相关法律。
    
-   **责任**：任何对本文技术的滥用所引发的 **后果自负**，与本公众号及作者无关。
    
-   **免责**：内容仅供参考，作者不对其准确性、完整性作任何担保。
    

**阅读即代表您同意以上条款。**

写给赏金猎人和刚入坑安全的朋友。行业里都在吹"纵深防御"——多叠几层安全措施总没错吧？这篇用真刀真枪的绕过打脸：给网站套上 Cloudflare 之后，它自带的"邮件地址混淆"功能，反而能当跳板，一口气绕过 Cloudflare 自己的 WAF、Chrome/Safari/Edge 的 XSS 过滤器，连 NoScript 都挡不住。文章从一层简单的反射型 XSS 讲起，一步步拆这条利用链，以及它背后那个更扎心的道理。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4682864f5361e409.png)

* * *

## "多加一层总没错"——真的是这样吗

PCI DSS 这类行业标准，外加 OWASP Top 10，这几年把"纵深防御"捧成了政治正确：能叠的安全层尽量叠，越多越安全。

我不这么看。至少，不加区分地照着念这条口号，是又错又危险的。今天我想论证一件反直觉的事：在系统前面多叠一层安全措施，有时候不是加固，而是给攻击者递了把更顺手的刀。

怎么证明？我用 Cloudflare 的"电子邮件保护"功能，在所有挂着 Cloudflare 的网站上，同时绕过了它的 WAF、绕过了所有主流浏览器的 XSS 过滤器。一个已经存在的反射型 XSS，原本在现代浏览器里很难打，套上 Cloudflare 之后反而一打一个准。

## 先看看"原版"漏洞有多乖

假设有个网站，存在一个再简单不过的反射型 XSS：

```
https://xxx.net/xss.php?xss=alert(1) 
```

在原生 Firefox里，这玩意儿闭眼就能弹。但换成 Chrome、Edge/IE、Safari，或者装了 NoScript 的 Firefox，浏览器自带的 XSS 过滤器会把它摁住——利用起来相当费劲。

上面那个链接就是个现成的演示站，有兴趣自己开不同浏览器比对一下。

## 老板一拍脑袋：上 Cloudflare

假设这个站长被 PCI 合规压力逼得没办法，决定接 Cloudflare。好消息是他白捡了一堆安全功能：DDoS 防护、WAF、邮件地址混淆。坏消息是——这些全都是默认开着的。

问题就出在最后那个看起来人畜无害的"邮件地址混淆"上。

## 邮件混淆到底干了啥

这个功能的工作原理：扫描响应里的邮箱地址和 mailto 链接，把它们重写一遍，对爬虫藏起来。看下面两组响应的差别就懂了：

```sql
start not-an-email end
start not-an-email end
start james.kettle@portswigger.net end
start <a href=”/cdn-cgi/l/email-protection” class=”__cf_email__” data-cfemail=”...long hex...”>[email&#160;protected]</a> end
…（页面底部还有一段负责解码的 ）…  
```

普通文本原样返回；一旦是邮箱，就被替换成一串 data-cfemail 的密文加解码脚本。访问者看到的正常邮箱，爬虫扒到的只是一坨乱码。思路没问题，对反爬确实有用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/efa30c7b58f41302.png)

## 关键洞察：服务端重写，天生是过滤器的天敌

这里有个所有做绕过的人都应该记牢的套路：服务端会改写你的输入和响应，而 XSS 过滤器依赖"既可疑、又合法"的语法才能报警。

换句话说，过滤器是在"看起来像攻击"上做文章。那攻击者只要递过去一段"看起来不像攻击、甚至语法还残缺"的东西，然后让服务器自己把它补成能用的攻击载荷，就赢了。

Cloudflare 的邮件混淆，刚好有个小怪癖，把这件事变得格外轻松。

## 那个要命的斜杠怪癖

在重写 标签的时候，Cloudflare 会把正斜杠/变成空格。看这个例子：

```xml
你发过去：  <a href=”mailto:b” a/b/c>hover</a>
它返回：    <a href=”/cdn-cgi/l/email-protection#4c2e” a b c>hover</a>  
```

a/b/c 里的斜杠没了，成了 a b c。注意，这个转换是"免费"发生在响应里的。

那我们就能在 payload 里塞一个位置恰到好处的斜杠，让它"看起来"像个无害的锚点属性，等 Cloudflare 一重写，斜杠变空格，攻击语法就成型了：

```xml
你发过去：  <a href=”mailto:a” onmouseover/=”alert(1)”>hover</a>
它返回：    <a href=”/cdn-cgi/l/email-protection#5372” onmouseover =”alert(1)”>hover</a> 
```

看到了吗？onmouseover/= 里的那个 / 被吃成空格，原地变成合法的 onmouseover="alert(1)"。这一个 payload，已经能绕过 Chrome、Safari 和 Edge 的过滤器。

但 NoScript 和 Cloudflare 自己的 WAF 还没倒。小事一桩——再塞一个斜杠：

```xml
你发过去：  <a href=”mailto:a” onmouseover/=”alert/(1)”>hover</a>
它返回：    <a href=”/cdn-cgi/l/email-protection#d0f1” onmouseover =”alert (1)”>hover</a>  
```

第二个斜杠落到了 alert(1) 里面，变成 alert (1)——多了个空格。对人类和 JS 引擎来说这照样能执行（alert (1) 完全合法），但对盯着 alert( 这种特征串的 WAF 和 NoScript 来说，特征被打散了。

到这儿，Chrome / Safari / Edge / IE / NoScript / Cloudflare WAF 的 XSS 检测，全家桶，全绕过。

## 有人会说：这不就是 Cloudflare 一个一次性失误？

我也觉得，如果文章停在这儿，读者很容易把它当成"哦，Cloudflare 手滑了一次"，然后翻篇——觉得别的厂商的产品没事。

为了堵这个嘴，我同事 Gareth Heyes 设计了一个不依赖斜杠怪癖的 payload。它走的是另一条路：用畸形的语法去迷惑"云端的 HTML 解析器"。这种思路大概率对多家厂商都有效，而且明显更难修。

原版 payload 长这样：

```ini
y='a@b'//a@b%0a\u0061lert(1)
```

被 Cloudflare 重写之后丑了点，但照样能打——那几个 a@b 被当成邮箱，统统塞进了 email-protection 的密文锚点里，把云端解析器绕晕：

```html
[email&#160;protected]</a>'a>y='<a href=”/cdn-cgi/l/email-protection” class=”__cf_email__” data-cfemail=”...”>[email&#160;protected]</a>'//<a href=”/cdn-cgi/l/email-protection” class=”__cf_email__” data-cfemail=”...”>[email&#160;protected]</a>\u0061lert(1) 
```

注意里面那串 \\u0061lert(1)——unicode 转义的 alert，连特征串都藏了一手。

## 真正的结论：加一层，可能拆三层

加一种安全机制，结果削弱了另外好几种——这不是孤例。

一些研究者后来还发现，Cloudflare 会在 /cdn-cgi/ 路径下往页面注入好几个脚本，其中有一个脚本不仅能绕过 Chrome 的 XSS 过滤器，连基于白名单的 CSP都能一并绕过。也就是说，本来用来"兜底防护"的注入脚本，自己成了突破口的组成部分。

写到这里，得赶紧补一句，免得吓到人：你要是正在用 Cloudflare，没必要连夜跑路。我拿它举例纯粹是因为它够流行、样本够多。上面这些攻击都成立的前提，是目标网站本来就有个没修的 XSS 漏洞；而这里说的混淆缺陷，大概率是短命的——Masato 那个漏洞在公开后 24 小时内就被修了。而且你随时可以在不丢核心防护的前提下，把邮件混淆这个功能关掉。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3ac40b643c0b48e3.png)

所以真正该带走的，不是"Cloudflare 是垃圾"，而是三句话：

1.  盲目上新功能之前，先想清楚后果。 花哨的缓解措施叠上去，可能顺手废掉了你原来的防线。
    
2.  没在用的功能，关掉。 攻击面少一寸，比堆十个脆弱的缓解器强。
    
3.  缩小攻击面，永远比堆缓解措施更值钱。
    

* * *

一层防护变成一层突破口——这种反直觉的坑，恰恰是赏金猎人最该盯的地方。如果这篇让你对"纵深防御"多了个心眼，点个赞告诉我没白写。点关注，后面继续拆这种"官方说安全、实测能打穿"的实战案例。顺手转发给那个正打算给业务无脑叠 WAF 的兄弟——省他踩坑。觉得有用就推荐给刚学 XSS 绕过的朋友，过滤器不是终点，解析器的盲区才是金矿。
