---
title: 【微信】Windows画图板曝零点击RCE：8.1分，无需点击即可远程执行代码
source: https://mp.weixin.qq.com/s/YnxwYvXEwYNxL0TviFTpJw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:24:58+08:00
trace_id: c587e91e-7e19-4b6d-b45c-bda1781ec548
content_hash: cbcc0a2adcb18efdf2b9d7ac4b8730d12b75855db3f4a22aca130a37f99dabfd
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41375244-d011-8122-a81e-e54f1d2e0411
ioc:
  cves:
    - CVE-2026-83844
  cwes:
    - CWE-125
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**黑白之道** *2026年11月8日 09:09*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：Windows自带的画图板，也能成为远程代码执行的入口。微软10月补丁日披露CVE-2026-83844，一个零点击RCE漏洞；修复补丁只走Microsoft Store，很多机器至今没收到。

* * *

## 一、画图板成了入口

2026年10月13日，微软在月度补丁日里夹进一条不起眼的安全公告：Windows Paint存在远程代码执行漏洞。编号CVE-2026-83844，根因是越界读（CWE-125），CVSS 3.1评分8.1，属"重要"级别，向量 `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H` 。

说到画图板，很多人想到的还是Windows 95/XP时代那个老工具。它当年还有个著名彩蛋：画完"不礼貌"的图再打印，系统会弹一句"你的画是坨屎，现在终止会话"。就是这么个连玩笑都开的应用，今天成了零点击RCE的入口。

![Windows经典Paint彩蛋](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d6fde4d60d9c5fcb.png "Windows经典Paint彩蛋")

（图源：X推文@RachelTobac引用的演示视频，Windows经典Paint彩蛋）

拆开看，信息量很大：攻击走网络（AV:N）、无需权限（PR:N）、 **无需用户交互（UI:N）**，保密性、完整性、可用性三个维度全是"高"。翻译成人话——攻击者可能在你毫无操作的情况下，借画图板在机器上跑代码。

不过微软留了个"但是"：攻击复杂度是"高"（AC:H）。官方FAQ解释得直白，成功利用需要攻击者深刻理解目标系统，能否奏效还看环境、配置和额外防护，并不保证成功。而且微软始终没公布是哪个文件格式、哪条解析路径出了毛病，只给了句通用措辞"向受影响服务发送特制数据包"。

安全研究者@0x_exit的演示动画，意思大致如此：

![画图板零点击RCE演示画面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/07f9aea30113e690.png "画图板零点击RCE演示画面")

（图源：X推文@0x_exit附带的演示视频画面，示意，非真实利用录屏）

## 二、一个漏洞，三个版本号口径

真正让这事从"又一个CVE"变成话题的，是版本号对不上的乱象。关于"修到哪个版本才算安全"，市面上有三个打架的口径：

| 来源  | 给出的修复版本 |
| --- | --- |
| CVE 记录 / NVD | 11.2605.91.0 起视为已修复 |
| 微软 Security Update Guide | 11.2609.401.0 |
| 用户/管理员实测 | 系统里往往还是 11.2603.251.0 或 11.2605.81.0 |

麻烦在于，扫描器通常照着CVE记录判定。按它的口径，11.2605.91.0以上都算"已修复"，于是11.2605.91.0到11.2609.401.0之间整段版本的机器，在扫描器眼里"假性安全"，实际还带洞。有网友在微软问答论坛指出，上周公告给的修复版还是11.2605.91.0——这数字被悄悄改过，修订历史里却仍只有10月13日那一条，没有改动说明。

## 三、补丁不走 Windows Update

比版本号更头疼的是发货渠道。画图板早已从系统组件变成Microsoft Store应用，更新独立于Windows累积更新——你装了10月系统补丁，不等于画图板也补上了。它只通过Store的自动更新下发。

设备管理软件厂商RFF的Brian Vitko这周抽查六国Store上架版本，最新版仍是11.2605.81.0，一个没修复的版本。他的测试虚拟机后来自己默默更新到了修复版，但那说明不了什么，别的机器多久能收到，没人知道。Windows Latest也在自家系统查到画图板停在11.2603.251.0，同样没补。

更隐蔽的是，Store应用按用户账户分别安装，Windows还会留一份provisioned副本给新账户。一台机器可能躺着好几个不同版本的画图板，只查当前登录账户，根本发现不了另外几份老版本。部分杀软已据此把画图板标为"未打补丁"，但到底是分发问题还是画图板自身问题，微软至今没给说法。

## 四、现在该做的三件事

官方公告没给任何临时缓解措施，能做的就剩"确认版本、管好资产、能删就删"。

第一步，确认每一个用户副本的版本。管理员PowerShell跑这两条命令，分别列出所有用户副本和provisioned副本：

```powershell
Get-AppxPackage -AllUsers -Name Microsoft.Paint | Select-Object Version, @{ n = 'Users'; e = { $_.PackageUserInformation.UserSecurityId.Username -join ', ' } }
Get-AppxProvisionedPackage -Online | Where-Object DisplayName -eq 'Microsoft.Paint' | Select-Object Version
```

把版本号跟11.2609.401.0比对，低于它就走Store手动更新；普通用户也可在"设置→应用→画图板→高级选项"里看版本。

第二步，把画图板纳入资产清单。别再问"有没有打补丁"，改问"每个用户副本的版本是多少"——这次最值得记的一课，就是这种藏在Store管道里的应用，很容易从安全团队的资产清单里整体消失。

第三步，用不到就卸掉。画图板在Windows 11 24H2起已可卸载，不需要的机器直接移除，或用AppLocker、WDAC、Store策略禁掉。

这条消息最早由PCWorld报道出来，标题很直白——"你的电脑可能错过了这个补丁"：

![PCWorld 报道截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6e81011e59d6f738.png "PCWorld 报道截图")

（图源：PCWorld）

## 五、紫队视角：胜负手不在漏洞，在分发

这事儿得从两边儿看。

红队为什么盯上画图板这种"人畜无害"的老应用？因为它几乎每台Windows机器都有，却在安全团队眼皮子底下隐形——EDR和SIEM很少给画图工具设告警规则。而且这洞不需要钓鱼、不需要诱导点击，攻击面就成了"只要机器装了画图板、又能处理到不可信内容"。AC:H的高门槛说明，真正的难度不在写利用，而在选对目标、搭对触发链路。

蓝队这边，检测反而不是最难的——真出事，画图板异常起子进程、读写不该碰的内存，总能被看到。真正卡住的是分发：补丁走了Store这条和Windows Update完全并行的管道，很多企业根本不知道要单独管；再叠上per-user多副本和CVE记录的版本口径漂移，最后就是"公告说修了、扫描器说安全了，机器其实还带洞"。

这就是红蓝协作最该记的一笔：一条漏洞的生命周期，从"公告"到"资产清单"再到"分发"最后到"验证"，这次恰恰断在第三环。修复从来不等于缓解，CVE记录说"已修复"，也从来不等于你的机器真的修好了。

**版权声明**：本文由华盟网原创发布，保留所有权利。封面配图由华盟网生成并授权使用，其余配图图源见各图下方标注。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

漏洞专题 · 目录
