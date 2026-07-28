---
title: 【看雪】易盾壳（libnesec）分析(纯AI)
source: https://bbs.kanxue.com/thread-292211.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-28T20:34:31+08:00
trace_id: 45f6237a-f914-44da-b175-4ced70b9451e
content_hash: da7cc51b931611fdf93809c5a26bbc6e9a49d1a9da3cb37eb01a753970ae8a92
status: synced
tags:
  - 看雪
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 看雪·Android安全
ai_summary: 易盾壳采用两层native保护，libnesec.so主体用F77EC改型RC4+zlib加密，classes.dex尾部多DEX的page0用标准RC4加密，均可离线还原。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ab75244-d011-81d4-aa0e-f9798c50d897
ioc:
  cves: []
  cwes: []
  hashes:
    - b8b1e7e5ede2ece0e0b3b1b7e4f5e3e0
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 易盾壳采用两层native保护，libnesec.so主体用F77EC改型RC4+zlib加密，classes.dex尾部多DEX的page0用标准RC4加密，均可离线还原。
> 
> - **磁盘加密片段：** 输入为libnesec.so中文件偏移0x190至0x190+0xDBA80的密文，经F77EC定制块解密（F72E4种子0xBC7E439E、改型RC4、头64 B异或0xD7）和zlib解压得到0xE1302字节镜像（魔数7FB2B30F），再拼装原始ELF头与Phdr生成可分析SO。
> - **业务DEX保护：** classes.dex的數據区后接multi-DEX容器表（magic 0x3186A473），type=5条目存储密文DEX；仅前0x1000字节用标准RC4加密，密钥为“F618BC5E4152A54E”，解密后由OpenMemory注入ClassLoader。
> - **密钥与分层：** 配置密钥“93dahdkha123asdh”（RC4解密配置文本得到）与page0密钥“F618BC5E4152A54E”不等，且SO的改型RC4与DEX页的标准RC4无关。
> - **离线还原：** 提供Python脚本分别解密libnesec.so（生成libnesec.decrypted.so）和从APK中classes.dex提取并解密业务DEX文件。

> **声明** ：授权安全研究。地址为 arm64-v8a、image base = 0。  
> **样本** ： `com.yikaobang.yixue` ； `com.netease.nis.wrapper` ； `MyApplication.VER ≈ 7.6.3_996` ； `libnesec.so` / `libsecsdk.so` 。

* * *

## 0\. 摘要

易盾对本样本采用 **两层 native 保护** ，业务逻辑并不直接躺在可静态 JADX 的 DEX 里：

| 层   | 保护对象 | 输入边界 | 算法摘要 | 输出边界 |
| --- | --- | --- | --- | --- |
| **L1** | `libnesec.so` 主体 | 磁盘切片 `[0x190, 0x190+0xDBA80)` | **F77EC** （改型 RC4+块机）→ **zlib** | inflate 镜像 `0xE1302` ；再贴回磁盘 Phdr 成分析 so |
| **L2** | 业务 DEX | `classes.dex` 的 `data_off+data_size` 之后 | 容器表 type=5 + **page0 标准 RC4** | 表内 `(off,size)` → 明文 DEX → `OpenMemory` |

分析目标可归结为经典三问：

1.  **输入边界** ：密文从哪到哪？
2.  **解密变换** ：算法与密钥从哪来？
3.  **输出边界** ：如何切成合法业务产物？

下文按 **启动时序** 把两层串成一条完整链。  
**§3** 从 **磁盘加密 libnesec.so** 出发，离线复现 **F77EC→zlib** 与解密后 ELF 组装。

* * *

## 1\. 总体架构

```
APK: classes.dex（壳 + 业务尾） / libnesec.so / libsecsdk.so
                    │
    MyApplication.attachBaseContext
                    │
    System.loadLibrary("nesec")
                    │
    系统 linker：mmap + RELA + INIT_ARRAY
      [0] maps 探针  [1] unpack 调度  [2] finalize
                    │
    L1：F8944 → F77EC → zlib → LOAD0 明文就绪
                    │
    返回 Java → MyJni.load / MyJni.cl / RegisterNatives …
                    │
    L2：读 classes 尾 → 表 type=5 → page0 标准 RC4
                    │
    ART DexFile::OpenMemory → DexPathList$Element → ClassLoader
                    │
    业务 Application / 业务类
```

`classes.dex` ：壳约 30 类 + 尾部 multi-DEX；业务经 native **OpenMemory** 注入。

* * *

## 2\. Java 层入口（壳）

| 项   | 内容  |
| --- | --- |
| Application | `com.netease.nis.wrapper.MyApplication` |
| 启动  | `attachBaseContext` → `loadLibrary("nesec")` （INIT 完成 L1）→ `MyJni.load` / `MyJni.cl` … |
| 动态注册 | native 侧 `RegisterNatives` （静态 dex 无实现体） |
| 短名 JNI 接口（字符串可见） | `gn` / `go` `()[B` ， `v` `([B[B)I` ， `ga` 等 |
| Java 串混淆 | `a.auu.a.c` ：Base64 后 XOR 循环密钥 **`Netease`** |
| 资产  | `assets/encryptedApp.dat` （体量小，非业务 DEX 主体） |

业务 DEX： `nesec_jni_bridge_setup_and_load` → `nesec_dex_load_into_classloader` （§4）。

* * *

## 3\. L1：从磁盘加密 so 离线解密到可分析 ELF

起点为 APK 内 **`libnesec.so`** 。管线： **F77EC → zlib → 按 Phdr 组装分析 so** 。完整 Python 见 §3.4。

### 3.1 磁盘外层 ELF

文件： `lib/arm64-v8a/libnesec.so` （本样本约 **1051712 = 0x100C40** 字节）。

#### 3.1.1 头与 Program Headers

| 字段  | 本样本 |
| --- | --- |
| 魔数  | `7F 45 4C 46` （标准 ELF64 LE） |
| e_machine | AArch64 |
| e_phoff / e_phnum | `0x40` / **6** |
| e_entry | `0x2D55C` （落在 LOAD0 文件区） |
| 文件大小 | `0x100C40` |

**Program Headers（装载契约，解密后也必须保留）：**

| #   | 类型  | 权限  | p_offset | p_vaddr | p_filesz | p_memsz | 静态特征 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0   | PT_LOAD | R-X | `0x0` | `0x0` | **`0xDC000`** | `0xF4000` | 高熵 ≈7.9～8.0， **主体密文** |
| 1   | PT_LOAD | R-X | **`0xDC000`** | **`0xF4000`** | `0x117E8` | 同   | **明文 stub** （解密器在这里） |
| 2   | PT_LOAD | RW  | `0xEDB00` | `0x109B00` | `0x12C98` | 同   | GOT / INIT_ARRAY 等 |
| 3   | PT_DYNAMIC | RW  | `0xF0EA0` | `0x10CEA0` | `0x1C0` | 同   | dynamic |
| 4   | GNU_EH_FRAME | R   | `0x24404` | …   | …   | …   | （文件偏移落在 LOAD0 区间） |
| 5   | GNU_STACK | RW  | 0   | 0   | 0   | 0   | —   |

几何恒等式（拼接点）：

```
e_phoff + e_phnum × e_phentsize
= 0x40 + 6 × 56
= 0x190
```

**`0x190` = ehdr + 全部 Phdr 结束** ，也是 **加密片段的文件起点** 。

#### 3.1.2 磁盘线性布局（输入边界）

```
libnesec.so
│
├─ [0x000000, 0x000190)   ehdr + 6×Phdr                 ← 明文，系统 linker / 拼装时原样保留
│
├─ [0x000190, 0x000190+0xDBA80)
│     = [0x190, 0xDBC10)  ★ F77EC 密文输入（长度 a4=0xDBA80）
│
├─ [0x0DBC10, 0x0DC000)   填满 LOAD0 filesz 的剩余部分
│
├─ [0x0DC000, …)          LOAD1：INIT_ARRAY 实现、F77EC、zlib uncompress、认头等  ← 明文算法实现
│
└─ RW / DYNAMIC / 节区 …
```

运行时：系统 linker 装 so 后，INIT 对 **`base+0x190` 、长 `0xDBA80`** 做原地解密。离线对文件同一切片执行相同算法。

LOAD1 双魔数字面量：

| 内容  | 用途  |
| --- | --- |
| `7F 45 4C 46` | 标准 ELF |
| `7F B2 B3 0F` | 壳内层镜像魔数 |

* * *

### 3.2 解密管线

```text
  磁盘密文片段
  disk[0x190 : 0x190+0xDBA80]
           │
           ▼
  ┌─────────────────────┐
  │  F77EC 定制块解密    │  key=NULL 时头 64B 仅 ⊕0xD7
  │  (F72E4 + 改型RC4   │
  │   + 128B 分块机)    │
  └─────────┬───────────┘
            │ 得到压缩包形态缓冲
            ▼
  [u32 out_len][u32 in_len][zlib 78 9C …][零填充]
            │
            ▼
  ┌─────────────────────┐
  │  zlib inflate       │  对应 stub 内 uncompress
  └─────────┬───────────┘
            │
            ▼
  内层镜像 image[0 : out_len]     本样本 out_len=0xE1302
  头 4 字节 = 7F B2 B3 0F
            │
            ▼
  按 §3.5 与磁盘 ehdr/Phdr/LOAD1 组装 → 可分析 libnesec.decrypted.so
```

本样本参数：

| 参数  | 值   |
| --- | --- |
| 密文起点 / 长度 | `0x190` / **`0xDBA80`** |
| F72E4 seed | **`0xBC7E439E`** |
| key | **NULL** |
| 头 64B | XOR **`0xD7`** |
| zlib 解压后 | **`0xE1302`** 字节，魔数 **`7FB2B30F`** |
| zlib 压缩长 | **`0x64663`** |

* * *

### 3.3 算法逐步：F77EC

以下与 LOAD1 中实现一致；完整可运行代码见 **§3.4** 。

#### 3.3.1 F72E4 — 种子

-   表：多项式 **`0x53B20C96`** ，标准式右移生成 256 项。
-   `state = 0xFFFFFFFF` ；每字节：  
    `state = table[(b ^ state) & 0xFF] ^ (state >> 8)` ，再 **`state = (state + 16) & 0xFFFFFFFF`** 。
-   返回： `(-state - 516327184) & 0xFFFFFFFF` 。

对密文 `ct = disk[0x190:0x190+a4]` ：

```
seed_input = le32(ct[12]) || le32(ct[4]) || le32(ct[48]) || le32(a4) || le32(ct[8])
seed = F72E4(seed_input)     # → 0xBC7E439E
```

#### 3.3.2 改型 RC4（F7450 / F76A0 / F7710）

| 步骤  | 行为  |
| --- | --- |
| KSA | `S[i]=i` ； `j=(key[i%n]+S[i]+j)&0xFF` ；交换 |
| PRGA | 搅动得 `t=S[(S[i]+S[j])&0xFF]` 后： **`buf ^= ror2(t)+58`** |
|     | `ror2(t) = (t>>2) \| ((t<<6)&0xFF)` |
| F7710(buf, seed) | key = **seed 的 4 字节小端** ，对 `buf` 原地加解密 |

与 §4 业务 DEX 的 **标准 RC4** 不是同一套实现。

#### 3.3.3 F77EC 主体（a4=0xDBA80，key=NULL，全量处理）

```yaml
buf ← 拷贝密文 ct[0:a4]

① seed = F72E4(...)                         # §3.3.1

② body = buf[64:192]                        # 128 字节
   v74  = body 的密文副本
   F7710(body, seed); 写回 buf[64:192]
   派生：
     v24 = (seed ^ u32(buf,52)) + 8217
     v27 = (seed ^ a4)         + 8213
     v29 = (seed ^ u32(buf,60)) + 6502
     v31 = (seed ^ u32(buf,56)) + 6534
     v67 = [v24, v29, v27, v31]
     v69 = [21605, v31, 17477, 1383, v24, v29, 309, v27, 26740]
   F7710(v74, v27) → 得到 v74w[0..31]（32 个 u32）

③ 分块数 v33 = (a4-192)>>7
   v34 = (a4-192)>>9
   for b in 0..v33-1:
     off = 192 + 128*b
     sel = v69[b%9] & 3
     sel==2: 每个 u32: w ^= v74w[i] ^ i ^ k
             k = (i==0 ? v29 : v67[v69[i%9]&3])
     sel==3: b>=3*v34 → 每 u32 的 byte0 ^= 0xC3
             否则 w ^= v74w[i] ^ i ^ v67[v74w[i]&3]
     sel==1: v34<=b<=2*v34 → byte0 ^= 0xA1
             否则 w = v74w[i] ^ w ^ (32-i) ^ k
                  k = (i==0 ? 21605 : v69[i%9])
     sel==0: 2*v34<=b<=3*v34 → byte0 ^= 0xB2
             否则 w ^= v74w[i] ^ v67[v74w[i]&3]

   0xA1/0xB2/0xC3 仅作用于每个 u32 的最低字节。

④ 尾部 v53 = (a4+64)&0x7F
   从 a4-v53 起 v53 字节：
     buf[i] ^= (v56 + v56//255) ^ v74[i] ^ i
     v56 = v69[v67[i&3] % 9]

⑤ 头 64 字节（key=NULL）：
     for i in 0..63: buf[i] ^= 0xD7
```

#### 3.3.4 zlib 解压 → 内层镜像

F77EC 输出缓冲布局：

```
+0x00  u32le out_len = 0x000E1302
+0x04  u32le in_len  = 0x00064663
+0x08  zlib 流       = 78 9C …（in_len 字节）
+…     零填充到 a4
```

```python
image = zlib.decompress(buf[8 : 8 + in_len])  # len(image)==0xE1302，头 7FB2B30F
```

`image` 按 **VA / 文件偏移从 0 起** 排布，与外层 LOAD0 对齐；组装时取 `image[0x190:0xDC000]` 写入 so（ `image` 总长 `0xE1302` ，LOAD0 `filesz=0xDC000` ）。

* * *

### 3.4 完整 Python：解密 + 组装分析 so

将 `libnesec.so` 与本段代码放同一目录，执行即可生成 `libnesec.decrypted.so` ：

```python
#!/usr/bin/env python3
"""外层 libnesec.so → 解密正文 → 组装可分析 ELF（纯离线）"""
import struct
import zlib
from pathlib import Path

M32 = 0xFFFFFFFF
FRAG_OFF, FRAG_LEN, PAD = 0x190, 0xDBA80, 0xD7


def _build_f72e4_table():
    t = []
    for i in range(256):
        v = i
        for _ in range(8):
            v = (v >> 1) ^ 0x53B20C96 if (v & 1) else (v >> 1)
        t.append(v & M32)
    return t


_T = _build_f72e4_table()


def f72e4(data: bytes) -> int:
    s = M32
    for b in data:
        s = ((_T[(b ^ (s & 0xFF))] ^ (s >> 8)) + 16) & M32
    return (-s - 516327184) & M32


def f7450(key: bytes):
    S, j = list(range(256)), 0
    for i in range(256):
        j = (key[i % len(key)] + S[i] + j) & 0xFF
        S[i], S[j] = S[j], S[i]
    return S


def f76a0(S, buf: bytearray):
    i = j = 0
    for n in range(len(buf)):
        i = (i + 1) & 0xFF
        j = (j + S[i]) & 0xFF
        S[i], S[j] = S[j], S[i]
        t = S[(S[i] + S[j]) & 0xFF]
        buf[n] ^= (((t >> 2) | ((t << 6) & 0xFF)) + 58) & 0xFF


def f7710(buf: bytearray, seed: int):
    f76a0(f7450(struct.pack("<I", seed & M32)), buf)


def u32(b, o):
    return struct.unpack_from("<I", b, o)[0]


def f77ec_decrypt(ct: bytes, a4: int = FRAG_LEN) -> bytearray:
    buf = bytearray(ct[:a4])
    seed = f72e4(struct.pack(
        "<IIIII", u32(buf, 12), u32(buf, 4), u32(buf, 48), a4, u32(buf, 8)
    ))
    body = bytearray(buf[64:192])
    v74 = bytearray(body)
    f7710(body, seed)
    buf[64:192] = body

    v24 = ((seed ^ u32(buf, 52)) + 8217) & M32
    v27 = ((seed ^ a4) + 8213) & M32
    v29 = ((seed ^ u32(buf, 60)) + 6502) & M32
    v31 = ((seed ^ u32(buf, 56)) + 6534) & M32
    v67 = [v24, v29, v27, v31]
    v69 = [21605, v31, 17477, 1383, v24, v29, 309, v27, 26740]
    f7710(v74, v27)
    v74w = [u32(v74, 4 * i) for i in range(32)]

    v33, v34 = (a4 - 192) >> 7, (a4 - 192) >> 9
    v42, v50 = 2 * v34, 3 * v34
    for b in range(v33):
        off = 192 + 128 * b
        sel = v69[b % 9] & 3
        if sel == 2:
            for i in range(32):
                k = v29 if i == 0 else v67[v69[i % 9] & 3]
                w = u32(buf, off + 4 * i) ^ v74w[i] ^ i ^ k
                struct.pack_into("<I", buf, off + 4 * i, w & M32)
        elif sel == 3:
            if b >= v50:
                for i in range(0, 128, 4):
                    buf[off + i] ^= 0xC3
            else:
                for i in range(32):
                    w = u32(buf, off + 4 * i) ^ v74w[i] ^ i ^ v67[v74w[i] & 3]
                    struct.pack_into("<I", buf, off + 4 * i, w & M32)
        elif sel == 1:
            if v34 <= b <= v42:
                for i in range(0, 128, 4):
                    buf[off + i] ^= 0xA1
            else:
                for i in range(32):
                    k = 21605 if i == 0 else v69[i % 9]
                    w = v74w[i] ^ u32(buf, off + 4 * i) ^ (32 - i) ^ k
                    struct.pack_into("<I", buf, off + 4 * i, w & M32)
        else:
            if v42 <= b <= v50:
                for i in range(0, 128, 4):
                    buf[off + i] ^= 0xB2
            else:
                for i in range(32):
                    w = u32(buf, off + 4 * i) ^ v74w[i] ^ v67[v74w[i] & 3]
                    struct.pack_into("<I", buf, off + 4 * i, w & M32)

    v53 = (a4 + 64) & 0x7F
    if v53:
        b0 = a4 - v53
        for i in range(v53):
            v56 = v69[v67[i & 3] % 9]
            buf[b0 + i] ^= ((v56 + v56 // 0xFF) ^ v74[i] ^ i) & 0xFF
    for i in range(64):
        buf[i] ^= PAD
    return buf


def decrypt_and_build(disk_path="libnesec.so", out_path="libnesec.decrypted.so"):
    disk = Path(disk_path).read_bytes()

    buf = f77ec_decrypt(disk[FRAG_OFF : FRAG_OFF + FRAG_LEN])
    out_len, in_len = u32(buf, 0), u32(buf, 4)
    image = zlib.decompress(bytes(buf[8 : 8 + in_len]))

    out = bytearray(disk)
    end = min(0xDC000, len(image))
    out[0x190:end] = image[0x190:end]
    Path(out_path).write_bytes(out)
    return bytes(out), image


if __name__ == "__main__":
    decrypt_and_build()
```

* * *

### 3.5 组装后的 ELF 结构

**外层契约（头 + Phdr + LOAD1/RW）保持磁盘原样；LOAD0 加密正文替换为 inflate 明文。**

```
out = disk
out[0x190 : min(0xDC000, len(image))] = image[0x190 : …]

LOAD0: p_offset == p_vaddr == 0, p_filesz == 0xDC000
→ [0, 0xDC000) 内：文件偏移 = VA = image 内偏移
```

```
libnesec.decrypted.so  （len = 原 so = 0x100C40）
│
├─ [0x000000, 0x000190)      磁盘 ehdr (7FELF) + 6×Phdr
├─ [0x000190, 0x000DC000)    image 解密正文（主逻辑 / 只读数据）
│                              image 总长 0xE1302，此处覆盖到 LOAD0 filesz
├─ [0x000DC000, …)           磁盘 LOAD1 @ VA 0xF4000（INIT / F77EC / zlib …）
└─ RW @ VA 0x109B00 …        磁盘 GOT / INIT_ARRAY / DYNAMIC …
```

| 对象  | 魔数  | 长度  | 含义  |
| --- | --- | --- | --- |
| `image` | `7FB2B30F` | `0xE1302` | F77EC+zlib 输出 |
| `libnesec.decrypted.so` | `7FELF` | `0x100C40` | 分析用完整 so（外层 Phdr） |

* * *

### 3.6 L1 小结

|     |     |
| --- | --- |
| 输入  | `disk[0x190 : 0x190+0xDBA80)` |
| 解密  | F77EC → `[out_len][in_len][zlib]` → inflate → `image` |
| 组装  | 头/Phdr/LOAD1/RW 用磁盘； `[0x190,0xDC000)` 用 `image` |

* * *

## 4\. L2：业务 multi-DEX 容器与 page0 解密

L1 完成后， `MyJni` 进入 native 处理业务 DEX。离线可对 APK 内 `classes.dex` 直接按 §4 / §6.2 解包。

### 4.1 输入边界

对 APK 内 **`classes.dex`** ：

```toml
shell_end = data_off + data_size     # 本样本 0x123A8
shell   = classes.dex[0 : shell_end] # 合法壳 DEX，约 30 个 class
tail    = classes.dex[shell_end : ]  # 业务载荷（约 80MB）
```

native（ `sub_A5574` ）显式：

```
LDP  W9, W8, [X1, #0x68]   ; data_size @0x68, data_off @0x6C
ADD  → shell_end
memcmp(shell_end+8, "7z\xBC\xAF'\x1C", 6)
  相等 → process_blob（7z/VL/LZMA 路径）
  不等 → 本样本主路径：multi-DEX 表
```

本样本 `tail+8` 非 7z 魔数，走 multi-DEX 表。

### 4.2 容器表

```
tail+0x00  u32 magic = 0x3186A473
tail+0x04  u32 n     = 0xE6
           align(8+n) → table_off (= 0xF0)
+0x00      u32 count = 11
随后 count × 20 字节:
  type, off, size, size2, idx
```

| 字段  | 含义  |
| --- | --- |
| `type = 5` | 业务 DEX（ `collect_tagged` 还接受 tag 11） |
| `off` | 相对 **tail** 的起点 |
| `size` / `size2` | 文件长度（本样本相等） |
| `idx` | 1..count |

输出边界：每份明文长度 = 表项 **`size`** 。

### 4.3 解密变换：仅 page0 RC4

物化路径（ `collect_tagged` → `BLR [vptr+0x98]` → 约 **`0xA6D78`** ）：

```
读 entry.ptr / size
RC4_KSA(state, key)           # 标准 RC4
len = min(size, 0x1000)
RC4_CRYPT(state, buf, len)    # 仅前 4KiB
push {ptr, size} → 供 OpenMemory
```

| 项   | 地址 / 值 |
| --- | --- |
| KSA / PRGA | `0xB52C0` / `0xB54F0` （ **标准** RC4，非 F77EC 改型） |
| page0 key 字段 | 对象 **`ctx+0x118`** （ `std::string` ） |
| 本样本 key | **`F618BC5E4152A54E`** （16 字节 ASCII） |

**磁盘等价形态：**

```
每个 type=5 镜像:
  [0, 0x1000)     密文 = RC4(plain, key)  ≡  plain ⊕ pad
  [0x1000, size)  明文 body
```

同一 key ⇒ 全部业务 DEX 共享同一 **4KiB pad** （keystream = RC4(key)）。  
`page0` 解密： `RC4_crypt(page0, key)` ，等价于 `page0 ^= pad` 。

### 4.4 双 key

与 L1 改型 RC4 无关；此处均为 **标准 RC4** ：

| key | 用途  |
| --- | --- |
| `93dahdkha123asdh` | 解配置文本（so 内 `0x1CF10` 密文 ⊕ 表 `1..8` 得该串） |
| `F618BC5E4152A54E` | 业务 DEX page0；写入 `ctx+0x118` （配置项 `d` / `dg` ） |

本样本 page0 key 为 **`F618BC5E4152A54E`** 。另可由 body 明文 KP 恢复 pad，再 XOR page0，与 RC4(key) 等价。

### 4.5 装载：OpenMemory 注入 ClassLoader

`nesec_dex_load_into_classloader` @ `0xA13EC` ：

1.  环境与 ART 符号解析（ `libart` / `libdexfile` ，OpenMemory 指针如 `0xEDF90` ）
2.  遍历已解密 `{ptr, size}`
3.  `blr` OpenMemory（约 `0xA209C` ），入参为明文 DEX
4.  组装 `dalvik/system/DexPathList$Element` 注入 ClassLoader

* * *

## 5\. 检测面

| 模块  | 行为  |
| --- | --- |
| `libsecsdk.so` | 线程名（ `gum-js-loop` / `gmain` ）、fd、maps 等 |
| `libnesec` | maps / `LD_PRELOAD` 等 |

* * *

## 6\. 离线还原（Python）

### 6.1 so：§3.4

`libnesec.so` 与 §3.4 代码同目录执行 → `libnesec.decrypted.so` 。

### 6.2 业务 DEX

从 APK 的 `classes.dex` 按 type=5 表切分，page0 标准 RC4：

```python
#!/usr/bin/env python3
"""classes.dex 尾 multi-DEX → 业务 dex 文件（纯离线）"""
import struct
import zipfile
from pathlib import Path

PAGE0_KEY = b"F618BC5E4152A54E"
MAGIC = 0x3186A473
TAG_DEX = 5


def rc4_crypt(data: bytes, key: bytes) -> bytes:
    """标准 RC4（DEX page0；非 F77EC 改型 RC4）"""
    S, j = list(range(256)), 0
    for i in range(256):
        j = (j + S[i] + key[i % len(key)]) & 0xFF
        S[i], S[j] = S[j], S[i]
    i = j = 0
    out = bytearray(data)
    for n in range(len(out)):
        i = (i + 1) & 0xFF
        j = (j + S[i]) & 0xFF
        S[i], S[j] = S[j], S[i]
        out[n] ^= S[(S[i] + S[j]) & 0xFF]
    return bytes(out)


def u32(b, o):
    return struct.unpack_from("<I", b, o)[0]


def load_classes_dex(apk_or_dex: str) -> bytes:
    p = Path(apk_or_dex)
    if p.suffix.lower() == ".apk" or zipfile.is_zipfile(p):
        with zipfile.ZipFile(p) as z:
            return z.read("classes.dex")
    return p.read_bytes()


def unpack_business_dexes(classes_dex: bytes, out_dir="out_dex", key=PAGE0_KEY):
    data_size, data_off = u32(classes_dex, 0x68), u32(classes_dex, 0x6C)
    shell_end = data_off + data_size
    tail = classes_dex[shell_end:]
    if u32(tail, 0) != MAGIC:
        raise ValueError("bad container magic")
    n = u32(tail, 4)
    table = (8 + n + 3) & ~3
    count = u32(tail, table)
    pos = table + 4
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    ok = 0
    for i in range(count):
        typ, off, size, size2, idx = struct.unpack_from("<5I", tail, pos)
        pos += 20
        if typ != TAG_DEX:
            continue
        blob = bytearray(tail[off : off + size])
        n0 = min(0x1000, len(blob))
        blob[:n0] = rc4_crypt(bytes(blob[:n0]), key)
        cds = u32(blob, 96)
        name = f"classes_{i}_{cds}cls_{len(blob):x}.dex"
        Path(out_dir, name).write_bytes(blob)
        print(f"  [{i:2d}] +{off:#010x} size={size:8d} classes={cds:5d}  -> {name}")
        ok += 1
    print(f"shell_end={shell_end:#x}  wrote {ok} DEX -> {out_dir}/")
    return ok


if __name__ == "__main__":
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else "yikaobang.apk"
    unpack_business_dexes(load_classes_dex(src))
```

page0 key： `F618BC5E4152A54E` 。配置 key 解码：

```python
table = [1, 2, 3, 4, 5, 6, 7, 8]
enc = bytes.fromhex("b8b1e7e5ede2ece0e0b3b1b7e4f5e3e0")  # 0x1CF10
cfg_key = bytes((b ^ table[i & 7]) & 0x7F for i, b in enumerate(enc))
# cfg_key == b"93dahdkha123asdh"
```

* * *

## 7\. 地址速查（本样本，base=0）

### 外层 stub（磁盘明文 LOAD1 一带）

| 符号/角色 | VA  |
| --- | --- |
| INIT_ARRAY 主调度 | `0xF55B4` |
| 装段 F8944 | `0xF8944` |
| 块解密 F77EC | `0xF77EC` |
| zlib uncompress | `0x102F64` 一带 |
| 认头 F8510 | `0xF8510` |

### 内层（解密后 IDA）

| 角色  | VA  |
| --- | --- |
| JNI 桥 → 装载 | `0xA4CDC` → `0xA5348` → `0xA13EC` |
| OpenMemory | `0xA209C` |
| shell_end / 7z 门 | `0xA5574` |
| collect type 5/11 | `0xA5790` |
| type=5 物化 | `0xA6D74` / `+0xA6D78` |
| RC4 KSA / PRGA | `0xB52C0` / `0xB54F0` |
| 配置 key 密文 | `0x1CF10` |
| ctx / vtable | `0xEA988` / `0xE3F28` |

* * *

## 8\. 结论

1.  **L1** ： `disk[0x190:0x190+0xDBA80)` → F77EC + zlib → `image` （ `0xE1302` ， `7FB2B30F` ）→ 按 §3.5 组装分析 so。
2.  **L2** ： `classes.dex` 自 `data_off+data_size` 起 multi-DEX 表；page0 标准 RC4，key **`F618BC5E4152A54E`** ；输出长度 = 表项 `size` 。
3.  **装载** ： `OpenMemory` + `DexPathList$Element` 注入 ClassLoader。
4.  **密钥分层** ：配置 `93dahdkha123asdh` ≠ page0 `F618…` ；so 改型 RC4 ≠ DEX 标准 RC4。

```
配置 ──RC4("93dahdkha123asdh")──► key:value ──d/dg──► ctx+0x118
DEX page0 ──标准 RC4(F618BC5E4152A54E)──► 明文头
```

*偏移与常量绑定本样本版本。*

## 附件

- [libnesec.decrypted.full.so](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/c8c65d1991c0145e.so) （1.00MB，0次下载）
