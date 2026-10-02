---
title: Android SSL Pinning Bypass with Burp Suite | marginaldeer's blog
source: https://www.marginaldeer.com//blog/android-ssl-pinning-bypass/
source_host: www.marginaldeer.com
clip_date: 2026-10-02T10:28:55+08:00
trace_id: cfe10a27-d7f8-4ad2-9b34-f31392cd9836
content_hash: a535461a4ff054f4ee208ca748a3600ae0179ccff5e040a6ca9e5fb34dff8957
status: synced
tags:
  - 协议分析
  - Frida
series: null
feed_source: marginaldeer·Android逆向
ai_summary: Burp 抓取 Android 应用 HTTPS 流量的关键是绕过 SSL Pinning：把 Burp CA 装为系统证书，再用 Frida/Objection 关闭证书校验。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3ed75244-d011-818b-8428-f7ca5d256f97
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Burp 抓取 Android 应用 HTTPS 流量的关键是绕过 SSL Pinning：把 Burp CA 装为系统证书，再用 Frida/Objection 关闭证书校验。
> 
> - **前置条件：** 可写系统的 Android 模拟器、Burp Suite、加入 PATH 的 ADB、`pip install frida-tools`。
> - **证书落地：** Burp 导出 DER 格式 CA → openssl 转 PEM → 用 `subject_hash_old` 命名成 `<hash>.0`；Android 7+ 不信任用户证书，须以 `-writable-system` 启动模拟器，`adb root`/`remount` 后推入 `/system/etc/security/cacerts/`，chmod 644 并重启验证。
> - **代理与 Frida：** 用 `settings put global http_proxy` 指向宿主机 IP:8080；按 `ro.product.cpu.abi` 下载对应 frida-server 放入 `/data/local/tmp` 运行，`frida-ps -U` 验证连通。
> - **两种绕过：** Objection 进 shell 执行 `android sslpinning disable`；或自写 Frida 脚本 hook `TrustManagerImpl.verifyChain`，直接返回 untrustedChain。
> - **常见排错：** 启动即崩溃多是 Frida 检测，可换旧版本或重命名 frida-server；代理连不上需确认监听全部接口且 IP 用宿主机地址而非 localhost。

1.  [Android Pentest Lab Build](https://www.marginaldeer.com/blog/android-pentest-lab/)
2.  Android SSL Pinning Bypass with Burp Suite
3.  [Frida Method Hooking for Android App Analysis](https://www.marginaldeer.com/blog/frida-method-hooking-android/)
4.  [Hooking Native Libraries with Frida Interceptor](https://www.marginaldeer.com/blog/frida-native-hooking/)
5.  [From APK to Source: Complete Android Reverse Engineering Workflow](https://www.marginaldeer.com/blog/apk-reverse-engineering-workflow/)
6.  [Bypassing Root Detection and Emulator Checks on Android](https://www.marginaldeer.com/blog/android-root-emulator-detection-bypass/)
7.  [Attacking Android IPC: Intents, Content Providers, and Broadcast Receivers](https://www.marginaldeer.com/blog/android-ipc-attacks/)

This post is a follow-up to my [Android Pentest Lab Build](https://www.marginaldeer.com/blog/android-pentest-lab/) where we set up an emulated Android device. Now we’ll put that lab to use by intercepting HTTPS traffic from Android apps.

If you’ve tried to proxy app traffic through Burp Suite before, you’ve probably run into SSL pinning. The app just refuses to connect or throws SSL errors everywhere. This is because modern apps embed the expected server certificate and reject anything else — including Burp’s CA. Great for security, annoying for us.

Let’s break it.

## What You’ll Need

Before we begin, make sure you have:

-   Android emulator from the [previous post](https://www.marginaldeer.com/blog/android-pentest-lab/)
-   [Burp Suite](https://portswigger.net/burp) installed
-   ADB working and in your PATH
-   [Frida](https://frida.re/) (`pip install frida-tools`)

## Setting Up Burp

First we need Burp to listen on all interfaces so the emulator can reach it. Go to **Proxy > Options** and edit the listener. Set it to bind to “All interfaces” on port 8080.

![Burp Listener Config](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6bb48303edb9037c.png)

## Exporting the CA Certificate

We need to install Burp’s CA certificate on the Android device. In Burp, go to **Proxy > Options** and click **Import / export CA certificate**. Select **Certificate in DER format** and save it as `burp-ca.der`.

Now we need to convert it to a format Android expects:

```bash
openssl x509 -inform DER -in burp-ca.der -out burp-ca.pem
hash=$(openssl x509 -inform PEM -subject_hash_old -in burp-ca.pem | head -1)
mv burp-ca.pem ${hash}.0
```

## Installing as a System Certificate

Here’s where it gets tricky. Android 7 and above don’t trust user-installed certificates for apps. We need to install it as a system certificate which requires root access.

Start your emulator with a writable system partition:

```bash
emulator -avd Pixel_API_25 -writable-system
```

Then push the certificate to the system store:

```bash
adb root
adb remount
adb push ${hash}.0 /system/etc/security/cacerts/
adb shell chmod 644 /system/etc/security/cacerts/${hash}.0
adb reboot
```

After reboot, you can verify the certificate shows up in **Settings > Security > Trusted credentials > System**.

## Configuring the Proxy

Now we need to tell Android to route traffic through Burp:

```bash
adb shell settings put global http_proxy $(hostname -I | awk '{print $1}'):8080
```

You can also do this manually in **Settings > Wi-Fi** by long pressing your network and modifying the proxy settings.

At this point browser traffic should flow through Burp. But apps with SSL pinning will still fail. Time to bring out the big guns.

## Setting Up Frida

Download the Frida server for your emulator’s architecture. Most emulators are x86 or x86_64:

```bash
adb shell getprop ro.product.cpu.abi

wget https://github.com/frida/frida/releases/download/16.1.4/frida-server-16.1.4-android-x86.xz
unxz frida-server-16.1.4-android-x86.xz
```

Push it to the device and run it:

```bash
adb push frida-server-16.1.4-android-x86 /data/local/tmp/frida-server
adb shell chmod 755 /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server &
```

Verify Frida can see the device:

```bash
frida-ps -U
```

You should see a list of running processes.

## Bypassing SSL Pinning

This is the easy part. [Objection](https://github.com/sensepost/objection) is a toolkit built on Frida that makes SSL pinning bypass trivial.

```bash
pip install objection
```

Find your target app’s package name:

```bash
frida-ps -Ua
```

Launch it with SSL pinning disabled:

```bash
objection -g com.example.targetapp explore
```

Once inside the objection shell just run:

```
android sslpinning disable
```

That’s it. Traffic should now flow through Burp without any SSL errors.

## Using a Frida Script Instead

If you prefer doing things manually, save this as `ssl-bypass.js`:

```javascript
Java.perform(function() {
    var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    TrustManagerImpl.verifyChain.implementation = function(untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
        console.log('[+] Bypassing SSL Pinning for: ' + host);
        return untrustedChain;
    };
});
```

Run it with:

```bash
frida -U -f com.example.targetapp -l ssl-bypass.js --no-pause
```

## Troubleshooting

Some common issues I’ve run into:

-   **App crashes on launch with Frida**— Might have Frida detection. Try using an older version or renaming the frida-server binary.
-   **“Unable to connect to proxy”**— Double check that Burp is listening on all interfaces and that you have the right IP in your proxy settings. It should be your host machine’s IP, not localhost.
-   **Certificate not trusted**— Make sure you installed it as a system cert, not a user cert. You need the `-writable-system` flag when launching the emulator.

## What’s Next

With traffic flowing through Burp you can start analyzing API endpoints and looking for vulnerabilities. The usual suspects I check for:

-   Broken authentication and session management
-   IDOR (Insecure Direct Object References)
-   Sensitive data in API responses
-   Hardcoded secrets in requests
-   Missing rate limiting

In my next post I’ll cover using Frida to hook specific methods and extract secrets from running apps.

More to come!

If you enjoyed this post please consider subscribing to the [feed](https://www.marginaldeer.com/feed/)!
