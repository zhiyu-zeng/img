---
title: "512 bytes at a time: reconstructing IBM i save-file checksums"
source: https://blog.silentsignal.eu/2026/10/06/512-bytes-at-a-time-reconstructing-IBM-i-save-file-checksums/
source_host: blog.silentsignal.eu
clip_date: 2026-11-13T10:36:49+08:00
trace_id: baf77a95-156c-4abd-bb34-c045384a52f7
content_hash: 17fd4a4701533ba9e51a4fe27d102bd2974de7022163c6f504e392bca56905b3
status: synced
tags:
  - Windows逆向
  - 协议分析
series: null
feed_source: Silent Signal·IBM i漏洞研究
ai_summary: SAVF 容器的两级校验和（每 512 字节记录的 12 字节 trailer 与全局 16 字节校验和）均为确定性无密钥算法，可被逆向并离线重算，从而实现 SAVF 的修复与结构性编辑。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41775244-d011-817e-b5cc-c12ba24f027f
ioc:
  cves: []
  cwes: []
  hashes:
    - 0000000272b71b3df71e6c4d4081df3f
    - 000000028e43fa214379304d4081df91
    - 11101506c8e5bcfab536ebddfb9053a4
    - "40404040404040404040404040404040"
    - 5013b87d388154fb9835f5dc8d0980ff
    - 5513f83d38b944fe9814e1dc8d0b04fe
    - 59311393322093c8527e36d903e5c4a4
    - 791ea5ec90f35d20829dc5561098c130
    - 93f81fd81523a2521cf17b234edb05155998bc7e46d88b966b4bd9eef64c0764
    - 99f1d393395a1308527e36d903e5c4a4
    - bfd84cce59a6e7993e85c8a0e1a4e9cf
    - d1d0d5c608257c3a75f62b1d3b509364
    - d3404040404000000000000000000000
    - dbf1671ed17396a03f60bd52ddf749db
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> SAVF 容器的两级校验和（每 512 字节记录的 12 字节 trailer 与全局 16 字节校验和）均为确定性无密钥算法，可被逆向并离线重算，从而实现 SAVF 的修复与结构性编辑。
> 
> - **格式结构：** SAVF 物理记录为 528 字节 = 512 字节载荷 + 16 字节 trailer（4 字节序号 + 12 字节校验值）；去掉 trailer 后的 512 字节载荷串接为逻辑流，全局校验和占据末记录载荷最后 16 字节。
> - **记录校验算法：** 逆向 jSAVF 得到算法——对序号+载荷（516 字节）做两遍移位加法归约（末两个缓冲区以 68,67 / 12,11 逆序填充），再与前 8 字节 SAVF 时间戳 XOR，重算了全部 160 条 trailer。
> - **全局校验算法：** 使用 2048 字节替换表（SHA-256 `93f81fd8…64c0764`）、两个初始态 `55×8`/`aa×8`、计数器 1/121、阈值 251/257，逐 16 字节块做环状查表 XOR、29 位左旋、计数触发位交错 shuffle；末字段自覆盖问题通过逻辑 `0x40` 处的备份恢复解决，并在两个非零备份文件上验证吻合。
> - **LIC 印证：** 同一 2048 字节表及相邻的状态种子、计数器种子与阈值完整出现在 IBM i 7.5 LIC 安装镜像（偏移 `0x42FDE8A0`）和 `QFILEMCD` 中。
> - **实证结果：** 从双对象 SAVF 中删除 TESTA 并重算依赖字段后，陈旧全局校验的副本被 IBM i 7.5 拒绝（CPDA088），修复副本被接受（CPCA081），`DSPSAVF` 仅显示 TESTB 且恢复成功（CPC3703）；该机制仅为一致性校验，不构成身份验证，IBM 另有独立的 SAVF 签名与对象校验层。

## Intro

What exactly must be recalculated when bytes inside an IBM i save file are modified?

IBM i save files, usually called SAVFs, use two container-consistency checksum mechanisms. Every 512-byte payload has a 16-byte trailer, and the logical stream also carries a 16-byte global checksum in its final payload. I wanted to understand both mechanisms well enough to reproduce them, modify a SAVF, and repair only the bytes that depended on my change.

For the reconstruction, I used a small IBM-generated SAVF and the publicly distributed jSAVF reader, whose JAR I decompiled. I reimplemented both algorithms in Python and reproduced every stored checksum in the original file. A second file contained three changed payload bytes and a stale global checksum. Repairing that container changed only the global-checksum field and the final record trailer. I also found the global algorithm’s table and adjacent constants in IBM i Licensed Internal Code (LIC) installation media.

Finally, I used the reconstructed format to remove one complete object from a two-object SAVF. A copy with valid record trailers but a stale global checksum was rejected during import. After I regenerated the global checksum and final trailer, IBM i accepted the shorter SAVF, `DSPSAVF` showed only the retained object, and that unchanged object restored successfully.

These values provide internal consistency checks for the SAVF container, but they are deterministic, unkeyed, and recomputable. They do not authenticate the source or prevent somebody from modifying a file and recalculating its checksums. IBM i has separate mechanisms for SAVF signatures and for validating the objects stored inside the container. I will return to that boundary after the reversing work.

## Building a SAVF I could modify

I wanted a small SAVF whose contents I controlled, so I created one containing a disposable program named `USERB1/CALLAES`. I disabled data compression because fixed, uncompressed payloads are much easier to compare byte for byte:

```
CRTSAVF FILE(USERB1/SAVE1)
SAVOBJ OBJ(CALLAES) LIB(USERB1) OBJTYPE(*PGM) DEV(*SAVF) SAVF(USERB1/SAVE1) DTACPR(*NO)
```

`CRTSAVF` creates the save-file object. [`SAVOBJ`](https://www.ibm.com/docs/en/i/7.5.0?topic=ssw_ibm_i_75/cl/savobj.html) saves the program into it, and `DTACPR(*NO)` keeps the data uncompressed. It does not disable either checksum layer.

I copied the SAVF directly from `/QSYS.LIB` over SCP:

```bash
scp userb1@ibmi.example:/QSYS.LIB/USERB1.LIB/SAVE1.FILE .
```

The `/QSYS.LIB/USERB1.LIB/SAVE1.FILE` path is the Integrated File System view of the SAVF object. This transfer gives me a binary file that I can inspect byte for byte.

The resulting `SAVE1.FILE` is 84,480 bytes long.

## What a SAVF looks like

I did not have to discover the outer record format from scratch. A [January 2001 MI400 post](https://archive.midrange.com/mi400/200101/msg00072.html) describes RISC SAVFs as 528-byte records: 512 data bytes, a four-byte binary record number, and a 12-byte checksum. A [2007 midrange.com discussion](https://archive.midrange.com/midrange-l/200710/msg01516.html) also describes checksum information in each 528-byte record.

That layout fits my test file exactly:

```
84,480 bytes = 160 * 528
```

Each physical record contains a 512-byte payload followed by a 16-byte trailer:

```
physical file:  | 512-byte payload | 16-byte trailer | 512-byte payload | ...
logical stream: |         512 payload bytes         |         512 payload bytes
```

Removing the trailers leaves an 81,920-byte logical stream:

```
81,920 bytes = 160 * 512
```

Once those trailers are removed, an offset inside the logical SAVF stream no longer matches the corresponding raw-file offset. I therefore use two coordinate systems:

-   a **physical offset** addresses the transferred file, including the trailers;
-   a **logical offset** addresses the concatenated 512-byte payloads.

The conversion is:

```python
def logical_to_physical(offset: int) -> int:
    return (offset // 512) * 528 + (offset % 512)
```

A modified copy named `SAVE2.FILE` appears later in the experiment. Its three payload differences from `SAVE1.FILE` show why this distinction matters:

| Logical offset | Record index | Offset in payload | Physical offset |
| --- | --- | --- | --- |
| `0x6D50` | 54  | `0x150` | `0x70B0` |
| `0x6D52` | 54  | `0x152` | `0x70B2` |
| `0x6D53` | 54  | `0x153` | `0x70B3` |

Here, `index 54` means the zero-based record index. The trailer stores a one-based sequence, so the same unit is **record #55**. Hex editors and `cmp` use physical offsets; structures inside the SAVF use logical offsets.

IBM also documents part of this outer layer. The [`CRTSAVF` documentation](https://www.ibm.com/docs/en/i/7.5.0?topic=ssw_ibm_i_75/cl/crtsavf.html) says that retrieved SAVF records carry sequencing checksum information. IBM i validates it when records are inserted and rejects changed or out-of-sequence records. That documentation covers per-record insertion checks, not the global checksum discussed later.

I did not run a separate live negative control for a corrupted record trailer. Record-level enforcement is documented by IBM; the controlled negative experiment later in this article isolates the second mechanism, the global checksum.

Other public work already covered more than the outer layout. The initial 9 August 2026 revision of the [Try-AS/400 SAVF page](https://try-as400.pocnet.net/wiki/File_Formats:SAVF), preserved as revision `1781` in its [page history](https://try-as400.pocnet.net/index.php?action=history&title=File_Formats%3ASAVF), documented the per-record folding, timestamp XOR, global overlay, and backup at logical `0x40`. It also documented the header-length and record-count fields, the item marker, name, catalogue reference, stored and total lengths, and the QSYS catalogue’s object count and descriptor layout used by the removal experiment below. The page warns that some material was generated or amended by AI and has not been checked, so I credit it as prior public documentation and validate the fields independently against my fixture and jSAVF.

This article focuses on the complete global state-machine order, tests with nonzero backups, the matching LIC data, deterministic reconstruction and repair, public test vectors, and controlled IBM i behavior.

## Reconstructing the per-record checksum

Instead of guessing standard checksum families, I looked for an existing SAVF reader. [jSAVF](https://www.anerty.net/software/file/jSAVF/?lang=en) already implemented the format, and its author credits information from the `archive.midrange.com` community, especially for IBM’s two proprietary checksum algorithms. I decompiled the distributed JAR and used its `ChunkChecker` logic as the starting point for the per-record algorithm.

The first four bytes of each 16-byte trailer are the one-based record sequence. The remaining 12 bytes are the transformed checksum value. The values are easy to see in `SAVE1.FILE`:

```
index 0   / record #1:   00000001 8f40b6a68e88a98ea91e2d60
index 1   / record #2:   00000002 af2012d24b4b7f2000004000
index 159 / record #160: 000000a0 afc501282b18f73c5c308e69
```

The decompiled code also uses the first eight bytes of the SAVF when building every record checksum. In `SAVE1.FILE`, those bytes are:

```
af2012d24b4b7f20
```

jSAVF treats this value as the SAVF timestamp and mixes it into the checksum after the reduction passes.

The main operation in the decompiled code is a shifted byte-array addition. jSAVF calls it `chkAdd`; the Python reconstruction below uses the name `chk_add`. The destination is one byte longer than the source:

```python
def chk_add(source: bytearray, destination: bytearray) -> None:
    shift_carry = 0
    add_carry = 0

    for i in range(len(source) - 1, -1, -1):
        value = source[i]
        shifted = ((value << 1) | shift_carry) & 0xff
        shift_carry = value >> 7

        total = shifted + destination[i + 1] + add_carry
        add_carry = total >> 8
        destination[i + 1] = total & 0xff

    destination[0] = (
        destination[0] + add_carry + shift_carry
    ) & 0xff
```

The source and destination are both big-endian bignums — the byte array is just one large number’s digits, most-significant byte first. `chk_add` doubles the source bignum (shift left by one bit) and adds it into the destination, which is one byte wider to hold any overflow. The bit that overflows out of the source’s top byte, plus the final carry from the addition, both land in `destination[0]`.

The algorithm starts with the four-byte sequence followed by the 512-byte payload. It reduces those 516 bytes in two passes:

| Pass | Input | Buffer lengths | Output |
| --- | --- | --- | --- |
| 1   | 516 bytes | 61 through 68 | 68 bytes |
| 2   | 68 bytes | 5 through 12 | 12 bytes |

Each pass fills eight buffers and then performs seven cascading `chk_add` operations. The unusual part is the order of the final two input slices. The first pass fills them in `68, 67` order, and the second uses `12, 11`. The accumulator chain still runs through buffer indexes 0 to 7:

```python
def reduce_once(data: bytes, input_sizes: list[int]) -> bytes:
    parts = []
    offset = 0
    for size in input_sizes:
        parts.append(bytearray(data[offset:offset + size]))
        offset += size
    assert offset == len(data)

    # Earlier input fills buffer 7; the final input fills buffer 6.
    accumulators = parts[0:6] + [parts[7], parts[6]]
    for i in range(7):
        chk_add(accumulators[i], accumulators[i + 1])
    return bytes(accumulators[7])

phase1_input = sequence.to_bytes(4, "big") + payload
phase1 = reduce_once(phase1_input, [61, 62, 63, 64, 65, 66, 68, 67])
phase2 = reduce_once(phase1,       [ 5,  6,  7,  8,  9, 10, 12, 11])
```

The last step XORs the first eight output bytes with the SAVF timestamp and prepends the sequence:

```python
result = bytearray(phase2)
for i in range(8):
    result[i] ^= timestamp[i]

record_checksum = sequence.to_bytes(4, "big") + bytes(result)
```

Record #2 gives a compact test vector. Its 512-byte payload is entirely zero. With sequence `2` and timestamp `af2012d24b4b7f20`, the calculation produces:

```
00000002 af2012d24b4b7f2000004000
```

That is exactly the trailer stored in the IBM-generated file. Running the same calculation over all 160 records also reproduces every stored trailer.

The zero payload is useful for checking the sequence handling and timestamp XOR, but it does not detect the unusual slice order. Both the correct order and a plain ascending fill produce the same zero-payload result. I therefore added a patterned record vector:

```python
payload = bytes(range(256)) * 2
sequence = 2
timestamp = bytes.fromhex("af2012d24b4b7f20")
```

The correct `68,67` and `12,11` fill order produces:

```
000000028e43fa214379304d4081df91
```

Filling the last two buffers in plain ascending order instead produces:

```
0000000272b71b3df71e6c4d4081df3f
```

I checked the correct result directly with jSAVF 1.83’s compiled `ChunkChecker`, as well as with the public Python implementation used below. This vector catches the ordering error without exposing any bytes from the test SAVF.

## Finding the global checksum

Fixing the record trailers was not enough. jSAVF’s `GlobalChecker` showed a second 16-byte value calculated over the complete logical stream.

The field sits in the final 16 logical bytes. Physically, those are the last 16 bytes of the final record’s payload, immediately before its record trailer:

```
| 496 ordinary payload bytes | 16-byte global checksum | 16-byte record trailer |
                              ^ file_size - 32           ^ file_size - 16
```

For my 84,480-byte file, the global field begins at `0x149E0` (84,448) and the final record trailer begins at `0x149F0` (84,464).

This creates a self-reference problem: the global checksum occupies bytes that would otherwise be part of its own input. In the decompiled code, `GlobalChecker` solves it by reading the original 16 bytes from logical offset `0x40` in the first payload. To calculate the global value, I restore that backup over the final field, process the reconstructed logical stream, and then write the checksum back into the final payload.

The global routine uses a 2,048-byte lookup table. jSAVF stores it as `net/anerty/os400/savf/check/sandbox.ser` inside the JAR. The file is a serialized Java byte array, 2,075 bytes long, with the actual table beginning at offset 27:

```
ac ed 00 05 75 72 ... 00 00 08 00 <2,048-byte payload>
^ stream magic                         ^ length = 0x800
```

The table hash is:

```
2,048-byte table SHA-256:
93f81fd81523a2521cf17b234edb05155998bc7e46d88b966b4bd9eef64c0764
```

The table contains eight 256-byte blocks. Each block is a permutation of `00` through `ff`, so every byte value occurs eight times in the complete table.

I checked the current jSAVF 1.83 distribution and extracted the same resource with these commands:

```bash
curl -fL -A 'Mozilla/5.0' -O https://www.anerty.net/dl/jsavf-dist-1.83-jars-only-linux.tar.xz
tar -xJf jsavf-dist-1.83-jars-only-linux.tar.xz
unzip -p jsavf/jSAVF-1.83.jar net/anerty/os400/savf/check/sandbox.ser > sandbox.ser
```

The global state starts with two eight-byte values and two counters:

```python
s0 = bytearray([0x55] * 8)
s8 = bytearray([0xaa] * 8)
c0 = 1
c8 = 121
```

Each 512-byte payload is processed as 32 blocks of 16 bytes. The first eight bytes update `s0`, and the second eight update `s8`. Each half is treated as a ring of 8 bytes rather than a flat list, so every byte has a neighbor to its right and byte 7 wraps back around to byte 0:

```
 b0 → b1 → b2 → b3
  ↑             ↓
 b7 ← b6 ← b5 ← b4
```

Reading clockwise from `b7`, each adjacent pair feeds one table lookup: `(b7,b0)` → `state[0]`, `(b0,b1)` → `state[1]`, … `(b6,b7)` → `state[7]`. The routine builds this ring by prepending a copy of the last byte, giving a nine-byte window, then folds each adjacent pair into an 11-bit table index:

```python
window = bytes([half[7]]) + half
for k in range(8):
    index = ((window[k] << 8) | window[k + 1]) & 0x7ff
    state[k] ^= table[index]
```

After the table XOR, the eight-byte state rotates left by 29 bits as one unsigned big-endian 64-bit value.

When the `s0` counter reaches 251 or the `s8` counter reaches 257, the corresponding state is shuffled at bit level. An `s8` threshold event also exchanges bytes 4 through 7 between the two states.

The following pseudocode includes all state and ordering needed to reproduce the checksum. `physical` is the complete SAVF image and `table` is the 2,048-byte lookup table. The function derives the ordered 512-byte payload blocks by stripping the 16-byte physical trailer from each 528-byte record:

```python
MASK64 = (1 << 64) - 1

def rotate_left_64_be(state: bytearray, count: int = 29) -> None:
    value = int.from_bytes(state, "big", signed=False)
    value = ((value << count) | (value >> (64 - count))) & MASK64
    state[:] = value.to_bytes(8, "big")

def build_spread_tables():
    spread1 = [0] * 256
    for byte in range(256):
        value = 0
        for bit in range(7, -1, -1):
            value = (value << 2) | ((byte >> bit) & 1)
        spread1[byte] = value
    spread2 = [(value << 1) & 0xffff for value in spread1]
    return spread1, spread2

def shuffle(state, spread1, spread2):
    output = bytearray(8)
    for pair in range(4):
        value = spread2[state[pair]] | spread1[state[pair + 4]]
        output[pair * 2:pair * 2 + 2] = value.to_bytes(2, "big")
    state[:] = output

def mix_half(half, state, counter, threshold,
             table, spread1, spread2):
    window = bytes([half[7]]) + bytes(half)
    for k in range(8):
        index = ((window[k] << 8) | window[k + 1]) & 0x7ff
        state[k] ^= table[index]

    rotate_left_64_be(state, 29)

    threshold_event = (counter == threshold)
    if threshold_event:
        counter = 0
        shuffle(state, spread1, spread2)

    # The caller performs the cross-state exchange, if required,
    # before incrementing this counter.
    return counter, threshold_event

def compute_global_checksum(physical: bytes, table: bytes) -> bytes:
    assert len(physical) > 0 and len(physical) % 528 == 0
    assert len(table) == 2048

    records = [
        physical[i * 528:i * 528 + 512]
        for i in range(len(physical) // 528)
    ]

    spread1, spread2 = build_spread_tables()
    s0 = bytearray([0x55] * 8)
    s8 = bytearray([0xaa] * 8)
    c0, c8 = 1, 121

    global_backup = records[0][0x40:0x50]

    for record_index, record in enumerate(records):
        payload = bytearray(record)
        if record_index == len(records) - 1:
            payload[496:512] = global_backup

        for offset in range(0, 512, 16):
            block = payload[offset:offset + 16]

            c0, _ = mix_half(
                block[0:8], s0, c0, 251, table, spread1, spread2
            )
            c0 += 1

            c8, s8_event = mix_half(
                block[8:16], s8, c8, 257, table, spread1, spread2
            )
            if s8_event:
                old_s0_tail = bytes(s0[4:8])
                s0[4:8] = s8[4:8]
                s8[4:8] = old_s0_tail
            c8 += 1

    return bytes(s0) + bytes(s8)
```

`build_spread_tables` implements a classic bit-interleaving trick: `spread1[byte]` spreads the 8 bits of `byte` out so each bit lands in every other bit position of a 16-bit value, leaving the in-between positions zero; `spread2` is the same table shifted left by one bit, so its bits land exactly in the positions `spread1` left empty:

```
bit position:   15 14 13 12 11 10 09 08 07 06 05 04 03 02 01 00
spread1(byte):   0 b7  0 b6  0 b5  0 b4  0 b3  0 b2  0 b1  0 b0
spread2(byte):  b7  0 b6  0 b5  0 b4  0 b3  0 b2  0 b1  0 b0  0
```

`shuffle` then combines one byte from each half of the state — `spread2[state[pair]]` from the first half, `spread1[state[pair + 4]]` from the second — by OR-ing their spread values together, interleaving the two bytes’ bits pairwise into one 16-bit output. Doing this for all four byte pairs interleaves the state’s two four-byte halves together, bit by bit.

The order matters. The algorithm first applies the table XOR and rotates the result by 29 bits. It then tests the counter. If the counter has reached its limit, the algorithm resets it and shuffles the bits. For `s8`, it also exchanges four bytes between the two running values. Only then does it increment the counter. Changing this order changes the result.

### A synthetic global-checksum vector

The following vector tests the global algorithm without a private SAVF. It contains nine physical records. Payload byte `i` in zero-based record `r` is `(r * 17 + i * 29 + 3) & 0xff`. The backup at logical `0x40` is `f0f1...feff`, the final overlay initially contains `a0a1...aeaf`, and each 16-byte physical trailer is zero because trailers are not global-checksum input.

Nine records contain 288 blocks, so this vector reaches both shuffle thresholds and the `s8` -triggered cross-state exchange:

```python
records = []
for record_index in range(9):
    payload = bytearray(
        (record_index * 17 + offset * 29 + 3) & 0xff
        for offset in range(512)
    )
    records.append(payload)

records[0][0x40:0x50] = bytes(range(0xf0, 0x100))
records[-1][496:512] = bytes(range(0xa0, 0xb0))

physical = bytearray()
for payload in records:
    physical.extend(payload)
    physical.extend(bytes(16))

expected = bytes.fromhex("dbf1671ed17396a03f60bd52ddf749db")
calculated = compute_global_checksum(bytes(physical), table)
assert calculated == expected
print(f"calculated global: {calculated.hex()}")
```

The output is:

```
calculated global: dbf1671ed17396a03f60bd52ddf749db
```

The lookup table has the SHA-256 shown above. I checked this expected value directly with jSAVF 1.83’s compiled `GlobalChecker` and with the independent Python reconstruction.

### Why the final record must be repaired last

Writing the global checksum changes the final record’s payload and invalidates that record’s trailer. For an ordinary payload edit, the dependencies are:

```
changed payload bytes
    +-> affected record trailer(s)
    `-> global checksum
            `-> final record trailer
```

The global calculation reads only the 512-byte payloads, not the physical record trailers. The affected trailer and the global value are therefore parallel results of the payload change. The final trailer depends on the newly written global value and must be calculated last.

A safe repair order is:

1.  recalculate the record trailers;
2.  calculate the global value after restoring the header backup over the final field;
3.  write the global value at `file_size - 32`;
4.  recalculate the final record trailer again.

There is one special case. The global field physically replaces the true final 16 logical bytes. If those bytes must change, the replacement data belongs in the backup at logical `0x40`. That changes record #1’s payload and trailer, the global checksum, and finally the last record’s trailer.

## Testing the backup assumption

The SAVFs used in the main experiment had zero-filled backups at logical `0x40`. This meant that an implementation which replaced the final field with zeroes would still produce the correct result for those files. I therefore looked for SAVFs with a nonzero backup and found two useful examples:

| File | Backup at logical `0x40` | Stored global | Zero-filled calculation | Backup-aware calculation |
| --- | --- | --- | --- | --- |
| `20260830_QSYS_QTOCSSTBL_uncompressed.savf` | `40404040404040404040404040404040` | `d1d0d5c608257c3a75f62b1d3b509364` | `11101506c8e5bcfab536ebddfb9053a4` | exact match |
| `QTOFRULZ.FILE` | `d3404040404000000000000000000000` | `59311393322093c8527e36d903e5c4a4` | `99f1d393395a1308527e36d903e5c4a4` | exact match |

Both files also have valid per-record trailers. Replacing the overlaid field with zeroes produces the wrong values shown in the table. Restoring the 16-byte header backup reproduces each stored global checksum exactly. For these two files, this confirms that the backup is part of the global-checksum input.

## Finding the same constants in IBM LIC

jSAVF showed how the global checksum was calculated. I also wanted to see whether the same unusual table and constants appeared in IBM’s LIC.

I searched an IBM i 7.5 RS_750-J Licensed Machine Code installation image for the complete 2,048-byte table. It occurs once in the installation image, at offset `0x42FDE8A0`. Within the 64 bytes immediately before the table, I found the two state seeds, both counter seeds, and both thresholds used by the reconstructed algorithm:

```
0x42FDE860: 55555555 55555555 00000000 00000000   initial s0
0x42FDE870: 00000001 000000fb 00000000 00000000   c0 = 1, threshold = 251
0x42FDE880: aaaaaaaa aaaaaaaa 00000000 00000000   initial s8
0x42FDE890: 00000079 00000101 00000000 00000000   c8 = 121, threshold = 257
0x42FDE8A0: 90aca3f7 e3e620be 686e0935 ea4efd6c   table begins
```

The same table is present in `QFILEMCD`, an extracted LIC code-and-data image. It begins at file offset `0x2503E8A0`.

If you have access to licensed IBM LIC installation media and an extracted `QFILEMCD`, the table search itself is straightforward:

```python
from pathlib import Path
import hashlib
import mmap

EXPECTED_TABLE_SHA256 = (
    "93f81fd81523a2521cf17b234edb05155998bc7e46d88b966b4bd9eef64c0764"
)

table_resource = Path("sandbox.ser").read_bytes()
assert len(table_resource) >= 27 + 2048
table = table_resource[27:27 + 2048]
# Pin the table extracted from the jSAVF 1.83 build used for this article.
assert hashlib.sha256(table).hexdigest() == EXPECTED_TABLE_SHA256

with open("QFILEMCD", "rb") as f, \
     mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as image:
    offsets, start = [], 0
    while (found := image.find(table, start)) != -1:
        offsets.append(found)
        start = found + 1

print([hex(offset) for offset in offsets])
```

On the `QFILEMCD` image I analyzed, the output was:

```
['0x2503e8a0']
```

This locates one complete copy of the table at the file offset given above.

Finding the constants does not identify the LIC routine that reads them or prove that IBM’s control flow matches jSAVF. It also does not show that the machine which created my SAVF ran this exact LIC level. The search shows that IBM’s installation media contains the same table together with the matching state seeds, counter seeds, and thresholds.

## Modifying and repairing the SAVF

I put the backup-aware implementation in a standalone Python script named `savf_checksum_demo.py`. Its public interface has four operations: repair the checksum fields, list saved objects, copy an object from a compatible donor SAVF, and remove an object. The add and remove operations repair every dependent checksum field automatically. The reproduction section below uses the same object-removal path as the final experiment without requiring private files.

### Validating against the original SAVF

I ran the reconstruction on the untouched IBM-generated file. The validation output was:

```
record trailers: all 160 OK
stored global:     5513f83d38b944fe9814e1dc8d0b04fe
calculated global: 5513f83d38b944fe9814e1dc8d0b04fe
global checksum:   OK
```

The Python implementation reproduces all 160 record trailers and the stored global value `5513f83d38b944fe9814e1dc8d0b04fe`. This checks the record numbering, both reduction passes, timestamp XOR, table parsing, field placement, and global state transitions against values written by IBM i.

### Analyzing a valid-record, stale-global file

`SAVE2.FILE` gave me a useful intermediate state. Compared with `SAVE1.FILE`, three program payload bytes in record #55 (index 54) changed to `0x41`:

| Logical offset | Physical offset | Change |
| --- | --- | --- |
| `0x6D50` | `0x70B0` | `fb` to `41` |
| `0x6D52` | `0x70B2` | `ff` to `41` |
| `0x6D53` | `0x70B3` | `30` to `41` |

Five bytes in record #55’s trailer changed with the payload. The updated trailer matches those bytes, and all 160 record trailers are valid. The global checksum and the final record trailer are still byte-for-byte equal to `SAVE1.FILE`, so the stored global value is stale.

```
record trailers: all 160 OK
stored global:     5513f83d38b944fe9814e1dc8d0b04fe
calculated global: 5013b87d388154fb9835f5dc8d0980ff
global checksum:   STALE
```

Compared with `SAVE1.FILE`, this intermediate file differs at eight positions: the three payload bytes and five bytes in record #55’s trailer. I recreated this state by applying those three edits to `SAVE1.FILE` and recalculating only record #55’s trailer; the result matched `SAVE2.FILE` byte for byte.

### Predicting the repair footprint

The dependency model predicts that repairing `SAVE2.FILE` should change only two places:

-   the embedded global field;
-   the final record trailer, because the global field is part of its payload.

The changed program bytes and record #55 trailer should remain untouched.

I repaired a copy with the final tool:

```
$ python3 savf_checksum_demo.py fix SAVE2.FILE SAVE2-repaired.FILE
checksum repaired: SAVE2-repaired.FILE
```

A separate validation pass found all 160 record trailers valid and both the stored and calculated global value equal to `5013b87d388154fb9835f5dc8d0980ff`.

`cmp` finds exactly 21 changed byte positions between `SAVE2.FILE` and the repaired output:

```
physical 0x149E0..0x149EF  global field:          11 positions differ
physical 0x149F0..0x149FF  final record trailer:  10 positions differ
elsewhere:                                           0 differences
```

Only 11 and 10 positions differ because some bytes happen to be equal in the old and new 16-byte values. The complete comparison is:

| Comparison | Payload bytes | Trailer bytes | Global-field bytes | Total positions |
| --- | --- | --- | --- | --- |
| `SAVE1.FILE` to `SAVE2.FILE` | 3   | 5 in record #55 | 0   | 8   |
| `SAVE2.FILE` to repaired output | 0   | 10 in record #160 | 11  | 21  |
| `SAVE1.FILE` to repaired output | 3   | 15 across two trailers | 11  | 29  |

This is a consistency check rather than an independent validation, because the same implementation both predicts and produces the repair. Still, the output changes only the expected 21 byte positions and nothing else.

## Editing a SAVF container

The three-byte `SAVE1` / `SAVE2` comparison established the checksum dependency order, but editing bytes inside a saved program also raises unrelated object-validation questions. For the final test I therefore changed the SAVF structure instead: I removed one complete object from a two-object container and left the retained object’s saved section data unchanged.

I created `TESTA` and `TESTB` as disposable copies of the same program and saved them together without compression. The resulting SAVF had 288 physical records. Its backup-restored logical stream contained three sequential items. Here, an item is one continuous area of bytes with its own header and stored length:

```
QSRDSSPC.1 logical 0x1000..0x3fff length 0x3000 srds 0x0
TESTA      logical 0x4000..0x13fff length 0x10000 srds 0x70
TESTB      logical 0x14000..0x23fff length 0x10000 srds 0x107
```

In this output, `srds` is the QSYS catalogue-descriptor offset encoded in the low 24 bits of the item field at `+0x24` (zero for the catalogue item itself). A descriptor is the catalogue entry for one saved object.

These offsets come from three different structures, each relative to its own start rather than to the whole file:

```
logical stream
├─ file header                              (+0x34 header length, +0x08/+0x38 record count)
├─ QSRDSSPC.1 item   0x1000..0x3fff
│    ├─ item header                         (+0x04 name, +0x24 catalogue-descriptor link)
│    └─ catalogue                           (+0x2A object count)
│         ├─ descriptor[0] @ +0x70   (151 bytes — TESTA)
│         └─ descriptor[1] @ +0x107  (151 bytes — TESTB)
├─ TESTA item        0x4000..0x13fff         (item header +0x24 → 0x70)
└─ TESTB item        0x14000..0x23fff        (item header +0x24 → 0x107)
```

With that in mind: `QSRDSSPC.1` is the save/restore data-space item that carries the object catalogue. The parser restores the global overlay before walking the logical stream. The four-byte big-endian header-length field at `0x34` was `0x1000`, so the first item began at logical `0x1000`. The implementation also supports the documented zero value, which means a 512-byte header. It checks the `0xFFFFFFFF` item marker, reads the EBCDIC name at item offset `0x04`, and calculates each uncompressed item’s stored length from the four-byte big-endian field at `0x48`:

```
(big_endian_u32(item + 0x48) + 1) * 512
```

The item also stores its total length, in 512-byte units, in the four-byte big-endian field at `0xCC`. The 2001 MI400 description calls this the number of 528-byte records to the next descriptor. Both descriptions agree for contiguous non-final items: the same count describes both views. Multiplying it by 512 gives the item’s logical length, while the same number of 528-byte physical records gives the raw-file distance to the next descriptor. The final item still carries its total length even though no descriptor follows it.

For this fixture, `QSRDSSPC.1` stored `0x17` at `0x48` and `0x18` at `0xCC`; both derive a length of `0x3000`. `TESTA` and `TESTB` each stored `0x7F` at `0x48` and `0x80` at `0xCC`; both derive `0x10000`. These values equal the actual item spans. There is no separate absolute next-item pointer in this QSYS layout: the outer parser advances by the computed item length, while the object catalogue is a count-delimited, fixed-stride descriptor array. jSAVF’s separate next-item handling is for IFS catalogue trees, which are not present here.

Removing `TESTA` did not require changing `0xCC`: `QSRDSSPC.1` kept its `0x3000` span, and the retained `TESTB` item moved earlier but kept its `0x10000` span. The editor changed the four-byte big-endian record count at header offset `0x08` and the matching eight-byte big-endian count at `0x38` from 288 to 160; the header-length field remained `0x1000`.

The catalogue occupies logical `0x3000..0x3FFF`. Its four-byte big-endian object count at catalogue offset `0x2A` was two. For this target-release format, the two 151-byte object descriptors began at catalogue offsets `0x70` and `0x107`. Each saved-object item contains a four-byte big-endian field at item offset `0x24`. jSAVF uses the high byte for IFS flags and the low 24 bits as the QSYS catalogue-descriptor offset; the QSYS values here were `0x70` and `0x107`.

Removing `TESTA` therefore required more than deleting its bytes. The editor:

1.  removed the complete `TESTA` item at `0x4000..0x13FFF`;
2.  changed the catalogue object count from two to one;
3.  moved the `TESTB` descriptor from `0x107` to `0x70` and cleared the unused slot;
4.  changed `TESTB` ’s item-header descriptor link from `0x107` to `0x70`;
5.  updated both record-count fields in the file header;
6.  copied the new final 16 logical bytes to the backup at logical `0x40`, rebuilt the physical records, and recalculated every record trailer;
7.  calculated the new global checksum, wrote it to the final payload, and recalculated the final trailer.

The 151-byte `TESTB` catalogue descriptor was copied unchanged from `0x107` to `0x70`. Its header occupation at item offset `0x44` was `0x2F8`; its saved-object sections began at the first 4096-byte boundary, item-relative `0x1000`. After aligning the baseline and edited `TESTB` items, the only differences in that first `0x1000` -byte descriptor/header area were relative offsets `0x26` and `0x27`, inside the four-byte catalogue-reference field. Every byte from item offset `0x1000` through the end of the item was unchanged. The edit produced these structural changes:

| Property | Baseline | Edited |
| --- | --- | --- |
| `TESTA` item | `0x4000..0x13FFF` | absent |
| `TESTB` item | `0x14000..0x23FFF` | `0x4000..0x13FFF` |
| Logical size | `0x24000` (147,456 bytes) | `0x14000` (81,920 bytes) |
| Physical records | 288 | 160 |
| Physical size | 152,064 bytes | 84,480 bytes |
| Stored global checksum | `791ea5ec90f35d20829dc5561098c130` | `bfd84cce59a6e7993e85c8a0e1a4e9cf` |

For this fixture the new final logical bytes and the backup were both zero. The implementation nevertheless copies the actual new tail into the backup rather than assuming zeroes.

Before import, the repaired result satisfied these invariants:

```yaml
SAVF differs from baseline: YES
logical structure differs: YES
TESTA present in baseline: YES
TESTA present in edited:   NO
TESTB present in baseline: YES
TESTB present in edited:   YES
TESTB saved-object section payload changed: NO
TESTB item-header descriptor link: 0x107 -> 0x70
record trailers: all 160 OK
stored global == calculated global: YES
```

I also generated a negative control with the same structural edit and rebuilt record trailers, but left the old global value in place. Its 160 trailers all validated; its stored global was `791ea5ec90f35d20829dc5561098c130`, while the calculation produced `bfd84cce59a6e7993e85c8a0e1a4e9cf`. The stale and repaired copies have identical backup-restored logical streams. Their 28 differing physical byte positions are confined to the global field at `0x149E0..0x149EF` and the final record trailer at `0x149F0..0x149FF`.

## Testing the edited SAVF on IBM i

I transferred the baseline, edited-and-stale, and edited-and-repaired files through the same stream-file and `CPYFRMSTMF` path on IBM i 7.5. The baseline and edited variants used separate destination SAVFs, and each restore used a fresh target library.

| Case | Record checks | Global | `CPYFRMSTMF` | `DSPSAVF` | Restore `TESTB` |
| --- | --- | --- | --- | --- | --- |
| Baseline | 288 valid | valid | `CPCA081` | `TESTA`, `TESTB` | `CPC3703` |
| Edited + stale | 160 valid | stale | `CPDA088`, then `CPFA095` | not reached | not reached |
| Edited + repaired | 160 valid | valid | `CPCA081` | `TESTB` only | `CPC3703` |

The stale import stopped with:

```
CPDA088: Error writing to object.
CPFA095: Stream file not copied.
```

The repaired import completed with:

```
CPCA081: Stream file copied to object.
```

`DSPSAVF` reported 160 records, one saved object, and listed only `TESTB`. Restoring that retained object into an empty library produced:

```
CPC3703: 1 objects restored from SVC29 to RMRF29.
```

The actual controlled run used `SVC29` as the source library and `RMRF29` as the fresh restore library; the reproduction commands below use generic example names.

This is the practical checksum-fixer result. The SAVF was structurally different, `TESTA` was absent, and `TESTB` ’s saved-object section data had not changed. After the dependent record and global checksum fields were regenerated, IBM i accepted and interpreted the edited container, and the retained object remained usable.

The editor is not intended to reproduce the byte-for-byte output of a fresh native `SAVOBJ` operation; the experiment tests whether the structurally edited and checksum-repaired container is accepted and interpreted correctly by IBM i.

## Reproducing the experiment

The private research SAVFs are not required. The specific implementation used for these experiments is available in the [Silent Signal SAVF IBM i repository](https://github.com/silentsignal/savf-ibmi/). It requires Python 3.9 or later and exposes four commands:

-   `fix` recalculates every record trailer, the global checksum, and the final trailer;
-   `list` validates the record trailers and lists the QSYS catalogue;
-   `add` copies one complete object from a compatible donor SAVF and repairs the output; and
-   `remove` removes one complete object and repairs the output.

The editor deliberately supports the uncompressed QSYS layout tested here. It rejects compressed items, incompatible catalogues, ambiguous names, unknown links, and insufficient catalogue space rather than guessing.

First extract the lookup-table resource from the public jSAVF distribution:

```bash
curl -fL -A 'Mozilla/5.0' -O https://www.anerty.net/dl/jsavf-dist-1.83-jars-only-linux.tar.xz
tar -xJf jsavf-dist-1.83-jars-only-linux.tar.xz
unzip -p jsavf/jSAVF-1.83.jar net/anerty/os400/savf/check/sandbox.ser > sandbox.ser
```

Every checksum-changing command validates the extracted table against the SHA-256 published earlier in this article before using it.

### 1\. Create and export a two-object baseline

Replace `USERB1` with a disposable test library and `TESTPGM` with a disposable program that can be duplicated. The SSH account and host below are examples.

```java
CRTDUPOBJ OBJ(TESTPGM) FROMLIB(USERB1) OBJTYPE(*PGM) TOLIB(USERB1) NEWOBJ(TESTA)
CRTDUPOBJ OBJ(TESTPGM) FROMLIB(USERB1) OBJTYPE(*PGM) TOLIB(USERB1) NEWOBJ(TESTB)
CRTSAVF FILE(USERB1/BASELINE)
SAVOBJ OBJ(TESTA TESTB) LIB(USERB1) OBJTYPE(*PGM) DEV(*SAVF) SAVF(USERB1/BASELINE) DTACPR(*NO)
CPYTOSTMF FROMMBR('/QSYS.LIB/USERB1.LIB/BASELINE.FILE') TOSTMF('/tmp/baseline.FILE') STMFOPT(*REPLACE)
```

```bash
scp userb1@ibmi.example:/tmp/baseline.FILE baseline.FILE
```

List the baseline objects, then run a checksum repair into a separate file and compare it with the original:

```
$ python3 savf_checksum_demo.py list baseline.FILE
TESTA
TESTB

$ python3 savf_checksum_demo.py fix baseline.FILE baseline-checked.FILE
checksum repaired: baseline-checked.FILE

$ cmp -s baseline.FILE baseline-checked.FILE && echo "baseline checksums already valid"
baseline checksums already valid
```

`fix` always recalculates the complete checksum state. Byte equality therefore shows that the original already contained the calculated record trailers and global value. Record counts and checksum values depend on the saved objects and IBM i release.

### 2\. Remove one object and repair the container

`remove` writes a new SAVF, leaves the baseline untouched, and repairs all checksum dependencies in the output:

```
$ python3 savf_checksum_demo.py remove baseline.FILE edited-repaired.FILE TESTA
removed object: TESTA
objects: TESTB
record count: 288 -> 160
```

Check the resulting catalogue and prove that a second checksum pass makes no changes:

```bash
$ python3 savf_checksum_demo.py list edited-repaired.FILE
TESTB

$ python3 savf_checksum_demo.py fix edited-repaired.FILE edited-checked.FILE
checksum repaired: edited-checked.FILE

$ cmp -s edited-repaired.FILE edited-checked.FILE && echo "edited SAVF checksums valid"
edited SAVF checksums valid

$ wc -c baseline.FILE edited-repaired.FILE
152064 baseline.FILE
 84480 edited-repaired.FILE
236544 total
```

The repaired file is not a restored copy of the baseline: it is 128 records shorter, contains no `TESTA` item, and still contains the unchanged `TESTB` section payload.

The published editor intentionally emits only a checksum-repaired output. The edited-and-stale negative control described in the previous section was generated during validation by retaining the baseline global value while rebuilding the edited file’s record trailers. It isolates global-checksum enforcement, but deliberately creating invalid SAVFs is not part of the public command interface.

### 3\. Import and inspect the edited SAVF

Upload the baseline and edited physical files through the same path:

```bash
scp baseline.FILE userb1@ibmi.example:/tmp/baseline.FILE
scp edited-repaired.FILE userb1@ibmi.example:/tmp/edited-repaired.FILE
```

Create separate SAVFs and import both files with [`CPYFRMSTMF`](https://www.ibm.com/docs/en/i/7.5.0?topic=c-copy-from-stream-file):

```java
CRTSAVF FILE(USERB1/BASEIN)
CRTSAVF FILE(USERB1/EDITFIX)

CPYFRMSTMF FROMSTMF('/tmp/baseline.FILE') TOMBR('/QSYS.LIB/USERB1.LIB/BASEIN.FILE') MBROPT(*REPLACE)
CPYFRMSTMF FROMSTMF('/tmp/edited-repaired.FILE') TOMBR('/QSYS.LIB/USERB1.LIB/EDITFIX.FILE') MBROPT(*REPLACE)
```

On the IBM i 7.5 system used for this article, both imports completed with `CPCA081`. The separately prepared stale control reported earlier failed with `CPDA088` followed by `CPFA095`.

Display the repaired SAVF and restore its retained object into a fresh library:

```
DSPSAVF FILE(USERB1/EDITFIX) OUTPUT(*PRINT)
CRTLIB LIB(EDITTEST) TYPE(*TEST)
RSTOBJ OBJ(TESTB) SAVLIB(USERB1) DEV(*SAVF) OBJTYPE(*PGM) SAVF(USERB1/EDITFIX) RSTLIB(EDITTEST)
```

In the controlled run, `DSPSAVF` listed `TESTB` and did not list `TESTA`; [`RSTOBJ`](https://www.ibm.com/docs/en/i/7.5.0?topic=ssw_ibm_i_75/cl/rstobj.html) completed with `CPC3703`.

### 4\. Other tool operations

The same release can copy one object from a compatible donor SAVF and can repair checksum fields without changing the saved-object data:

```bash
python3 savf_checksum_demo.py add target.FILE donor.FILE output.FILE OBJECT
python3 savf_checksum_demo.py fix input.FILE fixed.FILE
```

`add` requires compatible uncompressed catalogues, a unique donor object name, an unused descriptor slot, and enough free catalogue space. The repository README describes the supported layout and the conditions that make the command stop instead of guessing.

## The security boundary

IBM’s record and global checks detect inconsistent or unrepaired SAVF data, but the values are deterministic and unkeyed. Once their algorithms are known, SAVFs using this layout can be verified, repaired, and structurally edited off-platform without using IBM i to regenerate the container checksums. This is useful for format tooling, forensic analysis, interoperability, and controlled repair of damaged SAVFs; it does not replace IBM i’s separate signature and saved-object validation mechanisms.

IBM documents a separate [digital-signature layer for SAVFs](https://www.ibm.com/docs/en/i/7.5.0?topic=files-about-save-file-security). Program validation, object signatures, conversion, and restore-policy checks belong to the saved objects and restore process; they are separate from the SAVF container checksums and are not modified by the container repair. The final experiment avoids that ambiguity by removing one complete item while leaving the retained object’s saved section data unchanged.

## Conclusion

The reverse engineering required two views of the same file: 528-byte physical records for the record trailers, and the concatenated 512-byte payloads for the logical stream. The per-record algorithm reduces a sequence number and payload through shifted byte-array additions and mixes in the SAVF timestamp. The global algorithm uses a 2,048-byte substitution table, two rotating states, counter-triggered shuffles, and a header backup to handle its overlay on the final payload.

The implementation reproduces all stored checksums in the original IBM-generated SAVF. Synthetic vectors exercise both algorithms, two nonzero-backup files confirm the role of the actual backup bytes in those examples, and the same table and nearby constants occur in IBM LIC media. The `SAVE1` / `SAVE2` comparison also reconstructs a valid-record, stale-global state, showing exactly which checksum fields must be updated after a payload change.

The final IBM i control tested an actual container edit. I removed the complete `TESTA` item from a two-object, uncompressed SAVF, preserved `TESTB` ’s saved-object section data, rebuilt the physical record stream, and regenerated the record and global checksum fields. IBM i rejected the structurally edited copy while its global value was stale. It accepted the repaired copy, `DSPSAVF` showed only `TESTB`, and `TESTB` restored successfully.

This establishes the checksum result for the tested IBM i 7.5 uncompressed QSYS layout: the SAVF container can be structurally edited and made internally valid again by recalculating its dependent checksum fields. It does not imply support for every historical or compressed SAVF variant, and it does not change IBM i’s separate signature or saved-object validation mechanisms.
