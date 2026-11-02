---
title: 【微信】二开artex的代码审计平台 | 多 Agent 并行审计源码，资产覆盖可视化！
source: https://mp.weixin.qq.com/s/lJ9MQivbxQMHfLrpXXx_kg
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T09:58:08+08:00
trace_id: 4db9005e-9bdf-48f6-a247-bb503fdc2dac
content_hash: fe871530a2766cef1e4ace405f0db0de964336f1fb7402fa0bad130eb9a812d6
status: synced
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：SCA Audit 用多 LLM Agent 并行只读审计代码仓库，产出资产图与探索图两张可回溯结论图，并通过工具装配层与拦截规则实现纯静态分析的安全边界。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 40c75244-d011-8186-886d-e3108140aa35
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：SCA Audit 用多 LLM Agent 并行只读审计代码仓库，产出资产图与探索图两张可回溯结论图，并通过工具装配层与拦截规则实现纯静态分析的安全边界。
> 
> - **审计方式：** 把「审计一个仓库」拆成可并行的意图，交给多个 Agent 静态读源码，结论靠完整数据流（参数来源 → 校验 → Sink）判断，而非模式匹配；产出为接口清单、所需权限、带文件：行号的缺陷结论和依赖可达性判定。
> - **误报复核：** 由独立会话对漏洞逐条核对依据，给出三态结论回写状态；探索图记录每次工具调用留痕，结论可复算。
> - **三层工具防线：** Agent 仅有 Read/Write/Edit/MultiEdit/LS/Glob/Grep 七个本地文件工具；装配层不注入流量、自定义工具与 MCP（连 mcp__* 都不出现）；最后按名字黑名单兜底剔除 bash、curl、nmap、浏览器自动化等危险工具。
> - **写入拦截规则：** 按优先级匹配——`../source/` 拒绝写入（保证被测源码只读、结论可复现）、工作区外写入转人工审批、`https?://` 拒绝（平台不出网），仅覆盖 Write/Edit/MultiEdit，被拦调用进入人工裁决。
> - **部署方式：** 支持 `./install.sh` 一键安装（Docker 全容器或本地编译）、Docker Compose 手动部署、预编译二进制、源码编译内嵌前端的单二进制及跨平台 Release 打包，默认访问 `http://localhost:7878`。

**乌雲安全** *2026年11月2日 09:17*

## 这是什么

SCA Audit 把「审计一个代码仓库」拆成 **可并行的意图**，交给多个 LLM Agent 分工静态读完源码，把结果写成两张可回溯的图： **资产图** （这个系统对外暴露了什么）与 **探索图** （我们是怎么一步步查到结论的）。

它和扫描器的区别在于 **产出物**：

|     | 扫描器 / SAST 规则 | SCA Audit |
| --- | --- | --- |
| 输入  | 代码  | 代码（**只读**） |
| 产出  | 规则命中列表 | **接口清单 + 每条接口所需权限**<br><br>、缺陷结论（带 文件:行号 + 代码片段）、依赖可达性判定 |
| 判断依据 | 模式匹配 | 读完整条 **数据流**：参数从哪来 → 过没过校验 → 到没到 Sink |
| 误报处理 | 人工逐条看 | **独立会话复核**<br><br>，结论三态回写漏洞状态 |
| 过程  | 黑盒  | 探索图 + 每次工具调用留痕，可复算 |

**只做静态分析。** 平台不发起任何网络请求、不执行任何系统命令、不做任何运行时验证——结论必须由源码证据支撑。这不是靠提示词约束，而是 **在工具装配层物理删除** （见下节）。

## 安全边界（红线）

`agent/codeaudit_tools.go` 是「Agent 能调用什么」的唯一真源。工具来源侧是 **三层防线**，缺一不可；写入侧另有拦截规则兜底：

**① Agent 的通用工具集只从 7 个本地文件工具构造**

```powershell
Read · Write · Edit · MultiEdit · LS · Glob · Grep
```

没有 `Bash` 。没有 `WebFetch` / `WebSearch` 。其余全是平台自己的领域工具（登记资产、写回图、登记漏洞、依赖查询、复核结论）。

**② 装配层不再注入危险来源**

`server/hostTools()` 不返回流量工具、自定义工具与 MCP； `server/assembly.go` 不再展开 MCP 服务器——所以 **连 `mcp__*` 工具都不会出现在 Agent 的工具列表里**。系统设置里的「MCP」「自定义工具」入口只保留历史数据查看。

**③ 兜底黑名单：配置也绕不过去**

即使有人往 DB 的 `tools` 表、可见性配置或宿主工具里塞进危险工具，也会在 `AugmentTools` 的最后一步按名字剔除：

```cs
var codeAuditDeniedTools = []string{
    "bash", "shell", "shell_session", "sleep", "monitor",
    "webfetch", "websearch", "web_search", "fetch", "curl", "wget", "http", "http_request",
    "command", "script",              // 自定义工具的 command / script kind（http kind 的 key 就是 "http"，已在上行）
    "task", "taskoutput", "taskstop", "tasklist",   // 子代理会把上述能力递归带进去
    "mcp__*", "traffic_*",
    "intercept_execute", "intercept_approve",
    "browser*", "playwright*", "selenium*",
    "nmap*", "nuclei*", "sqlmap*", "ffuf*", "dirsearch*", "hydra*", "metasploit*",
    "create_custom_tool", "update_custom_tool", "create_mcp", "update_mcp", "test_custom_tool",
}
```

**④ 写入侧还有拦截规则**

被测源码是审计证据，任何改动都会让结论不可复现。拦截规则按优先级匹配工具输入，首条命中即生效：

| 优先级 | 规则  | 匹配  | 动作  |
| --- | --- | --- | --- |
| 30  | 被测源码只读 | `\.\./source/` | 拒绝  |
| 20  | 工作区外写入需审批 | `\.\./` | 转人工 |
| 10  | 平台不出网 | `https?://` | 拒绝  |

拦截范围只覆盖写入类工具（ `Write` / `Edit` / `MultiEdit` ）——读工具的常规路径本来就是 `../source` 、`../deps` 。被拦下的调用会挂在任务详情的「拦截审批」里等人工裁决。

## 截图预览

以下截图取自 `NEXT_PUBLIC_MOCK=1` 的离线 Demo（无后端、内置 `acme-mall` 演示数据）。完整交互见在线 Demo。

仪表盘（总览 / Token 消耗 / 活动流）

![仪表盘](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c43153aab7d52bfa.png)

任务列表

![任务](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1996528704ee82c5.png)

任务 · 执行过程（会话 / 工具调用）

![执行过程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/36ad03c33bc6d9f3.png)

探索链路（意图 · 事实 · 漏洞血缘）

![探索链路](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7bb5a0cd4ea40789.png)

发现（跨任务漏洞汇总 · 按严重度 / 任务分组）

![发现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00809d8800a4cc61.png)

漏洞复核（三态结论 + 逐条核对依据）

![复核](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6bfbf9f0ddde0790.png)

测试资产 · 接口与 **所需权限**

![接口资产](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0824d63413b0708f.png)

资产覆盖图（力导向 · 已测高亮 · 节点折叠）

![资产覆盖图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39369ceb1362f6ee.png)

第三方依赖（清单 / 类名索引 / 按需反编译）

![依赖](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a714c0f101cee323.png)

人在环路对话

![对话](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee7ecd439296e53a.png)

Agent 管理（提示词 / 工具 / 技能可见性）

![Agent](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bc7f054ea2c234b5.png)

LLM 配置（多档位 · 轮询与退避）

![LLM](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/19a3215f0df903c5.png)

后端日志（工具调用 / 拦截 / 依赖索引）

![日志](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e95d22f335a72af0.png)

使用

## 一键安装脚本

```bash
cd ARTEX
./install.sh
```

脚本自动检测并安装 Docker，提供两种运行模式：

1.  Docker 全容器部署：设置 Postgres 密码，自动生成环境配置， `docker compose up -d` 启动
    
2.  本地编译运行：选择数据库，生成配置文件，编译单二进制程序 部署完成访问 `http://localhost:7878` ，首次进入 `/setup` 设置管理员密码。
    

## Docker Compose 手动部署

```bash
cd ARTEX
cp .env.example .env
# 修改.env，填写数据库密码、大模型API密钥
docker compose up -d
```

访问 `http://localhost:7878` ，挂载目录持久化技能与审计数据。

## 预编译二进制包

```javascript
下载对应系统压缩包，解压得到程序、启动脚本与配置模板。
```

## 源码编译单二进制

```bash
# 前端打包
cd web && npm ci && npm run build:static && cd ..
cp -r web/out server/webui/dist
# 编译内嵌前端的二进制
CGO_ENABLED=0 go build -tags embedui -o artex ./cmd/artex
./start.sh
```

## 跨平台打包 Release

```bash
./build.sh --release
```

自动编译 Linux、macOS、Windows 多架构压缩包，增加 `--upx` 可压缩二进制（部分环境存在兼容性问题，按需开启）。

项目地址

https://github.com/Ernket/CodeScan-Artex/
