---
title: 【看雪】MIUI 锁屏 MAML 的反射执行面
source: https://bbs.kanxue.com/thread-293548.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-17T08:53:02+08:00
trace_id: 1d8c6e6d-ff50-47bb-8c56-713e5618a0f7
content_hash: 867d1ab4bd867c6eeea488b4814bfa47aa67f8552db1c602c458e9c1d51e6237
status: synced
tags:
  - 看雪
  - Android逆向
  - 漏洞分析
series: null
feed_source: 看雪·Android安全
ai_summary: MIUI 锁屏主题的 MAML 脚本 `<MethodCommand>` 会被 SystemUI 直接翻译成 `Class.forName().getMethod().invoke()`，应用一个恶意主题即可在 SystemUI 进程内以 uid 1000 任意调用静态方法。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41b75244-d011-8105-b549-d15d9e81fff6
ioc:
  cves: []
  cwes: []
  hashes:
    - 700a432634a94dc7779df38016877c9a129f562a1409876c0a4ec1dea9d14f20
    - 9b577948b8fa3267548a464d91e03a9ac964280bbb40c1612302d7eff6dce695
    - 9f9477a14f8b7762f1feffdc47ed36d10772112ec59a2b6f689f5a0b8fb2e936
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> MIUI 锁屏主题的 MAML 脚本 `<MethodCommand>` 会被 SystemUI 直接翻译成 `Class.forName().getMethod().invoke()`，应用一个恶意主题即可在 SystemUI 进程内以 uid 1000 任意调用静态方法。
> 
> - **漏洞本体：** 锁屏包 `advance/manifest.xml` 是可执行的 MAML 脚本，`MethodCommand` 的 `class`/`method`/`params`/`paramTypes` 直接走 `Class.forName → getMethod → Method.invoke`，调用链 `ScreenElementRoot.init() → MethodCommand.init() → doPerform()` 上无类名/方法白名单、无签名校验、无 `IS_DEBUGGABLE` 开关；`mCapability` 默认 -1（全开），`CAPABILITY_CREATE_OBJ` 门不拦静态调用。
> - **真机实证：** 在 Xiaomi 22101317C / Android 14 / HyperOS OS2.0.6.0.UMQCNXM 上，最小 manifest 只写一行 `Log.d`，锁屏加载后 logcat 出现 `STAGE1_ALIVE`，来源 `com.android.systemui`（pid 3281，uid 1000，SELinux 域 `system_app`），`loadMethod()` 成功解析 `android.util.Log.d(String,String)` 与 `ActivityManager.getService()`。
> - **复现坑：** `params` 是表达式而非字符串，字面量必须写单引号（`params="'POC','STAGE1_ALIVE'"`），否则被当未定义变量求值为 null；`return` 变量默认进 double 桶，取对象需显式 `returnType="object"`（静态推断未复验）。
> - **影响与边界：** 执行侧无需 root/shell/任何权限，SystemUI 持有 `GRANT_RUNTIME_PERMISSIONS`、`WRITE_SECURE_SETTINGS`、`INTERACT_ACROSS_USERS` 等高危能力；但 SELinux 仍限 `system_app`，**不能直接 root**。投递链（实测需 shell 权限写入主题）与执行面分离且未公开。
> - **版本覆盖与修复：** HyperOS OS4.0.6.0.XPNCNXM（Android 17）静态对照显示 `MethodCommand` 逐指令等价、反射路径完整保留，跨两大版本持续存在；建议移除/白名单 `class` 反射、加载前静态校验 manifest、引入主题包作者签名、将反射执行放入低权限进程。作者公开了 PoC 仓库与"主题净化器"。

> 设备：Xiaomi 22101317C ｜ Android 14 (SDK 34) ｜ HyperOS OS2.0.6.0.UMQCNXM  
> 性质：本地漏洞（需应用一个恶意主题），无 root，执行上下文为 `com.android.systemui` （uid 1000）  
> 版本范围：仅在上述设备与版本实测；其它版本未验证  
> 代码与证据： [https://github.com/iskoishi/maml-systemui-rce](https://github.com/iskoishi/maml-systemui-rce)

* * *

## 摘要

MIUI 的锁屏主题不是"图片 + 布局"，而是一份可被执行的脚本（MAML）。锁屏清单里有一类命令 `<MethodCommand>` ，它的 `class` / `method` / `params` / `paramTypes` 四个属性会被框架直接翻译成 `Class.forName(...).getMethod(...).invoke(...)` 。

这意味着： **用户应用一个第三方主题，等价于在 SystemUI 进程里执行主题作者指定的、任意签名的静态方法调用，参数完全由作者控制。**

我们在真机上确认了这一点：锁屏 manifest 里写入一行 `Log.d` ，日志由 `com.android.systemui` （pid 3281，user system）打出，且 `loadMethod()` 明确解析到了 `android.util.Log.d(String, String)` 。同一路径下 `android.app.ActivityManager.getService()` 也能被解析。

* * *

## 我们发现这个漏洞的过程

我们原本在做 HyperOS 主题应用链路的审计，关注的是"第三方主题是怎么被装到设备上、怎么被应用"的——也就是主题商店的 DRM 校验、路径处理、应用触发这些环节。

在追查锁屏主题内容如何被 SystemUI 加载时，注意到锁屏包里的 `advance/manifest.xml` 不是一个静态布局描述，而是一份 **MAML 脚本** （Miui Advanced Markup Language，MIUI 自 MIUI 6 起的声明式 UI/脚本框架）。脚本里的 `<ExternalCommands>` 区块是设计给主题作者写交互用的（音乐控制、充电动画、天气联动）。

其中一类命令引起了我们的注意： `<MethodCommand>` 。它的属性名（ `class` / `method` / `params` / `paramTypes` ）和"反射调用"这几个字的字面语义完全一致。我们随后在 SystemUI 的 dex（ `classes3.dex` ，MAML 相关类全部位于其中）里确认了这条调用链：

```python
Keyguard 显示
  └─ ScreenElementRoot.init()
       └─ 解析 <ExternalCommands>
            └─ Trigger action="init"
                 └─ ActionCommand.MethodCommand.init()   → Class.forName / getMethod
                      └─ doPerform()                    → Method.invoke
```

整条路径上 **没有任何类名白名单、方法白名单、签名校验或调试开关**。

为了验证这不是静态推演，我们做了一个最小 manifest：只写一行 `Log.d` ，外加一个文本元素用于肉眼确认渲染。把它作为锁屏内容应用后，logcat 里出现了来自 `com.android.systemui` （pid 3281，user system）的 `STAGE1_ALIVE` ，且 `loadMethod()` 明确解析到了 `public static int android.util.Log.d(String, String)` 。 **任意静态方法调用在 SystemUI 进程内真实执行。**

* * *

## 我们的思路

几点我们在研究过程中坚持的判断，供交流：

1.  **"主题是内容"这个心理模型是错的。** 用户对主题的预期是一张图、一套图标、一个布局；而 MAML 让主题成了可执行代码。没有任何理由要求普通用户对主题做安全审查——主题的分发渠道（社区站点、网盘、群聊）普遍没有签名与审计机制。
2.  **我们把重心放在"运行时执行面"，而不是"投递链"。** 运行时是漏洞本体（任意代码在哪执行），投递是前提（主题怎么到那里）。运行时需要修、且是普适危险的；投递只是某个具体场景的入口。这也是为什么我们公开的材料只讲运行时。
3.  **只证明能证明的。** PoC 只做了一次 `Log.d` （代码执行已实证）；"拿到对象后调实例方法"在文中明确标注为 **静态推断、未真机验证**，不夸大。复现时最容易踩的坑（ `params` 是表达式不是字符串、 `return` 变量默认写进 double 桶）也都如实写了出来。
4.  **不公开投递链细节。** 我们没有公开任何具体第三方工具的利用方式，也没有公开投递链的实现——这是为了避免给攻击者提供完整链路，也避免波及第三方主题工具生态。
5.  **把完整链条留给社区。** 这个执行面是图灵完备的，从"SystemUI 里任意静态方法调用"到"实际影响"的链条，取决于 system_app 能触达什么，值得社区继续深挖。我们只负责把门打开并做好记录。

* * *

## 背景

MIUI 从 MIUI 6 起就有自己的声明式 UI/脚本框架 MAML，用于锁屏、AOD（息屏显示）、状态栏插件。主题包中的锁屏部分是一个独立 zip，内部 `advance/manifest.xml` 是入口文件，根节点为 `<Lockscreen>` 。

`<ExternalCommands>` 是 MAML 的"命令区"，支持 `VariableCommand` 、 `ExternCommand` 、 `BinderCommand` 、 `IntentCommand` 、 `MultiCommand` ，以及本文的主角 `MethodCommand` 。

`MethodCommand` 的语义，直白地说，就是"在宿主的进程里反射调用一个 Java 方法"：

```xml
<MethodCommand class="某个类的全名"
               method="方法名"
               params="参数1,参数2"
               paramTypes="String,String"
               target="某个对象" targetType="var" />
```

`class` + `method` 走静态调用； `target` + `method` 走实例调用。 `params` 是 **表达式列表** 而不是字符串字面量——这一点后面会讲到，是复现时最容易踩的坑。

* * *

## 执行面在哪里

锁屏的 MAML 由 SystemUI 加载与渲染。调用链（静态确认）：

```python
Keyguard 显示
  └─ ScreenElementRoot.init()
       └─ 解析 <ExternalCommands>
            └─ Trigger action="init"
                 └─ ActionCommand.MethodCommand.init()   → Class.forName / getMethod
                      └─ doPerform()                    → Method.invoke
```

在我们的静态审计里（SystemUI 的 `classes3.dex` ，635 个 MAML 类都在这个 dex 中），这条路径上：

-   `BaseMethodCommand.init()` 无条件调用 `Class.forName`
-   `loadMethod()` 无条件调用 `getMethod`
-   `doPerform()` 走 `Method.invoke`
-   **没有类名白名单、没有方法白名单、没有签名校验、没有 `Build.IS_DEBUGGABLE` 之类的开关**

唯一新增的门是 `MethodCommand` 构造对象时的 `CAPABILITY_CREATE_OBJ` 能力位，但它只影响"能不能 new 一个对象"，对 `class` + `method` 这种静态调用不生效；而且 `ScreenElementRoot.init()` 默认 `mCapability = -1` （全开）。

* * *

## 证据

### 静态证据

| 项   | 值   |
| --- | --- |
| `/system_ext/priv-app/MiuiSystemUI/MiuiSystemUI.apk` | 46,866,083 B，SHA-256 `9f9477a14f8b7762f1feffdc47ed36d10772112ec59a2b6f689f5a0b8fb2e936` |
| ├ `classes3.dex` （MAML 所在） | SHA-256 `700a432634a94dc7779df38016877c9a129f562a1409876c0a4ec1dea9d14f20` |
| 关键类 | `com.miui.maml.ActionCommand$MethodCommand` 、 `BaseMethodCommand` 、 `TargetCommand` |
| 关键属性解析 | `class` / `method` / `params` / `paramTypes` / `return` / `returnType` / `target` / `targetType` |

### 动态证据（真机）

最小无害 manifest（只做一次日志，加一个文本元素便于肉眼确认渲染）：

```xml
<?xml version="1.0" encoding="utf-8"?>
<Lockscreen displayDesktop="false" frameRate="0" screenWidth="1080" version="2">
    <ExternalCommands>
        <Trigger action="init">
            <MethodCommand class="android.util.Log" method="d"
                params="'POC','STAGE1_ALIVE'" paramTypes="String,String" />
            <MethodCommand class="android.app.ActivityManager" method="getService"
                return="ams" />
        </Trigger>
    </ExternalCommands>
    <Text x="120" y="400" size="42" color="#FFFF0000" text="POC-OK" />
</Lockscreen>
```

熄屏再亮屏后，logcat：

```python
D/ScreenElementRoot( 3281): init
D/ActionCommand( 3281): MethodCommand, target=null type=SCREEN_ELEMENT,
        class=android.util.Log type=SCREEN_ELEMENT, method=d
D/ActionCommand( 3281):     loadMethod(), successful.
        public static int android.util.Log.d(java.lang.String,java.lang.String)
D/ActionCommand( 3281): MethodCommand, target=null type=SCREEN_ELEMENT,
        class=android.app.ActivityManager type=SCREEN_ELEMENT, method=getService
D/ActionCommand( 3281):     loadMethod(), successful.
        public static android.app.IActivityManager android.app.ActivityManager.getService()
D/POC     ( 3281): STAGE1_ALIVE
```

`pid 3281` 的身份：

```python
$ ps -A -o PID,USER,NAME | grep 3281
3281  system  com.android.systemui
```

即 **uid 1000 / user system / SELinux 域 `system_app`**。锁屏界面同时渲染出 `POC-OK` 红字，说明 manifest 确实被当作锁屏内容加载并执行。

### 一个容易踩的坑（复现必读）

`params` 是 **表达式**，不是字符串。写成 `params="POC,STAGE1_ALIVE"` 时， `POC` 被当成未定义变量求值为 `null` ，最终调用 `Log.d(null, null)` ，抛出：

```python
E/ActionCommand: java.lang.reflect.InvocationTargetException
E/ActionCommand:  cause: java.lang.NullPointerException: println needs a message
```

字面量必须用单引号： `params="'POC','STAGE1_ALIVE'"` 。

同理， `return` 变量默认写进 double 桶（ `returnType` 缺省为 `NUM` ），要让 `target` 能取到对象，按静态分析需要显式写 `returnType="object"` （这一点为反汇编推断，未做真机复验）。

* * *

## 影响

| 维度  | 说明  |
| --- | --- |
| 权限  | 无需 root、无需 shell、无需任何系统授权（执行侧） |
| 触发条件 | 仅需"恶意锁屏包出现在锁屏资源位置 + 被加载一次"； **执行侧不消耗任何权限** |
| 投递前置（前提，非洞本身） | 攻击者前置。本次研究实测的投递需要 **shell** 权限（把恶意锁屏资源写入设备并触发应用）；执行侧无需任何权限。投递与执行分离：漏洞本体是"主题被加载后在 SystemUI 内反射执行" |
| 上下文 | `com.android.systemui` ，uid 1000，SELinux `system_app` |
| 能力  | 任意类的静态方法调用（**真机已证明**： `Log.d` 实际打出 `STAGE1_ALIVE` ）；拿到对象后可调实例方法（静态推断，未真机验证）；参数完全可控 |
| SystemUI 持有 | `GRANT_RUNTIME_PERMISSIONS` 、 `WRITE_SECURE_SETTINGS` 、 `INTERACT_ACROSS_USERS` 、可见性极高的系统服务句柄 |
| 边界  | **不能直接 root**。SELinux 域仍是 `system_app` ，无法关 SELinux、无法写系统分区、无法 su |

需要强调的是：这不是"主题能画 UI"的问题，而是"主题是代码"的问题。

* * *

## 修复建议

1.  **收窄 `MethodCommand`**：移除 `class` 反射，只允许调用与 `ScreenElement` 绑定的既定方法；或维护一份极小的白名单（且白名单里不能出现 `java.lang.reflect` 、 `Runtime` 、 `ProcessBuilder` 、 `ActivityManager` 、 `ServiceManager` 这类类）。
2.  **加载前静态校验**：锁屏 manifest 进入解析器前做一次结构检查，拒绝 `<ExternalCommands>` 中的反射类命令。这一条对正常主题零影响——正常主题用的是 `VariableCommand` / `ExternCommand` / `BinderCommand` ，它们都绑定在 MAML 自己的对象模型上。
3.  **主题包签名**：引入作者私钥签名并在加载时校验，而不是依赖主题商店的 DRM（DRM 只覆盖商店分发的主题）。
4.  **能力最小化**：即便保留反射，也应在独立的低权限进程或受限 ClassLoader 中执行，而不是直接跑在 SystemUI 主进程里。

* * *

## 版本覆盖与局限

| 版本  | 证据类型 | 结论  |
| --- | --- | --- |
| HyperOS **OS2.0.6.0.UMQCNXM** （Android 14，本文验证机） | 真机运行 + 静态 | 反射执行成立（日志、pid、渲染全部实测） |
| HyperOS **OS4.0.6.0.XPNCNXM** （Android 17 / SDK 37，固件镜像 `super.img` 内 `build.prop` 读出； **未真机验证**） | 纯静态 | `ActionCommand$MethodCommand` / `BaseMethodCommand` 结构与 2.0.6 **逐指令等价**： `Class.forName` → `getMethod` → `Method.invoke` 三步完整保留；无白名单、无 `IS_DEBUGGABLE` 开关、无签名校验； `ReflectionHelper` 的 9 个反射句柄（含 `setAccessible` ）全部还在 |

-   4.0.6 的 SystemUI： `MiuiSystemUI.apk` 52,007,560 B，SHA-256 `9b577948b8fa3267548a464d91e03a9ac964280bbb40c1612302d7eff6dce695` ；659 个 `com.miui.maml.*` 类全部位于其中的 `classes3.dex` 。
-   即：这不是某个旧版本遗留的代码路径， **跨两个大版本持续存在** （代码层面确认，4.0.6 未真机验证）。
-   局限：4.0.6 只做了静态对照，未在真机验证；其它机型、其它版本未取素材，不做外推。
-   时间线：2026-11-14 完成 2.0.6 真机验证与 4.0.6 静态对照；本机无补丁。

* * *

## 相关链接

-   完整技术文章、PoC、证据与时间线： [https://github.com/iskoishi/maml-systemui-rce](https://github.com/iskoishi/maml-systemui-rce)
-   主题净化器（导入/应用前剥离反射命令）：见仓库 `poc/` 目录说明
