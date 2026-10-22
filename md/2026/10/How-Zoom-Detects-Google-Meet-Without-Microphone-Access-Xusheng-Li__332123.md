---
title: "How Zoom Detects Google Meet Without Microphone Access :: Xusheng Li"
source: https://xusheng.dev/posts/reversing/zoom_my_notes_detector/main/
source_host: xusheng.dev
clip_date: 2026-10-22T10:25:46+08:00
trace_id: 512af656-e434-452c-9a9b-878ea63b8773
content_hash: c52824c29bc76738332ef86bdf0284d427a27a8a499e15698d566d0cb2c5231f
status: synced
tags:
  - macOS逆向
  - Windows逆向
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: Zoom 通过读取操作系统自带的隐私指示器记录（无需麦克风权限）判断其他应用正在使用麦克风，据此在 Google Meet 等第三方会议中弹出“记笔记”提示。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40175244-d011-8190-952d-d73e6706f20f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Zoom 通过读取操作系统自带的隐私指示器记录（无需麦克风权限）判断其他应用正在使用麦克风，据此在 Google Meet 等第三方会议中弹出“记笔记”提示。
> 
> - **macOS 实现：** 分析 Zoom Workplace 7.1.5 arm64 的 `viper.framework` 中 `PrivacyEventMonitor` 类；该类启动 `/usr/bin/log stream`，用谓词锁定 `com.apple.controlcenter` 的 `sensor-indicators` 类别，从 `[mic] Google Chrome (com.google.Chrome)` 这类记录中解析应用名与 bundle ID，再对比前后归属列表，得出麦克风开始或停止使用事件。
> - **Windows 实现：** Zoom Workplace 7.1.8 x64 的 `viper_async_device.dll` 以 `KEY_READ` 打开 `HKCU\...\CapabilityAccessManager\ConsentStore\microphone`，枚举打包应用与 `NonPackaged` 子键，读取 64 位 `LastUsedTimeStop`；值为 0 表示该应用正在使用麦克风。未发现 ETW 或音频会话监听。
> - **上层映射：** 检测信号经产品分类映射（`chrome` 被标记为 Google Meet）及通知、应用黑名单策略后，才决定是否显示 Take Note 提示；该机制应称为“麦克风占用检测”而非“会议检测”，Chrome 因其他原因用麦同样会触发。
> - **无需特权：** 以普通用户即可执行该 log stream 谓词，不需要 sudo，也不需要麦克风、屏幕录制、系统音频录制或辅助功能权限；Windows 侧位于 HKCU 且仅请求读权限，同样无需提权。
> - **稳定性风险：** 依赖未公开的 macOS 日志格式与 Windows 注册表实现，系统厂商可随时更改；静态分析未能确定轮询间隔、控制功能开关以及是否将检测数据纳入遥测。

## TL;DR

-   Zoom can notice that Google Meet, Teams, Slack, and other applications may be in a meeting and offer to start My Notes
-   On macOS, Zoom monitors Control Center’s `sensor-indicators` log stream
-   The messages contain records such as `[mic] Google Chrome (com.google.Chrome)`
-   Zoom extracts an application identity and detects when microphone use starts or stops
-   On Windows, it obtains equivalent application-usage information from the per-user Capability Access Manager microphone records in the registry
-   Reading this metadata requires neither administrator/root privileges nor Zoom microphone permission

![Zoom suggesting note-taking during a Google Meet call](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5cea2a493549b3d8.jpg)

## Why does Zoom know that Chrome is using the microphone?

Zoom’s My Notes feature can take notes during meetings hosted in applications such as Google Meet, Microsoft Teams, and Slack. Before the user starts it, Zoom can display a **Take Note** prompt when it thinks a third-party meeting is in progress.

That raised an interesting question: how does Zoom recognize the other application before it has started taking notes?

The answer differs by platform. On macOS, Zoom parses human-readable Unified Logging output. On Windows, it enumerates microphone-usage records in the registry.

## The macOS detector

I statically analyzed the arm64 build of Zoom Workplace 7.1.5 (84650).

The implementation is in a class named `PrivacyEventMonitor` inside `viper.framework`. Its relevant methods are:

```text
-[PrivacyEventMonitor startMonitoring]
-[PrivacyEventMonitor handleLogOutput:]
-[PrivacyEventMonitor parseSystemLogLine:]
-[PrivacyEventMonitor parseAttributionsStringForMicrophone:]
-[PrivacyEventMonitor notifyMacAppStateChange:previousStates:]
```

`startMonitoring` launches `/usr/bin/log`:

```bash
/usr/bin/log stream \
  --type log \
  --level default \
  --predicate 'subsystem == "com.apple.controlcenter" AND category == "sensor-indicators"' \
  --style compact
```

macOS Control Center maintains the orange and green privacy indicators for microphone and camera use. The same subsystem writes the currently responsible applications to Unified Logging. A microphone record for Chrome looks like:

```text
Sorted active attributions from SystemStatus update: [mic] Google Chrome (com.google.Chrome)
```

macOS has already supplied the display name and bundle ID. Zoom keeps entries marked `[mic]`, parses those two fields, and compares each new attribution list with the previous one. An application appearing or disappearing becomes a microphone-start or microphone-stop event; no audio analysis is involved.

## From Chrome to Google Meet

The UI layer contains a product category named `chrome`, labels it **Google Meet**, and applies notification and per-application blacklist settings. The overall flow is:

```text
Chrome opens the microphone
  -> macOS updates Control Center's sensor attribution
  -> Control Center emits a sensor-indicators log record
  -> Zoom extracts “Google Chrome” and “com.google.Chrome”
  -> Zoom detects an application-state transition
  -> product mapping and notification policy
  -> optional “Take Note” prompt
```

This is more accurately called **microphone-use detection** than meeting detection. Chrome could be accessing the microphone for a reason unrelated to Google Meet. Zoom’s higher layers decide whether the signal should produce a prompt.

## The Windows detector

I also statically analyzed Zoom Workplace for Windows x64 7.1.8.46825. Its detector is in `viper_async_device.dll` and reads this per-user registry key:

```text
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\
CapabilityAccessManager\ConsentStore\microphone
```

Zoom opens the key with `KEY_READ`, enumerates packaged application entries and the `NonPackaged` subtree used by classic desktop applications, and queries each entry’s 64-bit `LastUsedTimeStop` value. A zero value represents an access interval that has not ended, so Zoom treats that application as currently using the microphone.

The Windows flow is therefore:

```text
Chrome opens the microphone
  -> Windows updates ConsentStore\microphone\NonPackaged
  -> LastUsedTimeStop remains zero while access is active
  -> Zoom enumerates the registry records
  -> Zoom identifies Chrome's executable
  -> product mapping and notification policy
  -> optional “Take Note” prompt
```

This part uses ordinary registry APIs. I found no ETW consumer, audio-session observer, or PCM processing in the application-attribution routine. Static analysis does not establish its polling interval, the feature flags controlling it, or whether detection metadata is included in telemetry.

## Does this require permission?

I tested Zoom’s exact `/usr/bin/log stream` predicate as an ordinary user, without `sudo`, and macOS accepted it. Reading the records did not require Microphone, Screen Recording, System Audio Recording, or Accessibility permission.

On Windows, the key is under `HKEY_CURRENT_USER` and Zoom requests only `KEY_READ`, so it likewise requires neither elevation nor microphone access.

Neither mechanism should be treated as a stable application API. Zoom depends on undocumented macOS log formatting and Windows registry implementation details that either operating-system vendor could change.

It is a clever use of privacy bookkeeping that both operating systems already expose—and a reminder that privacy indicators can themselves become a source of cross-application activity information.
