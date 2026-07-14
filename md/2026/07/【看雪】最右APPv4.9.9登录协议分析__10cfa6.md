---
title: 【看雪】最右APPv4.9.9登录协议分析
source: https://bbs.kanxue.com/thread-291817.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-14T16:02:03+08:00
trace_id: cfd3e566-ac04-4052-948c-2d44f772227d
content_hash: fb71288ade2ad16257c10cb4bfd1a661e1b0f752429ba39985743805db7438d6
status: summarized
tags:
  - 看雪
  - 逆向工程
  - Android
  - 协议分析
  - 加密
  - Frida
  - IDA Pro
series: null
feed_source: null
ai_summary: 最右APP登录协议采用自定义加密XCP和基于MD5的签名机制，通过逆向分析可复现其加密流程。
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 27
  failed_urls: []
notion_page_id: 39d75244-d011-81e8-a7be-ec70d8f91808
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 最右APP登录协议采用自定义加密XCP和基于MD5的签名机制，通过逆向分析可复现其加密流程。
> 
> - **应用特征：** APP基于B4A开发，运行环境为Android 9，未检测到加固特征。
> - **网络行为：** 登录请求尝试HTTPS隧道失败后降级为HTTP，请求Body使用自定义协议XCP加密。
> - **请求参数：** 关键头部ZYP携带设备ID（mid），X-Xc-Proto-Req为协议验证头，签名以"v2-"为前缀由MD5生成。
> - **加密实现：** AES加密通过NetCrypto类调用native方法完成，sign签名在libnet_crypto.so中基于MD5算法实现。
> - **逆向技术：** 分析使用Frida Hook提取加密前后数据，并用IDA Pro处理ollvm混淆和反调试函数。

*本文仅限安全研究与学习交流，严禁将本文内容用于任何商业或非法用途，本文涉及的代码及资源版权归原权利人所有，侵删。*

APK版本——4.9.9，由于APP还在运营中，这里选择一个较老的版本进行分析学习。

所用工具：DIE、Fiddler、jadx-gui、Frida、IDA Pro7.7、雷电模拟器9.1（64位）。

首先使用DIE查看程序是否存在加固。如下图，这是一个基于 B4A（Basic4Android） 开发的Android应用，采用 Basic 和 Java 混合编码，运行环境为 Android 9（API 28），没有特征明显的加固。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7994d02dc2d5a7f5.webp)

配置Fiddler代理，在雷电模拟中抓取APP登录的包。具体操作为在模拟器中打开APP选择账号密码登录，点击登录按钮观察APP响应并在Fiddler中查看抓到包的数据。

APP响应为“手机号还没有注册”。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ef783a43fb391a7c.webp)

抓取到的登录数据包一共有两个。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3fbf23bfae4fff8b.webp)

第一个包是HTTPS代理隧道握手。客户端要求通过代理建立到目标服务器443端口的TCP隧道。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0278a7b50455042d.webp)

第一个包的响应为200表示代理已成功打通隧道，但是包中标注 `Connection: close` 且“failed to send any data”，说明这个隧道建立后立即被关闭了。这意味着APP并没有真正走HTTPS（TLS）加密，而是尝试建立隧道失败后，降级为HTTP请求。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b7a4ec1e8052491a.webp)

第二个包是真正的登录POST请求。一眼扫去有以下特征：在登录包的请求URL后面加上了sign，Body是无法解密的乱码。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b27dbb80f080cf04.webp)

详细分析登录包的参数。

|     |     |     |
| --- | --- | --- |
| Header | 值   | 含义  |
| ZYP | mid=315643226 | “最右”拼音首字母（ZuiYouP...）。 `mid` 大概率是 Machine ID（设备指纹），用于绑定登录设备。 |
| X-Xc-Proto-Req | duck-1782652452-...长串Base64 | 自定义协议验证头。 `duck` 可能是内部框架名（鸭舌帽/协议框架）； `1782652452` 是 Unix 时间戳（约为2026-06-27 14:14:12，与请求时间吻合） |
| Request-Type | text/json | 声明业务逻辑格式为JSON。 |
| Content-Type | application/xcp | XCP = eXtended Custom Protocol。表示该APP自定义了二进制封包格式。 |

接下来看第二个包的响应：

1.  响应体（96字节乱码）：同样是 `application/xcp` 加密。
    
2.  `xcserververify: 1` ：服务器验证标记，说明服务端校验了请求头中的签名和XCP加密数据，返回的 `1` 表示验证通过。
    
3.  `X-Xc-Proto-Res` 中的 `1-` 前缀：代表状态码（1=成功），后续带上了服务端返回的加密Token（登录后的Session）密文。
    

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f1baf225a87788f1.webp)

推测服务端解密流程为：取 `X-Xc-Proto-Req` 中的密钥信息 → 解密Body → 校验Sign是否匹配 → 验证账号密码 → 返回加密的Token密文。

接下来就要根据搜索抓包时看到的关键词，找到引用这些字符串的代码，分析其调用关系。有以下几种搜索思路：

搜索Header名：如 `"ZYP"`, `"X-Xc-Proto-Req"`, `"Request-Type"` 。

搜索参数名：如 `"sign"`, `"v2-"` 。

搜索URL路径：如 `"http://api.izuiyou.com/account/login"` 。

Jadx打开安装包进行全文搜索，这里把可能的每个参数都搜索一遍，发现搜索"X-Xc-Proto-Req"有且仅有一处使用，这就很方便了，直接追踪查看分析调用处代码。 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dbc8c6afc7422e74.webp)

代码总体是一个网络请求的核心拦截器（ `Interceptor` ），负责在 `POST` 请求发出前对请求体（Body） 进行加工和加密，并添加关键头部。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b97769a44472a7b7.webp)

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
    this.euC.z(jSONObject);   // 添加了时间戳、随机数等
    byte[] bytes = jSONObject.toString().getBytes(Charset.forName("UTF-8"));
    // 判断是否加密
    if(this.euC.vP() != 2|| mK(httpUrlAVo.toString())) {
        // 不加密分支（明文JSON）
        aVarAVU.qJ(NetCrypto.j(httpUrlAVo.toString(), bytes))  // 生成sign并添加到URL
          .a(RequestBody.create(MediaType.qH("application/json; charset=utf-8"), bytes));
    } else{
        // 加密分支
        byte[] bArrEncodeAES = NetCrypto.encodeAES(bytes);
        aVarAVU.qJ(NetCrypto.i(httpUrlAVo.toString(), bArrEncodeAES))  // 生成签名（基于URL+密文）
                 .bq("X-Xc-Proto-Req", NetCrypto.getProtocolKey())
                 .a(RequestBody.create(MediaType.qH("application/xcp"), bArrEncodeAES));
    }
    // 无论是否加密，都添加这个头
    aVarAVU.bq("Request-Type", "text/json");
}
```

追踪NetCrypto类分析，如下图，大部分方法都在so层中的libnet_crypto中实现，生成sign函数的i和j调用了native函数generateSign和sign函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c10456016abf21ef.webp)

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

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2072212dee7f2a35.webp)**

再次HOOK Java 层的 i、j 和 getProtocolKey，获得加密后的密文（ `i` 的 `bArr` 参数）、最终的 Sign 值和 `X-Xc-Proto-Req` 头（ `getProtocolKey` 的返回值）。HOOK出加密后的密文可以尝试跳过获取密钥和iv验证加密Body的算法是否为没有魔改的标准的AES，hooksign和XXPT头验抓到的包中的数据。

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

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/67f77a04defcdecc.webp)

使用IDA Pro7.7打开libnet_crypto.so文件分析，在导出函数表中找到JNI_OnLoad使用的是动态注册。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/97caa64dce34d97b.webp)

点击进入分析，jclass和RegisterNatives没有正常识别，且存在简单的ollvm混淆

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5abb9b9b69c99e2c.webp)

这里使用插件或者手动去除都可以。

简单分析下混淆。

\-931151827 (0xC87FC02D)：初始状态 → 检查 v5 (GetEnv 结果)

\-38030008 (0xFDBBB548)：v5!= 0 时的正常路径 → 注册 JNI 函数

\-1953395755 (0x8B918BD5)：v5 == 0 时的错误路径 → 返回 -1

279658138 (0x10AB3E9A)：最终状态 → 正常返回

\-38030009 (0xFDBBB547)：边界比较值

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7217181fbec254b4.webp)

手动去除混淆（一路nop+简单的修改汇编即可），如下图，图中两处标红的地方其实就是jclass和RegisterNatives。这里标红是GetEnv找不到jclass和RegisterNatives的使用，修复很简单直接修改跳转为两处调用的明文地址。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/708da23e996c6eb1.webp)

首先对两处标红的地方右键Set call type为jclass (\__thiscall \*)(JNIEnv \*, const char \*)和jint (\__thiscall \*)(JNIEnv \*, jclass, const JNINativeMethod \*, jint)。

然后修改下图中的BLX R3为BLX 0x495FE或者对GetEnv右键使用Force call type。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f99fcee8f74f1f64.webp)

如下图，修复后静态代码读起来就比较清晰。这里代码量比较少，修复起来比较容易，修复后方便我们静态分析。

除此之外，可以直接动态分析跟踪RegisterNatives。

另外不修复代码也可以直接点击off_17D010追踪函数进行分析。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/29367434d8eb84e0.webp)

点击off_17D010分析：

JNINativeMethod 结构体的数组。每个结构体占 12 字节（3 个指针）：

偏移 +0：方法名（const char\*）

偏移 +4：方法签名（const char\*）

偏移 +8：函数指针（void\*，这里的 +1 表示 Thumb 指令集）

观察下图，一共有八个函数注册，数量正好和java层中的分析对应上。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b08a7d434f92f438.webp)

这里因为so文件的字符串被加密所以无法正常识别。

动态调试或者hook都可以，我们这里选择使用HOOK这八个函数查看输入的参数判断对应Java层中的哪个函数。

```javascript
// hook_netcrypto.js
 
functionhookNativeMethods() {
    varmoduleName = "libnet_crypto.so";
    varbase = Module.findBaseAddress(moduleName);
    if(!base) {
        console.log("["+ moduleName + "] not loaded yet, retrying...");
        setTimeout(hookNativeMethods, 1000);
        return;
    }
    console.log("["+ moduleName + "] base: "+ base);
 
    // 注册表起始偏移（从JNI_OnLoad中获取）
    vartableOffset = 0x17D010;
    vartable = base.add(tableOffset);
    varmethodCount = 8; // 正好8个函数
 
    // 存储方法信息
    varmethods = [];
 
    for(vari = 0; i < methodCount; i++) {
        // 每个方法项占3个指针：方法名、签名、函数指针
        varnamePtr = Memory.readPointer(table.add(i * 12));
        varsigPtr = Memory.readPointer(table.add(i * 12 + 4));
        varfnPtr = Memory.readPointer(table.add(i * 12 + 8));
 
        varname = Memory.readUtf8String(namePtr);
        varsig = Memory.readUtf8String(sigPtr);
        varfnAddr = fnPtr.toInt32() & ~1; // 去除Thumb位
 
        methods.push({
            name: name,
            signature: sig,
            fnAddr: fnAddr
        });
 
        console.log("[+] Found method: "+ name + " | sig: "+ sig + " | addr: 0x"+ fnAddr.toString(16));
    }
 
    // 解析JNI签名，返回参数类型列表
    functionparseSignature(sig) {
        varparams = [];
        vari = 1; // 跳过 '('
        while(sig[i] !== ')') {
            varc = sig[i];
            if(c === 'L') {
                varend = sig.indexOf(';', i);
                vartype = sig.substring(i, end + 1);
                params.push({ type: 'object', class: type });
                i = end + 1;
            } elseif(c === '[') {
                // 数组
                varstart = i;
                while(sig[i] === '[') i++;
                if(sig[i] === 'L') {
                    varend = sig.indexOf(';', i);
                    vartype = sig.substring(start, end + 1);
                    params.push({ type: 'array', class: type });
                    i = end + 1;
                } else{
                    vartype = sig.substring(start, i + 1);
                    params.push({ type: 'array', class: type });
                    i++;
                }
            } else{
                // 基本类型
                params.push({ type: 'primitive', class: c });
                i++;
            }
        }
        returnparams;
    }
 
    // Hook每个函数
    methods.forEach(function(method) {
        varparamTypes = parseSignature(method.signature);
        Interceptor.attach(ptr(method.fnAddr), {
            onEnter: function(args) {
                console.log("\n========== "+ method.name + " ==========");
                console.log("Signature: "+ method.signature);
                console.log("JNIEnv: "+ args[0]);
                console.log("jclass: "+ args[1]);
 
                // 打印参数
                for(vari = 0; i < paramTypes.length; i++) {
                    vararg = args[2 + i];
                    varp = paramTypes[i];
                    console.log("Param["+ i + "] (type: "+ p.class + ") raw: "+ arg);
 
                    try{
                        if(p.type === 'primitive') {
                            switch(p.class) {
                                case'Z': console.log("  -> boolean: "+ (arg.toInt32() !== 0)); break;
                                case'B': console.log("  -> byte: "+ arg.toInt32()); break;
                                case'C': console.log("  -> char: "+ String.fromCharCode(arg.toInt32())); break;
                                case'S': console.log("  -> short: "+ arg.toInt32()); break;
                                case'I': console.log("  -> int: "+ arg.toInt32()); break;
                                case'J': console.log("  -> long: "+ arg.toInt64()); break;
                                case'F': console.log("  -> float: "+ arg.toFloat()); break;
                                case'D': console.log("  -> double: "+ arg.toDouble()); break;
                                default: console.log("  -> unknown primitive");
                            }
                        } elseif(p.type === 'object') {
                            if(p.class === 'Ljava/lang/String;') {
                                varstr = Java.cast(arg, Java.String);
                                console.log("  -> String: \""+ str.toString() + "\"");
                            } else{
                                console.log("  -> Object: "+ arg);
                            }
                        } elseif(p.type === 'array') {
                            if(p.class === '[B') {
                                vararr = Java.cast(arg, Java.array('byte'));
                                varlen = arr.length();
                                console.log("  -> byte[] length: "+ len);
                                if(len > 0) {
                                    varbytes = [];
                                    for(varj = 0; j < Math.min(len, 32); j++) {
                                        bytes.push(arr[j]);
                                    }
                                    console.log("  -> bytes (first 32): ["+ bytes.join(', ') + "]");
                                }
                            } elseif(p.class === '[C') {
                                vararr = Java.cast(arg, Java.array('char'));
                                varlen = arr.length();
                                console.log("  -> char[] length: "+ len);
                                if(len > 0) {
                                    varchars = [];
                                    for(varj = 0; j < Math.min(len, 32); j++) {
                                        chars.push(String.fromCharCode(arr[j]));
                                    }
                                    console.log("  -> chars (first 32): ["+ chars.join(', ') + "]");
                                }
                            } else{
                                console.log("  -> array of type: "+ p.class);
                            }
                        }
                    } catch(e) {
                        console.log("  !! Failed to decode parameter: "+ e);
                    }
                }
 
                // 保存方法名以便onLeave使用
                this.methodName = method.name;
            },
            onLeave: function(retval) {
                console.log("Return value: "+ retval);
                // 可尝试解码返回值（如String、byte[]等）
                // 此处仅简单打印原始指针
            }
        });
 
        console.log("[+] Hook installed for "+ method.name);
    });
}
 
// 等待SO加载后执行
setImmediate(hookNativeMethods);
```

查看HOOK结果， 第二个和第三个是AES加密函数，第四个和第八个是我们要分析的sign加密函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fd6da14a8cb94495.webp)

这里也可以动态调试程序取出解密后的字符串覆盖到原so文件中静态未解密的部分，修复so文件。

如下图，修复so文件后就比较清晰了。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/94f37ac02a9f26da.webp)

在IDA中点击DCD sub_49864+1分析sign签名函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c8d680ca94b4203c.webp)

在函数sub_63BA8有两个核心函数sub_63B0C和sub_63A50

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7a01768bb155faed.webp)

sign的签名流程。

```
输入：URL、时间戳/随机数（int）
    ↓
构造 384 字节的二进制缓冲区（包含 URL、时间戳、固定盐值等）
    ↓
sub_63B0C（MD5算法）
    ↓
将 MD5 输出转换为 32 位小写十六进制字符串
    ↓
拼接固定前缀 "v2-"
    ↓
返回最终签名
```

在IDA中点击DCD sub_49B5A+1分析generateSign函数。通过对java层代码中的分析，登录时主要调用了i函数生成sign，而i函数中通过generateSign函数生成的sign。如下图generateSign也使用的ollvm混淆，插件去一下就行。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c35a7b222085e197.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/82764a4a94726e4e.webp)

generateSign中的最后一个函数sub_4F7F0：是反调试函数，通过检查TracedPid来反调试程序。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2bee0609f05d1d86.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/61cf7137d47b5101.webp)

generateSign也是对输入的URL等数据进行MD5加密然后返回。

至此，sign的加密流程也已经分析完毕，本人技术入门，如果文章有错误的地方，恳请大家能够指正。

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm)

* * *

## 评论

> **C0rr7ct · 2 楼**
> 
> 佬

> **ODcat · 3 楼**
> 
> > [C0rr7ct](https://bbs.kanxue.com/user-1073736.htm) 佬
> 
> 别搞，你才是佬

> **Imxz · 4 楼**
> 
> tql

> **hacker521 · 5 楼**
> 
> tql
