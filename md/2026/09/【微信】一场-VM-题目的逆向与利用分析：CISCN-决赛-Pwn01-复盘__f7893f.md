---
title: 【微信】一场 VM 题目的逆向与利用分析：CISCN 决赛 Pwn01 复盘
source: https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619945&idx=2&sn=668c5a7c1d1589699676a02d69c89415&scene=58&subscene=0
source_host: mp.weixin.qq.com
clip_date: 2026-09-16T16:43:23+08:00
trace_id: 2f82f35e-7540-4df6-a207-00902ba7f9e5
content_hash: a7ee0cfb1dafb192f5631bf05f45e277f880b74e75904a565ce295d8606b3d43
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号·看雪学院（weread）
ai_summary: "**TL;DR：** CISCN 决赛 Pwn01 是一道 VM pwn 题，漏洞在 case 6 的 memcpy 越界读写；但远程以 --pty 启动导致 \\x03/\\x04 被截断，作者因未料到该坑点错失远程。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dd75244-d011-813a-b95f-f6c1711cd2cb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** CISCN 决赛 Pwn01 是一道 VM pwn 题，漏洞在 case 6 的 memcpy 越界读写；但远程以 --pty 启动导致 \x03/\x04 被截断，作者因未料到该坑点错失远程。
> 
> - **漏洞定位：** 程序中唯一有内存操作的是 case 6 的 memcpy，其 dst/src 为 mem1(mem2)+寄存器值\*8，寄存器可取到 255，造成越界读写，实测可覆盖/读取到 opcode。
> - **利用链：** 越界读写保存堆地址→改寄存器偏移操控 sp/bp →pop 出 unsorted bin 的 libc 地址→读 environ 栈地址→操控 sp 到栈→push 覆盖 main 返回地址打 ogg，需保证 0x61 堆块 size 与 code 指针正确。
> - **指令限制：** push 要求 sp 地址 ≥ mem 地址才能执行（写能力限于堆地址及以上）；pop 仅需 bp ≥ sp，两者均在 opcode 中可控。
> - **远程差异：** 远程交互会回显并加 \r\n、不可见字符显示为 ^*（类似 qemu 内核题）；\x03（ctrl+c）、\x04（ctrl+d）会被截断，正是 exp 二次输入被截断、远程打不通的真因。
> - **赛事问题：** 附件与描述均未说明 --pty，启动脚本为 exec runuser -u ctf --pty -- timeout 300 ./pwn；作者批评出题方在无关细节设障、附件模板未赛前测试。

## 首先，vm 题目最重要的肯定是逆向，只有过得了指令逻辑才能谈未来。

OK，这里压力逆向手逆向的结果如下：

`int __fastcall main(int argc, const char **argv, const char **envp)   {     vm_opcode *opcode_1; // rax     _QWORD *sp; // rax     vm_opcode *opcode_5; // rax     vm_opcode *opcode_6; // rcx     _QWORD *sp_1; // rax     vm_opcode *opcode_3; // rax     vm_opcode *opcode_4; // rax     vm_opcode *opcode_7; // rax     vm_opcode *opcode_8; // rax     vm_opcode *opcode_9; // rax     vm_opcode *opcode_10; // rax     unsigned __int64 *mem1; // rsi     vm_opcode *opcode_11; // rdx     vm_opcode *opcode_12; // rax     unsigned __int8 *mem1_1; // rsi     vm_opcode *opcode_13; // rdx     vm_opcode *opcode_14; // rax     vm_opcode *opcode_15; // rax     vm_opcode *opcode_16; // rax     vm_opcode *opcode_17; // rax     vm_opcode *opcode_18; // rax     vm_opcode *opcode_19; // rax     vm_opcode *opcode_20; // rax     vm_opcode *opcode_21; // rax     vm_opcode *opcode_22; // rax     vm_opcode *opcode_23; // rax     vm_opcode *opcode_24; // rax     vm_opcode *opcode_25; // rax     vm_opcode *opcode_26; // rax     vm_opcode *opcode_27; // rax     vm_opcode *opcode_28; // rax     vm_opcode *opcode_29; // rax     vm_opcode *opcode_30; // rax     vm_opcode *opcode_2; // rax     unsigned __int8 v38; // [rsp+Eh] [rbp-32h]     unsigned __int8 v39; // [rsp+Eh] [rbp-32h]     unsigned __int8 v40; // [rsp+Eh] [rbp-32h]     unsigned __int8 v41; // [rsp+Eh] [rbp-32h]     unsigned __int8 n; // [rsp+Eh] [rbp-32h]     unsigned __int8 v43; // [rsp+Eh] [rbp-32h]     unsigned __int8 v44; // [rsp+Eh] [rbp-32h]     unsigned __int8 v45; // [rsp+Eh] [rbp-32h]     unsigned __int8 v46; // [rsp+Eh] [rbp-32h]     unsigned __int8 v47; // [rsp+Eh] [rbp-32h]     unsigned __int8 v48; // [rsp+Eh] [rbp-32h]     unsigned __int8 v49; // [rsp+Eh] [rbp-32h]     unsigned __int16 len; // [rsp+10h] [rbp-30h]     int code2; // [rsp+14h] [rbp-2Ch]     vm_mem *mem; // [rsp+18h] [rbp-28h] BYREF     vm_opcode *opcode; // [rsp+20h] [rbp-20h] BYREF     void *dest; // [rsp+28h] [rbp-18h]     void *src; // [rsp+30h] [rbp-10h]     unsigned __int64 canary; // [rsp+38h] [rbp-8h]        canary = __readfsqword(0x28u);   io_init();     mem = (vm_mem *)calloc(0x900u, 1u);     opcode = (vm_opcode *)calloc(0x58u, 1u);   if ( (unsigned int)handle_alloc_failed(mem, opcode) )   return 1;     opcode->bp = (unsigned __int8 *)mem->stack;     opcode->sp = opcode->bp;     opcode->code = (unsigned __int8 *)mem;     len = fetch_len();   read_code(mem, len);   while ( opcode->code < (unsigned __int8 *)mem + len )     {   switch ( *opcode->code )       {         case '1':                                 // push imm   if ( opcode->sp >= mem->mem1 )           {             opcode_1 = opcode;             ++opcode->code;             code2 = *opcode_1->code;             sp = opcode->sp;             opcode->sp = sp - 1;             *sp = code2;             ++opcode->code;           }   continue;         case '2':                                 // push reg   if ( opcode->sp >= mem->mem1 )           {             opcode_5 = opcode;             ++opcode->code;             v38 = *opcode_5->code & 7;             opcode_6 = opcode;             sp_1 = opcode->sp;             opcode->sp = sp_1 - 1;             *sp_1 = opcode_6->reg[v38];             ++opcode->code;           }   continue;         case '3':                                 // pop   if ( opcode->bp >= (unsigned __int8 *)opcode->sp )           {             opcode_3 = opcode;             ++opcode->code;             v39 = *opcode_3->code & 7;             opcode_4 = opcode;             ++opcode->sp;             opcode->reg[v39] = (char *)*opcode_4->sp;             ++opcode->code;           }   continue;         case '4':                                 // mov reg, reg           opcode_7 = opcode;           ++opcode->code;           v40 = *opcode_7->code & 7;           opcode_8 = opcode;           ++opcode->code;           opcode->reg[v40] = opcode->reg[*opcode_8->code & 7];           ++opcode->code;   continue;         case '5':                                 // mov reg, imm           opcode_9 = opcode;           ++opcode->code;           v41 = *opcode_9->code & 7;           opcode_10 = opcode;           ++opcode->code;           opcode->reg[v41] = *(char **)opcode_10->code;           opcode->code += 8;   continue;         case '6':                                 //  // 6 i1 i2                                                                                            //   mem[reg[i1]] = mem[reg[i2]]           mem1 = (unsigned __int8 *)mem->mem1;           opcode_11 = opcode;           opcode_12 = opcode;           ++opcode->code;           dest = &mem1[8 * (unsigned __int8)opcode_11->reg[*opcode_12->code & 7]];           mem1_1 = (unsigned __int8 *)mem->mem1;           opcode_13 = opcode;           opcode_14 = opcode;           ++opcode->code;           src = &mem1_1[8 * (unsigned __int8)opcode_13->reg[*opcode_14->code & 7]];           opcode_15 = opcode;           ++opcode->code;           n = *opcode_15->code - 1;           opcode->code += 2;   memcpy(dest, src, n);   continue;         case '7':                                 // and reg1, reg2           opcode_16 = opcode;           ++opcode->code;           v43 = *opcode_16->code & 7;           opcode_17 = opcode;           ++opcode->code;           opcode->reg[v43] = (char *)((__int64)opcode->reg[v43] & (__int64)opcode->reg[*opcode_17->code & 7]);           ++opcode->code;   continue;         case '8':                                 // or reg1, reg2           opcode_18 = opcode;           ++opcode->code;           v44 = *opcode_18->code & 7;           opcode_19 = opcode;           ++opcode->code;           opcode->reg[v44] = (char *)((__int64)opcode->reg[v44] | (__int64)opcode->reg[*opcode_19->code & 7]);           ++opcode->code;   continue;         case '9':                                 // xor reg1, reg2           opcode_20 = opcode;           ++opcode->code;           v45 = *opcode_20->code & 7;           opcode_21 = opcode;           ++opcode->code;           opcode->reg[v45] = (char *)((__int64)opcode->reg[v45] ^ (__int64)opcode->reg[*opcode_21->code & 7]);           ++opcode->code;   continue;         case '@':                                 // not reg1, reg2           opcode_22 = opcode;           ++opcode->code;           opcode->reg[*opcode_22->code & 7] = (char *)~(__int64)opcode->reg[*opcode_22->code & 7];           ++opcode->code;   continue;         case 'A':                                 // shr reg1, reg2           opcode_23 = opcode;           ++opcode->code;           v46 = *opcode_23->code & 7;           opcode_24 = opcode;           ++opcode->code;           opcode->reg[v46] = (char *)((unsigned __int64)opcode->reg[v46] >> (char)opcode->reg[*opcode_24->code & 7]);           ++opcode->code;   continue;         case 'B':                                 // shl reg1, reg2           opcode_25 = opcode;           ++opcode->code;           v47 = *opcode_25->code & 7;           opcode_26 = opcode;           ++opcode->code;           opcode->reg[v47] = (char *)((__int64)opcode->reg[v47] << (__int64)opcode->reg[*opcode_26->code & 7]);           ++opcode->code;   continue;         case 'C':                                 // add           opcode_27 = opcode;           ++opcode->code;           v48 = *opcode_27->code & 7;           opcode_28 = opcode;           ++opcode->code;           opcode->reg[v48] += (unsigned __int64)opcode->reg[*opcode_28->code & 7];           ++opcode->code;   continue;         case 'D':                                 // sub           opcode_29 = opcode;           ++opcode->code;           v49 = *opcode_29->code & 7;           opcode_30 = opcode;           ++opcode->code;           opcode->reg[v49] -= (unsigned __int64)opcode->reg[*opcode_30->code & 7];           ++opcode->code;   continue;         case 'E':                                 // jmp           opcode_2 = opcode;           ++opcode->code;           opcode->code = (unsigned __int8 *)mem + *opcode_2->code;   continue;         default:   if ( opcode->code >= (unsigned __int8 *)mem + len )           {             ++opcode->code;           }   else           {   if ( (unsigned int)expand(&opcode, &mem) )   return 1;             len = fetch_len();   read_code(mem, len);           }   break;       }     }   return 0;   }      struct vm_mem // sizeof=0x10F0   00000000 {   00000000     unsigned __int64 mem0[32];   00000100     unsigned __int64 mem1[255];   000008F8     unsigned __int64 stack[255];   000010F0 };      00000000 struct vm_opcode // sizeof=0x58   00000000 {   00000000     unsigned __int8 *code;   00000008     _QWORD *sp;   00000010     unsigned __int8 *bp;   00000018     __int64 reg[8];   00000338 };`

（比赛时时间比较紧张，发文前我也没 check，有错误还请多担待）

整个逻辑是先申请 `0x900` 的堆块作为存放 code 的内存和 stack，然后申请 `0x58` 的 opcode，结构为指向 code 的指针、bp 指针、sp 指针和 8 个 8 字节大小的寄存器。

可以看到，除去一些很常规的指令，唯一有内存操作的只有 case 6，即有 `memcpy` 函数的指令。

那很明显，就要集中看这个指令漏洞在哪里。

`case '6':                                 //  // 6 i1 i2                                                                                            //   mem[reg[i1]] = mem[reg[i2]]           mem1 = (unsigned __int8 *)mem->mem1;           opcode_11 = opcode;           opcode_12 = opcode;           ++opcode->code;           dest = &mem1[8 * (unsigned __int8)opcode_11->reg[*opcode_12->code & 7]];           mem1_1 = (unsigned __int8 *)mem->mem1;           opcode_13 = opcode;           opcode_14 = opcode;           ++opcode->code;           src = &mem1_1[8 * (unsigned __int8)opcode_13->reg[*opcode_14->code & 7]];           opcode_15 = opcode;           ++opcode->code;           n = *opcode_15->code - 1;           opcode->code += 2;   memcpy(dest, src, n);   continue;`

一开始变量类型没设置好的话会比较难察觉，但是直接查看汇编时会发现，dst 和 src 的地址是类似  `mem2+offset` ，而这个 offset 是从寄存器中取的值，这个值先取单字节，再被 `*8` 。

此时，可以注意力惊人的发现，这个 mem2 到 opcode 的大小是小于这个 offset，而 dst 和 src 的地址都是 `mem2+offset` ，也就是说是 **越界读写**！（读写到 stack，再进寄存器就可操控值了）

经实测，将寄存器设置为 255，在 \*8 后会覆盖/读取到 opcode 的值，越界读写的猜想证明成功。

而同时，最后面的 default 里有 free，它在满足一定条件后不仅可以释放原先堆块申请新堆块，还会好心地把原先内存、寄存器值复制过去，并且重新读取 code。

这样 free 完，新的堆块上方就存在了一个有 libc unsorted bin 堆块，虽然有 0x900 距离，但看上去近在咫尺。

赢了吗？没有。

在众多指令中，只有 push 和 pop 有实际读写能力，因此，得仔细查看它们的限制。

此时发现，push 被限制了，在指令里有这么判断条件：sp 地址 >= mem 地址才能执行 push，这个 mem 指针地址在栈上，很不幸，写能力被限制在堆地址及更高的地址了。

而 pop，读取 libc 的关键，它的 check 条件是 `bp >= sp` 即可，这两个值都是在 opcode 中可控的。

那么，胜利的方程式已经写好了：

先利用越界读写保存堆地址，地址进入 stack 再进入 reg，将其在寄存器改偏移后利用越界读写操控 sp、bp，将unsorted bin 的libc 地址 pop 进入 reg。

然后同样的方法操控 sp、bp 读 environ 栈地址，最后操控 sp 到栈上，用push覆盖 main函数 返回地址打 ogg。

其中要保证 0x61 的堆块 size 和 code 指针指向正确。

（当时和队友打 awdp 打的已经过载了，只能想到这种攻击方法了，有更好的方法欢迎大家在评论区评论）

"如今 flag 就在眼前，我必须考虑这是否是我此生唯一的机会"

看上去很难的一条路径，实际写指令也很痛苦。

最后，在距比赛结束还有不到一个小时的时候，队友写出了打通本地的 exp，如下：

意气风发啊，队友！也就是说，是我们赢了！

然后，就发现了这题目前零解是有原因的。

远程的交互竟然与本地不一样，而题目附件和题目描述中并没有给出任何说明。

在远程的交互中，发送的内容会被输出回显并加上 \\r\\n ，不可见字符会变成 ^\* （\*代表可见字符，如 \\x00 会变成 ^@），是与 qemu 启动的内核题目交互很像的形式。

而 exp 在第二次输入时被截断。

此时，经过询问裁判，裁判与出题人确认后，给我们的答复仅有："题目附件并没有问题，远程运行的程序与题目附件一致"

我当然知道附件没问题啊，甚至在这种时刻，仍有一个什么也不懂的裁判在不停地质疑我们，为什么不走平台，为什么...

可能这名裁判觉得，他们的比赛办的很好，发出质疑的选手一定是个人有问题。

当我们再询问远程的表现时，裁判模糊的告诉我们："具体细节不能告知，或许跟容器有关"

"这个也算考点吗？"

唯有沉默...

当我们连启动脚本和远程环境都没有就让我们猜原因，好的，很符合我对 ctf 题目的印象，远程吗，总有打不通的时候。也许就是我们技不如人，有什么细节疏忽了导致的。

可是这种毫无征兆的 EOF 该怎么调试呢？

或许经验丰富的师傅们，或许接触过这类问题的师傅们能立即知道是为什么。但很可惜，我们缺乏经验，或者应该说，我们认为 ctf pwn 不会在附件和题目描述以外的地方设置无必要的交互门槛。

而我和队友当时在花了三个小时逆向、分析、写exp，而此刻比赛只剩半个小时，没有遇到过这种情况的境地，甚至没有能本地搭建环境的办法，猪脑已过载，开始猜测吧。

好吧，也许是远程堆块不一样，也许是 io 有问题，要用特别的方法传输。

也许是某些字符截断了呢？

带着不甘与疑惑，我们没有在结束前打通远程，我们看到了这题有别的学校拿到了一血，而我们很可惜地错过了解出题目的机会。

真是抱歉啊，没能让国赛大人尽兴。

再次回到一个小时前，我还是觉得我们会赢。

在队友赛后不懈努力下，他试出了 `\x03` 和 `\x04` 会被截断，这俩一个 ctrl+c 一个 ctrl+d，答案很明显了。

在不用这两个的情况下，他稍加修改脚本就打通了远程。

拿到了启动脚本。

`#!/bin/bash   set -e      # override flag from env   # if environmental variable FLAG is not empty string   if [ ! -z $FLAG ]   then   if [ "$(cat /home/ctf/flag.txt)" != "$FLAG" ]   then   echo $FLAG > /home/ctf/flag.txt   chmod 644 /home/ctf/flag.txt   fi   fi      # the env will not pass to ctf   unset FLAG      cd /home/ctf      # run pwn challenge   exec runuser -u ctf --pty -- timeout 300 ./pwn`

我不知道为什么一个没有必要的东西会被加上，我不知道为什么一个普通的 vm pwn 题，要使用 tty，甚至不关闭它的缺点（是的，可以设置即便使用 tty 也不被截断）。

他甚至可以在附件里明文加上：不准使用 \\x03 \\x04

我不知道比赛时做出这题的师傅笑没笑，但是我先笑为敬了。

我们没有立刻联想到这个点，我们那半个小时大部分时间在想，堆风水调的不够好，远程直接内存损坏死掉了，看看其他题吧。

我承认技不如人，可我们觉得，一个以 vm pwn 为背景的 ctf 题目不该如此，但凡把启动脚本放在附件中，但凡题目描述提到这个 `--pty` ，结果都也许会不一样。

压垮选手的最后一根稻草，是在一个跟题目毫无关系的细节上，设置一个毫无意义的障碍，只是为了让选手打不通远程。

我无法相信裁判那句"这是一个故意隐藏的坑点"。与其说这是一个为了出题而出题的设置，这是一个 `--pty` 启动的 pwn 题，倒不如直接说"出题人使用了一个有问题的模板容器，自己出题的时候都没想到，明明能被 vm 正常解析的 `\x03 \x04` 会被一个没有任何提示，全靠猜测的 tty 截断，而导致使用了 3 号和 4 号寄存器的 payload 打不通"

这不仅仅是一次出题上的疏忽，更是印证了某高校相关工作单位和人员在办赛态度上的敷衍和极度的不负责。

这跟五条悟在释放虚式茈后被腰斩有什么区别呢。

没办法，真没招了，没想到，技不如人，做题做少了，没见过，差一点，这里有无数的解释。

可是，对于这个最后没做出来的题，什么解释都没办法解释我们的遗憾。

我不知道有多少师傅尝试了这个题，希望我的简析能有所帮助，就这样，over。

下面是远程脚本：

或许有师傅不清楚 pty以及 `\x03 \x04` 被截断的原理，这里打两天比赛再赶回去上班已经有点力竭了，所以很抱歉，麻烦问问 ai 吧，我已经没有力气整理了。

## 关于最后领奖 & 赛后打通这题队友的趣事补充

"已经改签了一次，还有 50 分钟发车，可奖状还没发。"

"退票了，已经赶不上了。"

"会有招的，又不是用 pty 交互的 pwn 题"

为什么我们遇到远程不一样会直接喊裁判，因为我们 fix 时发现有问题询问裁判，而裁判自己都不知道运行update.sh的工作目录在哪，甚至有的题目给出的模板脚本在远程运行时报错（题目附件中的模板有一行 set -euo pipefail ，显然没有人在赛前测试这些题目并检查附件内容），导致我们白费了好长时间。

很难想象这是 cn ctf 规模最大的比赛之一该有的题目质量。

讽刺的是，最后能成功 fix 的原因是，我们打通了防守 URL 的机器，看到了远程仍在运行的旧进程，才知道这个神仙平台是先启动服务进程，再执行 update.sh

在后面做 ctf 时已经 ptsd 了，谁能想到在 pwn 的 awdp 中也要自己重启服务才能 fix 成功呢？谁又能想到，在一个普通的 ctf vm pwn 中，偏偏要用 --pty 启动题目呢？

\*本文为看雪论坛精华文章，由 一叶梦花 原创，转载请注明来自看雪社区 [Frida 整体启动逻辑](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619811&idx=1&sn=bfee625d49ac82cbc5ddbde393844170&scene=21#wechat_redirect) [VT调试器原理揭秘--DebugPort转移与重建调试体系](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619748&idx=1&sn=3da8fd74ca09ea5d3b1a7e5df02207ca&scene=21#wechat_redirect) [App 抽取壳的内存脱壳与请求签名逆向](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619713&idx=1&sn=ec61b7e3afb64384c71693657e53d117&scene=21#wechat_redirect) [ART 执行链与 Nterp：解析 FART Android12‑16 失效问题](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619676&idx=1&sn=2c4d3a7a8e4001824f3a0a2f5bc5c8f8&scene=21#wechat_redirect) [Hitcon-2016-babytrick 解题报告](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619656&idx=2&sn=e2518e55f8b66c6b10176910c3fd00e6&scene=21#wechat_redirect)
