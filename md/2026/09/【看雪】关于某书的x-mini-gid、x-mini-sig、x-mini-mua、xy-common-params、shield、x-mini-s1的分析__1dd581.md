---
title: 【看雪】关于某书的x-mini-gid、x-mini-sig、x-mini-mua、xy-common-params、shield、x-mini-s1的分析
source: https://bbs.kanxue.com/thread-292840.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-02T17:39:21+08:00
trace_id: c8797f66-db1d-4339-9d87-7392d5d4174e
content_hash: 9ae4d6149ebdd2c4ff7399effbf3077209d1612a9f0aaf5d9b0926f274243664
status: synced
tags:
  - 看雪
  - Android逆向
  - Frida
series: null
feed_source: 看雪·逆向工程
ai_summary: 某书接口中 x-mini-sig、x-mini-s1、x-mini-mua、shield、xy-common-params 等请求头参数分别由 Native 层与 Java 层生成，可用 Frida hook OkHttp 与 RegisterNatives 定位。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3cf75244-d011-8123-b90b-e3537dc69e73
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 某书接口中 x-mini-sig、x-mini-s1、x-mini-mua、shield、xy-common-params 等请求头参数分别由 Native 层与 Java 层生成，可用 Frida hook OkHttp 与 RegisterNatives 定位。
> 
> - **分析路径：** 使用 LSPosed + JudyTrustMePro + Reqable 抓包，再通过 Frida hook `okhttp3.Request$Builder` 的 `addHeader/header` 和 `Headers$Builder` 的 `add/set`，根据调用栈锁定参数写入位置。
> - **生成位置划分：** `shield` 由 `com.xingin.shield.http.Native.intercept(Native Method)` 调用 `libxyass.so` 生成；`xy-common-params` 由 `msa.a0.intercept(SourceFile:623)` 在 Java 层生成，值为 Base64(query string)；`x-mini-mua`、`x-mini-sig`、`x-mini-s1` 均由 `libtiny.so` Native 层一次性生成。
> - **辅助工具：** JADX 反编译判断 App 使用 OkHttp3 / Cronet / Retrofit2；`frida_hook_libart` hook `RegisterNatives` 获取 Native 方法名称、签名与注册地址。
> - **关键判断依据：** 调用栈中标注 `Native Method` 且 `registerNatives.log` 能查到注册记录，说明参数在 Native 层生成；否则为 Java 层生成。

抓包用的是lsposed + judyTrustMePro + reqable 对接口进行抓包分析  
这里就拿note/imagefeed接口的请求来分析  
抓包后可以看到请求头中的不同参数和对应的值。这里需要注意四个参数，分别是x-mini-sig、x-mini-s1、x-mini-mua、shield、xy-common-params

## 2.分析这些参数的数据来源

抓到包后注意到四个参数都是在请求头中，那么可以在发起请求的时候会对请求的头部进行设置x-mini-sig、x-mini-s1、x-mini-mua、shield、xy-common-params 这四个参数和对于的值。所以可以在运行的时候可以hook这设置请求头的函数查看这个函数的入参和返回值、同时查看到这个函数是被谁调用了，一直向上找应该可以找到生成这些参数的地方。  
问题是如何找到hook点，hook到那个函数?这里就得回到app中了，看看这个是使用什么网络库发起请求的？ 这里可以使用jadx对apk进行反编译（有壳的话要先脱壳）后查看左侧的包名是否有常用的网络库的包名和常用类名，或者用jadx查询常用网络库的包名和常用类名来判断。这里可以借助ai来分析。 借助ai分析这个app的网络库有 OkHttp3 Cronet Retrofit2 等。这里可以使用reqable进行抓包，同时配置frida脚本去hook到okhttp3.Request$Builder的addHeader、header、add、set函数来判断是否是在这里设置x-mini-sig、x-mini-s1、x-mini-mua、shield、xy-common-params这些参数和值。  
我的frida脚本的部分hook日志如下：

```python
[*] Hook started at 2026-09-02T15:06:27.101350
[*] JS script loaded, entering Java.perform...
[*] Java.perform executing...
[*] okhttp3.Request$Builder found
[+] Request.Builder.addHeader/header hooks installed
[*] okhttp3.Headers$Builder found
 [+] Headers.Builder.add/set hooks installed
 [+] All hooks installed. Target: shield, xy-common-params, x-mini-mua, x-mini-sig, x-mini-gid, x-mini-s1

========== [header] ==========
 [PARAM] name  = x-mini-gid
 [PARAM] value = 7f6a51b2b8e754c7902eff82c283b697360abec9473598e577028a1d
 [STACK]
   dalvik.system.VMStack.getThreadStackTrace(Native Method)
  java.lang.Thread.getStackTrace(Thread.java:1720)
  okhttp3.Request$Builder.header(Native Method)
  wjb.p.a(SourceFile:190)
  wjb.p.intercept(SourceFile:310)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  z52.c.intercept(SourceFile:22)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  z52.b.intercept(SourceFile:22)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  r3c.c.intercept(SourceFile:23)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  z1c.j.intercept(SourceFile:31)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  osa.a.intercept(SourceFile:31)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  z1c.n3.intercept(SourceFile:23)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  zza.m.intercept(SourceFile:51)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  zza.i.intercept(SourceFile:51)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  gr7.b.intercept(SourceFile:22)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  a2c.t.intercept(SourceFile:277)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  a2c.h.intercept(SourceFile:354)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  a2c.m.intercept(SourceFile:228)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  a2c.q.intercept(SourceFile:396)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  wjb.c.intercept(SourceFile:28)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  msa.r.intercept(SourceFile:1169)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  c3c.e$a.intercept(SourceFile:159)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  r3c.l.intercept(SourceFile:176)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  msa.c0.intercept(SourceFile:98)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:8)
  okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
  okhttp3.RealCall.getResponseWithInterceptorChain(SourceFile:121)
  okhttp3.RealCall.execute(SourceFile:29)
  retrofit2.OkHttpCall.execute(SourceFile:21)
  ora.b.h(SourceFile:120)
  io.reactivex.Observable.subscribe(SourceFile:13)
  ora.c.h(SourceFile:24)
  io.reactivex.Observable.subscribe(SourceFile:13)
  qlc.n0.h(SourceFile:18)
  io.reactivex.Observable.subscribe(SourceFile:13)
  qlc.z3$b.run(SourceFile:7)
  bsa.a.run(SourceFile:84)
  ch9.a.run(SourceFile:22)
  java.util.concurrent.Executors$RunnableAdapter.call(Executors.java:462)
  java.util.concurrent.FutureTask.run(FutureTask.java:266)
  twa.g.q(SourceFile:13)
  twa.l.q(SourceFile:168)
  twa.g.run(SourceFile:63)
  java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1167)
  java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:641)
  java.lang.Thread.run(Thread.java:919)
  b1b.a.run(SourceFile:13)
==================================

========== [Headers.Builder.set] ==========
[PARAM] name  = x-mini-gid
[PARAM] value = 7f6a51b2b8e754c7902eff82c283b697360abec9473598e577028a1d
[STACK]
dalvik.system.VMStack.getThreadStackTrace(Native Method)
  java.lang.Thread.getStackTrace(Thread.java:1720)
  okhttp3.Headers$Builder.set(Native Method)
  okhttp3.Request$Builder.header(SourceFile:3)
  okhttp3.Request$Builder.header(Native Method)
```

我的js脚本如下：

```python
/**
 * OkHttp Header Hook — 仅捕获目标请求头
 * 目标: shield, xy-common-params, x-mini-mua, x-mini-sig, x-mini-gid, x-mini-s1
 * 使用 send() 替代 console.log 确保消息传递
 */

var TARGET_HEADERS = ["shield", "xy-common-params", "x-mini-mua", "x-mini-sig", "x-mini-gid", "x-mini-s1"];

function isTarget(name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < TARGET_HEADERS.length; i++) {
        if (lower === TARGET_HEADERS[i]) {
            return true;
        }
    }
    return false;
}

function getStackTrace() {
    var Thread = Java.use("java.lang.Thread");
    var stack = Thread.currentThread().getStackTrace();
    var lines = [];
    for (var i = 0; i < stack.length; i++) {
        lines.push("  " + stack[i].toString());
    }
    return lines.join("\n");
}

send("[*] JS script loaded, entering Java.perform...");

Java.perform(function () {
    send("[*] Java.perform executing...");

    try {
        // Hook Request.Builder.addHeader(String, String)
        var RequestBuilder = Java.use("okhttp3.Request$Builder");
        send("[*] okhttp3.Request$Builder found");

        RequestBuilder.addHeader.overload("java.lang.String", "java.lang.String").implementation = function (name, value) {
            if (isTarget(name)) {
                send("\n========== [addHeader] ==========");
                send("[PARAM] name  = " + name);
                send("[PARAM] value = " + value);
                send("[STACK]");
                send(getStackTrace());
                send("==================================");
            }
            return this.addHeader(name, value);
        };

        RequestBuilder.header.overload("java.lang.String", "java.lang.String").implementation = function (name, value) {
            if (isTarget(name)) {
                send("\n========== [header] ==========");
                send("[PARAM] name  = " + name);
                send("[PARAM] value = " + value);
                send("[STACK]");
                send(getStackTrace());
                send("==================================");
            }
            return this.header(name, value);
        };

        send("[+] Request.Builder.addHeader/header hooks installed");

        // Hook Headers.Builder.add(String, String)
        var HeadersBuilder = Java.use("okhttp3.Headers$Builder");
        send("[*] okhttp3.Headers$Builder found");

        HeadersBuilder.add.overload("java.lang.String", "java.lang.String").implementation = function (name, value) {
            if (isTarget(name)) {
                send("\n========== [Headers.Builder.add] ==========");
                send("[PARAM] name  = " + name);
                send("[PARAM] value = " + value);
                send("[STACK]");
                send(getStackTrace());
                send("============================================");
            }
            return this.add(name, value);
        };

        HeadersBuilder.set.overload("java.lang.String", "java.lang.String").implementation = function (name, value) {
            if (isTarget(name)) {
                send("\n========== [Headers.Builder.set] ==========");
                send("[PARAM] name  = " + name);
                send("[PARAM] value = " + value);
                send("[STACK]");
                send(getStackTrace());
                send("============================================");
            }
            return this.set(name, value);
        };

        send("[+] Headers.Builder.add/set hooks installed");

    } catch (e) {
        send("[!] ERROR: " + e.toString());
        send("[!] Stack: " + e.stack);
    }

    send("[+] All hooks installed. Target: " + TARGET_HEADERS.join(", "));
});
```

根据hook的日志分析可以知道是使用那个函数设置的参数以及这函数的调用关系。

## 使用frida_hook_libart 去hook 到RegisterNatives 获取方法名称、签名、地址等关键信息

使用frida_hook_libart hook 到RegisterNatives生成日志registerNatives.log

## 基于 hook 日志的 Java vs Native 层分析

这里需要配合jadx 、registerNatives.log、还有前面hook的函数的日志来分析。

| 参数  | 生成位置 | 判断依据 |
| --- | --- | --- |
| `shield` | `com.xingin.shield.http.Native.intercept(Native Method)` | 堆栈标注 `Native Method` ； `registerNatives.log` 确认注册在 `libxyass.so` ；JADX源码： `public static native Response intercept(Interceptor.Chain chain, long j42)` |

| 参数  | 生成位置 | 判断依据 |
| --- | --- | --- |
| `xy-common-params` | `msa.a0.intercept(SourceFile:623)` | 堆栈无 `(Native Method)` ； `registerNatives.log` 无 ；值为base64(query string)，参数均为Android API/App配置/缓存值/计算 |

根据前面的frida的hook的okhttp函数的日志配合jadx分析，可以知道： `x-mini-mua` 、 `x-mini-sig` 、 `x-mini-s1` 均由 `libtiny.so` Native层一次性生成。

这里就已经知道了，这些参数的生成位置了。
