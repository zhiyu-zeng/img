---
title: 【微信】新型恶意工具 GhostFrame 曝光！可接管 VMware ESXi，无需植入虚拟机即可窃取 Windows 凭证
source: https://mp.weixin.qq.com/s/ApDTbGzmFf3CPRBQo41Y8w
source_host: mp.weixin.qq.com
clip_date: 2026-11-15T07:53:43+08:00
trace_id: cdf83d76-5b1c-47a5-a813-ab1dae79ccf4
content_hash: a67eb43876801892afd89c6ab656a09e57a0fe9ce219b1e83e8b78ac6942029c
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
notion_page_id: 41875244-d011-811d-ba41-dc96f153407e
ioc: null
---

**维度攻防** *2026年11月11日 13:51*

导读一款名为 GhostFrame 的全新攻击框架被安全研究人员捕获，它专门针对 VMware ESXi 虚拟化底层，攻击者拿到 ESXi root 权限后，就可以管控全部虚拟机，不需要在虚拟机内部植入任何恶意程序，就能直接盗取 Windows 账号密码、NTLM 哈希、域控机密数据。该工具和 Settra 勒索软件团伙 TAG‑218 高度关联，已经结合 VPN 漏洞展开真实攻击，虚拟化基础设施再一次成为勒索攻击的重点突破口。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ce07e319114f0ebf.png)

## 🔍什么是 GhostFrame？

GhostFrame 是一套面向 VMware ESXi 的完整攻击工具包，带有 Web 控制面板。攻击者获取 ESXi 主机 root 权限后部署该框架，即可统一管控整台物理服务器之上的所有虚拟机实例。

> ⚠️重点提醒：GhostFrame 本身不提供漏洞利用能力，前提是攻击者已经拿到 ESXi 的 root 权限，并非零日漏洞工具。

ESXi 作为虚拟化层（Hypervisor），处在所有虚拟机的底层。绝大多数部署在虚拟机内部的杀毒软件、EDR 安全工具，看不见 Hypervisor 层发生的恶意行为。一旦攻击者拿下 ESXi 底层，上层所有业务虚拟机全部暴露在风险之下，传统虚拟机内的防护近乎失效。

## 🛠️ 恶意能力全解析：潜伏、控制、窃取凭证一条龙

GhostFrame 植入程序名为vmhostd‑core，攻击者通过 Builder 模块生成植入样本，其生存与对抗手段十分狡猾：

### 1、持久化驻留，重启也无法清除

1.  恶意程序复制至路径 `/opt/vmhostd‑core` ；
    
2.  修改开机启动脚本 `/etc/rc.local.d/local.sh` ，实现开机自启；
    
3.  自动关闭 ESXi 防火墙、关闭 `execInstalledOnly` （阻止未签名程序运行的安全机制），并且每 5 秒重复执行一次，管理员手动恢复防护设置会被立刻篡改；
    
4.  调用系统备份脚本 `auto‑backup.sh` 固化恶意修改；
    
5.  将自身重命名为 `vmhostd` ，伪装成 VMware 官方 `vmware‑hostd` 服务，实现 “藏于眼皮底下” 的伪装潜伏。
    

### 2、多通道 C2 通信，内存执行规避磁盘检测

植入程序同时尝试 6 个端口和攻击者 C2 服务器建立连接：53、2222、3389、4444、8443、9443，成功建立一条即丢弃其余连接；30 秒连接失败后随机等待 5‑12 秒重试。

> 安全检测特征：同一台 ESXi 短时间内向同一 IP 同时发起 6 个连接请求，是非常重要的狩猎指标。

优先采用内存加载恶意代码，不在磁盘落文件；内存加载失败才会降级启动/bin/sh反弹 Shell。

### 3、对虚拟机全量管控

攻击者面板可实现：✅ 列出全部虚拟机、开关机、创建 / 删除快照；✅ 开启 VNC 远程屏幕，透过攻击者服务器远程查看虚拟机画面；✅ 对外暴露 ESXi HTML 主机管理客户端；✅ 内置 SOCKS5 代理gfsox，以被攻陷 ESXi 为跳板访问内网隔离业务系统。

### 4、核心威胁：不进虚拟机，直接偷 Windows 凭证

这是 GhostFrame 最危险的能力，分为两大组件：

1.  sdkmon：篡改 ESXi 服务配置，捕获后续 ESXi 管理员登录账号密码；
    
2.  VMkatz：开源工具集成，直接读取虚拟机快照、虚拟磁盘、存储数据。  
    可提取：NTLM 哈希、WDigest 凭据、Kerberos 票据、SAM、LSA 机密、域控 `NTDS.dit` 等核心数据。
    

> 也就是说：不需要往 Windows 虚拟机放任何木马，攻击者在虚拟化底层就可以拿到域账号、管理员密码，直接为横向移动、勒索加密铺路。

## 🚨真实攻击链：VPN 沦陷→内网渗透→部署 GhostFrame→勒索泄露

研究人员追踪威胁团伙TAG‑218（与 Settra 勒索软件活动重叠）的攻击活动，完整攻击链路浮出水面：

1.  突破边界：2026 年 8‑10 月，攻击团伙针对欧美大量 SonicWall、Palo Alto、Fortinet VPN 设备进行入侵。其中大量攻击利用 Palo Alto GlobalProtect 漏洞 CVE‑2026‑0257，该漏洞允许攻击者绕过账号密码与 MFA，非法建立 VPN 会话。（厂商 2026 年 5 月已经发布补丁，大量企业未修复）。
    
2.  内网横向：VPN 进入内网后，拿到权限继续横向移动，获取 VMware ESXi 的 root 权限；
    
3.  部署工具：在 ESXi 部署 GhostFrame，同时部署 MeshCentral/MeshAgent 做长期后门驻留；
    
4.  窃取机密：底层导出域控、业务系统凭据；
    
5.  实施勒索：部分受害企业后续出现在 Settra 勒索软件数据泄露站点上，数据被公开曝光。
    

> 安全厂商 Unit42 也观测到同类攻击：攻击者攻陷 VPN 后直达虚拟化层，关闭 ESXi 安全校验，直接从虚拟磁盘导出域控凭据，完全绕开虚拟机内部安全软件的监控，和 GhostFrame 攻击模式完全吻合。

攻防技术库 · 目录
