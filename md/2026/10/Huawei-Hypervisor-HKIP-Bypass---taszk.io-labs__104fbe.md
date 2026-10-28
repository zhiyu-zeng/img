---
title: Huawei Hypervisor HKIP Bypass - taszk.io labs
source: https://labs.taszk.io/blog/post/95_hw_hypervisor_bp/
source_host: labs.taszk.io
clip_date: 2026-10-28T10:14:44+08:00
trace_id: 9e4c2da7-7d8e-4d3f-b4a2-48bf17d23455
content_hash: f0326e29fb990b2b542c22384d40831ecda066fc6b16d67e532075b37453a306
status: synced
tags:
  - 漏洞分析
  - 内核
series: null
feed_source: Taszk·移动安全
ai_summary: 华为 Hypervisor 的 HKIP（内核完整性保护）可被其自带 HVC 接口直接绕过，官方拒绝修复且无 CVE。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40775244-d011-810c-af45-d6f5acaca67c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 华为 Hypervisor 的 HKIP（内核完整性保护）可被其自带 HVC 接口直接绕过，官方拒绝修复且无 CVE。
> 
> - **漏洞机制：** 华为 HEE（Hypervisor 执行环境）通过 Stage 2 地址转换限制 Linux 内核内存访问以保护 HKIP，但同时向内核暴露的 Hypervisor Call（HVC）接口可直接修改 Stage 2 转换表，移除保护。
> - **利用方式：** 调用 `HKIP_HVC_ROWM_SET_BIT` 可绕过 checkroot 保护；调用 `HKIP_HVC_RO_MOD_UNREGISTER` 可绕过 SELinux 对象保护。
> - **影响范围：** 覆盖众多使用不同麒麟/ Kirin 芯片组并实现 HKIP 的华为设备，含最新芯片组的手机。
> - **厂商响应：** 2021-11-29 报告给华为 PSIRT，2022-02-25 被认定超出范围、不分配 CVE，无修复补丁，2025-10-01 公开发布。

We have identified a new vulnerability in Huawei’s Hypervisor implementation. The vulnerability can be exploited to bypass Huawei’s HKIP (Kernel Integrity Protection) exploit mitigations.

The vulnerability we are disclosing in this advisory affected a wide range of Huawei devices, including phones on the newest chipsets. The vendor did not produce a fix/CVE for the reported vulnerability.

Thew Huawei Hypervisor Execution Environment (HEE) implements additional memory address protection of the Linux Kernel by restricting certain memory accesses using 2nd stage translation.

However, the HEE also exposes an api to the Linux Kernel via Hypervisor Calls (HVC) that can be directly used to modify the stage 2 translation tables and therefore remove the protections, bypassing the intented exploit mitigation entirely.

Specifically, checkroot protections can be bypassed by issuing `HKIP_HVC_ROWM_SET_BIT` HVC calls, and SELinux object protections can be bypassed by issuing `HKIP_HVC_RO_MOD_UNREGISTER` calls.

For more details, see (this)\[https://labs.taszk.io/articles/post/hypervisor1/\] blog post.

## Affected Devices

Huawei devices with various Kirin chipsets implementing HKIP.

## Fix

N/A

## Timeline

-   2021.11.29. Bug reported to Huawei PSIRT
-   2022.02.25. Huawei communicates that the vulnerability is considered out-of-scope and will not be given a CVE
-   2025.10.01. Advisory release
