---
title: 【看雪】攻防世界 GFSJ0508「黑客精神」- 逆向分析
source: https://bbs.kanxue.com/thread-293252.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-17T12:41:35+08:00
trace_id: e135cdb6-6bfc-440f-a7d2-2792a00a81c5
content_hash: 59d10344c11112b88e959c9d951ffea8a57867bd23ab63231162105f32c92a35
status: synced
tags:
  - 看雪
  - CTF
  - Android逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: Android 原生库 `libmyjni.so` 采用逐字节 XOR 加密，并带有循环密钥索引算法；用于注册码校验的密文是 `EoPAoY62@ElRD`。对这段密文进行逆向解密，得到注册码 `201608Am!2333`；最终 flag 为 `xman{201608Am!2333}`。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3fc75244-d011-81f2-a4c8-c191244de5e0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Android 原生库 `libmyjni.so` 采用逐字节 XOR 加密，并带有循环密钥索引算法；用于注册码校验的密文是 `EoPAoY62@ElRD`。对这段密文进行逆向解密，得到注册码 `201608Am!2333`；最终 flag 为 `xman{201608Am!2333}`。
> 
> - **分层定位：** Java 层（`MyApp`、`MainActivity`、`RegActivity`）只负责调用 `initSN`、`saveSN`、`work` 这几个方法并回调，不包含任何密钥或校验逻辑；这些逻辑全部位于 32 位 ARM 动态库中，该库已经 stripped，只保留少数符号。
> - **函数映射：** 解析 `.data` 段中偏移 `0x4004` 处的 `JNINativeMethod` 数组，得到 `initSN→n1(0x13b0)`、`saveSN→n2(0x11f8)`、`work→n3(0x14cc)` 的对应关系；函数指针末位 `+1` 是 Thumb 调用约定。
> - **算法细节：** 密钥结构为 `W3_arE_whO_we_ARE\0`（18 字节），计数器初值为 `0x7e0`；随后按 `i%3` 分支更新计数器并取出密钥下标（+3/+5/+7，分别配合 %13/&0xF/%15），再执行 `cipher[i]=plain[i]^key[idx]`；结果通过 `fputs` 写入 `/sdcard/reg.dat`，`initSN` 读回后用 `strcmp` 与内置目标比对，相等则置 `m=1`。
> - **工具注意点：** macOS 自带的 `objdump` 会把 Thumb-2 代码当作 ARM 指令解码，导致整段错位；因此改用 `capstone(CS_MODE_THUMB)` 配合 `pyelftools`，按符号边界分段反汇编，同时用 `jadx` 反编译 APK。
> - **回环验证：** 使用同一套下标序列对 `201608Am!2333` 正向加密，输出恰好为 `EoPAoY62@ElRD`，确认算法与 flag 无误；严格输入 13 字节明文即可通过校验。

## 第 0 步：环境与工具准备

分析机为 macOS（自带 `objdump` 对 ARM Thumb-2 支持不完善，后面会踩坑），因此准备了一套 Python 逆向环境：

```bash
# 1. 建立隔离 venv（managed python）
VENV=~/.workbuddy/binaries/python/envs/default
python3 -m venv "$VENV"
"$VENV/bin/pip" install capstone pyelftools

# 2. 关键命令
jadx xman.apk            # Java 层反编译
file / strings / nm / objdump   # 原生库静态信息
python (capstone + pyelftools)  # 精确的 Thumb-2 反汇编
```

需要用到的核心 Python 库：

-   **capstone**：把 `.text` 机器码按 **Thumb-2** 正确反汇编（macOS 自带 objdump 会误判为 ARM）。
-   **pyelftools**：解析 ELF 段/节/符号表，做虚拟地址↔文件偏移换算。

* * *

## 第 1 步：识别文件类型

```bash
$ file libmyjni.so xman.apk
libmyjni.so: ELF 32-bit LSB shared object, ARM, EABI5 version 1 (SYSV), dynamically linked, stripped
xman.apk:     Zip archive data (Android package)
```

结论：

-   `xman.apk` 是 Android 安装包，用 `jadx` 直接反编译 Java 层。
-   `libmyjni.so` 是 **32 位 ARM 动态库**，符号被 strip（只保留 `initSN/saveSN/n1/n2/n3/callWork/JNI_OnLoad` 等少数符号），核心逻辑在原生代码里。

* * *

## 第 2 步：原生库静态侦察（strings / 动态符号）

### 2.1 提取可读字符串

```bash
$ strings -n 4 libmyjni.so
...
JNI_OnLoad
g_env
native_class
getValue / setValue / callWork
fopen / fread / fputs / strcmp / strlen
/sdcard/reg.dat
W3_arE_whO_we_ARE
EoPAoY62@ElRD
com.gdufs.xman
输入即是flag,格式为xman{……}！
打开文件失败
```

关键线索已经浮现：

-   程序会在 `/sdcard/reg.dat` 读写文件（ `fopen/fread/fputs` ）。
-   存在两个可疑字符串： `W3_arE_whO_we_ARE` （很像密钥）和 `EoPAoY62@ElRD` （很像密文/目标）。
-   `输入即是flag,格式为xman{……}！` 明确告诉我们：用户输入即 flag 内容，包装格式为 `xman{...}` 。

### 2.2 动态符号表（函数入口地址）

```bash
$ nm -D libmyjni.so
00001320 T getValue
00001364 T setValue
000013b0 T n1
000011f8 T n2
00001444 T callWork
000014cc T n3
00001508 T JNI_OnLoad
```

这些就是原生函数的真实入口地址，后面反汇编就按这些地址切分函数。

* * *

## 第 3 步：Java 层分析（jadx）

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/738bcbbcf43ec621.webp)

### 3.1 反编译

```bash
$ jadx -d jadx_out -j 4 xman.apk
```

### 3.2 包结构与调用关系

包名 `com.gdufs.xman` ，三个关键类：

**MyApp（Application 子类）**

```java
public class MyApp extends Application {
    public static int m;                  // 0=未注册 1=已注册 其他=状态异常
    public static native void initSN();
    public static native void saveSN(String sn);
    public static native void work();

    @Override
    public void onCreate() {
        super.onCreate();
        initSN();                         // 启动时读取并校验注册状态
    }
}
```

**MainActivity**

```java
// 按钮点击逻辑（整理后）
if (MyApp.m == 0) {
    // 未注册 → 跳转到输入注册码界面
    startActivity(new Intent(this, RegActivity.class));
} else {
    work();   // 已注册 → 调用原生 work()，结果通过 MainActivity.work(String) 回调显示
}
// 原生 work() 内部会回调 MainActivity.work(String result)
```

**RegActivity**

```java
// 用户在编辑框输入 sn，点确定：
MyApp.saveSN(et.getText().toString());   // 交给原生 saveSN 加密保存
// 然后杀掉进程（下次启动由 initSN 重新判定）
```

### 3.3 Java 层结论

-   注册码由用户从 `RegActivity` 输入，经 `saveSN` 写进 `/sdcard/reg.dat` （加密后的数据）。
-   下次 App 启动， `MyApp.onCreate()` 调 `initSN()` 读回 `reg.dat` ，与内置目标比对，决定 `m` 的值。
-   `work()` 在 `m==1` 时把 flag 通过 `MainActivity.work(String)` 回调显示出来。
-   **java 层本身不含任何密钥/校验逻辑**，真正算法全在 `libmyjni.so` 。因此下一步必须啃原生代码。

* * *

## 第 4 步：原生层反汇编（踩坑：Thumb-2 vs ARM）

### 4.1 第一次尝试失败

```bash
$ objdump -d libmyjni.so | head
000011f8 <n2>:
    e92d 6803   push    {r0, r1, r11, lr}   # 这条在 ARM 模式下是错的
```

`push {r0, r1, ...}` 在 ARM 指令集里根本不合法 → 说明这些函数是用 **Thumb-2** 编译的，但 `objdump` 当成 ARM 解码，整段错位。

### 4.2 改用 Capstone 按 Thumb-2 精确反汇编

由于 macOS 的 `objdump` 不支持 `force-thumb` ，写 Python 脚本用 Capstone 解码：

```python
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB

elf = ELFFile(open("libmyjni.so", "rb"))
text = elf.get_section_by_name(".text")
code = text.data()
base = text["sh_addr"]
md = Cs(CS_ARCH_ARM, CS_MODE_THUMB)

# 按符号表给出的函数边界逐函数反汇编（避免整段错位）
for name, addr, end in [("n2",0x11f8,0x13b0), ("n1",0x13b0,0x1444),
                         ("n3",0x14cc,0x1508), ("JNI_OnLoad",0x1508,0x1600)]:
    print(f"===== {name} =====")
    for insn in md.disasm(code[addr-base:end-base], addr):
        print(f"{insn.address:#08x}: {insn.mnemonic} {insn.op_str}")
```

反汇编结果片段（ `n2` 开头）：

```python
000011f8: push.w  {r4, r5, r6, r7, r8, sb, sl, lr}
000011fc: mov     r6, r0
000011fe: ldr     r4, [pc, #0x108]
00001200: sub     sp, #0x18
00001202: ldr     r0, [pc, #0x108]
...
0000125e: mov.w   r4, #0x7e0          # ← 关键：运行计数器 r4 初值 0x7e0
...
0000127e: movs    r1, #3
00001280: blx     #0x16c8            # 调用一个取模运算 (i % 3)
00001284: cmp     r1, #1
00001286: bne     #0x12a8
...                              # i%3 == 1 分支
0000128a: adds    r4, #5
0000128c: ands    r3, r4
...
000012a8: cmp     r1, #2
000012aa: bne     #0x12c0
...                              # i%3 == 2 分支
000012ac: adds    r0, r4, #7
...
000012c0: adds    r0, r4, #3          # i%3 == 0 分支
...
000012d2: ldrb    r3, [r5]           # 取出明文第 i 字节
000012d6: adds    r5, #1
000012d8: eors    r3, r2             # ← 与密钥字节 XOR
000012da: strb    r3, [r5, #-0x1]    # 存回（密文）
```

至此确认 `n2` 就是一个 **逐字节 XOR 加密函数**：

1.  `fopen("/sdcard/reg.dat", "w+")` 打开文件；
2.  把 18 字节密钥结构从 rodata 拷到栈上；
3.  对输入字符串逐字节，用由 `r4` （初值 `0x7e0` ）派生出的密钥索引取密钥字节，做 XOR；
4.  `fputs` 把结果写入 `reg.dat` 。

* * *

## 第 5 步：确认 Java 方法 ↔ 原生函数 的映射

静态区 `.data` 中保存了 `JNINativeMethod` 结构体数组（三要素： `{方法名指针, 签名指针, 函数指针}` ）。该数组在文件偏移 `0x4004` 处，用 Python 解析：

```python
from elftools.elf.elffile import ELFFile
elf = ELFFile(open("libmyjni.so", "rb"))
data = open("libmyjni.so", "rb").read()

# JNINativeMethod 数组（3 项，每项 12 字节）
base = 0x4004
arr = data[base:base+3*12]
for k in range(3):
    e = arr[k*12:k*12+12]
    name_p = int.from_bytes(e[0:4], "little")   # 方法名 vaddr
    sig_p  = int.from_bytes(e[4:8], "little")   # 签名 vaddr
    fn     = int.from_bytes(e[8:12], "little")  # 原生函数 vaddr (+1 表示 Thumb)
    # 通过 PT_LOAD 把 vaddr 换算成文件偏移，读出字符串
    ...
    print(name, fn)
```

解析结果：

| Java 方法 | 签名  | 原生函数（Thumb 地址） | 真实地址 | 对应符号 |
| --- | --- | --- | --- | --- |
| `initSN` | `()V` | `0x13b1` | `0x13b0` | **n1** |
| `saveSN` | `(Ljava/lang/String;)V` | `0x11f9` | `0x11f8` | **n2** |
| `work` | `()V` | `0x14cd` | `0x14cc` | **n3** |

> 函数指针 (`0x13b1/0x11f9/0x14cd`) 末尾的 `+1` 是 ARM/Thumb 调用约定（bit0=1 表示 Thumb 代码）。

* * *

## 第 6 步：逐个函数分析算法

### 6.1 n2（= saveSN，地址 0x11f8）—— 加密写入

逻辑梳理（结合反汇编 + 字面池）：

1.  `fopen("/sdcard/reg.dat", "w+")` （路径来自 rodata `0x2da8` ，模式 `w+` 来自 `0x2db8` ）。
2.  把 18 字节密钥结构从 rodata `0x2ddd` 拷到栈（通过 `ldr r0,[pc,...]` + `stm` 批量拷贝）： `0x2ddd: 'W3_arE_whO_we_ARE\0'` （17 字符 + 1 个 0x00 = 18 字节）。
3.  取输入字符串长度 `strlen` ，循环：
    -   计算 `rem = i % 3` （调用一个 `__modsi3` 之类的辅助函数，地址 `0x16c8` ）；
    -   根据 `rem` 用不同步长推进计数器 `r4` （初值 `0x7e0` ）并算出密钥下标 `idx` ：
        
        | `rem = i%3` | `r4` 更新 | 密钥下标 `idx` |
        | --- | --- | --- |
        | 0   | `r4 = (r4 + 3) % 13` | `idx = r4 + 3` |
        | 1   | `r4 = (r4 + 5) & 0xF` | `idx = r4 + 1` |
        | 2   | `r4 = (r4 + 7) % 15` | `idx = r4 + 2` |
        
    -   `cipher[i] = plain[i] ^ key_struct[idx]`
4.  `fputs(cipher, fp)` 写入 `reg.dat` ， `fclose` 。

### 6.2 n1（= initSN，地址 0x13b0）—— 校验注册状态

反汇编尾部（从 `strcmp` 开始，地址 `0x1410` 起）：

```python
00001410: ldr   r1, [pc, #0x2c]   ; 字面池 → 目标字符串指针
00001412: strb.w r8, [r5, r7]     ; 在缓冲区末尾补 '\0'
00001416: mov   r0, r5
00001418: add   r1, pc
0000141a: blx   #0x1168           ; ← 调用 strcmp(content, TARGET)
0000141e: cbnz  r0, #0x1426       ; 不相等 → 跳 1426
00001420: mov   r0, r6
00001422: movs  r1, #1            ; 相等 → setValue(obj, 1)  ← 注册成功
00001424: b     #0x142a
00001426: mov   r0, r6
00001428: mov   r1, r8            ; 不相等 → setValue(obj, 0)
0000142a: bl    #0x1364           ; setValue
```

字符串指针解析（PC 相对 + 字面池）：

-   `fopen` 路径 `0x2da8` (`/sdcard/reg.dat`)，模式 `0x2e08` (`r+`)。
-   `strcmp` 的 **目标字符串** 位于 rodata `0x2e0b` ： `0x2e0b: 'EoPAoY62@ElRD'` （13 字节）。

**核心结论**： `initSN` 把 `reg.dat` 读出来后，只要 `strcmp(content, "EoPAoY62@ElRD") == 0` ，就把状态置为 `m=1` （注册成功）。也就是说，写进 `reg.dat` 的内容必须等于密文 `EoPAoY62@ElRD` 。

### 6.3 n3（= work，地址 0x14cc）—— 回显提示

```python
000014cc: bl #0x13b0        ; 先调 initSN 刷新 m
000014d4: bl #0x1320        ; getValue(obj) 读取 m
000014da: cbnz r0, #0x14e4  ; m != 0
000014dc: ... string '还不行呢！'        (m==0：未注册)
000014e4: cmp r0, #1
000014ea: ... string '输入即是flag,格式为xman{……}！'  (m==1：提示 flag 格式)
000014f0: ... string '状态不太对。。'     (其他：异常)
```

`work` 仅根据 `m` 显示提示文本， **不会直接把 flag 字符串回显**——flag 就是能让你通过 `initSN` 校验的那个输入。

* * *

## 第 7 步：提取密钥、密文与偏移参数

把第 2~6 步得到的关键常量汇总：

| 项目  | 值   | 来源  |
| --- | --- | --- |
| 密钥结构 `key_struct` | `W3_arE_whO_we_ARE\0` （18 字节） | rodata `0x2ddd` |
| 校验目标（密文） | `EoPAoY62@ElRD` （13 字节） | rodata `0x2e0b` |
| 计数器初值 | `r4 = 0x7e0` | `n2` @ `0x125e` |
| 索引算法 | 见 6.1 表格 | `n2` @ `0x1280-0x12ce` |

关系推导：

-   `saveSN` 写入： `reg.dat = XOR(用户输入)` 。
-   `initSN` 校验： `strcmp(reg.dat, "EoPAoY62@ElRD") == 0` 。
-   联立得： **XOR(用户输入) == "EoPAoY62@ElRD"**。
-   因为 XOR 是自反运算，且加密/解密使用同一套下标序列，所以：  
    **用户输入 = XOR_decrypt("EoPAoY62@ElRD")**。

* * *

## 第 8 步：逐字节还原 flag（含完整计算表）

按 `n2` 的索引算法，对密文 `EoPAoY62@ElRD` （下标 `i = 0..12` ）逐字节逆 XOR：

| i   | i%3 | r4(前) | r4(后) | idx | key\[i\]=struct\[idx\] | 密文 ct | 明文 pt = ct^key |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0   | 0   | 0x7e0 | 0x04 | 7   | `w` (0x77) | 0x45 `E` | 0x32 `2` |
| 1   | 1   | 0x004 | 0x09 | 10  | `_` (0x5f) | 0x6f `o` | 0x30 `0` |
| 2   | 2   | 0x009 | 0x01 | 3   | `a` (0x61) | 0x50 `P` | 0x31 `1` |
| 3   | 0   | 0x001 | 0x04 | 7   | `w` (0x77) | 0x41 `A` | 0x36 `6` |
| 4   | 1   | 0x004 | 0x09 | 10  | `_` (0x5f) | 0x6f `o` | 0x30 `0` |
| 5   | 2   | 0x009 | 0x01 | 3   | `a` (0x61) | 0x59 `Y` | 0x38 `8` |
| 6   | 0   | 0x001 | 0x04 | 7   | `w` (0x77) | 0x36 `6` | 0x41 `A` |
| 7   | 1   | 0x004 | 0x09 | 10  | `_` (0x5f) | 0x32 `2` | 0x6d `m` |
| 8   | 2   | 0x009 | 0x01 | 3   | `a` (0x61) | 0x40 `@` | 0x21 `!` |
| 9   | 0   | 0x001 | 0x04 | 7   | `w` (0x77) | 0x45 `E` | 0x32 `2` |
| 10  | 1   | 0x004 | 0x09 | 10  | `_` (0x5f) | 0x6c `l` | 0x33 `3` |
| 11  | 2   | 0x009 | 0x01 | 3   | `a` (0x61) | 0x52 `R` | 0x33 `3` |
| 12  | 0   | 0x001 | 0x04 | 7   | `w` (0x77) | 0x44 `D` | 0x33 `3` |

拼接明文： `2 0 1 6 0 8 A m ! 2 3 3 3` → **201608Am!2333**

> 注意：密钥字节 `struct[idx]` 在 `i%3==0/1/2` 时分别对应 `w` / `_` / `a` ，因此密文每 3 字节循环出现 `E o P` / `A o Y` / `6 2 @` / `E l R` / `D` ，与 `EoPAoY62@ElRDEoP` 的周期性完全吻合，进一步佐证算法正确。

* * *

## 第 9 步：回环验证（必须做，确认不是巧合）

用同样的算法正向加密，应当还原出密文：

```python
struct = b"W3_arE_whO_we_ARE\x00"
def key_index(i, r4):
    rem = i % 3
    if   rem == 1: r4 = (r4 + 5) & 0xF; idx = r4 + 1
    elif rem == 2: r4 = (r4 + 7) % 0xF; idx = r4 + 2
    else:          r4 = (r4 + 3) % 0xD; idx = r4 + 3
    return idx, r4

def xor(data):
    out = bytearray(len(data)); r4 = 0x7e0
    for i in range(len(data)):
        idx, r4 = key_index(i, r4)
        out[i] = data[i] ^ struct[idx]
    return bytes(out)

serial = b"201608Am!2333"
print(xor(serial))            # -> b'EoPAoY62@ElRD'
print(xor(serial) == b"EoPAoY62@ElRD")   # True
```

````python

**运行输出：**

```text
b'EoPAoY62@ElRD'
True
````

**加密 `201608Am!2333` 得到密文 `EoPAoY62@ElRD` ，与 `initSN` 内置目标完全一致** → 注册码正确无误。

* * *

## 第 10 步：最终结论

| 项   | 内容  |
| --- | --- |
| 实际校验通过的注册码（flag 内容） | `201608Am!2333` |
| 按题目给定格式包装后的 flag | `xman{201608Am!2333}` |
| 输入位置 | `RegActivity` 的注册码输入框（或直接把 `xman{201608Am!2333}` 中的纯内容 `201608Am!2333` 写入 `/sdcard/reg.dat` 亦可） |

> 说明：原生层 `strcmp` 比较的是 13 字节密文，因此 **严格输入 `201608Am!2333`** 即可完成注册； `xman{}` 是题目在 rodata 提示里指定的 flag 包装格式（ `输入即是flag,格式为xman{……}！` ）。

**最终 Flag： `xman{201608Am!2333}`**

* * *

## 附录 A：完整攻击链（一句话串联）

`RegActivity` 输入 → `saveSN(n2)` 用密钥 `W3_arE_whO_we_ARE\0` + 计数器 `0x7e0` 逐字节 XOR 加密 → 写入 `/sdcard/reg.dat` → 下次启动 `initSN(n1)` 读回并 `strcmp` 比对内置目标 `EoPAoY62@ElRD` → 相等则 `m=1` → `work(n3)` 提示成功。反向 `XOR_decrypt("EoPAoY62@ElRD")` 即得能注册通过的内容 `201608Am!2333` ，套用 `xman{}` 即最终 flag。

## 附件

- [xman.apk](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/3f82b2883218fff7.apk) （1.30MB，0次下载）
- [disasm_so.py](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/d955157b4495cbe1.py) （1.30kb，0次下载）
