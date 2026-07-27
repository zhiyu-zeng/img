---
title: 【微信】Claude AI共享聊天记录被指出现在谷歌搜索结果中
source: https://mp.weixin.qq.com/s/iG5C8egDZVADbUycqmEG3Q
source_host: mp.weixin.qq.com
clip_date: 2026-07-27T15:12:27+08:00
trace_id: 8d7cf4e4-6cfc-4334-b4b5-04270c893ed2
content_hash: 744eb04edf3739cf5ae343119de443cb475991ba51f7d0f9264cb31183fc6cde
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3aa75244-d011-81de-8b10-fa44da003a05
ioc: null
---

**代码卫士** *2026年7月27日 14:56*

聚焦源代码安全，网罗国内外最新资讯！

**编译：代码卫士**

**Anthropic的Claude共享链接出现在公开搜索结果中，引发用户对共享敏感对话的新一轮隐私担忧。**

上周末，一则Reddit帖子显示，数百个Claude AI共享聊天可通过谷歌公开发现。用户搜索诸如“site:claude.ai/share”等查询时，能够访问包含法律建议、工程工作及个人讨论的对话内容，而无需来自原始所有者的直接链接。

Claude的共享功能会生成公开URL，以便用户将对话发送给他人。根据Reddit讨论可知，这些页面缺少适当的noindex标签。一旦链接通过论坛、社交媒体或意外帖子在网上传播，搜索引擎便能够抓取并索引完整的聊天内容。

据称，已暴露的聊天包括：

-   律师的法律策略讨论
    
-   工程师的技术故障排除与代码
    
-   个人及敏感的用户对话
    

这一情况与此前ChatGPT共享链接的事件如出一辙，当时公开索引同样将私人交流变成了可搜索的页面。截至上周日，谷歌针对受影响Claude共享页面的搜索结果已基本消失。这可能表明在问题引起关注后，谷歌迅速取消了索引，或者Anthropic进行了后端修复。截至报道时，该公司尚未发布公开声明。

安全研究人员和注重隐私的用户指出，从搜索结果中移除并不自动意味着旧链接已失效。任何此前保存或收藏了共享URL的人仍可能可以打开它，除非Anthropic在服务端撤销了访问权限。共享的AI聊天通常包含的远不止随意提问。专业人士使用Claude等工具起草合同、调试专有代码、分析商业数据以及讨论个人事务。当这些页面变为可抓取时，风险不仅限于尴尬，还可能涉及数据泄露、知识产权暴露和合规问题。

强烈建议Anthropic用户：

-   在Claude设置中审查所有活跃的共享对话
    
-   删除不再需要的任何共享
    
-   避免在公共渠道发布共享链接
    
-   默认将共享的AI聊天视为可能公开
    

除非各平台持续应用noindex、身份验证门禁或过期链接，否则共享对话应像发布到开放网页的文档一样谨慎对待。该事件再次印证了AI产品设计中的反复出现的教训：方便内容分享的功能同样可能使内容易于暴露，除非隐私控制同步跟上。

开源卫士试用地址：https://oss.qianxin.com/

代码卫士试用地址：https://sast.qianxin.com/

* * *

**推荐阅读**

[Claude Cowork 漏洞可导致虚拟机逃逸，访问Mac 文件](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247526724&idx=2&sn=0a25dcdaee8bc34e615e2810c85393ef&scene=21#wechat_redirect)

[最新软件供应链事件概览：Red Hat npm 包遭劫持；投毒 Claude Code；OpenAI Codex 认证令牌被盗](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247526178&idx=1&sn=17c22b5b9c9011ac7e14bc24b3c1e6ee&scene=21#wechat_redirect)

[简单的自定义字体渲染即可投毒 ChatGPT、Claude、Gemini 等 AI 系统](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247525496&idx=1&sn=6253a0da55749336eda176e1d005d061&scene=21#wechat_redirect)

**原文链接**

https://cybersecuritynews.com/claude-ai-shared-chats/

题图：Pixabay License

**本文由奇安信编译，不代表奇安信观点。转载请注明“转自奇安信代码卫士 https://codesafe.qianxin.com”。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/878750e44b5287d5.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/054b399b906220a0.jpg)

**奇安信代码卫士 (codesafe)**

国内首个专注于软件开发安全的产品线。

觉得不错，就点个 “在看” 或 "赞” 吧~

开源 · 目录
