---
title: 【微信】Agentic AI 红队检查清单 —— 侦察与发现（Recon & Discovery）
source: https://mp.weixin.qq.com/s/Nga1eahFLdlGHj-s1jmwuQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-19T19:44:09+08:00
trace_id: e6c1b240-c377-4a8e-84b6-c42a5627060d
content_hash: 9c98fa2e0ee557b71565c91162be34f24ec33c3e214dc1ac6b7b010fbdf2705c
status: synced
tags:
  - 微信
  - 安全工具
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**TL;DR：** 一份 Agentic AI 侦察阶段红队清单，给出 AI-REC-001~012 共 12 项可复现测试，目标是画出目标“资产与能力”地图，供后续攻击类类别取用。"
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3fe75244-d011-8171-9282-df3965c3b84e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 一份 Agentic AI 侦察阶段红队清单，给出 AI-REC-001~012 共 12 项可复现测试，目标是画出目标“资产与能力”地图，供后续攻击类类别取用。
> 
> - **清单结构：** 全表共 222 项测试，分为 20 个类别；本次是第 1 类“侦察与发现”，共 12 项。风险等级方面：低危 9 项，中危 3 项（AI-REC-004/010/011）。检测方式方面：反射型 8 项，盲测型 3 项（AI-REC-007/009/010），反射与盲测结合 1 项（AI-REC-006）。
> - **最值得关注的两项中危检查：** AI-REC-004 通过 GitHub dork 搜索 AGENTS.md、SKILL.md 和 .claude/ 目录，获取泄漏的系统提示词、工具 schema 与内嵌凭据；AI-REC-011 下载 JS/SPA bundle 与 sourcemap，用 `sk-`、`/invocations`、`/mcp` 等特征进行 grep，还原隐藏端点和密钥。
> - **端口与服务指纹：** 使用 naabu 扫描 5000（MLflow）、6333（Qdrant）、8265（Ray）、8888（Jupyter）、9000（MinIO）、19530（Milvus）、9200、6379、5432 等端口，再用 nmap/nuclei 与已知路径，如 `/api/2.0/mlflow/experiments/search`、`/collections`、`/api/jobs/`，确认服务名、版本和认证状态。
> - **取证纪律：** 只有反射型或带外证据，才能标记为“已确认”；盲测型（AI-REC-007/009/010）仅凭一次结果只能标记为“疑似”，还需补充状态变化或带外回调证据。
> - **常见问题：** crt.sh 通配查询必须写成 `%25.target`（URL 编码的 %）；直接写 `%.target` 常会被静默忽略，从而误判“无证书资产”。

**APT-101** *2026年10月19日 19:06*

#AI#RED#渗透测试#Agentic

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dd5fe1e10db5a46f.png)

> 来源：《An agentic AI red team checklist: 222 tests, WSTG-style》，Ravi Rajput，infosecravi.com，2026-10-08。 全表 222 项测试 / 20 个类别；本文件为第 1 类「侦察与发现」共 12 项（AI-REC-001 ~ AI-REC-012）。 风险等级分布：低 9 项 / 中 3 项（AI-REC-004、AI-REC-010、AI-REC-011）。 检测方式分布：反射型 8 项 / 盲测型 3 项（007、009、010）/ 反射｜盲测 1 项（006）。 术语约定：target、api.target 为目标资产占位符；<COLLAB> 为带外监听地址；TARGET 为已知存活主机。 保留英文：测试编号、框架编号（LLM/ASI/MCP/AST/ML06:2023）、MITRE ATLAS 编号、工具与产品名、命令与参数，均按原表保留英文。

* * *

## 一览

| 测试编号 | 测试名称 | 风险等级 | 检测方式 | 框架映射 |
| --- | --- | --- | --- | --- |
| AI-REC-001 | 被动 OSINT 技术栈指纹识别（文档、招聘信息、GitHub、模型卡、crt.sh） | 低   | 反射型 | LLM02 敏感信息泄露 |
| AI-REC-002 | 子域名与资产枚举（subfinder、amass、httpx） | 低   | 反射型 | LLM02 敏感信息泄露 |
| AI-REC-003 | 公开代码中的 AI 技术栈特征检测（grep openai/langchain/mcp/qdrant/mlflow） | 低   | 反射型 | LLM02 敏感信息泄露 |
| AI-REC-004 | 公开仓库中泄漏的 AGENTS.md / SKILL.md / 系统提示词 | 中   | 反射型 | LLM07 系统提示词泄露 |
| AI-REC-005 | OpenAPI / GraphQL schema 与工具调用面发现 | 低   | 反射型 | LLM02 敏感信息泄露 |
| AI-REC-006 | 模型 / 框架 / 供应商识别（行为特征 + 直接询问） | 低   | 反射型｜盲测型 | LLM07 系统提示词泄露 |
| AI-REC-007 | 针对 AI 基础设施端口的主动网络扫描（naabu / nmap） | 低   | 盲测型 | ML06:2023 |
| AI-REC-008 | MLOps 服务指纹识别（MLflow / Qdrant / Weaviate / Ray / Jupyter） | 低   | 反射型 | ML06:2023 |
| AI-REC-009 | API 端点与参数枚举（ffuf） | 低   | 盲测型 | LLM02 敏感信息泄露 |
| AI-REC-010 | 认证状态测绘（未认证 / 默认凭据端点） | 中   | 盲测型 | ML06:2023 |
| AI-REC-011 | 针对 AI 端点与泄漏密钥的 JS / SPA bundle 分析 | 中   | 反射型 | LLM02 敏感信息泄露 |
| AI-REC-012 | DNS / CT 日志与 TLS 透明度基础设施发现 | 低   | 反射型 | LLM02 敏感信息泄露 |

* * *

## 12 项明细

## AI-REC-001

测试编号：AI-REC-001测试类别：侦察与发现测试名称：被动 OSINT 技术栈指纹识别（文档、招聘信息、GitHub、模型卡、crt.sh）风险等级：低

## 测试方法

1.  在文档、招聘信息、模型卡和 GitHub 组织中搜索 AI 框架 / 供应商关键词。
    
2.  查询 crt.sh / CT 日志获取主机名与 TLS 指纹。
    
3.  将发现关联成 AI 架构的节点 / 边映射图。
    

```bash
gh search code "<AI框架或供应商关键词>"                      
公开代码检索curl -s 'https://crt.sh/?q=%25.target&output=json' | jq      # CT 日志取主机名与 TLS 指纹subfinder -d target -silent                                  # 被动子域补充# Google dorking: site:target (llm|agent|langchain|mcp|openai)
```

## 预期结果

形成一份书面清单，记录已在公开制品中确认的 AI 框架、模型名称、供应商与主机。

* * *

## AI-REC-002

测试编号：AI-REC-002测试类别：侦察与发现测试名称：子域名与资产枚举（subfinder、amass、httpx）风险等级：低

## 测试方法

1.  对目标域名运行 subfinder 和 amass。
    
2.  用 httpx 解析并探测状态码、标题与技术栈。
    
3.  筛选 AI 技术栈特征，并对存活主机截图。
    

```bash
subfinder -d target -silent | httpx -silent -status-code -title -tech-detect -o live.txt
```

## 预期结果

形成存活主机清单，标注由 tech-detect 头部与标题识别出的 AI 相关服务。

* * *

## AI-REC-003

测试编号：AI-REC-003测试类别：侦察与发现测试名称：公开代码中的 AI 技术栈特征检测（grep openai/langchain/mcp/qdrant/mlflow）风险等级：低

## 测试方法

1.  使用 gh code search 和 grep.app 搜索框架关键词。
    
2.  在克隆的仓库中 grep openai/anthropic/langchain/mcp/qdrant/mlflow/ray。
    
3.  编目 SDK 使用情况及任何内联配置或密钥。
    

```bash
gh search code "langchain OR qdrant OR mlflow"
grep -RInE 'openai|anthropic|langchain|mcp|qdrant|mlflow|ray' .

grep.app 在线检索同款关键词
```

## 预期结果

确认目标所使用的具体 AI 框架、库与端点。

* * *

## AI-REC-004

测试编号：AI-REC-004测试类别：侦察与发现测试名称：公开仓库中泄漏的 AGENTS.md / SKILL.md / 系统提示词风险等级：中

## 测试方法

1.  在 GitHub 和各类 registry 中搜索 AGENTS.md、SKILL.md、.claude/ 与.cursor/ 文件。
    
2.  grep 系统提示词标记与工具 schema。
    
3.  编目暴露的工具名称、API 密钥与 MCP 端点。
    

```bash
gh search code "AGENTS.md"
gh search code "SKILL.md"
grep -RInE 'AGENTS\.md|SKILL\.md|system prompt' .

github dorks: filename:.claude  filename:.cursor 等
```

## 预期结果

获取到泄漏的指令或提示词制品，其中列出了工具、端点或内嵌凭据。

* * *

## AI-REC-005

测试编号：AI-REC-005测试类别：侦察与发现测试名称：OpenAPI / GraphQL schema 与工具调用面发现风险等级：低

## 测试方法

1.  获取 /openapi.json、/swagger.json，并执行 GraphQL introspection。
    
2.  查询 MCP tools/list 与 resources/list。
    
3.  梳理哪些端点可触达工具、哪些触达模型上下文。
    

```bash
curl -s https://api.target/openapi.json | jq .paths
curl -s https://api.target/graphql -d '{"query":"{__schema{types{name}}}"}'
npx @modelcontextprotocol/inspector --method tools/list
```

## 预期结果

形成智能体可用的工具调用端点、schema 与参数清单。

* * *

## AI-REC-006

测试编号：AI-REC-006测试类别：侦察与发现测试名称：模型 / 框架 / 供应商识别（行为特征 + 直接询问）风险等级：低

## 测试方法

1.  直接向模型询问其身份与系统提示词。
    
2.  依据响应延迟、拒答风格与工具调用 JSON 格式推断模型。
    
3.  将响应头与错误信息关联到供应商。
    

```bash
garak --model_type rest --probes encoding,knownbadsignatures
promptfoo redteam run

附加：手工问询 + 响应延迟统计 + 响应头/错误信息比对
```

## 预期结果

直接获取到模型名称或框架，或通过行为指纹予以确认。

* * *

## AI-REC-007

测试编号：AI-REC-007测试类别：侦察与发现测试名称：针对 AI 基础设施端口的主动网络扫描（naabu / nmap）风险等级：低

## 测试方法

1.  使用 AI 端口列表对存活主机运行 naabu。
    
2.  用 nmap 服务探测确认开放端口。
    
3.  将端口关联到 MLOps 服务对照表。
    

```bash
naabu -list live.txt -p 5000,6333,8080,8265,8888,9000,19530,9200,6379,5432 -silent
nmap -sV -sC -p 5000,8265,8888,9000 TARGET
```

## 预期结果

将开放的 AI 基础设施端口（MLflow、Ray、Jupyter、Qdrant、MinIO）映射到存活主机。

附：端口 → 服务对照

| 端口  | 服务  | 端口  | 服务  |
| --- | --- | --- | --- |
| 5000 | MLflow tracking | 9000 | MinIO |
| 6333 | Qdrant | 19530 | Milvus |
| 8265 | Ray dashboard / head | 9200 | Elasticsearch |
| 8888 | Jupyter | 6379 | Redis |
| 8080 | 通用 / Kubeflow | 5432 | PostgreSQL |

* * *

## AI-REC-008

测试编号：AI-REC-008测试类别：侦察与发现测试名称：MLOps 服务指纹识别（MLflow / Qdrant / Weaviate / Ray / Jupyter）风险等级：低

## 测试方法

1.  访问各服务已知的指纹路径。
    
2.  匹配响应正文（experiment list、/collections、/v1/meta、/api/jobs/）。
    
3.  记录版本与认证状态。
    

```bash
curl -s http://target:5000/api/2.0/mlflow/experiments/search      
MLflowcurl -s http://target:6333/collections                            # Qdrantcurl -s http://target:8265/api/jobs/                              # Raynuclei -tags mlflow,ray,jupyter
```

## 预期结果

确认每个开放的 MLOps 端点对应的服务名称与版本。

* * *

## AI-REC-009

测试编号：AI-REC-009测试类别：侦察与发现测试名称：API 端点与参数枚举（ffuf）风险等级：低

## 测试方法

1.  使用 ffuf 和 API 字典对路径进行模糊测试。
    
2.  枚举参数与 HTTP 方法。
    
3.  比对响应，找出状态码与长度异常。
    

```bash
ffuf -u https://api.target/FUZZ -w api-wordlist.txt -mc all -ac
ffuf -u https://api.target/path?FUZZ=1 -w params.txt
```

## 预期结果

发现此前未知、且会改变响应状态码或长度的端点或参数。

* * *

## AI-REC-010

测试编号：AI-REC-010测试类别：侦察与发现测试名称：认证状态测绘（未认证 / 默认凭据端点）风险等级：中

## 测试方法

1.  在无凭据的情况下重放请求。
    
2.  测试默认与弱凭据（admin/admin、minioadmin）。
    
3.  编目认证缺口以备后续利用。
    

```bash
curl -s http://target:5000/health
httpx -l hosts.txt -sc
hydra -L users.txt -P pass.txt target http-form
```

## 预期结果

形成一份可直接访问的未认证或默认凭据 AI 端点清单。

* * *

## AI-REC-011

测试编号：AI-REC-011测试类别：侦察与发现测试名称：针对 AI 端点与泄漏密钥的 JS / SPA bundle 分析风险等级：中

## 测试方法

1.  下载 JS/SPA bundle 与 sourcemap。
    
2.  grep 查找 /invocations、/mcp、API 密钥与工具名称。
    
3.  从压缩代码中还原隐藏端点。
    

```bash
curl -o bundle.js URL
grep -RInE 'api[_-]?key|/invocations|/mcp|sk-' .

LinkFinder / JSFinder 提取隐藏端点
```

## 预期结果

从客户端代码中恢复出泄漏的 API 密钥或未公开的 AI 端点。

* * *

## AI-REC-012

测试编号：AI-REC-012测试类别：侦察与发现测试名称：DNS / CT 日志与 TLS 透明度基础设施发现风险等级：低

## 测试方法

1.  查询 crt.sh 与 TLS 透明度日志获取证书主机名。
    
2.  枚举 DNS 记录与区域数据。
    
3.  将发现的主机关联到 AI 服务。
    

```bash
curl 'https://crt.sh/?q=%25.target&output=json' | jq
amass enum -passive -d target
dnsrecon
```

## 预期结果

通过证书 / DNS 数据额外发现的内网或外网主机名与服务名称。

* * *

## 使用提示

本类不产生危害结论，产出的是「资产 + 能力」地图，供后续 19 个类别取用：007/008供云凭据窃取与 RCE，005供工具滥用与过度自主权，010供横向移动。

按清单内置纪律：仅凭反射型或带外证据才能标记「已确认」；盲测型（007、009、010）单独取证只能标「疑似」，需补一次状态变化或带外回调证据。

踩坑提醒：crt.sh通配查询须写%25.target（URL 编码的%），直接写%.target常被静默吞掉而误判为「无证书资产」。
