---
title: Tricks from the Past deployed via signed ChatGPT and Claude binaries
source: https://research.checkpoint.com/2026/tricks-from-the-past-deployed-via-signed-chatgpt-and-claude-binaries/
source_host: research.checkpoint.com
clip_date: 2026-10-28T08:30:29+08:00
trace_id: fd8fe8fa-5482-4d9c-8fa0-e00329ad0b07
content_hash: da5fd2f95c0138a78b4f6e78dcab654c9ab72cebe491802e9d33f150e320291e
status: synced
tags:
  - 恶意样本
  - 风控对抗
series: null
feed_source: Check Point Research
ai_summary: Yoba 恶意活动借伪造 ChatGPT/Claude 桌面应用在 GitHub 传播，通过 DLL 侧加载和 Telegram/DGA 隐蔽投送最终植入 XMRig 矿机。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 40775244-d011-8140-8995-e72181583266
ioc:
  cves: []
  cwes: []
  hashes:
    - 028bfd4c1041dc1f030c9480a463366e6089e661
    - 163c81187d8024123912c3c12d905fd5210afcb3
    - 17e8639a00bb32b10cb9cf0d292e9441456ce4bb
    - 1d0d1368b4d53f3a6322cf40e84e63db
    - 20238b36645fc63139a76b19a480c6a9166472fa
    - 22661f4bada8167fa0f410b75e53184998990abb
    - 249dae41d64583a6a9ebcb60e3ad36d6216dd6e4
    - 2ecb5548e9774a3d05e8669e8414dcc366929b79
    - 332e3b685e375aa44a5ec98511fc53be821df46a
    - 3fef1af3664429e621d3e0f9408cb5102ef02b84
    - 46ae1f147cf70d4df1471f0e9df46b654d11fe9c
    - 4ea5b71202b69fc27b06ef9ee3f6f51d6f7b8586
    - 55043ea6d102670c014e2be5a8197e70b7c201cb
    - 60aece343959a2e1840f6aaeffa38b73ed21af2c
    - 65a3ac8f341ae04982005fd2c4e83627a68793a3
    - 7467b6980440ec27c4e0a8d940672c9f24e14216
    - 79e87a6df59d68b2dbd2c43950df5663d671007c
    - 7dfcee02732ed89f1ddf25d1689863c26de3df15
    - 8777db31d8df78f36e4544a132d843dfb2a0f026
    - a44162645ceaa39c7106c49a3f36fd99ff8d8a00
    - aebceccb0f3303806c35a73da865b684594487c1
    - b5c2d20623d4e6647d06a42864edd8629f82c5c384b243fdaeeeca24b3873d64
    - ba8bd67d8898cf378d4f73821deb5657f4bb98df
    - bead5748d813a9828ddb7603a32e52aa15349768
    - c2b986704406d47dd88ee4e2fcffebc854ff2ce4
    - cf90c4599257e76984a199d98b1fd082b820a54d
    - dcde1f56048fa18657dc4820397592f7
    - e7c0e981f81447892995d01ed986c0b462a6f0c5
    - ea16728f6928dc77deaddee74a6e736dd5f24fc5
    - eeedc5c9007d7f01808285e0ae0c0b451bdba003
  domains:
    - dedyn.io
    - digit.dedyn.io
    - outlook.com
    - t.me
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Yoba 恶意活动借伪造 ChatGPT/Claude 桌面应用在 GitHub 传播，通过 DLL 侧加载和 Telegram/DGA 隐蔽投送最终植入 XMRig 矿机。
> 
> - **传播链路：** 伪装为 GPT-5.6 Sol、GPT-6 Astra、Claude Opus 的仓库 + GitHub.io 页面 + SEO 投毒引流；ZIP 内同时包含 OpenAI/Anthropic 官方签名 Setup.exe 和恶意 `winmm.dll`，借助 DLL 侧加载执行，检测率极低。
> - **YobaDropper（winmm.dll）：** 180 个导出仅留 `C3`+NOP，实际逻辑在 `DllEntryPoint`；用 DJB2 校验宿主名哈希（`0xE6C2F326`=Setup.exe）反沙箱，失败即 Sleep 200,000×5500ms（约12.73天）；按键盘布局 ID 区间 0x19–0x44 比特掩码 `0xEC0400C8401` 排除俄语等 CIS 语言（乌克兰 ID 0x22 例外）；解密密钥字符串 `IRANNUMBERONE`，释放 `%ProgramData%\WMProcess\wmpdui.dll` 并用计划任务持久化（作者伪装 Microsoft Corporation，Local System，开机延迟 PT3M）。
> - **YobaLoader 通信：** 访问 Telegram 频道 `t.me/yoba_fanclub`，下载频道头图，以最后50字节作 FNV 哈希种子经三词表 DGA 生成 `adjective-noun-verb-$digit.dedyn.io` 域名；再经 Google DoH 取 DNS TXT，Base64→Ed25519 验签（公钥 `b5c2d2…73d64`）→AES-ECB（密钥 `1d0d136…63db`）解出 Catbox 载荷 URL。
> - **最终载荷与执行方式：** 按 DNS 响应首字符选三种投递——注入 `svchost.exe`、落盘 exe（删除 Zone.Identifier）或隐藏 PowerShell 脚本；载荷为 XMRig 6.26.0，经本地 Tor SOCKS5（127.0.0.1:9550）连洋葱矿池 TLS 443，配 WinRing0 驱动、用户活动暂停（空闲240秒恢复）、互斥 `Local\WindowsSecurity`，donation=0。
> - **演进与归因：** 早期版本（2026年6月，宿主 Cursor.exe 哈希 0x56221573）曾用 Base64+XOR 两步解包、Startup 快捷键持久化、含反调试（枚举 DebugObject）与打分制反VM（阈值3/6），DGA 后缀 `.aber.ir`，仅排除俄罗斯；新版本剔除这些，只改 API 哈希种子为 0x1DEB 以分割哈希空间。时间戳与提交时区显示开发者主要活跃于 UTC-4，疑有俄罗斯背景。

## Key Points

-   **Check Point Research** discovered a campaign we track as **Yoba** where attackers abuse the popularity of AI tools such as ChatGPT and Claude, creating fake GitHub projects that pretend to be desktop applications like *GPT-5.6 Sol*, *GPT-6 Astra*, and *Claude Opus*.
-   The malware is placed next to legitimate, signed executables from OpenAI and Anthropic so it can be loaded indirectly, a technique commonly known as DLL sideloading, which is often used to bypass security protections.
-   This campaign demonstrates strong operational security (OPSEC) by avoiding dedicated command-and-control (C2) infrastructure and instead relying on Telegram, Tor, Catbox, and DNS over HTTPS (DoH).
-   The actor behind the campaign shows indicators that suggest Russian origins and appears to operate primarily in the UTC-4 time zone.

## Introduction

Over the past two months, we have been tracking a campaign that abuses the popularity of AI tools such as ChatGPT and Claude to spread a custom malware chain we call **Yoba**. The attackers use fake GitHub projects that pretend to be AI desktop applications like *GPT-5.6 Sol*, *GPT-6 Astra*, and *Claude Opus*. These projects look convincing and use real GitHub infrastructure, which helps them appear legitimate to potential victims. The website exhibits search-targeted content and suspicious installer-delivery tactics consistent with an SEO-poisoning lure.

Inside the installers, there is a malicious component we refer to as the **YobaDropper**. This dropper includes another component, the **YobaLoader**, which is responsible for contacting attacker-controlled infrastructure and fetching the final payload. In this report, we describe how victims are lured to these fake projects, how the YobaDropper and YobaLoader work together, and how the attackers ultimately use this chain to run unwanted software on infected systems.

![](https://research.checkpoint.com/wp-content/uploads/2026/10/Picture2-1-1024x396.png)

Figure 1 — GPT-6 Astra campaign, attack chain.

## GitHub Repositories

The initial access occurred via malicious GitHub repositories. The projects were impersonating ChatGPT and Claude related models, more specifically GPT-5.6 Sol, GPT-6 Astra, and Claude Opus. No manipulation of [fake engagement](https://research.checkpoint.com/2024/stargazers-ghost-network/) (stars/forks) was in place.

![](https://research.checkpoint.com/wp-content/uploads/2026/10/image-2-1024x659.png)

Figure 2 — GitHub repository.

Aside from the repositories, [GitHub.io](http://github.io/) pages were used to describe the capabilities of the software, while the malware was hosted as a release.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0ea0e0b23baf7aa4.png)

Figure 3 — GitHub.io page with links to malicious release.

These phishing landing pages contain download links that point directly to the malicious ZIP releases hosted on GitHub.

![](https://research.checkpoint.com/wp-content/uploads/2026/10/image-3-1024x750.png)

Figure 4 — Claude Opus GitHub\[.\]io page.

While the repositories do not show signs of fake engagement (such as artificially inflated stars or forks) that would promote them within GitHub’s own search, they still appear among the top results on Google. This is most likely due to SEO poisoning, where the attackers optimize titles, descriptions, and hosting domains to make their malicious projects rank highly in external search engines.

![](https://research.checkpoint.com/wp-content/uploads/2026/10/image2-1024x755.png)

Figure 5 — Google Search results.

Each repository uses a different email address (`edwardcarlsonmkym[@]outlook[.]com`, `daxschneiderdjuu[@]outlook[.]com`, and `rioprestonlfyx[@]outlook[.]com`), and the uploader appears to operate in **UTC+4**, **UTC-4**, and **UTC+3** respectively. This inconsistency likely reflects a deliberate attempt to obscure the threat actor’s true operational timezone.

Repositories’ initial commits:

```sql
Repository: /gpt-5-6/sol-free-desktop
==================================================
[2026-07-16T14:39:40Z] Author: gpt-5-6	
tree aebceccb0f3303806c35a73da865b684594487c1
author gpt-5-6 <edwardcarlsonmkym@outlook.com> 1784212780 +0400
committer GitHub <noreply@github.com> 1784212780 +0400

Initial commit
==================================================

Repository: /gpt-5-6/gpt-5-6.github.io
==================================================
[2026-07-16T14:44:31Z] Author: gpt-5-6	
tree 249dae41d64583a6a9ebcb60e3ad36d6216dd6e4
author gpt-5-6 <edwardcarlsonmkym@outlook.com> 1784213071 +0400
committer GitHub <noreply@github.com> 1784213071 +0400

Initial commit
==================================================

Repository: /opus-5-0/opus-5-0.github.io
==================================================
[2026-08-31T21:33:26Z] Author: opus-5-0	
tree 46ae1f147cf70d4df1471f0e9df46b654d11fe9c
author opus-5-0 <rioprestonlfyx@outlook.com> 1788212006 -0400
committer GitHub <noreply@github.com> 1788212006 -0400

Create readme.md
==================================================

Repository: /gpt-6-astra/gpt-6-astra.github.io
==================================================
[2026-09-04T22:56:13Z] Author: gpt-6-astra	
tree 028bfd4c1041dc1f030c9480a463366e6089e661
author gpt-6-astra <daxschneiderdjuu@outlook.com> 1788562573 +0300
committer GitHub <noreply@github.com> 1788562573 +0300

Initial commit
==================================================
```

Although the first repository was created around July 2026, the first two malicious releases were not uploaded until the end of August, and a third malicious release followed approximately five days later.

```bash
Release: /gpt-5-6/gpt-5-6.github.io/releases/tag/v5.6.0
[2026-08-30T19:15:44Z] gpt-5-6 Uploaded sol-setup.zip (application/zip) (269)
==================================================

Release: /opus-5-0/opus-5-0.github.io/releases/tag/Release_v5.0.0
[2026-08-31T21:38:13Z] opus-5-0 uploaded Setup-Claude.zip (application/zip) (82)
==================================================

Release: /gpt-6-astra/gpt-6-astra.github.io/releases/tag/Astra
[2026-09-04T23:14:11Z] gpt-6-astra Uploaded GPT-6-Astra-Setup.zip (application/zip) (352)
```

Malicious zip files hosted on GitHub and other legitimate platforms are usually **password-protected**, since this prevents automated tools from unpacking and therefore analyzing them. However, neither of these repositories used password protection, as the binaries already had very low detection rates thanks to their anti-sandbox and other anti-analysis techniques.

![](https://research.checkpoint.com/wp-content/uploads/2026/10/image-1-2-1024x226.png)

Figure 6 — Low detection rate.

While the two ChatGPT-related releases and their repositories were created about five days apart, the ZIP files contain mostly the same files, including the malicious components, and they maintain the same IoCs.

| Filename | sol-setup.zip (ChatGPT) | GPT-6-Astra-Setup.zip |
| --- | --- | --- |
| 151.0.7922.174.manifest | 2026-08-30 15:11:18 | N/A |
| D3dx9_41.dll | N/A | 2021-10-18 17:58:06 |
| owl-shell-runtime.json | 2026-08-30 15:11:18 | 2026-08-30 15:11:18 |
| Setup.exe | 2026-08-30 15:11:18 | 2026-08-30 15:11:18 |
| snapshot_blob.bin | 2026-08-30 15:11:18 | 2026-08-30 15:11:18 |
| v8_context_snapshot.bin | 2026-08-30 15:11:18 | 2026-08-30 15:11:18 |
| vk_swiftshader.dll | 2026-08-30 15:11:18 | 2026-08-30 15:11:18 |
| vk_swiftshader_icd.json | 2026-08-30 15:11:18 | 2026-08-30 15:11:18 |
| vulkan-1.dll | 2026-08-30 15:11:18 | 2026-08-30 15:11:18 |
| **winmm.dll** | **2026-08-30 15:14:20** | **2026-08-30 15:14:20** |

By adding the compilation timestamps to this these time-related operations, we are able to determine which files appear to contain the malicious functionality without performing any initial analysis.

| Filename | Compilation Timestamp (UTC) |
| --- | --- |
| D3dx9_41.dll | 2076-06-18 21:48:40 |
| Setup.exe | 2026-08-19 20:00:27 |
| vk_swiftshader.dll | 2026-08-19 20:00:27 |
| vulkan-1.dll | 2026-08-19 20:00:27 |
| **winmm.dll** | **2026-08-30 19:14:19** |

The file that immediately stands out is `winmm.dll`, which was compiled the same day it was added to the ZIP archive. This suggests it is the component with the malicious functionality, while the other files serve to make the package appear legitimate. The compilation timestamp also indicates the actor is operating in the **UTC-4 timezone**.

Furthermore, `Setup.exe`, a legitimate signed OpenAI executable, is used during execution to sideload the malicious DLL. The `Setup-Claude.zip` file contains the same structure, though in this case `Setup.exe` is a legitimate signed Claude executable.

![](https://research.checkpoint.com/wp-content/uploads/2026/10/image1-1024x424.png)

Figure 7 — Signed OpenAI and Anthropic binaries.

## YobaDropper – winmm.dll

The malicious DLL contains multiple export names, suggesting that the legitimate `winmm.dll` has been spoofed. As in many other cases, these exports exist but their code has been stripped out, leaving them mostly empty and reducing the size of the binary.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f1f1323ee275e22f.png)

Figure 8 — Stripped code from exports.

All 180 exports contain just a return instruction (`C3`) followed by NOPs (`90`), and `DllEntryPoint` is the only one containing actual code.

### Anti-Analysis, Pre-Checks

The first function implements an anti-sandbox technique: the malware hashes the basename of its host executable and checks whether the checksum matches the hardcoded value `0xE6C2F326`. The hashing algorithm has been identified as DJB2, which other malware families have also used in the past. The malware expects to run under the name `Setup.exe`, so this check fails if the DLL is executed on its own inside a sandbox environment.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/989ead695ff5443d.png)

Figure 9 — DJB2 algorithm and hash check.

Although a failed check does not terminate the process, the DLL performs 200,000 iterations of `Sleep(5500)`, amounting to approximately 12.73 days, while repeatedly appending the decoded filler string `pddy` to a local UTF-16 buffer.

In the second function, the malware checks whether the infected user is located in a CIS country by inspecting the system’s keyboard layout. Ukraine was historically included in such checks, but it is not in the list used by recent malware.

The language check is unusual. Instead of comparing the victim’s keyboard language ID against hardcoded values, the malware checks whether the ID falls within the range `0x19` – `0x44`. For IDs in that range, it tests the corresponding bit in the bitmask `0xEC0400C8401` to determine whether the language belongs to a CIS-region country, with an explicit exception for ID `0x22` (Ukrainian). Bazarloader has used a similar technique in the past, with the bitmask `0xD8080190C03`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/263a91c1477fb2ad.png)

Figure 10 — Language checks.

Language IDs excluded from the infection:

| **Russian** | **Belarusian** | **Tajik** |
| --- | --- | --- |
| **Armenian** | **Azerbaijani** | **Georgian** |
| **Kazakh** | **Kyrgyz** | **Turkmen** |
| **Uzbek** | **Tatar** |     |

The malware continues to resolve Windows API functions dynamically from `kernel32.dll` and `ntdll.dll` by comparing hashes of the exported function names. The hashing algorithm is again DJB2, with the initial value `0x1505`.

The last check before the malware unpacks and deploys the embedded payload tests whether the process is running with administrator privileges. If it is not, the malware displays the message *“Please run this program as Administrator.”* to the victim and terminates itself, requiring the user to rerun it with elevated privileges.

### Deploying Phase

The dropper contains multiple XOR-encrypted strings that are decrypted when needed. These strings include the file paths where the embedded binaries are dropped, as well as the decryption keys.

It creates a directory under `ProgramData` named `WMProcess`. Then it copies the original `WMPDMC.exe` from `System32` into this newly created folder. Next, it decrypts the embedded payload using the string `IRANNUMBERONE` as the XOR seed and drops the decrypted payload in the same folder under the name `wmpdui.dll`.

Using scheduled tasks, the dropper maintains persistence by leveraging the legitimate executable, which will sideload the malicious payload. To make the task appear legitimate, it sets the author to `Microsoft Corporation` and the description to `Collects device metadata for Windows Media Player.`. It also sets the boot-trigger delay to `PT3M`, which corresponds to a 3-minute delay after system startup, and configures the task to run under the `Local System` account (`S-1-5-18`).

## YobaLoader – wmpdui.dll

The second-stage payload contains the same code as the dropper, which indicates that the same developer is responsible for both components.

The same anti-sandbox technique is used, forcing the malware to be run only by `WMPDMC.exe`. It again checks the hash of the process basename, and only continues execution if this value matches the hardcoded hash `0x552751E3`.

The dropper uses the DJB2 hashing algorithm to hash and verify the process name and to resolve Windows API functions, both with the same seed **`0x1505`**. The loader (YobaLoader) also uses DJB2 for the process name with the same seed as the dropper, but for resolving Windows API functions it uses a different seed, **`0x1DEB`**.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/30fa614cbc874260.png)

Figure 11 — Hashing windows API functions.

The developer reused the same string-hashing algorithm but changed the seed (`0x1505` in the dropper, `0x1DEB` in the loader) to separate the hash spaces for each stage, complicating analysis, and reducing the effectiveness of hash-based detection and automated tooling.

### Network

The downloader uses an interesting process to obtain the next-stage payload. It first decrypts multiple strings using a simple XOR operation, among these strings is the URL of a Telegram channel, `t[.]me/yoba_fanclub`. It then visits this channel using the user-agent string `Mozilla/5.0 (Windows NT 10.0; Win64;)` and parses the HTML source to extract the `src` URL of the element with the class `tgme_page_photo_image`. This class refers to the location where the channel’s profile image is hosted.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/96fcd3ebdd3f2579.png)

Figure 12 — Telegram channel.

It downloads the image and uses the last 50 bytes as a seed to generate a domain based on three lists of dictionary words, which are decrypted as part of the DGA algorithm. This DGA algorithm uses three sets of strings:

1.  Adjectives
2.  Nouns
3.  Verbs

Finally, it generates and appends an integer value in the range `0–999`. The generated domain has the following format, `"$adjective-$noun-$verb-$digit.dedyn[.]io"`. By changing the image of the Telegram channel, a new domain can be generated.

The following Python snippet represents the DGA algorithm:

```python
"""
Author: @Tera0017/Check Point Research
"""
from pathlib import Path
import sys

ADJECTIVES = [
    "silver", "amber", "wild", "tiny", "brave", "lucky", "calm",
    "sharp", "swift", "bright", "quiet", "bold", "gentle", "fierce",
    "royal", "mystic", "username", "degenerate", "allblack", "kizta",
    "graf",
]
NOUNS = [
    "tiger", "river", "stone", "cloud", "wolf", "ocean", "forest",
    "mountain", "eagle", "raven", "ember", "comet", "fox", "dragon",
    "piano", "viper", "yoba", "yyoba", "static", "cpp", "example",
]
VERBS = [
    "runs", "jumps", "sings", "sleeps", "flies", "hunts", "burns",
    "floats", "shines", "whispers", "roars", "dreams", "strikes",
    "glides", "watches", "hides", "duty", "free",
]

FNV_MULTIPLIER = 0x1000193
MASK64 = 0xFFFFFFFFFFFFFFFF

def hash_bytes(data: bytes, seed: int) -> int:
    value = seed
    for byte in data:
        value = ((value ^ byte) * FNV_MULTIPLIER) & MASK64
    return value

def generate_domain(image_path: str) -> str:
    image = Path(image_path).read_bytes()
    if len(image) < 50:
        raise ValueError("Image must contain at least 50 bytes")

    tail = image[-50:]

    adjective = ADJECTIVES[hash_bytes(tail, 0x811C9DC5) % len(ADJECTIVES)]
    noun = NOUNS[hash_bytes(tail, 0xAF0154A5) % len(NOUNS)]
    verb = VERBS[hash_bytes(tail, 0xFE5439E4) % len(VERBS)]
    number = hash_bytes(tail, 0xFFA7471A) % 1000

    return f"{adjective}-{noun}-{verb}-{number}.dedyn[.]io"

if __name__ == "__main__":
    image_file = sys.argv[1]
    print(generate_domain(image_file))

```

It then queries Google’s DNS-over-HTTPS (DoH) API to obtain an encrypted command from a DNS TXT record, using a URL of the form `https://dns[.]google/resolve?name=$DGA&type=TXT`.

By relying on a DoH service and common file-hosting platforms, the actor aims to bypass passive DNS monitoring and some gateway-based security protections, making their command-and-control traffic harder to distinguish from regular user activity.

![](https://research.checkpoint.com/wp-content/uploads/2026/10/image-8-1024x321.png)

Figure 13 — DNS TXT record, base64 encoded data.

It decodes the Base64-encoded `data` field from the JSON response and validates it using Ed25519 signature verification with the public key `b5c2d20623d4e6647d06a42864edd8629f82c5c384b243fdaeeeca24b3873d64`. Once the signature validation succeeds, it decrypts the decoded value using AES in ECB mode with the key `1d0d1368b4d53f3a6322cf40e84e63db`.

Decrypted response: `1https://files.catbox[.]moe/z5zpy9.dat`

The downloader retrieves the encrypted payload and decrypts it using the same AES key and ECB mode that were previously used for the DNS data.

The malware provides three methods for deploying the downloaded payload. The selected method is indicated by the first character of the decrypted response that follows the URL (1/2/3):

1.  Injects the downloaded payload into `svchost.exe` (NtWriteVirtualMemory/NtCreateThreadEx). It enumerates running processes and, using the hashing algorithm with the seed `0x1DEB`, searches for the hash value `0xC26CDEA5`, which corresponds to `svchost.exe`.
2.  Saves the payload as a `%TEMP%\$10_rand_char\$10_rand_char.exe` file and executes it. Before running the executable, the downloader removes the `Zone.Identifier` alternate data stream, which is hidden metadata used by Windows to track the origin of downloaded files.
3.  Saves the payload as a `%TEMP%\$10_rand_char\$10_rand_char.ps1` PowerShell script and invokes it with the following parameters: `-WindowStyle Hidden -ExecutionPolicy Bypass -File`.

Finally, the injected payload into `svchost.exe` is an XMRig 6.26.0 miner with a hidden command line targeting a TLS-enabled onion mining endpoint through a local Tor SOCKS5 proxy. It can unpack and start Tor 0.4.9.12 plus lyrebird 0.8.1, monitor user-input activity to pause mining, and conditionally load the WinRing0 driver service for MSR-based mining optimization.

| Field | Value |
| --- | --- |
| Mining server | `3zciedc3enu4muwc5adxciyk6u3juhvhvbv6bfrk2arawlvb7k7ovxad[.]onion:443` |
| Pool password/token | `dcde1f56048fa18657dc4820397592f7` |
| TLS | Enabled (`--tls`) |
| Proxy | `socks5://127.0.0[.]1:9550` |
| Donation level | `0` |
| CPU thread hint | `85%` |
| User-active pause | Resume after 240 seconds idle |
| Singleton mutex | `Local\WindowsSecurity` |
| Tor data directory | `%TEMP%\torbundle\data` |
| Tor bridge 1 | `obfs4 51.89.231[.]85:24526 A44162645CEAA39C7106C49A3F36FD99FF8D8A00 cert=cVNRBh1enpvEGxA0ouu568EDFhWPl9taldydYgiJk77OX4MzoYIRz3qx4q7yHL5bRN60Gg iat-mode=0` |
| Tor bridge 2 | `obfs4 51.89.228[.]250:21668 BA8BD67D8898CF378D4F73821DEB5657F4BB98DF cert=bEpLLgOwJ9fOJbeHb5r+ronUF2ck5nRd0Jl3zuy7rLoUp732QK2p/CUHjTAfBPCGfcVtSA iat-mode=0` |

Although we observed an XMRig cryptominer as the final payload in this campaign, the YobaLoader is a generic loader. The operator can supply any PE or PowerShell payload via the signed DNS TXT tasking, so future waves may deliver different malware families.

## Past Yoba Versions

Yoba exposes, through the same hashing algorithm it uses for anti-analysis, the specific process name under which it expects to run. Even without having full visibility into the campaign from the very beginning, analysts can still infer which targeted software was used to lure users by correlating this expected process name with the fake AI applications promoted on the associated GitHub repositories and GitHub Pages sites.

| Hash | Process | Product |
| --- | --- | --- |
| **0xE6C2F326** | Setup.exe | ChatGPT & Claude Opus |
| **0x56221573** | Cursor.exe | Cursor AI Coding Agent |
| **0x39DE0DD8** | Unknown | Unknown |

Earlier **YobaDropper** observed in the wild appeared in early June 2026. In this campaign, the dropper was sideloaded by a process named `Cursor.exe` (hash: `0x56221573`). It remains unclear whether `Cursor.exe` was a legitimate signed binary. The majority of the functionality in this early variant is consistent with the newer versions of both the dropper and the loader.

**YobaDropper** shows two main differences between its older and newer versions:

1.  **Unpacking logic:** In the oldest version, the buffer is first Base64-decoded and then XOR-decrypted to extract the **YobaLoader**. In the newer version, the developer removed the Base64-decoding step and performs only XOR decryption, simplifying the unpacking process.
2.  **Execution method:** The second change concerns how YobaLoader is triggered. The newer version uses Scheduled Tasks to start the copied legitimate host and sideload the loader, whereas the first discovered version creates the shortcut `msdefender_scheduler{7940-8490-6670-1081}.lnk` in the Startup folder. This shortcut executes a copied `%APPDATA%\Microsaft Difendir\msdtc.exe` and sideloads `%APPDATA%\Microsaft Difendir\mswsock.dll`.

Earlier version of **YobaLoader** contains language checks and excludes only Russia from infection. In later versions, these checks were moved to the dropper stage and expanded to exclude additional CIS countries, shifting regional filtering earlier in the infection chain.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f14730d0560d5622.png)

Figure 14 — Exclusion of Russian language from infection.

While the overall DGA logic remains the same, the early variant uses the extension `.aber[.]ir` instead of `.dedyn[.]io`. In addition, instead of injecting into `svchost.exe`, this variant injects into a different running process identified only by its hashed name `0x21BD94C2`.

The initial loader also implements several anti-analysis techniques that have been removed from the newer versions of the malware:

**1\. Anti-debugging**  
It enumerates all kernel object types and reads their `TypeName` values. Each type name is hashed using DJB2 with the seed `0x1DEB` until the hash matches `0xCF9EE149`, which corresponds to `DebugObject`. If a `DebugObject` is found, it indicates that a debugger is or was active, and in that case the malware terminates itself.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f84e212eaca1cedb.png)

Figure 15 — DebugObject via NtQueryObject-ObjectAllTypesInformation.

**2\. Anti-VM**  
The malware uses a VM/sandbox-detection scoring function while running several hardware fingerprinting checks. The maximum score is 6, and the minimum required to continue the infection chain is 3. The checks include:

-   Hypervisor-present bit and CPUID timing (via `RDTSCP`).
-   Hypervisor vendor signature string (CPUID leaf `0x40000000`).
-   CPU brand string sanity checks (CPUID leaves `0x80000002` – `0x80000004`).
-   SMBIOS-based firmware fingerprinting (`GetSystemFirmwareTable` – `RSMB`)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e1041bae70886292.png)

Figure 16 — Hypervisor vendor signature string technique.

Despite these small differences in early anti-analysis behavior, the **Telegram** channel and the profile image used as the seed for the DGA remain the same as in the newer variants, indicating that the operator retained the same infrastructure while iterating on the loader’s evasion logic.

## Conclusion

The Yoba campaign shows how attackers can use trusted platforms and the current interest in AI tools to distribute malware in a way that looks believable and harmless at first glance. By packaging their code together with well-known software names and hosting it on GitHub, they lower the chances that users or basic security checks will immediately flag the files as suspicious.  
Although the underlying techniques are more advanced than typical commodity malware, the main goals remain straightforward: gain a foothold on the victim’s system, avoid easy detection, and then run the attacker’s chosen payload. Organizations should be cautious about installing “AI helpers” or similar tools from unverified repositories and should enforce policies that restrict running software from unknown sources. Combining user awareness with basic technical controls.

## Indicators of Compromise

| Description | Value |
| --- | --- |
| GitHub pages | github\[.\]com/gpt-5-6/sol-free-desktop  <br>gpt-5-6.github\[.\]io  <br>github\[.\]com/gpt-5-6/gpt-5-6.github.io  <br>github\[.\]com/gpt-6-astra/gpt-6-astra.github.io  <br>gpt-6-astra\[.\]github\[.\]io  <br>opus-5-0\[.\]github\[.\]io  <br>github\[.\]com/opus-5-0/opus-5-0.github\[.\]io |
| ZIP Files | 332e3b685e375aa44a5ec98511fc53be821df46a  <br>c2b986704406d47dd88ee4e2fcffebc854ff2ce4 |
| Signed OpenAI & Anthropic binaries | 163c81187d8024123912c3c12d905fd5210afcb3  <br>65a3ac8f341ae04982005fd2c4e83627a68793a3 |
|     |     |
| YobaDropper | 17e8639a00bb32b10cb9cf0d292e9441456ce4bb  <br>20238b36645fc63139a76b19a480c6a9166472fa  <br>4ea5b71202b69fc27b06ef9ee3f6f51d6f7b8586  <br>60aece343959a2e1840f6aaeffa38b73ed21af2c  <br>8777db31d8df78f36e4544a132d843dfb2a0f026 |
| YobaLoader | 22661f4bada8167fa0f410b75e53184998990abb  <br>2ecb5548e9774a3d05e8669e8414dcc366929b79  <br>3fef1af3664429e621d3e0f9408cb5102ef02b84  <br>55043ea6d102670c014e2be5a8197e70b7c201cb  <br>79e87a6df59d68b2dbd2c43950df5663d671007c  <br>7dfcee02732ed89f1ddf25d1689863c26de3df15  <br>bead5748d813a9828ddb7603a32e52aa15349768  <br>cf90c4599257e76984a199d98b1fd082b820a54d  <br>eeedc5c9007d7f01808285e0ae0c0b451bdba003 |
| Telegram image | e7c0e981f81447892995d01ed986c0b462a6f0c5 |
| Telegram Channel | t\[.\]me/yoba_fanclub |
| DNS | dns\[.\]google/resolve?name=calm-piano-floats-313.dedyn\[.\]io&type=TXT |
| ITW URL | files.catbox\[.\]moe/z5zpy9.dat |
| Encrypted Payload | 7467b6980440ec27c4e0a8d940672c9f24e14216 |
| Payload XMRIG | ea16728f6928dc77deaddee74a6e736dd5f24fc5 |
| XMRIG Endpoints | 3zciedc3enu4muwc5adxciyk6u3juhvhvbv6bfrk2arawlvb7k7ovxad\[.\]onion:443  <br>51.89.228\[.\]250:21668  <br>51.89.231\[.\]85:24526 |

## Yara Rules

```ruby
rule yoba_dropper
{
    meta:
        author = "@Tera0017/Check Point Research"
        description = "YobaDropper"
    strings:
        $code1 = {00 BB 40 0D 03 00 B9 7C 15 00 00 FF D6 31 C0}
        $code2 = {BA 05 15 00 00 0F BE 08 84 C9 74 0A 6B D2 21}
        $code3 = {53 B9 75 EE 40 70 48 83 EC 20}
        $code4 = {BA 5C CD 17 E5 48 89 C1 E8 73 00 00 00}
        $code5 = {0F C8 89 C0 4? 39 ?? 74 1? (49 0F AF C0| 48 69 C0 ?? ?? ?? ??) (4C 01 C8| 48 05 ?? ?? ?? ??) 49 89 C? 49 C1 E? 18 45 30 [2] 4? FF ?? EB}
    condition:
        uint16(0) == 0x5A4D and 2 of them
}

rule yoba_loader
{
    meta:
        author = "@Tera0017/Check Point Research"
        description = "YobaLoader"
    strings:
        $code1 = {B9 80 A8 12 01 FF ?? ?? E9}
        $code2 = {BA EB 1D 00 00 0F BE 08 84 C9 74 0A 6B D2 21}
        $code3 = {B9 5B 80 EF B7 E8}
        $code4 = {BA F5 8B 2E F2 48 89 C1}
        $code5 = {B5 C2 D2 06 23 D4 E6 64 7D 06 A4 28 64 ED D8 62 9F 82 C5 C3 84 B2 43 FD AE EE CA 24 B3 87 3D 64}
        $code6 = {1D 0D 13 68 B4 D5 3F 3A 63 22 CF 40 E8 4E 63 DB}
        $code7 = {40 80 FE 32 74 42 40 80 FE 33 74 66 40 80 FE 31}
        $code8 = {41 81 F8 A5 DE 6C C2}
    condition:
        uint16(0) == 0x5A4D and 2 of them
}
```

The post [Tricks from the Past deployed via signed ChatGPT and Claude binaries](https://research.checkpoint.com/2026/tricks-from-the-past-deployed-via-signed-chatgpt-and-claude-binaries/) appeared first on [Check Point Research](https://research.checkpoint.com/).
