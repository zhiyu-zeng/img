---
title: 【微信】强推一个DeepSeek Harness 渗透测试插件
source: https://mp.weixin.qq.com/s/2q0uI1HSHHj0g4NkKk9GHQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T11:48:15+08:00
trace_id: 73396cb6-e310-4a61-8a77-3f4fd9503be1
content_hash: 32add91e8ae0f997af06798d3449690e9d28edee3162310aa7b869f50a80ada6
status: synced
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 三环并行 agent 竞速的授权渗透测试框架 d2d，以图数据库为共享黑板、带出网治理与双签验证，以 dsh 插件形态运行。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40e75244-d011-81e3-b5d9-dd9e52f47f32
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 三环并行 agent 竞速的授权渗透测试框架 d2d，以图数据库为共享黑板、带出网治理与双签验证，以 dsh 插件形态运行。
> 
> - **核心架构：** 发现环/深度攻击环/创造探索环三类 agent 并行竞速（容量账本+唤醒预算隔离），共享 graphd 图黑板（:8766，ladybug 引擎），全部状态经图流转，写面分级、读面按 scope 隔离。
> - **验证机制：** critical/high 发现须经双模型净室复核（dual_sign 状态机），争议结果走人工仲裁闭环；X-Ring 通道用任务书契约+时长/token 双路径熔断+verifyRunner 机械重放，held 结果由人工裁决回灌。
> - **安全控制：** egress-gateway（:8888）强制代理、DNS resolve-once 校验、CONNECT 端口 pin、硬黑面（元数据/链路本地/CGNAT）；worker env 白名单双层剥离 host 凭据；audit/transition/gate/run 四条 append-only 审计链。
> - **部署使用：** git clone 后 `./install.sh` 一键装依赖并初始化双 token，`systemctl --user start d2d-graphd` 启图服务，`dsh web`（:8899）查看观测面板；知识库含 260 张卡片及 techniques。
> - **能力与合规：** 工具/策略/skill/知识库/loop/MCP 六类能力分目录组织，出网统一门禁；仅限书面授权测试，denylist 资产零容忍，报告发布前必须脱敏。

**HACK之道** *2026年11月4日 09:37*

**三环并行自主渗透测试框架**—— 发现环 / 深度攻击环 / 创造探索环三类 agent 并行竞速，共享图数据库黑板，自带星图认知层、知识脑与观测面板。以 dsh 插件形态运行。

> **授权测试专用**：本框架仅用于已获明确书面授权的渗透测试场景（自有资产/授权靶场）。  
> 内置多层安全门（出口治理/scope 门控/写面分级/审计链），但使用者对授权合规负全责。

## 架构

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│ 发现环    │   │ 深度攻击环│   │ 创造探索环│     三类 agent 并行竞速
│ discovery│   │  deep    │   │ creative │     （容量账本+唤醒预算隔离）
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    ▼
        ┌───────────────────────┐        ┌────────────┐
        │  graphd 图黑板 :8766   │◄───────│ 观测面板    │
        │  Finding/Signal_/     │        │ d2d-panel  │
        │  Hypothesis/Experience│        └────────────┘
        │  (ladybug/kuzu)       │
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │ egress-gateway :8888  │  出网治理（scope/DNS 校验/限速/审计）
        │ oast :8890 cdp :8893  │
        └───────────────────────┘
```

-   • **图即黑板**：全部状态经图流转，写面分级（worker 结构化写 / host-only 裁决面），读面 scope 隔离。
    
-   • **双签验证链**：critical/high 双模型净室复核（dual_sign 状态机）， disputed 人工仲裁闭环。
    
-   • **X-Ring 受控自主通道**：env 白名单 + engagement 预建上下文 + verifyRunner 机械重放（表达力≠容忍度）+ held 人工裁决——发现→验证→入图→裁决管道（见 `docs/decision-archive.md` ）。
    

## 快速开始

```bash
git clone https://github.com/wufufu770/d2d && cd d2d
./install.sh                    # 依赖+systemd user 单元+双 token 初始化
bash scripts/ops/dvwa-reset.sh  # 本地靶场自检（可选）
systemctl --user start d2d-graphd
```

-   • 图服务：`:8766` （systemd `d2d-graphd.service` ，ladybug 引擎）
    
-   • 出口网关：`:8888` （worker 全量代理，NO_PROXY 直连本地靶）
    
-   • 面板： `dsh web` （:8899）
    

## 六类能力

| 类   | 位置  | 说明  |
| --- | --- | --- |
| 工具  | `plugin/pentest-dsh/tools/` | burp 族/js-scanner/osint（出网统一门禁） |
| 策略  | `plugin/pentest-dsh/domain/` | 纯函数判定面（scope/write-gate/verify-verdicts 单一事实源） |
| skill | `brain/seed/skill-samples` | 技能抽取三门通道 |
| 知识库 | `brain/seed/` | 卡片库 260 张+techniques（图内 ExperienceWeight） |
| loop | `plugin/pentest-dsh/scheduler/` | 三环调度/预算/容量账本 |
| MCP | `scripts/mcp/` | 对外只读 stdio server（sanitize-ingest 链） |

## 安全模型

-   • **写面分级**：worker token 仅结构化写；host-only 裁决面（adjudicate/dual-sign-transition）；经验库 host 收纳。
    
-   • **OPSEC 门族**：scope 门控（engagement 上下文 fail-closed）/危险命令铁律/host-token 读取拦截/状态保护。
    
-   • **出口治理**：egress-gateway 强制代理+DNS 解析校验（resolve once/connect validated）+CONNECT 端口 pin+硬黑面（元数据/链路本地/CGNAT）。
    
-   • **worker env 白名单**：host 凭据面双层剥离（进程级 strip+spawn 级 buildWorkerEnv）。
    
-   • **审计链**：audit.log+transition-log+gate-log+run-log 四面 append-only。
    

详见 `docs/decision-archive.md` （三条集成原则/验证语义两分/失败家族规则）。

## X-Ring 受控自主

长任务自主测试通道：任务书契约（三 JSON 产出）→ 预算双路径熔断（时长+token）→ verifyRunner 机械重放（证据链 pass + 独立复现分层标注）→ held 人工裁决回灌（adjudicate held-finding）。见 `scripts/xring/` 。

## 引擎与测试

-   • 图引擎：生产 ladybug（ `LBUG_C_API_LIB_PATH` 注入），测试双轨（kuzu 轨+ladybug 轨全量等值）。
    
-   • dsh 版本基线：六包+宿主 CLI 统一 0.2.1-rc.2 / dsh-better-sidebar 0.24.1（成对升级纪律，校验入口 `node scripts/ops/verify-dsh-version.mjs` ，对应表见 `docs/dsh-sidebar-compat.md` ）。
    
-   • 三 workflow：ci（pytest+mocha+panel）/ gates（graphd 门禁+semgrep+codeql）/ dsh-compat（node 22 最低轨）。
    
-   • 基线口径： `pytest tests/` 双轨 / `npx mocha "test/*.test.mjs"` / panel `npm test` 。
    

## 文档

`docs/` ： `decision-archive.md` （决策档案）· `state.md` （活状态）· `devlog.md` （开发轨迹）· `roadmap.md` · `do-not-touch.md` （禁区）· 各 runbook。

## 合规

授权测试专用；排除资产清单（denylist）红线零容忍；报告发布前必须脱敏（A/B 报告脱敏流程）。安全问题见 `SECURITY.md` 。

## 下载地址

https://github.com/wufufu770/d2d
