---
title: SecMap - ReDos - Tr0y's Blog
source: https://www.tr0y.wang/2025/03/19/SecMap-ReDos/
source_host: www.tr0y.wang
clip_date: 2026-09-08T20:59:37+08:00
trace_id: 060eee5b-dcc0-455a-80ea-1d3e8d4d49f5
content_hash: d7637ce2f8ab73c02e94ad2066fe6e983405de9b62c5d4aacafd1d9579ce6b72
status: synced
tags:
  - 漏洞分析
  - ReDoS
series: null
feed_source: tr0y
ai_summary: ReDoS 由正则引擎的回溯机制触发，用较长且无法匹配的字符串即可耗尽 CPU；本文梳理了原理、检测与防御，并复现了 Cloudflare 宕机案例。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3d575244-d011-819c-8649-c2f7cf46235d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ReDoS 由正则引擎的回溯机制触发，用较长且无法匹配的字符串即可耗尽 CPU；本文梳理了原理、检测与防御，并复现了 Cloudflare 宕机案例。
> 
> - **触发原理：** 现代正则引擎多基于 NFA 加回溯机制，匹配是深度优先遍历可能路径，某一路径失败便回退换路；回溯结构越多、越复杂，ReDoS 利用成本越低。DFA 引擎无大量回溯，几乎不会存在 ReDoS。
> - **高危特征：** 核心是 `*`、`+`、`{n,m}` 量词，尤其配合嵌套（如 `(a*)*b`）、重叠分支（如 `(a|aa)*b`）时，耗时可呈指数型增长；非贪婪模式（`a+?`）并不能根除该问题。
> - **检测手段：** 可使用在线 redos-checker 或 Python 工具 regexploit；依据论文，检测原理是在等效 NFA 中查找 EDA（指数度歧义）与 IDA（无限度歧义）结构。
> - **防御分层：** 事前优化正则写法、采用纯 NFA/DFA 引擎或用检测工具审查；事中设置正则匹配超时、限制输入长度；事后记录匹配耗时并对超时告警、监控 CPU 异常消耗。
> - **真实案例：** 2019 年 7 月 2 日 Cloudflare 因 WAF 新规则中的正则核心部分 `.*=.*` 触发多项式级 ReDoS，耗尽 HTTP/HTTPS 服务 CPU，核心代理、CDN、WAF 宕机近半小时；该正则此前虽经内部大量测试但未触发问题。

本文最后更新于：10 个月前

最近在给一个安全产品配置一个正则，有趣的是，回溯历史数据的时候发现，有一些字符串会导致引擎超时，从而触发熔断机制，导致策略失效。经过简单的测试，发现是触发了 redos。

我本来以为我对正则非常熟悉了，不会写出这么挫的正则，但的确发生了。虽然 redos 之前一直知道是怎么个事，还是想借此机会再完整地梳理一下，故有此篇。

ReDoS（Regular Expression Denial of Service） 是一种利用正则表达式设计上的缺陷来耗尽计算资源的攻击形式（即 DoS）。 **这种攻击的目标通常是那些采用了回溯机制的正则引擎**

## 基础知识点回顾

这里稍微回顾一下编译原理的知识点，非常建议看一下这篇文章： [编译原理（一）：词法分析/#词法分析器的实现](https://www.tr0y.wang/2021/04/01/%E7%BC%96%E8%AF%91%E5%8E%9F%E7%90%86%EF%BC%88%E4%B8%80%EF%BC%89%EF%BC%9A%E8%AF%8D%E6%B3%95%E5%88%86%E6%9E%90/#%E8%AF%8D%E6%B3%95%E5%88%86%E6%9E%90%E5%99%A8%E7%9A%84%E5%AE%9E%E7%8E%B0)

-   NFA 中的 FA 就是有限状态自动机，说白了就是给它一个字符串，能匹配到它就回答 yes，否则回答 no
-   DFA：确定状态的有限状态自动机
-   NFA：非确定状态的有限状态自动机
-   通常我们构造词法分析器，常用的路径就是：正则表达式（re） => NFA => DFA => 词法分析器代码
-   从 re 构造 NFA，常用的是 `Thomson` 算法。 **基本方式是递归**。构造完成之后，执行时根据输入字符串执行状态转移，逐步计算每个状态集合是否到达接受状态，不需要回溯
-   现代正则引擎虽然大部分情况下基于 NFA，但 NFA 的匹配过程是逐字符推进的，而大部分正则引擎都会支持更加复杂的匹配能力（比如零宽断言，要求需要在不移动输入指针的情况下进行匹配）。所以现代正则引擎并不是严格意义上的纯 NFA，而是通过各种回溯机制实现了各种扩展功能

对于正则表达式本身的基础知识不再赘述，网上一搜一大把，这里核心是这几个贪婪模式（实际上都是正则的语法糖）：

1.  `c+` ：告诉引擎匹配 c `>=1` 次
2.  `c*` ：告诉引擎匹配 c `>=0` 次
3.  `c{min, max}` ：告诉引擎匹配 c `>=min and <=max` 次；min/max 和逗号可以按需省略

这里对下述内容做个约定：

1.  由于大部分的正则表达式引擎是基于 NFA 之上加上了各种回溯机制实现高级匹配的功能，所以下面内容默认正则引擎是基于 NFA 的。而因为 DFA 是转移是确定的，没有大量回溯，几乎可以认为没有 redos
2.  默认出现的正则都是全匹配，即 `a(b|c)*` 其实是 `^a(b|c)*$`

## 正则的回溯

大部分正则引擎在匹配正则表达式时，会尝试所有可能的路径来寻找匹配结果。当某个路径失败时，引擎会回退到之前的状态来尝试其他路径（即会出现“回溯”），是一个深度优先的遍历算法。

为了验证这一点，我们可以找个在线可视化的正则匹配网站来测试： [regex101](https://regex101.com/debugger) ，这里面有个

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/007d83d0dad3fb92.png)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/a8dceabe-a8fa-490c-878e-7d3bcc3753fa.png!blog#width-zoom6)

例如这个正则 `a(b|c)*` ，当输入 `a` 时：

1.  第 1 步匹配到 `a` ，这个很简单  
    [![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/2c05c227-eda6-4cae-9541-31d292fb6c62.png!blog)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/2c05c227-eda6-4cae-9541-31d292fb6c62.png!blog)
2.  第 2->4 步，可以看到它进入了 `(b|c)*` 这个结构，产生匹配，显然这个是匹配不到的  
    [![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/f1853630-1779-4aba-9d6e-8b597373444d.png!blog)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/f1853630-1779-4aba-9d6e-8b597373444d.png!blog)
3.  第 5 步，虽然 `(b|c)*` 没有匹配到字符，但由于后续也没有其他字符了，所以结束，匹配成功

从调试的步骤可以看出，这个正则是存在回溯的。

## ReDoS 的原理

至此，redos 的原理就显而易见了：由于大部分正则表达式引擎是基于 NFA 的，如果正则中有大量的回溯结构，遇到较长且无法匹配的字符串时，就会触发大量的回溯计算，导致计算资源的占用，进一步导致各种安全问题。

例如这个经典的正则 `(a|aa)*b` ，随着输入字符串的连续 `a` 数量增多，匹配完成的耗时也就越长：

```python
import re
import time

for i in range(1, 1000):
    stime = time.time()
    re.findall("(a|aa)*b", "a"*i)
    print(f"{i} 个 a，耗时: {time.time()-stime}")
PYTHON
```

运行情况：

[![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/9d75d8c9-ed4d-4e41-a290-22637a98df7b.png!blog#width-zoom5)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/9d75d8c9-ed4d-4e41-a290-22637a98df7b.png!blog#width-zoom5)

[![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/dbb5e24d-142f-4464-9ffc-953b38041702.png!blog#width-zoom8)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/dbb5e24d-142f-4464-9ffc-953b38041702.png!blog#width-zoom8)

典型的指数型增长。

不过我觉得只要有这种回溯的结构，理论上只要输入字符串够长就会有 redos，不过利用难度会变高：

[![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/5d12b3eb-bee9-4106-89d1-51222da59388.png!blog#width-zoom8)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/5d12b3eb-bee9-4106-89d1-51222da59388.png!blog#width-zoom8)

所以我们基本上可以认为，回溯结构的多少以及复杂程度，与 redos 的利用成本成反比。

那如果使用非贪婪模式的正则，能不能解决这个问题呢？所谓非贪婪模式，或者懒惰模式，就是在贪婪模式后面加个 `?`，例如 `a+?`。显然这个无法完全解决问题：

[![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/860cc6db-f9b4-44b5-8896-4dc9306bdc47.png!blog#width-zoom8)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/860cc6db-f9b4-44b5-8896-4dc9306bdc47.png!blog#width-zoom8)

可以看到，有 redos 正则的核心特征是 `*、+、{n,m}` 的使用（但使用了这类量词不一定就有 redos），尤其是再配合上嵌套（ `(a*)*b` ）重叠分支（ `a|aa` ）、零宽断言（`?=` ）等语法，会极大增加存在 redos 的可能性。

## 自动化的 redos 分析与构造

那是否有什么办法可以评估一个正则是否存在 redos 的可能性？在确定有 redos 的情况下，有没有可能自动构造出 poc 呢？

这里推荐两个比较好的工具：

1.  在线的 [redos-checker](https://devina.io/redos-checker)
2.  Python 工具 [regexploit](https://github.com/doyensec/regexploit)

至于该如何实现呢？根据论文 [Static detection of DoS vulnerabilities in programs that use regular expressions](https://www.semanticscholar.org/reader/76713d6470002109fb72580f6cd941bba8c6cf24) 可以得出，基于自动机理论的 ReDoS 漏洞检测是在等效的 NFA 中找到 EDA(Exponential Degree Ambiguity) 和 IDA(Infinite Degree Ambiguity) 结构。

出于时间原因，这里暂时不复现了，看论文还是很麻烦的。

## ReDoS 防御方案

其实核心就是如何避免掉大量的回溯

1.  事前
    1.  优化正则写法，能明确的范围就尽量明确写出
    2.  不使用带有高级语法的正则，使用纯 NFA/DFA 的正则引擎进行匹配（放弃高级功能以换取安全性；不过即使是纯 NFA 和DFA 在正则很复杂的时候还是可能存在 redos 的，就是利用成本很高，从工程实践角度我觉得是可以接受的）
    3.  使用 redos 的检查工具来检查正则是否有 redos
2.  事中
    1.  通过设置正则匹配的超时时间来进行防御
    2.  限制正则匹配字段的输入长度（但不算很实用）
3.  事后
    1.  打印正则匹配的时长以及对应的正则，超时则进行告警
    2.  对 CPU 设立监控告警，关注 CPU 异常消耗的资源时间点

## 真实案例 - 2019.7.2 Cloudflare 大规模宕机

[Cloudflare ReDoS 中断](https://blog.cloudflare.com/zh-cn/details-of-the-cloudflare-outage-on-july-2-2019/) ：2019 年 7 月 2 日 Cloudflare 在 WAF 中部署了一项新规则，其中包含的一个正则表达式出现了 redos，耗尽了用于 HTTP/HTTPS 服务的 CPU，导致了 Cloudflare 的核心代理、CDN 和 WAF 等功能宕机近半小时

主要问题出在这个正则：

```
(?:(?:\"|'|\]|\}|\\|\d|(?:nan|infinity|true|false|null|undefined|symbol|math)|\`|\-|\+)+[)]*;?((?:\s|-|~|!|{}|\|\||\+)*.*(?:.*=.*)))
TEXT
```

核心部分是：`?:.*=.*` 。通过工具可知，这个正则的确是有 redos 的

[![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/97f00196-548a-481d-8489-ec71f8bbbc8c.png!blog#width-zoom8)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/97f00196-548a-481d-8489-ec71f8bbbc8c.png!blog#width-zoom8)

经过耗时测试，的确是多项式级的复杂度：

[![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/83bbb5c9-9105-4cc2-8b11-44d8f79d9266.png!blog#width-zoom8)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/83bbb5c9-9105-4cc2-8b11-44d8f79d9266.png!blog#width-zoom8)

有趣的是，Cloudflare 指出，内部对于这个正则其实进行了大量的测试，但都没有触发 redos，所以这个正则就这么被合并上生产了。

另外，cloudflare 的报告中有个蛮酷炫的正则 debug 的动图：

[![](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/555-steps.gif!blog#width-zoom8)](https://rzx1szyykpugqc-1252075454.piccd.myqcloud.com/SecMap-ReDos/555-steps.gif!blog#width-zoom8)

稍微研究了一下发现是 perl 的一个模块支持的： `perl -MRegexp::Debugger -e "'x=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx' =~ /.*.*=.*/"` ，执行之后按 c 就可以进行匹配演示了。需要安装一下 `Regexp::Debugger` 模块： `cpan Regexp::Debugger` 。perl 我也就半吊子水平，这里就不深入研究它的其他用途了。

没想到  
编译原理的知识点还真用上了  
[![](https://clean-1252075454.cos.ap-nanjing.myqcloud.com/20200528120800990.png)](https://clean-1252075454.cos.ap-nanjing.myqcloud.com/20200528120800990.png)
