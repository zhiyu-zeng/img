---
title: Android Runtime Resources Overlay 加载时序分析 - 残页的小博客
source: https://blog.canyie.top/2025/08/24/android-runtime-resources-overlay-sequence/
source_host: blog.canyie.top
clip_date: 2026-08-04T14:50:25+08:00
trace_id: 8c3ded90-abde-4c93-aafb-8769be2d326c
content_hash: 01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b
status: synced
tags:
  - Android系统
  - 资源加载
series: null
feed_source: canyie·Android
ai_summary: "TL;DR: FRRO 对 `Resources.getSystem()` 不生效；PMS 启动早于 OverlayManagerService，因此系统早期用 context 取 string 时 FRRO 尚未加载，只会读到 zygote 预加载的旧 RRO 值。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-8179-9b5e-c88a4f0cb916
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: FRRO 对 `Resources.getSystem()` 不生效；PMS 启动早于 OverlayManagerService，因此系统早期用 context 取 string 时 FRRO 尚未加载，只会读到 zygote 预加载的旧 RRO 值。
> 
> - **加载分界：** `Resources.getSystem()` 对应 Zygote 预加载的系统 AssetManager，只吸收扫描 `/apex`、`/product` 等分区得到的不可变且 target=android 的传统 RRO；FRRO 存放在 `/data/resource-cache`，不在预加载范围。
> - **矛盾现象：** `cmd overlay lookup` 显示 FRRO 已替换成功且优先级最高，`maps` 也能看到 FRRO；但 `Resources.getSystem()` 仍读旧值，换成 `context.getResources()` 才读到 FRRO。
> - **FRRO 流程：** OMS 启动时调用 `updateOverlaysForUser()`，经 Idmap2Service 遍历 `/data/resource-cache` 收集 FRRO，再通知 PMS 更新 ApplicationInfo 的 `overlayPaths/resourceDirs`，进程收到 `scheduleApplicationInfoChanged` 后重建 Resources。
> - **时序根因：** SystemServer 的 `startBootstrapServices()` 先启动 PMS、后启动 OMS；PMS 在 `getString()` 时 FRRO 还未注册，因此即使 PMS 用 context 取资源，也只能拿到 zygote 已加载的静态 RRO 覆盖值。
> - **结论：** FRRO 不能完全替代传统 RRO，尤其不适合替换系统启动极早期就要读取的值；官方文档缺失，只能硬啃源码。

Fabricated Runtime Resources Overlay （FRRO） 是 Android 12 引入的一项新功能，它让开发者可以用代码或 shell 命令的方式动态操作 Runtime Resources Overlay（RRO） 而不需要像以前一样必须创建一个单独的 overlay app。然而四年后，网络上关于 FRRO 的文章依然少得可怜，所以在这里记录一次我调试 FRRO 问题的过程。

推荐阅读：

## 起因：FRRO 失效？

在 PackageManagerService 启动的时候会调用如下伪代码获取某个 string：

```java
public static String getConfig(Context systemContext) {
    return systemContext.getResources().getString(R.string.config_xxxxxx);
}
```

在 `frameworks/base/core/res/res/values/config.xml` 内有如下配置：

```xml
<string name="config_xxxxxx"></string>
```

系统内部有一个包名为 `android.auto_generated_rro_product__` 的 RRO app 对该 string 进行了 overlay：

```xml
<string name="config_xxxxxx">From RRO</string>
```

现在我想进行动态调试，快速修改这个 string 的值并观察系统反应。以往我们需要修改 RRO 中的值并重新编译系统，现在让我们试试 FRRO，root 下使用命令 `cmd overlay fabricate --target android --name test android:string/config_xxxxxx test` 创建一个 FRRO 然后 `cmd overlay enable` 一下，然后重启系统，看看反应！  
嗯，一点反应都没有……在预期里，应该是哪里没做对，俗话说遇事不决就重启，换个重启方式试试？事实证明，无论是杀掉 zygote 触发软重启，还是使用 `reboot` 或 `svc power reboot` 发起真正的重启都没有任何改变。  
那跑命令看一下 overlay 有没有生效？还好命令行也是能查询资源值的： `cmd overlay lookup android android:string/config_xxxxxx` 。看输出结果确实已经被替换了。  
脑袋要烧了，写代码验证一下是不是真的被替换了吧：

```java
Resources res = Resouces.getSystem();
print(res.getString(res.getIdentifier("config_xxxxxx", "string", "android")));
```

神奇的事情发生了，代码输出的结果是来自 RRO 的值，FRRO 没有替换成功！为什么呢？  
会不会是出现某种权限问题，导致 app 进程无法打开 FRRO 所需的文件，所以 FRRO 没有生效呢？验证这个结论很简单， `cat /proc/$(pidof 进程名)/maps | grep frro` 看一下有没有我们自己的 FRRO 路径就好了。经过确认，是有的，这个结论不攻自破。  
那会不会是系统原本自带的 RRO 比我们的 FRRO 优先级更高所以被优先使用了呢？ `cmd overlay dump` 看一下就能知道新建的 FRRO 是启用状态，且优先级已经是最高的 `2147483647` 。反之如果真的是这样，那么 `cmd overlay lookup` 也不会返回我们的值。又是一条死路。  
这个时候我发现一个更神奇的现象：把上面代码的 `Resouces.getSystem()` 换成 `context.getResources()` ，结果就正常了。  
是什么导致了这个差异？它是 FRRO 对 PackageManagerService 内代码不生效的原因吗？想搞清楚这个问题，只能钻一遍 RRO 的加载流程了……

## 不可变 RRO 在 Zygote 中的预加载

想搞清楚 `Resources.getSystem()` 和 `context.getResources()` 的差别，首先让我们搞清楚它们都是从哪来的。点开 `Resources.getSystem()` 看一下：

```java
/**
 * Return a global shared Resources object that provides access to only
 * system resources (no application resources), is not configured for the
 * current screen (can not use dimension units, does not change based on
 * orientation, etc), and is not affected by Runtime Resource Overlay.
 */
public static Resources getSystem() {
    synchronized (sSync) {
        Resources ret = mSystem;
        if (ret == null) {
            ret = new Resources();
            mSystem = ret;
        }
        return ret;
    }
}
```

它的注释里明确表示 `is not affected by Runtime Resource Overlay` ，似乎我们的问题就这么简单地解决了，只是简单的 API 用错了而已……？  
如果 `Resources.getSystem()` 真的完全不受 RRO 影响，那测试代码应该输出来自 `frameworks/base/core/res/res/values/config.xml` 的空值而不是来自 RRO 的值。所以问题并没有这么简单，我们继续。

```java
/**
 * Only for creating the System resources. This is the only constructor that doesn't add
 * Resources itself to the ResourcesManager list of all Resources references.
 */
@UnsupportedAppUsage
private Resources() {
    mClassLoader = ClassLoader.getSystemClassLoader();
    sResourcesHistory.add(this);

    final DisplayMetrics metrics = new DisplayMetrics();
    metrics.setToDefaults();

    final Configuration config = new Configuration();
    config.setToDefaults();

    mResourcesImpl = new ResourcesImpl(AssetManager.getSystem(), metrics, config,
            new DisplayAdjustments());
}
```

注意 `AssetManager.getSystem()` ：

```java
/**
 * Return a global shared asset manager that provides access to only
 * system assets (no application assets).
 * @hide
 */
@UnsupportedAppUsage
public static AssetManager getSystem() {
    synchronized (sSync) {
        createSystemAssetsInZygoteLocked(false, FRAMEWORK_APK_PATH);
        return sSystem;
    }
}

/**
 * This must be called from Zygote so that system assets are shared by all applications.
 * @hide
 */
@GuardedBy("sSync")
@VisibleForTesting
public static void createSystemAssetsInZygoteLocked(boolean reinitialize,
        String frameworkPath) {
    if (sSystem != null && !reinitialize) {
        return;
    }

    try {
        final ArrayList<ApkAssets> apkAssets = new ArrayList<>();
        apkAssets.add(ApkAssets.loadFromPath(frameworkPath, ApkAssets.PROPERTY_SYSTEM));

        // TODO(Ravenwood): overlay support?
        final String[] systemIdmapPaths =
                RavenwoodEnvironment.getInstance().isRunningOnRavenwood() ? new String[0] :
                OverlayConfig.getZygoteInstance().createImmutableFrameworkIdmapsInZygote();
        for (String idmapPath : systemIdmapPaths) {
            apkAssets.add(ApkAssets.loadOverlayFromPath(idmapPath, ApkAssets.PROPERTY_SYSTEM));
        }

        sSystemApkAssetsSet = new ArraySet<>(apkAssets);
        sSystemApkAssets = apkAssets.toArray(new ApkAssets[0]);
        if (sSystem == null) {
            sSystem = new AssetManager(true /*sentinel*/);
        }
        sSystem.setApkAssets(sSystemApkAssets, false /*invalidateCaches*/);
    } catch (IOException e) {
        throw new IllegalStateException("Failed to create system AssetManager", e);
    }
}
```

我们在这里首次看见了 overlay 字眼， `OverlayConfig` 这个类看名字就是解析 overlay 相关配置文件的，看一下它怎么做的：

```java
@VisibleForTesting
public OverlayConfig(@Nullable File rootDirectory,
        @Nullable Supplier<OverlayScanner> scannerFactory,
        @Nullable PackageProvider packageProvider) {
    Preconditions.checkArgument((scannerFactory == null) != (packageProvider == null),
            "scannerFactory and packageProvider cannot be both null or both non-null");

    final ArrayList<OverlayPartition> partitions;
    if (rootDirectory == null) {
        partitions = new ArrayList<>(
                PackagePartitions.getOrderedPartitions(OverlayPartition::new));
    } else {
        // Rebase the system partitions and settings file on the specified root directory.
        partitions = new ArrayList<>(PackagePartitions.getOrderedPartitions(
                p -> new OverlayPartition(
                        new File(rootDirectory, p.getNonConicalFolder().getPath()),
                        p)));
    }
    mIsDefaultPartitionOrder = !sortPartitions(PARTITION_ORDER_FILE_PATH, partitions);
    mPartitionOrder = generatePartitionOrderString(partitions);

    ArrayMap<Integer, List<String>> activeApexesPerPartition = getActiveApexes(partitions);

    final Map<String, ParsedOverlayInfo> packageManagerOverlayInfos =
            packageProvider == null ? null : getOverlayPackageInfos(packageProvider);

    final ArrayList<ParsedConfiguration> overlays = new ArrayList<>();
    for (int i = 0, n = partitions.size(); i < n; i++) {
        final OverlayPartition partition = partitions.get(i);
        final OverlayScanner scanner = (scannerFactory == null) ? null : scannerFactory.get();
        final ArrayList<ParsedConfiguration> partitionOverlays =
                OverlayConfigParser.getConfigurations(partition, scanner,
                        packageManagerOverlayInfos,
                        activeApexesPerPartition.getOrDefault(partition.type,
                                Collections.emptyList()));
        if (partitionOverlays != null) {
            overlays.addAll(partitionOverlays);
            continue;
        }

        // If the configuration file is not present, then use android:isStatic and
        // android:priority to configure the overlays in the partition.
        // TODO(147840005): Remove converting static overlays to immutable, default-enabled
        //  overlays when android:siStatic and android:priority are fully deprecated.
        final ArrayList<ParsedOverlayInfo> partitionOverlayInfos;
        if (scannerFactory != null) {
            partitionOverlayInfos = new ArrayList<>(scanner.getAllParsedInfos());
        } else {
            // Filter out overlays not present in the partition.
            partitionOverlayInfos = new ArrayList<>(packageManagerOverlayInfos.values());
            for (int j = partitionOverlayInfos.size() - 1; j >= 0; j--) {
                if (!partition.containsFile(partitionOverlayInfos.get(j)
                        .getOriginalPartitionPath())) {
                    partitionOverlayInfos.remove(j);
                }
            }
        }

        // Static overlays are configured as immutable, default-enabled overlays.
        final ArrayList<ParsedConfiguration> partitionConfigs = new ArrayList<>();
        for (int j = 0, m = partitionOverlayInfos.size(); j < m; j++) {
            final ParsedOverlayInfo p = partitionOverlayInfos.get(j);
            if (p.isStatic) {
                partitionConfigs.add(new ParsedConfiguration(p.packageName,
                        true /* enabled */, false /* mutable */, partition.policy, p, null));
            }
        }

        partitionConfigs.sort(sStaticOverlayComparator);
        overlays.addAll(partitionConfigs);
    }

    for (int i = 0, n = overlays.size(); i < n; i++) {
        // Add the configurations to a map so definitions of an overlay in an earlier
        // partition can be replaced by an overlay with the same package name in a later
        // partition.
        final ParsedConfiguration config = overlays.get(i);
        mConfigurations.put(config.packageName, new Configuration(config, i));
    }
}

/**
 * Retrieves a list of immutable framework overlays in order of least precedence to greatest
 * precedence.
 */
@VisibleForTesting
public ArrayList<IdmapInvocation> getImmutableFrameworkOverlayIdmapInvocations() {
    final ArrayList<IdmapInvocation> idmapInvocations = new ArrayList<>();
    final ArrayList<Configuration> sortedConfigs = getSortedOverlays();
    for (int i = 0, n = sortedConfigs.size(); i < n; i++) {
        final Configuration overlay = sortedConfigs.get(i);
        if (overlay.parsedConfig.mutable || !overlay.parsedConfig.enabled
                || !"android".equals(overlay.parsedConfig.parsedInfo.targetPackageName)) {
            continue;
        }

        // Only enforce that overlays targeting packages with overlayable declarations abide by
        // those declarations if the target sdk of the overlay is at least Q (when overlayable
        // was introduced).
        final boolean enforceOverlayable = overlay.parsedConfig.parsedInfo.targetSdkVersion
                >= Build.VERSION_CODES.Q;

        // Determine if the idmap for the current overlay can be generated in the last idmap
        // create-multiple invocation.
        IdmapInvocation invocation = null;
        if (!idmapInvocations.isEmpty()) {
            final IdmapInvocation last = idmapInvocations.get(idmapInvocations.size() - 1);
            if (last.enforceOverlayable == enforceOverlayable
                    && last.policy.equals(overlay.parsedConfig.policy)) {
                invocation = last;
            }
        }

        if (invocation == null) {
            invocation = new IdmapInvocation(enforceOverlayable, overlay.parsedConfig.policy);
            idmapInvocations.add(invocation);
        }

        invocation.overlayPaths.add(overlay.parsedConfig.parsedInfo.path.getAbsolutePath());
    }
    return idmapInvocations;
}
```

首先在构造函数里扫描了 `/apex` 及其他系统分区内所有的 apk 文件，记录下所有的 overlay app 然后将所有在启用状态、不可变且目标是 `android` 的 overlay app 返回给 zygote 预加载。具体会扫描的分区如下：

```java
/**
 * The list of all system partitions that may contain packages in ascending order of
 * specificity (the more generic, the earlier in the list a partition appears).
 */
private static final ArrayList<SystemPartition> SYSTEM_PARTITIONS =
        new ArrayList<>(Arrays.asList(
                new SystemPartition(Environment.getRootDirectory(),
                        PARTITION_SYSTEM, Partition.PARTITION_NAME_SYSTEM,
                        true /* containsPrivApp */, false /* containsOverlay */), // 
                new SystemPartition(Environment.getVendorDirectory(),
                        PARTITION_VENDOR, Partition.PARTITION_NAME_VENDOR,
                        true /* containsPrivApp */, true /* containsOverlay */),
                new SystemPartition(Environment.getOdmDirectory(),
                        PARTITION_ODM, Partition.PARTITION_NAME_ODM,
                        true /* containsPrivApp */, true /* containsOverlay */),
                new SystemPartition(Environment.getOemDirectory(),
                        PARTITION_OEM, Partition.PARTITION_NAME_OEM,
                        false /* containsPrivApp */, true /* containsOverlay */),
                new SystemPartition(Environment.getProductDirectory(),
                        PARTITION_PRODUCT, Partition.PARTITION_NAME_PRODUCT,
                        true /* containsPrivApp */, true /* containsOverlay */),
                new SystemPartition(Environment.getSystemExtDirectory(),
                        PARTITION_SYSTEM_EXT, Partition.PARTITION_NAME_SYSTEM_EXT,
                        true /* containsPrivApp */, true /* containsOverlay */)));
```

扫描逻辑如下：

```java
/**
 * Recursively searches the directory for overlay APKs. If an overlay is found with the same
 * package name as a previously scanned overlay, the info of the new overlay will replace the
 * info of the previously scanned overlay.
 */
public void scanDir(File partitionOverlayDir) {
    if (!partitionOverlayDir.exists() || !partitionOverlayDir.isDirectory()) {
        return;
    }

    if (!partitionOverlayDir.canRead()) {
        Log.w(TAG, "Directory " + partitionOverlayDir + " cannot be read");
        return;
    }

    final File[] files = partitionOverlayDir.listFiles();
    if (files == null) {
        return;
    }

    for (int i = 0; i < files.length; i++) {
        final File f = files[i];
        if (f.isDirectory()) {
            scanDir(f);
        }

        if (!f.isFile() || !f.getPath().endsWith(".apk")) {
            continue;
        }

        final ParsedOverlayInfo info = parseOverlayManifest(f, mExcludedOverlayPackages);
        if (info == null) {
            continue;
        }

        mParsedOverlayInfos.put(info.packageName, info);
    }
}
```

以上逻辑都在 zygote 里完成，存在一个专门的 `Resources.preloadResources()` 函数用来预加载：

```java
/**
 * Load in commonly used resources, so they can be shared across processes.
 *
 * These tend to be a few Kbytes, but are frequently in the 20-40K range, and occasionally even
 * larger.
 * @hide
 */
@UnsupportedAppUsage
public static void preloadResources() {
    try {
        final Resources sysRes = Resources.getSystem();
        sysRes.startPreloading();
        if (PRELOAD_RESOURCES) {
            Log.i(TAG, "Preloading resources...");

            long startTime = SystemClock.uptimeMillis();
            TypedArray ar = sysRes.obtainTypedArray(
                    com.android.internal.R.array.preloaded_drawables);
            int numberOfEntries = preloadDrawables(sysRes, ar);
            ar.recycle();
            Log.i(TAG, "...preloaded " + numberOfEntries + " resources in "
                    + (SystemClock.uptimeMillis() - startTime) + "ms.");

            startTime = SystemClock.uptimeMillis();
            ar = sysRes.obtainTypedArray(
                    com.android.internal.R.array.preloaded_color_state_lists);
            numberOfEntries = preloadColorStateLists(sysRes, ar);
            ar.recycle();
            Log.i(TAG, "...preloaded " + numberOfEntries + " resources in "
                    + (SystemClock.uptimeMillis() - startTime) + "ms.");
        }
        sysRes.finishPreloading();
    } catch (RuntimeException e) {
        Log.w(TAG, "Failure preloading resources", e);
    }
}
```

而 FRRO 位于 `/data/resource/cache` 下，以 `.frro` 为后缀，显然扫描结果不可能包含任何一个 FRRO，所以不会被 zygote 预加载也不会影响 `Resources.getSystem()` 。而虽然 `android.auto_generated_rro_product__` 所属的 `/product/overlay` 下没有 `config.xml` 文件，但它被配置为静态 RRO：

```xml
<overlay
    android:priority="1"
    android:targetPackage="android"
    android:isStatic="true"/>
```

静态 RRO 默认就是启用且不可变的，所以被 zygote 预加载了。通过 `cat /proc/$(pidof zygote)/maps | grep idmap` 也可以确认输出结果含有 `android.auto_generated_rro_product__` 的 idmap 但没有 FRRO 的。

## 可变 RRO 的加载

上面这么一大串生效的前提是 1. RRO 不是 FRRO；2. RRO 不可变且处于启用状态。我们还是没有找到 FRRO 的处理逻辑，不知道这段代码藏在哪处。我们用代码或者 shell 命令创建 FRRO 的时候实际上是在和 OverlayManagerService 交互，看一下它的代码：

```java
@NonNull
Set<UserPackage> registerFabricatedOverlay(
        @NonNull final FabricatedOverlayInternal overlay)
        throws OperationFailedException {
    if (FrameworkParsingPackageUtils.validateName(overlay.overlayName,
            false /* requireSeparator */, true /* requireFilename */) != null) {
        throw new OperationFailedException(
                "overlay name can only consist of alphanumeric characters, '_', and '.'");
    }

    final FabricatedOverlayInfo info = mIdmapManager.createFabricatedOverlay(overlay);
    if (info == null) {
        throw new OperationFailedException("failed to create fabricated overlay");
    }

    final Set<UserPackage> updatedTargets = new ArraySet<>();
    for (int userId : mSettings.getUsers()) {
        updatedTargets.addAll(registerFabricatedOverlay(info, userId));
    }
    return updatedTargets;
}
```

调用了 Idmap2Service 来实际创建 FRRO：

```cpp
constexpr std::string_view kIdmapCacheDir = "/data/resource-cache";

Status Idmap2Service::createFabricatedOverlay(
    const os::FabricatedOverlayInternal& overlay,
    std::optional<os::FabricatedOverlayInfo>* _aidl_return) {
  idmap2::FabricatedOverlay::Builder builder(overlay.packageName, overlay.overlayName,
                                             overlay.targetPackageName);
  if (!overlay.targetOverlayable.empty()) {
    builder.SetOverlayable(overlay.targetOverlayable);
  }

  for (const auto& res : overlay.entries) {
    if (res.dataType == Res_value::TYPE_STRING) {
      builder.SetResourceValue(res.resourceName, res.dataType, res.stringData.value(),
            res.configuration.value_or(std::string()));
    } else if (res.binaryData.has_value()) {
      builder.SetResourceValue(res.resourceName, res.binaryData->get(),
                               res.binaryDataOffset, res.binaryDataSize,
                               res.configuration.value_or(std::string()),
                               res.isNinePatch);
    } else {
      builder.SetResourceValue(res.resourceName, res.dataType, res.data,
            res.configuration.value_or(std::string()));
    }
  }

  // Generate the file path of the fabricated overlay and ensure it does not collide with an
  // existing path. Re-registering a fabricated overlay will always result in an updated path.
  std::string path;
  std::string file_name;
  do {
    constexpr size_t kSuffixLength = 4;
    const std::string random_suffix = RandomStringForPath(kSuffixLength);
    file_name = StringPrintf("%s-%s-%s.frro", overlay.packageName.c_str(),
                             overlay.overlayName.c_str(), random_suffix.c_str());
    path = StringPrintf("%s/%s", kIdmapCacheDir.data(), file_name.c_str());

    // Invoking std::filesystem::exists with a file name greater than 255 characters will cause this
    // process to abort since the name exceeds the maximum file name size.
    const size_t kMaxFileNameLength = 255;
    if (file_name.size() > kMaxFileNameLength) {
      return error(
          base::StringPrintf("fabricated overlay file name '%s' longer than %zu characters",
                             file_name.c_str(), kMaxFileNameLength));
    }
  } while (std::filesystem::exists(path));
  builder.setFrroPath(path);

  const uid_t uid = IPCThreadState::self()->getCallingUid();
  if (!UidHasWriteAccessToPath(uid, path)) {
    return error(base::StringPrintf("will not write to %s: calling uid %d lacks write access",
                                    path.c_str(), uid));
  }

  const auto frro = builder.Build();
  if (!frro) {
    return error(StringPrintf("failed to serialize '%s:%s': %s", overlay.packageName.c_str(),
                              overlay.overlayName.c_str(), frro.GetErrorMessage().c_str()));
  }
  // Persist the fabricated overlay.
  umask(kIdmapFilePermissionMask);
  std::ofstream fout(path);
  if (fout.fail()) {
    return error("failed to open frro path " + path);
  }
  auto result = frro->ToBinaryStream(fout);
  if (!result) {
    unlink(path.c_str());
    return error("failed to write to frro path " + path + ": " + result.GetErrorMessage());
  }
  if (fout.fail()) {
    unlink(path.c_str());
    return error("failed to write to frro path " + path);
  }

  os::FabricatedOverlayInfo out_info;
  out_info.packageName = overlay.packageName;
  out_info.overlayName = overlay.overlayName;
  out_info.targetPackageName = overlay.targetPackageName;
  out_info.targetOverlayable = overlay.targetOverlayable;
  out_info.path = path;
  *_aidl_return = out_info;
  return ok();
}
```

根据调用者的包名和 overlay 的名字，在 `/data/resource-cache` 下随机生成 FRRO 文件。猜测应该会有个地方列出这个文件夹里所有的 FRRO 然后逐个加载，搜索发现 OverlayManagerService 启动时会调用 `OverlayManagerServiceImpl.updateOverlaysForUser()` ：

```java
/**
 * Call this to synchronize the Settings for a user with what PackageManager knows about a user.
 * Returns a list of target packages that must refresh their overlays. This list is the union
 * of two sets: the set of targets with currently active overlays, and the
 * set of targets that had, but no longer have, active overlays.
 */
@NonNull
ArraySet<UserPackage> updateOverlaysForUser(final int newUserId) {
    if (DEBUG) {
        Slog.d(TAG, "updateOverlaysForUser newUserId=" + newUserId);
    }

    // Remove the settings of all overlays that are no longer installed for this user.
    final ArraySet<UserPackage> updatedTargets = new ArraySet<>();
    final ArrayMap<String, PackageState> userPackages = mPackageManager.initializeForUser(
            newUserId);
    CollectionUtils.addAll(updatedTargets, removeOverlaysForUser(
            (info) -> !userPackages.containsKey(info.packageName), newUserId));

    final ArraySet<String> overlaidByOthers = new ArraySet<>();
    for (PackageState packageState : userPackages.values()) {
        var pkg = packageState.getAndroidPackage();
        final String overlayTarget = pkg == null ? null : pkg.getOverlayTarget();
        if (!TextUtils.isEmpty(overlayTarget)) {
            overlaidByOthers.add(overlayTarget);
        }
    }

    // Update the state of all installed packages containing overlays, and initialize new
    // overlays that are not currently in the settings.
    for (int i = 0, n = userPackages.size(); i < n; i++) {
        final PackageState packageState = userPackages.valueAt(i);
        var pkg = packageState.getAndroidPackage();
        if (pkg == null) {
            continue;
        }

        var packageName = packageState.getPackageName();
        try {
            CollectionUtils.addAll(updatedTargets,
/* flags */

            // When a new user is switched to for the first time, package manager must be
            // informed of the overlay paths for all overlaid packages installed in the user.
            if (overlaidByOthers.contains(packageName)) {
                updatedTargets.add(UserPackage.of(newUserId, packageName));
            }
        } catch (OperationFailedException e) {
            Slog.e(TAG, "failed to initialize overlays of '" + packageName
                    + "' for user " + newUserId + "", e);
        }
    }

    // Update the state of all fabricated overlays, and initialize fabricated overlays in the
    // new user.
    for (final FabricatedOverlayInfo info : getFabricatedOverlayInfos()) {
        try {
            CollectionUtils.addAll(updatedTargets, registerFabricatedOverlay(
                    info, newUserId));
        } catch (OperationFailedException e) {
            Slog.e(TAG, "failed to initialize fabricated overlay of '" + info.path
                    + "' for user " + newUserId + "", e);
        }
    }

    // Collect all of the categories in which we have at least one overlay enabled.
    final ArraySet<String> enabledCategories = new ArraySet<>();
    final ArrayMap<String, List<OverlayInfo>> userOverlays =
            mSettings.getOverlaysForUser(newUserId);
    final int userOverlayTargetCount = userOverlays.size();
    for (int i = 0; i < userOverlayTargetCount; i++) {
        final List<OverlayInfo> overlayList = userOverlays.valueAt(i);
        final int overlayCount = overlayList != null ? overlayList.size() : 0;
        for (int j = 0; j < overlayCount; j++) {
            final OverlayInfo oi = overlayList.get(j);
            if (oi.isEnabled()) {
                enabledCategories.add(oi.category);
            }
        }
    }

    // Enable the default overlay if its category does not have a single overlay enabled.
    for (final String defaultOverlay : mDefaultOverlays) {
        try {
            // OverlayConfig is the new preferred way to enable overlays by default. This legacy
            // default enabled method was created before overlays could have a name specified.
            // Only allow enabling overlays without a name using this mechanism.
            final OverlayIdentifier overlay = new OverlayIdentifier(defaultOverlay);

            final OverlayInfo oi = mSettings.getOverlayInfo(overlay, newUserId);
            if (!enabledCategories.contains(oi.category)) {
                Slog.w(TAG, "Enabling default overlay '" + defaultOverlay + "' for target '"
                        + oi.targetPackageName + "' in category '" + oi.category + "' for user "
                        + newUserId);
                mSettings.setEnabled(overlay, newUserId, true);
                if (updateState(oi, newUserId, 0)) {
                    CollectionUtils.add(updatedTargets,
                            UserPackage.of(oi.userId, oi.targetPackageName));
                }
            }
        } catch (OverlayManagerSettings.BadKeyException e) {
            Slog.e(TAG, "Failed to set default overlay '" + defaultOverlay + "' for user "
                    + newUserId, e);
        }
    }

    cleanStaleResourceCache();
    return updatedTargets;
}
```

它收集了所有 overlay app 然后调用 Idmap2Service 遍历 `/data/resource-cache` 收集所有 FRRO：

```cpp
Status Idmap2Service::acquireFabricatedOverlayIterator(int32_t* _aidl_return) {
  std::lock_guard l(frro_iter_mutex_);
  if (frro_iter_.has_value()) {
    LOG(WARNING) << "active ffro iterator was not previously released";
  }
  frro_iter_ = std::filesystem::directory_iterator(kIdmapCacheDir);
  if (frro_iter_id_ == std::numeric_limits<int32_t>::max()) {
    frro_iter_id_ = 0;
  } else {
    ++frro_iter_id_;
  }
  *_aidl_return = frro_iter_id_;
  return ok();
}

Status Idmap2Service::nextFabricatedOverlayInfos(int32_t iteratorId,
    std::vector<os::FabricatedOverlayInfo>* _aidl_return) {
  std::lock_guard l(frro_iter_mutex_);

  constexpr size_t kMaxEntryCount = 100;
  if (!frro_iter_.has_value()) {
    return error("no active frro iterator");
  } else if (frro_iter_id_ != iteratorId) {
    return error("incorrect iterator id in a call to next");
  }

  size_t count = 0;
  auto& entry_iter = *frro_iter_;
  auto entry_iter_end = end(*frro_iter_);
  for (; entry_iter != entry_iter_end && count < kMaxEntryCount; ++entry_iter) {
    auto& entry = *entry_iter;
    if (!entry.is_regular_file() || !android::IsFabricatedOverlay(entry.path().native())) {
      continue;
    }

    const auto overlay = FabricatedOverlayContainer::FromPath(entry.path().native());
    if (!overlay) {
      LOG(WARNING) << "Failed to open '" << entry.path() << "': " << overlay.GetErrorMessage();
      continue;
    }

    auto info = (*overlay)->GetManifestInfo();
    os::FabricatedOverlayInfo out_info;
    out_info.packageName = std::move(info.package_name);
    out_info.overlayName = std::move(info.name);
    out_info.targetPackageName = std::move(info.target_package);
    out_info.targetOverlayable = std::move(info.target_name);
    out_info.path = entry.path();
    _aidl_return->emplace_back(std::move(out_info));
    count++;
  }
  return ok();
}
```

计算完所有 RRO 的状态后，通知 PackageManagerService 更新信息：

```java
/**
 * Updates the target packages' set of enabled overlays in PackageManager.
 * @return the package names of affected targets (a superset of
 *         targetPackageNames: the target themselves and shared libraries)
 */
@NonNull
private List<String> updatePackageManagerLocked(@NonNull Collection<String> targetPackageNames,
        final int userId) {
    try {
        traceBegin(TRACE_TAG_RRO, "OMS#updatePackageManagerLocked " + targetPackageNames);
        if (DEBUG) {
            Slog.d(TAG, "Update package manager about changed overlays");
        }
        final PackageManagerInternal pm =
                LocalServices.getService(PackageManagerInternal.class);
        final boolean updateFrameworkRes = targetPackageNames.contains("android");
        if (updateFrameworkRes) {
            targetPackageNames = pm.getTargetPackageNames(userId);
        }

        final ArrayMap<String, OverlayPaths> pendingChanges =
                new ArrayMap<>(targetPackageNames.size());
        synchronized (mLock) {
            final OverlayPaths frameworkOverlays =
                    mImpl.getEnabledOverlayPaths("android", userId, false);
            for (final String targetPackageName : targetPackageNames) {
                final var list = new OverlayPaths.Builder(frameworkOverlays);
                if (!"android".equals(targetPackageName)) {
                    list.addAll(mImpl.getEnabledOverlayPaths(targetPackageName, userId, true));
                }
                pendingChanges.put(targetPackageName, list.build());
            }
        }

        final HashSet<String> updatedPackages = new HashSet<>();
        final HashSet<String> invalidPackages = new HashSet<>();
        pm.setEnabledOverlayPackages(userId, pendingChanges, updatedPackages, invalidPackages);
        return new ArrayList<>(updatedPackages);
    } finally {
        traceEnd(TRACE_TAG_RRO);
    }
}
```

PackageManagerService 更新受影响包的状态，最重要的是 ApplicationInfo 内的两个字段：

```java
/**
 * Full paths to the locations of extra resource packages (runtime overlays)
 * this application uses. This field is only used if there are extra resource
 * packages, otherwise it is null.
 *
 * {@hide}
 */
@UnsupportedAppUsage
public String[] resourceDirs;

/**
 * Contains the contents of {@link #resourceDirs} and along with paths for overlays that may or
 * may not be APK packages.
 *
 * {@hide}
 */
public String[] overlayPaths;
```

对应进程启动时会读取它们，创建 Resources 对象的时候会用到：

```java
@UnsupportedAppUsage
public Resources getResources() {
    if (mResources == null) {
        final String[] splitPaths;
        try {
            splitPaths = getSplitPaths(null);
        } catch (NameNotFoundException e) {
            // This should never fail.
            throw new AssertionError("null split not found");
        }

        if (Process.myUid() == mApplicationInfo.uid) {
            ResourcesManager.getInstance().initializeApplicationPaths(mResDir, splitPaths);
        }

        mResources = ResourcesManager.getInstance().getResources(null, mResDir,
                splitPaths, mLegacyOverlayDirs, mOverlayPaths,
                mApplicationInfo.sharedLibraryFiles, null, null, getCompatibilityInfo(),
                getClassLoader(), null);
    }
    return mResources;
}
```

那如果受影响的进程已经启动了（比如是 system_server 自己）又会是什么情况呢？回到 `PackageManagerService#setEnabledOverlayPackages()` ，里面有一段特殊处理，修改了 `android` 包对应的 ApplicationInfo：

```java
if (userId == UserHandle.USER_SYSTEM) {
    // Keep the overlays in the system application info (and anything special cased as well)
    // up to date to make sure system ui is themed correctly.
    for (int i = 0; i < numberOfPendingChanges; i++) {
        final String targetPackageName = pendingChanges.keyAt(i);
        final OverlayPaths newOverlayPaths = pendingChanges.valueAt(i);
        maybeUpdateSystemOverlays(targetPackageName, newOverlayPaths);
    }
}
```

```java
private void maybeUpdateSystemOverlays(String targetPackageName, OverlayPaths newOverlayPaths) {
    if (!mResolverReplaced) {
        if (targetPackageName.equals("android")) {
            if (newOverlayPaths == null) {
                mPlatformPackageOverlayPaths = null;
                mPlatformPackageOverlayResourceDirs = null;
            } else {
                mPlatformPackageOverlayPaths = newOverlayPaths.getOverlayPaths().toArray(
                        new String[0]);
                mPlatformPackageOverlayResourceDirs = newOverlayPaths.getResourceDirs().toArray(
                        new String[0]);
            }
            applyUpdatedSystemOverlayPaths();
        }
    } else {
        if (targetPackageName.equals(mResolveActivity.applicationInfo.packageName)) {
            if (newOverlayPaths == null) {
                mReplacedResolverPackageOverlayPaths = null;
                mReplacedResolverPackageOverlayResourceDirs = null;
            } else {
                mReplacedResolverPackageOverlayPaths =
                        newOverlayPaths.getOverlayPaths().toArray(new String[0]);
                mReplacedResolverPackageOverlayResourceDirs =
                        newOverlayPaths.getResourceDirs().toArray(new String[0]);
            }
            applyUpdatedSystemOverlayPaths();
        }
    }
}

private void applyUpdatedSystemOverlayPaths() {
    if (mAndroidApplication == null) {
        Slog.i(TAG, "Skipped the AndroidApplication overlay paths update - no app yet");
    } else {
        mAndroidApplication.overlayPaths = mPlatformPackageOverlayPaths;
        mAndroidApplication.resourceDirs = mPlatformPackageOverlayResourceDirs;
    }
    if (mResolverReplaced) {
        mResolveActivity.applicationInfo.overlayPaths = mReplacedResolverPackageOverlayPaths;
        mResolveActivity.applicationInfo.resourceDirs =
                mReplacedResolverPackageOverlayResourceDirs;
    }
}
```

通知完 PackageManagerService 后，OverlayManagerService 会通知 ActivityManagerService，由 ActivityManagerService 通知相关进程刷新 ApplicationInfo：

```java
@GuardedBy(anyOf = {"this", "mProcLock"})
private void updateApplicationInfoLOSP(@NonNull List<String> packagesToUpdate,
        boolean updateFrameworkRes, int userId) {
    if (updateFrameworkRes) {
        ParsingPackageUtils.readConfigUseRoundIcon(null);
    }

    mProcessList.updateApplicationInfoLOSP(packagesToUpdate, userId, updateFrameworkRes);

    if (updateFrameworkRes) {
        // Update system server components that need to know about changed overlays. Because the
        // overlay is applied in ActivityThread, we need to serialize through its thread too.
        final Executor executor = ActivityThread.currentActivityThread().getExecutor();
        final DisplayManagerInternal display =
                LocalServices.getService(DisplayManagerInternal.class);
        if (display != null) {
            executor.execute(display::onOverlayChanged);
        }
        if (mWindowManager != null) {
            executor.execute(mWindowManager::onOverlayChanged);
        }
    }
}
```

```java
@GuardedBy(anyOf = {"mService", "mProcLock"})
void updateApplicationInfoLOSP(List<String> packagesToUpdate, int userId,
        boolean updateFrameworkRes) {
    final ArrayMap<String, ApplicationInfo> applicationInfoByPackage = new ArrayMap<>();
    for (int i = packagesToUpdate.size() - 1; i >= 0; i--) {
        final String packageName = packagesToUpdate.get(i);
        final ApplicationInfo ai = mService.getPackageManagerInternal().getApplicationInfo(
                packageName, STOCK_PM_FLAGS, Process.SYSTEM_UID, userId);
        if (ai != null) {
            applicationInfoByPackage.put(packageName, ai);
        }
    }
    mService.mActivityTaskManager.updateActivityApplicationInfo(userId,
            applicationInfoByPackage);

    final ArrayList<WindowProcessController> targetProcesses = new ArrayList<>();
    for (int i = mLruProcesses.size() - 1; i >= 0; i--) {
        final ProcessRecord app = mLruProcesses.get(i);
        if (app.getThread() == null) {
            continue;
        }

        if (userId != UserHandle.USER_ALL && app.userId != userId) {
            continue;
        }

        app.getPkgList().forEachPackage(packageName -> {
            if (updateFrameworkRes || packagesToUpdate.contains(packageName)) {
                try {
                    final ApplicationInfo ai = applicationInfoByPackage.get(packageName);
                    if (ai != null) {
                        if (ai.packageName.equals(app.info.packageName)) {
                            app.info = ai;
                            app.getWindowProcessController().updateApplicationInfo(ai);
                            PlatformCompatCache.getInstance()
                                    .onApplicationInfoChanged(ai);
                        }
                        app.getThread().scheduleApplicationInfoChanged(ai);
                        targetProcesses.add(app.getWindowProcessController());
                    }
                } catch (RemoteException e) {
                    Slog.w(TAG, String.format("Failed to update %s ApplicationInfo for %s",
                                packageName, app));
                }
            }
        });
    }

    mService.mActivityTaskManager.updateAssetConfiguration(targetProcesses, updateFrameworkRes);
}
```

进程收到消息后，刷新 ApplicationInfo：

```java
@VisibleForTesting(visibility = PACKAGE)
public void handleApplicationInfoChanged(@NonNull final ApplicationInfo ai) {
    // Updates triggered by package installation go through a package update
    // receiver. Here we try to capture ApplicationInfo changes that are
    // caused by other sources, such as overlays. That means we want to be as conservative
    // about code changes as possible. Take the diff of the old ApplicationInfo and the new
    // to see if anything needs to change.
    LoadedApk apk;
    LoadedApk resApk;
    // Update all affected loaded packages with new package information
    synchronized (mResourcesManager) {
        WeakReference<LoadedApk> ref = mPackages.get(ai.packageName);
        apk = ref != null ? ref.get() : null;
        ref = mResourcePackages.get(ai.packageName);
        resApk = ref != null ? ref.get() : null;
        for (ActivityClientRecord ar : mActivities.values()) {
            if (ar.activityInfo.applicationInfo.packageName.equals(ai.packageName)) {
                ar.activityInfo.applicationInfo = ai;
                if (apk != null || resApk != null) {
                    ar.packageInfo = apk != null ? apk : resApk;
                } else {
                    apk = ar.packageInfo;
                }
            }
        }
    }

    if (apk != null) {
        final ArrayList<String> oldPaths = new ArrayList<>();
        LoadedApk.makePaths(this, apk.getApplicationInfo(), oldPaths);
        apk.updateApplicationInfo(ai, oldPaths);
    }
    if (resApk != null) {
        final ArrayList<String> oldPaths = new ArrayList<>();
        LoadedApk.makePaths(this, resApk.getApplicationInfo(), oldPaths);
        resApk.updateApplicationInfo(ai, oldPaths);
    }
    if (android.content.res.Flags.systemContextHandleAppInfoChanged() && mSystemThread) {
        final var systemContext = getSystemContext();
        if (systemContext.getPackageName().equals(ai.packageName)) {
            // The system package is not tracked directly, but still needs to receive updates to
            // its application info.
            final ArrayList<String> oldPaths = new ArrayList<>();
            LoadedApk.makePaths(this, systemContext.getApplicationInfo(), oldPaths);
            systemContext.mPackageInfo.updateApplicationInfo(ai, oldPaths);
        }
    }

    ResourcesImpl beforeImpl = getApplication().getResources().getImpl();

    synchronized (mResourcesManager) {
        // Update all affected Resources objects to use new ResourcesImpl
        mResourcesManager.applyAllPendingAppInfoUpdates();
    }

    ResourcesImpl afterImpl = getApplication().getResources().getImpl();

    if ((beforeImpl != afterImpl) && !Arrays.equals(beforeImpl.getAssets().getApkAssets(),
            afterImpl.getAssets().getApkAssets())) {
        List<String> beforeAssets = Arrays.asList(beforeImpl.getAssets().getApkPaths());
        List<String> afterAssets = Arrays.asList(afterImpl.getAssets().getApkPaths());

        List<String> onlyBefore = new ArrayList<>(beforeAssets);
        onlyBefore.removeAll(afterAssets);
        List<String> onlyAfter = new ArrayList<>(afterAssets);
        onlyAfter.removeAll(beforeAssets);

        Slog.i(TAG, "ApplicationInfo updating for " + ai.packageName + ", new timestamp: "
                + ai.createTimestamp + "\nassets removed: " + onlyBefore + "\nassets added: "
                + onlyAfter);

        if (DEBUG_APP_INFO) {
            Slog.v(TAG, "ApplicationInfo updating for " + ai.packageName
                    + ", assets before change: " + beforeAssets + "\n assets after change: "
                    + afterAssets);
        }
    }
}
```

看见了熟悉的 `updateApplicationInfo()` ，里面就会重新创建出 Resources 对象了，完成资源的刷新：

```java
/**
 * Update the ApplicationInfo for an app. If oldPaths is null, all the paths are considered
 * new.
 * @param aInfo The new ApplicationInfo to use for this LoadedApk
 * @param oldPaths The code paths for the old ApplicationInfo object. null means no paths can
 *                 be reused.
 */
public void updateApplicationInfo(@NonNull ApplicationInfo aInfo,
        @Nullable List<String> oldPaths) {
    if (!setApplicationInfo(aInfo)) {
        return;
    }

    final List<String> newPaths = new ArrayList<>();
    makePaths(mActivityThread, aInfo, newPaths);
    final List<String> addedPaths = new ArrayList<>(newPaths.size());

    if (oldPaths != null) {
        for (String path : newPaths) {
            final String apkName = path.substring(path.lastIndexOf(File.separator));
            boolean match = false;
            for (String oldPath : oldPaths) {
                final String oldApkName = oldPath.substring(oldPath.lastIndexOf(File.separator));
                if (apkName.equals(oldApkName)) {
                    match = true;
                    break;
                }
            }
            if (!match) {
                addedPaths.add(path);
            }
        }
    } else {
        addedPaths.addAll(newPaths);
    }
    synchronized (mLock) {
        createOrUpdateClassLoaderLocked(addedPaths);
        if (mResources != null) {
            final String[] splitPaths;
            try {
                splitPaths = getSplitPaths(null);
            } catch (NameNotFoundException e) {
                // This should NEVER fail.
                throw new AssertionError("null split not found");
            }

            mResources = ResourcesManager.getInstance().getResources(null, mResDir,
                    splitPaths, mLegacyOverlayDirs, mOverlayPaths,
                    mApplicationInfo.sharedLibraryFiles, null, null, getCompatibilityInfo(),
                    getClassLoader(), mApplication == null ? null
                            : mApplication.getResources().getLoaders());
        }
    }
    mAppComponentFactory = createAppFactory(aInfo, mDefaultClassLoader);
}
```

至此整个加载流程完成。

## 问题解答

回到我们开头抛出的两个问题：

1.  为什么 FRRO 对 `Resources.getSystem()` 不生效？答： `Resources.getSystem()` 反映的是 zygote 中预加载的系统资源，只有不可变且启用的传统 app 格式的 RRO 会对其生效。
2.  为什么 PackageManagerService 内没有读取到 FRRO 替换的数据？答：首先肯定跟 `Resources.getSystem()` 没有关系，看示意代码就已经能知道是用 context 拿的 Resources 了……那根据我们之前的分析，FRRO 应该会生效，所以肯定还存在什么我们还没有发现的东西。其实答案很简单，点开 SystemServer.java 看一下系统服务的启动顺序：
    
    ```java
    /**
     * Starts the small tangle of critical services that are needed to get the system off the
     * ground.  These services have complex mutual dependencies which is why we initialize them all
     * in one place here.  Unless your service is also entwined in these dependencies, it should be
     * initialized in one of the other functions.
     */
    private void startBootstrapServices(@NonNull TimingsTraceAndSlog t) {
        t.traceBegin("startBootstrapServices");
        // ...
        t.traceBegin("StartPackageManagerService");
        try {
            Watchdog.getInstance().pauseWatchingCurrentThread("packagemanagermain");
            mPackageManagerService = PackageManagerService.main(
                    mSystemContext, installer, domainVerificationService,
                    mFactoryTestMode != FactoryTest.FACTORY_TEST_OFF);
        } finally {
            Watchdog.getInstance().resumeWatchingCurrentThread("packagemanagermain");
        }
        // ...
        // Set up the Application instance for the system process and get started.
        t.traceBegin("SetSystemProcess");
        mActivityManagerService.setSystemProcess();
        t.traceEnd();
        // Manages Overlay packages
        t.traceBegin("StartOverlayManagerService");
        mSystemServiceManager.startService(new OverlayManagerService(mSystemContext));
        t.traceEnd();
        t.traceEnd(); // startBootstrapServices
    }
    ```
    
    我们前面提到过，所有可变 RRO 及所有 FRRO 都是在 OverlayManagerService 启动的时候被处理然后加入到 Resources 中的，而 PackageManagerService 刚好在 OverlayManagerService 之前启动（毕竟 OverlayManagerService 的初始化还要依赖 PackageManagerService 呢），在 PackageManagerService 去 `getString()` 的时候 FRRO 根本还没被加载呢，自然不可能读到我们预期的值，只能读到已经在 zygote 里被预加载的另一个 RRO 设定的值……

## 总结

FRRO 是一个很好的新东西，但是仍然不能完全替代传统的 app 格式的 RRO，除了能替换的资源类型受限之外，如果需要替换在系统启动非常早期就需要获取的值，遇到的加载时序问题可以说是根本无法解决的。另一方面，Google 的文档真的可用性堪忧，FRRO 这个特性可以说是完全没有任何文档，只能硬啃代码。这次可以说是踩了大部分人都碰不到的坑，以后还是老老实实用有文档的东西吧……
