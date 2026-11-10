---
title: 【微信】React Server Components曝严重漏洞，攻击者无需认证可远程执行代码
source: https://mp.weixin.qq.com/s/sC9sB-yyKqPkgMCevTjMsw
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T09:44:59+08:00
trace_id: 8d092103-9968-45c8-b70d-c9bc6f4cca29
content_hash: 74c694e171692e39cd531af888e86ba442ef25d7ee93e989a67fa4586b615586
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
notion_page_id: 41475244-d011-81b8-92a6-c4057d73c774
ioc:
  cves:
    - CVE-2025-55182
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**FreeBuf** *2026年11月9日 19:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif)

![React Server Components漏洞](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b337e443adb0d3e5.png)  

React Server Components存在一处严重安全漏洞，攻击者无需登录即可远程执行代码。React团队于2026年10月14日发布安全公告，漏洞追踪编号为GHSA-xqc2-xf4c-x3h3，CVSS v4评分达9.5，官方建议受影响应用立即完成升级。

该漏洞影响react-server-dom-webpack、react-server-dom-parcel、react-server-dom-turbopack三个包，这些包用于在不同构建工具中支持React Server Components功能。

要利用该漏洞，需要满足极为罕见的响应模式条件：响应必须包含多个类型化数组，且存在可被攻击者控制的值。并非所有使用React的应用都会受该漏洞影响。

Part01

特制载荷可触发代码执行

根据React官方说明，针对支持React Server Components的框架构造特制载荷，即可触发远程代码执行。类型化数组是按指定格式存储数值数据的结构。

公告指出，触发漏洞的条件是响应中同时包含多个类型化数组与攻击者可控数据，但官方未公布完整技术细节或漏洞利用方法。

尽管利用条件较为苛刻，该漏洞仍被评为严重级别。攻击者无需获取账号权限，整个利用过程也不需要用户交互。公告评定该漏洞对数据隐私、数据完整性和服务可用性的影响均为高危。不过官方在公开说明中并未提及，这类满足触发条件的应用模式在生产环境中到底有多常见。

本次漏洞披露前，Cyber Security News曾报道过此前的React安全问题，即React2Shell漏洞利用事件，读者需注意区分本次公告涉及的漏洞与此前的攻击事件。

React2Shell的漏洞编号为CVE-2025-55182，本次10月发布的公告暂未分配对应的CVE编号。目前已发现的针对旧漏洞的攻击活动，无法证明这一新漏洞已被利用。

Part02

多版本组件受漏洞影响

根据React官方安全公告，三个受影响包的漏洞影响版本范围如下：19.0.0至19.0.8、19.1.0至19.1.9、19.2.0至19.2.8，以及19.3.0。已发布的修复版本为19.0.9、19.1.10、19.2.9和19.3.1。尽管补丁说明中存在笔误，将19.0.9写为"19.0.09"，但公告中的包版本列表已确认正确修复版本为19.0.9。

按包划分，react-server-dom-parcel、react-server-dom-turbopack、react-server-dom-webpack三个包的受影响版本均为19.0.0至19.0.8、19.1.0至19.1.9、19.2.0至19.2.8以及19.3.0，修复版本均为19.0.9、19.1.10、19.2.9、19.3.1。

Cyber Security News此前也曾报道过相关的Next.js漏洞，其中包括一处涉及多个类型化数组的缓存组件问题。针对本次React漏洞，开发团队应对照官方公布的受影响版本范围，检查已安装的server-dom包版本，不要依赖旧的补丁指引判断风险。

React官方明确建议用户立即升级受影响的包。未包含服务端React代码的应用不受影响，未使用支持React Server Components的框架、打包工具或插件的应用也不受影响。

目前公开通告未提及该漏洞存在已被在野利用的情况。在评估自身受影响范围、准确通报该漏洞相关信息时，明确这些边界条件十分重要。

参考来源：

Critical React Server Components Flaw Lets Hackers Execute Code Remotely Without Authentication

https://cybersecuritynews.com/react-server-components-vulnerability-patch/
