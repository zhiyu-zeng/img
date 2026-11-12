---
title: 【微信】AntiFox:AI 多智能体自主渗透测试平台,从侦察到交付报告全流程自动化,附下载
source: https://mp.weixin.qq.com/s/SXlq8U4lztITf3RZFCxnwg
source_host: mp.weixin.qq.com
clip_date: 2026-11-12T08:13:40+08:00
trace_id: 8ffbffaa-45ba-40b3-be24-a1e52f424f82
content_hash: 50cb41628411ac592799dfc30a622ac8176280922b5a737b9bfb08573b8e0956
status: synced
tags:
  - 微信
  - AI应用
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**AntiFox 是一个 Go 编写的多智能体 AI 自主渗透测试平台，从侦察到交付级报告全流程自动化，v2.0 重点解决“挖得到但交不出”的复现与证据难题。**"
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41675244-d011-81e8-985c-f2034be36714
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **AntiFox 是一个 Go 编写的多智能体 AI 自主渗透测试平台，从侦察到交付级报告全流程自动化，v2.0 重点解决“挖得到但交不出”的复现与证据难题。**
> 
> - **双图架构：** 全局资产图是跨任务共享的资产真值库，每任务的探索图记录目标、意图、事实、漏洞的推进血缘链，两图靠锚点互连；调度事件驱动，图变更唤醒规划器产出意图，工作者执行写回直至目标被证明。
> - **v2.0 关键改进：** agent 利用时把每步请求、响应、预期结果和验证结论就地落库，避免事后模型补写甚至编造复现步骤；发现页按利用链拆成入口点、前置条件与逐步利用，每步配自然语言说明和真实请求。
> - **证据即报文：** agent 作业期间的请求经 MITM 完整录制落库，按时间窗口与步骤顺序精确对应到每步复现，支持语法高亮和正文检索；报告用 python-docx 生成带封面、目录、页码的交付级 .docx，简繁英三语。
> - **部署：** 最新 v2.0.3 提供各平台预编译二进制，官方 compose 拉起 PostgreSQL 16 + 平台（端口 8787），镜像 ghcr.io/antifox-ai/antifox；需 ANTHROPIC_API_KEY 或 OPENAI_API_KEY，无模型则无法探索。
> - **合规与风险：** v2.0.3 的出口代理（http/https/socks5 藏源 IP）和 LLM 会话头（会话 ID 外发）可能构成蓝队检测特征或行为画像；README 明令禁止攻击线上系统，仅限本地隔离环境验证，AGPL-3.0 要求二开开源。

**黑白之道** *2026年11月11日 08:58*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**:AntiFox 把多智能体 AI 塞进了渗透测试流程:给定授权目标,规划器、工作者、主控自动跑完侦察、攻击面发现与利用验证,最后交出一份带证据的交付级报告。

* * *

## 一个能自己干活的渗透测试平台

AntiFox 出自 GitHub 上的 AntiFox-AI 组织,Go 编写,AGPL-3.0 协议,目前 161 星、80 个 fork、3 个未关闭 issue。它自称是 ARTEX(作者 @Autumn-27)的二次开发版本,从上游 v0.1.1 起另起炉灶;顺带一提,上游那个仓库目前已经 404 打不开了。

它和常见扫描器最大的区别,作者总结成:多数工具擅长发现、止于发现,AntiFox 把重心放在交付上——不满足于甩一张漏洞清单,而是把"看得懂、能复现、带证据"的报告直接做出来。

## 双图架构:一张记家底,一张记过程

平台底座是 Go 单体后端(Next.js 前端用 go:embed 内嵌)加 PostgreSQL,核心是双图架构:全局资产图是跨任务共享的资产真值库,每任务独立的探索图记着目标、意图、事实、漏洞的推进血缘链。两图靠锚点互连,资产图里沉淀的东西下一个任务能直接接着用。

调度是事件驱动的:图一变就唤醒规划器,规划器产出意图,工作者领意图执行再把结果写回,写回又触发下一轮,直到目标被证明;中间的 mainagent 是人机接口。

## v2.0 的重点:把挖得到做成交得出

十月下旬的 v2.0 是最关键的一次改版。

**复现过程就地落库。** agent 一边利用,一边把每步的请求、响应、预期结果和验证结论写进库,而不是事后靠模型回忆补写。这直冲 AI 报告的经典翻车点:复现步骤拼不全,甚至凭空编造。

**发现页按利用链分步。** 漏洞不再是"一条命令加一句结论",而是拆成入口点、前置条件、逐步利用,每步一句自然语言说明配一个真实请求。

![AntiFox 发现页按利用链分步呈现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a411f1e7fe11b1f.png "AntiFox 发现页按利用链分步呈现")

*图:发现页把"任意文件上传到 RCE"拆成入口点、前置条件与逐步利用(图源:AntiFox 官方仓库截图,本地靶场合成演示数据)*

**每一步自动关联真实流量包。** agent 作业期间的请求经 MITM 完整录制落库,系统按时间窗口和步骤顺序把每步精确对到对应数据包,点开就是原始报文,带语法高亮和正文检索,不用再回代理工具重跑。

![每步复现自动关联 MITM 录制的真实流量包](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/170edcc839c692c2.png "每步复现自动关联 MITM 录制的真实流量包")

*图:复现步骤与原始流量包一一对应,支持报文正文检索(图源:AntiFox 官方仓库截图)*

**证据即报文。** 敏感信息泄露这类漏洞,流量报文本身就是证据,不必事后截图拼凑。报告侧用 python-docx 排版成交付级.docx,封面、目录、页码、漏洞属性表和结构化复现都齐,简繁英三语整份输出。

## 下载与部署

仓库地址:https://github.com/AntiFox-AI/antifox,最新版是 2026-10-30 发布的 v2.0.3,Release 页在 https://github.com/AntiFox-AI/antifox/releases/latest 。下面是最新的预编译二进制直链,解压即用:

| 平台  | 架构  | 直链  |
| --- | --- | --- |
| Linux | amd64 | https://github.com/AntiFox-AI/antifox/releases/download/v2.0.3/antifox-v2.0.3-linux-amd64.zip |
| Linux | arm64 | https://github.com/AntiFox-AI/antifox/releases/download/v2.0.3/antifox-v2.0.3-linux-arm64.zip |
| macOS | amd64 | https://github.com/AntiFox-AI/antifox/releases/download/v2.0.3/antifox-v2.0.3-darwin-amd64.zip |
| macOS | arm64 | https://github.com/AntiFox-AI/antifox/releases/download/v2.0.3/antifox-v2.0.3-darwin-arm64.zip |
| Windows | amd64 | https://github.com/AntiFox-AI/antifox/releases/download/v2.0.3/antifox-v2.0.3-windows-amd64.zip |
| 校验和 | 全部平台 | https://github.com/AntiFox-AI/antifox/releases/download/v2.0.3/SHA256SUMS |

用容器更省事,官方 compose 把 PostgreSQL 16 和平台一起拉起,自带静态前端,端口 8787:

```bash
curl -O https://raw.githubusercontent.com/AntiFox-AI/antifox/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/AntiFox-AI/antifox/main/.env.example
cp .env.example .env          # 设 POSTGRES_PASSWORD
docker compose up -d
```

Docker 镜像则是 ghcr.io/antifox-ai/antifox:latest 。裸机部署则把 config.example.json 复制成 config.json 填好数据库连接,跑./antifox 即可,Windows 是 antifox.exe;生成.docx 报告还需要 python3 加 python-docx。

依赖别踩坑:PostgreSQL 必装,LLM 密钥二选一(ANTHROPIC_API_KEY 或 OPENAI_API_KEY,也能在 UI「LLM 配置」页填),探索必须有模型,不然它自己动不了。

## 视角:两个数据出境开关值得盯

这事儿吧,得从两边儿看。

红队这波操作我给满分:把"从侦察到交付"整条链压进一次任务,MITM 录制、证据关联、报告生成全自动化。原来初级工程师要磨一周的活儿,现在是咖啡还没凉的时间。

但蓝队看过来,有两个开关得攥住。

**出口代理。** v2.0.3 加了全局出口代理,支持 http/https/socks5,新建任务时还能选走代理还是直连,官方说法是隐藏源 IP。对做跳板链路的红队是刚需,可防守侧一看就懂:一台装了自主 AI 攻击平台的机器忽然从陌生 IP 出去打流量,这就是现成的检测特征。

**LLM 会话头。** v2.0.3 允许给每个 LLM 配置挂一个自定义 HTTP 头,头值自动填当前会话 ID,官方解释是为了适配 opencode 这类按 session 做提示缓存和粘性路由的网关。可一个会话 ID 跟着每一笔请求往外发,会话一多,这些标识符拼起来就是完整的行为画像。

平台把 LLM 供应商、代理配置、任务目标都写进配置文件和 UI,AGPL-3.0 意味着二开还得开源,合规成本得算在前面。

![敏感信息泄露漏洞的证据直接取自流量报文](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/caffd21ce0eb79f9.png "敏感信息泄露漏洞的证据直接取自流量报文")

*图:.env 泄露类漏洞的证据就是这段流量响应,无需另行截图(图源:AntiFox 官方仓库截图)*

最后是授权边界。README 的"禁止事项"写得很死:严禁对任何网站、线上服务或联网系统发起扫描、探测、利用或攻击,只允许在本地隔离环境做原理验证。这是红线,不是建议。

紫队的用法应该是这样:授权范围先落成纸面,目标清单、时间窗、出口 IP、允许的动作一条条写清;HITL 拦截规则按纸面配好,全程 MITM 流量留证;结束后拿它的报告跟人工复测对账。红队用它加速,蓝队用它做对照,两边数据一合才是真正的攻防复盘,而不是"AI 说它挖到了"就算完。

**版权声明**:本文由华盟网原创发布,保留所有权利。配图由华盟网授权使用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

Tools · 目录
