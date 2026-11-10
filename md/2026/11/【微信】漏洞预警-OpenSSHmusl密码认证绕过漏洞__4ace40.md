---
title: 【微信】漏洞预警 | OpenSSH/musl密码认证绕过漏洞
source: https://mp.weixin.qq.com/s/Xhp_A-EjGRb7iqKIaoDzaQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T12:48:01+08:00
trace_id: 9c163ba8-6439-4027-81cc-12cbfb2eabca
content_hash: 8e3c50667f29eb91c420035042642c42cb7d235f100a8e0ad8b522211c939d99
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
notion_page_id: 41475244-d011-81a8-af16-d4566d5dc948
ioc:
  cves:
    - CVE-2026-123158
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**浅安安全** *2026年11月10日 07:50*

**0x00 漏洞编号**

-   ## CVE-2026-123158
    

**0x01 危险等级**

-   高危
    

**0x02 漏洞概述**

OpenSSH是OpenBSD项目维护的广泛使用的开源SSH远程登录与加密传输服务组件，被广泛应用于Linux、Unix及嵌入式系统。musl libc是面向嵌入式与容器场景的轻量级C标准库，被Alpine Linux、OpenWrt、Buildroot、Yocto及大量Docker镜像采用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ffc4e1ef467e9bea.webp)

**0x03 漏洞详情**

**CVE-2026-123158**

**漏洞类型：** 密码认证绕过

**影响：** 执行远程命令

**简述：** OpenSSH/musl存在密码认证绕过漏洞，由于musl libc的crypt()函数在失败时返回单字符"\*"，而OpenSSH在未启用PAM的认证路径中，对密码字段为"\*"的账户借用其他账户的真实盐值执行crypt()校验。当攻击者提交257～1024字节的超长密码时，musl的crypt()因KEY_MAX(256)长度限制返回"\*"，与影子密码字段"\*"比较相等，strcmp判定通过，导致攻击者无需任何有效凭据即可通过SSH密码认证登录仅允许密钥登录或已锁定密码的账户。成功绕过认证后，若目标账户具备免密sudo/doas权限，攻击者可直接提权至root实现完全控制。

**0x04 影响版本**

-   OpenSSH < 10.6p2
    

**0x05 POC状态**

-   已公开
    

**0x06 修复建议**

********目前官方已发布漏洞修复版本，建议用户升级到安全版本****** ****：******

https://www.openssh.com/

漏洞预警三 · 目录
