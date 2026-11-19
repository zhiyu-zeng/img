---
title: 【看雪】MIUI 锁屏主题 MAML 反射执行面能力简谈
source: https://bbs.kanxue.com/thread-293583.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-19T08:55:53+08:00
trace_id: 7e9506b7-21aa-45e7-83ef-cee03ee2bb23
content_hash: c14cbe090a9e4b960cc81c111d20c33f12c35b778ae815cb693f27420a1eea8d
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8104-855d-f0d9994038ef
ioc: null
---

> 承接上一篇《MIUI 锁屏主题 MAML 反射执行面》（ `maml-systemui-rce` ）。  
> 本篇用自动化探测脚本补充实测：这个执行面到底能做什么。  
> 设备与版本同前（Xiaomi 22101317C，Android 14，HyperOS OS2.0.6.0.UMQCNXM）。

* * *

## 一、回顾

上一篇记录了：第三方主题锁屏包 `lockscreen/advance/manifest.xml` 中的 MAML `<MethodCommand class="..." method="...">` 由 **SystemUI** （uid 1000， `system_app` ， `sharedUserId="android.uid.system"` ）解析并反射执行。

本篇进一步：构造一个含 8 项能力测试的探测主题，应用后自动收集执行结果，逐项记录"能做什么"。

## 二、实测能力（8/8，真机验证）

| 能力  | 实测证据 |
| --- | --- |
| 静态方法调用（无参/有参） | 反射成功； `Log.d` 打出日志 |
| 静态方法带返回值 | `ActivityManager.getService()` 、 `ServiceManager.getService()` 返回对象可继续使用 |
| binder→接口转换 | `IPermissionManager$Stub.asInterface()` |
| 实例方法调用 | `IActivityManager.getCurrentUserId()` 成功 |
| 实例调用效果落地 | `IPermissionManager.grantRuntimePermission()` 授予 `READ_MEDIA_IMAGES` ，目标应用读取相册成功（ `granted=true` ） |
| 任意路径写 | `Utils.writeDataToFile()` 写入文件，内容完整落盘 |
| 系统属性读 | `SystemProperties.get()` 读到 `ro.build.version.release` |
| 参数/返回值可控 | String/int/对象参数；object/string/number 返回值均可指定 |

**关键机制**： `ServiceManager.getService(服务名)` → `Xxx$Stub.asInterface()` → 实例调用。这条链对任意 binder 服务理论上通用（实测 `permissionmgr` 一例）。

## 三、这些能力有什么用

以下基于上述实测的推断，仅描述用途方向，不涉及具体利用。

**1\. 运行时权限管理。**  
实测已可调用 `grantRuntimePermission` 。对于需要运行时权限但尚未授予的应用，可用主题在应用时一次授予（ `READ_MEDIA_IMAGES` 、 `CAMERA` 、 `RECORD_AUDIO` 等），省去逐项手动设置或命令行操作。只能授予运行时权限； `signature|privileged` 级权限（如 `MANAGE_EXTERNAL_STORAGE` ）不在其列。

**2\. 系统服务访问。**  
`getService` + `asInterface` 对任意 binder 服务通用。可在系统上下文调用框架公开方法（ `ActivityManager` / `PackageManager` 及各 MIUI 服务）。具体能调用的方法取决于 uid1000 的权限；权限不足时抛 `SecurityException` 。

**3\. 高度隐蔽的提权与执行。**  
由于代码完全运行在 `com.android.systemui` （uid 1000）的合法系统进程中，不涉及 fork 新进程或加载外部动态库。常规的恶意软件扫描（如查杀非系统进程、检测 su 二进制或异常应用行为）几乎无法察觉这种在系统核心进程内的反射提权行为。

**4\. 文件写入。**  
`writeDataToFile` 可向外部存储写入文件，内容可控。可用于写入配置类文件或作为攻击链的落地一环。

**5\. 锁屏承载逻辑。**  
锁屏 MAML 可执行方法调用，锁屏不限于静态显示，可承载轻量逻辑（读取信息、触发操作），配合 `Trigger` 使用。

**6\. 信息读取。**  
`SystemProperties.get` 可读系统属性，用于获取设备与系统信息。

## 四、边界与局限

-   **非 root。** 执行位于 uid1000（SystemUI），受其权限约束。需要 root 的操作（挂载、写 `/system` 等）不在其内。
-   **投递前置。** 需要用户应用一个主题，或具备 shell 写主题缓存。零权限投递链实测不成立。
-   **执行时机与常驻。** 默认在应用/加载时执行（ `init` 触发）；若要常驻需依赖主题自保持机制（如屏蔽 `CHECK_TIME_UP` 广播），其可靠性及对 SystemUI 稳定性的影响尚未做深度实测。需明确的是，即使常驻，它依然是受限的 uid1000 执行面，而非真正的 root 服务。
-   **版本范围。** 真机仅 HyperOS 2.0.6（Android 14）；4.0.6 做了逐指令静态对照（等价），未真机验证。
-   **平台可修。** 平台侧移除或白名单 MAML 反射命令即可封堵；社区可用净化器剥离。

## 五、防护建议

-   **平台侧**：建议官方增加 `<MethodCommand>` 的类名/方法名白名单机制，或直接移除该反射命令标签。
-   **社区侧**：已提供主题净化器剥离 `class=` / `method=` 反射命令（原型已在研究仓库），供普通用户过滤未知风险。

* * *

*本篇为客观实测记录与用途推断，不含攻击步骤与具体恶意 PoC。*
