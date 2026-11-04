---
title: 【微信】安卓逆向 -- 从启动闪退到 Native 解密一条链拆完某box APP
source: https://mp.weixin.qq.com/s/EbiaDjoQGGCk3jmMosXTug
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T13:21:57+08:00
trace_id: da9307e5-68d2-4f30-981d-a891c1b982c1
content_hash: 273d2729043342e34669c1fe551772723ff7b09f02d1f67d74f69920b190c7bb
status: synced
tags:
  - 微信
  - Android逆向
  - Frida
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 某Box APP 保护纵贯 Java 检测到 Native 加密：abc.c() 并非查表，而是“密文表+非标准hex+Blowfish+后处理”的完整常量保护方案，一条链可拆完。
ai_summary_style: key-points
images_status:
  total: 20
  succeeded: 20
  failed_urls: []
notion_page_id: 40e75244-d011-8114-997c-caa1d1a3d444
ioc:
  cves: []
  cwes: []
  hashes:
    - 1d55e7d0dc405f9df68795782a8ac0397286dc90
    - 39161ffa49cb22d334e8899a2727467de7cee94af74c953fcd9a1746f22dbcac
    - c5e825297315f309107396fbfc5483c5
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 某Box APP 保护纵贯 Java 检测到 Native 加密：abc.c() 并非查表，而是“密文表+非标准hex+Blowfish+后处理”的完整常量保护方案，一条链可拆完。
> 
> - **启动放行：** OuiCrGxF.onCreate() 汇聚环境评分（模拟器特征、传感器<7、三方应用<5 累计>3 分即退）、Xposed 异常栈检测、su 路径 Root 检测，命中直接 System.exit(0)；debuggable 仅弹提示。Frida 强制 5 个检测函数返回 false 即可放行。
> - **统一编解码：** 登录、支付密码校验、视频解锁等受保护请求统一汇入 j.t(mode=1) → abc.ea5 加密发出、da5 解密回传，本地配置缓存走 ea2/da2 字符串链；四条链在 so 内同命中 "AES" 与 key 字面量 "gncdGCPoNdM([[SEA"。
> - **解锁闭环：** show/json 确认锁态 → user/pverify/json 验 6 位支付密码 → rrvideo/unlock/json 由服务端下发 master.m3u8；实测扣 2.0 积分、经验涨至 44361（Level 4），结果回写 keyCurUser<uid>，播放权限非本地伪造。
> - **常量保护链：** abc.c(1/2/3) 还原三个内置站点域名；minax 从 off_DA050 密文表取项，经非标准 hex（前后字符高低 4 位互换，68→0x86）→ 7 字节 key Blowfish-ECB 分组解密 → sub_48F68 置换异或后处理，才得明文。
> - **两个陷阱：** Blowfish key 非表面值，off_E1098 运行时被改写，实测前 7 字节为 cb538d2f061264；JNI_OnLoad 先 ptrace(TRACEME) 反调试占位，再动态注册 c/abc 的 6 个 native 方法。

**逆向有你** *2026年11月4日 11:38*

ANDROID REVERSE · 实战复盘2026.04

改个 so 就能过检测？

从启动闪退到 Native 解密

一条链拆完某box APP

检测绕过 · 开屏广告 · 登录态 · 视频解锁 · Blowfish

实战笔记 · 原著 吾爱破解 @Mengzek7

ANDROIDREVERSE

📦 5 Parts + Conclusion

👉 滑动

PART 01

结论摘要

核心发现速览

PART 04

主流程分析

检测·广告·登录·解锁

PART 05

Native 层

Blowfish·AES

PART ///

写在最后

资料与声明

整套样本最核心的一条结论

abc.c() 并不是简单查表，而是一套完整的 Native 常量保护方案

本文整理自吾爱破解论坛 Android 原创区的实战帖，作者 **Mengzek7**。样本是一款名为 BeautyBox 的视频类 APP：装上就白屏闪退、请求抓不到明文、视频要积分解锁——整套保护从 Java 层一直做到 Native 层。

整篇分析按真实逆向推进顺序写成：先解释「为什么起不来」，把 Root / 模拟器 / Xposed 等检测逐项绕过；再顺着启动页拆出广告放行、登录态落盘与自动恢复；接着用动态日志验证视频积分解锁的完整业务闭环；最后下沉到 libali.so，把请求编解码和字符串常量保护两条 Native 链讲透。

01

PART

分析结论摘要

## 核心结论摘要

SUMMARY · 先看结论再读过程

基本判断

APP 名称：XX包名：com.secXXXprXX

版本：5.1.5 / 120　·　目标 SDK：29

主要载荷：Java 层明显混淆，Native 层加载 libali.so

本次重点：样本基础信息、Manifest、启动链，以及 abc.c() 的 Native 解密算法

核心发现

1

启动入口为 OuiCrGxF，Application 为 MainApplication。

2

启动链同时存在 Root、模拟器、Xposed 等多条会直接触发 m0() 退出的环境检测分支；debuggable 检测则更偏提示性质。

3

启动阶段除了环境检测外，还会进入广告放行、登录态恢复与页面跳转等关键分支。

4

libali.so 通过 JNI_OnLoad 动态注册 c.abc，承担关键字符串常量返回与编解码能力。

5

abc.c(1)/c(2)/c(3) 并非简单查表，而是「密文表 + 自定义预处理 + Blowfish 解密 + 自定义后处理」的完整 Native 常量保护方案。

按实际逆向推进顺序看

1

先从 Manifest 确认入口：MainApplication 与 OuiCrGxF。

2

进入启动页 OuiCrGxF.onCreate()，定位多条启动检测与直接退出分支。

3

结合 hook.js 绕过 Java 层检测、广告拦截与 Native ptrace 反调试，让样本顺利进入后续流程。

4

继续拆启动页，确认广告放行、登录态恢复与页面跳转的衔接关系，识别出 abc.c() 与 ea2/da2 的 Native 介入点。

5

分析登录页与自动登录链，确认请求统一汇入 j.t(mode=1)，再由 abc.ea5/da5 负责请求与响应的 Native 编解码。

6

分析视频详情与积分解锁链，确认 user/pverify/json → rrvideo/unlock/json → 用户态回写的完整业务流程，并用真实日志验证积分与经验变化。

✦ 推荐阅读顺序

按「完整流程分析」来读，建议优先看：Manifest 分析 → 主流程分析 → Native 层分析。先把主线的启动、广告、登录、视频解锁串起来，再回看 Native 部分，会更容易把 abc.c()、ea2/da2、ea5/da5 分别对应到真实业务位置上。

02

PART

样本信息与分析环境

SAMPLE & ENVIRONMENT

APK 基本信息

| 项目  | 内容  |
| --- | --- |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/887bf3e4b6109040.jpg)
| 文件路径 | com.secret.prettyhezi\\BeautyBox_5.1.5.apk |
| APP 名称 | BeautyBox |
| 包名  | com.secret.prettyhezi |
| versionName / Code | 5.1.5 / 120 |
| SDK 版本 | compile 29　min 21　target 29 |
| 签名 / 公钥 | SHA256withRSA　2048-bit RSA |
| debuggable | false |
| 分析日期 | 2026-04-28 |

Hash 信息

| 类型  | 值   |
| --- | --- |
| MD5 | C5E825297315F309107396FBFC5483C5 |
| SHA1 | 1D55E7D0DC405F9DF68795782A8AC0397286DC90 |
| SHA256 | 39161FFA49CB22D334E8899A2727467DE7CEE94AF74C953FCD9A1746F22DBCAC |

分析环境

| 项目  | 内容  |
| --- | --- |
| 设备 / 系统 | Redmi K40s　Android 13 |
| CPU 架构 | arm64-v8a / armeabi-v7a |
| Root 状态 | 是（Magisk 已安装） |
| Frida | 16.7.19 / frida-server 16.7.19 |

| 工具  | 用途  |
| --- | --- |
| JADX / JADX MCP | Java 反编译、Manifest 分析 |
| IDA / IDA MCP | libali.so Native 分析 |
| adb | 安装、日志、设备交互 |
| Frida | 动态 Hook |
| MT 管理器 | APK 初步查看 |

初始处理记录

初始观察有三条：样本未见明显壳特征，可直接进入 jadx 分析；在已 Root 且装有 Magisk 的实验机上启动时出现白屏并退出，说明启动期存在明显环境检测；从桌面笔记和重新核验的 jadx 代码来看，OuiCrGxF.onCreate() 是启动检测与配置调度的总入口。

原始 APK：com.secret.prettyhezi\\BeautyBox_5.1.5.apk　Native 分析 IDB：…\\lib\\arm64-v8a\\libali.so.i64

本次实际推进顺序：先读 AndroidManifest.xml 确认 MainApplication 与 OuiCrGxF 两个主抓手；再跟进 OuiCrGxF.onCreate()，因为样本一启动就白屏退出，优先要解释「为什么起不来」；锁定 p0.d / p0.e / p0.a 等启动检测后，结合 hook.js 逐项绕过 Java 检测，并在 Native 层替换 ptrace 反调试；样本放行后，沿 OuiCrGxF 拆出「广告放行 → 登录态恢复 → 页面跳转」这条启动主线；在登录相关代码里观察到请求最终汇入 j.t(mode=1)，再顺着 Server.e.c/a → abc.ea5/da5 识别出 Native 编解码链；最后进入视频详情与积分解锁场景，用动态日志验证 user/pverify/json、rrvideo/unlock/json、积分扣减、经验刷新与 keyCurUser<uid> 回写是否和静态分析一致。

初步判断有两条：启动失败与环境检测高度相关，不像普通网络错误或资源加载失败；MainApplication.<clinit>() 会在 Java 层很早加载 libali.so，说明 Native 逻辑不是边缘功能。

03

PART

Manifest 分析

MANIFEST · 入口与权限面

关键字段

| 项目  | 内容  |
| --- | --- |
| package | com.secret.prettyhezi |
| application name | com.secret.prettyhezi.MainApplication |
| main activity | com.secret.prettyhezi.OuiCrGxF |
| allowBackup | false |
| largeHeap | true |
| usesCleartextTraffic | true |
| requestLegacyExternalStorage | true |
| exported activity 数量 | 1   |

权限分析

| 权限  | 风险  | 用途判断 | 合理  |
| --- | --- | --- | --- |
| ACCESS_NETWORK_STATE | 低   | 网络状态检测 | 是   |
| INTERNET | 低   | 网络通信 | 是   |
| READ_EXTERNAL_STORAGE | 中   | 读取外部存储 | 是   |
| WRITE_EXTERNAL_STORAGE | 中   | 写入外部存储 | 是   |
| REQUEST_INSTALL_PACKAGES | 高   | 安装 APK / 更新包 | 是   |
| WAKE_LOCK | 低   | 保持设备唤醒 | 是   |

组件观察

主入口 Activity 是 com.secret.prettyhezi.OuiCrGxF，FileProvider 注册为 com.secret.prettyhezi.fileprovider。从 Manifest 看不到显式 networkSecurityConfig，但 usesCleartextTraffic="true" 已经说明这个 APP 允许明文流量——这一点在后面抓登录请求时会再次得到印证。

04

## 启动检测与放行

PART

主流程分析

MAIN FLOW · 检测 / 广告 / 登录 / 解锁

打开 APP 先白屏退出，于是先去看 Manifest 和启动 Activity，定位到 OuiCrGxF.onCreate()——它是后续环境检测、广告控制、登录恢复等主流程的总入口。

![图 5-1　样本启动入口 onCreate()：红框标出 super.onCreate 后的模拟器/破解检测分支、](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/966760c8dfd0b8db.png)

图 5-1　样本启动入口 onCreate()：红框标出 super.onCreate 后的模拟器/破解检测分支、

图 5-1　样本启动入口 onCreate()：红框标出 super.onCreate 后的模拟器/破解检测分支、"破解要小心哦~"提示与命中即退出的 m0() 调用。

启动阶段环境检测链

环境评分检测

调用链

OuiCrGxF.onCreate()

→ p0.d.b().d(this, null) → m0() → System.exit(0)

样本在启动很早阶段就会做一轮「多特征累计打分」的环境检测，命中后直接退出，不会继续走后续初始化。

...java

// com.secret.prettyhezi.OuiCrGxF.onCreate(android.os.Bundle)

protected void onCreate(Bundle bundle) {

　　super.onCreate(bundle);

　　com.secret.prettyhezi.View.s.c();

　　W0();

　　// 启动后第一批检测之一就是 p0.d 的环境评分

　　// 一旦返回 true，就直接调用 m0() 结束整个 APP

　　if (p0.d.b().d(this, null)) {

　　　　m0();

　　　　return;

　　}

...

}

...java · p0.d.b().d(this, null)

public boolean d(Context context, c cVar) {

　　String strA = a("gsm.version.baseband");

　　// 基带版本异常时先记 1 分

　　int i6 = (strA == null || strA.contains("1.0.0.0"))? 1: 0;

　　String strA2 = a("ro.build.flavor");

　　// build flavor 命中 vbox / sdk_gphone 这类模拟器特征时加分

　　if (strA2!= null && (strA2.contains("vbox") || strA2.contains("sdk_gphone"))) {

　　　　i6++;

　　}

　　String strA5 = a("ro.hardware");

　　if (strA5 == null) {

　　　　i6++;

　　} else if (strA5.toLowerCase().contains("ttvm") || strA5.toLowerCase().contains("nox")) {

　　　　// 命中夜神 / Nox 等特征时大幅加分

　　　　i6 += 10;

　　}

　　int size = ((SensorManager) context.getSystemService("sensor")).getSensorList(-1).size();

　　// 传感器数量过少也会作为可疑特征

　　if (size < 7) {

　　　　i6++;

　　}

　　int iC = c(p0.b.c().a("pm list package -3"));

　　// 用户安装应用数量太少时，也更像模拟器环境

　　if (iC < 5) {

　　　　i6++;

　　}

　　return i6 > 3;

}

OuiCrGxF.onCreate()

启动页总入口，前半段就串入了环境检测。

p0.d.d(Context, c)

按多项系统属性与设备特征累计打分，判断是否像模拟器 / 虚拟环境。

m0()

统一结束所有活动并执行 System.exit(0)。

Xposed 检测

调用链

Yclh4J3zF.onCreate() → p0.e.b().f() → m0()

Xposed 检测在父类 onCreate() 中就已经执行，子类页面逻辑开始前就可能被拦截。

...java

// com.secret.prettyhezi.Yclh4J3zF.onCreate(android.os.Bundle)

protected void onCreate(Bundle bundle) {

　　super.onCreate(bundle);

...

　　// 父类 onCreate 中就会先做 Xposed 检测

　　// 命中后直接结束，不继续后续初始化

　　if (p0.e.b().f()) {

　　　　m0();

　　}

...

}

// p0.e.b().f()

public boolean f() {

　　try {

　　　　throw new Exception("gg");

　　} catch (Exception e6) {

　　　　for (StackTraceElement stackTraceElement: e6.getStackTrace()) {

　　　　　　// 通过异常栈中是否出现 XposedBridge 来判断 Xposed

　　　　　　if (stackTraceElement.getClassName().contains("de.robv.android.xposed.XposedBridge")) {

　　　　　　　　return true;

　　　　　　}

　　　　}

　　　　return false;

　　}

}

debuggable 检测

调用链

OuiCrGxF.onCreate() → p0.e.b().a(this) → I("破解要小心哦~")

debuggable 检测更偏提示性质，不承担强制退出逻辑。

...java

// 这里检查当前包是否处于 debuggable 状态

// 命中后只弹提示，不会立即退出

if (p0.e.b().a(this)) {

　　I("破解要小心哦~");

}

// p0.e.b().a(this)

public boolean a(Context context) {

　　return (context.getApplicationInfo().flags & 2)!= 0;

}

第二套模拟器检测

这个检测藏在开头的父类 onCreate() 中。

![图 5-2　父类 onCreate() 中的检测入口：进入 super.onCreate() 后立即开始一系列环境检测调用。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4710c1633e230213.png)

图 5-2　父类 onCreate() 中的检测入口：进入 super.onCreate() 后立即开始一系列环境检测调用。

图 5-2　父类 onCreate() 中的检测入口：进入 super.onCreate() 后立即开始一系列环境检测调用。

调用链

OuiCrGxF.onCreate() → p0.a.c(this) → m0()

...java

// 这是另一套模拟器特征检测

// 只要命中特征，就直接结束 APP

if (p0.a.c(this)) {

　　m0();

　　return;

}

// p0.a.c(this)

public static boolean c(Context context) {

　　ArrayList arrayList = new ArrayList();

　　try {

　　　　String strB = b(a(context));

　　　　// 先查静态特征，命不中再走备用检测

　　　　if (TextUtils.isEmpty(strB)) {

　　　　　　List listD = d(context);

　　　　　　if (listD.size() > 0) {

　　　　　　　　arrayList.add(listD.get(0));

　　　　　　}

　　　　} else {

　　　　　　arrayList.add(strB);

　　　　}

　　} catch (Exception e6) {

　　　　e6.printStackTrace();

　　}

　　return!arrayList.isEmpty();

}

Root 检测

调用链

OuiCrGxF.onCreate() → p0.e.b().d() → m0()

Root 检测直接参与流程控制，命中后也不会继续初始化。

...java

// Root 检测命中后同样直接结束流程

if (p0.e.b().d()) {

　　m0();

}

// p0.e.b().d()

public boolean d() {

　　// Root 检测分两步：

　　// 1. 先查 ro.secure　2. 再查常见 su 路径

　　if (c() == 0) {

　　　　return true;

　　}

　　return e();

}

private int c() {

　　String strB = p0.b.c().b("ro.secure");

　　return (strB!= null && "0".equals(strB))? 0: 1;

}

private boolean e() {

　　String\[\] strArr = {"/sbin/su", "/system/bin/su", "/system/xbin/su", "/data/local/xbin/su",

　　　　"/data/local/bin/su", "/system/sd/xbin/su", "/system/bin/failsafe/su", "/data/local/su"};

　　for (int i6 = 0; i6 < 8; i6++) {

　　　　// 常见 su 路径只要存在，就认定设备已 Root

　　　　if (new File(strArr\[i6\]).exists()) {

　　　　　　return true;

　　　　}

　　}

　　return false;

}

Hook 代码

...javascript · hook.js

// xposed 检测，直接返回 false

var xposed_hook = p0_e.f.overload();

xposed_hook.implementation = function() {

　　return false;

};

// 虚拟机检测，直接返回 false

var xuniqi_hook = p0_d.d.overload("android.content.Context", "p0.c");

xuniqi_hook.implementation = function(context, p0_c_instance) {

　　return false;

};

// debug 检测，直接返回 false

var debug_hook = p0_e.a.overload("android.content.Context");

debug_hook.implementation = function(context) {

　　return false;

};

// 模拟器检测，直接返回 false

var moniqi_hook = p0_a.c.overload("android.content.Context");

moniqi_hook.implementation = function(context) {

　　return false;

};

// root 检测，直接返回 false

var root_hook = p0_e.d.overload();

root_hook.implementation = function() {

　　return false;

};

这五个 Hook 分别对应 Xposed、虚拟环境、debuggable、模拟器与 Root 检测，是启动放行前必须处理的 Java 层拦截点。

开屏广告控制链

前面把启动检测处理掉之后，样本并不会立刻进入登录页或主页。配置返回成功后，程序会先进入 OuiCrGxF$q.run()，这里开始接管启动页后半段流程。

这一段里最容易误判的地方，是把广告逻辑看成一个独立功能点。实际上它更像一个「延迟放行器」。OuiCrGxF$q.run() 里先调用 com.secret.AD.h.i() 判断当前是否需要创建广告对象；如果返回 true，就通过 new com.secret.AD.h(OuiCrGxF.this, new d()) 把广告控制器挂到启动页上。

广告对象创建之后，并不会立刻决定页面跳转。com.secret.AD.h 的构造函数内部会马上调用 com.secret.AD.f()，开始倒计时；倒计时归零，或者用户手动点击跳过后，才会进入 com.secret.AD.h()，最终回调到 OuiCrGxF$q$d.run()，再由它调用 OuiCrGxF.e1()。

这里真正需要抓住的不是广告展示本身，而是 OuiCrGxF.e1() 的角色。e1() 才是整个启动页的统一放行口。它会同时检查两件事：一是广告是否已经结束，二是启动后续流程是否已经完成。只有当广告对象为空或 hVar.g() 返回 true，并且 f6972x 已经被置位之后，程序才会继续跳转到登录页或主页。

调用链

OuiCrGxF$q.run() → com.secret.AD.h.i()

→ new com.secret.AD.h(OuiCrGxF.this, new d())

→ com.secret.AD.h.f()（倒计时结束或点击跳过）

→ com.secret.AD.h.h() → OuiCrGxF$q$d.run()

→ OuiCrGxF.e1() → hVar.g() → 跳转登录页或主页

...java

// OuiCrGxF$q.run() 广告核心代码

if (com.secret.AD.h.i()) {

　　OuiCrGxF.this.f6971w = new com.secret.AD.h(OuiCrGxF.this, new d());

　　OuiCrGxF ouiCrGxF3 = OuiCrGxF.this;

　　ouiCrGxF3.f6965q.addView(ouiCrGxF3.f6971w, new RelativeLayout.LayoutParams(-1, -1));

}

// com.secret.AD.i()

public static boolean i() {

　　// 已有广告正在显示，或者本地没有广告配置时，都不创建广告

　　return (f6045i || g4.f.a().f().isEmpty())? false: true;

}

// com.secret.AD.g()

public boolean g() {

　　// 只有广告对象为空或倒计时结束，启动页才会继续放行

　　return this.f6021c == null || this.f6047g <= 0;

}

// com.secret.prettyhezi.OuiCrGxF.e1()

public void e1() {

　　if (this.f6966r ||!this.f6972x) {

　　　　return;

　　}

　　com.secret.AD.h hVar = this.f6971w;

　　// 这里才是统一放行口：

　　// 没有广告对象，或者广告已经结束，才会继续跳转后续页面

　　if (hVar == null || hVar.g()) {

　　　　a0 a0VarR = MainApplication.f6868r.r();

　　　　if (a0VarR == null) {

　　　　　　cls = CfTs9fWO.class;　　// 没有用户态 → 登录页

　　　　} else {

　　　　　　cls = ZIgnJ.class;　　　// 有用户态 → 主页

　　　　}

　　　　N0(cls);

　　　　finish();

　　}

}

q.run() / AD.h.i() / new AD.h(…)

启动页后续调度节点；判断是否需要创建广告对象；真正实例化广告控制器并把「广告结束后的回调」挂到启动页。

AD.h.g()

判断广告是否可视为已结束或无需继续等待。

OuiCrGxF.e1()

启动页统一放行口，决定最终跳转登录页还是主页面。

广告 Hook 代码

...javascript · hook.js

// 跳过广告创建

var ad_hook = AD_h.i.overload();

ad_hook.implementation = function() {

　　return false;

};

// 让广告状态直接视为已结束

var ad_stop_time_hook = AD_h.g.overload();

ad_stop_time_hook.implementation = function() {

　　return true;

};

// 广告是否被初始化以及获取广告剩余时间，返回 true 绕过检测

var AD_h = Java.use("com.secret.AD.h");

var init = AD_h.$init.overload("com.secret.prettyhezi.Yclh4J3zF", "java.lang.Runnable");

init.implementation = function (ctx, r) {

　　console.log("广告被初始化");

　　var ret = init.call(this, ctx, r);

　　try {

　　　　var fields = AD_h.class.getDeclaredFields();

　　　　for (var i = 0; i < fields.length; i++) {

　　　　　　console.log("field name: " + fields\[i\].getName() + " value: " + fields\[i\].get(this)

　　　　　　　　+ " type: " + fields\[i\].getType());

　　　　}

　　　　this.g.value = 0;

　　　　console.log("广告剩余时间：" + this.g.value);

　　} catch (e) {

　　　　console.log("dump fields failed: " + e);

　　}

　　return init.call(this, ctx, r);

};

登录分析

前面把启动检测和广告放行链理顺之后，样本才真正走到「要不要给你业务权限」这一步。这个阶段最值得跟的不是某个孤立接口，而是登录态到底怎么建立、怎么落盘、又怎么在下次启动时被重新捞回来。BeautyBox 在这里没有走简单明文请求，而是把登录页输入、设备态字段、Native 编解码和本地登录态缓存串成了一条完整链路，所以只要把这一段看明白，后面的自动登录恢复和视频解锁链就都能顺着接上。

手动登录请求构造与发送

调用链

CfTs9fWO.onCreate() → this.f7644v.setOnClickListener(new c())

→ CfTs9fWO$c.a(View) → CfTs9fWO.B(new c.a())

→ 验证码回调 c.a.b(str, str2) → CfTs9fWO.W0(captchaKey, captchaPos)

→ j.r(...) → j.t(..., mode=1,...) → Server.e.c(...) → abc.ea5(...)

![图 5-3　登录页 onCreate()：动态构建登录/注册切换、账号与密码输入框（setHint Account / Password）与登录按钮点击监听。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0e3582b202ff3770.png)

图 5-3　登录页 onCreate()：动态构建登录/注册切换、账号与密码输入框（setHint Account / Password）与登录按钮点击监听。

图 5-3　登录页 onCreate()：动态构建登录/注册切换、账号与密码输入框（setHint Account / Password）与登录按钮点击监听。

真正顺着登录页往下跟时，会发现它并不是「点按钮就直接发一个账号密码过去」。登录按钮最终会落到 CfTs9fWO.W0(captchaKey, captchaPos)，先把账号、密码、验证码标识和验证码坐标统一组装进 Registration.p，再交给 j.r() 和 j.t() 进入统一 POST 链。也就是说，登录页本身只负责把输入整理成一份标准请求对象，真正负责把这份对象送进网络层的，是后面的 j.t(..., mode=1)。

这一步之所以关键，是因为它正好把 Java 业务层和 Native 加密层连了起来。j.t() 在 mode=1 时不会把 JSON 明文直接发出去，而是先通过 Server.e.c() 进入 abc.ea5()。换句话说，登录链并不是「Java 里构造好参数就结束」，而是从这里开始正式进入 Native 字节级请求加密流程。

...java

## 登录链分析

// CfTs9fWO.W0(captchaKey, captchaPos)

void W0(String str, String str2) {

　　String strTrim = this.f7642t.f8426c.getText().toString().trim();

　　String strTrim2 = this.f7643u.f8594b.getText().toString().trim();

　　J0();

　　// 这里把账号、密码、验证码 key、验证码坐标统一装进 Registration.p

　　// 然后发往 auth/json，正式进入登录请求链

　　com.secret.prettyhezi.j.r(

　　　　com.secret.prettyhezi.Server.v.f7323a + "auth/json",

　　　　new com.secret.prettyhezi.Registration.p(strTrim, strTrim2, str, str2),

　　　　false,

　　　　new g(this, strTrim, strTrim2)

　　);

}

// com.secret.prettyhezi.Registration.p

public class p extends k {

　　public String x5;　　// 账号

　　public String x7;　　// 密码

　　public String xi;　　// 验证码 key

　　public String xj;　　// 验证码点击坐标

　　public p(String str, String str2, String str3, String str4) {

　　　　this("a", str, str2, str3, str4);

　　}

　　public p(String str, String str2, String str3, String str4, String str5) {

　　　　super(str);

　　　　this.x5 = str2;

　　　　this.x7 = str3;

　　　　this.xi = str4;

　　　　this.xj = str5;

　　}

}

// j.r()

public static void r(String str, Object obj, boolean z5, e eVar) {

　　// j.r 先把对象转成 JSON，再继续下沉到 u / t 这条统一 POST 链

　　u(str, com.secret.prettyhezi.f.e(obj), z5, 1, eVar);

}

// j.t()

public static void t(String str, String str2, String str3, int i6, e eVar) {

　　RequestBody requestBodyCreate;

　　if (i6 > 0) {

　　　　try {

　　　　　　// mode=1 时，请求体不会明文发送

　　　　　　// 而是先交给 Server.e.c -> abc.ea5 做 Native 字节级加密

　　　　　　requestBodyCreate = RequestBody.create(f8646d,

　　　　　　　　com.secret.prettyhezi.Server.e.c(str2, i6));

　　　　} catch (Exception e6) {

　　　　　　e6.printStackTrace();

　　　　　　requestBodyCreate = null;

　　　　}

　　} else {

　　　　requestBodyCreate = RequestBody.create(f8646d, str2);

　　}

...

}

CfTs9fWO.W0()

登录页真正构造 auth/json 请求的位置。

Registration.p

登录请求体对象，承载账号、密码、验证码 key 与点击坐标。

j.r() / j.t()

统一 POST 请求入口，mode=1 时触发 Native 字节级加密。

Server.e.c() / abc.ea5()

把登录 JSON 包装成发送给服务端的加密字节流。

这里还要补一层很容易被忽略的关系：登录请求里拼接出来的 Server.v.f7323a + "auth/json"，其中 f7323a 并不是 Java 层硬编码的明文域名，而是「本地缓存优先，Native 默认域名兜底」的运行时主站地址。Server.v 类加载时会先尝试读取本地 keyLastServer4；如果本地已经保存过上次成功使用的主站，就直接复用；如果没有，才退回 abc.c(1) 作为默认主站。

与之对应，f7324b 则来自 abc.c(2)；而 Server.v.b() 这一段代码中，又确实存在 abc.c(2) 与 abc.c(3) 之间的切换逻辑。更稳妥的理解是：abc.c(1) / c(2) / c(3) 在 Java 业务层首先表现为 3 个内置站点常量，而不是所有业务都统一遵循「1 不通走 2、2 不通走 3」的通用主备链。就当前登录请求这条链来看，它明确拼接的是 f7323a + "auth/json"，而 f7323a 的默认值正是 abc.c(1)。这样再回头看登录请求，就能看明白：APP 发送的并不是一个写死到 Java 代码里的完整 URL，而是「运行时主站 + 业务路径」的动态拼接结果，而这个主站本身又是由 Native 层 abc.c() 提供初始值的。

...java · Server.v

// com.secret.prettyhezi.Server.v

public static String f7323a = g4.f.a().i("keyLastServer4", abc.c(1));

public static String f7324b = abc.c(2);

public static String b() {

　　String strC = abc.c(2);

　　if (strC.equals(f7324b)) {

　　　　strC = abc.c(3);

　　}

　　f7324b = strC;

　　return strC;

}

结合 jadx 继承关系观察，可进一步对齐出 mode=1 登录请求体中的关键字段：x5 账号、x7 密码、xi 验证码 key、xj 验证码点击坐标；x1/x0/x2/x3/x4 则来自父类请求对象的设备标识、固定类型、设备 ID、系统版本与厂商型号。登录请求在进入 Native 前，已经在 Java 层完成了标准化组装。

![图 5-4　hook 捕获登录请求：j.r → j.t 触发 POST auth/json，请求体含 x5 账号、x7 密码、xi 验证码 key、xj 点击坐标与 x0~x4 设备字段，加密模式 = 1。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/72c103f99939cb94.png)

图 5-4　hook 捕获登录请求：j.r → j.t 触发 POST auth/json，请求体含 x5 账号、x7 密码、xi 验证码 key、xj 点击坐标与 x0~x4 设备字段，加密模式 = 1。

图 5-4　hook 捕获登录请求：j.r → j.t 触发 POST auth/json，请求体含 x5 账号、x7 密码、xi 验证码 key、xj 点击坐标与 x0~x4 设备字段，加密模式 = 1。

登录成功后的用户态更新与本地落盘

调用链

j.t(..., mode=1, new g(...)) → okhttp Callback.onResponse()

→ Server.e.a(resp.bytes(), 1) → abc.da5(...)

→ CfTs9fWO$g.g(String) → MainApplication.A(pVar.data)

→ MainApplication.x() / z(uid, token) → g4.f.a().l(account, password, token)

→ BrmpD.T0(...) 或 N0(ZIgnJ.class)

把请求发出去之后，登录链真正值得盯的不是「有没有返回 200」，而是这次登录成功到底在客户端落下了哪些状态。从 jadx 看，响应包先回到统一网络层，再经 Server.e.a() → abc.da5() 解密成明文 JSON，最后才进入 CfTs9fWO$g.g(String) 这个登录成功回调。也就是说，前面手动输入的账号密码只是把请求送到服务端，真正决定下次能不能自动恢复、能不能直接进主页的，是这里这一串连续的本地状态更新动作。

![图 5-5　登录成功回调后的 MainApplication.A 用户态更新：userId、昵称、等级、用户 JSON 与 Token 全量回写。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c40f0eeec6449b28.png)

图 5-5　登录成功回调后的 MainApplication.A 用户态更新：userId、昵称、等级、用户 JSON 与 Token 全量回写。

图 5-5　登录成功回调后的 MainApplication.A 用户态更新：userId、昵称、等级、用户 JSON 与 Token 全量回写。

这一段的结论很明确：MainApplication.A() 先把服务端返回的用户对象塞进当前进程内存，再通过 x() 和 z() 把 keyCurUser<uid>、keyCurUID、keyCurToken 写回本地；与此同时，刚才在登录页输入的账号和密码也会通过 g4.f.a().l(...) 一起落盘。这样下次启动时，APP 就不是「重新让你从零登录一次」，而是直接拿现成的本地状态去尝试恢复。

...java

// com.secret.prettyhezi.User.CfTs9fWO$g.g(java.lang.String)

class g extends t.g {

　　@Override // com.secret.prettyhezi.t.g

　　public void g(String str) {

　　　　p pVar = (p) com.secret.prettyhezi.f.d(str, p.class);

　　　　if (pVar.code!= 200) {

　　　　　　MainApplication.f6868r.A(null);

　　　　　　f(pVar.err);

　　　　　　return;

　　　　}

　　　　// 登录成功后，先把返回的用户对象写入当前应用状态

　　　　UytRUHE.V0();

　　　　MainApplication.f6868r.A(pVar.data);

　　　　// 再把账号、密码和 token 时效信息持久化

　　　　g4.f.a().l(this.f7654b, this.f7655c, pVar.data.token);

　　　　NbNhY.T0(null);

...

　　}

}

// com.secret.prettyhezi.MainApplication.A(a0) / x()

public void A(a0 a0Var) {

　　// 这里更新当前内存中的用户对象

　　this.f6887p = a0Var;

　　// 并立即触发 keyCurUser<uid> 的写回

　　x();

　　if (a0Var == null) {

　　　　z(0L, HttpUrl.FRAGMENT_ENCODE_SET);

　　　　this.f6885n = null;

　　　　this.f6884m = -1;

　　　　return;

　　}

　　// 登录成功后，这里同步刷新全局 UID 与 Bearer Token

　　z(a0Var.UserId(), a0Var.token.token);

...

}

public void x() {

　　a0 a0Var = this.f6887p;

　　if (a0Var == null) {

　　　　g4.f.a().q("keyCurUser" + f(), HttpUrl.FRAGMENT_ENCODE_SET);

　　　　return;

　　}

　　// 当前用户对象会以 JSON 形式写入 keyCurUser<uid>

　　String strE = f.e(a0Var);

　　g4.f.a().q("keyCurUser" + this.f6887p.UserId(), strE);

}

// com.secret.prettyhezi.MainApplication.z(long, java.lang.String)

public static void z(long j6, String str) {

　　if (str == null) {

　　　　str = HttpUrl.FRAGMENT_ENCODE_SET;

　　}

　　// keyCurUID / keyCurToken 是全局登录态恢复的核心落点

　　f6869s = j6;

　　f6870t = str;

　　g4.f.a().p("keyCurUID", f6869s);

　　g4.f.a().q("keyCurToken", f6870t);

}

// g4.f.l(java.lang.String, java.lang.String, com.secret.prettyhezi.Server.a0$h)

public void l(String str, String str2, a0.h hVar) {

　　SharedPreferences.Editor editorEdit = this.f10716b.edit();

　　// 登录页输入的账号和密码会直接缓存，供启动期自动登录复用

　　editorEdit.putString(f10710e, str);

　　editorEdit.putString(f10711f, str2);

　　editorEdit.commit();

　　// 这里单独保存 token 与过期时间

　　s(hVar);

...

}

CfTs9fWO$g.g(String)

登录成功回调，负责解析响应并驱动整套登录态更新。

Server.e.a() / abc.da5()

对 mode=1 的响应体做 Native 字节级解密。

MainApplication.A()

刷新当前用户对象，并同步调用 x() / z() 更新 keyCurUser<uid>、keyCurUID、keyCurToken。

g4.f.l()

把账号、密码以及 token 时效信息持久化，供启动期自动登录复用。

登录真正完成的标志，不是界面跳了，而是状态都写下来了

keyCurUser<uid> · keyCurUID · keyCurToken · keyAccount · keyPassword

启动期自动登录恢复

调用链

OuiCrGxF.j1() → runOnUiThread(new n()) → OuiCrGxF$n.run()

→ Device.a.i()!= null? d1(): l1()

→ d1() 优先走 Server.v.w(token, b1())，失败再退回 o1()

→ o1() 继续请求 auth/json → OuiCrGxF$f.c(String)

→ MainApplication.A(pVar.data) / g4.f.a().s(pVar.data.token)

→ f6972x = true → e1()

把登录落盘链看完之后，再回头看启动页里的恢复逻辑就会顺很多。样本并不是每次启动都老老实实把用户重新送回登录页，而是会先把上一次保存下来的状态都拿出来试一遍。这里最重要的自检点，是不要把它写成单线流程。OuiCrGxF.j1() 之后先进入 n.run()，然后根据 Device.a.i() 是否存在分成两路：设备标识已经准备好时走 d1()，否则先走 l1() 补设备态，再回到 d1()。

进入 d1() 之后也不是只有一条路。它会先看本地有没有 keyCurToken 对应的可用 token；如果有，就直接调用 Server.v.w(token, b1()) 走 token 恢复；如果 token 为空或失效，才退回 o1()，用 keyAccount / keyPassword 再发一次 auth/json。这也就解释了为什么前面登录成功时写下来的 keyAccount、keyPassword、keyCurToken 都那么关键，因为启动页后半段会把它们全部重新用起来。

还有一个很容易漏掉的点：d1() 末尾还有 if (this.f6974z == null) postDelayed(new g(), 400L) 这条放行路径。它说明启动页不会无限等待登录恢复回调；当恢复回调对象都还没建立起来时，程序会在 400ms 后主动把 f6972x 置位，再交给 e1() 统一决定后续跳转。所以这一段更准确的理解不是「启动必然先成功恢复登录再跳页面」，而是「启动页会尽量恢复登录，同时和广告放行口一起汇入 e1() 做最终决策」。

...java

// com.secret.prettyhezi.OuiCrGxF.d1() / o1()

void d1() {

　　if (MainApplication.f6868r.b()) {

　　　　String strH = g4.f.a().h();

　　　　if (strH == null || strH.length() <= 0) {

　　　　　　// 本地 token 失效时，退回账号密码自动登录

　　　　　　o1();

　　　　} else {

　　　　　　// token 仍有效时，优先走 token 直接恢复

　　　　　　com.secret.prettyhezi.Server.v.w(strH, b1());

　　　　}

　　}

　　if (this.f6974z == null) {

　　　　this.f6965q.postDelayed(new g(), 400L);

　　}

}

void o1() {

　　String strF = g4.f.a().f();

　　String strG = g4.f.a().g();

　　if (strF.isEmpty() || strG.isEmpty()) {

　　　　return;

　　}

　　this.f6973y = true;

　　// 启动页自动登录同样走 auth/json，只是验证码 key 改为 abc.c(9)

　　com.secret.prettyhezi.j.r(

　　　　com.secret.prettyhezi.Server.v.f7323a + "auth/json",

　　　　new com.secret.prettyhezi.Registration.p(strF, strG, abc.c(9), "26,37"),

　　　　false,

　　　　b1()

　　);

}

// com.secret.prettyhezi.OuiCrGxF$n.run() / l1() / b1()

class n implements Runnable {

　　@Override

　　public void run() {

　　　　OuiCrGxF.this.f6970v = true;

　　　　// 已有设备标识就直接进入恢复逻辑，否则先补设备态

　　　　if (com.secret.prettyhezi.Device.a.i()!= null) {

　　　　　　OuiCrGxF.this.d1();

　　　　} else {

　　　　　　OuiCrGxF.this.l1();

　　　　}

　　}

}

void l1() {

　　// 这里先请求 auth/json 拿到设备相关恢复材料

　　com.secret.prettyhezi.j.r(

　　　　com.secret.prettyhezi.Server.v.f7323a + "auth/json",

　　　　new com.secret.prettyhezi.Registration.g("i"),

　　　　false,

　　　　new p(this, new o())

　　);

}

j.e b1() {

　　// 自动恢复统一复用 OuiCrGxF$f 这个回调对象

　　if (this.f6974z == null) {

　　　　this.f6974z = new f();

　　}

　　return this.f6974z;

}

// com.secret.prettyhezi.OuiCrGxF$f.c(java.lang.String)

class f extends j.e {

　　@Override

　　public void c(String str) {

　　　　OuiCrGxF.this.f6965q.post(new a(str));

　　}

　　class a implements Runnable {

　　　　final String raw;

　　　　a(String str) {

　　　　　　this.raw = str;

　　　　}

　　　　@Override

　　　　public void run() {

　　　　　　com.secret.prettyhezi.Server.p pVar =

　　　　　　　　(com.secret.prettyhezi.Server.p) com.secret.prettyhezi.f.d(

　　　　　　　　　　this.raw, com.secret.prettyhezi.Server.p.class);

　　　　　　if (pVar.code == 200) {

　　　　　　　　// token 恢复或账号密码自动登录成功后，都在这里重新写回用户态

　　　　　　　　MainApplication.f6868r.A(pVar.data);

　　　　　　　　g4.f.a().s(pVar.data.token);

　　　　　　　　NbNhY.T0(null);

　　　　　　} else if (!OuiCrGxF.this.f6973y) {

　　　　　　　　// token 恢复失败，再退回账号密码自动登录

　　　　　　　　OuiCrGxF.this.o1();

　　　　　　　　return;

　　　　　　} else {

　　　　　　　　MainApplication.f6868r.A(null);

　　　　　　}

　　　　　　OuiCrGxF.this.f6972x = true;

　　　　　　OuiCrGxF.this.e1();

　　　　}

　　}

}

j1() / n.run()

启动页把登录恢复正式排上执行队列，并决定先走设备态恢复还是直接进入登录恢复。

d1() / l1() / o1()

判断走 token 恢复还是账号密码自动登录；设备标识未就绪时先补设备态；用 keyAccount / keyPassword 构造自动登录请求。

OuiCrGxF$f.c()

自动恢复统一回调，负责失败回退、成功写回与最终放行。

手动登录链的核心是 Registration.p → j.t(mode=1) → abc.ea5/da5 → MainApplication.A()，也就是「输入整理 → Native 加密 → 响应解密 → 用户态落盘」这一整条闭环。

启动恢复链的核心是先试 token，失败后再退回 keyAccount / keyPassword 重新请求 auth/json，同时还带着设备态补齐与 e1() 放行协同逻辑。

登录态真正落地的位置有三类：keyCurUser<uid>、keyCurUID / keyCurToken、keyAccount / keyPassword。理解了这几个落点，后面再看主页直达、视频解锁后的用户态回写，就不会再觉得它们是孤立现象。

视频解锁分析

视频详情定位与锁态判断

调用链

EkHbSOqG.onCreate() → p1() → j.m(Server.v.f7323a + b1(), new j(this))

→ EkHbSOqG$j.g(String) → VOGkBN.i1(String) → this.P =!vVar.data.st

真正去跑视频解锁链时，第一步不是先看 unlock/json，而是先看详情页到底怎么判断「当前视频是否还锁着」。从 EkHbSOqG.onCreate() 往下跟，页面初始化后会立刻调用 p1() 拉取详情，长视频这里最终会落到 VOGkBN.i1(String)。在这个回调里，程序把服务端返回的详情对象塞进 this.N，再根据 vVar.data.st 计算 this.P。换句话说，锁态并不是客户端本地拍脑袋判断的，而是详情接口返回后才真正确定。

如果用户此时点的是「试看」而不是「积分解锁」，程序还会进入 VOGkBN.L1()，额外请求一次 rrvideo/play/json?id=... 去拿试看播放链路；但这条链和后面的积分解锁不是同一个动作，最好把它单独当成「已锁内容下的试看分支」来看。

...java

// com.secret.prettyhezi.EkHbSOqG.p1()

void p1() {

　　H0();

　　// 先请求 show/json，把当前资源详情拉回来

　　com.secret.prettyhezi.j.m(

## 视频解锁链

　　　　com.secret.prettyhezi.Server.v.f7323a + b1(), new j(this));

}

// com.secret.prettyhezi.VOGkBN.i1(java.lang.String)

@Override

protected void i1(String str) {

　　v vVar = (v) f.d(str, v.class);

　　if (vVar.code!= 200) {

　　　　x0(vVar);

　　　　return;

　　}

　　// 当前长视频详情对象

　　this.N = vVar.detail();

　　// st=false 时，说明当前内容仍处于未解锁状态

　　this.P =!vVar.data.st;

　　J1();

}

支付密码校验与解锁请求

调用链

EkHbSOqG.k1() → q1(sc) → 确认弹窗 new m()

→ Device.a.b(activity, new a())（已缓存支付密码则直接继续）

→ 未缓存时请求 user/pverify/json → EkHbSOqG$m$a.a(String)

→ j.r(Server.v.f7323a + g1(), new Server.v.g(id), true,...) → rrvideo/unlock/json

定位到详情页之后，真正的解锁动作并不是按钮一按就直接打 unlock/json。EkHbSOqG.k1() 会先根据积分价格弹出确认框；用户确认后进入 Device.a.b(...)，这里专门负责收集支付密码。如果本地已经缓存了 6 位支付密码，就直接把它交给后续回调；如果没有缓存，或者当前账号要求重新校验，就先请求 user/pverify/json 验证密码。只有密码验证通过，才会继续真正的 rrvideo/unlock/json。

这一步很适合写成实战结论，因为它把「支付密码」和「视频解锁」两个看似相连的动作拆开了。前者先验证用户是否有资格继续提交，后者才是真正扣积分换播放权限的业务请求。两者虽然目的不同，但最后都会走进统一的 j.r() → j.t(mode=1) → Server.e.c() → abc.ea5() 请求加密链，所以从 hook 日志上看，表现出来都是 mode=1 的受保护请求。

![图 5-6　视频解锁前先弹出 6 位支付密码输入框。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2eba2c6003028ee7.jpg)

图 5-6　视频解锁前先弹出 6 位支付密码输入框。

图 5-6　视频解锁前先弹出 6 位支付密码输入框。

![图 5-7　hook 日志：j.r 携带支付密码请求 user/pverify/json，是否需要认证 = true。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e7a3e53e01113d01.png)

图 5-7　hook 日志：j.r 携带支付密码请求 user/pverify/json，是否需要认证 = true。

图 5-7　hook 日志：j.r 携带支付密码请求 user/pverify/json，是否需要认证 = true。

![图 5-8　EA5 加密 #6：pverify 请求体经 mode=1 链路加密，14 字节明文输出 42 字节十六进制密文。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4513019ce1902ac.png)

图 5-8　EA5 加密 #6：pverify 请求体经 mode=1 链路加密，14 字节明文输出 42 字节十六进制密文。

图 5-8　EA5 加密 #6：pverify 请求体经 mode=1 链路加密，14 字节明文输出 42 字节十六进制密文。

![图 5-9　DA5 解密 #11：pverify 响应解密为 {](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0d88a373bb69dba4.png)

图 5-9　DA5 解密 #11：pverify 响应解密为 {

图 5-9　DA5 解密 #11：pverify 响应解密为 {"code":200,"data":true}，支付密码校验通过。

![图 5-10　构造积分解锁请求 rrvideo/unlock/json：携带资源 id 与支付密码，加密模式 = 1。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5fbff1f3dbce270e.png)

图 5-10　构造积分解锁请求 rrvideo/unlock/json：携带资源 id 与支付密码，加密模式 = 1。

图 5-10　构造积分解锁请求 rrvideo/unlock/json：携带资源 id 与支付密码，加密模式 = 1。

![图 5-11　解锁响应解密：code=200，服务端真实下发 master.m3u8 播放资源（w:718 h:1280），st=true。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c0af7765197d760d.png)

图 5-11　解锁响应解密：code=200，服务端真实下发 master.m3u8 播放资源（w:718 h:1280），st=true。

图 5-11　解锁响应解密：code=200，服务端真实下发 master.m3u8 播放资源（w:718 h:1280），st=true。

...java

// com.secret.prettyhezi.Device.a$f.a(java.lang.CharSequence, int)

@Override

public void a(CharSequence charSequence, int i6) {

　　String string = this.f6232a.getText().toString();

　　this.f6233b.j(this.f6234c);

　　a0 a0Var = this.f6235d;

　　if (a0Var == null || a0Var.bindstatus == 2) {

　　　　// 本地可直接用当前输入的支付密码继续后续解锁流程

　　　　a.f6219d = string;

　　　　this.f6236e.a(string);

　　} else {

　　　　// 否则先走 user/pverify/json 做密码校验

　　　　j.r(v.f7323a + "user/pverify/json", new v.f(string), true,

　　　　　　new C0075a(this.f6233b, string));

　　}

}

// com.secret.prettyhezi.EkHbSOqG$m$a.a(java.lang.String)

@Override

public void a(String str) {

　　// 支付密码校验通过后，才真正发 unlock/json

　　com.secret.prettyhezi.j.r(

　　　　com.secret.prettyhezi.Server.v.f7323a + EkHbSOqG.this.g1(),

　　　　new v.g(EkHbSOqG.this.f6264s),

　　　　true,

　　　　new C0077a(EkHbSOqG.this)

　　);

}

...dynamic-log

\[JS\] 请求地址: https://qq.taoqq163.com/user/pverify/json

\[JS\] 请求体: {"p":"xxxx"}

\[JS\] 明文内容: {"code":200,"data":true}

\[JS\] 请求地址: https://qq.taoqq163.com/rrvideo/unlock/json

\[JS\] 请求体: {"id":1298xxx,"p":"xxxx"}

\[JS\] 明文内容: {"code":200,"data":{"me":{"w":960,"h":540,"dur":763,

　　"p":"type8/cdn2/640/fb/fb4e4fa2.../master.m3u8",

　　"d":"type8/cdn2/640/fb/fb4e4fa2.../master.m3u8"},"st":true}}

解锁后的用户态回写与等级刷新

调用链

VOGkBN.l1(String) → eVar.data.st == true → y1()

→ MainApplication.f6868r.r().integral.all -= this.f6265t.sc

→ MainApplication.f6868r.x() → ZIgnJ.N.f8280r.j() / i() → C0226r.i()

→ j.m(Server.v.f7323a + "user/level/json", new j(...))

→ MainApplication.f6868r.r().level = xVar.data → MainApplication.f6868r.x()

解锁成功之后，程序也不是只把 m3u8 地址丢给播放器就结束了。VOGkBN.l1(String) 收到 unlock/json 的响应后，会先确认 st 为真，然后立刻调用 y1() 做本地用户态回写。这里直接把当前用户对象里的积分字段减掉本次消耗值，再调用 MainApplication.x() 把更新后的用户 JSON 回写到 keyCurUser<uid>。紧接着它还会刷新主页侧边栏相关组件，所以从实战日志上能看到后面又出现了等级刷新和用户缓存更新。

！关键自检 🕳

user/level/json 虽然经常出现在解锁后的日志里，但静态上它并不是 unlock/json 成功回调里「下一行直接请求」。更准确的调用关系是：unlock/json 成功后，y1() 先改本地积分并刷新主页组件；之后 C0226r.i() 才去请求 user/level/json，把最新经验和等级重新拉回界面。写成「解锁后的用户态刷新阶段继续触发 user/level/json」是准确的，写成「unlock/json 成功后立即直接调用」就过度线性化了。

![图 5-12　解锁成功后 MainApplication.r 两次用户读取对比：积分 all 由 124.5 扣减至 121.5。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9956e6aa75f48739.png)

图 5-12　解锁成功后 MainApplication.r 两次用户读取对比：积分 all 由 124.5 扣减至 121.5。

图 5-12　解锁成功后 MainApplication.r 两次用户读取对比：积分 all 由 124.5 扣减至 121.5。

...java

// com.secret.prettyhezi.VOGkBN.l1(java.lang.String)

@Override

protected void l1(String str) {

　　e eVar = (e) f.d(str, e.class);

　　if (eVar.code!= 200) {

　　　　t.d(this, eVar.err);

　　　　return;

　　}

　　if (eVar.data.st) {

　　　　// 解锁成功后先更新当前用户积分与缓存

　　　　y1();

　　　　// 再把服务端返回的可播放资源写回详情对象

　　　　this.N.f7301me = eVar.data.f7864me;

　　　　this.P = false;

　　　　I1();

　　　　H1();

　　}

}

// com.secret.prettyhezi.EkHbSOqG.y1()

public void y1() {

　　// 本地先把当前用户积分减掉本次视频消耗值

　　MainApplication.f6868r.r().integral.all -= this.f6265t.sc;

　　// 然后立刻把新的用户对象写回 keyCurUser<uid>

　　MainApplication.f6868r.x();

　　// 刷新主页/侧边栏相关 UI

　　ZIgnJ.N.f8280r.j();

　　ZIgnJ.N.f8280r.i();

}

// com.secret.prettyhezi.C0226r.i() / C0226r$j.g(java.lang.String)

public void i() {

　　if (MainApplication.f6868r.r().grade == 0) {

　　　　return;

　　}

　　// 解锁后刷新侧边栏时，会再去拉一次 user/level/json

　　com.secret.prettyhezi.j.m(

　　　　com.secret.prettyhezi.Server.v.f7323a + "user/level/json",

　　　　new j(this.f8869b));

}

class j extends t.g {

　　@Override

　　public void g(String str) {

　　　　x xVar = (x) com.secret.prettyhezi.f.d(str, x.class);

　　　　if (xVar.code!= 200) {

　　　　　　f(xVar.err);

　　　　　　return;

　　　　}

　　　　// 这里把最新经验与等级重新写回当前用户对象

　　　　MainApplication.f6868r.r().level = xVar.data;

　　　　MainApplication.f6868r.x();

　　　　C0226r.this.m();

　　}

}

积分解锁请求 / 响应 Hook 代码

...javascript · hook.js

// com.secret.prettyhezi.js.hook.js - score unlock request/response hooks

function isScoreUnlockRequest(url) {

　　if (!url) {

　　　　return false;

　　}

　　url = String(url);

　　return url.indexOf("/unlock/json") >= 0 && url.indexOf("/unlock/destory/json") < 0;

}

function logScoreUnlockRequest(method, url, mode, body, extra) {

　　latest_score_unlock_req = {

　　　　source: "score_unlock",

　　　　url: safeToText(url),

　　　　body: safeToText(body),

　　　　extra: safeToText(extra),

　　　　mode: mode,

　　　　time: (new Date()).toISOString()

　　};

　　logVideoRequest("积分解锁请求", method, url, mode, body, extra);

}

function logScoreUnlockResponse(req, mode, text) {

　　console.log("");

　　console.log("========== 积分解锁响应 ==========");

　　if (req!== null) {

　　　　logCn("请求来源", req.source);

　　　　logCn("请求地址", req.url);

　　　　logCn("请求体", req.body);

　　　　if (req.extra!== "") {

　　　　　　logCn("附加信息", req.extra);

　　　　}

　　　　logCn("记录时间", req.time);

　　}

　　logCn("响应内容", text);

　　console.log("");

}

var rHook = J.r.overload("java.lang.String", "java.lang.Object", "boolean", "com.secret.prettyhezi.j$e");

rHook.implementation = function (url, body, needAuth, cb) {

　　var bodyText = serializeRequestBody(body);

　　rememberRequest("j.r", url, bodyText, "是否需要认证=" + needAuth + "，回调对象=" + cb, 1);

　　if (isScoreUnlockRequest(url)) {

　　　　logScoreUnlockRequest("POST", url, 1, bodyText, "来源=j.r，是否需要认证=" + needAuth + "，回调对象=" + cb);

　　}

　　return rHook.call(J, url, body, needAuth, cb);

};

var tHook = J.t.overload("java.lang.String","java.lang.String","java.lang.String","int","com.secret.prettyhezi.j$e");

tHook.implementation = function (str, str2, str3, i6, eVar) {

　　rememberRequest("j.t", str, str2, str3, i6);

　　if (isScoreUnlockRequest(str)) {

　　　　logScoreUnlockRequest("POST", str, i6, str2, "来源=j.t，附加参数=" + str3 + "，回调对象=" + eVar);

　　}

　　return tHook.call(J, str, str2, str3, i6, eVar);

};

var da5Hook = Abc.da5.overload("\[B", "int");

da5Hook.implementation = function (bArr, mode) {

　　var ret = da5Hook.call(Abc, bArr, mode);

　　var outText = byteArrayToText(ret);

　　var req = getRequestCtx(mode);

　　var unlockReq = null;

　　if (req!== null && isScoreUnlockRequest(req.url)) {

　　　　unlockReq = req;

　　} else if (latest_score_unlock_req!== null) {

　　　　unlockReq = latest_score_unlock_req;

　　}

　　if (unlockReq!== null) {

　　　　logScoreUnlockResponse(unlockReq, mode, outText);

　　}

　　return ret;

};

结合真实日志可以把解锁后的用户态更新再落细一层：

· user/pverify/json 返回 {"code":200,"data":true}，说明支付密码校验通过后才会继续解锁。

· rrvideo/unlock/json 返回 st:true 以及 me.p / me.d 播放路径，说明播放权限来自服务端下发，不是本地伪造。

· 解锁前 integral.all = 126.5，解锁后 integral.all = 124.5，本次实际扣除了 2.0 积分。

· 解锁后的用户态刷新阶段又出现 user/level/json，返回 {"exp":44361,"level":"Level 4"}，对应经验值从 44359 增加到 44361。

· 更新后的用户对象最终写回 keyCurUser3801184，与前面 MainApplication.x() 的静态分析完全对上。

补充说明：日志中某些 j.t 打印把 mode=1 请求统一归类成「登录请求」，这是 hook.js 里打印模板的分类方式，不代表 APP 真的把视频解锁请求当成登录请求处理。

本节小结

· 视频解锁链的核心是：show/json 锁态确认 → user/pverify/json 支付密码校验 → rrvideo/unlock/json 解锁 → keyCurUser<uid> 回写 → user/level/json 刷新等级。

· 登录链和视频解锁链虽然业务含义不同，但都共用 j.t(mode=1) → abc.ea5/da5 这条 Native 编解码主线。

· 从实战结果看，积分扣减、经验刷新和播放地址下发都来自真实服务端返回，因此这是一个完整的受保护业务闭环。

Java 到 Native 的连接链

调用链

MainApplication.<clinit>() → System.loadLibrary("ali") → c.abc.\* → libali.so

Java 层只保留轻量包装，真正关键的字符串常量返回、编解码和部分保护逻辑已经下沉到 libali.so。

...java

// com.secret.prettyhezi.MainApplication.<clinit>()

static {

　　// Application 加载时先装入 libali.so

　　System.loadLibrary("ali");

}

// c.abc

public abstract class abc {

　　public static native void abe(Context context);

　　public static native void abl(int i6);

　　public static native String abm(String str);

　　public static native String ams(String str);

　　public static native String amu(String str);

　　public static native String c(int i6);

## Native层分析

　　public static native String da2(String str);

　　public static native byte\[\] da5(byte\[\] bArr, int i6);

　　public static native String ea2(String str);

　　public static native byte\[\] ea5(byte\[\] bArr, int i6);

}

05

PART

Native 层分析

NATIVE LAYER · JNI / 编解码 / 常量保护

前面第 5 节已经把启动、登录和视频解锁这些主流程跑通了，这一节就不再从业务入口往下追，而是反过来回答一个问题：前面那些关键节点里，到底有哪些地方是真的进了 Native。顺着这个思路去看，libali.so 的角色就会很清楚，它不是一个边缘小库，而是同时承担了「字符串常量保护」和「请求/缓存编解码」两类核心能力。

JNI 注册与入口定位

Java 加载 so 与 native 注册

调用链

MainApplication.<clinit>() → System.loadLibrary("ali")

→ JNI_OnLoad → RegisterNatives("c/abc", off_E1000, 6) → c.abc.\*

如果只看 jadx，会觉得 c.abc 只是一个普通的 native 包装类；但把视角切到 IDA 以后，第一步就能确认 libali.so 在 JNI_OnLoad 里做了两件很关键的事：一是先调用 ptrace(PTRACE_TRACEME,...) 做反调试占位，二是把 c/abc 上这组核心方法一次性注册进来。也就是说，后面 Java 层凡是走到 abc.ea5/da5/ea2/da2/c，本质上都是在进这套统一注册好的 Native 能力。

![图 6-1　IDA 反编译 JNI\_OnLoad：ptrace(PTRACE\_TRACEME) 反调试占位 + GetEnv 后一次性注册 c/abc 的 6 个核心方法（off\_E1000）。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe74a5ec9e39cc5d.png)

图 6-1　IDA 反编译 JNI_OnLoad：ptrace(PTRACE_TRACEME) 反调试占位 + GetEnv 后一次性注册 c/abc 的 6 个核心方法（off_E1000）。

图 6-1　IDA 反编译 JNI_OnLoad：ptrace(PTRACE_TRACEME) 反调试占位 + GetEnv 后一次性注册 c/abc 的 6 个核心方法（off_E1000）。

...c

// libali.so:JNI_OnLoad

jint JNI_OnLoad(JavaVM \*vm, void \*reserved) {

　　// 先调用 ptrace(PTRACE_TRACEME,...)，这是一个很典型的反调试动作

　　ptrace(PTRACE_TRACEME, 0, 0, 0);

　　// 获取当前 JNI 环境，失败则直接返回错误

　　if ((\*vm)->GetEnv(vm, (void \*\*)&env, 65542)) {

　　　　return -1;

　　}

　　// 找到 Java 层的 c/abc 类

　　jclass cls = (\*env)->FindClass(env, "c/abc");

　　// 把 off_E1000 中定义的 6 个 native 方法一次性注册到 c/abc

　　(\*env)->RegisterNatives(env, cls, off_E1000, 6);

　　return 65542;

}

函数作用

· MainApplication.<clinit>()：在 Application 类初始化时装载 libali.so。

· JNI_OnLoad：完成 native 方法动态注册，同时提前执行 ptrace(PTRACE_TRACEME,...)，带有明显反调试意图。

· RegisterNatives("c/abc", off_E1000, 6)：把 Java 层 c.abc 的 6 个 native 方法一次性绑定到 libali.so 内部实现。

结合 IDA 可确认当前样本注册了以下 6 个 native 方法：

· abe(Context) → 0x42c34

· ea2(String) → 0x43234

· da2(String) → 0x43698

· da5(byte\[\], int) → 0x43afc

· ea5(byte\[\], int) → 0x43f10

· c(int) → 0x443d4（即后续重点分析的 minax）

！关键自检 🕳

JADX 中 c.abc 一共声明了 10 个 native 方法。但当前能从 JNI_OnLoad → RegisterNatives(env, cls, off_E1000, 6) 这条动态注册链直接确认的，是上面这 6 个方法。因此关于 JNI_OnLoad 注册关系的确定性结论，只覆盖这 6 个已在 off_E1000 中明确出现的方法。

ea5/da5/ea2/da2 Native 编解码链

继续往下拆之后，会发现 libali.so 里其实至少有两组不能混写的 Native 能力。第一组就是这里的 ea5/da5/ea2/da2，它们服务的是「请求、响应、本地缓存」这些会在业务流程里频繁经过的数据；第二组才是后面 abc.c() 那条专门负责域名等常量保护的链。把这两组先分开，是整篇分析里最重要的自检点之一。

![图 6-2　ea5/da5 登录链编解码日志：EA5 加密 #7 将 217 字节 auth/json 请求体加密为 245 字节十六进制；DA5 解密 #11 还原出 1205 字符的用户 JSON。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ff0d9d6affd591b8.png)

图 6-2　ea5/da5 登录链编解码日志：EA5 加密 #7 将 217 字节 auth/json 请求体加密为 245 字节十六进制；DA5 解密 #11 还原出 1205 字符的用户 JSON。

图 6-2　ea5/da5 登录链编解码日志：EA5 加密 #7 将 217 字节 auth/json 请求体加密为 245 字节十六进制；DA5 解密 #11 还原出 1205 字符的用户 JSON。

登录/业务请求加密链 ea5

调用链

CfTs9fWO.W0(...) / j.r(...) → j.t(..., mode=1,...) → Server.e.c(json, 1)

→ abc.ea5(byte\[\], 1) → JNI_OnLoad 注册 ea5 → xyz9(0x43f10)

从第 5 节回头看这条链会非常顺，因为前面已经确认过登录请求、支付密码校验请求、视频解锁请求最后都会汇入 j.t(mode=1)。所以这里真正要验证的不是「它会不会进 Native」，而是「进了 Native 以后是哪一个函数在接手请求体」。顺着 Server.e.c() 往下看，可以很稳地落到 abc.ea5()，再从 JNI_OnLoad 注册表把它对到 0x43f10。这样就能把前面实战里看到的 mode=1 请求，和这里的 Native 请求加密实现准确对上。

换句话说，ea5 在整套样本里的角色不是「某个接口专用加密函数」，而是Java 层把明文 JSON 交给 Native 之后的统一请求入口。只要正文里涉及受保护 POST 请求，这里都可以拿来当底层支撑。

...java

// com.secret.prettyhezi.Server.e.c(java.lang.String, int)

public static byte\[\] c(String str, int i6) {

　　try {

　　　　// Java 字符串请求体在这里先转成 UTF-8 字节

　　　　// 然后交给 abc.ea5 进入 Native 请求加密流程

　　　　return abc.ea5(str.getBytes("UTF-8"), i6);

　　} catch (Exception unused) {

　　　　return null;

　　}

}

public static void t(String str, String str2, String str3, int i6, e eVar) {

　　RequestBody requestBodyCreate;

　　if (i6 > 0) {

　　　　try {

　　　　　　// mode>0 时，请求体不会直接明文发送

　　　　　　// 而是统一走 Server.e.c -> abc.ea5

　　　　　　requestBodyCreate = RequestBody.create(f8646d,

　　　　　　　　com.secret.prettyhezi.Server.e.c(str2, i6));

　　　　} catch (Exception e6) {

　　　　　　e6.printStackTrace();

　　　　　　requestBodyCreate = null;

　　　　}

　　} else {

　　　　requestBodyCreate = RequestBody.create(f8646d, str2);

　　}

...

}

函数作用

· Server.e.c()：Java 请求体到 Native 字节加密的包装层。

· abc.ea5()：JNI 导出方法，负责把请求数据送入 xyz9。

· xyz9(0x43f10)：ea5 对应的 Native 实现。

登录/业务响应解密链 da5

调用链

OkHttp Callback.onResponse() → Server.e.a(resp.bytes(), mode)

→ abc.da5(byte\[\], mode) → JNI_OnLoad 注册 da5 → xyz8(0x43afc)

→ 返回 UTF-8 明文 JSON

da5 就是前面 ea5 的回程链。这个点在第 5 节里其实已经通过登录成功、视频解锁日志间接验证过一次了，因为 Java 层后面拿到的始终是可直接 f.d(..., class) 反序列化的 JSON 明文。现在再回到 Native 层看，Server.e.a() 明确先调 abc.da5()，再按 UTF-8 组回 Java 字符串，所以可以把结论再收紧一步：业务层里能看到的那些响应明文，都是先经过 da5 才回到 Java 的。

这样一来，前面为什么能用 hook 稳定看到登录响应、支付密码校验响应、积分解锁响应，也就完全说通了。它们不是「网络层刚好返回了明文」，而是 Native 已经在 da5 这一层把字节流还原完了。

...java

// com.secret.prettyhezi.Server.e.a(byte\[\], int)

public static String a(byte\[\] bArr, int i6) {

　　try {

　　　　// 响应字节会先经过 abc.da5 解密

　　　　// 然后再按 UTF-8 还原成 Java 字符串

　　　　return new String(abc.da5(bArr, i6), "UTF-8");

　　} catch (Exception unused) {

　　　　return null;

　　}

}

// com.secret.prettyhezi.j$d.onResponse(okhttp3.Call, okhttp3.Response)

class d implements Callback {

...

　　@Override // okhttp3.Callback

　　public void onResponse(Call call, Response response) {

　　　　j.f8644b = true;

　　　　if (response.code() == 200) {

　　　　　　try {

　　　　　　　　// mode>0 时，响应不会直接 body().string()

　　　　　　　　// 而是先走 Server.e.a -> abc.da5

　　　　　　　　this.f8655b.c(this.f8656c > 0

? com.secret.prettyhezi.Server.e.a(

　　　　　　　　　　　　response.body().bytes(), this.f8656c)

: response.body().string());

　　　　　　} catch (Exception unused) {

　　　　　　　　this.f8655b.b(0);

　　　　　　}

　　　　} else {

...

　　　　}

　　}

}

函数作用

· Server.e.a()：Java 响应字节到明文字符串的包装层。

· abc.da5()：JNI 导出方法，负责把响应数据送入 xyz8。

· xyz8(0x43afc)：da5 对应的 Native 实现。

配置持久化加密链 ea2

调用链

MainApplication.w(gVar) → f.e(gVar) → Server.e.d(json)

→ abc.ea2(String) → JNI_OnLoad 注册 ea2 → xyz6(0x43234)

→ g4.f.a().q("keyCurConfigure", cipherText)

继续往下看，就会发现 libali.so 不是只保护网络包，连本地配置缓存也给了单独一条字符串级编码链。这里最直观的落点就是 MainApplication.w(gVar)，服务端配置对象先被转成 JSON，再经 Server.e.d() → abc.ea2() 处理后写进 keyCurConfigure。所以 ea2 更像「本地配置持久化专用包装器」，而不是前面 ea5 那种面向网络请求体的字节级入口。

这一点在写帖子时很有用，因为它能把「同样都是 Native 编码，为什么一个返回 byte\[\]、一个返回 String」这个疑问提前解释掉。不是算法名字不同，而是它们本来就在处理两种不同形态、不同场景的数据。

...java

// com.secret.prettyhezi.MainApplication.w(com.secret.prettyhezi.Server.g)

public void w(com.secret.prettyhezi.Server.g gVar) {

　　this.f6888q = gVar;

　　if (gVar!= null) {

　　　　// 配置对象先转 JSON

　　　　// 再交给 Server.e.d -> abc.ea2 做 Native 字符串级编码

　　　　g4.f.a().q(f6871u,

　　　　　　com.secret.prettyhezi.Server.e.d(f.e(gVar)));

　　　　m();

　　}

}

public static String d(String str) {

　　try {

　　　　// 字符串级本地编码包装

　　　　return abc.ea2(str);

　　} catch (Exception unused) {

　　　　return null;

　　}

}

函数作用

· MainApplication.w()：配置落盘入口。

· Server.e.d()：Java 明文字符串到 Native 编码字符串的包装层。

· abc.ea2() / xyz6(0x43234)：配置缓存使用的 Native 字符串级编码实现。

配置恢复解密链 da2

调用链

MainApplication.k() → g4.f.a().i("keyCurConfigure", "")

→ Server.e.b(cipherText) → abc.da2(String) → xyz3(0x43698)

→ f.d(json, Server.g.class)

da2 和 ea2 就是一组正反链。前面写配置时走 ea2，这里读配置时就会从 keyCurConfigure 把字符串取出来，再经 Server.e.b() → abc.da2() 还原成明文 JSON，最后才恢复成 Server.g。所以如果从实战角度概括，这一组函数解决的不是「接口通信保护」，而是APP 重启后还能把之前保存下来的配置重新读回来。

...java

// com.secret.prettyhezi.MainApplication.k()

public com.secret.prettyhezi.Server.g k() {

　　if (this.f6888q == null) {

　　　　String strI = g4.f.a().i(f6871u, HttpUrl.FRAGMENT_ENCODE_SET);

　　　　if (strI.length() > 0) {

　　　　　　try {

　　　　　　　　// 先用 Server.e.b -> abc.da2 解出明文 JSON

　　　　　　　　// 再反序列化成 Server.g

　　　　　　　　this.f6888q = (com.secret.prettyhezi.Server.g) f.d(

　　　　　　　　　　com.secret.prettyhezi.Server.e.b(strI),

　　　　　　　　　　com.secret.prettyhezi.Server.g.class

　　　　　　　　);

　　　　　　} catch (Exception unused) {

　　　　　　}

　　　　}

　　}

　　return this.f6888q;

}

public static String b(String str) {

　　try {

　　　　// 字符串级本地解码包装

　　　　return abc.da2(str);

　　} catch (Exception unused) {

　　　　return null;

　　}

}

函数作用

· MainApplication.k()：配置恢复入口。

· Server.e.b()：Native 编码字符串到明文 JSON 的包装层。

· abc.da2() / xyz3(0x43698)：配置缓存使用的 Native 字符串级解码实现。

ea5/da5/ea2/da2 的算法归类

调用链

JNI_OnLoad → ea2/da2/da5/ea5 → xyz6/xyz3/xyz8/xyz9

→ 命中字符串 "AES" → 命中同一组 key 字面量 "gncdGCPoNdM(\[\[SEA"

把这四条链放在一起看，能得到一个比较稳的整体判断：它们属于同一组 AES 风格 Native 编解码族，服务的对象分别是「请求包、响应包、配置缓存」。这一步最重要的不是把模式名字硬猜死，而是先把边界划清楚。也就是前面登录、自动恢复、视频解锁里看到的那些受保护数据，底层大体都落在这组函数上；而后面马上要讲的 abc.c()，则是另一套专门保护内置字符串常量的 Blowfish 链。

...c

// libali.so:xyz6 / xyz3 / xyz8 / xyz9

// 下面四个 Native 实现里都能稳定命中相同的算法与 key 相关字符串

// xyz6 -> ea2　xyz3 -> da2　xyz8 -> da5　xyz9 -> ea5

"AES"

"gncdGCPoNdM(\[\[SEA"

自检结论

· ea5/da5：请求与响应方向的字节级编解码链，主要挂在 j.t(..., mode>0) 上。

· ea2/da2：配置与缓存方向的字符串级编解码链，主要挂在 MainApplication.w()/k() 上。

· 这四条链目前可稳定归类为 AES 相关 Native 实现，但仅凭当前静态证据不宜直接下结论到具体模式或填充方式。

· abc.c() / minax / Blowfish 仅负责常量字符串保护，不应与 ea5/da5/ea2/da2 混写。

abc.c() 调用链与功能定位

！注意

· 从这里开始，分析对象已经切换为 abc.c() 的常量字符串保护链。

· 这一段的目标是解释域名等内置字符串如何从密文表恢复，不再讨论 ea5/da5/ea2/da2 的请求或缓存编解码。

Java 域名常量到 native 字符串表

调用链

com.secret.prettyhezi.Server.v.<clinit>()

→ abc.c(1) / abc.c(2) / abc.c(3) → minax(0x443d4)

→ off_DA050\[index\] → 解密后返回 Java 字符串

如果说上一节是在回答「哪些业务数据要进 Native」，那这一节回答的就是「那些看不见的内置站点字符串到底藏在哪」。顺着 Server.v 往下跟，很容易先看到 abc.c(1) / c(2) / c(3)；再把这个入口丢给 IDA，就能直接落到 minax(0x443d4)。这样一来，域名这件事就不再停留在「Java 里看不到明文」的层面，而是可以明确写成：Java 层只是按索引取值，真正的字符串恢复发生在 Native 里。

这里也顺手把前面已经校正过的一个关键点固定下来：abc.c(1) / c(2) / c(3) 在 Java 业务层首先表现为 3 个内置站点常量，而不是所有请求都统一按「1 不通走 2、2 不通走 3」的通用主备逻辑。当前能静态确认的，只是 f7323a 默认来自 abc.c(1)，以及 Server.v.b() 里确实存在 abc.c(2) 和 abc.c(3) 的局部切换关系。

![图 6-3　abc.c() 的 Native 总入口 minax：红框处调用 sub\_413B8 从 off\_DA050 密文表取项，随后进入完整解密链。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aeb47b532631d292.png)

图 6-3　abc.c() 的 Native 总入口 minax：红框处调用 sub_413B8 从 off_DA050 密文表取项，随后进入完整解密链。

图 6-3　abc.c() 的 Native 总入口 minax：红框处调用 sub_413B8 从 off_DA050 密文表取项，随后进入完整解密链。

...java

// com.secret.prettyhezi.Server.v.<clinit>() / com.secret.prettyhezi.Server.v.b()

// 这里把 abc.c(1) 作为本地缓存域名 keyLastServer4 的默认值

public static String f7323a = g4.f.a().i("keyLastServer4", abc.c(1));

// 这里把 abc.c(2) 作为 f7324b 的初始站点值

public static String f7324b = abc.c(2);

public static String b() {

## 常量解密算法

　　// 先重新取一次 abc.c(2)

　　String strC = abc.c(2);

　　// 在 Server.v.b() 这条逻辑里，如果当前仍等于 abc.c(2)，就切到 abc.c(3)

　　if (strC.equals(f7324b)) {

　　　　strC = abc.c(3);

　　}

　　// 更新当前保存的 f7324b

　　f7324b = strC;

　　return strC;

}

...c

// libali.so:minax

\__int64 \__fastcall minax(\__int64 a1, \__int64 a2, int a3)

{

　　// 先做一层环境检测/反调试相关判断

　　if ( (unsigned \__int8)sub_45204(a1, qword_E21D8, qword_E21E0) )

　　　　\*((\_BYTE \*)&word_3E + rand() % 98 + 1) = 103;

　　// 根据 a3 这个索引，从 off_DA050 中取出对应的密文字符串

　　sub_413B8((int)v12, (char \*)\*(&off_DA050 + a3));

　　// 对这段密文字符串执行完整的 Native 解密流程

　　sub_46CB4(&v14, v12);

...

　　// 最终把解密后的结果封装成 Java 字符串返回

　　return v10;

}

函数作用

· Server.v.<clinit>()：在 Java 层初始化主域名和备用域名。

· Server.v.b()：在 f7324b 这条逻辑上，先取 abc.c(2)；若当前值仍与之相同，则切换到 abc.c(3)。

· minax(int index)：根据索引从 off_DA050 中取出一段密文字符串，完成整套 Native 解密流程，再封装成 Java 字符串返回。

· sub_413B8()：把 off_DA050\[index\] 的 C 字符串包装成内部 std::string 风格结构。

· sub_46CB4()：负责后续真正的解密与明文化处理。

结合 IDA 实际恢复出的结果如下：

· abc.c(1) → http://172.80.57.10/

· abc.c(2) → https://qqtaobao.t123y.com/

· abc.c(3) → https://163.taosina163.com/

abc.c() 的 native 解密算法流程

整体解密链

调用链

abc.c(index) → minax → sub_46CB4 → sub_469C0 → 非标准 hex 解码

→ sub_49824 → sub_49D9C → sub_49494 → sub_48F68 → 返回明文 URL

真正把 minax 往下拆开以后，这条链最容易误判的地方就是把它想成「密文做个 hex 解码，再套一层 Blowfish 就结束」。实际不是这样。abc.c() 这一套 Native 逻辑更接近三段式：先做自定义预处理，再做 Blowfish 分组解密，最后还有一段自定义后处理。只有整条链走完，最后才会落到可直接在 Java 层使用的明文 URL。

完整执行流程总览

执行流程

abc.c(index) → JNI c(int) 进入 minax(a1, a2, index)

→ sub_413B8 从 off_DA050\[index\] 取密文并包装成输入对象 v12

→ sub_46CB4(&v14, v12) → 拆出真实密文缓冲区指针 v10

→ sub_469C0(v10, v9, len, cap) 非标准 hex 预处理

→ sub_49824(ctx, off_E1098, 7) 初始化 Blowfish 上下文

→ sub_49D9C(ctx, v10, v10, len/2) 按 8 字节分组循环解密

→ sub_49494(ctx, left, right) 执行单块 Blowfish 解密

→ sub_48F68(v10, v29, a2, a4) 做最终字节置换与异或

→ sub_413B8(a2, v9) 重新包装成输出字符串对象 → minax 封装为 Java String → 返回明文 URL

从写帖子角度说，这一段最大的价值不是把每个函数名都背下来，而是把「为什么一开始直接写脚本往往解不出来」这件事说明白。原因就在这里：abc.c() 的返回值不是在某一个单点函数里「顺手就解出来」的，而是必须完整经过「取密文对象 → 拆真实缓冲区 → 预处理 → Blowfish 解密 → 后处理 → 重新封装字符串对象」这一整条链。少看任一步，拿到的都只是中间态。

![图 6-4　off\_DA050 密文字符串表：条目为非标准 hex 编码（IDA DCQ 数组）。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f1bb605b47549f1d.png)

图 6-4　off_DA050 密文字符串表：条目为非标准 hex 编码（IDA DCQ 数组）。

图 6-4　off_DA050 密文字符串表：条目为非标准 hex 编码（IDA DCQ 数组）。

![图 6-5　解密链关键函数 sub\_46CB4：红框处 sub\_469C0 拆真实缓冲区、sub\_413B8 送入解密，后续还有 Blowfish 与自定义后处理。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5dfb4782627ed41f.png)

图 6-5　解密链关键函数 sub_46CB4：红框处 sub_469C0 拆真实缓冲区、sub_413B8 送入解密，后续还有 Blowfish 与自定义后处理。

图 6-5　解密链关键函数 sub_46CB4：红框处 sub_469C0 拆真实缓冲区、sub_413B8 送入解密，后续还有 Blowfish 与自定义后处理。

...c · minax / sub_46CB4

// libali.so:minax

\__int64 \__fastcall minax(\__int64 a1, \__int64 a2, int a3)

{

　　// a3 就是 Java 层传入的 index，用来决定取哪一条密文常量

　　sub_413B8((int)v12, (char \*)\*(&off_DA050 + a3));

　　// v12 是输入密文对象，v14 是输出结果对象

　　sub_46CB4(&v14, v12);

　　// 下面把 native 结果对象再转成 Java String 返回给上层

　　v8 = (\*(\__int64 (\__fastcall \*\*)(\__int64, \_QWORD))

　　　　(\*(\_QWORD \*)a1 + 1408LL))(a1, v7);

...

　　(\*(void (\__fastcall \*\*)(\__int64, \__int64, \_QWORD, \_QWORD, char \*))

　　　　(\*(\_QWORD \*)a1 + 1664LL))(a1, v8, 0, v7, v9);

　　return sub_41258(a1, qword_E2190, qword_E2198, v8, qword_E21A0);

}

// libali.so:sub_46CB4

void \__usercall sub_46CB4(unsigned \__int8 \*a1@<X0>, unsigned \__int64 \*a2@<X8>)

{

　　// 这里的 a1 不是普通 char\*，而是「输入密文字符串对象」

　　// 先从这个字符串对象里取出真实字符缓冲区地址，再交给 sub_469C0

　　sub_469C0(v10, v9, (unsigned int)v5, v7);

　　// 这里的 a2 不是输入参数，而是输出字符串对象的接收地址

　　// 算法总控函数返回后，把结果重新包装成字符串对象写回 a2

　　sub_413B8(a2, v9);

　　operator delete\[\](v9);

}

...c · sub_469C0

// libali.so:sub_469C0

void \__fastcall sub_469C0(unsigned \__int8 \*a1, \__int64 a2, int a3, unsigned int a4)

{

...

　　// 这里不是标准 hex 解码，而是它自定义的「两字符拼一字节」逻辑

　　\*v21++ = v25 | (16 \* (v26 + v23));

...

　　// 用 off_E1098 指向的 7 字节 key 初始化 Blowfish 上下文

　　sub_49824(v27, off_E1098, 7);

　　// 按 8 字节分组对数据做 Blowfish 解密

　　sub_49D9C(v27, v10, v10, (unsigned int)(v28 >> 1));

　　// 对 Blowfish 输出继续做字节置换和异或，得到最终明文

　　sub_48F68(v10, v29, a2, a4);

}

函数作用

· abc.c(index)：Java 层入口，只负责把索引传进 JNI。

· minax()：Native 总入口，负责取密文、调解密总控、再把结果转回 Java 字符串。

· sub_413B8()：把原始 C 字符串或结果缓冲区包装成内部字符串对象。

· sub_46CB4()：连接「字符串对象层」和「真实算法层」的中间包装函数。

· sub_469C0()：真正执行算法总控（预处理 → 分组解密 → 后处理）。

· sub_49824() + sub_49D9C() + sub_49494()：构成 Blowfish 解密主体。

· sub_48F68()：把 Blowfish 中间结果整理成最终可读明文。

参数流向与反编译阅读陷阱

这一段就是前面反复校对过很多次的地方。sub_46CB4(&v14, v12) 乍一看，确实很像「把 &v14 传进去处理，再把结果写到 v12」；但只要结合 X0/X8 的寄存器传参与函数内部行为去看，真实语义正好反过来。这类地方特别适合单独提醒一下，因为很多人第一次看 ARM64 反编译都会在这里被变量顺序带偏。

参数流向补充说明

· minax 里先执行 sub_413B8((int)v12,...)，所以 v12 先被包装成「密文字符串对象」。

· 随后的 sub_46CB4(&v14, v12) 不应按「文字顺序」理解成 a1=&v14, a2=v12，因为其反编译原型是 a1@<X0>, a2@<X8>。

· 真实语义应理解为：v12 对应输入密文对象，&v14 对应输出结果对象，即「把 v12 里的密文解密后写入 v14」。

· sub_46CB4 内部再从输入对象中拆出真实字符地址到 v10，随后调用 sub_469C0(v10, v9,...)，因此真正进入算法总控函数的密文数据指针是 v10。

非标准 hex 预处理

调用链

sub_469C0() → 两字符转一字节 → 低 4 位取前字符 → 高 4 位取后字符 → 得到真实密文字节流

把参数流向看清以后，sub_469C0 的第一段预处理就容易理解了。这里不是直接调标准库做 hex → bytes，而是自己按「两字符拼一字节」的方式手搓转换逻辑；并且字符映射也不是现成函数，而是通过条件分支自己算出来。所以密文虽然表面长得像十六进制字符串，但直接拿普通 bytes.fromhex() 去解，结果一定会错。

...c

// libali.so:sub_469C0

// 先取当前的两个字符

v22 = a1\[v12\];

v23 = a1\[v12 + 1\];

...

// 前一个字符先转成 0~15，后面会放到低 4 位

if (v22 <= 0x40)

　　v24 = -48;

else

　　v24 = -55;

v25 = v24 + v22;

// 后一个字符也转成 0~15，后面会放到高 4 位

if (v23 <= 0x40)

　　v26 = 0;

else

　　v26 = 9;

// 真正拼字节时，高低 4 位顺序和标准 hex 正好反过来

\*v21++ = v25 | (16 \* (v26 + v23));

关键点

· 前一个字符参与低 4 位。

· 后一个字符参与高 4 位。

· 因此它的效果不是标准 68 → 0x68，而是 68 → 0x86。

· 这一点是手工复现算法时最容易出错的位置之一。

Blowfish key schedule 与分组解密

调用链

sub_469C0() → sub_49824(ctx, off_E1098, 7) → sub_49D9C(ctx, buf, buf, len) → sub_49494(ctx, left, right)

等预处理结束以后，整条链才真正进入 Blowfish 主体。这里可以很清楚地拆成三层：sub_49824(..., off_E1098, 7) 负责把 key 装进上下文并完成 key schedule，sub_49D9C 负责按 8 字节一组循环处理密文块，每一组再下沉到 sub_49494 做单块 Blowfish 解密。也正因为它是标准的分组循环，所以前面如果只把整段密文粗暴交给某个现成 Blowfish 库，往往还会继续踩到 key 和后处理两层坑。

...c

// libali.so:sub_469C0 / sub_49824

// 用运行时 key 初始化 Blowfish 上下文

sub_49824(v27, off_E1098, 7);

// 按 8 字节一组做分组解密

sub_49D9C(v27, v10, v10, (unsigned int)(v28 >> 1));

// libali.so:sub_49D9C

\__int64 \__fastcall sub_49D9C(\__int64 result, \_BYTE \*a2, \_BYTE \*a3, unsigned int a4)

{

...

　　// 每次都把当前 8 字节块拆成左右两个 32 bit 交给 sub_49494

　　result = sub_49494(v7, v10, v10 + 4);

...

}

函数作用与关键结论

· sub_49824()：使用长度为 7 的 key 初始化 Blowfish 上下文。

· sub_49D9C()：把输入按 8 字节分组逐块处理，不存在 CBC 那样的前后块链式依赖。

· sub_49494()：使用倒序 P-array 的轮函数，表现为 Blowfish 的解密方向。

· 算法核心：Blowfish｜分组大小：8 字节｜工作方式：等价于 ECB｜IV：不存在。

Blowfish 解密后的自定义后处理

调用链

sub_469C0() → sub_49D9C(...) → sub_49494(...) → sub_48F68(v10, v29, a2, a4) → 最终明文

sub_48F68 是整条链里另一个特别容易漏掉的点，因为它说明「Blowfish 解完」还不是最终答案。样本在 Blowfish 输出后，又额外追加了一层自定义后处理；只有把这一步也补上，前面那段中间数据才会真正变成 Java 层可直接使用的明文字符串。

...c

// libali.so:sub_469C0 / sub_48F68

// 先按 8 字节分组做 Blowfish 解密

sub_49D9C(v27, v10, v10, (unsigned int)(v28 >> 1));

// 再把 Blowfish 的输出继续送入 sub_48F68 做最终明文化处理

sub_48F68(v10, v29, a2, a4);

补充结论

· sub_49D9C() / sub_49494()：负责 Blowfish 本体的分组解密过程。

· sub_48F68()：不再属于 Blowfish 轮函数或 key schedule，而是对 Blowfish 输出再做一层 16 字节粒度的字节置换与固定异或。

· 这也解释了为什么「只把密文按 Blowfish-ECB 解密」仍然得不到最终 URL，因为后面还差 sub_48F68 这一步后处理。

· Blowfish 本体对应 sub_49824 + sub_49D9C + sub_49494；sub_48F68 更适合归类为 post-process / finalizer。

运行时 key 初始化

调用链

sub_40934() / sub_46440() → 解码字符串 "BC35D8F2602146DT9032AE"

→ 写入运行时缓冲区 → off_E1098 = buffer → sub_49824(..., off_E1098, 7)

把算法主体走通以后，最后还剩一个最值得收口的判断：off_E1098 到底是不是固定写死的 key。结合 sub_40934 / sub_46440 和最终能成功还原出来的 abc.c() 结果来看，更稳妥的结论是：off_E1098 本身只是「当前 key 指针」，不是永远固定等于 yx1c7db。在 sub_49824(..., off_E1098, 7) 真正执行之前，它大概率已经被运行时初始化逻辑改写过了。

目前静态证据更强支持 sub_40934 参与了这次 key 初始化，因为它会把 "BC35D8F2602146DT9032AE" 这段数据处理后写给 off_E1098；sub_46440 虽然看起来是同类路径，但当前只能确认它具备类似能力，不能直接写成「运行时也一定执行了」。

...c

// libali.so:sub_40934

size_t sub_40934()

{

...

　　// 初始化结束后，把 off_E1098 改指向新生成的 key 缓冲区

　　off_E1098 = (char \*)&unk_E2290;

　　return result;

}

// libali.so:sub_46440

size_t \__fastcall sub_46440(char \*a1)

{

...

　　// 另一条路径中同样会把 off_E1098 更新为运行时缓冲区地址

　　off_E1098 = a1;

　　return result;

}

函数作用与结论

· sub_40934()：会把字符串 BC35D8F2602146DT9032AE 按同样的非标准 hex 规则解码到缓冲区，再让 off_E1098 指向该缓冲区。

· sub_46440()：在另一条路径中也会做相同风格的 off_E1098 更新。

· 目前能严格确认的是：sub_49824(..., off_E1098, 7) 读取到的已经是运行时 key，而不是单纯的 yx1c7db。

· 更稳妥的静态判断是：sub_40934 存在类似.init_array 的数据引用，较强支持其参与了装库期或初始化期的 key 改写；sub_46440 是否也在这条实际路径上执行，当前没有足够调用链证据。

· 结合 IDA 实际恢复，运行时 key 的前 7 字节为 cb 53 8d 2f 06 12 64（十六进制写法：cb538d2f061264）。

Native 层分析方法与结论

方法路径

Java 常量使用点 → 锁定 abc.c(int) → JNI_OnLoad 确认 native 目标函数

→ 顺着 minax → sub_46CB4 → sub_469C0 拆链 → 识别 sub_49494 为 Blowfish 解密

→ 识别 sub_48F68/sub_48D58 为互逆后处理 → 通过闭环验证恢复明文

分析方法总结

· 先从 Java 层 Server.v 中 abc.c(1)/c(2)/c(3) 的使用位置入手，确认其返回值就是域名类字符串。

· 再通过 JNI_OnLoad → RegisterNatives 锁定 abc.c(int) 对应 native 实现 minax(0x443d4)。

· 沿 minax → sub_46CB4 → sub_469C0 追踪，确认其结构是「取密文表 → 解密 → 返回字符串」。

· 通过 sub_49824 中 18 项 P-array、4 组 S-box、循环异或 key 的特征，识别其中间算法为 Blowfish。

· 通过对比 sub_48F68 与 sub_48D58，确认二者分别对应后处理与其逆过程。

· 最后用「正向加密再逆向解密」的闭环测试，验证 sub_49494 的方向、key 取值和前后处理映射都正确。

· key 初始化时机判断分两层：从解密结果反推 off_E1098 在 abc.c() 前必然已被改写；静态上更支持 sub_40934 参与了该初始化，而不是直接断言两条路径都已执行。

最终结论

· abc.c() 的 Native 层本质上是一套「密文字符串表 + 自定义预处理 + Blowfish 解密 + 自定义后处理」的常量保护方案。

· 其目的主要是隐藏域名、备用域名和认证相关字符串，避免直接在 Java 层明文暴露。

· 该样本真正的关键点不是单独识别 Blowfish，而是识别出三点：密文不是标准 hex；key 不是表面看到的 yx1c7db；Blowfish 解完后还需要再走 sub_48F68 才能得到最终明文。

逆向抓手总结

· Java 层入口优先看 OuiCrGxF，因为它串起了检测、广告放行、登录态恢复和页面跳转。

· 网络层优先看 j.r/j.t，因为登录链和多数业务链都会在这里汇合。

· Native 层优先看 JNI_OnLoad，因为它能快速区分「请求/缓存编解码」与「常量字符串保护」两套能力。

· 常量恢复优先看 abc.c()，请求与缓存编解码则优先看 ea5/da5/ea2/da2。

📎 配套资源

![图 6-6　登录请求 ea5/da5 完整闭环日志：EA5 加密 #7 与 DA5 解密 #11 的输入/输出对照（原文末尾附图）。](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7338c8ef2eb083c8.png)

图 6-6　登录请求 ea5/da5 完整闭环日志：EA5 加密 #7 与 DA5 解密 #11 的输入/输出对照（原文末尾附图）。

图 6-6　登录请求 ea5/da5 完整闭环日志：EA5 加密 #7 与 DA5 解密 #11 的输入/输出对照（原文末尾附图）。

作者在原帖评论区提供了附件下载：

链接：https://pan.quark.cn/s/7f1b9913ab6b（包含 APK 原件与 hook 代码）

**·** **今 日 推 荐** **·**

|     |     |
| --- | --- |
| ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e4a3cfcd0d78c35.jpg) |     |
