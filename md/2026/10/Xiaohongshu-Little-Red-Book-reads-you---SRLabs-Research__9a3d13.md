---
title: "Xiaohongshu: Little Red Book reads you - SRLabs Research"
source: https://srlabs.de/blog/xiaohongshu-little-red-book-reads-you
source_host: srlabs.de
clip_date: 2026-10-16T10:29:30+08:00
trace_id: c8cfe329-a3ff-4850-9cb6-846584e1e5b0
content_hash: 9e7d525f951afde9b98f2a44dcf84d1aaf4c745878fe1c05dfa46eb721fea8d7
status: synced
tags:
  - Android逆向
  - iOS逆向
series: null
feed_source: SRLabs·模糊测试/漏洞审计
ai_summary: 小红书 App 被指未加密传输、过度收集设备数据，并在注册/分析时设置反调试与抓包障碍。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-816b-94da-f9767c232385
ioc:
  cves: []
  cwes: []
  hashes:
    - 00000000ef0c9d2cd766b7bfbdd99a5fba581612
    - c4542c90b5362746af1be45c1f43907b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 小红书 App 被指未加密传输、过度收集设备数据，并在注册/分析时设置反调试与抓包障碍。
> 
> - **流量与域名：** 至少与 78 个域名通信，28 个接收数据；5 个收到明文敏感信息，11 个收到 gzip，10 个收到未知加密数据。
> - **过度收集：** 声称不收集/不共享，实际发送设备型号、Android ID、GAID、CPU 各核频率与温度；空闲时每 10 分钟向 modelportrait 上报，30 分钟模拟使用约 2,775 次请求。
> - **行为上传：** 评论/私信输入每字符触发 gif 搜索 GET；选图后未编辑甚至取消也会先传 ros-upload-ali，元数据另发 edith；还有伪装成 image.png 的二进制 blob 传到 as.xiaohongshu.com。
> - **明文传输：** 大量媒体、头像、反向图搜结果走 HTTP，网络层可窥探浏览、保存视频/图片及资料页横幅，与 Play 商店“传输加密”声明矛盾。
> - **反调试与对抗：** 注册检测 root；Frida 触发 libmsaoaidsec.so 崩溃，可 hook android_dlopen_ext 绕过；iOS 用 ptrace PT_DENY_ATTACH、越狱检测和内联汇编；Android 可解证书固定但部分域名需额外 hook，iOS QUIC 需 hook 加解密。剪贴板每次启动读取，但未发现上传证据。

![](https://srlabs.de/img/assets/authors/srl_headshot_matthias_marx-320.68c39a57b2.avif)

![](https://srlabs.de/img/assets/authors/srl_headshot_erdo%C4%9Fan_ya%C4%9F%C4%B1z_%C5%9Fahin-320.951b20ebe6.avif)

![](https://srlabs.de/img/assets/authors/srl_headshot_genco_altan_demir-320.cc8fc3e3b6.avif)

![](https://srlabs.de/img/assets/authors/srl_headshot_mahmoud_anas_khalifa-320.b895a14b6c.avif)

![](https://srlabs.de/img/assets/authors/srl_headshot_luca_glockow-320.233bf0204f.avif)

Luca Glockow

![](https://srlabs.de/img/assets/authors/srl_headshot_yvette_muszynski-320.2e56028843.avif)

### Key takeaways

1.  Partially unencrypted traffic exposes users to network-level adversaries, enabling analysis of usage behavior and leakage of tracking data
2.  The app collects and shares more data than disclosed, contradicting its privacy policy and Google Play Store description. Collected data includes IMEI, CPU frequency, and device temperature
3.  Xiaohongshu employs significant effort to obstruct app analysis

## Introduction and motivation

In light of discussions about a TikTok ban by the US government, its competitor Xiaohongshu — also known as RedNote — experienced a surge in user adoption. We conducted an in-depth review of the Xiaohongshu mobile application’s security and privacy.

This review adds to prior research by others. Notably, *[The Citizen Lab](https://citizenlab.ca/2025/02/network-security-issues-in-rednote/)* and *[security researcher Matt Brown](https://www.youtube.com/watch?v=-MZV6T6ag0c)* identified some, but not all, of the issues we discuss in this report.

## Findings

Our findings refer to Xiaohongshu for Android (v8.59.2 from Google Play Store) and iOS (v8.69.4 from Apple App Store). The apps were analyzed in rooted or jailbroken environments on a Pixel 3a XL running Android 15 (LineageOS v22.1), a Motorola moto g 5G plus running Android 11, and an iPhone 8 running iOS v16.7.5. The analysis was conducted using a variety of tools including MobSF, JADX, Frida, Wireshark, Burp Suite, and Ghidra.

### Finding 1: Extensive user tracking

The application communicates with at least 78 different domains, sending data to 28 of them. Sensitive information in cleartext is sent to at least 5 domains. Data is transmitted in compressed formats, mostly gzip, to 11 domains. Encrypted data of unknown content is sent to 10 additional domains.

To better understand the purpose of logs and trackers, we simulated normal user behavior for a period of 30 minutes. During this period, the application generated a total of 2.775 requests. This section outlines seven key observations.

While the developer claims on Google Play Store that no data is collected and no data is shared with third parties, we show that both claims are false.

![Play Store's data safety section for the application](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_1-320.2106595111.avif)

Figure 1. Play Store's data safety section for the application

#### 1\. gzip log files send to /api/collect at multiple domains

The application sends gzip-compressed log files to certain domains, both at fixed intervals and in response to specific events or user actions. These log collection servers receive the files via an `/api/collect` endpoint:

![Application sends gzip-compressed log files to certain domains](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Table_1-320.a255199258.avif)  
Log sending is triggered by various user activities, such as scrolling through the feed, viewing comments, and when a video ends and restarts. Even passive use of the feed generates considerable background traffic.

To isolate regularly scheduled transmissions, the comment section of a picture post was opened and left idle. During this period, logs were sent to `t2.xiaohongshu.com/api/collect` every minute at the 30-second mark. Logs to `lng.xiaohongshu.com/api/collect` were sent at the start of a minute (00-second mark) at intervals of 1 to 5 minutes.

![Gzip data sent to /api/collect endpoint](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_2-320.34915f8cbb.avif)

Figure 2. Gzip data sent to /api/collect endpoint

As shown in the image, the gzip data appears to be corrupted, likely due to a custom binary or encoding format. However, some sensitive information remains readable.

#### 2\. Data collection at edith.xiaohongshu.com

Most of the application’s functionality is handled by edith.xiaohongshu.com. This host appears to store most user data, as it responds with various user-related information across different endpoints, including registration time, online status, gender, and whether the user is a teenager or a merchant. Comments are also created and received through this host. Like the other domains, this one also receives log and device data — for example, at the endpoint `edith.xiaohongshu.com/api/sns/v1/system_service/device_params_info`, where device specifications are transmitted. Additionally, IMEI and MAC addresses might also be sent, though in our setup, they were not. This is likely due to Android since version 10 and iOS since version 6 preventing access to IMEI and MAC address, both of which are unique device identifiers.

```json
{
  "GID": {
    "cur_time": -1,
    "cur_value": "null",
    "last_time": 1738925131544,
    "last_value": "7c21e0e99cd15417f961fe64aed2e1c7b40cd2b9473599d5778dddaa"
  },
  "DEVICE_TYPE": {...,
    "last_value": "phone"
  },
  "AAID": {...
    "last_value": "null"
  },
  "OAID": {...
    "last_value": "noNeedOnCreate"
  },
  "ANDROID_ID": {...
    "last_value": "b49d06c992877cdc"
  },
  "USER_ID": {...
    "last_value": "67a34b7a000000000d00a1f2"
  },
  "ALPHA": {...
    "last_value": "null"
  },
  "IMEI": {...
    "last_value": "null"
  },
  "MANUFACTURER": {...
    "last_value": "Google"
  },
  "VAID": {...
    "last_value": "null"
  },
  "MAC": {...
    "last_value": "null"
  },
  "LAST_LOGIN_PHONE": {...
    "last_value": "null"
  },
  "BETA": {...
    "last_value": "null"
  },
  "GAID": {...
    "last_value": "417b939d-f4a5-438d-8672-3c20155ead81"
  },
  "DEVICE_BRAND": {...
    "last_value": "google"
  },
  "DEVICE_ID": {...
    "last_value": "f764d54e-a90e-3091-8a58-161b956ea601"
  },
  "DEVICE_MODEL": {...
    "last_value": "Pixel 3a XL"
  }
}
```

#### 3\. Device CPU monitoring at modelportrait.xiaohongshu.com

The domain `modelportrait.xiaohongshu.com/api/model_portrait/model_score` receives CPU data, frequency, and temperature.

RedNote’s background activity includes periodic data transmissions to the domain modelportrait.xiaohongshu.com every 10 minutes when the device is idling. The JSON payload it sends contains detailed hardware information such as the current and maximum CPU frequencies for each core, and the device model.

```json
{
  "param": {
    "cpu_cur_freq": [614400,614400,614400,614400,614400,614400,652800,806400],
    "cpu_max_freq": [1804800,1804800,1804800,1804800,1804800,1804800,2208000,2304000],
    "cpu_name": "moto g 5G plus",
    "cpu_rate": 0.0,
    "cpu_temper": 31.5,
    "service_type": 2
  },
  "query_type": "dynamic"
}
```

The server response indicates that this information is used for device evaluation, potentially for emulator detection or performance analysis. In our tests, the server returned “no scoring available” for the specific device model.

#### 4\. Tracking data sent to Kuaishouzt

During our 30-minute test run, 12 requests containing sensitive device and gzip-compressed data were sent to Kuaishouzt, a Chinese short-video social media platform.

There is no clear indication of what triggers these requests. They were observed when opening the application, searching, uploading content, and reading messages.

```json
{
  "code":1003,
  "success":false,
  "msg":"get model score failed [moto g 5G plus no score yet]",
  "data":{
    "score":0,
    "level":""
  }
}
```

To open.kwaizt.com, with empty body:

```http
POST /rest/zt/appsupport/configs?kpf=ANDROID_PHONE&gid=&mod=Google(Pixel%203a%20XL)&c=&os=android&appver=1.0.0-6a91324&kpn=xhs&language=en-us&sys=ANDROID_15&userId=&countryCode=de&appId=xhs&packageName=com.xingin.xhs&net=WIFI&did=67a34b7a000000000d00a1f2
```

To open.kuaishouzt.com, containing large gzip in body:

```http
POST /rest/log/open/sdk/collect?kpf=ANDROID_PHONE&gid=&mod=Google(Pixel%203a%20XL)&c=&os=android&crid=220&appver=1.0.0-6a91324&kpn=xhs&language=en-us&sys=ANDROID_15&encoding=gzip&userId=&priorityType=1&productName=xhs&platform=ANDROID_PHONE&ud=&countryCode=de&appId=xhs&bodyMd5=c4542c90b5362746af1be45c1f43907b&packageName=com.xingin.xhs&net=WIFI&did=67a34b7a000000000d00a1f2
```

![Gzip data sent to Kuaishouzt](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_3-320.8364a1fe84.avif)

Figure 3. Gzip data sent to Kuaishouzt

#### 5\. Crawling protection tracker at spider-tracker.xiaohongshu.com

During certain interactions, such as writing a comment, a spider tracker collects and transmits device data to spider-tracker.xiaohongshu.com, compressed as gzip. This behavior may be intended to mitigate crawling.

![Gzip data sent to spider-tracker](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_4-320.c4e683f214.avif)

Figure 4. Gzip data sent to spider-tracker

The sent gzip data is in a similar-looking custom file format as the data sent to t2., lng, and apm-native.xiaohongshu.com.

#### 6\. Participation in the platform

The platform offers two primary forms of user participation: written communication and media sharing. We investigated both.

For written communication, such as comments, group chats, or direct messages, text input is transmitted via a GET request to `edith.xiaohongshu.com/api/im/search/gif?keyword=`, with one request sent for each character typed or deleted, up until the first space. Although this appears to be part of a GIF search feature, it is embedded directly within the standard message input field and is not clearly presented as a GIF-specific function. As a result, user input is transmitted to Xiaohongshu in real time, even if the message is never submitted.

When a user selects a photo for upload, it is immediately sent to Xiaohongshu’s servers, specifically `ros-upload-ali.xiaohongshu.com`, before any edits, filters, captions, or titles are added. Notably, the upload occurs even if the user cancels the action and does not proceed with sharing. Furthermore, the image’s metadata, including its storage path on the device, is separately sent to `edith.xiaohongshu.com`.

#### 7\. Unexpected “image upload”

While scrolling through the feed, we observed a request, supposedly uploading an image file to `as.xiaohongshu.com/api/v1/d/upload`. We observed three similar structured requests to the endpoint, with no indication of a triggering behavior.

![File upload request](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_5-320.c7960191f8.avif)

Figure 5. File upload request

Upon trying to inspect the submitted image, we learned that the submitted data is not an image but rather a binary blob of unknown file type. We did not find the trigger of this behavior in the Android decompile. No references to as.xiaohongshu.com can be found. Other interactions with the as.xiaohongshu.com hosts suggest that it’s linked to some security tooling by Xiaohongshu.

The same domain receives obfuscated, sometimes partially encrypted device data in other requests to `/api/v1/profile/android` and similar endpoints.

```json
{
  "appid": "ECFAAF01",
  "channel": "GooglePlay",
  "did": "00000000ef0c9d2cd766b7bfbdd99a5fba581612",
  "ext": "1",
  "gid": "7c225f5ce1085417f961fce1aed2e1c7b40cb3f9473594a977451350",
  "magic": 1595080155,
  "model": "Pixel 3a XL",
  "os": "android",
  "os_preview_version": 0,
  "os_version": 35,
  "sdk_version": "2.7.4"
}
```

This assumption is further supported by the fact that this behavior can be observed in the iOS app. In this decompile, the following control flow can be observed:

1.  **Retrieve IDs**
2.  **Concat IDs into NSData**
3.  **Create MultiPartFormData with NSData, file name image.png, and content type image/png**
4.  **POST NSData to [https://as.xiaohongshu.com/api/v1/d/upload](https://as.xiaohongshu.com/api/v1/d/upload)**

![Control flow of the data upload process](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_6-320.638a9bf88e.avif)

Figure 6. Control flow of the data upload process

Although the observed iOS behavior is slightly different from the Android request (sending as PNG, only IDs), it clearly shows the intent of sending binary data hidden as pictures. This hiding mechanism is commonly observed in malware or spyware.

Even before a user accepts Xiaohongshu’s privacy policy, which is presented upon the first opening the app, traffic is sent to Facebook.

### Finding 2: Plaintext data transmission

The application uses a mix of HTTP and HTTPS connections for its multimedia-related requests. A significant number of media requests related to browsing and downloading post content, reverse image results, and profile media are transmitted over unencrypted HTTP. This contradicts the developer’s claim on Google Play Store that data is encrypted in transit.

This exposes users to potential privacy risks, as a network-level eavesdropper (such as an Internet Service Provider (ISP) or a local adversary controlling or attacking the network) can intercept and monitor this traffic. Such an attacker can see the videos and snapshots the users save on their devices, their browsing activity for videos and images, and what kind of profiles they are browsing based on profile banners.

![Application transmitting image posts over plaintext](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_7-320.afc03042c8.avif)

Figure 7. Application transmitting image posts over plaintext

When users make use of the app’s reverse image search, they receive multiple image results matching the queried object. An attacker monitoring the traffic can infer the content of the original search image based on the high volume of similar plaintext image responses.

![Application transmitting reverse image search results](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_8-320.5c3d4f38b8.avif)

Figure 8. Application transmitting reverse image search results

Here is a list of activities making use of plaintext communications and the ssociated sample URLs:

1.  **Download video via Share > Save to album ([URL](http://sns-video-ak.xhscdn.com/stream/1/110/4610/01e78623bd2ac741010370039464f84a3c_4610.mp4))**
2.  **Download snapshot via Share > Snapshot ([URL](http://sns-na-i8.xhscdn.com/1040g00831cq64t3f12005nb3qtagbajvj3hgq48?imageView2/2/w/540/format/reif/q/90))**
3.  **Video previews while browsing ([URL](http://sns-na-i9.xhscdn.com/1040g2sg31csk07ld0c0g48bglr3eq7mfthml210?imageView2/2/w/540/format/webp))**
4.  **Video previews in the Likes & Collects notifications ([URL](http://ci.xiaohongshu.com/1040g2sg31csmknfe0s7048qktqovq9oq51dok88?imageView2/2/w/1080/format/jpg))**
5.  **Users’ banners of profiles visited ([URL](http://sns-avatar-qc.xhscdn.com/user_banner/1040g2k030voco83l5u0048qktqovq9oqje1ecpg?imageView2/2/w/540/format/jpg))**
6.  **Reverse image search results ([URL](http://sns-na-i9.xhscdn.com/1000g00826f20ig2fk0005nm6mtd08sd4rq6fh1o?imageView2/2/w/540/format/webp))**
7.  **Browse image posts ([URL](http://sns-na-i9.xhscdn.com/1040g2sg31d1ue2n3h0dg405snvlf7rlvg40lt38?imageView2/2/w/5000/h/5000/format/reif/q/99&redImage/frame/0))**

### Finding 3: Tamper and debugging protections

The applications make use of several methods that hinder debugging and analysis.

#### 1\. Root detection prevents registration

Initial attempts to register an account on a rooted Android device were unsuccessful, despite Xiaohongshu being included in the DenyList and the Magisk App being hidden. Even after multiple retries involving unrooting the device, uninstalling the Magisk app, and disabling any HTTP proxy, registration continued to fail.

Only after performing a complete wipe of the phone, logging into a Google account during initial device setup, and downloading Xiaohongshu directly from the Google Play Store, the registration process was successfully initiated.

The application requires a valid phone number to complete registration. Multiple VoIP and disposable phone number services were rejected. A Chinese phone number was denied with the error message indicating that a non-mainland China number should be used. Ultimately, a phone number was accepted and registration succeeded.

![Application rejecting registration using a Chinese phone number](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_9-320.a1480fab94.avif)

Figure 9. Application rejecting registration using a Chinese phone number

Following successful registration, the test phone was re-rooted and the testing environment was restored. This did not result in a banned account — the Xiaohongshu reported our phone as not rooted to its servers, indicating that its root detection mechanisms are no longer enforced post-registration.

![Application sending data to its server, reporting device as not identified as rooted](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_10-320.3b576c350e.avif)

Figure 10. Application sending data to its server, reporting device as not identified as rooted

#### 2\. Hooking to the application using Frida

The application includes multiple anti-debugging techniques designed to crash the application when debugging attempts using Frida are detected. These techniques depend on the operating system. While this may be for anti-botting purposes, it also makes auditing how it uses user data more difficult.

##### Android

Hooking into the application with Frida causes an immediate crash, traced to the native library `libmsaoaidsec.so`. This library implements anti-debugging measures and is commonly used in other Chinese apps like Bilibili and iQIYI. The crash can be bypassed by hooking `android_dlopen_ext`, the native Android function responsible for loading shared libraries at runtime. A Frida script intercepts calls to this function and monitors the path of each library being loaded. When it detects `libmsaoaidsec.so`, the path is replaced with an empty string in memory. This prevents the system from locating and loading the library, effectively disabling its anti-debugging mechanisms and allowing Frida to attach and run without interference.

##### iOS

The iOS application implements several techniques to hinder analysis. These techniques include anti-debugging, runtime integrity checks, and jailbreak detection.

To prevent itself from being dynamically analyzed, the application would prevent a debugger from being attached. This is done with a manual (inline assembly) `ptrace syscall`, with `PT_DENY_ATTACH`. It would also detect the presence of a debugger by various methods, in case the anti-debugging was disabled by configuration or defeated by a researcher.

While use of Frida did not immediately result in crashes, some benign hooks did. In addition, the application hashed parts of its memory, and sent suspicious numbers associated with code symbols.

The application implements multiple jailbreak detection methods, including checks for jailbreak-related files and sandbox behavior. Although some of these checks should have successfully identified the device as jailbroken, functionality remained unchanged, and the “rooted field” sent to the crash reporting endpoint was set to false. All identifiable jailbreak detection mechanisms were manually disabled.

The application also contains other inline assembly syscalls, which violates rule 2.5.1 of *[Apple’s App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#software-requirements)*.

Due to time constraints, we simply disabled the components without further analysis of their functionality. Further analysis could uncover custom anti-tampering logic, novel obfuscation techniques, telemetry, or monitoring strategies tied to runtime memory changes.

#### 3\. Traffic intercept

The app employs a complex client-side load balancer, using various methods of transport (QUIC, HTTPS, HTTP with manually managed sockets, possibly more), and various methods of DNS resolution (DoH, system DNS, hardcoded IPs, possibly more).

On Android, most of the traffic is transmitted via HTTPS nonetheless. As a consequence, bypassing certificate pinning and using an HTTP MitM tool is sufficient for traffic intercept.

On iOS, the use of QUIC hinders common MitM tooling from functioning. Cleartext for encrypted traffic can be obtained by hooking encryption and decryption code at runtime instead.

Both approaches are explained in what follows.

##### Android: Bypassing certificate pinning

The application makes use of certificate pinning. Installing a Certificate Authority (CA) certificate and using an HTTP proxy alone is insufficient for traffic interception.

To implement certificate pinning, the application makes use of OkHttp. Most pinning mitigations can be bypassed using akabe1’s [frida-multiple-unpinning](https://codeshare.frida.re/@akabe1/frida-multiple-unpinning/) script.

However, when making use of the unpinning script, it's still impossible to intercept certain domains. To mitigate this, Frida can be used to hook into the relevant HTTP clients. Here's the list of the domains that could not be intercepted using the Frida script:

1.  **apm-native.xiaohongshu.com**
2.  **as.xiaohongshu.com**
3.  **crash.xiaohongshu.com**
4.  **fe-static.xhscdn.com**
5.  **gslb.xiaohongshu.com**
6.  **live-room.xiaohongshu.com**
7.  **modelportrait.xiaohongshu.com**

##### iOS: Traffic interception via hooking code at runtime

Because QUIC prevents successful use of common man-in-the-middle (MitM) tooling, cleartext traffic must instead be captured by hooking encryption and decryption functions. This was made more difficult by the presence of two separate BoringSSL libraries: one provided by the system and another statically compiled into the application. Additionally, a third BoringSSL instance was statically compiled into the Tquic framework. However, this version was not in use, likely due to the configuration of the client-side load balancer.

### Finding 4: Clipboard access is requested

Each time the user launches the application it reads their clipboard. The users can see a toast message saying that the application has accessed their clipboard, which raises suspicions for many users. This behavior is described and discussed *[in online forums](https://www.reddit.com/r/China/comments/18op0ti/why_do_chinese_apps_always_copy_content_from_the/)* already.

![Toast message showing that the clipboard was accessed upon launch](https://srlabs.de/img/content/blog/post-assets/xiaohongshu-little-red-book-reads-you/Fig_11-320.ac2ec97a1b.avif)

Figure 11. Toast message showing that the clipboard was accessed upon launch

To determine whether clipboard data is transmitted to a remote server, we examined the process in detail by hooking into functions responsible for encoding, encrypting, and transmitting data. No evidence was found indicating that clipboard contents are encrypted or sent to a remote server. The clipboard access may serve legitimate functionality, which is common in some Chinese applications — such as TaoBao — where a copied link may trigger the launch of a related post. However, during testing, this behavior could not be triggered by copying a post link.

## Conclusion

Xiaohongshu employs several measures to resist investigation, putting significant effort into obfuscation. While some of these mechanisms may serve legitimate purposes — such as anti-botting — they also have the side effect of hindering reverse engineering and independent analysis.

Even though we were able to bypass these measures and demonstrate that the app transmits exposed user behavior through plaintext transmissions, even to third parties, Google “was not able to identify a violation” of *[its policies](https://play.google/developer-content-policy/)*. We reported the inline assembly syscalls to Apple as a data protection issue, as this was the only way Apple allowed to report violations. The website explicitly said that we will not receive a response.

After all, it is no surprise that an app like this tracks users, collects more data than it claims, and deploys technical barriers to hinder independent research.

## Credits

We would like to thank our team — Erdogan, Genco, Luca, Mahmoud, and Yvette — for their work on analyzing this application. We also thank our reviewers, Linus and Maria, for their helpful feedback.
