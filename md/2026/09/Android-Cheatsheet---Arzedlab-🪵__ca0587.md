---
title: Android Cheatsheet - Arzedlab 🪵
source: https://arzedlab.github.io/posts/android-cheatsheet-1c03648c0bf480faa82cfb135d983ae5/
source_host: arzedlab.github.io
clip_date: 2026-09-23T10:18:41+08:00
trace_id: 6891a753-04f7-4e93-a3d6-98b133a74b57
content_hash: 37162695f63f470ebf61cb1764518431008f1bc7ae3acbb4b9c53f31c26eebb1
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Arzedlab·固件/内核
ai_summary: Android 抓包与逆向实战速查：从设备 root、frida-server 部署，到 APK 拉取合并签名，再到 Java/Kotlin 与 Flutter 的 SSL Pinning 绕过。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-8158-82ca-ef7a3234d378
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Android 抓包与逆向实战速查：从设备 root、frida-server 部署，到 APK 拉取合并签名，再到 Java/Kotlin 与 Flutter 的 SSL Pinning 绕过。
> 
> - **Genymotion 提权：** `adb shell setprop persist.sys.root_access 3` 即可开启 root；部分设备需先 `adb root`。
> - **Frida 部署：** 用 `adb shell getprop ro.product.cpu.abilist` 确认 CPU 架构，`unxz` 解压 frida-server 后 push 到 `/data/local/tmp/`、`chmod 755` 并后台运行，再用 `frida-ps -U` 验证。
> - **APK 拉取合并与签名：** `adb shell pm list packages -3` 列出第三方包，配合 `pm path` + `sed` + `xargs adb pull` 一键导出多分片；用 APKEditor `m -i` 合并、uber-apk-signer 签名。
> - **Pinning 绕过工具链：** Java/Kotlin 用 apk-rebuild.py，Flutter 用 `pip3 install reflutter` 后执行 `reflutter apk`，均属自动化重打包方案。
> - **Ghidra + Frida 手工绕过：** 搜索 `ssl_client`/`ssl_server` 字符串定位偏移，Hook `linker64` 的 `do_dlopen` 与 `call_constructor`，在 libflutter.so 加载后 attach 到偏移地址，将返回值替换为 `0x1` 使校验恒真。

### Android root in Genymotion

```bash
adb shell setprop persist.sys.root_access 3
```

### Setting up your Android device

```bash
$ adb shell getprop ro.product.cpu.abilist # check your device cpu type

$ unxz frida-server.xz
```

```bash
$ adb root # might be required
$ adb push frida-server /data/local/tmp/
$ adb shell "chmod 755 /data/local/tmp/frida-server"
$ adb shell "/data/local/tmp/frida-server &"
```

```bash
$ frida-ps -U
```

```bash
frida -U -l multi-bypass.js -f uz.paynet.flagship_mobile
```

### Downloading And Merging APKs

```java
adb shell pm list packages -3 | grep telegram
```

```bash
$ adb
```

One command

```bash
$ adb shell pm path org.telegram.messenger | sed 's/package://g' | xargs -L 1 adb pull
```

Merge [https://github.com/REAndroid/APKEditor](https://github.com/REAndroid/APKEditor)

```bash
$ java -jar APKEditor.jar m -i apk_files
```

### Sign Apks https://github.com/patrickfav/uber-apk-signer

```fallback
$ java -jar uber-apk-signer-1.3.0.jar --apk release.RE.apk
```

### Bypassing Android SSL Pinning Flutter

reFlutter: [https://ayoubnajim.medium.com/bypass-ssl-pinning-for-flutter-apps-using-reflutter-framework-f77b858919b7](https://ayoubnajim.medium.com/bypass-ssl-pinning-for-flutter-apps-using-reflutter-framework-f77b858919b7)

```bash
$ pip3 install reflutter
```

```bash
$ reflutter apk_name.apk
```

### Bypassing Android SSL Pinning Java/Kotlin https://github.com/ilya-kozyr/android-ssl-pinning-bypass

```bash
$ python3 apk-rebuild.py input.apk
```

### Bypassing ssl pinning with Ghidra

First we find offset by searching the strings `ssl_client` and `ssl_server`

Then run this script

```bash
var lib_loaded = 0;
var do_dlopen = null;
var call_constructor = null;

var linker = Process.findModuleByName("linker64");
if (linker === null) {
    console.error("Module 'linker64' not found!");
} else {
    linker.enumerateSymbols().forEach(function(symbol) {
        if (symbol.name.indexOf("do_dlopen") >= 0) {
            do_dlopen = symbol.address;
        }
        if (symbol.name.indexOf("call_constructor") >= 0) {
            call_constructor = symbol.address;
        }
    });
}

if (do_dlopen === null) {
    console.error("Symbol 'do_dlopen' not found!");
} else {
    Interceptor.attach(do_dlopen, {
        onEnter: function(args) {
            // Try to get the library path from context.x0 or fallback to args[0]
            var libPath;
            if (this.context && this.context.x0 !== undefined) {
                libPath = this.context.x0;
            } else if (args[0] !== undefined) {
                libPath = args[0];
            } else {
                console.error("Unable to determine library path pointer.");
                return;
            }
            // Ensure libPath is valid
            if (libPath.isNull()) {
                console.error("Library path pointer is null!");
                return;
            }
            var library_path = libPath.readCString();
            if (library_path.indexOf("libflutter.so") >= 0) {
                console.log(`[+] Detected loading of ${library_path}`);
                if (call_constructor !== null) {
                    Interceptor.attach(call_constructor, {
                        onEnter: function() {
                            if (lib_loaded === 0) {
                                lib_loaded = 1;
                                var module = Process.findModuleByName("libflutter.so");
                                if (module) {
                                    console.log(`[+] libflutter is loaded at ${module.base}`);
                                    // Adjust offset as needed
                                    session_verify_cert_chain(module.base.add(0x79af3e));
                                } else {
                                    console.error("libflutter.so module not found!");
                                }
                            }
                        }
                    });
                } else {
                    console.error("Symbol 'call_constructor' not found!");
                }
            }
        }
    });
}

function session_verify_cert_chain(address) {
    if (!address || address.isNull()) {
        console.error("Invalid address for session_verify_cert_chain");
        return;
    }
    Interceptor.attach(address, {
        onLeave: function(retval) {
            retval.replace(0x1);
            console.log(`[+] session_verify_cert_chain retval replaced with: ${retval}`);
        }
    });
}
```
