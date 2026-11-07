---
title: 【看雪】某安卓FPS外挂逆向:自解压ELF脱壳到内核硬件断点(上)
source: https://bbs.kanxue.com/thread-293457.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-08T04:32:06+08:00
trace_id: 0b398c9c-ac88-43dd-82ab-aa629225649d
content_hash: db13188768f4a46b303c588c231472372f33a442b80aa83d107b93d5d509eca0
status: synced
tags:
  - 看雪
series: 【看雪】某安卓FPS外挂逆向:自解压ELF脱壳到内核硬件断点
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41175244-d011-81b2-89c3-d825d623118b
ioc:
  cves: []
  cwes: []
  hashes:
    - f45e6f08c92c8c9c9249c220ccd922a5c50a4f2ef31650fb1d7b17236e14381b
    - f674f9f4a759779413d80413500075b05f82275b54ba0b5035a45a7090e391eb
  domains: []
  tools: []
  techniques: []
---

## 前言

> **本文分析的是某款Android FPS游戏的外挂,该外挂在/data/local/tmp/ 下独立运行,采用了 `自解压ELF壳`,并配合 `内核驱动挂载硬件断点篡改寄存器`,从而实现了FPS游戏常规的底层功能(如无后座 范围)**  
> **由于涉及 `自解压脱壳、驱动通信和硬件断点` 等多个技术环节,文章分为二篇连载:  
> (上)自解压ELF分析于与脱壳(本篇)  
> (下)硬件断点与寄存器修改分析**

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a91ec3a7e9207596.webp)  
路径:/data/local/tmp/文件/exe  
架构:64-bit ARM64  
类型:ELF shared object  
编译:NDK r30(壳子r30脱壳发现本体r17)  
符号:stripped

## 分析文件整体

-   先运行文件 （ `pid=15526` ）

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2b0a9b2279f9bd35.webp)

-   然后打开 proc/15526/maps

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/463c0ee7f41e00e3.webp)

-   可以看到地址 `617c680000` 就是我们要dump的起始地址,可以看到 `617c6cf000` 就是我们要的尾部地址,那个 `780009500` 看权限和地址明显不是我们要的

```python
/memdumper64 -i 15526 -n dump文件 -l -r -m -s 617c680000 -e 617c6cf000 -o ./
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/03a14c4f1d061dda.webp)

有字符串了  
  
把这个dump的文件放到ida反编译看看  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ab7f19e6f998e65f.webp)
  
可以看到字符串都有调用 如果只是分析目标 `驱动通信和硬件断点` 就可以直接分析了 不过我为了学习还是去看看这个是什么壳

### 分析壳脱壳

把样本用ida反编译 找到入口  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/98b3e963eec33b0a.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a8bafff00da61b9.webp)
  
  
壳子没有混淆,明显自解压壳子 拿到自解压ELF第一反应都是改过linker,它竟然没有魔改

**证据一：`.interp` 原文** （文件 `0x2E0` ）：

```python
/system/bin/linker64
```

标准 NDK 产物 真正的linker壳会把它换成自己的 `ld-xxx.so` ，或者删掉 `.interp` 自己 mmap 但是这里什么都没做  
**证据二： `_start` 是 bionic 的标准骨架** （ `0xB1CC` ）：

```powershell
0xB1CC  bti     j
0xB1D8  mov     x0, sp              ; raw_args
0xB1F0  adrp    x8, #0x20000
0xB1FC  ldr     x8, [x8, #0xb20]    ; __init_array_start
0xB200  ldr     x9, [x9, #0xb28]    ; __init_array_end
0xB21C  adr     x8, #0x24d88        ; structors
0xB220  str     x8, [sp, #0x10]
0xB230  ldr     x2, [x2, #0xb30]    ; x2 = 0xB28C
0xB234  bl      #0x1C290           ; __libc_init(raw_args, 0, 0xB28C, structors)
```

壳只改了一个地方—— `__libc_init` 的第三个参数

**证据三：那两个 GOT 槽不是 `R_AARCH64_RELATIVE`** 这是我一开始判错的地方  
`0x20B30 = 0xB28C` 、 `0x20B38 = 0x43F0` ，看着像经典的 `RELATIVE` 重定位 但外壳的 `.rela.dyn` 只有 **3 条**

```python
0x207C0  type=0x101 (ABS64)      memset
0x20B40  type=0x401 (GLOB_DAT)   environ
0x20B70  type=0x401 (GLOB_DAT)   __sF
```

真正给这两个槽打值的是 **`DT_RELR`**——`.relr.dyn` 在 `0xDA8` ，48 字节，展开后覆盖 91 个地址， `0x20B30` 和 `0x20B38` 都在里面

`RELR` 是 021年后才铺开的压缩相对重定位：一串 `uint64` 偶数项是绝对地址,奇数项是 63 位的位图，描述"从上一个地址往后每 8 字节一个" bionic从API 30开始支持 **用它说明这份壳是用比较新的NDK链的**  
**结论**：没有魔改 linker 也没有劫持 `.dynamic` 没有伪造 `DT_INIT` 壳就是一段普通用户态代码

### 1.1 壳入口在干什么

`0xB28C` 开栈 `0x11A80` 然后第一件事不是解密 是 **检查环境**：

```
0xB28C  stp     x29, x30, [sp, #-0x60]!
0xB2A8  sub     sp, sp, #0x11, lsl #12
0xB2AC  sub     sp, sp, #0xa80
0xB2C0  bl      #0xDA48              ; 环境白名单，返回 bool
0xB2C4  tbz     w0, #0, #0xB3E4      ; 不合格直接跳去报错
```

过了就先把整个配置区搬到栈上再验：

```dockerfile
0xB2D4  add     x0, x0, #0x598
0xB2DC  mov     w2, #0x4d0            ; 栈上留 0x4D0
0xB2EC  bl      #0x1C2A0             ; memset
0xB2F8  ldr     x8, [x8, #0xb38]      ; x8 = .shell_config (0x43F0)
0xB2FC  ldrb    w10, [x8, x9]         ; 逐字节搬 0x490 次
0xB300  strb    w10, [x27, x9]
0xB30C  b.ne    #0xB2FC
```

**为什么先搬到栈上？** 因为后面所有校验都对着栈上那份副本做,不信任可写段,先做快照,再校验快照 改 `.shell_config` 这种静态补丁 在它眼里是同一个进程内存里的两个副本不一致

然后是 magic 这里没有 `memcmp` ：

```
0xB310  mov     x9, #0xa3e5
0xB31C  movk    x9, #0xe5b3, lsl #16
0xB320  movk    x9, #0x90ad, lsl #32   ; x9 = 0x90ADE5B3A3E5
0xB314  ldr     x8, [x28, #0x1050]     ; config[0x00..0x08]
0xB324  eor     x8, x8, x9
0xB328  orr     x8, x8, x10            ; 并上 config[0x08..0x0C]
0xB32C  cbnz    x8, #0xB4F0            ; 非零 = 失败
```

`0x90ADE5B3A3E5` 就是 `壳子` 六个字节 + 两个字节的 pad，拼成一个 48 位立即数。 **一次 8 字节比较 同时验了 magic 和 pad**。 `0x08..0x0C` 那 4 个保留字节必须为0

接着验版本号 `0xB334` 处 `cmp w8, #0x4302` —— `0x43` 是 `'C'` 2 是主版本  
再往下一段是这篇文章之前没写到的部分：

```dockerfile
0xB344  ldr     w20, [x28, #0x10d0]    ; config[0x80] = ext_len
0xB348  cmp     w20, #0x400
0xB34C  b.hi    #0xB4F0                ; ext_len > 0x400 → 失败
0xB350  ...                            ; config[0x84..0x90] 必须全零
0xB3BC  add     x21, x8, #0x90         ; 扩展区从 config[0x90] 开始
0xB3C8  sub     w9, w8, w20            ; 待检查长度 = 0x400 - ext_len
0xB3D4  ...                            ; OR 归约，要求全零
0xB4E8  tst     w12, #0xff
0xB4EC  b.eq    #0xB548                ; 通过
```

所以 `.shell_config` 的真实结构是：

```python
[0x000 .. 0x090)   固定头
[0x090 .. 0x090+ext_len)   扩展区，0x80 处的 ext_len 指定长度，上限 0x400
[0x090+ext_len .. 0x490)   必须全零
```

当前样本 `ext_len = 0` **这是一个为后续版本预留的扩展位**：壳的格式已经设计成加字段不用改解析器，只要新版本把 `ext_len` 抬起来就行了，反过来说，看到 `ext_len != 0` 就说明你手上是另一个版本  
`0x4D0 - 0x490 = 0x40` ，栈上多留的 0x40 是给运行时状态用的

## 2\. 文件布局

先看段表和节表 **这一节的数据全部来自 `readelf` 解析**，因为后面所有偏移都从这里推

12 个phdr 其中只有 **4 个 LOAD**：

```python
#  类型            权限  文件偏移    VA          filesz    memsz
 2  LOAD            R     0x000000   0x000000    0x071CC   0x071CC
 3  LOAD            RX    0x0071CC   0x00B1CC    0x11484   0x11484
 4  LOAD            RW    0x018680   0x020680    0x00708   0x00980
 5  LOAD            RW    0x018D88   0x024D88    0x00070   0x02B58
```

配四个 `p_align = 0x4000` 的LOAD，VA与文件偏移的换算就变成四段：

```python
VA < 0x71CC          off = VA
0x71CC .. 0x18680    off = VA - 0x4000
0x18680 .. 0x18D88   off = VA - 0x8000
>= 0x24D88           off = VA - 0xC000
```

（第二段的上界其实是 `0x1C650` ，第三段上界是 `0x24D88` ）  
29 个节：

```python
.interp             0x0002E0  0x015
.note.android.ident 0x0002F8  0x098
.note.gnu.build-id  0x000390  0x024
.dynsym             0x0003B8  0x5E8   63 项
.gnu.version*       0x0009A0  0x0DE
.dynstr             0x000A9C  0x2BE
.rela.dyn           0x000D60  0x048   3 条
.relr.dyn           0x000DA8  0x030   48 字节 → 91 个地址
.rela.plt           0x000DD8  0x5A0   60 条
.gcc_except_table   0x001378  0x5C0
.rodata             0x001940  0x2AAC  ← 字符串、CRC 表、LD 白名单、KDF label
.shell_config       0x0043F0  0x490   ← 配置区
.eh_frame_hdr       0x004880  0x5E4
.eh_frame           0x004E68  0x2364
.text               0x0071CC  0x11098  VA 0xB1CC
.plt                0x018270  0x3E0    VA 0x1C270
.data.rel.ro        0x018680  0x2E0    VA 0x20680
.init_array         0x018960  0x010    VA 0x20960 → [0x1807C, 0x18328]
.dynamic            0x018970  0x1B0
.got                0x018B20  0x070
.got.plt            0x018B90  0x1F8
.relro_padding      0x018D88  0x278
.data               0x018D88  0x070    VA 0x24D88
.bss                0x018DF8  0x2AE0   NOBITS
.shstrtab           0x018DF8  0x125
```

真 `.text` 从 `0x71CC` 起 长度是 `0x11098` 够装一个完整的C++运行

\*\*注意 `.text` 只有 `0x11098` 字节，而 `.rodata` 有 `0x2AAC` 。\*\*一个430KB的文件 代码只占68KB剩下的全是数据，这个比例本身就是信号

再看整个文件的宏观排布：

```python
0x000000 .. 0x18F20   外壳本体（ELF 头 + 代码 + 数据 + 节表）
0x18F20 .. 0x19660    29 × 64 = 0x740 的节表，最后一节结束在 0x1965F
0x19660 .. 0x68E08    container（0x4F7A8）
0x68E08 .. 0x68EC8    footer（0xC0）
```

恰好：

-   节表末尾 `0x19660` **正好** 是 container 起点
-   `.shstrtab` 结束在 `0x18F1D` ，到 `0x18F20` 只有3字节填充
-   footer 占 `0xC0` ， `0x68E08 + 0xC0 = 0x68EC8` 正好文件尾

这不是巧合能凑出来的 **说明壳是"最后一步append上去"的** 原始 ELF 编译好，加密后的 payload 追加到文件尾，配置结构塞进原有的可写段，再补 shdr 和 footer 整个过程没有重新链接，所以外壳的段布局看着畸形——但是它必须让原文件的段表继续有效 又要在尾部腾地方

反证如果重链过，`.text` 不会只有68KB却带一整套libunwind和libc++abi的异常处理表

## 3\. 三个结构体

三个结构体共用同一个6字节 magic靠 `rev` 的低8位区分类型 **`rev` 在 `0x0C` ，不是 `0x08`**—— `0x08..0x0C` 是 4 个必须为零的保留字节

### 3.1.shell_config（0x43F0，0x490）

```c
struct ShellConfig {                 // 文件 0x43F0
    char     magic[6];               // "壳子"
    uint16_t pad;                    // 0
    uint32_t reserved0;              // 0x08，必须为 0
    uint32_t rev;                    // 0x0C = 0x00004302  'C'
    uint8_t  pubkey[32];             // 0x10  Ed25519 公钥
    uint8_t  key_a[32];              // 0x30
    uint8_t  key_b[32];              // 0x50
    uint64_t cont_off;               // 0x70 = 0x19660
    uint64_t cont_len;               // 0x78 = 0x4F7A8
    uint32_t ext_len;                // 0x80，当前 0，上限 0x400
    uint32_t reserved1[3];           // 0x84，必须为 0
    uint8_t  ext[0x400];             // 0x90  扩展区，ext_len 有效
    // 0x490 结束，ext_len 之后必须全零
};
```

实测：

```python
pubkey  afe1ec8f 5370d34d 2a57b385 fe50ebb6
        b2b33ebc 6f0ac417 223cd37d 94dae2ef
key_a   3edfccb9 56709adc 410ebf07 1bf6da1a
        01684868 07a9c083 79da74da c62cc6c7
key_b   c8ab354d f129ed48 52d6bb14 4bf6afaa
        5eea6f33 5313cbd3 4c7e2eaa 56cf572c
```

`rev` 的三个取值是配置 高字节是类型 低字节 `0x02` 是格式版本

### 3.2 container 头（0x19660 0xC0）

```c
struct ContainerHeader {
    char     magic[6];
    uint16_t pad;
    uint32_t reserved0;              // 0
    uint32_t rev;                    // 0x0C = 0x4D02
    uint64_t payload_len;            // 0x10 = 0x4F5F8   明文字节数
    uint32_t chunk_size;             // 0x18 = 0x10000
    uint32_t chunk_cnt;              // 0x1C = 5
    uint8_t  manifest[32];           // 0x20  参与 KDF
    uint8_t  payload_sha[32];        // 0x40  明文 SHA-256
    uint8_t  header_sha[32];         // 0x60  文件 [0, 0x19660) 的 SHA-256
    uint8_t  sig[64];                // 0x80  Ed25519(container[0x00:0x80])
};
```

`header_sha` 的定义域是 **从文件开头到 container 起点**，把 ELF 头、`.text` 、`.dynsym` 、`.shell_config` 全覆盖了

签名消息是 `container[0x00:0x80]` ， **不是** `header_sha[0:0x80]` ——这是两个不同的东西

### 3.3 chunk 头（每块 0x30）

```c
struct ChunkHeader {
    uint32_t index;                  // 0..4，必须连续
    uint32_t length;                 // 0x10000，末块 0xF5F8
    uint8_t  iv[12];                 // GCM nonce
    uint8_t  tag[16];                // GCM tag
    uint32_t crc32c;                 // 0x24
    uint64_t crc64;                  // 0x28
};
```

`4+4+12+16+4+8 = 0x30` ，无padding 密文紧跟

实测5块：

```python
i  len      iv                            crc32c
0  0x10000  b1def6bb 994178b2 738f71b0    0xFEEAC3C9
1  0x10000  23059424 d97e32ad 4ac13a4d    0x65574245
2  0x10000  d4054165 e88a9d2b 5c5a2fae    0x0C325872
3  0x10000  d8476b68 1dfa9385 261fbd81    0x7DB3311B
4  0x0F5F8  d1fa5a7d 1a86decf 55d811d5    0x9276E0BC
```

`0xC0 + 4×0x10030 + 0xF628 = 0x4F7A8` 与 `cont_len` 一致

### 3.4 footer（0x68E08，0xC0）

```c
struct Footer {
    char     magic[6];
    uint16_t pad;
    uint32_t reserved0;
    uint32_t rev;                    // 0x0C = 0x4602
    uint64_t cont_off;               // 0x10 = 0x19660
    uint64_t cont_len;               // 0x18 = 0x4F7A8
    uint8_t  header_sha[32];         // 0x20  与 container[0x60] 相同
    uint8_t  container_sha[32];      // 0x40  container 整体 SHA-256
    uint32_t crc32c;                 // 0x60 = 0xBFA5593E
    uint64_t crc64;                  // 0x64 = 0x4389C48B937C2357   ← 注意非 8 字节对齐
    uint8_t  pad2[0x14];             // 0x6C..0x80
    uint8_t  sig[64];                // 0x80  Ed25519(footer[0x00:0x80])
};
```

`crc64` 落在 `0x64` ， **没有对齐** 这不是编译器问题 是 `__attribute__((packed))` 或者手写序列化的结果

footer 是二级摘要，自己签名覆盖自己的头，同时记录 container 的 SHA-256 和两种 CRC

## 4\. 加密原理

### 4.1 密钥链

```python
.shell_config[0x30..0x50]  (A)
                  XOR
      .shell_config[0x50..0x70]  (B)
                  ||
                  \/
master = A ^ B
       = f674f9f4 a7597794 13d80413 500075b0
         5f82275b 54ba0b50 35a45a70 90e391eb

for i in 0 .. chunk_cnt-1:
    K_i = HMAC-SHA256(key = master,
                      msg = "SHELL-ELF-KEY-v1\0"   (17 B, 含结尾 NUL)
                          || header_sha              (32 B)
                          || manifest                (32 B)
                          || LE32(i)                 (4 B))
        = 32 B = AES-256 key
```

`master` 不是随机数，是两段常量异或出来的 **壳作者把"密钥"和"密文"放在同一个文件里 只加了一层异或** 憋不住了

真正需要动脑的是KDF的三个输入 `header_sha` 、 `manifest` 、 `i` 前两个都在文件里， `i` 是块号，所以只要把拼接顺序和 label搞对

label 在 `.rodata` 的 `0x22B7` ：

```python
000022B7  53 48 45 4C 4C 2D 45 4C 46 2D 4B 45 59 2D 76 31 00
          S  H  E  L  L  -  E  L  F  -  K  E  Y  -  v  1  \0
```

17 字节 **这个 NUL 必须算进去**，少一个字节5个块的 key 全错  
`manifest` 是唯一一个我没能反推出来的字段，它不是 `sha256(tags)` 、不是 `sha256(ivs)` 、不是 `sha256(ciphertext)` ，也不是tag的 Merkle 根——这几种我都试过，都对不上 它只做两件事 参与 KDF、被Ed25519覆盖 **不还原它的生成算法 也能脱壳**

### 4.2 每块的 AAD

```c
AAD = container[0x00 .. 0x80]        // 128 B：magic/rev/长度/manifest/两个 SHA
    + chunk_header[0x00 .. 0x14]     // 20 B：index + length + iv
// 合计 148 = 0x94
```

把 `iv` 放进 AAD 是好习惯

AAD 取 `chunk_header[0:0x14]` ，也就是 `index + length + iv` ， **不含 tag 和两个 CRC**，CRC单独校验的

### 4.3 四层校验

| 层   | 算法  | 覆盖范围 | 在哪  |
| --- | --- | --- | --- |
| 1   | Ed25519 | `footer[0:0x80]` | `footer[0x80:0xC0]` |
| 2   | Ed25519 | `container[0:0x80]` | `container[0x80:0xC0]` |
| 3   | SHA-256 | 文件 `[0, 0x19660)` ；container 整体 | 两处互相比对 |
| 4   | CRC32C + CRC64 | `chunk_hdr[0:0x24] + ciphertext` | 每块头尾各一份 |

意图： **Ed25519防伪造，SHA-256 防错位，CRC 防传输损坏**，CRC 在 GCM 之前校验，所以解不开时能立刻区分是"数据坏了"还是"密钥错了"

### 4.4 CRC 表是静态的

壳里没用 `zlib.crc32` ，而是自带两张查表

```c
// CRC32C (Castagnoli, poly 0x1EDC6F41, 反射)
uint32_t crc32c(const uint8_t *p, size_t n, const uint32_t *t) {
    uint32_t s = 0xFFFFFFFF;
    while (n--) s = t[(s ^ *p++) & 0xFF] ^ (s >> 8);
    return ~s;
}

// CRC64 (ECMA-182, poly 0x42F0E1EBA9EA3693, 非反射)
uint64_t crc64(const uint8_t *p, size_t n, const uint64_t *t) {
    uint64_t s = 0;
    while (n--) s = (s << 8) ^ t[((s >> 56) ^ *p++) & 0xFF];
    return s;
}
```

**两张表是静态嵌在 `.rodata` 里的**，不在 `.text` ，也不是运行时生成

```python
0x2970  256 × 4 = 0x400    CRC32C 表
0x2D70  256 × 8 = 0x800    CRC64 表
```

表首验证

```python
0x2970: 00000000 F26B8303 E13B70F7 ...
0x2D70: 00000000 42F0E1EBA9EA3693 85E1C3D753D46D26 ...
```

注意两者初值和处理方式不同：CRC32C初值 `0xFFFFFFFF` 、末尾取反；CRC64初值 `0` 、左移、不取反，Python的 `zlib.crc32` 是 CRC-32/ISO-HDLC，跟这两个都不一样

### 4.5 壳自己带了一套 AES

`aese / aesmc / aesd / aesimc` 在 `.text` 里分别出现 **16 / 13 / 14 / 14 次**，集中在 `0x13960..0x13ADC` ，这是 ARMv8 Crypto 扩展的指令，壳自己实现了一遍 AES

配套的字符串在 `.rodata` ：

```python
0x1952  AES-192-ECB
0x19E1  AES-256-ECB
0x19ED  AES-192-GCM
0x19F9  AES-256-GCM
0x1C90  AES-128-GCM
0x2014  AES-128-ECB
```

也就是 **AES-128/192/256 × ECB/GCM 全档位**，一个只解自己5个 GCM 块的壳，不需要这么多模式，应该是为了适配

`0x1807C` 的构造函数给了一个很具体的：

```dockerfile
0x1807C  paciasp
0x18088  mov     w0, #0x10
0x1808C  bl      #0x1C4B0          ; getauxval(AT_HWCAP = 0x10)
0x18090  tbnz    w0, #8, #0x180AC  ; bit 8 = HWCAP_AES
0x18094  adrp    x9, #0x27000
0x1809C  strb    wzr, [x9, #0x90]  ; 没有 AES 指令 → 置 0
0x180AC  adr     x0, #0x1BEE       ; "ro.arch"
0x180B8  bl      #0x1C5F0          ; __system_property_get("ro.arch", buf)
0x180C4  adrp    x1, #0x1000
0x180C8  add     x1, x1, #0xD90    ; "exynos9810"
0x180D4  bl      #0x1C450          ; strncmp(buf, "exynos9810", 0xA)
0x180D8  cset    w8, ne
0x180E8  strb    w8, [x9, #0x90]
```

逻辑是： **有HWCAP_AES就用硬件指令，但如果SoC是 Exynos 9810 就强制关掉**，这是三星那颗 SoC 的历史坑，它的 AES 指令有errata，AOSP里有一模一样的规避代码，壳作者把这段抄进来了

在 `.text` 里还能看到 `libunwind: %s - %s` 、 `DW_EH_PE_funcrel pointer encoding not supported` 、 `_Unwind_Resume() can't return` 、 `out/llvm-project/libcxxabi/src/private_typeinfo.cpp` **壳静态链了 libunwind + libc++abi** 这就解释了 `.gcc_except_table` 和 `.eh_frame` 为什么占了 `0x2924` ——不是壳自己的 try/catch，是把整个 C++ 异常运行时塞进来了  
一个68KB代码段的壳，里面有完整的 AES 和完整的 C++ 异常处理

## 5\. 运行时行为

### 5.1 导入表

60 个 PLT 项，去掉 libc++abi / libunwind 那堆（ `pthread_*` 、 `malloc` 、 `vsnprintf` 、 `__stack_chk_fail` ） 真正有用的只有这些：

```python
open openat fstat mmap munmap close readlink
memfd_create pwrite pread fchmod fcntl geteuid
syscall execve setenv
dl_iterate_phdr realpath stat
getauxval __system_property_get
```

**没有 `ptrace` ，没有 `process_vm_readv` ，没有 `personality` ，没有 `prctl`** 整个导入表里找不到一个反调试，反调试都没有

作者： **文件是不是我解出来的**、 **执行的是不是那个文件**、 **环境里有没有人塞东西**，你就说是不是吧

### 5.2 用 execveat 而不是 execve

`0xD310` ：

```dockerfile
0xD310  adrp    x2, #0x1000
0xD314  add     x2, x2, #0xc31        ; x2 = ""  (空路径)
0xD318  mov     w0, #0x119            ; __NR_execveat = 281
0xD31C  mov     w1, w21               ; dirfd
0xD320  mov     x3, x20               ; argv
0xD324  mov     x4, x19               ; envp
0xD328  mov     w5, #0x1000           ; AT_EMPTY_PATH
0xD32C  bl      #0x1c410             ; syscall()
```

`execveat(fd, "", argv, envp, AT_EMPTY_PATH)` —— **直接执行一个fd不需要路径** 这是整个壳的技术核心，明文从头到尾没有落过盘，直接从这个fd建 `mmap`

`AT_EMPTY_PATH` 要求调用者对 fd 有执行权限，且 fd 指向普通文件，壳在之前已经把 `fchmod(fd, 0500)` 做掉了

失败回退：

```
0xD33C  cmp     w8, #0x26            ; ENOSYS = 38
0xD340  b.eq    #0xd34c
0xD344  cmp     w8, #0x16            ; EINVAL = 22
0xD348  b.ne    #0xd388
```

`ENOSYS` （内核太老没有 execveat）或 `EINVAL` （不支持 `AT_EMPTY_PATH` ）→ `0xD638` 把fd还原成 `/proc/self/fd/%d` 路径，再 `execve` （ `0xD380` ），这里有个容易绕晕的点： `MFD_CLOEXEC` 在 `execveat` 路径上根本不起作用， `CLOEXEC` 管的是子进程继承fd表，而 `execveat` 是把fd当参数直接递给内核，不走继承，整个壳里 `fcntl` 只出现 `F_ADD_SEALS` / `F_GET_SEALS` / `F_GETFL` 三种，一次 `F_SETFD` 都没有，只有回退到 `execve("/proc/self/fd/%d")` 时才需要fd，而那条路本来就在同一个进程里

### 5.3 memfd 的三层回退

`0xC4EC` 开始：

```
0xC4EC  adr     x0, #0x19d4          ; "gemini-image"
0xC4F0  mov     w1, #0x13            ; CLOEXEC|ALLOW_SEALING|MFD_EXEC
0xC4F4  bl      #0x1c3a0             ; memfd_create
0xC4F8  str     w0, [x19]
0xC4FC  tbnz    w0, #0x1f, #0xc518   ; 失败 → 看 errno
```

`0x13 = MFD_CLOEXEC(1) | MFD_ALLOW_SEALING(2) | MFD_EXEC(0x10)`

`MFD_EXEC` 是 **Linux 6.3** 才加的（配合 `vm.memfd_noexec` 策略），不是 Android 11 的东西

```python
0xC518  bl      #0x1c2e0             ; __errno
0xC524  cmp     w8, #0x16            ; EINVAL
0xC528  b.ne    #0xc544
0xC530  adr     x0, #0x19d4
0xC534  mov     w1, #3              ; 去掉 MFD_EXEC 再来一次
0xC538  bl      #0x1c3a0
```

还是不行（ `ENOSYS` ，内核根本没有 memfd）就退到 `O_TMPFILE` ：

```dockerfile
0xC554  ldr     w20, [x19, #4]       ; 目录 fd
0xC558  adrp    x21, #0x1000
0xC55C  add     x21, x21, #0xc2f     ; "."
0xC560  mov     w2, #0x4082
0xC56C  movk    w2, #0x48, lsl #16   ; 0x484082 =
0xC570  mov     w3, #0x1c0           ; 0700
0xC574  bl      #0x1c3b0             ; openat
```

`0x484082 = O_TMPFILE(0x404000) | O_CLOEXEC(0x80000) | O_EXCL | O_RDWR` \*\*无名临时文件 同样不落盘 \*\*  
`EINTR` 单独处理（ `0xC588 cmp w8,#4 → b.eq 重试` ），其余错误走 `0xC38C` 建错误串  
三层： `memfd+MFD_EXEC` → `memfd` → `O_TMPFILE` ，覆盖 Linux 4.x 到 6.3+ 全线

### 5.4 加封与执行前复核

写出明文后（ `0xC79C __pwrite_chk` ）， `0xC8F8` ：

```
0xC8F0  mov     w0, w21
0xC8F4  mov     w1, #0x140           ; 0500  r-x------
0xC8F8  bl      #0x1c3d0             ; fchmod
```

然后加封（ `0xC9E0` ）：

```python
0xC9E0  mov     w1, #0x409           ; F_ADD_SEALS
0xC9E4  mov     w2, #0xf             ; SEAL|SHRINK|GROW|WRITE
0xC9E8  bl      #0x1c3e0             ; fcntl
0xC9F0  mov     w0, [x19]
0xC9F4  mov     w1, #0x40a           ; F_GET_SEALS
0xC9F8  bl      #0x1c3e0
0xCA00  mov     w8, #0xf
0xCA04  bics    wzr, w8, w0           ; 要求低 4 位全置
0xCA08  b.ne    #0xcaa0
```

`bics wzr, w8, w0` 是个很干净的写法 `w8 & ~w0` ，只要返回值里缺任何一位就非零， **不是"调用成功就行"，是"四位必须都在"**  
加封之后fd不可写、不可缩、不可扩， `F_SEAL_WRITE` 还会让现有的可写映射失  
`0xCF10` 是执行前最后一次 `fstat` 复核 逐字段比：

| 检查  | 位置  | 含义  |
| --- | --- | --- |
| `st_mode & 0xF000 == 0x8000` | `0xCF14` | 普通文件 |
| `st_uid == geteuid()` | `0xCF24` | 属主是自己 |
| `st_nlink == 0` | `0xCF30` | **无目录项** |
| `st_size == payload_len` | `0xCF38` | 长度对得上 |
| `atim` / `mtim` / `ctim` | `0xCF44..0xCF60` | 与写入前一致 |
| `[sp+0x9C]` / `[sp+0xD8..0xF0]` | `0xCF6C..0xCFC0` | 其余时间/尺寸字段 |

`st_nlink == 0` memfd 和 `O_TMPFILE` 都满足，任何真实路径都不满足，注意这条只约束 **壳自己的这次 `execveat`**

### 5.5 环境白名单

`0xDA48` 扫 `environ` 先按首字节快速过滤：

```
0xDAC4  ldrb    w8, [x0]
0xDAC8  cmp     w8, #0x4c           ; 'L'
0xDAD0  ldrb    w8, [x0, #1]
0xDAD4  cmp     w8, #0x44           ; 'D'
0xDADC  ldrb    w8, [x0, #2]
0xDAE0  cmp     w8, #0x5f           ; '_'
```

命中 `LD_` 前缀的，取 `=` 后面的值，然后：

```python
0xDB04  mov     x1, x19             ; "LD_LIBRARY_PATH="
0xDB08  mov     w2, #0x10
0xDB10  bl      #0x1c450            ; strncmp(entry, "LD_LIBRARY_PATH=", 16)
0xDB14  cbnz    w0, #0xdb60         ; 不是它 → 失败
0xDB18  mov     x0, x23             ; value
0xDB1C  mov     x1, x20             ; 硬编码串
0xDB20  bl      #0x1c460            ; strcmp
0xDB24  cbz     w0, #0xdabc         ; 相等 → 继续扫
```

两条规则：

1.  **`LD_` 开头但不是 `LD_LIBRARY_PATH` → 直接失败**， `LD_PRELOAD` 、 `LD_AUDIT` 、 `LD_DEBUG` 全在这里
2.  `LD_LIBRARY_PATH` 允许存在，但值必须 **逐字节等于** 硬编码的那串（ `0x2887` ）：

```python
/system/lib64:/system_ext/lib64:/odm/lib64:/vendor/lib64:/product/lib64:
/apex/com.android.i18n/lib64:/apex/com.android.art/lib64:
/apex/com.android.runtime/lib64/bionic:/apex/com.android.os.statsd/lib64:
/odm/lib64/hw:/vendor/lib64/hw
```

紧接着 `0xDB2C` 是 `dl_iterate_phdr` ，回调在 `0xDBA4` ，先按 `phdr` 范围把主程序自己跳过，再放行 `[vdso]` / `linux-vdso.so.1` / `linux-vdso64.so.1` （三串在 `0x1A2E` / `0x1A35` / `0x1940` ），剩下的每个已加载对象都要过：

-   名字以 `/` 开头， `realpath` 能解开；
-   落在 `/apex/` 、 `/system/` 、 `/system_ext/` 、 `/vendor/` 、 `/odm/` 、 `/product/` **六个** 前缀下；
-   `stat` 是普通文件；
-   属主和权限位干净：

```
0xDDC4  ldr     w9, [sp, #0x18]     ; st_uid
0xDDC8  cbz     w9, #0xddd4         ; uid == 0    → 放行
0xDDCC  cmp     w9, #0x3e8          ; uid == 1000 → 放行
0xDDD4  mov     w9, #0x12
0xDDD8  tst     w8, w9              ; st_mode & (S_IWGRP|S_IWOTH)
0xDDDC  b.eq    #0xde10             ; 必须为 0
```

也就是 `uid ∈ {0, 1000}` 且组/其他不可写，任何一条不满足 → `0xDB60`  
失败路径统一收口：

```
0xDB60  mov     w0, wzr
0xDB64  mov     w8, #1
0xDB6C  adr     x9, #0x24e00
0xDB70  stlrb   w8, [x9]            ; 粘滞位：以后直接返回 0
```

`[0x24E00]` 是 `.bss` 里的粘滞标志， `0xDA6C` 一进来就读它， **第一次失败** 入口拿到 `w0 = 0` 后跳到 `0xB3E4` ，最终 `exit(78)` —— `78` 是 `sysexits.h` 的 `EX_CONFIG` ，对应那句：

```python
0x20E4  "壳子: invalid configuration (78)."
```

## 6\. 脱壳脚本

### 6.1 流程

```python
读 .shell_config  (0x43F0, 0x490)
  ├─ 验 magic "壳子" / rev 0x4302
  ├─ 取 pubkey / key_a / key_b / cont_off / cont_len
  └─ master = key_a ^ key_b

读 container      (cont_off, cont_len)
  ├─ 验 magic / rev 0x4D02
  └─ 取 payload_len / chunk_size / chunk_cnt / manifest / payload_sha / header_sha

读 footer         (文件尾 0xC0)
  ├─ 验 magic / rev 0x4602
  └─ 验 cont_off / cont_len 与 config 一致

校验
  ├─ Ed25519(footer[0:0x80])      ← footer[0x80:0xC0]
  ├─ Ed25519(container[0:0x80])   ← container[0x80:0xC0]
  ├─ sha256(file[0:cont_off]) == header_sha == footer[0x20:0x40]
  ├─ sha256(container)        == footer[0x40:0x60]
  └─ crc32c/crc64(container)  == footer[0x60] / footer[0x64]

解块              (i = 0 .. chunk_cnt-1)
  ├─ K_i = HMAC-SHA256(master, label || header_sha || manifest || LE32(i))
  ├─ crc32c/crc64(hdr[0:0x24] + ciphertext) 先过
  ├─ AES-256-GCM(K_i, iv), AAD = container[0:0x80] + hdr[0:0x14]
  └─ decrypt_and_verify(ciphertext, tag)

收尾
  └─ sha256(明文) == payload_sha → 落盘
```

顺序不能换

### 6.2 全文

```python
import hashlib, hmac, struct, sys
from Crypto.Cipher import AES
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

MAGIC = b"\xe5\xa3\xb3\xe5\xad\x90"
CFG_OFF, CFG_LEN = 0x43F0, 0x490
CRC32C_TAB_OFF, CRC64_TAB_OFF = 0x2970, 0x2D70
KDF_LABEL = b"SHELL-ELF-KEY-v1\x00"


def crc32c(data, tab):
    st = 0xFFFFFFFF
    for b in data:
        st = tab[(st ^ b) & 0xFF] ^ (st >> 8)
    return (~st) & 0xFFFFFFFF


def crc64(data, tab):
    st = 0
    for b in data:
        st = ((st << 8) & 0xFFFFFFFFFFFFFFFF) ^ tab[((st >> 56) ^ b) & 0xFF]
    return st


def main(src, dst):
    d = open(src, "rb").read()
    cfg = d[CFG_OFF:CFG_OFF + CFG_LEN]
    assert cfg[:6] == MAGIC, "bad .shell_config magic"
    assert struct.unpack_from("<I", cfg, 0x0C)[0] == 0x4302, "bad config version"
    c_off, c_len = struct.unpack_from("<QQ", cfg, 0x70)
    c = d[c_off:c_off + c_len]
    f = d[len(d) - 0xC0:]
    assert c[:6] == MAGIC and struct.unpack_from("<I", c, 0x0C)[0] == 0x4D02
    assert f[:6] == MAGIC and struct.unpack_from("<I", f, 0x0C)[0] == 0x4602
    assert struct.unpack_from("<QQ", f, 0x10) == (c_off, c_len), "footer/config offset mismatch"

    pub = Ed25519PublicKey.from_public_bytes(cfg[0x10:0x30])
    for name, sig, msg in (("footer", f[0x80:0xC0], f[0:0x80]),
                           ("container", c[0x80:0xC0], c[0:0x80])):
        try:
            pub.verify(sig, msg)
            print("[+] %-9s Ed25519 VALID" % name)
        except InvalidSignature:
            raise SystemExit("[-] %s Ed25519 INVALID" % name)

    payload_len = struct.unpack_from("<Q", c, 0x10)[0]
    chunk_size = struct.unpack_from("<I", c, 0x18)[0]
    chunk_cnt = struct.unpack_from("<I", c, 0x1C)[0]
    manifest = c[0x20:0x40]
    payload_sha = c[0x40:0x60]
    header_sha = c[0x60:0x80]
    print("[i] payload_len=%#x chunk_size=%#x chunks=%d" % (payload_len, chunk_size, chunk_cnt))
    assert hashlib.sha256(d[:c_off]).digest() == header_sha == f[0x20:0x40], "header SHA-256 mismatch"
    assert hashlib.sha256(c).digest() == f[0x40:0x60], "container SHA-256 mismatch"

    print("[+] header SHA-256 / container SHA-256 OK")

    t32 = [struct.unpack_from("<I", d, CRC32C_TAB_OFF + 4 * i)[0] for i in range(256)]
    t64 = [struct.unpack_from("<Q", d, CRC64_TAB_OFF + 8 * i)[0] for i in range(256)]
    assert crc32c(c, t32) == struct.unpack_from("<I", f, 0x60)[0], "container CRC32C mismatch"
    assert crc64(c, t64) == struct.unpack_from("<Q", f, 0x64)[0], "container CRC64 mismatch"
    print("[+] container CRC32C/CRC64 OK")

    master = bytes(a ^ b for a, b in zip(cfg[0x50:0x70], cfg[0x30:0x50]))
    print("[i] master key = %s" % master.hex())

    out = bytearray()
    off = 0xC0
    for i in range(chunk_cnt):
        idx, ln = struct.unpack_from("<II", c, off)
        hdr = c[off:off + 0x30]
        iv, tag = c[off + 8:off + 0x14], c[off + 0x14:off + 0x24]
        ct = c[off + 0x30:off + 0x30 + ln]
        assert idx == i, "chunk order broken"
        assert ln == min(chunk_size, payload_len - i * chunk_size), "chunk length broken"
        body = hdr[:0x24] + ct
        assert crc32c(body, t32) == struct.unpack_from("<I", hdr, 0x24)[0], "chunk %d CRC32C" % i
        assert crc64(body, t64) == struct.unpack_from("<Q", hdr, 0x28)[0], "chunk %d CRC64" % i
        key = hmac.new(master, KDF_LABEL + header_sha + manifest + struct.pack("<I", idx),
                       hashlib.sha256).digest()
        g = AES.new(key, AES.MODE_GCM, nonce=iv)
        g.update(c[0:0x80] + hdr[:0x14])
        out += g.decrypt_and_verify(ct, tag)
        print("[+] chunk %d len=%#x CRC32C/CRC64/GCM OK" % (i, ln))
        off += 0x30 + ln

    ok = hashlib.sha256(out).digest() == payload_sha
    print("[i] payload SHA-256 %s -> %s" % ("match" if ok else "MISMATCH", hashlib.sha256(out).hexdigest()))
    if not ok:
        raise SystemExit(2)
    assert out[:4] == b"\x7fELF" and out[4] == 2 and struct.unpack_from("<H", out, 0x12)[0] == 183
    open(dst, "wb").write(out)
    print("[i] wrote %s (%d bytes)" % (dst, len(out)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

依赖： `pip install pycryptodome cryptography` 用法： `python -X utf8 unpack_v2.py exe out.elf`

### 6.3 实跑

```python
[+] footer    Ed25519 VALID
[+] container Ed25519 VALID
[i] payload_len=0x4f5f8 chunk_size=0x10000 chunks=5
[+] header SHA-256 / container SHA-256 OK
[+] container CRC32C/CRC64 OK
[i] master key = f674f9f4a759779413d80413500075b05f82275b54ba0b5035a45a7090e391eb
[+] chunk 0 len=0x10000 CRC32C/CRC64/GCM OK
[+] chunk 1 len=0x10000 CRC32C/CRC64/GCM OK
[+] chunk 2 len=0x10000 CRC32C/CRC64/GCM OK
[+] chunk 3 len=0x10000 CRC32C/CRC64/GCM OK
[+] chunk 4 len=0xf5f8 CRC32C/CRC64/GCM OK
[i] payload SHA-256 match -> f45e6f08c92c8c9c9249c220ccd922a5c50a4f2ef31650fb1d7b17236e14381b
[i] wrote _art_run3.elf (325112 bytes)
```

`payload SHA-256 -> f45e6f08...` 这一行是整条链的自证，解出来的325112字节，哈希和文件里写死的 `payload_sha` 一致就行了
