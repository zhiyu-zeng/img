---
title: 【微信】Frida 脚本运行时机与Java.perform的原理
source: https://mp.weixin.qq.com/s/tN9M2N3X43NL-PwCpnfEPw
source_host: mp.weixin.qq.com
clip_date: 2026-10-05T19:10:00+08:00
trace_id: 088437bb-5e38-4498-a947-ec633104b8e1
content_hash: 1d17c8fb6fe92fb3e53186635a5e3bc42f0a8e33d2973f262aae6815fad213db
status: summarized
tags:
  - 微信
  - Frida
  - Android逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Frida 用户脚本（top-level）由 `Script.load()` 在 agent 的 JS 线程执行，早于 App 主线程进入 `ActivityThread.main()`；`Java.perform()` 的核心是等 Android 建立 App 默认 ClassLoader，再取得当前线程 JNIEnv 执行回调。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: null
ioc:
  cves: []
  cwes: []
  hashes:
    - 6e47c7075b91983ae501114425ea25e6df7690c8
    - f72e61ed18fa6b72f0559df223b22a899685b22c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Frida 用户脚本（top-level）由 `Script.load()` 在 agent 的 JS 线程执行，早于 App 主线程进入 `ActivityThread.main()`；`Java.perform()` 的核心是等 Android 建立 App 默认 ClassLoader，再取得当前线程 JNIEnv 执行回调。
> 
> - **执行边界：** `create_script()` 只创建实例（状态 `CREATED`，语法错误可能在此暴露），`Script.load()` 才推进到 `LOADING`，经 JS scheduler 求值 entrypoint（QuickJS `JS_EvalFunction` / V8 `Evaluate`/`Run`）执行 top-level，完成后为 `LOADED`。
> - **为何能提前：** spawn 时 zymbiote 只阻塞 App 主线程 `recv()`，agent 已有独立线程与 `gum-js-loop` JS 线程，故 top-level 可先于 `ActivityThread.main()` 运行；`--pause` 仅跳过自动 `resume()`，不阻止 load。
> - **两条路径：** 早期 spawn 用 `ActivityThread.getPackageInfo()` 最长 overload 的返回值，调 `apk.getClassLoader()` 取最终 loader 并同步清空 `_pendingVmOps`；晚注入则 `currentApplication()` 非空，直接 `initFactoryFromApplication()` 立即执行回调。已存在 Application 才走此路，否则安装 Hook 等待。
> - **JNIEnv 与枚举分离：** `VM.perform()` 按 tid 查 `activeEnvs` 缓存，否则 `GetEnv` 失败再 `AttachCurrentThread`，不暂停线程；`Java.enumerateClassLoaders()` 才 `withRunnableArtThread` → `ThreadList::SuspendAll` → `ClassLinker::VisitClassLoaders` → `AddGlobalRef` → `ResumeAll`。
> - **loader 决定类身份：** loader 为空时 `Java.use()` 走 JNI `FindClass`（仅 framework 可见）；非空改调该 loader 的 `loadClass()`。同名类因 defining ClassLoader 不同可并存，应优先用 `Java.ClassFactory.get(loader)` 建独立 factory，而非反复改全局默认 factory。

**看雪学苑** *2026年10月5日 18:14*

源码锚点： `frida-core` / `frida-gum` `17.9.1` ； `frida-tools` `14.8.0` ； `frida-java-bridge` 固定提交 `f72e61ed18fa6b72f0559df223b22a899685b22c` ；AOSP `frameworks/base` 固定提交 `6e47c7075b91983ae501114425ea25e6df7690c8` ；AOSP ART / libnativehelper 固定 tag `android-14.0.0_r1`

进度：已打通脚本 top-level、Android `LoadedApk` 、JavaVM/JNIEnv、 `Java.perform()` 、ART ClassLoader 枚举与指定 `ClassFactory` Hook 的完整源码链；待补插件双 ClassLoader 真机记录

* * *

开课词库

词库按“脚本执行、JNI 环境、类加载命名空间”三段排列。带 ★ 的对象决定本课主时间线。

### A. 脚本从创建到执行

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f889cb98bbf00984.png)

### B. Frida 进入 Java 世界

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/87f8e8c82a018a3d.png)

### C. Android 类加载命名空间

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8530301b1df1550c.png)

先确定本课结论

“Frida 第一个脚本运行时机”指的是用户脚本的第一行 JavaScript，不是最早进入进程的 Frida 原生代码。后者是 F01 已讲过的 zymbiote、loader 和 agent 初始化；用户 JS 要等 `Script.load()` 才执行。

对 Android 普通、无 instrumentation 的早期 spawn，主线顺序是：

```
Zygote fork / specialize
  → zymbiote 让 App 主线程停在 recv()
  → frida-server 向新进程注入完整 agent
  → client 建立 Session
  → create_script() 创建脚本实例
  → Script.load() 在 agent 的 JS 线程执行 top-level
  → Java.perform(fn) 发现默认 loader 为空，将 fn 入队
  → VM.perform 为 JS 线程取得 JNIEnv，安装 framework Hook
  → client 调用 resume()
  → zymbiote 收到 ACK，App 主线程继续
  → ActivityThread.main()
  → bindApplication
  → LoadedApk / App ClassLoader
  → Hook 设置 ClassFactory.loader
  → VM.perform 为触发 Hook 的线程取得 JNIEnv
  → 执行 Java.perform(fn) 回调
  → Application / Provider / Activity
```

这条时间线只有三个需要分别判断的边界：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/96fe2ec9a325e812.png)

后文只沿这三个边界展开。

一次讲完 create_script() 与 Script.load()

源码直达：client `Session.create_script()` · client `Script.load()` · agent create/load 入口 · `ScriptEngine.create_script()` · `ScriptInstance.load()` · QuickJS backend create · QuickJS load / `JS_EvalFunction()` · JS scheduler

脚本生命周期由 client 发起，由目标进程内的 agent 执行。 `frida-server` 负责会话路由，不负责运行 JavaScript \[1\]\[2\]。

```
client
  → frida-server
  → AgentSession
  → BaseAgentSession
  → ScriptEngine
  → QuickJS / V8
```

client 侧先创建，再加载 \[1\]：

```typescript
public async Script create_script (string source,
        ScriptOptions? options = null,
        Cancellable? cancellable = null)
        throws Error, IOError {
    check_open ();

var raw_options = (options != null)
            ? options._serialize ()
            : make_parameters_dict ();

    AgentScriptId script_id;
try {
        script_id = yield active_session.create_script (
                source, raw_options, cancellable);
    } catch (GLib.Error e) {
        throw_dbus_error (e);
    }

    check_open ();

var script = new Script (this, script_id);
    scripts[script_id] = script;
return script;
}

public async void load (Cancellable? cancellable = null)
        throws Error, IOError {
    check_open ();

try {
yield session.active_session.load_script (id, cancellable);
    } catch (GLib.Error e) {
        throw_dbus_error (e);
    }
}
```

`active_session` 是远端 `AgentSession` 的代理。第一段调用返回 `script_id` ，client 据此建立一个可控制的 `Script` 对象；第二段才要求 agent 加载这个实例。

agent 侧的 create 路径把源码交给 `ScriptEngine` ，选择 backend，创建 `Gum.Script` 并保存实例 \[2\]\[3\]：

```javascript
Gum.ScriptBackendbackend = pick_backend (options.runtime);

Gum.Script script;
try {
if (source != null)
        script = yield backend.create (
                name, source, options.snapshot);
else
        script = yield backend.create_from_bytes (
                bytes, options.snapshot);
} catch (Gum.Error e) {
throw new Error.INVALID_ARGUMENT ("%s", e.message);
}

varinstance =new ScriptInstance (script_id, script);
instances[script_id] = instance;
```

QuickJS 的 backend create 会建立 runtime/context，并解析或编译源码 \[4\]：

```rust
script = g_object_new (GUM_QUICK_TYPE_SCRIPT,
"name", d->name,
"source", d->source,
"main-context", gum_script_task_get_context (task),
"backend", self,
    NULL);

gum_quick_script_create_context (script, &error);
```

所以语法错误可能在 create 阶段出现，但这不等于用户顶层代码已经执行。create 完成时，脚本状态仍是 `CREATED` 。

load 路径从实例表取回脚本并推进状态 \[3\]：

```javascript
if (state != CREATED)
throw new Error.INVALID_OPERATION (
"Script cannot be loaded in its current state");

load_request = new Promise<bool> ();
state = LOADING;

yield script.load ();

state = LOADED;
load_request.resolve (true);
```

QuickJS 不在控制请求线程上直接执行用户代码，而是把 load 任务交给 JS scheduler \[5\]：

```
gum_script_task_run_in_js_thread (
    task,
gum_quick_script_backend_get_scheduler (self->backend));
```

JS 线程中的 load 最终求值 entrypoint：

```
result = JS_EvalFunction (
    ctx, g_array_index (entrypoints, JSValue, i));
```

V8 对应路径使用 module `Evaluate()` 或 script `Run()` ；实现函数不同，但 create 与 load 的边界相同 \[6\]。上游 `17.9.1` 的 scheduler 创建 `gum-js-loop` 后台线程并运行 GLib main loop \[7\]：

```rust
self->js_thread = g_thread_new (
"gum-js-loop",
    (GThreadFunc) gum_script_scheduler_run_js_loop,
self);

g_main_loop_run (self->js_loop);
```

因此这部分只需记住一条源码链：

```
create_script()
  → backend.create()
  → context + Gum.Script + script_id
  → state = CREATED

Script.load()
  → state = LOADING
  → JS scheduler
  → QuickJS JS_EvalFunction / V8 Evaluate 或 Run
  → 用户 top-level
  → state = LOADED
```

`LOADED` 只说明顶层初始化完成。 `Interceptor.attach()` 可以已经安装，但它的回调仍要等目标控制流经过 Hook 点； `Java.perform()` 也可能仍在等待 App ClassLoader。

为什么 top-level 能早于 App 业务代码

> 源码直达：frida-tools `application.py` · `repl.py` · F01 · resume 放行

`frida -U -f TARGET_PACKAGE -l probe.js` 在工具内部不是一个不可分割的动作，而是下面的固定次序 \[8\]：

```
Device.spawn(TARGET_PACKAGE)
  → attach(pid)
  → Session.create_script(source)
  → 注册 message handler
  → Script.load()
  → Device.resume(pid)
```

F01 的 zymbiote 此时只阻塞 App 主线程。agent 已经拥有自己的控制线程和 JS scheduler，所以它能在 App 主线程尚未进入 `ActivityThread.main()` 时执行 top-level。

这也是 spawn 模式能提前安装 Hook 的原因：

```
App 主线程：specialize → zymbiote.recv() ─────────────→ ActivityThread.main()
                                      ↑ resume / ACK

agent 线程：attach → create → load → top-level ──────→ 等待 Hook 命中
```

`--pause` 只让 frida-tools 跳过最后的自动 `resume()` 。它不暂停 agent，也不阻止 `Script.load()` ：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/50f6bae8680d7af7.png)

`send()` 和 `console.log()` 还要经过 agent 消息队列、控制通道与主机回调。终端显示时间晚于代码执行时间，适合证明阶段是否到达，不适合推断进程内的精细时间差 \[9\]。

Android App 怎样建立 LoadedApk与最终 ClassLoader

理解 `Java.perform()` 之前，必须先建立 Android 自身的装载基线：

```
ActivityThread.main()
  → attachApplication()
  → ApplicationThread.bindApplication()
  → H.BIND_APPLICATION
  → handleBindApplication()
  → getPackageInfo()
  → LoadedApk
  → LoadedApk.getClassLoader()
  → Application / Provider / Activity
```

下一节再解释 Frida 在哪个返回点接入这条链。

### 源码直达：AOSP ActivityThread.java · LoadedApk.java · ApplicationLoaders.java · ContextImpl.java · AppComponentFactory.java

### 3.1 从 ActivityThread.main() 到 handleBindApplication()

源码直达：AOSP `ActivityThread.main()` · `ActivityThread.attach()` · `ApplicationThread.bindApplication()` · `H.handleMessage()` · `ActivityManagerService.attachApplicationLocked()`

App 主线程进入 `ActivityThread.main()` 后准备主 Looper，并把本进程的 `ApplicationThread` Binder 对象交给 system_server \[13\]\[18\]：

```
Looper.prepareMainLooper();

ActivityThread thread = new ActivityThread();
thread.attach(false, startSeq);

if (sMainThreadHandler == null) {
    sMainThreadHandler = thread.getHandler();
}

Looper.loop();
```

`attach(false, startSeq)` 的非 system 分支调用：

```
final IActivityManagermgr = ActivityManager.getService();
mgr.attachApplication(mAppThread, startSeq);
```

system_server 的 `attachApplicationLocked()` 随后跨 Binder 调用 `thread.bindApplication(...)` 。

App 进程的 `ApplicationThread.bindApplication()` 保存关键参数并向主线程发消息 \[13\]\[18\]：

```haskell
AppBindData data = new AppBindData();
data.processName = processName;
data.appInfo = appInfo;
data.providers = providerList.getList();
data.instrumentationName = instrumentationName;
data.instrumentationArgs = instrumentationArgs;
data.restrictedBackupMode = isRestrictedBackupMode;
data.config = config;
data.compatInfo = compatInfo;
data.initProfilerInfo = profilerInfo;

sendMessage(H.BIND_APPLICATION, data);
```

主线程的 `H.handleMessage()` 收到消息后调用：

```haskell
case BIND_APPLICATION:
    Trace.traceBegin(
            Trace.TRACE_TAG_ACTIVITY_MANAGER,
"bindApplication");
    AppBindData data = (AppBindData) msg.obj;
    handleBindApplication(data);
    Trace.traceEnd(Trace.TRACE_TAG_ACTIVITY_MANAGER);
break;
```

`handleBindApplication()` 才是建立目标包运行状态、创建 Application 和安装 Provider 的主线程入口。

### 3.2 getPackageInfo() 先建立包状态，不加载全部类

源码直达：AOSP `ActivityThread.handleBindApplication()` · `ActivityThread.getPackageInfo()` · `LoadedApk` 构造函数 · `LoadedApk.setApplicationInfo()`

`handleBindApplication()` 先把绑定数据保存到 `mBoundApplication` ，再请求一份包含代码的包状态 \[13\]：

```kotlin
mBoundApplication = data;

final boolean isSdkSandbox =
data.sdkSandboxClientAppPackage != null;
data.info = getPackageInfo(
data.appInfo,
        mCompatibilityInfo,
null /* baseLoader */,
false /* securityViolation */,
true /* includeCode */,
false /* registerPackage */,
        isSdkSandbox
);
```

`AppBindData.appInfo` 是 PackageManager 解析出的 `ApplicationInfo` 。 `getPackageInfo()` 先按包名查询 `mPackages` 缓存；没有可复用对象时创建 \[13\]：

```
packageInfo = new LoadedApk(
this,
    aInfo,
    compatInfo,
    baseLoader,
    securityViolation,
    includeCode && (aInfo.flags & ApplicationInfo.FLAG_HAS_CODE) != 0,
    registerPackage
);
```

`LoadedApk.setApplicationInfo()` 把包路径分开保存 \[14\]：

```
mAppDir = aInfo.sourceDir;
mResDir = aInfo.uid == myUid ? aInfo.sourceDir : aInfo.publicSourceDir;
mDataDir = aInfo.dataDir;
mLibDir = aInfo.nativeLibraryDir;
mSplitAppDirs = aInfo.splitSourceDirs;
mSplitResDirs = aInfo.uid == myUid
        ? aInfo.splitSourceDirs
        : aInfo.splitPublicSourceDirs;
mSplitClassLoaderNames = aInfo.splitClassLoaderNames;
```

此时得到的是“当前进程中目标包的运行时档案”。它已经知道 base APK、split APK、资源、数据和 native 库路径，但不表示所有 dex 已打开，也不表示业务类已经逐个加载。

### 3.3 getClassLoader() 按需创建两层 loader

源码直达：AOSP LoadedApk.createOrUpdateClassLoaderLocked() · LoadedApk.getClassLoader() · ApplicationLoaders · AppComponentFactory.instantiateClassLoader()

`LoadedApk.getClassLoader()` 检查最终字段 `mClassLoader` \[14\]：

```typescript
public ClassLoader getClassLoader() {
    synchronized (mLock) {
if (mClassLoader == null) {
            createOrUpdateClassLoaderLocked(null /*addedPaths*/);
        }
return mClassLoader;
    }
}
```

`createOrUpdateClassLoaderLocked()` 先由 `makePaths()` 汇总：

```
zipPaths
  → sourceDir
  → 非隔离 splitSourceDirs
  → Java shared libraries

libPaths
  → nativeLibraryDir
  → APK 内当前 ABI 的 lib 目录
  → 允许访问的 system/vendor/product native 路径
```

这些路径交给 `ApplicationLoaders` ，产生默认应用 loader \[14\]\[15\]：

```
mDefaultClassLoader =
    ApplicationLoaders.getDefault().getClassLoaderWithSharedLibraries(
        zip,
        mApplicationInfo.targetSdkVersion,
        isBundledApp,
        librarySearchPath,
        libraryPermittedPath,
        mBaseClassLoader,
        mApplicationInfo.classLoaderName,
        sharedLibraries.first,
        nativeSharedLibraries,
        sharedLibraries.second
    );
```

`ApplicationLoaders` 在未传入父 loader 时，以 system class loader 的 parent 作为基础父节点，再通过 `ClassLoaderFactory.createClassLoader()` 创建包含 APK 路径的 loader \[15\]：

```
ClassLoaderbaseParent = ClassLoader.getSystemClassLoader().getParent();
if (parent == null) {
    parent = baseParent;
}
```

这解释了为什么应用 loader 的父链中能看到 bootstrap loader：它是父节点，不是 Frida 最终保存的对象。

最后， `AppComponentFactory` 有机会保留或替换默认 loader \[14\]\[16\]：

```
if (mClassLoader == null) {
    mClassLoader = mAppComponentFactory.instantiateClassLoader(
        mDefaultClassLoader,
new ApplicationInfo(mApplicationInfo)
    );
}
```

默认 `AppComponentFactory.instantiateClassLoader()` 返回传入的 `mDefaultClassLoader` ；应用也可通过 manifest 配置自定义 factory。真正返回给 bridge 的是最后的 `mClassLoader` ：

```
ApplicationInfo.sourceDir / splitSourceDirs
  → LoadedApk.makePaths()
  → ApplicationLoaders
  → mDefaultClassLoader
  → AppComponentFactory.instantiateClassLoader()
  → final mClassLoader
```

### 3.4 ClassLoader 为什么早于 Application 对象

源码直达：AOSP ActivityThread.currentApplication() · ActivityThread.handleBindApplication() · LoadedApk.makeApplicationInner() · Instrumentation.newApplication()

`ActivityThread.getPackageInfo()` 返回 `LoadedApk` 后，Android 才继续创建 App Context 与 Application。

这个返回点因此位于最终 loader 可创建、Application 尚未创建的中间位置；下一节的 Frida early hook 正是接在这里。

`ActivityThread.currentApplication()` 读取的正是 `mInitialApplication` \[13\]：

```typescript
public static Application currentApplication() {
    ActivityThread am = currentActivityThread();
return am != null ? am.mInitialApplication : null;
}
```

Android 从 `getPackageInfo()` 返回后，尚未走到 `mInitialApplication = app` 。接下来的源码顺序如下。

先创建 App Context \[13\]：

```
final ContextImpl appContext =
        ContextImpl.createAppContext(this, data.info);
```

再创建 Application \[13\]：

```
app = data.info.makeApplicationInner(
data.restrictedBackupMode,
null
);
```

随后保存 `mInitialApplication` ，安装 Provider，最后调用 `Application.onCreate()` \[13\]：

```php
mInitialApplication = app;

if (!data.restrictedBackupMode) {
if (!ArrayUtils.isEmpty(data.providers)) {
installContentProviders(app, data.providers);
    }
}

try {
    mInstrumentation.onCreate(data.instrumentationArgs);
} catch (Exception e) {
throw new RuntimeException(
"Exception thrown in onCreate() of "
            + data.instrumentationName + ": " + e.toString(), e);
}

try {
    mInstrumentation.callApplicationOnCreate(app);
} catch (Exception e) {
if (!mInstrumentation.onException(app, e)) {
throw new RuntimeException(
"Unable to create application " + app.getClass().getName()
                + ": " + e.toString(), e);
    }
}
```

`makeApplicationInner()` 自己也使用同一个最终 loader \[14\]：

```
final java.lang.ClassLoadercl = getClassLoader();
ContextImplappContext =
        ContextImpl.createAppContext(mActivityThread, this);

app = mActivityThread.mInstrumentation.newApplication(
        cl,
        appClass,
        appContext
);
appContext.setOuterContext(app);
```

因此时序不是“先创建 Application，再产生 loader”，而是：

```
new LoadedApk
  → [getPackageInfo 返回：此处已经可以调用 apk.getClassLoader()]
  → ContextImpl.createAppContext()
  → makeApplicationInner()
       → getClassLoader()
       → final mClassLoader
  → mInitialApplication = app
  → ContentProvider
  → Application.onCreate()
```

Android 的自然主线最迟会在 `makeApplicationInner()` 中取得最终 loader。 `getPackageInfo()` 返回点更早，并且返回的 `LoadedApk` 已经具备按需创建 loader 所需的全部路径；下一节会看到 Frida 正是在这个间隙主动调用 `apk.getClassLoader()` 。

### 3.5 Activity 为什么继续使用同一个 loader

源码直达：AOSP `ActivityThread.performLaunchActivity()` · `ContextImpl.createActivityContext()` · `AppComponentFactory.instantiateActivity()`

普通同包 Activity 启动时， `performLaunchActivity()` 取得或复用同一包的 `LoadedApk` ，再从 Activity Context 取 loader \[13\]：

```
if (r.packageInfo == null) {
    r.packageInfo = getPackageInfo(
        aInfo.applicationInfo,
        mCompatibilityInfo,
        Context.CONTEXT_INCLUDE_CODE
    );
}

ContextImplappContext = createBaseContextForActivity(r);
java.lang.ClassLoadercl = appContext.getClassLoader();
activity = mInstrumentation.newActivity(
        cl,
        component.getClassName(),
        r.intent
);
```

所以主包默认路径是：

```
同一个 LoadedApk.mClassLoader
  ├─ 实例化 Application
  └─ 实例化普通同包 Activity
```

隔离 split 会通过 `getSplitClassLoader()` 使用专用 loader；插件、加固和热更新也能在默认链之外创建 `DexClassLoader` 、 `PathClassLoader` 或自定义 loader。主包 loader 成功不代表这些独立命名空间已经可见。

从 JavaVM、JNIEnv 到 Java.perform()

top-level 开始执行，只证明 GumJS 已经运行。bridge 初始化与 `Java.perform()` 调用按下面两层推进：

```
bridge 初始化
  → 发现进程中的 JavaVM
  → 从 JavaVM invocation table 绑定 GetEnv / AttachCurrentThread

Java.perform(fn)
  → 先判断 App 默认 ClassLoader 是否就绪
  ├─ 已就绪：VM.perform 取得当前线程 JNIEnv → 执行 fn
  └─ 未就绪：fn 入队
       → VM.perform 取得当前线程 JNIEnv → 安装 framework Hook
       → Hook 取得 LoadedApk / ClassLoader
       → VM.perform 再为触发 Hook 的线程取得 JNIEnv → 执行 fn
  → 按需枚举其他 ClassLoader
```

### 4.1 JavaVM、JNIEnv、ClassLoader 是三种不同对象

源码直达：AOSP libnativehelper `jni.h` ： `JNIEnv` 定义 · `JNIInvokeInterface` / `JavaVM` · Android Developers · JNI Tips

三个对象解决的问题不同：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3842a20fe601940b.png)

AOSP `jni.h` 中， `JNIEnv` 是 JNI 函数表包装 \[22\]：

```
struct _JNIEnv {
conststruct JNINativeInterface* functions;
};
```

JavaVM 则持有 invocation table，其中包含线程相关入口 \[22\]：

```cpp
struct JNIInvokeInterface {
void* reserved0;
void* reserved1;
void* reserved2;

jint (*DestroyJavaVM)(JavaVM*);
jint (*AttachCurrentThread)(JavaVM*, JNIEnv**, void*);
jint (*DetachCurrentThread)(JavaVM*);
jint (*GetEnv)(JavaVM*, void**, jint);
jint (*AttachCurrentThreadAsDaemon)(JavaVM*, JNIEnv**, void*);
};

struct _JavaVM {
conststruct JNIInvokeInterface* functions;
};
```

所以“拿到 JavaVM”“当前线程拿到 JNIEnv”“选对业务 ClassLoader”是三道独立条件。JavaVM 已存在时，Frida 的 JS 线程仍可能尚未附加；JNIEnv 已取得时，默认 App loader 仍可能为空。

必须讲清 JNIEnv，是因为 `frida-agent` 的 GumJS scheduler 本质上从 native 线程执行脚本。它不能只拿一个进程级 JavaVM 指针就直接调用 Java API：每次进入 JNI 都要先确认当前 tid 对应的 JNIEnv。必须讲清 ClassLoader，则是因为 JNIEnv 只提供调用接口，不会替 Frida 决定目标类位于主 APK、隔离 split 还是插件 dex。

### 4.2 Frida 怎样找到进程中的 JavaVM

### 源码直达：frida-java-bridge lib/api.js · lib/android.js：getApi() 与 libart/libdvm 识别 · JNI_GetCreatedJavaVMs 取 VM · index.js::\_tryInitialize()

`lib/api.js` 先按运行环境选择 Android 或标准 JVM backend \[20\]：

```javascript
import {
  getApi as androidGetApi,
  getAndroidVersion
} from './android.js';
import { getApi as jvmGetApi } from './jvm.js';

let getApi = androidGetApi;
try {
getAndroidVersion();
} catch (e) {
  getApi = jvmGetApi;
}
```

Android backend 枚举模块，只接受真实的 `libart.so` 或 `libdvm.so` \[20\]：

```javascript
const vmModules = Process.enumerateModules()
  .filter(m =>/^lib(art|dvm).so$/.test(m.name))
  .filter(m => !/\/system\/fake-libs/.test(m.path));

if (vmModules.length === 0) {
return null;
}

const vmModule = vmModules[0];
const flavor =
    (vmModule.name.indexOf('art') !== -1)
      ? 'art'
      : 'dalvik';
```

解析 `JNI_GetCreatedJavaVMs` 后，bridge 请求当前进程已经创建的 VM，并保存第一个 `JavaVM*` \[20\]：

```kotlin
const vms = Memory.alloc(pointerSize);
const vmCount = Memory.alloc(jsizeSize);

checkJniResult(
'JNI_GetCreatedJavaVMs',
  temporaryApi.JNI_GetCreatedJavaVMs(vms, 1, vmCount)
);

if (vmCount.readInt() === 0) {
return null;
}

temporaryApi.vm = vms.readPointer();
```

`Runtime._tryInitialize()` 再用这个指针创建 `VM` 包装，并初始化 Android bridge 与 `ClassFactory` \[10\]：

```kotlin
const api = getApi();
if (api === null) {
return false;
}

const vm = new VM(api);
this.vm = vm;

initialize(vm);
ClassFactory._initialize(vm, api);
this.classFactory = new ClassFactory();
```

到这里仅完成了“发现进程 JavaVM”。 `classFactory.loader` 仍是 `null` ，当前 Frida 线程也要通过下一步确认自己是否已有 JNIEnv。

### 4.3 VM.perform() 怎样为当前线程取得 JNIEnv

源码直达：frida-java-bridge lib/vm.js：JavaVM vtable · VM.perform() / attach / GetEnv · env 嵌套缓存与清理 · AOSP jni.h invocation table

`VM` 构造函数从 `JavaVM*` 的 invocation table 取出三个函数。索引 4、5、6 正好对应 AOSP `jni.h` 中的 `AttachCurrentThread` 、 `DetachCurrentThread` 、 `GetEnv` \[11\]\[22\]：

```javascript
const vtable = handle.readPointer();
const options = {
  exceptions: 'propagate'
};

attachCurrentThread = new NativeFunction(
  vtable.add(4 * pointerSize).readPointer(),
'int32',
  ['pointer', 'pointer', 'pointer'],
  options
);
detachCurrentThread = new NativeFunction(
  vtable.add(5 * pointerSize).readPointer(),
'int32',
  ['pointer'],
  options
);
getEnv = new NativeFunction(
  vtable.add(6 * pointerSize).readPointer(),
'int32',
  ['pointer', 'pointer', 'int32'],
  options
);
```

`VM.perform()` 的完整执行主线如下 \[11\]：

```kotlin
this.perform = function (fn) {
const threadId = Process.getCurrentThreadId();

const cachedEnv = tryGetCachedEnv(threadId);
if (cachedEnv !== null) {
return fn(cachedEnv);
  }

  let env = this._tryGetEnv();
const alreadyAttached = env !== null;
if (!alreadyAttached) {
    env = this.attachCurrentThread();
    attachedThreads.set(threadId, true);
  }

this.link(threadId, env);

try {
return fn(env);
  } finally {
const isJsThread = threadId === jsThreadID;

if (!isJsThread) {
this.unlink(threadId);
    }

if (!alreadyAttached && !isJsThread) {
const allowedToDetach =
          attachedThreads.get(threadId);
      attachedThreads.delete(threadId);

if (allowedToDetach) {
this.detachCurrentThread();
      }
    }
  }
};
```

它调用的查询与附加函数也是 bridge 自己从 vtable 绑定的 \[11\]：

```kotlin
this.attachCurrentThread = function () {
const envBuf = Memory.alloc(pointerSize);
  checkJniResult(
'VM::AttachCurrentThread',
    attachCurrentThread(handle, envBuf, NULL)
  );
return new Env(envBuf.readPointer(), this);
};

this.detachCurrentThread = function () {
  checkJniResult(
'VM::DetachCurrentThread',
    detachCurrentThread(handle)
  );
};

this.getEnv = function () {
const cachedEnv =
      tryGetCachedEnv(Process.getCurrentThreadId());
if (cachedEnv !== null) {
return cachedEnv;
  }

const envBuf = Memory.alloc(pointerSize);
const result =
      getEnv(handle, envBuf, JNI_VERSION_1_6);
if (result === -2) {
throw new Error(
'Current thread is not attached to the Java VM; ' +
'please move this code inside a Java.perform() callback'
    );
  }
  checkJniResult('VM::GetEnv', result);
return new Env(envBuf.readPointer(), this);
};

this._tryGetEnv = function () {
const h = this.tryGetEnvHandle(JNI_VERSION_1_6);
if (h === null) {
return null;
  }
return new Env(h, this);
};

this.tryGetEnvHandle = function (version) {
const envBuf = Memory.alloc(pointerSize);
const result = getEnv(handle, envBuf, version);
if (result !== JNI_OK) {
return null;
  }
return envBuf.readPointer();
};
```

嵌套调用通过 `activeEnvs` 按 tid 复用同一份 wrapper \[11\]：

```javascript
this.link = function (tid, env) {
const entry = activeEnvs.get(tid);
if (entry === undefined) {
    activeEnvs.set(tid, [env, 1]);
  } else {
    entry[1]++;
  }
};

this.unlink = function (tid) {
const entry = activeEnvs.get(tid);
if (entry[1] === 1) {
    activeEnvs.delete(tid);
  } else {
    entry[1]--;
  }
};

function tryGetCachedEnv (threadId) {
const entry = activeEnvs.get(threadId);
if (entry === undefined) {
return null;
  }
return entry[0];
}

VM.dispose = function (vm) {
if (attachedThreads.get(jsThreadID) === true) {
    attachedThreads.delete(jsThreadID);
    vm.detachCurrentThread();
  }
};
```

准确顺序是：

```
当前 tid
  → activeEnvs 中有缓存：直接复用
  → 无缓存：JavaVM.GetEnv(JNI_VERSION_1_6)
       → 成功：当前线程原本已附加
       → 非 JNI_OK：JavaVM.AttachCurrentThread
  → link(tid, env)
  → 执行 fn(env)
  → 非 JS 线程按条件 unlink / DetachCurrentThread
  → JS scheduler 线程保留 attach，bridge dispose 时再 detach
```

这条路径没有调用 `ThreadList::SuspendAll` 。固定 `index.js` 中 `withAllArtThreadsSuspended()` 的调用点位于 `_enumerateClassLoadersArt()` ，不在 `perform()` 或 `VM.perform()` 中 \[21\]。取得 JNIEnv 是当前线程与 JavaVM 的关系；全线程暂停发生在 §4.10 的 ART ClassLoader 枚举中。

### 4.4 Java.perform()：立即执行，还是等待 App loader

源码直达：frida-java-bridge index.js::perform() · Runtime.\_isAppProcess()

`Java.perform(fn)` 在 JNIEnv 之外还处理 Android App 默认 ClassLoader 的时机 \[10\]：

```kotlin
perform (fn) {
this._checkAvailable();

if (!this._isAppProcess() ||
this.classFactory.loader !== null) {
try {
this.vm.perform(fn);
    } catch (e) {
      Script.nextTick(() => { throw e; });
    }
  } else {
this._pendingVmOps.push(fn);
if (this._pendingVmOps.length === 1) {
this._performPendingVmOpsWhenReady();
    }
  }
}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d25ec59e9a65e415.png)

只有队列从 0 变成 1 时才安装等待 Hook；后续 `Java.perform()` 只继续入队。 `_isAppProcess()` 则通过 `/proc/self/exe` 是否匹配 `/system/bin/app_process` 判断并缓存结果 \[10\]。

因此 `Java.perform()` 是两层组合：

```
VM.perform
  → 当前线程取得 JNIEnv

Android App loader gate
  → 默认 loader 为空时等待 LoadedApk
```

### 4.5 \_performPendingVmOpsWhenReady()：完整 Hook 代码

源码直达：frida-java-bridge `index.js::_performPendingVmOpsWhenReady()` · `_performPendingVmOps()` · AOSP `ActivityThread.handleBindApplication()`

下面是固定 bridge 提交 `index.js:400-454` 的完整实现 \[10\]：

```javascript
_performPendingVmOpsWhenReady () {
this.vm.perform(() => {
const { classFactory: factory } = this;

const ActivityThread = factory.use('android.app.ActivityThread');
const app = ActivityThread.currentApplication();
if (app !== null) {
initFactoryFromApplication(factory, app);
this._performPendingVmOps();
return;
    }

const runtime = this;
let initialized = false;
let hookpoint = 'early';

const handleBindApplication = ActivityThread.handleBindApplication;
    handleBindApplication.implementation = function (data) {
if (data.instrumentationName.value !== null) {
        hookpoint = 'late';

const LoadedApk = factory.use('android.app.LoadedApk');
const makeApplication = LoadedApk.makeApplication;
        makeApplication.implementation = function (forceDefaultAppClass, instrumentation) {
if (!initialized) {
            initialized = true;
initFactoryFromLoadedApk(factory, this);
            runtime._performPendingVmOps();
          }

return makeApplication.apply(this, arguments);
        };
      }

      handleBindApplication.apply(this, arguments);
    };

const getPackageInfoCandidates = ActivityThread.getPackageInfo.overloads
      .map(m => [m.argumentTypes.length, m])
      .sort(([arityA,], [arityB,]) => arityB - arityA)
      .map(([_, method]) => method);
const getPackageInfo = getPackageInfoCandidates[0];
    getPackageInfo.implementation = function (...args) {
const apk = getPackageInfo.call(this, ...args);

if (!initialized && hookpoint === 'early') {
        initialized = true;
initFactoryFromLoadedApk(factory, apk);
        runtime._performPendingVmOps();
      }

return apk;
    };
  });
}
```

这段等待逻辑没有定时器，也没有 sleep。它先检查当前 `Application` ，若仍为空，就通过 Frida Java 方法替换安装三个可能的 Hook 点：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ad8695763c3ef274.png)

此时 `ClassFactory.loader` 虽然为空， `factory.use('android.app.ActivityThread')` 仍可工作，因为它是 framework 类；空 loader 分支会走 JNI `FindClass` 。业务 APK 类此时仍不具备同样的可见性，具体分支见 §4.11。

安装完 Hook 后，最初那次 `_performPendingVmOpsWhenReady()` 就返回。用户的 `fn` 仍在 `_pendingVmOps` 中，top-level 可以继续执行；只有 Android 后续真正调用这些方法，队列才会被清空。

固定源码没有在 `initialized = true` 后恢复这几个 `.implementation` 。这些 wrapper 仍保留，但 `initialized` 阻止重复初始化和重复清空队列，wrapper 随后继续调用原方法。

### 4.6 晚注入：Application 已存在时立即拿 loader

源码直达：frida-java-bridge 晚注入分支与 `initFactoryFromApplication()` · `initFactoryFromApplication()` · AOSP `Application.attach()` · `ContextWrapper.getClassLoader()` · `ContextImpl.getClassLoader()`

如果进入 `_performPendingVmOpsWhenReady()` 时：

```
const app = ActivityThread.currentApplication();
```

已经返回非空对象，bridge 不安装上述 Hook，而是立即执行 \[10\]：

```
initFactoryFromApplication(factory, app);
this._performPendingVmOps();
return;
```

对应初始化函数是：

```php
function initFactoryFromApplication (factory, app) {
const Process = factory.use('android.os.Process');

  factory.loader = app.getClassLoader();

if (Process.myUid() === Process.SYSTEM_UID.value) {
    factory.cacheDir = '/data/system';
    factory.codeCacheDir = '/data/dalvik-cache';
  } else {
if ('getCodeCacheDir' in app) {
      factory.cacheDir = app.getCacheDir().getCanonicalPath();
      factory.codeCacheDir = app.getCodeCacheDir().getCanonicalPath();
    } else {
      factory.cacheDir = app.getFilesDir().getCanonicalPath();
      factory.codeCacheDir = app.getCacheDir().getCanonicalPath();
    }
  }
}
```

`Application.getClassLoader()` 经 `ContextWrapper → ContextImpl → LoadedApk.getClassLoader()` 返回目标包的最终 loader \[14\]\[17\]。赋值完成后，pending 队列立即执行。

这条委托链在 AOSP 中是直接代码，不是概念推导 \[17\]：

```typescript
// Application.attach()
final void attach(Context context) {
attachBaseContext(context);
    mLoadedApk = ContextImpl.getImpl(context).mPackageInfo;
}

// ContextWrapper.getClassLoader()
public ClassLoader getClassLoader() {
return mBase.getClassLoader();
}

// ContextImpl.getClassLoader()
public ClassLoader getClassLoader() {
return mClassLoader != null
            ? mClassLoader
            : (mPackageInfo != null
                    ? mPackageInfo.getClassLoader()
                    : ClassLoader.getSystemClassLoader());
}
```

### 4.7 早期普通启动：在 getPackageInfo() 返回处拿到 LoadedApk

源码直达：frida-java-bridge early `getPackageInfo` hook · `initFactoryFromLoadedApk()` · AOSP `ActivityThread.getPackageInfo()`

spawn 早期 `currentApplication()` 为空，bridge 已经安装前面的 Hook。客户端 `resume()` 后，Android 按 §3.1 的顺序在主线程进入 `handleBindApplication(data)` ，并按 §3.2 调用参数最多的 `getPackageInfo(...)` 。Frida 此时已经在等待这个调用。

bridge 把所有 `getPackageInfo` overload 按参数数量降序排列：

```javascript
const getPackageInfoCandidates = ActivityThread.getPackageInfo.overloads
  .map(m => [m.argumentTypes.length, m])
  .sort(([arityA,], [arityB,]) => arityB - arityA)
  .map(([_, method]) => method);
const getPackageInfo = getPackageInfoCandidates[0];
```

固定 Android 14 中，排在第一位的正是 `handleBindApplication()` 使用的最长 overload。它的 replacement 先调用原方法：

```
const apk = getPackageInfo.call(this, ...args);
```

原方法查询 `mPackages` 缓存；未命中时创建目标包的 `LoadedApk` 并返回。返回值首先回到 Frida replacement，所以此刻 Android 已经有 `LoadedApk` ，但 `handleBindApplication()` 还没有继续创建 Application。

随后 replacement 执行：

```
if (!initialized && hookpoint === 'early') {
  initialized = true;
  initFactoryFromLoadedApk(factory, apk);
  runtime._performPendingVmOps();
}
```

`initFactoryFromLoadedApk()` 的完整实现是 \[10\]：

```php
function initFactoryFromLoadedApk (factory, apk) {
const JFile = factory.use('java.io.File');

  factory.loader = apk.getClassLoader();

const dataDir = JFile.$new(apk.getDataDir()).getCanonicalPath();
  factory.cacheDir = dataDir;
  factory.codeCacheDir = dataDir + '/cache';
}
```

关键语句不是枚举 ClassLoader，也不是读取线程 context loader，而是直接调用：

```
factory.loader = apk.getClassLoader();
```

如果 `LoadedApk.mClassLoader` 仍为空，Android 会在这次调用内部执行 `createOrUpdateClassLoaderLocked()` ；如果此前已创建，则直接返回同一个最终 loader。§3 已经展开这个 Android 内部过程。

loader 和缓存目录都设置后，bridge 立即调用 `_performPendingVmOps()` \[10\]：

```javascript
_performPendingVmOps () {
const { vm, _pendingVmOps: pending } = this;

let fn;
while ((fn = pending.shift()) !== undefined) {
try {
      vm.perform(fn);
    } catch (e) {
Script.nextTick(() => { throw e; });
    }
  }
}
```

`shift()` 表明回调按入队顺序逐个取出。每个回调再次经过 `vm.perform(fn)` ，确保当前触发 Hook 的线程具有合法 JNI 环境；异常被转交到下一轮 JS 调度。

普通早期路径的精确执行点因此是：

```
App 主线程进入 handleBindApplication()
  → 调用 getPackageInfo(...)
  → Frida replacement 调用原 getPackageInfo(...)
  → 原方法返回 LoadedApk
  → replacement 调用 apk.getClassLoader()
  → factory.loader = 最终 App ClassLoader
  → replacement 同步清空 _pendingVmOps
  → Java.perform(fn) 的 fn 在这里执行
  → replacement 返回 LoadedApk
  → handleBindApplication() 继续创建 Context 和 Application
```

在这条固定实现路径上，pending 回调由 App 主线程调用 `getPackageInfo()` 时同步触发，所以本次回调会落在 App 主线程上；这是当前 Hook 位置产生的结果，不是 `Java.perform()` 的 API 线程承诺。

### 4.8 instrumentation：为什么改走 makeApplication

源码直达：frida-java-bridge instrumentation late hook · AOSP Android 14 handleBindApplication() 调用 makeApplicationInner()

`handleBindApplication` replacement 最先检查：

```
if (data.instrumentationName.value !== null) {
  hookpoint = 'late';
// 安装 LoadedApk.makeApplication replacement
}
```

一旦 `hookpoint` 变成 `late` ，前面的 `getPackageInfo` replacement 仍会执行原方法并返回 `LoadedApk` ，但不会初始化 factory，也不会清空队列：

```
if (!initialized && hookpoint === 'early') {
// instrumentation 下条件不成立
}
```

固定 bridge 选择等到 `LoadedApk.makeApplication()` 被调用，再以该 `LoadedApk` 的 `this` 执行：

```
initFactoryFromLoadedApk(factory, this);
runtime._performPendingVmOps();
```

原因是 instrumentation 的 APK、split 与 native 路径会参与 loader 组合，普通路径的早期时点可能尚未形成最终环境。

这里存在明确版本边界：固定 bridge 提交 Hook 的是 `LoadedApk.makeApplication()` ，本课固定 Android 14 的 `handleBindApplication()` 调用的是 `makeApplicationInner()` \[10\]\[13\]。因此 instrumentation 分支要按目标 ROM 验证真实调用点；不能用普通启动路径成功替代。

### 4.9 performNow()：只尝试一次，不安装等待 Hook

源码直达：frida-java-bridge index.js::performNow() · scheduleOnMainThread()

`performNow()` 的完整实现是 \[10\]：

```kotlin
performNow (fn) {
this._checkAvailable();

return this.vm.perform(() => {
const { classFactory: factory } = this;

if (this._isAppProcess() && factory.loader === null) {
const ActivityThread = factory.use('android.app.ActivityThread');
const app = ActivityThread.currentApplication();
if (app !== null) {
        initFactoryFromApplication(factory, app);
      }
    }

return fn();
  });
}
```

它只检查当前 Application：有就取 loader，没有也立即执行 `fn` 。它不写 `_pendingVmOps` ，也不 Hook `handleBindApplication()` 、 `getPackageInfo()` 或 `makeApplication()` 。

所以早期 spawn 中：

```javascript
console.log("A");
Java.perform(() =>console.log("B"));
console.log("C");
```

会先执行 `A` 、将 `B` 入队、继续执行 `C` ；resume 后 Android 进入前述 Hook 点，才执行 `B` 。

四种 API 的职责至此完全分开：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6b6555a5d7a5b980.png)

### 4.10 Java.enumerateClassLoaders() 怎样取得当前全部 loader

源码直达：frida-java-bridge enumerateClassLoaders() · ART 枚举实现 · withRunnableArtThread() / withAllArtThreadsSuspended() · makeArtClassLoaderVisitor() · AOSP ART ClassLinker::VisitClassLoaders() · ThreadList::SuspendAll() / ResumeAll()

`Java.perform()` 只为默认 `Java.classFactory` 选择主包 loader。插件、壳、热更新框架或隔离 split 创建的 loader，需要在 Java 环境可用后另行枚举。

公共 API 先按 VM 类型分派 \[21\]：

```kotlin
enumerateClassLoaders (callbacks) {
this._checkAvailable();

const { flavor } = this.api;
if (flavor === 'jvm') {
this._enumerateClassLoadersJvm(callbacks);
  } else if (flavor === 'art') {
this._enumerateClassLoadersArt(callbacks);
  } else {
throw new Error(
'Enumerating class loaders is not supported on Dalvik'
    );
  }
}
```

标准 JVM 路径通过 `choose('java.lang.ClassLoader')` 枚举堆实例；Android ART 使用 `ClassLinker::VisitClassLoaders` 。固定 bridge 中的 ART 实现是 \[21\]：

```javascript
_enumerateClassLoadersArt (callbacks) {
const { classFactory: factory, vm, api } = this;
const env = vm.getEnv();

const visitClassLoaders =
      api['art::ClassLinker::VisitClassLoaders'];
if (visitClassLoaders === undefined) {
throw new Error(
'This API is only available on Android >= 7.0'
    );
  }

const ClassLoader = factory.use('java.lang.ClassLoader');

const loaderHandles = [];
const addGlobalReference =
      api['art::JavaVMExt::AddGlobalRef'];
const { vm: vmHandle } = api;

withRunnableArtThread(vm, env, thread => {
const collectLoaderHandles =
makeArtClassLoaderVisitor(loader => {
          loaderHandles.push(
addGlobalReference(vmHandle, thread, loader)
          );
return true;
        });

withAllArtThreadsSuspended(() => {
visitClassLoaders(
        api.artClassLinker.address,
        collectLoaderHandles
      );
    });
  });

try {
    loaderHandles.forEach(handle => {
const loader =
          factory.cast(handle, ClassLoader);
      callbacks.onMatch(loader);
    });
  } finally {
    loaderHandles.forEach(handle => {
      env.deleteGlobalRef(handle);
    });
  }

  callbacks.onComplete();
}
```

这段代码分成四个阶段。

第一， `vm.getEnv()` 要求调用线程已经拥有 JNIEnv。因此实际脚本通常把枚举放在 `Java.perform()` 回调中；这里没有再次自动 attach \[11\]\[21\]。

第二， `withRunnableArtThread()` 把当前 JNI 线程带入 bridge 需要的 ART 线程状态，并把底层 `art::Thread*` 交给回调 \[20\]：

```javascript
export function withRunnableArtThread (vm, env, fn) {
  const perform =
      getArtThreadStateTransitionImpl(vm, env);

  const id = getArtThreadFromEnv(env).toString();
  artThreadStateTransitions[id] = fn;

  perform(env.handle);

if (artThreadStateTransitions[id] !== undefined) {
    delete artThreadStateTransitions[id];
    throw new Error(
'Unable to perform state transition; please file a bug'
    );
  }
}
```

`makeArtClassLoaderVisitor()` 则按 ART 的 C++ visitor ABI 在内存中构造对象和虚表，把 `Visit()` 转回 JavaScript 回调 \[20\]：

```javascript
class ArtClassLoaderVisitor {
constructor (visit) {
const visitor = Memory.alloc(4 * pointerSize);

const vtable = visitor.add(pointerSize);
    visitor.writePointer(vtable);

const onVisit =
new NativeCallback((self, klass) => {
visit(klass);
        }, 'void', ['pointer', 'pointer']);
    vtable.add(2 * pointerSize).writePointer(onVisit);

this.handle = visitor;
this._onVisit = onVisit;
  }
}

export function makeArtClassLoaderVisitor (visit) {
return new ArtClassLoaderVisitor(visit);
}
```

第三，真正访问 ART 的 ClassLinker 列表前，bridge 才暂停所有 ART mutator 线程 \[20\]：

```php
export function withAllArtThreadsSuspended (fn) {
const api = getApi();

const threadList = api.artThreadList;
const longSuspend = false;
  api['art::ThreadList::SuspendAll'](
    threadList,
    Memory.allocUtf8String('frida'),
    longSuspend ? 1 : 0
  );
try {
fn();
  } finally {
    api['art::ThreadList::ResumeAll'](threadList);
  }
}
```

`finally` 保证 visitor 抛出异常时仍执行 `ResumeAll()` 。AOSP Android 14 的关键代码是 \[23\]：

```rust
void ThreadList::SuspendAll(
const char* cause,
bool long_suspend) {
  Thread* self = Thread::Current();

SuspendAllInternal(self, self);

  Locks::mutator_lock_->ExclusiveLock(self);
  long_suspend_ = long_suspend;
}

void ThreadList::ResumeAll() {
  Thread* self = Thread::Current();

  long_suspend_ = false;
  Locks::mutator_lock_->ExclusiveUnlock(self);

  {
    MutexLock mu(self, *Locks::thread_list_lock_);
    MutexLock mu2(
self,
        *Locks::thread_suspend_count_lock_);

    --suspend_all_count_;
for (const auto& thread : list_) {
if (thread == self) {
continue;
      }
bool updated = thread->ModifySuspendCount(
self,
          -1,
          nullptr,
          SuspendReason::kInternal);
DCHECK(updated);
    }

    Thread::resume_cond_->Broadcast(self);
  }
}
```

真实函数还包含超时、追踪和调试检查；这里摘出改变线程状态与 mutator lock 的主干。 `SuspendAllInternal()` 的源码注释明确说明：先请求所有正在运行 Java 的线程暂停，并等待它们完成暂停；新线程也不能绕过 suspend-request 直接开始执行 Java \[23\]。

第四，暂停窗口内只做 ClassLoader 指针遍历和 global reference 收集。AOSP Android 14 的 `VisitClassLoaders()` 直接遍历 `ClassLinker::class_loaders_` ，解码仍存活的 weak global root，再调用 visitor \[23\]：

```rust
void ClassLinker::VisitClassLoaders(
    ClassLoaderVisitor* visitor) const {
  Thread* const self = Thread::Current();
for (const ClassLoaderData& data : class_loaders_) {
    ObjPtr<mirror::ClassLoader> class_loader =
        ObjPtr<mirror::ClassLoader>::DownCast(
self->DecodeJObject(data.weak_root));
if (class_loader != nullptr) {
      visitor->Visit(class_loader);
    }
  }
}
```

Frida visitor 为每个 native loader 指针调用 `JavaVMExt::AddGlobalRef` 。这样退出暂停窗口、恢复其他线程后，这些对象仍不会被 GC 回收；随后 bridge 才把 handle 转成 `java.lang.ClassLoader` wrapper，调用用户的 `onMatch()` ，最后删除 global ref \[21\]。

因此这里的“全部 ClassLoader”有明确边界：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/50c242db1a585dbf.png)

所以应把两个动作严格分开：

```
Java.perform()
  → 获取/附加当前线程的 JNIEnv
  → 不暂停全部 Java 线程

Java.enumerateClassLoaders()
  → withRunnableArtThread
  → SuspendAll
  → ClassLinker::VisitClassLoaders
  → AddGlobalRef 保存结果
  → ResumeAll
  → onMatch(loader)
```

### 4.11 为什么换成目标 loader 后 Java.use() 才能 Hook

源码直达：ClassFactory get(loader) · loader / use() · FindClass / loader.loadClass() · AOSP ART LookupClassesVisitor · Android JNI Tips · FindClass

`factory.loader = apk.getClassLoader()` 会进入 `ClassFactory.loader` setter \[12\]：

```kotlin
set loader (value) {
const isInitial = this._loader === null && value !== null;

this._loader = value;

if (isInitial &&
      factoryCache.state === 'ready' &&
this === factoryCache.factories[0]) {
    addFactoryToCache(this, value);
  }
}
```

真正决定后续类查找路径的是 `_loader` 字段。

`ClassFactory.use()` 根据 `_loader` 选择两条类解析路径 \[12\]：

```
const { _loader: loader } = this;
const getClassHandle = (loader !== null)
  ? makeLoaderClassHandleGetter(className, loader, env)
  : makeBasicClassHandleGetter(className);
```

`loader == null` 时，基础分支最终调用 JNI `FindClass` ：

```javascript
function makeBasicClassHandleGetter (className) {
const canonicalClassName = className.replace(/\./g, '/');
return function (env) {
return env.findClass(canonicalClassName);
  };
}
```

附加的原生线程没有 App Java 调用栈，Android 的 `FindClass` 会从 system class loader 语境查找；framework 类可见，不能证明 APK loader 已建立 \[19\]。

`loader != null` 后，bridge 改为显式调用该对象的 `loadClass()` \[12\]：

```
cachedLoaderMethod =
    usedLoader.loadClass
        .overload('java.lang.String').handle;

const result = cachedLoaderInvoke(
    env.handle,
    usedLoader.$h,
    cachedLoaderMethod,
    classNameValue
);
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9a74078a6423f517.png)

#### 类名相同，不代表是同一个类

Java 类身份不只由二进制类名决定，还取决于 defining ClassLoader。AOSP ART 查找指定 loader 定义的类时，也明确检查 \[23\]：

```
ObjPtr<mirror::Class> klass =
    class_table->Lookup(descriptor_, hash_);

if (klass != nullptr &&
    klass->GetClassLoader() == class_loader) {
  result_->push_back(klass);
}
```

因此以下对象可以同时存在：

```
com.example.Target + PathClassLoader(main)
com.example.Target + DexClassLoader(plugin)
```

它们有相同类名，却是两个不同的 `java.lang.Class` ，各自拥有独立的静态字段、方法入口和实例类型关系。

主包默认 loader 通常只能看到：

```
bootstrap / framework
  → base APK
  → 普通 split
```

插件 loader 可能把另一个 dex 加在自己的搜索路径中。父加载器通常不能反向看到子加载器新增的类，两个并列插件 loader 也不共享命名空间。

因此：

```
Java.perform() 已执行
  ≠ 所有插件 loader 已创建
  ≠ 默认 factory 能解析所有业务类
```

如果默认 factory 看不到目标类， `Java.use(TARGET_CLASS)` 在得到方法 wrapper 之前就会抛出 `ClassNotFoundException` ，自然没有可替换的目标方法。

如果多个 loader 都能解析同名类，默认 factory 还可能拿到另一份 `Class` 。此时 Hook 安装成功但业务调用走的是另一 loader 定义的类，回调仍不会命中。

#### ClassFactory.get(loader) 怎样绑定独立命名空间

固定 bridge 会按 loader 缓存独立 factory \[12\]：

```kotlin
static get (classLoader) {
const cache = getFactoryCache();
const defaultFactory = cache.factories[0];

if (classLoader === null) {
return defaultFactory;
  }

const indexObj = cache.loaders.get(classLoader);
if (indexObj !== null) {
const index =
        defaultFactory.cast(indexObj, cache.Integer);
return cache.factories[index.intValue()];
  }

const factory = new ClassFactory();
  factory.loader = classLoader;
  factory.cacheDir = defaultFactory.cacheDir;
  addFactoryToCache(factory, classLoader);

return factory;
}
```

指定 factory 的 `use()` 会通过该 loader 的 `loadClass()` 取得目标 `Class` ，然后围绕这份 class handle 构造方法 wrapper。Hook 因而落在该命名空间中的真实方法上。

推荐保持默认 factory 不变，为候选 loader 建立独立 factory：

```kotlin
const targetFactory =
    Java.ClassFactory.get(targetLoader);
const Target =
    targetFactory.use('TARGET_CLASS');

const targetMethod = Target.targetMethod.overload();
targetMethod.implementation = function () {
return targetMethod.call(this);
};
```

直接替换全局默认值也会改变后续 `Java.use()` 的查找入口：

```
Java.classFactory.loader = targetLoader;
const Target = Java.use('TARGET_CLASS');
```

但 `ClassFactory` 会缓存已成功创建的 class wrapper，而 loader setter 本身只更新 `_loader` ，不会清空 `_classes` 。在同一默认 factory 上反复切换 loader，容易把先前缓存的同名 wrapper 与新 loader 混在一起。

独立 `Java.ClassFactory.get(loader)` 的边界更清楚。

#### 从枚举到 Hook 的完整脚本

下面的脚本先要求候选 loader 成功执行 `loadClass()` ，再记录返回 Class 的 defining loader；只有验证通过后才创建 factory 并安装 Hook：

```php
Java.perform(() => {
const TARGET_CLASS = 'TARGET_CLASS';
const TARGET_METHOD = 'targetMethod';
const TARGET_OVERLOAD = ['java.lang.String'];
const matches = [];

  Java.enumerateClassLoaders({
onMatch(loader) {
try {
const klass = loader.loadClass(TARGET_CLASS);
const definingLoader = klass.getClassLoader();

        matches.push({
candidate: String(loader),
defining: definingLoader === null
            ? '<bootstrap>'
            : String(definingLoader),
definesClass: definingLoader !== null &&
              definingLoader.equals(loader)
        });

if (definingLoader === null ||
            !definingLoader.equals(loader)) {
return;
        }

const factory =
            Java.ClassFactory.get(loader);
const Target =
            factory.use(TARGET_CLASS);
const method =
            Target[TARGET_METHOD]
                .overload(...TARGET_OVERLOAD);

        method.implementation = function (...args) {
send({
event: 'target-hit',
loader: String(loader)
          });
return method.call(this, ...args);
        };

send({
event: 'hook-installed',
loader: String(loader),
definingLoader: String(
            Target.class.getClassLoader()
          )
        });
      } catch (e) {
// 当前 loader 看不到目标类时继续检查下一个。
      }
    },
onComplete() {
send({
event: 'loader-scan-complete',
        matches
      });
    }
  });
});
```

`TARGET_OVERLOAD` 必须替换为目标方法的真实参数类型。脚本只在 `candidate.equals(definingLoader)` 时安装 Hook，因此通过父委派拿到目标 Class 的其他候选 loader只负责留下记录，不会重复改写同一方法。

#### 先判断是不是 loader 问题

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/010bfb168d348812.png)

sleep 只改变采样时刻。可靠做法是观察 loader 创建事件，或在确定的业务阶段重新枚举并用 `loadClass()` 验证。

一次实验验证整条时间线

实验分两部分：主机端主动停在 create、load、resume 三个点；目标脚本记录 top-level、 `performNow()` 、 `perform()` 和主线程回调。

测试 App 的 `Application.onCreate()` 需输出一条可识别日志：

```
Log.i("F02Target", "Application.onCreate");
```

另开终端执行 `adb logcat -s F02Target` 。这样 resume 前后是否进入 Application 不依赖界面现象判断。

### 目标脚本

将下面内容保存为 `f02_probe.js` ，把 `TARGET_CLASS` 替换为测试 App base APK 中已知的类：

```php
const TARGET_CLASS = "TARGET_CLASS";
let seq = 0;

function text(value) {
return value === null ? null : String(value);
}

function tryClass(name) {
try {
    Java.use(name);
return "found";
  } catch (e) {
return String(e);
  }
}

function findTargetLoaders(name) {
const matches = [];

  Java.enumerateClassLoaders({
onMatch(loader) {
try {
const klass = loader.loadClass(name);
const definingLoader = klass.getClassLoader();
const factory = Java.ClassFactory.get(loader);
const Target = factory.use(name);

        matches.push({
candidate: String(loader),
defining: definingLoader === null
            ? "<bootstrap>"
            : String(definingLoader),
definesClass: definingLoader !== null &&
              definingLoader.equals(loader),
wrapperLoader:
String(Target.class.getClassLoader())
        });
      } catch (e) {
      }
    },
onComplete() {
    }
  });

return matches;
}

function mark(stage, extra = {}) {
send({
seq: ++seq,
    stage,
tid: Process.getCurrentThreadId(),
    ...extra
  });
}

mark("top-level");

Java.performNow(() => {
const ActivityThread = Java.use("android.app.ActivityThread");
mark("performNow", {
appReady: ActivityThread.currentApplication() !== null,
factoryLoader: text(Java.classFactory.loader),
frameworkClass: tryClass("java.lang.String"),
targetClass: tryClass(TARGET_CLASS)
  });
});

Java.perform(() => {
const ActivityThread = Java.use("android.app.ActivityThread");
const app = ActivityThread.currentApplication();
const loader = Java.classFactory.loader;

mark("perform", {
appReady: app !== null,
factoryLoader: text(loader),
targetClass: tryClass(TARGET_CLASS),
targetLoaders: findTargetLoaders(TARGET_CLASS)
  });

  Java.scheduleOnMainThread(() => {
mark("main-thread");
  });
});
```

### 主机端控制

将下面内容保存为 `f02_host.py` ：

```css
import json
import sys
import time

import frida


def on_message(message, data):
print("SCRIPT", json.dumps(message, ensure_ascii=False))


package = sys.argv[1]
device = frida.get_usb_device(timeout=5)
pid = device.spawn([package])
print(f"HOST spawned pid={pid}")
session = device.attach(pid)

with open("f02_probe.js", "r", encoding="utf-8") as source_file:
    source = source_file.read()

script = session.create_script(source)
script.on("message", on_message)
print("HOST create returned")
time.sleep(1)

script.load()
print("HOST load returned")
time.sleep(1)

device.resume(pid)
print("HOST resume returned")
sys.stdin.read()
```

执行：

```
python3 f02_host.py TARGET_PACKAGE
```

验收看阶段边界，不要求不同机器输出完全相同：

-   `HOST create returned`
    
    前后没有脚本消息，证明 create 没有执行 top-level。
    
-   load 后出现 `stage=top-level` ，证明用户 JS 由 `Script.load()` 触发。
    
-   resume 前 App 的 `Application.onCreate()` 尚未执行，证明 JS 线程与被门控的 App 主线程是两条执行线。
    
-   `performNow`
    
    中 framework 类应可用； `appReady` 、默认 loader 和业务类可能尚未就绪。
    
-   resume 后 `perform` 应拿到非空默认 loader，并能解析正确的主包目标类。
    
-   `targetLoaders`
    
    至少记录候选 loader、defining loader 和 factory wrapper 实际使用的 loader。
    
-   `main-thread`
    
    证明显式主线程调度完成；Android App 主线程的 tid 应与主机端打印的 pid 一致。
    

消息跨线程、队列和控制通道返回， `HOST load returned` 与相邻 `SCRIPT` 打印的视觉顺序可能受主机事件循环影响。硬证据是 create 阶段没有任何 top-level 消息，以及 resume 前后 App 主线程行为发生变化。

### 源码复核

仓库快照保存了 `frida-core` 、 `frida-gum` 以及 Java bridge 的 `index.js` 、 `vm.js` 、 `class-factory.js` ，这些文件可直接离线定位。

`lib/api.js` 与 `lib/android.js` 未收进快照，下面用固定 GitHub 提交在线复核，不把外部源码写成本地已有文件：

```bash
cd 检测大全/source/frida

rg -n "create_script|load_script|yield script.load" \
  subprojects/frida-core/src/frida.vala \
  subprojects/frida-core/lib/payload

rg -n "run_in_js_thread|JS_EvalFunction|Evaluate\\(|Run\\(" \
  subprojects/frida-gum/bindings/gumjs

rg -n "_tryInitialize|performNow|_pendingVmOps|enumerateClassLoaders|scheduleOnMainThread" \
  subprojects/frida-java-bridge/index.js

rg -n "this.perform|AttachCurrentThread|tryGetEnvHandle|activeEnvs" \
  subprojects/frida-java-bridge/lib/vm.js

rg -n "static get|set loader|findClass|loadClass" \
  subprojects/frida-java-bridge/lib/class-factory.js

BRIDGE_COMMIT=f72e61ed18fa6b72f0559df223b22a899685b22c
curl -fsSL \
"https://raw.githubusercontent.com/frida/frida-java-bridge/$BRIDGE_COMMIT/lib/api.js" \
  | rg -n "androidGetApi|jvmGetApi|getAndroidVersion"

curl -fsSL \
"https://raw.githubusercontent.com/frida/frida-java-bridge/$BRIDGE_COMMIT/lib/android.js" \
  | rg -n "JNI_GetCreatedJavaVMs|withRunnableArtThread|withAllArtThreadsSuspended|makeArtClassLoaderVisitor"

ART_TAG=android-14.0.0_r1
curl -fsSL \
"https://android.googlesource.com/platform/art/+/refs/tags/$ART_TAG/runtime/class_linker.cc?format=TEXT" \
  | base64 --decode \
  | rg -n "VisitClassLoaders|class_loaders_"

curl -fsSL \
"https://android.googlesource.com/platform/art/+/refs/tags/$ART_TAG/runtime/thread_list.cc?format=TEXT" \
  | base64 --decode \
  | rg -n "ThreadList::SuspendAll|ThreadList::ResumeAll"

curl -fsSL \
"https://android.googlesource.com/platform/libnativehelper/+/refs/tags/$ART_TAG/include_jni/jni.h?format=TEXT" \
  | base64 --decode \
  | rg -n "struct _JNIEnv|struct _JavaVM|AttachCurrentThread|GetEnv"
```

* * *

故障定位与兼容边界

不要把所有“没输出”都归到注入失败。按最后一个已确认阶段定位：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6fe1e5edd686327f.png)

还要保留四条边界：

-   多进程 App 的每个 PID 都有独立 `ActivityThread` 、 `LoadedApk` 缓存和 ClassLoader 时间线。
    
-   `Java.perform()`
    
    只选择主包默认 loader，不保证插件、热更新或加固后的业务 loader 已经出现。
    
-   native Hook 不依赖 Java VM 或 `LoadedApk` ；它只受目标模块映射与符号时机约束。
    
-   `Java.perform()`
    
    解决执行时机、JNIEnv 和默认 loader，不等于 Java 方法替换已经成功； `ArtMethod` 、去优化与 JIT/解释器分派属于 Java Hook 原理课。
    

课后答疑

### 一、为什么 --pause 时能看到 top-level，却看不到 Application 日志？

`--pause` 跳过的是 load 之后的自动 `resume()` 。agent 的 JS scheduler 已经执行脚本，App 主线程仍停在 zymbiote 的门控点。

### 二、为什么 Java.perform() 已执行，currentApplication() 仍可能为 null？

早期路径在 `getPackageInfo()` 返回 `LoadedApk` 后就取得最终 loader，并清空 pending 回调。此时 ClassLoader 可以使用，而 `makeApplicationInner()` 还没有创建 Application。

### 三、为什么 java.lang.String 能找到，业务类却找不到？

先检查 `Java.classFactory.loader` 。它为空时， `Java.use()` 走 JNI `FindClass` ，framework 类可见不代表 APK loader 已建立；它非空时，再检查业务类实际属于 base APK、隔离 split 还是插件 loader。

### 四、Java.perform() 获取 JNIEnv 时会先暂停全部 Java 线程吗？

不会。固定 bridge 的 `VM.perform()` 先查当前 tid 的 env 缓存，再调用 JavaVM `GetEnv` ；当前线程未附加时才调用 `AttachCurrentThread` 。 `ThreadList::SuspendAll` 出现在 ART 的 `enumerateClassLoaders()` 路径，用于稳定遍历 `ClassLinker::class_loaders_` ，不属于 JNIEnv 获取流程。

### 五、为什么切换 ClassFactory.loader 后同一段 Hook 才开始命中？

原 factory 可能通过主包 loader 找不到插件类，或者解析到另一 loader 定义的同名类。切换后 `Java.use()` 改用目标 loader 的 `loadClass()` ，得到业务实际调用的那份 `Class` 和方法。工程代码优先使用 `Java.ClassFactory.get(loader)` 隔离 wrapper 缓存，而不是反复改全局默认 factory。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ce04542b59619607.png)

看雪ID：mb_peeqldfc

https://bbs.kanxue.com/user-home-998714.htm

\*本文为看雪论坛精华文章，由 mb_peeqldfc 原创，转载请注明来自看雪社区

火热售票中！1.25折门票即将售罄

\# 往期推荐

[当高频观测不再经过异常路径：Shadow Cave 与常驻式插桩架构](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619028&idx=1&sn=5a500adeee5194bc8b270c6819973a89&scene=21#wechat_redirect)

[D3CTF 2026 d3llvm.apk 反调试定位与加密 SO的Dump](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618994&idx=2&sn=f6d8e52efe0c96ba3684bce3529c3d30&scene=21#wechat_redirect)

[一串反引号，十层突破：n1ctf‑2018‑easy_harder_php 完整利用链](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618948&idx=2&sn=fe39b3c0600fbd53ced86ae6e2ed499e&scene=21#wechat_redirect)

[实现一个EDR不可见的网络通信（将lwip移植到nt内核中）](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618790&idx=2&sn=614beed6bb13fdc6c918aa6d9bb006d6&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc51e60a1ab9953f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bda3987c6441739.webp)

**球分享**

**球点赞**

**球在看**

点击阅读原文查看更多
