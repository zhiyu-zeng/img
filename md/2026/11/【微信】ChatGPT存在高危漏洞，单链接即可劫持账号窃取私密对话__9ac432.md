---
title: 【微信】ChatGPT存在高危漏洞，单链接即可劫持账号窃取私密对话
source: https://mp.weixin.qq.com/s/5ZKk1eFv8WMbfVQmqFjqkA
source_host: mp.weixin.qq.com
clip_date: 2026-11-03T19:00:43+08:00
trace_id: 5c77743d-078b-4dd3-89f9-c67876780390
content_hash: ae3f7143e0ce7a447da32f41878a812a34b764f6b9b9b6064f0a5e29297191b7
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40d75244-d011-81e2-9390-cb214cf82818
ioc: null
---

**FreeBuf** *2026年11月3日 18:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b85c2c37c5bdd79.png)

该漏洞为严重级别，攻击者可构造恶意共享对话，在其他用户的已登录会话中运行自身控制的JavaScript。攻击可以枚举用户的私密聊天列表，读取从未向攻击者共享过的对话内容，还能将窃取的数据发送到外部服务器。在最终的验证演示中，用户只要打开一个构造好的链接就会中招。

据Mukul Goyal 10月28日发布的Parameter技术披露内容，OpenAI已于2026年10月26日修复该问题。OpenAI将这份漏洞报告定级为P1，向报告方发放了5000美元的漏洞赏金。此次验证的攻击通过受害者的活跃浏览器会话获取账号访问权限，无需窃取用户密码。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1af60378dbf239ec.png)

Part01

MathLive消息校验缺陷

导致沙箱逃逸

该漏洞的利用方式结合了交互式图表与ChatGPT的HTML预览功能。正常情况下，预览功能会在独立域名的受限框架中运行代码，阻止代码直接读取ChatGPT主页面内容，这一隔离边界最初可按设计生效。

但加载的交互式图表会引入MathLive数学库，该库为实现虚拟键盘功能，会在主页面添加消息监听器。处于隔离状态的预览框架可通过浏览器的postMessage接口，向这个监听器发送指令。MathLive接收键盘配置变更消息时，既没有严格校验发送方的来源，也没有验证来源窗口是否在许可范围内。

攻击者首先发送一条消息，传入包含自身控制HTML的键盘布局，再发送第二条消息唤起虚拟键盘，通过innerHTML将恶意HTML插入真实的ChatGPT页面。名为createHTML的处理函数在传递内容时，没有移除其中的不安全标记。

这与此前披露的可泄露Gmail数据的ChatGPT沙箱漏洞存在明显区别。此前的漏洞利用了共享内部存储实现逃逸，而本次漏洞是通过受信任页面组件信任的消息机制，跨浏览器隔离边界实现沙箱逃逸。

  
![利用链示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7addce0e265795f2.png)

Part02

组合iframe与JSONP

实现主站代码执行

单纯的HTML注入无法直接执行JavaScript。研究人员通过srcdoc属性插入iframe，这种方式会将嵌入页面的HTML直接存储在标签属性中。由于这个新框架没有设置沙箱限制，会继承ChatGPT的站点源权限，可以直接访问父页面内容。

ChatGPT的内容安全策略（CSP）会阻止内联脚本运行，但允许加载来自YouTube的脚本。研究人员发现，即使返回无效回调提示，YouTube的oEmbed端点仍会将攻击者提供的JSONP回调作为JavaScript返回。加载该响应后，攻击者就能获得chatgpt.com源的代码执行权限，完成利用链的最后一步。

研究人员将恶意图表和HTML预览内容嵌入公开对话中。早期版本的利用链需要用户点击预览按钮才能触发，最终版本可以自动打开预览。研究人员在独立测试账号中三次复现该攻击，页面加载约4.5秒后就会触发代码执行。

Part03

攻击可窃取私密对话

该攻击载荷可以读取ChatGPT前端有权限访问的所有会话详情，调用经过身份认证的对话API，获取与共享链接无关的私密对话内容，再通过构造图片请求，将筛选后的少量数据发送到研究人员的服务器。

这与此前单独披露的ChatGPT GitHub连接器漏洞不同，本次攻击不依赖仓库指令或已连接的第三方工具，所有访问权限都来自在受信任站点上下文内运行的JavaScript。

Parameter于10月18日提交该漏洞报告。OpenAI成功复现问题后，于10月21日提升了漏洞处理优先级。到10月26日，两个受影响的Web前端版本均已拦截漏洞涉及的恶意MathLive消息。这一案例也说明，跨框架消息接收方必须同时校验发送方来源和来源窗口，不可信HTML在整个渲染流程中都必须保持沙箱隔离。

参考来源：

Critical ChatGPT Flaw Allowed Attackers to Hijack Accounts and Steal Private Conversations With One Link

https://cybersecuritynews.com/chatgpt-flaw-exploited-with-one-link/
