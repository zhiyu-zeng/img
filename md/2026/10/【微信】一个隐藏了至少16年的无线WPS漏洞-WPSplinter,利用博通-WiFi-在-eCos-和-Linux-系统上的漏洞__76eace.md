---
title: 【微信】一个隐藏了至少16年的无线WPS漏洞-WPSplinter,利用博通 WiFi 在 eCos 和 Linux 系统上的漏洞
source: https://mp.weixin.qq.com/s/-Urrf3Y1E-TlJJfUBpwkzg
source_host: mp.weixin.qq.com
clip_date: 2026-10-19T16:41:18+08:00
trace_id: d0f1b77c-d08a-4d04-a4d3-5f07d3542c91
content_hash: 891e315424ec4a77b34e11786ca3043929340d6700d145bf5985f25d03f79d8c
status: synced
tags:
  - 微信
  - Android逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**TL;DR：** 博通 WPS 解析器中的 EAP 重组溢出（WPSplinter）至少存在于 2010 年以来的博通 SDK 中；在 Wi-Fi 覆盖范围内，攻击者无需密码或完成 WPS 注册即可触发远程 root shell。"
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3fe75244-d011-81ff-aa2b-f0fc3070272f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 博通 WPS 解析器中的 EAP 重组溢出（WPSplinter）至少存在于 2010 年以来的博通 SDK 中；在 Wi-Fi 覆盖范围内，攻击者无需密码或完成 WPS 注册即可触发远程 root shell。
> 
> - **触发门槛极低：** 只需处于 Wi-Fi 射程内，无需网络密钥，也无需完成 WPS 配对；因为解析器在正常配对流程完成之前就已经可达。
> - **eCos 平台利用链：** 通过控制 `total_received` 实现任意写，通过修改 `next_frag_to_send` 实现任意读，再劫持 `send_data`/`parse_msg` 函数指针实现任意执行；利用时需先做标定式信息泄露，以计算出相对偏移，并受“下一分片 +0x9 的 WSC op-code 需合法”的限制。
> - **Linux 平台更简单：** 目标二进制普遍为 NX + non-PIE，只有 libc 是 PIE；ARM 下 `system@PLT` 地址固定，无需绕过 ASLR，MIPS 则需先泄露 `printf` 的 GOT 项以推算 libc 基址。
> - **可蠕虫化：** `wl` 工具能发送任意 802.11 帧，作者将 stdout 十六进制编码后经无线帧回传，以获取反向 shell，无需云端 C2。
> - **修复与影响：** 博通 2018 年静默发布了不完整补丁，并拒绝分配 CVE，使受影响设备成为“永远的漏洞”；作者在比利时三家 ISP 设备上实测可攻陷，截至 2026-10-15 均未修复。

**小白安全成长记** *2026年10月19日 16:16*

无线wifi这类漏洞对热衷于附近邻居攻击或酒店网络入侵的来说简直是完美之选。这些攻击目标明确，通过无线方式，针对防御者几乎无法监控的设备，从而实现流量操纵和数据收集。有意思的是，这是又一个利用AI加速漏洞挖掘和复现的真实案例，按照作者所说，这项工作他自己做要几个月，用前沿模型 **不到一周**，总成本 **103 欧元** （codex harness + `gpt-5.6-Sol` ，thinking level high，TAC 认证）。三智能体分工——REVERSER、VULN RESEARCHER、EXPLOIT WRITER——各自带技能（ `ghidra-rpc` 、 `ecos-offensive-security-research` 、 `fp-check` 等），再通过 FTDI 串口、以太网、Alfa 无线网卡接到真实设备上。这套流水线一次性挖出 DHCPv6 DoS、FTPLite DoS、SSH 未认证栈溢出、UPnP 响应溢出、WebSocket 溢出（重发现了 Cable Haunt）等一串问题。

### 1\. 漏洞概述

-   **漏洞类型**：WPS（Wi-Fi Protected Setup）解析器中的 **EAP 重组溢出** （EAP reassembly overflow）。
    
-   **存在时间**：该漏洞自至少 **2010 年** 起就存在于博通的 SDK 中。
    
-   **漏洞状态**：由于博通在 2018 年仅静默发布了不完整的补丁，并随后建议厂商迁移到 `hostapd` ，导致该漏洞在基于 eCos 的平台（如 BCM3380, BCM3383, BCM33834）上已成为 **“永远的漏洞”（Forever Day）**。基于 Linux 的平台（如 BCM3390, BCM65xx, BCM68xx）除非 OEM 厂商主动迁移，否则同样面临此风险。
    

### 2\. 触发条件与技术细节

**触发条件极其宽松**：Wi-Fi 射程内即可， **不需要网络密钥，不需要完成 WPS 注册**——解析器在正常 WPS 配对完成之前就可达。

**eCos 上的三个原语** （来自幻灯片）：

-   控制 `total_received` → **任意写**
    
-   修改 `next_frag_to_send` → **任意读**
    
-   劫持 `parse_msg` / `send_data` 函数指针 → **任意执行**
    

限制是：下一个分片 `+0x9` 处必须以合法的 WSC op-code（ `0x04–0x0F` ）开头；任意写的位置总落在 `frags_received` 之后，且一开始并不知道自己在哪。所以利用是三步链：

1.  用"标定式信息泄露"（calibration infoleak）算出自身地址相对于 WPS state 对象的偏移
    
2.  借 `next_frag_to_send` 这类 **自引用指针字段** 泄露 WPS state 的绝对地址
    
3.  覆盖 `send_data` 函数指针指向 shellcode，触发执行
    

**Linux 上更简单**：作者观察到的二进制全部是 **NX + non-PIE** （ARM 小端 32 位或 MIPS 大端 32 位），只有 libc/uclibc 是 PIE。

-   **ARM**： `system@PLT` 地址固定， **根本不需要绕 ASLR**。泄露 WPS state 偏移 → 把 `system@PLT` 写进 `send_data` → `$a0` 由 WSC 包控制 → 触发 `send_data` 即 `system(r0)` ，命令藏在帧/MAC 前缀里
    
-   **MIPS**：因 `$gp` 复杂一些，需要先泄露 `printf` 的 GOT 项 → 推 libc 基址 → 解析 `system` → 再写入 `send_data`
    

**最有意思的一步**： `wl` 命令行工具能发任意 802.11 帧。作者用它把 stdout 十六进制编码后 **直接通过 802.11 帧回传**，拿到反向 shell，完全不需要云端 C2。而且——" `wl` 的存在让这个漏洞变成可蠕虫化的"。攻击者可以通过 Wi-Fi 无线远程触发该漏洞。触发漏洞 **不需要知道 Wi-Fi 网络密钥（密码）**，也 **不需要完成正常的 WPS 注册/枚举过程**。成功利用可实现受控的信息泄露和 **任意代码执行（RCE）**，攻击者能够直接获取路由器的 root shell。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a938864734443706.png)

-   漏洞识别:https://github.com/qkaiser/broadcom-wps/
    
-   作者blog:https://quentinkaiser.be/security/2026/10/16/one-parser-two-bugs/
    

### 3\. 影响范围与危害

-   **影响规模**：波及全球数十家供应商、数百种产品型号以及数百万台基于博通芯片的接入点（AP/路由器）。
    
-   **实地验证**：作者在比利时的 3 家主要互联网服务提供商（ISP）的设备上成功验证了漏洞的可利用性，包括：
    

-   Proximus (BBOX 3V+)
    
-   VOO (Netgear CG3100, CG3700, Technicolor 7210, CGA4233)
    
-   Orange (ASKEY TCG3000)
    
-   *(注：Telenet 的 Sagemcom 设备也可能受影响，但未及验证)*
    

-   **实际危害**：截至 2026 年 10 月 15 日，上述受影响设备均未修复。这意味着攻击者可以在物理距离较近的地方（如隔着街道）直接接管大量家庭或企业路由器，并可能窃取敏感数据（如网络的 PSK 密钥）。
    

### 4\. 厂商响应与披露时间线

-   **博通的态度**：博通自 2018 年起就已知晓此漏洞，并收到了来自外部实体的相关信息。但博通 **拒绝为该漏洞分配 CVE 编号，也拒绝公开沟通**。这被认为是导致众多 OEM 厂商未能及时修补的根本原因。
    
-   **披露时间线**：
    

-   2026年7月18日：向博通 PSIRT 提交关于 eCos 平台（BCM3380/3383/33834）的漏洞报告。
    
-   2026年7月27日：向博通 PSIRT 提交关于 Linux 平台（BCM3390/65xx/68xx）的漏洞报告。
    
-   2026年10月16日：作者选择公开披露此“Forever Day”漏洞。
    

### 5\. 缓解与检测建议

-   建议在内网资产盘点或外部攻击面管理时，关注使用上述博通芯片型号的路由器/AP 设备。可以利用作者提供的 YARA 规则或指纹脚本进行排查。由于该漏洞无需预认证即可 RCE，它极有可能已被高级威胁组织或自动化僵尸网络武器化，需作为高优先级风险进行监控和缓解（如隔离老旧设备、强制迁移至受支持的开源替代方案）。
    
    * * *
    
    我想说的是，漏洞挖掘AI化的今天，攻防之间，防守方能守得住吗？
    

\- END -
