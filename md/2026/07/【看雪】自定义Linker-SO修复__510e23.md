---
title: 【看雪】自定义Linker SO修复
source: https://bbs.kanxue.com/thread-291861.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-02T16:41:36+08:00
trace_id: 4bae0cb2-4146-49a7-b960-4ad5ce32aada
content_hash: c87f5c8e7b4bf47c0e6834d9f125fd4888d570b2fd4566d18818fe65f23d93ce
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 针对加壳SO抹除节区信息和内嵌加密SO的情况，提出了系统性的修复方案以便IDA分析。
ai_summary_style: key-points
images_status:
  total: 51
  succeeded: 51
  failed_urls: []
notion_page_id: 39175244-d011-815e-98bb-f13324b14d76
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 针对加壳SO抹除节区信息和内嵌加密SO的情况，提出了系统性的修复方案以便IDA分析。
> 
> - **壳SO修复核心：** 通过解析 `.dynamic` 段获取关键节区信息（如 `.init_array`、`.rela.dyn`、`.dynsym`、`.rela.plt`、`.got` 的地址和大小），并手动修复被抹除的节表，以还原函数符号和重定位表。
> - **内嵌SO解密流程：** 从壳SO中定位加密的Payload SO起始地址，根据分析获取RC4和XOR密钥，先用RC4解密ELF头，再用XOR解密后续数据（包括程序头表），最后计算并提取出完整的SO文件。
> - **内嵌SO内存dump修复：** 针对从内存中dump出的已解密SO，其节头表信息缺失。修复方法包括：将段的内存地址回填为文件偏移、清空原有节表、解析Dynamic段获取关键节区地址、并参考所属段计算偏移来重建各个节表。
> - **壳SO运作分析：** 壳SO在 `init_array` 阶段运行，负责解密内嵌SO，使用自定义Linker将其加载到内存，并完成重定位。随后将内嵌SO的关键节区（如 `.hash`, `.dynsym`, `.dynstr`）数据回填到自身内存中，以执行内嵌SO的 `JNI_OnLoad` 函数。

看之前最好是对linker相关的知识有一定了解，这里推荐文章 [Android从ELF-Loader到自定义Linker的实现及原理](https://bbs.kanxue.com/thread-290643.htm#msg_header_h2_36) ，该文章写的很详细，很好。

## 概述

因为这是一个壳so(Shell SO)内嵌一个so(Payload SO)。system.loadlibray加载壳so，遵循linker加载so的流程。内嵌so是由壳so通过自定义Linker去加载。

本文目的主要针对壳so和内嵌so的修复，方便IDA等工具分析。

## 壳so修复

ida加载so，主要可以看到这里，大部分节区信息都被抹掉，导致ida无法正常识别。因为ida是静态分析的,所以依赖section节区。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/860d5ace5c9aab36.png)

这里的sub_2A30和sub_2A50很明显分别是 **dlopen** 和 **dlsym** ，但是这里也没有识别出来。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5e2ff00283eba7e8.png)

所以后面需要把壳入口.init_array和系统函数进行修复还原。

### 1.init_array

这里会优先执行.init_array节区里的函数，所以先找到这个节区里有哪些函数。

PT_DYNAMIC:动态链接信息节

Program里 PT_DYNAMIC(.dynamic) 找 DT_INIT_ARRAY（d_tag: 0x19）和 DT_INIT_ARRAYSZ (d_tag: 0x1b)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/888d13c60bc54922.png)

.dynamic里每个表项数据有16字节,相关结构如下。

> typedef struct {
> 
> Elf64_Sxword d_tag;
> 
> union {
> 
> ```python
> Elf64_Xword d_val;
> 
> Elf64_Addr d_ptr;
> ```
> 
> } d_un;
> 
> } Elf64_Dyn;

.dynamic表数据：

```
01 00 00 00 00 00 00 00 01 00 00 00 00 00 00 00
01 00 00 00 00 00 00 00 09 00 00 00 00 00 00 00
01 00 00 00 00 00 00 00 17 00 00 00 00 00 00 00
01 00 00 00 00 00 00 00 21 00 00 00 00 00 00 00
01 00 00 00 00 00 00 00 2E 00 00 00 00 00 00 00
01 00 00 00 00 00 00 00 36 00 00 00 00 00 00 00
01 00 00 00 00 00 00 00 3E 00 00 00 00 00 00 00
0E 00 00 00 00 00 00 00 62 08 00 00 00 00 00 00
10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
19 00 00 00 00 00 00 00 08 4D 01 00 00 00 00 00
1B 00 00 00 00 00 00 00 10 00 00 00 00 00 00 00
1A 00 00 00 00 00 00 00 18 4D 01 00 00 00 00 00
1C 00 00 00 00 00 00 00 10 00 00 00 00 00 00 00
04 00 00 00 00 00 00 00 00 C0 16 00 00 00 00 00
05 00 00 00 00 00 00 00 00 B0 16 00 00 00 00 00
06 00 00 00 00 00 00 00 00 90 16 00 00 00 00 00
0A 00 00 00 00 00 00 00 77 08 00 00 00 00 00 00
0B 00 00 00 00 00 00 00 18 00 00 00 00 00 00 00
03 00 00 00 00 00 00 00 18 4F 01 00 00 00 00 00
02 00 00 00 00 00 00 00 40 02 00 00 00 00 00 00
14 00 00 00 00 00 00 00 07 00 00 00 00 00 00 00
17 00 00 00 00 00 00 00 30 27 00 00 00 00 00 00
07 00 00 00 00 00 00 00 E8 26 00 00 00 00 00 00
08 00 00 00 00 00 00 00 48 00 00 00 00 00 00 00
09 00 00 00 00 00 00 00 18 00 00 00 00 00 00 00
18 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
FB FF FF 6F 00 00 00 00 01 00 00 00 00 00 00 00
F9 FF FF 6F 00 00 00 00 02 00 00 00 00 00 00 00
```

> 19 00 00 00 00 00 00 00 08 4D 01 00 00 00 00 00

DT_INIT_ARRAY：0x14D08

> 1B 00 00 00 00 00 00 00 10 00 00 00 00 00 00 00

DT_INIT_ARRAYSZ: 0x10

这里可以看到，.init_array节区起始是0x14D08，大小为0x10个字节,每8个字节为1个函数槽,也就是有两个函数槽在里面。

进入ida查看,这里的地址0x14D08里面怎么没有对应存储的函数呢，接下来就要去.rela.dyn里去找0x14D08地址存储的函数。因为这里是变量赋值,所以要去重定位表.rela.dyn里查看。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/53bd722a352b712b.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/48b64dae3e5ca589.png)

这里在节表里没有发现.rela.dyn,看来也是抹除了，所以需要再去.dynamic里找到.rela.dyn并修复。

#### 1） 修复.rela.dyn

.dynamic表获取对应数据

> 07 00 00 00 00 00 00 00 E8 26 00 00 00 00 00 00

DT_RELA: 0x26e8

> 08 00 00 00 00 00 00 00 48 00 00 00 00 00 00 00

DT_RELASZ: 0x48

然后点开节表所有的SHN_UNDEF，找里面的s_type为SHT_RELA的节，这里找到两个重定位表,那么用哪一个呢？因为.rela.dyn的s_info为0，所以这里我们就选s_info为0的节。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f2b1c54b9a86b918.png)

把上面获取的0x26e8和0x48对应填入。然后s_name的偏移也要在.shstrtab里找到.rela.dyn的字符串偏移。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2b8da03698b45973.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/91a3c4db3f478f80.png)

然后F5刷新下修改的文件。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7787985c8fcd684b.png)

ida打开，在ida里可以看到,有需要被修复的地址就自动填充进去了，这里只有一个函数槽需要被修复。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/40914399e7a6a85f.png)

#### 2） 修复.init_array

但是这样感觉还不得劲,想让它的.init_array节区显示出来,继续去SHN_UNDEF找s_type为SHT_INIT_ARRAY

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9ef0715b24ce6eb5.png)

修复后：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5ae29a8bd52e4eef.png)

这里的s_offset可以不填。我们只保证虚拟内存地址(s_addr)是正确的就行了。

进入ida可以看到.init_array已经被修复了。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a096aa7bcc9b15a3.png)

### 2\. 修复系统函数显示

进入0x4780系统函数,明显看出sub_2A30是 **dlopen** 函数，sub_2A50是 **dlsym** 函数，但是这里都是以函数偏移显示的，没有正常的符号名。那么接下来就要修复这类符号名显示问题。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c0b08e53710a093f.png)

看.dynsym是否正常显示

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9e4d36c9d7ee60ec.png)

看来.dynsym里的所有数据也是被抹除了。

#### 1） 修复.dynsym

> 06 00 00 00 00 00 00 00 00 90 16 00 00 00 00 00

DT_SYMTAB: 0x169000

原始的是0x2268，所以这里是假的.dynsym。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9e854c8ab80d2ef3.png)

修复后：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d04936e9b42a7047.png)

* * *

**为什么这里s_offset是0x129000？**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/de3f1dd1156bf6e0.png)

这里有个小细节，一个程序头表是由多个节表组成，程序头表里，p_offset和p_vaddr的差值是多少，那么应用在对应的节表里时，s_offset和s_addr也应该是这个差值。ida这里工具解析ELF文件时，会以内存的模式去加载，这里就会去把物理文件的偏移s_offset的数据复制到虚拟内存的偏移s_addr处。

因为0x169000刚好处在segment `0x47000~(0x47000+0x1256d0)` 这个范围里。p_vaddr是在p_offset的基础上增加了0x40000。所以这里文件偏移应该是 `0x169000-0x40000=0x129000` 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8ac2d38045d50937.png)

函数在010Editor里已经能正常显示了，这里就好了吗？不是，还需要去修复.rela.plt 函数重定位表。

#### 2） 修复.rela.plt

> 17 00 00 00 00 00 00 00 30 27 00 00 00 00 00 00

DT_JMPREL：0x2730

> 02 00 00 00 00 00 00 00 40 02 00 00 00 00 00 00

DT_PLTRELSZ：0x240

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5eccac3901c52439.png)

修复后：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3abfccfcf31e4b33.png)

s_flags: 这里需要的模式是ALLOC|INFO_LINK，也就是0x42。

s_link: 链接的节.dynsym，在节表的索引。

s_info: 这是got/.got.plt表在节表的索引。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c86a6a57985cdd06.png)

由上可知，s_info我们还不清楚是多少，并且节表字符串里有.got，这里我们要去修复.got表。

#### 3） 修复.got

**怎么选?**

只要s_type为SHT_PROGBITS ，s_flags为SF64_Alloc_Exec ，都可以作为.got表。这里就选节表索引14作为.got表。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b006fa6e98f3ac6e.png)

查询.dynamic

> 03 00 00 00 00 00 00 00 18 4F 01 00 00 00 00 00

DT_PLTGOT: 0x14f18

.got表的大小需要自己计算，上面已知DT_PLTRELSZ大小为0x240，因为.rela.plt的每项大小为24字节，这里就有0x240/24=24 个函数，并且.got表的前3个槽位是填充，每个槽位大小为8字节，这里.got size则为(24+3)\*8=0xd8

修复后：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f46bbf93f3ee8ce1.png)

这里.got表也修复了，接着就可以补全上面.rela.plt的s_info信息,也就是got表在节表的索引为0xE

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5a3d027d32a0d4f1.png)

### 3\. 壳SO修复成果

ida查看,这里函数符号也都能正常显示了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/154a679a65be3c56.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/68213e9865a82d0b.png)

### 4.分析壳so的运作

##### 1.初始化分析

这里是在init_array里进行内嵌so的解密操作，并用自定义linker去加载内嵌so

init_array的运作函数sub_4780

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d804f559dab38d64.png)

这些地址处的数据比较重要

> dword_15040 = dword_15008;
> 
> dword_15064 = dword_1500C;
> 
> dword_15078 = dword_15010;
> 
> dword_15030 = dword_15014;
> 
> dword_15088 = dword_15018;
> 
> dword_15084 = dword_1501C;
> 
> dword_1507C = dword_15020;

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1021b06ce1249a7f.png)

dword_15040：内嵌so在壳so的起始地址

dword_15064：壳.dynsym节区的大小

dword_15078：壳.dynstr节区的大小

dword_15030：壳.dynsym节区在内存里的地址(s_addr)

dword_15088：壳.dynstr节区在内存里的地址(s_addr)

dword_15084：壳.hash节区在内存里的地址(s_addr)

dword_1507C：解密内嵌so的密钥偏移地址

垃圾代码，主要是干扰静态分析的，不用理会

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e16f469c226c4486.png)

##### 2.获取解密密钥

读取 **dword_1507C** 地址 **0x14** 个字节的内容到 **qword_15050** 处，前16个字节是rc4解密的密钥，后4个字节是异或解密的密钥(这里值是单字节)。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/748bcdde7f3fce8a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c1c5242f3b9e43dd.png)

010Editor查看可知

> rc4密钥:2F CE A7 38 12 73 AC 59 57 7E 56 B5 5F 59 C9 85
> 
> xor密钥字节：0x95

##### 3.解密函数

sub_3184：rc4解密函数

-   a1: 加密输入\\解密输出

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ee9b2843bb7bc3f6.png)

sub_2B1C：xor异或解密函数

-   a1: 加密输入\\解密输出
-   a2: 起始偏移
-   a3: 需要解密的长度

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3cf7a7ba3c389627.png)

##### 4.rc4解密内嵌so ELF头数据(0x40字节)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/16f214e6085f60e4.png)

##### 5.xor解密

这里解密内嵌so前0x1000字节内容，主要解密出程序头表的内容。用于后续装载PT_Load段数据，和重定位修复。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4851f29da081ea6f.png)

解密PT_Load

这里是解密第二个PT_Load段

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7d05917f9a8eec08.png)

从内嵌so偏移64字节开始解密，这里是解密第一个PT_Load段

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/20cf801eb30539c8.png)

##### 6.计算PT_Load段需要的空间

计算PT_Load段在内存里占用的空间大小，也就是so运行需要的空间大小。用mmap申请一段匿名空间，供后面从文件里装载数据到这段匿名空间。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8175693b04fba64a.png)

装载数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ac9b60b1377b1f8c.png)

##### 7.解析Dynamic段

里面包含节区的偏移数据内容和大小

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/af50d35844ca78d5.png)

##### 8.修复重定位表

sub_2CD0

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/736daf036757865a.png)

##### 9.内嵌so初始化函数调用

init\\init_array函数调用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/afddb7a1fd786868.png)

sub_303C：JNI_OnLoad函数符号地址解析

##### 10.回填数据

把内嵌so的\*\*.hash\*\*、**.dynsym** 、\*\*.dynstr \*\*这三个节表的数据回填进壳so的对应地址。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/de3ba0f6f836d93b.png)

## 内嵌so修复

这里以两种方案来解决内嵌so的修复

1）因为内嵌so是加密了的，通过解密运算得到so

2）从内存dump得到解密后的so

### 方案① 解密得到内嵌so

从壳so的运作流程分析可以知道，

-   内嵌so的起始地址在壳so偏移0x8000地址处。
-   内嵌so的header(前0x40字节)数据，是用rc4解密得到。
-   内嵌so从0x40偏移处开始都是异或解密

整体解密流程知道了，下面用python进行还原出整个内嵌so。

#### 1.引用库

> import lief
> 
> import hexdump
> 
> import struct
> 
> from Crypto.Cipher import ARC4

> pip install lief==0.17.6
> 
> pip install hexdump==3.3
> 
> pip install pycryptodome==3.23.0

-   lief: 用于解析二进制文件格式
-   hexdump: 以内存形式打印数据，方便查看
-   pycryptodome: 加密库，这里需要rc4

#### 2.包装壳so

so名字脱敏处理了

这里通过SoFixer构造一个实例,init初始化主要做了对so的解析

```python
path = "shell.so"
key_offset = 0x1281DD
shell_so = SoFixer(path)
```

```python
class SoFixer:
    def __init__(self, path):
        self.path = path
        self.binary = lief.ELF.parse(path)
        if isinstance(path, str):
            self.so_base = memoryview(bytearray(open_so(path)))  # str形式传入
        else:
            self.so_base = memoryview(bytearray(path))  # bytes形式传入

        self.Ehdr = self.so_base[0:64]

        # 解析Program
        self.e_phoff = self.binary.header.program_header_offset
        self.e_phentsize = self.binary.header.program_header_size
        self.e_phnum = self.binary.header.numberof_segments
        self.Phdr = self.so_base[self.e_phoff:]

        # 解析Section
        self.e_shoff = self.binary.header.section_header_offset
        self.e_shentsize = self.binary.header.section_header_size
        self.e_shnum = self.binary.header.numberof_sections
        self.e_shtrndx = self.binary.header.section_name_table_idx
        self.Shdr = self.so_base[self.e_shoff:]
```

#### 3.定位内嵌so

```python
payload_so = shell_so.so_base[0x8000:]
```

#### 4.定位解密密钥

```python
key = shell_so.so_base[key_offset:(key_offset + 20)]
```

#### 5.获取到rc4和xor的密钥key

```python
rc4_key = key[:16]
xor_key = read_u32(key[16:20], 0)
```

#### 6.解密内嵌SO的ELF Header

```python
payload_so_ehdr = rc4(payload_so[:64], rc4_key)
# hexdump_bytes(payload_so,64)
memcpy(payload_so, payload_so_ehdr, 64)
print("Payload SO Header解密完成")
```

#### 7.包装内嵌SO

```python
payload_so = SoFixer(bytes(payload_so))
```

#### 8.计算内嵌SO的大小

从so文件格式可以知道，Section Header Table是在整个so的尾部，所以我们只需要知道节头表的起始地址，和整个表的大小，就可以得到so文件的大小。

通过上面rc4解密，拿到ELF Header数据后，我们就可以拿到 **e_shoff、e_shnum、e_shentsize** 数据，通过这些就可以计算出节头表的结束地址，这个也就是整个so的文件大小。

```python
payload_so_size = payload_so.e_shoff + payload_so.e_shnum * payload_so.e_shentsize
```

#### 9.异或解密出整个SO里除ELF Header以外的所有数据

```python
xor_decrypt(payload_so.so_base, payload_so.e_phoff, payload_so_size-payload_so.e_phoff, xor_key)
```

#### 10.保存内嵌so

```python
payload_so.save("payload_so.so", payload_so.so_base[:payload_so_size])
```

#### 11.内嵌so解密成果展示

##### 010Editor

所有节表正常显示

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ec59e530d0bec781.png)

函数符号也可以显示

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/eaf2a22290153688.png)

##### IDA

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5b28cfc00755165b.png)

### 方案② 内存dump得到内嵌so

这里面字符串都是加密了的，需要在代码运行后，这个时候字符串是解密的了，从内存里dump数据，就能清晰的知道代码里做了什么。

根据linker的执行流程，在so加载完后会先经过init、init_array初始化，再去解析JNI_OnLoad函数，有就执行。因为壳本身是没有JNI_OnLoad函数的，而内嵌so是有JNI_OnLoad函数，所有检测和dex释放都是在这里面进行的，壳so把内嵌so的三个节表给回填进了壳的数据空间，此时壳里就会有内嵌so的JNI_OnLoad函数了,linker就会去执行JNI_OnLoad函数。

所以直接在JNI_OnLoad函数执行完后去dump数据,这里不演示了,只讲so的修复，dump的so会提供。

#### 1.现象

查看dump下来的so数据，ELF Header和Program Header Table都是解密后的数据，就后面的Section Header Table的信息没有，这是因为linker加载so，是可以不需要Section Header Table信息的，这个只是给类似IDA这类工具分析所需要的。这里我们就去修复节信息。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/347e561b366a0ee3.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c37c3d4130adb684.png)

#### 2.包装dump so

```python
path = "dump.so"
fixer = SoFixer(path)
```

#### 3.收集PT_Load段

一个段是由多个节组成，节表的addr和offset修复需要参考所属段的addr和offset的差值。供后续节表修复作准备。

```python
fixer.collect_load_segments()
```

> def collect_load_segments(self):  
> segments = self.binary.segments  
> self.load_segments = list()

```python
for i in range(self.e_phnum):  
    segment = segments[i]  
    if segment.type == 1:  
        pls = self.PT_Load_Segment(segment.virtual_address,  
                                   segment.virtual_address + segment.virtual_size,  
                                   segment.file_offset,  
                                   segment.physical_size,  
                                   segment.virtual_size)  
        self.load_segments.append(pls)
```

#### 4.修复所有段的地址和大小

因为是内存dump下来的so，物理地址和大小已经没有意义了，这里就把所有物理地址和大小全部替换为内存地址和大小。

```python
fixer.fix_segment()
```

> def fix_segment(self):  
> segments = self.binary.segments  
> for i in range(self.e_phnum):  
> segment = segments\[i\]  
> pt = self.Phdr\[i \* self.e_phentsize:\]

```python
    if segment.file_offset != segment.virtual_address:  
        write_u64(pt, 0x8, segment.virtual_address)  # 修改p_offset为p_vaddr  
    if segment.physical_size != segment.virtual_size:  
        write_u64(pt, 0x20, segment.virtual_size)  # 修改p_filesz为pmemsz
```

#### 5.清零所有节头表

dump so里节表里的信息全是无用的大数据，这里直接全部清0处理，免得拖入ida时会提示报错信息。

```python
fixer.clean_section()
```

> def clean_section(self):  
> for i in range(self.e_shnum):  
> st = self.Shdr\[i \* self.e_shentsize:\]  
> memset(st, 0, self.e_shentsize)

#### 6.修复节名字符串表

既然要修复节表，肯定要有所有的节名，这里直接引用的壳so里的节名字符串表。位置就放置在Section Header Table的前面。

为什么要这样放? 根据标准ELF 文件格式来的，节名字符串表(.shstrtab)在所有节表里的最后一个。

```python
fixer.fix_shstrtab()
```

> def fix_shstrtab(self):  
> \# 准备节头字符串表的数据内容，从壳so里获取的数据  
> shstrtabl_hex_str = """  
> 00 2E 65 68 5F 66 72 61 6D 65 5F 68 64 72 00 2E  
> 66 69 6E 69 5F 61 72 72 61 79 00 2E 69 6E 69 74  
> 5F 61 72 72 61 79 00 2E 73 68 73 74 72 74 61 62  
> 00 2E 65 68 5F 66 72 61 6D 65 00 2E 72 65 6C 61  
> 2E 70 6C 74 00 2E 72 65 6C 61 2E 64 79 6E 00 2E  
> 63 6F 6D 6D 65 6E 74 00 2E 64 79 6E 61 6D 69 63  
> 00 2E 72 6F 64 61 74 61 00 2E 64 79 6E 73 74 72  
> 00 2E 64 79 6E 73 79 6D 00 2E 64 61 74 61 00 2E  
> 74 65 78 74 00 2E 68 61 73 68 00 2E 62 73 73 00  
> 2E 67 6F 74 00  
> """  
> shstrtabl_data = bytes.fromhex(shstrtabl_hex_str.replace("\\n", " ").strip())

```python
# 定位节头字符串表里数据内容的s_offset  
"""  
标准ELF，节名字符串表的数据内容就在Section Table的上方紧挨着。  
"""  
## 向上8字节对齐  
align_shstrtab_data_len = align_up(len(shstrtabl_data))  
  
# 复制数据  
## 标准ELF的节头字符串表都是在节头表的上方  
shstrtab_s_offset = self.e_shoff - align_shstrtab_data_len  
# print_format("shstrtab_s_offset", hex(shstrtab_s_offset))  
memcpy(self.so_base[shstrtab_s_offset:], shstrtabl_data, len(shstrtabl_data))  
# hexdump_bytes(self.so_base[shstrtab_s_offset:],len(shstrtabl_data))  
  
# 修复  
shstrtab_item = self.Shdr[self.e_shtrndx * self.e_shentsize:]  
shstrtab_section = SoFixer.Section(shstrtab_item)  
shstrtab_section.set_name(0x27)  
shstrtab_section.set_type(lief.ELF.Section.TYPE.STRTAB.value)  
shstrtab_section.set_flags(lief.ELF.Section.FLAGS.NONE.value)  
shstrtab_section.set_addr(0)  
shstrtab_section.set_offset(shstrtab_s_offset)  
shstrtab_section.set_size(len(shstrtabl_data))  
shstrtab_section.set_link(0)  
shstrtab_section.set_info(0)  
shstrtab_section.set_addralign(1)  
shstrtab_section.set_entsize(0)
```

#### 7.解析Dynamic Segment

通过解析Dynamic Segment去获取到需要的节表信息，后面就是要修复这些。

> .dynstr
> 
> .hash (这里只用来计算.dynsym的大小)
> 
> .dynsym
> 
> .rela_dyn
> 
> .got
> 
> .rela_plt
> 
> .init_array （可选）

这里1，是采用内存模式去解析,默认是文件模式。

```python
fixer.parse_dynamic(1)
```

> def parse_dynamic(self, mode=0):  
> self.dynstr = None  
> self.dynstr_size = None  
> self.hash = None  
> self.dynsym = None  
> self.rela_dyn = None  
> self.rela_dyn_size = None  
> self.got = None  
> self.rela_plt = None  
> self.rela_plt_size = None  
> self.init_array = None  
> self.init_array_size = None

```python
dynamic_off = None  
dynamic_sz = None  
for seg in self.binary.segments:  
    if seg.type == 2:  # 找到Dynamic Segment  
        if mode == 1:  
            dynamic_off = seg.virtual_address  
            dynamic_sz = seg.virtual_size  
        else:  
            dynamic_off = seg.file_offset  
            dynamic_sz = seg.physical_size  
        break  
dynamic_size = dynamic_sz // 16  # 每项是16字节,获取dynamic的表项数  
  
dynamic = self.so_base[dynamic_off:]  
  
for i in range(dynamic_size):  
    dyn = dynamic[i * 16:]  # 每项dyn的起始  
    tag = read_u64(dyn, 0)  # dyn类型  
    val = read_u64(dyn, 8)  # dyn数值(offset/num)  
  
    if tag == lief.ELF.DynamicEntry.TAG.STRTAB:  
        self.dynstr = val  
    elif tag == lief.ELF.DynamicEntry.TAG.STRSZ:  
        self.dynstr_size = val  
    elif tag == lief.ELF.DynamicEntry.TAG.HASH:  
        self.hash = val  
    elif tag == lief.ELF.DynamicEntry.TAG.SYMTAB:  
        self.dynsym = val  
    elif tag == lief.ELF.DynamicEntry.TAG.RELA:  
        self.rela_dyn = val  
    elif tag == lief.ELF.DynamicEntry.TAG.RELASZ:  
        self.rela_dyn_size = val  
    elif tag == lief.ELF.DynamicEntry.TAG.PLTGOT:  
        self.got = val  
    elif tag == lief.ELF.DynamicEntry.TAG.JMPREL:  
        self.rela_plt = val  
    elif tag == lief.ELF.DynamicEntry.TAG.PLTRELSZ:  
        self.rela_plt_size = val  
    elif tag == lief.ELF.DynamicEntry.TAG.INIT_ARRAY:  
        self.init_array = val  
    elif tag == lief.ELF.DynamicEntry.TAG.INIT_ARRAYSZ:  
        self.init_array_size = val
```

#### 8.解析.hash节表

```python
fixer.parse_hash()
```

> def parse_hash(self):  
> if self.hash is not None:  
> diff = self.calcula_diff(self.hash)  
> self.hash_table = self.so_base\[self.hash - diff:\]

```python
    self.nbucket = read_u32(self.hash_table, 0)  
    self.nchain = read_u32(self.hash_table, 4)  
    print_format("nbucket", hex(self.nbucket))  
    print_format("nchain", hex(self.nchain))  
else:  
    raise ValueError("not find DT_HASH")
```

#### 9.节表修复

这里面功能大致一样的，内容重复，代码会放后面。

```python
# 修复动态符号字符串表
fixer.fix_dynstr()
# 修复动态符号表
fixer.fix_dynsym()
# 修复数据重定位表
fixer.fix_rela_dyn()
# 修复got表
fixer.fix_got()
# 修复函数重定位表
fixer.fix_rela_plt()
# 修复.init_array表
fixer.fix_init_array()
```

#### 10.运行

```python
def fix_dump_so_main():
    path = "dump.so"
    # 包装so
    fixer = SoFixer(path)

    # 收集PT_Load段
    fixer.collect_load_segments()

    # 修复所有段的地址和大小
    fixer.fix_segment()

    # dump下来的节头表数据全是被抹除了，这里直接清零所有节头表
    fixer.clean_section()

    # 修复节名字符串表
    fixer.fix_shstrtab()

    # 解析Dynamic Segment
    fixer.parse_dynamic(1)

    # 解析.hash节表
    fixer.parse_hash()

    # 修复动态符号字符串表
    fixer.fix_dynstr()
    # 修复动态符号表
    fixer.fix_dynsym()
    # 修复数据重定位表
    fixer.fix_rela_dyn()
    # 修复got表
    fixer.fix_got()
    # 修复函数重定位表
    fixer.fix_rela_plt()
    # 修复.init_array表
    fixer.fix_init_array()

    # 获取JNI_OnLoad函数地址
    fixer.find_symbol("JNI_OnLoad")

    fixer.save("dump_fix.so")
    print("Dump SO 修复完成")
```

#### 11.修复结果展示

进入0x1AD84函数

##### dump 修复

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ca14515ab93132e5.png)

##### 解密内嵌so修复

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/50d525c2f381313a.png)

对比这两个就能明显看出，dump修复里面字符串是解密后的了，这里在做对libc.so的crc检测。

GitHub仓库下载: [https://github.com/jiutian666/fix_so_script.git](https://bbs.kanxue.com/elink@610K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6B7K9i4g2@1K9h3q4F1y4U0j5$3i4K6u0r3k6X3W2^5i4K6g2X3M7$3!0Q4y4h3k6K6j5%4u0A6M7s2c8Q4x3X3g2Y4K9i4b7%60.)

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)
