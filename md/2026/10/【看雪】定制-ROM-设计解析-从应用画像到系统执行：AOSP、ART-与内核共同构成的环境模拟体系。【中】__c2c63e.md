---
title: 【看雪】定制 ROM 设计解析 从应用画像到系统执行：AOSP、ART 与内核共同构成的环境模拟体系。【中】
source: https://bbs.kanxue.com/thread-293338.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-28T08:20:07+08:00
trace_id: 93b2933b-ba6a-4230-80ca-0fce1419ed95
content_hash: 4f4f8877dccecf537fc73cb0dd8254eca7346328581d81e12c6fc2452a266e18
status: synced
tags:
  - 看雪
  - Android逆向
  - 设备指纹
series: null
feed_source: 看雪·Android安全
ai_summary: TL;DR：详解定制 ROM 环境模拟的实现细节——通过 Build 字段同步、AOSP 钩子、传感器样本调度、内核 UID 映射与 ART 匿名映射标记，实现按应用的环境伪装与 maps 隐藏。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40775244-d011-8113-86c6-d443e2cb8537
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：详解定制 ROM 环境模拟的实现细节——通过 Build 字段同步、AOSP 钩子、传感器样本调度、内核 UID 映射与 ART 匿名映射标记，实现按应用的环境伪装与 maps 隐藏。
> 
> - **Build 静态字段旧值问题：** Bind.MODEL 等静态字段在进程启动时已初始化，单改系统属性不会生效，故在应用启动流程中插入 `updateBuild`，先选定该应用的环境再通过反射 `ReflectUtils.setStaticObjectField` 把 MANUFACTURER、MODEL、FINGERPRINT（缺失时按 brand/product/device:release/id/incremental:type/tags 拼接）等属性同步进 Build。
> - **钩子框架的两种语义：** AOSP 预留钩子经 ILTweaksBridge 包装，`hasResult()` 决定后续 before 是否执行及是否直接返回；`setArg` 只换参数后仍调原方法（如传感器注册换监听器），`setResult` 才是提前返回——参数替换与结果替换是不同操作。
> - **传感器模拟节奏：** 基于真机采集的 6 组加速度样本，200ms 内插更新当前组、3–5 秒 ValueAnimator 过渡切组、10–15 秒后下次切换；钩子中用两层 Map（原 listener → Sensor → 包装 listener）映射，交付时只 arraycopy 替换 `event.values`，复用原 event 时间戳；HAL 的 flush/direct channel 不在覆盖范围。
> - **内核按 UID 选配置：** `my_map_uid` 对 UID≥10000 的应用查 `myUidMap`，有映射用映射值否则回退原 UID，仅用于选择参数目录；文件内容替换挂在 VFS 打开链，而 inode/设备号走 stat、容量走 statfs，须分别处理。
> - **ART→内核映射隐藏链路：** `genTrampoline` 申请匿名内存时 prot 带私有标记 0x00800000，内核 `do_mmap` 将其转为 VMA 第 33 位，`show_map_vma` 对"匿名且带标记"的映射跳过输出 maps 行；真机验证四种组合，带标记 RW/RWX 可正常读写但不出现在 maps 中，判断与 RWX 无关。

这篇接着补。前面放的功能图多，实现讲得少，这次挑几条实际改过的调用链，把代码和处理顺序展开。

入口在 Agent。选好应用和环境后，可以分别配置机型、地区、定位、SIM、文件属性和容量信息。多环境、模块、代理和设备控制也在这里管理。下面的图来自手机实际界面，业务应用名称、设备标识、坐标和服务信息做了脱敏。Java 片段保留项目原代码；内核两处只摘关键分支，标为等价伪代码。

![图1：实际的一键换机入口和配置项。选择应用、环境和机型后，按需启用对应项目；这里能看到文件属性、容量、内存等选项。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7e39019d26fd6481.webp)

*图1：实际的一键换机入口和配置项。选择应用、环境和机型后，按需启用对应项目；这里能看到文件属性、容量、内存等选项。*

## 1\. 设备指纹先从 Build 的旧值说起

以型号为例，同一个应用既可以查 SystemProperties，也可以直接读 Build.MODEL。问题在于 Build 里已经初始化好的静态字段会保留旧值。所以我在应用启动流程里加了 updateBuild：先确定当前进程使用的环境，再把这一份属性同步到 Build。AppStart.updateBuild 中的这段负责厂商、品牌、型号和构建信息：

```java
updateBuildByProp("MANUFACTURER", "ro.product.manufacturer");
updateBuildByProp("BRAND", "ro.product.brand");
updateBuildByProp("MODEL", "ro.product.model");
updateBuildByProp("BOOTLOADER", "ro.bootloader");
updateBuildValue("RADIO", "unknown");

updateBuildByProp("TYPE", "ro.build.type");
updateBuildByProp("TAGS", "ro.build.tags");
updateBuildByProp("USER", "ro.build.user");
updateBuildByProp("HOST", "ro.build.host");
updateBuildValue("FINGERPRINT", deriveFingerprint());
```

updateBuildByProp 和 updateBuildValue 的实现很短。前者通过 getString 取当前属性，后者用反射写入 Build 的静态字段。这一步更新的是当前进程中的对象；属性读取时已经需要选好该应用的环境。

```java
private void updateBuildByProp(String fieldName, String propName) throws Throwable {
    String value = getString(propName);
    if (value != null) {
        updateBuildValue(fieldName, value);
    }
}

private void updateBuildValue(String fieldName, String value) throws Throwable {
    ReflectUtils.setStaticObjectField(Build.class, fieldName, value);
    if ("MODEL".equals(fieldName)) {
        Logger.v("Build." + fieldName + " -> " + value);
    }
}
```

deriveFingerprint 优先取 ro.build.fingerprint，非空就直接用；缺失时再按 brand/product/device:release/id/incremental:type/tags 拼接。Build.FINGERPRINT 只是构建信息中的一项。评论里提到的设备注册指纹范围更广，Android ID、电话信息、显示能力、传感器列表和文件属性还要接各自的读取入口。

这也是按应用保存整套配置的原因：应用再次启动时，要先选定这一份环境，再初始化与它有关的进程状态。只改配置文件而保留旧进程，Build、默认 Locale、TimeZone 等已经初始化过的对象不会主动重新走一遍启动流程。

## 2\. AOSP 里预留的钩子怎样接管调用

这些读取入口通过 AOSP 中预留的钩子接到 ILTweaksBridge。Patcher 生成方法包装：检查 loader、创建 MethodParam、登记处理逻辑，然后决定走原方法还是回调。下面是 LTweaksImpl 中执行 before 的代码：

```java
public void ipplBefore() {
    if (befores == null) {
        return;
    }
    for (ILTweaks.Before hook : befores) {
        try {
            hook.before();
        } catch (Throwable throwable) {
            Log.e(TAG, "Ippl before exception.", throwable);
        }
        if (hasResult()) {
            return;
        }
    }
}
```

这里 hasResult() 的位置有实际含义：某个 before 设置了结果，后面的 before 就不再执行；外层包装也会检查 hasResult，决定是否直接返回。只改参数而不设置结果时，包装根据 isArgsModified 选择新参数调用原方法，取得结果后再执行 after。参数替换与提前返回是两种不同操作。

例如传感器注册，用 setArg 换掉监听器参数后，仍然让系统原注册函数执行。对于要直接给出结果的查询，则用 setResult 提前返回。这样具体功能只需要处理自己的参数和结果，调用顺序由包装层统一处理。

## 3\. 传感器：采样数组怎样变成应用收到的事件

这部分基础数据是我拿真机实际采集后整理的。先看 SensorUpdater 里的加速度样本，六行分别是一组 x、y、z，单位为 m/s²。运行时围绕这些基础样本更新和过渡。

```java
private static final float[][] ACCELEROMETER_VALUES_LIST = {
        {-0.6f, 6.2f, 7.5f},
        {-0.4f, 6.4f, 7.6f},
        {0.1f, 0.2f, 9.7f},
        {0.12f, 0.13f, 9.6f},
        {-0.53f, 6.12f, 7.35f},
        {-0.77f, 6.39f, 7.49f}
};
```

运行时保留 mCurrSet 和 mNextSet。MSG_UPDATE_IN_CURR 每次更新当前样本附近的值，然后按 200 ms 继续调度；到达 mNextMoveTime 后进入 MSG_UPDATE_TO_NEXT。切组时不是直接把三个坐标换成另一行，而是创建 3—5 秒的过渡，下一次切换时间安排在 10—15 秒之后。

```java
case MSG_UPDATE_TO_NEXT: {
    int moveTime = RandomUtils.randomInt(3000, 5000);
    move(CURR_VALUES_COMBO(), NEXT_VALUES_COMBO(), moveTime);
    mNextMoveTime = System.currentTimeMillis() + RandomUtils.randomInt(10000, 15000);
    sendEmptyMessageDelayed(MSG_PREPARE_ON_NEXT, moveTime);
    break;
}
case MSG_PREPARE_ON_NEXT: {
    mCurrSet = mNextSet;
    mNextSet = RandomUtils.randomIntButNot(0, TOTAL_SETS, mCurrSet);
    sendEmptyMessage(MSG_UPDATE_IN_CURR);
    break;
}
```

move 使用 ValueAnimator，配 AccelerateDecelerateInterpolator。下面是其中三个分量的处理：加速度和方向根据 fraction 从起点过渡到终点；线性加速度在这一分支里单独取小幅随机值。

```java
for (int i = 0; i < 3; ++i) {
    current.accelerometerValues[i] = start.accelerometerValues[i]
            + (end.accelerometerValues[i] - start.accelerometerValues[i]) * fraction;
    current.linearAcceleration[i] = RandomUtils.randomFloat(-0.1f, 0.1f);
    current.orientation[i] = start.orientation[i]
            + (end.orientation[i] - start.orientation[i]) * fraction;
}
```

样本准备好后，还要送到应用注册的监听器。SystemSensorManager.registerListenerImpl 的钩子里用了两层 Map：先找原 listener，再按 Sensor 找包装对象。因为一个 listener 可以同时注册加速度和陀螺仪，两者需要分别保存。新注册走下面四行，param.setArg(0, myListener) 把原调用的第一个参数替换掉：

```java
MySensorEventListener myListener = new MySensorEventListener(sensor, listener);
param.setArg(0, myListener);
myListeners.put(sensor, myListener);
mListeners.put(listener, myListeners);
```

包装监听器收到 SensorEvent 后，根据 mSensor.getType() 选取 SensorUpdater 的对应数据。加速度还有 needMockShaking 文件开关：存在时取摇晃数据，否则取普通加速度数据。最后真正交付给应用的是这两行：

```java
System.arraycopy(values, 0, event.values, 0, values.length);
mOriginalListener.onSensorChanged(event);
```

这两行复用了原 event，时间戳沿用收到的事件，只替换 values。SensorUpdater 的 200 ms 是后台数值更新周期，应用收到事件的节奏仍取决于回调链。注册之外，重复注册和注销也按这张对应表处理，否则应用拿原 listener 注销时，系统中实际登记的包装对象就可能遗留。

上篇还提到了 HAL。这里先把范围说清：这几段是 AOSP 的 SystemSensorManager 与 Java 监听回调实现。机型模板另外保存名称、厂商、量程、分辨率、功耗和采样间隔等静态描述。HAL 的批处理、flush、唤醒和 direct channel 要沿各自通路单独处理，这篇不把它们算进上述监听器替换的覆盖范围。

## 4\. 内核怎样选择当前应用的配置

内核的 my_map_uid 会从当前进程真实 UID 开始选择配置。UID 小于 10000 时沿用原值；应用 UID 则查 myUidMap，有非零映射才采用映射值，没有则回退到原 UID。下面按实际分支写成等价伪代码，只展示选配置的逻辑。

```cpp
uid = current_real_uid();
if (uid >= 10000) {
    mapped = lookup_myUidMap(uid);
    if (mapped != 0)
        uid = mapped;
}
return uid;
```

sys_my_uid_map 保存映射，sys_my_uid_map_get 查询映射。my_map_uid 返回的值用来选择参数目录，进程的权限凭据仍是另一套状态。这使得分身切换可以调整配置对应关系，而各查询入口继续使用同一套选配置逻辑。

文件内容替换接在 VFS 的打开链；文件属性则有 stat/fstat 一类入口；文件系统容量又走 statfs。这些入口面对的对象不同：有的接路径，有的接已打开的 FD。只替换文件内容，不会自然把 inode、设备号、文件系统容量的查询一并改掉。配置页把这些项目分别开关，底下也是分别处理。

## 5\. ART 的匿名映射标记，怎样传到内核输出

ART 的 genTrampoline 分配匿名内存池时，请求长度是 4096，prot 为 0x00800007，flags 为 0x22。这里的低三位是普通的读、写、执行权限，高位 0x00800000 是约定的私有标记。内核 do_mmap 把它转存到 VMA 的第 33 位，show_map_vma 再消费这个标记。关键分支的等价伪代码如下：

```cpp
/* do_mmap: 私有 prot 标记转为 VMA 标记 */
if (prot & 0x00800000)
    vm_flags |= (1ULL << 33);

/* show_map_vma: 匿名映射的输出分支 */
if (vma->vm_file == NULL &&
    (vma->vm_flags & (1ULL << 33))) {
    return 1;  /* 跳过当前 maps 行 */
}
```

这条判断同时要求匿名映射和标记位，位置在 procfs 的 VMA 输出路径。它不以 RWX 作为判断条件：没有标记的普通 RWX 映射不会仅因为可执行就被这条分支跳过；带标记的 RW 区域也会进入该分支。操作改变的是输出行，真实映射仍存在，页面仍然可以读写。

这一点在手机上用四种匿名分配验证过：普通 RW、普通 RWX、带标记 RW、带标记 RWX。带标记的区域可以正常写入读取，但 maps 中省略了相应条目。这里处理的是映射列表的展示。
