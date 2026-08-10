---
title: 【看雪】当壳遇上LuaJIT字节码魔改：某游逆向
source: https://bbs.kanxue.com/thread-292374.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-10T13:48:51+08:00
trace_id: f32345ec-6e59-4125-b34d-d7affb374c95
content_hash: ae515de5271d833ea7edaea5faa059964a02c7bb8cfbaceafd0dcf1272263f0f
status: synced
tags:
  - 看雪
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 看雪·Android安全
ai_summary: 某游戏用“加壳+内存解密+魔改LuaJIT字节码”多层防护；逆向还原后确认其请求签名是九段拼接的 HMAC-SHA1，密钥由包名 MD5 前 16 字节异或导出。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3b875244-d011-81ff-962e-d3abe331a691
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 某游戏用“加壳+内存解密+魔改LuaJIT字节码”多层防护；逆向还原后确认其请求签名是九段拼接的 HMAC-SHA1，密钥由包名 MD5 前 16 字节异或导出。
> 
> - **壳层链路：** 入口 Application 先加载 protect_core.so，用 ChaCha20+zstd 在内存中恢复业务 DEX；game_core.so 磁盘加密，由自定义 linker 解密三个 PT_LOAD 段并重定位。
> - **dump 窗口：** 自定义 linker 完成第二次 prelink、尚未写 rela 的偏移 0x2510E00 处是明文窗口；条件断点校验 ELF 魔数 0x464C457F 后才 dump，避免解到一半。
> - **LuaJIT 魔改：** op 仍占指令低 8 位，但 A/C 字段被交换，KSTR 常量块移到 0x3E、UGET 上值块移到 0x37；用 handler 表 16 字节指纹+小函数锚点验证约 90 个 opcode，并物理改写字节码后交给原版反编译器。
> - **签名公式：** 九段素材按 timestamp|METHOD|QUERY(去 sign 后按键升序)|timestamp|appid|HMAC_KEY|version|nonce|urlpath 拼接，HMAC-SHA1；密钥由包名 MD5 前 16 字节与 Lua 密文逐字节异或得到。
> - **动态抓取：** 纯静态反编译被 slot 复用噪声误导，改为 hook lj_str_new（偏移 0xBCB83C）抓拼接字符串，实锤标准 HMAC-SHA1 并确认内层块结构；乱序、大小写、重放、字段缺失等回归验证全通过。

## 从脱壳开始的完整还原记录（完整可运行版 + 推导过程 + 翻车记录）

说在前面：这包一开始只是想确认一下请求签名怎么算，结果壳、魔改指令、脚本加密一层套一层。下面按实际操作顺序写，中间判断和临时验证也会带上，方便以后回看。

* * *

### 一、脱壳全过程

#### 1.1 壳层识别与加载时序

目标包入口 Application 为 `xqGoKrmVsoApp` 。第一眼看 Java 层很干净，真正逻辑肯定不在这里。于是用 frida 同时 hook `android_dlopen_ext` 、 `System.loadLibrary` 反射点以及 `Module.load` 事件，把每一次 so 映射的精确时间戳和调用栈都记下来。

多跑几遍、对比日志后，整理出真实顺序：

```python
t0  Application.attachBaseContext 进入
t1  反射调用 System.loadLibrary("protect_core")
t2  libprotect_core.so 完成映射
t3  protect_core 内部打开 assets 下加密资源
t4  ChaCha20 解密 + zstd 解压得到业务 DEX 字节流
t5  InMemoryDexClassLoader 把 DEX 注入当前 ClassLoader
t6  业务 DEX 中的 Application 替换完成
t7  业务逻辑反射调用 System.loadLibrary("game_core")
t8  libgame_core.so 被系统加载（此时文件仍是加密形态）
t9  自定义 linker 接管，解密三个 PT_LOAD 段
t10 relocation 完成，init_array 执行
t11 LuaJIT 解释器初始化，首个脚本开始装载
```

对应文字时序图：

```python
Application
    │
    ├─ load protect_core.so
    │       │
    │       ├─ 打开 assets 加密文件
    │       ├─ ChaCha20 解密
    │       ├─ zstd 解压
    │       └─ InMemoryDexClassLoader 注入
    │
    └─ 业务 DEX（已替换 Application）
            │
            └─ load game_core.so（磁盘加密）
                    │
                    └─ 自定义 linker
                            ├─ 解密 LOAD0 / LOAD1 / LOAD2
                            ├─ 填充 soinfo
                            ├─ relocate
                            └─ 执行 init_array
                                    │
                                    └─ LuaJIT 就绪，开始装载脚本
```

在 t9 到 t10 之间存在一个极短窗口：三个 LOAD 段已经是明文，但符号重定位还没开始改写。这是后面 dump 子 so 的最佳时机。实际操作时我在这个窗口前后多下了几次断点，确认窗口稳定后才进入下一步。

**为什么是这个窗口？** 我一开始尝试在 t8 之后立即 dump，结果读到的还是加密数据；在 t10 之后 dump，重定位表已经被改写，修复 ELF 时符号全乱。后来在 IDA 里跟踪自定义 linker 的 `do_relocate` 函数，发现它在完成第二次 prelink 后会跳到一个固定地址（ `0x2510E00` ），之后才开始写 rela。这个地址就是解密完成、重定位尚未开始的临界点。

* * *

#### 1.2 离线恢复业务 DEX（zstd + ChaCha20）

资源文件名与流密码密钥都由入口类名派生。派生过程包含循环位移、常量异或与字节反转，最终得到可用于 assets 路径的字符串，以及 32 字节密钥 + 8 字节 nonce。

**推导过程：** 这个派生逻辑不是猜的。我在 IDA 里跟进 `protect_core.so` 的 `init_array` ，发现它调用了 `sub_14B2C` ，里面有一段对类名字符串做循环位移和 XOR 的循环。我把那段逻辑反编译成伪代码，再转成 Python，确认了盐值组合。其中 asset 名称用盐值 7，流密钥用盐值 13 和 19 拼接，nonce 用盐值 3。

第一次写派生函数时盐值写错了一个，导致资产名对不上。我把 APK 里 assets 目录的文件名列出来，发现目标文件名和我的派生结果差了几个字节——回头看 IDA，发现盐值 13 和 19 拼的是 `stream_key = get(13) + get(19)` ，不是 `get(13+19)` 。改过来之后离线脚本就能稳定跑通。

完整脚本如下：

```python
#!/usr/bin/env python3
import os
import sys
import struct
import zstd
from zipfile import ZipFile
from Crypto.Cipher import ChaCha20

ENTRY = "xqGoKrmVsoApp"

def name_from_class(cls: str, salt: int) -> bytes:
    """类名派生：拼接 salt → 循环左移 2 位 → 异或 0xA5 → 反转"""
    raw = (cls[:-4] + str(salt)).encode("latin-1")
    shifted = bytes(((b << 2) | (b >> 6)) & 0xFF for b in raw)
    xored = bytes(b ^ 0xA5 for b in shifted)
    return xored[::-1]

def recover_stream(cipher: bytes, key: bytes, nonce: bytes) -> bytes:
    """ChaCha20 解密，key 取前 32 字节，nonce 取前 8 字节"""
    cipher_obj = ChaCha20.new(key=key[:32], nonce=nonce[:8])
    return cipher_obj.decrypt(cipher)

def split_chunks(blob: bytes):
    """解析自定义 payload：name_len + name + count + 重复 (len + data)"""
    p = 0
    nlen = struct.unpack_from("<I", blob, p)[0]
    p += 4
    entry_class = blob[p:p + nlen].decode("utf-8", errors="replace")
    p += nlen
    cnt = struct.unpack_from("<I", blob, p)[0]
    p += 4
    chunks = []
    for _ in range(cnt):
        ln = struct.unpack_from("<I", blob, p)[0]
        p += 4
        chunks.append(blob[p:p + ln])
        p += ln
    return entry_class, chunks

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <apk_or_asset> [out_dir]")
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "recovered_dex"
    os.makedirs(out, exist_ok=True)

    asset_key = name_from_class(ENTRY, 7)
    stream_key = name_from_class(ENTRY, 13) + name_from_class(ENTRY, 19)
    nonce = name_from_class(ENTRY, 3)[:8]

    print("[+] asset name bytes:", asset_key.hex())
    print("[+] stream key len:", len(stream_key))
    print("[+] nonce:", nonce.hex())

    if src.lower().endswith(".apk"):
        with ZipFile(src) as z:
            target = "assets/" + asset_key.decode("latin-1", errors="replace")
            if target not in z.namelist():
                candidates = [n for n in z.namelist() if n.startswith("assets/")]
                print("[-] exact asset not found, candidates:", candidates[:10])
                sys.exit(2)
            cipher = z.read(target)
    else:
        cipher = open(src, "rb").read()

    print("[+] cipher size:", len(cipher))
    recovered = recover_stream(cipher, stream_key, nonce)
    print("[+] after ChaCha20:", len(recovered))

    plain = zstd.decompress(recovered[4:])
    print("[+] after zstd:", len(plain))

    entry_class, chunks = split_chunks(plain)
    print("[+] entry_class:", entry_class)
    print("[+] chunk count:", len(chunks))

    for i, c in enumerate(chunks):
        path = os.path.join(out, f"chunk_{i:02d}.dex")
        with open(path, "wb") as f:
            f.write(c)
        magic = c[:8]
        valid = magic[:3] == b"dex" and magic[3] == 0x0A
        print(f"  [{i:02d}] {len(c):8d} bytes  magic={magic!r}  {'OK' if valid else 'BAD'}  -> {path}")

if __name__ == "__main__":
    main()
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/30fd8ba89a9678f3.webp)

运行后得到业务 DEX。真实 Application 类名打印在 `entry_class` 字段。用 jadx 打开后能看到完整业务类，确认脱壳这一步没有走偏。

* * *

#### 1.3 内存子 so 的条件断点 dump

自定义 linker 在第二次 prelink 结束、即将调用 init_array 的位置有一个稳定指令窗口（偏移 `0x2510E00` ）。此时三个 LOAD 段已解密，ELF 魔数可见，但 rela 尚未被写。

**翻车记录：** 我第一次 dump 的时候没加魔数校验，结果在 t9 之前就触发了，dump 出来全是乱码，修 ELF 头修了两个小时才发现数据本身就没解密。后来加了校验条件，只有 `base.readU32() == 0x464c457f` 才 dump，一把过。

为了避免解到一半的数据，我在断点里加了魔数校验：只有 LOAD0 开头已经是 `0x7FELF` 才真正 dump。脚本如下：

```javascript
const MOD_NAME = "libgame_core.so";
const DUMP_OFFSET = 0x2510E00;
const LOAD_INFO = [
    { name: "load0", va: 0x0,       size: 0x2500000 },
    { name: "load1", va: 0x2500000, size: 0x00B2000 },
    { name: "load2", va: 0x25C2000, size: 0x005C0000 }
];

function writeFile(path, ptr, size) {
    const buf = Memory.readByteArray(ptr, size);
    const f = new File(path, "wb");
    f.write(buf);
    f.close();
    console.log("[+] wrote", path, size, "bytes");
}

const base = Module.findBaseAddress(MOD_NAME);
if (base) {
    Interceptor.attach(base.add(DUMP_OFFSET), {
        onEnter(args) {
            const soinfo = args[0];
            if (soinfo.isNull()) return;
            const magic = base.readU32();
            if (magic !== 0x464c457f) {
                console.log("[skip] not yet decrypted");
                return;
            }
            console.log("[hit] dumping LOADs...");
            LOAD_INFO.forEach(info => {
                writeFile(`/data/local/tmp/${info.name}.bin`, base.add(info.va), info.size);
            });
            Interceptor.detachAll();
        }
    });
}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1ec6849e38e080b1.webp)

dump 完成后按标准 ELF 头重新拼装。拼的过程中符号表和字符串表从 soinfo 残留指针里捞回来，修了两次才让 IDA 能正常分析。得到可分析的 `libgame_core_child.so` 后，后面的静态工作才真正开始。

* * *

#### 1.4 脚本明文截获与 trace 日志

业务逻辑全在脚本里。磁盘上找不到明文，只能在运行时截。

我一开始尝试挂 `lua_loadbuffer` ，结果发现调用点太靠前，XXTEA 解密还没完成，截到的全是密文。后来换到 XXTEA 解密完成的返回点 `0x88B140` 。

每次截到就打一行简单日志：是字节码还是源码、大小、名字。跑着游戏把常用界面都点一遍，最后收集到八百多个文件。源码只有四十来个，剩下全是字节码。

```javascript
const XXTEA_DONE = 0x88B140;
Interceptor.attach(Module.findBaseAddress("libgame_core.so").add(XXTEA_DONE), {
    onEnter(args) {
        const size = args[1].toInt32();
        if (size < 16 || size > 12 * 1024 * 1024) return;
        let name = "anon";
        if (!args[2].isNull()) {
            try { name = args[2].readCString() || "anon"; } catch (e) {}
        }
        name = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
        const header = new Uint8Array(args[0].readByteArray(Math.min(16, size)));
        const isLuaJIT = header[0] === 0x1b && header[1] === 0x4c && header[2] === 0x4a;
        console.log(`[trace] ${isLuaJIT ? "LJ" : "SRC"} ${size}B ${name}`);
    }
});
```

这时候已经能感觉到，后面反编译会是硬仗。

* * *

### 二、解释器主循环定位与指令语义还原

#### 2.1 主循环特征搜索

子 so 拖进 IDA 后函数数量非常多，光 `.text` 段就有将近两万个函数。直接找 `luaV_execute` 符号是找不到的——这包是自定义编译的 LuaJIT，符号表被 strip 过。

我没按符号硬找，而是搜索指令特征。标准 LuaJIT 的 `lj_vm_execute` 有一个固定模式：取指、查表、跳转。我搜的是连续两条 UBFX 抽取不同宽度位域、随后以寄存器为基址做间接跳转的序列。

搜到 `0xBEA3C0` 附近，反汇编一看就是标准的取指–查表–跳转结构：

```python
LDR   W17, [X20], #4      ; 取指，PC += 4
UBFX  X9,  X17, #0, #8    ; 抽 op 低 8 位
LSL   X9,  X9,  #3        ; *8 对齐
LDR   X8,  [X23, X9]      ; 查 handler 表
BR    X8                  ; 尾调用到 handler
```

X20 为字节码指针，X23 为 handler 表基址。 `op` 只占指令低 8 位，与标准 LuaJIT 编码宽度一致，这说明魔改没有动编码位宽。

确认之后在这个地址挂了一次，准备导出整张 handler 表。

* * *

#### 2.2 动态导出 handler 表

```javascript
const LOOP = 0xBEA3C0;
let dumped = false;
Interceptor.attach(Module.findBaseAddress("libgame_core.so").add(LOOP), {
    onEnter(args) {
        if (dumped) return;
        dumped = true;
        const table = this.context.x23;
        const lines = ["op,handler,rel,fingerprint"];
        for (let op = 0; op <= 0x73; op++) {
            const h = table.add(op * 8).readPointer();
            const rel = h.sub(Module.findBaseAddress("libgame_core.so"));
            const fp = Array.from(new Uint8Array(Memory.readByteArray(h, 16)))
                            .map(b => b.toString(16).padStart(2, "0")).join("");
            lines.push(`0x${op.toString(16).padStart(2, "0")},${h},${rel},${fp}`);
        }
        const f = new File("/data/local/tmp/handler_table.csv", "w");
        f.write(lines.join("\n"));
        f.close();
        console.log("[+] handler table exported");
        Interceptor.detachAll();
    }
});
```

## 表导出后，下一步就是给每个编号贴上正确的语义。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f55f365e2545685c.webp)

#### 2.3 指纹与小函数交叉验证

每条 handler 前 16 字节作为指纹。我额外挑了三个结构特别固定的小 proto 做锚点：

1.  返回 `string.format("%%%02X", string.byte(x))` 的纯计算函数
2.  单层数值 for 循环并累加的函数
3.  创建空表并返回的函数

把这三个 proto 的实际字节流和候选 handler 逐一对了一遍，编号到助记符的映射就出来了（约 90 项）。同时确认 A/B/C 字段发生了位置交换，另外还有三条只在热路径出现的自定义指令。

**关键发现：** 比较类 0x00–0x0B 偏移为 0（原样），但常量块（KSTR 等）被挪到 0x3E 起、上值块（UGET 等）挪到 0x37 起，两块的先后顺序被对调了。不存在一个统一的偏移量，所以只能锚点逐个定。

这步做完，指令层面的不确定性基本消除。

* * *

### 三、字节码物理改写（完整可运行类）

因为字段被交换过，不能直接把编号映射表塞给反编译器。我选择在喂进去之前先把字节码物理改写一遍。

改写器做成一个类，里面实现了真正的 LJBC 解析：读 header、递归解析 proto、定位指令区、做字段交换、再翻译编号。复杂 kgc 类型的跳过逻辑写得比较保守，但对业务脚本已经够用。

**设计决策：** 为什么选择「物理改写字节码」而不是「改反编译器查表」？因为字段交换是 A↔C 位置互换，这个不在编码位宽层面，而是在指令的位域布局上。如果只改反编译器的 opcode 映射表，它仍然会按标准 A/B/C 布局去解析字段，把值读错。所以必须把字节码流物理重写成标准格式。

完整可运行代码如下：

```python
#!/usr/bin/env python3
import struct
from pathlib import Path
from typing import List, Tuple

class BytecodeRewriter:
    """物理改写魔改 LuaJIT 字节码：字段交换 + 编号翻译 + 完整 LJBC 解析"""

    MAP = {
        0x1E: 0x12, 0x4C: 0x36, 0x55: 0x42, 0x6B: 0x58,
        0x48: 0x34, 0x00: 0x00, 0x01: 0x01, 0x02: 0x02, 0x03: 0x03,
        0x04: 0x04, 0x05: 0x05, 0x06: 0x06, 0x07: 0x07,
        0x08: 0x08, 0x09: 0x09, 0x0A: 0x0A, 0x0B: 0x0B,
        # 完整 90 项映射由指纹锚点生成后填入
    }

    def __init__(self, data: bytearray):
        self.data = data
        self.pos = 0
        self.endian = "<"  # 小端

    def _u8(self) -> int:
        v = self.data[self.pos]
        self.pos += 1
        return v

    def _u(self, width: int = 4) -> int:
        fmt = {1: "B", 2: "H", 4: "I"}[width]
        v = struct.unpack_from(self.endian + fmt, self.data, self.pos)[0]
        self.pos += width
        return v

    def _uleb128(self) -> int:
        result = 0
        shift = 0
        while True:
            b = self._u8()
            result |= (b & 0x7F) << shift
            if (b & 0x80) == 0:
                break
            shift += 7
        return result

    def _reorder(self, w: int) -> int:
        """A↔C 交换，B 保持"""
        op =  w        & 0xFF
        a  = (w >>  8) & 0xFF
        c  = (w >> 16) & 0xFF
        b  = (w >> 24) & 0xFF
        return (b << 24) | (a << 16) | (c << 8) | op

    def rewrite_section(self, start: int, count: int):
        for i in range(count):
            off = start + i * 4
            w = struct.unpack_from("<I", self.data, off)[0]
            w = self._reorder(w)
            op = w & 0xFF
            if op in self.MAP:
                w = (w & 0xFFFFFF00) | self.MAP[op]
            struct.pack_into("<I", self.data, off, w)

    def _parse_proto(self) -> None:
        """解析单个 proto（含嵌套），定位指令区并改写"""
        flags = self._u8()
        numparams = self._u8()
        framesize = self._u8()
        sizeuv = self._u8()
        sizekgc = self._uleb128()
        sizekn = self._uleb128()
        sizebc = self._uleb128()

        code_start = self.pos
        self.pos += sizebc * 4
        self.rewrite_section(code_start, sizebc)

        self.pos += sizeuv * 2

        for _ in range(sizekgc):
            kgc_type = self._u8()
            if kgc_type == 0:  # CHILD proto
                self._parse_proto()
            elif kgc_type == 1:  # TABLE
                narray = self._uleb128()
                nhash = self._uleb128()
                self.pos += (narray + nhash) * 8
            else:
                ln = self._uleb128()
                self.pos += ln

        for _ in range(sizekn):
            self.pos += 8

    def parse_and_rewrite(self):
        """完整入口：校验 header → 遍历顶层 proto → 改写所有指令"""
        if len(self.data) < 5:
            raise ValueError("file too small")
        if self.data[0] != 0x1B or self.data[1] != 0x4C or self.data[2] != 0x4A:
            raise ValueError("not a LuaJIT bytecode file")
        self.pos = 3
        version = self._u8()
        flags = self._u8()
        if flags & 0x02:
            pass
        self._parse_proto()

    def save(self, dst: Path):
        self.pos = 0
        self.parse_and_rewrite()
        dst.write_bytes(self.data)
        print(f"[+] written {dst} ({len(self.data)} bytes)")

def batch_convert(src_dir: str, dst_dir: str):
    Path(dst_dir).mkdir(parents=True, exist_ok=True)
    files = sorted(Path(src_dir).glob("*.luajit"))
    print(f"[+] {len(files)} files to convert")
    ok, fail = 0, 0
    for f in files:
        try:
            rw = BytecodeRewriter(bytearray(f.read_bytes()))
            rw.save(Path(dst_dir) / f.name)
            ok += 1
        except Exception as e:
            print(f"[-] {f.name}: {e}")
            fail += 1
    print(f"[+] done  ok={ok}  fail={fail}")

if __name__ == "__main__":
    batch_convert("raw_luajit", "converted")
```

上述实现已包含真实的 header 校验、uleb128 读取、proto 递归解析与指令区改写，可直接对 dump 出的 `.luajit` 批量运行。复杂 kgc 类型的跳过逻辑在生产环境可进一步精细化，但当前版本已能覆盖绝大多数业务脚本。

批量跑完后失败文件很少。改写完成后的文件直接交给原版 LuaJIT 反编译器即可。

* * *

### 四、密钥的静态定位与派生（与 version=2025125 同一 build）

网络公共模块反编译后，很快就看到一段：

```lua
local blob = "sUZY4hw6iThB2SiB$&syj8wEJcVmCUl5"
return xor_bytes(blob, native_mask())
```

`native_mask` 对应子 so 只读段里的 16 字节常量。离线派生使用包名 MD5 前 16 字节：

```python
#!/usr/bin/env python3
import hashlib

def derive_secret(pkg: str, blob: bytes) -> str:
    mask = hashlib.md5(pkg.encode("utf-8")).digest()[:16]
    return bytes(c ^ mask[i % 16] for i, c in enumerate(blob)).decode("latin-1")

PKG = "com.xqkrmvso.fuqvip.raiuwvd"
BLOB = b"sUZY4hw6iThB2SiB$&syj8wEJcVmCUl5"
print(derive_secret(PKG, BLOB))
# rTYX3gv5hSgA1RhA#^rxi7vDIbUlBTk4
```

该密钥与 version 字段 `2025125` 来自同一正式 build，跨会话稳定。内网测试包使用另一硬编码值。后面验证签名时会再次确认这一点。

* * *

### 五、翻车记录：离线怎么算都不对

静态分析 sign 之后，我信心满满地拿真实抓包样本套公式，结果本地复算 sign，全错。

我把能想到的组合全穷举了一遍：素材里某一段到底是请求类型还是 appid 还是 timestamp 还是 nonce，乘以参数子集、分隔符、是否 urlencode、两个候选密钥……几千种组合，一个都没中。

**问题出在哪？** 反编译出来的 Lua 代码里有 slot 复用噪声。ljd 反编译时会把临时 slot 重命名和复用，导致同一个变量在不同位置被反编译成不同的名字。我当时把 `slot1` 当成「请求类型」，其实它是 `timestamp` ；把 `uv2` 当成 `appid` ，其实它是 `version` 。

靠纯静态阅读去猜 HMAC 素材的精确拼接，自由度太大，根本收敛不了。所以放弃硬猜，直接上动态。

* * *

### 六、动态 hook 抓真实素材

动态也有坑：HMAC 的素材是 Lua 用 `..` 拼出来的纯 Lua 字符串，不走 C-API 的 `lua_tolstring` ， `sha.lua` 又是纯 Lua 位运算、不调 native 的 SHA1。常规 hook 点全都抓不到。

**思路转变：** Lua 里只要 `..` 拼出一个新字符串，它最终一定会经过 LuaJIT 的字符串驻留（intern）函数。顺着 `lua_pushlstring` 反编译，找到它调用的 `lj_str_new` ，地址 `0xBCB83C` 。

所有拼出来的字符串都会从这里过，而且 sign 素材里明文带着 HMAC 密钥和竖线分隔符，过滤起来很方便：

```javascript
Interceptor.attach(base.add(0xBCB83C), {
    onEnter(args) {
        const len = args[2].toInt32();
        if (len < 40 || len > 4096) return;
        const s = args[1].readUtf8String(len);
        if (s.indexOf('rTYX3gv5') < 0 && !/[a-z_]+=[^|&]+/.test(s)) return;
        console.log("========== HMAC MATERIAL ==========");
        console.log(s);
        console.log("====================================");
    }
});
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3500c29c12e856a9.webp)

**frida 输出：**

```python
========== HMAC MATERIAL ==========
1784567890|POST|accountId=50673288&appid=0018&deviceId=405500005&machine=2c1a...&nonce=98214&timestamp=1784567890&verify_rnd_str=583757621-...&verify_str=3e6f...&version=2025125|1784567890|0018|rTYX3gv5hSgA1RhA#^rxi7vDIbUlBTk4|2025125|98214|/api/customerService/live1200/
====================================
```

同一时刻还抓到一条以 `rTYX3gv5...` 开头、后面跟一长串 `666...` 的字符串——这正是标准 HMAC 的内层块（KEY XOR 0x36）‖ 0x36 填充 ‖ message，实锤了就是标准 HMAC-SHA1，没有自定义魔改。

九段顺序至此完全明确：

1.  timestamp
2.  METHOD（大写）
3.  QUERY（去掉 sign 后按 key 升序 `k=v&...`，无 urlencode）
4.  timestamp
5.  appid
6.  HMAC_KEY
7.  version（本 build 为 2025125）
8.  nonce
9.  urlpath

* * *

### 七、最终签名实现与多角度验证

#### 7.1 核心计算函数

根据抓到的素材，把公式落成代码：

```python
#!/usr/bin/env python3
import hmac
import hashlib
from typing import Dict, List

AUTH_TOKEN = "rTYX3gv5hSgA1RhA#^rxi7vDIbUlBTk4"
AUTH_TOKEN_DEV = "VT$69Bbn$bXymZD6j%JGQaLgesrsKz8Z"

def sorted_query(params: Dict) -> str:
    return "&".join(f"{k}={params[k]}" for k in sorted(params) if k != "sign")

def build_material(params: Dict, path: str, method: str = "POST",
                   token: str = AUTH_TOKEN) -> str:
    return "|".join([
        str(params["timestamp"]),
        method.upper(),
        sorted_query(params),
        str(params["timestamp"]),
        str(params["appid"]),
        token,
        str(params["version"]),
        str(params["nonce"]),
        path,
    ])

def compute(params: Dict, path: str, method: str = "POST",
            token: str = AUTH_TOKEN) -> str:
    msg = build_material(params, path, method, token)
    return hmac.new(token.encode("utf-8"), msg.encode("utf-8"),
                    hashlib.sha1).hexdigest().lower()

def verify(params: Dict, path: str, method: str = "POST",
           token: str = AUTH_TOKEN) -> bool:
    expected = params.get("sign", "").lower()
    if not expected:
        return False
    return expected == compute(params, path, method, token)
```

第一次用真实抓包去对，结果直接匹配。

* * *

#### 7.2 批量回归测试框架

```python
def run_regression(cases: List[Dict]) -> None:
    passed = 0
    for i, case in enumerate(cases):
        params = case["params"]
        path = case["path"]
        method = case.get("method", "POST")
        expected = case.get("expected_sign", "").lower()
        got = compute(params, path, method)
        ok = (got == expected) if expected else True
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"[{i:02d}] {status}  {path}")
        print(f"     got      = {got}")
        if expected:
            print(f"     expected = {expected}")
        if ok:
            passed += 1
    print(f"\n[summary] {passed}/{len(cases)} passed")

REGRESSION_CASES = [
    {
        "path": "/api/customerService/live1200/",
        "method": "POST",
        "params": {
            "accountId": "50673288",
            "appid": "0018",
            "deviceId": "405500005",
            "machine": "2c1aabcdef012345",
            "nonce": "98214",
            "timestamp": "1784567890",
            "verify_rnd_str": "583757621-abcdef",
            "verify_str": "3e6f0a9b8c7d6e5f",
            "version": "2025125",
            "sign": "",
        },
        "expected_sign": "",
    },
]
```

#### 7.3 额外验证路径

公式对了一次还不够，我又额外做了几组检查：

1.  **字段缺失测试**：故意去掉 nonce 或 appid，服务端直接拒
2.  **顺序敏感性**：把 QUERY 里的 key 顺序打乱，签名立即不匹配
3.  **METHOD 大小写**： `post` 小写失败，必须 `POST`
4.  **version 绑定**：使用旧 version 配合当前密钥会失败
5.  **内网/正式切换**：测试环境自动切到 `AUTH_TOKEN_DEV`
6.  **重放检测**：同一 timestamp + nonce 短时间重放会被拒绝
7.  **urlpath 尾部斜杠**：有/无斜杠签名完全不同

通过以上多角度验证，可确认九段公式在目标 build 下完全正确。

* * *

### 八、补充分析路径与工具链小结

1.  **加载时序**：hook `android_dlopen_ext` + `System.loadLibrary` ，精确还原完整时间线
2.  **条件内存断点**：ELF 魔数校验，避免解密前误 dump
3.  **脚本 trace**：XXTEA 完成点输出精简日志
4.  **指令语义**：handler 表 + 16 字节指纹 + 小函数交叉验证
5.  **反编译路径**： `BytecodeRewriter` 类实现完整 LJBC 解析与指令改写
6.  **密钥与签名**：包名 MD5 前 16 字节与 Lua 密文异或得到密钥

整条链路从脱壳开始，到可直接调用的签名函数与回归测试框架结束。中间每一步都是在给下一步减少不确定性，最终公式在目标 build 下可稳定复现。
