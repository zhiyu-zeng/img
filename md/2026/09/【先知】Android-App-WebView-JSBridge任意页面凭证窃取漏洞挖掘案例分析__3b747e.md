---
title: 【先知】Android App WebView JSBridge任意页面凭证窃取漏洞挖掘案例分析
source: https://xz.aliyun.com/news/92826
source_host: xz.aliyun.com
clip_date: 2026-09-14T13:38:46+08:00
trace_id: 7dae8cb2-0446-496a-9b4d-06211e18ccb5
content_hash: d6d4dc6e6a8617d128d7638f4c58466724b8b0b483787fffdecc4e02e4a64126
status: synced
tags:
  - 先知
  - Android逆向
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: 任意外部网页只要被 App 加载，即可通过 JSBridge 调用 `getUserInfo` 读取本地 JWT Token 并回传攻击服务器，根因是 exported 路由入口、无校验的 `link=` 参数与无差别桥注入三者叠加。
ai_summary_style: key-points
images_status:
  total: 35
  succeeded: 35
  failed_urls: []
notion_page_id: 3db75244-d011-8179-931e-ca6b8e52c1a5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 任意外部网页只要被 App 加载，即可通过 JSBridge 调用 `getUserInfo` 读取本地 JWT Token 并回传攻击服务器，根因是 exported 路由入口、无校验的 `link=` 参数与无差别桥注入三者叠加。
> 
> - **入口组件：** `ProxyActivity` 为 exported 且注册自定义 scheme（`sjqxxx://hmas.app/...`），参数处理只按 `link=` 字符串截取，URLDecoder 后原样进入路由系统，无任何格式与域名校验。
> - **拦截器绕过：** 内部格式 `hmas://web/Default` 会被 DefaultRouteInterceptor 拒绝；改写成 `http://`/`https://` 明文 URL 后由 `nb.g` 分支处理，无白名单直接跳到 `/web/Default`，WebActivity 的 `url` 由 ARouter 注入、来源完全由调用方决定，C0 过滤函数只剔除内部参数、不做域名校验。
> - **桥注入时机：** `BridgeWebView.onPageFinished` 无条件把 assets 下的 `WebViewJavascriptBridge.js` 注入每个加载完成的页面；App 启动时 `HogeWebViewInitializer.create()` 把 40 多个敏感 handler（getUserInfo、getRequestHeader 等）一次性注册进全局 Map，分发时只匹配 `handlerName`，不关心当前页面域名。
> - **关键调试坑：** JS 侧若不显式 `init()`，`receiveMessageQueue` 恒为真、回调永不触发，表现为"桥存在但无回包"；通信本身靠隐藏 iframe 设 `src='yy://__QUEUE_MESSAGE__'` 触发 `shouldOverrideUrlLoading`，非 http/https 协议一律被拦截。
> - **利用结果：** `callHandler('getUserInfo')` 链路最终读取 `FlutterSharedPreferences.xml` 中的 `Member-User-Authorization`、`userTokenKey` 并回显；恶意链接可经短信、二维码或 App 聊天框（链接可渲染）投递给用户或客服。

## 声明

本次测试为已获得合法授权的安全评估，目标为内部委托测试的移动应用。文中所有敏感数据均来自个人测试账号，未涉及任何真实第三方。请读者仅在授权范围内复现文中技术。

## 一、前言

如今主流类App几乎无一例外采用原生+H5的混合开发架构，原生壳负责性能与推送，业务页面大量使用WebView技术来显示与承载。这种架构的天然安全性依赖基本上都是WebView中运行的JS只能与可信“白名单”页面通信。一旦开发不严谨满足一定的条件就会导致WebView JSBridge任意页面凭证窃取漏洞。

## 二、App安装与查壳

首先下载app，注册账号登录并访问。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/296524f8446116ae.png)

登录app后可查看该app私有数据目录，可以发现FlutterSharedPreferences.xml文件存储用户的凭证信息，还有手机号，账号个人数据信息等，这里数据太多，只放了JWTtoken的截图信息。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d979e132dfb17577.png)

既然存在token信息，这里其实可以去第一步想到的就是去分析下apk文件，看看有没有文件备份类漏洞，或者开启了debug调试类漏洞等等。

提取 APK命令如下：

adb shell pm path com.cdxxxxx.chxxxx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/31c47a66d8979c9d.png)

adb pull <pm path输出的apk路径>./base.apk

首先apk查壳，可以发现没有进行加固处理

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f0559390122ebe88.png)

## 三、AndroidManifest分析

使用jadx反编译apk，注意这里如果遇到关键反编译代码文件无法反编译成功因为jadx-GUI默认开启的是“严格模式”，遇到反编译失败可以菜单 File → Preferences->Decompilation（反编译）选项卡->勾选Show inconsistent code点击save即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a747e98b11447f85.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f941beaee022e917.png)

第一步查看AndroidManifest.xml文件，通过查壳发现

android:allowBackup="false"，说明该apk不允许导出，但是很多组件是设置的允许导出，但是组件不是这篇文章的重点，而且该组件导出的页面也不是修改密码，修改个人信息等敏感页面，所以相对危害性较低。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eaa31e5fff1f6db3.png)

再查询debuggable是否存在，如果不存在说明默认关闭调试功能，与allowBackup字段刚好相反，如果AndroidManifest.xml文件中没有声明allowBackup则说明允许导出备份文件。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e497d19f6d8fa3af.png)

不过在这其中发现明文传输配置启用

```xml
<application android:usesCleartextTraffic="true" ...>
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1f5b9fde3c7fa073.png)

同时导出组件里有一组scheme入口，其中最引人注意的是如下配置:

```xml
<activity android:name="com.xxxx.android.lib_architecture.splash.ProxyActivity" android:exported="true">
    <data android:scheme="sjqxxx" android:host="hmas.app"/>
</activity>
```

一个exported的代理Activity+自定义scheme，这通常就是外部网页/短信/二维码可触发的路由入口

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d50d6683afa7203a.png)

## 四、WebView与JSBridge静态分析

首先通过上述AndroidManifest文件分析，可以发现存在scheme的组件包是com.xxxx.android，在这包中我们发现WebActivity容器，这个com.xxxx.android.comp_webview.WebActivity是一个H5容器

```xml
@Route(path = "/web/Default")
......
public final class WebActivity extends BaseMvvmActivity {
......
    @Autowired public String url;   // ARouter 注入，来源完全由调用方决定
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8220563700ff9132.png)

其中存在C0函数，这段函数用于过滤URL中APP自定义的内部交互参数，避免这些内部参数被带到外部链接、或泄露到第三方服务器，保证外部链接加载的纯净性。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3515bea9ad71c808.png)

第901行，Operators.CONDITION_IF为自定义常量“?”，以?拆分传入的路径

```xml
List listV0 = t.v0(oriUrl, new char[]{Operators.CONDITION_IF}, false, 2, 2, null);
if (listV0.size() == 1) {
    return oriUrl;
}
```

然后遍历所有查询参数，过滤内部参数

```xml
ArrayList arrayList = new ArrayList();
for (String str : t.v0((CharSequence) listV0.get(1), new char[]{'&'}, false, 0, 6, null)) {
    // 每个参数按=分割，取出参数名（key）
    String str2 = (String) t.v0(str, new char[]{IOUtils.pad}, false, 2, 2, null).get(0);
    // 判断参数名是否是预定义的内部参数
    switch (str2.hashCode()) {
        case -2094054512:
            if (str2.equals("hgWebShareBrief")) { z10 = false; break; }
            else { z10 = true; break; }
        // 其他case逻辑一致...
    }
    // 非内部参数加入保留列表
    if (z10) {
        // 打印被过滤掉的内部参数（调试用）
        fc.a.f15118a.c("WebActivity", str);
        arrayList.add(str);
    }
}
```

最后拼接处理好的参数

```xml
// 把保留的参数用&拼接成新的查询字符串
String strX = z.X(arrayList, ContainerUtils.FIELD_DELIMITER, null, null, 0, null, null, 62, null);
if (!(strX.length() > 0)) { strX = null; }
// 把URL路径和新的查询参数拼接，返回最终结果
String str3 = strX != null ? ((String) listV0.get(0)) + Operators.CONDITION_IF + strX : null;
return str3 == null ? (String) listV0.get(0) : str3;
```

C0这段函数是没有任何域名校验的，直接return

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/62208ebdf75bcc50.png)

综上初步简单分析， `/web/Default` 路由可以加载任意外部 URL地址的。

再看它的WebActivity类中的shouldOverrideUrlLoading公共方法

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e3eff36a2ae8f68.png)

主要看532行代码、539行代码，检测用户提交的协议，如果是yy://桥协议，那么就交给父类处理。

如果不是HTTP_PROTOCOL、HTTP_PROTOCOL协议就一律全部拦截，反之则走到return Boolean.valueOf(z10);直接放行。其中HTTP_PROTOCOL、HTTP_PROTOCOL都是自定以的常量，分别为http://、https://

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6ee4579e31e5e11c.png)

```xml
if (s.G(str, "yy://", false, 2, null)) {
                return super.shouldOverrideUrlLoading(view, p12);
           ......
                if (!s.G(str, DeviceInfo.HTTP_PROTOCOL, false, 2, null) && !s.G(str, DeviceInfo.HTTPS_PROTOCOL, false, 2, null)) {
                    z10 = true;
                }
                return Boolean.valueOf(z10);
            }
```

WebView的实现类是 `com.android.xxxx.webview_java.jsbridge.BridgeWebView` ，该类中做了一定的安全检测，其中318行代码关闭了密码自动保存，防止WebView存储的网站密码被恶意读取，并且关闭了file域的跨域读

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/53c4e14f2bd3f66f.png)

真正的问题在注入时机，BridgeWebView.this.f6265b为WebViewJavascriptBridge.js文件，该文件存储在assest目录下

```java
public void onPageFinished(WebView webView, String str) throws Throwable {
            super.onPageFinished(webView, str);
            BridgeWebView bridgeWebView = BridgeWebView.this;
            if (bridgeWebView.f6265b != null) {
                i5.b.e(bridgeWebView.f6273j, webView, BridgeWebView.this.f6265b);
            }
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6a37c710944cb492.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dd2c59a5d87d0a6d.png)

其中377行代码i5.b.e()函数把WebViewJavascriptBridge.js文件全部进行加载

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eb6819a368426341.png)

## 五、JSBridge 通信协议拆解

assets里的 `WebViewJavascriptBridge.js` 是URL Scheme桥，分析一下具体运行逻辑

JS 想调原生能力时，构造一个message对象；如果还需要回包（responseCallback），就生成一个唯一 `callbackId` 并登记到 `responseCallbacks` 字典里——相当于"留个回执地址"message 推进sendMessageQueue队列，然后设置一个隐藏iframe的src= 'yy://QUEUE_MESSAGE'设置iframe的URL会触发 WebView 的 `shouldOverrideUrlLoading` (shouldOverrideUrlLoading方法前面有讲，当检测用户提交的协议，如果是yy://桥协议，那么就交给父类处理)回调，Native 端拦截到 `yy://` 开头的scheme，就知道"队列里有消息了"

```java
function _doSend(message, responseCallback) {
    if (responseCallback) {
        var callbackId = 'cb_' + (uniqueId++) + '_' + new Date().getTime();
        responseCallbacks[callbackId] = responseCallback;
        message.callbackId = callbackId;
    }
    sendMessageQueue.push(message);
    messagingIframe.src = 'yy://__QUEUE_MESSAGE__';         
}
```

Native截获yy://QUEUE_MESSAGE后，调用p()，通过 loadUrl("javascript:...\_fetchQueue()") 让JS把队列内容吐出来

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cc7436c8f95469dc.png)

q()截获yy://return/\_fetchQueue/... 后，从URL里取出key"\_fetchQueue"，先去Map里查有没有对应登记的回调，有继续取 JSON、调 `bVar.a()` 分发——查handler注册表、执行原生逻辑、回包给JS。

```java
public final void q(String str) {
    String strC = i5.b.c(str);              // 取 "_fetchQueue"
    g5.b bVar = this.f6266c.get(strC);      // 必须先有 p() 登记的回调才能继续
    String strB = i5.b.b(str);              // 取队列 JSON
    if (bVar != null) {
        bVar.a(strB);                       // 进入 dispatch：查 handler 注册表、执行、回包
        this.f6266c.remove(strC);
    }
}
```

整段代码分析重点为App启动时HogeWebViewInitializer.create()函数把40多个敏感handler（getUserInfo、getRequestHeader、......）一次性塞进全局 Map（h5.c.b().a()函数里面）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc8b978fbe8da5e8.png)

而WebView收到消息后分发时按message里的 `handlerName` 去全局Map查 → 查到就执行 → 完全不关心当前WebView里加载的是哪个网页、哪个域名。如下图，183-184行：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a98be9f3ba8b1e5b.png)

顺着前面HogeWebViewInitializer.create()函数中的敏感handler

顺着 `getUserInfo` 找到公共方法类 `wb.a0` ，调用t0函数获取FlutterSharedPreferences.xml文件信息，然后取出文件中取出Member-User-Authorization、userTokenKey认证信息

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0ec954a3d9951fc2.png)

上图中2848行调用的gd.a.f15853a正式如下图的，其中FlutterSharedPreferences正是开头的FlutterSharedPreferences.xml文件

```java
return BaseApplication.INSTANCE.a().getSharedPreferences("FlutterSharedPreferences", 0);
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6d8e477d0a913644.png)

通过上述分析，静态链闭环：任意页面 → callHandler('getUserInfo') → 全局注册表 → s0() → Token进响应回调。

## 六、Deeplink 路由链分析

`com.hoge.android.lib_architecture.splash.ProxyActivity` 是exported的scheme入口，其参数处理逻辑

攻击者构造链接sjqxx://hmas.app/xxx?link=，截取link=后面传入的URL， `URL` 参数没有任何格式校验，URLDecoder后原样进入路由系统。

```java
public final void s0(Intent intent) throws UnsupportedEncodingException {
        if (intent == null) {
            return;
        }
        String dataString = intent.getDataString();
        fc.a.f15118a.f(this.TAG, l.m("jerry scheme data : ", dataString));
        if (dataString != null) {
            List listW0 = t.w0(dataString, new String[]{"link="}, false, 0, 6, null);
            if (listW0.size() > 1) {
                this.schemeUrl = (String) listW0.get(1);
            }
        }
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d8c8c14ae4030c4.png)

路由会经过拦截器链，这里踩了本次分析的第一个坑。最初我构造的link值是内部路由格式 `hmas://web/Default?url=...`，deeplink 发出后ProxyActivity确实拉起了但WebActivity始终没动静。追进拦截器才发现原因—— `nb.a` （DefaultRouteInterceptor）开头就是hmas://外部直达被拒

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49e6530d4e5d1f55.png)

当不是hmas://时，使用http/https 时是另一个拦截器 `nb.g` 进行处理，以http://或 https://开头的URL直接走分支流程进行跳转，没有任何白名单黑名单限制，d()只处理带专用链接，普通URL直接false，也就是说，把link的值直接写成http/https明文URL，就能一路穿过 ProxyActivity → 拦截器 → `/web/Default` → WebActivity。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cdf990436f48ee67.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/125cb71f4be63250.png)

最终 deeplink 形态sjqx x://hmas.app/message?link=http%3A%2F%2F<攻击服务器>%2Fpoc.html

## 七、一些代码踩坑绕过

## 7.1、桥明明在，回调却永远不来

WebActivity成功加载了攻击页，页面日志打出 `bridge already there` ——桥对象存在， `callAll()` 已执行，无任何JS异常。但收集服务器上只有页面请求，没有任何 `/collect` 回传

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/98fb9d9fab7f6758.png)

## 7.2、不调用init()，回包被永久吞掉

重读桥JS，发现 `_handleMessageFromNative` 的receiveMessageQueue初始为 \[\]，恒为真，只有\_dispatchMessageFromNative这里才会触发回调

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c36b79d0493e122.png)

## 八、漏洞复现

根据上述，分析撰写一个html恶意获取token脚本，运行在云服务器上。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fd101c9d92f5d0d8.png)

这里如果是为了本地确认漏洞可以直接使用adb调用链接，如果真实攻击可以直接发链接以app发给用户或者是生成链接，用户使用app二维码扫码。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/04164f8ce5de9745.png)

而且聊天框还存在html渲染，xss倒是有一定过滤，但是链接是能够渲染的，可直接发送恶意链接获取客服的token信息。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/419469376266e69b.png)

如下图，这里使用个人测试账号进行测试，直接加载服务器上运行的脚本，回显token信息

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/97857657dc463828.png)

log日志文件也成功接收到用户的token信息

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fdf35f1d9942a480.png)

## 九、总结

回看整条链，静态分析阶段，"明文Token→全局handler注册表→无差别桥注入，但是真正的入口为exported的 ProxyActivity加一个不做校验的link=参数，让理论风险变成了真实场景漏洞。
