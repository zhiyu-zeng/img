---
title: 最右v2sign分析
source: https://yuuki.cool/posts/v2sign/
source_host: yuuki.cool
clip_date: 2026-08-04T11:25:20+08:00
trace_id: e96a917d-f2df-40a1-bb8b-1ede070c0c60
content_hash: dc8db27f9de2debca03721e5be63fa3e5627b44e7e937e8815bfebf873eee89d
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Yuuki·移动安全
ai_summary: 最右App的v2sign签名算法核心为魔改MD5，修改了初始化向量与十六进制编码码表。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-81ec-bc44-f8922239e52f
ioc:
  cves: []
  cwes: []
  hashes:
    - 2fea56d88f833eaeb5fd8af957a2a081
    - 582ff5d679cd51d5a67525e36e29daf4
    - 5d5d1b1e60f18c4e645a0bfcc67a25bf
    - 7cb2f8a00c0ddb2b3fca02c1f9272506
    - bcc59f26ae8410ea5c781da852f0e9f6
    - d7c8f8218c4dabbf9abe28c8a39927d7
    - ea19938ff8811853b04966b7379861f8
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 最右App的v2sign签名算法核心为魔改MD5，修改了初始化向量与十六进制编码码表。
> 
> - **算法原理：** v2sign本质是对明文（如"123456"）执行MD5哈希，但其初始化向量（IV）和结果转为字符串时的码表均被自定义修改。
> - **码表替换：** 将标准MD5转十六进制的码表 `0123456789abcdef` 替换为 `567def8901234abc`，导致相同的MD5原始字节数组会输出完全不同的32位字符串。
> - **魔改IV：** 标准MD5的四个初始化向量被替换为 `0x67552301`、`0xEDCDAB89`、`0x98BADEFE`、`0x16325476`，这从根本上改变了哈希计算结果。
> - **分析定位：** 利用Unidbg对`libnet_crypto.so`进行模拟执行，通过`traceWrite`追踪内存写入，配合`memcpy`的Hook，精准定位到被混淆的字节转十六进制函数和MD5计算函数。
> - **定位技巧：** 可直接在内存中搜索MD5的K表常量来快速定位魔改后的MD5函数，再通过分析输入参数（IV和明文）来印证其修改点。

**密文：**

```
0000: 37 63 62 32 66 38 61 30 30 63 30 64 64 62 32 62    7cb2f8a00c0ddb2b
0010: 33 66 63 61 30 32 63 31 66 39 32 37 32 35 30 36    3fca02c1f9272506
```

**开启详细日志**

```
Logger.getLogger(DalvikVM64.class).setLevel(Level.DEBUG);
```

得到newStringUTF数据地址 0x4041e2f0

**traceWrite**

```
emulator.traceWrite(0x4041e2f0, 0x4041E312);
```

得到日志：

```kotlin
[11:10:40 213] Memory WRITE at 0x4041e2f0, data size = 8, data value = 0x66326263372d3276, PC=RX@0x401fc184[libc.so]0x1c184, LR=RX@0x40019210[libnet_crypto.so]0x19210
[11:10:40 213] Memory WRITE at 0x4041e2f8, data size = 8, data value = 0x6464306330306138, PC=RX@0x401fc184[libc.so]0x1c184, LR=RX@0x40019210[libnet_crypto.so]0x19210
[11:10:40 213] Memory WRITE at 0x4041e300, data size = 8, data value = 0x3061636633623262, PC=RX@0x401fc18c[libc.so]0x1c18c, LR=RX@0x40019210[libnet_crypto.so]0x19210
[11:10:40 213] Memory WRITE at 0x4041e308, data size = 8, data value = 0x3237323966316332, PC=RX@0x401fc18c[libc.so]0x1c18c, LR=RX@0x40019210[libnet_crypto.so]0x19210
[11:10:40 213] Memory WRITE at 0x4041e303, data size = 8, data value = 0x3163323061636633, PC=RX@0x401fc1a4[libc.so]0x1c1a4, LR=RX@0x40019210[libnet_crypto.so]0x19210
[11:10:40 214] Memory WRITE at 0x4041e30b, data size = 8, data value = 0x3630353237323966, PC=RX@0x401fc1a4[libc.so]0x1c1a4, LR=RX@0x40019210[libnet_crypto.so]0x19210
[11:10:40 214] Memory WRITE at 0x4041e2f0, data size = 8, data value = 0x000000004041e320, PC=RX@0x4005a704[libnet_crypto.so]0x5a704, LR=RX@0x4005a6fc[libnet_crypto.so]0x5a6fc
v2-7cb2f8a00c0ddb2b3fca02c1f9272506
```

可以看到PC指向lbc里的函数，打开libc，跳进去，发现是memcpy函数

## Hook Memcpy

**Hook Memcpy**

```java
public void hookMemcpy() {
        Debugger debugger = emulator.attach();
        debugger.addBreakPoint(module.findSymbolByName("memcpy").getAddress(), (emulator, address) -> {
            RegisterContext context = emulator.getContext();
            UnidbgPointer arg0 = context.getPointerArg(0);
            UnidbgPointer arg1 = context.getPointerArg(1);
            int arg2 = context.getIntArg(2);
            Inspector.inspect(
                    arg1.getByteArray(0, arg2),
                    "memcpy" + " 写入地址 " + "0x" + Long.toHexString(arg0.peer) + " 读取地址 " + "0x" + Long.toHexString(arg1.peer)
            );
            return true;
        });
    }
```

**日志：**

```
[11:10:40 213]memcpy 写入地址 0x4041e2f0 读取地址 0x4041e2c0, md5=ea19938ff8811853b04966b7379861f8, hex=76322d3763623266386130306330646462326233666361303263316639323732353036
size: 35
0000: 76 32 2D 37 63 62 32 66 38 61 30 30 63 30 64 64    v2-7cb2f8a00c0dd
0010: 62 32 62 33 66 63 61 30 32 63 31 66 39 32 37 32    b2b3fca02c1f9272
0020: 35 30 36                                           506
^-----------------------------------------------------------------------------^
```

可以看到读取地址在0x4041e2c0，接着监控一下这块内存的写入

```
emulator.traceWrite(0x4041e2c0, 0x4041e2e2);
```

**部分日志**

```kotlin
[12:42:02 493] Memory WRITE at 0x4041e2c0, data size = 1, data value = 0x37, PC=RX@0x4003100c[libnet_crypto.so]0x3100c, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c1, data size = 1, data value = 0x63, PC=RX@0x4003100c[libnet_crypto.so]0x3100c, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c2, data size = 1, data value = 0x62, PC=RX@0x40031024[libnet_crypto.so]0x31024, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c3, data size = 1, data value = 0x32, PC=RX@0x40031024[libnet_crypto.so]0x31024, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c4, data size = 1, data value = 0x66, PC=RX@0x40031024[libnet_crypto.so]0x31024, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c5, data size = 1, data value = 0x38, PC=RX@0x40031024[libnet_crypto.so]0x31024, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c6, data size = 1, data value = 0x61, PC=RX@0x40031024[libnet_crypto.so]0x31024, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c7, data size = 1, data value = 0x30, PC=RX@0x40031024[libnet_crypto.so]0x31024, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
[12:42:02 493] Memory WRITE at 0x4041e2c8, data size = 1, data value = 0x30, PC=RX@0x40031024[libnet_crypto.so]0x31024, LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4
```

0x37是我们密文的第一个字节，对应的日志输出了PC和LR的地址 `PC=RX@0x4003100c[libnet_crypto.so]0x3100c` `LR=RX@0x40030ec4[libnet_crypto.so]0x30ec4`

先看指向的函数：

```cpp
void *__usercall sub_30C94@<X0>(unsigned __int8 *a1@<X0>, _QWORD *n1228256393@<X8>)
{
  void *n1228256393_1; // x0
  const void *v5; // x21
  void *v6; // x22
  int n1554935301; // w25
  int n1554935301_1; // w9
  signed __int64 v9; // x8
  int n1554935301_2; // w10
  bool v11; // zf
  signed __int64 v12; // x8
  size_t v13; // x23
  int n1466722806; // w27
  int n1466722806_1; // w9
  int n1466722806_2; // w8
  __int64 v17; // x8
  __int64 n32; // x9
  unsigned int v19; // t1
  __int64 v20; // x13
  __int64 v21; // x14

  _ReadStatusReg(TPIDR_EL0);
  n1228256393[4] = n1228256393;
  n1228256393[5] = n1228256393;
  n1228256393_1 = n1228256393;
  if ( (int)n1228256393 <= 1228256393 && (_DWORD)n1228256393 != 1059521444 )
    std::__stl_throw_length_error(&byte_9B5F4);
  *(_BYTE *)n1228256393 = 0;
  if ( n1228256393[4] - n1228256393[5] > 0x1Fu )
  {
    v5 = (const void *)n1228256393[4];
    v6 = (void *)(n1228256393[5] + 32LL);
    if ( v6 == v5 )
      n1554935301 = -1086414335;
    else
      n1554935301 = 1554935301;
    n1554935301_1 = -666440926;
    v9 = n1228256393[4];
    while ( 1 )
    {
      do
      {
        n1554935301_2 = n1554935301_1;
        v11 = n1554935301_1 == -666440926;
        n1554935301_1 = n1554935301;
      }
      while ( v11 );
      if ( n1554935301_2 == -1086414335 )
        break;
      if ( n1554935301_2 != 1554935301 )
      {
        while ( 1 )
          ;
      }
      v12 = v9 - (_QWORD)v5;
      v13 = v12 + 1;
      if ( v12 == -1 )
        n1466722806 = -2068670317;
      else
        n1466722806 = 1466722806;
      for ( n1466722806_1 = -2093236247; ; n1466722806_1 = -2068670317 )
      {
        do
        {
          n1466722806_2 = n1466722806_1;
          v11 = n1466722806_1 == -2093236247;
          n1466722806_1 = n1466722806;
        }
        while ( v11 );
        if ( n1466722806_2 != 1466722806 )
          break;
        n1228256393_1 = memmove(v6, v5, v13);
      }
      if ( n1466722806_2 != -2068670317 )
      {
        while ( 1 )
          ;
      }
      v9 = n1228256393[4] + (_BYTE *)v6 - (_BYTE *)v5;
      n1228256393[4] = v9;
      n1554935301_1 = -1086414335;
    }
  }
  else
  {
    n1228256393_1 = (void *)sub_311F4(
                              (int)n1228256393,
                              -669595639 - *((_DWORD *)n1228256393 + 8) + *((_DWORD *)n1228256393 + 10) + 669595671,
                              0);
  }
  v17 = 0;
  // 主要看这部分 a567def8901234a 是个表:
  // .rodata:000000000006D680 a567def8901234a DCB "567def8901234abc",0
  // =================================================
  for ( n32 = 0; n32 != 32; n32 += 2 )
  {
    v19 = *a1++;
    ++v17;
    *(_BYTE *)(n1228256393[5] + n32) = a567def8901234a[(unsigned __int64)v19 >> 4];
    v20 = n32 & 1;
    v21 = n32 ^ 1;
    *(_BYTE *)(n1228256393[5] + (v20 | v21)) = a567def8901234a[v19 & 0xF];
  }
  // =================================================
  _ReadStatusReg(TPIDR_EL0);
  return n1228256393_1;
}
```

经过了一些混淆，但不难看出这是个将一个32字节的数据转换为64字符的十六进制字符串表示形式的函数，并且码表经过了修改，正常应该是 `0123456789abcdef` ，这里留个心

**验证一下：**

```
emulator.attach().addBreakPoint(module.base + 0x30C94);
```

**结果：**

```yaml
mx0

>-----------------------------------------------------------------------------<
[12:48:20 739]x0=unidbg@0xbffff5a8, md5=5d5d1b1e60f18c4e645a0bfcc67a25bf, hex=2fea56d88f833eaeb5fd8af957a2a081000000000000000090e14140000000004016feff00000000f0f6ffbf00000000c48a01400000000020f6ffbf00000000ccd103400000000090e141400000000096e1414000000000a0e141400000000040c10940000000000000000000000000
size: 112
0000: 2F EA 56 D8 8F 83 3E AE B5 FD 8A F9 57 A2 A0 81    /.V...>.....W...
0010: 00 00 00 00 00 00 00 00 90 E1 41 40 00 00 00 00    ..........A@....
0020: 40 16 FE FF 00 00 00 00 F0 F6 FF BF 00 00 00 00    @...............
0030: C4 8A 01 40 00 00 00 00 20 F6 FF BF 00 00 00 00    ...@.... .......
0040: CC D1 03 40 00 00 00 00 90 E1 41 40 00 00 00 00    ...@......A@....
0050: 96 E1 41 40 00 00 00 00 A0 E1 41 40 00 00 00 00    ..A@......A@....
0060: 40 C1 09 40 00 00 00 00 00 00 00 00 00 00 00 00    @..@............
^-----------------------------------------------------------------------------^

```

`2F EA 56 D8 8F 83 3E AE B5 FD 8A F9 57 A2 A0 81` 这一段第一次分析可能没啥头绪，但我分析过老版本的最右，这一段其实是魔改iv的MD5加密之后的结果(明文是123456)，但是我们的密文是：

```
0000: 37 63 62 32 66 38 61 30 30 63 30 64 64 62 32 62    7cb2f8a00c0ddb2b
0010: 33 66 63 61 30 32 63 31 66 39 32 37 32 35 30 36    3fca02c1f9272506
```

## 码表异常

显然差的有点多，但是长度是一致的，结合刚刚的发现，这里的码表被修改过，会不会是码表被修改了，导致结果变了呢？我们来尝试一下即可

```lua
public static String byteHEX(byte ib) {
        /*char[] Digit = { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' };*/
        char[] Digit = "567def8901234abc".toCharArray();
        char[] ob = new char[2];
        ob[0] = Digit[(ib >>> 4) & 0X0F];
        ob[1] = Digit[ib & 0X0F];
        String s = new String(ob);
        return s;
    }
```

## 码表验证

确实输出了我们想要的值 `7cb2f8a00c0ddb2b3fca02c1f9272506` ，那么接下来就是分析 `2fea56d88f833eaeb5fd8af957a2a081` 值的由来了(上面说了，是个魔改MD5==)

当然你可能没分析过老版本的，那也没关系，我们来定位一下这段数据的生成位置。可以看到日志中显示 `x0=unidbg@0xbffff5a8` ，我们监控一下这段内存的读写(当然我第一次并不是这么分析的，这段数据怀疑是MD5，直接在trace日志里搜K表可以直接定位到MD5函数)

```
emulator.traceWrite(0xbffff5a8L, 0xbffff5c7L);
```

**日志：**

```kotlin
[12:56:55 035] Memory WRITE at 0xbffff5a8, data size = 8, data value = 0xae3e838fd856ea2f, PC=RX@0x40030c0c[libnet_crypto.so]0x30c0c, LR=RX@0x40030b68[libnet_crypto.so]0x30b68
[12:56:55 035] Memory WRITE at 0xbffff5b0, data size = 8, data value = 0x81a0a257f98afdb5, PC=RX@0x40030c0c[libnet_crypto.so]0x30c0c, LR=RX@0x40030b68[libnet_crypto.so]0x30b68
[12:56:55 038] Memory WRITE at 0xbffff5a8, data size = 8, data value = 0x0000000000000000, PC=RX@0x400194fc[libnet_crypto.so]0x194fc, LR=RX@0x40018ad8[libnet_crypto.so]0x18ad8
[12:56:55 038] Memory WRITE at 0xbffff5b0, data size = 8, data value = 0x00000000383e5149, PC=RX@0x40019500[libnet_crypto.so]0x19500, LR=RX@0x40018ad8[libnet_crypto.so]0x18ad8
[12:56:55 038] Memory WRITE at 0xbffff5b8, data size = 8, data value = 0x0000000000000000, PC=RX@0x40019500[libnet_crypto.so]0x19500, LR=RX@0x40018ad8[libnet_crypto.so]0x18ad8
[12:56:55 038] Memory WRITE at 0xbffff5c0, data size = 8, data value = 0x000000004041e190, PC=RX@0x40019504[libnet_crypto.so]0x19504, LR=RX@0x40018ad8[libnet_crypto.so]0x18ad8
```

PC和LR指向同一函数，下个断点看看，日志：

```yaml
mx1

>-----------------------------------------------------------------------------<
[13:17:34 567]x1=unidbg@0xbffff520, md5=d7c8f8218c4dabbf9abe28c8a39927d7, hex=0123556789abcdedfedeba987654321630000000000000003132333435360000d0f5ffbf0000000074e101400000000000f6ffbf00000000070000000000000086e141400000000107000000000000001000000000000001000000000000000038f6ffbf000000000000000000000000
size: 112
0000: 01 23 55 67 89 AB CD ED FE DE BA 98 76 54 32 16    .#Ug........vT2.
0010: 30 00 00 00 00 00 00 00 31 32 33 34 35 36 00 00    0.......123456..
0020: D0 F5 FF BF 00 00 00 00 74 E1 01 40 00 00 00 00    ........t..@....
0030: 00 F6 FF BF 00 00 00 00 07 00 00 00 00 00 00 00    ................
0040: 86 E1 41 40 00 00 00 01 07 00 00 00 00 00 00 00    ..A@............
0050: 10 00 00 00 00 00 00 01 00 00 00 00 00 00 00 00    ................
0060: 38 F6 FF BF 00 00 00 00 00 00 00 00 00 00 00 00    8...............
^-----------------------------------------------------------------------------^

```

第一行其实是四个iv(后续会解释)，第二行是明文，blr下个断点，c继续执行，查看X0

```yaml
m0xbffff5a8

>-----------------------------------------------------------------------------<
[13:18:51 555]unidbg@0xbffff5a8, md5=5d5d1b1e60f18c4e645a0bfcc67a25bf, hex=2fea56d88f833eaeb5fd8af957a2a081000000000000000090e14140000000004016feff00000000f0f6ffbf00000000c48a01400000000020f6ffbf00000000ccd103400000000090e141400000000096e1414000000000a0e141400000000040c10940000000000000000000000000
size: 112
0000: 2F EA 56 D8 8F 83 3E AE B5 FD 8A F9 57 A2 A0 81    /.V...>.....W...
0010: 00 00 00 00 00 00 00 00 90 E1 41 40 00 00 00 00    ..........A@....
0020: 40 16 FE FF 00 00 00 00 F0 F6 FF BF 00 00 00 00    @...............
0030: C4 8A 01 40 00 00 00 00 20 F6 FF BF 00 00 00 00    ...@.... .......
0040: CC D1 03 40 00 00 00 00 90 E1 41 40 00 00 00 00    ...@......A@....
0050: 96 E1 41 40 00 00 00 00 A0 E1 41 40 00 00 00 00    ..A@......A@....
0060: 40 C1 09 40 00 00 00 00 00 00 00 00 00 00 00 00    @..@............
^-----------------------------------------------------------------------------^
```

第一行就是密文了，看来加密就是在这个函数里进行的了，静态分析一下吧

```cpp
void *__fastcall sub_30850(_OWORD *a1, char *a2)
{
  __int64 v2; // x8
  int v3; // w23
  char *v4; // x10
  int n16; // w8
  int v6; // w9
  unsigned __int8 *v7; // x10
  int v8; // w11
  int n1216331821; // w11
  int n14; // w10
  int v11; // w8
  unsigned __int8 *v12; // x14
  int v13; // w15
  int v14; // w17
  int v15; // w10
  int n1216331821_1; // w15
  unsigned __int8 *v17; // x8
  int n4; // w9
  int v19; // w10
  char *v23; // [xsp+10h] [xbp-80h]
  _DWORD *v24; // [xsp+18h] [xbp-78h]
  char *v25; // [xsp+20h] [xbp-70h]
  _QWORD *v26; // [xsp+28h] [xbp-68h]
  void *v27; // [xsp+30h] [xbp-60h]
  unsigned int n8; // [xsp+3Ch] [xbp-54h]

  v23 = a2 + 16;
  v24 = a2 + 16;
  v25 = a2 + 24;
  v2 = ((*((_DWORD *)a2 + 4) >> 3) ^ 0x1FFFFFC0u) & (*((_DWORD *)a2 + 4) >> 3);
  v26 = a2 + 24;
  v3 = -931151827;
  v4 = &a2[v2 + 24];
  v27 = v4 + 1;
  *v4 = 0x80;
  n8 = v2 ^ 0x3F;
  if ( n8 >= 8 )
  {
    memset(v27, 0, n8 - 8);
  }
  else
  {
    memset(v27, 0, n8);
    n16 = 16;
    v6 = -15;
    v7 = (unsigned __int8 *)v26 + 1;
    v8 = -931151827;
    while ( 1 )
    {
      n1216331821 = v8 & 0x7FFFFFFF;
      if ( n1216331821 != 1216331821 )
        break;
      --n16;
      if ( v6 )
        v8 = -931151827;
      else
        v8 = -1953395755;
      *(_DWORD *)(v7 - 1) = (*(v7 - 1) | (*v7 << 8)) ^ 0x3CB3DB4F ^ ((v7[1] | (v7[2] << 8)) << 16) ^ 0x3CB3DB4F;
      v7 += 4;
      ++v6;
    }
    if ( n1216331821 != 194087893 )
    {
      while ( 1 )
        ;
    }
    sub_2E08C(a2, v26);
    v26[5] = 0;
    v26[6] = 0;
    v26[3] = 0;
    v26[4] = 0;
    v26[1] = 0;
    v26[2] = 0;
    *v26 = 0;
  }
  n14 = 14;
  v11 = -13;
  v12 = (unsigned __int8 *)v26 + 1;
  v13 = -931151827;
  while ( 1 )
  {
    n1216331821_1 = v13 & 0x7FFFFFFF;
    if ( n1216331821_1 != 1216331821 )
      break;
    v15 = n14 + 1683802602;
    if ( v11 )
      v13 = -931151827;
    else
      v13 = -1953395755;
    n14 = v15 - 1683802603;
    v14 = (v12[1] | (v12[2] << 8)) << 16;
    *(_DWORD *)(v12 - 1) = (*v12 << 8) ^ 0xD8724FCC ^ *(v12 - 1) ^ 0xD8724FCC ^ 0x11287F8 ^ v14 ^ 0x11287F8
                         | ~((*v12 << 8) ^ 0xD8724FCC ^ ~(*(v12 - 1) ^ 0xD8724FCC) | ~v14);
    v12 += 4;
    ++v11;
  }
  if ( n1216331821_1 != 194087893 )
  {
    while ( 1 )
      ;
  }
  *((_DWORD *)v25 + 14) = *v24;
  *((_DWORD *)v25 + 15) = *((_DWORD *)v23 + 1);
  sub_2E08C(a2, v26);
  v17 = (unsigned __int8 *)(a2 + 1);
  n4 = 4;
  v19 = -3;
  while ( (v3 & 0x7FFFFFFF) == 0x487FC02D )
  {
    --n4;
    if ( v19 )
      v3 = -931151827;
    else
      v3 = -1953395755;
    *(_DWORD *)(v17 - 1) = (unsigned __int16)(*(v17 - 1) | (*v17 << 8))
                         | (((unsigned __int16)(v17[2] << 8) ^ 0x9DB8 ^ v17[1] ^ 0x9DB8) << 16);
    v17 += 4;
    ++v19;
  }
  if ( (v3 & 0x7FFFFFFF) != 0xB918BD5 )
  {
    while ( 1 )
      ;
  }
  *a1 = *(_OWORD *)a2;
  return memset(a2, 0, 0x58u);
}
```

主要盯着a2看就行了，其中sub_2E08C(a2, v26);函数调用了两次，点进去看可以发现是个运算函数，有六七百行，就不贴了，下个断点看看。日志：

```yaml
mx0

>-----------------------------------------------------------------------------<
[13:23:01 005]x0=unidbg@0xbffff520, md5=bcc59f26ae8410ea5c781da852f0e9f6, hex=0123556789abcdedfedeba9876543216300000000000000031323334353680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000038f6ffbf000000000000000000000000
size: 112
0000: 01 23 55 67 89 AB CD ED FE DE BA 98 76 54 32 16    .#Ug........vT2.
0010: 30 00 00 00 00 00 00 00 31 32 33 34 35 36 80 00    0.......123456..
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 30 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    0...............
0060: 38 F6 FF BF 00 00 00 00 00 00 00 00 00 00 00 00    8...............
^-----------------------------------------------------------------------------^
mx1

>-----------------------------------------------------------------------------<
[13:23:03 393]x1=unidbg@0xbffff538, md5=582ff5d679cd51d5a67525e36e29daf4, hex=31323334353680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000038f6ffbf000000000000000000000000d0f5ffbf00000000c41103400000000001a23ebf00000000
size: 112
0000: 31 32 33 34 35 36 80 00 00 00 00 00 00 00 00 00    123456..........
0010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 30 00 00 00 00 00 00 00    ........0.......
0040: 00 00 00 00 00 00 00 00 38 F6 FF BF 00 00 00 00    ........8.......
0050: 00 00 00 00 00 00 00 00 D0 F5 FF BF 00 00 00 00    ................
0060: C4 11 03 40 00 00 00 00 01 A2 3E BF 00 00 00 00    ...@......>.....
^-----------------------------------------------------------------------------^

```

参数1是四个iv，参数二是明文。为什么参数一是iv？因为之前分析过老版本。。。没分析过的话，那就是因为输出32位，所以合理怀疑是MD5，看一下代码，有这么一段：

```
  v319 = *a1;
  v315 = a1[3];
  v316 = a1[1];
  v317 = a1[2];
.................
    v24 = v319
      - 680876936
      + *a2
      + (v315 & (v315 ^ 0x1FE328B9 ^ ~(v317 ^ 0x1FE328B9) | ~v316)
       | ~(v315 ^ 0x1FE328B9 ^ ~(v317 ^ 0x1FE328B9) | ~v316) & ~v315);
  v25 = ((v24 << 7) ^ 0x87CDF640 ^ (v24 >> 25) ^ 0x87CDF640) + v316;
  v26 = v16 - 176418897 + v25;
  v27 = (v317 & (~v25 | ~(v317 ^ 0x1C9A5715 ^ v316 ^ 0x1C9A5715))
       | ~(~v25 | ~(v317 ^ 0x1C9A5715 ^ v316 ^ 0x1C9A5715)) & ~v317)
      - (-v8
       - (v315
        - 389564586));
..................
```

像是在给iv赋值并参与计算。怀疑的成本很低，大不了验证一下，验证之后输出的结果却是是一模一样的

## 魔改IV

四个iv：

```
state[0] = 0x67552301L;
state[1] = 0xEDCDAB89L;
state[2] = 0x98BADEFEL;
state[3] = 0x16325476L;
```

至此分析结束，就是魔改了tohex的码表和md5的iv，别的也没啥

因为是边分析边写的，有的地方比较乱，不过应该还是能看懂的。比较简单的一个参数

贴下代码吧：

```java
package com.yuuki.zuiyou;

import com.github.unidbg.AndroidEmulator;
import com.github.unidbg.Emulator;
import com.github.unidbg.Module;
import com.github.unidbg.arm.backend.Unicorn2Factory;
import com.github.unidbg.arm.context.RegisterContext;
import com.github.unidbg.debugger.BreakPointCallback;
import com.github.unidbg.debugger.Debugger;
import com.github.unidbg.hook.hookzz.*;
import com.github.unidbg.linux.android.AndroidEmulatorBuilder;
import com.github.unidbg.linux.android.AndroidResolver;
import com.github.unidbg.linux.android.dvm.*;
import com.github.unidbg.memory.Memory;
import com.github.unidbg.pointer.UnidbgPointer;
import com.github.unidbg.utils.Inspector;
import com.github.unidbg.virtualmodule.android.AndroidModule;
import org.apache.log4j.Level;
import org.apache.log4j.Logger;

import java.io.File;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

public class zuiyou extends AbstractJni {
    private final String packageName = "cn.xiaochuankeji.tieba";
    private final String apkName = "zuiyou";
    private final String libName = "libnet_crypto.so";

    private final AndroidEmulator emulator;
    private final VM vm;
    private DalvikModule dm;
    private Module module;

    DvmClass NetCrypto;

    public zuiyou() {
        emulator = AndroidEmulatorBuilder
                .for64Bit()
                .addBackendFactory(new Unicorn2Factory(true))
                .setProcessName(packageName)
                .build();
        Memory memory = emulator.getMemory();
        memory.setLibraryResolver(new AndroidResolver(23));
        vm = emulator.createDalvikVM(new File("apks/" + apkName +  "/" + apkName + ".apk"));
        //vm.setVerbose(true);
        new AndroidModule(emulator, vm).register(memory);
        //new JniGraphics(emulator, vm).register(memory);
        vm.setJni(this);
        dm = vm.loadLibrary(new File("apks/" + apkName +  "/" + libName), false);
        module = dm.getModule();

        //emulator.traceWrite(0x4041e2f0, 0x4041E312);

        dm.callJNI_OnLoad(emulator);

        NetCrypto = vm.resolveClass("com/izuiyou/network/NetCrypto");
    }

    public void hookMemcpy() {
        Debugger debugger = emulator.attach();
        debugger.addBreakPoint(module.findSymbolByName("memcpy").getAddress(), (emulator, address) -> {
            RegisterContext context = emulator.getContext();
            UnidbgPointer arg0 = context.getPointerArg(0);
            UnidbgPointer arg1 = context.getPointerArg(1);
            int arg2 = context.getIntArg(2);
            Inspector.inspect(
                    arg1.getByteArray(0, arg2),
                    "memcpy" + " 写入地址 " + "0x" + Long.toHexString(arg0.peer) + " 读取地址 " + "0x" + Long.toHexString(arg1.peer)
            );
            return true;
        });
    }

    public void hookMemmove() {
        Debugger debugger = emulator.attach();
        debugger.addBreakPoint(module.findSymbolByName("memmove").getAddress(), (emulator, address) -> {
            RegisterContext context = emulator.getContext();

            UnidbgPointer dst = context.getPointerArg(0);
            UnidbgPointer src = context.getPointerArg(1);
            int length = context.getIntArg(2);

            Inspector.inspect(
                    src.getByteArray(0, length),
                    "memmove 写入地址 0x" + Long.toHexString(dst.peer) +
                            " 读取地址 0x" + Long.toHexString(src.peer)
            );

            return true;
        });
    }


    public void traceCode() {
        try {
            String traceFile = "apks/" + apkName + "/traceCode.log";
            PrintStream traceStream = new PrintStream(Files.newOutputStream(Paths.get(traceFile)), true);
            emulator.traceCode().setRedirect(traceStream);
        } catch (java.io.IOException e) {
            System.out.println(e.getMessage());
        }
    }

    public void traceWrite() {
        try {
            String traceFile = "apks/" + apkName + "/traceWrite.log";
            PrintStream traceStream = new PrintStream(Files.newOutputStream(Paths.get(traceFile)), true);
            emulator.traceWrite().setRedirect(traceStream);
        } catch (java.io.IOException e) {
            System.out.println(e.getMessage());
        }
    }

    public void traceRead() {
        try {
            String traceFile = "apks/" + apkName + "/traceRead.log";
            PrintStream traceStream = new PrintStream(Files.newOutputStream(Paths.get(traceFile)), true);
            emulator.traceRead().setRedirect(traceStream);
        } catch (java.io.IOException e) {
            System.out.println(e.getMessage());
        }
    }

    public void nativeInit() {
        NetCrypto.callStaticJniMethod(emulator, "native_init()V");
    }

    public String callSign() {
        hookMemcpy();
        hookMemmove();
        //emulator.traceWrite(0x4041e2f0, 0x4041E312);
        emulator.traceWrite(0x4041e2c0, 0x4041e2e2);
        emulator.attach().addBreakPoint(module.base + 0x30C94);
        String arg1 = null;
        byte[] arg2 = "123456".getBytes(StandardCharsets.UTF_8);
        StringObject ret = NetCrypto.callStaticJniMethodObject(emulator, "sign(Ljava/lang/String;[B)Ljava/lang/String;", arg1, arg2);
        return ret.getValue();
        // 拼接函数 sub_1973C x0 明文 x1密文
        // xref -> sun_194F0

        /*
        0000: 37 63 62 32 66 38 61 30 30 63 30 64 64 62 32 62    7cb2f8a00c0ddb2b
        0010: 33 66 63 61 30 32 63 31 66 39 32 37 32 35 30 36    3fca02c1f9272506
        */
    }

    public static void main(String[] args) {
        //Logger.getLogger(DalvikVM64.class).setLevel(Level.DEBUG);  // 0x4041e2f0
        zuiyou zuiyou = new zuiyou();
        zuiyou.nativeInit();
        String res = zuiyou.callSign();
        System.out.println(res);
    }
}
```

还原之后的算法:

```java
package com.yuuki.YuukiUtils;

import java.lang.reflect.*;

public class MD5 {
    static final int S11 = 7;
    static final int S12 = 12;
    static final int S13 = 17;
    static final int S14 = 22;

    static final int S21 = 5;
    static final int S22 = 9;
    static final int S23 = 14;
    static final int S24 = 20;

    static final int S31 = 4;
    static final int S32 = 11;
    static final int S33 = 16;
    static final int S34 = 23;

    static final int S41 = 6;
    static final int S42 = 10;
    static final int S43 = 15;
    static final int S44 = 21;

    static final byte[] PADDING = {
            (byte)(0x80), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    };
    private final long[] state = new long[4]; // state (ABCD)
    private final long[] count = new long[2]; // number of bits, modulo 2^64 (lsb first)
    private final byte[] buffer = new byte[64]; // input buffer
    public String digestHexStr;

    private final byte[] digest = new byte[16];

    public String getMD5ofStr(String inbuf) {
        md5Init();
        md5Update(inbuf.getBytes(), inbuf.length());
        md5Final();
        digestHexStr = "";
        for (int i = 0; i < 16; i++) {
            digestHexStr += byteHEX(digest[i]);
        }
        return digestHexStr;

    }

    public MD5() {
        md5Init();

        return;
    }

    private void md5Init() {
        count[0] = 0L;
        count[1] = 0L;
        ///* Load magic initialization constants.

        state[0] = 0x67552301L;
        state[1] = 0xEDCDAB89L;
        state[2] = 0x98BADEFEL;
        state[3] = 0x16325476L;

        return;
    }


    private long F(long x, long y, long z) {
        return (x & y) | ((~x) & z);

    }

    private long G(long x, long y, long z) {
        return (x & z) | (y & (~z));

    }

    private long H(long x, long y, long z) {
        return x ^ y ^ z;
    }

    private long I(long x, long y, long z) {
        return y ^ (x | (~z));
    }


    private long FF(long a, long b, long c, long d, long x, long s, long ac) {
        a += F(b, c, d) + x + ac;
        a = ((long) (int) a << s) | ((int) a >>> (32 - s));
        a += b;
        return a;
    }

    private long GG(long a, long b, long c, long d, long x, long s, long ac) {
        a += G(b, c, d) + x + ac;
        a = ((long) (int) a << s) | ((int) a >>> (32 - s));
        a += b;
        return a;
    }

    private long HH(long a, long b, long c, long d, long x, long s, long ac) {
        a += H(b, c, d) + x + ac;
        a = ((long) (int) a << s) | ((int) a >>> (32 - s));
        a += b;
        return a;
    }

    private long II(long a, long b, long c, long d, long x, long s, long ac) {
        a += I(b, c, d) + x + ac;
        a = ((long) (int) a << s) | ((int) a >>> (32 - s));
        a += b;
        return a;
    }

    private void md5Update(byte[] inbuf, int inputLen) {

        int i, index, partLen;
        //byte[] block = new byte[64];
        index = (int) (count[0] >>> 3) & 0x3F;
        // /* Update number of bits */
        if ((count[0] += ((long) inputLen << 3)) < ((long) inputLen << 3))
            count[1]++;
        count[1] += (inputLen >>> 29);

        partLen = 64 - index;

        // Transform as many times as possible.
        if (inputLen >= partLen) {
            md5Memcpy(buffer, inbuf, index, 0, partLen);
            md5Transform(buffer);

            for (i = partLen; i + 63 < inputLen; i += 64) {

                //md5Memcpy(block, inbuf, 0, i, 64);
                //md5Transform(block);
                md5Memcpy(buffer, inbuf, 0, i, 64);
                md5Transform(buffer);
            }
            index = 0;

        } else

            i = 0;

        ///* Buffer remaining input */
        md5Memcpy(buffer, inbuf, index, i, inputLen - i);

    }

    private void md5Final() {
        byte[] bits = new byte[8];
        int index, padLen;

        ///* Save number of bits */
        Encode(bits, count, 8);

        ///* Pad out to 56 mod 64.
        index = (int) (count[0] >>> 3) & 0x3f;
        padLen = (index < 56) ? (56 - index) : (120 - index);
        md5Update(PADDING, padLen);

        ///* Append length (before padding) */
        md5Update(bits, 8);

        ///* Store state in digest */
        Encode(digest, state, 16);

    }

    private void md5Memcpy(byte[] output, byte[] input, int outpos, int inpos, int len) {
        int i;

        for (i = 0; i < len; i++)
            output[outpos + i] = input[inpos + i];
    }

    private void md5Transform(byte[] block) {
        long a = state[0], b = state[1], c = state[2], d = state[3];
        long[] x = new long[16];

        Decode(x, block, 64);

        /* Round 1 */
        a = FF(a, b, c, d, x[0], S11, 0xd76aa478L); /* 1 */
        d = FF(d, a, b, c, x[1], S12, 0xe8c7b756L); /* 2 */
        c = FF(c, d, a, b, x[2], S13, 0x242070dbL); /* 3 */
        b = FF(b, c, d, a, x[3], S14, 0xc1bdceeeL); /* 4 */
        a = FF(a, b, c, d, x[4], S11, 0xf57c0fafL); /* 5 */
        d = FF(d, a, b, c, x[5], S12, 0x4787c62aL); /* 6 */
        c = FF(c, d, a, b, x[6], S13, 0xa8304613L); /* 7 */
        b = FF(b, c, d, a, x[7], S14, 0xfd469501L); /* 8 */
        a = FF(a, b, c, d, x[8], S11, 0x698098d8L); /* 9 */
        d = FF(d, a, b, c, x[9], S12, 0x8b44f7afL); /* 10 */
        c = FF(c, d, a, b, x[10], S13, 0xffff5bb1L); /* 11 */
        b = FF(b, c, d, a, x[11], S14, 0x895cd7beL); /* 12 */
        a = FF(a, b, c, d, x[12], S11, 0x6b901122L); /* 13 */
        d = FF(d, a, b, c, x[13], S12, 0xfd987193L); /* 14 */
        c = FF(c, d, a, b, x[14], S13, 0xa679438eL); /* 15 */
        b = FF(b, c, d, a, x[15], S14, 0x49b40821L); /* 16 */

        /* Round 2 */
        a = GG(a, b, c, d, x[1], S21, 0xf61e2562L); /* 17 */
        d = GG(d, a, b, c, x[6], S22, 0xc040b340L); /* 18 */
        c = GG(c, d, a, b, x[11], S23, 0x265e5a51L); /* 19 */
        b = GG(b, c, d, a, x[0], S24, 0xe9b6c7aaL); /* 20 */
        a = GG(a, b, c, d, x[5], S21, 0xd62f105dL); /* 21 */
        d = GG(d, a, b, c, x[10], S22, 0x2441453L); /* 22 */
        c = GG(c, d, a, b, x[15], S23, 0xd8a1e681L); /* 23 */
        b = GG(b, c, d, a, x[4], S24, 0xe7d3fbc8L); /* 24 */
        a = GG(a, b, c, d, x[9], S21, 0x21e1cde6L); /* 25 */
        d = GG(d, a, b, c, x[14], S22, 0xc33707d6L); /* 26 */
        c = GG(c, d, a, b, x[3], S23, 0xf4d50d87L); /* 27 */
        b = GG(b, c, d, a, x[8], S24, 0x455a14edL); /* 28 */
        a = GG(a, b, c, d, x[13], S21, 0xa9e3e905L); /* 29 */
        d = GG(d, a, b, c, x[2], S22, 0xfcefa3f8L); /* 30 */
        c = GG(c, d, a, b, x[7], S23, 0x676f02d9L); /* 31 */
        b = GG(b, c, d, a, x[12], S24, 0x8d2a4c8aL); /* 32 */

        /* Round 3 */
        a = HH(a, b, c, d, x[5], S31, 0xfffa3942L); /* 33 */
        d = HH(d, a, b, c, x[8], S32, 0x8771f681L); /* 34 */
        c = HH(c, d, a, b, x[11], S33, 0x6d9d6122L); /* 35 */
        b = HH(b, c, d, a, x[14], S34, 0xfde5380cL); /* 36 */
        a = HH(a, b, c, d, x[1], S31, 0xa4beea44L); /* 37 */
        d = HH(d, a, b, c, x[4], S32, 0x4bdecfa9L); /* 38 */
        c = HH(c, d, a, b, x[7], S33, 0xf6bb4b60L); /* 39 */
        b = HH(b, c, d, a, x[10], S34, 0xbebfbc70L); /* 40 */
        a = HH(a, b, c, d, x[13], S31, 0x289b7ec6L); /* 41 */
        d = HH(d, a, b, c, x[0], S32, 0xeaa127faL); /* 42 */
        c = HH(c, d, a, b, x[3], S33, 0xd4ef3085L); /* 43 */
        b = HH(b, c, d, a, x[6], S34, 0x4881d05L); /* 44 */
        a = HH(a, b, c, d, x[9], S31, 0xd9d4d039L); /* 45 */
        d = HH(d, a, b, c, x[12], S32, 0xe6db99e5L); /* 46 */
        c = HH(c, d, a, b, x[15], S33, 0x1fa27cf8L); /* 47 */
        b = HH(b, c, d, a, x[2], S34, 0xc4ac5665L); /* 48 */

        /* Round 4 */
        a = II(a, b, c, d, x[0], S41, 0xf4292244L); /* 49 */
        d = II(d, a, b, c, x[7], S42, 0x432aff97L); /* 50 */
        c = II(c, d, a, b, x[14], S43, 0xab9423a7L); /* 51 */
        b = II(b, c, d, a, x[5], S44, 0xfc93a039L); /* 52 */
        a = II(a, b, c, d, x[12], S41, 0x655b59c3L); /* 53 */
        d = II(d, a, b, c, x[3], S42, 0x8f0ccc92L); /* 54 */
        c = II(c, d, a, b, x[10], S43, 0xffeff47dL); /* 55 */
        b = II(b, c, d, a, x[1], S44, 0x85845dd1L); /* 56 */
        a = II(a, b, c, d, x[8], S41, 0x6fa87e4fL); /* 57 */
        d = II(d, a, b, c, x[15], S42, 0xfe2ce6e0L); /* 58 */
        c = II(c, d, a, b, x[6], S43, 0xa3014314L); /* 59 */
        b = II(b, c, d, a, x[13], S44, 0x4e0811a1L); /* 60 */
        a = II(a, b, c, d, x[4], S41, 0xf7537e82L); /* 61 */
        d = II(d, a, b, c, x[11], S42, 0xbd3af235L); /* 62 */
        c = II(c, d, a, b, x[2], S43, 0x2ad7d2bbL); /* 63 */
        b = II(b, c, d, a, x[9], S44, 0xeb86d391L); /* 64 */

        state[0] += a;
        state[1] += b;
        state[2] += c;
        state[3] += d;

    }

    private void Encode(byte[] output, long[] input, int len) {
        int i, j;

        for (i = 0, j = 0; j < len; i++, j += 4) {
            output[j] = (byte) (input[i] & 0xffL);
            output[j + 1] = (byte) ((input[i] >>> 8) & 0xffL);
            output[j + 2] = (byte) ((input[i] >>> 16) & 0xffL);
            output[j + 3] = (byte) ((input[i] >>> 24) & 0xffL);
        }
    }

    private void Decode(long[] output, byte[] input, int len) {
        int i, j;

        for (i = 0, j = 0; j < len; i++, j += 4)
            output[i] = b2iu(input[j]) | (b2iu(input[j + 1]) << 8) | (b2iu(input[j + 2]) << 16)
                    | (b2iu(input[j + 3]) << 24);

        return;
    }

    public static long b2iu(byte b) {
        return b < 0 ? b & 0x7F + 128 : b;
    }


    public static String byteHEX(byte ib) {
        //char[] Digit = { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' };
        char[] Digit = "567def8901234abc".toCharArray();
        char[] ob = new char[2];
        ob[0] = Digit[(ib >>> 4) & 0X0F];
        ob[1] = Digit[ib & 0X0F];
        String s = new String(ob);
        return s;
    }

    public static void main(String[] args) {

        MD5 m = new MD5();
        System.out.println(m.getMD5ofStr("123456"));
    }

}
```

周末快乐喵~
