---
title: 【GitHub】frida-interception-and-unpinning/README.md at main
source: https://github.com/httptoolkit/frida-interception-and-unpinning/blob/main/README.md
source_host: github.com
clip_date: 2026-08-14T17:25:41+08:00
trace_id: 8ef4b8a0-1606-40ed-817f-ddc04f5da63f
content_hash: b31ea4216196a70cdf3de6319ed89d9ae01cbd6b2623fbd34e2f02804d2fbed4
status: synced
tags:
  - GitHub
  - Frida
  - 协议分析
series: null
feed_source: null
ai_summary: 提供一套现成的 Frida 脚本，帮助对 Android/iOS 进行 HTTPS 中间人拦截：自动代理重定向、注入 CA 证书、解除证书固定与透明度校验、绕过 root/越狱检测并阻断 HTTP/3。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3bc75244-d011-8176-a77d-e42c2f070ab5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 提供一套现成的 Frida 脚本，帮助对 Android/iOS 进行 HTTPS 中间人拦截：自动代理重定向、注入 CA 证书、解除证书固定与透明度校验、绕过 root/越狱检测并阻断 HTTP/3。
> 
> - **核心工具：** 一组可组合的 Frida 脚本，覆盖 Android/iOS HTTPS 拦截全流程，各脚本可独立或组合使用，但通常需要先加载 `config.js` 定义 `CERT_PEM`、`PROXY_HOST`、`PROXY_PORT` 等变量。
> - **Android 用法：** 需要 root 并运行 frida-server，通过 `frida -U -l ... -f $PACKAGE_ID` 注入；推荐命令同时加载 config.js、native 钩子、android-proxy-override、证书注入、证书解除固定及 root 检测绕过等脚本；还提供实验性 Flutter 证书固定解除脚本。
> - **iOS 用法：** 需要越狱设备，通过 Cydia/Sileo 添加 build.frida.re 源安装 Frida；推荐命令加载 config.js、ios-connect-hook、ios-disable-detection 和 native TLS/connect 钩子；`ios-disable-detection.js` 专门禁用 JailMonkey 越狱检测。
> - **技术细节：** `native-connect-hook.js` 低层钩住 libc，强制所有连接（含忽略代理设置的原始 socket）重定向到代理；`native-tls-hook.js` 修改 BoringSSL TLS 校验，只信任指定 CA 而非完全关闭 TLS 校验，避免不安全降级。
> - **反检测与兼容：** Android 的 root 检测绕过会拦截文件系统访问、shell 命令和已知 root 应用包查找，并伪造 `ro.secure`、`ro.debuggable` 等系统属性；`android-certificate-unpinning-fallback.js` 用于混淆应用，自动检测失败并生成补丁（不能单独使用）。

## Frida Mobile Interception Scripts

> *Part of [HTTP Toolkit](https://httptoolkit.com/android): powerful tools for building, testing & debugging HTTP(S)*

**This repo contains Frida scripts designed to do everything required for fully automated HTTPS MitM interception on mobile devices.**

This set of scripts can be used all together, to handle interception, manage certificate trust & disable certificate pinning & transparency checks, for MitM interception of HTTP(S) traffic on Android and iOS, or they can be used and tweaked independently to hook just specific features.

The scripts can automatically handle:

-   Redirection of traffic to an HTTP(S) proxy - modifying both system settings & directly redirecting all socket connections.
-   Injecting a given CA certificate into the system trust stores so they're trusted in connections by default.
-   Patching many (all?) known certificate pinning and certificate transparency tools, to allow interception by your CA certificate even when this is actively blocked.
-   On Android, as a fallback: auto-detection of remaining pinning failures, to attempt auto-patching of obfuscated certificate pinning (in fully obfuscated apps, the first request may fail, but this will trigger additional patching so that all subsequent requests work correctly).
-   Disabling many common root & jailbreak detections.
-   Blocking most HTTP/3 connections (all UDP to port 443), which may be inconvenient to intercept, ensuring apps fall back to HTTP/2 or HTTP/1.

## Android Getting Started Guide

1.  Start your MitM proxy (e.g. [HTTP Toolkit](https://httptoolkit.com/android/)), and set up your rooted Android device or emulator, connected to ADB.
2.  Find your MitM proxy's port (e.g. 8000) and its CA certificate in PEM format
    -   The CA certificate should start with `-----BEGIN CERTIFICATE-----`. You can open it with a text editor to see and extract this content.
    -   In HTTP Toolkit, both details can be found in the 'Anything' option on the Intercept page.
3.  Open `config.js`, and add those details:
    -   `CERT_PEM`: your CA certificate in PEM format.
    -   `PROXY_PORT`: the proxy's port
    -   `PROXY_HOST`: the address of your proxy, from the perspective of your device (or use `adb reverse tcp:$PORT tcp:$PORT` to forward the port over ADB, and use `127.0.0.1` as the host)
4.  Install & start Frida on your device
    -   The steps here may depend on your specific device & configuration.
    -   For example: download the relevant `frida-server` from [github.com/frida/frida](https://github.com/frida/frida/releases/latest), extract it, `adb push` it to your device, and then run it with the following 4 commands: `adb shell`, `su`, `chmod +x /.../frida-server`, `/.../frida-server`.
    -   If you have issues, remember to check the device is on & connected (using `adb devices`) before running commands. Note that Frida will only run on the device as root, which is what `su` provides in the example above, when run on a rooted device. To check you are root after running `su` or similar, check that running `whoami` in the shell prints `root`.
5.  Find the package id for the app you're interested in (for a quick test, try using [github.com/httptoolkit/android-ssl-pinning-demo](https://github.com/httptoolkit/android-ssl-pinning-demo) - the package id is `tech.httptoolkit.pinning_demo`)
6.  Use Frida to launch the app you're interested in with the scripts injected (starting with `config.js`). Which scripts to use is up to you, but for Android a good command to start with is:
    
    ```bash
    frida -U \
        -l ./config.js \
        -l ./native-connect-hook.js \
        -l ./native-tls-hook.js \
        -l ./android/android-proxy-override.js \
        -l ./android/android-system-certificate-injection.js \
        -l ./android/android-certificate-unpinning.js \
        -l ./android/android-certificate-unpinning-fallback.js \
        -l ./android/android-disable-root-detection.js \
        -f $PACKAGE_ID
    ```
    
7.  Explore, examine & modify all the traffic you're interested in! If you have any problems, please [open an issue](https://github.com/httptoolkit/frida-interception-and-unpinning/issues/new) and help make these scripts even better.

## iOS Getting Started Guide

1.  Start your MitM proxy (e.g. [HTTP Toolkit](https://httptoolkit.com/)), and set up your jailbroken iOS device, connected to your computer.
2.  Find your MitM proxy's port (e.g. 8000) and its CA certificate in PEM format
    -   The CA certificate should start with `-----BEGIN CERTIFICATE-----`. You can open it with a text editor to see and extract this content.
    -   In HTTP Toolkit, both details can be found in the 'Anything' option on the Intercept page.
3.  Open `config.js`, and add those details:
    -   `CERT_PEM`: your CA certificate in PEM format.
    -   `PROXY_PORT`: the proxy's port
    -   `PROXY_HOST`: the address of your proxy, from the perspective of your device
4.  Install & start Frida on your device
    -   The steps here may depend on your specific device & configuration, but this is generally available via Cydia/Sileo etc using `https://build.frida.re` as a package source.
    -   Ensure you can run `frida-ps -Uai` on your computer to confirm this is working correctly.
5.  Find the id for the app you're interested in via `frida-ps -Uai` (for a quick test, try using [github.com/httptoolkit/ios-ssl-pinning-demo](https://github.com/httptoolkit/ios-ssl-pinning-demo) - the id is `com.httptoolkit.ios-pinning-demo`)
6.  Use Frida to launch the app you're interested in with the scripts injected (starting with `config.js`). Which scripts to use is up to you, but for iOS a good command to start with is:
    
    ```bash
    frida -U \
        -l ./config.js \
        -l ./ios/ios-connect-hook.js \
        -l ./ios/ios-disable-detection.js \
        -l ./native-tls-hook.js \
        -l ./native-connect-hook.js \
        -f $APP_ID
    ```
    
7.  Explore, examine & modify all the traffic you're interested in! If you have any problems, please [open an issue](https://github.com/httptoolkit/frida-interception-and-unpinning/issues/new) and help make these scripts even better.

## The Scripts

The commands above use all the relevant scripts, but you can generally use any subset you like, although in almost all cases you will want to include `config.js` as the first script (this defines some variables that are used by other scripts).

For example, to do unpinning alone on Android, when handling proxy & certificate configuration elsewhere and without obfuscation fallbacks, you could just run:

```
frida -U \
    -l ./config.js \
    -l ./android/android-certificate-unpinning.js
    -f $PACKAGE_ID
```

Each script includes detailed documentation on what it does and how it works in a large comment section at the top. The scripts are:

-   `config.js`
    
    This defines variables used by other scripts:
    
    -   `CERT_PEM` - the extra CA certificate to trust, in PEM format
    -   `PROXY_HOST` - the IP address (IPv4) of the proxy server to use (not required if you're only unpinning)
    -   `PROXY_PORT` - the port of the proxy server to use (not required if you're only unpinning)
    -   `DEBUG_MODE` - defaults to `false`, but switching this to `true` will enable lots of extra output that can be useful for debugging and reverse engineering any issues.
    -   `BLOCK_HTTP3` - defaults to `true`, which blocks HTTP/3 by dropping all UDP connections to port 443.
    
    This should be listed on the command line before any other scripts.
    
-   `native-connect-hook.js`
    
    Captures all network traffic directly, routing all connections to the configured proxy host & port.
    
    This is a low-level hook that applies to *all* network connections. This ensures that all connections are forcibly redirected to the target proxy server, even those which ignore proxy settings or make other raw socket connections, and also blocks HTTP/3 connections if enabled.
    
    This hook applies to libc, and works for Android, Linux, iOS, and many other related environments.
    
-   `native-tls-hook.js`
    
    Modifies all TLS validation for BoringSSL-based libraries to trust your configured CA certificate.
    
    Notably, this hooks the built-in BoringSSL APIs on iOS, which is the normal way that iOS handles TLS certificate validation (so this is sufficient for almost all iOS HTTPS interception) but this is also used in a few other cases on both iOS & Android too.
    
    This effectively trusts your CA for all certificates, and disables all certificate pinning, certificate transparency and other restrictions for your CA. Note that unlike many other Frida hooks elsewhere this does *not* disable TLS validation completely (which is very insecure). Instead, it overrides validation to ensure that all connections using your specific CA certificate are trusted, without relaxing validation to allow interception by 3rd parties.
    
-   `android/`
    
    -   `android-proxy-override.js`
        
        Overrides the Android proxy settings for the target app, ensuring that all well-behaved traffic is redirected via the proxy server and intercepted.
        
    -   `android-system-certificate-injection.js`
        
        Modifies the native Android APIs to ensure that all trust stores trust your extra CA certificate by default, allowing encrypted TLS traffic to be captured.
        
    -   `android-certificate-unpinning.js`
        
        Modifies or disables many common known techniques for additional certificate restrictions, including certificate pinning (accepting only a small set of recognized certificates, rather than all certificates trusted on the system) and certificate transparency (validating that all used certificates have been registered in public certificate logs).
        
    -   `android-certificate-unpinning-fallback.js`
        
        Detects unhandled certificate validation failures, and attempts to handle unknown unrecognized cases with auto-generated fallback patches. This is more experimental and could be slightly unpredictable, but is very helpful for obfuscated cases, and in general will either fix pinning issues (after one initial failure) or will at least highlight code for further reverse engineering in the Frida log output. This script shares some logic with `android-certificate-unpinning.js`, and cannot be used standalone - if you want to use this script, you'll need to include the non-fallback unpinning script too.
        
    -   `android-disable-root-detection.js`
        
        Disables common root detection checks across native and Java layers to prevent detection of rooted Android devices.
        
        This script intercepts file system access, shell commands, and package lookups for known root indicators (like `su`, Magisk, and related apps), and fakes key system properties (`ro.secure`, `ro.debuggable`, etc.) to simulate a production environment.
        
        It blocks suspicious behavior like file existence checks and shell command execution, helping evade detection in apps using both standard and advanced root checks.
        
    -   `android-disable-flutter-certificate-pinning.js`
        
        Ensures that Flutter-based applications (which generally ignore the system certificate configuration) trust your CA certificate, even in most cases of explicit certificate pinning. This script remains experimental for now.
        
-   `ios/`
    
    -   `ios-connect-hook.js`
        
        Captures all iOS network traffic directly, routing all connections to the configured proxy host & port.
        
        This is a low-level hook that applies to *all* network connections. This ensures that all connections are forcibly redirected to the target proxy server, even those which ignore proxy settings or make other raw socket connections.
        
    -   `ios-disable-detection.js`
        
        Disables JailMonkey jailbreak detection.
        
-   `utilities/test-ip-connectivity.js`
    
    You probably don't want to use this normally as part of interception itself, but it can be very useful as part of your configuration setup.
    
    This script allows you to configure a list of possible IP addresses and a target port, and have the process test each address, and send a message to the Frida client for the first reachable address provided. This can be useful for automated configuration processes, if you don't know which IP address is best to use to reach the proxy server (your computer) from the target device (your phone).
    

These scripts are part of [a broader HTTP Toolkit project](https://httptoolkit.com/blog/frida-mobile-interception-funding/), funded through the [NGI Zero Entrust Fund](https://nlnet.nl/entrust), established by [NLnet](https://nlnet.nl/) with financial support from the European Commission's [Next Generation Internet](https://ngi.eu/) program. Learn more on the [NLnet project page](https://nlnet.nl/project/F3-AppInterception#ack).
