---
title: 【看雪】MobiKwik root检测以及绕过方案
source: https://bbs.kanxue.com/thread-293694.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-27T08:18:43+08:00
trace_id: 464d0b28-b641-4d4b-807c-a796b029f935
content_hash: d00f95ef87ede2c7ed7b9bf16ce264b313aeff2b44b56238b9c920eb003eb57b
status: synced
tags:
  - 看雪
  - Android逆向
  - 风控对抗
series: null
feed_source: 看雪·Android安全
ai_summary: 本版 MobiKwik 转为“客户端只采集、服务端定规则”来判定 root，因此只 hook `isRooted` 返回 false 已无效，须让上报数据本身干净；另有 protectt 会在本地读取 manifest 并执行 `System.exit` 终止进程。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42575244-d011-81bc-ac28-d3b09a06570f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 本版 MobiKwik 转为“客户端只采集、服务端定规则”来判定 root，因此只 hook `isRooted` 返回 false 已无效，须让上报数据本身干净；另有 protectt 会在本地读取 manifest 并执行 `System.exit` 终止进程。
> 
> - **判定架构：** Bureau（`libglbrsgqs.so`）只采集 maps、fd、全 `/proc`、包列表、属性、内联 hook 与 Play Integrity 并上报，由服务端规则反射调用 `detectRootedDevice` 决定弹出提示、上报还是 kill；处置不再用 `SIGALRM` 自杀。
> - **精简绕过：** 在 APatch 中开启内核 root（KernelPatch），改名或移走 su，不安装 MT 和 Xposed/LSPosed，授权后卸掉管理器以免包扫描命中，关闭开发者选项、USB 调试和 VPN，最后冷启动验证进程存活。
> - **本地硬杀：** protectt 会逐个包调用 `getPackageInfo` 解出 manifest，子串匹配 `<applicationId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`（AGP 烧入，改包名无效）或 `BIND_JOB_SERVICE`、`LOCALE_CHANGED`、`UID_REMOVED`、`PACKAGE_REPLACED` 组合，命中即 `System.exit`。
> - **Hook 对策：** 对含特征串的包（及各 root/隐藏工具、agent）在 `getPackageInfo`、`getApplicationInfo` 抛 `NameNotFoundException`，再过滤 `getInstalledPackages`、`getInstalledApplications` 兜底；只 hook 后两者会漏，因其主路径不走全量枚举。
> - **不可伪造项：** Play Integrity 的 `jwsSafetynetResponse` 由 Google 签名，只能在客户端换 token、上 PIF 或用干净机，服务端无从伪造。

> 第一版在 [看雪（thread-289955）](https://bbs.kanxue.com/thread-289955.htm) ，讲的是「应用加固型」检测怎么绕：两层架构、70+ 路径扫描、 `statx` 二次验证、fd 遍历、 `SIGALRM` 自杀。这些 v1 都讲过了，本文不再重复。
> 
> 这里只写换代之后的升级点，以及精简后的对抗步骤。分析目标是 MobiKwik最新版本（ `com.mobikwik_new` ，23.77.1）；

下边是ai整理的，现在总结一下，这个app死磕root检测也是很奇葩，不过思路还是可以的，尤其扫描改包后的apatch的组件思路很好

## 1\. 先看对抗步骤吧！直接操作完就正常了

> 环境：APatch（KernelPatch 0.12.2，version_code 11143，配套 kpatch a07）。

1.  先把 APatch 的核心模式打开（内核 root / KernelPatch），再用 `kpatch` 确认确实生效。
2.  改掉 su 的路径：改名或者挪到非标准目录，系统里搜不到 `su` 字样，标准路径扫一轮下来全是空。
3.  MT 管理器、Xposed / LSPosed 模块这类会被扫到的工具，干脆别装。包扫描能命中安装包， `xposeddescription` 元数据、框架类名也会被直接查。
4.  root 本来就落在 boot 分区、不依赖 App，授权之后把 APatch 管理器卸掉就行，免得被包扫描扫到。
5.  开发者选项、USB 调试、VPN 都关掉—— `adb_enabled` 、 `development_settings_enabled` 和网络状态都会被读。
6.  冷启动目标 App 验一遍：启动页正常、不弹 root 提示、进程能活下来。

概括一下：核心模式拿权限，改 su 路径让文件检测落空，卸掉管理器让包扫描扫不到，再把开发者选项和 VPN 关掉收紧检测面。

环境干净之后，再挂上无痕的 hook 框架，就能正常 hook、抓包了——目标 App 不会再触发检测自杀，调用和流量都能正常观察。

之后就能正常抓包以及还原协议了，协议难度不大，主要是对抗root检测

* * *

## 2\. 升级：从「加固型」到「情报 + 服务端规则引擎」

| 维度  | 第一代（v1） | 第二代（本版新增） |
| --- | --- | --- |
| 判定位置 | 客户端本地 | 服务端规则引擎 |
| 采集面 | 少量文件、包列表 | maps、fd、全 `/proc` 、线程、属性、内联 hook、Play Integrity |
| 处置方式 | `SIGALRM` 自杀 | 规则反射调用，弹窗、上报、 `exit` 、native kill |
| 绕过要点 | 拦 syscall、压本地返回 | 让上报的原始数据本身干净 |

一句话说清楚：客户端不再当裁判，只负责采集上报。所以 v2 里单纯 hook 一个 `isRooted` 让它返回 false，已经不管用了。

* * *

## 3\. 第二代新增 / 加强的检测面

-   **全进程枚举**：按顺序 `newfstatat /proc/<pid>` ，实测启动后 20 秒内大约 1185 次。
-   **maps / fd**： `openat /proc/self/maps` 、 `/proc/self/fd` 加 `readlinkat` ，能抓到已经从 maps 删掉、但 fd 还开着的库。这套 v1 就有，v2 只是更频繁。
-   **RootBeer 变体**：15 条 su 路径，加 `busybox` / `magisk` 、 `ro.debuggable` / `ro.secure` / test-keys、mount RW、 `which su` 、native `checkForRoot` （字符串做了混淆，得还原算法）。
-   **全量包采集**： `getInstalledPackages(4224)` 拿全量、剔掉系统应用，再采 installer、mtime 和权限；没有 `QUERY_ALL_PACKAGES` 就退回一份硬编码的约 110 个 App 清单。
-   **Play Integrity**：上传体 `CommonRequest` 里带 `jwsSafetynetResponse` 和 `safetyNetDTO.payLoad` （token），服务端验 Google 签名。
-   **规则执行**：加密的二段 dex，反射调用 `detectRootedDevice` ，结果非空就弹窗、上报、kill。

* * *

## 4\. 检测内容清单（具体路径 / 包名 / 属性）

> 下面列的都是 SDK 在查什么，不是让你照着一条条藏。
> 
> 跟包有关的检测其实有两套，互相独立：一套是写死的包名清单（§4.3 的 `MFOr89hi` 、§4.5 的 `libitsobciw.so` ），另一套是运行时把每个已装包的 `AndroidManifest.xml` 读出来做子串匹配（§4.6）。两套的绕过方法不一样，别混为一谈。

### 4.1 root 二进制路径（RootBeer 变体）

根目录配二进制名（ `su` / `busybox` / `magisk` ），再加上 `PATH` 的每一段：

```python
/data/local  /data/local/bin  /data/local/xbin  /sbin  /su/bin
/system/bin  /system/bin/.ext  /system/bin/failsafe  /system/sd/xbin
/system/usr/we-need-root  /system/xbin  /cache  /data  /dev  /vendor/bin
```

运行时实测就是按这 15 条 su 路径逐个 `openat` ：

```python
/data/local/su  /data/local/bin/su  /data/local/xbin/su  /sbin/su  /su/bin/su
/system/bin/su  /system/bin/.ext/su  /system/bin/failsafe/su  /system/sd/xbin/su
/system/usr/we-need-root/su  /system/xbin/su  /cache/su  /data/su  /dev/su  /vendor/bin/su
```

另外还会起一个 `which su` 子进程。

### 4.2 mount / Magisk / 危险属性

-   检查这几个挂载点是否可写： `/system` `/system/bin` `/system/sbin` `/system/xbin` `/vendor/bin` `/sbin` `/etc`
-   Magisk / superuser 相关： `/sbin/.magisk` `/data/adb/magisk` `/system/xbin/busybox` `/system/app/Superuser.apk` `/system/bin/.ext/.su`
-   危险属性： `ro.debuggable=1` 、 `ro.secure=0` ，以及 `Build.TAGS` 里有 `test-keys`

### 4.3 包名黑名单（protectt MFOr89hi，Paranoid 解密）

-   **Root 应用（12）**： `com.noshufou.android.su` `com.noshufou.android.su.elite` `eu.chainfire.supersu` `com.koushikdutta.superuser` `com.thirdparty.superuser` `com.yellowes.su` `com.topjohnwu.magisk` `com.kingroot.kinguser` `com.kingo.root` `com.smedialink.oneclickroot` `com.zhiqupk.root.global` `com.alephzain.framaroot`
-   **破解 / 危险工具 + Xposed 管理器（27）**： `com.koushikdutta.rommanager` `com.koushikdutta.rommanager.license` `com.dimonvideo.luckypatcher` `com.chelpus.lackypatch` `com.chelpus.luckypatcher` `com.ramdroid.appquarantine` `com.ramdroid.appquarantinepro` `com.android.vending.billing.InAppBillingService.COIN` `…LUCK` `com.blackmartalpha` `org.blackmart.market` `com.allinone.free` `com.repodroid.app` `org.creeplays.hack` `com.baseappfull.fwd` `com.zmapp` `com.dv.marketmod.installer` `org.mobilism.android` `com.android.wp.net.log` `com.android.camera.update` `cc.madkite.freedom` `com.solohsu.android.edxp.manager` `org.meowcat.edxposed.manager` `com.xmodgame` `com.cih.game_cih` `com.charles.lpoqasert` `catch_.me_.if_.you_.can_`
-   **root 隐藏 / Xposed / Substrate（9）**： `com.devadvance.rootcloak` `com.devadvance.rootcloakplus` `de.robv.android.xposed.installer` `com.saurik.substrate` `com.zachspong.temprootremovejb` `com.amphoras.hidemyroot` `com.amphoras.hidemyrootadfree` `com.formyhm.hiderootPremium` `com.formyhm.hideroot`
-   **虚拟分身 / 克隆（5）**： `virtual.camera.app` `multispace.multiapp.clone.app.pro` `multispace.multiapp.clone.app` `com.clone.android.dual.space` `com.box.app.virtual`
-   **假 GPS（27）**： `com.lexa.fakegps` `ru.gavrikov.mocklocations` `com.mobile.fakelocation` `com.androidsc.fakegpsgo.pro` `com.blogspot.newapphorizons.fakegps` `com.locationchanger` `top.tinysoft.fakegps` `com.hopefactory2021.fakegpslocation` `com.rosteam.gpsemulator` `com.incorporateapps.fakegps_route` `com.wondershare.virtuallocation` `fr.dvilleneuve.lockito` `com.incorporateapps.fakegps.fre` `project.listick.fakegps` `com.just4funtools.fakegpslocationprofessional` `com.discipleskies.mock_location_spoofer` `fakegps.fakelocation.mocklocation.gpsfaker` `fake.gps.location.emulator` `com.rasfar.mock.location` `com.ninja.toolkit.pulse.fake.gps.pro` `com.mock.cartage` `com.evezzon.fakegps` `com.fakegpsjoystick.anytospoofer` `com.tenorshare.ianygo.fakegps` `app.steve.fakeroute` `com.imyfone.anytoandroid` `location.changer.fake.gps.spoof.emulator`
-   **Frida**： `me.shingle.fridaserver`

### 4.4 远程控制 / 屏幕共享检测（Blostem）

-   包名： `com.teamviewer.teamviewer.market.mobile` `com.teamviewer.quicksupport.market` `com.anydesk.anydeskandroid` `com.anydesk.control.android` `com.rsupport.mvagent` `com.splashtop.remote` `com.logmein.rescue` 等
-   顺带还会复查一遍 4.1 的 su 路径和 `/system/app/Superuser.apk` 。

### 4.5 protectt 原生库 libitsobciw.so 硬编码 root / 隐藏工具名单（19 个）

> 先更正一下归属：这 19 条明文在 protectt 的 `libitsobciw.so` 里（由 `cblz.CON.assert()` 通过 `System.loadLibrary("itsobciw")` 加载，另有 `"hxzimxwy"` ），不在 Bureau 的 `libglbrsgqs.so` 。它们散在 `.rodata` 里，是一条条独立的 `const char*` 字面量（比如 `…vvb2060.magisk\0com.resukisu.resukisu\0…` ），给 native 的 strcmp / strstr 用。

这份比 §4.3 的 MFOr89hi 新，覆盖了现在这一代的内核 root 和隐藏工具：

-   **Root / 内核 root（9）**： `com.topjohnwu.magisk` `io.github.huskydg.magisk` `io.github.vvb2060.magisk` `me.bmax.apatch` `me.weishu.kernelsu` `com.resukisu.resukisu` (ReSukiSU) `com.rifsxd.ksunext` (KernelSU-Next) `com.sukisu.ultra` (SukiSU Ultra) `me.yuki.folk`
-   **root 隐藏 / AppList（HMA 系，7）**： `com.hide.applist` `com.tsng.hidemyapplist` `com.tsng.hidemyapplist.pro` `icu.nullptr.hidemyapplist` `com.topmiaohan.hidebllist` `org.frknkrc44.hma_oss` `com.tsng.pzyhrx.hma`
-   **KSU WebUI**： `io.github.a13e300.ksuwebui` 　 **LSPosed**： `org.lsposed.lspatch` `org.lsposed.manager`

### 4.6 protectt 本地逐包读 manifest 做子串判定（本地硬杀 · 实证调用栈）

它跟 §3 / §5 里 Bureau 那套「全量采集、服务端裁定」不一样：protectt 这部分是本地自己判、自己杀。实测抓到的调用链长这样（下面是扫到某个已装工具包时的例子）：

```python
ApplicationPackageManager.getPackageInfo("bin.mt.plus", 128 /*GET_META_DATA*/)
  ← ai.protectt.apk.Utils.readManifestFileWithMagiskFilterV2:569
  ← ai.protectt.apk.Utils.detectRootedDevice:535
  ← cell0.COM5.class:121  →  System.exit(0)   // 进程内自杀
```

-   真正拿来判的是包里的 manifest 内容，不是包名。 `readManifestFileWithMagiskFilterV2` 会把已装包一个个的 `base.apk` 拆开取出 `AndroidManifest.xml` （ `ZipFile` 读流、 `AndroidManifestDecoder.decompressXML` 解成明文；读 APK 时能看到 `newfstatat/openat` ，KPM 的文件探针能抓到），然后对解出来的字符串做 `indexOf` 。命中下面任意一条，就把这个包名返回、交给 `detectRootedDevice` 去 `System.exit` ：
    -   `me.weishu.kernelsu.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
    -   `me.bmax.apatch.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
    -   `com.rifsxd.ksunext.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
    -   `com.sukisu.ultra.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
    -   或者这四条系统 intent / 服务特征同时出现： `BIND_JOB_SERVICE` 、 `LOCALE_CHANGED` 、 `UID_REMOVED` 、 `PACKAGE_REPLACED`
    -   顺带一提， `<applicationId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` 是 AGP 在构建时按 applicationId 烤进 manifest 的。只改包名、不重新打包，这串不会变，所以光换个包名躲不过去。
-   日志里那个 `getPackageInfo(name, 128)` 只是它逐包取 manifest 的入口——循环里每个已装包都会被调一次，不是一份固定的「目标清单」。所以看到 `getPackageInfo("<某工具包>",…)` 只能说明枚举到了它，不代表命中。像 MT 这种通用工具，走的是另一条路，也就是 §4.3 / §4.5 里 `libitsobciw.so` / `MFOr89hi` 的固定包名清单。
-   判定和处置都在本地完成（ `detectRootedDevice → System.exit` ），不是「全量枚举上报、服务端拉黑名单」——后者是对 Bureau 的结论。
-   它也不走 `getInstalledPackages` 全量枚举，而是逐包 `getPackageInfo` 拿 manifest。所以只 hook `getInstalledPackages` / `getInstalledApplications` 去过滤返回值没用（实测 observe 下这俩根本没被调用）。
-   对策是 hook `ApplicationPackageManager.getPackageInfo(String,int)` 和 `getApplicationInfo(String,int)` ，对含特征串的包（还有各 root 管理器、隐藏工具、agent 自己）直接抛 `NameNotFoundException` ，伪装成没装——循环跳过、manifest 读不到，自然不会命中；再顺带过滤 `getInstalledPackages` / `getInstalledApplications` 兜个底。实测这几处钩子都挂上之后，进程稳稳活了 30s 以上，没再 `System.exit` 。

* * *

## 5\. 两代判定链都要处理

-   **两套判定并存**：
    -   Bureau（ `libglbrsgqs.so` ， `NativeInteractor` ）是服务端规则引擎：只把原始数据采上去，由服务端拍板。本地压布尔没用，得让它上报的数据本身是干净的。
    -   protectt（ `ai.protectt.apk.Utils.detectRootedDevice` ， `libitsobciw.so` ）是本地硬杀：逐包 `getPackageInfo` 把 `base.apk` 的 manifest 读出来做子串匹配（§4.6 那四条 `DYNAMIC_RECEIVER…` 串加 intent 组合），命中就 `System.exit` 。既然是本地判的，就得 hook 返回值——对含特征串的包抛 `NameNotFoundException` ，让 manifest 读不到。压布尔对它没用，它根本不返回布尔，只看 manifest 里有没有那几串。
-   包检测走的是 Binder（ `getPackageInfo` / `getInstalledPackages` ），seccomp 和路径隐藏都拦不住。得 hook `ApplicationPackageManager` 的 `getPackageInfo` / `getApplicationInfo` （对目标包抛 `NameNotFoundException` ），再加上 `getInstalledPackages` / `getInstalledApplications` 过滤返回值。只 hook 后面这俩会漏，因为 protectt 主路径压根不调全量枚举。

> Play Integrity 只能在客户端 / 设备侧处理（上报前 hook 换掉 token、上 PIF / PlayIntegrityFix，或者干脆用干净机），服务端伪造不了。

* * *

## 打个广告

现在想找一份稳定的远程工作，全职、兼职或长期合作都行，方向偏移动安全 / 逆向工程 / 安全研究，国内海外都可以。

有兴趣欢迎联系
