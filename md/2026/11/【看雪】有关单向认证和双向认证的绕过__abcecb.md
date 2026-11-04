---
title: 【看雪】有关单向认证和双向认证的绕过
source: https://bbs.kanxue.com/thread-293421.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-04T09:30:55+08:00
trace_id: 61690892-b598-4293-a45f-a2c7c1adc358
content_hash: c06508ea9c1c3ba890cd59dd2eb00cfec4be45ce12ad8f16a3f49fb5bb585cd6
status: synced
tags:
  - 看雪
  - 协议分析
  - Frida
series: null
feed_source: 看雪·Android安全
ai_summary: 三种 HTTPS 抓包受阻场景（用户证书不被信任、单向认证、双向认证）的对应绕过方案。
ai_summary_style: key-points
images_status:
  total: 24
  succeeded: 24
  failed_urls: []
notion_page_id: 40e75244-d011-814f-ab2d-d070d22ef8bc
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 三种 HTTPS 抓包受阻场景（用户证书不被信任、单向认证、双向认证）的对应绕过方案。
> 
> - **场景一（包体不全）：** targetSdkVersion ≥ 24 的应用在 Android 7.0+ 只信任系统 CA，需将抓包工具导出的证书正常安装后，用 MoveCertificate 插件（装入 apatch/Magisk 模块）把用户证书移入系统证书目录，重启即可完整抓包。
> - **场景二（单向认证/SSL Pinning）：** 客户端只信任预置证书而非设备所有 CA；算法助手 pro 的 JustTrustMe++ 未必有效，可改用 objection Hook `java.io.File.$init` 追踪证书文件读取，搜索 cacert 定位校验函数后，用 Frida 将 okhttp3 CertificatePinner 的 check 方法（`kl.f.a`）置空实现绕过。
> - **场景三（双向认证 mTLS）：** 服务端也校验客户端证书，返回 400 No required SSL certificate was sent；最简方式是用 r0capture 脚本（需关闭抓包代理）Hook 导出内置 p12 客户端证书并获取密码，导入 Charles 后成功抓包。
> - **mTLS 进阶思路：** 解包搜 .p12/.bks/.pem 常有误判（如华为根 CA、高德根 CA），需脱壳后在 jadx 搜 KeyStore.load 定位到 libbreakpad.so 中的 native getKeyStore()；证书以 base64(PKCS#12) 内嵌于 so、密码经 XOR 0xFF 混淆还原为 blibee，也可动态 Hook `android.util.Base64.decode` 与 `KeyStore.load` 同时提取证书 blob 和密码，`base64 -d` 还原为 p12 导入抓包工具。

在我们抓取通过抓包工具抓取app的请求响应时，通常会遇到下面三种情况。第一种配置证书后能抓取app的请求响应，但是抓取的包体不全，有很多抓取不到。第二种情况是客户端校验服务端证书（单向认证），在客户端请求时就校验失败，抓不到请求。第三种情况是客户端和服务端各自校验双方证书（双向认证），就算把客户端校验服务端证书给通过了，抓取到的包体响应也是出错的。下面给大家介绍一下这三种情况的应对方法。

这是因为对于 targetSdkVersion ≤ 23 的应用，运行在 Android 7.0+ 的设备上，仍然默认信任用户证书，直接安装用户证书就能抓包。而 targetSdkVersion ≥ 24 的应用，默认信任锚只包含系统 CA 存储区，用户手动安装的证书被排除在外。所以要解决这种情况需要将用户安装的证书移入到系统的证书目录里。

我这里用的是MoveCertificate插件，插件地址：

https://github.com/ys1231/MoveCertificate

将插件安装到apatch或Magisk的系统模块中后，再将抓包工具导出的证书像之前一样正常安装，重启手机后，用户证书就移动到系统证书中去了。这样就能抓取包体的全部啦。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a19c4c0c88b0b498.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/730c066fae904e59.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e5706347e8090f9d.webp)

## 第二种：客服端校验服务端证书（单向认证）

单向认证又称为ssl pinning，简单的来说SSL Pinning（证书锁定）是一种安全机制，它要求客户端（如App）只信任预先指定的、特定的服务器证书或公钥，而不是依赖设备上所有受信任的证书颁发机构（CA）。下面是单向认证的认证流程图：

SSL 单向认证只需要验证服务端的身份，无需验证客户端的身份。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2206253797c5e3e4.webp)

这里我们以某单app为例，我们的设备是通过第一种情况配置，登录app，输入手机号，点击发送验证码，客户端提示验证码发送失败，请重试。抓包工具报错Client closed the connection before a request was made. Possibly the SSL certificate was rejected.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3dca3f60da123d68.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/072f7735cf5c415b.webp)

这里有两种绕过方法：

1.  通过算法助手pro里面的justTrustMe++功能来过掉单向认证，但我这里没有成功。
    

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9696a7d3377b3815.webp)

2.当 App 做证书校验时，需要先打开并读取证书文件，以判断该证书是否属于 App 自身信任的证书。由于打开证书文件、获取文件句柄必然要经过 File 类的构造函数，因此在测试时，我们可以 Hook 所有 File 类的构造函数，也就是对 `File.$init` 进行 Hook，从而覆盖这一调用入口。

hook 代码

> objection -g cn.ticktick.task explore -s "android hooking watch class_method java.io.File.$init --dump-args --dump-backtrace --dump-return"

手机后端启动frida-server后前端输入命令，再次点击验证码，通过搜索cacert关键字找到校验函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/42434e5fc983eeb4.webp)

配合jadx反编译与AI分析，写js代码进行绕过

代码为：

> // pin_bypass.js — 证书锁定绕过  
> // kl.f = okhttp3.CertificatePinner, kl.f.a(host, chainLambda) 直接空实现  
>   
> var done = false, tries = 0;  
>   
> function tryHook() {  
> if (done) return;  
> if (!Java.available) { setTimeout(tryHook, 100); return; }  
>   
> Java.perform(function () {  
> var P;  
> try { P = Java.use("kl.f"); } catch (e) { return; } // 类未加载，稍后重试  
> try {  
> P.a.overloads.forEach(function (m) {  
> m.implementation = function () {  
> console.log("\[pin-bypass\] CertificatePinner.check() skipped, host=" + arguments\[0\]);  
> };  
> });  
> } catch (e) { console.log("\[-\] hook kl.f.a failed: " + e); done = true; return; }  
> done = true;  
> console.log("\[+\] kl.f.a hooked (pin check bypassed)");  
> });  
>   
> if (!done && ++tries < 300) setTimeout(tryHook, 200);  
> }  
>   
> setTimeout(tryHook, 0);

frida运行js文件，成功绕过，验证码发送成功

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b364b96138aee9b3.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/754f3964e333cb35.webp)

## 第三种：客户端服务端校验各自证书（双向认证）

SSL双向认证（又称 双向SSL/TLS认证、mTLS，Mutual TLS）是指在 SSL/TLS 握手过程中，客户端和服务器双方都要验证对方的数字证书，确认彼此身份后才建立加密连接。下面是双向认证过程中的认证流程图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/50e76787ca1d9148.webp)

我们这里以某蜂app为例，通过上面两种方法都可以过客户端校验服务端证书，我这里使用的是算法助手pro里面的justTrustMe++功能来过掉单向认证，

客户端正常发包，服务端返回错误400 No required SSL certificate was sent，判定为服务端校验证书。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d7881f042a53af4e.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3d7ad06d2ceb53bb.webp)

这里也有两种方法来进行绕过：

1.使用r0ysue大神写的r0capture来将客户端内置证书hook导出并重置密码。

github地址：https://github.com/r0ysue/r0capture

> frida-ps -U:显示打开app名称
> 
> python r0capture.py -U 便利蜂 -v //这里要注意，在运行脚本时，将你的抓包代理要给关闭，不然的话会保存不了证书

通过脚本打印的日志我们可以看到证书名称为com.bianlifeng.customer.android41DF7BC882.p12，密码为r0ysue

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b55ed108afdb557a.webp)

将证书从手机中导出来，安装在charles中就可以绕过抓包啦。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/078b904f13d79038.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7464f5f37869becd.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/27ad6d42836f70a4.webp)

2.我们需要解包搜索.p12,.bks,.pem证书，我这里找到两个geo_global_ca.cer和hmsrootcas.bks，但很可惜，这两个都不是。其中hmsrootcas.bks是华为根 CA 信任库，它是用来校验服务端的。而geo_global_ca.cer是高德地图的根CA

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/832646de801b7cce.webp)

这种只能脱壳反编译源码，看看客户端证书是通过怎样的方式来进行加载的，我这里是通过脱壳机进行脱壳的，拖到jadx里面反编译，可以搜索KeyStore、KeyStore.getInstance和KeyStore.load等关键字来进行寻找。通过一番寻找后我们发现在ClientAuthenticationSocketFactory类下通过CrashHandler.getKeyStore()方法对证书进行加载调用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e316286671308f85.webp)

进入getKeyStore()方法，这是一个native函数，在libbreakpad.so文件中查看

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2b772271548eb6d6.webp)

将libbreakpad.so拖入ida中搜索，在libbreakpad.so文件中查看getKeyStore()，可以看到证书是以 base64(PKCS#12) 形式内嵌在 lib/arm64-v8a/libbreakpad.so 中，密码字符串 XOR 0xFF 混淆后还原。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8a68bf58a696c891.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1fb4fe834deff826.webp)

所以证书可以直接静态.so 里 base64 解码，密码 通过运算为blibee

或者通过frida进行动态提取，因为Native 的 getKeyStore() 是通过 JNI 调 android.util.Base64.decode 和 KeyStore.load 的，直接 hook 这两个 Java 方法就能同时拿到 blob 和密码，代码为：

> // dump_mtls.js  
> Java.perform(function () {  
> // 1) 抓 base64 证书块  
> var B64 = Java.use('android.util.Base64');  
> B64.decode.overload('java.lang.String', 'int').implementation = function (s, flags) {  
> if (s.length > 500) console.log('\\n\[BLOB\]\\n' + s + '\\n\[/BLOB\]');  
> return this.decode(s, flags);  
> };  
>   
> // 2) 抓 KeyStore.load 的密码  
> var KS = Java.use('java.security.KeyStore');  
> KS.load.overload('java.io.InputStream', '\[C').implementation = function (is, pw) {  
> var p = '';  
> if (pw) for (var i = 0; i < pw.length; i++) p += pw\[i\];  
> console.log('\[KeyStore.load\] type=' + this.getType() + ' password="' + p + '"');  
> return this.load(is, pw);  
> };  
> });  

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d58b479a49168ad.webp)

将BLOB字段输出保存文本后，运行命令将其转为证书，导入到charles后成功绕过。

> base64 -d blob.txt > client.p12

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/da93ce70ce029599.webp)
