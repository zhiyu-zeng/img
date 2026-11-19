---
title: 【微信】已复现！Java4Shell OpenJDK Base64 解码远程代码执行漏洞
source: https://mp.weixin.qq.com/s/rrPyVGRNt_ie6hLcm7UECw
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:59:13+08:00
trace_id: 3a94d034-bf93-4c5e-9e8c-825276f30fb3
content_hash: 559fdcd2bb71754ec5bcf59014475aad28b6d3e5d3549590ee30776503031325
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
notion_page_id: 41d75244-d011-8108-99fb-d6ed67753fc9
ioc:
  cves:
    - CVE-2026-114938
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**微步在线研究响应中心** *2026年11月18日 09:01*

漏洞概况

OpenJDK 是 Java 平台标准版的开源参考实现，也是当今使用最广泛的 Java 开发工具包。

近日，Oracle官方发布通告，修复了OpenJDK Base64解码远程代码执行漏洞（CVE-2026-114938）。微步情报局已成功复现该漏洞。经分析，漏洞影响JDK17及以上版本，漏洞位于 OpenJDK HotSpot 针对 x86-64 处理器 AVX-512 VBMI 指令集优化的 Base64 解码汇编代码中。当处理包含特定尾部填充字符输入时，输出长度计算会发生下溢，导致 evmovdqub 指令的写入掩码变为全 1，从而将 64 字节数据写入一个仅 50 字节的缓冲区，造成约 62 字节的堆越界写入，满足特定利用条件时，可造成远程代码执行。

（完整漏洞情报请查阅https://x.threatbook.com/v5/vul/XVE-2026-99068）

攻击者成功利用此漏洞可在受影响服务器上执行任意代码，亦可导致子进程崩溃、业务中断。建议受影响用户尽快修复。

漏洞处置优先级(VPT)

**综合处置优先级：高** 风险

|     |     |     |
| --- | --- | --- |
| 基本信息 | 微步编号 | XVE-2026-99068 |
| CVE编号 | CVE-2026-114938 |
| 漏洞类型 | 远程代码执行 |
| 利用条件评估 | 利用漏洞的网络条件 | 远程  |
| 是否需要绕过安全机制 | 要   |
| 对被攻击系统的要求 | 受影响硬件是支持 AVX-512F、AVX-512BW、AVX-512 VBMI 和 BMI2 指令集的 x86-64 处理器。 |
| 利用漏洞的权限要求 | 无须用户权限 |
| 是否需要受害者配合 | 否   |
| 利用情报 | 是否有POC | 是   |
| 已知利用行为 | 暂无  |

漏洞影响范围

|     |     |
| --- | --- |
| 产品名称 | OpenJDK |
| 受影响版本 | Oracle Java SE: JDK<=8u511b33-perf(仅 perf 企业性能包版本；JDK 8 标准线不受此漏洞影响)、17.0.6<=JDK<=17.0.21.0.3、21<=JDK<=21.0.13.0.3、25<=JDK<=25.0.5.0.3、27<=JDK<=27.0.1.0.3<br><br>Oracle GraalVM for JDK: 17.0.6<=JDK<= 17.0.21.0.3、21<=JDK<= 21.0.13.0.3<br><br>Oracle GraalVM Enterprise Edition: JDK<=21.3.20.0.3 |
| 有无修复补丁 | 有   |

漏洞复现

目标为已运行的 OpenJDK 17.0.6 且硬件是支持 AVX-512F、AVX-512BW、AVX-512 VBMI 和 BMI2 指令集的 x86-64 处理器。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2be496d0cb2c6d47.png)

修复方案

### 官方修复方案

官方已发布修复方案，请访问链接下载：

https://jdk.java.net/27/

微步产品支撑

微步漏洞情报于2026-11-18收录该漏洞。

微步下一代威胁情报平台NGTIP及X情报中心已于漏洞收录时向漏洞订阅用户推送该漏洞情报，并将持续推送后续更新；对于已经录入资产的用户，支持实时自动化排查受影响资产。

漏洞情报 · 目录
