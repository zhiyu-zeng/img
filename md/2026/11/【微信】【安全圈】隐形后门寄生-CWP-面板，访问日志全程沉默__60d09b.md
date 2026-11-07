---
title: 【微信】【安全圈】隐形后门寄生 CWP 面板，访问日志全程沉默
source: https://mp.weixin.qq.com/s/p7vACUuTInVAxChYd28e_Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:50:31+08:00
trace_id: 76362d04-4030-4e2c-b7c6-11f26310f8b1
content_hash: 1295eed989ce9fbe9e28f8e830f4d04a70e66f438c5b75ec8b0b95f1d9f34176
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
notion_page_id: 41175244-d011-8153-9564-c02a9acf7710
ioc:
  cves: []
  cwes: []
  hashes:
    - 965aea67fb40de1bab5169ada993349f
    - d3f4e95113d49ab3991b45e457bda75b
    - e505d4ffa21cf494a5dc2d7c8f4f1236
  domains: []
  tools: []
  techniques: []
---

**安全圈** *2026年11月6日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/830fccecd7453c2c.webp)

**关键词**

后门

攻击指令藏在带签名的 HTTP 请求头里，执行完不留一行访问日志。奇安信 XLab 本周披露了一个寄生在 Control Web Panel（CWP）服务器组件里的后门，取名 **cwpdoor**——它不是新增文件，而是面板 Web 服务器程序 cwpsrv 本身，被重新编译后塞进了私货

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7525145a2bb1e665.jpg)

## 🔍 后门本体：重编译的 cwpsrv

CWP 是管理 Linux 主机的免费面板，cwpsrv 是它的 Web 服务组件。cwpdoor 就藏在这个二进制里，平时行为与原版几乎一致，触发靠一套自定义请求头：请求携带有效时间戳与签名、且头名以 X-Ngx-Integrity 开头时，cwpsrv 执行请求中携带的命令。命令执行与通信走 Unix socket ngx_http_integrity_helper， **访问日志里没有任何记录**

> 安装后门需要 root 权限——攻击者执行安装器之前已经控制了服务器。他们最初怎么进来的，XLab 至今没有答案

## 📦 安装器：伪装成版本更新的 shell 脚本

XLab 6 月 29 日捕获安装器 cwpsrv_update.sh——一个伪装成版本更新的 shell 脚本。它只覆盖两个版本的 cwpsrv：1.15.10 与 1.24.0

换件手法相当小心：替换 cwpsrv 文件后把时间戳改回原值，ls 与 stat 检查看不出变化；样本在 VirusTotal 上 63 个引擎 **零检出**

9 月 30 日，一份含后门的压缩包从巴西上传至 VirusTotal，XLab 据此判断"野外已有真实受害者"，但没有给出受感染服务器数量。同一份压缩包里还躺着 Ebury——一个自 2009 年活跃至今的 OpenSSH 后门兼凭据窃取器。两者是否同源，研究员表示无法确认，也可能是不同攻击者先后驻留在同一台服务器上

## ⚠️ 三条命令自查

XLab 给出的排查路径很直接：

-   `ss -axp | grep integrity`
    
    ——出现 ngx_http_integrity_helper 这个 Unix socket 即为中招信号
    
-   `ps aux | grep cwpsrv`
    
    ——排查 cwpsrv 拉起的异常 helper 进程
    
-   `strings /usr/local/cwpsrv/bin/cwpsrv | grep X-Ngx-Integrity`
    
    ——在二进制里搜后门的头名字符串
    

在研究员的示例里，目标服务器开放端口一切正常，靠 socket 检查才把后门揪出来

## 🎯 中招之后怎么清

-   ① 用安装器留在 /usr/local/cwpsrv/bin 的 cwpsrv.prev-\* 备份恢复原文件。注意安装器换件成功后会清理临时文件与备份，这份副本可能已经不在
    
-   ② 升级到最新版本，再确认 `ss -axp | grep integrity` 无任何输出
    
-   ③ 更换全部面板凭据。后门能执行任意命令，整台服务器按失陷对待，同步排查其他威胁
    

## 📌 IOC 清单

-   MD5 `e505d4ffa21cf494a5dc2d7c8f4f1236` （安装脚本 cwpsrv_update.sh）
    
-   MD5 `965aea67fb40de1bab5169ada993349f` （后门版 cwpsrv 1.15.10）
    
-   MD5 `d3f4e95113d49ab3991b45e457bda75b` （后门版 cwpsrv 1.24.0）
    
-   IP `136.0.141[.]71` （下载服务器）
    
-   URL `https://136.0.141[.]71/static/cwpsrv_update.sh` 及同目录下的 cwpsrv_1.15.10、cwpsrv_1.24.0
    

***END***

阅读推荐

[【安全圈】白宫专网被卖做代理？总统办公室设备疑遭植入后门](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652079711&idx=1&sn=05bdbc8ba75d9805145596493772fbf6&scene=21#wechat_redirect)
