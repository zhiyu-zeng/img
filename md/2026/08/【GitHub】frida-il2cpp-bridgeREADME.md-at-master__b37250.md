---
title: 【GitHub】frida-il2cpp-bridge/README.md at master
source: https://github.com/vfsfitvnm/frida-il2cpp-bridge/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:24:23+08:00
trace_id: 8945dc6a-6fcd-4a18-b7c6-39abdd8013f1
content_hash: f00d2ed35906f4e45889815fc33b3796c5d9eb0eb4dbe0c577784248a7d5fe17
status: synced
tags:
  - GitHub
  - Frida
  - 游戏安全
series: null
feed_source: null
ai_summary: frida-il2cpp-bridge 是一款无需 `global-metadata.dat` 即可在运行时对任意 Il2Cpp 应用进行转储、跟踪或劫持的 Frida 模块。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3bc75244-d011-81a5-b977-f538cc240e4b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> frida-il2cpp-bridge 是一款无需 `global-metadata.dat` 即可在运行时对任意 Il2Cpp 应用进行转储、跟踪或劫持的 Frida 模块。
> 
> - **兼容范围：** 支持 Unity 5.3.0–6000.3.x，平台涵盖 Android、Linux、Windows、iOS、macOS，但仅 Android 和 Linux 经过充分测试，其余平台可能存在问题。
> - **核心能力：** 可转储类、方法、字段，跟踪/拦截/替换方法调用，操作 C# 运行时，并几乎免费获取 Il2Cpp 结构体与全局元数据。
> - **CLI 用法：** 从 0.10.0 起内置 Python 可执行文件，通过 `npm exec frida-il2cpp-bridge -- dump --help` 查看选项；示例命令 `npm exec frida-il2cpp-bridge -- -f com.example.application dump --out-dir dumps` 可转储目标应用。
> - **转储输出：** 支持 `none/stdout/flat/tree` 四种 C# 输出风格，默认 tree 按程序集生成目录；示例输出显示 1.13s 加载 IL2CPP 模块，收集 2904 个类耗时 4.76s，保存到 `dumps/com.example.application/1.12.8`。
> - **测试机制：** 提供本地（仅 Linux x86_64）与 Docker 两套测试流程，自动下载 Unity 编辑器构建测试用 GameAssembly.so；已知 2021.2.0f1 的 Docker 镜像构建目前存在问题。

## frida-il2cpp-bridge

[![Frida](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c14217011443f13d.svg)](https://frida.re/) [![NPM](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/22aed36262d0bb70.svg)](https://npmjs.org/package/frida-il2cpp-bridge)

A Frida module to dump, trace or hijack any Il2Cpp application at runtime, without needing the `global-metadata.dat` file.

[![code](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0b0bec1b88cb1f36.png)](https://private-user-images.githubusercontent.com/46219656/238412543-d8e81811-b98c-4d67-9cea-be8cab8947ef.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3ODY2OTk3NjMsIm5iZiI6MTc4NjY5OTQ2MywicGF0aCI6Ii80NjIxOTY1Ni8yMzg0MTI1NDMtZDhlODE4MTEtYjk4Yy00ZDY3LTljZWEtYmU4Y2FiODk0N2VmLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNjA4MTQlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjYwODE0VDA5MjQyM1omWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTkwYzdlYmIwMGI3NDhhMGQ2OGFlYTU5MDA4YmViYTY0MGE5ZGMyNmE3YTE0ZjJmNzRlYjZiOTU2OTFkODAyNDMmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0JnJlc3BvbnNlLWNvbnRlbnQtdHlwZT1pbWFnZSUyRnBuZyJ9.5J-ZNVneIf0nuDpFEdjY-YPDnCWmRj1G8-zSzx3e7Nk)

## Features

-   Dump classes, methods, fields and so on
-   Trace, intercept and replace method calls
-   Mess around with the C# runtime
-   Il2Cpp structs and global metadata (almost) free

## Compatibility

#### Unity version

It should work for any Unity version in the range **5.3.0** - **6000.3.x**.

#### Platforms

**Android**, **Linux**, **Windows**, **iOS**, **macOS** are supported. However, only Android and Linux are "tested": expect breakage if you are using another platform.

## CLI

Starting from version `0.10.0`, a `frida-il2cpp-bridge` Python executable is included alongside the NPM package installation. This executable wraps the `frida` command and adds IL2CPP specific features. To invoke it, simply run:

```
npx frida-il2cpp-bridge --help
```

or

```bash
npm exec frida-il2cpp-bridge -- --help
```

### Dumping

Use the `dump` subcommand to dump an application:

```bash
$ npm exec frida-il2cpp-bridge -- dump --help
usage: frida-il2cpp-bridge [options] dump [-h] [--out-dir OUT_DIR] [--cs-output {none,stdout,flat,tree}] [--no-namespaces] [--flatten-nested-classes] [--keep-implicit-base-classes]
                                          [--enums-as-structs] [--no-type-keywords] [--actual-constructor-names] [--indentation-size INDENTATION_SIZE]

options:
  -h, --help            show this help message and exit
  --out-dir OUT_DIR     where to save the dump (defaults to current working dir)
  --cs-output {none,stdout,flat,tree}
                        style of C# output (defaults to tree)
                        -   none: do nothing;
                        - stdout: print to console;
                        -   flat: one single file (dump.cs);
                        -   tree: directory structure having one file per assembly.
  --no-namespaces       do not emit namespace blocks, and prepend namespace name in class declarations
  --flatten-nested-classes
                        write nested classes at the same level of their inclosing classes, and prepend enclosing class name in their declarations
  --keep-implicit-base-classes
                        write implicit base classes (class -> System.Object, struct -> System.ValueType, enum -> System.Enum) in class declarations
  --enums-as-structs    write enum class declarations as structs
  --no-type-keywords    use fully qualified names for builtin types instead of their keywords (e.g. use 'System.Int32' instead of 'int', or 'System.Object' instead of 'object')
  --actual-constructor-names
                        write actual constructors names (e.g. '.ctor' and '.cctor')
  --indentation-size INDENTATION_SIZE
                        indentation size (defaults to 4)
```

Example:

```bash
npm exec frida-il2cpp-bridge -- -f com.example.application dump --out-dir dumps
```

Output:

```
Spawning `com.example.application`...
IL2CPP module loaded in 1.13s (id=com.example.application, version=1.12.8, unity version=2019.3.0f1)
Dumping mscorlib: 2872 of 2872 classes
Dumping GameAssembly: 32 of 32 classes
Collected 2904 classes in 4.76s
Dump saved to dumps/com.example.application/1.12.8
```

## Testing

Over the time, it was realized that some testing was necessary, as supporting many Unity version makes introducing regressions or faulty features easy. Though it's far from being complete and bullet-proof, there's a minimal testing setup contributors can get advantage of to test their changes.  
In order to test `frida-il2cpp-bridge`, a IL2CPP application is needed (of course). Here are some very useful resources:

-   [IL2CPP toolchain](https://katyscode.wordpress.com/2020/06/24/il2cpp-part-1/)
-   [Scripting](https://github.com/djkaty/Il2CppInspector/blob/116c6355e7ee3656eab85ca753f913d428abc7a3/Il2CppTests/il2cpp.ps1)

### Commands (local)

Unity editors (so IL2CPP toolchains) will be downloaded and extracted automatically.

**Prerequisites**

1.  Only Linux (x86_64) is currently supported;
2.  Make sure to have `clang` and `make` installed.

#### Build IL2CPP assembly (GameAssembly.so) for a specific Unity version only

```
make assembly UNITY_VERSION=6000.3.10f1
```

#### Run test on each assembly

```
make test
```

### Commands (Docker)

Currently, testing-related commands for Linux (x86_64) are provided, however there's a Dockerfile so that it's possible to create a container on any OS or arch (a virtualization system/emulator might be required).

**Prerequisites**

1.  Docker (or similar);
2.  Emulator/virtualization (*optional*).

#### Build Docker image for a specific Unity version

```
make image UNITY_VERSION=2023.2.20f1
```

This creates a Docker image tagged as `frida-il2cpp-bridge-playground:2023.2.20f1` having roughly the following content:

```
~/
└── build/
    ├── 2023.2.20f1/
    │   └── out
    │       ├── Data
    │       │   ├── Metadata
    │       │   │  └── global-metadata.dat
    │       │   ├── Resources
    │       │   │  └── mscorlib.dll-resources.dat
    │       └── GameAssembly.so
    └── host
```

As you can see, it only contains artifacts (and `frida-server`, of course). However, multi stage Docker builds are used so that you can stop at any step:

```bash
# Just get the Unity editor in it
docker build \
  --platform linux/amd64 \
  --build-arg UNITY_VERSION=2023.2.20f1 \
  --target unity-editor \
  -t unity:2023.2.20f1 \
  test
```

#### Run tests on each Docker image

```
make testd
```

#### Limitations

-   Image build for 2021.2.0f1 is currently broken.

## Acknowledgements

Thanks to [meme](https://github.com/meme) and [knobse](https://github.com/knobse) for helping and getting me into this, and to [djkaty](https://github.com/djkaty) and [nneonneo](https://github.com/nneonneo) for providing the Il2Cpp API.

## Problems?

Discussions and Wiki are both active. Use them!
