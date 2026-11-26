---
title: 【看雪】CatProtect-自己写的一个代码虚拟化小玩具
source: https://bbs.kanxue.com/thread-293671.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-27T06:07:50+08:00
trace_id: 40a34c8b-9b7e-4a57-b1fb-b2c00824dc6c
content_hash: a009e26799023853df7b01ad8cf91d7d0a8a388dc8eec59f6ebb5451105468b3
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·加壳脱壳
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 42475244-d011-8155-8b1e-d92e6be49607
ioc: null
---

看以前发的skii没人用,所以自己写了一个代码加密虚拟化平台,适用于Windows x64,x86平台,内附一个crackme,欢迎测试提出问题,目前还是有很多问题  
有 **运行时动态栈重对齐问题**  
x86下的 `and esp, -0x10` 、部分软件的手写 MASM 汇编 `and rbx, -0x40; mov rsp, rbx` 、以及 Rust/LLVM 为 AVX2 `__m256i` 等大对齐局部变量生成的 `and rsp, -N` / `-0x20   `像这种问题修复起来触及虚拟机架构了,本质属于函数入口按调用方运行时 `SP` 余数做位掩码对齐，导致同一函数体内指令的 `SP - SP0` 偏移不再是编译期常量，打破了线性 VM 的固定/可证明栈深框架,以本人的拙劣技艺暂时还无法修复  
还有 **动态变长 \_alloca 与含原生 CALL 的 Win64 局部 SEH  
**也就是 `lloca/__chkstk` 探测大小来自运行时变量（无静态上界）；部分在 Win64 `__try/__except` 局部 SEH 块内直接调用了外部 Win32 API，超出当前无 `CALL` 的局部 SEH 合同  
然后关于 **兼容性**,目前用了5个开源项目和一个自己写的压力测试程序为主,  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0d8e3cf2feb4f9e6.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d6503ddf12c24734.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a1935f2f025d9397.webp)

所以兼容性方面不用太过担心,然后就是安全性,链接内附带一个crackme,欢迎测试  
https://wwawn.lanzouw.com/i8wIl4h9rere  
密码:9rx7  

免责说明:本人不对软件加密产生的任何软件负责,不得加密任何非法软件  
os:因为开发和测试的比较仓促,还有很多地方都没有完善,希望大家可以多多提意见,大佬也可以帮忙看看,小弟感激不尽
