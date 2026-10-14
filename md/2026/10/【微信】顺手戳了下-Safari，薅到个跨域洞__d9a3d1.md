---
title: 【微信】顺手戳了下 Safari，薅到个跨域洞
source: https://mp.weixin.qq.com/s/FpU67g59AyW57LXkNQiUhA
source_host: mp.weixin.qq.com
clip_date: 2026-10-14T08:18:52+08:00
trace_id: 25a25829-1022-42e2-b7e1-303e03827121
content_hash: 3b5222e590cba3dddf29e0f9820029cc77ee2da57becad343b75b5c5ec987d7a
status: synced
tags:
  - 微信
  - 安全工具
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: PortSwigger 为 Hackability 配套造了跨引擎 JS 对象检查器 Hackability Inspector，作者用它测 Safari 时顺手发现异常信息泄露跨域源（origin）的漏洞。
ai_summary_style: key-points:weak
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f975244-d011-81d1-9087-e393987e4a50
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> PortSwigger 为 Hackability 配套造了跨引擎 JS 对象检查器 Hackability Inspector，作者用它测 Safari 时顺手发现异常信息泄露跨域源（origin）的漏洞。
> 
> - **工具动因：** Hackability 不依赖 Chrome 渲染页面，导致 Chrome DevTools 失效，因此需要一套与渲染引擎无关的对象审查工具。
> - **检查能力：** 枚举任意对象的属性（ES5/ES6 特性 + 暴力枚举），并按"可疑/有趣程度"排序内置 window 属性清单；同时做安全检查——构造函数是否泄露跨域对象、能否向跨域对象写属性、异常是否吐出跨域源、是否为 Java 桥接、getOwnPropertyDescriptor 的可配置/可枚举/可写状态。
> - **使用方式：** 三栏界面（属性名/值/附加信息），支持 regex 过滤属性名、对每个属性执行 JS（`obj`、`prop` 为占位符）、按类型（window、跨域 window、DOM 节点、Java 桥接等）过滤；控制台支持方向键历史、Control+Backspace 等快捷键。
> - **无交互目标：** 所有功能可通过查询参数注入——`input=`、`regex=`、`js=`、`type=`、`blind=1`；盲测模式会把渲染结果存档以供事后分析。
> - **Safari 漏洞：** 触碰跨域对象属性时抛出的异常中含该 frame 的 origin，可被正则提取；进一步通过读取 `contentWindow.length` 可批量读出窗口内每个 iframe 的源。X-Frame-Options 无法防护，改用弹窗（popup）同样可读。
> - **审计启示：** 冷门渲染引擎常保留厂商已修的老问题；try/catch 中的异常对象是常被忽略的泄露面。

**升斗安全** *2026年10月14日 07:55*

**【文章说明】**

-   **目的**：本文内容仅为网络安全 **技术研究与教育** 目的而创作。
    
-   **红线**：严禁将本文知识用于任何 **未授权** 的非法活动。使用者必须遵守《网络安全法》等相关法律。
    
-   **责任**：任何对本文技术的滥用所引发的 **后果自负**，与本公众号及作者无关。
    
-   **免责**：内容仅供参考，作者不对其准确性、完整性作任何担保。
    

**阅读即代表您同意以上条款。**

几个月前 PortSwigger 放出一个叫 Hackability 的工具，专门用来"蹂躏"那些冷门、未知渲染引擎。但它只能在没 Chrome 的环境里渲染页面，常规的 DevTools 根本看不了里面的 JS 对象。于是他们又造了个配套的检查器，不管什么引擎都能把对象扒个底朝天。这篇文章讲清楚这玩意儿怎么用，以及作者拿它测 Safari 时，顺手捡到一个把跨域源"写进报错里"的漏洞。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8273b0aa63a93462.png)

* * *

## 为什么还要再造一个 DevTools

几个月前我们发了Hackability——一套测试套件，让研究人员能用各种手法去戳那些"从没见过的渲染引擎"。它顺带还会挖出一堆有意思的 JavaScript 对象。

问题来了：Hackability 渲染页面时不依赖 Chrome，可你平时查对象靠的是 Chrome 开发者工具。没有 Chrome，DevTools 就瞎了。所以我们需要一个全新的、专注安全的工具——不管底下跑的是啥渲染引擎，都能把 JS 对象揪出来审一遍。Hackability Inspector 就是为这个生的。

## 检查器到底能干什么

开箱即用，它会枚举你给它的任意对象，靠 ES5/ES6 特性加暴力破解，把属性能翻的都翻出来。它还内置了一份"已知 window 属性清单"，按"有多可疑/多好玩"给属性排个序，帮你判断这个属性到底是渲染引擎自带的，还是用户自己塞进去的对象。

枚举的时候，它会顺手做几项安全检查：

-   这个属性的构造函数会不会泄露跨域对象？（这种通常直接等于同源策略绕过）
    
-   你能不能往跨域对象上写属性？
    
-   异常信息里有没有把跨域源给抖出来？
    
-   它是不是个 Java 桥接？
    
-   调 `getOwnPropertyDescriptor` 看看这个属性可配置 / 可枚举 / 可写不。
    

## 怎么用：三栏 + 三个过滤框

在输入框里敲你想查的对象，回车就行。界面是三栏布局：左边属性名、中间值、右边类型等附加信息。对象下面挂着属性列表，点箭头能继续往里钻。

三个趁手的过滤/操作框：

-   regex 框：用正则筛属性名；
    
-   js 框：对每个属性跑一段 JS，这里 `obj` 指代当前对象、 `prop` 指代属性名。比如想挨个调用对象上的函数，就写 `obj[prop]("My argument")` ；
    
-   类型选择菜单：除了常规 JS 类型，还能按 `window` 、跨域 `window` 、DOM 节点、Java 桥接这类来筛。
    

控制台手感和 Chrome DevTools 差不多：上下方向键翻历史命令；Control+Backspace 清控制台，Control+Shift+Backspace 清历史。它还认 HTML——Control+Enter 只执行不检查（多行模式好用），命令以 < 开头会被当成 HTML 输入。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8582559f1d94ca01.png)

## 遇上"不让你交互"的客户端怎么办

有些客户端压根不给你输入框。没关系，所有功能都能塞进查询字符串：

-   `input=`
    
    想发进控制台的内容
    
-   `regex=`
    
    正则过滤
    
-   `js=`
    
    对每个属性执行的代码
    
-   `type=`
    
    按类型过滤
    
-   `blind=1`
    
    盲测模式
    

盲测专为"渲染引擎不回显结果"的场景准备：它把渲染出的 HTML 存下来，你回头慢慢看。对付那些你完全看不到枚举输出的目标，先发个 blind=1 存份副本再说——虽然这份副本不能交互，但你可以连发多个请求反推对象结构。

> 官方放了在线演示，但正经玩法还是 fork 一份自己托管。

## 顺手捡的漏：Safari 把跨域源写进了报错

拿检查器去测 Safari 的 proto bug 时，作者撞上一个全新的跨域问题。

Safari 有个毛病：当你去碰一个跨域对象的属性，它会抛个异常，而异常里直接带着那个 frame 的源（origin）。换句话说，不同域上任何 iframe、任何跨域 window 的位置，都能被你读出来。

代码就这么几行：

```javascript
var win = document.getElementById('iframe').contentWindow, regex;
try {
   win.location.x;          // 随便碰一下跨域属性
} catch(e){
   regex = /accessing a frame with origin ”(.+?)”/.exec(e);
  if(regex) {
     alert('frame is pointing to:' + regex[1]);
  }
}  
```

win 是 iframe 的跨域 contentWindow 引用，碰一下 x 就抛错，报错里含着 iframe 的源。更损的是：你读 contentWindow 的 length，就能把那个 window 上每一个 iframe 的源挨个读出来。作者的 PoC 里，subdomain1 挂着指向 subdomain2 和 burpcollaborator.net 的 iframe，用这招全读到了。

有人会想：上 X-Frame-Options 不就防住了？挡不住——因为不一定要用 iframe，换成弹出窗口（popup）照样读，作者也给了对应 PoC。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bb2c55ffd20caf33.png)

## 给猎人的两点收尾

1.  冷门渲染引擎是金矿。 厂商的 DevTools、文档都按 Chrome 那套来，换个小众引擎，属性泄露、跨域越权这类"老毛病"又活过来了。Hackability 这套"枚举 + 跨域检测"的思路，值得搬进你自己的武器库。
    
2.  报错信息是最容易被忽略的泄露面。 Safari 这洞本质就是"异常里塞了源"。审计任何客户端/引擎时，把 try/catch 里的 `e` 打印出来看看，经常有惊喜。
    

* * *

一个跨引擎查对象的小工具，顺手在 Safari 上薅了个跨域源泄露——这种"工具顺手、漏洞凑巧"的故事，正是猎人最爱的地方。觉得有用点个赞；点关注，后面继续拆这类"趁手工具 + 顺手捡漏"的实战。顺手转发给那个还在用 Chrome DevTools 硬刚小众引擎的朋友；也欢迎推荐给刚学客户端审计的新人——别只会看控制台，报错里也藏着洞。
