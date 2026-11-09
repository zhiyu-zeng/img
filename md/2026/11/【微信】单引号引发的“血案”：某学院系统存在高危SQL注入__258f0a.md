---
title: 【微信】单引号引发的“血案”：某学院系统存在高危SQL注入
source: https://mp.weixin.qq.com/s/Fl2AJaDBlem7B3N9TgcS5g
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T09:00:55+08:00
trace_id: 2bbf1b43-87b3-404f-a6aa-20b399c40e34
content_hash: 123f902e0b8e8f0c1218b8a0733373158ce156cb2d2d95200d447795c05c64da
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41375244-d011-81e5-b465-c6277f488283
ioc: null
---

**三垣网安** *2026年11月8日 18:53*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/74caa1032830104e.png)

**一、前言：**

在高校信息化快速推进的当下，各类教务、心理评估、招生系统不断上线，但安全问题却常常被忽视。

近日，安全研究人员在某学院系统中发现一处高危 SQL 注入漏洞，攻击者可利用该漏洞获取数据库权限，甚至进一步控制服务器。

**二、漏洞复现：**

1.  通过信息收集统一平台进入

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/246fad4daf824610.jpg)
    

2.抓取心里评估流量包

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/718020ae7566f337.png)

3.输入单引号发现有报错

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1aa2e50fa5e2f2e2.png)

4.于是进行报错注入payload:

proName-plug_xly_ssqOddOpen getSssgOddOpen&largsList= 1&argsList=08argsList='extractvalue(1,concat(Ox7e(select+user(),Ox7e));

5.下面可以看到直接获得当前用户名，接下来不再继续越界测试。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b1d02a1bd1e0420.png)

**三、总结**

本次漏洞的核心问题并不复杂：用户输入未做任何过滤，直接拼接到 SQL 语句中执行。通过简单的单引号测试即可触发数据库报错，进一步利用 extractvalue() 等报错函数，便可完成数据提取。从漏洞利用难度来看，该漏洞属于低门槛、高危害，一旦被恶意利用，可能导致：

-   数据库敏感信息泄露
    
-   管理员账号被窃取
    
-   系统权限被进一步控制
    

觉得有收获的请关注三垣网安更多技术分享我们将及时推送与你，感谢支持！

请为我点个赞再走

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7cd56c4cd77bd2a8.png)

SQL注入｜各类绕过与实战复现合集 · 目录
