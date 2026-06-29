---
title: 【看雪】最右APPv4.9.9登录协议分析
source: https://bbs.kanxue.com/thread-291817.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-29T19:42:53+08:00
trace_id: eefe1b8a-908f-4a29-8ba9-eed4c2600f50
content_hash: 38f686d2091939bd4e01d3bffc23568f76e54edfc2bcf940131edb2d2f1ff80d
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 最右APP登录时，通过自定义的XCP协议和v2签名机制对请求体进行AES加密和签名，以保护通信安全。
ai_summary_style: key-points
images_status:
  total: 23
  succeeded: 23
  failed_urls: []
notion_page_id: 38e75244-d011-8128-a973-f6f609286000
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - api.izuiyou.com
    - api.weibo.com
    - api.weixin.qq.com
    - bbs.kanxue.com
    - cdn.jsdelivr.net
    - graph.qq.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 最右APP登录时，通过自定义的XCP协议和v2签名机制对请求体进行AES加密和签名，以保护通信安全。
> 
> - **协议特征：** 使用自定义的`application/xcp`封包格式，请求通过`X-Xc-Proto-Req`头传递协议密钥，响应通过`X-Xc-Proto-Res`头返回状态与加密Token。
> - **加密实现：** Java层`NetCrypto`类负责处理，核心方法`encodeAES`用于加密请求体，`i`和`j`方法生成签名`sign`，`getProtocolKey`生成协议头，这些方法最终调用`libnet_crypto.so`中的native函数。
> - **加密算法：** 通过Frida Hook获取加密前明文JSON，结合代码分析确认采用标准的AES加密算法，Body和签名计算均基于此。
> - **签名流程：** `sign`（值为`v2-`开头）的生成流程为：输入URL与时间戳/随机数 → 构造包含固定盐值的缓冲区 → 进行哈希运算 → 转换为32位小写十六进制字符串 → 拼接“v2-”前缀。
> - **分析方法：** 文章展示了通过Frida动态Hook获取中间数据（如加密前明文），并使用IDA静态分析带有ollvm混淆的so文件，以还原加密与签名逻辑的完整逆向过程。

*本文仅限安全研究与学习交流，严禁将本文内容用于任何商业或非法用途，本文涉及的代码及资源版权归原权利人所有，侵删。*

APK版本——4.9.9，由于APP还在运营中，这里选择一个较老的版本进行分析学习。

所用工具：DIE、Fiddler、jadx-gui、Frida、IDA Pro7.7、雷电模拟器9.1（64位）。

首先使用DIE查看程序是否存在加固。如下图，这是一个基于 B4A（Basic4Android） 开发的Android应用，采用 Basic 和 Java 混合编码，运行环境为 Android 9（API 28），没有特征明显的加固。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/7994d02dc2d5a7f5.webp)

配置Fiddler代理，在雷电模拟中抓取APP登录的包。具体操作为在模拟器中打开APP选择账号密码登录，点击登录按钮观察APP响应并在Fiddler中查看抓到包的数据。

APP响应为“手机号还没有注册”。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ef783a43fb391a7c.webp)

抓取到的登录数据包一共有两个。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3fbf23bfae4fff8b.webp)

第一个包是HTTPS代理隧道握手。客户端要求通过代理（或Fiddler）建立到目标服务器443端口的TCP隧道。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/0278a7b50455042d.webp)

第一个包的响应为200表示代理已成功打通隧道，但是包中标注 `Connection: close` 且“failed to send any data”，说明这个隧道建立后立即被关闭了。这意味着APP并没有真正走HTTPS（TLS）加密，而是尝试建立隧道失败后，降级为HTTP请求。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b7a4ec1e8052491a.webp)

第二个包是真正的登录POST请求。一眼扫去有以下特征：在登录包的请求URL后面加上了sign，Body是无法解密的乱码。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b27dbb80f080cf04.webp)

详细分析登录包的参数。

|     |     |     |
| --- | --- | --- |
| Header | 值   | 含义  |
| ZYP | mid=315643226 | “最右”拼音首字母（ZuiYouP...）。 `mid` 大概率是 Machine ID（设备指纹），用于绑定登录设备。 |
| X-Xc-Proto-Req | duck-1782652452-...长串Base64 | 自定义协议验证头。 `duck` 可能是内部框架名（鸭舌帽/协议框架）； `1782652452` 是 Unix 时间戳（约为2026-06-27 14:14:12，与请求时间吻合）；后面的Base64解码后很可能是会话密钥密文或AES初始向量（IV），用于服务端解密Body。 |
| Request-Type | text/json | 声明业务逻辑格式为JSON。 |
| Content-Type | application/xcp | XCP = eXtended Custom Protocol。表示该APP自定义了二进制封包格式。 |

接下来看第二个包的响应：

1.  响应体（96字节乱码）：同样是 `application/xcp` 加密。
    
2.  `xcserververify: 1` ：服务器验证标记，说明服务端校验了请求头中的签名和XCP加密数据，返回的 `1` 表示验证通过（若为0则可能是签名错误）。
    
3.  `X-Xc-Proto-Res` 中的 `1-` 前缀：代表状态码（1=成功），后续带上了服务端返回的加密Token（登录后的Session）密文。
    

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f1baf225a87788f1.webp)

推测服务端解密流程为：取 `X-Xc-Proto-Req` 中的密钥信息 → 解密Body → 校验Sign是否匹配 → 验证账号密码 → 返回加密的Token密文。

接下来就要根据搜索抓包时看到的关键词，找到引用这些字符串的代码，分析其调用关系。有以下几种搜索思路：

搜索Header名：如 `"ZYP"`, `"X-Xc-Proto-Req"`, `"Request-Type"` 。

搜索参数名：如 `"sign"`, `"v2-"` 。

搜索URL路径：如 `"http://api.izuiyou.com/account/login"` 。

Jadx打开安装包进行全文搜索，这里把可能的每个参数都搜索一遍，发现搜索"X-Xc-Proto-Req"有且仅有一处使用，这就很方便了，直接追踪查看分析调用处代码。 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dbc8c6afc7422e74.webp)

代码总体是一个OkHttp的网络请求的核心拦截器（ `Interceptor` ），负责在 `POST` 请求发出前对请求体（Body） 进行加工和加密，并添加关键头部。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b97769a44472a7b7.webp)

对这段反编译代码详细分析。

**请求预处理。**

取出原始请求的URL、协议、域名，用于后续判断是否强制HTTPS。

```java
Request3 request3Uk = aVar.uk();
HttpUrl httpUrlAUl = request3Uk.aUl();
String strAUZ = httpUrlAUl.aUZ();   // 协议（http/https）
String strYc = httpUrlAUl.yc();     // 主机名
```

**URL协议切换。**

若原URL是 `https` 且域名满足 `mJ()` 条件，或全局开关 `euC.vO()` 为真，则强制使用 `https` ，否则降级为 `http` 。

`mJ(strYc)` ：检查主机名是否在硬编码白名单 `euB` 中（ `api.weibo.com`, `api.weixin.qq.com`, `graph.qq.com` ），这些域名强制使用 HTTPS，对应了APP中其他三种登录方式。

`this.euC.vO()` ：全局开关，若为 `true` 则强制使用 HTTPS。

若以上条件均不满足，则降级为 HTTP（端口 80），这就是为什么抓包中使用 HTTP 的原因——域名不在白名单且 `vO()` 为 `false` 。

```java
booleanz = ("https".equals(strAUZ) && mJ(strYc)) || this.euC.vO();
aVar2.qv(z ? "https": SonicSession.OFFLINE_MODE_HTTP)...
```

**添加设备ID头。**

```java
aVarAVU.bq("ZYP", "mid="+ this.euC.getMid());
```

**处理POST请求体。**

`euC.z(jSONObject)` 是动态注入参数的地方，会加入 `timestamp` 、 `random` 等，这些是签名计算的基础。

`NetCrypto.j()` 和 `NetCrypto.i()` ：两个方法都接收 `URL字符串` 和 `字节数组` ，返回值为签名（sign），并调用 `qJ()` 设置到请求中。抓包中看到的 `sign=v2-xxx` 就是由这两个方法生成的。

`NetCrypto.encodeAES()` ：负责AES加密Body。

`NetCrypto.getProtocolKey()` ：生成 `X-Xc-Proto-Req` 头的内容（抓包中的长串Base64）

```java
if(request3Uk.aVQ().equalsIgnoreCase("post") && requestBodyAVS != null&& 
    (mediaTypeContentType == null|| mediaTypeContentType.toString().contains("text/plain") || 
     mediaTypeContentType.toString().contains("application/json"))) {
    // 读取原始Body为字符串
    Buffer2 buffer2 = newBuffer2();
    requestBodyAVS.writeTo(buffer2);
    String strAXZ = buffer2.aXZ();
    buffer2.close();
    // 转为JSONObject
    JSONObject jSONObject = TextUtils.isEmpty(strAXZ) ? newJSONObject() : newJSONObject(strAXZ);
    // 注入公共参数
    this.euC.z(jSONObject);   // 很可能添加了时间戳、随机数等
    byte[] bytes = jSONObject.toString().getBytes(Charset.forName("UTF-8"));
    // 判断是否加密
    if(this.euC.vP() != 2|| mK(httpUrlAVo.toString())) {
        // 不加密分支（明文JSON）
        aVarAVU.qJ(NetCrypto.j(httpUrlAVo.toString(), bytes))  // 可能生成sign并添加到URL?
          .a(RequestBody.create(MediaType.qH("application/json; charset=utf-8"), bytes));
    } else{
        // 加密分支
        byte[] bArrEncodeAES = NetCrypto.encodeAES(bytes);
        aVarAVU.qJ(NetCrypto.i(httpUrlAVo.toString(), bArrEncodeAES))  // 可能生成签名（基于URL+密文）
                 .bq("X-Xc-Proto-Req", NetCrypto.getProtocolKey())
                 .a(RequestBody.create(MediaType.qH("application/xcp"), bArrEncodeAES));
    }
    // 无论是否加密，都添加这个头
    aVarAVU.bq("Request-Type", "text/json");
}
```

追踪NetCrypto类分析，如下图，大部分方法都在so层中的libnet_crypto中实现，生成sign函数的i和j调用了native函数generateSign和sign函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c10456016abf21ef.webp)

在进入so层进一步分析之前，使用FridaHOOK得到加密前的明文JSON。

HOOK代码：

```java
function bytesToString(bytes) {
    if(!bytes) return"null";
    try{
        returnJava.use("java.lang.String").$new(bytes, "UTF-8");
    } catch(e) {
        return"[Binary Data]";
    }
}
Java.perform(function () {
    var NetCrypto = Java.use("com.izuiyou.network.NetCrypto");
    NetCrypto.encodeAES.implementation = function(bArr) {
        console.log("\n加密前明文(JSON)");
        console.log(bytesToString(bArr));
        var result = this.encodeAES(bArr);
        returnresult;
    };
    console.log("[*] Hook successfully!");
});
```

如下图，成功拿到登录包加密前的body。

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/2072212dee7f2a35.webp)**

再次Hook Java 层的 i、j 和 getProtocolKey，获得加密后的密文（ `i` 的 `bArr` 参数）、最终的 Sign 值和 `X-Xc-Proto-Req` 头（ `getProtocolKey` 的返回值）。HOOK出加密后的密文可以尝试跳过获取密钥和iv验证加密Body的算法是否为没有魔改的标准的AES，hooksign和XXPT头验抓到的包中的数据。

HOOK代码：

```java
// 字节数组转十六进制
function bytesToHex(bytes) {
    if(!bytes) return"null";
    var hex = [];
    for(var i = 0; i < bytes.length; i++) {
        var b = bytes[i] & 0xFF;
        hex.push(('0'+ b.toString(16)).slice(-2));
    }
    returnhex.join('');
}
// 字节数组转字符串
function bytesToString(bytes) {
    if(!bytes) return"null";
    try{
        returnJava.use("java.lang.String").$new(bytes, "UTF-8");
    } catch(e) {
        return"[Binary Data]";
    }
}
Java.perform(function () {
    var NetCrypto = Java.use("com.izuiyou.network.NetCrypto");
    // Hook 加密分支的 i 方法
    NetCrypto.i.implementation = function(url, encryptedData) {
        console.log("\ni 加密分支被调用");
        console.log("原始 URL: "+ url);
        console.log("加密后密文 (Hex): "+ bytesToHex(encryptedData));
        console.log("密文长度: "+ encryptedData.length);
        // 调用原始方法（会内部调用 native sign 并拼接 URL）
        var result = this.i(url, encryptedData);
        // 打印完整 URL
        console.log("拼接后的完整 URL: "+ result);
        returnresult;
    };
    // Hook 协议密钥生成
    NetCrypto.getProtocolKey.implementation = function() {
        var key = this.getProtocolKey();
        console.log("\ngetProtocolKey");
        console.log("X-Xc-Proto-Req 值: "+ key);
        returnkey;
    };
    // Hook setProtocolKey 看密钥来源
    NetCrypto.setProtocolKey.implementation = function(key) {
        console.log("\nsetProtocolKey");
        console.log("设置的新 Key: "+ key);
        this.setProtocolKey(key);
    };
    console.log("[*]hook successfully!");
});
```

HOOK结果：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/67f77a04defcdecc.webp)

使用IDA Pro7.7打开libnet_crypto.so文件分析，在导出函数表中找到JNI_OnLoad使用的是动态注册。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/97caa64dce34d97b.webp)

点击进入分析，jclass和RegisterNatives没有正常识别，且存在简单的ollvm混淆

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/5abb9b9b69c99e2c.webp)

这里使用插件或者手动去除都可以。

简单分析下混淆。

|     |     |
| --- | --- |
| 状态值 | 含义  |
| `-931151827` (`0xC87FC02D`) | 初始状态 → 检查 `v5` (GetEnv 结果) |
| `-38030008` (`0xFDBBB548`) | `v5 != 0` 时的正常路径 → 注册 JNI 函数 |
| `-1953395755` (`0x8B918BD5`) | `v5 == 0` 时的错误路径 → 返回 -1 |
| `279658138` (`0x10AB3E9A`) | 最终状态 → 正常返回 |
| `-38030009` (`0xFDBBB547`) | 边界比较值 |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/7217181fbec254b4.webp)

手动去除混淆（一路nop+简单的修改汇编即可），如下图，图中两处标红的地方其实就是jclass和RegisterNatives。这里标红是GetEnv找不到jclass和RegisterNatives的使用，修复很简单直接修改跳转为两处调用的明文地址。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/708da23e996c6eb1.webp)

首先对两处标红的地方右键Set call type为jclass (\__thiscall \*)(JNIEnv \*, const char \*)和jint (\__thiscall \*)(JNIEnv \*, jclass, const JNINativeMethod \*, jint)。

然后修改下图中的BLX R3为BLX 0x495FE。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f99fcee8f74f1f64.webp)

如下图，修复后静态代码一目了然。这里代码量比较少，修复起来比较容易，这样方便我们静态分析，当然也可以直接动态分析跟踪RegisterNatives。不修复代码也可以直接点击off_17D010追踪函数进行分析。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/29367434d8eb84e0.webp)

点击off_17D010分析：

`JNINativeMethod` 结构体的数组。每个结构体占 12 字节（3 个指针）：

偏移 +0：方法名（ `const char*` ）

偏移 +4：方法签名（ `const char*` ）

偏移 +8：函数指针（ `void*` ，这里的 `+1` 表示 Thumb 指令集）

观察下图，一共有八个函数注册，数量正好和java层中的分析对应上。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b08a7d434f92f438.webp)

一个一个分析太麻烦，直接HOOK这八个函数查看输入的参数判断对应Java层中的哪个函数。

```javascript
Java.perform(function() {
    varmodule = Process.findModuleByName("libnet_crypto.so");
    if(!module) {
        console.log("[!] libnet_crypto.so 未加载");
        return;
    }
    console.log("[*] libnet_crypto.so 基址: "+ module.base);
    // 8 个 Native 方法的偏移（Thumb 入口，即函数地址 + 1）
    varoffsets = [
        { name: "native_method_1", offset: 0x4966B },
        { name: "native_method_2", offset: 0x4967D },
        { name: "native_method_3", offset: 0x4971D },
        { name: "native_method_4", offset: 0x49865 },
        { name: "native_method_5", offset: 0x499ED },
        { name: "native_method_6", offset: 0x49A4D },
        { name: "native_method_7", offset: 0x49AC9 },
        { name: "native_method_8", offset: 0x49B5B }
    ];
    // ----- 辅助函数：安全读取 JNI 参数 -----
    functionsafeReadArg(env, arg, index) {
        varprefix = "  arg"+ index + ": ";
        // 尝试作为 JString
        try{
            varstr = Java.cast(arg, Java.use("java.lang.String"));
            console.log(prefix + "(String) \""+ str + "\"");
            return;
        } catch(e) {}
        // 尝试作为 JByteArray
        try{
            vararr = Java.cast(arg, Java.use("[B"));
            varbytes = [];
            for(vari = 0; i < arr.length; i++) {
                bytes.push(arr[i]);
            }
            varhex = bytes.map(function(b) { 
                return("0"+ (b & 0xFF).toString(16)).slice(-2); 
            }).join(" ");
            console.log(prefix + "(byte[]) len="+ bytes.length + " hex="+ hex);
            return;
        } catch(e) {}
        // 尝试作为整数（JInt）
        try{
            varintVal = arg.toInt32();
            console.log(prefix + "(int) "+ intVal);
            return;
        } catch(e) {}
        // 默认打印指针
        console.log(prefix + "(pointer) "+ arg);
    }
    functionsafeReadReturn(retval) {
        if(!retval) return;
        // 尝试作为 JString
        try{
            varstr = Java.cast(retval, Java.use("java.lang.String"));
            console.log("  Return: (String) \""+ str + "\"");
            return;
        } catch(e) {}
        // 尝试作为 JByteArray
        try{
            vararr = Java.cast(retval, Java.use("[B"));
            varbytes = [];
            for(vari = 0; i < arr.length; i++) {
                bytes.push(arr[i]);
            }
            varhex = bytes.map(function(b) { 
                return("0"+ (b & 0xFF).toString(16)).slice(-2); 
            }).join(" ");
            console.log("  Return: (byte[]) len="+ bytes.length + " hex="+ hex);
            return;
        } catch(e) {}
        // 默认打印指针
        console.log("  Return: (pointer) "+ retval);
    }
    // ----- 遍历并 Hook 每个方法 -----
    offsets.forEach(function(item) {
        vartarget = module.base.add(item.offset);
        console.log("[*] Hooking "+ item.name + " at "+ target);
        Interceptor.attach(target, {
            onEnter: function(args) {
                console.log("\n========== "+ item.name + " (offset 0x"+ item.offset.toString(16) + ") ==========");
                // args[0]=JNIEnv*, args[1]=jobject/jclass
                // 从第2个参数开始读取（索引2）
                for(vari = 2; i < 6; i++) {
                    if(args[i] && !args[i].isNull()) {
                        safeReadArg(args[0], args[i], i);
                    } else{
                        console.log("  arg"+ i + ": (null)");
                    }
                }
                // 打印堆栈
                console.log("  Stack trace:");
                varException = Java.use("java.lang.Exception");
                varLog = Java.use("android.util.Log");
                varstack = Log.getStackTraceString(Exception.$new());
                console.log(stack);
            },
            onLeave: function(retval) {
                if(retval && !retval.isNull()) {
                    safeReadReturn(retval);
                } else{
                    console.log("  Return: (null)");
                }
                console.log("========== "+ item.name + " end ==========\n");
            }
        });
    });
    console.log("[*] 所有 Hook 已安装，点击登录观察输出。");
});
```

查看HOOK结果，第二个和第四个是 `sign` （签名生成） 和 `encodeAES` （AES 加密）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/562d309bc4720f2f.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/bba1c2f610f8c21b.webp)

在IDA中点击DCD sub_49864+1分析sign签名生成。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c8d680ca94b4203c.webp)

在函数sub_63BA8有两个核心函数sub_63B0C和sub_63A50

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/7a01768bb155faed.webp)

后面也是追踪对多个函数进行静态、动态、HOOK等，虽然分析的版本较老，但是APP目前还在正常运营且文章也有字数限制，一些HOOK和调试结果就不写出来了。

这里简单说一下sign的签名流程作为总结吧。

```
输入：URL、时间戳/随机数（int）
    ↓
构造 384 字节的二进制缓冲区（包含 URL、时间戳、固定盐值等）
    ↓
sub_63B0C（哈希算法）
    ↓
将 哈希 输出转换为 32 位小写十六进制字符串
    ↓
拼接固定前缀 "v2-"
    ↓
返回最终签名
```

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm)
