---
title: Accessing region-locked iOS features, such as EU app stores
source: https://downrightnifty.me/blog/2025/02/27/eu-features-outside.html
source_host: downrightnifty.me
clip_date: 2026-11-13T10:33:54+08:00
trace_id: ff404d6a-fe0c-4381-959a-3de54803cd74
content_hash: e8d2fa88803ea0b8e310d48b033270ab16aad2e5bc8eecdfdd0baa458339a0fa
status: synced
tags:
  - iOS逆向
  - 风控对抗
series: null
feed_source: downrightnifty·iOS/IoT安全
ai_summary: |-
  - **核心原理：** Apple `countryd` 资格判定系统按优先级取值（WiFiAP=1、ServingCellMCC=2、NearbyCellsMCC=3、LatLonLocation=4）；Location Services 优先级最高，其结果可覆盖其它信号源，而飞行模式下它只依赖 GPS 和附近 Wi-Fi。
  - **伪造方法：** 用 ESP32（每块烧录 25 个伪造 AP，共 50 个）重放从 WiGLE 数据库查询的目标国家真实 Wi-Fi 热点数据（skylift 工具生成 sketch），配合法拉第屏蔽袋隔离真实信号与 GPS，使 iPhone 定位到伪造的 EU 位置（如荷兰 Rijksmuseum）。
  - **操作链路：** 设备开启飞行模式→接入带 VPN 的路由器（有线）→切换系统 Region→注册 EU 区 Apple ID 并装一款免费 App 初始化→放进法拉第袋连接外接键鼠屏→重开定位服务后 Apple Maps 显示目标国，即可安装 AltStore PAL 等第三方商店。
  - **验证环境：** iPhone 15 + iPad Mini 6（iOS 18.2.1），Wi-Fi 版 iPad 甚至只需 Location Services 或 Wi-Fi 国家码即可伪造，更简单；作者实测方法稳定可靠。
  - **时效限制：** 设备离开伪造环境后判定失效，但有 30 天宽限期；每月重复一次伪造流程即可持续使用，已下载的第三方商店应用仍可用但不再更新。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41775244-d011-8125-867d-e8d4aa6451fb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **核心原理：** Apple `countryd` 资格判定系统按优先级取值（WiFiAP=1、ServingCellMCC=2、NearbyCellsMCC=3、LatLonLocation=4）；Location Services 优先级最高，其结果可覆盖其它信号源，而飞行模式下它只依赖 GPS 和附近 Wi-Fi。
> - **伪造方法：** 用 ESP32（每块烧录 25 个伪造 AP，共 50 个）重放从 WiGLE 数据库查询的目标国家真实 Wi-Fi 热点数据（skylift 工具生成 sketch），配合法拉第屏蔽袋隔离真实信号与 GPS，使 iPhone 定位到伪造的 EU 位置（如荷兰 Rijksmuseum）。
> - **操作链路：** 设备开启飞行模式→接入带 VPN 的路由器（有线）→切换系统 Region→注册 EU 区 Apple ID 并装一款免费 App 初始化→放进法拉第袋连接外接键鼠屏→重开定位服务后 Apple Maps 显示目标国，即可安装 AltStore PAL 等第三方商店。
> - **验证环境：** iPhone 15 + iPad Mini 6（iOS 18.2.1），Wi-Fi 版 iPad 甚至只需 Location Services 或 Wi-Fi 国家码即可伪造，更简单；作者实测方法稳定可靠。
> - **时效限制：** 设备离开伪造环境后判定失效，但有 30 天宽限期；每月重复一次伪造流程即可持续使用，已下载的第三方商店应用仍可用但不再更新。

The European Union's Digital Markets Act obligates Apple to provide certain features to iOS users in the EU, such as [third party app stores](https://www.doesioshavesideloadingyet.com/). I live in the US and was able to develop a relatively-straightforward method to spoof your location on iOS and access these features, as well as any other region-locked iOS features you might be interested in experimenting with, even if you aren't in the required region.

If you look at the [reverse engineered documentation](https://theapplewiki.com/wiki/Eligibility), it would seem to be difficult to fool Apple's `countryd` service, since it uses almost all available hardware radios to determine your location – GPS, Wi-Fi, Bluetooth, and cellular. However, Apple [has developed a "priority" system](#appendix-notes-on-apples-eligibility-system), roughly ranking the relative reliability of each location determination method. Since Location Services has the highest priority value, if it returns a location result, the results from the other methods seem to be ignored. Location Services relies solely on GPS and nearby Wi-Fi access points if Airplane Mode is enabled (and Wi-Fi re-enabled). Therefore, if you can [spoof Wi-Fi geolocation](https://github.com/adamhrv/skylift) (or if you can [spoof GPS](https://kaitlyn.guru/projects/spoofing-gps-with-an-sdr/)), then you can access region-locked features from anywhere, even on the iPhone with its wide array of radios.

On non-cellular iPad models, it has the potential to be even easier, because they only use Location Services (which can be disabled), or Wi-Fi country codes (which can be trivially spoofed). [I was able](https://downrightnifty.me/assets/eu_features_outside/ipad_wifiap_spoof.png) to get this spoofing method working as well. However, it's not covered here.

I tested this with:

-   2 ESP32 units creating 25 spoofed networks each (total 50)
-   iOS 18.2.1 on an iPhone 15, and an iPad Mini 6th gen

I was amazed at how consistent and reliable spoofing is, especially accounting for the low cost of the hardware involved and the simplicity of the spoofing software and method.

Most of the work was already done by Lagrange Point and [Adam Harvey](https://adam.harvey.studio/), developer of the Skylift tool. I was inspired by Lagrange Point's article to experiment with this and to reproduce their results. Check out their article on [enabling Hearing Aid mode on AirPods in unsupported regions](https://lagrangepoint.substack.com/p/airpods-hearing-aid-hacking)!

Please note that Apple could make the checks more difficult to bypass in the future through iOS updates. They don't have much of a reason to, since the current system is most likely more than sufficient to deter the average user from doing this, but it's very possible.

## Procedure

### What you'll need

-   Some experience with the command line
-   An iOS/iPadOS device with a USB-C port (recent iPads, or iPhone 15+)
    -   You might be able to make it work on a Lightning iPhone, but it's much easier with a USB-C port + hub
-   A USB-C hub with Ethernet, HDMI out, and several USB ports
-   A USB keyboard and mouse
-   A [USB-C extension cable](https://www.amazon.com/UGREEN-Extension-Extender-Nintendo-MacBook/dp/B08NTCD6VQ?s=electronics)
-   A display with HDMI input
-   One or two ["faraday pouches"](https://www.amazon.com/Faraday-Protector-Fireproof-Waterproof-Anti-Theft/dp/B0C7FVS19F?s=electronics); make sure one is large enough to hold your device, and if buying a second make sure it's large enough to hold the other one
    -   Any other faraday cage setup allowing only the tip of a single USB-C cable to break through the cage will work too, but these pouches make it easy
    -   In my testing, using two pouches did reduce the number of external Wi-Fi networks appearing on the Wi-Fi list to zero, but I was still able to make it work with only one pouch – WMMV
-   A router that you can install a VPN on
    -   You'll need to plug the router directly in to the device via an Ethernet cable, so a secondary/portable router is preferred
-   Access to a VPN service with an option to place yourself in an EU country
-   One or more [ESP32 dev modules](https://www.amazon.com/Espressif-ESP32-DevKitC-32E-Development-Board/dp/B09MQJWQN2?s=electronics) (preferably at least two)
-   A small battery power supply for the ESP32 modules (a small USB power bank works)
-   A free [WiGLE](https://wigle.net/) account

These instructions assume you're using a Unix shell, so you might have to modify some of the commands slightly if you're on Windows.

### Preparing the router

1.  Install a VPN on your router placing you in your chosen target country.
    -   For OpenWrt routers: see [https://openwrt.org/docs/guide-user/services/vpn/wireguard/client](https://openwrt.org/docs/guide-user/services/vpn/wireguard/client)
2.  Select an EU member state supported by your VPN as a spoof target. I chose the Netherlands.

### Preparing the device

#### Creating a secondary Apple ID

You can't easily change the region on your Apple ID, and you probably don't want to do that anyway. But you can create a secondary Apple ID for use only while your device thinks that it's in the EU.

1.  Enable Airplane Mode and disable Bluetooth and Wi-Fi.
2.  Connect the device to the USB-C hub, and the USB-C hub to the router via Ethernet.
3.  Change your device region to your target country in Settings → General → Language & Region → Region.
4.  Sign out of your Apple ID: Settings → Your Account → Sign Out.
    -   You'll need to sign out completely (including iCloud) in order to create a new account. Your data will not be lost. When you switch accounts again in the future, you only need to sign out of the App Store ("Media & Purchases"), not iCloud as well.
5.  Create a new Apple ID.
    -   You can use the same phone number that's attached to your other Apple ID, or a [Google Voice](https://voice.google.com/) number.
    -   For email, you'll need to either create an iCloud email, or use a ["plus-style address"](https://gmail.googleblog.com/2008/03/2-hidden-ways-to-get-more-from-your.html).
6.  Make sure the Apple ID region is correct: App Store → Your Account → Your Account → Country/Region.
7.  Install at least one free app from the App Store to initialize the account.

### Getting Wi-Fi data

1.  Find a popular indoor public attraction offering free Wi-Fi within the target country using Google Maps or similar software. I chose the [Rijksmuseum](https://www.google.com/maps/@52.3600008,4.8826439,17z). Note down the GPS coordinates of the center of the building.
2.  Imagine a rectangle surrounding the building and note down the GPS coordinates of the top-left and bottom-right points.
3.  Create a free account on [WiGLE](https://wigle.net/).
4.  Query the WiGLE database using the [online API interface](https://api.wigle.net/swagger#/Network%20search%20and%20information%20tools/search_2) with these parameters:
    1.  `latrange1`: lesser of two latitudes you noted
    2.  `latrange2`: greater of two latitudes you noted
    3.  `longrange1`: lesser of two longitudes you noted
    4.  `longrange2`: greater of two longitudes you noted
    5.  `closestLat`: latitude of center of building
    6.  `closestLong`: longitude of center of building
    7.  `resultsPerPage`: 25*n where n is the number of ESP32 units you have (e.g. 50 for 2 units)
5.  Execute the request, then download the response as JSON
6.  Clone the [skylift repository](https://github.com/DownrightNifty/skylift):
    
    ```bash
    git clone https://github.com/DownrightNifty/skylift
    ```
    
7.  Set up skylift:
    
    ```bash
    cd skylift/
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    pip install setuptools
    python setup.py develop
    ```
    
8.  Convert the JSON data to the format used by skylift:
    
    ```bash
    # replace $PATH_TO_JSON, $TARGET_LAT, and $TARGET_LONG
    python ./extras/wigle_to_skylift.py $PATH_TO_JSON ./w2s_out $TARGET_LAT $TARGET_LONG
    ```
    
9.  Create the arduino sketch(es):
    
    ```bash
    c=1
    for file in ./w2s_out/*; do
        skylift create-sketch -i "$file" -o ./out_"$c" --max-networks 25 --board esp32
        ((c++))
    done
    ```
    
10.  Use the [Arduino IDE](https://www.arduino.cc/en/software) to upload each sketch to each ESP32 unit.

#### Pre-generated Wi-Fi data

If you're having trouble with acquiring the data yourself, you could try using the sample data that I generated. If a large number of people start using it, I don't know if it will continue to work indefinitely, so please use your own data if possible.

The sample data can be found under the `generated/` directory in my fork of Skylift.

### Placing the device in the faraday pouch

1.  Before you continue, check the device's settings:
    1.  Enable Airplane Mode, disable Bluetooth, and re-enable Wi-Fi.
    2.  \[Optional\] Disable your lock screen (this makes controlling the device externally easier).
    3.  \[Optional\] Make sure Apple Maps is allowed to access your location "while using the app": Settings → Privacy & Security → Location Services → Maps. Required because ask-for-permission prompts annoyingly don't appear on external displays.
    4.  \[iPhone only\] Enable AssistiveTouch: Settings → Accessibility → Touch → AssistiveTouch. Required to enable mouse support on iPhone.
    5.  Make sure you're signed in to the App Store with the EU Apple ID you created earlier: Settings → Your Account → Media & Purchases. Signing in to iCloud as well is unnecessary.
2.  Connect the USB-C extension cable to the device.
3.  \[⚠️ Important\] Insulate the ESP32 units from the metallic faraday pouch using plastic bags or something.
4.  Connect the ESP32 units to the battery.
5.  Place the device into a faraday pouch, along with the ESP32 units and their battery. Seal it as well as possible with only the tip of the cable sticking out (reducing its ability to let in radio signals).
    -   If one pouch doesn't work, try using two pouches (placing one inside the other)
6.  Connect the USB-C hub to the cable. Connect the router via Ethernet, and a keyboard, mouse, and display via HDMI.

### Spoofing location and unlocking EU features

Your iOS device should now only see the spoofed Wi-Fi networks, and cannot receive a GPS signal. Since we have a cable sticking out, this isn't a perfect faraday cage and it's possible that especially strong signals such as cell signals will make their way through, but that's okay.

1.  Make sure that you can control the device inside the faraday pouch using the connected keyboard, mouse, and display, and that the device has internet access through Ethernet.
2.  \[Optional\] Check the nearby Wi-Fi list to make sure you can only see fake Wi-Fi networks.
    -   If you see one or two nearby networks, that should still be okay; the geolocation service seems to ignore irregularities like this and returns the most likely location result, considering all nearby networks.
    -   5GHz Wi-Fi is stronger than 2.4GHz. You could temporarily disable 5GHz on your main router if that helps.
3.  Disable Location Services and then re-enable it.
4.  Open Apple Maps and check to make sure it places you inside your target country.
5.  You should now have access to EU features such as third party app stores. Try installing AltStore PAL at: [https://altstore.io/download](https://altstore.io/download)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aece453d8d25c742.jpg) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf5f176596dd761f.png)

If it doesn't work the first time around, disable Location Services and re-enable it, then try again.

## Caveats

### "Third party app stores"!= "sideloading"

I've written at length about why third party app stores aren't the same as "sideloading". Check out my new project, "Does iOS have sideloading yet?", below!

[https://www.doesioshavesideloadingyet.com/](https://www.doesioshavesideloadingyet.com/)

### The 30 day grace period

Once you take your device out of the faraday pouch and it realizes that it's no longer in the EU, a 30-day grace period begins during which you can use EU features freely. After the grace period, certain features will become restricted. You'll still be able to use any apps from alternative app stores you downloaded, but they'll no longer receive updates.

However, you can simply repeat the [location spoof process](#placing-the-device-in-the-faraday-pouch) again once each month, if you want to continue to access these features.

## Acknowledgements

-   [Adam Harvey](https://adam.harvey.studio/) for Skylift
-   Lagrange Point for their [prior research](https://lagrangepoint.substack.com/p/airpods-hearing-aid-hacking)

## Appendix: Notes on Apple's Eligibility system

Apple's [Eligibility system](https://theapplewiki.com/wiki/Eligibility) has been mostly reverse engineered and documented, but I wanted to add some of my notes here for future reference.

As noted in the Lagrange Point article, you can monitor the activity of the eligibility service by monitoring the device's system logs, either through [Console.app](https://support.apple.com/guide/console/welcome/mac) on macOS, or [libimobiledevice](https://libimobiledevice.org/) on other platforms. This command is especially helpful:

```
idevicesyslog | grep RegulatoryDomain
```

Here's a sample output:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8c5ab2a82b7d93ac.png)

Here's the different location estimate methods, sorted by priority from lowest to highest:

-   `WiFiAP` (`1`): Uses the two-digit country codes of nearby Wi-Fi access points
-   `ServingCellMCC` (`2`): Uses the MCC code of the cell tower that the device is currently connected to(?)
-   `NearbyCellsMCC` (`3`): Uses the MCC codes of nearby cell towers
-   `LatLonLocation` (`4`): Uses coordinates from Location Services (GPS/Wi-Fi)

According to the Apple Wiki article:

> countryd uses a mix of all signals to decide which country is the most likely physical location of the device.

However, I found that, in practice, if conflicting information is available, `countryd` will simply use the estimate with the highest priorty.
