---
title: 【看雪】XX二游 消失的libil2cpp.so 提取与算法分析
source: https://bbs.kanxue.com/thread-292061.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-22T16:48:28+08:00
trace_id: a61104ad-d2b4-40f5-a757-32c7ea0442a0
content_hash: 73c20a729580818084071afa8f24f59b003c14e48989e8b1a28c4e7bd8943a9f
status: summarized
tags:
  - 看雪
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 看雪·Android安全
ai_summary: 通过Hook系统加载函数dlopen，并利用memfd内存文件机制，在加载时对加密的libil2cpp.so进行动态解密与内存映射，以实现对其的隐藏与保护。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3a575244-d011-818e-95be-cff8d3b29294
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过Hook系统加载函数dlopen，并利用memfd内存文件机制，在加载时对加密的libil2cpp.so进行动态解密与内存映射，以实现对其的隐藏与保护。
> 
> - **加载器机制：** 核心加载器libgedenedo.so在`JNI_OnLoad`中初始化，通过`dlsym`保存真实`dlopen`和`android_dlopen_ext`函数地址，并使用InlineHook进行替换。
> - **资源定位与解密：** `hooked_dlopen`会检查so名称，匹配时通过`resource_decrypt_to_fd`在加载器尾部资源表中查找加密数据，解密流程为：第一层AES-256-CBC解密 + 第二层AES-256-CBC解密 + 自定义LZMA解压。
> - **内存加载与反检测：** 优先使用`dlopen_elf_from_memfd`方案，通过`memfd_create`系统调用创建匿名内存fd，将解密后的ELF写入后，利用`android_dlopen_ext`的`ANDROID_DLEXT_USE_LIBRARY_FD`标志从fd加载，避免文件落盘。
> - **算法细节：** AES解密的密钥由一个自定义的RSA椭圆曲线算法（巨大case结构）生成；解压使用自定义LZMA实现，并带有特定文件头校验。
> - **提取方法：** 最终可通过Hook加载器中的虚函数调用或Frida动态插桩，在解密完成时拦截内存数据，成功提取出约254MB的`libil2cpp_dec.so`文件。

首先看APK

这个版本更新了之后libil2cpp.so离奇的消失了在gameguardian也不显示

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/baa49f73d3009cf9.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/75c283f5c791a57b.webp)

但是在maps中存在 memfd ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7d219d306db26697.webp)

说明肯定有一个加载器 看大小libgedenedo.so最接近话不多说直接上ida（虽然很不专业 没有结合dex 主要目的是获取so dex是明文在apk的assets的xinerora.ini里面使用InMemoryDexClassLoader加载）

```cpp
jint JNI_OnLoad(JavaVM *vm, void *reserved)
{
  jint v2; // w19
  __int64 v4; // x8
  int v5; // w20
  size_t v6; // x0
  __int64 i; // x8
  unsigned __int64 *v8; // x20
  unsigned __int64 *v9; // x8
  unsigned __int64 v10; // x9
  char v11[96]; // [xsp+8h] [xbp-318h] BYREF
  _QWORD v12[3]; // [xsp+68h] [xbp-2B8h] BYREF
  int v13; // [xsp+80h] [xbp-2A0h] BYREF
  _BYTE v14[57]; // [xsp+84h] [xbp-29Ch] BYREF
  char v15; // [xsp+BDh] [xbp-263h]
  __int64 v16; // [xsp+180h] [xbp-1A0h] BYREF
  __int64 v17; // [xsp+1A0h] [xbp-180h] BYREF
  unsigned __int64 *v18; // [xsp+1A8h] [xbp-178h]
  _QWORD v19[3]; // [xsp+1B0h] [xbp-170h] BYREF
  _BYTE src[256]; // [xsp+1C8h] [xbp-158h] BYREF
  __int64 v21; // [xsp+2C8h] [xbp-58h] BYREF
  __int64 v22; // [xsp+2E8h] [xbp-38h] BYREF
  __int64 v23; // [xsp+2F8h] [xbp-28h] BYREF

  v23 = 0;
  v2 = 65542;
  if ( (*vm)->GetEnv(vm, (void **)&v23, 65542) )
    return -1;
  virtualtable_off_2F42D8 = (__int64)sub_53470();
  if ( (sub_3FAE0() & 0x80000000) != 0 )
    return -1;
  if ( (init_hooks_and_context() & 0x80000000) != 0 )        //这里的符号手动标注过了
    return -1;
  if ( (sub_3F3E4() & 0x80000000) != 0 )
    return -1;
  v22 = v23;
  if ( (sub_3FF8C((__int64)src, (__int64)&unk_2F4058, (__int64)&unk_2F4018, 16, (__int64)&unk_2F4028) & 0x80000000) != 0 )
    return -1;
  v19[0] = &v21;
  v13 = 124;
  qmemcpy(v14, "T1", 2);
  v4 = 0;
  v14[2] = 20;
  v14[3] = 30;
  v14[4] = -10;
  v14[5] = -32;
  v14[6] = -83;
  v14[7] = -17;
  v14[8] = -27;
  v14[9] = -21;
  v14[10] = -31;
  v14[11] = -88;
  v14[12] = -57;
  v14[13] = -21;
  v14[14] = -32;
  v14[15] = -18;
  v14[16] = -17;
  v14[17] = -7;
  v14[18] = -75;
  v14[19] = -58;
  v14[20] = -36;
  v14[21] = -5;
  v14[22] = -13;
  v14[23] = -27;
  v14[24] = -11;
  v14[25] = -70;
  v14[26] = -6;
  v14[27] = -10;
  v14[28] = -10;
  v14[29] = -2;
  v14[30] = -75;
  v14[31] = -44;
  v14[32] = -2;
  v14[33] = -9;
  v14[34] = -5;
  v14[35] = -4;
  v14[36] = -44;
  v14[37] = -102;
  v14[38] = -117;
  v14[39] = -17;
  v14[40] = -50;
  v14[41] = -60;
  v14[42] = -48;
  v14[43] = -58;
  v14[44] = -121;
  v14[45] = -59;
  v14[46] = -53;
  v14[47] = -59;
  v14[48] = -53;
  v14[49] = -126;
  v14[50] = -31;
  v14[51] = -51;
  v14[52] = -38;
  v14[53] = -44;
  v14[54] = -47;
  v14[55] = -57;
  v14[56] = -113;
  v15 = 0;
  do
  {
    v14[v4] ^= (_BYTE)v4 + (_BYTE)v13;
    ++v4;
  }
  while ( v4 != 57 );
  v15 = 0;
  v19[1] = v14;                                 // 最开始的地方
  v19[2] = sub_3E298;
  if ( (RegisterNatives(&v22, (__int64)src, (__int64)v19, 1u) & 0x80000000) != 0 )
    return -1;
  v5 = qword_2FB470 + 168;
  v6 = sub_DF528(src);
  sub_3B4B0(v5, src, v6);
  v17 = 0;
  v18 = 0;
  if ( (sub_296A4(&v22, &v17, (__int64)"android/app/AppComponentFactory") & 0x80000000) == 0 )
  {
    if ( (sub_3FF8C((__int64)&v13, (__int64)&unk_2F4178, (__int64)&unk_2F4018, 16, (__int64)&unk_2F4028) & 0x80000000) != 0 )
    {
      v2 = -1;
    }
    else if ( sub_DF528(&v13) )
    {
      v12[0] = &v16;
      strcpy(v11, "*KNlcxc1ncpi1Qdlgev=Nlcxc1ncpi1Qdlgev=Nlcxc1ncpi1Qdlgev=Nlcxc1ncpi1Qdlgev=+Nlcxc1ncpi1Qdlgev=");
      for ( i = 0; i != 93; ++i )
        v11[i] -= 2;
      v12[1] = v11;
      v12[2] = &loc_3E430;
      if ( (int)RegisterNatives(&v22, (__int64)&v13, (__int64)v12, 1u) < 0 )
        v2 = -1;
      else
        v2 = 65542;
      v8 = v18;
      if ( !v18 )
        return v2;
      goto LABEL_23;
    }
  }
  v8 = v18;
  if ( !v18 )
    return v2;
LABEL_23:
  v9 = v8 + 1;
  do
    v10 = __ldaxr(v9);
  while ( __stlxr(v10 - 1, v9) );
  if ( !v10 )
  {
    (*(void (__fastcall **)(unsigned __int64 *))(*v8 + 16))(v8);
    sub_1E4724(v8);
  }
  return v2;
}
```

```cpp
//初始化:
//    dlsym(RTLD_DEFAULT, "dlopen") -> 保存真实dlopen
//    dlsym(RTLD_DEFAULT, "android_dlopen_ext") -> 保存真实函数
//    Hook dlopen -> hooked_dlopen
//    Hook android_dlopen_ext -> hooked_android_dlopen_ext
//    JNI取app路径 -> 创建随机子目录
__int64 init_hooks_and_context()
{
  __int64 v1; // x20
  char v2[24]; // [xsp+8h] [xbp-48h] BYREF

  if ( (unsigned int)sub_DFB04(0, 0) )
    return 3771735703LL;
  off_2FB518 = dlsym(0, "dlopen");              // off_2FB518 = dlsym(RTLD_DEFAULT, "dlopen")  // 保存真实dlopen
  off_2FB520 = dlsym(0, "android_dlopen_ext");  // off_2FB520 = dlsym(RTLD_DEFAULT, "android_dlopen_ext")  // 保存真实函数
  strcpy(v2, "android_dlopen_ext");
  v1 = sub_DFE4C(sub_43134, 0, 0, v2, hooked_android_dlopen_ext, 0, 0);
  strcpy(v2, "dlopen");
  qword_2FB528 = sub_DFE4C(sub_43134, 0, 0, v2, hooked_dlopen, 0, 0);
  qword_2FB530 = v1;
  sub_28124(sub_4362C);
  return 0;
}
```

**其本质就是hook了dlopen 和 android_dlopen_ext 在加载的时候对比so name进入解密解压流程**

```cpp
//     1) 优先dlopen_elf_from_memfd不落盘
//     2) 回退dlopen_from_disk_fallback (写磁盘再dlopen)
__int64 __fastcall hooked_dlopen(char *a1, unsigned int a2)
{
  __int64 v2; // x30
  __int64 v3; // x19
  __int64 v6; // x22
  __int64 (__fastcall *v7)(char *, _QWORD); // x0

  v3 = v2;
  if ( !a1
    || !qword_2FB470
    || !*(_DWORD *)(qword_2FB470 + 156)
    || ((unsigned __int8)sub_42AF4(a1) & 1) == 0
    || (sub_428F0("libc.so"), (v6 = sub_428C0(a1, a2, v3)) == 0) )
  {
    v7 = (__int64 (__fastcall *)(char *, _QWORD))sub_E001C(hooked_dlopen);
    v6 = v7(a1, a2);
    if ( !v6 )
    {
      if ( a1 )
      {
        if ( (unsigned int)sub_46174(qword_2FB470 + 192, a1) )
        {
          if ( !qword_2FB470 || !*(_DWORD *)(qword_2FB470 + 160) || (v6 = dlopen_elf_from_memfd(a1, a2, 0)) == 0 )// memfd落地处
            v6 = dlopen_from_disk_fallback(a1, a2, 0, 0);
        }
        else
        {
          v6 = 0;
        }
      }
    }
  }
  if ( !(unsigned int)sub_DFE3C() )
    sub_E00C4(v3);
  return v6;
}
```

```cpp
// [Load] memfd + android_dlopen_ext:
//     1) resource_decrypt_to_fd() → AES-256-CBC解密 + memfd
//     2) 构造AndroidDlextInfo{flags|=0x10, fd}
//     3) android_dlopen_ext(name, flags, &dlextinfo) → 匿名加载
__int64 __fastcall dlopen_elf_from_memfd(char *a1, unsigned int a2, __int128 *a3)
{
  unsigned __int64 v6; // x0
  long double v7; // q0
  unsigned __int64 v8; // x22
  char *v9; // x23
  size_t v10; // x24
  unsigned __int64 v11; // x10
  char *v12; // x11
  unsigned __int64 v13; // x12
  int v14; // w13
  char *v15; // x9
  char *v16; // x12
  char *v17; // x1
  char *v18; // x0
  __int64 v19; // x22
  int v20; // w0
  __int128 v21; // q1
  __int128 v22; // q2
  __int64 v23; // x9
  char *v24; // x0
  __int128 v26; // [xsp+0h] [xbp-90h] BYREF
  void *ptr[2]; // [xsp+10h] [xbp-80h]
  __int128 v28; // [xsp+20h] [xbp-70h]
  _QWORD v29[2]; // [xsp+38h] [xbp-58h] BYREF
  void *v30; // [xsp+48h] [xbp-48h]
  int fd; // [xsp+5Ch] [xbp-34h] BYREF

  ptr[0] = 0;
  v26 = 0u;
  v6 = sub_DF528(a1);
  if ( v6 >= 0xFFFFFFFFFFFFFFF0LL )
    sub_3B5F4(&v26);
  v8 = v6;
  if ( v6 >= 0x17 )
  {
    v10 = (v6 + 16) & 0xFFFFFFFFFFFFFFF0LL;
    v9 = (char *)sub_1E4A20(v10);
    *((_QWORD *)&v26 + 1) = v8;
    ptr[0] = v9;
    *(_QWORD *)&v26 = v10 | 1;
    goto LABEL_6;
  }
  v9 = (char *)&v26 + 1;
  LOBYTE(v26) = 2 * v6;
  if ( v6 )
LABEL_6:
    v7 = sub_DF37C((unsigned __int64)v9, a1, v8);
  v9[v8] = 0;
  v11 = *((_QWORD *)&v26 + 1);
  v29[1] = 0;
  v30 = 0;
  v29[0] = 0;
  if ( (v26 & 1) != 0 )
  {
    v12 = (char *)ptr[0];
  }
  else
  {
    v11 = (unsigned __int64)(unsigned __int8)v26 >> 1;
    v12 = (char *)&v26 + 1;
  }
  if ( v11 )
  {
    v13 = v11;
    while ( v13 )
    {
      v14 = (unsigned __int8)v12[--v13];
      if ( v14 == 47 )
      {
        ++v13;
        break;
      }
    }
  }
  else
  {
    v13 = 0;
  }
  v15 = (char *)ptr[0] + v13;
  v16 = (char *)&ptr[-2] + v13;
  if ( (v26 & 1) != 0 )
    v17 = v15;
  else
    v17 = v16 + 1;
  sub_4347C(v29, v17, &v12[v11], v7);
  if ( (v26 & 1) != 0 )
    j__free(ptr[0]);
  if ( (v29[0] & 1) != 0 )
    v18 = (char *)v30;
  else
    v18 = (char *)v29 + 1;
  v19 = off_2FB520(v18, 6, 0);
  if ( !v19 )
  {
    fd = -1;
    v20 = resource_decrypt_to_fd(qword_2FB470 + 192, &fd, a1);// fd走向
    if ( (fd | v20) < 0 )
    {
      v19 = 0;
      if ( (v29[0] & 1) == 0 )
        return v19;
      goto LABEL_36;
    }
    *(_OWORD *)ptr = 0u;
    v28 = 0u;
    v26 = 0u;
    if ( a3 )
    {
      v21 = a3[1];
      v22 = a3[2];
      v26 = *a3;
      *(_OWORD *)ptr = v21;
      v28 = v22;
      v23 = v26 | 0x10;
    }
    else
    {
      v23 = 16;
    }
    *(_QWORD *)&v26 = v23;                      // flags |= 0x10  →  ANDROID_DLEXT_USE_LIBRARY_FD
    HIDWORD(ptr[1]) = fd;                       // HIDWORD(ptr[1]) = fd  // ANDROID_DLEXT_USE_LIBRARY_FD
    if ( (v29[0] & 1) != 0 )
      v24 = (char *)v30;
    else
      v24 = (char *)v29 + 1;
    v19 = off_2FB520(v24, a2, &v26);            // off_2FB520(name, flags, &dlextinfo) → 真实android_dlopen_ext
    close(fd);                                  // close(fd)  // fd不再需要, 但映射已由linker接管
  }
  if ( (v29[0] & 1) != 0 )
LABEL_36:
    j__free(v30);
  return v19;
}
```

```cpp
// [资源解密] 查找资源 → decrypt_elf_to_memfd
// 解析so_name → 查资源表 → 解密
__int64 __fastcall resource_decrypt_to_fd(__int64 a1, __int64 a2, char *a3)
{
  __int64 v3; // x19
  unsigned __int64 v7; // x0
  unsigned __int64 v8; // x23
  char *v9; // x24
  size_t v10; // x25
  unsigned __int64 v11; // x10
  char *v12; // x11
  unsigned __int64 v13; // x12
  int v14; // w13
  char *v15; // x9
  char *v16; // x12
  char *v17; // x1
  __int64 *v18; // x0
  char *v19; // x1
  unsigned int v20; // w20
  __int64 v22; // [xsp+0h] [xbp-70h] BYREF
  unsigned __int64 v23; // [xsp+8h] [xbp-68h]
  void *ptr; // [xsp+10h] [xbp-60h]
  size_t v25[2]; // [xsp+18h] [xbp-58h] BYREF
  void *v26; // [xsp+28h] [xbp-48h]

  v3 = a1 + 8;
  sub_1E4874(a1 + 8);
  v23 = 0;
  ptr = 0;
  v22 = 0;
  v7 = sub_DF528(a3);
  if ( v7 >= 0xFFFFFFFFFFFFFFF0LL )
    sub_3B5F4();
  v8 = v7;
  if ( v7 >= 0x17 )
  {
    v10 = (v7 + 16) & 0xFFFFFFFFFFFFFFF0LL;
    v9 = (char *)sub_1E4A20(v10);
    v23 = v8;
    ptr = v9;
    v22 = v10 | 1;
    goto LABEL_6;
  }
  v9 = (char *)&v22 + 1;
  LOBYTE(v22) = 2 * v7;
  if ( v7 )
LABEL_6:
    sub_DF37C((unsigned __int64)v9, a3, v8);
  v9[v8] = 0;
  v11 = v23;
  v25[1] = 0;
  v26 = 0;
  v25[0] = 0;
  if ( (v22 & 1) != 0 )
  {
    v12 = (char *)ptr;
  }
  else
  {
    v11 = (unsigned __int64)(unsigned __int8)v22 >> 1;
    v12 = (char *)&v22 + 1;
  }
  if ( v11 )
  {
    v13 = v11;
    while ( v13 )
    {
      v14 = (unsigned __int8)v12[--v13];
      if ( v14 == 47 )
      {
        ++v13;
        break;
      }
    }
  }
  else
  {
    v13 = 0;
  }
  v15 = (char *)ptr + v13;
  v16 = (char *)&v22 + v13;
  if ( (v22 & 1) != 0 )
    v17 = v15;
  else
    v17 = v16 + 1;
  sub_4347C(v25, v17, &v12[v11]);
  if ( (v22 & 1) != 0 )
    j__free(ptr);
  v18 = lookup_resource_entry((_QWORD *)(a1 + 256), (unsigned __int8 *)v25);  //这里通过hashtable查找资源
  if ( !v18 )
  {
    v20 = -523231431;
    if ( (v25[0] & 1) == 0 )
      goto LABEL_27;
    goto LABEL_26;
  }
  if ( (v25[0] & 1) != 0 )
    v19 = (char *)v26;
  else
    v19 = (char *)v25 + 1;
  v20 = decrypt_elf_to_memfd(a1, v19, v18 + 5, a2);// 通过此libgedenedo.so尾部的38mb字节的文件进行解密解压
  if ( (v25[0] & 1) != 0 )
LABEL_26:
    j__free(v26);
LABEL_27:
  sub_1E4898(v3);
  return v20;
}
```

```cpp
// 解密ELF到memfd主解密函数
// 1 从资源读取加密数据
// 2 AES解密
// 3 TARA解压
// 4 写入memfd
__int64 __fastcall decrypt_elf_to_memfd(__int64 a1, __int64 a2, __int64 *a3, int *a4)
{
  size_t v5; // x1
  unsigned int v9; // w21
  unsigned __int64 v10; // x2
  __int64 v11; // x9
  long double v12; // q0
  size_t v13; // x1
  unsigned int v14; // w0
  __int64 v15; // x24
  _QWORD *v16; // x0
  unsigned __int64 *v17; // x25
  unsigned __int64 *v18; // x20
  void *v19; // x8
  __int64 v20; // x8
  int v21; // w3
  int v22; // w23
  int v23; // w22
  __int64 v24; // x23
  unsigned __int64 v25; // x24
  unsigned __int64 v26; // x26
  ssize_t v27; // x0
  __int64 v28; // x1
  void *v29; // x0
  unsigned __int64 v31; // x8
  _QWORD v32[4]; // [xsp+1218h] [xbp-198h] BYREF
  __int64 v33; // [xsp+1238h] [xbp-178h] BYREF
  _OWORD v34[16]; // [xsp+1240h] [xbp-170h] BYREF
  void *v35; // [xsp+1348h] [xbp-68h] BYREF
  void *v36; // [xsp+1350h] [xbp-60h]
  __int64 v37; // [xsp+1358h] [xbp-58h]

  v36 = 0;
  v37 = 0;
  v35 = 0;
  v5 = a3[1];
  if ( v5 )
    sub_3B674((__int64)&v35, v5);
  v9 = -523231930;
  if ( *(_DWORD *)(a1 + 416) )
  {
    v10 = a3[1];
    v11 = *(_QWORD *)(a1 + 392);
    if ( v10 + *a3 > *(_QWORD *)(a1 + 400) - v11 )
      goto LABEL_18;
    v12 = sub_DF37C((unsigned __int64)v35, (char *)(v11 + *a3), v10);
    v13 = a3[1];
  }
  else
  {
    fseek(*(FILE **)(a1 + 136), *a3, 0);
    v13 = fread(v35, 1u, a3[1], *(FILE **)(a1 + 136));
    if ( v13 != a3[1] )
      goto LABEL_18;
  }
  (*(void (__fastcall **)(void *, size_t, __int64 *, __int64, void *, size_t, __int64 *, long double))(virtualtable_off_2F42D8 + 0x548))(// 2F4820
    v35,
    v13,
    a3 + 3,
    32,
    v35,
    v13,
    a3 + 7,
    v12);
  v14 = (*(__int64 (__fastcall **)(__int64, _OWORD *))(virtualtable_off_2F42D8 + 0x478))(61463, v34);// 2F4750
  if ( (v14 & 0x80000000) != 0 )
  {
    v9 = v14;
LABEL_18:
    v29 = v35;
    if ( !v35 )
      return v9;
LABEL_19:
    v36 = v29;
    j__free(v29);
    return v9;
  }
  v15 = *(_QWORD *)&v34[0];
  v16 = sub_1E4A20(0x30u);
  v16[1] = 0;
  v17 = v16 + 1;
  *((_OWORD *)v16 + 2) = xmmword_200940;
  memset(&v34[12], 0, 48);
  v34[15] = xmmword_200D08;
  v16[2] = 0;
  v16[3] = v15;
  memset(&v34[8], 0, 64);
  v34[4] = xmmword_200C58;
  v34[5] = xmmword_200C68;
  v18 = v16;
  v34[6] = xmmword_200C78;
  v34[7] = xmmword_200C88;
  v19 = v35;
  v34[0] = xmmword_200C18;
  v34[1] = xmmword_200C28;
  *v16 = off_2E3C50;
  v34[2] = xmmword_200C38;
  v34[3] = xmmword_200C48;
  v32[0] = v19;
  v20 = a3[2];
  v32[3] = 256;
  v32[1] = v20;
  v32[2] = v34;
  v22 = sub_84CD0(v15, &v33, (__int64)v32, v21);// sub_84A48 解压调用
  if ( (v22 & 0x80000000) == 0 )
  {
    v23 = syscall(279, a2, 1);                  // syscall(279, name, MFD_CLOEXEC) → memfd_create
    if ( v23 < 0 )
    {
      v22 = -523231469;
    }
    else
    {
      v24 = (*(__int64 (__fastcall **)(__int64))(*(_QWORD *)v33 + 24LL))(v33);// vtable[3] → GetData() = *(void**)(v32+0x10)
      v25 = (*(__int64 (__fastcall **)(__int64))(*(_QWORD *)v33 + 32LL))(v33);// vtable[4] → GetSize() = *(size_t*)(v32+0x18)
      if ( v25 )
      {
        v26 = 0;
        do
        {
          v27 = write(v23, (const void *)(v24 + v26), v25 - v26);// write(fd, elf_data, size) → 写入完整ELF到memfd
          if ( v27 < 0 )
          {
            if ( *(_DWORD *)__errno(v27, v28) != 4 )
            {
              close(v23);
              v22 = -523231468;
              goto LABEL_23;
            }
          }
          else
          {
            v26 += v27;
          }
        }
        while ( v25 > v26 );
      }
      lseek(v23, 0, 0);                         // lseek(fd, 0, SEEK_SET) → 复位文件指针 → *a4 = fd
      v22 = 0;
      *a4 = v23;
    }
LABEL_23:
    (*(void (__fastcall **)(__int64))(*(_QWORD *)v33 + 8LL))(v33);
  }
  do
    v31 = __ldaxr(v17);
  while ( __stlxr(v31 - 1, v17) );
  if ( !v31 )
  {
    (*(void (__fastcall **)(unsigned __int64 *))(*v18 + 16))(v18);
    sub_1E4724(v18);
  }
  v9 = v22;
  v29 = v35;
  if ( v35 )
    goto LABEL_19;
  return v9;
}
```

到这里就可以有好几种方式获取so了 可以通过hook虚函数也可以frida打桩

主要从算法分析来看

.data:00000000002F4820 DCQ aes_cbc_decrypt_wrapper; AES-256-CBC解密: (qword_2FB478+0x548/1352)

.data:00000000002F4820; 参数: src, size, key(32B), 32, dst, size, iv(16B)

(\*(void (\__fastcall \*\*)(void \*, size_t, \__int64 \*, \__int64, void \*, size_t, \__int64 \*, long double))(virtualtable_off_2F42D8 + 0x548))(// 2F4820

v35,

v13,

a3 + 3,

32,

v35,

v13,

a3 + 7,

v12);

.data:00000000002F4750 DCQ sub_53278

是一个自定义rsa椭圆曲线算法  

```cpp
__int64 sub_53278(__int64 a1, __int64 a2, ...)
{
  gcc_va_list va1; // [xsp+B0h] [xbp-50h] BYREF
  gcc_va_list va; // [xsp+D0h] [xbp-30h] BYREF

  va_start(va, a2);
  va_arg(va, _QWORD);
  va_arg(va, _QWORD);
  va_arg(va, _QWORD);
  va_arg(va, _QWORD);
  va_arg(va, _QWORD);
  va_arg(va, _QWORD);
  va_end(va);
  va_start(va, a2);
  va_copy(va1, va);
  return sub_59E18(a1, a2, va1);
}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9daa604f873b844a.webp)

内部是一个巨大的case结构这里不多讲就是通过这个来实现生成aes密钥进行第二次解密

```cpp
__int64 __fastcall sub_84CD0(__int64 a1, _QWORD *a2, __int64 a3, int a4)
{
  int v4; // w8

  v4 = *(_DWORD *)(*(_QWORD *)a3 + 4LL);
  if ( v4 == 3 )
    return sub_84A48(a1, a2, a3, a4);     //根据调用堆栈和伪代码最终走了这个分支
  if ( v4 == 2 )
    return sub_84854(a1, a2, a3, a4);
  return 0xE0010002LL;
}

__int64 __fastcall sub_84A48(__int64 a1, _QWORD *a2, __int64 a3, int a4)
{
  int32x4_t *v4; // x20
  unsigned int v5; // w22
  unsigned __int64 v6; // x8
  unsigned __int64 v7; // x9
  unsigned __int64 v11; // x9
  unsigned __int64 v12; // x1
  unsigned int v13; // w0
  unsigned int v14; // w0
  __int64 v15; // x2
  unsigned int v16; // w0
  size_t v17; // x22
  _BYTE *v18; // x21
  size_t v19; // x0
  void *v20; // x23
  _DWORD *v21; // x0
  size_t v22; // x9
  unsigned int *v23; // x8
  unsigned int v24; // w9
  size_t dstSize; // [xsp+8h] [xbp-68h] BYREF
  __int128 v27; // [xsp+10h] [xbp-60h] BYREF
  size_t srcSize; // [xsp+20h] [xbp-50h] BYREF
  unsigned __int64 v29; // [xsp+28h] [xbp-48h] BYREF
  void *v30; // [xsp+30h] [xbp-40h] BYREF
  __int64 v31; // [xsp+38h] [xbp-38h] BYREF

  v4 = *(int32x4_t **)a3;
  v5 = 0xE0DF1671;
  if ( **(_DWORD **)a3 == 1095909716 && v4->n128_u32[1] == 3 )
  {
    v6 = *(_QWORD *)(a3 + 8);
    v7 = v4->n128_u32[3];
    if ( v6 - 32 > v7 )
    {
      v11 = v7 + ((v4[1].n128_u32[0] + 15) & 0xFFFFFFF0) + 32;
      if ( v6 >= v11 )
        v12 = v11;
      else
        v12 = *(_QWORD *)(a3 + 8);
      if ( (unsigned int)sub_54874(*(int32x4_t **)a3, v12) )
      {
        return (unsigned int)-522250623;
      }
      else
      {
        v13 = sub_558F8((unsigned __int64 *)&v31);
        if ( (v13 & 0x80000000) != 0 )
        {
          return v13;
        }
        else
        {
          if ( a4 )
            v14 = sub_55FDC(v31, *(_QWORD *)(a3 + 16), *(_QWORD *)(a3 + 24));
          else
            v14 = sub_56160();
          v5 = v14;
          if ( (v14 & 0x80000000) == 0 )
          {
            v15 = v4->n128_u32[3];
            v16 = a4
                ? sub_55F6C(v31, (__int64)&v4[2], v15, (__int64)&v30, (__int64)&v29)
                : sub_55F98(v31, (__int64)&v4[2], v15, (__int64)&v30, (__int64)&v29);
            v5 = v16;
            if ( (v16 & 0x80000000) == 0 )
            {
              v17 = (v4[1].n128_u32[0] + 15) & 0xFFFFFFF0;
              srcSize = v4[1].n128_u32[0];
              v27 = 0u;
              v18 = sub_1E4AB0(v17);
              v5 = aes_cbc_decrypt_wrapper((_BYTE *)&v4[2] + v4->n128_u32[3], v17, (__int64)v30, v29, v18, v17, &v27);
              if ( (v5 & 0x80000000) == 0 )
              {
                v19 = v4[1].n128_u32[1];
                dstSize = v19;
                v20 = sub_1E4AB0(v19);
                v5 = sub_53258(v20, &dstSize, v18, &srcSize, &v4[1].n128_u32[2], 5);// 自定义lmza 已经实现sub_10F9F0(__int64 a1, __int64 a2, __int64 a3, __int64 a4, __int64 a5, __int64 a6)
```

内部是一个巨长的自定义lmza特定文件的定向解压缩函数

直接把伪代码搬过来跑一下ok so生成成功！

```rust
PS C:\Users\ChxRe\source\repos\unpack>  & 'D:\Python\Python313\python.exe' 'c:\Users\ChxRe\.vscode\extensions\ms-python.debugpy-2026.6.0-win32-x64\bundled\libs\debugpy\launcher' '61478' '--' 'c:\Users\ChxRe\source\repos\unpack\decrypt_tara.py' 
输入: C:\Users\ChxRe\Desktop\libgedenedo.so
输出: c:\Users\ChxRe\source\repos\unpack\libil2cpp_dec.so

[1] 读取 43,104,439 字节
[2] 搜索资源表...
    offset=0x2F7CD0 size=0x2623B60
[3] Layer1 AES-CBC 解密 (39,992,160 bytes)...
    TARA enc=39,991,998 props=5d 00 40 00 00
[4] Layer2 AES-CBC 解密 (39,991,998 bytes)...
[5] LZMA 解压...
    [+] ret=6 out=266192164 (253.86MB) in_used=39991998
    [+] Saved libil2cpp_dec.so (253.86 MB)

[OK] c:\Users\ChxRe\source\repos\unpack\libil2cpp_dec.so (253.86 MB) b'\x7fELF'
```

篇幅太短了具体实现已打包使用msvc编译即可食用 很多细节比如文件头和动态调试都没有讲清楚 没办法第一次发不专业

## 附件

- [unpack.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/b23895014ee060b7.zip) （14.84kb，3次下载）
