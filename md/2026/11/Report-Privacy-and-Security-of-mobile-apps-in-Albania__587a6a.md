---
title: "Report: Privacy and Security of mobile apps in Albania"
source: https://dispatchersdotplayground.hashnode.dev/report-privacy-and-security-of-mobile-apps-in-albania
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-21T22:36:03+08:00
trace_id: 290d8fd4-f33b-4fa0-9436-61ce063f9a65
content_hash: 502acc12f99050cdabb694b6254682781460ff5f228fbc78e141e0c999d2bab9
status: synced
tags:
  - Android逆向
  - 移动应用安全
series: null
feed_source: Stavro·Android逆向
ai_summary: 对阿尔巴尼亚 227 款 Android 应用进行静态分析后发现：官方政府应用安全性最弱，14 款全部被评为 D 或 F；银行应用情况稍好，但无一达到 A；85% 的应用内嵌第三方 SDK，多为美国厂商。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 41f75244-d011-8145-b812-e143e48dae75
ioc:
  cves:
    - CVE-2016-1516
    - CVE-2017-12597
    - CVE-2017-12598
    - CVE-2020-17541
    - CVE-2021-0341
    - CVE-2022-37434
    - CVE-2023-44488
    - CVE-2023-45853
    - CVE-2023-5217
    - CVE-2023-6603
    - CVE-2023-6605
    - CVE-2024-31578
    - CVE-2024-5197
    - CVE-2025-59375
    - CVE-2025-66293
    - CVE-2026-11856
    - CVE-2026-22184
    - CVE-2026-25646
    - CVE-2026-31789
    - CVE-2026-33416
    - CVE-2026-34182
    - CVE-2026-66046
    - CVE-2026-75803
    - CVE-2026-8924
    - CVE-2026-8927
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 对阿尔巴尼亚 227 款 Android 应用进行静态分析后发现：官方政府应用安全性最弱，14 款全部被评为 D 或 F；银行应用情况稍好，但无一达到 A；85% 的应用内嵌第三方 SDK，多为美国厂商。
> 
> - **研究方法与样本：** 从 Google Play 下载 227 款 APK（组织类 98 款、独立开发者 129 款），反编译后离线分析 manifest、代码、库和 native 层（Ghidra 反汇编），全程不安装、不联网、不攻击；共记录 4 个高危、51 个中危、426 个低危弱点。
> - **政府与银行评分：** 政府应用 8 个 D、6 个 F；银行 6 个 B、9 个 C、7 个 D。14 款政府应用全部缺少证书固定（certificate pinning）；13/14 无防篡改或 Root 检测；11/14 允许应用数据进入系统备份；8/14 未禁止截屏。银行中 11/22 缺证书固定、8/22 无篡改检测。
> - **隐私与权限：** 85% 应用含至少一个统计、崩溃上报、广告或营销 SDK，87% 的 SDK 供应商位于美国；99 款（44%）的 Play“数据安全”声明与代码不符；78 款（34%）申请了与用途不符的敏感权限，最常见是“悬浮窗”47 款（常被银行木马用于伪造登录页），其次麦克风 24 款、通讯录 10 款；0 款声明无障碍服务。
> - **漏洞与技术债：** 75 款（33%）打包了含已知 CVE 的旧库（如 libpng 19、OpenSSL 17）；人工读码确认 5 个真实问题，包括“信任所有证书”的 TLS 实现、两个收音机应用同样错误、WebView 页面可调取整本通讯录、银行应用内置同一份客户端证书及明文密码。
> - **误报与结论：** 自动化扫描器标出的 12 个“严重问题”经人工核查全部不成立（多为库中未启用的不安全选项或证书的密钥文件标签），而共享客户端证书问题只能靠读码发现；139 款可疑来源应用经 Quark 引擎加 22 项恶意指标筛查，未发现恶意软件。建议金融机构与政府强制基线（证书固定、备份排除、截屏保护、防篡改）并要求人工验证的安全审计。

> **In short**
> 
> -   **Government apps are the weakest group I looked at.** All 14 official government apps scored D or F on basic security protections (8 D, 6 F). None of them uses certificate pinning, and 13 of 14 have no protection against tampered or rooted phones.
> -   **Banks do better, but not well.** No banking app scored F, and none scored A: 6 B, 9 C and 7 D out of 22.
> -   **Third parties are almost everywhere.** 85% of all apps contain at least one analytics, crash-reporting, advertising or marketing SDK, and 87% of those SDKs come from US-based vendors.
> -   **Apps ask for more than they need.** 34% of the apps request at least one sensitive permission that does not fit what the app does.
> -   **No malware** among the 129 apps from small and independent developers, but many of them are packed with advertising code.
> -   **5 concrete vulnerabilities**, confirmed by reading the code. I describe them without naming the apps.

## Why I did this

More and more of daily life in Albania runs through a phone. People pay bills, check their bank balance, apply for documents online, order food, call a taxi and follow the news from an app. Every one of these apps asks for trust: people install it, log in, and hand over personal data, money and sometimes identity documents.

What users cannot see is how these apps are built. Does the app protect the connection to its server, or could someone on the same Wi-Fi read it? Does it send data to other companies? Does it ask for the microphone or the address book without needing them? And are any of the many apps that use the country's name actually malicious?

I wanted to answer those questions for the apps people in Albania are most likely to install, and to do it without attacking anything. This article is the result. It is an independent study: nobody commissioned or paid for it, and I have no business relationship with any of the organisations whose apps I analysed.

## What I looked at, and how

I collected **227 Android apps** from Google Play and split them into two groups.

The **98 apps from organisations** come from banks, public institutions and companies that people trust with money, identity or daily life. The **129 apps from independent developers** are aimed at Albanian users but do not come from a bank, the state or a large company: translators, keyboards, radio players, quizzes, travel guides, a VPN. I found them by searching Google Play for "Albania" and "Shqip"; some are made in Albania, others abroad. Apps like these, from developers nobody has heard of, are where malware usually hides.

| Category | Apps | What's in it |
| --- | --- | --- |
| Banks & e-money | 22  | retail and business banking, e-money and payment apps |
| Government | 14  | national e-government, municipal and agency apps |
| Business | 30  | telecoms, retail, transport and taxi, jobs, insurance, two private 'public-service' apps |
| Media | 18  | TV channels and news outlets |
| Unofficial media | 8   | unofficial IPTV and streaming apps |
| Food & delivery | 6   | food ordering and delivery |
| Independent developers | 129 | translators, keyboards, radios, quizzes, travel, VPN |
| **Total** | **227** |     |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/661c068252473118.png)

**I only read the apps; I never ran or attacked them.** Each app was downloaded from Google Play, unpacked, decompiled back into readable code and analysed on my own computer. I looked at:

-   its configuration (the "manifest");
-   its code;
-   the libraries it bundles;
-   its native (C/C++) code, which I disassembled for every app.

No app was installed on a phone. No server was contacted, no account was used, and no password or key was tried.

This method is called *static analysis*. It shows what an app is built to do. It cannot prove what happens on a real device, and I say so wherever it matters. The full method is in the appendix.

Throughout the article I keep two kinds of results apart:

-   A **weakness** is a missing protection or a risky setting, for example an app that allows unencrypted connections. It makes an attack easier, but it is not proof that an attack works.
-   A **vulnerability** is a weakness I followed through the code, from the point an attacker can reach to the point where harm happens. I found 5. None of them was tested on a device.

## The overall picture

Across all apps I recorded **4 high-, 51 medium- and 426 low-severity weaknesses**. Each kind of weakness counts once per app, so an app with forty risky code locations of the same type still counts once. Minor items are left out.

The severity depends on the kind of app. A missing protection weighs more in a banking or government app than in a radio player, because the damage is bigger if something goes wrong. The full severity key is in the appendix.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9fc866192545964.png)

| Category | Apps | High | Medium | Low | Per app | Confirmed |
| --- | --- | --- | --- | --- | --- | --- |
| Banks & e-money | 22  | 0   | 20  | 86  | 4.8 | 1   |
| Government | 14  | 0   | 20  | 55  | 5.4 | 0   |
| Business | 30  | 1   | 2   | 35  | 1.3 | 1   |
| Media | 18  | 0   | 1   | 27  | 1.6 | 0   |
| Unofficial media | 8   | 0   | 1   | 18  | 2.4 | 0   |
| Food & delivery | 6   | 1   | 0   | 8   | 1.5 | 1   |
| Independent developers | 129 | 2   | 7   | 197 | 1.6 | 2   |

Two groups stand out with the most weaknesses per app: **government apps and banks**. Part of the reason is that I hold them to a higher standard. The bigger reason, as the next section shows, is that several basic protections are simply missing.

The apps from independent developers have fewer weaknesses per app. That is not because they are well built. Most of them do very little: they have no login, no payments and no personal data worth protecting.

## Banks and government: the grades

For the 22 banking and e-money apps and the 14 official government apps, I gave a security grade from A to F. It is based on a checklist of 18 protections (listed in the appendix):

| Grade | Meaning |
| --- | --- |
| **A** | no basic protection missing |
| **B** | no critical gap, some warnings |
| **C** | one basic protection missing |
| **D** | two or three missing |
| **F** | four or more missing |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a29a27867ff07e41.png)

**Government apps: 8 D and 6 F. No official government app reached C or better.** **Banks: 6 B, 9 C, 7 D.** None failed outright, and none got an A.

The table shows, for each check, how many apps failed it outright (Fail) and how many got a warning (Warn).

| Check | Banks (n=22) Fail / Warn | Government (n=14) Fail / Warn |
| --- | --- | --- |
| S1 Unencrypted traffic allowed | 3 / 2 | 3 / 0 |
| S2 TLS validation disabled | 0 / 3 | 0 / 0 |
| S3 Trusts user-added certificates | 0 / 0 | 1 / 0 |
| S4 No certificate pinning | 11 / 0 | 14 / 0 |
| S5 Debuggable build | 0 / 0 | 0 / 0 |
| S6 Data in backups, not excluded | 2 / 0 | 11 / 0 |
| S7 Outdated Android levels | 0 / 1 | 0 / 4 |
| S8 Open components | 0 / 12 | 0 / 1 |
| S9 Unverified links / custom schemes | 0 / 13 | 0 / 6 |
| S10 Screens not protected from capture | 2 / 0 | 8 / 0 |
| S11 WebView bridge / file access | 0 / 11 | 0 / 5 |
| S12 Secrets to review | 0 / 5 | 0 / 1 |
| S13 Weak crypto primitive | 0 / 19 | 0 / 3 |
| S15 No tamper/root protection | 8 / 4 | 13 / 0 |
| S16 Library with High/Critical CVE | 0 / 13 | 0 / 5 |
| S17 Privacy (trackers / ads) | 0 / 18 | 0 / 7 |
| S18 Native code hotspots | 0 / 19 | 0 / 6 |

The protections behind these grades, in plain language:

**Certificate pinning: missing in all 14 government apps and in 11 of 22 banking apps.** When an app connects to its server, it checks the server's certificate to make sure it is talking to the right party. Normally any certificate signed by one of the hundreds of authorities trusted by the phone is accepted. *Pinning* means the app accepts only its own server's certificate. Without pinning, someone who can tamper with the network has an easier job intercepting the connection. That could be a malicious Wi-Fi hotspot, a compromised network device, or a phone on which an extra certificate was installed, for example through a "company profile". Pinning is standard practice for banking apps in most of Europe.

**Protection against tampered or rooted phones: missing in 13 of 14 government apps and 8 of 22 banking apps.** A rooted phone, or a modified copy of an app, lets an attacker read the app's data, change its behaviour or automate it. Banking and identity apps usually detect this and refuse to run, or at least warn the user. Most government apps don't check at all.

**App data included in phone backups: 11 of 14 government apps, only 2 of 22 banks.** By default, Android may copy an app's data into backups. If that data includes a login session or personal records, they leave the phone, and with some backup methods they can be restored on another device. Banks have mostly switched this off. Government apps have not.

**Screens not protected from capture: 8 of 14 government apps, 2 of 22 banks.** Android lets an app mark its screens as secure. They then can't be screenshotted or recorded by other apps, and they don't show up in the "recent apps" overview. Without that flag, a document, an ID number or a balance can be captured by any screen-recording app the user has granted access to.

**Unencrypted traffic: allowed by 3 government and 3 banking apps** for their whole app. Most apps only use encrypted connections. These few allow plain HTTP, which anyone on the network can read.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6e091e5ff76593f0.png)

None of these gaps means an app has been hacked. They mean that protections which are routine in banking and e-government apps elsewhere in Europe are often not there. And for government apps, the pattern is consistent enough to look like a missing standard rather than a set of individual mistakes.

## Privacy: who else is in the app?

Hardly any app is built from scratch. Developers add ready-made code from other companies, called SDKs, for analytics, crash reporting, advertising and marketing. That code runs inside the app with the same access the app has. What it collects and where it sends it is decided by the SDK vendor, not by the organisation whose name is on the app.

-   **85% of all apps** contain at least one third-party SDK of this kind.
-   **6 of 22 banking apps** include a marketing or attribution SDK. These SDKs report installs and in-app events to a marketing platform. I found no advertising networks in banking apps.
-   **7 of 14 official government apps** contain at least one third-party analytics or crash-reporting SDK. None of them contains advertising code.
-   **87% of the SDK vendors are based in the United States.** In 40 cases an app includes an SDK from a Russian or Chinese vendor. Almost all of those are advertising networks in independent-developer and unofficial streaming apps.
-   **Session-replay tools**, which can record what a user does on screen, appear in 2 apps.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cd3c517a26b5113f.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/811ed7e64bddd602.png)

| Category | Any 3rd-party SDK | Avg. SDKs | Ad / marketing SDK | Privacy grades A/B/C/D/F |
| :--- | :--- | :--- | :--- | :--- |
| Banks & e-money | 100% | 2.0 | 27% | 0/0/4/15/3 |
| Government | 50% | 0.6 | 7%  | 1/3/4/5/1 |
| Business | 83% | 1.6 | 20% | 1/3/10/13/3 |
| Media | 94% | 2.4 | 44% | 0/1/5/10/2 |
| Unofficial media | 88% | 5.0 | 88% | 0/1/0/5/2 |
| Food & delivery | 83% | 1.5 | 17% | 0/1/0/5/0 |
| Independent developers | 85% | 2.5 | 67% | 11/9/23/71/15 |

These are the SDKs I found most often (number of apps that contain them):

| SDK | Type | Vendor based in | Apps |
| :--- | :--- | :--- | :--- |
| Firebase Analytics | analytics | US  | 153 |
| AdMob | advertising | US  | 95  |
| Crashlytics | crash reporting | US  | 72  |
| Meta Audience Network | advertising | US  | 23  |
| Facebook App Events | marketing attribution | US  | 19  |
| Sentry | crash reporting | US  | 14  |
| OneSignal | analytics | US  | 12  |
| Unity Ads | advertising | US  | 12  |
| AppLovin | advertising | US  | 11  |
| Mintegral | advertising | CN  | 10  |
| Pangle/ByteDance | advertising | CN/SG | 9   |
| Vungle/Liftoff | advertising | US  | 9   |
| [Start.io](http://start.io/) | advertising | US/IL | 9   |
| AppsFlyer | marketing attribution | IL/US | 8   |
| InMobi | advertising | IN  | 7   |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cd6e26660cdbd1c1.png)

Crash reporting and basic analytics are common and not harmful in themselves. But each SDK is another company that receives data about the app's users, usually outside Albania and outside the EU. For a government app in particular, users should be able to see which companies these are and what they receive.

**Store labels and code don't always match.** On Google Play every app has a "Data safety" section in which the developer declares what data the app collects and shares. In **99 apps (44%)** that label is hard to reconcile with what the code contains, for example "no data shared" next to an advertising SDK. Google allows developers to leave out data sent to "service providers", so not every mismatch is a false statement. But a user who reads the label gets an incomplete picture.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aea73956cbe6fd8b.png)

For the privacy grades I used a separate checklist of 13 points (appendix). It covers how many SDKs an app carries, whether tracking starts before the user can say no, whether there is a consent dialog, whether the advertising ID is used, and whether the store label matches the code.

## Permissions they don't need

Android apps have to declare which sensitive features they want to use: the camera, the microphone, location, contacts, SMS, and so on. I compared each app's declared permissions with what the app is for. A taxi app needs location; a translator may need the microphone; a radio player needs neither, and a news app has no business reading the address book.

**78 apps (34%) ask for at least one permission that does not fit their purpose.**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7d09a232a2fc7503.png)

| Category | Apps | With an unneeded sensitive permission |
| :--- | :--- | :--- |
| Banks & e-money | 22  | 1 (5%) |
| Government | 14  | 7 (50%) |
| Business | 30  | 19 (63%) |
| Media | 18  | 8 (44%) |
| Unofficial media | 8   | 3 (38%) |
| Food & delivery | 6   | 1 (17%) |
| Independent developers | 129 | 39 (30%) |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e3bb60f4e4537374.png)

| Permission | Apps that don't need it but ask |
| :--- | :--- |
| Draw over other apps | 47  |
| Microphone | 24  |
| Contacts | 10  |
| Location | 8   |
| Calendar | 4   |
| Install other apps | 3   |
| Background location | 2   |
| App-usage history | 2   |
| Camera | 2   |
| Call log | 1   |
| Phone calls / number | 1   |

The most common is "draw over other apps", followed by the microphone and contacts. "Draw over other apps" lets an app put its own window on top of others. Banking malware uses this to show fake login screens over real banking apps.

Often a permission like this comes in with a library, and the app itself never uses it. But Android asks users to approve permissions, not libraries. A permission that is granted but not needed is a door left open, and it trains users to tap "Allow" without thinking.

Banks score well here, but partly because I allowed them more. Contacts, camera, microphone and the list of installed apps all have legitimate uses in banking, such as transfers to contacts, ID checks and fraud detection.

On the positive side: **no app in the study declares an accessibility service** (0 of 227). That is the Android feature most abused by banking malware to read and control the screen.

## Old code inside new apps

Apps bundle libraries for images, video, encryption and networking. When an app ships an old version of a library with a published security flaw (a [CVE](https://www.cve.org/About/Overview), a numbered entry in the public catalogue of vulnerabilities), the flaw comes with it. **75 apps (33%)** bundle at least one library whose version has a known CVE.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aeaab98423e2c296.png)

| Library | Used for | Apps with a vulnerable version | ...with a High/Critical CVE | Examples (High/Critical) |
| :--- | :--- | :--- | :--- | :--- |
| BouncyCastle | cryptography | 19  | 0   | (only Medium/Low) |
| libpng | PNG images | 19  | 19  | [CVE-2025-66293](https://nvd.nist.gov/vuln/detail/CVE-2025-66293), [CVE-2026-25646](https://nvd.nist.gov/vuln/detail/CVE-2026-25646), [CVE-2026-33416](https://nvd.nist.gov/vuln/detail/CVE-2026-33416) |
| OpenSSL | TLS / cryptography | 17  | 14  | [CVE-2026-34182](https://nvd.nist.gov/vuln/detail/CVE-2026-34182), [CVE-2026-75803](https://nvd.nist.gov/vuln/detail/CVE-2026-75803), [CVE-2026-31789](https://nvd.nist.gov/vuln/detail/CVE-2026-31789) |
| OkHttp | HTTP networking | 15  | 15  | [CVE-2021-0341](https://nvd.nist.gov/vuln/detail/CVE-2021-0341) |
| OpenCV | camera / computer vision | 12  | 6   | [CVE-2016-1516](https://nvd.nist.gov/vuln/detail/CVE-2016-1516), [CVE-2017-12597](https://nvd.nist.gov/vuln/detail/CVE-2017-12597), [CVE-2017-12598](https://nvd.nist.gov/vuln/detail/CVE-2017-12598) |
| zlib | compression | 12  | 12  | [CVE-2026-22184](https://nvd.nist.gov/vuln/detail/CVE-2026-22184), [CVE-2023-45853](https://nvd.nist.gov/vuln/detail/CVE-2023-45853), [CVE-2022-37434](https://nvd.nist.gov/vuln/detail/CVE-2022-37434) |
| libvpx | video (VP8/VP9) | 9   | 9   | [CVE-2024-5197](https://nvd.nist.gov/vuln/detail/CVE-2024-5197), [CVE-2023-5217](https://nvd.nist.gov/vuln/detail/CVE-2023-5217), [CVE-2023-44488](https://nvd.nist.gov/vuln/detail/CVE-2023-44488) |
| libjpeg-turbo | JPEG images | 7   | 7   | [CVE-2020-17541](https://nvd.nist.gov/vuln/detail/CVE-2020-17541) |
| Expat | XML parsing | 5   | 5   | [CVE-2025-59375](https://nvd.nist.gov/vuln/detail/CVE-2025-59375), [CVE-2026-66046](https://nvd.nist.gov/vuln/detail/CVE-2026-66046) |
| curl | networking | 4   | 4   | [CVE-2026-11856](https://nvd.nist.gov/vuln/detail/CVE-2026-11856), [CVE-2026-8924](https://nvd.nist.gov/vuln/detail/CVE-2026-8924), [CVE-2026-8927](https://nvd.nist.gov/vuln/detail/CVE-2026-8927) |
| FFmpeg | audio/video | 3   | 3   | [CVE-2024-31578](https://nvd.nist.gov/vuln/detail/CVE-2024-31578), [CVE-2023-6603](https://nvd.nist.gov/vuln/detail/CVE-2023-6603), [CVE-2023-6605](https://nvd.nist.gov/vuln/detail/CVE-2023-6605) |
| Lua | scripting | 2   | 0   | (only Medium/Low) |

A known CVE in a bundled library does not prove the app can be attacked through it. That depends on whether the app uses the vulnerable part, and with what input. An image library with a flaw in decoding PNG files matters if the app displays images from the internet, and much less if it only shows its own icons. What the numbers do show is that updating dependencies is often not part of the release routine.

## 5 real problems

Most of the findings so far are weaknesses. For the ones that sounded most serious, I read the code to find out whether they really affect users. 5 of them do. I describe them without naming the apps, and the code below is simplified and renamed so that it doesn't identify any app.

### 1\. Encryption effectively switched off in a consumer app (High)

A consumer app with user accounts builds its main network connection with a certificate check that accepts **every** certificate, and a host-name check that accepts **every** server name. That connection is the one every request to the app's backend goes through.

```java
// simplified from the decompiled code
X509TrustManager trustAll = new X509TrustManager() {
    public void checkClientTrusted(X509Certificate[] chain, String type) { }
    public void checkServerTrusted(X509Certificate[] chain, String type) { }  // accepts any certificate
    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
};
SSLContext tls = SSLContext.getInstance("SSL");
tls.init(null, new TrustManager[] { trustAll }, new SecureRandom());

OkHttpClient api = new OkHttpClient.Builder()
        .sslSocketFactory(tls.getSocketFactory(), trustAll)
        .hostnameVerifier((host, session) -> true)                           // accepts any host name
        .build();                                                            // used for the whole API
```

The connection is still encrypted, but the app no longer checks *who* it is encrypted with. Anyone who can sit between the phone and the server can present their own certificate and read or change the traffic, including the user's session. That could be an open Wi-Fi network in a café or a hotel. There is no condition around this code: it is not limited to a test build.

### 2\. The same mistake in two radio apps (High)

Two radio apps from independent developers disable the check in a similar way. One does it for the entire app. The other first asks Android to verify the certificate and, if that fails, accepts it anyway as long as its dates are valid:

```java
public void checkServerTrusted(X509Certificate[] chain, String type) throws CertificateException {
    try {
        systemTrustManager.checkServerTrusted(chain, type);   // the normal check
    } catch (CertificateException e) {
        for (X509Certificate cert : chain) {
            cert.checkValidity();                             // on failure: only the dates are checked
        }
    }
}
```

Much less sensitive data flows through a radio app than through a shopping or banking app. I list them because the mistake is the same, and because code like this gets copied from one app to the next.

### 3\. An app that looks like a public service hands your contacts to a web page (High)

An app that presents itself like a public service, but is run by a private company, is built on a "website-to-app" template. The page shown inside the app can ask the app for native features by navigating to special addresses. One of those makes the app read the **entire address book, names and phone numbers**, and insert it into the page that is currently open. Another starts location tracking.

```java
public boolean shouldOverrideUrlLoading(WebView view, String url) {
    if (url.startsWith("<contacts-scheme>://")) {          // any page shown in the app can trigger this
        String contacts = readAllContactsAsJson();          // every name and phone number
        view.loadUrl("javascript: var contacts = " + contacts + ";");
        return true;
    }
    if (url.startsWith("<tracking-scheme>://")) {          // starts location tracking
        startLocationTracking();
        return true;
    }
    ...
}
```

The app never checks **which page** is asking. If any third-party page is ever shown inside the app, for example an advertisement or an embedded form, that page can pull the user's whole address book once the contacts permission has been granted. I could not check whether the app's own website uses this feature, because that would have meant going online. The app declares the contacts and location permissions, and it also logs every address it loads.

### 4\. The same client certificate in every copy of a banking app (Medium)

For one connection, a banking app proves its identity to the server with a client certificate. The certificate and its private key are shipped inside the app, and the password that unlocks them is written into the code:

```java
KeyStore clientKey = KeyStore.getInstance("PKCS12");
clientKey.load(assets.open("<file>"), "<password written in the code>".toCharArray());
client.setSSLSocketFactory(new SSLSocketFactory(clientKey, null));
```

Every copy of the app on every phone carries the same credential, and anyone who downloads the app can extract it. A client certificate is only useful if it identifies something. When everyone has the same one, it no longer tells the server which app or which user is calling. I did not test what the certificate gives access to, because that would have meant contacting the server.

## Apps from independent developers: any malware?

The 129 apps from independent developers were the most likely place to find malware: translators, keyboards, radio players, quizzes, travel guides and a free VPN. Together with the unofficial streaming apps and two independent apps, 139 apps went through an extra malware screening:

-   The **Quark engine**, an open-source malware analysis tool with 280 behaviour rules.
-   **22 malware indicators**, covering brand impersonation, SMS interception, accessibility abuse, hidden or dynamically loaded code, overlay attacks, clipboard monitoring, command-and-control patterns, root commands and more.
-   A **hand review** of the 10 apps that ranked highest.

**I found no malware** (0 apps rated suspicious or malicious). I also found none of the "proxy" SDKs that quietly turn a phone into an exit node for other people's internet traffic, a business model behind some free VPNs and games. The keyboard I reviewed, which can see everything a user types, doesn't send typed text anywhere as far as the code shows.

What I did find:

-   **Advertising almost everywhere.** 67% of the independent apps contain advertising or marketing SDKs; two quiz apps contain 16 each. Several of these ad networks are Russian or Chinese.
-   **A free VPN whose servers you cannot know.** The VPN uses standard, legitimate VPN software. But the list of servers is downloaded from the developer when the app starts, so users cannot tell who runs the servers their traffic passes through.
-   **An app that looks like a public service**, which turned out to be the one with the contacts bridge described above.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1365b74dcdc00aa3.png)

## Why automated scanners are not enough

Most of the numbers in this article come from automated tools, and I checked by hand the findings that sounded worst. The result was instructive.

In banking and government apps, the automated tools reported **12 severe problems**: "certificate checks disabled" and "private keys embedded in the app". After I read the code, **0 of them held up**. Almost all of the flagged code belonged to libraries that contain an insecure option but never switch it on. The "private keys" were the text labels that cryptographic libraries use to recognise key files, not keys. The malware alerts went the same way. Most of the first round of "priority" alerts came from advertising and Google libraries, and none of them turned out to be malware.

Going the other way, one of the real problems above, the shared client certificate in the banking app, was found only by reading the code. No scanner rule flagged it.

That matters beyond this study. A scanner report is a list of leads, not a list of vulnerabilities. Institutions that commission security audits should ask for findings that a person verified, with the code that proves them.

## Recommendations

**For users**

1.  Install apps only from Google Play, and check the developer name before installing an app that uses an Albanian brand or "Albania" in its name. A real bank or ministry publishes under its own name.
2.  When an app asks for contacts, the microphone or location, ask yourself whether it needs it. You can say no, and you can change it later in the phone's settings.
3.  Avoid using banking and government apps on public Wi-Fi. Mobile data is safer.
4.  Be careful with apps that ask to "draw over other apps" or to install other apps, unless you know why.
5.  Keep your phone and your apps updated. Many security fixes arrive silently with updates.

**For banks and the institutions that build government apps**

1.  Make a baseline mandatory for every app that handles money or citizen data:
    -   certificate pinning;
    -   backup rules that exclude sessions and personal data;
    -   screen protection on sensitive screens;
    -   protection against tampered devices.
2.  Do not ship third-party analytics or advertising code in government apps without a clear legal basis, and publish which companies receive what.
3.  Ask only for the permissions the app needs, and check what libraries add to the manifest before each release.
4.  Update bundled libraries as part of every release, and track their known vulnerabilities.
5.  Commission independent security reviews whose findings are verified by hand. Publish a contact or a policy so that researchers can report problems.

## Limitations

-   **Static only.** I read the apps; I did not run them. Weaknesses show what is missing, not that an attack works. Confirmed problems were traced through the code, not tested on a device.
-   **A snapshot.** The versions are those on Google Play on 18–20 November 2026. Apps change with every update, and some of what I describe may already be fixed.
-   **Coverage.** 98 of the 100 organisation apps I planned could be analysed:
    -   four were obtained from the APKPure mirror because Google Play would not serve them to me; their signatures are valid, but the copies cannot be proven identical to Google Play's;
    -   two could not be obtained at all;
    -   one internal HR app is represented by its vendor's generic version.
-   **Hidden code.** Some apps obfuscate their code, or are written in Flutter or React Native, which compile to formats that are harder to read. I may have missed protections that exist only there, and also problems.
-   **Judgement calls.** The severity of each weakness and the "purpose" behind each app's permissions are my assessment. They are documented in the appendix so that others can disagree with them.

## Appendix And Methodology

This appendix is for readers who want to check or repeat my work.

### Sample and acquisition

-   **Selection.** 98 apps from organisations, chosen for reach and sensitivity (banks and e-money, official government and municipal apps, telecoms and other businesses, TV and news, food and delivery) and 129 apps from small and independent developers (in Albania and abroad), found by searching Google Play for "Albania" and "Shqip". Paid apps were excluded. "Government" means apps published by or for an official public body; two private apps that only look like public services were counted as business apps.
-   **Download.** APKs were fetched from Google Play with the open-source tool *apkeep* (Electronic Frontier Foundation), including all split APKs, with an Albanian locale and timezone, on 18–20 November 2026. Four organisation apps that Google Play would not serve were taken from the APKPure mirror; for those, I verified the signatures and the versions compared with the Play listing, but the copies cannot be proven identical to Play's.
-   **Provenance.** For every file I recorded its SHA-256 hash, the signing certificate and the version.

### Analysis (offline)

Every app went through the same local pipeline, without network access:

-   decoding and decompilation (apktool, jadx), manifest and signature parsing (aapt, apksigner);
-   rule-based code scanning (mobsfscan/semgrep), secret and endpoint extraction (apkleaks), packer/obfuscator identification (APKiD);
-   **every native library disassembled and scanned with Ghidra** (dangerous calls, JNI entry points, embedded strings);
-   bundled-library versions matched against published CVEs (OSV and NVD);
-   for React Native apps compiled to Hermes bytecode, the string table was parsed directly;
-   three scorecards (below) computed from the results.

Split APKs were merged so that native code shipped in configuration splits was analysed too.

### Security checklist (S1–S18)

Each check is Pass / Warn / Fail / not applicable. For banks and government apps a missing "expected" protection is a Fail; for other apps it is a Warn.

| #   | Check |
| --- | --- |
| S1  | No unencrypted (cleartext) traffic, taking the Network Security Config into account |
| S2  | No disabled TLS validation (trust-all certificate or hostname checks) |
| S3  | Release build does not trust user-installed certificate authorities |
| S4  | Certificate pinning present |
| S5  | Not a debuggable build |
| S6  | Sensitive data excluded from backups |
| S7  | Current Android target level; minimum level not obsolete |
| S8  | Exported components protected by a permission |
| S9  | Verified app links; custom URL schemes |
| S10 | Screens protected from capture (banks and government only) |
| S11 | WebView JavaScript bridges and file access |
| S12 | Secrets in the app: real secrets vs keys that are public by design |
| S13 | Weak cryptographic primitives |
| S14 | Insecure local storage (not automated; not graded) |
| S15 | App-wide protection against tampering and rooted devices |
| S16 | Bundled libraries with High/Critical CVEs |
| S17 | Privacy (from the privacy checklist; government apps: any ad SDK is a Fail) |
| S18 | Dangerous-call hotspots in the app's own native libraries |

**Grades** (banks and government only): A = no Fail and at most two Warn; B = no Fail; C = one Fail; D = two or three; F = four or more.

Code checks count only the app's own code. In the code checks, code under the paths of known libraries was attributed to those libraries; where a library was obfuscated, it was recognised by its own constants.

### Severity

Each (app, check) weakness was rated High, Medium, Low or Info with a fixed key published with the study. For example: disabled TLS validation that was confirmed by review = High; cleartext allowed in a bank or government app = Medium; missing pinning in a bank or government app = Low, elsewhere Info. Info items are not counted in the totals. Privacy findings are reported separately and not added to the security count.

### Privacy checklist (P1–P13)

1.  number of third-party analytics, crash, ad and attribution SDKs
2.  tracking enabled before consent
3.  consent mechanism
4.  advertising ID use
5.  session-replay SDKs
6.  permissions (see below)
7.  location
8.  hardware identifiers used for fingerprinting
9.  vendor jurisdictions
10.  personal data sent to analytics or crash tools
11.  local data hygiene
12.  Play Store data-safety label versus SDKs found in the code
13.  privacy policy and account-deletion path

The checklist produces its own A–F grade.

### Permissions versus purpose

Each app was assigned one of 20 purpose classes (for example banking, government services, taxi and transport, delivery, media, translator, keyboard, game). Each class lists the sensitive permission groups that fit it: a taxi app may use location, a translator the microphone, a radio app neither. A declared permission outside that list counts as "not needed". This is a judgement; the class of every app and the expected permissions are documented in the study files.

### Malware screening

The 139 apps from small or unknown publishers (all 129 apps from independent developers, the unofficial streaming apps and two small private apps) were additionally screened with the Quark engine (280 behaviour rules) and 22 malware indicators. The indicators cover brand impersonation, signing anomalies, SMS, call and contact access, accessibility and overlay abuse, hidden or dynamically loaded code, packers, clipboard monitoring, command-and-control patterns, root commands, emulator checks and VPN services.

Indicators only ordered the review queue. The apps at the top of the queue were then reviewed by hand. A permission or API on its own was never treated as evidence.

### Review and verification

-   **Hand review.** Every automated finding in a bank or government app that sounded severe (disabled TLS validation, embedded private keys) was reviewed by reading the decompiled code. In other apps I reviewed most of the disabled-TLS findings in the same way; the few I could not resolve in obfuscated code are counted as unreviewed weaknesses (Low), not as vulnerabilities.
-   **"Confirmed".** In this study, confirmed always means confirmed statically: traced from a reachable entry point to the point of harm in the code. No finding was tested on a device.
-   **Numbers.** Every number in this article is generated from the analysis results and listed with its derivation; none was typed by hand.
