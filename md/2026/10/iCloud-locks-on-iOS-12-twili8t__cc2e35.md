---
title: iCloud locks on iOS 12 | twili8t
source: https://twili8.github.io/2026/10/09/iCloud-locks-on-iOS-12.html
source_host: twili8.github.io
clip_date: 2026-10-20T10:16:48+08:00
trace_id: 11d405cc-12ef-4098-bd02-909073ad6fc8
content_hash: 12749b919689370324447505dd40b04abc853176427e769935c1123ee5e69ad7
status: synced
tags:
  - iOS逆向
  - 二进制补丁
series: null
feed_source: twili8t·iOS内核利用
ai_summary: iCloud 激活锁由 `mobileactivationd` 报告的激活状态字符串决定；把 5 处加载“Unactivated”字符串的指令改为加载“FactoryActivated”，就能在 iOS 12.5.8 上绕过激活锁。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-8100-8111-c97de890a43b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> iCloud 激活锁由 `mobileactivationd` 报告的激活状态字符串决定；把 5 处加载“Unactivated”字符串的指令改为加载“FactoryActivated”，就能在 iOS 12.5.8 上绕过激活锁。
> 
> - **锁的机制：** 抹除设备时若 Find My 开启，就会触发激活锁；`mobileactivationd`（launchd 守护进程）以 “Unactivated”、“Activated”、“FactoryActivated” 三种状态表示激活情况。
> - **工具依赖与流程：** 前提是已用 checkra1n（checkm8，A7–A11）越狱，并用 `iproxy 12345 44` 转发到 usbmuxd 的 SSH 端口，root 口令为 `alpine`；随后替换 `/usr/libexec/mobileactivationd`、`launchctl` 卸载再加载、`killall backboardd`。旧脚本删除 `Setup.app` 的做法只对 12.3 及以下版本有效，12.5.4+ 已修复。
> - **补丁规模：** 工具包内含 iOS 12 版 `741c.dat`（MobileActivation-353.260.2）和 iOS 13 版 `c502.dat`；与官方固件中的同名文件相比，两者同为 2261712 字节，`cmp -l` 仅 95 字节差异，其中真正改动 5 字节。
> - **关键修改：** 5 处 `ldr` 的立即数从 `0x438` 改成 `0x448`，即从 `__DATA.__const` 的 `0x10020D438` 移到 `0x10020D448`，把 “Unactivated” 指针换成相邻的 “FactoryActivated”；其余差异是 LC_UUID、`minos`/`sdk` 12.5→12.4、时间戳回写 2019 和签名块。
> - **生效原理：** iOS 12 的 `FactoryActivated` 是真实特权状态，不需要 iCloud 账号和激活票据；第 4 处位于 `createActivationInfoWithCompletionBlock:` 的回复路径上，因此 lockdownd 与设置流程会把设备当作已工厂激活。

What are iCloud locks, why should I care, how to remove them, is human nature materialistically dialectical?

### Background

-   An iCloud Activation Lock is the check that appears after an iPhon gets erased with Find My enabled. It’s enforced in part by `mobileactivationd`, a `launchd` daemon that reports activation state as strings like “Unactivated”, “Activated”, and “FactoryActivated”.
-   An IPSW is Apple’s firmware archive.
-   The jailbreak is checkra1n, which uses the checkm8 bootrom exploit for A7-A11 devices. It leaves SSH reachable.

I have an old iOS 12.5.8 iPhone 6 I gave to someone. When they returned it, they had forgotten their iCloud password, leaving me with a slight problem. Apple products have these locks on them, iCloud activation locks, which are triggered when you reset a phone without logging out of your iCloud account. In this article, we will look at how I can successfully bypass it and use my phone for its camera plus a few pictures I took!

## App Bundles

My first instinct was to look online for tools that already do the job. Reddit was not helpful in the slightest for once but some exist however they’re all paid! 😞. A friend tossed me an app bundle, one of those sketchy commercial “remove iCloud activation lock” utilities that float around download sites. I downloaded it and started working.

> Mac apps are folders with a.app extension. The application’s entry binary is specified in the.app’s Contents/Info.plist’s CFBundleExecutable entry, which points to a Mach-O in Contents/MacOS/.

So this write-up follows how the tool gets past the activation lock on an iPhone running **iOS 12.5.8 (build 16H88)**, and, once I got hold of a stock 16H88 filesystem for diffing, exactly which bytes it patches in Apple’s software to do it and why.

## Triage

* * *

The `Resources/` folder is basically a graveyard of half-finished ideas, but three tiny shell scripts (`systemA.dat`, `systemB.dat`, `systemC.dat`, the `.dat` extension appears to be an attempt at not-looking-like-scripts) stick out. A fourth file, `launchProxy.dat`, boots an SSH tunnel:

```bash
./../MacOS/iproxy 12345 44 2> /dev/null &
```

`iproxy 12345 44` forwards local port 12345 to the device’s usbmuxd port 44, the SSH service that checkra1n leaves behind. So the tool assumes the device is **already jailbroken, SSH on port 44, root password `alpine`**.

`systemC.dat` is an iOS iCloud bypass that only works from iOS 12.3 downward, deleting Setup.app (the app that opens when you first turn the phone on and asks for your apple ID and all)

```bash
./passssh -p 'alpine' ssh ... "mount -o rw,union,update / &&
  mv /Applications/Setup.app /Applications/Setup.app.crae &&
  uicache --all && killall backboardd"
```

Rename `Setup.app` away, rebuild the icon cache, restart SpringBoard. The device boots straight to the home screen instead of the Setup Assistant. This was patched in iOS 12.5.4+.

`systemB.dat` is the real payload:

```bash
mount -o rw,union,update /
scp ./741c.dat root@localhost:/usr/libexec/741c.dat # send 741c.dat to the device
mv /usr/libexec/mobileactivationd /usr/libexec/mobileactivationdbak # backup mobileactivationd
mv /usr/libexec/741c.dat /usr/libexec/mobileactivationd # rename 741c.dat to mobileactivationd
chmod 755 /usr/libexec/mobileactivationd # make it +executable
launchctl unload /System/Library/LaunchDaemons/com.apple.mobileactivationd.plist
launchctl load   /System/Library/LaunchDaemons/com.apple.mobileactivationd.plist # reload it in memory
killall backboardd
```

In other words: **replace the system activation daemon with a patched copy, restart it, restart the UI**. The file is written to the disk, but due to an invalid signature it needs a jailbreak to restart; more on this later.

Two patched daemons ship in the bundle, and picking the wrong one would be embarrassing and probably not even work:

| File | Size | Self-identification | Era |
| --- | --- | --- | --- |
| `741c.dat` | 2 261 712 | `MobileActivation-353.260.2`, built Aug 19 2019 | iOS 12.x |
| `c502.dat` | 2 160 848 | `MobileActivation-489.80.1`, built Jan 9 2020 | iOS 13.x |

That `353.260.2` number is corroborated externally: iOS 12.5.7 user-agent strings to Albert contain `iOS Device Activator (Mobile-Activation-353.260.2)`. So `741c.dat` is the iOS 12 payload, and `systemB`, the one that pushes `741c.dat`, is the script that fires on our 12.5.8 target. `systemA` pushes `c502.dat` instead, which is the iOS 13 path.

Everything else in `Resources/` (`checkra.tar.gz`, `bypass.tar.gz`, `ldAIO.zip`, `palera1*.tar.gz`) belongs to other flows (A12+/iOS 15+ and so on). For a 12.5.8 iPhone (A7/A8, iPhone 5s through 6 Plus), the relevant jailbreak is the `checkra.tar.gz` payload: checkra1n, PongoOS, and a rooted ramdisk. checkra1n officially supports iOS 12.0+ on exactly these devices, so the tool is relying on checkm8, an unpatchable bootrom exploit.

* * *

## The Diff

Once I had the stock daemon out of an iOS firmware archive (IPSW) that was a pain to extract (`.../16H88__iPhone7,2/root/usr/libexec/mobileactivationd`), the diff was comically small:

```
sizes:    both 2 261 712 bytes  (no code added, no code removed)
SHA-256:  53ee2751...  (stock)   vs   04aead66...  (patched)
cmp -l:   95 differing bytes total
```

95 bytes, and several of them aren’t even interesting:

| Offset | What it is |
| --- | --- |
| `0xBB1` | `LC_UUID` load command, regenerated |
| `0xBCE`, `0xBD2` | `LC_BUILD_VERSION`: `minos` / `sdk` `12.5` -> `12.4` |
| `0xCD2`, `0xD32` | dylib install-timestamp tweaks |
| `0x203EF6` | cstring: `built on Aug 19 2022` -> `built on Aug 19 2019` |
| `0x223671+` | `__LINKEDIT` code-signature blob, so garbage either way |

The build-date rewrite is a nice touch: the stock binary says 2022, the patched one backdates itself to 2019 to match the era the patch was written. Either way, the code signature is invalid now; the device doesn’t care because the jailbreak takes care of it, but on an unjailbroken device it wouldn’t work.

That leaves **five bytes.**

All five are single-byte changes at non-zero offsets inside `__text` (section VA base `0x1000034C8`, file offset `13512`):

* * *

```haskell
fileoff    VA             original word        patched word         instruction
------    -------------   -----------------    -----------------    ------------------------------
80960     0x100013C40     0xF9421D03           0xF9422503           ldr x3,  [x8, #0x438] -> #0x448
119524    0x10001D2E4     0xF9421D00           0xF9422500           ldr x0,  [x8, #0x438] -> #0x448
188412    0x10002DFFC     0xF9421D00           0xF9422500           ldr x0,  [x8, #0x438] -> #0x448
196384    0x10002FF20     0xF9421D17           0xF9422517           ldr x23, [x8, #0x438] -> #0x448
197372    0x1000302FC     0xF9421D00           0xF9422500           ldr x0,  [x8, #0x438] -> #0x448
```

A 64-bit load from a `__DATA` address table, with the immediate offset nudged from `0x438` to `0x448`: sixteen bytes, two slots over. Decoding the immediates properly (which required catching myself after an off-by-one alignment bug the first time I tried:

`LDR Xt, [Xn, #imm12*8]` -> `0x438/8 = 135`, `0x448/8 = 137`):

-   In every case, `x8` comes from `adrp x8, 0x10020D000` (with the usual `nop` inserted by a re-signing tool between `adrp` and `ldr`).
-   So the load is from `__DATA.__const` at **`0x10020D438`**, redirected to **`0x10020D448`**.

Both slots hold pointers into `__DATA.__cfstring`, and following them:

```rust
0x10020D438 -> 0x100213918 -> cstring 0x100204256, len 0x0B  "Unactivated"
0x10020D440 -> 0x100213938 -> cstring 0x100204262, len 0x09  "Activated"
0x10020D448 -> 0x100213958 -> cstring 0x10020426C, len 0x10  "FactoryActivated"
```

## The Trick

The patch is one logical operation:

> **Wherever the daemon would report the activation state as `"Unactivated"`, report `"FactoryActivated"` instead.**

You could have injected dylibs, hooked libraries, or patched if statements, but instead it’s just a string-table redirect at five call sites. Less is more. The stock `__const` layout (`"Unactivated"`, `"Activated"`, `"FactoryActivated"`) sits in that table in order, which is why the patcher only had to slide the immediate two slots right: the string it wants was already adjacent in memory.

Why `"FactoryActivated"`? Because on iOS 12 that’s a *real, privileged* state. Factory activation is what Apple’s own factory tools write for devices that never go through the normal [albert.apple.com](http://albert.apple.com/) handshake; software like SpringBoard’s purplebuddy, `commcenter`, and the setup flow treat a factory-activated device as trustworthy by default: no iCloud account, no activation ticket, and no `"this iPhone is locked to an owner"` screen.

Loading the patched binary (`741c.dat`) as **ARM64**, the five modified functions, in VA order:

| #   | Function start | Patch site | Notes |
| --- | --- | --- | --- |
| 1   | `sub_100013A9C` (`sub sp, #0x50`) | `0x100013C40` `ldr x3, [x8, #0x438]` | value lands in `x3` for a call to `sub_100004864` (5-arg setter pattern, `w4=1`) |
| 2   | `sub_10001D004` (`sub sp, #0xD0`) | `0x10001D2E4` `ldr x0, [x8, #0x438]` | then `bl 0x1000…` `objc_retain` -style helper into `x16` -ish flow, value passed onward |
| 3   | `sub_10002DF58` (`sub sp, #0x60`) | `0x10002DFFC` `ldr x0, [x8, #0x438]` | on the `cbnz x20, 0x10002E014` fallback (dark-mode / null result path), pairs with `x21 = [x8, #0x590]` (“Activated”-adjacent key) at `0x10002DFB4` |
| 4   | `sub_10002FBF4` (`sub sp, #0x70`) | `0x10002FF20` `ldr x23, [x8, #0x438]` | block invoked from `-[MobileActivationDaemon createActivationInfoWithCompletionBlock:]`; this is the activation-info reply path |
| 5   | `sub_100030234` (`sub sp, #0x90`) | `0x1000302FC` `ldr x0, [x8, #0x438]` | after `-[x0 isEntitled:]` gate and `-[x0 dark]`; falls through toward `0x1000303C4` on entitlement failure |

Site 4 is the money shot: `createActivationInfoWithCompletionBlock:` is the XPC method clients (lockdownd, the setup flow) call to fetch activation info. With the patch, the `"what state am I in?"` answer it hands back is `FactoryActivated`.

## Notes

-   The five `ldr` sites are marked by `adrp x8, 0x10020D000` + `nop` + `ldr`. In IDA, look up `0x10020D438` as a qword array of CFString pointers; cross-refs will show you every consumer, patched or not.
-   The `nop` between `adrp` and `ldr` appears to be an artifact of whatever re-sign/repack tool touched the binary; it’s present in both binaries at the patched sites, and the patched immediate is the only real change.
-   Comparing stock vs. patched is best done with `cmp -l` first: 95 bytes means you can eyeball the whole delta in a minute and spend your IDA time only on the five code sites.

## Epilogue

## Epilogue

What I like about this bypass is how little it changes. There is no injected dylib, no hooked function, no long exploit chain. The patcher finds five places where the daemon loads the string `"Unactivated"` and points them at `"FactoryActivated"` instead.

The phone boots to the home screen. I could open the camera and take pictures. For an old iPhone 6 on iOS 12.5.8, that was exactly what I needed.

Still, as a learning exercise it was hard to beat. It worked on my device and it gave me a much better understanding of how activation state is passed around inside iOS.

Thank you for reading! - Twili8t
