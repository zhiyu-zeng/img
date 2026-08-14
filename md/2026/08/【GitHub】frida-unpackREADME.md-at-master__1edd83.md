---
title: 【GitHub】frida-unpack/README.md at master
source: https://github.com/dstmath/frida-unpack/blob/master/README.md
source_host: github.com
clip_date: 2026-08-14T17:27:18+08:00
trace_id: 7d80df59-ed18-487b-a132-3173c1ed8075
content_hash: 3cef2bb013134351c69776d24d463b045cbbb379cab7377c3e75952b968367df
status: synced
tags:
  - GitHub
  - Frida
  - 脱壳与加固
series: null
feed_source: null
ai_summary: 基于Frida hook libart.so 的 OpenMemory 方法，从内存导出已解密 dex，实现对乐固、360 等加壳应用的脱壳。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 0
  failed_urls:
    - https://camo.githubusercontent.com/bbd01b9eab7d2f9f50e242a40886bbf1bf7f571610a36ba23d160cd420abb674/68747470733a2f2f646172746e6f64652e636f6d2f6272616e64696e672f444e2d4f70656e2d536f757263652d736d2e706e67
notion_page_id: 3bc75244-d011-8150-a052-cc438c4bd48b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 基于Frida hook libart.so 的 OpenMemory 方法，从内存导出已解密 dex，实现对乐固、360 等加壳应用的脱壳。
> 
> - **原理：** Hook libart.so 中的 OpenMemory（Android 10 为 /apex/com.android.runtime/lib/libdexfile.so 的 OpenCommon），拿到 dex 内存地址并计算大小后导出。
> - **用法：** 在手机启动 frida-server 后，执行 `./inject.sh 包名 OpenMemory.js`；也可用 `python frida_unpack.py 包名`；脱壳后的 dex 保存于 `/data/data/包名/`。
> - **测试环境：** Android 7.1.2 32bit，支持乐固（libshella-2.8.so）与 360（libjiagu.so）；64 位可能需要修改 OpenMemory 的签名。
> - **查导出名：** 用 `adb pull` 拉取 libart.so，再通过 `nm libart.so | grep OpenMemory` 查看方法导出名称。
> - **辅助技巧：** 用 `c++filt` 还原 C++ mangled 函数名，如 `art::DexFile::OpenMemory` 完整签名。

## frida-unpack

基于Frida的脱壳工具

## 0x0 frida环境搭建

frida环境搭建，参考frida官网： [frida](https://www.frida.re/) 。

## 0x2 原理说明

利用frida hook libart.so中的OpenMemory方法，拿到内存中dex的地址，计算出dex文件的大小，从内存中将dex导出。 ps：查看OpenMemory的导出名称，可以将手机中的libart.so通过adb pull命令导出到电脑，然后利用： `nm libart.so |grep OpenMemory` 命令来查看到出名。 其中android 10为 `/apex/com.android.runtime/lib/libdexfile.so` 方法为 `OpenCommon` 。

## 0x3 脚本用法

-   在手机上启动frida server端
-   执行脱壳脚本

```
执行./inject.sh 要脱壳的应用的包名 OpenMemory.js
```

-   脱壳后的dex保存在 `/data/data/应用包名/` 目录下

## 0x4 脚本测试环境

此脚本在以下环境测试通过

-   android os: 7.1.2 32bit (64位可能要改OpenMemory的签名)
-   legu: libshella-2.8.so
-   360: libjiagu.so

## 0x5 参考链接

-   [frida](https://www.frida.re/)

## 0x06 python脚本支持

`python frida_unpack.py 应用包名`

## 0x07 相关技巧

-   利用 `c++filt` 命令还原C++ name managling之后的函数名
    
    ```ruby
    c++filt _ZN3art7DexFile10OpenMemoryEPKhjRKNSt3__112basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEjPNS_6MemMapEPKNS_10OatDexFileEPS9_
    
    输出：
    art::DexFile::OpenMemory(unsigned char const*, unsigned int, std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&, unsigned int, art::MemMap*, art::OatDexFile const*, std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> >*)
    ```
    

[![⚠️ 图片托管失败 · Powered by DartNode](https://camo.githubusercontent.com/bbd01b9eab7d2f9f50e242a40886bbf1bf7f571610a36ba23d160cd420abb674/68747470733a2f2f646172746e6f64652e636f6d2f6272616e64696e672f444e2d4f70656e2d536f757263652d736d2e706e67)](https://dartnode.com/ "Powered by DartNode - Free VPS for Open Source")
