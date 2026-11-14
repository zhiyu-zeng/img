---
title: 【微信】关于防范Node.js越界写入超危漏洞的风险提示
source: https://mp.weixin.qq.com/s/2VXT7X-DvrJHkEwKokRJ7A
source_host: mp.weixin.qq.com
clip_date: 2026-11-14T21:53:27+08:00
trace_id: 8f56e4e6-8723-4ac6-9916-2f8723dcac6f
content_hash: 07dbb18ac694bb83fd41747a6aa2e83ca20c5b4d0ccf36d755848c1e9612f93e
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
notion_page_id: 41875244-d011-817e-89b9-e15e326a38e4
ioc: null
---

**网络安全威胁和漏洞信息共享平台** *2026年11月11日 12:23*

近日，工业和信息化部网络安全威胁和漏洞信息共享平台（NVDB）监测发现，Node.js存在越界写入超危漏洞，危害严重。

Node.js是一个开源的JavaScript运行环境，广泛用于Web服务器构建及命令行工具编写。其内置的Brotli解码器存在越界写入漏洞，可被未经身份验证的攻击者利用，破坏进程内存，进而导致程序崩溃、进程内存信息泄露或远程代码执行。当前仍处于维护期内的受影响版本包括：22.x系列＜22.23.4、24.x系列＜24.22.1、26.x系列＜26.12.1。

目前，Node.js项目团队已修复上述漏洞并发布安全公告（URL链接：https://nodejs.org/zh-cn/blog/vulnerability/october-2026-security-releases）。建议相关单位和用户立即开展全面排查，及时升级至最新安全版本，消除网络安全隐患。
