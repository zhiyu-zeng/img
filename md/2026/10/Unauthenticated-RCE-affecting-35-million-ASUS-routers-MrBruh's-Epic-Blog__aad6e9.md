---
title: Unauthenticated RCE affecting 35 million ASUS routers | MrBruh's Epic Blog
source: https://mrbruh.com/asusrouter/
source_host: mrbruh.com
clip_date: 2026-10-23T03:39:42+08:00
trace_id: 570013c2-b8e1-4f82-8090-7b0bb523dba2
content_hash: b2fcadb4861e12f346e25c7e85a15ded53746eaecc91d8ada561456a00d2a9bf
status: synced
tags:
  - 漏洞分析
  - 网络工具
series: null
feed_source: mrbruh·漏洞研究
ai_summary: ASUS 路由器 httpd 的 NTP 设置存在命令注入，配合 OAuth 令牌刷新接口的空密钥校验缺陷，可实现未认证远程 root shell，影响 2018 年后机型（估约 3500 万台）。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 40175244-d011-8167-a070-f6b3bb38f6a5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ASUS 路由器 httpd 的 NTP 设置存在命令注入，配合 OAuth 令牌刷新接口的空密钥校验缺陷，可实现未认证远程 root shell，影响 2018 年后机型（估约 3500 万台）。
> 
> - **注入点：** ASUS 固件用 `doSystem` 包装器执行 shell 命令，httpd 内有 109 处调用；检查到第 7 个函数即发现 NTP 更新逻辑把 NVRAM 中 `ntp_server0` 的前 32 字符拼进 `nslookup`，可用 `;` 逃逸执行额外命令。
> - **单行 payload：** `;telnetd -l/bin/sh -p9999;` 仅占 26 字符（31 可用，1 字节留给终止符），实际展开为三条命令，其中 telnetd 直接开出 shell；但设置该参数的接口本身要求管理员令牌。
> - **认证绕过原理：** `/asusrouter_request_access_token.cgi` 先用空字符串初始化共享密钥，仅在 `device_id` 已注册时才替换；传入未注册的 `device_id` 不会提前返回，攻击者用空密钥加密「时间戳 + 路由器 MAC」即可换到管理员令牌。
> - **利用链与限制：** 伪造令牌后可改 NTP 等自动重启，或开启 SSH 并注入公钥登录；但漏洞只在有人用 ASUS Router App 完成过 OAuth 配对的路由器上成立，未装 App 的用户反而不受影响。另外访客网络的设备隔离 iptables 规则仅覆盖 IPv4，理论上可经 IPv6 绕过。
> - **披露与影响面：** 6 月底上报，ASUS 接受 4 个漏洞中的 3 个（1 个重复），并请求在原 90 天期限外再延 30 天，被作者拒绝后不久即推送修复；厂商未提供受影响型号清单，作者按固件版本二分推断 2018 年后机型普遍受影响，CVE 编号至今未告知。

As part of my ongoing security research into six or seven different router vendors (see [motorola](https://mrbruh.com/motorola/) and [tplink](https://mrbruh.com/tplink/)), I ended up taking a look into ASUS and their router firmware.

I ended up choosing the ASUS “RT-AX86U Pro” as a starting point for this research. It’s a popular WiFi 6 gaming router that released in 2022. It also has the ability to act as a mesh router.

![The ASUS RT-AX86U Pro router](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7345608588948ae0.avif)

My very first router finding was a command injection vulnerability in my [TPLink](https://mrbruh.com/tplink/) router. I decided to look for a similar issue in the ASUS firmware.

The first step was to open some of the binaries in a tool called IDA, and look at what cross references there were to the Linux “system” syscall. However as it turned out, ASUS runs any Linux commands via a wrapper called “doSystem” instead.

![IDA showing the doSystem wrapper in the ASUS httpd binary](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/16f74ab31699fbe5.avif)

When I pulled up the cross-references to “doSystem” in ASUS’s httpd binary, I found that there were 109 different instances where it was being called.

I only had to check 7 of these functions to find a vulnerable sink.

![List of functions in the httpd binary that call doSystem](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/72f5689fdf59122a.avif)

This caller was from a function that handled updating the NTP server that the router used.

In short, it pulls the first 32 characters of “ntp_server0” from storage (NVRAM) and then calls “nslookup” with the value as the argument being parsed in.

![Function reading the ntp\_server0 value from NVRAM](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c1d3a0bc58bc57b4.avif) ![The ntp\_server0 value being passed to nslookup](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/724767df26744101.avif)

The main issue is that you can use a metacharacter such as “;” to escape from the intended nslookup command and run a second command of your choosing as well.

An example payload is `;telnetd -l/bin/sh -p9999;` which fits within 26 of the 31 usable characters (one byte is reserved for a null/terminator byte).

This evaluates to `nslookup ;telnetd -l/bin/sh -p9999; &> /dev/null` and results in three different commands attempting to be run.

```
nslookup (doesn't do anything)
telnetd -l/bin/sh -p9999 (spawns a telnet shell)
&> /dev/null (fails and does nothing)
```

To set this over the network, you can call the following endpoint. This endpoint requires an administrator authentication token to trigger.

![Request used to set the router&rsquo;s NTP server](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a3dce8d0bc1db185.avif)

## Authentication bypass

This naturally brings us to the next stage of exploitation. By requiring an admin login, this makes it more akin to a jailbreak than a real exploit. So I went searching for an authentication bypass.

ASUS has a mobile app that lets you control your router from your phone. It has over 5 million downloads on Android and has decent reviews.

![The ASUS Router mobile app on the Google Play Store](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/98dcf27ad978a602.avif)

To control your router via the mobile app, you need to first link the router via OAuth to your ASUS account. Once it has been linked, the mobile app calls `/asusrouter_request_token.cgi` with proof that you are signed into your ASUS account.

If the router confirms that the OAuth proof is valid and correlates with an authorised account, it saves the mobile app’s unique `device_id` to NVRAM alongside a randomly generated shared secret.

This shared secret and a short lived **administrator authentication token** is shared with the end user (mobile app).

`{"asusrouter_refresh_token":"%s", "asus_token":"%s"}`

* * *

If at a later date, the mobile app needs to refresh that admin authentication token after it has expired, the app calls `/asusrouter_request_access_token.cgi`.

It encrypts the current time and the MAC address of the router with the shared secret. This payload is sent to the router alongside its unique `device_id`.

`{“label_mac”:"%s", “timestamp”: %d}`

If the payload decrypts, the MAC address is correct and the timestamp is recent, and it mints a new admin token for the mobile app to use.

The following screenshot is a pseudocode mockup of how this functionality works.

![Pseudocode for the OAuth admin token refresh](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3b3624669574c32.avif)

It first initialises the shared secret to be a blank string, then if it can find the device_id in NVRAM it pulls the corresponding shared secret and sets the string to that value.

It then attempts to decrypt and validate the encrypted payload using the secret, if it succeeds then you are given an admin token.

The problem is that it does not early-exit if you provide a device_id that has not been registered.

An attacker can then encrypt the current time and router MAC address using a blank key, then send the router the payload alongside an invalid device_id.

![Pseudocode showing the authentication bypass](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/df3d82dc92d06571.avif)

This makes the full chain be the following:

1.  Forge an access token using an invalid device id
2.  Use the token to set a short command as the ntp_server
3.  Wait for the NTP server to auto restart
4.  You get a shell!

There is also an alternative path that I found to be more reliable:

1.  Forge an access token using an invalid device id
2.  Use the token to enable SSH access (over the LAN or WAN)
3.  Use the token to add an SSH public key to be authorised
4.  SSH into the router
5.  You get a shell!

**I didn’t realise this until I actually went out and bought a cheap ASUS router to test this, but one big caveat is that the exploit does not work if no one has completed the mobile app’s pairing process.**

If you avoided downloading the app for whatever reason, you can be proud because it just saved you from potentially getting hacked.

## Additional findings

While brainstorming possible attacker scenarios with Steve Burke (Gamers Nexus) I suggested that an attacker could use a guest network to gain a foothold onto the network.

It turned out though, that when Steve tried testing this scenario, ASUS applied device isolation to the guest network so the exploit couldn’t talk to the router.

All was not in vain though, it turns out that when I took another look at the firmware for the router, the guest isolation iptables rule only applies to IPv4 and you could theoretically exploit this via IPv6.

## Proof of Concepts

The alternative (SSH) path proof-of-concept can be found at: [https://github.com/cybersecurity/ASUS-Router-RCE-PoC](https://github.com/cybersecurity/ASUS-Router-RCE-PoC)

(Full disclosure, the PoC is entirely vibe coded)

## Affected devices

In our email exchanges, ASUS did not want to give me a list of affected models and would rather give me the affected firmware versions.

With this information in hand I performed a binary search and found that every router from 2018 onwards is likely affected by this vulnerability.

![Table of affected ASUS router models and firmware versions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0cc52beed6fcfe0f.avif)

I then fed this information to Claude (so you know its probably wrong) and it estimated that ~35 million routers worldwide are affected by this vulnerability.

## Reporting

As I expected, ASUS was somewhat troublesome to report vulnerabilities to. I first reported my findings in late June, and despite them providing Beta firmware 2 months into the 3 month disclosure period, they said they would not be able to publish the fix within the 90 day period.

As a result of this, they wanted an additional 30 day extension which I declined.

```sql
Regarding the identified vulnerabilities, we anticipate that the necessary updates and fixes will be ready for release between the end of October and the middle of November.

In light of this timeline, and referencing the industry-standard 90 (+30) day disclosure period, we would like to request that the publication of any related articles or public disclosures be delayed accordingly.
```

After declining their 30 day extension, I saw that only a short time later, they had pushed out a fix for this vulnerability for some of the affected router models (I didn’t check all of them).

Given this, I am a little confused. If they managed to get the fix for the vulnerability shortly after asking for additional time, then why ask in the first place.

ASUS has not responded back to me via email since I declined their extension and have not told me if any CVEs have been assigned yet.

## Donations

So far, for the vulnerabilities I have personally reported to AMD, ASUS, Google, Motorola, MSI, Netgear, TP-Link (and more), I have been paid a total of $0 in bug bounties.  
  
If you found this article interesting or useful, you can buy me a coffee via my Ko-fi: [https://ko-fi.com/mrbruhh](https://ko-fi.com/mrbruhh)

## Timeline (DD/MM/YYYY)

-   27/06/26 – Report submitted
-   01/07/26 – ASUS Acknowledges report
-   03/08/26 – Requested update
-   07/08/26 – 3 of 4 vulns accepted. One is a dupe.
-   19/08/26 – ASUS provides Beta firmware
-   04/09/26 – Requested update
-   26/09/26 – 90 day disclosure period ends
-   15/11/26 – Vendor estimated fixed firmware release date
