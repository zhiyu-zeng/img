---
title: 【微信】Cursor恶意扩展事件（Claude Code）样本分析报告
source: https://mp.weixin.qq.com/s/tpbzH0tpFwMWsgl_pycbnA
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T22:04:19+08:00
trace_id: 96b89bbc-40f3-4e60-8ee5-d31f3923af79
content_hash: 55da487b39b5c487d835a93dea9ed9e1a3f2769143a2e921f16701e81d722149
status: synced
tags:
  - 微信
  - 恶意样本
  - 供应链投毒
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: VS Code扩展市场Anthropic.claude-code扩展2.1.312/2.1.313版本被植入SSH后门，通过反向隧道与跨平台持久化实现攻击者对内网开发机的远程控制。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 40b75244-d011-81a6-9713-ef762b3619db
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> VS Code扩展市场Anthropic.claude-code扩展2.1.312/2.1.313版本被植入SSH后门，通过反向隧道与跨平台持久化实现攻击者对内网开发机的远程控制。
> 
> - **注入方式：** 恶意代码以IIFE形式前置到extension.js头部前7,384字节，其后约368万字节正常bundle用于掩盖注入，降低人工审查发现概率；样本SHA-256与Cursor官方公告完全一致。
> - **SSH公钥后门：** 向~/.ssh/authorized_keys追加注释为svc-telemetry的攻击者ed25519公钥，攻击者可凭配对私钥直接登录，绕过口令与多因素认证。
> - **反向隧道：** 载荷内嵌攻击者私钥，向C2主机134.209.82.225建立ssh/autossh反向隧道，由C2动态分配端口映射本机22端口，可穿透NAT与防火墙使内网开发机对攻击者可达。
> - **凭证窃取：** 除主机/用户基础信息外，重点抓取匹配KEY、TOKEN、SECRET、PASS、AWS、GCP等关键字的环境变量名（最多40个）及git config邮箱，延迟1.5秒后以HTTP POST上报/beacon端点。
> - **跨平台持久化：** Linux写入~/.config/.smt并以crontab @reboot加载；macOS伪装LaunchAgent com.apple.sysmond.plist；Windows创建SYSTEM权限计划任务SysMon运行smt.cmd，失败则回退到启动项sysmon.cmd，重启后自动重建隧道。

**安天垂直响应平台** *2026年11月1日 21:40*

结合 安天（ Antiy ） 与澜砥 N2.7威胁检测分析大模型辅助生成。

## 1.概述

## 2026年10月底，安天CERT监测到Cursor官方发布的安全公告，指出VS Code扩展市场中的Anthropic.claude-code扩展2.1.312与2.1.313两个版本被植入恶意代码。攻击者在正规扩展入口文件extension.js的头部注入了一段立即执行函数（IIFE），使得开发者在安装、更新或信任该扩展的同时，其主机被悄然植入SSH登录凭证后门，并建立起指向攻击者的反向隧道。安天CERT获取事件相关样本并完成分析，本报告分析extension.js恶意载荷与smt.cmd持久化脚本的行为特征、攻击链条，为使用Cursor及VS Code的开发者和企业安全运营人员提供参考。该恶意载荷面向Windows、macOS、Linux三个平台编写，具备信息收集、SSH公钥植入、反向隧道建立、本地SSH服务开启与多机制持久化等能力，其目的在于将受影响主机纳入攻击者可随时远程控制的节点，一旦后门通路生效，攻击者可在受害主机上执行任意操作。2.样本分析2.1 样本标签本次分析的样本包括恶意扩展载荷extension.js及其在Windows主机上的持久化脚本smt.cmd。其中extension.js的SHA-256与Cursor官方公告公布的有效载荷值逐字一致，可确认属于本次事件的同一恶意代码。表 2-1 脚本文件：extension.js病毒名称Trojan/JS.ClaudeCode\[Backdoor\]原始文件名extension.jsMD5F49BCD657EF1E626E85CE858958C1769文件大小3,692,922 字节（约 3.52 MB）解释语言JavaScript（Node.js）VT首次上传时间2026-10-30 14:33（UTC+8）VT检测结果27/62（VirusTotal 判定恶意）表 2-2 脚本文件：smt.cmd病毒名称Trojan/BAT.ClaudeCode\[Backdoor\]原始文件名smt.cmdMD51995D5C1B9E0C466B0E0201222F560BD文件大小330 字节解释语言Windows 批处理（Batch）VT首次上传时间2026-10-30 14:38（UTC+8）VT检测结果12/62（VirusTotal 判定恶意）2.2 载荷注入方式与代码结构extension.js文件总长3,692,922字节。经安天工程师分析确认，恶意代码集中于文件头偏移0至7,384字节，表现为一个立即执行函数（IIFE，Immediately Invoked Function Expression，立即执行函数），其后3,685,538字节为被劫持扩展经打包工具生成的原始bundle。攻击者将恶意IIFE前置到正常入口文件头部，使扩展一经加载便触发恶意逻辑，而后续大量正常代码则用于掩盖注入行为，降低被人工审查发现的概率。该IIFE在开头引入child_process、fs、os、path、http、crypto六个Node.js内置模块，为后续的命令执行、文件落盘与网络通信提供能力：代码 2-1 恶意 IIFE 开头引入的 Node.js 内置模块恶意IIFE整体由常量区、信息收集、工具函数、主流程与延迟信标五部分构成，各部分职责如下：表2-3 恶意 IIFE 代码模块与功能梳理模块分区功能说明常量区内嵌攻击者SSH公钥PUB、反向隧道私钥TUNKEY(base64)、C2主机TUNHOST信息收集构建对象d汇总主机/用户/环境信息工具函数ex(同步执行命令)、det(后台分离执行)、post(HTTP上报beacon)主流程SSH公钥植入 -> 开启SSH服务 -> 建立反向隧道 -> 跨平台持久化延迟信标setTimeout 1.5秒后向127.0.0.1:8099与C2:8099上报2.3 主要行为流程恶意载荷自extension.js头部IIFE启动后，按“信息收集—公钥植入—开启SSH服务—建立反向隧道—跨平台持久化—信标回传”的顺序展开，并通过反向隧道与SSH公钥为攻击者提供远程控制通道。图2-1概括了其主要行为流程与数据流向。图2-1 extension.js 恶意行为流程2.4 信息收集与信标回传载荷构造信息对象d，收集主机名、用户名、操作系统、CPU架构、主目录与当前工作目录等基础信息，并重点抓取两类敏感数据：其一是名称匹配KEY、TOKEN、SECRET、PASS、AWS、GCP等关键字的环境变量名（最多40个），用于定位开发凭证与云访问密钥；其二是通过git config读取的Git邮箱，用于关联受害者身份。代码 2-2 信息收集对象 d 的构造（敏感环境变量名与 Git 邮箱）信息收集完成后，载荷通过post()函数以HTTP POST方式将d序列化为JSON，向/beacon端点上报，上报目标同时包含本机127.0.0.1:8099与C2主机134.209.82.225:8099。该动作由setTimeout延迟1.5秒触发，以避开扩展刚加载时的高峰监控；上报前还会经curl查询公网IP（ifconfig.me或api.ipify.org）并填入pubip字段。代码 2-3 post() 上报函数与延迟信标触发逻辑2.5 SSH公钥植入与远程登录后门载荷向~/.ssh/authorized_keys追加一把攻击者控制的ed25519公钥，注释为svc-telemetry，该公钥与Cursor官方公告公布的IOC完全一致：代码 2-4 内嵌的攻击者 SSH 公钥（注释 svc-telemetry）植入前先创建~/.ssh目录并设置700权限，读取现有authorized_keys，仅在未发现svc-telemetry时追加以避免重复写入，写入后再将文件权限收紧为600：代码 2-5 向 ~/.ssh/authorized_keys 植入公钥的逻辑攻击者持有与该公钥配对的私钥，可在任意时刻以密钥方式登录受影响主机的SSH服务，从而绕过口令与多因素认证，形成持久的远程登录后门。2.6 反向SSH隧道载荷内置攻击者ed25519私钥（TUNKEY，base64编码，解码后注释为svc-telemetry-tun），向C2主机134.209.82.225建立反向SSH隧道，将远端动态分配的端口映射回本机22端口。建立隧道前先用pgrep检测隧道进程是否已在运行，未运行则把私钥写入临时文件.stk\_<主机名与HOME的MD5前10位>并设置600权限，再以后台分离方式拉起ssh或autossh：代码 2-6 反向 SSH 隧道的进程检测与私钥落盘其中-R "\*:0:localhost:22"表示由C2侧动态分配端口并转发到本机22端口；配合ServerAliveInterval=30、ExitOnForwardFailure=yes与60秒循环重试，保证隧道在断线后自动重建。由于隧道由内网主机主动向外发起，可穿透NAT与防火墙限制，使位于内网的开发机对攻击者可见且可达。2.7 启用本地SSH服务为实现反向隧道在本机的落点，载荷按平台开启SSH服务：Linux下执行systemctl enable --now sshd（或service ssh start、/etc/init.d/ssh start）；macOS下尝试sudo -n systemsetup -setremotelogin on，免密sudo失败即跳过；Windows下通过Add-WindowsCapability安装OpenSSH.Server，并将sshd服务设置为自动启动：代码 2-7 按平台开启本地 SSH 服务的逻辑2.8 跨平台持久化载荷针对三个平台分别落地持久化脚本与加载机制，确保主机重启后仍能重建反向隧道。Linux与macOS下，载荷在~/.config目录写入.smt脚本与.smtk私钥，.smt脚本先将base64私钥解码为.smtk，再以autossh或ssh循环维持隧道；Linux通过crontab追加@reboot项加载.smt，macOS则伪装成系统组件，写入LaunchAgent com.apple.sysmond.plist并以launchctl load -w加载。.smt脚本主体如下：代码 2-8 Linux/macOS 持久化脚本.smt 的生成主体Windows下，载荷在%USERPROFILE%\\.config目录写入smt.cmd与smtk，并创建名为SysMon的计划任务，以SYSTEM权限在开机时运行smt.cmd；若计划任务创建失败，则回退为复制到启动目录并命名为sysmon.cmd。计划任务名SysMon与启动项文件名sysmon.cmd均借用系统监控组件名称，属于典型的伪装命名：代码 2-9 Windows 持久化：写入 smt.cmd 并创建计划任务 SysMon2.9 衍生样本smt.cmd分析样本目录中的smt.cmd长330字节，是上述Windows持久化逻辑落盘后的独立产物，其私钥路径C:\\Users\\Bruno\\.config\\smtk表明该脚本取自一台真实受影响主机。该脚本为一个开机循环执行ssh反向隧道的批处理，连接目标为tunnel@134.209.82.225，参数与载荷内嵌命令一致；循环体以timeout等待60秒后goto重连，实现隧道断线自愈。其完整内容如下：代码 2-10 衍生样本 smt.cmd 的完整内容smt.cmd与extension.js共享同一C2主机、同一私钥与同一隧道参数，二者互为印证：前者是恶意扩展在Windows主机上的落地形态，可作为排查受影响主机的重要 IOC。3.小结extension.js是Cursor官方公告点名的恶意载荷，其SHA-256与官方公布值逐字一致，行为特征与公告披露的IOC完全吻合，确认恶意。该载荷以正规扩展入口文件为载体，通过前置IIFE实现“信息收集—SSH公钥后门—反向隧道—多平台持久化—信标回传”的完整攻击链条，面向Windows、macOS、Linux三平台，具备穿透NAT远程控制内网主机与窃取开发凭证的能力，是以供应链投毒实施凭证后门植入的典型范式。smt.cmd是该载荷在Windows主机上的持久化产物，与载荷共享C2、私钥与隧道参数，可作为定位受影响主机的关键 IOC。针对受影响主机，建议按Cursor官方公告处置：卸载2.1.312与2.1.313版本扩展；检查并清除~/.ssh/authorized_keys中的svc-telemetry公钥；删除~/.config/.smt、.smtk、%USERPROFILE%\\.config\\smt.cmd与smtk、计划任务SysMon、启动项sysmon.cmd、LaunchAgent com.apple.sysmond.plist以及crontab @reboot项；终止相关ssh与autossh隧道进程；并轮换主机凭证、Git邮箱关联账号与云访问密钥。附录一：参考资料\[1\] 来源：安天CERT《关于 Cursor VS Code 扩展市场中恶意 Claude Code 扩展的风险提示》\[2\] 来源：Cursor《Cursor VS Code 扩展市场中发现恶意版本的 Anthropic.claude-code（2.1.312 和 2.1.313）》安全公告https://cursor.com/cn/blog/claude-code-extension-security-notice

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8e97403e9fb236da.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7633404289808229.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3788db5a50a0b41d.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ec0cdcac3943855.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c64e23cb913933ed.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c469a95d4508e749.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aa415408622ef433.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a3a9164df4898773.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ff9a4e81b42382b0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/31483c683bf60548.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ffde6692b29552f5.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/028815c6ab6266c8.png)

安天垂直响应平台
