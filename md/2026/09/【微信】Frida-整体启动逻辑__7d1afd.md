---
title: 【微信】Frida 整体启动逻辑
source: https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619811&idx=1&sn=bfee625d49ac82cbc5ddbde393844170&chksm=b0991b29a9ea4414dcb3a7f8d5691fd3988cb096372af2b51be5b7a6502bccd854705c68075e
source_host: mp.weixin.qq.com
clip_date: 2026-09-14T13:55:57+08:00
trace_id: e2c7db48-37c0-42d7-81ba-c4c07e4e4671
content_hash: 2d6f8f646b5971963235961e4c4beb95bef69fce2526976b856018ea5405ca48
status: synced
tags:
  - 微信
  - Android逆向
  - Frida
series: null
feed_source: 公众号·看雪学院（weread）
ai_summary: Frida 的 `-f` 靠 zygote 门控与目标进程 agent 两次性质不同的注入接力完成，而非把完整 agent 塞进 zygote。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3db75244-d011-81ea-8229-e3b454a2e420
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 的 `-f` 靠 zygote 门控与目标进程 agent 两次性质不同的注入接力完成，而非把完整 agent 塞进 zygote。
> 
> - **职责分工：** zygote/USAP 中只驻留一两页的 `zymbiote` 门控载荷，完整 `frida-agent` 只注入目标 App 子进程。
> - **默认时机：** `enable_preload` 默认 true，frida-server 启动即 preload 门控进 zygote、zygote64、usap32、usap64、Chrome zygote，并改写 `selinux_android_setcontext` 与 `android_os_Process_setArgV0` 两个函数指针槽；spawn/gating 里的 `ensure_loaded()` 只是幂等兜底。
> - **装载链：** spawn 返回 PID 后立刻 attach：PTRACE_SEIZE 保存寄存器 → bootstrapper 远程 mmap → loader 用 `pthread_create` 起工作线程后 detach → dlopen（上游）或自研 mapper 装载 agent → `frida_agent_main` → 注册 `AgentSessionProvider`，挂起的 attach 才返回；fd 跨进程靠 AF_UNIX + SCM_RIGHTS。
> - **放行：** 目标 App 卡在 setArgV0 replacement 的 `recv()`，需客户端 `resume()` 才发 1 字节 ACK；上游之后 tail-call `raise(SIGSTOP)`、server 还原槽位再 SIGCONT，当前工程改为先还原槽位、再 ACK、payload 自行 `munmap` 自毁。非目标 App 立即放行且不注入 agent。
> - **主要差异：** 当前工程把门控写入独立匿名 RX 页（而非 libstagefright.so 尾页）、去掉 `raise` 补 `munmap`、用私有 mapper 取代 `dlopen/dlsym`，并通过 `agent_base/agent_size` 显式传入自身范围；独立 attach 无门控段、时机更晚。

## F01 · Frida 整体启动、进程注入与 Zygote 门控

《凡人修仙传之 - Android 逆向开发》· 03 动态插桩功法 · 技能 F01

前置：01 炼气境 · 第 05 课《Android 应用启动过程》、第 07 课《Android ptrace 原理》

后续：F02 脚本加载时机；F04 server IPC；F05 Android SELinux；F09 自定义 linker

版本锚点：上游源码统一锚定 GitHub `frida/frida-core` tag **17.9.1** （2026-03-27，对应 frida 主仓库中 frida-core submodule commit `a62376a3` ）；frida-tools 取同期版本 14.8.0（2026-03-26）。正文行号与 `#L` 链接均实测自 17.9.1。凡标“当前工程/我们”的改动只描述设计思路与取舍，不附本工程源码。Android 14/API 34 实验记录。

## 开课词库：先分清三组角色

下表按三个主题收齐本课正文会出现的主要名词。这张表不是预习作业——正文讲到每个词时都会重新解释，听课时遇到陌生词回来查即可；带 ★ 的 12 个是贯穿全课的主线词，先记住它们，并分清四个角色：谁发起启动请求、App 进程由谁复制、Frida 在哪里门控、脚本最终由谁执行。

### A. Android 创建进程：从桌面到 App

### B. Frida 控制与注入：从命令行到目标进程

本课主线是 spawn，词表顺序也按 spawn 的时间线排。

### C. 门控与会话：什么时候停，什么时候放

最容易混淆的三个名字先单独钉住：

```toml
Zygote       = Android 的应用进程父体
zymbiote     = Frida 放进父体的小型门控载荷
frida-agent  = 最终进入目标 App、真正运行 Gum 与脚本的完整载荷
```

## 0\. 录课导学：从桌面点击到 Zygote fork

本课不从开机讲起。先把 Zygote 当作一个已经运行、正在等待创建请求的父进程，只看一个最常见的现场：

> 目标 App 当前没有进程。用户在桌面点击图标以后，究竟是谁找到 Zygote，又是谁执行了 `fork()` ？

容易产生两个误判：

-   Launcher 点击图标后直接创建了目标进程；
    
-   `system_server`
    
    收到启动请求后亲自 `fork()` 出 App。
    

两者都不准确。Launcher 只发起 Activity 启动请求； `system_server` 负责解析目标组件、检查启动条件并准备进程参数；真正复制进程地址空间的是 Zygote。先建立这条 Android 正常基线，后面才能看懂 Frida `-f` 为什么要提前处理 Zygote 和 USAP。

本节源码导航统一使用 Android Code Search 的 AOSP `main` 链接 \[16\]–\[22\]；课程实验仍以 Android 14/API 34 为基线。 `main` 后续增加的快速路径会单独标出，不把当前实现误写成所有版本唯一实现。

### 0.1 Launcher：点击图标只是发起启动请求

> 源码直达：Launcher3 · ItemClickHandler.java · ActivityTaskManagerService.java · ActivityStarter.java

AOSP Launcher3 的参考实现把桌面图标点击交给 `ItemClickHandler.onClick()` ；厂商桌面的类名和动画实现可能不同，但最终仍要发起 framework 的 Activity 启动请求。普通应用图标依次进入：

```
ItemClickHandler.onClick()
  → onClickAppShortcut()
  → startAppShortcutOrInfoActivity()
  → launcher.startActivitySafely(...)
```

源码入口见 `ItemClickHandler.java` \[16\]。这一步持有的是描述目标 Activity 的 `Intent` ，没有 `fork()` ，也没有加载目标 APK。请求继续经过 Android 的 Activity 启动接口，以 Binder 调用进入 `system_server` 中的 `ActivityTaskManagerService` （ATMS）；ATMS 与 `ActivityStarter` 负责解析目标 Activity、任务栈、用户和启动限制 \[17\]。

第一段链路可先记成：

```
桌面图标
  → Launcher3
  → startActivity
  → Binder
  → system_server：ATMS / ActivityStarter
```

### 0.2 system_server：决定是否需要新进程

> 源码直达：ProcessList.java · Process.java · ZygoteProcess.java

如果目标进程已经存在，系统可以直接向现有进程下发 Activity 生命周期事务，不需要再次请求 Zygote。

如果目标进程不存在，启动链会进入 AMS 的进程管理逻辑，最终由 `ProcessList.startProcessLocked()` 准备创建参数。这里有一个关键值 \[18\]：

```
final StringentryPoint ="android.app.ActivityThread";
```

这个值说明 Zygote 即将创建的不是“直接执行 APK `main()` 的进程”，而是以框架类 `ActivityThread` 为 Java 入口的新进程。目标 APK、 `Application` 和 Activity 要等新进程向 AMS 完成 `attach` 与 `bindApplication` 后才开始加载。

`ProcessList` 随后通过 `Process.start()` 进入 `ZygoteProcess.start()` / `startViaZygote()` \[19\]。这一段会把下面这些参数编码成 Zygote 命令：

```
uid / gid / supplementary groups
runtime flags
targetSdkVersion
seInfo
niceName / processName
ABI / instruction set
app data directory
entryPoint = android.app.ActivityThread
```

`system_server` 与 Zygote 之间使用本地 socket，而不是再走 Binder。 `ZygoteProcess` 把参数写入 Zygote socket，并同步等待子进程 PID：

```
ProcessList
  → Process.start()
  → ZygoteProcess.startViaZygote()
  → 写入 Zygote socket
  → 等待 pid / usingWrapper
```

### 0.3 Zygote：收到命令后才真正 fork

> 源码直达：ZygoteServer.java · ZygoteConnection.java · Zygote.java · Zygote native

Zygote 已经在 `ZygoteServer.runSelectLoop()` 中监听命令。socket 到来后，server 创建 `ZygoteConnection` 并调用 `processCommand()` \[20\]。

连接建立时， `ZygoteConnection` 会读取对端凭据并限制调用方：

```
if (peer.getUid() != Process.SYSTEM_UID) {
throw new ZygoteSecurityException(
"Only system UID is allowed to connect to Zygote.");
}
```

因此普通 App 不能绕过 `system_server` ，直接要求 Zygote 按任意 uid 创建进程。命令通过参数与权限检查后，常规路径进入：

```kotlin
pid = Zygote.forkAndSpecialize(...);

if (pid == 0) {
// child
return handleChildProc(...);
} else {
// parent zygote
    handleParentProc(pid, ...);
return null;
}
```

Java 层的 `forkAndSpecialize()` 继续进入 native `nativeForkAndSpecialize()` ； `com_android_internal_os_Zygote.cpp` 的 `ForkCommon()` 才是实际调用 `fork()` 的位置 \[21\]。

AOSP `main` 的 `processCommand()` 还会让满足条件的简单请求进入 `Zygote.forkSimpleApps()` 批处理快路。它改变的是命令处理与批量 fork 的组织方式，不改变“由 Zygote 家族创建进程、native 层执行 fork、父子进程从返回值处分流”这三个结论。本课先沿 `forkAndSpecialize()` 主线建立模型，再在 USAP 小节补充分支。

fork 返回后，同一段代码出现两条命运：

子进程随后经：

```
handleChildProc()
  → ZygoteInit.zygoteInit()
  → RuntimeInit.applicationInit()
  → findStaticMain("android.app.ActivityThread")
  → ActivityThread.main()
```

对应源码入口见 `ZygoteInit.java` 、 `RuntimeInit.java` 与 `ActivityThread.java` \[22\]。到 `ActivityThread.main()` 时，新 App 进程已经出生，但应用自己的 `Application.onCreate()` 和 Activity 生命周期仍要等待后续绑定与事务分派。

> 子进程入口直达：ZygoteInit.java · RuntimeInit.java · ActivityThread.java

### 0.4 一张图看懂桌面点击到 App 子进程

```
用户点击桌面图标
  → Launcher3.startActivitySafely(Intent)
  → Binder
  → system_server：ATMS / ActivityStarter
  → 目标进程不存在
  → AMS / ProcessList.startProcessLocked
  → Process.start
  → ZygoteProcess.startViaZygote
  → Zygote socket
  → ZygoteServer.runSelectLoop
  → ZygoteConnection.processCommand
  → Zygote.forkAndSpecialize
  → native ForkCommon → fork()
       ├─ 父 Zygote：回写 child pid，继续接单
       └─ 子进程：specialize → ActivityThread.main
```

### 0.5 USAP 是这条主线的重要分支

上图描述的是主 Zygote 收到命令后直接 `forkAndSpecialize()` 的常规路径。启用 USAP（Unspecialized App Process）池时，系统可能预先从 Zygote fork 出若干“尚未绑定具体应用身份”的进程；创建请求到来后， `ZygoteProcess` 优先尝试把参数交给一个 USAP，让它完成 specialize，而不是此刻才从主 Zygote 重新 fork \[19\]。

因此不能把所有设备上的实际路径都写成“点击后一定由主 Zygote 当场 fork”：

```
常规路径：请求 → 主 Zygote → fork → specialize
USAP 路径：主 Zygote 预先 fork → 请求 → 某个 USAP specialize
```

这正是 Frida 不能只处理 `zygote` / `zygote64` 的原因。只要目标 App 可能从 USAP 池出生，Frida 就必须把 `usap32` / `usap64` 也纳入门控。

### 0.6 这条正常链与 Frida -f 在哪里接上

手点桌面图标与执行 `frida -U -f TARGET_PACKAGE` 的请求发起者不同：前者由 Launcher 发起，后者由 Frida 的 `RoboLauncher` 请求 Android 启动目标包。但进入 framework 的进程创建阶段后，两条路径都会汇入 Zygote / USAP 创建 App 进程的机制。

frida-server 启动时默认经 preload 链把小型 `zymbiote` 载荷装入可能产生目标进程的 Zygote、USAP 和 Chrome Zygote（spawn 里的 `ensure_loaded()` 只是幂等兜底，见 §3–§4）。之后发生 fork 时：

```
父进程已有 zymbiote
  → fork 后子进程继承 payload 与函数指针改写
  → child specialize / setcontext
  → child setArgV0
  → zymbiote 上报 pid、ppid、process-name 并等待
  → Frida 对 child pid 注入完整 frida-agent
  → 加载脚本
  → resume 放行
```

所以 Zygote 基线不是额外背景知识，而是理解 Frida spawn 的必要前提：

> Frida 没有替 Android 创造另一套 App 启动机制。它先进入 Android 已有的进程父体，再利用 fork 的地址空间继承，把一个短暂门控点带进新生子进程。

后文第 4–10 节按 spawn 的五个步骤，继续拆解 `RoboLauncher` 、 `inject_zymbiote()` 、 `setcontext` / `setArgV0` replacement、agent 注入与 ACK 放行的源码。

## 1\. 问题边界：-f 的主线是 spawn

执行：

```
frida -U -f TARGET_PACKAGE -l probe.js
```

做的主事是 **spawn**：让系统启动一个全新的 App 进程，并赶在它的业务代码运行之前接管。它不是“把一段 JavaScript 发给目标进程”这么简单。Android 上至少发生两次性质不同的注入：

-   **zygote 门控注入**
    
    把一个很小的 `zymbiote` 载荷写入 zygote、USAP 或 Chrome zygote，并 hook 两个函数指针；默认在 frida-server 启动时（preload）就完成，先于任何客户端命令，spawn 到来时只是幂等兜底；
    
-   **目标进程 agent 注入（spawn 与 attach 共用）**
    
    得到子进程 PID 后，再通过 ptrace/bootstrap/loader 把完整 `frida-agent` 装入这个子进程。
    

最重要的结论是：

> Frida 为了实现 `-f` ，会处理 zygote；但它不会把完整 `frida-agent` 常驻到 zygote。zygote 中驻留的是负责出生门控的 `zymbiote` 小载荷，完整 agent 最终进入目标 App 子进程。

从 frida-server 启动到 `-f` 跑完的完整时间线如下，也是本课第 3–10 节的展开顺序：

```
[设备] frida-server start（默认 enable_preload）
  → 建立 ControlService / HostSession
  → preload：zymbiote 注入 zygote/USAP + hook 两个函数指针   ← 门控就位（§3–§5）

[PC] frida-tools / Python API
  ├─ Device.spawn(package)            ← 启动与拦截（第 6 节）
  │    └─ RoboLauncher：启动 App（ensure_loaded 幂等兜底）
  │         └─ 子进程上报 pid/ppid/process-name 后等待
  │
  ├─ Device.attach(pid)               ← 装载段（第 7–9 节）
  │    └─ HostSession → Linjector → LinuxHelperBackend
  │         └─ ptrace → bootstrapper → loader → frida-agent
  │
  ├─ Session.create_script() / Script.load()
  │
  └─ Device.resume(pid)               ← 放行段（第 10 节）
       └─ 恢复子进程中的门控点，App 继续启动
```

对照：不带 `-f` 、直接对已运行进程执行的独立 attach，只有上面中间“装载段”那一条链——没有门控段，也抓不到 App 最早期。本课主线沿 spawn 把这条链讲透，独立 attach 在第 11 节收尾时单独说。

本课只讨论“控制权如何进入 zygote 和目标进程”。JS 创建、加载与首行代码的执行边界在 F02；Java VM 与 App ClassLoader 的可用时机在 F03。

## 2\. 进程与组件

`frida-server` 在线只说明控制服务已经启动； `zymbiote` 已进入 zygote 只说明出生门控已建立； `frida-agent` 映射成功也只说明 native 载荷进入目标。三者不能互相替代。

## 3\. frida-server 如何接住客户端请求

> 源码直达：server/server.vala @17.9.1 · src/control-service.vala @17.9.1

`server/server.vala:199-220` 的 `run_application()` 创建 `Application` 。 `Application.start()` 在 `server/server.vala:294-296` 中构造并启动 `ControlService` ：

```
service = new ControlService (endpoint_params, options);
yield service.start (io_cancellable);
```

`ControlService` 内部持有设备侧 `HostSession` 。客户端连接后， `control-service.vala:915-934` 将 `spawn()` 与 `attach()` 转交给 `host_session` （17.9.1 实测行号，与快照一致）：

```typescript
public async uint spawn (...) {
return yield parent.host_session.spawn (program, options, cancellable);
}

public async AgentSessionId attach (...) {
return yield parent.attach (pid, options, this, cancellable);
}
```

启动 frida-server 的时候，它注入了什么、hook 了什么？

默认配置下的答案是：把 `zymbiote` 门控注入 zygote/USAP，并 hook 两个函数指针。 `ControlServiceOptions.enable_preload` 默认为 true（ `server.vala:17` ；命令行 `-P / --disable-preload` 可关），因此 `ControlService.start()` 建立监听后立即走 `LinuxHostSession.preload()` （ `linux-host-session.vala:91-95` ）→ `RoboLauncher.preload()` （ `linux-host-session.vala:1382-1383` ）→ `ensure_loaded()` ，把门控装进 zygote / zygote64 / usap32 / usap64 / Chrome zygote，并改写 `setcontext` / `setArgV0` 两个函数指针。这一切先于任何客户端命令；之后 `spawn()` 与 `enable_spawn_gating()` 开头的 `ensure_loaded()` 只是幂等兜底；server 退出时 `close()` 还原指针并释放 payload（ `linux-host-session.vala:1386-1412` ）。

注意被 preload 注入的只有门控载荷：完整 `frida-agent` 不会在启动时装进任何进程，它仍然要等客户端 spawn/attach、目标子进程 PID 确定之后才注入：

```
server start（默认 enable_preload）
  → 建立 ControlService / HostSession
  → preload：zymbiote 注入 zygote/USAP + hook 两个函数指针（§4、§5）

客户端命令到达（spawn / attach）
  → spawn：请求启动 App、等子进程上报、注入 agent（§6–§9）
  → attach：ptrace 目标、注入 agent（§7、§11）
```

本课接下来沿 spawn 主线展开：第 4–5 节是门控（默认 server 启动时就位），第 6 节是启动与出生拦截，第 7–9 节是装载段，第 10 节是放行段。

## 4\. zymbiote 门控：注入 zygote 并 hook 两个函数（spawn 的前置）

> 源码直达：src/linux/linux-host-session.vala @17.9.1 · RoboLauncher

门控不属于 spawn 流程：默认情况下，它在 frida-server 启动时经 §3 的 preload 链就已经完成，先于任何客户端命令。

注入与卸载的时机只有这几处：

```
注入（幂等，已注入的父进程直接跳过）：
  server 启动    → preload() → ensure_loaded()          默认路径
  spawn 请求     → RoboLauncher.spawn() 开头兜底
  开启 gating   → enable_spawn_gating() 开头兜底

卸载：
  server 退出    → close() 暂停父进程、还原指针、释放 payload
```

对应源码（17.9.1）：preload 链 `linux-host-session.vala:91-95, 1382-1383` ；spawn 兜底 `1462` ；gating 兜底 `1416-1417` ；close 卸载 `1386-1412` 。

hook 的对象是两个函数指针槽：specialize 阶段先后执行的 `selinux_android_setcontext()` 与 `android_os_Process_setArgV0()` 。改写的是指针指向（指向 zymbiote 的 replacement 函数），不改函数机器码；槽位定位与写入流程在 §5.1。

### 4.1 注入对象：五个父进程

> 源码直达：ensure_loaded() @17.9.1

`RoboLauncher.ensure_loaded()` 在 `linux-host-session.vala:1517-1603` 建立随机名称的抽象 Unix socket（socket 名见 `:1531` ，形如 `/frida-zymbiote-<uuid>` ），然后枚举：

```
zygote
zygote64
usap32
usap64
com.android.chrome_zygote
```

对应的选择逻辑是：

```php
foreach (HostProcessInfo info in System.enumerate_processes (...)) {
var name = info.name;
if (name == "zygote" || name == "zygote64" ||
            name == "usap32" || name == "usap64" ||
            name == CHROME_ZYGOTE_PACKAGE_NAME) {
if (!zymbiote_patches.has_key (info.pid))
            do_inject_zygote_agent.begin (info.pid, name, ...);
    }
}
```

每个尚未处理的 PID 都进入 `inject_zymbiote()` 。

zygote 与 USAP 都是 App 的潜在父进程。只处理 zygote、不处理 USAP，会在启用 USAP 池的系统上漏掉从预热池出生的应用。Chrome/WebView 还可能再创建自己的子 zygote，因此需要单独延续门控状态。

## 5\. 注入细节：payload 怎么装进父进程、装在哪里

> 源码直达：inject_zymbiote() / do_prepare_zymbiote_injection() @17.9.1 · helpers/zymbiote.c @17.9.1

`inject_zymbiote()` 不走 `frida_agent_main` ，也不建立 GumJS。5.1 是注入流程，5.2 是载荷位置——位置直接决定 zygote 的 maps 里会多出什么特征。

### 5.1 注入流程：选位置、写入、改指针

上游 17.9.1 的 `inject_zymbiote()` （ `linux-host-session.vala:1605-1648` ）先经 `do_prepare_zymbiote_injection()` 完成全部定位，再一次性写入：

-   扫描父进程 maps，挑出 `libstagefright.so` 的可执行映射，取 **最后一页** 作为载荷位置（取舍见 5.2）；
    
-   同时定位 `libc.so` 、 `libselinux.so` 与 `libandroid_runtime.so` ，解析导出/导入表找到两个接入点，并在 boot heap / 匿名 rw 映射里搜索 `setArgV0` 的指针槽；若发现该父进程已被注入过（ `already_patched` ），改按 `file_offset` 从磁盘上的 so 文件读回原始字节，补全还原账本；
    
-   `STOP`
    
    \+ `wait_until_stopped` 暂停父进程；
    
-   `patches.apply()`
    
    把 payload 写入尾页，再把两个指针槽改到 payload 的 replacement；
    
-   `finally CONT`
    
    恢复父进程。
    

核心写入顺序（上游 17.9.1 摘录）：

```cpp
Posix.kill ((Posix.pid_t) pid, Posix.Signal.STOP);
yield wait_until_stopped (pid, cancellable);

patches.apply (payload, prep.process_memory, prep.payload_base);

patches.apply (prep.replaced_setargv0_ptr, prep.process_memory,
    prep.setargv0_slot);

if (prep.setcontext_slot != 0)
    patches.apply (prep.replaced_setcontext_ptr, prep.process_memory,
        prep.setcontext_slot);

zymbiote_patches[pid] = patches;

Posix.kill ((Posix.pid_t) pid, Posix.Signal.CONT);
```

两个接入点的定位来自 `do_prepare_zymbiote_injection()` （ `linux-host-session.vala:1692-1899` ）：

-   从 `libandroid_runtime.so` 导出表定位 `android_os_Process_setArgV0()` （`:1814` ）；
    
-   从 `libselinux.so` 导出表与其在 `libandroid_runtime.so` 导入表中的 slot 定位 `selinux_android_setcontext()` （`:1796, :1822` ）；
    
-   在 zygote 的 boot heap 与匿名 rw 映射中搜索保存 `setArgV0` 原函数地址的指针槽（`:1857-1875` ）。
    

最终改写的是“函数指针指向哪里”，不是直接改写两个函数的机器码。

我们的差异集中在载荷位置：不借尾页，改由 helper 在父进程远程 `mmap` 一块全新的匿名 RX 页写入（helper 侧为本工程扩展，上游无此路径），中途失败即 `unmap` 还原，注入前还会校验并回收可能遗留的旧 payload（§12）；暂停、写入、改槽、恢复的顺序与上游一致。

### 5.2 载荷位置：上游借媒体库尾页，当前工程换独立匿名映射

> **我们的核心取舍，先钉在前面：不像上游那样把 payload 写进任何 so，而是独立 `mmap` 一块匿名页；门控销毁自己靠的就是对这页的 `munmap` ——自毁与释放是同一个动作、同一个时刻。整套“匿名映射进、 `munmap` 出、全程不碰已有 so”的装载方式，等同于把门控改成了 ZygiskNext 一类的加载路子：载荷生命周期完全自管理，用完即整体消失。**

**当前工程：一块全新的匿名 RX 页。** 我们让 helper 在父进程远程 `mmap` 一块全新匿名页，权限直接给 RX；中途任何一步失败都会把映射 `unmap` 还原。

生命周期只有三步（逻辑示意，非关键实现）：

```
注入：mmap 独立匿名 RX 页
       → 写入 payload（只写自己的页，不碰任何 so）
       → 改两个函数指针槽
存活：fork 继承；子进程在 setcontext / setargv0 replacement 里照常运行
自毁：ACK 到达 → must-tail munmap(payload_base, payload_size)
       ← 门控销毁自己与 munmap 是同一时刻，不需要任何“还原 so 字节”的步骤
```

写入的 payload 本体是预编译 zymbiote 小 ELF 的 **可执行段**： `make_zymbiote_payload()` （上游 17.9.1 `linux-host-session.vala:1911-2000` ）只截取 text 段，并在段内数据区依次写入 server socket 名、payload 自身的 base/size/原始权限、两个原函数地址，以及 12 个 libc 函数地址。这张 API 表不是我们的发明——上游 17.9.1 写入的就是 `mprotect/strdup/free/socket/connect/__errno/getpid/getppid/sendmsg/recv/close/raise` ，保存 `package_name` 靠的正是其中的 `mprotect` + `strdup` （也是 §5.2.1 切口的成因）；我们的差异是 **去掉 `raise` 、补上 `munmap`**，把收尾从 `raise(SIGSTOP)` 等 server 还原，改为 ACK 后 payload 自行 `munmap` （§10、§12）。整块载荷只有一两页，也不进入任何 so 装载账本。

**上游：不新建映射，借媒体库最后一页。** 上游 `do_prepare_zymbiote_injection()` （17.9.1 `linux-host-session.vala:1712-1721` ）扫父进程 maps，找 **已存在的可执行文件映射**，路径以 `/libstagefright.so` 结尾（17.9.1 只认这一个候选，不挑 `libmedia.so` ）：

```
可执行 && path 以 /libstagefright.so 结尾
  → payload_base = m.end - page_size       # 该映射的最后一页
  → payload_file_offset = m.file_offset    # 记录页在 so 文件内的偏移
```

媒体库最后一个可执行 segment 的内容通常不满一整页，页尾剩余字节是无人使用的填充；payload 就直接 pwrite 进这一页，权限沿用该页原有的 RX，maps 里不发生任何变化。也因为这一页是文件映射，上游把“恢复原状”实现为按 `file_offset` 从磁盘上的 so 文件读回原始字节。

这段 payload 没有经过任何 linker 装载，“重定位”由 server 手工完成：把上面那 12 个 libc 函数地址填进 payload 自带的 API 结构体（参考文献 \[23\] 对 Frida 17.6.0 的逐行分析与此一致）。17.9.1 的两个指针槽 **不自还原**——replacement 触发后照常透传原函数，改写一直保留，直到放行时由 server 统一还原（“replacement 第一行就还原槽位”的一次性 hook 是 17.6.0 时期的旧实现 \[23\]）。上游 API 表里的 `raise` 用在子进程上报并收到 ACK 之后：payload `raise(SIGSTOP)` 把自己挂起，给外部留出稳定的注入窗口，gadget 由 server 在这个窗口里以 ptrace 注入；我们的 API 表去掉 `raise` 、补上 `munmap` ，ACK 后 payload tail-call `munmap` 自卸载，不再需要 SIGSTOP/SIGCONT 往返，指针槽由 server 在 resume 时统一还原（§10、§12）。

两种位置各暴露一个面：

一句话：上游藏住“maps 条目数”，留下“文件内容差”；当前工程消掉“文件内容差”，换来“匿名可执行页”。检测与反检测都会用到这两个面，具体观察手段在 F06 起的课程展开。

### 5.2.1 第三个观察面：门控子进程的 VMA 切口（真机实测）

2026-08-30 真机记录（TB321FU）：zygote64（pid 1392）中 libstagefright.so 的可执行段是一条 r-x；在经过门控的 App 子进程（父进程同为 1392）里，同一可执行段被切成 **两条相邻 r-x**，切口正好落在最后一页——即上游 payload 位置 `m.end - page_size` （file offset 0x1f9000）：

```bash
zygote64（payload 写入方）：
7ef5b05000-7ef5c63000 r-xp 0009c000  …  /system/lib64/libstagefright.so

App 子进程（payload 执行方，采样时 App 已正常运行、权限早已恢复）：
7ef5b05000-7ef5c62000 r-xp 0009c000  …  /system/lib64/libstagefright.so
7ef5c62000-7ef5c63000 r-xp 001f9000  …  /system/lib64/libstagefright.so   ← 尾页被切出
```

成因对应 §5.1–§5.2 的两条写入路径，各占一半：

-   **父进程不变**
    
    server 经 `/proc/<pid>/mem` 写尾页是页表级 COW，不触碰 VMA 树；两个 replacement 又只在 fork 出的子进程里执行（specialize 是子进程路径），zygote 自身从不执行那次 `mprotect` 。所以父进程永远一条 r-x，与实测一致。
    
-   **子进程切口**
    
    fork 继承 payload 与指针改写后，setcontext replacement 在保存 `package_name` 时执行 `mprotect (payload_base, payload_size, RWX)` （上游 17.9.1 `zymbiote.c:70` 的权限窗口）。mprotect 是 VMA 级操作，内核把 r-x 段切成 `r-x | rwx | r-x` 三段；窗口结束恢复 RX 后两侧权限一致，但 **VMA 边界不愈合**——实测采样时权限已恢复而切口仍在，说明这是持久痕迹而非瞬态。
    

检测侧含义：同一.so 出现 **页粒度的相邻同权限条目**，是 mprotect 权限循环的指纹，与“匿名可执行页”“文件内容差”并列为第三个观察面。

边界与对账：该切口只出现在“payload 位于文件映射内部”的布局。2026-08-30 补记：TB321FU 为课程演示机，运行的是 **上游原版 frida-server** （尾页布局），实测切口与其行为一致；课程主线展示上游行为，本工程的修改版只以思路对照（§12），不附源码——独立匿名映射布局整块翻权限、不产生切口，且 ACK 后 `munmap` 整体消失。

## 6\. spawn 执行：请求启动 App，子进程出生上报

### 6.1 RoboLauncher.spawn()：执行顺序与启动请求

> 源码直达：RoboLauncher.spawn() @17.9.1

spawn 请求在 §3 的 `HostSession.spawn()` 落地。目标参数是 Android 包名，包名不是普通可执行文件路径， `linux-host-session.vala:338` 因此进入：

```
return yield robo_launcher.spawn (program, options, cancellable);
```

`RoboLauncher.spawn()` （ `linux-host-session.vala:1442-1502` ）的执行顺序：

```
ensure_loaded()
  → 幂等兜底；门控默认已在 server 启动时就位（§4、§5）
按 process-name 登记一次 spawn 请求
  → 记下 Promise<pid>，等 zymbiote hello 到来时兑现（6.3）
stop_package()
  → 清掉目标包可能存留的进程
start_package()
  → 发起启动，请求汇入 §0.2 的 ProcessList → Zygote 链
等待 zymbiote hello 上报新生子进程 PID（20 秒超时）
  → spawn() 返回 pid
```

`stop_package()` / `start_package()` 位于 `linux-host-session.vala:1476-1477` ；请求进入 framework 之后，走的就是 §0.2–§0.3 已经拆过的正常链，直接引用：

```
start_package
  → system_server：ATMS / AMS / ProcessList.startProcessLocked
  → Zygote socket（或 USAP 池）
  → fork child → specialize
```

fork 出的子进程继承门控，在 specialize 阶段撞上 zymbiote（6.2）。

### 6.2 子进程如何被识别并卡在正确时机

> 源码直达：helpers/zymbiote.c @17.9.1 · 两个 replacement

zygote fork 后，匿名 payload 和被改写的指针槽由子进程继承。 `helpers/zymbiote.c` 中有两个 replacement：

```
frida_zymbiote_replacement_setcontext()
frida_zymbiote_replacement_setargv0()
```

`setcontext` replacement 先调用原始 `selinux_android_setcontext()` ，再保存 specialize 阶段得到的进程名。它不阻止 SELinux 域切换。两个 replacement 分工不同： **setcontext 负责取名字，setargv0 负责卡时机**。

为什么取名要靠 setcontext？hello 报文要带 process-name，server 靠它匹配 spawn 请求（6.3）。native 侧进程名最早以 C 字符串形式出现在 `selinux_android_setcontext(uid, is_system_server, seinfo, name)` 的 `name` 参数里，specialize 前段就能 `strdup` 一份（上游 17.9.1 `zymbiote.c:64-71` ）；而 setArgV0 拿到的是 `jstring` ，要变成本地字符串必须走 JNI。payload 首选用 setcontext 存下的副本， `GetStringUTFChars` 只是兜底（ `zymbiote.c:88-90` ）。相应地，setcontext 的调用槽从 `libandroid_runtime.so` 的导入表（GOT）就能定位，比堆扫描稳；代码里找得到才打补丁（ `setcontext_slot == 0` 则跳过），与 setArgV0 的堆扫描槽互为保险。

为什么卡点选在 setArgV0？setcontext 处在 specialize 前段，SELinux 域切换之后还有 uid/gid 设置、capability 清理、fd 关闭等一串步骤；setArgV0 在 specialize 尾声，进程身份已全部就位、App 代码一行未跑。在 setcontext 阻塞会把注入窗口开在一个“身份做了一半”的进程上；在 setArgV0 上报才是既早又完整的窗口。所以 setcontext 只抄名字不打断，setargv0 才连接 server、上报并等待 ACK。

`setargv0` replacement 先调用原始 `android_os_Process_setArgV0()` ，随后：

```
连接 server 的 abstract Unix socket
  → 发送 pid + ppid + process-name
  → 阻塞等待 1 字节 ACK
```

对应代码骨架是：

```
res = zymbiote.original_setcontext (uid, is_system_server, seinfo, name);
if (res == -1)
return -1;
if (zymbiote.package_name == NULL)
{
  zymbiote.mprotect (zymbiote.payload_base, zymbiote.payload_size,
      PROT_READ | PROT_WRITE | PROT_EXEC);
  zymbiote.package_name = zymbiote.strdup (name);
}

zymbiote.original_set_argv0 (env, clazz, name);
frida_wait_for_permission_to_resume (name_utf8, &revert_now);
```

payload 默认是 RX；保存和清空 `package_name` 指针时会短暂切为 RWX，完成后恢复 `payload_original_protection` （上游 17.9.1 `zymbiote.c:70, :98` ）。这段权限窗口也是后续验证必须覆盖的瞬态状态。尾页布局下，权限恢复后子进程 maps 里的 VMA 切口并不随之愈合——瞬态权限操作留下了持久痕迹（真机实测与成因见 §5.2.1）。至于 ACK 到达之后门控做什么——上游停稳自己给 server 开还原窗口、我们 `munmap` 自毁——“谁动手写槽位”的分工在 §10 开头单独钉死。

`frida_wait_for_permission_to_resume()` 发送固定头和进程名：

```
header.pid = zymbiote.getpid ();
header.ppid = zymbiote.getppid ();
header.package_name_len = ...;
frida_sendmsg_all (fd, iov, 2, MSG_NOSIGNAL);
frida_recv (fd, &rx, 1, 0);
```

这里必须注意： `recv()` 不是“只有目标 App 才走”的代码。只要普通子进程从已经安装 zymbiote 的 Zygote/USAP 出生、继承了两个函数指针改写，并正常执行到 `setArgV0` ，它就会连接 server、发送 hello，然后在这里等待 server 作出决定。目标与非目标的分流发生在 server 收到 hello **之后**，见下一节。

“所有 App 都会经过”仍有边界：已经在门控安装前出生的进程不会倒回这里；未被 `ensure_loaded()` 覆盖的其他 AppZygote 也不在当前枚举范围内；如果 abstract socket 连接失败，payload 会直接返回而不会停在 `recv()` 。

### 6.3 server 收到 hello 后：目标等待，非目标立即放行

> 源码直达：handle_zymbiote_connection() @17.9.1

server 在 `linux-host-session.vala:2052-2088` 的 `handle_zymbiote_connection()` 里收到 hello 后，不会立刻给每个子进程注入 agent，而是先判断它属于哪一条分支：

```javascript
Promise<uint> spawn_request;
if (spawn_requests.unset (hello.package_name, out spawn_request)) {
    spawn_request.resolve (hello.pid);
    needs_resume = true;
} else if (spawn_gating_enabled) {
var spawn_info = HostSpawnInfo (hello.pid, hello.package_name);
    pending_spawn[hello.pid] = spawn_info;
    spawn_added (spawn_info);
    needs_resume = true;
}

if (needs_resume)
    zymbiote_connections[hello.pid] = connection;
else
    connection.resume.begin (io_cancellable);
```

四条分支如下：

所以非目标 App 也会短暂走到 `recv()` ，但不会一直卡住。当前工程对它立即执行下面这条清理链：

```
server 发现“不匹配且未开启全局门控”
  → 立即还原该子进程继承的 setArgV0 和可选 setcontext 指针槽
  → 立即发送 ACK
  → recv 返回
  → zymbiote payload must-tail 调用 munmap() 自卸载
  → App 回到 setArgV0 的 Java 调用点继续启动
```

这一分支没有 `Device.attach(child_pid)` ，不会装入完整 agent，也不会创建脚本。它付出的只是一次 hello/ACK 往返和门控清理时间；父 Zygote 中的门控仍保留，用于观察下一次 fork。

最新版上游的分流判断与 17.9.1 相同：非目标 App 也立即进入 `connection.resume()` （17.17.0 亦然 \[24\]）。差别只在清理协议：上游先发 ACK，让 payload tail-call `raise(SIGSTOP)` ，server 等子进程停稳后还原继承的改写并发送 `SIGCONT` （17.9.1 `linux-host-session.vala:2175-2194` ）；当前工程则先还原相应指针槽、再发 ACK，由 payload 自行 `munmap()` 。两者都不会向非目标 App 注入完整 agent。

目标 App 则不同：上游 17.9.1 在 spawn 时就经 `helper.get_process_name()` 预解析出真实 process-name 并登记请求（`:1466-1472` ），hello 到达后按 `package_name` 精确 `unset` ，没有冒号回退；当前实现在此之上先尝试精确匹配进程名，若进程名带 `:`，再用冒号前的包名匹配原始 spawn 请求。匹配成功后， `Device.spawn()` 返回 PID，但连接仍保存在 `zymbiote_connections` ，ACK 要等客户端完成第 7–9 节并调用 `resume()` 才发送。

到这里，App 子进程仍停在 zymbiote 的等待点上，业务代码一行未跑；返回的 PID 就是下一步注入完整 agent 的目标。

## 7\. 装载段：向刚出生的子进程注入完整 frida-agent

spawn 返回 PID 的那一刻，子进程正阻塞在 `setArgV0` 之后的 zymbiote 等待点， `Application` 还没加载，Java 入口没跑。客户端此刻要做的，是在放行之前把完整 `frida-agent` 装进这个子进程。这一步用的正是一条标准 attach 装载链；独立 attach 与它的差别在第 11 节对照。

子进程已经被 zymbiote 卡住了，装 agent 为什么还要 ptrace？因为 zymbiote 只是一两页的信标加闸门：它总共只带 `mprotect` 、 `munmap` 、 `socket` 、 `connect` 等 12 个 libc 函数（§5.2），没有 `mmap` 、没有 `pthread_create` ，也没有任何 ELF 装载能力，装不下、也运不了几百 KB 的 agent。子进程阻塞在 `recv()` 上只说明业务代码还没跑，不说明它受控——server 对它依旧没有写内存和执行代码的权限。把 agent 装进去并启动，仍然要 seize 线程、保存寄存器、远程 `mmap` 、改 PC/SP 执行 bootstrapper 与 loader、恢复寄存器后 detach，这正是 7.3 的 `SeizeSession` 。ACK 之后 zymbiote 还会自卸载（§10），它从设计上就不承担装载。上游也是同一分工：zymbiote 只取“时机”，gadget 由 server 在外部以 ptrace 注入（参考文献 \[23\]）。

### 7.1 spawn 返回 PID 后，立刻对这个 PID 做一次 attach

> 源码直达：frida_tools/application.py @14.8.0 · frida_tools/repl.py @14.8.0 · src/frida.vala @17.9.1 · src/host-session-service.vala @17.9.1

`frida_tools/application.py:616-626` （14.8.0，与 frida 17.9.1 同期）直接给出了命令行工具在 spawn 返回后的下一步： `device.spawn()` 返回的 PID 被赋给 `attach_target` ，随后立即调用 `_attach(attach_target)` ； `repl.py:294-306` 再创建并加载脚本，是否立即 resume 由 `:247-252` 的选项决定。

也就是说，spawn 的后半段就是对新生子进程的一次标准 attach：

```
Device.attach(child_pid)
  → 本节 7.2–7.4 的 ptrace/bootstrap/loader 路径
  → 完整 frida-agent 进入 App 子进程
  → 创建并加载脚本
  → Device.resume(child_pid)（第 10 节）
```

所以 zygote 门控与 agent 注入不是二选一，而是前后相接：

```
zymbiote 负责“发现并卡住新生 App”
frida-agent 负责“在 App 内运行 Gum 与脚本”
```

这条装载链的 API 侧入口如下。 `src/frida.vala:1138-1163` 的 `Device.attach()` 先调用远端 `host_session.attach()` ，再把返回的 `AgentSessionId` 链接成本地 `Session` ：

```
id = yield host_session.attach (pid, raw_options, cancellable);
session = new Session (this, pid, id, opts);
session.active_session =
yield provider.link_agent_session (host_session, id, session, cancellable);
```

设备侧 `host-session-service.vala:571-611` 继续执行（ `attach()` 在 `:571` ， `establish()` 在 `:605` ）：

```
establish(pid)
  → perform_attach_to(pid)
  → 等待 agent control stream
  → 建立 DBusConnection
  → 获取 AgentSessionProvider proxy
  → provider.open(session_id)
```

这里的 `attach()` 不是单一系统调用，而是一条从控制面到目标进程运行时的状态机。

### 7.2 Linux 后端选择 agent

> 源码直达：perform_attach_to() @17.9.1 · src/linux/linjector.vala @17.9.1

`src/linux/linux-host-session.vala:387-405` 明确指定 agent 入口：

```python
stringentrypoint ="frida_agent_main";
stringparameters = make_agent_parameters (pid, "", options);
AgentFeaturesfeatures = CONTROL_CHANNEL;

id = yield linjector.inject_library_resource (
    pid, agent, entrypoint, parameters, features, cancellable);

IOStreamstream =
yield linjector.request_control_channel (id, cancellable);
```

`linjector.vala:84-96` 根据目标 ABI 选择 32/64 位 agent。支持 memfd 时直接取得 agent resource 的 fd（`:94` ），否则使用临时文件路径；随后统一调用 `helper.inject_library()` 。

```
目标 pid
  → 判断 ABI
  → 取得匹配的 frida-agent
  → fd/path 交给 Linux helper
  → 等待 control channel
```

### 7.3 ptrace 只是入口，真正任务是建立远程执行环境

> 源码直达：frida-helper-backend.vala @17.9.1 · InjectTask

上游 17.9.1 的 `InjectTask.run()` （ `frida-helper-backend.vala:308-330` ）经 `InjectSession.open()` （`:868` ）创建 `InjectSession` 。其基类 `SeizeSession` （`:1805-2110` ； `PTRACE_SEIZE` 在 `:1888` ， `GETREGSET` 在 `:2084-2105` ）完成：

```
PTRACE_SEIZE（旧内核回退 PTRACE_ATTACH）
  → PTRACE_INTERRUPT / 等待 stop
  → GETREGSET 保存寄存器
  → 获得目标线程的受控执行点
```

进入 ptrace 停止态后，Frida 没有直接把 PC 改到 `frida_agent_main` 。目标地址空间此时还没有 loader、agent、远程栈和控制通道。

`InjectSession.bootstrap()` （ `frida-helper-backend.vala:1054` 起）先建立这些条件：

-   从目标 maps 定位 libc 和 Android linker；
    
-   计算目标进程中的 `mmap` 、 `munmap` 等函数地址；
    
-   远程调用 `mmap` 分配 bootstrapper、loader 数据和 64 KiB 工作栈；
    
-   若不能直接使用目标 libc 的 `mmap` ，临时借用目标现有代码页执行 bootstrapper，分配完成后还原原字节；
    
-   在目标内执行 bootstrapper，解析 libc/linker API，并建立 socketpair 或抽象 Unix socket 回退通道（这条通道上 fd 的跨进程传递方式见 §7.4 的 SCM_RIGHTS 小节）；
    
-   把 loader 代码、入口名、agent 参数和函数表写入目标内存。
    

这一步的输出不是 agent，而是一个可以在目标内部继续装载 agent 的最小运行环境。

### 7.4 loader 从被劫持线程切到自己的工作线程

> 源码直达：launch_loader() / RemoteAgent @17.9.1 · helpers/loader.c @17.9.1

`frida-helper-backend.vala:993-1050` 将目标寄存器中的 PC 指向 loader 基址、SP 指向远程栈，再通过 `RemoteCall` 执行 loader 入口。 `helpers/loader.c:61-63` 的 `frida_load()` 立即创建工作线程：

```
void
frida_load (FridaLoaderContext * ctx){
  ctx->libc->pthread_create (&ctx->worker, NULL, frida_main, ctx);
}
```

这样，受 ptrace 控制的原线程只负责启动 loader—— `frida_load()` 的全部工作就是一个 `pthread_create` ，几条指令就返回。loader 一返回， `InjectSession` 立即恢复保存的寄存器并 **detach：ptrace 的使命到此结束**。

主线程回到被打断的那一刻——spawn 场景下就是 replacement 里阻塞的 `recv()` （被打断的系统调用由内核自动重启）；注意此刻两个指针槽 **仍处于改写状态**，要等到 resume 时才由 server 还原（§10）。此后 agent 的装载与通信全部由工作线程和 helper 之间的 socketpair 承担，不再有 ptrace。

loader 工作线程随后完成（上游 17.9.1 `loader.c:96-137` ）：

```
向 helper 发送 HELLO
  → 接收 agent fd
  → 装载 agent
  → 接收 agent control fd
  → 发送 READY
  → 等待 ACK
  → 调用 frida_agent_main
```

helper 侧对应状态位于 `frida-helper-backend.vala:1452-1560` （ `RemoteAgent` ）。 `RemoteAgent.start()` 通过 Unix socket 发送 agent fd 和 control fd；收到 loader 的 `READY` 后，helper 才认为注入已同步完成。

#### fd 怎么跨进程：AF_UNIX 套接字 + SCM_RIGHTS

“通过 Unix socket 发送 fd”需要拆开讲，否则容易误解成“把 fd 号当数据发过去”。

通道与机制分两层：

**通道**：一条 `AF_UNIX + SOCK_STREAM` 套接字。主路在 bootstrap 阶段建立——helper 用 RemoteCall 在目标进程内远程执行 `socketpair()` ，fd 号写进 loader 的 context（ `frida-helper-backend.vala:929` ）；兜底是 loader 主动连接 context 里预埋的抽象地址（ `loader.c:97` 的 `frida_connect (ctx->fallback_address, ...)` ，与 zymbiote hello 连 server 是同款手法，方向相反：这里是目标主动连 helper）。另外 control 通道的 socketpair 在 helper 侧创建（ `frida-helper-backend.vala:1530` ），一端自留、另一端发给 loader。

**机制**：fd 号只是本进程 fd 表的下标，跨进程毫无意义。真正的跨进程传递靠 `SCM_RIGHTS` —— `sendmsg()` 的辅助控制消息：内核把发送方 fd 指向的打开文件描述 **复制进接收方的 fd 表**，接收方 `recvmsg()` 返回后拿到的是自己进程里一个 **新的 fd 号**，指向同一个 memfd。

helper 侧发送（ `frida-helper-backend.vala:1556-1559` ， `RemoteAgent.start()` 内）：

```
frida_ctrl.send_fd (spec.library_so.get_fd (), cancellable);     // agent 的 memfd
if (agent.agent_ctrlfd_for_peer != null)
    frida_ctrl.send_fd (agent.agent_ctrlfd_for_peer.handle, ...); // control 通道另一端
```

`send_fd` 是 GLib `UnixConnection` 的标准方法，底层实现就是 `sendmsg + SCM_RIGHTS` 。

loader 侧接收（ `loader.c:332-365` ， `frida_receive_fd()` ）——因为 loader 不链接任何库，recvmsg 也从手工 API 表里取：

```objectivec
msg.msg_control = &control;               /* FridaControlMessage：CMSG_SPACE(sizeof(int)) 的缓冲 */
msg.msg_controllen = sizeof (control);
res = libc->recvmsg (sockfd, &msg, 0);
if (res == -1 || res == 0 || msg.msg_controllen == 0)
return -1;
return *((int *) CMSG_DATA (CMSG_FIRSTHDR (&msg)));
```

文件开头的 `union _FridaControlMessage` 就是这块控制缓冲的类型定义。调用点： `loader.c:110` 收 agent fd、`:131` 收 control fd。

一句话收拢： **通道是 AF_UNIX 套接字，fd 过河靠 SCM_RIGHTS 让内核复制文件描述；两端一个用 GLib 封装、一个手写 recvmsg + CMSG 解析，因为 loader 里连 libc 都是靠指针表借来的。**

#### “就绪”有两级，不要混作一个信号

loader 的 `READY` 是第一级——fd 交接与装载同步完成，此刻 agent 入口还没调用；第二级在 §9——agent 在 control fd 上注册 `AgentSessionProvider` 成功，server 侧挂着的 `attach()` 才由此返回。两级用的都是注入时传进来的 fd，agent 不另建连接。

## 8\. agent 装载：上游 dlopen 与当前工程的 custom mapper

第 7 节停在 loader 工作线程接管 agent fd。agent 装进目标的方式，上游与当前工程并不相同，这里单独拆开。

### 8.1 上游路径

上游 loader 的核心是（17.9.1 `loader.c:110-131` ）：

```
接收 agent fd
  → 拼出 /proc/self/fd/<fd>
  → bionic dlopen()（把 libc 的 close 伪装成调用者地址传入）
  → dlsym("frida_agent_main")
  → 调用入口
```

这会让 bionic linker 参与装载，并建立 `soinfo` 、namespace、 `link_map` 、模块计数和 CFI 等账本。

### 8.2 当前工程路径：完全脱离 linker 的自定义装载

> 源码直达（上游对照）：helpers/loader.c @17.9.1 · dlopen 路径。本工程的 agent-mapper 为私有实现，不附源码，这里只讲设计。

我们删掉了 loader 里的 `dlopen()` / `dlsym()` ，换成自己的最小 ELF 装载器。设计目标只有一个： **让 agent 与 bionic linker 彻底无关**——不调用 linker、不注册 `soinfo` 、不进 `link_map` 、不触发命名空间合并与 `DT_NEEDED` 递归装载、不产生任何 linker 侧账本与回调。

上游靠 `dlopen` 换来的“省事”，代价是把 agent 整个写进系统账本（§8.1）；自定义 mapper 把这一整类 frida 特征从装载环节移出，而不是事后清理。装载流程本身只有七步：

```
读取 ELF header / program header
  → 匿名 mmap 整个 load span
  → 复制 PT_LOAD
  → 处理 RELA / JMPREL
  → 设置 segment 权限
  → 执行 init array
  → 从动态符号表找到 frida_agent_main
```

支撑这个设计的两个硬性取舍：

-   **只做 agent 需要的最小子集。**
    
    mapper 只实现当前 agent 实际用到的装载语义：AArch64 与 x86_64，拒绝 `PT_TLS` 、 `DT_RELR` 和未实现的 relocation 类型；不处理 namespace、 `DT_NEEDED` 递归依赖、符号版本。换来的是实现小、行为可穷举——装载器自身不引入新的系统交互面。
    
-   **失败不回退 `dlopen()` 。**
    
    上游 `dlopen` 失败会向 helper 报 `ERROR_DLOPEN` 并走异常路径（ `loader.c:150-158` ）；我们的 mapper 失败直接退出装载，宁可这次注入失败，也不让 agent 重新出现在 linker 账本里——回退等于把刚消掉的特征又请回来。
    

与 §5.2 的门控是同一套设计签名： **匿名 mmap 进来、不碰任何已有 so、不进任何账本**——门控在 ACK 后 `munmap` 自毁，agent 则随进程生命周期驻留。落到装载位置上，我们与上游的差别压缩成代码就是一对一的替换（逻辑示意，非关键实现）：

```rust
/* 上游 17.9.1：经 bionic dlopen，agent 进系统账本 */
ctx->agent_handle           = libc->dlopen ("/proc/self/fd/N", ...);
ctx->agent_entrypoint_impl  = libc->dlsym (ctx->agent_handle, "frida_agent_main", ...);

/* 我们：匿名映射 + 手工重定位，无 so、无账本、整块自管理 */
base  = anon_mmap (elf_load_span);
map_and_relocate_segments (elf, base);
entry = lookup_dynamic_symbol (elf, "frida_agent_main");
```

agent 装进目标后的自身定位不再依赖任何运行时视图，改由 loader 显式传入（§8.3）。

### 8.3 为什么增加 agent_base/agent_size

> 源码直达：lib/base/session.vala @17.9.1 · LinuxInjectorState · lib/agent/agent.vala @17.9.1 · create_and_run

匿名 mapper 不向 bionic linker 登记 agent。与此同时，当前工程的内核侧 maps 处理可能让 agent 无法通过 `/proc/self/maps` 找到自己。

先澄清归属： `LinuxInjectorState` 不是我们发明的——上游 17.9.1 就用这条通道把 control fd 从 loader 带进 agent（ `session.vala:1022` 定义， `agent.vala:141-152` 读取）。而且上游在 **Darwin（iOS/macOS）注入链里本来就传自身范围** （ `agent.vala:123-127` 的 DARWIN 分支读 `DarwinInjectorState.mapped_range` ）——我们等于把这个平台上的既有做法复用到了 Linux：扩展既有传递参数最省事，也最不容易破坏 ABI。

我们只是沿着这条既有通道扩展了两个字段：

| 位置  | 修改  |
| --- | --- |
| loader 的注入器状态（C 侧，本工程） | 在既有结构体中增加 `agent_base/agent_size` |
| Vala 侧 `LinuxInjectorState` （上游 `session.vala:1022` ） | 本工程扩展同名结构体，字段顺序与位宽和 C 侧完全一致 |
| agent 启动路径（上游 `agent.vala:116-184` ） | 本工程让 agent 优先使用 loader 传入范围，不再依赖 maps 反查 |

这三个位置必须一起变化。任一端字段顺序或位宽不一致，都会把 control fd、地址和长度解释错位。

## 9\. frida_agent_main 之后发生什么

> 源码直达：lib/agent/agent.vala @17.9.1 · 入口

`lib/agent/agent.vala:1-7` 的入口只负责创建或恢复 `Runner` ：

```
if (Runner.shared_instance == null)
    Runner.create_and_run (...);
else
    Runner.resume_after_transition (...);
```

上游 17.9.1 的入口会“久留”： `Runner.create_and_run()` （ `agent.vala:116-184` ）在 **loader 工作线程上** 直接 `run()` → `main_loop.run()` （ `agent.vala:267-277` ），入口在 agent 生命周期内不返回，loader 的 `pthread_detach` 、 `frida_send_bye` 收尾（ `loader.c:168-188` ）要等 agent 停止才执行——上游的 loader 工作线程最终就变成 agent 的主循环线程。当前工程把主循环移到 agent 自己新建的线程上，入口立即返回，loader 工作线程随即收尾退出；承载 agent 的线程从注入完成起就与 App 线程并行。

首次进入时， `create_and_run()` （ `agent.vala:116-184` ）依次完成（前三行是上游行为，标注处为本工程扩展）：

```
Environment._init()
  → 确定并 Cloak agent 范围（上游 detect_own_range；我们改用传入的 agent_base/agent_size）
  → 处理 control fd（上游 :141-152）
  → 创建 Runner
  → 建立主循环和 DBus connection
  〔本工程〕开启 Android program-module fast path（§12）
```

`agent.vala:1175-1187` （ `setup_connection_with_stream` ）在 control stream 上注册 `AgentSessionProvider` ：

```
registration_id = connection.register_object (
    ObjectPath.AGENT_SESSION_PROVIDER, provider);
controller = yield connection.get_proxy (
null, ObjectPath.AGENT_CONTROLLER, ...);
connection.start_message_processing ();
```

server 取得 provider 后，再调用 `open()` 创建具体 `AgentSession` 。

状态边界如下：

因此“agent 已在 maps 中”“ `frida_agent_main` 已调用”和“脚本第一行已执行”是三个不同事实。

## 10\. resume 放行：归还控制权，App 继续启动

> 源码直达：ZymbioteConnection.resume() @17.9.1 · zymbiote.c @17.9.1 · TAILCALL_TO_RAISE_SIGSTOP

> **放行时的分工，先钉死：两个版本里动手写槽位的永远是 server**——server 经 `/proc/<pid>/mem` （ `linux-host-session.vala:2627` 的 `open_process_memory()` ）把两个指针槽写回原始地址。 **门控（payload）从头到尾不写任何槽位，它只负责处置自己**：上游靠门控 `raise(SIGSTOP)` 把整个子进程停稳，给 server 开一个稳定还原窗口；我们靠门控 `munmap` 自毁，连窗口都不需要。这不是实现巧合，而是能力边界：payload 的 API 表里本来就没有任何写进程内存的函数（§5.2），它想还原也做不到。

先分清 ACK 的两种触发方式：

-   **匹配目标或被全局门控的 App**
    
    ACK 不会因为 agent 就绪而自动发出。子进程一直卡在 `recv()` ，直到客户端调用 `Device.resume(pid)` ；frida CLI 默认在脚本加载完成后调用，用 Python API 时忘了调用，目标 App 就会一直停在等待点上。
    
-   **普通非目标 App**
    
    §6.3 的 server 分流会立即调用同一个 `ZymbioteConnection.resume()` ，直接完成 ACK 与清理，不等待客户端。
    

两条分支最终共用同一个放行函数。目标分支由 `perform_resume()` 触发。上游 17.9.1 的 `ZymbioteConnection.resume()` （ `linux-host-session.vala:2175-2194` ）：

```
uint8 ack[1] = { 0x42 };
yield connection.get_output_stream ().write_async (ack, ...);
yield input.read_async (bye, ...);

yield wait_until_stopped (hello.pid, cancellable);

if (patches_to_revert != null)
    patches_to_revert.revert (open_process_memory (hello.pid));

Posix.kill ((Posix.pid_t) hello.pid, Posix.Signal.CONT);
```

对应顺序：发 ACK → 读对端 bye → 等子进程 tail-call `raise(SIGSTOP)` 后停稳 → 还原两个指针槽 → `SIGCONT` 放行。

这个 `raise(SIGSTOP)` 是 **门控自己实现的** （就在 `zymbiote.c` 的 replacement 里，靠 API 表里的 `raise` 完成），时机在 setArgV0 **replacement 内部的尾声**——不是 setArgV0 返回 Java 之后。子进程侧的完整顺序（上游 `zymbiote.c:80-107` ）：

```
original setArgV0() 先透传执行
  → 连 server、发 hello
  → 阻塞 recv 等 1 字节 ACK              ← App 主线程就停在这里
ACK 到达（recv 返回）
  → 清理 package_name、恢复页权限 RX
  → if (revert_now) → must-tail raise(SIGSTOP)   ← 门控把整个子进程停稳
  → server 在停稳窗口里经 /proc/<pid>/mem 写回两个槽位
  → SIGCONT
  → raise 的返回地址就是 Java 侧 setArgV0 的调用点，App 从这里继续启动
```

注意 replacement 自己从不正常返回：must-tail 让 `raise` 直接顶替 replacement 的栈帧，所以“回到 Java 调用点”与“停稳给 server 开还原窗口”是同一次跳转完成的。

当前工程把顺序改为“先还原、再放行、后确认”：

```
1. 在该子进程中还原继承来的 setArgV0 指针槽，以及存在时的 setcontext 指针槽
2. 向子进程发送 ACK
3. 等待 socket 对端关闭
4. 确认 zymbiote payload 映射已经消失（payload 自行 munmap）
```

没有 SIGSTOP/SIGCONT 往返，子进程也不会短暂多出一次“被外部停稳”的状态。

子进程收到 ACK 后的收尾是同款 must-tail 手法：上游 17.9.1 的 payload 在 `revert_now` （ `zymbiote.c:105-109` ）置位后，用四个架构宏 tail-call `raise(SIGSTOP)` （`:191-253` ）；当前工程同一位置 tail-call 的是：

```
munmap(payload_base, payload_size)
```

调用代码本身位于即将被释放的 payload 中，所以不能先普通调用 `munmap()` 再从已释放页面返回。这里必须让函数尾调用直接跳到 libc `munmap` ，由 `munmap` 按原调用者的返回地址返回——上游的 `raise` 不释放页面，但同样靠 must-tail 把返回地址直接留给 Java 调用点。

放行之后，控制流从哪里回到 App？ `recv` 拿到 ACK 后，replacement 释放进程名、恢复页权限，然后以 `setArgV0` 的身份向调用者返回——must-tail `munmap` 的返回地址就是 Java 侧 `Process.setArgV0` 的调用点。

控制流由此接回 Android 启动链（§0.3）：

```
ACK → recv 返回
  → replacement 清理，以 setArgV0 身份 return（munmap 直接返回到 Java 调用点）
  → handleChildProc 里的 Process.setArgV0 调用点
  → ZygoteInit.zygoteInit → RuntimeInit.applicationInit
  → findStaticMain("android.app.ActivityThread")
  → ActivityThread.main() → Application / Activity 生命周期
```

另一边，agent 不需要“回到”App 流程： `frida_agent_main` 运行在 loader 创建的工作线程上，进入自己的主循环（§9），从此与 App 线程并行。App 主线程在注入期间只是被 ptrace 借去启动了 loader，寄存器恢复、detach 后仍回到阻塞的 `recv` （§7.4）；脚本 hook 的 App 函数，要等 App 真正跑到那里，才被 Interceptor 的 inline hook 接住。

对目标 App 而言：zymbiote 只借一个等待点，ptrace 只借主线程几毫秒，agent 活在自己的线程里，最后由客户端 `resume()` 发出的 1 字节 ACK 把 App 放回 Android 启动链。对普通非目标 App，server 在匹配失败后立即走同一放行函数，只做指针还原、ACK 和 payload 自卸载，不进入 ptrace/agent 链。

父 zygote 中的 payload 和指针改写继续保留，用于门控下一次 fork；关闭 RoboLauncher 时，server 才暂停父进程、还原指针并释放 payload。

Chrome 子 zygote 是特例：它本身还要继续 fork renderer。server 将父级 patch 记录转交给 Chrome zygote，不发送 ACK；连接关闭后 payload 不执行自卸载，门控能力继续由这个二级 zygote 继承。

最后把整条链完整走一遍：App 子进程在 `setArgV0` 的 replacement 里阻塞等 ACK 时，server 已经用 ptrace 借它的主线程跑完了 bootstrapper 和 loader——loader 入口只做一件事， `pthread_create` 出工作线程后立即返回，于是寄存器恢复、ptrace detach，主线程回到阻塞的 `recv()` 继续等；工作线程收下 agent fd、用 custom mapper 把完整 agent 装进目标、向 helper 发 `READY` ，再调用 `frida_agent_main` ——agent 入口把主循环放到自己新建的线程上随即返回，loader 工作线程收尾退出（上游入口则在 loader 工作线程上直接运行主循环，见 §9）；agent 在注入时传进来的 control fd 上与 server 建立 DBus 连接并注册 `AgentSessionProvider` ，server 侧挂着的 `attach()` 由此返回，客户端随后创建并加载脚本；最后客户端调用 `resume()` ，server 还原子进程的两个指针槽、向那个还在等的 `recv()` 发出 1 字节 ACK—— `recv` 返回，payload 自卸载并以 `setArgV0` 的身份返回 Java 调用点，App 从这里继续走 `ActivityThread.main()` ，agent 与它并行运行。

## 11\. 收尾一提：独立的 attach 已运行进程

本课主线是 spawn。如果不需要“早于业务代码”，也可以省掉整个门控段，直接对已运行进程执行：

```
frida -U -n TARGET_NAME   # 按进程名；或 -p PID
```

此时走的就是第 7 节拆过的那条装载链，一个环节都不少：

```
attach(pid)
  → HostSession.attach → Linjector → LinuxHelperBackend
  → ptrace → bootstrapper → loader → frida-agent
  → AgentSession → create_script / load_script
```

与 spawn 只有两点不同：

-   前面没有 zymbiote 门控段，也就没有第 4–6 节的出生拦截；
    
-   时机晚：目标进程早已跑完 specialize、 `Application.onCreate` 等早期初始化，脚本只能从 attach 时刻开始观察；也没有第 10 节的 ACK 放行点，注入完成即继续运行。
    

所以独立 attach 是第 7 节那条装载链的单独使用；要 hook `Application.onCreate` 、早期 native 初始化或反调试逻辑，必须用 `-f` 走完整 spawn。

## 12\. 当前工程相对上游改变了什么

以下只列与“启动和注入主链”直接相关、且能由上游 17.9.1 源码对照确认的变化。普通版本演进造成的接口差异不计入本表；

线程名、默认 Hook、Stalker、pthread 字段和 maps 内核协作分别在 F06-F11 展开。

### 12.1 自定义 mapper 改的是 agent 装载，不是 ptrace 原语

ptrace、远程 `mmap` 、bootstrapper、loader 启动和 control channel 仍然存在。当前工程替换的是 loader 内部的：

```
dlopen + dlsym
```

而不是把整条注入链改成另一种技术。若 ptrace 失败，自定义 mapper 根本没有运行机会。

### 12.2 zymbiote 自卸载改的是门控收尾

zygote 父进程仍需要保留 payload 与两个接入点，否则无法观察后续 fork。自卸载发生在普通 App 子进程收到 ACK 以后，目标是清除 **子进程继承来的临时门控状态**，不是让父 zygote 从未被修改。

### 12.3 Gum.Cloak 不是系统级隐藏

agent 获得自己的 base/size 后调用 `Gum.Cloak.add_range()` ，只会影响 Frida 自己提供的部分枚举结果。Linux 内核仍然持有 VMA；系统 `/proc/<pid>/maps` 是否过滤由 xiaojia-hide 的私有 `prctl` ABI 与 procfs 实现决定，详见 F11 和 04 内核工程 M02。

## 13\. 两条路径的时序对照

### spawn Android App（-f 主线）

```
spawn(package)
  → ensure_loaded() 幂等兜底（门控默认已在 server 启动时安装）
  → Android framework 请求启动 package
  → zygote/USAP fork child
  → child specialize / setcontext
  → child setArgV0
  → zymbiote 上报 pid/ppid/process-name 并等待 ACK
  → spawn 返回 child pid
  → attach(child pid)
  → ptrace/bootstrap/loader 注入完整 agent
  → create/load script
  → resume(child pid)
  → 还原 child 指针槽
  → ACK
  → child 自卸载 zymbiote payload，以 setArgV0 身份返回
  → ActivityThread.main → Application / Activity 生命周期
```

放行段最后三步是当前工程协议；上游为 ACK → tail-call `raise(SIGSTOP)` → server 等停、还原 → `SIGCONT` （§10）。

### attach 已运行进程（对照）

```
目标已运行
  → attach(pid)
  → ptrace seize/interruption
  → 远程 mmap bootstrap 区和栈
  → 执行 bootstrapper
  → 写入并启动 loader
  → loader 创建工作线程
  → mapper 装载 frida-agent（本工程；上游为 dlopen）
  → frida_agent_main
  → AgentSessionProvider / AgentSession
  → 脚本 create/load
```

## 14\. 故障定位

按 spawn 主线从前往后排查，装载段的问题最后查。

## 15\. 源码复核

对上游 17.9.1 可直接执行（本工程改动只以 §12 的思路对照，不在上游源码中）：

```bash
git clone --depth 1 --branch 17.9.1 https://github.com/frida/frida-core frida-core-17.9.1
cd frida-core-17.9.1

rg -n "public async uint spawn|public async Session attach" src/frida.vala

rg -n "perform_attach_to|inject_library_resource|request_control_channel" \
  src/linux/linux-host-session.vala \
  src/linux/linjector.vala

rg -n "class InjectTask|class InjectSession|bootstrap \(|launch_loader|class SeizeSession" \
  src/linux/frida-helper-backend.vala

rg -n "ensure_loaded|inject_zymbiote|prepare_zymbiote_injection|handle_zymbiote_connection" \
  src/linux/linux-host-session.vala

rg -n "replacement_setcontext|replacement_setargv0|TAILCALL_TO_RAISE_SIGSTOP" \
  src/linux/helpers/zymbiote.c

rg -n "dlopen|dlsym|frida_agent_main|LinuxInjectorState" \
  src/linux/helpers/loader.c \
  lib/base/session.vala \
  lib/agent/agent.vala
```

复核结果应能组成四条连续证据链（第三条左半是上游路径，右半是本工程思路）：

```
spawn API → RoboLauncher → zymbiote hello → child pid
attach API → Linjector → InjectSession → loader
loader → dlopen/dlsym（上游）· custom mapper（本工程）→ frida_agent_main
agent → AgentSessionProvider → AgentSession
```

**Frida 是否把完整 agent 注入 zygote？**  
否。zygote 中是 `zymbiote` 门控载荷；完整 agent 在目标子进程 PID 确定后通过普通 attach 注入。zymbiote 默认在 frida-server 启动时经 preload 注入父进程（§3、§4），不是等 spawn 才做。

**`-f` 为什么能早于 App 业务代码？**  
子进程在 specialize/进程命名阶段通过 zymbiote 上报并阻塞，server 在放行前完成 agent 注入与脚本加载。

**spawn 返回 PID 之后、resume 之前发生了什么？**  
客户端立刻对这个 PID 做一次 attach：ptrace → bootstrapper → loader → mapper 装载完整 agent → 建立 AgentSession → 创建并加载脚本。

**当前 zymbiote 修改解决了什么？**  
App 子进程收到 ACK 后还原继承的函数槽并自卸载临时 payload；注入前的 stale cleanup 负责异常残留。

**独立的 attach 和 spawn 是什么关系？**  
同一条装载链的单独使用：没有门控段、时机晚于 App 早期初始化，也没有 ACK 放行点。

**普通 attach 为什么需要 ptrace？**  
ptrace 提供暂停、寄存器读写和受控远程执行入口；真正装载还依赖 bootstrapper、远程内存、loader、fd 传递与控制通道。

**当前工程改掉 `dlopen()` 后，为什么 agent 还能运行？**  
自定义 mapper（agent-mapper，本工程私有）自行处理当前 agent 所需的 ELF segment、relocation、权限、constructor 和入口查找。

**不是本次目标的 App 也会进入 zymbiote 的 `recv()` 吗？**  
会。只要它从已安装门控的 Zygote/USAP 出生并执行到 `setArgV0` ，就会发送 hello 并短暂等待。server 发现没有匹配的 spawn 请求且未开启全局 spawn gating 后，会立即还原子进程继承的相应函数指针槽、发送 ACK，并让 payload 自卸载；不会对它 attach，也不会注入完整 agent。

\*本文为看雪论坛优秀文章，由 mb_peeqldfc 原创，转载请注明来自看雪社区
