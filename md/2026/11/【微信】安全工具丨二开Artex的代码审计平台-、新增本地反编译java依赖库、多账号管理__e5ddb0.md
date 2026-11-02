---
title: 【微信】安全工具丨二开Artex的代码审计平台 、新增本地反编译java依赖库、多账号管理
source: https://mp.weixin.qq.com/s/MIL9u5sWrRA2ruaDXMaTKA
source_host: mp.weixin.qq.com
clip_date: 2026-11-03T01:08:15+08:00
trace_id: a8aed99a-8687-4727-b4d9-53acbef9c5c1
content_hash: 70a3855aa690818528ab48ea3983553a8061ca99f78e3ef6f03b101b800f347d
status: synced
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: SCA Audit 是基于 Artex 二次开发的 LLM 多 Agent 静态代码审计平台（Go + Next.js），新增本地反编译 Java 依赖库与多账号管理。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 40c75244-d011-8172-aca2-e64e9f3aefea
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SCA Audit 是基于 Artex 二次开发的 LLM 多 Agent 静态代码审计平台（Go + Next.js），新增本地反编译 Java 依赖库与多账号管理。
> 
> - **多 Agent 编排：** planner 是唯一意图生成者，默认 3 个 worker 并行读代码，事件驱动闭环唤醒；planner 持有跨唤醒共享的 todolist，保证"先验入口鉴权、再追参数可控、后沿调用链到 Sink"的审计链不乱序。
> - **双图架构：** 全局共享的资产图（app/endpoint 等节点带 url/method/params/permission）与每任务独立的探索图（goal/intent/fact/finding 血缘链）通过 exploration_anchors 关联，报告条目可指回源头。
> - **权限判定规则：** 接口权限分六档，按网关白名单→鉴权注解→自研鉴权→中间件分组的优先级判定；只验 token 的中间件兜底路径记为"登录用户"而非"管理员"，无任何鉴权且不在白名单的接口一律按"内部接口"处理。
> - **误报控制：** 缺陷结论必须带文件:行号与代码片段，禁止仅凭版本命中 CVE 或字符串拼接上报；依赖漏洞需同时满足版本命中、调用点可达、入参可控三条件才登记；独立复核 Agent 输出 confirmed/refuted/inconclusive 三态结论。
> - **安全边界：** 四层只读设计——工具层仅提供 7 个本地文件工具（无 Bash/WebFetch/MCP）、装配层不注入流量与自定义工具、按名字黑名单兜底剔除、对 Write/Edit 系列序列化输入做 deny/ask 拦截。

**蓝星安全** *2026年11月3日 00:01*

**点击上方蓝星安全关注我**

**获取资料，请扫码下方二维码加入知识星球**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af8fd195e1df1a7f.png)

## 一、简介

SCA Audit 是一个 **LLM 多 Agent 驱动的静态代码审计平台**，后端 Go、前端 Next.js， **二开 artex 的代码审计平台，新增本地反编译 Java 依赖库、多账号管理**。所以它是在既有代码审计底座上二次开发而成，并非从零写起，并补上了“Java 依赖可达性”和“团队协作”两块。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ed0bfa29e39234c.png)

## 二、核心功能

### 2.1. 多 Agent 编排：把“审计”拆成可并行的意图

平台采用分层编排，并非让“一个 Agent 从头读到尾”：

-   **goals**
    
    ：拆解目标、识别审计范围；
    
-   **planner**
    
    ：规划者，也是 **唯一** 的意图生成者；
    
-   **worker**
    
    ：执行者，可以有多个（默认 3 个），各自领一条意图去读代码；
    
-   **mainagent**
    
    ：人在环路，随时可以插话、纠偏；
    
-   **独立审计 / 漏洞复核**
    
    ：两个“单脑 Agent”，一个从代码结构走到报告，一个只负责复核某一条漏洞。
    

引擎是 **事件驱动** 的闭环：图一变就唤醒 planner，planner 派意图，worker 领意图执行并写回，写回又触发下一轮，直到目标被证明。

这里有个很关键的工程细节： **planner 持有一份跨唤醒共享的 todolist**。真实审计链是有前后依赖的：先确认入口未鉴权，才去追参数可控性，再沿调用链走到 Sink。每轮只派“前置已完成”的下一步，审计链才不会乱序、重复。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/99876b6248869a38.png)

### 2.2. 双图架构：资产图 + 探索图

这是整个平台最有辨识度的设计。

**资产图（全局共享）** 是跨任务的资产真值库： `app` （应用）、 `endpoint` （接口），以及保留的域名、IP、服务等节点。接口节点带 `url / method / params / permission / file / line` 。

**探索图（每任务独立）** 记录“怎么查的”： `goal / intent / fact / finding / hint` 通过 `spawns / derived_from / yields / proves` 连成血缘链。

两张图通过 `exploration_anchors` 关联：从“探索方向”能看它查了哪些接口，从“某个接口”也能反查它被哪些意图读过、得出过哪些事实。这直接支撑了 **资产测试覆盖度** 和力导向的 **资产覆盖图**。

对交付来说，这意味着报告中的条目不再是孤立的，而是一条条能指回源头的证据链。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e054fcf10de82f5e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0521e880cd3f9620.png)

### 2.3. 接口权限判定：本平台的核心产出

很多代码审计工具能找漏洞，却回答不了“这个接口谁能调”。SCA Audit 把每个接口的权限分成六档：

公开 / 注册用户 / 登录用户 / 管理员权限 / 内部接口 / 其他

判定依据按优先级排：

1.  网关白名单（最外层，命中即“公开”）；
    
2.  类/方法级鉴权注解（ `@PreAuthorize` 、 `@Secured` 等）；
    
3.  自研鉴权工具类与拦截器；
    
4.  路由分组与中间件注册范围。
    

有两条规则特别值得注意，都是按“代码实际生效”的边界记的：

-   **中间件兜底会骗人**
    
    ：网关只验 token 有效性的路径，后端如果没注解，实际权限是“登录用户”，不是“管理员权限”。这类“标注权限 ≠ 实际权限”的接口会被单独报出来；
    
-   **没看到任何鉴权校验、又不在白名单豁免清单里的接口，一律按“内部接口”处理**
    
    。未鉴权、内网专用、调试/管理接口，往往就是最重要的发现。
    

这两条比“多扫几个漏洞”更接近真实代码审计的价值。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b1cac15187e9652.png)

### 2.4. 数据流追踪：从参数到 Sink，而不是只看模式

传统 SAST 的常见问题是“字符串拼接就报”，审计人员要花大量时间排除误报。

SCA Audit 要求 Agent 读完整条数据流： **参数从哪来 → 过没过校验 → 到没到 Sink**。每条缺陷结论必须带 文件:行号 和代码片段，方便直接跳到源码核对。

它也明确禁止“仅凭版本命中 CVE、或用了字符串拼接就上报”——嫌疑项只能记为“存疑/待核实”。这条约束看似简单，实际上决定了报告能不能直接用。

### 2.5. 独立复核：三态结论，主动证伪优先

从漏洞列表或详情页可以手动发起复核。平台会拉一个 **独立的复核 Agent 会话**，只复核这一条漏洞：重新核对触发路径是否可达、危险输入是否可控、关键校验是否真的缺失、原证据是否真实存在且没有断章取义。

结论只有三种：

-   **confirmed**
    
    ：路径、可控输入、危险操作三者闭合，状态自动改为“已确认”；
    
-   **refuted**
    
    ：证据被证伪或不足以支撑结论，状态改为“误报”；
    
-   **inconclusive**
    
    ：缺源码或证据，无法判定，必须写清缺什么，状态不变。
    

原证据与报告始终保留，复核只新增独立结论。同一漏洞正在复核时，复用已有会话，不重复消耗 Token。

“主动证伪优先”这个设计很合理：安全审计里， **证明一个漏洞不成立，和证明它成立同样有价值**。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2fd47ddc8f916b40.png)

### 2.6. 第三方依赖：清单、索引与按需反编译

Java 项目的 SCA 审计，难点从来不是“有没有漏洞”，而是“这个依赖到底用没用、调没调到”。

平台采用分三步的处理方式，不会一开始就反编译整个仓库：

1.  `Grep ../deps/index/classes.txt`
    
    ，先定位“这个类在哪个依赖里”（成本很低）；
    
2.  `list_dependencies`
    
    看坐标、版本与源码状态；
    
3.  只对确有必要的那一个依赖调 `ensure_dependency_source` ，把它变成可读源码并返回落盘路径，再由 Agent 自己 `Read` / `Grep` 。
    

反编译工具优先 Vineflower，CFR 兜底；也支持把本地 Maven 仓库只读挂进来，按 `group:artifact:version` 硬链接取 jar。README 里有个很实在的数字：一个 1.7 MB 的 jar 反编译要 40~60 秒，所以平台 **不提供“全部反编译”**。

可达性判定也定得很严格，三步缺一不可：

-   版本命中已知漏洞区间（只是候选）；
    
-   调用点可达（业务代码真的 import / 调用了）；
    
-   入参可控（来自请求或外部数据，而不是常量、内部可信值）。
    

三步全过才登记为漏洞，否则只能算“存疑”。

### 2.7. 安全边界：把“只读”落实到工具装配层

这是整个项目最值得同行借鉴的部分。

**工具侧**：审计 Agent 的通用工具只从 7 个本地文件工具构造—— `Read / Write / Edit / MultiEdit / LS / Glob / Grep` 。 **没有 Bash，没有 WebFetch / WebSearch，也没有 MCP**。

**装配侧**： `hostTools()` 不返回流量工具、自定义工具与 MCP； `assembly.go` 不展开 MCP 服务器，所以连 `mcp__*` 都不会出现在工具列表里。

**兜底层**：即便有人往数据库或可见性配置里塞了危险工具， `AugmentTools` 最后一步会按名字剔除—— `bash` 、 `webfetch` 、 `curl` 、 `nmap` 、 `sqlmap` 、 `browser*` 、 `mcp__*` 、 `traffic_*` 、子代理工具等一长串。

**写入侧**：被测源码是证据，任何改动都会让结论不可复现。平台内置拦截规则，对 `Write/Edit/MultiEdit` 的序列化输入做匹配：系统破坏性命令、数据库破坏性操作、HTTP DELETE、清空/删除类路径、数据外泄管道；命中 `deny` 直接拒绝， `ask` 则挂起等人工裁决。

这套“工具层不提供 + 装配层不注入 + 黑名单兜底 + 写入拦截”的四层设计，比在提示词里写一百句“不要执行命令”可靠得多。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/83b495852fb37f83.png)

### 2.8. 工程与协作：单二进制、多账号、可观测

-   **部署简单**
    
    ：Next.js 静态导出后 `go:embed` 进 Go 二进制，一个进程同时提供前端、API 与 SSE；PostgreSQL 存双图，启动时幂等跑 schema，升级“重启即迁移”；
    
-   **多账号与部门隔离**
    
    ：管理员管账号与部门；普通用户只看自己与本部门的任务；部门角色分 `owner` （可对话、建/停/删任务）与 `visitor` （只读）；
    
-   **LLM 可配置**
    
    ：支持多档位、轮询与退避，UI 里能配供应商、模型、端点；
    
-   **过程可见**
    
    ：仪表盘、任务执行过程、探索链路、发现汇总、资产覆盖图、依赖索引、拦截审批、后端日志，基本覆盖了审计员需要的观察面；
    
-   **人在环路**
    
    ：任务进行中可以对话、纠偏，不用等跑完才发现方向错了。
    

三、项目地址

地址：https://github.com/Ernket/CodeScan-Artex/

安全工具 · 目录
