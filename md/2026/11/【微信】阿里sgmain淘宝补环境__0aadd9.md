---
title: 【微信】阿里sgmain淘宝补环境
source: https://mp.weixin.qq.com/s/afbopjmV4JPNe9dUS5v4BQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-06T11:28:13+08:00
trace_id: f215b614-b22b-44cd-baca-4444ffd711ec
content_hash: f1eac0de35d08318994a81f416fb3a8e1a7a18ce7ebbbc93a8f8c8c4a7e2ce6c
status: synced
tags:
  - 微信
  - Android逆向
  - 模拟执行
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: libsgmain.so 的补环境实操：按 10102→10101→10103→10104→70102 命令链逐一对照真机参数与返回值，最终让 70102 产出五个签名头。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41075244-d011-8192-a692-c979c9c15d5f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> libsgmain.so 的补环境实操：按 10102→10101→10103→10104→70102 命令链逐一对照真机参数与返回值，最终让 70102 产出五个签名头。
> 
> - **易翻车点：** 10101 的 11 个参数中有 3 个不能按反编译"合理"填——flags 真机传 3、数据目录是 `app_SGLib`、m24 为 1；参数表唯一正确来源是参考机抓包，填错只返回非 0（Java 侧抛 `SecException`），native 不说明具体哪个参数。
> - **JNI 补齐：** 10103/10104 返回 null 但后台线程大规模反射采集，首轮就有一百多条缺失；需用 `DUCKEMU_JNI_TRACE`/`--jni-events` 抓 `(class, name, signature, slot)` 事件逐字声明，且环境必须在 dlopen 前装好，否则 `JNI_OnLoad` 的 `FindClass` 得到的 0 无法挽回。
> - **环境细节：** 空集合与 null 语义不同（null 会跳过整段探测，空集合才继续走）；同一座桥存在两个类名（如 `DataReportJniBridge` 两个包路径），缺一个只会让线程空转重试；Context 与 PackageInfo 的 `ApplicationInfo` 必须是同一份对象图；HttpUtil、ACCS 等桥要故意失败，假装成功会让 SDK 走真机不存在的分支。
> - **IO 分类：** `ENOENT` 是真机也存在的探测回落链（预建文件反而走偏），`EEXIST` 是锁协议正常分支（每次启动需清残留 `.lock`），`EROFS` 才说明状态目录没挂对；`SG_FAST_CONFIG`、`.uf_wk`、`.uf_sw` 三个文件存在会触发 90MB APK 从尾部反向扫描（约九万次 open），首次 seed 时删除后 base.apk IO 从 9.4k 降到 16。
> - **验收标准：** "补完"的判据是 init 退出码 0、JNI missing/unsupported 为 0、EROFS 为 0、70102 返回 x-sign/x-mini-wua/x-sgext/x-gst/x-umt 五头齐全；复跑对拍需钉住随机数与时间源，AVMP VM 下单次调用超时要给到 900 秒，不能按常规时间尺度估。

**OnePanda-Sec** *2026年11月6日 10:00*

**OnePanada-Sec 招新啦**

**招新要求**

-   热爱网络安全，喜欢 CTF；
    
-   拥有 CTF 比赛经验，有较好比赛成绩的；
    
-   乐于奉献、热爱分享，愿意提升自己同时帮助他人；
    
-   时间允许参加各类赛事，服从战队管理与安排；
    
-   各类比赛获奖者、能力出众者视情况考量；
    
-   未参与其他高校联队；
    
-   大一同学视情况放宽资历要求。
    

**联系方式**

请将个人简历发送至以下邮箱：

简历邮箱：2638726415@qq.com

## 前情提要

## 这是对阿里的第一篇文章，我相信也是最简单的一篇，这篇我们来讲一下补环境和其中的小流程这篇文章我不是在开项目的时候写的，而是项目做完了，然后开始写的，今年双十一版本的淘宝，应该还是最新版在我之前做七神的时候就有大佬问过我，阿里这个和七神谁更难呢？

```javascript
libsgmain.so vs libmetasec_ml.so
```

我之前回复的是差不多，但是现在我有了更深入的体会，阿里更像是一个插件化的东西，快速接入，字节那个虽然有这种趋势但是还没做起来，字节几乎也都是在用七神做自己的防护，再说一层就是阿里更狗，字节还没到那一步吧

## 目标

要做逆向，肯定是先找目标了，对于阿里这个肯定是众所周知的 `sgmian` 和它的 `doCommandNative` 了，繁琐的加载流程，复杂的环境检测不过啊，只要功夫深铁杵磨成针，阿里这个也不例外，之前我已经用 unidbg 补了很多次了，但是都没成功，这次是真的用心去分析了，之前都是拿一堆资料直接扔给 DeepSeek 让它去补，很费劲还跑了我很多很多的 token，没什么用这次用自己的框架去用心回顾历史错误，重构代码最终得到结果

对于这个 so，各位也都耳濡目染了，没有后缀版本的是 dex 文件，会被动态加载有版本后缀的才是真正签名的 so，hook 直接从 dlopen 开始吧，然后 hook doCommandNative 函数，看它的参数都是什么，然后得到一个数字流程，就这个分析过程吧，只能慢慢摸索，现在大厂都是做一堆的 init 阶段，不同的数字会进行不同的分发，恶心的一批，这个版本的案例是

```apache
10102 -> 10101 -> 10103 -> 10104 -> 70102
```

## 流程还是相对少的，但是不影响其中复杂程度，一个一个看吧，参数->返回值对照来看，这方面工作交给 DeepSeek 也行，我是用 DeepSeek 补环境和写的框架，DeepSeek 现在真的挺牛逼的

## 流程的开始

10102

先看参数和结果分别是什么

```bash
dc id=10102 args=[Ljava.lang.Object;[3]{
"main",
"6.8.260901",
"/data/app/~~ZkuUNV2frSgeDqVY6u13sw==/com.taobao.taobao-ooDG-cQxwXBd0pNhPDtRMA==/lib/arm64/libsgmainso-6.8.260901.so"
}
   id=10102 -> java.lang.Integer=0
```

10102 并没做什么检测，跑通 so 的声明周期然后再跑通 JNI_OnLoad 后传递参数即可，使用 unidbg 的话，应该问题不大不太需要在意这方面

10101

```bash
dc id=10101 args=[Ljava.lang.Object;[11]{
	com.taobao.tao.TaobaoApplication=com.taobao.tao.TaobaoApplication@8927af1,
	java.lang.Integer=3,
"",
"/data/user/0/com.taobao.taobao/app_SGLib",
"",
"com.taobao.taobao",
"10.68.0",
"12",
"com.taobao.taobao",
	java.lang.Integer=1,
	com.alibaba.wireless.security.mainplugin.SecurityGuardMainPlugin
		= com.alibaba.wireless.security.mainplugin.SecurityGuardMainPlugin@b5b383
}
   id=10101 -> java.lang.Integer=0
```

再看 10101 的参数，这是整个流程里最容易翻车的一步，因为值几乎都藏在反编译看不出来的地方。11 个参数里有三个，只按"看起来合理"去填一定错：

-   `flags` ：反编译看起来应该是 0，真机传的是 3；
-   数据目录：不是包名，是 `app_SGLib` 目录；
-   `m24` ：真机是 1。

错一个，10101 就返回非 0，而 Java 侧的等价行为是抛 `SecException` ，native 不会告诉你是哪个参数错了。所以参数表的正确来源永远是参考机抓包，反编译只用来理解"这个参数后面被拿去干什么"。

另外第 0 个 Context 和第 10 个插件对象，也不是随便塞个空对象就行。10101 里 native 会顺着 Context 走一圈： `getPackageName` 、 `getPackageCodePath` 、 `getFilesDir` 、 `getDataDir` 、 `getApplicationInfo` ……这些值要和后面 native 读到的路径对得上，对不上，SDK 在 init 阶段就会把进程判成异常。

10103/10104

```apache
dc id=10103 args=[Ljava.lang.Object;[0]{}
   id=10103 -> null
dc id=10104 args=[Ljava.lang.Object;[0]{}
   id=10104 -> null
```

这两个是插件加载完成的通知：10103 通知 securitybody 插件，10104 通知 middletier 插件，都没有参数，返回值都是 null。Java 侧也不看这个值，按理说是整个 init 里最轻的一步，实际上是最费劲的一步。

原因就是返回值是 null 不代表它没干活。10103 一进去，SecurityGuard 就开始起后台线程采集设备信息(巨多的线程扫描，耗时非常久)，线程按一份固定的清单反射 Android 的类、方法和字段。主线程这边拿到的是 null，真正的报错全在后台线程里，而且是调用返回之后才出现。所以验收 10103 不能看返回值，要看跑完之后 JNI 的缺失计数，第一轮跑出来一百多条缺失。

这就是我在框架里加的两个开关： `DUCKEMU_JNI_TRACE=1` 打印每一次成功的 Java 调用和字段读写（带字符串参数和接收者）， `--jni-events` 只报失败。事件里是 `(class, name, signature, slot)` ，slot 的含义是固定的：

```ini
slot=6    FindClass
slot=33   GetMethodID
slot=94   GetFieldID
slot=113  GetStaticMethodID
slot=144  GetStaticFieldID
slot=215  RegisterNatives
```

补法就是逐字的：事件给什么签名，就声明什么签名。别按"看起来合理"的类型去猜，尤其别把 `long` 写成 `int` ，严格模式下第一次查询就失败，报错只会说签名不匹配，不会说原代码想读什么。

10103 之后要补的是一整张设备面：Build / Build$VERSION、Display / DisplayMetrics、WindowManager、SensorManager、TelephonyManager、ActivityManager / ActivityThread、Settings$Secure、ServiceManager / Parcel、WifiManager、CookieManager、PackageManager / PackageInfo……这些都是"读取"，不是 SDK 逻辑，值全部照参考机画像来。

Java 层和 native 都会检测你补的环境好吧，双方记得和谐一下避免露馅：一份是 guest 里 Build 和 Build$VERSION 的 Java 字段，另一份是 native 直接读的 `ro.*` 属性。两边对不上，SDK 手上就有两份指纹，后面的包校验和环境判断会走偏。我逆向机是 Mi 8 / Android 12 / API 32，但 fingerprint 里还留着 8.1.0，和 release=12 看起来矛盾——那是抓下来的原样，别"修正"成你觉得自洽的样子，感觉是 lineageOS 的问题，一切按手机的样子进行

还有空集合和 null 的区别。采集线程会遍历一批集合，给 null 它就直接跳过整段探测，给空集合它才会继续往下走：

```javascript
WindowManager.mViews          -> 空 list
ActivityThread.mActivities    -> 空 map（map 本身要在）
getInstalledPackages          -> 空 list
PackageManager.mPM            -> 字段要在，值可以是 null
PackageInfo.signatures        -> 字段要在，值可以是 null
```

前几个是"空集合"有意义，后几个是"字段存在"才有意义。字段不存在会变成 missing-field，字段存在但为 null 是合法读数，这两件事要分开处理。

SDK 还会反射读 mtopsdk 自己的类来报设备遥测，这些类不在 so 里，在 APK 的 `classes12.dex` 里。这种就直接按 dex 一次补全，别跑一遍缺一个补一个： `MtopNetworkProp` 的 method=GET、protocol=HTTPSECURE、envMode=ONLINE、retryTimes=1、wuaFlag=-1、openAppKey=DEFAULT_AUTH、userInfo=DEFAULT，还有 `MethodEnum` / `EnvModeEnum` / `ProtocolEnum` 和 `MtopRequest` 的字段与 setter。一次补全的价值不是省几次运行，而是同一轮里所有反射读到的都是同一个完整类。

文件系统这块反而是我卡得最久的地方，坑也最多，我单独放到后面 IO 那一节说。

* * *

10107 这个东西，我原本看 DeepSeek 去补了，但是在我搜集到的资料里面没搜到这个的被补起来，然后就叫停了

### 70102

init 链走完，终于到签名。入参是 12 个：

```sql
0   appKey      "21646297"
1   payload     "at88wsLQ2wUDACdd6tSLBrZ7&&&21646297&...&mtop.taobao.afc.reductionandlogin&1.0&&..."
2   flag        Boolean false
3   Integer 0
4   api         "mtop.taobao.afc.reductionandlogin"
5   page        "pageId=&pageName=com.taobao.tao.welcome.Welcome"
6   null
7   null
8   null
9   request_id  "r_2"
10  Integer 0
11  Integer 0
```

6、7、8 是可选的 payload / header / query 对象，抓包里就是 null。

返回是 `java.util.HashMap` ，正常应该包含五个头：

```css
x-sign
x-mini-wua
x-sgext
x-gst
x-umt
```

到这里其实已经没什么新东西要补了：init 链干净的话，70102 只是又一个 doCommand，不会再暴露新的 JNI 缺失。反过来，init 没补完的时候 70102 也能返回东西，但返回的东西不一定对——所以顺序永远是先验收 init，再看签名。

`x-umt` 就是我们填的 utdid（ `arvEwsCpmYgDAPXgNx27U05R` ），另外几个每次跑都不一样，因为 SDK 把随机数和时间混进去了。想复跑对拍，就得把这两个源钉住：

```apache
TAOBAO_RANDOM_SEED=1 \
TAOBAO_WALL_TIME_NS=1793014979000000000 \
  ./duckemu_taobao_case --stage 70102
```

最后，"补环境补完了"不是"跑起来没崩"，而是这张表全过：

```sql
--init 退出码                        0
10102 / 10101 / 10103 / 10104       0 或 null，不出现 SecException 等价失败
--jni-events                         missing / unsupported = 0
EROFS                                0
其他 svc 失败（排除 ENOENT/EEXIST）   0
70102 返回                           五个头齐全
```

全过之后，才轮得到你去关心签名结果对不对。流程本身就这么五个数字，难的从来不是数字，是每一步后面那句判断：这个返回值，到底是真机也会返回的正常分支，还是我的环境少给了一样东西。

## 补的过程

这块来简单说一下在补期间遇见的一些小问题吧，代码里基本都留了注释，我挑几个印象深的。

### 1\. 环境必须比 so 先就位

一开始我下意识觉得"先把 so 加载起来，缺什么再补什么"，这个顺序在阿里这里是反的。 `JNI_OnLoad` 是在 `dlopen` 里面跑的，等 so 加载完再去补 Java 面， `JNI_OnLoad` 早就跑完了，它当时 `FindClass` 拿到的 0 会一直留在 native 里。所以环境必须在加载任何模块之前装好，晚一步就等于没装。

而且 so 是 AVMP 的，你从里面 grep 不到 `JNICLibrary` 这种类名，也拿不到方法签名表。这就意味着补环境的起点不是"分析 so"，而是"拿到一份真机上的 JNI 事件清单"——参考机 hook 一份，或者让模拟器严格模式把每次失败的 `FindClass` / `GetMethodID` / `GetFieldID` 都吐出来。严格模式没有静默兜底，找不到就返回 0 并发事件， `RegisterNatives` 的类或方法没声明就直接 `JNI_ERR` 。听起来苛刻，但它把"环境没补全"从运行时偶发崩溃变成了装载期一次明确的报错。

### 2\. 同一座桥，两个类名

这个是后台线程教我的。 `com/taobao/wireless/security/adapter/datareport/DataReportJniBridge` 和 `com/alibaba/minilibc/android/DataReportJniBridge` 是同一座桥，设备上两个类都存在；我只补了主类，另一个一直 missing，线程就一直在那里重试，不崩也不报错，就是慢。代码里注释写的是"answering both keeps the thread from retrying a missing class forever"。

同样的事情后面还遇到一次： `UmidAdapter` 在 `com/alibaba/wireless/security/adapter/umid/` 和 `com/taobao/wireless/security/adapter/umid/` 下各有一份，SDK 两个都问。缺一个不会让主流程失败，只会让某个采集线程空转。所以后面我看 JNI 事件不只看"主流程有没有过"，还要看后台线程有没有在反复问同一个东西。

### 3\. 对象图必须是同一份

`Context.getApplicationInfo` 和 `PackageManager.getPackageInfo` 都能拿到 `ApplicationInfo` ，如果一边填了、一边留 null，或者两边各 new 一个，SDK 就会在不同调用点看到不同的包信息——它不会立刻报错，但后面的包校验会走偏。代码里我把 `PackageInfo.applicationInfo` 直接指向 Context 那份对象，注释写的是"fill the same object graph Context hands out instead of leaving the field null"。

同理， `ClassLoader` 、 `CallbackHelper` 这类 SDK 会反复 `getClassLoader()` 或者当单例用的对象，必须每次返回同一个 handle。设备上每次拿到的都是同一个对象，我们这里如果每次 new，SDK 的缓存和身份判断就全乱。

### 4\. 有些桥要故意失败

补环境最容易犯的错，是看到 SDK 调用就返回一个"成功"。 `HttpUtil` 的注释我写得很直白："fail the bridge instead of pretending the server was reached"——假装成功，SDK 就会拿一份假的网络结果继续往下走，那条分支真机上根本不会出现；让它失败，SDK 反而会回到本地/缓存路径。

同样的还有 ACCS、Orange、windvane 这些上报桥。参考机上这个进程根本就没有接，所以"not available"才是正确回答。还有 `ContentResolver` 给 null（没有系统 provider）、权限列表全空（真机没授权也是这个结果）。这类"故意不提供"和"忘了补"从日志上看起来一模一样，区别在于前者能让 SDK 走真机的分支，后者会让它走一条谁都没见过的分支。

### 5\. 没有 Activity 的进程

淘宝是 app 进程，设备采集线程默认按"有 Activity"来写。我们这个 runner 里没有 Activity，但也不能让整段探测消失：

-   `ActivityThread` 的静态 `mActivities` 要在，是一个空 map，不是 null；
-   `WindowManager.mViews` 是空 list， `mParams` 跟它平行；
-   Activity 链会在第一个 `getWindow()` 断掉；
-   `MotionRange` 这种成员要在，哪怕后面根本没有设备返回。

注释里反复出现的一句话是"empty list, not a null one; collectors call size() on it"。给 null，采集线程会跳过整段；给空集合，它才会按真机"没有 Activity"的分支继续走。这个区别在结果上就是"少几个字段"和"多几个字段"的区别，两个都不报错，很容易看漏。

### 6\. 字段存在 ≠ 字段有值

`PackageManager.mPM` 是个隐藏的 binder 字段，我们进程里没有 package service，所以值是 null，但字段本身必须声明，否则反射就是 `GetFieldID` 失败。 `PackageInfo.signatures` 也一样：字段在、值是 null，SDK 自己的 null 检查会兜住，然后回退去读 `base.apk` 。

这个回退就是后面 IO 那节说的 90 MB 反向扫描的入口——你把 signatures 填成一个假数组，反而会关掉这条真机会走的路。所以"字段存在"和"值合法"要分开看：missing-field 是补错了，null 读数可能是对的。

### 7\. 报错信息少得可怜

10101 失败只会返回一个非 0，Java 侧等价行为是抛 `SecException` ，具体哪个参数错了 native 不说。我在框架里把 code/message 存了下来，注释写的是"store the code/message so a host runner can print the cause, not a bare throw"，不然你就只能看到一句 throw 然后开始瞎猜。

### 8\. 时间尺度不能按常规来

最后是时间预算。AVMP 把整条 doCommand 都放在自己的 VM 里跑，单次调用的预算我给到了 900 秒，注释里写的是不要用常规目标的时间尺度去估它。一开始按几十秒设超时，看到的现象就是"跑一半被杀"，很容易误判成死循环。

## IO 这块，上次就是死在这里

前面流程讲得挺顺，其实我上一次补淘宝就是在这里放弃的：跑起来满屏的 openat 失败，全是"文件找不到"。我当时的思路很直——缺什么建什么，照着日志里的路径一个个 mkdir、touch，结果建完还是找不到，日志还越来越长，最后自己都不知道在补什么，心态直接爆炸，然后放弃了。

这次回头看，问题不在路径，在于我先把"文件找不到"当成了一种错误。实际上这些 IO 事件至少分三类，处理方式完全相反。

### 1\. 真机也会 miss 的探测

下面这些 `ENOENT` 是 SDK 在探设备环境，真机上同样会 miss：

```bash
/proc/mounts
/proc/net/unix
/proc/<pid>/{stat,wchan,task}
/dev/__properties__/u:object_r:*_prop:s0
.../app_SGLib/lvm_*                 # 缓存 miss，可接受 我就是炸在这里了，以为这个是必须的，然后死活找不到
.../app_SGLib/.<hash>               # 动态目录探测
.../app_SGLib/.ab394a9964/cfg/cr/<hash>/<n> # 结果发现tm的最终会回退到这里进行读取执行，我也是没招了，后续发现了流程会继续走，继续读
```

SDK 对这些都有回落链， `ENOENT` 是它的预期分支。不要为了把日志清零去预建文件或目录——预建反而可能让它走进一条真机不会走的路。

### 2\. EEXIST 是锁协议，不是错误

SDK 每次受锁保护地读状态文件，都是这个序列：

```cs
openat(lock, 0xc2 = O_CREAT|O_EXCL|O_RDWR)  -> 第一次成功；之后 -17 (EEXIST)
openat(lock, 0x42 = O_CREAT|O_RDWR)         -> 成功
读状态文件，close
```

`0xc2` 失败后的 `0x42` 是"锁已存在，按已有文件打开"的正常分支，没有重试、没有等待。一次 10103 里 `sgFile.lock` 出现 24 次 `-17` 、 `rt_storage.lock` 37 次，全是这个分支。不要为了清零去改 `O_EXCL` 的语义。

但有一个前提：runner 是从宿主拆进程的，SDK 自己没机会走清理，残留锁会留到下一次运行。seed 进来的旧锁会让第一次 `O_CREAT|O_EXCL` 直接失败，SDK 把它理解成"别的进程占着锁"，然后一直等。所以每次启动要删掉：

```bash
data/user/0/com.taobao.taobao/files/*.lock
data/user/0/com.taobao.taobao/app_SGLib/app_*/lock.lock
```

删掉只是让当次运行的第一次获取走成功分支，不影响耗时：实测 `-17` 从 104 降到 61，10103 时长不变。

### 3\. 真正要看的是 EROFS

SecurityGuard 假定 app 的数据目录存在且可写：dexopt 目录、锁文件、从 APK 里解出来的 AVMP 模块都要往里写。所以状态目录必须挂成可写，出现 `EROFS` （ `-30` ）才说明状态目录没挂对，而不是 SDK 在探测。

```ini
TAOBAO_SVC_DEBUG=1 ./build/user_code/duckemu_taobao_case --init
```

这个开关只打失败的 openat/faccessat/newfstatat/readlinkat，外加 SDK 在 abort 前写到 fd 2 的内容。 `close` 偶发的 `-EBADF` （ `-9` ）是 bionic 重复 close 的正常现象，不用处理。

### 4\. 三个状态文件把 90 MB APK 拖进反向扫描

这个是我耗时最久才定位到的。 `app_SGLib/SG_FAST_CONFIG` 、 `app_SGLib/.sf/.uf_wk` 、 `app_SGLib/.sf/.uf_sw` 这三个文件存在时，SDK 会放弃正常的 ZIP 中央目录解析，改成从 `base.apk` 尾部每次退 1 KiB 反向扫描。APK 大概 90 MB，这就是九万次 open，跑起来像卡死一样。

真机上有这三个文件——真机第一次启动完成后就会生成。但我们这个模拟安装没有跑完真实的首次启动，所以首次 seed 时删掉它们就行：

```apache
base.apk IO   9.4k -> 16
10101 耗时    约 15 s
```

后续运行没有它们也不影响 10101。这也是状态目录持久化最值钱的地方：第一次慢，后面直接复用。

### 5\. 两个目录名都要 seed

还有一个很容易漏的：SDK 会按状态文件里的时间戳去探测 `app_SGLib/app_1793010560` ，而抓下来的安装目录是 `app_1793012793` 。两个名字都要 seed 同样的内容，否则 SDK 会反复走"目录不存在"的分支，然后又回到上面那些探测里。

### 6\. 怎么查：先分类，再看 top

我现在的查法是先把失败按路径聚合，不一条条翻

```bash
TAOBAO_SVC_DEBUG=1 ./build/user_code/duckemu_taobao_case --init 2>&1 |
  grep '^svc openat .*-> -' | sed 's/ -> .*//' | sort | uniq -c | sort -rn
```

先看 `EROFS` 是不是 0，再把 `ENOENT` 聚类对照真机，最后才看 `EEXIST` 。 `DUCKEMU_IO_TRACE=1` 会打每一次 open/read/write/close/lseek，量很大，一般用不上，只有需要还原完整时序的时候再开。

状态目录本身是持久的：首次从 `assets/seed/` 复制到 `state/` ，之后一直复用； `TAOBAO_STATE_DIR` 可以换位置，想回到"全新安装"就删掉 `state/` 再跑。早期只读状态的跑法留了个 `TAOBAO_READONLY_STATE=1` ，用来对比，不是正常路径。

所以 IO 这块的正确姿势不是"把失败清掉"，而是给每一类失败找到真机上的同类： `ENOENT` 该有就有， `EEXIST` 该有就有， `EROFS` 必须没有。顺序反了，就会像我第一次那样，越补越乱。

## 小小结

其实对于补环境来说，在意的三点就是

1.  1.Java 调用 最重要之环境，没这个还咋继续执行呢？对不对
2.  2.IO 读一些必要的环境文件或者数据文件，没这些文件肯定会被发现的
3.  3.svc 有一些检测在 IO 不体现但是在系统调用会非常非常明显，并且 svc 可以在 unicorn 层进行监听，非常的无痕(感觉在补环境上很废话)

然后就是漫长的 VMP 分析了，还是先看 VMP 本体吧，然后再看它执行的时候具体做了什么，架构是什么样子的，感觉也就到过年了啊，等我后续内容吧，会逆出来的

**微信QQ交流群**

欢迎大家加入\[ OnePanda-Sec \] 群聊一起交流 ^ ^

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/83956e0e9767abe4.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e41d645fbb349cd5.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f814227bd9fcc878.png)

**END**
