---
title: "Jigsaw RDPuzzle: Piecing Attacker Actions Together | Insinuator.net - Bold Statements"
source: https://insinuator.net/2025/01/jigsaw-rdpuzzle/
source_host: insinuator.net
clip_date: 2026-09-30T10:19:38+08:00
trace_id: 6a29c6ce-bc45-4b86-9097-0af7c3c5d2e0
content_hash: 34c853a1e42ff7c7d2631da066b01691b56f54019e6eca7e3be2239c875d5f46
status: synced
tags:
  - Windows逆向
  - 恶意样本
series: null
feed_source: ERNW Insinuator
ai_summary: RDP 位图缓存会留存远程会话的屏幕瓦片，解析后可还原攻击者通过 RDP 横向移动时的操作画面，本文给出文件格式、工具链与实战案例。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3eb75244-d011-8188-965e-c729b3888511
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> RDP 位图缓存会留存远程会话的屏幕瓦片，解析后可还原攻击者通过 RDP 横向移动时的操作画面，本文给出文件格式、工具链与实战案例。
> 
> - **证据位置：** 缓存存于发起连接的客户端，路径为 `%USERPROFILE%\AppData\Local\Microsoft\Terminal Server Client\Cache`（XP 为 Local Settings），含老格式 `bcache*.bmc` 与新格式 `Cache*.bin`。
> - **文件结构：** `Cache*.bin` 为 12 字节头（8 字节签名 `RDP8bmp` + 4 字节版本），其后每个 64×64、32BPP 瓦片占 12 字节头（8 字节持久缓存键 + 2 字节宽 + 2 字节高）加 16384 字节位图数据。
> - **工具链：** ANSSI 的 `BMC-Tools` 解析并导出 BMP（支持 `--bitmap` 生成拼图），BSI 的 `RdpCacheStitcher` 用 GUI 与启发式把瓦片拼回屏幕画面。
> - **实战案例：** 实际事件中还原出 `certutil.exe` 下载 a.bat 的完整 URL、任务列表、攻击者私密浏览的登录页，以及复制 `svchost.exe` 到 `C:\Users\Public\Downloads`、后续外连 RDP。
> - **局限：** 仅存部分屏幕片段，无位置/时间/会话归属信息；视频回放可能误导；缓存只在发起端，攻击者自带机器发起则无法取证，且获取内容有很大运气成分。

In a recent incident response project, we had the chance to virtually look over the attackers’ shoulder and observe their activities. The attackers used the Remote Desktop Protocol (RDP) for lateral movement within the compromized environment and beyond (MITRE techniques [T1570](https://attack.mitre.org/techniques/T1570/), [T1021](https://attack.mitre.org/techniques/T1021/001/)). As a matter of fact, RDP creates cache files that contain tiles of the transferred screen recording data. While this fact is well-known and there are existing tools, we found it worth reporting because of two different aspects:

-   On the one hand, we want to raise awareness for this valuable piece of evidence, explain how it works, how tooling works and how it can be used. In this particular case, the analysis of those cache files yielded valuable insights into the attackers’ activity and allowed further measures.
-   On the other hand, we found it exciting to look over the attacker’s shoulder, see the desktop as they saw it, and the commands they typed. We want to share parts of those insights as far as we are able to show them publicly.

## The Incident

We investigated an incident with a customer who acted as a service provider for his customers and was using RDP to connect to their customers’ machines. We already knew the attacker had admin privileges on the terminal server used to launch these outgoing RDP connections. There was evidence that the attacker had also launched outgoing RDP connections: network flow logs, the logs of their terminal server management software, and one of the targeted customers already had alerts about a suspicious `.bat` file appearing on their machines. Our customer wanted to know more about the attacker targeting their customers.

We leveraged a quite valuable RDP connection artifact to better answer the question. Originally designed to optimize performance by caching screen contents for smoother user experiences, the Bitmap Cache contains fragments of the remote display rendered in the course of RDP sessions. Analysis of the stored bitmap fragments allowed us to gain a first-person view of the threat actor’s activities.

## about:RDP

The Remote Desktop Protocol (RDP) is widely used to connect to and control another computer over a network, providing full access to its desktop and resources. First introduced in Windows NT 4.0, it is based on and extends the T-120 protocol standards governed by the International Telecommunication Union Telecommunication Standardization Sector (ITU-T).

Microsoft publishes the RDP specification as part of its Open Specifications program [1](#fn:1) under the `[MS-RDPBCGR]` abbreviation (*Remote Desktop Protocol: Basic Connectivity and Graphics Remoting*) [2](#fn:2). As defined in `[MS-RDPBCGR]`, RDP is designed to:

> \[…\] facilitate user interaction with a remote computer system by transferring graphics display information from the remote computer to the user and transporting input from the user to the remote computer, where it may be injected locally.

The RDP protocol is further extended by multiple other protocols [3](#fn:3):

-   Licensing Extension `[MS-RDPELE]`
-   Session Selection Extension `[MS-RDPEPS]`
-   **Graphics Device Interface (GDI) Acceleration Extensions `[MS-RDPEGDI]`**
-   Desktop Composition Extension `[MS-RDPEDC]`
-   Remote Programs Virtual Channel Extension `[MS-RDPERP]`
-   NSCodec Extension `[MS-RDPNSC]`
-   RemoteFX Codec Extension `[MS-RDPRFX]`

As graphics remoting is bandwidth-intensive, `[MS-RDPEGDI]` aims to reduce the amount of transferred data by encoding the drawing operations that produce an image instead of encoding the actual image. Additionally, RDP traffic is further reduced by employing bitmap caches to avoid the repeated transmission of identical graphical elements over the network.

## Bitmap Caches – Theory

Bitmap caches store graphic bitmaps during an RDP session between the client and server. The rationale behind their use is simple: the server should not resend bitmaps already known to the client.

Each cache is designed to hold bitmaps of a specific size in pixels, referred to as the “tile size”. When a bitmap exceeds the size of a single cache entry, the server employs a tiling algorithm to divide the bitmap into smaller tiles that fit within the cache. These tiles are then stored individually in the cache.

The contents of bitmap caches, stored on the client side, are updated by means of the server sending *Cache Bitmap – Revision 1/2/3 Secondary Drawing Orders (SDO)* messages to the client [4](#fn:4). First-revision SDO cache bitmap messages only support memory-based bitmap caching (*Revision 1 bitmap caches*), whereas the second- and third-revision SDO messages support persistent disk caching (*Revision 2 bitmap caches*). The in-memory bitmap cache is not reused past an RDP session’s end. In contrast, the persistent bitmap cache is valid beyond the end of a particular session and is reused for future ones.

As seen in Figure 1, persistent caching is enabled by default in the *Microsoft Terminal Service Client* (`mstsc.exe`), also known as *Remote Desktop Connection*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d79c4b6422db582d.png)

Figure 1: Persistent bitmap caching is enabled by default in mstsc.exe

Revision 2 bitmap caches enable support for persistent disk caching via the so-called *persistent bitmap cache key*. Cache bitmap revision 2 and 3 SDO messages (i.e., `CACHE_BITMAP_REV2_ORDER` and `CACHE_BITMAP_REV3_ORDER`) contain a 64-bit key derived from a cryptographic hash of the bitmap contents associated with each bitmap. On subsequent connections, the client sends these keys so the server can maintain its cache of bitmap keys already known to the client.

## Bitmap Caches – In Practice

Depending on the Windows version in use, the bitmap cache files are stored in:

-   Until Windows XP: `%USERPROFILE%\Local Settings\Application Data\Microsoft\Terminal Server Client\Cache`
-   Windows Vista, 7 and above: `%USERPROFILE%\AppData\Local\Microsoft\Terminal Server Client\Cache`

Two file types with the following naming could be encountered: `bcache*.bmc` and `Cache*.bin`.

The former is an older file format which stores cached bitmaps of different image quality, measured in Bits Per Pixel (BPP), in distinct files. Namely, graphical elements with 8, 16, and 32 BPP are stored in `bcache2.bmc`, `bcache22.bmc`, and `bcache24.bmc`, respectively. `bcache*.bmc` files are known to reach a size of up to 20 MB and are created alongside `Cache*.bin` files on machines running Windows 7 [5](#fn:5).

The newer file format (present on Windows 7 and above) is particularly interesting. It stores 64 x 64-pixel bitmaps with up to 32 BPP. The first bitmap cache file name to be created is `Cache0000.bin`, and subsequent files are “incremented by one” (e.g., Cache0001.bin, Cache0002.bin, etc.). Each file is known to reach a size of up to 100 MB.

Consider the below excerpt from the `hexdump` output of an example `Cache0000.bin` persistent bitmap cache from a Windows 11 machine:

```
$ hexdump -C Cache0000.bin | head
00000000  52 44 50 38 62 6d 70 00  06 00 00 00 1e c8 e1 a9  |RDP8bmp.........|
00000010  e2 b5 cc 89 40 00 40 00  ff ff ff ff ff ff ff ff  |....@.@.........|
00000020  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff  |................|
*
000000e0  ff ff ff ff ff ff ff ff  ff ff ff ff b9 b9 e8 ff  |................|
000000f0  23 23 cb ff 0d 0d c5 ff  0d 0d c5 ff 0d 0d c5 ff  |##..............|
00000100  0d 0d c5 ff 0d 0d c5 ff  0d 0d c5 ff 0d 0d c5 ff  |................|
00000110  0d 0d c5 ff 0d 0d c5 ff  ff ff ff ff ff ff ff ff  |................|
00000120  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff  |................|
*
[...]
```

`Cache*.bin` files have a fixed 12-byte header. The first 8 bytes constitute the file signature: the character string `RDP8bmp`, terminated by a null byte [6](#fn:6). The remaining 4 bytes hold versioning information.

Cache entries follow the header directly, meaning the first begins at offset `0xC`. Each graphical element has a 12-byte header which precedes the bitmap file contents:

-   the first 8 bytes encode the persistent bitmap cache key (e.g., `1e c8 e1 a9 e2 b5 cc 89`),
-   the next 2 bytes store the bitmap width (e.g., `40 00`), and
-   the last 2 bytes hold the bitmap height (e.g., `40 00`).

The raw bitmap bytes follow the header. These can be directly copied into a BMP file according to the specifications of the BMP file format (i.e., from bottom to top and from left to right). The stored bitmap graphics are in 32 BPP format. We can check this by calculating the offset of the second graphical element. For this, we need to take the following into account:

-   `0xC` (12 decimal) bytes for the container file (`.bin`) header
-   `0xC` (12 decimal) bytes for the first bitmap header
-   `0x4000` (16384 decimal) bytes for the first bitmap file contents
    -   64 bytes (width) \* 64 bytes (height) \* 4 bytes (32 bits per pixel) = 16384 bytes

Therefore, we should find the start of the second element at `0xC` + `0xC` + `0x4000` = `0x4018`. As can be seen from the expanded `hexdump` output excerpt of the same `Cache0000.bin` example file below, the header of the second bitmap does indeed begin at `0x4018`. The first 8 bytes hold the key (i.e., `58 64 3d 42 99 23 0d 7e`), followed by another 4 bytes for the width and height of the graphical element (i.e., `40 00 40 00`).

```
$ hexdump -C Cache0000.bin
00000000  52 44 50 38 62 6d 70 00  06 00 00 00 1e c8 e1 a9  |RDP8bmp.........|
00000010  e2 b5 cc 89 40 00 40 00  ff ff ff ff ff ff ff ff  |....@.@.........|
00000020  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff  |................|
*
000000e0  ff ff ff ff ff ff ff ff  ff ff ff ff b9 b9 e8 ff  |................|
000000f0  23 23 cb ff 0d 0d c5 ff  0d 0d c5 ff 0d 0d c5 ff  |##..............|
00000100  0d 0d c5 ff 0d 0d c5 ff  0d 0d c5 ff 0d 0d c5 ff  |................|
00000110  0d 0d c5 ff 0d 0d c5 ff  ff ff ff ff ff ff ff ff  |................|
00000120  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff  |................|
*
000001e0  ff ff ff ff ff ff ff ff  c1 c1 ec ff 23 23 ca ff  |............##..|
000001f0  0d 0d c5 ff 52 52 d5 ff  16 16 c7 ff 23 23 ca ff  |....RR......##..|
00000200  4b 4b d4 ff 1d 1d c8 ff  15 15 c7 ff 49 49 d3 ff  |KK..........II..|
[...]
00003420  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff  |................|
*
000034e0  ff ff ff ff ff ff ff ff  ff ff ff ff c6 ff ff ff  |................|
000034f0  49 49 87 ff 49 49 49 ff  87 49 49 ff ff ff c6 ff  |II..III..II.....|
00003500  ff ff ff ff ff ff ff ff  49 87 c6 ff 49 49 49 ff  |........I...III.|
00003510  49 49 49 ff ff c6 87 ff  ff ff ff ff ff ff ff ff  |III.............|
00003520  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff  |................|
*
000035f0  49 87 c6 ff 49 49 49 ff  c6 87 49 ff ff ff ff ff  |I...III...I.....|
00003600  ff ff ff ff ff ff ff ff  65 a9 e2 ff 49 49 49 ff  |........e...III.|
00003610  87 49 49 ff ff ff c6 ff  ff ff ff ff ff ff ff ff  |.II.............|
00003620  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff  |................|
*
00004010  ff ff ff ff ff ff ff ff  58 64 3d 42 99 23 0d 7e  |........Xd=B.#.~|
00004020  40 00 40 00 0d 0d c5 ff  0d 0d c5 ff 0d 0d c5 ff  |@.@.............|
[...]
```

## You’re Only as Good as Your Tools…

Now that we understand and know where to look for RDP bitmap cache files, what’s next? Well, of course, we need a way to parse the cache files to extract the contained bitmap images.

Fortunately, the French National Agency for Information Systems Security (ANSSI) has developed and open-sourced an excellent tool for the job: `BMC-Tools` [7](#fn:7). It parses the RDP bitmap cache (supports both `bcache*.bmc` and `Cache*.bin` file formats) and outputs the RDP session fragments as BMP files into a directory of choice.

Here is what a `BMC-Tools` invocation looks like:

```yaml
> python .\bmc-tools.py -s "C:\Users\ernw\AppData\Local\Microsoft\Terminal Server Client\Cache" -d .\ernw_rdpuzzle\ -vv
[+++] Processing a directory...
[---] File 'C:\Users\ernw\AppData\Local\Microsoft\Terminal Server Client\Cache\Cache0000.bin' has been found.
[---] Subsequent header version: 6.
[===] Successfully loaded 'C:\Users\ernw\AppData\Local\Microsoft\Terminal Server Client\Cache\Cache0000.bin' as a .BIN container.
[+++] 100 tiles successfully extracted so far.
[+++] 200 tiles successfully extracted so far.
[+++] 300 tiles successfully extracted so far.
[+++] 400 tiles successfully extracted so far.
[+++] 500 tiles successfully extracted so far.
[+++] 600 tiles successfully extracted so far.
[+++] 700 tiles successfully extracted so far.
[+++] 800 tiles successfully extracted so far.
[+++] 900 tiles successfully extracted so far.
[+++] 1000 tiles successfully extracted so far.
[+++] 1100 tiles successfully extracted so far.
[...]
[+++] 5400 tiles successfully extracted so far.
[+++] 5500 tiles successfully extracted so far.
[+++] 5600 tiles successfully extracted so far.
[+++] 5700 tiles successfully extracted so far.
[+++] 5800 tiles successfully extracted so far.
[+++] 5900 tiles successfully extracted so far.
[+++] 6000 tiles successfully extracted so far.
[+++] 6100 tiles successfully extracted so far.
[+++] 6200 tiles successfully extracted so far.
[+++] 6300 tiles successfully extracted so far.
[+++] 6400 tiles successfully extracted so far.
[===] 6418 tiles successfully extracted in the end.
[===] Successfully exported 6418 files.
[...]
```

Parts of the contents of the `ernw_rdpuzzle` directory are shown below.

Additionally, `BMC-Tools` can create collages of the extracted BMP files per bitmap cache by specifying the `--bitmap` command line argument as shown in Figure 2.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8f94669527c41d86.png)

Figure 2: Generated collage of BMP files extracted from Cache0000.bin

At this point, the limitations of this artifact become apparent: The cache entries contain the bitmaps of transmitted tiles but no further information. We therefore don’t know:

-   Where on the screen a tile was located.
-   When a tile was added to the cache.
-   What session a tile belonged to.

Another tool is needed to effectively assemble the RDP session fragments into meaningful images. This time around, the German Federal Office for Information Security (BSI) has come through for us by providing the right tool for the task at hand – `RdpCacheStitcher` [8](#fn:8).

`RdpCacheStitcher` features a graphical user interface, as well as tile placement heuristics, to ease and speed up the puzzling of RDP session screen fragments back together. Figure 3 shows a partially reconstructed frame from an RDP session.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/04808ec9114a527d.png)

Figure 3: Partially-reconstructed RDP session frame in RdpCacheStitcher

In this instance (a test case on one of our lab machines), it was possible to reassemble parts of the Windows taskbar and an opened command prompt. The following valuable data can be obtained from the reconstructed image:

-   there was activity at least on January 13th, 2025, at 16:53,
-   the remote machine is running Windows 10 (OS Build 19045.4651),
-   commands `who` and `whoami` were executed, and
-   the logged-in user was `rdpuzzle`.

While this is a contrived example, a wealth of information can be gleaned from the RDP bitmap cache in real-world engagements, such as accessed applications, opened files, and viewed file system locations (e.g., directories, network shares, etc.).

Additionally, since frequently-occurring bitmap fragments from the rendered screen contents are cached, the longer the RDP session, the more information can be gained. Moreover, the RDP bitmap cache stores cross-session image fragments. Thus, it is possible to get glimpses of threat actor activity over a prolonged period of time, albeit with a significant manual effort.

## Real World Cases

So, how well does this work outside the lab? The following screenshots were reconstructed in actual incidents.

In the first example, it was possible to partly reconstruct a terminal window opened by the attacker. We can not only see that [certutil.exe](https://lolbas-project.github.io/lolbas/Binaries/Certutil/) was used to try to download a file, but we were also able to read the URL the file came from – a useful IoC.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ca91f50d5d7c5f1.jpg)

Figure 3: certutil.exe was used to download a.bat file

In another example it was possible to reconstruct the complete terminal window with all its content – here a task list output.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/008b491e96ba9373.jpg)

Figure 4: Task list in a terminal window

Here we can see that the attacker opened a web browser in private mode.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a1716b478360552.jpg)

Figure 5: A private browser tab opened by an attacker

Of the sites visited by the attacker, we can reconstruct this login page.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9d74c6782d6b69d6.jpg)

Figure 6: A login page accessed by the attacker in a web browser on the remote machine

A file named `svchost.exe` is copied to `C:\Users\Public\Downloads`.

![Figure 7: A file named svchost.exe is copied to C:\\Users\\Public\\Downloads.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b46db247d3f98822.jpg)

F i g u r e 7:A f i l e n a m e d s v c h o s t.e x e i s c o p i e d t o C:\\Users \\Public \\Downloads.

Figure 7: A file named svchost.exe is copied to C:\\Users\\Public\\Downloads.

And we can observe further RDP activity.

![Figure 8: Further outgoing RDP connections](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9152390020dbfdd5.jpg)

Figure 8: Further outgoing RDP connections

## Limitations

As already touched upon, RDP bitmap cache analysis is not a silver bullet for reconstructing malicious activity on compromised systems.

For one, the bitmap cache is designed for performance optimization purposes. It cannot fully capture user activity since it stores select fragments of on-screen content. Furthermore, the rendered content might not necessarily stem from processes running on the remote system. For instance, a rendering of a video showing an opened command prompt may mislead analysts regarding the commands executed on the investigated machine.

Another limitation is, that the RDP cache is stored on the host that initiated the session, as opposed to the target machine (i.e., the RDP server). Therefore, the initiating machine must be available for analysis. If an attacker establishes an RDP session from their machine, collecting the bitmap cache is not possible, as it is not stored on the target host.

And, as with many artifacts, luck also can be a factor: You cannot influence what data is saved in the cache and for how long. So it might be that the puzzled-together cache tiles reveal a useful IoC or other insights into the incident. However, if you are unlucky, all there is to find are fragments of desktop wallpapers.

## Conclusion

Despite the mentioned limitations, the RDP bitmap cache can provide valuable context to a investigation. Reconstructed screen fragments can uncover concrete actions that were not logged or directly evident from the analysis of other sources (e.g., Windows event logs).

There is a lot to be gained from correlating reconstructed threat actor activity with more traditional evidence sources (e.g., RDP-related registry entries, network logs, etc.), especially in lateral movement scenarios.

In our particular case, the effort was worth it to gain valuable insights and we hope you might find it useful, too.

Cheers!

Samer Al-Bakhlul, Justus Hoffmann, and Lucas Wenzel

1.  [https://learn.microsoft.com/en-us/openspecs/main/ms-openspeclp/](https://learn.microsoft.com/en-us/openspecs/main/ms-openspeclp/) [↩](#fnref:1 "return to article")
    
2.  [https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/) [↩](#fnref:2 "return to article")
    
3.  [https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/4da1342e-e6b7-4c68-9f85-09544a80eef3](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpbcgr/4da1342e-e6b7-4c68-9f85-09544a80eef3) [↩](#fnref:3 "return to article")
    
4.  Corresponding to `CACHE_BITMAP_REV1_ORDER`, `CACHE_BITMAP_REV2_ORDER`, and `CACHE_BITMAP_REV3_ORDER` in Microsoft notation. [↩](#fnref:4 "return to article")
    
5.  [https://www.allthingsdfir.com/do-you-even-bitmap-cache-bro/](https://www.allthingsdfir.com/do-you-even-bitmap-cache-bro/) [↩](#fnref:5 "return to article")
    
6.  [https://www.cert.ssi.gouv.fr/actualite/CERTFR-2016-ACT-017/](https://www.cert.ssi.gouv.fr/actualite/CERTFR-2016-ACT-017/) [↩](#fnref:6 "return to article")
    
7.  [https://github.com/ANSSI-FR/bmc-tools](https://github.com/ANSSI-FR/bmc-tools) [↩](#fnref:7 "return to article")
    
8.  [https://github.com/BSI-Bund/RdpCacheStitcher](https://github.com/BSI-Bund/RdpCacheStitcher) [↩](#fnref:8 "return to article")
