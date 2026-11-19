---
title: ARM64下多线程InlineHook的坑
source: https://fjqisba.github.io/2026/09/14/2026/ARM64%E4%B8%8B%E5%A4%9A%E7%BA%BF%E7%A8%8BInlineHook%E7%9A%84%E5%9D%91/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:55:56+08:00
trace_id: ec3ee47c-68d8-499c-a625-b2154842291b
content_hash: 0ea9820c7ad0d667bee61ee39ba58f5e6cbabe84de83ad39df534e9ecdb54cc3
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
notion_page_id: 41d75244-d011-81f1-bd03-d5a7b3694f6b
ioc: null
---

## ARM64下多线程InlineHook的坑

正常情况下ARM64 `Inline hook` 是一件比较简单的事情

例如 `libc.so` 里面的某个函数

```objectivec
00D8080             ; unsigned __int64 __fastcall _openat(int, const char *, int)
00D8080 5F 24 03 D5                 BTI             c
00D8084 08 07 80 D2                 MOV             X8, #0x38 ; '8'
00D8088 01 00 00 D4                 SVC             0
00D808C 1F 04 40 B1                 CMN             X0, #1,LSL#12
00D8090 00 94 80 DA                 CNEG            X0, X0, HI
00D8094 08 56 FF 54                 B.HI            __set_errno_internal
00D8098 C0 03 5F D6                 RET
APACHE
```

发起HOOK，需要将第一条指令改为 `B xxxx` 指令即可，但是B指令寻址范围只有±128MB。因此这里会遇到很多麻烦。

## 注意的点

1、如果地址相差比较大，那么就需要动用16字节：

```
0xD8080: LDR X17, #8         ; 从当前地址 + 8 (0xD8088) 读取 64 位地址到 X17
0xD8084: BR  X17             ; 无条件跳转到 X17 指向的地址
0xD8088: .quad 0x70B58DF2D0  ; 存放 8 字节（64 位）的目标绝对地址数据
APACHE
```

选用X17寄存器，是因为这个寄存器就是专门拿来干这件事的

2、如果HOOK起始地址不是 `0xD8080` ，而是 `0xD8084` ，即

```
0xD8084: LDR X17, #8         ; 指令 1 (4 字节)
0xD8088: BR  X17             ; 指令 2 (4 字节)
0xD808C: .quad replace_addr  ; 数据 (8 字节的 64 位绝对地址)
APACHE
```

跳转地址没有8字节对齐，则硬件上读写无法原子化，极易造成崩溃，因此还要通过 `NOP` 填充大法，但这样就要20字节：

```
0xD8084: LDR X17, #12        ; 4 字节 (偏移改写为 #12，指向 0xD8090)
0xD8088: BR  X17             ; 4 字节
0xD808C: NOP                 ; 4 字节 
0xD8090: .quad replace_addr  ; 8 字节 (0xD8090 % 8 == 0，读取安全！)
APACHE
```

3、在填入20字节时，也要进行原子化处理，不然极有可能，只写上了第一条指令的时候，另外的线程就已经往下跑了。还是会发生崩溃。

这里可以用 `__atomic_store_n` 这种语义级别的原子化写入操作。

4、重点来了，即便实现了16字节原子级别的写入，依然有可能发生崩溃。比如上面的HOOK要覆盖的指令是一个 `SVC` 指令，当线程A通过 `SVC` 指令陷入到内核代码，此时线程B发起原子性HOOK写入，将上面指令全都覆盖了，此时线程A从 `SVC` 指令里面出来，就会执行到一个错误的指令流。

所以说 `ARM64 InlineHook` 在多线程环境下全部是坑，市面上的开源方案都是想办法使用单指令HOOK，能避免不少崩溃。
