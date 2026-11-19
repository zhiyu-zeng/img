---
title: 安卓免ROOT修改APK尝试
source: https://fjqisba.github.io/2025/12/15/%E5%AE%89%E5%8D%93%E9%80%86%E5%90%91/%E5%AE%89%E5%8D%93%E5%85%8DROOT%E4%BF%AE%E6%94%B9APK%E5%B0%9D%E8%AF%95/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:53:34+08:00
trace_id: 468db1cf-6500-4f17-a9c9-f32a370b7482
content_hash: b86928babe02393366ce387e353d5c2447e683ef71503a8983cd3481add11530
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8106-9f13-cd01b1ec8a5e
ioc: null
---

## 安卓免ROOT修改APK尝试

有的时候就是想要对某个APK进行修改，并且运行在没有ROOT权限的真机上面，那么这个时候就会去研究这个东东。目前的方案似乎不多

## LSPatch

项目地址： [https://github.com/LSPosed/LSPatch/releases](https://github.com/LSPosed/LSPatch/releases)

简单原理：LSPosed通过将dex等插入目标APK来集成Xposed API，使重打包后的Apk能加载安装在系统里的任意Xposed插件或将Xposed插件嵌入进APP中，从而实现免Root Hook任意App

已经停更，但是还有一个维护版本 [https://github.com/JingMatrix/LSPatch，但是需要自行编译](https://github.com/JingMatrix/LSPatch%EF%BC%8C%E4%BD%86%E6%98%AF%E9%9C%80%E8%A6%81%E8%87%AA%E8%A1%8C%E7%BC%96%E8%AF%91)

这玩意似乎对安卓系统版本是存在一些限制的，高版本不一定能成功

## XPatch

项目地址： [https://github.com/WindySha/Xpatch](https://github.com/WindySha/Xpatch)

XPatch用来重新签名打包Apk文件，使重打包后的Apk能加载安装在系统里的Xposed插件，从而实现免Root Hook任意App。

## NPatch

项目地址： [https://github.com/vaginessa/NPatch](https://github.com/vaginessa/NPatch)

看起来还不错

## TweakMe

项目地址： [https://github.com/liaoguobao/TweakMe](https://github.com/liaoguobao/TweakMe)

没试过

## 参考资料

[https://github.com/hzw1199/xml2axml](https://github.com/hzw1199/xml2axml)

[https://github.com/WindySha/ManifestEditor](https://github.com/WindySha/ManifestEditor)
