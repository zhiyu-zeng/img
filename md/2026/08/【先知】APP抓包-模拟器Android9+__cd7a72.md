---
title: 【先知】APP抓包-模拟器Android9+
source: https://xz.aliyun.com/news/92719
source_host: xz.aliyun.com
clip_date: 2026-08-21T15:30:39+08:00
trace_id: 06c0e178-4928-42ad-9122-18b5c546367f
content_hash: e8e44e026127cbd620c86e7060a1001cf2304986a1337e91592b34b4fe6f48f4
status: synced
tags:
  - 先知
  - Android逆向
  - 协议分析
series: null
feed_source: 先知安全技术社区
ai_summary: 模拟器 Android9+ 环境通过 Magisk Delta、LSPosed、TrustMeAlready、Charles、Postern、Burp 组合，可绕过 SSL Pinning 并抓取应用明文真实流量。
ai_summary_style: key-points
images_status:
  total: 41
  succeeded: 41
  failed_urls: []
notion_page_id: 3c375244-d011-81c2-bddc-c229a171d9a2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 模拟器 Android9+ 环境通过 Magisk Delta、LSPosed、TrustMeAlready、Charles、Postern、Burp 组合，可绕过 SSL Pinning 并抓取应用明文真实流量。
> 
> - **前置条件：** 需先将模拟器 `/system` 分区以可读写方式挂载（adb 执行 `mount -o rw,remount /system`），否则安装 Magisk 会报错。
> - **工具分工：** Magisk Delta 提供 root 并替换系统 su；LSPosed 作为 Xposed 框架加载模块；TrustMeAlready 绕过证书信任校验；Postern 是类似 VPN 的工具用于绕过代理检测并将流量导到 Charles；Burp 最终分析流量。
> - **证书配置：** Charles 证书可直接拖入模拟器安装，需分别作为 CA 证书和 WLAN 证书；Burp 需导入 Charles 导出的证书，并设置与 Burp 代理一致的外部代理。
> - **关键踩坑：** 正式版 Magisk 可能因兼容问题卡死，建议改用 Delta 版本；安装后必须从主页点 X 选择重启，否则镜像会损坏无法启动。
> - **完整流程：** 先装 Magisk 并处理好 su 文件，再装 LSPosed 并启用 TrustMeAlready，然后配置 Charles 的 SSL 代理，最后配置 Postern 代理规则，即可让 Burp 抓到经过证书绕过后的明文数据包。

## 前言：Android7版本较老，对于一些APP因CPU框架等底层导致无法下载安装，导致部分渗透测试工作无法完成；但是Android9+版本又是一次重大更新： SSL Pinning，正常抓包的内容加密，这篇文章就是聊聊如何正确抓取的真实数据包。

**\-------------------------------------------------------------------------**

**工具**： **Magisk Delta + LSPosed + TrustMeAlready + Charles + Postern + Burp** （工具链接在后面）

**\--------------------------------------------------------------------------**

**！！！开始之前的小准备：**

（1）系统分区可写（/system）

命令（找到自己安装的模拟器的目录）：

./adb.exe -s 127.0.0.1:21513 shell "mount -o rw,remount /system"

否则 后面安装这个magisk的时候会报错；可以选择直接给AI说 让他直接操作比较方便。

**直接进入主题：**

## Magisk

Magisk直接把这个工具拖进来

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/df8d9987e3e3c2a0.png)

点击这里的“安装”

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f6bdbe9efa70802d.png)

直接下一步 然后根据我的：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a61a7d8b4937d041.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/46be164f0d2062fb.png)

安装成功后 我们要重启 一定要按照我这个方式 从主页点X 然后选择重启：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e36a37c756fec887.png)

重启后 点击Magisk 会提示这个su文件问题 因为这个Magisk可以主动取代root 这个时候我们要把/system/xbin/su里面的这个su删除或者重命名（su.bak）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8f12dd53cf9d66b3.png)

然后就可以看到Magisk的版本号了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cb78d9450b7a7f70.png)

这个Magisk就到此了

## LSPosed

还是直接拖进去 然后

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/414001fdfda3cf06.png)

然后点击Magisk里面的这个

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1dadce948b1b6373.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e18d6da013f038cf.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b1f8af71afa7c019.png)

然后可以直接拖进去这个

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/99e6aaef84818df0.png)

这个时候就可以看到apk了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/88739d70acdfc7bb.png)

## TrustMeAlready

直接拖进

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4432c6c10cc4b96a.png)

然后进去LSposed 进去可以看到加载的模块了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/11b001da40f6973c.png)

## Charles

这个的话 安装过程就不说了 直接说怎么用：

这个win代理可以关了 因为我们只针对模拟器

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c5083a447620ded1.png)

然后是代理设置 应该是默认的：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1292bd51118560dc.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ac082225a5760bbf.png)

然后是ssl的配置：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/adaa5c71beda2ad0.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/242f8d58397743d9.png)

然后配置ssl代理

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e11ad37aa18d043.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/738f666198135ce0.png)

这个证书不同与burp的证书 这个是可以直接 脱到模拟器里面的 然后下面操作：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/182d39ef0a6b4f33.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/236a0b7c6280cdba.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/700036880b0b8508.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8e961b6c4f077fa3.png)

名字随便起

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/107b6a2439236113.png)

选择确定

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/33450dbdd1b4ee86.png)

建议选图案 自己搞一个

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4f66fd0f1dcd7cbc.png)

然后再来一遍 这次是WLAN

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/58df992217a7bff6.png)

Charles就这 完事

## Postern这个也是直接拖进去即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/176a98e680045c4a.png)

配置规则

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f1c41c9cb28aef40.png)

这个服务器地址 用ipconfig找到带有网关的 这个配置是根据Charles的代理配置（8889是socks5） 然后 直接保存

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/97aad47691e5f4b7.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/70195d8db923ffc4.png)

然后是代理规则：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/357f1ace7e9069f9.png)

当模拟器右上角存在这个钥匙就代表开了Postern

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/267ea7eeb8eddba9.png)

就这 Postern完事

## burp：

先导出Charles的证书 私钥自便

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bf91a0f50b4312e1.png)

然后在burp上 导入 即可：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5daf203ea7078202.png)

然后设置外部代理设置 这个要和burp的代理一样：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fe8c67f71276de48.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bcef8e27a7455b5a.png)

最后效果：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/aa8edd5894c7a0cb.png)

## 总结(通俗版)：

Magisk是用于绕过root检测、Postern是绕过代理的检测Postern是个类似VPN工具、TrustMeAlready是一个绕过证书不信任、Charles是配合Postern过度的、LSPosed是载荷于TrustMeAlready、burp就是我们分析流量的。

## 踩坑Magisk：

Magisk最好用我这个Delta版本的 正式版本的好像因不兼容问题疯狂卡死，可能是我的模拟器问题；安装这个Magisk前一定要先给system可读写的权限，否则就要清理镜像很麻烦；安装好Magisk后一定要按照我的方式重启，否则就是镜像直接嘎掉，不能开启；

## 工具：

Magisk：

[https://www.duokaiya.com/1443.html](https://www.duokaiya.com/1443.html)

其他：

链接： [https://pan.baidu.com/s/1qLP2EhHiV9rTUOJZGsOUGQ?pwd=pdxx](https://pan.baidu.com/s/1qLP2EhHiV9rTUOJZGsOUGQ?pwd=pdxx) 提取码：pdxx

charles：

[https://blog.csdn.net/qq_45484042/article/details/158655868](https://blog.csdn.net/qq_45484042/article/details/158655868)

（文章凌晨创造，可能有不到位的地方，多多包含~）
