---
title: "The extension you never installed: KREMLIN forges Chrome's own integrity checks to steal banking sessions"
source: https://www.elastic.co/security-labs/threat-command/malicious-browser-extension-kremlin-banking-malware
source_host: www.elastic.co
clip_date: 2026-09-16T01:25:35+08:00
trace_id: 1d6462b9-8f66-422c-a2b3-20d3d5898a2c
content_hash: b70af0d5e72519d823e25c0b22e86e75c54a0e48d2ea4d94b060a2b890e50f4b
status: synced
tags:
  - 恶意样本
  - 反调试
series: null
feed_source: Elastic Security Labs
ai_summary: KREMLIN 通过伪造 Chrome 自身的完整性校验（篡改 Secure Preferences、重算 HMAC 与 App-Bound 加密哈希），在用户未授权的情况下安装恶意扩展，窃取巴西银行会话与浏览器凭据。
ai_summary_style: key-points
images_status:
  total: 51
  succeeded: 51
  failed_urls: []
notion_page_id: 3dc75244-d011-819b-9286-d6adec5b262c
ioc:
  cves: []
  cwes: []
  hashes:
    - 05ddd2131556d71352f5a10213fb1705b81dbd8d2f86fbe528a8a4be1de7d2e9
    - 106eac79396a3ff77b8f375c391260ce422be2ae4d55d3aa75b2635cbdc0fa42
    - 13b457af75e7cc0c7963b454d879800d8fdfbd3ebc9fe3ec34bd8ca8cf44701d
    - 170dffb37e05f525f735bc9ad84b3908a488f7ce43fcb07739a10e4331e15a2c
    - 1ad4436893850cc1da180b2488e764beb9e2a379
    - 1b189e5ce3dbee52106de5c1a8508091ea2acc2cbace7252763b53be01af3109
    - 223be3f8648bf6998c4a58b972522e5fda8d9d0a57b4e163811930de66c3f7ca
    - 25a6a4fe0cc0f8ebf19836ad50fe104c3cbc9d6a
    - 28c6c06298d514db089934071355e5743bf21d60
    - 42a3e2bb135fb46b11b127f45a266b3a4d9dff4aa1cf75433f93fe69ba51a9b9
    - 49ee0b041878c64c9253955d1de44f3832bb2b96b891cd3fd85c136bbbae0f71
    - 56eddb7aa87536c09ccc2793473599fd21a8b17f
    - 5b3f4643d012ad6caca0a392b1a54b142b59aba5
    - 5c32a09873be70a92fd8bb5a9fed7967de06bde6
    - 5c92d3b8734b4f498752f735a1ca0987
    - 5ece7fd3766b0b7f8aadefa562313cea6c3c94f9398658dd389910e5be44f552
    - 5f109e7bb3df4dea81946f2f853da288
    - 645c1701acd8a5f2c9364ac947718863ab450a706c0aabfca85376e9374ccb45
    - 64def0a6099c4de9c413b108eaae85a3c7457615
    - 737a8dea4db63b3b24f19698af9e5bc6f08de8ee
    - 77e2d84e79d65ce84c2db606e984380a88f4594f
    - 7e27a030b8879cea5e92e3da650eba0098116908
    - 81ffb6c5f72e934a79b46a867063bff5a7a222b1
    - 8236a0bcf102db910df27190dccc57a75e9faa8b
    - 87b76a60ba7c474dbf8f689df2808e1a
    - 8a711333899c173a1dc1a3523335e52becce9a44
    - 902edbfecff38f285bf26283fb9ceb3700061873
    - ac0a95225938e1d85c1e41e35495563ef733947a
    - b2b7e8403b4534d43b477d4d4bd6f829437463c8
    - b86787588fe43d9bc6a419c94450b620fa5b60918dda9b242efd05ec73d0e013
    - ba80216c960977fa45e317f00dcf31e96acab29904a737cbc0bf86e929c3be5f
    - c8c38634dd44d7c6162c66174a6ee23ee404265125166e8d757681bdd66a4268
    - cb15cbf3f01a92e609e4c2bc26155e667e96c5d04770e83abba66ee07bcecea0
    - cc0ba092c4721c69801ece58a144a0aa668feed26da4993b1fbcbcb2e7a570f9
    - cd7360a83e5cdbbbbbceb0e78748baba6740d07b
    - d3d8d6b0e6d0f8dd3705247b54b8fe55f1c77567
    - dd3d72c53ff982ff59853da71158bf1538b3ceee
    - f9e95a1e1fa3f3aebfc802c6c8e6a2eb
  domains:
    - acrobat-updater.com
    - archive.org
    - californicationdetroit.com
    - codecaudiog.site
    - codecvideowin.online
    - connection.timesmaluku.com
    - connection.upgradeonline.site
    - cremeb.com
    - donalurdesconfeitos.site
    - graph.checkeligibitily.workers.dev
    - harialurdes.site
    - ia601808.us.archive.org
    - lojinhadoluiz.online
    - marialurdes.site
    - orange-sun-195a.checkeligibitily.workers.dev
    - protonmail.com
    - seguranca.versionnova.site
    - version.checkeligibitily.workers.dev
    - volmira.site
    - www.creamp1eonlyfans.net
    - zaviro.online
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> KREMLIN 通过伪造 Chrome 自身的完整性校验（篡改 Secure Preferences、重算 HMAC 与 App-Bound 加密哈希），在用户未授权的情况下安装恶意扩展，窃取巴西银行会话与浏览器凭据。
> 
> - **感染链：** 伪装银行回执的 JS 加载器先做沙箱检测，再用 certutil 解出下一阶段并下载 Node.js，随后用伪装成 `MicrosoftNodeRuntimeUpdater` 的计划任务持久化，最后由 C++ 安装器植入扩展。
> - **以太坊死信箱：** 从智能合约读取 `main-v2`、`sub-module`、`sentinel` 等参数获取载荷地址，载荷藏在 Archive.org 的 JPEG 中（反转 Base64 或首尾标记分隔），C2 可随时远程更新。
> - **免商店装扩展：** 等浏览器空闲两分钟或直接 `TerminateProcess` 强杀，再以调试方式启动浏览器，从 `chrome.dll` 内存提取 OSCrypt App-Bound 密钥，用 `resources.pak` 种子重算 HMAC 与 `*_encrypted_hash`，写入 `Secure Preferences` 并打开开发者模式。
> - **反分析：** 桌面文件少于 5 个或进程少于 50 个即判定沙箱；命中则跳到 `0x1337` 故意崩溃；另比对调试/分析工具进程、用户名黑名单、CPU 内存与 VMware/VirtualBox 痕迹，并访问未注册的看门狗域名验证网络真实性。
> - **扩展能力与受害面：** 伪装成 AVSync，经 WebSocket 每秒轮询命令，可窃取 Cookie、sessionStorage、历史、截图与页面源码，注入 HTML 并键盘记录、劫持请求和重定向；配置接口伪装成 `.css` 请求，数据经 lz-string 压缩。钓鱼文件冒充 12 家巴西银行，看门狗域名已记录 1,515 台回连主机，98.75% 位于巴西。

Elastic Security Labs has tracked REF9334, a Brazilian banking malware operation, since May 2025. Its toolkit is called KREMLIN (as named by the malware author, `Kr3mlin4rt1st`), though nothing about the operation is Russian. Lures impersonate twelve Brazilian banks; error messages and code comments are written in Portuguese, and the operators' Ethereum transactions cluster during São Paulo working hours. Over 15 months and seven campaigns, they built a malicious browser extension that installs itself in Chrome and Edge, and the browser then loads it as though the user approved it. This post covers the infection chain, the extension internals, all seven campaigns, and the wallet trail connecting them.

## Key takeaways

-   The KREMLIN malware ecosystem employs multi-stage JavaScript loaders, custom C++ installers, and malicious browser extensions to steal credentials, session tokens, and sensitive data.
    
-   Attacker infrastructure leverages Ethereum smart contracts as dead-drop resolvers to dynamically update C2 endpoints and payload hosting locations.
    
-   Malicious browser extensions bypass Chromium integrity mechanisms by manipulating Secure Preferences and regenerating required HMACs and App-Bound encrypted hashes.
    
-   Campaign artifacts, naming conventions, and transaction patterns indicate a primary targeting focus on Brazilian banking users and financial institutions.
    
-   Threat Command temporarily disrupted over 1,500 (and counting) infections in this reported campaign by registering the network canary (kill switch) domain

## KREMLIN JavaScript loader: multi-stage infection chain analysis

![KREMLIN infection chain diagram: JavaScript loader, Ethereum C2, SentinelOne sideloading and malicious extension](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/df4f29a1fad14696.png)

The KREMLIN infection chain begins with a JavaScript file masquerading as a banking, invoice, or company document, which the user manually executes. The payload is a slightly obfuscated multi-stage loader that first checks whether the script is running in a sandbox or virtual machine. It then downloads and installs malicious binaries from several sources before executing the next binary stage.

![VirusTotal detection for ComprovanteSafra\_03-08-2026.js, a KREMLIN JavaScript loader posing as a bank receipt](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f4a2d2b40dc913f3.png)

For this analysis, we examine the following script: [106eac79396a3ff77b8f375c391260ce422be2ae4d55d3aa75b2635cbdc0fa42](https://www.virustotal.com/gui/file/106eac79396a3ff77b8f375c391260ce422be2ae4d55d3aa75b2635cbdc0fa42).

The obfuscation is fairly basic: function names are replaced with generic identifiers (e.g `itemXX`), strings are retrieved from a lookup table by index, and object methods are called using bracket notation with string keys. However, we can easily deobfuscate this script using an LLM.

![Obfuscated KREMLIN JavaScript loader retrieving strings from a lookup table by index](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d54364f736adbdd5.png)

### First stage: sandbox evasion and Node.js runtime download

The first stage displays an error message to make the user believe that the lure failed to open. It then checks whether it is running in a sandbox, decodes and extracts the next JavaScript stage using certutil, downloads Node.js to execute it, and finally beacons to one of its C2 servers.

![First-stage KREMLIN JavaScript loader showing a fake error, sandbox check and Node.js runtime download](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c22248e4b6e69d9b.png)

To display the error message, the malware creates another JavaScript file that invokes `shell.Popup` and then deletes itself. The file follows the naming pattern `popup_{date}_{random}.js` and provides a useful pivot for finding additional first-stage samples (e.g., [5ece7fd3766b0b7f8aadefa562313cea6c3c94f9398658dd389910e5be44f552](https://www.virustotal.com/gui/file/5ece7fd3766b0b7f8aadefa562313cea6c3c94f9398658dd389910e5be44f552)).

The sandbox-detection heuristic consists of two checks. First, it counts the files on the user's desktop. Second, it uses a WMI query to count the processes running on the machine. If there are fewer than five files or fewer than 50 processes, the malware assumes it is running in a sandbox and aborts execution.

![KREMLIN sandbox evasion check counting desktop files and running processes via WMI before executing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/18c755e10451ed8e.png)

Before terminating, the loader contacts its infrastructure through the `/api/log_loader?hash=` API endpoint, passing the campaign ID. In this sample, the URL is `hxxps://connection[.]upgradeonline[.]site`.

![KREMLIN JavaScript loader variables showing the embedded payload, campaign ID and C2 callback host](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/276e69edb517da15.png)

### Second stage: persistence and the Ethereum dead drop resolver

The second stage runs four steps:

1.  Installs persistence through a scheduled task extracted from an embedded CAB archive.
    
2.  Retrieves download locations from an Ethereum smart contract.
    
3.  Downloads the required binaries from those locations.
    
4.  Executes the third stage.
    

Execution begins by establishing persistence. The script extracts an embedded CAB archive containing a scheduled task. One minute after the user logs on, the task instructs Windows to run `conhost.exe --headless node.exe` from the directory containing the malicious script. It is registered as `MicrosoftNodeRuntimeUpdater` with the description `"Node.js V8 Runtime is the JavaScript engine responsible for compiling and executing Node.js applications using Google's high-performance V8 engine."`, making it appear legitimate at first glance.

![Scheduled task XML used by KREMLIN, disguised as MicrosoftNodeRuntimeUpdater to run one minute after logon](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/69f3ba67ac452424.png)

It then retrieves its configuration from the Ethereum smart contract at `0xCD7360A83E5cdbBbbbcEB0e78748babA6740d07b` by querying three parameters:

-   `main-v2`: The URL of the main module.
    
-   `sub-module`: The URL of a JPEG carrier containing a.NET process-injection kit (RunPE), though this was not observed in use here.
    
-   `sentinel`: The URL of a JPEG carrier holding a CAB file, which contains a SentinelOne binary used to sideload the malware.
    

![KREMLIN Node.js loader querying an Ethereum smart contract for main-v2, sub-module and sentinel payload URLs](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b3b8544ba82b0595.png)

The payload-hosting infrastructure combines attacker-controlled domains with abuse of the public Archive.org service. The main payload is encoded as a reversed Base64 string (`base64.b64decode(payload[::-1])`). The JPEG carriers’ payloads are Base64-encoded and delimited by start- and end-of-file markers.

![KREMLIN loader extracting a Base64 payload from a JPEG carrier using start and end of file markers](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4a688e407161b363.png)

At the time of the analysis, the payload URLs were as follows:

**Module**

**Smart contract parameter**

**URL**

Malicious browser extension installer payload

main-v2

`hxxps://granderevolucao[.]store/5c92d3b8734b4f498752f735a1ca0987/{campaignId}`

.NET PE Injector

sub-module

`hxxps://archive[.]org/download/hotelmoskva/hotelmoskva.jpg`

`SentinelMemoryScanner.exe`: legit SentinelOne binary for side-loading

sentinel

`hxxps://ia601808[.]us[.]archive[.]org/5/items/sentinel_20260722_0435/Sentinel.jpg`

After the modules download and the CAB archive extracts, the files in the installation directory specified by `items.json` are replaced. This file is included in the CAB archive containing the SentinelOne binary, providing the malware with an update mechanism. After the process completes, `SentinelMemoryScanner.exe` executes.

## KREMLIN malicious browser extension installer analysis

KREMLIN's main binary is a 2.10 MB program written in C++ and compiled for x64, designed to install malicious browser extensions. It appears to be under active development and is not obfuscated. It is statically linked against numerous libraries, accounting for its large size. Only some strings are encrypted for unknown reasons, and the malware uses indirect syscalls to interact with the kernel. Despite its extensive infrastructure, KREMLIN shows several signs of immaturity compared with modern malware. Its overreliance on open-source libraries significantly bloats the binary, while string and API obfuscation appears to be applied manually rather than through automated tooling. Debug strings remain, and both the installer and the malicious extension enable debugging.

For this analysis, we examine the following binary: [c8c38634dd44d7c6162c66174a6ee23ee404265125166e8d757681bdd66a4268](https://www.virustotal.com/gui/file/c8c38634dd44d7c6162c66174a6ee23ee404265125166e8d757681bdd66a4268/content).

### KREMLIN string decryption algorithm

As noted at the beginning of this section, the malware encrypts only some of its strings. The binary appears to contain several versions of the decryption algorithm, but these are actually the same algorithm adapted to different string lengths rather than separate implementations for each string. The algorithm is shown in the following code snippet:

def decrypt_string(cipher: bytes, size: int) -> bytes: plain = bytes(cipher\[i\] ^ ((0x34 + i) & 0xFF) for i in range(size)) return plain.split(b"\\0", 1)\[0\]

### Indirect syscalls and SSN resolution from NTDLL

At startup, KREMLIN builds a map of API-name hashes to System Service Numbers (SSNs). Rather than parsing individual `Nt*` or `Zw*` stubs, it correlates `ntdll.dll` exports with the address-ordered `RUNTIME_FUNCTION` entries in the exception directory (`.pdata`). Because the syscall stubs in `ntdll.dll` are arranged in SSN order, KREMLIN can derive each SSN by counting the `Zw*` exports that precede the target syscall. We linked the malware to the open source [PigSyscall](https://github.com/evilashz/PigSyscall) library through a distinctive string in the `GetSyscallNumber` function. Although the string differs slightly, the function's behavior matches the implementation observed in the binary.

![Decompiled GetSyscallNumber function matching the open source PigSyscall library by its error string](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ad5047dabfe3df5e.png)

Once the table is initialized, the malware uses the target export hash to look up the corresponding SSN. It then issues the syscall through an existing `syscall; ret` sequence in `ntdll.dll`. If it finds no suitable sequence, it falls back to a hard-coded syscall stub embedded in the binary.

![KREMLIN resolving a syscall number and issuing an indirect syscall, with a hard-coded stub fallback](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e2b9dc0e5a1f835.png)

### Malware side-loading and entrypoint

To execute the next stage, KREMLIN abuses the legitimate SentinelOne binary `SentinelMemoryScanner.exe` to sideload its unsigned main payload, which masquerades as `SentinelAgentCore.dll`. Symantec first documented this technique in [Seedworm: Iran-Linked Hackers Breached Korean Electronics Maker](https://www.security.com/threat-intelligence/iran-seedworm-electronics).

Execution begins with creating the malware's primary worker thread. If the host process is `SentinelMemoryScanner.exe`, KREMLIN locates the internal `LdrpLoaderLock` critical section and the `LdrpWorkInProgress` global variable in `ntdll.dll`. By releasing the loader lock and clearing this variable, the malware bypasses loader synchronization and allows the new thread to start before `DllMain` returns. Under normal conditions, `CreateThread` can be called from `DllMain`, but the new thread's entry point does not execute until DLL initialization completes. Waiting for that thread from `DllMain` would therefore deadlock. A complete implementation of this technique is available in [LdrLockLiberator](https://github.com/ElliotKillick/LdrLockLiberator).

![KREMLIN clearing LdrpWorkInProgress and the loader lock to start a thread from DllMain during DLL sideloading](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ca0141d355e5dc0c.png)

### Sandbox evasion and anti-VM checks

Like the JavaScript payload, the malware performs a series of checks to determine whether it is running in a virtual machine or sandbox. Interestingly, it makes no attempt to detect debugging or hooks. These checks examine the host process name, running processes, and the system's memory and disk properties. Most positive detections cause the malware to call the invalid address `0x1337`, deliberately triggering an access violation, although it ignores some check results.

![KREMLIN sandbox evasion code calling address 0x1337 to crash deliberately when analysis is detected](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/51faa286e30bb318.png)

#### Running process checks for analysis and sandbox tools

The malware retrieves the list of running processes using `ZwQuerySystemInformation`, then searches it for process names associated with sandboxing software and security analysis tools. The full list is shown below.

**Sandbox**: `powershell.exe, malware.exe, sandbox.exe, bot.exe, test.exe, myapp.exe, testapp.exe, joeboxcontrol.exe, joeboxserver.exe, proc_analyzer.exe, sysanalyzer.exe, sniff_hit.exe, fakenet.exe`

**Security tools**: `klavme.exe, ollydbg.exe, ollyice.exe, processhacker.exe, tcpview.exe, autoruns.exe, autorunsc.exe, filemon.exe, procmon.exe, regmon.exe, procexp.exe, idaq.exe, ida.exe, ida64.exe, idaq64.exe, immunitydebugger.exe, wireshark.exe, dumpcap.exe, hookexplorer.exe, importrec.exe, petools.exe, lordpe.exe, sysinspector.exe, systeminformer.exe, windbg.exe, resourcehacker.exe, x32dbg.exe, x64dbg.exe, fiddler.exe, httpdebugger.exe, cheatengine-i386.exe, cheatengine-x86_64.exe, cheatengine-x86_64-SSE4-AVX2.exe, frida-helper-32.exe, frida-helper-64.exe, ghidra.exe, radare2.exe, r2.exe, cutter.exe, dnspy.exe, dnspyex.exe, ilspy.exe, hxd.exe, detectiteasy.exe, dbgview64.exe`

#### Username blacklist check

KREMLIN also compares the user's account name, retrieved through `GetUserNameW`, against a blacklist. The complete list of account names it checks for is shown below.

**Account names**: `CurrentUser, Sandbox, Emily, HAPUBWS, HongLee, ITADMIN, Johnson, Miller, milozs, PeterWilson, timmy, sandbox, malware, maltest, testuser, virus, JohnDoe`

#### CPU, RAM, and disk hardware checks

The malware also checks several properties related to the machine hardware. The machine must have more than 2 CPUs, and its RAM capacity must exceed 3 GB to pass the test. The malware also checks disk space; however, our sample discards the result, potentially due to conditional compilation.

#### Network canary check

In addition to its hardware and process checks, the malware performs a network canary check by attempting to download a page from the unregistered domain `hxxp://www[.]creamp1eonlyfans[.]net`. Because this domain should not return any content, a valid response likely indicates that a sandbox is simulating network connectivity. The malware then deliberately crashes.

![KREMLIN network canary check against an unregistered domain, crashing if a sandbox fakes a response](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2bb51ce3da8629d4.png)

#### VMware and VirtualBox artifact checks

The final check before the next stage searches for processes and files, including drivers and DLLs, associated with VMware and VirtualBox. Process detection resolves a PID for each targeted process name, while file existence is checked using `ZwQueryAttributesFile`. In the sample analyzed, however, the caller ignores the results of both checks for both products, possibly because of conditional compilation.

**VMware processes:** `VGAuthService.exe, vmacthlp.exe, Vmwaretrat.exe, Vmwareuser.exe, vmtoolsd.exe`

**VMware files:** `vmhgfs.sys, vmmemctl.sys, vmmouse.sys, vmrawdsk.sys, vm3dgl.dll, vm3dver.dll, vmtray.dll, vmtoolshook.dll, vmmousever.dll, vmhgfs.dll, vmguestlib.dll, vmguestlibjava.dll, driversvmhgfs.dll, vmdum.dll`

**VirtualBox processes:** `VBoxService.exe, VBoxTray.exe`

**VirtualBox files:** `VBoxMouse.sys, VBoxGuest.sys, VBoxSF.sys, VBoxVideo.sys`

### Campaign tracking markers: customer ID and mutex

Once all checks have passed, the malware loads two strings: a customer ID that appears to identify the customer associated with the campaign under analysis, and a Portuguese string used as the mutex name. This suggests that the malware operators are distinct from its developers. Both strings can serve as reliable campaign-tracking markers.

![KREMLIN installer logging its customer ID and Portuguese mutex name, both usable as campaign tracking markers](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc553e3edf567603.png)

**Customer-id**: `98d8049e-804f-11f1-b79f-ae3a8bb85d01`

**Mutex**: `ClarinhoQueSim-XEDA2O`

### Downloading the malicious browser extension

Before downloading the malicious extension, KREMLIN queries the same Ethereum smart contract used earlier, `0xCD7360A83E5cdbBbbbcEB0e78748babA6740d07b`. The `extension` and `main-v2` parameters returned `volmira[.]site` and `zaviro[.]online`, respectively. Notably, the `main-v2` value was updated on August 13, 2026, after we retrieved the previous value while analyzing the JavaScript payload, indicating that the infrastructure is actively maintained.

After retrieving the domains, the malware queries `hxxps://volmira[.]site/api/ext/version` to obtain the extension version. The response contains a JSON object with the extension's version and ID:

'{"version":"1.0.0","id":"ndpbidppejfanjbhfgjlohfanbfbklff"}'

Before downloading the archive, the malware checks whether the extension is already installed and, if so, compares the installed version with the version reported by the server. It downloads the extension only when no local installation is found, or the versions differ.

![KREMLIN checking whether the malicious browser extension is already installed and comparing versions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ba6fbef13b6af62a.png)

It then downloads the Chrome extension as a ZIP archive from the following URL, passing the Customer ID through the `p` query parameter: `hxxps://volmira[.]site/api/ext?p=98d8049e-804f-11f1-b79f-ae3a8bb85d01`.

### How KREMLIN installs a Chrome extension without the Web Store

After downloading the extension, KREMLIN installs it in Chromium-based browsers, specifically Chrome and Edge.

To do so, KREMLIN uses a documented technique rarely observed in malware: it manually copies the extension into the browser's profile directories and registers it in the `Secure Preferences` file. Because Chromium protects these entries with cryptographic integrity checks, the malware must retrieve the required keys and regenerate the associated HMACs and encrypted hashes. Synacktiv describes this technique in detail in [The Phantom Extension: Backdooring Chrome through Uncharted Pathways](https://www.synacktiv.com/en/publications/the-phantom-extension-backdooring-chrome-through-uncharted-pathways).

Before modifying the browser profile, KREMLIN waits until the browser is closed or the user has been inactive for at least two minutes, polling `GetLastInputInfo`. If the browser remains open, it force-terminates it with `TerminateProcess`. This likely prevents concurrent access to profile files while making the shutdown less noticeable. KREMLIN can then launch a fresh browser instance under a debugger to recover the App-Bound key.

![KREMLIN installer code waiting for Chrome to be idle for two minutes before terminating the browser process](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/969657be8fd9786f.png)

#### Recovering Chrome's OSCrypt and App-Bound encryption keys

KREMLIN first retrieves Chrome's legacy OSCrypt key from `%LOCALAPPDATA%\Google\Chrome\User Data\Local State`. The DPAPI-protected key is stored as a Base64-encoded value in the `os_crypt.encrypted_key` field. After decoding it, the malware removes the five-byte `DPAPI` prefix and passes the remaining blob to the Windows API `CryptUnprotectData`. The malware can later use this legacy key to decrypt sensitive profile data during exfiltration.

To recover the newer App-Bound OSCrypt key, the malware launches the browser under a debugger with the `--no-startup-window` option. It then processes debug events until it receives a `LOAD_DLL_DEBUG_EVENT` and checks whether the loaded module is `chrome.dll` or `msedge.dll`.

![KREMLIN handling Chrome debug events, waiting for LOAD\_DLL to locate chrome.dll and extract the App-Bound key](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/20aef5a28c4fc624.png)

Once the target module is loaded, KREMLIN scans its `.rdata` section for the string `OSCrypt.AppBoundProvider.Decrypt.ResultCode`. It then searches `.text` for a RIP-relative `LEA` instruction referencing that string. From this cross-reference, it applies additional byte-pattern matching to locate the key-buffer pointer, then uses `ReadProcessMemory` to read the key from the browser process.

![KREMLIN scanning Chrome's .text section for a LEA instruction referencing the App-Bound key string](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/229fff590ab2680a.png)

The final value KREMLIN retrieves is a seed extracted from `%PROGRAMFILES%\Google\Chrome\Application\<VERSION>\resources.pak`. Chromium uses this seed to generate both legacy HMACs and newer encrypted hashes.

Finally, the ZIP archive containing the extension is extracted into each browser profile whose `Secure Preferences` file can be read.

To activate the extension, KREMLIN modifies the `Secure Preferences` file. It enables developer mode through `extensions.ui.developer_mode` and `account_values.extensions.ui.developer_mode`, then registers the extension under `extensions.settings.<extension_id>`. To satisfy Chromium's integrity checks, it updates `protection.macs` with both the legacy HMACs and the corresponding OSCrypt-encrypted SHA-256 hashes (`*_encrypted_hash`) for these preferences.

The following is an example of the modifications required to activate the malicious extension:

{ "extensions": { "ui": { "developer_mode": true }, "settings": { "<extension-id>": { "...": "extension configuration" } } }, "account_values": { "extensions": { "ui": { "developer_mode": true } } }, "protection": { "macs": { "extensions": { "ui": { "developer_mode": "<legacy HMAC>", "developer_mode_encrypted_hash": "<new hash>" }, "settings": { "<extension-id>": "<legacy HMAC>" }, "settings_encrypted_hash": { "<extension-id>": "<encrypted hash>" } }, "account_values": { "extensions": { "ui": { "developer_mode": "<legacy HMAC>", "developer_mode_encrypted_hash": "<new hash>" } } } }, "super_mac": "<aggregate MAC>", "super_encrypted_hash": "<new aggregate hash>" } }

To generate these integrity values, KREMLIN uses the seed extracted from `resources.pak` to compute the legacy HMACs. On newer Chromium versions (`>= 144`), it also hashes this seed together with the relevant data, then encrypts the resulting digest using the OSCrypt key recovered from the debugged browser process.

### Browser data exfiltration and session token theft

Once the extension is installed, KREMLIN begins exfiltrating browser data. For each browser profile, it adds the following files and directories to a ZIP archive:

chrome/<user-profile>/Login Data chrome/<user-profile>/Login Data For Account chrome/<user-profile>/Web Data chrome/<user-profile>/Network/Cookies chrome/<user-profile>/Extensions/\*\*

KREMLIN also adds a `keys.json` file to the archive. It contains two OSCrypt keys: the `v10` key retrieved from `Local State` and the `v20` key recovered from browser memory during debugging. These keys allow later decryption of encrypted fields in the exfiltrated databases.

// keys.json {"v10":"<hex key>","v20":"<hex key>"}

The ZIP archive is then encrypted with RC4 through the undocumented `SystemFunction032` API, using the SHA-256 digest of the plaintext archive as the encryption key. The encrypted ZIP archive, Customer ID, and SHA-256 digest used as the RC4 key are sent to the following two C2 endpoints: `hxxps://volmira[.]site//api/savecreds` and `hxxps://zaviro[.]online//api/v1/fingerprint`. The following POST request was captured on our server:

![Captured POST requests sending an encrypted ZIP of stolen browser data to the KREMLIN C2 endpoints](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bae5f30bad0b2aa4.png)

## KREMLIN malicious Chrome extension: capabilities and C2 protocol

![Malicious browser extension installed in Chrome, masquerading as AVSync System Inc with developer mode on](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6f58fe727f2e930f.png)

The extension sample analyzed in this research has the following SHA-256 hash: [223be3f8648bf6998c4a58b972522e5fda8d9d0a57b4e163811930de66c3f7ca](https://www.virustotal.com/gui/file/223be3f8648bf6998c4a58b972522e5fda8d9d0a57b4e163811930de66c3f7ca).

The extension consists of several JavaScript files and a manifest (`manifest.json`). It masquerades as legitimate software named `AVSync` and requests access to browser tabs, cookies, storage, and the `webRequest` API. Its functionality is split between a background service worker and two content scripts injected into every page the victim visits.

Unlike the loader, the extension's JavaScript code is unobfuscated and uses descriptive variable and function names. The configuration specifies the endpoint from which the extension retrieves its final C2 address. Like other KREMLIN components, it can use a smart contract for this purpose. The misspelling in the `ENDPOINT_DINAMIC` field name is particularly noteworthy and can serve as a pivot for identifying additional extension samples.

![Malicious browser extension config showing the misspelled ENDPOINT\_DINAMIC field used to resolve its C2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6bcaed702c9c5d70.png)

The extension first resolves its C2 endpoint using the URL or smart contract specified by `ENDPOINT_DINAMIC`. In the sample analyzed, it sends a request to `hxxps://graph.checkeligibitily.workers[.]dev/x01aab878f25420380b3?op=98d8049e-804f-11f1-b79f-ae3a8bb85d01`. The `op` parameter contains the same Customer ID embedded in the installer, linking both components to the same toolset. The endpoint returns the following response:

\[\["luizestrelhashapr.online:443",""\]\]

Before sending its first request to the C2 server, the script generates a victim identifier that it includes in subsequent communications. This identifier is persisted in the browser's storage.

import random def gen_hash(): chars = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789" return "".join(random.choice(chars) for in range(10))

After generating the victim identifier, the extension establishes a WebSocket connection to the C2 server through the `/google_ws/` route. The identifier, extension version, and a tag are passed as query parameters. Once connected, the extension polls the C2 server once per second for the next command. The initial exchanges are shown below:

![Malicious browser extension opening a WebSocket to its C2 and polling once per second for commands](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4eda89c8e38149da.png)

The extension supports the following commands:

**Command ID**

**Name**

**Description**

`GSH01`

Screenshot

Captures the selected or active tab then uploads the compressed image.

`GAT01`

Get tabs

Enumerates tabs, domains, and active state; uploads the list and returns it over WebSocket.

`GCO01`

Get cookies and storage

Steals cookies, `sessionStorage`, and `localStorage` from the selected or active tab.

`GHI01`

Get history

Collects up to 1,000 history entries from the previous 15 days. This likely fails because the manifest lacks the `history` permission.

`GSO01`

Get source

Extracts and uploads the full HTML source of the selected or active page.

`INC01`

Inject HTML

Downloads attacker-controlled HTML using `scriptHash`, substitutes dynamic variables, injects it into the page, and reports interactions through `INJCLIST`.

`UPD01`

Update config

Refreshes domain targeting, redirect, keylogging, request-body, and request-header interception rules.

Alongside its WebSocket channel, the extension periodically polls `/google_api/` for configuration data controlling its interception and keylogging features. These requests masquerade as CSS file fetches, with each path mapped server-side to a specific configuration or command. For example, the interception configuration is retrieved from `/google_api/81d47cb6.css`.

The extension supports the following commands:

**Endpoint ID**

**Name**

**Description**

`108766d0.css`

Upload cookies and storage

Uploads LZ/Base64-compressed cookies, `sessionStorage`, `localStorage`, and page URL with the client ID.

`41f7b187.css`

Upload tabs

Uploads compressed tab IDs, domains, and active-tab state with the client ID.

`b83fa72d.css`

Upload history

Uploads compressed browser history from the previous 15 days with the client ID.

`0f51ad2f.css`

Upload screenshot

Uploads a compressed JPEG screenshot, page URL, and client ID.

`e4cce14e.css`

Upload page source

Uploads compressed full-page HTML, page URL, and client ID.

`6c0c92f6.css`

Upload intercepted request

Uploads the matching request URL and method, plus either the request body or request headers. Matching uses domain hash, URL substring, and HTTP method rules.

`81d47cb6.css`

Fetch targeting config

Sends the client ID and retrieves domain targeting, keylogging, redirect, and HTTP interception rules.

`a98cb43d.css`

Fetch redirect config

Sends the client ID and retrieves selector-based automatic redirect rules.

Across all communication channels, the client and server compress and Base64-encode exchanged data using the [lz-string](https://www.npmjs.com/package/lz-string) package.

The configuration retrieved from `81d47cb6.css` contains a list of objects, each identifying a target domain by its MD5 hash. To exercise these features, we used an LLM to build a playground with forms and buttons that trigger the interception logic and expose the resulting server-side messages. For this test, we enabled keylogging by setting `"b": 1` and configured the extension to intercept POST requests to `/api/probe/checkout`.

![Test page used to trigger the malicious browser extension's request interception and redirect features](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/476989bccc510fbd.png) case "81d47cb6.css": return flask.jsonify( { "success": True, "x001": \[ { "a": DOMAIN_HASH, # domain md5 hash "b": 1, # Redirects "c": \[\], "d": \[\], # Intercepts "i": \[ { "url_contains": "/api/probe/checkout", "method": "POST", } \], } \], } )

After retrieving this configuration, KREMLIN requests `a98cb43d.css` to obtain its redirection rules. Each object defines a target domain, an HTML element selector (such as a class or ID), an event type (such as `click`), and the destination URL.

case "a98cb43d.css": return flask.jsonify( { "success": True, "redirects": \[ { "domain_hash": DOMAIN_HASH, "target_selector": "#redirect-primary", "action_type": "click", "destination_url": "https://www.elastic.co/", }, { "domain_hash": DOMAIN_HASH, "target_selector": "#redirect-secondary", "action_type": "click", "destination_url": "https://www.hltv.org/", }, \], } )

Once the page has loaded, if keylogging is enabled for the domain (`b = 1`), the extension registers an `input` event listener on every `<input>` and `<textarea>` element. Whenever the user modifies one of these fields, such as by typing a message or password, the extension sends the captured data to the server. To capture dynamically added fields, it also uses a [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) to monitor the DOM and attach the same listener to new `<input>` and `<textarea>` elements.

![Malicious browser extension attaching a keylogger to every input and textarea and sending values to C2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e35575e2ceee233c.png)

The demo below shows how we use our playground website to trigger the functionality injected by the malware. It captures the initialization of communication between the extension and the server, the polling messages (`{'action': 'ping'}`), and the resulting keylogging, request interception, and redirection behavior.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/59ca534d91eb28d7.gif)

## Brazilian banking malware campaigns and infrastructure

By correlating the identified files, relationships, and domains, we assess that the actors have been active since at least May-June 2025. Their operations include installing malicious browser extensions and distributing PULSAR and REMCOS RAT. Shared staging and C2 infrastructure across campaigns suggests that the same actors control the entire infection chain. Their TTPs gradually evolved until they emerged with a toolkit explicitly named KREMLIN. References to an author and version numbers may indicate broader, potentially open-source distribution, although we found no public trace of the toolkit on GitHub, GitLab, or social media.

The actors have used the Internet Archive to host payloads since the earliest observed campaigns. All identified uploads originate from the same account, [Radduxx](https://archive.org/details/@radduxx). The earliest file, `output_image_202505.jpg`, was uploaded on May 21, 2025, and masquerades as an image of the FC Barcelona team. We identified it as an early RunPE module executed through the command line rather than loaded as a DLL through PowerShell. This confirms that RunPE was already in use and distributed through the same JPEG-based packaging method. The associated [metadata](https://archive.org/metadata/output_image_202505) lists the uploader's email address as `facebook-br@protonmail[.]com`.

![Internet Archive uploads by the Radduxx account, FC Barcelona photos carrying KREMLIN RunPE payloads](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cfa8580b558b8e43.png)

The table below summarizes the seven campaigns described in this section.

**Campaign**

**Period**

**Customer ID**

**Execution chain**

**Payloads**

**Key infrastructure**

Codecaudiog A

June 2025

991589b0-4cc9-11f0-b9f4-1402ec3d56f0

PowerShell → RunPE → Installer

Extension, DonutLoader, PULSAR 1.6.6 / 1.7.3

codecaudiog\[.\]site, codecvideowin\[.\]online, 185.221.23\[.\]133

Codecaudiog B

June 2025

f1d7b074-b81f-11ef-a763-1402ec3d56f0

JavaScript → Installer

Extension, PULSAR, or both

codecaudiog\[.\]site, codecvideowin\[.\]online, version.checkeligibitily.workers\[.\]dev

Acrobat

August 2025

618ec809-f08e-4068-a54c-654478811510

JavaScript → PowerShell → RunPE → DonutLoader

PULSAR 1.7.1 / 1.7.2, no extension

acrobat-updater\[.\]com, 144.172.112\[.\]239, 45.90.13\[.\]210

Framesync

September 2025

48502c50-a504-4811-aab8-ba978aeae237

Not recovered

Extension only (FrameSync Driver / Plugin)

lojinhadoluiz\[.\]online, orange-sun-195a.checkeligibitily.workers\[.\]dev

Donalurdesconfeitos to Cremeb

December 2025 to March 2026

991589b0-4cc9-11f0-b9f4-1402ec3d56f0, 48502c50-a504-4811-aab8-ba978aeae237

JavaScript → PowerShell → RunPE → Installer

Extension only

donalurdesconfeitos\[.\]site, marialurdes\[.\]site, harialurdes\[.\]site, cremeb\[.\]com

Cremeb

April 2026

48502c50-a504-4811-aab8-ba978aeae237

LNK → PowerShell → JavaScript (WSH) → JavaScript (Node.js) → RunPE → DLL installer

QR extension, PULSAR 2.4.5

cremeb\[.\]com, 37.16.74\[.\]100, 37.16.74\[.\]34

Ethereum transition

May 2026 to present

98d8049e-804f-11f1-b79f-ae3a8bb85d01

JavaScript → Node.js → RunPE → Installer, and SentinelOne sideload variant

Extension, REMCOS RAT

granderevolucao\[.\]store, volmira\[.\]site, zaviro\[.\]online, 178.92.162\[.\]38

### Codecaudiog A campaign, June 2025: PULSAR RAT and extension delivery

![Codecaudiog A campaign diagram: PowerShell to RunPE to installer, delivering PULSAR and a Chrome extension](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/05a5b1a47a8059ec.png)

The earliest campaign we observed dates back to June 16, 2025, based on the first VirusTotal submission of the Internet Archive URL pointing to the JPEG file containing the RunPE module. The JPEG itself was submitted the following day, on June 17. The execution chain is `PowerShell -> RunPE -> Installer -> Malicious extension & DonutLoader -> PULSAR`. The campaign ID is `991589b0-4cc9-11f0-b9f4-1402ec3d56f0`.

In this campaign, the loader downloads the installer from `hxxps://codecaudiog[.]site/generate?domain=codecvideowin[.]online&payload=991589b0-4cc9-11f0-b9f4-1402ec3d56f0&prefix=NF&prefix_count=10&output=base64`, while the RunPE module is retrieved from `archive[.]org/download/caramelov/caramelov.jpg`. The installer reproduces the complete malicious-extension installation process described in our KREMLIN analysis. It retrieves the extension ID from `hxxps://codecvideowin[.]online/f9e95a1e1fa3f3aebfc802c6c8e6a2eb` and downloads the extension archive from `hxxps://codecvideowin[.]online/af15d5f?p=991589b0-4cc9-11f0-b9f4-1402ec3d56f0`, establishing a direct lineage with KREMLIN.

In parallel, the installer delivers PULSAR through RC4-encoded DonutLoader shellcode injected into `explorer.exe`. Although we could not recover the extension itself, the configurations of PULSAR versions `1.6.6` and `1.7.3` reveal the tags `ChromBallRat` and `Rat`, and the C2 address `185.221.23[.]133`, initially using port `4782` and later port `443`.

The PowerShell loader retrieves the RunPE module from the Internet Archive, loads it as a.NET assembly using `[System.Reflection.Assembly]::Load`, and invokes its `VAI` method.

![PowerShell loader reflectively loading the RunPE .NET assembly and invoking its VAI method](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/92059a5a2b47eaa7.png)

Earlier in our analysis, we did not examine the RunPE module in detail because the latest version executes the installer through DLL sideloading. In this older version of the RunPE module, the VAI method is only executing the payload via manual mapping and calling its entrypoint.

![Decompiled RunPE module executing the KREMLIN payload by manual mapping and calling its entry point](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2233c8f7af484ffc.png)

### Codecaudiog B campaign, June 2025: three JavaScript loader variants

![Codecaudiog B campaign diagram showing three JavaScript loader variants delivering PULSAR and a Chrome extension](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed8b33cf0a05eed3.png)

A second campaign ran concurrently with the first; we estimate it started on June 17, 2025, and used the Customer ID `f1d7b074-b81f-11ef-a763-1402ec3d56f0`. It followed the same TTPs and used two installer variants: one that deployed both the malicious extension and PULSAR, and another that installed only the extension, matching the sample examined in our main analysis.

The execution chain is `JavaScript -> Installer`, followed by PULSAR, the malicious extension, or both. We identified three JavaScript loader variants:

-   **Direct:** Downloads the next stage directly from `hxxps://codecaudiog[.]site/87b76a60ba7c474dbf8f689df2808e1a?payload=f1d7b074-b81f-11ef-a763-1402ec3d56f0`.
    
-   **Internet Archive:** Retrieves a text file hosted on the Internet Archive containing the URL of the next stage.
    
-   **Internet Archive with profiling:** Performs the same retrieval process, but also profiles the host and sends the collected information to the next-stage URL.
    

The profiler loader collects the machine ID, the computer name, and the AV installed.

![KREMLIN JavaScript loader profiling the victim host via WMI to collect computer name, BIOS serial and antivirus](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6c67672b39ecf4a6.png)

The installer contacts `codecvideowin[.]online` or `version.checkeligibitily.workers[.]dev` to download the malicious extension. We were unable to recover the extension archive. However, the PULSAR version and configuration match those observed in the previous campaign.

### Acrobat campaign, August 2025: PULSAR RAT only, no extension

![Acrobat campaign diagram showing a fake Adobe plugin lure delivering PULSAR 1.7.1 and 1.7.2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3c08498bea840ebd.png)

We estimate that this campaign began on August 14, 2025. It uses the following customer ID `618ec809-f08e-4068-a54c-654478811510`. It follows the sequence `JavaScript -> PowerShell -> RunPE -> DonutLoader` and only delivers PULSAR versions `1.7.1` and `1.7.2`, with no malicious extension.

As in the previous campaign, the user is tricked into downloading and executing a JavaScript file. In this case, the lure masquerades as an Adobe plugin distributed from `acrobat-updater[.]com`. The loader retrieves a domain list from an Internet Archive file named `acrobat-updater.com.txt`, then attempts to download the second stage from each domain through `/5f109e7bb3df4dea81946f2f853da288`.

The second stage Base64-decodes the third-stage payload and executes it through PowerShell.

![KREMLIN JavaScript loader reversing and Base64-decoding the next stage, then running it through PowerShell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1814c2adbb49409e.png)

The third-stage PowerShell script downloads the final payload from `hxxps://acrobat-updater[.]com/generate` and retrieves the RunPE module from Internet Archive, concealed inside `tragira.jpg`. It then loads the RunPE assembly into the PowerShell process and invokes its `VAI` method.

![Third-stage PowerShell script extracting the RunPE assembly from a JPEG carrier and invoking VAI](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eee6933666e34fde.png)

In previous campaigns, RunPE was used only to manually map and execute the payload. In this version, it also establishes persistence by creating a Windows scheduled task. Based on the parameters passed by the third stage, the task is named `AcrobatBrowserExtension` and is triggered both at user logon and every 30 minutes. It downloads and executes a JavaScript payload from `hxxps://acrobat-updater[.]com/api/v2/acrobat/latest`, allowing the malware to reinstall or relaunch as needed.

![RunPE module installing a scheduled task that re-downloads the KREMLIN JavaScript payload every 30 minutes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8bc9df95de30f185.png)

In this campaign, the PULSAR payloads communicate with the following C2 endpoints: `144.172.112[.]239:4782` and `45.90.13[.]210:443`.

### Framesync campaign, September 2025: earliest recovered extensions

We estimate that this campaign began on September 2, 2025. We recovered only the malicious extensions, but their analysis confirms that they belong to the same family as the extension examined in our main analysis. Although these are earlier versions, they already implement the full feature set described previously. This establishes a direct link between the KREMLIN name and the toolkit used during this period. We assess that the toolkit may have been known as `CHROMEBALLRAT` at the time, based on the tag observed in PULSAR samples and its use in other JavaScript loaders.

These extensions masquerade as `FrameSync Driver System V16.9.7` and `FrameSync Plugin Project V1.19.16`. The associated extension ID is `djodclnjknbpambeaaapadmdfhmbpeog`. Its configuration reports version `12.0.0` and contains the domain `lojinhadoluiz[.]online` and customer ID `48502c50-a504-4811-aab8-ba978aeae237`.

![Framesync malicious browser extension config showing version 12.0.0 and the lojinhadoluiz\[.\]online C2](https://static-www.elastic.co/v3/assets/bltefdd0b53724fa2ce/blt35225b35ee7d1441/6aa2cb5e8406d9a526ca9e72/Framesync.png)

This version contains no `DINAMIC_HOST` variable and does not use smart-contract-based resolution. The domain configured in `ENDCENT` is also unused. Instead, as in the recent version, the actual C2 endpoints are resolved dynamically by querying `hxxps://orange-sun-195a.checkeligibitily.workers[.]dev`, which returns separate WebSocket and HTTP endpoints for the two communication channels.

### Donalurdesconfeitos to Cremeb campaign, December 2025: first KREMLIN branding

![Donalurdesconfeitos to Cremeb campaign diagram showing four KREMLIN loader variants and their decoding](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/26de05c3f56f0d6b.png)

We estimate that this campaign began in December 2025. Between December and March, the actors migrated their infrastructure from `donalurdesconfeitos[.]site` to `cremeb[.]com`, using `marialurdes[.]site` and `harialurdes[.]site` as intermediate domains. This campaign marks the first observed use of the KREMLIN name and is associated with two customer IDs: `991589b0-4cc9-11f0-b9f4-1402ec3d56f0` and `48502c50-a504-4811-aab8-ba978aeae237`.

In this campaign, we observed only the installer used to deploy the malicious extension. The execution chain is similar to those described previously: `JavaScript -> PowerShell -> RunPE -> Installer -> Extension`. We identified four loader variants based on how they decode the next stage:

-   Reversed data
    
-   Reverse, then Base64-decode
    
-   Base64-decode, then reverse
    
-   RC4-encrypted payload embedded in a JPEG carrier
    

The final loader variant is the most interesting. In some cases, we found it as a `JSE` file using Microsoft's proprietary `JScript.Encode` format. The loader contains a comment header identifying the malware as `KREMLIN`, crediting `Kr3mlin4rt1st` as its author, and specifying version `1.33`, dated February 8, 2026. This is the earliest observed use of the full KREMLIN name and author attribution. The version and copyright information suggest that the script may have been distributed to other operators. However, we found no public trace of it on GitHub or GitLab; if shared, it was likely distributed through private or underground channels.

![ASCII art header in the KREMLIN loader naming author Kr3mlin4rt1st and version 1.33, dated February 2026](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b5b6239ee2a3f63e.png)

Unlike the other three variants, this loader retrieves its payload using the same JPEG carrier technique repeatedly observed across the KREMLIN toolkit. The embedded blob is located using the marker `kremlin-moscow-russia` and then decrypted with RC4 using the key `kr3ml1n`.

![KREMLIN loader locating the kremlin-moscow-russia marker in a JPEG and RC4-decrypting the next stage](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/576f3c436293884a.png)

### Cremeb campaign, April 2026: QR-code extension and Node.js loaders

![Cremeb campaign diagram showing the LNK to PowerShell to Node.js chain delivering PULSAR and a QR extension](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/687e2d523c1eb071.png)

Beginning in April 2026, we observed two concurrent campaigns using the Cremeb infrastructure and the Customer ID `48502c50-a504-4811-aab8-ba978aeae237`. For the first campaign, we could not conclusively identify the initial loader. Its installer delivers PULSAR through DonutLoader alongside a new QR-themed malicious extension. The second campaign introduces the infection chain `LNK -> PowerShell -> JavaScript (WSH) -> JavaScript (Node.js) -> RunPE -> DLL installer -> PULSAR & Extension`. This is the earliest campaign in which we observed the loader downloading the Node.js runtime to execute the next stage, a behavior retained in the current version. Another significant change affects RunPE: rather than manually mapping the payload into its own process, it injects it into `explorer.exe` using [Early Cascade Injection](https://www.outflank.nl/blog/2024/10/15/introducing-early-cascade-injection-from-windows-process-creation-to-stealthy-injection/).

The QR-themed extension delivered by the first branch has the ID `cdgcjghdeinagopbaobhmaefigoafaaa`. It presents itself as a tool that displays an overlay containing a QR code generated from a supplied string. Clicking the extension icon opens a menu exposing exactly this functionality. During our tests, the overlay displayed a Portuguese message asking the user to reauthenticate with the current application, in this case our locally hosted playground, by scanning the QR code. The user-accessible menu suggests that a development interface was left exposed, further supporting the hypothesis of a rushed implementation.

![Malicious browser extension showing a Portuguese QR reauthentication overlay on a test banking page](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/af4eff31b3ea2deb.png)

Source-code analysis confirms that this extension relies on QR-based social engineering rather than data interception. When a user visits a page matching `web.whatsapp.com` or `www.sicoob.com.br`, the extension retrieves QR-code content from `hxxps://cremeb[.]com/qrcode/api/v1/read?domain=${encodeURIComponent(domain)}` and displays it in an overlay. The code is unobfuscated and contains patterns consistent with LLM generation, suggesting rushed development. We could not determine what the QR code encodes, but it likely facilitates account compromise on the targeted services.

![Malicious QR extension polling its C2 for code content and rendering it in an overlay on target sites](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ac801c473554ed92.png)

This campaign deploys PULSAR version `2.4.5`, which communicates with the following C2 endpoints: `37.16.74[.]100:443` and `37.16.74[.]34:443`.

### Ethereum transition campaign, May 2026: smart contract configuration and REMCOS RAT

![Ethereum transition campaign diagram showing the KREMLIN chain from JavaScript loader to REMCOS RAT](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c1ca66cb28c1ba82.png)

Our Ethereum blockchain analysis, presented in the following section, shows that the first smart contracts appeared in May 2026. They initially pointed to the Cremeb infrastructure (`0x902EDbFECFF38f285Bf26283fB9cEB3700061873`), then to `granderevolucao[.]store` (`0x64Def0A6099c4DE9C413B108EAae85A3C7457615`), before the migration to `0xCD7360A83E5cdbBbbbcEB0e78748babA6740d07b`, which remains in use at the time of writing. We found no samples associated with the first two contracts, but the on-chain data confirms that the adoption of Ethereum as a dead-drop mechanism dates back to this period.

In these newer campaigns, actors use the Ethereum blockchain as a dead drop, with smart contracts storing configuration that different components of the infection chain consume. As detailed earlier, this configuration contains URLs for the various stages and payloads. We identified two chains during this period. The first, observed in June 2026, follows the sequence `JavaScript -> Node.js -> RunPE -> Installer -> Extension & REMCOS RAT`. The shift from PULSAR to REMCOS RAT is particularly noteworthy. As documented in our [four-part analysis series](https://www.elastic.co/security-labs/threat-command/dissecting-remcos-rat-part-one), REMCOS provides broader capabilities than PULSAR. This change may represent an upgrade as the operation matures and gains resources. The second branch is the one analyzed in detail throughout this report. It uses the legitimate signed SentinelOne binary to sideload the main malicious DLL. In this configuration, the RunPE module is unused because process injection is unnecessary: the payload already executes within a trusted, signed process, helping conceal its activity. Both branches deploy the same extension analyzed in this report: the latest version of the interception-focused variant.

REMCOS RAT communicates with the C2 endpoint `178.92.162[.]38:443`.

During the same period, we identified a parallel branch using a distinct infrastructure variant. Separate actors may operate this branch using a modified version of the KREMLIN toolkit. It relies on `seguranca.versionnova[.]site` and comprises three distinct waves:

**Wave A.** [ba80216c960977fa45e317f00dcf31e96acab29904a737cbc0bf86e929c3be5f](https://www.virustotal.com/gui/file/ba80216c960977fa45e317f00dcf31e96acab29904a737cbc0bf86e929c3be5f) First observed on VirusTotal on June 22, 2026, it downloads and executes a PowerShell script from `/news/connect_api.txt`.

**Wave B.** [cb15cbf3f01a92e609e4c2bc26155e667e96c5d04770e83abba66ee07bcecea0](https://www.virustotal.com/gui/file/cb15cbf3f01a92e609e4c2bc26155e667e96c5d04770e83abba66ee07bcecea0) First observed on June 26, 2026, it adds a fake Portuguese error message and a RAM-based virtual-machine check. It retrieves its payload through `/nodks/connect_api.txt/`.

**Wave C.** [170dffb37e05f525f735bc9ad84b3908a488f7ce43fcb07739a10e4331e15a2c](https://www.virustotal.com/gui/file/170dffb37e05f525f735bc9ad84b3908a488f7ce43fcb07739a10e4331e15a2c) Active from July 3 to July 14, 2026, it resembles the main lineage by retrieving its payload through `/serve.php?l=` and beaconing to its C2 through `/testar_nova_versao/log_receiver.php`, using the header `X-Log-Token: MichelleMignon171`.

![PowerShell C2 beaconing code sending the X-Log-Token MichelleMignon171 to seguranca.versionnova\[.\]site](https://static-www.elastic.co/v3/assets/bltefdd0b53724fa2ce/blt5b79bab3055174bc/6aa2d7f036a74113b62755aa/MichelleMignon171.png)

The descriptive Portuguese route name `testar_nova_versao` ("test new version") and the hard-coded token provide useful attribution clues. Combined with the campaign's focus on Brazilian institutions and its repeated use of Portuguese-language artifacts, they strongly support the hypothesis that the REF9334 operators are Brazilian. The token `MichelleMignon171` also appears to reference Brazilian DJ [Michelle Mignon](https://djanetop.com/djanes/michelle-mignon/), whom the actors may be fans of.

We identified a PowerShell reimplementation of the native extension installer [42a3e2bb135fb46b11b127f45a266b3a4d9dff4aa1cf75433f93fe69ba51a9b9](https://www.virustotal.com/gui/file/42a3e2bb135fb46b11b127f45a266b3a4d9dff4aa1cf75433f93fe69ba51a9b9/relations). It mirrors the same functionality by downloading the extension from `connection.upgradeonline[.]site`, deploying it into Chromium-based browser profiles, and generating the integrity values required to activate it. Although we cannot conclusively link this script to the preceding loader, VirusTotal's relationship graph connects it to both `seguranca.versionnova[.]site` and `connection.upgradeonline[.]site`. Based on this overlap, we assess with high confidence that the JavaScript loader downloaded and executed this script.

![VirusTotal detection for install\_chrome\_ext.ps1, a PowerShell malicious browser extension installer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2014a2d8735c99cd.png)

The complete list of indicators is available in the **Indicators of Compromise** section.

## Ethereum blockchain analysis: malicious smart contract and wallet activity

Analyzing transactions associated with the [Ethereum smart contract](https://etherscan.io/address/0xCD7360A83E5cdbBbbbcEB0e78748babA6740d07b) reveals a [single wallet](https://etherscan.io/txs?a=0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6&p=2) responsible for deploying the contracts and updating the malware configuration, while also conducting several financial transactions.

The wallet was already financially active before deploying its first contract. Between June 19th 2025, and August 24th 2026, we identified 82 USDT transfers, totaling `20,778.967228 USDT` received and `19,016.959182 USDT` sent. Its use to deploy the malware's smart contracts suggests it is controlled by a developer or campaign operator. Although no individual transfer can be directly linked to development funding, the transaction volume makes this a valuable lead. The table below details these transfers.

**Direction**

**Source**

**Destination**

**Transactions**

**Total value**

**First–last UTC**

Incoming

`0x8a711333899C173A1DC1a3523335e52Becce9A44`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

9

`16,347.415674 USDT`

2025-06-20–2026-08-04

Incoming

`0x25a6a4fe0cc0f8ebf19836ad50fe104c3cbc9d6a`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

2

`2,000.000000 USDT`

2025-08-29–2025-09-09

Incoming

`0x56eddb7aa87536c09ccc2793473599fd21a8b17f`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

1

`1,499.000000 USDT`

2025-09-15

Incoming

`0xb2b7e8403b4534d43b477d4d4bd6f829437463c8`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

1

`911.377633 USDT`

2025-06-19

Incoming

`0xdd3d72c53ff982ff59853da71158bf1538b3ceee`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

1

`12.155745 USDT`

2025-08-26

Incoming

`0x28c6c06298d514db089934071355e5743bf21d60`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

1

`9.000000 USDT`

2025-09-15

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0x1AD4436893850Cc1dA180b2488e764bEB9E2A379`

6

`6,266.906236 USDT`

2025-06-20–2025-10-06

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0x737A8DeA4Db63B3b24f19698AF9e5Bc6f08DE8EE`

3

`6,022.591408 USDT`

2026-01-09–2026-08-21

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0x77e2d84e79D65CE84C2dB606E984380A88F4594f`

40

`3,015.000000 USDT`

2026-07-22–2026-08-24

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0x5b3f4643d012ad6caca0a392b1a54b142b59aba5`

1

`1,538.461538 USDT`

2025-10-15

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0xAC0a95225938E1D85C1E41e35495563eF733947a`

2

`1,010.000000 USDT`

2025-09-10

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0x81ffb6c5f72e934a79b46a867063bff5a7a222b1`

2

`400.000000 USDT`

2025-08-26–2025-08-29

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0xd3d8d6b0e6d0f8dd3705247b54b8fe55f1c77567`

3

`395.000000 USDT`

2026-07-14

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0x7e27a030b8879cea5e92e3da650eba0098116908`

9

`314.000000 USDT`

2026-07-15–2026-07-20

Outgoing

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

`0x8236a0bcf102db910df27190dccc57a75e9faa8b`

1

`55.000000 USDT`

2025-09-05

The developer deployed their [first test smart contract](https://etherscan.io/tx/0x3774cbd99f64720a249eca32bc6277506bf3dca82dfecc86fd4530041f15313f), named `UserName`, on May 16, 2026. It contains boilerplate code likely used to experiment with smart contract development. The author then deployed several similar contracts and submitted multiple transactions calling the `SetName` method, which modifies a value stored in the contract. We extracted the following values from these transactions: `Medina`, `Filosofo`, `Danone1555IBIZA`.

The [first malicious smart contract](https://etherscan.io/address/0x902EDbFECFF38f285Bf26283fB9cEB3700061873) linked to KREMLIN's infrastructure was deployed on May 19, 2026. It is a slightly modified version of the `UserName` test contract used previously. This version adds two string variables, `main` and `extension`, which store the download URLs for the installer and malicious extension. Its transactions reveal the following values:

![Decompiled Solidity contract used by KREMLIN as a dead drop resolver, with admin, main and extension variables](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cdeb99ee4b74fd5e.png)

The following values were observed:

**Transaction**

**Date (UTC)**

**Variable-name**

**Value**

[0x05ddd2131556d71352f5a10213fb1705b81dbd8d2f86fbe528a8a4be1de7d2e9](https://etherscan.io/tx/0x05ddd2131556d71352f5a10213fb1705b81dbd8d2f86fbe528a8a4be1de7d2e9)

2026-05-19 01:38:23

`admin`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

[0x05ddd2131556d71352f5a10213fb1705b81dbd8d2f86fbe528a8a4be1de7d2e9](https://etherscan.io/tx/0x05ddd2131556d71352f5a10213fb1705b81dbd8d2f86fbe528a8a4be1de7d2e9)

2026-05-19 01:39:27

`main`

`cremeb[.]com`

[0x05ddd2131556d71352f5a10213fb1705b81dbd8d2f86fbe528a8a4be1de7d2e9](https://etherscan.io/tx/0x05ddd2131556d71352f5a10213fb1705b81dbd8d2f86fbe528a8a4be1de7d2e9)

2026-05-19 01:39:27

`extension`

`cremeb[.]com`

[0xcc0ba092c4721c69801ece58a144a0aa668feed26da4993b1fbcbcb2e7a570f9](https://etherscan.io/tx/0xcc0ba092c4721c69801ece58a144a0aa668feed26da4993b1fbcbcb2e7a570f9)

2026-05-19 02:53:47

`main`

`hxxps://cremeb[.]com/kremlin?p=########-####-####-####-############&prefix=NF&prefix_count=10&output=base64`

[0x13b457af75e7cc0c7963b454d879800d8fdfbd3ebc9fe3ec34bd8ca8cf44701d](https://etherscan.io/tx/0x13b457af75e7cc0c7963b454d879800d8fdfbd3ebc9fe3ec34bd8ca8cf44701d)

2026-05-19 19:21:11

`main`

`cremeb[.]com`

The [second malicious smart contract](https://etherscan.io/address/0x4f7D712D0B53fDf3c96896EB411467B30Da23406) was deployed on June 9, 2026. In this version, the `main` variable was renamed to `domain`. Its transactions set the following values:

**Transaction**

**Date (UTC)**

**Variable-name**

**Value**

[0xb86787588fe43d9bc6a419c94450b620fa5b60918dda9b242efd05ec73d0e013](https://etherscan.io/tx/0xb86787588fe43d9bc6a419c94450b620fa5b60918dda9b242efd05ec73d0e013)

2026-06-09 20:40:59

`admin`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

[0xb86787588fe43d9bc6a419c94450b620fa5b60918dda9b242efd05ec73d0e013](https://etherscan.io/tx/0xb86787588fe43d9bc6a419c94450b620fa5b60918dda9b242efd05ec73d0e013)

2026-06-09 20:40:59

`domain`

Empty string

[0xb86787588fe43d9bc6a419c94450b620fa5b60918dda9b242efd05ec73d0e013](https://etherscan.io/tx/0xb86787588fe43d9bc6a419c94450b620fa5b60918dda9b242efd05ec73d0e013)

2026-06-09 20:40:59

`extension`

Empty string

[0x1b189e5ce3dbee52106de5c1a8508091ea2acc2cbace7252763b53be01af3109](https://etherscan.io/tx/0x1b189e5ce3dbee52106de5c1a8508091ea2acc2cbace7252763b53be01af3109)

2026-06-09 20:45:11

`extension`

`connection.timesmaluku[.]com`

[0x49ee0b041878c64c9253955d1de44f3832bb2b96b891cd3fd85c136bbbae0f71](https://etherscan.io/tx/0x49ee0b041878c64c9253955d1de44f3832bb2b96b891cd3fd85c136bbbae0f71)

2026-06-09 20:46:35

`domain`

`granderevolucao[.]store`

[0x645c1701acd8a5f2c9364ac947718863ab450a706c0aabfca85376e9374ccb45](https://etherscan.io/tx/0x645c1701acd8a5f2c9364ac947718863ab450a706c0aabfca85376e9374ccb45)

2026-06-16 04:13:59

`extension`

`connection.upgradeonline[.]site`

This is the first observed use of the `connection`. subdomain. In these cases, the parent domains appear to host legitimate websites that the actors compromised. Using a separate subdomain lets them host malicious infrastructure alongside the original website without disrupting it.

![Compromised Indonesian news site hosting KREMLIN C2 infrastructure on a connection. subdomain](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e8857be03be5754.png)

The [next iteration of the contract](https://etherscan.io/address/0x64Def0A6099c4DE9C413B108EAae85A3C7457615), deployed on June 16, 2026, replaces the individual configuration variables with a single `mapping`. It exposes explicit methods for updating and querying this mapping: `setConfig` and `getConfig`.

![Solidity setConfig and getConfig methods letting KREMLIN operators update C2 config as a dead drop resolver](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/733002c75e49906c.png)

The following values are used:

**Transaction(s)**

**Date / time span (UTC)**

**Count**

**Variable-name**

**Value**

[0xe4f04f…1d5688](https://etherscan.io/tx/0xe4f04f569df2593a41f525ae3a002cbd97ccc87b0ec73e66cd6340d8251d5688)

2026-06-16 22:41:23

1

`admin`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

[0xc68881…259d3f](https://etherscan.io/tx/0xc68881c463ca8466dc0511c393dec7d47f1c6f5197890de9602cbaf551259d3f)

2026-06-16 22:48:47

1

`config["main"]`

`granderevolucao[.]store`

[0x66b730…83ef4](https://etherscan.io/tx/0x66b7300ed24e4b9c77045cf12fd660f906d54084df9c4cea1a88829a52e83ef4), [0x4bbe79…7a99bd](https://etherscan.io/tx/0x4bbe79578f93f8d2e0941fc26f86bcda6c8fa5998594733b22b8e7f29b7a99bd), [0x94ca4a…42c6f2](https://etherscan.io/tx/0x94ca4ad25a77ebe4b1fa6257d06afd6f38cdc1d221f8e1c16055e0985942c6f2)

2026-06-16 22:51:23 to 22:58:47

3

`config["extension"]`

`connection.upgradeonline[.]site`

[0xbb017d…062e00](https://etherscan.io/tx/0xbb017d3a859e69be8c76e005d5799c54707c7e4e5ea6dcb965939e6fdd062e00), [0xa8e9ae…f4c87a](https://etherscan.io/tx/0xa8e9ae86eb81aec2d9c16ef50dc691e66403a72111bf641702afa31becf4c87a)

2026-06-16 22:56:11 to 22:56:23

2

`config["steganography"]`

`https://archive[.]org/download/operagarnier/operagarnier.jpg`

The [latest contract](https://etherscan.io/address/0xCD7360A83E5cdbBbbbcEB0e78748babA6740d07b), which remains active at the time of writing, was deployed on June 16, 2026. This version introduces `main-v2`, which likely corresponds to the installer that uses DLL sideloading, replaces `steganography` with `sub-module`, and adds `sentinel` for the legitimate SentinelOne binary. The following values were observed:

**Transaction**

**Date (UTC)**

**Count**

**Variable-name**

**Value**

[0x012353…679a5a](https://etherscan.io/tx/0x012353e6887d987dd97631a5bbdce0b93848a217e68fd1068c8d46a32a679a5a)

2026-06-16 23:02:23

1

`admin`

`0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6`

[0xf25ffb…279dbc](https://etherscan.io/tx/0xf25ffb2385ef74874f0e827ee5b3ff144351b0fa8256f9514c07cf7304279dbc)

2026-06-16 23:04:35

1

`config["main"]`

`granderevolucao[.]store`

[0x0c9278…d2f69d](https://etherscan.io/tx/0x0c927872f76db03bcf743b7b0ea226ad57b7251e4e3e0c7f7958768acbd2f69d)

2026-06-16 23:04:59

1

`config["extension"]`

`connection.upgradeonline[.]site`

[0x08dece…cdb506](https://etherscan.io/tx/0x08dece4076968c7f0cbcb8d72320fde120220d21696720229c43379622cdb506)

2026-06-16 23:05:35

1

`config["steganography"]`

`https://archive[.]org/download/operagarnier/operagarnier.jpg`

[0xea0e9e…e0c65d](https://etherscan.io/tx/0xea0e9ebb666761ae9a2d529da3b0b4eda1d73e173b52ecb74d705468e2e0c65d)

2026-06-26 04:17:47

1

`config["steganography-stg"]`

`https://archive[.]org/download/operaparis/operaparis.jpg`

[0x7732c5…5d8515](https://etherscan.io/tx/0x7732c540b070208488d757e867798bac1eaab09a7b7e9556cbb7d1fc0e5d8515)

2026-06-26 04:42:47

1

`config["steganography-stg"]`

`https://archive[.]org/download/hotelmoskva/hotelmoskva.jpg`

[0x6c100f…40f2b5](https://etherscan.io/tx/0x6c100f9c15524c4eae402b5123d8a1160809f265ac09b598715af7611d40f2b5)

2026-06-27 15:47:35

1

`config["binary"]`

`test`

[0x813b6d…4108e](https://etherscan.io/tx/0x813b6def178e2fab3f1501c98e4726cebef66bb8f1f233e1f240aa435694108e)

2026-06-27 15:56:23

1

`config["binary_chunks"]`

`21`

[0x4b2512…0164d1](https://etherscan.io/tx/0x4b2512b66392e81dcf850cba46852bfabcb6ff52cf85e4106e6330a7460164d1)

2026-07-07 02:19:59

1

`config["main-loran"]`

`cremeb[.]com`

[0x262412…a88bb1](https://etherscan.io/tx/0x2624125890efd53189b4c5b28cd1b3d5103e4efa09f50a1e0dfdc1584ba88bb1)

2026-07-22 03:08:59

1

`config["sentinel"]`

`https://ia902901.us.archive[.]org/12/items/sentinel_20260721/Sentinel.jpg`

[0xae24e3…681494](https://etherscan.io/tx/0xae24e377e8297215c1f58b502bfb891562e17818f6cd8593ca2567ffec681494)

2026-07-22 03:09:59

1

`config["sub-module"]`

`https://archive[.]org/download/hotelmoskva/hotelmoskva.jpg`

[0x629fcd…aabac1](https://etherscan.io/tx/0x629fcd90711148c386ece8c5246589b5a8bee4021f9ceb7bb08506b44caabac1)

2026-07-22 03:27:23

1

`config["sentinel"]`

`https://ia600804.us.archive[.]org/12/items/sentinel_20260722/Sentinel.jpg`

[0xae161d…8aa596](https://etherscan.io/tx/0xae161d807dd7d118928323ee3e25705e29e63d1a3ee893cb7509ec004d8aa596)

2026-07-22 04:36:47

1

`config["sentinel"]`

`https://ia601808.us.archive[.]org/5/items/sentinel_20260722_0435/Sentinel.jpg`

[0x4208af…b7f293](https://etherscan.io/tx/0x4208aff7851ad6a9b4d24d3b26f6dfd309d2a3e12ba24e74a5ae21930ab7f293)

2026-07-23 06:16:47

1

`config["main-v2"]`

`californicationdetroit[.]com`

[0xb9b025…1ee5ce](https://etherscan.io/tx/0xb9b025640626be2b36d9dd71188db7390bf69e82678f0ac3505c3c5a561ee5ce)

2026-07-23 07:33:23

1

`config["main-v2"]`

`granderevolucao[.]store`

[0xce846d…44d640](https://etherscan.io/tx/0xce846d7624cb5ed1881e637bde64ae51712919e57e93333b85e836c71344d640)

2026-07-23 07:33:59

1

`config["main"]`

`californicationdetroit[.]com`

[0xe89e89…b91c24](https://etherscan.io/tx/0xe89e89e851a0e16a3632f74e408d2f6afbc9cb29ce286102b9352424e4b91c24)

2026-08-10 17:35:23

1

`config["extension"]`

`volmira[.]site`

[0x832d82…ab2aae](https://etherscan.io/tx/0x832d82f6a90d1182650432536c7b131fc223cee1a94bcb40a79d7330d6ab2aae)

2026-08-13 01:53:23

1

`config["main-v2"]`

`zaviro[.]online`

## Infrastructure, victimology, and Brazilian bank targeting

Analysis of the associated domains confirms earliest activity back to `June 2025`. The reconstructed timeline is shown below:

![Timeline of REF9334 domains from June 2025 to September 2026, tracking KREMLIN infrastructure migration](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a8e1fde65a73fc4f.png)

Geolocation analysis of the IP addresses associated with the domains provides no additional insight into the actors' location. The addresses span multiple countries, and many domains are proxied through Cloudflare. The table below summarizes these geolocations:

**Domain / IP**

**First Campaign / DNS Observation (UTC)**

**Resolved IP**

**Geo**

`codecvideowin.online`

2025-06-17

`NA`

Cloudflare

`185.221.23.133`

2025-06-30

`NA`

Finland

`version.checkeligibitily.workers.dev`

2025-07-30

`172.67.200.134`

Cloudflare

`version.checkeligibitily.workers.dev`

2025-07-31

`104.21.68.250`

Cloudflare

`version.checkeligibitily.workers.dev`

2025-07-31

`2606:4700:3035::6815:44fa`

Cloudflare

`version.checkeligibitily.workers.dev`

2025-07-31

`2606:4700:3037::ac43:c886`

Cloudflare

`affordableonline.online`

2025-08-12

`NA`

NA

`cheapzone.space`

2025-08-12

`NA`

NA

`mysterylink.xyz`

2025-08-12

`NA`

NA

`quirkyclub.club`

2025-08-12

`NA`

NA

`144.172.112.239`

2025-08-14

`NA`

United States

`acrobat-updater.com`

2025-08-14

`104.21.2.131`

Cloudflare

`lojinhadoluiz.online`

2025-08-19

`NA`

Cloudflare

`orange-sun-195a.checkeligibitily.workers.dev`

2025-09-02

`NA`

Cloudflare

`45.90.13.210`

2025-09-03

`NA`

Netherlands

`176.98.187.47`

2025-09-12

`NA`

Russia

`codecaudiog.site`

2025-09-12

`176.98.187.47`

Russia

`version.checkeligibitily.workers.dev`

2025-09-13

`188.114.96.1`

Cloudflare

`version.checkeligibitily.workers.dev`

2025-09-13

`188.114.97.1`

Cloudflare

`lojinhadaana.org`

2025-11-18

`176.98.187.47`

Russia

`donalurdesconfeitos.site`

2025-12-02

`NA`

NA

`harialurdes.site`

2026-02-19

`NA`

NA

`marialurdes.site`

2026-02-23

`NA`

NA

`45.90.13.77`

2026-04-10

`NA`

Netherlands

`37.16.74.100`

2026-04-17

`NA`

Netherlands

`find-postman.ddesdokww.workers.dev`

2026-04-17

`NA`

Cloudflare

`209.99.185.204`

2026-04-30

`NA`

Switzerland

`granderevolucao.store`

2026-04-30

`209.99.185.204`

Switzerland

`cremeb.com`

2026-05-04

`188.114.96.1`

Cloudflare

`cremeb.com`

2026-05-04

`188.114.97.1`

Cloudflare

`37.16.74.34`

2026-05-28

`NA`

Netherlands

`connection.timesmaluku.com`

2026-06-09

`NA`

NA

`connection.upgradeonline.site`

2026-06-16

`88.99.149.241`

Germany

`seguranca.versionnova.site`

2026-06-30

`188.114.96.0`

Cloudflare

`seguranca.versionnova.site`

2026-06-30

`188.114.97.0`

Cloudflare

`graph.checkeligibitily.workers.dev`

2026-07-10

`104.21.68.250`

Cloudflare

`graph.checkeligibitily.workers.dev`

2026-07-10

`172.67.200.134`

Cloudflare

`graph.checkeligibitily.workers.dev`

2026-07-10

`2606:4700:3035::6815:44fa`

Cloudflare

`graph.checkeligibitily.workers.dev`

2026-07-10

`2606:4700:3037::ac43:c886`

Cloudflare

`178.92.162.38`

2026-07-16

`NA`

Brazil

`californicationdetroit.com`

2026-07-22

`104.21.69.130`

Cloudflare

`californicationdetroit.com`

2026-07-22

`172.67.208.181`

Cloudflare

`volmira.site`

2026-08-05

`209.99.185.204`

Switzerland

`zaviro.online`

2026-08-05

`209.99.185.204`

Switzerland

`72.251.7.22`

2026-08-07

`NA`

Canada

`72.251.7.23`

2026-08-07

`NA`

Canada

`connection.upgradeonline.site`

2026-08-07

`72.251.7.22`

Canada

`connection.upgradeonline.site`

2026-08-07

`72.251.7.23`

Canada

`volmira.site`

2026-08-10

`88.99.149.241`

Germany

`californicationdetroit.com`

2026-08-22

`2606:4700:3033::ac43:d0b5`

Cloudflare

`californicationdetroit.com`

2026-08-22

`2606:4700:3036::6815:4582`

Cloudflare

`luizestrelhashapr.online`

2026-08-25

`216.203.21.40`

United States

`104.219.250.37`

NA

`NA`

United States

`172.234.24.211`

NA

`NA`

United States

`172.239.57.117`

NA

`NA`

United States

`2.59.170.20`

NA

`NA`

Netherlands

Several clues suggest that the actors are Portuguese-speaking and possibly based in Brazil, matching the campaign's geographic focus. Multiple domains and files use Portuguese names, but the strongest clue comes from the QR extension: its code shows signs of LLM generation, and the generated comments are also written in Portuguese, likely reflecting the language used in the prompts.

![Portuguese code comments in the QR extension showing signs of LLM-generated development](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3091340f0961cce7.png)

Because Portuguese is spoken across several regions, we analyzed the Ethereum transaction timestamps for a potential geographic pattern. In UTC-3, only around ten fall within late-night hours, without extending particularly far into the early morning. Assuming the operators are more likely to work late than wake before dawn, this distribution aligns most closely with São Paulo time and supports Brazil as a plausible location for the operators.

![Chart of REF9334 Ethereum wallet activity by hour in UTC-3, showing a São Paulo working-hours pattern](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13cee82552c2ea45.png)

The victim's geography is easier to establish. User-facing text and lure filenames are written in Portuguese, indicating that the campaigns target Portuguese-speaking users. Many JavaScript loaders use filenames crafted to resemble legitimate documents. Most follow the pattern `<PortugueseTheme><InstitutionOrQualifier>_DD-MM-YYYY.<10Digits>.js` and impersonate Brazilian banks and payment services, including Banco do Brasil, Caixa, Bradesco, Sicoob, C6 Bank, Inter, BTG, Safra, PagBank, PicPay, Santander, and Mercado Pago. Combined with the fake Portuguese error messages, this focus on Brazilian brands strongly indicates that the victims are primarily located in Brazil.

We reconstructed the following timeline showing how these naming conventions evolved:

**Observed span**

**Portuguese template/examples**

**English meaning**

2026-07-22–08-03

`COMPROVANTE_*`

`Comprovante<Bank>_*`

`ComprovanteOriginal_*`

receipt / proof of payment

2026-07-23–08-03

`Extrato<Bank>_*`

bank statement

2026-07-23–08-10

`PIX<Bank>_*`

PIX instant-payment record

2026-07-23–07-31

`Pagamento<Bank>_*`

payment

2026-07-23–07-31

`TED<Bank>_*`

TED bank transfer

2026-07-24–07-30

`Transferencia<Bank>_*`

bank transfer

2026-07-24–07-29

`Documento<Bank>_*`

bank document

2026-07-24–08-04

`Recibo<Bank>_*`

`ReciboParticular_*`

receipt / private receipt

2026-07-24–07-31

`PDF_*``,` `PdfAcesso_*`

PDF / access PDF

2026-08-06–08-13

`RegulamentacaoLocalizacao_*`

`RegulamentacaoSeguranca_*`

`RegulamentacaoPublico_*`

location/security/public regulation

2026-08-06–08-10

`DocumetoSeguranca_*`

`DocumetoFuncionamento_*`

security/operating document

2026-08-06

`CertificadoLocalizacao_*`

location certificate

2026-08-07–08-10

`AlvaraPublico_*`

`AlvaraFuncionamento_*`

public/operating permit or license

#### Caging the canary

Threat Command researchers decided to register the network canary domain and observe how implants interacted with the previously unregistered domain. Once we registered the domain and pointed to our webhost, we were able to see infected systems checking into the network canary domain with a single GET request.

Follow: tcp,ascii Filter: tcp.stream eq 1077 Node 0: REDACTED:60118 Node 1: REDACTED:80 170 GET // HTTP/1.1 User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0 Host: www.creamp1eonlyfans\[.\]net Cache-Control: no-cache

Now that the domain can be reached, the loader assumes it is in a sandbox and crashes itself to prevent analysis; which also means their infections have not moved past the initial access.

At the time of this writing, we have observed **1,515 infected** systems attempting to check into the network canary domain - **98.75%** are from Brazil, confirming earlier reporting on victimology. The number of infected systems is accelerating rapidly, indicating this campaign was just beginning.

![Map showing infected hosts attempting to check into the canary domain  So while these systems are still infected with the final component of KREMLIN, this has temporarily degraded and manipulated the campaign's defense mechanisms and could provide defenders with additional time to identify and remediate infected endpoints. ](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3f2db64a952e3f87.png)

Map showing infected hosts attempting to check into the canary domain

So while these systems are still infected with the final component of KREMLIN, this has temporarily degraded and manipulated the campaign's defense mechanisms and could provide defenders with additional time to identify and remediate infected endpoints.

## Indicators of compromise

These indicators are also available for download [here](https://github.com/elastic/labs-releases/tree/main/indicators/kremlin).

## MITRE ATT&CK tactics and techniques

Elastic uses the MITRE ATT&CK framework to document common tactics, techniques, and procedures that threats use against enterprise networks.

### Tactics

Tactics represent the why of a technique or sub-technique. It is the adversary's tactical goal: the reason for performing an action.

-   [Resource Development](https://attack.mitre.org/tactics/TA0042/)
    
-   [Execution](https://attack.mitre.org/tactics/TA0002/)
    
-   [Persistence](https://attack.mitre.org/tactics/TA0003/)
    
-   [Stealth](https://attack.mitre.org/tactics/TA0005/)
    
-   [Credential Access](https://attack.mitre.org/tactics/TA0006/)
    
-   [Discovery](https://attack.mitre.org/tactics/TA0007/)
    
-   [Collection](https://attack.mitre.org/tactics/TA0009/)
    
-   [Command and Control](https://attack.mitre.org/tactics/TA0011/)
    
-   [Exfiltration](https://attack.mitre.org/tactics/TA0010/)
    

### Techniques

Techniques represent how an adversary achieves a tactical goal by performing an action.

-   [Stage Capabilities: Upload Malware](https://attack.mitre.org/techniques/T1608/001/)
    
-   [User Execution: Malicious File](https://attack.mitre.org/techniques/T1204/002/)
    
-   [Command and Scripting Interpreter: JavaScript](https://attack.mitre.org/techniques/T1059/007/)
    
-   [Command and Scripting Interpreter: PowerShell](https://attack.mitre.org/techniques/T1059/001/)
    
-   [Windows Management Instrumentation](https://attack.mitre.org/techniques/T1047/)
    
-   [Scheduled Task/Job: Scheduled Task](https://attack.mitre.org/techniques/T1053/005/)
    
-   [Native API](https://attack.mitre.org/techniques/T1106/)
    
-   [Software Extensions: Browser Extensions](https://attack.mitre.org/techniques/T1176/001/)
    
-   [Process Injection](https://attack.mitre.org/techniques/T1055/)
    
-   [Reflective Code Loading](https://attack.mitre.org/techniques/T1620/)
    
-   [Obfuscated Files or Information: Embedded Payloads](https://attack.mitre.org/techniques/T1027/009/)
    
-   [Obfuscated Files or Information: Encrypted/Encoded File](https://attack.mitre.org/techniques/T1027/013/)
    
-   [Obfuscated Files or Information: Dynamic API Resolution](https://attack.mitre.org/techniques/T1027/007/)
    
-   [Deobfuscate/Decode Files or Information](https://attack.mitre.org/techniques/T1140/)
    
-   [Virtualization/Sandbox Evasion: System Checks](https://attack.mitre.org/techniques/T1497/001/)
    
-   [Hijack Execution Flow: DLL](https://attack.mitre.org/techniques/T1574/001/)
    
-   [Masquerading: Masquerade Task or Service](https://attack.mitre.org/techniques/T1036/004/)
    
-   [Masquerading: Match Legitimate Resource Name or Location](https://attack.mitre.org/techniques/T1036/005/)
    
-   [Masquerading: Masquerade File Type](https://attack.mitre.org/techniques/T1036/008/)
    
-   [Indicator Removal: File Deletion](https://attack.mitre.org/techniques/T1070/004/)
    
-   [Process Discovery](https://attack.mitre.org/techniques/T1057/)
    
-   [File and Directory Discovery](https://attack.mitre.org/techniques/T1083/)
    
-   [System Owner/User Discovery](https://attack.mitre.org/techniques/T1033/)
    
-   [System Information Discovery](https://attack.mitre.org/techniques/T1082/)
    
-   [Software Discovery: Security Software Discovery](https://attack.mitre.org/techniques/T1518/001/)
    
-   [Browser Information Discovery](https://attack.mitre.org/techniques/T1217/)
    
-   [Credentials from Password Stores: Credentials from Web Browsers](https://attack.mitre.org/techniques/T1555/003/)
    
-   [Input Capture: Keylogging](https://attack.mitre.org/techniques/T1056/001/)
    
-   [Steal Web Session Cookie](https://attack.mitre.org/techniques/T1539/)
    
-   [Browser Session Hijacking](https://attack.mitre.org/techniques/T1185/)
    
-   [Data from Local System](https://attack.mitre.org/techniques/T1005/)
    
-   [Automated Collection](https://attack.mitre.org/techniques/T1119/)
    
-   [Screen Capture](https://attack.mitre.org/techniques/T1113/)
    
-   [Archive Collected Data: Archive via Library](https://attack.mitre.org/techniques/T1560/002/)
    
-   [Ingress Tool Transfer](https://attack.mitre.org/techniques/T1105/)
    
-   [Application Layer Protocol: Web Protocols](https://attack.mitre.org/techniques/T1071/001/)
    
-   [Web Service: Dead Drop Resolver](https://attack.mitre.org/techniques/T1102/001/)
    
-   [Encrypted Channel: Symmetric Cryptography](https://attack.mitre.org/techniques/T1573/001/)
    
-   [Data Encoding: Standard Encoding](https://attack.mitre.org/techniques/T1132/001/)
    
-   [Data Obfuscation: Protocol or Service Impersonation](https://attack.mitre.org/techniques/T1001/003/)
    
-   [Exfiltration Over C2 Channel](https://attack.mitre.org/techniques/T1041/)
