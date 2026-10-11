---
title: 【看雪】开源一个自用的云手机方案 xenoid
source: https://bbs.kanxue.com/thread-293175.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-11T22:01:15+08:00
trace_id: 6087f941-e5df-45a0-9814-679810659354
content_hash: 7a0f4ead4d9498caf5032fa70f8c4c443ad5e0a3bb843f42eebe067c70257c02
status: synced
tags:
  - 看雪
  - 设备指纹
  - 风控对抗
series: null
feed_source: 看雪·Android安全
ai_summary: 开源云手机方案 xenoid（GPL-3.0）支持 Apple Silicon Mac 与 ARM ECS，集成改机、SIM 模拟、Root 隐藏与 Hook，已初步可用于风控对抗测试。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f675244-d011-8181-9e37-edb04bde85ec
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 开源云手机方案 xenoid（GPL-3.0）支持 Apple Silicon Mac 与 ARM ECS，集成改机、SIM 模拟、Root 隐藏与 Hook，已初步可用于风控对抗测试。
> 
> - **平台与部署：** 原生支持 Apple Silicon macOS 与 ARM ECS，支持多实例、OTA（尚未测试）及服务式启动。
> - **对抗能力：** 提供一键改机、位置与 SIM 模拟、全局代理（作者称理论上不可检测）、ROOT 管理与隐藏，以及驱动层模拟点击。
> - **Hook 与生态：** 内置抹除特征的 Frida 与 eBPF Hook，支持 GMS 与 TEE（keybox 需自行提供），并提供 CLI 与 MCP 接口。
> - **使用流程：** `./xenoid install-runtime` 装环境，`./xenoid init --config PATH/TO/CONFIG` 初始化，之后 `./xenoid up` 一条命令启动。
> - **现状与免责：** 已针对多款主流检测器与头部 APP 测试，达到初步可用阶段；作者不对任意 APP 的风控对抗结果作保证，仅供研究学习，可按需在现有实现上修改。

> 仓库地址： [https://github.com/Umiade/xenoid](https://github.com/Umiade/xenoid) （GPL-3.0）

功能简述：

-   原生支持 Apple silicon MacOS 以及 ARM ECS
-   支持多实例、OTA（OTA功能尚未测试）
-   一键改机、位置与 SIM 模拟
-   理论上无法被检测的全局代理
-   ROOT 管理与隐藏
-   抹了一些特征的 Frida 和 eBPF Hook 支持
-   驱动层模拟点击
-   支持服务式启动
    
-   支持 GMS 与 TEE （keybox 需要额外提供）
    
-   支持 CLI 与 MCP
    

测试了市面上做得比较好的若干检测器，和某些头部 APP，目前基本可以认为到了一个初步可用的阶段。

使用也很简单，举个在 Mac 上直接启动的例子：

```bash
# 先安装环境
./xenoid install-runtime
./xenoid init --config PATH/TO/CONFIG
 
# 后续一条命令启动即可
./xenoid up
```

具体原理和实现细节大家直接看代码就成，这里就不展开了

最后叠个甲：  
不对任何 APP 的风控对抗结果作保证，仅供研究学习之用。需要点对点分析的情况可以直接在现有实现的基础上修改

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#程序开发](https://bbs.kanxue.com/forum-161-1-124.htm) [#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm) [#系统相关](https://bbs.kanxue.com/forum-161-1-126.htm) [#源码框架](https://bbs.kanxue.com/forum-161-1-127.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)
