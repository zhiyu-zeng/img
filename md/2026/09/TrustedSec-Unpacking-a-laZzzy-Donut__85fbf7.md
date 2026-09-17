---
title: TrustedSec | Unpacking a laZzzy Donut
source: https://trustedsec.com/blog/unpacking-a-lazzzy-donut
source_host: trustedsec.com
clip_date: 2026-09-17T21:12:29+08:00
trace_id: f267b90d-079d-41e2-9eee-3f83ba7e848c
content_hash: 146b6a5b42ee43131bd27856ff926df57e29e2f27e8bb1329c7562ac276540dd
status: synced
tags:
  - 恶意样本
  - 脱壳与加固
series: null
feed_source: TrustedSec
ai_summary: 一条恶意加载链以混淆 Python 字节码为起点，经 Donut、laZzzy、第二层 Donut 逐层加密封装，最终落地 .NET DLL 与加密资源，全程可静态还原。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 1
  failed_urls:
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig02_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983830&s=db4bed4705f4fdde29894b1b6c5c0ae8
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig03_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983830&s=5c762a74b06fae1104eda485d6bff6a6
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig04_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983831&s=354a032fef39e5c13448e97fd9614d46
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig05_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983832&s=bbfe6fe1efb55d54eb895a4080310197
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig06_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983833&s=edf564ed7a91a46bf88e32b831f42cb2
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig07_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983834&s=562727df7d8ad6e3dfea9bfa204904a2
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig08_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983835&s=80d5f1fe9f0beb7e06f1c69a9a880e2b
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig09_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983835&s=23d142888f8d33a1c1dd880c98a9a205
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig10_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983836&s=93ede5b44d4f13d779f07192e5a09f47
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig11_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983837&s=d8010e9d5396021001688d22fa9e97c2
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig12_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983838&s=8aec13328bf7e330d294f48865a11fe1
    - https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig13_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983838&s=f2d64097033edc0f638eccca0483329c
notion_page_id: 3de75244-d011-8126-89ce-e95dbca0c709
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一条恶意加载链以混淆 Python 字节码为起点，经 Donut、laZzzy、第二层 Donut 逐层加密封装，最终落地 .NET DLL 与加密资源，全程可静态还原。
> 
> - **整体链式结构：** 混淆 Python 字节码 → 第一层 Donut shellcode → laZzzy 生成的 PE 加载器（AES-CBC + XOR）→ 第二层 Donut → 内嵌 .NET DLL → 加密的 .NET 资源，每层使用不同的加密方案与文件格式，单一格式的特征扫描会漏掉其余层。
> - **第一层处置：** 样本为 CPython 3.13 的 .pyc（magic 3571），先转回 .py，识别出 Kramer 混淆且带密钥保护；用 kramer_python_deobfuscator 爆破密钥，原始版本耗时数小时，改为只读取所需数据段后不到一分钟即恢复。
> - **Donut 层处置：** Donut 把可执行文件或 .NET 程序集包装为位置无关的 x86-64 shellcode；先用 Ghidra 手工解密提取内嵌程序，再用 Volexity 的 donut-decryptor 提取 instance（元数据）与 module（载荷），无需调试器。
> - **laZzzy 工具缺口：** laZzzy 是开源 shellcode 加载器，用 AES-CBC 加一层 XOR 生成完整 PE，解密流程除一种注入方式外全部相同；因无公开静态提取工具，作者自研 laZzzy_dump——用特定 x86-64 指令字节序列定位解密例程，解析 LEA/MOV 的 RIP 相对寻址取得密钥、IV 与密文偏移，离线解密后再异或，并已用多个独立生成的样本验证。
> - **最终载荷与结论：** 第二层 Donut 解出真正的内嵌 .NET DLL，可交给 dnSpy/ILSpy 反编译；加密资源被解析后按 shellcode 方式载入内存执行。只要理解编译后代码结构，无需动态执行即可逐层还原，但公开工具通常需要按样本修改。

Recently, we came across an interesting malware sample. It used a multi-stage malware loader that chains together obfuscation and shellcode-injection techniques. The sample begins as obfuscated Python bytecode and concludes with encrypted.NET resources, using nested layers of shellcode generation, encryption, and obfuscation to frustrate detection and analysis at each stage.

While I performed the initial triage of the malware manually, it was a significant time saver to find existing public tooling to speed up the recovery. Public tools needed to be modified, and in some cases, we needed to create a customer tool to address a specific technique. In this post, we will walk through the steps used and what needed to be created or modified.

## The Full Chain

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/739a54bec8e90b1c.png)

Figure 1- Malware Execution Chain

Each stage encrypts or obfuscates the next, and each must be reversed in order to trace the execution path and understand the final payload.

## Stage 1: Obfuscated Python Bytecode

The file we first analyzed had the extension.pyc, meaning that it is most likely Python bytecode. To verify this, we run the file command:

```yaml
******.pyc: Byte-compiled Python module for CPython 3.13 (magic: 3571), timestamp-based, .py timestamp: Wed Jun 24 06:18:29 2026 UTC, .py size: 8371083 bytes
```

Let’s see what strings are visible in the file. Most of the time, I will use strings, but this time I opened the file in Vim. I noticed the string ***Kramer*** right away, and later in the file there is a large blob of text, which seemed to make no sense at first.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig02_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983830&s=db4bed4705f4fdde29894b1b6c5c0ae8)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig02_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983830&s=430c952c7f21c1136b4c25fc34df1703,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig02_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983830&s=54a1e0e8311563275ab6cef9b69bafc3)

Figure 2 - HEX View of the File Showing Kramer String

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig03_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983830&s=5c762a74b06fae1104eda485d6bff6a6)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig03_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983830&s=f0afaf545f0a126e216ec468c268645e,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig03_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983830&s=d02aa234b8214bba1bcdb11ef3eb6ba3)

Figure 3 - HEX View of the File Showing the Obfuscated Code

Next, we need to get from a.pyc file to.py. I used the [NPX](https://classic.yarnpkg.com/en/package/depyo) to convert from the bytecode to standard Python, which makes the script much easier to read.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig04_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983831&s=354a032fef39e5c13448e97fd9614d46)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig04_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983831&s=bf2ce6dc4cdbe17ee03f9652da0fe601,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig04_Nusbaum_laZzzyDonut.png?w=479&q=90&fm=webp&fit=max&dm=1788983831&s=6ba937b02a57cfd1b826914428d815da)

Figure 4 - Obfuscated Code after Converting from pyc to py

After searching for a little while, I came across the [Kramer GitHub repo](https://github.com/billythegoat356/Kramer/tree/main). This matched what I was seeing perfectly. The only problem was that it was protected by a key, so back to searching again. This time I came across a tool to brute-force the key, [kramer_python\_](https://gist.githubusercontent.com/bobby-tablez/bb1f13c10231192a8e0ebc58548951d3/raw/a4937a65eb1a494ee4fe43e2f3beb2713991a2ed/kramer_python_deobfuscator.py) [deobfuscator.py](http://deobfuscator.py/). I launched the deobfuscator against the sample and my server was immediately spiked.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig05_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983832&s=bbfe6fe1efb55d54eb895a4080310197)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig05_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983832&s=5e164746df133ce9251af945acf03f8f,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig05_Nusbaum_laZzzyDonut.png?w=477&q=90&fm=webp&fit=max&dm=1788983832&s=33753915d9aefebeb2a6b0021c44da4d)

Figure 5 - Showing the CPU usage of While Bruteforcing key

I let this run for an hour before going to bed. In the morning, it recovered the sample. However, I did not look close enough at the code and missed that it wrote the output to STDOUT, so I needed to run the tool again. It took hours to complete, and I didn't want to wait for that. After reading the code, I realized the tool was reading in the whole encoded command but only needed a small section. After the modifications below, the key was recovered in less than a minute.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig06_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983833&s=edf564ed7a91a46bf88e32b831f42cb2)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig06_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983833&s=5fd83bd8ffae7e3a138d5187697b8e0c,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig06_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983833&s=5caec64adccb7d42a7d719e8b2f9adfa)

Figure 6 - Modification to Tools

The Python source code was recovered as sampled below.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig07_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983834&s=562727df7d8ad6e3dfea9bfa204904a2)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig07_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983834&s=57ae79652df7a85f24c13f209a48a1db,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig07_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983834&s=4fed7bcdeeb1d12dd3d9770e5a504f0d)

Figure 7 - Sample of the Recovered Python code

The Python code contained a base64 encoded string that is RC4 encrypted. This shellcode is then copied into a section of memory with the permissions needed to execute, and execution is passed to that code. After decoding and decrypting the string, we have access to our first shellcode.

## Stage 2: First Donut Layer

The Python script hands off to shellcode generated by [Thewover's Donut](https://github.com/thewover/donut), a tool that wraps arbitrary executables or.NET assemblies into position-independent x86-64 shellcode. During the initial analysis, I did not know this was created with the tool Donut. I loaded the sample into Ghidra and started resolving strings and function pointers. Only after I manually decoded and extracted the embedded executable did I identify the Donut tool. After comparing my static analysis to the source code, it was quick work to verify my analysis.

Now that we know the tool used to create it, we looked for a tool to extract the embedded executable without the need to open a debugger. This first Donut layer was decoded using Volexity's [donut_decryptor](https://github.com/volexity/donut-decryptor) tool, which extracts the unencrypted instance (metadata) and module (payload) components.

The decoded module from this stage is an executable, specifically a laZzzy-wrapped binary containing the second stage of the chain.

## Stage 3: laZzzy Layer - A Gap in Tooling

With this new binary, quick strings resulted in meaningful intel, which led to some open source leads.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig08_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983835&s=80d5f1fe9f0beb7e06f1c69a9a880e2b)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig08_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983835&s=1c9f0a68509e15d335fd490a1d66d621,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig08_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983835&s=ce43673b4924646cd97dadd08464acf0)

Figure 8 - String Embedded in the Executable

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig09_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983835&s=23d142888f8d33a1c1dd880c98a9a205)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig09_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983835&s=c5766a30d825c88b9bf6c1b9bf79493a,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig09_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983835&s=c9c9dd58474ccb4c9062cd803534827e)

Figure 9 - laZzzy Encoding Tool's Help Menu

[laZzzy](https://github.com/capt-meelo/laZzzy) is a shellcode-loader. It uses multiple techniques to inject shellcode into the current or remote process, with the options above. This tool is also open source, so I loaded it into Ghidra and walked along with the code to make sure there are no modifications. laZzzy reads in a shellcode and creates an encrypted shellcode payload using AES-CBC with an additional XOR layer. It then builds the rest of the Windows PE stub that decrypts and executes at runtime. Unlike Donut, laZzzy produces a complete PE executable rather than position-independent shellcode.

Looking through the executable, we get to the AESDecrypt function. Here it loads the AES key, initialization vector, and the encrypted payload (DAT_14002f010). The FUN_1400013b0 is the AES init function, FUN_1400014e0 is the AES update function, and finally FUN_14002beb0 is the encryption function, where the local_138 is the context, the DAT_14002f010 is the ciphertext, and the 0x12a50 is the length of the ciphertext.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig10_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983836&s=93ede5b44d4f13d779f07192e5a09f47)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig10_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983836&s=44c89b2dd088b0fad0acd34214219dba,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig10_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983836&s=7428cbdbf5fd17d2daaf652fe2744c08)

Figure 10 - AES Decryption Function

The AESDecrypt function is called by a function named MovePayload. This decrypt function is used by all but one (1) of the injection methods, meaning that the payload is encrypted and obfuscated the same way every time.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig11_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983837&s=d8010e9d5396021001688d22fa9e97c2)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig11_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983837&s=810377a6927b2e43a2e7d6603c77d936,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig11_Nusbaum_laZzzyDonut.png?w=479&q=90&fm=webp&fit=max&dm=1788983837&s=741ad5b1019a410905960c88ddc0c107)

Figure 11 - Calling Function to AES Decrypt. Also performs XOR Obfuscation

Once the payload is decrypted, it is XOR'd to get the embedded shellcode. Manual decryption using this method is highly annoying, so we employed automation to make our analysis easier.

### Closing the Gap: Static Extraction

I was unable to identify a public tool to extract laZzzy payloads statically. The solution was to build a custom extraction tool using static analysis of the laZzzy PE binary and the source code. As a result, [laZzzy_dump](https://github.com/trustedsec/LazZzy_Dump) was born.

The approach:

1.  Locate the decryption routine: laZzzy's AES-CBC decryption wrapper function has a distinctive compiled footprint (a specific sequence of x86-64 instructions: AES initialization, a LEA loading the encrypted data, a MOV with the payload size, the decryption call, an XOR post-processing step, and a stack-frame teardown). Scanning the PE binary for this byte-pattern signature identifies the function without needing a disassembler.
2.  Extract the key material and ciphertext location: Once the function is found, RIP-relative addressing (LEA, MOV instructions with displacement operands) are resolved to recover the file offsets of the AES key, initialization vector (IV), and the encrypted shellcode.
3.  Decrypt offline: The ciphertext, key, and IV are pulled from the binary and decrypted using standard AES-CBC, followed by the secondary XOR layer that laZzzy applies.

This technique requires no debugger, emulator, or dynamic execution, only a copy of the compiled binary. The extracted tool was validated against multiple independently generated laZzzy samples to confirm the pattern was successful across different build configurations.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig12_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983838&s=8aec13328bf7e330d294f48865a11fe1)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig12_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983838&s=a927d90f24c57d5f49d6ce6a74bfd551,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig12_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983838&s=2c92b366d1da5e42d04378f934633050)

Figure 12 - Sample Output from lazzzy_dump.py

## Stage 4: Second Donut Layer

Once the shellcode is extracted from the laZzzy binary, donut-decryptor is run again on the recovered bytes. This yields another instance/module pair, where the module is now the final payload: an embedded.NET DLL.

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig13_Nusbaum_laZzzyDonut.png?w=320&q=90&auto=format&fit=max&dm=1788983838&s=f2d64097033edc0f638eccca0483329c)

![⚠️ 图片托管失败](https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig13_Nusbaum_laZzzyDonut.png?w=320&q=90&fm=webp&fit=max&dm=1788983838&s=1db81efb851217405e69687aa376f08c,%20https://trusted-sec.transforms.svdcdn.com/production/images/Blog-assets/laZzzyDonut_Nusbaum/Fig13_Nusbaum_laZzzyDonut.png?w=480&q=90&fm=webp&fit=max&dm=1788983838&s=5f709ca31d1789e10fb8230b0dad68ce)

Figure 13 - DOT NET Executable Recovered

## Stage 5: Embedded.NET DLL

The recovered.NET assembly is the true endpoint of the chain. At this point, standard.NET analysis tools (dnSpy, ILSpy, etc.) can decompile the C# source and analyze the malware's behavior.

## Stage 6:.NET Resources

The final part of this malware chain is the.NET resources. I am not going to go into detail, but mainly the resources are encrypted, sections are parsed out of them and loaded into memory like shellcode, and then code execution is passed to them.

## Conclusion

This multi-stage design accomplishes several goals for the attacker:

-   Each layer uses a different obfuscation/encryption scheme and format (Python obfuscation, Donut shellcode generation, laZzzy AES+XOR encryption, another donut layer). A signature scanner looking for one (1) format will miss the others.
-   Public tooling can make life easier by reducing time needed to manually walk through a malware sample, BUT sometimes these tools need a little attention to produce the correct results.
-   Mixing shellcode generation (Donut) with a PE-based loader (laZzzy) and Python orchestration gives the attacker multiple execution contexts and flexibility in where each stage can run.

The key technical insight is that encryption and format layering can be unwound statically if the compiled code's structure is understood. This analysis shows that even without dynamic execution, knowledge of a loader generator's source code or reverse-engineered instruction patterns can yield a path to the final payload.
