---
title: PE Support Enhancements
source: https://lief.re/blog/2025-02-16-arm64ec-pe-support/
source_host: lief.re
clip_date: 2026-11-11T10:18:29+08:00
trace_id: 8c0ab25c-4846-4446-818a-86852814eea2
content_hash: a5176c42074e20f68bf92ccb57ae24cc63eaca6ca62e4db520ce86c5ffe5c8cc
status: synced
tags: []
series: null
feed_source: LIEF·二进制逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41575244-d011-81b7-8212-cbffd12cd18c
ioc: null
---

**I'm pleased to share that LIEF's PE support has been significantly improved on both aspects: parsing and writing.**  
  

![Featuring Image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7ec4261a6b0ee670.webp)

## Parsing Improvements

One of the significant updates in LIEF is the enhanced processing of the `IMAGE_LOAD_CONFIG_DIRECTORY` which now includes a detailed parsing of the underlying structures it references.

For instance, the *Dynamic Value Relocation Table* [1](#fn:1) is now fully supported and can be accessed through the Python, C++, and Rust APIs:

```python
import lief

pe = lief.PE.parse("win11_arm64x_Windows.Media.Protection.PlayReady.dll")

dyn_reloc_table = pe.load_configuration.dynamic_relocations

for r in dyn_reloc_table:
 print(r)
```

```text
Dynamic Value Relocation Table (version: 1)
Symbol VA: 0x0000000000000006 (RELOCATION_ARM64X)
Fixup RVAs (ARM64X)
 [0000] RVA 0x0000010c, 2 bytes, target value 64:86
 [0001] RVA 0x00000130, 4 bytes, target value d0:bc:57:00
 [0002] RVA 0x00000190, 4 bytes, target value 30:22:d8:00
 [0003] RVA 0x00000194, 4 bytes, target value 30:01:00:00
 ...
```

All the structures involved in these dynamic relocations can be accessed through an API, including support for special relocations:

-   `IMAGE_DYNAMIC_RELOCATION_ARM64X`
-   `IMAGE_DYNAMIC_RELOCATION_FUNCTION_OVERRIDE`
-   `IMAGE_DYNAMIC_RELOCATION_ARM64_KERNEL_IMPORT_CALL_TRANSFER`
-   `IMAGE_DYNAMIC_RELOCATION_GUARD_IMPORT_CONTROL_TRANSFER`

With the introduction of this new dynamic relocation support, LIEF can now offer a **relocated view** of the ARM64EC binary that is embedded within an ARM64X binary. To achieve this, simply parse the ARM64X PE binary with all options enabled.

```rust
let pe = lief::pe::Binary::parse_with_config(
 "win11_arm64x_Windows.Media.Protection.PlayReady.dll",
 lief::pe::ParserConfig::with_all_options(),
).unwrap();

if let Some(nested_arm64ec) = pe.nested_pe_binary() {
 println!("{:?}", nested_arm64ec.header());
}
```

or in Python:

```rust
pe = lief.PE.parse("win11_arm64x_Windows.Media.Protection.PlayReady.dll",
 lief.PE.ParserConfig.all)

if nested_arm64ec := pe.nested_pe_binary:
 print(nested_arm64ec.header)
```

```text
Signature: 50 45 00 00
Machine: AMD64
Number of sections: 19
Pointer to symbol table: 0x0
Number of symbols: 0
Size of optional header: 0xf0
Characteristics: EXECUTABLE_IMAGE, LARGE_ADDRESS_AWARE, DLL
Timtestamp: 1966221527
```

Parser Config

To maintain the performance of LIEF v0.17.0 in line with previous versions, the parsing of nested ARM64EC binaries must be **explicitly** enabled during the `lief.PE.parse()` operation (the default is false).

LIEF provides helper functions such as: `lief.PE.Binary.is_arm64x()` and `lief.PE.Binary.is_arm64ec()` to determine whether a given PE is ARM64 emulation compatible (EC) or if it’s a *fat* ARM64X.

These helper functions rely on the CHPE metadata (Compiled Hybrid Portable Executable) which is accessible through LIEF for both: ARM64/ARM64EC binaries and legacy x86 binaries executed via WoW64:

```python
import lief

# ARM64 CHPE
pe = lief.PE.parse("arm64x_ImagingEngine.dll")

chpe: lief.PE.CHPEMetadataARM64 = pe.load_configuration.chpe_metadata
print(chpe_metadata.auxiliary_delay_import)
print(chpe_metadata.code_ranges)

# x86/WoW64 CHPE
pe = lief.PE.parse("Windows.Media.dll")

chpe: lief.PE.CHPEMetadataX86 = pe.load_configuration.chpe_metadata
print(chpe_metadata.compiler_iat_pointer)
print(chpe_metadata.wowa64_dispatch_ret_function_pointer)
```

LIEF can now also process in-depth exception information for x86-64 and ARM64 binaries as well as COFF strings and COFF symbols that are still used by some toolchains.

## Writing Improvements

As mentioned at the beginning of this blog post, LIEF’s PE modification engine, also named Builder, has been completely refactored to enhance its reliability and consistency when modifying PE binaries. To support this update, the documentation includes a dedicated section detailing the types of modifications supported by LIEF and their limitations:

-   [Imports Modification](https://lief.re/doc/latest/formats/pe/modifications/imports.html)
-   [Resources Modification](https://lief.re/doc/latest/formats/pe/modifications/resources.html)
-   [TLS Modification](https://lief.re/doc/latest/formats/pe/modifications/tls.html)
-   [Debug Modification](https://lief.re/doc/latest/formats/pe/modifications/debug.html)
-   [Exports Modification](https://lief.re/doc/latest/formats/pe/modifications/exports.html)

For instance, [PE import modification](https://lief.re/doc/latest/formats/pe/modifications/imports.html) has been completely redesigned to avoid using *trampolines*.

![PE Import Table for MSVC Binaries](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed6ce374e3e2690f.webp)

Likewise, LIEF can now commit changes made to the export table. This enables the creation of new exports that can be used to expose reverse-engineered functions or to deceive disassemblers, as mentioned in [The Poor Man’s Obfuscator](https://www.romainthomas.fr/publication/22-pst-the-poor-mans-obfuscator/)

![BinaryNinja Result](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df280285b9a075d4.webp)

## BinaryNinja ARM64EC Support

The ARM64EC ABI [2](#fn:2), created by Microsoft, was developed to ease interoperability between ARM64 and x86-64 architectures, particularly for parts of the code that require emulation (EC = Emulation Compatible). The specifications of this ABI have a somewhat counterintuitive aspect: the targeted architecture indicated in the PE header is `AMD64`, while the majority of the functions are compiled for ARM64.

Darek Mihocka, one of the authors of the ARM64EC ABI, details some of these design choices in a great blog post [3](#fn:3) that also provides a historical background about the support of new architectures in Windows.

Because the PE header specifies the x86-64 architecture, which does not accurately reflect most of the functions compiled in the binary, many disassemblers become confused when trying to analyze such a binary:

![IDA analysis of an ARM64EC binary showing many functions missing from the recognized function list](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/581bdf96e52923fb.webp)

![Binary Ninja ARM64EC analysis before the LIEF plugin, with only a few functions identified](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/689466568ffbebdb.webp)

To address this incomplete support, I developed a BinaryNinja plugin designed to identify additional functions and accurately determine the architecture for which each function has been compiled.

For example, after using this plugin, we obtain a feature map in BinaryNinja showing that a majority of the functions have been correctly recognized:

![Binary Ninja ARM64EC analysis after the LIEF plugin, with many more functions identified](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9ecaccfae22ace94.webp)

The plugin is written in Rust using both LIEF & BinaryNinja Rust bindings. This also serves as an opportunity to evaluate the LIEF Rust API and its integration into other projects.

First, we can get a LIEF PE instance from a `BinaryView` with:

```rust
fn enhance_with_lief(bv: &BinaryView) {
 let filename = bv.file().filename();
 let pe = lief::pe::Binary::parse_with_config(
 filename.as_str(),
 // This is required to get access to the exceptions info that are used later
 lief::pe::ParserConfig::with_all_options(),
 ).unwrap();
}
```

Memory Footprint

Memory-wise, parsing the PE loaded by BinaryNinja with LIEF is not ideal since the same binary exists in memory twice: once for the BinaryNinja instance and once for the LIEF instance. I think that the BinaryNinja team will enhance the support for ARM64EC binaries at some point, so in the meantime this memory overhead is acceptable.

Once we have this instance, we can use the exceptions table as a source of function addresses allowing BinaryNinja to begin disassembling the binary from these addresses:

```rust
let pe: &lief::pe::Binary;
let bv: &BinaryView;

let windows_arm64 = Platform::by_name("windows-aarch64").unwrap().to_owned();
let windows_x64 = Platform::by_name("windows-x86_64").unwrap().to_owned();

let imagebase = pe.optional_header().imagebase();

for exception in pe.exceptions() {
 match exception {
 lief::pe::RuntimeExceptionFunction::X86_64(x64) => {
 let addr: u64 = imagebase + (x64.rva_start() as u64);
 bv.add_auto_function(&windows_x64, addr);
 }

 lief::pe::RuntimeExceptionFunction::AArch64(arm64) => {
 let addr: u64 = imagebase + (arm64.rva_start() as u64);
 bv.add_auto_function(&windows_arm64, addr);
 }
 }
}

bv.update_analysis();
```

This code leads to the feature map shown in the screenshot above. Although the algorithm is straightforward, it hides an important aspect of the ARM64EC ABI:

The exceptions table referenced by the data directory at the index: `IMAGE_DIRECTORY_ENTRY_EXCEPTION` points to the **X86_64 table**. To access the ARM64 exceptions table we need to refer to the CHPE metadata:

```rust
let loadconfig = pe.load_configuration().unwrap();

if let Some(lief::pe::CHPEMetadata::ARM64(arm64)) = loadconfig.chpe_metadata() {
 let arm64_exception_table_start = arm64.extra_rfe_table();
 let arm64_exception_table_size = arm64.extra_rfe_table_size();
 println!("{:#x} ({} bytes)", arm64_exception_table_start, arm64_exception_table_size);
}
```

LIEF abstracts the processing of CHPEMetadata and provides an iterator that outputs one of the following exceptions object:

-   `lief::pe::exception_x64::RuntimeFunction`
-   `lief::pe::exception_aarch64::RuntimeFunction`

You can find more details about the exception support by LIEF in the dedicated PE changelog: [https://lief.re/doc/latest/changelog/pe-0-17-0.html#pe-0170-changelog](https://lief.re/doc/latest/changelog/pe-0-17-0.html#pe-0170-changelog)

The source code for the BinaryNinja plugin is available on GitHub: [lief-project/lief-binaryninja-arm64ec](https://github.com/lief-project/lief-binaryninja-arm64ec). It contains additional features, but the code should be read through the lens of a proof of concept.

1.  [https://denuvosoftwaresolutions.github.io/DVRT/dvrt.html](https://denuvosoftwaresolutions.github.io/DVRT/dvrt.html) [↩](#fnref:1 "return to article")
    
2.  [https://learn.microsoft.com/en-us/windows/arm/arm64ec](https://learn.microsoft.com/en-us/windows/arm/arm64ec) [↩](#fnref:2 "return to article")
    
3.  [http://www.emulators.com/docs/abc_arm64ec_explained.htm](http://www.emulators.com/docs/abc_arm64ec_explained.htm) [↩](#fnref:3 "return to article")
