---
title: 某海外短视频 App 抓包失败？深入 Cronet + SSL Pinning 绕过 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E6%9F%90%E6%B5%B7%E5%A4%96%E7%9F%AD%E8%A7%86%E9%A2%91-app-%E6%8A%93%E5%8C%85%E5%A4%B1%E8%B4%A5%E6%B7%B1%E5%85%A5-cronet-+-ssl-pinning-%E7%BB%95%E8%BF%87/
source_host: cyrus-studio.github.io
clip_date: 2026-08-07T19:09:03+08:00
trace_id: 1d77db4f-5b15-4f9c-acf1-98076920c1ec
content_hash: bba49975732d8ef4ed4256ceb156a8007ab15b21c4ed3fe508dc11761f15f0cf
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: null
ai_summary: 某海外短视频App因使用Cronet网络栈和SSL Pinning导致抓包失败，通过Frida Hook `SSL_CTX_set_custom_verify`强制证书校验返回成功即可绕过，再配合地区伪装完成抓包。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3b575244-d011-8109-9b39-cd1469b3a7fb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 某海外短视频App因使用Cronet网络栈和SSL Pinning导致抓包失败，通过Frida Hook `SSL_CTX_set_custom_verify`强制证书校验返回成功即可绕过，再配合地区伪装完成抓包。
> 
> - **失败原因：** App 的 Cronet 自定义证书校验通过 `libvcnverify.so` / `libttmverify.so` 调用 `Cronet_CertVerify_DoVerifyV2`，接管了 BoringSSL 默认验证，普通抓包被阻断。
> - **分析路径：** 通过 `adb logcat` 抓包名日志发现 `custom_verify.c` 的 `JNI_OnLoad` 记录，追溯 native backtrace 定位到上述 so 文件；使用 Frida dump + SoFixer 修复后导入 IDA，确认其内部大量调用 Cronet API 执行 SSL Pinning 校验。
> - **技术机制：** Cronet 是 Chromium 网络栈的 SDK，底层使用 BoringSSL；Chromium 通过 `SSL_CTX_set_custom_verify` 把 TLS 证书校验回调替换为自定义 `VerifyCertCallback`，该校验中会执行包含 SSL Pinning 在内的完整验证流程。
> - **绕过方法：** Frida Hook `SSL_CTX_set_custom_verify`，在 `onEnter` 中获得原回调指针，再 Hook 该回调并在 `onLeave` 中把返回值替换为 0（即 `ssl_verify_ok`），对 `libttboringssl.so` 和 `libsscronet.so` 同时生效，实现 Native 层全局绕过。
> - **地区限制处理：** 抓包成功后接口仍返回 “Unavailable in your area”，解决方案为拔出国内 SIM 卡、修改设备语言和时区、将 IP 切换至海外节点。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 目标APP无法抓包

抓包目标APP发现一直提示出错了，但是网络是正常的。

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e90d78dc59263ffe.png)](data:image/png;base64,inline-42462B)

## 日志分析

抓一下日志看看有没有什么报错。

获取 app 包名

```
PS D:\> adb shell dumpsys activity activities | findstr "mResumedActivity"
    mResumedActivity: ActivityRecord{79be772 u0 ************************/************************.splash.SplashActivity t1184}
```

过滤出该包名下的日志并导出到 logcat.txt

```
adb logcat --pid=$(adb shell pidof ************************) -v time > logcat.txt
```

## 可疑的日志

发现一段可疑的日志，疑似与证书校验相关。

```sql
04-23 13:16:06.427 D/vcnnetwork( 9525): <0x0,custom_verify.c,JNI_OnLoad,55>-----compiled native library  Mar  9 2026 10:09:07-----
04-23 13:16:06.427 D/vcnnetwork( 9525): <0x0,custom_verify.c,JNI_OnLoad,63>register verify call start
04-23 13:16:06.427 D/vcnnetwork( 9525): <0x0,custom_verify.c,JNI_OnLoad,67>register verify call end
04-23 13:16:06.427 D/vcnnetwork( 9525): <0x0,custom_verify.c,JNI_OnLoad,70><JNI_OnLoad,70> JNI_OnLoad (result=65540)
04-23 13:16:06.990 D/ttmverify( 9525): <0x0,custom_verify.c,JNI_OnLoad,56>-----compiled native library  Jan 22 2026 03:06:08-----
04-23 13:16:06.990 D/ttmverify( 9525): <0x0,custom_verify.c,JNI_OnLoad,64>register verify call start
04-23 13:16:06.991 E/bytehook_tag( 9525): bytehook version 1.1.2-alpha.0: bytehook init(mode: AUTOMATIC, debuggable: false), return: 0, real-init: yes
04-23 13:16:06.991 W/System.err( 9525): saf-init:HomepageViewPagerAssem initPager End: ************************.main.assems.ui.HomepageViewPagerAssem@41585f5
04-23 13:16:06.992 I/jato    ( 9525): g.e. init start
04-23 13:16:06.993 I/System.out( 9525): SAFActivity: afterCallSceneActivityCreated end [************************.main.MainActivity@7116b45]
04-23 13:16:06.993 I/System.out( 9525): SceneSafeLifecycleDispatcher: onActivityCreated End ACTIVITY_CREATED
04-23 13:16:06.993 I/jato    ( 9525): g.e. init success
04-23 13:16:06.995 D/ttmverify( 9525): <0x0,custom_verify.c,JNI_OnLoad,68>register verify call end
04-23 13:16:06.995 D/ttmverify( 9525): <0x0,custom_verify.c,JNI_OnLoad,71><JNI_OnLoad,71> JNI_OnLoad (result=65540)
```

## 根据日志追溯一下调用堆栈

```
📢 [Native Log] [3] vcnnetwork: <%p,%s,%s,%d>%s
🔍 Native Backtrace:
    ↪ 0x79302c6298 libvcnverify.so!0x1298
    ↪ 0x7a8d79ba88
    ↪ 0x79d8c5a11c libart.so!_ZN3art9JavaVMExt12AddGlobalRefEPNS_6ThreadENS_6ObjPtrINS_6mirror6ObjectEEE+0x80
    ↪ 0x79d8c6c2a8 libart.so!_ZN3art3JNIILb0EE12NewGlobalRefEP7_JNIEnvP8_jobject+0x26c
    ↪ 0x79d8c6d724 libart.so!_ZN3art3JNIILb0EE11NewLocalRefEP7_JNIEnvP8_jobject+0x254
    ↪ 0x79d8e8f9c8 libart.so!_ZN3art6Thread22SetClassLoaderOverrideEP8_jobject+0x48
    ↪ 0x79302c62f0 libvcnverify.so!JNI_OnLoad+0x30
    ↪ 0x79d8c5c738 libart.so!_ZN3art9JavaVMExt17LoadNativeLibraryEP7_JNIEnvRKNSt3__112basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEP8_jobjectP7_jclassPS9_+0xc14
    ↪ 0x79d8c5c758 libart.so!_ZN3art9JavaVMExt17LoadNativeLibraryEP7_JNIEnvRKNSt3__112basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEP8_jobjectP7_jclassPS9_+0xc34
    ↪ 0x79c8cca200 libopenjdkjvm.so!JVM_NativeLoad+0x1ac
    ↪ 0x6f3fc838 boot.oat!art_jni_trampoline+0x98
    ↪ 0x6f41288c boot.oat!java.lang.Runtime.loadLibrary0+0x14c
    ↪ 0x6f414308 boot.oat!java.lang.Runtime.loadLibrary0+0xb8
    ↪ 0x6f417ba4 boot.oat!java.lang.System.loadLibrary+0x64
    ↪ 0x7940e5b6b0 base.odex!X.08tJ.doInBackground+0x100
    ↪ 0x70dfc280 boot-framework.oat!android.os.AsyncTask$3.call+0xb0
...    
📢 [Native Log] [3] ttmverify: <%p,%s,%s,%d>%s
🔍 Native Backtrace:
    ↪ 0x78a0df3258 libttmverify.so!0x1258
    ↪ 0x7a8d79ba88
    ↪ 0x79d8c5a11c libart.so!_ZN3art9JavaVMExt12AddGlobalRefEPNS_6ThreadENS_6ObjPtrINS_6mirror6ObjectEEE+0x80
    ↪ 0x79d8c6c2a8 libart.so!_ZN3art3JNIILb0EE12NewGlobalRefEP7_JNIEnvP8_jobject+0x26c
    ↪ 0x79d8c6d724 libart.so!_ZN3art3JNIILb0EE11NewLocalRefEP7_JNIEnvP8_jobject+0x254
    ↪ 0x79d8e8f9c8 libart.so!_ZN3art6Thread22SetClassLoaderOverrideEP8_jobject+0x48
    ↪ 0x79d8c5c738 libart.so!_ZN3art9JavaVMExt17LoadNativeLibraryEP7_JNIEnvRKNSt3__112basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEP8_jobjectP7_jclassPS9_+0xc14
    ↪ 0x79d8c5c758 libart.so!_ZN3art9JavaVMExt17LoadNativeLibraryEP7_JNIEnvRKNSt3__112basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEP8_jobjectP7_jclassPS9_+0xc34
    ↪ 0x79c8cca200 libopenjdkjvm.so!JVM_NativeLoad+0x1ac
    ↪ 0x6f3fc838 boot.oat!art_jni_trampoline+0x98
    ↪ 0x6f41288c boot.oat!java.lang.Runtime.loadLibrary0+0x14c
    ↪ 0x6f414308 boot.oat!java.lang.Runtime.loadLibrary0+0xb8
    ↪ 0x6f417ba4 boot.oat!java.lang.System.loadLibrary+0x64
    ↪ 0x7a79852874 libutils.so!_ZN7android12uptimeMillisEv+0x14
    ↪ 0x7940ec40e0 base.odex!X.09PC.LIZ+0x450
    ↪ 0x79d8a12524 libart.so!nterp_helper+0xfb4    
```

是在 libvcnverify.so 和 libttmverify.so 中调用的。

## 脱壳 libvcnverify.so 和 libttmverify.so

```lua
(frida17) PS D:\Python\anti-app\frida_dump> python dump_so.py libvcnverify.so
D:\Python\anti-app\frida_dump\dump_so.py:48: DeprecationWarning: Script.exports will become asynchronous in the future, use the explicit Script.exports_sync instead
  module_info = script.exports.findmodule(origin_so_name)
{'name': 'libvcnverify.so', 'base': '0x738430a000', 'size': 32768, 'path': '/data/app/~~WiBzHiHD7fuLTDU-THU1XA==/************************-oinNVswN-LUsY3SZ4C1NFw==/lib/arm64/libvcnverify.so'}
D:\Python\anti-app\frida_dump\dump_so.py:52: DeprecationWarning: Script.exports will become asynchronous in the future, use the explicit Script.exports_sync instead
  module_buffer = script.exports.dumpmodule(origin_so_name)
libvcnverify.so.dump.so
D:\Python\anti-app\frida_dump\dump_so.py:60: DeprecationWarning: Script.exports will become asynchronous in the future, use the explicit Script.exports_sync instead
  arch = script.exports.arch()
android/SoFixer64: 1 file pushed, 0 skipped. 45.5 MB/s (186656 bytes in 0.004s)
libvcnverify.so.dump.so: 1 file pushed, 0 skipped. 19.5 MB/s (32768 bytes in 0.002s)
adb shell /data/local/tmp/SoFixer -m 0x738430a000 -s /data/local/tmp/libvcnverify.so.dump.so -o /data/local/tmp/libvcnverify.so.dump.so.fix.so      
[main_loop:87]start to rebuild elf file
[Load:69]dynamic segment have been found in loadable segment, argument baseso will be ignored.
[RebuildPhdr:25]=============LoadDynamicSectionFromBaseSource==========RebuildPhdr=========================
[RebuildPhdr:37]=====================RebuildPhdr End======================
[ReadSoInfo:549]=======================ReadSoInfo=========================
[ReadSoInfo:696]soname
[ReadSoInfo:637] destructors (DT_FINI_ARRAY) found at 7c78
[ReadSoInfo:641] destructors (DT_FINI_ARRAYSZ) 2
[ReadSoInfo:699]Unused DT entry: type 0x6ffffef5 arg 0x00000378
[ReadSoInfo:580]string table found at 7e0
[ReadSoInfo:584]symbol table found at 3c0
[ReadSoInfo:595] plt_rel_count (DT_PLTRELSZ) 48
[ReadSoInfo:591] plt_rel (DT_JMPREL) found at c88
[ReadSoInfo:699]Unused DT entry: type 0x00000009 arg 0x00000018
[ReadSoInfo:699]Unused DT entry: type 0x6ffffffb arg 0x00000001
[ReadSoInfo:699]Unused DT entry: type 0x6ffffffe arg 0x00000c20
[ReadSoInfo:699]Unused DT entry: type 0x6fffffff arg 0x00000001
[ReadSoInfo:699]Unused DT entry: type 0x6ffffff0 arg 0x00000bc2
[ReadSoInfo:699]Unused DT entry: type 0x6ffffff9 arg 0x00000003
[ReadSoInfo:703]=======================ReadSoInfo End=========================
[RebuildShdr:42]=======================RebuildShdr=========================
[RebuildShdr:536]=====================RebuildShdr End======================
[RebuildRelocs:783]=======================RebuildRelocs=========================
[RebuildRelocs:809]=======================RebuildRelocs End=======================
[RebuildFin:709]=======================try to finish file rebuild =========================
[RebuildFin:733]=======================End=========================
[main:123]Done!!!
/data/local/tmp/libvcnverify.so.dump.so.fix.so: 1 file pulled, 0 skipped. 12.8 MB/s (33637 bytes in 0.002s)
libvcnverify.so_0x738430a000_32768_fix.so


(frida17) PS D:\Python\anti-app\frida_dump> python dump_so.py libttmverify.so
D:\Python\anti-app\frida_dump\dump_so.py:48: DeprecationWarning: Script.exports will become asynchronous in the future, use the explicit Script.exports_sync instead
  module_info = script.exports.findmodule(origin_so_name)
{'name': 'libttmverify.so', 'base': '0x72e3fe2000', 'size': 36864, 'path': '/data/app/~~WiBzHiHD7fuLTDU-THU1XA==/************************-oinNVswN-LUsY3SZ4C1NFw==/lib/arm64/libttmverify.so'}
D:\Python\anti-app\frida_dump\dump_so.py:52: DeprecationWarning: Script.exports will become asynchronous in the future, use the explicit Script.exports_sync instead
  module_buffer = script.exports.dumpmodule(origin_so_name)
libttmverify.so.dump.so
D:\Python\anti-app\frida_dump\dump_so.py:60: DeprecationWarning: Script.exports will become asynchronous in the future, use the explicit Script.exports_sync instead
  arch = script.exports.arch()
android/SoFixer64: 1 file pushed, 0 skipped. 118.4 MB/s (186656 bytes in 0.002s)
libttmverify.so.dump.so: 1 file pushed, 0 skipped. 85.9 MB/s (36864 bytes in 0.000s)
adb shell /data/local/tmp/SoFixer -m 0x72e3fe2000 -s /data/local/tmp/libttmverify.so.dump.so -o /data/local/tmp/libttmverify.so.dump.so.fix.so
[main_loop:87]start to rebuild elf file
[Load:69]dynamic segment have been found in loadable segment, argument baseso will be ignored.
[RebuildPhdr:25]=============LoadDynamicSectionFromBaseSource==========RebuildPhdr=========================
[RebuildPhdr:37]=====================RebuildPhdr End======================
[ReadSoInfo:549]=======================ReadSoInfo=========================
[ReadSoInfo:696]soname ��
[ReadSoInfo:629]�� constructors (DT_INIT_ARRAY) found at 7c70
[ReadSoInfo:633]�� constructors (DT_INIT_ARRAYSZ) 1
[ReadSoInfo:637]�� destructors (DT_FINI_ARRAY) found at 7c78
[ReadSoInfo:641]�� destructors (DT_FINI_ARRAYSZ) 2
[ReadSoInfo:580]string table found at 778
[ReadSoInfo:584]symbol table found at 370
[ReadSoInfo:595]�� plt_rel_count (DT_PLTRELSZ) 45
[ReadSoInfo:591]�� plt_rel (DT_JMPREL) found at bf8
[ReadSoInfo:699]Unused DT entry: type 0x00000009 arg 0x00000018
[ReadSoInfo:699]Unused DT entry: type 0x00000018 arg 0x00000000
[ReadSoInfo:699]Unused DT entry: type 0x6ffffffb arg 0x00000001
[ReadSoInfo:699]Unused DT entry: type 0x6ffffffe arg 0x00000ba8
[ReadSoInfo:699]Unused DT entry: type 0x6fffffff arg 0x00000001
[ReadSoInfo:699]Unused DT entry: type 0x6ffffff0 arg 0x00000b4c
[ReadSoInfo:699]Unused DT entry: type 0x6ffffff9 arg 0x00000001
[ReadSoInfo:703]=======================ReadSoInfo End=========================
[RebuildShdr:42]=======================RebuildShdr=========================
[RebuildShdr:536]=====================RebuildShdr End======================
[RebuildRelocs:783]=======================RebuildRelocs=========================
[RebuildRelocs:809]=======================RebuildRelocs End=======================
[RebuildFin:709]=======================try to finish file rebuild =========================
[RebuildFin:733]=======================End=========================
[main:123]Done!!!
/data/local/tmp/libttmverify.so.dump.so.fix.so: 1 file pulled, 0 skipped. 8.8 MB/s (37809 bytes in 0.004s)
libttmverify.so_0x72e3fe2000_36864_fix.so
```

## 使用 IDA 分析 so 文件

使用 IDA 打开 libttmverify.so_0x72e3fe2000_36864_fix.so 并跳转到 libttmverify.so!0x1258

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8b04a20e978ffc67.png)](data:image/png;base64,inline-174254B)

使用 IDA 打开 libttmverify.so_0x72e3fe2000_36864_fix.so 并跳转到 libvcnverify.so!0x1298

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1e6c073caf57c878.png)](data:image/png;base64,inline-209994B)

so 中包含大量 Cronet 相关的函数，并调用了 Cronet 相关函数做 SSL Pinning。

```cpp
bool __fastcall vcn_custom_verify_2(__int64 a1, const void *a2, const char *a3, unsigned int a4)
{
  __int64 v7; // x0
  __int64 v8; // x19
  __int64 v9; // x0
  __int64 v10; // x21
  __int64 v11; // x22
  unsigned __int64 v12; // x23
  __int64 v13; // x25
  unsigned __int8 *v14; // x24
  __int64 v15; // x26
  __int64 i; // x25
  unsigned int v17; // t1
  unsigned __int64 j; // x22
  unsigned __int64 k; // x22
  __int64 v20; // x0
  __int64 v21; // x23
  unsigned int v22; // w22
  _BOOL4 v23; // w20
  unsigned __int64 v25; // [xsp+8h] [xbp-78h] BYREF
  __int64 v26; // [xsp+10h] [xbp-70h] BYREF
  unsigned __int64 v27; // [xsp+18h] [xbp-68h] BYREF
  __int64 v28[2]; // [xsp+20h] [xbp-60h] BYREF

  v28[1] = *(_QWORD *)(_ReadStatusReg(ARM64_SYSREG(3, 3, 13, 0, 2)) + 40);
  av_log(0LL, 48LL, "custom_verify:start call custom verify ssl:%p host:%s port:%d\n", a2, a3, a4);
  v7 = av_log(0LL, 48LL, "custom_verify:start create verify ptr\n");
  v8 = Cronet_CertVerify_Create(v7);
  if ( v8 )
  {
    v9 = av_log(0LL, 48LL, "custom_verify:start create verify ptr\n");
    v10 = Cronet_VerifyParamsV2_Create(v9);
    if ( v10 )
    {
      av_log(0LL, 48LL, "custom_verify:set host and ssl to param ptr\n");
      Cronet_VerifyParamsV2_port_set(v10, a4);
      Cronet_VerifyParamsV2_host_set(v10, a3);
      v11 = SSL_get0_peer_certificates(a2);
      if ( ((__int64 (*)(void))sk_num)() )
      {
        if ( sk_num(v11) )
        {
          v12 = 0LL;
          do
          {
            v13 = sk_value(v11, v12);
            v14 = (unsigned __int8 *)CRYPTO_BUFFER_data();
            v15 = CRYPTO_BUFFER_len(v13);
            for ( i = Cronet_CertData_Create(); v15; --v15 )
            {
              v17 = *v14++;
              Cronet_CertData_data_add(i, v17);
            }
            Cronet_VerifyParamsV2_certs_add(v10, i);
            Cronet_CertData_Destroy(i);
            ++v12;
          }
          while ( v12 < sk_num(v11) );
        }
        SSL_get0_ocsp_response(a2, v28, &v27);
        if ( v27 )
        {
          for ( j = 0LL; j < v27; ++j )
            Cronet_VerifyParamsV2_ocsp_add(v10, *(unsigned __int8 *)(v28[0] + j));
        }
        SSL_get0_signed_cert_timestamp_list(a2, &v26, &v25);
        if ( v25 )
        {
          for ( k = 0LL; k < v25; ++k )
            Cronet_VerifyParamsV2_sct_list_add(v10, *(unsigned __int8 *)(v26 + k));
        }
        v20 = av_log(0LL, 48LL, "custom_verify: start do verify\n");
        v21 = Cronet_VerifyResult_Create(v20);
        v22 = Cronet_CertVerify_DoVerifyV2(v8, v10, v21);
        if ( !v22 && (Cronet_VerifyResult_is_issued_by_known_root_get(v21) & 1) != 0 )
          SSL_set_enforce_rsa_key_usage(a2, 1LL);
        Cronet_VerifyResult_Destroy(v21);
        av_log(0LL, 48LL, "custom_verify: end do verify, result:%d \n", v22);
        v23 = v22 > 1;
        Cronet_CertVerify_Destroy(v8);
      }
      else
      {
        Cronet_CertVerify_Destroy(v8);
        v23 = 1;
      }
      Cronet_VerifyParamsV2_Destroy(v10);
    }
    else
    {
      av_log(0LL, 48LL, "custom_verify:create verify param ptr fail\n");
      Cronet_CertVerify_Destroy(v8);
      return 0;
    }
  }
  else
  {
    av_log(0LL, 48LL, "custom_verify:create verify ptr fail\n");
    return 0;
  }
  return v23;
}
```

## Cronet

Cronet 本质是把 Chrome 浏览器的网络栈封装成 SDK，供 App 使用。

核心特点：

-   与 Chrome 同源（稳定 + 高性能）
    
-   支持 HTTP/2 / HTTP/3 (QUIC)
    
-   内建缓存 / 压缩 / 连接复用
    
-   完整 TLS / 证书验证体系
    
-   可定制协议
    

相关链接：

-   Cronet 源码： [https://github.com/chromium/chromium/tree/main/components/cronet](https://github.com/chromium/chromium/tree/main/components/cronet)
    
-   Android 封装： [https://github.com/chromium/chromium/tree/main/components/cronet/android](https://github.com/chromium/chromium/tree/main/components/cronet/android)
    

分层结构

```
Java API (Android)
   ↓
JNI Bridge
   ↓
Cronet C API
   ↓
Chromium net stack (核心)
   ↓
BoringSSL（Google 魔改 OpenSSL） + QUIC + DNS + Socket
```

从日志里面可以看到加载了 libsscronet.so 应该就是 \*\*\*\*\*\* 的 Cronet 库

```
04-23 13:16:17.257 W/System.err( 9525): ZOIN load origin: sscronet
04-23 13:16:17.257 W/System.err( 9525): ZOIN loadLibrary libsscronet.so success
04-23 13:16:17.442 W/System.err( 9525): ZOIN already success:libsscronet.so
```

在 apk 的 lib\\arm64-v8a 目录下找到 libsscronet.so

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/11d6974f30b7cac7.png)](data:image/png;base64,inline-84382B)

## SSL_CTX_set_custom_verify

自定义证书校验需要调用到 SSL_CTX_set_custom_verify 函数

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f282cbc4cc5ceee0.png)](data:image/png;base64,inline-210430B)

通过 SSL_CTX_set_custom_verify 将证书验证流程（包括 SSL Pinning）从 BoringSSL 默认逻辑接管到 Chromium/Cronet 自定义实现中。

```kotlin
// 为 SSL 对象分配一个“扩展数据索引”，后续可以在 SSL 实例上挂自定义数据（如 socket 关联信息）
ssl_socket_data_index_ =
    SSL_get_ex_new_index(0, nullptr, nullptr, nullptr, nullptr);

// 确保索引创建成功（调试断言）
DCHECK_NE(ssl_socket_data_index_, -1);

// 创建 SSL_CTX（TLS 上下文），使用带缓冲优化的 TLS 方法
ssl_ctx_.reset(SSL_CTX_new(TLS_with_buffers_method()));

// 设置客户端证书回调（当服务端要求双向认证时触发）
SSL_CTX_set_cert_cb(ssl_ctx_.get(), ClientCertRequestCallback, nullptr);

// 即使是会话复用（Session Resume），也重新验证服务器证书（避免跳过校验）
SSL_CTX_set_reverify_on_resume(ssl_ctx_.get(), 1);

// ⭐ 核心：注册自定义证书验证回调
// - 替换 BoringSSL 默认验证逻辑
// - TLS 握手时会回调 VerifyCertCallback
// - Chromium/Cronet 会在该回调中执行完整验证（含 SSL Pinning）
SSL_CTX_set_custom_verify(ssl_ctx_.get(), SSL_VERIFY_PEER,
                          VerifyCertCallback);

// 禁用内部 session cache（由上层统一管理，例如 SSLClientSessionCache）
SSL_CTX_set_session_cache_mode(
    ssl_ctx_.get(), SSL_SESS_CACHE_CLIENT | SSL_SESS_CACHE_NO_INTERNAL);

// 设置“新建 session”回调（用于外部缓存 TLS 会话）
SSL_CTX_sess_set_new_cb(ssl_ctx_.get(), NewSessionCallback);

// 设置 session 过期时间（1 小时）
SSL_CTX_set_timeout(ssl_ctx_.get(), 1 * 60 * 60 /* one hour */);

// 启用 GREASE（防止协议被中间设备僵化识别，提升兼容性与抗干扰能力）
SSL_CTX_set_grease_enabled(ssl_ctx_.get(), 1);

// 设置证书缓冲池（去重证书内存，减少重复分配，提高性能）
SSL_CTX_set0_buffer_pool(ssl_ctx_.get(), x509_util::GetBufferPool());

// 设置 TLS 消息回调（可用于调试/日志记录握手过程）
SSL_CTX_set_msg_callback(ssl_ctx_.get(), MessageCallback);

// 配置证书压缩（减少 TLS 握手数据量，提高性能）
ConfigureCertificateCompression(ssl_ctx_.get());
```

[https://github.com/chromium/chromium/blob/5fe0b352507d2dfadddeec7a3ae30c716fcf5a9e/net/socket/ssl_client_socket_impl.cc#L195](https://github.com/chromium/chromium/blob/5fe0b352507d2dfadddeec7a3ae30c716fcf5a9e/net/socket/ssl_client_socket_impl.cc#L195)

VerifyCertCallback 代码如下：

```
ssl_verify_result_t SSLClientSocketImpl::VerifyCertCallback(
    SSL* ssl,
    uint8_t* out_alert) {
  SSLClientSocketImpl* socket =
      SSLContext::GetInstance()->GetClientSocketFromSSL(ssl);
  DCHECK(socket);
  return socket->VerifyCert();
}
```

[https://github.com/chromium/chromium/blob/8efa57f491dc02962b8d7a6b1b7a53325925b00f/net/socket/ssl_client_socket_impl.cc#L1032](https://github.com/chromium/chromium/blob/8efa57f491dc02962b8d7a6b1b7a53325925b00f/net/socket/ssl_client_socket_impl.cc#L1032)

ssl_verify_result_t 定义如下：

```
enum ssl_verify_result_t {
  ssl_verify_ok,        // 验证成功
  ssl_verify_invalid,   // 验证失败
  ssl_verify_retry      // 需要重试（异步验证）
};
```

[https://github.com/google/boringssl/blob/04aa32f96f3094994a2971d703f7489b75b94f84/include/openssl/ssl.h#L2847](https://github.com/google/boringssl/blob/04aa32f96f3094994a2971d703f7489b75b94f84/include/openssl/ssl.h#L2847)

## 过 SSL Pinning

通过 Hook SSL_CTX_set_custom_verify 拦截并替换证书校验回调函数，使其始终返回成功（ssl_verify_ok），从而在 Native 层全局绕过 SSL Pinning。

```javascript
/**
 * Bypass SSL pinning by hooking SSL_CTX_set_custom_verify
 *
 * This function hooks the native SSL verification entry point used by:
 * - BoringSSL (libttboringssl.so)
 * - Cronet (libsscronet.so)
 *
 * Core idea:
 *   1. Intercept SSL_CTX_set_custom_verify
 *   2. Grab the verify callback (args[2])
 *   3. Hook the callback and force return 0 (verification success)
 *
 * @param {string} moduleName
 *        Target module name (e.g. "libttboringssl.so", "libsscronet.so")
 *
 * @param {boolean} printBacktrace
 *        Whether to print native backtrace when SSL_CTX_set_custom_verify is called
 *        Useful for analyzing call chain (default: false)
 */
function bypassSslCustomVerify(moduleName, printBacktrace = false) {

    // Wait until target module is loaded into memory
    waitForModule(moduleName).then((mod) => {

        const funcName = "SSL_CTX_set_custom_verify";

        // Locate symbol inside specific module
        const addr = Module.findExportByName(mod.name, funcName);

        if (!addr) {
            console.warn(`[!] ${funcName} not found in ${mod.name}`);
            return;
        }

        console.log(`[+] Hooking ${funcName} @ ${addr} in ${mod.name}`);

        // Attach to SSL_CTX_set_custom_verify
        Interceptor.attach(addr, {

            onEnter(args) {

                const caller = Process.findModuleByAddress(this.returnAddress);

                // args[2] = verify callback function pointer
                const cbPtr = args[2];

                // 构造统一日志（避免多线程输出错乱）
                let log = `[Hit] ${mod.name} -> ${funcName} ` +
                          `| caller=${caller ? caller.name : "unknown"} ` +
                          `| cb=${cbPtr}`;

                if (printBacktrace) {
                    const bt = Thread.backtrace(this.context, Backtracer.ACCURATE)
                        .map(DebugSymbol.fromAddress)
                        .join("\n");

                    log += `\n---- Backtrace ----\n${bt}\n-------------------`;
                }

                // 一次性输出
                console.log(log);

                try {
                    //int callback(void* ssl, void* x509_ctx)
                    const cb = new NativeFunction(cbPtr, 'int', ['pointer', 'pointer']);

                    // Hook verify callback
                    Interceptor.attach(cb, {

                        onLeave(retval) {

                            console.log(`[Bypass] verify callback from ${moduleName} | cb=${cbPtr}`);

                            retval.replace(0); // SSL_VERIFY_OK
                        }
                    });

                } catch (e) {
                    console.error(`[!] Failed to hook callback @ ${cbPtr}: ${e}`);
                }
            }
        });
    });
}
```

调用如下：

```javascript
// BoringSSL
bypassSslCustomVerify("libttboringssl.so", true); // **系
// Cronet
bypassSslCustomVerify("libsscronet.so", true);  // ******
```

日志输出如下：

```haskell
[+] Hooking SSL_CTX_set_custom_verify @ 0x7932a38b64 in libttboringssl.so
[+] Hooking SSL_CTX_set_custom_verify @ 0x7932a38b64 in libsscronet.so
[Hit] libttboringssl.so -> SSL_CTX_set_custom_verify | caller=libsscronet.so | cb=0x793156a090
---- Backtrace ----
0x7931568abc libsscronet.so!0x2c5abc
0x7931568abc libsscronet.so!0x2c5abc
0x7931568abc libsscronet.so!0x2c5abc
-------------------
[Hit] libsscronet.so -> SSL_CTX_set_custom_verify | caller=libsscronet.so | cb=0x793156a090
---- Backtrace ----
0x7931568abc libsscronet.so!0x2c5abc
0x7931568abc libsscronet.so!0x2c5abc
0x7931568abc libsscronet.so!0x2c5abc
-------------------
[Bypass] verify callback from libttboringssl.so | cb=0x793156a090
[Bypass] verify callback from libsscronet.so | cb=0x793156a090
...
[Hit] libttboringssl.so -> SSL_CTX_set_custom_verify | caller=libvcn.so | cb=0x79311570d8
---- Backtrace ----
0x793115749c libvcn.so!0x1749c
0x793115749c libvcn.so!0x1749c
0x79311515e0 libvcn.so!vcn_url_open_whitelist+0x7a4
0x792e9b6174 libavmdlbase.so!0x164174
0x792e9b54d8 libavmdlbase.so!0x1634d8
0x792e9b46bc libavmdlbase.so!0x1626bc
0x792e9b44e4 libavmdlbase.so!0x1624e4
0x793122fd10 libvcbasekit.so!0x28d10
0x7931229f18 libvcbasekit.so!0x22f18
0x793122966c libvcbasekit.so!0x2266c
0x7a83dc3d38 libc.so!_ZL15__pthread_startPv+0x10c
0x7a83d60580 libc.so!__start_thread+0x48
0x7a83d60580 libc.so!__start_thread+0x48
-------------------
[Hit] libsscronet.so -> SSL_CTX_set_custom_verify | caller=libvcn.so | cb=0x79311570d8
---- Backtrace ----
0x793115749c libvcn.so!0x1749c
0x793115749c libvcn.so!0x1749c
0x79311515e0 libvcn.so!vcn_url_open_whitelist+0x7a4
0x792e9b6174 libavmdlbase.so!0x164174
0x792e9b54d8 libavmdlbase.so!0x1634d8
0x792e9b46bc libavmdlbase.so!0x1626bc
0x792e9b44e4 libavmdlbase.so!0x1624e4
0x793122fd10 libvcbasekit.so!0x28d10
0x7931229f18 libvcbasekit.so!0x22f18
0x793122966c libvcbasekit.so!0x2266c
0x7a83dc3d38 libc.so!_ZL15__pthread_startPv+0x10c
0x7a83d60580 libc.so!__start_thread+0x48
0x7a83d60580 libc.so!__start_thread+0x48
-------------------
```

完整代码开源地址： [https://github.com/CYRUS-STUDIO/frida-ssl-pinning-bypass](https://github.com/CYRUS-STUDIO/frida-ssl-pinning-bypass)

## \*\*\*\*\*\*地区限制解决办法

虽然现在已经能抓包成功了，但是 \*\*\*\*\*\* 接口是有地区限制的。

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b5a3611e0fdadc3c.png)](data:image/png;base64,inline-242482B)

请求接口返回提示如下：

```
<! DOCTYPE html > < html > < meta charset = "utf-8" > < body > < p >!!! Unavailable in your area </p > </body > </html >
```

解决方案如下：

-   如果sim卡是国内的，拔掉sim卡
    
-   修改设备语言和时区
    
-   ip切到海外
    

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1f67628cc77763e4.png)](data:image/png;base64,inline-968566B)
