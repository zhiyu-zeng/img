---
title: Side Quest - RASP and SSL Pinning bypass on PayPal Mobile · samanl33t/blog
source: https://blog.samanl33t.com/writings/0x0007-rasp-and-ssl-pinning-on-paypal-mobile/
source_host: blog.samanl33t.com
clip_date: 2026-09-17T13:54:43+08:00
trace_id: bfc4b67f-ee6b-44f1-b68c-9d34d3cbbfb6
content_hash: 4ad4abbaed00f9722ee3d647e6c033a608c056abe0e963d57c137c23c1dc2219
status: synced
tags:
  - Android逆向
  - 反调试
series: null
feed_source: samanl33t·blog
ai_summary: PayPal Android 8.107.0 的抓包需依次绕过 Frida 检测、RASP 线程名检测、Root 检测与 Thales SDK 反 Frida，最后才是 OkHttp/TrustKit 证书绑定（pinning）本身。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3de75244-d011-8162-80c1-f6c385573c7c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> PayPal Android 8.107.0 的抓包需依次绕过 Frida 检测、RASP 线程名检测、Root 检测与 Thales SDK 反 Frida，最后才是 OkHttp/TrustKit 证书绑定（pinning）本身。
> 
> - **Frida 无法注入：** 应用用 self-ptrace 看门狗（`TracerPid` 指向子进程，带 `PTRACE_O_EXITKILL`）抢占 ptrace 槽位；改用 Zygisk + Frida gadget，且 CLI 与 gadget 版本必须一致（17.9.8）。
> - **gadget 崩溃：** ZygiskFrida 对 gadget 页面重映射导致 `gum-js-loop` 段错误；将该例程（偏移 `0x00015cfc`）首 4 字节改写为 `ret`，跳过隐藏逻辑。
> - **RASP 读线程名：** `sspog`（疑似 DexGuard 保护）匹配 `/proc/self/task/*/comm` 中的 `frida-gadget`、`gum-js-loop` 等；用等长字节替换重命名 gadget 线程（如 `androidmedia`、`mtk-js-loop`），保留 `frida:rpc` 等协议字符串。
> - **Root 与安装来源：** Root 检测为原生 `sspog` + `File.exists` 查 su 路径，且在主进程及多个隔离进程分别执行；Magisk DenyList + Shamiko 需覆盖全部进程名，并把 installer 伪装成 `com.android.vending`。
> - **启动后失效与 pinning：** Thales 支付 SDK 有独立反 Frida 检查，需延迟注入并快速点击绕过报错页；pinning 侧 Hook `okhttp3.CertificatePinner` 的 `check` 与 `check$okhttp` 重载为空，并同时处理 TrustKit、Conscrypt `TrustManagerImpl` 与 Integrity 校验。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f3440e0f11abac4f.jpg)

Contents

Recently, a security researcher reached out to me with a message “hey I found a bug on PayPal Web and I’m trying to reproduce it on the Android app but I’m stuck on SSL pinning….”.

This set off a series of events of me spending my weekend on this rabbit hole of an app. This post is the learnings from the weekend.

> No release of scripts this time. However the blog post should be able to guide you towards writing your own:).

> I hope this helps you or your LLMs identify and bypass similar checks on other apps.

In this case, I focused on the latest release (at the time) of PayPal app, `com.paypal.android.p2pmobile` 8.107.0. The goal was simple: To bypass the pinning and intercept its traffic in Burp (especially to `api-m.paypal.com`).

I went in expecting a simple SSL pinning bypass and came out with a stack of bypasses on various layers.

Some of it has to probably do with my own test environment caveats:

-   I used my old test phone OnePlus 6T (rooted) which PayPal did not support. Sideloading was possible and the app worked fine for my usecase with sideloading.
-   The app has emulator detections in place, which I quickly noticed when trying to install on an emulator and did not bother to bypass. As the goal was ssl pinning bypass, I just switched back to physical test device.

With that aside, let’s get into the details of each problem I faced…

## Frida can’t attach - Typical anti-debugging.

The first challenge was a basic one: [Frida](https://frida.re/) couldn’t spawn the app in the usual way. App kept crashing and spawn kept dying before it starts.

```
$ frida -U -f com.paypal.android.p2pmobile
Failed to spawn: unable to pick a payload base
$ frida -U 12690
Failed to attach: unable to read remote memory
```

Turned out, this was because of a self-ptrace watchdog. The app forks a child that ptraces the parent, which takes the `ptrace` slot before Frida can use it. You can see the watcher parked on the process:

```
$ grep TracerPid /proc/12690/status
TracerPid:  12731
```

And you couldn’t just kill it, because it’s using `PTRACE_O_EXITKILL` and takes the app down with it.

### Solution

Here, instead of oldschool bypasses, the solution was to simply use a [Zygisk](https://github.com/topjohnwu/Magisk) module with Frida gadget. I had to keep the frida CLI on the same version as the gadget (`17.9.8` here).

Zygisk runs code inside the app from the moment Zygote forks it, which means the gadget is mapped into the process before any of the app’s own code executes.

## The gadget crashes the app

Now I moved on to face another challenge.

The app froze at the splash screen. And the first time Frida client connected to it, the whole process segfaulted.

```
F libc: Fatal signal 11 (SIGSEGV), code 1, fault addr 0x0 in tid (gum-js-loop)
```

As can be seen in the crash log, the faulting thread is `gum-js-loop`, which is Frida’s own JavaScript thread.

This means, that it was not a problem because of PayPal blocking Frida, but because Frida’s gadget was corrupting itself on my environment or with PayPal package (idk).

After a lot of debugging and clauding, I found that the problem was the loader. [ZygiskFrida](https://github.com/lico-n/ZygiskFrida) tries to hide the gadget by remapping the gadget’s pages into anonymous memory, so anything scanning the process maps sees an unnamed region rather than `libfrida-gadget.so`. For some reason, in my setup this relocation seemed to crash the process.

### Solution

Since in my case, that hiding was not required at first, the fix was to stop the loader from relocating the gadget in the first place. This was done by RETing the function immediately when it’s called and before this relocation happens. I disassembled ZygiskFrida’s native library (`arm64-v8a.so`), traced the routine that performs the remap (offset `0x00015cfc`), and overwrote the first four bytes of the function with a `RET` instruction.

```
00015cfc:  c0 03 5f d6    ret
```

Once done, the gadget loads without trying to hide itself. This solved the crashing problem.

![Patched remap routine at 0x15cfc with its first instruction overwritten with ret](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fea223fca6f81215.png)

Patched remap routine at 0x15cfc with its first instruction overwritten with ret

This however, became the reason for the next problem:)

## The RASP reads thread names

Now with the gadget non-hidden, PayPal’s own runtime protection detected it and the app froze at the loading spinner. Here app appears to use RASP styled protection using a native component called - `sspog`, likely under [DexGuard](https://www.guardsquare.com/dexguard). This component has a Frida-specific check and looks for the thread names under `/proc/self/task/*/comm`, which Frida creates when it starts.

Manually, these default frida threads can be found here:

```bash
$ cat /proc/12940/task/*/comm | sort -u
frida-gadget
gdbus
gmain
gum-js-loop
pool-spawner
```

The app checks for these using simple string match. Also, since the gadget no longer hides itself (from the last step), these are visible to the app. Patching the loader’s stealth in the last step stopped the crash, and this means I now had to put the hiding of threads back myself, hopefully without crashing the gadget.

### Solution

If the detection is just a string match against known constants, then solution is to change the constants. I rebuilt the gadget with its thread names renamed, keeping each replacement the same length as the original so nothing in the ELF shifts and no offsets break. Only the Frida’s protocol strings (`frida:rpc`, `frida/runtime`) are left as it is for the client and the gadget to talk to each other. (I also didn’t want to spend time rebuilding frida with new thread names to match the gadgets:))

```python
swaps = [
    (b'gum-js-loop',  b'mtk-js-loop'),
    (b'gmain\0',      b'hmain\0'),
    (b'frida-gadget', b'androidmedia'),
    (b'pool-spawner', b'pool-svcwork'),
]
so = open('frida-gadget-17.9.8-android-arm64.so', 'rb').read()
for a, b in swaps:
    assert len(a) == len(b)
    so = so.replace(a, b)
```

This simply bypassed the checks and allowed the app to run past the loading screen.

![The gadget’s renamed threads in /proc//task/\*/comm - hmain,androidmedia etc. in place of the Frida defaults](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/baff900b3f794b7f.png)

The gadget’s renamed threads in /proc//task/\*/comm - hmain,androidmedia etc. in place of the Frida defaults

## Getting it to run on a rooted device

As with any financial app, PayPal app does not run on the rooted device. So, this required a root check bypass as well. Luckily it was straight forward.  
The “use browser” check inside the app does the usual checks:

```java
boolean isDeviceCompromised() {
    return HookDetectionHandler.isHookDetected()
        || RootDetectionHandler.isRootDetected();
}
```

`isRootDetected` turns out to be native `sspog` again, along with a `File.exists` check for the usual su paths - `/sbin/su`, `/system/xbin/su` etc.

The interesting part was that PayPal does not run this check only in its main process; it spawns short-lived isolated service processes and runs the native checker inside those, so hiding root from only the main process does not work.

### Solution

Because the check is ordinary `File.exists` plus a native root checks, ordinary root hiding covers it, as long as it covers every process. No need for frida here, as the [Magisk](https://github.com/topjohnwu/Magisk) DenyList and [Shamiko](https://github.com/LSPosed/LSPosed.github.io/releases) helps with the hiding.

Just make sure that DenyList: has the name of every one of the app’s isolated processes, not just the main package.

```
com.paypal.android.p2pmobile
com.paypal.android.p2pmobile:sspog
com.paypal.android.p2pmobile:remoteProcessIsolatedCheck
com.paypal.android.p2pmobile:remoteProcessIsolatedNativeCheck
```

Another minor thing from my setup: Since the app was sideloaded: PayPal reads `getInstallerPackageName`, so the installer has to be set to `com.android.vending` to look like a normal Play Store install. (I didn’t know a check like this existed before this:))

## The Random Startup Problem

Once everything was working, the gadget started to die after a few seconds of the app launch and injection. After some more analysis, it turned out to be server-side connections and loading of new components causing it.

It was Tap-to-Pay. My account had a Payair NFC migration enabled from PayPal. This seemed to pull the Thales payment SDK at startup and Thales is a card-payment SDK with its own anti-frida checks, separate from the app’s RASP. Thales SDK ran its checks right after the app starts up.

Since the bypasses above were not targeting this SDK, the app just showed “Something went wrong, try logging in with your browser” error after a few seconds of starting up.

![The “Something went wrong, try logging in with your browser” screen thrown by the Thales SDK anti-frida check a few seconds after startup](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/35305fb88b4b7533.png)

The “Something went wrong, try logging in with your browser” screen thrown by the Thales SDK anti-frida check a few seconds after startup

### Solution

The Thales check ran right after startup - So the solution was to not be there at startup and perform gadget injection later. I delayed the injection and let the app get through its own startup checks first.

Sadly, the error screen itself stayed there even after delayed injection. But luckily this was not a problem and can be easily bypassed being faster to tap on any other option in the app before this screen shows up.

> I tried to bypass this by disabling the whole activity as well, but disabling it crashed the app. Fast tapping was the best solution for me here:P

![Delayed gadget injection and quick tap to go to settings screen ](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/037da9483eeb50cb.png)

Delayed gadget injection and quick tap to go to settings screen

## The pinning!

After everything else, the pinning itself was the easy part. PayPal pins with OkHttp’s `CertificatePinner` and `TrustKit`. The only new thing was that the connections go through `check$okhttp` - which was likely not the stock function from the library. So, specifically hooking this function was necessary.

### Solution

So you hook both entry points, and then apply the same idea across the rest of the stack: TrustKit’s trust managers, Conscrypt’s `TrustManagerImpl`, a permissive `TrustManager` pushed into `SSLContext`, and the integrity verifier turned off.

```javascript
const CP = Java.use('okhttp3.CertificatePinner');
CP.check.overload('java.lang.String', 'java.util.List').implementation = function () {};
CP['check$okhttp'].implementation = function () {};
```

![Frida hooking the ssl pinning checks](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70a7add484bafbc6.png)

Frida hooking the ssl pinning checks

![Successful interception](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1fd1ef692bc595e8.png)

Successful interception

## Why I did not just patch the APK

One approach for all of this is to find all checks and patch the APK + re-sign it.

But I assumed [DexGuard](https://www.guardsquare.com/dexguard) will check for signatures at startup and patching will fail + this was just a sidequest and I was too lazy to try APK patching:)

## References

-   [Frida](https://frida.re/) and the [frida-gadget](https://github.com/frida/frida/releases) releases
-   [ZygiskFrida](https://github.com/lico-n/ZygiskFrida), [Magisk](https://github.com/topjohnwu/Magisk), [Shamiko](https://github.com/LSPosed/LSPosed.github.io/releases)
-   [DexGuard](https://www.guardsquare.com/dexguard)
-   [OkHttp `CertificatePinner`](https://square.github.io/okhttp/), [TrustKit](https://github.com/datatheorem/TrustKit-Android), [Conscrypt](https://github.com/google/conscrypt)
