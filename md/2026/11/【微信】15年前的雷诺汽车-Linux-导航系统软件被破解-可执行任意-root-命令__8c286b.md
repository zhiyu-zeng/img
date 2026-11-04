---
title: 【微信】15年前的雷诺汽车 Linux 导航系统软件被破解 可执行任意 root 命令
source: https://mp.weixin.qq.com/s/5ijel0qw7AyBvl2pSJERew
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T18:26:56+08:00
trace_id: eedddd87-f832-4798-8003-4bb7a95b162b
content_hash: fe4417d992dee7e2d4ab61e78ec4f999190a96a911a768d61d48d64a2c5c4f50
status: synced
tags:
  - 微信
  - 漏洞分析
  - 汽车安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：安全研究员通过组合SD卡脚本解析缺陷与内核 core_pattern 技巧，在运行15年前 Linux 系统的雷诺车机上以 root 权限执行任意命令。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 40e75244-d011-8115-9a6d-fbf1c8675bf4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：安全研究员通过组合SD卡脚本解析缺陷与内核 core_pattern 技巧，在运行15年前 Linux 系统的雷诺车机上以 root 权限执行任意命令。
> 
> - **目标环境：** 2014款雷诺 Latitude 搭载 TomTom Carminat LIVE 车机，运行基于 Linux 2.6.28.10 的定制系统；多数分区只读或 noexec，SD 卡有 DRM 校验，更新镜像带签名，防护比预期严密。
> - **可利用缺陷：** ttn 程序以 root 身份解析 SD 卡上的 master.script；其中 SHEX 命令可运行程序但只接受单个单词、无法传参，LOG 命令写日志时存在路径遍历漏洞。
> - **提权手法：** 借用内核漏洞利用技巧，用 LOG 向 /proc/sys/kernel/core_pattern 写入管道命令，使内核在程序崩溃时从 SD 卡以 root 运行 /bin/sh；再用 SHEX 启动找不到系统总线就会中止的 /bin/dbus-monitor 触发崩溃，最终脚本仅三行。
> - **验证效果：** 载荷成功重启车机；随后用 dd 备份内部存储，在 /mnt/flash/settings.dat 中将 UTC 偏移从 +3 改为 +2，解决了夏令时后时钟无法调整的问题。
> - **风险边界：** 攻击需物理接触车辆、插入预制 SD 卡且驾驶员确认执行，不构成远程威胁；但租车、共享、维修等场景仍可能被利用，且车机生命周期长达15年却很少收到补丁。

**代码卫士** *2026年11月4日 17:16*

聚焦源代码安全，网罗国内外最新资讯！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/afc2fa5611a63e89.gif)

作者： Tushar Subhra Dutta

编译：代码卫士

**安全研究员Rasmus Moorats发现，他可在2014款雷诺Latitude的导航单元上以root权限执行任意命令。**

该单元是一台TomTom Carminat LIVE车机，运行基于Linux 2.6.28.10构建的定制系统。这一案例说明老旧的车上软件仍可能暗藏严重弱点。

**夏令时结束后，时钟无法调整**

研究员Rasmus Moorats想在爱沙尼亚夏令时结束后调整时钟时，发现“设置时间”选项消失，且在没有正版地图SD卡时，设置菜单无法打开。NNS.ee的分析师指出，问题源于该单元从SD卡读取脚本文件的方式。他们提到可组合利用多个小缺陷获得设备的完全控制权。这类汽车很常见，许多车机中存有多年积累的手机联系人和位置数据，而更新的车型也面临类似风险。例如，PerfektBlue蓝牙漏洞使数百万辆汽车处于风险之中。

**破解15年前的Linux 导航系统软件**

## 车机防护机制

该单元的防护措施比人们对2011年软件的预期更严密。大多数分区为只读、禁止执行（noexec），或两者兼有。系统还会对SD卡进行DRM校验，因此空白卡或复制卡会被拒绝。更新镜像同样带有签名，因此研究员无法直接刷入修改过的系统镜像。

为安全地研究该单元，研究员用QEMU构建了一个模拟器。模拟器显示了单元启动时会从SD卡读取哪些文件。其中一个是master.script，它是用于自动化屏幕操作的小脚本；而名为ttn的程序负责解析该脚本，ttn以root身份运行。

该脚本中有两个命令被证明可利用。SHEX用于从系统运行程序，但它只接受一个单词，因此无法传递参数。LOG命令向文件写入一行纯文本，并存在路径遍历漏洞。在日志文件路径中加入“../”，写入者便可到达预期目录之外。由于ttn以root运行，每次写入也以root权限执行。

## 组合提权技巧

仅凭其中任何一个漏洞无法获取 root 权限，因为root文件系统为只读，SD卡也无法运行程序。研究员随后借用了内核漏洞利用中的一种技巧。他用LOG命令写入决定Linux在程序崩溃时执行何种操作的设置/proc/sys/kernel/core_pattern。他在其中写入一个管道命令，使内核从SD卡启动/bin/sh并执行脚本。内核随后以root权限运行该脚本。为触发崩溃，他用SHEX启动/bin/dbus-monitor；该程序在找不到系统总线时会中止。最终脚本只有三行。

他的第一个验证很简单：载荷重启了该单元。随后，他利用获得的访问权限，用dd备份了内部存储。他在/mnt/flash/settings.dat中找到时间设置，并将偏移量从UTC+3改为UTC+2。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae040977292eb598.gif)

**并非远程威胁，但设计问题仍在**

## 风险评估与设计问题

该案例是在可物理接触汽车的情况下开展的研究项目，因此不构成远程威胁。攻击者需要插入一张预先制作的SD卡，且驾驶员需在“Execute master.script?”提示下选择“是”。虽然这样做这限制了风险，但并未消除风险。共享汽车、租车或进店维修，都可能给他人提供可乘之机。更深层的问题在于设计。该单元信任来自可移动介质的脚本，以root身份运行解析器，且不清理文件路径。而这些是嵌入式设备中的常见错误，只要汽车还在路上行驶，它们就会一直存在。一辆车可以开15年甚至更久，但车机很少获得补丁。

研究人员不断在更新的车辆中发现同样的模式。比如日产Leaf的信息娱乐漏洞表明，薄弱的蓝牙组件可导致车门、后视镜和转向被控制。该单元运行源自2013年的Linux 3.14。车机也是以牟利为目的的犯罪分子的目标。最近一份关于Android车机屏幕恶意软件的报告描述了一个多阶段下载器，它利用内置更新路径，将受感染的屏幕接入广告欺诈和代理僵尸网络。即便在该案例中，报告也未显示攻击者能控制转向或制动。老旧Linux设备在其他方面同样暴露在外。例如，Kairos僵尸网络会接管允许无密码Telnet root登录的Linux设备。

老款汽车的车主可选的应对措施有限。他们应避免让来路不明的SD卡和USB存储设备接触车机，并且只从可信卖家处购买地图卡。此外，还应向经销商询问是否存在安全更新。

代码卫士试用地址：https://sast.qianxin.com/

开源卫士试用地址：https://oss.qianxin.com/

* * *

**推荐阅读**

[在线阅读版：《智能网联汽车云平台漏洞分析报告》全文](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247524907&idx=1&sn=56ac025aa6a6fcc0f1243163f93a12bc&scene=21#wechat_redirect)

[XCharge C6电动汽车充电桩存在多个严重漏洞，可导致任意代码执行](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247526201&idx=2&sn=94f249f0b82ed4528faa20db71165ca7&scene=21#wechat_redirect)

[丰田奔驰雷诺现代等车企的胎压检测系统广播未加密数据，可导致车辆被追踪](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247525298&idx=1&sn=e2d2ed5b9a5b83d6d05abef278903ad9&scene=21#wechat_redirect)

[2026 Pwn2Own 东京汽车大赛落下帷幕，Master of Pwn 诞生](https://mp.weixin.qq.com/s?__biz=MzI2NTg4OTc5Nw==&mid=2247524969&idx=1&sn=fbd3e630ba31d2f0118b90ad0779d309&scene=21#wechat_redirect)

**原文链接  
**

https://cybersecuritynews.com/renault-cars/

题图：Pixabay License

**本文由奇安信编译，不代表奇安信观点。转载请注明“转自奇安信代码卫士 https://codesafe.qianxin.com”。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b33054170f5acbf0.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2c03ce3cc6bb81bc.jpg)

**奇安信代码卫士 (codesafe)**

国内首个专注于软件开发安全的产品线。

觉得不错，就点个 “在看” 或 "赞”
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8a5c84b98d9b52b1.gif)
