---
title: 【微信】SystemHelper 拜拜~
source: https://mp.weixin.qq.com/s/4tcG70SKtEzFNuDDmLqXVw
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T13:13:33+08:00
trace_id: c4904db3-57a2-4c0e-a271-a8d3c1a8828e
content_hash: 28e231e760f630a6c4bc7fde91d870311a2cf0069688e49b79eb5ee5f8f36135
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 41175244-d011-81ce-bb68-c4671583b831
ioc: null
---

**kali笔记** *2026年11月6日 20:20*

> 最近关于 SystemHelper 这个“安卓”程序有点扯。但究竟如何，我们也不敢说，也不敢问，我们选择卸载。在非ROOT清空下，如何卸载呢？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac82d596692e448f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/044725ceaa180ecf.png)

## 实验准备

无 Root、 无解锁 Bootloader、 手机自带的 USB 调试即可搞定。（本文基于小米 15 Pro / HyperOS 3 实测）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/678e4a20365867dd.png)

手机开启「开发者选项」中的 **USB 调试** （小米机型：设置 → 我的设备 → 全部参数，连点「MIUI/HyperOS 版本」7 次即可解锁开发者选项）。  
电脑安装好 **ADB 工具**，并用数据线连接手机，允许 USB 调试授权。

## 卸载

接下来，我们来看看如何轻松卸载。  
**01 确认设备连接**

```
adb devices
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/515e603065858d67.png)

**02 查找应用包名**

```
#win环境adb.exe shell pm list packages | findstr /i systemhelper#linux环境adb shell pm list packages | grep -i systemhelper
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/46d62037f0ba422b.png)

`com.mobiletools.systemhelper` 查到包名。

⚠️ **注意**：列表里可能还会出现 `com.qualcomm.qti.services.systemhelper` ，那是高通系统底层服务， **千万不要删**！

**03 对当前用户卸载（核心命令）**

```
adb shell pm uninstall --user 0 com.mobiletools.systemhelper
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/787e350679168cb3.png)

看到 `Success` 就说明成功了！应用会立刻从桌面消失、停止运行。这个命令的关键在于 `--user 0` 参数：它表示「仅对当前用户卸载」，从而绕开系统特权分区的限制，全程无需 Root。

**04 重启手机会不会又出现？**

正常重启不会恢复，应用会一直保持卸载状态。但如果以后系统做 OTA 大版本升级或恢复出厂设置，预置应用有可能被重新拉回，届时再执行一次第 3 步即可。

当然，如果你不会用命令，可以开启USB试调后。直接让智能体完成。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/134ae4e1eb13aafa.png)

![卸载效果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2c1317d1666a2d0.png)

卸载效果

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b8e40c9cda7cc9f9.png)

更多精彩文章 欢迎关注我们

玩转硬件 · 目录

作者提示: 个人观点，仅供参考
