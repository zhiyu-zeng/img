---
title: 用 Dex2C 把 Java 变 Native：Android 代码加固 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E7%94%A8-dex2c-%E6%8A%8A-java-%E5%8F%98-nativeandroid-%E4%BB%A3%E7%A0%81%E5%8A%A0%E5%9B%BA/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:15:08+08:00
trace_id: 676c8fa2-494d-45da-b600-9d8184d5fe7b
content_hash: 4674a6c723367d7e44254f8ad6b3db0613fd3d48c3335c3ca092fc83793b0f92
status: synced
tags:
  - Android逆向
  - 脱壳与加固
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: Dex2C 通过把 DEX 字节码编译成语义等价的 C/C++ 代码，将 Java 方法转为 Native 方法，实现 Android 源码逻辑隐藏保护；实际操作可借助开源 dcc 完成加固，但需注意签名与 install 坑。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3b275244-d011-81fb-ac51-f0d8a1f01d52
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Dex2C 通过把 DEX 字节码编译成语义等价的 C/C++ 代码，将 Java 方法转为 Native 方法，实现 Android 源码逻辑隐藏保护；实际操作可借助开源 dcc 完成加固，但需注意签名与 install 坑。
> 
> - **工具构成：** Dex2C 是核心思路，DCC（Dex-to-C Compiler）是开源编译器，将 smali 指令流转为 C/C++ 代码，输出 libnc.so 并配合 JNI 静态注册替换原 Java 方法。
> - **使用步骤：** 需安装 JRE/JDK、python3，执行 pip 安装依赖，下载 apktool 放入 tools，并在 dcc.cfg 配置 NDK 路径；应用侧需在 Application 中 `System.loadLibrary("nc")`，然后运行 `python dcc.py app.apk -o out.apk` 生成签名 APK 与 project-source.zip。
> - **过滤规则：** 支持 filter.txt 黑白名单正则（`!` 表示排除，默认编译 Activity.onCreate）；也可自定义 Dex2C 注解类，用 `@Dex2C` 标记类，但文章实测“方法级注解并不起作用”。
> - **问题修复：** 自带的 signapk.jar 依赖 `sun.misc.BASE64Encoder`，Java 9 后无法使用，需改配 apksigner（支持 v1/v2/v3/v4 签名）并在 dcc.py 签名函数中调用；若安装报 `INSTALL_FAILED_TEST_ONLY`，说明 APK 带 testOnly 标志，可用 `adb install -t` 强制安装或换正式打包签名。
> - **逆向验证：** 加固后用 GDA 打开 out.apk 可看到被标记类的方法均变成本地 Native 函数；用 IDA 打开 libnc.so 可见被保护函数均通过 JNI 静态注册。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## Dex2C 介绍

Dex2C 是一个将 Android 应用中的 DEX 字节码（Java 层代码）转换为语义等效的 C 代码的工具。

经过 Dex2C 处理后，Java 方法就变成 Native 层的方法了，从而实现源码隐藏保护。

java 代码：

```kotlin
object AESUtils {

    // 将普通字符串转换为 IvParameterSpec
    private fun stringToIV(iv: String): IvParameterSpec {
        // 通过 UTF-8 编码将字符串转为字节数组，确保其长度为 16 字节
        val ivBytes = iv.toByteArray(Charsets.UTF_8)
        val ivArray = ByteArray(16)
    
        System.arraycopy(ivBytes, 0, ivArray, 0, Math.min(ivBytes.size, 16))
        return IvParameterSpec(ivArray)
    }
}
```

转换后的 C/C++ 代码：

```cpp
#include "Dex2C.h"

/* LAESUtils;->stringToIV(Ljava/lang/String;)Ljavax/crypto/spec/IvParameterSpec; */
extern "C" JNIEXPORT jobject
JNICALL Java_AESUtils_stringToIV__Ljava_lang_String_2(JNIEnv *env, jobject thiz, jstring p4) {
    jobject v0 = NULL;
    jobject v1 = NULL;
    jobject v2 = NULL;
    jobject v3 = NULL;
    jint v4;
    jobject v5 = NULL;
    jint v6;
    jint v7;
    jclass cls0 = NULL, cls1 = NULL, cls2 = NULL, cls3 = NULL, cls4 = NULL, cls5 = NULL, cls6 = NULL;
    jfieldID fld0 = NULL;
    jmethodID mth0 = NULL, mth1 = NULL, mth2 = NULL, mth3 = NULL, mth4 = NULL;
    v0 = (jobject)
    env->NewLocalRef(thiz);
    v1 = (jobject)
    env->NewLocalRef(p4);
    L0:
    LOGD("0:sget-object \x76\x30\x2c\x20\x4c\x6b\x6f\x74\x6c\x69\x6e\x2f\x74\x65\x78\x74\x2f\x43\x68\x61\x72\x73\x65\x74\x73\x3b\x2d\x3e\x55\x54\x46\x5f\x38\x20\x4c\x6a\x61\x76\x61\x2f\x6e\x69\x6f\x2f\x63\x68\x61\x72\x73\x65\x74\x2f\x43\x68\x61\x72\x73\x65\x74\x3b");
    {
#define EX_HANDLE EX_UnwindBlock
        if (v2) {
            LOGD("env->DeleteLocalRef(%p):v2", v2);
            env->DeleteLocalRef(v2);
        }
        jclass &clz = cls0;
        jfieldID &fld = fld0;
        D2C_RESOLVE_STATIC_FIELD(clz, fld, "kotlin/text/Charsets", "UTF_8", "Ljava/nio/charset/Charset;");
        v2 = (jobject)
        env->GetStaticObjectField(clz, fld);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    LOGD("4:invoke-virtual \x76\x34\x2c\x20\x76\x30\x2c\x20\x4c\x6a\x61\x76\x61\x2f\x6c\x61\x6e\x67\x2f\x53\x74\x72\x69\x6e\x67\x3b\x2d\x3e\x67\x65\x74\x42\x79\x74\x65\x73\x28\x4c\x6a\x61\x76\x61\x2f\x6e\x69\x6f\x2f\x63\x68\x61\x72\x73\x65\x74\x2f\x43\x68\x61\x72\x73\x65\x74\x3b\x29\x5b\x42");
    {
#define EX_HANDLE EX_UnwindBlock
        D2C_NOT_NULL(v1);
        jclass &clz = cls1;
        jmethodID &mid = mth0;
        D2C_RESOLVE_METHOD(clz, mid, "java/lang/String", "getBytes", "(Ljava/nio/charset/Charset;)[B");
        jvalue args[] = {{.l = v2}};
        v3 = (jarray) env->CallObjectMethodA(v1, mid, args);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    LOGD("a:move-result-object \x76\x34");
    if (v1) {
        LOGD("env->DeleteLocalRef(%p):v1", v1);
        env->DeleteLocalRef(v1);
    }
    v1 = (jobject)
    v3;
    LOGD("c:const-string \x76\x30\x2c\x20\x27\x67\x65\x74\x42\x79\x74\x65\x73\x28\x2e\x2e\x2e\x29\x27");
    if (v2) {
        LOGD("env->DeleteLocalRef(%p):v2", v2);
        env->DeleteLocalRef(v2);
    }
    v2 = (jstring) env->NewStringUTF("\x67\x65\x74\x42\x79\x74\x65\x73\x28\x2e\x2e\x2e\x29");
    LOGD("10:invoke-static \x76\x34\x2c\x20\x76\x30\x2c\x20\x4c\x6b\x6f\x74\x6c\x69\x6e\x2f\x6a\x76\x6d\x2f\x69\x6e\x74\x65\x72\x6e\x61\x6c\x2f\x49\x6e\x74\x72\x69\x6e\x73\x69\x63\x73\x3b\x2d\x3e\x63\x68\x65\x63\x6b\x4e\x6f\x74\x4e\x75\x6c\x6c\x45\x78\x70\x72\x65\x73\x73\x69\x6f\x6e\x56\x61\x6c\x75\x65\x28\x4c\x6a\x61\x76\x61\x2f\x6c\x61\x6e\x67\x2f\x4f\x62\x6a\x65\x63\x74\x3b\x20\x4c\x6a\x61\x76\x61\x2f\x6c\x61\x6e\x67\x2f\x53\x74\x72\x69\x6e\x67\x3b\x29\x56");
    {
#define EX_HANDLE EX_UnwindBlock
        jclass &clz = cls2;
        jmethodID &mid = mth1;
        D2C_RESOLVE_STATIC_METHOD(clz, mid, "kotlin/jvm/internal/Intrinsics", "checkNotNullExpressionValue", "(Ljava/lang/Object;Ljava/lang/String;)V");
        jvalue args[] = {{.l = v1},
                         {.l = v2}};
        env->CallStaticVoidMethodA(clz, mid, args);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    v4 = 16;
    v4 = 16;
    LOGD("1a:new-array \x76\x31\x2c\x20\x76\x30\x2c\x20\x5b\x42");
    {
#define EX_HANDLE EX_UnwindBlock
        if (v4 < 0) {
            d2c_throw_exception(env, "java/lang/NegativeArraySizeException", "negative array size");
            goto EX_HANDLE;
        }
        if (v5) {
            LOGD("env->DeleteLocalRef(%p):v5", v5);
            env->DeleteLocalRef(v5);
        }
        v5 = (jarray) env->NewByteArray((jint) v4);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    LOGD("1e:array-length \x76\x32\x2c\x20\x76\x34");
    {
#define EX_HANDLE EX_UnwindBlock
        D2C_NOT_NULL(v1);
        v6 = env->GetArrayLength((jarray) v1);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    LOGD("20:invoke-static \x76\x32\x2c\x20\x76\x30\x2c\x20\x4c\x6a\x61\x76\x61\x2f\x6c\x61\x6e\x67\x2f\x4d\x61\x74\x68\x3b\x2d\x3e\x6d\x69\x6e\x28\x49\x20\x49\x29\x49");
    {
#define EX_HANDLE EX_UnwindBlock
        jclass &clz = cls4;
        jmethodID &mid = mth2;
        D2C_RESOLVE_STATIC_METHOD(clz, mid, "java/lang/Math", "min", "(II)I");
        jvalue args[] = {{.i = v6},
                         {.i = v4}};
        v7 = (jint) env->CallStaticIntMethodA(clz, mid, args);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    LOGD("26:move-result \x76\x30");
    v4 = (jint) v7;
    v6 = 0;
    LOGD("2a:invoke-static \x76\x34\x2c\x20\x76\x32\x2c\x20\x76\x31\x2c\x20\x76\x32\x2c\x20\x76\x30\x2c\x20\x4c\x6a\x61\x76\x61\x2f\x6c\x61\x6e\x67\x2f\x53\x79\x73\x74\x65\x6d\x3b\x2d\x3e\x61\x72\x72\x61\x79\x63\x6f\x70\x79\x28\x4c\x6a\x61\x76\x61\x2f\x6c\x61\x6e\x67\x2f\x4f\x62\x6a\x65\x63\x74\x3b\x20\x49\x20\x4c\x6a\x61\x76\x61\x2f\x6c\x61\x6e\x67\x2f\x4f\x62\x6a\x65\x63\x74\x3b\x20\x49\x20\x49\x29\x56");
    {
#define EX_HANDLE EX_UnwindBlock
        jclass &clz = cls5;
        jmethodID &mid = mth3;
        D2C_RESOLVE_STATIC_METHOD(clz, mid, "java/lang/System", "arraycopy", "(Ljava/lang/Object;ILjava/lang/Object;II)V");
        jvalue args[] = {{.l = v1},
                         {.i = v6},
                         {.l = v5},
                         {.i = v6},
                         {.i = v4}};
        env->CallStaticVoidMethodA(clz, mid, args);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    LOGD("30:new-instance \x76\x34\x2c\x20\x4c\x6a\x61\x76\x61\x78\x2f\x63\x72\x79\x70\x74\x6f\x2f\x73\x70\x65\x63\x2f\x49\x76\x50\x61\x72\x61\x6d\x65\x74\x65\x72\x53\x70\x65\x63\x3b");
    {
#define EX_HANDLE EX_UnwindBlock
        if (v1) {
            LOGD("env->DeleteLocalRef(%p):v1", v1);
            env->DeleteLocalRef(v1);
        }
        jclass &clz = cls6;
        D2C_RESOLVE_CLASS(clz, "javax/crypto/spec/IvParameterSpec");
        v1 = (jobject)
        env->AllocObject(clz);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    LOGD("34:invoke-direct \x76\x34\x2c\x20\x76\x31\x2c\x20\x4c\x6a\x61\x76\x61\x78\x2f\x63\x72\x79\x70\x74\x6f\x2f\x73\x70\x65\x63\x2f\x49\x76\x50\x61\x72\x61\x6d\x65\x74\x65\x72\x53\x70\x65\x63\x3b\x2d\x3e\x3c\x69\x6e\x69\x74\x3e\x28\x5b\x42\x29\x56");
    {
#define EX_HANDLE EX_UnwindBlock
        D2C_NOT_NULL(v1);
        jclass &clz = cls6;
        jmethodID &mid = mth4;
        D2C_RESOLVE_METHOD(clz, mid, "javax/crypto/spec/IvParameterSpec", "<init>", "([B)V");
        jvalue args[] = {{.l = v5}};
        env->CallVoidMethodA(v1, mid, args);
        D2C_CHECK_PENDING_EX;
#undef EX_HANDLE
    }
    return (jobject)
    v1;
    EX_UnwindBlock:
    return NULL;
}
```

## DCC (Dex-to-C Compiler)

将 smali 指令流转化为语义等价的 C/C++ 代码 的开源编译器。

项目地址： [https://github.com/amimo/dcc.git](https://github.com/amimo/dcc.git)

## 1\. 安装依赖项

-   安装 JRE 或 JDK，将 java 加入 path.
    
-   安装 python3，可参考： [Miniconda 全攻略：优雅管理你的 Python 环境](https://cyrus-studio.github.io/blog/posts/miniconda-%E5%85%A8%E6%94%BB%E7%95%A5%E4%BC%98%E9%9B%85%E7%AE%A1%E7%90%86%E4%BD%A0%E7%9A%84-python-%E7%8E%AF%E5%A2%83/)
    
-   安装项目依赖
    

```
cd dcc
pip3 install -r requirements.txt
```

-   下载 [apktool](https://apktool.org/) ，将其重命名为 apktool.jar 后放到 dcc/tools 目录中
    
-   安装 [NDK(r17+)](https://developer.android.com/ndk/guides?hl=zh-cn), 将 dcc.cfg 中 ndk_dir 修改为 NDK 安装目录
    

## 2\. 加载 Native 库

首先在 app 代码合适的位置，如 Application 的静态代码块或 onCreate 等，添加加载 so 库代码，并重新生成 apk

```kotlin
package com.cyrus.example

import android.app.Application

class CyrusStudioApplication : Application() {

    companion object {
        init {
            try {
                System.loadLibrary("nc")
            } catch (e: Throwable) {
                // 加载失败，不处理
            }
        }
    }

}
```

## 3\. 指定需要编译的方法

### 3.1 使用黑白名单

dcc 支持使用黑白名单来过滤需要编译或禁止编译的函数。修改 filter.txt，使用正则表达式配置需要处理的函数。

默认编译 Activity.onCreate，和测试 demo 中的所有函数.

```bash
# 不编译构造函数（<init>）和类初始化块（<clinit>）。（! 表示排除）
!<clinit|init>

# 不编译名字叫 bigGoto 的方法
!bigGoto

# 编译类名包含 TestCompiler 的类/方法
.*TestCompiler.*

# 编译任意类（.*;）中方法签名包含 onCreate\(Landroid/os/Bundle; 的方法
.*;onCreate\(Landroid/os/Bundle;.*

# 编译所有方法
#.*
```

### 3.2 使用注解

在任意包中新增Dex2C注解类

```kotlin
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Dex2C
```

然后使用 Dex2C 标记需要编译的类

```
import com.cyrus.example.dex2c.Dex2C

@Dex2C
object AESUtils {
        ...
}
```

或者方法

```kotlin
package com.cyrus.example.md5

import com.cyrus.example.dex2c.Dex2C
import java.security.MessageDigest

object MD5Tools {

    @Dex2C
    fun javaMD5(input: String): String {
        val md = MessageDigest.getInstance("MD5")
        val digest = md.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

}
```

**但经测试对于方法的注解并不起作用。**

## 4\. 加固APP

使用如下命令加固 app.apk

```
python dcc.py app.apk -o out.apk
```

-   该命令会生成两个文件 out.apk 和 project-source.zip 。
    
-   其中 out.apk 是已经签名的加固 app，可以直接安装。
    
-   project-source.zip 是个 jni 工程，里面包含我们编译出来的 C 代码，解压出来后可以直接使用 ndk 编译。
    

## 解决签名失败问题

使用下面命令加固 apk

```
python dcc.py app-debug.apk -o out.apk
```

到签名步骤报错如下：

```python
I: Built apk into: C:\Users\cyrus\AppData\Local\Temp\tmp6qg2cdco-unsigned.apk
[INFO    ] dcc: signing C:\Users\cyrus\AppData\Local\Temp\tmp6qg2cdco-unsigned.apk -> out.apk
Exception in thread "main" java.lang.NoClassDefFoundError: sun/misc/BASE64Encoder
        at com.android.signapk.SignApk.addDigestsToManifest(SignApk.java:184)
        at com.android.signapk.SignApk.main(SignApk.java:504)
Caused by: java.lang.ClassNotFoundException: sun.misc.BASE64Encoder
        at java.base/jdk.internal.loader.BuiltinClassLoader.loadClass(BuiltinClassLoader.java:641)
        at java.base/jdk.internal.loader.ClassLoaders$AppClassLoader.loadClass(ClassLoaders.java:188)
        at java.base/java.lang.ClassLoader.loadClass(ClassLoader.java:526)
        ... 2 more
[ERROR   ] dcc: Compile app-debug.apk failed!
Traceback (most recent call last):
  File "D:\Projects\dcc\dcc.py", line 541, in <module>
    dcc_main(infile, filtercfg, outapk, do_compile, project_dir, source_archive, dynamic_register)
  File "D:\Projects\dcc\dcc.py", line 495, in dcc_main
    sign(unsigned_apk, outapk)
  File "D:\Projects\dcc\dcc.py", line 83, in sign
    subprocess.check_call(['java', '-jar', SIGNJAR, pem, pk8, unsigned_apk, signed_apk])
  File "D:\App\Miniconda3\envs\anti-app\lib\subprocess.py", line 373, in check_call
    raise CalledProcessError(retcode, cmd)
subprocess.CalledProcessError: Command '['java', '-jar', 'tools/signapk.jar', 'tests/testkey/testkey.x509.pem', 'tests/testkey/testkey.pk8', 'C:\\Users\\cyrus\\AppData\\Local\\Temp\\tmp6qg2cdco-unsigned.apk', 'out.apk']' returned non-zero exit status 1.
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\dcc-project-hrosdmqy
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\tmpzhdviz75-dcc
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\dcc-apktool-2jznztrx
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\tmp6qg2cdco-unsigned.apk
```

这个异常原因是：

-   dcc 内部用的是一个老的签名工具 signapk.jar
    
-   signapk.jar 依赖 **sun.misc.BASE64Encoder**，但是你用的是 Java 9 或以上版本
    
-   从 Java 9 开始，sun.misc.BASE64Encoder 被删除了
    

简单说：dcc 自带的签名工具太老，和你现在用的新版本 Java 不兼容。

改成用 Android SDK 自带的 apksigner 工具签名就行了。

在 dcc.cfg 中增加 apksigner 配置

```json
{
    "apktool": "tools/apktool.jar",
    "ndk_dir": "D:\\App\\android\\sdk\\ndk\\27.1.12297006",
    "apksigner": "D:\\App\\android\\sdk\\build-tools\\35.0.0\\apksigner.bat"
}
```

在 dcc.py 的 main 方法中解析 dcc_cfg 中的 apksigner 配置

```
if 'apksigner' in dcc_cfg and os.path.exists(dcc_cfg['apksigner']):
    apksigner = dcc_cfg['apksigner']
```

dcc.py 里的 sign 方法

```css
def sign(unsigned_apk, signed_apk):
    pem = os.path.join('tests/testkey/testkey.x509.pem')
    pk8 = os.path.join('tests/testkey/testkey.pk8')
    logger.info("signing %s -> %s" % (unsigned_apk, signed_apk))
    subprocess.check_call(['java', '-jar', SIGNJAR, pem, pk8, unsigned_apk, signed_apk])
```

把 sign 方法改成 用 apksigner 签名

```python
def sign(unsigned_apk, signed_apk):
    keystore = 'cyrus.jks'
    alias = 'cyrus_studio'
    storepass = 'cyrus_studio'
    keypass = 'cyrus_studio'

    logger.info("signing %s -> %s" % (unsigned_apk, signed_apk))

    # apksigner 的 sign 命令是要直接操作输出文件（--out），所以我先 shutil.copy() 复制一份 unsigned 到 signed
    import shutil
    shutil.copy(unsigned_apk, signed_apk)

    # 调用 apksigner 签名
    subprocess.check_call([
        apksigner, 'sign',
        '--ks', keystore,
        '--ks-key-alias', alias,
        '--ks-pass', f'pass:{storepass}',
        '--key-pass', f'pass:{keypass}',
        '--out', signed_apk,
        signed_apk
    ])
```

**为什么不用 jarsigner ？**

因为 jarsigner 只能生成老的 v1 签名，apksigner 支持 v1/v2/v3/v4 新版签名，才能确保 APK 在 Android 7.0 及以上系统正常安装。

## 解决安装错误提示

安装错误提示：

```
adb: failed to install .\out.apk: Failure [INSTALL_FAILED_TEST_ONLY: installPackageLI]
```

APK 被打上了 android:testOnly=“true” 标志，系统不让直接安装。

通过 ApkToolPlus 查看 apk 的 AndroidManifest.xml 信息确实有 android:testOnly

 [![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b3e537e9d6dd1679.png)](data:image/png;base64,inline-395282B)工具地址： [https://github.com/CYRUS-STUDIO/ApkToolPlus](https://github.com/CYRUS-STUDIO/ApkToolPlus)

通常是因为你是用 debug模式 打包的 APK，系统出于安全考虑，禁止用户手动安装这种 APK。

加 -t 参数强制安装，直接让 adb 忽略 testOnly 标志

```
adb install -t .\out.apk
```

或者：因为 debug模式 打包的 APK 是没有签名的，重新打包签名就好了。

## 调试 dcc

Pycharm 中新建运行/调试配置，script 文件选择 dcc.py 并添加 Script parameters

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b611f23fdcb5cec5.png)](data:image/png;base64,inline-95566B)

下断点，运行调试

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b2ed5c8139f1740e.png)](data:image/png;base64,inline-249462B)

## 逆向分析加固后的 apk

转换完成

```swift
[WARNING ] androguard.core.api_specific_resources: Requested API level 34 is larger than maximum we have, returning API level 28 instead.
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
Android NDK: android-19 is unsupported. Using minimum supported version android-21.
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= DynamicRegister.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= Java_AESUtils_encrypt_00024lambda_000240__B.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= Java_AESUtils_decrypt__Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2.cpp        
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= Java_AESUtils_encrypt__Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2.cpp        
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= Java_AESUtils_getTransformation__Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= Java_AESUtils_stringToIV__Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= Java_AESUtils_stringToSecretKey__Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= well_known_classes.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= DynamicRegister.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Compile++ thumb: nc <= Dex2C.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= Java_AESUtils_decrypt__Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= Java_AESUtils_encrypt_00024lambda_000240__B.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= Java_AESUtils_encrypt__Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= well_known_classes.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= Java_AESUtils_getTransformation__Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= Java_AESUtils_stringToIV__Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= Java_AESUtils_stringToSecretKey__Ljava_lang_String_2.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] SharedLibrary  : libnc.so
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Compile++      : nc <= Dex2C.cpp
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[armeabi-v7a] Install        : libnc.so => libs/armeabi-v7a/libnc.so
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] SharedLibrary  : libnc.so
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
make: Entering directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
[arm64-v8a] Install        : libnc.so => libs/arm64-v8a/libnc.so
make: Leaving directory 'C:/Users/cyrus/AppData/Local/Temp/dcc-project-nz2i_v6g'
I: Using Apktool 2.11.1 on app.apk with 8 threads
I: Baksmaling classes.dex...
I: Copying raw resources...
I: Baksmaling classes2.dex...
I: Copying raw manifest...
I: Copying original files...
I: Copying assets...
I: Copying lib...
I: Copying unknown files...
I: Using Apktool 2.11.1 on tmpe27zhohx-unsigned.apk with 8 threads
I: Checking whether resources have changed...
I: Checking whether sources have changed...
I: Checking whether sources have changed...
I: Smaling smali folder into classes.dex...
I: Copying raw resources...
I: Smaling smali_classes2 folder into classes2.dex...
I: Building apk file...
I: Importing assets...
I: Importing lib...
I: Importing unknown files...
I: Built apk into: C:\Users\cyrus\AppData\Local\Temp\tmpe27zhohx-unsigned.apk
[INFO    ] dcc: signing C:\Users\cyrus\AppData\Local\Temp\tmpe27zhohx-unsigned.apk -> out.apk
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\dcc-project-nz2i_v6g
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\tmpgzmhlbm5-dcc
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\dcc-apktool-h7yloeiq
[INFO    ] dcc: removing C:\Users\cyrus\AppData\Local\Temp\tmpe27zhohx-unsigned.apk
```

使用 GDA 打开 out.apk ，可以看到添加了注解的 AESUtils 类中所有 java 方法都已经被转换成 native 函数

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1a1c4bd7ecb1e0bd.png)](data:image/png;base64,inline-626518B)

AESUtils 类中的 java 方法被转换为如下 C++ 代码

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d05c3865dae540db.png)](data:image/png;base64,inline-78922B)

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/20ade84065ea3a8e.png)](data:image/png;base64,inline-185010B)

使用 IDA 打开 libnc.so ，可以看到被保护的函数都是通过 jni 静态注册

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6c7e68dd832a3683.png)](data:image/png;base64,inline-164834B)

## 完整源码

开源地址：
