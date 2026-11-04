---
title: Abusing the Companion BAL Exemption for Ads
source: https://blog.azzahid.com/posts/abusing-companion-bal-exemption-for-ads/
source_host: blog.azzahid.com
clip_date: 2026-11-04T10:39:50+08:00
trace_id: e64fe3c4-ab06-42aa-a793-2110d8754449
content_hash: 5dddb18930eef36c37283db5150e5506f8c3a8471b1faa4c4bb388fb1ea1f593
status: synced
tags:
  - Android安全
  - 漏洞分析
series: null
feed_source: Zahid·Android安全
ai_summary: 恶意应用只需骗取一次配对弹窗点击，即可借 CompanionDeviceManager 豁免永久绕过 Android 后台 Activity 启动（BAL）限制，实现反复弹出的全屏广告。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-8197-8dd4-f2c164fd9cef
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 恶意应用只需骗取一次配对弹窗点击，即可借 CompanionDeviceManager 豁免永久绕过 Android 后台 Activity 启动（BAL）限制，实现反复弹出的全屏广告。
> 
> - **威胁背景：** 广告软件占 2025 年移动威胁检测的 62%，手法是从后台唤起全屏 Activity 刷广告曝光；Android 10–16 持续收紧 BAL 后仅剩 13 项显式豁免，CDM 配对豁免是第 13 项，也是滥用入口。
> - **滥用步骤：** manifest 声明 `companion_device_setup`，调用 `associate()` 时 BLE 过滤器留空使任意附近设备可匹配；用户在配对弹窗点一下，应用 UID 即终身获得 `REASON_COMPANION_DEVICE_MANAGER` 豁免，配对设备此后无需真实在场。
> - **滥用效果：** AlarmManager 定时唤醒、`BOOT_COMPLETED`、WorkManager、FCM 推送等任意后台路径均可 `startActivity()`；配合沉浸式 flag、`excludeFromRecents` 和每 5 秒自我复活，用户几乎无法摆脱全屏广告。
> - **弹窗缺陷：** 配对弹窗关闭不记为拒绝、无运行时权限把关、无频率限制，应用每次 Activity 到前台都可重新弹出；前台服务可在用户上滑清理、甚至 Android 13+ 拒绝通知权限后静默存活，持续骚扰直到用户为摆脱而妥协选择设备。
> - **修复建议：** 应将豁免限定在配对设备实际连接期间生效、把关闭弹窗视为拒绝、并通过二次弹窗明确告知真实授予的权限内容。

Most Android abuse, in volume, is for ads. Adware [accounted for 62% of mobile threat detections in 2025](https://securelist.com/mobile-threat-report-2025/119076/). Most of those detections are the same thing: an app puts a full-screen view on top of whatever the user is doing, long enough to register an ad impression and get paid.

That full-screen view is an Android *Activity*, the framework’s term for a single UI screen. The app showing it is not in the foreground when the launch happens. The capability to do this from the background is called Background Activity Launch, or BAL, and it is the specific thing Android has been trying to lock down. Without BAL restrictions, any installed app could interrupt whatever the user is doing at any time, with whatever screen it wanted. Android has tightened BAL across five releases. The bypass below depends on what is left after all of them.

## Six years of tightening

[Background Activity Launch (BAL)](https://developer.android.com/guide/components/activities/background-starts) was introduced in Android 10 (API 29). The rule: an app in the background cannot start an Activity. Before 10, background launches were unrestricted; after 10, they became the exception.

Android 12 (API 31) closed several indirect launch paths. The [“notification trampoline” pattern](https://developer.android.com/about/versions/12/behavior-changes-12#notification-trampolines), where a tap on a notification was quietly routed through a background component that then called `startActivity`, was blocked. Foreground services (a long-running background task with a persistent notification) [could no longer be started from the background](https://developer.android.com/about/versions/12/behavior-changes-12#foreground-service-launch-restrictions). And `PendingIntent` objects had to declare whether they were mutable. A `PendingIntent` is a deferred action one app creates and hands to another component, which fires it on the originator’s behalf later; a mutable handoff was a common way to launder activity-start permission.

Android 14 (API 34) closed the implicit-privilege paths. Earlier, an app could effectively share its BAL permission with another app by handing it a `PendingIntent`, or by letting that app connect to one of its background services. In 14, neither transfer happens by default. The granting app has to [set an explicit flag to allow it](https://developer.android.com/about/versions/14/behavior-changes-14#bal-restrictions). Several older bypasses relied on the previous default-on behaviour, and stopped working.

Android 15 [removed the last default-on case](https://developer.android.com/guide/components/activities/background-starts) for `PendingIntent` creators. Android 16 added a developer-visible runtime warning (via Android’s StrictMode debug system) when a background activity start happens.

After all of that, what remains is a list of explicit exceptions. The official guide [enumerates thirteen of them](https://developer.android.com/guide/components/activities/background-starts). Twelve are uncontroversial. An app can launch an Activity if it already has a visible window, if a notification it issued was just tapped, if the user granted it overlay permission (`SYSTEM_ALERT_WINDOW`), if it is bound by the system as an accessibility or autofill service, and a handful of similar cases. The thirteenth is the subject of this post.

## The exemption

The thirteenth item, [quoted verbatim from the developer guide](https://developer.android.com/guide/components/activities/background-starts):

> The app is associated with a companion hardware device through the `CompanionDeviceManager` API. This API lets the app start activities in response to actions that the user performs on a paired device.

Companion Device Manager, or CDM, was added for legitimate use cases. Wear OS watches need to open Activities on the phone when the user taps a watch face. Smart glasses need to bring up controls or captions. Fitness bands send notifications that, when acted on at the band, open the phone’s app. The user gesture occurs on the companion device; the Activity has to appear on the phone. Without an exemption, that flow cannot complete.

So CDM-associated apps are exempt from BAL. The exemption attaches to the application UID, persists for the lifetime of the association, and applies whether the companion device is connected, in range, or, as the proof-of-concept demonstrates, present at all after the initial pairing flow has completed. Internally, it is tracked as `REASON_COMPANION_DEVICE_MANAGER` in [`PowerExemptionManager`](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/os/PowerExemptionManager.java) and consulted by [`BackgroundActivityStartController`](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/services/core/java/com/android/server/wm/BackgroundActivityStartController.java) in the window manager service.

## The minimum

A line in the app’s manifest declaring use of the companion-device feature:

```xml
<uses-feature android:name="android.software.companion_device_setup"
              android:required="false" />
```

A runtime call that asks the system to start a companion-device association. The device filter can be empty, which makes any nearby Bluetooth Low Energy (BLE) advertiser match:

```java
AssociationRequest request = new AssociationRequest.Builder()
        .addDeviceFilter(new BluetoothLeDeviceFilter.Builder().build())
        .setSingleDevice(false)
        .build();
cdm.associate(request, callback, null);
```

And one tap from the user, on a system dialog whose wording varies by OEM and version but generally amounts to “choose a device to connect to.” The list shown contains whatever BLE is advertising in range: earbuds, a neighbor’s tracker, a smart scale, a passing fitness band. Any selection works, because nothing was filtered.

After the tap, the UID is BAL-exempt for the lifetime of the association.

## What the exemption gives

With the UID flagged, any background execution path can call `startActivity()`:

-   A scheduled `AlarmManager` wakeup at 3am
-   A `BOOT_COMPLETED` receiver, run when the device finishes booting
-   A `WorkManager` job that fires when the phone starts charging
-   An FCM push notification from the app’s backend
-   A foreground service started for any plausible reason

The PoC uses a foreground service because it keeps the process alive long enough for the delayed launch to fire. The same exemption serves a push-triggered `BroadcastReceiver` just as well, with no notification surfaced at all.

Once an Activity can be launched from the background, what follows is window configuration. A theme without a title bar. `FLAG_KEEP_SCREEN_ON`. Immersive flags to hide the system bars. `android:excludeFromRecents="true"` so the Activity does not appear in the task switcher. The Activity reschedules itself on a timer, so dismissing it brings it back in five seconds.

The platform never restricted any of those flags. BAL targets the call to `startActivity()` from a background `Service`, and that call succeeds because of one tap, weeks earlier, on a dialog the user does not remember.

## What the user saw

A pairing dialog. The wording is a variation of “Allow this app to access nearby devices?” with a list of advertised devices underneath. The user picked their earbuds, or the first item in the list, or just something to make the dialog go away. The dialog did not mention activities, background behavior, or that the grant would, for the lifetime of the association, place the app on a list of thirteen platform-wide exceptions.

Dismissing the dialog does not record a “deny.” There is no runtime permission gating the call, and no system-enforced backoff. Any time the app’s Activity reaches the foreground, the dialog can be re-presented. That includes user-initiated opens, notification taps, and full-screen-intent notifications fired from a push.

After the user opens the app once, the app can start a foreground service while it is still in the foreground. That service survives the user backgrounding the app, swiping it from recents, or rebooting and re-launching it. From the service, the app can launch Activities, each of which calls `associate()` and surfaces the dialog again. On Android 13 and later, the user can deny the notifications permission for the app and the foreground service keeps running silently, with no visible notification and nothing in recents to indicate the app is still alive. The dialog reappears minutes or hours after the user thought the app was gone.

A freshly installed app, opened just once, can keep presenting the dialog indefinitely until the user picks something. The user picks eventually, because the alternative is uninstalling.

## The problem

The CDM exemption was added deliberately, for a class of legitimate apps (Wear OS watches, smart glasses, automotive projection systems) that need to launch UI in response to off-device events. The exemption serves that audience correctly. The cost of joining that audience is one BLE filter and one tap, and that is where the abuse begins.

A pairing grant currently unlocks background activity launch silently, for the entire lifetime of the association. The dialog itself has no deny-state and no rate limit, so an app can re-present it whenever its Activity reaches the foreground, including from a foreground service that survives the user closing the app. Safer behavior would scope the unlock to the time the device is connected, treat a dismissed dialog as a deny, and place the grant itself behind a second prompt that names what is being granted.
