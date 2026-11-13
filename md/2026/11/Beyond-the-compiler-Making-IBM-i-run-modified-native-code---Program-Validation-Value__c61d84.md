---
title: "Beyond the compiler: Making IBM i run modified native code - Program Validation Value"
source: https://blog.silentsignal.eu/2026/11/10/Beyond-the-compiler-Making-IBM-i-run-modified-native-code-PVV/
source_host: blog.silentsignal.eu
clip_date: 2026-11-13T10:38:05+08:00
trace_id: 50c8e87f-c57e-40e2-8853-1eced3b9cee3
content_hash: ce1cce86e73ccad7f6a31ba11bbbce189cb2264e1da3736d73b5369f0d2cbe16
status: synced
tags:
  - 固件逆向
  - 密码学
series: null
feed_source: Silent Signal·IBM i漏洞研究
ai_summary: |-
  - **核心结论：** 作者逆向重建了 IBM i 7.5 的 32 字节 PVV（Program Validation Value）计算算法，HMAC 密钥完全由程序属性和 LIC 固定常量导出，无独立机密，因此 PVV 只是可重算的一致性校验而非来源认证。
  - **算法结构：** PVV = HMAC-SHA-256(descriptor, canonical_message)；从保存程序图选取受保护字节区间、将保存指针规范化为"段号+段内偏移"、短于 0x400 的追加合并为单一流，最终以 4 个 64 位双字与程序图中四处存储值比对。
  - **离线验证规模：** 对 1,239 个可解析条目中全部 1,223 个已知有效值精确匹配，16 个故意变异样本均判无效，0 个未解释失配；工具集 `pvv-ibmi` 计划在 GitHub 开源，提供 `check`/`fix` 两个命令。
  - **实机控制实验：** 无特权的 USERB1 账户通过 QSRRSTO API 成功恢复 PVV 修复后的 CrackMe，修改分支指令后对错误口令打印 `pwd is ok`；重保存后修改的原生指令原样保留。
  - **安全后果与边界：** 修改后的 USER 态 MEMDUMP 绕过编译器生成的指针验证序列（LQ/TXER），读取了 QSECOFR 协作作业中已知地址的 USER 域缓冲区；但 SYSTEM/INHERIT 态变体因数字签名校验被拒（CPD37A0），USER 态访问 SYSTEM 域仍被 MCH6801 阻断——PVV 重建本身不构成漏洞或签名绕过。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41775244-d011-813d-87a3-f9ce6171cc90
ioc:
  cves: []
  cwes: []
  hashes:
    - 83cf578390004ba13809245098034dde
    - 8ead0fb7b8c3ab42307b34648ae1c331
    - c884ebde4ed4e62b2e9132ce813f75b2
    - e8dc295506afd7e69794394254ef4224
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> - **核心结论：** 作者逆向重建了 IBM i 7.5 的 32 字节 PVV（Program Validation Value）计算算法，HMAC 密钥完全由程序属性和 LIC 固定常量导出，无独立机密，因此 PVV 只是可重算的一致性校验而非来源认证。
> - **算法结构：** PVV = HMAC-SHA-256(descriptor, canonical_message)；从保存程序图选取受保护字节区间、将保存指针规范化为"段号+段内偏移"、短于 0x400 的追加合并为单一流，最终以 4 个 64 位双字与程序图中四处存储值比对。
> - **离线验证规模：** 对 1,239 个可解析条目中全部 1,223 个已知有效值精确匹配，16 个故意变异样本均判无效，0 个未解释失配；工具集 `pvv-ibmi` 计划在 GitHub 开源，提供 `check`/`fix` 两个命令。
> - **实机控制实验：** 无特权的 USERB1 账户通过 QSRRSTO API 成功恢复 PVV 修复后的 CrackMe，修改分支指令后对错误口令打印 `pwd is ok`；重保存后修改的原生指令原样保留。
> - **安全后果与边界：** 修改后的 USER 态 MEMDUMP 绕过编译器生成的指针验证序列（LQ/TXER），读取了 QSECOFR 协作作业中已知地址的 USER 域缓冲区；但 SYSTEM/INHERIT 态变体因数字签名校验被拒（CPD37A0），USER 态访问 SYSTEM 域仍被 MCH6801 阻断——PVV 重建本身不构成漏洞或签名绕过。

## Why this matters

IBM i does not treat an application program as a normal file that happens to contain POWER instructions. A compiler produces Machine Interface (MI) code, IBM i’s stable instruction-level boundary, and the system translates it into a native form. The generated native code contains checks that support the IBM i object and tagged-pointer model.

Changing those instructions can make IBM i execute behavior that was not present in the MI input. Earlier [Below MI research](https://silentsignal.github.io/BelowMI/) examined the wider consequences on IBM i V7R4. Here I focus on the IBM i 7.5 [Program Validation Value (PVV)](https://www.ibm.com/docs/ssw_ibm_i_74/rzamv/rzamvprotectagainstviruses.htm), a 32-byte value stored with a saved program.

I reconstructed the 32-byte PVV calculation and matched all 1,223 known-valid values. The reconstructed calculation derives its HMAC key entirely from saved program attributes and fixed Licensed Internal Code (LIC) constants; it contains no separate secret for origin authentication. IBM i applies separate digital-signature checks where required. In controlled USER-state programs—the ordinary, non-SYSTEM execution mode—recalculating PVV and the separate save-file checks allowed selected native instruction changes to survive restore and resave. A disposable CrackMe produced the expected changed output, demonstrating execution.

USERB1, an ordinary test account without special authorities, restored a USERB1-owned, PVV-repaired `MEMDUMP` program through IBM’s Restore Object List (`QSRRSTO`) API, and a resave preserved its modified native instructions. Its executable payload matched byte-for-byte the payload used in a controlled runtime test. In that test, `MEMDUMP` ran as USERB1 and read from a known-address USER-domain buffer in a cooperating job running under QSECOFR, IBM i’s security-officer profile. Other controls showed IBM i rejecting unsigned SYSTEM and INHERIT program-state variants and enforcing the SYSTEM-domain access boundary.

My [previous article](https://blog.silentsignal.eu/2026/10/06/512-bytes-at-a-time-reconstructing-IBM-i-save-file-checksums/) covered the outer save file (SAVF) container: its per-record checksums and global checksum. During restore, IBM i also calculates PVV and compares it with four values stored in the saved program.

The USER-state controls ran under the test system’s existing [restore-policy system values](https://www.ibm.com/docs/en/i/7.5.0?topic=40-validation-programs-being-restored) (`QVFYOBJRST=3`, `QFRCCVNRST=1`, and `QALWOBJRST=*ALL`) at [QSECURITY 40](https://www.ibm.com/docs/en/i/7.5.0?topic=reference-using-system-security-qsecurity-system-value), which enforces resource security and integrity protection.

## Program validation and research approach

SAVF record and global checks establish container consistency; PVV establishes consistency with selected serialized program data. LIC copies the 32-byte descriptor unchanged into the HMAC key object. Every descriptor byte comes from saved program attributes or fixed LIC constants, and the recovered path contributes no additional secret. A party with the serialized program and the reconstructed algorithm can therefore derive the key and recompute PVV; a match establishes consistency, not trusted origin. Restore authorization and system policy still govern the operation, while digital signatures authenticate origin where required.

A program has separate [state and domain attributes](https://www.ibm.com/docs/en/i/7.5.0?topic=40-preventing-use-unsupported-interfaces). Its execution state is USER, SYSTEM, or INHERIT; INHERIT uses the caller’s state. The program object itself has a USER or SYSTEM domain, and that saved attribute contributes separately to the PVV descriptor. Other objects accessed by the executing code also have domains. The USER domain is a storage-domain classification, not a user identity or ownership boundary. At QSECURITY 40, USER-state code cannot directly access SYSTEM-domain objects.

### The algorithm at a glance

```
PVV = HMAC-SHA-256(descriptor, canonical_message)
```

PVV is calculated in four steps for the supported program format:

1.  Walk the saved program graph, select the protected byte ranges, normalize saved pointers, and put the ranges into canonical-message order.
2.  Build a 32-byte descriptor from program attributes and constants chosen by the recovered state, domain, version, release, and mode selectors.
3.  Use the descriptor as the HMAC key and the canonical message as the input to HMAC-SHA-256.
4.  Split the result into four 64-bit values and compare them with the stored values.

### Leif Svalgaard’s earlier PVV work was a clue

Leif Svalgaard described the earlier mechanism in Chapter 15, “Program Validation Value,” of [AS/400 Machine Level Programming](https://web.archive.org/web/20220523023735/https://svalgaard.leif.org/as400/mlp0tc.htm). His [public program index](https://web.archive.org/web/20220523023735/https://svalgaard.leif.org/as400/programs/index.htm) also lists `MIPGMVV`, which calculates an eight-byte value from program attributes. I reproduced his published example. Its four selector constants do not match the current LIC descriptor constants in either byte order, but both designs select values according to state and domain. That similarity pointed me toward the current 32-byte validation route.

## Finding the validator

I started with `CHKOBJITG`, the IBM i command that checks object integrity.

For a program, `CHKOBJITG` reaches the IBM-supplied `QSYS/QSYCHKIT` program. Its native procedure `QSYINTEGRI::checkPgmMod` contains this sequence, copied from the retained IBM Display/Alter/Dump (DAD) output:

```
2B463690C5 0052B4  0000D4  62E30000  ORI 3,23,0
2B463690C5 0052B8  0000D8  39400103  ADDI 10,0,259
2B463690C5 0052BC  0000DC  44000141  SCV 10
```

`ADDI` loads selector 259 into `r10`; the following `SCV 10`, Supervisor Call Vectored, enters dispatcher vector 10. The `10` in the mnemonic identifies the vector, while the value in `r10` selects the service. That combination led to this observed call path:

```rust
QSYCHKIT/QSYINTEGRI::checkPgmMod
  -> #cfmir
  -> #dotssob
  -> VBNTSSOB::#bntssob
  -> VBNTSSOB::vbnskew4
  -> VBNNAPE2::vbnspnt2
```

The live capture tied the path to the loaded address of my `CALLAES` test fixture. I matched the remaining code against the IBM i 7.5 LIC from installation media by procedure name, normalized instruction sequence, call topology, constants, and tables. The live instructions and invocation frames identify the observed `CHKOBJITG` route; the build-matched LIC supplies the complete procedure bodies. For both `VBNTSSOB` and `VBNNAPE2`, the installation addresses were `0x3000` above the captured live addresses and the normalized bodies agreed; that displacement is evidence for this match, not an IBM i addressing rule.

## Reconstructing PVV

My parser supports uncompressed IBM i 7.5 program (`*PGM`) and service-program (`*SRVPGM`) items whose record graph, section descriptors, and 40-bit segment identity plus 24-bit in-segment pointer mapping follow the recovered layout. It rejects other layouts before calculation instead of trying models until one happens to match the stored result.

### The stored result

`vbnspnt2` writes 32 calculated bytes, loads them as four 64-bit doublewords, and compares them with four values stored in different parts of the program graph. Any mismatch returns false.

For `CALLAES`, the item starts at SAVF logical offset `0x4000`. The item-relative offset must first be converted to a SAVF logical offset. That logical coordinate counts only 512-byte payloads; the physical coordinate also counts each 16-byte record trailer:

```python
logical = 0x4000 + item_offset
physical = (logical // 512) * 528 + (logical % 512)
```

Applying both stages gives these four locations:

| Part | Item offset | Logical SAVF offset | Physical SAVF offset | Stored bytes |
| --- | --- | --- | --- | --- |
| 0   | `0x22C0` | `0x62C0` | `0x65D0` | `E8DC295506AFD7E6` |
| 1   | `0x4B78` | `0x8B78` | `0x8FC8` | `9794394254EF4224` |
| 2   | `0x21F8` | `0x61F8` | `0x64F8` | `8EAD0FB7B8C3AB42` |
| 3   | `0x2648` | `0x6648` | `0x6978` | `307B34648AE1C331` |

In comparison order, the stored PVV is:

```
E8DC295506AFD7E69794394254EF4224
8EAD0FB7B8C3AB42307B34648AE1C331
```

### Building the canonical message

LIC follows a graph of program headers, components, procedure records, native sections, counted arrays, and optional records. It adds selected byte ranges, not the complete program item.

Saved pointers cannot be hashed directly because their segment identities may change after restore. LIC replaces them with a stable segment number and the offset inside that segment. For example:

```
saved pointer:       10804C6DE6001520
segment number:                       1
segment offset:                  0x1520
canonical value:    0000000100001520
```

LIC also changes the order of some data. Appends shorter than `0x400` bytes are copied into one owned stream. Appends of `0x400` bytes or more remain separate entries. The final HMAC message contains the complete copied stream first, followed by the retained entries.

Here, an aggregate entry is one buffer passed to the HMAC update path.

If the logical append order is a short span `A`, a retained span `B`, and a short span `C`, the message order is `A || C || B`.

For `CALLAES`, 65 logical appends became three aggregate entries:

| Entry | Length | Message offset |
| --- | --- | --- |
| copied spans | `0x1234` | `0x0000` |
| retained span 1 | `0x0610` | `0x1234` |
| retained span 2 | `0x0870` | `0x1844` |

The final message length was `0x20B4`, or 8,372 bytes.

### Building the descriptor

The descriptor contains four 64-bit values:

1.  one value formed by joining two four-byte program header fields;
2.  a fixed constant selected by state, domain, and version class;
3.  a constant selected by the target release;
4.  a constant selected by the recovered mode.

“Version class” and “mode” are names for reconstructed selector inputs. I do not present them as documented SAVF field names.

Within the retained fixtures, the recovered `version_kind=0x0028` input selects one version class by contributing 0 to the table index; other observed values, including `CALLAES` ’s `0x000A`, contribute 1. With `CALLAES` ’s USER state and domain, that selects `2E9132CE813F75B2`. The mode byte independently selects the fourth 64-bit descriptor value: mode 1 selects `3809245098034DDE`, while mode 2 selects `3809745098034DDE`.

Canonical program-state values are `0x0001` for USER, `0x0080` for SYSTEM, and `0x0000` for INHERIT. For descriptor selection, the state selector treats `0x0080` as SYSTEM, `0x0000` as INHERIT, and every other value as the remaining selector class. The domain selector tests the least significant bit of program base byte `+0x20` —bit 7 in IBM’s MSB-0 numbering. In the `CALLAES` fixture the byte was `0x80`; that bit is clear, so the program domain was USER. A byte of `0x81` selects SYSTEM program domain. This byte is separate from the 16-bit state value `0x0080`.

For `CALLAES`, the selected descriptor was:

```
C884EBDE4ED4E62B2E9132CE813F75B2
83CF578390004BA13809245098034DDE
```

The calculation selects these fixed tables without consulting the stored PVV.

### The cryptographic operation

The lower LIC code creates a key object, copies all 32 descriptor bytes into it, and feeds each aggregate entry to a message digest object. The next layer implements the standard HMAC construction with a 64-byte block, the `0x36` inner pad, the `0x5C` outer pad, and SHA-256.

The recovered calculation maps directly to Python’s standard HMAC implementation:

```python
import hashlib
import hmac

calculated = hmac.new(
    descriptor,
    canonical_message,
    hashlib.sha256,
).digest()
```

For `CALLAES`, it returns the exact 32 stored bytes shown above.

## Offline validation

I applied the recovered model to IBM-supplied save-file items and disposable programs and service programs. The corpus measures agreement and structural coverage over supported rows, not blind holdout or live restore and execution tests. The final totals were:

```yaml
known valid exact matches:        1,223
deliberate mutation fixtures:        16
successfully parsed rows:         1,239
unsupported program items:           17
total attempted items:            1,256
distinct structure profiles:      1,003
unexplained mismatches:                0
```

A structure profile fingerprints object type, release and version selectors, mode, record shapes, and canonical-chunk construction without including the protected byte values. The 1,003 profiles occur among the 1,223 known-valid rows; repeated saves or equivalent layouts can share one. The 16 deliberate mutation fixtures remained invalid. The parser rejected another 17 items before calculation: seven had malformed section descriptors or descriptors that did not expose the validated 40-bit segment and 24-bit offset mapping, and ten contained pointers that could not be mapped unambiguously to a recovered segment. These are unsupported structures, not unexplained PVV mismatches.

I produced these results with the local `pvv-ibmi` tool bundle. `pvv_demo.py` is its command-line entry point, `savf_checksum_demo.py` implements the SAVF checks, and `scripts/reconstruct_v7r5_pvv.py` parses the program graph and calculates PVV. I plan to publish the bundle and its usage notes in the [Silent Signal IBM i PVV repository](https://github.com/silentsignal/pvv-ibmi/).

The `--table` argument specifies `sandbox.ser`, which contains the lookup table used for the SAVF global checksum. I described its extraction in my [previous SAVF checksum article](https://blog.silentsignal.eu/2026/10/06/512-bytes-at-a-time-reconstructing-IBM-i-save-file-checksums/).

The tool’s two main commands are:

```bash
python3 pvv_demo.py --table sandbox.ser check input.FILE
python3 pvv_demo.py --table sandbox.ser fix modified.FILE repaired.FILE
```

`check` verifies the SAVF checks and PVV. `fix` calculates PVV, writes the four stored values, repairs the separate SAVF checks, and verifies the output in a new file while preserving the intended native change.

## Live restore controls

The offline matches establish the calculation. The following controls test how restore consumes the stored value, whether edited native code survives, and whether IBM i executes the changed control flow.

### A stale stored value

In the `P7QPM831` test program, I changed one stored PVV byte but left the protected program data unchanged. I repaired only the SAVF checks. `CPC3703` denotes normal restore completion in the baseline and corrected controls.

| Input | PVV | SAVF checks | Result |
| --- | --- | --- | --- |
| baseline | valid | valid | `CPC3703`, process status 0 |
| one stale byte | invalid | valid | `CPF3848`, `CPF3773`, process status 255 |
| corrected value | valid | valid | `CPC3703`, process status 0 |

The stale restore created an object, which I then saved again. The calling process returned status 255, while the substituted restore messages recorded the actual object counts:

```
CPF3848: 1 security or data format changes occurred.
CPF3773: 1 objects restored. 0 not restored.
```

The resaved object still contained the incorrect stored value. Writing the independently calculated value restored normal completion. The mismatch was therefore detected and changed the command outcome, but did not prevent object creation in this control.

### A native change that survived

The `RISCPVV1` test program measured native-code preservation without changing behavior. I replaced one instruction with a different instruction that copies the same register value:

```
before  60860000  ORI 6,4,0
after   7C862378  OR 6,4,4
```

The saved creation material—the input IBM i can use to recreate native code—remained unchanged. To distinguish preserved native code from code recreated from that material, I repaired PVV and the SAVF, restored the object, and saved it again. The executable payload was eight native records joined in graph order after removing each record’s final eight-byte saved-space pointer, which is metadata rather than executable payload.

All 1,120 executable bytes matched between the modified and resaved streams; the original differed at the edited instruction. The 40-bit segment-identity prefixes within those trailing pointers changed as expected when IBM i materialized the object; their 24-bit in-segment offsets did not. The executable payload and repaired PVV remained unchanged.

### CrackMe: a branch that changed behavior

`PVVPASS`, which I call CrackMe here, provided the visible control. This disposable fixture compared its argument with `silentsignal`, printed `pwd is ok` for a match, and printed `wrong` otherwise.

The retained source was:

```c
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv)
{
    if (argc > 1 && strcmp(argv[1], "silentsignal") == 0)
        puts("pwd is ok");
    else
        puts("wrong");
    return 0;
}
```

I compiled it as a native Integrated Language Environment (ILE) C program with `DBGVIEW(*NONE)`, `OPTIMIZE(40)`, and `ACTGRP(*CALLER)`, then saved it without compression.

The relevant saved instructions are below in reconstructed DAD style. Register 5 holds the current input byte. Register 0 holds the current expected byte.

```
1E75B1F2E2001F78  2C250000  CMPI   0,1,5,0
1E75B1F2E2001F7C  397E0010  ADDI   11,30,16
1E75B1F2E2001F80  387FFFC0  ADDI   3,31,-64
1E75B1F2E2001F84  63CC0000  ORI    12,30,0
1E75B1F2E2001F88  78CAC1C6  RLDICR 10,6,56,7
1E75B1F2E2001F8C  7C0103E6  SETTAG
1E75B1F2E2001F90  7CA50040  CMPL   1,1,5,0
1E75B1F2E2001F94  40860048  BC     4,6,0X48
1E75B1F2E2001F98  41820014  BC     12,2,0X14
1E75B1F2E2001F9C  8CA40001  LBZU   5,0X1(4)
1E75B1F2E2001FA0  2C250000  CMPI   0,1,5,0
1E75B1F2E2001FA4  8C0C0001  LBZU   0,0X1(12)
1E75B1F2E2001FA8  4BFFFFE8  B      0X3FFFFE8
```

The first `CMPI` sets `CR0.EQ` from the input byte. The instructions before `CMPL` do not change CR0. `SETTAG` affects the tag state, not the condition registers. `CMPL 1,1,5,0` sets `CR1.EQ` from the comparison of the input and expected bytes.

The branch at `0x1E75B1F2E2001F94` tests `CR1.EQ` and reaches the failure block when the bytes differ. The next branch tests `CR0.EQ` and reaches success when the input byte is zero. Equal nonzero bytes continue the loop.

The encoded displacements make the control flow explicit:

```
0x1E75B1F2E2001F94 + 0x48 -> 0x1E75B1F2E2001FDC  failure
0x1E75B1F2E2001F98 + 0x14 -> 0x1E75B1F2E2001FAC  success
0x1E75B1F2E2001FA8 - 0x18 -> 0x1E75B1F2E2001F90  next comparison
```

The saved text supports that mapping: `silentsignal` is at logical offset `0x69B0`, `pwd is ok` at `0x69C0`, and `wrong` at `0x69D0`. The success block selects the text at `r30+0x10`; the failure block selects `r30+0x20`.

I replaced only the mismatch branch:

```
before  40860048  BC 4,6,0X48
after   60000000  ORI 0,0,0
```

The variants produced this result:

| Saved variant | PVV | Instruction after resave | Output for incorrect input |
| --- | --- | --- | --- |
| baseline | valid | original branch | `wrong` |
| changed branch, stale PVV | stale | original branch | `wrong` |
| changed branch, repaired PVV | valid | changed instruction | `pwd is ok` |

The repaired program printed `pwd is ok` for both `nope` and `x`. A fresh save of the repaired object still contained `60000000` at the instruction site identified from the object structure.

### Restore access: command and API controls

IBM’s documented [Restore Object List (`QSRRSTO`) API](https://www.ibm.com/docs/en/i/7.5.0?topic=ssw_ibm_i_75%2Fapis%2Fqsrrsto.html) has a different authority model from the Restore Object (`RSTOBJ`) command. IBM has documented its default public authority as `*USE` since the [2006 Backup and Recovery APIs manual](https://public.dhe.ibm.com/systems/power/docs/systemi/v5r4/en_US/backup.pdf). That permits calling the API; it does not supply the user-space, save-file, library, or target-object authorities required for a restore. Callers without the `*SAVSYS` save-system special authority must satisfy those documented authority requirements, as USERB1 did within its test library.

For the end-to-end control, I rebuilt CrackMe from the retained source and the same compiler settings. I resolved the patch location from the new SAVF. The rebuilt program contained the same `40860048` mismatch branch at native record 1 offset `0xB4`. I created baseline, branch-edited/stale-PVV, and branch-edited/repaired-PVV variants; all three had valid SAVF checks.

With the repaired SAVF loaded into save file `TESTSAVF` in the USERB1 library and the target absent, `RSTOBJ` failed with `CPD0032` (not authorized to the command) and created no program. To test the API separately, I used a small, locally written USERB1-owned program that called `QSRRSTO` directly and restored `PVVPASS` into the USERB1 library. Both the caller and a small USERB1-owned wrapper that recorded the job context before and after invoking the caller were `USRPRF(*USER)` and `USEADPAUT(*NO)`, so they neither adopted their owners’ authority nor used authority adopted higher in the call stack. In the same job, the wrapper used IBM’s Retrieve Job Attributes command (`RTVJOBA`) to report current user `USERB1` immediately before and after the API call.

Under this authority context, the repaired variant produced the CrackMe output reported above. Its resave retained `60000000` at native record 1 offset `0xB4`, and its 1,032-byte executable payload matched the repaired input after the final eight-byte saved-space pointer was removed from each native record.

The stale-PVV API control restored with the original branch and printed `wrong` instead. This was one end-to-end test within USERB1’s authorized object scope: command denial, API restore, execution, and resave.

I then rebuilt `MEMDUMP` entirely as USERB1, applied the native edits to its saved representation, and repaired PVV and the SAVF checks. Running as USERB1, I called `QSYS/QSRRSTO`; it created the `MEMDUMP` program in the USERB1 library as a USER-state, USER-domain program owned by USERB1, with `USRPRF(*USER)` and `USEADPAUT(*NO)`. A fresh save retained both modified instruction sites. The repaired input, the USERB1-restored resave, and the distinct program object used for the memory-read test had byte-for-byte identical 1,496-byte executable payloads.

## Signature, state, and domain boundaries

The native code controls above used USER state. I also tested the separate state, domain, and signature boundaries.

| Control | Result |
| --- | --- |
| USER to SYSTEM state, PVV repaired | IBM i rejected it as unsigned with `CPD37A0`, then `CPF3770` (no object restored) |
| USER to INHERIT state, PVV repaired | IBM i rejected it as unsigned with `CPD37A0`, then `CPF3770` (no object restored) |
| USER state, USER to SYSTEM domain, PVV repaired | IBM i restored it with `CPC3703`; a USER-state call failed with `MCH6801` domain violation |

The repaired SYSTEM-state fixture passed the offline reconstructed PVV check, but the live restore failed the digital signature requirement:

```
offline PVV validation         PASS
live trusted-signature check   FAIL
```

I also traced the complete 16-bit state field. The relevant LIC branches reduce to this classification before the signature service is called:

```
state 0x0001 -> record flag 0
state 0x8000 -> record flag 0
all other 65,534 values -> record flag 1
```

The flag is an input to the later signature path, not the final restore result by itself. Canonical SYSTEM state is `0x0080`, and INHERIT state is `0x0000`; both produce flag 1. The activation resolver separately treats `0x0000` as INHERIT, selects SYSTEM only for `0x0080`, and sends `0x0001`, `0x8000`, and other noncanonical values to USER. I found no state value that both takes the flag 0 path and activates as SYSTEM on this route.

The `0x8000` state value is not SYSTEM state. It restored and activated as USER in the live control. The same hexadecimal value appears as the two-byte domain contribution for SYSTEM domain, but that is another field.

## Security impact

Under the tested conditions, externally modified USER-state native code bypassed a compiler-generated pointer-validation sequence and performed a memory access that the original compiled code could not. CrackMe independently established execution of modified native bytes; the controlled `MEMDUMP` runtime test established this consequence. The compiler-generated path used `LQ` to load the 128-bit pointer and record its tag status, `TXER` to check that status, and `_SETSPPFP` (Set Space Pointer from Pointer) before the memory access. At native section offset `+0x220C`, I replaced the first two instructions with a direct native load and branch:

```
; original
2f3708714600220c:  e2dfff9b  LQ         22,0XFF90(31),11
2f37087146002210:  7c0004c8  TXER       0,0,41
; replacement
2f3708714600220c:  eb7fff98  LD         27,0XFF98(31)
2f37087146002210:  48000028  B          0X28
; later target access
2f370871460022b8:  889b0000  LBZ        4,0X0(27)
```

The source had copied the supplied 64-bit address into this `r31` -relative slot; the `LD` loads it into `r27`, and the branch continues at `+0x2238`. The later `LBZ` at `+0x22B8` performs the byte read through `r27`. With the same supplied address, the unmodified `MEMDUMP` failed with `MCH3601` (pointer not set). The modified code bypassed the generated validation sequence and, when invoked as USERB1, returned the exact expected 32 bytes from a known-address USER-domain buffer belonging to a cooperating QSECOFR job. The target address was supplied by the cooperating QSECOFR job; obtaining such an address independently is a separate prerequisite.

For the supported saved-program format, the derivable HMAC key makes PVV a recomputable consistency check. With an editable SAVF and an authorized restore path, recalculating PVV and the SAVF checks preserved the tested USER-state native changes. Separate controls enforced trusted signatures for the tested SYSTEM and INHERIT variants and blocked USER-state access to SYSTEM-domain storage.

## Conclusion

PVV was the missing piece between editing saved native POWER instructions and preserving them through IBM i restore so that the modified code could execute. Reconstructing it turned that obstacle into a repeatable research workflow: CrackMe demonstrated changed native control flow, while `MEMDUMP` showed its practical consequence in a controlled, known-address USER-domain read. The PVV reconstruction is not by itself a vulnerability or a signature bypass; the `pvv-ibmi` release accompanying this article lets other researchers reproduce the calculation and use the same workflow, while restore authorization, trusted signatures, and domain enforcement remain separate boundaries.
