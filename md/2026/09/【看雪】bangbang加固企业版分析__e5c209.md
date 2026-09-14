---
title: 【看雪】bangbang加固企业版分析
source: https://bbs.kanxue.com/thread-292948.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-14T16:30:01+08:00
trace_id: 781ee247-05bc-4821-8a5e-cc4f0fd57cec
content_hash: 68a7dbb834338a09e71b37781845d8fbe461246b30b68e32749aaa7ed069f987
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - Android逆向
series: null
feed_source: 看雪·Android安全
ai_summary: 通过修复被篡改的 ELF 动态段定位 init/init_array，还原壳so 的解密与多线程检测，最终扫描并 NOP 全部 call pthread_create 桩绕过 bangbang 企业版加固。
ai_summary_style: key-points
images_status:
  total: 97
  succeeded: 97
  failed_urls: []
notion_page_id: 3db75244-d011-814c-afbf-d7a088b96df1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过修复被篡改的 ELF 动态段定位 init/init_array，还原壳so 的解密与多线程检测，最终扫描并 NOP 全部 call pthread_create 桩绕过 bangbang 企业版加固。
> 
> - **ELF 陷阱：** 节头表全空，PT_DYNAMIC 的 p_offset（0x1178F0）是假地址；按 p_filesz/16=38 项硬解会在 DT_NULL 处截断，丢失 DT_STRTAB、DT_SYMTAB、DT_INIT_ARRAY 等关键项。
> - **真实地址换算：** linker 只信任 p_vaddr=0x111468，它落在 LOAD 段1（文件 0x10CFC0、内存 0x10DFC0，固定差 0x1000），故实际文件偏移为 0x110468。
> - **init 解密：** init 调用 sys_mmap(0, len, 7, 0x22, -1, 0) 开辟匿名 RWX 内存搬运壳so 字节；JNI_OnLoad（0x31BF0，被 0x48F8 引用）与 init_array 目标同样处于加密状态，需运行时回填。
> - **检测组合：** 扫 /proc/self/maps 与 su、magisk 路径，探测本地 20000-30001 端口，查模拟器与 TracerPid，用导出表匹配 hook 框架；多个线程异常统一走 sub_2F010 自毁，并有父子进程互监控。
> - **Patch 思路：** 在 linker call_array 阶段下手，扫代码段 E8 相对 call（目标=call+5+rel32），定位 29 处调 pthread_create 的 PLT 桩 0x2BE10，改写为 31 C0 90 90 90（xor eax,eax）伪造返回 0，避免残留脏 eax 触发重建。

## 前言

一直想深入学习这个样本的frida检测和so保护，但是前边都在搞别的事情去了给耽搁了，可算得空整整这玩意了。本文详尽记录了在动态调试（fridahook）之前防守方立下的道道门槛是如何保护程序免受攻击的

环境如下：

目标样本：绿色老外喝咖啡 v10.25.0

设备：雷电9模拟器（刚到学校我的宝贝p3就弄丢了 我超威 下单的p6还没到先用这玩意过渡一波）

Frida： **rusda** 17.15.0

IDA：9.3

## 壳so init函数分析

安装好app后直接打开会发现这玩意连开屏广告都不给我看，也是给我省流量了说是。走流程的话就是看logcat日志去找崩溃点，不走流程就是直接去看目标so。这里还是走流程吧，分析看看啥情况。

```java
26-09-09 17:41:51.250  8981-9005  libc                    pid-8981                             A  Fatal signal 11 (SIGSEGV), code 2 (SEGV_ACCERR), fault addr 0x763870609f60 in tid 9005 (om.starbucks.cn), pid 8981 (om.starbucks.cn)
2026-09-09 17:41:51.265  9010-9010  cutils-trace            pid-9010                             E  Error opening trace file: No such file or directory (2)
2026-09-09 17:41:51.272  9013-9013  crash_dump64            pid-9013                             I  obtaining output fd from tombstoned, type: kDebuggerdTombstone
2026-09-09 17:41:51.272  1457-1457  /system/bin/tombstoned  tombstoned                           I  received crash request for pid 9005
2026-09-09 17:41:51.272  9013-9013  crash_dump64            pid-9013                             I  performing dump of process 8981 (target tid = 9005)
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A  *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A  Build fingerprint: 'Android/aosp_marlin/marlin:9/PQ3A.190605.06171036/3793265:user/release-keys'
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A  Revision: '0'
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A  ABI: 'x86_64'
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A  pid: 8981, tid: 9005, name: om.starbucks.cn  >>> com.starbucks.cn <<<
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A  signal 11 (SIGSEGV), code 2 (SEGV_ACCERR), fault addr 0x763870609f60
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A      rax 1c79e6447a1f8022  rbx 0000763870609f60  rcx 0000000000000000  rdx 17aebb87ac15003c
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A      r8  00007638706098a0  r9  00000000ffffffff  r10 00007638706098b0  r11 0000000000000246
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A      r12 00007fff53585c70  r13 0000763870659530  r14 0000763870726930  r15 0000763870726130
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A      rdi 0000000000000001  rsi ffffffff00000208
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A      rbp 0000000000000000  rsp 0000763870609d80  rip 0000763870609f60
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A  
                                                                                                    backtrace:
2026-09-09 17:41:51.274  9013-9013  DEBUG                   pid-9013                             A      #00 pc 00000000000fbf60  <anonymous:000076387050e000>
2026-09-09 17:41:51.320  1457-1457  /system/bin/tombstoned  tombstoned                           E  Tombstone written to: /data/tombstones/tombstone_02
```

这里显示的是anonymous而不是某个 `libxxx.so` 。这说明:rip(指令指针)= 0x763870609f60 正好落在从 0x76387050e000 开始的一段匿名可执行内存里(偏移 0xfbf60)。

```java
#00 pc 00000000000fbf60  <anonymous:000076387050e000>
```

SIGSEGV是段错误，程序访问了非法内存。code 2 (SEGV_ACCERR)：地址是有效的，但权限不对比如向只读内存写数据，或跳转执行了一段不可执行的内存。

crash_dump64负责把崩溃进程的寄存器、调用栈等信息dump下来。最终生成崩溃文件： `/data/tombstones/tombstone_02`

```java
Fatal signal 11 (SIGSEGV), code 2 (SEGV_ACCERR), fault addr 0x763870609f60
```

把崩溃文件拉出来看看

```java
adb pull /data/tombstones/tombstone_02
```

里面信息其实挺多的，我只看了开头和结尾把几个关键的部分贴出来，感兴趣的可以完整看看

### 崩溃文件分析

这里应该是检测root

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/71ee03a29980192e.png)

这里是检测blackdex？

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2ce31778efb127a2.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/96f67479a4e34b1a.png)

打开这个so看看怎么个事

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5ae4f7c691a153f4.png)

### so文件分析

节头表全是SHN_UNDEF类型都是空的

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/111c0fabbac35bf6.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8fee7e08fdfa5b09.png)

看看动态链接

一点点逐个看

第一个是P_type这个是段的类型 当前是：PT_DYNAMIC

第二个是p_flags 段的权限标志 这里是可读可写：read_write

第三个是p_offset 段在文件中的偏移 当前值是：0x1178F0

第四个是p_vaddr 段加载到内存后，在进程虚拟地址空间中的起始地址 值是：0x0000000000111468

第五个是p_addr 物理地址 值是：0x0000000000111468

第六个是p_filesz 该段在ELF文件中所占据的字节数 值是：608 这里显示的是字节

第七个是p_memsz 该段加载到内存中所占的字节数 值是：608 也是显示的字节

最后一个 p_align 该段在文件和内存中的对齐边界 值是：8 也就是按照8字节对齐

每个 dynamic 项的结构是 Elf64_Dyn，固定 16 字节，前 8 字节是 d_tag，后 8 字节是 d_val 或 d_ptr。每个重定位项的结构是 Elf64_Rela，固定 24 字节，依次是 r_offset（8 字节）、r_info（8 字节）、r_addend（8 字节）。

对 PT_DYNAMIC 项的初步换算：

p_filesz 除以每个 Elf64_Dyn 的 16 字节 也就是 608除以16 得到38 也就是dynamic 表应有38个项

那就去p_offset 找initarray地址看看

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ffc0b3b416e330c4.png)

这样看不好看给他抠出来看

按照每16个字节一项、前8个字节为d_tag、后8字节为d_val的方式手动解析看看

```java
01 00 00 00 00 00 00 00 	A4 ED 00 00 00 00 00 00
d_tag=0x01					d_val=0xEDA4

01 00 00 00 00 00 00 00 	B2 ED 00 00 00 00 00 00
d_tag=0x01					d_val=0xEDB2

01 00 00 00 00 00 00 00 	BC ED 00 00 00 00 00 00
d_tag=0x01					d_val=0xEDBC

01 00 00 00 00 00 00 00 	C4 ED 00 00 00 00 00 00
d_tag=0x01					d_val=0xEDC4

01 00 00 00 00 00 00 00 	54 18 00 00 00 00 00 00
d_tag=0x01					d_val=0x1854

01 00 00 00 00 00 00 00 	13 00 00 00 00 00 00 00
d_tag=0x01					d_val=0x13

0E 00 00 00 00 00 00 00 	1B 00 00 00 00 00 00 00
d_tag=0x0E					d_val=0x1B

后面全是00字节填充
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 	00 00 00 00 00 00 00 00
```

ELF规定DT_NULL（d_tag为0）表示dynamic数组结束。如果严格按照此规则，解析将在0x117960处结束，只得到六个DT_NEEDED、一个DT_SONAME 、一个DT_NULL

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0eda2d3e0f98e446.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/234811ca0d1146d7.png)

少了很多项，比如DT_STRTAB、DT_SYMTAB、DT_RELA、DT_INIT_ARRAY等等.....

这很不正常，缺失了关键项的dynamic表不可能被系统linker正常加载。

模板又为啥解析出来50个项？

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3295e75f390d7748.png)

而 p_filesz 只允许 38 项。多出的 11 项属越界解析。

来看看这里

```java
D0 91 00 00 00 00 00 00 	D0 91 00 00 00 00 00 00
```

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e152f9ebf02dfa4d.png)

假设这里是某个项的d_val 0x91D 去IDA里边跳转到这个地址看看是个啥

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/34954fe820374381.png)

这玩意是个字符串表？

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c35ecc09362dcf2.png)

一直网上找可以找到符号表的地址0x2C0

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/41afec65707d7cc0.png)

这里尝试去导出表搜一下jni_onload

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d5c67523325b655.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/731e927580b1b4e4.png)

还真有

这里IDA提示有交叉引用 点过去看看是个啥

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48e7db1c575a8b7c.png)

这里得到了两个信息 首先就是JNI_ONLOAD的地址是0x31BF0且被加密了，其次就是这个地址被0x48F8处引用了。

那么可以确定这里一定有解密JNI_onload的地方 但是不知道搁哪呢。要时机比他还早的就是initarray。

但是又绕回来了，找不到这玩意搁哪阿。动态段里面压根没有这样项。那系统linker怎么解析这个so并且加载的？所以肯定不可能没有只是没找到。回到程序头表继续找。

### 计算真实PT_DYNAMIC文件地址

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0a3be513fd9a19db.png)

这里把这两个段的值列出来，首先是

段0（代码段，可读可执行）：

offset是0x0

vaddr是0x0

filesz=1099688（十进制）=0x10c7a8

这里文件大小和内存大小是相等的

段1（数据段，可读可写）

offset是0x10CFC0

vaddr是0x10DFC0

filesz=37872

memsz=139468

这里的段1文件大小和内存大小不相同，内存大小比文件大小大很多。那这里就是段1从文件里面读取37872个字节搬入内存，然后额外补上（139468-37872）的字节0，多出来大一大块空白数据区就是运行的时候才用得到

段1的offset与vaddr也是不同的，LOAD段就是把文件里面的一整块原封不动的搬运到内存里的一整块。就是类似把一整排的书从书架A搬到书架B，书和书之间的相对位置没有变化，只是整体平移了。

段1的文件地址是0x10CFC0 内存地址是0x10DFC0

```java
0x10DFC0 − 0x10CFC0 = 0x1000
```

内存地址比文件地址位置大了0x1000.这个0x1000是整段共用的固定差值，因为整段是原样平移过去的，开头差0x1000，那么在第五个字节、第一百个字节、段内的任何一个字节都相差0x1000。

所以只要某个东西在段1里。就有：

```java
内存地址-0x1000=文件位置
```

这里需要引入一个关键点，在前面我们使用的是dynamic的文件地址去找其下面的各项TAG发现缺少许多的关键项，回顾系统linker加载

映射LOAD段进内存

linker一开始遍历程序头表，此时只关心PT_LOAD类型的项。对每个LOAD段，它读该段的p_offset、p_vaddr、p_filesz、p_memsz，把文件的某段映射到内存的某段。而系统linker读取的这两个LOAD就是前面的段0和段1的p_offset。

映射完毕linker要去读取dynamic表了此时他会去看PT_DYNAMIC项，但是也只取p_vaddr这个地址。而PT_DYNAMIC的p_offset字段在整个linker流程从头到尾都没有被读取过一次，再加上前面通过文件地址分析被误导可以实打实确定这个地址是个错的。

那么要怎么获得正确PT_DYNAMIC的文件地址？

很简单 linker就是正确答案 他咋做的这里就咋做。PT_DYNMAIC里面唯一可信的地址就是p_vaddr 也就是0x111468

然后就是判断0x111468落在哪个LOAD段

前面已经算出来了下面是两个段的区间

段0 内存范围 0x0，0x10c7a8

段1 内存范围 0x10DFC0，0x13008C（这里是vaddr+memsz 也就是0x10DFC0+0x220CC）

而0x111468比0x10DFC0大且比0x13008C小 所以他落在段1。

按照段1的公式 内存地址-0x1000=文件位置

这里就是0x111468-0x1000=0x110468 这才是PT_DYNAMIC的真实文件地址

010直接跳转过去

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f5231e56c8389942.png)

抠出来手动解析

```java
03 00 00 00 00 00 00 00			E8 1A 11 00 00 00 00 00
d_tag:0x03						d_val:0x111AE8		DT_PLTGOT PLT 的 GOT 表地址

02 00 00 00 00 00 00 00			00 3F 00 00 00 00 00 00
d_tag:0x02						d_val:0x3F00		DT_PLTRELSZ PLT 重定位表字节数

17 00 00 00 00 00 00 00			88 7B 02 00 00 00 00 00
d_tag:0x17						d_val:0x27B88		DT_JMPREL .rela.plt 表地址

14 00 00 00 00 00 00 00			07 00 00 00 00 00 00 00
d_tag:0x14						d_val:0x07			DT_PLTREL PLT重定位类型(7=RELA)

07 00 00 00 00 00 00 00			D0 DC 01 00 00 00 00 00
d_tag:0x07						d_val:0x1DCD0		DT_RELA 主重定位表.rela.dyn地址

08 00 00 00 00 00 00 00			B8 9E 00 00 00 00 00 00
d_tag:0x08						d_val:0x9EB8		DT_RELASZ 主重定位表大小

09 00 00 00 00 00 00 00			18 00 00 00 00 00 00 00
d_tag:0x09						d_val:0x18			DT_RELAENT 每个重定位项大小

F9 FF FF 6F 00 00 00 00			45 04 00 00 00 00 00 00
d_tag:0x6FFFFFF9					d_val:0x445			DT_RELACOUNT RELATIVE重定位项数量

06 00 00 00 00 00 00 00			C0 02 00 00 00 00 00 00
d_tag:0x06						d_val:0x2C0			DT_SYMTAB 符号表地址

0B 00 00 00 00 00 00 00			18 00 00 00 00 00 00 00
d_tag:0x0B						d_val:0x18			DT_SYMENT 每个符号项大小

05 00 00 00 00 00 00 00			D0 91 00 00 00 00 00 00
d_tag:0x05						d_val:0x91D0		DT_STRTAB 字符串表地址

0A 00 00 00 00 00 00 00			CC ED 00 00 00 00 00 00
d_tag:0x0A						d_val:0xEDCC		DT_STRSZ 字符串表大小

F5 FE FF 6F 00 00 00 00			A0 7F 01 00 00 00 00 00
d_tag:0x6FFFFEF5					d_val:0x17FA0		DT_GNU_HASH GNU哈希表地址

04 00 00 00 00 00 00 00			88 A8 01 00 00 00 00 00
d_tag:0x04						d_val:0x1A888		DT_HASH 哈希表地址

01 00 00 00 00 00 00 00			A4 ED 00 00 00 00 00 00
d_tag:0x01						d_val:0xEDA4		DT_NEEDED 依赖库(字符串表偏移)

01 00 00 00 00 00 00 00			B2 ED 00 00 00 00 00 00
d_tag:0x01						d_val:0xEDB2		DT_NEEDED 依赖库(字符串表偏移)

01 00 00 00 00 00 00 00			BC ED 00 00 00 00 00 00
d_tag:0x01						d_val:0xEDBC		DT_NEEDED 依赖库(字符串表偏移)

01 00 00 00 00 00 00 00			C4 ED 00 00 00 00 00 00
d_tag:0x01						d_val:0xEDC4		DT_NEEDED 依赖库(字符串表偏移)

01 00 00 00 00 00 00 00			54 18 00 00 00 00 00 00
d_tag:0x01						d_val:0x1854		DT_NEEDED 依赖库(字符串表偏移)

0E 00 00 00 00 00 00 00			13 00 00 00 00 00 00 00
d_tag:0x0E						d_val:0x13			DT_SONAME 本库名(字符串表偏移0x13)

1B 00 00 00 00 00 00 00			1B 00 00 00 00 00 00 00
d_tag:0x1B						d_val:0x1B			DT_INIT_ARRAYSZ(疑似) 

1A 00 00 00 00 00 00 00			50 14 11 00 00 00 00 00
d_tag:0x1A						d_val:0x111450		DT_FINI_ARRAY fini函数数组地址

1C 00 00 00 00 00 00 00			10 00 00 00 00 00 00 00
d_tag:0x1C						d_val:0x10			DT_FINI_ARRAYSZ fini数组大小

19 00 00 00 00 00 00 00			60 14 11 00 00 00 00 00
d_tag:0x19						d_val:0x111460		DT_INIT_ARRAY init函数数组地址

1B 00 00 00 00 00 00 00			08 00 00 00 00 00 00 00
d_tag:0x1B						d_val:0x08			DT_INIT_ARRAYSZ init数组大小
```

ELF 官方头文件 `elf.h` 里定义了一堆常量,dynamic 表的 d_tag 只能取这些固定值。

含义是按照下面的顺序推出来的 地址

### init_array真实地址

init array 是一个函数指针数组,数组里每个元素都是一个指针

这里init数组大小是一共占据八个字节 在64位程序里面一个指针固定占据8个字节

```java
19 00 00 00 00 00 00 00			60 14 11 00 00 00 00 00
d_tag:0x19						d_val:0x111460		DT_INIT_ARRAY init函数数组地址

1B 00 00 00 00 00 00 00			08 00 00 00 00 00 00 00
d_tag:0x1B						d_val:0x08			DT_INIT_ARRAYSZ init数组大小
```

所以这里只有一个初始化函数地址是：0x111460

ida跳转过去看看

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c0cbe07917eb8eaf.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0e1afbed56feecd4.png)

也是加密的

### INIT

只能到此为止了吗？马达马达，还没结束。

这里还有一个比initarray时机更早的老家伙 init

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0832fb7e9c68d0f6.png)

继续往里追这玩意

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f781498150bba037.png)

这里代码挺短的

先看sub_1315AD，这里只看return了个啥

```java
// positive sp value has been detected, the output may be wrong!
__int64 __fastcall sub_1315AD(__int64 a1, __int64 a2)
{
  __int64 v2; // rbx
  __int64 result; // rax
  __int64 j; // rdx
  int i; // [rsp+Ch] [rbp-14h]

  for ( i = 273; i != 70; i = 70 )
    ;
  v2 = *(unsigned int *)(a1 + 40);
  result = ((__int64 (__fastcall *)(_QWORD, _QWORD, __int64, __int64, __int64, _QWORD))sub_131128)(
             0,
             ((_DWORD)v2 + 4095) & 0xFFFFF000,
             7,
             34,
             0xFFFFFFFFLL,
             0);
  for ( j = 0; j != v2; ++j )
    *(_BYTE *)(result + j) = *(_BYTE *)(a2 + j);
  return result;
}
```

result调用了一个sub_131128函数 ，而这里面是直接走 syscall做 mmap 的

```java
signed __int64 __fastcall sub_131128(
        unsigned __int64 a1,
        unsigned __int64 a2,
        unsigned __int64 a3,
        unsigned __int64 a4,
        unsigned __int64 a5,
        unsigned __int64 a6)
{
  return sys_mmap(a1, a2, a3, a4, a5, a6);
}
```

mmap 的原型是这样

```java
void *mmap(void *addr, size_t length, int prot, int flags, int fd, off_t offset);
```

第一个 addr,建议映射到的起始地址。传 0(NULL)表示不指定，让内核自个分配

第二个 length 要映射的字节数 内核会按页(通常 4KB)向上对齐

第三个 prot,这块内存的访问权限,按位组合:`PROT_READ=1` (可读)、 `PROT_WRITE=2` (可写)、 `PROT_EXEC=4` (可执行)、 `PROT_NONE=0` (不可访问)。 `prot=7` 就是 1|2|4,读写执行全开(RWX)。

第四个 flags,映射的类型和行为,也是按位组合。常见的有 `MAP_SHARED=1` (共享,改动会写回/对其他进程可见)、 `MAP_PRIVATE=2` (私有,写时复制)、 `MAP_ANONYMOUS=0x20` (匿名,不关联文件,内存清零)、 `MAP_FIXED=0x10` (强制用 addr 指定的地址)。你那个 `flags=34=0x22` 就是 `MAP_PRIVATE|MAP_ANONYMOUS` 。

第五个 fd,要映射的文件描述符。 fd;如果是匿名映射,按约定填 -1。这里的 `0xFFFFFFFFLL` 后缀 `LL` (long long,64 位)，它字面上其实是 `0x00000000FFFFFFFF`,但是mmap 的 `fd` 是 `int` (32 位),当这个值被赋给或截断成 32 位 int 时,只取低 32 位 `0xFFFFFFFF`,按 int 解释就是 -1。

第六个 `offset`,从文件的哪个偏移开始映射,必须是页大小的整数倍。

这里hook这个函数看看入参和出参

```java
onEnter: a1=0x76386e47a8af a2=0x76386e374a88
onLeave: ret=0x76388bd9e000
               0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
76388bd9e000  90 00 7e ff 35 5a 60 0e f9 0b 25 5c ac 90 00 ef  ..~.5Z`...%\....
76388bd9e010  13 1e 68 7e 34 e9 e0 ff db 00 25 52 1e cf 01 d0  ..h~4.....%R....
76388bd9e020  23 4a 3c 02 f2 c0 33 42 cf 03 b0 23 3a 3c 04 f2  #J<...3B...#:<..
76388bd9e030  a0 33 32 cf 05 90 23 2a 3c 06 f2 80 33 22 cf 07  .32...#*<...3"..
76388bd9e040  70 23 1a 3c 08 f2 60 33 12 cf 09 50 23 0a 3c 0a  p#.<..`3...P#.<.
76388bd9e050  f2 40 33 02 cf 0b 30 23 fa 9a 5f 0c 79 20 19 f2  .@3...0#.._.y ..
76388bd9e060  e7 0d 91 10 9e ea 0e 79 00 19 e2 e7 0f cf f0 fe  .......y........
76388bd9e070  da 3c 10 12 ff cc 1f d2 f0 11 4b ff 1f 33 ca c1  .<........K..3..
76388bd9e080  12 ff 2c 1f cf c2 13 04 ff b3 1f ba 3c 14 12 ff  ..,.........<...
76388bd9e090  cc 1f b2 f0 15 4b ff 1f 33 aa c1 16 ff 2c 1f cf  .....K..3....,..
76388bd9e0a0  a2 17 04 ff b3 1f 9a 3c 18 12 ff cc 1f 92 f0 19  .......<........
76388bd9e0b0  4b ff 1f 33 8a c1 1a ff 2c 1f cf 82 1b 04 ff b3  K..3....,.......
76388bd9e0c0  1f 7a 3c 1c 12 ff cc 1f 72 f0 1d 4b ff 1f 33 6a  .z<.....r..K..3j
76388bd9e0d0  c1 1e ff 2c 1f cf 62 1f 04 ff de fd 1e 5a 78 20  ...,..b......Zx
76388bd9e0e0  25 ff 99 1f 52 e0 21 96 ff 1f 67 4a 82 22 ff 59  %...R.!...gJ.".Y
76388bd9e0f0  1f 9e 42 23 09 ff 66 1f 3a 78 24 25 ff 99 1f 32  ..B#..f.:x$%...2
```

这玩意看着眼熟 拿到壳so一搜 还真搜到了

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d07ec695eadf1cf9.png)

那这里基本上可以确定就是这个sub_1315AD开辟一个匿名内存，然后将壳so的部分字节加载到内存中

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a5e8b3257953399.png)

### 无法F5

回到init看另外一个函数loc_1313D8，无法F5。跟着汇编看看

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c53224c16e6cd688.png)

```java
LOAD:00000000001313EF                 mov     dword ptr [rbp-3Ch], 0
LOAD:00000000001313F6                 mov     [rbp-48h], rdx
LOAD:00000000001313FA                 mov     dword ptr [rbp-38h], 1Eh
LOAD:0000000000131401                 mov     dword ptr [rbp-34h], 111h
```

这里对rbp的不同偏移赋了一个值

接着往下走，主要就盯着cmp就行然后看后面是jmp（无条件跳）、jz（相等就跳转）、jnz（不等就跳转）、jle（小于等于就跳转）

```java
LOAD:0000000000131408 loc_131408:                             ; CODE XREF: LOAD:0000000000131424↓j
LOAD:0000000000131408                                         ; LOAD:0000000000131448↓j ...
LOAD:0000000000131408                 mov     eax, [rbp-34h]
LOAD:000000000013140B                 cmp     eax, 46h ; 'F'
LOAD:000000000013140E                 jz      short loc_13146B
LOAD:0000000000131410                 mov     eax, [rbp-34h]
LOAD:0000000000131413                 cmp     eax, 105h
LOAD:0000000000131418                 jz      short loc_131463
LOAD:000000000013141A                 cmp     eax, 111h
LOAD:000000000013141F                 jz      short loc_131453
LOAD:0000000000131421                 cmp     eax, 15h
LOAD:0000000000131424                 jnz     short loc_131408
LOAD:0000000000131426                 mov     eax, [rbp-34h]
LOAD:0000000000131429                 imul    eax, 14h
LOAD:000000000013142C                 add     eax, 74h ; 't'
LOAD:000000000013142F                 mov     [rbp-34h], eax
LOAD:0000000000131432                 add     rsp, 280h
LOAD:0000000000131439                 mov     eax, [rbp-34h]
LOAD:000000000013143C                 cmp     eax, 3
LOAD:000000000013143F                 jle     short loc_13144A
LOAD:0000000000131441                 mov     dword ptr [rbp-34h], 0FFFFFFD6h
LOAD:0000000000131448                 jmp     short loc_131408
```

从上往下看、第一组rbp-34h的值是111h，而下面CMP的第二个值不是111h所以继续往下走

```java
LOAD:0000000000131408                 mov     eax, [rbp-34h]
LOAD:000000000013140B                 cmp     eax, 46h ; 'F'
LOAD:000000000013140E                 jz      short loc_13146B
```

这里依旧不是

```java
LOAD:0000000000131410                 mov     eax, [rbp-34h]
LOAD:0000000000131413                 cmp     eax, 105h
LOAD:0000000000131418                 jz      short loc_131463
```

这里是jz相等就去loc_131453 那就跳转过去看看

```java
LOAD:000000000013141A                 cmp     eax, 111h
LOAD:000000000013141F                 jz      short loc_131453
```

loc_131453这里也是赋值 然后跳转到loc_131408

```java
LOAD:0000000000131453 loc_131453:                             ; CODE XREF: LOAD:000000000013141F↑j
LOAD:0000000000131453                 mov     dword ptr [rbp-38h], 1Eh
LOAD:000000000013145A                 mov     dword ptr [rbp-34h], 46h ; 'F'
LOAD:0000000000131461                 jmp     short loc_131408
```

那就继续往下追loc_131408 依旧是比较 只看cmp相等的 这里是loc_13146B 继续往下追

```java
LOAD:0000000000131408 loc_131408:                             ; CODE XREF: LOAD:0000000000131424↓j
LOAD:0000000000131408                                         ; LOAD:0000000000131448↓j ...
LOAD:0000000000131408                 mov     eax, [rbp-34h]
LOAD:000000000013140B                 cmp     eax, 46h ; 'F'
LOAD:000000000013140E                 jz      short loc_13146B
LOAD:0000000000131410                 mov     eax, [rbp-34h]
LOAD:0000000000131413                 cmp     eax, 105h
LOAD:0000000000131418                 jz      short loc_131463
LOAD:000000000013141A                 cmp     eax, 111h
LOAD:000000000013141F                 jz      short loc_131453
LOAD:0000000000131421                 cmp     eax, 15h
LOAD:0000000000131424                 jnz     short loc_131408
LOAD:0000000000131426                 mov     eax, [rbp-34h]
LOAD:0000000000131429                 imul    eax, 14h
LOAD:000000000013142C                 add     eax, 74h ; 't'
LOAD:000000000013142F                 mov     [rbp-34h], eax
LOAD:0000000000131432                 add     rsp, 280h
LOAD:0000000000131439                 mov     eax, [rbp-34h]
LOAD:000000000013143C                 cmp     eax, 3
LOAD:000000000013143F                 jle     short loc_13144A
LOAD:0000000000131441                 mov     dword ptr [rbp-34h], 0FFFFFFD6h
LOAD:0000000000131448                 jmp     short loc_131408
```

loc_13146B 直接去看sub_13148F

```java
LOAD:000000000013146B loc_13146B:                             ; CODE XREF: LOAD:000000000013140E↑j
LOAD:000000000013146B                 call    sub_13148F
LOAD:0000000000131470                 pop     rdi
LOAD:0000000000131471                 pop     rdi
```

对sub_13148F进行F5 IDA报错 说131567: call analysis failed 地址 0x131567、call 分析失败

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e1055764d9da3e3.png)

继续跟进0x131567 这里调用的是sub_13119B 那就去看这个

```java
LOAD:0000000000131564 loc_131564:                             ; CODE XREF: sub_13148F+54↑j
LOAD:0000000000131564                                         ; sub_13148F+58↑j
LOAD:0000000000131564                 mov     rdi, r13
LOAD:0000000000131567                 call    sub_13119B
LOAD:000000000013156C                 jmp     loc_1314E9
```

sub_13119B 这里是可以直接F5反编译的 但是这里怎么一大截参数

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0dd8b11b92683078.png)

Hex-Rays 在父函数 `sub_13148F` 里调用它时,试图为这几十个参数准备栈,发现根本对不上,于是 `call analysis failed` 。

真是神了，这里把入参改成1-4个试试看

在 `sub_13119B` 函数头按Y

```java
int __fastcall sub_13119B(char *a1, __int64 a2, __int64 a3, __int64 a4);
```

### 主线分析 （sub_13148F）

再回到 `sub_13148F` 就可以正常识别了

一截一截看吧，先从这里看 调用sub_131168函数传入三段不同的字符串，第二个参数都是10 然后分别赋值给v3、4、5

然后对v3、4、5进行判断 如果符合条件就进入到sub_13119B函数 接着又传入字符串和v6、v7

```java
  v3 = ((__int64 (__fastcall *)(const char *, __int64))sub_131168)("__b_a_n_g_", 10);
  v4 = ((__int64 (__fastcall *)(const char *, __int64))sub_131168)("c_l_e__che", 10);
  v5 = ((__int64 (__fastcall *)(const char *, __int64))sub_131168)("ck1234567_", 10);
  if ( (unsigned __int8)(v3 == 0) <= (unsigned __int8)(v4 != 0) || v5 )
  {
    LOBYTE(v6) = v4 != 0;
    LOBYTE(v7) = v3 == 0;
    sub_13119B(v16, (__int64)"ck1234567_", v6, v7);
  }
```

### 支线分析

先去看看sub_131168函数

a3如果不等于v3 ，a3不等于0就一直循环，a1+0赋值给v4、a2+v3赋值给v5，a1不是字符串吗？，a2是10。

```java
__int64 __fastcall sub_131168(__int64 a1, __int64 a2, int a3)
{
  __int64 v3; // rcx
  int v4; // eax
  int v5; // r8d

  v3 = 0;
  do
  {
    v4 = *(unsigned __int8 *)(a1 + v3);
    v5 = *(unsigned __int8 *)(a2 + v3);
    if ( (_BYTE)v4 != (_BYTE)v5 )
      return (unsigned int)(v4 - v5);
    if ( !(_BYTE)v4 )
      break;
    ++v3;
  }
  while ( a3 != (_DWORD)v3 );
  return 0;
}
```

这里入参个数不会出错 三个参数都有用到，那么出错的就是调用它的 `sub_13148F` 。少传了一个参数。而且这里的字符串挺眼熟的前面好像见过。

这个这不就巧了吗，这里应该是pop r13导致ida少识别了一个寄存器

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7e19ba8cc788a2eb.png)

那么少的大概率是sub_131168的入参a1了，因为你拿一个字符串和10比较个啥阿。这里的sub_131168就是自写的字符串比较函数 如果不相等就会返回一个v4-v5回去 如果字符串相等就会返回0

再来看这个表达式 这里对v3判断是否等于0 也就是字符串对不对的上，以及判断v4是不是不等于0，逻辑或 v5

按照不让他执行if内的内容来推断的话

(unsigned \__int8)(v3 == 0) <= (unsigned \__int8)(v4!= 0) 必须等于0

那么v3就必须==0 左边才是1 右边必须是0才能 让表达式为0

v5也必须等于0

```java
  if ( (unsigned __int8)(v3 == 0) <= (unsigned __int8)(v4 != 0) || v5 )
```

所以这里只有三个字符串都匹配上了才不进入if内，但是貌似也不能推断说a1的参数就是 pop r13导致ida少识别了一个寄存器 a1的值理论上来说应该是不固定的 启动时会采集的才对。不然总拿两个一样固定的字符串不就是恒为0了吗。这里不深究 继续看if里面是个啥。

这边依旧拆开看 首先是入参有点问题 只用到了\*a1 其他的三个没用到 所以按Y修改一下

```java
int __fastcall sub_13119B(char *a1)
```

改完之后这边就直接是一个v14了

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cfd85547c4810097.png)

然后下面的函数我在IDA里面修改了一下函数名 方便更容易理解

```java
int __fastcall sub_13119B(char *a1)
{
  int result; // eax
  unsigned int v2; // ebx
  char *v3; // r15
  bool v4; // zf
  char v5; // r15
  unsigned int v6; // eax
  char *v7; // rcx
  int v8; // r8d
  char v9; // al
  int v10; // eax
  int v11; // [rsp+4h] [rbp-25Ch]
  char *v12; // [rsp+8h] [rbp-258h]
  char v13; // [rsp+2Fh] [rbp-231h] BYREF
  _BYTE v14[560]; // [rsp+30h] [rbp-230h] BYREF
  char v15; // [rsp+42Fh] [rbp+1CFh] BYREF

  result = bb_sys_open("/proc/self/maps", 0, 0);
  v2 = result;
  if ( result >= 0 )
  {
    while ( 1 )
    {
      v3 = v14;
      do
      {
        if ( (unsigned int)bb_sys_read(v2, &v13, 1u) != 1 )
          break;
        ++v3;
        v4 = v13 == 10;
        *(v3 - 1) = v13;
        if ( v4 )
          break;
      }
      while ( v3 != &v15 );
      *v3 = 0;
      if ( (_DWORD)v3 == (unsigned int)v14 )
        break;
      v5 = *a1;
      if ( !*a1 )
        return bb_sys_close(v2);
      v6 = (unsigned int)sub_13118A(a1 + 1);
      v7 = v14;
      v8 = v6;
      while ( 1 )
      {
        v9 = *v7++;
        if ( !v9 )
          break;
        if ( v9 == v5 )
        {
          if ( !v8 )
            return bb_sys_close(v2);
          v11 = v8;
          v12 = v7;
          v10 = sub_131168((__int64)v7, (__int64)(a1 + 1), v8);
          v7 = v12;
          v8 = v11;
          if ( !v10 )
            return bb_sys_close(v2);
        }
      }
    }
    bb_sys_exit(0);
    return bb_sys_close(v2);
  }
  return result;
}
```

从上往下看吧 依旧是一截一截看

打开maps 返回一个fd 再将fd赋值给v2

进入一个最外层死循环

```java
  result = bb_sys_open("/proc/self/maps", 0, 0);
  v2 = result;
  if ( result >= 0 )
  {
    while ( 1 )
    {
      v3 = v14;
      do
      {
        if ( (unsigned int)bb_sys_read(v2, &v13, 1u) != 1 )
          break;
        ++v3;
        v4 = v13 == 10;
        *(v3 - 1) = v13;
        if ( v4 )
          break;
      }
      while ( v3 != &v15 );
	  *v3 = 0;
```

内层第一个循环read取读取每次读取一个字节内容将其赋值到v13的地址

最终读取出来的结果存在v3 而v3又是指向v14的 所以v14就是最终读取出来的这一行结果

这里 `10` 是 ASCII 里的换行符 `\n` 而且按照优先级==要比=高

所以这里可以是这样v4 = (v13 == 10)

判断v13是不是换行了 将结果赋值给v4 后面则对v4判断 如果换行了就跳出内层循环

++v3;这里先让指针前进 1，\*(v3 - 1) = v13 再往前进之前的位置写入字节

所以这里\*v3 = 0;就是在写入字节的尾巴追加一个0

接着往下面看

先一个if 判断v3是不是和v14相等 如果相等说明maps内啥也没读到

```java
      if ( (_DWORD)v3 == (unsigned int)v14 )
        break;
      v5 = *a1;
      if ( !*a1 )
        return bb_sys_close(v2);
      v6 = (unsigned int)sub_13118A(a1 + 1);
      v7 = v14;
      v8 = v6;
```

看看sub_13118A

```java
_BYTE *__fastcall sub_13118A(_BYTE *a1)
{
  _BYTE *i; // rax

  for ( i = a1; *i; ++i )
    ;
  return (_BYTE *)(i - a1);
}
```

这里循环 i=a1 让指针i从起始地址开始 每次循环都去获取当前i地址的值 判断是不是0 如果不是0就继续++i看下一个地址 再解应用 直到碰到0位置 如果碰到0就说明当前的i就是当前字符串的结束地址了

最后return 的就是结束地址减去起始地址 得到的结果就是整个字符串的长度

接着往下看 子循环2 这里v7就是v14 也就是字符串的起始地址，v5是a1解引用后的值 v8是v6的值 也就是前面算的这个字符串长度的函数返回值

```java
 while ( 1 )
      {
        v9 = *v7++;
        if ( !v9 )
          break;
        if ( v9 == v5 )
        {
          if ( !v8 )
            return bb_sys_close(v2);
          v11 = v8;
          v12 = v7;
          v10 = sub_131168((__int64)v7, (__int64)(a1 + 1), v8);
          v7 = v12;
          v8 = v11;
          if ( !v10 )
            return bb_sys_close(v2);
        }
      }
    }
    bb_sys_exit(0);
    return bb_sys_close(v2);
  }
  return result;
}
```

sub_131168在前面已经分析过了 是一个字符串比较函数 如果相同就返回0 不同就返回v4-v5

a1是字符串的起始地址、

a2是sub_13119B函数的入参指针

a3是字符串的长度

这里跑了frida打印了一下看看

```java
onEnter: a3(rdx)=0xa  (十进制=10)
  a1(rdi)=0x76386e475470
               0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
76386e475470  5f 5f 62 5f 61 5f 6e 5f 67 5f 63 5f 6c 5f 65 5f  __b_a_n_g_c_l_e_
76386e475480  5f 63 68 65 63 6b 31 32 33 34 35 36 37 5f 00 41  _check1234567_.A
76386e475490  5d 48 8d 35 f7 03 00 00 ba 0a 00 00 00 4c 89 ef  ]H.5.........L..
76386e4754a0  e8 c3 fc ff ff 49 8d 7d 0a 48 8d 35 ea 03 00 00  .....I.}.H.5....
  a2(rsi)=0x76386e47588f
               0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
76386e47588f  5f 5f 62 5f 61 5f 6e 5f 67 5f 00 63 5f 6c 5f 65  __b_a_n_g_.c_l_e
76386e47589f  5f 5f 63 68 65 00 63 6b 31 32 33 34 35 36 37 5f  __che.ck1234567_
76386e4758af  00 00 00 00 01 00 00 00 d7 21 06 00 88 ba 02 00  .........!......
76386e4758bf  b0 73 11 00 00 00 00 00 b0 73 11 00 20 0d 0e 00  .s.......s.. ...
```

### 回到主线 （sub_13148F）

前面这一节赋值可以看出来v2是一个指针 而恰好又被多个不同的类型给强转 这里暂时不清楚作用

sub_131119是sys_mprotect 这里的三个参数 分别是：起始地址、长度、权限

v9就是这块内容的起始地址 长度为((v10 + (unsigned int)v2\[7\] + v7 + 4095) & 0xFFFFFFFFFFFFF000LL) - v9 权限是7即 可读可写可执行

```java
  v6 = (unsigned int)v2[9];
  v7 = (int)v2[8];
  *(_DWORD *)(v1 - 76) = v2[10];
  v8 = v7;
  v9 = v0 - (unsigned int)v2[3];
  v10 = v9 + v6;
  ((void (__fastcall *)(__int64, unsigned __int64, __int64))sub_131119)(
    v9,
    ((v10 + (unsigned int)v2[7] + v7 + 4095) & 0xFFFFFFFFFFFFF000LL) - v9,
    7);
```

再去看sub_131674函数

这里有个坑 这部分其实是重新写的 写了一大堆踩坑分析 在重写之前是分析错了。主要问题再入参这。没有仔细看直接就跟sub_13168F过去了导致后面几个小时一直兜圈子 不要粗心啊 呀咩咯

```java
__int64 __fastcall sub_131674(__int64 a1, __int64 a2, __int64 a3, unsigned int a4)
{
  _BYTE v5[4]; // [rsp+Ch] [rbp-4h] BYREF

  return sub_13168F(a2, a4, a1, v5);
}
```

先把sub_131674函数的四个入参打印出来

这里信息量挺大的

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/010dc545f71187e6.png)

首先就是两个入参

a1=0x76386e377a88

a2=0x76388bd9e000

不同的地址 相同的内容

到底是谁拷贝谁呢？去前面的mmap看看

mmap=a2

a2是\*(\_QWORD \*)(v1 - 72) 所以说v10是被复制出来的 然后就是a1的地址在函数结束后内容发生了变化了 为什么发生变化呢 好难猜阿 进去看看吧

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c248288766a8ee0.png)

sub_13168F 只需要关注第一个入参 坑点来了

这里sub_13168F 的第一个入参并非sub_131674的第一个入参

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b43037044688003e.png)

### 解压分析

ps：这部分分析给我看麻了，不建议人工分析，这种活适合丢给AI，我只是想知道手法，所以想一步一步跟着程序走看看。不感兴趣的可以直接看分析结果。

在sub_13168F 函数内是第三个参数 所以在sub_13168F 函数内只需要追着第三个入参走就行了 看他都被做了什么操作

这边先把sub_13168F 函数四个入参重新hook打印一遍方便后续跟踪分析

```java
==== sub_13168F onEnter ====
a1(rdi) = 0x76388c08e000   
               0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
76388c08e000  90 00 7e ff 35 5a 60 0e f9 0b 25 5c ac 90 00 ef  ..~.5Z`...%\....
76388c08e010  13 1e 68 7e 34 e9 e0 ff db 00 25 52 1e cf 01 d0  ..h~4.....%R....
76388c08e020  23 4a 3c 02 f2 c0 33 42 cf 03 b0 23 3a 3c 04 f2  #J<...3B...#:<..
76388c08e030  a0 33 32 cf 05 90 23 2a 3c 06 f2 80 33 22 cf 07  .32...#*<...3"..
a2(rsi) = 0x61973   (十进制=399731)   
a3(rdx) = 0x76386e3f0a88   
  [a3 进入时初值]:
               0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
76386e3f0a88  90 00 7e ff 35 5a 60 0e f9 0b 25 5c ac 90 00 ef  ..~.5Z`...%\....
76386e3f0a98  13 1e 68 7e 34 e9 e0 ff db 00 25 52 1e cf 01 d0  ..h~4.....%R....
76386e3f0aa8  23 4a 3c 02 f2 c0 33 42 cf 03 b0 23 3a 3c 04 f2  #J<...3B...#:<..
76386e3f0ab8  a0 33 32 cf 05 90 23 2a 3c 06 f2 80 33 22 cf 07  .32...#*<...3"..
76386e3f0ac8  70 23 1a 3c 08 f2 60 33 12 cf 09 50 23 0a 3c 0a  p#.<..`3...P#.<.
76386e3f0ad8  f2 40 33 02 cf 0b 30 23 fa 9a 5f 0c 79 20 19 f2  .@3...0#.._.y ..
76386e3f0ae8  e7 0d 91 10 9e ea 0e 79 00 19 e2 e7 0f cf f0 fe  .......y........
76386e3f0af8  da 3c 10 12 ff cc 1f d2 f0 11 4b ff 1f 33 ca c1  .<........K..3..
a4(rcx) = 0x7ffce42511c4  
---- sub_13168F onLeave ----
ret = 0x0  (十进制=0) 
*a4  = 920864  (0xe0d20)
  [a3]:
               0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
76386e3f0a88  00 00 00 00 00 00 00 00 ff 35 5a 60 0e 00 ff 25  .........5Z`...%
76386e3f0a98  5c 60 0e 00 90 90 90 90 ff 25 5a 60 0e 00 68 00  \`.......%Z`..h.
76386e3f0aa8  00 00 00 e9 e0 ff ff ff ff 25 52 60 0e 00 68 01  .........%R`..h.
76386e3f0ab8  00 00 00 e9 d0 ff ff ff ff 25 4a 60 0e 00 68 02  .........%J`..h.
76386e3f0ac8  00 00 00 e9 c0 ff ff ff ff 25 42 60 0e 00 68 03  .........%B`..h.
76386e3f0ad8  00 00 00 e9 b0 ff ff ff ff 25 3a 60 0e 00 68 04  .........%:`..h.
76386e3f0ae8  00 00 00 e9 a0 ff ff ff ff 25 32 60 0e 00 68 05  .........%2`..h.
76386e3f0af8  00 00 00 e9 90 ff ff ff ff 25 2a 60 0e 00 68 06  .........%*`..h.
```

依旧是一截一截的分析

入参的话第一个是一个地址（mmap出来的地址） 第二个大概率是个得用十进制解析 也可能十六进制是个密钥什么的 暂时不清楚 第三个也是一个地址（被复制出来的地址） 第四个也是一个地址

先从这里开始

唯一比较有用的信息就是最外层这个循环的退出条件是个空的，那么只能依赖break退出 不然就是死循环了，其次i的赋值是来自v28+v30

```java
  v4 = 1;
  v5 = 0;
  v6 = 0;
  for ( i = 0; ; i = v28 + v30 )
```

再看下面这个内层循环

v6初值为0，v6& 0x7F = 0 走else

v8=v5++ 先把0赋值给v8 此时v8=0 再自加 v5=1

然后v6=2 \* \* (unsigned \__int8 \*)(a1 + v8) + 1;这里a1是地址

a1被当成基地址，v8（来自v5）当作下标，从里面读取字节，这里其实就知道v5的含义了 当作下标且每用一次就++ 说明是从a1地址顺序后读

v6 = 2 \* 取出字节 +1

```java
while ( 1 )
{
    if ( (v6 & 0x7F) != 0 )
    {
        v6 *= 2;
    }
    else
    {
        v8 = v5++;
        v6 = 2 * *(unsigned __int8 *)(a1 + v8) + 1;
    }
```

再往下看

判断v6 & 0x100 ，0x100 写成二进制就是 1 0000 0000 就是第九个位 叫做bit8 最低位是bit0 ，bit8是1 ，其他位是0。

v6 & 0x100 的意思是：只看 v6 的d

所以这里就是判断当前字节的最高位是0还是1 如果是0 就跳出循环，如果是1 那就继续往下走

```java
      if ( (v6 & 0x100) == 0 )
        break;
      v9 = v5++;
      v10 = *(_BYTE *)(a1 + v9);
      v11 = i++;
      *(_BYTE *)(a3 + v11) = v10;
    }
```

假设最高位是1 ，继续往下走 ，现在v5是1，所以v9拿到1，v5变成2。即：v5=2，v9=1

v10 = 对a1后边的第一个字节的地址。从这里读一个字节 存入v10。这里叫做B1（a1位置的第一个字节）

v10 = B1。

v11 = i++

现在i是0，所以v11拿到0，i变成1

v11 = 0，i=1。

\*(\_BYTE \*)(a3 + v11) = v10;

a3+v11是a3+0，也就是a3这个地址。把v10写进a3这个位置

结果就是a3的第0个字节=B1

梳理一下这个循环。

第一：a1是一个从头往后一个字节一个字节的读的数据区，读到哪里由v5记录，每次读取一个字节v5就+1

第二：a3是一个从头往后一个字节一个字节的写的数据区，写道哪里由i记录，每次写入一个字节i就+1

第三：v6这个变量的作用是：从a1读一个字节，然后一个位一个位的把这个字节里面的位取出来检查，取位的方法靠v6\*=2（左移一位）把要看的位顶到bit8。再用&100把bit8单独拿出来看

第四：检查出来的这个位如果是1，程序就从a1再读一个字节，原样写入a3，如果是0，就跳出这个循环。

* * *

接着往下看

进入这个循环得前面的那个while里面读取到

if ( (v6 & 0x100) == 0 )  
break; 出来才走到的

所以进入当前循环的时候，v5是当前的读游标（前面读到哪就是几），v6是当时那个位的缓冲变量（里面剩下一些没有读完的位），i是当前写游标。v4还是1（从函数开头到现在没被修改过）

```java
    for ( j = 1; ; j = 2 * v15 - 2 + ((v6 >> 8) & 1) )
    {
      if ( (v6 & 0x7F) != 0 )
      {
        v13 = 2 * v6;
      }
      else
      {
        v14 = v5++;
        v13 = 2 * *(unsigned __int8 *)(a1 + v14) + 1;
      }
      v15 = 2 * j + ((v13 >> 8) & 1);
      if ( (v13 & 0x7F) != 0 )
      {
        v16 = 2 * v13;
      }
      else
      {
        v17 = v5++;
        v16 = 2 * *(unsigned __int8 *)(a1 + v17) + 1;
      }
      if ( (v16 & 0x100) != 0 )
        break;
      if ( (v16 & 0x7F) != 0 )
      {
        v6 = 2 * v16;
      }
      else
      {
        v18 = v5++;
        v6 = 2 * *(unsigned __int8 *)(a1 + v18) + 1;
      }
    }
```

先看for，这里j=1，中间的条件又是空的。第三部分j = 2 \* v15 - 2 + （(v6 >> 8) & 1)

循环体第一句if ( (v6 & 0x7F)!= 0 )

这里跟上面一样，看v6的最低七位是不是全为空。

v6 & 0x7F 不等于0 ， 说明v6里还有没读完的位，走if。

v6 & 0x7F 等于0，说明位读完了，走else去a1取新字节。

走if的情况：v13=2*v6。将v6左移一位然后赋值给v13

走else的情况：把当前v5的值给v14，然后v5加1，也就是从a1读取下一个字节的位置。

v13 = 2 \* \*(unsigned \__int8 \*)(a1 + v14) + 1;

从a1读取一个新的字节，2\*字节+1 装入v13。和之前装入v6是同一套方法（左移一位、把最低为放标记位1）。区别就是这里用v13

这里就是：取出下一个位，让他出现在v13的bit8上。不管是从v6剩下的位里面挪一个出来还是从a1里面新读一个字节，结果都是v13的bit8位置现在放着要读取的这个位。

再往后，循环体第二句

v15 = 2 \* j + ((v13 >> 8) & 1); 把v13整体往右挪动8位，原来再bit8的那一位，挪完就到了bit0（最低位）。然后&1 只保留最低为bit0。这里就是把v13的bit8那一位单独取出来，得到一个0或者1的数。

前面这里v13上面的bit8就是刚取出来的那个位，所以v13>>8&1就是刚读出来的这个位的值，0或者1。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/12f08042f67b6eee.png)

v15=2*j+那个位：把j乘以2，再加上刚读出来的那个位（0或1）。结果放进v15。

一个数值乘以2，等于在二进制里边把他整体左移一位，末尾空出来一个位置，再加上一个0或者1，就是把这个新读取出来的位填进那个空出来的末位，所以v15=2*j+位的意思就是在j已有的二进制位后面，追加一个新的位。

后面的代码基本上都是这个取位的操作

&0x7F判断要不要换字节、\*2左移把位顶到bit8、看bit拿出这个位。只是同一套东西换了几个名字。

所以直接看这三次取位各自拿去干啥了

第一次就是通过v15=2*j+位 追加进那个正在拼的那个数里面。

第二次就是if ( (v16 & 0x100)!= 0 ) break; 当作停止开关，如果是1就跳出整个for

第三次就是 存入v6，然后在for循环头部 j = 2 \* v15 - 2 + ((v6 >> 8) & 1) 给他取出来。参与进下一论的j。

合计起来就是：一轮一轮读取位往一个数里面拼。每一轮读三个位置，其中两个位是有用的数据位（第一个和第三个）中间的那个位是负责停止的。

* * *

继续往下看

这里是从for ( j = 1;; j = 2 \* v15 - 2 + ((v6 >> 8) & 1) ) 这个循环里面break出来的。v15是那个循环里面一位一位拼出来的数，v5是当前读的游标，v6、v16是位缓冲的当前状态

```java
    v19 = v5;
    if ( v15 != 2 )
      break;
    if ( (v16 & 0x7F) != 0 )
    {
      v16 *= 2;
    }
    else
    {
      ++v5;
      v16 = 2 * *(unsigned __int8 *)(a1 + v19) + 1;
    }
    v20 = (v16 >> 8) & 1;
```

这里先把v5存入v19，

然后把v15跟2去作比较。判断是不是不等于2。如果v15不等于2，执行break。这里的break是最外层的for循环了 如果break就直接不在任何内存循环里面了，如果break就直接走到程序尾巴了。

如果v15等于2，那就不执行break 继续往下走。所以这里的v15==2应该是一种特殊情况。

然后这里又是老套路

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8803ddfb7f520ddd.png)

不同的是这里是++5，然后读取的字节的时候用到的是a1+v19，不是v5。

然后v20 = （v16>>8）&1 把v16的bit8单独取出来，得到0或1。

前面已经把一个位放到了v16的bit8。所以这里就是把刚取出来的那个位的值（0或1）存入v20。

* * *

继续往下看

这里还是取位的模板。这里的结果存放在v6的bit8上

```java
LABEL_26:
    if ( (v16 & 0x7F) != 0 )
    {
      v6 = 2 * v16;
    }
    else
    {
      v22 = v5++;
      v6 = 2 * *(unsigned __int8 *)(a1 + v22) + 1;
    }
    v23 = 2 * v20 + ((v6 >> 8) & 1);
```

然后又是这个 v23 = 2 \* v20 + ((v6 >> 8) & 1); 取出v6的bit8也就是刚刚读到的那个位，得到0或1.

2*v20+位：这就是往数后面追加一位，v20是打底的值，乘以2腾出来末位，把新读的位填进末位。结果放进v23.

所以这里就是以v20为起点，在他后面追加一个新读的位，拼成v23。

v20 是 0 或 1，刚读的位也是 0 或 1，那 v23 = 2*v20 + 位 能取的值：

v20=0，位=0：v23 = 0

v20=0，位=1：v23 = 1

v20=1，位=0：v23 = 2

v20=1，位=1：v23 = 3

所以 v23 现在是 0、1、2、3 里的一个。这四个值是两个位拼出来的

* * *

继续往下看

```java
    if ( !v23 )
    {
      v24 = 1;
      do
      {
        if ( (v6 & 0x7F) != 0 )
        {
          v25 = 2 * v6;
        }
        else
        {
          v26 = v5++;
          v25 = 2 * *(unsigned __int8 *)(a1 + v26) + 1;
        }
        v24 = 2 * v24 + ((v25 >> 8) & 1);
        if ( (v25 & 0x7F) != 0 )
        {
          v6 = 2 * v25;
        }
        else
        {
          v27 = v5++;
          v6 = 2 * *(unsigned __int8 *)(a1 + v27) + 1;
        }
      }
      while ( (v6 & 0x100) == 0 );
      v23 = v24 + 2;
    }
```

第一句就是判断v23是否等于0。

如果等于0就进入 do while

先把v24设成1，作为待会拼数的起点，这个1是打底的值。

循环体内依旧是熟悉的取位+拼数。

取一个位到v25的bit8 再把这个位追加进v24

再取一个位到v6的bit8

循环条件：while（（v6 & 0x100）==0）

这里就是判断v6的bit8是不是等于0 如果是0就继续 如果是1就停止循环。

出循环后v23=v24+2 拼完的数在v24里面再加上2 覆盖回v23。

* * *

继续往下看

v23是刚刚拼玩的那个数（值最少是1）。v4是函数开头设为1、到现在都没被修改过。i是a3的写游标，记录着a3现在写到第几个字节了。

```java
    v28 = (v4 > 0x500) + v23;
    v29 = i;
    v30 = i + 1;
    v31 = (_BYTE *)(a3 + v29 - v4);
    *(_BYTE *)(a3 + v29) = *v31;
    v32 = 0;
    do
    {
      v33 = v31[v32 + 1];
      v34 = v30 + (unsigned int)v32++;
      *(_BYTE *)(a3 + v34) = v33;
    }
    while ( v28 != (_DWORD)v32 );
```

第一句判断v4是不是大于0x500（十进制1280）这里v4是1，值为0 ，然后用0+v23将结果放入v28.

v29=i 把当前游标存入v29一份。v30=i+1 v30就是游标的下一个位置。

v31 = (\_BYTE \*)(a3 + v29 - v4);

a3是输出缓冲区的起始地址。v29是当前写位置（等于i）。所以a3+v29就是a3里当前要写的那个位置的地址。

a3+v29-v4：在当前要写的位置的基础上往回退v4个字节，现在v4是1，所以a3+v29-1 就是当前写位置往前退一个字节的地址，也就是上一个刚写进去的字节的地址。这个退回去的地址存进v31。

然后\*(\_BYTE \*)(a3 + v29) = \*v31;

\*v31：v31指向刚刚才退回去的那个位置， \*v31就是读那个位置的字节。

a3+v29：当前写位置。\*(a3 + v29) = \*v31:把退回去的那个位置的字节，读出来，写到当前写位置。

就是把前面已经写过的一个字节，复制一份到现在的位置。

从输出区自己前面已经写好的地方，往当前位置拷贝数据。不是从a1（输入）读，是从a3（输出）自己身上拷。

然后给v32赋值0，后进入do-while

v33=v31\[v32+1\]：v31就是退回去的那个起始地址。v31\[v32+1\]就是从v31往后数第v32+1个字节。第一轮v32=0，也就是v3\[1\]，即退回去位置的下一个字节。把他读出来存入v33。

v34=v30+v32++：v30是当前写位置的下一格。v30+v32算出要写的位置。然后v32++后置自增，v32加1。第一轮v34=v30+0=v30。

\*(a3 + v34) = v33;把v33写到a3+v34这个位置。

循环条件while（v28！=v32）：v32每轮加1，一直循环到v32等于v28才停。也就是这个循环总共跑v28轮，拷贝v28个字节。

这里就是从a3里前面已经写好的地址，往当前位置赋值一串字节。

从哪里开始复制：当前写位置往回退v4个字节的地址（a3+v29-v4）

复制多长：v28个字节（v28基本等于前面拼出来的v23）

复制到哪里：a3的当前写位置往后。

* * *

继续往下分析

```java
  ++v5;
  v21 = ((v15 + 16777213) << 8) + *(unsigned __int8 *)(a1 + v19);
  if ( v21 != -1 )
  {
    v4 = (v21 >> 1) + 1;
    v20 = !(*(unsigned __int8 *)(a1 + v19) & 1);
    goto LABEL_26;
  }
  result = 0;
  *a4 = i;
  if ( v5 != a2 )
    return v5 < a2 ? -205 : -201;
  return result;
```

这段是从if（v15！=2）break，跳出后到达的代码段。也就是当v15不等于2的时候就跳出来到这里。

先给v5自增，然后16777213 这个数换成十六进制是 0xFFFFFD。所以 v15 + 16777213 就是 v15 + 0xFFFFFD。

(v15 +0xFFFFFD)<< 8：把这个和往左移8 位。左移8 位等于乘以256，也就是在二进制末尾补 8个0，腾出最低的一个字节位置。

\*(a1 + v19)：用v19(之前存的读位置)当下标，从 a1 读一个字节，得到0到255 的一个数。

((v15 + 0xFFFFFD) << 8) + \*(a1 + v19)：把上面腾出来的最低字节位置，填上这个刚读的字节。结果放进v21。  
所以 v21 是这么拼出来的：高位部分是 v15 +0xFFFFFD，低 8 位是从 a1 读的一个字节。两块拼成一个数。

然后第三句判断v21是不是不等于-1。这里要判断v21是不是不等于0xFFFFFFFF（全1）

这就是一个结束标志判断：当拼出来的v21 是全1(0xFFFFFFFF)时，代表数据到头了，解压结束；否则还没完，继续处理。

v4 = (v21 >> 1) + 1; 这里把v21往右移一位。等于除以2（去掉最低位）。（v21>>1）+1：右移一位后加1，结果存进v4.

这里是给v4赋值。前面v4是往回退的距离，而且v4从头到尾没有被赋值过 ，第一次被修改激就是在这。这里就是根据刚拼出来的v21.算出新的回退距离v4。

v20 =!(\*(unsigned \__int8 \*)(a1 + v19) & 1);这里还是用v19读a1的字节然后&1（取这个字节的最低位置bit0）得到1或0。然后逻辑非 取反，将结果存入v20。

然后就goto LABEL_26;

当前v21全是1就走到这里收尾了。

给result赋值为0，然后\*a4=i，a4是当前函数的第四个参数，是一个指针，i是写游标，现在等于总共写进a3的字节数量。这里把写入的总字节数通过a4这个指针写回给调用者。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8d7ee7a327ef176b.png)

if（v5！=a2）v5是读游标，现在等于总共从a1读了多少字节。a2是函数第二个参数，是输入数据的长度。这里判断读掉的字节数v5是不是刚好等于输入长度的a2.如果不相等说明读的量对不上，出错了，走return v5<a2?-205:-201，读少了返回-205，读多了返回-201。如果刚好相等 那就是正好读完了，就return result 返回0 表示成功。

这里的return结果就是0，刚刚好。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b12056a3409dae91.png)

手工还原了一下验证了一下没问题。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ee1cbcf9c1de38ff.png)

这里这个函数就是一个解压函数，输入是a1（压缩数据）、a2（压缩数据长度），输出写到a3，解出来的总长度通过a4写回。

把a1当作一条比特流，一位一位的读取，靠着这些位来决定怎么还原数据，还原方式有两个交替进行：

第一个就是直接搬字节，读取某个控制位是1，就从a1原样搬一个字节到a3。

另一个就是重复拷贝，从比特流里面读取一个v4（距离）和一个v23（长度），然后从a3自己前面已经还原好的数据里面，退回去v4个字节，往当前位置拷贝v23个字节。

### 异或

这里整个函数就已经分析完了 接着主线继续往下看

在修改文章之前就是绕到这里面去了，这里对v10进行异或 v8即是循环条件也是异或对象。后面经过hook验证这个异或不会执行。所以这里就跳过这部分 直接去看sub_1312B1函数

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/27556e99b0bbcb5e.png)

### 重定位

sub_131128是sys_mmap

这个函数是壳自带的私有重定位执行器，跑了几轮hook验证过这个部分纯空跑无作用。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/170411a0d7ab8897.png)

总结一下这个init_proc都干了什么，首先就是调用sub_1315AD函数通过mmap开辟了一块匿名内存，把壳自身的一段字节（壳so本体的一部分）搬进去。

然后调用sub_13148F也就是主线函数，这里边干的活就比较多了，首先就是sub_131168函数进行魔术校验，通过会去读取maps做字符串检测。

第二个就是开启RWX，调 sub_131119函数把模块代码区的权限改成可读可写可执行，为下面的解密做准备。

第三个就是解压了，调用sub_131674 → sub_13168F。把一块压缩数据解开。

第四个是异或，但是这里经过hook测试不执行，可能是我hook的有问题吧

第五个就是重定位调sub_1312B1进行重定位，但是这里也是不执行，不能说不执行吧，函数是进去了但是入参有问题导致空跑。

init_proc 最后 munmap 掉压缩源数据

* * *

有一个补充点，这个补充点是在后面so修复的时候发现的。

打印 sub_131674 的四个入参——a1=0x76386e377a88(落在 libDexHelper 模块自身地址区间)、a2=0x76388bd9e000(即前面 sub_1315AD mmap 出来的匿名内存)、a3=0xe0d20(解压后输出长度)、a4=0x61973(压缩输入长度)。onEnter 时 a1 与 a2 内容完全一致,说明 a2 是壳 so 自身那段压缩数据的副本;onLeave 时 a1 的内容从压缩数据变成了解压结果,a2 不变。由此判定:a2 是压缩源(副本),a1 是解压输出目标(壳 so 自身代码块)，据是onLeave时刻谁的内容变了。所以壳是在给自己解密。

必须 mmap 一块独立内存:硬原因是解压的输入与输出不能共用同一块内存,否则输出增长会覆盖尚未读取的输入(自我覆盖),解压崩坏;附带好处是输出直接落在壳自身模块的正确偏移(解密代码即就位)、且压缩源副本用完即 munmap

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/203948b4b7bfc403.png)

## dump&修复壳so

这里已经知道在哪里解密了就直接把解密后的so dump下来修复就可以了

## initarray分析

前面计算过initarray的地址 这里直接跳转过去看看

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70898099f5cd48ce.png)

跟进0x111460

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e007a254d40752aa.png)

发现都是解密好了的，但是字符串被编码，解码一下

```java
int sub_2E4C0()
{
  _QWORD *v0; // rsi
  void (*v1)(void *); // r15

  v0 = obj;
  *(_OWORD *)obj = 0;
  v0[2] = 0;
  __cxa_atexit(func, v0, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A240, (__int64)"bU1haW5UaHJlYWQ=");// mMainThread
  v1 = lpfunc;
  __cxa_atexit(lpfunc, &unk_11A240, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A258, (__int64)"YW5kcm9pZC5hcHAuQWN0aXZpdHlUaHJlYWQ=");// android.app.ActivityThread
  __cxa_atexit(v1, &unk_11A258, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A270, (__int64)"YW5kcm9pZC5jb250ZW50LkNvbnRlbnRQcm92aWRlcg==");// android.content.ContentProvider
  __cxa_atexit(v1, &unk_11A270, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A288, (__int64)"bUNvbnRleHQ=");// mContext
  __cxa_atexit(v1, &unk_11A288, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A2A0, (__int64)"bUluaXRpYWxBcHBsaWNhdGlvbg==");// mInitialApplication
  __cxa_atexit(v1, &unk_11A2A0, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A2B8, (__int64)"bUFsbEFwcGxpY2F0aW9ucw==");// mAllApplications
  __cxa_atexit(v1, &unk_11A2B8, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A2D0, (__int64)"bVBhY2thZ2VJbmZv");// mPackageInfo
  __cxa_atexit(v1, &unk_11A2D0, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A2E8, (__int64)"YW5kcm9pZC5hcHAuTG9hZGVkQXBr");// android.app.LoadedApk
  __cxa_atexit(v1, &unk_11A2E8, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A300, (__int64)"bUFwcGxpY2F0aW9u");// mApplication
  __cxa_atexit(v1, &unk_11A300, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A318, (__int64)"bUFwcGxpY2F0aW9uSW5mbw==");// mApplicationInfo
  __cxa_atexit(v1, &unk_11A318, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A330, (__int64)"bVByb3ZpZGVyTWFw");// mProviderMap
  __cxa_atexit(v1, &unk_11A330, &off_10DFC0);
  sub_2BC20((__int64)&unk_11A348, (__int64)"bUxvY2FsUHJvdmlkZXI=");// mLocalProvider
  return __cxa_atexit(v1, &unk_11A348, &off_10DFC0);
}
```

随便找一个地址交叉引用看看哪里读取了这些字符串

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/50896e2845767a4d.png)

跟进看看sub_3CBB0

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/33d0d02dda574b86.png)

这里拿了大量的字段名与java类名，

从上往下简单看看

拿到类名、方法名、以及签名

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1db31eefc1a56e30.png)

跟进看看，这些参数拿过去干嘛了

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c58b539cba557c66.png)

在这里做了解析类名/方法名/签名 拿到 methodID 存在 v13 结构体里

\*(v13+16) 取出 methodID，然后 CallObjectMethod(env, 对象, methodID, 参数...) 真正执行 Java 方法

不继续深入跟了，这里就是调用getClass()

回到sub_3CBB0接着往后看

把 LoadedApk 里的 mApplication 改成真实 App。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/08be544b83b32dbf.png)

把类名也改成真实的

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f1b0958643c108e3.png)

说白了 sub_3CBB0 就是把系统里(ActivityThread、LoadedApk)所有指向占位 Application的引用全部改成真实 Application。

这里去看看谁调用的他

## JNI_OnLoad

来到了JNI_OnLoad

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ca669ec6bbae9b1c.png)

这里边有一千多行，干的事也确实不少，简单看看吧

这部分做结构体初始化 + 固定标识

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/65fb13eb9ebf9a1e.png)

存内部类+读包名

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/87cfa41ee0daf3fd.png)

读系统属性 ro.build.version.sdk,atoi 转成整数

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9715336556356666.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b69d7bc02468dc72.png)

识别SDK版本

Android 12+ 查 ART APEX 版本

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/846398e6909ea31f.png)

判断是ART 还是 Dalvik

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2ce8424fcc877cfc.png)

不知道，没看明白干嘛的

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c598a86f538a61a5.png)

先看ro. product. cpu. abi 含不含x86

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6e2b02d4f12d3a62.png)

如果不含那就再去读取libc的ELF头

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d7886ebf6ff7eaee.png)

## 定位检测

由于我的设备是模拟器即使不hook也会导致app闪退，这里先去定位是哪个函数导致的app闪退

当 App 发生崩溃（Crash）时，自动捕获异常，并将导致崩溃的那块内存区域 Dump（转储）到手机本地文件中

```java
'use strict';
const PKG = 'com.starbucks.cn';
const OUT_DIR = '/data/data/' + PKG + '/files';
const CRASH_OFF = 0xfbf60;

function dumpRange(base, size, fname) {
    let f;
    try { f = new File(fname, 'wb'); } catch (e) { console.log('建文件失败:' + e); return 0; }
    const CHUNK = 0x1000; let w = 0, p = base, rem = size;
    while (rem > 0) {
        const c = rem > CHUNK ? CHUNK : rem;
        let b; try { b = p.readByteArray(c); if (!b) b = new ArrayBuffer(c); } catch (e) { b = new ArrayBuffer(c); }
        f.write(b); w += c; p = p.add(c); rem -= c;
    }
    f.flush(); f.close(); return w;
}

Process.setExceptionHandler(function (details) {
    const pc = details.context.pc;
    console.log('\n[异常] type=' + details.type + ' faultAddr=' + details.address + ' pc=' + pc);
    const r = Process.findRangeByAddress(pc);
    if (!r) { console.log('[!] pc 无 range'); return false; }
    console.log('[*] 崩溃块 base=' + r.base + ' size=0x' + r.size.toString(16) + ' prot=' + r.protection);
    console.log('[*] pc 在块内偏移 = 0x' + pc.sub(r.base).toString(16));
    const fname = OUT_DIR + '/crashblk_' + r.base.toString(16) + '_' + r.size.toString(16) + '.bin';
    const wr = dumpRange(r.base, r.size, fname);
    console.log('[+] dump -> ' + fname + '  0x' + wr.toString(16) + ' 字节');
    console.log('[*] IDA: metapc/x86-64, base=0, G 跳到 pc 块内偏移那个值');
    try { console.log(hexdump(pc.sub(0x30), { length: 0x70, ansi: false })); } catch (e) {}
    return false;   // 不吞,让它照常崩,dump 已经拿到
});
console.log('[+] 异常处理器已装, 等崩溃时自动 dump 崩溃块');
```

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b971d25e5342005.png)

其实不用打开这个dump下来的文件了，这里写的很清楚，就是检测到了root环境。那么只要对这个字符串进行监听不就好了

```java
'use strict';
const TARGET_SO = 'libDexHelper-x86.so';
const NEEDLES = ['/su/bin/', '/system/bin/su', '/system/xbin/su', '/magisk'];

function soOff(addr) {
    const m = Process.findModuleByName(TARGET_SO);
    if (m && addr.compare(m.base) >= 0 && addr.compare(m.base.add(m.size)) < 0)
        return 'so+0x' + addr.sub(m.base).toString(16);
    const r = Process.findRangeByAddress(addr);
    if (r && r.file) return (r.file.path.split('/').pop()) + '+0x' + addr.sub(r.base).toString(16);
    return addr.toString();
}

function findStringInMemory(needle) {
    const hits = [];
    // 扫可读的匿名/文件页
    const ranges = Process.enumerateRanges('r--')
        .concat(Process.enumerateRanges('r-x'))
        .concat(Process.enumerateRanges('rw-'))
        .concat(Process.enumerateRanges('rwx'));
    const pattern = Array.from(needle).map(c => ('0'+c.charCodeAt(0).toString(16)).slice(-2)).join(' ');
    ranges.forEach(function (r) {
        try {
            Memory.scanSync(r.base, r.size, pattern).forEach(function (m) {
                hits.push(m.address);
            });
        } catch (e) {}
    });
    return hits;
}

function setupMonitor() {
    const pages = {};   // 去重: 一个页只加一次
    NEEDLES.forEach(function (needle) {
        const hits = findStringInMemory(needle);
        hits.forEach(function (addr) {
            console.log('[found] "' + needle + '" @ ' + addr + '  (' + soOff(addr) + ')');
            const pageBase = addr.and(ptr('0xfffffffffffff000'));
            pages[pageBase.toString()] = pageBase;
        });
    });

    const ranges = Object.keys(pages).map(function (k) {
        return { base: pages[k], size: 0x1000 };
    });
    if (ranges.length === 0) {
        console.log('[!] 没找到目标字符串, 可能还没解密/映射, 稍后重试 rpc.exports.rescan()');
        return;
    }
    console.log('[+] 对 ' + ranges.length + ' 个页设访问监控');
    MemoryAccessMonitor.enable(ranges, {
        onAccess: function (details) {
            console.log('\n[命中] ' + details.operation + ' @ ' + details.address +
                        '  from ' + details.from + ' (' + soOff(details.from) + ')');
            try {
                const bt = Thread.backtrace(this.context, Backtracer.ACCURATE)
                    .slice(0, 10).map(soOff).join('\n    ');
                console.log('    ' + bt);
            } catch (e) {
                console.log('    (backtrace 不可用: ' + e + ')');
            }
        }
    });
}

const cc = Process.findModuleByName('linker64').enumerateSymbols()
    .find(s => s.name.indexOf('call_constructor') !== -1);
let done = false;
Interceptor.attach(cc.address, {
    onEnter: function () {
        if (done) return;
        const m = Process.findModuleByName(TARGET_SO);
        if (m) { done = true; setTimeout(setupMonitor, 0); }
    }
});

rpc.exports = { rescan: setupMonitor };
console.log('[+] 等待 so 加载后扫描 root 字符串并下内存监控...');
```

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/568523b3ecd9cad5.png)

这里其实已经打开突破口了，往这里追踪就行。

```java
[found] "/su/bin/" @ 0x76386e594de1  (so+0x4ede1)
```

其实如果这个脚本扫描不到也没关系，可以通过对so的指令进行静态扫描，就比如说

```java
mov     eax, 3Ch   == sys_exit
```

这里就是对so的指令的进行静态扫描 找到底层的这些函数 然后对其地址进行hook 看都有谁调用了也能打开突破口

## sub_4EB80 检测可疑路径

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aa60fcafa0cbc813.png)

这里面有一大堆明文字符串，直接跟着v63去找就行了

```java
sub_2FCA0((unsigned int)s, 128, (unsigned int)&v58, (unsigned int)v63, v16, v20);
```

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a9963542e5108fa6.png)

跟去看看sub_2FCA0这个函数

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8667da2b5c655a90.png)

这里是一个snprintf 的封装

再去看看

他这里一直拿 if ( access(s\[0\].m128i_i8, 0) ) 做判断,s 是来自 sub_2FCA0 拼凑出来的路径。access 的返回值是存在返回 0、不存在返回非 0,所以 if(access(...)) 成立时代表该路径不存在,才会继续往下嵌套查下一个。简单说,这里是在逐个检查多个 su 路径是否存在只要有任意一个存在(access 返回 0,if 不成立),就会中断嵌套并最终触发自毁;只有所有路径都不存在时,才层层深入把标志位置 1,放行。

在末尾这里判断v13是否等于1，不等于就goto LABEL_67

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/067cb01e0a023ad4.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/730c79f8efce8db4.png)

这里不往深处跟进了，往前找，看是谁发起的这个函数。

## 解密dex & 环境异常检测

这里调用者是sub_34130函数，这个函数也很大很大，有四千多行。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed8435aea5e143e0.png)

粗略了扫了一眼，大概率在这里对dex进行解密且同时对环境进行检测的，逐个函数分析吧她这里整齐摆放那么一排函数调用，大概率都是对异常进行做检测的，可以逐个点进去简单看看干嘛的。

## sub_4E880 检测maps字符串特征&扫描端口

先来看这个吧sub_4E880，代码不多

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ac9c5903a3e69dd.png)

这里不深入一个一个看了，我粗略的带了一眼。启动一个循环然后去打开/proc/self/maps 逐行扫描库名称是否包含某个字符串，以及是不是ELF开头，如果都符合就标记，然后会去读取这块内存去找有没有特征字符串。

有意思的是这里，扫描 本地 20000-30001 端口。尝试握手或者发送WebSocket请求。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/046d864889711c91.png)

## sub_4FBC0 ART是否处于强制解释执行&libart.so内部私有符号可见性

这里字符串貌似都是加密的，但是依旧是一轮检查，如果不符合要求就goto LABEL_22

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5aa23e9762c51f41.png)

而这里又会来到这个sub_2F010函数

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/936c31cf98f41162.png)

sub_4FBC0函数这里，通过检查 CLASSPATH 环境变量、ART 虚拟机调试属性以及 libart.so 内部私有符号的可见性，来综合推断当前进程是否处于被调试、Hook 篡改或非标准运行环境中。

## sub_50C30 模拟器检测

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/db737b9c58d5a808.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2055c85f9ff5d29d.png)

依旧检测到就跳转到这里

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2ecd6a0519ef998b.png)

## sub_52100 Inline Hook & so 导出表字符串匹配hook框架

这里通过遍历linker的符号表，然后做字符串匹配，找到符号的内存地址并且存到全局变量中

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/de37caa808e35766.png)

这里是对dlopen进行Inline Hook，并且传入了一个回调函数进去。

pS_5S5ISlSISOS5SISl5IS_S0SIS_Sl5SS55lSISl5_5SS05_5lSISISOSOS_SI5I这个函数实现的Inline Hook方法感兴趣的可以自己去看看，这里不深入看了。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/201cd59bae54b615.png)

这里来看sub_57C70函数，这里就是检测一大堆hook框架，通过扫描 SO 文件的导出符号表去对这些字符串进行匹配

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d2cc4441b32534a.png)

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/367d19e643aed2e2.png)

如果找到了又跳过来。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/733c06df1a35f1e6.png)

## 第一个线程函数分析 start_routine

这里v156 = malloc(1u);申请1个字节的内存，然后把154的值赋值进去

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c6dd975f6c527f61.png)

而154来自这里

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/88eaa5fe295e6625.png)

跟入start_routine看看

这里先从a1取出来值赋值给v1 v1在后面的死循环用得着，先不看后面，先把中间这一坨搞明白

```java
void __fastcall __noreturn start_routine(unsigned __int8 *a1)
{
  int v1; // ebx
  unsigned int v2; // ebx

  v1 = *a1;
  free(a1);
  (*((void (__fastcall **)(void *))&xmmword_11B130 + (v1 & 4)))(&unk_11B930);
  (*((void (__fastcall **)(void *))&xmmword_11B130 + (v1 & 8)))(&unk_11B930);
  (*((void (__fastcall **)(void *))&xmmword_11B130 + (v1 & 0x10)))(&unk_11B930);
  (*((void (__fastcall **)(void *))&xmmword_11B130 + (v1 & 0x20)))(&unk_11B930);
  (*((void (__fastcall **)(void *))&xmmword_11B130 + (v1 & 0x40)))(&unk_11B930);
  (*((void (__fastcall **)(void *))&xmmword_11B130 + (v1 & 0xFFFFFF80)))(&unk_11B930);
  sleep(2u);
  v2 = v1 & 2;
  while ( 1 )
  {
    (*((void (__fastcall **)(void *))&xmmword_11B130 + v2))(&unk_11B930);
    sleep(3u);
  }
}
```

在这里

xmmword_11B130 = (\__int128)a3

然后就是紧跟着一堆函数的调用和赋值

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/373345fe3361cf66.png)

这一块看汇编好理解一点

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1bd2fa45c6ace76f.png)

简单来说xmmword_11B130是一个数组，里面存放着这些函数的地址

那这里就是调用这些函数，然后循环的那个v2是根据传入的a1去判断循环哪个检测。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7cea8b8ad30afb67.png)

回到父函数

这里pthread_create 成功返回 0，失败返回错误码。如果创建成功就是返回0直接下一步，如果创建失败就循环30次一直创建

```java
      if ( pthread_create(&haystack.st_dev, 0, start_routine, v156) )
      {
        v157 = -29;
        do
        {
          sleep(1u);
          v158 = pthread_create(&haystack.st_dev, 0, start_routine, v156);
          if ( !v157 )
            break;
          ++v157;
        }
        while ( v158 );
      }
      v137 = *(_QWORD *)off_1116D0;
      v138 = off_111750;
```

## 第二个线程函数分析 sub_5F620

这里创建第二个线程

跟前面一样的创建失败线程就一直创建，直到创建成功为止，不一样的是这里如果循环创建失败超过次数的话也会走到sub_2F010触发。

```java
                  if ( pthread_create((pthread_t *)&s, 0, sub_5F620, v221) )
                  {
                    v292 = 30;
                    do
                    {
                      v293 = v292;
                      sleep(1u);
                      --v292;
                      v294 = pthread_create((pthread_t *)&s, 0, sub_5F620, v221);
                    }
                    while ( v293 != 1 && v294 );
                    if ( !v292 )
                      sub_2F010(1024, 0xB6A2AA89, 4095);
```

跟入sub_5F620函数看看

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/00a0bc127b525596.png)

继续跟入sub_5F650

传入一个文件名，循环五次sub_625E0函数后也触发sub_2F010

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c025932c2af79fbc.png)

跟入sub_625E0函数看看，这里边大致做了一下几件事

解密filename、openat、加密、读取前四个字节

然后获取文件总大小，获取文件信息返回回去。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7fb036b8d0bde647.png)

这里的线程就是内部会循环五次去校验APK里面的manifest.mf

## 第三个线程函数分析 sub_5A070

依旧跟入函数sub_5A070

```java
          if ( pthread_create(&haystack.st_dev, 0, sub_5A070, v177) )
          {
            v184 = -29;
            do
            {
              sleep(1u);
              v185 = pthread_create(&haystack.st_dev, 0, sub_5A070, v177);
              if ( !v184 )
                break;
              ++v184;
            }
            while ( v185 );
```

一截一截看，这里拿着a1做解引用+偏移得到了一堆文件，其中两个变量名称，一个是pid 一个是fd。

然后取出字符串指针赋值给v3，计算v3长度再将v3拷贝到s。然后就释放掉a1内存。

```java
  v82 = __readfsqword(0x28u);
  pid = *((_DWORD *)a1 + 3);
  v1 = *(_DWORD *)a1;
  fd = *((_DWORD *)a1 + 1);
  v2 = *((_DWORD *)a1 + 2) == 0;
  memset(s, 0, sizeof(s));
  v3 = (const char *)*((_QWORD *)a1 + 2);
  v4 = strlen(v3);
  __strncpy_chk(s, v3, v4, 512);
  free(*((void **)a1 + 2));
  free(a1);
  v5 = v1 + 1;
  v6 = 0;
  v7 = v2;
  v8 = 0;
  v9 = 0;
```

这里是while死循环，然后判断(v7 & 1)!= 0 如果条件成立就跳转到LABEL_28，这里先不去看LABEL_28先往下看

```java
  while ( 2 )
  {
    v48 = v8;
LABEL_3:
    if ( (v7 & 1) != 0 )
      goto LABEL_28;
    v10 = 0;
```

内层循环，这里v6一直都是0，这一片就是给readfds跟buf清零。

\__FD_SET_chk(v1, &readfds, 128);这里是对v1做监听，然后timeout=2。

select(v5, &readfds, 0, 0, (struct timeval \*)timeout);-1就是出错，0就是超时，>0就是有数据可以读

```java
    while ( 1 )
    {
      while ( 1 )
      {
        buf = v6;
        *(_OWORD *)&readfds.fds_bits[14] = v6;
        *(_OWORD *)&readfds.fds_bits[12] = v6;
        *(_OWORD *)&readfds.fds_bits[10] = v6;
        *(_OWORD *)&readfds.fds_bits[8] = v6;
        *(_OWORD *)&readfds.fds_bits[6] = v6;
        *(_OWORD *)&readfds.fds_bits[4] = v6;
        *(_OWORD *)&readfds.fds_bits[2] = v6;
        *(_OWORD *)readfds.fds_bits = v6;
        __FD_SET_chk(v1, &readfds, 128);
        *(_OWORD *)timeout = 2u;
        v11 = select(v5, &readfds, 0, 0, (struct timeval *)timeout);
        if ( v11 != -1 )
          break;
        v6 = 0;
        if ( (v9 & 1) != 0 )
        {
          if ( v10 > 3 )
            goto LABEL_51;
          goto LABEL_14;
        }
      }
```

如果有数据就跳出去，走到read去读取数据，将读取的数据存到v12，最多读取16个字节

如果说读到0就说明对方关闭了管道就退出。如果读到了复数，说明出错了，然后当超时处理，继续重试

```java
      if ( v11 > 0 )
        break;
LABEL_10:
      v6 = 0;
      if ( (v9 & 1) != 0 )
      {
        if ( v10 > 3 )
        {
          v42 = 2;
          goto LABEL_52;
        }
LABEL_14:
        ++v10;
      }
    }
    v12 = read(v1, &buf, 0x10u);
    if ( v12 <= 0 )
    {
      if ( !v12 )
        goto LABEL_51;
      goto LABEL_10;
    }
```

接受对方通过管道发来的一个数字 然后将他转换成整数v13。

```java
    v13 = atoi((const char *)&buf);
    if ( !v13 )
      goto LABEL_27;
    v15 = v13;
```

打开file，如果没打开就去拼路径/proc//net 和 /proc//task

然后去判断task目录是否不可访问，如果可以访问那么就说明进程还在，就继续监控，否则就往下走

```java
    sub_39E90((unsigned int)file, 128, 128, (unsigned int)"/proc/%ld/cmdline", v15, v14, v45);
    v16 = open(file, 0, 0);
    if ( v16 <= 0 )
    {
      memset(v66, 0, 112);
      *(_OWORD *)haystack = 0;
      v64 = 0;
      v63 = 0;
      v62 = 0;
      v61 = 0;
      v60 = 0;
      v59 = 0;
      si128 = 0;
      *(_OWORD *)name = 0;
      v21 = 0;
      sub_39E90((unsigned int)haystack, 128, 128, (unsigned int)"/proc/%ld/net", v15, v17, v45);
      sub_39E90((unsigned int)name, 128, 128, (unsigned int)"/proc/%ld/task", v15, v22, v46);
      if ( access("/proc/%ld/net", 4) )
        v21 = access(name, 4) != 0;
      if ( !v21 )
        goto LABEL_27;
LABEL_57:
      v42 = 1;
    }
```

这里是如果可以打开，那么就去读取cmdline 内容到 haystack，然后在在 cmdline 里找字符串 s，判断找没找到。

```java
    else
    {
      v18 = fdopen(v16, "r");
      if ( v18 )
      {
        v19 = v18;
        v20 = 0;
        memset(haystack, 0, 0x200u);
        if ( fscanf(v19, "%s", haystack) )
          v20 = strstr(haystack, s) == 0;
        fclose(v19);
        if ( v20 )
          goto LABEL_57;
      }
```

延迟两秒，获取当前自己的pid，然后打开/proc/%ld/status，看自己有没有被调试

```java
      sleep(2u);
      buf = 0;
      v23 = getpid();
      sub_2FCA0((unsigned int)file, 256, (unsigned int)"/proc/%ld/status", v23, v24, v25, v45);
      v26 = fopen(file, "r");
```

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fde1af6ce37343b0.png)

准备明文字符串

这里做字符串解密，将解密的结果放到name中

```java
        si128 = (__m128i)xmmword_EB220;
        *(_OWORD *)name = xmmword_EB210;
        LOBYTE(v59) = 0;
        *(_OWORD *)haystack = 0;
        v66[0] = 0;
        haystack[0] = 116;
        v31 = 4;
        v32 = 2;
        v33 = -3;
        for ( i = 2; ; i += 4 )
        {
          haystack[v32 - 1] = name[2 * v32 - 2] + v33 + 3 * (i / 3);
          if ( v32 == 16 )
            break;
          haystack[v32] = name[2 * v32] + v30 + 3 * (v31 / 3);
          v30 -= 4;
          v31 += 4;
          v32 += 2;
          v33 -= 4;
        }
        si128 = _mm_load_si128(v66);
        *(_OWORD *)name = *(_OWORD *)haystack;
```

然后逐行读取/proc/self/status，找到TracerPid，把后面的数字读到v53中，如果被调试器附加了，这个数字就是调试器的pid(非0)，没被调试就是0。同时检查state是否是异常状态，最终v29拿到TracerPid的值

```java
	    memset(haystack, 0, 0x400u);
        v5 = v1 + 1;
        while ( fgets(haystack, 1024, stream) )
        {
          if ( *(_BYTE *)(*(_QWORD *)off_1116D0 + 66LL) )
          {
            v36 = __strlen_chk(s2, 13);
            if ( !strncmp(haystack, s2, v36)
              && !strcasestr(haystack, (const char *)&readfds)
              && !strcasestr(haystack, needle)
              && !strcasestr(haystack, name) )
            {
              break;
            }
          }
          v35 = __strlen_chk(timeout, 21);
          if ( !strncmp(haystack, timeout, v35) )
          {
            sscanf(haystack, "%*s %d", &v53);
            break;
          }
        }
        fclose(stream);
        v29 = v53;
```

将v29也就是TracerPid转换成字符串放进buf，再将buf发回去给对方进程

```java
      sub_2FCA0((unsigned int)&buf, 16, (unsigned int)"%d", v29, v27, v28, v47);
      v37 = write(fd, &buf, 0x10u);
```

那么这里有发送，肯定就有接收，那就回去，回到上个函数找接收方。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/52eb3bbf2c98df3c.png)

从这里往上找。分析到这里其实nop思路也很清晰了，但是不着急，先接着往下看。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/372be94d0fafec57.png)

## 第四个线程函数分析 sub_5A8D0

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/777d73a4cf6c58de.png)

代码不多很简短，也是检测管道，但是这里比较粗暴，管道转状态一旦发生变化就直接自爆

```java
void __fastcall __noreturn sub_5A8D0(unsigned int *a1)
{
  __int64 v1; // rax
  unsigned int v2; // r14d
  int *v3; // rbx
  size_t v4; // rdx
  int v5; // eax
  unsigned __int64 v6; // rax
  __pid_t v7; // eax
  unsigned int v8; // eax
  char v9[20]; // [rsp+0h] [rbp-14h] BYREF

  *(_DWORD *)v9 = HIDWORD(v1);
  v2 = *a1;
  free(a1);
  prctl(4, 1, 0, 0, 0);
  v3 = (int *)__errno(4);
  v4 = 1;
  while ( 1 )
  {
    *v3 = 0;
    v6 = sys_read(v2, v9, v4);
    if ( v6 >= 0xFFFFFFFFFFFFF001LL )
    {
      v5 = -(int)v6;
      *v3 = v5;
      if ( v5 != 11 )
        goto LABEL_6;
    }
    else if ( (_DWORD)v6 != -1 || *v3 != 11 )
    {
LABEL_6:
      close(v2);
      v7 = getpid();
      __android_log_print(5, "LOG.OUT", "%d, %x, %x", v7, -1230862817, 4095);
      v8 = getpid();
      sub_3AFB0(v8);
      _exit(3);
    }
  }
}
```

## 第五个线程函数分析 sub_5A8D0

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/91ed5aaca908cc7d.png)

同上

## Patch思路

时机选择：

patch的时机不能放在init的onenter，在前面的分析中 init在解密的时候就会通过maps对字符串进行校验，这里选择的是hook linker的call_array，在他的onenter中通过args\[3\]判断是不是目标so，如果是的话此时so已经完成了隐射、base可取、但是initarray尚未执行，所以选择在这里patch。

方案选择：

同样也是在上面我们发现创建的这些线程遇到异常统统都会走到sub_2F010，然后这个函数触发自毁（这里面不知道是不是根据错误码来进行判断的 大概率是，本来想着去收集错误码的 但是太麻烦了）。这里可以直接对这个sub_2F010函数进行hook让其不退出就行了，可是根据前面的线程函数分析，这样也行不通，会触发父子进程监控。所以时机还需要往前，在call函数的地方进行hook呢？

但是一个一个找非常非常的麻烦并且很大概率会漏函数。所以还要往前，再往前就只能是这些创建线程的函数了，那么我们直接去hook pthread_create？这个也是不行的。那么更底层是不是可以？直接去hook clone？ 我试过 也是不行。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cef58f67aaed34c2.png)

这里我的做法是：既然libDexHelper 内部调用 pthread_create 都经过它自己的 PLT 桩 0x2BE10 那么就扫描整个so代码段，找到所有的call 0x2BE10 不就好了。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e61a6e51ef5d3758.png)

写脚本之前需要补充一下这些：下面图片中的 call \_pthread_create 是ida计算好的跳转目标，但是通过frida去扫描的话是不能这样去找的。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f67783245c0edd25.png)

x86 CPU 执行指令时，不同指令有不同的二进制编码。其中"近距离 call（call rel32）"的编码 **固定以 E8 开头**，后面跟 4 字节偏移：

```java
E8 | rel32 (4字节)
```

内存中就是这样的

```java
0x35413:  E8 F8 69 F7 FF
```

E8 = 这是一条 call

F8 69 F7 FF（小端读）= 0xFFF769F8 = **\-557064** （负数，说明是往前跳）

CPU 的规则是：偏移是从call 的下一条指令开始算的，不是从 call 本身算。

```java
call 在   0x35413
下条指令 = 0x35413 + 5 = 0x35418  
目标     = 0x35418 + (-557064)
         = 0x35418 + 0xFFF769F8(作为有符号数)
         = 0x2BE10   ✓ 正好是 pthread_create 的 PLT 桩
```

这就是公式 目标地址 = call指令地址 + 5 + rel32 的由来。

```java
if (b === 0xE8) {                    // 第1步：这可能是一条 call（像 IDA 识别指令）
    const rel = p.add(1).readS32();  // 第2步：取出4字节偏移 (-557064)
    const target = p.add(5).add(rel);// 第3步：0x35418 + (-557064) = 0x2BE10
    if (target.equals(pltAddr)) {    // 第4步：目标=PLT桩 → 这就是 call pthread_create！
```

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/133eb3038975f880.png)

共29处。

找到了其实就可以进行NOP了，但是但是但是，也不是无脑NOP

```java
LOAD:0000000000035413                 call    _pthread_create
LOAD:0000000000035418                 test    eax, eax
LOAD:000000000003541A                 jz      short loc_35455
```

不能直接把5字节call 全填90，eax里面是残留的脏值，test后可能非零 导致判定创建失败 进入失败重新循环 然后再进入耗尽次数 最后依旧触发自毁。

所以这里把call换成了

返回值清零 然后补齐五字节长度

```java
w.putBytes([0x31, 0xC0, 0x90, 0x90, 0x90]);
```

那么现在 时机有了，方案有了，目标线程组也有了，nop谁呢？全部？还是一个一个实验，这里我是直接给他打印出来的地址全丢进去patch了。运气挺好的其实，直接就过掉了

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0a6b68062fbbf913.png)

那要是没过掉呢？也没关系其实，我们已经拿到了这些检测函数和线程地址，接下来无非就是体力活。

## 总结

这个样本的保护手段蛮多的，比如说壳的inlinehook实现，比如说dex的解密和insn回填，再比如说检测的路径具体都有哪些，我的模拟器具体在哪里被gank了等等......

同样的收获也是非常的多，学习到了init阶段解密回填与校验，学到了so修复的手法，学到了父子进程互相监视，学到了很多单项检测的组合技.........

后续如果有空的话我会在我的 [自定义linker](https://bbs.kanxue.com/thread-292057.htm) 中也加入这些壳的保护手段。

[回复或点赞可查看完整内容](#quick_reply_form)
