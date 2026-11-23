---
title: 【微信】JAVA远程代码执行高危漏洞预警
source: https://mp.weixin.qq.com/s/FFiJZMjlAUTnoKtQ2r82eA
source_host: mp.weixin.qq.com
clip_date: 2026-11-23T18:56:23+08:00
trace_id: b67775a3-a8f3-47f3-b4a3-caca65db5fa5
content_hash: 258efaba228e31992236e02ddd82ff5cead7d76fe4bcac967ab3aae69fb59b65
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
notion_page_id: 42175244-d011-8146-b7a7-e8b00c94f0df
ioc:
  cves:
    - CVE-2026-114938
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**广州网警** *2026年11月20日 17:14*

11 月 17 日，境外安全研究机构 Calif 披露 了 名为 Java4Shell 的高危漏洞 （ CVE-2026-114938 ） ，该漏洞存在于 OpenJDK Base64 解码路径中， 当 攻击者向 Java 应用提交特制的 Base64 数据 时 ，可触发堆内存越界写入，造成敏感信息泄露甚至远程代码执行 ， Oracle 已紧急发布修复版本。 该漏洞 影响范围广，大量暴露于互联网的 Java 应用 ， 极易成为网络攻击的重点目标。

一、 Java4Shell 漏洞 安全风险 分析

1 、漏洞 存在于 OpenJDK 底层性能优化汇编代码中， OpenJDK 在 x86-64 平台采用 AVX-512 VBMI 指令集 对 Base64 解码 进行加速，当 输入 为 畸形 数据时， 尾部填充 区域 输出长度计算 发生数值 下溢 ， 触发约 62 字节堆内存越界写入。 该 漏洞 深度内嵌于 底层汇编代码 中， 常规组件扫描工具 无法有效检出。

2 、触发条件简单，攻击 路径较多 。攻击者仅需向 Java 应用提交 64 个字母 “A” 加 1 个 “=” （较老的 OpenJDK 17 版本为 128 个 “A” 加 “=” ）畸形字符串即可触发越界写入。 Base64 解码在身份认证、文件上传、网络消息等场景中广泛使用，攻击者可通过认证令牌、 SAML 消息、上传文件等多种入口提交恶意输入，触发路径多、利用成本低。

3 、危害后果严重，可致信息泄露 或系统遭 完全控制。攻击者通过堆内存越界写入，可覆写相邻对象元数据、读取敏感内存，造成拒绝服务，并最终实现远程代码执行 ， 甚至 完全接管服务器。 漏洞披露 方已在 Keycloak 、 Atlassian Jira 、 Atlassian Confluence 、 JFrog Artifactory 、 Jenkins 、 PingFederate 等常用产品的默认配置下验证预认证远程代码执行， Apache Kafka Broker 、 Apache Solr 、 Elasticsearch 、 Gerrit 、 Netflix Spinnaker 等产品在认证后也可被利用，基于 Spring Boot 、 Apache Struts 构建的应用同样 可以 复现。

4 、影响范围广， 重要 行业 安全威胁较大 。该漏洞影响 OpenJDK 17.0.6 及之后版本，以及 Amazon Corretto 、 Eclipse Temurin 、 Microsoft Build of OpenJDK 、 Azul Zulu 、 BellSoft Liberica 、 SAP SapMachine 、 Red Hat OpenJDK 、 Oracle Java SE 等主流发行版， Oracle 同时将 Java SE 8 的性能版 8u511b33-perf 列 入 受影响 范围 。漏洞触发需运行在支持 AVX-512 VBMI 指令集的 x86-64 处理器上， ARM64 平台不受影响 。 初步研判认为，全球范围 金融、航空、电信、政务等关键行业 受影响的 Java 应用 数量庞大。

5 、技术细节已公开， 漏洞 利用风险上升。 相关 漏洞由 安全研究机构 Calif 借助 AI 辅助发现， 其 研究 人 员 用时 约 1 小时 完成 漏洞定位、 2 小时写出 漏洞 利用代码。目前 漏洞触发 / 复现 PoC 已经公开，虽然暂未发现 漏洞公开 利用 情况 ，但随着针对具体 Java 应用的利用链被逐步 发现 ，短期内出现规模化攻击的风险较高。

二、 Java4Shell 风险防范建议

1 、全面排查资产暴露面。对 本行业 / 单位 所有运行 Java 的系统 进行 清点，核对厂商与完整构建版本，重点排查对公网或跨网络暴露的服务（如 Jira 、 Jenkins 、 Keycloak 、 Confluence 等），识别第三方产品、设备和容器中内置的 Java 组件。

2 、及时升级版本。通过可信来源获取并安装官方修复版本，将 Java SE 17/21/25/27 升级至 17.0.21.1 、 21.0.13.1 、 25.0.5.1 、 27.0.1.1 ， Oracle Java 8 performance Pack 升级至 8u513-perf ， GraalVM 应用 Oracle 2026 年 11 月关键补丁更新中的对应补丁，其他发行版参照各自安全公告。升级后重启所有相关 Java 进程，确保容器镜像和内置运行时同步更新。

3 、启用临时缓解措施。对暂时无法升级的 x86-64 环境，可通过为 JVM 增加启动参数 \-XX:-UseBASE64Intrinsics 禁用硬件加速的 Base64 编解码，或增加 \-XX:UseAVX=2 禁用 AVX-512 执行路径。 需要 注意 的是 ， ARM64 原生 JVM 不识别 \-XX:UseAVX=2 参数，传入将导致 JVM 无法启动，应严格限定在 x86 环境使用。

4 、 做好网络隔离措施 。在补丁部署前，临时限制对互联网暴露的 Java 管理控制台的外部访问，做好网络隔离、身份认证加固和访问控制，限制 Java 进程向不可信服务器发起 TLS 连接。

5 、强化 网络安全 监测。持续关注 OpenJDK 及各 发行版 安全公告， 实时监测 Web 、应用、认证与终端日志中的可疑活动， 重点关注 JVM 崩溃日志、异常重启、认证头长度异常的 base64 、异常子进程和出站连接 ， 做好日志留存和应急处置， 严防发生 重大 网络 和数据安全 事件。
