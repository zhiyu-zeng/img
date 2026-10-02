---
title: 【看雪】[转帖][讨论][原创]iOS逆向工程——cronet抓包SSL Pinning
source: https://bbs.kanxue.com/thread-293125.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-02T23:58:15+08:00
trace_id: 73edd3cf-30a5-4f8d-858e-c69be2ba3c53
content_hash: 45218b86bf07287523c4359b415d50138b469106e8172d24512b49ddb8581459
status: synced
tags:
  - 看雪
  - iOS逆向
  - 协议分析
series: null
feed_source: 看雪·iOS安全
ai_summary: 抓不到商品数据的根因是 Cronet 框架内的 SSL Pinning 校验，定位校验点后 Hook 返回 true 即可成功抓包。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ed75244-d011-81bd-8a0b-d35a770ec0c6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 抓不到商品数据的根因是 Cronet 框架内的 SSL Pinning 校验，定位校验点后 Hook 返回 true 即可成功抓包。
> 
> - **问题现象：** App 抓包仅得零散无用数据；开启 SSL Kill Switch 后依然无效，排除常见 SSL Pinning。
> - **框架确认：** Frida 挂载进程，结合断点确认网络请求由 `Frameworks/Cronet.framework` 发起。
> - **源码特征：** 源码用 `SSL_CTX_set_custom_verify` 注册校验回调，并设 `SSL_CTX_set_timeout` 为 3600。
> - **IDA 定位：** 关键字搜不到时改用特征值，3600 转十六进制 `0xE10`（立即数，无需考虑端序），搜出三个函数，确定关键调用 `sub_2E9130(..., 1, sub_2597E0)`，其实际校验在 `sub_259818`。
> - **绕过结果：** Hook 该校验函数并恒返回 true，抓包成功。

*本文章中所有内容仅供学习交流使用，不用于其他任何目的，严禁用于商业用途和非法用途，否则由此产生的一切后果均与作者无关；本文章未经许可禁止转载，禁止任何修改后二次传播，擅自使用本文涉及的技术而导致的任何意外，作者均不负责。*

打开 App 下拉抓主页抓包，抓不到商品信息数据，只有一些零散无用数据。先猜测可能是常见的 SSL Pinning，iOS 里用 SSL Kill Switch 开启后重试，仍然不行，依旧只有无用数据。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d19aa72b4f40de36.webp)

使用Frida，挂载app进程

## 定位Cronet框架

找到了在这个路径下，Frameworks\\Cronet.framework，把下面的文件导入到本地并进行反编译分析

获得了请求方法的地址，加上ASLR，在几个地址打断点，发生了断点，确认了是cronet进行网路请求

源码中校验位置

```cpp
SSL_CTX_set_custom_verify(ssl_ctx_.get(), SSL_VERIFY_PEER, CertVerifyCallback);
 
SSL CTX set session cache_mode(
Ssl ctx .get(),SSL SESS CACHE CLIENT | SSL SESS CACHE NO INTERNAL),SsL CTX sess set new_cb(ssl ctx .get(),Newsessioncallback);SSL_CTX set_timeout(ssl_ctx_.get(),1*60*60 /* one hour */);
SsL CTX set grease enabled(ssl ctx .get(),1);
```

我们直接搜关键字没搜索到可以找一些特征值搜索

## 特征值搜索定位

可以看到他下面有一个60 \* 60 也就是3600，转一下16进制就是 0xE10！！！这里不用考虑大小端因为是立即数  
ida 搜索一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0bd782ba5d4df260.webp)

一共涉及到三个函数我们一个一个看  
前两个明显不是  
第三个感觉比较像 3600是最后一个参数  
贴一下反编译代码

```cpp
__int64 sub_25A3DC()
{
  __int64 v0; // x19
  __int64 v1; // x0
  __int64 v2; // x0
  __int64 v3; // x0
  __int64 v4; // x21
  __int64 v5; // x0
 
  v0 = sub_BA758(16);
  *(_QWORD *)(v0 + 8) = 0;
  sub_340DBC();
  *(_DWORD *)v0 = sub_2E9678(0, 0, 0, 0, 0);
  v1 = sub_2F1BD4();
  v2 = sub_2E7BB8(v1);
  sub_2E9950(v0 + 8, v2);
  sub_2E50CC(*(_QWORD *)(v0 + 8), sub_25A4F0, 0);
  sub_2E970C(*(_QWORD *)(v0 + 8), 1);
  sub_2E9130(*(_QWORD *)(v0 + 8), 1, sub_2597E0);
  sub_2E9074(*(_QWORD *)(v0 + 8), 769);
  sub_2EBE88(*(_QWORD *)(v0 + 8), sub_25A520);
  sub_2EBDBC(*(_QWORD *)(v0 + 8), 3600);
  v3 = sub_2E9764(*(_QWORD *)(v0 + 8), 1);
  v4 = *(_QWORD *)(v0 + 8);
  v5 = sub_16F420(v3);
  sub_2E8E8C(v4, v5);
  sub_2E96C0(*(_QWORD *)(v0 + 8), sub_25A550);
  sub_2892E4(*(_QWORD *)(v0 + 8));
  return v0;
}
```

同时满足三个参数和最后一个函数的只有这个

```cpp
 sub_2E9130(*(_QWORD *)(v0 + 8), 1, sub_2597E0);
```

所以说关键的函数应该是sub_2597E0

## 关键回调函数

我们需要看下sub_2597E0干了什么

```cpp
__int64 __fastcall sub_2597E0(__int64 a1)
{
  __int64 v2; // x0
  __int64 v3; // x0
 
  v2 = sub_25A340();
  v3 = sub_259808(v2, a1);
  return sub_259818(v3);
}
```

实际上应该返回数字代表状态，是否检验通过 实际的检测在sub_259818里面  
如下 兴趣的可以简单看下逻辑

```cpp
__int64 __fastcall sub_259818(__int64 result)
{
  __int64 v1; // x19
  __int64 v2; // x0
  __int64 v3; // x0
  __int64 v4; // x22
  __int64 v5; // x1
  __int64 v6; // x0
  __int64 v7; // x1
  __int64 v8; // x22
  __int64 v9; // x23
  __int64 v10; // x24
  __int64 v11; // x0
  char v12; // nf
  char v13; // vf
  __int64 v14; // x8
  unsigned __int8 v15; // w9
  __int64 v16; // x10
  __int64 v17; // x11
  __int64 v18; // x21
  _QWORD *v19; // x25
  __int64 v20; // x26
  __int64 v21; // [xsp+18h] [xbp-168h] BYREF
  _QWORD v22[2]; // [xsp+20h] [xbp-160h] BYREF
  __int64 v23; // [xsp+30h] [xbp-150h] BYREF
  _QWORD v24[2]; // [xsp+38h] [xbp-148h] BYREF
  __int64 v25; // [xsp+50h] [xbp-130h] BYREF
  _QWORD v26[14]; // [xsp+58h] [xbp-128h] BYREF
  _QWORD v27[2]; // [xsp+C8h] [xbp-B8h] BYREF
  unsigned __int64 v28; // [xsp+D8h] [xbp-A8h] BYREF
  unsigned __int64 v29; // [xsp+E0h] [xbp-A0h] BYREF
  _QWORD v30[2]; // [xsp+E8h] [xbp-98h] BYREF
  unsigned __int64 v31; // [xsp+F8h] [xbp-88h] BYREF
  unsigned __int64 v32; // [xsp+100h] [xbp-80h] BYREF
  __int64 v33; // [xsp+108h] [xbp-78h] BYREF
  int v34; // [xsp+114h] [xbp-6Ch]
  _QWORD v35[3]; // [xsp+118h] [xbp-68h] BYREF
 
  v1 = result;
  if ( *(_DWORD *)(result + 296) != 1 )
    return sub_259B78(result);
  if ( !*(_QWORD *)(result + 136) )
  {
    v2 = sub_2E50D8(*(_QWORD *)(result + 304));
    v3 = sub_16F564(v2);
    sub_1E784(v1 + 136, v3);
    if ( *(_QWORD *)(v1 + 136) )
    {
      v4 = *(_QWORD *)(v1 + 904);
      if ( *(_DWORD *)(v4 + 68) )
      {
        memset(v35, 170, sizeof(v35));
        sub_1229F8(v35);
        sub_16F0D4(v26, *(_QWORD *)(v1 + 136));
        sub_122B50(v35, "certificates", 12, v26);
        sub_12232C(v26);
        sub_122298(v26, v35);
        sub_122A54(v35);
        sub_25B0BC(v4, 74, v1 + 888);
        sub_12232C(v26);
      }
      v34 = -1431655766;
      if ( (unsigned int)sub_259D88(v1) )
      {
        sub_15E058(v1 + 144);
        *(_DWORD *)(v1 + 184) = v34;
        sub_25B194(&v33);
        sub_1E784(v1 + 176, v33);
        *(_DWORD *)(v1 + 296) = 0;
        return sub_259B78(v1);
      }
      *(_QWORD *)(v1 + 288) = sub_12090C();
      v6 = sub_259DD4(v1);
      v8 = v6;
      v9 = v7;
      if ( !v7 || (*(_BYTE *)(v1 + 799) = 1, !(unsigned int)sub_258BC4(v6, v7)) )
      {
        v31 = 0xAAAAAAAAAAAAAAAALL;
        v32 = 0xAAAAAAAAAAAAAAAALL;
        sub_2E91C0(*(_QWORD *)(v1 + 304), &v32, &v31);
        v30[0] = v32;
        v30[1] = v31;
        v28 = 0xAAAAAAAAAAAAAAAALL;
        v29 = 0xAAAAAAAAAAAAAAAALL;
        sub_2E916C(*(_QWORD *)(v1 + 304), &v29, &v28);
        v27[0] = v29;
        v27[1] = v28;
        v10 = *(_QWORD *)(*(_QWORD *)(v1 + 272) + 64LL);
        v11 = sub_25B194(&v25);
        if ( !v9 )
        {
          sub_25B168(v11);
          if ( v12 != v13 )
            v8 = v16;
          else
            v8 = v14;
          if ( v12 != v13 )
            v9 = v17;
          else
            v9 = v15;
        }
        v18 = sub_28B974(v1 + 384);
        v19 = v35;
        sub_EF4A4(v35, v30);
        if ( v35[2] >= 0 )
        {
          v20 = HIBYTE(v35[2]);
        }
        else
        {
          v19 = (_QWORD *)v35[0];
          v20 = v35[1];
        }
        sub_EF4A4(v24, v27);
        sub_15AEFC(v26, v25, v8, v9, v18, v19, v20);
        v22[0] = sub_259DF8;
        v22[1] = 0;
        v21 = v1;
        v23 = sub_25AB48(sub_25AB18, v22, &v21);
        *(_DWORD *)(v1 + 296) = (*(__int64 (__fastcall **)(__int64, _QWORD *, __int64, __int64 *, __int64, __int64))(*(_QWORD *)v10 + 16LL))(
                                  v10,
                                  v26,
                                  v1 + 144,
                                  &v23,
                                  v1 + 280,
                                  v1 + 888);
        sub_C822C(&v23);
        sub_15AFA8(v26);
        sub_BACF0(v24);
        sub_BACF0(v35);
        return sub_259B78(v1);
      }
      sub_D58C8(v26, "VerifyCert", "../../net/socket/ssl_client_socket_impl.cc", 1189);
      v5 = 4294967114LL;
    }
    else
    {
      sub_D58C8(v26, "VerifyCert", "../../net/socket/ssl_client_socket_impl.cc", 1143);
      v5 = 4294967129LL;
    }
    sub_2893C4(v26, v5);
    return 1;
  }
  __break(0);
  return result;
}
```

已经定位到了检测点 我们开始写hook 看看能不能抓到包

hook检测函数

## Hook绕过并抓包成功

将返回值始终返回true

最终抓包成功！
