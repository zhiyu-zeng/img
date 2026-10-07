---
title: 【看雪】恶意代码分析-进程镂空 xor解密
source: https://bbs.kanxue.com/thread-293159.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-07T13:10:54+08:00
trace_id: 2ba84118-fe58-4979-b8fa-59b2c8f9cd77
content_hash: 8f7ffb48b2430dc9a3bc1954b4ed611cb29f4d8afe3557ba29439e6e1f9f0187
status: synced
tags:
  - 看雪
  - 恶意样本
  - Windows逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: 该样本是《恶意代码分析实战》第12章实验的加载器：从资源表取加密代码，用0x41异或解密，再通过进程镂空注入svchost并执行。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 3f275244-d011-81d4-ade1-dbbc1d566eb1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该样本是《恶意代码分析实战》第12章实验的加载器：从资源表取加密代码，用0x41异或解密，再通过进程镂空注入svchost并执行。
> 
> - **样本来源：** 来自《恶意代码分析实战》第12章实验练习一，加载器负责解密并注入恶意代码。
> - **解密方式：** 恶意代码位于资源表，复制到内存后先检查DOS头，再循环XOR解密，密钥为0x41。
> - **进程镂空：** 以svchost.exe为宿主，挂起方式打开目标进程；从PEB+0x8读取ImageBase，动态获取ntdll!NtUnmapViewOfSection并卸载目标内存节。
> - **注入执行：** 申请匹配shellcode的内存，写入PE头与各节区数据，修改Context的eax为OEP，写回ImageBase，调用SetThreadContext、ResumeThread启动。
> - **载荷行为：** 解密后代码大小0x6000，dump分析为基本键盘记录，作者认为整体难度不高。

此样本来自《恶意代码分析实战》第12章的实验练习一  
主函数:  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7ddb5e1145fc2314.webp)  
获取svchost.exe所在目录，为后续恶意行为做宿主  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7b31a376c30edc4e.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e988ada5c6304bef.webp)
  
  
## 资源段解密入口

这是恶意代码所在位置，位于资源表中，被复制到内存中，首先检查DOS头是否正确，最后对其循环进行解密  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3bc45bc2b5785088.webp)
  
可以看到是一个很简单的xor解密 密钥为0x41  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/54c8acd63988d2a6.webp)
  
## 注入函数分析

接下来是sub_4010EA函数的分析，里面包含整个恶意代码的注入流程，分别传入了svchost目录以及申请内存并解密出来的shellcode代码

接下来是非常经典的进程镂空注入技术  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cd2ca709e9abc540.webp)
  
首先对恶意代码进行一系列PE结构检查，打开目标进程并使其为挂起状态，只有调用ResumThread函数才能运行  
分配一个context结构体内存，为后续设置权限以及读取和修改寄存器值做准备。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a167f306b0afdc44.webp)
  
## PEB与卸载内存节

在挂起状态下ebx指向的是PEB，因此PEB+0x8->ImageBase。读取宿主程序的ImageBase，并动态获取ntdll.dll，查找NtUnmapViewOfSection地址，NtUnmapViewOfSection 是 Windows 原生 API（Native API）中的一个内核模式例程，用于取消映射（unmap）一个内存节（section）视图，即撤销 NtMapViewOfSection 所做的映射操作  
这就是进程镂空的操作，将目标程序的内存节干掉。最后在目标程序申请一段与shellcode符合的内存  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2e6c24e569e699a6.webp)
  
最后分别写入恶意文件的PE头数据以及各节区的数据  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e70b1e85facb4ef5.webp)
  
## 设置OEP并恢复线程

修改eax的值，也就是OEP地址，所有目标操作做完后，最后写回ImageBase，调用SetThreadContext生效，ResumeThread启动线程。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b188f58beac5ed85.webp)
  
加载器基本分析完毕，现在来看看恶意代码，动态分析，直接把解密后的代码拿出来  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5bb8f0fbe19e9c60.webp)
  
这是加密后的代码  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/312c1388aee6395f.webp)
  
解密后的代码 大小为0x6000  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/948a62e3de8e56af.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5d71722242a1d67a.webp)
  
  
## 载荷功能：键盘记录

把目标内存dump下来查看  
其实就是基本的键盘记录，简单的恶意行为，不再详细赘述了  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/325c11bcd77fde12.webp)
  
这是一个非常简单和经典的进程镂空以及xor解密的恶意代码加载器，总得来说没有什么难度。  
记录一下自己的分析过程，目前找不到合适的样本去分析，AI盛行的时代，不知道恶意代码分析的效率也大大提高，市场或将饱和，这也为我带来了一定的就业压力。作为大一的我，只能走一步看一步了.......希望能够在大二的时候拿到自己的第一份实习offer。

[回复或点赞可查看完整内容](#quick_reply_form)
