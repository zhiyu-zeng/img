---
title: "Breaking Flutter’s RSA Encryption: Reverse Engineering and Hooking Techniques | incogbyte"
source: https://incogbyte.github.io/posts/flutter-encryption-bypass/
source_host: incogbyte.github.io
clip_date: 2026-09-22T10:20:42+08:00
trace_id: c633b22c-ab12-4d30-9221-b369fcb73a24
content_hash: 880788b8e9f04aa59f69c8aeb9aa6fc232bec85faf861f9678bbf5803028893b
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: incogbyte·iOS/Mobile
ai_summary: Flutter release 包用 RSA 加密请求体时，可从 libapp.so 定位加密函数并用 Frida 在入参处截获明文。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 14
  failed_urls:
    - /images/flutter_decrypted_main_class.png
    - /images/blutter-encr-01.png
notion_page_id: 3e375244-d011-81ee-9110-dacb5808a6c3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Flutter release 包用 RSA 加密请求体时，可从 libapp.so 定位加密函数并用 Frida 在入参处截获明文。
> 
> - **技术栈与密钥来源：** Flutter 应用普遍用 dio 发请求、pointycastle 做加解密；RSA 公钥或由后端下发并存于 flutter_secure_storage / SharedPreferences，或直接硬编码在代码里。
> - **release 模式障碍：** AOT 编译、代码在 Dart VM 中执行、代码与数据序列化为二进制快照、符号被剥离且全量优化，使常规逆向手段失效。
> - **定位流程：** 用 apktool 解包 APK，再以 Blutter 在本地初始化 Dart 运行时并检视对象池/线程池，从入口包与 `rsa_helper.dart` 一类文件找到加密函数及偏移地址。
> - **Hook 切入点：** 加密前会先执行 JsonEncode，因此明文出现在加密函数首个参数（args[0]）；Frida 取 libapp.so 基址加偏移（示例 0x337694）后 `Interceptor.attach`，onEnter/onLeave 分别 hexdump 入参与返回的密文。
> - **辅助技巧：** 可枚举 libflutter.so / libapp.so 模块基址确认加载情况，并沿 ARM 的 BL（Branch with Link）指令遍历定位可疑函数调用。

In my previous post [Bypassing MTLS in Flutter](https://incogbyte.github.io/posts/bypassmtlsflutter/), I discussed how MTLS is **generaly** implemented in the Flutter framework. Depending on how an application is developed, exposing certificates can become a security issue. If an attacker gains access to the certificate, MTLS is rendered useless. This reinforces the analogy: *"It’s pointless to protect the front of your house with lasers, cameras, guard dogs, and motion detectors while leaving the windows and doors wide open."*

In this blog post, I will explain how to bypass scenarios where the application encrypts the request body (RSA) before sending it to the server. This technique is commonly seen in banking applications or other apps with mature security practices in mobile development.

### Understanding RSA Encryption

The most commonly used encryption method in such cases is RSA. Let’s break it down in simple terms:

In mobile applications, *RSA* is generally used for communication security and authentication (and, in some cases, even authorization). TL;DR:

1.  **Secure Key Exchange:** RSA is often used to exchange symmetric encryption keys (like AES). Since RSA is slow for large data volumes, it primarily secures the transmission of a faster encryption key.
2.  **Authentication and Digital Signatures:** Apps use RSA to ensure messages or transactions originate from a trusted source. This is achieved by signing content with a private key and verifying it with a public key.
3.  **Secure Communication (HTTPS/TLS):** When an app connects to a secure server, RSA is used to establish a TLS/SSL connection. The server sends its public key, the app encrypts a session key with it, and subsequent communication is encrypted with a more efficient algorithm.
4.  **Sensitive Data Protection:** Some apps store encrypted information locally, using RSA to safeguard credentials or critical data.

RSA plays a crucial role in app security but is often combined with faster methods (like AES) to ensure both security and performance. The following image illustrates how RSA works:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9fa4126b249d1db.png)

### Implementing RSA in Flutter

Now that we understand how RSA works, let’s explore how Flutter apps implement it. Based on empirical research, most Flutter applications use the following libraries:

-   [dio](https://pub.dev/packages/dio) - A powerful HTTP networking package.
-   [pointycastle](https://pub.dev/packages/pointycastle) - A Dart library for encryption and decryption.

In general, there are two common implementation approaches:

1.  The application requests the public key from the backend, which is then encrypted and stored in *SharedPreferences* on Android using another widely used Flutter package: [flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage).
2.  The public key is hardcoded in the Flutter code, meaning you would need to reverse-engineer the app or identify the exact function call that utilizes the key.

To simulate this scenario, I developed a Flutter app with a Node.js backend. The backend holds the private key, while the Flutter app contains the public key to encrypt the request body. This is a common setup in REST API or GraphQL applications.

However, to make it more realistic, I compiled the Flutter app in *release mode* rather than *debug mode* (More easy to reverse). When a Flutter app is built for production (e.g., for Google Play Store), several optimizations are applied to the binary (`libflutter.so` and `libapp.so`), including:

-   Dart Ahead-Of-Time (AOT) compilation.
-   Execution inside a Dart Virtual Machine (VM).
-   Serialization of code and data into a binary snapshot.
-   Stripping of symbols in release mode.
-   Full optimization.

For more details, check out the talk by Worawit: [B(l)utter Reversing Flutter Application Using Dart Runtime](https://www.youtube.com/watch?v=EU3KOzNkCdI).

### Analyzing the Android APK

In a real scenario, obtaining the APK file is the first step. Once you have the APK, you can use tools like [APKTool](https://apktool.org/) with the command `apktool d foo.apk` to decompile it.

Since I built the app myself, I simply compiled it in release mode, signed it, and installed it on a physical device:

-   **Build and sign:** ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/40ea235d598aac46.png)
    
-   **Install with ADB:** ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b85d0f185f1b408c.png)
    

With the APK in hand, we can use Worawit’s [Blutter tool](https://github.com/worawit/blutter). Blutter locally initializes the Dart app and inspects objects like the Object Pool and Thread Pool, helping us understand its structure.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c13d4b2ac4804d8.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/90591b2bf2977e50.png)

The next step is to analyze Blutter’s output and identify function addresses for hooking. Each application is different and may require a unique approach (shoutout to @edunovella 🍻 for this reminder!).

Since we aim to intercept the request before encryption, we first attempt to capture it using a proxy. Flutter has some quirks in this area; I recommend reading [this blog](https://blog.nviso.eu/2020/05/20/intercepting-flutter-traffic-on-android-x64/) for insights into Flutter and HTTP proxying.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7003ad8c2f0a8d12.png)

A good reversing approach is to search for the app’s entry points. Using Blutter, we can inspect the main package (`flutter_body_encrypt_rsa`) and locate the relevant class:

![⚠️ 图片托管失败](/images/flutter_decrypted_main_class.png)

![⚠️ 图片托管失败](https://incogbyte.github.io/images/flutter_decrypted_main_class.png)

In this case, we find `rsa_helper.dart`, which appears to handle encryption:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/df2cc4674e6dc352.png)

### Hooking Flutter’s Encryption Function

To proceed, I analyze the loaded libraries and locate the `libapp.so` and `libflutter.so` addresses using Frida:

```javascript
Java.perform(function() {
    console.log("[*] Waiting for libraries to load...");

    setTimeout(function() {
        console.warn("[*] Loaded libraries:");
        var modules = Process.enumerateModules();

        modules.forEach(function(m) {
            if (m.name.toLowerCase() === "libflutter.so") {
                console.warn("[*] libflutter found!", m.name);
            }
            console.log("[*] " + m.name + " -> " + m.base);
        });
    }, 1000);
});
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/748fdbfb458eb0de.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e804862c9cd43034.png)

From Frida’s output, we can verify that we have the address of libflutter.so and can also retrieve addresses for other libs. The most interesting one for us is **libapp.so**, where the application’s core logic is usually located.

By analyzing the code more deeply 👀, we can understand that before calling the encrypt function, the app performs a **JsonEncode**, which is likely where the Dio package uses Flutter’s convert package before encrypting the request:

![⚠️ 图片托管失败](/images/blutter-encr-01.png)

![⚠️ 图片托管失败](https://incogbyte.github.io/images/blutter-encr-01.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fa4b9f959b34957d.png)

I usually use the following Frida script to interact with lower-level functions within libapp.so. The idea is to get the base address of libapp.so, find the jsonEncode() function, and perform a hexdump. You can search for all BL (Branch with Link) instructions in ARM. The BL instruction performs a jump to a function/subroutine and stores the return address in the LR (Link Register). You can do this for all functions.

The hook I generally use is as follows:

```javascript
setTimeout(function() {

var flutterBase = Module.findBaseAddress("libapp.so");

    if (flutterBase) {

        var encryptFnAddr = flutterBase.add(0x337694);

            console.warn("[*] Function found at:", encryptFnAddr);

    Interceptor.attach(encryptFnAddr, {

            onEnter: function(args) {

            console.log("[*] Entering encrypt function...");

  

    try {

            var size = 1024;

            var buffer = Memory.readByteArray(args[0], size);

            console.log("[*] Hexdump (function) args[0]:\n" +

            hexdump(buffer, { offset: 0, length: size, header: true, ansi: true }));

    } catch (e) {

            console.error("[!] Error reading input (args[0]):", e);

    }

},

onLeave: function(retval) {

        try {

            var size = 1024;

            var buffer = Memory.readByteArray(retval, size);

            console.log("[*] Hexdump return value (encrypted):\n" +

            hexdump(buffer, { offset: 0, length: size, header: true, ansi: true }));

        } catch (e) {

            console.error("[!] Error reading return value:", e);
        }

    }

});

} else {

        console.log("[!] libapp.so not found!");
}

}, 1000);
```

Finally, we successfully intercept the data before encryption:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6e49179dcff4e4ee.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b92788247eaa5ba.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5320aa41944324b5.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/974d76d264057d60.png)

If you enjoyed this post, send feedback on X (@incogbyte) or email me at [incogbyte@protonmail.com](mailto:incogbyte@protonmail.com). Let me know if you'd like a part 2!

**References:**

-   [Blutter](https://github.com/worawit/blutter)
-   [Frida](https://frida.re/)
-   [Flutter](https://flutter.dev/)
-   [Nullcon cryptax](https://filestore.fortinet.com/fortiguard/research/nullcon.pdf)
