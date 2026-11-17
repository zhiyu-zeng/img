---
title: 【看雪】vmp2.x样本分析
source: https://bbs.kanxue.com/thread-293513.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-17T08:53:57+08:00
trace_id: 512abc52-ee6c-4e2f-9bf4-2cac3ad1b89d
content_hash: 1a4df3b17f59b1e6b6a6e8843c1ac8223e1a5dd3b2aea83dd43016c7c331f320
status: synced
tags:
  - 看雪
  - Windows逆向
  - 脱壳与加固
series: null
feed_source: 看雪·逆向工程
ai_summary: |-
  - **样本背景：** 64位驱动（约161KB），被VMProtect 2.x保护，IDA仅识别不到20个函数，原始有效函数约6个；vmp不改变函数原始地址，仅替换内部指令为虚拟指令。
  - **函数定位：** 通过导入表与运行时驱动对象分析确认：sub_11160为进程创建回调、sub_11214为设备控制派遣函数、sub_11888为默认派遣、sub_118b0为卸载函数、sub_11068为系统线程函数（强度较低，可见KeWaitForSingleObject等API调用），进程回调疑似需通过设备控制触发。
  - **调试技巧：** 将PE的Subsystem改为console、入口地址指向目标函数，在WinDbg中伪造IRP参数（如eq 12308 0xc、ed 12318 abcd），直接跑虚拟机并输出700多行虚拟指令日志，避免双机调试。
  - **虚拟机机制：** 通过日志还原出等价汇编序列（如mov R23,[R6+b8h]、sub R22,22e484h等），发现vmp用Add/NAnd组合指令实现运算，操作码地址经NAND混淆计算，分支靠标志位判断。
  - **最终结论：** 确认一个有效控制码为0x22e484（输入缓冲区长度0xa0），功能是初始化数据并激活进程创建回调，用DeviceIoControl发送后验证了sub_11160即进程回调；整个分析耗时约两周。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41b75244-d011-81dc-b597-cb44bace4109
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **样本背景：** 64位驱动（约161KB），被VMProtect 2.x保护，IDA仅识别不到20个函数，原始有效函数约6个；vmp不改变函数原始地址，仅替换内部指令为虚拟指令。
> - **函数定位：** 通过导入表与运行时驱动对象分析确认：sub_11160为进程创建回调、sub_11214为设备控制派遣函数、sub_11888为默认派遣、sub_118b0为卸载函数、sub_11068为系统线程函数（强度较低，可见KeWaitForSingleObject等API调用），进程回调疑似需通过设备控制触发。
> - **调试技巧：** 将PE的Subsystem改为console、入口地址指向目标函数，在WinDbg中伪造IRP参数（如eq 12308 0xc、ed 12318 abcd），直接跑虚拟机并输出700多行虚拟指令日志，避免双机调试。
> - **虚拟机机制：** 通过日志还原出等价汇编序列（如mov R23,[R6+b8h]、sub R22,22e484h等），发现vmp用Add/NAnd组合指令实现运算，操作码地址经NAND混淆计算，分支靠标志位判断。
> - **最终结论：** 确认一个有效控制码为0x22e484（输入缓冲区长度0xa0），功能是初始化数据并激活进程创建回调，用DeviceIoControl发送后验证了sub_11160即进程回调；整个分析耗时约两周。

这个样本好多年前就碰见了，当时尝试分析无奈样本被vmp保护起来，ida打开过了几分钟就关掉了。最近分析了FinSpy的虚拟机，然后看了论坛上关于vmp1.8分析帖子，感觉对vmp有点理解了；于是又重新找到到样本准备试试。最后也是跟着vmp1.8帖子的指导一步一步将样本的大致流程及功能分析出来，以下是一些相关记录。  

## 二，准备工作

样本基本信息  
64位驱动文件，大小约161k;加壳信息：vmp 2.x  
ida 打开文件，如下图；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/593fb1d25b0e47ad.webp)

识别的函数不到20个，其中包含几个库函数。根据经验可知，原始文件中大概就6个有效函数（还有函数没有别识别出来），也就是DriverEntry往上。vmp保护的函数，它的原始位置不会改变，它的内部执行指令改变了。以函数sub_11214为例，vmp保护前后，sub_11214都在地址0x11214这个位置不会变；但是sub_11214内部的指令已经不是那种可以“阅读”的汇编指令。  
首先看看，没有被vmp保护的函数，  
sub_11008, 同步访问一个链表，然后对其中所有成员的某个偏移数据置零

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c001993be87e070.webp)

sub_11160，判断第三个参数(r8)是否为零，为零退出；不为零，根据第二个参数(rdx，应该是进程号），从链表中移除对应的成员  
再看一些导入表，有PsSetCreateProcessNotifyRoutine,设置进程创建回调函数；大概率可以推测,sub_11160就是进程创建回调函数

sub_11888， 默认的派遣函数  
  
其它函数 sub_11068,sub_11214,sub_118b0,DriverEntry 被vmp保护起来，静态无法进行分析。  
  
在win7下注册服务，把驱动加载起来；然后用工具看一下驱动对象的相关数据，发现sub_11214是设备控制的派遣函数，sub_11888是打开/写/清除的派遣函数，sub_118b0是卸载函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3b57d6d307356ea9.webp)

最后还有一个sub_11068,不知道是干嘛的。跟一些其内部执行流程，发现sub_11068也被vmp保护了，但是强度没有那么高，可以看到其内部有KeWaitForSigleObject,KeSetPriorityThread等api的调用。结合导入表中PsCreateSystemThread,可以推测这一个是一个线程函数。sub_11068在内部还会调用sub_11008。  
驱动加载后，设备对象，符号链接，派遣函数这些都确定了；但是进程创建回调函数没有设置，可能是需要通过设备控制派遣函数来触发。

## 三，分析虚拟指令

由于是驱动文件，但是又不想双机调试，太麻烦了。于是对样本进行以下修改  
1，PE结构中Subsystem字段改为 Windows console  
2, 将AddressOfEntryPoint设置为需要调试的函数地址(va)  
这样设置比较方便调试，不用来回切窗口；但是需要手动处理伪造一些参数，不然样板很快就崩了。  
虚拟指令的识别可以见参考帖子，基本上就是一致；然后就是虚拟指令的操作数据，需要通过在对应的位置下断点提取；  
下面使用windbg直接跑sub_11214，获得虚拟指令日志；windbg加载文件后，先在sub_11214处设置断点，断点触发后执行下面指令，伪造相关参数；指令如下

```cpp
r @rdx=0x12200 
eq 12218 12400 
eq 122b8 12300
eq 12308 0xc
eq 12310 0xa1
ed 12318 abcd
eq 12498 0x10
```

伪造irp地址为0x12200,后面是程序中会使用到的成员，这样程序不会崩掉。

然后执行windbg脚本，把日子输出到log文件中。下面是sub_11214 第一个跳转前的虚拟指令，非完整日志（完整的日志700多行，超过字数限制）

```cpp
PushVSPQW         bff18;rbp=bff18
PushConstQW       3fca16ffb211;rbp=bff10
PushConstQW       fffffffffffe4b4c;rbp=bff08
PushRegQW         R5; rbp=bff00,R5=246,[rbp-8]=246
PushVSPQW         bfef8;rbp=bfef8
LoadW             [[rbp]];rbp=bfef0,[rbp]=bfef8,[[rbp]]=246
PushConstQW       22820a04;rbp=bfef6
PushConstCBQE     12;rbp=bfee6
PushVSPQW         bfee6;rbp=bfee6
AddQW             [rbp+8], [rbp]  ;rbp=bfede,[rbp+8]=12,[rbp]=bfee6,[rbp+8]+[rbp]=bfef8
PopRegQW          R23;rbp=bfede,[rbp]=202
StoreQW           ;rbp=bfee6,[rbp]=bfef8,[rbp+8]=22820a04
PopRegW           R17;rbp=bfef8,[rbp]=246
NAndQW            [rbp+8],[rbp] ;rbp=bfef8,[rbp+8]=fffffffffffe4b4c,[rbp]=22820a04,~[rbp+8]&~[rbp]=1b4b3
PopRegQW          R2;rbp=bfef8,[rbp]=202
PushRegQW         R15; rbp=bff00,R15=0,[rbp-8]=0
AddQW             [rbp+8], [rbp]  ;rbp=bfef8,[rbp+8]=1b4b3,[rbp]=0,[rbp+8]+[rbp]=1b4b3
PopRegQW          R13;rbp=bfef8,[rbp]=202
LoadQW1           [[rbp]];rbp=bff00,[rbp]=1b4b3,[[rbp]]=ffffc035e9004dff
AddQW             [rbp+8], [rbp]  ;rbp=bff00,[rbp+8]=3fca16ffb211,[rbp]=ffffc035e9004dff,[rbp+8]+[rbp]=10
PopRegQW          R13;rbp=bff00,[rbp]=213
AddQW             [rbp+8], [rbp]  ;rbp=bff08,[rbp+8]=bff18,[rbp]=10,[rbp+8]+[rbp]=bff28 这里加0x10的意思是，前面两个操作数一个0x8,一个R0，一共占0x10字节空间；加上之后表示实际可用的栈地址
PopRegQW          R8;rbp=bff08,[rbp]=206
AddQW             [rbp+8], [rbp]  ;rbp=bff10,[rbp+8]=8,[rbp]=bff28,[rbp+8]+[rbp]=bff30 这里加上0x8的意思是，一般进入函数后[rsp]保存返回地址，rsp 向上存储临时变量
PopRegQW          R17;rbp=bff10,[rbp]=216
StoreQW           ;rbp=bff18,[rbp]=bff30,[rbp+8]=0
---               R20 入栈
PushRegQW         R20; rbp=bff28,R20=0,[rbp-8]=0
---               立即数 0x10 入栈
PushConstQW       f73a7cb72e5af0aa;rbp=bff20
PushConstQW       fffffffffffe89b8;rbp=bff18
PushConstCDQE     5baef11d;rbp=bff08
PushConstB        2a;rbp=bff06
PushConstQW       fffffffffa528888;rbp=bff06
PushVSPQW         bfefe;rbp=bfefe
PushConstCBQE     a;rbp=bfeee
AddQW             [rbp+8], [rbp]  ;rbp=bfeee,[rbp+8]=bfefe,[rbp]=a,[rbp+8]+[rbp]=bff08
PopRegQW          R13;rbp=bfeee,[rbp]=212
StoreQW           ;rbp=bfef6,[rbp]=bff08,[rbp+8]=fffffffffa528888
PushVSPQW         bff06;rbp=bff06
LoadDW1           [[rbp]];rbp=bfefe,[rbp]=bff06,[[rbp]]=8888002a
PushVSPQW         bff02;rbp=bff02
LoadDW1           [[rbp]];rbp=bfefa,[rbp]=bff02,[[rbp]]=8888002a
PopRegDW          R2;rbp=bfefe,[rbp]=8888002a
PushRegW          R13; rbp=bff02,R13=212
PopRegDW          R17;rbp=bff00,[rbp]=2a0012
PopRegDW          R2;rbp=bff04,[rbp]=2a8888
NAndQW            [rbp+8],[rbp] ;rbp=bff08,[rbp+8]=fffffffffffe89b8,[rbp]=fffffffffa528888,~[rbp+8]&~[rbp]=17647
PopRegQW          R23;rbp=bff08,[rbp]=206
PushRegQW         R15; rbp=bff10,R15=0,[rbp-8]=0
AddQW             [rbp+8], [rbp]  ;rbp=bff08,[rbp+8]=17647,[rbp]=0,[rbp+8]+[rbp]=17647
PopRegQW          R8;rbp=bff08,[rbp]=206
LoadQW1           [[rbp]];rbp=bff10,[rbp]=17647,[[rbp]]=8c58348d1a50f66
AddQW             [rbp+8], [rbp]  ;rbp=bff10,[rbp+8]=f73a7cb72e5af0aa,[rbp]=8c58348d1a50f66,[rbp+8]+[rbp]=10
PopRegQW          R2;rbp=bff10,[rbp]=213
---               mov  qword ptr [rsp+10h],R20
===               mov  qword ptr [rsp+10h],R20
PushVSPQW         bff18;rbp=bff18
PushConstQW       163fd628227f0a1b;rbp=bff10
PushConstQW       ffffffffe15b20eb;rbp=bff08
PushConstQW       1ea65564;rbp=bff00
PushRegB          R9; rbp=bfef8,R9=00
PopRegW           R13;rbp=bfef8,[rbp]=0
AddQW             [rbp+8], [rbp]  ;rbp=bfef8,[rbp+8]=ffffffffe15b20eb,[rbp]=1ea65564,[rbp+8]+[rbp]=1764f
PopRegQW          R8;rbp=bfef8,[rbp]=203
PushRegQW         R15; rbp=bff00,R15=0,[rbp-8]=0
AddQW             [rbp+8], [rbp]  ;rbp=bfef8,[rbp+8]=1764f,[rbp]=0,[rbp+8]+[rbp]=1764f
PopRegQW          R2;rbp=bfef8,[rbp]=202
LoadQW1           [[rbp]];rbp=bff00,[rbp]=1764f,[[rbp]]=e9c029d7dd80f5f5
AddQW             [rbp+8], [rbp]  ;rbp=bff00,[rbp+8]=163fd628227f0a1b,[rbp]=e9c029d7dd80f5f5,[rbp+8]+[rbp]=10
PopRegQW          R23;rbp=bff00,[rbp]=213
AddQW             [rbp+8], [rbp]  ;rbp=bff08,[rbp+8]=bff18,[rbp]=10,[rbp+8]+[rbp]=bff28
PopRegQW          R13;rbp=bff08,[rbp]=206
AddQW             [rbp+8], [rbp]  ;rbp=bff10,[rbp+8]=10,[rbp]=bff28,[rbp+8]+[rbp]=bff38
 
---               mov  R19,dword ptr [R23+8h]
===               mov  R19,dword ptr [R23+8h]
PushRegQW         R23; rbp=bfeb8,R23=12300,[rbp-8]=12300
AddQW             [rbp+8], [rbp]  ;rbp=bfeb0,[rbp+8]=8,[rbp]=12300,[rbp+8]+[rbp]=12308
PopRegQW          R4;rbp=bfeb0,[rbp]=202
LoadDW            [[rbp]];rbp=bfeb8,[rbp]=12308,[[rbp]]=c
PopRegDW          R19;rbp=bfebc,[rbp]=c
---
PushConstDW       fff11117;rbp=bfec0
PushConstQW       58f35b49;rbp=bfebc
PushRegQW         R1; rbp=bfeb4,R1=58480261,[rbp-8]=58480261
PushRegW          R6; rbp=bfeac,R6=12200
PushConstQW       ffffffffa70e19a7;rbp=bfeaa
PushVSPQW         bfea2;rbp=bfea2
PushConstCBQE     a;rbp=bfe92
AddQW             [rbp+8], [rbp]  ;rbp=bfe92,[rbp+8]=bfea2,[rbp]=a,[rbp+8]+[rbp]=bfeac
PopRegQW          R4;rbp=bfe92,[rbp]=206
StoreQW           ;rbp=bfe9a,[rbp]=bfeac,[rbp+8]=ffffffffa70e19a7
PushVSPQW         bfeaa;rbp=bfeaa
LoadDW1           [[rbp]];rbp=bfea2,[rbp]=bfeaa,[[rbp]]=19a70000
PopRegDW          R10;rbp=bfea6,[rbp]=19a70000
PopRegW           R8;rbp=bfeac,[rbp]=0
AddQW             [rbp+8], [rbp]  ;rbp=bfeac,[rbp+8]=58f35b49,[rbp]=ffffffffa70e19a7,[rbp+8]+[rbp]=174f0
PopRegQW          R9;rbp=bfeac,[rbp]=217
PushRegQW         R15; rbp=bfeb4,R15=0,[rbp-8]=0
AddQW             [rbp+8], [rbp]  ;rbp=bfeac,[rbp+8]=174f0,[rbp]=0,[rbp+8]+[rbp]=174f0
PopRegQW          R10;rbp=bfeac,[rbp]=206
LoadDW            [[rbp]];rbp=bfeb4,[rbp]=174f0,[[rbp]]=eeee9
AddDW             [rbp+4],[rb];rbp=bfeb8,[rbp+4]=fff11117,[rbp]=eeee9,[rbp+4]+[rbp]=0
PopRegQW          R9;rbp=bfeb4,[rbp]=257
PopRegDW          R19;rbp=bfebc,[rbp]=0
---               立即数  22e484 入栈
PushConstDW       225c2586;rbp=bfec0
PushConstQW       fffffffffffe89b0;rbp=bfebc
PushConstQW       53168010;rbp=bfeb4
NAndQW            [rbp+8],[rbp] ;rbp=bfeac,[rbp+8]=fffffffffffe89b0,[rbp]=53168010,~[rbp+8]&~[rbp]=1764f
PopRegQW          R9;rbp=bfeac,[rbp]=202
PushRegQW         R15; rbp=bfeb4,R15=0,[rbp-8]=0
AddQW             [rbp+8], [rbp]  ;rbp=bfeac,[rbp+8]=1764f,[rbp]=0,[rbp+8]+[rbp]=1764f
PopRegQW          R13;rbp=bfeac,[rbp]=202
LoadDW            [[rbp]];rbp=bfeb4,[rbp]=1764f,[[rbp]]=dd80f5f5
AddDW             [rbp+4],[rb];rbp=bfeb8,[rbp+4]=225c2586,[rbp]=dd80f5f5,[rbp+4]+[rbp]=ffdd1b7b
PopRegQW          R8;rbp=bfeb4,[rbp]=286
PushConstDW       59d1322;rbp=bfebc
PushRegB          R6; rbp=bfeb8,R6=12200
PopRegW           R10;rbp=bfeb8,[rbp]=2200
NAndDW            [rbp+4],[rbp] ;rbp=bfeb8,~(ffdd1b7b)&~(59d1322)=22e484
PopRegQW          R9;rbp=bfeb4,[rbp]=206
---               sub  R22,22e484h
===               sub  R22,22e484h
PushRegDW         R22; rbp=bfebc,R22=abcd 伪造的参数
PushRegDW         R22; rbp=bfeb8,R22=abcd
NAndDW            [rbp+4],[rbp] ;rbp=bfeb4,~(abcd)&~(abcd)=ffff5432
PopRegQW          R10;rbp=bfeb0,[rbp]=282
AddDW             [rbp+4],[rb];rbp=bfeb8,[rbp+4]=22e484,[rbp]=ffff5432,[rbp+4]+[rbp]=2238b6
PopRegQW          R4;rbp=bfeb4,[rbp]=203
PushVSPQW         bfebc;rbp=bfebc
LoadDW1           [[rbp]];rbp=bfeb4,[rbp]=bfebc,[[rbp]]=2238b6
NAndDW            [rbp+4],[rbp] ;rbp=bfeb8,~(2238b6)&~(2238b6)=ffddc749
PopRegQW          R13;rbp=bfeb4,[rbp]=282
PopRegDW          R22;rbp=bfebc,[rbp]=ffddc749   这里相当于做减法 ffddc749=abcd-22e484
---
 
 
PushConstCDQE     322998c0;rbp=bfe8e
PushVSPQW         bfe8e;rbp=bfe8e
LoadW             [[rbp]];rbp=bfe86,[rbp]=bfe8e,[[rbp]]=98c0
PushConstQW       ffffffff88af147b;rbp=bfe8c
PushConstCBQE     12;rbp=bfe7c
PushVSPQW         bfe7c;rbp=bfe7c
AddQW             [rbp+8], [rbp]  ;rbp=bfe74,[rbp+8]=12,[rbp]=bfe7c,[rbp+8]+[rbp]=bfe8e
PopRegQW          R4;rbp=bfe74,[rbp]=206
StoreQW           ;rbp=bfe7c,[rbp]=bfe8e,[rbp+8]=ffffffff88af147b
PushVSPQW         bfe8c;rbp=bfe8c
LoadW             [[rbp]];rbp=bfe84,[rbp]=bfe8c,[[rbp]]=98c0
PopRegDW          R8;rbp=bfe8a,[rbp]=98c098c0
AddQW             [rbp+8], [rbp]  ;rbp=bfe8e,[rbp+8]=7750eb44,[rbp]=ffffffff88af147b,[rbp+8]+[rbp]=ffffffffffffffbf
PopRegQW          R4;rbp=bfe8e,[rbp]=282
NAndQW            [rbp+8],[rbp] ;rbp=bfe96,[rbp+8]=fffffffffffffd7c,[rbp]=ffffffffffffffbf,~[rbp+8]&~[rbp]=0
PopRegQW          R8;rbp=bfe96,[rbp]=246
ShrQW             [rbp],[rbp+8];rbp=bfe9e,[rbp]=0,[rbp+8]=3  这里检查标识位 zf，不为1，表示不等；对比相等情况下更明显
PopRegQW          R8;rbp=bfe98,[rbp]=246
AddQW             [rbp+8], [rbp]  ;rbp=bfea0,[rbp+8]=bfeb0,[rbp]=0,[rbp+8]+[rbp]=bfeb0
PopRegQW          R8;rbp=bfea0,[rbp]=202
LoadQW            [[rbp]];rbp=bfea8,[rbp]=bfeb0,[[rbp]]=92158c53  后面用来计算操作码地址
PopRegQW          R18;rbp=bfea8,[rbp]=92158c53          
PopRegQW          R9;rbp=bfeb0,[rbp]=92158c53  分支 1  不等于
PopRegQW          R5;rbp=bfeb8,[rbp]=9215b196  分支 2  等于
---
PushRegQW         R18; rbp=bfec0,R18=92158c53,[rbp-8]=92158c53
PushVSPQW         bfeb8;rbp=bfeb8
LoadDW1           [[rbp]];rbp=bfeb0,[rbp]=bfeb8,[[rbp]]=92158c53
PopRegDW          R18;rbp=bfeb4,[rbp]=92158c53
PushRegDW         R18; rbp=bfeb8,R18=92158c53
NAndDW            [rbp+4],[rbp] ;rbp=bfeb4,~(92158c53)&~(92158c53)=6dea73ac
PopRegQW          R8;rbp=bfeb0,[rbp]=206
PushConstDW       6de9dfba;rbp=bfeb8
NAndDW            [rbp+4],[rbp] ;rbp=bfeb4,~(6dea73ac)&~(6de9dfba)=92140041
PopRegQW          R9;rbp=bfeb0,[rbp]=286
PushConstDW       92162045;rbp=bfeb8
PushRegDW         R18; rbp=bfeb4,R18=92158c53
NAndDW            [rbp+4],[rbp] ;rbp=bfeb0,~(92162045)&~(92158c53)=6de853a8
PopRegQW          R4;rbp=bfeac,[rbp]=202
NAndDW            [rbp+4],[rbp] ;rbp=bfeb4,~(92140041)&~(6de853a8)=3ac16   计算操作码地址，不是直接代码地址
PopRegQW          R8;rbp=bfeb0,[rbp]=202
PopRegQW          R9;rbp=bfeb8,[rbp]=3ac16
```

对上面的虚拟指令进行手动还原简化，如下

```cpp
    Line 53: ===                mov  qword ptr [rsp+8h],R0
    Line 110: ===               mov  qword ptr [rsp+10h],R20
    Line 147: ===               mov  qword ptr [rsp+18h],R9
    Line 226: ===               sub  rsp,0x50
    Line 274: ===               mov  R23,qword ptr [R6+b8h]
    Line 314: ===               mov  R17,qword ptr [R6+18h]
    Line 339: ===               mov  R22,dword ptr [R23+18h]
    Line 388: ===               mov  R7,dword ptr [R23+10h]
    Line 433: ===               mov  R19,dword ptr [R23+8h]
    Line 481: ===               sub  R22,22e484h
```

通过对虚拟指令的分析，加上调试确定其控制码之一是0x22e484,输入缓冲区长度0xa0。该控制码对应的功能是对一下数据进行初始化，并激活进程创建回调函数等。

调用DeviceIoControl发送请求包，成功执行0x22e484对应的功能；与前面推测sub_12160是进程创建回调函数一致

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c7c4dc286a9196a.webp)

## 四，总结

vmp保护的样本分析起来确实费劲。如果分析原始文件的几个函数，可能一两个小时就分析的差不多。 这个样本前前后后花了两周，扎心:)

相关样本及脚本在附件中

**参考：**

**[https://bbs.kanxue.com/thread-286278-1.htm](https://bbs.kanxue.com/thread-286278-1.htm)**

**解压密码： 123**

## 附件

- [1111.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/11/e8855bf8df9bab1e.zip) （359.33kb，4次下载）
