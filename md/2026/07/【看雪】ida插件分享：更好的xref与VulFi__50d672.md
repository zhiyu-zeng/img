---
title: 【看雪】ida插件分享：更好的xref与VulFi
source: https://bbs.kanxue.com/thread-292237.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-30T17:02:30+08:00
trace_id: 628197fc-0d49-4a8d-b4fc-4704472db05f
content_hash: f2f16669be3e1c7f11a57b4f064646df1c31a8436a2850b4d2934997c0594dc7
status: synced
tags:
  - 看雪
  - 安全工具
  - 漏洞分析
series: null
feed_source: 看雪·逆向工程
ai_summary: 插件func-call-viewer可快速列出函数所有调用并导出CSV，结合VulFi新增的轻量扫描规则，大幅简化二进制程序漏洞审计流程。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ad75244-d011-8135-9bcd-d30b4d34457b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 插件func-call-viewer可快速列出函数所有调用并导出CSV，结合VulFi新增的轻量扫描规则，大幅简化二进制程序漏洞审计流程。
> 
> - **核心功能：** 选中函数后按Alt+W即可打开调用列表窗口，每个调用项均可点击跳转到对应的反汇编或伪代码位置。
> - **快速初筛：** 在调用列表中使用IDA内置搜索 `"(v"` 可过滤掉硬编码调用，只保留动态调用点，加速漏洞定位。
> - **数据导出：** 支持将完整调用信息导出为CSV文件，方便提交给AI或外部工具进行批量分析。
> - **VulFi增强：** 为VulFi漏洞扫描插件增加了相同的调用列表显示，并新增Light Rules轻量规则集，避免Default规则在大程序上扫描耗时过久。
> - **部署方式：** 将插件文件复制到IDA插件目录后打开IDA即可使用，无需额外配置。

在逆向二进制程，我经常遇到一个场景：对system/printf，我需要审它的调用是否有问题。可是一个二进制程序需要审的调用太多了，根据xref去一个个跳转过去审计并不明智。基于这个想法，我做出了第一版的插件，在看雪也写了篇介绍的 [文章](https://bbs.kanxue.com/thread-288572.htm)

现在我修改了交互、修复了一个导致重复的显示的bug并加入了导出调用表的功能。并且为VulFi也加入了这个功能。来看看新版是怎么样的吧

项目地址： [https://github.com/RiMuawa/ida-func-call-viewer](https://github.com/RiMuawa/ida-func-call-viewer)  
[https://github.com/RiMuawa/VulFi](https://github.com/RiMuawa/VulFi)

## 介绍

## func-call-viewer

将插件文件复制到IDA插件目录后打开IDA，选中要分析的函数  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9d9583edc9623612.webp)  
然后按Alt+W,就会列出这个函数所有的调用。我们就可以比较轻松的去审计代码是否存在漏洞。点击就可以前往对应的反汇编/伪代码窗口进行进一步分析了。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/65f181c8773f2d24.webp)
  
在调用很多的时候，我们也可以用ida自带的搜索做一下初筛，比如ctrl+f打开搜索后输入 `"(v"`,这样就可以排除硬编码的system调用。  
  
如果想把结果扔给ai审，也可以导出为csv  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1df0a7c03757a97c.webp)

## VulFi

Fulfi是一个漏洞扫描插件。我在原本插件的基础上加入了相同的调用列表。并且加入了一个自己比较需要的简单规则Light rules。

同样的把件文件复制到IDA插件目录后打开IDA，在Search窗口中有VulFi选项  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fd0934739df964ab.webp)
  
点击后可以选定扫描的规则，我个人肯定是推荐这个Light Rules，Default扫描的内容太多了，遇到稍大一点的二进制扫描就有点费时了。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1740027d1a9d4adf.webp)
  
同样的，我们可以看到所有VulFi标记可能存在漏洞的函数的调用  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/08c83816fab0922c.webp)

如果对我的插件有任何建议或者发现了bug，欢迎留言讨论或者提issue!
