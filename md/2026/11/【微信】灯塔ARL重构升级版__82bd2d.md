---
title: 【微信】灯塔ARL重构升级版
source: https://mp.weixin.qq.com/s/GPHeySw_Uq8Iu6Sfpc3L6A
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T13:01:04+08:00
trace_id: 54f8bd8c-8867-4239-86de-a6d0abc79f49
content_hash: 4bfa0e4e36a6e2d2cb3baf516d68ed80d500e4abc5c5bef8ee170078812bf8a2
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
notion_page_id: 41175244-d011-8111-bd9a-f5c7195fbc4e
ioc: null
---

## 灯塔ARL重构升级版 - ARL-Next

**GSDK安全团队** *2026年11月6日 19:20*

01项目地址

```
https://github.com/buddingworld/ARL-Next2
```

02项目介绍

ARL-Next 是基于经典开源项目 ARL（资产侦察灯塔）进行 **架构重构与持续演进** 的自动化资产侦察与漏洞监控平台。

经典 ARL 用过的人都知道，它在当年确实是神器，但随着时间推移问题也暴露出来了：

大规模扫描时任务队列阻塞假死、长时间运行内存增长、依赖停留在 Python 3.6 / Vue 2 / MongoDB 3.x 时代，没有标准化的外部调度接口。

ARL-Next 针对这些工程瓶颈，做了微服务拆分与异步任务解耦，全面升级现代运行时环境与测绘工具链，并集成了 **MCP（Model Context Protocol）标准协议**，支持 AI 协同分析。

**一句话概括：打通"天眼查/ICP ➔ 资产发现 ➔ 漏洞扫描 ➔ 威胁情报追踪"全链路，Docker 极简部署，5 分钟起飞。**

![ARL-Next 全局仪表盘](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b13ec1ca9f886a27.png)

ARL-Next 全局仪表盘

ARL-Next 全局仪表盘

03核心亮点

🤖 MCP 标准协议集成：提供基于 Python 标准库的原生 MCP Server，仅注册单一工具 get_asset_profile，支持外部 Agent 通过标准协议检索单标的多维资产画像（任务下发与策略调度能力持续接入中）。（👉 MCP 配置指南）⚙️ 异步解耦并发调度：微服务拆分与独立任务队列分流，结合批量数据落库优化，保障高吞吐扫描平稳运行。🌐 多级资产组与深度融合：企业资产查询深度融入资产组管理架构，支持集团多级架构管理、多类型 ICP（网站 / APP / 小程序 / 快应用）与生态资产自动化关联及网络暴露面统一测绘。🔍 现代资产测绘基准：基于 Nmap 7.95 稳定版；内置原生 Python 敏感凭据与信息流式提取引擎。🛡️ 漏洞与代码泄露监控：持续同步权威 CVE 漏洞情报，监听 GitHub 关联代码与凭据泄露，支持基于原子更新的去重机制。⚡ 高可用运维与容错机制：集成容器健康探活、就绪轮询与异常自动重启机制，支持管理后台在线平滑升级。📦 预构建镜像加速：提供阿里云国内镜像源预编译构建制品，规避跨国网络波动导致的镜像拉取与依赖安装失败。

![威胁情报持续追踪](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/856374a6c75faf06.png)

威胁情报持续追踪

04技术栈与部署

技术栈全面对齐现代基准： **Python 3.13 / Vue 3.5 / MongoDB 7.0 / Nmap 7.95**。

绝大多数场景直接一键脚本部署，无需预先判断系统类型或网络环境——脚本会自动探测系统、安装缺失依赖并调优内核，支持容器健康探活与在线平滑升级。

**核心理念：不是重新造一个灯塔，而是把灯塔重造成一艘现代化的船。**

注：工具仅供安全研究与学习之用，若将工具做其他用途，由使用者承担全部法律及连带责任，作者及发布者不承担任何法律及连带责任。信息及工具收集于互联网，真实性及安全性自测！！
