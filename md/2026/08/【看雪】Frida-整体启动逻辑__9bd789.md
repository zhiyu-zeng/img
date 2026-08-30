---
title: 【看雪】Frida 整体启动逻辑
source: https://bbs.kanxue.com/thread-292814.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-31T03:44:35+08:00
trace_id: 49a6b58d-28a7-4eb8-af2e-1c0b55eb0b95
content_hash: acc4307ac623675edbe1f34785e0133e50d9e0dcb45fe2f71dfbd7c44c1724c7
status: synced
tags:
  - 看雪
  - Android逆向
  - Frida
series: null
feed_source: 看雪·Android安全
ai_summary: Frida `-f` spawn 机制的核心是：frida-server preload 把 zymbiote 门控载荷注入 zygote/USAP 并改写 setcontext/setArgV0 两个函数指针，拦下新生 App 上报 PID，再用 ptrace 注入 frida-agent，最后由客户端 resume 发 ACK 放行。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3cc75244-d011-8116-a254-fdc9e6ec3004
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida `-f` spawn 机制的核心是：frida-server preload 把 zymbiote 门控载荷注入 zygote/USAP 并改写 setcontext/setArgV0 两个函数指针，拦下新生 App 上报 PID，再用 ptrace 注入 frida-agent，最后由客户端 resume 发 ACK 放行。
> 
> - **门控位置：** zymbiote payload 写入已存在的 libstagefright.so 可执行映射最后一页的填充区，不新建映射、maps 条目不变；默认在 frida-server 启动 preload 时注入 zygote/zygote64/usap32/usap64/Chrome zygote，spawn/gating 时的 ensure_loaded 只是幂等兜底，改的是函数指针指向，不改机器码。
> - **拦截时机：** fork 后子进程继承门控；setcontext replacement 只抄录进程名不阻断，setArgV0 replacement 才连接 server 上报 pid/ppid/process-name 并阻塞在 recv() 等待 1 字节 ACK——此时进程身份已完整、App 业务代码一行未跑。
> - **agent 注入链路：** spawn 返回 PID 后立即对该 PID 做一次标准 attach：PTRACE_SEIZE → 保存寄存器 → 远程 mmap → bootstrapper → loader 仅 pthread_create 出工作线程后返回，主线程恢复寄存器并 detach；工作线程通过 /proc/self/fd/<fd> + dlopen 装载完整 frida-agent。agent 在 control fd 注册 AgentSessionProvider 后，server 侧 attach() 才返回。
> - **agent 运行态：** frida_agent_main 把主循环放到独立 frida-eternal-agent 线程，loader 工作线程退出；"agent 已装载"、"入口已调用"、"脚本首行已执行"是三个不同状态边界。
> - **resume 清场：** ACK 不会自动发出，必须客户端调 Device.resume；子进程收到后 raise(SIGSTOP) 自暂停，server 按注入时记录的原值还原两个指针槽与尾页字节，再 SIGCONT；控制流按原返回地址回到 Java setArgV0 调用点，继续 ActivityThread.main。父 zygote 的门控保留到 server 关闭。

## F01 · Frida 整体启动、进程注入与 Zygote 门控

> 《凡人修仙传之 - Android 逆向开发》· 03 动态插桩功法 · 技能 F01
> 
> 前置：01 炼气境 · 第 05 课《Android 应用启动过程》、第 07 课《Android ptrace 原理》
> 
> 后续：F02 脚本加载时机；F04 server IPC；F05 Android SELinux；F09 自定义 linker
> 
> 版本锚点：GitHub [frida/frida-core](https://github.com/frida/frida-core/tree/17.9.1) tag **17.9.1** （frida 为伞形仓库，frida-core 子仓库独立打 tag）；客户端 [frida-tools](https://github.com/frida/frida-tools/tree/14.10.4) tag **14.10.4**。本课所有「源码直达」链接与行号均对应该版本；实验基线 Android 14/API 34。

* * *

## 开课词库：先分清三组角色

下表按三个主题收齐本课正文会出现的主要名词。这张表不是预习作业——正文讲到每个词时都会重新解释，听课时遇到陌生词回来查即可；带 ★ 的 12 个是贯穿全课的主线词，先记住它们，并分清四个角色：谁发起启动请求、App 进程由谁复制、Frida 在哪里门控、脚本最终由谁执行。

### A. Android 创建进程：从桌面到 App

| 术语  | 通俗解释 | 正文位置 |
| --- | --- | --- |
| 桌面（Launcher） | 主屏幕本身也是一个 App。点图标只是发出“我要启动谁”的请求，并不亲自创建进程 | §0.1 |
| `Intent` | 描述“启动哪个组件、带什么参数”的消息对象 | §0.1 |
| Binder | Android 进程间通信的主要通道，桌面用它把启动请求交给系统 | §0.1 |
| ★ `system_server` | 系统服务集中所在的进程：解析启动请求、决定是否新建进程，但自己不执行 fork | §0.2 |
| ATMS / `ActivityStarter` | 管理页面启动与任务栈的系统服务，以及具体处理这一次启动的对象 | §0.1 |
| AMS / `ProcessList` | 管理应用进程的服务；目标进程不存在时，由它准备新进程的身份、进程名等创建参数 | §0.2 |
| ★ Zygote | 所有 App 进程的共同父进程，新 App 进程由它复制而来 | §0.3 |
| Zygote socket | `system_server` 向 Zygote 下发创建命令的本地 socket 通道 | §0.2 |
| ★ `fork()` | 把当前进程复制成两份的系统调用；返回值区分父进程和子进程 | §0.3 |
| ★ specialize | fork 之后给子进程设置具体 App 身份（uid、SELinux 域、进程名）的阶段 | §0.3 |
| ★ USAP | Zygote 预先 fork 好、尚未绑定应用身份的备用进程；App 也可能从它出生 | §0.5 |
| `ActivityThread` | 子进程进入 Java 世界的入口类； `Application` 和 Activity 在它之后才开始加载 | §0.2、§0.3 |

### B. Frida 控制与注入：从命令行到目标进程

本课主线是 spawn，词表顺序也按 spawn 的时间线排。

| 术语  | 通俗解释 | 正文位置 |
| --- | --- | --- |
| `frida-tools` / client | 电脑上的 Frida 命令行或程序，负责向手机发送控制请求 | §1  |
| ★ `frida-server` | 运行在手机上的 Frida 服务端，接收电脑命令，指挥门控与注入 | §3  |
| ★ `spawn` | 让系统启动一个新 App，并在它刚出生时就接管； `-f` 的主线 | §1、§4–§10 |
| ★ `attach` | 接管一个进程；spawn 装载段对新生子进程做的就是一次 attach | §7、§11 |
| `RoboLauncher` | frida-server 中负责 spawn 的模块：请求系统启动 App、等新进程上报 PID；门控注入也由它的 preload/ensure_loaded 执行 | §4、§6.1 |
| ★ `zymbiote` | frida-server 启动（preload）即注入 Zygote/USAP 的小型门控载荷；新进程出生时上报 PID 并暂停等待放行 | §4、§5、§6.2 |
| ★ `ptrace` | Linux 的进程调试接口：暂停目标、读写寄存器和内存，是注入的入口能力 | §7.3 |
| `Linjector` / Linux helper | frida-server 侧执行注入的模块：ptrace 目标、远程分配内存、送入引导代码 | §7.2、§7.3 |
| `bootstrapper` | 最先进入目标进程的一小段引导代码，负责搭好内存和通信环境 | §7.3 |
| `loader` | 接手装载的小程序：创建工作线程，把 `frida-agent` 装进目标并启动 | §7.4、§8 |
| ★ `frida-agent` | 最终进入目标 App 的完整 Frida 载荷；Gum 和脚本都在它里面运行 | §7、§8、§9 |

### C. 门控与会话：什么时候停，什么时候放

| 术语  | 通俗解释 | 正文位置 |
| --- | --- | --- |
| payload | 送进目标进程的一小段代码或数据； `zymbiote` 和 `frida-agent` 都是 payload | §1、§5 |
| RX / RWX | 内存页权限：RX 可读可执行，RWX 再加可写；zymbiote 平时只保留 RX | §5、§6.2 |
| 尾页（padding） | ELF 映射最后一页里 segment 内容结束后的剩余填充字节；zymbiote 借 `libstagefright.so` 这里藏身 | §5.2 |
| `setcontext` / `setArgV0` | specialize 阶段先后执行的两个函数；zymbiote 通过改写指向它们的函数指针接入门控 | §4、§5、§6.2 |
| ACK | zymbiote 等待的 1 字节放行确认；收到之前，新子进程一直停在启动路上 | §6.2、§10 |
| ★ `resume` | 放行操作：发出 ACK、等子进程自暂停、还原改写、 `SIGCONT` ，让 App 继续启动 | §10 |
| `AgentSession` | server 与目标进程内 agent 建立的一次控制会话，脚本挂在它上面 | §9  |
| Gum / GumJS | agent 里的插桩引擎和它的 JS 绑定，Frida 脚本的能力来源 | §9  |

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

1.  Launcher 点击图标后直接创建了目标进程；
2.  `system_server` 收到启动请求后亲自 `fork()` 出 App。

两者都不准确。Launcher 只发起 Activity 启动请求； `system_server` 负责解析目标组件、检查启动条件并准备进程参数；真正复制进程地址空间的是 Zygote。先建立这条 Android 正常基线，后面才能看懂 Frida `-f` 为什么要提前处理 Zygote 和 USAP。

本节源码导航统一使用 [Android Code Search](https://cs.android.com/) 的 AOSP `main` 链接 \[14\]–\[20\]；课程实验仍以 Android 14/API 34 为基线。 `main` 后续增加的快速路径会单独标出，不把当前实现误写成所有版本唯一实现。

### 0.1 Launcher：点击图标只是发起启动请求

> 源码直达： [Launcher3 · ItemClickHandler.java](https://cs.android.com/android/platform/superproject/main/+/main:packages/apps/Launcher3/src/com/android/launcher3/touch/ItemClickHandler.java) · [ActivityTaskManagerService.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/services/core/java/com/android/server/wm/ActivityTaskManagerService.java) · [ActivityStarter.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/services/core/java/com/android/server/wm/ActivityStarter.java)

AOSP Launcher3 的参考实现把桌面图标点击交给 `ItemClickHandler.onClick()` ；厂商桌面的类名和动画实现可能不同，但最终仍要发起 framework 的 Activity 启动请求。普通应用图标依次进入：

```
ItemClickHandler.onClick()
  → onClickAppShortcut()
  → startAppShortcutOrInfoActivity()
  → launcher.startActivitySafely(...)
```

源码入口见 `ItemClickHandler.java` \[14\]。这一步持有的是描述目标 Activity 的 `Intent` ，没有 `fork()` ，也没有加载目标 APK。请求继续经过 Android 的 Activity 启动接口，以 Binder 调用进入 `system_server` 中的 `ActivityTaskManagerService` （ATMS）；ATMS 与 `ActivityStarter` 负责解析目标 Activity、任务栈、用户和启动限制 \[15\]。

第一段链路可先记成：

```
桌面图标
  → Launcher3
  → startActivity
  → Binder
  → system_server：ATMS / ActivityStarter
```

### 0.2 system_server：决定是否需要新进程

> 源码直达： [ProcessList.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/services/core/java/com/android/server/am/ProcessList.java) · [Process.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/os/Process.java) · [ZygoteProcess.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/os/ZygoteProcess.java)

如果目标进程已经存在，系统可以直接向现有进程下发 Activity 生命周期事务，不需要再次请求 Zygote。

如果目标进程不存在，启动链会进入 AMS 的进程管理逻辑，最终由 `ProcessList.startProcessLocked()` 准备创建参数。这里有一个关键值 \[16\]：

```java
final String entryPoint = "android.app.ActivityThread";
```

这个值说明 Zygote 即将创建的不是“直接执行 APK `main()` 的进程”，而是以框架类 `ActivityThread` 为 Java 入口的新进程。目标 APK、 `Application` 和 Activity 要等新进程向 AMS 完成 `attach` 与 `bindApplication` 后才开始加载。

`ProcessList` 随后通过 `Process.start()` 进入 `ZygoteProcess.start()` / `startViaZygote()` \[17\]。这一段会把下面这些参数编码成 Zygote 命令：

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

> 源码直达： [ZygoteServer.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/ZygoteServer.java) · [ZygoteConnection.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/ZygoteConnection.java) · [Zygote.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/Zygote.java) · [Zygote native](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/jni/com_android_internal_os_Zygote.cpp)

Zygote 已经在 `ZygoteServer.runSelectLoop()` 中监听命令。socket 到来后，server 创建 `ZygoteConnection` 并调用 `processCommand()` \[18\]。

连接建立时， `ZygoteConnection` 会读取对端凭据并限制调用方：

```java
if (peer.getUid() != Process.SYSTEM_UID) {
    throw new ZygoteSecurityException(
        "Only system UID is allowed to connect to Zygote.");
}
```

因此普通 App 不能绕过 `system_server` ，直接要求 Zygote 按任意 uid 创建进程。命令通过参数与权限检查后，常规路径进入：

```java
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

Java 层的 `forkAndSpecialize()` 继续进入 native `nativeForkAndSpecialize()` ； `com_android_internal_os_Zygote.cpp` 的 `ForkCommon()` 才是实际调用 `fork()` 的位置 \[19\]。

AOSP `main` 的 `processCommand()` 还会让满足条件的简单请求进入 `Zygote.forkSimpleApps()` 批处理快路。它改变的是命令处理与批量 fork 的组织方式，不改变“由 Zygote 家族创建进程、native 层执行 fork、父子进程从返回值处分流”这三个结论。本课先沿 `forkAndSpecialize()` 主线建立模型，再在 USAP 小节补充分支。

fork 返回后，同一段代码出现两条命运：

| 返回位置 | `pid` | 后续动作 |
| --- | --- | --- |
| 父进程 Zygote | `> 0` | 把子进程 PID 回写给 `system_server` ，继续等待下一条命令 |
| 新生 App 子进程 | `0` | 关闭不应继承的 socket/fd，按目标 uid、gid、capability、SELinux 域完成 specialize |

子进程随后经：

```
handleChildProc()
  → ZygoteInit.zygoteInit()
  → RuntimeInit.applicationInit()
  → findStaticMain("android.app.ActivityThread")
  → ActivityThread.main()
```

对应源码入口见 `ZygoteInit.java` 、 `RuntimeInit.java` 与 `ActivityThread.java` \[20\]。到 `ActivityThread.main()` 时，新 App 进程已经出生，但应用自己的 `Application.onCreate()` 和 Activity 生命周期仍要等待后续绑定与事务分派。

> 子进程入口直达： [ZygoteInit.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/ZygoteInit.java) · [RuntimeInit.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/RuntimeInit.java) · [ActivityThread.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/app/ActivityThread.java)

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

上图描述的是主 Zygote 收到命令后直接 `forkAndSpecialize()` 的常规路径。启用 USAP（Unspecialized App Process）池时，系统可能预先从 Zygote fork 出若干“尚未绑定具体应用身份”的进程；创建请求到来后， `ZygoteProcess` 优先尝试把参数交给一个 USAP，让它完成 specialize，而不是此刻才从主 Zygote 重新 fork \[17\]。

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

```bash
frida -U -f TARGET_PACKAGE -l probe.js
```

做的主事是 **spawn**：让系统启动一个全新的 App 进程，并赶在它的业务代码运行之前接管。它不是“把一段 JavaScript 发给目标进程”这么简单。Android 上至少发生两次性质不同的注入：

1.  **zygote 门控注入**：把一个很小的 `zymbiote` 载荷写入 zygote、USAP 或 Chrome zygote，并 hook 两个函数指针；默认在 frida-server 启动时（preload）就完成，先于任何客户端命令，spawn 到来时只是幂等兜底；
2.  **目标进程 agent 注入（spawn 与 attach 共用）**：得到子进程 PID 后，再通过 ptrace/bootstrap/loader 把完整 `frida-agent` 装入这个子进程。

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

| 组件  | 所在位置 | 作用  |
| --- | --- | --- |
| `frida-tools` / binding | PC  | 调用 `spawn` 、 `attach` 、 `resume` 、脚本 API |
| `frida-server` | Android 设备 | 接收控制请求，持有 `HostSession` |
| `RoboLauncher` | server 进程 | Android App 启动、zygote/USAP 门控与 PID 匹配 |
| `zymbiote` | zygote 及其子进程 | 在进程命名/SELinux specialize 节点向 server 报告新进程并等待放行 |
| `LinuxHelperBackend` | server/helper 侧 | ptrace 目标、远程分配内存、执行 bootstrapper 与 loader |
| `loader` | 目标进程 | 建立工作线程，接收 agent fd， `dlopen` 装载 agent 并调用入口 |
| `frida-agent` | 目标进程 | 初始化 Gum、DBus provider、脚本引擎和运行时能力 |
| `AgentSession` | server 与 agent 两侧 | 承载某一次 attach 的脚本与消息会话 |

`frida-server` 在线只说明控制服务已经启动； `zymbiote` 已进入 zygote 只说明出生门控已建立； `frida-agent` 映射成功也只说明 native 载荷进入目标。三者不能互相替代。

## 3\. frida-server 如何接住客户端请求

> 源码直达： [server/server.vala](https://github.com/frida/frida-core/blob/17.9.1/server/server.vala) · [src/control-service.vala](https://github.com/frida/frida-core/blob/17.9.1/src/control-service.vala)

`server.vala:199` 的 `run_application()` 创建 `Application` ， `server.vala:294-296` 构造并启动 `ControlService` ：

```
service = new ControlService (endpoint_params, options);
yield service.start (io_cancellable);
```

`ControlService` 内部持有设备侧 `HostSession` 。客户端连接后， `control-service.vala:915-931` 将 `spawn()` 与 `attach()` 转交给 `host_session` ：

```typescript
public async uint spawn (...) {
    return yield parent.host_session.spawn (program, options, cancellable);
}

public async AgentSessionId attach (...) {
    return yield parent.attach (pid, options, this, cancellable);
}
```

启动 frida-server 的时候，它注入了什么、hook 了什么？

默认配置下的答案是：把 `zymbiote` 门控注入 zygote/USAP，并 hook 两个函数指针。 `ControlServiceOptions.enable_preload` 默认为 true（ `server.vala:17` ；命令行 `-P / --disable-preload` 可关），因此 `ControlService.start()` 建立监听后立即走 `LinuxHostSession.preload()` （ `linux-host-session.vala:90-95` ）→ `RoboLauncher.preload()` （ `linux-host-session.vala:1382` ）→ `ensure_loaded()` ，把门控装进 zygote / zygote64 / usap32 / usap64 / Chrome zygote，并改写 `setcontext` / `setArgV0` 两个函数指针。这一切先于任何客户端命令；之后 `spawn()` 与 `enable_spawn_gating()` 开头的 `ensure_loaded()` 只是幂等兜底；server 退出时 `close()` 还原改写（ `linux-host-session.vala:1386-1418` ）。

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

> 源码直达： [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala)

门控不属于 spawn 流程：默认情况下，它在 frida-server 启动时经 §3 的 preload 链就已经完成，先于任何客户端命令。注入与卸载的时机只有这几处：

```
注入（幂等，已注入的父进程直接跳过）：
  server 启动    → preload() → ensure_loaded()          默认路径
  spawn 请求     → RoboLauncher.spawn() 开头兜底
  开启 gating   → enable_spawn_gating() 开头兜底

卸载：
  server 退出    → close() 暂停父进程、还原改写
```

对应源码：preload 链 `linux-host-session.vala:90-95, 1382` ；spawn 兜底 `1462` ；gating 兜底 `1416-1421` ；close 卸载 `1386-1418` 。

hook 的对象是两个函数指针槽：specialize 阶段先后执行的 `selinux_android_setcontext()` 与 `android_os_Process_setArgV0()` 。改写的是指针指向（指向 zymbiote 的 replacement 函数），不改函数机器码；槽位定位与写入流程在 §5.1。

### 4.1 注入对象：五个父进程

> 源码直达： [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala)

`RoboLauncher.ensure_loaded()` 在 `linux-host-session.vala:1517` 起建立随机名称的抽象 Unix socket，然后枚举：

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

### 5.1 注入流程：借用尾页、写入、改指针

> 源码直达： [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala) · [helpers/zymbiote.c](https://github.com/frida/frida-core/blob/17.9.1/src/linux/helpers/zymbiote.c)

`inject_zymbiote()` 位于 `linux-host-session.vala:1605-1650` ，全程不开新映射、不用 ptrace，只靠 `/proc/<pid>/mem` ：

1.  读父进程 maps，解析 `libc.so` 、 `libselinux.so` 、 `libandroid_runtime.so` ，并收集 boot heap 候选区（ `linux-host-session.vala:1700-1735` ）；
2.  选定载荷载体：可执行且路径以 `/libstagefright.so` 结尾的映射，取其 **最后一页** （§5.2）；
3.  从 `libandroid_runtime.so` 导出表定位 `android_os_Process_setArgV0()` 的地址；
4.  在 boot heap（ `boot.art` / `dalvik-LinearAlloc` 等可写映射）中搜索“值等于该地址”的指针槽—— `setArgV0` 的调用槽；再从导入表定位 `selinux_android_setcontext()` 的 slot；
5.  `SIGSTOP` 暂停父进程；
6.  把 payload pwrite 进尾页，把两个指针槽改到 payload 的 replacement（改写前记录原值；父进程此前已打过补丁时，则按 `file_offset` 从磁盘 so 读回原字节作原值）；
7.  `SIGCONT` 恢复父进程。

核心写入顺序（ `linux-host-session.vala:1608-1646` ）：

```cpp
Posix.kill ((Posix.pid_t) pid, Posix.Signal.STOP);
yield wait_until_stopped (pid, cancellable);

var patches = new ZymbiotePatches ();
prep.process_memory.pwrite (payload, prep.payload_base);
patches.apply (prep.replaced_setargv0_ptr, prep.process_memory, prep.setargv0_slot, ...);

if (prep.setcontext_slot != 0)
    patches.apply (prep.replaced_setcontext_ptr, prep.process_memory, prep.setcontext_slot, ...);

zymbiote_patches[pid] = patches;
Posix.kill ((Posix.pid_t) pid, Posix.Signal.CONT);
```

最终改写的是“函数指针指向哪里”，不是直接改写两个函数的机器码。

### 5.2 载荷位置：藏在 libstagefright.so 的尾页里

**不新建映射，借媒体库最后一页。** `inject_zymbiote()` 扫父进程 maps，找 **已存在的可执行文件映射**，路径以 `/libstagefright.so` 结尾（ `linux-host-session.vala:1712` ）：

```
path 以 /libstagefright.so 结尾 && 可读可执行
  → payload_base = m.end - page_size       # 该映射的最后一页
  → payload_original_protection = 该页原有权限（RX，可写则加 W）
  → payload_file_offset = m.file_offset    # 记录页在 so 文件内的偏移
```

媒体库最后一个可执行 segment 的内容通常不满一整页，页尾剩余字节是无人使用的填充；payload 就直接 pwrite 进这一页，权限沿用该页原有的 RX，maps 里不发生任何变化—— **一个条目都不多**，payload 藏在一个本来就该存在的媒体库映射内部。也因为这一页是文件映射，改写前记录的原值可以直接按 `file_offset` 从磁盘上的 so 文件读回， `ZymbiotePatches` 里登记的正是这些原字节，resume/close 时据此还原。

写入的 payload 本体是预编译 zymbiote 小 ELF 的 **可执行段**： `make_zymbiote_payload()` （ `linux-host-session.vala:1911-2030` ）只截取 text 段，并在段内数据区依次写入 server 的 abstract socket 名、payload 自身的 base/size/原始权限、两个原函数地址。这段 payload 没有经过任何 linker 装载，“重定位”由 server 手工完成：把 12 个 libc 函数地址填进 payload 自带的 API 表—— `mprotect` 、 `strdup` 、 `free` 、 `socket` 、 `connect` 、 `__errno` 、 `getpid` 、 `getppid` 、 `sendmsg` 、 `recv` 、 `close` 、 `raise` （\[13\] 对 Frida 17.6.0 的逐行分析与此一致）。整块载荷只有一两页，不进入任何 so 装载账本；其中 `raise` 用在子进程收到 ACK 之后自暂停（§6.2、§10）。

这个位置的代价：尾页是 file-backed 映射，写入后该页字节与磁盘上的 so 文件 **不再一致**——任何把映射页内容与磁盘 so 比对的完整性校验都能发现尾页被改过。这是该设计最主要的暴露面，具体观察手段在 F06 起的课程展开。

## 6\. spawn 执行：请求启动 App，子进程出生上报

### 6.1 RoboLauncher.spawn()：执行顺序与启动请求

> 源码直达： [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala)

spawn 请求在 §3 的 `HostSession.spawn()` 落地。目标参数是 Android 包名，包名不是普通可执行文件路径， `linux-host-session.vala:338` 因此进入：

```
return yield robo_launcher.spawn (program, options, cancellable);
```

`RoboLauncher.spawn()` （ `linux-host-session.vala:1442-1500` ）的执行顺序：

```
ensure_loaded()
  → 幂等兜底；门控默认已在 server 启动时就位（§4、§5）
get_process_name() → 按 process-name 登记一次 spawn 请求
  → 记下 Promise<pid>，等 zymbiote hello 到来时兑现（6.3）
stop_package()
  → 清掉目标包可能存留的进程
start_package()
  → 发起启动，请求汇入 §0.2 的 ProcessList → Zygote 链
等待 zymbiote hello 上报新生子进程 PID（20 秒超时，linux-host-session.vala:1479）
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

> 源码直达： [helpers/zymbiote.c](https://github.com/frida/frida-core/blob/17.9.1/src/linux/helpers/zymbiote.c)

zygote fork 后，尾页 payload 和被改写的指针槽由子进程继承。 `helpers/zymbiote.c` 中有两个 replacement：

```
frida_zymbiote_replacement_setcontext()   （zymbiote.c:60-75）
frida_zymbiote_replacement_setargv0()     （zymbiote.c:80-112）
```

`setcontext` replacement 先调用原始 `selinux_android_setcontext()` ，再保存 specialize 阶段得到的进程名。它不阻止 SELinux 域切换。两个 replacement 分工不同： **setcontext 负责取名字，setargv0 负责卡时机**。

为什么取名要靠 setcontext？hello 报文要带 process-name，server 靠它匹配 spawn 请求（6.3）。native 侧进程名最早以 C 字符串形式出现在 `selinux_android_setcontext(uid, is_system_server, seinfo, name)` 的 `name` 参数里，specialize 前段就能 `strdup` 一份（ `zymbiote.c:68-72` ）；而 setArgV0 拿到的是 `jstring` ，要变成本地字符串必须走 JNI。payload 首选用 setcontext 存下的副本， `GetStringUTFChars` 只是兜底（ `zymbiote.c:86-90` ）。相应地，setcontext 的调用槽从 `libandroid_runtime.so` 的导入表（GOT）就能定位，比堆扫描稳；代码里找得到才打补丁（ `setcontext_slot == 0` 则跳过），与 setArgV0 的堆扫描槽互为保险。

为什么卡点选在 setArgV0？setcontext 处在 specialize 前段，SELinux 域切换之后还有 uid/gid 设置、capability 清理、fd 关闭等一串步骤；setArgV0 在 specialize 尾声，进程身份已全部就位、App 代码一行未跑。在 setcontext 阻塞会把注入窗口开在一个“身份做了一半”的进程上；在 setArgV0 上报才是既早又完整的窗口。所以 setcontext 只抄名字不打断，setargv0 才连接 server、上报并等待 ACK。

`setargv0` replacement 先调用原始 `android_os_Process_setArgV0()` ，随后（ `zymbiote.c:80-112` ）：

```
连接 server 的 abstract Unix socket
  → 发送 pid + ppid + process-name
  → 阻塞等待 1 字节 ACK（frida_wait_for_permission_to_resume，zymbiote.c:115-185）
```

payload 默认是 RX；保存和清空 `package_name` 时会短暂 `mprotect` 切为 RWX，完成后恢复 `payload_original_protection` （ `zymbiote.c:70-71, 94-99` ）。这段权限窗口是瞬态特征，后续验证要覆盖。

收到 ACK 后（ `revert_now = true` ， `zymbiote.c:182` ），replacement 通过架构相关的 must-tail 跳转自暂停（ `zymbiote.c:105-108, 263-266` ）：

```c
frida_stop_and_return_from_setargv0 (env, clazz, name)
  → FRIDA_TAILCALL_TO_RAISE_SIGSTOP ()
```

调用代码本身位于 payload 中，不能用普通调用——must-tail 直接跳到 libc `raise(SIGSTOP)` ，由 `raise` 按原调用者的返回地址返回（§10）。阻塞点位于应用 Java 入口继续运行之前，server 因而可以在子进程继续启动前拿到准确 PID。

### 6.3 server 匹配进程名，spawn() 返回 PID

> 源码直达： [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala)

server 在 `handle_zymbiote_connection()` （ `linux-host-session.vala:2052-2090` ）收到 hello 后：

1.  把 **父进程** 的 patch 记录转交给这个子进程连接（ `zymbiote_patches[hello.ppid]` ， `linux-host-session.vala:2067` ）——resume 时据此在子进程里还原；
2.  用上报的 `package_name` 直接查 `spawn_requests` 表，命中则兑现登记的 `Promise<pid>` （ `linux-host-session.vala:2072-2077` ）；没有 spawn 请求且未开启 gating 时，立即自动放行连接；
3.  匹配成功后， `Device.spawn()` 返回 PID。

到这里，App 子进程仍停在 zymbiote 的等待点上，业务代码一行未跑；返回的 PID 就是下一步注入完整 agent 的目标。

## 7\. 装载段：向刚出生的子进程注入完整 frida-agent

spawn 返回 PID 的那一刻，子进程正阻塞在 `setArgV0` 之后的 zymbiote 等待点， `Application` 还没加载，Java 入口没跑。客户端此刻要做的，是在放行之前把完整 `frida-agent` 装进这个子进程。这一步用的正是一条标准 attach 装载链；独立 attach 与它的差别在第 11 节对照。

子进程已经被 zymbiote 卡住了，装 agent 为什么还要 ptrace？因为 zymbiote 只是一两页的信标加闸门：它总共只带 `mprotect` 、 `socket` 、 `raise` 等 12 个 libc 函数（§5.2），没有 `mmap` 、没有 `pthread_create` ，也没有任何 ELF 装载能力，装不下、也运不了几百 KB 的 agent。子进程阻塞在 `recv()` 上只说明业务代码还没跑，不说明它受控——server 对它依旧没有写内存和执行代码的权限。把 agent 装进去并启动，仍然要 seize 线程、保存寄存器、远程 `mmap` 、改 PC/SP 执行 bootstrapper 与 loader、恢复寄存器后 detach，这正是 7.3 的 `SeizeSession` 。放行之后 payload 页也会由 server 按记录的原字节还原（§10），zymbiote 从设计上就不承担装载。

### 7.1 spawn 返回 PID 后，立刻对这个 PID 做一次 attach

> 源码直达： [frida-tools/application.py](https://github.com/frida/frida-tools/blob/14.10.4/frida_tools/application.py) · [frida-tools/repl.py](https://github.com/frida/frida-tools/blob/14.10.4/frida_tools/repl.py) · [src/frida.vala](https://github.com/frida/frida-core/blob/17.9.1/src/frida.vala) · [src/host-session-service.vala](https://github.com/frida/frida-core/blob/17.9.1/src/host-session-service.vala)

`frida_tools/application.py:661-671` 直接给出了命令行工具在 spawn 返回后的下一步： `device.spawn()` 返回的 PID 被赋给 `attach_target` ，随后立即调用 `_attach(attach_target)` ；脚本创建加载（ `repl.py:307` 的 `script.load()` ）完成后，CLI 默认自动调用 `_resume()` → `device.resume(spawned_pid)` （ `application.py:496-499, 550-555` ）。

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

设备侧 `host-session-service.vala:583-643` 继续执行：

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

> 源码直达： [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala) · [src/linux/linjector.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linjector.vala)

`linux-host-session.vala:387-403` 明确指定 agent 入口：

```java
string entrypoint = "frida_agent_main";
string parameters = make_agent_parameters (pid, "", options);
AgentFeatures features = CONTROL_CHANNEL;

id = yield linjector.inject_library_resource (
    pid, agent, entrypoint, parameters, features, cancellable);

IOStream stream =
    yield linjector.request_control_channel (id, cancellable);
```

`linjector.vala:84-105` 根据目标 ABI 选择 32/64 位 agent。支持 memfd 时直接取得 agent resource 的 fd，否则使用临时文件路径；随后统一调用 `helper.inject_library()` 。

```
目标 pid
  → 判断 ABI
  → 取得匹配的 frida-agent
  → fd/path 交给 Linux helper
  → 等待 control channel
```

### 7.3 ptrace 只是入口，真正任务是建立远程执行环境

> 源码直达： [src/linux/frida-helper-backend.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/frida-helper-backend.vala)

`frida-helper-backend.vala:300` 的 `inject_library()` 创建 `InjectTask` （`:308` ），进入 `InjectSession.open()` （`:825` ）。其基类 `SeizeSession` （`:1805` ）的 `init_async()` （`:1880` ）完成：

```
PTRACE_SEIZE（旧内核回退 PTRACE_ATTACH）
  → PTRACE_INTERRUPT / 等待 stop
  → GETREGSET 保存寄存器（frida-helper-backend.vala:2084）
  → 获得目标线程的受控执行点
```

进入 ptrace 停止态后，Frida 没有直接把 PC 改到 `frida_agent_main` 。目标地址空间此时还没有 loader、agent、远程栈和控制通道。 `InjectSession.bootstrap()` 在 `frida-helper-backend.vala:1054` 起先建立这些条件：

1.  从目标 maps 定位 libc 和 Android linker；
2.  计算目标进程中的 `mmap` 、 `munmap` 等函数地址；
3.  远程调用 `mmap` 分配 bootstrapper、loader 数据和 64 KiB 工作栈；
4.  若不能直接使用目标 libc 的 `mmap` ，临时借用目标现有代码页执行 bootstrapper，分配完成后还原原字节；
5.  在目标内执行 bootstrapper，解析 libc/linker API，并建立 socketpair 或抽象 Unix socket 回退通道；
6.  把 loader 代码、入口名、agent 参数和函数表写入目标内存（ `frida-helper-backend.vala:885-896` ）。

这一步的输出不是 agent，而是一个可以在目标内部继续装载 agent 的最小运行环境。

### 7.4 loader 从被劫持线程切到自己的工作线程

> 源码直达： [frida-helper-backend.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/frida-helper-backend.vala) · [helpers/loader.c](https://github.com/frida/frida-core/blob/17.9.1/src/linux/helpers/loader.c)

bootstrap 完成后，目标寄存器中的 PC 指向 loader 基址、SP 指向远程栈，受控线程执行 loader 入口。 `helpers/loader.c:61-63` 的 `frida_load()` 立即创建工作线程：

```c
void
frida_load (FridaLoaderContext * ctx)
{
  ctx->libc->pthread_create (&ctx->worker, NULL, frida_main, ctx);
}
```

这样，受 ptrace 控制的原线程只负责启动 loader—— `frida_load()` 的全部工作就是一个 `pthread_create` ，几条指令就返回。loader 一返回， `InjectSession` 立即恢复保存的寄存器并 **detach：ptrace 的使命到此结束**。主线程回到被打断的那一刻——spawn 场景下就是 replacement 里阻塞的 `recv()` （被打断的系统调用由内核自动重启）；注意此刻两个指针槽 **仍处于改写状态**，要等到 resume 时才由 server 还原（§10）。此后 agent 的装载与通信全部由工作线程和 helper 之间的 socketpair 承担，不再有 ptrace。

loader 工作线程随后完成（ `loader.c:100-145` ）：

```
向 helper 发送 HELLO
  → 接收 agent fd
  → dlopen 装载 agent（§8）
  → 接收 agent control fd
  → 发送 READY
  → 等待 ACK
  → 调用 frida_agent_main
```

helper 侧对应状态位于 `frida-helper-backend.vala` 的 `RemoteAgent` 。 `RemoteAgent.start()` 通过 Unix socket 发送 agent fd 和 control fd；收到 loader 的 `READY` 后，helper 才认为注入已同步完成。

“就绪”有两级，不要混作一个信号：loader 的 `READY` 是第一级——fd 交接与装载同步完成，此刻 agent 入口还没调用；第二级在 §9——agent 在 control fd 上注册 `AgentSessionProvider` 成功，server 侧挂着的 `attach()` 才由此返回。两级用的都是注入时传进来的 fd，agent 不另建连接。

## 8\. agent 装载：/proc/self/fd + dlopen

> 源码直达： [helpers/loader.c](https://github.com/frida/frida-core/blob/17.9.1/src/linux/helpers/loader.c)

loader 工作线程收到 agent fd 后的核心三步（ `loader.c:107-137` ）：

```c
libc->sprintf (agent_path, "/proc/self/fd/%d", agent_codefd);
ctx->agent_handle = libc->dlopen (agent_path, libc->dlopen_flags, pretend_caller_addr);
ctx->agent_entrypoint_impl = libc->dlsym (ctx->agent_handle, ctx->agent_entrypoint, pretend_caller_addr);
```

即：

```
接收 agent fd
  → 拼出 /proc/self/fd/<fd>
  → bionic dlopen()
  → dlsym("frida_agent_main")
  → 调用入口
```

这会让 bionic linker 参与装载，并建立 `soinfo` 、namespace、 `link_map` 、模块计数和 CFI 等账本——agent 会出现在 linker 的模块账本里。这是它和 zymbiote（不进任何账本）的重要区别，也是检测侧的一条经典观察面（F06 起展开）。

## 9\. frida_agent_main 之后发生什么

> 源码直达： [lib/agent/agent.vala](https://github.com/frida/frida-core/blob/17.9.1/lib/agent/agent.vala)

`lib/agent/agent.vala:2-7` 的入口只负责创建或恢复 `Runner` ：

```
if (Runner.shared_instance == null)
    Runner.create_and_run (...);
else
    Runner.resume_after_transition (...);
```

`frida_agent_main` 不会在 loader 的工作线程上久留： `Runner.create_and_run()` （ `agent.vala:116` ）把主循环放到自己新建的线程（ `agent.vala:346-352` 的 `frida-eternal-agent` 线程）上运行，入口随即返回；loader 工作线程做完收尾（ `loader.c:150-186` ）就退出。此后进程里承载 agent 的是这条独立线程，与 App 线程并行。

首次进入时， `agent.vala:116-135` 依次完成：

```
Environment._init()
  → detect_own_range_and_path()：自定位 agent 内存范围
  → Gum.Cloak.add_range()：Cloak 该范围
  → 处理 control fd
  → 创建 Runner、建立主循环和 DBus connection
```

agent 与 server 的会话在 control stream 上建立： `agent.vala:816-845` 一带把 `AgentSession` 等对象注册到 DBus connection；server 取得 provider 后，再调用 `open()` 创建具体 `AgentSession` 。

状态边界如下：

| 状态  | 已经完成 | 尚未完成 |
| --- | --- | --- |
| helper 获得 inject id | 注入任务已登记 | agent 初始化 |
| loader 发出 `READY` | loader 与 agent fd 交接完成 | `AgentSessionProvider` 注册 |
| provider proxy 可用 | agent 控制面成立 | 具体 session |
| `provider.open()` 返回 | `AgentSession` 成立 | JS 顶层代码 |
| `create_script()` 返回 | 脚本对象和引擎实例已创建 | 脚本执行 |
| `load_script()` 返回 | 顶层 JS 已投递并执行 | Java App ClassLoader 必然可用 |

因此“agent 已装载”“ `frida_agent_main` 已调用”和“脚本第一行已执行”是三个不同事实。

## 10\. resume 放行：归还控制权，App 继续启动

> 源码直达： [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala) · [helpers/zymbiote.c](https://github.com/frida/frida-core/blob/17.9.1/src/linux/helpers/zymbiote.c)

先明确触发条件： **ACK 不会因为 agent 就绪而自动发出**。子进程一直卡在 `recv()` ，直到客户端调用 `Device.resume(pid)` ——frida CLI 默认在脚本加载完成后自动调用；用 Python API 时忘了调用，App 就永远停在等待点上。

`LinuxHostSession.perform_resume()` （ `linux-host-session.vala:364-369` ）优先交给 `robo_launcher.try_resume()` ，最终走到 `ZymbioteConnection.resume()` （ `linux-host-session.vala:2173-2195` ）：

```
uint8 ack[1] = { 0x42 };
yield connection.get_output_stream ().write_async (ack, priority, cancellable);

uint8 bye[1];
yield input.read_async (bye, priority, cancellable);

yield wait_until_stopped (hello.pid, cancellable);

if (patches_to_revert != null)
    patches_to_revert.revert (open_process_memory (hello.pid));

Posix.kill ((Posix.pid_t) hello.pid, Posix.Signal.CONT);
```

1.  向子进程发送 1 字节 ACK；
2.  子进程的 `recv` 返回、连接关闭（server 读到 bye）；
3.  子进程按 §6.2 的 must-tail 自 `raise(SIGSTOP)` ， `wait_until_stopped()` 等它停稳；
4.  `revert` 在子进程里还原一切改写：两个指针槽 + 尾页 payload 的原字节（原值在注入时记录，见 §5.1）；
5.  `SIGCONT` 放行。

放行之后，控制流从哪里回到 App？ `raise(SIGSTOP)` 被唤醒后按原返回地址返回——这个返回地址就是 Java 侧 `Process.setArgV0` 的调用点。控制流由此接回 Android 启动链（§0.3）：

```
ACK → recv 返回
  → payload 自暂停（raise SIGSTOP），等 server 还原后 SIGCONT
  → raise 按原返回地址返回到 Java 调用点
  → handleChildProc 里的 Process.setArgV0 调用点
  → ZygoteInit.zygoteInit → RuntimeInit.applicationInit
  → findStaticMain("android.app.ActivityThread")
  → ActivityThread.main() → Application / Activity 生命周期
```

另一边，agent 不需要“回到”App 流程： `frida_agent_main` 运行在 `frida-eternal-agent` 线程上，进入自己的主循环（§9），从此与 App 线程并行。App 主线程在注入期间只是被 ptrace 借去启动了 loader，寄存器恢复、detach 后仍回到阻塞的 `recv` （§7.4）；脚本 hook 的 App 函数，要等 App 真正跑到那里，才被 Interceptor 的 inline hook 接住。

一句话：zymbiote 只借一个等待点，ptrace 只借主线程几毫秒，agent 活在自己的线程里，最后由客户端 `resume()` 触发的 ACK + 还原 + `SIGCONT` 把 App 放回 Android 启动链——全程没有谁长期占用 App 的执行流。

最后把整条链完整走一遍：App 子进程在 `setArgV0` 的 replacement 里阻塞等 ACK 时，server 已经用 ptrace 借它的主线程跑完了 bootstrapper 和 loader——loader 入口只做一件事， `pthread_create` 出工作线程后立即返回，于是寄存器恢复、ptrace detach，主线程回到阻塞的 `recv()` 继续等；工作线程收下 agent fd、拼出 `/proc/self/fd/<fd>` 交给 `dlopen` 装载完整 agent、向 helper 发 `READY` ，再调用 `frida_agent_main` ——agent 入口把主循环放到自己新建的 `frida-eternal-agent` 线程上随即返回，loader 工作线程收尾退出；agent 在注入时传进来的 control fd 上与 server 建立 DBus 连接并注册 `AgentSessionProvider` ，server 侧挂着的 `attach()` 由此返回，客户端随后创建并加载脚本；最后客户端调用 `resume()` ，server 发出 ACK、等子进程 `raise(SIGSTOP)` 停稳、还原两个指针槽与尾页原字节、 `SIGCONT` —— `raise` 按原返回地址返回 Java 调用点，App 从这里继续走 `ActivityThread.main()` ，agent 与它并行运行。

父 zygote 中的 payload 和指针改写继续保留，用于门控下一次 fork；关闭 RoboLauncher 时，server 才暂停父进程、按记录还原（ `linux-host-session.vala:1386-1418` ）。

Chrome 子 zygote 是特例：它本身还要继续 fork renderer。server 将父级 patch 记录转交给 Chrome zygote，不放行；门控能力继续由这个二级 zygote 继承。

## 11\. 收尾一提：独立的 attach 已运行进程

本课主线是 spawn。如果不需要“早于业务代码”，也可以省掉整个门控段，直接对已运行进程执行：

```bash
frida -U -n TARGET_NAME   # 按进程名；或 -p PID
```

此时走的就是第 7 节拆过的那条装载链，一个环节都不少：

```
attach(pid)
  → HostSession.attach → Linjector → LinuxHelperBackend
  → ptrace → bootstrapper → loader → dlopen → frida-agent
  → AgentSession → create_script / load_script
```

与 spawn 只有两点不同：

1.  前面没有 zymbiote 门控段，也就没有第 4–6 节的出生拦截；
2.  时机晚：目标进程早已跑完 specialize、 `Application.onCreate` 等早期初始化，脚本只能从 attach 时刻开始观察；也没有第 10 节的 ACK 放行点，注入完成即继续运行。

所以独立 attach 是第 7 节那条装载链的单独使用；要 hook `Application.onCreate` 、早期 native 初始化或反调试逻辑，必须用 `-f` 走完整 spawn。

## 12\. 两条路径的时序对照

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
  → ptrace/bootstrap/loader/dlopen 注入完整 agent
  → create/load script
  → resume(child pid)
  → ACK → child raise(SIGSTOP)
  → server 还原指针槽与尾页原字节
  → SIGCONT
  → raise 返回 Java 调用点 → ActivityThread.main → App 生命周期
```

### attach 已运行进程（对照）

```
目标已运行
  → attach(pid)
  → ptrace seize/interruption
  → 远程 mmap bootstrap 区和栈
  → 执行 bootstrapper
  → 写入并启动 loader
  → loader 创建工作线程
  → dlopen 装载 frida-agent
  → frida_agent_main
  → AgentSessionProvider / AgentSession
  → 脚本 create/load
```

## 13\. 故障定位

按 spawn 主线从前往后排查，装载段的问题最后查。

| 表象  | 最先检查的状态 | 对应源码 |
| --- | --- | --- |
| `-f` 等不到 PID | zygote/USAP 是否处理、函数槽定位、hello socket | `linux-host-session.vala:1517-1650, 2036-2090` |
| server 重启后 zygote 注入异常 | 父进程是否已被打过补丁、磁盘 so 原字节恢复 | `linux-host-session.vala:1614-1626, 1386-1418` |
| Chrome renderer 未门控 | Chrome zygote 的二级继承状态 | `linux-host-session.vala:2052-2090` |
| 子进程拿到 PID 后不继续 | 客户端是否 resume、ACK 是否发出、SIGCONT 是否送达 | `linux-host-session.vala:2173-2195` 、 `zymbiote.c:115-185` |
| 子进程尾页未还原 | revert 是否执行、原字节记录是否完整 | `linux-host-session.vala:2111-2120` |
| 能枚举进程，attach 失败 | ptrace 权限、目标 ABI、 `InjectSession.open()` | `frida-helper-backend.vala:300-330, 1805-1980` |
| attach 卡在 loader | bootstrap、remote mmap、loader `HELLO/READY` | `frida-helper-backend.vala:825-1050` 、 `loader.c:61-145` |
| dlopen 装载失败 | agent fd 是否收到、 `/proc/self/fd` 路径、linker 拒载 | `loader.c:107-137` |
| agent 已装载但 session 失败 | control fd、DBus、session 注册 | `agent.vala:816-845` |

## 14\. 源码复核

按 17.9.1 检出源码后可直接执行：

```bash
git clone --depth 1 --branch 17.9.1 https://github.com/frida/frida-core
cd frida-core

rg -n "public async uint spawn|public async Session attach" src/frida.vala

rg -n "perform_attach_to|inject_library_resource|request_control_channel" \
  src/linux/linux-host-session.vala src/linux/linjector.vala

rg -n "class InjectTask|class InjectSession|bootstrap \(|class SeizeSession|GETREGSET" \
  src/linux/frida-helper-backend.vala

rg -n "ensure_loaded|inject_zymbiote|libstagefright|make_zymbiote_payload|handle_zymbiote_connection" \
  src/linux/linux-host-session.vala

rg -n "replacement_setcontext|replacement_setargv0|TAILCALL_TO_RAISE_SIGSTOP" \
  src/linux/helpers/zymbiote.c

rg -n "frida_load|dlopen|dlsym|frida_agent_main" \
  src/linux/helpers/loader.c

rg -n "create_and_run|Environment._init|frida-eternal-agent|register_object" \
  lib/agent/agent.vala
```

复核结果应能组成四条连续证据链：

```
preload → ensure_loaded → zymbiote 注入 zygote
spawn API → RoboLauncher → zymbiote hello → child pid
attach API → Linjector → InjectSession(SeizeSession) → loader → dlopen → frida_agent_main
agent → AgentSessionProvider → AgentSession
```

## 15\. 必须能回答的问题

1.  **Frida 是否把完整 agent 注入 zygote？**  
    否。zygote 中是 `zymbiote` 门控载荷；完整 agent 在目标子进程 PID 确定后通过普通 attach 注入。zymbiote 默认在 frida-server 启动时经 preload 注入父进程（§3、§4），不是等 spawn 才做。
    
2.  **`-f` 为什么能早于 App 业务代码？**  
    子进程在 specialize/进程命名阶段通过 zymbiote 上报并阻塞，server 在放行前完成 agent 注入与脚本加载。
    
3.  **spawn 返回 PID 之后、resume 之前发生了什么？**  
    客户端立刻对这个 PID 做一次 attach：ptrace → bootstrapper → loader → `dlopen` 装载完整 agent → 建立 AgentSession → 创建并加载脚本。
    
4.  **resume 如何清场？**  
    ACK → 子进程 `raise(SIGSTOP)` 自暂停 → server 按注入时记录的原值还原两个指针槽与尾页 payload 字节 → `SIGCONT` ；父 zygote 中的门控保留到 server 关闭。
    
5.  **独立的 attach 和 spawn 是什么关系？**  
    同一条装载链的单独使用：没有门控段、时机晚于 App 早期初始化，也没有 ACK 放行点。
    
6.  **普通 attach 为什么需要 ptrace？**  
    ptrace 提供暂停、寄存器读写和受控远程执行入口；真正装载还依赖 bootstrapper、远程内存、loader、fd 传递与控制通道。
    
7.  **zymbiote 放在哪里？为什么选那里？**  
    `libstagefright.so` 可执行映射的最后一页填充区：不开新映射、maps 条目不变；代价是尾页字节与磁盘 so 不一致，成为完整性校验的观察面（§5.2）。
    

## 参考文献

1.  Frida 17.9.1 — [server/server.vala](https://github.com/frida/frida-core/blob/17.9.1/server/server.vala) （ `enable_preload` 默认 true、 `-P` 开关、 `run_application` ）
2.  Frida 17.9.1 — [src/control-service.vala](https://github.com/frida/frida-core/blob/17.9.1/src/control-service.vala) （`:127` preload 触发、`:915-931` spawn/attach 转发、`:1134` enable_preload）
3.  Frida 17.9.1 — [src/frida.vala](https://github.com/frida/frida-core/blob/17.9.1/src/frida.vala) （`:994` `Device.spawn` 、`:1138` `Device.attach` ）
4.  Frida 17.9.1 — [src/host-session-service.vala](https://github.com/frida/frida-core/blob/17.9.1/src/host-session-service.vala) （`:583-643` `establish` → `perform_attach_to` ）
5.  Frida 17.9.1 — [src/linux/linux-host-session.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linux-host-session.vala) （preload/spawn/ensure_loaded/inject_zymbiote/libstagefright/make_zymbiote_payload/hello 匹配/resume/close）
6.  Frida 17.9.1 — [src/linux/linjector.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/linjector.vala) （`:84-105` ABI 选择与 `inject_library_resource` ）
7.  Frida 17.9.1 — [src/linux/frida-helper-backend.vala](https://github.com/frida/frida-core/blob/17.9.1/src/linux/frida-helper-backend.vala) （`:300` inject_library、`:825` InjectSession、`:1054` bootstrap、`:1805` SeizeSession、`:2084` GETREGSET）
8.  Frida 17.9.1 — [src/linux/helpers/loader.c](https://github.com/frida/frida-core/blob/17.9.1/src/linux/helpers/loader.c) （`:61-63` frida_load、`:107-137` `/proc/self/fd` + dlopen/dlsym、`:150-186` 收尾）
9.  Frida 17.9.1 — [src/linux/helpers/zymbiote.c](https://github.com/frida/frida-core/blob/17.9.1/src/linux/helpers/zymbiote.c) （`:60-112` 两个 replacement、`:115-185` 等待 ACK、`:263-266` 自暂停尾跳）
10.  Frida 17.9.1 — [lib/agent/agent.vala](https://github.com/frida/frida-core/blob/17.9.1/lib/agent/agent.vala) （`:2-7` 入口、`:116-135` 初始化与 Cloak、`:346-352` `frida-eternal-agent` 线程、`:816-845` session 注册）
11.  frida-tools 14.10.4 — [frida_tools/application.py](https://github.com/frida/frida-tools/blob/14.10.4/frida_tools/application.py) （`:661-671` spawn→attach、`:550-555` 自动 resume）； [frida_tools/repl.py](https://github.com/frida/frida-tools/blob/14.10.4/frida_tools/repl.py) （`:307` `script.load()` ）
12.  Frida 官方文档 — Modes of Operation. <https://frida.re/docs/modes/>
13.  看雪论坛 · Yangser —《新版 Frida Zymbiote 注入机制解析》（Frida 17.6.0：zygote 侧 `/proc/<pid>/mem` 远程读写、 `libstagefright.so` 尾页载荷、server 手工重定位 API 表、子进程上报后自暂停、gadget 由外部 ptrace 注入；17.9.1 的 replacement 已不在入口处自还原槽位，改由 server 在 resume 时统一还原）. <https://bbs.kanxue.com/thread-289866.htm>
14.  Android Code Search — Launcher3 `ItemClickHandler.java` （桌面图标点击进入 `startActivitySafely` ）. <https://cs.android.com/android/platform/superproject/main/+/main:packages/apps/Launcher3/src/com/android/launcher3/touch/ItemClickHandler.java>
15.  Android Code Search — `ActivityTaskManagerService.java` 与 `ActivityStarter.java` （Activity 启动请求在 `system_server` 中的解析与执行）. <https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/services/core/java/com/android/server/wm/ActivityTaskManagerService.java>；<https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/services/core/java/com/android/server/wm/ActivityStarter.java>
16.  Android Code Search — `ProcessList.java` （ `startProcessLocked()` 、 `entryPoint = "android.app.ActivityThread"` 与进程创建参数）. <https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/services/core/java/com/android/server/am/ProcessList.java>
17.  Android Code Search — `Process.java` 与 `ZygoteProcess.java` （ `Process.start()` 、 `startViaZygote()` 、Zygote socket 协议与 USAP 路径）. <https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/os/Process.java>；<https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/os/ZygoteProcess.java>
18.  Android Code Search — `ZygoteServer.java` 与 `ZygoteConnection.java` （ `runSelectLoop()` 、对端身份检查、 `processCommand()` 与父子分流）. <https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/ZygoteServer.java>；<https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/ZygoteConnection.java>
19.  Android Code Search — `Zygote.java` 与 `com_android_internal_os_Zygote.cpp` （ `forkAndSpecialize()` 、 `nativeForkAndSpecialize()` 、 `ForkCommon()` 与 `SpecializeCommon()` ）. <https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/Zygote.java>；<https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/jni/com_android_internal_os_Zygote.cpp>
20.  Android Code Search — `ZygoteInit.java` 、 `RuntimeInit.java` 与 `ActivityThread.java` （子进程从 `handleChildProc()` 进入 `ActivityThread.main()` ）. <https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/ZygoteInit.java>；<https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/internal/os/RuntimeInit.java>；<https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/com/android/app/ActivityThread.java>
