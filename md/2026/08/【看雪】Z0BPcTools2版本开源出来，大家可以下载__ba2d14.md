---
title: 【看雪】Z0BPcTools2版本开源出来，大家可以下载
source: https://bbs.kanxue.com/thread-292484.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-12T20:13:05+08:00
trace_id: 4098f4ef-e371-48fe-a408-8938999d25ac
content_hash: ec54e8322e5420c6e1db73ed7827c09d86e71202dab1b2e1acbaf553b26f4f9c
status: synced
tags:
  - 看雪
  - 安全工具
  - 反汇编工具
series: null
feed_source: 看雪·逆向工程
ai_summary: Z0BPcTools2已开源，是一个仿OllyDbg界面的Windows PE反汇编工具，支持X86/X64，静态显示汇编、十六进制及PE头信息；配套调试器Z0BDbg暂不开源但可试用。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ba75244-d011-818a-8787-d92cddda4f1d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Z0BPcTools2已开源，是一个仿OllyDbg界面的Windows PE反汇编工具，支持X86/X64，静态显示汇编、十六进制及PE头信息；配套调试器Z0BDbg暂不开源但可试用。
> 
> - **开源地址：** github.com/basketwill/Z0BPcTools，源码位于sourcecode目录，采用Win32 SDK实现仿OllyDbg界面。
> - **功能范围：** 支持Windows PE文件，X86/X64架构，提供多色高亮汇编代码窗口、二进制十六进制数据窗口及PE头信息窗口。
> - **当前限制：** 全内存方式加载，无类似IDA的idb工程文件，50MB以上大PE会占用较多内存；尚未实现OllyDbg快捷键与动态调试功能。
> - **配套调试器：** Z0BDbg位于github.com/basketwill/Z0BDbg，暂未开源且在优化中，但已可试用。

Z0BPcTools2版本开源出来

[https://github.com/basketwill/Z0BPcTools](http://https://github.com/basketwill/Z0BPcTools)

代码在sourcecode里大家可以 研究下 我这个win32 sdk代码是如何实现 ollydbg界面的用这个源代码大家可以做很多新产品

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d66e71de79f5b889.webp)

调试器：

https://github.com/basketwill/Z0BDbg 这个暂时不开源 还在优化ing，但是调试没问题大家可以试用

一个windows反汇编工具，界面风格防OllyDbg 利用业余开发了一款类似仿OLlyDbg界面的 IDA静态反编译工具，目前是1.0版本，功能不是很强大但是基本功能有了

1.  显示一个PE文件的汇编代码，多种颜色高亮显示，界面风格与OD界面相同，同时也显示二进制十六进制的数据窗口，还有PE头信息的窗口。
    
2.  目前只支持windowsPE，支持X86 / X64
    
3.  目前是全内存方式，暂时没有类似IDA的idb文件方式，所以很大的PE 比如50M以上的PE会占比较大的内存
    
4.  暂时没实现OllyDbg的快捷键
    
5.  暂时还没实现动态调试。
    
6.  下面是软件截图
    

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/52190b07964cded0.webp)
