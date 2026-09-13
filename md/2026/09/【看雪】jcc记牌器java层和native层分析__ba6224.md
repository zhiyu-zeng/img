---
title: 【看雪】jcc记牌器java层和native层分析
source: https://bbs.kanxue.com/thread-292938.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-13T22:09:13+08:00
trace_id: 9948b5d7-a63b-4ca6-b76e-59feaa238ecd
content_hash: ee58042e927334be43dfd0eaf8cd77ba6041577a0a5eeb4bcf9b5565d3a8dd87
status: synced
tags:
  - 看雪
  - Android逆向
  - 游戏安全
series: null
feed_source: 看雪·Android安全
ai_summary: 伪装成系统包的《金铲铲之战》记牌器，采用悬浮窗 App + 注入游戏进程 native 的双端结构，Java 管 UI/root/IPC，native 做 hook 与随机性推断。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3da75244-d011-8154-b4d9-f19c30a910ca
ioc:
  cves: []
  cwes: []
  hashes:
    - 0df71b48c2daf299f2fb82e78cd8adb63dfcc88d43d854b1d561bb34a38e70d0
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 伪装成系统包的《金铲铲之战》记牌器，采用悬浮窗 App + 注入游戏进程 native 的双端结构，Java 管 UI/root/IPC，native 做 hook 与随机性推断。
> 
> - **双端结构：** App 端包名伪装成 `com.android.support`，负责悬浮窗、root 工具链、授权与诊断上报；`libdemo.so` 注入游戏进程，负责 IL2CPP hook、商店/海克斯/对手预测等算法。
> - **注入链路：** 经 su 探测、`setenforce 0`、`chcon` 对齐 SELinux context、`nsenter --mount=/proc/1/ns/mnt` 逃逸 mount namespace，把 `libinject.so`/`libdemo.so` 写入游戏 data dir；注入器实为 AndKittyInjector（PTRACE_ATTACH + memfd_create/dlopen_ext）。
> - **IPC v2：** 两端仅通过抽象 Unix socket `xf_game_control_v2` 通信，UTF-8 JSON + 4 字节大端长度前缀分帧，HMAC-SHA256 挑战/应答；native 为 client、App 为 server，Token 经游戏 data dir 下 bootstrap 文件交接。
> - **共享内存：** 唯一真实共享内存是 256 KiB 诊断页，经 SCM_RIGHTS 传 fd；native 主动推送 `updatePlayers`/`updateMatchup` 等状态帧，App 侧无内存扫描代码，旧 `SharedMemManager` 数据面已桩化。
> - **信任与算法边界：** 信任根密钥、签名验签全在 `libdemo.so`，Java 只持公钥；随机性推断均在 native，Java 只做羁绊计算、阵容评分与百分比文案换算。

包名 `com.android.support` 是刻意选择的伪装：真 AndroidX/Support 库的包名是 `android.support.*` 和 `androidx.*` ，而本样本自研代码全部放在 `com.android.support.*` 下，在进程列表和包列表里看起来像系统组件。 `AndroidManifest.xml` 里 `<queries>` 只声明了一个包： `com.脱敏.jkchess` （《金铲铲之战》）。

这是整个样本最核心的结构判断： **它不是单一进程的应用，而是「悬浮窗 App + 注入游戏进程的 native 运行时」的双端结构。**

两端的分工决定了后面所有分析：

`com.android.support.IntroFeatureCatalog` 是作者写在引导页里的功能介绍，等于一份官方功能表。按原文章节整理如下。

**自动拿牌**

**牌库与商店**

**指定功能**

**玩家与预警**

**语音播报**：云端模型女声（ `CloudTtsClient` ）、本地音效（语速/音量/音调滑块）、三星预警语音播报。

**热键与快捷**：模拟器快捷键（F1 显隐悬浮窗、F2 自动拿牌、F3 屏幕牌库，支持 F1F12 与 AZ 自定义，经无障碍服务绑定）、屏幕常驻快捷按钮。

## Java层结构与注入入口

**单机工具**

2280 个自研类，按包分布（前 20）：

几个体量突出的文件： `FloatingWindowService.java` 1.52 MB（近乎单文件承载了整个 UI 与业务编排）、 `MainActivity.java` 251 KB（root/注入）、 `WigVerify.java` 166 KB、 `SharedMemManager.java` 143 KB、 `NativeTrustBridge.java` 113 KB。

入口是 `MainActivity.startInjection()` （ `MainActivity.java:1249` ），它起一个名为 `Jcc-Injection` 的线程执行 `runInjectionScript(attempt, lease)` （ `MainActivity.java:2505` ），流程为：

所有 shell 命令统一走 `execCommand(str)` → `execCommandDetailed(str, timeout)` → `execCommandWithPrefix(getSuPrefix(), str, timeout)` （ `MainActivity.java:3224-3291` ）。默认超时 35s（ `MainActivity.java:3259` ），注入那一调用是 120s（ `MainActivity.java:2077` ）。

**候选路径** 由 `SuBinaryPathPolicy` （ `SuBinaryPathPolicy.java` ）集中定义：

**探测与提权** 分三步：

**su 前缀（命令拼装方式）** `getSuPrefix()` （ `MainActivity.java:3156-3181` ）：按顺序试三组 mount-master 前缀，再试普通前缀，都不行则返回 `null` （管道模式）：

判定方式是 `suPrefixWorks()` （ `MainActivity.java:3184-3214` ）：把前缀拼上 `echo ok` 执行，5 秒内读回 `ok` 就算通。

`adoptSuPrefix(String[])` （ `MainActivity.java:3216-3222` ）从两处被调用，作用是 **把探测成功的那组前缀固化**：

## SELinux 三层处理

`FloatingWindowService.onCreate()` （ `FloatingWindowService.java:1637` ）会把同一份配置同步给 `ShellExec` ：

代码里有三层，只有第二层是"硬要求"：

**第一层：全局关 SELinux（尽力而为）。** 真机注入命令里前后各夹一次 `setenforce 0` ，模拟器分支不做（ `MainActivity.java:2077` ）：

`runInjectionScript` 的环境准备 lambda 里，非模拟器还会把 `setenforce 0` 和 `setprop` 串在一起执行（ `MainActivity.java:2688-2694` ）。注意全部带 `2>/dev/null` / `|| true` ， **失败不阻断**——很多设备上 `setenforce` 已被 SELinux 策略或 Magisk 拦住。

**第二层：把 so 的 SELinux context 改成目标目录的 context（真正依赖的机制）。** `applyTargetDataContext(dataDir, libdemoPath, libinjectPath)` （ `MainActivity.java:2482-2492` ）生成一段 shell：

要求 context 形如 `u:object_r:...`，逐个 `chcon` 后 **回读校验**，不一致就整体失败。 `prepareInjectionFiles` 靠这个返回值决定是否 `showErrorAndExit` （ `MainActivity.java:2474-2477` ）。

**第三层：IPC 引导文件也走同一套。** `stageInjectionBootstrap()` （ `MainActivity.java:2333-2337` ）：

即 `cp` 到 `.tmp.<mypid>` → `chown` 成目标目录 owner → `chmod 600` → `chcon` → 原子 `mv` ，最后校验权限/属主/context 全部一致，输出 `__IPC_BOOTSTRAP_READY__` 。

**问题背景**：Magisk/KernelSU 的 `su` 默认在自己的 mount namespace 里，root shell `ls /data/data/com.脱敏.jkchess` 会看不到（namespace 隔离）。代码用「探测 + 逃逸」两步解决。

**探测**： `GameDataLocation.buildProbeCommand(pid, pkg, selfDataDir, nativeLibDir)` （ `GameDataLocation.java:77-85` ）拼出一条很长的 shell，逻辑是：

用 `stat -c %u /proc/PID` （失败退到 `/proc/PID/status` 的 `Uid:` 字段）拿游戏 uid， `GUSER = uid / 100000` 得到 Android userId。

候选目录： `/data/user/$GUSER/$PKG` 、 `/data/user_de/$GUSER/$PKG` ， `GUSER==0` 时追加 `/data/data/$PKG` ；另外还会 glob `/mnt/expand/*/user/$GUSER/$PKG` （对应 `EXPANDED_DIR_PATTERN` ， `GameDataLocation.java:28` ）。

对 **三个视图** 各扫一遍：

每个视图输出 `dir=` （命中的候选目录）、 `self=` （能否看到本应用 dataDir）、 `lib=` （能否看到本应用 nativeLibraryDir）、 `hop=` （用 `nsenter --mount=$NSF -- sh -c 'echo hopok'` 实测能否进入该 namespace，输出 `ok` / `fail` / `na` ）。

**决策**： `GameDataLocation.decide(result, pkg)` （ `GameDataLocation.java:312-333` ）优先级为

`validated()` （ `GameDataLocation.java:335-343` ）会额外把不属于本包候选目录的 `dir` 清成 null，防止跨包误判。

**应用**： `applyRootMountNamespace(decision)` （ `MainActivity.java:2428-2444` ）：

也就是：只有 `Escape.INIT_NAMESPACE` 才设 `rootMountNamespaceFile` ，并 **再验证一次** 套用后确实能看到 dataDir，看不到就回退。回退时 `resolveGameDataDir` 会把 decision 换成 `GameDataLocation.escapeRejected(...)` （ `MainActivity.java:2377-2379` ），code = `escape_rejected` ，给用户的文案是：

已拿到高级权限，但权限会话看不到游戏数据目录（挂载空间被隔离）。请在 Magisk/KernelSU/APatch 里给记牌器开启"全局挂载命名空间(Mount Master)"，或把 su 改回默认路径后重试。

**落地到每条命令**： `wrapWithRootMountNamespace(str)` （ `MainActivity.java:3266-3269` ）：

`execCommandWithPrefix()` 在拼命令前先调它（ `MainActivity.java:3300` ），所以一旦逃逸成功，后续 **所有** su 命令都自动套上 `nsenter --mount=/proc/1/ns/mnt` 。

## Mount命名空间逃逸动机

**为什么要这么做**：注入需要把 `libdemo.so` / `libinject.so` 写进游戏 data dir（私有目录，只有 root 能写），而能不能看到这个目录直接取决于 root shell 所在的 mount namespace。 `/data/user/0/...` 与 `/data/data/...` 是同一个 inode 的不同挂载视图，namespace 错了就"看得见路径、看不见内容"或干脆不存在——这正是 `self` / `lib` / `hop` 三个布尔要区分的东西。

（ `MainActivity.java:91-94` ）运行时库由 `NativeLibrarySelector` 选择：主 ABI 含 `x86` 或用户勾了兼容模式 → `libdemo_compat.so` ，否则 `libdemo.so` （ `NativeLibrarySelector.java:13-30` ）。注入器同理：模拟器用 `libinject_x86_64.so` （ `MainActivity.java:2584` ）。

要点：

即最终形态为：

模拟器分支则是 `-delay 3000000` （微秒 = 3 秒，对应常量 `EMULATOR_NATIVE_BRIDGE_DELAY_MICROS = 3000000` ， `MainActivity.java:80` ），并且不 `setenforce` ，改用 30 秒 `kill -0` 轮询 + 超时 `kill -9` 。

真机分支在 `wait` 之后还会做目标身份校验并恢复目标进程：

`libinject.so` 的身份，从 strings 可以确认是 **AndKittyInjector**：

即实现是： `PTRACE_ATTACH` → 远程 `memfd_create` + `dlopen_ext` 载入 payload → 调 `JNI_OnLoad` → 验证 `TracerPid` 归零后 `PTRACE_DETACH` （ `inject_lib: Detach verified (TracerPid stable at zero).`）。 `libinject_x86_64.so` 多了一条 NativeBridge 路径（ `emuInject: Using NativeBridge namespace` 、 `NativeBridgeGetTrampoline` 、 `libnativebridge.so` ），用于 x86 模拟器上把 arm64 payload 通过 NativeBridge 塞进去。 **注意**：Java 侧只传 `-pkg/-lib/-pid/-dl_memfd/-delay` ， `-hide_maps` / `-hide_solist` **没有被使用** （ `MainActivity.java` 全文无匹配）。

多层交叉验证，任一环节失败都会 `failInject(消息)` （ `MainActivity.java:2307-2310` ）并写 `runtimeRecord` ：

与此对应的"已注入"快速通道是 `isAlreadyInjected(pid)` （ `MainActivity.java:1504-1530` ）： `grep -qE 'libdemo\.so' /proc/PID/maps` + `libil2cpp.so` 已加载 + `SharedMemManager.isCppConnected()` + 重连提示，由 `InjectionReconnectPolicy` 的四个布尔策略函数决定是复用/等待认证/阻断重复注入（ `InjectionReconnectPolicy.java:5-32` ）。判定"payload 线程活着"用的是 `hasLiveIpcPayloadThreads()` （ `MainActivity.java:1581-1587` ）： `grep -qx 'IPC-V2-Recv' /proc/PID/task/*/comm` 。

**失败诊断** `logInjectFailureDiagnostics()` （ `MainActivity.java:3499` 起）会在注入失败时收集： `id; getenforce; /proc/sys/kernel/yama/ptrace_scope` 、 `/proc/PID/status` （含 `Seccomp` / `NoNewPrivs` / `TracerPid` ）、 `/proc/PID/attr/current` 、 `getprop` （ `ro.product.cpu.abi` / `abilist` 、 `ro.dalvik.vm.native.bridge` 、 `ro.kernel.qemu` ）、 `/proc/PID/cmdline` + `readlink exe` 、maps 里 `libhoudini|libndk_translation|libnativebridge|libil2cpp|libunity|libdemo|libinject|/memfd:`、同包所有 pid 的 State/TracerPid、 `ls -lZ` 两个 so 的 SELinux label、以及 `dmesg | grep -i -E 'avc:|denied|ptrace|xptrace' | tail -n 20` 。

`FloatingWindowWatchdog.java` 全文就是一个 AlarmManager 自唤醒看门狗：

关键点是它 **不会盲目复活**：只有 `FloatingServiceState.wasRunning == true` （SharedPreferences `FloatingWindowConfig/service_was_running` ， `FloatingServiceState.java` ）时才拉起。用户主动退出时会 `clearServiceWasRunning()` + `FloatingWindowWatchdog.cancel()` （ `FloatingWindowService.java:4546-4551` ，强制更新退出路径）。

`ServiceDestroyWatchdogPolicy.shouldAccelerateResurrect(boolean)` 就是 `return z;`（ `ServiceDestroyWatchdogPolicy.java:5-7` ），即等价于"服务本该在跑"。

`FloatingWindowService.onCreate()` （ `FloatingWindowService.java:1621` ）开头：

即：系统自动重建（既非主动启动、也没有"上次在跑"的记录）时立刻自杀，避免出现无 IPC 连接的空壳服务。 `onCreate` 成功后才 `markServiceWasRunning(this)` （ `FloatingWindowService.java:1660` 、 `1881` 、 `1994` 、 `2209` 四处）并启动看门狗 `FloatingWindowWatchdog.scheduleNext(this)` （ `FloatingWindowService.java:1891` 、 `2004` 、 `2220` ）； `onCreate` 异常则 `clearServiceWasRunning` + `Watchdog.cancel` + `stopSelf` （ `FloatingWindowService.java:2227-2236` ）。

`RootHelperManager` （ `RootHelperManager.java` ）在服务 `onCreate` 成功后被启动（ `FloatingWindowService.java:1884-1893` ）。 `startInternal()` 做四件事：

调用点在 `updateRootStatus(true)` 里（ `MainActivity.java:1436` ），即每次确认 root 授权后触发一次； `AtomicBoolean automaticRecoveryStarted` 保证只跑一次（ `MainActivity.java:1601-1612` ）。

`attemptAutomaticRuntimeRecovery` 线程体（ `MainActivity.java:1614-1643` ）：

`shouldAutoRecoverRuntime(pid, libsLoaded, reconnectHint)` = `pid > 0 && libsLoaded && reconnectHint` （ `InjectionReconnectPolicy.java:5-7` ）——必须"同一个进程（starttime 指纹一致）+ 核心库已加载 + 之前注入过"三条同时成立。

## 自动恢复与重复注入闸门

`abandonAutomaticRuntimeRecovery` （ `MainActivity.java:1657-1675` ）只是 `isInjecting = false` + 把 UI 阶段退回 `READY` ， **不报错、不弹窗**，这是刻意的静默降级。

与之配套的"禁止二次注入"闸门在 `runInjectionScript` 里（ `MainActivity.java:2566-2577` ）： `shouldBlockDuplicateInjection(pid, coreLoaded, cppConnected, reconnectHint)` 为真时提示用户完全关闭并重启《金铲铲之战》，理由是「同一局内重复注入无法重挂 hook」。

`handleReconnect(pid, attempt)` （ `MainActivity.java:2819` ）走的是纯 IPC 重连路径（ `initSharedMemory` + 起悬浮窗 + 验证），不再调注入器。

唯一实现是 `MainActivity.isEmulator()` （ `MainActivity.java:1444-1479` ），结果缓存在 `cachedIsEmulator` ，四重判据依次短路：

**检测到之后做什么** （都是"走另一条更保守的分支"，不是拒绝运行）：

另外 `libdemo.so` 的 strings 里也出现了 `/dev/socket/qemu` ，说明 **native payload 自己也做了一套模拟器判定** （Java 侧只读到了路径字符串，具体分支未反编译）。

App 与注入 native 之间 **只有一条真正承载业务的通道**：一条名为 `xf_game_control_v2` 的 **Linux 抽象命名空间 Unix domain socket** （Android `LocalServerSocket` ），协议代号 **IPC v2**，全部消息是 **UTF-8 JSON**，用 **4 字节大端长度前缀** 分帧。会话建立时用 HMAC-SHA256 挑战/应答做双向鉴权，Token 通过 **文件引导通道** （把 `ipc_v2_bootstrap.json` 写进游戏进程的数据目录）交接。另有一条 **独立的诊断共享内存页** （262144 字节），通过 **SCM_RIGHTS fd 传递** 挂到游戏进程，是唯一真实的共享内存。旧版 `SharedMemManager` 的共享内存数据面已被 **废弃并桩化** （ `readSharedMemoryOnce()` 返回 `byte[0]` ）。

命名空间判定依据： `new LocalServerSocket(SOCKET_NAME)` （ `LocalSocketIPC.java:417` ）， `SOCKET_NAME` = `"xf_game_control_v2"` ，不以 `/` 开头，因此是抽象命名空间（ `\0xf_game_control_v2` ）。 `LocalSocketIPC.logStatus()` 也把它打印成 `Socket: @xf_game_control_v2` 。

**Socket 名与端口按发行版分流** （ `JccDistributionProfile.java` + `BuildConfig.java:16-27` ）：

App 侧启动的服务端线程名 `IPC-v2-IO` / `IPC-v2-Maintenance` （ `LocalSocketIPC.java:288,297` ）；游戏进程侧 native 的连接线程命名为 **`IPC-V2-Recv`**，App 正是靠读 `/proc/<pid>/task/*/comm` 里的 `IPC-V2-Recv` 来判断"注入是否存活"（ `MainActivity.java:1585` 、 `MainActivity.java:1842` ）。 **因此 native 是 client，App 是 server。**

## IPC v2 帧格式与握手

发方组包在 `writerLoop()` （ `LocalSocketIPC.java:638` ）：

**示例：App → native 的一条动作帧** （ `chess.sell` ）

**示例：native → App 的响应帧**

**示例：native → App 的错误帧**

（ `handleInbound()` `LocalSocketIPC.java:706-708` ，缺 `code` 时默认 `invalid_request` 。）

**示例：native → App 的状态推送帧**

握手用同一分帧，但 `seq` 固定 `0` 、 `type` 固定 `request` / `response` （ `writeHandshake()` `LocalSocketIPC.java:1131-1133` ）：

**① App(native 视角的 server) → native： `handshake.challenge`**

（ `authenticateAndPromote()` `LocalSocketIPC.java:555` ； `transport` 0=abstract，1=tcp）

**② native → App： `handshake.challenge` 的 response**

**③ App → native： `handshake.welcome`**

**④ native → App： `handshake.welcome` 的 response**

严格正则（ `IpcV2TokenStore.java:28` ）：

三份文件（同名目录 `context.getDir("ipc_v2", 0)` ，权限 owner-only 0600，原子写入 + `fsync` ）：

注入流程： `beginInjection()` 生成 epoch = max(current, pending)+1 的随机 token 写入 pending → `writeBootstrap()` 写 bootstrap 文件 → `MainActivity.stageInjectionBootstrap(...)` 把它拷到游戏数据目录并命名为 `.xfjcc_ipc_v2_bootstrap` （ `MainActivity.java:2043-2046` ）→ 注入模块读它完成握手 → 成功后 `promoteAuthenticated(epoch)` 把 pending 提升为 current 并 **删除** bootstrap 文件（ `IpcV2TokenStore.java:115-129` ）；失败则 `abortPending(epoch)` 回滚（ `MainActivity.java:2341` ）。重连时用 `prepareReconnectBootstrap()` / `writeActiveBootstrap()` 复用已有 token（ `MainActivity.java:1684` ）。

`IpcActionSender.sendWithTerminal()` （ `IpcActionSender.java:71-94` ）会在每个动作上追加：

完整常量表见 `IpcV2ActionMethods.java:10-31` 。

`config.replace` 的键（ `IpcV2ConfigState.java:13-78` ），标量键：

`autoPick`, `autoPlay`, `autoPick5CostChosen`, `autoPickAllChosen`, `autoPickCostMask`, `chase3StarThreshold`, `chase3StarChosenThreshold`, `autoRefreshShop`, `autoRefreshFallbackMs`, `autoRefreshReserveGold`, `auxiliaryMode`, `blockDialogs`, `boardEntityPreview`, `boardHeroHeadOverlay`, `chessOpIntervalFrames`, `iosFake`, `lineupStateKnown`, `nativeAttackIconEnabled`, `nativeAttackIconOffsetX`, `nativeAttackIconOffsetY`, `nativeAttackIconSizePercent`, `nativePlayerEconName`, `opponentBoardPerspective`, `opponentCardingEnabled`, `opponentCardingCostMask`, `opponentCardingMaxOwnedCopies`, `opponentCardingReserveGold`, `opponentCardingStrategy`, `opponentCardingThreshold`, `opponentPredictStyle`, `sessionActive`, `shopNativeLabel`, `showDebugWindow`, `specifiedShop`, `specifiedShopAffordOnly`, `specifiedShopCostMask`, `specifiedShopReserveGold`, `specifiedShopUseLineup`, `uiSurfaceDisableMask`, `uiSurfaceEnableMask`, `uiSurfaceHideMask`, `uiSurfaceShowMask`

集合/数组键（ `REQUIRED_COLLECTION_KEYS` `IpcV2ConfigState.java:78` ）：

`customAutoPickHeroIds`, `excludedHeroIds`, `lineupAppliedHeroIds`, `lineupAppliedStarTargets`, `auxiliaryAutoPickHeroIds`, `chosen5CostFilterIds`, `chosenAllCostFilterIds`, `starTargets`, `auxiliaryStarTargets`, `battlePanelLineups`

其中 `starTargets` / `auxiliaryStarTargets` / `lineupAppliedStarTargets` 序列化为 `[{"heroId":N,"star":1..4}]` （ `IpcConfigSync.isStarTargetKey()` `:121` 、 `starTargetsToJson()` `:133-144` ）。

注意方向： `ping` / `pong` 双方都会发； `heartbeat.ping` / `heartbeat.pong` 这两个 method 名只出现在 App 出站帧里。

全部走 `type=state` 或 `type=event` 帧（ `handleInbound()` `LocalSocketIPC.java:720-722` ； `state` 静默、 `event` 会自动回一条 `{"status":"completed"}` 的 `response` 帧，见 `:725, 746-748` ）。方法名常量集中在 `IpcV2PushMethods.java:10-34` ，分发在 `SharedMemManager.createPushDispatcher()` `:1880-2058` ，未注册的方法只打一行 `[MSG] 未知方法: X` 日志（ `handleCppMessage()` `:1869-1878` ）。

`trace` 诊断发布附加字段：部分推送（ `updateMatchup` 、 `updateBoardPositions` 、 `updateRankAnchors` 、 `updateGameRecommend*` ）可携带 `DiagnosticUiPublication.METADATA_KEY` 元数据，App 按 `publicationRevision` （ `Long.compareUnsigned` ）做去重，并把 `REJECTED_STALE_REVISION` / `REJECTED_STALE_GENERATION` / `REJECTED_PARSE` / `CACHED_NOT_VISIBLE` / `APPLIED` 等状态通过 `diagnostics.uiApplied` 回执给 native（ `parseDiagnosticUiPublication()` `:2494-2532` ， `completeDiagnosticUiPublication()` `:2534-2546` ）。

**心跳检测点有两处**： `readerLoop()` 在每次读超时（ `InterruptedIOException` ）时检查 `elapsedRealtime() - lastReceivedBootMs > 30000` → `disconnectIfCurrent(session, "heartbeat timeout")` （`:684-687` ）； `maintain()` 每秒定时也做同样检查（`:760-761` ）。 `maintain()` 同时负责 `pending.expire(...)` ：未写出的 pending 以 `request_timeout_before_write` 收尾，已写出的以 `response_timeout` 收尾（`:759` ）。

这是 **唯一的真实共享内存**。生命周期：

**8 个 native 方法** （ `DiagnosticSharedMemoryBridge.java:27-41` ）：  
`nativeCloseReader(long)` 、 `nativeCreateReader(long)` 、 `nativeDrain(long,long,int) → long[]` 、 `nativeDuplicateReaderFd(long) → int` 、 `nativeReadCrashSlot(long) → long[]` 、 `nativeReadFeatureHealth(long) → long[]` 、 `nativeReadHeader(long) → long[]` 、 `nativeReadThreadStacks(long) → long[]` 。

**页大小**： `PAGE_BYTES = 262144` （256 KiB）。native 的 attach 应答必须回 `{generation == 请求值, schema == 1, mappedSize == 262144}` ，三者缺一 App 就判失败（ `FloatingWindowService.java:4798` ）。 `TraceCatalog.SCHEMA = 1` 。

**Header 布局** （9 个 u64， `HeaderSnapshot` `DiagnosticSharedMemoryBridge.java:43-65` ）：

该头部 **没有 magic 常量**，也没有显式版本字段；页的识别与版本靠 `generation` + attach 应答里的 `schema` 字段。

**事件环形缓冲**： `nativeDrain(generation, fromTicket, maxCount)` ， `maxCount ∈ (0, 2048]` ，返回  
`long[3 + count*14]` = `[0]=nextTicket, [1]=droppedEvents, [2]=count, 之后 count 条 14×u64 记录` （ `drain()` `:241-259` ， `FIELDS_PER_EVENT = 14` ）。每条事件 14 个 u64：

`seq, monoNs, opId, matchEpoch, threadId, featureId, stepId, phase, result, reason, arg0, arg1, durationUs, flags`

**线程栈**：返回 `long[1 + n*43]` ， `[0]=n` （n ≤ 16），每个线程 43 个格： `threadId, frameDepth(≤8), flags, 然后最多 8 帧 × {opId, enterMonoNs, featureId, stepId, flags}` （ `FIELDS_PER_THREAD = 43` ， `FIELDS_PER_FRAME = 5` ， `MAX_STACK_DEPTH = 8` ， `MAX_THREAD_STACKS = 16` ）。

**功能健康度**： `long[1 + n*10]` ， `[0]=n` （n ≤ 64），每条 10 格： `featureId, lastSuccessMonoNs, lastFailureMonoNs, lastInputRevision, consecutiveFailures, lastReason, enabledConfig, capabilityState, hookState, recoveryCount` 。

**崩溃槽位**：固定 `long[10]` ： `sequence, monoNs, opId, threadId, moduleRelativeRva, signalNumber, moduleId, featureId, stepId, flags` 。有效性判据是 **seqlock 风格**： `sequence > 0 && (sequence & 1) == 0` （ `parseCrashSlot()` `:339-347` ）。

**Feature ID 目录** （ `TraceCatalog.Feature` ）： `TRUST_RUNTIME_LIFECYCLE=100` 、 `IPC_CONFIG_SYNC=110` 、 `AUTO_PICK=200` 、 `AUTO_REFRESH_SHOP_LOCK=210` 、 `SELL_ALL_IN=220` 、 `SPECIFIED_HEX=230` 、 `OPPONENT_PREDICTION=240` 、 `GAME_RECOMMENDATION=250` 、 `BOARD_HUD=300` 、 `RANK_HUD=310` 、 `SHOP_HUD=320` 。Step ID： `RECEIVE_INTENT=10, CHECK_CONFIG=20, CHECK_MATCH_STATE=30, CHECK_CAPABILITY=40, READ_INPUT_SNAPSHOT=50, MAKE_DECISION=60, CHECK_SHOP_LOCK=65, RESOLVE_ENTITY=66, DISPATCH_ACTION=70, WAIT_ACK=80, VERIFY_EFFECT=90, COMPLETE_OPERATION=100` 。每个 feature 最多 5 个诊断 UI 槽位（ `diagnosticUiPublications = new DiagnosticUiPublication[5]` ， `SharedMemManager.java:80` ）。

诊断的 **开启/关闭** 由远程授权驱动： `DiagnosticCoordinator` 从控制服务取 `DiagnosticGrant` （EC P-256 签名，公钥 `BuildConfig.JCC_DIAGNOSTIC_GRANT_PUBLIC_KEY_SPKI_BASE64URL` ，key id `jcc-v480-production-diag-b8acc9063be36518` ），校验通过后在 `ACTIVE_MATCH` 状态才 attach 页面；校验上下文里 `maxBytesCap = 20971520` （20 MiB）、 `maxMatchesCap = 3` （ `DiagnosticGrantVerifier.Context` `:45-66` 、 `DiagnosticCoordinator.verifierContext()` `:519-521` ）， `ACTIVE_RECOVERY_GRACE_MS = 30000` 。

**结论：不是 App 主动读游戏内存，而是 native 主动推。** App 侧完全没有内存扫描代码， `SharedMemManager` 里所有 `*FromData(byte[])` 方法都已退化成只读缓存（例如 `readPlayersInfoFromData(byte[])` 直接 `return this.snapshot.cachedPlayers;`， `SharedMemManager.java:1674-1676` ）， `readSharedMemoryOnce()` 返回 `SENTINEL_DATA` （空 `byte[0]` ，`:51, 1616-1618` ）。

数据流：

各类数据的关键字段（来自各 parser，均为 JSON）：

阵容数据是\*\*「内置 assets 兜底 + 远端签名下发覆盖」\*\*的双层结构：APK 里打包一套 `assets/lineup/<setId>/*.json` ，运行时优先使用从 `jcc.zhuzhufaka.cn` 下载、经 **ES256(P-256) 签名 + SHA-256 内容寻址** 校验后落盘的「bundle」（ `filesDir/lineup_data_v2/` ），旧的 `filesDir/lineup_data/` 作为 legacy 兼容层。

**真正的算法只有两个**，都在 Java 侧：

商店预测、海克斯预测、对手预测在 Java 侧 **完全没有算法**，全部由注入 native 算好后通过 IPC push 回传；Java 只做解析、缓存、以及一处展示层的 `1-(1-p)^n` 换算。

`LineupDataSource.resolveDataset(Context, setId)` （ `LineupDataSource.java:86` ）按固定优先级回退：

三处都要求同一组 **四个必需文件** （ `LineupDataSource.REQUIRED_FILES` ）： `lineup_meta.json` 、 `chess_meta.json` 、 `race.json` 、 `job.json` 。 `setId` 为空串时统一规范化为目录名 `_default` （ `LineupBundleStore.DEFAULT_SET` ）。

`setId` 校验在 `LineupBundleStore.canonicalSetId(String)` ：长度 ≤ 32、只允许 `[A-Za-z0-9._-]` 、禁止 `..`。这同时是路径遍历防线。

**`lineup_meta.json`**—— 顶层 `version` （字符串，用于版本比较）、 `setId` 、 `lineups` （数组）。每个阵容对象由 `LineupRepo.loadLineups` （ `LineupRepo.java:716` ）解析：

`final_units[]` 每项由 `LineupRepo.loadLineups` 构造为 `LineupUnit(heroId, location, carry, equip, type)` ：

**`chess_meta.json`**—— 顶层 `heroes` 是一个以 id 字符串为 key 的对象。 `LineupRepo.loadHeroes` （ `LineupRepo.java:648` ）逐项读： `id` 、 `name` （中文名）、 `cost` 、 `species` （种族，字符串转 int）、 `class` （职业，字符串转 int）、 `paint` （**去重键**）。

`paint` 是这套系统的核心抽象：它把「同一个英雄的不同星级/不同形态 id」归一到同一个字符串。羁绊计数、阵容匹配全部以 paint 为单位，因此 **同名英雄在场上出现多次只算一次**。

**`race.json` / `job.json`**—— 结构完全相同，都以 `"traits"` 为顶层 key， `LineupRepo.loadTraits(..., "race.json", false)` 与 `(..., "job.json", true)` 的唯一区别是 `isJob` 标志。每项字段： `id` 、 `name` 、 `numList` 、 `picture` 。

`numList` 是 **用 `|` 分隔的激活阈值**，由 `LineupRepo.parseThresholds` 解析成 `int[]` 。例如 `"2|4|6"` 表示该羁绊在 2/4/6 个英雄时分别达到 1/2/3 级。

**入口**： `LineupMetaUpdater.checkAndUpdate(Context, setId, Callback)` （ `LineupMetaUpdater.java:112` ），单线程 daemon executor 串行执行，结果回主线程。

默认 URL（ `LineupMetaUpdater.DEFAULT_URL` ）：

可在 SharedPreferences `lineup_cdn` 的 `url` 键里覆盖（ `getUrl` / `setUrl` ），但 **覆盖后仍受主机白名单约束**。

**签名信封**：服务端返回一个 JSON 信封，字段由 `requireExactFields` 强制为 **恰好四个**： `algorithm` 、 `key_id` 、 `payload` 、 `signature` 。

`LineupManifestPolicy.verifyEnvelope` （ `LineupManifestPolicy.java:81` ）的判定条件写死为：

若 `VERSION_POLICY_KEY_ID` 或 `VERSION_POLICY_PUBLIC_KEY_SPKI_BASE64URL` 为空，直接返回「阵容发布公钥尚未配置」， **不做任何降级放行**。

**Manifest 结构** （ `LineupMetaUpdater.parseManifest` + `LineupManifestPolicy.Manifest` ）：顶层字段 `schema` 、 `set_id` 、 `revision` 、 `version_name` 、 `bundle_sha256` 、 `data_schema` 、 `published_at` 、 `files` ； `files` 恰好四项，每项 `{path, size, sha256}` 。

**`LineupManifestPolicy.validate(manifest, setId, nowEpochSeconds)`** 的完整校验清单：

**Bundle 摘要算法** （ `LineupManifestPolicy.computeBundleDigest` ， `LineupManifestPolicy.java:135` ）——这是 generation id 的来源，也是本地落盘的目录名：

固定文件顺序 + 长度前缀 + 把 revision 也纳入摘要，使得 generation 同时绑定了内容、赛季和版本号。

**下载校验**：每个文件用 `resolveFileUrl` 基于 manifest URL 解析，并再次过白名单；下载后 `LineupManifestPolicy.verifyFile` 要求 **字节数完全等于 manifest 的 size** 且 SHA-256 完全匹配（ `HASH_MISMATCH` ）。

**URL 白名单** （ `LineupMetaUpdater.isAllowedUrl` ， `LineupMetaUpdater.java:603` ）——两条规则：

`getJson` 另外做了：禁止重定向（ `setInstanceFollowRedirects(false)` ，遇 3xx 直接抛 `redirect rejected` ）、强制 `Content-Type` 以 `application/json` 开头、 `Accept-Encoding: identity` 、 `User-Agent: XFjcc/LineupMetaUpdater-v2` 、连接超时 5s / 读超时 10s、响应体长度必须与 manifest 声明一致、manifest 信封上限 98304 字节。

`LineupRevisionPolicy.evaluate(installedRevision, installedVersion, hasBundle, manifestRevision, manifestVersion)` （ `LineupRevisionPolicy.java:26` ）返回 `Code` ：

版本比较 `compareVersion` 走 `.` 分段：逐段优先按数值比较，若任一段含非数字字符则退化为字符串 `compareTo` 。 **注意它是有符号解析（ `Long.parseLong` ），与 `LineupDataSource.compareVersion` 的 int 版本是两份独立实现。**

`LineupBundleStore.commit(Bundle)` （ `LineupBundleStore.java:170` ）是本项目里工程质量最高的一段：

并发用 `ConcurrentHashMap<String,Object> LOCKS` 以「root 绝对路径 + `\n` + setId」为 key 做进程内互斥。

`commit` 的返回值 `Code` 区分 `UPDATED` / `NO_UPDATE` （revision 相同且 generation 相同）/ `VERSION_CONFLICT` （revision 相同但 generation 不同 —— 说明服务端在同一 revision 上换了内容，会被拒绝）/ `DOWNGRADE_REJECTED` / `STAGE_IO_FAILED` 。

`LineupRepo.bindAutoSync(Context)` （ `LineupRepo.java:421` ）订阅 `GameSeasonBus` ：当游戏内赛季 id 变化且与当前 `targetSetId` 不同时，起一个名为 `lineup-autosync` 的线程调用 `reload(context, newSetId)` ，实现「换赛季自动换整套阵容数据」。 `reload` 走 `buildCandidate` → `activateCandidate` 的 **先构建后切换** 模式，构建失败则保留旧 state 并打日志。

`TraitCalculator.compute(Set<String> paints, LineupRepo repo)` （ `lineup/TraitCalculator.java:55` ）：

**关键点**：一个英雄同时给它的 `speciesId` 和 `classId` 各 +1（例如某英雄是「龙族 + 法师」，则龙族 +1、法师 +1）。计数单位是 **paint 而不是英雄 id**，所以同一英雄的 1/2/3 星在场上只贡献 1 点——这正是记牌器「不重复计数」的实现方式。

`TraitDef.getActivatedTier(int count)` （ `LineupRepo.java:89` ）：

即 **线性扫描阈值表，取满足条件的最大下标 +1**。阈值来自 `race.json` / `job.json` 的 `numList` （ `|` 分隔）。例如 `numList="2|4|6"` 、count=5 → tier = 2。

`ActiveTrait` 构造函数（ `lineup/TraitCalculator.java:29` ）：

**没有权重、没有系数、没有溢出收益**——超过最高档的部分不产生额外收益，也不会被裁剪。

`COMP_ACTIVE_DESC` （ `lineup/TraitCalculator.java:15` ）四级比较，决定 UI 里羁绊的展示顺序：

UI 侧的雷达图 `TraitRadarView.ratio(ActiveTrait)` 用 `count / thresholds[last]` 归一化到 `[0.05, 1.0]` 作为顶点半径—— **这是纯展示，不回流到推荐算法**。

`recommend(Set<Integer> ownedIds, Integer preferredTraitId, int limit, LineupRepo repo)` （ `LineupRecommender.java:69` ）：

`scoreOne(lineup, ownedIds, preferredTraitId, repo)` 是对单套阵容的公开版本，复用同一个 `score` 。

`LineupRecommender.score(...)` （ `LineupRecommender.java:95` ）逐步展开：

**第一步：阵容侧三套 paint 集合**

**第二步：三个交集计数**—— `intersectCount(a, b)` 是手写的迭代计数（遍历较小集合，检查是否在较大集合中），得到 `earlyHits` 、 `midHits` 、 `lateHits` 。

**第三步：无用英雄惩罚**

**第四步：主评分**

**第五步：品质奖励**

（源码里写成 `ExifInterface.LATITUDE_SOUTH` （值 `"S"` ）与 `ExifInterface.GPS_MEASUREMENT_IN_PROGRESS` （值 `"N"` ）——借用 EXIF 常量做字符串常量，属于混淆残留。）

**第六步：指定羁绊奖励**

注意只检查 **已激活** 的羁绊（ `computeForLineup` 内部走 `computeActivated` ）。 **30.0 远大于其它所有项之和的量级**，一旦命中基本锁定第一名。

**第七步：排序**

`COMP_SCORE_DESC` （ `LineupRecommender.java:16` ）三级稳定排序：

**结果对象 `Recommendation`** 携带： `lineup` 、 `score` 、 `earlyHits` / `midHits` / `lateHits` / `extraHeroes` 、 `projectedTraits` 、 `preferredHit` ，并提供 `missingPaints(owned, repo)` / `matchedPaints(owned, repo)` 两个差集工具（基于 `lineupAllPaints` = early ∪ mid ∪ finalUnits）。

全仓 grep `LineupRecommender.` 只有 **一处生产调用**：

即 **自动模式永远传 `preferredTraitId = null`**， `PREF_BONUS` 分支在自动链路里从不触发； `limit` 固定 5。 `scoreOne` 在 Java 侧没有调用点，应该是留给阵容面板 UI（WebView / 动态插件）走的公开 API。

英雄 id 是五位十进制数， **前两位 = 费用档位 + 10**，后三位是英雄序号：

`HeroIdMapper.HeroInfo` 构造函数的实现就是这个编码的直接体现（ `HeroIdMapper.java:965` ）：

`getHeroesByCost(cost, setIdx)` （ `HeroIdMapper.java:1042` ）反过来用 `i3 = cost + 10` 做同样降位后匹配； `get5CostHeroes` 等价于 `cost == 5` （降位后 == 15）。

`HeroIdMapper` 静态初始化 6 个赛季的数据集，通过 `setIdx` 索引选择：

每个赛季维护两张表：

`getHeroAvatarPath(id, setIdx)` （ `HeroIdMapper.java:988` ）拼出 `heroes/<SET>/<englishName>.png` ，其中 `<SET>` 取 `FUX` / `S10` / `S16` / `S17` / `S8` / `S18` 。查不到的 id 统一返回中文名 `"未知英雄"` ， `getHeroInfo` 遇到「未知英雄」返回 `null` 。

S17/S8/S18 有「同英雄的不同形态 id」（例如终极形态、变身后），用 `FORM_TO_BASE: Map<Integer,Integer>` 把形态 id 折回基础 id：

**没有为 FUX/S10/S16 提供对应的 form 映射**，这三个赛季只有单层表。

`getHeroIdsByChineseName(cn)` 会遍历全部 6 个赛季的基础表 + 形态表，收集所有同名 id（去重），用于「按名字查所有可能 id」。

**星级编码在 id 的十进制最高位**，由 `HeroStarId` （ `lineup/HeroStarId.java` ）处理：

举例： `11112` → star 1（也即基础 id）； `21112` → 2 星； `31112` → 3 星； `41112` → 4 星。 `starOf` 接受 1..4，与金铲铲支持 4 星 1 费单位的设定一致。

`LineupRepo.normalizeStarPrefix(int)` （ `LineupRepo.java:900` ）是同一套逻辑的第二份实现（去掉星位），仅当首位在 `[2,4]` 时才做减法。

**副本数与星级的换算** （ `HeroStarId` ）：

`copiesForStar(star)` 与 `starForCopies(copies)` 是一对互逆函数，阈值分别是 1/3/9。

`HeroStarId.targetFor(Map<Integer,Integer> targets, int id)` ：先按精确 id 查目标星级；查不到则用 `baseOf` 找到所有同基础英雄的条目取 `Math.max` 。这是「目标星级」的解析规则。

`LineupRepo.resolveHero(state, id)` （ `LineupRepo.java:800` ）对任意输入的 id 做 **六到七级回退**，这是「游戏内 id 与数据表 id 对不上」的主要容错点：

**别名注册** （ `registerHeroAliases` ， `LineupRepo.java:856` ）——每个英雄在加载 `chess_meta.json` 时注册四个别名键： `id` 、 `normalizeStarPrefix(id)` 、 `id % 10000` 、 `normalizeStarPrefix(id) % 10000` 。如果两个不同 paint 的英雄抢同一个别名键，该键会被 **移除并加入 `ambiguousHeroAliases` 黑名单**，之后再也不会被注册（ `registerHeroAlias` ， `LineupRepo.java:864` ）。同时 `name` 与 `paint` 也作为名字别名注册进 `heroByNameKey` ， **先到先得** （ `registerHeroNameAlias` 用 `containsKey` 判重）。

运行时还有两个便捷入口： `getCurrentRuntimeHero(id)` 先精确查、失败再去掉星位查； `getRuntimeIdsByPaint(paint)` 返回该 paint 下所有 id 并保证包含 `heroByPaint` 里那个主 id。

**数据来源是 IPC，不是本地文件。** 完整链路：

`OwnedHeroTracker` 通过 `SharedMemManager.getMyOwnedTimestamp()` （一个 **变更计数器**， `SharedMemManager.java:1694` ）和 `getMyOwnedHeroIds()` （ `SharedMemManager.java:1686` ）读取。

**轮询机制** （ `OwnedHeroTracker.tick` ， `OwnedHeroTracker.java:160` ）：

`stop()` 会 `removeCallbacksAndMessages(null)` + `quitSafely()` 并清空状态。

**注意**： `OwnedHeroTracker` 拿到的 id 是原生运行时 id（可能带星位），因此消费方（ `AutoLineupApplier` ）交给 `LineupRecommender` 后，是靠 `normalizeToPaints` 的多级回退去匹配的。

**四种触发源**：

**节流**： `MIN_INTERVAL_MS = 2000` ，距上次成功应用不足 2 秒直接返回。

`applyByAuto` 最终走 `LineupActiveBus.applyInternal` （ `LineupActiveBus.java:265` ），做三件事：

清空路径对应 `pushHeroIdsToNative(空)` + `writeLineupAppliedTargets(new int[0], emptyMap)` + action **`lineup.clear`**。

三条 action 常量定义在 `IpcV2ActionMethods` ： `LINEUP_APPLY = "lineup.apply"` 、 `LINEUP_CLEAR = "lineup.clear"` 、 `LINEUP_SYNC_TO_SLOT = "lineup.syncToSlot"` ；发送点全部在 `SharedMemManager` （ `applyAppLineupToGame` / `clearAppLineupFromGame` / `syncLineupToGameSlot` ）。 **Java 侧没有接收方**——这些是发给注入进游戏进程的 native 库（ `libdemo.so` / `libinject.so` ）去执行的。

可靠性上， `LineupActiveBus` 每个 push 都带 **签名去重** （ `lastPushAppLineupSig` 等）和 **重试队列** （ `pendingAppLineupPayload` / `pendingClearStarTargets` / `pendingGameSlotPayload` ），失败时 `scheduleNativeRetry()` ，最多 `MAX_NATIVE_RETRY_ATTEMPTS = 120` 次、每次间隔 `NATIVE_RETRY_DELAY_MS = 100` 毫秒（即最长约 12 秒），并严格按生成号 `nativePushGeneration` 保证旧载荷不覆盖新载荷。

由 `LineupActiveBus.buildNativeLineupPayload(Lineup, int index)` （ `LineupActiveBus.java:459` ）构造：

细节：

native 推送 `updateGameRecommendTeam` → `SharedMemManager` 分发 → `GameLineupBridge.onGameRecommendReceived(JSONObject)` ：

另一条 push `updateGameRecommendActive` （字段 `active` (0/1) + `heroIds[]` ，最多 32 个）走 `GameLineupBridge.onGameRecommendActiveTargets` ，由 `GameAppliedLineupFactory.fromActiveHeroIds(int[])` 构造一个「只关心拿哪些英雄、不关心站位」的临时 `Lineup` 。

`BoardLoc` （ `lineup/BoardLoc.java` ）： `ROWS = 4` 、 `COLS = 7` ， `inBounds(row, col)` = `0 <= row < 4 && 0 <= col < 7` 。

**slot 索引 = `row * 7 + col`** （0..27）。这个值在 `LineupActiveBus.buildNativeLineupPayload` 用于站位去重、在 `PickBoardModel` / `GameAppliedLineupFactory` 用于定位，是棋盘格子的唯一整数表示。

`BoardLoc.parse(String)` 同时接受两种写法：

解析成功返回 `int[]{row, col}` （0-based），越界或格式错误返回 `null` 。 **App 内部统一用 `"0:row,col"` 写出** （ `GameAppliedLineupFactory` 的 location 字段），1-based 形式是为兼容数据源里手写的坐标。

`PickBoardModel` 是「一套阵容怎么摆到棋盘上」的视图模型，不参与评分。

**Java 侧的本地数据只有两张静态表**：

**这张表是「能不能刷出」的布尔表，不是概率表。** 没有任何「等级 1-10 → 各费用出现概率」的数字硬编码在 Java 里。

**运行时数据全部来自 native**，IPC 命令与载荷：

`SpecifiedHexPanel` （2268 行，TAG `"HexPredict"` ）是 **纯 UI**：Grid 选择器 + 已选目标列表，图标从 `file:///android_asset/hex_icons/...` 加载，不可刷出的格子透明度降到 0.35，品质着色由 `HexAugmentMapper` （asset `hex_augment_table.txt` ，字段 id/name/tier/description，颜色常量 `COL_SILVER` / `COL_GOLD` / `COL_PRISM` / `COL_UNKNOWN` ）提供。

**Java 侧唯一一处真正的概率计算** 在 `SpecifiedHexHitRate` ，而且它是 **建立在 native 给回的权重之上** 的：

展示文案 `chanceLabel` ： `本阶段不会出` / `本阶段可出` / `本阶段几乎不出` （<1%）/ `本阶段稳出` （≥99%）/ `本阶段 X%` 。

`HexQueryBroker` 是一个 **单飞（single-flight）请求合并器**： `request(callback)` 把回调放入 `waiters` ，若已有请求在飞则只排队，否则置 `inFlight = true` 并排一个超时任务； `complete(int[])` 清空 waiters、取消超时、给每个 waiter 一份 **克隆的** `int[]` ；超时（ `SharedMemManager.HEX_QUERY_TIMEOUT_MS = 4000` 毫秒）与 `cancelPending()` 都以 `complete(null)` 收尾。缓存落在 `SharedMemManager.snapshot` 的 `cachedHexLevels` / `cachedHexLivePool` / `cachedHexLivePoolWeights` / `cachedHexLivePoolTotalWeight` / `cachedHexDrawsPerStage` 。

`OpponentPredictionControlBinder` 是 **纯 UI 绑定**——5 个 Switch、若干 SeekBar（对手文本框位置/大小、攻击图标偏移/大小、native 攻击图标）、预设按钮（TL/LM/TR/RM/拖拽模式）以及位置百分比文案格式化， **没有任何「血量/等级 → 阵容」的推断代码**。

`OpponentPredictSourcePolicy` 只有三个来源常量： `SOURCE_OFF = 0` / `SOURCE_IMAGE = 1` / `SOURCE_NATIVE = 2` ， `imageOverlayEnabled(...)` 决定用图像覆盖层还是 native 覆盖层。

真正的对手数据由 native 的 `updateMatchup` 推送： `IpcMatchupEnvelopeParser` 解析 `myId` / `opponentId` / `matchId` / `source` / `pairs` ； `IpcMatchupPairsParser` 解析 `pairs: [{p1, p2, ghost}]` 到 `MatchupPairData{player1Id, player2Id, ghostSourcePlayer}` ； `MatchupSnapshot.shouldAccept` 做优先级仲裁。 **配对是 native 算好的。**

一句话： **Java 只负责「算羁绊、算阵容匹配度、把 native 给的概率数字换算成百分比文案」，所有与游戏内随机性相关的推断都在 native。**

本地持久化（SharedPreferences）： `lineup_auto_apply` （自动应用开关）、 `lineup_cdn` （更新 URL 覆盖）、 `lineup_favorites` （收藏阵容 id，逗号分隔字符串， `LineupFavorites` ）。

本样本的授权体系是 **两层、且信任根完全下沉到 `libdemo.so`** 的结构：Java 层只做"搬运工 + 形状校验"，所有密钥、签名、验签、环境判定都在 native 里；Java 侧唯一真正持钥的三处（诊断上报 HMAC、诊断授权令验签、版本策略验签）用的都是 **服务端下发或硬编码的公钥**，没有对称密钥。

两层授权：

两层都通过后 `nativeIsAuthorized()` 才为真，功能才开放。此外还有一条 **下发通道**：Java 拿到 lease 后通过本地 `LocalSocketIPC` （socket `xf_game_control_v2` ）把 lease / WIG session / feature catalog **转发给注入在游戏进程里的 native 运行时**，游戏进程侧再自行校验一次。

关键点： **Java 层从不验证服务端响应的密码学签名**。 `nativeAcceptChallenge` / `nativeAcceptLease` / `nativeVerifyControlPolicy` / `nativeIsAuthorized` 这四个方法是 Java 与信任根之间唯一的"判决接口"，全部返回 `int` / `boolean` ，具体算法实现在 `libdemo.so` 内，Java 侧不可见。

`TrustError` 枚举（ `trust/TrustError.java` ）把 native 判决码翻译成语义：

其中 `VM_REJECTED` / `VM_PROGRAM_INVALID` / `MANIFEST_INVALID` 这组命名强烈暗示 native 内部有一个 **解释器/虚拟机式的租约校验程序** （租约里可能带一段被签名保护的"校验程序"，由 native VM 执行）。 **实现在 `libdemo.so` 内，Java 侧不可见。**

`isDefinitiveRejection()` 只把 `REVOKED` 和 `BUILD_NOT_REGISTERED` 当作不可重试的终局拒绝，其余失败一律走重试（初始 acquire 指数退避；续租固定 10s）。

`trust/NativeTrustBridge.java:141-185` 声明 20 个 native 方法，其中与信任根直接相关的：

**结论：信任根密钥（用于验服务端签名的公钥，或对称密钥）在 `libdemo.so` 内，Java 侧完全不可见。** Java 侧硬编码的常量里没有任何可以替代它。

**授权令（Diagnostic Grant）验签公钥**—— `src/com/android/support/BuildConfig.java:13-14` ：

**版本策略验签公钥**—— `src/com/android/support/JccReleaseConfig.java:5-8` ：

**服务端源**—— `src/com/android/support/JccNetworkPolicy.java:12` ： `ORIGIN = "https://jcc.zhuzhufaka.cn"` ； `JccGatewayClient.java:38` ： `ORIGIN_FALLBACK_ADDRESS = "43.226.61.21"` （DNS 兜底直连 IP）。

**官方频道常量**—— `src/com/android/support/WigVerify.java:28-39` ：

这些都是 **Telegram** 链接，与"官方 QQ 群"无关。

**Java 侧没有任何对称密钥**：全部 `grep` 下来， `SecretKeySpec` 、 `HmacSHA256` 的密钥都是运行时构造（服务端下发或 Keystore 生成），没有硬编码的 AES key、HMAC key、RSA 私钥或 ECDSA 私钥。这是有意设计——Java 层只放公钥。

**唯一的完整性校验算法在 Java**： `OfficialBrandContract.fnv1aUtf8` （ `src/com/android/support/OfficialBrandContract.java:21-30` ），FNV-1a 32 位、UTF-8 字节、offset basis `-2128831035` 、prime `16777619` 。

`nativeLicenseHeader()` （ `trust/NativeTrustBridge.java:172` ）返回 `byte[]` ，在 `exchange()` 的第一个 native 步骤（ `lambda$exchange$0` ，第 1472-1475 行）与 `nativeBeginChallenge()` 一起取出：

**它被放到 HTTP 头 `X-JCC-License` 里** （ `trust/TrustTransport.java:349` 、`:385` ）：

**精确的使用位置** （重要，容易搞错）：

即： `/v2/challenge` **不带** `X-JCC-License` ； `/v2/lease` 与 `/v2/renew` **带**。设计意图可读为：先拿 challenge 证明请求是新鲜的，再用 license header 证明请求来自合法客户端，两者一起换取租约。

**Java 对 header 内容的校验（ `validateLicenseHeader` ， `TrustTransport.java:423-436` ）**：只做形状约束，不解码、不验签。

这正是一个"native 生成的、不透明的不定长凭据"的特征。 **header 的内部结构、生成算法、是否签名、绑定什么，全部实现在 `libdemo.so` 内，Java 侧不可见。**

同一个 `TrustTransport` 还对 `postWig` 做了更严格的白名单（ `isFixedWigPath` / `isFixedWigForm` / `isEncodedComponent` ， `TrustTransport.java:242-317` ）：URL 必须是 `https://jcc.zhuzhufaka.cn/v2/api/wig/login/<≤20位数字>/<安全串>` ，body 必须严格是 `card=<enc>&imei=<enc>` 且只有这两个字段。这是 **防 Java 层被 patch 后改地址或加字段**。

**`WigVerify.java` 里实际是 12 个 native 方法，不是 13 个** （第 80-102 行，穷尽 `grep` ）：

`nativeGetChannelUrl` 、 `nativeGetOfficialChannelUrl` 、 `nativeGetOfficialChannelChecksum` 、 `nativeGetOfficialGroupUrl` 、 `nativeGetOfficialGroupChecksum` 、 `nativeGetOfficialHandle` 、 `nativeGetOfficialPrefix` 、 `nativeGetOfficialSupportUrl` 、 `nativeGetOfficialSupportChecksum` 、 `nativeGetOfficialTextChecksum` 、 `nativeGetVersionCode` 、 `nativeGetVersionName` 。

（信任侧的 20 个 native 方法在 `NativeTrustBridge` ，诊断侧的 8 个在 `DiagnosticSharedMemoryBridge` 。）

这 12 个方法的共同模式是「**native 提供值 + native 提供校验和，Java 侧用硬编码的批准值双向核对**」：

即三个条件 **全部** 成立才采用 native 的值：

**防的是什么**：防止有人 patch `libdemo.so` 把官方频道/客服链接替换成仿冒的 Telegram 群或充值钓鱼页。因为校验和是硬编码在 Java dex 里的一个魔数，攻击者改 native 字符串就必须同时改 dex 里的校验和。

**校验失败会怎样**： **静默回退到明文默认常量** （ `WigVerify.java:114-160` ， `try { ... } catch (Throwable unused) {}` 后 `return OFFICIAL_*_DEFAULT` ）。不抛异常、不崩溃、不禁用功能。

因此必须诚实指出： **这是一层弱防伪**。默认常量本身就是明文正确的 URL，所以攻击者可以直接 patch Java 层或直接读默认常量绕过，代价很低。它的真实作用是防止"改 native 而不改 dex"这类粗糙篡改，而不是保护授权。

`nativeGetVersionName` / `nativeGetVersionCode` 在 native 不可用时回退到 `PackageManager` （ `WigVerify.java:1958` ）或硬编码 `"1.0"` （`:1960` ）/ `1` （`:1966,1971` ）。

`purchaseUrl()` （ `WigVerify.java:162-175` ）对 `nativeGetChannelUrl()` **只检查 `startsWith("https://")` ，不做校验和**——这是 12 个里唯一没有校验和保护的一个。

**它不是权限校验，也不做任何密码学操作。** 读完全文（565 行）可以确认它是一个 **登录 UI 状态机 + 重试策略**：

`TAG = "FloatingWindowService"` （:27）——它是 `FloatingWindowService` 的内部逻辑类，不是独立组件。

**注册阶段** （ `diagnostics/DiagnosticControlClient.java:178-187` ， `POST /diag/v1/installations/register` ）： `schema` 、 `lease` （320 字节信任租约的 Base64URL）、 `version_name` 。  
服务端返回并落盘为"身份"（ `Registration` ，`:49-79` ）： `support_subject_id` 、 `installation_id` 、 `support_code` 、 `installation_secret` （32 字节，后续所有请求的 HMAC 密钥）、 `build_id_hash` 、 `server_time` 。

**会话期** （ `DiagnosticEventStore.eventLine` ， `DiagnosticEventStore.java:639-644` ）：每事件一行 JSONL， **14 个全数字字段，没有任何字符串**：

字段取值全部来自 `TraceCatalog.java` 的枚举表： `feature_id` （ `TRUST_RUNTIME_LIFECYCLE=100` 、 `IPC_CONFIG_SYNC=110` 、 `AUTO_PICK=200` 、 `AUTO_REFRESH_SHOP_LOCK=210` 、 `SELL_ALL_IN=220` 、 `SPECIFIED_HEX=230` 、 `OPPONENT_PREDICTION=240` 、 `GAME_RECOMMENDATION=250` 、 `BOARD_HUD=300` 、 `RANK_HUD=310` 、 `SHOP_HUD=320` ），以及 step / phase / result / reason 码表（ `reason` 含 `HOOK_NOT_INSTALLED=3` 、 `HOOK_STALE=4` 、 `OFFSET_INVALID=5` 、 `MEMORY_READ_FAILED=6` 、 `GRANT_EXPIRED=20` 、 `TRACE_QUOTA_EXHAUSTED=21` 等）。

**事故（incident）** （ `DiagnosticIncidentSampler.java:86-96` ， `POST /diag/v1/sessions/{id}/incidents` ）： `incident_id` 、 `match_epoch` 、 `incident_type` 、 `feature_id` 、 `step_id` 、 `op_id` 、 `result` 、 `reason` 、 `confidence` 、 `evidence` 。类型有 `FEATURE_NO_EFFECT` 、 `CRASH` （evidence 含 `signal_number` 、 `module_id` 、 **模块相对 RVA**）、 `FREEZE` （游戏帧心跳停滞 ≥10s）、 `FEATURE_DEGRADED` 、 `FEATURE_RECOVERED` 。 `incident_id = "incident_" + Base64URL(SHA-256(sessionId ‖ 0x00 ‖ dedupKey)[:16])` （`:251-261` ）。

**支持码** `SupportCode.generate` （ `SupportCode.java:15-25` ）： `"JCC"` + 16 位 `"23456789ABCDEFGHJKMNPQRSTUVWXYZ"` + 1 位校验（ `i = (i*17+idx) % 32` ，初值 19），格式 `JCC-XXXX-XXXX-XXXX-XXXX-C` 。

**不上报的内容** （值得强调）：没有原始调用栈、没有函数名、没有符号、没有绝对地址、没有包名、没有设备标识明文。设备身份只在 HTTP 头里。这是一个刻意设计的 **低信息量、高可统计性** 的数字遥测。

单一固定源： `https://jcc.zhuzhufaka.cn` （ `JccNetworkPolicy.java:12` ），路径前缀 `/diag/v1/` 。

传输用 OkHttp，connect 8s / read 20s / write 20s / call 30s， **禁用重定向** （ `followRedirects(false)` ）。 `JccNetworkPolicy.requireFixedDiagnosticUrl` （`:106-117` ）强制 `https` + host 必须等于 `jcc.zhuzhufaka.cn` + 端口 -1/443 + 无 userinfo/query/fragment。

另有 **本地通道** （不是上传通道）： `FloatingWindowService.java:4787-4798` 通过 `LocalSocketIPC.sendDiagnosticTraceAttach(pfd, json, ...)` （请求名 `"diagnostics.trace.attach"` ）把 **262144 字节共享内存页的 fd** 传给注入到游戏进程的 native，native 侧往这页里写 trace。attach 回包必须是 `{schema:1, generation:<匹配>, mappedSize:262144}` 。

`diagnostics/DiagnosticRequestSigner.java` ：

**载荷本身不加密**：事件块只做 **gzip 压缩** （ `DiagnosticEventStore.sealActive` ， `GZIPOutputStream` ，`:237` ）+ 链式 SHA-256（ `previousHash` / `sha256` ，`:256-257,268-270` ）。incident 是明文 JSON。

采集不是无条件的——它需要服务端下发一张 **签名的授权令**：

验签算法（ `DiagnosticGrantVerifier.java:108-116` ）： **`SHA256withECDSA` ，P-256（secp256r1）**，签名对象 `kid + "." + payload` （US-ASCII），强制 `ECPublicKey` 且 `getField().getFieldSize() == 256` ；信封 JSON `{kid, payload, signature}` ，signature 为 DER ECDSA（64..80 字节）。密钥解析见 `DiagnosticGrantKeyResolver.fromBuildConfig()` （`:21-32` ），只接受 kid == `JCC_DIAGNOSTIC_GRANT_KEY_ID` 。

校验项（ `DiagnosticGrant.parse` ，`:64-100` ）： `expires_at` 、 `not_before` 、 `revision` （防回放）、 `allowed_build_id_hashes` 、 `min/max_version_name` 、 `installation_scope` 、 `feature_mask` 。错误码含 `REVISION_REPLAY` 、 `QUOTA_EXCEEDED` 、 `UNSUPPORTED_FEATURE` 等（ `Code` ，`:22-39` ）。

持久化在 `noBackupFilesDir/diagnostics/control/` ： `grant-envelope.json` + `grant-state.json` （ `DiagnosticGrantRepository.java:16-23` ）。

8 个 native 方法（ `DiagnosticSharedMemoryBridge.java:27-41` ）： `nativeCloseReader` 、 `nativeCreateReader` 、 `nativeDrain` 、 `nativeDuplicateReaderFd` 、 `nativeReadHeader` 、 `nativeReadThreadStacks` 、 `nativeReadFeatureHealth` 、 `nativeReadCrashSlot` 。 **这些实现在 `libdemo.so` / `libdemo_compat.so` 内，Java 不可见；Java 侧只负责按固定字段数把返回的 `long[]` 切分。**

布局常量（`:17-23` ）： `PAGE_BYTES = 262144` 、 `FIELDS_PER_EVENT = 14` 、 `FIELDS_PER_FRAME = 5` 、 `FIELDS_PER_HEALTH = 10` 、 `FIELDS_PER_THREAD = 43` 、 `MAX_STACK_DEPTH = 8` 、 `MAX_THREAD_STACKS = 16` 。

用途： `create(generation)` （`:197-206` ，generation 是 63 位随机数， `DiagnosticCoordinator.positiveRandomLong` ，`:974-980` ）→ `duplicateForSend()` 复制 fd → `LocalSocketIPC` 把 fd 与 `{generation, mode, expiresMonoNs, featureMask}` 一起交给游戏进程的 native → Java 侧周期 `drain(ticket, 2048)` 拉取。 **共享内存内是否有额外魔数/校验，无法从 Java 确认。**

`DiagnosticRedactor.java` 是严格白名单：事件只允许那 14 个 `Number` 字段，incident 文本字段只允许 `incident_type` 、 `confidence` 且须匹配 `[A-Z_]{1,32}` ，越界直接抛 `IllegalArgumentException` （`:36-38` ）。

**但全仓 `grep` 确认 `DiagnosticRedactor` / `sanitizeEvent` / `sanitizeIncident` 除自身定义外没有任何调用点——是死代码。** 隐私边界实际上靠"采集时就只写数字 id"（见 4.6.1）来保证，而不是上传前清洗。

`WigVerify` 、 `VerifyOverlayAuth` 、 `OfficialBrandContract` 中 **没有** 任何 `MessageDigest` 自校验、 `GET_SIGNATURES` APK 签名比对、 `ro.debuggable` 读取、 `ptrace` / `frida` / `xposed` 检测。 `getPackageInfo(..., 0)` （ `WigVerify.java:1958` ）flags 为 0，只是读版本名。

Java 层仅有：

`libdemo.so` 内确实存在下列字符串，与 Java 侧只做"错误码翻译"的行为互相印证：

**Java 侧还留有 native 会返回这些码的旁证**： `VerificationUserMessage.fromInternal` （`:157-168` ）把 `MANIFEST` / `INTEGRITY` / **`SELFCRC`** / **`CODE_MISMATCH`** 一律映射为 `INTEGRITY` ，把 **`ENV`** / **`TRACER`** / **`HOOK`** / **`ROOT`** 一律映射为 `ENVIRONMENT` 。也就是说 native 会产出 **自 CRC 校验失败（SELFCRC）**、 **代码段不匹配（CODE_MISMATCH）**、 **调试器（TRACER）**、 **Hook（HOOK）**、 **ROOT** 这几类码——Java 侧只是把它们收敛成两个用户可见文案。

**诚实边界**：

**不崩溃、不硬退出，一律是"拦截功能 + 提示重试"**：

这一节覆盖 Java 侧除「注入」与「IPC」之外的其余逻辑：窗口体系、按键注入、配置持久化、语音与诊断外壳。

`com.android.support.FloatingWindowService` 是 `Service` ，但它的源码单文件 **1.52 MB / 28679 行**，外加 97 个内部类。整个 App 的 UI 编排、状态机、功能开关、面板生命周期几乎都塞在这一个类里，是典型的「巨类」结构。 `MainActivity` 只负责启动时的 root/注入引导，注入完成后把控制权交给它。

悬浮窗不是单个窗口，而是一组 **分层窗口**：

窗口类型： `TrustedVisualOverlayWindowManager` 里用 `createWindowContext(2038, null)` 创建 **2038 = `TYPE_APPLICATION_OVERLAY`** 的窗口上下文（另一处复制布局参数时用了 `type = 2032` ）。用 `createWindowContext` 而非 `getApplicationContext` 是 Android 12+ 悬浮窗的正确姿势，可避免隐式依赖 Activity 上下文。

`ScreenSecureController` 是这一类里技术含量最高的部分。它 **没有** 用常规的 `WindowManager.LayoutParams.FLAG_SECURE` （全代码库搜不到 `FLAG_SECURE` ），而是反射调用 AOSP 未公开接口：

拿到 `ViewRootImpl.getSurfaceControl()` 后，用 `SurfaceControl.Transaction.setSkipScreenshot(surfaceControl, true)` 把某个 View 的 Surface 标记为「跳过截屏」。更狠的一点是它规避了 Android 9+ 的隐藏 API 黑名单——第一句 `getMethod` 失败时会走 fallback，用 `Class.getDeclaredMethod("getMethod", ...)` 反射出 `Method` 对象再 invoke：

这是绕 `HiddenApiRestriction` 的经典手法。要求 `SDK_INT >= 29` ，低于此版本 `isReady()` 返回 false，功能静默失效。

效果是「截图与录屏里看不到辅助界面」——比 `FLAG_SECURE` 更精准，因为它只作用于工具自己的覆盖层，不会让整个游戏画面变黑（用 `FLAG_SECURE` 的话录屏会全黑，反而暴露）。

`EmulatorShortcutService` 继承 `AccessibilityService` ，但它的能力被压到最小：

也就是说，无障碍权限在这里的唯一用途是 **在模拟器里接收 F1F12 / AZ 的物理按键** （模拟器环境下悬浮窗拿不到按键焦点，必须借无障碍）。它不涉及读取其他 App 内容，这是它比一般游戏外挂「温和」的地方。

配置分两层存储：

**SharedPreferences + 快照对象**。 `AllConfigPersistence.Snapshot` 是一个扁平的 POJO，把几十个开关/数值一次性读写（ `editor.putBoolean(KEY_NATIVE_ATTACK_ICON_ENABLED, ...)` 、 `putInt(KEY_NATIVE_ATTACK_ICON_OFFSET_X, ...)` 等）。UI 上的每个控件都对应一个 `*ControlBinder` 类（ `AutoPickCostFilterControlBinder` 、 `ShopDisplaySettingsControlBinder` 、 `BoardOverlayTransformControlBinder` ……），把 View 与 Snapshot 字段双向绑定。

**原子 JSON 文件**。 `AtomicJsonFileStore` 用 `FILE_LOCK` 同步 + 临时文件替换的方式写 JSON，用于阵容、配置档案这类结构化数据。外层还有 `GameDataRefreshWorker` 、 `GameDataRefreshCoordinator` 走 `WorkManager` /后台线程做数据刷新与自动备份（对应 `CONFIG_AUTO_BACKUP_DELAY_MS` 、 `EXTERNAL_AUTO_BACKUP_FILE` ）。

**一个值得注意的设计**： `ConfigPreferenceNamespaces` 定义了一组 **被排除在「配置导出/导入」之外的命名空间**：

即： **凭证/设备身份、在线状态代际、IPC 修订号、注入运行时状态、公告已读、服务端下发的 UI 策略** 这六类不随配置迁移。前两类是安全考虑（防止导出配置时泄漏凭证或让别人冒用设备身份），后几类是「机器本地状态」，跟着配置走会导致 IPC 版本错配（呼应第二节的 `REJECTED_STALE_REVISION` ）。

三段式：

事件驱动的播报（三星预警报名、梭哈达成等）由 IPC 事件触发，走 `LineupActiveBus` 之类的总线分发。

「浏览器同步查看战况」的网页共享（ `switchWebShare` 、 `ACTION_SET_WEB_SHARE` ）在 Java 侧只看到一个开关和服务端交互，实际网页渲染大概率在服务端，本地不实现——Java 侧找不到 WebView 或本地 HTTP server 的实现。

**关键算法全部在 `libdemo.so` 里，不在 `libinject.so` 。**

`libdemo_compat.so` 与 `libdemo.so` 只差约 4 KB，是同一份代码针对 x86（模拟器/houdini 翻译层）的构建变体。Java 侧选择逻辑在 `NativeLibrarySelector` ： `Build.SUPPORTED_ABIS[0]` 含 `"x86"` 就用 `demo_compat` ，否则用 `demo` 。

四个库都只有 **arm64-v8a** 一个 ABI 目录，x86_64 版本也是放在 `lib/arm64-v8a/` 下由注入器显式按需选取（ `INJECT_NAME_X86_64 = "libinject_x86_64.so"` ），不走系统 ABI 分发。

它是 **PIE 可执行文件** （ `readelf -h` 显示 `Type: DYN` ，但有 `.interp` 段），由 root shell 直接执行，而不是被 `System.loadLibrary` 加载。字符串表里的 Usage 暴露了出身：

即基于开源项目 **AndKittyInjector** （内部用 KittyMemory，符号 `KittyCmdln::addFlag` / `addScanf` 可证）。

**它做三件事：**

**定位目标进程**： `-pkg com.脱敏.jkchess` / `-pid N` 。还支持 `-watch` 模式——用 `inotify_add_watch` 监听 `/proc` 目录，配合 `android_event_am_proc_start` 结构体识别 AMS 的进程启动事件，等游戏进程一起来就注入（字符串 `watch_proc_inject` 、 `E: -watch is used but the target process is already alive.`）。本样本实际走的是 `-pid` 路径。

**无文件注入**： `-dl_memfd` 开关。字符串 `E: nativeInject: memfd_create failed` 、 `I: nativeInject: memfd_rand(%d) = %s.` 表明它把待注入的 `.so` 读进匿名内存（memfd），再用 `dlopen("/memfd:随机名")` 加载，磁盘上不落地文件。memfd 名带随机后缀，Java 侧用正则 `memfd_rand\(\d+\)\s*=\s*([A-Za-z0-9._-]{5,64})\.` 从注入器输出里把这个随机名抠出来，再去 `/proc/<pid>/maps` 里核对是否真的映射成功。

**隐藏痕迹** （可选）： `-hide_maps` （重新映射段以从 `/proc/pid/maps` 消失， `hideSegments` ）、 `-hide_solist` （从 linker 的 soinfo 链表里摘除， `SoInfoPatch` ）。字符串：

有两条注入路径： `nativeInject` （普通进程，ptrace）和 `emuInject` （模拟器/翻译层进程，失败会回退到传统 dlopen： `I: emuInject: memfd failed, falling back to legacy dlopen.`）。这解释了为什么需要单独的 `libinject_x86_64.so` 。

**注意一个细节**：Java 侧实际拼出的命令行（ `MainActivity.java:2072` ）只传了 `-dl_memfd` ， **没有显式传 `-hide_maps` / `-hide_solist`**。这两个开关是否默认开启，需要反汇编 `KittyCmdln::addFlag` 的默认值才能确定；仅凭字符串无法判断。从 `MainActivity` 会在 `/proc/<pid>/maps` 里主动搜 `/memfd:` 前缀来看，memfd 映射 **是可见的**，至少 maps 这一层没有隐藏。

这是全样本真正的核心。5.5 MB，静态链接 libc++，内嵌 nlohmann/json 3.11.3。

`libdemo.so` 只导出了两个符号：

`Java_com_android_support_*` 一个都没有——说明所有 native 方法都是在 `JNI_OnLoad` 里用 `RegisterNatives` **动态注册** 的。字符串表里能找到完整的注册用方法名与签名：

后者（ `(JJI)[J` 、 `(J)[J` ）对应 `DiagnosticSharedMemoryBridge` 里 `nativeDrain(long, long, int)` 返回 `long[]` 、 `nativeReadHeader(long)` 返回 `long[]` 这类共享内存读取接口。

`Java_com_tdatamaster_tdm_system_FileUtils_FileUtilsInit` 是 **腾讯 DataMaster SDK 的 JNI 符号** （ `com.tdatamaster.tdm` 是腾讯的数据采集 SDK）。样本里既没有 `com.tdatamaster` 的 Java 类，也没找到调用它的地方。可能是作者拿含该 SDK 的工程当模板留下的残留，也可能是刻意放的干扰项—— **未能确认，标为疑点**。

`libdemo.so` 字符串表里出现了一批「类名\_方法名」形式的标识符，全部指向游戏《金铲铲之战》的 IL2CPP 方法（游戏用 Unity IL2CPP，Java 侧会检测 `/proc/<pid>/maps` 里的 `libil2cpp.so` ）。这些是它 hook 或调用的落点：

外加一个 C++ 命名空间 `NativePlayerListDecor::PostRefreshAll` （ `ZN21NativePlayerListDecor12_GLOBAL__N_114PostRefreshAllEv` ），是工具自己写的玩家列表装饰器。

**这批 hook 点直接解释了所有「预测」类功能为什么可能：**

一个佐证： `libdemo.so` 内嵌 `hex_refresh_predictor` 命名空间与 `PredictionSnapshot` 结构（ `hex_refresh_predictor::PredictionSnapshot` 、 `OnSpecifiedHexPredictionPublished` ），即「海克斯刷新预测器」是 native 里一个独立模块，预测快照算好后通过 IPC 推给 Java 侧。所谓「预测」是在这个模块里，基于被 hook 的 RNG 状态做的。

`libdemo.so` 里出现的点号分隔命令名，是 IPC v2 协议的另一端。它与 Java 侧 `SharedMemManager` / `LocalSocketIPC` 共同构成通信层（详见第二节）：

配套的错误/拒绝码：

`REJECTED_STALE_GENERATION` / `REJECTED_STALE_REVISION` 说明协议带 **代际号（generation）与修订号（revision）校验**，防止 App 与 native 版本错配后继续发命令。

native 内部还有自己的 IPC 实现命名空间 `ipc_v2` （ `N6ipc_v27WriteIoE` 、 `N6ipc_v28FdCloserE` ），即 IPC v2 的收发逻辑在 native 侧有一份独立实现。

以下问题仅靠 `strings` + 反汇编无法定论，需要 IDA 介入：

以下结论来自 IDA Pro 对 `libdemo.so` 的静态分析（镜像 base `0x0` ，实际大小 `0x554970` ，7060 个函数，符号表已 strip，仅 `JNI_OnLoad` 与一个腾讯 SDK 导出保留名字）。

`JNI_OnLoad` （ `0x2958D8` ）的结构是：

三个注册函数结构同构（各 `0x104` 字节），都是 `FindClass` → `RegisterNatives` → `DeleteLocalRef` 。表地址与条目数：

**`NativeTrustBridge` （20 个，含函数地址）**——授权信任链的全部 native 接口：

**`DiagnosticSharedMemoryBridge` （8 个）**： `nativeCreateReader(J)Z` `0x340854` 、 `nativeDuplicateReaderFd(J)I` `0x340A2C` 、 `nativeCloseReader(J)V` `0x340ACC` 、 `nativeReadHeader(J)[J` `0x340B60` 、 `nativeDrain(JJI)[J` `0x340CF0` 、 `nativeReadThreadStacks(J)[J` `0x340FF8` 、 `nativeReadFeatureHealth(J)[J` `0x34194C` 、 `nativeReadCrashSlot(J)[J` `0x341BE0` 。全部围绕「从 native 侧共享内存读诊断快照」， `(J)[J` 说明每次返回一组 `long` （定长槽位）。

**`WigVerify` （12 个）**： `nativeGetVersionCode` `0x353E6C` 、 `nativeGetVersionName` `0x353E78` 、 `nativeGetChannelUrl` `0x353F44` 、 `nativeGetOfficialPrefix` `0x354034` 、 `nativeGetOfficialHandle` `0x354138` 、 `nativeGetOfficialChannelUrl` `0x35420C` 、 `nativeGetOfficialSupportUrl` `0x3542FC` 、 `nativeGetOfficialGroupUrl` `0x3543F0` 、 `nativeGetOfficialTextChecksum` `0x3544E0` 、 `nativeGetOfficialChannelChecksum` `0x3544F0` 、 `nativeGetOfficialSupportChecksum` `0x354500` 、 `nativeGetOfficialGroupChecksum` `0x354510` 。

注意这 12 个方法是 **纯 getter**：返回版本号、官方频道 URL 和对应 checksum。checksum 由 native 侧算出期望值，Java 侧 `WigVerify` 拿到后再校验——即「官方频道防伪」，防的是二次打包者替换成自己的推广链接。 **这里没有密码学，只有完整性校验。**

从字符串表推断出的 `nativeAttackIconEnabled` / `nativeAttackIconOffsetX/Y` / `nativeAttackIconSizePercent` / `nativePlayerEconName` 这 5 个名字 **不在以上任何注册表中**——它们只是 `AllConfigPersistence` 里的 SharedPreferences 键名撞了 `native` 前缀，不是真正的 JNI 方法。这是纯字符串检索容易踩的坑，在此更正。

hook 安装点在 `sub_293304` （ `0x293304` ，6952 字节，native 侧初始化主函数）。它内部对每个 hook 目标重复同一段模式：

结论： **它不用 IL2CPP 的 `il2cpp_class_get_method_from_name` 之类 API 按名字解析方法，而是把每个目标函数在 `libil2cpp.so` 里的偏移硬编码在一张表（ `0x566DD0` ）里，运行时用「基址 + 偏移」直接算出地址。** 表里同时存了 `libil2cpp.so` 和 `libunity.so` 两套偏移（字符串 `libil2cpp.so` 与 `libunity.so` 都出现在这里）。

这解释了工具的版本依赖： **游戏每更新一次，只要 IL2CPP 生成代码布局变了，这张偏移表就得跟着改。** 612 / 632 这类版本号差异很可能就对应不同的偏移表。

`sub_38A764` （384 字节）做地址校验：

`syscall(270)` 在 arm64 上是 **`process_vm_readv`**。它对自己进程（ `getpid()` ）调用 `process_vm_readv` 读取目标地址的 4 个字节—— **这是安全的内存可读性探测**：地址非法时 `process_vm_readv` 返回 `EFAULT` 而不是触发 `SIGSEGV` ，于是可以在不崩溃的前提下判断「这个偏移算出来的地址到底是不是有效代码」。读到 `0xDEADBEEF` / `0xCCCCCCCC` 这类毒值也判为无效。

真正装钩的是 `sub_4435E4` 。在 `libdemo.so` 整个字符串表里搜索 `dobby` / `shadowhook` / `xhook` / `substrate` / `And64InlineHook` 等常见 inline hook 框架标识， **一条都没有**——所以这是 **自研的 inline hook 引擎** （自写指令重定位 + trampoline）。

`sub_293304` 内引用的全部字符串（53 条去重）如下，去掉路径与格式串后即为 hook 目标全表。

**渲染与主循环**

`eglSwapBuffers` 这个 hook 是理解「游戏内显示经济」「棋子脚下牌库」「攻击准星」的关键：这些 **不是** Android WindowManager 悬浮窗，而是 hook 了游戏的 GL 交换点，把内容 **直接画进游戏自己的 GL 表面**。所以它们能严丝合缝跟着棋盘走，配合 `ScreenSecureController` 的反截屏处理（见第五节）在截图时隐藏。

**商店与英雄**

`SelectHeroVectorByUserLevel` + `GetBadLuckProtectionV2` + 三个 `FRandom*` 合在一起，就是「商店还剩什么、下一刷会出什么」的完整信息链—— **预测能力来自 hook 住整条随机链路，而不是概率推算。**

**海克斯**

**装备与重铸**

**玩家与对手**

`OpponentPrediction.SelectHighScore` 被直接 hook，说明「下一轮可能遇到谁」是在游戏自己的匹配/评分函数上取数，同样属于 **读取** 而非推算。

**推荐与面板**

**输入与其他**

`WriteInput` 被 hook 是「自动拿牌 / 一键卖牌 / 一键换位 / 自动刷新商店 / 一键梭哈」的实现基础：工具构造游戏自己的输入结构体再调用被 hook 的 `WriteInput` ， **在游戏引擎看来这就是玩家操作**，不经过 Android 触摸注入，因此不受 `FLAG_NOT_TOUCHABLE` 影响，也不需要无障碍的点击能力。

`sub_293304` 里能看到加密字符串的解密内联展开：

即 native 侧字符串用 **一次性惰性解密** （首次访问时 XOR 还原并原地写回， `+17` 是「已解密」标志位）。密钥是 `xmmword_16F60` 与单字节 `0x15` 。这解释了为什么 `strings` 只能捞到一部分明文——hook 目标名与协议命令名是明文，系统属性名和日志文案是加密的。

**它不是预测，是三种来源的读取，按优先级择优采用。** 主力来源是把 `preMatchData` 的读取挂在游戏主循环帧回调 `CSoGame_FrameTimeTick` 上， **每帧轮询游戏自己的赛前配对数据结构**；兜底来源是钩住游戏自己的对手选择函数 `OpponentPrediction.SelectHighScore` 抄结果。Java 侧只做「挑一个可用 id 显示」，没有任何推算。

`MatchupSnapshot.sourcePriority()` 明确了三条来源及其优先级：

裁定规则在 `MatchupSnapshot.shouldAccept()` ：快照过期就直接接受； `matchId` 更大就接受、更小就丢弃； `matchId` 相同则比较 `sourcePriority` ，高者胜。即 **同一局内高优先级来源可以覆盖低优先级来源，但反过来不行**。

补充（详见 7.7.1）：native 侧 `source` 实际是 **数字 id** （1= `selectHighScore` 、2= `preMatch` 、3= `preMatchData` ），由 `libdemo.so` 内一张相对偏移表映射成字符串。表中 **只有这 3 项**。

在第六节 6.7.4 列出的 hook 表里， `CSoGame_FrameTimeTick` 的处理器就是 `sub_28EB48` （8092 字节）。装钩现场（ `0x293b64` – `0x293b8c` ）：

所以 **游戏每渲染一帧，它就重新读一次赛前配对数据**。这就是该功能看起来「实时、不滞后」的原因——数据一直在刷新，而不是在回合开始时算一次。

读取地址来自运行时解混淆的全局量（ `sub_27E3D4` ）：

`qword_5516A0` 是模块基址，右侧常量是 XOR 掩码—— **与 6.7.2 的硬编码偏移表是同一套设计**，只是这里多了一层掩码混淆。实际读取的是 `qword_564AF8 + a1` 。

读取前先做地址合法性校验，然后用 `process_vm_readv` 自读 8 字节：

`syscall(270)` = `process_vm_readv` ，对 **自身进程** 调用——地址非法时返回 `EFAULT` 而不是触发 `SIGSEGV` ，于是能在不崩溃的前提下验证「这个偏移算出来的地址到底有没有东西」。这与 6.7.3 里 `sub_38A764` 用的是同一个技巧。

校验通过后按结构体内容分类，失败路径各自带一个诊断标签：

这些标签既用于日志，也直接决定 `source` 字段的取值（ `preMatchData-empty` 会作为独立 source 上报，Java 侧识别为「显式空」）。 `preMatchData-unrecognized` 的存在说明 **它对游戏结构体布局有版本假设**，与 6.7.2 的偏移表问题同源。

处理器 `sub_28C6F4` （152 字节）短得出乎意料：

三点值得强调：

发布路径为 `sub_28EB48` / `sub_2C0524` → `sub_2D6880` （JSON 组装，426 行）。字段从反编译中逐个确认：

**`pairs` 是整张配对表，不是只有我这一对**——游戏这一轮谁打谁全部在里面。这是理解该功能能力边界的关键：它拿到的是全局配对结果，因此可以标出「攻击准星」、预告别人的对局，而不只是自己那一场。

`ghost` 字段（ `-1` 表示无，否则为被复制的玩家座位号）对应游戏里的 **幽灵对局**：你打的不是本人，而是某个玩家阵容的快照。Java 侧对此有专门处理—— `OpponentSelectionPolicy.resolveFromPairs()` 里，当 `ghostSourcePlayer != -1` 时返回的是 **幽灵的源玩家**，也就是「你实际面对的是谁的阵容」。玩家座位号有效范围是 `0..7` （八家）。

数据到达后由三件小事决定显示什么：

**`MatchupSnapshot`** 负责接收裁定：来源优先级、 `matchId` 新旧比较、新鲜度（ `isFresh` 带时间窗）。

**`OpponentSelectionPolicy.resolve()`** （140 行）是三级回退：

`isSelectableOpponent()` 会排除自己，并检查该座位玩家 `hp != 0` （已淘汰的不能当对手）。

**`retainDuringActiveMatch()`** 做防抖：对局进行中，只要推来的对手 **还活着** （ `hp != 0` ）就保持显示不清空，避免每帧刷新时界面闪断。这个函数也解释了为什么 `OpponentMatchupRefreshPolicy.Resolved` 里会同时保留 `opponentId` 和 `retainedPlanningOpponentId` 两个字段。

初稿留下的四个疑点已逐个查清，其中第 2 条推翻了初稿的判断。

初稿说 `preMatch` / `selectHighScore` 是「无交叉引用的孤立字符串」。 **这个判断是错的。**

真正的机制在 JSON 构建器 `sub_2D6880` 里（第 113 行）：

`a4` 是 **数字 source id** （1 基）， `dword_212BA8` 是表自身地址，表项是 **相对自身的负数偏移**。因为存的是计算出来的偏移而不是重定位指针，IDA 无法把它识别成交叉引用——这正是初稿搜不到 xref 的原因。

表在 `0x212BA8` ，实测 **只有 3 项**：

验算 id=3： `0x212BA8 + (int32)0xFFE08ED3 = 0x212BA8 - 0x1F712D = 0x1BA7B` ，正是 `preMatchData` 。

**由此得到一条重要结论：native 侧能发出的 `source` 只有这 3 个值。** `preMatchData-empty` / `-unavailable` / `-invalid-array` / `-unrecognized` 这几个标签走的是 `sub_2F7250` （1412 字节的 **诊断事件发射器**，写入结构化诊断流）， **不进入 matchup 信封的 `source` 字段**。也就是说 Java 侧 `MatchupSnapshot.sourcePriority()` 里对 `"preMatchData-empty"` 的处理、以及 `isExplicitEmpty()` 依赖的 `source.endsWith("empty")` 判断，在当前 native 构建下 **永远不会命中**——属于防御性/遗留代码。

它由 **同一个帧回调处理器** `sub_28EB48` 发出，不是另一条独立链路。该函数有 **两个发出点**：

调用点现场（ `0x2907b8` ）： `MOV W2, #2` → 即传入 sourceId=2。

语义上这是 `preMatchData` **解析失败后的降级路径**——同一帧内先用直读结构体尝试，不成再走次一级读取。两者共用同一个触发时机（每帧），所以「优先级」在时间上几乎没有差异， `shouldAccept` 的优先级比较更多是防止乱序覆盖。

它 **不是** `preMatch` 专有路径，而是一个 **共享的快照构建器**：

两个调用者分别传不同的 id：

即两条来源共用同一个组装与下发实现，只是 sourceId 不同。这也解释了为什么初稿会误判它「对应 preMatch」——它其实两个都发。

它是 **特性开关 + 节流闸门**，不是「是否进对局」或「是否已授权」的判定。展开四条子调用：

组合逻辑（ `sub_3D55F8` 本身只有 76 字节）：

所以它的作用是 **给兜底钩子限流**：只有当特性启用、或处于 1.5 秒活跃窗口、或通过 0.1 秒冷却时，才把 `SelectHighScore` 的结果抄下来并发 IPC。这是必要的—— `SelectHighScore` 在游戏里调用频繁，每帧都推会打爆 IPC。

比初稿推进了一步，但仍未拿到逐字段语义：

首读是对 `qword_564AF8 + a1` 的安全读取，读到的 `s` 是 **IL2CPP 数组对象**——检查 `s + 24 < 0x19` ，即在偏移 **+24** 处读长度字段并要求 ≥1，符合 IL2CPP `Il2CppArray` 头部（0x20 字节头 + 元素区）的布局。

真正的解析交给 `sub_3D73A0(src, count, out)` ，它只是个 88 字节的薄包装，转发给 **通用的 schema 驱动反序列化器**：

即字段布局 **不是硬编码偏移**，而是由描述符 `unk_21EFF0` （1520 字节）加字段回调表 `off_542ED0` （4 个字段）在运行时解释。字段回调本身是极薄的包装：

元素记录大小 **88 字节 / 4 字段**，与解析输出缓冲区（ `v144` ，120 字节）量级吻合。

结果分类逻辑（ `sub_28EB48` ）：解析返回 `v128 > 0` 即 `preMatchData-resolved` ； `v128 <= 0` 时，若长度 < 1 判 `empty` ，否则扫描缓冲区是否为全 `-1` ——全 `-1` 判 `empty` ，出现非 `-1` 判 `unrecognized` 。

**要拿到座位号与幽灵字段的确切偏移，需要读 `unk_21EFF0` 描述符表的字段偏移条目**，这比逐函数反编译更高效，留作后续。

**没有。所有与随机/概率相关的钩子都是只读观察器——照原参数调用原函数，照原值返回，不篡改任何一个随机结果。**

这可能会出乎意料，因为工具里确实有「指定海克斯」「指定重铸」这类看起来像在操控概率的功能。它们的实现方式是 **检测 + 行动**，而不是改概率（见 8.4）。

对 `libdemo.so` 中全部 7 个与随机/概率有关的钩子处理器做了逐个反编译核对：

几个值得单独说明的细节：

**`FRandom_RandomIntMax`** （最短的一个，92 字节）最能说明设计意图：

它连返回值都不碰，只把「随机上限」参数存进自己的全局量，供预测逻辑参考。

**`SelectHeroVectorByUserLevel`** （等级概率表，最大的一个）起初让我怀疑：它的尾调用传的是 `v92, v31` 而不是 `a1, a2` 。追进去发现 `v92 = a1` （ `0x2fa65c` ）、 `v31 = a2` （ `0x2fa8b0` 等三处），全是原参数的副本，只是借了局部变量传递。函数只有一个出口（第 977 行），且原样返回原函数结果。

**`_WithJCC` 后缀不代表改写。** `RandomEquipmentByQuality_WithJCC` 与 `RandomEquipmentByQuality` 是两个 **不同的游戏方法** （各自有独立的 hook 点和原始函数保存槽 `off_564F48` / `off_564F40` ），工具的处理器对两者一视同仁——都是调用后原值返回。后缀是游戏侧的命名差异，不是「被工具改过」。

工具确实下了不少功夫，但方向是 **提高读取精度** 而非改写。 `TAC_GenerateHeroListFromHeroPool` 的处理器里：

而 `FRandUtils_RandWeightsListIndex` 的处理器里正好检查这个标志：

`_WithJCC` 装备钩子里也有对称的一对 `atomic_store` 与 `v17` （「本次是工具发起的重铸」）标志。

这套设计的含义很清楚： **用一个跨钩子的共享标志位界定「现在是哪段业务」，只在该业务窗口内采集数据**，其余时刻直接放行。这是采集器的做法，不是改写器的做法——改写器不需要知道「现在处于哪个业务阶段」。

为排除「处理器原值返回、但在别处偷偷改状态」的可能，我把 `libdemo.so` 里所有原始 `syscall` 调用点枚举了一遍：

只有一处 `process_vm_writev` ，在 `sub_3703DC` ：

两条分支的目标都是 **`getpid()` ，即自身进程**。这是一个通用的「安全写入」原语（先 `mprotect` 再写），不是跨进程注入。

它的调用链只有两条：

即写内存的第二个用途是 **棋盘操作** （一键卖牌、一键换位），对应第七节之外的 `chess.sell` / `chess.mirror` 类命令。

**结论：全库有写内存的能力，但写入目标是代码段（装钩）与棋盘状态（卖牌/换位），没有一处指向随机数生成器或概率表。**

答案是 **检测 + 行动**，而不是操控结果：

这与作者自己的功能描述完全吻合——原文写的是「指定一件装备， **用重铸器锤出它时** 自动出手并提示」（命中即出手），而不是「锤出你指定的装备」。海克斯那条的措辞同样是「**预测命中时** 提示对应卡位」。

顺带说明一个容易混淆的边界： **工具确实会修改游戏状态** （卖牌、换位、拿牌、刷新、重铸都是真操作），只是走的是游戏自己的操作接口，在引擎视角与玩家操作无异。这与「修改概率」是两回事——前者是操作，后者是篡改随机源，本样本做的是前者。

| 项   | 值   |
| --- | --- |
| 样本  | `jcc记牌器.apk` |
| SHA-256 | `0df71b48c2daf299f2fb82e78cd8adb63dfcc88d43d854b1d561bb34a38e70d0` |
| 包名  | `com.android.support` （伪装） |
| versionName / Code | `632` / `67` |
| 目标应用 | `com.脱敏.jkchess` （） |
| 分析工具 | JADX-GUI + jadx-ai-mcp（Java 层）、IDA Pro + ida-pro-mcp（native 层）、strings/nm/readelf |
| 分析日期 | 2026-09-13 |

| 项   | 值   |
| --- | --- |
| 文件  | `jcc记牌器.apk` |
|     |     |
| 大小  | 20,966,526 字节（约 20 MB） |
| SHA-256 | `0df71b48c2daf299f2fb82e78cd8adb63dfcc88d43d854b1d561bb34a38e70d0` |
| 包名  | `com.android.support` （伪装的系统支持库名） |
| versionName / versionCode | `632` / `67` |
| minSdk / targetSdk / compileSdk | 28 / 37 / 37 |
| 类总数 | 7815 |
| 自研类 | 2280（均在 `com.android.support.*` ） |
|     |     |

| 功能  | 说明  |
| --- | --- |
| 一键激活 | 进对局后点一次，自动拿牌、海克斯预测、牌库等全部就绪 |
| 自动拿牌 | 商店刷出目标英雄自动购买，可按 1~5 费勾选 |
| 智能卡牌 | 盯住对手追的三星，自动买同名卡限制其成型，可设触发张数与保留金币 |
| 购买五费天选 | 刷出二星五费天选自动拿下，可指定只拿哪几张五费 |
| 追 3★ | 棋盘上有 2 星英雄时自动拿同名卡，按张数阈值触发 |
| 天选拿取 | 按阈值自动拿天选英雄，可一键全费天选 |
| 海克斯预测 | 提前知道本局三次海克斯的品质（银/金/彩）与具体选项 |
| 自动刷新商店 | 按节奏自动 D 牌，可设保底间隔与保留金币 |
| 一键卖牌 | 一键卖备战席 / 卖场上，快速清仓换经济 |
| 一键换位 | 左右/上下/中心对称镜像换位，也可自定义多对棋子互换 |
| 一键梭哈 | 自动追三星：拿牌、卖多余棋子、刷新一条龙，达成即停 |
| 阵容管理 | 保存/加载/切换多套阵容，A→B 一键换阵 |

| 功能  | 说明  |
| --- | --- |
| 牌库余量 | 实时显示每张牌在牌库还剩几张 |
| 棋子脚下牌库 | 在每个棋子头顶显示头像、我方张数与牌库余量 |
| 商店剩余显示 | 把牌库余量画进商店金币旁 |
| 自动选中已有英雄 | 牌库自动高亮你已拥有的英雄 |

| 功能  | 说明  |
| --- | --- |
| 指定海克斯 | 勾选想要的海克斯（最多 12 个），预测命中时提示对应卡位 |
| 指定重铸 | 指定一件装备，用重铸器锤出它时自动出手并提示 |

| 功能  | 说明  |
| --- | --- |
| 玩家数据 | 实时列出八家等级、经济、血量与阵容 |
| 对手预测 | 提前显示你下一轮可能遇到的对手，并给出攻击准星标记 |
| 三星预警 | 有对手快三星时弹横幅 + 语音播报，可按费用筛选 |
| 游戏内显示经济 | 把玩家名改成冰块等级 + 琥珀金币，两套颜色区分 |
| 同行识别 | 同一对局双方都开启时，在玩家列表互标★同行 |

| 功能  | 说明  |
| --- | --- |
| 属性修改 | 单机模式下修改金币 / 血量 / 等级 / 人口上限 |
| 英雄装备生成 | 生成指定星级英雄与成装，数量可选 ×1~×100 |
| 拦截弹窗 | 屏蔽游戏内弹窗 |
| iOS 转区 | 模拟 iOS 区服标识 |
| 退出对局 | 一键退出当前对局 |
| 网页共享 | 生成房间号，电脑与手机浏览器同步查看战况 |
| 防录屏/防截屏 | 开启后截图与录屏里看不到辅助界面 |
| 界面自定义 | 覆盖层透明度、HUD 配色、方框位置大小全部可调 |
| 配置管理 | 保存/加载/导出/导入整套配置 |
| 远程诊断 | 生成识别码给客服，授权后远程定位问题 |

| 类数  | 包   | 职责  |
| --- | --- | --- |
| 1429 | `com.android.support` （根） | 主逻辑：悬浮窗、各功能面板、控制绑定器 |
| 122 | `lineup` | 阵容仓库、元数据更新、推荐、修订策略 |
| 99  | `diagnostics` | 诊断协调器、事件存储、上报 |
| 97  | `FloatingWindowService$*` | 悬浮窗服务内部类 |
| 61  | `trust` | 授权信任链（native 桥 + 传输） |
| 17  | `MainActivity$*` | root / 注入流程内部类 |
| 13  | `SharedMemManager$*` | 历史遗留类名：实际已桩化， `readSharedMemoryOnce()` 直接返回 `new byte[0]` ，数据全部改由 native 主动推 JSON。详见第二节 |
| 12  | `LocalSocketIPC$*` | LocalSocket IPC |
| 12  | `OpponentPredictionControlBinder$*` | 对手预测 |
| 11  | `CloudTtsClient$*` | 云端语音合成 |
| 10  | `RankWarningControlBinder$*` | 三星预警 |

| view | BASE（根） | NSF（namespace 文件） |
| --- | --- | --- |
| `direct` | 空（当前进程视角） | 空   |
| `init` | `/proc/1/root` | `/proc/1/ns/mnt` |
| `target` | `/proc/PID/root` | `/proc/PID/ns/mnt` |

| 处   | 行为  | 位置  |
| --- | --- | --- |
| 运行时库 | `NativeLibrarySelector.shouldUseCompat()` → 用 `libdemo_compat.so` | `NativeLibrarySelector.java:13-26` |
| 注入器 | `INJECT_NAME_X86_64 = libinject_x86_64.so` | `MainActivity.java:2584` |
| 注入命令 | 追加 `-delay 3000000` （3s，等 NativeBridge 起来） | `MainActivity.java:2074-2076` |
| 注入 shell | 不走 `setenforce` ，改用 30s 轮询 + 超时 `kill -9` | `MainActivity.java:2077` |
| 目标就绪判定 | 跳过 `readInjectionTargetSnapshot` 那一套（ `if (!isEmulator)` 才做） | `MainActivity.java:2113-2114` |
| 稳定窗口 | `GAME_STABLE_WINDOW_MS_EMULATOR = 6000` （真机 3000） | `MainActivity.java:87-88` |
| 系统属性 | 模拟器分支不执行 `setenforce 0` | `MainActivity.java:2688-2693` |
| 快捷键 | 额外提供 `EmulatorShortcutService` （无障碍服务，F1-F12 等映射到自动拿牌/牌库/窗口开关），因为模拟器映射不出音量键 | `EmulatorShortcutService.java` |

| 通道  | 类型  | 方向  | 载体  | 用途  | 代码位置 |
| --- | --- | --- | --- | --- | --- |
| **IPC v2 抽象 socket** | Unix domain socket（abstract namespace） | 双向  | `LocalServerSocket("xf_game_control_v2")` | 全部业务：命令、状态推送、配置同步、心跳、诊断控制 | `LocalSocketIPC.java` |
| **IPC v2 TCP 回退** | TCP `127.0.0.1:39816..39820` | 双向  | `ServerSocket` | 抽象 socket 不可用时的备用传输（同一套协议） | `LocalSocketIPC.startServer()` `LocalSocketIPC.java:428` |
| **诊断共享内存页** | 匿名共享内存 + fd 传递 | native → App（App 侧轮询） | 262144 B page， `ParcelFileDescriptor` | native 侧 trace/事件/健康度/崩溃槽位 | `diagnostics/DiagnosticSharedMemoryBridge.java` |
| **Bootstrap Token 文件** | 文件交换 | App → native（单向投递） | 游戏数据目录下 `.xfjcc_ipc_v2_bootstrap` | 把 IPC v2 首次鉴权用 token 交给注入模块 | `IpcV2TokenStore.java` 、 `MainActivity.java:2043` |
| 旧共享内存数据面 | ——  | ——  | 已废弃 | `readSharedMemoryOnce()` 返回 `SENTINEL_DATA` （空数组） | `SharedMemManager.java:51, 1616` |
| PeerSync / 云端 | HTTP 网关（ `JccGatewayClient` ） | App ↔ 服务器 | ——  | 跨设备旁路同步， **不属于** 本机 native IPC | `PeerSync.java` |

| 发行版 | applicationId | socket 名 | TCP 起始端口 | bootstrap 文件名 |
| --- | --- | --- | --- | --- |
| FORMAL（正式） | `com.android.support` | `xf_game_control_v2` | 39816（~39820） | `.xfjcc_ipc_v2_bootstrap` |
| CANDIDATE | `com.android.support.candidate` | `xf_game_control_v2_candidate` | 39821 | `.xfjcc_ipc_v2_candidate_bootstrap` |
| TEST | `com.android.support.test` | `xf_game_control_v2_test` | 39826 | `.xfjcc_ipc_v2_test_bootstrap` |

| 约束  | 值   | 出处  |
| --- | --- | --- |
| 长度前缀 | 4 字节，大端，\`(b\[0\]<<24) | (b\[1\]<<16) |
| 单帧上限 | `MAX_FRAME_BYTES = 1048576` （1 MiB），超限抛 `FRAME_TOO_LARGE` | `IpcV2Protocol.java:16` 、 `IpcV2FrameCodec.java:50` |
| 空载荷 | 非法（ `INVALID_LENGTH` ） | `IpcV2FrameCodec.java:47, 70` |
| 编码  | 严格 UTF-8，非法序列抛 `INVALID_UTF8` （ `CodingErrorAction.REPORT` ） | `IpcV2FrameCodec.java:56, 67` |
| 无帧内校验和 | 没有任何 checksum / CRC 字段 | 通读 `IpcV2FrameCodec` 全文 |

| 字段  | 类型  | 含义 / 校验 |
| --- | --- | --- |
| `v` | int | 协议版本，必须 `== 2` （ `IpcV2Protocol.VERSION = 2` ），否则 `bad version` |
| `type` | string | 必须是 `state` / `response` / `event` / `ping` / `pong` / `error` 之一 |
| `sessionId` | string(base64url,16B) | 必须与服务端当前 session 完全相等，否则 `session mismatch` |
| `id` | string(base64url,16B) | 请求关联 id；收方用 `decodeBase64Url(id, 16)` 校验长度 |
| `seq` | int64 | **严格递增 1** （ `IpcV2Sequence.accept()` `IpcV2Sequence.java:18-25` ），违反则 `sequence violation` 断链 |
| `method` | string | 正则 `[A-Za-z0-9_.]+$` ，长度 ≤ 96（ `validMethod()` `LocalSocketIPC.java:1153` ） |
| `params` | object | 入站业务/事件体的键名 |
| `result` | object | 出站响应的键名； `error` 帧用 `error` 键 |

| 文件名 | 角色  |
| --- | --- |
| `ipc_v2_pending_token.json` | 本次注入新生成的待用 token |
| `ipc_v2_current_token.json` | 已鉴权通过的当前 token |
| `ipc_v2_bootstrap.json` | 投递给 native 的引导文件 |

| 附加字段 | 值   | 说明  |
| --- | --- | --- |
| `matchGeneration` | 当前对局的 22 字符 generation | 无对局时本地直接拒绝，返回 `no_active_match_generation` |
| `createdBootMs` | `SystemClock.elapsedRealtime()` | 创建时刻 |
| `ttlMs` | `ACTION_TTL_MS = 5000` | native 侧过期丢弃 |
| 请求超时 | `REQUEST_TIMEOUT_MS = 6000` | 客户端侧回调超时 |

| 方法名 | 语义  | 关键 params 字段 | 代码位置 |
| --- | --- | --- | --- |
| `game.modifyGold` | 改金币 | `value`, `targetMask`, `targetSelf` | `SharedMemManager.modifyGold()` `:847` |
| `game.modifyHp` | 改血量 | `value`, `targetMask`, `targetSelf` | `:857` |
| `game.modifyLevel` | 改等级 | `value`, `targetMask`, `targetSelf` | `:867` |
| `game.modifyPopulation` | 改人口 | `delta`, `targetMask`, `targetSelf` | `:1132` |
| `game.exit` | 退出对局 | 无   | `:1141` |
| `drop.generateHeroes` | 凭空生成英雄 | `heroIds[]`, `starLevel`, `targetMask`, `targetSelf` | `:876` |
| `drop.generateEquipment` | 凭空生成装备 | `equipIds[]`, `targetMask`, `targetSelf` | `:889` |
| `chess.sell` | 一键卖英雄 | `mode` (1备战席/2场上/3全部), `costMask` (≤31), `keepHeroIds[]` (≤64), `keepCardingTargets` | `:920-999` |
| `chess.mirror` | 一键镜像换位 | `axis` (0水平/1垂直/2中心对称) | `:1039` |
| `chess.customSwap` | 自定义换位 | `pairs[]` （JSONArray） | `:1054` |
| `chess.allIn.start` | 一键梭哈启动 | `maxTargets` (1-9), `reserveGold` (0-50), `blockedAction` (0/1), `keepLineup` (0/1), `ackTimeoutMs` (2000-6000), `costMask` (8/16/24), `priorityHeroIds[]` (≤64) | `:1072-1100` |
| `chess.allIn.stop` | 一键梭哈停止 | 无   | `:1107` |
| `cancelChessOp` | 取消所有 ChessOp 任务（走 `sendCommand` ， **不带** `matchGeneration` ） | 无   | `:1111-1113` |
| `lineup.apply` | 把 App 侧阵容反向注入游戏 | `heroes[]`, `title`, …（整个 JSON 由调用方给） | `:1263-1270` |
| `lineup.clear` | 清除 App 注入的阵容 | 无   | `:1325-1331` |
| `lineup.syncToSlot` | 同步阵容到指定槽位 | `title`, `shareCode`, `deckIndex` | `:1339-1346` |
| `hex.query` | 查询海克斯强化等级（广播式，见 2.5） | 无   | `:403` 、 `HexQueryBroker` |
| `hex.specify` | 指定海克斯 | `targetHexIds[]` (1-12 个), `stage` (1-3), `matchGeneration` | `:1499-1528` |
| `hex.cancel` | 取消指定海克斯 | `matchGeneration` | `:1535-1541` |
| `recast.specify` | 指定重铸目标 | `targetEquipId` (1-1000000), `targetTier` (0-1000), `matchGeneration` | `:1548-1563` |
| `recast.cancel` | 取消重铸指定 | `matchGeneration` | `:1570-1576` |
| `diagnostics.uiApplied` | 诊断 UI 发布回执 | `DiagnosticUiPublication.receipt(status)` | `:2548-2554` |

| 方法名 | 语义  | params | 代码位置 |
| --- | --- | --- | --- |
| `config.replace` | **全量配置下发** （核心配置面） | `revision` + 全部配置键，见下表 | `LocalSocketIPC.enqueueLatestConfig()` `:864-910` |
| `hudStyle.replace` | HUD 配色下发 | `revision`, `levelRgb`, `goldRgb`, `shopRgb`, `selfRgb`, `fightRgb` | `:970-1013` 、 `HudAppearance.toIpcParams()` `HudAppearance.java:126-137` |

| 方法名 | 语义  | params | 超时  | 代码位置 |
| --- | --- | --- | --- | --- |
| `diagnostics.trace.attach` | 把诊断共享内存页 fd 挂到游戏进程 | `{generation, mode(2=DEEP, 否则 1), expiresMonoNs, featureMask[]}` **\+ 附带 fd** | 5000 ms | `LocalSocketIPC.sendDiagnosticTraceAttach()` `:813-842` ；参数见 `DiagnosticSharedMemoryBridge.attachParams()` `:218-232` |
| `diagnostics.trace.disable` | 撤销诊断页挂载 | `{generation}` | 5000 ms | `FloatingWindowService.java:4811-4825` （ `DiagnosticCoordinator.IPC_TIMEOUT_MS = 5000` ） |
| `debug.pointers` | 取调试指针 | `{}` | 5000 ms | `SharedMemManager.requestDebugPointers()` `:1583-1587` |
| `acceptTrustLease` | 信任租约下发 | `{trust_generation, lease[], device, server_time_offset}` | 3000 ms | `trust/NativeTrustBridge.java:1880, 2193-2205` |
| `activateWigSession` | 激活 WIG 会话 | `{trust_generation, expiry, token, payloadKind, device, binding, server_time_offset}` | 3000 ms | `NativeTrustBridge.java:1928, 2151-2162` |
| `acceptFeatureCatalog` | 下发功能目录 | `{trust_generation, words}` | 3000 ms | `NativeTrustBridge.java:2008, 2108-2114` |
| `clearTrustLease` | 清除信任租约（ `sendCommand` ） | `{trust_generation}` | 3000 ms | `NativeTrustBridge.java:2217-2218, 2208-2215` |

| 类型 / 方法 | 方向  | 说明  | 代码位置 |
| --- | --- | --- | --- |
| `type=ping`, `method=heartbeat.ping` | App → native | App 每 5 s 发一次， `params` 为空 | `LocalSocketIPC.maintain()` `:767` |
| `type=pong`, `method=heartbeat.pong` | App → native | 收到 native 的 `ping` 后回敬， `id` 回显 | `handleInbound()` `:711` |
| `type=ping` | native → App | native 也会主动 ping | `:710` |
| `type=pong` | native → App | 收到即刷新 `lastReceivedBootMs` ，不做别的事 | `:714-716` |

| 方法名 | 语义  | 关键字段 | 处理函数 |
| --- | --- | --- | --- |
| `match.started` | 对局开始 | `matchGeneration` (**必须 22 字符**), `sessionGeneration` (>0) | `parseStarted()` `IpcMatchLifecycleParser.java:20-30` ； `SharedMemManager.handleMatchStarted()` `:2066` |
| `match.ended` | 对局结束 | `matchGeneration` | `parseEnded()` `IpcMatchLifecycleParser.java:32-34` ；`:2087` |
| `connected` | native 侧"我连上了/断了" | `value` (bool) | `handleConnected()` `:2097-2103` |
| `updatePlayers` | 8 名玩家状态（英雄、经济、对手） | `players[{id,hp,level,gold,rank,isMe,name,enemy,avatarUrl,avatarId,isBot,botKnown}]`, `dualPlay`, `turnState`, `profileProbe` | `IpcPlayersParser.parse()` ；`:2330-2351` |
| `updateHeroPool` | 牌库剩余 | `pool[].heroes[{heroID,cost,currentCount,totalCount}]`, `locked[{heroId,cost,leftCount,totalCount}]` | `IpcHeroPoolParser.parse()` ；`:2378` |
| `updateBoardPositions` | 各玩家棋盘/备战席 | `positions[{playerId,isMe,boardMask,benchMask,boardCount,benchCount,boardHeroes[≤28],benchHeroes[≤9]}]` | `IpcBoardPositionsParser.parse()` ；`:2394` |
| `updateMyOwnedHeroes` | 自己拥有的英雄与张数 | `heroes[]`, `pieceCount` | `IpcMyOwnedHeroesParser.parse()` ；`:2416` |
| `updateOpponentCardingStatus` | 卡对手牌状态 | `state`, `summary`, `targets[{playerId,name,heroId,copies,threshold,purchaseEligible,reason,ownedCopies,maxOwnedCopies,neededCopies}]` | `IpcOpponentCardingParser.parse()` ；`:2250` |
| `toast` | native 让 App 弹提示 | `text` | `handleNativeToast()` `:2106-2112` |
| `updateAllInStatus` | 一键梭哈运行状态 | `active`, `reason` | `IpcAllInStatus.parse()` ；`:2061-2062` |
| `updateBoardHeroAnchors` | 棋子头顶锚点（屏幕坐标） | `sequence`, `planning`, `anchors[]` | `IpcBoardHeroAnchorsParser.parse()` ；`:2432` |
| `updateHexPrediction` | **海克斯等级查询结果** （ `hex.query` 的回程） | `matchGeneration`, `available`, `levels[4]`, `livePool[]`, `livePoolWeights[]`, `livePoolTotalWeight`, `drawsPerStage`, `reason` | `IpcHexLevelsParser.parse()` ； `parseHexData()` `:2443-2470` |
| `hex.specified.status` | 指定海克斯执行状态 | （见 `parseSpecifiedHexStatus` ） | `:2206` |
| `updateMatchup` | 对手预测配对 | `myId`, `opponentId`, `matchId`, `source`, `pairs[{p1,p2,ghost}]` | `IpcMatchupEnvelopeParser` / `IpcMatchupPairsParser` ；`:2474-2492` |
| `updateOpponentDiagnostics` | 对手预测诊断 | `{...}` | `parseOpponentDiagnostics()` `:170` |
| `updateShopAutomationDiagnostics` | 商店自动化诊断 | `{...}` | `:174` |
| `updateSpecifiedShopStatus` | 指定商店状态 | `armed, ready, targets, roster, unaffordable, reachable, predictions, refreshed, landed` | `parseSpecifiedShopStatus()` `:2557-2561` |
| `updateGameRecommendUiDiagnostics` | 阵容推荐 UI 诊断 | `{...}` | `:166` |
| `updateGameRecommendHookDiagnostics` | 阵容推荐 hook 诊断 | `{...}` | `:162` |
| `updateRankAnchors` | 排行 HUD 锚点 | `anchors[]` | `IpcRankAnchorsParser.parse()` ；`:2652` |
| `updateShopSlots` | **商店 5 个槽位的英雄** | `slots[{index,heroId}]` | `IpcShopSlotsParser.parse()` （含 FNV 指纹 `FINGERPRINT_SEED = -3750763034362895579` ）；`:2705` |
| `updateGameRecommendTeam` | 阵容推荐队伍 | `{...}` | `IpcGameRecommendParser` ；`:2612` |
| `updateGameRecommendActive` | 阵容推荐激活目标 | `active`, `heroIds[]` | `:2602-2609` |
| `recast.specified.status` | 指定重铸运行状态 | `RecastRunStatus` JSON | `:2143` |
| `recast.pool.catalog` | 重铸候选池目录 | `RecastLivePoolCatalog` JSON | `:2173` |

| 常量  | 值   | 用途  | 出处  |
| --- | --- | --- | --- |
| `ACCEPT_TIMEOUT_MS` | 3000 | accept/握手读超时 | `LocalSocketIPC.java:49` |
| `HANDSHAKE_TIMEOUT_MS` | 3000 | 握手阶段 `setReadTimeout` | `:53` |
| `FRAME_TIMEOUT_MS` | 5000 | 握手完成后的读超时（每 5 s 无帧即醒一次去检查心跳） | `:52` |
| `HEARTBEAT_INTERVAL_MS` | 5000 | App 主动 ping 间隔 | `:54` |
| `HEARTBEAT_TIMEOUT_MS` | 30000 | **30 s 没收到任何帧即判定断线** | `:55` |
| `REQUEST_TIMEOUT_MS` | 3000 | `sendCommand()` 默认请求超时 | `:60` |
| `ACTION_TTL_MS` | 5000 | 业务动作 `ttlMs` | `IpcActionSender.java:10` |
| `REQUEST_TIMEOUT_MS` （动作） | 6000 | 业务动作请求超时 | `IpcActionSender.java:11` |
| `CONFIG_SYNC_TIMEOUT_MS` | 30000 | 配置/配色同步等的 pending 超时 | `:50` |
| `MAX_CONFIG_SYNC_RETRIES` | 5   | 配置同步最大重试 | `:58` |
| `HEX_QUERY_TIMEOUT_MS` | 4000 | 海克斯查询整体超时 | `SharedMemManager.java:49` |
| `MATCHUP_SNAPSHOT_MAX_AGE_MS` | 6500 | 对手快照保鲜期 | `SharedMemManager.java:50` |
| `pending` 队列容量 | 128 | 未决请求上限，满则 `busy` | `LocalSocketIPC.java:74` ； `IpcV2PendingRequests` |
| 出站队列容量 | control 64 / request 128 / state 64（唯一键）/ event 16 | 满则 `BUSY` | `LocalSocketIPC.java:245` ； `IpcV2OutboundQueue` |

| 下标  | 字段  | 含义  |
| --- | --- | --- |
| 0   | `generation` | 页代数（与 attach 请求一致） |
| 1   | `mode` | 1 / 2（DEEP），来自 `DiagnosticGrant.Mode` |
| 2   | `writeTicket` | **写票据 / 生产者写指针** |
| 3   | `droppedEvents` | 丢弃事件累计 |
| 4   | `gameFrameHeartbeatNs` | 游戏帧心跳 |
| 5   | `nativeWorkerHeartbeatNs` | native worker 心跳 |
| 6   | `matchEpoch` | 对局纪元 |
| 7   | `flags` | 位标志 |
| 8   | `attached` | != 0 表示已挂载 |

| 优先级 | 来源  | 目录 / 载体 | `DatasetSnapshot.override` | `generation` 值 |
| --- | --- | --- | --- | --- |
| 1   | v2 Bundle Store | `filesDir/lineup_data_v2/sets/<setId>/versions/<gen>/` | `true` | `CURRENT` 指针里的 64 位十六进制 generation |
| 2   | Legacy Override | `filesDir/lineup_data/<setId>/` （单文件平铺） | `true` | `"legacy:" + SHA-256(...)` |
| 3   | APK 内置 assets | `assets/lineup/<setId>/` | `false` | `"asset:lineup/<setId>"` |

| JSON 字段 | 映射到 `Lineup` 字段 | 说明  |
| --- | --- | --- |
| `id` | `f89id` | 阵容唯一 id |
| `name` / `author` | `name` / `author` |     |
| `quality` | `quality` | 品质，评分时用： `"S"` 加 1.0 分， `"N"` 加 0.5 分 |
| `feature` | `featureMapId` | 海克斯/地区特性 id |
| `share_code` | `shareCode` | 游戏内分享码， `lineup.syncToSlot` 必需 |
| `early_info` / `d_time` | `earlyInfo` / `dTime` |     |
| `equip` | `equipOrder` | 逗号分隔的装备优先级列表 |
| `hex_recomm` / `hex_replace` | `hexRecomm` / `hexReplace` | 推荐/可替换海克斯 |
| `early_heroes` / `mid_heroes` / `late_heroes` | `earlyHeroes` / `midHeroes` / `lateHeroes` | 字符串数组；也兼容写成单个字符串（ `readMaybeArray` ） |
| `final_level` | `finalLevel` |     |
| `final_units` | `finalUnits` | 对象数组，见下 |

| JSON 字段 | 含义  |
| --- | --- |
| `hero_id` | 英雄 id 字符串 |
| `loc` | 棋盘坐标，格式见 3.7.2 |
| `carry` | 是否主 C |
| `equip` | 该英雄的装备 id 列表（逗号分隔） |
| `type` | 默认 `"hero"` ； `LineupUnit.isHero()` = \`"hero".equals(type) |

| 校验项 | 规则  | 失败 Code |
| --- | --- | --- |
| schema / dataSchema | 必须都 == 1 | `SCHEMA_INVALID` |
| revision | \> 0 | `SCHEMA_INVALID` |
| 发布时间 | `published_at` > 0 且 ≤ now + **300 秒** 时钟偏移 | `SCHEMA_INVALID` |
| versionName | 非空、UTF-8 ≤ 128 字节、无控制字符 | `SCHEMA_INVALID` |
| bundleSha256 | 必须是小写十六进制、长度 64 | `SCHEMA_INVALID` |
| set_id | 与请求的 setId 精确相等（双方都先 canonical 化） | `SET_ID_MISMATCH` |
| 文件数 | 必须恰好 4 个，且不能有未知文件名 | `INCOMPLETE_BUNDLE` |
| 单文件大小 | `0 < size ≤ 8388608` （8 MiB），累计 ≤ 16777216（16 MiB） | `TOO_LARGE` |
| 文件路径 | 必须 `startsWith("files/")` ，长度 ≤ 512，禁止 `/` 开头、禁止 `\ ? # %` ，每段必须非空且非 `.`/`..`，字符集限 `[A-Za-z0-9._-]` ，且 **最后一段必须等于文件名本身** | `PATH_INVALID` |
| bundle 摘要 | 重算 `computeBundleDigest` 必须等于 `bundle_sha256` | `HASH_MISMATCH` |

| 前两位 | 费用 cost |
| --- | --- |
| 11  | 1 费 |
| 12  | 2 费 |
| 13  | 3 费 |
| 14  | 4 费 |
| 15  | 5 费 |

| setIdx | 赛季代号 | 地图/常量名 | 当前示例 |
| --- | --- | --- | --- |
| 0   | FUX | `FUX_ID_TO_CN_NAME` / `FUX_CN_TO_EN_NAME` | 复刻/福星 |
| 1   | S10 | `S10_*` |     |
| 2   | S16 | `S16_*` |     |
| 3   | S17 | `S17_*` + `S17_FORM_TO_BASE` |     |
| 4   | S8  | `S8_*` + `S8_FORM_TO_BASE` |     |
| 5   | S18 | `S18_*` + `S18_FORM_TO_BASE` |     |

| 星级  | 需要副本数 |
| --- | --- |
| 1   | 1   |
| 2   | 3   |
| 3   | 9   |

| 触发源 | 代码位置 | 说明  |
| --- | --- | --- |
| 定时轮询 | `periodicTick` | 每 `PERIODIC_RECHECK_MS = 5000` 毫秒一次 |
| 新英雄入手 | `OwnedHeroTracker.NewHeroListener` → `tryRecommendAndApply("newHero=" + id)` | 每买入一个新英雄立即重算 |
| 阵容库就绪 | `LineupRepo.OnReadyListener` → `tryRecommendAndApply("repoReady=" + setId)` | 数据加载/热更新完成后 |
| 手动  | `poke(String)` | 供 UI/测试主动触发 |

| #   | 方法  | IPC 命令 / 通道 | 载荷  |
| --- | --- | --- | --- |
| 1   | `pushHeroIdsToNative` | **config-sync 通道** | `SharedMemManager.writeLineupAppliedHeroIds(int[])` → 写 config 键 `lineupAppliedHeroIds` （另有 `lineupAppliedStarTargets` ），然后 `IpcConfigSync.requestSync()` 全量同步——这是「自动拿牌清单」 |
| 2   | `pushAppLineupToNative` | action **`lineup.apply`** | `buildNativeLineupPayload(lineup, 0)` |
| 3   | `pushSyncLineupToGameSlot` | action **`lineup.syncToSlot`** | `{shareCode, title, deckIndex:-1}` ； **仅当 `lineup.shareCode` 非空才发**，否则日志记「v1 不支持无 shareCode（v2 计划用 ReplaceLineUpWithIndex 直接构造）」 |

| 格式  | 说明  |
| --- | --- |
| `"0:row,col"` | 前缀 `0:` 表示已是 0-based，直接解析 |
| `"row,col"` | 无前缀时按 1-based 解析（ `1..4` / `1..7` ），内部各减 1 |

| 方向  | 命令 / push 名 | 用途  | 关键字段 |
| --- | --- | --- | --- |
| App → native | `hex.query` | 查询本局各阶段品质等级 + 实时可刷池 | 请求体为 `{}` |
| App → native | `hex.specify` | 指定目标海克斯 | `{targetHexIds, stage, matchGeneration}` |
| App → native | `hex.cancel` | 取消指定 |     |
| native → App | `updateHexPrediction` | 回传预测数据 | `matchGeneration` 、 `levels[]` 、 `available` 、 `livePool[]` 、 `livePoolWeights[]` 、 `livePoolTotalWeight` 、 `drawsPerStage` |
| native → App | `hex.specified.status` | 指定结果状态 | `phase` 、 `targetHexId` 、 `code` 、 `stage` 、 `sessionGeneration` 、 `matchGeneration` 、 `targetRevision` |

| 归属  | 内容  |
| --- | --- |
| **Java 本地算法** | `TraitCalculator.compute/getActivatedTier` （计数 + 阈值档位）、 `LineupRecommender.score` （唯一带权重的评分公式）、 `SpecifiedHexHitRate.perRefresh/perRound/roundChanceForAny` （加权比例 + `1-(1-p)^n` ）、 `SpecifiedHexOfferTable.get/allowsStage` （布尔查表）、 `HeroPoolCountTier.of` （0.3 阈值分级）、 `HeroPoolMerge` / `HeroPoolKnownCensus` （去重计数） |
| **native 计算、IPC 回传** | 商店刷新预测（ `updateShopSlots` / `updateSpecifiedShopStatus` 的 `predictions` / `reachable` 等）、海克斯可刷池与权重（ `updateHexPrediction` 的 `levels` / `livePoolWeights` / `drawsPerStage` ）、英雄池余量（ `updateHeroPool` ）、对手配对（ `updateMatchup` 的 `pairs` ） |

| asset 文件 | 加载类 | 内容  |
| --- | --- | --- |
| `lineup/<setId>/lineup_meta.json` | `LineupRepo.loadLineups` | 阵容库主文件 |
| `lineup/<setId>/chess_meta.json` | `LineupRepo.loadHeroes` | 英雄 cost / species / class / paint |
| `lineup/<setId>/race.json` 、 `job.json` | `LineupRepo.loadTraits` | 羁绊定义与激活阈值 `numList` |
| `hex_catalog.json` | `SpecifiedHexCatalog` | 海克斯名录 |
| `hex_offer_table.json` | `SpecifiedHexOfferTable` | 海克斯可刷性布尔表（mode / quality / stagesMask） |
| `hex_augment_table.txt` | `HexAugmentMapper` | 海克斯 id → 名称 / tier / 描述 |
| `equipment_table.txt` | `EquipRecipeMapper` | 装备合成配方 `productId` → `part1` + `part2` |

| 层   | 触发  | 载体  | 谁校验 | 结果  |
| --- | --- | --- | --- | --- |
| **WIG 登录层** | 用户输入授权码（卡密） | `POST /v2/api/wig/login/<appid>/<...>` | 服务端 + native 验签 | 返回 `expiryEpochSeconds` ，写入 `wigExpiryEpochSeconds` |
| **Trust 租约层** | WIG 登录成功后自动 | `POST /v2/challenge` → `POST /v2/lease` | native 验签 + 服务端 | 返回 320 字节 signed lease，写入 `signedLease` |

| 步骤  | 校验方 | 校验内容 | 失败表现 |
| --- | --- | --- | --- |
| `nativePrepareLicense` | **native** | 授权码格式、内部状态 | 返回 false → `acquire()` 直接 `onFailed(CANCELED)` |
| `TrustTransport.postWig` | **Java** | URL/表单的 **形状** 白名单（防 patch 改地址、防注入额外字段） | 抛 `Failure("WIG_PARSE")` ， **不发包** |
| `nativeAcceptWigLoginResponse` | **native** | 服务端响应真实性、有效期 | 返回 0 → 映射 `INTEGRITY` 或 `failureCode()` |
| `nativeAcceptChallenge` | **native** | 服务端 challenge 签名 | 返回 `BAD_SIGNATURE(2)` 等 → `fail()` |
| `nativeAcceptLease` | **native** | 服务端 lease 签名、租约内部结构、时钟 | 返回 `BAD_SIGNATURE/MALFORMED_LEASE/CLOCK_OVERFLOW/LEASE_EXPIRED/REVOKED/VM_REJECTED/VM_PROGRAM_INVALID/MANIFEST_INVALID` |
| `TrustControlResponse.parse` | **native** （经 `nativeVerifyControlPolicy` ） | `/v2/client-policy` 、 `/v2/presence` 响应的 `signature` 字段 | 抛 IOException `"trust policy signature invalid"` → 走 transport 重试 |
| 注入侧 `libdemo.so` | **native（游戏进程内）** | 自己再验一遍 lease / WIG session / catalog | 回包 `accepted=false` 或 `trust_generation` 不匹配 → Java 侧重试 20 次 |

| native 方法 | Java 看到的样子 | 推断职责 |
| --- | --- | --- |
| `nativeWarmPreLogin()` | `boolean` | 预热：装载密钥表 / 内部状态 / 环境自检 |
| `nativePrepareLicense(String)` | `boolean` | 授权码本地校验与登录态准备 |
| `nativeBuildWigLoginRequest(card, imei)` | `byte[]` | 构造 WIG 登录请求（含 URL 首行） |
| `nativeAcceptWigLoginResponse(resp, device)` | `long` expiry | 验证登录响应，返回授权到期时间 |
| `nativeLicenseHeader()` | `byte[]` | 生成长期许可证凭据（→ `X-JCC-License` ） |
| `nativeBeginChallenge()` | `byte[]` | 生成 challenge 请求体 |
| `nativeAcceptChallenge(resp)` | `int` TrustError | **验 challenge 响应签名** |
| `nativeBuildLeaseRequest(challengeResp, device)` | `byte[]` | 构造租约请求（含设备绑定） |
| `nativeAcceptLease(resp)` | `int` TrustError | **验租约签名 + 租约结构 + 时钟 + 撤销状态** |
| `nativeIsAuthorized()` | `boolean` | 最终授权裁决 |
| `nativeGetTrustError()` | `int` | 读取当前信任错误码 |
| `nativeVerifyControlPolicy(payload, sigHex)` | `boolean` | **验证服务端控制策略签名** （ `/v2/client-policy` 、 `/v2/presence` ） |
| `nativeGetWigLoginCode()` / `nativeGetWigLoginError()` | `String` | 读取 native 侧失败码（ `ADB_DEBUG` / `INTEGRITY` / `ENVIRONMENT` / `INJECT_PENDING` / `LOCAL_CHECK_*` / `DEVICE_BINDING_MISMATCH` ） |
| `nativeExportWigRelay()` / `nativeExportFeatureCatalog()` / `nativeLoadFeatureCatalog()` | `byte[]` / `boolean` | 导出可下发给注入侧的 WIG session 快照 / 功能目录 |
| `nativeSetServerTimeOffset(long)` | `void` | 把服务器时间偏移喂给 native 时钟 |
| `nativeClearTrust()` | `void` | 清空 native 信任状态 |

| 类   | 算法  | 密钥来源 | 位置  |
| --- | --- | --- | --- |
| `diagnostics/DiagnosticRequestSigner` | **HMAC-SHA256**，上下文串 `"JCC-DIAG-HMAC-V2"` | 服务端注册时下发的 32 字节 `installation_secret` ， **非硬编码**；用后 `Arrays.fill(...,0)` 销毁 | `DiagnosticRequestSigner.java:18,23,129-140,200-208` |
| `diagnostics/DiagnosticGrantVerifier` | **SHA256withECDSA / P-256**，签名对象 `kid + "." + payload` | **硬编码公钥** （见下） | `DiagnosticGrantVerifier.java:108-116` |
| `JccReleaseConfig` + `JccVersionPolicy` | **ES256-P1363** 验签 `/v2/api/version` 响应 | **硬编码公钥** （见下） | `JccReleaseConfig.java:5-8` |
| `JccDeviceIdentity` | **SHA256withECDSA / secp256r1**，对服务端 challenge 的 `message` 签名 | **AndroidKeyStore 生成，私钥不出 TEE/Keystore**，别名 `jcc_gateway_device_p256_v1` | `JccDeviceIdentity.java:14,34-38` |
| `diagnostics/SupportIdentity.AndroidSecretProtector` | **AES/GCM/NoPadding**，AAD `"JCC-DIAG-IDENTITY-V1"` | AndroidKeyStore，别名 `jcc_diagnostic_identity_aes_v1` | `SupportIdentity.java:19-25,204-227` |

| 方法  | 路径  | 位置  |
| --- | --- | --- |
| POST | `/diag/v1/installations/register` | `DiagnosticControlClient.java:186` |
| GET | `/diag/v1/control` | `:190` |
| POST | `/diag/v1/sessions` | `:199` |
| POST | `/diag/v1/sessions/{id}/incidents` | `:203` |
| PUT | `/diag/v1/sessions/{id}/chunks/{seq}` | `:217` |
| POST | `/diag/v1/sessions/{id}/complete` | `:210` |

| 槽位  | 字段（Java 侧切分） |
| --- | --- |
| Header（9 long） | `generation, mode, writeTicket, droppedEvents, gameFrameHeartbeatNs, nativeWorkerHeartbeatNs, matchEpoch, flags, attached` |
| Event（14 long） | `seq, monoNs, opId, matchEpoch, threadId, featureId, stepId, phase, result, reason, arg0, arg1, durationUs, flags` |
| Crash（10 long） | `sequence, monoNs, opId, threadId, moduleRelativeRva, signalNumber, moduleId, featureId, stepId, flags` ；仅当 `sequence` 为偶数才有效（槽位轮转去重，`:342` ） |
| 线程栈（每线程 43 long） | `[threadId, depth, flags, 8×5 帧]` ，帧 = `opId, enterMonoNs, featureId, stepId, flags` |
| FeatureHealth（每功能 10 long） | `featureId, lastSuccessMonoNs, lastFailureMonoNs, lastInputRevision, consecutiveFailures, lastReason, enabledConfig, capabilityState, hookState, recoveryCount` |

| 字符串 | 含义  |
| --- | --- |
| `ADB_DEBUG` | ADB 调试检测（Java 侧映射为"检测到设备调试功能已开启"） |
| `ENVIRONMENT` | 运行环境安全校验（Java 侧映射为"运行环境安全校验未通过"） |
| `INTEGRITY` | 完整性校验（Java 侧映射为"程序完整性校验未通过"） |
| `INJECT_PENDING` | 注入未完成 |
| `LOCAL_CHECK_BUSY` / `LOCAL_CHECK_TIMEOUT` / `LOCAL_CHECK_UNKNOWN` | 本机安全自检的状态机（有超时/忙/未完成三态） |
| `/proc/self/maps` | 模块枚举 —— 用于检测被注入的第三方 so |
| `/proc/self/cmdline` | 进程身份确认 |
| `/proc/self/task/` 、 `/proc/self/task` | 线程遍历（与 `MAX_THREAD_STACKS = 16` 对应） |
| `/proc/self/statu` （dump 中显示为截断形态） | 疑似 `/proc/self/status` ，即经典 `TracerPid` 反调试读取 |
| `dl_iterate_phdr` | 遍历已加载模块表 |
| `libhoudini.so` 、 `libndk_translation.so` | x86 翻译层检测（对应 `NativeLibrarySelector` 的 `demo_compat` 分支，即模拟器/PC 场景） |
| `libil2cpp.so` 、 `libunity.so` | 目标游戏模块（Unity/IL2CPP） |
| `libart.so` 、 `libc.so` 、 `libdl.so` | 常见于反调试/内存扫描的枚举目标 |
| `&JCCLV2` | 信任租约魔数（与 Java 侧 `DiagnosticCoordinator.java:1033-1050` 校验的 12 字节头 `"JCCLV2" + 00 00 00 02 01 00` 一致，build hash 位于偏移 116、长 32 字节） |

| 窗口  | 对应实现 | 用途  |
| --- | --- | --- |
| 主面板 | 内嵌各功能页 View | 功能/牌库/指定/玩家/语音/模式/热键/设置/关于 九个 tab |
| 悬浮球 | `BallDraggingControlBinder` | 收起态，可拖拽 |
| 面板头拖动条 | `OverlayHeaderDragBinder` | 面板拖动 |
| 窗口拖动 | `WindowDraggingControlBinder` 、 `SelectedHeroWindowPositionControlBinder` | 各子窗口位置 |
| 棋盘标记层 | `BoardHeroOverlayController` + `BoardHeroOverlayView` + `.MarkerWindow` | 棋子头顶的牌库/星级标记 |
| 全屏提示层 | `AllInAlertOverlay` 、 `RankWarningView` 、 `CelebrationOverlay` | 梭哈提示、三星预警横幅、庆祝动画 |
| 快捷按钮条 | `FloatingActionChipLayer` | 常驻一排快捷键（卖牌/换位/镜像/刷新/梭哈） |
| 语音横幅 | `VoiceAlertBannerOverlay` | 语音播报同步文字条 |
| 同伴面板 | `CompanionDock` 、 `CompanionPanelLayoutMath` | 伴侣面板停靠 |

| 子系统 | 类   | 职责  |
| --- | --- | --- |
| 网关客户端 | `JccGatewayClient` （7 类） | 与服务端通信的 HTTP 客户端，承载授权、公告、阵容元数据下发 |
| 在线人数 | `XfOnlineCountClient` | 拉取当前在线用户数 |
| 自助解绑 | `SelfServiceUnbindClient` | 用户自助解绑设备（配合设备指纹绑定） |
| 公告  | `MainAnnouncementState` | 服务端公告的已读状态 |
| 认证恢复 | `AuthenticationRecoveryController` 、 `ProcessAuthRecoveryGate` 、 `AuthUiDisplayPolicy` | 授权失效后的静默重认证与 UI 呈现策略 |
| 荣誉/排名预警 | `RankWarningControlBinder` 、 `RankWarningView` | 三星预警的 UI 与语音联动 |
| 对手预测 | `OpponentPredictionControlBinder` 、 `OpponentCardingSettingsPanel` | 下一轮对手预测与「智能卡牌」设置 |
| 换位  | `CustomSwapPairingPolicy` 、 `CustomSwapMirrorSubmit` 、 `CustomSwapTapApply` | 自定义多对棋子互换、镜像换位 |
| 梭哈  | `AllInPriorityGrid` 、 `AllInPriorityStore` 、 `AllInRuleText` | 梭哈优先级排序与规则文案 |
| 棋盘几何 | `BoardOverlayMath` 、 `BoardHeroOverlayMath` 、 `CompanionPanelLayoutMath` | 把游戏内坐标换算成覆盖层像素坐标 |
| 头像缓存 | `BoardHeroAvatarCache` | 棋子头顶头像的加载缓存 |
| 日志  | `ContinuousLogCapture` 、 `DiagnosticLogController` | 持续抓 logcat 并按白名单过滤（含 `libdemo.so` 、 `HexPredict` 、 `ShopPredict` 、 `RecastObserve` 等关键字） |
| 进程探针 | `BoundedProcessProbe` | 有界耗时的 `/proc` 探测，用于判断游戏进程状态 |

| 库   | 大小  | 角色  | 是否含业务算法 |
| --- | --- | --- | --- |
| `libdemo.so` | 5,589,360 B | **注入到游戏进程的运行时载荷**，全部业务逻辑与算法 | **是，全部** |
| `libdemo_compat.so` | 5,585,280 B | `libdemo.so` 的 x86 翻译兼容版，逻辑相同 | 是，同 `libdemo.so` |
| `libinject.so` | 523,320 B | 注入器（独立可执行），把 `libdemo.so` 塞进游戏进程 | 否，纯加载器 |
| `libinject_x86_64.so` | 528,344 B | x86_64 版注入器 | 否   |

| 目标方法 | 推断用途 |
| --- | --- |
| `FRandom_InternalSample` | Unity/游戏 RNG 底层采样 |
| `FRandom_RandomIntMax` | 随机整数 |
| `FRandUtils_RandWeightsListIndex` | **按权重取列表下标**——商店发牌、海克斯随机都走这里 |
| `RandomEquipmentByQuality_WithJCC` | 按品质随机装备。方法名带 `_WithJCC` 后缀，是本工具改写过的版本 |
| `TAC_GenerateHeroListFromHeroPool` | **从英雄池生成商店英雄列表**——商店预测/自动拿牌的核心 |
| `BaseHexCard_SetData` / `HackHexCard_SetData` | 海克斯卡数据写入（ `Hack` 前缀对应被改写的那条路径） |
| `HexStoreItem_SetData` | 海克斯商店条目 |
| `HeroRoot_SetData` / `HeroRoot_Update` / `HeroRoot_ctor` | 场上英雄节点，用于脚下牌库、星级标记 |
| `BuyHeroView_AnimateIn` | 商店购买动画——自动拿牌触发点 |
| `PlayerListItem_SetData` / `_SetMoney` / `_SetBloodValue` / `_SetPlayerLevel` / `_SetPercentValue` | **八家玩家列表** （等级/经济/血量）——「玩家数据」与「游戏内显示经济」的数据源 |
| `TeamRecommend_InitData` / `TeamRecommend_ctor` | 阵容推荐面板（游戏内自带的推荐阵容） |
| `RookieDeckView_Start` / `_SetHeroData` / `_OnDestroy` | 新手阵容视图 |
| `CSoGame_FrameTimeTick` | 游戏主循环帧回调——用于按帧驱动覆盖层与状态刷新 |

| Java 类 | JNINativeMethod 表 | 条目数 |
| --- | --- | --- |
| `com.android.support.trust.NativeTrustBridge` | `0x5415C0` | 20  |
| `com.android.support.diagnostics.DiagnosticSharedMemoryBridge` | `0x541200` | 8   |
| `com.android.support.WigVerify` | `0x541310` | 12  |

| 方法  | 签名  | 地址  |
| --- | --- | --- |
| `nativeBeginChallenge` | `()[B` | `0x3B3EA0` |
| `nativePrepareLicense` | `(Ljava/lang/String;)Z` | `0x3B40D0` |
| `nativeBuildGatewayLoginRequest` | `(Ljava/lang/String;Ljava/lang/String;)[B` | `0x3B4298` |
| `nativeBuildWigLoginRequest` | `(Ljava/lang/String;Ljava/lang/String;)[B` | `0x3B4E24` |
| `nativeAcceptWigLoginResponse` | `([BLjava/lang/String;)J` | `0x3B53B0` |
| `nativeGetWigLoginCode` | `()Ljava/lang/String;` | `0x3B5844` |
| `nativeGetWigLoginError` | `()Ljava/lang/String;` | `0x3B5A58` |
| `nativeLicenseHeader` | `()[B` | `0x3B5B70` |
| `nativeAcceptChallenge` | `([B)I` | `0x3B5C8C` |
| `nativeBuildLeaseRequest` | `([BLjava/lang/String;)[B` | `0x3B5E50` |
| `nativeAcceptLease` | `([B)I` | `0x3B61B0` |
| `nativeGetTrustError` | `()I` | `0x3B6378` |
| `nativeIsAuthorized` | `()Z` | `0x3B6398` |
| `nativeWarmPreLogin` | `()Z` | `0x3B63D0` |
| `nativeClearTrust` | `()V` | `0x3B63F0` |
| `nativeVerifyControlPolicy` | `([B[B)Z` | `0x3B65C8` |
| `nativeSetServerTimeOffset` | `(J)V` | `0x3B6764` |
| `nativeExportWigRelay` | `()[B` | `0x3B6770` |
| `nativeLoadFeatureCatalog` | `()Z` | `0x3B6AEC` |
| `nativeExportFeatureCatalog` | `()[B` | `0x3B6B40` |

| 目标  | 作用  |
| --- | --- |
| `eglSwapBuffers` | 在游戏 GL 交换缓冲的时机绘制自己的覆盖层 |
| `CSoGame_FrameTimeTick` | 游戏帧回调，驱动状态刷新 |

| 目标  | 作用  |
| --- | --- |
| `TAC_GenerateHeroListFromHeroPool` | 从英雄池生成商店列表 |
| `UpdateRefreshBuyList2UI` | 刷新商店 UI |
| `SelectHeroVectorByUserLevel` | 按玩家等级决定英雄池概率 |
| `GetBadLuckProtectionV2` | 保底（bad-luck protection）机制 |
| `FRandUtils_RandWeightsListIndex` | 按权重取下标 |
| `FRandom_InternalSample` | 随机采样 |
| `FRandom_RandomIntMax` | 随机整数 |
| `BuyHeroView_AnimateIn` | 购买动画（自动拿牌触发点） |
| `OnBuyHeroInfoChange` | 购买信息变更 |
| `GetHeroKu` | 英雄库（牌库余量数据源） |
| `HeroRoot_SetData` / `_ctor` / `_Update` | 场上英雄节点 |

| 目标  | 作用  |
| --- | --- |
| `GetRandomHACfgForSingle` | 随机海克斯配置（HA = Hex Augment） |
| `FilterValidConfigs` | 过滤合法配置 |
| `HexStoreItem_SetData` | 海克斯商店条目 |
| `BaseHexCard_SetData` / `HackHexCard_SetData` | 海克斯卡数据（ `Hack` 为改写路径） |

| 目标  | 作用  |
| --- | --- |
| `RandomEquipmentByQuality` / `RandomEquipmentByQuality_WithJCC` | 按品质随机装备（ `_WithJCC` 为改写版） |
| `GetTargetLevelEquipmentPool` | 目标等级装备池 |
| `RecastingHeroEquipments` | 英雄装备重铸 |
| `OnEquipmentRecasting` | 重铸事件回调 |

| 目标  | 作用  |
| --- | --- |
| `GetMyPlayerModel` | 本方玩家数据 |
| `OpponentPrediction.SelectHighScore` | 对手预测的评分选择函数 |
| `PlayerListItem_SetData` / `_SetMoney` / `_SetPlayerLevel` / `_SetBloodValue` / `_SetPercentValue` | 八家列表数据 |

| 目标  | 作用  |
| --- | --- |
| `TeamRecommend_InitData` / `_ctor` / `TeamRecommendItemCallback0~3` | 游戏内阵容推荐面板 |
| `RecListPanelBattle_InitData` | 推荐列表面板 |
| `SetRookieDeckData` / `GetRecommendData` | 新手阵容数据 |
| `RookieDeckView_Start` / `_SetHeroData` / `_OnDestroy` | 新手阵容视图 |
| `AddPopPanel` / `RemovePopPanel` | 弹窗加入/移除（对应「拦截弹窗」） |

| 目标  | 作用  |
| --- | --- |
| `WriteInput(byte[])` / `WriteInput(List<byte>)` | 游戏输入写入函数 |
| `GetLoginPlatType` | 登录平台类型（对应「iOS 转区」） |

| 项   | 原（仅 strings）判断 | IDA 核实结果 |
| --- | --- | --- |
| `nativeAttackIcon*` / `nativePlayerEconName` | 疑似 JNI 方法 | **不是**，仅是 SharedPreferences 键名 |
| IL2CPP 方法定位方式 | 未确定 | **硬编码偏移表** （ `0x566DD0` ），非 API 按名解析 |
| 装钩引擎 | 未确定 | **自研 inline hook** （ `sub_4435E4` ），非 Dobby/ShadowHook |
| `WigVerify` 方法数 | 13  | **12** |
| 覆盖层渲染路径 | 疑似 WindowManager | **`eglSwapBuffers` hook，画进游戏 GL 表面** |
| 输入注入路径 | 疑似无障碍/触摸 | **hook `WriteInput` ，构造游戏原生输入** |
| 地址有效性防御 | 未知  | `process_vm_readv` 自读探测 + 毒值检测 |

| `source` 取值 | 优先级 | 含义  |
| --- | --- | --- |
| `preMatchData` / `preMatchData-empty` | 3（最高） | 直接读游戏的赛前配对数据结构 |
| `preMatch` | 2   | 赛前配对的另一条读取路径 |
| `selectHighScore` | 1（兜底） | 钩住游戏对手选择函数的返回值 |

| 标签  | 触发条件 |
| --- | --- |
| `preMatchData-unavailable` | 地址非法、是毒值、或读取失败 |
| `preMatchData-invalid-array` | 读到了，但数组结构不合法 |
| `preMatchData-empty` | 结构合法但为空（未进入配对阶段） |
| `preMatchData-unrecognized` | 结构合法但版本不匹配，字段布局对不上 |
| `preMatchData-resolved` | 成功解析 |

| id  | 地址  | 字符串 |
| --- | --- | --- |
| 1   | `0x1B683` | `selectHighScore` |
| 2   | `0x1C322` | `preMatch` |
| 3   | `0x1BA7B` | `preMatchData` |

| 发出点 | source id | 函数  | 目标  |
| --- | --- | --- | --- |
| `0x290910` | **3** (`preMatchData`) | `sub_2D6880` （直接组装） | 高优先级 |
| `0x2907C4` | **2** (`preMatch`) | `sub_2C0524` （共享构建器） | 次优先级 |

| 调用点 | 调用者 | sourceId | 对应 source |
| --- | --- | --- | --- |
| `0x2907C4` | `sub_28EB48` （帧回调） | `W2 = #2` | `preMatch` |
| `0x2A2508` | `sub_29FAA8` （SelectHighScore 消费者） | `W2 = #1` | `selectHighScore` |

| 子调用 | 行为  | 判定  |
| --- | --- | --- |
| `sub_3D4B78(3)` | 查特性开关表（ `a1 <= 5` 的小枚举，走 `unk_56B670` 与 `sub_3D48C0` ） | 「特性 3 是否启用」 |
| `sub_3D53F4()` | `clock_gettime(CLOCK_MONOTONIC=7)` 与 `unk_56B7C0` 记录的时间戳比较，窗口 `0x59682F01` ns | **约 1.5 秒** 内是否有过事件 |
| `sub_3D548C(3)` | `clock_gettime` 与 `unk_56B790` 比较，窗口 `0x5F5E100` ns = 0.1 秒；不匹配时用 `sub_3CEC38` 回写时间戳 | **0.1 秒冷却** |
| `sub_3D5370()` | 读 `unk_56B738` 后调 `sub_3D030C(_, 2)` | 辅助计数/状态 |

| 目标函数 | 处理器地址 | 大小  | 处理方式 | 是否改结果 |
| --- | --- | --- | --- | --- |
| `FRandom_RandomIntMax` | `0x2F8BB0` | 92 B | `v4 = off_564F08(); return v4;` | **否** |
| `FRandom_InternalSample` | `0x2F8C0C` | 428 B | `v5 = off_564F10(a1,a2); return v5;` | **否** |
| `FRandUtils_RandWeightsListIndex` | `0x2FBC8C` | 204 B | `v2 = off_564F38(a1); return v2;` | **否** |
| `TAC_GenerateHeroListFromHeroPool` | `0x2F8DBC` | 3124 B | 单出口 `return v23 & 1;`， `v23` 为原函数返回值 | **否** |
| `SelectHeroVectorByUserLevel` | `0x2FA554` | 4416 B | 单出口尾调 `off_564F28(...)` ，参数为原参数的副本 | **否** |
| `GetBadLuckProtectionV2` （保底） | `0x2FB6A8` | 1492 B | `v2 = off_564F30(a1); return v2;` | **否** |
| `RandomEquipmentByQuality` | `0x2FBF64` | 336 B | 原值返回 | **否** |
| `RandomEquipmentByQuality_WithJCC` | `0x2FC0B4` | 352 B | `v19 = off_564F48(...); return v19;` | **否** |

| syscall | 编号  | 次数  | 用途  |
| --- | --- | --- | --- |
| `process_vm_readv` | 270 (0x10E) | 249 | 安全内存可读性探测（不是真的读数据） |
| `gettid` | 178 (0xB2) | 6   | 线程标识 |
| `clock_gettime` | 113 (0x71) | 4   | 计时  |
| `openat` / `read` / `close` / `write` | 56/63/57/61 | 多处  | 文件与 IPC |
| **`process_vm_writev`** | **271 (0x10F)** | **1** | **唯一的直接内存写入** |

```python
┌─────────────────────────────────────────┐
│  App 进程  com.android.support          │
│  （MainActivity / FloatingWindowService）│
│                                         │
│  · 悬浮窗 UI、所有设置面板               │
│  · root 工具链（su / mount namespace）   │
│  · 授权与网关通信（Java 侧）             │
│  · 诊断上报                              │
└──────────────┬──────────────────────────┘
               │
               │  ① 注入：libinject.so -pkg com.脱敏.jkchess
               │     -lib libdemo.so -pid N -dl_memfd
               │     （经 su，setenforce 0，memfd 无文件注入）
               ▼
┌─────────────────────────────────────────┐
│  游戏进程  com.脱敏.jkchess          │
│  （Unity + IL2CPP，libil2cpp.so）        │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ libdemo.so（注入的运行时载荷）     │  │
│  │ · IL2CPP 方法 hook（FRandom 等）   │  │
│  │ · 商店/海克斯/重铸 预测算法        │  │
│  │ · 对手数据读取（PlayerListItem）   │  │
│  │ · 棋盘操作（拿牌/卖牌/换位）       │  │
│  │ · 信任链密码学实现                 │  │
│  └───────────────────────────────────┘  │
└──────────────┬──────────────────────────┘
               │
               │  ② 通信：IPC v2（共享内存 + LocalSocket）
               │
               └──────────► 回到 App 进程（IPC v2：抽象 Unix socket + LocalSocket，JSON 帧）
```

```java
static final String DEFAULT_BINARY = "su";
private static final List<String> AUTO_VERSION_PROBES =
        Collections.unmodifiableList(Arrays.asList("/system/xbin/su", "/system/bin/su", DEFAULT_BINARY));
```

```java
static List<String[]> mountMasterPrefixes(String str) {
    String binary = binary(str);
    ArrayList arrayList = new ArrayList(3);
    arrayList.add(new String[]{binary, "-mm", "-c"});
    arrayList.add(new String[]{binary, "-M", "-c"});
    arrayList.add(new String[]{binary, "--mount-master", "-c"});
    return arrayList;
}

static String[] plainPrefix(String str) { return new String[]{binary(str), "-c"}; }
```

```java
ShellExec.setSuBinary(SuBinaryPathPolicy.binary(SuBinaryPathPolicy.sanitize(
        getSharedPreferences(ConfigPreferenceNamespaces.APP_SETTINGS.preferencesName, 0)
                .getString("su_binary_path", ""))));
```

```java
"cd '" + str + "' && setenforce 0 2>/dev/null; " + str8 + " & INJ_PID=$!; ..."
...
"  else echo '__TARGET_IDENTITY_MISMATCH__:'$CUR_START; fi; setenforce 0 2>/dev/null || true; echo '__INJECT_RC__:'$INJ_RC; exit $INJ_RC"
```

```python
set -eu; context=$(ls -Zd <dataDir> | awk '{print $1}');
case "$context" in u:object_r:*) ;; *) echo __TARGET_BAD_CONTEXT__:$context; exit 1;; esac;
chcon "$context" <so1>; targetContext=$(ls -Zd <so1> | awk '{print $1}'); [ "$targetContext" = "$context" ];
chcon "$context" <so2>; ... ; echo __TARGET_CONTEXT_READY__
```

```java
"set -eu; owner=$(stat -c '%u:%g' " + shellQuote(str) + "); context=$(ls -Zd " + shellQuote(str) + " | awk '{print $1}'); case \"$context\" in u:object_r:*) ;; *) echo __IPC_BOOTSTRAP_BAD_CONTEXT__:$context; exit 1;; esac; rm -f " + shellQuote(str3) + "; cp -f " + shellQuote(file.getAbsolutePath()) + " " + shellQuote(str3) + "; chown \"$owner\" " + shellQuote(str3) + "; chmod 600 " + shellQuote(str3) + "; chcon \"$context\" " + shellQuote(str3) + "; mv -f " + shellQuote(str3) + " " + shellQuote(str2) + "; [ \"$(stat -c '%a' ...)\" = \"600\" ]; [ \"$(stat -c '%u:%g' ...)\" = \"$owner\" ]; ..."
```

```java
String mountNamespaceFile = decision.escape().mountNamespaceFile();
if (mountNamespaceFile == null) { this.rootMountNamespaceFile = null; return true; }
this.rootMountNamespaceFile = mountNamespaceFile;
CommandResult execCommandDetailed = execCommandDetailed("[ -d " + shellQuote(decision.dataDir()) + " ] && echo __GAME_DATA_DIR_EXISTS__", 5000L);
if (... 不通过 ...) { this.rootMountNamespaceFile = null; return false; }
```

```java
String str2 = this.rootMountNamespaceFile;
return str2 == null ? str : "nsenter --mount=" + shellQuote(str2) + " -- sh -c " + shellQuote(str);
```

```java
private static final String INJECT_NAME = "libinject.so";
private static final String INJECT_NAME_X86_64 = "libinject_x86_64.so";
private static final String LIB_NAME = "libdemo.so";
private static final String LIB_NAME_COMPAT = "libdemo_compat.so";
```

```java
String resolveGameDataDir = resolveGameDataDir(i);      // 例如 /data/user/0/com.脱敏.jkchess
...
String str5 = resolveGameDataDir + "/libdemo.so";        // payload 落点
String str6 = resolveGameDataDir + "/libinject.so";      // 注入器落点
execCommand("rm -f " + shellQuote(str5) + " " + shellQuote(resolveGameDataDir + "/libdemo_compat.so") + " " + shellQuote(str6) + " 2>/dev/null");
// cp 自身 nativeLibraryDir 下的 libdemo*.so  -> 游戏 data dir/libdemo.so，chmod 555
// cp 自身 nativeLibraryDir 下的 libinject*.so -> 游戏 data dir/libinject.so，chmod 555
// 然后 applyTargetDataContext(resolveGameDataDir, str5, str6)
```

```java
String str8 = "'" + str6 + "' -pkg com.脱敏.jkchess -lib '" + str2 + "' -pid " + i + " -dl_memfd";
if (isEmulator) { str8 = str8 + " -delay 3000000"; }
```

```python
cd '<游戏dataDir>' && setenforce 0 2>/dev/null; \
'<游戏dataDir>/libinject.so' -pkg com.脱敏.jkchess -lib '<游戏dataDir>/libdemo.so' -pid <PID> -dl_memfd & \
INJ_PID=$!; ... wait $INJ_PID ...
```

```java
CUR_START=$(awk '{print $22}' /proc/<PID>/stat 2>/dev/null);
if [ "<j>" -le 0 ] || [ "$CUR_START" = "<j>" ]; then
  echo '__TARGET_IDENTITY_OK__:'$CUR_START; kill -CONT <PID> 2>/dev/null || true; echo '__TARGET_RESUME__:'<PID>;
else echo '__TARGET_IDENTITY_MISMATCH__:'$CUR_START; fi
```

```python
Usage: ./path/to/AndKittyInjector [-h] [-pkg] [-pid] [-lib] [ options ]
-hide_maps      Try to hide lib segments from /proc/[pid]/maps.
-hide_solist
-watch          Monitor process launch then inject, ...
-dl_memfd       Use memfd_create & dlopen_ext to inject library, useful to bypass path restrictions.
-delay          Set a delay in microseconds before injecting.
E: PTRACE_ATTACH failed for pid %d. error="%s".
I: nativeInject: memfd_rand(%d) = %s.
I: Injection succeeded. / E: Injection failed.
```

```java
scheduleNext(context);                                        // 先续期，保证链不断
boolean wasRunning = FloatingServiceState.wasRunning(context);
boolean isServiceReady = FloatingWindowService.isServiceReady();
if (!wasRunning) { return; }                                  // 用户主动退出过 → 不拉起
if (isServiceReady) { return; }                               // 服务还在 → 不拉起
FloatingWindowService.sIntentionalStart = true;
FloatingWindowService.sReconnectMode = true;
context.startForegroundService(new Intent(context, FloatingWindowService.class));
```

```java
if (ServiceDestroyWatchdogPolicy.shouldAccelerateResurrect(FloatingServiceState.wasRunning(this))) {
    Log.w(TAG, "★ onDestroy 但 service_was_running=true，触发看门狗加速复活");
    FloatingWindowWatchdog.scheduleFast(getApplicationContext());
}
```

```java
if (FloatingServiceState.wasRunning(this) && !sIntentionalStart) { sReconnectMode = true; ... }
if (!sIntentionalStart && !sReconnectMode) {
    Dbg.m70d(TAG, "onCreate: sIntentionalStart=false, sReconnectMode=false (Android auto-restart), stopping immediately");
    startForegroundNotification(); stopSelf(); return;
}
```

```java
new ProcessBuilder("su", "-c", "pkill -f jcc_helper").redirectErrorStream(true).start();   // 清旧的
File extractHelper = extractHelper();                                                       // 从 assets 解出
this.bridge = new RootHelperBridge(socketNameFor, listener); this.bridge.start();           // LocalServerSocket
String str = extractHelper.getAbsolutePath() + " --sock " + socketNameFor;                  // [--cso <hex>]
this.helperProcess = new ProcessBuilder("su", "-c", str).redirectErrorStream(true).start();
```

```java
int gamePid = getGamePid();
if (!InjectionReconnectPolicy.shouldAutoRecoverRuntime(gamePid, isGameLibsLoaded(gamePid), hasExistingRuntimeReconnectHint(gamePid))) {
    log("启动恢复：没有可复用的同进程运行时"); return;
}
if (this.isInjecting) { log("启动恢复：已有注入/恢复流程进行中"); return; }
this.isInjecting = true;
// ... UI 切 CONNECTING ...
if (!isCurrentInjection(j) || !stageExistingRuntimeReconnectBootstrap(gamePid)) {
    abandonAutomaticRuntimeRecovery("启动恢复：无法安全重放当前 IPC 认证材料，静默放弃");
} else if (isAlreadyInjected(gamePid)) {
    handleReconnect(gamePid, j);
} else {
    abandonAutomaticRuntimeRecovery("启动恢复：旧运行时未在安全窗口内完成认证，禁止自动二次注入，静默放弃");
}
```

```java
String[] strArr = {"/dev/qemu_pipe", "/dev/goldfish_pipe", "/dev/vboxguest",
    "/system/lib/libmumuvm.so", "/system/lib64/libmumuvm.so",
    "/system/lib/libnemu.so", "/system/lib64/libnemu.so",
    "/system/lib/libldinput.so", "/system/lib64/libldinput.so",
    "/system/bin/nox", "/system/bin/microvirt"};
```

```
+---------------------+---------------------------+
| 4 bytes, big-endian | N bytes                   |
| N = payload length  | UTF-8 JSON text           |
+---------------------+---------------------------+
```

```java
new JSONObject().put("v", 2)
               .put("type", take.type)
               .put("sessionId", session.sessionId())
               .put("id", take.id)
               .put("seq", incrementAndGet)
               .put("method", take.method)
               .put(bodyKey, take.body);   // bodyKey ∈ {"params", "result"}
```

```json
{"v":2,"type":"request","sessionId":"<22字符base64url>","id":"<22字符base64url>",
 "seq":17,"method":"chess.sell",
 "params":{"mode":2,"costMask":31,"keepHeroIds":[101,102],"keepCardingTargets":0,
           "matchGeneration":"<22字符>","createdBootMs":812345,"ttlMs":5000}}
```

```json
{"v":2,"type":"response","sessionId":"...","id":"(回显请求id)","seq":9,
 "method":"chess.sell","result":{"status":"completed"}}
```

```json
{"v":2,"type":"error","sessionId":"...","id":"...","seq":10,
 "method":"chess.sell","error":{"code":"invalid_request"}}
```

```json
{"v":2,"type":"state","sessionId":"...","id":"...","seq":31,
 "method":"updatePlayers",
 "params":{"dualPlay":false,"turnState":3,
   "players":[{"id":0,"hp":100,"level":7,"gold":42,"rank":1,"isMe":true,
               "name":"我","enemy":3,"avatarId":101,"isBot":false,"botKnown":true}]}}
```

```json
{"v":2,"type":"request","id":"<challengeId>","seq":0,"method":"handshake.challenge",
 "params":{"challengeId":"<16B base64url>","serverNonce":"<32B base64url>",
           "connectionId":<positive long>,"serverGeneration":<long>,
           "transport":0,"deadlineBootMs":<elapsedRealtime+3000>}}
```

```json
{"v":2,"type":"response","id":"<challengeId>","seq":0,"method":"handshake.challenge",
 "result":{"version":2,"tokenEpoch":<long>,"clientNonce":"<32B base64url>",
           "clientProof":"<32B base64url>"}}
```

```json
{"v":2,"type":"request","id":"<randomId>","seq":0,"method":"handshake.welcome",
 "params":{"sessionId":"<16B base64url>","serverProof":"<32B base64url>"}}
```

```json
{"v":2,"type":"response","id":"<randomId>","seq":0,"method":"handshake.welcome",
 "result":{"ready":true}}
```

```
\{"v":2,"tokenEpoch":<正整数>,"token":"<43字符base64url>"\}
```

```
App: startServer()  → LocalServerSocket(@xf_game_control_v2) + ServerSocket(127.0.0.1:39816..)
                   ↓ accept
抽象 socket: 校验 peer（acceptAbstractPeer，要求 uid%100000 与目标 uid%100000 相同，且 pid != 自己）
                   ↓
candidate（最多 8 个并发候选，MAX_CANDIDATES，ipcV2RuntimeState.Candidate）
                   ↓ handshake.challenge / welcome 双向 HMAC 校验（HANDSHAKE_TIMEOUT_MS = 3000）
                   ↓ promoteAuthenticated → Session（带 serverGeneration）
READY 之前：App 先推 config.replace，等 ack 对得上 revision 才 ready
                   ↓ ready=true → notifyConnected → cppConnectedFlag = true
```

```java
// SharedMemManager.java:1590-1592
public boolean isCppConnected() {
    return this.socketIPC.isClientConnected() && this.cppConnectedFlag;
}
```

```css
App: DiagnosticSharedMemoryBridge.create(generation)   → nativeCreateReader(generation)
     （App 进程内加载 libdemo.so，见 NativeLibraryLoader → NativeLibrarySelector，PRIMARY_RUNTIME = "demo"）
     duplicateForSend() → nativeDuplicateReaderFd(generation) → ParcelFileDescriptor
     ↓ 经 LocalSocket 的 SCM_RIGHTS 随 diagnostics.trace.attach 帧发给游戏进程
native(游戏进程): mmap 同一页，按 featureMask 往里写事件
App: 轮询 nativeDrain / nativeReadHeader / nativeReadThreadStacks / nativeReadFeatureHealth / nativeReadCrashSlot
```

```
游戏进程 libdemo.so
   ├─ 读游戏内存 / hook il2cpp
   ├─ 组装 JSON，按帧率推 type=state 帧：
   │    updatePlayers / updateHeroPool / updateBoardPositions / updateMyOwnedHeroes /
   │    updateShopSlots / updateHexPrediction / updateMatchup / updateRankAnchors / ...
   └─ 对局边界推 match.started / match.ended
        ↓ socket
App: LocalSocketIPC.readerLoop → validateEnvelope(seq 严格 +1) → handleInbound
        ↓ MessageListener
App: SharedMemManager.handleCppMessage(method, params) → IpcPushDispatcher
        ↓ 各 parseXxx()
App: GameSnapshotStore 缓存 + 时间戳（cachedPlayers / cachedPlayersReceivedAtMs / cachedPlayerTimestamp++ 等）
        ↓ mainHandler.post / listener
App: FloatingWindowService 悬浮窗渲染
```

```python
https://jcc.zhuzhufaka.cn/v2/api/lineup/manifest?setId={setId}
```

```python
SHA-256(
  for f in ["lineup_meta.json","chess_meta.json","race.json","job.json"]:   # 固定顺序
      len_be32(f.name) || f.name
      len_be32(32)     || raw_bytes(f.sha256)      # 注意：喂的是原始 32 字节，不是 hex 字符串
  len_be32(|setId|) || setId
  be64(revision)
).hex()
```

```java
HashMap<Integer,Integer> counts = new HashMap<>();
for (String paint : paints) {
    HeroMeta h = repo.getHeroByPaint(paint);
    if (h == null) continue;
    if (h.speciesId > 0) inc(counts, h.speciesId);   // 种族
    if (h.classId   > 0) inc(counts, h.classId);     // 职业
}
// 每个非零 id → TraitDef → ActiveTrait(def, count)
Collections.sort(list, COMP_ACTIVE_DESC);
```

```java
int tier = 0;
for (int i = 0; i < thresholds.length; i++)
    if (count >= thresholds[i]) tier = i + 1;
return tier;
```

```java
EARLY_HOLD_THRESHOLD = 8;      // 判断「前期」的 paint 数量阈值（名字写的是 hold，实际判的是 paints.size() < 8）
W_EARLY  = 3.0;                // 前期英雄命中权重
W_MID    = 2.0;                // 中期英雄命中权重
W_LATE   = 1.0;                // 后期/终局英雄命中权重
W_PENALTY = 0.05;              // 每个「无用英雄」的惩罚
PREF_BONUS = 30.0;             // 命中用户指定羁绊的巨额奖励
```

```python
earlySet = repo.stringIdsToPaints(lineup.earlyHeroes)
midSet   = repo.stringIdsToPaints(lineup.midHeroes)
lateSet  = paintsFromUnits(lineup.finalUnits)          // final_units 里 hero 的 paint
           ?? repo.stringIdsToPaints(lineup.lateHeroes) // final_units 为空时回退
```

```python
all = earlySet ∪ midSet ∪ lateSet
extraHeroes = |{ p ∈ ownedPaints : p ∉ all }|
```

```python
earlyWeight = earlyPhase ? 4.5 : W_EARLY          // 开局阶段前期命中权重从 3.0 提到 4.5
score = earlyHits * earlyWeight
      + midHits   * 2.0
      + lateHits  * 1.0
      - extraHeroes * 0.05
```

```java
if ("S".equalsIgnoreCase(lineup.quality))      score += W_LATE;   // +1.0
else if ("N".equalsIgnoreCase(lineup.quality)) score += 0.5;
```

```java
List<ActiveTrait> projected = TraitCalculator.computeForLineup(finalUnits 里的 heroId, repo);
if (preferredTraitId != null && preferredTraitId > 0
    && projected 中存在 def.id == preferredTraitId 的 ActiveTrait)
    score += 30.0;   // PREF_BONUS
```

```java
// AutoLineupApplier.java:270
List<Recommendation> rec = LineupRecommender.recommend(linkedHashSet, null, 5, lineupRepo);
```

```java
HeroInfo(int id, String cn, String en) {
    int i = id;
    while (i >= 100) i /= 10;   // 11112 → 1111 → 111 → 11
    this.cost = i % 10;         // 11 % 10 = 1
}
```

[回复或点赞可查看完整内容](#quick_reply_form)
