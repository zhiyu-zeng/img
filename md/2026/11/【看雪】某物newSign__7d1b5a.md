---
title: 【看雪】某物newSign
source: https://bbs.kanxue.com/thread-293591.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-19T08:56:06+08:00
trace_id: 2fb06361-d7eb-47c6-9ec1-116f332af6f2
content_hash: 69c16a1153a8da7fe444ce72d69fd11e502f316d7b23f45b9067bd1daacc2b63
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41d75244-d011-81d2-b66a-e068f708d6a0
ioc:
  cves: []
  cwes: []
  hashes:
    - bed0e113e1db1834ff36f3806d023a2f
  domains: []
  tools: []
  techniques: []
---

##### 某物newSing参数

不是最新版，尝试分析期间他更新了，我就没管了，顺便水一篇文章

###### 参数定位

```javascript
 Java.perform(function () {
        var Builder = Java.use("okhttp3.HttpUrl$Builder");
        Builder.addQueryParameter.implementation = function (name, value) {
            if (name === "newSign") {
                console.log("[newSign] value=" + value);
                console.log(Java.use("android.util.Log").getStackTraceString(
                    Java.use("java.lang.Throwable").$new()));
            }
            return this.addQueryParameter(name, value);
        };
    });
```

```python
[ ]-> [newSign] value=bed0e113e1db1834ff36f3806d023a2f
java.lang.Throwable
        at okhttp3.HttpUrl$Builder.addQueryParameter(Unknown Source)
        at lte.NCall.IL(Native Method)
        at com.shizhuang.duapp.common.helper.net.interceptor.HttpRequestInterceptor.intercept(Unknown Source:18)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:10)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
        at zt.a.intercept(SourceFile:71)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:10)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
        at ya.b.intercept(SourceFile:79)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:10)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
        at yu.b$a.intercept(SourceFile:168)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:10)
        at okhttp3.internal.http.RealInterceptorChain.proceed(SourceFile:1)
        at okhttp3.RealCall.getResponseWithInterceptorChain(SourceFile:121)
        at okhttp3.RealCall.execute(SourceFile:31)
        at retrofit2.OkHttpCall.execute(SourceFile:62)
        at retrofit2.adapter.rxjava2.CallExecuteObservable.subscribeActual(SourceFile:24)
        at io.reactivex.Observable.subscribe(SourceFile:8)
        at retrofit2.adapter.rxjava2.BodyObservable.subscribeActual(SourceFile:8)
        at io.reactivex.Observable.subscribe(SourceFile:8)
        at io.reactivex.internal.operators.observable.ObservableMap.subscribeActual(SourceFile:10)
        at io.reactivex.Observable.subscribe(SourceFile:8)
        at io.reactivex.internal.operators.observable.ObservableRetryWhen$RepeatWhenObserver.subscribeNext(SourceFile:25)
        at io.reactivex.internal.operators.observable.ObservableRetryWhen.subscribeActual(SourceFile:38)
        at io.reactivex.Observable.subscribe(SourceFile:8)
        at io.reactivex.internal.operators.observable.ObservableRetryBiPredicate$RetryBiObserver.subscribeNext(SourceFile:19)
        at io.reactivex.internal.operators.observable.ObservableRetryBiPredicate.subscribeActual(SourceFile:18)
        at io.reactivex.Observable.subscribe(SourceFile:8)
        at io.reactivex.internal.operators.observable.ObservableSubscribeOn$SubscribeTask.run(SourceFile:7)
        at io.reactivex.internal.schedulers.ScheduledDirectTask.call(SourceFile:3)
        at io.reactivex.internal.schedulers.ScheduledDirectTask.call(SourceFile:1)
        at java.util.concurrent.FutureTask.run(FutureTask.java:317)
        at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1154)
        at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:652)
        at java.lang.Thread.run(Thread.java:1563)
```

然后看一下方法，这个看名字应该是vmp

```java
public class NCall	// class@002c08 from classes18.dex
{
    static {
       System.loadLibrary("GameVMP");
    }
    public void NCall(){
       super();
    }
    public static native byte IB(Object[] p0);
    public static native char IC(Object[] p0);
    public static native double ID(Object[] p0);
    public static native float IF(Object[] p0);
    public static native int II(Object[] p0);
    public static native long IJ(Object[] p0);
    public static native Object IL(Object[] p0);
    public static native short IS(Object[] p0);
    public static native void IV(Object[] p0);
    public static native boolean IZ(Object[] p0);
    public static native int dI(int p0);
    public static native long dL(long p0);
    public static native String dS(String p0);
}
```

```python
name: IL, signature: ([Ljava/lang/Object;)Ljava/lang/Object;, fnPtr: 0x743584f7a8, modulename: libGameVMP.so -> base: 0x7435841000, offset: 0xe7a8
```

很清晰的可以看到第一个就是功能调用号

```python
NCall.IL is called: objArr=564,knGGXR0bR7LQn4eRCvJsdZ4D96wrRcYi2zPWWxLMOs3s2Ve8XQHJ8FnhXKhff51e1N0CGr8uesqOY1s0aUPs5T83GQIdL0v+JXn/3v/+bmU=
```

###### 函数分析

猜一下大概逻辑就是根据调用号初始化一个vmp的结构体，肯定有虚拟机字节码，和虚拟寄存器，然后吧参数放入虚拟寄存器，还有一个就是pc

![image-20261118202004722](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/19d1dec93af30d8f.png)

很明显看到明显的虚拟机指令分发

```python
.text&ARM.extab:000000000001931C A9 03 59 F8                 LDUR            X9, [X29,#var_70]
.text&ARM.extab:0000000000019320 0A 79 A9 B8                 LDRSW           X10, [X8,X9,LSL#2]
.text&ARM.extab:0000000000019324 48 01 08 8B                 ADD             X8, X10, X8
.text&ARM.extab:0000000000019328 00 01 1F D6                 BR              X8      ; switch jump
```

![image-20261118202239440](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/182d6721618708b0.png)

然后上trace

```python
[JNI] GetArrayLength(array=0x744b07ed08)
jsize GetArrayLength(JNIEnv *env, jarray array);
return x0 = 0x2 (2)
```

```python
[JNI] GetObjectArrayElement(array=0x744b07ed08, index=0)
jobject GetObjectArrayElement(JNIEnv *env, jobjectArray array, jsize index);
return x0 = 0x7754c2f605
```

```python
[JNI] CallIntMethodV(env=0x7664fd54d0, obj=0x7754c2f605, methodID=0x6f857e98, args=[0x7664fd54d0, 0x744b07ed08, 0x744b07ed08, 0x1])
jint CallIntMethodV(JNIEnv *env, jobject obj, jmethodID methodID, va_list args);
obj = java.lang.ClassLoader trace工具有bug不管他
method = intValue
return x0 = 0x234 (564)
```

这个就是我们的入参，前面说过按照正常逻辑这个会放入虚拟寄存器

```python
[JNI] GetObjectArrayElement(array=0x744b07ed08, index=1)
jobject GetObjectArrayElement(JNIEnv *env, jobjectArray array, jsize index);
return x0 = 0x7754c2f605
```

所以就找到这一段0x75e4fd9c30就是虚拟寄存器，每个槽8字节，放入索引0x9

```python
0x7435874e3c	0x2ae3c				orr	x9, xzr, #0x8	;X9=0x4 -> 0x8
0x7435874e40	0x2ae40				mul	x9, x2, x9	;X9=0x8 -> 0x48, X2=0x9
0x7435874e44	0x2ae44				add	x9, x0, x9	;X9=0x48 -> 0x75e4fd9c78, X0=0x75e4fd9c30
0x7435874e48	0x2ae48				str	x8, [x9]	;X8=0x7754c2f605, X9=0x75e4fd9c78
```

然后根据分发器跟踪指令流，根据这个位置向上查找，x9这么来的，所以可以看出0x762506ad50应该就是虚拟机指令流，frida hook这里直接dump x13 多dump点就行了,别管多长

```python
ldrb	w14, [x13]	;W14=0x762506ad50 -> 0x71, X13=0x744ae53a40
省略
ldrsw	x10, [x8, x9, lsl #2]	;X10=0x44 -> 0xfffffffffffbf0bc, X8=0x74358a53e0, X9=0x44
```

这里0x234就是调用号同时充当解密因子,这里pc等于0

```python
>>> hex(((0x234 ^ 0x71)^pc) & 0xFF -1)
'0x44'
```

pc根据取指令情况大概也能定位到也是蛮明显的

```python
0x7435871ab0	0x27ab0				add	x10, x8, x9	;X10=0x762506ad78 -> 0x3, X8=0x0, X9=0x3
```

然后就是分析opcode，这个以前有篇文章讲了，这就不说了，不过有区别的是这个vmp method class field等信息都在一个叫libGameVData.so的文件里面通过解密后在jni_onload里面组装出对应的结构体，供vmp使用

根据trace写出对应的解释器

看一下发现有md5，和对应的加密库

![image-20261118204843968](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ea9454b568da5ee9.png)

然后直接测一下，只能说盐巴都懒的加，哎

![image-20261118205035499](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a878a931e5aa9d8.png)

然后密文也是通过这个vmp计算的，565就是简单的将数据拼接还能很好理解的

```python
NCall.IL is called: objArr=565,{loginToken=, platform=android, timestamp=1794933730580, uuid=29afd, v=6.3.0}
NCall.IL result=loginTokenplatformandroidtimestamp1794933730580uuide0acda08f3829afdv6.3.0

NCall.IL is called: objArr=501,lication@e3965a0,loginTokenplatformandroidtimestamp1794933730580uuide0acda08f3829afdv6.3.0
NCall.IL result=knGGXR0bR7LQn4eRCvJsdZ4D96wrRcYi2zPWWxLMOs3s2Ve8XQHJ8FnhXKhff51e1N0CGr8uesqOY1s0aUPs5T83GQIdL0v+JXn/3v/+bmU=
```

看一下501，调用了encodebyte方法,然后看一下这个函数的参数，第一个就是入参，剩下那个一串0101感觉是固定的就没管了

![image-20261118205544129](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8c5af0f61f53a47f.png)

```python
public class DuHelper {
    public static ChangeQuickRedirect changeQuickRedirect;
    static {
        NCall.IV(new Object[]{0x1f4}); 这个走vmp形同滚木，
    }
    public static native int checkSignature(Object obj);
    public static String doWork(Object obj, String str) {
        return (String) NCall.IL(new Object[]{0x1f5, obj, str});
    }
    public static native String encodeByte(byte[] bArr, String str);
    public static native String getByteValues();
    public static native String getLeanCloudAppID();
    public static native String getLeanCloudAppKey();
    public static native String getWxAppId(Object obj);
    public static native String getWxAppKey();
}
```

```python
name: encodeByte, signature: ([BLjava/lang/String;)Ljava/lang/String;, fnPtr: 0x73c006a774, modulename: libdewuhelper.so -> base: 0x73c0069000, offset: 0x1774
```

然后就是so函数名字都还在void \*Value这个就是key'，然后fridahook一下就行了

```python
ptr_2 = j_AES_128_ECB_PKCS5Padding_Encrypt(ptr, Value);
__int64 __fastcall AES128_ECB_encrypt(unsigned __int8 *a1, void *Value, int8x16_t *a3)
```

![image-20261118210257825](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e44a052f773698f7.png)

完结撒花
