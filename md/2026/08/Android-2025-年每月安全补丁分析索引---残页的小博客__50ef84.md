---
title: Android 2025 年每月安全补丁分析索引 - 残页的小博客
source: https://blog.canyie.top/2025/01/29/android-security-bulletin-index-2025/
source_host: blog.canyie.top
clip_date: 2026-08-07T16:56:40+08:00
trace_id: 72fd6663-64f8-495d-84ee-bf098c98c89e
content_hash: b8aec6b7fa211c29ea6595e0e082f63361eb80f085b22aa21095bd6ee6314367
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: null
ai_summary: Android 2025 年安全公告整体以 Framework 和蓝牙漏洞为主，作者全年发现并报告了多个 EoP/DoS 漏洞，年末在 Google BugHunters 排名 Android Program 第 4；多个月份的补丁反复修复同一类问题（BAL 绕过、跨用户 URI 检查、Parcel UAF 等）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b575244-d011-81de-8eb4-c81fb73fb5c1
ioc:
  cves:
    - CVE-2019-2023
    - CVE-2020-27059
    - CVE-2021-0339
    - CVE-2021-39810
    - CVE-2022-20353
    - CVE-2023-20944
    - CVE-2023-21114
    - CVE-2023-21124
    - CVE-2023-21125
    - CVE-2023-21342
    - CVE-2023-24023
    - CVE-2023-35657
    - CVE-2023-40108
    - CVE-2023-40111
    - CVE-2023-40130
    - CVE-2023-40132
    - CVE-2023-40133
    - CVE-2023-40134
    - CVE-2023-40135
    - CVE-2023-40136
    - CVE-2023-40137
    - CVE-2023-40138
    - CVE-2023-40139
    - CVE-2024-0032
    - CVE-2024-0036
    - CVE-2024-0037
    - CVE-2024-34722
    - CVE-2024-34730
    - CVE-2024-34739
    - CVE-2024-40653
    - CVE-2024-40676
    - CVE-2024-43080
    - CVE-2024-43088
    - CVE-2024-43090
    - CVE-2024-43093
    - CVE-2024-43095
    - CVE-2024-43096
    - CVE-2024-43763
    - CVE-2024-43765
    - CVE-2024-43770
    - CVE-2024-43771
    - CVE-2024-49714
    - CVE-2024-49720
    - CVE-2024-49721
    - CVE-2024-49722
    - CVE-2024-49723
    - CVE-2024-49724
    - CVE-2024-49728
    - CVE-2024-49729
    - CVE-2024-49730
    - CVE-2024-49732
    - CVE-2024-49733
    - CVE-2024-49734
    - CVE-2024-49735
    - CVE-2024-49736
    - CVE-2024-49737
    - CVE-2024-49738
    - CVE-2024-49740
    - CVE-2024-49741
    - CVE-2024-49742
    - CVE-2024-49743
    - CVE-2024-49744
    - CVE-2024-49745
    - CVE-2024-49746
    - CVE-2024-49747
    - CVE-2024-49748
    - CVE-2024-49749
    - CVE-2024-50302
    - CVE-2024-53104
    - CVE-2024-53150
    - CVE-2024-53197
    - CVE-2025-0074
    - CVE-2025-0075
    - CVE-2025-0076
    - CVE-2025-0077
    - CVE-2025-0078
    - CVE-2025-0079
    - CVE-2025-0080
    - CVE-2025-0081
    - CVE-2025-0082
    - CVE-2025-0083
    - CVE-2025-0084
    - CVE-2025-0086
    - CVE-2025-0087
    - CVE-2025-0089
    - CVE-2025-0091
    - CVE-2025-0092
    - CVE-2025-0093
    - CVE-2025-0094
    - CVE-2025-0095
    - CVE-2025-0096
    - CVE-2025-0097
    - CVE-2025-0098
    - CVE-2025-0099
    - CVE-2025-0100
    - CVE-2025-22403
    - CVE-2025-22404
    - CVE-2025-22405
    - CVE-2025-22406
    - CVE-2025-22407
    - CVE-2025-22408
    - CVE-2025-22409
    - CVE-2025-22410
    - CVE-2025-22411
    - CVE-2025-22412
    - CVE-2025-22416
    - CVE-2025-22417
    - CVE-2025-22418
    - CVE-2025-22419
    - CVE-2025-22420
    - CVE-2025-22421
    - CVE-2025-22422
    - CVE-2025-22423
    - CVE-2025-22424
    - CVE-2025-22425
    - CVE-2025-22426
    - CVE-2025-22427
    - CVE-2025-22428
    - CVE-2025-22429
    - CVE-2025-22430
    - CVE-2025-22431
    - CVE-2025-22432
    - CVE-2025-22433
    - CVE-2025-22434
    - CVE-2025-22435
    - CVE-2025-22437
    - CVE-2025-22438
    - CVE-2025-22439
    - CVE-2025-22441
    - CVE-2025-22442
    - CVE-2025-26416
    - CVE-2025-26417
    - CVE-2025-26420
    - CVE-2025-26421
    - CVE-2025-26422
    - CVE-2025-26423
    - CVE-2025-26424
    - CVE-2025-26425
    - CVE-2025-26426
    - CVE-2025-26427
    - CVE-2025-26428
    - CVE-2025-26429
    - CVE-2025-26430
    - CVE-2025-26432
    - CVE-2025-26435
    - CVE-2025-26436
    - CVE-2025-26437
    - CVE-2025-26438
    - CVE-2025-26440
    - CVE-2025-26441
    - CVE-2025-26442
    - CVE-2025-26443
    - CVE-2025-26444
    - CVE-2025-26445
    - CVE-2025-26448
    - CVE-2025-26449
    - CVE-2025-26450
    - CVE-2025-26452
    - CVE-2025-26453
    - CVE-2025-26454
    - CVE-2025-26455
    - CVE-2025-26456
    - CVE-2025-26458
    - CVE-2025-26462
    - CVE-2025-26463
    - CVE-2025-26464
    - CVE-2025-27363
    - CVE-2025-32312
    - CVE-2025-32319
    - CVE-2025-32321
    - CVE-2025-32323
    - CVE-2025-32324
    - CVE-2025-32325
    - CVE-2025-32326
    - CVE-2025-32327
    - CVE-2025-32328
    - CVE-2025-32329
    - CVE-2025-32330
    - CVE-2025-32331
    - CVE-2025-32333
    - CVE-2025-32345
    - CVE-2025-32346
    - CVE-2025-32347
    - CVE-2025-32349
    - CVE-2025-32350
    - CVE-2025-38352
    - CVE-2025-48522
    - CVE-2025-48523
    - CVE-2025-48524
    - CVE-2025-48525
    - CVE-2025-48526
    - CVE-2025-48527
    - CVE-2025-48528
    - CVE-2025-48529
    - CVE-2025-48530
    - CVE-2025-48531
    - CVE-2025-48532
    - CVE-2025-48533
    - CVE-2025-48534
    - CVE-2025-48535
    - CVE-2025-48536
    - CVE-2025-48537
    - CVE-2025-48538
    - CVE-2025-48539
    - CVE-2025-48540
    - CVE-2025-48541
    - CVE-2025-48542
    - CVE-2025-48543
    - CVE-2025-48544
    - CVE-2025-48545
    - CVE-2025-48546
    - CVE-2025-48547
    - CVE-2025-48548
    - CVE-2025-48549
    - CVE-2025-48550
    - CVE-2025-48551
    - CVE-2025-48552
    - CVE-2025-48553
    - CVE-2025-48554
    - CVE-2025-48555
    - CVE-2025-48556
    - CVE-2025-48558
    - CVE-2025-48559
    - CVE-2025-48560
    - CVE-2025-48561
    - CVE-2025-48562
    - CVE-2025-48563
    - CVE-2025-48564
    - CVE-2025-48565
    - CVE-2025-48566
    - CVE-2025-48572
    - CVE-2025-48573
    - CVE-2025-48575
    - CVE-2025-48576
    - CVE-2025-48580
    - CVE-2025-48581
    - CVE-2025-48583
    - CVE-2025-48584
    - CVE-2025-48586
    - CVE-2025-48588
    - CVE-2025-48589
    - CVE-2025-48590
    - CVE-2025-48591
    - CVE-2025-48592
    - CVE-2025-48593
    - CVE-2025-48594
    - CVE-2025-48596
    - CVE-2025-48597
    - CVE-2025-48598
    - CVE-2025-48599
    - CVE-2025-48601
    - CVE-2025-48603
    - CVE-2025-48604
    - CVE-2025-48607
    - CVE-2025-48612
    - CVE-2025-48614
    - CVE-2025-48618
    - CVE-2025-48620
    - CVE-2025-48621
    - CVE-2025-48622
    - CVE-2025-48626
    - CVE-2025-48627
    - CVE-2025-48628
    - CVE-2025-48629
    - CVE-2025-48631
    - CVE-2025-48632
    - CVE-2025-48633
    - CVE-2025-48639
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Android 2025 年安全公告整体以 Framework 和蓝牙漏洞为主，作者全年发现并报告了多个 EoP/DoS 漏洞，年末在 Google BugHunters 排名 Android Program 第 4；多个月份的补丁反复修复同一类问题（BAL 绕过、跨用户 URI 检查、Parcel UAF 等）。
> 
> - **核心数据：** 作者在 Google BugHunters 总排名 24，2024 年度第 6，Android Program 第 4；12 月公告中大量 CVE 为作者 duplicate。
> - **常见漏洞模式：** 多次修复 `getCallingPackage()` 误用、Self-changing Data Type/BadResolve 类 TOCTOU、蓝牙 SDP/GATT 日志与 MTU=0 导致的 UAF/越界写、通过 `BIND_INCLUDE_CAPABILITIES`/`BIND_ALLOW_BACKGROUND_ACTIVITY_STARTS` 绕过 BAL，以及跨用户 URI 检查被 encoded `@` 绕过（CVE-2025-0082/0083/26453）。
> - **典型修复案例：** CVE-2025-48583 是 LazyValue 中 Parcel UAF，修复将 `recycle()` 改为 `destroy()`；CVE-2025-22429 是 bundle 解析异常导致 LazyValue UAF；CVE-2025-48564 系列改用显式 type 的 resolveActivity、`getLaunchedFromPackage()` 并 sanitize selector。
> - **作者自报漏洞示例：** CVE-2025-48575 任意应用抢占 `com.android.settings` 包名安装证书；CVE-2025-48545 通过 SDK Sandbox 绕过 AccountManagerService 系统 app 检查；CVE-2025-32323 DocumentUI 应用名换行 UI 欺骗；CVE-2025-32347 Settings 中 PendingIntent trampoline 可确定设备位置。
> - **在野利用：** 2025 年多次在野漏洞多为内核 USB 模块（CVE-2024-53150/53197/53104）、蓝牙（CVE-2025-48633）、freetype 整数溢出（CVE-2025-27363）等。

2024 年度补丁分析： [点我](https://blog.canyie.top/2024/04/18/android-security-bulletin-index/)  
2026 年度补丁分析： [点我](https://blog.canyie.top/2026/03/18/android-security-bulletin-index-2026/)

给大家分享一个好消息，经过一年的研究，我现在在 Google BugHunters 平台上总排名 24，2024 年度第 6 名，Android Program 第 4 名！感谢各位一年陪伴！

最后更新时间：2026/03/18 更新内容：更新 2026

状态更新：由于本人健康问题，此博客跟我的频道可能会更新缓慢，建议关注我的频道获取最新状态

## 2025-12-01

又一年，我们 2026 再见！  
妈的，这个月公告里一堆我的 duplicate 😭  
Android 16 QPR2 也开始发布安全公告了，有人想看大/小版本的安全公告分析的吗？

在野利用漏洞：CVE-2025-48633 CVE-2025-48572

### Framework

[CVE-2025-48631](https://nvd.nist.gov/vuln/detail/CVE-2025-48631) DoS Critical  
限制展示的图片大小，最大 4096x4096，防止渲染图片时内存溢出

[CVE-2025-22420](https://nvd.nist.gov/vuln/detail/CVE-2025-22420) EoP High  
创建 notification channel 时就检查调用者是否有权限访问它的 sound uri。之前放过一遍，当时的修复是检查失败直接抛异常让 app crash，后面因为兼容性问题被撤回了，改成重置回默认通知声音重新放一遍。

[CVE-2025-32319](https://nvd.nist.gov/vuln/detail/CVE-2025-32319) EoP High  
系统绑定 PrintService 时不要使用 `BIND_INCLUDE_CAPABILITIES` ，这个 flag 会让后台 app 也可以使用 while in use 权限

[CVE-2025-32328](https://nvd.nist.gov/vuln/detail/CVE-2025-32328) EoP High  
system_server 填充 autofill 资源的时候用了自己的默认 context，其 user id 是 0，补丁改成了使用当前的前台 user id 重新创建一个 context 以避免误用。

[CVE-2025-32329](https://nvd.nist.gov/vuln/detail/CVE-2025-32329) EoP High  
补丁链接和 CVE-2025-32328 是一样的。

[CVE-2025-48525](https://nvd.nist.gov/vuln/detail/CVE-2025-48525) EoP High  
配套设备配对的时候可能会自动授权读取通知，所以当所有配套设备 associations 被撤销的时候需要移除通知读取权限。

[CVE-2025-48564](https://nvd.nist.gov/vuln/detail/CVE-2025-48564) EoP High  
IntentForwarderActivity 中的权限检查问题导致不安全的 intent 可能被转发进其他 profile，具体来说修复了这些问题：

-   添加并使用可以显式指定 type 的 resolveActivity() API，防止被 [Self-changing Data Type](https://blog.canyie.top/2024/11/07/self-changing-data-type/) 绕过检查
-   将不安全的、可被伪造的 `getCallingPackage()` 换成 `getLaunchedFromPackage()`
-   如果传来的 intent 带有 selector，也需要 sanitize 它

根据提交信息带的 bug id，推测这个 CVE ID 是属于第一个问题的

[CVE-2025-48565](https://nvd.nist.gov/vuln/detail/CVE-2025-48565) EoP High  
补丁链接和 CVE-2025-48564 是一样的，推测这个 CVE 是分配给第三个问题的

[CVE-2025-48572](https://nvd.nist.gov/vuln/detail/CVE-2025-48572) EoP High  
CVE-2023-40111 和 CVE-2025-22437 的变种。MediaSessionService 启动应用通过 `setMediaButtonReceiver()` 传递的 PendingIntent 时不要通过 `setBackgroundActivityStartsAllowed(true)` 的方式去允许启动前台服务，因为这样可能会不小心允许 app 绕过 BAL 限制启动前台 activity，改成 `tempAllowlistTargetPkgIfPossible()` 。

[CVE-2025-48573](https://nvd.nist.gov/vuln/detail/CVE-2025-48573) EoP High  
此漏洞由我发现并报告。  
MediaController `sendCommand()` 使用 `tempAllowlistTargetPkgIfPossible()` 尝试将被调用的 app 加进白名单允许其启动前台服务并获得 while in use 权限，即使其在后台。补丁认为这个调用只是用来交换信息的，直接把 `tempAllowlistTargetPkgIfPossible()` 删掉。

[CVE-2025-48580](https://nvd.nist.gov/vuln/detail/CVE-2025-48580) EoP High  
此漏洞由我发现并报告。  
框架的 MediaBrowser API 连接到应用提供的 MediaBrowserService 时支持不使用 `BIND_INCLUDE_CAPABILITIES` 标志，避免意外授予 while in use 权限。

[CVE-2025-48583](https://nvd.nist.gov/vuln/detail/CVE-2025-48583) EoP High  
LazyValue 实现中的 Parcel UAF 问题。补丁和漏洞描述都没给触发方法，我这里给出来的方法是在 LazyValue 里放一个 ParceledListSlice，它被反序列化的时候会 binder 调用回 app 进程，app 进程再递归调用 system server 导致这个 LazyValue 被再次反序列化，由于 binder 驱动的特性（见 [Binder calls and mutexes reentrancy](https://github.com/michalbednarski/LeakValue?tab=readme-ov-file#additional-note-binder-calls-and-mutexes-reentrancy) ）这个调用一定会由同一个 binder 线程执行，这样同一个 LazyValue 被 `getValue()` 两次，导致引用计数被减小两次，而实际上只有一个 LazyValue 被替换成了真实的 Parcelable，所以可以造成引用计数等于 0 触发 Parcel 回收后 map 内依然存在 LazyValue 引用着被回收的 parcel 的情况。这个漏洞我和 [Michal Bednarski](https://github.com/michalbednarski) 在 bugSWAT Mexico 2025 现场一起合作发现过，但是还没来得及上报就被告知是 duplicate，挺可惜的。修复是把 LazyValue 用过的 Parcel 直接 `destroy()` 掉而非 `recycle()` ，这样它再也不会被 reuse，也就不再有可能被利用。

[CVE-2025-48588](https://nvd.nist.gov/vuln/detail/CVE-2025-48588) EoP High  
避免在安全模式下意外清空 always-on VPN。

[CVE-2025-48589](https://nvd.nist.gov/vuln/detail/CVE-2025-48589) EoP High  
点击隐私指示器的时候过滤掉非前台用户，漏洞描述是可以跨用户更改权限

[CVE-2025-48594](https://nvd.nist.gov/vuln/detail/CVE-2025-48594) EoP High  
CDM 使用 `PackageManager#getNameForUid()` 去拿包名，对于使用了 `sharedUserId` 的应用来说这个方法不会返回包名，导致无法移除 association。

[CVE-2025-48596](https://nvd.nist.gov/vuln/detail/CVE-2025-48596) EoP High  
`Parcel::appendFrom()` 里保证 `mDataPos` 不大于 `mDataSize` 。

[CVE-2025-48597](https://nvd.nist.gov/vuln/detail/CVE-2025-48597) EoP High  
进入 PiP （画中画模式）的时候只有 WindowManager Shell 成功收到了 transaction 才把 PiP 窗口标记为 TRUSTED_OVERLAY，退出 PiP 时在 WindowManagerService 内立刻将其标为非 trusted。

[CVE-2025-48601](https://nvd.nist.gov/vuln/detail/CVE-2025-48601) EoP High  
该漏洞未公开补丁链接，但 bug id 与我报告的两个 bug 重复，因此知道是什么问题。手动还原得到： [https://android.googlesource.com/platform/frameworks/base/+/236cff6879b255d0b1b3faa40dff8badb39cbf8b](https://android.googlesource.com/platform/frameworks/base/+/236cff6879b255d0b1b3faa40dff8badb39cbf8b)  
`NotificationManagerService#updateNotificationChannelGroupFromPrivilegedListener()` 和 `NotificationListenerService#updateNotificationChannelFromPrivilegedListener()` 两个方法可以任意指定包名，这个包名会被传到 `getOrCreatePackagePreferencesLocked()` 里随后会导致一个 `PackagePreferences` 被创建并存到 map 里，后续 `writePackageXml()` 会尝试把包名写进 xml 里，通过指定超长字符串可以阻止未来的 notification 相关的变化（比如撤销读取通知权限）被写进 xml 里。

[CVE-2025-48618](https://nvd.nist.gov/vuln/detail/CVE-2025-48618) EoP High  
telephony 只在屏幕解锁后才尝试启动浏览器。

[CVE-2025-48620](https://nvd.nist.gov/vuln/detail/CVE-2025-48620) EoP High  
VoiceInteractionManagerService 中的逻辑 bug 导致已经被设置上的 voice recognition service 即使在 app 被卸载后也不会清除，后续如果有同名恶意 app 被安装就能直接拿到权限。

[CVE-2025-48621](https://nvd.nist.gov/vuln/detail/CVE-2025-48621) EoP High  
不透明度小于 0.5 的窗口不接收点击事件，同时把最大动画时长从 3 秒改成 1.5 秒。CVE-2021-0339 再现。  
演示视频及论文见 [https://taptrap.click/](https://taptrap.click/)

[CVE-2025-48627](https://nvd.nist.gov/vuln/detail/CVE-2025-48627) EoP High  
`ActivityTaskManagerService#startNextMatchingActivity()` 中的 BAL，CVE-2024-0036 的变体，原先的修复是给 ActivityOptions 设置避免移动到前台的 flag，这个修复有问题，改成修复根因（ `realCallingUid` 不正确）。

[CVE-2025-48629](https://nvd.nist.gov/vuln/detail/CVE-2025-48629) EoP High  
该漏洞未公开补丁链接，但是其实就是 [https://android.googlesource.com/platform/frameworks/base/+/0bc6ced90e2ee1e6140a4d87ee62923bdfd2ca93](https://android.googlesource.com/platform/frameworks/base/+/0bc6ced90e2ee1e6140a4d87ee62923bdfd2ca93)  
VoiceInteractionManagerService 在没有 voice recognition service 的情况下会自动尝试找符合要求的 app 并把它设置成默认的，这个过程没有过滤第三方 app，所以第三方 app 有可能被系统自动设置成 voice recognizer。修复就是过滤掉没有 `FLAG_SYSTEM` 标志的 app。这个问题我也报过，当时以为他们会在大版本里修，结果居然 backport 了，勤奋程度超出我想象。

[CVE-2025-48632](https://nvd.nist.gov/vuln/detail/CVE-2025-48632) EoP High  
AssociationRequest 的 display name 最长不能超过 1024，其实就是 9 月份的 CVE-2025-48522，当时修得不够彻底

[CVE-2025-48639](https://nvd.nist.gov/vuln/detail/CVE-2025-48639) EoP High  
补丁链接和 CVE-2025-48621 是一样的。

[CVE-2025-48591](https://nvd.nist.gov/vuln/detail/CVE-2025-48591) ID High  
MMS Service 读取 URI （ `readPduFromContentUri()` ）的时候校验 user id 相同。也是我很早就发现过的漏洞，没来得及报就被修了。

[CVE-2025-48592](https://nvd.nist.gov/vuln/detail/CVE-2025-48592) ID High  
media codec2 C2SoftDav1dDec.cpp 里禁用 layer buffers，看起来是处理不足导致的越界读

[CVE-2025-48628](https://nvd.nist.gov/vuln/detail/CVE-2025-48628) ID High  
PrintManagerService 里使用 `ContentProvider.getUserIdFromAuthority()` 而非 `Uri.getEncodedUserInfo()` 检查跨用户，防止被 encoded 的 @ 字符绕过检查，跟之前的 CVE-2025-0082/CVE-2025-0083/CVE-2025-26453 类似。也是我很早之前发现过报过但是 duplicate 的洞。

[CVE-2025-48633](https://nvd.nist.gov/vuln/detail/CVE-2025-48633) ID High  
添加 device owner 的时候保证拿到所有的 account 而不会受 visibility 限制。又乱给类型，明明应该是 EoP

[CVE-2025-48576](https://nvd.nist.gov/vuln/detail/CVE-2025-48576) DoS High  
删除从未被使用过的 `updateNotificationChannelGroupFromPrivilegedListener` API，可被滥用创建大量 NotificationChannelGroup 耗尽系统内存。又是我报了结果 duplicate 的洞。

[CVE-2025-48584](https://nvd.nist.gov/vuln/detail/CVE-2025-48584) DoS High  
限制通过 Android 16 新 API `createConversationNotificationChannelForPackage()` 可创建的 NotificationChannel 的数量。嗯，没错，又是报了然后 duplicate。

[CVE-2025-48590](https://nvd.nist.gov/vuln/detail/CVE-2025-48590) DoS High  
AppOpsService 对于 target API <= Q 的 app 会豁免 attribution tag 必须有效的检查，可被滥用绕过先前大量与 attribution tag 相关的 DoS 补丁。  
感觉对于这种需要低 target 才能触发的漏洞，认不认完全看审核团队的心情，我很早就发现了这个地方有问题但是觉得不会认就没报，这块规则也不是很清楚，头大

[CVE-2025-48603](https://nvd.nist.gov/vuln/detail/CVE-2025-48603) DoS High  
拒绝大小超出 200KB 的输入法 metadata。

[CVE-2025-48607](https://nvd.nist.gov/vuln/detail/CVE-2025-48607) DoS High  
CVE-2025-26429 的变体，AppOpsService `getPackagesForOpsForDevice()` 的返回值使用 ParceledListSlice 切片传输，避免传输过大数据造成 TransactionTooLargeException。

[CVE-2025-48614](https://nvd.nist.gov/vuln/detail/CVE-2025-48614) DoS High  
CVE-2024-49736 的变体，DSU 模式下禁止通过编程方式触发恢复出厂设置。

### System

[CVE-2023-40130](https://nvd.nist.gov/vuln/detail/CVE-2023-40130) EoP High  
2023 年的老漏洞，当时的修复可能会造成崩溃，加上一个 catch 重新发。作者的博客： [https://wrlus.com/android-security/bindservice-error-handle/](https://wrlus.com/android-security/bindservice-error-handle/)

[CVE-2025-22432](https://nvd.nist.gov/vuln/detail/CVE-2025-22432) EoP High  
四月发过的洞，和 CVE-2023-40130 类似，因为同一个原因被撤回重发。详见 4 月分析。

[CVE-2025-48536](https://nvd.nist.gov/vuln/detail/CVE-2025-48536) EoP High  
Settings app 里添加一个 string array 指定只在 debuggable build 里允许访问 settings slice 的 app。是因为之前把所有包名都在 `slice_allowlist_package_names` 白名单里列出，而部分包名在 release build 上没有，导致包名伪造攻击？

[CVE-2025-48566](https://nvd.nist.gov/vuln/detail/CVE-2025-48566) EoP High  
和 CVE-2025-48564 的补丁链接是一样的，我报过 `getCallingPackage()` 的问题，与这个 bug id 重复了，所以猜测这个 CVE 是分配给第二个问题即 `getCallingPackage()` 的 misuse。

[CVE-2025-48575](https://nvd.nist.gov/vuln/detail/CVE-2025-48575) EoP High  
此漏洞由我发现并报告。  
CertInstaller 内校验调用者的包名是否是 com.android.settings 来决定是否允许安装证书，但是在手表/电视/车机上，设置的包名并不是 com.android.settings，这些系统上默认没有叫 `com.android.settings` 的应用，但是 CertInstaller 内的校验逻辑并没有修改，所以任意应用都可以抢占 com.android.settings 这个包名然后绕过校验直接安装证书。

[CVE-2025-48586](https://nvd.nist.gov/vuln/detail/CVE-2025-48586) EoP High  
和 CVE-2025-32346 类似，把 EditFdnContactScreen onActivityResult 中原本的比较 user id 的跨用户检查改成了使用 android 15 新 api 去检查来源 app 有没有权限读返回的 uri。依然需要分析。  
更新：应该是使用 `content://com.android.contacts/data_enterprise/phones` 从 work profile 里泄露出联系人号码

[CVE-2025-48598](https://nvd.nist.gov/vuln/detail/CVE-2025-48598) EoP High  
类似 CVE-2025-48541，添加生物验证的时候忽略不可信调用者传递的 user id

[CVE-2025-48599](https://nvd.nist.gov/vuln/detail/CVE-2025-48599) EoP High  
用户受到 DISALLOW_CONFIG_LOCATION 限制时禁止打开 WifiScanModeActivity

[CVE-2025-48612](https://nvd.nist.gov/vuln/detail/CVE-2025-48612) EoP High  
设置付款应用时存在字符串注入，先前的逻辑把 app 组件名 + 一个空格 + user id 拼接成一个字符串，然后再以空格为分隔符还原出原来的值，如果 app 组件名里包含空格就能操控后面的 user id

[CVE-2025-48626](https://nvd.nist.gov/vuln/detail/CVE-2025-48626) EoP High  
Launcher3 导航到 home 时原本是直接 `startActivity()` ，补丁改成了通过 binder 向 SystemUI 发送 KEYCODE_HOME。看不懂，漏洞描述似乎是 BAL？

[CVE-2025-48555](https://nvd.nist.gov/vuln/detail/CVE-2025-48555) ID High  
从设置里隐藏锁定用户的通知

[CVE-2025-48604](https://nvd.nist.gov/vuln/detail/CVE-2025-48604) ID High  
MMS Service 从 content uri 下载 pdu （ `writePduToContentUri()` ）的时候校验 user id。和 CVE-2025-48591 类似

[CVE-2025-48622](https://nvd.nist.gov/vuln/detail/CVE-2025-48622) ID High  
把旧版的 dng sdk 1.4 更新到 1.7.1，见 [https://project-zero.issues.chromium.org/issues/412422252](https://project-zero.issues.chromium.org/issues/412422252)

## 2025-11-01

### System

[CVE-2025-48593](https://nvd.nist.gov/vuln/detail/CVE-2025-48593) RCE Critical  
蓝牙 BTA 层中 HFP 协议实现中的 Classic UAF，和 CVE-2025-0084 很像  
详细分析及 PoC： [https://worthdoingbadly.com/bluetooth/](https://worthdoingbadly.com/bluetooth/)

[CVE-2025-48581](https://nvd.nist.gov/vuln/detail/CVE-2025-48581) EoP High  
apexd 中的问题，会导致安全更新无法安装，不清楚具体是什么原因

## 2025-10-01

不出意料地在给了我一堆 CVE 后再次放鸽子，休息一个月

## 2025-09-01

在野大哥整的新活：CVE-2025-38352 CVE-2025-48543  
这个月更新了五十多个漏洞，累死我了

### Android Runtime

[CVE-2025-48543](https://nvd.nist.gov/vuln/detail/CVE-2025-48543) EoP High  
jni 调用 NewObject() 和 AllocObject() 的时候检查要 new 的类不能是抽象类，否则会发生内存损坏。  
这个问题第一次被讨论应该是这里：  
[https://www.jianshu.com/p/2304405947c7](https://www.jianshu.com/p/2304405947c7)

### Framework

[CVE-2025-0089](https://nvd.nist.gov/vuln/detail/CVE-2025-0089) EoP High  
对于启动 launcher 的格式不正确的 intent 对其内容进行修正，如移除多余的 category、重置 intent type、重置显式设置的 component 及添加 FLAG_ACTIVITY_NEW_TASK 标志。看不太懂，漏洞描述是 hijack launcher app。

[CVE-2025-32324](https://nvd.nist.gov/vuln/detail/CVE-2025-32324) EoP High  
Android 15 新添加的 `am start-in-vsync` 命令把实际 `startActivity` 动作放在了 UI 线程处理，导致里面读到的调用者权限是 system_server 自己的（不在 binder 调用过程中的线程调用 `Binder.getCallingUid()` 等方法会返回当前进程自己的信息），导致可以忽略权限启动任意 activity。和去年的 CVE-2023-21114 有点像。

[CVE-2025-32325](https://nvd.nist.gov/vuln/detail/CVE-2025-32325) EoP High  
`Parcel::appendFrom()` 里的越界写，看测试代码是 parcel offset 在一个 FileDescriptor 中部时调用 `appendFrom()` 会产生问题

[CVE-2025-32331](https://nvd.nist.gov/vuln/detail/CVE-2025-32331) EoP High  
在 app pinning 模式下不显示可被 dismiss 的 keyguard，否则在折叠屏设备上会造成问题，导致绕过 app pinning。

[CVE-2025-32349](https://nvd.nist.gov/vuln/detail/CVE-2025-32349) EoP High  
隐藏各种不可信窗口时使用系统默认的动画，同时禁止 toast 窗口自定义动画，应该是能指定一个很长时间的动画绕过 tapjacking 保护。

[CVE-2025-32350](https://nvd.nist.gov/vuln/detail/CVE-2025-32350) EoP High  
SystemUI 不再导出 ControlsActivity，同时为 ControlsSettingsDialog 添加标志隐藏悬浮窗。

[CVE-2025-48522](https://nvd.nist.gov/vuln/detail/CVE-2025-48522) EoP High  
ComponaionDeviceManagerService AssociationRequest 的 display name 限制最长为 1024。

[CVE-2025-48528](https://nvd.nist.gov/vuln/detail/CVE-2025-48528) EoP High  
生物认证弹窗的窗口类型从 `TYPE_APPLICATION_OVERLAY` 修正为 `TYPE_KEYGUARD_DIALOG` ，防止被其他 app 悬浮窗覆盖

[CVE-2025-48540](https://nvd.nist.gov/vuln/detail/CVE-2025-48540) EoP High  
binder RPC 过程中读到错误的 object table size 及内存耗尽时手动 shutdown session，看描述是越界写

[CVE-2025-48546](https://nvd.nist.gov/vuln/detail/CVE-2025-48546) EoP High  
启动 Activity 时禁止指定 launch window mode 为 pinned，阻止 BAL 绕过，应该使用公开的 `ActivityOptions#makeLaunchIntoPip()` API，这个 API 做了 BAL 检查

[CVE-2025-48548](https://nvd.nist.gov/vuln/detail/CVE-2025-48548) EoP High  
AppOpsService 内的管理问题，会导致后台 app 也能录音及录音时不显示隐私指示器

[CVE-2025-48549](https://nvd.nist.gov/vuln/detail/CVE-2025-48549) EoP High  
补丁同 CVE-2025-48548

[CVE-2025-48552](https://nvd.nist.gov/vuln/detail/CVE-2025-48552) EoP High  
DevicePolicyManagerService 里重置代理时忽略写入 SettingsProvider 时可能发生的异常，防止干扰到后续操作（如移除设备管理员）

[CVE-2025-48553](https://nvd.nist.gov/vuln/detail/CVE-2025-48553) EoP High  
Device Admin app 被更新时如果附带的 device admin info 不再有效就移除掉这个 admin

[CVE-2025-48556](https://nvd.nist.gov/vuln/detail/CVE-2025-48556) EoP High  
NotificationChannel 截短过长的 id、parentChannelId 和 conversationId，防止序列化时发生错误。具体触发点是在 Android 16 新增的 `NotificationListenerService#createConversationNotificationChannelForPackage()` API 中。  
为什么我这么清楚，因为这个洞我7月自己发现过一次，喜迎 duplicate 😭

[CVE-2025-48558](https://nvd.nist.gov/vuln/detail/CVE-2025-48558) EoP High  
BatteryService 只启动系统 app 声明的 ShutdownActivity，防止隐式 intent 劫持

[CVE-2025-48563](https://nvd.nist.gov/vuln/detail/CVE-2025-48563) EoP High  
绑定 AutofillService 如果收到 null 就解绑，避免 BAL 绕过

[CVE-2025-0076](https://nvd.nist.gov/vuln/detail/CVE-2025-0076) ID High  
在“快速访问钱包”这个功能里只允许 bitmap 类型的 card image 和 icon。

[CVE-2025-32330](https://nvd.nist.gov/vuln/detail/CVE-2025-32330) ID High  
蓝牙音频分享这个功能使用 SecureRandom 生成随机密码，提升安全性。

[CVE-2025-48529](https://nvd.nist.gov/vuln/detail/CVE-2025-48529) ID High  
telephony 内遗留代码产生的跨用户音频泄露，修复就是把遗留代码删掉

[CVE-2025-48537](https://nvd.nist.gov/vuln/detail/CVE-2025-48537) ID High  
修复系统代码里认为“condition id 相同的则一定指向同一个 ConditionProviderService“的错误假设，同时禁止非系统调用者创建指向系统 authority 的 rule。没看懂有啥用。

[CVE-2025-48545](https://nvd.nist.gov/vuln/detail/CVE-2025-48545) ID High  
此漏洞由我发现并报告。  
AccountManagerService 存在不安全的权限检查，当调用者是系统预装 app 时会放行调用某些特权 API，而 Android 13 引入的一个新功能 SDK Sandbox 允许不可信开发者发布的 sdk 在单独的进程中运行，这些进程会被认为属于 com.google.android.sdksandbox 这个 app，其是一个系统预装应用因此可以绕过上述检查调用特权 API。

[CVE-2025-48561](https://nvd.nist.gov/vuln/detail/CVE-2025-48561) ID High  
应用可以请求模糊多个窗口，通过测量模糊各个窗口所需的时间判断出上面显示出的内容。  
太牛逼了，本年度最牛逼侧信道

[CVE-2025-48562](https://nvd.nist.gov/vuln/detail/CVE-2025-48562) ID High  
写入 pdf 文档的时候指定 truncate flag。

[CVE-2025-48538](https://nvd.nist.gov/vuln/detail/CVE-2025-48538) DoS High  
禁止 `pm hide com.android.systemui` ，即使在 profile 里进行该操作也会导致整个设备无法使用。

[CVE-2025-48542](https://nvd.nist.gov/vuln/detail/CVE-2025-48542) DoS High  
AccountManagerService 里把账号的 password、auth token 等也纳入内存限制。

[CVE-2025-48550](https://nvd.nist.gov/vuln/detail/CVE-2025-48550) DoS High  
授权 slice 权限时保证包名合法，防止路径穿越覆盖其他文件。

[CVE-2025-48554](https://nvd.nist.gov/vuln/detail/CVE-2025-48554) DoS High  
解析 device admin service info 时 catch 可能发生的 OutOfMemoryError

[CVE-2025-48559](https://nvd.nist.gov/vuln/detail/CVE-2025-48559) DoS High  
和之前的 CVE-2025-22431 类似，有 proxy app 给 root 提供 attribution tag 时不能直接无条件信任

### System

[CVE-2025-48539](https://nvd.nist.gov/vuln/detail/CVE-2025-48539) RCE Critical  
之前那一堆蓝牙里 log UAF 的问题又来了，只影响 15 16

[CVE-2021-39810](https://nvd.nist.gov/vuln/detail/CVE-2021-39810) EoP High  
官方未放出补丁链接，手动还原结果：  
[https://android.googlesource.com/platform/packages/apps/Nfc/+/d6515512436fe0976220d3919668b8ad2705144a](https://android.googlesource.com/platform/packages/apps/Nfc/+/d6515512436fe0976220d3919668b8ad2705144a)  
逻辑很清晰，选取默认支付服务的时候过滤掉非系统预装应用。  
很久之前的老洞，本来在 Android 14 上修了，现在 backport 给 13。

[CVE-2023-24023](https://nvd.nist.gov/vuln/detail/CVE-2023-24023) EoP High  
蓝牙 Legacy Secure Connection (LSC) 协议设计问题，又名 BLUFFS。没仔细看，看起来是 key 较短时会发生的中间人攻击

[CVE-2024-49714](https://nvd.nist.gov/vuln/detail/CVE-2024-49714) EoP High  
蓝牙 AVRC 里的越界写

[CVE-2025-26454](https://nvd.nist.gov/vuln/detail/CVE-2025-26454) EoP High  
ManagedProvisioning app 里读取其他 app 提供的 disclaimer 中的 URI 时需要检查权限，以免发生跨用户读取。  
我觉得这个修复是错的，代码里使用 `Binder.getCallingUid()` 去拿调用者信息，而 app 传递 disclaimer 是启动 ManagedProvisioning 的一个 activity 在 intent extras 里放 URI，这里根本就在主线程而非 binder 调用线程（启动 Activity 也不是直接 app -> ManagedProvisioning 这样的直接 binder 调用），返回的只会是 ManagedProvisioning 自己的 uid。要从 Activity 拿调用者应该使用 `Activity.getLaunchedFromPackage()` 或者 `Activity.getLaunchedFromUid()` 。  
但是补丁中的另一个问题又刚好阻止了利用：它调用 `Context.checkUriPermission()` 去检查权限，这个函数只在有人通过 `Intent.FLAG_GRANT_READ_URI_PERMISSION` 显式授权 URI 访问权限的时候会返回 true，所以只在有人显示给 ManagedProvisioning 授权的时候才能再次利用成功。我也不确定这个用错的 `checkUriPermission()` 是不是 bug，注释里有这样一句，所以可能是预期的：

> If a content: URI is passed, the intent should also have the flag Intent.FLAG_GRANT_READ_URI_PERMISSION and the uri should be added to the android.content.ClipData of the intent.

但是说真的，我觉得限制必须手动发出 URI grant 不是很合理。目前我还没找到有其他地方能让 URI 权限被授予给 ManagedProvisioning 的地方，有人找到的话可以跟我交流一下。

[CVE-2025-26464](https://nvd.nist.gov/vuln/detail/CVE-2025-26464) EoP High  
此漏洞由我发现并报告。  
`AppSearchManagerService.executeAppFunction()` 内会使用 `BIND_ALLOW_BACKGROUND_ACTIVITY_STARTS` 标志绑定到 app 提供的服务，造成无限制的 BAL 绕过。只影响 15，因为这块代码是意外留在 android 15 里的，16 上这块功能已经被移动到了 `AppFunctionManagerService` 里。补丁把遗留代码给移除了。

[CVE-2025-32321](https://nvd.nist.gov/vuln/detail/CVE-2025-32321) EoP High  
AccountTypePreferenceLoader 内检查 intent 确认安全之后显式设置 component 让它变成一个显式 intent，如果是隐式 intent 的话，从 resolve intent 到 startActivity 中间存在一个时间窗口，可能会存在系统里面有什么东西改变了导致两边解析到不同的 activity。这种漏洞的典型例子就是 [Self-changing Data Type - CVE-2024-40676](https://blog.canyie.top/2024/11/07/self-changing-data-type/) 。  
同时建议阅读 DEFCON 的这篇演讲： [Dead Made Alive Again: Bypassing Intent Destination Checks and Reintroducing LaunchAnyWhere Privilege Escalation (a.k.a BadResolve)](https://media.defcon.org/DEF%20CON%2033/DEF%20CON%2033%20presentations/Qidan%20He%20-%20Dead%20Made%20Alive%20Again%20Bypassing%20Intent%20Destination%20Checks%20and%20Reintroducing%20LaunchAnyWhere%20Privilege%20Escalation.pdf)

[CVE-2025-32323](https://nvd.nist.gov/vuln/detail/CVE-2025-32323) EoP High  
此漏洞由我发现并报告。  
DocumentUI 里显示权限请求对话框的时候包含应用的名字，应用可以在名字里放入误导性的文字和很多个换行把原本真正要显示的警告信息顶出屏幕。很经典的字符串 UI 欺骗漏洞，我之前的文章 [Android 平台常见安全漏洞类型](https://blog.canyie.top/2024/11/05/android-platform-common-vulnerabilities/) 有详细讲解。修复就是把应用名称截断再显示。

[CVE-2025-32326](https://nvd.nist.gov/vuln/detail/CVE-2025-32326) EoP High  
和上面的 CVE-2025-32321 类似，Settings AppRestrictionsFragment 内检查 intent 确认安全之后显式设置 component 让它变成一个显式 intent，防止经典的 TOCTOU race condition。无论是用 [Self-changing Data Type](https://blog.canyie.top/2024/11/07/self-changing-data-type/) 还是 [BadResolve](https://media.defcon.org/DEF%20CON%2033/DEF%20CON%2033%20presentations/Qidan%20He%20-%20Dead%20Made%20Alive%20Again%20Bypassing%20Intent%20Destination%20Checks%20and%20Reintroducing%20LaunchAnyWhere%20Privilege%20Escalation.pdf) 都能很简单地利用。  
这个洞我去年 10 月报过，可惜跟 CVE-2025-0091 一样是 duplicate，然后等了差不多一年才修好，挺好的

[CVE-2025-32327](https://nvd.nist.gov/vuln/detail/CVE-2025-32327) EoP High  
MediaProvider 中的 SQL 注入，补丁在 `queryMediaIdForAppsLocked()` 过滤掉了意外出现的值，保证不会被返回给调用者。

[CVE-2025-32333](https://nvd.nist.gov/vuln/detail/CVE-2025-32333) EoP High  
把 CVE-2025-26430 的补丁向后移植给 android 14

[CVE-2025-32345](https://nvd.nist.gov/vuln/detail/CVE-2025-32345) EoP High  
CVE-2025-26435 的变体，之前补丁是只禁止访客用户关闭 deceptive app scanning，现在改成禁止所有非管理员用户

[CVE-2025-32346](https://nvd.nist.gov/vuln/detail/CVE-2025-32346) EoP High  
~~截至发稿，此漏洞补丁未公开。~~ 仅给 16 更新了。漏洞描述：

> In onActivityResult of VoicemailSettingsActivity.java, there is a possible work profile contact number leak due to a confused deputy. This could lead to local escalation of privilege with no additional execution privileges needed. User interaction is not needed for exploitation.

更新：补丁出来了，把 VoicemailSettingsActivity onActivityResult 中原本的比较 user id 的跨用户检查改成了使用 android 16 新 api 去检查来源 app 有没有权限读返回的 uri。没看懂咋绕过原先的检查，需要后续分析。  
再更新：应该是使用 `content://com.android.contacts/data_enterprise/phones` 从 work profile 里泄露出联系人号码

[CVE-2025-32347](https://nvd.nist.gov/vuln/detail/CVE-2025-32347) EoP High  
Settings 添加生物认证信息时忽略不可信调用者传递的 PendingIntent。这个地方就是我之前利用 CVE-2025-0100 使用的 trampoline，能够以 Settings 权限 `startIntentSenderForResult()` 我指定的一个 PendingIntent，然后再把收到的 result 通过 `setResult()` 返回给调用者。当时的补丁只修了 MediaProjectPermissionActivity，没有修复这个 trampoline，这次看漏洞描述是能确定设备的位置，怀疑是读的 WifiDialogActivity 的 result，但是我当时也测试过 WifiDialogActivity，并没有成功收到 result，不知道少了什么。这次把 trampoline 一块修了，不知道其他地方还有没有这么好用的东西了。

[CVE-2025-48523](https://nvd.nist.gov/vuln/detail/CVE-2025-48523) EoP High  
Contacts app SelectAccountActivity 之前在刚好只有一个 account 的时候会跳过弹窗自动加载 vcard 文件添加新联系人，补丁把这段特殊处理删了，无论如何都需要用户手动确认

[CVE-2025-48526](https://nvd.nist.gov/vuln/detail/CVE-2025-48526) EoP High  
IntentResolver ChooserActivity 跨 profile 启动 intent 的时候也需要清掉 package 和 component。

[CVE-2025-48531](https://nvd.nist.gov/vuln/detail/CVE-2025-48531) EoP High  
Settings CredentialStorage 内将不安全的 getCallingPackage 换成 getLaunchedFromPackage。

[CVE-2025-48532](https://nvd.nist.gov/vuln/detail/CVE-2025-48532) EoP High  
~~截至发稿，此漏洞补丁未公开。~~ 仅给 16 更新了。漏洞描述：

> In markMediaAsFavorite of MediaProvider.java, there is a possible way to bypass the WRITE_EXTERNAL_STORAGE permission due to a confused deputy. This could lead to local escalation of privilege with no additional execution privileges needed. User interaction is needed for exploitation.

更新：补丁出来了，原本 MediaStore markMediaAsFavorite 这个调用接受一个 ContentValues，app 可以往里面注入其他内容，补丁修改了 MediaProvider 改成不再接受外部 ContentValues，原本通过 ContentValues 传递的 boolean 改成通过 extras 单独传递。

[CVE-2025-48535](https://nvd.nist.gov/vuln/detail/CVE-2025-48535) EoP High  
去年我发现的 CVE-2024-43080 的变体，当时的补丁只在 startActivity() 的时候进行了 new Intent()，但是其实 resolveActivity() 本身也是一个跨进程的 aidl 调用，intent 后面的参数也可能被污染，攻击者可以污染 flags 这个参数让 resolveActivity 解析到攻击者自己的 activity 但是在实际 start 的时候解析到别的 activity，造成 launch anywhere。补丁就是把 new Intent() 给放到了 resolve 前面。  
Parcel Mismatch 不死！Parcel Mismatch 万岁！

[CVE-2025-48541](https://nvd.nist.gov/vuln/detail/CVE-2025-48541) EoP High  
不可信调用者启动 FaceSettings 时忽略其提供的 token、sensor id、challenge、user id 等数据。

[CVE-2025-48544](https://nvd.nist.gov/vuln/detail/CVE-2025-48544) EoP High  
外部攻击者访问 MediaProvider 时可以在提供的 extras 中设置 `INCLUDED_DEFAULT_DIRECTORIES` 越权访问文件，这个 extra 只应该被 MediaProvider 内部使用，补丁把它移出了 bundle 改成作为单独参数提供。

[CVE-2025-48547](https://nvd.nist.gov/vuln/detail/CVE-2025-48547) EoP High  
当且仅当没有任何一次性权限授予给一个 app 的时候才停止这个 app 的 one-time permission session

[CVE-2025-48527](https://nvd.nist.gov/vuln/detail/CVE-2025-48527) ID High  
如果一个用户已经锁定并且设置了锁定时不显示敏感通知信息，那么在设置的 NotificationHistoryActivity 里不要显示这个用户的通知内容。

[CVE-2025-48551](https://nvd.nist.gov/vuln/detail/CVE-2025-48551) ID High  
ChooserActivity 使用启动 chooser 的 user 而非 personal profile 去打开图片编辑器

[CVE-2025-48560](https://nvd.nist.gov/vuln/detail/CVE-2025-48560) ID High  
AbstractAccessibilityServiceConnection 里检查 ACCESSIBILITY_MOTION_EVENT_OBSERVING 权限的代码放在了 `Binder.clearCallingIdentity()` 后面，造成权限绕过。

[CVE-2025-48524](https://nvd.nist.gov/vuln/detail/CVE-2025-48524) DoS High  
此漏洞由我发现并报告。  
和上面的 CVE-2025-48545 类似，wifi 模块内也存在着不安全的权限检查，如果调用者是系统 app 就放行，因此可被 SDK Sandbox 绕过。

[CVE-2025-48534](https://nvd.nist.gov/vuln/detail/CVE-2025-48534) DoS High  
小区广播服务（CellBroadcastService）查找默认的 CellBroadcastReceiver app 时需要指定 `MATCH_SYSTEM_ONLY` flag，仅匹配系统应用，防止被第三方恶意应用抢占影响可用性。

## 2025-08-01

连补丁链接都不给了，还要我手动去翻，差评

### Framework

[CVE-2025-22441](https://nvd.nist.gov/vuln/detail/CVE-2025-22441) EoP High  
补丁：  
[https://android.googlesource.com/platform/frameworks/base/+/60335b2eae7311fe6e10e140b64489008a38a5a8](https://android.googlesource.com/platform/frameworks/base/+/60335b2eae7311fe6e10e140b64489008a38a5a8)  
[https://android.googlesource.com/platform/frameworks/base/+/37bf5823504f2a256f128123393cd149721b87fc](https://android.googlesource.com/platform/frameworks/base/+/37bf5823504f2a256f128123393cd149721b87fc)  
漏洞描述：

> In getContextForResourcesEnsuringCorrectCachedApkPaths of RemoteViews.java, there is a possible way to load arbitrary java code in a privileged context due to a confused deputy. This could lead to local escalation of privilege with no additional execution privileges needed. User interaction is needed for exploitation.

最大的变化就是，补丁去掉了两个地方的 `LoadedApk.checkAndUpdateApkPaths()` 调用。点进去可以发现，这个方法会更新当前进程的 `ApplicationInfo` 、 `sourceDir` 等字段，把 `librarySearchPath` 加入到 ClassLoader 内，但由于 `makePaths()` 被调用了两次，如果当前 LoadedApk 已经有一个 ClassLoader 并不会将新的 sourceDir 直接添加进 ClassLoader。 `librarySearchPath` 需要进程调用 `System.loadLibrary()` 才会被用到，考虑到新的 `librarySearchPath` 会位于数组末尾，且漏洞描述是加载 java 代码，目前还不清楚具体如何做到代码执行。如果有人复现成功的话可以和我交流一下。

更新：  
[https://github.com/michalbednarski/ResourcePoison](https://github.com/michalbednarski/ResourcePoison)

[CVE-2025-48533](https://nvd.nist.gov/vuln/detail/CVE-2025-48533) EoP High  
补丁：  
[https://android.googlesource.com/platform/frameworks/base/+/1ac00dac4a161ca6bef252ed36646c4b125132d0](https://android.googlesource.com/platform/frameworks/base/+/1ac00dac4a161ca6bef252ed36646c4b125132d0)  
窗口管理模块的 race condition，可以在锁屏上通过一个可以显示在锁屏上的 app 的 context menu 启动另一个 `showWhenLocked=false` 的 activity。

### System

[CVE-2025-48530](https://nvd.nist.gov/vuln/detail/CVE-2025-48530) RCE Critical  
补丁：  
[https://android.googlesource.com/platform/external/rust/crabbyavif/+/87124e11e14f2f6fed75d57f5723ddab37cd4bff](https://android.googlesource.com/platform/external/rust/crabbyavif/+/87124e11e14f2f6fed75d57f5723ddab37cd4bff)  
crabbyavif （AVIF 解析模块）里 Rust 写出来的越界访问，看补丁加了一堆 round up，应该又是 size 计算的问题。只影响 16

## 2025-07-01

谷歌放鸽子，啥也没有，没想到吧  
又可以偷懒一个月了

## 2025-06-01

### Android Runtime

[CVE-2025-26456](https://nvd.nist.gov/vuln/detail/CVE-2025-26456) DoS High  
DexUseManager 内限制 dex 使用记录的数据的大小。

### Framework

[CVE-2025-26450](https://nvd.nist.gov/vuln/detail/CVE-2025-26450) EoP High  
KeyEvent 发送给输入法之前先验证其确实来自系统，且其不是太早之前产生的（防止重放攻击）

[CVE-2025-26452](https://nvd.nist.gov/vuln/detail/CVE-2025-26452) EoP High  
ResourcesImpl 加载 FRRO 的时候保证其确实是一个 FRRO （在 /data/resource-cache/ 下并且以.frro 结尾）。看漏洞描述是可以读其他 task 的快照

[CVE-2025-26455](https://nvd.nist.gov/vuln/detail/CVE-2025-26455) EoP High  
`AMediaCodec_getInputBuffer` 和 `AMediaCodec_getOutputBuffer` 两个函数的返回值相关的越界写入问题

[CVE-2025-26458](https://nvd.nist.gov/vuln/detail/CVE-2025-26458) EoP High  
LocationProviderManager 内发送 PendingIntent 的时候加上 `setPendingIntentBackgroundActivityLaunchAllowed(false)` 阻止 BAL

[CVE-2025-26462](https://nvd.nist.gov/vuln/detail/CVE-2025-26462) EoP High  
AccessibilityService onBind() 返回 null 时需要 unbind，防止 BAL

[CVE-2025-32312](https://nvd.nist.gov/vuln/detail/CVE-2025-32312) EoP High  
PackageParser 校验输入类名必须是一个 IntentInfo 的子类，防止调用任意 class 的构造函数。这个补丁打断了 [https://github.com/michalbednarski/TheLastBundleMismatch](https://github.com/michalbednarski/TheLastBundleMismatch) 里用到的 trampoline，防止绕过 lazy value 保护创造出 self-changing bundle。

[CVE-2025-26437](https://nvd.nist.gov/vuln/detail/CVE-2025-26437) ID High  
CredentialManagerService getCandidateCredentials() 校验调用者必须是默认的 Credential Autofill service，只影响 15

[CVE-2025-26448](https://nvd.nist.gov/vuln/detail/CVE-2025-26448) ID High  
CursorWindow 内使用 calloc 代替 malloc 避免未初始化内存

[CVE-2025-26432](https://nvd.nist.gov/vuln/detail/CVE-2025-26432) DoS High  
CompanionDeviceManagerService setAssociationTag 限制 tag 最大长度为 1024。只影响 15

[CVE-2025-26449](https://nvd.nist.gov/vuln/detail/CVE-2025-26449) DoS High  
传递 AutomaticZenRule 和 ZenModeConfig 时使用 ParceledListSlice ，防止单次数据量过大超过 binder 传输大小上限

[CVE-2025-26463](https://nvd.nist.gov/vuln/detail/CVE-2025-26463) DoS High  
BlobStoreManager allowPackageAccess 内限制传入包名和证书的大小。

### System

[CVE-2025-26443](https://nvd.nist.gov/vuln/detail/CVE-2025-26443) EoP High  
ManagedProvisioning HtmlToSpannedParser 内限制传入的 url 必须是 http 或 https 的，看漏洞描述是可以安装 app，猜测是使用 file 或者 content 的 uri。其实没看懂咋做到的，明明 createIntent 内部有一个一模一样的检查，为什么要在外面再加一个？

更新：经提醒，URLSpan 内有一个默认的 onClick 实现，会发送 Intent.ACTION_VIEW 尝试打开 url。

```java
@Override
public void onClick(View widget) {
    Uri uri = Uri.parse(getURL());
    Context context = widget.getContext();
    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
    intent.putExtra(Browser.EXTRA_APPLICATION_ID, context.getPackageName());
    try {
        context.startActivity(intent);
    } catch (ActivityNotFoundException e) {
        Log.w("URLSpan", "Activity was not found for intent, " + intent.toString());
    }
}
```

[CVE-2025-26441](https://nvd.nist.gov/vuln/detail/CVE-2025-26441) ID High  
蓝牙协议栈 sdp_discovery.cc 中的越界读取

[CVE-2025-26445](https://nvd.nist.gov/vuln/detail/CVE-2025-26445) ID High  
ConnectivityService offerNetwork 添加权限检查。

[CVE-2025-26453](https://nvd.nist.gov/vuln/detail/CVE-2025-26453) ID High  
蓝牙 BluetoothOppSendFileInfo 内读取 decode 过的 Authority 再手动解析 user id 而非使用 getUserInfo，防止被 encoded 的 @ 字符绕过检查，跟之前的 CVE-2025-0082/CVE-2025-0083 类似。

## 2025-05-01

在野利用漏洞： [CVE-2025-27363](https://nvd.nist.gov/vuln/detail/CVE-2025-27363) ，终于不是 USB 了

### Framework

[CVE-2023-21342](https://nvd.nist.gov/vuln/detail/CVE-2023-21342) EoP High  
绑定到应用提供的 speech RecognitionService 时不指定 BIND_ALLOW_BACKGROUND_ACTIVITY_STARTS 标记，避免 BAL bypass  
Android 14 就修了的洞，现在 backport 给 13

[CVE-2024-34739](https://nvd.nist.gov/vuln/detail/CVE-2024-34739) EoP High  
去年八月就放过一遍，不知道为什么又放了一遍。设置向导未完成时，插入 USB 设备不弹出 activity，避免 FRP 绕过。

[CVE-2025-0077](https://nvd.nist.gov/vuln/detail/CVE-2025-0077) EoP High  
切换用户过程中的 race condition，有概率导致切换到其他用户后不显示目标用户设置的锁屏。只影响 15。  
这个问题我很早也注意到了，可惜一直没能稳定复现出来。

[CVE-2025-0087](https://nvd.nist.gov/vuln/detail/CVE-2025-0087) EoP High  
PackageInstaller 内的逻辑 bug，请求为其他用户卸载 app 时只在当前用户是目标用户的父用户的情况下才允许。

[CVE-2025-22425](https://nvd.nist.gov/vuln/detail/CVE-2025-22425) EoP High  
PackageInstaller 内使用了不安全的 getCallingPackage 函数获取调用者，可能被伪造结果，改成使用 getLaunchedFromPackage。

[CVE-2025-26422](https://nvd.nist.gov/vuln/detail/CVE-2025-26422) EoP High  
WindowManagerService dump 函数内的权限检查放错了位置，调用者传递 `--high-priority` 参数的时候不会检查权限，造成敏感信息泄露。只影响 15。

[CVE-2025-26426](https://nvd.nist.gov/vuln/detail/CVE-2025-26426) EoP High  
registerReceiver 在调用者给定 `caller package = "android"` 时需要保证 calling uid 真的是 core uid。

[CVE-2025-26427](https://nvd.nist.gov/vuln/detail/CVE-2025-26427) EoP High  
跟 CVE-2024-0032 一样，限制不让访问 /sdcard/Android/data。不知道同一个漏洞还能放多少遍。。。

[CVE-2025-26428](https://nvd.nist.gov/vuln/detail/CVE-2025-26428) EoP High  
如果当前 task 已经进入 lock task mode，忽略后续的 app pinning 请求。

[CVE-2025-26436](https://nvd.nist.gov/vuln/detail/CVE-2025-26436) EoP High  
清楚一个 PendingIntentRecord 的 BAL token 的时候也要顺带清掉它带的 allowlist duration。

[CVE-2025-26440](https://nvd.nist.gov/vuln/detail/CVE-2025-26440) EoP High  
CameraService 优化 app 前后台状态改变时的处理代码，避免后台 app 仍然能使用摄像头的问题

[CVE-2025-26444](https://nvd.nist.gov/vuln/detail/CVE-2025-26444) EoP High  
VoiceInteractionManagerService 会在用户强行停止第三方语音助手时将目前选择的语音助手设置成系统默认的，重设 ROLE_ASSISTANT 会导致额外权限被授权给默认的语音助手，这不是合理的行为所以删除相关处理。

[CVE-2025-26424](https://nvd.nist.gov/vuln/detail/CVE-2025-26424) ID High  
VpnManagerService 新增的 getFromVpnProfileStore、putIntoVpnProfileStore、removeFromVpnProfileStore、listFromVpnProfileStore 添加权限检查。只影响 15

[CVE-2025-26442](https://nvd.nist.gov/vuln/detail/CVE-2025-26442) ID High  
之前 CVE-2024-49742 的补丁有问题，错误的检查了 resolve 出来的组件的包名而非整个组件名，所以可以通过声明两个组件的方式来绕过补丁。

[CVE-2025-26429](https://nvd.nist.gov/vuln/detail/CVE-2025-26429) DoS High  
AppOpsService collectOps 内限制返回的数据大小，避免过大超过 binder 数据传输大小限制造成异常。

### System

[CVE-2025-27363](https://nvd.nist.gov/vuln/detail/CVE-2025-27363) RCE High  
上游 freetype 中的整数溢出 bug

[CVE-2025-26420](https://nvd.nist.gov/vuln/detail/CVE-2025-26420) EoP High  
官方未放出此漏洞补丁链接，手动查找得到：  
[https://android.googlesource.com/platform/packages/modules/Permission/+/5c07da90f7ae911b9e64d4e34871b7d2115a0a7f](https://android.googlesource.com/platform/packages/modules/Permission/+/5c07da90f7ae911b9e64d4e34871b7d2115a0a7f)  
看起来是显示多个权限请求对话框时的内容遮盖问题。官方给出的漏洞描述：

> In multiple functions of GrantPermissionsActivity.java, there is a possible way to trick the user into granting the incorrect permission due to permission overload. This could lead to local escalation of privilege with no additional execution privileges needed. User interaction is not needed for exploitation.

[CVE-2025-26421](https://nvd.nist.gov/vuln/detail/CVE-2025-26421) EoP High  
添加了一个可以自定义的 config_biometric_protected_package_names，当用户在设置里尝试强行停止、禁用或卸载这些被保护的 app 的更新时要求用户验证身份再继续。没太看懂，漏洞描述：

> In multiple locations, there is a possible lock screen bypass due to a logic error in the code. This could lead to local escalation of privilege with no additional execution privileges needed. User interaction is not needed for exploitation.

[CVE-2025-26423](https://nvd.nist.gov/vuln/detail/CVE-2025-26423) EoP High  
添加 Wi-Fi 网络时检查附带的 IpConfiguration 和 ProxyInfo 的大小。

[CVE-2025-26425](https://nvd.nist.gov/vuln/detail/CVE-2025-26425) EoP High  
RoleService 的 getDefaultApplicationAsUser/setDefaultApplicationAsUser 两个 API 限制只能在 Android 14+ 上被调用，因为里面是通过检查 MANAGE_DEFAULT_APPLICATIONS 这个权限来确保这些 API 不被滥用的，在 Android 13 或更低版本的系统上 MANAGE_DEFAULT_APPLICATIONS 权限并不存在，所以第三方 app 可以自己定义这个权限然后给自己授权从而绕过 RoleService 里面的检查。

[CVE-2025-26430](https://nvd.nist.gov/vuln/detail/CVE-2025-26430) EoP High  
Settings SpaAppBridgeActivity 里检查 package name 只能包含合法字符串，猜测是注入 / 字符伪造后面的 user id

[CVE-2025-26435](https://nvd.nist.gov/vuln/detail/CVE-2025-26435) EoP High  
禁止访客用户禁用 deceptive app scanning

[CVE-2025-26438](https://nvd.nist.gov/vuln/detail/CVE-2025-26438) EoP High  
蓝牙 SMP 协议实现中的验证绕过 bug

[CVE-2023-35657](https://nvd.nist.gov/vuln/detail/CVE-2023-35657) ID High  
蓝牙 BTA 层的类型混淆，会导致越界读

## 2025-04-01

Android 12 & 12L 的支持已于本月结束，呜呜呜  
在野利用漏洞： [CVE-2024-53150](https://nvd.nist.gov/vuln/detail/CVE-2024-53150) 、 [CVE-2024-53197](https://nvd.nist.gov/vuln/detail/CVE-2024-53197) ，都是内核 USB 模块

### Framework

[CVE-2025-22429](https://nvd.nist.gov/vuln/detail/CVE-2025-22429) ID Critical  
bundle 解析过程中的逻辑 bug，try 块中调用 readArrayMap 解析其值，finally 块中判断若 lazy value 数量为 0 则说明不需要 lazy unparcel，直接释放 parcel。但这个 lazy value 数量是使用 readArrayMap 的返回值来描述的，如果 readArrayMap 已经成功创建了一些 LazyValue 但在后续解析过程中抛出异常，由于 readArrayMap 并没有正常返回自然也就没有返回值，此时上层记录的 lazy value 数量还是 0，parcel 在 finally 中被释放，后续 LazyValue 再使用 parcel 就会产生 UAF。注意，若进程开启了 Defuse （在 system_server 内满足此条件），对 BadParcelableException 的 catch 块内清空了 map，而从代码上来看失去引用的 LazyValue 并不会操作 parcel，所以我猜测想实际触发这个漏洞需要一个并非 BadParcelableException 但在上层被 catch 的异常才能让 LazyValue 驻留在 map 里？  
类似之前的 leak value，但在没有另一个能倒退 parcel position 的漏洞的情况下是否能像之前那样利用？从漏洞描述上来看应该是做到了代码执行的

[CVE-2025-22416](https://nvd.nist.gov/vuln/detail/CVE-2025-22416) EoP High  
ChooserActivity 预览 ChooserTarget 的 icon 时先检查是否有权限读取 uri。

[CVE-2025-22417](https://nvd.nist.gov/vuln/detail/CVE-2025-22417) EoP High  
WindowManager transaction 过程中的 race condition，看的不是很明白。漏洞描述：

> In finishTransition of Transition.java, there is a possible way to bypass touch filtering restrictions due to a tapjacking/overlay attack. This could lead to local escalation of privilege with no additional execution privileges needed. User interaction is needed for exploitation.

[CVE-2025-22422](https://nvd.nist.gov/vuln/detail/CVE-2025-22422) EoP High  
System UI 处理 authentication prompt 时的逻辑 bug，当 top app 和 client app 不一样时说明可能真正请求验证的 app 已经被恶意 app 顶到了后台，用户看见的可能是恶意 app 显示的内容（类似 task hijacking），这个时候需要告知原来的 client 验证失败。但是在使用了 createConfirmDeviceCredentialIntent （会 resolve 到 settings 的 ConfirmDeviceCredentialActivity）而非手动调用 BiometricPrompt 进行验证的情况，此时直接发起验证流程的 client package 是 settings，即使后续 top activity 变成了 settings 的其他 activitiy，这个判断也会认为 top app 并没有改变从而不会取消验证请求。利用这个 bug 应该需要能找到足够具有迷惑性的 activity 所以应该还挺麻烦的？补丁加了一个 top activity 的 class name 检查。  
相关引用： [CVE-2020-27059](https://android.googlesource.com/platform/frameworks/base/+/9588cd7de1f84a3ec8de273fb7d75921024189d8%5E%21/#F0)

[CVE-2025-22424](https://nvd.nist.gov/vuln/detail/CVE-2025-22424) EoP High  
[CVE-2025-22426](https://nvd.nist.gov/vuln/detail/CVE-2025-22426) EoP High  
pm ComputerEngine resolveContentProvider 同时接收 uri 的 authority 和 user id，但调用者可能会把 user id 存储在 authority 内，要把这个 user id 提取出来。不太清楚具体是哪里可能会发生这种情况，感觉挺有意思的

[CVE-2025-22434](https://nvd.nist.gov/vuln/detail/CVE-2025-22434) EoP High  
用户点击键盘上打开系统设置的快捷键时没有检查是否有锁屏就直接打开了设置 app，造成锁屏绕过。

[CVE-2025-22437](https://nvd.nist.gov/vuln/detail/CVE-2025-22437) EoP High  
注意官方公告放错了补丁！！官方公告里放的补丁和 CVE-2024-49728 一致，但是正确的补丁其实是 [https://android.googlesource.com/platform/frameworks/base/+/25d6165d462ad8fe83ea8dd254214a420bc1a526](https://android.googlesource.com/platform/frameworks/base/+/25d6165d462ad8fe83ea8dd254214a420bc1a526)  
其实这个漏洞和 2023 年 11 月公告 CVE-2023-40111 是一样的，当时可能由于兼容性考虑只给 android 14 上了这个 patch，现在可能是觉得不妥当又给 backport 到了 13。

[CVE-2025-22438](https://nvd.nist.gov/vuln/detail/CVE-2025-22438) EoP High  
input dispatcher 里的加锁问题，会导致 dispatchEntry 这个变量 UAF

[CVE-2025-22442](https://nvd.nist.gov/vuln/detail/CVE-2025-22442) EoP High  
work profile 默认禁用开发者选项，看漏洞描述是能往 profile 里装 app

[CVE-2024-49722](https://nvd.nist.gov/vuln/detail/CVE-2024-49722) ID High  
在系统设置里更换用户头像的时候使用显式 intent 进行图片选择，确保只启动系统自己的头像选择器。  
（这个问题反反复复修复几遍怎么又来了？之前测试过这里没能测出什么问题，这次只给 15 更新了，可能是新版本又加了什么东西）

[CVE-2025-22421](https://nvd.nist.gov/vuln/detail/CVE-2025-22421) ID High  
通知的 content description （用于无障碍）里不要包含通知内容，否则可能会被读屏软件在没解锁屏幕的时候就读出来

[CVE-2025-22430](https://nvd.nist.gov/vuln/detail/CVE-2025-22430) ID High  
TrustManager 新增的 isInSignificantPlace 方法需要 ACCESS_FINE_LOCATION 权限。只影响 15

[CVE-2025-22431](https://nvd.nist.gov/vuln/detail/CVE-2025-22431) DoS High  
AppOpsService 内即使直接调用者可信也不应该直接信任由 proxy app 提供的 proxied attribution tag，改为只在没有 proxy app 或其是系统 app 时才信任

### System

[CVE-2025-26416](https://nvd.nist.gov/vuln/detail/CVE-2025-26416) EoP Critical  
skia 解码 bmp 图片时的 ~~未初始化变量~~  
更新：似乎只是逻辑错误造成的堆溢出

[CVE-2025-22423](https://nvd.nist.gov/vuln/detail/CVE-2025-22423) DoS Critical  
dng_sdk 里如果 tag count 非法则提前返回，避免后续崩溃

[CVE-2024-40653](https://nvd.nist.gov/vuln/detail/CVE-2024-40653) EoP High  
Telecomm 里如果绑定到 ConnectionService 后 15 秒还没有响应就解绑

[CVE-2024-49720](https://nvd.nist.gov/vuln/detail/CVE-2024-49720) EoP High  
通过 role 授予权限时把用户之前对该权限选择的“每次都询问”视为有效的用户决定，不要去覆盖它

[CVE-2024-49730](https://nvd.nist.gov/vuln/detail/CVE-2024-49730) EoP High  
fuse daemon 内增大 MAX_READ_SIZE，看描述是 oob write

[CVE-2025-22418](https://nvd.nist.gov/vuln/detail/CVE-2025-22418) EoP High  
系统设置内选择铃声的 intent 指定包名，怀疑跟之前那堆铃声漏洞（CVE-2023-40108、CVE-2023-40132）是一样的

[CVE-2025-22419](https://nvd.nist.gov/vuln/detail/CVE-2025-22419) EoP High  
telephony app 多个 activity 添加 flag 防止被悬浮窗覆盖。

[CVE-2025-22427](https://nvd.nist.gov/vuln/detail/CVE-2025-22427) EoP High  
settings NotificationAccessConfirmationActivity 错误地将 SYSTEM_FLAG_HIDE_NON_SYSTEM_OVERLAY_WINDOWS 传递给 addFlags （作为一个 system flag 应该使用 addSystemFlags/addPrivateFlags），导致其被错误解释为了 FLAG_SHOW_WHEN_LOCKED 从而显示在了锁屏之上，不解锁就可以授权。

[CVE-2025-22428](https://nvd.nist.gov/vuln/detail/CVE-2025-22428) EoP High  
在我之前那个 CVE-2024-43088 的补丁基础之上把检查 calling package 的权限更换为了检查 calling uid 的权限。不是很懂， ~~猜测是可能有一个 app 在主用户上有跨用户权限但在次用户上没权限的情况？~~  
更新： [https://konata.github.io/posts/identity-squashing/](https://konata.github.io/posts/identity-squashing/)

[CVE-2025-22432](https://nvd.nist.gov/vuln/detail/CVE-2025-22432) EoP High  
此漏洞由我发现并报告。  
telecomm 内使用了 BIND_ALLOW_BACKGROUND_ACTIVITY_STARTS 来 bind CallRedirectionSevice（其是 BAL 豁免名单之一），所以响应超时了也需要 unbind，否则会导致 BAL bypass。更多内容可见于 [https://wrlus.com/android-security/bindservice-error-handle/](https://wrlus.com/android-security/bindservice-error-handle/)

[CVE-2025-22433](https://nvd.nist.gov/vuln/detail/CVE-2025-22433) EoP High  
IntentForwarderActivity 内检查 intent 是否可以被转发到其他 profile 时的逻辑 bug，如果 intent 有 selector 那这个 intent 本身和 selector 都要被检查。

[CVE-2025-22435](https://nvd.nist.gov/vuln/detail/CVE-2025-22435) EoP High  
蓝牙 AVDT 协议实现里增加了一个消息类型检查，防止可能的类型混淆

[CVE-2025-22439](https://nvd.nist.gov/vuln/detail/CVE-2025-22439) EoP High  
DocumentUI 加载 last accessed stack 记录的 uri 时忘记校验 uri，可以绕过存储限制授权

[CVE-2024-49728](https://nvd.nist.gov/vuln/detail/CVE-2024-49728) ID High  
通过蓝牙发送文件时检查传递的 uri 是否为指向其他用户的 uri。印象中很久以前我是测试过这里的，没利用成功，不知道咋复现的

## 2025-03-01

在野利用漏洞： [CVE-2024-43093](https://nvd.nist.gov/vuln/detail/CVE-2024-43093) 、 [CVE-2024-50302](https://nvd.nist.gov/vuln/detail/CVE-2024-50302)  
懒得放补丁链接了，自己去官方公告里面找吧

### Framework

[CVE-2024-0032](https://nvd.nist.gov/vuln/detail/CVE-2024-0032) EoP High  
去年2月补丁里放过的，限制通过 SAF 访问 /sdcard/Android/data。不知道为啥重新放了一遍。

[CVE-2024-43093](https://nvd.nist.gov/vuln/detail/CVE-2024-43093) EoP High  
跟去年11月补丁的一样，自己去看去年的分析吧，懒得再写一遍了。去年忘了给 12L 更新，重新放一遍。

[CVE-2025-0078](https://nvd.nist.gov/vuln/detail/CVE-2025-0078) EoP High  
service manager 注册自己的时候需要打开 requesting sid 从而可以正确检索 caller 的 selinux context。关于 requesting sid 的更多信息见 [https://project-zero.issues.chromium.org/issues/42450815](https://project-zero.issues.chromium.org/issues/42450815) （CVE-2019-2023 及相关的一系列漏洞）

[CVE-2025-0080](https://nvd.nist.gov/vuln/detail/CVE-2025-0080) EoP High  
PackageInstaller unarchive app 的对话框添加 flag 防止被 overlay。

[CVE-2024-43090](https://nvd.nist.gov/vuln/detail/CVE-2024-43090) ID High  
此漏洞由我发现并报告。  
去年11月放过的，systemui 里面的 icon 跨用户泄露，当时在 Android 15 上忘了启用相关 flag 导致补丁没生效，所以重新放一遍

[CVE-2025-0083](https://nvd.nist.gov/vuln/detail/CVE-2025-0083) ID High  
telecom 内使用 getAuthority() 然后手动解析 @ 字符前面的内容去获取 uri 内的 user id 而非使用 getEncodedUserInfo。从 commit message 内大概可以猜测是把 @ 字符使用 uri encode 的格式来绕过原来的补丁。

[CVE-2025-0086](https://nvd.nist.gov/vuln/detail/CVE-2025-0086) ID High  
AccountManagerService getAuthToken 校验 Authenticator 返回的 account type，避免读到其他 account 数据。

[CVE-2024-49740](https://nvd.nist.gov/vuln/detail/CVE-2024-49740) DoS High  
telephony 限制 VisualVoicemailSmsFilterSettings 必须由默认拨号 app 设置，同时限制其内容的大小

### System

下面有很多一个补丁链接对应多个漏洞的情况，不一一复制粘贴了，看得明白就行

[CVE-2025-0074](https://nvd.nist.gov/vuln/detail/CVE-2025-0074) RCE Critical  
[CVE-2025-22403](https://nvd.nist.gov/vuln/detail/CVE-2025-22403) RCE Critical  
bluetooth sdp sdp_discovery.cc 内两处出错 log 里使用了可能已经被释放掉的指针，造成 UAF。真的能造成 RCE？我持怀疑态度。只影响 15。

[CVE-2025-0075](https://nvd.nist.gov/vuln/detail/CVE-2025-0075) RCE Critical  
sdp_server.cc log 语句内的 UAF，跟上面一样。只影响 15。

[CVE-2025-0084](https://nvd.nist.gov/vuln/detail/CVE-2025-0084) RCE Critical  
蓝牙 SDP 协议实现中，同一个客户端发起多个连接可能导致 UAF

[CVE-2025-22408](https://nvd.nist.gov/vuln/detail/CVE-2025-22408) RCE Critical  
[CVE-2025-22410](https://nvd.nist.gov/vuln/detail/CVE-2025-22410) RCE Critical  
[CVE-2025-22411](https://nvd.nist.gov/vuln/detail/CVE-2025-22411) RCE Critical  
[CVE-2025-22412](https://nvd.nist.gov/vuln/detail/CVE-2025-22412) RCE Critical  
[CVE-2025-22409](https://nvd.nist.gov/vuln/detail/CVE-2025-22409) EoP Critical  
[CVE-2025-22404](https://nvd.nist.gov/vuln/detail/CVE-2025-22404) EoP High  
[CVE-2025-22405](https://nvd.nist.gov/vuln/detail/CVE-2025-22405) EoP High  
[CVE-2025-22406](https://nvd.nist.gov/vuln/detail/CVE-2025-22406) EoP High  
[CVE-2025-22407](https://nvd.nist.gov/vuln/detail/CVE-2025-22407) ID High  
跟上面一堆是类似问题，蓝牙 log 内可能使用已经被释放的变量导致 UAF。真的有必要搞这么多 CVE？只影响 15。

[CVE-2025-0081](https://nvd.nist.gov/vuln/detail/CVE-2025-0081) DoS Critical  
解析 jpeg 时如果哈夫曼表为空直接 abort

[CVE-2023-21125](https://nvd.nist.gov/vuln/detail/CVE-2023-21125) EoP High  
蓝牙 btif/src/btif_hh.cc 内的 UAF 问题

[CVE-2025-0079](https://nvd.nist.gov/vuln/detail/CVE-2025-0079) EoP High  
蓝牙 AVCTP/AVDTP 指定 BTA_SEC_ENCRYPT 保证加密传输

[CVE-2025-0082](https://nvd.nist.gov/vuln/detail/CVE-2025-0082) ID High  
补丁跟上面的 CVE-2025-0083 是一样的。

[CVE-2025-0092](https://nvd.nist.gov/vuln/detail/CVE-2025-0092) ID High  
[CVE-2025-0093](https://nvd.nist.gov/vuln/detail/CVE-2025-0093) ID High  
蓝牙设备解除绑定时重置短信、通讯录、SIM 权限授权状态

[CVE-2025-26417](https://nvd.nist.gov/vuln/detail/CVE-2025-26417) ID High  
将已经下载好的文件插入进 DownloadProvider （DownloadManager.addCompletedDownload）时，确保路径对应文件的所有者与调用者匹配，否则恶意应用可以通过插入操作产生的 DownloadProvider 的 id 通过 DownloadProvider 的权限访问该文件

## 2025-02-01

可能的被在野利用漏洞： [CVE-2024-53104](https://nvd.nist.gov/vuln/detail/CVE-2024-53104) ，内核中 USB 模块的越界写入

### Framework

[CVE-2024-49721](https://nvd.nist.gov/vuln/detail/CVE-2024-49721) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/7714ccb85ed961083dcc97e230c71242c3422b5e)  
见 [CVE-2024-49721 InputMethodSubtypeArray 反序列化漏洞分析](https://blog.canyie.top/2025/02/04/CVE-2024-49721/)

[CVE-2024-49743](https://nvd.nist.gov/vuln/detail/CVE-2024-49743) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/72a3d2d72c39fd48f0a960a1b3c1e16e307421df) [2](https://android.googlesource.com/platform/frameworks/base/+/b8a1a5d47c3916fe08deefaefd8772092b4fb03c) [3](https://android.googlesource.com/platform/frameworks/base/+/f1fd60bb80f9ea95c61b5392102a4afedd948188)  
这个漏洞比较复杂，后续会单独发文章解析，敬请期待

[CVE-2024-49746](https://nvd.nist.gov/vuln/detail/CVE-2024-49746) EoP High [1](https://android.googlesource.com/platform/frameworks/native/+/9aaf913c6f0efc93e805a6baa02d2077108809e1) [2](https://android.googlesource.com/platform/frameworks/native/+/b3cdb06ab9137a67e4ee212ae6655de383fdaaaa)  
Parcel::continueWrite 中的 fd 处理问题，看起来是会错误 close 掉不该被关闭的 fd？还加了很多溢出的检查

更新：  
[https://github.com/michalbednarski/ThisSeemsWrong](https://github.com/michalbednarski/ThisSeemsWrong)

[CVE-2025-0097](https://nvd.nist.gov/vuln/detail/CVE-2025-0097) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/a4a8fca641b0671a8c1d2bb3857dc5fc40d01704)  
WindowManagerService transferTouchGesture 中除了校验 token 还需要校验 calling uid 跟 owner uid 相等。只影响 15

[CVE-2025-0098](https://nvd.nist.gov/vuln/detail/CVE-2025-0098) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/9515a9448c528d45c9b673e2e9b61971bc7e58c1)  
TaskFragmentOrganizerController 内会检查 activity 的 pid 与注册 organizer 的时候的 calling pid 是否相等，如果不相等说明不是同一个进程，这个时候不发送 activity token 以避免它泄露。但是这个检查存在缺陷，因为如果 app 进行 binder transact 的时候指定了 FLAG_ONEWAY，说明这是一个异步调用，这个时候被调用者拿到的 calling pid 会是 0，以此可以泄露出 pid 是 0 的 ActivityRecord 的 token。什么时候 ActivityRecord 的 pid 是 0？怀疑是 activity 所属的进程已经退出了的时候。只影响 15。

[CVE-2025-0099](https://nvd.nist.gov/vuln/detail/CVE-2025-0099) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/7946586c33503bc383403faec48ffcea39e365ac)  
CompanionDeviceManagerService 新增的 getBackupPayload 和 applyRestoredPayload 这两个函数没有权限检查，应该加上 uid 校验，只允许 system 身份调用。

[CVE-2023-40133](https://nvd.nist.gov/vuln/detail/CVE-2023-40133) ID High  
[CVE-2024-0037](https://nvd.nist.gov/vuln/detail/CVE-2024-0037) ID High  
[1](https://android.googlesource.com/platform/frameworks/base/+/2d1d69e1571c7814661b81a468af127c940a1cd8)  
检查 Autofill 相关的 Slice 中的 Icon URI 是否属于当前用户，避免跨用户泄漏。这个应该是去年就放过一次，不知道为什么又放了一遍

[CVE-2023-40134](https://nvd.nist.gov/vuln/detail/CVE-2023-40134) ID High  
[CVE-2023-40135](https://nvd.nist.gov/vuln/detail/CVE-2023-40135) ID High  
[CVE-2023-40136](https://nvd.nist.gov/vuln/detail/CVE-2023-40136) ID High  
[CVE-2023-40137](https://nvd.nist.gov/vuln/detail/CVE-2023-40137) ID High  
[CVE-2023-40138](https://nvd.nist.gov/vuln/detail/CVE-2023-40138) ID High  
[CVE-2023-40139](https://nvd.nist.gov/vuln/detail/CVE-2023-40139) ID High  
[1](https://android.googlesource.com/platform/frameworks/base/+/08becc8c600f14c5529115cc1a1e0c97cd503f33)  
检查 Autofill 相关 RemoteViews 中 URI 是否全部属于当前用户，避免跨用户泄漏。这个去年也放过一次，同样搞不懂为什么又放

[CVE-2025-0100](https://nvd.nist.gov/vuln/detail/CVE-2025-0100) ID High [1](https://android.googlesource.com/platform/frameworks/base/+/0e462ffab7727e282af15945aeecdb9b1709e4e9)  
此漏洞由我发现并报告。  
SystemUI MediaProjectionPermissionActivity 使用 getCallingPackage 获取调用者然后校验其权限，如果是特权应用就跳过确认环节。但是 getCallingPackage 的返回结果实际上可以被伪造，补丁改成了更准确的 getLaunchedFromPackage。  
这里有一个好玩的点，就是 getCallingPackage 返回的是哪个 app 会收到当前 Activity 返回的结果，所以可以被伪造，但是 SystemUI 需要把 IMediaProjection 返回给调用者然后调用者才能使用它开始录屏，伪造 getCallingPackage 实际上会导致应用收不到返回的 binder 自然也就无法完成后续利用。那么这个看起来触发条件和可用性相悖的漏洞是怎么被利用的呢？这里先卖个关子，读者可以先自己思考思考。在本页面搜索 CVE-2025-32347 可查看答案。

[CVE-2024-49741](https://nvd.nist.gov/vuln/detail/CVE-2024-49741) DoS High [1](https://android.googlesource.com/platform/frameworks/base/+/047bc1ce62f84aa0bd5827b49edb330e1cc2da8b)  
此漏洞由我发现并报告。AppWidgetServiceImpl 中限制一个应用最多可以创建 20 个 host，每个 host 可以拥有 200 个 widget，这个补丁之前是完全没有限制的，所以可能发生超大数据量导致 DoS。

### Platform

[CVE-2025-0094](https://nvd.nist.gov/vuln/detail/CVE-2025-0094) EoP High [1](https://android.googlesource.com/platform/packages/apps/Settings/+/c86bccb4e1d3af30e7e89310a3f176091eb497ef)  
禁止 work profile 打开多用户管理页面，看漏洞描述是可以移除 work profile？

### System

[CVE-2025-0091](https://nvd.nist.gov/vuln/detail/CVE-2025-0091) EoP High [1](https://android.googlesource.com/platform/packages/apps/Settings/+/e3bbc415adb51975aeade545725b6931099d412e)  
在 Settings 应用中的账号管理页面里，禁止启动带有 content URI 的 intent。跟 [Self-changing Data Type - CVE-2024-40676 漏洞分析](https://blog.canyie.top/2024/11/07/self-changing-data-type/) 是同一类漏洞，去年那篇文章一直没发就是为了等这个漏洞审核，可惜 duplicate 了 😭

[CVE-2025-0095](https://nvd.nist.gov/vuln/detail/CVE-2025-0095) EoP High [1](https://android.googlesource.com/platform/packages/apps/Settings/+/4b99ae729036d9d8bb75fa9503c10e7c87b27c2c)  
Settings AppTimeSpentPreference 中使用一个只有 Action 的隐式 Intent 启动 Activity，可能会被恶意应用劫持。补丁给这个 intent 加上了 setPackage。

[CVE-2025-0096](https://nvd.nist.gov/vuln/detail/CVE-2025-0096) EoP High [1](https://android.googlesource.com/platform/hardware/st/nfc/+/58728fc8363b3b073f1561b253da4a42998fed11)  
nfc 模块里面有个 malloc 的 size 写小了，只影响 15

[CVE-2024-49723](https://nvd.nist.gov/vuln/detail/CVE-2024-49723) ID High [1](https://android.googlesource.com/platform/external/conscrypt/+/79117043c54eb2fc91ece695c90938d60904d59f) [2](https://android.googlesource.com/platform/libcore/+/c9d01a45928e0cdd2e6102c1c0ecf23a9de3601f)  
移除 Conscrypt 的 3DES 支持，只给 15 更新了

[CVE-2024-49729](https://nvd.nist.gov/vuln/detail/CVE-2024-49729) ID High [1](https://android.googlesource.com/platform/system/core/+/a1b00e3f3412c6de6fddb53e603264deb248dace)  
fs_mgr/libdm/dm.cpp 中 redact 掉可能的敏感信息，否则会导致其在 bug report 过程中被 dump 出来，泄漏原始加密密钥。

## 2025-01-01

这个月补丁好多，算是解答了上个月的“为什么这么少”的疑问  
大家新年快乐！一直在等补丁链接，等了一个月还没放，只能先发一个不完整版的了  
注：本月补丁链接未放出 以下部分补丁来源为手动还原  
2025/02/24 更新：官方公告里已经放出补丁链接 建议去看官方公告里的；官方公告里移除了 CVE-2023-40108 CVE-2023-40132，不知道为什么

### Framework

[CVE-2024-49724](https://nvd.nist.gov/vuln/detail/CVE-2024-49724) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/0af0a98f5e097e0449b2bc1d797e70429cb3b027)  
AccountManagerService checkKeyIntent 加了个 setComponent 让 intent 变成显式 intent，防止 resolve 到 startActivity 期间某些影响 intent resolve 流程的因素发生改变，导致 TOCTTOU race condition。具体实例： [Self-changing Data Type](https://blog.canyie.top/2024/11/07/self-changing-data-type/) 。

[CVE-2024-49732](https://nvd.nist.gov/vuln/detail/CVE-2024-49732) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/076a97aa32492cc44e863f7ab75494dc0b3bf5ef%5E%21/#F0)  
CompanionDeviceManagerService 里新增的 enablePermissionsSync disablePermissionsSync getPermissionSyncRequest 三个 API 缺少权限检查，补丁限制只有 system uid 可以调用。只影响 15。

[CVE-2024-49735](https://nvd.nist.gov/vuln/detail/CVE-2024-49735) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/a44beb0ca3f788c468748e637a2a947b4b44503e%5E!/#F0)  
存储 NotificationChannel 的时候，限制附带的 VibrationEffect 的大小。

[CVE-2024-49737](https://nvd.nist.gov/vuln/detail/CVE-2024-49737) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/aa31697ed1de3b525a668d8954eabf3e75401e5d)  
调用 startActivityInTaskFragment 的时候已经 clearCallingUid 了，之后在 AMS 里构造 SafeActivityOptions 的时候会拿到自己的 uid，改成调用的时候就主动按照已经记录的 calling uid/pid 构造 SafeActivityOptions 再传过去。只影响 13+。看了眼致谢信息，果然是 Michał Bednarski。

[CVE-2024-49738](https://nvd.nist.gov/vuln/detail/CVE-2024-49738) EoP High [1](https://android.googlesource.com/platform/frameworks/native/+/49eb0ea0816e1fc45101f8b2847d731fc192576f%5E%21/#F0)  
Parcel::writeInplace() 在写入数据之前先校验数据。没太看懂咋触发，看描述是越界写。

[CVE-2024-49744](https://nvd.nist.gov/vuln/detail/CVE-2024-49744) EoP High [1](https://android.googlesource.com/platform/frameworks/base/+/0af0a98f5e097e0449b2bc1d797e70429cb3b027)  
此漏洞由我发现并报告。  
AccountManagerService checkKeyIntentParceledCorrectly 里只检查了 intent 的类型，没有检查再次反序列化后 intent 的类型，可以通过 bundle mismatch 的方式绕过。关于绕过了有什么用，可以查看这一篇： [https://konata.github.io/posts/creator-mismatch/](https://konata.github.io/posts/creator-mismatch/)  
注：这个漏洞看起来很明显，但实际上并不好利用，ChooseTypeAndAccountActivity 或者 AddAccountSettings 等常见利用点都已经在之前的 CVE-2023-20944 跟 CVE-2023-21124 的补丁里加上了 new Intent 使得我们伪造的 intent 并不会直接传递给 startActivity。那么如何触发这个漏洞呢？这里先留一个悬念，读者可以自己先思考思考。

[CVE-2024-49745](https://nvd.nist.gov/vuln/detail/CVE-2024-49745) EoP High [1](https://android.googlesource.com/platform/frameworks/native/+/df99a3903097c70f58ffca2a6e8d815ffeeee2c3%5E%21/#F0)  
Parcel::growData 中如果现在的 data position 已经大于 data size 就直接返回。看漏洞描述是越界写。

[CVE-2023-40108](https://nvd.nist.gov/vuln/detail/CVE-2023-40108) ID High [1](https://github.com/aosp-mirror/platform_frameworks_base/commit/1b234678ec122994ccbfc52ac48aafdad7fdb1ed)  
SettingsProvider 中设置铃声的时候校验这个 URI 确实是一个音频文件。追代码可以看见后面会读取这个 URI 把它写进一个 cache dir 里，这里是以 SettingsProvider 的权限去读取，SettingsProvider 跑在 system_server 里所以是 system 权限，然后这个 cache file 可以通过调用 SettingsProvider 的 openFile() 打开，返回一个 InputStream 而不需要任何权限，所以这里是一个以系统权限读取任意 URI。  
很早就知道的老问题了，属于有生之年系列，最早应该是 CVE-2022-20353 在 Settings 调用铃声选择器的时候加了校验，看代码可以发现 com.android.dialer.app.settings.DefaultRingtonePreference 也有类似问题（这个月的 CVE-2023-40132），而且铃声属于 Settings.System 组，可以被拿到读写系统设置权限的 app 手动触发。这次在根源上修复了，应该不会再有问题了。

[CVE-2024-49733](https://nvd.nist.gov/vuln/detail/CVE-2024-49733) ID High [1](https://android.googlesource.com/platform/frameworks/base/+/f46c1bf872075e55f70aa88303f24ee877fe850f)  
此漏洞由我发现并报告。  
Settings 的 ServiceListing 始终显示被启用了的服务，保证用户也能看见有些校验不通过但是已经被启用的服务。  
感觉类型给错了，应该给 EoP 的

### Media Framework

[CVE-2023-40132](https://nvd.nist.gov/vuln/detail/CVE-2023-40132) EoP High [1](https://github.com/aosp-mirror/platform_frameworks_base/commit/b8c2d03b720f0cc200ac59f6cfb411fddc3b119c) [2](https://github.com/aosp-mirror/platform_frameworks_base/commit/a3d258ea3b916cf97bfc00a7637cd8efea48d138)  
跟上面的 CVE-2023-40108 是一个问题，不再重复解释了。这个补丁比上面那个补丁更早，是在运行在客户端的 RingtoneManager 里也加上文件类型检查，应该是给 com.android.dialer 或者其他 app 的情况用的。上面那个补丁应该也能覆盖这个漏洞的情况。

### System

蓝牙开会了属于是  
待分析漏洞：CVE-2024-49742 CVE-2024-49734

[CVE-2024-43096](https://nvd.nist.gov/vuln/detail/CVE-2024-43096) RCE Critical [1](https://review.lineageos.org/c/LineageOS/android_system_bt/+/411006)  
蓝牙 GATT 协议栈 build_read_multi_rsp 函数中 MTU 等于 0 时的越界写入，补丁判断了这种情况直接返回。

[CVE-2024-43770](https://nvd.nist.gov/vuln/detail/CVE-2024-43770) RCE Critical  
[CVE-2024-43771](https://nvd.nist.gov/vuln/detail/CVE-2024-43771) RCE Critical  
[CVE-2024-49747](https://nvd.nist.gov/vuln/detail/CVE-2024-49747) RCE Critical  
[CVE-2024-49748](https://nvd.nist.gov/vuln/detail/CVE-2024-49748) RCE Critical  
[1](https://android.googlesource.com/platform/packages/modules/Bluetooth/+/69cb902b23f9aaee04de587045fba66a5cb28e57%5E%21/#F0)  
四个漏洞都在 GATT 里，在四个不同的地方都没有检查 gatt_tcb_get_payload_size 的返回值是不是 0，而这个函数在 channel 已经被关闭的时候会返回 0，在后续造成越界写。  
影响函数：  
CVE-2024-43770 gatts_process_find_info  
CVE-2024-43771 gatts_process_read_req  
CVE-2024-49747 gatts_process_read_by_type_req  
CVE-2024-49748 gatts_process_primary_service_req

[CVE-2024-49749](https://nvd.nist.gov/vuln/detail/CVE-2024-49749) RCE High [1](https://review.lineageos.org/c/LineageOS/android_external_giflib/+/414856)  
giflib 解析 gif 的过程中，判断 width 和 height 是否非法的 if 语句存在逻辑错误，变成了只有三项条件全部成立才认为文件非法，应该是三项条件里只要有一项成立就为非法。导致后续计算 size 的时候发生整数溢出进而越界写。

[CVE-2024-34722](https://nvd.nist.gov/vuln/detail/CVE-2024-34722) EoP High [1](https://android.googlesource.com/platform/packages/modules/Bluetooth/+/2f0cf867e27af9048821d332ecbd21ddf234888c%5E%21/#F0)  
蓝牙配对过程中的授权绕过问题，去年补丁就放过一次，看起来是没修复完

[CVE-2024-34730](https://nvd.nist.gov/vuln/detail/CVE-2024-34730) EoP High [1](https://android.googlesource.com/platform/system/bt/+/6c3bb34eb3114e9a3dd9868fcab6631b947b9994)  
蓝牙 HID 链接过程中的权限绕过问题

[CVE-2024-43095](https://nvd.nist.gov/vuln/detail/CVE-2024-43095) EoP High [1](https://android.googlesource.com/platform/packages/modules/Permission/+/f677d33568d944dfe43a713dc148bd68a5472931%5E%21/#F0)  
改的地方很多，看起来是动态添加的权限相关的自动授权问题

> In multiple locations, there is a possible way to obtain any system permission due to a logic error in the code. This could lead to local escalation of privilege with no additional execution privileges needed. User interaction is needed for exploitation.

```sql
Fix Dynamic Permission group auto grant behaivor
Fix the Dynamic Permission group auto grant behaivor so that a
permission group is only considered granted when (1) all permissions
were auto-granted or (2) a platform permission in the same group is
granted.
```

[CVE-2024-43765](https://nvd.nist.gov/vuln/detail/CVE-2024-43765) EoP High [1](https://android.googlesource.com/platform/packages/apps/DocumentsUI/+/c8e21a60d78414aca4115403fe63fc732a9cd5aa)  
悬浮窗覆盖漏洞再次限时回归。Document UI 这个 app 里隐藏遮盖窗体，防止点击劫持。

[CVE-2024-43763](https://nvd.nist.gov/vuln/detail/CVE-2024-43763) DoS High [1](https://android.googlesource.com/platform/packages/modules/Bluetooth/+/124c2ac6cffb2b7c7e6c66b6def767cd74b62361%5E%21/#F0)  
一个蓝牙的逻辑 bug，应该只会造成功能异常？

[CVE-2024-49736](https://nvd.nist.gov/vuln/detail/CVE-2024-49736) DoS High [1](https://android.googlesource.com/platform/packages/apps/Settings/+/779372c34f0b2928107d6ebf9165f97b4a2edc4f)  
禁止在 DSU 模式下恢复出厂设置。可能是因为 DSU 用的 data 不一样，所以不会再要求输入一遍锁屏密码？
