---
title: 【微信】「SEID实战共享」借壳、致盲、挖矿：针对多层C2架构的银狐黑产剖析
source: https://mp.weixin.qq.com/s/OWOCPn9Sq94Oj7P4F82Y1A
source_host: mp.weixin.qq.com
clip_date: 2026-09-18T17:28:14+08:00
trace_id: 865dfcc3-2a4b-4aad-99df-5ef334a8035f
content_hash: 257f9637fadcdb9040877d9599ef720249ec33e5c326f3b6db41d2bbf6c89e3f
status: synced
tags:
  - 微信
  - 恶意样本
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 银狐黑产自今年二季度起批量仿冒软件安装包，借BYOVD致盲EDR、伪造WDAC策略、阿里云OSS投递与三层C2，驻留Gh0stRAT并植入XMRig挖矿，清除难度极高。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 17
  failed_urls:
    - https://mmbiz.qpic.cn/sz_mmbiz_png/1WldmtZwk06G09hnIUyHIzTHWkfd31LGZW50iclKLyB43rnabpdwuJUqKXHict6XCftLNcUxviarDM8ic9zFvo2mOUiceE7hw05S9lFAKLc24cCU/640?wx_fmt=png&from=appmsg#imgIndex=2
    - https://mmbiz.qpic.cn/sz_mmbiz_png/1WldmtZwk06bWKyHiaETL5oiamdNbPkTaiciazAlbKk3Zdj2IfzgdibJwvPXLD4WAlYxNTXLXN1QARIicDZpBoFoZNcHSrIsFcdkLibmO2VPiaibey3I/640?wx_fmt=png&from=appmsg#imgIndex=5
notion_page_id: 3df75244-d011-813d-b564-fe659e341fd9
ioc:
  cves: []
  cwes: []
  hashes:
    - 2e90e3aaa76f9bd0a5b9bfc83f92bdb51a1c42b9121d3f204fbcbf2b724a0f88
    - 418102029f37211691325f75980476277c2ca3d66363f6ad4bc022e660ffd72f
    - 7b7ee0af580497220c90a5db42c5202a70c0c16007515bb7fde9d3ad6e341f7b
    - a72083135eaae2b4af0b30db51b46a03d44869d60a41f55cb2cf5f33fa992503
    - b655766fc801ed8a07db3447bf6a8ab1ae12507eab3ebd560e662b2a804e2989
    - f22ca2ecd01573012ff6a187b484f68b13bef285a590ae3c5f93a2c6a83a2f3c
    - fafefa1bf9ffa5342341b92ee398499149958000bb3508a14e3458841b3e8f5c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 银狐黑产自今年二季度起批量仿冒软件安装包，借BYOVD致盲EDR、伪造WDAC策略、阿里云OSS投递与三层C2，驻留Gh0stRAT并植入XMRig挖矿，清除难度极高。
> 
> - **三阶段攻击链：** 初始感染解包并从远端拉取恶意文件及EDR致盲组件 → 禁用防护、解密Gh0stRAT并内存无文件驻留 → 启动挖矿程序。
> - **投递与落地：** 仿冒NumLockLock、松下PpcNotif.Provider.RequiredApp及豆包等程序，将UAC Bypass"白+黑"样本、伪装成ranchserv.jpg的TrueSight V2.0.2驱动和SiPolicy.p7b释放至`C:\Users\Public\{random char}`与`C:\Windows\Temp`。
> - **致盲与持久化：** 漏洞驱动提供内核级进程终止、文件读写、注册表清除和APC注入；用cmd.exe禁用Defender/Windows Update、删除卷影副本、改hosts，并靠注册表、计划任务及阿里云OSS取件维持驻留。
> - **挖矿模块：** 变形UPX壳的XMRig变种，RandomX多币种，由命令行参数1776触发；矿池通信采用"512字节硬编码表密钥流XOR → Base64 → TLS"三层封装。
> - **IOC：** 公布6个C2域名（gqsqoq.net、jnkous.net、lisyrf.net等）与7个样本SHA256哈希。

**中资网安** *2026年9月18日 17:06*

*「本次分析的全部素材均来自 SEID 社区成员的主动提交与共享，感谢中煤集团、中国中化、哈电集团等企业提供的信息」*

近期，国资国企网络威胁信息共建共享平台（SEID） 陆续收到多家央企成员单位上报的同类可疑样本。经关联分析与逆向研判，确认这是一起自今年第二季度起持续活跃的大规模银狐远控+挖矿组合攻击。攻击者批量仿冒常见软件安装包（MSI/EXE），捆绑传播 Gh0stRAT 变种及基于 XMRig 的挖矿程序，技术层面融合了 BYOVD 致盲、WDAC 策略伪造、阿里云 OSS 投递、三层 C2 架构、无文件内存注入等高级攻防手法，驻留持久化设计极为缜密，清除难度极高。

现将本次攻击的完整剖析向公众披露，以供更广泛的国资国企安全团队参考布防。

**1**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/259d797467d612bb.png)

***样本整体流程***

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/98d072f43daa02d7.png)

样本整体执行流程可按功能划分为三个阶段：第一阶段（蓝色）为初始感染阶段，主要完成样本解包，并从远端服务器拉取后续阶段所需的恶意文件及EDR致盲组件；第二阶段（粉色）为致盲与驻留阶段，利用获取的致盲组件禁用EDR防护，随后解密Gh0stRAT Payload并以无文件落地的方式实现内存驻留；第三阶段（黄色）为挖矿执行阶段，启动挖矿程序开始恶意挖矿操作。详细流程见图1：

![⚠️ 图片托管失败 · 图片](https://mmbiz.qpic.cn/sz_mmbiz_png/1WldmtZwk06G09hnIUyHIzTHWkfd31LGZW50iclKLyB43rnabpdwuJUqKXHict6XCftLNcUxviarDM8ic9zFvo2mOUiceE7hw05S9lFAKLc24cCU/640?wx_fmt=png&from=appmsg#imgIndex=2)

**2**

***细节分析及特征披露***

(一) 初始阶段

## 初始感染：仿冒安装包

在初始感染阶段，攻击者通过仿造MSI或EXE格式的日语环境常见应用程序，如：NumLockLock、PpcNotif.Provider.RequiredApp（松下相关应用）及少部分国产大模型相关程序，如：豆包等，诱使相关应用程序使用者安装伪造的应用程序，进而实现传播Gh0stRAT及挖矿程序的目的。

(二) 感染阶段（投递&提权）

运行初始样本后，其将后续核心恶意组件释放至 C:\\Users\\Public\\{random char} 及 C:\\Windows\\Temp 目录下，主要包括：具备 UAC Bypass 能力的第二阶段"白+黑"组合样本、伪装为.jpg 图片的 TrueSight V2.0.2 内核驱动（ranchserv.jpg）以及 WDAC 策略文件（SiPolicy.p7b），为后续禁用安全工具、BYOVD 致盲及多层持久化部署做好充分准备。

![⚠️ 图片托管失败 · 图片](https://mmbiz.qpic.cn/sz_mmbiz_png/1WldmtZwk06bWKyHiaETL5oiamdNbPkTaiciazAlbKk3Zdj2IfzgdibJwvPXLD4WAlYxNTXLXN1QARIicDZpBoFoZNcHSrIsFcdkLibmO2VPiaibey3I/640?wx_fmt=png&from=appmsg#imgIndex=5)

C:\\Users\\Public\\{random char}下 “白+黑”文件启动后会进行UAC Bypass提权以获得高权限，其主要功能是写入WDAC策略，以服务的形式加载漏洞驱动，并从阿里云OSS拉取下一阶段恶意文件，写入 C:\\Program Files (x86) 下。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bb6025995b68c3a.png)

其中ranchserv.jpg是非常经典的TrueSight V2.0.2 内核驱动，成功加载后可向攻击者提供内核层面的进程终止、文件读写、注册表清除及APC注入等能力，进而实现杀软及EDR等安全工具的致盲。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fcba35ae568faf33.png)

## 内存注入与致盲持久化

从OSS下载的文件（IgGQrZ.exe）依旧采用“白+黑”的手法，其主要功能是解密payload（Gh0stRAT）并注入内存回连攻击者C2，同时从阿里云 OSS 下载下一阶段恶意程序，写入 C:\\ProgramData\\{random char}，并通过注册表建立持久化。在致盲层面其通cmd.exe 执行系统致盲命令（禁用 Defender/Windows Update、删除卷影副本、修改host文件）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fc810b40cd2d948.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1eccb58c47244eaa.png)

wrf0fpGa.exe是一个基于TrueUpdate的挖矿安装程序，其会伪装成xshell安装程序，实际向远端OSS请求名为“page-404.png”的文件并将其落地于C:\\ProgramData\\{random char}，此外攻击者还会通过计划任务实现新落地文件的持久化。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1556558acacc787c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fc99913b1c00783.png)

(三) 挖矿阶段

## 挖矿模块与流量混淆

落地挖矿木马以变形 UPX 壳保护，脱壳重建后确认是基于 XMRig 框架的 RandomX 多币种挖矿程序，由命令行参数 1776 触发激活；其通信采用“固定密钥流 XOR 混淆（512 字节硬编码表循环）→ Base64 → TLS”三层封装连接矿池，以规避流量监测。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7463464a12ec9e92.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0befaa7b347fde57.png)

**3**

***部分样本 IOC和 HASH***

## C2基础设施清单

(一) C2基础设施：

1\. gqsqoq.net

2\. jnkous.net

3\. lisyrf.net

4\. wfmwsj.net

5\. vqxvll.net

6\. ufozdv.net

(二) 样本HASH：

1.2e90e3aaa76f9bd0a5b9bfc83f92bdb51a1c42b9121d3f204fbcbf2b724a0f88

2.418102029f37211691325f75980476277c2ca3d66363f6ad4bc022e660ffd72f

3.f22ca2ecd01573012ff6a187b484f68b13bef285a590ae3c5f93a2c6a83a2f3c

4.b655766fc801ed8a07db3447bf6a8ab1ae12507eab3ebd560e662b2a804e2989

5.7b7ee0af580497220c90a5db42c5202a70c0c16007515bb7fde9d3ad6e341f7b

6.a72083135eaae2b4af0b30db51b46a03d44869d60a41f55cb2cf5f33fa992503

7.fafefa1bf9ffa5342341b92ee398499149958000bb3508a14e3458841b3e8f5c

**4**

***加入SEID社区***

(一) 简介

SEID是国资国企专属的国家级威胁情报共享实战平台，由国资国企在线监管安全运营中心倾力打造，集情报研判、样本分析、漏洞排查三大核心体系于一体，实时共享国资国企专属网络威胁信息，为国资国企网络安全运营工作保驾护航！

(二) 优势

SEID平台通过SD-WAN实现安全数据交互，集成沙箱设备为国资央企提供可疑样本上传和分析服务、为国资国企威胁情报共享和联防联控提供统一平台。集于国资国企在线监管安全运营中心5年积累的海量安全大数据、安全运营垂域大模型，它拥有：

最权威的国资央企威胁情报数据库：全面收集、高效整合国资央企情报资源和能力，实时汇聚来源于国资央企一线的实战威胁情报，通过国资国企网络信息安全在线监管平台验证，确保威胁情报的高鲜活性和高准确性。

高可信运营平台：通过国资国企白名单准入机制构建高可信生态，严格限定参与主体为国资国企成员，并实施文件隔离保护策略，确保共享环境安全可控。

(三) 使用注册

1.申请账号。发送邮件至service@cacts.cn，注明企业、人员、联系方式，将由专人对接跟进

2.登录平台。使用专属账号，登录SEID

3.提交信息。按照平台规范，提交网络威胁信息

4.核验计分。内容审核完成后，自动核算积分
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19133f8282fe0878.jpg)
