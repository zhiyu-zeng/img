---
title: 【看雪】fstrm-capture 控制帧构造流程分析
source: https://bbs.kanxue.com/thread-292169.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-25T17:11:06+08:00
trace_id: e28c6ac6-3278-4b2b-96d3-086970538877
content_hash: c57d033db98e46616eb5e2d42d401208ddf7102a5705169f8552d296c29015bd
status: summarized
tags:
  - 看雪
  - Linux安全
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过逆向分析 fstrm-capture 程序，揭示了其基于 Frame Streams 协议接收数据流并构造控制帧写入文件的内部机制，重点涉及动态内存分配和编码流程。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3a875244-d011-81ff-bb3f-fd99f2789dc2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过逆向分析 fstrm-capture 程序，揭示了其基于 Frame Streams 协议接收数据流并构造控制帧写入文件的内部机制，重点涉及动态内存分配和编码流程。
> 
> - **程序功能：** fstrm-capture 是 fstrm-bins 工具之一，用于监听套接字接收 Frame Streams 协议格式的数据流并保存到文件。
> - **依赖与调试：** 程序依赖 libfstrm.so.0 和 libevent-2.1.so.7，符号表已剥离，需使用 strace、gdb 和 IDA 等工具进行逆向分析。
> - **核心逻辑：** 通过系统调用跟踪定位到 openat 和 epoll_wait，找到关键函数 handle_it（sub_5d10），其调用 libfstrm 库函数构造动态内存结构。
> - **内存结构：** 分析发现使用 struct_35、struct_33、struct_34 等结构体实现动态数组，由 fstrm_control_init 等函数初始化和管理。
> - **编码写入：** fstrm_control_encode 函数进行大小端序转换，最终通过 fwrite 将编码后的数据写入文件。

作为一个资历尚浅的pwn手，我大概算是第一次独立逆向这种真实环境下的程序，本帖仅当记录一下逆向和调试过程，若有纰漏，还请多多指出。

程序名称：fstrm_capture

debian系下安装命令：apt install fstrm-bins，默认在/usr/bin目录下，是安装fstrm-bin的三个命令行工具之一

程序用途：监听一个套接字，接收Frame Streams协议格式的数据流，然后保存至文件中。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f21159bffc5eb823.webp)

复制后ldd检查一下运行情况：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/895342c6c5a5fcf1.webp)

可以看到依赖一个libfstrm.so.0库，以及一个libevent-2.1.so.7库 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6b7b52780f768f72.webp)

file检查，确定符号表已经被剥离。

尝试先用strace确定使用了哪些系统调用，以便快速找到主要逻辑：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e2c77e9035f78377.webp)

可以发现最上面的openat调用，更之前是mprotect和brk，以及一些初始化，这里注意到openat的字符串是尾缀为.fstrm的文件名，不难猜测这是程序正在打开文件

而最下面，程序卡在了epoll_wait处，想必是一个死循环

直接启动gdbserver和gdb，并且在open上下断点，同时查看bt，可以找到是谁调用了open

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/455c67e4b4f2daa5.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/13263f727479cbb2.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c1c62dfdcd475b6a.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7fe21c40e618ff52.webp)

调用者的地址是0x5555 5555 9eaf，我们通过cat /proc/7502/maps和readelf快速锁定此函数的VA

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/096183a545e70a50.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0c3b1405469b6498.webp)

用0x5555 5555 7000减掉代码段所在的LOAD相对于虚拟内存运行基址的VA 0x3000，得到映射在虚拟内存中的起始位置，用0x5555 5555 9eaf减去这跟起始位置的值，等于0x5eaf，也就是调用open的代码出现在这个相对VA上

这里我的办法稍微麻烦了一些，其实可以用IDA直接追踪一下open的调用，直接找到目标函数

打开IDA，目标函数是sub_5d10,IDA显示的VA也是0x5d10，简单分析后情况如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1dca1e392ce2fb16.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/62a2fc5aad106b3f.webp)

将sub_5010重命名为handle_it，并继续对它进行分析： ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7a377a3601737da4.webp) 、其中fstrm_control_init,fstrm_control_set_type等几个函数是libfstrm.so的库函数，这里也把对它们的分析结果贴出来：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/950ee81c625d80fb.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e0f24ee5eaafb3e5.webp)

对于fstrm_control_set_type函数，它并没有标出自己的参数情况，所以它的参数是用gdb看的：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f51a6e1001f9ad88.webp)

rdi寄存器和rsi寄存器负责保存前两个参数，所以参数分别是0x5555 5555 3550和0x2

总地来说，这一大堆逻辑，其实都是创建了这样一个内存链式结构：

修复的结构体的命名不太严谨，不过应该不影响阅读：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c8051968d5bf38db.webp)

这里解释一下：

这是一个实现动态数组分配的机制

一块内存的类型是struct_35，该内存由fstrm_control_init在堆上分配；struct_35->ptr指向一个struct_33类型的内存，这段内存同样由fstrm_control_init分配，the_array_start_ptr代表一个结构体数组的头部指针，malloc_pos_ptr是游标，room_has_been_used表示当前结构体数组的元素数量，the_whole_room是当前最大可储存的元素数

该数组的每一个元素，都是struct_34类型，前八字节表示字符串长度，后八字节存储一个指针，指向字符串大小

它应该是为大型软件设计的，而fstrm_capture应用它仅仅是存一个普通字符串，也就是-t参数

fstrm_control_encode是一个编码函数，大概的过程是大小端序的转换，我只做了一半分析，有需求可自行查看 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/661b792f332e6573.webp)

size\[0\].m128i_u64\[1\]属于某union(大小为16字节)的后半部分，前半部分就是size本身，这里应该也是编译器优化问题

程序最后调用fwrite，将size\[0\].m128i_u64\[1\]所存储的内容按size x 1写入文件之中

这里是最后的结果：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1008d4829cb2f916.webp)

本来想抓个包再检验一下，但其实跟hexdump看的东西区别不大，只是经过编码后的情况，如果不深入编码逻辑的话，应该没必要细究

对我而言，难点主要来自没接触过frame stream协议，以及对动态数组的原理不熟悉

到此告一段落。

下面是附件，包含原装的libfstrm库和fstrm_capture，以及我分析得到的i64文件

## 附件

- [libfstrm.so.0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/d7dab1baf1c1718e.0) （46.15kb，0次下载）
- [fstrm_capture](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/c19bd8455116d0c4.bin) （55.96kb，0次下载）
- [fstrm_capture.i64](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/dcee0c44e4f94c35.i64) （720.54kb，0次下载）
- [libfstrm.so.0.i64](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/e04fef582e532a8b.i64) （557.20kb，0次下载）
