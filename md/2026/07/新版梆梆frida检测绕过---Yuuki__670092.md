---
title: 新版梆梆frida检测绕过 - Yuuki
source: https://yuuki.cool/posts/bypassbang/
source_host: yuuki.cool
clip_date: 2026-07-29T10:09:12+08:00
trace_id: 7b1b3ab3-0f0d-4770-b552-c4aac77a6095
content_hash: 473e5e31923b6f994dba538c36029ece067d8b422adbcf670450ad86f16f5a8f
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: null
ai_summary: 通过解密壳的自定义链接器、patch检测函数及终止系统调用，成功绕过新版梆梆加固的frida检测。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3ac75244-d011-81d2-a4c5-f8061295f45a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过解密壳的自定义链接器、patch检测函数及终止系统调用，成功绕过新版梆梆加固的frida检测。
> 
> - **壳加载流程：** libDexHelper.so入口通过ELF魔数定位自身基址，读取文件尾部(0x1181DD)的20字节密钥和偏移0x8000的加密ELF头， RC4变种解密头、单字节XOR(密钥0x41)解密各段，再自实现重定位与初始化。
> - **静/动态解密主so：** 提供Python脚本精确还原内层so，关键偏移为PAYLOAD=0x8000、TAIL=0x1181DD；frida侧通过hook mmap过滤变参长度(0x134000)快速获取内层基址。
> - **frida检测绕过核心：** 追踪执行流发现检测后由kill系统调用退出，通过替换检测函数sub_1304C并patch所有kill相关的svc指令（将x0置0）使应用正常运行。
> - **自动化patch方案：** 编写IDA脚本扫描所有终端系统调用(svc exit/kill等)，自动生成Frida patch片段，实现批量屏蔽异常退出点。
> - **辅助工具与关键偏移：** 使用stalker_trace_so快速定位检测链，手动确认两处kill退出点(0x190a0,0x19420)，也可免内核模块直接patch绕过。

## 新版梆梆检测绕过

## 0x00 前言

1.  其实本来应该连dex解密流程一块讲的，但是上周一直在加班，没有时间写完，所以拆成两篇来写吧，这篇先只讲一下如何绕过frida检测，祈祷我下周不要再加班了

## 0x01 linker mini版

### 入手

IDA打开发现导入表空空如也，无需多言，先dump修复一份so，IDA打开之后发现只有寥寥数个函数，并且注册了constructor函数，那只好先去入口处看看了

```c
__int64 sub_4780()
{
  _DWORD *j; // x2
  void *libc_handle; // x0
  int i; // [xsp-60h] [xbp-90h]
  int k; // [xsp-14h] [xbp-44h]

  for ( i = 273; i != 70; i = 70 )
    ;
  for ( j = (_DWORD *)((unsigned __int64)sub_4780 & 0xFFFFFFFFFFFFF000LL); *j != 0x464C457F; j -= 1024 )// ELF魔数
    ;
  shell_base = (__int64)j;
  libc_handle = dlopen("libc.so", 2);
  g_scanf = (__int64 (*)(_QWORD, const char *, ...))dlsym(libc_handle, "sscanf");
  for ( k = 273; k != 70; k = 70 )
    ;
  dword_15040 = dword_15008;                    // 0x8000
  dword_15064 = dword_1500C;                    // 0x1608
  dword_15078 = dword_15010;                    // 0x877
  dword_15030 = dword_15014;                    // 0x159000
  dword_15088 = dword_15018;                    // 0x15B000
  dword_15084 = dword_1501C;                    // 0x15C000
  dword_1507C = dword_15020;                    // 0x1181DD
  return sub_33F8();                            // 主加载流程
}
```

这是入口函数，上来就会被调用，其中 `0x464C457F` 是ELF魔数，这段代码在从自身页面开始往上扫描，直到扫描到ELF魔数，从而查找自身的基地址，然后拿到 `sscanf` 的地址，存到全局变量中。我也不晓得这一通操作意欲何为。前一个还可以理解，这么做会比较节省时间，至于sscanf，直接拿来用不就行了吗，他这里还查找这个符号然后保存有点没理解，有懂的大牛子可以解释一下

然后就是保存一些全局变量，都是写死的偏移或者秘钥信息，比较重要，后续解密时会用到。最后就是这个壳so最重要的函数了 `sub_33F8()`

### 定位

建议如果要分析的话，先看看这个简单的项目吧，因为项目里so加载流程和这个壳不能说100%一样，但是也有90%是一样的 [Yuuki/soLoader](https://github.com/SoyBeanMilkx/soLoader)

这个函数有900多行，不算很复杂，而且核心函数一目了然。它调用了 `mmap` ， `dlopen` ， `mprotect` 等函数，结合之前发现的，1.36M的so，反编译之后就几个函数，其他地方都是被加密的，那不难猜到这个函数的作用就是在运行时动态解密释放真正的so，然后真正的so再去对dex做解密等操作。如果是简单的upx壳，那么大概率不会使用到 `dlopen` ，因为upx只需要申请内存，解密payload即可，但是这里它调用了 `dlopen` ，还是在一个循环中调用的

```c
do {
    while ( *v76 != 1 )  {
        v76 += 2;
        if ( v76 == v91 )
            goto LABEL_186;
        }
        v92 = v76[1];
        v76 += 2;
        *(&v123 + (int)v90++) = (__int64)dlopen((const char *)(v118 + v92), 2);
    }
while ( v76 != v91 );
```

这很明显就是在处理 `DT_NEEDED` 条目了，那么这个函数，基本上可以初步判断为一个简易的linker，职责是加载真正的so

那么我们当下的直接目标就是解密出真正的so，所以先来简单分析一下这个函数吧~，我只截取关键的部分，感兴趣的可以自己从头看看

```c
v5 = fopen("/proc/self/maps", "r");
  memset(v143, 0, 0x400u);
  v123 = 0;
  v122 = 0;
  memset(v142, 0, 0x100u);
  while ( fgets((char *)v143, 1024, v5) )       // 解析maps，根据shell_base判断是否为so自身，取出so路径
  {
    g_scanf(v143, "%lx-%lx %s %s %s %s %s", &v122, &v123, v142, v142, v142, v142, so_path);
    if ( v122 <= shell_base && shell_base < v123 )
      break;
  }
  fclose(v5);
  v102 = so_path;
  so_file_handle = open((const char *)so_path, 0x80000);
```

这里反编译之后跟看源码没啥区别。先解析maps，根据上面拿到的 so 基地址来判断当前条目是否命中，命中取出 so 路径，为了拿到libDexHelper.so的路径。这里这么做是因为android加载so时，会从 `/data/app/一串神秘代码/libs` 下加载，而厂商的代码是写死的，他不知道这个神秘代码是啥就拿不到文件的磁盘路径，所以需要这样获取一下。当然我觉得直接在内存里操作也是可以的，不过这个看个人喜好了

拿到路径之后 ，它做了如下三件事情

```c
pread(so_file_handle, &qword_15050, 0x14u, (unsigned int)dword_1507C);// 从0x1181DD读20字节
dword_15080 = dword_15060;
memset(so_path, 0, 64);
qword_15068 = qword_15050;
qword_15070 = qword_15058;
pread(so_file_handle, so_path, 0x40u, (unsigned int)dword_15040);// 从0x8000读64字节
((void (__fastcall *)(_QWORD *, _QWORD))sub_3184)(so_path, (unsigned int)dword_15040);// RC4解密64字节 7F454C4602010... 这是ELF头
```

读了磁盘上的so的特定偏移的一些数据，这些偏移地址是写死的，上述初始化函数里提到过。其中 `sub_3184` 是一个变种的RC4算法，秘钥用的是 `qword_15068` ， `qword_15068` 来自 从0x1181DD读的20字节，所以这一块的逻辑就是，读取秘钥，读取要解密的64字节，调用解密函数，解密

解密出的数据如下：

`7F454C460201010000000000000000000300B70001000000B0F8000000000000400000000000000000F71000000000000000000040003800080040001A001900`

这完全验证了我们之前的猜想，这是一个标准的ELF头，所以这个函数的确是一个迷你的linker，并且我们已经拿到了ELF头的解密算法，接下来就是找剩下的数据是如何被加密的了

```c
v36 = v35;
v111 = v35;
v37 = (unsigned __int8 *)mmap((void *)((v32 + v110) & 0xFFFFFFFFFFFFF000LL), v35, 3, 50, 0, 0);// 对每个 `PT_LOAD` 段做映射/拷贝
v38 = v37;
if ( v37 == (unsigned __int8 *)-1LL )
  break;
v39 = HIDWORD(v113);
if ( lseek(SHIDWORD(v113), (unsigned int)v107 & 0xFFFFF000, 0) == -1 )
  break;
v112 = read(v39, v37, v36);         // 读取每个段内容
if ( (_DWORD)v112 == -1 )
  break;
if ( v28 != 1 ) {
  ((void (__fastcall *)(unsigned __int8 *, _QWORD, _QWORD))sub_2B1C)(v37, 0, (unsigned int)v112);// 循环调用xor解密函数，解密各个段
    goto LABEL_124;
}
v40 = v133;
v131 = 0;
v132 = 30;
v133[0] = 273;
```

关键解密函数是 `sub_2B1C` ，这就是一个简单的xor加解密

```c
char *__fastcall sub_2B1C(__int64 a1, int a2, int a3)
{
  char *result; // x0
  char *v4; // x3
  char v5; // t1
  int i; // [xsp-34h] [xbp-44h]

  for ( i = 273; i != 70; i = 70 )
    ;
  result = (char *)(a1 + a2);
  v4 = result;
  if ( a3 )
  {
    do
    {
      v5 = *v4++;
      *(v4 - 1) = dword_15080 ^ v5;             // xor 0x41
    }
    while ( a3 > (unsigned __int64)(unsigned int)((_DWORD)v4 - (_DWORD)result) );
  }
  return result;
}
```

秘钥是0x41，之前读20字节的时候读出来的，那么就可以静态解密出真正的so了。当然你也可以运行时动态dump，我看见有的朋友是直接在dlopen onLeave的时候扫描匿名可执行内存，然后直接dump的，这样也可以的，并且不用分析壳so的逻辑，建议大家这么做

分析到这里就可以解密出主so了，但是本着来都来的的心态，还是看看后面它做了哪些操作吧

```c
v21 = (void *)(v12 & 0xFFFFF000);
v22 = ((v17 + 4095) & 0xFFFFF000) - (unsigned int)v21;
real_base = mmap(v21, v22, 3, 34, -1, 0);   // 分配匿名内存，用于映射真正的so
```

```c
if ( mprotect(v38, v111, (*(_DWORD *)v29 >> 2) & 1 | *(_DWORD *)v29 & 2 | (4 * (*(_DWORD *)v29 & 1))) == -1 )// 恢复各个段的权限
goto LABEL_131;
if ( (*(_DWORD *)v29 & 2) != 0 )
  break;
v67 = (*(_DWORD *)v29 >> 2) & 1 | 2;
v68 = (*(_DWORD *)v29 & 1) != 0 ? 4 : 0;
v29 += 56LL;
mprotect(v38, v111, v67 | v68);
v30 = v25 == ++v27;
```

```c
((void (__fastcall *)(unsigned __int64, __int64, __int64, _QWORD, __int64 *, _QWORD, __int64))sub_2CD0)(// 一种重定位
            v119,
            v118,
            v123,
            (unsigned int)v124,
            &v123,
            v90,
            v117);
          ((void (__fastcall *)(unsigned __int64, __int64, __int64, _QWORD, __int64 *, _QWORD, __int64))sub_2CD0)(// 另一种重定位
            v93,
            v94,
            v129,
            (unsigned int)len,
            &v123,
            v90,
            v95);
```

```c
v57 = ((__int64 (__fastcall *)(unsigned __int64, const void *, _QWORD, __int64, __int64))sub_303C)(// 查找JNI_OnLoad
                 v107,
                 v106,
                 (unsigned int)v115,
                 v109,
                 v110);
         if ( v80 != (void (__fastcall *)(__int64))-1LL && v80 )
           v80(v57);
         for ( i = 0; (unsigned int)v74 > (unsigned int)i; ++i )// 调内层so的.init_array
         {
           v59 = *(void (**)(void))(v77 + 8 * i);
           if ( v59 != (void (*)(void))-1LL && v59 )
             v59();
         }
```

```c
memcpy((void *)(shell_base + (unsigned int)dword_15084), (const void *)v116, v63);// 把内层 SysV hash 拷到外层 `0x15C000`
         memcpy(v64, v62, (unsigned int)dword_15064);// 把内层 dynsym 拷到外层 `0x159000`
         memcpy(v65, v61, (unsigned int)dword_15078);// 把内层 dynstr 拷到外层 `0x15B000`
         close(SHIDWORD(v105));
```

总结下来就是：

1.  从 /proc/self/maps 定位当前 so 的真实文件路径
2.  打开自身文件
3.  读取尾部密钥材料
4.  读取并解密内层 ELF 头
5.  映射并解密包含 Program Header 的第一页
6.  计算内层镜像范围并申请最终地址空间
7.  逐段读取、XOR 解密、装载 PT_LOAD，完成 BSS
8.  解析 PT_DYNAMIC
9.  dlopen 依赖库
10.  用自定义解析器做重定位
11.  定位内层 JNI_OnLoad
12.  调用 DT_INIT 和 INIT_ARRAY
13.  把内层 hash/dynsym/dynstr 回填到外层壳的预留区
14.  返回，等待外部以后通过外层库视图解析到内层符号

感觉和我之前写的差不多，但是我把加密的步骤前置了 [so加固玩具版](https://bbs.kanxue.com/thread-287254.htm)

### 主so解密

```python
from __future__ import annotations

import argparse
from pathlib import Path
import sys

PAYLOAD_OFFSET = 0x8000
TAIL_OFFSET = 0x1181DD
TAIL_SIZE = 0x14
HEADER_SIZE = 0x40
STREAM_KEY_SIZE = 16

def rc4_like_decrypt_header(enc_header: bytes, stream_key: bytes) -> bytes:
    if len(enc_header) != HEADER_SIZE:
        raise ValueError(f"expected {HEADER_SIZE:#x}-byte header, got {len(enc_header):#x}")
    if len(stream_key) != STREAM_KEY_SIZE:
        raise ValueError(f"expected {STREAM_KEY_SIZE} key bytes, got {len(stream_key)}")

    sbox = list(range(256))
    j = 0
    key_index = 0

    for i in range(256):
        j = (j + sbox[i] + stream_key[key_index]) & 0xFF
        sbox[i], sbox[j] = sbox[j], sbox[i]
        key_index = (key_index + 1) % STREAM_KEY_SIZE

    out = bytearray(enc_header)
    i = 0
    j = 0
    for pos in range(len(out)):
        i = (i + 1) & 0xFF
        t = sbox[i]
        j = (j + t) & 0xFF
        sbox[i], sbox[j] = sbox[j], t
        out[pos] ^= sbox[(sbox[i] + t) & 0xFF]

    return bytes(out)

def decrypt_libdexhelper_outer(outer_data: bytes) -> tuple[bytes, int]:
    min_size = TAIL_OFFSET + TAIL_SIZE
    if len(outer_data) < min_size:
        raise ValueError(
            f"file too small: need at least {min_size:#x} bytes, got {len(outer_data):#x}"
        )

    tail = outer_data[TAIL_OFFSET : TAIL_OFFSET + TAIL_SIZE]
    stream_key = tail[:STREAM_KEY_SIZE]
    body_xor_key = tail[STREAM_KEY_SIZE]

    payload = bytearray(outer_data[PAYLOAD_OFFSET:TAIL_OFFSET])
    if len(payload) < HEADER_SIZE:
        raise ValueError("embedded payload is smaller than the encrypted header")

    # The inner ELF body is XOR-encrypted with a single-byte key.
    for idx in range(HEADER_SIZE, len(payload)):
        payload[idx] ^= body_xor_key

    # The first 0x40 bytes are encrypted separately with the RC4-like routine.
    payload[:HEADER_SIZE] = rc4_like_decrypt_header(payload[:HEADER_SIZE], stream_key)

    return bytes(payload), body_xor_key

def build_default_output_path(input_path: Path) -> Path:
    if input_path.suffix:
        return input_path.with_name(f"{input_path.stem}.hidden.decrypted{input_path.suffix}")
    return input_path.with_name(f"{input_path.name}.hidden.decrypted.so")

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Decrypt the hidden inner ELF from this protected libDexHelper.so sample."
    )
    parser.add_argument("input", type=Path, help="Path to the encrypted outer libDexHelper.so")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output path for the decrypted inner ELF. Defaults next to the input file.",
    )
    return parser.parse_args(argv)

def main(argv: list[str]) -> int:
    args = parse_args(argv)
    input_path: Path = args.input
    output_path: Path = args.output or build_default_output_path(input_path)

    outer_data = input_path.read_bytes()
    inner_data, xor_key = decrypt_libdexhelper_outer(outer_data)

    if inner_data[:4] != b"\x7fELF":
        raise RuntimeError(
            "decryption completed, but the result does not start with ELF magic; "
            "double-check the sample matches this script."
        )

    output_path.write_bytes(inner_data)

    print(f"input : {input_path}")
    print(f"output: {output_path}")
    print(f"tail offset   : {TAIL_OFFSET:#x}")
    print(f"payload offset: {PAYLOAD_OFFSET:#x}")
    print(f"body xor key  : {xor_key:#x}")
    print(f"payload size  : {len(inner_data):#x}")
    print(f"elf magic     : {inner_data[:4].hex()}")

    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
```

运行一下，就要开始分析主so了捏

### 铺垫

我们后面在hook主so里的函数时需要使用主so的基地址+函数偏移，但是主so是被映射到它自己mmap的匿名内存上的，这里有很多方案，我们选择相对优雅的一种

之前分析出了

```c
real_base = mmap(v21, v22, 3, 34, -1, 0);   // 分配匿名内存，用于映射真正的so
```

我们直接hook mmap，根据后面四个参数值进行过滤即可，如果噪音过多，可以根据映射大小进一步过滤。过滤完可以看到只这样的

```bash
[+] inner base = 0x7c01620000
[+] mmap args  = addr=0x0 len=0x134000 prot=0x3 flags=0x22 fd=-1 off=0x0 ra=0x7c00c21888
```

```javascript
var target_so = "libDexHelper.so";
var linker_name = Process.pointerSize === 8 ? "linker64" : "linker";
var call_constructors_offset = 0xb4900; // oriole / Pixel 6

var target_seen = false;
var found = false;
var mmap_hooked = false;

var outer_base = null;
var outer_size = 0;

function hook_mmap() {
    if (mmap_hooked) return;

    mmap_hooked = true;
    Interceptor.attach(Module.findExportByName("libc.so", "mmap"), {
        onEnter: function (args) {
            this.addr = args[0];
            this.len = args[1];
            this.prot = args[2].toInt32();
            this.flags = args[3].toInt32();
            this.fd = args[4].toInt32();
            this.off = args[5].toUInt32();
            this.ra = this.returnAddress;
        },
        onLeave: function (retval) {
            if (found || retval.isNull() || outer_base == null) return;

            let from_outer =
                this.ra.compare(outer_base) >= 0 &&
                this.ra.compare(outer_base.add(outer_size)) < 0;

            if (
                from_outer &&
                this.prot === 3 &&
                this.flags === 0x22 &&
                this.fd === -1 &&
                this.off === 0
            ) {
                found = true;
                console.log("[+] inner base =", retval);
                console.log(
                    "[+] mmap args  =",
                    "addr=" + this.addr,
                    "len=" + this.len,
                    "prot=0x" + this.prot.toString(16),
                    "flags=0x" + this.flags.toString(16),
                    "fd=" + this.fd,
                    "off=0x" + this.off.toString(16),
                    "ra=" + this.ra
                );
            }
        }
    });
}

function hook_linker_call_constructors() {
    if (hook_linker_call_constructors.hooked) return;
    hook_linker_call_constructors.hooked = true;

    let linker64_base_addr = Module.getBaseAddress(linker_name);
    if (!linker64_base_addr) return;

    let call_constructors = linker64_base_addr.add(call_constructors_offset);
    Interceptor.attach(call_constructors, {
        onEnter: function (args) {
            if (!target_seen || mmap_hooked || found) return;

            let secmodule = Process.findModuleByName(target_so);
            if (secmodule == null) return;

            outer_base = secmodule.base;
            outer_size = secmodule.size;
            hook_mmap();
        }
    });
}

function hook_dlopen() {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
        onEnter: function (args) {
            if (found) return;

            this.fileName = args[0].isNull() ? "" : args[0].readCString();
            if (this.fileName && this.fileName.indexOf(target_so) >= 0) {
                target_seen = true;
                hook_linker_call_constructors();
            }
        }
    });
}

hook_dlopen();
```

如此我们便可以知道映射大小= `len=0x134000` 的时候的返回值是我们要的，我们就可以写出更简洁的脚本

```javascript
var found = false;

Interceptor.attach(Module.findExportByName("libc.so", "mmap"), {
    onEnter: function (args) {
        this.len = args[1].toUInt32();
    },
    onLeave: function (retval) {
        if (found || retval.isNull()) return;

        if (this.len === 0x134000) {
            found = true;
            console.log("[+] inner base =", retval);
        }
    }
});
```

## 0x02 正文

![image-20260408224251994](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7a5aa76890c44f5a.webp)

蓝蓝一片非常之爽，.init_array里没有注册函数，但是JNI_OnLoad反编译之后居然有3000行，那暂时先不看了

先来明确一下目标吧

1.  **过frida检测**
2.  **静态解密dex完成脱壳**

到现在为止还没咋使用到frida，但是不用想，附加上去启动app包是会崩溃的。目前已知所有重要逻辑入口都在JNI_OnLoad，那直接来trace一下函数调用链吧

### 0x02.1 frida检测绕过

#### 初步绕过

这里使用到oacia大佬的 [stalker_trace_so](https://github.com/oacia/stalker_trace_so) ，建议大家优先使用这个工具，他可以记录所有IDA识别出来并且被主线程执行到的函数，帮我们快速定位大致范围

需要注意的是生成的脚本在trace时基地址要稍作修改，因为它的主so是动态释放的

```javascript
var so_name = "libDexHelper.so";
var inner_base = null;
var trace_started = false;
var found = false;
var mmap_listener = null;

/*
    @param print_stack: Whether printing stack info, default is false.
*/
var print_stack = false;

/*
    @param print_stack_mode
    - FUZZY: print as much stack info as possible
    - ACCURATE: print stack info as accurately as possible
    - MANUAL: if printing the stack info in an error and causes exit, use this option to manually print the address
*/
var print_stack_mode = "FUZZY";

function addr_in_so(addr){
    var process_Obj_Module_Arr = Process.enumerateModules();
    for(var i = 0; i < process_Obj_Module_Arr.length; i++) {
        if(addr>process_Obj_Module_Arr[i].base && addr<process_Obj_Module_Arr[i].base.add(process_Obj_Module_Arr[i].size)){
            console.log(addr.toString(16),"is in",process_Obj_Module_Arr[i].name,"offset: 0x"+(addr-process_Obj_Module_Arr[i].base).toString(16));
        }
    }
}

function hook_dlopen() {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"),
        {
            onEnter: function (args) {
                var pathptr = args[0];
                if (pathptr !== undefined && pathptr != null) {
                    var path = ptr(pathptr).readCString();
                    //console.log(path);
                    if (path.indexOf(so_name) >= 0) {
                        this.is_can_hook = true;
                    }
                }
            },
            onLeave: function (retval) {
                if (this.is_can_hook && !trace_started) {
                    console.log("[+] mmap base   = " + inner_base);
                    console.log("[+] use mmap base = " + inner_base);

                    // note: you can do any thing before or after stalker trace so.
                    if (inner_base != null) {
                        if (mmap_listener != null) {
                            mmap_listener.detach();
                            mmap_listener = null;
                            console.log("[+] mmap hook detached");
                        }
                        trace_so();
                    }
                }
            }
        }
    );
}

function hook_mmap() {
    mmap_listener = Interceptor.attach(Module.findExportByName("libc.so", "mmap"), {
        onEnter: function (args) {
            this.len = args[1].toUInt32();
        },
        onLeave: function (retval) {
            if (found || retval.isNull()) return;

            if (this.len === 0x134000) {
                found = true;
                inner_base = ptr(retval.toString());
                console.log("[+] inner base = " + inner_base);
            }
        }
    });
}

function trace_so(){
    if (inner_base == null || trace_started) return;

    trace_started = true;
    var times = 1;
    var module_base = inner_base;
    var pid = Process.getCurrentThreadId();
    console.log("start Stalker!");
    Stalker.exclude({
        "base": Process.getModuleByName("libc.so").base,
        "size": Process.getModuleByName("libc.so").size
    })
        events:{
            call:false,
            ret:false,
            exec:false,
            block:false,
            compile:false
        },
        onReceive:function(events){
        },
        transform: function (iterator) {
            var instruction = iterator.next();
            do{
                var offset = instruction.address.sub(module_base).toUInt32();
                var index = func_addr.indexOf(offset);
                if (index !== -1) {
                    console.log("call" + times + ":" + func_name[index])
                    times = times + 1
                    if (print_stack) {
                        if (print_stack_mode === "FUZZY") {
                            iterator.putCallout((context) => {
                                console.log("backtrace:\n"+Thread.backtrace(context, Backtracer.FUZZY).map(DebugSymbol.fromAddress).join('\n'));
                                console.log('---------------------')
                            });
                        }
                        else if (print_stack_mode === "ACCURATE") {
                            iterator.putCallout((context) => {
                                console.log("backtrace:\n"+Thread.backtrace(context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                                console.log('---------------------')
                            })
                        }

                        else if (print_stack_mode === "MANUAL") {
                            iterator.putCallout((context) => {
                                console.log("backtrace:")
                                Thread.backtrace(context, Backtracer.FUZZY).map(addr_in_so);
                                console.log('---------------------')
                            })
                        }
                    }
                }
                iterator.keep();
            } while ((instruction = iterator.next()) !== null);
        },

        onCallSummary:function(summary){

        }
    });
    console.log("Stalker end!");
}

hook_mmap();
setImmediate(hook_dlopen,0);
```

只看最后几条日志

```bash
call107:sub_402CC
call108:sub_3ED48
call109:regfree
call110:usleep
call111:dlopen
call112:dlsym
call113:sub_AED04
call114:sub_AE270
call115:sub_AEA58
call116:mmap
call117:sub_AF28C
call118:sub_AF4C8
call119:sub_AEE3C
call120:stat
call121:dlclose
call122:sub_42868
call123:sub_1304C
```

直接hook `sub_1304C` 试试看，当然这样不严谨，但是可以快速看看有没有效果

```bash
Spawned `com.moutai.mall`. Resuming main thread!
[Pixel 6::com.moutai.mall ]-> [+] inner base = 0x7c00ce9000
[+] mmap hook detached
[+] patched sub_1304C @ 0x7c00cfc04c
[+] dlopen hook detached
Process terminated
[Pixel 6::com.moutai.mall ]->
```

依旧崩了，但是这次的崩溃相较上一次正常的多，判断为不是被同一处检测点检测到了，把hook `sub_1304C` 的 逻辑加上，再trace一次

```javascript
function rep_sub1304C() {
    if (inner_base == null || sub1304c_replaced) return;

    var target = inner_base.add(0x1304c);
    console.log("[+] replacing sub_1304C @ " + target);

    Interceptor.replace(target, new NativeCallback(function (a0, a1, a2) {
        console.log(
            "[+] skip sub_1304C(flag=" + a0.toString() +
            ", code=0x" + a1.toString(16) +
            ", mask=0x" + a2.toString(16) + ")"
        );
        return 0;
    }, 'int64', ['int64', 'uint32', 'int']));

    sub1304c_replaced = true;
}
```

这次的日志的最后几行

```javascript
call188:sub_24F18
call189:.strcasecmp
call190:sub_105B8
call191:sub_FE78
call192:sub_40B04
call193:sub_3DBB4
call194:sub_3DF50
call195:sub_406E8
call196:sub_41838
call197:sub_408C4
Process terminated
[Pixel 6::com.moutai.mall ]->
```

初步看了一下，上面几个没啥可疑的，估计就是检测到了然后正常退出，这里由于最后几条函数并不是检测函数和退出函数，所以这里大概率不是 **同步** 的检测。或者还有一种可能，假设函数B是检函数，函数A调用B，然后根据B的返回结果决定是否退出App。当前trace脚本只能记录“ **执行流进入了哪些函数入口** ”，但没有记录“ **函数返回到了哪里** ”以及“ **调用者在拿到返回值后又执行了什么分支逻辑** ”，所以只能看到A和B都执行过，却不一定能定位到 A 在函数内部哪一条指令上完成了退出。

#### 进一步绕过

搞这里也是时间有点晚了，我也懒得跟他废话了，直接用内核模块监控一下哪里给我app干崩了(上文已经分析出此处的崩溃是正常的退出)

```bash
[43097.547378] [Yuuki] === kill_monitor: kill (PID:19581 UID:10282 com.moutai.mall) sig=9 ===
[43097.547388] [Yuuki] [UID 10282] #00 pc = 0x7c007720a4 ???!0x190a4
[43097.547390] [Yuuki] [UID 10282] #01 pc = 0x7d41443600 [anon:scudo:primary_reserve]!0xabf7600
[43097.547392] [Yuuki] === end backtrace (2 frames) ===
[43097.547394] [Yuuki]
[43097.548342] [Yuuki] === kill_monitor: kill (PID:19581 UID:10282 com.moutai.mall) sig=9 ===
[43097.548346] [Yuuki] [UID 10282] #00 pc = 0x7c00772424 ???!0x19424
[43097.548348] [Yuuki] [UID 10282] #01 pc = 0x7d41443600 [anon:scudo:primary_reserve]!0xabf7600
[43097.548351] [Yuuki] === end backtrace (2 frames) ===
[43097.548353] [Yuuki]
```

一共两处，IDA跳过去看看

![image-20260412213539531](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2631b9b791bc8d4d.webp)

![image-20260412213651042](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fba5a5ee93d79986.webp)

两处都是直接svc call `__NR_kill` 函数直接退的，果然是像我们上面猜测的那样，我们直接给它们patch掉就行了

```javascript
var target_so = "libDexHelper.so";
var inner_base = null;
var found = false;
var patched = false;
var callbacks = [];
var mmap_listener = null;
var dlopen_listener = null;

function patchArm64MovX0Zero(addr, tag) {
    Memory.patchCode(addr, 4, function (code) {
        var writer = new Arm64Writer(code, { pc: addr });
        writer.putMovRegReg("x0", "xzr");
        writer.flush();
    });
    console.log("[+] patched " + tag + " @ " + addr + " (mov x0, xzr)");
}

function applyPatches() {
    if (patched || inner_base == null) return;

    var sub1304c = inner_base.add(0x1304c);
    var cb = new NativeCallback(function () {
        return 0;
    }, "int", []);

    callbacks.push(cb);
    Interceptor.replace(sub1304c, cb);
    console.log("[+] patched sub_1304C @ " + sub1304c);

    patchArm64MovX0Zero(inner_base.add(0x190a0), "kill syscall #1");
    patchArm64MovX0Zero(inner_base.add(0x19420), "kill syscall #2");

    patched = true;
}

mmap_listener = Interceptor.attach(Module.findExportByName("libc.so", "mmap"), {
    onEnter: function (args) {
        this.len = args[1].toUInt32();
    },
    onLeave: function (retval) {
        if (found || retval.isNull()) return;

        if (this.len === 0x134000) {
            found = true;
            inner_base = ptr(retval.toString());
            console.log("[+] inner base = " + inner_base);
            if (mmap_listener) {
                mmap_listener.detach();
                mmap_listener = null;
                console.log("[+] mmap hook detached");
            }
        }
    }
});

dlopen_listener = Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
    onEnter: function (args) {
        this.fileName = args[0].isNull() ? "" : args[0].readCString();
    },
    onLeave: function (retval) {
        if (patched) return;

        if (this.fileName && this.fileName.indexOf(target_so) >= 0 && inner_base != null) {
            applyPatches();
            if (dlopen_listener) {
                dlopen_listener.detach();
                dlopen_listener = null;
                console.log("[+] dlopen hook detached");
            }
        }
    }
});
```

直接注入启动，app完美运行，美美得吃了也是

但是这种方式并不是很优雅，毕竟不是每个人都能用内核模块。值得注意的是上面两个退出点都在 `JNI_OnLoad` 函数中，这就很值得注意了，正常检测逻辑怎么会放在这个函数中呢？我觉得只有 **傻** \*才会这样写代码，所以这里 `JNI_OnLoad` 只是起到一个最终的决策作用。具体来说就是 `JNI_OnLoad` 里通过无论是新建线程还是直接同步调用函数的方式，去启动检测函数，然后不在检测函里执行退出机制，而是拿到检测函数的结果，集中在 `JNI_OnLoad` 里进行处理。当然这些只是我的猜测，至于为什么这么做，可能是因为 `JNI_OnLoad` 经过了混淆，开发者觉得大多数逆向人员不会去优先看这个函数。事实也的确如此

有的朋友通过hook clone那套 + 处理 `sub_1304C` 也能绕过检测，但是我感觉这样比较麻烦

#### 更一般的方式

我们继续来 **优雅** (暴力)的解决刚刚的问题吧

已知退出是正常的退出，只是通过svc直接call内核函数而已。这里可以有一些大众的处理方案

1.  直接trace指令，注册svc的callback，打印内核函数名和参数就行了，直接就能定位到第一现场。这个我是尝试了一下，确实是可行的
2.  直接IDA扫所有svc指令，反向污点确定x8寄存器的值，根据系统调用号(**Android arm64 系统调用号是存在x8寄存器的**)进行过滤，然后全都patch掉

这里我们直接选择 **方案二** ，因为它足够简单，直接写个IDA脚本，帮我们生成对应的frida patch脚本代码，这里我只处理了 `exit` ， `exit_group` ， `kill` ， `tkill` ， `tgkill` ，其他的退出方式并没有做处理，抛砖引玉感兴趣的大佬可以自行拓展

```python
import os
import re

import idautils
import ida_bytes
import ida_funcs
import ida_kernwin
import ida_segment
import idc

TARGET_SYSCALLS = {
    93: "exit",
    94: "exit_group",
    129: "kill",
    130: "tkill",
    131: "tgkill",
}
BACKTRACK_LIMIT = 20
PATCH_FILE_NAME = "termination_patch_snippet.txt"

def log(msg=""):
    print(msg)

def is_exec_seg(seg):
    if seg is None:
        return False
    return bool(seg.perm & ida_segment.SEGPERM_EXEC)

def iter_exec_heads():
    for seg_ea in idautils.Segments():
        seg = ida_segment.getseg(seg_ea)
        if not is_exec_seg(seg):
            continue
        ea = seg.start_ea
        while ea < seg.end_ea:
            flags = ida_bytes.get_flags(ea)
            if ida_bytes.is_code(flags):
                yield ea
            ea = idc.next_head(ea, seg.end_ea)

def op_text(ea, n):
    text = idc.print_operand(ea, n)
    return text.strip() if text else ""

def mnem(ea):
    return idc.print_insn_mnem(ea).lower()

def normalize_reg(text):
    return text.lower().strip()

def is_x8_reg(text):
    reg = normalize_reg(text)
    return reg in ("x8", "w8")

def parse_imm_and_shift(text):
    """
    Parse operand text forms like:
      #0x81
      #0xb6a2,LSL#16
      #123
    Returns (imm, shift_bits).
    """
    t = text.lower().replace(" ", "")
    m = re.match(r"#(?P<imm>-?(?:0x[0-9a-f]+|\d+))(?:,lsl#(?P<shift>\d+))?$", t)
    if not m:
        return None
    imm = int(m.group("imm"), 0)
    shift = int(m.group("shift") or 0)
    return imm, shift

def writes_x8(ea):
    return is_x8_reg(op_text(ea, 0))

def decode_syscall_from_backtrack(svc_ea, limit=BACKTRACK_LIMIT):
    """
    Heuristically reconstruct x8 value by scanning backwards.

    Supports common forms:
      MOV   X8, #imm
      MOVZ  X8, #imm[, LSL#n]
      MOVK  X8, #imm[, LSL#n]
      ORR   X8, XZR, #imm

    Returns:
      {
        "sysno": int or None,
        "writer_eas": [ea...],  # instructions contributing to x8
      }
    """
    func = ida_funcs.get_func(svc_ea)
    if not func:
        return {"sysno": None, "writer_eas": []}

    cur = idc.prev_head(svc_ea, func.start_ea)
    seen = 0
    pieces = []
    writer_eas = []

    while cur != idc.BADADDR and cur >= func.start_ea and seen < limit:
        seen += 1
        insn_mnem = mnem(cur)

        if writes_x8(cur):
            writer_eas.append(cur)

            if insn_mnem in ("mov", "movz"):
                parsed = parse_imm_and_shift(op_text(cur, 1))
                if parsed is None:
                    return {"sysno": None, "writer_eas": writer_eas}
                imm, shift = parsed
                value = imm << shift
                for part_shift, part_imm in pieces:
                    mask = 0xFFFF << part_shift
                    value = (value & ~mask) | ((part_imm & 0xFFFF) << part_shift)
                return {"sysno": value, "writer_eas": writer_eas}

            if insn_mnem == "movk":
                parsed = parse_imm_and_shift(op_text(cur, 1))
                if parsed is None:
                    return {"sysno": None, "writer_eas": writer_eas}
                imm, shift = parsed
                pieces.append((shift, imm))
                cur = idc.prev_head(cur, func.start_ea)
                continue

            if insn_mnem == "orr":
                src1 = normalize_reg(op_text(cur, 1))
                parsed = parse_imm_and_shift(op_text(cur, 2))
                if src1 == "xzr" and parsed is not None:
                    imm, shift = parsed
                    value = imm << shift
                    return {"sysno": value, "writer_eas": writer_eas}
                return {"sysno": None, "writer_eas": writer_eas}

            return {"sysno": None, "writer_eas": writer_eas}

        cur = idc.prev_head(cur, func.start_ea)

    return {"sysno": None, "writer_eas": writer_eas}

def nearby_insns(ea, before=10, after=2):
    items = []
    cur = ea
    for _ in range(before):
        cur = idc.prev_head(cur, idc.get_segm_start(cur))
        if cur == idc.BADADDR:
            break
    count = before + after + 1
    while cur != idc.BADADDR and count > 0:
        items.append((cur, idc.GetDisasm(cur)))
        nxt = idc.next_head(cur, idc.get_segm_end(cur))
        if nxt == idc.BADADDR or nxt == cur:
            break
        cur = nxt
        count -= 1
    return items

def make_patch_lines(matches):
    lines = []
    lines.append("// auto-generated by search_kill.py")
    lines.append("function patchArm64MovX0Zero(addr, tag) {")
    lines.append("    Memory.patchCode(addr, 4, function (code) {")
    lines.append("        var writer = new Arm64Writer(code, { pc: addr });")
    lines.append('        writer.putMovRegReg("x0", "xzr");')
    lines.append("        writer.flush();")
    lines.append("    });")
    lines.append('    console.log("[+] patched " + tag + " @ " + addr + " (mov x0, xzr)");')
    lines.append("}")
    lines.append("")
    for idx, item in enumerate(matches, 1):
        tag = "%s syscall(%d) #%d @ 0x%x" % (
            item["sys_name"],
            item["sysno"],
            idx,
            item["svc_ea"],
        )
        lines.append("// %s (%d)" % (item["sys_name"], item["sysno"]))
        lines.append('patchArm64MovX0Zero(inner_base.add(0x%x), "%s");' % (item["svc_ea"], tag))
    return "\n".join(lines)

def write_snippet_file(text):
    out_dir = os.path.dirname(idc.get_idb_path()) or os.getcwd()
    out_path = os.path.join(out_dir, PATCH_FILE_NAME)
    try:
        with open(out_path, "w", encoding="utf-8") as fp:
            fp.write(text)
        return out_path
    except Exception as exc:
        log("[!] failed to write snippet file: %s" % exc)
        return None

def main():
    matches = []

    for ea in iter_exec_heads():
        if mnem(ea) != "svc":
            continue

        info = decode_syscall_from_backtrack(ea)
        if info["sysno"] not in TARGET_SYSCALLS:
            continue

        func = ida_funcs.get_func(ea)
        func_name = idc.get_func_name(ea) if func else "<no_func>"

        matches.append({
            "svc_ea": ea,
            "func_start": func.start_ea if func else idc.BADADDR,
            "func_name": func_name,
            "writer_eas": list(reversed(info["writer_eas"])),
            "sysno": info["sysno"],
            "sys_name": TARGET_SYSCALLS[info["sysno"]],
            "nearby": nearby_insns(ea),
        })

    if not matches:
        msg = "[*] no target termination syscall svc sites found"
        log(msg)
        ida_kernwin.info(msg)
        return

    matches.sort(key=lambda x: (x["sysno"], x["svc_ea"]))

    log("[*] found %d target termination syscall site(s)" % len(matches))
    log("")

    for idx, item in enumerate(matches, 1):
        log("=" * 72)
        log("[%d] svc @ 0x%x  func=%s @ 0x%x  %s (sysno=%d / 0x%x)" % (
            idx,
            item["svc_ea"],
            item["func_name"],
            item["func_start"],
            item["sys_name"],
            item["sysno"],
            item["sysno"],
        ))
        if item["writer_eas"]:
            log("    x8 writers:")
            for w in item["writer_eas"]:
                log("      0x%x  %s" % (w, idc.GetDisasm(w)))
        else:
            log("    x8 writers: <unresolved>")
        log("    nearby:")
        for ea, text in item["nearby"]:
            mark = ">>" if ea == item["svc_ea"] else "  "
            log("    %s 0x%x  %s" % (mark, ea, text))
        log("")

    snippet = make_patch_lines(matches)
    out_path = write_snippet_file(snippet)

    log("=" * 72)
    log("[*] bypass.js snippet:")
    log(snippet)
    log("")
    if out_path:
        log("[*] snippet saved to: %s" % out_path)

    ida_kernwin.info("search_kill.py finished, found %d target termination svc site(s)" % len(matches))

if __name__ == "__main__":
    main()
```

加上我们之前对 `sub_1304C` 的处理，就可以完美绕过啦~

**完整代码如下：**

```javascript
var target_so = "libDexHelper.so";
var inner_base = null;
var found = false;
var patched = false;
var callbacks = [];
var mmap_listener = null;
var dlopen_listener = null;

function patchArm64MovX0Zero(addr, tag) {
    Memory.patchCode(addr, 4, function (code) {
        var writer = new Arm64Writer(code, { pc: addr });
        writer.putMovRegReg("x0", "xzr");
        writer.flush();
    });
    console.log("[+] patched " + tag + " @ " + addr + " (mov x0, xzr)");
}

function applyPatches() {
    if (patched || inner_base == null) return;

    var sub1304c = inner_base.add(0x1304c);
    var cb = new NativeCallback(function () {
        return 0;
    }, "int", []);

    callbacks.push(cb);
    Interceptor.replace(sub1304c, cb);
    console.log("[+] patched sub_1304C @ " + sub1304c);

    // 精准的patch只需这两处
    // patchArm64MovX0Zero(inner_base.add(0x190a0), "kill syscall #1");
    // patchArm64MovX0Zero(inner_base.add(0x19420), "kill syscall #2");

    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x17558), "kill syscall(129) #1 @ 0x17558");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x17614), "kill syscall(129) #2 @ 0x17614");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x176ec), "kill syscall(129) #3 @ 0x176ec");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x17a7c), "kill syscall(129) #4 @ 0x17a7c");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x17af0), "kill syscall(129) #5 @ 0x17af0");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x190a0), "kill syscall(129) #6 @ 0x190a0");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x1925c), "kill syscall(129) #7 @ 0x1925c");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x19420), "kill syscall(129) #8 @ 0x19420");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x25fb0), "kill syscall(129) #9 @ 0x25fb0");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x4f3a0), "kill syscall(129) #10 @ 0x4f3a0");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x4f5d4), "kill syscall(129) #11 @ 0x4f5d4");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x4febc), "kill syscall(129) #12 @ 0x4febc");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x55368), "kill syscall(129) #13 @ 0x55368");
    // kill (129)
    patchArm64MovX0Zero(inner_base.add(0x56588), "kill syscall(129) #14 @ 0x56588");

    patched = true;
}

mmap_listener = Interceptor.attach(Module.findExportByName("libc.so", "mmap"), {
    onEnter: function (args) {
        this.len = args[1].toUInt32();
    },
    onLeave: function (retval) {
        if (found || retval.isNull()) return;

        if (this.len === 0x134000) {
            found = true;
            inner_base = ptr(retval.toString());
            console.log("[+] inner base = " + inner_base);
            if (mmap_listener) {
                mmap_listener.detach();
                mmap_listener = null;
                console.log("[+] mmap hook detached");
            }
        }
    }
});

dlopen_listener = Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
    onEnter: function (args) {
        this.fileName = args[0].isNull() ? "" : args[0].readCString();
    },
    onLeave: function (retval) {
        if (patched) return;

        if (this.fileName && this.fileName.indexOf(target_so) >= 0 && inner_base != null) {
            applyPatches();
            if (dlopen_listener) {
                dlopen_listener.detach();
                dlopen_listener = null;
                console.log("[+] dlopen hook detached");
            }
        }
    }
});
```

## 0x03 小结

很早以前就读壳感兴趣，但是一直没有时间研究。这次特意选了安卓端最简单的壳进行分析。之前不懂为什么那么多国家相关的APP，以及一些大银行，都喜欢用这个的壳，明明比它强的壳还有很多。最近和朋友聊天时问了这个问题。他跟我说，很多东西不是技术层面的问题，而是法律层面的。恍然大悟了也是

这篇篇幅还是有点太短了，剩下的dex解密流程分析过两天回学校有空了再写吧ovo

使用到的一些工具以及文章：

1.  [stalker_trace_so](https://github.com/oacia/stalker_trace_so)

[](#)

Twikoo 评论管理

密码
