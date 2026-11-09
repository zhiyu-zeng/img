---
title: 【微信】SNOWLIGHT恶意软件分析
source: https://mp.weixin.qq.com/s/jcbLZiTxXHFkfw5z00HYYA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:37:53+08:00
trace_id: 3a8f946a-ce8a-44ad-950e-abaac8a9c989
content_hash: 21c40bd0bcc235dba018282e9577d971b8d76678606db3374b9481566363ecf6
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 41375244-d011-8117-bd96-c3f078dbed3e
ioc:
  cves: []
  cwes: []
  hashes:
    - 3664fe8fe742822859c4f866cd1f44b4a265519b197f765cf317e268c0801d1f
    - 63f7057e2f3bcc554f48a3062bdf24ece0966589
    - df3bd55c46adbf13ae68b5a9b1da19a0
  domains: []
  tools: []
  techniques: []
---

**ChaMd5安全团队** *2026年11月9日 08:23*

> 诚招web、re、crypto、pwn、misc、合约方向的师傅,长期招新IOT+Car+工控+样本分析多个组招人有意向的师傅请联系邮箱 admin@chamd5.org(带上简历和想加入的小组)

## 背景

Cybercrime是一家面向中文用户提供私密IM的软件官网上的安装包所替换的恶意安装包，实则为SNOWLIGHT下载器，SNOWLIGHT最早由Mandiant于2024年初披露，归属于UNC5174(离岸爱国者)。2024年底CSDN事件的后续组件中使用了SNOWLIGHT内存加载Vshell。SNOWLIGHT支持linux和windows双平台，协议上支持http、https、websocket、QUIC等协议。

## 样本基本信息

| 属性  | 值   |
| --- | --- |
| 文件名 | 3664fe8fe742822859c4f866cd1f44b4a265519b197f765cf317e268c0801d1f |
| 文件大小 | 248.38MB |
| MD5 | df3bd55c46adbf13ae68b5a9b1da19a0 |
| SHA1 | 63f7057e2f3bcc554f48a3062bdf24ece0966589 |
| SHA256 | 3664fe8fe742822859c4f866cd1f44b4a265519b197f765cf317e268c0801d1f |
| 文件类型 | PE32 executable (GUI) Intel 80386, for MS Windows |

## 行为概述

攻击者通过替换一家面向中文用户提供私密IM的软件官网上的安装包，下载恶意的安装包后运行，除了本来正常的落地文件，另落地了加密数据等其他文件，polymorphism.exe 运行后会读取 config.dat 并在内存中解密执行，是4kb大小的小马文件，之后会以0x99作为密钥解密从恶意C2接收的后续载荷。

## 逆向过程

首先运行样本，发现另外在C:\\ProgramData\\temp落地了几个文件，其中polymorphism.exe是白文件，config.dat是黑文件，并且可观察到polymorphism.exe会读取config.dat文件后产生与恶意C2的通联行为。 静态分析，发现主要的解密流程是由NtReadfile读取config.dat文件后进入循环解密。 动态分析过程中，解密后会调用createfiber、switchtofiber，创建并转换线程，继续运行则跳转。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ab73a74baabb89da.png)

跳转后发现即是第一阶段shellcode，并与18\[.\]179\[.\]119\[.\]184:80产生连接并接收数据，且以0x99为密钥对接收的数据进行异或解密。因样本中硬编码“w64 P18\[.\]179\[.\]119\[.\]1”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/42c11e09303de22b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cb04a6b180bb5a2e.png)

以0x99为密钥

与18\[.\]179\[.\]119\[.\]184产生通联

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/76a604b2b2f04675.png)

解密后的数据是一个.exe的可执行文件，运行后可动态运行可以监控到与18\[.\]179\[.\]119\[.\]184的通联行为，在代码中发现其主要实现的功能是建立一个nps隧道以供后续的内网渗透。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e58ab9f936562397.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/914fee35645f1456.png)

与18\[.\]179\[.\]119\[.\]184:80的通联行为 连接流程： 1.第一阶段与C2建立连接接收并解密后续payload。 2.解密后建立和C2的nps隧道。 修改的注册键：\\HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b94a3d943521e198.png)

计划任务： 计划任务名称：\\MicrosoftEdgeUpdater 计划任务内容：启动C:\\ProgramData\\temp\\polymorphism.exe 计划任务周期：无限期的每隔01:06:00重复一次

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9bc7085ad9e4e331.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7f100005ed651acd.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f0c36e8cd59d544b.png)

捕获的流量特征：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/762982136e13f2fd.png)

关联到的流量特征：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e81bbfe37a938261.png)

## IOCs:

3664fe8fe742822859c4f866cd1f44b4a265519b197f765cf317e268c0801d1f

18\[.\]179\[.\]119\[.\]184

结束

招新小广告

ChaMd5 Venom 招收大佬入圈

新成立组IOT+工控+样本分析 长期招新

欢迎联系admin@chamd5.org

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a0a2b4670aa53113.webp)

病毒分析 · 目录
