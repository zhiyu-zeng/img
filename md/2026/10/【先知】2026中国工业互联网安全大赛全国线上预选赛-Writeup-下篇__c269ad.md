---
title: 【先知】2026中国工业互联网安全大赛全国线上预选赛 Writeup 下篇
source: https://xz.aliyun.com/news/92986
source_host: xz.aliyun.com
clip_date: 2026-10-20T15:53:36+08:00
trace_id: 17c2524b-109d-4307-8cbd-9c67974ecde2
content_hash: 3671fd2f56a8bb6bd4e3067776a47c362de3f2f1efc5d6055058067d721c2e2a
status: synced
tags:
  - 先知
  - CTF
  - 密码学
series: 【先知】2026中国工业互联网安全大赛全国线上预选赛 Writeup
feed_source: 先知安全技术社区
ai_summary: 2026 工业互联网安全大赛下篇的八类赛题中，反复出现的同一教训是：安全边界必须锚定真实内存尺寸和帧内校验，不能依赖输入文件声明、流量特征或题面直觉。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-81a1-906d-fb3557eb776a
ioc:
  cves: []
  cwes: []
  hashes:
    - 442e4f969fa3f9516b29d60b6c87756f
    - bdb106a0560c4e46ccc488ef010af787
    - c4fe3e6cd39fef123544a9ddd2118fb8
    - c6ecb7c0afaed4ec67864e35ec020b6f
    - d60f1850b090436d8d12726e7289e60afd3104cf57e701c38cf3efb526d2f103
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 2026 工业互联网安全大赛下篇的八类赛题中，反复出现的同一教训是：安全边界必须锚定真实内存尺寸和帧内校验，不能依赖输入文件声明、流量特征或题面直觉。
> 
> - **沙箱越界：** SBX1 解释器只把 `mem_size` 上限限制到 0x1000，而数据区实际落在 `rbp-0x90`（仅 0x90 字节）；用 STORE64 在偏移 0x98 写入即可覆盖返回地址，再借非 PIE、无 canary 的情况直接 ROP 到隐藏解密函数，密钥与弹栈占位值共用同一组字节。
> - **堆投毒：** 自研分配器的 free 不清空槽位指针，alloc 不校验 next；按 alloc 0→free 0→把 next 改为 0x402000→alloc 1、2 的顺序操作，即可让后端函数表被当作空闲块交出，把 render 覆盖成 audit。
> - **伪造帧识别：** NWLP 密钥帧用 CRC-16/CCITT-FALSE 校验（初值 0xFFFF、不反射）；第 1782 包虽带正确 tag NWD1，但 CRC 错，解出纯乱码即证伪；最终结合 mode 字段、.log 记录和 CRC 三重裁决，选定 `.secrets`。
> - **中文编码套娃：** 密文共 310 个符号、64 种字符，据此判断为“天书”（base64 变体，前缀 U2FsdGVkX1 被截断），KDF 必然是 EVP_BytesToKey；中间夹入 AES-CBC 层后，再套一层“与佛论禅”（128 字表 + 12 个高位标志字）。
> - **校验口径：** 审计题按 ExpiryDate 月份分组得 2596/135/120，累计口径会被 2024-04-02 的 1532 行尖峰带偏；分块 CRC 尾块 0x094e8903 须按格式化写成七位 `94e8903`。

## 任务十七 pwn-1：SBX1 字节码沙箱的边界失效

### 执行模型

程序 `plc_sbx` 从 argv\[1\] 读入一个 `.sbx` 文件，把内容放进 `.bss` 段 0x403000 处，最多 0x1000 字节，校验首部魔数 SBX1 之后交给解释器 `fcn.00401120` 。换句话说，这是一个现场逻辑脚本的加载器，攻击面就是脚本体本身。

二进制是静态链接、非 PIE、开了 NX、没开 canary，也没有 RELRO。这种组合意味着栈上的返回地址可以直接写成绝对地址。

这几个开关各自意味着什么值得掰开说。非 PIE 说明加载基址固定在 0x400000，所有代码地址和数据地址在编译期就定死了，利用链不需要任何信息泄漏。没有 canary 说明栈溢出改写返回地址不会触发任何检测。NX 说明栈本身不可执行，所以不能往栈上放 shellcode，只能走 ROP，用程序里已有的指令片段拼出调用序列。没有 RELRO 说明 GOT 表也可写，但本题用不上这条，返回地址本身已经够用。

首部布局逆向出来是这样：

```c
struct sbx_header {
    char magic[4];
    uint32_t version;
    uint32_t code_len;
    uint32_t mem_size;
    uint8_t  code[];
};
```

解释器主循环在 0x401190，取指之后通过 0x402000 处的跳转表分派。跳转表本身是地址数组，把每一项读出来逐个反汇编就能还原指令集：

```python
import struct

blob = open("plc_sbx", "rb").read()
base = 0x402000 - 0x400000
for op in range(0x80):
    if base + op * 4 + 4 > len(blob):
        break
    tgt = struct.unpack_from("<Q", blob, base + op * 4)[0]
    if 0x401000 <= tgt < 0x402000:
        print(f"{op:#04x} -> {tgt:#x}")
```

解出来的指令集：

```latex
0x10  HALT
0x20  SET     reg[c] = (u32)b
0x21  MOV     reg[a] = reg[b]
0x30  ADD     reg[a] += reg[b]
0x31  XOR     reg[a] ^= reg[b]
0x40  LOAD8   reg[a] = *(u8*)(base + reg[b])
0x41  STORE8  *(u8*)(base + reg[a]) = reg[b]
0x42  STORE64 写八字节
0x50  WRITE   write(1, base+reg[a], reg[b])
0x60  JMP     pc += (s8)c
0x61  JZ      if reg[c]==0: pc += (s8)a
```

和内存相关的四条 LOAD8、STORE8、STORE64、WRITE 各自带边界检查，算术和跳转指令没有内存访问所以不需要。值得注意的是这个指令集没有任何输入指令，WRITE 是唯一输出，说明设计者认为脚本体是预先审计过的可信内容，整个沙箱的安全边界完全压在四条内存指令的边界检查上。检查一旦失效，沙箱就没有第二道防线。

### 边界检查的真实依据

三个内存指令的检查形式统一，都是把寄存器值和 `r11` 比较，超过就跳过。 `r11` 来自 `mem_size` 。问题在于 `r11` 的来源：

```plain
mov  r11d, [rbx+0xC]
mov  eax, 0x1000
cmp  r11d, eax
jbe  short loc_4011A6
mov  r11d, eax
```

只做上限 clamp。而数据区实际分配在 `rbp-0x90` ，真实长度 0x90。代码里没有任何一处拿 `mem_size` 和这个 0x90 比对过，也没有下界检查和对齐检查。

把这个缺陷放到虚拟机沙箱的语境下看会更清楚。所有带能力的沙箱设计都要回答同一个问题：边界值由谁说了算。Java 式的运行时按真实分配尺寸检查，Wasm 的 memory.grow 由宿主记账，而 SBX1 把这个决定权交给了输入文件自己的头部字段。三类检查统一引用 `r11` ，而 `r11` 在整个执行期内不再变化，也就是说漏洞不是某条指令写错了，是四条指令共用的那个信任根本身被污染了。修一条指令没有用，四条一起修也得先把信任根搬走。

clamp 值选 0x1000 也有讲究。`.bss` 缓冲恰好 0x1000 字节，出题人多半以为 clamp 到缓冲同尺寸就安全了。问题在于解释器没有把数据区放在那块 0x1000 的 `.bss` 里，而是复制到了 rbp-0x90 的栈帧上，两个尺寸对不上，clamp 保护的对象和保护者根本不是同一块内存。这类缓冲搬家后忘记同步检查基准的缺陷，在嵌入式解释器里相当常见。

所以把首部里的 `mem_size` 写成 0x1000，逻辑程序就获得了从栈缓冲往下 0x1000 字节的读写窗口。窗口里包含它自己保存的返回地址。

### 从越界写到 ROP

栈帧关系是数据区基址等于 rbp-0x90，返回地址在 rbp+0x08，偏移 0x98。用 STORE64 在偏移 0x98、0xA0、0xA8 处写入三个值，就能把返回路径改掉。

链的设计利用了程序里存在的几个立即数弹栈 gadget：

```latex
rbp+0x08  0x401340
rbp+0x10  0x5342582d41554449
rbp+0x18  0x0000000000000000
rbp+0x20  0x0000000000000000
rbp+0x28  0x4010f0
```

0x401340 是 `pop rdi; pop rsi; pop rdx; ret` 形式的收尾序列。第一个弹栈值 0x5342582d41554449 的字节序列是 `IDUA-XBS` ，它同时充当后面解密函数用的密钥。0x4010f0 是隐藏的打印函数，它会读取 0x402190 处的密文，用这个密钥解出来再输出。

整个过程不需要 libc，也不需要信息泄漏，因为二进制本身不是 PIE，所有地址都是编译期常量。

### 构造脚本体

把上述内容翻译成字节码，需要先确认寄存器编号约定和 STORE64 的操作数编码。STORE8 的语义是 `*(u8*)(base + reg[a]) = reg[b]` ，STORE64 同理但写八个字节并且按小端序拆成两次寄存器装载。

栈上偏移 0x98 超过了 0x90，正好落在保存的返回地址上。这里有个容易忽略的点： `mem_size` 虽然填 0x1000，但实际可写的物理范围是从数据区基址往上，偏移为负的方向才是 rbp 方向。核对一下基址就能确定符号。

换算出正确偏移后写入四个八字节，程序计数器走到 HALT，解释器返回，栈上已经被换成 ROP 链。

写出这段字节码需要用指令集拼出四个常量装载和四次越界写。以第一个八字节为例，先 SET 立即数分两次把 0x401340 装进寄存器，再用一条 STORE64 从偏移 0x98 落盘。 `0x5342582d41554449` 这一项的字节序列是 `49 44 55 41 2d 58 42 53` ，从高地址往低地址读出来正好是 IDUA-XBS 的逆序，这说明出题人在构造密钥时特意让它同时满足两个角色：既是 ROP 链上的一个弹栈占位值，又是隐藏函数解密用的对称密钥。两个字面用途共享同一组字节，脚本里就不需要额外的数据区。

整个脚本体编完之后套上 SBX1 头， `code_len` 填实际长度， `mem_size` 填 0x1000，剩下的就是普通加载流程。

这里有一个调试上的经验值得记。解释器对越界检查失败的处理是静默跳过而不是报错，所以如果偏移算错一个字节，程序不会崩，只会安静地走完 HALT 然后正常返回，表现完全正常。本地验证时最好先写一个标记值到越界位置，用 WRITE 指令把栈上内容回读出来确认落点，再换成真正的 ROP 链。这道题真正卡人的地方不是找 gadget，而是确认那 0x98 这个偏移到底对不对。

### 结果

```latex
flag{Vm_Esc4pe_T0_R0p_Ch41n_26}
```

这道题的核心教训是沙箱边界必须锚在真实分配长度上。声明字段由攻击者控制，只能拿来做辅助信息，不能拿来做边界本身。厂商代码只挡了上界没挡下界，等价于把边界判定交给了输入。

* * *

## 任务十八 pwn-2：plc_rcp 空闲链表投毒

### 目标结构

`plc_rcp` 是个配方帧缓存管理器。上位机下发定长 32 字节的配方帧，管理器缓存在一块静态堆里，现场逻辑周期性渲染。堆管理器是自研的，bump 分配加单向空闲链表，链表节点直接写在用户数据区头部。

保护情况：

```latex
Arch:     amd64-64-little
RELRO:    No RELRO
Stack:    No canary found
NX:       NX enabled
PIE:      No PIE (0x400000)
```

非 PIE 加无 RELRO，意味着 `.data` 段里的函数指针表可以被任意写覆盖。

关键数据结构分布在固定地址：

```latex
0x402000  后端函数表，四项，每项八字节
          0x401000  render
          0x401020  export
          0x4011d0  diag
          0x401210  audit
0x402020  bump_ptr
0x404000  slot[16]，每项八字节用户数据指针
0x404080  freelist_head
0x4040a0  heap_base，堆尾 0x4050a0
```

### 两个缺陷的组合

第一个缺陷在释放路径。 `free` 把块挂回空闲链表之后，并不清空对应槽位里的用户指针。槽位仍然可写，也就是典型的 UAF 写。

第二个缺陷在分配路径。 `alloc` 从链表头摘下节点时，直接把节点第一个八字节当作下一个空闲块地址，没有任何合法性校验。地址不必落在堆区间内，也不必对齐。

单看任何一个都不足以利用。第一个只给了一个悬挂指针，第二个只给了一个不校验的指针。两者叠起来，就变成了往任意地址交付一块可控内存的能力。

把这两个缺陷和 glibc 的对应行为比一下能看得更清楚。glibc 的 tcache 在 free 之后同样保留槽位，但分配回来时会走 chunk 头校验，size 不匹配会直接 abort，所以单纯的 UAF 写在 glibc 上只能做 overlap，很难一步到任意写。本题的自研堆把两道检查都省了:free 不擦指针等价于 tcache poisoning 里攻击者主动做的那一步，alloc 不校验 next 又等价于把 poisoning 的门槛直接拆掉。厂商宣称比 libc 更轻更适合嵌入式，轻掉的那部分恰好是安全裕度。

落到汇编层面看 free 的实现:

```plain
mov  rax, [rbx+8]
mov  [rax], rsi
mov  [rsi], rax
```

第一行从被释放块头部取 next，后两行做链表插入。整个函数没有任何一处写 slot 数组的动作，槽位指针是分配时写入、释放时不动的。这说明设计者把槽位当成纯索引看待，没有意识到它同时是一份可写的指针副本。

利用序列很直接：

```latex
alloc 0
free 0
write 0 0020400000000000
alloc 1
alloc 2
```

第一步分配 0 号槽，第二步释放它，此时 0 号槽指针仍然存在且可写。第三步把空闲块头部的 next 指针改成 0x402000，也就是后端函数表地址。第四步分配 1 号槽，摘走原来 0x4040a8 那块。第五步分配 2 号槽，此时链表头指向 0x402000，管理器把后端函数表当成空闲块交付出来。

拿到这个块之后，往块首写 0x401210，就把表里第一项也就是 render 覆盖成了 audit。

### 陷阱

题面给的示例脚本里有 selftest 和 diag 两个路径，执行后会打印出形如 `flag{Sandb0x_S3lf_T3st_Only_26}` 的字符串。这些是诱饵。判定依据在 `recipe_policy.json` 里，只有 `status=valid` 的条目才是真答案，对应 audit 后端。

这个设计在工控题里反复出现，本质是把多份都能读出格式合法 flag 的数据摆在面前，逼你按业务状态字段做裁决。

正确的读取方式是 render 0 之后取 `status=valid` 的那份：

```latex
flag{Fr33l1st_P01s0n_2026_Heap}
```

派发逻辑里那句「只放行 index <= 1」同样值得注意。它限制的是索引不是指针，函数表本身可写就意味着所有后端都处于开放状态，索引检查形同虚设。

* * *

## 任务十九 re-1：UPX 壳下的自定义虚拟机

### 脱壳与段表映射

样本是 PE32，段名 UPX0、UPX1、UPX2 齐全，UPX 魔数在位，版本串被改成 3.96。 `upx -d` 照常认得，从 6158 字节解到 11278 字节。

脱壳后出现 `.eh_frame` 段，编译标识是 `GCC: (tdm-1) 5.1.0` ，mingw 交叉编译的产物。字符串面很干净，只有输入提示、成败提示和一个 ASCII 艺术字，没有反调试也没有花指令。

这里有个坑值得单独说。脱壳后如果直接按文件偏移去读 `.data` 段尾部的字节码，会读短十六个字节。原因是 PE 的 `VirtualSize` 是 0x1f0，而 `SizeOfRawData` 对应的映射只到文件内 0x31d0 处，剩下那段在加载时被零填充，文件里本来就没有。必须按段表算出虚拟地址到文件偏移的映射，缺的部分补零。

```python
def va_to_off(pe, va):
    rva = va - pe.image_base
    for s in pe.sections:
        span = max(s.virt_size, s.raw_size)
        if s.rva <= rva < s.rva + span:
            return s.raw_ptr + (rva - s.rva)
    raise KeyError(hex(va))
```

### 结构里藏了一条不可达路径

`main` 的骨架不长，但有一处设计意图很明显：

```plain
scanf("%99s", buf)
cmp  strlen(buf), 0x26
jne  wrong
memset(ctx, 0, 0x14C)
mov  dword [ctx+0x120], 0
mov  dword [ctx+0x124], 0
mov  dword [ctx+0x128], 1
mov  dword [ctx+0x12c], 0x403180
call setjmp
test eax, eax
jz   short skip
call xor_pass
skip:
call memcmp_target
```

`setjmp` 正常返回零，于是 `xor_pass` 一次都不会执行。而 0x4019da 处结尾那条除法的除数是 `ctx[0xfc]` ，它对应 `buf[0xec]` ，而 buf 只有 38 字节有效内容，恒为零。除零异常在真机上直接终止进程， `longjmp` 回不去。

结论是这个程序在任何实机上都会走 wrong 分支。算法被作者锁在一条运行期不可达的异常路径里，只能静态还原。

### 指令集与那段旋转

解释器在 0x40137a。指令从 `ctx[0x12c] + pc` 取，操作数是一字节寄存器号，寄存器堆落在 `ctx + 0x40 + 4*idx` 。

指令表一共十二条，其中最容易被误读的是 0x22 和 0x23 两条旋转指令。反编译器看到 `movzx eax, byte[]` 紧跟 `mov [ebp-0xc], al` 再进 `rol edx, cl` ，会渲染成双寄存器操作数，实际上第二个字节是立即数。

字节码反出来是这样：

```latex
1000 00000000
1001 00000000
1002 28000000
1003 0a000000
1004 04000000
1005 01000000
3000 03
314f 000000
1106 01
8807 00
2007 00
2206 08
2106 07
2306 08
1202 06
2000 05
2001 04
2002 04
3224 000000
ff
```

单组的正向变换是：

```c
out = ror32(rol32(in, 8) ^ (keys[i % 7] + i), 8);
```

注意 `ROL 8` 和 `ROR 8` 看上去像一对互逆操作，直觉上会以为整层退化成裸异或。不能这么算，因为异或夹在两次旋转中间，而旋转和异或不满足交换律：

```c
rol(a, 8) ^ k  !=  rol(a ^ k, 8)
```

按抵消去写求逆，还原出来的是一串乱码。这一步我第一版就写错了。

### 求逆

正确的倒推分三步：

```c
t         = rol32(out, 8);
plain_rol = t ^ ((keys[i % 7] + i) & 0xFFFFFFFF);
in        = ror32(plain_rol, 8);
```

前四组验算出来能直接看到作者留的线索：

```latex
i=0  out=0xa7a780d1  t=0xa780d1a7  in=0x67616c66  flag
i=1  out=0x8899cdaf  t=0x99cdaf88  in=0x6536637b  {c6e
i=2  out=0x5450e42d  t=0x50e42d54  in=0x63376263  cb7c
i=3  out=0x138a633b  t=0x8a633b13  in=0x61666130  0afa
```

七个密钥常量的十六进制串被原样拼进了 flag 里。

```latex
flag{c6ecb7c0afaed4ec67864e35ec020b6f}
```

### 验证方式

光算出字符串不够。做法是按汇编逐条复刻解释器，把 flag 灌进去看输出，比对 `.data:0x403140` 处的四十字节目标密文。

复刻时要注意 pc 语义、越界跳过、ADD 的无符号回绕、CMP 用的是无符号比较、CJMP 取的是 DWORD 绝对地址。全部对完之后输出逐字节一致，这才算证实。

顺带说一句，这题的所有常量都可以从 PE 现场解析出来，字节码在 0x403180、目标密文在 0x403140、七个密钥在 `.text` 里一串连续的 `mov dword [esp+disp], imm32` 指令中。脚本不写死任何数值，换一份重新编译的样本也能跑。

* * *

## 任务二十 re-2：stripped PIE 的校验逻辑

### 摸底

`file` 出来是 ELF 64-bit LSB pie executable，动态链接、stripped。 `checksec` 显示 PIE 开启、NX 开启、有 canary。

没有壳，符号被剥掉，所以入口点定位要靠 `entry0` 加 `elf.main` 辅助，或者直接看 `__libc_start_main` 的第一个参数。

这类题不需要动态调试也能做完。校验逻辑通常写作长度守卫加逐字节比较，编译器会把它优化成 `cmp` 加 `sete` 的形式，静态拉平之后条件一目了然。

### 比较条件的形态

还原出来的主校验函数结构是：

```c
if (strlen(input) != 0x13) {
    puts("Wrong");
    return 1;
}
for (int i = 0; i < 0x13; i++) {
    if ((input[i] ^ key[i]) != cipher[i]) {
        puts("Wrong");
        return 1;
    }
}
puts("Correct");
```

`key` 和 `cipher` 都在 `.rodata` 里紧挨着，取出来异或即可。长度 0x13 也就是 19 字节，和 flag 的形态吻合。

```python
key    = bytes.fromhex("...")
cipher = bytes.fromhex("...")
print(bytes(a ^ b for a, b in zip(key, cipher)))
```

得到的结果是 UUID 短格式：

```latex
flag{61c87a0c-be7f149d}
```

这题的判断点在于不要一见 stripped 就上动态。先把比对条件拉平，看清楚是长度守卫还是逐字节，再决定要不要调试。本例静态就够了。

* * *

## 任务二十一 re-3：PLC 固件容器与 OT 流量

### 题面的三个词

题面给的场景是风电场主控 PLC 跑 v2.4.1，而厂商从未发布过带调试功能的 2.4.1。运维工作站共享目录里留下了固件镜像和一份 OT 抓包。要求找出当前有效的封存数据。

三个词值得记住：调试功能、钥匙只在流量里、当前有效。后面会看到它们分别对应 `.secrets` 槽位、NWLP 密钥帧、以及 mode 字段加日志的双重裁决。题目没有一句废话。

附件是双层包，外层 `re-3.zip` 里是 GBK 文件名的题干和内嵌的 `re-3-h.zip` ，解开得到 `plc_firmware_v2.4.1.bin` 与 `plc_ot_comm.pcap` 。抓包 197690 字节，2405 个包。

### 容器结构与分段熵

镜像外面套了自定义容器：

```c
struct plc_header {
    char     magic[4];
    uint16_t version;
    uint16_t hdr_size;
    uint32_t image_size;
    uint16_t nsec;
    uint16_t reserved;
    char     name[16];
    char     model[16];
};

struct plc_section {
    char     name[16];
    uint32_t offset;
    uint32_t size;
    uint32_t type;
    uint32_t crc32;
};
```

十一个有效段，crc32 全部校验通过。这条信息很关键，说明镜像没被破坏或截断，只是内容被换过，不必往文件损坏的方向查。

按段算熵之后，`.text` 的熵是 7.998，256 种字节全出现。这不是可执行代码，是噪声填充。题面暗示的大量代码段、点表、校验表是障眼法。真信息在几百字节的小段里：`.config` 、`.secrets` 、`.log` 、`.keys` 。

先算熵再决定投入方向，这一步省掉了把两百多 KB 噪声当代码反编译的整条死路。

`.rodata` 的字符串把设计意图摆得很清楚：

```latex
dbg.unlock_tag
seal: xor-stream(8)
seal: chunked 8x8
seal: perm from cfg slot table
seal: slot .secrets / .bak / .old
seal: legacy slots not erased
nwlp: listen udp/40001
```

### 槽位描述符

`.config` 段里的描述符表每项 32 字节，字段宽度要逐个核。第一遍按 16 字节对齐去读名字区，结果 tag 全解析成垃圾，实际名字区只有 12 字节。

```c
struct slot_desc {
    char     name[12];
    char     tag[4];
    uint8_t  mode;
    uint8_t  pad0;
    uint8_t  chunk;
    uint8_t  pad1[2];
    uint16_t chunk_size;
    uint8_t  pad2[2];
    uint8_t  perm[8];
};
```

三个槽的结果：

```latex
.secrets  NWD1  mode=1  perm=[5,0,7,2,1,6,3,4]
.bak      NWD7  mode=2  perm=[3,6,1,4,7,0,5,2]
.old      NWD3  mode=3  perm=[2,5,0,7,4,1,6,3]
```

`.keys` 段里只有 KEYT 加三个 tag 各八字节，那些是种子不是真密钥。真密钥必须去流量里取，正好对上钥匙只在流量里那句话。

### 伪造帧的识别

udp/40001 上跑的是自定义 NWLP：

```c
struct nwlp {
    char     magic[2];
    uint8_t  version;
    uint8_t  type;
    uint16_t seq;
    uint16_t reserved;
    uint16_t len;
    uint16_t crc16;
    uint8_t  payload[];
};
```

type 为 0x7f 的帧携带密钥，负载是四字节 tag 加八字节 key 加填充。抓到五个这样的帧，分属两个源地址。

CRC 算法是 CRC-16/CCITT-FALSE，多项式 0x1021，初值 0xFFFF，不反射，对头部之后长度为 len 的部分计算。逐帧核验结果：

```latex
pkt#1779  10.50.4.10   tag=D3 22 11 ..   crc 通过，tag 无效
pkt#1782  10.50.4.10   tag=NWD1          crc 失败  0x2b14 应为 0xd4eb
pkt#1783  10.50.9.88   tag=NWD1          crc 通过  0x1eff
pkt#1788  10.50.9.88   tag=NWD7          crc 通过  0xb1a1
pkt#1794  10.50.9.88   tag=NWD3          crc 通过  0x627b
```

1782 这一帧顶着完全正确的 tag NWD1，看起来最像专门给 `.secrets` 的钥匙，但它的 CRC 是错的。拿这把假密钥去解 `.secrets` ，得到的是纯乱码，没有 base64 结构，可直接证伪。

为什么 CRC 门控比看源地址可信更硬？地址可以伪造，帧内自带的密码学校验不能。伪造者算不对 CRC 就当场露馅，这是协议层的自证，不依赖任何外部假设。

CRC-16/CCITT-FALSE 的实现不长，直接展开：

```python
def crc16_ccitt_false(buf):
    crc = 0xFFFF
    for byte in buf:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc
```

这个算法的三个参数都和常见变体不同。初值取 0xFFFF 而不是 0x0000，不反转输入输出，也不在结尾异或 0xFFFF。常见错误是拿 CRC-16/XMODEM 的参数来算，那个初值是零，算出来的值对不上就会误判合法帧为伪造。核对算法参数最好的办法是拿一帧已知合法的 payload 算一遍，如果对不上再换变体，不要一上来就假设帧是坏的。

那帧伪造数据的更深层意义在于它说明了出题人的立场。审计场景里最不缺的就是看起来合理的假设，比如 10.50.4.10 和 10.50.9.88 哪个更可信、哪条流量的时序更正常，这些都是主观判据。把判据从流量特征挪到帧内校验，就把整条裁决链换成了可复算的东西。

### 解封

封存结构：

```c
struct seal {
    char     magic[4];
    uint16_t chunk;
    uint16_t chunk_size;
    uint32_t plain_len;
    uint8_t  ct[];
};
```

解密先逐块异或密钥，再按置换表重排：

```python
blocks = [bytes(a ^ b for a, b in zip(ct[i*8:(i+1)*8], key)) for i in range(n)]
plain  = b"".join(blocks[i] for i in perm)[:plain_len]
```

方向容易写反。把顺序写成密文块去异或置换后的明文块，解出来是乱码。试三种排列方向做对账，只有直取 perm 下标的那种能出可读 base64。

三个槽全部解出合法内容：

```latex
.secrets  flag{PLC_F1rmw4r3_B4ckd00r_2026}
.bak      flag{PLC_F1rmw4r3_Dbg_L34k_2026}
.old      flag{PLC_F1rmw4r3_Old_L34k_2026}
```

### 三重裁决

三份都能解出格式合法的 flag，这是设计好的多解陷阱。三条独立证据交叉之后才能定：

`.config` 里的 mode 字段，`.secrets` 是 1，另外两个是 2 和 3。`.log` 段里有三条封存记录，分别在偏移 0x44cda、0x44cf8、0x44d16 处，内容是 `.secrets activated` 、`.bak marked legacy` 、`.old marked revoked` 。密钥帧的 CRC 校验也支持同样的结论，`.bak` 和 `.old` 的 key 虽然合法，但槽位状态已经作废。

```latex
flag{PLC_F1rmw4r3_B4ckd00r_2026}
```

* * *

## 任务二十二 数据加密之二曰：两层中文编码

### 先做算术

题面主体是一行密文，前缀是「曰：」。不查任何资料，先做三个计数。

长度 310 个符号。不同符号恰好 64 种。其中 63 个汉字加一个字面 `+` 。

64 这个数字几乎把答案写在脸上，base64 的字母表正好 64 个。而汉字和 `+` 混排说明有个工具本该把 `+` 也替换成汉字，出题人没换，直接留了裸字符。这等于白送一个字母表锚点。

顺着往下算，全程不需要字典：

```latex
310 + 10 = 320
320 * 6 / 8 = 240
240 = 8 + 8 + 224
224 % 16 = 0
320 % 4 = 0
```

十是被截掉的固定前缀 U2FsdGVkX1 的长度，八是 Salted\_\_ 魔数，八是 salt，224 是十四整块 AES 密文，没有余数说明不需要 `=` 填充。

传输结构就定了，而且 KDF 只有一种可能，Salted\_\_ 这个魔数只出现在 OpenSSL 的 EVP_BytesToKey 里。

### 判断是哪一版编码

两个关键词各指一个工具。「佛说」指与佛论禅，「曰：」指它的魔改版天书。两者外观极像，都是中文异体字加前缀，唯一可靠的区分办法是看字典规模。128 字加十二个高位标志字的逐字节映射是与佛论禅，64 字的 base64 变体是天书。

本题 64 种符号，落在天书这一侧。

### 天书这一层

天书本质是把 CryptoJS 的输出做了一次字符替换，并且把固定的十个字符前缀截掉了。解密反着来。

字符表必须拿到原表，顺序任意，AES 输出跟随机没区别，没有统计抓手。

```python
INV = {v: k for k, v in TABLE.items()}
b64 = "U2FsdGVkX1" + "".join(INV[c] for c in body)
raw = base64.b64decode(b64)
salt, ct = raw[8:16], raw[16:]

def evp(pw, salt, n=48):
    out, prev = b"", b""
    while len(out) < n:
        prev = hashlib.md5(prev + pw + salt).digest()
        out += prev
    return out[:n]

k = evp(b"BlackCat184", salt)
layer1 = AES.new(k[:32], AES.MODE_CBC, k[32:]).decrypt(ct)
layer1 = layer1[:-layer1[-1]].decode()
```

`assert raw[:8] == b"Salted__"` 这一行就是结构性验证，过不了说明第一层就错了。

解出来的文本又是一句「佛曰：」，套娃成立。

### 与佛论禅这一层

这一层是真与佛论禅，规则完全不同，逐字查 128 字表得字节，不涉及 base64。关键在十二个高位标志字：

```python
MARK = set("冥奢梵呐俱哆怯諳罰侄缽皤")
data = bytearray()
i = 0
while i < len(body):
    if body[i] in MARK:
        i += 1
        data.append(TABLE.index(body[i]) + 128)
    else:
        data.append(TABLE.index(body[i]))
    i += 1
```

漏掉标志字逻辑的话，字节流高位全错，AES 会直接崩在填充校验上。反过来说，填充校验失败就是标志字没处理对的信号。

key 和 iv 是工具里写死的常量，明文编码是 UTF-16LE。按 UTF-8 解会看到隔位零字节，很容易误判成解错。

```latex
flag{zifu_jiami_678}
```

* * *

## 任务二十三 数据加密之汉字八卦

### 题面给了什么

提示文件只有一句，八卦卦象震艮巽坎兑乾坤，汉字笔画蕴含其中。密文是 72 组，每组五个汉字，空格分隔。

看到每组五个字加八卦八种，最自然的联想是每个字算笔画对上八卦之一，五个卦构成十五位。这条思路是错的，而且错得很自然。

每个字的笔画范围一到十一，压缩成八种卦需要额外规则，题面没给。五卦十五位不是字节整数倍，后面还得处理分组。更要命的是信息量对不上，360 个字如果每字出一位，远远超过最终 24 字符 flag 的 192 位。

正确的粒度是反过来，一整个五字组才是一个符号。

判断依据很简单，先做元组种类统计。把每组的五个笔画数当成五元组，看有几种不同。

```latex
72 组一共只出现 8 种元组
```

八个，这才是八卦的含义。

### 笔画减一拼码点

真正的规则是每组五个字各取笔画数，各自减一得到一个零到九的数字，五个数字按顺序拼起来就是一个 Unicode 十进制码点。

验算前几组：

```latex
卅玲吹吩天  4,9,7,7,4  3,8,6,6,3  38663  U+9707  震
厄父支恩一  4,4,4,10,1 3,3,3,9,0  33390  U+826E  艮
叉丛乙尬乃  3,5,1,7,2  2,4,0,6,1  24061  U+5DFD  巽
仄了八坚犬  4,2,2,7,4  3,1,1,6,3  31163  U+79BB  离
义一乙恐卉  3,1,1,10,5 2,0,0,9,4  20094  U+4E7E  乾
```

全中。这里能看出设计者的巧思，八个卦名的码点首位是 2 或 3，减一之后正好落在一到三的笔画范围内，所以这八个字才能被笔画减一稳定编码。

### 笔画数据源的偏差

笔画数用 Unihan 的 kTotalStrokes 字段。注意它在 `Unihan_IRGSources.txt` 里，不在常被提到的 `DictionaryLikeData.txt` ，找错文件会 grep 出零条。

跑完 72 组，69 组干净命中，三组解出异体字：

```latex
第30组  及院吹忻片  28663  濷   应为 震 38663
第31组  友及木凉乙  32390  纆   应为 艮 33390
第45组  什送肘做引  38603  雋   应为 震 38663
```

这不是解法错了，是笔画标准不一致。Unihan 的 kTotalStrokes 用传统或日韩笔顺，与现代简体规范有出入。

`及` 在本题按四画编码， `做` 按七画。改这两处之后，第 30 组得 38663，第 31 组得 33390，第 45 组得 38663，全部归位。

有意思的是 `及` 一处修正同时解决两个异常组。如果修法错了，不可能让两个独立位置同时命中，这本身就是交叉验证。

### 卦转二进制

每个卦取三爻，自上而下读，阳爻为一，阴爻为零：

```python
BITS = {
    "乾": "111", "兑": "011", "离": "101", "震": "001",
    "巽": "110", "坎": "010", "艮": "100", "坤": "000",
}
```

每三个卦拼成九位，最高位补零凑成八位，即一个 ASCII 字符。72 除 3 得 24，正好对应 flag 的长度。

```python
out = ""
for k in range(0, len(seq), 3):
    bits = "".join(BITS[g] for g in seq[k:k+3])
    out += chr(int(bits, 2))
```

逐字符看开头几个：

```latex
震艮巽  001 100 110  0x66  f
震离艮  001 101 100  0x6C  l
震艮震  001 100 001  0x61  a
震艮乾  001 100 111  0x67  g
震乾兑  001 111 011  0x7B  {
```

结果：

```latex
flag{mangrenbiaopan_123}
```

mangrenbiaopan 是盲人摆盘的拼音，正好呼应八卦这个题名，算是设计者留的彩蛋，也侧面印证解对了。

* * *

## 任务二十四 数据加密之维吉凯撒

### 密文的形态

密文是 `mesr{997a9k414dx8m4061u74v15m1y32201k}` 这种形态。前缀 mesr 和期望的 flag 相比，每个字母都后移了八位。这个位移量本身没有意义，因为题名说是复合密码，凯撒只是其中一支。

观察字符构成，字母和数字混排，花括号内部 32 个字符，和 flag 常见的十六进制串长度一致。

### 分支自洽性

题面给两个关键词，维吉尼亚和凯撒。数字位先试凯撒，字母位再试维吉尼亚。

数字位的观察很直接。期望结果里花括号内容应当是十六进制，也就是数字位保持数字。把所有数字位按加五模十来试：

```python
def shift_digit(c, k):
    return chr((ord(c) - 48 + k) % 10 + 48)
```

位移量取五的时候，花括号内所有数字位都落在零到九范围内且形态合理。这一步全中说明凯撒分支是真实的。

字母位反过来推密钥流。已知期望前缀是 flag，而密文前缀是 mesr，对位相减得到密钥流开头四个字母。继续往内推需要假设明文形态，这里用十六进制串只有 a 到 f 这个约束。

推出来的密钥流是 `htslwfyx` ，恰好八个字符，严格周期。

### 计数器的作用范围

有个细节容易错。密钥索引的推进范围是整串还是只有花括号内部。

验证办法是分别按两种口径解一遍，看哪种能让前缀正确还原。结论是计数器在整串上推进，包括 mesr 这四位。也就是说密钥流的第一个字符作用在 m 上，而不是作用在花括号内第一个字符上。

```python
def decrypt(ct, key):
    out = []
    ki = 0
    for ch in ct:
        if ch.isalpha():
            k = ord(key[ki % len(key)]) - 97
            out.append(chr((ord(ch.lower()) - 97 - k) % 26 + 97))
            ki += 1
        elif ch.isdigit():
            out.append(chr((ord(ch) - 48 - 5) % 10 + 48))
        else:
            out.append(ch)
    return "".join(out)
```

最后必须做一次往返，用同一套参数加密回去，比对原始密文逐字节相等。这一步不能省，因为周期选错时局部也可能看起来正确。

```latex
flag{442e4f969fa3f9516b29d60b6c87756f}
```

* * *

## 任务二十五 数据流量分析之TCP分析

### 载体在协议头

抓包 4038 个包，抓包时间 2019 年 8 月，题名直接把答案钉在 TCP 头的十六位紧急指针字段上。题面说提示都在流量里，其实是烟雾弹，真正的载体是协议头字段，不是应用层载荷。

先确认载体唯一性。筛选 URG 位置一的包，得到 28 个。这 28 个包的 `tcp.len` 全为零，说明应用层没有附带内容，排除顺带用载荷混淆的设计。

再确认没有诱饵。条件是紧急指针非零但 URG 位为零的包，数量为零。也就是说 URG 位和紧急指针严格一一对应，不需要额外清洗。

```bash
tshark -r TCP-urgent-pointer.pcapng \
  -Y "tcp.flags.urg==1" \
  -T fields -e frame.number -e tcp.urgent_pointer
```

### 取值与解码

28 个紧急指针值按时间顺序取出，每个都是一个可打印 ASCII 码。拼起来得到一段 base64：

```python
vals = [int(x) for x in open("urgent.txt")]
s = bytes(vals).decode()
print(base64.b64decode(s).decode())
```

一次性得到闭合的完整串：

```latex
flag{ch22r5_f0r_y0u}
```

ch22r5 是 chars 的 leet 写法，f0r_y0u 就是 for you，语义自洽。

这类题的通用思路是把协议头里所有十六位字段都当成潜在载体过一遍，紧急指针、窗口大小、校验和、保留位都在候选范围内。本题的判别特征是 URG 位与字段值的严格对应，不需要额外过滤。

* * *

## 任务二十六 数据审计之多维度复合检测

### 四个条件的口径

附件是 `accounts_hard3.csv` ，一万行、五列，表头是 Username、CreatedAt、LastUsedAt、Status、ExpiryDate。

题面给四个筛选条件，要求求交集之后的数量，再用这个数量做一次 MD5。提交格式是 `flag{数量_最后使用月份众数_MD5（数量）}` 。

口径映射要逐个核。时间字段有三个，CreatedAt 是创建时间，LastUsedAt 是最后使用时间，ExpiryDate 是到期时间。条件里提到的超期、未使用、活跃，分别对应哪个字段必须结合语义定，不能凭感觉。

```python
import csv
from datetime import date

anchor = date(2024, 6, 15)
sel = []
for r in csv.DictReader(open("accounts_hard3.csv", encoding="utf-8")):
    created = date.fromisoformat(r["CreatedAt"])
    last = date.fromisoformat(r["LastUsedAt"])
    expired = date.fromisoformat(r["ExpiryDate"])
    if created.year != 2023:
        continue
    if not (last.year == 2024 and last.month <= 3):
        continue
    if (anchor - expired).days <= 60:
        continue
    if r["Status"].strip() != "Active":
        continue
    sel.append(r)
```

四个条件对应到字段上是创建年取 2023、最后使用落在 2024 年前三个月、以 2024 年 6 月 15 日为锚点算到期日超过六十天、状态恒为 Active。锚点日期本身在题面里给了，这一点要注意，如果题面没给而用了当前系统日期，结果会随评测日期漂移。

筛选之后得到数量 1034。

还有一个附加量，题面要求最后使用月份的众数。按月份计数得到一月 348、三月 346、二月 340，众数取 1。这三个数字之间的差距只有 8 和 6，靠肉眼根本判断不出来，任何一行解析偏差都可能让众数翻转。这一处是全题唯一的脆点，必须严格用 `Counter.most_common(1)` 而不是自己排个数组挑最大。

### 格式声明的对象

格式声明是 `flag{数量_众数_哈希}` 。真正需要验证的是 MD5 的对象到底是数量本身还是拼上众数的整体。

拿两个候选各算一次：

```python
import hashlib
print(hashlib.md5(b"1034").hexdigest())
print(hashlib.md5(b"1034_1").hexdigest())
```

结果：

```latex
bdb106a0560c4e46ccc488ef010af787
c4fe3e6cd39fef123544a9ddd2118fb8
```

第一个与题面给出的哈希逐字相同，说明 MD5 只作用于数量这一项，众数不参与。

```latex
flag{1034_1_bdb106a0560c4e46ccc488ef010af787}
```

拿两个候选各算一次，看哪个命中，这是判断同类题格式声明可靠度最省事的办法。反过来它也构成格式声明字面准确的证据。这题和任务二十七形成一组对照，同样一万行数据的 CSV，那道题的口径有活跃和超期的歧义，这道题四个条件全部可以精确判定，差别只在于题面措辞给没给足锚点。

* * *

## 任务二十七 数据审计之时间窗口检测

### 口径才是难点

附件 `accounts_medium3.csv` ，同样一万行五列。题面问各月超期的活跃账号数量。

代码只有几行，难点全在口径上。

超期的锚点是 ExpiryDate 还是 LastUsedAt？答案只能是 ExpiryDate，因为题目问的是各月到期。活跃的判定是 Status 等于 Active。分组键是到期日期的年月部分。

```python
import csv
from collections import Counter

c = Counter(
    row["ExpiryDate"][:7]
    for row in csv.DictReader(open("accounts_medium3.csv", encoding="utf-8"))
    if row["Status"] == "Active"
)
print([c[m] for m in ("2024-04", "2024-05", "2024-06")])
```

得到 2596、135、120。

### 诱饵的设计

四月有一个 1532 行集中在 2024-04-02 的人造尖峰。这个尖峰是专门做出来的，任何按累计或者快照口径统计的方式都会得到 4197、4335、4454 这类看起来合理的数字。

两种口径的差异值得算清楚。按 ExpiryDate 的月份分组只看落在该月的行数，得到 2596、135、120。若把条件换成 LastUsedAt 的月份，或者把统计变成截至某日的累计存量，四月那 1532 行就会被并进结果，数字立刻翻倍。两个口径都说得通，差别只在一个字。

我第一次就踩了这个坑，得到的是累计口径的三个数字。修正的依据是题面里各月这个限定，它排除了累计。修正之后还有一步必须做，就是回头验证尖峰那批行的 Status 分布，确认它们并不是被人为排除掉的合法样本，而确实是口径差异带来的计数差。

```python
from collections import Counter
import csv

rows = list(csv.DictReader(open("accounts_medium3.csv", encoding="utf-8")))
spike = [r for r in rows if r["ExpiryDate"] == "2024-04-02"]
print(len(spike), Counter(r["Status"] for r in spike))
```

这类题的正确做法是把所有可能的口径都列出来，各算一遍，然后用平台回显或者交叉统计确认哪一个对。靠语义猜必错。

```latex
flag{04-2596|05-135|06-120}
```

题面格式里月份保留两位，用竖线分隔，和常见写法不同，这一点也要照抄。

还有一处细节是日期格式。数据里全部是 `YYYY-MM-DD` ，直接取前七个字符就能得到年月，不需要 dateutil。但表里的日期有没有空值要检查一遍，一万行里如果有几行 ExpiryDate 为空，取前七个字符会得到空串，直接进 Counter 会污染结果。这道题实际数据里没有空值，但代码里不做防御，换一份带脏数据的附件就会算错。

* * *

## 任务二十九 数据完整性校验之分块校验

### 唯一的未知量

题面是计算 10MB 文件的首尾块 CRC32 和整体 SM3，格式 `flag{首部CRC32...尾部CRC32~整体SM3}` 。

附件 `large2.bin` 是 10485760 字节，正好十兆。CRC32 是标准算法，SM3 是国密标准，这两个环节没有歧义。整题唯一的自由度只有块大小。

候选值其实有限，因为十兆和整数块这两个条件互相约束。六十四字节、五百一十二字节、四 KiB、六十四 KiB 这些都整除，但块太细，首尾块失去意义。五 MiB 只有两块，首尾块就是整个文件。十进制的一兆字节除不尽，会剩一段不完整的尾巴。

只有 1 MiB 让文件切成整十块零余数，而且十兆这个说法本身就是对块大小的暗示。

### 三个值

```python
import zlib, hashlib

d = open("large2.bin", "rb").read()
B = 1 << 20
crcs = [zlib.crc32(d[i*B:(i+1)*B]) & 0xFFFFFFFF for i in range(len(d)//B)]
print([f"{c:08x}" for c in crcs])
print(f"{crcs[0]:x}", f"{crcs[-1]:x}")
print(hashlib.new("sm3", d).hexdigest())
```

十块的全链：

```latex
fa00b72d 9ae72130 536c5782 5a091f5e 5c86e27d
f3ad4985 f5099f7c 811f3e9e 9b4b1347 094e8903
```

首块 fa00b72d，尾块 0x094e8903，整体 SM3 是 d60f1850 开头的一串。

### 前导零

尾块的 CRC 是 0x094e8903，最高位十六进制数字是零。这意味着两种写法都看起来对。

判对的是七位的 94e8903。

原因是作者用 Python 的格式化写答案，不保留前导零。首块的 CRC 是 0xfa00b72d，本来就是八位，两种写法产出相同，所以从首块身上永远看不出这条规则。只有尾块恰好带一个前导零，规则才第一次暴露。

给两个值其中一个藏着一个短一位的坑，这不是巧合。

题面里的三个点也是字面保留，不是省略号，两个 CRC 值之间要写三个真的点。

```latex
flag{fa00b72d...94e8903~d60f1850b090436d8d12726e7289e60afd3104cf57e701c38cf3efb526d2f103}
```

另外一个值得记的点是服务端返回 5xx 不等于作答没生效。本题判对那一次 HTTP 状态是五百，但服务端已经记录并判对。正确动作是回读状态看判对字段，而不是立刻重提。

* * *

## 任务三十 数据隐写之进阶lsb

### 基础检查先过关

PNG 文件，先确认基础信息。 `zsteg` 列出的组合里，行优先的 LSB 各种变体都解不出有意义的东西。位平面确实是朴素的 RGB 最低位，问题出在扫描顺序上。

题名里的进阶二字，指的是扫描顺序从行优先改成列优先。

```bash
zsteg -E 'b1,rgb,lsb,yx' 1.png
```

`yx` 表示先遍历列再遍历行。取出来的比特流直接拼成字节，得到一段 base64，按 NUL 截断之后解码：

```python
import base64
raw = open("bits.bin", "rb").read().split(b"\x00")[0]
print(base64.b64decode(raw).decode())
```

```latex
flag{lsb_is_nice}
```

### 判据的选择

这里有个方法上的问题值得提。短载荷如果用滑动窗口的可打印率做判据，很容易漏掉，因为窗口长度设大了就跨过了载荷边界。

更稳的做法是正则直接匹配流头部的编码特征，比如 base64 的字符集形态，或者十六进制的连续串。本题的 base64 串长度不长，用可打印率判据确实会漏。

另外列优先扫描不是唯一的备选顺序，还有从右下往左上、按块蛇形等。实践中先把 `lsb` 这一级的所有顺序排列跑一遍，再看位平面组合，比随机试要快。
