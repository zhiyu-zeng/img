---
title: 【看雪】爱加密V4加固 无frida so/dex脱壳修复
source: https://bbs.kanxue.com/thread-292229.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-30T11:25:31+08:00
trace_id: 80cafff7-bda2-452f-a926-16987dc4119d
content_hash: 742b1a212f56c24e5bd333577b7d26f70e7c9dadef92997d1aa4962c281ca305
status: synced
tags:
  - 看雪
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 看雪·Android安全
ai_summary: 通过内存 dump 已解压的壳 SO 与运行期缓存文件，离线破解内层加密后成功提取并修复 10 个业务 DEX，总计约 7.6 万类。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ad75244-d011-81d6-973f-f1e99987e432
ioc:
  cves: []
  cwes: []
  hashes:
    - 9ac09630f8ee6bf469f7e7c9dc79a954
    - a5d3b1f9eee35a17e4e7792d96e60ab7
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过内存 dump 已解压的壳 SO 与运行期缓存文件，离线破解内层加密后成功提取并修复 10 个业务 DEX，总计约 7.6 万类。
> 
> - **放弃 Frida 注入：** 壳在 JNI_OnLoad 极早期检测 Frida 线程，改用 root 权限读取 `/proc/<pid>/mem` 和 `/data/data/<pkg>/files/` 缓存，实现无对抗 dump。
> - **SO 修复与基址绑定：** dump 得到的 `libexec.so` 镜像包含匿名可执行洞，使用 SoFixer 修复时必须提供当次运行的 ASLR 基址（`-m` 参数），修复后 IDA 可正常识别解压后的 7 万+ 函数。
> - **缓存文件双层解密：** 启动后生成的 78 MB 中间缓存 `i8ce7a86c2c908100` ，通过爆破 `key_byte`（`0x39`）构建 S‑box 逆表，再结合尾部 9 字节 XOR 密钥解开，得到连续明文 DEX 流。
> - **DEX 文件雕刻：** 以 `dex\n` 魔法字节扫描，读取 file_size 切片，修复 SHA‑1 签名和 Adler32 校验，最终提取出 10 个完整 DEX，文件可直接用 JADX 分析。

本文记录对包名 `vip.mytokenpocket` 的爱加密加固样本的完整脱壳过程。样本业务 DEX 全部落在加密载荷中，壳 SO `libexec.so` 自身再套一层 UPX 定制压缩与 VMP。实战路径为：

1.  静态识别壳结构与 Java 入口
    
2.  放弃早期 Frida 注入，改用 root 读进程内存 dump 已解压 `libexec.so`
    
3.  SoFixer 修复后用 IDA 还原 DEX 加载链路
    
4.  拉取运行期缓存文件，离线完成内层 S-box / XOR 解密
    
5.  雕刻并修复 10 个明文 DEX（合计约 7.6 万类）
    

工作目录： `E:\恶意app2号\_unpack_tmp\so_dump\`

* * *

## 1\. 样本信息

| 项   | 值   |
| --- | --- |
| 文件  | `demo.apk` |
| 包名  | `vip.mytokenpocket` |
| APK MD5 | `a5d3b1f9eee35a17e4e7792d96e60ab7` |
| 签名  | `CN=tt` （自签） |
| 主 Activity | `com.tokenbank.activity.splash.SplashActivity` |
| 真 Application | `com.tokenbank.TokenbankApplication` |
| 壳 Application | `s.h.e.l.l.S` |
| 分析环境 | 小米 arm64-v8a + Magisk；Windows；GDA / IDA / SoFixer / Python3 |

* * *

## 2\. 加固识别与壳结构

### 2.1 APK 内部布局

解压后关键文件：

```bash
classes.dex                              10156 B   壳 DEX，仅 3 个类assets/ijiami.dat                     20845164 B   主加密 DEX 载荷assets/ijiami.ajm                      8705702 B   magic = "indl01"assets/libp.so                        14168398 B   非 ELF，自定义格式assets/IJMDal.Data                       19472 Bassets/ijm_lib/arm64-v8a/libexec.so     778144 B   壳引擎（再加固）assets/ijm_lib/arm64-v8a/libexecmain.so  36312 Bassets/ijm_lib/{armeabi,x86,x86_64}/...
```

注意：本包没有把 `libexec.so` 放进 `lib/` ，而是放在 `assets/ijm_lib/` ，由 Java 壳按 ABI 解压到 `filesDir` 再 `System.load` 。

GDA `packer` / `binfo` 明确标记爱加密； `classes.dex` 只有壳类，业务 Activity 在攻击面里全部显示为未解析地址，说明真代码不在 stub DEX。

### 2.2 壳 DEX 类职责

| 类   | 角色  |
| --- | --- |
| `s.h.e.l.l.S` | Manifest 注册的 Application； `attachBaseContext` / `onCreate` |
| `s.h.e.l.l.N` | Native 桥： `l` / `r` / `ra` / `al` 等 |
| `s.h.e.l.l.C` | ClassLoader 相关辅助 |

`N.<clinit>` 加载逻辑：

```
System.load(filesDir + "/libexec.so")若需要再 load libexecmain.so
```

`S.attachBaseContext` 关键顺序（GDA 反编译确认）：

```kotlin
S.gST()super.attachBaseContext(ctx)S.l(ctx)                          # 按 ABI 从 APK 抽出 libexec*.soN.l(this, "vip.mytokenpocket")    # native 初始化N.r(this, "com.tokenbank.TokenbankApplication")  # 挂接真 ApplicationS.gET()
```

`S.onCreate` ：

```
N.ra(this, "com.tokenbank.TokenbankApplication")若已保存真 Application 实例 → 调其 onCreate()super.onCreate()
```

`S.l` / `S.c` ：读取 `assets/ijm_lib/<abi>/libexec.so` （及 `libexecmain.so` ），CRC 校验后写入 `getFilesDir()` 。

至此，Java 层职责结束：准备好 native 壳，并把控制权交给 `libexec.so` 。

* * *

## 3\. libexec.so 的二次加固分析

### 3.1 磁盘态特征

对 `assets/ijm_lib/arm64-v8a/libexec.so` 静态观察：

-   `DT_INIT = 0x950D0` ，指向 `.init_proc` 解压桩，而非正常业务入口
    
-   文件内存在 `UPX!` 标记（偏移约 `0x41878` ）
    
-   IDA 几乎只能识别解压相关极少数函数；导出/节表残缺
    
-   明文字符串可见： `ijm_vmp` 、 `ijiami` 、 `JNI_OnLoad` 、 `checkFridaThreadName` 、 `ptrace`
    
-   `INIT_ARRAY` 在文件中多为 0，需解压后才恢复
    

`.init_proc` 行为概括：

1.  读取压缩参数，按比特流做类 NRV/UPX 的字面量拷贝与回指匹配
    
2.  修正 ARM64 相关指令偏移
    
3.  `mprotect(..., PROT_READ|PROT_EXEC)` 并执行 `DC CVAU` / `IC IVAU` 刷缓存
    
4.  跳到内层真实初始化逻辑
    

因此： **直接对磁盘 `libexec.so` 做业务逆向没有意义，必须先拿到运行期解压镜像。**

### 3.2 反 Frida 与策略选择

解压后的 so 中存在：

-   导出/符号级函数 `checkFridaThreadName`
    
-   对 `/proc/self/maps` 的路径扫描逻辑（命中 agent 特征后可自杀）
    

爱加密把检测放在 `JNI_OnLoad` 极早期，常见 spawn + JS hook 窗口不够。 本案例采用：

> App 正常启动完成解密 → 不注入 → root 读 `/proc/<pid>/mem` 与 `files/` 缓存。

* * *

## 4\. 运行期 maps 与 SO Dump

### 4.1 启动与确认

```
adb shell am force-stop vip.mytokenpocketadb shell monkey -p vip.mytokenpocket -c android.intent.category.LAUNCHER 1# 等待 10~20 秒，确保壳完成解压与 DEX 解密adb shell su -c "pidof vip.mytokenpocket"adb shell su -c "ls -la /data/data/vip.mytokenpocket/files/"
```

`files/` 中会出现：

```
libexec.so              # 仍是打包文件的落地副本libexecmain.soi8ce7a86c2c908100       # 约 78MB，外层处理后的 DEX 缓存（下文称 i_cache）libp.so / p.zip ...
```

### 4.2 maps 的关键现象

本样本一次运行的映射（基址受 ASLR 影响，以下为实例）：

```css
787de0c000-787de4c000 r-xp  00000000  .../files/libexec.so787de4c000-787def8000 r-xp  00000000  [匿名]          ← 解压后的代码洞787defa000-787df00000 r--p  00096000  .../files/libexec.so787df00000-787df22000 rw-p  0009c000  .../files/libexec.so
```

要点：

-   模块 `base = 787de0c000` ， `end = 787df22000` ，跨度 `0x116000`
    
-   **匿名 r-x 段** 才是 UPX 解压出来的真代码；只 dump 带 `libexec.so` 路径名的段会丢主体
    
-   dump 成功后镜像内 `UPX!` 消失，并出现 `ijiami.dat` 、 `OpenMemory` 、 `InMemoryDexClassLoader` 等字符串
    

### 4.3 Dump 实现

脚本： `dump_libexec_mem.py`

思路：

1.  取所有 pathname 以 `libexec.so` 结尾的 VMA，得 `[base, end)`
    
2.  枚举 maps 中与该区间重叠且可读的页（含匿名）
    
3.  经 `dd if=/proc/<pid>/mem` 分段导出，按 `vaddr - base` 拼成连续文件
    
4.  记录基址到 `libexec_base.txt` ，供 SoFixer 使用
    

```sql
#!/usr/bin/env python3"""Dump libexec.so memory image via adb root (no Frida)."""import reimport subprocessfrom pathlib import PathPKG = "vip.mytokenpocket"OUT_DIR = Path(r"E:\恶意app2号\_unpack_tmp\so_dump")OUT_DIR.mkdir(parents=True, exist_ok=True)def adb(*args: str, check=True) -> str:    r = subprocess.run(["adb", *args], capture_output=True)    out = (r.stdout or b"").decode("utf-8", "replace")    err = (r.stderr or b"").decode("utf-8", "replace")    if check and r.returncode != 0:        raise RuntimeError(f"adb {args} failed: {err or out}")    return out.replace("\r", "")def adb_su(cmd: str, check=True) -> str:    return adb("shell", "su", "-c", cmd, check=check)def main():    pid = adb_su(f"pidof {PKG}").strip().split()[0]    print(f"[+] pid={pid}")    maps = adb_su(f"cat /proc/{pid}/maps")    (OUT_DIR / "maps_full.txt").write_text(maps, encoding="utf-8")    lib_lines = [ln for ln in maps.splitlines() if ln.rstrip().endswith("libexec.so")]    if not lib_lines:        raise SystemExit("libexec.so not in maps")    def parse_range(ln):        m = re.match(r"^([0-9a-f]+)-([0-9a-f]+)\s+(\S+)", ln)        return int(m.group(1), 16), int(m.group(2), 16), m.group(3), ln    segs = [parse_range(ln) for ln in lib_lines]    base = min(s[0] for s in segs)    end = max(s[1] for s in segs)    size = end - base    print(f"[+] base=0x{base:x} end=0x{end:x} size=0x{size:x} ({size})")    for a, b, p, _ in segs:        print(f"    named: {a:x}-{b:x} {p}")    readable = []    for ln in maps.splitlines():        m = re.match(r"^([0-9a-f]+)-([0-9a-f]+)\s+(\S+)", ln)        if not m:            continue        a, b, perms = int(m.group(1), 16), int(m.group(2), 16), m.group(3)        if b <= base or a >= end or perms[0] != "r":            continue        readable.append((max(a, base), min(b, end), perms, ln.strip()))    readable.sort()    print(f"[+] readable overlapping ranges: {len(readable)}")    remote_dir = "/data/local/tmp/libexec_pieces"    adb_su(f"rm -rf {remote_dir}; mkdir -p {remote_dir}")    pieces = []    for i, (a, b, p, ln) in enumerate(readable):        ln_size = b - a        remote = f"{remote_dir}/p{i}.bin"        if a % 4096 == 0 and ln_size % 4096 == 0:            cmd = (                f"dd if=/proc/{pid}/mem of={remote} bs=4096 "                f"skip={a // 4096} count={ln_size // 4096} 2>/dev/null"            )        else:            cmd = (                f"dd if=/proc/{pid}/mem of={remote} bs=1 "                f"skip={a} count={ln_size} 2>/dev/null"            )        print(f"[*] piece {i}: 0x{a:x} +0x{ln_size:x} {p}")        adb_su(cmd)        local = OUT_DIR / f"piece_{i}.bin"        adb("pull", remote, str(local))        data = local.read_bytes()        pieces.append((a - base, data[:ln_size], p))    buf = bytearray(size)    for off, data, _ in pieces:        buf[off : off + len(data)] = data    out = OUT_DIR / "libexec_dumped.so"    out.write_bytes(buf)    (OUT_DIR / "libexec_base.txt").write_text(f"0x{base:x}\n", encoding="utf-8")    print(f"[+] wrote {out} ({len(buf)} bytes), base=0x{base:x}")    for marker in [        b"\x7fELF", b"UPX!", b"JNI_OnLoad", b"ijiami.dat",        b"InMemoryDexClassLoader", b"OpenMemory", b"ijm_vmp",    ]:        idx = buf.find(marker)        print(f"    find {marker!r}: {hex(idx) if idx >= 0 else None}")if __name__ == "__main__":    main()
```

本案例产物：

| 文件  | 说明  |
| --- | --- |
| `libexec_dumped.so` | 1138688 字节连续镜像 |
| `libexec_base.txt` | `0x787de0c000` |
| `piece_*.bin` | 各 VMA 原始分段 |

自检： `UPX!` 为 `None` ； `ijiami.dat` / `JNI_OnLoad` 可搜到。

* * *

## 5\. SoFixer 修复

内存 dump 的 ELF 头仍带运行时布局痕迹，节表不完整，直接进 IDA 体验差。使用本地 SoFixer：

```
cd /d D:\mytools\SoFixer

SoFixer_x64.exe ^
  -s "E:\恶意app2号\_unpack_tmp\so_dump\libexec_dumped.so" ^
  -o "E:\恶意app2号\_unpack_tmp\so_dump\libexec_sofixer.so" ^
  -m 0x787de0c000 ^
  -d
```

| 参数  | 含义  |
| --- | --- |
| `-s` | dump 文件 |
| `-o` | 修复输出 |
| `-m` | **当次** dump 的模块基址（ASLR，每次可能不同） |
| `-d` | 调试输出 |

修复后得到 `libexec_sofixer.so` （约 1139702 字节），即可用 IDA 打开做交叉引用。

* * *

## 6\. IDA：DEX 加载流程还原

以下地址均相对 `libexec_sofixer.so` 镜像。

### 6.1 总流程

```
System.load(libexec.so)
    │
    ├─ DT_INIT / .init_proc     ← UPX 解压（dump 前已完成）
    │
    └─ JNI_OnLoad @ 0x6F464
            ├─ 初始化运行时 / VMP 上下文（ijm_vmp）
            ├─ 批量解密混淆字符串（sub_76AF0 等）
            ├─ RegisterNatives → s/h/e/l/l/N|S|C|A ...
            └─ 返回 JNI_VERSION
                    │
Java attachBaseContext
    └─ N.l / N.r
            │
            ├─ sub_B3D1C  打开 assets/ijiami.dat（AAsset 封装）
            ├─ sub_B369C  外层处理 → 写入 files/i*
            ├─ 内层 S-box + 尾 XOR → 得到多 DEX 缓冲
            ├─ sub_5A52C  InMemoryDexClassLoader / ByteBuffer
            └─ sub_5A708  合并写入 BaseDexClassLoader.pathList.dexElements
```

### 6.2 JNI_OnLoad

```javascript
// 0x6F464
jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    ctx = sub_DC274();
    sub_DC33C(ctx, vm);
    sub_DC33C(ctx, reserved);
    sub_DC32C(ctx, &handler_table, ...);
    return sub_E26B0(ctx);   // 经 VMP/解释器风格收尾
}
```

同模块存在 `checkFridaThreadName @ 0x5D9C8` ，与“注入窗口极短”的现象一致。

### 6.3 读取 ijiami.dat：sub_B3D1C

-   对路径做 APK / app / dex 等关键字过滤
    
-   通过内部函数表调用 AAsset 接口打开 **`assets/ijiami.dat`**
    
-   成功则进入 `sub_B369C(buf, size, "classes.dex")`
    

`sub_B3FBC` 负责一次性 XOR 还原 `assets/ijiami.dat` 、 `classes.dex` 等被混淆的只读字符串。

### 6.4 解密后装载：sub_5A52C → sub_5A708

`sub_5A52C` ：

1.  将明文 DEX 包进 `java.nio.ByteBuffer`
    
2.  `new dalvik.system.InMemoryDexClassLoader(buffer, parent)`
    
3.  调用 `sub_5A708` 做 pathList 注入
    

`sub_5A708` ：

1.  读取原 `BaseDexClassLoader.pathList.dexElements`
    
2.  与新 elements 数组合并
    
3.  写回 `dexElements`
    

同时 so 内保留多组 `art::DexFile::OpenMemory...` 符号名及 `mCookie` 相关逻辑，用于不同 Android 版本的兼容路径。

### 6.5 与缓存文件的关系

运行后 `files/i8ce7a86c2c908100` （78MB）即外层处理完成、内层尚未完全摊开到“可直接 JADX”的中间态缓冲。 对壳 SO 的 VMP 细节可以继续深挖，但 **还原业务 DEX 的最短路径是离线解该缓存** 。

* * *

## 7\. 缓存文件格式与密钥推导

### 7.1 拉取

```
adb shell su -c "cp /data/data/vip.mytokenpocket/files/i8ce7a86c2c908100 /data/local/tmp/i_cache.bin"
adb shell su -c "chmod 644 /data/local/tmp/i_cache.bin"
adb pull /data/local/tmp/i_cache.bin "E:\恶意app2号\_unpack_tmp\so_dump\i_cache.bin"
```

```
大小   78005776
MD5    9ac09630f8ee6bf469f7e7c9dc79a954
头40B  04 00 00 00 10 46 A6 04 | ASCII hash ...
尾u32  10   （小端，对应 10 个 DEX）
```

### 7.2 内层结构

```
i_cache.bin
├─ [0 : 40)     固定头
└─ [40 : end)   内层密文
      ├─ [0 : sbox_end)     S-box 区域，sbox_end = floor(n/1024)*1024
      └─ [sbox_end : n)     尾部短区（本包 rem=488），16 字节一组局部 XOR
```

本包：

```
n (去头后) = 78005736
sbox_end   = 78005248
rem        = 488
```

488 字节恰好覆盖： **最后一个 DEX 的末尾 + 10 条索引 + 4 字节个数** 。

### 7.3 S-box 与 key_byte

构造（与 native 实现一致）：

```python
def make_sbox(key_byte: int) -> bytearray:
    v66 = bytearray((key_byte + i) & 0xFF for i in range(256))
    for i in range(0, 128, 2):
        v66[i], v66[128 + i] = v66[128 + i], v66[i]
    v65 = bytearray(256)
    for i in range(256):
        v65[v66[i]] = i   # 逆表，解密用
    return v65
```

对 `raw[40:44]` 爆破，使解出 `64 65 78 0a` （ `dex\n` ）：

```python
def find_key_byte(raw: bytes) -> int:
    c0, c1, c2, c3 = raw[40:44]
    for kb in range(256):
        sbox = make_sbox(kb)
        if (sbox[c0], sbox[c1], sbox[c2], sbox[c3]) == (0x64, 0x65, 0x78, 0x0A):
            return kb
    raise RuntimeError("not found")
```

本包唯一解：

```
KEY_BYTE = 0x39
```

S-box 后头部变为 `dex\n035\0` ，并在 sbox 区内扫到 **10** 处合法 DEX magic。

### 7.4 尾部 XOR

每 16 字节一组，仅下列偏移参与 XOR：

```
POS  = [0, 2, 4, 6, 8, 9, 11, 13, 15]
```

对应 9 个密钥字节。最后一个 DEX（ `classes10` ）的 `map_list` 落在 XOR 区，利用 DEX `map_list` 格式不变量可解出全部 keys：

```cpp
struct map_list {
    uint32_t size;          // 条目数，高 3 字节多为 0
    map_item items[];       // 首条 type 必为 HEADER_ITEM=0
};
struct map_item {
    uint16_t type;
    uint16_t unused;        // 0
    uint32_t size;
    uint32_t offset;
};
```

本包结果：

```
XOR_KEYS = [0x46, 0x8F, 0x60, 0x33, 0x51, 0x00, 0xE2, 0xEE, 0x22]
```

### 7.5 DEX 提取与校验修复

索引表若仍受 XOR/对齐影响，实践中更稳的是：

1.  全缓冲内搜索 `dex\n` + 版本号 `035/037/038/039`
    
2.  读取 header 偏移 32 的 `file_size`
    
3.  切片后修复校验：
    

```python
def fix_dex_checksums(dex: bytearray) -> bytearray:
    # 1) signature：SHA-1(data[32:])
    dex[12:32] = hashlib.sha1(bytes(dex[32:])).digest()
    # 2) checksum：Adler32(data[12:])  —— 必须在 SHA-1 写回之后
    dex[8:12] = struct.pack("<I", zlib.adler32(bytes(dex[12:])) & 0xFFFFFFFF)
    return dex
```

* * *

## 8\. 完整解密脚本

文件： `decrypt_icache_final.py`

```python
#!/usr/bin/env python3
"""Decrypt ijiami cache (inner layer) -> classes*.dex"""
from pathlib import Path
import struct
import hashlib
import zlib

IN = Path(r"E:\恶意app2号\_unpack_tmp\so_dump\i_cache.bin")
OUT = Path(r"E:\恶意app2号\_unpack_tmp\so_dump\dex_out")

KEY_BYTE = 0x39
XOR_KEYS = [0x46, 0x8F, 0x60, 0x33, 0x51, 0x00, 0xE2, 0xEE, 0x22]
XOR_POS = [0, 2, 4, 6, 8, 9, 11, 13, 15]

def make_sbox(kb: int) -> bytearray:
    v66 = bytearray((kb + i) & 0xFF for i in range(256))
    for i in range(0, 128, 2):
        v66[i], v66[128 + i] = v66[128 + i], v66[i]
    v65 = bytearray(256)
    for i in range(256):
        v65[v66[i]] = i
    return v65

def fix_dex_checksums(dex: bytearray) -> bytearray:
    dex[12:32] = hashlib.sha1(bytes(dex[32:])).digest()
    dex[8:12] = struct.pack("<I", zlib.adler32(bytes(dex[12:])) & 0xFFFFFFFF)
    return dex

def apply_tail_xor(data: bytearray, sbox_end: int, keys: list[int]) -> None:
    n = len(data)
    rem = n - sbox_end
    groups = rem // 16
    for g in range(groups):
        base = sbox_end + g * 16
        for pi, xk in zip(XOR_POS, keys):
            data[base + pi] ^= xk
    leftover = sbox_end + groups * 16
    for j in range(n - leftover):
        if j in XOR_POS:
            data[leftover + j] ^= keys[XOR_POS.index(j)]

def carve_and_write(data: bytearray, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    pos = 0
    idx = 0
    total_cls = 0
    while pos < len(data) - 0x70:
        i = data.find(b"dex\n", pos)
        if i < 0:
            break
        if data[i + 4 : i + 7] not in (b"035", b"037", b"038", b"039"):
            pos = i + 4
            continue
        fsz = struct.unpack_from("<I", data, i + 32)[0]
        if fsz < 0x70 or i + fsz > len(data):
            pos = i + 4
            continue
        dex = fix_dex_checksums(bytearray(data[i : i + fsz]))
        map_off = struct.unpack_from("<I", dex, 52)[0]
        if map_off >= fsz:
            pos = i + 4
            continue
        name = "classes.dex" if idx == 0 else f"classes{idx + 1}.dex"
        (out_dir / name).write_bytes(dex)
        ncls = struct.unpack_from("<I", dex, 96)[0]
        total_cls += ncls
        print(f"OK {name}: {len(dex)} bytes, {ncls} classes")
        idx += 1
        pos = i + fsz
    print(f"DONE {idx} dex, classes={total_cls} -> {out_dir}")

def main():
    raw = IN.read_bytes()
    print(f"[+] read {IN} size={len(raw)}")
    print(f"[+] header40={raw[:40].hex()}")

    data = bytearray(raw[40:])
    sbox = make_sbox(KEY_BYTE)
    sbox_end = (len(data) >> 10) << 10
    for i in range(sbox_end):
        data[i] = sbox[data[i]]
    print(f"[+] sbox_end={sbox_end} rem={len(data) - sbox_end}")
    print(f"[+] head after sbox: {bytes(data[:8])!r}")

    apply_tail_xor(data, sbox_end, XOR_KEYS)
    carve_and_write(data, OUT)

if __name__ == "__main__":
    main()
```

* * *

## 9\. 脱壳结果

| 文件  | 大小  | 类数  | 校验  |
| --- | --- | --- | --- |
| classes.dex | 11,232,568 | 9,131 | OK  |
| classes2.dex | 9,241,768 | 8,080 | OK  |
| classes3.dex | 8,583,896 | 8,993 | OK  |
| classes4.dex | 7,465,624 | 7,414 | OK  |
| classes5.dex | 8,014,876 | 6,509 | OK  |
| classes6.dex | 8,902,984 | 10,491 | OK  |
| classes7.dex | 8,327,956 | 8,902 | OK  |
| classes8.dex | 9,747,432 | 9,645 | OK  |
| classes9.dex | 5,006,148 | 5,314 | OK  |
| classes10.dex | 1,482,400 | 1,656 | OK  |
| **合计** | **~78 MB** | **76,135** | 全部通过 |

明文 DEX 中可直接检索到与钱包相关的字符串，例如： `tokenbank` 、 `TokenPocket` 、 `mnemonic` 、 `PrivateKey` 、 `clipboard` 、 `Accessibility` 等，后续恶意行为分析可直接基于 `dex_out` 。

* * *

## 10\. 工作区文件一览

```
E:\恶意app2号\_unpack_tmp\so_dump\
├── dump_libexec_mem.py
├── decrypt_icache_final.py
├── libexec_base.txt
├── libexec_dumped.so
├── libexec_sofixer.so
├── i_cache.bin
├── i8ce7a86c2c908100.bin
├── maps_full.txt
├── piece_0.bin ... piece_3.bin
└── dex_out\
    ├── classes.dex
    ├── classes2.dex
    └── ... classes10.dex
```

* * *

## 11\. 复现步骤（精简）

```dockerfile
# 1) 启动样本
adb shell am force-stop vip.mytokenpocket
adb shell monkey -p vip.mytokenpocket -c android.intent.category.LAUNCHER 1
# wait 15s

# 2) dump 已解压 libexec
python dump_libexec_mem.py
# 读取 libexec_base.txt

# 3) 修复 SO
SoFixer_x64.exe -s libexec_dumped.so -o libexec_sofixer.so -m <基址> -d

# 4) 拉缓存
adb shell su -c "cp /data/data/vip.mytokenpocket/files/i8ce7a86c2c908100 /data/local/tmp/i_cache.bin"
adb shell su -c "chmod 644 /data/local/tmp/i_cache.bin"
adb pull /data/local/tmp/i_cache.bin .\i_cache.bin

# 5) 解 DEX（换样本先重推 KEY_BYTE / XOR_KEYS）
python decrypt_icache_final.py
```

* * *

## 12\. 经验总结

1.  **双层壳要分层处理** ：Java stub → `libexec` UPX → `ijiami.dat` / 缓存内层算法，不要指望一次静态反编译看完。
    
2.  **dump SO 必须覆盖匿名可执行洞** ，否则 IDA 里仍是压缩桩。
    
3.  **SoFixer 的 `-m` 必须对应当次 ASLR 基址** 。
    
4.  **Frida 不是唯一选择** ：有 root 时，读 mem + 拉 `files/i*` 往往更稳。
    
5.  **密钥按样本重推** ： `KEY_BYTE` 、 `XOR_KEYS` 与包绑定，不能复用其它 APK 的常量。
    
6.  **校验修复顺序** ：先写 SHA-1 signature，再算 Adler32。
    
7.  业务分析阶段直接 JADX / GDA 打开 `dex_out` 即可；壳 SO 主要用于确认加载点与算法形态。
    

* * *

*本文仅用于恶意样本分析与安全研究，请遵守相关法律法规。*

[#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)
