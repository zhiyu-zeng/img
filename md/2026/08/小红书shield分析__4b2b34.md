---
title: 小红书shield分析
source: https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/
source_host: yuuki.cool
clip_date: 2026-08-04T10:49:20+08:00
trace_id: c9318ec8-4c81-4e07-8ed2-0ec447477a14
content_hash: e6b8b467b592f2af47111fbbe7ac24d080a30fd85cfa901f0b264fea9c5553fd
status: synced
tags:
  - Android逆向
  - 协议分析
series: null
feed_source: Yuuki·移动安全
ai_summary: Shield 签名参数由修改过的 AES、HMAC-MD5 和标准 RC4、Base64 组合生成，原始数据依赖设备 ID、应用版本号和本地存储的 HMAC 密钥。
ai_summary_style: key-points
images_status:
  total: 34
  succeeded: 0
  failed_urls:
    - ./1.png
    - ./2.png
    - ./3.png
    - ./4.png
    - ./5.png
    - ./6.png
    - ./7.png
    - ./8.png
    - ./9.png
    - ./10.png
    - ./11.png
    - ./12.png
    - ./13.png
    - ./14.png
    - ./15.png
    - ./16.png
    - ./17.png
    - ./18.png
    - ./19.png
    - ./20.png
    - ./21.png
    - ./22.png
    - ./23.png
    - ./24.png
    - ./25.png
    - ./26.png
    - ./27.png
    - ./28.png
    - ./29.png
    - ./30.png
    - ./31.png
    - ./32.png
    - ./33.png
    - ./34.png
notion_page_id: 3b275244-d011-819b-b55b-ccefa628a3e4
ioc:
  cves: []
  cwes: []
  hashes:
    - "00000000000000000000000000000000"
    - 079ceafb42ab295ff1af31e9dcfdb276
    - 08b0999adc2621bc740de35b42716458
    - 097f4b9e3be0a8be639c9ce5f4478728
    - 0b11f6632846fbb87058edd4e5285168
    - 13a9b2009f6d3722245d1b201982db0e
    - 18a5f5457839ff68282a91c4c8497983
    - 1b7c1fa84f9c2c1b04bbbb2aa16e187f
    - 1bbbc2f0de84ed1630ec634070c3b362
    - 20bb49c9a9a33c97016f862146a89c3e
    - 22619d6d6556acc41c39e5fd442229f4
    - 2391e90a328d7d9e29b58b37a6e9e379
    - 253ed5b49626595e317df22a9da0e159
    - 261378627e9b0285011922237d4e3767
    - 2ac61747134610a9019516fd62251ef6
    - 2b02a2acdb13623bc44b3d69b501dd69
    - 2d4077e59957a929347adc564254a190
    - 2e78e6707d75491678e5da9b283878a7
    - 340618008cf43c8a10c020c55de9d177
    - 39d0dcd9e588dce6051d8c04f97ca21f
    - 3df7798f10b205454d00aa228ccb2704
    - 43d7feda9b1b909b055506e5e5fc9dbf
    - 4c59afdaf67905df56604e9d7c980a58
    - 4f7e99f9144399a9827e53c5a1110845
    - 5192356b16181dc583c59dd2f7302705
    - 5314740291e621d2c9fb13e2e6cd6122
    - 59a7513d029ae66079e77a8da1b56094
    - 5d78883c2da497543c635ee702e2914d
    - 5ee654bf6bb57fbc42fb57273b1ec8b1
    - 612afbe22d15f60afc40c532be2281e4
    - 62a42148bd56adbe0750cf08ddabc667
    - 64019c2e78653447637332d5ef164556
    - 73dc35f7254a1e99f5f892f481976052
    - 74ca93f24e9acdbc6e46e86568b2208d
    - 79a41bd7db811024d9881068aff7149b
    - 79caad7777f928a301ba2bea5630f23e
    - 7d24eff5d15d848592cc0c85e02699f9
    - 831024ccc7f89d9b8f113c5e72e6ef4b
    - 872f30250336005a140f9187edcf71e5
    - 91d67c9744eabca4a9cfdc4b70bcbcbe
    - 970dd5f2ed145a4205e977a2f9a377f2
    - 9e6319a621091449eece1dc1af0f1cf5
    - a3533bd74703d8a625a01361d62c3a1b
    - a6c78cc4444749c9ebe8e5f759b94ba9
    - a72394ab39a093f5c3595b6597ff2a45
    - aac7f6e95d103fd6d60757c34239fcff
    - aafb74d7a512f77fe8ec334314f77291
    - b15b1fffbed71c8822616666936166f6
    - b3e3b3d117d5d06a96da8563f034039a
    - babee4f868c3e3c94b9b5781b0d71460
    - c1e6f2aa25984b3317d3d02a7aa4eef0
    - c2064dabfa1ba6dfbb17c6178e16b8a8
    - c3190b7914a7bc0205d16a58043e3ffb
    - c4b3323f96114a3b7656cd037b5b38b6
    - c64af4b11a1076b698e14cffbbb481c9
    - c67e8c28604bccf6fa27acea9510ecd4
    - d5872b07a0e30a6ccb7a72c7e225c576
    - d9126f629a4c2a9240b340c0515a5e26
    - e05a6b7b72334efc67d62b154b5502ba
    - e70d918a819fa381b66f003803015d01
    - e773d038d20950bad0c0e2f7859f8f23
    - ef3a2bc9806e3b63a6d3f6b0a98215d7
    - fefad908457c90e5646cf1643d70295e
    - ff13ab6158bdd61953cdab36153843ae
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Shield 签名参数由修改过的 AES、HMAC-MD5 和标准 RC4、Base64 组合生成，原始数据依赖设备 ID、应用版本号和本地存储的 HMAC 密钥。
> 
> - **定位切入点：** 通过 Hook `NewStringUTF` 可快速定位到 Shield 参数生成的 Native 层代码，关联的 SO 文件为 `libxyass.so`，该文件结构被破坏。
> - **核心加密发现：** 参数生成过程中使用了一系列非标准加密算法，包括一个魔改的 AES 解密（密钥由 `deviceId` 和固定数据派生）、魔改的 HMAC-MD5 运算以及标准的 RC4（`std::abort` 作为密钥）和 Base64 编码。
> - **完整算法还原：** 还原了完整的运算链：从 SharedPreferences 读取并 Base64 解码 `main_hmac`；将 `deviceId` 与固定数据拼接后进行密钥拓展；对解码后的数据进行魔改 AES 解密；对结果进行魔改 HMAC-MD5 运算；将运算结果与 `Build` 和 `deviceId` 拼接后进行 RC4 加密；最后对加密后的数据拼接长度校验头并进行标准 Base64 编码，并在最前端添加“XY”标识。

## 0x00 前言

版本号: 8420294

工具: jadx, ida, unidbg

本文所有调试前数据均来自 [这篇文章](https://bbs.kanxue.com/thread-285929.htm) ，我就一个小红书好，自己hook拿数据怕被封号qaq，没看过这篇文章的也可以先看看，大佬写的很好

## 0x10 定位

定位啥的就不说了，直接hook `NewStringUTF` 就能定位到，但是它的so的名字是改过的，这个可以从内存里dump，然后看大小，去包里找对应大小的so，我是不喜欢用dump出来的so的

## 0x20 补环境

补环境，补完长这样，过程就不细说了，dddd

```java
package com.yuuki.xhs;

import com.github.unidbg.AndroidEmulator;
import com.github.unidbg.Module;
import com.github.unidbg.arm.backend.Unicorn2Factory;
import com.github.unidbg.linux.android.AndroidEmulatorBuilder;
import com.github.unidbg.linux.android.AndroidResolver;
import com.github.unidbg.linux.android.dvm.*;
import com.github.unidbg.linux.android.dvm.array.ByteArray;
import com.github.unidbg.memory.Memory;
import com.yuuki.YuukiUtils.StringUtils;
import okhttp3.Headers;
import okhttp3.Request;
import okio.Buffer;

import java.io.File;
import java.nio.charset.Charset;

public class book extends AbstractJni {
    private final String packageName = "com.xingin.xhs";
    private final String apkName = "xhs";
    private final String libName = "libxyass.so";

    private final AndroidEmulator emulator;
    private final VM vm;
    private DalvikModule dm;
    private Module module;

    DvmClass XhsHttpInterceptor;

    public static Request request;

    public book() {
        emulator = AndroidEmulatorBuilder
                .for64Bit()
                .addBackendFactory(new Unicorn2Factory(true))
                .setProcessName(packageName)
                .build();
        Memory memory = emulator.getMemory();
        memory.setLibraryResolver(new AndroidResolver(23));
        vm = emulator.createDalvikVM(new File("apks/" + apkName +  "/" + apkName + ".apk"));
        vm.setVerbose(true);
        vm.setJni(this);
        dm = vm.loadLibrary(new File("apks/" + apkName +  "/" + libName), false);
        module = dm.getModule();
        dm.callJNI_OnLoad(emulator);

        XhsHttpInterceptor = vm.resolveClass("com.xingin.shield.http.XhsHttpInterceptor");
    }

    public void initializeNative() {
        XhsHttpInterceptor.callStaticJniMethodObject(emulator, "initializeNative()V");
    }

    public long initialize() {
        DvmObject<?> instance = XhsHttpInterceptor.newObject(null);
        return instance.callJniMethodLong(emulator, "initialize(Ljava/lang/String;)J", "main");
    }

    public void callShield(long initValue) {
        DvmObject<?> instance = XhsHttpInterceptor.newObject(null);
        DvmObject<?> chain = vm.resolveClass("okhttp3/Interceptor$Chain").newObject(null);
        instance.callJniMethodObject(emulator, "intercept(Lokhttp3/Interceptor$Chain;J)Lokhttp3/Response;", chain, initValue);
    }

    @Override
    public DvmObject<?> getStaticObjectField(BaseVM vm, DvmClass dvmClass, String signature) {
        switch (signature) {
            case "com/xingin/shield/http/ContextHolder->sLogger:Lcom/xingin/shield/http/ShieldLogger;" : {
                return vm.resolveClass("com/xingin/shield/http/ShieldLogger").newObject(null);
            }
            case "com/xingin/shield/http/ContextHolder->sDeviceId:Ljava/lang/String;" : {
                return new StringObject(vm, "0d7eee2c-5d77-3c26-99f8-a5a2c9e08aeb");
            }

        }
        return super.getStaticObjectField(vm, dvmClass, signature);
    }

    @Override
    public void callVoidMethodV(BaseVM vm, DvmObject<?> dvmObject, String signature, VaList vaList) {
        switch( signature) {
            case "com/xingin/shield/http/ShieldLogger->nativeInitializeStart()V": {
                return;
            }
        }
    }

    @Override
    public DvmObject<?> callStaticObjectMethodV(BaseVM vm, DvmClass dvmClass, String signature, VaList vaList) {
        switch (signature) {
            case "java/nio/charset/Charset->defaultCharset()Ljava/nio/charset/Charset;" : {
                return vm.resolveClass("java/nio/charset/Charset").newObject(Charset.defaultCharset());
            }
            case "com/xingin/shield/http/Base64Helper->decode(Ljava/lang/String;)[B" : {
                String input = vaList.getObjectArg(0).getValue().toString();
                return new ByteArray(vm, StringUtils.base64ToBytes(input));
            }
        }
        return super.callStaticObjectMethodV(vm, dvmClass, signature, vaList);
    }

    @Override
    public int getStaticIntField(BaseVM vm, DvmClass dvmClass, String signature) {
        switch (signature) {
            case "com/xingin/shield/http/ContextHolder->sAppId:I" : {
                return -319115519;
            }
        }
        return super.getStaticIntField(vm, dvmClass, signature);
    }

    @Override
    public DvmObject<?> callObjectMethodV(BaseVM vm, DvmObject<?> dvmObject, String signature, VaList vaList) {
        switch (signature) {
            case "android/content/Context->getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;": {
                return vm.resolveClass("android/content/SharedPreferences").newObject(null);
            }
            case "android/content/SharedPreferences->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;": {
                String key = vaList.getObjectArg(0).getValue().toString();
                System.out.println("get key:"+key);
                switch (key){
                    case "main":{
                        return new StringObject(vm, "");
                    }
                    case "main_hmac":{
                        return new StringObject(vm, "2s/EPZ9Xnk4cCZd5weXEd0DqcudY1yJwoQRV2cESN9+9HEVLiu6C72X5YfPYhiESrmuWLXe9U1BGSCIq7/DiMEWjsKmdlUEEbJGkmfTMN7xRJvuw2uqNpAewis/HKAQk");
                    }
                }
            }
            case "okhttp3/Interceptor$Chain->request()Lokhttp3/Request;": {
                return vm.resolveClass("okhttp3/Request").newObject(request);
            }
            case "okhttp3/Request->url()Lokhttp3/HttpUrl;": {
                return vm.resolveClass("okhttp3/HttpUrl").newObject(request.url());
            }
            case "okhttp3/HttpUrl->encodedPath()Ljava/lang/String;": {
                return new StringObject(vm, request.url().encodedPath());
            }
            case "okhttp3/HttpUrl->encodedQuery()Ljava/lang/String;": {
                if (request.url().encodedQuery() != null) {
                    return new StringObject(vm, request.url().encodedQuery());
                }
                return new StringObject(vm, "");
            }
            case "okhttp3/Request->body()Lokhttp3/RequestBody;": {
                return vm.resolveClass("okhttp3/RequestBody").newObject(request.body());
            }
            case "okhttp3/Request->headers()Lokhttp3/Headers;": {
                return vm.resolveClass("okhttp3/Headers").newObject(request.headers());
            }
            case "okio/Buffer->writeString(Ljava/lang/String;Ljava/nio/charset/Charset;)Lokio/Buffer;": {
                Buffer buffer = (Buffer) dvmObject.getValue();
                String input = vaList.getObjectArg(0).getValue().toString();
                Charset charset = (Charset) vaList.getObjectArg(1).getValue();
                Buffer newBuffer = buffer.writeString(input, charset);
                return vm.resolveClass("okio/Buffer").newObject(newBuffer);
            }
            case "okhttp3/Headers->name(I)Ljava/lang/String;": {
                return new StringObject(vm, ((Headers) dvmObject.getValue()).name(vaList.getIntArg(0)));
            }
            case "okhttp3/Headers->value(I)Ljava/lang/String;": {
                return new StringObject(vm, ((Headers) dvmObject.getValue()).value(vaList.getIntArg(0)));
            }
            case "okio/Buffer->clone()Lokio/Buffer;": {
                Buffer buffer = (Buffer) dvmObject.getValue();
                return vm.resolveClass("okio/Buffer").newObject(buffer.clone());
            }
            case "okhttp3/Request->newBuilder()Lokhttp3/Request$Builder;": {
                return vm.resolveClass("okhttp3/Request$Builder").newObject(request.newBuilder());
            }
            case "okhttp3/Request$Builder->header(Ljava/lang/String;Ljava/lang/String;)Lokhttp3/Request$Builder;": {
                Request.Builder builder = (Request.Builder) dvmObject.getValue();
                String name = vaList.getObjectArg(0).getValue().toString();
                String value = vaList.getObjectArg(1).getValue().toString();
                return vm.resolveClass("okhttp3/Request$Builder").newObject(builder.header(name, value));
            }
            case "okhttp3/Request$Builder->build()Lokhttp3/Request;": {
                Request.Builder builder = (Request.Builder) dvmObject.getValue();
                return vm.resolveClass("okhttp3/Request").newObject(builder.build());
            }
            case "okhttp3/Interceptor$Chain->proceed(Lokhttp3/Request;)Lokhttp3/Response;": {
                /*Interceptor.Chain chain = (Interceptor.Chain) dvmObject.getValue();
                try {
                    return vm.resolveClass("okhttp3/Response").newObject(chain.proceed(request));
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }*/
                return vm.resolveClass("okhttp3/Response").newObject(null);
            }

        }
        return super.callObjectMethodV(vm, dvmObject, signature, vaList);
    }

    @Override
    public DvmObject<?> newObjectV(BaseVM vm, DvmClass dvmClass, String signature, VaList vaList) {
        switch (signature) {
            case "okio/Buffer-><init>()V": {
                return dvmClass.newObject(new Buffer());
            }
        }
        return super.newObjectV(vm, dvmClass, signature, vaList);
    }

    @Override
    public int callIntMethodV(BaseVM vm, DvmObject<?> dvmObject, String signature, VaList vaList) {
        switch (signature) {
            case "okhttp3/Headers->size()I": {
                Headers headers = (Headers) dvmObject.getValue();
                return headers.size();
            }
            case "okio/Buffer->read([B)I": {
                byte[] bytes = (byte[]) vaList.getObjectArg(0).getValue();
                return ((Buffer) dvmObject.getValue()).read(bytes);
            }
            case "okhttp3/Response->code()I": {
                /*Response response = (Response) dvmObject.getValue();
                return response.code();*/
                return 200;
            }
        }
        return super.callIntMethodV(vm, dvmObject, signature, vaList);
    }

    public static void main(String[] args) {
        book book = new book();
        book.initializeNative();
        long initValue = book.initialize();
        System.out.println("initValue = " + initValue);

        request = new Request.Builder()
                .url("https://edith.xiaohongshu.com/api/sns/v6/message/detect")
                .addHeader("xy-direction", "49")
                .addHeader("xy-common-params", "fid=1722182473106fc84899565e2acf00656ae05a78764b&device_fingerprint=2023122411004376bd379fe6f54e6dc5ca0b0cf8d24dd601dc85661f97571b&device_fingerprint1=2023122411004376bd379fe6f54e6dc5ca0b0cf8d24dd601dc85661f97571b&cpu_name=Qualcomm+Technologies%2C+Inc+SDM845&gid=7c7ea0a5b61c5590cec3770efa9cfec6e81b439947359eeb775b6fc4&device_model=phone&launch_id=1722617914&tz=Asia%2FShanghai&channel=Guanfang&versionName=8.42.0&overseas_channel=0&deviceId=0d7eee2c-5d77-3c26-99f8-a5a2c9e08aeb&platform=android&sid=session.1722182426050852896201&identifier_flag=4&t=1722617846&project_id=ECFAAF&build=8420294&x_trace_page_current=&lang=zh-Hans&app_id=ECFAAF01&uis=light&teenager=0")
                .build();

        book.callShield(initValue);
    }
}
```

### 先跳过来看看

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/1.png)

跳掉对应地址发现没有数据，seg000段是被加密的， `ctrl + s` 发现也没有`.init_array` 节，说明这个so的结构是被破坏过的，这里直接用dump之后的吧

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/2.png)

可以看到`.init_array` 里做了很多字符串解密以及一些内存解密操作，这里就不详细分析了，如果是patch so的节表信息的话，可能会看不见`.init_array` ，不过这里本来也不打算分析这一块，所以都问题不大

### 初步定位

直接跳到对应位置

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/3.png)

看的出来是经过了混淆

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/4.png)

可以看到这里应该只是通过反射发送请求，并不是参数生成的第一现场

## 0x30 分析

去unidbg里下个断点，看看生成的位置

### Base64 确认

```yaml
mx1 0x90

>-----------------------------------------------------------------------------<
[15:03:11 345]x1=RW@0x40461018, md5=a3533bd74703d8a625a01361d62c3a1b, hex=58594141414141514141414145414141425441414141557a5557456530784731496244392f632b71434c4f6c4b476d547446612b6c473433344b6675465554616c436b59506c792b4e6c48353339712b64597a384e353373742b324b746b474177664644534b4e374b6833434d78303759766235676e796e6879494e2f67624d6e6d394f506200000000000000000000
size: 144
0000: 58 59 41 41 41 41 41 51 41 41 41 41 45 41 41 41    XYAAAAAQAAAAEAAA
0010: 42 54 41 41 41 41 55 7A 55 57 45 65 30 78 47 31    BTAAAAUzUWEe0xG1
0020: 49 62 44 39 2F 63 2B 71 43 4C 4F 6C 4B 47 6D 54    IbD9/c+qCLOlKGmT
0030: 74 46 61 2B 6C 47 34 33 34 4B 66 75 46 55 54 61    tFa+lG434KfuFUTa
0040: 6C 43 6B 59 50 6C 79 2B 4E 6C 48 35 33 39 71 2B    lCkYPly+NlH539q+
0050: 64 59 7A 38 4E 35 33 73 74 2B 32 4B 74 6B 47 41    dYz8N53st+2KtkGA
0060: 77 66 46 44 53 4B 4E 37 4B 68 33 43 4D 78 30 37    wfFDSKN7Kh3CMx07
0070: 59 76 62 35 67 6E 79 6E 68 79 49 4E 2F 67 62 4D    Yvb5gnynhyIN/gbM
0080: 6E 6D 39 4F 50 62 00 00 00 00 00 00 00 00 00 00    nm9OPb..........
^-----------------------------------------------------------------------------^
```

`traceWrite` 一下 `0x40461018` 到 `0x40461018 + 0x86`

```kotlin
[15:07:46 455] Memory WRITE at 0x4046101a, data size = 8, data value = 0x4141514141414141, PC=RX@0x4028c1f8[libc.so]0x1c1f8, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x40461022, data size = 8, data value = 0x5442414141454141, PC=RX@0x4028c1f8[libc.so]0x1c1f8, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x40461022, data size = 8, data value = 0x5442414141454141, PC=RX@0x4028c220[libc.so]0x1c220, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x4046102a, data size = 8, data value = 0x57557a5541414141, PC=RX@0x4028c220[libc.so]0x1c220, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x40461032, data size = 8, data value = 0x6249314778306545, PC=RX@0x4028c224[libc.so]0x1c224, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x4046103a, data size = 8, data value = 0x4c43712b632f3944, PC=RX@0x4028c224[libc.so]0x1c224, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x40461042, data size = 8, data value = 0x4674546d474b6c4f, PC=RX@0x4028c228[libc.so]0x1c228, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x4046104a, data size = 8, data value = 0x4b343334476c2b61, PC=RX@0x4028c228[libc.so]0x1c228, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x40461052, data size = 8, data value = 0x436c615455467566, PC=RX@0x4028c22c[libc.so]0x1c22c, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x4046105a, data size = 8, data value = 0x6c4e2b796c50596b, PC=RX@0x4028c22c[libc.so]0x1c22c, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x40461062, data size = 8, data value = 0x59642b7139333548, PC=RX@0x4028c17c[libc.so]0x1c17c, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x4046106a, data size = 8, data value = 0x2b747333354e387a, PC=RX@0x4028c17c[libc.so]0x1c17c, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 456] Memory WRITE at 0x40461072, data size = 8, data value = 0x667741476b744b32, PC=RX@0x4028c184[libc.so]0x1c184, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 457] Memory WRITE at 0x4046107a, data size = 8, data value = 0x684b374e4b534446, PC=RX@0x4028c184[libc.so]0x1c184, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 457] Memory WRITE at 0x40461082, data size = 8, data value = 0x76593730784d4333, PC=RX@0x4028c18c[libc.so]0x1c18c, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 457] Memory WRITE at 0x4046108a, data size = 8, data value = 0x79686e796e673562, PC=RX@0x4028c18c[libc.so]0x1c18c, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 457] Memory WRITE at 0x4046108e, data size = 8, data value = 0x672f4e4979686e79, PC=RX@0x4028c1a4[libc.so]0x1c1a4, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 457] Memory WRITE at 0x40461096, data size = 8, data value = 0x62504f396d6e4d62, PC=RX@0x4028c1a4[libc.so]0x1c1a4, LR=RX@0x4009f0f0[libshield.so]0x9f0f0
[15:07:46 457] Memory WRITE at 0x4046109e, data size = 1, data value = 0x00, PC=RX@0x4009f038[libshield.so]0x9f038, LR=RX@0x4009f120[libshield.so]0x9f120
[15:07:46 457] Memory WRITE at 0x40461018, data size = 2, data value = 0x5958, PC=RX@0x4028c1cc[libc.so]0x1c1cc, LR=RX@0x4009f78c[libshield.so]0x9f78c
```

去libc.so里看看

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/5.png)

可以看到是 `memcpy` 函数，hook看看数据来自哪里

```java
public void hookMemcpy() {
       Debugger debugger = emulator.attach();
       debugger.addBreakPoint(module.findSymbolByName("memcpy").getAddress(), (emulator, address) -> {
           RegisterContext context = emulator.getContext();
           UnidbgPointer arg0 = context.getPointerArg(0);
           UnidbgPointer arg1 = context.getPointerArg(1);
           int arg2 = context.getIntArg(2);
           Inspector.inspect(
                   arg1.getByteArray(0, arg2),
                   "memcpy" + " 写入地址 " + "0x" + Long.toHexString(arg0.peer) + " 读取地址 " + "0x" + Long.toHexString(arg1.peer)
           );
           return true;
       });
   }

   public void hookMemmove() {
       Debugger debugger = emulator.attach();
       debugger.addBreakPoint(module.findSymbolByName("memmove").getAddress(), (emulator, address) -> {
           RegisterContext context = emulator.getContext();

           UnidbgPointer dst = context.getPointerArg(0);
           UnidbgPointer src = context.getPointerArg(1);
           int length = context.getIntArg(2);

           Inspector.inspect(
                   src.getByteArray(0, length),
                   "memmove 写入地址 0x" + Long.toHexString(dst.peer) +
                           " 读取地址 0x" + Long.toHexString(src.peer)
           );

           return true;
       });
   }
```

### 内存写入来源追踪

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/6.png)

继续 `traceWrite` `0x4059a018` 到 `0x4059a018 + 0x84`

```kotlin
[15:23:45 649] Memory WRITE at 0x4059a018, data size = 1, data value = 0x41, PC=RX@0x4004bfac[libshield.so]0x4bfac, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 649] Memory WRITE at 0x4059a01b, data size = 1, data value = 0x41, PC=RX@0x4004bfc4[libshield.so]0x4bfc4, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 649] Memory WRITE at 0x4059a019, data size = 1, data value = 0x41, PC=RX@0x4004bfc8[libshield.so]0x4bfc8, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 649] Memory WRITE at 0x4059a01a, data size = 1, data value = 0x41, PC=RX@0x4004bfcc[libshield.so]0x4bfcc, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 649] Memory WRITE at 0x4059a01c, data size = 1, data value = 0x41, PC=RX@0x4004bfac[libshield.so]0x4bfac, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 650] Memory WRITE at 0x4059a01f, data size = 1, data value = 0x41, PC=RX@0x4004bfc4[libshield.so]0x4bfc4, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 650] Memory WRITE at 0x4059a01d, data size = 1, data value = 0x51, PC=RX@0x4004bfc8[libshield.so]0x4bfc8, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 650] Memory WRITE at 0x4059a01e, data size = 1, data value = 0x41, PC=RX@0x4004bfcc[libshield.so]0x4bfcc, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 650] Memory WRITE at 0x4059a020, data size = 1, data value = 0x41, PC=RX@0x4004bfac[libshield.so]0x4bfac, LR=RX@0x40049b98[libshield.so]0x49b98
[15:23:45 650] Memory WRITE at 0x4059a023, data size = 1, data value = 0x41, PC=RX@0x4004bfc4[libshield.so]0x4bfc4, LR=RX@0x40049b98[libshield.so]0x49b98
.....

>-----------------------------------------------------------------------------<
[15:23:45 658]memcpy 写入地址 0x4046101a 读取地址 0x4059a018, md5=c1e6f2aa25984b3317d3d02a7aa4eef0, hex=4141414141514141414145414141425441414141557a5557456530784731496244392f632b71434c4f6c4b476d547446612b6c473433344b6675465554616c436b59506c792b4e6c48353339712b64597a384e353373742b324b746b474177664644534b4e374b6833434d78303759766235676e796e6879494e2f67624d6e6d394f5062
size: 132
0000: 41 41 41 41 41 51 41 41 41 41 45 41 41 41 42 54    AAAAAQAAAAEAAABT
0010: 41 41 41 41 55 7A 55 57 45 65 30 78 47 31 49 62    AAAAUzUWEe0xG1Ib
0020: 44 39 2F 63 2B 71 43 4C 4F 6C 4B 47 6D 54 74 46    D9/c+qCLOlKGmTtF
0030: 61 2B 6C 47 34 33 34 4B 66 75 46 55 54 61 6C 43    a+lG434KfuFUTalC
0040: 6B 59 50 6C 79 2B 4E 6C 48 35 33 39 71 2B 64 59    kYPly+NlH539q+dY
0050: 7A 38 4E 35 33 73 74 2B 32 4B 74 6B 47 41 77 66    z8N53st+2KtkGAwf
0060: 46 44 53 4B 4E 37 4B 68 33 43 4D 78 30 37 59 76    FDSKN7Kh3CMx07Yv
0070: 62 35 67 6E 79 6E 68 79 49 4E 2F 67 62 4D 6E 6D    b5gnynhyIN/gbMnm
0080: 39 4F 50 62                                        9OPb
^-----------------------------------------------------------------------------^
```

跳到pc的位置

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/7.png)

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/8.png)

很明显的 `Base64` ，下个断点验证一下

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/9.png)

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/10.png)

可以看到一模一样，说明就是标准Base64无疑了，改一下函数名和参数表

```
void __fastcall Base64(_BYTE *buffer, __int64 input, int len)
```

现在则需要关注 `input` 的来源，unidbg中可以看到 `x1=0x40456098` ，依旧 `traceWrite` 一下

### Base64 输入定位

```
emulator.traceWrite(0x40456098, 0x40456098 + 0x63);
```

然后可以看到实际上是 `memcpy` 写入的，刚刚hook了这个函数

```
>-----------------------------------------------------------------------------<
[15:56:13 237]memcpy 写入地址 0x40456098 读取地址 0x40593000, md5=c2064dabfa1ba6dfbb17c6178e16b8a8, hex=00000001000000010000005300000053351611ed311b521b0fdfdcfaa08b3a5286993b456be946e37e0a7ee1544da9429183e5cbe3651f9dfdabe758cfc379decb7ed8ab64180c1f14348a37b2a1dc2331d3b62f6f9827ca787220dfe06cc9e6f4e3db
size: 99
0000: 00 00 00 01 00 00 00 01 00 00 00 53 00 00 00 53    ...........S...S
0010: 35 16 11 ED 31 1B 52 1B 0F DF DC FA A0 8B 3A 52    5...1.R.......:R
0020: 86 99 3B 45 6B E9 46 E3 7E 0A 7E E1 54 4D A9 42    ..;Ek.F.~.~.TM.B
0030: 91 83 E5 CB E3 65 1F 9D FD AB E7 58 CF C3 79 DE    .....e.....X..y.
0040: CB 7E D8 AB 64 18 0C 1F 14 34 8A 37 B2 A1 DC 23    .~..d....4.7...#
0050: 31 D3 B6 2F 6F 98 27 CA 78 72 20 DF E0 6C C9 E6    1../o.'.xr ..l..
0060: F4 E3 DB                                           ...
^-----------------------------------------------------------------------------^
```

接着跟踪 `0x40593000`

```haskell
[15:59:31 993] Memory WRITE at 0x40593000, data size = 1, data value = 0x00, PC=RX@0x4004972c[libshield.so]0x4972c, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 993] Memory WRITE at 0x40593001, data size = 1, data value = 0x00, PC=RX@0x40049734[libshield.so]0x49734, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 993] Memory WRITE at 0x40593002, data size = 1, data value = 0x00, PC=RX@0x40049740[libshield.so]0x49740, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 993] Memory WRITE at 0x40593003, data size = 1, data value = 0x01, PC=RX@0x40049748[libshield.so]0x49748, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 993] Memory WRITE at 0x40593004, data size = 1, data value = 0x00, PC=RX@0x40049750[libshield.so]0x49750, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 993] Memory WRITE at 0x40593005, data size = 1, data value = 0x00, PC=RX@0x40049758[libshield.so]0x49758, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 993] Memory WRITE at 0x40593006, data size = 1, data value = 0x00, PC=RX@0x40049764[libshield.so]0x49764, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 993] Memory WRITE at 0x40593007, data size = 1, data value = 0x01, PC=RX@0x4004976c[libshield.so]0x4976c, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 994] Memory WRITE at 0x40593008, data size = 1, data value = 0x00, PC=RX@0x40049774[libshield.so]0x49774, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 994] Memory WRITE at 0x40593009, data size = 1, data value = 0x00, PC=RX@0x4004977c[libshield.so]0x4977c, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 994] Memory WRITE at 0x4059300a, data size = 1, data value = 0x00, PC=RX@0x40049788[libshield.so]0x49788, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 994] Memory WRITE at 0x4059300b, data size = 1, data value = 0x53, PC=RX@0x40049790[libshield.so]0x49790, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 994] Memory WRITE at 0x4059300c, data size = 1, data value = 0x00, PC=RX@0x40049798[libshield.so]0x49798, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 994] Memory WRITE at 0x4059300d, data size = 1, data value = 0x00, PC=RX@0x400497a0[libshield.so]0x497a0, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 994] Memory WRITE at 0x4059300e, data size = 1, data value = 0x00, PC=RX@0x400497ac[libshield.so]0x497ac, LR=RX@0x400496e4[libshield.so]0x496e4
[15:59:31 995] Memory WRITE at 0x4059300f, data size = 1, data value = 0x53, PC=RX@0x400497b4[libshield.so]0x497b4, LR=RX@0x400496e4[libshield.so]0x496e4

>-----------------------------------------------------------------------------<
[15:59:31 995]memcpy 写入地址 0x40593010 读取地址 0x4045e060, md5=340618008cf43c8a10c020c55de9d177, hex=351611ed311b521b0fdfdcfaa08b3a5286993b456be946e37e0a7ee1544da9429183e5cbe3651f9dfdabe758cfc379decb7ed8ab64180c1f14348a37b2a1dc2331d3b62f6f9827ca787220dfe06cc9e6f4e3db
size: 83
0000: 35 16 11 ED 31 1B 52 1B 0F DF DC FA A0 8B 3A 52    5...1.R.......:R
0010: 86 99 3B 45 6B E9 46 E3 7E 0A 7E E1 54 4D A9 42    ..;Ek.F.~.~.TM.B
0020: 91 83 E5 CB E3 65 1F 9D FD AB E7 58 CF C3 79 DE    .....e.....X..y.
0030: CB 7E D8 AB 64 18 0C 1F 14 34 8A 37 B2 A1 DC 23    .~..d....4.7...#
0040: 31 D3 B6 2F 6F 98 27 CA 78 72 20 DF E0 6C C9 E6    1../o.'.xr ..l..
0050: F4 E3 DB                                           ...
^-----------------------------------------------------------------------------^
[15:59:31 995] Memory WRITE at 0x40593010, data size = 8, data value = 0x1b521b31ed111635, PC=RX@0x4028c220[libc.so]0x1c220, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 995] Memory WRITE at 0x40593018, data size = 8, data value = 0x523a8ba0fadcdf0f, PC=RX@0x4028c220[libc.so]0x1c220, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 995] Memory WRITE at 0x40593020, data size = 8, data value = 0xe346e96b453b9986, PC=RX@0x4028c224[libc.so]0x1c224, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 995] Memory WRITE at 0x40593028, data size = 8, data value = 0x42a94d54e17e0a7e, PC=RX@0x4028c224[libc.so]0x1c224, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 995] Memory WRITE at 0x40593030, data size = 8, data value = 0x9d1f65e3cbe58391, PC=RX@0x4028c228[libc.so]0x1c228, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 995] Memory WRITE at 0x40593038, data size = 8, data value = 0xde79c3cf58e7abfd, PC=RX@0x4028c228[libc.so]0x1c228, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 995] Memory WRITE at 0x40593040, data size = 8, data value = 0x1f0c1864abd87ecb, PC=RX@0x4028c22c[libc.so]0x1c22c, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 995] Memory WRITE at 0x40593048, data size = 8, data value = 0x23dca1b2378a3414, PC=RX@0x4028c22c[libc.so]0x1c22c, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 996] Memory WRITE at 0x40593050, data size = 8, data value = 0xca27986f2fb6d331, PC=RX@0x4028c18c[libc.so]0x1c18c, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 996] Memory WRITE at 0x40593058, data size = 8, data value = 0xe6c96ce0df207278, PC=RX@0x4028c18c[libc.so]0x1c18c, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 996] Memory WRITE at 0x40593053, data size = 8, data value = 0x207278ca27986f2f, PC=RX@0x4028c1a4[libc.so]0x1c1a4, LR=RX@0x400497dc[libshield.so]0x497dc
[15:59:31 996] Memory WRITE at 0x4059305b, data size = 8, data value = 0xdbe3f4e6c96ce0df, PC=RX@0x4028c1a4[libc.so]0x1c1a4, LR=RX@0x400497dc[libshield.so]0x497dc

>-----------------------------------------------------------------------------<
[15:59:31 996]memcpy 写入地址 0x40456098 读取地址 0x40593000, md5=c2064dabfa1ba6dfbb17c6178e16b8a8, hex=00000001000000010000005300000053351611ed311b521b0fdfdcfaa08b3a5286993b456be946e37e0a7ee1544da9429183e5cbe3651f9dfdabe758cfc379decb7ed8ab64180c1f14348a37b2a1dc2331d3b62f6f9827ca787220dfe06cc9e6f4e3db
size: 99
0000: 00 00 00 01 00 00 00 01 00 00 00 53 00 00 00 53    ...........S...S
0010: 35 16 11 ED 31 1B 52 1B 0F DF DC FA A0 8B 3A 52    5...1.R.......:R
0020: 86 99 3B 45 6B E9 46 E3 7E 0A 7E E1 54 4D A9 42    ..;Ek.F.~.~.TM.B
0030: 91 83 E5 CB E3 65 1F 9D FD AB E7 58 CF C3 79 DE    .....e.....X..y.
0040: CB 7E D8 AB 64 18 0C 1F 14 34 8A 37 B2 A1 DC 23    .~..d....4.7...#
0050: 31 D3 B6 2F 6F 98 27 CA 78 72 20 DF E0 6C C9 E6    1../o.'.xr ..l..
0060: F4 E3 DB                                           ...
^-----------------------------------------------------------------------------^
```

可以看到数据是分为两部分的，先去 `0x497ac` 处看看吧

### 0x31 分支一 (前16字节)

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/11.png)

可以看到前16字节来自这里，类似是校验的作用

```
0000: 00 00 00 01 00 00 00 01 00 00 00 53 00 00 00 53    ...........S...S
```

其实我们猜也能猜出个大半，刚刚知道 `Base64` 的 `input` 总长是 `0x63` ，现在去掉 `0x10` ，那剩下的刚好就是 `0x53` ，至于 `01` 如何来的，我们看看也就知道了，先hook看看入参吧

```
emulator.attach().addBreakPoint(module.base + 0x49650);
```

```kotlin
mx0

>-----------------------------------------------------------------------------<
[16:32:59 201]x0=unidbg@0xbffff530, md5=5192356b16181dc583c59dd2f7302705, hex=9031454000000000803145400000000010e058400000000000e05840000000009031454000000000803145400000000018a0454000000000389045400000000010e058400000000000e05840000000003831454000000000383145400000000008314540000000000000000000000000
size: 112
0000: 90 31 45 40 00 00 00 00 80 31 45 40 00 00 00 00    .1E@.....1E@....
0010: 10 E0 58 40 00 00 00 00 00 E0 58 40 00 00 00 00    ..X@......X@....
0020: 90 31 45 40 00 00 00 00 80 31 45 40 00 00 00 00    .1E@.....1E@....
0030: 18 A0 45 40 00 00 00 00 38 90 45 40 00 00 00 00    ..E@....8.E@....
0040: 10 E0 58 40 00 00 00 00 00 E0 58 40 00 00 00 00    ..X@......X@....
0050: 38 31 45 40 00 00 00 00 38 31 45 40 00 00 00 00    81E@....81E@....
0060: 08 31 45 40 00 00 00 00 00 00 00 00 00 00 00 00    .1E@............
^-----------------------------------------------------------------------------^
```

显然这是个结构体，随便试试这些指针吧

```yaml
m0x40453190

>-----------------------------------------------------------------------------<
[16:49:50 880]RW@0x40453190, md5=3df7798f10b205454d00aa228ccb2704, hex=18581040000000000100000001000000530000005300000060e04540000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: 18 58 10 40 00 00 00 00 01 00 00 00 01 00 00 00    .X.@............
0010: 53 00 00 00 53 00 00 00 60 E0 45 40 00 00 00 00    S...S...`.E@....
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

可以看到里面包含了

```
0000: 00 00 00 01 00 00 00 01 00 00 00 53 00 00 00 53    ...........S...S
```

`traceWrite` 一下 `0x40453196` 到 `0x40453196 + 0x10`

```haskell
[16:55:53 673] Memory WRITE at 0x40453198, data size = 4, data value = 0x00000001, PC=RX@0x400492f0[libshield.so]0x492f0, LR=RX@0x400492ec[libshield.so]0x492ec
[16:55:53 674] Memory WRITE at 0x4045319c, data size = 4, data value = 0x00000001, PC=RX@0x400492f0[libshield.so]0x492f0, LR=RX@0x400492ec[libshield.so]0x492ec
[16:55:53 674] Memory WRITE at 0x404531a4, data size = 4, data value = 0x00000053, PC=RX@0x4004930c[libshield.so]0x4930c, LR=RX@0x400492ec[libshield.so]0x492ec

>-----------------------------------------------------------------------------<
[16:55:53 674]memcpy 写入地址 0x4045e018 读取地址 0x40457010, md5=73dc35f7254a1e99f5f892f481976052, hex=38343230323934
size: 7
0000: 38 34 32 30 32 39 34                               8420294
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[16:55:53 675]memcpy 写入地址 0x4045e01f 读取地址 0x40453150, md5=62a42148bd56adbe0750cf08ddabc667, hex=30643765656532632d356437372d336332362d393966382d613561326339653038616562
size: 36
0000: 30 64 37 65 65 65 32 63 2D 35 64 37 37 2D 33 63    0d7eee2c-5d77-3c
0010: 32 36 2D 39 39 66 38 2D 61 35 61 32 63 39 65 30    26-99f8-a5a2c9e0
0020: 38 61 65 62                                        8aeb
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[16:55:53 675]memcpy 写入地址 0x4045e043 读取地址 0x4047e000, md5=5d78883c2da497543c635ee702e2914d, hex=babee4f868c3e3c94b9b5781b0d71460
size: 16
0000: BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60    ....h...K.W....`
^-----------------------------------------------------------------------------^
[16:55:53 676] Memory WRITE at 0x404531a0, data size = 4, data value = 0x00000053, PC=RX@0x40049574[libshield.so]0x49574, LR=RX@0x40049570[libshield.so]0x49570
```

跳到PC指向的地方

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/12.png)

前两位写死的1,后面的和v7有关

下个断点看看a1

```kotlin
mx0

>-----------------------------------------------------------------------------<
[17:02:40 257]x0=unidbg@0xbffff540, md5=43d7feda9b1b909b055506e5e5fc9dbf, hex=10e058400000000000e058400000000078792d0000000000f0f4ffbf0000000018a0454000000000389045400000000010e058400000000000e0584000000000383145400000000038314540000000000831454000000000000000000000000000000000000000006030454000000000
size: 112
0000: 10 E0 58 40 00 00 00 00 00 E0 58 40 00 00 00 00    ..X@......X@....
0010: 78 79 2D 00 00 00 00 00 F0 F4 FF BF 00 00 00 00    xy-.............
0020: 18 A0 45 40 00 00 00 00 38 90 45 40 00 00 00 00    ..E@....8.E@....
0030: 10 E0 58 40 00 00 00 00 00 E0 58 40 00 00 00 00    ..X@......X@....
0040: 38 31 45 40 00 00 00 00 38 31 45 40 00 00 00 00    81E@....81E@....
0050: 08 31 45 40 00 00 00 00 00 00 00 00 00 00 00 00    .1E@............
0060: 00 00 00 00 00 00 00 00 60 30 45 40 00 00 00 00    ........`0E@....
^-----------------------------------------------------------------------------^
```

```
v7 = (unsigned int)(*(_DWORD *)(*a1 + 20LL) + *(_DWORD *)(*a1 + 24LL) + *(_DWORD *)(*a1 + 28LL) + 24);
 v5[5] = v7;
```

\*a1对应的地址就是 `0x4058E010` ，这里是偏移20~28，注意这里是十进制

我们依旧 `traceWrite` 一下这块内存

```
emulator.traceWrite(0x4058e024, 0x4058e02D);
```

```kotlin
[17:36:58 107] Memory WRITE at 0x4058e024, data size = 4, data value = 0x00000007, PC=RX@0x40049138[libshield.so]0x49138, LR=RX@0x40049128[libshield.so]0x49128
[17:36:58 107] Memory WRITE at 0x4058e028, data size = 4, data value = 0x00000024, PC=RX@0x40049154[libshield.so]0x49154, LR=RX@0x40049140[libshield.so]0x49140
[17:36:58 108] Memory WRITE at 0x4058e02c, data size = 4, data value = 0x00000010, PC=RX@0x40049160[libshield.so]0x49160, LR=RX@0x4004915c[libshield.so]0x4915c
```

没毛病啊， `0x07 + 0x24 + 0x10 + 24 = 83 = 0x53` ，跳到PC的位置，看看生成逻辑

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/13.png)

具体逻辑都和传入的参数有关系，下个断点看看参数都是啥吧

```kotlin
mx1

>-----------------------------------------------------------------------------<
[13:04:38 291]x1=unidbg@0xbffff568, md5=2d4077e59957a929347adc564254a190, hex=3890454000000000e8fe1140000000004016feff00000000383145400000000038314540000000000831454000000000000000000000000000000000000000006030454000000000c0304540000000006030454000000000020000000000000078eacdefffffffff2417d683ffffffff
size: 112
0000: 38 90 45 40 00 00 00 00 E8 FE 11 40 00 00 00 00    8.E@.......@....
0010: 40 16 FE FF 00 00 00 00 38 31 45 40 00 00 00 00    @.......81E@....
0020: 38 31 45 40 00 00 00 00 08 31 45 40 00 00 00 00    81E@.....1E@....
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 60 30 45 40 00 00 00 00 C0 30 45 40 00 00 00 00    `0E@.....0E@....
0050: 60 30 45 40 00 00 00 00 02 00 00 00 00 00 00 00    `0E@............
0060: 78 EA CD EF FF FF FF FF 24 17 D6 83 FF FF FF FF    x.......$.......
^-----------------------------------------------------------------------------^
mx4

>-----------------------------------------------------------------------------<
[13:05:02 725]x4=unidbg@0xbffff560, md5=a6c78cc4444749c9ebe8e5f759b94ba9, hex=18a04540000000003890454000000000e8fe1140000000004016feff00000000383145400000000038314540000000000831454000000000000000000000000000000000000000006030454000000000c0304540000000006030454000000000020000000000000078eacdefffffffff
size: 112
0000: 18 A0 45 40 00 00 00 00 38 90 45 40 00 00 00 00    ..E@....8.E@....
0010: E8 FE 11 40 00 00 00 00 40 16 FE FF 00 00 00 00    ...@....@.......
0020: 38 31 45 40 00 00 00 00 38 31 45 40 00 00 00 00    81E@....81E@....
0030: 08 31 45 40 00 00 00 00 00 00 00 00 00 00 00 00    .1E@............
0040: 00 00 00 00 00 00 00 00 60 30 45 40 00 00 00 00    ........`0E@....
0050: C0 30 45 40 00 00 00 00 60 30 45 40 00 00 00 00    .0E@....`0E@....
0060: 02 00 00 00 00 00 00 00 78 EA CD EF FF FF FF FF    ........x.......
^-----------------------------------------------------------------------------^
```

```
*(_DWORD *)(v15 + 20) = *(_QWORD *)(*a2 - 24LL);// 0x07
v16 = sub_12DE0();
v17 = *a7;
*(_QWORD *)(v17 + 32) = v16;
*(_DWORD *)(v17 + 12) = a3;
*(_DWORD *)(v17 + 16) = a4;
*(_DWORD *)(v17 + 24) = *(_QWORD *)(*a5 - 24LL);// 0x24
v18 = sub_12DE0();
v19 = *a7;
*(_DWORD *)(v19 + 28) = a6;                   // 0x10
```

由于 `*a2 - 24LL = *a2 - 0x18` ，a2的内存dump数据上面可以看到，\*a2对应的是 `38 90 45 40` ，即 `0x40459038` ，那减去0x18之后就是 `0x40459020` ，dump看看这块内存

```yaml
>-----------------------------------------------------------------------------<
[13:20:33 256]RW@0x40459020, md5=831024ccc7f89d9b8f113c5e72e6ef4b, hex=07000000000000000700000000000000010000000000000038343230323934000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: 07 00 00 00 00 00 00 00 07 00 00 00 00 00 00 00    ................
0010: 01 00 00 00 00 00 00 00 38 34 32 30 32 39 34 00    ........8420294.
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

确实是 `0x07` 第二行的是版本号，上面提到了，合理怀疑就是版本号的长度，再看看另一个

```yaml
m0x4045A000

>-----------------------------------------------------------------------------<
[13:25:10 799]RW@0x4045a000, md5=4c59afdaf67905df56604e9d7c980a58, hex=24000000000000002400000000000000010000000000000030643765656532632d356437372d336332362d393966382d61356132633965303861656200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: 24 00 00 00 00 00 00 00 24 00 00 00 00 00 00 00    $.......$.......
0010: 01 00 00 00 00 00 00 00 30 64 37 65 65 65 32 63    ........0d7eee2c
0020: 2D 35 64 37 37 2D 33 63 32 36 2D 39 39 66 38 2D    -5d77-3c26-99f8-
0030: 61 35 61 32 63 39 65 30 38 61 65 62 00 00 00 00    a5a2c9e08aeb....
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

是长度无疑了，后面的值是deviceid，这里我们可以通过修改版本号的deviceid的长度验证，验证之后确实是这样，读者可以自行验证

### 0x32 分支二 (后83字节)

现在看看剩下的83字节生成逻辑，回到刚刚的分\[支一处\](###0x31 分支一 (前16字节))，输出的日志里有这么一段

```
>-----------------------------------------------------------------------------<
[13:39:28 344]memcpy 写入地址 0x40593010 读取地址 0x4045e060, md5=340618008cf43c8a10c020c55de9d177, hex=351611ed311b521b0fdfdcfaa08b3a5286993b456be946e37e0a7ee1544da9429183e5cbe3651f9dfdabe758cfc379decb7ed8ab64180c1f14348a37b2a1dc2331d3b62f6f9827ca787220dfe06cc9e6f4e3db
size: 83
0000: 35 16 11 ED 31 1B 52 1B 0F DF DC FA A0 8B 3A 52    5...1.R.......:R
0010: 86 99 3B 45 6B E9 46 E3 7E 0A 7E E1 54 4D A9 42    ..;Ek.F.~.~.TM.B
0020: 91 83 E5 CB E3 65 1F 9D FD AB E7 58 CF C3 79 DE    .....e.....X..y.
0030: CB 7E D8 AB 64 18 0C 1F 14 34 8A 37 B2 A1 DC 23    .~..d....4.7...#
0040: 31 D3 B6 2F 6F 98 27 CA 78 72 20 DF E0 6C C9 E6    1../o.'.xr ..l..
0050: F4 E3 DB                                           ...
^-----------------------------------------------------------------------------^
```

这是后83字节最早出现的位置，我们依旧 `traceWrite` 追踪看看

```
emulator.traceWrite(0x4045e060, 0x4045e060 + 0x53);
```

结果：

```kotlin
[13:50:45 807] Memory WRITE at 0x4045e060, data size = 1, data value = 0x35, PC=RX@0x4005126c[libshield.so]0x5126c, LR=RX@0x40049570[libshield.so]0x49570
[13:50:45 807] Memory WRITE at 0x4045e061, data size = 1, data value = 0x16, PC=RX@0x400512ac[libshield.so]0x512ac, LR=RX@0x40049570[libshield.so]0x49570
[13:50:45 807] Memory WRITE at 0x4045e062, data size = 1, data value = 0x11, PC=RX@0x400512ec[libshield.so]0x512ec, LR=RX@0x40049570[libshield.so]0x49570
[13:50:45 807] Memory WRITE at 0x4045e063, data size = 1, data value = 0xed, PC=RX@0x4005132c[libshield.so]0x5132c, LR=RX@0x40049570[libshield.so]0x49570
[13:50:45 807] Memory WRITE at 0x4045e064, data size = 1, data value = 0x31, PC=RX@0x4005136c[libshield.so]0x5136c, LR=RX@0x40049570[libshield.so]0x49570
[13:50:45 808] Memory WRITE at 0x4045e065, data size = 1, data value = 0x1b, PC=RX@0x400513ac[libshield.so]0x513ac, LR=RX@0x40049570[libshield.so]0x49570
......
[13:50:45 814] Memory WRITE at 0x4045e0b0, data size = 1, data value = 0xf4, PC=RX@0x40051490[libshield.so]0x51490, LR=RX@0x40049570[libshield.so]0x49570
[13:50:45 814] Memory WRITE at 0x4045e0b1, data size = 1, data value = 0xe3, PC=RX@0x400514d8[libshield.so]0x514d8, LR=RX@0x40049570[libshield.so]0x49570
[13:50:45 814] Memory WRITE at 0x4045e0b2, data size = 1, data value = 0xdb, PC=RX@0x40051520[libshield.so]0x51520, LR=RX@0x40049570[libshield.so]0x49570
```

跳到PC的位置看一眼

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/14.png)

### RC4 识别与验证

让ai重命名了一下变量，然后分析一下，可以发现有很多RC4的特征，但是不知道有没有魔改，先往上找找key吧

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/15.png)

上面这个函数像是RC4初始化函数，那么第三个参数就应该是秘钥了，尝试一下

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/16.png)

只能说是一模一样，那么这一块就是个 `标准RC4` 了

接下来我们来看看明文的结构

### 明文结构解析

```yaml
mx2

>-----------------------------------------------------------------------------<
[14:27:39 528]x2=RW@0x4045e000, md5=0b11f6632846fbb87058edd4e5285168, hex=00000001ecfaaf01000000020000000700000024000000103834323032393430643765656532632d356437372d336332362d393966382d613561326339653038616562babee4f868c3e3c94b9b5781b0d714600000000000000000000000000000000000000000000000000000000000
size: 112
0000: 00 00 00 01 EC FA AF 01 00 00 00 02 00 00 00 07    ................
0010: 00 00 00 24 00 00 00 10 38 34 32 30 32 39 34 30    ...$....84202940
0020: 64 37 65 65 65 32 63 2D 35 64 37 37 2D 33 63 32    d7eee2c-5d77-3c2
0030: 36 2D 39 39 66 38 2D 61 35 61 32 63 39 65 30 38    6-99f8-a5a2c9e08
0040: 61 65 62 BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0    aeb....h...K.W..
0050: D7 14 60 00 00 00 00 00 00 00 00 00 00 00 00 00    ..`.............
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

对 `sub_511E0` xerf会有两个结果，但是实际只会走 `sub_4926C` 函数，上述结果很明显可以看到24字节之后的是build+deviceid，最后十六字节比较乱，但是根据特征可以猜测应该是MD5之类的哈希算法 ，那么我们先看前24字节的生成逻辑

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/17.png)

和v6有关，上面给v6赋值了\*a1，这个函数我记得上面分析v5的时候大概看过，其中 `ECFAAF01` 是传入的app_id，下面的07 24 10是刚刚分析的字符长度，那现在还剩个初始的01和后面的02，这两个多次修改参数发现是固定的，那么现在只需要分析最后的十六字节就行了

traceWrite一下最后16字节的生成

```
emulator.traceWrite(0x4045e043, 0x4045e043 + 16);
```

数据来自 `memcpy`

```kotlin
>-----------------------------------------------------------------------------<
[16:37:22 510]memcpy 写入地址 0x4045e043 读取地址 0x4047e000, md5=5d78883c2da497543c635ee702e2914d, hex=babee4f868c3e3c94b9b5781b0d71460
size: 16
0000: BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60    ....h...K.W....`
^-----------------------------------------------------------------------------^
[16:37:22 510] Memory WRITE at 0x4045e043, data size = 8, data value = 0xc9e3c368f8e4beba, PC=RX@0x4028c18c[libc.so]0x1c18c, LR=RX@0x40049498[libshield.so]0x49498
[16:37:22 510] Memory WRITE at 0x4045e04b, data size = 8, data value = 0x6014d7b081579b4b, PC=RX@0x4028c18c[libc.so]0x1c18c, LR=RX@0x40049498[libshield.so]0x49498
```

继续跟

发现最早出现的位置在这

```
>-----------------------------------------------------------------------------<
[16:40:36 275]memcpy 写入地址 0x40453138 读取地址 0xbffff478, md5=5d78883c2da497543c635ee702e2914d, hex=babee4f868c3e3c94b9b5781b0d71460
size: 16
0000: BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60    ....h...K.W....`
^-----------------------------------------------------------------------------^
```

继续跟

```
emulator.traceWrite(0xbffff478L, 0xbffff488L);
```

```kotlin
[16:44:14 808] Memory WRITE at 0xbffff478, data size = 1, data value = 0xba, PC=RX@0x400546d8[libshield.so]0x546d8, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff479, data size = 1, data value = 0xbe, PC=RX@0x400546dc[libshield.so]0x546dc, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff47a, data size = 1, data value = 0xe4, PC=RX@0x400546e8[libshield.so]0x546e8, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff47b, data size = 1, data value = 0xf8, PC=RX@0x400546ec[libshield.so]0x546ec, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff47c, data size = 1, data value = 0x68, PC=RX@0x400546f8[libshield.so]0x546f8, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff47d, data size = 1, data value = 0xc3, PC=RX@0x400546fc[libshield.so]0x546fc, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff47e, data size = 1, data value = 0xe3, PC=RX@0x40054708[libshield.so]0x54708, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff47f, data size = 1, data value = 0xc9, PC=RX@0x4005470c[libshield.so]0x5470c, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff480, data size = 1, data value = 0x4b, PC=RX@0x40054718[libshield.so]0x54718, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff481, data size = 1, data value = 0x9b, PC=RX@0x4005471c[libshield.so]0x5471c, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff482, data size = 1, data value = 0x57, PC=RX@0x40054728[libshield.so]0x54728, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff483, data size = 1, data value = 0x81, PC=RX@0x4005472c[libshield.so]0x5472c, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff484, data size = 1, data value = 0xb0, PC=RX@0x40054738[libshield.so]0x54738, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 808] Memory WRITE at 0xbffff485, data size = 1, data value = 0xd7, PC=RX@0x4005473c[libshield.so]0x5473c, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 809] Memory WRITE at 0xbffff486, data size = 1, data value = 0x14, PC=RX@0x40054748[libshield.so]0x54748, LR=RX@0x400546cc[libshield.so]0x546cc
[16:44:14 809] Memory WRITE at 0xbffff487, data size = 1, data value = 0x60, PC=RX@0x4005474c[libshield.so]0x5474c, LR=RX@0x400546cc[libshield.so]0x546cc

>-----------------------------------------------------------------------------<
[16:44:14 809]memcpy 写入地址 0x40453138 读取地址 0xbffff478, md5=5d78883c2da497543c635ee702e2914d, hex=babee4f868c3e3c94b9b5781b0d71460
size: 16
0000: BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60    ....h...K.W....`
^-----------------------------------------------------------------------------^
```

跳过去看看 `0x546d8`

### MD5/HMAC 计算过程

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/18.png) 这是一个MD5_Final函数，它负责对数据做最后的填充和长度附加，然后执行最终压缩并输出 16 字节的 MD5 摘要，其中 `sub_539DC` 是个运算函数，下个断点看看

```yaml
mx0

>-----------------------------------------------------------------------------<
[20:43:09 904]x0=RW@0x40469000, md5=2391e90a328d7d9e29b58b37a6e9e379, hex=76543210fedcba9889abcdef012345670002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^
mx1

>-----------------------------------------------------------------------------<
[20:43:43 390]x1=unidbg@0xbffff3a0, md5=18a5f5457839ff68282a91c4c8497983, hex=6f7e82cd2fde22b8cd40c8a3d96b4b9b4701c70c9e888570d50c5d0834dd9a5b621e70241f46fdff5af479f5854ef8d653d1322c06a703976c2bb6b019a98bed363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636
size: 112
0000: 6F 7E 82 CD 2F DE 22 B8 CD 40 C8 A3 D9 6B 4B 9B    o~../."..@...kK.
0010: 47 01 C7 0C 9E 88 85 70 D5 0C 5D 08 34 DD 9A 5B    G......p..].4..[
0020: 62 1E 70 24 1F 46 FD FF 5A F4 79 F5 85 4E F8 D6    b.p$.F..Z.y..N..
0030: 53 D1 32 2C 06 A7 03 97 6C 2B B6 B0 19 A9 8B ED    S.2,....l+......
0040: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0050: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0060: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
^-----------------------------------------------------------------------------^
```

有两个地方需要注意

1.  ```
    0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
    ```
    
    这是MD5的标准初始iv
    
2.  x1寄存器指向的内存里含有大量0x36，这是 `HMAC` 的特征，但这是外部函数的特征，目前倒是不太需要考虑
    

经过发现可以知道 `sub_539DC` 实际上是一个类似MD5的哈希算法，其中FGHI和FFGGHHII函数都没有被修改，我问了ai，ai说是MD5的压缩函数部分，但似乎并不是完整的MD5，但是反编译之后都是运算过程，逻辑也是比较清晰，这里直接丢给ai，让它还原一下即可，还原出来的太长了，就不放了

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/19.png)

### HMAC-MD5 细节分析

姑且把 `sub_54600` 看做一个黑盒，我们接着分析它的参数及其来源

```cpp
__int64 __fastcall sub_54600(__int64 a1, int *a2)
{
  __int64 v3; // x8
  unsigned __int8 *v4; // x21
  int v6; // w8
  int v7; // w9
  int v8; // w8
  unsigned int v10; // w9

  v3 = (unsigned int)a2[22];
  v4 = (unsigned __int8 *)(a2 + 6);  // buffer起始地址
  *((_BYTE *)a2 + v3 + 24) = 0x80;
  if ( (unsigned __int64)(v3 + 1) >= 0x39 )
  {
    sub_129A0();
    sub_539DC(a2, v4, 1);  // v4是buffer
  }
  sub_129A0();
  v6 = a2[4];
  v7 = a2[5];
  *((_WORD *)a2 + 40) = v6;
  *((_BYTE *)a2 + 83) = HIBYTE(v6);
  *((_WORD *)a2 + 42) = v7;
  *((_BYTE *)a2 + 82) = BYTE2(v6);
  *((_BYTE *)a2 + 86) = BYTE2(v7);
  *((_BYTE *)a2 + 87) = HIBYTE(v7);
  sub_539DC(a2, v4, 1);
  a2[22] = 0;
  sub_517F0(v4, 64);
  v8 = *a2;
  v10 = (unsigned int)*a2 >> 8;
  *(_BYTE *)a1 = *a2;
  *(_BYTE *)(a1 + 1) = v10;
  *(_BYTE *)(a1 + 2) = BYTE2(v8);
  *(_BYTE *)(a1 + 3) = HIBYTE(v8);
  *(_DWORD *)(a1 + 4) = a2[1];
  *(_DWORD *)(a1 + 8) = a2[2];
  *(_DWORD *)(a1 + 12) = a2[3];
  return 1;
}
```

可以看到 `a1` 的初始值实际对函数运行没有任何影响，主要是 `a2` 在参与运算

这是a2的内存快照

```yaml
mx1 512

>-----------------------------------------------------------------------------<
[16:47:02 722]x1=RW@0x40469300, md5=079ceafb42ab295ff1af31e9dcfdb276, hex=2e78e6707d75491678e5da9b283878a78002000000000000ff13ab6158bdd61953cdab36153843ae0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f69e6319a621091449eece1dc1af0f1cf52ac61747134610a9019516fd62251ef65314740291e621d2c9fb13e2e6cd6122970dd5f2ed145a4205e977a2f9a377f2d9126f629a4c2a9240b340c0515a5e26aac7f6e95d103fd6d60757c34239fcff91d67c9744eabca4a9cfdc4b70bcbcbec67e8c28604bccf6fa27acea9510ecd439d0dcd9e588dce6051d8c04f97ca21f22619d6d6556acc41c39e5fd442229f4a72394ab39a093f5c3595b6597ff2a457d24eff5d15d848592cc0c85e02699f94f7e99f9144399a9827e53c5a1110845a611084535f23abd91d386eb0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 512
0000: 2E 78 E6 70 7D 75 49 16 78 E5 DA 9B 28 38 78 A7    .x.p}uI.x...(8x.
0010: 80 02 00 00 00 00 00 00 FF 13 AB 61 58 BD D6 19    ...........aX...
0020: 53 CD AB 36 15 38 43 AE 00 00 00 00 00 00 00 00    S..6.8C.........
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 10 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
0080: 9E 63 19 A6 21 09 14 49 EE CE 1D C1 AF 0F 1C F5    .c..!..I........
0090: 2A C6 17 47 13 46 10 A9 01 95 16 FD 62 25 1E F6    *..G.F......b%..
00A0: 53 14 74 02 91 E6 21 D2 C9 FB 13 E2 E6 CD 61 22    S.t...!.......a"
00B0: 97 0D D5 F2 ED 14 5A 42 05 E9 77 A2 F9 A3 77 F2    ......ZB..w...w.
00C0: D9 12 6F 62 9A 4C 2A 92 40 B3 40 C0 51 5A 5E 26    ..ob.L*.@.@.QZ^&
00D0: AA C7 F6 E9 5D 10 3F D6 D6 07 57 C3 42 39 FC FF    ....].?...W.B9..
00E0: 91 D6 7C 97 44 EA BC A4 A9 CF DC 4B 70 BC BC BE    ..|.D......Kp...
00F0: C6 7E 8C 28 60 4B CC F6 FA 27 AC EA 95 10 EC D4    .~.(`K...'......
0100: 39 D0 DC D9 E5 88 DC E6 05 1D 8C 04 F9 7C A2 1F    9............|..
0110: 22 61 9D 6D 65 56 AC C4 1C 39 E5 FD 44 22 29 F4    "a.meV...9..D").
0120: A7 23 94 AB 39 A0 93 F5 C3 59 5B 65 97 FF 2A 45    .#..9....Y[e..*E
0130: 7D 24 EF F5 D1 5D 84 85 92 CC 0C 85 E0 26 99 F9    }$...].......&..
0140: 4F 7E 99 F9 14 43 99 A9 82 7E 53 C5 A1 11 08 45    O~...C...~S....E
0150: A6 11 08 45 35 F2 3A BD 91 D3 86 EB 00 00 00 00    ...E5.:.........
0160: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0170: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0180: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0190: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
01A0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
01B0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
01C0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
01D0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
01E0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
01F0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

根据上述代码，我们可以推测出

```cpp
v3 = (unsigned int)a2[22];           // 偏移 22*4 = 0x58，读取 buf_len
v4 = (unsigned __int8 *)(a2 + 6);    // 偏移 6*4 = 0x18，指向 buffer
*((_BYTE *)a2 + v3 + 24) = 0x80;     // a2 + 24 + buf_len = 0x18 + buf_len，在buffer中写入0x80
```

再到 `sub_539DC` 函数

```sql
// 第222行: result[23] 是第一个常量
HIDWORD(v26) = ((v3 ^ v4) & v5 ^ v4) + v6 + v7 + result[23];

// 第195行: result[64] 
v168 = result[64] + v7;

// 第471行: result[86] 是最后一个常量
v147 = result[86] + v17 + v142;
```

可以看到访问的下标范围是 `23~86` 共64个，对应MD5的K表，即 `56 B7 C9 E9` 到 `91 D3 86 EB` ，多次运行，这一块并不会发生变化

分割一下字符

```python
"2e78e6707d75491678e5da9b283878a7"  # 0x00-0x0F: state[0-3]
"8002000000000000"                    # 0x10-0x17: count
"ff13ab6158bdd61953cdab36153843ae"  # 0x18-0x27: buffer
"00000000000000000000000000000000"    # 0x28-0x37
"00000000000000000000000000000000"    # 0x38-0x47
"00000000000000000000000000000000"    # 0x48-0x57
"10000000"                            # 0x58-0x5B: buf_len = 16 (0x10)
"56b7c9e9"                            # 0x5C: 常量表开始
"79a41bd7db811024d9881068aff7149b"
"b15b1fffbed71c8822616666936166f6"
"9e6319a621091449eece1dc1af0f1cf5"
"2ac61747134610a9019516fd62251ef6"
"5314740291e621d2c9fb13e2e6cd6122"
"970dd5f2ed145a4205e977a2f9a377f2"
"d9126f629a4c2a9240b340c0515a5e26"
"aac7f6e95d103fd6d60757c34239fcff"
"91d67c9744eabca4a9cfdc4b70bcbcbe"
"c67e8c28604bccf6fa27acea9510ecd4"
"39d0dcd9e588dce6051d8c04f97ca21f"
"22619d6d6556acc41c39e5fd442229f4"
"a72394ab39a093f5c3595b6597ff2a45"
"7d24eff5d15d848592cc0c85e02699f9"
"4f7e99f9144399a9827e53c5a1110845"
"a611084535f23abd91d386eb"
```

### 哈希状态与常量表

| 地址范围 | 内容  | 是否需要追踪 | 备注  |
| --- | --- | --- | --- |
| 0x00 - 0x0F | state\[0-3\] | 需要追踪 | 哈希中间状态 |
| 0x10 - 0x17 | count | 需要追踪 | 已处理的数据量 |
| 0x18 - 0x57 | buffer | 需要追踪 | 待处理的输入数据 |
| 0x58 - 0x5B | buf_len | 需要追踪 | buffer中的字节数 |
| 0x5C - 0x15B | 常量表 | 不需要追踪（固定值） | MD5 K表 |

traceWrite x1地址看看

```kotlin
[19:25:37 593] Memory WRITE at 0x40469310, data size = 4, data value = 0x00000280, PC=RX@0x40053910[libshield.so]0x53910, LR=RX@0x40053384[libshield.so]0x53384
[19:25:37 593] Memory WRITE at 0x40469314, data size = 4, data value = 0x00000000, PC=RX@0x40053910[libshield.so]0x53910, LR=RX@0x40053384[libshield.so]0x53384
[19:25:37 593] Memory WRITE at 0x40469358, data size = 4, data value = 0x00000010, PC=RX@0x400539a0[libshield.so]0x539a0, LR=RX@0x40053384[libshield.so]0x53384
```

跳到PC处看看

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/20.png)

### HMAC 常量生成

`0x80 0x02 0x10` 生成的地方，都和a1有关，先hook 看看吧

```yaml
====== OnEnter sub_538CC  count=1 ======

>-----------------------------------------------------------------------------<
[20:15:17 386]a1 dump, md5=b3e3b3d117d5d06a96da8563f034039a, hex=76543210fedcba9889abcdef012345670000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
0010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 388]a2 dump, md5=13a9b2009f6d3722245d1b201982db0e, hex=6f7e82cd2fde22b8cd40c8a3d96b4b9b4701c70c9e888570d50c5d0834dd9a5b621e70241f46fdff5af479f5854ef8d653d1322c06a703976c2bb6b019a98bed36363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636
size: 128
0000: 6F 7E 82 CD 2F DE 22 B8 CD 40 C8 A3 D9 6B 4B 9B    o~../."..@...kK.
0010: 47 01 C7 0C 9E 88 85 70 D5 0C 5D 08 34 DD 9A 5B    G......p..].4..[
0020: 62 1E 70 24 1F 46 FD FF 5A F4 79 F5 85 4E F8 D6    b.p$.F..Z.y..N..
0030: 53 D1 32 2C 06 A7 03 97 6C 2B B6 B0 19 A9 8B ED    S.2,....l+......
0040: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0050: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0060: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0070: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
^-----------------------------------------------------------------------------^
====== OnLeave sub_538CC ======
return = 0x1

>-----------------------------------------------------------------------------<
[20:15:17 407]a1 dump AFTER, md5=e70d918a819fa381b66f003803015d01, hex=af9cbe39e724857383d041421ea07de40002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: AF 9C BE 39 E7 24 85 73 83 D0 41 42 1E A0 7D E4    ...9.$.s..AB..}.
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 407]a2 dump AFTER, md5=13a9b2009f6d3722245d1b201982db0e, hex=6f7e82cd2fde22b8cd40c8a3d96b4b9b4701c70c9e888570d50c5d0834dd9a5b621e70241f46fdff5af479f5854ef8d653d1322c06a703976c2bb6b019a98bed36363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636
size: 128
0000: 6F 7E 82 CD 2F DE 22 B8 CD 40 C8 A3 D9 6B 4B 9B    o~../."..@...kK.
0010: 47 01 C7 0C 9E 88 85 70 D5 0C 5D 08 34 DD 9A 5B    G......p..].4..[
0020: 62 1E 70 24 1F 46 FD FF 5A F4 79 F5 85 4E F8 D6    b.p$.F..Z.y..N..
0030: 53 D1 32 2C 06 A7 03 97 6C 2B B6 B0 19 A9 8B ED    S.2,....l+......
0040: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0050: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0060: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0070: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
^-----------------------------------------------------------------------------^
====== OnEnter sub_538CC  count=2 ======

>-----------------------------------------------------------------------------<
[20:15:17 408]a1 dump, md5=b3e3b3d117d5d06a96da8563f034039a, hex=76543210fedcba9889abcdef012345670000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
0010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 408]a2 dump, md5=20bb49c9a9a33c97016f862146a89c3e, hex=0514e8a745b448d2a72aa2c9b30121f12d6bad66f4e2ef1abf6637625eb7f03108741a4e752c9795309e139fef2492bc39bb58466ccd69fd0641dcda73c3e1875c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
size: 128
0000: 05 14 E8 A7 45 B4 48 D2 A7 2A A2 C9 B3 01 21 F1    ....E.H..*....!.
0010: 2D 6B AD 66 F4 E2 EF 1A BF 66 37 62 5E B7 F0 31    -k.f.....f7b^..1
0020: 08 74 1A 4E 75 2C 97 95 30 9E 13 9F EF 24 92 BC    .t.Nu,..0....$..
0030: 39 BB 58 46 6C CD 69 FD 06 41 DC DA 73 C3 E1 87    9.XFl.i..A..s...
0040: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0050: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0060: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0070: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
^-----------------------------------------------------------------------------^
====== OnLeave sub_538CC ======
return = 0x1

>-----------------------------------------------------------------------------<
[20:15:17 409]a1 dump AFTER, md5=79caad7777f928a301ba2bea5630f23e, hex=2e78e6707d75491678e5da9b283878a70002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: 2E 78 E6 70 7D 75 49 16 78 E5 DA 9B 28 38 78 A7    .x.p}uI.x...(8x.
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 409]a2 dump AFTER, md5=20bb49c9a9a33c97016f862146a89c3e, hex=0514e8a745b448d2a72aa2c9b30121f12d6bad66f4e2ef1abf6637625eb7f03108741a4e752c9795309e139fef2492bc39bb58466ccd69fd0641dcda73c3e1875c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
size: 128
0000: 05 14 E8 A7 45 B4 48 D2 A7 2A A2 C9 B3 01 21 F1    ....E.H..*....!.
0010: 2D 6B AD 66 F4 E2 EF 1A BF 66 37 62 5E B7 F0 31    -k.f.....f7b^..1
0020: 08 74 1A 4E 75 2C 97 95 30 9E 13 9F EF 24 92 BC    .t.Nu,..0....$..
0030: 39 BB 58 46 6C CD 69 FD 06 41 DC DA 73 C3 E1 87    9.XFl.i..A..s...
0040: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0050: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0060: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0070: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
^-----------------------------------------------------------------------------^
====== OnEnter sub_538CC  count=3 ======

>-----------------------------------------------------------------------------<
[20:15:17 415]a1 dump, md5=e70d918a819fa381b66f003803015d01, hex=af9cbe39e724857383d041421ea07de40002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: AF 9C BE 39 E7 24 85 73 83 D0 41 42 1E A0 7D E4    ...9.$.s..AB..}.
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 415]a2 dump, md5=c4b3323f96114a3b7656cd037b5b38b6, hex=2f6170692f736e732f76362f6d6573736167652f6465746563746669643d3137323231383234373331303666633834383939353635653261636630303635366165303561373837363462266465766963655f66696e6765727072696e743d32303233313232343131303034333736626433373966653666353465366463356361
size: 128
0000: 2F 61 70 69 2F 73 6E 73 2F 76 36 2F 6D 65 73 73    /api/sns/v6/mess
0010: 61 67 65 2F 64 65 74 65 63 74 66 69 64 3D 31 37    age/detectfid=17
0020: 32 32 31 38 32 34 37 33 31 30 36 66 63 38 34 38    22182473106fc848
0030: 39 39 35 36 35 65 32 61 63 66 30 30 36 35 36 61    99565e2acf00656a
0040: 65 30 35 61 37 38 37 36 34 62 26 64 65 76 69 63    e05a78764b&devic
0050: 65 5F 66 69 6E 67 65 72 70 72 69 6E 74 3D 32 30    e_fingerprint=20
0060: 32 33 31 32 32 34 31 31 30 30 34 33 37 36 62 64    23122411004376bd
0070: 33 37 39 66 65 36 66 35 34 65 36 64 63 35 63 61    379fe6f54e6dc5ca
^-----------------------------------------------------------------------------^
====== OnLeave sub_538CC ======
return = 0x1

>-----------------------------------------------------------------------------<
[20:15:17 416]a1 dump AFTER, md5=2b02a2acdb13623bc44b3d69b501dd69, hex=e3a1bada5eec8c5a23a2cf1c48bac4be101a000000000000656200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: E3 A1 BA DA 5E EC 8C 5A 23 A2 CF 1C 48 BA C4 BE    ....^..Z#...H...
0010: 10 1A 00 00 00 00 00 00 65 62 00 00 00 00 00 00    ........eb......
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 02 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 416]a2 dump AFTER, md5=c4b3323f96114a3b7656cd037b5b38b6, hex=2f6170692f736e732f76362f6d6573736167652f6465746563746669643d3137323231383234373331303666633834383939353635653261636630303635366165303561373837363462266465766963655f66696e6765727072696e743d32303233313232343131303034333736626433373966653666353465366463356361
size: 128
0000: 2F 61 70 69 2F 73 6E 73 2F 76 36 2F 6D 65 73 73    /api/sns/v6/mess
0010: 61 67 65 2F 64 65 74 65 63 74 66 69 64 3D 31 37    age/detectfid=17
0020: 32 32 31 38 32 34 37 33 31 30 36 66 63 38 34 38    22182473106fc848
0030: 39 39 35 36 35 65 32 61 63 66 30 30 36 35 36 61    99565e2acf00656a
0040: 65 30 35 61 37 38 37 36 34 62 26 64 65 76 69 63    e05a78764b&devic
0050: 65 5F 66 69 6E 67 65 72 70 72 69 6E 74 3D 32 30    e_fingerprint=20
0060: 32 33 31 32 32 34 31 31 30 30 34 33 37 36 62 64    23122411004376bd
0070: 33 37 39 66 65 36 66 35 34 65 36 64 63 35 63 61    379fe6f54e6dc5ca
^-----------------------------------------------------------------------------^
```

其中和我们上述数据有关的是这一条

```
====== OnEnter sub_538CC  count=2 ======

>-----------------------------------------------------------------------------<
[20:15:17 408]a1 dump, md5=b3e3b3d117d5d06a96da8563f034039a, hex=76543210fedcba9889abcdef012345670000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
0010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 408]a2 dump, md5=20bb49c9a9a33c97016f862146a89c3e, hex=0514e8a745b448d2a72aa2c9b30121f12d6bad66f4e2ef1abf6637625eb7f03108741a4e752c9795309e139fef2492bc39bb58466ccd69fd0641dcda73c3e1875c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
size: 128
0000: 05 14 E8 A7 45 B4 48 D2 A7 2A A2 C9 B3 01 21 F1    ....E.H..*....!.
0010: 2D 6B AD 66 F4 E2 EF 1A BF 66 37 62 5E B7 F0 31    -k.f.....f7b^..1
0020: 08 74 1A 4E 75 2C 97 95 30 9E 13 9F EF 24 92 BC    .t.Nu,..0....$..
0030: 39 BB 58 46 6C CD 69 FD 06 41 DC DA 73 C3 E1 87    9.XFl.i..A..s...
0040: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0050: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0060: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0070: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
^-----------------------------------------------------------------------------^
====== OnLeave sub_538CC ======
return = 0x1

>-----------------------------------------------------------------------------<
[20:15:17 409]a1 dump AFTER, md5=79caad7777f928a301ba2bea5630f23e, hex=2e78e6707d75491678e5da9b283878a70002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f6
size: 128
0000: 2E 78 E6 70 7D 75 49 16 78 E5 DA 9B 28 38 78 A7    .x.p}uI.x...(8x.
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
0070: B1 5B 1F FF BE D7 1C 88 22 61 66 66 93 61 66 F6    .[......"aff.af.
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[20:15:17 409]a2 dump AFTER, md5=20bb49c9a9a33c97016f862146a89c3e, hex=0514e8a745b448d2a72aa2c9b30121f12d6bad66f4e2ef1abf6637625eb7f03108741a4e752c9795309e139fef2492bc39bb58466ccd69fd0641dcda73c3e1875c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
size: 128
0000: 05 14 E8 A7 45 B4 48 D2 A7 2A A2 C9 B3 01 21 F1    ....E.H..*....!.
0010: 2D 6B AD 66 F4 E2 EF 1A BF 66 37 62 5E B7 F0 31    -k.f.....f7b^..1
0020: 08 74 1A 4E 75 2C 97 95 30 9E 13 9F EF 24 92 BC    .t.Nu,..0....$..
0030: 39 BB 58 46 6C CD 69 FD 06 41 DC DA 73 C3 E1 87    9.XFl.i..A..s...
0040: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0050: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0060: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0070: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
^-----------------------------------------------------------------------------^
```

### HMAC 链路梳理

可以看到 `2e78e6707d75491678e5da9b283878a7` 也在这出现了，但是 `ff13ab6158bdd61953cdab36153843ae` 却没有出现过，前面很多地方都暗示了这里大概率会包含哈希算法，所以我们直接去trace日志里四字节搜索一下，直接快读定位到这些值第一次出现的位置

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/21.png)

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/22.png)

指向了同一个函数 `sub_539DC` ，并且这个函数我们刚刚分析过，他是个类似MD5压缩数据的部分，也就是说

`sub_54600` 内部会调用 `sub_539DC` ，同时 `sub_539DC` 也参与了 `sub_54600` 参数的生成过程，这里本来想trace一下函数调用链的，但是 `sub_54600` 的并不是通过 `bl` 指令调用的，unidbg对这一块支持的不是很好，导致trace函数调用时拿到的结果是不完整的，这里兜兜转转的，我写起来感觉也不是很清晰，凑合看吧

我们整理一下思绪，现在的任务是定位这部分数据的生成逻辑

```
0000: 2E 78 E6 70 7D 75 49 16 78 E5 DA 9B 28 38 78 A7    .x.p}uI.x...(8x.
0010: 80 02 00 00 00 00 00 00 FF 13 AB 61 58 BD D6 19    ...........aX...
0020: 53 CD AB 36 15 38 43 AE 00 00 00 00 00 00 00 00    S..6.8C.........
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
```

刚刚知道了最早出现的位置是在 `sub_539DC` 里，我们再次回到这个函数

hook输出的内容好长啊，我都懒得贴了，算了还是放一下吧，这是我写过最丑陋的文章

```yaml
====== OnEnter count=1 ======

>-----------------------------------------------------------------------------<
[15:40:36 494]MD5 state BEFORE, md5=2391e90a328d7d9e29b58b37a6e9e379, hex=76543210fedcba9889abcdef012345670002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 496]MD5 block BEFORE, md5=18a5f5457839ff68282a91c4c8497983, hex=6f7e82cd2fde22b8cd40c8a3d96b4b9b4701c70c9e888570d50c5d0834dd9a5b621e70241f46fdff5af479f5854ef8d653d1322c06a703976c2bb6b019a98bed363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636
size: 112
0000: 6F 7E 82 CD 2F DE 22 B8 CD 40 C8 A3 D9 6B 4B 9B    o~../."..@...kK.
0010: 47 01 C7 0C 9E 88 85 70 D5 0C 5D 08 34 DD 9A 5B    G......p..].4..[
0020: 62 1E 70 24 1F 46 FD FF 5A F4 79 F5 85 4E F8 D6    b.p$.F..Z.y..N..
0030: 53 D1 32 2C 06 A7 03 97 6C 2B B6 B0 19 A9 8B ED    S.2,....l+......
0040: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0050: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0060: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
^-----------------------------------------------------------------------------^
====== OnLeave ======

>-----------------------------------------------------------------------------<
[15:40:36 516]MD5 state AFTER, md5=fefad908457c90e5646cf1643d70295e, hex=af9cbe39e724857383d041421ea07de40002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: AF 9C BE 39 E7 24 85 73 83 D0 41 42 1E A0 7D E4    ...9.$.s..AB..}.
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 516]MD5 block AFTER, md5=18a5f5457839ff68282a91c4c8497983, hex=6f7e82cd2fde22b8cd40c8a3d96b4b9b4701c70c9e888570d50c5d0834dd9a5b621e70241f46fdff5af479f5854ef8d653d1322c06a703976c2bb6b019a98bed363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636
size: 112
0000: 6F 7E 82 CD 2F DE 22 B8 CD 40 C8 A3 D9 6B 4B 9B    o~../."..@...kK.
0010: 47 01 C7 0C 9E 88 85 70 D5 0C 5D 08 34 DD 9A 5B    G......p..].4..[
0020: 62 1E 70 24 1F 46 FD FF 5A F4 79 F5 85 4E F8 D6    b.p$.F..Z.y..N..
0030: 53 D1 32 2C 06 A7 03 97 6C 2B B6 B0 19 A9 8B ED    S.2,....l+......
0040: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0050: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0060: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
^-----------------------------------------------------------------------------^
====== OnEnter count=2 ======

>-----------------------------------------------------------------------------<
[15:40:36 517]MD5 state BEFORE, md5=2391e90a328d7d9e29b58b37a6e9e379, hex=76543210fedcba9889abcdef012345670002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 517]MD5 block BEFORE, md5=872f30250336005a140f9187edcf71e5, hex=0514e8a745b448d2a72aa2c9b30121f12d6bad66f4e2ef1abf6637625eb7f03108741a4e752c9795309e139fef2492bc39bb58466ccd69fd0641dcda73c3e1875c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
size: 112
0000: 05 14 E8 A7 45 B4 48 D2 A7 2A A2 C9 B3 01 21 F1    ....E.H..*....!.
0010: 2D 6B AD 66 F4 E2 EF 1A BF 66 37 62 5E B7 F0 31    -k.f.....f7b^..1
0020: 08 74 1A 4E 75 2C 97 95 30 9E 13 9F EF 24 92 BC    .t.Nu,..0....$..
0030: 39 BB 58 46 6C CD 69 FD 06 41 DC DA 73 C3 E1 87    9.XFl.i..A..s...
0040: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0050: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0060: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
^-----------------------------------------------------------------------------^
====== OnLeave ======

>-----------------------------------------------------------------------------<
[15:40:36 518]MD5 state AFTER, md5=e05a6b7b72334efc67d62b154b5502ba, hex=2e78e6707d75491678e5da9b283878a70002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: 2E 78 E6 70 7D 75 49 16 78 E5 DA 9B 28 38 78 A7    .x.p}uI.x...(8x.
0010: 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 518]MD5 block AFTER, md5=872f30250336005a140f9187edcf71e5, hex=0514e8a745b448d2a72aa2c9b30121f12d6bad66f4e2ef1abf6637625eb7f03108741a4e752c9795309e139fef2492bc39bb58466ccd69fd0641dcda73c3e1875c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
size: 112
0000: 05 14 E8 A7 45 B4 48 D2 A7 2A A2 C9 B3 01 21 F1    ....E.H..*....!.
0010: 2D 6B AD 66 F4 E2 EF 1A BF 66 37 62 5E B7 F0 31    -k.f.....f7b^..1
0020: 08 74 1A 4E 75 2C 97 95 30 9E 13 9F EF 24 92 BC    .t.Nu,..0....$..
0030: 39 BB 58 46 6C CD 69 FD 06 41 DC DA 73 C3 E1 87    9.XFl.i..A..s...
0040: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0050: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0060: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
^-----------------------------------------------------------------------------^
====== OnEnter count=3 ======

>-----------------------------------------------------------------------------<
[15:40:36 525]MD5 state BEFORE, md5=c64af4b11a1076b698e14cffbbb481c9, hex=af9cbe39e724857383d041421ea07de4101a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: AF 9C BE 39 E7 24 85 73 83 D0 41 42 1E A0 7D E4    ...9.$.s..AB..}.
0010: 10 1A 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 525]MD5 block BEFORE, md5=1bbbc2f0de84ed1630ec634070c3b362, hex=2f6170692f736e732f76362f6d6573736167652f6465746563746669643d3137323231383234373331303666633834383939353635653261636630303635366165303561373837363462266465766963655f66696e6765727072696e743d323032333132323431313030343337366264
size: 112
0000: 2F 61 70 69 2F 73 6E 73 2F 76 36 2F 6D 65 73 73    /api/sns/v6/mess
0010: 61 67 65 2F 64 65 74 65 63 74 66 69 64 3D 31 37    age/detectfid=17
0020: 32 32 31 38 32 34 37 33 31 30 36 66 63 38 34 38    22182473106fc848
0030: 39 39 35 36 35 65 32 61 63 66 30 30 36 35 36 61    99565e2acf00656a
0040: 65 30 35 61 37 38 37 36 34 62 26 64 65 76 69 63    e05a78764b&devic
0050: 65 5F 66 69 6E 67 65 72 70 72 69 6E 74 3D 32 30    e_fingerprint=20
0060: 32 33 31 32 32 34 31 31 30 30 34 33 37 36 62 64    23122411004376bd
^-----------------------------------------------------------------------------^
====== OnLeave ======

>-----------------------------------------------------------------------------<
[15:40:36 525]MD5 state AFTER, md5=253ed5b49626595e317df22a9da0e159, hex=e3a1bada5eec8c5a23a2cf1c48bac4be101a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: E3 A1 BA DA 5E EC 8C 5A 23 A2 CF 1C 48 BA C4 BE    ....^..Z#...H...
0010: 10 1A 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 526]MD5 block AFTER, md5=1bbbc2f0de84ed1630ec634070c3b362, hex=2f6170692f736e732f76362f6d6573736167652f6465746563746669643d3137323231383234373331303666633834383939353635653261636630303635366165303561373837363462266465766963655f66696e6765727072696e743d323032333132323431313030343337366264
size: 112
0000: 2F 61 70 69 2F 73 6E 73 2F 76 36 2F 6D 65 73 73    /api/sns/v6/mess
0010: 61 67 65 2F 64 65 74 65 63 74 66 69 64 3D 31 37    age/detectfid=17
0020: 32 32 31 38 32 34 37 33 31 30 36 66 63 38 34 38    22182473106fc848
0030: 39 39 35 36 35 65 32 61 63 66 30 30 36 35 36 61    99565e2acf00656a
0040: 65 30 35 61 37 38 37 36 34 62 26 64 65 76 69 63    e05a78764b&devic
0050: 65 5F 66 69 6E 67 65 72 70 72 69 6E 74 3D 32 30    e_fingerprint=20
0060: 32 33 31 32 32 34 31 31 30 30 34 33 37 36 62 64    23122411004376bd
^-----------------------------------------------------------------------------^
====== OnEnter count=4 ======

>-----------------------------------------------------------------------------<
[15:40:36 527]MD5 state BEFORE, md5=74ca93f24e9acdbc6e46e86568b2208d, hex=e3a1bada5eec8c5a23a2cf1c48bac4be101a0000000000006562800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000101a0000000000000200000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: E3 A1 BA DA 5E EC 8C 5A 23 A2 CF 1C 48 BA C4 BE    ....^..Z#...H...
0010: 10 1A 00 00 00 00 00 00 65 62 80 00 00 00 00 00    ........eb......
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 10 1A 00 00 00 00 00 00 02 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 527]MD5 block BEFORE, md5=d5872b07a0e30a6ccb7a72c7e225c576, hex=6562800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000101a0000000000000200000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f69e6319a621091449
size: 112
0000: 65 62 80 00 00 00 00 00 00 00 00 00 00 00 00 00    eb..............
0010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 10 1A 00 00 00 00 00 00    ................
0040: 02 00 00 00 56 B7 C9 E9 79 A4 1B D7 DB 81 10 24    ....V...y......$
0050: D9 88 10 68 AF F7 14 9B B1 5B 1F FF BE D7 1C 88    ...h.....[......
0060: 22 61 66 66 93 61 66 F6 9E 63 19 A6 21 09 14 49    "aff.af..c..!..I
^-----------------------------------------------------------------------------^
====== OnLeave ======

>-----------------------------------------------------------------------------<
[15:40:36 527]MD5 state AFTER, md5=64019c2e78653447637332d5ef164556, hex=ff13ab6158bdd61953cdab36153843ae101a0000000000006562800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000101a0000000000000200000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: FF 13 AB 61 58 BD D6 19 53 CD AB 36 15 38 43 AE    ...aX...S..6.8C.
0010: 10 1A 00 00 00 00 00 00 65 62 80 00 00 00 00 00    ........eb......
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 10 1A 00 00 00 00 00 00 02 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 528]MD5 block AFTER, md5=d5872b07a0e30a6ccb7a72c7e225c576, hex=6562800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000101a0000000000000200000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f69e6319a621091449
size: 112
0000: 65 62 80 00 00 00 00 00 00 00 00 00 00 00 00 00    eb..............
0010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 10 1A 00 00 00 00 00 00    ................
0040: 02 00 00 00 56 B7 C9 E9 79 A4 1B D7 DB 81 10 24    ....V...y......$
0050: D9 88 10 68 AF F7 14 9B B1 5B 1F FF BE D7 1C 88    ...h.....[......
0060: 22 61 66 66 93 61 66 F6 9E 63 19 A6 21 09 14 49    "aff.af..c..!..I
^-----------------------------------------------------------------------------^
====== OnEnter count=5 ======

>-----------------------------------------------------------------------------<
[15:40:36 528]MD5 state BEFORE, md5=c3190b7914a7bc0205d16a58043e3ffb, hex=2e78e6707d75491678e5da9b283878a78002000000000000ff13ab6158bdd61953cdab36153843ae8000000000000000000000000000000000000000000000000000000000000000000000000000000080020000000000001000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: 2E 78 E6 70 7D 75 49 16 78 E5 DA 9B 28 38 78 A7    .x.p}uI.x...(8x.
0010: 80 02 00 00 00 00 00 00 FF 13 AB 61 58 BD D6 19    ...........aX...
0020: 53 CD AB 36 15 38 43 AE 80 00 00 00 00 00 00 00    S..6.8C.........
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 80 02 00 00 00 00 00 00 10 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 528]MD5 block BEFORE, md5=ef3a2bc9806e3b63a6d3f6b0a98215d7, hex=ff13ab6158bdd61953cdab36153843ae8000000000000000000000000000000000000000000000000000000000000000000000000000000080020000000000001000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f69e6319a621091449
size: 112
0000: FF 13 AB 61 58 BD D6 19 53 CD AB 36 15 38 43 AE    ...aX...S..6.8C.
0010: 80 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 80 02 00 00 00 00 00 00    ................
0040: 10 00 00 00 56 B7 C9 E9 79 A4 1B D7 DB 81 10 24    ....V...y......$
0050: D9 88 10 68 AF F7 14 9B B1 5B 1F FF BE D7 1C 88    ...h.....[......
0060: 22 61 66 66 93 61 66 F6 9E 63 19 A6 21 09 14 49    "aff.af..c..!..I
^-----------------------------------------------------------------------------^
====== OnLeave ======

>-----------------------------------------------------------------------------<
[15:40:36 529]MD5 state AFTER, md5=097f4b9e3be0a8be639c9ce5f4478728, hex=babee4f868c3e3c94b9b5781b0d714608002000000000000ff13ab6158bdd61953cdab36153843ae8000000000000000000000000000000000000000000000000000000000000000000000000000000080020000000000001000000056b7c9e979a41bd7db811024d9881068aff7149b
size: 112
0000: BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60    ....h...K.W....`
0010: 80 02 00 00 00 00 00 00 FF 13 AB 61 58 BD D6 19    ...........aX...
0020: 53 CD AB 36 15 38 43 AE 80 00 00 00 00 00 00 00    S..6.8C.........
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 80 02 00 00 00 00 00 00 10 00 00 00 56 B7 C9 E9    ............V...
0060: 79 A4 1B D7 DB 81 10 24 D9 88 10 68 AF F7 14 9B    y......$...h....
^-----------------------------------------------------------------------------^

>-----------------------------------------------------------------------------<
[15:40:36 529]MD5 block AFTER, md5=ef3a2bc9806e3b63a6d3f6b0a98215d7, hex=ff13ab6158bdd61953cdab36153843ae8000000000000000000000000000000000000000000000000000000000000000000000000000000080020000000000001000000056b7c9e979a41bd7db811024d9881068aff7149bb15b1fffbed71c8822616666936166f69e6319a621091449
size: 112
0000: FF 13 AB 61 58 BD D6 19 53 CD AB 36 15 38 43 AE    ...aX...S..6.8C.
0010: 80 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 80 02 00 00 00 00 00 00    ................
0040: 10 00 00 00 56 B7 C9 E9 79 A4 1B D7 DB 81 10 24    ....V...y......$
0050: D9 88 10 68 AF F7 14 9B B1 5B 1F FF BE D7 1C 88    ...h.....[......
0060: 22 61 66 66 93 61 66 F6 9E 63 19 A6 21 09 14 49    "aff.af..c..!..I
^-----------------------------------------------------------------------------^
```

我们来看一看吧，先看 `2e78e6707d75491678e5da9b283878a7` ，它最早出现在 `count2的OnLeave` ，第二次出现在 `count5的OnEnter` ，count5的OnLeave结果是这个

```
0000: BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60    ....h...K.W....`
```

这个上面我们提到过，不过这里不是重点

我们来看 `count2的OnEnter`

```
0000: 76 54 32 10 FE DC BA 98 89 AB CD EF 01 23 45 67    vT2..........#Eg
```

这是MD5的标准iv，我们可以看做是 `初始状态` ，那么 `count2 -> count5` 是一个整体

再来看 `ff13ab6158bdd61953cdab36153843ae` ，它首次出现在 `count4的OnLeave` 里，并且是出现在 `state` 参数里，第二次出现在 `count5的OnEnter` 里，但是这次却是出现在了 `block` 里，上述 `block` 里多次提到过出现了大量 `0x36` `0x5c` ，我们怀疑这是 `HMAC` ，那么既然是 `HMAC` ，那么这里的 `block` 就相当于是待加密的数据，根据上面的分析， `state` 是最终的结果，这里把上次的 `state` 放在了这次的 `block` 中作为 `盐值` ，那么我们可以预测到，下一次输出的 `state` 就是最终结果，事实也确实如此，更加佐证了我们的猜想。

我们现在来看看 `count4的OnEnter` ，state是

```
0000: E3 A1 BA DA 5E EC 8C 5A 23 A2 CF 1C 48 BA C4 BE    ....^..Z#...H...
```

它是 `count3的OnLeave` ， `count3的OnEnter` 来自 `count1的OnLeave` ， `count1的OnEnter` 是标准的MD5 iv，所以count1就是第一轮，所以这次的流程是

`count1 -> count3 -> count4` 之后把 `count4` 的 `state` 附加到 `count5的block` 开头，再进行计算

这一块我可能表达的不够清楚，但是读者多读两遍，应该就能理解了，这个东西意会一下吧

我们观察到两组数据最终都会进到 `count5` ，我们从这入手

也就是说 `2e78e6707d75491678e5da9b283878a7` 实际上是作为state参与计算， `ff13ab6158bdd61953cdab36153843ae` 是附加到msg前面，作为 `block` 参与计算，最终计算得出 `BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60`

这两条分支最开始都是使用的原始的MD5 iv进行计算的，只有初始的 `block` 不一致，所以现在目标就转变为了追踪两条分支 `block` 的来源，我们来看看初始 `block` 都是啥

count1：

```yaml
>-----------------------------------------------------------------------------<
[15:40:36 516]MD5 block AFTER, md5=18a5f5457839ff68282a91c4c8497983, hex=6f7e82cd2fde22b8cd40c8a3d96b4b9b4701c70c9e888570d50c5d0834dd9a5b621e70241f46fdff5af479f5854ef8d653d1322c06a703976c2bb6b019a98bed363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636363636
size: 112
0000: 6F 7E 82 CD 2F DE 22 B8 CD 40 C8 A3 D9 6B 4B 9B    o~../."..@...kK.
0010: 47 01 C7 0C 9E 88 85 70 D5 0C 5D 08 34 DD 9A 5B    G......p..].4..[
0020: 62 1E 70 24 1F 46 FD FF 5A F4 79 F5 85 4E F8 D6    b.p$.F..Z.y..N..
0030: 53 D1 32 2C 06 A7 03 97 6C 2B B6 B0 19 A9 8B ED    S.2,....l+......
0040: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0050: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
0060: 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36 36    6666666666666666
^-----------------------------------------------------------------------------^
```

count2：

```yaml
>-----------------------------------------------------------------------------<
[15:40:36 517]MD5 block BEFORE, md5=872f30250336005a140f9187edcf71e5, hex=0514e8a745b448d2a72aa2c9b30121f12d6bad66f4e2ef1abf6637625eb7f03108741a4e752c9795309e139fef2492bc39bb58466ccd69fd0641dcda73c3e1875c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c
size: 112
0000: 05 14 E8 A7 45 B4 48 D2 A7 2A A2 C9 B3 01 21 F1    ....E.H..*....!.
0010: 2D 6B AD 66 F4 E2 EF 1A BF 66 37 62 5E B7 F0 31    -k.f.....f7b^..1
0020: 08 74 1A 4E 75 2C 97 95 30 9E 13 9F EF 24 92 BC    .t.Nu,..0....$..
0030: 39 BB 58 46 6C CD 69 FD 06 41 DC DA 73 C3 E1 87    9.XFl.i..A..s...
0040: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0050: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
0060: 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C 5C    \\\\\\\\\\\\\\\\
^-----------------------------------------------------------------------------^
```

一个填充了大量0x36，另一个填充大量0x5c，如果按照标准HMAC来的话，那么是同一块数据与上述两个值做异或的，我们现在再次分别异或上述两个值，看看是不是同一组数据，两组重新异或之后的结果都是

```
59 48 B4 FB 19 E8 14 8E FB 76 FE 95 EF 5D 7D AD
71 37 F1 3A A8 BE B3 46 E3 3A 6B 3E 02 EB AC 6D
54 28 46 12 29 70 CB C9 6C C2 4F C3 B3 78 CE E0
65 E7 04 1A 30 91 35 A1 5A 1D 80 86 2F 9F BD DB
```

### 数据来源追踪

这一块倒是没有改，我们去tarce日志里搜搜这部分数据吧

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/23.png)

```
>-----------------------------------------------------------------------------<
[16:58:13 973]memcpy 写入地址 0x40461000 读取地址 0x4045b290, md5=59a7513d029ae66079e77a8da1b56094, hex=5948b4fb19e8148efb76fe95ef5d7dad7137f13aa8beb346e33a6b3e02ebac6d542846122970cbc96cc24fc3b378cee065e7041a309135a15a1d80862f9fbddb
size: 64
0000: 59 48 B4 FB 19 E8 14 8E FB 76 FE 95 EF 5D 7D AD    YH.......v...]}.
0010: 71 37 F1 3A A8 BE B3 46 E3 3A 6B 3E 02 EB AC 6D    q7.:...F.:k>...m
0020: 54 28 46 12 29 70 CB C9 6C C2 4F C3 B3 78 CE E0    T(F.)p..l.O..x..
0030: 65 E7 04 1A 30 91 35 A1 5A 1D 80 86 2F 9F BD DB    e...0.5.Z.../...
^-----------------------------------------------------------------------------^
```

`traceWrite` 跟踪一下

```
emulator.traceWrite(0x4045b290, 0x4045b290 +0x40);
```

这里要在 `callJNI_OnLoad` 之前进行监控，因为刚开始我是在函数执行时trace的，结果是监控不到这块内存的写入，那也侧面说明这块内存的写入是发生在JNI_OnLoad里的

```kotlin
>-----------------------------------------------------------------------------<
[19:31:44 223]memcpy 写入地址 0x4045b290 读取地址 0x4045e010, md5=59a7513d029ae66079e77a8da1b56094, hex=5948b4fb19e8148efb76fe95ef5d7dad7137f13aa8beb346e33a6b3e02ebac6d542846122970cbc96cc24fc3b378cee065e7041a309135a15a1d80862f9fbddb
size: 64
0000: 59 48 B4 FB 19 E8 14 8E FB 76 FE 95 EF 5D 7D AD    YH.......v...]}.
0010: 71 37 F1 3A A8 BE B3 46 E3 3A 6B 3E 02 EB AC 6D    q7.:...F.:k>...m
0020: 54 28 46 12 29 70 CB C9 6C C2 4F C3 B3 78 CE E0    T(F.)p..l.O..x..
0030: 65 E7 04 1A 30 91 35 A1 5A 1D 80 86 2F 9F BD DB    e...0.5.Z.../...
^-----------------------------------------------------------------------------^
[19:31:44 224] Memory WRITE at 0x4045b290, data size = 8, data value = 0x8e14e819fbb44859, PC=RX@0x4028c220[libc.so]0x1c220, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
[19:31:44 224] Memory WRITE at 0x4045b298, data size = 8, data value = 0xad7d5def95fe76fb, PC=RX@0x4028c220[libc.so]0x1c220, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
[19:31:44 224] Memory WRITE at 0x4045b2a0, data size = 8, data value = 0x46b3bea83af13771, PC=RX@0x4028c224[libc.so]0x1c224, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
[19:31:44 224] Memory WRITE at 0x4045b2a8, data size = 8, data value = 0x6daceb023e6b3ae3, PC=RX@0x4028c224[libc.so]0x1c224, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
[19:31:44 224] Memory WRITE at 0x4045b2b0, data size = 8, data value = 0xc9cb702912462854, PC=RX@0x4028c228[libc.so]0x1c228, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
[19:31:44 224] Memory WRITE at 0x4045b2b8, data size = 8, data value = 0xe0ce78b3c34fc26c, PC=RX@0x4028c228[libc.so]0x1c228, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
[19:31:44 224] Memory WRITE at 0x4045b2c0, data size = 8, data value = 0xa13591301a04e765, PC=RX@0x4028c22c[libc.so]0x1c22c, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
[19:31:44 224] Memory WRITE at 0x4045b2c8, data size = 8, data value = 0xdbbd9f2f86801d5a, PC=RX@0x4028c22c[libc.so]0x1c22c, LR=RX@0x4004b4e4[libshield.so]0x4b4e4
```

继续追踪

```
emulator.traceWrite(0x4045e010, 0x4045e010 + 0x40);
```

```kotlin
[19:32:58 898] Memory WRITE at 0x4045e010, data size = 8, data value = 0x8e14e819fbb44859, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e018, data size = 8, data value = 0xad7d5def95fe76fb, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e020, data size = 8, data value = 0x46b3bea83af13771, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e028, data size = 8, data value = 0x6daceb023e6b3ae3, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e030, data size = 8, data value = 0xc9cb702912462854, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e038, data size = 8, data value = 0xe0ce78b3c34fc26c, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e040, data size = 8, data value = 0xa13591301a04e765, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e048, data size = 8, data value = 0xdbbd9f2f86801d5a, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e050, data size = 8, data value = 0x1010101010101010, PC=RX@0x40052a6c[libshield.so]0x52a6c, LR=RX@0x40052998[libshield.so]0x52998
[19:32:58 899] Memory WRITE at 0x4045e050, data size = 8, data value = 0x0000000000000000, PC=RX@0x4028c688[libc.so]0x1c688, LR=RX@0x4004b4c4[libshield.so]0x4b4c4
[19:32:58 900] Memory WRITE at 0x4045e050, data size = 8, data value = 0x0000000000000000, PC=RX@0x4028c694[libc.so]0x1c694, LR=RX@0x4004b4c4[libshield.so]0x4b4c4

>-----------------------------------------------------------------------------<
[19:32:58 900]memcpy 写入地址 0x4045b290 读取地址 0x4045e010, md5=59a7513d029ae66079e77a8da1b56094, hex=5948b4fb19e8148efb76fe95ef5d7dad7137f13aa8beb346e33a6b3e02ebac6d542846122970cbc96cc24fc3b378cee065e7041a309135a15a1d80862f9fbddb
size: 64
0000: 59 48 B4 FB 19 E8 14 8E FB 76 FE 95 EF 5D 7D AD    YH.......v...]}.
0010: 71 37 F1 3A A8 BE B3 46 E3 3A 6B 3E 02 EB AC 6D    q7.:...F.:k>...m
0020: 54 28 46 12 29 70 CB C9 6C C2 4F C3 B3 78 CE E0    T(F.)p..l.O..x..
0030: 65 E7 04 1A 30 91 35 A1 5A 1D 80 86 2F 9F BD DB    e...0.5.Z.../...
^-----------------------------------------------------------------------------^
```

跳到PC位置看看吧，来到函数 `sub_5290C` ，这里直接下个断点看看吧先

```yaml
m0x4045e000

>-----------------------------------------------------------------------------<
[19:40:05 779]RW@0x4045e000, md5=aafb74d7a512f77fe8ec334314f77291, hex=040000000000000000000000000000005948b4fb19e8148efb76fe95ef5d7dad7137f13aa8beb346e33a6b3e02ebac6d542846122970cbc96cc24fc3b378cee065e7041a309135a15a1d80862f9fbddb1010101010101010101010101010101000000000000000000000000000000000
size: 112
0000: 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0010: 59 48 B4 FB 19 E8 14 8E FB 76 FE 95 EF 5D 7D AD    YH.......v...]}.
0020: 71 37 F1 3A A8 BE B3 46 E3 3A 6B 3E 02 EB AC 6D    q7.:...F.:k>...m
0030: 54 28 46 12 29 70 CB C9 6C C2 4F C3 B3 78 CE E0    T(F.)p..l.O..x..
0040: 65 E7 04 1A 30 91 35 A1 5A 1D 80 86 2F 9F BD DB    e...0.5.Z.../...
0050: 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

第二个参数是 `buffer` ，函数结束会把数据写到这块内存，现在来看看这个函数的逻辑

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/24.png)

先看看回调函数里是啥吧，v37还是很重要的，回调函数是 `sub_5290C` 的调用者传入的，所以交叉引用一下就能定位到了

```cpp
__int64 __fastcall sub_51868(__int64 a1, __int64 a2, unsigned __int64 a3, __int64 a4, unsigned __int64 a5, int a6)
{
  if ( a6 )
    return sub_526D0(a1, a2, a3, a4, a5, off_108CB0);
  else
    return sub_5290C(a1, a2, a3, a4, a5, (__int64 (__fastcall *)(__int64, _BYTE *, __int64))off_108D80);
}
```

这里有两个分支，但是我们当前走的是下面这个分支，即 `sub_522F4` 函数，点进去看看

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/25.png)

```
LOAD:00000000000C35E8 qword_C35E8     DCQ 0x38A53630D56A0952, 0xFBD7F3819EA340BF, 0x87FF2F9B8239E37C
LOAD:00000000000C35E8                                         ; DATA XREF: sub_522F4+278↑o
LOAD:00000000000C3600                 DCQ 0xCBE9DEC444438E34, 0x3D23C2A632947B54, 0x4EC3FA420B954CEE
LOAD:00000000000C3618                 DCQ 0xB224D92866A12E08, 0x25D18B6D49A25B76, 0x1698688664F6F872
LOAD:00000000000C3630                 DCQ 0x92B6655DCC5CA4D4, 0xDAB9EDFD5048706C, 0x849D8DA75746155E
LOAD:00000000000C3648                 DCQ 0xAD3BC8C00ABD890, 0x645B3B80558E4F7, 0x20F3FCA8F1E2CD0
LOAD:00000000000C3660                 DCQ 0x6B8A130103BDAFC1, 0xEADC674F4111913A, 0x73E6B4F0CECFF297
LOAD:00000000000C3678                 DCQ 0x8535ADE72274AC96, 0x6EDF751CE837F9E2, 0x89C5291D711AF147
LOAD:00000000000C3690                 DCQ 0x1BBE18AA0E62B76F, 0x2079D2C64B3E56FC, 0xF45ACD78FEC0DB9A
LOAD:00000000000C36A8                 DCQ 0x31C7078833A8DD1F, 0x5FEC8027591012B1, 0xD4AB519A97F5160
LOAD:00000000000C36C0                 DCQ 0xEF9CC9939F7AE52D, 0xB0F52AAE4D3BE0A0, 0x619953833CBBEBC8
LOAD:00000000000C36D8                 DCQ 0x26D677BA7E042B17, 0x7D0C2155631469E1
```

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/26.png)

```
//逆S盒
static const uint8_t SboxIV[256] = {
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e,
    0x81, 0xf3, 0xd7, 0xfb, 0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87,
    0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb, 0x54, 0x7b, 0x94, 0x32,
    0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49,
    0x6d, 0x8b, 0xd1, 0x25, 0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16,
    0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92, 0x6c, 0x70, 0x48, 0x50,
    0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05,
    0xb8, 0xb3, 0x45, 0x06, 0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02,
    0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b, 0x3a, 0x91, 0x11, 0x41,
    0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8,
    0x1c, 0x75, 0xdf, 0x6e, 0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89,
    0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b, 0xfc, 0x56, 0x3e, 0x4b,
    0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59,
    0x27, 0x80, 0xec, 0x5f, 0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d,
    0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef, 0xa0, 0xe0, 0x3b, 0x4d,
    0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63,
    0x55, 0x21, 0x0c, 0x7d};
```

和IDA里查看到的一模一样，这是个AES的逆s盒， `unk_CxxE8` 是te表，咋俩并没有被魔改，这个函数是用来做AES解密的，s盒和逆s盒主要是为了减少运算时列混淆操作的耗时，通过查表替换有限域上的矩阵乘法，这样可以减少耗时。感兴趣可以看看这篇 [AES查表优化](https://www.cnblogs.com/kentle/p/15529251.html)

### AES 解密过程分析

我们来验证一下这个函数是不是标准AES，在这之前我们得确定三个参数的含义，首先分析一下代码，可以知道v4是循环的轮数，由于 `v4 = (int)a3[60] >> 1;`，所以下个断点，看看 `*a3 + 240` 的值是啥，调试时发现这个函数被调用了六次，每次a3的值都是不变的，对应偏移的地方的值是 `0x0A` ，那左移1，值就是5，标准AES128是10轮，AES256是14轮，没有5轮的，这里结合trace日志验证一下

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/27.png)

确实是5轮，接下来看看初始秘钥

```cpp
v3 = _byteswap_ulong(*a1) ^ *a3;              // 初始秘钥
v4 = (int)a3[60] >> 1;                        // 轮数，这里v4 = 5
v5 = _byteswap_ulong(a1[1]) ^ a3[1];
v6 = 8LL * (unsigned int)(v4 - 1);
v7 = a3 + 6;
v8 = _byteswap_ulong(a1[2]) ^ a3[2];
for ( i = _byteswap_ulong(a1[3]) ^ a3[3]; ; i = v21 ^ v20 ) {
    ...
    v3 = v14 ^ v15;                             // addRoundKey
    v5 = v17 ^ v16;
    v8 = v18 ^ v19;
}
```

可以看到v3, v5， v8，i 是秘钥的四块，由于标准AES秘钥是16字节，四块每块四字节，AES的轮密钥加是state和key逐字节异或，我们来验证一下第一轮之后的key是什么

按照标准AES来，这是a3的前16字节

```
0000: CA 5B B7 6B AD 24 0F 67 9D E6 B7 DF BC 10 33 D3    .[.k.$.g......3.
```

那么按照反编译代码的逻辑，或者直接去看trace日志也行

```toml
w0 = 0xb1789ff7
w1 = 0xf858bae3
w2 = 0xc3be71e4
w3 = 0x12d6d4cb
```

这是初始秘钥(主秘钥)，初始秘钥会经过秘钥编排算法生成K0(第一个轮秘钥)，其中 $$ W_n = g(W\_{n-1}),\\text{ xor }, W\_{n-4} $$

这是W4 W8 W12......的生成逻辑，那么W4 = g(W3) xor W0，那么就只有g函数比较重要了

g函数包含三个步骤： 循环左移、S盒替换、字节异或

1.  循环左移
    
    W3 = 0xd6d4cb12
    
2.  (逆)S盒替换，就是把W3的各位作为索引，去取S盒里的值
    
    W3 = 0x4be294ab
    
    那就说明没有循环左移这个环节，这一点从反编译的代码也可以看出
    

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/28.png)

可以看到，这里赋值完就直接查表了，查的表是TD表，但是神奇的是这里它有4张TD表，每个表的关系也比较微妙，每张表都是上一张表循环右移的结果

说明循环左移的步骤也被省去了，而用四张对应的表代替了这个过程，由于反编译出来的代码还是很简单的，一百行左右，表我们也都已经拿到了，这里直接丢给ai，让它帮我们还原一下就可以了

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/29.png)

算法整体流程如下

```css
┌─────────────────────────────────────────────────────────┐
│                      输入 (16字节)                       │
│              a1[0-3], a1[4-7], a1[8-11], a1[12-15]      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Step 1: 初始轮密钥加 (AddRoundKey)          │
│  v3 = BE32(a1[0:4]) ^ a3[0]                             │
│  v5 = BE32(a1[4:8]) ^ a3[1]                             │
│  v8 = BE32(a1[8:12]) ^ a3[2]                            │
│  i  = BE32(a1[12:16]) ^ a3[3]                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Step 2: 主循环 (T-Table变换)                │
│                                                         │
│  for round = 1 to (轮数-1):                             │
│      // 使用TD0-TD3进行合并的逆变换                       │
│      v28 = TD0[...] ^ TD1[...] ^ TD2[...] ^ TD3[...]    │
│            ^ RoundKey                                   │
│      v29 = ...                                          │
│      v30 = ...                                          │
│      v31 = ...                                          │
│                                                         │
│      // 每轮消耗8个DWORD的密钥                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Step 3: 最后一轮 (S盒替换)                  │
│                                                         │
│  // 仅使用逆S盒，不使用T-Table                           │
│  out0 = (SBOX[b0]<<24 | SBOX[b1]<<16 | ...) ^ key       │
│  out1 = ...                                             │
│  out2 = ...                                             │
│  out3 = ...                                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     输出 (16字节)                        │
│              a2[0-3], a2[4-7], a2[8-11], a2[12-15]      │
└─────────────────────────────────────────────────────────┘
```

先看看秘钥来源吧，看看是不是写死的

### AES 密钥来源

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/30.png)

v18是秘钥，可以看到生成秘钥的函数是这个 `sub_51CB8` ， `sub_51CB8` 又会调用 `sub_51884` ， `sub_51884` 会接收 `deviceid` 的部分数据，这两个函数先不管他们，先看看参数是如何传递的吧

秘钥来自v16，v16来自a3，查看一下交叉引用

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/31.png)

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/32.png)

```
JNIEnv->GetStringUtfChars("0d7eee2c-5d77-3c26-99f8-a5a2c9e08aeb") was called from RX@0x40017d10[libshield.so]0x17d10
```

这个就是 `deviceId` ，但是们断在 `sub_51CB8` 函数处，v16的值是

```
0000: 30 64 37 65 65 65 32 63 2D 35 64 37 37 2D 33 63    0d7eee2c-5d77-3c
0010: 31 01 32 34 04 02 08 61 66 7A 66 66 07 17 66 39    1.24...afzff..f9
```

第二行实际上是来自v17，v17和v16在内存上连续，其中 `v17 = xmmword_C0134;`

```
LOAD:00000000000C0134 xmmword_C0134   DCB 0x31, 1, 0x32, 0x34, 4, 2, 8, 0x61, 0x66, 0x7A, 0x66
LOAD:00000000000C0134                                         ; DATA XREF: sub_4AFF4+40↑o
LOAD:00000000000C0134                                         ; sub_4AFF4+48↑r ...
LOAD:00000000000C013F                 DCB 0x66, 7, 0x17, 0x66, 0x39
```

现在再来分析刚刚的两个函数，这里我直接把代码复制过来吧

sub_51CB8

```cpp
__int64 __fastcall sub_51CB8(__int64 a1, __int64 a2, _DWORD *a3)
{
  __int64 result; // x0
  __int64 v5; // x9
  _DWORD *v6; // x11
  int v7; // w12
  __int64 v8; // x8
  int *v9; // x9
  int *v10; // x10
  __int64 v11; // x11
  int v12; // w13
  bool v13; // cc
  int v14; // w13
  int v15; // w13
  int v16; // w13
  int *v17; // x8
  int v18; // w9
  int v19; // w16
  int v20; // w17
  int v21; // w18

  result = sub_51884();
  if ( (result & 0x80000000) == 0 )
  {
    v5 = (int)a3[60];
    if ( (int)v5 >= 1 )
    {
      v6 = &a3[4 * v5];
      v7 = 4 * v5 - 4;
      v8 = 0;
      v9 = a3 + 2;
      v10 = v6 + 2;
      v11 = v7;
      do
      {
        v12 = *(v9 - 2);
        v8 += 4;
        v13 = v8 < v11;
        *(v9 - 2) = *(v10 - 2);
        *(v10 - 2) = v12;
        v14 = *(v9 - 1);
        v11 -= 4;
        *(v9 - 1) = *(v10 - 1);
        *(v10 - 1) = v14;
        v15 = *v9;
        *v9 = *v10;
        *v10 = v15;
        v16 = v9[1];
        v9[1] = v10[1];
        v10[1] = v16;
        v9 += 4;
        v10 -= 4;
      }
      while ( v13 );
      if ( (int)a3[60] >= 2 )
      {
        v17 = a3 + 7;
        v18 = 1;
        do
        {
          ++v18;
          v19 = *((_DWORD *)&loc_C29E8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE2(*(v17 - 2))))
              ^ *((_DWORD *)&unk_C25E8 + *((unsigned __int8 *)qword_C21C0 + 4 * HIBYTE(*(v17 - 2))))
              ^ *((_DWORD *)&unk_C2DE8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE1(*(v17 - 2))))
              ^ *((_DWORD *)&unk_C31E8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)*(v17 - 2)));
          v20 = *((_DWORD *)&loc_C29E8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE2(*(v17 - 1))))
              ^ *((_DWORD *)&unk_C25E8 + *((unsigned __int8 *)qword_C21C0 + 4 * HIBYTE(*(v17 - 1))))
              ^ *((_DWORD *)&unk_C2DE8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE1(*(v17 - 1))))
              ^ *((_DWORD *)&unk_C31E8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)*(v17 - 1)));
          v21 = *((_DWORD *)&loc_C29E8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE2(*v17)))
              ^ *((_DWORD *)&unk_C25E8 + *((unsigned __int8 *)qword_C21C0 + 4 * HIBYTE(*v17)))
              ^ *((_DWORD *)&unk_C2DE8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE1(*v17)))
              ^ *((_DWORD *)&unk_C31E8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)*v17));
          *(v17 - 3) = *((_DWORD *)&loc_C29E8
                       + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE2(*(v17 - 3))))
                     ^ *((_DWORD *)&unk_C25E8 + *((unsigned __int8 *)qword_C21C0 + 4 * HIBYTE(*(v17 - 3))))
                     ^ *((_DWORD *)&unk_C2DE8
                       + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)BYTE1(*(v17 - 3))))
                     ^ *((_DWORD *)&unk_C31E8 + *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)*(v17 - 3)));
          *(v17 - 2) = v19;
          *(v17 - 1) = v20;
          *v17 = v21;
          v17 += 4;
        }
        while ( v18 < a3[60] );
      }
    }
    return 1;
  }
  return result;
}
```

sub_51884

```cpp
__int64 __fastcall sub_51884(unsigned int *a1, int a2, unsigned int *a3)
{
  unsigned int v3; // w8
  int v4; // w8
  unsigned int v5; // w8
  __int64 v6; // x9
  unsigned int *v7; // x10
  int v8; // w16
  int v9; // w18
  int v10; // w17
  int v11; // w17
  __int64 v12; // x9
  unsigned int *i; // x10
  int v14; // w17
  int v15; // w16
  int v16; // w18
  int v17; // w17
  int v18; // w0
  __int64 v19; // x9
  unsigned int *j; // x10
  unsigned int v21; // w17
  int v22; // w18
  int v23; // w0
  int v24; // w16
  int v25; // w18
  int v26; // w17
  int v27; // w0
  unsigned int v28; // w17

  v3 = 0;
  if ( a1 )
  {
    if ( a3 )
    {
      if ( a2 == 128 || a2 == 256 || (v3 = 0, a2 == 192) )
      {
        if ( a2 == 128 )
        {
          v4 = 10;
        }
        else if ( a2 == 192 )
        {
          v4 = 12;
        }
        else
        {
          v4 = 14;
        }
        a3[60] = v4;
        v5 = _byteswap_ulong(*a1) ^ 0xF1892131;
        *a3 = v5;
        a3[1] = _byteswap_ulong(a1[1]) ^ 0xFF001123;
        a3[2] = _byteswap_ulong(a1[2]) ^ 0xF1001356;
        a3[3] = _byteswap_ulong(a1[3]) ^ 0xF1234890;
        if ( a2 == 128 )
        {
          v6 = 0;
          v7 = a3 + 4;
          do
          {
            v8 = *(v7 - 1);
            v5 ^= *((_DWORD *)qword_C15C0 + BYTE2(v8))
                & 0xFF000000
                ^ *((_DWORD *)qword_C19C0 + BYTE1(v8))
                & 0xFF0000
                ^ *((_DWORD *)qword_C1DC0 + (unsigned __int8)v8)
                & 0xFF00
                ^ *((unsigned __int8 *)qword_C21C0 + 4 * HIBYTE(v8))
                ^ *(_DWORD *)((char *)&unk_C25C0 + v6);
            v9 = *(v7 - 2);
            v6 += 4;
            v10 = *(v7 - 3) ^ v5;
            *v7 = v5;
            v7[1] = v10;
            v11 = v9 ^ v10;
            v7[2] = v11;
            v7[3] = v8 ^ v11;
            v7 += 4;
          }
          while ( v6 != 40 );
        }
        else
        {
          a3[4] = _byteswap_ulong(a1[4]);
          a3[5] = _byteswap_ulong(a1[5]);
          if ( a2 == 192 )
          {
            v12 = 0;
            for ( i = a3 + 6; ; i += 6 )
            {
              v15 = *(i - 1);
              v5 ^= *((_DWORD *)qword_C15C0 + BYTE2(v15))
                  & 0xFF000000
                  ^ *((_DWORD *)qword_C19C0 + BYTE1(v15))
                  & 0xFF0000
                  ^ *((_DWORD *)qword_C1DC0 + (unsigned __int8)v15)
                  & 0xFF00
                  ^ *((unsigned __int8 *)qword_C21C0 + 4 * HIBYTE(v15))
                  ^ *(_DWORD *)((char *)&unk_C25C0 + v12);
              v16 = *(i - 3);
              v17 = *(i - 5) ^ v5;
              v18 = *(i - 4) ^ v17;
              *i = v5;
              i[1] = v17;
              i[2] = v18;
              i[3] = v16 ^ v18;
              if ( v12 == 28 )
                break;
              v12 += 4;
              v14 = *(i - 2) ^ v16 ^ v18;
              i[4] = v14;
              i[5] = v15 ^ v14;
            }
          }
          else
          {
            a3[6] = _byteswap_ulong(a1[6]);
            a3[7] = _byteswap_ulong(a1[7]);
            v19 = 0;
            for ( j = a3 + 8; ; j += 8 )
            {
              v24 = *(j - 1);
              v5 ^= *((_DWORD *)qword_C15C0 + BYTE2(v24))
                  & 0xFF000000
                  ^ *((_DWORD *)qword_C19C0 + BYTE1(v24))
                  & 0xFF0000
                  ^ *((_DWORD *)qword_C1DC0 + (unsigned __int8)v24)
                  & 0xFF00
                  ^ *((unsigned __int8 *)qword_C21C0 + 4 * HIBYTE(v24))
                  ^ *(_DWORD *)((char *)&unk_C25C0 + v19);
              v25 = *(j - 5);
              v26 = *(j - 7) ^ v5;
              v27 = *(j - 6) ^ v26;
              *j = v5;
              j[1] = v26;
              j[2] = v27;
              j[3] = v25 ^ v27;
              if ( v19 == 24 )
                break;
              v28 = v25 ^ v27;
              v21 = *((_DWORD *)qword_C15C0 + HIBYTE(v28))
                  & 0xFF000000
                  ^ *(j - 4)
                  ^ *((_DWORD *)qword_C19C0 + BYTE2(v28))
                  & 0xFF0000
                  ^ *((_DWORD *)qword_C1DC0 + BYTE1(v28))
                  & 0xFF00
                  ^ *((unsigned __int8 *)qword_C21C0 + 4 * (unsigned __int8)v28);
              v22 = *(j - 2);
              v23 = *(j - 3) ^ v21;
              j[4] = v21;
              j[5] = v23;
              v19 += 4;
              j[6] = v22 ^ v23;
              j[7] = v24 ^ v22 ^ v23;
            }
          }
        }
        return 1;
      }
    }
  }
  return v3;
}
```

`sub_51CB8` 中并没有对a1(result)的引用，但是进入这个函数之后，立马调用了 `sub_51884` 函数，此时x0，x1这些寄存器都没有被改变，所以x0(a1)在 `sub_51884` 里被使用了，并且范围是 `a1[0] ~ a1[7]` 刚好 `4 * 8 = 32` 字节，就是我们刚刚找到的这一块数据

```
0000: 30 64 37 65 65 65 32 63 2D 35 64 37 37 2D 33 63    0d7eee2c-5d77-3c
0010: 31 01 32 34 04 02 08 61 66 7A 66 66 07 17 66 39    1.24...afzff..f9
```

秘钥的来源刚刚已经讲的很清晰了，接下来看 `sub_522F4` 的输入，即a1，一共用到了 `a1[0] - a1[3]` ，刚好16字节，最终的结果是a2，范围是 `a2[0]~a2[15]` ，也是16字节，a2并不参与中间态的计算，只作为结果输出，我们现在专注于a1就可以了

六次调用，a1的结果如下

```yaml
====== OnEnter sub_522F4  count=1 ======

>-----------------------------------------------------------------------------<
[22:43:08 555]a1 dump, md5=612afbe22d15f60afc40c532be2281e4, hex=dacfc43d9f579e4e1c099779c1e5c47740ea72e758d72270a10455d9c11237dfbd1c454b8aee82ef65f961f3d8862112ae6b962d77bd53504648222aeff0e23045a3b0a99d9541046c91a499f4cc37bc5126fbb0daea8da407b08acfc728042400000000000000000000000000000000
size: 112
0000: DA CF C4 3D 9F 57 9E 4E 1C 09 97 79 C1 E5 C4 77    ...=.W.N...y...w
0010: 40 EA 72 E7 58 D7 22 70 A1 04 55 D9 C1 12 37 DF    @.r.X."p..U...7.
0020: BD 1C 45 4B 8A EE 82 EF 65 F9 61 F3 D8 86 21 12    ..EK....e.a...!.
0030: AE 6B 96 2D 77 BD 53 50 46 48 22 2A EF F0 E2 30    .k.-w.SPFH"*...0
0040: 45 A3 B0 A9 9D 95 41 04 6C 91 A4 99 F4 CC 37 BC    E.....A.l.....7.
0050: 51 26 FB B0 DA EA 8D A4 07 B0 8A CF C7 28 04 24    Q&...........(.$
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
====== OnEnter sub_522F4  count=2 ======

>-----------------------------------------------------------------------------<
[22:43:08 559]a1 dump, md5=261378627e9b0285011922237d4e3767, hex=40ea72e758d72270a10455d9c11237dfbd1c454b8aee82ef65f961f3d8862112ae6b962d77bd53504648222aeff0e23045a3b0a99d9541046c91a499f4cc37bc5126fbb0daea8da407b08acfc72804240000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: 40 EA 72 E7 58 D7 22 70 A1 04 55 D9 C1 12 37 DF    @.r.X."p..U...7.
0010: BD 1C 45 4B 8A EE 82 EF 65 F9 61 F3 D8 86 21 12    ..EK....e.a...!.
0020: AE 6B 96 2D 77 BD 53 50 46 48 22 2A EF F0 E2 30    .k.-w.SPFH"*...0
0030: 45 A3 B0 A9 9D 95 41 04 6C 91 A4 99 F4 CC 37 BC    E.....A.l.....7.
0040: 51 26 FB B0 DA EA 8D A4 07 B0 8A CF C7 28 04 24    Q&...........(.$
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
====== OnEnter sub_522F4  count=3 ======

>-----------------------------------------------------------------------------<
[22:43:08 559]a1 dump, md5=e773d038d20950bad0c0e2f7859f8f23, hex=bd1c454b8aee82ef65f961f3d8862112ae6b962d77bd53504648222aeff0e23045a3b0a99d9541046c91a499f4cc37bc5126fbb0daea8da407b08acfc7280424000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: BD 1C 45 4B 8A EE 82 EF 65 F9 61 F3 D8 86 21 12    ..EK....e.a...!.
0010: AE 6B 96 2D 77 BD 53 50 46 48 22 2A EF F0 E2 30    .k.-w.SPFH"*...0
0020: 45 A3 B0 A9 9D 95 41 04 6C 91 A4 99 F4 CC 37 BC    E.....A.l.....7.
0030: 51 26 FB B0 DA EA 8D A4 07 B0 8A CF C7 28 04 24    Q&...........(.$
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
====== OnEnter sub_522F4  count=4 ======

>-----------------------------------------------------------------------------<
[22:43:08 560]a1 dump, md5=08b0999adc2621bc740de35b42716458, hex=ae6b962d77bd53504648222aeff0e23045a3b0a99d9541046c91a499f4cc37bc5126fbb0daea8da407b08acfc728042400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: AE 6B 96 2D 77 BD 53 50 46 48 22 2A EF F0 E2 30    .k.-w.SPFH"*...0
0010: 45 A3 B0 A9 9D 95 41 04 6C 91 A4 99 F4 CC 37 BC    E.....A.l.....7.
0020: 51 26 FB B0 DA EA 8D A4 07 B0 8A CF C7 28 04 24    Q&...........(.$
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
====== OnEnter sub_522F4  count=5 ======

>-----------------------------------------------------------------------------<
[22:43:08 560]a1 dump, md5=1b7c1fa84f9c2c1b04bbbb2aa16e187f, hex=45a3b0a99d9541046c91a499f4cc37bc5126fbb0daea8da407b08acfc72804240000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: 45 A3 B0 A9 9D 95 41 04 6C 91 A4 99 F4 CC 37 BC    E.....A.l.....7.
0010: 51 26 FB B0 DA EA 8D A4 07 B0 8A CF C7 28 04 24    Q&...........(.$
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
====== OnEnter sub_522F4  count=6 ======

>-----------------------------------------------------------------------------<
[22:43:08 561]a1 dump, md5=5ee654bf6bb57fbc42fb57273b1ec8b1, hex=5126fbb0daea8da407b08acfc7280424000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: 51 26 FB B0 DA EA 8D A4 07 B0 8A CF C7 28 04 24    Q&...........(.$
0010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

刚好96字节，一次处理6字节，每次处理16字节，完全对得上

这块数据来自sub_5290C的x0，继续往上找，找到sub_4B39C的a1，最终来到熟悉的地方

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/33.png)

### 参数来源与解码

是调用了 `GetByteArrayElements` 函数，我们可以去unidbg里看看日志

```sql
get key:main
JNIEnv->CallObjectMethodV(android.content.SharedPreferences@31c88ec8, getString("main", "") => "") was called from RX@0x40013bf4[libshield.so]0x13bf4
JNIEnv->NewStringUTF("main_hmac") was called from RX@0x400bc54c[libshield.so]0xbc54c
JNIEnv->NewStringUTF("") was called from RX@0x400bc564[libshield.so]0xbc564
get key:main_hmac
JNIEnv->CallObjectMethodV(android.content.SharedPreferences@31c88ec8, getString("main_hmac", "") => "2s/EPZ9Xnk4cCZd5weXEd0DqcudY1yJwoQRV2cESN9+9HEVLiu6C72X5YfPYhiESrmuWLXe9U1BGSCIq7/DiMEWjsKmdlUEEbJGkmfTMN7xRJvuw2uqNpAewis/HKAQk") was called from RX@0x40013bf4[libshield.so]0x13bf4
JNIEnv->GetStringUTFLength("2s/EPZ9Xnk4cCZd5weXEd0DqcudY1yJwoQRV2cESN9+9HEVLiu6C72X5YfPYhiESrmuWLXe9U1BGSCIq7/DiMEWjsKmdlUEEbJGkmfTMN7xRJvuw2uqNpAewis/HKAQk") was called from RX@0x400bc598[libshield.so]0xbc598
JNIEnv->GetStringUTFLength("2s/EPZ9Xnk4cCZd5weXEd0DqcudY1yJwoQRV2cESN9+9HEVLiu6C72X5YfPYhiESrmuWLXe9U1BGSCIq7/DiMEWjsKmdlUEEbJGkmfTMN7xRJvuw2uqNpAewis/HKAQk") was called from RX@0x40017c2c[libshield.so]0x17c2c
JNIEnv->CallStaticObjectMethodV(class com/xingin/shield/http/Base64Helper, decode("2s/EPZ9Xnk4cCZd5weXEd0DqcudY1yJwoQRV2cESN9+9HEVLiu6C72X5YfPYhiESrmuWLXe9U1BGSCIq7/DiMEWjsKmdlUEEbJGkmfTMN7xRJvuw2uqNpAewis/HKAQk") => [B@c33b74f) was called from RX@0x40014000[libshield.so]0x14000
JNIEnv->GetByteArrayElements(false) => [B@c33b74f was called from RX@0x40017cd8[libshield.so]0x17cd8
```

可以看到他先调用了java层的函数 `android/content/SharedPreferences->getString` ，然后根据key拿到对应的value，接着调用 `Base64Helper->decode` 进行解码，然后再进行java2c数组转换，验证一下吧

![](⚠️ https://yuuki.cool/posts/xhsshield/%E5%B0%8F%E7%BA%A2%E4%B9%A6shield/34.png)

ok一模一样，至此三个参数就分析完了

### 0x33 小结

总结一下，原始数据如下：

1.  main_hmac
    
    ```
    2s/EPZ9Xnk4cCZd5weXEd0DqcudY1yJwoQRV2cESN9+9HEVLiu6C72X5YfPYhiESrmuWLXe9U1BGSCIq7/DiMEWjsKmdlUEEbJGkmfTMN7xRJvuw2uqNpAewis/HKAQk
    ```
    
2.  deviceId
    
    ```
    0d7eee2c-5d77-3c26-99f8-a5a2c9e08aeb
    ```
    
3.  Build
    
    ```
    8420294
    ```
    

运算流程：

`main_hmac` 先经过 `Base64` 解码作为的参数1， `deviceId` 作为参数2传递给 `sub_4B39C` ， `sub_4B39C` 里通过在参数2末尾续接固定数据进行初始秘钥拓展，接着调用 `sub_51CB8` 函数对秘钥进行进一步处理得到AES初始秘钥

接着把初始秘钥和 `main_hmac` 的解码值传递给 `sub_51868 -> sub_5290C -> sub_522F4` 进行魔改的AES解码运算，94字节，每次处理16字节，共六次，第六次输出的结果

```
0000: 55 B3 A0 B9 8D 85 51 14 7C 81 B4 89 E4 DC 27 AC    U.....Q.|.....'.
```

结果传回 `sub_5290C` ，经过计算得出下一阶段的值，姑且称之为 `tmp_v1`

```
0010: 59 48 B4 FB 19 E8 14 8E FB 76 FE 95 EF 5D 7D AD    YH.......v...]}.
0020: 71 37 F1 3A A8 BE B3 46 E3 3A 6B 3E 02 EB AC 6D    q7.:...F.:k>...m
0030: 54 28 46 12 29 70 CB C9 6C C2 4F C3 B3 78 CE E0    T(F.)p..l.O..x..
0040: 65 E7 04 1A 30 91 35 A1 5A 1D 80 86 2F 9F BD DB    e...0.5.Z.../...
```

`tmp_v1` 会经过一个魔改之后的 `HMAC-MD5` 运算，这里HAMC和MD5都经过了魔改，最终输出tmp_v2

```
0000: BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0 D7 14 60    ....h...K.W....`
```

然后通过 `sub_4926C` 把 `Build` ， `deviceId` ， `tmp_v2` 拼接在一起，得到 `tmp_v3`

```yaml
0000: 00 00 00 01 EC FA AF 01 00 00 00 02 00 00 00 07    ................
0010: 00 00 00 24 00 00 00 10 38 34 32 30 32 39 34 30    ...$....84202940
0020: 64 37 65 65 65 32 63 2D 35 64 37 37 2D 33 63 32    d7eee2c-5d77-3c2
0030: 36 2D 39 39 66 38 2D 61 35 61 32 63 39 65 30 38    6-99f8-a5a2c9e08
0040: 61 65 62 BA BE E4 F8 68 C3 E3 C9 4B 9B 57 81 B0    aeb....h...K.W..
0050: D7 14 60 00 00 00 00 00 00 00 00 00 00 00 00 00    ..`.............
```

接着 `tmp_v3` 通过 `sub_51698` 运算得出 `tmp_v4` ，这里 `sub_51698` 是个标准RC4，秘钥是 `std::abort()` ，秘钥也是挺神奇的， `tmp_v4` 的值(83字节)：

```
0000: 35 16 11 ED 31 1B 52 1B 0F DF DC FA A0 8B 3A 52    5...1.R.......:R
0010: 86 99 3B 45 6B E9 46 E3 7E 0A 7E E1 54 4D A9 42    ..;Ek.F.~.~.TM.B
0020: 91 83 E5 CB E3 65 1F 9D FD AB E7 58 CF C3 79 DE    .....e.....X..y.
0030: CB 7E D8 AB 64 18 0C 1F 14 34 8A 37 B2 A1 DC 23    .~..d....4.7...#
0040: 31 D3 B6 2F 6F 98 27 CA 78 72 20 DF E0 6C C9 E6    1../o.'.xr ..l..
0050: F4 E3 DB                                           ...
```

然后在 `tmp_v4` 签名接 `16字节` 的校验数据，主要是包含长度数据，得到 `tmp_v5`

```
0000: 00 00 00 01 00 00 00 01 00 00 00 53 00 00 00 53    ...........S...S
0010: 35 16 11 ED 31 1B 52 1B 0F DF DC FA A0 8B 3A 52    5...1.R.......:R
0020: 86 99 3B 45 6B E9 46 E3 7E 0A 7E E1 54 4D A9 42    ..;Ek.F.~.~.TM.B
0030: 91 83 E5 CB E3 65 1F 9D FD AB E7 58 CF C3 79 DE    .....e.....X..y.
0040: CB 7E D8 AB 64 18 0C 1F 14 34 8A 37 B2 A1 DC 23    .~..d....4.7...#
0050: 31 D3 B6 2F 6F 98 27 CA 78 72 20 DF E0 6C C9 E6    1../o.'.xr ..l..
0060: F4 E3 DB                                           ...
```

然后对 `tmp_v5` 进行标准 `Base64` 运算，得出 `tmp_v6`

```yaml
0000: 41 41 41 41 41 51 41 41 41 41 45 41 41 41 42 54    AAAAAQAAAAEAAABT
0010: 41 41 41 41 55 7A 55 57 45 65 30 78 47 31 49 62    AAAAUzUWEe0xG1Ib
0020: 44 39 2F 63 2B 71 43 4C 4F 6C 4B 47 6D 54 74 46    D9/c+qCLOlKGmTtF
0030: 61 2B 6C 47 34 33 34 4B 66 75 46 55 54 61 6C 43    a+lG434KfuFUTalC
0040: 6B 59 50 6C 79 2B 4E 6C 48 35 33 39 71 2B 64 59    kYPly+NlH539q+dY
0050: 7A 38 4E 35 33 73 74 2B 32 4B 74 6B 47 41 77 66    z8N53st+2KtkGAwf
0060: 46 44 53 4B 4E 37 4B 68 33 43 4D 78 30 37 59 76    FDSKN7Kh3CMx07Yv
0070: 62 35 67 6E 79 6E 68 79 49 4E 2F 67 62 4D 6E 6D    b5gnynhyIN/gbMnm
0080: 39 4F 50 62                                        9OPb
```

最后再在 `tmp_v6` 前面拼接 `"XY"` 就得到最终的值啦~

```
XYAAAAAQAAAAEAAABTAAAAUzUWEe0xG1IbD9/c+qCLOlKGmTtFa+lG434KfuFUTalCkYPly+NlH539q+dYz8N53st+2KtkGAwfFDSKN7Kh3CMx07Yvb5gnynhyIN/gbMnm9OPb
```

## 0x40总结

学到了不少东西，不算难但也不算简单的参数，还是花了我一些时间的
