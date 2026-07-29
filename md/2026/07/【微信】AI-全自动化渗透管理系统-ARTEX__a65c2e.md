---
title: 【微信】AI 全自动化渗透管理系统 | ARTEX
source: https://mp.weixin.qq.com/s/PrCKOBDW_pE-dN1dn0i8kw
source_host: mp.weixin.qq.com
clip_date: 2026-07-29T10:53:55+08:00
trace_id: 09b4fcc5-8812-4dc6-9174-ead5b0fe0610
content_hash: dc0156de20c2e1f3c0790abf80d24c98f88dc7d68ba09703d9c08ca34c3a3d0c
status: synced
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: ARTEX是AI自主渗透测试管理系统，具备资产同步、Agent任务与可视化探索链路，支持Docker一键部署。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 3ac75244-d011-81be-91ec-e9e74ecfe72c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ARTEX是AI自主渗透测试管理系统，具备资产同步、Agent任务与可视化探索链路，支持Docker一键部署。
> 
> - **系统定位：** 基于Go后端+Next.js前端的AI渗透管理平台，覆盖资产收集、任务编排、会话记录、流量录制等全流程，Agent可自主执行渗透任务。
> - **资产同步：** 从ScopeSentry一键拉取域名、子域、IP、端口、站点等资产数据，按项目/任务归类，直接纳入资产图供Agent使用。
> - **部署安装：** 依赖PostgreSQL和LLM API（支持Anthropic/OpenAI或UI配置），提供一键安装脚本、Docker Compose、预编译二进制及源码编译四种方式，默认访问http://localhost:8787，首次需/setup设置管理员。
> - **可视化能力：** 仪表盘、任务执行工具调用流程、探索链路、拦截审批与后端日志完整可见，支持LLM配置与Agent管理。

## AI 全自动化渗透管理系统 | ARTEX

**渗透安全团队** *2026年7月29日 10:24*

## ARTEX

```
https://github.com/Autumn-27/ARTEX
```

AI 自主渗透测试系统（Go 后端 + Next.js 前端）

**在线 Demo** ： https://artex-demo.vercel.app/

交流群见文末

* * *

## 截图预览

> 完整交互见在线 Demo。

### 仪表盘

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/63a3bfa0cc69e9ce.png)

### 任务列表

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f3816f9331040ee4.png)

### 任务 · 执行过程（会话 / 工具调用）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c8cb88df46bc854f.png)

### 任务关联资产（任务测试中涉及到的资产）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c3e9bf4ab8d5bf2d.png)

### 探索链路

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e6e1a2734f1679df.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7dd123287e332fce.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ca76b422a4ed524b.png)

### 发现

### 资产

### 流量录制

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/991e2cdf215e0411.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ab5b3a43c56d5e64.png)

### 会话

### Agent 管理

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1a56b76bf6a5ae46.png)

### LLM 配置

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e5f7b6b06381dfd9.png)

### 拦截审批

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8d0a0981a0804007.png)

### 后端日志

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3cdfd8447bb444d5.png)

* * *

## 资产同步（ScopeSentry）

支持从 ScopeSentry 直接同步资产数据，免去重复收集：

-   • 在「 **资产同步** 」页填 ScopeSentry 的地址与 API Key，接入数据源；
    
-   • 按 **项目** 或 **任务** 维度选择要同步的目标与资产类型（域名 / 子域 / IP / 端口 / 站点 / 端点…）；
    
-   • 一键导入并按公司资产范围归并，直接进入 ARTEX 的资产图供 agent 探索使用。
    

* * *

## 安装

> 依赖数据库 **PostgreSQL** ；探索需配置 **LLM** （ `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` ，也可在 UI 里配）。

### 方式一：一键安装脚本（推荐）

```bash
git clone https://github.com/Autumn-27/ARTEX.git
cd ARTEX
./install.sh
```

脚本会：检测 / 自动安装 Docker → 让你选 **① 全部 Docker** 或 **② 本地编译运行** ：

-   • **① 全部 Docker** ：填一个 Postgres 密码（可回车随机）→ 自动写 `.env` → `docker compose up -d` 。
    
-   • **② 本地运行** ：选数据库（连已有 / 用 Docker 起一个）→ 生成 `config.json` → `go` 编译内嵌单二进制 → 启动。
    

装好后打开 **http://localhost:8787** （首次进入 `/setup` 设置管理员密码）。

### 方式二：Docker Compose（手动）

```bash
git clone https://github.com/Autumn-27/ARTEX.git
cd ARTEX
cp .env.example .env          # 填 POSTGRES_PASSWORD、可选 ANTHROPIC_API_KEY
docker compose up -d          # 拉取 autumn27/artex 镜像 + postgres
# → http://localhost:8787
```

镜像已含常用工具（ripgrep/curl/vim/npm/nmap…）；`./skills` 与 `./data` 以绑定挂载持久化。

### 方式三：下载预编译二进制（Releases）

到 Releases 下载对应平台的 zip，解压后得到 `artex` + `skills/` + `config.example.json` ：

```
cp config.example.json config.json   # 填好 database 连接
./artex                              # → http://localhost:8787
```

### 方式四：从源码编译单二进制

```bash
# 1) 前端静态导出
cd web && npm ci && npm run build:static && cd ..
# 2) 拷进内嵌目录
cp -r web/out server/webui/dist
# 3) 编译（-tags embedui 才内嵌前端）
CGO_ENABLED=0 go build -tags embedui -o artex ./cmd/artex
./artex
```

## 群-聊

下方二维码添加好友，回复关键词"SecSentry"进群

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/53a261037cddad9a.webp)
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/88f5a2c00f0b63e5.webp)
