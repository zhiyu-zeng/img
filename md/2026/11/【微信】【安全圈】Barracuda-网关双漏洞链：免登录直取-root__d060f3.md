---
title: 【微信】【安全圈】Barracuda 网关双漏洞链：免登录直取 root
source: https://mp.weixin.qq.com/s/housa7emWiJ4cL3u0VEIxw
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:51:06+08:00
trace_id: 6e5164ce-6be1-4c36-929c-f0ac13980b7a
content_hash: 1b1fd5fbd6ce25a591d1de78de165ccc510412c490789cbef2e87978103ed9b2
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
notion_page_id: 41175244-d011-81ec-b928-daf2ac996f49
ioc:
  cves:
    - CVE-2023-2868
    - CVE-2026-111560
    - CVE-2026-116606
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**安全圈** *2026年11月6日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/830fccecd7453c2c.webp)

**关键词**

漏洞

在 Barracuda Email Security Gateway 这台邮件过滤设备上，攻击者不需要账号、不需要登录，就能以最高权限 root 执行命令。两个漏洞串成一条链：一个把未认证请求抬到管理员级，一个把配置项变成 shell 命令。厂商周一发布补丁，watchTowr 周四公开完整攻击链

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/585ed53cf2051cbd.jpg)

## 🧩 两个洞，各司其职

-   **CVE-2026-116606**
    
    （授权绕过，Mandiant 评分 9.3/10）：未认证攻击者可恢复一份构造的配置备份，改掉设备全局设置。仅影响 Email Security Gateway
    
-   **CVE-2026-111560**
    
    （命令注入，Mandiant 评分 8.6/10）：以 root 身份执行命令，原本需要管理员账户。该漏洞波及另外五款产品，但在那些产品上仍需管理员权限才能利用
    

> 两个漏洞在 Email Security Gateway 上叠加，效果是免登录 root RCE

## 🔬 watchTowr 拆解的完整链条

watchTowr 沿着设备代码把链路走了一遍。第一步，一次失败的密码修改不会终止请求，而是给请求者返回一个低权限角色——备份恢复功能就此对未登录者敞开

第二步，恢复的备份数据里带着一个 timezone 字段，设备后续把它当 shell 命令以 root 权限执行。备份本身有校验和保护，但计算校验和的密钥硬编码在代码里，攻击者可以直接伪造出合法校验和

演示中，watchTowr 用这条链以 root 身份向设备写入文件，全程没有登录凭证

## ✅ 处置清单

-   Email Security Gateway 升级到 9.4.0.030 或更高版本；其余受影响产品按官方公告列出的修复固件版本升级
    
-   暂时打不了补丁的，把设备管理界面限制在可信内网
    
-   关闭过自动补丁的，重新打开
    

watchTowr 开源了检测工具（GitHub 仓库 watchTowr-vs-Barracuda-RCE-CVE-2026-116606-CVE-2026-111560），用于判断设备是否受漏洞影响，未公开利用代码

## 📌 现状

截至本周，两个漏洞都未进入 CISA 的已知被利用漏洞目录（KEV），也没有公开报告把它们与真实攻击挂钩。Barracuda 安全公告列出了各产品的修复固件版本

这台设备上一次出圈是 2023 年：UNC4841 利用零日漏洞 CVE-2023-2868 发起过一轮大规模攻击。那起事件与本周修复的两个漏洞没有关联，目前也没有证据把新漏洞与任何攻击者挂钩

***END***

阅读推荐

[【安全圈】9.8分Linux内核高危RCE！无需认证隔空打穿](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652079699&idx=1&sn=dfbd72f6698a155131d20cada69f5589&scene=21#wechat_redirect)
