---
title: 【GitHub】Il2CppDumper/README.md at master
source: https://github.com/Perfare/Il2CppDumper/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:23:58+08:00
trace_id: fda0dc40-28dc-4947-a052-99eede008ca6
content_hash: 7d27d1c882de90c1dce9d26a8d6344429f0cdc72aea4c3936ddc854383f3bbe7
status: synced
tags:
  - GitHub
  - 游戏安全
  - 安全工具
series: null
feed_source: null
ai_summary: Il2CppDumper 能从 Unity il2cpp 可执行文件与 global-metadata.dat 恢复完整 DLL 与结构信息，支持多平台文件格式并导出 IDA/Ghidra/Binary Ninja 分析脚本。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3bc75244-d011-8175-a7d5-dda6e6b8c98d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Il2CppDumper 能从 Unity il2cpp 可执行文件与 global-metadata.dat 恢复完整 DLL 与结构信息，支持多平台文件格式并导出 IDA/Ghidra/Binary Ninja 分析脚本。
> 
> - **支持范围：** 支持 ELF、ELF64、Mach-O、PE、NSO 和 WASM 格式，覆盖 Unity 5.3 至 2022.2；可生成 DummyDll（供 dnSpy/ILSpy 查看，配合 UtinyRipper/UABE 提取 MonoBehaviour 和 MonoScript），以及 il2cpp.h、ida.py、ghidra.py、Il2CppBinaryNinja、script.json、stringliteral.json 等输出。
> - **命令行用法：** `Il2CppDumper.exe <executable-file> <global-metadata> <output-directory>`，交互模式下按提示选择文件并输入信息，输出文件生成于当前目录。
> - **配置项：** config.json 可控制是否输出方法/字段/属性/特性/偏移信息（DumpMethod、DumpField、DumpProperty、DumpAttribute、DumpFieldOffset、DumpMethodOffset、DumpTypeDefIndex），是否生成 DummyDll 与脚本（GenerateDummyDll、GenerateScript），以及 DummyDllAddToken、RequireAnyKey、ForceIl2CppVersion、ForceVersion、ForceDump、NoRedirectedPointer 等选项。
> - **保护绕过：** 支持加载 Android 内存 dump 出的 libil2cpp.so 绕过保护，也可通过 ForceDump 强制作为 dump 文件处理；对元数据被混淆的 global-metadata.dat 不负责去混淆，推荐使用作者另一项目 Zygisk-Il2CppDumper 在 rooted 设备上绕过保护。
> - **常见错误排查：** 提示 “Metadata file supplied is not valid metadata file” 说明选错文件或元数据被保护；“Can't use auto mode” 时 PC 平台需使用 GameAssembly.dll 或 *Assembly.dll；提示保护文件时可先用 GameGuardian 从游戏内存 dump libil2cpp.so 再加载。

## Il2CppDumper

[![Build status](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/21714f2ce1651e1f.svg)](https://ci.appveyor.com/project/Perfare/il2cppdumper/branch/master/artifacts)

中文说明请戳 [这里](https://github.com/Perfare/Il2CppDumper/blob/master/README.zh-CN.md)

Unity il2cpp reverse engineer

## Features

-   Complete DLL restore (except code), can be used to extract `MonoBehaviour` and `MonoScript`
-   Supports ELF, ELF64, Mach-O, PE, NSO and WASM format
-   Supports Unity 5.3 - 2022.2
-   Supports generate IDA, Ghidra and Binary Ninja scripts to help them better analyze il2cpp files
-   Supports generate structures header file
-   Supports Android memory dumped `libil2cpp.so` file to bypass protection
-   Support bypassing simple PE protection

## Usage

Run `Il2CppDumper.exe` and choose the il2cpp executable file and `global-metadata.dat` file, then enter the information as prompted

The program will then generate all the output files in current working directory

### Command-line

```
Il2CppDumper.exe <executable-file> <global-metadata> <output-directory>
```

### Outputs

#### DummyDll

Folder, containing all restored dll files

Use [dnSpy](https://github.com/0xd4d/dnSpy), [ILSpy](https://github.com/icsharpcode/ILSpy) or other.Net decompiler tools to view

Can be used to extract Unity `MonoBehaviour` and `MonoScript`, for [UtinyRipper](https://github.com/mafaca/UtinyRipper), [UABE](https://7daystodie.com/forums/showthread.php?22675-Unity-Assets-Bundle-Extractor)

#### ida.py

For IDA

#### ida_with_struct.py

For IDA, read il2cpp.h file and apply structure information in IDA

#### il2cpp.h

structure information header file

#### ghidra.py

For Ghidra

#### Il2CppBinaryNinja

For BinaryNinja

#### ghidra_wasm.py

For Ghidra, work with [ghidra-wasm-plugin](https://github.com/nneonneo/ghidra-wasm-plugin)

#### script.json

For ida.py, ghidra.py and Il2CppBinaryNinja

#### stringliteral.json

Contains all stringLiteral information

### Configuration

All the configuration options are located in `config.json`

Available options:

-   `DumpMethod`, `DumpField`, `DumpProperty`, `DumpAttribute`, `DumpFieldOffset`, `DumpMethodOffset`, `DumpTypeDefIndex`
    
    -   Whether to output these information to dump.cs
-   `GenerateDummyDll`, `GenerateScript`
    
    -   Whether to generate these things
-   `DummyDllAddToken`
    
    -   Whether to add token in DummyDll
-   `RequireAnyKey`
    
    -   Whether to press any key to exit at the end
-   `ForceIl2CppVersion`, `ForceVersion`
    
    -   If `ForceIl2CppVersion` is `true`, the program will use the version number specified in `ForceVersion` to choose parser for il2cpp binaries (does not affect the choice of metadata parser). This may be useful on some older il2cpp version (e.g. the program may need to use v16 parser on il2cpp v20 (Android) binaries in order to work properly)
-   `ForceDump`
    
    -   Force files to be treated as dumped
-   `NoRedirectedPointer`
    
    -   Treat pointers in dumped files as unredirected, This option needs to be `true` for files dumped from some devices

## Common errors

#### ERROR: Metadata file supplied is not valid metadata file.

Make sure you choose the correct file. Sometimes games may obfuscate this file for content protection purposes and so on. Deobfuscating of such files is beyond the scope of this program, so please **DO NOT** file an issue regarding to deobfuscating.

If your file is `libil2cpp.so` and you have a rooted Android phone, you can try my other project [Zygisk-Il2CppDumper](https://github.com/Perfare/Zygisk-Il2CppDumper), it can bypass this protection.

#### ERROR: Can't use auto mode to process file, try manual mode.

Please note that the executable file for the PC platform is `GameAssembly.dll` or `*Assembly.dll`

You can open a new issue and upload the file, I will try to solve.

#### ERROR: This file may be protected.

Il2CppDumper detected that the executable file has been protected, use `GameGuardian` to dump `libil2cpp.so` from the game memory, then use Il2CppDumper to load and follow the prompts, can bypass most protections.
