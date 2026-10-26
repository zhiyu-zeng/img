---
title: 【微信】赏金猎人私藏，多层编码破WAF盾
source: https://mp.weixin.qq.com/s/qEf04nskxmwuhT6doLC0Ng
source_host: mp.weixin.qq.com
clip_date: 2026-10-26T23:44:39+08:00
trace_id: a3da66b8-4e95-4d8f-9d95-ffaf8cfe3001
content_hash: af0dd6c6690f632b82242030ff385b6d2b1901c9764bc21262ba8cd56e0aee2f
status: synced
tags:
  - 微信
  - 安全工具
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：Burp 扩展 Hackvertor 用嵌套"标签"实现多层编码与 Repeater 请求自动改写，可借助 throw_eval 绕过 Cloudflare WAF，还内置频率分析破解 rotN 与重复 XOR 的隐藏功能。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40575244-d011-81ab-a21d-f308618962fa
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - wafproxy.net
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Burp 扩展 Hackvertor 用嵌套"标签"实现多层编码与 Repeater 请求自动改写，可借助 throw_eval 绕过 Cloudflare WAF，还内置频率分析破解 rotN 与重复 XOR 的隐藏功能。
> 
> - **核心机制：** 标签可任意嵌套（如 base64 包 hex，hex 标签可带分隔符参数），外层标签处理内层输出；标签还能直接嵌入 Repeater/Intruder 请求，发送前自动执行转换，Proxy 中亦可勾选开启。
> - **WAF 绕过实战：** 对 `<img/src/onerror=alert(1)>` 中的 alert(1) 加 `throw_eval` 标签，发送后被改写为 `window.onerror=eval;throw'=alert\x281\x29'`，括号被 \x28/\x29 转义，使规则类 WAF 的正则特征匹配失效。
> - **验证细节：** 应使用右键 Hackvertor → Copy URL 复制标签转换后的真实 URL，Burp 自带复制会保留标签原样；小工具界面支持多标签页并行实例，便于多目标审计。
> - **隐藏功能一：** 用英文四字母组频率评分自动破解 rotN 旋转密码——灵感来自女儿询问 T 恤上的二进制图案。
> - **隐藏功能二：** 用重合指数自动爆破密钥长度，求解重复密钥 XOR 加密文本。

**升斗安全** *2026年10月26日 23:11*

**【文章说明】**

-   **目的**：本文内容仅为网络安全 **技术研究与教育** 目的而创作。
    
-   **红线**：严禁将本文知识用于任何 **未授权** 的非法活动。使用者必须遵守《网络安全法》等相关法律。
    
-   **责任**：任何对本文技术的滥用所引发的 **后果自负**，与本公众号及作者无关。
    
-   **免责**：内容仅供参考，作者不对其准确性、完整性作任何担保。
    

**阅读即代表您同意以上条款。**

> 【内容描述】  
> 本文介绍 Burp Suite 扩展 Hackvertor。它用"标签"做转换，比 Burp 自带解码器强得多——可以多层嵌套编码、在 Repeater 里实时改写请求、用 `throw_eval` 标签绕过 Cloudflare WAF。文章还讲了两个"彩蛋级"功能：用四字母组频率评分自动解 rotN（起因是女儿问 T 恤上的二进制是啥），以及用重合指数自动爆破密钥长度、解重复 XOR 加密。面向赏金猎人和安全爱好者，重技术、轻说教。

* * *

你大概率没听过这个小工具——Hackvertor。

它是个 Burp Suite 扩展，核心思路就一句话：用标签做转换。听着平平无奇？但你用过就回不去了。Burp 自带的 Decoder 只能一层层手动点，Hackvertor 直接把转换写成"标签嵌套"，想套几层套几层，发送前自动算好。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8fbb963f4c32d26e.png)

这篇不是官方文档，是我边用边写的"实战笔记"。看完你应该能上手，顺便还能懂点编码学和密码学频率分析——别怕，我尽量讲人话。

## 一、标签到底是个啥

Hackvertor 背后的理念很简单：每个标签先把自己的内容转换一遍，再把结果喂给外层的下一个标签。层层套娃，就能轻松实现多层编码。

比如要把字符串编码成 base64，就套个 base64 标签：

```bash
<@base64_0>test<@/base64_0>
```

想玩花的？先把 "test" 转成十六进制、再整体 base64。那就 hex 包 base64：

```bash
<@base64_1><@hex_0(” ”)>test<@/hex_0><@/base64_1>
```

注意 hex 标签后面跟了个参数 " "，这是分隔符——它会把每个十六进制串用空格隔开，再传给外层。这种"标签里还能带参"的设计，后面绕过 WAF 时特别好使。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/adbfa884875ed95d.png)

## 二、日常怎么用

装好扩展，Burp 里会多出一个叫Hackvertor的标签页。左边输入框、右边输出框，你把要转的文本选中，点一下对应标签，转换结果就出来了。怕手滑没跑？它还有个专门的"转换"按钮可以重跑。

标签按 Encode（编码）、Decode（解码）之类分了类，找起来不费劲。它甚至做了类似 Repeater 的多标签页，等于能同时开好几个独立实例各转各的——审计多个目标时不用反复清空输入框，懂的都懂。

## 三、正经活：用标签绕过 Cloudflare WAF

光转码不够劲，我后来让 Hackvertor 的标签能直接用在 Repeater、Intruder 的真实请求里。用法是：在 Repeater 里右键 → Hackvertor 菜单 → 给选中的文本加标签，请求真正发出去之前，标签会自动执行转换。

代理里也能用，不过默认关着。想开的话去 Burp 主菜单的 Hackvertor → "Allow tags in Proxy" 勾上就行。

上实战。把下面这个 URL 发到 Repeater：

```javascript
hxxps://wafproxy.net/xss/xss.php?x=
```

在等号后面敲入这段 XSS：

```apache
<img/src/onerror=alert(1)>
```

然后选中其中的 alert(1)，右键 → Hackvertor → XSS → throw_eval。它会给选中内容裹上标签。点 Go 发送，响应里你看到的是：

```javascript
<img/src/onerror=window.onerror=eval;throw'=alert\x281\x29'>
```

看见没？原本直白的 alert(1) 被改写成 window.onerror=eval;throw'...' 的形式，括号也被 \\x28\\x29 转义。这种变形经常能绕过规则类 WAF 的特征匹配——Cloudflare 那套正则看到的不复是它认识的 alert(1) 了。

想验证自己发的到底是不是这串？在请求编辑器里右键 → Hackvertor → Copy URL，它会把"标签转完之后"的真实 URL 复制出来。注意别用 Burp 自带的复制 URL，那个复制的是"还带标签"的版本。

> 小提醒：Intruder 里也能用同一套标签，先 Repeater 定义好再发过去即可。配合占位符做多层编码，批量打的时候相当香。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4a09c29f5f3e5513.png)

* * *

看到这儿的朋友，要是觉得这工具能省你几分钟手工活，或者解码思路给你开了点窍——

👍点个赞，让更多白帽同行看到这篇；

💬关注我，后续还有缓存投毒、WAF 绕过、SSTI 之类的实战连载；

🔁顺手转发给还在手工 Base64 套娃的战友，别让他们再点断手；

📣推荐给做安全的朋友，独乐乐不如众乐乐。

咱们下篇接着扒。保持好奇，保持安全。

（Hackvertor 是开源扩展，搜名字就能装。文中所有案例均已合规披露或仅用于教学演示，请勿用于未授权目标。）
