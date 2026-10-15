---
title: 【微信】Artex二开-代码审计平台
source: https://mp.weixin.qq.com/s/soTqG-WbyfhbOegv98BHig
source_host: mp.weixin.qq.com
clip_date: 2026-10-15T09:38:22+08:00
trace_id: 55fa410a-aeb6-443a-9dbb-71aadc7dc3da
content_hash: 59d5978789478b2155b44980c912f2985f15dfbc2ec7e6e81073df811f56ef52
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3fa75244-d011-813e-b2cf-c1d508db46ad
ioc: null
---

**E条咸鱼** *2026年10月15日 08:32*

## ARTEX 二开：从「AI 渗透测试」到「AI 代码审计」

> 本文介绍的开源项目 **SCA Audit** 基于 **ARTEX** 二次开发而来（沿用 AGPL-3.0），二开版本新增了「本地.m2 依赖自动反编译 + 源码级深度审计」能力。（ps：文章是ai生成的

**SCA Audit** 是一个 LLM 多 Agent 驱动的 **静态代码审计平台**：Go 单体后端（内嵌 Next.js 前端）+ PostgreSQL，一条 `docker compose up -d` 就能跑起来。

🔗 开源仓库：https://github.com/Ernket/CodeScan-Artex

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e8fba1829f17973f.png)

* * *

## 一、出身：ARTEX 的二开

SCA Audit 不是从零写的，它 **基于 ARTEX 二开** （沿用 AGPL-3.0 许可证）。ARTEX 原本是 AI 自主渗透测试方向的平台，而这版二开的方向很明确—— **保留它的 Agent 编排内核，把能力面整体转向静态审计**。

保留的是内核：

-   • **双图架构**：资产图（系统对外暴露了什么）+ 探索图（结论是怎么一步步推导出来的）
    
-   • **多角色分工**：目标拆解 / 规划 / 执行 Agent / 主 Agent / 漏洞复核
    
-   • **事件驱动编排**：每次唤醒是全新会话，靠图与待办清单保证跨会话稳定推进
    

砍掉的部分更关键—— **平台层面彻底移除攻击性能力**：

-   • **不出网**：不发起任何网络请求，不查外部 CVE 库
    
-   • **不执行命令**：没有 Bash，没有脚本执行
    
-   • **不抓包、不回放**：没有流量工具
    
-   • **不注入外部 MCP 工具**
    

而且这不是靠提示词「约束」，是在工具装配层 **物理删除**：Agent 的通用工具集只从 7 个本地文件工具（Read / Write / Edit / MultiEdit / LS / Glob / Grep）构造，其余工具在装配最后一步被硬剥离。

一句话： **结论必须由源码证据支撑。**

## 二、新增能力：本地.m2 依赖，自动反编译、源码级审计

第三方依赖是静态审计的老大难：pom.xml 里写着 `fastjson 1.2.24` ，CVE 编号一大串……然后呢？

**版本命中 ≠ 漏洞成立。** 一个依赖漏洞是否真实，取决于三步：

| 步骤  | 要回答的问题 | 依据  |
| --- | --- | --- |
| ① 版本命中 | 坐标是否落在已知漏洞区间 | pom.xml（只是候选，不是结论） |
| ② 调用点可达 | 漏洞类真的被业务代码调用了吗 | 代码里 import / 调用点 |
| ③ 入参可控 | 命中的方法参数来自外部输入吗 | 调用链上的数据流 |

后两步都要读 **依赖内部的源码**，而 jar 是编译产物，读不了——这就是这个二开版本要解决的核心问题。

### 解法：直连本地 Maven 仓库，按需反编译

配一次就行，指向你本机的 `.m2` 仓库（Windows 用户把路径换成 C:/Users/<你>/.m2/repository）：

```json
{
  "java": {
    "java_path": "/usr/bin/java",
    "cfr_jar": "/app/data/tools/cfr-0.152.jar",
    "local_repo": "/root/.m2/repository"
  }
}
```

配好之后，审计任务可以按 `group:artifact:version` 坐标 **直接从本地仓库取 jar**——用硬链接取进任务目录，仓库本身一个字节都不写入（只读）。 **一次配置，每个任务受益**，再也不需要手工上传依赖包。

### 设计核心：按需反编译，而不是全量反编译

反编译很贵：实测一个 1.7MB 的 log4j-core 就要 **40~60 秒**。所以整个功能被拆成成本完全不同的两段：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/712c7efe2ff49bf5.png)

-   • **入库（Ingest）**：只扫 zip 中央目录，建立依赖清单与 **类名索引**，永不反编译——上千个 jar 也只要几秒；
    
-   • **按需取源（Materialize）**：只对 **被点名的那一个** jar 执行。
    

Agent 读依赖源码的路径因此被固化成三步：先 `Grep` 类名索引定位「这个类在哪个依赖里」（最便宜），再用 `list_dependencies` 看坐标与源码状态，最后只对确有必要的那 **一个** 依赖调 `ensure_dependency_source` ——它把该 jar 变成可读源码并返回落盘路径，Agent 随后用 Read / Grep 细读（不会把整包代码倒进上下文）。

取源还有优先级： **真源码优先**——本地仓库里如果有官方 `-sources.jar` ，直接读原始源码，这是最便宜的路径；没有才走反编译，引擎优先 Vineflower（JRE 17+），CFR（JRE 6+）兜底。

反编译产物按 jar 的 **sha256 内容寻址缓存**：同一个依赖，跨任务只反编译一次。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0ddbe4276bcead7f.png)

上图就是这个能力的前端界面：依赖清单（坐标 / 类数 / 大小 / **源码状态**）、类名索引、按需反编译入口。注意统计栏——「依赖 8 个 · 类索引 6179 个 · 已可读源码 3 个」： **默认一个都不反编译**，成本永远花在刀刃上。

> 附带一个容易被忽视的安全设计：反编译出来的依赖源码会被标记为「反编译产物 ≠ 原始源码」（行号、结构可能不同，引用需注明）；依赖里的注释与字符串一律视为 **被审计对象**，而不是给 Agent 的指令——这是针对第三方代码的提示注入防护。

## 三、产出长什么样

和扫描器给一堆「规则命中」不同，平台的产出是这样的：

**接口清单 + 每条接口所需权限** （公开 / 注册用户 / 登录用户 / 管理员权限 / 内部接口 / 其他）——这是「这个系统对外暴露了什么」的答案：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8e36dcd8ff5b08f0.png)

**缺陷结论**：每条都带 文件:行号 + 代码片段 + 所需权限，不含任何运行时证据：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bc51a511f2e52794.png)

**探索图**：我们是怎么一步步查到结论的，每一步工具调用都有留痕、可回溯、可复算：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1609de5922823cd2.png)

另外还有一道独立工序—— **漏洞复核**：对已登记的漏洞开独立会话重新判定，结论三态（确认成立 / 证伪 / 无法判定）回写漏洞状态，专门治误报。

## 四、快速上手

```bash
git clone https://github.com/Ernket/CodeScan-Artex.git
cd CodeScan-Artex
docker compose up -d
# 打开 http://localhost:7878
```

需要配置一个 LLM（Claude / OpenAI 兼容端点均可，支持在 UI 里配置）。想先看效果，直接打开在线 Demo——内置一套完整的 Java 审计演示数据，无需部署。

* * *

**项目地址**：https://github.com/Ernket/CodeScan-Artex  
**技术栈**：Go（单体二进制，内嵌前端）/ Next.js / PostgreSQL / 多 Agent LLM 编排  
**许可**：AGPL-3.0（继承自上游 ARTEX，二次开发同样开源）

本项目用于审计你拥有或已获得明确授权的代码。LLM 结论可能漏报、误报，所有结论请以人工复核为准。

网络安全 · 目录

作者提示: 内容由AI生成
