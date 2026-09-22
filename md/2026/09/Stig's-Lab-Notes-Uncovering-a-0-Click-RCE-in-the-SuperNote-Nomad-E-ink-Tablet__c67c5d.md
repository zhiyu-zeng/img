---
title: Stig's Lab Notes | Uncovering a 0-Click RCE in the SuperNote Nomad E-ink Tablet
source: https://stigward.github.io/posts/supernote-nomad-0click-rce/
source_host: stigward.github.io
clip_date: 2026-09-22T10:35:21+08:00
trace_id: f410e88a-dcef-48df-b63b-1d43cfb53184
content_hash: 3bb34d9d25eb3cc2a10dab329cd851792b6f25e81e209b603cba786d874b4b91
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: Stigward·设备逆向
ai_summary: SuperNote Nomad 电纸书存在 0-click RCE：攻击者可利用未鉴权文件传输服务的路径穿越和逻辑竞态，向设备植入自动安装的恶意固件 rootkit（CVE-2025-32409）。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 17
  failed_urls:
    - https://static.wixstatic.com/media/82b748_a3fd6042d0db4b498f707a502678a967~mv2.png/v1/fill/w_740,h_490,al_c,q_90,usm_0.66_1.00_0.01,enc_avif,quality_auto/82b748_a3fd6042d0db4b498f707a502678a967~mv2.png
notion_page_id: 3e375244-d011-817a-b535-f9e2571ba660
ioc:
  cves:
    - CVE-2023-30257
    - CVE-2025-32409
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> SuperNote Nomad 电纸书存在 0-click RCE：攻击者可利用未鉴权文件传输服务的路径穿越和逻辑竞态，向设备植入自动安装的恶意固件 rootkit（CVE-2025-32409）。
> 
> - **攻击面定位：** 默认配置下 Nmap 扫描发现 60002 端口开放；固件未加密，逆向 SuperNoteLauncher.apk 找到 WiFiP2PService 的自定义 HTTP 服务（DeviceThread 类），靠 version、name、devicename 等自定义请求头控制行为，可无鉴权向设备 INBOX 目录上传文件。
> - **路径穿越写入：** 在 name 头中插入 `../` 可把文件写到 `/sdcard/EXPORT` 等任意路径，但服务端先建缓存文件再建目标文件，且文件名重复时自动追加 "(1)"，导致落地的是 `update(1).zip` 而非所需的 `update.zip`。
> - **利用链前提：** 设备在热插拔或重启时会自动检测并安装 EXPORT 目录下的合法 update.zip，且固件签名密钥是网上可查的调试密钥（新机型仅改名未换钥），因此可用 Multi Image Kitchen 重打包带 C 反弹 shell 后门的固件。
> - **竞态绕过重命名：** 服务端多线程且逐字节写入，先发一个极小的占位 `update.zip` 再紧接发送大体积恶意固件，占位文件先完成“创建-复制-删除”全流程腾出文件名，恶意固件在复制阶段恰好占用 `EXPORT/update.zip`。
> - **落地效果与披露：** 恶意更新在用户正常操作中自动触发，热插拔后的更新提示为“默认 30 秒自动安装、需手动点取消”的 opt-out 弹窗；研究方 2024 年 7 月报告，厂商 10 月回复称 12 月修复。

**Original research published on a company blog [here](https://www.prizmlabs.io/post/remote-rootkits-uncovering-a-0-click-rce-in-the-supernote-nomad-e-ink-tablet)**

## Overview:

Last year, popular E-Ink tablet vendor [Ratta Software](https://supernote.com/?srsltid=AfmBOorepWN3BO2e0u-Dt06zM5pFb1_2q-cAltdVxHU2wKIon0WtcJ0C) released the [SuperNote A6 X2 Nomad](https://supernote.com/products/supernote-nomad?srsltid=AfmBOop-tkBYaFOtxlwRqT74E3lyC5aV5tvKEzPdwuGEqww6UhyOrBk-) - a 7.8 inch tablet running Android 11 under the hood.

As productivity nerds, we picked one up in July of 2024 with the goal of using it for its intended purpose: note taking and academic paper reading. However, as hackers at heart, it took all of 24-hours before we abandoned that idea entirely and decided to poke at it.

What follows is a blog post detailing how we were able to chain a vulnerability and a handful of misconfigurations into a remotely installable, 0-click rootkit. A malicious attacker on the same network as the victim could fully compromise the target device without any user-interaction. EDIT: This issue was assigned to [CVE-2025-32409](https://nvd.nist.gov/vuln/detail/CVE-2025-32409) after publication.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/41ea5f528f0a8835.jpg)

## Recon:

This research kicked off with an innocent Nmap scan, just to see if anything interesting was listening on the device while in its default configuration. Lo and behold, there was one result which stood out:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a614dd59a9da0f45.png)

As shown above, we found port 60002 open and listening. Nmap was unable to identify the service directly, so we decided to investigate this mysterious port a bit further by grabbing a firmware image for the device from Ratta Software’s [“Updates” page](https://support.supernote.com/en_US/change-log/how-to-update-your-supernote).

The firmware was unencrypted, and we were able to mount the various filesystem images and grep through them for anything related to that port number. This led us to the *SuperNoteLauncher.apk*, which we threw into [jadx](https://github.com/skylot/jadx) and started reversing.

### Reversing The SuperNoteLauncher

#### Locating The Port:

After opening the apk in jadx, we first searched for where that port number was specifically being referenced. As shown below, this led us to a *static final int* named *COMMAND_RECEIVE_FILE_PORT*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f0cca69d9de55a6b.png)

Looking for cross-references, we eventually tracked down where it was being used: *com.ratta.supernote.wifip2p.receive*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd2393bd4285e597.jpg)

#### Identifying The Service:

At this point, our goal was to better understand the service running on 60002. We can see in the below screenshot that when the port is open, a handful of functions are triggered after something is received over the *ServerSocket*. Specifically, the code of interest resides in the *DeviceThread* class.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/95f1240d9c38e80c.jpg)

*DeviceThread* implements *Runnable* and its r_un()\_ function is a behemoth. That said, a quick glance at it indicates that we are likely dealing with a custom HTTP server based on the way error messages are communicated back to the client.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b69a8594698d8887.jpg)

The first line of *run()* passes the socket over to *getDeviceName()*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f4adb6d7348d0a82.png)

![⚠️ 图片托管失败](https://static.wixstatic.com/media/82b748_a3fd6042d0db4b498f707a502678a967~mv2.png/v1/fill/w_740,h_490,al_c,q_90,usm_0.66_1.00_0.01,enc_avif,quality_auto/82b748_a3fd6042d0db4b498f707a502678a967~mv2.png)

Those of you with a keen eye can probably tell what this is code is doing: parsing out custom headers that our HTTP server expects. This puts into context quite a bit of the strange behavior observed inside *run()* - different operations are being triggered based on what custom headers are passed from the client.

For example, we can trigger a 501 error code by providing a *version* header greater than 1

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ba0a67e6e7cb94b4.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49b346e772c26e8a.png)

And, when we send the request, we actually get a pop-up error saying that the SuperNote device is not on the latest version

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f018506cf1e68aaf.jpg)

### File Uploading

All of this is interesting, but what piqued our interest most was the class names: *RecieverManager* and *WiFiP2PService*. Unauthenticated device-to-device file sharing sounds like a potentially great attack surface.

Given that we at-least know how to interact with the server, at this point we went ahead and mocked up a python client that just sends a POST request with an attached file and all the necessary headers…andddd the file showed up on the device in the INBOX directory! ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d96460ed745f0885.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6f8bdeb288a9608d.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b7c1e49691fb0bcc.jpg)

## Investigating A Path Traversal:

After figuring out how to get files into the INBOX directory, we did what all good security researchers would do: added some “dot-dot-slashes” to our payload to see what would happen. Specifically, the Nomad has a directory named EXPORT at the same level as INBOX. This EXPORT directory is accessible in the UI, allowing us to quickly verify if the payload worked. Our new headers dict includes the path traversal payload, like so:

headers = {“version”: “1”, “content-length”: “1234”, “name”: “../../../../../../../../sdcard/EXPORT/testfile.txt”, “devicename”: “testdevice”} And what do you know? It worked!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b99842989b1a259d.jpg)

However, see that pesky “ *(1)”* appended to the end of our filename? Yeah, that is going to prove to be quite the problem during exploitation here in a second.

### Exploit Plan:

Up until now, we haven’t been entirely honest. Going into this, we had a little bit of an idea as to what an exploit *might* look like if we were able to find an arbitrary file write. This idea stemmed from 3 critical pieces of information we came across during our recon.

1.  SuperNote’s instruction on the Firmware Update page specifically ask you to put the downloaded zip file into the EXPORT directory
2.  A manual firmware update will automatically start after a hotplug event or reboot if a valid update image is found in the EXPORT directory
3.  A researcher [poked at the previous generation of SuperNote devices](https://github.com/TA1312/supernote-a5x) and found that firmware images were signed with publicly available debug keys and the bootloader was unlocked by default…nice. We confirmed that while the keys had been renamed on the newer devices, they were still the same.

Therefore, we figured we could do the following:

1.  Create a backdoored firmware image and sign it with the publicly available debug keys
2.  Use the arbitrary write to get the download directly into the “EXPORT” directory
3.  An update would automatically be initiated during normal device usage, installing our malicious rootkit.

This was all good in theory, only there was one major problem

### The Problem

Remember that “ *(1)* ” appended to our filename? Yeah, here is where it comes back to bite us. You see, the service that scans for the update in the EXPORT directory has the following code:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d2803cba2cdc0e77.jpg)

The filename has to be exactly *update.zip*…not *update(1).zip*. So we need to figure out *why* the extra number gets appended to our path traversal payload and how we can get rid of it.

#### Why Does The Filename Change?

After a bit more reverse engineering of the launcher apk, we finally determined the root cause of the issue. While it would be too much code to include via screenshots here, the high-level file reception logic is as follows:

1.  The server first creates a file in its application directory under the “ */\_receiver\__file_cache/file_name* ” path
2.  It then copies the incoming stream of data into that newly created file in “receiver\__file_cache/file_name\_” path
3.  When it has reached the end of the incoming stream of data, it then creates a new file, named `INBOX/file_name`
4.  It copies the contents from “receiver\__file_cache/file_name”\_ over to “ *INBOX/file_name”*
5.  Finally, it deletes the cached file.

The problem arises due to the continued use of the attacker supplied filename for *all* operations. So for our original attack plan, what ACTUALLY ends up happening on the device is:

1.  The server receives and creates the “ */\_receiver\__file_cache/../../../../sdcard/EXPORT/update.zip* ” file, thinking this should be the cache file
2.  Then after it has finished receiving the data, it goes to create the INBOX file, but actually attempts to create “ */INBOX/../../../../sdcard/EXPORT/update.zip* ” again

Before each file creation event, the following code is run:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bcd17e6ff1c5a0c2.png)

As shown, if the name already exists where a new file is to be written, then a “1” (or the next subsequent number) is added to the file name. So instead of creating “ */EXPORT/update.zip* ”, the 2nd file creation event creates “ *EXPORT/update(1).zip* ”. Then the remaining steps of the process take place: the file contents are copied over, and the the original file (“ */EXPORT/update.zip* ”) is deleted, leaving us only with the renamed one.

## Finding A Naming Issue Bypass Via A “Race Condition”

So given our current strategy, we are stuck. We need to figure out how to get our actual update file into EXPORT with the right name. At this point, we spent a lot of time trying to find an actual naming bypass, which naturally didn’t work. What *did* end up working was taking advantage of a logical “race condition”…technically it’s not *actually* a vulnerability or a traditional race condition, but we can leverage it to our advantage.

You see, a legitimate update file is 1.1GB large. That means, it takes quite a bit of time to transfer. Three other factors also play to our advantage:

1.  The file is first created, and then the stream is written byte-by-byte into it.
2.  Once the transfer completes, the second file is created, and then the copy starts.
3.  The server is multi-threaded, meaning it can receive multiple files at the same time

We can use these three facts to modify our exploit a bit.

### Revised Exploit Strategy:

Using our understanding of the server logic under the hood, we can use the following trick to satisfy our naming requirements.

1.  Create a very small, dummy file named `update.zip`
2.  Create a legitimate `update.zip` file that contains our malicious backdoor, signed with the publicly available development keys
3.  Send the the very small, dummy file first
4.  Send the legitimate `update.zip` file immediately after.

Anddd if we do that, the following happens on device (Note - thread one is *italicized* and thread two is **bold**):

1.  *`EXPORT/update.zip` is created by the dummy file during the caching / initial reception step*
2.  **`EXPORT/update(1).zip` is created by the real update during the caching / initial reception step**
3.  *`EXPORT/update(2).zip` is created by the dummy file during the copy step*
4.  *`EXPORT/update.zip` is deleted by the dummy file after completion of the copy step*
5.  **`EXPORT/update.zip` is created by the real update during copy step**
6.  **`EXPORT/update(1).zip` is deleted by the real update after completion of copy step** Because our dummy file is so much smaller than the real update file, it completes the caching, copy, and delete steps before the valid update is done being recieved. This leaves the *EXPORT/update.zip* name available when the copy step begins for the valid update.

So, after our exploit runs, we are left with a properly named malicious update image. We also have the “ *EXPORT/update(2).zip”* artifact left over from our dummy file’s copy operation, but we don’t care about it. If we want to do clean-up, that could be performed after the rootkit is installed.

## Backdooring The Firmware Image

We won’t go too in-depth on this step, but we found the development keys needed after a bit of Googling around. From there, we created a backdoor using [flashable-android-rootkit](https://github.com/ng-dst/flashable-android-rootkit) and writing simple C reverse shell payload. To re-package the firmware, we followed the recommended method from the [previous research](https://github.com/TA1312/supernote-a5x?tab=readme-ov-file#build-and-sign-your-own-updatezip) and used [Multi Image Kitchen](https://forum.xda-developers.com/t/kitchen-windows-multi-image-kitchen-repack-android-partitions.4326387/) (Note: Finding the right JDK version to get Multi Image Kitchen working was one of the harder parts of this exploit).

## Putting It All Together

Once the payload is in position, it will be auto-installed during normal operations of the device. The installer checks the EXPORT directory during hotplug events (usb-c in or out of the device) or during a reboot. Therefore, all you have to do is sit back, wait, and hope the user doesn’t find the potentially suspicious update.zip file in EXPORT. Note that after a hotplug event, the user DOES get a prompt about an update. However, it is an opt-OUT prompt, meaning the update will install in 30 seconds unless “abort” is clicked. If all goes according to plan, you get the following:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4312f6d402835d8a.jpg)

## Disclosure Timeline:

-   **July 26, 2024** - PRIZM reaches out to Ratta Software’s service team
-   **August 15th, 2024** - PRIZM follows up with Ratta Software
-   **September 23rd, 2024** - PRIZM follows up with Ratta Software again, notifying them of plans to publicly disclose the vulnerability at the 90 day disclosure deadline (Oct 23rd)
-   **September 30th, 2024** - PRIZM loops in Ratta software’s “feedback” team in an effort to get a response.
-   **October 2nd, 2024** - Ratta Software responds, mentioning staff changes had caused the disclosure to slip through the cracks. Team asks for additional information to pass to their head of engineering.
-   **October 3rd, 2024** - PRIZM provides a 7 page technical report, including full exploit code for local reproduction
-   **October 15th, 2024** - PRIZM follows up to ensure the technical details have been recieved and remind of the upcoming 90 day deadline the following week.
-   **October 16th, 2024** - SuperNote responds and mentions they plan to address the issues in the December update.
-   **October 16th, 2024** - PRIZM replies and agrees to hold off on any disclosure until December 2024.
-   **EDIT: April 8th, 2025 -** [CVE-2025-32409](https://nvd.nist.gov/vuln/detail/CVE-2023-30257) was assigned.
