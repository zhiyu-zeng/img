---
title: Guest-to-host escape via QEMU CXL Type 3 mailbox overflows
source: https://cyberstan.co.uk/cxl-guest-to-host-escape/
source_host: cyberstan.co.uk
clip_date: 2026-10-01T10:13:26+08:00
trace_id: dd0a4ec8-3d8f-4a59-a822-4e49b58b0325
content_hash: 1b19168382f45268fe5c65da5d0e51fa544ba2c3fd8a6a8a18ef64d525929ccd
status: synced
tags:
  - 漏洞分析
  - 模拟执行
series: null
feed_source: cyberstan·内核/虚拟化
ai_summary: QEMU `hw/cxl/cxl-mailbox-utils.c` 手工审计出三个越界缺陷，其中 Get Log 越界读泄漏 PIE 基址、Get LSA 溢出改写命令表，四次 mailbox 命令即可确定性完成 guest-to-host 逃逸并执行任意代码。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8124-b2c4-d74860408a2b
ioc:
  cves:
    - CVE-2026-23327
  cwes: []
  hashes:
    - b6a7d06213e5d2f7d124d16418bc289c4a8a4b82
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> QEMU `hw/cxl/cxl-mailbox-utils.c` 手工审计出三个越界缺陷，其中 Get Log 越界读泄漏 PIE 基址、Get LSA 溢出改写命令表，四次 mailbox 命令即可确定性完成 guest-to-host 逃逸并执行任意代码。
> 
> - **三个缺陷：** Get LSA（0x4102）只用 LSA 后端大小校验长度、不校验 2048 字节 payload 输出缓冲区，可越界写；Set Feature 的六个分支对 guest 可控的 `hdr->offset`（0–65535）与拷贝长度都不检查，构成 write-what-where；Get Log（0x0401）CEL 分支的边界检查按字节、memmove 指针运算按 4 字节元素，产生 4 倍读取放大（offset=65588 时实际读到 cel_log 后 208 字节）。
> - **ASan 盲区：** payload 缓冲区嵌在约 7MB 的 `CXLType3Dev` QOM 对象内部，ASan 只插桩 malloc 边界不管对象内字段边界，故 Get LSA 的栈内越界不被报告，需 `ASAN_POISON_MEMORY_REGION` 之类注解才能暴露。
> - **逃逸四步：** ① Get Log 取 offset=65588/len=8，泄漏 `cmd_infostat_identify` 地址，减去符号偏移得 PIE 基址；② Set LSA 在偏移 2648（payload 缓冲区到 `cxl_cmd_set[0][0]` 的距离）植入假 `cxl_cmd` 项：name="/tmp/x"、handler=`system@plt`、输入长度 0xFFFF…；③ Get LSA 以 offset=0/length=2680 溢出覆盖 `cxl_cmd_set[0][0]`；④ 发 set=0、cmd=0 的空载荷命令触发 `system("/tmp/x")`，在宿主以 QEMU 进程用户身份执行。
> - **定位与修复：** 环境为 q35+KVM、QEMU b6a7d06213（v11.0.0-rc2）、Ubuntu 24.04；修复都很短——按 `CXL_MAILBOX_MAX_PAYLOAD_SIZE` 截断输出、把 patrol_scrub/ecs 已有的长度检查套用到六个分支、将 `cci->cel_log` 强转 `(uint8_t *)` 使指针按字节推进。
> - **定性与同类：** QEMU 以 CXL 不在安全支持范围为由判为非安全问题、不发 CVE；V12 团队独立复现同样缺陷并公开为 “QEMUtiny”。Linux 内核 CXL 驱动 `drivers/cxl/core/mbox.c` 存在同类长度校验缺失（CVE-2026-23327），作者建议对 CXL/NVMe 这类变长命令-载荷协议逐 handler 审计边界检查。

6th April 2026 · Reported to qemu-security · Classified as non-security (CXL outside policy scope) · Found by manual code audit

I spent a few evenings reading QEMU’s CXL Type 3 mailbox handlers by hand, without the static-analysis tooling I use in most of my other writeups, and came out with three bounds-checking bugs in `hw/cxl/cxl-mailbox-utils.c`. Two of them chain into a deterministic guest-to-host escape with a full ASLR bypass, in four mailbox commands, no brute force.

QEMU does not treat CXL emulation as a security-supported surface, so none of this gets a CVE. That is a scoping decision about where the project draws its boundary, and I think it is a reasonable one: CXL emulation is developer infrastructure for the Linux CXL stack rather than a production-hardened device model, and the published policy says so. It does not make the bugs less real. The chain is deterministic and it reproduces, and two of the three (the Get Log out-of-bounds read and the Set Feature out-of-bounds write) were independently rediscovered after my report by the V12 team and disclosed as [“QEMUtiny”](https://seclists.org/oss-sec/2026/q2/618) in May 2026, with the same root-cause analysis and their own [proof of concept](https://github.com/v12-security/pocs/tree/main/qemu). They reached the same conclusion about scope and published for the same reason I am comfortable writing this up. Their chain takes a different route to code execution than the Get LSA command-table overwrite below, but the underlying handler bugs are the same ones.

Worth being precise about the threat model, since “guest-to-host escape” can read bigger than it is. The attacker already has root inside the guest and is driving an emulated CXL Type 3 device, and success gets them code execution as the host QEMU process user. That is a meaningful boundary crossing in a confidential-computing or multi-tenant framing, and CXL emulation is also not a surface you would expose to a hostile guest in production today, which is exactly why QEMU draws the line where it does. What I think is worth your time here is the exploitation technique and the AddressSanitizer blind spot it walks through, demonstrated on a working chain.

All three bugs are reachable from a guest with root access to an emulated CXL Type 3 device via mailbox MMIO writes to PCI BAR2, on the q35 machine type with KVM. Tested against QEMU v11.0.0-rc2, commit b6a7d06213e5d2f7d124d16418bc289c4a8a4b82.

## The CXL mailbox interface

CXL Type 3 memory devices expose a mailbox interface through PCI BAR2 registers. The guest writes a command opcode, a payload length, and up to 2048 bytes of payload data into MMIO-mapped registers, then sets a doorbell bit in the control register. QEMU’s emulation dispatches the command to a handler function based on the opcode’s command set and command ID. The handler reads from the payload input buffer, does its work, and writes results back into the same 2048-byte payload output buffer.

Dispatch works by indexing into a two-dimensional array of `cxl_cmd` structs (`cci->cxl_cmd_set[set][cmd]`), each holding a function pointer, a name string, and input/output size constraints. That structure becomes the overwrite target later.

The payload buffer is embedded inside `CXLDeviceState`, which is itself embedded inside the heap-allocated `CXLType3Dev` QOM object, roughly 7MB in total. That embedding matters twice over: the buffer’s neighbours in memory are other device state fields rather than heap metadata, and overflows staying within the same QOM allocation will not trigger AddressSanitizer.

The relevant layout within `CXLType3Dev`, from GDB’s `ptype /o`:

```
payload buffer (2048 bytes)    @ CXLDeviceState + 1496
...
cci.cxl_cmd_set[0][0] (32 bytes) @ offset 21504 from payload buffer start
```

The delta between the payload buffer and the first command table entry is 2648 bytes, which puts it 600 bytes past the end of the 2048-byte buffer.

## Bug 1, the corruption primitive: heap overflow in cmd_ccls_get_lsa

The Get LSA command (opcode 0x4102) reads data from the device’s Label Storage Area, a persistent metadata region backed by a host file. The guest supplies a 32-bit offset and a 32-bit length. The handler at line 2273 validates the requested range against the LSA backing store size, user-configured at VM creation and up to 1MB in my PoC, and never checks it against the 2048-byte payload output buffer. The underlying `cvc->get_lsa()` call copies `length` bytes from the LSA into `payload_out`.

If the LSA backing store is larger than 2048 bytes, and any size above that is exploitable, the guest can request a read of up to the full LSA size. The copy runs straight past the end of the payload buffer into whatever follows it in `CXLDeviceState`.

The LSA content is attacker-controlled, because the Set LSA command (opcode 0x4103) lets the guest write arbitrary data into the LSA at arbitrary offsets first. So you pre-stage the overflow content, then trigger the over-read to spray it past the buffer boundary.

With `length=4096` the command returns `rc=0` and `len_out=4096`, and the 2048 bytes past the payload buffer overwrite adjacent fields. You can watch it happen: the memory device caps register, which normally reads 0x14, comes back as 0xAAAAAAAAAAAAAAAA (the LSA fill pattern) afterwards.

Get LSA over-read into the command table Everything below lives inside one 7MB CXLType3Dev object, so ASan never fires. offset 0 +2048 +2648 payload buffer — 2048 bytes other fields cxl_cmd_set\[0\]\[0\] handler fn pointer what the handler is allowed to fill 600 bytes of slack, then the dispatch table — all writable by the over-read Get LSA checks length against the LSA backing store, never against the 2048-byte output buffer. Request length 2680 and the copy runs 632 bytes past the buffer; bytes at offset 2648 land on cxl_cmd_set\[0\]\[0\], so attacker-staged LSA content overwrites a handler pointer.

The Get LSA over-read runs past the 2048-byte payload buffer and overwrites the command table 2648 bytes in.

This overflow does not trigger AddressSanitizer, and that is worth dwelling on. The payload buffer is embedded inside `CXLDeviceState`, which sits inside the roughly 7MB `CXLType3Dev` QOM allocation, and ASan instruments malloc boundaries rather than intra-object field boundaries. The overflow stays inside the same allocation, so every write lands in memory ASan considers perfectly valid. I proved the corruption by reading adjacent register values back, because no sanitizer was going to tell me.

If you are fuzzing QEMU device models, that is a real blind spot. Structure-internal overflows in large composite QOM objects go uncaught without custom poisoning annotations (`ASAN_POISON_MEMORY_REGION`) between fields, and `CXLType3Dev` is 7MB of densely packed state with substantial room for exploitable intra-object corruption that no standard sanitizer configuration will surface.

The fix adds a check against the mailbox payload buffer size (`CXL_MAILBOX_MAX_PAYLOAD_SIZE`, 2048) before the copy, capping the output length to the buffer capacity.

## Bug 2, an independent primitive: write-what-where in cmd_features_set_feature

The Set Feature command writes configuration data to device feature registers, dispatching on UUID to identify which feature is being configured. Six branches (soft_ppr, hard_ppr, cacheline_sparing, row_sparing, bank_sparing and rank_sparing, at lines 1816, 1835, 1854, 1872, 1890 and 1908) perform a memcpy like this:

```
memcpy(&ct3d->X_wr_attrs + hdr->offset, data, bytes_to_copy)
```

`hdr->offset` is a guest-controlled uint16_t with range 0-65535. `bytes_to_copy` is derived from the payload size and can reach 2016 bytes. The target structs are 2-3 bytes each. Neither offset nor length is bounds-checked against the target struct’s actual size, which gives a write-what-where primitive: controlled content, at a controlled offset up to 65535 bytes forward of the target struct, repeatable across all six branches independently.

The inconsistency is visible inside the same function. Two sibling branches, patrol_scrub (line 1763) and ecs (line 1790), do have a correct bounds check and return `CXL_MBOX_INVALID_PAYLOAD_LENGTH` if the payload exceeds the target struct size. The six vulnerable branches just omit it. The same PoC payload that patrol_scrub correctly rejects with `rc=0x16` is silently accepted by all six with `rc=0x00`.

With `hdr->offset=0x1000` the write destination is pushed 4096 bytes past the target struct, out past the end of the 7MB `CXLType3Dev` allocation and into the heap redzone, which is far enough that ASan does fire:

```
ERROR: AddressSanitizer: heap-buffer-overflow
WRITE of size 512 at 0x... cxl-mailbox-utils.c:1816
```

The fix applies the bounds check already sitting in patrol_scrub and ecs to all six vulnerable branches. No new logic, just consistent application of an existing pattern.

## Bug 3, the ASLR bypass: out-of-bounds read in cmd_logs_get_log

The Get Log command (opcode 0x0401) retrieves log data from the device. The guest supplies a 16-byte UUID identifying which log to read, a 32-bit offset into that log, and a 32-bit length. The handler for the CEL (Command Effects Log) case is at lines 1213-1220.

The bounds check on line 1213 compares `offset + length` against `sizeof(cci->cel_log)` using byte semantics. `cel_log` is declared as an array of 65536 `struct cel_log` entries, each 4 bytes wide, so that sizeof evaluates to 262144:

```
if ((uint64_t)get_log->offset + get_log->length >= sizeof(cci->cel_log)) {
    return CXL_MBOX_INVALID_INPUT;
}
```

But the memmove on line 1220 does pointer arithmetic on `cci->cel_log`, which is typed as a pointer to `struct cel_log`. In C, adding an integer to a typed pointer advances by that many elements rather than that many bytes, so `cci->cel_log + get_log->offset` advances by `offset * 4` bytes:

```
memmove(payload_out, cci->cel_log + get_log->offset, get_log->length);
```

So the check is counting bytes while the pointer counts 4-byte elements, and the attacker controls the offset that both of them use. The result is a 4x range amplification, with the actual read landing four times further from the base than the bounds check permits.

Concrete example with offset=65588, length=8:

-   Bounds check: 65588 + 8 = 65596 < 262144. Passes.
-   Actual byte position: 65588 \* 4 = 262352. That’s 208 bytes past the end of cel_log.

The check counts bytes; the pointer counts elements cel_log is struct cel_log\[65536\], 4 bytes each, so the two disagree by 4×. The bounds check (byte semantics): offset + length < 262144 → 65588 + 8 = 65596, passes looks safe The memmove (element semantics, ×4): cel_log + 65588 → 65588 × 4 = 262352 bytes → 208 past the end that read lands on a handler function pointer in.text → leaks the PIE base, ASLR gone The attacker controls offset, so the gap between “checked” and “actually read” is 4× and grows. The fix casts to (uint8_t \*) so the pointer advances in bytes, matching the check.

offset=65588 clears a byte-based check but the 4× pointer arithmetic reads 208 bytes past cel_log.

That lands on the handler field of `vdm_fm_owned_ld_mctp_cci.cxl_cmd_set[0][1]`, a function pointer holding the address of `cmd_infostat_identify` in QEMU’s.text section. Read 8 bytes there and you have the full 64-bit pointer; subtract the known symbol offset of `cmd_infostat_identify`, from `objdump -t` on the QEMU binary, and you have the PIE base. One deterministic mailbox command, no brute force required.

The read range scales with the offset. With offset=200000 and length=2048 the actual byte position is 800000, roughly 800KB past cel_log, which reaches into adjacent `CXLCCI` structs and leaks DeviceState pointers, QEMUTimer callback pointers, and more handler function pointers. Fully controlled, repeatable, and the data comes back in the mailbox payload output buffer where the guest reads it over MMIO.

The root cause is type confusion between byte offsets and element offsets, and the fix is a one-line cast:

```rust
- memmove(payload_out, cci->cel_log + get_log->offset, get_log->length);
+ memmove(payload_out, (uint8_t *)cci->cel_log + get_log->offset, get_log->length);
```

Casting to `uint8_t*` forces byte-granularity arithmetic so the pointer advance matches the bounds check.

## The escape chain

Bugs 3 and 1 chain into a complete guest-to-host escape in four mailbox commands, deterministically, using no information leak beyond the mailbox interface itself. Validated against a non-ASan build of QEMU v11.0.0-rc2 on Ubuntu 24.04 with full ASLR (`randomize_va_space=2`).

One thing to be precise about up front, because it is easy to misread: ASLR is defeated dynamically. Step 1 leaks the PIE base at runtime and never guesses or brute-forces it. The hardcoded values the PoC carries, `IDENTIFY_HANDLER_OFFSET` and `SYSTEM_PLT_OFFSET`, are intra-binary symbol offsets that are constant for a given build and recovered offline with objdump and GDB. They change across compilers, optimisation levels and QEMU commits, so this is a per-build proof of concept rather than a portable exploit, but the ASLR defeat itself is fully dynamic.

Step 1: leak the PIE base (Bug 3, Get Log OOB read)

Send Get Log with the CEL UUID, offset=65588, length=8, and read back 8 bytes of payload. The response contains the address of `cmd_infostat_identify`. Subtract `IDENTIFY_HANDLER_OFFSET` (0x48d122 in this build) to get the PIE base, and verify page alignment as a sanity check.

Step 2: plant a fake command table entry (Set LSA, no bug required)

Compute `system@plt` as PIE base + `SYSTEM_PLT_OFFSET` (0x348390 in this build). Construct a 32-byte fake `cxl_cmd` entry:

-   Bytes 0-7: “/tmp/x\\0”, which occupies the name field. The dispatcher passes this as the first argument to the handler.
-   Bytes 8-15: address of system@plt, occupying the handler field.
-   Bytes 16-23: 0xFFFFFFFFFFFFFFFF, occupying the input size field so it accepts any payload length.

Write that entry into the LSA at offset 2648 via Set LSA. The offset is chosen precisely, because 2648 is the distance from the start of the payload buffer to `cci->cxl_cmd_set[0][0]`, so when the overflow in Step 3 copies LSA content through the payload buffer, bytes at LSA offset 2648 land exactly on the first command table entry.

Step 3: overflow into the command table (Bug 1, Get LSA overflow)

Send Get LSA with offset=0, length=2680. The handler copies 2680 bytes from the LSA into the 2048-byte payload buffer: the first 2048 fill the buffer normally, and bytes 2049 onward run past the boundary, with bytes 2648-2680 overwriting `cci->cxl_cmd_set[0][0]` with the fake entry from Step 2. The dispatch table now maps command (set=0, cmd=0) to `system@plt` with argument “/tmp/x”.

Step 4: trigger

Send any mailbox command with set=0, cmd=0 and an empty payload. The dispatcher indexes `cxl_cmd_set[0][0]`, finds the overwritten handler pointer, and calls `system("/tmp/x")`, which runs on the host as the QEMU process user. The PoC writes a proof file to `/tmp/pwned-by-cxl-guest` containing that user’s name, the PID, and a timestamp.

## Reproduction

Environment:

-   Host: Ubuntu 24.04.4 LTS, kernel 6.17.0-19-generic
-   GCC: 13.3.0 (Ubuntu 13.3.0-6ubuntu2~24.04.1)
-   QEMU: commit b6a7d06213 (v11.0.0-rc2)
-   ASLR: randomize_va_space=2

For the individual bugs, with ASan, to confirm Bug 2’s OOB write:

```
../configure --enable-asan --target-list=x86_64-softmmu --enable-debug
ninja -j$(nproc)
QTEST_QEMU_BINARY=./qemu-system-x86_64 ./tests/qtest/cxl-mbox-test --verbose
```

Expected: test 1 passes (Get LSA overflow, verified by register corruption), test 2 passes (Set Feature OOB, ASan crash), test 3 passes (patrol_scrub correctly rejects).

For the full escape chain, without ASan, since the chain needs stable binary offsets:

```bash
../configure --target-list=x86_64-softmmu
ninja -j$(nproc)
rm -f /tmp/pwned-by-cxl-guest /tmp/x
QTEST_QEMU_BINARY=./qemu-system-x86_64 tests/qtest/cxl-escape-poc
cat /tmp/pwned-by-cxl-guest
```

The escape PoC’s hardcoded offsets are specific to this build and will differ across compiler versions, optimisation levels and QEMU commits. Comments in the source document how each one was derived, using `objdump -t` for symbol offsets and GDB’s `ptype /o` for structure layout.

Full qtest PoC source: https://github.com/0xCyberstan/cxl-mailbox-overflow

QEMU command line used by the PoC:

```python
-machine q35,cxl=on -m 2G
-object memory-backend-file,id=cxl-lsa,mem-path=<tmpfile>,size=1M
-object memory-backend-ram,id=cxl-mem,size=256M
-device pxb-cxl,bus_nr=0x34,bus=pcie.0,id=cxl.0
-M cxl-fmw.0.targets.0=cxl.0,cxl-fmw.0.size=4G
-device cxl-rp,bus=cxl.0,id=cxl-rp0,chassis=0,slot=0
-device cxl-type3,bus=cxl-rp0,persistent-memdev=cxl-mem,lsa=cxl-lsa,id=cxl-pmem0
```

## Mailbox interfaces in general

The CXL mailbox spec defines a complex command dispatch surface: variable-length payloads, UUID-dispatched feature branches, offset-indexed reads and writes into heterogeneous backing structures. That shape of design systematically produces bounds-checking omissions, and the QEMU bugs here are not isolated.

CVE-2026-23327 is a high-severity vulnerability in the Linux kernel’s own CXL driver (`drivers/cxl/core/mbox.c`) where the kernel fails to validate payload sizes before accessing mailbox contents. Same root-cause class, on the kernel side of the interface rather than the emulation side, found independently by a different researcher. The spec’s complexity produced the same category of failure in both implementations.

On the QEMU side the pattern is visible inside `cxl-mailbox-utils.c` itself. patrol_scrub and ecs have correct bounds checks while six sibling branches doing the same job do not. The Get LSA handler checks length against the backing store but not against the output buffer. The Get Log handler’s bounds check and its pointer arithmetic disagree on units. Three different omission patterns in one file, all exploitable, all straightforward to fix.

Any hardware spec that defines a command-payload-response protocol with variable-length fields and offset-indexed access, whether CXL or NVMe or something else, deserves a systematic audit of every handler’s bounds checking rather than spot checks on whichever handlers happen to get fuzzed first.
