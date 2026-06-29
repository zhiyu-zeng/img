---
title: 【看雪】记一次入门级DexVMP分析
source: https://bbs.kanxue.com/thread-291779.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-29T10:25:39+08:00
trace_id: 721e94c0-486d-49ab-91c7-857c20f5bbe2
content_hash: 3d53baae4a4b3726e0474448bf403d33374d7f819d67b402d3bf03e59b73cf87
status: summarized
tags:
  - 看雪
series: null
feed_source: null
ai_summary: 通过逆向工程逐步分析入门级DexVMP保护，成功脱壳、解密并还原出被保护的Java代码。
ai_summary_style: key-points
images_status:
  total: 59
  succeeded: 59
  failed_urls: []
notion_page_id: 38e75244-d011-8142-aee8-efef1770b238
ioc:
  cves: []
  cwes: []
  hashes:
    - 289313ddec23416b48695a7ee2c8b02d
  domains:
    - bbs.kanxue.com
    - cdn.jsdelivr.net
    - github.com
    - share.feijipan.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过逆向工程逐步分析入门级DexVMP保护，成功脱壳、解密并还原出被保护的Java代码。
> 
> - **定位与解密：** 通过Hook linker和init_array函数，发现解密逻辑；使用XOR密钥（如67 69 BD E7 11 D1 54 3C）解密data段，并调用mprotect修改内存权限、刷新缓存以生效。
> - **字符串批量解密：** 编写IDAPython脚本匹配特征指令序列（如AND、LDURB等）和密钥，自动解密so中的十六进制字符串。
> - **绕过Frida检测：** 分析Logcat打印的“XOX: state=545”，定位到sub_30310函数包含Frida检测，通过Interceptor.replace该函数使应用不再闪退。
> - **去除不透明谓词：** 识别混淆变量（如dword_D7ED0），patch为0并将段设置为只读，使IDA反编译结果清晰化。
> - **VMP指令还原：** 对比标准Dalvik字节码和VMP handler表，发现opcode被打乱但存在映射关系，通过AI辅助还原出可解析的opcode表，最终生成smali代码。

最近找到一份apk加固样本，粗略的看了下，确定是某搜索引擎的加固，并且部分函数带了DexVMP，可以参考以下大佬的文章  
[某企业加固dex vmp简单分析](https://bbs.kanxue.com/thread-291492.htm)  
[某企业壳逆向分析——从过检测到dex代码抽取还原](https://bbs.kanxue.com/thread-291069.htm)  
[简单分析onCreate](https://bbs.kanxue.com/thread-291584.htm)  
[nmmp基于dex-vm运行dalvik字节码从而对dex进行保护](https://bbs.kanxue.com/elink@af1K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6E0j5h3!0S2j5X3y4Q4x3V1k6F1L8h3#2H3)

## 初步分析

## 定位检测so

老套路，先Hook linker call\_array，判断加载到哪个so闪退  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c0bedd4a56215dfc.webp)  
观察Logcat，发现退出会打印 **XOX: state=545**  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/061cd6992034a09d.webp)
  
JNI\_OnLoad 被加密，第三个init\_array函数出现调用未解密的函数，由此判断解密的逻辑在前两个init\_array函数  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/fae7db5ab25ad4c3.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/0a766dad2ccb6395.webp)
  

## .init\_array1

明显能看出，第一个函数在做一些偏移计算，并且sub\_9F090调用syscall mprotect，这是要修改内存里的代码、数据的前提条件  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/32ca6ac2fc2280ac.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a83c90892cfcf6c2.webp)
  
  
sub\_9F130 解密data段，依次XOR 67 69 BD E7 11 D1 54 3C ，v2起始地址，qword\_D0010对应的是长度  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/488a7203d81a907f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b1c111aea9a092b6.webp)
  
  
sub\_9B7D4 对一个区域的代码做刷新缓存，让解密后的代码/数据生效（D-cache），Hook sub\_9B7D4打印参数一、参数二，出现两次结果，先看第一次  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8833670ed5972235.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/fc25058424a93341.webp)
  
  
0xad080 是data段 起始地址，那么0xb5898对应的是结束地址，  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/92f2056408a0514f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a5f4741881382bbd.webp)
  

## init\_array2

sub\_9F370 插了很多不透明谓词，把代码段的解密、修补、权限切换、cache flush 打散进状态机  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b00185e93e98b3ac.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/61e9cb1fb80075a8.webp)
  

## so脱壳

这么一看，还原成算法有点麻烦，不过手里有数据段跟代码段需要解密的起始地址跟长度，在执行完sub\_9F370，把这两段给dump下来

```python
Interceptor.attach(libbaiduprotect.add(0x9F370), {
    onLeave(ret) {
        var libxx = Process.findModuleByName("libbaiduprotect.so");
        var file_path = "/data/data/xxx/data.bin";
        console.log(file_path);
        var file_handle = new File(file_path, "wb");
        if (file_handle && file_handle != null) {
            Memory.protect(ptr(libxx.base.add(0xad080)), 0x8818, 'rwx');
            var libso_buffer = ptr(libxx.base.add(0xad080)).readByteArray(0x8818);
            file_handle.write(libso_buffer);
            file_handle.flush();
            file_handle.close();
            console.log("[dump]:", file_path);
        }
    }
})
```

dump下来的数据段、代码段，在010编辑器找到对应的偏移，覆盖掉，图下前后对比  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/bdbfb3a1eb4849fe.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/10ab99a6fdc0dfaf.webp)
  

## 解密字符串

修复完的so，直接打开，不需要sofix（假如内存dump整个so，再sofix，会出现写内存地址，导入函数识别错误的情况）JNI\_OnLoad能正常查看  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3c3de92d8bc19c26.webp)
  
字符串表多了一大堆十六进制的字符串  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6c97be4d9095ef6f.webp)
  
随便挑一个字符串引用的地方，发现统一当做参数1来传给xxx函数  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f08f7dd5c406cd51.webp)
  
malloc申请对应的大小内存，byte\_AE4B9当做key，循环按位异或解密出字符串，算法很简单，但是有很多个字符串跟秘钥，只能用ida python来匹配出字符串+秘钥的组合再模拟解密  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/337b94d59ec0973d.webp)
  
粗略的看下，发现解密算法都一样，唯独key不一样，对应的汇编指令也一样，取下面这组指令，在.text段从头到尾匹配一遍

```python
AND             W16, W9, #0xFF
LDURB           W17, [X8,#-1]
CMP             W16, #0x3A ; ':'
CSEL            W16, WZR, W10, CC
CMP             W17, #0x3A ; ':'
CSEL            W18, W12, W11, CC
CMP             W14, #8
CSEL            W14, WZR, W14, EQ
```

大概的逻辑是  
1、匹配包含算法特征的函数  
2、函数匹配出key地址  
3、查找当前函数引用  
4、匹配待解密字符串地址  
这样就能解密出大部分的字符串

```python
import idaapi
from idaapi import *
import idautils
import idc
from idc import *
from capstone import *
from keystone import *
import json

TARGET_SEQUENCE = [
    "AND",
    "LDURB",
    "CMP",
    "CSEL",
    "CMP",
    "CSEL",
    "CMP",
    "CSEL",
]


def decrypt(hex_str: str, key):
    out = bytearray()

    for i in range(len(hex_str) // 2):
        b = int(hex_str[i * 2:i * 2 + 2], 16)
        key_byte = ida_bytes.get_byte(key + (i % 8))
        out.append(b ^ key_byte)

    return out.split(b'\x00')[0].decode(errors="ignore")


def find_x13_define(ea):
    cur = ea
    while cur != idaapi.BADADDR:
        mnem = idc.print_insn_mnem(cur)
        if mnem in ["ADR", "ADRL", "ADRP"]:
            if idc.print_operand(cur, 0) == "X13":
                return idc.get_operand_value(cur, 1)
        cur = idc.prev_head(cur)
    return None


def get_x0_string(addr):
    """
    从某条指令向上回溯 ADRL X0
    """
    cur = addr
    for _ in range(20):  # 防止死循环
        cur = idc.prev_head(cur)
        if cur == idc.BADADDR:
            break
        mnem = idc.print_insn_mnem(cur)
        # ARM64 常见：ADRP + ADD / ADRL
        if mnem in ["ADRP", "ADRL", "ADR"]:
            op0 = idc.print_operand(cur, 0)
            # 确保是 X0
            if "X0" in op0:
                op1 = idc.print_operand(cur, 1)
                # 直接取字符串引用
                str_ea = idc.get_operand_value(cur, 1)
                if str_ea != idc.BADADDR:
                    return idc.get_strlit_contents(str_ea, -1, idc.STRTYPE_C)
    return None


def find_fun_cross_list(key_addr, ea):
    for xref in idautils.XrefsTo(ea):
        call_ea = xref.frm
        print("\nCALL at:", hex(call_ea))
        s = get_x0_string(call_ea)
        if s:
            try:
                print("X0 string: %s key地址：0x%x" % (s.decode(), key_addr))
                dec = decrypt(
                    s.decode(),
                    key_addr
                )
                print(dec)
            except:
                print("X0 raw:", s)
        else:
            print("no X0 string found")


def find_target_sequence(start_addr, end_addr):
    current_addr = start_addr
    sequence_index = 0
    locations = []

    while current_addr < end_addr:

        if not idc.is_code(idc.get_full_flags(current_addr)):
            current_addr += 4
            continue

        mnem = idc.print_insn_mnem(current_addr)

        if mnem == TARGET_SEQUENCE[sequence_index]:
            if sequence_index == 0:
                start_hit = current_addr

            sequence_index += 1

            if sequence_index == len(TARGET_SEQUENCE):
                locations.append(start_hit)
                print("[MATCH]", hex(idaapi.get_func(start_hit).start_ea))
                key_addr = find_x13_define(current_addr)
                find_fun_cross_list(key_addr, idaapi.get_func(start_hit).start_ea)
                sequence_index = 0

        else:
            sequence_index = 0

        current_addr += 4

    return locations


seg = idaapi.get_segm_by_name(".text")
start_address = seg.start_ea
end_address = seg.end_ea

results = find_target_sequence(start_address, end_address)

print("total:", len(results))
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ed3562b1b7cea670.webp)

## Frida检测

开头有提到Logcat 打印的 **XOX: state=545** ，在字符串表搜索state=，随便找个引用的地方，一目了然，甚至直接打印对应的数字，这就好办，直接搜索545这个常数  
  
有三处地方打印了545，都在同一个函数  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f472d1e221d49650.webp)
  
发现sub\_30310里面全是检测Frida的特征，Interceptor.replace该函数发现应用不闪退了  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dd6ee48bcc109000.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b62d4b0f94aa74c9.webp)
  

## 去不透明谓词混淆

分析JNI\_OnLoad，发现一堆不透明谓词混淆，根据混淆设定，这些判断条件永远都不执行，因为dword\_D7ED0所在可读可写区域，ida不清楚它会是什么值，所以伪代码将这些垃圾代码保留，让用户自己去判断，这种情况要么将dword\_D7ED0所在的段修改成只读不可写，或者手动patch 0  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f6f435dab8083351.webp)

```python
import idaapi
import ida_name
import ida_bytes
import ida_segment
import ida_auto
import idautils
import idc

opaque_vars = [
    "dword_D7ECC",
    "dword_D7EC8",
    "dword_D7EDC",
    "dword_D7ED8",
]

touched_segments = set()

for name in opaque_vars:
    ea = ida_name.get_name_ea(idaapi.BADADDR, name)
    if ea == idc.BADADDR:
        print("[!] not found:", name)
        continue

    old = ida_bytes.get_dword(ea)
    ida_bytes.patch_dword(ea, 0)
    print("[+] %s %s: 0x%x -> 0" % (name, hex(ea), old))

    seg = ida_segment.getseg(ea)
    if seg:
        touched_segments.add(seg.start_ea)

for seg_ea in touched_segments:
    seg = ida_segment.getseg(seg_ea)
    if seg:
        print("[+] set read-only:", ida_segment.get_segm_name(seg), hex(seg.start_ea), hex(seg.end_ea))
        seg.perm = ida_segment.SEGPERM_READ
        ida_segment.update_segm(seg)

for f in idautils.Functions():
    end = idc.get_func_attr(f, idc.FUNCATTR_END)
    ida_auto.plan_and_wait(f, end)

print("[+] done, press F5 again")
```

patch完，ida F5重新分析函数，JNI\_Onload变得清新脱俗  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/afa4df6569eaffa1.webp)

## Dump Dex

## dump大法

用yang佬的dump dex 直接dump出所有dex（会dump出一些奇奇怪怪的）  
[yang佬的dump dex脚本](https://bbs.kanxue.com/elink@ba6K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6D9j5i4y4@1K9h3&6Y4i4K6u0V1P5h3q4F1k6#2\)9J5c8X3k6J5K9h3c8S2i4K6g2X3k6s2g2E0M7q4\)9J5c8X3u0D9L8$3u0Q4x3V1k6E0j5i4y4@1k6i4u0Q4x3V1k6V1N6h3#2H3i4K6g2X3k6r3g2^5i4K6u0W2K9Y4x3%60.)

## AI还原Dex解密算法

详细的分析过程就不写了，太长了，感觉单独出一篇也够了，索性直接列出

| 文件  | 用途  |
| --- | --- |
| baiduprotect.md | 存放Dex数量、解密Key等 |
| baiduprotect1.d.jar | 带d.jar是Dex VMP |
| baiduprotect1.jar | 普通DEX |

这些文件开头都有共同的特征，14 94 B5 35  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4bd3d56315b905d7.webp)
  
他没有调用assets open，而是打开/data/app/xxx/base.apk，然后按照zip 的方式提取出需要的项目  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1f81cb2423a87a60.webp)
  
提取出来的文件，需要经过一次解密，把头部0x100（d.jar是0x200）给解密还原成zlib正确的文件头，准确来说

1.  用 HKDF-SHA256 派生 key/counter
2.  用 AES-128 加密 counter 生成 keystream
3.  data XOR keystream
4.  zlib 解压

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/502d705f1bfdb6af.webp)

  
已知 key 是0x10个字节，固定存放在baiduprotect.md，直接dump g\_payload\_index\_header，让AI给生成对应的解密算法  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dd1467d261293b4f.webp)

```python
python .\decrypt_djar.py .\baiduprotect1.jar test.dex --ikm-hex 289313ddec23416b48695a7ee2c8b02d --crypt-len 0x100
```

GPT5.5 一拳下去，裤子都给打掉，太强了（代码在文章末尾）  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6fbbbae2a80070d3.webp)

## DexVMP onCreate函数

OnCreate原本的函数体变成AB.v调用，不同的函数，参数一的数值不一样，估计就是用这个来区分vmp method  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4575ca3ea09c5081.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ac19b55c2fb284c2.webp)
  

AB.v 函数动态注册指向0x4e020

> 段落引用  
> \[RegisterNatives\] java\_class: com.sagittarius.v6.AB name: v sig: (ILjava/lang/Object;\[Ljava/lang/Object;)V fnPtr: 0x78a6d27020 module\_name: libbaiduprotect.so module\_base: 0x78a6cd9000 offset: 0x4e020

## Trace 一份函数调用的日志

方便后续分析，先trace一份日志，推荐几个大佬写的trace项目  
[https://github.com/zgy0x01/QTrace](https://bbs.kanxue.com/elink@a4dK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6*7k6%4V1H3P5o6l9I4i4K6u0r3f1g2c8J5j5h3y4W2)  
[https://github.com/lidongyooo/GumTrace](https://bbs.kanxue.com/elink@5adK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6D9K9h3c8G2L8X3N6&6L8$3!0G2i4K6u0r3c8%4g2E0g2s2u0S2j5$3f1%60.) 文章用的这个  
**trace过程会报错中断，需要修改transform\_callback，跳过报错指令，不然trace不下去**  
trace完才13M，估计是原本的函数代码也没多少  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/06873d4607e158e8.webp)
  
0x4e020也是很简单的直接调用，这里因为堆栈的原因，ida识别参数错误了，应该后面不是0 0 0 0，而是i2的低16位，跟obj objarr等  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a0970864b868ad83.webp)

g\_vmp\_context\_by\_id\[256\]是已经初始化好的上下文，来源 baiduprotect1.d.jar，跟dex的方式一样，提取、解密头0x200字节、zlib解压，最后vmp\_load\_context\_from\_dex\_and\_register\_bridge解析  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3d59e9751643719e.webp)
  
进来就看到解析Dex头部，解析出一堆Dex 字段偏移地址  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3468d3e51c727b3a.webp)
  
大概还原下返回的结构体，主要method\_ids、class\_defs、field\_ids、string\_ids，因为ins 转换成smali是需要用上这些信息

```python
typedef struct DexView
{
  OdexHeader *odex_header;     // +0x00, only set for dey/odex input
  DexHeader  *dex_header;      // +0x08, actual dex header
  void *type_ids;              // +0x10 = dex + type_ids_off
  void *proto_ids;             // +0x18 = dex + proto_ids_off
  void *method_ids;            // +0x20 = dex + method_ids_off
  void *class_defs;            // +0x28 = dex + class_defs_off
  void *field_ids;             // +0x30 = dex + field_ids_off
  void *data_section;          // +0x38 = dex + data_off
  void *string_ids;            // +0x40 = dex + string_ids_off
  void *odex_pklc_chunk;       // +0x48, payload of tag "PKLC"
  void *odex_pamr_chunk;       // +0x50, payload of tag "PAMR"
  DexHeader *raw_dex_base;     // +0x58, same as dex_header after odex unwrap
  void *reserved_60;           // +0x60, allocated size is 0x68
} DexView;
```

while循环将初始化的 context 塞进 vmp\_context 数组里  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1e4e55cf255e9c52.webp)

## vmp\_execute\_method

回到vmp\_execute\_method，参数一命名为vmp\_ctx，参数二是method\_id，其他都是Java层传进来的参数，首先一进来会把JNI参数给压到栈里，最终的handler会去使用  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/e0c8239e2798f7e0.webp)
  
Tips：DexVmp 最后都逃不掉JNI的 反射调用（除if等逻辑运算，所以那些dexvmp dump系统用的jni trace也只能还原一部分call调用）

## vmp\_interpreter\_enter

vmp\_interpreter\_enter 是最终分发 opcode handler的函数，这是强制让ida 识别为Switch的Graph图  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4535141c203a57bd.webp)
  
大概还原下vmp\_interpreter\_enter参数3 method\_desc 的结构体

```python
__int64 __fastcall vmp_interpreter_enter(
        void *vmp_ctx,
        JNIEnv *env,
        void *method_desc,
        unsigned __int64 *regs,
        unsigned __int8 *reg_type_map)

typedef struct VmpMethodDesc {
    uint32_t method_key;        // +0x00, 例如 0xAB000074
    uint16_t unknown_04;        // +0x04, 不是 code size
    uint16_t pad_06;            // +0x06
    uint32_t access_flags;      // +0x08

    uint16_t unknown_0c;        // +0x0C
    uint16_t first_arg_reg;     // +0x0E

    uint16_t ins_size;          // +0x10, 入参数量
    uint16_t registers_size;    // +0x12, .registers
    uint16_t signature_idx;     // +0x14

    uint16_t insns_size;        // +0x16, 指令数量，单位 code unit
    uint16_t *insns;            // +0x18, VMP 指令起始地址

    uint16_t handler_info_20;   // +0x20
    uint16_t handler_size;      // +0x22
    uint32_t pad_24;            // +0x24
    void *handler_data;         // +0x28
} VmpMethodDesc;                // size 0x30
```

从g\_vmp\_base\_handler\_table 取handler，间接跳转过去  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/5d358a7853227e60.webp)

## g\_vmp\_base\_handler\_table

g\_vmp\_base\_handler\_table 并不是按照默认的顺序，第一次调用会根据vmp\_ctx 进行一次重排  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/21b2afb1f9235593.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/fa7df1dbbf64a6b2.webp)
  
  
Frida hook vmp\_build\_runtime\_handler\_table，循环打印g\_vmp\_base\_handler\_table 256次，取指针减去libso base地址，然后patch到ida

```python
Interceptor.attach(libbaiduprotect.add(vmp_build_runtime_handler_table), {
    onLeave(retval) {
        for (let op = 0; op < 256; op++) {
            const handler = libbaiduprotect.add(g_vmp_base_handler_table).add(op * Process.pointerSize).readPointer();
            console.log(
                'op=0x' + ('00' + op.toString(16)).slice(-2) +
                ' -> ' + ptrOff(libbaiduprotect, handler) +
                ' abs=' + handler
            );
        }
    },
});
```

```python
import ida_auto
import ida_bytes
import ida_idaapi
import ida_kernwin
import ida_name
import ida_nalt


TABLE_NAME = "g_vmp_base_handler_table"
TABLE_RVA = 0xD1418

# Set True first if you only want to preview the target table and values.
DRY_RUN = False

# Opcode order:
#   VMP_REORDERED_HANDLER_OFFSETS[opcode] == handler offset to write into table.
VMP_REORDERED_HANDLER_OFFSETS = [
    xxxxxx
]


def msg(s):
    ida_kernwin.msg("[patch_vmp_handler_table] %s\n" % s)


def resolve_table_ea():
    ea = ida_name.get_name_ea(ida_idaapi.BADADDR, TABLE_NAME)
    if ea != ida_idaapi.BADADDR:
        return ea

    candidates = [TABLE_RVA, ida_nalt.get_imagebase() + TABLE_RVA]
    for cand in candidates:
        if ida_bytes.is_loaded(cand):
            return cand

    return ida_idaapi.BADADDR


def patch_table(table_ea, offsets):
    if len(offsets) != 256:
        raise ValueError("expected 256 handler offsets, got %d" % len(offsets))

    msg("table_ea=0x%X dry_run=%s" % (table_ea, DRY_RUN))
    msg("first: op=0x00 -> 0x%X, last: op=0xFF -> 0x%X" % (offsets[0], offsets[-1]))

    for opcode, handler_off in enumerate(offsets):
        item_ea = table_ea + opcode * 8
        if not DRY_RUN:
            ida_bytes.patch_qword(item_ea, handler_off)
            ida_bytes.set_cmt(item_ea, "op=0x%02X -> handler=0x%X" % (opcode, handler_off), 0)

    if not DRY_RUN:
        ida_name.set_name(table_ea, TABLE_NAME, ida_name.SN_CHECK | ida_name.SN_NOWARN)
        ida_auto.auto_wait()
        ida_kernwin.refresh_idaview_anyway()

    msg("done: patched %d qwords" % len(offsets))


def main():
    table_ea = resolve_table_ea()
    if table_ea == ida_idaapi.BADADDR:
        raise RuntimeError("cannot resolve %s / 0x%X" % (TABLE_NAME, TABLE_RVA))
    patch_table(table_ea, VMP_REORDERED_HANDLER_OFFSETS)


if __name__ == "__main__":
    main()
```

重排后的前后对比  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/73729d3c0cae645f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/9ae5743bb5594fe5.webp)
  

## 看第一条opcode

当重排handler表，看第一次分发的指令对应的handler，第一次在0x59FF0  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/825ebe075e425cca.webp)
  
0x59FF0在日志只出现一次，它并不是循环解析来调用，类似控制PC，或者goto的形式，第一次调用的是0x60bcc，0x60bcc在handler表排第151（0x97）  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8872dd2b67273516.webp)
  
0x59f9c 取x26寄存器的两个字节到w22，即0x2097  
0x59fa0 add x8, x16, w22, uxtb #3; w22取低8位，即0x97，对应了上面的0x60bcc  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b598e8e5495e8c53.webp)

0x789bb1ef02 取值来自 \[x19, #0x18\]，对上了 uint16\_t \*insns; // +0x18, VMP 指令起始地址  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/52e37d4f3c26035a.webp)
  
Frida hook vmp\_interpreter\_enter 打印出当前函数所有ins  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c7077214ef7af336.webp)
  
97 20 对上符合 trace日志，注意，目前还是DEX CodeItem 里的 Dalvik 字节码（可能混淆加密过的）  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c02f8f58f648c074.webp)

## vmp\_resolve\_method\_ref\_for\_invoke

一进来看到各种JNI GetMethodID，这时候就可以大胆推测是模拟 invoke-\*\*\*  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/bf1aaa708a9584d6.webp)
  
dex\_get\_method\_ref\_info(a1, method\_idx, out\_class\_idx, out\_class\_desc, out\_name, out\_sig, out\_return\_type) 结合AI给的注释，Frida hook 打印一下，基本确定就是invoke-\*\*\* ，并且只改了opcode，method\_idx 1486也对得上dex里的method\[1486\]  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a0dba4fc65bef541.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3ab6f3cf32f1c776.webp)
  

## Dalvik 字节码

先看下正常的Dalvik 字节码格式跟smali的关系

> 正常 Dalvik 字节码  
> 6F 20 04 00 32 00 14 00 1C 00 0B 7F 6E 20 09 00  
> 02 00 1A 00 15 00 1A 01 24 00 71 20 00 00 10 00  
> 1A 00 29 00 12 01 71 30 01 00 02 01 0C 00 6E 10  
> 02 00 00 00 0E 00

> Smali 代码  
> .registers 4  
> .param p1, "savedInstanceState" # Landroid/os/Bundle;  
> invoke-super {p0, p1}, Landroidx/appcompat/app/AppCompatActivity;->onCreate(Landroid/os/Bundle;)V  
> const v0, 0x7f0b001c  
> invoke-virtual {p0, v0}, Lcom/demo/baidujiagu/MainActivity;->setContentView(I)V  
> const-string v0, "MainActivity"  
> const-string v1, "onCreate: "  
> invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I  
> const-string v0, "test"  
> const/4 v1, 0x0  
> invoke-static {p0, v0, v1}, Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;  
> move-result-object v0  
> invoke-virtual {v0}, Landroid/widget/Toast;->show()V  
> return-void

> 各字节解析  
> 6f 20 04 00 32 00  
> unit0 = 0x206f  
> opcode = 0x6f = invoke-super  
> A = 2 参数个数  
> G = 0  
> unit1 = 0x0004 = method\_idx 4  
> method@4 = Landroidx/appcompat/app/AppCompatActivity;->onCreate(Landroid/os/Bundle;)V  
> unit2 = 0x0032  
> C = 2, D = 3  
> 参数 = {v2, v3} = {p0, p1}

[Dalvik 字节码格式](https://bbs.kanxue.com/elink@d0aK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6K6L8%4g2J5j5$3g2Q4x3X3g2S2L8X3c8J5L8$3W2V1i4K6u0W2j5$3!0E0i4K6u0r3k6r3!0U0M7#2\)9J5c8X3y4G2M7X3g2Q4x3V1k6J5N6h3&6@1K9h3#2W2i4K6u0r3k6r3q4D9N6X3W2C8i4K6u0V1j5Y4W2@1k6h3y4G2k6r3g2Q4x3@1k6Z5L8q4\)9K6c8s2A6Z5i4K6u0V1j5$3&6Q4x3U0y4A6L8Y4y4@1M7Y4g2U0N6r3W2G2L8Y4x3%60.)

经过上面标准对比，invoke 范围0x6e - 0x72，目测vmp第一条指令还原成

> invoke-super {p0, p1}, Landroidx/fragment/app/FragmentActivity;->onCreate(Landroid/os/Bundle;)V

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/df40a4473aea8020.webp)

  
0x97 handler最后goto loc\_628，loc\_628集中处理invoke类调用  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6bf82c76b6aea6c1.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/70397db15beae2ba.webp)
  

## 还原opcode

vmp\_interpreter\_enter整体阅读性很强，没有很复杂的ollvm，并且只打乱了opcode，但是！！！戏剧性的一幕，代码里默认的table就是标准的顺序，invoke-super标准对应的就是0x6f，打乱后0x97对应的也是loc\_60BCC，只需要给AI两份前后table，做一次对比，就能还原出能解析的table  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/d11b2e1b25967d3b.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f7ba26d4103067d3.webp)
  

## 最终效果

```python
invoke-super {v1, v2}, Landroidx/fragment/app/Fragment;->onCreate(Landroid/os/Bundle;)V                                            
new-instance v2, Lcom/baidu/rp/lib/base/c;
invoke-virtual {v1}, Landroidx/fragment/app/Fragment;->getActivity()Landroidx/fragment/app/FragmentActivity;
    move-result-object v1
const/4 v0, 0x0    # object-null
invoke-direct {v2, v0}, Lcom/baidu/rp/lib/base/c;-><init>(Landroid/content/Context;)V
iput-object v2, v1, Lcom/baidu/rp/lib/base/BaseFragment;->baseContextWrapper:Lcom/baidu/rp/lib/base/c;
return-void

// Java-like hints
void method(/* recovered */) {
    // cu_0000: 2097 05b1 0021
    super.onCreate(v2);
    // cu_0005: 109b 059b 0001
    v1.getActivity();
    // cu_0008: 008d
    v0 = null;
    // cu_0009: 2052 3a92 0002
    v2 = new com.baidu.rp.lib.base.c(v0);
    // cu_000c: 12e0 1ad8
    v1.baseContextWrapper = v2;
    // cu_000e: 0011
    return;
}
```

## 总结

分析跟写文章花了两天多时间，这个样本之所以定为入门，没有太强的混淆跟反调式，甚至opcode 指令相关没做加密，跟开源项目 [nmmp](https://bbs.kanxue.com/elink@432K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6E0j5h3!0S2j5X3y4Q4x3V1k6F1L8h3#2H3) 很像，完全脱壳还原dex也是没太大难度的，完整样本就不提供了，不过应该也很好找

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)

* * *

## 评论

> **New对象处 · 2 楼**
> 
> 求各位大佬们分享个简单的arm64 vmp样本 ![](https://bbs.kanxue.com/view/img/face/086.gif)

> **shuangmou · 3 楼**
> 
> 感谢分享

> **shuangmou · 4 楼**
> 
> 像是某度呀

> **shuangmou · 5 楼**
> 
> > [New对象处](https://bbs.kanxue.com/user-807696.htm) 求各位大佬们分享个简单的arm64 vmp样本\[em\_086\]
> 
> 有个深思的 要看吗

> **Gryffindoss · 6 楼**
> 
> 6666

> **Yangser · 7 楼**
> 
> > [New对象处](https://bbs.kanxue.com/user-807696.htm) 求各位大佬们分享个简单的arm64 vmp样本\[em\_086\]
> 
> 我写了一个你要吗

> **New对象处 · 8 楼**
> 
> > [Yangser](https://bbs.kanxue.com/user-947037.htm) 我写了一个你要吗
> 
> 大佬分享下

> **New对象处 · 9 楼**
> 
> > [shuangmou](https://bbs.kanxue.com/user-966625.htm) 有个深思的 要看吗
> 
> 大佬分享下

> **mb\_ldbucrik · 10 楼**
> 
> 感谢分享

> **AloneCrab · 11 楼**
> 
> 666666

> **yuanyouran · 12 楼**
> 
> 感谢分享

> **xingbing · 13 楼**
> 
> 感谢分享 ！！！

> **taoying · 14 楼**
> 
> 大佬太强了，可以手把手教我吗 ![](https://bbs.kanxue.com/view/img/face/003.gif) ![](https://bbs.kanxue.com/view/img/face/003.gif) ![](https://bbs.kanxue.com/view/img/face/003.gif)

> **wx\_插曲 · 15 楼**
> 
> 66666

> **mb\_ebihoycp · 16 楼**
> 
> 感谢分享

> **shuangmou · 17 楼**
> 
> > [New对象处](https://bbs.kanxue.com/user-807696.htm) 大佬分享下
> 
> https://share.feijipan.com/s/qkdD7Vao

> **4Chan · 18 楼**
> 
> 学习一下

> **kienmanowa · 19 楼**
> 
> 666666

> **wx\_Huber Barrientos · 20 楼**
> 
> 666

> **jyotidwi · 21 楼**
> 
> 666

> **jyotidwi · 22 楼**
> 
> 666

> **夜惜风雨 · 23 楼**
> 
> 66666666666666

> **taeyeon\_ss · 24 楼**
> 
> 233333

> **koflfy · 25 楼**
> 
> mark
