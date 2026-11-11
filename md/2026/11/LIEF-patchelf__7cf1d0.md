---
title: LIEF patchelf
source: https://lief.re/blog/2025-07-13-patchelf/
source_host: lief.re
clip_date: 2026-11-11T10:36:39+08:00
trace_id: 38a6d674-cdfd-4c54-92c2-8856a6909d0b
content_hash: 6f445e9a01317fd4823079f75fb410e551524a214ca6723f546b7ab983f4b987
status: synced
tags: []
series: null
feed_source: LIEF·二进制逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41575244-d011-81f6-82a2-f5906d00fac7
ioc: null
---

![Featuring Image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00ed4d6211802cd5.webp)  

## Introduction

[patchelf](https://github.com/NixOS/patchelf) is a utility developed by the NixOS community to facilitate modifications of some parts of an ELF binary.

The features offered by patchelf include, but are not limited to:

```bash
# Change the interpreter path
$ patchelf --set-interpreter /lib/my-ld-linux.so.2 my-program

# Add a new dependency
$ patchelf --add-needed libfoo.so.1 my-program

# Change RUN/RPATH values
$ patchelf --set-rpath /opt/my-libs/lib:/other-libs my-program
```

In addition to its use in NixOS, many projects leverage patchelf to perform post-compilation modifications. For example, [pypa/auditwheel](https://github.com/pypa/auditwheel) uses `patchelf` to change the rpath value and/or change the names of `DT_NEEDED` libraries.

## LIEF & Patchelf

Unlike LIEF, patchelf is not a library, and the current version (0.18.0) can only be accessed via the command line. The source code of patchelf is relatively small (around 3,000 lines of code) and is focused on specific modifications such as renaming/removing `DT_NEEDED` entries and changing/removing/adding `DT_RPATH/DT_RUNPATH`.

When it comes to design decisions for modifying ELF binaries, there is a significant difference between patchelf and LIEF:

Section vs Segments

**Patchelf relies on the section layout to modify and rewrite ELF binaries, while LIEF uses segments representation. This distinction makes patchelf less reliable for ELF binaries that have a non-standard section layout, whereas the representation used by LIEF corresponds to how binaries are loaded, making it less prone to errors during modifications.**

## LIEF-based patchelf

LIEF already had (almost) all the internal features to provide the same functionalities as `patchelf`. However, LIEF does not offer a comprehensive command-line tool like patchelf does. To create a drop-in replacement for patchelf using the LIEF backend, we had to ensure compatibility with the current state of patchelf, including:

1.  A command-line interface
2.  Completion for `zsh` (at least)
3.  A man-page

Thanks to the recent LIEF’s Rust bindings, we can leverage the Rust ecosystem to simplify the development of this command-line tool:

-   The crate [clap-rs/clap](https://docs.rs/clap/latest/clap/) provides all the features to create a command-line interface with a man-page and completion for the main shells.
-   Cargo and its dependencies management are convenient for generating an executable.

![Rust, clap-rs, and LIEF components used to build lief-patchelf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/86fde118b84406f4.webp)

The source code is available here: [lief-project/LIEF/tools/lief-patchelf](https://github.com/lief-project/LIEF/tree/main/tools/lief-patchelf) and it is worth mentioning that this LIEF-based implementation has the **exact** same command line interface as the original `patchelf`:

```bash
$ lief-patchelf --help
Patchelf based on LIEF

Usage: lief-patchelf [OPTIONS] [filenames]...

Arguments:
 [filenames]...

Options:
 --set-interpreter <INTERPRETER>
 Change the dynamic loader ('ELF interpreter') of executable given to INTERPRETER.

 --page-size <SIZE>
 Uses the given page size instead of the default

 --print-interpreter
 Prints the ELF interpreter of the executable. (e.g. `/lib64/ld-linux-x86-64.so.2`)

 --print-os-abi
 Prints the OS ABI of the executable (`EI_OSABI` field of an ELF file).
```

Moreover, it passes [1](#fn:1) all the original patchelf’s test suite except one test related to the `IA-64` architecture support:

```yaml
PASS: set-interpreter-same.sh
PASS: no-rpath-alpha.sh
PASS: no-rpath-amd64.sh
PASS: no-rpath-armel.sh
PASS: no-rpath-armhf.sh
PASS: no-rpath-hurd-i386.sh
PASS: no-rpath-i386.sh
FAIL: no-rpath-ia64.sh
PASS: no-rpath-kfreebsd-amd64.sh
PASS: no-rpath-kfreebsd-i386.sh
PASS: no-rpath-mips.sh
PASS: no-rpath-mipsel.sh
PASS: no-rpath-powerpc.sh
PASS: no-rpath-s390.sh
PASS: no-rpath-sh4.sh
PASS: no-rpath-sparc.sh
============================================================================
Testsuite summary for patchelf 0.18.0 (based on LIEF 0.17.0)
============================================================================
# TOTAL: 58
# PASS: 55
# SKIP: 2
# XFAIL: 0
# FAIL: 1
# XPASS: 0
# ERROR: 0
```

## Download

If you want to test this new LIEF-based implementation, you can download the compiled version here:

-   [`lief-tools-aarch64-apple-darwin.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-aarch64-apple-darwin.zip)
-   [`lief-tools-aarch64-pc-windows-msvc.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-aarch64-pc-windows-msvc.zip)
-   [`lief-tools-aarch64-unknown-linux-gnu.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-aarch64-unknown-linux-gnu.zip)
-   [`lief-tools-aarch64-unknown-linux-musl.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-aarch64-unknown-linux-musl.zip)
-   [`lief-tools-i686-unknown-linux-musl.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-i686-unknown-linux-musl.zip)
-   [`lief-tools-x86_64-apple-darwin.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-x86_64-apple-darwin.zip)
-   [`lief-tools-x86_64-pc-windows-msvc.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-x86_64-pc-windows-msvc.zip)
-   [`lief-tools-x86_64-unknown-linux-gnu.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-x86_64-unknown-linux-gnu.zip)
-   [`lief-tools-x86_64-unknown-linux-musl.zip`](https://lief.re/blog/2025-07-13-patchelf/lief-tools-x86_64-unknown-linux-musl.zip)

1.  Since LIEF performs in-depth modifications and can raise different error messages, I had to make minor changes on some checks: [patchelf-test-lief.diff](https://gist.github.com/romainthomas/2332cddd164cf8bfa3fc65cd61496c9a) [↩](#fnref:1 "return to article")
