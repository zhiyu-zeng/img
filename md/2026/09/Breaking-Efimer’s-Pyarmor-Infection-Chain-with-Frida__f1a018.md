---
title: Breaking Efimer’s Pyarmor Infection Chain with Frida
source: https://invokere.com/posts/2026/09/breaking-efimers-pyarmor-infection-chain-with-frida/
source_host: invokere.com
clip_date: 2026-09-08T17:38:49+08:00
trace_id: 06a17df5-9c17-4d84-b70a-07105740f58f
content_hash: ae02177cf2ba993a944f5b8ea0cd347253d88e917ae7c5e9b2a849792d922a75
status: synced
tags:
  - Frida
  - 恶意样本
series: null
feed_source: Invoke RE
ai_summary: Efimer 是 Pyarmor+PyInstaller 保护的木马链；用 Frida 钩 Python 运行时获得 XOR 密钥，还原 Tor 代理、加密币剪贴板劫持和 WordPress 爆破模块，并可用已知明文/OneShot 静态解包反编译。
ai_summary_style: key-points
images_status:
  total: 21
  succeeded: 21
  failed_urls: []
notion_page_id: 3d575244-d011-8168-a263-f87c77d12085
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - ipinfo.io
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Efimer 是 Pyarmor+PyInstaller 保护的木马链；用 Frida 钩 Python 运行时获得 XOR 密钥，还原 Tor 代理、加密币剪贴板劫持和 WordPress 爆破模块，并可用已知明文/OneShot 静态解包反编译。
> 
> - **方法：** Pyarmor 新版逐函数解密，整包 dump 困难；改用 Frida 钩 `PyImport_ExecCodeModuleObject`、`PyEval_EvalCode`、`PyFunction_NewWithQualName`，再用 `PyObject_GetAttrString` 取 `co_filename/co_name/co_qualname`，以 marshal/co_code 及 `co_names` 等元数据兜底。
> - **密钥还原：** 捕获到 `<frozen installer>` 中 xor_decrypt 的元数据键 `esJIx4ZSNVcC`，匹配 PyInstaller 释放到 `%TEMP%\_MEI*` 加密文件中的重复 XOR，解密出 Tor SOCKS 代理、BIP39 词表、候选地址表、pack.js、混淆 JS 模块和计划任务 XML 等载荷。
> - **剪贴板劫持：** 002_n.js 每 500ms 用 WMI 查 taskmgr.exe，存在即退出；经 Tor C2 校验后识别剪贴板中 BIP39 助记词、私钥正则或币种地址，上报 C2 并截屏，再用候选地址替换目标地址。
> - **WordPress 爆破：** 002_b.js 从独立 onion C2 取目标，对 `/xmlrpc.php` 做 XML-RPC 爆破；密码由域名前后缀 + 1337 替换、大小写变化、TLD 拼接生成，成功以 `DOMAIN|USER|PASS` 上报。
> - **静态解包：** 利用 Tor PE 头已知明文可恢复 12 字节 XOR 密钥；配合 pyinstxtractor-ng 与 Pyarmor-Static-Unpack-1shot 可静态分解并反编译，显示沙箱检测、JS 二次混淆、持久化和钱包/浏览器扩展检测逻辑。

### Introduction

During the summer of 2026, we began seeing an Efimer loader variant in our [Assemblyline](https://training.invokere.com/assemblyline) instance that uses [Pyarmor](https://github.com/dashingsoft/pyarmor) to protect its infection chain and follow-on payloads. The Efimer samples created a lot of noise, with little follow-on activity observed, which resulted in us taking a closer look to see what they contained.

### Overview

This Efimer loader variant is a PyInstaller package that contains a Python 3.13 runtime, all required Python dependencies, and its main Pyarmor-protected `.pyc` file. Upon execution, the protected `.pyc` is loaded by the Pyarmor runtime (`pyarmor_runtime.pyd`), that unprotects Python bytecode, along with its associated metadata, then executes the bytecode. The `pyarmor_runtime.pyd` is closed source, and previous versions were insecure due to Pyarmor unprotecting Python objects in their entirety before executing them, which could then be dumped and decompiled. Newer versions, however, unprotect bytecode on a function-by-function basis, then re-protect the code once finished, making dumping bytecode in its entirety more challenging.

### Enter Frida

Despite these changes, we wanted to see what we could possibly dump, as the Python runtime was still in use, and therefore bytecode had to be executed at some point, even if it was incomplete. Dynamic instrumentation or hooking seemed like the best approach, in order to insert ourselves and see what native Python runtime functions were being called by Pyarmor. [Frida](https://github.com/frida) has been around for a number of years now, and has a special place in our hearts from the “good old days” so we figured we’d start by using it in order to prototype a number of possible hooks. Frida contains a base API that can be interacted with via Python, and a JavaScript API that uses an injected v8 runtime in order to interact with a target process. The Frida Python and Javascript code [are available here](https://github.com/Invoke-RE/community-malware-research/tree/main/Research/Loaders/Efimer/scripts/frida) if you’d like to follow along with this section. After a large amount of trial and error, the following functions were identified for hooking within the native CPython API that would eventually be called by the malware:

-   The `PyImport_ExecCodeModuleObject` function receives module names and code objects during execution. We used this to catch initialization of Python modules, including the Pyarmor module, and dump them. For example:

![Highlighted javascript code block 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6a334cff5b49be89.png)

Highlighted javascript code block 1

-   The `PyEval_EvalCode` function receives Python code for evaluation, which we can dump accordingly. For example:

![Highlighted javascript code block 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d90534c9eb2fc104.png)

Highlighted javascript code block 2

-   Nested function code objects can become function objects after module initialization. So we can hook `PyFunction_NewWithQualName` to capture code arguments on entry, then dump it after successful function creation:

![Highlighted javascript code block 3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c0fc72a8064466b5.png)

Highlighted javascript code block 3

### Walking Python Structures in Memory

These hooks alone were not enough to recover useful information, once target objects were intercepted, we had to walk the Python objects in order to extract meaningful information. This consisted of the following steps:

#### 1\. Get attribute strings of each object

In Frida, not only can you hook APIs in order to intercept them, but you can call them directly. In order to do this we resolved them within the injected process using:

![Highlighted javascript code block 4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5c0ecd8f5bb38999.png)

Highlighted javascript code block 4

Once resolved, the function can be called directly. To resolve associated metadata with each object we used `PyObject_GetAttrString` to acquire:

-   `co_filename` - the filename associated with the object
-   `co_name` - the function name, generator or module where the code was defined
-   `co_qualname` - the fully qualified object name

Once extracted, the filename was particularly useful for:

-   Identifying the target protected file (`installer.py` in this example)
-   All filenames containing the string `<frozen` to identify unprotected in-memory modules
-   We can avoid dumping stdlib paths to reduce noise, modules and metadata we have to sift through

#### 2\. Try to serialize the complete object

Once a candidate object was found after ensuring it wasn’t library code or still protected, we called `PyMarshal_WriteObjectToString` to serialize (also known as marshal) the object with the code:

![Highlighted javascript code block 5](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f2c098aafe168260.png)

Highlighted javascript code block 5

The resulting Python `bytes` object was converted with `PyBytes_AsStringAndSize`, copied out of the process, and prefixed with a 16-byte Python 3.13 `.pyc` header:

![Highlighted code block 6](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fb9c8af8fa8fade6.png)

Highlighted code block 6

To try and produce `.pyc` candidates for offline decompiler tools.

#### 3: fall back to co_code

When serialization failed, we called `PyCode_GetCode`. If that returned a `bytes` object, its contents were saved as a raw `.co_code` file.

This did not reconstruct the object in its entirety, but it preserved the instruction stream available from CPython’s API.

#### 4: extract metadata even when bytecode fails

Whether or not bytecode was useful, we also dumped:

-   `co_names` which tells us which globals, APIs, attributes, and imports the code references
-   `co_varnames` which reveals argument and local-variable roles
-   `co_consts` which reveals strings, numbers, byte strings, tuples, nested code objects, etc.

### Following Child Processes

Another hurdle we experienced was the parent PyInstaller process was executing a child process that we had to follow in order to hook and dump these objects. To do this, we hooked `CreateProcessW` to add the `CREATE_SUSPENDED` flag:

![Highlighted javascript code block 7](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e1a848c95122f6e5.png)

Highlighted javascript code block 7

Once the process was in a suspended state, we could inject into it and resume the process:

![Highlighted python code block 8](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/28577d8657bce7d8.png)

Highlighted python code block 8

### XOR Decryption via Metadata Extraction

Despite all of this effort, marshalling the target protected `installer.pyc` was not possible, likely due to inconsistencies between Pyarmor objects and those used by the CPython API. It was, however, possible to intercept and dump enough metadata to continue with our analysis. While the process was executing, our Frida script produced the following metadata output:

![Highlighted python code block 9](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0087b9ad367d67ee.png)

Highlighted python code block 9

Looking at this dump closely, we saw `'key', <code object xor_decrypt at 0x000001C7C94E4DC0, file "<frozen installer>"` and the value of `esJIx4ZSNVcC`. Given that we had an `xor_decrypt` code object and this random looking string, this was a clear candidate for a key used to XOR decrypt something. During its execution, PyInstaller writes files to disk that it needs during runtime. Dynamic analysis of this sample showed its files being written to disk under `%LOCALAPPDATA%\Temp\_MEI[0-9]{5}`. Looking at these files showed that they were encoded on disk:

![Highlighted bash code block 11](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e88683a4f3180e88.png)

Highlighted bash code block 11

You may also notice a repeating key pattern where null-bytes are supposed to be within the Portable Executable (PE) header. This is an indication that the file is XOR encrypted with a repeating key, which matches our candidate string `esJIx4ZSNVcC`. Using this key to decrypt all candidate files produced the following results:

-   `uusd.exe` - a full standalone Tor SOCKS proxy binary used by the JavaScript malware to connect to command-and-control (C2) Tor nodes
-   `002w.txt` - BIP39 wordlist for crypto wallet seed identification
-   `002a.txt` - candidate crypto address list used for clipboard hijacking
-   `pack.js` - JavaScript loader template that Base64 decodes, XOR-decrypts and evaluates JavaScript
-   `002_n.js` - an [obfuscator.io](https://obfuscator.io/) protected malware module that performs crypto clipboard hijacking
-   `002_b.js` - an obfuscator.io malware module that performs WordPress brute forcing
-   `002.xml` - a scheduled task XML file used by the malware to establish persistence

### JavaScript Crypto Clipper and Stealer

The `002_n.js` is a crypto clipboard hijacker that has the ability to steal cryptocurrency and replace clipboard contents with target addresses. This is done in the following steps:

1.  A loop iterates every 500ms that first checks if the task manager is running with the Windows Management (WMI) query `_0x528495.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'taskmgr.exe'");`. If found, the payload exits
2.  The malware pings a hard-coded onion address (provided in the IOC section) via the executing Tor SOCKS proxy. The C2 functionality uses a cURL command consisting of collected identifier information: `var _0x121c69 = "version=2.1&GUID=" + GUID + "&FLAG=" + _0x2f539a + "&GEIP=" + GEIP + "&NAME=" + NAME + "&action=" + _0x13fea7;` where the GUID is a pseudo-random string in the format of `Math.floor((1 + Math.random()) * 65536).toString(16).substring(1);`, the `GEIP` is the result of a call to `https[:]//ipinfo[.]io/country` in the parent Pyarmor protected process, `NAME` is a pseudo-random string used for persistence from the Pyarmor process and `action` is set to `GUID` for the initial check-in
3.  The clipboard contents are acquired using `ActiveXObject("htmlfile").parentWindow.clipboardData` and its contents are compared to phrases within `002w.txt`. This is a [bip39 list](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki), which is a common mnemonic code used for seed phrases in cryptocurrency wallets. Therefore, this is looking for seed phrases. If found, the seed is sent to the C2 using a similar cURL command with the action parameter set to `SEED` and takes five screenshots of the system that are also sent to the C2. Screenshots are taken using a PowerShell command that is executed separately
4.  Clipboard contents are also checked for a private key with the regular expressions `/(?:^|[\s:])(0x[0-9A-Fa-f]{64}|[5KL][1-9A-HJ-NP-Za-km-z]{50,51})(?=\s|$|[^\w])/g;` and `/(?:^|[\s:])([xyz]prv[1-9A-HJ-NP-Za-km-z]{107,108})(?=\s|$|[^\w])/g;` to look for crypto wallet private keys. If found, this is sent to the C2 with the action PKEY and screenshots are also taken
5.  Finally, clipboard contents are checked for a number of prefixes, which are used to determine if a destination cryptocurrency address is within its contents:
    
    ![Highlighted javascript code block 12](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/38b54fbd02557e01.png)
    
    Highlighted javascript code block 12
    

The `MakeREPL` function iterates over a set of cryptocurrency addresses within `002a.txt` to look for similar attacker-controlled cryptocurrency addresses to replace it with. If a candidate address is not found (not within the `002a.txt` list), or Monero is targeted, then hard-coded addresses within the JavaScript are used. The replacement address data is written to the clipboard with `_0x4d4394.Run("cmd.exe /c echo|set/p=" + _0xa5aab8 + "|clip", 0, true);` and is sent to the C2.

### JavaScript WordPress Bruteforcer

The `002_b.js` payload contains code that attempts to brute force WordPress admin panels using supplied data from a separate onion C2 address where it pulls target information from a separate onion C2 server in the format of:

![Highlighted javascript code block 13](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/186c19c6251281d6.png)

Highlighted javascript code block 13

Where `brute_work_task` indicates to the malware to start brute forcing, `brute_dom_stack` specifies the domains to brute force, `brute_traw_size` specifies the number of test workers used to check whether the domain endpoints allow XML-RPC POST requests, `brute_tchk_size` specifies the number of brute-force workers against confirmed targets, and `brute_pwd_stack` specifies password candidates. The password templates also allow specifying usernames along with passwords.

Credentials are brute forced over XML RPC via `/xmlrpc.php`. Each brute forcer will permute passwords using the following algorithm:

1.  Take every prefix and suffix of the base domain from length 3 to 15.
    -   For example, example.com:
        -   prefixes: exa, exam, examp, …
        -   suffixes: ple, mple, ample, …
2.  Randomly mutate these base strings until it has up to 60 candidates:
    -   1337-speak character substitutions:
        -   a to @
        -   e to 3
        -   i to!
        -   o to 0
        -   s to 5
    -   random casing of either leaving it be, uppercase the entire string or title-case first char, lowercase rest
3.  Add TLD/domain combinations if they are present: - base + tld - base + “.” + tld - base + “\_” + tld - tld + base

For example, using `example.com` as the domain could result in the permutations:

```bash
exa
exam
example
ple
mple
3xample
Exampl3
EXAMPLE
examplecom
example.com
example_com
comexample
```

Once credentials are successfully brute forced, they are sent to the C2 in the format of `DOMAIN|USER|PASS`.

### Known Plaintext Attack Against Efimer

Using Frida is a long and complex way to get to an XOR key, but fortunately, since we know these packages will contain specific encrypted file formats, we can use these to perform a known plaintext attack to recover the original XOR key to decrypt all files within the package without performing dynamic analysis or instrumentation. We’ve [provided an extractor](https://github.com/Invoke-RE/community-malware-research/blob/main/Research/Loaders/Efimer/scripts/extractor/Efimer.py) that will extract payloads within the PyInstaller package, recover the XOR key, and decrypt them. The extractor decompresses all PyInstaller files with [pyinstxtractor-ng](https://github.com/pyinstxtractor/pyinstxtractor-ng.git) and once a Tor PE is extracted, the known plaintext of the PE header is used to extract the 12-byte XOR key. Once the key is found, the remaining files are decrypted and interesting configuration values are extracted from the JavaScript files. For example:

![Highlighted bash code block 15](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2acd6325c3233304.png)

Highlighted bash code block 15

Extraction results from all identified and accessible samples are provided in the IOC section.

### Boom Oneshot

After all of this research, we came across [https://github.com/Lil-House/Pyarmor-Static-Unpack-1shot](https://github.com/Lil-House/Pyarmor-Static-Unpack-1shot) thanks to [@cyb3rjerry](https://x.com/cyb3rjerry), which allows us to decompile the protected `.pyc` after extracting it with `pyinstxtractor-ng`:

![Highlighted bash code block 16](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85aac311881c641a.png)

Highlighted bash code block 16

Then running OneShot from extracted directory allows it to find the target Pyarmor runtime and decompile the main `.pyc` to the best of its ability:

![Highlighted bash code block 17](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/76665beb27474cc4.png)

Highlighted bash code block 17

The output files then provide a decompilation in the format of `installer.pyc.1shot.cdc.py`. The decompiled code provides confirmations to functionality we were able to infer from dumped Python object and function metadata. Interesting functionality includes:

#### Sandbox Anti-analysis

The loader checks the Windows Recent-items directory and treats a low file count as a sandbox. It also checks executable filename substrings:

![Highlighted python code block 18](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13061b0da3ff1d91.png)

Highlighted python code block 18

![Highlighted python code block 19](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2ec2121e0717f7a5.png)

Highlighted python code block 19

#### Per-target Protected Persistence for JavaScript

Once the JavaScript stages are deobfuscated, they are re-obfuscated dynamically and set up for persistence with a pseudo-randomly generated XOR key, and Base64-encoded. The resulting key is then set into `pack.js`. Persistence is then established by setting a Run key:

![Highlighted python code block 20](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0a901aa159494643.png)

Highlighted python code block 20

With the task name being pseudo-randomly generated based on today’s date, in the format of: `[a-z]{5}`. In addition, scheduled task persistence is set up using the `002.xml`:

![Highlighted python code block 21](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d89165203c3a8426.png)

Highlighted python code block 21

#### Cryptocurrency Wallet Targeting

In preparation for the JavaScript crypto clipboard hijacker / stealer, the Python loader will attempt to identify if cryptocurrency wallets exist on the system using path names:

![Highlighted python code block 22](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0860c1ec51ed9361.png)

Highlighted python code block 22

And browser extensions,.e.g.

![Highlighted code block 23](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e27314952bf48282.png)

Highlighted code block 23

If found this is sent to the C2 as a flag, and the cryptocurrency replacement list is used if any wallet is identified.

### Conclusion

Despite Efimer being rudimentary and noisy with its use of command-line tools for major pieces of functionality, its use of open-source obfuscators made this analysis process time-consuming and involved. Its use of Tor C2 nodes likely requires monitoring of Tor entry nodes. The dropping and execution of a Tor binary, command-line execution, JavaScript persistence and scheduled task persistence present a number of detection opportunities. Despite a fully-fledged decompiler being available, the Frida hooks presented are protector-agnostic and therefore can likely be used across other protection projects.

### IOCs and Rulesets

Indicators of Compromise (IOCs) and Yara rules are available here: [https://github.com/Invoke-RE/community-malware-research/blob/main/Research/Loaders/Efimer/](https://github.com/Invoke-RE/community-malware-research/blob/main/Research/Loaders/Efimer/)

### Live Stream

We performed this research on a live stream mid-August that goes over a number of these concepts:

### Shout outs

-   Our summer intern Adam Krogsoe for his assistance with this research
-   [Humpty/Tony](https://c-b.io/) for his assistance in finding the PyArmor decompiler

All the best,

The Invoke RE Team

## Interested in learning malware analysis?

Check out our training courses today

[Training Courses](https://training.invokere.com/)
