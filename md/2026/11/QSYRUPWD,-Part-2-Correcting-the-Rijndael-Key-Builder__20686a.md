---
title: "QSYRUPWD, Part 2: Correcting the Rijndael Key Builder"
source: https://blog.silentsignal.eu/2026/10/29/qsyrupwd-part-2-correcting-the-rijndael-key-builder/
source_host: blog.silentsignal.eu
clip_date: 2026-11-13T10:37:23+08:00
trace_id: 3c604cb0-a8ab-4737-8451-2d57dfc2b389
content_hash: cb2175e03e8a54fb1af2d5b1aa9bd67e3ba7e5f35c127a619d6d1b1689bdd95b
status: synced
tags:
  - 密码学
  - 协议分析
series: null
feed_source: Silent Signal·IBM i漏洞研究
ai_summary: IBM i 的 QSyrupwd 密码恢复解密器在此被修正：Rijndael 密钥由 `QSYS/` 中程序的 32 字节缓冲区升序插入排序生成，在近 900 个真实 API 接收变量上全部解密成功。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41775244-d011-81b9-821a-cea0fa2e41df
ioc:
  cves: []
  cwes: []
  hashes:
    - 00000000001a2040404040444f5d5d5f6480a7aeb3b3b5c2c5d9e2e4e6f1f8fc
    - 00000000002f404040404040404040404040444575858894a7c2c5d9e2e4f1f6
    - 000000000040404040404040404040404040404040404044c4c5c5d4d6d9e2e4
    - 0000000000b35df85fa7e6b31a4fae64805dfc20b544e4e2c5d9c2f140404040
    - 01212d38c2a8e8618d048a3f31cbb358ecf5985ce61be7d7a90e31610ae65194
    - 0843ad67cd610bfda2b47d196dbe0698
    - 0843ad67cd610bfda2b47d196dbe06980843ad67cd610bfda2b47d196dbe0698
    - 1d9d980817d6d26093e8385202143e33
    - 3104519288611bfcdf9f3d78256c24a454e69d8009ff3685c675036b0134289b
    - 59dafb9997ac78be1f54f510a64e6738
    - 5f76ae5e678c1538227f3294282b4fb2
    - 70a64e6738bc1f54f5105297ac78beff59dafb99
    - 70a64e67bc1f54f55297ac78ff59dafb
    - 8e181d9d980817d6d26093e8385202143e33bc7f
    - 8e185f76ae5e678c1538227f3294282b4fb2bc7f
    - 9c7f1db35e8672f4092bcb4dce7cd9388aab5e72b911a05d0a52dbf50bfb1a2e
    - a6e9b0ab56f1ec74b487c4348b6c47e9
    - b4f907470b303e9e2b7a643fa0668d4f
    - c148042ab4fca750c1880108fc5d69e7
    - c5aa375083e941c2deeed5df68d228d4425a05c1454a07658307e782912e52d6
    - e222069c370d86e2713ee253127528a1
    - e69089d21802b85bee54e00e3f9560e43f66fd4590b2c777b2c317b0d69484d0
    - f4a166bdbe948ea0e54bfc0b99d2e7fd7059ce07a9f54d4705bb0fd50bbd06fe
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> IBM i 的 QSyrupwd 密码恢复解密器在此被修正：Rijndael 密钥由 `QSYS/` 中程序的 32 字节缓冲区升序插入排序生成，在近 900 个真实 API 接收变量上全部解密成功。
> 
> - **密钥构造修正：** 旧模型按 8 字节槽位拆分并剥离 `0x40` 填充是错的；真实算法是把 `00×5 ‖ des_plaintext_16 ‖ format_byte ‖ username_cp037_10` 共 32 字节做无符号升序插入排序（31 轮外层循环），分量顺序无关紧要，只有字节的值和重复次数有意义。
> - **验证结果：** 在 IBM i 7.5（QPWDLVL 2）系统上近 900 个 receiver 中，所有含 192 字节 QZLS 密文的记录（含 format byte `T` 和双槽位记录）均用同一公式解密，且明文前 10 字节 EBCDIC 用户名与 receiver 8..17 完全匹配，作为廉价 oracle。
> - **固定偏移很关键：** 变长外层标记是 receiver 偏移 93 的单字节（后跟固定 `40F0`），不能当作 QPWDlvl 系统值（实测可为 0/1/2/0x40）；摘要 D 固定在 1980..1999，向后搜索会算错 AES 密钥。旧文误读的 `0240F0` 等是 Zero_2 的零字节拼接。
> - **各字段解包：** legacy 区（19..34）若全 `0x40` 直接作 des_plaintext_16，否则用 AES-ECB 密钥 `D[1..4]‖D[6..9]‖D[11..14]‖D[16..19]` 解包两个 8 字节槽；SHA-1 包装（53..72）用切片序 `D[17..20]‖D[12..15]‖D[7..10]‖D[2..5]` 的 AES 密钥，包装为 2 字节明文前缀+16 字节加密核+2 字节明文后缀；QZLS 是 Rijndael-256/256-CBC（普通 AES 库不够，块大小 128 位），IV 为 MD5(username) 重复两次。
> - **NT 字段与风险：** QZLS 明文 54..69 与 70..85 为两个 NT token（layout 2 中恒相同，layout 1 几乎总不同，意义未证）；调用该 API 需 `*ALLOBJ`+`*SECADM`，legacy DES verifier 仅保留可转为大写等价（≤10 字符受限字符集）的密码，离线搜索空间远小于现代密码策略，建议限制/监控高权限配置文件并防跨系统密码复用。

The Rijndael key builder in [Part 1](https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/) worked for the first set of samples, but its split-buffer model was wrong. QSYS/QZLSRTPW builds one 32-byte value, `00×5 ‖ des_plaintext_16 ‖ format_byte ‖ username_cp037_10`, and insertion-sorts all 32 bytes in ascending order. I tested the corrected decoder against almost 900 `QSYRUPWD` API output buffers, which IBM i calls *receiver variables*. The decoder decrypted the 192-byte QZLS ciphertext field in every receiver that contained it and reproduced its embedded username.

There are several other corrections. The variable outer marker is the single byte at receiver offset 93, followed by fixed bytes `40F0`, and the seven-byte interpretation came from adjacent zero-filled data. That marker cannot be treated as a reliable copy of [`QPWDLVL`](https://www.ibm.com/docs/en/i/7.5.0?topic=passwords-password-level-qpwdlvl), the IBM i password-level system value. The corrected one-based SHA-1 slice order is `D[17..20] ‖ D[12..15] ‖ D[7..10] ‖ D[2..5]`.

Receiver and decrypted-plaintext offsets in this post are zero-based. Digest notation `D[1]` through `D[20] is one-based. IBM documents` QSYRUPWD\` as an API that returns one-way encrypted password data for a specified user profile to an authorized caller. The byte-level names below are my reverse-engineering labels. IBM does not publish this layout as a data contract, and it may change between releases. IBM’s API documentation is available under [Retrieve Encrypted User Password (QSYRUPWD)](https://www.ibm.com/docs/en/i/7.5.0?topic=q-retrieve-encrypted-user-password-qsyrupwd).

## How the corpus broke the old model

My original key builder explained the examples I had at the time. It treated the legacy DES-verifier area as smaller pieces, stripped padding in some paths, and grew special cases around the assumed boundary. The plaintext looked right and the known hash cracked, so I moved on.

Later I ran it against a larger corpus from a separate IBM i 7.5 system configured with `QPWDLVL` 2. Many profiles had both eight-byte legacy slots populated, and several dozen used format byte `T` (`0x54`) instead of `D` (`0x44`). Receivers that looked similar combined different outer markers and decrypted layouts. A wrong key still returned 192 bytes of plaintext-shaped noise, which made failures less obvious than I would have preferred.

The decrypted `QZLS` structure starts with the same ten-byte EBCDIC username stored in the receiver. I used that as a cheap oracle and rejected a key unless plaintext bytes 0..9 matched receiver bytes 8..17 exactly.

I first preserved the two eight-byte halves. Then I tried stripping `0x40` padding and moving bytes across the boundary when the second slot was populated. Hard-coding D survived until the first T record. Records with two populated slots failed in one branch, while T records failed in another. Empty legacy areas worked only under assumptions that contradicted the populated cases.

At that point I went back to the generated instructions in `QSYS/QZLSRTPW` and followed the byte loads and stores around the key buffer. The loop was insertion sort.

The first successful records had one populated slot followed by eight `0x40` bytes. This synthetic shape explains why the original model looked plausible:

```
B35DF85FA7E6B31A 4040404040404040
| populated slot | empty slot     |
```

The full synthetic fixture later in this post uses both slots:

```
B35DF85FA7E6B31A 4FAE64805DFC20B5
| populated slot | populated slot |
```

The same loop handles both shapes without a separate key-building branch.

## Receiver layout

The observed 2,000-byte receiver in IBM’s [`UPWD0100` format](https://www.ibm.com/docs/en/i/7.5.0?topic=q-retrieve-encrypted-user-password-qsyrupwd) has the following layout. The table includes fields that document the surrounding Machine Interface (MI) CIPHER call chain even when the current decoder does not consume them:

| Receiver offsets | Length | Observed purpose |
| --- | --- | --- |
| 0..3 | 4   | Bytes returned, big-endian |
| 4..7 | 4   | Bytes available, big-endian |
| 8..17 | 10  | `0x40` -padded EBCDIC username |
| 18  | 1   | Format byte, D or T |
| 19..34 | 16  | Wrapped or null legacy DES area |
| 35..51 | 17  | Internal zero/padding area (Zero_1); unused by this recovery path |
| 52  | 1   | Fixed 05 byte |
| 53..72 | 20  | Wrapped or null SHA-1 area |
| 73..92 | 20  | Internal zero/padding area (Zero_2); unused by this recovery path |
| 93  | 1   | Outer marker |
| 94..95 | 2   | Fixed 40F0 |
| 96..287 | 192 | QZLS Rijndael ciphertext or a 0x40-filled null field |
| 288..319 | 32  | CBC chaining value produced by the third QZLSRTPW CIPHER |
| 320..383 | 64  | Block returned by the fifth QSYRUPWD CIPHER |
| 384..1979 | 1,596 | Remaining internal/padding area; unused here |
| 1980..1999 | 20  | Key-derivation digest D |

[Part 1](https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/) attributed NT recovery to the fifth `QSYRUPWD` CIPHER. Its own captured control block describes that call as a 64-byte ECB operation. The NT fields recovered here come from the plaintext of the 192-byte field at 96..287, produced by the third `QZLSRTPW` CIPHER with a 32-byte key, 32-byte blocks, and CBC mode. The fifth-call output is the separate 64-byte field at 320..383.

The chaining value and fifth-CIPHER block remain useful when reconstructing the complete CIPHER call chain. They exist in the observed receiver, but the current decoder does not use or export bytes 288..383.

Fixed offsets matter. The search pattern `00000000000240F0` is eight bytes and pulls zeroes from Zero_2 into the incorrectly inferred seven-byte marker `000000000240F0`. Trimming trailing zeroes and searching backward can also shift the digest away from 1980..1999 and quietly derive the wrong AES key.

I do not know what format byte `T` means semantically. The program includes its literal value (`0x54`) in the same key input position used by `D` (`0x44`), so I preserve it.

## The insertion sort and reconstructed key

The excerpt below comes from MAIN in `QSYS/QZLSRTPW`, a `*PGM`. I omitted unrelated setup and compiler-generated bounds checks.

Instruction locations are shown as decimal offsets in my disassembly listing.

```yaml
9504:   ADDI 19,0,1
        ... unrelated instructions omitted ...
9560:   LBZ 7,0XFDE1(31)
9564:   ADDI 5,19,-1
        ... bounds checks omitted ...
9588:   LBZ 11,0X220(4)
9592:   CMP 0,0,11,7
9596:   BC 4,1,0X38
        ... bounds checks omitted ...
9624:   STB 11,0X220(10)
        ...
9660:   ADDI 9,5,-1
        ... bounds checks omitted ...
9692:   LBZ 11,0X220(4)
9696:   CMP 0,0,11,7
9700:   BC 12,1,0XFFA0
9708:   ADDI 10,19,1
        ... bounds checks omitted ...
9724:   EXTSW 19,10
        ... bounds checks omitted ...
9744:   STB 7,0X220(8)
9752:   CMPLI 0,0,10,32
9760:   BC 12,0,0XFF88
```

The compiler reuses registers, so their roles depend on the instruction being executed.

`r19` holds the outer index `i`. At the end of the outer loop, `r10` holds `i + 1`, and `r19` is updated from it.

`LBZ 7,0XFDE1(31)` loads the saved current byte into `r7` from a compiler frame slot populated earlier. `r31` is the frame base for that load.

Inside the backward scan, `r5` is the active index `j`, initialized to `i - 1`. `r9` temporarily holds `j - 1`, and omitted bounds and copy instructions feed it into the next inner-loop iteration. `r11` holds `key[j]`.

The memory accesses show the address-register roles. `LBZ 11,0X220(4)` uses `r4` for `key[j]`. `STB 11,0X220(10)` uses `r10` for the right-shift store, and `STB 7,0X220(8)` uses `r8` for the final insertion. The compiler later reuses `r10` for `i + 1`.

In ordinary pseudocode:

```python
for i in range(1, 32):
    current = key[i]
    j = i - 1
    while j >= 0 and key[j] > current:
        key[j + 1] = key[j]
        j -= 1
    key[j + 1] = current
```

The assembly reloads current, shifts greater bytes one position to the right, and inserts the saved byte before advancing the outer index.

Later in the same program path, `QZLSRTPW` stores the value 32 in the CIPHER controls and invokes selector 346:

```yaml
10036:  ADDI 19,0,32
10056:  STB 19,0XFED6(31)
        ... control setup omitted ...
10168:  ADDI 3,31,-1056
10172:  ORI 4,16,0
10176:  ORI 5,17,0
10180:  ADDI 10,0,346
10184:  SCV 10
```

[Part 1](https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/) identified selector 346 as the CIPHER MI service. SCV 10 crosses from generated `QZLSRTPW` program code into the Licensed Internal Code (LIC) implementation.

The bytes going into the sort are:

```
00×5 ‖ des_plaintext_16 ‖ format_byte ‖ username_cp037_10  (5 + 16 + 1 + 10 = 32)
```

The final key is the ascending unsigned-byte sort of that value:

```python
rijndael_key = bytes(sorted(
    b"\x00" * 5
    + des_plaintext_16
    + bytes([format_byte])
    + username_cp037_10
))
```

Because the buffer is sorted, the original order of its components does not matter. Only the values and repetition count of the 32 input bytes matter.

The outer index starts at 1 and stops when it reaches 32, so the sort processes the 32-byte buffer in 31 outer iterations. The CIPHER controls set the key length to 32 bytes. Using this input reproduces the captured key and the embedded usernames across the corpus.

The raw legacy receiver field is bytes 19..34. If all 16 bytes are 0x40, the decoder treats the field as absent and uses those bytes directly as `des_plaintext_16`, as required by the `DEMOUSER` vector. Otherwise, it AES-ECB-decrypts the populated wrapper with the key below to recover `des_plaintext_16`.

`des_plaintext_16` always contributes all 16 bytes. In my decoder I call its first eight-byte half slot `B` and its second half slot `A`, following the `B ‖ A` order I used while working on the format. These are my labels, not IBM field names. A recovered slot may be empty and is represented by eight `0x40` bytes. The decoder keeps both slots at full length and does not strip those bytes before sorting. The formula also preserves the ten-byte CP037 username.

Let `D[1]` through `D[20]` denote the digest stored at receiver offsets 1980..1999. The AES-128 key for receiver bytes 19..34 is:

```
D[1..4] ‖ D[6..9] ‖ D[11..14] ‖ D[16..19]
```

For a populated wrapper, this AES-ECB step unwraps the two legacy verifier slots. Despite the historical field name, it does not execute DES.

The 20-byte SHA-1 field has its own null check. If all 20 receiver bytes are `0x40`, the decoder reports no SHA-1 value and does not run AES on that field. Non-null wrappers follow the separate SHA-1 unwrap shown below.

[Part 1](https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/) placed the fixed `0x05` inside its shorthand wrapper. The fixed byte is at receiver offset 52, immediately before the 20-byte wrapper at 53..72. The wrapper itself is a two-byte clear prefix, a 16-byte AES-encrypted core, and a two-byte clear suffix.

The `QZLS` CBC IV is derived separately:

```
iv32 = MD5(username_cp037_10) ‖ MD5(username_cp037_10)
```

`QZLS` uses Rijndael with a 256-bit key and a 256-bit block in CBC mode, and a plain AES library is not enough because AES fixes the block size at 128 bits.

The corrected formula reproduces both Rijndael keys published in [Part 1](https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/):

```
USERB1:   00000000002F404040404040404040404040444575858894A7C2C5D9E2E4F1F6
DEMOUSER: 000000000040404040404040404040404040404040404044C4C5C5D4D6D9E2E4
```

The old successful vectors still pass with the corrected sort. Reproducing the embedded ten-byte username strongly supports the legacy-field handling and the derived Rijndael key. A wrong key is very unlikely to produce those bytes by chance. Since the key input is sorted, the match cannot reveal the original order of the legacy bytes. The SHA-1 unwrap follows a different path, so this comparison does not test it. The username check also does not authenticate the rest of the `QZLS` plaintext or verify the NT fields on its own.

The synthetic USERB1 fixture below uses different legacy material, so it produces a different key.

## Synthetic USERB1 test vector

This fixture contains no captured hash material. I chose `USERB1` as the test username and `Example!42` as an invented password. The NT hashes come from that password. The legacy DES and SHA-1 values are made-up test data.

I built the Rijndael ciphertext with the derived sorted key, the MD5-based IV, and a constructed plaintext containing the NT fields. I reconstructed the SHA-1 wrapper on its own.

The fixture is cryptographically consistent, but it is not a password state that IBM i would create. `Example!42` contains `!`, which is invalid at password level 0 or 1, so a real system would not keep populated legacy DES verifiers for it.

The relevant receiver fields are:

```
username_cp037_10: E4E2C5D9C2F140404040

format_byte: 44

encrypted legacy area: E222069C370D86E2713EE253127528A1

encrypted SHA-1 wrapper: 8E185F76AE5E678C1538227F3294282B4FB2BC7F

trailing digest D: 70A64E6738BC1F54F5105297AC78BEFF59DAFB99
```

The 192-byte `QZLS` ciphertext is:

```
E69089D21802B85BEE54E00E3F9560E43F66FD4590B2C777B2C317B0D69484D0
01212D38C2A8E8618D048A3F31CBB358ECF5985CE61BE7D7A90E31610AE65194
C5AA375083E941C2DEEED5DF68D228D4425A05C1454A07658307E782912E52D6
3104519288611BFCDF9F3D78256C24A454E69D8009FF3685C675036B0134289B
F4A166BDBE948EA0E54BFC0B99D2E7FD7059CE07A9F54D4705BB0FD50BBD06FE
9C7F1DB35E8672F4092BCB4DCE7CD9388AAB5E72B911A05D0A52DBF50BFB1A2E
```

Taking the four digest slices for the legacy-area unwrap gives:

```
D[1..4]   = 70A64E67
D[6..9]   = BC1F54F5
D[11..14] = 5297AC78
D[16..19] = FF59DAFB

legacy AES key = 70A64E67BC1F54F55297AC78FF59DAFB
```

AES-ECB decryption gives two populated slots:

```
B35DF85FA7E6B31A 4FAE64805DFC20B5
|     slot B     |     slot A     |
```

Now the key. The unsorted input is:

```
0000000000B35DF85FA7E6B31A4FAE64805DFC20B544E4E2C5D9C2F140404040
```

Sorting all 32 unsigned bytes produces:

```
00000000001A2040404040444F5D5D5F6480A7AEB3B3B5C2C5D9E2E4E6F1F8FC
```

The IV is:

```
MD5(username_cp037_10) = 0843AD67CD610BFDA2B47D196DBE0698

iv32 = 0843AD67CD610BFDA2B47D196DBE06980843AD67CD610BFDA2B47D196DBE0698
```

Rijndael-256-CBC decryption yields:

| Plaintext offsets | Length | Meaning | Recovered value |
| --- | --- | --- | --- |
| 0..9 | 10  | EBCDIC username | `E4E2C5D9C2F140404040` |
| 10..51 | 42  | Zero-filled area | all zero |
| 52..53 | 2   | NT layout | `0002` |
| 54..69 | 16  | NT token 1 | `C148042AB4FCA750C1880108FC5D69E7` |
| 70..85 | 16  | NT token 2 | `C148042AB4FCA750C1880108FC5D69E7` |
| 86..191 | 106 | Trailing plaintext area | zero in this fixture |

The username match provides the structural check. The fictional password gives an independent known answer for the NT field:

```
MD4(UTF-16LE("Example!42")) = C148042AB4FCA750C1880108FC5D69E7
```

For the SHA-1 unwrap, the slice order `D[17..20] ‖ D[12..15] ‖ D[7..10] ‖ D[2..5]` gives these fixture values:

```
D[17..20] = 59DAFB99
D[12..15] = 97AC78BE
D[7..10]  = 1F54F510
D[2..5]   = A64E6738

SHA AES key = 59DAFB9997AC78BE1F54F510A64E6738
```

The stored wrapper has two clear bytes, a 16-byte encrypted core, and a two-byte clear suffix:

```
8E18 ‖ 5F76AE5E678C1538227F3294282B4FB2 ‖ BC7F
```

Decrypting the core returns:

```
1D9D980817D6D26093E8385202143E33
```

Reattaching the clear bytes produces:

```
8E181D9D980817D6D26093E8385202143E33BC7F
```

The recovered fields in this fixture are:

```yaml
DES slot B: B35DF85FA7E6B31A
DES slot A: 4FAE64805DFC20B5
SHA-1:      8E181D9D980817D6D26093E8385202143E33BC7F
NT 1:       C148042AB4FCA750C1880108FC5D69E7
NT 2:       C148042AB4FCA750C1880108FC5D69E7
outer:      2
layout:     2
```

## What the corpus showed

Every receiver that contained `QZLS` ciphertext decrypted with the same formula and reproduced its embedded username. This included all `T` records and every record with both legacy slots populated.

[Part 1](https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/) read `0240F0` and `0440F0` as password-level markers. On a system known to run at `QPWDLVL` 2, byte 93 took the values 0, 1, 2 and `0x40` and did not always match the decrypted inner layout. The outer marker alone therefore cannot reliably identify the configured password level, and an all- `0x40` legacy area does not mean a level-3 profile. IBM documents the transition behavior in [Password level (QPWDLVL)](https://www.ibm.com/docs/en/i/7.5.0?topic=passwords-password-level-qpwdlvl) and [QPWDLVL 2/3 and passwords entered at QPWDLVL 0/1](https://www.ibm.com/support/pages/qpwdlvl-23-and-passwords-entered-qpwdlvl-01). I report the configured system value, outer marker, and decrypted inner layout separately.

The `QZLS` plaintext contains adjacent 16-byte NT fields at offsets 54..69 and 70..85. In layout 2 they were always identical. In layout 1 they almost always differed, while layout 0 was mixed. When the two values differ, both are worth testing.

Two made-up case variants of the same password show how different the hashes get:

```
MD4(UTF-16LE("MixedCase7")) = B4F907470B303E9E2B7A643FA0668D4F
MD4(UTF-16LE("MIXEDCASE7")) = A6E9B0AB56F1EC74B487C4348B6C47E9
```

IBM i NetServer compatibility is one plausible explanation. Older case-insensitive password levels can accept uppercase or lowercase forms, while an NT hash is case-sensitive. IBM describes that behavior in its [NetServer password-authentication checklist](https://www.ibm.com/support/pages/checklist-netserver-password-authentication-windows). I call the fields NT token 1 and NT token 2 because their exact meaning is still unproven.

## Open questions and practical impact

I still do not know IBM’s internal names or exact semantics for the two NT fields, or what inner layout 0 represents. The reason outer markers 0, 1, 2, and `0x40` appear is also unknown. Format byte `T` changes one byte of the Rijndael key input, but its meaning is still open. I have not established whether later IBM i releases keep the same layout or whether plaintext area 86..191 is always zero. A controlled mixed-case password experiment would help with the NT-field question.

Calling `QSYRUPWD` requires the powerful `*ALLOBJ` and `*SECADM` authorities in the effective execution context. Direct use therefore requires high privileges, while an application that adopts both authorities could create an additional exposure path. I have not demonstrated such a path against `QSYRUPWD`.

The receiver exposes verifiers suitable for offline password testing, including fast NT material. On the corpus system, which ran at `QPWDLVL` 2, roughly two thirds of the profiles that carried verifiers still had at least one legacy DES verifier, and that verifier is only kept for passwords that can be converted to a level 0/1-compatible uppercase equivalent.

Under the legacy password rules, the uppercase equivalent is limited to ten characters from `A` to `Z`, `0` to `9`, `$`, `@`, `#` and `_`, and its first character cannot be a digit or an underscore. At `QPWDLVL` 2, the original password may contain lowercase or mixed-case letters as long as its uppercase form meets those restrictions. The resulting search space is much smaller than a modern password policy allows. For the cracking-speed comparison against PBKDF2, see the [benchmarks in Part 1](https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/#benchmarks).

Limit and monitor profiles and adopted-authority applications that combine `*ALLOBJ` and `*SECADM`. Review programs that adopt them, audit access to receiver data, and prevent password reuse across IBM i partitions, Windows, directories, and external applications.

## Closing

Anyone using the original split-buffer key builder should replace it with the full 32-byte sort. The old `USERB1` and `DEMOUSER` vectors still pass, while the corrected builder also handles the records that exposed the original mistake.
