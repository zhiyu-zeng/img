---
title: "TVE-2026-03: Xiaomi miIO client heap buffer overflow - taszk.io labs"
source: https://labs.taszk.io/blog/post/114_mi_heap_bof/
source_host: labs.taszk.io
clip_date: 2026-10-28T10:16:39+08:00
trace_id: ec734a78-5e7e-4fa5-b10e-c1209685d4e3
content_hash: 3e113fc44b8dedb29b18913fb446c1488f59298fa0b7e2263e1ec3ba31b81282
status: synced
tags:
  - 漏洞分析
  - 物联网
series: null
feed_source: Taszk·移动安全
ai_summary: Xiaomi 智能设备的 miIO 协议存在堆缓冲区溢出，可通过 WiFi 远程触发实现 RCE，且厂商超过六个月未发布补丁或 CVE。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 0
  failed_urls:
    - /images/blog/nowyouseemi/media/handshake-sequence-pwn.svg
notion_page_id: 40775244-d011-8194-8a97-c24f0ae24b8c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Xiaomi 智能设备的 miIO 协议存在堆缓冲区溢出，可通过 WiFi 远程触发实现 RCE，且厂商超过六个月未发布补丁或 CVE。
> 
> - **漏洞本质：** miIO 客户端堆缓冲区溢出，攻击者通过 WiFi 向设备发送畸形 miIO 消息即可触发，最终可远程代码执行（RCE）。
> - **绕过物理接触：** 握手流程设计缺陷允许重放设备自身发送的某些值，无需知道配对码即可完成配对流程，因此无需物理接近设备。
> - **影响范围：** 已验证受影响设备为小米 C400 摄像头；任何使用 miIO 协议的小米智能设备均可能受影响。
> - **厂商处置争议：** TASZK 于 2025-09-04 通过邮件向小米 PSIRT 报告，小米承认收到并要求走 HackerOne 项目，TASZK 拒绝。期间小米方多次推迟、建议加入赏金计划、索要完整 exploit，后又称漏洞“不具备实际利用条件”，要求补丁 OTA 发布后按 6 个月披露。
> - **最终披露：** 报告后六个月仍无补丁、无 CVE 分配，TASZK 于 2026-03-16 发布通告并公开完整 RCE exploit POC。

An attacker sending a malformed miIO message over WiFi to a Xiaomi Smart camera device can trigger the vulnerability described here.

This report describes a heap buffer overflow, which leads to remote code execution.

The vulnerability described in this advisory affects a potentially wide range of Xiaomi Smart devices. This vulnerability has not yet been issued a public patch or advisory or assigned a CVE by the vendor despite repeated requests and a lapse of more than six months since the original vendor disclosure.

## Vulnerability Details

Due to a flaw in the design of the handshake sequence, it is possible to complete the setup flow without knowledge of the setup code by replaying certain values that the camera sends. This eliminates the necessity of physical access for the attacker.

![⚠️ 图片托管失败 · handshake-sequence-pwn](/images/blog/nowyouseemi/media/handshake-sequence-pwn.svg)

![⚠️ 图片托管失败 · handshake-sequence-pwn](https://labs.taszk.io/images/blog/nowyouseemi/media/handshake-sequence-pwn.svg)

## Affected Devices

-   verified: Xiaomi C400
-   potentially: any Xiaomi Smart device using miIO

## Timeline

-   2025.09.04. Bug reported to Xiaomi PSIRT by email, following the process outlined at [https://trust.mi.com/misrc/response](https://trust.mi.com/misrc/response)
-   2025.09.16. Asking for confirmation of report receipt
-   2025.09.19. Xiaomi acknowledges the report by directing us to submit to the hackerone platform.
-   2025.09.19. TASZK responds that we will not participate in their hackerone program and the report has been submitted as-is and that the disclosure will follow [https://taszk.io/disclosure](https://taszk.io/disclosure).
-   2026.02.16. TASZK asks for update and notifies Xiaomi that in accordance with the stated policy, we will proceed with disclosure.
-   2026.02.19-24. In a series of emails, Xiaomi first claims they have misplaced their PGP key and ask for the report to be re-sent plaintext, then confirms they have managed to locate their key after we refuse, then claim they have confirmed the vulnerabilities (" `our security team has reviewed your report and confirmed the vulnerabilities` ") and repeatedly ask us to join their program for rewards and simultaneaously that we postpone release. They also ask that we provide full exploit code if we have it.
-   2026.02.20-25. TASZK repeatedly confirms that we will do neither and as per request we confirm that we can also provide full exploit POC.
-   2026.03.03. TASZK shares full RCE exploit POC.
-   2026.03.06-10 Xiaomi again provides postponed timeline estimates, does not provide any CVEs, and further requests online meetings to discuss future collaboration opportunities that they want to propose.
-   2026.03.11. TASZK asks for the CVE numbers for the vulnerabilities which have been stated as confirmed and reiterates that we are focused only on this.
-   2026.03.13. Xiaomi writes that they have now changed their minds and think that one vulnerability “ `does not currently meet the conditions required for practical exploitation` ” and also that their “ `standard process` ” requires that they “ `follow a 6-months disclosure timeline following the OTA release of the corresponding patch` ” and that they “ `will complete the CVE application process and share the assigned CVE numbers with you as soon as they become available` ”.
-   2026.03.16. Advisory release, six and a half months after report. Full exploit POC also released.
