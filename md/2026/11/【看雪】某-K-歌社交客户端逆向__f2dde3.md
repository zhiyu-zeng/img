---
title: 【看雪】某 K 歌社交客户端逆向
source: https://bbs.kanxue.com/thread-293616.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-24T10:13:54+08:00
trace_id: 660a493b-34d6-4dc4-8907-4427d6e5b517
content_hash: 7cec3470b104da40408657f92abf5e5a046792e67bff7e84166b86d06906b664
status: synced
tags:
  - 看雪
  - Android逆向
  - 风控对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: 本客户端（147 MB、16 个 dex）的逆向分析表明：对外深链入口可从外部调起，回调校验仅按前缀匹配，检测结果只上报服务端，不在本地阻断。动态 hook 因模拟器 PID namespace 隔离未能取到运行时结果。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42275244-d011-81f3-bfa0-dd402d6f702e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 本客户端（147 MB、16 个 dex）的逆向分析表明：对外深链入口可从外部调起，回调校验仅按前缀匹配，检测结果只上报服务端，不在本地阻断。动态 hook 因模拟器 PID namespace 隔离未能取到运行时结果。
> 
> - **样本与架构：** Kotlin 主业务加 proguard，关键字符串下沉到 .so；lib*-v8.so（14.8 MB）负责 RTC、签名、字符串加密，lib*sgmain.so（775 KB）是安全检测执行层；路由用 didi drouter，热修复用 Robust，导致 AppLinkActivity 分发方法 l(Uri,String,Bundle) 无法还原。
> - **深链入口：** AppLinkActivity 为 exported BROWSABLE，接 imv scheme，源码提取 41 个 host 常量（login/quicklogin/room/feed/testmode/krn_download 等）；am start 实测能调起 AppLinkActivity，但未登录态回落 WelcomeActivity。
> - **回调校验边界：** QuickLoginConfirmActivity 从 intent data 读 state、callbackUrl，isValidCallback 用 String.startsWith 比白名单前缀（主站 H5 / staging H5 各一条），不做 URI 解析、不看 host 全等、不处理 @；随后 ViewModel z() 按 URL 有无问号拼 `?`/`&` + `at=token` + `showId=state`，经 launchBrowserWithResult 以 ACTION_VIEW 交系统浏览器。
> - **检测三层：** Java 支付安全 SDK（ScanAttack 位标志 CHECK_HOOK=1…CHECK_ALL=-1，getAD104 一次全量触发）、native 的 ksecurity 检测器（Emulator/NativeEmu/Hook/Root/AntiDebug/Malware，maps+inotify 查 Frida，syscall 自封装 x_ptrace 反调试，su 五连查 root）、功能适配层（RTC runningOnEmulator 降级、崩溃上下文，非反作弊）。
> - **上报去向：** 检测值写入 EnvNodeModel/RootNodeModel 的 em、qemu、root 及 Build 全量字段，经 RDSClient/BehaviorRequest 上送服务端；本地无退出动作，欢迎页可正常进。

对一个 K 歌社交客户端做逆向。反编译 apk 提取文件，从 dex 字符串和 native 库两个方向入手，分析对外入口与接口、深链回调链、模拟器与 hook 检测机制三部分。逆向线能理到什么程度没把握，基本的应该能达到。可能干不成，不过感觉会赢的。

分析分四步走。先把 apk 解包，jadx 反编译出各 dex 的 Java 源码，对 classes.dex 到 classes15 的字符串表做全量扫描，按模拟器、frida hook、root、调试开发四组正则归类。再对 native 库做符号和字符串审计，从 mangled name 还原 C++ 检测器类。然后对深链和回调链做定向反编译，把被混淆的方法签名和常量声明提取出来。最后在模拟器上跑动态验证，看深链能不能从外部调起、回调校验走到哪一步。产物落在三处，reports 目录下是扫描结果，tools 目录下是分析脚本，jadx_out 目录下是反编译源码。

## TOP0 目的

```python
某 K 歌社交客户端
  │
  ├── 静态面
  │     ├── 反编译 dex，提字符串、权限、组件、接口
  │     └── native 库符号和字符串审计
  │
  ├── 深链面
  │     ├── 外部 scheme 入口和分发
  │     └── 登录回调的 URL 拼接
  │
  └── 检测面
        ├── 模拟器 / root / hook / 调试检测
        └── 检测结果的上报去向
```

## TOP1 样本结构

安装包 147 MB 上下，16 个 dex，从 classes.dex 到 classes15.dex。入口 Activity 是欢迎页 WelcomeActivity，Application 类是厂商自定义的入口类。反编译输出按 dex 分目录放，classes0、classes11、classes12、classes2、classes2b、classes2v2、classes5 各有定向结果，后面几个是深链和检测分析要用到的。

核心 native 有两个。一个是 14.8 MB 的 v8 库，挂了 RTC、签名和字符串加密。另一个是 775 KB 的 sgmain 库，改名自支付安全 SDK 的 native 执行层。两个库的分工不同，前者管通信和加密，后者管安全检测。

```python
样本
  │
  ├── 体积       : 147 MB
  ├── 版本       : 3.168.0.351556
  ├── dex        : 16 个，classes ~ classes15
  ├── 入口       : WelcomeActivity
  ├── Application: 厂商自定义入口类
  └── native
        ├── lib<厂商>-v8.so    : 14.8 MB，RTC / 签名 / 字符串加密
        └── lib<厂商>sgmain.so : 775 KB，安全检测 native 执行
```

本地没有记录哈希值，样本就按目录里那份原件走。解包目录在 sample 下，apk 原件和解包后的 raw 目录都在。

## TOP2 技术栈

反编译出来能看出整套架构。Kotlin 写的主业务，加了 proguard 混淆，关键字符串丢到.so 层加密。路由用的是 didi 的 drouter，靠注解声明 host 和 path，声明写法是 `@Router(host="app", path="/link")` 。热修复上了 Robust，部分关键方法被 PatchProxy 包过，AppLinkActivity 的分发方法就没还原出来。

RTC 走的是厂商自己的实时通信库，信令一个独立域。上传用 OSS token 体系，先申请 token 再用上传器发，具体是 `/api/upload/apply_*_upload` 申请，parseTokens 解析，产出 KMPUploaderTokenInfo，字段是 taskId、token、url 三件套。支付挂的是厂商的支付中间件，配置走 loadPayConfig，预支付信息走 loadPrepayInfo。

```python
技术栈
  │
  ├── 语言与混淆
  │     ├── Kotlin
  │     ├── proguard
  │     └── 字符串加密放在 .so 层
  │
  ├── 路由       : didi drouter，@Router(host, path)
  ├── 热修复     : Robust，PatchProxy 包裹关键方法
  ├── RTC        : 厂商实时通信库，独立信令域
  ├── 上传       : OSS token，apply_*_upload -> parseTokens -> KMPUploaderTokenInfo
  └── 支付       : 厂商支付中间件，loadPayConfig / loadPrepayInfo
```

## TOP3 dex 字符串扫描

`antidetect_scan.py` 扫全部 dex 的字符串表，按四组正则分类命中。脚本自己解析 dex 的 string_ids，用 struct 读偏移，ULEB128 跳长度，跳过长度超过 150 的串，命中后按组归类计数。L、R$、android/、kotlin 开头的噪音串排除掉。

```python
antidetect_scan.py
  │
  ├── 解析       : dex string_ids，struct 读偏移，ULEB128 跳长度
  ├── 过滤       : 长度 > 150 跳过，L / R$ / android/ / kotlin 开头的噪音排除
  └── 四组正则
        ├── EMULATOR   : qemu / goldfish / genymotion / ro.kernel.qemu / qemu_pipe ...
        ├── FRIDA_HOOK : frida / gum-js / 27042 / /proc/self/maps / shadowhook / inotify ...
        ├── ROOT       : magisk / supersu / /system/bin/su / /data/adb/ / rootbeer ...
        └── DEBUG_DEV  : isDebuggerConnected / TracerPid / ro.debuggable / ro.secure ...
```

扫出来的分布是这样的，根特征命中最多，集中在后几个 dex。完整的 SUMMARY 如下，16 个 dex 里命中集中在 classes.dex、classes2、classes5 到 classes9、classes11、classes12 这几个，其余 dex 只有零星命中。

```python
各组命中分布（全量）
  │
  ├── classes.dex   : DEBUG 1 / EMU 23 / HOOK 12 / ROOT 13
  ├── classes2.dex  : DEBUG 3 / EMU 34 / HOOK 2  / ROOT 2
  ├── classes3.dex  : ROOT 2
  ├── classes4.dex  : EMU 1
  ├── classes5.dex  : EMU 23 / HOOK 1 / ROOT 14
  ├── classes6.dex  : EMU 10 / ROOT 101
  ├── classes7.dex  : DEBUG 4 / EMU 24 / HOOK 19 / ROOT 15
  ├── classes8.dex  : EMU 8  / HOOK 7  / ROOT 146
  ├── classes9.dex  : EMU 21
  ├── classes10.dex  : EMU 1
  ├── classes11.dex : EMU 18 / HOOK 4 / ROOT 85
  └── classes12.dex : EMU 14 / ROOT 7
```

classes9 的 EMULATOR 命中要单独说一句。那批词不是模拟器检测，是直播模块的虚拟投屏功能，VirtualLivePullStreamFragment、VIRTUAL_LIVE_MODE、createVirtualDisplay、getScreenRecorderVirtualDisplayWidth、is_emulator 这些，属于业务功能被正则误收。字符串命中只能说明 dex 里有这些词，不能直接当检测逻辑。具体哪个类在用，靠 `dex_ref_finder.py` 做指令级引用定位，它修过 code_item 和 class_data 的解析，能把字符串索引反查到方法。

## TOP4 API 面测绘

`api_paths.txt` 是接口全集，两千三百多条路径，具体数 2319 条。按用途分几族，用户和登录一族，送礼一族，上传和发布一族，进房一族，推送一族。文件上传走三步，先申请上传凭证，拿到 taskId、token、url 三件套，再交给上传器。

核心 REST 面集中在三个服务下。用户和登录是 `/hey-server/api/v1/user/*` 加 `/login/config` ，登录入口带一个 app 参数标识客户端，设备 token 回传走 `/device/passbackToken` 。送礼是 `/gift/catalogue/*` 和 `/gift/generalSendGift` 。上传发布是 `/hey-server/api/v3/publish/parseTokens` 加 `/api/upload/apply_image_upload` 、 `apply_video_upload` 、 `publish_video` 。进房是 `/room-server/api/v3/room/guest/joinRoom` ，游客身份可进。推送配置是 `/rest/infra/push/*` ，来自内部 push_config.json。还有一条生物特征设备删除接口 `/rest/zt/basic/verification/biology/device/delete` ，版本检查走 `/log-server/api/v1/system/checkupdate` 。

```python
API 面
  │
  ├── 用户与登录
  │     ├── 用户资料         : /hey-server/api/v1/user/*
  │     ├── 登录配置         : /login/config
  │     ├── 登录入口         : /user/login?app=<客户端标识>
  │     └── 设备 token 回传  : /device/passbackToken
  │
  ├── 送礼       : /gift/catalogue/*、/gift/generalSendGift
  ├── 上传发布
  │     ├── 申请图片上传     : /api/upload/apply_image_upload
  │     ├── 申请视频上传     : /api/upload/apply_video_upload
  │     ├── 发布视频         : /api/upload/publish_video
  │     └── 凭证解析         : parseTokens -> taskId / token / url
  │
  ├── 房间       : /room-server/api/v3/room/guest/joinRoom
  ├── 推送       : /rest/infra/push/*
  ├── 生物特征   : /rest/zt/basic/verification/biology/device/delete
  └── 系统       : /log-server/api/v1/system/checkupdate
```

接口域名按功能分开几类，hey 服务端、主 API、staging 调试、RTC 信令、日志上报、媒体 DRM、回调白名单。其中 staging 域和内网地址也硬编码在 dex 里，属于开发调试留下的东西。内网地址两条，公网地址若干。回调白名单两条前缀，一条指向主站 H5，一条指向 staging 的 H5。媒体 DRM 接口是 getMainKeyByToken，RTC 日志上报走 log/upload。

## TOP5 权限与组件

manifest 里申请的权限不少，读电话状态、读通讯录、摄像头、录音、悬浮窗、安装包、读取日志、挂载文件系统这些敏感项都在。应用没开 allowBackup，debug 属性没设，配了 networkSecurityConfig。

权限按用途归一下类。设备与身份有 QUERY_ALL_PACKAGES、READ_PHONE_STATE、READ_CONTACTS、READ_LOGS、GET_TASKS。多媒体有 CAMERA、RECORD_AUDIO、RECORD_VIDEO、MODIFY_AUDIO_SETTINGS、READ_MEDIA_IMAGES。系统类有 SYSTEM_ALERT_WINDOW、REQUEST_INSTALL_PACKAGES、MOUNT_UNMOUNT_FILESYSTEMS、WAKE_LOCK、FOREGROUND_SERVICE。位置是 ACCESS_FINE_LOCATION 和 ACCESS_COARSE_LOCATION 两项都申请了。生物识别是 USE_BIOMETRIC 和 USE_FINGERPRINT。另外还有 NFC、蓝牙、WRITE_CALENDAR、FLASHLIGHT、POST_NOTIFICATIONS。各家桌面的角标权限申请了一大圈，华为、oppo、vivo、三星、htc、索尼、荣耀的都有，还有几个第三方角标库。推送和自家 SDK 的自定义权限也占了一块，MIPUSH_RECEIVE、PROCESS_PUSH_MSG、PUSH_PROVIDER 以及自家应用的广播权限这些。

```python
权限（敏感项节选）
  │
  ├── 设备与身份 : QUERY_ALL_PACKAGES / READ_PHONE_STATE / READ_CONTACTS / READ_LOGS / GET_TASKS
  ├── 多媒体     : CAMERA / RECORD_AUDIO / RECORD_VIDEO / MODIFY_AUDIO_SETTINGS
  ├── 系统       : SYSTEM_ALERT_WINDOW / REQUEST_INSTALL_PACKAGES / MOUNT_UNMOUNT_FILESYSTEMS
  ├── 位置       : ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION
  ├── 生物       : USE_BIOMETRIC / USE_FINGERPRINT
  ├── 网络       : INTERNET / ACCESS_NETWORK_STATE / ACCESS_WIFI_STATE / CHANGE_WIFI_STATE / NFC
  └── 角标       : 华为 / oppo / vivo / 三星 / htc / 索尼 / 荣耀 各家 launcher 权限
```

exported 组件里带 intent-filter 的有这么几个，欢迎页是 MAIN/LAUNCHER，AppLinkActivity 接 imv scheme，几个第三方 SDK 的回调 Activity 也是 exported。完整的 exported 清单比这个长，第三方登录回调有各家 SDK 的入口 Activity，分别是 wxapi、社交平台、短视频平台及另一家社交平台的回调，另有 RouteHandlerActivity 走平台登录回调。推送路由有小米和 vivo 两家。支付协议路由是 UriRouterActivity，scheme 是 imv://kspay/agreement/...。调试日志有个 DebugLoggerActivity，scheme 指向 openloggerchannel。还有三个 com.k.ac 开头的 MActivityF、MActivityS、MActivityT，exported=true，没有 intent-filter，来源不明。生物识别的 DeviceCredentialHandlerActivity 也是 exported。

```python
exported 组件（节选）
  │
  ├── WelcomeActivity      : MAIN / LAUNCHER
  ├── AppLinkActivity      : BROWSABLE，接 imv scheme
  ├── 第三方登录回调        : 四家 SDK 入口 Activity，各自 scheme
  ├── 推送跳转 Activity     : 小米 / vivo 路由
  ├── 支付协议路由          : UriRouterActivity，imv://kspay/agreement/...
  ├── 调试日志              : DebugLoggerActivity，openloggerchannel
  └── 三个未明组件          : MActivityF / MActivityS / MActivityT，exported=true
```

intent-filter 的 data 映射一共四条，imv://\* 指向 AppLinkActivity，社交平台的 scheme 指向 AuthActivity，openloggerchannel 指向 DebugLoggerActivity，imv://kspay/agreement/... 指向 UriRouterActivity。QuickLoginConfirmActivity 不在 exported 清单里，要从 AppLinkActivity 那条链进来。

## TOP6 深链入口

AppLinkActivity 是外部深链的统一入口，host 常量定义了几十个，覆盖登录、房间、feed、话题、音乐各类落地。完整的 host 常量表从源码里提了 41 个，按用途能分十几类。

```python
深链 host 常量（全量，按用途归类）
  │
  ├── 登录相关 : login / quicklogin / identity
  ├── 内容相关 : feed / music / topic / item / sing / band / moment / draft / chirp
  ├── 社交相关 : chat / chatgame / relation / senyou / group / social
  ├── 房间相关 : room / room_random
  ├── 调试相关 : testmode / age
  ├── 功能相关 : scan / web / user / myprofile / activity / appstore / blank
  ├── 任务与积分 : mission / message / kcmp / kds
  ├── 下载与更新 : krn / krn_download / update
  ├── 其他       : feedback / tab / teamrecruit / timbre / kc
  └── 分发方法 : AppLinkActivity 的 l(Uri, String, Bundle) 未还原
```

host=quicklogin 走登录回调那条链，host=testmode 指向调试登录，host=web 开 H5。host=identity 走身份认证，host=scan 走扫码，host=appstore 和 HOST_UPDATE 走版本相关。host=krn_download 是下载入口，host=feedback 是反馈入口。三个测试相关的 host 是 testmode、age，加上一个 kc，命名上像是内部用的。

Deeplink 的 resolve 结果用 `deeproute.py` 看过， `imv://app/link` 的 match 值是 0x208000，priority 和 preferredOrder 都是 0，specificIndex 是 -1，isDefault 为 true，优先落到 AppLinkActivity。加不带 host 参数结果一样，match 值都是 0x208000。dumpsys 里没看到 imv 的常驻注册，属于运行时解析，manifest 里声明的 scheme 匹配靠 intent-filter 完成。

## 第二部 深链与回调线

## TOP7 AppLinkActivity 分发

深链进来先到 AppLinkActivity。分发方法 l(Uri, String, Bundle) 被 Robust 包过，jadx 还原不出来，报了两条警告，一条是 "Can't fix incorrect switch cases order, some code will duplicate"，另一条是 "Failed to restore switch over string"。这两条说明 switch 的字符串分支顺序没修好，反编译出来的代码有重复。方法签名从 `applink_sigs.txt` 中提取了一组，除了分发方法本身，还有若干个其他方法。

```python
AppLinkActivity
  │
  ├── 入口       : onCreate 读 intent data
  ├── 分发       : l(Uri, String, Bundle)，混淆未还原
  ├── host 判定 : 按常量 string switch，落到各业务 Handler
  └── 其他方法  : n(Context, Boolean) / o(Context, Boolean)
                  p(q7.g) / q() / r() / t(NONE) / u(l, Object) / v(Throwable) / w(l, Object)
```

n 和 o 两个方法都收 Context 和 Boolean，看起来是不同分支的跳转封装。p 和 u、w 收的是一个 l 类型的变量加 Object，可能是回调和参数透传。v 收 Throwable，处理异常。q 和 r 无参，可能是状态查询。这组方法名都是单字母，proguard 混淆后的结果，具体语义没逐个还原。host 常量在源码里的行号分布能看出来，HOST_BLANK 在 52 行，HOST_IDENTITY 在 79 行，HOST_QUICKLOGIN 在 115 行，HOST_WEB 在 160 行，host 定义集中在同一个类里。

## TOP8 回调校验

QuickLoginConfirmActivity 在 classes12 里。onCreate 从 intent 的 data 里读 state 和 callbackUrl，用的是 getQueryParameter。回调目标有个白名单校验 isValidCallback，判断方式是拿白名单前缀做 startsWith。白名单两个，一个是主站的 H5 域，一个是 staging 的 H5 域。

```python
回调校验
  │
  ├── 入参       : intent.getData() 的 state / callbackUrl
  ├── 白名单     : 主站 H5 域、staging H5 域，各一条前缀
  ├── 判定       : callbackUrl.startsWith(白名单前缀)
  └── 特点       : 前缀匹配，不看 host 全等，不处理 @ 分隔
```

isValidCallback 的实现是 Kotlin 的 String.startsWith，直接拿字符串比前缀，没有做 URI 解析。这意味着判定只看开头几个字符是否相等，不看 host 全等，也不处理 URL 里 @ 符号分隔的 userinfo 部分。哪些字符串能通过、哪些不能，属于校验逻辑的边界，静态上能看清判定方式，动态侧没跑到。

QuickLoginConfirmActivity 本身没有 exported=true，外部不能直接调起，要先经 AppLinkActivity 的 quicklogin 分支进来。state 参数在回调里原样带到 showId，既做业务标识也参与拼接。

## TOP9 令牌拼接链

回调校验过了之后，ViewModel 的 c.java 负责拼最终要打开的 URL。关键代码在 220 到 239 行。B() 方法取 token 并抛事件，z(String callback, String token, String showId) 把三样拼起来。拼法是 callbackUrl 后面接分隔符，分隔符按 URL 里有没有问号决定用? 还是 &，再带 at 参数和 showId 参数，最后交给 launchBrowserWithResult 用 ACTION_VIEW 打开。

```python
令牌拼接
  │
  ├── B()        : 取 token，抛事件
  ├── z()        : callback + 分隔符 + at=token + showId=state
  └── launchBrowserWithResult
                 : ACTION_VIEW 打开拼好的 URL
```

整条链是深链带 callbackUrl 进来，校验前缀，拼上令牌，交给浏览器。token 是登录访问令牌，showId 是 state 参数的原值。拼好的 URL 通过 ACTION_VIEW 交给系统浏览器，不经过 App 内的 WebView。事件类是 QuickLoginEvent$b，getUrl 方法取拼好的 URL。

## TOP10 hook 脚本

回调链实际走到哪一步，靠 `hook_quicklogin_chain.js` 来看，配 `run_frida_quicklogin.py` 驱动。JS 里挂了四个点，AppLinkActivity 的 l、QuickLoginConfirmActivity 的 isValidCallback 和 onCreate 和 launchBrowserWithResult、ViewModel c 的 z 和 B，外加 QuickLoginEvent$b 的 getUrl。每个点用 send 回传宿主。

```python
hook_quicklogin_chain.js
  │
  ├── AppLink.l          : 打 uri 和 s
  ├── isValidCallback    : 打入参和返回值
  ├── onCreate           : 打 intent data
  ├── launchBrowserWithResult : 打最终 URL
  ├── VM.z / VM.B        : 打 callback、token 长度、showId
  └── EventB.getUrl      : 打事件携带的 URL
```

驱动脚本 `run_frida_quicklogin.py` 用 adb 的 ps 解析目标 PID，再 attach 上去加载脚本，然后逐个触发深链 case，每个 case 等八秒收集日志。目标 PID 解析这一步是必要的，frida 直接枚举进程名会乱码。

```python
run_frida_quicklogin.py
  │
  ├── 设备       : frida remote device，端口 27042
  ├── 取 PID    : adb shell ps -A，按包名匹配最后一列
  ├── attach    : 按 PID 挂，加载 hook_quicklogin_chain.js
  ├── 触发       : 三个 case 的 am start，各等 8 秒
  └── 落盘       : frida_quicklogin_log.txt
```

三个 case 按 callbackUrl 的形态分。caseA 是白名单主站域后面接一个后缀域，caseB 是纯外部域，caseC 是白名单主站域后面用 @ 符号接外部域。三个都带 state 参数，分别标成 caseA、caseB、caseC。这三个形态覆盖了前缀匹配的几种边界情况，用来观察 isValidCallback 的返回值和最终拼出的 URL。

## TOP11 动态环境

动态跑在模拟器上。MuMu 12，x86_64，Android 15，root 环境，机型伪装成某款真机。adb 走本机端口 7555，frida 客户端 17.11，服务端 17.9.10。安装用的 adb install -r -t，安装后欢迎页能正常起来，进程在前台。

```python
动态环境
  │
  ├── 模拟器     : MuMu 12，x86_64，Android 15
  ├── 机型伪装   : 伪装的真机型号
  ├── root       : 已 root
  ├── adb        : 本机端口 7555
  └── frida      : 客户端 17.11 / 服务端 17.9.10
```

## TOP12 深链触发实测

`dynamic_run.log` 记了触发过程。frida 先起来，然后 `am start` 送两个深链，一个是域名扩展形态的 callbackUrl，一个是 @ 分隔形态。两次 am start 都返回 Starting，Intent 的 cmp 指向 AppLinkActivity，说明 exported 深链入口确实能从外部调起。另一个验证记录里用 `am start -W` 看到 Status 是 ok，topActivity 是 AppLinkActivity，两处对得上。

```python
触发记录
  │
  ├── intent1 : am start -d imv://app/link?callbackUrl=... -> Starting，cmp=AppLinkActivity
  ├── intent2 : am start -d imv://app/link?host=quicklogin&callbackUrl=... -> Starting
  └── 结果     : 两条都成功调起 AppLinkActivity
```

前台焦点最终停在 WelcomeActivity，没进到 quicklogin 授权流。未登录态回落，这是当时的实际状态。host=testmode 的调试入口同样回落，调试开关默认关着。深链能调起入口这一步成立，但授权流需要登录态，模拟器上没有账号体系，后面的链没接着走。

## TOP13 frida attach 受阻

hook 脚本想 attach 到目标进程，两次都没成。 `verify_run.log` 里 frida 连上了设备，spawn 时报 unable to find process。 `dynamic_run.log` 里 attach 也没拿到输出，frida_out 和 frida_err 都是空的。

原因在容器隔离。MuMu 12 把 frida-server 和 App 进程放在不同的 PID namespace，frida 枚举不到目标进程名，adb 看得到 PID 但 attach 过去拿不到 hook 输出。客户端和服务端版本都是正常启动的，问题出在进程视图隔离这一层。端口 27042 的连通性也单独查过，frida-server 在监听，设备连接也正常，卡在进程枚举这一步。

```python
attach 受阻
  │
  ├── frida 连设备   : 成功
  ├── spawn          : unable to find process
  ├── attach         : 无输出，frida_out / err 为空
  └── 原因           : PID namespace 隔离，进程视图不通
```

所以回调链的动态部分只走到"深链能调起入口"这一步，isValidCallback 的返回值和最终拼出的 URL 没在运行时拿到。判定逻辑和拼接逻辑都在静态侧。

## TOP14 调试登录链

classes11 里有个 DebugLoginLinkHandler，走的是另一条深链分支。逻辑是读一个 SP 开关，开关开了再去读目标 userId，拿 userId 请求一个带 debug 参数的登录接口，返回里的 userId 等于目标值就写登录态，然后弹提示、杀进程重启。

```python
调试登录链
  │
  ├── 入口       : 深链 host=testmode
  ├── 开关       : SP 里的 debug_login_switch_state，默认关
  ├── 参数       : target_user_id
  ├── 请求       : staging 域，带 debug=true 和 userId
  ├── 校验       : 返回的 userId 等于 target
  └── 动作       : 写登录态 -> 提示 -> killProcess 重启
```

开关默认关，模拟器上没登录态，这条链当时没往下走通。staging 域和 debug 参数的语义硬编码在 dex 里，作为调试痕迹记着。请求里的 app 参数是客户端标识，debug=true 和 userId 拼在查询串里。写登录态之后弹的提示带目标 userId，然后 killProcess 重启让登录态生效。

## 第三部 检测机制

## TOP15 检测体系总览

模拟器、root、hook、调试这套检测分三层。第一层是 Java 侧的支付安全 SDK，负责攻击扫描调度、设备指纹和风险上报。第二层是 native 库，真正执行检测逻辑。第三层是功能适配，RTC 和崩溃上报也做环境判断，但目的不是反作弊。

```python
检测体系
  │
  ├── Java 层    : 支付安全 SDK，扫描调度 / 设备指纹 / 风险上报
  ├── native 层  : sgmain 库，模拟器 / root / hook / 反调试 / Xposed 检测
  └── 适配层     : RTC 音频降级、崩溃上下文采集
```

字符串扫描时容易把这三层混在一起。classes.dex 里 qemu_pipe、su、maps 这些词来自安全 SDK 和 native 库的 Java 包装，classes2 的 Genymotion 和 thermal_zone 归 RTC 和崩溃上报，classes11 的 task 遍历和 root 关键词是崩溃监控和 CPU 监控的噪音。这些逐项分开看过，不把适配层当反作弊。classes9 的虚拟投屏特征也是噪音，前面提过。

## TOP16 支付安全 SDK

Java 层是完整版的支付安全 SDK，不是阉割版。模块分得细，apdid 做设备指纹和攻击扫描入口，scan 是扫描的 JNI 桥，rds 做风险决策，还有安全存储、签名、安全通信、人脸设备安全几块。源码在 classes0 的 sources 目录下，包路径完整，类名都还在。

```python
支付安全 SDK 模块
  │
  ├── apdid     : 设备指纹，ApdidManager / ApdidJNIBridge / AtomicDataCollector
  ├── scan      : ScanJNIBridge，扫描 JNI 桥
  ├── rds       : 风险决策，RDSClient + 节点模型
  ├── secstore  : 安全存储
  ├── sign      : 签名
  ├── scp       : 安全通信协议
  ├── face      : 人脸设备安全
  └── jnitools  : native 包装与工具
```

apdid 下的原子数据采集是 AtomicDataCollector，行为上报是 BehaviorRequest 和 BehaviorResult，设备指纹的 RPC 是 DeviceRpcRequest 和 DeviceRpcResponse，链路走 RPCService。攻击扫描入口在 apdid.attack.x 这个子包下，类名是 ScanAttack。rds 下是风险决策的节点模型，按类型分了好几种。

## TOP17 攻击扫描入口

ScanAttack 是这个 SDK 的攻击扫描入口。常量按检测类型分，hook、调试、虚拟环境、代理、ROM 各有编号，CHECK_ALL 是 -1，一次触发全量。下面挂一串 native 方法，cy1 到 cy3 是扫描主体，xp1 到 xp6 是 Xposed 六连检测，scanPackage 扫包，vir1 查虚拟环境。

```python
ScanAttack
  │
  ├── 常量
  │     ├── CHECK_HOOK    = 1
  │     ├── CHECK_DEBUG   = 2
  │     ├── CHECK_VIRTUAL = 4
  │     ├── CHECK_PROXY   = 8
  │     ├── CHECK_ROM     = 16
  │     └── CHECK_ALL     = -1
  │
  └── native 方法
        ├── cy1(int) : int[]       : 扫描主体
        ├── cy2(int) : int[]       : 扫描主体
        ├── cy3(int) : String[]    : 扫描主体
        ├── methodToNative(int)    : 方法桥接
        ├── scanPackage(int)       : 包扫描，查注入和恶意软件
        ├── vir1(int)              : 虚拟环境检测
        └── xp1~xp6(int, int)      : Xposed 检测，六个
```

常量是位标志的排布，1、2、4、8、16，可以组合。CHECK_ALL 取 -1，表示全开。native 方法的返回类型有区别，cy1 和 cy2 返回 int 数组，cy3 返回 String 数组，其余返回 int。xp1 到 xp6 都收两个 int 参数。

`getAD104(context, MODE_DETAIL, uid, CHECK_ALL, 0, 5, ...)` 是 Java 侧的一次全量触发入口，走 ApdidJNIBridge。一次调用把 hook、虚拟环境、调试、代理、ROM、root、恶意软件、Xposed 全部拉起来。所有检测逻辑都在 native 层，Java 只留常量和结果回传。

## TOP18 上报节点模型

检测结果最终要上报。rds 的 EnvNodeModel 是一张环境节点表，mapKeys 列了二十来个字段，em 是模拟器标记，qemu 是检测值，root 是 root 标记，剩下的 board、brand、device、manufacturer、model 这些是 Build 全量字段。RootNodeModel 单独上报 root 节点。

```python
EnvNodeModel
  │
  ├── 环境标记 : em / qemu / root
  ├── 系统字段 : os / osRelease / kerver / incremental / tags
  ├── 设备字段 : board / brand / device / displayid / manufacturer / model / product
  ├── 硬件字段 : processor / asdk / pf / pn / pm / name
  └── 其他     : 上述字段来自 mapKeys 与 Build 全量
```

mapKeys 的完整清单是 asdk、board、brand、device、displayid、em、manufacturer、model、name、incremental、os、qemu、osRelease、kerver、root、tags、processor、pf、pn、pm。三个检测标记的赋值方式有区别。em 是 `d.q()` 的布尔结果转成 true 或 false，qemu 取 `d.h()` 的值，root 是 `d.r()` 的布尔结果转成 true 或 false。d 是检测器的句柄，三个方法都是 native 方法。

数据流向是检测值先进 EnvNodeModel 和 RootNodeModel，再交 RDSClient 和 BehaviorRequest，通过 RPC 上送。采集结果必然上服务器，服务端拿到 em、qemu、root 和设备全量字段后做风险决策。这套是上报模式，本地没有"检测到就退出"的动作，欢迎页在模拟器上能正常进。节点模型除了 EnvNodeModel 和 RootNodeModel，还有 DevNodeModel、LocNodeModel、SdkNodeModel 几种，按数据类别分开报。

## TOP19 native 执行库

sgmain 库是安全检测的 native 执行层，775 KB。符号和字符串审计能还原出一组检测器类，都挂在 ksecurity 命名空间下。符号是 C++ 的 mangled name，比如 N10kssecurity12HookDetectorE 这样的形式，还原出来是类名。

```python
native 检测器（C++ 类）
  │
  ├── kssecurity::Detector          : 基类
  ├── AndroidDetector               : Android 检测
  ├── EmulatorDetector              : 模拟器检测，Java 封装
  ├── NativeEmuDetector             : 模拟器检测，native 实现
  ├── HookDetector                  : hook 检测
  ├── RootDetector                  : root 检测
  ├── MalwareDetector               : 恶意软件 / 注入检测
  ├── AntiDebug                     : 反调试
  ├── SecRuntimeContext             : 安全运行时上下文
  └── KsecurityStatusBridge         : Java 与 native 状态桥
```

模拟器检测有 Java 封装和 native 实现两套，EmulatorDetector 和 NativeEmuDetector 各管一边。KsecurityStatusBridge 是 Java 和 native 之间的状态桥，另一个 ExceptionProxy 类处理 native 侧的异常转发。这组检测器覆盖了模拟器、root、hook、反调试、Xposed、恶意软件六个方向。

## TOP20 模拟器检测特征

模拟器检测走路径和属性两条线。native 层探 QEMU 的设备文件和内核属性，Java 侧看 Build 指纹一致性，虚拟双卡那几个常量针对模拟 SIM。

```python
模拟器检测特征
  │
  ├── QEMU 设备文件
  │     ├── /dev/qemu_pipe
  │     ├── /dev/socket/qemu
  │     ├── /sys/qemu_trace
  │     ├── libc_malloc_debug_qemu.so
  │     └── /system/bin/qemu-props
  ├── 内核属性 : ro.kernel.qemu / goldfish / genyd.device.id
  ├── 虚拟双卡 : virtualImeiAndImsi / virtual_imei / virtual_imsi
  ├── Build    : board / brand / device / manufacturer / model / product / fingerprint
  └── 传感器   : 温度、传感器列表，模拟器缺真实传感器
```

QEMU 设备文件五个路径都是经典痕迹，native 层逐个探。内核属性里 ro.kernel.qemu 和 goldfish 是通用标识，genyd.device.id 专门针对 Genymotion。虚拟双卡的三个常量是 Java 层的，针对模拟 SIM 场景。Build 指纹检查七个字段的一致性，和 EnvNodeModel 的字段对应。传感器走 native 探测，看温度读数和传感器列表，模拟器没有真实传感器。

## TOP21 Frida 与 hook 检测

HookDetector 是这块的核心。一路是反复读自己的 /proc/self/maps，匹配已加载库的路径特征，frida agent、gum、注入 so 都在这个层面识别。厂商把字符串加密后明文看不到，但按内存映射模式还能认。

```python
HookDetector
  │
  ├── maps 扫描    : 反复读 /proc/self/maps，匹配注入库映射
  ├── maps 变更    : 自封装 inotify_add_watch、chmod，监视 maps 写入
  ├── inline hook  : 与 ShadowHook 框架互补，查非白名单的内联 hook
  ├── 线程扫描     : 遍历 /proc/self/task，查 gum-js-loop 线程
  └── Xposed       : de.robv.android.xposed.installer 包名 + xp1 到 xp6 native 六连
```

另一路监视 maps 的变更。自封装的 x_inotify_add_watch 和 x_chmod 盯着 /proc/self/maps 的写事件，注入库加载会改写 maps，这个时机能被感知。再一路查 inline hook 痕迹，App 自己带 ShadowHook 和 inline hook 能力，符号里有 shadowhook 和 mm_fatal_inline_hook_switch，HookDetector 查的是非白名单的外部 hook。

线程扫描遍历 /proc/self/task，找 gum-js-loop 线程名，这是 frida 的运行时特征。Xposed 检测两条路，一条查 de.robv.android.xposed.installer 包名，一条走 xp1 到 xp6 的 native 六连。五种手段里 maps 扫描和 maps 变更是主力，inline hook 和线程是补充，Xposed 单独一路。

## TOP22 反调试与 root

反调试靠 syscall 自封装，x_ptrace、x_getpid 这些自己实现，绕开 LD_PRELOAD 那类 hook，再看 TracerPid 和 Java 的 isDebuggerConnected。root 检测是 su 路径五连，加 Superuser、magisk 特征和 adb 目录。

```python
反调试与 root
  │
  ├── 反调试
  │     ├── syscall 自封装 : x_ptrace / x_getpid
  │     ├── TracerPid      : /proc/self/status
  │     └── isDebuggerConnected : Java 侧
  │
  └── root
        ├── su 五连 : /system/xbin/su / /system/bin/su / /sbin/su / /su/bin/su / /bin/su
        ├── Superuser.apk / magisk
        └── /data/adb/
```

syscall 自封装的意思是自己实现 ptrace 和 getpid 的调用，不走 libc 的封装，这样 LD_PRELOAD 式的 hook 拦不到。TracerPid 从 /proc/self/status 读，非零说明被调试。Java 侧的 isDebuggerConnected 是另一道。root 检测的五个 su 路径覆盖常见安装位置，加 Superuser.apk 和 magisk 特征，还有 /data/adb/ 目录。

Java 侧把 root 判定汇总成 root=true 或 false 上报，对应 EnvNodeModel 里的 root 字段。反调试的结果进调试状态字段，和 root 一样走上报。

## TOP23 功能适配层

有两处环境判断不属于反作弊。RTC 那边调 runningOnEmulator，看硬件名和品牌前缀是不是模拟器默认值，目的是没真实音频通路时做降级。具体判断是 Build.HARDWARE 等于 goldfish 且 Build.BRAND 以 generic\_ 开头，命中就走音频设备降级。崩溃上报那边采环境上下文，附到崩溃记录里，入口是一个单字母方法 aa.C()。这两处不阻断功能。

```python
功能适配层
  │
  ├── RTC        : runningOnEmulator，Build.HARDWARE==goldfish 且 BRAND 以 generic_ 开头
  └── 崩溃上报   : aa.C()，采环境上下文，附到崩溃记录
```

扫描时排除的噪音也记一下。BatteryMonitor 读 task 目录是 CPU 亲和性，ThreadOOMTracker 和 CpuException 是性能监控，日志库的 MMAPTracerV2 和 ObiwanMMAPTracer 是 mmap 缓冲，解码器名里带 BlueStacks 是厂商枚举，崩溃上报字段里有虚拟环境和 checkRoot 的命中。classes9 的虚拟投屏特征前面说过，也是噪音。这些都逐项看过，不算安全检测。

## TOP24 触发时机与数据流

检测是在 App 启动和 SDK 初始化时触发的。一次 getAD104 的 CHECK_ALL 调用把 native 里那组检测器全拉起来，各自出结果，统一进节点模型，再交给风险决策和上报，最后到服务端。

```python
触发与上报流
  │
  ├── App 启动 / SDK 初始化
  │     └── ApdidManager.getAD104(CHECK_ALL)
  │           └── native 检测器
  │                 ├── EmulatorDetector -> em / qemu
  │                 ├── RootDetector     -> root
  │                 ├── HookDetector     -> hook 状态
  │                 ├── AntiDebug        -> 调试状态
  │                 ├── XposedDetector   -> xposed 状态
  │                 └── MalwareDetector  -> 注入状态
  │           └── EnvNodeModel + RootNodeModel
  │                 └── RDSClient / BehaviorRequest
  │                       └── 服务端风险决策
  │
  └── 本地表现 : 不阻断，欢迎页可正常进入
```

检测项依赖的都是公开特征，路径、属性、包名、映射模式这些。结果是上报而不是本地退出，服务端根据上送的标记做后续处理。设备全量 Build 信息也跟着上送，服务端拿到 em、qemu、root 加上设备字段后做风险决策。这套机制的实际形态就是这样，本地只采集和上报，判定在服务端那一侧。

## TOP25 静态对照

`dex_ref_finder.py` 做 dex 指令级引用定位，把字符串索引反查到方法，用来确认某个特征落在哪个类里。脚本修过 code_item 和 class_data 的解析，之前这两个结构解析有偏差，定位会跑偏。

扫描跑完的对照结果是，反作弊相关的字符串集中在 classes 主包和几个业务 dex，适配层的字符串单独归到 RTC 和崩溃上报那两个 dex，崩溃监控的命中按噪音排除。三层分开记，没有拿适配层的命中去填反作弊的空。

产物按用途分在三个目录。reports 下是扫描结果，antidetect_strings 是检测特征分布，api_paths 是接口全集，dex_strings 和 so_strings 是字符串表，manifest_analysis 是权限组件分析，还有两份分析文档。tools 下是脚本，antidetect_scan 和 dex_ref_finder 管字符串扫描和引用定位，dex_index、dex_idx、dex_types、dex_where 管 dex 结构，applink_analyze 和 applink_sigs、applink_dispatch 管深链，deeproute 管 resolve，hook_quicklogin_chain 和 run_frida_quicklogin 管动态 hook，还有一批 check\_ 开头的排查脚本。jadx_out 下是反编译源码，classes0 到 classes12 按 dex 分目录。

深链入口能从外部调起，回调链的静态逻辑和拼接方式都在上面，动态侧因为 PID namespace 隔离没拿到运行时结果。检测机制分了三层，上报路径走到本地这一步，服务端那一侧看不到。

https://github.com/Machao147258-max/hs
