---
title: Reversing a (not-so-) Simple Rust Loader
source: https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/
source_host: cxiao.net
clip_date: 2026-11-12T10:23:00+08:00
trace_id: c33a94ea-b627-4eaa-9cf6-81700d43db97
content_hash: d5fd9bcbcbaa80e1d9b8b7bd041ae0419afaaf2b3608b70bb56da1b2609d0a23
status: summarized
tags:
  - 恶意样本
  - Rust逆向
series: null
feed_source: cxiao·Rust逆向
ai_summary: TL;DR：一篇 Rust 恶意加载器的逆向分析文章：通过 Discord 假游戏钓鱼传播的 Rust 加载器，内含诱饵 PE，解密并在内存中加载 Rust 编写的 Myth Stealer 窃密木马。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: null
ioc:
  cves: []
  cwes: []
  hashes:
    - 1570a3cd18b7e50ec0f3e6b274288c96a72c28853c762514945bbeb867c4114a
    - 2f2b93d37d67b80b4faaf25bebe4e3cbaf7aca35328aeb66da6a1a9b44316f5b
    - 537f438fb08ac7dc0fbf8a84149f61bc489b4f6ed0db5593223ae71b25bf854d
    - 66054607f38481ee7e39e002b58fe950966c4c0203df39f46acfe5c0e857c89a
    - 8feffbcb5fcfff66804e7e63eb75853dd6ac499f5788a98842e9f5b09aa6b3de
    - 9cd30cc8638ab6f6a9589c355ae5c157bacfb73e9c004c985ddc94504b8289e5
    - b2b38a2fdf76a2f6cd41b6849ed6e89e3cb371a371f1027b154f542c6117f4c8
    - f0b1f5bcaf1bf44361d4ec95384d71a224550af65e3cca4928eb204ff15ebd5d
  domains:
    - cdn.discordapp.com
    - yomiragame.blogspot.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：一篇 Rust 恶意加载器的逆向分析文章：通过 Discord 假游戏钓鱼传播的 Rust 加载器，内含诱饵 PE，解密并在内存中加载 Rust 编写的 Myth Stealer 窃密木马。
> 
> - **传播链：** Discord 消息引导受害者到 Blogspot 假游戏页面（yomiragame.blogspot.com），下载 `YomiraGame.rar`（双层 RAR、密码 `yomirabeta`），最终得到 Rust 写的 Windows x64 PE 加载器（SHA-256 `2f2b93d3...16f5b`，符号未剥离）。
> - **诱饵 PE：** `ldr::main` 通过 `alloc::slice::to_vec` 从 `0x32eb170` 复制约 19 MB 的 Themida 加壳 CraftRise（土耳其 Minecraft 服务器）PE 到 `Vec<u8>`，再经 `core::hint::black_box` 阻止编译器优化删除后立刻 `drop_in_place` 释放——是纯诱饵，从不加载。
> - **线程入口追踪：** `ldr::main` 调 `std::thread::spawn`，经 `Builder::spawn_unchecked` → `Thread::new` 中的 `CreateThread`（调用点在 `0x4a50f0` 的 `thread_start`）。其唯一参数是 `Box<dyn FnOnce()>` trait 对象（具体数据指针 + vtable），间接调用走 vtable 的 `call_once`（vtable 位于 `0x4f5170`，布局为析构函数/size/alignment/方法指针），shim 函数最终调用真正的逻辑函数 `ldr::omg`；析构函数符号名也直接泄露该闭包类型名。
> - **真实载荷解密：** `ldr::omg` 内联 `obfstr`（混淆密钥）与 `include-crypt`，对 `0x4f5898` 处 0x2df5856 字节缓冲 XOR 解密（64 字节密钥 `537f438f...854d`，可在 `0x4061ff` 断点调试取到），再经 vendored 的 `memexec` 库的 `memexec_dll` 内存加载。
> - **载荷行为：** 解密出的 DLL（SHA-256 `66054607...c89a`，同为 Rust、带符号）即 Myth Stealer：以 `--remote-debugging-port`/`--remote-allow-origins` 启动 Chromium 内核浏览器绕过 cookie 保护，窃取 Chromium 的 cookie/自动填充/密码及 Firefox 的 cookie、历史、密码等档案数据。

[Rust for the Working Reverse Engineer](https://cxiao.net/categories/Rust-for-the-Working-Reverse-Engineer/)

> 📣 **Want to get hands-on with reversing the Rust malware from this article?**
> 
> Come to my workshop, [*Reversing a (not-so-) Simple Rust Loader*](https://ringzer0.training/countermeasure25-workshop-reversing-a-not-so-simple-rust-loader/), at [Ringzer0 COUNTERMEASURE](https://ringzer0.training/countermeasure25/) in Ottawa, Canada on November 7, 2025! We will be reversing the sample in this article together, in more detail than covered in this article.

## Introduction

For quite some time, Discord has been a vector for spreading malware. One technique that pops up from time to time is the “Can you try my game” Discord scam. This starts with a victim receiving a message on Discord from another user - often, a friend of victim who has had their Discord account compromised. The message usually says something like

> Can you try this game I just made?

with a download link or attachment enclosed.

The downloaded game is then, inevitably, malware - often an information stealer. This kind of fake game scam has been around as far back as 2022, such as described in this [How-To Geek article](https://www.howtogeek.com/781369/psa-if-someone-says-try-my-game-on-discord-say-no/).

This article will take a look at one of the malware families delivered by a specific “fake game” Discord campaign which started in early 2025. This campaign uses Discord messages to direct users to a download page, hosted on Blogspot, for a fake game. The fake game download pages contain a download button for the game, as well as a description and some screenshots (taken from legitimate games) to appear more convincing.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/yomira-game-blogspot-screenshot_hu9925185859904287118.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/yomira-game-blogspot-screenshot.png)

This campaign is described in more detail in these blog posts:

-   This 2025-06-05 blog post by Trellix: [*Demystifying Myth Stealer: A Rust Based InfoStealer*](https://www.trellix.com/blogs/research/demystifying-myth-stealer-a-rust-based-infostealer/), which describes the infostealer loaded by this malware, *Myth Stealer*, in much more detail than I cover in this article. Thank you to one of the authors of the article for reaching out to me, and letting me know about it!
-   This 2025-01-03 blog post by Malwarebytes Labs: *[“Can you try a game I made?” Fake game sites lead to information stealers](https://www.malwarebytes.com/blog/news/2025/01/can-you-try-a-game-i-made-fake-game-sites-lead-to-information-stealers)*. The distributed payloads are not always the same malware; as described in the Malwarebytes Labs blog post, several different infostealer malware families have been distributed this way, including *Nova Stealer*, *Ageo Stealer*, and *Hexon Stealer*.

Today, we’ll be reversing one particular malware sample delivered by this campaign in April 2025. This sample is interesting because it’s a custom loader, written in the Rust programming language. It loads a new information stealer, *Myth Stealer*, also written in Rust.

I’ll go into detail about the techniques used for reversing this sample, which are useful for reversing other Rust binaries too. Even though the operation of the loader itself is fairly simple, reversing it is a good exercise for learning about how threads, dynamic dispatch, and types work in Rust binaries. The loader sample also has a few tricks for slowing down static analysis; they’re simple anti-analysis tricks, but they can appear extra intimidating and confusing when the binary is written in Rust.

Thanks very much to [@0xabad1dea@infosec.exchange](https://infosec.exchange/@0xabad1dea) and [@demize@unstable.systems](https://unstable.systems/@demize) for providing the samples here!

## Stage 1: Initial fake game webpage

The delivery chain begins with a Discord message sent to a potential victim, asking them to download and try playing a new game. The Discord message contains the following URL:

```markdown
https[:]//yomiragame.blogspot[.]com/2025/03/yomiragame.html
```

On 2025-04-25, this URL served a webpage purporting to advertise a student game project. (See also the [URLscan.io history](https://urlscan.io/search/#page.url%3A%22https%3A%2F%2Fyomiragame.blogspot.com%2F2025%2F03%2Fyomiragame.html%22), and the [2025-04-25 URLscan.io page snapshot](https://urlscan.io/result/01966eab-1b6c-700e-ba54-d04cf90992fb/).)

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/urlscan-yomiragame-page-2025-04-25-snapshot-screenshot_hu7697963201535630382.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/urlscan-yomiragame-page-2025-04-25-snapshot-screenshot.png)

The URL linked to by the large “Download” button on the page links back to Discord; it is a Discord file attachment URL:

```markdown
https[:]//cdn.discordapp[.]com/attachments/1363082221766049802/1365512865963966484/YomiraGame.rar?ex=680d9475&is=680c42f5&hm=1570a3cd18b7e50ec0f3e6b274288c96a72c28853c762514945bbeb867c4114a&
```

On 2025-04-25, this URL served a password-protected RAR with filename `YomiraGame.rar` and SHA-256 hash

```markdown
8feffbcb5fcfff66804e7e63eb75853dd6ac499f5788a98842e9f5b09aa6b3de
```

The password for the RAR file is `yomirabeta`. This password is usually sent directly to the targeted victim in the Discord message.

When extracted with this password, this RAR file contains a second RAR file named `YomiraGame.rar` with SHA-256 hash

```markdown
9cd30cc8638ab6f6a9589c355ae5c157bacfb73e9c004c985ddc94504b8289e5
```

This RAR file is also protected with the `yomirabeta` password. When extracted, this RAR file contains a PE file named `YomiraGame.exe` with SHA-256 hash

```markdown
b2b38a2fdf76a2f6cd41b6849ed6e89e3cb371a371f1027b154f542c6117f4c8
```

However, note that this page has served different Discord URLs with different payloads, at different times. An earlier iteration of this page contained a different URL, which served a password-protected RAR with SHA-256 hash

```markdown
f0b1f5bcaf1bf44361d4ec95384d71a224550af65e3cca4928eb204ff15ebd5d
```

This password-protected RAR was also protected with the `yomirabeta` password, and also contained a second RAR file containing the same password.

The inner extracted PE file, named `YomiraGame.exe`, has SHA-256 hash

```markdown
2f2b93d37d67b80b4faaf25bebe4e3cbaf7aca35328aeb66da6a1a9b44316f5b
```

This PE file is the main Rust loader that we’ll be reversing in this article.

## Stage 2: Rust loader

The PE file with filename `YomiraGame.exe` and SHA-256 hash

```markdown
2f2b93d37d67b80b4faaf25bebe4e3cbaf7aca35328aeb66da6a1a9b44316f5b
```

is a Windows x86_64 PE file, originally written in Rust. Debug symbols are still present in the binary, i.e. the binary is not stripped.

## Modules and libraries used

From examining the symbols in the binary, the main module inside the binary is called `ldr`. It consists of the following functions:

| Function Name | Virtual Address |
| --- | --- |
| `ldr::main::h1c9a4f32d473549b` | 0x4063a0 |
| `ldr::omg::h298374313dff0ecb` | 0x405720 |

The malware author also likely vendored in the code of an open-source library named [`memexec`](https://github.com/EddieIvan01/memexec/) into their binary, as a module with the name `mexec`. The `memexec` library is used for loading and executing PE files in-memory.

The following source file paths from the `mexec` module are embedded in the panic metadata of the binary; they match source file paths in the `memexec` library. Additionally, function symbol names for the `mexec` module in the binary are present in the binary, and the names match those of functions inside the `memexec` library.

```markdown
mexec/src/lib.rs
mexec/src/peloader/mod.rs
mexec/src/peparser/header.rs
mexec/src/peloader/winapi.rs
mexec/src/peparser/pe.rs
mexec/src/peparser/section.rs
```

Additional libraries inside the binary that are of note are:

-   [`include-crypt` version 0.1.0](https://crates.io/crates/include-crypt/0.1.0), which is used for embedding and decrypting an embedded payload.
-   [`obfstr` version 0.2.6](https://crates.io/crates/obfstr/0.2.6), which is used for obfuscating the decryption key used for the payload.

> 📖 You can learn more about panic metadata inside Rust binaries in my other article, *[Using panic metadata to recover source code information from Rust binaries](https://cxiao.net/posts/2023-12-08-rust-reversing-panic-metadata/)*.

## Execution flow in the ldr::main function

The entry point of the main logic in the binary is `ldr::main`. This function’s primary purpose is to spawn a new thread, which executes the function `ldr::omg`.

This execution flow is not obvious, however, upon a first look at the decompilation of `ldr::main`:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/screenshot-ldr-main-decompilation-initial_hu2750309373600946987.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/screenshot-ldr-main-decompilation-initial.png)

In the decompilation of `ldr::main`, a couple of features stand out:

-   There is a call to the Rust standard library thread creation function [`std::thread::spawn`](https://doc.rust-lang.org/std/thread/fn.spawn.html). However, it’s not clear where the entry point to the new thread is.
-   There is a call to [`alloc::slice::<impl [T]>::to_vec`](https://doc.rust-lang.org/std/primitive.slice.html#method.to_vec), which is a Rust standard library function that copies a slice of some data into a new `std::vec::Vec`.
    -   In the Rust standard library, [`std::vec::Vec`](https://doc.rust-lang.org/std/vec/struct.Vec.html) is a growable array, with each array element containing the same data type. (It is similar to the C++ standard library’s `std::vector`.)

The next two sections will explain both of these calls, and how they relate to the execution flow of the binary, in more detail.

> **A note about the long hexadecimal suffixes in symbol names in Rust binaries**
> 
> You may notice that in Rust binaries with symbols intact, the function name symbols all have a very long hexadecimal value at the end. For example, the symbol
> 
> ```rust
> alloc::slice::<impl [T]>::to_vec::hca02de8bb68fb008
> ```
> 
> in the screenshot above has the suffix `hca02de8bb68fb008`.
> 
> I explain this in the README for an [IDA Rust symbol demangling plugin](https://github.com/cxiao/ida-rust-untangler) I wrote a while back, so I will copy the explanation I gave there:
> 
> > This is a hash, unique per-function, applied by the Rust compiler when mangling names. The purpose of the hash is to disambiguate between symbols which may have the same name.
> > 
> > You can read more about the reasons for needing this disambiguating hash in [Rust RFC 2603](https://rust-lang.github.io/rfcs/2603-rust-symbol-name-mangling-v0.html#requirements-for-a-symbol-mangling-scheme), which proposes a new name mangling scheme to replace the current one:
> > 
> > > “Unambiguous” means that no two distinct compiler-generated entities (that is, mostly object code for functions) must be mapped to the same symbol name. This disambiguation is the main purpose of the hash-suffix in the current, legacy mangling scheme.

## Decoy PE file

Examining the call to [`alloc::slice::<impl [T]>::to_vec`](https://doc.rust-lang.org/std/primitive.slice.html#method.to_vec) at `0x4063dc` in the decompilation above:

-   The first argument at that callsite is a pointer to a stack variable, `var_18`. This may be the new `Vec`, which the `to_vec` function fills with data.
-   The remaining two arguments at that callsite are pointers to addresses in a constant data section of the binary, to the addresses `0x32eb170` and `0x1290e48`.

Recall again that this is a Rust standard library function that copies a slice of some data into a new `std::vec::Vec`. We now need to figure out which argument(s) to this function is the input string slice, and which argument(s) to this function is the new `std::vec::Vec`.

To confirm what these arguments are, we can decompile the body of the `alloc::slice::<impl [T]>::to_vec` function. The body of the function is very simple: it mainly just calls a second function, `<T as alloc::slice::hack::ConvertVec>::to_vec`, with the same arguments in the same order.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-to-vec-decompilation_hu12176887087361146289.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-to-vec-decompilation.png)

The logic inside the `<T as alloc::slice::hack::ConvertVec>::to_vec` function is also quite simple. It contains:

-   A call to [`alloc::raw_vec::RawVecInner<A>::with_capacity_in`](https://stdrs.dev/nightly/x86_64-pc-windows-gnu/alloc/raw_vec/struct.RawVec.html#method.with_capacity_in), which allocates some memory that will hold the new `std::vec::Vec`.
    -   You’ll notice that the Binary Ninja decompiler has inferred that this function has multiple return values, stored in variables `rax_1` and `rdx`. We’ll be examining this soon in more detail, by looking at the underlying disassembly.
-   A `memcpy`, which copies data *from* `arg2` (or rather, where `arg2` points) *to* variable `rdx`, with a length of `arg3` bytes being copied.
    -   We can infer from this that variable `rdx` is likely a pointer to the newly allocated memory for the new `std::vec::Vec`.
-   Some assignments which fill out some additional memory pointed to by `arg1`.
-   A return of the `arg1` variable, from the function.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-decompilation_hu7277437325509544319.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-decompilation.png)

We can infer the following from this:

-   `arg1` is a pointer to the newly created `std::vec::Vec`.
    -   `arg1[1]` contains a pointer to the data inside the newly created `std::vec::Vec`.
    -   `arg1[2]` contains the length of the original slice of data; it is also the length of the data inside the newly created `std::vec::Vec`.
    -   It’s unclear what the purpose of `arg1[0]` (i.e. `*arg1`) is, but we’ll take a look at it soon, below.
-   `arg2` is a pointer to the original slice of data, whose contents are being used to fill the new `std::vec::Vec`.
-   `arg3` is the length of the original slice of data.

We can rename these arguments, and some of the variables in the function. Additionally, we can create a new dummy `std::vec::Vec` structure, name some of its fields, and set the type of `arg1` to be a pointer to this new structure:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-decompilation-annotated_hu13348114175906648173.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-decompilation-annotated.png)

Going back to the multiple return values from `alloc::raw_vec::RawVecInner<A>::with_capacity_in`: Let’s take a look at the disassembly inside the function body before it returns, and also after it returns, at the call site for the function.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-disassembly-return-values-function-body_hu17982850412462341281.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-disassembly-return-values-function-body.png)

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-disassembly-return-values-call-site_hu14618227932510192022.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-disassembly-return-values-call-site.png)

We can see that:

-   Inside the function, just before returning: The function stores some variables from the stack into registers `rax` and `rdx`.
-   At the call site, after returning: The caller stores the values from `rax` and `rdx` into some stack variables (`var_18` and `var_10`), which are then used later in the code.

Both `rax` and `rdx` are filled out inside the function then saved and used outside the function, so the Binja decompiler presents both as return values.

Why is the `alloc::raw_vec::RawVecInner<A>::with_capacity_in` returning 2 values, though? To understand this, we can look at the internal structure of an `std::vec::Vec`. The Rust Cheat Sheet reference site [cheats.rs](https://cheats.rs/) has a great diagram for what a `Vec` looks like, internally:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/cheats-rs-vec-diagram_hu15563960067743831551.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/cheats-rs-vec-diagram.png)

You’ll notice that there is a `capacity` field here, which is distinct from the `len` field. In order to avoid frequent re-allocations as the `Vec` grows, a newly created `Vec` will have more memory allocated for it than it needs.

-   The actual amount of space that the elements inside the `Vec` currently fill is represented by the `len` field.
-   The total amount of space available inside the `Vec` ’s backing memory is represented by the `capacity` field.

(If you’ve reversed C++ binaries, you’ll recognize this as quite similar to the usual implementation for the `std::vector` type.)

In this case, we can infer the following for the 2 return values from the `alloc::raw_vec::RawVecInner<A>::with_capacity_in` allocation function:

-   In register `rax` / decompiler variable `rax_1`, the length of the newly allocated memory. This becomes the `capacity` of the new `Vec`.
-   In register `rdx` / decompiler variable `vec_data_ptr`, a pointer to the newly allocated memory. This is what the data in the `slice_data_ptr` gets copied into.

We can now label every field of the new `std::vec::Vec` data structure:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-decompilation-annotated-vec-fields-named_hu670397627570651192.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/alloc-slice-hack-convertvec-decompilation-annotated-vec-fields-named.png)

Now that we’ve renamed and retyped these arguments, we can go all the way back up to the `ldr::main` function. Here, we can see that the third argument to `alloc::slice::<impl [T]>::to_vec` is actually not a pointer. It is actually a length, specifically the length of the data that the second argument, `slice_data_ptr`, points to.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/ldr-main-decompilation-vec-annotated_hu5222592103237549847.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/ldr-main-decompilation-vec-annotated.png)

In summary, the call to `alloc::slice::<impl [T]>::to_vec` in the `ldr::main` function is copying `19467848` bytes of data from the address `0x32eb170`, into a newly allocated `std::vec::Vec`. Let’s now look at what this data is.

The address `0x32eb170` is in a constant data section of the binary. Looking at this address, we see that there is an PE file header there!

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/dummy-pe-file-header_hu279052205953921624.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/dummy-pe-file-header.png)

This is exciting, and may look like it’s the payload. However, it’s likely a decoy.

To see why, we can examine the `ldr::main` decompilation again. Let’s specifically look at the `std:::vec::Vec` variable `new_vec`:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/ldr-main-focus-new-vec-var_hu14088674814274156053.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/ldr-main-focus-new-vec-var.png)

This `new_vec` variable is passed into the standard library function [`core::hint::black_box`](https://doc.rust-lang.org/beta/core/hint/fn.black_box.html). This is a function that does two things:

-   It returns the same value that was passed to it. That is, if we pass in `new_vec` to `black_box`, `black_box` will return an unmodified copy of `new_vec`.
-   Its presence hints to the compiler to not optimize away code related to the value that was passed to it. That is, if there is some useless operation related to `new_vec` that the compiler could otherwise remove for optimization purposes, `black_box` will hint to the compiler to keep that useless code.

If we look inside the `core::hint::black_box` function, there is some actual code inside it. As expected, the code just outputs an unmodified copy of the input variable:

Now, let’s look at where this output copy is used. It’s passed into the function [`core::ptr::drop_in_place`](https://doc.rust-lang.org/core/ptr/fn.drop_in_place.html); specifically, the version of this function for the `Vec<u8>` type.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/ldr-main-decompilation-black-box-vec-copy-annotated_hu7481793220163386167.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/ldr-main-decompilation-black-box-vec-copy-annotated.png)

The `core::ptr::drop_in_place` functions are destructors, so in this case, this is the destructor function for a `Vec<u8>`. This destructor will deallocate the memory for the `new_vec_black_box_copy` variable.

We can see now why the call to `core::hint::black_box` is present here. It’s because the `std::vec::Vec` variable, and the static data that it’s created from, are actually completely useless. The `ldr::main` function allocates memory for a new variable (of type `std::vec::Vec`), and copies the PE file data embedded in the binary into this variable, but then never actually does anything with this data before deallocating it.

Without the `black_box` function, the compiler likely would have removed the code creating the vector, and likely would have never included the PE file data at `0x32eb170` in this binary at all. There is no actual code here that performs the logic needed to load the PE file. As we’ll see layer, this PE file is not the real payload; there is another payload present in the binary, which *is* actually loaded.

The decoy PE file has the following PE metadata. The company name and product name correspond to a Turkish Minecraft server product called *CraftRise* ( [https://www.craftrise.com.tr](https://www.craftrise.com.tr/)). The embedded PE file is also protected with the commercial obfuscator Themida, which is common for game software. However, it is not known whether this is an actual legitimate copy of *CraftRise*.

```markdown
Header.Machine           : AMD64
Header.Subsystem         : Windows GUI
Header.MinimumOS         : Windows Vista
Header.ExportName        : RAC.exe
Header.RICH[0x00]        : [0103784b] 009   MASM Visual Studio 2015 14.0
Header.RICH[0x01]        : [0105784b] 202 STDLIB Visual Studio 2015 14.0
Header.RICH[0x02]        : [0104784b] 018 STDLIB Visual Studio 2015 14.0
Header.RICH[0x03]        : [00fd8611] 004 OBJECT Unknown Version
Header.RICH[0x04]        : [01038611] 010   MASM Unknown Version
Header.RICH[0x05]        : [01048611] 018 STDLIB Unknown Version
Header.RICH[0x06]        : [01058611] 102 STDLIB Unknown Version
Header.RICH[0x07]        : [00937809] 002 IMPORT Visual Studio 2008 9.0
Header.RICH[0x08]        : [007b089f] 002 IMPORT Visual Studio 2005 08.00
Header.RICH[0x09]        : [0101784b] 011 IMPORT Visual Studio 2015 14.0
Header.RICH[0x0A]        : [00010000] 239 IMPORT Visual Studio
Header.RICH[0x0B]        : [01058686] 004 STDLIB Unknown Version
Header.RICH[0x0C]        : [01048686] 032 STDLIB Unknown Version
Header.RICH[0x0D]        : [01008686] 001 EXPORT Unknown Version
Header.RICH[0x0E]        : [00ff8686] 001 CVTRES Unknown Version
Header.RICH[0x0F]        : [00970000] 001 CVTRES Visual Studio
Header.RICH[0x10]        : [01028686] 001 LINKER Unknown Version
Header.Type              : EXE
Header.Bits              : 64
Header.ImageBase         : 0x0000000140000000
Header.ImageSize         : 29278072
Version.CompanyName      : RIDEV YAZILIM SİSTEMLERİ LTD ŞTİ
Version.FileDescription  : CraftRise
Version.FileVersion      : 2.0.0.0
Version.InternalName     : CraftRise
Version.LegalCopyright   : Copyright © RIDEV YAZILIM SİSTEMLERİ LTD ŞTİ 2023
Version.OriginalFilename : CraftRise
Version.ProductName      : CraftRise
Version.ProductVersion   : 2.0.0.0
Version.LangID           : 040904B0
Version.Charset          : Unicode
Version.Language         : English (United States)
TimeStamp.Linker         : 2025-03-18 10:57:30
TimeStamp.Export         : 2106-02-07 06:28:15
```

## Reversing std::thread::spawn to get to the thread entry point

Looking at the rest of `ldr::main`, before the decoy PE file setup, we see a call to the Rust standard library function [`std::thread::spawn`](https://doc.rust-lang.org/std/thread/fn.spawn.html). This creates and starts a new thread. But what does that thread do? Where is the thread entry point?

Looking at the disassembly before the call to `std::thread:spawn`, there’s only one load of anything that looks like an argument - the address of a location on the stack, loaded into register `rcx`. There’s no setup of anything that looks like it could be the thread entry point.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-thread-spawn-disassembly_hu12991167512404778158.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-thread-spawn-disassembly.png)

Even if we look inside `std::thread::spawn`, it’s unclear what’s going on; there’s a call to another function named [`std::thread::Builder::spawn_unchecked`](https://doc.rust-lang.org/std/thread/struct.Builder.html#method.spawn_unchecked), but still nothing inside the function that suggests it could be the thread entry point.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-thread-spawn-function-body_hu17516925608639449729.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-thread-spawn-function-body.png)

We can try a different approach here. This is a Windows binary, that uses the Rust standard library. On Windows, the underlying implementation of much of the Rust standard library functionality uses the Win32 API. Given that the purpose of `std::thread::spawn` is to create a new thread, it seems likely that it would use the Win32 [`CreateThread`](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createthread) API as part of its implementation.

We can look for whether this binary has `CreateThread` in its import table, and if it does, find where `CreateThread`, and what arguments it’s called with. That should lead us to the thread entry point.

We can see quite quickly that there is just one place in the binary where `CreateThread` is called: inside the Rust standard library function `std::sys::pal::windows::thread::Thread::new`:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windows-createthread-call_hu12502301754383168487.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windows-createthread-call.png)

This `CreateThread` call is inside a function named `std::sys::pal::windows::thread::Thread::new`, which is called from inside that `std::thread::Builder::spawn_unchecked` function above, which is called from the `std::thread::spawn` function that we were originally looking at in `ldr::main`.

Looking at the `CreateThread` call, we should be able to use it to find the entry point to the thread. The arguments to the Win32 `CreateThread` function are as follows:

```c
HANDLE CreateThread(
  [in, optional]  LPSECURITY_ATTRIBUTES   lpThreadAttributes,
  [in]            SIZE_T                  dwStackSize,
  [in]            LPTHREAD_START_ROUTINE  lpStartAddress,
  [in, optional]  __drv_aliasesMem LPVOID lpParameter,
  [in]            DWORD                   dwCreationFlags,
  [out, optional] LPDWORD                 lpThreadId
);
```

The 3rd argument, `lpStartAddress`, is a function pointer which is the entry point to the new thread.

At the `CreateThread` call site, we can see that the value of the `lpStartAddress` argument is a pointer to the function `std::sys::pal::windows::thread::Thread::new::thread_start`, at address `0x4a50f0`. We’ve now found our thread entry point! Time to look inside this function.

Unfortunately, as soon as we peek inside `std::sys::pal::windows::thread::Thread::new::thread_start`, we see that there’s still not much interesting code there. This is the entire decompilation of that function:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-sys-pal-windows-thread-new-threadstart-body_hu10917288951372212629.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-sys-pal-windows-thread-new-threadstart-body.png)

There’s no code here to read a payload, and no code here to map a payload into memory. However, one thing that *is* here is an indirect function call, at address `0x4a511a`:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-sys-pal-windows-thread-new-threadstart-body-disassembly_hu17479502197164408820.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/std-sys-pal-windows-thread-new-threadstart-body-disassembly.png)

There is a call there, to whatever function is at the destination of the pointer with value `rbx+0x18`. Tracing the value of `rbx` back, the value inside `rbx` ultimately comes from the value that was in the register `rcx` at the beginning of the function:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/sys-pal-windows-new-thread-start-indirect-call-value-trace-disassembly_hu11515016339407115659.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/sys-pal-windows-new-thread-start-indirect-call-value-trace-disassembly.png)

The decompilation also shows us this relationship. Since this function is quite simple, Binary Ninja is able to just labelled the variables in the decompilation with the names of their corresponding registers.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/sys-pal-windows-new-thread-start-indirect-call-value-trace-decompilation_hu12175708893226259991.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/sys-pal-windows-new-thread-start-indirect-call-value-trace-decompilation.png)

Where does the value of `rcx` come from, though? It’s not filled in with a concrete value, anywhere within the body of `thread_start`.

To find `rcx`, remember how this `std::sys::pal::windows::thread::Thread::new::thread_start` function was called: It’s passed as a function pointer into the `CreateThread` Win32 function, as the `lpStartAddress` argument. This argument has type `LPTHREAD_START_ROUTINE`. This is a function pointer type, which actually has the following signature:

```markdown
DWORD (__stdcall *LPTHREAD_START_ROUTINE) ( LPVOID lpThreadParameter );
```

The `lpStartAddress` function pointer should point to a function which takes 1 parameter (of type `LPVOID`). This means, therefore, that our `thread_start` function actually takes 1 parameter.

If you’re familiar with the [Windows x64 ABI and its calling convention](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention?view=msvc-170#parameter-passing), you may recall that functions have their first argument passed in the `rcx` register. That’s where the `rcx` value in our `thread_start` function comes from.

Binary Ninja knows about the Windows x64 ABI and calling convention, so we can just set a new parameter in the signature of `thread_start`, and Binary Ninja will know that it comes from `rcx`:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-start-new-param_hu12901812533390204746.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-start-new-param.png)

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-start-new-param-decompilation_hu14687413893133353056.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-start-new-param-decompilation.png)

The value of that `lpParameter` argument comes from the call to `CreateThread`, which has another argument that you can provide (also called `lpParameter`). `CreateThread` passes the value of its `lpParameter` into the function that `lpStartAddress` invokes. Here’s `CreateThread` ’s `lpParameter`, at its call site:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/createthread-lpparameter-callsite_hu16775806065832881433.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/createthread-lpparameter-callsite.png)

> **A note about calling conventions in Rust binaries**
> 
> Note that in Rust binaries, there is no stable ABI or calling convention; in general it’s not guaranteed that function calls will follow the platform calling convention.
> 
> However, that only applies for Rust-to-Rust code. In this case, since `CreateThread` is a Win32 C API, it will respect the Windows x64 calling convention, and pass that first `lpParameter` argument in `rcx`.

Frustratingly, even after all this, it’s still not clear where the payload-related code could be. The `lpParameter` value at the `CreateThread` call site comes from some additional registers (`rdx`, `r8`), which are likely arguments to that `std::sys::pal::windows::thread::Thread::new` function. There is still some more indirection here!

### The thread argument: A Rust trait object

> To keep this article simple, I’ve skipped some steps here in the analysis. If you would like a more detailed, hands-on, step-by-step walkthrough of the reverse engineering here, come to my workshop [*Reversing a (not-so-) Simple Rust Loader*](https://ringzer0.training/countermeasure25-workshop-reversing-a-not-so-simple-rust-loader/), at [Ringzer0 COUNTERMEASURE](https://ringzer0.training/countermeasure25/)!

I will reveal what the type of `lpParameter` here, passed into the `std::sys::pal::windows::thread::Thread::new::thread_start` function, actually is. The `lpParameter` variable passed into the `thread_start` function is something called a *trait object*.

-   In Rust, a *trait* is a function interface that a type must adhere to. It is defined as a collection of functions that a type must implement.
    -   In other programming languages, you may know this as an *interface type*.
-   In Rust, a *trait object* is a pointer to some object, plus some information about a trait that the object implements. It is a way to say “the compiler doesn’t know what the actual type of this object is, only that the type exposes a certain function interface”.
    -   Trait objects are how polymorphism is implemented in Rust.

Using trait objects, Rust programmers can write code that calls a specific object’s methods, without necessarily knowing what type the object is. For example, a Rust programmer can write a function like this:

```rust
fn write_deadbeef(destination: &mut dyn std::io::Write) {
	destination.write(b"\xDE\xAD\xBE\xEF").unwrap();
}
```

The code `destination: &mut dyn std::io::Write` means the following:

-   `destination` is the name of the argument.
-   `&mut dyn std::io::Write` is the type of the `destination` argument.
    -   `mut` means that `destination` is mutable.
    -   `&dyn std::io::Write` means that the type is a *trait object*. It means that the actual type here is unknown, but that whatever type it is, the type is guaranteed to be one that implements the trait `std::io::Write`.

This means that the `write_deadbeef` function can take, as its `destination` argument, any type that implements the [`std::io::Write`](https://doc.rust-lang.org/std/io/trait.Write.html) trait. Looking at the `std::io::Write` trait’s documentation, we see the following:

```rust
pub trait Write {
    // Required methods
    fn write(&mut self, buf: &[u8]) -> Result<usize>;
    fn flush(&mut self) -> Result<()>;
	[...]
}
```

> Writers are defined by two required methods, [`write`](https://doc.rust-lang.org/std/io/trait.Write.html#tymethod.write "method std::io::Write::write") and [`flush`](https://doc.rust-lang.org/std/io/trait.Write.html#tymethod.flush "method std::io::Write::flush"):
> 
> -   The [`write`](https://doc.rust-lang.org/std/io/trait.Write.html#tymethod.write "method std::io::Write::write") method will attempt to write some data into the object, returning how many bytes were successfully written.
> -   The [`flush`](https://doc.rust-lang.org/std/io/trait.Write.html#tymethod.flush "method std::io::Write::flush") method is useful for adapters and explicit buffers themselves for ensuring that all buffered data has been pushed out to the ‘true sink’.

This means that: as long as an object has a type which implements the `std::io::Write` trait, a Rust programmer can rely on that object always having a method named [`write`](https://doc.rust-lang.org/std/io/trait.Write.html#tymethod.write), which writes some bytes into the object. This is why the programmer can call the `write()` method on the `destination` variable in the function, above, without knowing exactly what the type of `destination` is.

The specific behaviour of `write` will depend on the type’s implementation of the trait. For example, the type `std::vec::Vec` implements the `std::io::Write` trait. In its implementation of the trait’s `write` method, it just appends the bytes passed to `write` to the end of the `Vec`:

```rust
fn main() {
    let mut test_buf: Vec<u8> = vec![0xAA, 0xBB, 0xCC, 0xDD];
    write_deadbeef(&mut test_buf);
    println!("{test_buf:#x?}");
}
```

This program prints the following:

```text
[
    0xaa,
    0xbb,
    0xcc,
    0xdd,
    0xde,
    0xad,
    0xbe,
    0xef,
]
```

Under the hood in the compiled program, trait objects have two parts to them:

-   A pointer to the concrete object that implements the trait.
    -   In the above example, this would be a pointer to the `Vec` named `test_buf`.
-   A virtual function table, pointing to all the methods of the trait that this specific type implements.
    -   In the above example, this would be a table of function pointers, one of which points to `std::vec::Vec` ’s specific implementation of `write`.

In the above example, a C-like representation of the `&dyn std::io::Write` trait object passed in to the `write_deadbeef` function at the call site in `main` would look like the following:

```c
struct &dyn std::io::Write __packed
{
    // This can point to any type that implements `std::io::Write`;
    // in the above example, it would be a pointer to the `Vec` named `test_buf`.
    void* _concrete_type_data;
    struct std::io::Write::_vtable* _vtable;
};
```

Now, going back to our `lpParameter` argument here, passed into the `std::sys::pal::windows::thread::Thread::new::thread_start` function: it is a trait object, and the trait attached to it is [`std::ops::FnOnce`](https://doc.rust-lang.org/std/ops/trait.FnOnce.html).

The `std::ops::FnOnce` trait is implemented by closure types in Rust - types which represent a function. They allow closures to be passed around and called without having to specify the concrete type of the closure at each place where the closure is used.

The `FnOnce` trait has only one required function, `call_once`:

```rust
pub trait FnOnce<Args>
{
    // Required method
    extern "rust-call" fn call_once(self, args: Args) -> Self::Output;
}
```

The meaning of the `FnOnce` trait is, roughly, “the function represented by this closure can only be called once, and can only be called through invoking the `call_once` function”.

We can actually see that `lpParameter` is an `std::ops::FnOnce` trait object by reading the Rust standard library source code. Specifically, [the code in the `std::sys::pal::windows::thread::Thread::new` function](https://github.com/rust-lang/rust/blob/4eb161250e340c8f48f66e2b929ef4a5bed7c181/library/std/src/sys/pal/windows/thread.rs#L23-L38):

```rust
    pub unsafe fn new(stack: usize, p: Box<dyn FnOnce()>) -> io::Result<Thread> {
        let p = Box::into_raw(Box::new(p));

        let ret = unsafe {
            let ret = c::CreateThread(
                ptr::null_mut(),                      // LPSECURITY_ATTRIBUTES lpThreadAttributes,
                stack,                                // SIZE_T dwStackSize,
                Some(thread_start),                   // LPTHREAD_START_ROUTINE lpStartAddress,
                p as *mut _,                          // LPVOID lpParameter,
                c::STACK_SIZE_PARAM_IS_A_RESERVATION, // DWORD dwCreationFlags,
                ptr::null_mut(),                      // LPDWORD lpThreadId
            );
[...]
```

Here, the code `p: Box<dyn FnOnce()>` means the following:

-   `p` is the name of the argument.
-   `Box<dyn FnOnce()>` is the type of the `destination` argument.
    -   `Box<dyn FnOnce()>` means that the type is a pointer to something of type `dyn FnOnce()` which lives on the heap.
        -   In Rust, [`Box<T>`](https://doc.rust-lang.org/std/boxed/struct.Box.html) means “a heap pointer to something of type T”.
    -   `dyn FnOnce()` means that the type is a *trait object*. It means that the actual type here is unknown, but that whatever type it is, the type is guaranteed to be one that implements the trait `FnOnce`.

(The other lines of code which refer to `p`, such as `let p = Box::into_raw(Box::new(p))` and `p as *mut _,`don’t matter for our purposes. They’re just slightly different ways to say “this is a pointer”.)

Recalling that trait objects have two parts, a pointer to the concrete type plus a virtual function table, a C-like representation of an `std::ops::FnOnce` trait object would be the following:

```c
struct &dyn std::ops::FnOnce __packed
{
    // This can point to any type that implements `std::ops::FnOnce`.
    void* _concrete_type_data;
    struct std::ops::FnOnce::_vtable* _vtable;
};
```

We can set `lpParameter` to this trait object type. We also observed above that `lpParameter` ’s fields came from some additional registers (`rdx`, `r8`), which were likely arguments to the `std::sys::pal::windows::thread::Thread::new` function. Let’s mark up the decompilation, to add those two new arguments to the calling function, and to retype the `lpParameter` variable:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windows-thread-lpparameter-vtable_hu4827855192364862290.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windows-thread-lpparameter-vtable.png)

Recall from above that the `lpParameter` variable eventually gets passed into `std::sys::pal::windows::thread::Thread::new::thread_start`, as its sole argument. Let’s mark up the type of the `lpParameter` argument inside `thread_start`, to be the `&dyn std::ops::FnOnce` trait object type:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/lpparameter-fnonce-trait_hu5764330411849757923.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/lpparameter-fnonce-trait.png)

Recall the indirect function call that we noted before in this function, at address `0x4a511a`. Here, we can see something interesting - that indirect function call actually comes from the `_vtable` field of the `lpParameter` argument! As we’ll see, this is actually a call to the `call_once` trait method on the `&dyn std::ops::FnOnce` trait object.

We mentioned above that the `_vtable` field of trait objects is a table of function pointers, but we never went into detail on what that looks like, nor did we actually define the `std::ops::FnOnce::_vtable` type.

In Rust programs, trait object vtables are statically embedded in the binary and always have a fixed layout, consisting of:

-   A pointer to the destructor for the concrete type that implements the trait.
-   The size of the concrete type in bytes.
-   The alignment of the concrete type in bytes.
-   An array of function pointers, pointing to the implementation of the concrete type for each required trait method.

A C-like representation of this layout would be the following:

```c
struct Trait::_vtable __packed
{
    int64_t* (* destructor)(int64_t*);
    uint64_t size;
    uint64_t alignment;
    int64_t* (* trait_method_pointer_0)(int64_t*);
    int64_t* (* trait_method_pointer_1)(int64_t*);
	[...]
};
```

The `FnOnce` trait only has one required trait method, `call_once`. Therefore, in the `std::ops::FnOnce::_vtable` layout, there is only one function pointer entry after the destructor, the size, and the alignment:

```c
struct std::ops::FnOnce::_vtable __packed
{
    int64_t* (* destructor)(int64_t*);
    uint64_t size;
    uint64_t alignment;
    int64_t* (* call_once)(int64_t*);
};
```

We can find this vtable inside the binary. Recall that above, using our newly typed `lpParameter` argument, we marked up the `std::sys::pal::windows::thread::Thread::new` function in the decompiler, with a function signature that looked like this:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windows-thread-lpparameter-vtable-highlighted_hu9500226566202052362.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windows-thread-lpparameter-vtable-highlighted.png)

Here, we can see that the `_vtable` field in `lpParameter` comes from the 3rd argument to `std::sys::pal::windows::thread::Thread::new`. Therefore, to find the vtable, we just need to look at the call site of the `Thread::new` function, to see what data is being passed in:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-new-callsite-vtable-data-ptr_hu1295393298731105485.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-new-callsite-vtable-data-ptr.png)

Here, the 3rd argument is a pointer to some data at address `0x4f5170`. Looking at the data there, it’s not immediately clear that this is a vtable:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/fnonce-vtable-without-annotation_hu17650314727654413070.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/fnonce-vtable-without-annotation.png)

However, recall again what the layout of Rust vtables is: it’s a function pointer to a destructor, then an integer for the type’s size, then an integer for the type’s alignment, then function pointers to the trait methods. We can apply the type below to the data at `0x4f5170`:

```c
struct std::ops::FnOnce::_vtable __packed
{
    int64_t* (* destructor)(int64_t*);
    uint64_t size;
    uint64_t alignment;
    int64_t* (* call_once)(int64_t*);
};
```

We immediately see that there are some pointers here to some actual functions in the binary!

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-closure-vtable_hu15941605496326365675.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-closure-vtable.png)

Now that we’ve set the type for the `_vtable` field in the `FnOnce` trait object, we can finally see what that indirect call at `0x4a511a` is doing. It’s an invocation of the `call_once` trait method of `FnOnce`!

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-start-with-marked-trait-object_hu17641647366708227875.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/thread-start-with-marked-trait-object.png)

From the vtable embedded in the binary, we now know that the `call_once` function points to the function at `0x0408e70`, named

```markdown
core::ops::function::FnOnce::call_once{{vtable.shim}}::h3c51115acb4ffa9f
```

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/vtable-shim-function_hu18329796435506545607.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/vtable-shim-function.png)

This function has several other function calls inside it, but if you follow the trail of function calls, you eventually end up at this call to `ldr::omg`:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/fnonce-call-once-ldr-omg_hu13386946101930154363.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/fnonce-call-once-ldr-omg.png)

This `ldr::omg` function is, at long last, the entry point to our thread, invoked from all the way back in `ldr::main`!

Note that we could have also inferred this from looking at the `destructor` field. The `destructor` function’s name is

```markdown
core::ptr::drop_in_place<std::thread::Builder::spawn_unchecked_<ldr::omg,()>::{{closure}}>
```

This actually contains the name of the concrete type for this trait table - the type name is

```markdown
std::thread::Builder::spawn_unchecked_<ldr::omg,()>::{{closure}}
```

This is a closure type! As discussed above, this is a type which represents a function. We can make a very good educated guess as to which function this represents and eventually calls - it’s `ldr::omg`, right in the name of the type.

This was a lot of indirection, learning about Rust language concepts, and frustrating reversing. In this case, this binary did have symbols, so we actually could have made an educated guess at the very beginning that `ldr::omg` was important, and immediately started analyzing it. It feels a little bit like this meme:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/mental-gymnastics_hu4476146839371003432.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/mental-gymnastics.png)

If I had limited time to triage this binary, I would have totally taken some shortcuts here. However, stripping symbols from Rust binaries is trivial, and without symbols, it would have been much harder to find where the thread entry point was and where that `ldr::omg` function was!

> 📖 If you would like more details on how exactly Rust traits, trait objects, and vtables work, or just want to see more examples and a slower walkthrough of these concepts: Check out my talk at RE//verse 2025, [*Reconstructing Rust Types: A Practical Guide for Reverse Engineers*](https://cxiao.net/posts/2025-02-28-reconstructing-rust-types-re-verse-2025/).

## The real payload decryption function, ldr::omg

Finally, we’ve reached `ldr::omg`, the main payload decryption function. It contains:

-   An inlined version of code generated by `obfstr` ’s [`obfstr!` macro](https://docs.rs/crate/obfstr/0.2.6/source/src/lib.rs#396), which contains a call to `obfstr` ’s [`deobfuscate` function](https://docs.rs/crate/obfstr/0.2.6/source/src/bytes.rs#74).
-   An inlined version of `include_crypt` ’s [`EncryptedFile::decrypt` function](https://docs.rs/include-crypt/0.1.0/include_crypt/struct.EncryptedFile.html#method.decrypt).
-   A call to `memexec` ’s [`memexec_dll` function](https://docs.rs/memexec/0.2.0/memexec/fn.memexec_dll.html) .

`ldr::omg` does the following:

-   Deobfuscate the decryption key via the `obfstr` -generated code.
-   Takes the encrypted buffer at virtual address `0x4f5898` with length `0x2df5856` bytes.
-   XOR-decrypts the buffer via `EncryptedFile::decrypt`.
-   Load the decrypted result via `memexec_dll`.

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/screenshot-ldr-omg-decompilation_hu3935565366884799590.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/screenshot-ldr-omg-decompilation.png)

The XOR decryption key is the following (hex-encoded) 64-byte value:

```markdown
537f438fb08ac7dc0fbf8a84149f61bc489b4f6ed0db5593223ae71b25bf854d
```

For this one sample, it was easiest to obtain the XOR key by debugging the binary. Here, I set a breakpoint on virtual address `0x4061ff`, which is the instruction that passes the deobfuscated XOR key value into `obfstr::ObfBuffer<[u8; LEN]>::as_str`, via register `rcx`:

```markdown
004061ff  488d8c2440020000   lea     rcx, [rsp+0x240 {decryption_key}]
00406207  e854510000         call    obfstr::ObfBuffer<[u8; LEN]>::as_str::hab897014783120cc
```

The decompilation at this part looks like this:

```c
include_crypt_crypto::key::EncryptionKey::new::hb945f29bab485494(
	&var_218, obfstr::ObfBuffer<[u8; LEN]>::as_str::hab897014783120cc(&decryption_key), 0x40, 0x20
);
```

Moving past this instruction, we can examine the value at the memory location in `rcx`:

[![](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windbg-decryption-key_hu17669697841641487493.webp)](https://cxiao.net/posts/2025-08-17-not-so-simple-rust-loader/windbg-decryption-key.png)

The decrypted DLL payload has SHA-256 hash

```markdown
66054607f38481ee7e39e002b58fe950966c4c0203df39f46acfe5c0e857c89a
```

and is another Rust binary.

## Stage 3: Myth Stealer Rust infostealer payload

> This article is mostly focused on the loader, and not the *Myth Stealer* infostealer payload. If you would like a more in-depth analysis of the stealer functionality, and the sellers behind the infostealer, check out the 2025-06-05 article from Trellix, [*Demystifying Myth Stealer: A Rust Based InfoStealer*](https://www.trellix.com/blogs/research/demystifying-myth-stealer-a-rust-based-infostealer/)!
> 
> Thank you to one of the authors of the Trellix article for reaching out to me! 🧡

The DLL payload with SHA-256 hash

```markdown
66054607f38481ee7e39e002b58fe950966c4c0203df39f46acfe5c0e857c89a
```

is a Windows x86_64 DLL written in Rust. ( [MalwareBazaar download](https://bazaar.abuse.ch/sample/66054607f38481ee7e39e002b58fe950966c4c0203df39f46acfe5c0e857c89a)) All debug symbols are intact. This DLL executes its malicious functionality upon being loaded by another process (via execution of its `DllMain` entry point).

This payload is an infostealer. The binary is quite large, so I didn’t analyze it fully. However, from examining debug symbols, likely functionality includes:

-   Launching a copy of all Chromium-based browsers installed on the system, with remote debugging on. This is usually used to bypass Chromium’s protection of cookie data (see [https://www.elastic.co/security-labs/katz-and-mouse-game](https://www.elastic.co/security-labs/katz-and-mouse-game))
    -   This is done by launching the browser with the `--remote-debugging-port` and `--remote-allow-origins` arguments.
-   Reading the following data from Chromium-based browsers installed on the system:
    -   Cookies
    -   Autofill data
    -   Stored password data
-   Reading the following data from Firefox:
    -   Cookies
    -   All profile data, which includes:
        -   History
        -   Stored passwords
        -   Autofill / autocomplete data

More information about the behaviour of this binary can be found in this [Tria.ge sandbox report](https://tria.ge/250426-hpc9gsvqw5/behavioral2).

## Conclusion

I encourage you to download the sample analyzed here and try your hand at reversing it yourself, following the steps in this article. It’s a good example of how even a fairly simple Rust program can be very complex to reverse, even with the aid of debug symbols. It’s also a good example of how powerful the Rust standard library, and the Rust third-party library ecosystem is, and how much code is under the hood of even very common standard library functions.

As noted throughout the article, I’ll also be presenting the material here as a workshop, [*Reversing a (not-so-) Simple Rust Loader*](https://ringzer0.training/countermeasure25-workshop-reversing-a-not-so-simple-rust-loader/), at [Ringzer0 COUNTERMEASURE](https://ringzer0.training/countermeasure25/) in Ottawa, Canada on November 7, 2025, in a more step-by-step, hands-on format. I hope to see many of you there!

## Changelog

-   2025-08-17: Initial publication
-   2025-08-17: Update to include Trellix article on infostealer payload (*Myth Stealer*)
