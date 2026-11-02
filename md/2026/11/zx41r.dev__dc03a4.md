---
title: zx41r.dev
source: https://zx41r.dev/posts/fddr1p/
source_host: zx41r.dev
clip_date: 2026-11-02T10:50:14+08:00
trace_id: fd1ea70a-9e8c-427f-8b26-a62c9c0e7115
content_hash: ec4b09109958d56e6c30e4a83f18aa2508fb38f3a2af52ae7830132c1a1d5dd6
status: synced
tags:
  - CTF
  - 反调试
series: null
feed_source: zx41r·恶意软件/逆向
ai_summary: vault 是一道 Linux CTF 逆向题：程序用 XOR 混淆的反调试与代码自校验拦截调试器，并用 memfd_create 派生一个 ptrace 守护进程抢占追踪位，真正的 AES 密钥藏在守护进程堆上。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 40c75244-d011-81d9-b5dc-cbb6dbf98726
ioc:
  cves: []
  cwes: []
  hashes:
    - 5096f9ab0498f1820b69be07edd118e551594f09
    - c16a5fa0dc9afa637d6f53511f46fa859347ae8d6c7a54568b614d9827656f26
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> vault 是一道 Linux CTF 逆向题：程序用 XOR 混淆的反调试与代码自校验拦截调试器，并用 memfd_create 派生一个 ptrace 守护进程抢占追踪位，真正的 AES 密钥藏在守护进程堆上。
> 
> - **双重防护：** gate1 用 XOR 0x5a 运行时解码 `/proc/self/status` 的 `TracerPid:` 检查（故 strings 无痕迹）；gate2 对自身调用 gate1 的 16 字节代码做 FNV-1a 校验（期望 0x0BE52AF9），gdb 软件断点写入的 0xCC 会让哈希失配，需在 continue 前 delete（而非 disable）断点。
> - **无文件守护进程：** 通过检查后，vault 用 0x17C42A9F 循环 XOR 解码内嵌 payload，经 memfd_create + fexecve 直接从匿名 fd 启动子进程（磁盘上无第二个文件），父进程再 `prctl(PR_SET_PTRACER=0x59616D61, child)`，让 Yama 受限模式下子进程合法追踪父进程。
> - **追踪位被占：** ptrace 每个进程仅允许一个 tracer，root 也绕不过，`gdb -p vault` 返回 Operation not permitted；正确思路是附加到无人追踪的守护进程（PID 1162）。
> - **密钥获取：** 守护进程堆上 0x30 chunk 即 32 字节 AES-256 密钥；从 `/proc/<pid>/exe` dump 的 .rodata 只是半个密钥，另一半是守护进程 seize vault 后用 process_vm_readv 读取的，拿不到完整密钥解密必然 InvalidTag。
> - **解密：** flag.enc 为 12 字节 nonce + AES-256-GCM 密文，用堆上密钥解出 `itc{fddr1p_s31z3_th3_s1bl1ng_dr41n_1ts_h34p}`。

you get two files, `vault` and `flag.enc`. no source, no remote, you run it on your own box.

```bash
$ file ./vault
./vault: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked,
interpreter /lib64/ld-linux-x86-64.so.2, BuildID[sha1]=5096f9ab0498f1820b69be07edd118e551594f09,
for GNU/Linux 3.2.0, stripped

$ checksec ./vault
```

![vault checksec](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/81f44636b1d93fae.png)

stripped PIE, full RELRO, canary, NX, SHSTK, IBT

stripped PIE with everything turned on. `strings ./vault` gives you nothing useful: no `/proc`, no `TracerPid`, no flag format.

so just run it, no debugger, and look at it from outside.

```bash
$ ./vault &
[1] 1161

$ cat /proc/1161/status | grep -i TracerPid
```

![TracerPid already points somewhere](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2f95c7c6687838ae.png)

vault (1161) is already traced by 1162

half a second in and `vault` is already being traced, by pid 1162, which we didn’t start. so there’s a second process, and it grabbed the ptrace slot before we could. keep that in mind, the whole challenge is built around it.

## the two gates

into IDA to see what runs before that second process appears. two functions decide whether you get anywhere.

sub_144E (gate1)

```c
_BOOL8 sub_144E()
{
  int v1; // [rsp+Ch] [rbp-154h]
  FILE *stream; // [rsp+10h] [rbp-150h]
  size_t n; // [rsp+18h] [rbp-148h]
  char s[16]; // [rsp+20h] [rbp-140h] BYREF
  char filename[32]; // [rsp+30h] [rbp-130h] BYREF
  char s1[264]; // [rsp+50h] [rbp-110h] BYREF
  unsigned __int64 v7; // [rsp+158h] [rbp-8h]

  v7 = __readfsqword(0x28u);
  sub_13A9("u*(59u)?6<u).;./)", 17, 90, filename);
  stream = fopen(filename, "r");
  if ( !stream )
    return 1;

  sub_13A9(&unk_2028, 10, 90, s);
  n = strlen(s);
  v1 = 0;
  while ( fgets(s1, 256, stream) )
  {
    if ( !strncmp(s1, s, n) )
    {
      v1 = atoi(&s1[n]);
      break;
    }
  }

  fclose(stream);
  return v1 != 0;
}
```

![gate1 decompile](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/618ba225623e7472.png)

sub_144E in IDA

this is why `strings` had nothing. both the path and the field name go through `sub_13A9`, a one-line xor with key `90` (`0x5a`). xor `"u*(59u)?6<u).;./)"` with `0x5a` and you get `/proc/self/status`. the second blob is `TracerPid:`. so `gate1` is the usual check: read your own status file, find `TracerPid:`, fail if it isn’t 0. if it can’t even open the file it also counts as traced.

\-note

`sub_13A9` runs every time `gate1` runs. the decoded strings only live in stack buffers for the length of the call, so you won’t find `"/proc/self/status"` sitting at some fixed address.

alone, this takes ten seconds to beat. break after the call, set `rax` to 0, done. we did exactly that while testing it. but nothing calls `gate1` directly.

sub_15FC (gate2)

```c
_BOOL8 sub_15FC()
{
  return sub_144E() || (unsigned int)sub_159F(&loc_1608, &loc_1618 - &loc_1608) != 199568121;
}
```

![gate2 decompile](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7ef0d6607414eaac.png)

gate2: call gate1, then hash its own call site

`gate2` calls `gate1`, then hashes its own code from `loc_1608` to `loc_1618` and compares against `199568121` (`0x0BE52AF9`).

sub_159F (checksum_range)

```c
__int64 __fastcall sub_159F(__int64 a1, unsigned __int64 a2)
{
  unsigned int v3; // [rsp+1Ch] [rbp-14h]
  unsigned __int64 i; // [rsp+20h] [rbp-10h]

  v3 = -2128831035;
  for ( i = 0; i < a2; ++i )
    v3 = 16777619 * (*(unsigned __int8 *)(a1 + i) ^ v3);

  return v3;
}
```

![checksum\_range decompile](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de4890207269c831.png)

FNV-1a: 0x811C9DC5 basis, 16777619 prime

FNV-1a. `-2128831035` is `0x811C9DC5` as unsigned, the offset basis, and `16777619` is the FNV prime. the 16 bytes it hashes are the call to `gate1` plus the `test` / `je` on its result, which is exactly where you’d put a breakpoint to patch the result. gdb’s breakpoint is a real `0xCC` written into the code, the hash reads that byte like any other, the value changes and `gate2` fails. no error message either, it exits silently just like when `gate1` fails.

\-tip

if you need a breakpoint inside a hashed range: hit it, patch what you need, then `delete` it before `continue`. delete, not disable, so gdb puts the original byte back before the hash runs.

get past both and `vault` moves on to the part that matters.

## a process with no file

sub_1661 (spawn_guardian_fileless)

```c
__int64 __fastcall sub_1661(int a1, __int64 a2)
{
  unsigned int i; // [rsp+18h] [rbp-98h]
  int fd; // [rsp+1Ch] [rbp-94h]
  unsigned int v5; // [rsp+24h] [rbp-8Ch]
  _BYTE *ptr; // [rsp+28h] [rbp-88h]
  char *envp; // [rsp+30h] [rbp-80h] BYREF
  int pipedes[2]; // [rsp+38h] [rbp-78h] BYREF
  char *argv[5]; // [rsp+40h] [rbp-70h] BYREF
  char buf; // [rsp+6Bh] [rbp-45h]
  int v11; // [rsp+6Ch] [rbp-44h]
  char s[16]; // [rsp+70h] [rbp-40h] BYREF
  char v13[40]; // [rsp+80h] [rbp-30h] BYREF
  unsigned __int64 v14; // [rsp+A8h] [rbp-8h]

  v14 = __readfsqword(0x28u);
  v11 = 398731935;
  ptr = malloc((unsigned int)n);
  if ( !ptr )
    return 0xFFFFFFFFLL;

  for ( i = 0; i < (unsigned int)n; ++i )
    ptr[i] = s[(i & 3) - 4] ^ byte_4040[i];

  fd = memfd_create(&unk_2082, 1);
  if ( fd >= 0 )
  {
    if ( write(fd, ptr, (unsigned int)n) == (unsigned int)n )
    {
      free(ptr);
      v5 = fork();
      if ( !v5 )
      {
        snprintf(s, 0x10u, "%d", a1);
        snprintf(v13, 0x20u, "%lx", a2);
        argv[0] = (char *)&unk_2082;
        argv[1] = s;
        argv[2] = v13;
        argv[3] = nullptr;
        envp = nullptr;
        fexecve(fd, argv, &envp);
        _exit(1);
      }

      close(pipedes[0]);
      prctl(1499557217, v5, 0, 0, 0);
      write(pipedes[1], "x", 1);
      close(pipedes[1]);
      close(fd);
      return v5;
    }
    else
    {
      free(ptr);
      close(fd);
      return 0xFFFFFFFFLL;
    }
  }
  else
  {
    free(ptr);
    return 0xFFFFFFFFLL;
  }
}
```

![spawn\_guardian\_fileless decompile](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/79dbc0ac325feb2b.png)

malloc, xor, memfd_create, write, fork, fexecve. no file path anywhere

this is why there’s no second binary next to `vault`.

`s[(i & 3) - 4]` reads weird, a negative index into `s` before anything is in it. look at the stack layout: `v11` is at `rbp-44h`, `s` at `rbp-40h`. `s[-4..-1]` is `v11`. IDA picked `s` as the base for the access, so you get a negative index, but what the loop really does is `((char *)&v11)[i & 3]`. the key is `398731935` = `0x17C42A9F`, bytes `9f 2a c4 17`, repeated over `byte_4040`.

\-note

`prctl(1499557217, ...)` is `0x59616D61`, which is ASCII **Yama**. it’s `PR_SET_PTRACER`, and the kernel really defines it that way. IDA has no kernel headers loaded, so it prints the number. whenever you see a weird decimal next to `prctl` or `ptrace`, convert it to hex and try reading it as text.

so in order: xor-decode the payload onto the heap, `memfd_create` an anonymous fd, `write` the payload into it, `fork`, child `fexecve` s straight from the fd. the parent calls `prctl(PR_SET_PTRACER, child)`. with Yama in restricted mode a process can only trace its own descendants, and the child wants to trace its parent, so `vault` has to allow that child explicitly.

the guardian never touches a filesystem path. it’s bytes in `vault` ’s data, then bytes in a memfd, then a running process.

## the obvious move doesn’t work

first thing anyone tries, attach gdb to `vault`:

```bash
$ gdb -q -p 1161
```

![gdb attach to vault denied](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b46cdcc1d47adb12.png)

already traced by process 1162. Operation not permitted

`warning: process 1161 is already traced by process 1162`. `ptrace: Operation not permitted.`

a process can have one tracer at a time, and root doesn’t change that. the guardian took the slot as soon as both gates passed, and it keeps it until it dies. so `vault` itself is off limits. attach to the guardian instead:

```bash
$ gdb -q -p 1162
```

nobody is tracing that one, so it attaches fine.

## the key is on the guardian’s heap

```plaintext
pwndbg> heap
```

![guardian heap layout](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/757e675e75651de6.png)

two chunks: 0x290 and 0x30

two chunks besides top. the `0x290` one is glibc’s tcache struct, ignore it. the `0x30` one is what we want: a 32-byte `malloc` plus the 8-byte header, rounded up to 16, gives exactly `0x30`. 32 bytes is also the size of an AES-256 key.

```plaintext
pwndbg> x/64xb 0x641ff3bfe290
```

![key chunk raw bytes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9ae652f493e56781.png)

chunk header, then 32 bytes of random-looking data

00000000c1 6a 5f a0 dc 9a fa 63 7d 6f 53 51 1f 46 fa 85.j\_....c}oSQ.F..0000001093 47 ae 8d 6c 7a 54 56 8b 61 4d 98 27 65 6f 26.G..lzTV.aM.'eo&

32 bytes, high entropy, nothing printable. that’s the AES-256 key.

there was a real hole here in an earlier build, so here’s how it got closed. `/proc/<guardian_pid>/exe` is readable by anyone with the same uid, no ptrace needed, so you can `cp` the guardian binary right out of `/proc`. then `objdump -s -j .rodata` on it:

0000000001 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00................00000010e4 03 a5 bf 36 93 6f 3a 94 8c 29 51 f5 ab 1b 40....6.o:..)Q...@000000207a 69 76 00 57 b3 8d ac db 5e e3 35 f3 a8 d8 e3ziv.W....^.5....

32 more high-entropy bytes, and you got them without attaching to anything. compare them with the key above, they share nothing. that’s only half of what it needs. the other half is in `vault` ’s memory, and the guardian reads it with `process_vm_readv` after it seizes `vault`. that read goes through the same Yama check that stopped our `gdb -p`. no seize, no second half, no key.

if you think the.rodata bytes are the key, try decrypting with them first.

## decrypt

solve.py

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

key = bytes.fromhex("c16a5fa0dc9afa637d6f53511f46fa859347ae8d6c7a54568b614d9827656f26")
data = open("flag.enc", "rb").read()
print(AESGCM(key).decrypt(data[:12], data[12:], None))
```

`flag.enc` is a 12-byte nonce, then the AES-256-GCM ciphertext with the tag at the end. with the right key it decrypts. with the wrong key you get `InvalidTag`, and GCM won’t hand you half-decrypted garbage either. there’s no `if (key_ok) print(flag)` to patch anywhere in the binary. you need the real key, and the only process holding it is the guardian.

flag: itc{fddr1p_s31z3_th3_s1bl1ng_dr41n_1ts_h34p}

## further reading

-   ptrace(2), `PTRACE_SEIZE` / `PTRACE_O_EXITKILL`: [man7.org/linux/man-pages/man2/ptrace.2.html](https://man7.org/linux/man-pages/man2/ptrace.2.html)
-   Yama and `PR_SET_PTRACER`: [kernel.org/doc/html/latest/admin-guide/LSM/Yama.html](https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html)
-   `memfd_create(2)`: [man7.org/linux/man-pages/man2/memfd_create.2.html](https://man7.org/linux/man-pages/man2/memfd_create.2.html)
-   `process_vm_readv(2)`: [man7.org/linux/man-pages/man2/process_vm_readv.2.html](https://man7.org/linux/man-pages/man2/process_vm_readv.2.html)
