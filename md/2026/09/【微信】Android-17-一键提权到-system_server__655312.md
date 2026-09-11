---
title: 【微信】Android 17 一键提权到 system_server
source: https://mp.weixin.qq.com/s/pow3GczXHDTJEdeinuY6zQ
source_host: mp.weixin.qq.com
clip_date: 2026-09-11T13:54:01+08:00
trace_id: ae485c43-b883-4934-bbf5-9d3c16676452
content_hash: f2c078d306efc0ea1de471ff91c107f39b662be2ddfd0ac2bee52b134307d687
status: synced
tags:
  - 微信
  - Android逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: CVE-2026-49881 让 Android 17 上任意无权限应用零交互提权到 system_server（UID 1000）执行任意代码。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3d875244-d011-81fc-89aa-dd19f5a2a71c
ioc:
  cves:
    - CVE-2024-34740
    - CVE-2026-49881
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CVE-2026-49881 让 Android 17 上任意无权限应用零交互提权到 system_server（UID 1000）执行任意代码。
> 
> - **漏洞链路：** `TelecomManager.addCall` → `InCallController.getInCallServiceComponents` → 恶意 `InCallService` 的 `CLASS_EXISTENCE_CHECK` 元数据 → `createPackageContextAsUser`(`CONTEXT_IGNORE_SECURITY`) 取 ClassLoader，四跳全走公开 API。
> - **真正落点：** `Class.forName(..., false, classLoader)` 虽不初始化类，但 `getClassLoader()` 触发攻击者 `AppComponentFactory.instantiateClassLoader()` 回调，代码已在 system_server 内执行。
> - **PoC 与编译：** GitHub `Supersonic/TLPE`，`./build.sh` 一键出包；手动流程为先 `assembleSystemRelease` 再嵌入 `assets/system.apk` 后 `assemblePocRelease`。
> - **持久化手法：** 反射 `PackageManagerService.mSettings`，向 `android.uid.system` 的 `mPastSigningCertificates` 塞签名两次并标 `SHARED_USER_ID`，重装为 `sharedUserId=android.uid.system` 变体，跨 OTA 残留；同时把 `package_verifier_user_consent` 置 -1 关掉 Play Protect。
> - **补丁与防御：** 补丁 commit `668eb07260ec` 在 `serviceClassExists` 前校验调用方身份；用户更新 9 月 ASB（Telecom 属 mainline，可单独更新 Play 系统组件），已中招者需恢复模式清理 `packages.xml`。

**黑白之道** *2026年9月11日 08:33*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：斯里兰卡移动安全研究员 sithi（@0xsithi，50+ CVE 移动安全研究员）昨日公开了 CVE-2026-49881 的完整 PoC 与 writeup。这枚藏在 Android 17 Telecom 服务（Android 系统通话与来电管理服务）里的逻辑漏洞，让任意无特权应用都能以 system_server 身份（UID 1000，Android 系统的核心权限中枢）执行任意代码——而且全程零交互、零权限弹窗。9月 ASB（Android Security Bulletin，Android 每月安全公告）同步推送补丁，但补丁本身的代码量说明 Android 团队当年埋雷的时候根本没想清楚。

* * *

## 一、漏洞速览

为什么这个漏洞值得专门写一篇文章？因为它把 LPE（Local Privilege Escalation，本地提权）做到了 **教科书级别** 的简短。

![生成的图像 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c4b91c2895682ef6.png)

CVE-2026-49881 落在 Android 17 的 `packages/services/Telecomm` 模块，触发点是 `InCallController` 类（系统通话界面控制器）的 `serviceClassExists` 方法。攻击链路只有四跳：

1.  普通 `TelecomManager.addCall` 调用（需要 `MANAGE_OWN_CALLS` 管理自身通话权限——这权限安装即授予，不弹窗）
    
2.  触发 `InCallController.getInCallServiceComponents`
    
3.  命中带 `android.telecom.CLASS_EXISTENCE_CHECK` 元数据的恶意服务（继承 `InCallService` 通话服务的系统组件）
    
4.  调用 `createPackageContextAsUser` （跨用户创建包上下文） + `CONTEXT_IGNORE_SECURITY` → `getClassLoader` （获取类加载器） → 触发攻击者控制的 `AppComponentFactory` （应用组件工厂）
    

整个过程没有任何 SELinux 拒绝、没有权限校验弹窗、没有用户感知。 `system_server` 进程会乖乖地加载攻击者 APK 的 ClassLoader，在攻击者构造的 `instantiateClassLoader()` 回调里执行任意 Java 代码。

报告者 sithi 在 4 月 10 日向 Android Security Team 上报，5 月 6 日确认，9 月 ASB 推送补丁。最初只影响 Pixel 的 Android 16 QPR3 与 Android 17 Beta，后来 AOSP（Android Open Source Project，Android 开源项目）Android 17 stable 也跟着中招。

* * *

## 二、PoC 实战演示

sithi 在 GitHub 上线的 TLPE（Telecom Local Privilege Escalation）项目跑出来是这个效果：

![TLPE PoC 截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b1455ebf07561d5.png "TLPE PoC 截图")

界面上的 `id` 输出直接显示 `uid=1000(system)` ，后面跟着 26 个 system_server 专属附加组（radio、bluetooth、graphics、input、audio、camera、log、mount、wifi、usb、gps、media_rw、mtp、net_bt_admin、net_bt、inet、net_admin……），SELinux 上下文 `u:r:system_server:s0` 。点击 Start Exploit，整个过程秒级完成。点 Uninstall 才能彻底清理（注意：补丁之后这条利用链就失效了，但已被注入的恶意签名仍残留，要手动清理）。

* * *

## 三、PoC 下载与编译

完整 PoC 项目已在 GitHub 开源，作者 sithi 公开了所有源码与构建脚本。

**GitHub 仓库地址**：

```
https://github.com/Supersonic/TLPE
```

**目录结构**：

| 路径  | 说明  |
| --- | --- |
| `README.md` | 作者 writeup 原文 |
| `build.sh` | 一键编译脚本（先编译 system APK，再嵌入到 poc APK 资源里） |
| `TLPE/app/src/main/AndroidManifest.xml` | 核心入口：声明 `AppComponentFactory=".EvilFactory"` + `InCallService` + `android.telecom.CLASS_EXISTENCE_CHECK` 元数据 |
| `TLPE/app/src/main/java/poc/sithi/tlpe/EvilFactory.kt` | 触发点： `instantiateClassLoader` 重写方法 |
| `TLPE/app/src/main/java/poc/sithi/tlpe/MainActivity.kt` | "Start Exploit" 按钮：调用 `TelecomManager.addCall` 触发攻击链 |
| `TLPE/app/src/main/java/poc/sithi/tlpe/RPMS.kt` | 反射操作 `PackageManagerService.mSettings` 实现持久化 |
| `TLPE/app/src/main/java/poc/sithi/tlpe/Utils.kt` | 工具函数（APK 复制、调用 `sh` 反射等） |
| `TLPE/app/src/main/java/poc/sithi/tlpe/Provider.kt` | ContentProvider（给 EvilFactory 回传 system APK） |
| `TLPE/app/src/system/AndroidManifest.xml` | 重装变体的清单（带 `android.uid.system` + `process=system` ） |

**GitHub 原始仓库**：

```
https://github.com/Supersonic/TLPE
```

**编译方法** （两步式）：

```bash
# 方法一：一键脚本
cd TLPE
./build.sh
# 产物在 ./poc.apk

# 方法二：手动
cd TLPE
./gradlew clean
./gradlew :app:assembleSystemRelease
cp app/build/outputs/apk/system/release/app-system-release.apk app/src/poc/assets/system.apk
./gradlew :app:assemblePocRelease
# 产物在 app/build/outputs/apk/poc/release/app-poc-release.apk
```

**测试环境要求**：

-   Android 17 设备（部分 Android 16 QPR3+ Pixel 也受影响）
    
-   9月 ASB 之前的安全补丁版本（即未修补状态）
    
-   PoC 仓库里附带了 release keystore（ `TLPE/app/teststore.jks` ），作者建议生产测试用自备 keystore，避免污染
    

**警告**：

-   PoC 在获取 system_server 代码执行后，会把 PoC APK 的签名注入到 `android.uid.system` 的 `mPastSigningCertificates` 。 **这个状态会跨 OTA 持久化，即使漏洞打补丁之后残留签名依然生效**——意味着即便补丁打了，已中招的设备如果不手动清理 packages.xml，应用依旧享有 system_server 权限。
    
-   PoC 还会把 `package_verifier_user_consent` （Play Protect 用户同意标志）置为 -1（关闭 Play Protect），否则重装阶段会被 Play Protect 拦截。
    
-   测试完务必点 PoC 界面上的 "Uninstall" 按钮做清理——它会先把注入的签名清空，再卸载 APK。
    
-   强烈建议不要在主力机上跑。
    

* * *

## 四、技术分析：从机制漏点到代码执行

### 3.1 元数据嗅探：起点的失误

`InCallController` 的设计本意是发现系统里所有 `InCallService` 实现。它通过 `queryIntentServices` 遍历组件，对于声明了 `android.telecom.CLASS_EXISTENCE_CHECK` 元数据的服务，会再走一步类存在性检查，避免遇到 framework 占位但未实现的类时崩溃。

问题就出在这一步：它对 **任何** 声明了该元数据的服务都执行检查，而不只是真正启用的 `InCallService` 。也就是说，攻击者可以注册一个完全无关的伪服务，让系统去"看看这个类到底存不存在"。

### 3.2 createPackageContext：CONTEXT_IGNORE_SECURITY 是惯犯

`serviceClassExists` 的实现如下（AOSP 注释也明确警示过 `CONTEXT_IGNORE_SECURITY` （忽略安全校验标志）的风险）：

```java
private boolean serviceClassExists(ServiceInfo serviceInfo, UserHandle userHandle) {
    try {
        Context packageContext = mContext.createPackageContextAsUser(
                serviceInfo.packageName,
                Context.CONTEXT_INCLUDE_CODE | Context.CONTEXT_IGNORE_SECURITY,
                userHandle);
        ClassLoader classLoader = packageContext.getClassLoader();   // ← 致命点在这
        Class.forName(serviceInfo.name, false, classLoader);
        return true;
    } catch (...) { ... }
}
```

代码作者用了 `initialize=false` ，意思是"我只查类，不初始化"。看起来很安全—— `Class.forName` 不会触发目标类的 `<clinit>` 。但 **这一步的伤害已经发生在 `getClassLoader()` 调用本身**。

### 3.3 AppComponentFactory：被忽视的攻击面

`LoadedApk.getClassLoader()` 在遇到携带 `android:appComponentFactory` 的应用时，会先从磁盘构造攻击者类的实例，然后调用其 `instantiateClassLoader()` 方法——这个回调就是漏洞的真正落地点。

PoC 的 `EvilFactory.kt` 写得相当克制，反射调用 `ActivityThread.currentApplication()` 拿到 `system_server` 内部的 `Application` 上下文，然后打印日志告知提权成功。真正的 payload 长什么样，由攻击者说了算。

```kotlin
override fun instantiateClassLoader(cl: ClassLoader, aInfo: ApplicationInfo): ClassLoader {
    if (Process.myUid() == aInfo.uid) return super.instantiateClassLoader(cl, aInfo)
    // 此时已经在 system_server 进程里
    val context = (Class.forName("android.app.ActivityThread")
        .getMethod("currentApplication").invoke(null) as Context)
    // 接下来：反射 PMS、注入签名、重装系统应用...
    return super.instantiateClassLoader(cl, aInfo)
}
```

### 3.4 完整攻击链图

![攻击链示意图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e255851214667ff.png "攻击链示意图")

四跳全部走的是 framework 公开 API，但中间任何一步如果加上"调用方 UID 不是 system_server/privileged app"判断，整个漏洞就废了。

* * *

## 五、持久化：从一次执行到永久扎根

拿到 `system_server` 代码执行权限只是开始。 `InCallController` 这条路径没法常驻——事件触发后回到等待状态。要把战果固定下来，sithi 借鉴了 Michał Bednarski 在 CVE-2024-34740（AbxOverflow）里公布的签名注入技巧：

1.  反射拿到 `PackageManagerService.mSettings` （PMS，包管理器服务的内存表示）
    
2.  通过 `SharedUserSetting` 找到 `android.uid.system` 这一共享 UID 配置
    
3.  把自己 APK 的 `Signature` 对象塞进 `getSigningDetails().mPastSigningCertificates` ，连续塞两次（"最近一次签名不计入轮换历史"是个坑）
    
4.  标记 `CertCapabilities.SHARED_USER_ID`
    
5.  强制卸载原 PoC APK，重新安装一个 `android:sharedUserId="android.uid.system"` + `android:process="system"` 的变体
    
6.  整个签名链能通过 `canJoinSharedUserId()` 校验
    

重装之后的 PoC 进程直接以 `system_server` UID（1000）和 SELinux 域跑在 `:system` 进程里——从这一刻起，应用就是系统组件，OTA（系统空中升级）之后即使打了补丁、应用本身的权限也不会被收回，因为 PMS 持久化的 `packages.xml` 已经写死了它的祖先签名。这是真正的 **带毒升级**。

* * *

## 六、补丁与防御

Android 团队的补丁（commit 668eb07260ec）思路很直接：在 `serviceClassExists` 真正进入攻击者上下文之前，先校验调用方身份，把"任何声明元数据的服务"这一范围收敛到"白名单服务"。但 PoC 的 README 末尾那段反思才是真正的重点——

> 这个类存在性检查与元数据比对，大概率是为了适配 `android.net.ConnectivityCallListenerService` 这一个具体服务的"防御性深度防御"补丁，作者偷懒写成了通用可复用逻辑，结果把安全假设彻底架空了。

对于普通用户：

-   立刻更新到 9 月 ASB 补丁版本
    
-   由于 Telecom 在 Android 17 是 mainline 模块（可独立通过 Google Play 系统更新分发），单独更新 Google Play 系统组件即可，无需等 OEM（设备厂商）全量推送
    
-   已中招的设备需要在恢复模式下手动清理 PMS 持久化的 `packages.xml` ，否则即便 OTA 之后，残留的恶意 APK 仍享有 system_server 权限
    

对于安全研究员：这条 `createPackageContext + getClassLoader` 的攻击模式并不新鲜，CVE-2024-34740 已经上演过一次。Android framework 内部任何 `CONTEXT_IGNORE_SECURITY` 调用点都是高危雷区，下一个爆点估计就在 `ConnectivityService` 或 `NotificationManagerService` 。

* * *

## 七、总结

CVE-2026-49881 给整个 Android 安全社区上了一课：当 framework 维护者把"防御性深度防御"做成通用机制时， **每一个新增的元数据开关都会变成新的攻击面**。 `InCallController` 的本意是防御，可它直接照搬 PMS/PackageInstaller 的 unsafe pattern，最后防御变成了漏洞本身。

这才是 LPE 研究里最让人上瘾的部分——你不需要找到 0day 内核缺陷，只需要盯着 framework 里那些"看起来无害、官方文档里写过注意事项"的老 API，等到它们被新逻辑调用、利用路径打通，就是一发入魂。

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
