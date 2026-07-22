---
title: 【微信】新增受影响场景，Fastjson远程代码执行漏洞三次更新
source: https://mp.weixin.qq.com/s/VORXbD0VvNio7ETVhiGr9w
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T11:44:47+08:00
trace_id: 462de0e6-1f86-445d-8b21-c3c833f811c5
content_hash: d0537f70a352ac634f8c5a8807817fd0d3d598d058552af1edc0ee8125117890
status: summarized
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Fastjson存在远程代码执行漏洞，影响1.2.66至1.2.83版本，攻击者可无需权限远程执行代码，需立即启用安全模式或升级版本。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: null
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Fastjson存在远程代码执行漏洞，影响1.2.66至1.2.83版本，攻击者可无需权限远程执行代码，需立即启用安全模式或升级版本。
> 
> - **漏洞类型与利用方式**：远程代码执行漏洞，攻击者通过发送特制恶意JSON数据触发，无需依赖第三方类库即可在目标服务器执行任意代码。
> - **受影响版本与环境**：Fastjson版本1.2.66到1.2.83均受影响，在Spring Boot FatJar等Java应用场景中可复现，涉及Linux/macOS下JDK8/17/21/25等多个版本。
> - **利用前提与条件**：攻击无需用户权限或受害者配合，但目标服务器必须未启用Fastjson安全模式；Windows下仅JDK8可触发。
> - **修复与缓解措施**：临时方案包括启用安全模式（通过代码、JVM参数或配置文件）、迁移至Fastjson 2.x版本或切换noneautotype版本；防护设备可拦截包含特定类型的请求。

**微步在线研究响应中心** *2026年7月22日 11:24*

漏洞概况

Fastjson 是 Alibaba 开源的一款基于 Java 的快速 JSON 解析器/生成器，广泛用于 Java 应用的 JSON 序列化与反序列化。

近日，微步情报局监测到互联网披露了Fastjson 远程代码执行漏洞。经分析，Fastjson 存在远程代码执行漏洞，远程攻击者通过向使用受影响版本 Fastjson 的应用发送特制的恶意 JSON 数据，无需依赖任何第三方类库，即可在目标服务器上执行任意代码。

此漏洞无须用户权限，攻击者成功利用此漏洞可远程攻击者可在未启用安全模式的目标服务器上执行任意代码，直接威胁系统机密性、完整性与可用性，可导致服务器被完全控制。建议受影响用户尽快修复。

漏洞处置优先级(VPT)

**综合处置优先级：** 高风险

|     |     |     |
| --- | --- | --- |
| 基本信息 | 微步编号 | XVE-2026-39684 |
| CVE编号 | 无   |
| 漏洞类型 | RCE(远程代码执行) |
| 利用条件评估 | 利用漏洞的网络条件 | 网络可达 |
| 是否需要绕过安全机制 | 否   |
| 对被攻击系统的要求 | 未启用 Fastjson 安全模式(SafeMode) |
| 利用漏洞的权限要求 | 无须用户权限 |
| 是否需要受害者配合 | 否   |
| 利用情报 | POC是否公开 | 是   |
| 已知利用行为 | 微步威胁感知平台 TDP 已捕获在野利用行为 |

漏洞影响范围

|     |     |
| --- | --- |
| 产品名称 | Fastjson |
| 官方通告影响范围 | 1.2.68 <= version < =1.2.83 |
| 微步验证实际影响范围 | 1.2.66/1.2.67 jar:file 也能复现。而且 fastjson更低版本有其他安全问题，建议 漏洞 管控时按照 version < =1.2.83 排查 。 |

漏洞复现

jar:http 远程拉取在 Spring Boot FatJar 场景中可作为第一阶段资源获取。在 Linux/macOS 下，可进一步借助 /proc/self/fd 或 /dev/fd 转为 jar:file，形成二阶段 fd bridge RCE。

最新验证结论为：

1、Spring Boot 常见内嵌容器 Tomcat、Jetty、Undertow 均受影响（ 说明：这里指 fd bridge 链路已验证，不等价于所有容器都支持单发直接 jar:http RCE。）

2、Linux/macOS：JDK8/17/21/25 等已验证可 RCE。

3、Windows：JDK8 可触发。 Windows 缺少 /proc/self/fd 或 /dev/fd 同形态路径，高 JDK 不受影响。

4、1.2.83_noneautotype 不是 “关闭 autoType 但仍可绕过”的普通配置状态，而是 artifact 行为发生变化，safeMode 在危险路径前直接终止，因此在当前已知利用链路下不受此漏洞影响。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/634b4c00e6ec4b91.png)

修复方案

### 临时缓解措施

1、官方暂未发布该漏洞补丁及修复版本,鉴于 fastjson 1.x 系列已停更，建议迁移至 Fastjson 2.x 版本

2、可通过以下任意一种方式启用 Fastjson 的安全模式(SafeMode):

-   代码启用： ParserConfig.getGlobalInstance().setSafeMode(true)
    
-   JVM 启动参数启用： -Dfastjson.parser.safeMode=true
    
-   配置文件启用： fastjson.parser.safeMode=true
    

3、使用防护类设备拦截带有如下内容的POST、JSON请求：

·@type":"jar:file:.

·@type":"jar:http:..

4、可 切换 到 noneautotype 版本 ， Maven 坐标示例：

com.alibaba:fastjson:1.2.83_noneautotype

微步产品支撑

1、微步漏洞情报于 202 6-0 7 \- 20收录该漏洞 。

2、微步下一代威胁情报平台NGTIP及X情报中心已向漏洞订阅用户推送该漏洞情报，并将持续推送后续更新；对于已经录入资产的用户，支持实时自动化排查受影响资产。

3、微步威胁感知平台 TDP已于 2026 \- 0 7 \- 20支持检测，检测ID： **S3100181015** ，模型 /规则高于： **20260720000000** 可检出。

**4、微步威胁防御系统 OneSIG已支持防护，规则ID：3100181015。**
