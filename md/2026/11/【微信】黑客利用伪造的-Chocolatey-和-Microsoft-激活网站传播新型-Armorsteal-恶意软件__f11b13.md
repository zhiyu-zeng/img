---
title: 【微信】黑客利用伪造的 Chocolatey 和 Microsoft 激活网站传播新型 Armorsteal 恶意软件
source: https://mp.weixin.qq.com/s/D6Je8xb6TG4KK6aEW5CHFw
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:46:48+08:00
trace_id: 0a308774-953c-4f43-8333-72ebe944c2e1
content_hash: 057c3a9af4b188118a3af5fa944196915f89c67a34d2f994879b107266085bf1
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-8175-8ab9-f6e3c78bba45
ioc: null
---

**暗镜** *2026年11月10日 06:34*

黑客通过 搜索引擎投毒 推广虚假的 Chocolatey 和 Microsoft Activation-Script 网站，从而传播基于 Python 的恶意软件家族 ArmorSteal 。该恶意软件结合了远程访问、监视和信息窃取功能，可以窃取密码、浏览器 cookie、身份验证令牌和加密货币钱包数据。Zscaler 的威胁狩猎团队于 2026 年 9 月发现了该攻击活动，并于 10 月 22 日发布了调查结果。该攻击活动的目标是搜索安装命令的用户，将常规软件安装变成感染途径。

域名 choclatey\[.\]org 被恶意抢注，冒充 Chocolatey 并显示一条恶意 PowerShell 安装命令。执行该命令会部署 ArmorSteal，同时运行合法的 Chocolatey 安装程序，从而使请求的软件包管理器能够正常运行，并减少明显的入侵迹象。第二个域名 massgravel\[.\]net 冒充了微软激活脚本项目。共享的恶意软件组件和相同的 RSA-2048 任务签名密钥将这两个分发渠道与同一行动联系起来。这两个安装程序都会请求提升的权限，隐藏 PowerShell 控制台，并将一个压缩包下载到 C:\\Windows\\SystemHealth\\Update 目录。该压缩包包含 Python 3.11、Pyarmor 运行时文件以及使用 Pyarmor 9.1.7 保护的恶意脚本。

持久化功能使用两个计划任务。SysCheck2 在用户登录时以最高可用权限启动远程访问模块。SysCheckX 在启动后延迟 45 秒，以 SYSTEM 权限执行该模块。

远程访问模块 SysMon.py 会对受感染的系统进行分析，并从主板序列号中推导出机器标识符。它每 60 秒轮询一次 命令与控制服务器， 以获取针对特定受害者和整个攻击活动的 Python 任务。

在执行内存中的任务之前，该模块会验证 RSA-2048 签名，并将版本号与本地存储的值进行比较，以防止较旧或先前已处理的指令再次运行。

ArmorSteal 会查询 ipinfo\[.\]io 以获取公共 IP 地址的所有权信息。当选定的云服务提供商出现在组织字段中时，它会显示一个虚假的内存错误并退出，从而可能绕过云端托管的分析环境。
