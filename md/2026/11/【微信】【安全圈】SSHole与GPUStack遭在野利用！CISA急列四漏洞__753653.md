---
title: 【微信】【安全圈】SSHole与GPUStack遭在野利用！CISA急列四漏洞
source: https://mp.weixin.qq.com/s/cLS6_ltFSyyr6X3ScsPlUg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T21:53:17+08:00
trace_id: 68d127f3-4b0a-4df5-aa74-fcc9d24f2d39
content_hash: f8163bc8281e8f23a610f44efdff1537d50f6a2df4aeab86add6e210e7f24ce4
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41475244-d011-817e-b255-dba130166a44
ioc:
  cves:
    - CVE-2026-102895
    - CVE-2026-116779
    - CVE-2026-123158
    - CVE-2026-123218
  cwes: []
  hashes: []
  domains:
    - tac.vpnla.org
  tools: []
  techniques: []
---

**安全圈** *2026年11月10日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/830fccecd7453c2c.webp)

**关键词**

漏洞

**核心事实**：2026 年 11 月 10 日（美东时间 11 月 9 日晚）通报，美国网络安全与基础设施安全局（CISA）将四枚高危漏洞紧急列入已知被利用漏洞目录（KEV），要求联邦民事机构最迟于 **11 月 12 日** 前完成修补。名单涵盖 OpenBSD OpenSSH “SSHole”认证绕过漏洞（CVE-2026-123158，CVSS 8.1），以及三枚 CVSS 高达 **9.8** 分的致命缺陷：AI 算力调度平台 GPUStack 认证缺陷（CVE-2026-102895）、IBM Aspera Faspex 越权漏洞（CVE-2026-123218）与 SignalWire FreeSWITCH 代码注入漏洞（CVE-2026-116779）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd3d670a1528bf84.jpg)

## 🔍 OpenSSH “SSHole”：超长密码逼出 musl 返回值死穴

**CVE-2026-123158** （代号 SSHole，CVSS 8.1）精准打击了云原生和容器环境最常用的轻量级 Linux 发行版——使用 `musl libc` 且编译运行时禁用 PAM（Pluggable Authentication Modules）的系统，例如 Alpine Linux。

在正常加固过的 Linux 主机上，管理员会把禁止密码登录的账号在 `/etc/shadow` 中的密码哈希占位符设为星号 `*` 。但当攻击者向 `sshd(8)` 发送超长密码字符串时，musl 的密码哈希函数出错并直接返回 `*` ，OpenSSH 错误地将两者判定为匹配，从而直接放行登录。

-   ⏱️ **4 小时极速武器化**：OpenSSH 团队于 11 月 5 日发布 `10.6p2` 修复该绕过，仅仅 4 小时后，PoC 利用代码就在公开渠道流出。
    
-   🌐 **真实后渗透载荷现身**：GreyNoise 蜜罐自 11 月 7 日 00:46 UTC 起已捕获来自 6 个源 IP 的 16 至 18 条完整攻击链；Previdian 亦录得来自 9 个国家 13 个 IP 的 20 余次有效攻击尝试。黑客得手后立即查询云元数据服务、窃取 root SSH 私钥、篡改 `authorized_keys` 建立持久化，并投递名为 **TAC Agent** 的 Python C2 木马（回连 `tac.vpnla[.]org` ，代码内含中文注释与报错日志）。watchTowr 同时监测到该漏洞已被僵尸网络与挖矿木马大规模征用。
    

## 💻 GPUStack 9.8 分核弹：反向代理一秒变“免密管理员”

开源 GPU 集群管理平台 GPUStack 的 **CVE-2026-102895** （CVSS 9.8）揭示了 AI 算力基础设施中一个极度致命的设计失误。在 `gpustack < v2.2.0` 中， `gpustack/api/auth.py` 里的 `get_current_user` 在默认配置 `force_auth_localhost=False` 下，会把任何来自回环地址 `127.0.0.1` 的请求直接提升为内置最高管理员。

-   🎯 **两种零门槛破防路径**：一是部署同机反向代理（如 Nginx 配置 `proxy_pass http://127.0.0.1:<port>` ），所有公网外部请求到达 GPUStack 时 TCP 对端 IP 都是 `127.0.0.1` ，无需任何凭证直接变身管理员；二是伪造 HTTP 请求头 `X-GPUStack-Real-IP: 127.0.0.1` 强行欺骗 `client_ip_getter` 。
    
-   💥 **在野攻击已落槌**：攻击者得手后可直接铸造具备全权限 `["*"]` 的持久化 API 密钥、读取云厂商凭据与模型机密，并通过 `POST /v2/inference-backends/from-yaml` 在所有 GPU Worker 节点上直接执行反弹 Shell 代码。安全机构已确认针对 `v2.1.1` 的在野入侵实例。
    

## ⚡ 同步上榜的另外两枚 9.8 分高危漏洞

-   📦 **IBM Aspera Faspex（CVE-2026-123218，CVSS 9.8）**：存在错误授权（Incorrect Authorization）漏洞，已认证攻击者可通过构造特定消息绕过权限校验，实现高危权限提升（官方于 2026 年 11 月发布修复）。
    
-   📦 **SignalWire FreeSWITCH（CVE-2026-116779，CVSS 9.8）**：存在远程代码注入漏洞，攻击者可藉此窃取配置与凭证、接管任意通话控制权并执行系统命令（2026 年 10 月已出补丁，目前遭活跃利用）。
    

## 🛡️ 加固与自查操作指南

-   ✅ **OpenSSH 升级与排查**：使用 Alpine Linux 或其他 musl 发行版的容器与宿主机，立即升级至 `OpenSSH 10.6p2` 或在 `sshd_config` 彻底禁用密码认证（ `PasswordAuthentication no` ）；同时审计 `/etc/shadow` 为 `*` 账号的异常登录记录、未知的 `authorized_keys` 及异常 Python 启动项。
    
-   ✅ **GPUStack 立即升至 2.2.0+**：官方已移除回环自动提权逻辑。暂未升级的节点必须立即启用 `force_auth_localhost=true` ，并在 Nginx/网关边缘剥离外部传入的 `X-GPUStack-Real-IP` 请求头；同时清查并吊销可疑 `["*"]` 管理员 API Key 与自定义推理后端 YAML。
    
-   ✅ **业务文件传输与语音网关打补丁**：对照 IBM 与 SignalWire 官方安全通告，在 11 月 12 日前完成 Aspera Faspex 与 FreeSWITCH 补丁部署，严防未修补节点成为内网跳板。
    

***END***

阅读推荐

[【安全圈】篡改温控至50℃！黑客攻破工业冷链致血浆变质引火灾](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652079809&idx=1&sn=c1a8b7e5a159a8bd80d64aadad83d242&scene=21#wechat_redirect)
