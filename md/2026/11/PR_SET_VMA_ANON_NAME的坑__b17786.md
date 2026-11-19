---
title: PR_SET_VMA_ANON_NAME的坑
source: https://fjqisba.github.io/2026/10/18/2026/PR_SET_VMA_ANON_NAME%E7%9A%84%E5%9D%91/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:56:10+08:00
trace_id: 54383a99-2dc3-482c-8ba1-41e4e570fa98
content_hash: e92a209a9a9bd174d9e635d9d860cd7db59c3e12a8bc957b5e119c6b4a5dd262
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-819c-b111-c6f891ed3c7d
ioc: null
---

## 现象

Unity游戏在绝大多数设备上启动正常，但在某一类设备上，加载完Unity启动画面后就一直黑屏卡死。

## 问题分析

1、出问题的设备跑的是 4.14 内核（厂商定制版本）。把出问题进程的 `/proc/<pid>/maps` dump 出来，看到的是类似的内容：

```
7f2a1000-7f2a2000 rw-p 00000000 00:00 0        [anon:.bss]
7f2a2000-7f2a3000 rw-p 00000000 00:00 0        [anon:%s %d
]
7f2a3000-7f2a4000 rw-p 00000000 00:00 0
TEXT
```

发现代码里面有一段修改内存页名的逻辑：

```cpp
prctl(PR_SET_VMA, PR_SET_VMA_ANON_NAME,(unsigned long)page_addr, page_size,(unsigned long)decrypt_str(page_name));
C++
```

`decrypt_str()` 解密出来的字符串，最后传递给prctl函数的实际上是用栈上的临时缓冲指针。这段代码在大多数设备上工作得很好： `prctl` 返回时，内核已经把字符串复制走了，栈帧随后被回收也不影响什么。

但在这台设备上，内核没有复制，堆栈数据一变，page名字就跟着变。调查资料后了解到：

`PR_SET_VMA_ANON_NAME` 是 Linux 5.17 才进入上游的接口（见 [PR_SET_VMA(2const)](https://man7.org/linux/man-pages/man2/PR_SET_VMA.2const.html) ），用来给匿名 VMA 起名，名字会以 `[anon:<name>]` 的形式出现在 `/proc/pid/maps` 和 `smaps` 里。

这个”复制”的设计并不是一开始就有的。该接口最早的版本直接用用户态指针保存名字，上游在合入前出于安全与健壮性考虑改成了内核内复制（见 [LKML 补丁说明](https://lkml.indiana.edu/hypermail/linux/kernel/2110.2/03829.html) ）。

2、名字本身只是装饰，显示错了也不该让进程黑屏。真正的问题在于 maps 是很多底层设施的输入：

-   崩溃栈回溯、内存统计、性能分析等工具都按行解析 `/proc/<pid>/maps` ，默认一条记录一行；
-   这个接口既然规定了名字的字符集，解析器就有理由按空白和换行安全切分；
-   一旦名字里混入换行，一条记录被拆成两行，后续解析全部错位，整份 maps 可能被判为非法而丢弃。

maps 解析失败之后，栈回溯拿不到模块与符号信息，上层继续执行时空指针解引用，触发 `SIGSEGV` ；崩溃处理器为了写 tombstone 又去回溯同一份 maps，撞上崩溃前尚未释放的内部锁——死锁。进程还在，界面永远停在启动画面。

一次纯装饰性的调用，就这样被放大成了启动黑屏。

## 解决方案

为了兼容不同的内核， `PR_SET_VMA_ANON_NAME` 传递的字符串参数，使用静态存储。
