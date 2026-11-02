---
title: CyberDefenders RE101 lab writeup
source: https://zx41r.dev/posts/re101/
source_host: zx41r.dev
clip_date: 2026-11-02T10:46:21+08:00
trace_id: ece4ced3-0aa9-4e71-988d-99564e6f7a66
content_hash: fd62aa3cd6d6ba96fd683628d5b758feb85557345e0292c2ca2a3eb4ae3c0158
status: synced
tags:
  - CTF
  - 恶意样本
series: null
feed_source: zx41r·恶意软件/逆向
ai_summary: TL;DR：CyberDefenders 入门逆向实验 RE101：6 个文件各用不同手法隐藏 flag，解法涵盖 Base64、JSFuck、Brainfuck、ZIP 头修复、栈字符串与自研 XOR 解密。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-81c9-88fc-da30449fc15a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：CyberDefenders 入门逆向实验 RE101：6 个文件各用不同手法隐藏 flag，解法涵盖 Base64、JSFuck、Brainfuck、ZIP 头修复、栈字符串与自研 XOR 解密。
> 
> - **编码与怪语言（Q1-Q3）：** Q1 用 `strings` 找到 Base64 串直接解码；Q2 是仅由 `[]()!+` 组成的 JSFuck，靠类型强转（`![]`=false、`+[]`=0 等）拼出任意代码，用 `node` 直接运行即可；Q3 是 Brainfuck，8 个指令（+-><[].,），用解释器执行，开头循环是在向单元填充基准值。
> - **ZIP 头修复（Q4）：** 局部文件头 0x1A 处的文件名长度字段被改成 `58 58`（22616 字节），而真实文件名 `flag.txt` 仅 8 字节；十六进制编辑器改回 `08 00` 后用 `zip -FF` 重建结构，再 `unzip -P password` 解压。
> - **栈字符串（Q5）：** ELF 程序只打印 "Nothing to see here...."，flag 字节以乱序 `mov` 写入栈帧但从未被读取，Hex-Rays 将这些 store 当死代码删除；必须查看反汇编，按栈偏移从小到大排序还原出 `flag<sTaCk_strings_LMAO>`。
> - **自研 XOR（Q6）：** 加密公式为 `((i % 0xFF) | 0xA0) ^ ((2*p) | 1)`，密钥只依赖位置；ASCII 左移丢失的最高位本为 0，故解密可用 `(cipher ^ key ^ 1) / 2`；注意终端打印的密文含杂散空格，应直接从 `.rodata` 取 32 字节。
> - **核心经验：** 反编译输出（F5）过于干净时务必核对汇编指令；工具链仅需 `strings`/`file`/`xxd`/`node`/十六进制编辑器/IDA/Python。

## Overview

|     |     |
| :--- | :--- |
| **Platform** | CyberDefenders |
| **Category** | Malware Analysis |
| **Difficulty** | Medium |
| **Focus** | Encodings, esolangs, file format repair, stack strings, custom XOR |
| **Lab Link** | [RE101](https://cyberdefenders.org/blueteam-ctf-challenges/re101/) |

Six files, a flag hidden a different way in each. Nothing hard here if you’ve seen the trick before, it’s a warmup lab.

Tools: `strings`, `file`, `xxd`, `node`, a Brainfuck interpreter, a hex editor, IDA, Python.

## Q1: MALWARE000

> I’ve used this new encryption I heard about online for my warez; I bet you can’t extract the flag!

`strings` first:

```bash
strings malware000
```

```plaintext
ZmxhZzwwb3BzX2lfdXNlZF8xMzM3X2I2NF9lbmNyeXB0aW9uPgo=
If you see this message...
```

Base64 alphabet, `=` padding. Decode it:

```bash
base64 -d <<< "ZmxhZzwwb3BzX2lfdXNlZF8xMzM3X2I2NF9lbmNyeXB0aW9uPgo="
```

**Answer:** `0ops_i_used_1337_b64_encryption`

## Q2: Just some JS

> Check out what I can do!

The file is nothing but `[]()!+`:

```javascript
[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]
+(!![]+[])[!+[]+!+[]+!+[]]+(!![]+[])[+!+[]]][([][(![]+[])[+[]]+([![]]+[][[]])
[+!+[]+[+[]]]+(![]+[])[!+[]+!+[]]+(!![]+[])[+[]]+(!![]+[])[!+[]+!+[]+!+[]]+(!!
[]+[])[+!+[]]]+[])[!+[]+!+[]+!+[]]+...
```

That’s JSFuck. It builds everything out of type coercion:

| Expression | Result |
| --- | --- |
| `![]` | `false` |
| `!![]` | `true` |
| `[][[]]` | `undefined` |
| `+[]` | `0` |
| `+!+[]` | `1` |
| `!+[]+!+[]` | `2` |

From those it gets letters (`"false"[0]` is `f`, and so on), then property access, then `Function`, then arbitrary code. It’s still plain JavaScript, so just run it. If you don’t trust it, run it in a VM.

```bash
node just_some_js
```

**Answer:** `what_a_cheeky_language!1!`

## Q3: This is not JS

> I’m tired of Javascript. Luckily, I found the grand-daddy of that lame last language!

```bash
file this_is_not_js
```

```plaintext
ASCII text, with very long lines (320)
```

```plaintext
++++++++++[>+>+++>+++++++>++++++++++<<<<-]>>>>++.++++++.-----------.++++++.
<----------.++++++++++++++++++.>++++++++.++++++++.<+++++++++++++++++.------
-----.------------.+.++++++++++.++++++++++++.++++++++++.>----.<----------.>
---.++.---.<++++++++.>+++.<------.>-----..----.+++++.<++++++.<++++++++++++++
++++++++++++++.
```

Brainfuck. Eight commands:

| Command | Meaning |
| --- | --- |
| `+` `-` | increment / decrement current cell |
| `>` `<` | move pointer right / left |
| `[` | jump past `]` if cell is zero |
| `]` | jump back to `[` if cell is non-zero |
| `.` | output cell as ASCII |
| `,` | read a byte into cell |

The opening `++++++++++[>+>+++>+++++++>++++++++++<<<<-]` is the usual trick of filling a few cells with 10, 30, 70, 100 so the rest only needs small nudges to hit each character.

```bash
brainfuck this_is_not_js
```

**Answer:** `Now_THIS_is_programming`

## Q4: Unzip Me

> I zipped flag.txt and encrypted it with the password “password”, but I think the header got messed up… You can have the flag if you fix the file

```bash
file file.zip_broken
# data

unzip file.zip_broken
# filename too long--truncating.
# flag.txtUT^I:  bad extra field length (local)
```

```bash
xxd file.zip_broken | head -n 20
```

```plaintext
00000000: 504b 0304 0a00 0900 0000 5aab 8e50 5622  PK........Z..PV"
00000010: 6795 2000 0000 1400 0000 5858 1c00 666c  g. .......XX..fl
00000020: 6167 2e74 7874 5554 0900 03dc 6296 5edc  ag.txtUT....b.^.
```

Local file header layout:

| Offset | Size | Field |
| --- | --- | --- |
| 0x00 | 4   | Signature `50 4B 03 04` |
| 0x04 | 2   | Version needed |
| 0x06 | 2   | General purpose flags |
| 0x08 | 2   | Compression method |
| 0x0A | 4   | Mod time/date |
| 0x0E | 4   | CRC-32 |
| 0x12 | 4   | Compressed size |
| 0x16 | 4   | Uncompressed size |
| 0x1A | 2   | Filename length |
| 0x1C | 2   | Extra field length |

Filename length at 0x1A is `58 58`, so 0x5858 = 22616 bytes. The name right after it is `flag.txt`, 8 bytes. Somebody overwrote the length with `XX`.

Open it in a hex editor and change `58 58` at 0x1A to `08 00`:

```bash
hexedit file.zip_broken
```

Then let `zip` rebuild the rest and extract with the password from the prompt:

```bash
zip -FF file.zip_broken --out file_fixed.zip
unzip -P password file_fixed.zip
cat flag.txt
```

**Answer:** `R3ad_th3_spec`

## Q5: MALWARE101

> Apparently, my encryption isn’t so secure. I’ve got a new way of hiding my flags!

```bash
file malware101
# ELF 64-bit LSB executable, x86-64, dynamically linked, stripped

strings malware101
# Nothing to see here....

./malware101
# Nothing to see here....
```

`strace` and `ltrace` show the same decoy.

IDA’s decompiler gives you this:

```c
__int64 __fastcall main(int a1, char **a2, char **a3)
{
  printf("Nothing to see here....\n");
  return 0;
}
```

The flag is written to the stack and never read, so Hex-Rays treats those stores as dead and drops them. The disassembly still has them:

mainproc nearpushrbpmovrbp, rspsubrsp, 1C0hmovrdi, offset format; "Nothing to see here....\\n"mov\[rbp+var_4\], 0mov\[rbp+var_1A0\], 67h; 'g'mov\[rbp+var_1A9\], 61h; 'a'mov\[rbp+var_1A3\], 72h; 'r'mov\[rbp+var_1A2\], 69h; 'i'mov\[rbp+var_1A1\], 6Eh; 'n'mov\[rbp+var_1AB\], 73h; 's'mov\[rbp+var_199\], 3Eh; '>'mov\[rbp+var_198\], 0mov\[rbp+var_1A7\], 6Bh; 'k'mov\[rbp+var_19F\], 73h; 's'mov\[rbp+var_1AE\], 61h; 'a'mov\[rbp+var_1AA\], 54h; 'T'mov\[rbp+var_1A6\], 5Fh; '\_'mov\[rbp+var_19E\], 5Fh; '\_'mov\[rbp+var_1AF\], 6Ch; 'l'mov\[rbp+var_1B0\], 66h; 'f'mov\[rbp+var_1A5\], 73h; 's'mov\[rbp+var_1A4\], 74h; 't'mov\[rbp+var_19D\], 4Ch; 'L'mov\[rbp+var_1A8\], 43h; 'C'mov\[rbp+var_19B\], 41h; 'A'mov\[rbp+var_19A\], 4Fh; 'O'mov\[rbp+var_1AD\], 67h; 'g'mov\[rbp+var_1AC\], 3Ch; '<'mov\[rbp+var_19C\], 4Dh; 'M'moval, 0call_printfmainendp

The bytes are stored out of order, so reading top to bottom gives garbage. Sort by offset:

| Offset | Hex | Char |
| --- | --- | --- |
| \-0x1B0 | 0x66 | f   |
| \-0x1AF | 0x6C | l   |
| \-0x1AE | 0x61 | a   |
| \-0x1AD | 0x67 | g   |
| \-0x1AC | 0x3C | <   |
| \-0x1AB | 0x73 | s   |
| \-0x1AA | 0x54 | T   |
| \-0x1A9 | 0x61 | a   |
| \-0x1A8 | 0x43 | C   |
| \-0x1A7 | 0x6B | k   |
| \-0x1A6 | 0x5F | \_  |
| \-0x1A5 | 0x73 | s   |
| \-0x1A4 | 0x74 | t   |
| \-0x1A3 | 0x72 | r   |
| \-0x1A2 | 0x69 | i   |
| \-0x1A1 | 0x6E | n   |
| \-0x1A0 | 0x67 | g   |
| \-0x19F | 0x73 | s   |
| \-0x19E | 0x5F | \_  |
| \-0x19D | 0x4C | L   |
| \-0x19C | 0x4D | M   |
| \-0x19B | 0x41 | A   |
| \-0x19A | 0x4F | O   |
| \-0x199 | 0x3E | \>  |

Or let Python do it:

```python
stack_data = [
    (-0x1B0, 0x66), (-0x1AF, 0x6C), (-0x1AE, 0x61), (-0x1AD, 0x67),
    (-0x1AC, 0x3C), (-0x1AB, 0x73), (-0x1AA, 0x54), (-0x1A9, 0x61),
    (-0x1A8, 0x43), (-0x1A7, 0x6B), (-0x1A6, 0x5F), (-0x1A5, 0x73),
    (-0x1A4, 0x74), (-0x1A3, 0x72), (-0x1A2, 0x69), (-0x1A1, 0x6E),
    (-0x1A0, 0x67), (-0x19F, 0x73), (-0x19E, 0x5F), (-0x19D, 0x4C),
    (-0x19C, 0x4D), (-0x19B, 0x41), (-0x19A, 0x4F), (-0x199, 0x3E),
]

stack_data.sort(key=lambda x: x[0])
flag = ''.join(chr(val) for _, val in stack_data)
print(flag)  # flag<sTaCk_strings_LMAO>
```

Always check the listing when F5 looks too clean.

**Answer:** `sTaCk_strings_LMAO`

## Q6: MALWARE201

> Ugh… I guess I’ll just roll my own encryption. I’m not too good at math, but it looks good to me!

It prints the ciphertext and a sample encryption for you:

```bash
./malware201
```

```plaintext
The encrypted flag is: "6d7861 6cdd7e657e476a4fccf7ca736855425 3dcd7d46becd bd2e11c6dded1c2"

encrypt("my message", 10) == "6f7d61676dd7ed676fdb617ddb7b71"
```

The printed hex has stray spaces in it, so take the 32 bytes straight from `.rodata`:

```plaintext
6D 78 61 6C DD 7E 65 7E 47 6A 4F CC F7 CA 73 68
55 42 53 DC D7 D4 6B EC DB D2 E1 1C 6D DE D1 C2
```

The encrypt routine, cleaned up from IDA:

```c
unsigned char* encrypt(const char* plaintext, size_t length) {
    unsigned char* output = calloc(length, 1);

    for (size_t i = 0; i < length; i++) {
        unsigned char key = ((i % 0xFF) | 0xA0);
        unsigned char transformed = (2 * plaintext[i]) | 1;
        output[i] = key ^ transformed;
    }

    return output;
}
```

So:

```plaintext
encrypted[i] = ((i % 0xFF) | 0xA0) ^ ((2 * plaintext[i]) | 1)
```

The key depends only on the position. The plaintext byte is shifted left and gets its low bit forced to 1. Shifting left loses the top bit, but flag characters are ASCII, so that bit was 0 anyway. Undo the XOR, drop the low bit, shift right:

```plaintext
temp         = encrypted[i] ^ ((i % 0xFF) | 0xA0)
plaintext[i] = (temp ^ 1) / 2
```

Check it on byte 0, `f` (0x66):

```plaintext
key       = 0xA0
(2*0x66)|1 = 0xCD
0xA0 ^ 0xCD = 0x6D   matches the first ciphertext byte

0x6D ^ 0xA0 = 0xCD
(0xCD ^ 1) / 2 = 0x66 = 'f'
```

```python
encrypted_flag = [
    0x6D, 0x78, 0x61, 0x6C, 0xDD, 0x7E, 0x65, 0x7E,
    0x47, 0x6A, 0x4F, 0xCC, 0xF7, 0xCA, 0x73, 0x68,
    0x55, 0x42, 0x53, 0xDC, 0xD7, 0xD4, 0x6B, 0xEC,
    0xDB, 0xD2, 0xE1, 0x1C, 0x6D, 0xDE, 0xD1, 0xC2
]

def decrypt_byte(encrypted_byte, index):
    key = (index % 0xFF) | 0xA0
    temp = key ^ encrypted_byte
    plaintext = (temp ^ 1) // 2
    return plaintext

flag = ''.join(chr(decrypt_byte(b, i)) for i, b in enumerate(encrypted_flag))
print(flag)
```

**Answer:** `malwar3-3ncryp710n-15-Sh17`

## Flags

| Q   | Technique | Flag |
| --- | --- | --- |
| 1   | strings + base64 | `0ops_i_used_1337_b64_encryption` |
| 2   | JSFuck | `what_a_cheeky_language!1!` |
| 3   | Brainfuck | `Now_THIS_is_programming` |
| 4   | zip header repair | `R3ad_th3_spec` |
| 5   | stack strings | `sTaCk_strings_LMAO` |
| 6   | position-keyed XOR | `malwar3-3ncryp710n-15-Sh17` |

see yaa again <3
