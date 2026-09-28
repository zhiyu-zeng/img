---
title: Pwning Millions of Smart Weighing Machines with API and Hardware Hacking | Spaceraccoon's Blog
source: https://spaceraccoon.dev/pwning-millions-smart-weighing-machines-api-hardware-hacking/
source_host: spaceraccoon.dev
clip_date: 2026-09-28T10:22:52+08:00
trace_id: 3e74e984-01d6-4feb-bcfa-e331ec596644
content_hash: 64d98a82cf0d9fbd83bafc318983f833e760877fdfac362f31aa534abeb7ec9c
status: synced
tags:
  - 漏洞分析
  - 硬件逆向
series: null
feed_source: spaceraccoon·漏洞研究
ai_summary: 智能体重秤的用户-设备绑定流程存在 SQL 注入与逻辑缺陷，可让攻击者远程接管数百万台联网健康设备。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3e975244-d011-81cd-a6ba-d168fc696ebb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 智能体重秤的用户-设备绑定流程存在 SQL 注入与逻辑缺陷，可让攻击者远程接管数百万台联网健康设备。
> 
> - **供应链共性：** 众多品牌体重秤源自同一 OEM 或共用第三方库（如 `com.qingniu.heightscale`），一处漏洞即可横向影响多个 App 与设备。
> - **OEM 越权链：** 厂商把随机生成的 MAC 地址既当设备标识又当认证密钥；`/api/device/getDeviceInfo` 存在 SQL 注入，用 `'or\n@@version\nlimit 1\noffset N#` 绕过宝塔云 WAF（`@@version` 恒真、`\n` 替代空格），泄露 20 万余台设备序列号，再用 `/api/device/bindv2` 直接绑定他人设备。
> - **硬件侧突破：** Withings WBS06 为裸机 ARM 固件；依据 FCC 内部照片与 WBS05 的 Reddit 帖定位底部 Tx/Rx/GND 三孔，逻辑分析仪定波特率，廉价 CP2102 出乱码、换 FT232 后取得串口调试 shell；替换设备 mTLS 证书因自签名被服务器拒绝。
> - **认证流程：** 设备以 mTLS 连接、服务器下发 nonce、设备私钥签名换取设备会话令牌；用户绑定可由 App 或设备任一方发起，以 `Session-Id` 加 `sessionidtoken` 双向校验。
> - **致命逻辑漏洞：** 服务端仅按 `sessionidtoken` 的会话类型判断流程，未校验请求中的 `userid`/`deviceid` 是否与 `Session-Id` 一致，攻击者用自己的用户令牌冒充设备发起流程即可重新绑定任意设备，估计影响 100 万台以上；2024-12-29 上报，2025-01-03 确认修复。

## Pwning Millions of Smart Weighing Machines with API and Hardware Hacking

Psst: I’m publishing a book with No Starch Press! I wrote [“From Day Zero to Zero Day”](https://nostarch.com/zero-day) for newcomers looking to enter the rarefied world of vulnerability research. From code review to reverse engineering to fuzzing, I go through the “how”, not just the “what”, of hunting zero days - stuff that I wish I could’ve learned from the beginning. Available for [early access](https://nostarch.com/zero-day) now at all your usual channels including [Amazon](https://www.amazon.com/Day-Zero/dp/1718503946), out in June 2025!

Why hack one device, when you can hack all of them? By reverse-engineering and finding vulnerabilities in user-machine association flows for smart weighing machines, I was able to take over millions of internet-connected health devices. Hardware and web security are two halves of modern smart device security, and learning to hack both can yield impressive and scary results. This blogpost goes through the basics of hacking connected smart devices from end-to-end, focusing on the critical workflow of user-device association.

## Internet-Connected… Weighing Machines???

While I was on holiday, I noticed a strange icon on the screen of a weighing machine in the hotel gym. It was a WiFi icon. I realised to my horror that people have now decided that connecting *weighing machines* to the internet is a good idea (RIP, [Internet of Shit](https://x.com/internetofshit)). When I checked on Amazon, I noticed a plethora of available options sporting WiFi or Bluetooth connectivity, many with suspiciously-similar mobile apps.

![Weighing Machines on Amazon](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2b76a551a9954d89.png)

In fact, many were made by the same OEM. Even if they were made by different OEMs with marginally different codebases, a quick peek at the associated Android applications revealed that many of them used the same common libraries, such as `com.qingniu.heightscale`, presumably because it would take way less effort to write a compatible library from scratch.

![Qingniu Library on Arboleaf App](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da99ba7f4e3b5c73.png)

![Qingniu Library on Renpho App](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/84d5eec23e868b00.png)

While the BLE protocol-related code was interesting and allowed me to figure out the right opcodes to communicate with these devices over Bluetooth, most of them have been reverse-engineered and documented by the [openScale project](https://github.com/oliexdev/openScale). In any case, it wasn’t very interesting trying to figure out a local exploit that required close physical proximity.

## We Need to Go Deeper

If your goal is to hack not just one but all of the devices, a key target is the user-device association flow. For example, when you first buy a smart device and take it out of the box, you often need to login to a mobile application and scan a QR code or pair with the device over Bluetooth. Once done, your user account on the manufacturer’s web service is now associated with the physical device.

This can be a tricky process to secure. Starting from the factory, each device needs a unique device identifier/secret so you don’t accidentally pair with another device B when scanning the QR code of device A. The least-secure way of doing this is using a static string such as a UUID, MAC address, or serial number. While these might be fine as an **identifier**, it’s not really secure as an **authentication secret**. Even if they might be randomly-generated and thus hard to bruteforce, it’s going to be very difficult to revoke them in case they get leaked.

A more secure option would be to generate cryptographic keys like public/private key pairs. This still makes it a target for physical memory extraction, and if the key generation process is weak in some way, an attacker could still potentially generate arbitrary keys for any device. The conventional solution it to rely on good old public key infrastructure and certificate architecture, allowing for easy revocation of compromised certificates.

So the typical flow would go:

1.  User installs mobile app and logs in with their user account.
2.  Through the app, user connects to the hardware device.
3.  Hardware device’s secret is sent to the mobile app.
4.  Mobile app sends both the user’s secret (e.g., session token) and the device’s secret to the server.
5.  Server confirms the authenticity of the secrets and associates the user account to the hardware device.
6.  User can now control and fetch data from the hardware device remotely over internet.

Seems reasonable. What could go wrong?

### SQL Injection in OEM (BT-WAF Bypass)

The OEM in question stumbled right out of the gate. Without even needing to buy a physical device, I enumerated the available API endpoints on the mobile application, including an interesting `api/ota/update` endpoint. I thought this would allow me to get my hands on firmware to further understand the device. Thanks to the decompiled Java code for the Android mobile app, I was able to easily reconstruct the required JSON body parameters. However, it appeared that even with the right inputs the manufacturer didn’t actually have a lot of updates to share.

Unfortunately, while exploring the API endpoints, I discovered that there were several endpoints that suffered from basic SQL injections. Interestingly, the server used a Chinese WAF called Baota Cloud WAF (BT-WAF), which was much stronger than many typical WAFs I had faced before. In particular, a `/api/device/getDeviceInfo` endpoint allowed looking up serial numbers for devices, which were used as *both identifiers and authentication secrets* by this manufacturer. The serial number itself was used in a `/api/device/bindv2` endpoint that would bind, or associate, the requesting user’s account with the device referenced by the serial number! The “serial number” itself was a randomly-generated MAC address which was stored on the devices.

Here’s the initial payload body for the vulnerable endpoint:

```fallback
{
  "serialnumber":"'001122334455"
}
```

There’s not a lot to work with here. If there was a second injection point, I might have been able to work out a more subtle spanned payload. With a lot of trial and error, I eventually managed to land on this bypass for BT-WAF:

```fallback
{
  "serialnumber":"'or\n@@version\nlimit 1\noffset 123#"
}
```

Let’s break it down a bit. If this was injecting into an SQL statement like `SELECT * FROM devices WHERE serial = 'INJECTION'`, the final injected SQL would be: `SELECT * FROM devices WHERE serial = 'INJECTION'or\n@@version\nlimit 1\noffset 123#'`. There are two key bypass gadgets here:

1.  `@@version` always evaluates to true and can be used instead of the more obvious `1=1`.
2.  `\n` newlines can break up a statement instead of spaces.

With this, I was now able to leak the device information, including the serial number used as authentication secrets, of any device! As it turned out, by incrementing the `offset`, this numbered more than two hundred thousand devices.

### Getting a Serial Debugging Shell on the Withings WBS06

As I turned to research other devices, I came across the [Withings Body](https://www.withings.com/sg/en/body?srsltid=AfmBOoqTUYcHF_qoiAV6klCRR3NgJJMHBdKd06C0kLa_Gu4H_BFSTKQ_) weighing machine. Similar to the others, it featured WiFi and Bluetooth connectivity and a custom mobile application. This was a much more reputable brand and interestingly appeared to be co-branded as the Nokia Body scale as well.

It was relatively easy to pull the firmware via the app’s API for futher analysis. However, unlike more complex firmware used by routers and such that typically included a full filesystem and Linux operating system, this was a baremetal ARM firmware. I wish there was more I could shed light on about the art of reversing baremetal ARM, but videos and blogs by experts with a lot more experience basically tell you the same thing: it’s extremely hard.

Nevertheless, I made a crack at it, following the [Analyzing bare metal firmware binaries in Ghidra](https://blog.attify.com/analyzing-bare-metal-firmware-binaries-in-ghidra/) blogpost by Barun and getting a somewhat-decent approximation of what I needed to know. This involved figuring out the microcontroller model of the WBS06 via internal photos from their [FCC certification documentation](https://fcc.report/FCC-ID/XNAWBS06/) and setting the correct memory mappings.

What grabbed my attention was a couple stray strings that hinted at a… shell?

```fallback
Connection Manager Shell Command
Usage:
  wifi <wifi_sync_flags>
            Attempts a Wifi sync with the given flags.
            wifi_sync_flags is a combination of the following flags:
                0x01 (allow update), 0x02 (store DbLib), 0x04 (send DbLib), 0x08 (send 
                rawdata),
                0x10 (send wlog), 0x20 (send events), 0x40 (send extras)
  wifi_no_update <wifi_sync_flags>
            Attempts a Wifi sync, no update allowed (even if set in flags).
  wifi_update <wifi_sync_flags>
            Attempts a Wifi sync, allows update if available (even if not set in 
            flags).
  bt        Attempts a Bluetooth sync
  do   Attempts a Wifi/Cellular sync and fallback to Bluetooth if it fails.
```

Why would a smart weighing machine have a *shell* on it? With a bit more sleuthing, I came across a [Reddit post by another researcher](https://www.reddit.com/r/withings/comments/18vuckz/comment/kg0rzn3/) who had actually figured out the UART pins on an earlier model, the WBS05.

This seemed pretty straightforward, so I excitedly set about trying to replicate this on the WBS06. The biggest clue was that the WBS06 also had the same three holes on the bottom corresponding the the Tx, Rx, and GND UART pins, and comparing this to the internal pictures from the FCC documentation confirmed this.

![Exterior of WBS06 for UART pins](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/375762dff8a07706.png)

![Interior of WBS06 for UART pins](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/889965d99a4d4482.png)

However, my initial efforts failed. Despite correctly figuring out the right baud rate with a logic analyser, my serial connection kept returning gibberish. After many more hours of pain, I realised that my cheap CP2102 USB to TTL converter was responsible for the issue, and using a more reliable FT232 finally got the results I needed.

![Logic Analyzer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10413a2f08f3e595.png)

Now that I had a debugging shell, I could explore all of the stored data on the device, including the certificate, secret keys, and more! Of course, while this was exciting, it didn’t really mean much - I could “hack” a device I already owned, big deal.

### Broken User-Device Association Logic

To really test remote vectors, I needed to fully understand how the device authenticated itself to the API servers and performed user-machine association.

For example, the `connection_manager wifi` command would attempt a connection to the API servers with verbose debug logging.

```fallback
shell>connection_manager wifi

[info][CM] Connection manager request, action = 3, wifi sync flags = 0xffffffff
[VAS] t:15
[info][CM] Start with cnlib action = 3
[VAS] t:15
[CNLIB] Recovered LastCnx from DbLib
[AM] Defuse id 4
[TIME] Current time (timestamp) 0 , 8h 0min 0sec
[TIME] Waking up in 16h 90min 60sec
[TIME] Add random time 0
[AM] Set id 3 at 63060
[AM] Set id 1 at 600
[CNLIB] Try to connect via wifi (1)
[DBLIB][ERASEBANK] Bank 1
[info][DBLIB][SUBSADD] 14 0
[info][CM] Initializ[VAS] t:15
e Wifi
[WIFIM] Request
[WIFIM] init
[VAS] t:15
wifi_chip_enable
bcm43438_request
== Set dcdc_sync ==
bcm43438_request: pwron module
[WIFIMFW] current_fw == FW_2 1
version 1
size 80
[WIFIMFW] wifi_crc: 0
[WIFIMFW] Take current bank
[WIFIMFW] Firmware block 1a8000 : OK
[WIFIMFW] Wifi Offset 21a370, lenght 58d1d
[WWD] HT Clock available in 31 ms
[WWD] mac: a4:7e:fa:19:2c:f6
supported channels: 13
[WIFIM] init OK
[info][CM] Wifi initialized
[WIFIM] join_configured_ap
[VAS] t:15
[WIFIM] ssid = ...
[WIFIM] key  = ...
[WIFIM] WPA key already saved
[WWD] join: ssid=<...>, sec=0x00400004, key=<...>
[WDM] wwdm_join_event_handler: state=1, wifim_err=9, stopped=0
[WDM] wwdm_join_event_handler: state=2, wifim_err=9, stopped=0
[WDM] wwdm_join_event_handler: state=2, wifim_err=0, stopped=1
[WDM] wwdm_join_event_handler: stopped
[WWD] join: wiced_res=0, wifim_res=0
[info][WIFIM] join: attempt #0, rc=0
[info][WIFIM] join: SSID <...> join rc=0 after 1 attempts
[VAS] t:15
[VAS] t:15
[info][WIFIM] join: RSSI=-64
[VAS] t:15
[WIFIM] connect: use static ip
[WIFIM] Interface UP (Status : 0xf)
[WIFIM] netif_up: use DHCP
[WIFIM] Interface UP (Status : 0xf)
[WIFIM] netif_up:
[WIFIM] IP=192.168.0.9
[WIFIM] Mask=255.255.255.0
[WIFIM] Gw=192.168.0.1
[WIFIM] DNS[0]=192.168.0.1
[WIFIM] DNS[1]=0.0.0.0
[WIFIM] connect_cfg_ap: success
[info][CM] Joined configured AP successfully
[VAS] t:15
[info][CM] Store DbLib...
[VAS] t:15
[DBLIB][ERASEBANK] Bank 2
[info][CM] Store DbLib done
[HTT[VAS] t:15

S_CLIENT] Init
[HTTPS_CLIENT] Init
[info][CM] Wslib init successful, carry on
[VAS] t:15

[WS] WsLib_StartSession

[WS] __WsLib_Once
[WS] Https_client browsing <https://wbs06-ws.withings.net/once?appliver=1181&appname=WBS06&apppfm=device>
[HTTPS_CLIENT] New connection or Adress/Security Changed
[HTTPS_CLIENT] Close
[HTTPS_CLIENT] Init
[HTTPS_CLIENT] Handshake started
{"status":0,"body":{"user":[{"userid":...,"screens":[{"id":66,"deactivable_status":6,"src":1,"embid":11,"rk":1}]},...]}}
>
[DBLIB][ERASEBANK] Bank 1
[WS] WSLIB_OK
[WS] Https_client browsing <https://wbs06-ws.withings.net/v2/summary?appliver=1181&appname=WBS06&apppfm=device>
[HTTPS_CLIENT] Socket already opened
[WS] Params <action=getforscale&sessionid=...>
{"status":0,"body":[{...}]}
>
[WS] WSLIB_OK
[USLIB] FLUSH STORED MEASURE
[USLIB] 0 measure(s) flushed
[WS] Https_client browsing <https://wbs06-ws.withings.net/v2/weather?appliver=1181&appname=WBS06&apppfm=device>
[HTTPS_CLIENT] Socket already opened
[WS] Params <action=getforecast&sessionid=...short=1&enrich=t>
...
```

I also attempted to replace the mTLS certificates stored on the device to make WiFi interception easier, but it worked as intended as the server rejected my own self-signed certificates.

Nevertheless, thanks to the debugging logs and reading various state data from memory, I worked out most of the authentication flow:

1.  After receiving WiFi credentials over Bluetooth from mobile app, device can now independently connect to API server.
2.  Device presents its certificate and connects to the API server using mutual TLS (mTLS).
3.  API server returns a nonce.
4.  Device signs nonce with local private key and sends it to server.
5.  API server confirms signature is valid and returns a device session token.
6.  Device can now interact with API server using device session token as authentication.

Interestingly, the user-device association workflow could be done in two ways. The first way us initiated by the user’s mobile application:

1.  Mobile app already has user’s session token.
2.  App fetches device’s session token over Bluetooth.
3.  App authenticates to API server with `Session-Id: USER_SESSION_TOKEN` and sends the request payload `userid=USER_ID& sessionidtoken=DEVICE_SESSION_TOKEN`. `userid` is a simple incrementing number.
4.  API server confirms `Session-Id` as well as `sessionidtoken` are valid, before associating `userid` with the device ID that `DEVICE_SESSION_TOKEN` belongs to.

The second way is initiated by the device:

1.  Device already has device session token.
2.  Device fetches user’s session token over Bluetooth from the app.
3.  Device authenticates to API server with `Session-Id: DEVICE_SESSION_TOKEN` and sends the request payload `deviceid=DEVICE_ID& sessionidtoken=USER_SESSION_TOKEN`. `deviceid` is a simple incrementing number.
4.  API server confirms `Session-Id` as well as `sessionidtoken` are valid, before associating `deviceid` with the user ID that `USER_SESSION_TOKEN` belongs to.

Both methods were properly hardened and validated; attempting to change `userid` in the first flow or `deviceid` in the second flow would fail because they did not match the `Session-Id` session token.

However, there was one fatal flaw in the business logic. Perhaps I can illustrate this with an approximation of the server-side validation logic:

```javascript
if (req.session.isValid) {
  if (!validateSession(req.body.sessionidtoken)) {
    return error
  }

  const targetSession = fetchSession(req.body.sessionidtoken)

  // user app-initiated flow
  if (targetSession.type === 'device') {
    associate(req.body.userid, targetSession.id)
  // device-initiated flow
  } else if (targetSession.type === 'user') {
    associate(req.body.deviceid, targetSession.id)
  }
}
```

What’s the mistake here? Well, consider a request where *both* `Session-Id` and `sessionidtoken` are the attacker’s user session token, while `deviceid` is set to a device that they don’t own. The logic will still think that this is a device-initiated flow and never require the attacker to provide a session token corresponding to the target `deviceid`! Take a couple seconds to parse the code with this in mind.

Instead, the code should have done an additional validation:

```javascript
if (req.session.isValid) {
  if (!validateSession(req.body.sessionidtoken)) {
    return error
  }

  const targetSession = fetchSession(req.body.sessionidtoken)

  // user app-initiated flow that validates that user to be associated matches the session token header
  if (req.body.userid === req.session.id && targetSession.type === 'device') {
    associate(req.body.userid, targetSession.id)
  // device-initiated flow that validates that devuce to be associated matches the session token header
  } else if (req.body.deviceid === req.session.id && targetSession.type === 'user') {
    associate(req.body.deviceid, targetSession.id)
  }
}
```

With this mistake, based on the available device ids, I estimated more than 1 million potential devices could be re-associated to an attacker user account.

The responsible disclosure was fixed rapidly even over the holiday period:

-   29 December 2024: Reported to vendor
-   3 January 2025: Report confirmed and fixed

This demonstrates their seriousness about security - vulnerabilities affect every vendor, but I know which one I’d rather buy from.

When hacking hardware, it can be hard to *scale* (pun intended) beyond a single device to a fully remote exploit. User-device association is one of those critical flows that can bypass many standard hardware and network hardening controls, because the vulnerabilities lie on the API server rather than on the device. It’s worth taking a look especially with consumer-grade hardware that prioritizes usability and ease of setup.
