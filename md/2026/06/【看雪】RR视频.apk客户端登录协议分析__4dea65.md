---
title: 【看雪】RR视频.apk客户端登录协议分析
source: https://bbs.kanxue.com/thread-291767.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-23T22:04:03+08:00
trace_id: e06f2c8d-0a0b-438b-a436-7fb4d99259b5
content_hash: b5ac32b980e93068cdd53204946e97502ca5fe69b837284f221bc13cc502430b
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 对一款已停运的人人网移动客户端APK进行逆向分析，完整还原了其登录请求的加密与签名机制。登录协议包含双重独立签名，采用RSA与MD5混合加密策略。核心分析通过网络抓包定位、Jadx逆向和DDMS动态验证完成。
ai_summary_style: key-points
images_status:
  total: 33
  succeeded: 33
  failed_urls: []
notion_page_id: 38875244-d011-81ee-b68b-dadb8478b49f
ioc:
  cves: []
  cwes: []
  hashes:
    - ad974a0756d84cec80fcea72fcbfba9f
  domains:
    - api.m.renren.com
    - bbs.kanxue.com
    - blog.csdn.net
    - cdn.jsdelivr.net
    - login.renren.com
    - pan.baidu.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 对一款已停运的人人网移动客户端APK进行逆向分析，完整还原了其登录请求的加密与签名机制。登录协议包含双重独立签名，采用RSA与MD5混合加密策略。核心分析通过网络抓包定位、Jadx逆向和DDMS动态验证完成。
> 
> - **协议结构与签名：** 登录请求体包含两个独立`sig`签名。第一个在构造请求时生成，第二个在最终网络传输前附加，两者均基于相同的签名算法：将全部参数键值对按键名排序拼接后，追加同一密钥，再进行MD5计算。
> - **签名算法与密钥：** 签名函数`(a(strArr, secretKey))`的逻辑是将所有参数以`key=value`形式按字典序升序排列后直接拼接，再追加一个硬编码的密钥`ad974a0756d84cec80fcea72fcbfba9f`（从APK资源文件中解密得到），最后计算MD5哈希值。
> - **密码加密策略：** 登录流程首先尝试从服务器获取RSA公钥。若获取成功，则使用RSA算法加密用户密码；若失败（如本文中服务器已关闭），则降级使用MD5对密码进行加密。加密方式由静态变量`lAT`标记。
> - **登录逻辑触发与验证：** 通过DDMS方法剖析确认，点击登录按钮触发的逻辑位于`LoginFromQuickRegisterFragment.onClick`方法内。该逻辑先校验输入，再选择加密方式，最后通过`ServiceProvider.a`方法发送包含加密密码及双重签名的登录请求。
> - **动态验证手段：** 文章通过Frida和Xposed两种框架编写Hook脚本，成功拦截了`RSA.D`加密方法，用于动态验证和捕获密码明文、模数、指数及加密结果，为静态分析提供了可靠验证。

*本文仅限安全研究与学习交流，严禁将本文内容用于任何商业或非法用途，本文涉及的代码及资源版权归原权利人所有，侵删。*

APK版本——9.3.8，已经是上古时代的apk了，目前app已经停止运营。

所用工具：Fiddler、jadx-gui、DDMS、雷电模拟器9.1（64位）。

首先配置模拟器代理（本机IP和Fiddler的默认端口号8888）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1bb0c11df4a83b7d.webp)

在模拟器中启动App，选择“RR账号登录”，随机输入账号和密码。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b341677d35acfdaf.webp)

点击登录按钮。Fiddler 共捕获到四个关键请求，如下图所示：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/561c5a54c34bbd05.webp)

四个包依次为：

（1）公钥获取请求：客户端向 [http://login.renren.com/ajax/getEncryptKey](https://bbs.kanxue.com/elink@3d0K9s2c8@1M7q4\)9K6b7g2\)9J5c8W2\)9J5c8X3I4G2k6$3W2F1i4K6u0W2M7X3g2F1M7X3g2F1i4K6u0W2j5$3!0E0i4K6u0r3j5h3A6S2P5q4\)9J5c8X3N6W2N6p5g2F1j5%4u0&6M7s2c8w2k6i4V1%60.) 发起 GET 请求，尝试获取 RSA 公钥。由于服务器已停止运营，该接口返回 404 Not Found。

（2）登录请求：POST 至 [http://api.m.renren.com/api/client/login](https://bbs.kanxue.com/elink@d46K9s2c8@1M7q4\)9K6b7g2\)9J5c8W2\)9J5c8X3q4H3K9g2\)9J5k6h3#2Q4x3X3g2J5k6h3&6J5k6h3&6Q4x3X3g2U0L8$3#2Q4x3V1k6S2M7r3W2Q4x3V1k6U0L8r3W2W2L8Y4c8Q4x3V1k6D9L8$3N6A6L8R3%60.%60.) ，携带完整的登录参数（账号、密码密文、设备指纹、签名等）。

（3）错误日志上报：登录失败后，客户端自动将错误信息（error\_code=10002）打包上报至 /api/apierror 接口。

（4）用户行为日志：客户端记录用户操作轨迹（如点击按钮、切换输入框等），并发往 /api/phoneclient/opLog2 用于埋点统计。

第一个包是因为APP已经停止运营，服务器已经关闭，所以返回的响应为404 not found。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/691898cbc59e9a66.webp)

重点分析第二个数据包，也就是登录的数据包。查看数据包，请求方法POST，下面是请求的请求体（Request Body），请求头中以 client\_info= 开头，以末尾的 sig= 结束，采用 URL 百分号编码对嵌套的 JSON 对象（如 client\_info）进行了转义。服务器的响应是200，下面的一串乱码是返回了gzip压缩后的 **{"error\_code":10002,"error\_msg":"账号或密码输入错误，请检查后重试"}** ，在APP中点击登录就会弹出这样的信息。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/e49dd586557c14b8.webp)

对请求体中的 URL 编码参数进行分析，下面的参数构成了登录接口的核心协议层，划分为基础协议控制（format、v、gz）、用户凭证与校验（user、password、verifycode/isverify）、时间戳防重放（call\_id）以及设备与身份标识（uniq\_id、api\_key、ext\_info）等模块，以及包含的两个sig签名。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/d3cf33887b85477c.webp)

已知登录调用的方法中有一个方法会发送以上的参数进行请求，因此打开Jadx通过搜索参数找到该方法的实现，从而进行逆向分析，参数有很多，一般搜索不常用且最长的效率比较高，这里搜索tab\_sequence只有一处调用，很容易就可以定位到登录函数中发送请求代码的部分。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b27fcb3067af70e8.webp)

点击搜索结果，调用方法的反编译原型如下：

```java
publicstaticvoida(finalString str, finalString str2, inti, String str3, String str4, finalContext context, finalLoginStatusListener loginStatusListener)
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/05e36688383617e6.webp)

分析a方法，首先调用A函数生成一个jsonObjectA对象：

```java
JsonObject jsonObjectA = A(false, true);
```

跟进A方法，该函数是人人网客户端所有网络请求的基础参数构造入口，负责统一注入 v（版本号）、api\_key（应用公钥）、call\_id（本地时间戳）以及根据登录态动态添加 session\_key（会话凭证），并通过调用 g() 方法以单键值对的形式，将 iR() 所采集的全部设备指纹信息以 JSON 字符串打包，统一注入 client\_info 字段。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/9c129446462b2bee.webp)

回到a方法接着分析，调用完A方法后又接着往jsonObjectA对象输入参数，这里对应了Fiddler中抓到包中的参数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1917c0d72da6324c.webp)

生成第一个sig：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/d8afcf8149891b83.webp)

```java
String[] keys = jsonObjectA.getKeys(); // 获取所有参数名
for(String str5 : keys) {
// 把 参数名=参数值 用 & 连成一长串
sb.append(str5).append('=').append(URLEncoder.encode(string)).append('&');
// 如果参数值太长（>50个字符），只截取前50个
}
// 调用 a(strArr, jhS) 生成最终的sig
jsonObjectA.put("sig", a(strArr, jhS));
```

跟进a(strArr, jhS)，分析签名生成算法，算法定义了人人网登录签名的生成规则：将所有 键.值 按字典序升序排列后直接首尾相连，再追加固定密钥（jhS），最后计算 MD5 值。jsonObjectA.put("sig", a(strArr, jhS));调用了一次生成了包中的第一个sig。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1bf61501ca94543a.webp)

查看jhS密钥，定义为一个字符串，调用了setSecretKey函数生成。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6594b0c88d109754.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b5f20a174f3de33e.webp)

查看setSecretKey函数，没有什么有用的信息。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/16d29e2c8d99644b.webp)

查看jhS的交叉引用，关注第一个引用，jhS的值是通过string赋值来的。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/7655f6d6feb513ce.webp)

跟踪进赋值的代码出，可以看到string是从 String string = RenrenApplication.getContext().getResources().getString(R.string.secretkey); 中的 R.string.secretkey 中获得，这通常是从APK 内置的 res/values/strings.xml 资源文件中读取到的。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/cfb3783f35404a21.webp)

点击跟进可以看到secretkey在R.java中的资源ID值。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a7201316d89379b9.webp)

这里在apk中搜索在strings.xml并没有找到，这是因为通过AndResGuard 等资源混淆工具处理后的 APK 中，传统的 res/values/strings.xml 文件已被物理删除，其所有字符串常量均被压缩合并至根目录的 resources.arsc 二进制资源表中。

但是在Jadx-GUI 加载 APK 时，会自动解析 resources.arsc，并在右侧的“资源管理器”里虚拟重建出一个 res/values/strings.xml。

勾选资源，搜索secretkey，在重建后的strings.xml中找到secretkey的具体值，这里就拿到了第一次sig生成时的jhS的密钥值了：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/543fd9e3956d5c33.webp)

```xml
<stringname="secretkey">
ad974a0756d84cec80fcea72fcbfba9f
</string>
```

再次回到最开始的a函数接着分析，public final void response(...) 部分是服务器响应后，App根据响应做不同的反应：

1.看是不是报错：jsonObject2.getNum("error\_code")。如果是 -99 或 -97，就弹窗提示“无法连接网络”。

2.如果是密码错误（10002）：调用 loginStatusListener.b(num, string2, string3)，你的手机屏幕上就会弹出“账号或密码输入错误”。

3.如果登录成功：

（1）把账号密码明文存进手机本地数据库（Variables.password = str2）

（2）把用户的昵称、头像存进内存（TalkManager.INSTANCE.initUserInfo）。

（3）弹窗说“登录成功”（loginStatusListener.onLoginSuccess()）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/58c205482c12ece5.webp)

a方法的代码最后几行：

httpRequestWrapper.setUrl(jgH + "/client/login"); // 生成发送的目标的url

httpRequestWrapper.setData(jsonObjectA); // 封装参数给客户端

httpRequestWrapper.setResponse(iNetResponse); // 获取响应

HttpProviderWrapper.getInstance().addRequest(httpRequestWrapper); // 发送请求

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/0161770e4cdda499.webp)

到此，a方法已经分析完毕，抓到的包中的除了第二个sig外都能够在方法中找到，接下来找第二个sig的方法实现。这里有两个思路，一是AS\\JEB动态调试找到生成第二个sig的方法位置，二是已经找到了sig签名的核心生成函数，即jsonObjectA.put("sig", a(strArr, jhS));中的a(strArr, jhS)，追踪到a方法的原型，对a方法进行交叉引用进行分析即可。

这里使用第二个方法，如下图是a方法的交叉引用结果，一共有四处出现了"sig"字符串，挨个分析，第一个调用是上面分析的a方法中用来生成第一个sig，第二个调用在h方法中定义了登录后的“获取乐视云视频Token”接口，第四个调用在toString() 方法中是人人网客户端所有网络请求的通用序列化入口。第三个调用也就是 cba() 方法中是人人网客户端实际用于网络传输的请求序列化入口，该方法对参数值进行了 URL 编码。很显然，对四处调用进行分析后，第三个很显然是第二个sig的生成，当然了这里仅是静态分析，有分析错误的可能，也可以动态调试验证一下。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/58b0da4577c3d85b.webp)

查看cba函数的反编译代码，主要关注最后的sig生成调用：把排好序、截断后的参数数组（strArr）加上密钥（secretKey）搅出 MD5，贴在字符串最后。和第一处调用不同的是第一处的密钥是jhS，第二处的密钥是secretKey。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/af72c468dd01c4cc.webp)

和分析jhS密钥一样，对secretKey进行交叉引用，交叉引用结果的第一处就是给secretKey进行赋值。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b152da2115be90d6.webp)

跟进查看，HttpRequestWrapper函数默认将签名密钥赋值为全局变量 jhT。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/2da58e4a3138313d.webp)

回到对jhT的赋值处，也可以看到jhT也是通过string进行赋值为secretkey的值，也就是说第二次sig的密钥secretKey为secretkey的值，和第一次sig的密钥jhS的值相同。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/010d5e5f23e7933d.webp)

这里对数据包以及发送数据包的代码分析已经完毕，但是在这段代码中没有看到真正的登录逻辑，在模拟器中我们是点击登录按钮才触发的上面的一系列的事件，众所周知，按钮需要关注的代码为onClick，对a函数进行交叉引用，可以看到搜索结果有两处是在onClick中调用了a方法。两个onClick不同的是一个在loginB中调用，一个是在loginfree中调用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/32545de10836cbef.webp)

这里为什么有两个onClick调用，猜测应该是在登录页面时有两种登录方式对应了两个onClick的调用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/87608ccdcf4a8864.webp)

我们这里使用的是“RR账号登录”，为了定位到想分析的onClick，这里使用ddms的方法剖析进行验证。

win+r输入ddms即可打开ddms。点击 DDMS 工具栏上开始方法分析的按钮（三个小箭头指向一个红点），在弹出的对话框中，直接点击 OK 使用默认设置即可。在模拟器上快速点击“登录”按钮。再次快速点击 DDMS 中那个开始分析的按钮来停止记录。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/26c352c4b7398465.webp)

这时会打开Traceview工具窗口，展示完整的分析结果。在打开的方法剖析窗口中搜索onClick，成功找到点击登录时调用的onClick的具体位置：com.renren.mobile.android.loginB.register.ui.LoginFromQuickRegisterFragment.onClick

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/88646b281618cbcd.webp)

很显然我们的登录方式是在loginB中被使用，追踪分析反编译代码。主要使用了 switch-case 语句，根据被点击视图的 ID（view.getId()）来决定执行哪一段代码。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ca95c372ed5e7cdf.webp)

逐个按钮进行分析：

1.R.id.password\_inputtype\_change —— 密码可见/不可见切换

fKI 是一个布尔值，记录当前密码是否可见，fMk 是一个 ImageView，用来显示小眼睛图标，fPk 是密码输入框（EditText）。点击后切换密码的显示方式，同时更换图标，最后把光标移到输入框末尾（方便继续输入）。

```java
if(this.fKI) {
// 当前是可见状态，改为不可见
this.fMk.setImageResource(R.drawable.intput_passwod_visiable);
this.fPk.setTransformationMethod(HideReturnsTransformationMethod.getInstance());
this.fKI = false;
} else{
// 当前是不可见状态，改为可见
this.fKI = true;
this.fMk.setImageResource(R.drawable.intput_passwod_unvisiable);
this.fPk.setTransformationMethod(PasswordTransformationMethod.getInstance());
}
this.fPk.setSelection(this.fPk.getText().length());
```

2.R.id.planb\_login\_from\_publish\_forgetpsd\_btn —— 忘记密码

创建一个数据包 Bundle，放入“返回按钮文字”、“中间标题”和一个 URL（this.fKr），然后调用 TerminalIAcitvity.a 方法，启动一个 WebView 页面，用于显示忘记密码的网页。

```java
Bundle bundle = newBundle();
bundle.putString("titleLeft", ...);
bundle.putString("titleMiddle", ...);
bundle.putString("url", this.fKr);
TerminalIAcitvity.a(SY(), (Class<?>) BaseWebViewFragment.class, bundle);
```

3.R.id.planb\_login\_from\_publish\_login\_btn —— 登录按钮

清空一些缓存设置：

```java
SettingManager.bwT().nD("");
SettingManager.bwT().wk(-1);
RSA.init();
aHs();
```

获取用户输入的用户名和密码，fPl 是用户名输入框，fPk 是密码输入框，它们被存到静态变量 Variables 中：

```java
Variables.hJU = this.fPl.getText().toString().trim();
Variables.password = this.fPk.getText().toString().trim();
```

接下来检查输入是否为空，如果用户名为空，弹出提示“账号不能为空”。如果密码为空，弹出提示“密码不能为空”。然后检查用户名是否包含中文，Methods.qq 判断是否包含中文字符的方法。如果包含中文，提示“账号不能包含中文”。再检查密码是否包含中文，如果密码包含中文，提示“密码不能包含中文”。

密码加密——如果服务器成功下发了RSA公钥，就用 RSA 非对称加密 保护密码。如果获取公钥失败，就降级为 MD5 加密：

```java
dPl = RSA.ccz();
this.n = RSA.ccB();
this.e = RSA.ccA();
if(dPl != null) {
// 使用 RSA 公钥加密密码
Variables.password = RSA.D(Variables.password, this.n, this.e);
RSA.lAT = 1;
} else{
// 否则使用 MD5 加密
Variables.password = Md5.toMD5(Variables.password);
RSA.lAT = 2;
}
```

发起登录请求，显示加载进度，然后调用 ServiceProvider.a 发送登录请求，参数里包含了加密后的密码：

```java
if(用户名和密码非空) {
if(this.fPp != null) {
this.fPp.show(); // 显示一个进度条
}
// 调用网络请求，把用户名、密码等发给服务器
ServiceProvider.a(Variables.hJU, Variables.password, 1, "", dPl, SY(), this.dPt);
}
```

4.R.id.service\_configuration —— 调试配置

启动一个调试管理页面：

```java
startActivityForResult(newIntent(SY(), (Class<?>) DebugManagerActivity.class), -1);
```

第三方登录按钮（微信、QQ、微博）

调用同一个方法 oy()，传入不同数字区分平台，进行第三方授权登录：

```java
caseR.id.third_login_layout_weixin_button:
oy(2); // 微信
break;
caseR.id.third_login_layout_qq_button:
oy(1); // QQ
break;
caseR.id.third_login_layout_weibo_button:
oy(3); // 微博
break;
```

至此，登录的核心逻辑也已经分析完毕。

接下来分析用来加密的算法RSA。算法主要做了两件事，一是从服务器获取 RSA 公钥（auN() 方法），二是用公钥加密明文密码（D() 方法）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/0a5750b68e919109.webp)

一、静态变量（存储加密参数）

dPl 就是之前登录代码里判断是否为 null 的那个变量。lAT 用来标记最终使用的是哪种加密方式，便于后续日志或统计。

```java
publicstaticString dPl = null; // 公钥字符串（从服务器获取）
publicstaticString e = null; // RSA 加密指数（Exponent）
publicstaticString n = null; // RSA 模数（Modulus）
publicstaticintlAT = 0; // 加密模式标记：1=RSA，2=MD5（降级）
```

二、auN()：从服务器获取 RSA 公钥

向 [http://login.renren.com/ajax/getEncryptKey](https://bbs.kanxue.com/elink@96aK9s2c8@1M7q4\)9K6b7g2\)9J5c8W2\)9J5c8X3I4G2k6$3W2F1i4K6u0W2M7X3g2F1M7X3g2F1i4K6u0W2j5$3!0E0i4K6u0r3j5h3A6S2P5q4\)9J5c8X3N6W2N6p5g2F1j5%4u0&6M7s2c8w2k6i4V1%60.) 发起 HTTP GET 请求。读取服务器返回的第一行内容（应为公钥字符串）。如果读取不到，返回 null。

```java
static/* synthetic */String auN() throwsIOException {
BufferedReader bufferedReader = newBufferedReader(
newInputStreamReader(
newURL(" 
http://login.renren.com/ajax/getEncryptKey
").openStream(),
"GB2312"
)
);
String line = bufferedReader.readLine();
bufferedReader.close();
if(line != null) {
returnline;
}
returnnull;
}
```

三、D()：RSA 加密核心方法

创建 RSA 加密器（Cipher.getInstance）。用传入的模数 str2（n）和指数 str3（e）构造公钥，初始化加密模式。对明文密码

```java
（str.getBytes()）进行 RSA 加密，得到加密后的字节数组。将字节数组逐字节转为 16进制字符串，拼接成最终的密文。
publicstaticString D(String str, String str2, String str3)
throwsBadPaddingException, NoSuchPaddingException,
IllegalBlockSizeException, NoSuchAlgorithmException, InvalidKeyException {
Cipher cipher = Cipher.getInstance(RSAUtil.ALGORITHM_RSA);
cipher.init(1, bu(str2, str3)); // 1 = ENCRYPT_MODE
byte[] bArrDoFinal = cipher.doFinal(str.getBytes());
StringBuffer stringBuffer = newStringBuffer();
for(byteb : bArrDoFinal) {
stringBuffer.append(Integer.toString((b & 255) + 256, 16).substring(1));
}
returnstringBuffer.toString();
}
bu(str2, str3) 是 newRSAPublicKeySpec(n, e) 的封装，用于从 n 和 e 生成 Java 的 PublicKey 对象。
```

动态 Hook 验证

Frida HOOK RSA中的D算法：

```javascript
jscode = """
Java.perform(function () {
var RSA = Java.use('com.renren.mobile.utils.RSA');
// 精确指定重载：D(String, String, String)
var D = RSA.D.overload('java.lang.String', 'java.lang.String', 'java.lang.String');
D.implementation = function (plaintext, n, e) {
console.log("\n[+] Hook D() 被触发！");
console.log("[+] 明文密码: " + plaintext);
console.log("[+] 模数 n: " + n);
console.log("[+] 指数 e: " + e);
// 调用原方法计算密文
var result = this.D(plaintext, n, e);
console.log("[+] RSA 密文: " + result);
console.log("[+] Hook 结束\n");
return result;
};
console.log("[*] RSA.D() Hook 已安装");
});
"""
```

Xposed HOOK RSA中的D算法。

```python
package com.qianyu.xposedhook;
importde.robv.android.xposed.IXposedHookLoadPackage;
importde.robv.android.xposed.XC_MethodHook;
importde.robv.android.xposed.XposedBridge;
importde.robv.android.xposed.XposedHelpers;
importde.robv.android.xposed.callbacks.XC_LoadPackage.LoadPackageParam;
public classModule implements IXposedHookLoadPackage {
    @Override
    public void handleLoadPackage(LoadPackageParam lpparam) throws Throwable {
        if(!lpparam.packageName.equals("com.renren.mobile.android")) {
            return;
        }
        XposedBridge.log("目标包名: "+lpparam.packageName);
        //Hook RSA.D(String, String, String) —— RSA 加密方法
        XposedHelpers.findAndHookMethod(
            "com.renren.mobile.utils.RSA",          //类名
            lpparam.classLoader,                    //类加载器
            "D",                                    //方法名
            String.class,                           //参数1：明文密码
            String.class,                           //参数2：模数 n
            String.class,                           //参数3：指数 e
            new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) throws Throwable {
                    XposedBridge.log("========== RSA.D() 被调用 ==========");
                    XposedBridge.log("密码明文: "+param.args[0]);
                    XposedBridge.log("模数 n  : "+param.args[1]);
                    XposedBridge.log("指数 e  : "+param.args[2]);
                    //打印调用堆栈（帮助定位调用来源）
                    XposedBridge.log("调用堆栈：");
                    StackTraceElement[] stack =new Throwable().getStackTrace();
                    for(StackTraceElement elem : stack) {
                        XposedBridge.log("  "+elem.toString());
                    }
                }
                @Override
                protected void afterHookedMethod(MethodHookParam param) throws Throwable {
                    //获取加密后的结果（十六进制字符串）
                    Objectresult =param.getResult();
                    XposedBridge.log("RSA 密文: "+(result !=null ? result.toString() : "null"));
                    XposedBridge.log("========== RSA.D() 结束 ==========");
                    //注意：不要修改 result，直接返回原值
                }
            }
        );
```

编译打包后，安装模块执行后HOOK的结果。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/43e4ca48700cd339.webp)

参考文献：

[https://blog.csdn.net/YJJYXM/article/details/101678443](https://bbs.kanxue.com/elink@52aK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6T1L8r3!0Y4i4K6u0W2j5%4y4V1L8W2\)9J5k6h3&6W2N6q4\)9J5c8W2W2v1d9W2W2j5e0g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6V1k6i4c8S2K9h3I4K6i4K6u0r3x3e0l9I4y4U0M7%5E5y4o6b7K6)

[https://blog.csdn.net/2503\_90751789/article/details/146139827](https://bbs.kanxue.com/elink@018K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6T1L8r3!0Y4i4K6u0W2j5%4y4V1L8W2\)9J5k6h3&6W2N6q4\)9J5c8U0t1#2x3o6y4Q4y4h3j5&6x3o6M7#2x3e0M7^5z5g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6V1k6i4c8S2K9h3I4K6i4K6u0r3x3e0b7$3x3e0x3&6z5o6t1%4)

[https://blog.csdn.net/baidu\_21088845/article/details/119955684](https://bbs.kanxue.com/elink@12dK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6T1L8r3!0Y4i4K6u0W2j5%4y4V1L8W2\)9J5k6h3&6W2N6q4\)9J5c8X3u0S2K9h3c8#2i4K6g2X3x3U0p5H3z5o6R3^5y4o6g2Q4x3V1k6S2M7Y4c8A6j5$3I4W2i4K6u0r3k6r3g2@1j5h3W2D9M7#2\)9J5c8U0p5I4z5e0V1#2y4e0j5^5y4l9%60.%60.)

附件链接: https://pan.baidu.com/s/1bigpkMPgi9UqBmnYaKqnRw 提取码: 6md3

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm)

* * *

## 评论

> **bluegatar · 2 楼**
> 
> 图片都挂了

> **ODcat · 3 楼**
> 
> > [bluegatar](https://bbs.kanxue.com/user-352825.htm) 图片都挂了
> 
> 第一次写，上传的md，md编辑找不到发帖按钮，麻了 ![](https://bbs.kanxue.com/view/img/face/006.gif)
