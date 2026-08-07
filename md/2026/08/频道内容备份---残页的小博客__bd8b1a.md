---
title: 频道内容备份 - 残页的小博客
source: https://blog.canyie.top/2026/03/17/telegram-channel-backup/
source_host: blog.canyie.top
clip_date: 2026-08-07T16:57:03+08:00
trace_id: fc13010b-ee7b-4d1c-9ad7-2105b803be1e
content_hash: b58d235aa87f2e23d961fceb8835b1b6fbeda24d302ecb150895a38a8309c43a
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: null
ai_summary: 一份个人技术频道备份：作者记录Android底层、Magisk、安全漏洞研究结论，以及职校生视角下的成长与思考。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b575244-d011-8130-9448-f14adfac7475
ioc:
  cves:
    - CVE-2017-13242
    - CVE-2018-9432
    - CVE-2020-0024
    - CVE-2020-0227
    - CVE-2021-0314
    - CVE-2021-0339
    - CVE-2021-0434
    - CVE-2021-0691
    - CVE-2021-0693
    - CVE-2021-0975
    - CVE-2021-39631
    - CVE-2021-39807
    - CVE-2022-20465
    - CVE-2023-21086
    - CVE-2023-21090
    - CVE-2023-21266
    - CVE-2023-21377
    - CVE-2024-0019
    - CVE-2024-0044
    - CVE-2024-23700
    - CVE-2024-31317
    - CVE-2024-31318
    - CVE-2024-31320
    - CVE-2024-34734
    - CVE-2024-34740
    - CVE-2024-40676
    - CVE-2024-43080
    - CVE-2024-43081
    - CVE-2024-43088
    - CVE-2024-43090
    - CVE-2024-43093
    - CVE-2024-43762
    - CVE-2024-4406
    - CVE-2024-4610
    - CVE-2024-48336
    - CVE-2024-49746
    - CVE-2025-0001
    - CVE-2025-0100
    - CVE-2025-22441
    - CVE-2025-31229
    - CVE-2025-48524
    - CVE-2025-48545
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 一份个人技术频道备份：作者记录Android底层、Magisk、安全漏洞研究结论，以及职校生视角下的成长与思考。
> 
> - **底层Bug记录：** 旧版bionic的mremap参数声明错误、魅族设备getrandom返回0导致新版libc初始化死循环、killBackgroundProcesses被收录为CVE，提醒兼容旧设备时慎用系统API。
> - **Magisk与Root生态：** 修复过Magisk Hide随机失效和busybox const优化崩溃，分析magiskinit、Pixel 6系列boot.img ramdisk压缩格式不匹配导致修补无效，并对v26.2回归表达不满。
> - **安全漏洞研究：** 向Google VRP提交漏洞获P2/S2但无赏金；披露SDK Sandbox相关CVE（2025-48524/48545），以及移除CompanionDeviceManager引发的Critical级提权CVE-2024-23700。
> - **隐私与取证：** 蚂蚁森林能量球数值可侧信道推断用户前一天行为；Android 16恢复出厂后的trade-in模式提供受限adb入口，可被取证利用。
> - **职校生视角：** 分享厌学、读中职、进厂实习经历与中职就读建议，批评主流社会对职校生的刻板印象，主张尊重不同的成长路径。

由于频道被封，整理一下还算有用的内容发到这里来。偏技术向闲聊，发布一些随谈、碎碎念或短篇/价值密度不高等我觉得不适合专门写一篇博客但仍然有留下来的价值的内容，包括但不限于编程想法、系统内部解构、人生感悟等。  
有挺多人好奇我的人生经历（见 #303），比如我在我的领域是怎么起步的，还有我作为一个厌学、走职业教育路的差生的故事（#88 #303），这里一并留下来。  
部分我觉得现在没什么用的内容比如纯情感发泄和线下贴贴就不再留着了。另外考虑到这里偏正式，部分条目有修改。  
本频道任何消息均不构成医学建议。

## 前言 一些想说的话

看这里的很多人应该都是科班程序员出身，走的是普高考大学读计算机然后可能还有读研读博然后进入大厂这条理所应当的路。可能你们很难了解到我这样的职校生的人生，主流媒体的报道也多是围绕着天才，而我们职校生很难得到关注。所以这里会有很多我作为职校生的思考，希望能提供一个不一样的视角。  
中考五五分流让一半的学生去读了职校，但现在主流叙事却只把职校学生当成审丑对象来满足自己的优越感，把上普高上本科考研读博考公成为人生赢家当成唯一的定死的路，职校生的评论区充斥着“保送富士康”“和我的准时宝说去吧”等高高在上的刻板印象凝视，他们失去话语权失去主体性成为别人应对学历焦虑、确认自己的努力是值得并感叹“还好我还没有跟他一样”的工具，我只感觉到溢出的社达气息。我承认我也在反思职校和职校生自己的缺点，比如学校里强调所谓的早上七点必须离开宿舍、早读必须大声等形式主义来掩盖教学质量的落后，还有一方面后悔没考上高中另一方面又不尝试通过高职高考等方式提升学历的同学，但我的反思是为了修正错误，而不是建构所谓的等级体系。很多年轻人受到的教育都是“好好学习改变命运”，“不学习以后就要干又苦又低薪的活”，这种焦虑逼着所有人往上爬。但是，难道所谓底层工作就真的天生低人一等吗？做到尊重与平等，承认工程师和外卖员流水线普工一样光荣，优化职教学生的课程质量让职教不再名不副实，同时保障所有劳动者的权益，才是学历通胀时代的正确解法。

## 索引

TODO

## 2021

### 3月6日 #1 一切的开始

频道已创建。

### 5月15日 #3

意外发现magisk中某个关键组件存在问题，影响magisk hide的隐蔽性，可以导致riru被轻易检测，各类xposed实现的某个特征无法被用户通过命令隐藏  
再次总结：magisk能运行到现在是一个奇迹

### 7月21日 #10 #11 解决 magisk hide 随机失效

给 magisk 提交了一个 pr ，出现 magiskhide 完全或随机失效的可以尝试  
[https://github.com/topjohnwu/Magisk/pull/4507](https://github.com/topjohnwu/Magisk/pull/4507)

### 7月22日 #12 #13 magiskhide bug

[https://github.com/topjohnwu/Magisk/blob/v23.0/native/jni/magiskhide/proc_monitor.cpp#L387-L403](https://github.com/topjohnwu/Magisk/blob/v23.0/native/jni/magiskhide/proc_monitor.cpp#L387-L403)  
妙呀，之前我遇到的那个 raise(SIGSTOP) 停不下来的问题是另一个bug（应该算bug吧）

### 9月25日 #19 #20 #21 #22 #23 #24 busybox bug

```python
/* We use a trick to have more optimized code (fewer pointer reloads):
 *  ash.c:   extern struct globals *const ash_ptr_to_globals;
 *  ash_ptr_hack.c: struct globals *ash_ptr_to_globals;
 * This way, compiler in ash.c knows the pointer can not change.
 *
 * However, this may break on weird arches or toolchains. In this case,
 * set "-DBB_GLOBAL_CONST=''" in CONFIG_EXTRA_CFLAGS to disable
 * this optimization.
 */
```

```
#define INIT_S() do { \
  (*(struct lineedit_statics**)not_const_pp(&lineedit_ptr_to_statics)) = xzalloc(sizeof(S)); \
  barrier(); \
} while (0)
```

[https://github.com/topjohnwu/Magisk/pull/4731](https://github.com/topjohnwu/Magisk/pull/4731)  
busybox 内置一个神奇优化，把一些变量声明成 const 然后用魔法去改，但是改变 const 在 c 里是 ub，编译器不知道数据依赖关系，会把代码优化成会崩溃的形式…

### 11月7日 #25 androidx bug

[https://cs.android.com/androidx/platform/frameworks/support/+/c50410874c4f5c64e0089a161a24347e0f39d711](https://cs.android.com/androidx/platform/frameworks/support/+/c50410874c4f5c64e0089a161a24347e0f39d711)  
androidx 的兼容方法 ProcessCompat.isApplicationUid(int) 在 API 17-23 上看起来漏了一个 return ，会丢掉已经获取到的结果，固定返回 true；API 16 工作正常。

## 2022

### 2月21日 #27 art bug

[https://segmentfault.com/a/1190000041412586](https://segmentfault.com/a/1190000041412586)

### 4月23日 #35 Android Design

附带一篇当时对 Holo 和 Android Design 的评价  
[http://www.geekpark.net/news/179488](http://www.geekpark.net/news/179488)

### 5月6日 #37 visualsource

[https://www.visualsource.net/](https://www.visualsource.net/)  
生成 git 仓库可视化的开发（施法）过程视频

### 5月23日 #42 #43 质疑

[https://juejin.cn/post/7100079518756552734](https://juejin.cn/post/7100079518756552734)  
血压高了，就这也敢叫 《android 进阶宝典》

简单看了一下，一些明显错误：

> 其实方法的本质就是arm指令，然后JVM的执行引擎会执行arm指令

arm 的 cpu 直接就能执行 arm 指令，jvm 也不是用来执行 arm 指令的，jvm 只接受字节码。android 上的 dalvik/art 稍有不同，接受 dalvik 字节码指令集（通常称为 smali）。至于所谓的 arm 指令，那是 runtime 在用户手机上生成的，即使没有，程序也可以被解释执行。

> arm指令是存在于dex文件中的，也就是说，我们可以从dex文件中取出arm指令，查看一个方式是如何被执行的

dex 里没有 arm 指令。如果要查看被编译后的机器指令，请使用 dex2oat 将其编译为 oat 后再 oatdump 。

> JVM的执行引擎会将arm指令从方法区中拿出来，放到虚拟机栈中执行（栈帧的概念，每一个方法对应的dx指令集就是一个栈帧，每一次方法调用都有栈帧入栈和出栈）

这里假设你的”arm 指令“是字节码，它在执行的时候也不会被放到虚拟机栈中再执行。栈是程序执行时的临时数据区，程序通过各种指令操作，放/取数据，而非指令。另外，”dx 指令集“又是什么玩意儿？

> 同是执行 10 + 20 ，JVM是先创建一个10变量，然后再创建20 ，最后将两个相加然后返回；但是dx指令是直接计算好了，然后创建v0 = 30，直接返回，所以：Android编译器在编译的过程中会做优化，提高执行的效率

首先，你给的 java 字节码里面没有加法指令，是个除法指令，也就是说这不是你给的加法函数编译出来的结果。这种优化叫常量折叠，从理论上来说 javac 也会进行这种优化。

> 之前我们介绍过阿里的AndFix或者Sophix是通过hook native层修改字节码指令完成，之前我们介绍的arm指令集，就是实现热修复的基础。所以AndFix热修复，就是将正确的arm指令替换调异常的arm指令，等到再次加载这个类执行方法时，执行引擎拿到的是正确的arm指令交由虚拟机栈。

函数入口与指令本身有着本质区别。替换函数入口也不需要了解 arm 指令集。

> 记录当前方法被调用的次数，如果超过某个限制，那么该方法就被标记为是热方法，热方法是被缓存到一块内存，下次执行到这个方法，不需要压栈，直接返回结果

hotness_count\_ 与 JIT 编译相关，当方法未被编译而调用次数达到阈值后，会有专门的 JIT 线程把它编译为机器指令加速执行。“热方法是被缓存到一块内存，下次执行到这个方法，不需要压栈，直接返回结果”，首先非热方法也在内存中，其次压栈与方法调用有本质区别。我觉得你应该是想说 inline 优化，但那与 hotness_count\_ 无关。

> 找到ArtMethod，在JNI层是能够实现的，通过JNIEnv的FromReflectedMethod函数  
> 从 android 11 开始，FromReflectedMethod 返回的可能不是 ArtMethod\*。

> 尤其是通过hook native底层修改arm指令集  
> 你是在说 inline hook？

### 6月28日 #44 Android名字规则

转发自 南宫雪珊 [https://t.me/vvb2060Channel/441](https://t.me/vvb2060Channel/441)

以大小写英文或点(.)开头，后续可以用大小写英文、数字、点(.)和下划线(\_)

package(包名)和sharedUserId有额外规则：不是非法文件名。即不能为. 或.. ，以utf8方式转成比特数组后，长度不能大于255。（虽然aapt2连250都不允许……）

需要至少一个点：package，sharedUserId，不以:开头的process。  
不要求至少一个点：splitName，以:开头的process。

不以:开头的process如果是system，例外允许。  
以:开头的process需要至少两个字符，即不能只有一个:。

最终跑起来后的情况更加复杂。  
按照组件级process，应用级process，包名的顺序获取进程名。如果process以:开头，进程名是package(包名)和process的拼接。  
共享uid的app们的进程名如果相同会跑在一个进程内。  
对于Android10及以上的隔离服务，最终进程名还会追加:和服务类名；以Android10新接口启动的隔离进程继续再追加:和识别名。

完了吗？没有，这只是 ActivityManagerService 内部认为的名字，即events日志中am_proc_start标签记录的名字。如果用 ps 命令或者去读 `/proc/<pid>/cmdline` 这个文件，在同时支持 64 位和 32 位的系统上，读出来的进程名会有 98 个字符（64 位）或 108 个字符（32 位）的限制，超出的部分会被截断。  
这个奇怪的数字是怎么来的？实际上是 zygote 进程启动时命令行的长度。  
98 来自于：  
[https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:system/core/rootdir/init.zygote64.rc;l=1](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:system/core/rootdir/init.zygote64.rc;l=1)

```
/system/bin/app_process64 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote
```

108 则来自于：  
[https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:system/core/rootdir/init.zygote64_32.rc;l=3](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:system/core/rootdir/init.zygote64_32.rc;l=3)

```
/system/bin/app_process32 -Xzygote /system/bin --zygote --socket-name=zygote_secondary --enable-lazy-preload
```

很明显，这不可靠，比如Android5到7的32位zygote就是86

```
/system/bin/app_process32 -Xzygote /system/bin --zygote --socket-name=zygote_secondary
```

Android 4.0.1 上查看 init.rc 可知这个数字应该是 75：  
[https://cs.android.com/android/platform/superproject/+/android-4.0.1_r1:system/core/rootdir/init.rc;l=409](https://cs.android.com/android/platform/superproject/+/android-4.0.1_r1:system/core/rootdir/init.rc;l=409)

```
/system/bin/app_process -Xzygote /system/bin --zygote --start-system-server
```

这还只是考虑 AOSP 的情况，如果再考虑 OEM，比如三星有4个 zygote，参数肯定不一样……

### 7月26日 #45 使用 Linux signal handler 劫持内存访问

[https://harrychen.xyz/2022/03/23/hijack-memory-access-using-linux-signal-handler/](https://harrychen.xyz/2022/03/23/hijack-memory-access-using-linux-signal-handler/)

### 8月7日 #46 #47 android_dlopen_ext 坑

[https://developer.android.com/ndk/reference/group/libdl](https://developer.android.com/ndk/reference/group/libdl)  
这是 android_dlopen_ext 还有那一堆 flags 的文档。里面只说了 android_dlopen_ext is available since API level 21，没说那些 flags 是什么时候添加的。  
以 Android 5.1 为例，有效的 flag 只有这么几个： [https://cs.android.com/android/platform/superproject/+/android-5.0.0_r1.0.1:bionic/libc/include/android/dlext.h;l=57-62](https://cs.android.com/android/platform/superproject/+/android-5.0.0_r1.0.1:bionic/libc/include/android/dlext.h;l=57-62)

```
/* Mask of valid bits */
ANDROID_DLEXT_VALID_FLAG_BITS       = ANDROID_DLEXT_RESERVED_ADDRESS |
                                      ANDROID_DLEXT_RESERVED_ADDRESS_HINT |
                                      ANDROID_DLEXT_WRITE_RELRO |
                                      ANDROID_DLEXT_USE_RELRO |
                                      ANDROID_DLEXT_USE_LIBRARY_FD,
```

使用不支持的其他 flag 如 ANDROID_DLEXT_FORCE_LOAD 会直接被 linker 报错拒绝加载。坑人呢

### 10月14日 #48 Android NDK 移除 x86 支持

[https://github.com/android/ndk/issues/1772](https://github.com/android/ndk/issues/1772)

## 2023

### 1月2日 #49 #50 android selinux bug

[https://stackoverflow.com/questions/28590831/android-permission-denied-when-reading-proc-self-exe-from-non-main-thread](https://stackoverflow.com/questions/28590831/android-permission-denied-when-reading-proc-self-exe-from-non-main-thread)

Release 模式的 APP 在非主线程上对 /proc/self/exe 进行 readlink 在旧版本的 Android/（Kernel？）上会触发 Permission denied 错误。把 debuggable 设置为 true 后正常，在主线程进行也正常，在没有 SELinux 的 Android 5.0 AVD 上也正常。  
猜测可能是旧版本 Android 的 SELinux 有问题？

这个问题导致了大量旧 Android （5.x/6.x）用户更新 Magisk 25.0 后“卡在开屏页”

应该是 kernel 问题，在非 Android 平台上也有出现  
[https://github.com/moby/moby/issues/18883](https://github.com/moby/moby/issues/18883)

### 1月13日 #51 #52 Pixel 6 系列 ramdisk 位置移动

Pixel 6 系列（只看了 6a 但是应该是整个系列都有这个问题）的 Android 13 QPR2 B1/2  
boot.img 里的 ramdisk 用的 gzip 压缩，vendor_boot.img 里的 ramdisk 用的 lz4_legacy。  
bootloader 解包的时候是把两个 ramdisk 拼起来扔给 kernel 然后 kernel 直接整包解压。这需要两个 ramdisk 起码使用相同的压缩格式。所以 boot.img 里的 ramdisk 从来没有被成功解压过，自然 Magisk 怎么修补都无效。这就是 修补原厂 boot.img 没有反应但是修补 Pixel 7 的 boot 刷入就好了的原因 ([https://github.com/topjohnwu/Magisk/issues/6441](https://github.com/topjohnwu/Magisk/issues/6441))

Pixel 6 系列机型 QPR2 用户临时的解决方案：

1.  下载 Pixel 7 系列机型的 boot.img，修补，给自己的手机刷入。
2.  将 boot.img 里的 ramdisk 手动压缩成 lz4_legacy 格式再扔给 Magisk 修补。
3.  手动修补 vendor_boot.img （无法使用 Magisk app 进行）。

更新：QPR2 Beta 3 已修复。Pixel 6 系列手机的用户可以正常修补 boot.img 获取 root。

Google：自己写的 [文档](https://source.android.com/docs/core/architecture/partitions/vendor-boot-partitions#bootloader-support) ，当然要由自己亲手破坏

### 1月18日 #55 #56 #57 #58 #59 zygote fd 检查

Android 7.0.0_r1 SDK24 没有 fd 检查，没有 frameworks/base/core/jni/fd_utils-inl.h  
Android 7.1.0_r1 SDK25 没有 fd 检查，没有 frameworks/base/core/jni/fd_utils-inl.h  
Android 7.0.0_r29 SDK24 有 fd 检查： [https://cs.android.com/android/platform/superproject/+/android-7.0.0_r29:frameworks/base/core/jni/fd_utils-inl.h](https://cs.android.com/android/platform/superproject/+/android-7.0.0_r29:frameworks/base/core/jni/fd_utils-inl.h)  
Android 7.1.0_r2 SDK25 有 fd 检查： [https://cs.android.com/android/platform/superproject/+/android-7.1.0_r2:frameworks/base/core/jni/fd_utils-inl.h](https://cs.android.com/android/platform/superproject/+/android-7.1.0_r2:frameworks/base/core/jni/fd_utils-inl.h)

如果你的应用（无论 root 还是 非 root）需要假定 Android 的内部行为，最好不要直接检查 SDK_INT 不然莫名其妙的崩溃就是下场。

Magisk 假定 fds_to_ignore 这个参数不存在就没有 fd 检查，然后在 华为/魅族的 7.0 上崩了。  
Pine 根据系统版本假定 kAccCompilerDontBother 的值，然后在官方的 Pixel 2 8.0 ROM 上崩了。

### 2月3日 #60 乌云

今天意外发现乌云网 [www.wooyun.org](http://www.wooyun.org/) 已经没有 DNS 解析记录了（以前是访问显示正在升级），分享一个备份 [https://wooyun.js.org/](https://wooyun.js.org/)  
致敬

### 2月10日 #61 ndk 移除 4.4 支持

[https://github.com/android/ndk/issues/1751](https://github.com/android/ndk/issues/1751)

### 2月12日 #62 #63 #64 #65 AutoCloseable

Android 文档：TypedArray implements AutoCloseable added in API level 1  
实际上：直到 Android 11.0.0_r1 这个类都没有实现 AutoCloseable 这个 interface。  
所以，如果你很自然的写出了

```java
try (var typedArray = obtainAttributes()) {}
```

或者

```kotlin
obtainAttributes().use {}
```

之类的代码，在旧版本上会崩溃。没有警告。

同样情况的还有 LocalServerSocket 这个类。直到 8.0 都没有实现 Closeable。  
这个类 比 TypedArray 更离谱，TypedArray 大家都知道是用 recycle，而 LocalServerSocket 一直都有 close，但是偏偏一直没去 implements Closeable。

### 3月12日 #66 讨论

[https://juejin.cn/post/7208345469658415159](https://juejin.cn/post/7208345469658415159)

时隔多年又看见了这种『一个 app 有多少个 XXX』这种问题。备份一下我的评论，以免又被掘金删掉。

首先，hashCode 跟对象地址没有半毛钱关系。确实有部分虚拟机选择将 hashCode 直接实现为内存地址，但是 ART 不是。  
ART 的实现在这里： [http://aospxref.com/android-13.0.0_r3/xref/art/runtime/mirror/object.cc?fi=GenerateIdentityHashCode#170](http://aospxref.com/android-13.0.0_r3/xref/art/runtime/mirror/object.cc?fi=GenerateIdentityHashCode#170)  
很明显可以看出 1103515245 是一个线性同余法生成伪随机数选择的常用魔数（不过整个算法看起来不是典型线性同余）。  
至于为什么生成的 Application 对象 hashCode 值相同，可能是因为这些进程都从 Zygote 继承了相同的随机数种子，而 framework 内代码对象创建次数往往相同，经过相同的随机次数后产生一致结果就很正常了。  
你可以在 Application 的静态代码块内创建随机数量的对象扰乱结果，应该就能得到不一致的 hashCode。  
然后是『获取物理内存地址』，Unsafe 这种方法获取到的依然是虚拟的逻辑地址，且用户空间没有办法获取真实的物理地址（除非利用内核漏洞）。  
全部给逻辑地址的好处很多：  
1.可以在内存紧张时将未使用的内存空间临时换到硬盘上存储，应用实际访问时再触发缺页中断从硬盘读数据，整个过程对处在用户空间的应用完全没有影响  
2.逻辑地址无法直接跨进程使用，增强安全性  
3.完全阻止恶意应用读写其他进程的私有内存空间  
等等等等。

然后我觉得『一个app到底有多少个 Application』『一个 app 有多少个 Context』这种问题一点意义都没有。如果是想知道『一个 app 的进程有多少个 Context』，可以调用 VMDebug.getInstancesOfClasses 这个方法。  
文中忽略了一种情况，就是多个应用跑在同一个进程。当多个应用具有相同的签名，配置的 sharedUserId 相同且 android:process 为相同的共享进程时，会发生这种情况。此时一个进程会创建多个 Application 对象（每个应用一次）。

### 3月23日 #67 #68 bionic bug

之前发现在自己的 Android 5.1 kernel 3.10 arm32 设备上调用 mremap 移动内存空间时会奇怪地报出 EINVAL (invalid argument) 错误，怀疑是低版本 kernel 的问题。后面西大师发现 6.0 x86 的 AVD 上也可以复现出这个错误，x86_64 却不会，而且主动使用 linux-syscall-support 这个库调用 mremap 是没问题的，所以猜测是旧版本 bionic 的实现问题。  
果然，旧版本 mremap 参数列表里第四个 int 写成了 unsigned long，缺少变长参数 （ [http://aospxref.com/android-6.0.1_r9/xref/bionic/libc/include/sys/mman.h#62](http://aospxref.com/android-6.0.1_r9/xref/bionic/libc/include/sys/mman.h#62) ），同时 x86 发起 syscall 的时候也只处理了四个参数（ [http://aospxref.com/android-6.0.1_r9/xref/bionic/libc/arch-x86/syscalls/mremap.S#18](http://aospxref.com/android-6.0.1_r9/xref/bionic/libc/arch-x86/syscalls/mremap.S#18) ）  
然后找到了这个修复提交 [https://android-review.googlesource.com/c/platform/bionic/+/180130](https://android-review.googlesource.com/c/platform/bionic/+/180130)  
所以如果你的程序用了 mremap 又想兼容 7.0 以前的设备，请不要使用系统自带的 libc 里面的 mremap，自己 syscall 或者使用 linux-syscall-support 代替。

（离谱，好特么坑啊

提醒：想要兼容旧设备，还有其他坑……  
android 6.0 以前，系统 libc 的 getmntent 和 getmntent_r 是空实现。  
[https://cs.android.com/android/\_/android/platform/bionic/+/e3c4acf1e3ef36c2ab1f48b1261dec9a1d8330a4](https://cs.android.com/android/_/android/platform/bionic/+/e3c4acf1e3ef36c2ab1f48b1261dec9a1d8330a4)

还有，init.rc 的 exec 也是空实现……  
[http://aospxref.com/android-5.0.2_r3/xref/system/core/init/builtins.c#257](http://aospxref.com/android-5.0.2_r3/xref/system/core/init/builtins.c#257)

clock_nanosleep 这个函数的行为也不对，在 [https://android-review.googlesource.com/c/platform/bionic/+/110652](https://android-review.googlesource.com/c/platform/bionic/+/110652) 这个提交之前它在出错时会返回 -1 然后把错误码设置到 errno 里，正确行为应该是直接返回正数的 errno

### 4月2日 #69 魅族系统 bug

魅蓝 M3 Note，系统版本 Android 5.1，内核版本 Linux localhost 3.10.72+ #1 SMP PREEMPT Tue Sep 22 18:07:30 CST 2020 aarch64 Android  
在这台设备上，syscall getrandom 会返回 0 同时 errno 变为 2 (No such file or directory)  
似乎只在 64 位运行时出现，32 位正常。  
而 getrandom 这个 syscall 从 Linux 3.17 才开始有，正常情况下它应该失败且返回 -1，errno 设置为 ENOSYS。  
手上的其他 3.10 设备都没有这种怪行为。  
而很不幸，较新一点的系统 libc 里面有个函数，叫 getentropy，它会尝试循环 syscall getrandom，只有当它返回 -1 的时候才会认为内核不支持这个 syscall 而进行回退。这个函数会在 libc 初始化时被调用。  
所以如果你的程序静态链接了新的 libc，在这台设备上运行的时候会在 libc 初始化时调用 getentropy 而陷入死循环，连 main 都没有机会运行。  
修复手段也不是没有，在编译时添加选项使用 wrap functions 功能覆盖掉这几个函数，然后处理一下 getrandom 返回 0 的情况。不过我觉得把当时弄出这种东西的魅族工程师拖出来打一顿比较好。

顺带一提，在这台设备上你想运行 lldb-server 也会因为同样原因卡死，strace 也会不明原因卡死，我是去找了一份 gdb 发现能用才发现这个问题的，不然连 backtrace 都拿不到

### 4月20日 #72 #73 #74 #75 #76 好心人变冤种

摘要：在长沙街头碰上人借车费，说晚上就还，然后就被删好友了  
图片懒得补了，碎碎念可以补一下：

啊睡不着，瞎扯几句  
我 2020 年刚进中职的时候，有个同班同学总是找我借饭卡刷，还有微信借钱，后面还带了另一个人找我借钱。我当时想都没想就借给他们了，到后面滚雪球越滚越多，他们借了我 642 块。后面我找他们要钱的时候他们老是说没钱，再后面这两个人， 一个退了学，一个街头持刀抢劫别人被抓了。就只还了150，他们到现在还欠我差不多500块，而我甚至连他们其中一个人的名字都不知道。  
性格缺陷是这样的，害怕又渴望社交，害怕好不容易建立起来的社交关系维持不下去。

这回也是，我不认识这个人，这个人路上见到我说微信限额了帮忙付个 79 块的车费。

我这是善良还是纯圣母呢，我觉得是圣母。  
我甚至觉得哪天我挂了去见上帝的时候上帝会说哟豁，好久没见过这么纯净的灵魂了。

大家别学我当这种冤种哦

睡了，明天还有 第 81 届中国教育装备展示会

### 4月22日 #78 权限文档

[https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/permission/Permissions.md](https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/permission/Permissions.md)  
给系统开发者的权限文档，竟然塞在这种地方，想不到  
不过我这里用 Chrome 打开这个页面，Using role for permission protection 这个链接是 blocked，不懂 Google 在搞什么。应该是指向这个链接 [https://cs.android.com/android/platform/superproject/+/master:packages/modules/Permission/PermissionController/src/com/android/permissioncontroller/role/RolePermissionProtection.md](https://cs.android.com/android/platform/superproject/+/master:packages/modules/Permission/PermissionController/src/com/android/permissioncontroller/role/RolePermissionProtection.md)

App Ops 文档 [https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/AppOps.md](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/AppOps.md)

顺便带上一份 Android 13 的权限列表， [http://aospxref.com/android-13.0.0_r3/xref/frameworks/base/core/res/AndroidManifest.xml](http://aospxref.com/android-13.0.0_r3/xref/frameworks/base/core/res/AndroidManifest.xml)  
需要其他版本的，选好版本直接搜索 `/core/res/AndroidManifest.xml` 就好了

### 4月24日 #79 畸形二维码导致扫码模块崩溃

转发自 不存在的世界 [https://t.me/illusory_world/4359](https://t.me/illusory_world/4359)  
[https://nano.ac/posts/86257129/](https://nano.ac/posts/86257129/)

### 4月30日 #82 华为旧机型全盘加密

拿到了一台华为 Nova 1 （Android 7.0，EMUI 5.0.4），getprop 显示是全盘加密，然而输密码解锁时这台设备的表现完全不像全盘加密。  
在没有输密码解锁时连上 adb，mounts 显示 /data 已经挂载上 f2fs，vold.decrypt = trigger_restart_framework，vold.post_fs_data_done = 1，表明它已经解密完成。

而正常的已经设置密码的 Android 全盘加密设备的解密流程应该是：设备开机 -> 给 /data 挂载上 tmpfs -> 启动 framework -> framework 显示输锁屏密码页面 -> 用户输密码后，解密密钥 -> 关闭 framework，解密 data，挂载真正的东西到 /data -> 再次触发 post-fs-data 正常开机。

查看 dmesg 后发现这台设备在解锁之前用默认密码解密就成功了，锁屏密码似乎就只是锁屏密码。华为对 FDE 设备开机时间过长所做的“优化”？

编写了一个 PoC [https://github.com/canyie/BypassKeyguard](https://github.com/canyie/BypassKeyguard) ，经测试能在设备开机后第一次输入密码前绕过锁屏进入桌面并访问用户数据，侧面印证了上面的猜想。

### 5月18日 #88 中职/职高/技校就读指南

（为自己读了三年的感想总结，仅作备份）

0.快跑！如果你是 2023 届中考生，不是特殊情况，快去复习！想啥中专！  
1.就算你真打算进中专，也一定要去中考考一下，别签那啥自愿放弃中考同意书！有很多好的中专也是要看中考成绩的  
2.好好选学校，好的中专跟坏的中专差别很大。中考成绩出来发现没希望上普高的话，没打算复读的话，建议早点选好学校。有很多好的中专是有高考班的，但是学位不多，想报趁早。  
亲身经历，咱中考没考，报学校又是等快开学了才去问，结果都没啥学校还有学位，最后进了间民办中职。  
3.如果你成功进入中专，在课室里上着课，那么无论如何，恭喜你进入人生新阶段！不过不要觉得进了中专就舒服不用学习了，越垃圾的学校规矩越多还特喜欢整活。以笔者亲身经历来说，这学校能停任何课让你去搞卫生，甚至在离考试还有两三天的时候对我们上一届高考班发出“你们还是高考班，你们连卫生都搞不好你们高个屁的考”这种离谱言论并让他们停课搞卫生。  
4.在学校的时候，尽量完善自己的课后生活。有升学的打算的话可以复习文化课和专业课，特别是英语单词，如果你们地区要考英语而你比较差的话建议一开始就狠抓英语。  
5.强烈建议报技能竞赛，无论是专业竞赛还是计算机竞赛英语竞赛或者什么禁毒知识竞赛法治知识竞赛，学校没有的话就和学校申请自己代表学校去，无论如何让校领导对你形成两个印象，一是“这是个优秀的好学生”，二是“这个学生能给我学校争到荣誉”  
6.强烈建议高一就去考技能证书，尤其是广东学生。个人建议计算机证书和英语证书最好拿到一张。  
7.别觉得你的同学有多么善良，尤其是在中职学校。你的很多同学会在一年内选择退学或者被开除。高一的时候，我有个同学借了我六百多到现在都没还，后面这个学生大街上持刀抢劫路人被抓了。我们班还发生过晚自习一群人起哄上台用课室多媒体放黄色视频的事情，这种情况保证自己别被影响到就好了。在一间不怎么样的学校，很难看见希望，但是无论如何相信自己。  
8.无论第一年多么苦多么不适应，都请珍惜，第二年随着你们班上大部分学生满了16岁，有些学校会开始以“实习”的名义送学生进厂打螺丝。这个时候竞赛的好处就体现出来了，大部分学校都不会送竞赛生进厂。笔者曾经有幸体验过三个月，那三个月里每天基本上都是因为手指套破损来不及换搞到一手的血，三个月下来拿笔都拿不稳，还高个毛线考。  
9.如果你不太好运，已经进厂了，牢记一件事：实习进厂再苦至少拿到毕业证就能离开，没专业技能到社会上不走运的话这就是你以后一辈子的生活。  
10.如果打算升学，建议最晚考试前一年开始准备文化课，除非您是技能竞赛保送生。当然任何时候开始学都不晚，各省考纲不同，以笔者广东考生的经验来说学一个学期都能考得很不错了（当然那样绝对累死）。  
11.语文的话我其实觉得背那些古诗文没什么必要了，有这时间不如多记几个数学公式。时间充裕的话可以专门去记，不充裕的话那早读的时候读一下就好了，时间紧迫的话直接忽略都没问题。数学最后一道题做不出来就别纠结了，还不如去检查前面的小题，本人就是这样在考场上丢了十分😭

祝所有 2023 届中考生旗开得胜

### 5月23日 #91 盗号防范提醒

提醒：近日盗号骗子盛行，请大家注意账号安全，注意以下行为：

1.  觉得很正常的账号突然发一条“在吗”然后以“防止双向发消息限制”等理由让你加好友，大概率就是被盗号了。
2.  以各种名义让你搜索某些文字然后截图发给对方。原理：telegram 给你发的验证码里含有这些文字，搜索的时候被列了出来，然后截图截到了。
3.  莫名其妙的人给你发送文件，不要顺手点击运行了

强烈建议添加任何人为联系人时取消勾选 “Share my phone number” 选项，同时不要随意截图，需要发送截图时裁剪掉敏感信息。

### 5月24日 #92 拼多多 target sdk 观察

[https://twitter.com/oasisfeng/status/1661046351151665153?s=19](https://twitter.com/oasisfeng/status/1661046351151665153?s=19)

网上随便找了几个包看了下，play 版 6.48.0 target 31 即 Android 12，国内版 6.49.0 target 27 即 Android 8.1，国内版 6.60.0 target 29 即 Android 10。

### 5月25日 #96 器官捐献

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)  
拿到了实体卡 开心

### 5月30日 #98 转发新闻：刷机黑客团伙落网

发个新闻  
[https://j.eastday.com/m/1685165054031431](https://j.eastday.com/m/1685165054031431)

存档链接  
[https://web.archive.org/web/20230530003013/https://j.eastday.com/p/1685165054031431](https://web.archive.org/web/20230530003013/https://j.eastday.com/p/1685165054031431)

疑似相关的央视网视频报道  
[http://m.app.cctv.com/video/detail/5a400b4969334dea87d7b05b0d1fd6a8/index.shtml#0](http://m.app.cctv.com/video/detail/5a400b4969334dea87d7b05b0d1fd6a8/index.shtml#0)

央视网报道被转发至哔哩哔哩  
[https://b23.tv/YNmoZR7](https://b23.tv/YNmoZR7)

### 6月21日 #106 #107 vivo 手机需要加 qq 才能看 logcat

[https://t.me/TooruchanNews/26896](https://t.me/TooruchanNews/26896)  
[https://t.me/LetITFlyW/9983](https://t.me/LetITFlyW/9983)

留一个文章链接避免上面频道也被封： [https://juejin.cn/post/7338239261194010674](https://juejin.cn/post/7338239261194010674)

### 6月22日 #108 Android 静默升级

冷知识：从 Android 12 开始，应用可以声明 UPDATE_PACKAGES_WITHOUT_USER_ACTION 权限（是普通权限，用户无法禁止），然后调用新的 PackageInstaller.SessionParams#setRequireUserAction(int) API，来静默更新自己。无需用户确认。  
看起来这么流氓的功能为什么没被国内一众流氓软件跟进呢🤔  
猜测是要么是不知道，要么是因为 target sdk 限制：此 API 要求被安装的应用至少 target 30 （在 Android 13 及之前）或 31 （Android 14 及之后），并且未来的 Android 版本里还会继续提升这个限制。

文档： [https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams#setRequireUserAction(int)](https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams#setRequireUserAction\(int\))

PS: ~~MIUI 用户应该是不受影响，在开启 MIUI 优化的情况下，整个 PackageInstaller API 都被完全破坏，无法使用。~~ 应该已经修好了

### 6月25日 #112 Signed Condig

[https://source.android.com/docs/core/runtime/signed-config](https://source.android.com/docs/core/runtime/signed-config)  
竟然还有这种东西，我可以理解为官方后门吗？

### 6月30日 #114 分享几个 Android 的安全漏洞

（注：RCE=远程代码执行 EoP=权限提升 ID=信息泄露 DoS=拒绝服务）

CVE-2021-0693 ID 高危  
漏洞成因：Shell 应用错误把一个 provider 设置成其他 app 能访问，导致应用可以访问不应该能访问的数据。

CVE-2021-0314 EoP 高危  
漏洞成因：卸载应用的确认弹窗没有设置不能被覆盖，导致恶意应用可以自行弹出悬浮窗遮挡住关键的确认信息，让用户在不知情的情况下卸载应用。

CVE-2017-13242 ID 中危  
漏洞成因：蓝牙配对的时候，会弹出一个对话框，里面有一个选项是要不要允许配对设备访问通讯录。这个选项框包含了对端设备的名字，而这是攻击者可控的，然后攻击者可以通过在设备名字里插入换行符把关键的提示信息顶出屏幕。

CVE-2018-9432 EoP 高危  
漏洞成因：基本和上面那个一样，攻击者改设备名把关键的确认信息顶出屏幕。

CVE-2021-0691 EoP 中危  
漏洞成因：sepolicy 里多加了几行，授予了 system app 写入已安装 apk 的权限。尽管只是个中危漏洞，但它是『魔形女』漏洞链的重要一环，攻击者利用此漏洞可成功将原本数个越权任意写入文件的漏洞转化为任意代码执行。

CVE-2021-39631 ID 高危  
漏洞成因：这个漏洞就更离谱了，一个提示消息写得不够清晰，被认定为高危漏洞…… 对应补丁在这里 [https://android.googlesource.com/platform/packages/apps/Settings/+/a36d55e8f83e8bf6e50254cda04632e233598f42](https://android.googlesource.com/platform/packages/apps/Settings/+/a36d55e8f83e8bf6e50254cda04632e233598f42)

CVE-2021-0434 EoP 高危  
漏洞成因：警告信息写的不够详细。

CVE-2023-21090 DoS 高危  
漏洞成因：没有限制 app 的 uses-permission 里值的最大长度，导致可以写得非常非常长把系统给搞崩溃。

千里之堤，溃于蚁穴。

### 7月3日 #115 好孩子规训

“我想躺在一张很大很软的床上 想做个好孩子”

好孩子是什么呢

我小学时候奖状能挂满一面墙 我是好孩子吗  
我五年级开始发病逃学 我是好孩子吗  
我大概五六年级开始自学编程 每天抱着手机就为了学编程 我是好孩子吗  
我小学拿缝衣针捅进插座里电自己 拿刀划自己手腕 我是好孩子吗  
我小学有两年+初中四年（休过一年学）都几乎没去上学 连我们班任课老师都不认识我 我是好孩子吗  
我的同学在发奋图强学习文化课的时候我在惠爱看病 浪费了家里不知道多少钱 我是好孩子吗  
我连中考都不敢去参加 最后随便上了所中职 我是好孩子吗  
我害怕社交害怕到想吃烤肠拿着钱在店门口徘徊不敢进去 我是好孩子吗  
我头发前过眉侧过耳后过颈 我是好孩子吗

好孩子是什么呢  
“乖”的、“听话”的，就是好孩子吗

### 7月5日 #117 AssetManager.addAssetPath

AssetManager.addAssetPath 这个 hidden api 应该很多人都在用，提醒一下这玩意的两个坑：

1.  android 6 及之前，加载的文件夹/zip 里必须包含 AndroidManifest.xml （这个可能很多人都知道）
2.  Android 9-10，这个 api 只能加载 zip，加载文件夹的功能在一次重构中被破坏掉了。

这个故事告诉我们没事最好别用 hidden api，用这种玩意就是给自己找麻烦。

### 7月11日 #121 我的一天

（以下均为大概时间）：

04:30 突然醒了 不知道过了多久才睡着  
06:40 醒了 在床上发呆 玩手机  
08:30 到了公司开始写代码  
09:30 开始发躯体化症状  
10:30 持续不能缓解 请假回来休息 然后躺在床上不知道什么时候睡着了  
13:40 醒了 然后在床上躺着玩手机  
14:30 努力从床上下来去吃饭  
15:00 吃完饭回来在床上躺着发呆和玩手机 知道自己要干正经事就是没力气去干  
18:00 傍晚了 感觉心理状态明显好转 甚至有点想涩涩 努力逼自己干了急需的正经事情（其实也就只需要十分多钟就能干完 orz）  
19:00 从床上下来吃饭 玩手机 洗澡 玩手机  
22:30 想着应该尽量拉住自己 然后给自己下单了个智能手环 orz  
23:10 睡觉  
（然后三点半又醒了在这里打字 emmm）

### 7月11日 #122 Math.abs()

冷知识测验：在 Java 中，调用 java.lang.Math 类的 abs(int) 方法一定会返回非负数吗？  
答： `Math.abs(Integer.MIN_VALUE)` 会因为 int 不够放它的绝对值而溢出，返回 `Integer.MIN_VALUE` ，负数。

### 7月16日 #125 补充 #88

有人问“你会后悔初中没去读吗？你会后悔上一间中职学校吗？”  
其实实际上，我妈到现在都也还在不断重复“要是你初中的时候忍忍就好了”之类的观点。

我其实不后悔。我甚至觉得当时做的决定非常正确。可能说唯一有点后悔的是没选到一间比较好的中职学校，进厂打了几个月螺丝。

一方面，我厌学，另一方面，初中阶段很多孩子开始进入青春期，一堆小孩完全不知道自己在干什么，把霸凌当玩笑。再后面大家都为了升学努力，待在这种环境里只会让我心理状况更加恶化。  
我自知我的人格是缺损的。所以我甚至很感激 gap 的那几年，我能尝试去把残破的人格补全。那几年里我脱离让我恐惧的学校环境，不用再为“又在学校发病又要麻烦老师把我送回家”这种事情内疚，我可以一点一点学习如何正确和别人相处，还能静心研究自己喜欢的事情。后面到了中职，虽然还是非常非常害怕，但是它至少是个比较轻松的低压环境，我可以尝试去融入它，我可以犯错。  
到现在三年中职读完，从第一次住宿舍到一个人跑几百公里去陌生城市实习，感觉真的是个奇迹。虽然现在情况还是不太好，但至少有独立活着的机会了。  
所以，如果你刚刚参加完中考，打算读中职的话，不用失望，好好读下去就好了。至于学历，中职学校也是可以升学的，况且如果活不下去，在意学历有啥用？

顺便放首歌： [https://www.bilibili.com/video/BV1N64y1B7NZ](https://www.bilibili.com/video/BV1N64y1B7NZ)

### 7月22日 #130 记录第一次向 Google 报告安全漏洞的过程

1.  打开 [https://bughunters.google.com](https://bughunters.google.com/) 注册账号，可以阅读里面的 Rules 了解哪些问题会被认定为安全漏洞。还有就是，提交安全问题的报告或者补丁，满足漏洞奖励计划（VRP）的话，是有可能会奖钱的！！一般来说，漏洞本身的影响越大、提交的报告质量越高，获得的赏金也就会越多。所以初次提交建议仔细阅读 Rules 里的内容。
    
2.  确定发现的问题是安全漏洞之后，就可以进入 Report 页面选择要报告漏洞的影响范围（原文是 “report types”，翻译为 “报告类型” 感觉并不对，不知道怎么翻译才好）。我发现的漏洞位于 AOSP 内，影响 Android 操作系统，所以我选择了 Report a security vulnerability in a Google-owned product 然后点击 Report。
    
3.  然后它会让你填写你的名字和联系方式，然后会让你写要报告的问题的简要描述（会被当作 Issue 的标题），该漏洞位于哪个地方（我这里是 Android 直接在下拉框里选择 Android 就好了），然后是详细描述你的问题，越详细越好，最好把详细漏洞点和成因都写出来，可以上传一个不超过 50MB 的文件（大家一般都是上传 PoC 之类的吧，我是传了个演示视频）来辅助说明。然后点击确认，它就会在 Google 的内部 Issue Tracker 里为你创建一个对应的 Issue。这个 issue 默认是被保护的，只有你和被指定的 Google 员工可以查看。对了，一个很好的点是，你不一定要用英文！Google 有来自全球不同地区的员工，用你的母语沟通基本上是没问题的！
    
4.  我是 6.28 提交的漏洞报告，6.29 这个报告就被 triaged 了，给我定的 Priority P2 + Severity S2，然后会有人让你确认有没有签 Google 的 CLA ，还会问你你打算怎么被感谢（我的理解就是怎么在 Android Security Acknowledgements 那个页面的 Researchers 一栏上写你的信息吧，至少我是这样理解然后按这样回复的），然后也会提醒你上传 PoC 之类的。
    
5.  6.30 我回复了之后，7.13 获得了这样的回复：
    

> Thank you for your submission. This vulnerability has been rated as Moderate severity with Medium Quality and unfortunately does not meet our bar for reward. We will pass this report to a feature team for remediation and will be closing this report and not providing further updates. Thank you for working with the Android Vulnerability Reward Program!

中等质量和没有赏金是意料之中的，毕竟没花时间去详细研究导致报告里的信息不够详细；至于漏洞严重性我一开始评估的是 High 高危，可能是满足了分级调节方式给我降到了 Moderate 中危，其实有点失望，不过也在意料之中。  
我当时想着中危应该也会给 CVE 编号吧，看往年的页面说不定也有致谢信息，然后发现了这条：

> Additionally, starting May 15th, 2023, Android will no longer assign Common Vulnerabilities and Exposures (CVEs) to most moderate severity issues. CVEs will continue to be assigned to critical and high severity vulnerabilities.

得，连 CVE ID 都没了，再也不相信信息安全了

### 8月30日 #143 Magisk v26.2 regression

~~不建议 更新 Magisk v26.2 （准确来说是 26106 及之后所有的版本一直到最新的 26202），建议等待已知问题都被修复后再尝鲜~~  
花式爆炸

Edit: v26.3 应该把所有 bug 修好了，吧？

想知道详情的可以点击下面几个链接  
[https://github.com/topjohnwu/Magisk/commit/de00f1d5a94b83ad7bf49b0bdffab310e58db471](https://github.com/topjohnwu/Magisk/commit/de00f1d5a94b83ad7bf49b0bdffab310e58db471)  
[https://github.com/topjohnwu/Magisk/issues/7214](https://github.com/topjohnwu/Magisk/issues/7214)  
[https://github.com/topjohnwu/Magisk/issues/7264](https://github.com/topjohnwu/Magisk/issues/7264)  
[https://github.com/topjohnwu/Magisk/issues/7274](https://github.com/topjohnwu/Magisk/issues/7274)

所以为什么这种问题只到发版的时候才能发现啊，根本没人用 canary 是吧

### 9月12日 #145 #146 中职发的书

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)  
翻到了这本神书 是我读中职的时候学校发的  
中职教育到底搞的咋样 看看应该就懂了（

### 10月21日 #171 期望

我妹是 2017 年出生的，我比她大 13 岁，那个时候已经是初中生，我们这边的儿童游乐园大人陪小孩进去大人是不收钱的，然后你就能看见我打着照顾我妹的旗号在海洋球池里不停扔球而我妹安安静静坐在旁边的景象。  
很多人看见大孩子玩这种东西应该都会奇怪，因为他们觉得大孩子应该坐在学校里上课或者就算玩游戏也不该玩这种婴幼儿玩的东西。这其实是人对他人的一种“期望”。  
人从小到大都活在“期望”里。我妹出生之后我们期望着她三个月会翻身六个月会坐八个月会爬一岁会站，我们每天和她说话希望她早点学会说话，她不会做幼儿园的算术题的时候我家里人会叹气说这么简单的题都不会以后怎么办。就算到爷爷奶奶这个退休的年纪我们一家也期望着他们身体健康，晚上烧一桌合胃口的饭菜。  
但是我觉得人不该只活在期望里。人生的意义不该是为了满足别人对自己的期望。  
人生的意义是啥？我觉得该是享受。  
享受啥？享受快乐。享受炎炎夏日电视机播着高糖饮料伤身而你拧开一瓶冰镇快乐水灌进嘴里，享受去吃了心心念念好久的龙虾自助发现也不是那么贵，享受你心爱的人说宝宝我爱你然后亲你一口，享受蒸鸡蛋你非要往里试试加可乐会是啥味道的瞬间，享受看见一个笑话你朋友说有他妈这么好笑吗而你笑到肚子疼，享受自己花时间写的东西有人读有人点赞，享受在网上看见有精神病在试图教你人生的意义是什么你觉得很奇特顺手转发给你的朋友。  
我们现在的教育搞的快乐像原罪一样，但是我觉得享受快乐是人与生俱来的权力。

### 10月19日 #173 碎碎念

碎碎念：突然发现一直都在提出奇奇怪怪的想法 但是大部分最后都是被别人做出来  
例子：  
native bridge 注入：最后被 Riru ZygiskOnKernelSU 采用，Magisk Zygisk 也计划改成这样实现  
MomoHider ：从 Shamiko 开始我就没怎么动过了  
resetprop 检测：一直知道有这个方法 懒得写 最后被 nullptr 先写出来加进牛头检测器了  
重写 zygisk 注入，改成监控 preload-class 并 ptrace zygote：写到一半突然就不想写然后 git reset 了 然后被 ZygiskNext 写出来用上了

该说不愧是 ISFP 吗，绝对不做没有 deadline 的事情（

### 11月12日 #174 magiskinit

写了一下 Android 启动过程中 init 这个进程的一些细节，以及 magiskinit 是怎么处理这些不同设备的  
可能是你在网上能找到的关于 2SI、 magiskinit 等鬼东西的最详细的文章

[https://blog.canyie.top/2023/11/12/android-booting-shenanigans-and-magiskinit-analysing/](https://blog.canyie.top/2023/11/12/android-booting-shenanigans-and-magiskinit-analysing/)

### 11月20日 #177 #178 奇怪的补丁

Android 14 有一项行为变更， `ActivityManager.killBackgroudProcesses()` 这个 API 不能结束其他应用的进程了，只能终止自己的后台进程  
但是查看 2023-10 安全公告会发现这个 [补丁](https://android.googlesource.com/platform/frameworks/base/+/5b7edbf2ba076b04000eb5d27101927eeb609c26) 实际上被下发到了 Android 11-13，还被授予了 CVE-2023-21266 这个编号，类型是 EoP 权限绕过，定级为高危  
之前一直想不明白为什么 Google 会把行为变更当成安全漏洞处理，直到今天突然想到，可以结束其他应用后台进程，会对 RAM 使用量造成影响，那可以判断 kill 前后的 RAM 使用量，如果出现大幅度下降说明 kill 成功，说明 kill 之前这个应用有进程在运行，相当于绕过了权限检查指定软件包是否在运行，是侧信道

信息安全，真他娘的奇妙

其实这样解释也和 Google 其他行为自相矛盾  
之前有个漏洞（ ~~具体编号忘了~~ CVE-2023-21377），是任意第三方 app 可以 inotify 其他应用的 apk 路径，对应应用启动的时候一定会 open apk 然后就会收到通知，相当于绕过了“使用记录访问权限”监听对应应用启动  
Google 给出的 [补丁](https://cs.android.com/android/_/android/platform/system/sepolicy/+/f9a774f1ae91849e1ea7d6dbbbf7b143b3617e83) 是用 sepolicy 封堵对应权限，然而“为了破坏现有 app，只对 target >= 34 的应用启用此限制”

只能理解为 Google 内部管理混乱

更新：查看了 CVE 描述，发现是能用这个玩意“绕过 play 保护”，也就是能一直杀掉 play protect 的进程。嗯，也挺离谱的……

### 12月8日 #181 小米答题

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)  
试了一下小米社区的解锁答题（2023.12.07 更新的）  
嗯，非常好，题目非常有质量  
成功把我给挡在外面了

## 2024

### 1月6日 #188 resetprop 检测

公开两个检测 resetprop 的方法：

通过 setprop/getprop 等手段操作property 实际上是操作了位于 `/dev/__property__` 下的文件。按 property 各自的 SELinux Context 存储，相同的 context 分为一组，存储在一个文件内。每个文件大小为固定的 128KB。需要使用的 prop_bt prop_info 等对象由一个线性内存分配器实现，每次分配内存时只是简单地 bump 地址，不支持释放内存。  
更多细节可以查看 [https://blog.canyie.top/2022/04/09/property-implementation-and-isolation/](https://blog.canyie.top/2022/04/09/property-implementation-and-isolation/)

Magisk 的 resetprop 在删除 property 时，会将 prop_bt 中指向 prop_info 的引用置空，然后清空整个 prop_info 的内存。问题就发生在这里，prop_info 的内存被清空但并没有被释放，这就导致对应内存位置出现一片很大的空区域。通过检测这里，应用可以检测到对应属性区域有属性被删除了，进而推断出设备已经 root（因为正常情况 property 是不支持删除的）。

什么时候会发生删除操作？通过 resetprop 重置 ro 也就是只读属性时。而保存着 bootloader 锁定状态的多个 property 和保存着 native bridge 的 ro.dalvik.vm.native.bridge 还有经常被修改的设备指纹都是只读属性。也就是说，除非避免修改这些属性，否则就会被检测到，而不修改 bootloader 状态的属性又会导致里面直接存着“已解锁”，应用一样可以读到。

在 [https://github.com/topjohnwu/Magisk/commit/f41994cb52ca08856216a8da0a28ed148c833f4e](https://github.com/topjohnwu/Magisk/commit/f41994cb52ca08856216a8da0a28ed148c833f4e) 过后，作为副作用，上面的问题刚好被缓解，但还有另一个问题：

prop_info 上有一个字段叫 serial，当这个 prop_info 被更新时，serial 会自增 2。也就是说，prop 被更新的次数 = serial / 2。而对于 ro 属性，它们是只读的，正常情况根本无法被更新，因此 serial 应该始终保持为 0。也就是说，如果发现 serial 不为 0 的只读属性，就代表它被 resetprop 过。

我们调查发现已经有应用在使用这些方法检测 root，Shamiko 1.0+ 已经尽全力隐藏了相关痕迹。我知道有很多人并不愿意使用 Shamiko，而其他隐藏方案的开发者并不知道这两个检测点，也就没有办法处理它，所以我公开了。

### 1月16日 #189 三星系统漏洞

阅读以下三篇博客，可以感受三星的代码质量

[https://blog.oversecured.com/Two-weeks-of-securing-Samsung-devices-Part-1/](https://blog.oversecured.com/Two-weeks-of-securing-Samsung-devices-Part-1/)

[https://blog.oversecured.com/Two-weeks-of-securing-Samsung-devices-Part-2/](https://blog.oversecured.com/Two-weeks-of-securing-Samsung-devices-Part-2/)

[https://blog.oversecured.com/Discovering-vendor-specific-vulnerabilities-in-Android/](https://blog.oversecured.com/Discovering-vendor-specific-vulnerabilities-in-Android/)

### 2月2日 #192 Financed Device

Android 不为人知的新功能：Financed Device 的原生支持

这个功能做了很久，但是非常低调，我完全找不到文档，甚至没法确定这个功能到底做完没有，唯一能找到的只有这句话：  
A financed device is a device purchased through a creditor and typically paid back under an installment plan. The creditor has the ability to lock a financed device in case of payment default.  
（Ref: [https://cs.android.com/android/platform/superproject/+/android-14.0.0_r1:packages/modules/Permission/framework-s/java/android/app/role/RoleManager.java;l=175](https://cs.android.com/android/platform/superproject/+/android-14.0.0_r1:packages/modules/Permission/framework-s/java/android/app/role/RoleManager.java;l=175) ）

简单来说，financed device 指通过分期付款购买的设备，这个功能借用了现有 Android for Work 中设备管理（device owner）的功能，允许债权人自定义的 app 对设备施加使用限制或在逾期不付钱的情况下远程锁定设备。现有 DevicePolicyManagerService 中添加了特定的 FINANCED_DEVICE_OWNER 类型，与传统的完全受管设备（fully-managed devices）区别，限制了 financed device owner 所能执行的操作，更加安全（？）。

从设计上来看，设备第一次开机，设置向导时 DeviceLockController 向自定义的 app 授予 android.app.role.FINANCED_DEVICE_KIOSK 这个 role（Android 14+），app 通过调用新增的 DeviceLockManager API 调用 DeviceLockController 提供的服务，DeviceLockController 验证权限后利用现有设备管理的 lock task 机制锁定设备。而 financed device owner 可以直接调用 DevicePolicyManager API 管理设备。不知道为什么要分两个，可能是允许 OEM 自定义。  
以后就可以享受和 iphone 一样的，分期付款逾期不付直接被锁定手机的体验了。

注：搜索可以发现 Google 早在 2020 年就已经在 DeviceLockController 中加入了相关功能，但是并没有在系统底层添加原生支持。添加支持应该是为了方便 OEM 自定义？  
[https://www.xda-developers.com/google-device-lock-controller-banks-payments](https://www.xda-developers.com/google-device-lock-controller-banks-payments)

### 2月21日 #199 软件包可见性

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)  
Android 11 中引入的软件包可见性（package visibility， [https://developer.android.com/training/package-visibility](https://developer.android.com/training/package-visibility) ）可以过滤应用能够访问的应用列表，但实际上是鸡肋功能

一方面，该功能虽然对 PM API 及其他一些 API （如 getDefaultSmsPackage）返回的结果进行了过滤，但系统中仍然存在大量 API 允许应用违反可见性获得未知包，如 `AccessibilityManager.getEnabledAccessibilityServiceList()` 允许应用获得正在运行的无障碍服务列表，还有 Settings API 允许应用通过读取系统设置的方式获得无障碍服务列表及通知监听器列表等  
另一方面，系统中存在大量漏洞允许应用绕过软件包可见性查询指定软件包是否存在，以 CVE-2021-0975 为例，该漏洞允许攻击者通过系统抛出的异常信息中的微小差异判断软件是否已被安装。对应补丁在 [https://cs.android.com/android/\_/android/platform/frameworks/base/+/bf0d59726a0d9973f6867faedac0fe476c81fe8b](https://cs.android.com/android/_/android/platform/frameworks/base/+/bf0d59726a0d9973f6867faedac0fe476c81fe8b)  
类似的漏洞 Google 给予的评级一直都是 Moderate severity 因此只在 Android 大版本迭代时对其进行修复。这种漏洞还有多少，我简单检索了一下，仅仅只是 Android 14 中修复的有 CVE 编号的漏洞就至少有图上这些。同时，2023 年 5 月起大部分 moderate 漏洞不会再被授予 CVE 编号，被默默修复而不为人所知的漏洞又会有多少呢？

注：即使使用 HideMyApplist 这样的 Xposed 模块，也无法阻止软件通过上述方式违规获得信息。不排除未来会有软件利用这种方式绕过用户安装的 HideMyApplist 等模块获取敏感应用（如 Magisk/KernelSU manager）信息。如果想治住这些软件，稍微靠谱一点的方法是利用多用户，把它们扔一个单独的用户里。注意必须是完全用户，使用 work profile 是不行的。

### 3月16日 #202 #203 #204 #205 #206 Android 开发文档离谱错误一览

1、2：把 service 打成了 ervice，少了一个 s，而且是两个 API 的示例代码一起打错。我 debug 了三个多小时才发现！！  
[https://developer.android.com/reference/android/nfc/cardemulation/HostApduService](https://developer.android.com/reference/android/nfc/cardemulation/HostApduService)  
[https://developer.android.com/reference/android/nfc/cardemulation/OffHostApduService](https://developer.android.com/reference/android/nfc/cardemulation/OffHostApduService)

3：文档里给出的示例代码引用的 API 根本不存在，尝试编译直接报错  
[https://developer.android.com/reference/android/content/om/OverlayManagerTransaction](https://developer.android.com/reference/android/content/om/OverlayManagerTransaction)

4：一个 API，注释里写了可能返回 null，却被标记成 NonNull  
[https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/content/pm/PackageManager.java;l=7390?q=PackageManager.java](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/content/pm/PackageManager.java;l=7390?q=PackageManager.java)

5：已经被修复的一个错误，用 void 表示状态  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)

### 4月3日 #211 作用于“系统框架”的模块可以打破作用域的限制

所谓“系统框架”其实指的就是 system server 进程，其中运行着大量的关键系统服务。虽然应用的进程是由 zygote fork 出来的，但实际上每个应用进程都会先向 system server 注册自己，system server 发回应用的信息，如 apk 路径，然后应用进程继续执行。只要作用于 system server 的模块都有机会篡改这个 apk 路径，打破作用域的限制，向任意应用进程注入代码。

这就完了吗？没有。

如果被注入的应用被授予了 root 权限，那恶意模块就能以该应用作为跳板，进一步拿到 root 权限。  
那如果我一个应用都不给 root 呢？很遗憾，你的 root 管理器应用（比如 magisk 的 app）本身就有 root 权限，直接把恶意代码注入进去，就又能拿到 root 了。

强烈建议各位激活任意模块时都小心一点，尤其是当它推荐你选择“系统框架”的时候。

（PS：前几天就想发了，但是刚好碰上愚人节，容易被觉得是愚人节玩笑，所以延后几天）

### 4月12日 #214 Telegram RCE

[https://t.me/Rosmontis_Daily/4631](https://t.me/Rosmontis_Daily/4631)  
（虽然从一开始的 0-click 变成了 1-click）

从作者引用的 PR 来看，我更倾向于认为这其实是两个 bug：

1.  telegram 会在用户尝试运行文件时发出警告，但是代码里面把识别 pyzw 的字符串打错成了 pywz，使得警告没有被正确弹出，这是第一个 bug
2.  发送文件时允许发送者任意指定 mimeType 造成钓鱼攻击，这是第二个 bug

第二个 bug 可能最后被认为是预期行为，但是我个人倾向于认为是 bug。如果能找到不在白名单中的可执行文件后缀，加上这个 bug 又能再次实现 RCE。  
事实上这种『缺乏对可执行文件的正确处理』的 bug 已经不是第一次出现了，详细可以查看：  
[https://evilpan.com/2021/09/23/macos-rce/#:~:text=%E7%9C%9F%E6%AD%A3%E7%9A%84%20RCE%E3%80%82-,%E7%9C%9F%20%C2%B7%20macOS%20RCE,-%E7%BD%91%E4%B8%8A%E4%B8%8B%E8%BD%BD%E7%9A%84](https://evilpan.com/2021/09/23/macos-rce/#:~:text=%E7%9C%9F%E6%AD%A3%E7%9A%84%20RCE%E3%80%82-,%E7%9C%9F%20%C2%B7%20macOS%20RCE,-%E7%BD%91%E4%B8%8A%E4%B8%8B%E8%BD%BD%E7%9A%84)

### 4月24日 #215 Telegram 加群人机验证踩坑实录

大部分加群验证机器人都是在有人进群的时候在群里发一条消息要求完成人机验证，而不是使用 telegram 的加群审批机制，打扰正常聊天，所以之前一直使用 Telegram Watchdog。

坑点：  
1.官方实例经常掉线  
2.部分使用 telegram 内置代理的用户尝试验证时打不开验证网页。可能是 iOS 上 webview 不走 telegram 内置代理？  
3.部分用户尝试验证显示 Access denied。可能是使用的客户端版本过旧被服务器拦截，但是没有人配合测试，无法确认原因  
4.在群组内有两只 watchdog 的情况下，部分用户反馈只收到一条验证消息（而且还过不去），不清楚原因

可能还有其他坑点，但是一直没有人配合调查，结果就是每天都有几十个人申请加群却过不了验证

后来 Rose @MissRose_bot 支持了新的加群批准，大喜，以为终于能摆脱坑了，然后踩进更大的坑  
1.rose 的加群审批要开欢迎消息才能用，用户被批准进群后还会在群里再看见一条人机验证，完全失去优势  
2.没有跟 rose 说过话的用户尝试验证会提示 bot 无法主动向用户发起私聊

实在不行了，Watchdog 和 Rose 一起开吧，能用哪个用哪个，总可以了吧？  
大坑：  
1.这种情况下，被 watchdog 批准的用户会被 rose 自动禁言，还要完成 rose 在群里发的验证（然后还设置了几分钟后自动删除）。经过测试，发现即使是被管理员手动批准的人也会被禁言，6…  
2.如果之前已经被禁言，即使退群再通过 Rose 加群，进群之后仍然是禁言状态，必须再完成群里那个验证才能解除

### 6月4日 #217 CVE-2024-31318

跨频道联动： [https://t.me/real5ec1cff/194](https://t.me/real5ec1cff/194)

Android 2024 年 6 月安全补丁修复了一个由我发现并报告的漏洞 CVE-2024-31318 （漏洞补丁： [https://android.googlesource.com/platform/frameworks/base/+/b68b257d56a8600d53b4d2d06fb82aa44086a4a5](https://android.googlesource.com/platform/frameworks/base/+/b68b257d56a8600d53b4d2d06fb82aa44086a4a5) ）

回答思考题第 0 题：显然还是以 app uid 身份调用。但如果系统开发者忽略了 app 也可以调用 shell command 这一点，就可能造成安全漏洞。此漏洞本质上还是缺权限检查，不赘述。关于这一类漏洞的技术细节我会在本月博客上的安全补丁分析里说明。

那么为什么技术高超的 Google 程序员也能犯这种错误？  
通过分析提交历史，我发现这个函数以前其实是有一个权限检查的，但是在 Android 14 的一个提交 [https://cs.android.com/android/\_/android/platform/frameworks/base/+/7a8f22792e45630bff14eb8b276c7649b0d79097](https://cs.android.com/android/_/android/platform/frameworks/base/+/7a8f22792e45630bff14eb8b276c7649b0d79097) 里被人删掉了。所以这其实是一个只影响 Android 14 的漏洞（这下新版本魔人大失败了）。  
由于我不是 Google 员工，没法直接知道这个人这么做的原因，我这里只能猜测一下：可能是眼花了把这里看成已经在用 handleShellCommand 了，可能是觉得权限检查重复（Android 12 的时候这块代码在 ShellCmd 构造函数里），或者干脆就是 git 出了 bug 把这行给意外移除了，类似那个 gotofail 漏洞。

继续追踪提交历史，我发现了一个更搞笑的：2020 年，同样的系统服务，同样的 onShellCommand，曾经出现过一个一模一样的漏洞 CVE-2020-0227 [https://android.googlesource.com/platform/frameworks/base/+/84cccfe6cdbc57ee372ee1a0fea64c7a11c53766^!/#F1](https://android.googlesource.com/platform/frameworks/base/+/84cccfe6cdbc57ee372ee1a0fea64c7a11c53766%5E!/#F1) 。  
嗯，让你不写回归测试，白给赏金了这下。

时间线：  
2023.10.4 Android 14 正式发布  
2023.11.25 我注意到此漏洞  
2023.11.26 构建了 PoC 并向 Android 安全团队反馈  
2024.2.10 Google 确认此漏洞并将严重程度评级为高。对，你没看错，两个半月  
2024.5.21 Google 通知我补丁将在下个月发布，并分配 CVE-2024-31318  
2024.6.3 已经过去了 190 天，补丁终于发布

~~P.S. 从 Android 14 QPR2 开始，ActivityManagerService onShellCommand 中添加了检查，只允许 root/shell uid 调用，所以 app uid 无法再使用 am 或 cmd activity 系列命令。具体提交可见 [https://android.googlesource.com/platform/frameworks/base/+/9e0c05e36afe0109b1df0d1bc375ade722138c81^!/#F0](https://android.googlesource.com/platform/frameworks/base/+/9e0c05e36afe0109b1df0d1bc375ade722138c81%5E!/#F0) ~~~

### 6月10日 #218 系统开启 R8

[https://android.googlesource.com/platform/frameworks/base/+/1149dbb04b5a367c46bcfa5fcc0083dc2767a8eb](https://android.googlesource.com/platform/frameworks/base/+/1149dbb04b5a367c46bcfa5fcc0083dc2767a8eb)

继对 system server 及部分系统应用开启 R8、Android 15 strip libart.so 后，Google 计划对 system server 开启完全 R8 优化。预计系统模块将可能会大规模失效。为啥以前机子存储空间小的时候不在意，反而现在开始扣大小？搞不懂搞不懂  
（我自己在 Android 14 就被影响过一次了，虽然当时是 SystemUI）

给逝去的日子简单点首歌：  
[https://www.bilibili.com/video/BV13k4y1n7bd](https://www.bilibili.com/video/BV13k4y1n7bd)

### 6月14日 #221 爱哭鬼

转发自 [易然](https://one-among.us/profile/Y1Ran/) 个人频道

爱哭鬼 || 银教授

人活着这么辛苦，为什么还要活着？

是为了比一比谁更不辛苦，如果你的辛苦程度比别人低，嘻嘻，瞬间就开心了有没有？

就拿李建军来说，一场车祸，李建军失去了双腿，很辛苦了对吧？但是他的同学王褶容，失去了双亲。 每次想到这里李建军都忍不住笑出声。

如果你的人生都忍不住笑出声了，试问你还想死吗？一般都不会。

但也有人因为太辛苦而想自杀的，有一次我在天台抽烟，看到一个女孩站在天台上打算跳楼，我问：“你为什么跳楼？是感情不顺吗？”

女孩说：“女孩的心思男孩你别猜。”

如果一个女孩动不动就说“女孩的心思男孩你别猜”，那么肯定有感情问题。

我问：“你可以告诉是什么事情吗，说不定我可以帮你。”

女孩叙述了事情的经过：

就在刚才，她和男友吵架，

女孩对男孩说： “你根本不知道我在想什么！”

男孩：“你不说我怎么知道？”

女孩：“你不会猜吗？”

男孩：“那我猜猜。”

女孩：“女孩的心思男孩你别猜！”

我：然后呢？

女孩：然后他沉默。于是我就想死了，因为我最怕空气突然安静。

我：我觉得想死的应该是你男友。 他人呢？

女孩：在楼下。

我：为什么不上来？

女孩：刚跳下去。

我：那你为什么要跳呢？

女孩：我想和他双宿双飞。

我：人都死了，还想着双飞。

女孩：嘻嘻，真幽默。你有对象吗？

我：没有。

女孩：那你怎么还不去死？

我：死了也没有对象，那我为什么要去死。

女孩：也不是没有道理。

我：不过有时候的确想死。一个人久了，什么事都是自己做，就算自焚连个递打火机的人都没有，太苦了。

女孩：是的，我现在想跳楼，连个推我的人都没有。

我：要不我推你一把？

女孩：好呀！

于是我把手放在女孩腰间。

女孩咯咯咯笑了，她说：不能放这里，太痒了，我会笑的。

我：笑不好吗？可以含笑九泉。

女孩：我笑起来不好看。

我：不，你笑起来很美。

女孩：谢谢你。你真好。我男朋友从来没夸过我。

我：开心吗？

女孩：开心。现在我又不想死了。我觉得只要还能开心，就没必要死。

我叹了口气。

女孩：叹气干什么。

我：你已经死了。

女孩：什么意思？

我：三年前我在这里跳楼，跳完我就变成了鬼。

人在刚变成鬼时，并不知道自己是鬼，所以我以为自己还没死。

当时我站在天台上，看着太阳升起，突然不想死了，于是我就下楼回家。

回家后，我发现大家都看不到我，无论我跟谁说话，都没人理我。

我对着我的亲人大喊大叫，声嘶力竭，但我好像是一团空气。

那种无力感你知道吗？就是用尽所有的力气却没有任何作用。

后来我才意识到，我已经死了。

听完我的话，这个女孩继续哭。

哭了很久很久都没有停下来，也许她就是传说中的爱哭鬼吧。

这三年来，我见过很多自杀而死的鬼魂，大多数都很后悔。

活得不开心，可以换一种活法。但是死得不开心，就没法重新死了。

### 7月11日 #225 magisk.log

经常看见有人上传一份 magisk 日志就来反馈问题，然后被禁言又在那里抱怨说“我提供了日志啊”  
那就来看一下，magisk app 底栏上那个“日志”里面保存下来的到底是什么东西  
它大概包含这些玩意：  
第一部分：设备基础信息，内核版本  
第二部分：系统属性，注意这里不是 root 获取的，所以只包含 untrusted_app 有权限访问的  
第三部分：环境变量  
第四部分：app 的 mountinfo  
第五部分：magisk 自己产生的 log，即 /data/cache/magisk.log 或 /cache/magisk.log。注意，它只包含 magisk 自己主动打出来的日志，其他日志，比如崩溃日志，不会被记录下来  
第六部分：app 自己运行 logcat 读到的日志，只能读到自己 uid 产生的

接下来设想几个情况  
场景一：开不了机。很明显根本进不去 app，即使运气好有 adb，如果没有提前授权 root，也拿不到 magisk.log。就算拿到了，它只包含 magiskd 自己主动打出来的日志，不包含崩溃日志，里面几乎不会有什么有用的东西。不如一句 adb logcat 有用。  
场景二：magisk app 显示“无法获取”，即所谓的“掉 root”。这种情况有太多种原因，然而无论是哪种，由于 magisk app 自己没有 root，它能读到的东西基本上不会有什么用。不如一份 logcat 或者 bugreport 有用。  
（题外话，如果是因为 magiskd 崩溃引起的，由于它会 block 所有信号，崩溃的时候不会有任何记录，静悄悄的退出）  
场景三：zygote 崩溃太多次，触发 zygisk 自动关闭。magisk.log 不会记录崩溃日志，自然也记录不到 zygote 崩溃日志。不如 logcat 有用。  
场景四：模块工作不正常。magisk.log 只会记录自己主动产生的日志，模块自己出的问题当然和它没关系。不如一份 logcat。

很多人说日志太多了，我觉得恰恰相反，是太少了以至于它自己的问题都难以调试。感兴趣的可以看一下我 debug 这个问题的艰难过程： [https://github.com/topjohnwu/Magisk/issues/4174](https://github.com/topjohnwu/Magisk/issues/4174)

### 8月22日 #229 MagiskEoP

[https://github.com/canyie/MagiskEoP/blob/main/screen-20220302-093745.mp4](https://github.com/canyie/MagiskEoP/blob/main/screen-20220302-093745.mp4)  
Demo video for exploiting a vulnerability in Magisk that allows local app to gain root access without any confirmation or acceptance and execute arbitrary code with root privileges. It demonstrates silently obtaining root privileges and silently granting root to any app.

演示视频，利用 Magisk 中的一个漏洞静默获取 root 权限并以 root 特权执行任意代码而无需用户确认。我们同时展示了如何利用此漏洞获取 root 后向任意 app 静默授权 root。

### 8月24日 #231 补充 #229

Exploit source code and writeup is now available at [https://github.com/canyie/MagiskEoP](https://github.com/canyie/MagiskEoP)  
本来还想着要多久才能有人发现这是 app 问题的，结果当天晚上就被吴自己指出来了，没意思

### 9月3日 #239 不会开发也能挖漏洞

不会 Android 开发的人，能不能挖到 Android 系统的漏洞？

先说结论，可以，但是能挖到的漏洞类型肯定有局限

其实我觉得关键的反而不是技术实力，是能不能判断出漏洞  
很多人都觉得，系统安全漏洞这种东西，肯定很复杂，肯定都是内存破坏什么的，都是什么缓冲区溢出、释放后使用这种一听就很高大上的东西，包括我自己以前也这么以为  
其实 Android 系统很多漏洞都不是内存问题，反而有很多的 UI 层漏洞，有些问题甚至不用写代码就能触发，看你对系统的熟悉程度  
举个例子，2022 年那个价值 7 万美元的锁屏密码绕过漏洞 CVE-2022-20465，这就是纯粹的 UI 层漏洞，不用写一行代码就能触发，能在没有锁屏密码的情况下解锁设备，很明显这是漏洞，对吧？那其他看着没那么明显的东西，有没有可能也是漏洞？

今年八月有个漏洞 CVE-2024-34734，触发方式是在设备锁屏的时候下拉状态栏，里面有个“活跃的应用”，旁边有个“停止”按钮，用这种方式可以在没有密码的情况下杀掉 VPN 应用。可能看起来它不像漏洞，但是它能让没有密码的人停止掉 VPN，假如机主没有注意到 VPN 已经停止，继续使用网络，这个时候是不是就在用非预期的不安全网络？

Android 系统还有一个功能叫多用户，效果很明显，可以让多个人共用一台手机。NFC 设置里有个选项，只允许锁屏解锁之后使用 NFC，术语叫 secure nfc。假如机主打开了 secure nfc，切到访客用户然后给另一个人借用手机，这个人进设置里关掉了 secure nfc，然后切到机主用户，不输密码，是不是也能用机主的 NFC 支付了（CVE-2021-39807）？类似的还有访客用户帮你降级系统应用、添加 WIFI 网络等等。

Android 12 开始有个功能，有应用在录音或者录像的时候，状态栏右边会显示一个绿色的小点来提醒你，正式的名称叫“隐私指示器”。假如你平常用手机的时候，发现在某个应用里录音或者拍照的时候，这个指示器没出来，那你也可以去报漏洞。更进一步，这个指示器是 SystemUI 显示的，假如录音到一半 SystemUI 进程死掉了，那重启之后这个绿点还会不会显示（CVE-2024-0019）？

还有个功能叫屏幕固定，英语叫 app pinning，作用是借给别人手机的时候把手机固定在某个应用，比如借给别人打电话的时候你肯定不想让他进你支付宝里转钱。还可以设置退出这个状态时必须输入密码。那如果有办法在无密码的时候退出这个状态，也会被认为是漏洞。那假如说在这个状态下，被固定的应用被卸载了会发生什么（CVE-2020-0024）？

上面这种情况还有很多，比如如果在锁屏页面能查看隐藏起来的通知，那也算漏洞，看你的想象力够不够丰富。还可以玩排列组合，比如 Secure NFC 那个漏洞，访客用户不允许去改这个设置，那普通的第二用户应不应该去改（CVE-2023-21086）？锁屏的时候不能断开 VPN 了，那访客用户能不能断开主用户的 VPN？用屏幕固定这个功能固定了一个应用，那能不能下拉状态栏，在“活跃的应用”里停止当前应用，从而退出屏幕固定？

所以其实我认为关键点在于：1. 能不能想象到威胁场景 2. 看见一个东西能不能判断出它有没有安全风险。Android 给的漏洞赏金还是挺多的，高质量的高危漏洞报告基本上就是 7000 美刀。打个五折，不算税费，还有 3500 刀，按今天的汇率换算成人民币大概是 25000，一个月花 1000 也够花两年多了。如果真的有人对这方面感兴趣，可以关注我的博客跟频道，后续也会推送相关内容。

### 9月7日 #242 爆照

这里有一张照片但是我懒得放到博客里 自己想象吧（  
配文：  
洗完头没梳头 懒得梳  
感觉不如把头发全拨到前面扮贞子  
反正刚好也在床底下 还可以喊我床底下怎么有人

### 9月25日 #247 回复 #88

一年之后：当我在放屁  
读大学有啥用啊 还不如直接出来进厂

### 9月26日 #248 getprop hole

引用 [https://t.me/newqianzhuang/24](https://t.me/newqianzhuang/24)

> 从 Android 14 开始，普通应用将无法读取 ro.debuggable 和 ro.secure 两个系统属性\[2\]\[3\]。这对使用第三方 ROM 的隐藏魔人来说，无疑是个好消息：许多应用通过这两个属性来判断系统是否为 userdebug 或 eng 构建。

续前文，其实我们当时还发现了另一种方法在 AOSP 上绕过此限制：使用 app zygote。  
AOSP 中这个限制是使用的 SELinux 规则来做：

```
get_prop({domain -untrusted_app_all -isolated_app_all -ephemeral_app },  userdebug_or_eng_prop)
```

对 domain 授予权限，但排除 untrusted_app_all、isolated_app_all、ephemeral_app 这三个域。也就是说，这条规则会对除不可信应用外的其他所有域授予读取权限。但是实际上，app zygote 进程运行在 app_zygote 域下，而 app_zygote 并不属于上面提到的任何一个域，所以其实用 app zygote 就能直接绕过限制。  
我们给 AOSP 提了修复，很简单，直接在上面的规则里加上 -app_zygote 即可。预计应该是 Android 16 才会包含这个修复。

[https://android-review.googlesource.com/c/platform/system/sepolicy/+/3266573/5#message-be806bdae1d35ef80b7cbf5e41a0b7ea94a8aeda](https://android-review.googlesource.com/c/platform/system/sepolicy/+/3266573/5#message-be806bdae1d35ef80b7cbf5e41a0b7ea94a8aeda)

### 9月30日 #250 SDK Sandbox 分析

~~Android 15 默认开启了 Sdk Sandbox ~~~  
勘误：被文档和其他人误导了，没有默认开启，到目前 Android 16 DP1 仍然处于默认禁用状态  
官方文档： [https://developers.google.com/privacy-sandbox/private-advertising/sdk-runtime](https://developers.google.com/privacy-sandbox/private-advertising/sdk-runtime)

研究记录：

1.  代码在 packages/modules/AdServices/sdksandbox/ 下，入口点在 [https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:packages/modules/AdServices/sdksandbox/service/java/com/android/server/sdksandbox/SdkSandboxManagerService.java](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:packages/modules/AdServices/sdksandbox/service/java/com/android/server/sdksandbox/SdkSandboxManagerService.java)
2.  Sdk Sandbox 的 UID 取决于调用者的 uid，而不是大家以为的像 isolated service 那样每次都随机，具体为 uid - 10000 + 20000 [1](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:frameworks/base/core/java/android/os/Process.java;l=293-311) [2](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:frameworks/base/core/java/android/os/Process.java;l=987-1046)
3.  启动 Sandbox 进程使用的是 AMS 中新增的 startSdkSandboxService/bindSdkSandboxService 方法，所以内部其实还是走的 startService/bindService 那套 [3](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:packages/modules/AdServices/sdksandbox/service/java/com/android/server/sdksandbox/SdkSandboxServiceProviderImpl.java;l=92-111)
4.  启动 Sandbox 时会使用调用者在 `<application>` 下设置的 processName 加上后缀 \_sdk_sandbox 作为 service 的 instance name，由于 retrieveServiceLocked 会使用这个 instance name 查找 ServiceRecord，如果多个应用（这里不考虑多个应用共享进程的情况）同时调用同一个 sdk，由于进程名不同，instance name 也不同，即使该 sdk 已经有进程在运行也不会被复用 [3](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:packages/modules/AdServices/sdksandbox/service/java/com/android/server/sdksandbox/SdkSandboxServiceProviderImpl.java;l=92-111) [4](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:frameworks/base/services/core/java/com/android/server/am/ActiveServices.java;l=4760-4776)
5.  系统服务认为所有 Sdk Sandbox 的 UID 即 20000~29999 都属于系统中提供 com.android.sdksandbox.SdkSandboxService 这个 service 的 app，即 com.android.sdksandbox [5](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:frameworks/base/services/core/java/com/android/server/appop/AppOpsService.java;l=4553-4571) [6](https://cs.android.com/android/platform/superproject/+/android-15.0.0_r1:frameworks/base/services/core/java/com/android/server/pm/PackageManagerService.java;l=7082-7091)

细节还是挺有意思的，当然也有未考虑到的地方，如有错误不吝赐教。目前 Magisk 的 denylist 还没处理这种情况。

### 10月8日 #251 CVE-2024-0044

复活一个半年前就被修复的漏洞？我把三月份就应该被修复的 CVE-2024-0044 续命了半年  
PoC & writeup：  
[https://github.com/canyie/CVE-2024-0044](https://github.com/canyie/CVE-2024-0044)  
这个漏洞已知在被取证公司积极利用，不想被取证的用户建议尽快升级。看热闹不嫌事大的可以关注各取证厂商，估计很快就会说自己突破了提权技术难关之类的了。

### 10月24日 #253 无障碍出行

陪同残疾人士 乘坐东方航空航班 广州白云->上海虹桥 体验

0.  一定一定一定一定一定要让人早点到机场！！！16:30起飞的飞机，我14点到机场，然后一直没值机，就是为了等人，结果人15:35才来，给我气炸了
    
1.  虽然来得比较晚，但是提前预约了东航的无障碍服务，各项照顾还是很到位的，比如下机用无障碍登机车，机场有专人帮忙推轮椅到机场出口等
    
2.  虽然预约了东航无障碍 但是没约白云机场的无障碍…然后到现场之后临时约，无障碍登机车是没了只能爬登机梯，然后因为登机即将截止，机场小姐姐帮忙全速推轮椅终于赶上飞机，在这里给白云机场工作人员点个好评（
    
3.  提前预约东航无障碍服务会导致他们给你提前订好一个座位 然后我值机的时候想坐一起 尝试选旁边座位没成功 所以有相关需求的旅客建议提前预选好座位 虽然这次航班机组直接给免费升了超级经济舱（
    

总结：1.早点到机场 2.需要特殊服务早点预约 3.座位早点选

附1：上海地铁好几个站的无障碍电梯是在付费区外然后直接进入站台的 导致两个问题 1.进站之后想用无障碍电梯需要先找工作人员出站然后按求助按钮让工作人员给你开电梯 2.从站台坐电梯上去会直接出付费区，需要找工作人员帮忙刷卡出闸，否则系统里没有出闸记录

附2：预订酒店时应该提前确认该酒店是否无障碍友好，否则就可能像我们一样，到了酒店发现房间是复式的，分为多层，需要走楼梯才能上床，然后只能默默退房找了间汉庭住

### 10月24日 #254 #255 #256 #257 GEEKCON 2024 上海站

总体挺好的 就是这个会场有点伤眼睛  
省流：

1.  『某第三方应用市场』利用多个漏洞进行后台保活、后台弹窗、恶意发送通知、绕过权限安装应用等恶意行为，对多个手机厂商均有覆盖，甚至利用了自家 sdk 中的漏洞
2.  『某手机厂商』的系统存在应用劫持，用户点击目标应用后实际会先启动广告页面，利用用户进行广告推广获利
3.  『远程让手机爆炸』这一环节没有队伍报名，也就没有挑战
4.  『万事俱备，只欠一台车』环节由于找不到该厂商的车无法演示而放弃。我到现场才发现这标题原来是这个意思，6

### 10月27日 #258 补充 #67

[https://android.googlesource.com/platform/bionic/+/master/android-changes-for-ndk-developers.md](https://android.googlesource.com/platform/bionic/+/master/android-changes-for-ndk-developers.md)

才发现竟然有这种文档，不知道是不是我火星了。里面 Correct soname/path handling 这个问题是当年 Magisk 还支持 Android 5.0 的时候就遇到过的。

### 11月2日 #261 每天都被撑死

去食堂打饭 阿姨打的饭嫌多 平均只能吃掉一半  
去外面吃饭 吃啥都嫌多 一碗啥都不加的螺蛳粉吃完还剩一半粉  
在家天天被念叨让多吃一点  
水喝多了都嫌撑  
碰上聚餐/花钱比较多的情况更是不得了 只能本着钱都花了不能浪费的原则往嘴里塞  
然后代价就是胃疼/反胃/反酸 不敢平躺 睡不着  
到底哪里才有适合我这种饭量的人的饭啊 难道我只配一直啃包子/馒头/面包吗

### 11月5日 #277 android-platform-common-vulnerabilities

[https://blog.canyie.top/2024/11/05/android-platform-common-vulnerabilities/](https://blog.canyie.top/2024/11/05/android-platform-common-vulnerabilities/)

新博客，介绍一下挖 AOSP 漏洞的时候可以挖到哪些。  
这篇博客本身有没有用我还不知道，但是编写它让我发现了一个高危 CVE-2024-43088。谷歌在 11 月补丁中终于修复了它，也让这篇文章终于能够被大家看见。  
另：11 月补丁中修复了我的另外三个漏洞 CVE-2024-43080 CVE-2024-43081 CVE-2024-43090 ，同时修复了 LSPosed 团队其他成员报告的 CVE-2024-43093 。感兴趣的可以看看。

### 11月5日 #278 补充 #229

这个问题被分配了 CVE-2024-48336。  
这里给出一个额外提醒，就是很多 app 使用了类似的代码，但没有正确修复这个问题，比如 FoxMagiskModuleManager [1](https://github.com/Fox2Code/FoxMagiskModuleManager/blob/master/app/src/main/java/com/fox2code/mmm/utils/io/GMSProviderInstaller.java#L51) 和 KeyAttestation [2](https://github.com/vvb2060/KeyAttestation/blob/master/app/src/main/java/io/github/vvb2060/keyattestation/AppApplication.kt#L37) 。用同样的方法可以注入任意代码进受害 app，然后利用该 app 被授权的额外权限比如 root。能做的事情就很多了。  
当然你还可以搞一个什么 “密钥认证一键修复 app”然后发去小绿书（

### 11月6日 #279 Telegram 数据取证要点

1.  有效法律证据形式  
    根据 GA/T 1564-2019《法庭科学 现场勘查电子物证提取技术规范》，应对现场、屏幕进行拍照或录像，记录物证的系统时间和北京时间；对有密码保护的数据提取并保存在有唯一性编号的专用存储介质中。  
    根据《公安机关办理刑事案件电子数据取证规则》第八条，需要及时固定相关证据时，可采用打印、拍照或录像等方式。第二十三条，对公开发布的电子数据、境内远程计算机信息系统上的电子数据，可以通过网络在线提取。
    
2.  取证要点难点  
    数据解密（Android 上应用数据被 FDE/FBE 保护，开机第一次输入密码后才会解密数据），数据保持，数据防销毁
    
3.  分点解析  
    由于 Telegram 功能特性，聊天的一方可以为另一方删除聊天记录，扣押到检材后需要立刻断开网络，不要轻易重新连接网络，以免证据被远程删除；可重点关注被设置了定时删除或加密的聊天；可以通过截图、录屏等方式保存证据，对获取到的数据计算哈希值校验并留存。通过 Telegram Desktop 也可以直接导出嫌疑账号数据，但是需要注意账号新登录官方版 telegram desktop 后尝试直接导出数据会提示需要等待24小时，并且该操作会向其他登录会话发送提醒。也有其他第三方 telegram 专用取证软件可用，但一定注意提取范围不要设置过大，避免数据量过大触发服务端安全保护。  
    对于群聊数据遭到批量损毁的情况，若被控制账号有群聊管理员权限，可使用脚本导出群聊近期操作记录，如 [https://gist.github.com/avivace/4eb547067e364d416c074b68502e0136](https://gist.github.com/avivace/4eb547067e364d416c074b68502e0136)  
    根据设备类型不同，也有第三方数据提取软件可用，如针对 Android 平台的多个取证软件，这些取证工具一般使用漏洞提升权限然后读取目标应用的私有数据，常见的被利用漏洞有 CVE-2024-0044（AOSP 框架漏洞，由 Meta Red Team X 及我报告）、CVE-2024-31317（AOSP 框架漏洞，由 Meta Red Team X 报告）、CVE-2024-4610（Arm GPU 驱动漏洞，影响除高通平台外大部分平台）及部分厂商如三星自己的漏洞等。取证公司仍在持续挖掘漏洞并转化为利用，如奇安信旗下盘古石取证团队近日宣布再次突破 Android 11 - Android 14 最新安全补丁提权： [https://mp.weixin.qq.com/s/MorsW-Vx_Eb_WnqFtj_T5Q](https://mp.weixin.qq.com/s/MorsW-Vx_Eb_WnqFtj_T5Q)  
    部分设备可能存在设备管理 app 等，可能导致检材上的数据被擦除，可以使用漏洞对相关管理 app 进行禁用或无效化处理。除了传统的垂直提权漏洞，其他类型的漏洞也有可能被利用。本月 Android 安全补丁就修复了我发现的一个可使设备管理机制完全失效的漏洞 CVE-2024-43081，可能会被积极利用。  
    部分第三方系统存在额外安全保护机制，如设备闲置过指定时间后启动额外的数据保护机制如重启，应阻止设备休眠。
    

仅做备份处理，希望大家都用不到。

### 11月7日 #281 CVE-2024-40676

[https://blog.canyie.top/2024/11/07/self-changing-data-type/](https://blog.canyie.top/2024/11/07/self-changing-data-type/)

之前十月补丁分析没给出 CVE-2024-40676 这个漏洞的细节，原本以为可以安安静静当谜语人的，结果还挺多人对它挺感兴趣的，那顺便把之前分析的结果公开到博客上。准备以后抽空把之前挖的坑全填上。  
另：总感觉我的博客浏览起来比其他博客更卡，有人有同样感觉的吗？似乎该花点时间再优化下体验了

### 11月9日 #282 回忆

最近认识了很多人 感谢各位大佬的引荐 才能让我认识这么多大佬  
很多人认识我的第一句话是 “你好年轻” “还有这么年轻的研究员” 之类的  
类似的话我已经听了六七年了 但是每过一年听 都有不一样的感觉  
今年20岁了 现在更像一种怀念 怀念我真正年轻的时候  
作为一名研究员 我发现过很多漏洞 用一年时间打进了全球前二十  
但是我觉得论这些洞的巧妙程度 元反射是当之无愧的王  
提出它的那一年我14岁 初二  
没有现在这么多的知识积累 纯靠脑力 从最基本的逻辑出发 以子之矛攻子之盾 用最简单的方法击碎谷歌精心布局设下的防御  
即使它根本就不是个安全漏洞 我也觉得它是我提出过的最好最有创造力的 exp  
跟它相比 我后面写的东西挖的洞都一文不值  
“天才”描述的是一个人有极强的“跳跃式”的理解能力和创造力  
而“工匠精神”的“工匠”强调的是一个人追求技能的极致完美并付出行动去打磨它  
两者的区别是 工匠的成长过程是重复的 线性的 而天才是非线性的  
天才不需要多少知识储备就能抓住事物的本质并打破传统思维路径提出创新  
这是天赋 是上天给的 后天补不了的 也是我永远都不可能再有的  
所以“工匠精神”被传颂 被称赞 被学习 却没有人宣传“天才精神”让大家学习当天才的  
自那以后 我再没有提出过如此精巧令人惊叹的创新  
我怀念我的14岁 我怀念我没被禁锢的 真正年轻真正有活力的头脑  
14岁 2018年  
那一年 还没有疫情  
那一年 《学猫叫》火遍大街小巷  
那一年 我初二 现在大二  
那一年 没有成就 没有作品 甚至连电脑都没有 只有一颗活跃的大脑  
那一年 像是被灌输了无穷的青春活力的一年  
那一年 只能留在回忆里 永远也回不去了

### 11月13日 #283 虚伪的艺术

人类的有些反应是刻在大脑里的。

但是人们都不愿意说出来。因为说出来显得自己很不理智，不符合社会对一个成年人的期望。  
理由，或者说借口，就是这样衍生出来的。说白了就是掩饰自己的原始欲望而已。

人们嘲笑胖猫是因为胖猫抢了自己的饭碗，或者胖猫投河污染了自己的水源吗？  
人们嘲笑胖猫是因为想。  
这里胖猫只是个符号而已，什么符号？被嘲笑的符号。至于胖猫自己到底是谁干了啥已经不重要了。有瓜不吃不嘲笑就失去了这两个字的意义。  
中文互联网流行给别人名字冠上牢字辈。不知道胖猫有没有获此殊荣。

你小时候哭，家长有的时候会哄你，等你长大了再哭，家长就会教育你“大丈夫流血不流泪”。  
他们是希望你用流血代替流泪吗？他们是不耐烦你不想看你哭。  
要是小孩真的去用流血代替流泪，用自残发泄情绪，他们就会求你别这样干了让你想想你的父母。  
别问我怎么知道的。

把人类历史往前推百万年也一样。  
生活在四百万年前的南方古猿，或者现在流行叫吗喽，能繁殖延续这么久，难道是为了保护生态圈防止种族灭绝吗？  
吗喽繁殖是因为想。繁殖了它就爽。

想体验一把吗喽的原始快乐怎么办？  
有一个网上流传的方法，找个甜的橙子洗干净，去浴室，关门，开热水淋浴，直到把全身都打湿，直到浴室里充满蒸腾的水汽。  
这个时候咬一口橙子。  
品就好了，不需要全吃下去，让汁水从嘴边混着热水流下去也行的。  
没条件试的可以上 b 站搜“洗澡吃橙子”，赛博体验一下。

你看，事情就这么简单。刻在基因里的想。  
其他什么理由什么借口都只是人类文明给生物本能加上的华丽修辞。  
说好听点叫华丽，说难听点叫虚伪。

当然我也并不是什么好人。从吗喽继承过来的本能我也有呢。  
人类的行为没有原因。也不是万事都需要原因。  
生物学上的平等才是真正的平等。  
感谢生物学，感谢进化论。

不过你要追究其原因，当然也是可以的。  
从弗洛伊德的精神分析理论去看待，它可以被解释为“合理化”或者“压抑”的“防御机制”。  
再更进一层，它可能是什么神经元什么神经递质层面的反应。  
这样探究下去就无止境了。在有原因和没有原因之间反复横跳。  
可惜我不懂这么高深的知识。我也没义务去给所有人做心理治疗。

### 11月14日 #285 Pwn2Own 小米

偶然看见去年 Pwn2Own 上攻破小米 13 pro 的一个团队公开相关信息了，刚把 ppt 看完，觉得挺有意思的，不过最有意思的部分不是漏洞细节

演讲视频： [https://www.youtube.com/watch?v=B0A8F_Izmj0&ab_channel=DEFCONConference](https://www.youtube.com/watch?v=B0A8F_Izmj0&ab_channel=DEFCONConference)  
相关材料： [https://github.com/Yogehi/cve-2024-4406-xiaomi13pro-exploit-files](https://github.com/Yogehi/cve-2024-4406-xiaomi13pro-exploit-files)

省流：小米在 Pwn2Own 期间故意进行针对性干扰以阻止其产品被选手攻破，相关干扰措施仅在 Pwn2Own 期间生效，比赛结束后即被移除  
其描述的相关细节让我觉得似曾相识。扩展阅读： [https://xuanxuanblingbling.github.io/iot/2022/09/16/mi/](https://xuanxuanblingbling.github.io/iot/2022/09/16/mi/)

怎么说呢，鉴于小米产品在“各类黑客比赛上/期间”表现出“特别”突出的安全性，建议研究人员不要将小米产品作为目标

### 11月16日 #286 忆三年前进电子厂经历

（长文预警）

2021年9月至12月5日，我刚满17岁，因学校强制要求实习，我和班上大部分刚满16岁的同学一起先后在两家电子厂当普工。第一家电子厂在河源，我只待了一个多星期，后跟随学校转场到另外一间位于东莞大朗的电子厂。

这间厂是造手机的代工厂，我在流水线上干了三个月，换了三间车间，每个车间代工不同品牌手机。

可能有人不知道流水线的工作是咋样的，大概就是每个工位只负责做自己固定的任务，比如装摄像头等，装完传给下一个。所有操作都被标准化规定好，工位上还有标准作业程序（简称 SOP）。我进的厂入职还有考试，内容就是防静电操作等。我上班的厂给每个工位都配备了凳子，但是我基本上都是站着干活，因为坐着根本干不过来。然后还有 IPQC 和 FQC 负责监督你干活还有干活的质量。

流水线在工厂里叫“拉”，相应的“线长”就叫“拉长”。两班倒（除部分车间），七点四十五之前要到车间，有几率要站那里听车间主任或者拉长开会。然后八点正式开始干活。每天的任务不同，一般一条线一天要下 1000 至 2000 台手机。（这里不用“生产”是因为厂里除了组装线还有测试线、包装线以及测包线）

下班时间看你干活的速度，早上八点上班的话基本上都是晚上九点左右下班。中午和下午各有一个小时吃饭时间，但实际上还有一个叫做“连班”的东西，即下午的班跟晚上的班连着上，中间不给你休息时间也就不用想吃饭。我三个车间的工作都在拉尾所以基本上是最晚下班的，工作时间最长的一次是早上七点四十五上班，晚上十一点二十下班，而且还是连班，晚饭都没吃。休假更是不用想，宣称是单休但实际上连单休都难。中秋节放了一天假就把当周周日的休假取消补回来。其他大部分时候周日也放不了假。国庆放假三天应该是最长的假期。不过也是放过一次双休的，是因为工厂没货干不了活。

至于工资，作为一名光荣的学生工，我们光荣地在东莞这种被广州和深圳夹着的地方获得了高达 9.5 元人民币的时薪。问车间其他员工也大部分表示是 11 至 13 元左右。我知道我该得的工资肯定有一部分进了别人手上。第一个月发了2800，第二个月发了3800，第三个月3500，12月在厂里干了三个晚上给我发了58块钱（不过忘记是不是因为其他因素扣款了）。

我待过的三个车间里绝大部分都是像我这样的未成年学生工。全国各地的都有，最远的见过四川过来的。厂门口有个篮球场，接学生工过来的大巴就停在旁边的路上。我离开的前几天路过那里，都还能看见大巴车跟新来的学生。至于为什么，可能是因为学生好骗好管还不用开太多工资吧。

在厂里工作的三个月，我的感觉就是麻木。每天的生活就是宿舍-食堂-车间，没有时间也没有力气再去干别的什么事。三个月出厂的次数估计不超过十次，唯一的一次双休还因为我头晕而在床上度过。偶尔出去一次，看着厂门口的广告牌写着“诚招普工，单休，月工资6000-8000”就觉得好笑。厂的位置在东莞松山湖，离华为东莞总部只有三四公里，很接近深圳，在天上每天都能看见飞机。可是与我无关。

我到现在还记得工厂里的防静电要求，静电服、静电环、手指套、离子风机样样俱全，酒精上还印着 RoHS 标，虽然上班一个小时之后手指套基本上就破完了，然后就是手指肉去生碰机子，每天下班手指头上都是血。

厂里让我印象深刻的有两件事：  
1.12月3号我干活的时候对面工位的同事在纸上给我写了一个 qq 号，但是我在干活暂时没理他，他就把纸条扔进了垃圾桶。我胆小，没敢说话，原本想着4号还能再问问的，结果因为我们学校的学生全部5号走，整个车间4号直接停了。我没能看见他给我留的 qq 号，没能知道他的名字，也再不会有机会见他一面或者跟他聊天了。我其实还记得当年几个拉长还有几个同事的名字，但我这辈子应该也没有机会再见一次他们了。  
2.某次我跟其他几个人一起干 MMI 测试，我旁边是个看起来比我还小的小姑娘，她问我为什么有台机子重测了几遍都测不过，我看了一眼上面显示 fingerprint sensor fail 之类的英文，跟她说打个不良标放着，报表上记个不良品，指纹传感器有问题。然后她特别惊奇地跟我说，你看得懂英文？你看得懂英文为什么会在这里？那一瞬间我的心里五味杂陈。

那三个月我甚至不知道我是怎么活下来的。说不定是每天干活能流血感受疼痛还能让我保持点清醒吧，毕竟我现在也经常自残看血流出来，哈哈哈。可能得归功于 lsp 群群友愿意陪我聊天吧。不过也物是人非。当年和我聊天的人里很多都销号了，我还记得的人里有个被某些自命清高的高雅人士逼退网了，有个因为癌症离世了。

三年过去，我也换身份了，从电子厂员工变回学生再变成 framework 开发者再变成安全研究员。我收到第一笔漏洞奖金的时候第一感觉是惊讶，然后就是在想，卧槽钱原来这么好赚，那我之前的日子，尤其是在电子厂那三个月，是不是都活到狗身上了。我是个小县城长大的孩子，不开玩笑地说，那笔钱直接改变了我对钱的认知。到后面我以世界顶级研究员的身份受邀跟其他大佬见面，见到了之前我代工过的某手机品牌的公司的技术大佬。我特别戏谑地跟他们说，你知道吗，我给你们造过手机，然后解释原因。我们聊天的时候都是笑着的。  
三年前，17岁的我是你们品牌代工厂流水线上的一个月工资3000的学生工。三年后，20岁的我用自己的努力和实力以受邀者的身份出现在这里，至少在这张桌子上，我和你们平起平坐。  
我怎么活过来的，只有我知道。

### 11月16日 #287 #288 #289 补充 #286

哦对了，忘了提一点，当年我是拒了阿里的内推选择跟着学校去电子厂实习的。至于原因，家里人觉得杭州太远，不如跟着学校还安全点。  
为电子厂拒阿里，这事我特么能吹一辈子。

我的感想就是人应该多去看看世界的另一部分人是怎么样的，增长下自己的见识。别像我一样在上海世贸大厦底下看着电梯要刷卡才能进去选择在一楼转圈消磨时间，转了几分钟才知道是要找人帮忙刷卡。

然后我去高德上搜了一下那个厂的评价，看起来没变多少。我当时住的是六人间改的八人间，据说厂里在建新宿舍，到时候住宿环境会更好。但是看今年的评论，似乎变成十二人间了。

### 11月18日 #290 OnePlus 可用性警告

据报告部分一加设备升级到 Android 15 后出现无法使用 Termux 的情况，相关进程被不明原因杀死。Termux 开发者表示禁用 phantom process killer 后问题仍然存在。有用户报告此问题影响 Magisk 导致无法在 Magisk app 内修补镜像。部分受影响设备安装最新的 ColorOS 更新后问题消失，但似乎仍有部分受影响设备尚未收到更新。  
建议一加用户若收到 Android 15 更新且构建日期早于 2024 年 11 月 9 日，谨慎选择安装。若您已受该问题影响，请等待厂商发布更新。

参考：  
[https://old.reddit.com/r/termux/comments/1gks9mf/announcement_termux_broken_on_android_15_for/](https://old.reddit.com/r/termux/comments/1gks9mf/announcement_termux_broken_on_android_15_for/)  
[https://github.com/termux/termux-app/issues/4219](https://github.com/termux/termux-app/issues/4219)  
[https://github.com/topjohnwu/Magisk/issues/8553](https://github.com/topjohnwu/Magisk/issues/8553)

### 11月20日 #291 #292 #293 #294 #295 Android 16 第一个开发者预览版已发布

版本代号为 Baklava 而非 W 开头，比往常提前了几个月。预计 2025 年将有两个大版本发布 [1](https://android-developers.googleblog.com/2024/10/android-sdk-release-update.html) 。  
这一次版本代号重新回归到了 B 开始计数，可能是因为 Android 内部开发流程发生较大变更（project trunk stable？）所致 （来源：Mishaal Rahman [2](https://www.androidauthority.com/android-16-codename-3486221/) ）。作为 project trunk stable 的重要部分，aconfig / feature launch flags 的文档已经上传至 source.android.com [3](https://source.android.com/docs/setup/build/feature-flagging) 。

简单刷上去试了一下，感觉 UI 更丑了，有一种没事强行整强调背景色的感觉…… 放了亮色和暗色模式的截图，感兴趣的可以看一下。  
系统设置项被重新排列，把 Google 账户放到了第一位，About phone 被放到了中间，Accessibility 跟 Tips & support 放到了最底下…… 感觉让残疾人更难操作了。  
Pixel 6 系内核从 5.10 升到了 6.1 好评，其他没感觉到什么大的变更，简单跑了一下梦境，一行代码不用改直接跑通，估计没啥大更改（也有可能是都没开？不过不太可能）

### 11月27日 #301 #302 为什么不拜阎王

中国很多家庭会在家里供奉神明或者仙人，拜佛烧香。拜文曲星或者观音菩萨的多见，但是好像很少看见有人拜阎王的。可能是觉得跟死亡沾边不吉利，但是清明节去上坟烧香的又不少。另一种解释是拜佛上香火是为了向神明表明自己的虔诚以祈求庇护，而阎王的形象让人感觉拜了也不会得到庇护。民间流传的阎罗王殿贴着的对联有多个不同版本，在这里挑几副供大家欣赏：

“上联：阳世人间，为非作歹任凭你；  
下联：阴曹地府，古往今来放过谁？  
横批：正要抓你”

“上联：能耐再大，到这里休得施展；  
下联：冤深似海，非此处哪能分明？  
横批：你可来了”

传说十殿阎罗的第五位是大名鼎鼎的铁面无私包青天，从这里也可以看出人们认为阎王的形象是处罚坏人的，即“惩恶”，而像“扬善”这样的活就交给慈悲为怀的菩萨。朴素的贫苦大众相信恶人无论在阳世间多有钱有权，在另一个世界都会被用油锅烙铁案板屠刀各种刑罚好好对待。但是拜铁面无私的执法者并不能直接给自己带来好处，有限的香火不如供奉其他神明。大家心里是希望好人得到好报而坏人得到坏报的，但在两者之间权衡，似乎让自己得到好处更优先。如果负责“扬善”的神明只需要人用香火去供奉就会给那人以好处，那这“扬”的，还是“善”吗？这样看来，负责“惩恶”的神明又显得有点可怜了。

以上文字写于某位友人离世一周年之际。终于赶在凌晨零点之前发出来了。其实我还想设定时消息，但是 telegram 定时消息有很大延迟。

写到一半才想起来，刚好昨天也是另一位熟人离世一周年。之所以说是熟人，是因为我和她直接接触很少。但她关注了我的某个频道，所以我记着。我也经常偷偷的去看她的频道，但是没关注。

传说中的阎罗王是绝对公平绝对正义的吧，我希望是这样。

我常幻想没有我的日子里，或者说我还不存在和我不会再存在的日子里，的故事。我作为看客，静静地看着斗转星移春去秋来。但我恐怕很害怕看见幸福结尾。我仍想抓住世间事物的一点点痕迹，但我只能看着没续费的博客随着时间的推移不再可以访问，看着太久没登录的账号被注销。看着人来，目送人远去。只是目送。

### 12月27日 #303 成长

一直有人想知道我的“成长路径”是啥样的 这里随便写点东西

我出生在一个广东的小县城，简单来说就是穷地方，gdp 在全省是倒数的。小时候就对计算机很感兴趣，四年级的时候学校开了电脑兴趣班，本来因为是教编程就报了，去了之后才发现是教用 flash 画画。四年级的时候身体经常不舒服，后来才知道这个叫躯体化症状，五年级的时候更严重了，从那个时候开始就很少去上学了，初中休学一年但是复学之后也没怎么上学，一直到我上中专。所以我在义务教育阶段有五六年的时间都是没正常上学的。这就是我为什么没参加中考。

除了去看病（包括住院）之外，剩下的时间我一般就是在家待着。我本来就对游戏没什么兴趣（事实上我到现在都没玩过什么流行游戏，什么王者荣耀什么吃鸡我都没玩过），在家待着也挺无聊的，干脆学一下自己一直很感兴趣的做软件（后面才知道有个术语叫编程）。

那个时候我只有一台手机，我还记得型号，是酷派的 Y80d，安卓4.4，家里人只有每天下午到晚上会给我手机，没有电脑。在网上闲逛的时候发现了一个叫做 iapp 的软件，那个时候还是 1.x 的版本，能自己在手机编个小软件出来，然后就喜欢上了，开始学。它支持可视化设计 app 的界面，可以直接点点点然后就可以拖一个按钮出来，用的是自己发明的一个脚本语言，难度不大，语法非常奇怪，但是有判断循环这种简单结构，然后我就这样打包出了第一个 app，然后我发出去别人就能直接安装使用了。我第一次发现原来做个软件这么简单，说真的它很大程度上激发了我的热情，然后我就开始玩了起来。那个时候我最不缺的就是时间。你问我为什么不去学易语言？因为我没电脑。

后面想学点正经的，学了点 js 跟 lua，现在已经完全忘光了，后面觉得还是学 java 好。正好手机上也有个能用 java 编 android app 的软件，叫 aide，然后就学起来了。说实话我不是个聪明的孩子，我当年学 java 耗费了很长的时间，难以理解类跟对象的概念以及它到底有什么用。后面我选择不看什么入门教程了，直接去贴吧找了个简单的项目打开硬生生啃，我也忘记了多久，突然就像开窍了一样，然后算是终于过了 java 这关，然后进入真正的 android app 开发环节。

然后后面我又写腻了，我不知道该写什么项目玩，看着各位大神博客都是分析系统源码，看起来好像也不难的样子，那就开始看这块吧，想到什么地方看什么地方。我英语不好，但是官方的 api 文档都是英文的，很多时候去看文档不开翻译器看不懂，干脆直接去看系统源码，有些时候反而还容易理解一些。那个时候 android 很火的技术就是插件化，热修复，kotlin 什么的，kotlin 我在手机上玩不了，就从其他两项入手自己玩玩。

然后我还是不知道干啥，我觉得自己基础的都会了，但是自己搓的东西跟别人开源的库根本比不了。客户端技术实在是变化太快了，后面流行什么 databinding，还有 ReactNative 跨平台这些，我只有个手机根本就没法玩。（这里加一句，当年写跨平台的公众号现在都开始发鸿蒙开发了，可见当年跨平台搞得到底怎么样。）我那个时候很浮躁，很想搞点大名堂，像 weishu 的 VirtualXposed 那样，但是又不知道干啥。一直到后面 android 9.0 测试版，引入了 hidden api 限制，对我个玩插件化的人来说简直是晴天霹雳，然后赶快去网上搜相关文章。刚好 weishu 也发了个博客，分析 art 源码去绕过，看完之后觉得其实也没那么难，然后自己也提成了两个绕过方法，但是只有一台安卓5.1的手机没法测试，后面还是去找了个群友才验证成功。

上面的经历让我敢于尝试去搞搞 art 相关的，看 weishu 的 VirtualXposed 搞得那么厉害，我也想搞一个玩玩。非常感谢 weishu 以及 YAHFA、SandHook、FastHook 的作者，你们的文章带领我进入了 art 的世界。后面我终于有了一台能跑 android studio 的电脑，终于可以写 c++ 了，然后就边写边在模拟器上测试，终于整出来一个勉强能用的东西，我管这个项目叫梦境。

后面在某个群里碰到了一位老板找人付费写代码，我接了下来，几十分钟写完拿了1000块的报酬。这是我自认为的真正意义上的第一桶金，我拿着这笔钱找我妈说我想买个二手手机（我钱在 qq 上，没银行卡转不去其他地方），然后在淘宝买了个华强北 pixel 3，终于把那部装不了微信的手机换了下来。这是我真正的靠自己买到的第一个想要的东西。我都还记得我第一次摸到 Google 亲儿子，第一次看见运行原生安卓的手机，第一次见到 type c 充电口，用卖家送的充电线充电的兴奋感。

到了中考，班主任问我去不去，我选择直接放弃报名。我的义务教育阶段结束了。但是我家很想让我继续读书，上个电大也行，去找县里的中职被拒了，最后联系到一家市里的民办中职。那个暑假我在网上查什么是中等职业学校，搜到了中职生也是有自己的升学渠道的，突然我就又想升上来大学看看究竟是什么样的了。我第一次去市里上学，第一次吃食堂，第一次住集体宿舍。可能因为课程比较简单压力很小，我竟然能坚持上这个学，竟然真的为了升学准备文化课。我的上学生活又开始了。那个时候还在开发 EdXposed 的西大师和 ksm 找到我讨论 art 相关的问题，后面他们创立了 LSPosed，把我也拉进去了。

后面就是无聊的日常。中专二年级学校强制要求送人进厂实习，在电子厂打工真的是个折磨，我想做点自己喜欢的东西，然后我开始给 magisk 提交 pr。然后折腾折腾就变成了 collaborator。

从电子厂回来之后就是上学，考完高职高考之后学校又想送我进厂，我直接玩消失。去了个小公司搞 android framework，也是变成自己小时候梦寐以求的系统开发工程师了。到开学的时候了，踏进了大学的校门，我变成了一个本科在读生。

在学校里就没经济来源了，我想经济独立。想起来搞之前上班的时候发现过漏洞，也开始无聊翻源码希望有收获。一开始我只是翻着无聊玩的，结果后面发现他们给的实在是太多了，就开始投入更多时间精力搞这块。一年下来也算有点收获，在全球的排行榜上排个前十几，不算亏。

这就是故事的全部。你可以发现我对未来没什么计划。我不是一个聪明的孩子，我要是聪明的话就学 OI 打比赛去了，感谢上天愿意赐我一条生路。我也不是一个擅长预测风口的人，电商网购直播短视频等等风口我一个都没预料到，我做事纯凭兴趣，小时候看着 kingroot 觉得很厉害也想搞的小孩也不会想到长大之后是这样。现在回过头来看，我可能应该开个公众号，把人引流过去，然后接广告或者开知识星球来变现，再或者去视频平台投个《20岁谷歌认证世界顶级研究员的一天是什么样的》给自己出道。不过我最后还是没干就是了。

然后我随便总结了点经验：  
0\. 有些东西没想象中那么难 不试试怎么知道

1.  很多技术或者知识不迎合市场或者太过高深很难赚到钱，该放弃就放弃
2.  我很认同“知识改变命运”但是反对把它曲解成“读书改变命运”或者“接受义务教育就能改变命运”
3.  我知道这个频道有很多无法取得足够学历的人关注 我想说 人生不只有一种活法 虽然我知道这种人生经历难以被复刻
4.  不用尝试预测未来 谁都不知道未来会怎么样 如果我当年有电脑的话很可能根本就不会碰 android
5.  我个人觉得“想”要比“做”重要 早期在缺乏调试能力的环境里硬啃源码的经历让我更习惯在脑子里思考 导致我看的代码比自己写的要多得多 一定程度上也算给后来搞安全打下了点基础
6.  累了就休息 不用强迫自己累了还干不喜欢的事 可能人只有放下了别人对自己的期待才能找到属于自己的平静
7.  身体老是不舒服记得想想精神科的原因

## 2025

### 1月1日 #307 #308 #309 #310 #311 #312 #313 去年干了什么

2025 了，首先祝大家新年快乐哈  
今年发生了挺多事情的，感觉脑袋快烧了，感谢大家一年的陪伴  
上学是真没意思，要干的活还多  
今年抽了点课外时间花在 android 安全上，做了一点点微薄的贡献，现在勉强在 Android Program 排行榜上排了个第 10 名，整个 Google BugHunters 平台第 55 名。今年 3 月之前排名还是 N/A，感谢各位大佬的谦让哈，让我这种无名小卒也能参与这种大项目  
本来今天想把 2024 年度排名一起发出来的，结果到现在都还没刷新下来，等它出来了再发吧  
我心里知道我跟真正的大佬还是没法比，Chrome VRP 一给就是三万刀五万刀，我个只玩 Android VRP 的怎么比，没办法  
今年十二月的 swag 也没拿到  
我不会忘记我的出身，也感谢大家这一年的支持，学到很多，感谢给我这个机会去给一个操作系统安全添砖加瓦  
郭德纲有句话很有名，“江山父老能容我，不使人间造孽钱”，我想在后面加一句，“心中自有青天在，愿行千山不染尘”  
再次感谢大家支持哈，要滚回去复习了，考试快挂了

P.S. 这段文字是提前写好的，本来想留时间出来复习的，真的到元旦了发现自己一点都不想碰学校课程。新的一年第一天请大家吃预制菜寓意一年遇见智慧的人（

### 1月20日 #316 一个新鲜的 parcel mismatch

[https://android.googlesource.com/platform/frameworks/base/+/2ce74e2d84777657f11b5cbabc501e6d79c86337](https://android.googlesource.com/platform/frameworks/base/+/2ce74e2d84777657f11b5cbabc501e6d79c86337)  
翻了一下连 15 都没进  
估计最多活了一个测试版  
没啥用 发出来给大家乐呵乐呵  
昔日 Mismatch 今犹在，不见当年 PDD

### 1月28日 #318 对今天是除夕这件事完全没有实感

看着换对联，贴福字，摆灶神，搞卫生，心里没有一点波澜，手机上 app 的红色新年活动页面也懒得点开，还记得很久以前花一堆时间刷 qq 红包跟支付宝集五福，现在只觉得闹心，还不如去领红包封面  
下午出去街上逛了一圈，虽然有点心理预期（县城人过年一般晚上才出来散步），冷清程度让我怀疑是不是回到了2020年疫情封城那个时候，紧闭的商铺大门，偶尔能看见贴着福字，旁边一个满满的垃圾桶，最顶上的是刚撕下来的福字对联，偶尔从遥远处传来一两声烟花爆竹爆炸的声音，对比出一种荒谬感，跟小时候记忆里的景象没有一点关联  
可能长大了感觉不同吧，小时候期盼家人团聚，现在只觉得团聚了也是听吵架没意义。看我妹也只是拿着手机刷了一天抖音，跟其他不用上学的日子没有任何不同。  
今年这节日不如改名叫 DeepSeek 节，给我的触动还不如我妹在我面前外放奶龙带来的感觉大

### 2月3日 #322 积极地浪费生命

我浪费生命 我好  
有没有人教一下怎么高效、稳定、节能、可持续地浪费生命  
指开学了还能继续躺着啥也不干

### 2月5日 #323 生活小技巧

如果你有一些欠你钱不还的青少年朋友 可以这个时候试试催  
一般来说这个时候他们该收的压岁钱都收完了 而该奢侈花的钱还没来得及花出去

### 2月9日 #326 有些东西错过就没了

比如 CVE-2024-31318 这个漏洞  
刚开始知道评了 high severity 的时候还挺开心的 那个时候是纯小白  
结果后面才知道类似洞可以评 critical  
（CVE-2024-31320 给了 critical）  
然后过了一年之后才又有勉强能摸着 critical 边的洞 CVE-2025-0100  
影响是可以用户无授权录制设备屏幕  
应该也是最开始评的 critical 满足降级规则被降成 high  
下一个不知道是什么时候了  
我还想拿 CVE-2025-0001 这种数字的 比较有纪念意义 又得等一年才能碰运气了  
（你不如拿个 114514 更有纪念意义）

### 2月11日 #328 支付宝蚂蚁森林侧信道信息泄露

原理很简单，用户通过支付宝做了特定操作之后，第二天蚂蚁森林会产生特定数值的能量球  
比如通过支付宝网购火车票会产生 136g 能量，购买电影票会产生 180g 能量，每天运动则会根据步数产生 0~296g 不等的能量  
所以可以根据好友的蚂蚁森林能量球上的数值大概猜测前一天干了什么 不过实际利用效果受各种因素限制 比如如果对方提前把能量全收了你就看不见了  
（以前用过这个方法猜测了一个没给我开放步数权限的朋友的一天运动量 别问我为啥）  
如果对隐私实在在意的 可以在支付宝蚂蚁森林设置里关掉“向好友展示能量球数值”

### 2月14日 #329 补充 #279

如果有人想知道 取证人员都能提取出什么数据的话 可以看一下这个 虽然不是真实环境  
[https://mp.weixin.qq.com/s/Mjuv81xJ1SVc0Pte-0eHQA](https://mp.weixin.qq.com/s/Mjuv81xJ1SVc0Pte-0eHQA)

搜了一下发现这家搞的有意思的东西还挺多的：

推销自己的工具，可以实现“三星、华为、OPPO、VIVO、小米、魅族、锤子、美图、360、努比亚、金立、乐视、海信、朵唯等国内外300余个品牌、数千款机型的锁屏密码破解与镜像获取。针对安卓2.0至10.0均有专业的锁屏密码绕过，权限获取(ROOT)方案、手机全盘加密及文件加密的密码绕过方案”，且不会导致“数据丢失或触发恢复出厂”  
[https://mp.weixin.qq.com/s/l2ciZrOBc8HMGu1hSgZ6DQ](https://mp.weixin.qq.com/s/l2ciZrOBc8HMGu1hSgZ6DQ)  
（这里有提到华为 FDE 机型提到权限之后可以直接导出全部数据，这个我之前也做过一点分析，可以看 [https://t.me/CanyieChannel/83](https://t.me/CanyieChannel/83) ）

OPPO 手机恢复出厂后残留数据取证  
[https://mp.weixin.qq.com/s/hJVbCmsFkWlLLtmbJGbJBw](https://mp.weixin.qq.com/s/hJVbCmsFkWlLLtmbJGbJBw)

爆破华为隐私空间密码  
[https://mp.weixin.qq.com/s/bs7nMsiWw-F753kPUxOfWg](https://mp.weixin.qq.com/s/bs7nMsiWw-F753kPUxOfWg)

其他厂商活也挺多的：

取证厂商五五安科表示自己支持“OPPO、VIVO FBE 机型绕过屏幕锁定密码提取文件系统”，“搭载部分芯片的 FBE 设备计算锁屏密码”（虽然这个在群里面发过但不妨再发一次）  
[https://mp.weixin.qq.com/s/XUpeMM7cJO7GVN0uEhNCIA](https://mp.weixin.qq.com/s/XUpeMM7cJO7GVN0uEhNCIA)

### 2月16日 #331 什么时候知道自己老了

上网冲浪的时候无意间刷到了初中时候的自己原创的笑话

### 2月21日 #332 回复 #331

老个毛线 医生让住院都让住儿少科

### 2月23日 #333 在 ART 上根据 Class 对象获取所属文件路径

```java
public static String getFileLocation(Class<?> cls) {
        try {
            Class<?> DexCache = Class.forName("java.lang.DexCache");
            Field dexCache = Class.class.getDeclaredField("dexCache");
            dexCache.setAccessible(true);
            @SuppressLint("BlockedPrivateApi")
            Field location = DexCache.getDeclaredField("location");
            location.setAccessible(true);
            return (String) location.get(dexCache.get(cls));
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }
```

需要关闭 hidden api 限制  
只在 Android 12 上测试过

### 3月15日 #337 或许在未来会有这么一天

清晨八点多，你从睡梦中自然醒来。  
这一夜你睡得很好，没有在三四点的时候睁眼望着天花板，也没有往常早晨醒来时的疲惫感。  
昨晚刚下了一场雨，植物的叶片还挂着水滴，清晨的阳光从窗外透进来，照得你浑身暖洋洋的。你知道，冬天已经过去了。  
身体传来的不是躯体化带来的疼痛或疲惫，而是少见的饥饿感。  
洗漱完出门，早餐店的叔叔阿姨早已经开始了一天的忙碌。你点了往常最爱吃的肉包，鲜嫩的肉汁在你嘴里绽放。你好久好久没有细细地品味过你最爱吃的东西了。  
眼前的世界是真实的，笼罩在眼前似有似无的黑幕已经消散，灵魂重新匹配身体，而身体又实实在在地触摸着世界，路边的红绿灯再也不会在视野里突然消失。  
你看见一片还带着露珠的叶子，翠绿的颜色，水珠反射着太阳的光芒。你感觉它焕发着生命的气息。你喜欢它。你可以没来由地喜欢一件事物。  
你突然觉得其实有些事情也没有那么难做。好像有好多事情一直放在 TODO list 里，打扫房间、跟许久不见的朋友一起逛街，或是去听曾经很喜欢的歌手的演唱会。有空可以清理一下 TODO 了，你想。  
从这一天开始，你内心的刑期悄然结束了。夜晚，你不再辗转反侧，也不会凌晨三点醒来。你开始对事物产生兴趣，重新有了自己喜欢的东西。你慢慢停掉了药物。不知道持续了多少时间的冬天自己过去了，春天自己会来。

### 3月25日 #338 爬虫

转发自 [https://t.me/cxplayworld/4481](https://t.me/cxplayworld/4481)  
如果你用 Telegram, 以防你不知道有人已经索引了所有人在公开群组和频道的发言记录了.  
打开机器人选择语言后发送 /me 命令查询, 选择菜单里的 Groups 或者 Channels 就能看到喽.

### 4月28日 #339 #340 Clash Verge Rev 本地提权漏洞

转发自 [https://t.me/qingmingjian123/295](https://t.me/qingmingjian123/295)

[https://github.com/bron1e/clash-verge-rev-privilege-escalation-poc](https://github.com/bron1e/clash-verge-rev-privilege-escalation-poc)

Clash Verge Rev默认强制安装系统服务（Clash Verge Service），并通过未授权 HTTP API /start_clash 暴露关键功能，允许本地用户提交任意 bin_path 参数，直接传递给服务进程执行，导致本地提权

影响范围：Clash Verge Rev<=v2.2.3(Windows/Linux/MacOS)

FlClash 似乎也受影响

[https://github.com/chen08209/FlClash/issues/1131](https://github.com/chen08209/FlClash/issues/1131)

### 6月6日 #343 假冒手机

据 Securelist 报道，部分电商平台上存在假冒手机，其固件内置木马，可执行各种针对性的复杂攻击，包括但不限于盗取各大平台（Telegram、Instagram、Line、Skype、Tiktok、Facebook 等）账号、使用受害者 WhatsApp 账号发送任意消息、发送任意短信、将剪贴板内加密货币钱包地址替换为攻击者的地址等。

原文链接： [https://securelist.com/triada-trojan-modules-analysis/116380/](https://securelist.com/triada-trojan-modules-analysis/116380/)  
中文翻译： [https://mp.weixin.qq.com/s/itrYPTDKwoGBQPFF4_idHA](https://mp.weixin.qq.com/s/itrYPTDKwoGBQPFF4_idHA)

那就有个很好玩的事情了，这些假机子能过 play integrity 认证吗？

### 6月7日 #344 全自动取证

[https://mp.weixin.qq.com/s/gxTkcmDtyFeZ42XkcpTeJg](https://mp.weixin.qq.com/s/gxTkcmDtyFeZ42XkcpTeJg)

AI 技术驱动的智能取证机器人，宣传称其可自动分析聊天记录并可自动标记敏感信息、智能统计涉案金额、串联证据链条等。  
已于 6 月 5 日在 BCS2025 （北京网络安全大会）网络犯罪治理论坛上首发，预计 7 月底全面上线。

### 6月12日 #345 USB 漏洞保护

为什么每次这个频道发取证相关的东西都会有一堆我看不见的转发…？关注这频道的都什么成分（

既然大家喜欢的话那就再来一个：现在的取证技术很多是利用 USB 相关的漏洞解锁设备。Android 12 开始其实支持从软件层面禁用 USB 数据信号传输（需要 HAL 支持），但是系统里并没有开关给你操作，只有手动进入 lockdown mode 或在 Advanced Protection mode 启用时锁定设备 [1](https://www.androidauthority.com/android-16-usb-data-advanced-protection-3548018/) 时会阻断 USB 连接。  
相关 API 其实是已经暴露出来了，可供设备管理应用使用 [2](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setUsbDataSignalingEnabled\(boolean\)) 。可以下载安装 TestDPC 然后使用 adb 将其配置为 device owner 或 organization-owned profile owner，之后就可以在 TestDPC 里找到 Enable USB data signaling 来手动开关它。  
警告：在部分机型上激活设备管理员可能存在风险 [3](https://iceboxdoc.catchingnow.com/Device%20Owner%20%EF%BC%88%E5%85%8D%20root%EF%BC%89%E6%A8%A1%E5%BC%8F%E8%AE%BE%E7%BD%AE) ，禁用 USB 后无法使用基于 USB 的 adb，若设备后续变砖可能严重影响救砖能力，请谨慎考虑。

### 6月17日 #348 补充 #250

疑似 Google 大手子开始云控发力，通过 Google Play 服务远程开关设备配置，手上的 Pixel 6a Android 16 已经是默认开启状态，另一台跑着 Android 14 的一加机子也是已经打开但不知道为何 global_kill_switch 是 true，实测 SDK 相关功能是能正常用的，不知道为啥

命令：

```
adb shell device_config get adservices disable_sdk_sandbox
adb shell device_config get adservices global_kill_switch
adb shell dumpsys sdk_sandbox
```

欢迎大家把自己设备的结果晒在评论区

### 6月22日 #350 #351 #352 #353 #354 #355 #356 #357 #358 #359

时隔四年再次来到东莞，感谢华为邀请，身份从流水线工人变成受邀嘉宾，终于能进来这个曾经没机会来的地方看看  
华为园区真的很漂亮，所有照片都是原图直出，既饱眼福又饱口福  
这两天东莞本来下雨的，我们一到松山湖雨就停了，连续两天都是这样，感谢天公作美让我有机会看看美景  
就是可惜华为小火车没坐到，一查才知道在溪流背坡村，三丫坡没有，看看明年能不能补上这个遗憾  
哦对了 还被人线下认出来了  
坐在椅子上旁边突然有人问“哎你是残页吧 我关注了你频道看见过你照片”  
下次再也不敢发照片了

### 7月10日 #360 #361 TapTrap

[https://taptrap.click/](https://taptrap.click/)  
利用 activity 跳转动画劫持，CVE-2021-0339 再现，只不过这次是用透明度

[https://nvd.nist.gov/vuln/detail/cve-2021-0339](https://nvd.nist.gov/vuln/detail/cve-2021-0339)  
[https://android.googlesource.com/platform/frameworks/base/+/36bcc77337814d4d36e2b10eb062ac417d91611e](https://android.googlesource.com/platform/frameworks/base/+/36bcc77337814d4d36e2b10eb062ac417d91611e)

### 7月13日 #362 补充 #362

其实我们之前也报过一个手法可以让用户误触某些按钮，之前搞了个直接恢复出厂设置清除用户所有数据的 poc 当漏洞报上去，经过了半年的审核给我 wontfix 了。  
如果有人感兴趣的话我可以发出来给大家看看（

### 7月24日 #363 没事干开始共情塑料

需要几百年才能降解，做的厚一点能重复利用很多次，但是大部分时候被使用一次就被当成垃圾扔掉了  
古代人用竹子、梅花啥的象征坚韧不屈的精神，我觉得是因为古代没有塑料，否则应该会出现一堆《咏塑料》之类的诗歌  
这么坚韧的东西却只需要几分钱几毛钱就能买到，大部分是作为一次性容器，用完就扔掉，说不定这些人类自己都不吃的东西还会进海洋里被某个幸运海洋生物吞进肚子里，然后还要因为人类的行为背上一个“污染环境”“毒害海洋生物”的骂名，真的好冤好可怜  
所以我都倾向于使用能重复利用的东西，比如选择到店吃而不是点外卖，签器官捐献+遗体捐献志愿，用过的塑料袋留着拿来套垃圾桶之类的，真的完全用不上的快递箱之类的也完全舍不得扔

### 7月31日 #366 补充 #239

CVE-2025-31229：密码可能会被大声读出  
[https://support.apple.com/en-us/124147](https://support.apple.com/en-us/124147)

### 8月3日 #370 #371 Android 诊断模式

这个功能附带一个 UI ，可以用

```
adb shell am start -n com.android.devicediagnostics/.MainActivity
```

拉起来，然后使用另一台设备通过二维码完成验证。有密钥认证担保，这才是它应该有的使用场景嘛  
文档 [https://source.android.com/docs/core/perf/trade-in-mode?hl=zh-cn#gather](https://source.android.com/docs/core/perf/trade-in-mode?hl=zh-cn#gather)

另外这个页面还支持检测屏幕坏点和触控，把工厂流水线的 MMI app 功能复制过来了？这一套组合拳是为了方便转转上门收手机吗

“搭载 Android 16（或更高版本）的设备在启动时会进入以旧换新模式。在这种模式下，您可以使用 adb 连接到设备，并可以使用命令获取设备相关信息。”

很有意思的功能，换句话说，Android 16 设备恢复出厂设置后，在没有网络连接且未完成设置向导时，会允许 adb 连接并运行受限命令。注意这种情况不需要打开开发者选项，也不需要手动授权调试。

内部实现文档： [https://cs.android.com/android/platform/superproject/main/+/main:packages/modules/adb/docs/dev/adb_tradeinmode.md](https://cs.android.com/android/platform/superproject/main/+/main:packages/modules/adb/docs/dev/adb_tradeinmode.md)

两层机制保证安全：

1.  adbd 会降权至受限的 adbd_tradeinmode 域而非 adbd 域
2.  使用正则表达式确保用户只能运行 `adb shell tradeinmode` 命令。源码： [https://cs.android.com/android/platform/superproject/main/+/main:packages/modules/adb/daemon/tradeinmode.cpp;l=86](https://cs.android.com/android/platform/superproject/main/+/main:packages/modules/adb/daemon/tradeinmode.cpp;l=86)

在该模式下，运行 `adb shell tradeinmode evaluate` 可以进入评估模式，正常使用所有 adb 命令。进入评估模式会创建 `/metadata/tradeinmode/wipe` 文件，下次开机时 init 看见有这个文件会将设备恢复出厂设置以避免任何东西残留。

### 9月4日 #375 补充 #250

Android 终于开始修复我之前发现的一批和 SDK Sandbox 这个有趣的新功能相关的漏洞，9 月补丁里修复了两个，在这里放补丁链接抛砖引玉，各位大佬有什么新的想法欢迎和我交流下，不吝赐教

CVE-2025-48524 [https://android.googlesource.com/platform/packages/modules/Wifi/+/298745e0cb23cbef631aff1977b284155384bbf0](https://android.googlesource.com/platform/packages/modules/Wifi/+/298745e0cb23cbef631aff1977b284155384bbf0)

CVE-2025-48545 [https://android.googlesource.com/platform/frameworks/base/+/66ac17909252c80b0edf7f4ae282bce4579410ad](https://android.googlesource.com/platform/frameworks/base/+/66ac17909252c80b0edf7f4ae282bce4579410ad)

### 10月8日 #384 ACE

CVE-2024-34740，本地 app 提权至 system_server  
[https://github.com/michalbednarski/AbxOverflow](https://github.com/michalbednarski/AbxOverflow)

CVE-2024-49746，本地 app 提权至 system uid  
[https://github.com/michalbednarski/ThisSeemsWrong](https://github.com/michalbednarski/ThisSeemsWrong)

CVE-2025-22441，本地 app 提权至 SystemUI（由于 PoC 使用了 WebView 因此无法注入进 Settings 等 system uid app）  
[https://github.com/michalbednarski/ResourcePoison](https://github.com/michalbednarski/ResourcePoison)

### 10月12日 #387 补充 #362 一个打地鼠游戏如何让你被自愿丢失所有数据

误触能造成的危害远不止授权设备管理员，如果误触授权无障碍，恶意应用可以立即显示悬浮窗遮盖界面、读取显示的内容并代替用户操作设备；授权录屏权限则可以立即开始录屏并启动各种聊天软件，首页显示的对话就会被包含进录屏里。  
用户当然可以立即关机并且重启到安全模式来卸载恶意应用，但是已经造成的危害无法清除。人是不可能比机器快的。我给 Google 提过这个问题，Android ID 389091354，似乎 ECM 已经开始限制 device admin 授权，但不清楚他们是否会继续采取措施（我觉得合理的解决方案是打开页面时禁用激活按钮 1 秒确保用户看见了警告不会手抖再允许激活），有权限查看的人可以点进去看看

### 10月14日 #388 安卓像素劫持攻击威胁双重认证安全

转发自 [https://t.me/zaihuapd/36486](https://t.me/zaihuapd/36486)

安全研究人员发现一种名为“像素劫持(Pixnapping)”的新型安卓攻击手段。该攻击通过恶意应用调用系统API，无需特殊权限即可读取其他应用显示的像素数据。攻击利用GPU侧信道技术，通过测量像素渲染时间推断屏幕内容，可窃取双重认证码、聊天消息等隐私信息。研究团队在谷歌Pixel 6至9和三星Galaxy S25设备上演示成功，部分设备攻击成功率超过50%。

谷歌已在9月安全公告中发布初步补丁，但研究人员称攻击改良版仍有效，预计12月将有额外修复。攻击每秒仅泄露0.6至2.1个像素，但足以威胁短期有效的2FA认证码。目前未发现实际利用案例，但突显了安卓安全机制的局限性。该技术基于2013年浏览器攻击，显示侧信道风险的持续性。

[https://www.pixnapping.com/](https://www.pixnapping.com/)

### 10月18日 #393 补充 #250

SDK Sandbox 被弃用。解决了“提权沙盒”这个问题本身

### 10月24日 #395 补充 #387

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)  
一直知道误触是黑产百试不爽的利用手段，但是事实证明各种我们没想到的攻击手段已经被他们玩出花了。  
伪装成屏幕上的头发丝骗用户去碰，我着实没想到。

### 10月26日 #406 GEEKCON

我比较关心的议题 1：快应用  
快应用只需要点一下就能用，通过恶意 deeplink 可以让灰黑产点一下就把用户的手机变成广告蛊场，用户手忙脚乱之下只会打开更多一连串的难以关闭的快应用  
议题 2：透明桌面小组件（app widget）  
恶意应用诱骗用户添加一开始看似正常的小组件，随后将其设置成透明以防止被用户发现，并利用小组件的特性实现保活、后台弹广告等一系列灰黑产行为  
我之前也注意到过小组件的滥用潜力，也报过一些相关漏洞（CVE-2024-43762），但对于 Google 认为没有“安全影响”的问题无可奈何。只能希望未来的 Android 版本能做出进一步限制。  
现场视频： [https://www.bilibili.com/video/BV19DxFzBE4L](https://www.bilibili.com/video/BV19DxFzBE4L)  
议题 3：多个厂商的 TA 实现不当，存在多种漏洞将 authtoken 暴露给不可信方，导致可被暴力破解手机 PIN 码  
同时演讲者演示了在一台刚开机还未输入过密码解锁（即处于所谓的 Before-First-Unlock，BFU 状态，data 分区还未解密）的设备上成功爆破 PIN 码  
演讲者也提到这种攻击技术可能已在被取证公司利用

### 10月30日 #434 #438 一个或许从 2014 年隐藏到现在的 bug

2025年了，activity 生命周期 api 还能出问题，离谱，难道这个功能到现在都没有任何一个人用过吗？  
[https://android-review.googlesource.com/c/platform/frameworks/base/+/3826768](https://android-review.googlesource.com/c/platform/frameworks/base/+/3826768)

奖池还在累计  
[https://android-review.googlesource.com/c/platform/frameworks/base/+/3563923](https://android-review.googlesource.com/c/platform/frameworks/base/+/3563923)

### 11月16日 #440 被规则忘记的你

前段时间跑了三次某国际银行想要开一个内地账户，跑了三次被拒了三次。在我已经有该银行香港地区需要资产门槛才能开贵宾账户的情况下。理由是我是学生，建议等我毕业工作之后再尝试。我说我现在确实是学生，但我有自己的收入来源还纳税，现在已经能养活自己了，为什么非得等到有工作了才能开？如果我毕业之后是自由职业者怎么办？银行的回复把我气笑了：“那不是相当于您这个大学白读了吗，相信自己肯定能找到工作的”。

我只感觉这个世界是如此的荒唐，死的规则把我和所有规则考虑不到的活着的人拦在门外。

被规则忘记的不仅是我。回想起陪同残疾人出行时遇到的种种不便。很多城市进行基础建设的时候就完全没有考虑到残障人士的出行需求，比如早期修建的很多地铁的无障碍电梯是直接连通站厅非付费区和站台（付费区）的，为了防止逃票这些电梯平时是关闭的，有人需要的时候由同行人拿着行李过安检，拿着交通卡去闸机刷卡但不入闸，然后呼叫工作人员打开电梯，然后下到站台乘车。如果目的地也是采用这种设计就需要反着再来一遍。这算是历史遗留问题没办法解决可以理解，但是还有很多城市道路也难以让残障人士通过，比如盲道上的石墩子，只有楼梯可通行还没有扶手的道路，还有坡度大到只能给电瓶车通过的坡。我觉得这就是纯粹的态度问题了。以我带着一个需要使用助行器的人的体验而言，遇到楼梯时我需要拿着他的助行器，然后把我的手或者肩给他当扶手，让他上去之后再把助行器放到地上让他扶。对我们而言再平常不过的道路对他们而言可能是足以致命的陷阱。可能没有经历过这些的人很难理解残障人士的出行困境，高德地图在设置里可以开启无障碍模式（可能很少人知道这个功能，其实不止高德地图，像小红书也是专门适配过无障碍浏览的，为所有付出行动优化体验的软件点赞），然后随便点个附近的目标点尝试导航，看看会收获多少次“无法避开台阶路段”的提示。所以很多时候我们宁愿选择打车。中国有约 8500 万残疾人，除去外表上看不出来的残疾类型，为什么我们日常很少见到残疾人？我想这就是一大原因。媒体报道的残疾人一般都被冠以『坚强』『乐观』这些形容词，但抛开这些与性格相关的形容词，他们不过是受限的普通人。『坚强』是我的优点，但是『不坚强』也不该成为被排除的理由。

这种困境不仅仅局限于残障人士。年老，意外受伤，推婴儿车，甚至只是拉着大行李箱，都会让一个『普通人』对无障碍设施的需求瞬间变得迫切。

多数人的幸福支撑社会的繁荣，少数人的境遇映照社会的温度。虽然我很讨厌『少数群体』这几个字，但是我拙劣的语文水平确实想不出其他的话了。很多人讨厌『少数群体』这个表述是持着“别人都行为什么就你不行”这种想法想让所有人都强行融进自己的框架里，我认为这种忽视个体差异和客观需求的想法无异于把需要时间破茧成蝶才能飞的毛毛虫放进本来就会飞的鸟群里。

最后附上去年缴税的证明，证明下我有经济能力。

### 11月18日 #443 #444

转发自 [https://t.me/androidMalware/2734](https://t.me/androidMalware/2734)  
One of top-selling digital picture frames from Amazon’s between March and April 2025 comes:

-   rooted by default
-   runs Android 6
-   SELinux security module disabled
-   downloads and executes malicious payloads from China-based servers at boot
-   17 security issues discovered  
    report: [https://go.quokka.io/hubfs/App-Intel/Technical_Uhale-Digital-Picture-Frame-Security-Assessment.pdf](https://go.quokka.io/hubfs/App-Intel/Technical_Uhale-Digital-Picture-Frame-Security-Assessment.pdf)

原来世界上还有数码相框这种设备

### 11月20日 #447 不要删掉 CompanionDeviceManager

经常在各种地方看见精简系统软件的教程或者“去除了系统中不必要组件的精简版 ROM”，这边提醒一下，我个人是不建议随意动系统组件的，即使它看起来完全没用  
举个例子，com.android.companiondevicemanager 这个 app 用来在配对配套设备（如手表）的时候弹对话框，似乎对没有外设的用户没用，但在安卓 12 及以上移除这个 app 会造成可以导致电话、联系人、短信、日历、读取通知、控制通话等多个敏感权限被自动授权给恶意软件的严重安全漏洞  
有些“教程”的理由是移除一些非必须的 app 可以减少攻击面，让其中可能存在的安全漏洞变得无法被利用。我是觉得不如买手机的时候选个代码质量好然后安全更新频繁的厂商  
话说有没有人知道是否真的有什么精简版 ROM 把 com.android.companiondevicemanager 删了？  
用户想自测的可以跑一下

```
pm path com.android.companiondevicemanager
```

看看有没有输出

### 12月22日 #463 The worst programming language of all time

[https://www.youtube.com/watch?v=7fGB-hjc2Gc](https://www.youtube.com/watch?v=7fGB-hjc2Gc)

bilibili: [https://www.bilibili.com/video/BV1xYUtB5Evr](https://www.bilibili.com/video/BV1xYUtB5Evr)

## 2026

### 1月13日 #465 来点 blackhat

感谢群友让我蹭名字  
[https://blackhat.com/asia-26/briefings/schedule/speakers.html#songzhou-shi-51645](https://blackhat.com/asia-26/briefings/schedule/speakers.html#songzhou-shi-51645)

### 1月17日 #466 打假

关于最近流传的 Android 16 0 click RCE + 反弹 root shell 的视频  
乍一看很唬人 仔细看越看越假 严重怀疑打印出来的内容是 AI 生成的  
我把几个我看见的不合理的点列出来

1.  从视频里的崩溃日志看，崩溃进程名字叫 com.android.mms，而 Android 上多媒体相关的代码一般被隔离在另一个进程如 mediaextractor， com.android.mms 的 maps 里也不可能有 libmediaextractor
2.  虽然部分崩溃栈被挡住，依稀能辨认出来被挡住的 \*\*\*\*ediaextractor.so 应为 libmediaextractor.so，但不存在名为 libmediaextractor.so 的文件，也不存在任何名字结尾跟视频中崩溃内容相符的库，正确的名字应该是 libmediaextractorservice.so
3.  崩溃栈里有 MediaExtractor.setDataSource 说明是请求解析媒体文件的进程崩溃，崩溃点在一个什么什么 parseChunk 里，不合逻辑，这种函数就算崩了也应该崩在 mediaextractor 进程里
4.  我尝试根据崩溃调用栈还原原本符号，但大多数都无法在 AOSP 里找到符合的
5.  打出来的崩溃栈 pc 一堆 1234 5678 abcd 这种顺得像乱写的东西，出现一个两个还有可能，怎么可能同时出现这么多
6.  里面还有一个什么疑似 MediaPlayerService::Client::decode 的东西，先不说这个符号根本找不到  
    就算是三星自己加的，MediaPlayerService::Client 里面也应该只有跟远端服务交互的逻辑，不应该能被不可信数据弄崩
7.  视频里面拿到 root 之后 ls / 没有 data_mirror debug_ramdisk 和 init.environ.rc

### 1月18日 #467 真正的 exp！

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAC9UExURVlZWdPT07KysmRkZIWFhfT09JmZmWZmZm9vb39/fxkZGUxMTDMzM3p6epCQkKamppubm729venp6cjIyN7e3tbW1s/Pz8LCwnx8fLS0tFZWVoiIiI+Pj6GhoeTk5Glpabu7u93d3evr66CgoJSUlKqqqsnJyeDg4Hd3d8PDw+Xl5bi4uNHR0dvb26Ojo6urq+fn51hYWDg4OCgoKHBwcK2traenp0FBQe7u7vHx8U5OTre3t8zMzHV1df///7GrnpQAAAA/dFJOU///////////////////////////////////////////////////////////////////////////////////AI4mfBcAAAUGSURBVHja7NoJb6M4GMZxY0NCD64kve/pMZ2d3Z297+X7f6zFNmBAMUXa6URl/q9UJSWPUPzrizFWRUlNLgEBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYYIEFAVhggQUWWGBBABZYYIEFFlgQgAUWWGCBBRYEYIEFFlhggQUBWGCBBRZYYEEAFlhggQUWWBCABRZYYIEFFgRggQUWWGCBBQFYYIEFFlhgQQAWWGCBBRZYEIAFFlhggQUWBGCBBRZYn6cCIcRXgvX/h9qcIVBqDdbEM8RCxGCB9QqXYRwHYDHBgwXWl8eKZKiESHI3Ba1kWs3fKixcaJUl1YyeBm7Ocq+yLItUiVBGnXxenSHJolIKEcwHq6ikbOX1YGVzQCTN8LPmSLreghUl9sN4Uw7yajMrLC0TZ1ImzqY6FEop0+pIaEN5HaoOxVuwEqFyc4I46uSlzOLqgxlh6UaR9l3VYWl9Fdoxb1Q90KJtu41pwwFW/WHhTtW8i7TafLCqRsk6bsGw63L9qurXRmuIlbT9lDQnlXU+nBFW1Q2qnZbDprWa2tjR90LZFqx1/+Td/HpGWLlrLDvIwTcx6dQ1Vrntbig68cDms3JwbA5Y1azs1ger6sNV/bbIw1jU81MvNAGrl58RVn8ozW+btF08iGFoAlYvP3csfVur1gJBEIA1uBmue5dhZDOyO2epbmgCVi8/I6x0MMHH9pjsTfBhNzQBq5uPZoQlB0uH3DZG4EZqQ26fL3sZq5uf09Ih6qw3i/pm6BZO0qZX7rrUS68Xsbr5ZE4rePMk08pk9aUZugfqppvs6AM1Acvlo/StP+6EbW06z8hJqxbYp2BZPQUnFsLsKuhQdaHqn5ewbF7KXIn0jWO5MqOQ7RaNLPtbNMmmhimj0GUmYLl8Gs0Lq4wyPbTu1l2QKqHSouzs3OlDIslW5SQsnY/NXmFplyNvEuuLV/Tau9BzwiraDUSwXmysztYWWNtL1psXeumgIrDGaqXvBfUuvtqUYI3V2t1wk1e2msFluJJm6zDJXv/fIfjPP7DAAgsssCiwwAILLLDAosACCyywwAKLAgsssMACC6zt9fDz/v75tyOB+98PD2+ORgKffjw4OP1uJPDxl+Xy8v1I4MPF3t7VNyOB4/vF4uzdzrG+39f1kz/w66Guv/yBvw90KX/gZKkr8Qf+2dOV+gNHC12/7RxrabD2/a31bLAO/a11YbAO/K21MFhLf2s9Gqw9f2vdGqzFu11jnVusE2/gxmI9eQOnFuvYG7i0WH7uK4t15w2cWazrXWP9a7H8f/bQYvm/6IPF+sF/pVssf19Ii/WH/0K2WH/uGuvEWC39gSdj9Twy+Rqri5EZx1gt/IE7Y/XoD1wbq9vd3w1PlufnD2OBp+ebm/uxwPHF6emnscDR4vLy41jg7vHq6sNY4Pr27OyYdRaLUrDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssMCiwAILLLDAAosCCyywwAILLAossMACCyywKLDAAgsssL6u+k+AAQCR9eHtLKvLfwAAAABJRU5ErkJggg==)  
如果一个视频就能卖四百万刀，那我也来发一个演示，拿 root shell + 禁用 selinux，免费公开 exp 源码，保证真实，可以自己跑一遍确认真的拿到了 root shell

```bash
#!/system/bin/sh

echo "*******************"
echo "*  by @canyie  *"
echo "*******************"

echo "[+] Exploiting ...."
sleep 1
echo "[+] Disable addr_limit ...."
sleep 1
echo "[+] Override task_struct ...."
sleep 1
echo "[+] Success!"
echo "[+] Disable SELinux..."
su -c setenforce 0
sleep 2
echo "[+] Spawning root shell..."
exec /debug_ramdisk/su -Z u:r:untrusted_app_30:s0:c81,c257,c512,c768
```

需要 magisk

### 1月20日 #469 #470 补充 #447

效果：无用户交互自动授权读写联系人、短信、日程、通话记录和语音信箱，拨打电话或接听来电，操纵通话设置，发送通知，读取并操作其他应用发送的通知，控制附近设备，录制声音，读取设备唯一标识符，和绕过后台执行限制。  
录屏： [https://github.com/canyie/CVE-2024-23700/blob/main/screen-20260120-233400-1768923180588.mp4](https://github.com/canyie/CVE-2024-23700/blob/main/screen-20260120-233400-1768923180588.mp4)  
漏洞评级（Severity）：Critical 最高/严重

PoC 代码： [https://github.com/canyie/CVE-2024-23700](https://github.com/canyie/CVE-2024-23700)

下载编译好的 apk： [https://github.com/canyie/CVE-2024-23700/releases](https://github.com/canyie/CVE-2024-23700/releases)

和视频里的版本相比优化了几个细节：  
视频里尝试提升权限时会有一闪而过的白屏，比较容易被注意到，进行了优化，让利用更隐蔽  
支持了静默自动获取录音权限，需要 Android 14+  
添加了一个拨号按钮，提权之后可以无用户交互拨打电话，确保提到的权限真的能用

提供的测试 app 在绝大部分设备上都无法安装。如果在你的设备上安装失败，是正常的，说明它目前不受影响（但是你后面又刷了其他 ROM 或者开了什么模块就不一定了）。

### 1月30日 #473 补充 #261

后续：去医院治了胃病之后好了 现在变成吃多少都吃不饱了  
跟我有一样体验（吃什么都嫌多）的人可以去医院测个幽门螺旋杆菌

### 1月30日 #474 Exploiting MediaTek’s Download Agent

[https://blog.r0rt1z2.com/posts/exploiting-mediatek-datwo/](https://blog.r0rt1z2.com/posts/exploiting-mediatek-datwo/)

### 1月31日 #475 kotlin 是一种折磨

分析/审计 kotlin 代码是一种折磨 一种灾难  
就算我哪怕知道把它分析完就能拿 $7000 USD 的漏洞奖金 我也完全提不起一丝看它的兴趣  
一个语言能设计成这种毫无设计哲学全是语法糖推崇写以后不用 review 的一次性代码的样子也是一般人做不到的  
我很想知道让写出 kotlin 一次性代码的人过几年让他自己读能不能读懂  
我丝毫不怀疑把 kotlin 代码编译完再反编译成 java 都比读原代码有可读性  
我还记得 Android 7.0 的时候 Google 宣布引进 Kotlin 作为正统 Android 开发语言时我的激动之情 那时我还在用手机写代码 期望它能解决 java 的一系列问题  
现在我拒绝 kotlin 出现在我项目里的任何地方 包括依赖和编译脚本 当年期望有多大现在失望就有多大

### 2月2日 The End

Your community 小页页的胡言乱语 was blocked for violations of the Telegram Terms of Service ([https://telegram.org/tos](https://telegram.org/tos)) based on user reports confirmed by our moderators.

Thank you! Your appeal has been successfully submitted. Our team’s supervisors will check it as soon as possible. (No more response)
