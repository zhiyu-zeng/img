---
title: 【看雪】bs/rt data 上报协议古法逆向
source: https://bbs.kanxue.com/thread-293515.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-17T08:54:42+08:00
trace_id: a9b74cd3-709f-4870-86a7-dda7a16e51aa
content_hash: b838c0bc501e31574a1460aea4d4ca2410fdab10cacbb4487df8c1e55027461b
status: synced
tags:
  - 看雪
  - 协议分析
  - 风控对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: TL;DR：对浏览器 bs/rt data 上报加密字段做逆向，最终还原出“pb 编码 → LZ4 压缩 → base64”的三步生成链。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41b75244-d011-81db-b975-c436fccb1736
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：对浏览器 bs/rt data 上报加密字段做逆向，最终还原出“pb 编码 → LZ4 压缩 → base64”的三步生成链。
> 
> - **目标定位：** 加密值并不来自 webmssdk.js，通过给 xhr 端点下断跟栈可定位到其他文件，且存在多个 index.js，须核对版本号避免找错。
> - **加密强度：** 该文件混淆程度不高，搜索即可定位加密点，最外层是 base64 编码。
> - **数据结构：** data 是上报浏览器信息的大字符串，分里层与外层两层结构；虽然是 jsvmp，但仔细跟栈可发现其执行规律，某些操作会直接把 buf 写入里层 trunks，外层最后调用 finish 得到一个大的 uint8Array。
> - **补代码技巧：** compressFrame 无特殊技巧，纯跟栈即可；很多函数入参特征明显，扣代码时直接补环境。
> - **执行顺序：** pb_encode_sync_duration 对生成的指纹编码 → lz4_sync_duration 对编码后的 uint8Array 压缩 → 对压缩结果做 base64 编码。

aHR0cHM6Ly9hcGktdmVyaWZpY2F0aW9uLnRpa3Rva3Nob3BzLnVzL2FwaS92MS9icy9ydA0K

## 2.找到正确的js目标

下xhr端点后跟栈可以看到，最终值data并非和其他加密一样从webmssdk.js生成，而是在其他文件里生成

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/13e3c8f7593fdc8d.webp)

注意版本号，有多个index.js文件，不要搞错了。

## 3.逆向分析

## 1\. 加密定位

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a621c6d74c05f945.webp)

此文件混淆不高， 搜索易得，最后是个base64加密

## 2\. 原始值定位

data值可知，是个非常大的字符串，一般是来说是上报的浏览器信息。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c534023b4ff011f2.webp)

随便浏览一圈整个文件后，直接找到对应的信息，这个是里层信息，外层还有一个大类。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3743f6489f3f8b32.webp)

此刻要注意跟栈，虽然是个jsvmp，仔细跟栈就会发现他的执行规律，跟栈完成后会发现有一些操作会直接把buf写入到里层的truncks

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f90f6f4f07374db1.webp)

外层是一个新的 buf和trunks，完成之后会调用finsh。实际跟栈也差不多，最后会拿到一个大的uint8Array

然后就是compressFrame，这个没啥技巧，跟栈就行，注意其实很多函数的入参很明显，扣代码时直接补就行 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/874226160200ff88.webp)

最后放一下他的执行顺序吧

-   pb_encode_sync_duration 对生成的指纹编码
    
-   lz4_sync_duration 对编码的uint8array 压缩
    
-   对压缩的 unit8array 进行 base64编码
    

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm)
