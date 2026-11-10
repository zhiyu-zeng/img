---
title: 【微信】[工具推荐]一套 AI 驱动的自主代码安全审计系统 -ArgusMind
source: https://mp.weixin.qq.com/s/n732cSF2Zs4zT0njRtIvEw
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T21:09:27+08:00
trace_id: d57a4e99-63fd-4b4e-ba54-8dc811adf720
content_hash: 7e8d82d752482441dbf8d02cd008a8f44e4c0865b08fb6c37709e324607c4859
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 46
  succeeded: 46
  failed_urls: []
notion_page_id: 41475244-d011-811c-863f-d4d7876539cc
ioc: null
---

**陌笙不太懂安全** *2026年11月10日 18:08*

```javascript
由于传播、利用本公众号所提供的信息而造成
的任何直接或者间接的后果及损失，均由使用
者本人负责，公众号陌笙不太懂安全及作者不
为此承担任何责任，一旦造成后果请自行承担！
如有侵权烦请告知，我们会立即删除并致歉，谢谢！
```

工具推荐

ArgusMind 是一套 AI 驱动的自主代码安全审计系统。它通过多 Agent 编排，对被测代码库进行结构化审计：收集项目信息、制定按语言与风险类别的审计计划、发现危险汇聚点（Sink）、追踪并分析调用链，最终将结果写入 Neo4j 图数据库与 PostgreSQL 关系库，并通过 FastAPI 对外提供 REST API。

## 核心能力

-   **端到端审计流水线**：Orchestrator 编排 ProjectInfo → Plan → SinkFinder → ChainAnalyzer 等 Agent，支持任务暂停、恢复与取消。
    
-   **双存储架构**：Neo4j 承载审计阶段、语言、风险类别、Sink、链路等图关系；PostgreSQL 承载用户、任务、配置、日志、事件与漏洞发现等业务数据。
    
-   **可观测性**：事件总线将运行日志、任务状态变更写入数据库，便于 Web 控制台或 API 查询进度。
    
-   **工具链集成**：OpenCode（代码 Agent）、ripgrep、tokei、可选 GitNexus MCP；LLM 通过 LiteLLM 统一接入多种模型提供商。
    
-   **REST API**：项目管理、任务启停、配置管理、图数据查询、报告导出、人工审批等。
    

## 系统架构

ArgusMind 采用 **分层 + 事件驱动 + 双库分工** 的设计：HTTP 层负责鉴权与任务调度；Orchestrator 驱动多 Agent 流水线；审计过程产生的 **图结构** 写入 Neo4j， **作业元数据、配置、日志、事件、发现** 写入 PostgreSQL；运行时通过内存 **事件总线** 解耦编排与持久化。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e562903d4a0150e7.png)

界面预览

本仓库包含 Web 控制台（Ant Design Pro + Umi）。以下截图为 Demo 模式（npm run start:demo）下的界面，数据来自内置 Mock，无需连接后端即可浏览全流程。

登录 · 控制台（Dashboard）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3fcd41e97532d2a3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a5bfea208c17bb7f.png)

项目管理 · 任务管理

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5afb277cba6368c1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f860ce825da9008f.png)

任务详情 · 代码审计链路图

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a698c32de06eb673.png)

任务详情 · 漏洞管理

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2e5f8277bb8205a8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cb725f245fabd683.png)

漏洞详情（报告与代码审计链路图）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5162657a82575690.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8f46e5f51fef8813.png)

工具安装

### Docker 安装

适用于 Linux / macOS / WSL，一键拉起 PostgreSQL、Neo4j 与前后端服务。

```bash
git clone https://github.com/pulseio76/ArgusMind.git
cd ArgusMind
chmod +x install.sh
./install.sh
```

安装完成后访问 **\[http://localhost:8006** （API\](http://localhost:8006 **（API/) 默认** 6066）。默认账号 `ArgusMind` / `ArgusMind` ，请在「配置管理」中填写 LLM 与 Code Agent 密钥。

### 源码安装

需自行准备 **Python 3.10+**、 **Neo4j 5.x**、 **PostgreSQL** 与 **Node.js**。

**1\. 克隆仓库并安装 Python 依赖**

```bash
git clone https://github.com/pulseio76/ArgusMind.git
cd ArgusMind
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux / macOS: source .venv/bin/activate
pip install -e .
cp config.yaml.example config.yaml   # 按环境修改 Neo4j / PostgreSQL 连接
```

**2\. 启动后端**

```css
python src/main.py
```

默认监听 **\[http://0.0.0.0:6066**。首次启动会自动初始化数据库与默认用户（ `ArgusMind`\](http://0.0.0.0:6066\*\*。首次启动会自动初始化数据库与默认用户（ `ArgusMind` /) / `ArgusMind` ）。

**3\. 启动前端服务**

```css
git submodule sync --recursive frontend
git submodule update --init --recursive frontend
cd frontend
git fetch origin main
git checkout --detach origin/main
npm install
npm run dev
```

前端开发服务启动后，按终端提示访问本地地址。

工具使用

```javascript
https://github.com/pulseio76/ArgusMind
```

**后台回复加群加入交流群  
**

**广告：** **cisp pte/pts &nisp1级2级低价报考**

**陌笙安全纷传圈子+陌笙src挖掘知识库+陌笙安全漏洞库+陌笙安全面试题库** **简单介绍** **（** **加入纷传圈子** **送知识库+漏洞库+面试题库** **）**

如果觉得合适可以加入,圈子目前价格39.9元，价格只会根据圈子内容和圈子人数进行上调，不会下跌。。。

**圈子福利**

**edu漏洞挖掘1v1指导出洞**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/133744e78ee257e6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e551ca7a6839aaa0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/edcf3331ac3974c3.png)

**skill+grok辅助挖掘某企业sr** **c** **实战效果，能出但是重复多，agent独立挖掘也可以，见仁见智，看个人习惯，好的模型是最重要的。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c1a9cb8ad09b809b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5660c0ddec5f2a89.png)

**企业src边缘&核心资产实战效果&&有重复但是证明好模型+AI确实够用**

**（图片仅供参考，我出不等于你出，见识 **到** ai神力即可，多去用AI!!!）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/77c229aa0236778a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf0a0169d7cc3bcf.png)

**不是P图,单洞1.2w记录**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8e86e33ca119e426.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b4c93939079de786.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53f2903e2c542dfd.png)

**陌笙src挖掘知识库介绍（内容持续更新中!!!)**

```css
信息收集(主域名信息收集,子域名信息收集等&会永久提供fofa-key助力)
弱口令漏洞&未授权访问漏洞挖掘
任意文件读取&删除&下载&上传漏洞
sql注入漏洞
url重定向漏洞
csrf&ssrf漏洞挖掘
XSS&XXE漏洞挖掘等等常见漏洞
cors&目录遍历&越权漏洞挖掘
EDUSRC(证书站挖掘案例分享&edusrc挖掘技巧分享)
CNVD挖掘技巧分享&实战案例报告编写
公益漏洞挖掘（公益src挖掘漏洞分享&提供补天1权重资产）
SRC挖掘实战(针对各种常见功能总结的常见测试思路等快速提升)
经典常见Nday漏洞(常见中间件&以及各种常见框架)复现
云安全相关漏洞挖掘（云key扫盲&云存储桶&快速识别云环境&云攻防）
AI相关学习（AI基础&AI代码审计实战测试&webLLM攻击等）
APP&小程序漏洞挖掘
等各模块不在一一介绍
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a5a9526c04ca82e2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/55d95f056e0ccf90.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3121dfe6083ea07e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e578c40e9cd61e62.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24f96a9898859025.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0458ef9d7a83cbed.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db0608e7dbfad79e.png)

信息收集

src挖掘基础

src挖掘实战

edusrc

经典nday复现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91feed6aac03f174.png)

云安全&AI安全

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd7acc8d3a29bd0d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd8a29373cb7ad97.png)

**陌笙安全漏洞库介绍**

```sql
最新漏洞查看
1day&0day分享
EDU学校相关漏洞
Web应用漏洞
CMS漏洞
OA产品漏洞
中间件漏洞
云安全漏洞
人工智能漏洞
其他漏洞
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f639476be4ccc8b6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/930f6c88a39ecca5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b8135c0c2526f85.png)

**陌笙安全面试库**

```javascript
渗透测试基本问题一汇总
渗透测试基本问题二汇总
渗透测试基本问题三汇总
微步护网面试题目
长亭科技面试
深信服护网面试
启明星辰渗透测试面试题目
安恒面试题目
绿盟笔试题目
360面试
奇安信护网面试
运维面试题目
运维面试题库
网安面试相关文档大全
相关面试文章推荐
等等
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68bba849a294ed14.png)

**POC库** **&&更新适配afrog&&nuclei&&dddd的POC&1day/Nday等&&** ****dddd二开**** **工具\[助力渗透测试&&红蓝攻防\]**

**工具截图**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d063db28ae4ceb5.png)

**实战效果**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b1f6a12faa09436b.png)

**poc库【后续持续更新】**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6289c17ff054c179.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5bde621a04c52bca.png)

**AI赋能-** **skill辅助** **漏洞挖掘（免责&&慎用）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b8b6a5c558fd865.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73be12b15c4989b8.png)

**圈友skill+ai辅助渗透** **实战效果** **，支持打假！**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/85c2afd29e97a606.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3bf49d95d9bf7df6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/64cb8b21d0c77ec4.png)

证书站

普通站点

**陌笙** **纷传圈子介** **绍**

```apache
1、src挖掘思维导图，信息收集思维导图，edusrc挖掘思维导图，以及后续的红队&面试思维导图&自己网安笔记等持续更新
2、2025-2026的edusrc实战报告包含证书站和非证书站以及2025之前的各种优质报思路分享
3、各种src报告思路分享（内部&外部）
4、分享各种src挖掘&edusrc挖掘培训资料&视频
5、不定期分享通杀、0day
6、有圈子群可以技术交流以及不定期抽取证书&免费rank
7.分享各种护网资料各家安全厂商讲解视频&精选实战面试题目
8、各种框架漏洞技巧分享
9、各种源码分享（泛微、正方系统、用友等）
10、漏洞挖掘工具&信息收集工具&内网渗透免杀等网安工具分享
11、各种ctf资料以及题目分享
12、cnvd挖掘技巧&CNVD资产&src资产分享&补天1权重资产分享&fofakey共用
13、免杀、逆向、红队攻内网防渗透等课程分享
14、漏洞库&字典以各种内容不在一一说明
15、cisp-pte/pts&nisp一级&nisp二级&edusrc证书内部价格
15、如果有漏洞挖掘问题或者工具资料需求可以找群主(尽量满足)
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/087e8c93f06bfc42.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db599fd789126f7d.png)

**目前800多条内容，扫描下方二维码查看详情以及加入圈子，持续更新中。。**

**如果觉得合适可以加入，价格不定期会根据圈子内容和圈子人数进行上调。。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8e0f7f5e142796f.png)

渗透测试常用工具 · 目录
