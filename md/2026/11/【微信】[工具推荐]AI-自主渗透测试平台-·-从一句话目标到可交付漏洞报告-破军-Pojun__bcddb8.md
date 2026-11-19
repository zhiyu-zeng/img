---
title: 【微信】[工具推荐]AI 自主渗透测试平台 · 从一句话目标到可交付漏洞报告-破军 Pojun
source: https://mp.weixin.qq.com/s/zJB1Zup9THPAkRqog41dBg
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:19:51+08:00
trace_id: 3f5e522d-6828-4202-a275-9fed7d8df089
content_hash: ad36c1d597f94f1fb8ea57e43cb0bf0bacc8674918582bdc4308a440ddbbf025
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 41d75244-d011-8155-bc73-d0c266678fe9
ioc: null
---

**华盟信安** *2026年11月18日 10:05*

```javascript
由于传播、利用本公众号所提供的信息而造成
的任何直接或者间接的后果及损失，均由使用
者本人负责，公众号陌笙不太懂安全及作者不
为此承担任何责任，一旦造成后果请自行承担！
如有侵权烦请告知，我们会立即删除并致歉，谢谢！
```

工具描述

Pojun 是一套 LLM 多 Agent 自主渗透测试平台，用户只需给出一个目标，它便能自动完成“目标拆解→侦察→漏洞挖掘→利用→后渗透→报告”全流程，并通过目标闸门、证据闸门、自主续跳和全程留痕等机制，确保 AI 像守纪律的渗透测试工程师一样工作——目标未达成便如实标记“未完成”，高危漏洞必须附可机械复现的证据，确认漏洞后自动推进到数据/资金影响层，所有 HTTP/S 流量逐请求留存、每一步可回放；平台还提供多 Agent 协作、目标管理、攻击链续跳、漏洞去重、写回守卫、漏洞情报运营、红队作战、三层审批拦截、证据链交付与成本模型路由等能力，单机实测在真实授权项目下实现 12 个任务、56,000+ 次工具调用、295 个确认漏洞的无人值守运行。

核心能力

**1\. 多 Agent 自主推进**

planner 唯一意图生成者，持跨唤醒共享 todolist 按依赖派发；worker 做完一条即停，写回双图自动唤醒 planner；mainagent 管对话与即时任务。人在环路可纠偏、暂停取消、审批。多层韧性：空转收场 / 超时 / 瞬时故障重跑，免费限流通道也能稳定跑完。

**2\. 目标管理：完成判定不可绕过**

set_goals 每条目标可带可核验 criteria，禁止把「发现/验证漏洞」写成最终目标；goal_met 闸门有目标未 met 直接拒收官。诚实终态：全部达成才 done，否则一律 timeout 并如实标注 x/y 目标。

**3\. 执行面：原生执行器 + 会话复用 + 后台作业**

http_request 自动过 MITM 留痕；session_login 五形态登录，任务级 cookie jar 与 curl 互通；session=同名 自动带登录态，双身份对照做越权零成本；poc_scaffold 生成可运行验证骨架；后台作业让长扫描/爆破跑完进程继续；任务级共享脚本一次编写全任务复用。

**4\. 攻击链续跳：确认漏洞之后继续走**

report_finding 回执带 chain_intent_id 自动派发继任意图：SQL 注入 → 数据外带 → 登录态 → 横向；上传 → 落地验证 → webshell 边界；未授权接口 → 越权对照 → 数据面影响。纪律：确认漏洞 ≠ 完成意图；按 L1 信息 → L2 认证/越权 → L3 控制 → L4 数据/资金 推进；判「不可利用」前须换 ≥2 种手段并留失败输出。

**5\. 漏洞去重与合并**

**一份漏洞一份真相** 多键去重（强键 + 弱键），新上报自动合并，merge_count 计数、来源收进时间线；跨任务同资产同漏洞默认不重复打扰（可关）。

**6\. 写回守卫：范围越界的硬防线**

record_fact / report_finding 锚定非本任务范围资产直接拒绝；planner「复核优先」：跨域名归属须双域取证复核，不过即放弃该链，防止误报跑偏整条链。

**7\. 漏洞情报运营（持续，不是静态知识库）**

按时间流而非按组件查：最近 7 天爆了什么 → 匹配我的资产 → 排进任务。NVD + CISA KEV + GitHub Advisory + PoC 聚合；高危快通道每 30 分钟拉 CVSS≥9.0 或 KEV；资产指纹→CVE 反向匹配命中挂 hint；版本区间三态保守判定。

**8\. 红队作战能力**

回连接收器接住反弹 shell / OOB 回连并逐会话留痕，启停走人工审批；C2 出口三形态 direct / SSH 中继托管 / manual，listener_start 返回解析后回连地址；redteam-ops 六阶段方法论 + 证据纪律；66 件后渗透工具「宿主环境」页一键装齐。

**9\. 审批与拦截：三层闸门**

deny 明令禁止不调模型直接拒（10 条）；judge 按上下文走模型裁决（12 条）；ask 能力边界变更转人工审批（1 条）。规则级 timeout 真生效；裁决严格 JSON 解析失败走失败策略；裁判输入仅工具名+参数+工作目录；写回范围守卫数据层再兜一道。

## 10\. 全程证据链与交付

MITM 逐请求留存全部 HTTP/S 流量；finding 绑定四类流量证据快照版本化（sha256）；截图与文档取样自动转图归档可归属漏洞；专业级 Word（封面·目录·严重度着色·复测记录·流量证据·修复路线图）+ Markdown + 批量「一漏洞一 docx」zip；对抗式自检「确认了才报」。

## 11\. 成本与模型路由

LLM 三通道轮询：熔断 + 故障转移 + 用量归因，免费限流通道也能跑完（实测 2,725M token，缓存命中 93%）；按角色配模型：planner 强推理 / worker 中推理 / judge 便宜档；worker 态势瘦身，未测资产按簇排序、http_probe 批量探活替代逐条 curl。

界面速览

控制台登录：首次启动初始化管理员，防爆破锁定

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59f1d29a28d4f0df.png)

总览：任务 / 发现 / 资产 / Token 全局态势与趋势

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/efd824492f2efa64.png)

任务列表：目标进度与漏洞分布一屏可见

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed6d2ffa7c3707c3.png)

任务详情：多 Agent 会话，planner 态势研判实时可见

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2f58435b0063e318.png)

任务总览：目标逐条带验收标准，达成状态诚实呈现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/378ef8f179db126c.png)

目标管理与操作约束：目标逐条勾选达成，allow/deny 约束直接约束 planner 派单

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bbe14a488a6dcfc1.png)

发现：跨任务漏洞汇总，按严重度统计

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/47288942e53e18f8.png)

漏洞详情：摘要 + 复测命令 + 证据 PoC + 状态卡

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ade4df6489bee20.png)

资产台账：企业 → 根域名/IP/子域/服务/接口 全量登记

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57c1f31814835711.png)

资产覆盖图：力导向布局，已测节点高亮

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e788edeb87b9916.png)

漏洞情报运营：42 万 CVE / KEV 在野利用 / PoC 仓库持续同步

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d779977cabba6486.png)

LLM 配置：多通道轮询 / 熔断 / 故障转移

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7275c5291398c7a9.png)

对话工作台：跨 Agent 对话与工具触发回放

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0954d62dceedd489.png)

领域工具：agent 可调用的平台工具清单与开关

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c20cd721eca0ae35.png)

工具使用

**Linux（Debian / Ubuntu / RHEL / Kali 等，root 执行，全自动交互安装）：**

```bash
curl -fsSL https://github.com/chu0119/Pojun/releases/latest/download/install.sh | sudo bash
```

**macOS 13+（Apple Silicon / Intel，一条命令，不需要 sudo）：**

```bash
curl -fsSL https://github.com/chu0119/Pojun/releases/latest/download/install.sh | bash
```

自动完成：Homebrew 检测（没有就装）→ PostgreSQL 16 安装与服务化 → 下载并 校验 darwin 包 → 生成 config.json → 注册 launchd 用户级服务（开机自启 + 崩溃自动拉起）→ 健康检查。渗透工具与 LibreOffice 等 brew install 按需装 （缺失工具在「宿主环境」页如实显示），详见安装详解。

**Windows / 已有 Docker（工具链全在镜像里，宿主机零安装）：**

```powershell
git clone --depth 1 https://github.com/chu0119/Pojun.git pojun && cd pojun
cp .env.example .env    # Windows 用 copy；至少改 POSTGRES_PASSWORD
# Windows（Docker Desktop，WSL2 后端）：
docker compose -f docker-compose.yml -f docker-compose.windows.yml up -d
# macOS（Docker Desktop / OrbStack）：
docker compose -f docker-compose.yml -f docker-compose.macos.yml up -d
# Linux / 其他：
docker compose up -d
# → http://localhost:8787
```

**装好之后（3 分钟上手）：**

1.  浏览器打开 http://<host>:8787 → 初始化管理员密码（≥8 位）
    
2.  「LLM 配置」页配模型通道（≥2 个通道 + 开启轮询 = 实战推荐）；Anthropic/OpenAI/ DeepSeek 等 OpenAI 兼容端点直接填 base_url + key + model（如 DeepSeek： https://api.deepseek.com + deepseek-chat/deepseek-reasoner）
    
3.  「宿主环境」页一键装齐工具（Docker 镜像已内置全部 66 件，可跳过）
    
4.  新建任务，给一句话目标
    

工具链接

```javascript
https://github.com/chu0119/Pojun
```

文章来源：陌笙不太懂安全
