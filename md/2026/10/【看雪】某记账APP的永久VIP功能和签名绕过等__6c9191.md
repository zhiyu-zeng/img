---
title: 【看雪】某记账APP的永久VIP功能和签名绕过等
source: https://bbs.kanxue.com/thread-293133.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-02T23:14:07+08:00
trace_id: bdff6007-b67d-4552-845d-4adcedac83ad
content_hash: 9313dcc6c93fc5c35790a806e49b9e8734a01454ed12eac651b158ca0cbfd2f9
status: synced
tags:
  - 看雪
  - Android逆向
  - 风控对抗
series: null
feed_source: 看雪·Android安全
ai_summary: 通过定位强制更新与VIP校验逻辑，用Frida验证后改smali重打包，并伪造签名指纹绕过服务器校验，实现永久VIP。
ai_summary_style: key-points
images_status:
  total: 20
  succeeded: 20
  failed_urls: []
notion_page_id: 3f475244-d011-81fb-93d3-c0f03264ad06
ioc:
  cves: []
  cwes: []
  hashes:
    - 25a26462f42fb0c1cf98a95828038d1ccd88c918b43098ec940280019cf25a3b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过定位强制更新与VIP校验逻辑，用Frida验证后改smali重打包，并伪造签名指纹绕过服务器校验，实现永久VIP。
> 
> - **定位思路：** 先排除第三方SDK、bean、adapter等，只看自身包名调用；搜 `systemUpgrade|forceUpdate|checkVersion` 定位到 `AppInfos.getForceUpdate`，返回 false 即可去掉强制更新弹窗。
> - **VIP三处绕过：** 聊天记账 hook `AiVipCount.getReceiveTrialTimes`→999999、`getUsedTrialTimes`→0；自动记账 hook `BaseActivity.N` 返回 "3"。注意 Java 返回类型为 Integer/Boolean 等包装类时必须用 `Java.use().valueOf()` 装箱，否则 Frida 桥接失败。
> - **改 smali 打包：** 上述四处方法体改后，用 `apktool d/b` 反编译打包、`apksigner` 签名；smali 里真实方法名是 `N`，不是 jadx 显示的 `m34835N`。
> - **签名校验：** 重打包安装提示"非法请求"，按系统 API 指纹（`getPackageInfo`、`GET_SIGNING_CERTIFICATES`、`MessageDigest`）定位到 `anp.kad.sdk.zg.s`，其返回值由 `HeaderInterceptor` 以 `app_sign` 写入请求头；将该方法固定返回原签名指纹（格式与 `phone_info.xml` 中一致）即可绕过。
> - **通用技巧：** 混淆改不了系统 API 名，可作定位指纹；按钮事件按"控件ID→R类资源名→Binding类引用→setOnClickListener→回调类"逐层定位。

直接应用商场下载，MT看了下没加固

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8eca67176629ed89.webp)

打开提示要更新，而且没有关闭键，是强制更新，这不得看看啥逻辑

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a9981d9b74a7b88d.webp)

因为弹窗在app启动就检测了，通过了才加载主页，那基本上就是启动开始阶段就去调用了，现在看到的页面已经是检测完的弹窗。那这时候的思路可以是

1、定位当前弹窗，定位弹窗调用的判断逻辑（关键词、算法助手定位堆栈、资源id定位等，当然也有可能关键词是接口返回的）

2、直接搜更新相关的关键词，尝试缕清逻辑

我这里用第二个方法，先尝试找到更新相关的方法

简单搜下更新相关的关键词 (systemUpgrade|forceUpdate|checkVersion)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eb4a84c33be5bcd0.webp)

这里说个思路，大致定位缩小范围再逐步定位

```python
package
├── .bean.*              → 数据模型（Bean类，字段定义）
├── .network.* / .api.*  → 接口定义（Retrofit/OkHttp的Service）
├── .p768ui.
│   ├── .activity.*      → 页面入口（功能触发点）
│   ├── .fragment.*      → 页面片段（功能触发点）
│   ├── .model.*         → Model层（接口封装+回调转发）
│   ├── .adapter.*       → 列表适配器（UI渲染，非核心逻辑）
│   ├── .receiver.*      → ContentProvider/BroadcastReceiver（跨进程/广播）
│   └── .view.*          → 自定义View（UI控件，非核心逻辑）
├── .base.*              → 基类（缓存/公共逻辑）
├── .databinding.*       → ViewBinding生成类（布局绑定，含控件ID映射）
└── .R                   → 资源ID定义（只用来反查，不是逻辑）

anp.kad.sdk
├── C[数字][字母]        → 混淆回调类（Lambda/Function1编译产物）
├── AbstractC09xxBg     → 工具类（Toast/比较/类型转换/日志）
├── AbstractC0xxx       → 抽象基类（公共逻辑）
└── C2972xC             → Unit占位类（Kotlin Unit的Java包装）

第三方SDK（直接跳过）
├── com.bytedance.*      → 字节广告SDK
├── com.baidu.mobads.*   → 百度广告SDK
├── com.kwad.*           → 快手广告SDK
├── com.huawei.hms.*     → 华为推送/更新SDK
├── com.alibaba.*        → 阿里推送SDK
├── com.alipay.sdk.*     → 支付宝SDK
├── com.tencent.mmkv.*   → MMKV存储库
├── androidx.*           → AndroidX系统库
├── android.*            → Android系统类
└── cn.hutool.*          → Hutool工具库
```

所以基于这个思路，基本上，第三方SDK，bean，model等优先级先调低，先看自身包名调用的，那能不能找到蛛丝马迹。

最终定位到 **forceUpdate** 方法，这里实在不行用update去搜，再用上面的方法去缩小范围定位也是可以的

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b6a4e7e2210beb67.webp)

forceUpdate获取布尔值后用做判断，zisShowing的值为false并且forceUpdate的值为true时，走else逻辑，实例化Alert弹窗，猜测这就是提示更新的逻辑，直接hook getforceUpdate返回false

```javascript
Java.perform(function(){
    var AppInfos = Java.use("com.xxx.bean.AppInfos");
    AppInfos["getForceUpdate"].implementation = function () {
        console.log(`AppInfos.getForceUpdate is called`);
        let result = false;
        console.log(`AppInfos.getForceUpdate result=${result}`);
        return result;
    };
})
```

没有符合的就大范围地搜，根据文件路径自行过滤 (Upgrade|Update)，然后大略看一下， 比如看到forceUpdate这样就可以重点关注

## 绕过VIP

登录后大致有这些功能，各个地方都在提示开通VIP，就按这些功能来吧，看哪些功能触发的时候提示要开通VIP。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b2e446a311a06bf2.webp)

## 聊天记账

先点击聊天记账，看到有每日试用次数，并提示开通会员

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fec08b5d738b54f0.webp)

直接搜 **今日试用** 关键词，几个都一样点进去看

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f2ce6e6aa645cb39.webp)

这里讲一下，整体的逻辑先不看，先关注重点参数，不然一股脑地就分析各个调用逻辑容易被绕进去。这里着重关注还剩多少次这个多少，就 f32935i0 参数，往上追这个参数是 aiVipCount.getReceiveTrialTimes() - aiVipCount.getUsedTrialTimes()，这两个都是get方法，那思路就有了。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c9d72ab971bcb8cf.webp)

hook getReceiveTrialTimes和getUsedTrialTimes，一个直接为超大数字，一个为0。

```javascript
Java.perform(function(){
    var AiVipCount = Java.use("com.jxm.bill.anxin.bean.AiVipCount");
    AiVipCount.getReceiveTrialTimes.implementation = function() {
        // 返回一个很大的试用次数，永远 > usedTrialTimes
        return Java.use("java.lang.Integer").valueOf(999999);
    };
    AiVipCount.getUsedTrialTimes.implementation = function() {
        return Java.use("java.lang.Integer").valueOf(0);
    };
})
```

这里有个小坑，一开始为直接返回 9999 不行，因为这两个参数定义为 Integer （包装类型/对象） ，不是 int （基本类型）。Frida 在桥接 JavaScript → Java 时，需要保证返回值 类型兼容 。方法声明的返回类型是 java.lang.Integer （对象），而 JavaScript 的 9999 是一个 JS 原始 number。Frida 的 Java 桥接层 不会自动把 JS number 装箱为 Java Integer 对象。

小计：

```python
Java返回类型是 int/boolean/long  → 直接 return JS 值
Java返回类型是 Integer/Boolean/Long → 必须用 Java.use().valueOf() 或 .$new()
Java返回类型是 String           → 直接 return JS 字符串（String本就是对象）
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8be024a4abd378d6.webp)

然后就可以了

## 自动记账

自动记账默认是关的，点击开启会直接弹出开通VIP的按钮。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6c98e65baf71511c.webp)

这是算法助手抓 onclick 的，但实际看不到细节的方法调用

```python
androidx.constraintlayout.widget.ConstraintLayout
控件Id:7f0905b3
控件标题:自动记账

回调类:anp.kad.sdk.n2

返回结果类型:void
返回结果值：void

调用堆栈：
        at D.ADLdiqn.iTQ.djJXV.gw.XposedBridge$LegacyApiSupport.handleAfter(Unknown Source:33)
        at J.callback(Unknown Source:292)
        at LSPHooker_.performClick(Unknown Source:8)
        at android.view.View.performClickInternal(View.java:6576)
        at android.view.View.access$3100(View.java:780)
        at android.view.View$PerformClick.run(View.java:25899)
        at android.os.Handler.handleCallback(Handler.java:873)
        at android.os.Handler.dispatchMessage(Handler.java:99)
        at android.os.Looper.loop(Looper.java:193)
        at android.app.ActivityThread.main(ActivityThread.java:6840)
        at java.lang.reflect.Method.invoke(Native Method)
        at com.android.internal.os.RuntimeInit$MethodAndArgsCaller.run(RuntimeInit.java
```

从这里可能看到回调类 = anp.kad.sdk.n2。搜索 7f0905b3 得到控件名 layout_switch 。触发的功能是"自动记账"，最可能是 ActivityAutomateBinding。看一下谁在使用这个Binding

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b45bcf540fd94ded.webp)

这个 this.f31135l = constraintLayout10; 这里默认点ctrl+鼠标左键 / 选中按x，都查不到，要有有意识地去查找这个值

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a2ecc26e8f293751.webp)

然后就得找实际触发的方法了。

理论上通过封装好的什么方法都是用 setOnClickListener ，可以直接全局搜 f311351.setOnClickListener / setOnClickListener 再一个个去定位

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6e62e62b1fcd5085.webp)

这里找到对应的方法，但实际触发的是case 1检查悬浮窗，这很明显不是我们要找的。之前绑定事件是嵌套式的子父结构，算法助手hook的是默认父节点，constraintLayout10 继续往下是 constraintLayout11，对应的 f31136m，就是上面截图中 i2 = 1上面那个，对应的ViewOnClickListenerC2532n2方法，第一个参数是 8，看下case 8分支。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7cb3bc23d3544244.webp)

这里就开始判断分支了 m80f 方法进去判断等于，其实就是判断用户类型是否为 3，猜测就是判断用户是否为 VIP，第一个分支是不等于，第二个分支有 automateActivity 去调用方法，猜测第二个分支是判断用户为 VIP的情况。实在不行直接hook 返回true/false判断即可

```javascript
Java.perform(function(){
    console.log("[*] 自动记账 VIP 绕过（仅 case 8）启动...");
        try {
            var BaseActivity = Java.use("com.jxm.bill.anxin.base.BaseActivity");
            // 这里直接用jadx的frida会报错cannot set property 'implementation' of undefined
            // 应该混淆后运行时真实方法名是 N，不是 JADX 显示的 m34835N，jadx里有
            BaseActivity.N.implementation = function() {
                return "3";
            };
            console.log("[+] BaseActivity.N → 返回 '3'（VIP）");
        } catch (e) {
            console.log("[!] Hook 失败：" + e);
        }

        console.log("[*] 脚本加载完成");
        console.log("[!] 请在系统设置中手动开启：无障碍服务 + 悬浮窗权限");
}
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f234d3e61d8da5b.webp)

## 修改smali代码

现在是hook可以，也知道要修改哪几个值，那就来修改静态 smali 代码，打包apk

这一块MT管理器确实不错，但这次我用电脑操作，反编译和打包 apk 用 apktool，签名用 apksigner。

## 反编译、打包、签名

```python
# 1. 反编译
java -jar apktool.jar d -f xxx.apk -o xxx_decompiled

# 2. 打包
java -jar apktool.jar b xxx_decompiled -o xxx_unsigned.apk

# 3. 签名
java -jar apksigner.jar --apks xxx_unsigned.apk
```

## 修改 1：AppInfos.getForceUpdate() → 返回 false

文件路径： smali/com/jxm/bill/anxin/bean/AppInfos.smali

搜索 getForceUpdate ，找到：

```python
.method public final getForceUpdate()Ljava/lang/Boolean;
    .locals 1

    iget-object v0, p0, Lcom/jxm/bill/anxin/bean/AppInfos;->forceUpdate:Ljava/lang/Boolean;
    return-object v0
.end method
```

替换为：

```python
.method public final getForceUpdate()Ljava/lang/Boolean;
    .locals 1

    sget-object v0, Ljava/lang/Boolean;->FALSE:Ljava/lang/Boolean;
    return-object v0
.end method
```

## 修改 2：AiVipCount.getReceiveTrialTimes() → 返回 999999

文件路径： smali/com/jxm/bill/anxin/bean/AiVipCount.smali

搜索 getReceiveTrialTimes ，找到：

```python
.method public final getReceiveTrialTimes()Ljava/lang/Integer;
    .locals 1

    iget-object v0, p0, Lcom/jxm/bill/anxin/bean/AiVipCount;->receiveTrialTimes:Ljava/lang/Integer;
    return-object v0
.end method
```

替换为：

```python
.method public final getReceiveTrialTimes()Ljava/lang/Integer;
    .locals 1

    const v0, 0xf423f
    invoke-static {v0}, Ljava/lang/Integer;->valueOf(I)Ljava/lang/Integer;
    move-result-object v0
    return-object v0
.end method
```

## 修改 3：AiVipCount.getUsedTrialTimes() → 返回 0

搜索 getUsedTrialTimes ，找到：

```python
.method public final getUsedTrialTimes()Ljava/lang/Integer;
    .locals 1

    iget-object v0, p0, Lcom/jxm/bill/anxin/bean/AiVipCount;->usedTrialTimes:Ljava/lang/Integer;
    return-object v0
.end method
```

替换为：

```python
.method public final getUsedTrialTimes()Ljava/lang/Integer;
    .locals 1

    const/4 v0, 0x0
    invoke-static {v0}, Ljava/lang/Integer;->valueOf(I)Ljava/lang/Integer;
    move-result-object v0
    return-object v0
.end method
```

## 修改 4：BaseActivity.N() → 返回 "3"

文件路径： smali/com/jxm/bill/anxin/base/BaseActivity.smali

注意 ：smali 里方法名是 N ，不是 m34835N 。

搜索.method public final N()Ljava/lang/String; ，找到类似：

```python
.method public final N()Ljava/lang/String;
    .locals 2

    iget-object v0, p0, Lcom/jxm/bill/anxin/base/BaseActivity;->G:Ljava/lang/String;
    if-eqz v0, :cond_0
    return-object v0

    :cond_0
    const-string v0, "userType"
    invoke-static {v0}, Lanp/kad/sdk/AbstractC0942Bg;->N0(Ljava/lang/String;)V
    const/4 v0, 0x0
    throw v0
.end method
```

替换为：

```python
.method public final N()Ljava/lang/String;
    .locals 1

    const-string v0, "3"
    return-object v0
.end method
```

## 过签名校验

这里忘记截图了，签名打包后，直接安装启动提示 **"非法请求"**。基本上就是 APK 有做 **签名校验** 了，毕竟hook没问题重新打包就出问题了，代码中也搜不到提示的关键词，猜测是服务器端的签名校验，这里可以用MT的去签名校验试试，但默认只能过客户端校验的，思路也是修改 smali 代码绕过校验。

但如果是服务器端校验，就要找校验逻辑，看看哪里取的证书。

**混淆只能改类名方法名， 改不了 Android 系统 API 的名字 。系统 API 调用是代码的"指纹"。**

```python
// 旧版 API（API < 28）
PackageManager.getPackageInfo(pkg, PackageManager.GET_SIGNATURES)
//                                  flag = 0x40 = 64
packageInfo.signatures                  // Signature[]

// 新版 API（API 28+）
PackageManager.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
//                                  flag = 0x2000000 = 134217728
packageInfo.signingInfo
SigningInfo.getApkContentsSigners()     // Signature[]
SigningInfo.hasPastSigningCertificates()

// 指纹计算
MessageDigest.getInstance("SHA-256" / "SHA-1" / "MD5")
Signature.toByteArray() / toCharsString()
```

所以这里直接搜 **getPackageInfo**

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4402d3db31094b28.webp)

这里有个小技巧

```python
✓ 要重点看的：
  C[数字][字母]          → 混淆回调/工具类，可能含核心逻辑
  AbstractC0[数字]       → 混淆抽象工具类
  [A-Z]开头无意义短名     → 混淆业务类

✗ 可以跳过的：
  XxxActivity / XxxFragment  → 页面入口（除非要找触发点）
  XxxAdapter                 → 列表适配器（UI，非核心）
  XxxBinding                 → ViewBinding（无业务逻辑）
  XxxProvider / XxxReceiver  → 跨进程/广播（特定场景才看）
  *Helper / *Util / *Manager → 工具类（可能有用但优先级低）
```

定位到了 anp.kad.sdk 的 AbstractC1830zg 方法

ProGuard/R8 有一条规则叫 `-repackageclasses` （或 `-flattenpackagehierarchy` ），作用是把所有类的包名统一改成一个短包名。anp.kad.sdk 这种就是 ProGuard 混淆的产物，而混淆的往往是 **业务代码**。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3626a5db0b8c44a.webp)

这个方法里有 getPackageInfo、SigningInfo.getApkContentsSigners() 、MessageDigest.getInstance，基本上确定是取签名指纹的方法

后续就开始找这个方法的实际调用，静态分析的话直接在 jadx 按 x，这里我使用 hook，因为这是大概是在 app 发起请求时触发的，不一定是通过常规的方法调用。静态方法不能直接查到反射调用、接口多态、动态代理的调用。

```javascript
Java.perform(function(){
    var AbstractC3068zg = Java.use("anp.kad.sdk.zg");
    // 1. 加上 overload（防御多重载）
    AbstractC3068zg.s.overload('android.content.ContextWrapper').implementation = function(contextWrapper) {
        console.log("s is called");
        // 2. 用 .call(this, ...) 调原方法，避免递归
        let result = this.s.overload('android.content.ContextWrapper').call(this, contextWrapper);
        // 3. Java 对象转字符串再打印
        var set = Java.cast(result, Java.use("java.util.Set"));
        console.log("s result: " + set.toString());
        // 4. 打调用栈（自己抛异常取栈）
        console.log(Java.use("android.util.Log").getStackTraceString(
            Java.use("java.lang.Exception").$new()
        ));
        return result;
    };
}
```

返回的值是这样的

```python
java.lang.Exception
        at anp.kad.sdk.zg.s(Native Method)
        at com.xxx.xxx.xxx.App.onCreate(SourceFile:24)
        ...
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/915dc0b5f3aa3fb9.webp)

看下 onCreate 方法，调用方法获取签名方法后，签名值放进本地 SharedPreferences 文件中，这个直接在手机 apk 路径就可以找到。对应的 key 为 app_sign，看下哪里代码里哪里获取了这个 key，最终在 HeaderInterceptor 找到了获取 app_sign，基本就可以推断是拦截器在每个请求之前加了 app_sign。

这里思路很多，直接去 hook 这个生成签名的 s 方法，读取本地的 SharedPreferences 文件，用 apktool 查看证书，甚至是抓个包看看。

这里我选择直接读取本地的 SharedPreferences 文件

```python
adb shell su -c "cat /data/data/com.xxx.xxxx.xxxxx/shared_prefs/phone_info.xml" | findstr app_sign
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0771da2bc8387f93.webp)

```python
keytool -printcert -jarfile xxxv2.1.16.apk
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9062fb091ba73c78.webp)

可以看到格式有差异但内容相同，以 phone_info.xml 文件里格式为准， **毕竟这是代码实际去读取的**。

修改思路是，修改 smali 代码，让获取签名的方法固定返回这个签名值，打包后安装，再去读取这个文件看是不是跟原apk一模一样，内容格式都要完全一样，过程中就遇到不少坑，两边多了\[\]或是中间多了:之类的。实际去读取就知道了。

开始修改 smali 代码获取签名的方法，就是上面那个我们通过 **getPackageInfo** 定位到的 s 方法，jadx切换smali可以看实际方法名，通过文件路径在反编译的源码中定位方法进行修改

把整个方法体替换成：

```python
.method public static final s(Landroid/content/ContextWrapper;)Ljava/util/Set;
    .locals 3

    new-instance v0, Ljava/util/HashSet;

    invoke-direct {v0}, Ljava/util/HashSet;-><init>()V

    # 换成原始签名指纹（保留冒号，注意 smali 字符串里冒号无需转义）
    const-string v1, "25A26462F42FB0C1CF98A95828038D1CCD88C918B43098EC940280019CF25A3B"

    invoke-interface {v0, v1}, Ljava/util/Set;->add(Ljava/lang/Object;)Z

    return-object v0
.end method
```

再去执行反编译、打包、签名即可。

## LSPosed 脚本

这里再补充下 LSPosed 脚本吧

```java
private static final String TARGET_PKG = "com.xxx.xxx.xxx";

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) throws Throwable {
        if (!TARGET_PKG.equals(lpparam.packageName)) {
            return;
        }

        ClassLoader cl = lpparam.classLoader;
        XposedBridge.log("[*] 安心记账 Hook 模块加载...");

        // ============================================================
        // ② 强制更新：AppInfos.getForceUpdate() 返回 false
        // Frida: AppInfos["getForceUpdate"].implementation = () => false
        // 无参方法 → findAndHookMethod 里不写任何参数类型
        // ============================================================
        XposedHelpers.findAndHookMethod(
                "com.jxm.bill.anxin.bean.AppInfos", cl,
                "getForceUpdate",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        XposedBridge.log("AppInfos.getForceUpdate is called → false");
                        // setResult 会直接替换返回值，原方法体不再执行
                        // 返回类型是 Boolean，传 false 会自动装箱成 Boolean.FALSE
                        param.setResult(false);
                    }
                });

        // ============================================================
        // ③ 聊天记账：AiVipCount 试用次数
        // Frida: getReceiveTrialTimes → 999999; getUsedTrialTimes → 0
        // ============================================================
        XposedHelpers.findAndHookMethod(
                "com.jxm.bill.anxin.bean.AiVipCount", cl,
                "getReceiveTrialTimes",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        param.setResult(999999);   // int 自动装箱为 Integer
                    }
                });

        XposedHelpers.findAndHookMethod(
                "com.jxm.bill.anxin.bean.AiVipCount", cl,
                "getUsedTrialTimes",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        param.setResult(0);
                    }
                });

        // ============================================================
        // ④ 自动记账：BaseActivity.N() 返回 "3"（运行时真名，不是 m34835N）
        // ============================================================
        XposedHelpers.findAndHookMethod(
                "com.jxm.bill.anxin.base.BaseActivity", cl,
                "N",
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        XposedBridge.log("[+] BaseActivity.N → '3'");
                        param.setResult("3");
                    }
                });

        // ============================================================
        // ⑤ 签名 zg.s(ContextWrapper) —— 你的 Frida 只打印日志
        // 有参方法：在回调前写上参数类型 ContextWrapper.class
        // beforeHookedMethod 不 setResult → 只观察，不改变行为
        // ============================================================
        XposedHelpers.findAndHookMethod(
                "anp.kad.sdk.zg", cl,
                "s",
                ContextWrapper.class,                 // ← 参数类型，用来匹配重载
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        // param.args[0] 取第1个参数
                        XposedBridge.log("zg.s called, ctx=" + param.args[0]);
                    }

                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        // after 里 param.getResult() 是原方法返回值
                        XposedBridge.log("zg.s result=" + String.valueOf(param.getResult()));
                    }
                });

        XposedBridge.log("[*] 全部 Hook 安装完成");
    }
```

## 补充

## 事件绑定

科普下ID 事件绑定方式

常规绑定：

```python
  Activity.java
  ├─ View btn = findViewById(R.id.layout_switch);  ← 直接在Activity里找控件
  └─ btn.setOnClickListener(new OnClickListener() {...});
```

ViewBinding方式：

```python
  编译器生成 → ActivityAutomateBinding.java（只有控件引用，无逻辑）
  Activity.java
  ├─ binding.f31129f  ← 通过Binding字段间接拿控件
  └─ binding.f31129f.setOnClickListener(...)
  
  搜索 layout_switch → 先搜到Binding类（只是控件声明）
  → 需要再搜Binding类名引用 → 才找到使用它的Activity
  → 多了一层间接
```

这里就搜索 ActivityAutomateBinding 的引用，返回了11个类： 其中有一个anp.kad.sdk.ViewOnClickListenerC2532n2，注意这个名字： ViewOnClickListenerC2532 + n2 = 这就是算法助手报告的回调类 anp.kad.sdk.n2。jadx对部分类方法会加字符，路径也会，比如算法助手里看到的是com.xxx.xxx.xxx.ui.方法，jadx里看的可能是com.xxx.xxx.xxx.p768ui.方法

总结，

```python
任何按钮点击定位（通用流程）：

第1步：算法助手/布局工具 → 获取控件ID（十六进制如0x7F0905B3）

第2步：R类中搜十六进制值 → 找到资源名（如 layout_switch）

第3步：搜索资源名 → 得到N个结果，分两种情况：

  情况A：结果中直接有Activity/Fragment（传统findViewById方式）
  └─ 直接打开Activity → 搜索资源名 → 找到findViewById → 往下看setOnClickListener

  情况B：结果中只有Binding类（ViewBinding方式，这个app用的）← 多一步
  ├─ 按类名/控件名判断选哪个Binding
  ├─ 搜索该Binding类名的引用 → 找到使用它的Activity/Fragment + 回调类
  └─ 打开Activity → 搜索字段名（如f31129f）→ 找到setOnClickListener

第4步：setOnClickListener的第二个参数 = 点击回调类

第5步：打开回调类 → 看onClick → 找到业务逻辑
```

其实这就类似于某种框架的事件绑定使用方法，换做以前就得各种去翻文档，找到某个用法或特性，现在AI的知识广度可以弥补很好地弥补这一点。

## 系统 API

**混淆只能改类名方法名， 改不了 Android 系统 API 的名字 。系统 API 调用是代码的"指纹"。**

| 功能  | API 指纹 |
| --- | --- |
| 取签名 | getPackageInfo + GET_SIGNING_CERTIFICATES / 0x40 / 0x2000000 + MessageDigest |
| 版本更新 | getPackageInfo + versionName / versionCode + PackageManager |
| 网络请求 | OkHttpClient/HttpURLConnection/Retrofit/Request$Builder |
| 加解密 | Cipher.getInstance/MessageDigest/Mac.getInstance/SecretKeySpec |
| 存储  | SharedPreferences / MMKV / SQLiteDatabase / FileOutputStream |
| 反射  | Class.forName / Method.invoke / getDeclaredMethod |
| 动态加载 | DexClassLoader/PathClassLoader/loadClass |
| 权限  | checkSelfPermission / requestPermissions / PackageManager |
