---
title: 【先知】三条超线性路径与一个参数上限：Nodemailer GHSA-2x7j-588g-ccc2 地址解析 DoS 深度分析
source: https://xz.aliyun.com/news/92860
source_host: xz.aliyun.com
clip_date: 2026-09-21T20:05:38+08:00
trace_id: cb3ab23e-bc7b-4e5b-815f-8ea65a799773
content_hash: d826a2c3fc885a1989fa2ce261451902ad29cabb8e6364c1e316c965257a8e20
status: synced
tags:
  - 先知
  - 漏洞分析
  - 协议分析
series: null
feed_source: 先知安全技术社区
ai_summary: Nodemailer <9.1.0 地址解析层存在三条近二次超线性路径与一条参数上限异常路径，单次 sendMail 即可让 Node 单线程进程同步停摆数秒至两分钟。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 8
  failed_urls:
    - https://xz.aliyun.com/api/v2/files/fa19854b-f03c-3c3f-bb87-8bc3f70902eb
notion_page_id: 3e275244-d011-8152-ba36-ede1800110fc
ioc:
  cves:
    - CVE-2025-14874
  cwes:
    - CWE-400
    - CWE-407
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Nodemailer <9.1.0 地址解析层存在三条近二次超线性路径与一条参数上限异常路径，单次 sendMail 即可让 Node 单线程进程同步停摆数秒至两分钟。
> 
> - **漏洞定位：** 词法解析层 `addressparser` 的 `concat` 累计器与 `splice` 显示名合并、MIME 层 `_convertAddresses` 的 `some()` 线性去重均为 O(n²)；CVSS 7.5，影响所有 <9.1.0。
> - **触发形状：** 平坦地址列表触发路径①，含逗号显示名触发路径②，**互异**收件人才触发最严重的路径③（原文报告者的重复地址 PoC 反而掩盖了它）；`getEnvelope()` 从不写回缓存，同一字符串一次发送被重复解析约 4 次。
> - **量化实测：** 12k→24k 地址 60.87→535.52 ms（8.80×），200k 项达 119.6 s；40,000 项 To 使同进程 `/health` 延后 8.38 s，9.1.0 快约 21–416×。
> - **第四路径：** 地址对象数组超过引擎参数上限（本机 110,092 项）抛 `RangeError`，属确定性异常而非性能停摆。
> - **修复与防御：** `push`／逆序构建／`Set`／逐步收集四处改回 O(n)，`34da642` 修正 Set 每头重建的回归；`maxRecipients`（默认 10 万）在解析后才检查且不含 Reply-To，请求体限额必须前置于解析；依赖同事件循环的自监控在停摆期间结构性失明。

> 面向安全研究人员的漏洞分析与研究共享文章。  
> 分析基准： `nodemailer@9.0.6` （受影响）与 `nodemailer@9.1.0` （修复），本地固定于发布 commit `4e467a8` / `efd6e29` 。  
> 全部实验在本地隔离 Docker 容器（Node `v22.21.1` 、Linux arm64、单 CPU 限额、运行期无网络）中完成，不涉及任何真实第三方目标。

## 0\. 证据标注体系

全文关键论断按证据来源标注，每类证据的可直接审计落点如下：

|     |     |
| --- | --- | 
| 标注  | 含义与可直接审计的落点 |
| \[Official\] | [GHSA-2x7j-588g-ccc2 官方公告](https://github.com/advisories/GHSA-2x7j-588g-ccc2) · [v9.1.0 发布页](https://github.com/nodemailer/nodemailer/releases/tag/v9.1.0) |
| \[Source\] | 固定于发布 commit 的本地源码 worktree： `v9.0.6--4e467a8f/` · `v9.1.0--efd6e29c/` |
| \[Commit\] | 修复： `9116da9` · `7cc38af` · `34da642` · `83b8c48` ；引入： `6218b8d` · `fe27f7f` （commit 直链，含提交信息与回归测试） |
| \[Experiment\] | `experiments/` 下 25 个隔离实验，每个目录含 `README.md` （目标与运行说明）、 `REPORT.md` （方法与断言）与 `results/` 日志；逐路径的最小复现判据汇总见 §2 |
| \[Probe\] | `probes/sendmail-parser-callsites.js` （说明见 `probes/README.md` ；其环境与主实验集不同，文中单独注明） |
| \[Inference\] | 合理推断，未获直接证据；推断依据随文说明 |

文中行号引用以 `文件:行号` 形式给出，除特别说明外均指向 `v9.0.6--4e467a8f` worktree。

关键数字与关键行为在首次出现处附溯源链接：实验目录指向该实验的 `REPORT.md` （代表性数字另附 `results/` 日志直链），源码引用附固定于上述发布 commit 的 GitHub permalink，修复与引入附 commit 直链。同一来源的后续出现不再重复标注，§9 各修复小节标题中的 commit 链接除外，便于跳转。

* * *

## 1\. 漏洞概述

GHSA-2x7j-588g-ccc2（无关联 CVE）是 npm 包 `nodemailer` 中一组 **算法复杂度缺陷** （CWE-400 / CWE-407），官方 CVSS 3.1 为 **7.5（AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H）**，影响所有 `< 9.1.0` 版本，修复版本 9.1.0，报告者 e1abrador。v9.1.0 与仓库安全公告（published to `nodemailer/nodemailer` ）均为 2026-09-01 发布；GitHub Advisory Database 的发布/审核记录为 2026-09-08。本文时间线统一采用\*\*仓库公告与版本发布日（9 月 1 日）\*\*为口径，数据库页面日期仅在需区分两处记录时注明。\[Official\]

它不是内存安全漏洞，也不是逻辑越权。它的本质是： **地址解析层中存在三条相互独立的超线性（近二次）性能路径与一个参数上限触发的异常路径，而地址解析在 Node.js 的单线程事件循环上同步执行**。攻击者只要能让应用把一个精心构造的地址字符串传入 `To` / `Cc` / `Bcc` / `From` / `Reply-To` 等结构化地址字段（默认 `sendMail()` 路径即可），一次调用就能让整个进程停滞数秒到两分钟，期间同进程的所有请求、健康检查乃至监控心跳全部停摆。\[Official\] \[Experiment\]

漏洞落在两个模块、两个层次上：

-   **词法/语法解析层** `lib/addressparser/index.js` ：把逗号分隔的地址字符串解析为对象数组。这里有两条超线性路径（ `concat()` 累计器与 `splice()` 片段合并），以及"解析结果不被缓存、一次发送内被重复执行"的问题。
-   **MIME 信封构建层** `lib/mime-node/index.js` ：把解析结果渲染回头部字符串并构建 SMTP 信封。这里有第三条超线性路径（线性扫描去重）和一条独立的参数上限崩溃路径（ `[].concat.apply` 展平触发引擎参数上限，抛出与收件人毫无关系的 `RangeError` ）。

先把安全边界失效的位置说清楚：Nodemailer 是一个 **库**，它对调用方的隐含假设是"传入的地址列表规模与应用场景匹配"（人写的邮件不会有一万个收件人）。这个假设从未在库内转化为任何可执行的约束——没有输入长度上限、没有地址数上限、没有解析预算。当互联网另一端的攻击者可以通过应用的 HTTP 接口直接决定这个"列表规模"时，假设便失效了。 **缺失的约束 + 二次方的实现 + 同步执行的运行时 = 远程拒绝服务。**

### 漏洞生命周期时间线

|     |     |     |
| --- | --- | --- |  
| 时间  | 事件  | 证据  |
| 2017-01-31 | `6218b8d` （v3.0.0 EUPL 重构）： `concat()` 累计器与 `[].concat.apply` 展平进入代码库 | \[Source\]（ `git log -S` ） |
| 2026-03-09 | `fe27f7f` （修复显示名碎片合并）： `splice()` 合并循环进入，引入一条 **新的** 二次路径 | \[Source\] |
| ≥2026-03-18 | `mime-node` 模块简化重构中可见 `uniqueList.some()` 去重形状（本地仓库为部分克隆，更早历史未验证） | \[Source\]（部分验证） |
| 2026-08 下旬 | e1abrador 报告 | \[Official\] |
| 2026-08-31 11:55:30–12:39:28（作者时间，UTC+3；即 08:55:30Z–09:39:28Z，跨度 43 分 58 秒） | 维护者连续完成四个修复 commit（ `9116da9` → `7cc38af` → `83b8c48` → `34da642` ）；四者的提交者时间因批量操作完全相同（13:45:39+03:00），"44 分钟"按作者时间计 | \[Commit\] |
| 2026-09-01 | v9.1.0 发布；仓库安全公告发布（GitHub Advisory Database 的发布/审核记录为 2026-09-08，口径说明见上） | \[Official\] |

一条沉睡 9 年 7 个月的路径（ `concat` 累计器，2017-01-31 至 2026-08-31）与一条仅存在约 6 个月的路径（ `splice` 合并）最终在同一个 advisory 里被一起修复——前者是"重构时无人审复杂度"的遗留，后者是"功能修复引入新退化"的教科书案例。

### 路径 × 版本矩阵："< 9.1.0" 是各路径的并集

官方"影响所有 `< 9.1.0` "针对的是四条路径的 **并集**，不代表每个旧版本都同时包含全部四条。各路径的引入、已验证范围与修复边界：

|     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- |     
| 路径  | 引入  | 已验证受影响版本 | 未验证范围 | 修复  | 证据等级 |
| ① `concat()` 累计器（超线性） | `6218b8d` ，2017-01-31（随 v3.0.0） | 92 个稳定 6.x–9.0.x 冻结包逐一保留该行并正常解析（§2）；9.0.6 的行为与耗时 | pre-6（1.x–5.x）与预发布线 | `9116da9` | \[Source\]+\[Experiment\]（高） |
| ② `splice()` 显示名合并（超线性） | `fe27f7f` ，2026-03-09 | 9.0.6（§6.2） | 该提交落地于哪个稳定发布版本未逐一核对；更早版本不含此路径 | `9116da9` | \[Source\]+\[Experiment\]（高） |
| ③ `some()` 线性查重（超线性） | 引入 commit 未定位；该形状在 ≥2026-03-18 的重构中可见（部分克隆，§12.2） | 9.0.6（§6.3） | 确切引入版本未确证，存在史可能长于可证历史 | `7cc38af` （其跨头回归由 `34da642` 修复） | \[Source\]（部分）+\[Experiment\]（高） |
| ④ `concat.apply` 展平（参数上限异常） | `6218b8d` ，2017-01-31（随 v3.0.0） | 9.0.6（§6.4） | 92 包矩阵仅核对了累计器一行，展平在其余版本未逐一确认 | `83b8c48` | \[Source\]+\[Experiment\]（高） |

* * *

## 2\. 研究环境与证据基础

静态分析材料：

-   固定于发布 commit 的两个源码 worktree： `v9.0.6--4e467a8f` 、 `v9.1.0--efd6e29c` 。\[Source\]
-   四个修复 commit 的完整 diff 与提交信息（含维护者在提交信息中记录的性能数据与归因）。\[Commit\]

动态验证材料（全部为本地隔离实验）：

-   对照版本： `nodemailer@9.0.6` （受影响）vs `nodemailer@9.1.0` （修复）。
-   运行环境： `node:22.21.1-alpine3.22` （digest 固定），Linux arm64，单 CPU 限额，运行期 `network_mode: none` ，无端口、无宿主挂载、非 root、只读根文件系统、 `no-new-privileges` 。
-   输入：合成 `.invalid` 顶级域地址，绝不连接 SMTP、绝不发送真实邮件。
-   25 个实验全部通过断言复验，逐项方法与日志见 `experiments/*/REPORT.md` 与 `experiments/*/results/` 。

版本边界的源级验证： `experiments/version-boundary-matrix/` 构建期冻结了 92 个稳定 6.x–9.0.x 发布包（tarball URL 与 SRI 固定），逐一确认 **每个包都保留旧** `parsedAddresses = parsedAddresses.concat(...)` **累计器**，且能正常加载与解析； `9.1.0` 对照组已移除。\[Experiment\] 这为官方 `< 9.1.0` 范围提供了稳定发布线上源码与运行时的双重证据（pre-6 与预发布版本未验证，官方无下界的表述未被本地完全覆盖）。该矩阵核对的只是累计器一行——它也是唯一覆盖全部 92 个包的路径；各路径的版本覆盖差异见 §1 的路径×版本矩阵。

补充的调用链探针（本文新增，环境为 macOS arm64 / Node v24.20.0 / `nodemailer@9.1.0` ，仅用于确认调用关系，不用于计时）：包装 `require.cache` 中的 `lib/addressparser` ，在每次进入解析器时记录输入大小与完整调用栈。\[Probe\]

**最小复现入口** （以主根因实验为例；25 个实验同构，任一实验均为 `cd experiments/<实验名> && ./scripts/verify.sh` ，前提见各实验 `README.md` ）：

```bash
cd experiments/flat-addressparser-scaling && ./scripts/verify.sh
```

预期行为：脚本固定两版依赖并构建镜像，在运行期无网络的容器中执行断言化基准；全部断言通过时以退出码 0 结束并打印 `verification passed; log: experiments/flat-addressparser-scaling/results/<UTC 时间戳>.log` ，完整日志与镜像元数据写入同目录 `<时间戳>.log` 与 `<时间戳>.meta.txt` 。日志末尾的 JSON 汇总给出两版三次采样的中位数与 12,000→24,000 项的增长比——9.0.6 的 `ratio` 约 8.8（超线性断言）、9.1.0 约 1.6（近线性断言）；地址保留断言内建于 verifier，任一断言失败即非零退出并保留现场。

**最小复现判据表** （下表"实验"列即目录名，每格数字见对应 `REPORT.md` 与 `results/` 日志）：

|     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- |     
| 路径  | 良性对照 | 触发输入形状 | 9.0.6 预期 | 9.1.0 预期 | 实验 / 代表日志 |
| ① `concat` 累计器 | 两地址输入两版均返回 2 项 | `a@b.invalid,` 重复 12,000 / 24,000 次 | 60.87→535.52 ms（8.80×，超线性断言） | 9.23→15.17 ms（1.64×，近线性断言）；两版均完整保留全部地址 | `flat-addressparser-scaling` / `20260917T112344Z.log` |
| ② `splice` 显示名合并 | 单条含逗号显示名输入两版均合并为 1 项 | `a, b <c@d.invalid>,` 重复 6,000 / 12,000 段 | 63.69→595.41 ms（9.35×） | 10.27→24.22 ms（2.36×）；两版每段均合并为 `{name:'a, b', address:'c@d.invalid'}` | `display-name-merge-scaling` / `20260917T112400Z.log` |
| ③ `some()` 去重（单头） | 两收件人信封两版均保留 2 项 | 单个 To 头内 7,000 / 14,000 个互异 `.invalid` 地址 | 120.53→330.93 ms（2.75×） | 20.58→41.45 ms（2.01×）；两版均保留全部互异收件人 | `mime-envelope-dedupe-scaling` / `20260917T112419Z.log` |
| ③ `some()` 去重（跨头） | 同上  | 10,000 / 20,000 个各含 1 个互异地址的独立 To 头 | 189.53→471.19 ms（2.49×） | 36.71→52.41 ms（1.43×）；两版首末与总数完整 | `mime-many-headers-scaling` / `20260917T112251Z.log` |
| ④ `concat.apply` 展平 | 两地址对象数组两版均成功 | 地址对象数组，二分边界 110,091 / 110,092 项（本环境） | 110,091 项完整成功；110,092 项抛 `RangeError` | 110,092 项 147.09 ms、200,000 项 289.28 ms，均完整保留 | `array-flatten-threshold` / `20260918T120108Z.log` |
| 服务层传播（参考应用） | 两地址输入下 `/health` 两版均约 1.4–1.7 ms | 无认证 `POST /preview` ， `to` 为 40,000 项平坦列表（1,268,889 字节） | 同进程 `/health` 8,376.96 ms | 394.14 ms（约 21.3×）；两版均完整保留 40,000 项 | `closed-network-http-stall` / `20260918T103135Z.log` |

* * *

## 3\. 攻击面：不可信输入如何到达解析器

### 3.1 入口与可控性

Nodemailer 的公开 API 是 `transporter.sendMail(mailOptions)` 。 `mailOptions` 的 `to` 、 `cc` 、 `bcc` 、 `from` 、 `replyTo` 字段接受字符串、对象或数组，最终都会汇入地址解析。攻击入口不在 Nodemailer 自己—— **库本身不监听任何端口**——而在把外部输入映射到这些字段的应用：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5552ba579b19c1f.png)

*图 1：攻击入口与传播路径——外部可控字符串经应用映射进入地址字段，在单线程事件循环上同步解析，造成同进程整体停摆*

输入可控性分层：

|     |     |     |
| --- | --- | --- |  
| 输入  | 可控性 | 说明  |
| 地址字符串内容与长度 | **完全可控** （前提：应用把不可信输入传入地址字段） | \[Official\] 明确以此为可达条件 |
| 地址数量、重复/唯一、是否成组、是否含显示名 | 完全可控 | 决定命中哪一条退化路径（见 §6） |
| 是否触发解析 | 间接可控 | 由应用调用 `sendMail()` 或直接使用导出的 `nodemailer/lib/addressparser` 决定 |
| 是否需要认证/特定配置 | 不需要特定库配置或 SMTP 接收方配合 | \[Official\]：Nodemailer 默认发送路径不要求特定库配置或 SMTP 接收方配合；攻击者是否需通过应用认证，取决于业务入口（部署命题，§3.2） |

四个结构化地址字段（Cc、Bcc、From、Reply-To）经公开 `sendMail()` 的可达性由四个专属实验分别验证：12,000 项输入在 9.0.6 与 9.1.0 间观察到约 4.8–5.9× 的耗时差（Cc 5.85×、Bcc 5.63×、From 5.54×、Reply-To 4.83×），且两版都完整保留全部地址。\[Experiment\]（ `public-sendmail-cc-path` 、 `public-sendmail-bcc-path` 、 `public-sendmail-from-path` 、 `public-sendmail-reply-to-path` ）To 字段没有同口径的专属实验：其经公开路径的可达性由参考应用实验覆盖—— `closed-network-http-stall` 等以 40,000 项 To 为输入，观察到同进程 `/health` 延后约 21.3×（§3.2）；该口径（服务层健康检查延后）与上述"12,000 项公开调用耗时差"不同，不能并列比较。

Bcc 路径还有一个现实注脚：批量密送（newsletter、通知群发）本身就是把大列表传入 `bcc` 的合法场景，这条业务路径与攻击路径在库层完全同构。应用开发者很难凭直觉区分"我的 10 万订阅者列表"与"攻击者的 10 万个伪造地址"，因为它们在进入解析器之前没有任何差别。

### 3.2 一个参考应用中的完整传播

`experiments/closed-network-http-stall/` 用一个最小参考应用固化了传播路径：无认证的 Express 风格 `POST /preview` 接收 JSON 中的 `to` 字段，直接传入公开 `sendMail()` （流式内存传输，不连接 SMTP）。40,000 项 `.invalid` 地址（1,268,889 字节）提交后：

-   9.0.6：同进程 `/health` 请求耗时 **8,376.96 ms**
-   9.1.0：同进程 `/health` 请求耗时 **394.14 ms** （约 21.3× 差异）

两版均完整保留全部收件人。\[Experiment\]（原始日志： `20260918T103135Z.log` ）

这不是对任何真实服务的测试——它证明的是传播路径的存在性： **只要应用存在"外部字符串 → 地址字段"的映射，公开 API 路径即可把同进程 HTTP 服务显著延后**。真实部署是否存在该映射、是否有认证挡在前面，属于部署层命题，库层实验不回答。

* * *

## 4\. 完整调用链：从 sendMail() 到 addressparser()

### 4.1 调用链总览

![⚠️ 图片托管失败](https://xz.aliyun.com/api/v2/files/fa19854b-f03c-3c3f-bb87-8bc3f70902eb)

*图 2：从* `sendMail()` *到* `addressparser()` *的调用链——四个解析触发点（黄色）各自完整重跑同一个无缓存的同步解析器（红色）*

三层职责与关键参数：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 层   | 函数  | 职责  | 输入来源 | 关键行为 |
| 编排层 | `Mailer.sendMail` | 走插件、编译、检查、流式传输 | 应用传入的 `mailOptions` | 9.1.0 在此做 `maxRecipients` 检查 |
| 组装层 | `MailComposer.compile` | 组 MIME 树、设置头部 | `mailOptions` 各字段 | 逐字段 `setHeader` |
| 节点层 | `MimeNode` | 头部惰性编码、信封构建 | `setHeader` 存下的原始值 | `_parseAddresses` / `_convertAddresses` |
| 解析层 | `addressparser` | 字符串 → 地址对象数组 | 上层传入的原始字符串 | 纯同步、无缓存、可重入 |

### 4.2 惰性解析：setHeader 只存储原始值

地址字段进入 MIME 树的入口在 `MailComposer.compile()` 的末尾——它把 `mailOptions` 的每个结构化字段逐个挂到根节点上，随后立即生成 Message-Id（这是第一处解析触发点，见 §4.3）：

```javascript
// lib/mail-composer/index.js:59-81（v9.0.6），compile() 末尾
// Add custom headers
if (this.mail.headers) {
    this.message.addHeader(this.mail.headers);
}

// Add headers to the root node, always overrides custom headers
['from', 'sender', 'to', 'cc', 'bcc', 'reply-to', 'in-reply-to', 'references', 'subject', 'message-id', 'date'].forEach(header => {
    const key = header.replace(/-(\w)/g, (o, c) => c.toUpperCase());
    if (this.mail[key]) {
        this.message.setHeader(header, this.mail[key]);    // ← 应用传入的 to/cc/bcc/... 原始值在此进入节点
    }
});

// Sets custom envelope
if (this.mail.envelope) {
    this.message.setEnvelope(this.mail.envelope);          // ← 仅当应用显式传入 envelope 时才调用
}

// ensure Message-Id value
this.message.messageId();                                  // ← 编译期就触发一次 getEnvelope()（§4.3）

return this.message;
```

而 `setHeader` 的实现（ `lib/mime-node/index.js:274` ， [GitHub permalink](https://github.com/nodemailer/nodemailer/blob/4e467a8fd298f47b481fb96888dc4658fde70a5b/lib/mime-node/index.js#L274-L325) ）把原始值原样存进 `this._headers` （ `{key, value}` ）， **不做任何解析或规范化**。\[Source\]

```javascript
// lib/mime-node/index.js:274-325（v9.0.6）
setHeader(key, value) {
    let added = false;

    // Allow setting multiple headers at once（对象/数组形式的分发分支，与本题无关，略）

    key = this._normalizeHeaderKey(key);

    const headerValue = {
        key,
        value                            // ← 原始值直接入列表：字符串就是字符串，不解析
    };

    // Check if the value exists and overwrite
    for (let i = 0, len = this._headers.length; i < len; i++) {
        if (this._headers[i].key === key) {
            if (!added) {
                // replace the first match
                this._headers[i] = headerValue;
                added = true;
            } else {
                // remove following matches
                this._headers.splice(i, 1);
                i--;
                len--;
            }
        }
    }

    // match not found, append the value
    if (!added) {
        this._headers.push(headerValue);
    }

    return this;
}
```

这意味着攻击者构造的超长字符串在 `compile()` 阶段只是被"挂"在节点上。真正的解析发生在所有下游需要地址语义的时刻：

1.  `getEnvelope()` （ `lib/mime-node/index.js:916` ）：遍历 `_headers` ，对 From/Reply-To/Sender/To/Cc/Bcc 每个头调用 `_convertAddresses(this._parseAddresses(header.value), ...)` ；
2.  `_encodeHeaderValue()` （ `lib/mime-node/index.js:1184` 的 `case 'To': ... case 'Reply-To':` 分支）：流式输出渲染头部字符串时再次调用 `_convertAddresses(this._parseAddresses(value))` 。

两者的入口 `_parseAddresses` （ `lib/mime-node/index.js:1059` ）承担"对象还是字符串"的分派：对已经是 `{address, name}` 对象的条目走快速路径（规范化后原样或复制返回），对字符串（正是攻击输入的形态）调用 `addressparser(address)` 完整解析——完整实现与它引出的第四条路径在 §6.4 逐行展开。\[Source\]

### 4.3 放大器一：getEnvelope() 没有缓存写回

`getEnvelope()` 的完整实现（ [v9.0.6 permalink](https://github.com/nodemailer/nodemailer/blob/4e467a8fd298f47b481fb96888dc4658fde70a5b/lib/mime-node/index.js#L916-L940) ；9.1.0 在此函数上仅多了去重 `Set` 的构建与传递，见 §9.3）：

```javascript
// lib/mime-node/index.js:916-940（v9.0.6）
getEnvelope() {
    if (this._envelope) {
        return this._envelope;    // 命中缓存
    }

    const envelope = {
        from: false,
        to: []
    };
    this._headers.forEach(header => {
        const list = [];
        if (header.key === 'From' || (!envelope.from && ['Reply-To', 'Sender'].includes(header.key))) {
            this._convertAddresses(this._parseAddresses(header.value), list);   // ← From 头也解析
            if (list.length && list[0]) {
                envelope.from = list[0].address;
            }
        } else if (['To', 'Cc', 'Bcc'].includes(header.key)) {
            this._convertAddresses(this._parseAddresses(header.value), envelope.to);   // ← 每个地址头各解析一次
        }
    });

    envelope.to = envelope.to.map(to => to.address);

    return envelope;              // ← 注意：从不写回 this._envelope
}
```

而 `this._envelope` 只有一个赋值点——应用 **显式** 调用 `setEnvelope()` 时（普通发送路径下即 §4.2 所示，仅 `mailOptions.envelope` 存在才会调用，默认没有）：

```javascript
// lib/mime-node/index.js:859-866（v9.0.6），setEnvelope() 开头
setEnvelope(envelope) {
    let list;

    this._envelope = {            // ← 唯一给 this._envelope 赋真实信封的地方（构造函数中它被初始化为 false）
        from: false,
        to: []
    };
    // …以下把显式传入的 envelope.from / to / cc / bcc 解析进 _envelope
```

于是 **每一次** `getEnvelope()` **都从头重新解析所有地址头**。\[Source\]

### 4.4 实测：同一字符串在一次 sendMail() 中被完整解析多次

调用栈探针（ `probes/sendmail-parser-callsites.js` ）在 `nodemailer@9.1.0` 上的实测结果。\[Probe\] **次数结论仅对本文探针配置成立** （macOS arm64 / Node v24.20.0 / `streamTransport` / From+To 两个字段 / 成功发送路径）：实际次数随地址字段数量、插件行为、传输层实现与拒绝路径变化，并非所有 transport 的固定契约。本节要确立的是"同一字符串被完整重复解析"这个结构性事实，具体次数只是该配置下的观察值。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7a372b66320503cc.png)

*图 3：一次* `sendMail()` *内同一地址字符串被重复解析（成功路径 4 轮、拒绝路径 2 轮；探针配置下的观察值）*

**成功路径** （300 项 To， `streamTransport` ）： `addressparser` 共被调用 **8 次**——每个 From/To 字符串各 4 次。调用方分别为：

|     |     |     |
| --- | --- | --- |  
| 轮次  | 调用栈来源 | 说明  |
| ①   | `messageId() → _generateMessageId → getEnvelope` | `compile()` 末尾生成 Message-Id 时取信封 |
| ②   | `mailer/index.js:202` （v9.1.0 行号） | `maxRecipients` 计数 |
| ③   | `mailer/index.js:251` / `stream-transport/index.js:45` （v9.1.0 行号） | 返回值 `info.envelope` 与传输层各自再取一次 |
| ④   | `_encodeHeaderValue` （v9.1.0 `mime-node/index.js:1254` ） | 头渲染 |

**拒绝路径** （100,001 项 To，触发 `EMAXRECIPIENTS` ）：每个 From/To 字符串各解析 **2 次** （共 4 次调用）——第 ① 轮（ `compile()` 内的 `messageId()` ）与第 ② 轮（ `maxRecipients` 计数），随后即被拒绝，未进入渲染与传输。

这与 `experiments/max-recipients-post-parse-cost/` 的观察精确吻合：100,001 项 To（3,188,922 字节）在拒绝前经历了 **4 次 parser 调用、6,377,888 输入字节** （= From 22B×2 + To 3,188,922B×2）。\[Experiment\]（原始日志： `20260919T061413Z.log` ）

这条"重复解析"事实对漏洞分析有两个直接含义：

1.  **攻击成本被结构性放大**：受影响版本中，超线性解析不是执行一次，而是每次取信封、每次渲染头部都完整重来。输入的每个字节被重复"付费"。
2.  **9.1.0 的** `maxRecipients` **检查发生在解析之后**：计数本身依赖 `getEnvelope()` ，而 `getEnvelope()` 必须先完成解析。这个时序问题在 §9.5 展开。

* * *

## 5\. addressparser 内部：数据如何流动

在进入退化路径之前，先建立解析器的正常数据流。 `addressparser(str, options)` （ `lib/addressparser/index.js:469` ）分四个阶段。\[Source\]

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b445ae45d3a57653.png)

*图 4：* `addressparser` *四阶段数据流——前三阶段均为线性，收尾阶段一（* `concat` *累计）与阶段二（* `splice` *合并）即路径①②所在*

### 5.1 词法分析：Tokenizer（O(n)，单遍）

`Tokenizer` （ `lib/addressparser/index.js:316` ）单遍扫描字符串，把输入切成 `operator` （ `<` `>` `(` `)` `"` `:` `,` `;` `[` `]` ）与 `text` 两种 token，维护 `operatorExpecting` 状态处理引号串/注释/尖括号的嵌套， `inDomainLiteral` 处理 `user@[IPv6:...]` 的域字面量：

```javascript
// lib/addressparser/index.js:316-367（v9.0.6），骨架
class Tokenizer {
    constructor(str) {
        this.str = (str || '').toString();
        this.operatorCurrent = '';
        this.operatorExpecting = '';        // 引号串/注释/尖括号配对状态
        this.inDomainLiteral = false;       // user@[IPv6:...] 域字面量状态
        this.list = [];
        // 操作符表：值 = 期待中的结束符（'' 表示立即成为独立 token）
        this.operators = { '"': '"', '(': ')', '<': '>', ',': '', ':': ';', ';': '' };
    }

    tokenize() {
        const list = [];
        for (let i = 0, len = this.str.length; i < len; i++) {   // 单遍、O(n)
            this.checkChar(this.str.charAt(i), /* nextChr */);
        }
        this.list.forEach(node => { /* trim 后过滤空值 */ });
        return list;                        // [{type:'operator'|'text', value}, ...]
    }

    checkChar(chr, nextChr) { /* 按 operatorExpecting / inDomainLiteral / operators 分派，略 */ }
}
```

它本身是线性的，不参与退化。

### 5.2 段分割：按, /; 切成"一个地址的 token 序列"

```javascript
// lib/addressparser/index.js:469-498（v9.0.6），addressparser() 入口
function addressparser(str, options) {
    options = options || {};
    const depth = options._depth || 0;

    // Prevent stack overflow from deeply nested groups (DoS protection)
    if (depth > MAX_NESTED_GROUP_DEPTH) {
        return [];
    }

    const tokenizer = new Tokenizer(str);
    const tokens = tokenizer.tokenize();       // ← §5.1 的词法分析

    const addresses = [];                      // 每个元素 = 一个地址的 token 序列
    let address = [];
    let parsedAddresses = [];                  // 最终返回的地址对象列表（§5.4 的累计器）

    tokens.forEach(token => {
        if (token.type === 'operator' && (token.value === ',' || token.value === ';')) {
            if (address.length) addresses.push(address);
            address = [];
        } else {
            address.push(token);
        }
    });

    if (address.length) {                      // 收尾：最后一段没有尾随逗号也要入列
        addresses.push(address);
    }

    // …以下进入 §5.3 的逐段处理与 §5.4 的收尾两阶段
```

n 个逗号分隔的地址 → `addresses` 数组 n 个元素，每个元素是一段 token 序列。 **攻击输入** `a@b.invalid,a@b.invalid,...` **在这里成为 n 个单地址段。**

### 5.3 单段处理：\_handleAddress（O(段长)）

`_handleAddress` （ `lib/addressparser/index.js:139` ）对每段 token 做状态机处理： `<` 切入地址态、 `(` 切入注释态、`:` 切入组态（ `isGroup` ）；无地址时从文本回退提取 addr-spec；组递归调用解析器本身，受深度上限保护：

```javascript
// lib/addressparser/index.js:139-149, 153-179 与 207-227、287-304（v9.0.6），节选
function _handleAddress(tokens, depth) {
    let isGroup = false;
    let state = 'text';
    const addresses = [];
    const data = {
        address: [],      // 尖括号内的 addr-spec 片段
        comment: [],      // 括号注释
        group: [],        // 组成员片段
        text: []          // 显示名等其余文本
    };
    let insideQuotes = false;

    // Filter out <addresses>, (comments) and regular text
    for (let i = 0, len = tokens.length; i < len; i++) {    // 单遍、O(段长)
        const token = tokens[i];
        if (token.type === 'operator') {
            switch (token.value) {
                case '<': state = 'address'; break;
                case '(': state = 'comment'; break;
                case ':': state = 'group'; isGroup = true; break;
                case '"': insideQuotes = !insideQuotes; state = 'text'; break;
                default:  state = 'text'; break;
            }
        } else if (token.value) {
            data[state].push(token.value);    // 按 state 分拣进 data 的对应槽（noBreak 合并逻辑略）
        }
    }

    if (isGroup) {
        // 组：把成员片段重新拼成字符串，递归调用解析器本身（深度 +1，
        // 入口处受 MAX_NESTED_GROUP_DEPTH = 50 截断——CVE-2025-14874 的修复，见 §13.3）
        const parsedGroup = addressparser(data.group.join(','), { _depth: depth + 1 });
        // …展平嵌套组后：
        addresses.push({ name: data.text || '', group: groupMembers });
    } else {
        // 非组：若 '<' 未给出地址，从 text 反向扫描、以 ADDR_SPEC 正则回退提取 addr-spec（略）
        // …合并文本、恢复 addr-spec 后：
        addresses.push({
            address: data.address || data.text || '',
            name: data.text || data.address || ''
        });
    }

    return addresses;   // 本段产出的对象数组；平坦输入段恰好返回 1 个元素
}
```

每段独立、每段线性。 **这一层不是问题。**

### 5.4 收尾两阶段：退化所在

紧接 §5.2 的片段（ `addresses` 、 `parsedAddresses` 均为其中声明的变量），每个地址段被 `_handleAddress` 转成对象后进入两个收尾阶段：

```javascript
// lib/addressparser/index.js:500-518（v9.0.6）
addresses.forEach(addr => {
    const handled = _handleAddress(addr, depth);
    if (handled.length) {
        parsedAddresses = parsedAddresses.concat(handled);   // ← 阶段一：累计（路径一）
    }
});

// Merge fragments produced when unquoted display names contain commas.
// "Joe Foo, PhD <joe@example.com>" is split on the comma into
// [{name:"Joe Foo", address:""}, {name:"PhD", address:"joe@example.com"}].
// Recombine: a name-only entry followed by an entry with both name and address.
for (let i = parsedAddresses.length - 2; i >= 0; i--) {      // ← 阶段二：显示名片段合并（路径二）
    const current = parsedAddresses[i];
    const next = parsedAddresses[i + 1];
    if (current.address === '' && current.name && !current.group && next.address && next.name) {
        next.name = current.name + ', ' + next.name;
        parsedAddresses.splice(i, 1);
    }
}
```

阶段一把每段的对象拼成总列表，阶段二修复"未加引号的显示名里含逗号"造成的碎片（例如 `Joe Foo, PhD <joe@example.com>` 会被逗号切成 `[{name:'Joe Foo', address:''}, {name:'PhD', address:'joe@example.com'}]` ，需要重新合并为 `{name:'Joe Foo, PhD', ...}` ）。两个阶段的实现都是二次方的——这是下一节的主题。

* * *

## 6\. 四条退化路径逐行分析

四条路径相互独立，可分别触发，也可叠加生效。前三条是时间上的超线性（近二次）性能路径，第四条是参数上限触发的异常边界——它不是二次耗时路径。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/907c0722b6451f4e.png)

*图 5：两个模块上的四条退化路径——①②③导致同步停摆（可叠加生效），④触发确定性* `RangeError`

### 6.1 路径一（主根因）：concat() 累计器

（源码： [v9.0.6 permalink](https://github.com/nodemailer/nodemailer/blob/4e467a8fd298f47b481fb96888dc4658fde70a5b/lib/addressparser/index.js#L500-L505) `lib/addressparser/index.js:500-505` ）

```javascript
// lib/addressparser/index.js:500-505（v9.0.6）
addresses.forEach(addr => {
    const handled = _handleAddress(addr, depth);
    if (handled.length) {
        parsedAddresses = parsedAddresses.concat(handled);   // ← 目标行
    }
});
```

**为什么这是 O(n²)**： `Array.prototype.concat` 不修改接收者，而是 **分配一个全新的数组** 并复制两侧所有元素。设输入为 n 个单地址段（ `_handleAddress` 对每段返回 1 个对象），第 k 次迭代复制 `(k-1) + 1 = k` 个元素：

```latex
总复制量 = 1 + 2 + 3 + ... + n = n(n+1)/2 = O(n²)
总分配量 = n 个中间数组，第 k 个容量 ~k → 累计分配 O(n²) 个槽位
```

每一轮产生的"旧 `parsedAddresses` "在下一轮 `concat` 后立即成为垃圾。时间二次方与分配压力二次方是同一行代码的两个后果——后者在 GC 层面被直接观测到（见下）。

**语义对照** （为什么修复不改变行为）：目标行等价于"把 `handled` 的元素追加到 `parsedAddresses` 末尾"。 `push` 正是原地追加语义，摊销 O(1)。唯一语义差异是 `concat` 每次返回新数组、 `push` 复用旧数组——而 `parsedAddresses` 在此作用域内没有其他别名引用，替换与原地修改不可区分。\[Source\]

**触发输入**：任意逗号分隔的平坦地址列表，如 `a@b.invalid,` 重复 n 次。这是最朴素、最无歧义的攻击形态—— **不需要** 显示名、不需要尖括号、不需要组、不需要重复地址。唯一性、合法性都不影响这条路径（每个不同地址都独立走一次 `concat` ）。

**实验证据链** （三条独立证据把这一行钉死为充分原因）：

1.  **版本对照** （ `experiments/flat-addressparser-scaling/` ，原始日志 `20260917T112344Z.log` ）：9.0.6 在 12,000→24,000 项为 60.87→535.52 ms（**8.80×**，2× 输入 8.8× 时间，即近二次）；9.1.0 为 9.23→15.17 ms（1.64×，近线性）。两版输出完整保留全部地址。\[Experiment\]
2.  **反事实对照** （ `experiments/concat-accumulator-counterfactual/` ）——归因的关键实验：把 **同一份** 9.0.6 依赖树复制为两份，唯一差异是把目标行替换为 `parsedAddresses.push(...handled);`（构建期断言两份源码 SHA-256 仅此一行不同，运行时再次校验）。结果：12k→24k 墙钟/CPU 增长从 **8.90×/8.95×** 降至 **2.04×/2.04×**，且两地址、12k、24k 三组输入的解析输出 **逐项完全相同**。\[Experiment\]这排除了"9.0.6 与 9.1.0 之间还有其他差异"的混淆：在平坦列表路径上，这一行就是超线性增长的充分原因，替换它不改变任何解析语义。
3.  **GC 旁证** （ `experiments/concat-accumulator-gc-observation/` ）：32,000 项（384,000 字节）输入下，原始 9.0.6 的解析区间内 `PerformanceObserver` + `--trace-gc` 记录到 **4,746 个 GC 事件、总暂停 643.89 ms** （解析共 1,375.29 ms）；仅替换累计器行的副本为 **58 个事件 / 8.56 ms** （解析 30.01 ms）；9.1.0 为 59 个 / 9.61 ms。相对反事实副本，GC 事件约 **81.8×**、暂停约 **75.2×**。\[Experiment\]注意归因边界：GC 观测是引擎级旁证，证明"反复临时分配 + GC 参与旧版成本"，不等于全部瞬时分配字节的精确测量，也不解释全部墙钟时间（其余是纯复制与写屏障成本）。

**官方对照数据** （报告者环境，9.0.6， `'a@b.com,'.repeat(n)` ）：\[Official\]

|     |     |     |
| --- | --- | --- |  
| 地址数 | 输入  | 解析时间 |
| 25,000 | 0.19 MB | ~0.35–0.38 s |
| 50,000 | 0.38 MB | ~1.4 s |
| 100,000 | 0.76 MB | ~6–8 s |
| 200,000 | 1.53 MB | ~25–30 s |

2× 输入 ≈ 4× 时间，二次形状与本地实验一致。本地单 CPU 容器中同规模更慢（200,000 项为 119.59 s， `experiments/published-scale-profile/` ）——环境差异（CPU 限额、arm64、地址串更长）所致，绝对秒数不可跨环境外推。\[Experiment\]

### 6.2 路径二：splice() 显示名片段合并

（源码： [v9.0.6 permalink](https://github.com/nodemailer/nodemailer/blob/4e467a8fd298f47b481fb96888dc4658fde70a5b/lib/addressparser/index.js#L511-L518) `lib/addressparser/index.js:511-518` ）

```javascript
// lib/addressparser/index.js:511-518（v9.0.6）
for (let i = parsedAddresses.length - 2; i >= 0; i--) {
    const current = parsedAddresses[i];
    const next = parsedAddresses[i + 1];
    if (current.address === '' && current.name && !current.group && next.address && next.name) {
        next.name = current.name + ', ' + next.name;
        parsedAddresses.splice(i, 1);                        // ← 目标行
    }
}
```

**输入形状推导**：取维护者回归测试同构的片段 `a, b <c@d.invalid>,` 重复 n 次。词法切分后每对片段产生两段：

-   段 `[text(a)]` → `_handleAddress` 找不到地址 → `{name: 'a', address: ''}` （name-only 碎片）
-   段 `[text(b), <, c@d.invalid, >]` → `{name: 'b', address: 'c@d.invalid'}` （完整条目）

于是 `parsedAddresses` 长度为 2n，其中一半是碎片。合并循环逆序扫描，每个碎片命中条件（ `address === '' && name && next.address && next.name` ），执行 `next.name = 'a, b'` 并 `splice(i, 1)` 删除碎片—— **每次** `splice` **删除位置 i 的元素后，必须把 i 之后的所有元素前移一位**。n 次删除、平均每次移动 ~n 个元素：

```latex
总移动量 ≈ Σ (2n - i) over n 个碎片 ≈ n² → O(n²)
```

**为什么这条路径存在** （引入史）： `git log -S "parsedAddresses.splice"` 显示该循环由 **2026-03-09 的** `fe27f7f` （"fix: merge fragmented display names with unquoted commas in addressparser"）引入——这是一个 **正确的功能修复** （让 `Joe Foo, PhD <joe@example.com>` 不再被拆成两个条目），但它选择用"原地 `splice` 逐个摘除"来实现合并，无意中造出了第二条二次路径，存续约 6 个月后被 `9116da9` 重写。\[Source\] \[Commit\]

**实验证据** （ `experiments/display-name-merge-scaling/` ）：9.0.6 在 6,000→12,000 段为 63.69→595.41 ms（**9.35×**）；9.1.0 为 10.27→24.22 ms（2.36×）；每个片段在两版都正确合并为 `{name: 'a, b', address: 'c@d.invalid'}` ——语义保持。\[Experiment\]

**与路径一的关系**：输入含逗号显示名时两条路径 **叠加** （碎片先经 `concat` 累计、再经 `splice` 合并，双重二次方）；纯平坦地址列表只走路径一。两条路径由 `9116da9` 一次性修复，但触发输入形状不同。

### 6.3 路径三：\_convertAddresses 的线性扫描去重（官方标注的最严重路径）

退化发生在 `_convertAddresses` （ `lib/mime-node/index.js:1270-1299` ，v9.0.6， [GitHub permalink](https://github.com/nodemailer/nodemailer/blob/4e467a8fd298f47b481fb96888dc4658fde70a5b/lib/mime-node/index.js#L1270-L1299) ）—— `getEnvelope()` 与 `_encodeHeaderValue()` 渲染地址头时都到达这里，它一边把地址对象重新渲染为头部字符串（ `values` ），一边把 **未见过的** 地址收集进调用方传入的 `uniqueList` ：

```javascript
// lib/mime-node/index.js:1270-1299（v9.0.6），完整实现
_convertAddresses(addresses, uniqueList) {
    const values = [];

    uniqueList = uniqueList || [];

    [].concat(addresses || []).forEach(address => {
        if (address.address) {
            address.address = this._normalizeAddress(address.address);

            if (!address.name) {
                // an address that carries a special, be it a quoted local part or a domain
                // that could not be normalized, is only unambiguous inside angle brackets.
                // Without them a ',' or a ';' anywhere in it reads as a recipient separator
                // and the header would list more recipients than the envelope carries
                values.push(PLAIN_ADDRESS.test(address.address) ? address.address : `<${address.address}>`);
            } else {
                values.push(`${this._encodeAddressName(address.name)} <${address.address}>`);
            }

            if (!uniqueList.some(a => a.address === address.address)) {   // ← 目标行：每地址线性扫描已收集列表
                uniqueList.push(address);
            }
        } else if (address.group) {
            const groupListAddresses = (address.group.length ? this._convertAddresses(address.group, uniqueList) : '').trim();
            values.push(`${this._encodeAddressName(address.name)}:${groupListAddresses};`);
        }
    });

    return values.join(', ');
}
```

对每个地址， `some()` 线性扫描已收集的 `uniqueList` 判断是否已存在。 **n 个互不相同的收件人** （现实场景：群发邮件的收件人列表天然互异）：

```latex
第 k 个地址：some() 扫描 k-1 项全部 miss → Σ(k-1) ≈ n²/2 次地址字符串比较 → O(n²)
```

维护者在 `7cc38af` 提交信息中给出的量级： **100,000 个互异收件人约 35 秒**——并明确写道"这是修复 addressparser 之后现实场景仍然慢的原因"，官方公告也将其列为最严重的路径。\[Commit\] \[Official\]

**路径三还牵出一个关键的方法论细节**： `7cc38af` 的提交信息披露， **报告者的 PoC 重复同一个地址**。重复地址从第 2 个起， `some()` 第一次比较就命中退出， `uniqueList` 始终只有 1 项——这条路径在原始 PoC 下根本不退化。也就是说：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f65847b373edf428.png)

*图 6：触发形状 ≠ 最坏形状——原始 PoC（全同地址）只让路径①退化，路径③在互异收件人下仍停摆约 35 s / 100k（* `7cc38af` *前）*

**"用一个输入验证一个根因"的验证方式在这里失灵了**：只修 addressparser、只用原始 PoC 回归，一切看起来正常；换成互异收件人，服务照样停摆 35 秒。这是复杂度类漏洞与内存安全漏洞在验证方法上的本质差异——触发形状与最坏形状可以是两种输入。本地实验 `experiments/dedupe-after-parser-linearization/` 独立复现了这一分层：仅把 9.0.6 的 parser 累计器行替换为线性版本、MIME 源码逐字节保持 9.0.6，7,000→14,000 个互异收件人仍为 **2.71×** 超线性增长，14,000 项墙钟 253.55 ms，比 9.1.0（46.22 ms）高约 5.49×。\[Experiment\] 端到端口径的互补证据来自 `experiments/mime-envelope-dedupe-scaling/` ：单个 To 头内 7,000→14,000 个互异收件人，9.0.6 全程 120.53→330.93 ms（**2.75×** 超线性），9.1.0 为 20.58→41.45 ms（2.01×，近线性），两版均完整保留全部互异收件人。\[Experiment\]

**跨头维度**： `getEnvelope()` 对 **每个地址头** （To、Cc、Bcc，以及 `headers: { to: [...] }` 展开的每个数组项各成一个头）分别调用 `_convertAddresses` 。旧版把同一个 `envelope.to` 数组作为 `uniqueList` 传入每次调用，去重状态 **跨头保留**、并不重建——跨头退化的直接原因仍然是 `some()` 本身：每个新地址都要线性扫描这个不断增长的共享列表。跨头不会重置去重状态，因此对总计 N 个互异收件人，旧实现的总成员测试仍为 Σ(k−1) = O(N²)；地址如何分散到各个头，并不改变这一总量。多头维度的主要作用是暴露中间 `Set` 修复的重复建表成本。（"每个头从已有收件人重建 `Set` "是 `7cc38af` 中间补丁引入、再由 `34da642` 在发布前修复的回归，从未进入任何发布版本，见 §9.3——它不是 9.0.6 原始漏洞路径或 Root Cause 的一部分。） `experiments/mime-many-headers-scaling/` ：10,000→20,000 个各含一个不同地址的 To 头，9.0.6 为 189.53→471.19 ms（2.49×），9.1.0 为 36.71→52.41 ms（1.43×）。\[Experiment\]

### 6.4 路径四：\[\].concat.apply 展平与 RangeError

（源码： [v9.0.6 permalink](https://github.com/nodemailer/nodemailer/blob/4e467a8fd298f47b481fb96888dc4658fde70a5b/lib/mime-node/index.js#L1059-L1082) `lib/mime-node/index.js:1059-1082` ）

```javascript
// lib/mime-node/index.js:1059-1082（v9.0.6），完整实现
_parseAddresses(addresses) {
    return [].concat.apply(
        [],
        [].concat(addresses).map(address => {
            if (address && address.address) {
                const normalized = this._normalizeAddress(address.address);
                if (normalized === address.address && typeof address.name === 'string') {
                    // there is nothing to rewrite, so there is nothing to keep off the original
                    return [address];       // ← 对象地址：包成单元素数组返回
                }

                // rewriting would land on the object the caller passed in and might
                // still hold a reference to, so rewrite a copy of it instead. An own
                // "__proto__" key would make the copy inherit from caller data, and
                // _convertAddresses reads `group` off it straight into the envelope
                const copy = shared.copyOwnKeys({}, address);
                copy.address = normalized;
                copy.name = address.name || '';
                return [copy];              // ← 规范化副本：同样是单元素数组
            }
            return this._normalizeParsedAddresses(addressparser(address));   // ← 字符串：完整解析，返回多元素数组
        })
    );
}
```

`map` 的结果是 `[[addr1], [addr2], ..., [addrN]]` ， `[].concat.apply([], ...)` 把外层数组的 **每个元素作为独立实参** 传给 `concat` ——等价于 `[].concat(addr1, addr2, ..., addrN)` ，即 **N 个函数参数**。 `Function.prototype.apply` 的参数个数受引擎栈帧限制（V8 中随版本与架构变化，现代 64 位平台约 6.5 万–12 万余；该区间为经验推断 \[Inference\]，无官方文档保证——本文本地实测只锚定了 110,092 这一个边界点，见下）。超过上限时抛出：

```latex
RangeError: Maximum call stack size exceeded
```

——一个 **字面上与收件人毫无关系** 的错误信息：既不提示输入过大，也不提示是地址问题，排障时极具误导性。\[Commit\]（ `83b8c48` 提交信息："a large Bcc array failed with an error that says nothing about recipients"）

**边界的精确刻画** （ `experiments/array-flatten-threshold/` ）：在 Node `v22.21.1` / V8 12.4 / Linux arm64 上以二分搜索定位： **110,091 项完整成功，110,092 项首次抛** `RangeError` ；9.1.0 在 110,092 与 200,000 项均完整保留全部地址。维护者提交信息记录的边界是"约 124k"。\[Experiment\] \[Commit\]

两个数字不一致恰恰是重点： **这不是一个稳定的接口契约，而是引擎实现细节在应用层的溢出**。任何按"124k 以下是安全的"来设计的应用，换一个 Node 版本或 CPU 架构，边界就会移动。 `experiments/mime-large-array-flatten/` 的行为对照：同一批 200,000 个地址对象，9.0.6 处理 122.98 ms 后抛 `RangeError` ；9.1.0 用 228.96 ms 完整保留全部 200,000 项。\[Experiment\]

注意此路径的触发面与前两条不同：它要求应用把 **地址对象数组** （而非字符串）传入字段—— `sendMail({ to: [{address:'...'}, ...] })` 或 `headers: { to: [...] }` 。数组项不经过 `addressparser` 字符串解析，但在 `_parseAddresses` 的展平处崩溃。 **这是一条拒绝服务路径（异常导致的请求失败），不是性能停摆路径**；它产生的能力是"让这封邮件失败"，而非"让进程停摆"（展平本身是线性的）。

### 6.5 小结：同一根因模式的三次实例化与一条独立的参数上限路径

|     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- |     
| #   | 位置  | 操作  | 复杂度来源 | 最坏输入形状 | 后果  |
| 1   | `addressparser/index.js:503` | `concat` 重建累计数组 | 每轮复制全部已收集元素 | 任意平坦列表（同/异址均可） | 同步停摆 |
| 2   | `addressparser/index.js:516` | `splice` 逐个摘除碎片 | 每次删除移动后续全部元素 | 含逗号显示名片段 | 同步停摆 |
| 3   | `mime-node/index.js:1289` | `some()` 线性查重 | 每地址扫描已收集列表 | **互异** 收件人 | 同步停摆（叠加解析重复执行） |
| 4   | `mime-node/index.js:1060` | `concat.apply` 参数展平 | 引擎参数上限 | 地址对象数组 > ~11 万项 | `RangeError` 异常 |

前三条超线性路径共享同一个模式： **用"每次操作付出与已积累规模成正比的代价"的实现去完成"累积 n 项"的任务**——第 1、2 条是数组重建/搬移，第 3 条是成员测试选错了数据结构（线性表代替哈希集合）；与之相伴的二次方级临时分配与 GC 压力主要归属第 1 条（ `concat` 每轮丢弃旧数组，§6.1 的 GC 观测）。第 4 条不属于这一模式：展平本身是线性的，它的问题是容量契约绑在引擎参数上限上——一条 **参数上限 DoS 路径** （确定性异常），而非二次耗时路径。

* * *

## 7\. 同步停摆：事件循环机理与服务层证据

### 7.1 为什么"解析慢"等于"全进程停摆"

`addressparser` 是纯同步函数：无 `await` 、无回调、无分片让出。Node.js 的事件循环模型决定了同步代码执行期间，事件循环阶段无法推进—— **所有已排队的回调** （定时器、已就绪的 I/O、新连接的 accept、 `setImmediate` ）都要等当前调用栈完全返回后才有机会执行。

这不是"这一个请求慢"的问题，而是 **同进程一切工作的最小延迟被抬高到本次解析的全时长**。单线程运行时里，CPU 密集的同步代码就是全局互斥锁。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b12096846c96e9a.png)

*图 7：同步解析阻塞事件循环——停摆期间所有已排队回调（定时器、就绪 I/O、新连接、监控心跳）被延后到同步调用返回之后*

### 7.2 直接观测（experiments/event-loop-starvation/）

在调用解析器 **之前** 预先入队一个 `setImmediate` 和一个 `setTimeout(0)` ，然后同步解析 100,000 项平坦地址（1,200,000 字节）：

-   9.0.6：解析耗时 **18,199.45 ms** （进程 CPU 29,956.08 ms）； `setImmediate` 与 `setTimeout(0)` 分别在 **18,199.91 / 18,200.01 ms** 才执行——与解析返回时刻相差不到 1 ms，明确记录为"解析返回后执行"。
-   9.1.0：相同输入解析 90.44 ms（约快 **201×**），两个回调 90.62 ms 执行。
-   两版均完整保留 100,000 个地址。\[Experiment\]（原始日志： `20260918T100525Z.log` ）

数字说明的事件循环语义： **预排队回调的执行时刻 = 同步调用返回时刻**，不是"被调度但变慢"。停摆期间进程对外表现为整体无响应。

### 7.3 有限重复负载下的可恢复性（experiments/closed-network-service-availability/）

三轮各一次 40,000 项预览、每轮 20 个并发 `/health` ：9.0.6 三轮中每个健康请求至少延后 **8,120.35 / 8,223.17 / 8,527.93 ms** （跨轮中位数的中位数 8,529.16 ms）；9.1.0 对应 360.40 ms（约 23.7×）。预览结束后的 100 个串行恢复请求 p95 仅 **0.214 ms** （9.0.6）/ 0.206 ms（9.1.0）。\[Experiment\]

结论的两面：大型处理 **反复** 发生时停滞 **反复** 出现（攻击者持续提交即持续压制）；但每次处理完成后 **未观察到延迟残留**——这是 **可恢复的资源耗尽**，不是状态损坏。这符合 CWE-400 的性质：不破坏数据、不留下持久后患，代价是可用性窗口的完全丧失。

### 7.4 监控悖论：进程内的心跳自己也在停摆（experiments/in-process-monitor-delay/）

同进程 50 ms 间隔的心跳 vs 独立进程 1 秒超时的外部探针，40,000 项输入下：

-   9.0.6：外部探针 **1,005.05 ms** 即判定未响应； **进程内心跳直到 14,599.38 ms** （预览完成后）才记录到延迟——心跳回调本身也在被延后的队列里。
-   9.1.0：外部请求 511.76 ms 返回，但固定 200 ms 阈值的进程内心跳仍在约 853.81 ms 告警。\[Experiment\]

两条结论可直接迁移： **依赖同事件循环的自监控在同步停摆期间结构性失明**，可用性监控必须来自进程外；且"修复版"不等于"无告警"——亚秒级的正常解析也会触发朴素阈值，监控阈值须按业务与版本重新校准。

* * *

## 8\. Root Cause

### 8.1 因果链

把前三条超线性路径抽象到同一高度，停摆漏洞的形成链是：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd5c0d39ceed1bbe.png)

*图 8：停摆漏洞的因果链——从缺失约束到全进程停摆；路径④不在此链上（灰色虚线）*

（路径四不在这条因果链上：它的失败不依赖超线性耗时，而是线性展平触碰引擎参数上限的确定性异常，见 §6.4 与 §11.1 的"附带原语"。）

### 8.2 被破坏的安全假设

**Root Cause = 错误安全假设 + 实现缺陷 + 缺失约束 + 敏感操作**，逐项对应：

-   **错误安全假设**："地址字段的规模与人工写信的场景匹配。"这个假设在 2017 年（ `concat` 引入时）或许近似成立；当库被用于把 HTTP 请求体里的字符串变成收件人列表时，输入规模的控制权已经转移到互联网上的任何人手里，而库内没有任何代码意识到这一点。
-   **实现缺陷**：三个"每步付出 O(当前规模) 代价"的超线性累积/查重实现，外加一个把容量契约绑在引擎参数上限上的展平实现（路径四，产生确定性异常而非停摆）。它们在小组输入下完全正确——这正是危险所在： **正确性测试永远通过，退化只在规模轴上显形**。
-   **缺失/失效约束**：没有任何一层（应用边界、 `sendMail` 入口、解析器入口）检查"这个字符串多长 / 多少个地址 / 解析了多久"。9.1.0 补上的 `maxRecipients` 也是解析 **之后** 的后备断言（§9.5）。
-   **敏感操作**：在单线程运行时上同步执行的、结果不被缓存的解析。

### 8.3 为什么九年多没被发现

`concat` 累计器自 2017-01-31 存在至 2026-08。\[Source\] 它没被发现的合理解释（\[Inference\]，但每个环节有证据支撑）：

1.  功能完全正确——输出的地址列表逐项无误，任何对拍测试都通过；
2.  小输入下无感——1,000 个地址解析 ~4 ms（ `version-boundary-matrix` 中 92 个版本都跑过 1,000 项输入，无人注意到耗时形状）；
3.  性能退化的可见门槛在万级地址以上，而正常邮件场景几乎不会自然到达；
4.  该文件并非没有安全审计史——它带着 CVE-2025-14874 的递归深度防护（ `MAX_NESTED_GROUP_DEPTH` ）、quoted local-part 防误路由修复等安全注释 \[Source\]——但既有审计的维度是 **内存/栈/语义**，复杂度作为安全属性不在检查清单上。

第 4 点是给审计者的核心教训： **同一个文件可以修完一类漏洞而完全看不见另一类**。递归深度上限防住了"深"，没人在意"宽"。

* * *

## 9\. Patch 分析与反向推导

四个修复 commit 在 2026-08-31 的 44 分钟内（作者时间口径；四者的提交者时间因批量操作相同，见 §1 时间线）连续完成，全部进入 v9.1.0。\[Commit\]

### 9.1 9116da9：addressparser 线性化（主修复）

```diff
     addresses.forEach(addr => {
         const handled = _handleAddress(addr, depth);
-        if (handled.length) {
-            parsedAddresses = parsedAddresses.concat(handled);
+        // Appended in place. Rebuilding the accumulator with concat() would copy every
+        // entry collected so far on each address, making a flat list cost O(n^2).
+        for (let i = 0; i < handled.length; i++) {
+            parsedAddresses.push(handled[i]);
         }
     });
```

```diff
     // Merge fragments produced when unquoted display names contain commas.
     // "Joe Foo, PhD <joe@example.com>" is split on the comma into
     // [{name:"Joe Foo", address:""}, {name:"PhD", address:"joe@example.com"}].
     // Recombine: a name-only entry followed by an entry with both name and address.
-    for (let i = parsedAddresses.length - 2; i >= 0; i--) {
+    // Walked back to front so that a run of fragments folds into one entry in a single
+    // pass. Splicing each fragment out of the list instead would cost O(n^2).
+    const mergedAddresses = [];
+    for (let i = parsedAddresses.length - 1; i >= 0; i--) {
         const current = parsedAddresses[i];
-        const next = parsedAddresses[i + 1];
-        if (current.address === '' && current.name && !current.group && next.address && next.name) {
+        const next = mergedAddresses.length ? mergedAddresses[mergedAddresses.length - 1] : null;
+        if (next && current.address === '' && current.name && !current.group && next.address && next.name) {
             next.name = current.name + ', ' + next.name;
-            parsedAddresses.splice(i, 1);
+        } else {
+            mergedAddresses.push(current);
         }
     }
+    mergedAddresses.reverse();
+    parsedAddresses = mergedAddresses;
```

**为什么切断链**：

-   路径一： `push` 摊销 O(1)，n 项累计 O(n)；不再产生中间数组垃圾（GC 事件从 4,746 降到 59 \[Experiment\]）。
-   路径二：改为 **逆序构建新数组**——遍历顺序与旧循环同为逆序，但"下一个条目"取自新建列表的尾部（ `mergedAddresses[mergedAddresses.length - 1]` ），合并只是修改尾部对象的 `name` ，不命中时才 `push` 。 **没有任何元素被搬移**，单遍 O(n)，最后 `reverse()` 恢复顺序（也是 O(n)）。

**语义等价性论证**：旧循环逆序扫描 `i` ，比较 `parsedAddresses[i]` （碎片）与 `parsedAddresses[i+1]` （右侧最近条目）；由于删除只发生在 `i` 处且扫描向左， `i+1` 处的条目要么是原始条目、要么是已被左侧碎片合并过的条目——碎片链 `a, b, c <x@y>` 从右向左逐层折叠为 `c, b, a` 形的名字。新循环同向扫描， `mergedAddresses` 尾部恰好始终是"当前已折叠的右侧最近条目"，折叠方向与层级完全一致。本地实验在 6,000/12,000 段输入上逐项对拍两版输出，完全一致。\[Experiment\] 维护者同时增加了大地址列表与显示名片段的线性时间回归测试。\[Commit\]

**修复的是 Root Cause 还是触发条件**：是 Root Cause——它替换的就是"重建式累积"这一错误实现本身，而非在输入侧加阈值。修复后该函数对任意 n 都是线性（实验 200,000 项 287.09 ms \[Experiment\]）。

### 9.2 7cc38af：Set 化去重

```diff
-    _convertAddresses(addresses, uniqueList) {
+    _convertAddresses(addresses, uniqueList, seenAddresses) {
         const values = [];
 
         uniqueList = uniqueList || [];
 
+        // Membership is checked once per address, so scanning uniqueList itself would make
+        // a recipient list cost O(n^2). Groups recurse with the same set so that a nested
+        // group still dedupes against the addresses collected around it, and a caller that
+        // passes a partly filled list (To, then Cc, then Bcc) keeps deduping across headers.
+        if (!seenAddresses) {
+            seenAddresses = new Set();
+            for (let i = 0; i < uniqueList.length; i++) {
+                seenAddresses.add(uniqueList[i].address);
+            }
+        }
+
         [].concat(addresses || []).forEach(address => {
             if (address.address) {
                 address.address = this._normalizeAddress(address.address);
 
                 if (!address.name) {
                     …                                    // 渲染 values.push(...)，与去重无关，略
                 } else {
                     values.push(`${this._encodeAddressName(address.name)} <${address.address}>`);
                 }
 
-                if (!uniqueList.some(a => a.address === address.address)) {
+                if (!seenAddresses.has(address.address)) {
+                    seenAddresses.add(address.address);
                     uniqueList.push(address);
                 }
             } else if (address.group) {
-                const groupListAddresses = (address.group.length ? this._convertAddresses(address.group, uniqueList) : '').trim();
+                const groupListAddresses = (
+                    address.group.length ? this._convertAddresses(address.group, uniqueList, seenAddresses) : ''
+                ).trim();
                 values.push(`${this._encodeAddressName(address.name)}:${groupListAddresses};`);
             }
         });
 
         return values.join(', ');
```

成员测试从 O(列表长) 降到 O(1) 摊销，总成本 O(n)。两个语义细节显示这不是机械替换：

1.  **组递归共享同一个** `Set` ——保证嵌套组内的地址仍与组外地址互相去重（回归测试 "should dedupe a group against the addresses around it"）；
2.  `Set` **作为参数跨调用传递**——调用方（ `getEnvelope` ）先处理 To 再处理 Cc、Bcc 时共用一个 `Set` ，跨头去重语义与旧实现一致（旧实现靠共享 `uniqueList` 数组天然跨头）。

维护者量级：100,000 个互异收件人从 ~35 s 降至 ~100 ms。\[Commit\]

### 9.3 34da642：修复的修复——一个值得单独学习的反例

`7cc38af` 引入了一个新缺陷（该状态仅存在于同日连续提交之间的中间补丁，未随任何版本发布）： `seenAddresses` 未传入时 **在函数入口从头重建**。 `getEnvelope()` 对每个地址头各调用一次 `_convertAddresses` ，于是每个头都要把已收集的收件人重新 `add` 进新 `Set` ——成本 O(头数 × 收件人数)。维护者在 `34da642` 提交信息中给出了量化：20,000 个收件人分布在 20,000 个头时， **Set 方案 4.4 s，反而慢于被它替换的线性扫描（0.4 s）**——因为 `Set.add` 的常数高于一次字符串比较。\[Commit\]

修复方式：把 `Set` 的构建提升到 `getEnvelope()` / `setEnvelope()` / `getAddresses()` 层， **整封信生命周期只建一次**、跨头携带（ `getEnvelope()` 的改动）：

```diff
         const envelope = {
             from: false,
             to: []
         };
+
+        // Built once and carried across the headers. Letting _convertAddresses seed it per
+        // call would cost O(headers x recipients), and a message can carry many address
+        // headers: `headers: { to: [...] }` emits one To per entry.
+        const seenRecipients = new Set();
+
         this._headers.forEach(header => {
             const list = [];
             if (header.key === 'From' || (!envelope.from && ['Reply-To', 'Sender'].includes(header.key))) {
                 this._convertAddresses(this._parseAddresses(header.value), list);
                 if (list.length && list[0]) {
                     envelope.from = list[0].address;
                 }
             } else if (['To', 'Cc', 'Bcc'].includes(header.key)) {
-                this._convertAddresses(this._parseAddresses(header.value), envelope.to);
+                this._convertAddresses(this._parseAddresses(header.value), envelope.to, seenRecipients);
             }
         });
```

修复后同场景 29 ms，100k 收件人 × 1000 头 95 ms（此前 14 s）。\[Commit\]

这一段的教训可以泛化： **修复复杂度漏洞时，必须同时审"新数据结构的构建成本放在哪个生命周期"**。把 O(n) 的准备步骤放进 O(m) 次调用的循环里，就是把一个二次方换成另一个二次方。第一版修复在"三个头"的默认假设下完全正确——而 `headers: { to: [...] }` 每个数组项发一个独立 To 头、 `addHeader` 是公开 API，头数量本身不受限。

### 9.4 83b8c48：逐步收集替换 concat.apply

```diff
     _parseAddresses(addresses) {
-        return [].concat.apply(
-            [],
-            [].concat(addresses).map(address => {
-                if (address && address.address) {
-                    const normalized = this._normalizeAddress(address.address);
-                    if (normalized === address.address && typeof address.name === 'string') {
-                        // there is nothing to rewrite, so there is nothing to keep off the original
-                        return [address];
-                    }
-
-                    // rewriting would land on the object the caller passed in and might
-                    // still hold a reference to, so rewrite a copy of it instead. An own
-                    // "__proto__" key would make the copy inherit from caller data, and
-                    // _convertAddresses reads `group` off it straight into the envelope
-                    const copy = shared.copyOwnKeys({}, address);
-                    copy.address = normalized;
-                    copy.name = address.name || '';
-                    return [copy];
-                }
-                return this._normalizeParsedAddresses(addressparser(address));
-            })
-        );
+        // Collected into one list as we go. concat.apply spreads the entries into arguments
+        // and throws a RangeError once a recipient array is long enough to pass the
+        // argument limit, which a large Bcc list reaches on its own.
+        const flattened = [];
+
+        [].concat(addresses).forEach(address => {
+            if (address && address.address) {
+                const normalized = this._normalizeAddress(address.address);
+                if (normalized === address.address && typeof address.name === 'string') {
+                    // there is nothing to rewrite, so there is nothing to keep off the original
+                    flattened.push(address);
+                    return;
+                }
+
+                // rewriting would land on the object the caller passed in and might
+                // still hold a reference to, so rewrite a copy of it instead. An own
+                // "__proto__" key would make the copy inherit from caller data, and
+                // _convertAddresses reads `group` off it straight into the envelope
+                const copy = shared.copyOwnKeys({}, address);
+                copy.address = normalized;
+                copy.name = address.name || '';
+                flattened.push(copy);
+                return;
+            }
+
+            const parsed = this._normalizeParsedAddresses(addressparser(address));
+            for (let i = 0; i < parsed.length; i++) {
+                flattened.push(parsed[i]);
+            }
+        });
+
+        return flattened;
     }
```

展平不再经过函数实参，元素个数不再受引擎参数上限约束——200,000 项数组从抛 `RangeError` 变为 228.96 ms 完整保留。\[Experiment\] 顺带消除了每地址一个中间单元素数组的分配。回归测试直接以 200,000 项数组断言 `doesNotThrow` 。\[Commit\]

**边界效应的消除方式**：修复不是"把上限提高到安全值"（上限是引擎细节，不可依赖），而是 **让代码路径不再经过有上限的机制**。凡是通过 `apply` /spread 把数组展开为实参的代码，其容量契约都建立在一个未文档化的引擎常量上。

### 9.5 maxRecipients：后置护栏的时序与两个盲区

v9.1.0 在编排层新增了一个默认上限及其检查（ `lib/mailer/index.js:18-23, 195-219` ，v9.1.0 worktree 行号； [常量定义 permalink](https://github.com/nodemailer/nodemailer/blob/efd6e29c10c6e0c25c57bd2f2a71302838235a4f/lib/mailer/index.js#L18-L23) 、 [检查点 permalink](https://github.com/nodemailer/nodemailer/blob/efd6e29c10c6e0c25c57bd2f2a71302838235a4f/lib/mailer/index.js#L195-L219) ）。常量的定义与维护者注释：

```javascript
// lib/mailer/index.js:18-23（v9.1.0）
/**
 * Recipients allowed on one message unless the caller sets its own maxRecipients. A backstop
 * against a runaway or hostile recipient list rather than a delivery policy: RFC 5321 only
 * asks a server to accept 100, so a real send is bounded far below this.
 */
const DEFAULT_MAX_RECIPIENTS = 100000;
```

检查点在 `Mailer.sendMail()` 的 compile 插件回调内，紧跟编译之后：

```javascript
// lib/mailer/index.js:195-219（v9.1.0），sendMail() 内（logger.error 分支略）
mail.message = new MailComposer(mail.data).compile();       // ① 编译——末尾 messageId() → getEnvelope()，第一轮解析

mail.setMailerHeader();
mail.setPriorityHeaders();
mail.setListHeaders();

const maxRecipients = mail.data.maxRecipients === undefined ? DEFAULT_MAX_RECIPIENTS : mail.data.maxRecipients;
const recipientCount = mail.message.getEnvelope().to.length;    // ② 计数——又一次完整的 getEnvelope() 解析

if (maxRecipients && recipientCount > maxRecipients) {
    const err = new Error(
        `Message has ${recipientCount} recipients, which is over the ${maxRecipients} allowed by maxRecipients`
    );
    err.code = errors.EMAXRECIPIENTS;                            // ③ 显式拒绝，抛错而非静默截断
    return callback(err);
}
```

维护者的注释自我定位很准确： **后备（backstop），不是输入护栏**。实验确认了两个结构性限制：

**限制一：检查在解析之后。** \[Probe\] 拒绝路径的调用栈显示，100,001 项 To 在到达检查前，已经在 `compile()` 末尾的 `messageId() → getEnvelope()` 中被完整解析过一次， `mailer/index.js:202` 的计数又触发第二次——From/To 字符串各 2 次、共 4 次 parser 调用（次数口径与配置边界见 §4.4）。\[Experiment\]（ `max-recipients-post-parse-cost/` ）100,001 项（3.19 MB）在 **924.93 ms** 后才以 `EMAXRECIPIENTS` 拒绝，250,000 项为 **2,224.90 ms**；预排队的 `setImmediate` 在拒绝后才执行，超限邮件未进入 stream 管线。

在 9.1.0（单次解析已线性）上这只是常数级浪费；但把它当成"防 DoS 措施"部署就会误判—— **它防住的是"超大信封进入传输层"，防不住"超大输入进入解析器"**。真正先于解析生效的护栏在应用层： `experiments/http-body-limit-before-parser/` 中 Express 5.1.0 默认 `express.json()` 限额对同一 308,898 字节请求返回 413，parser 调用次数为 **0**；同一应用把限额放宽到 2 MiB 后同一请求 200 并观察到 6 次 parser 调用。\[Experiment\]

**限制二：计数口径是信封收件人，Reply-To 不在内。** \[Source\] `getEnvelope()` 只把 To/Cc/Bcc 计入 `envelope.to` （From/Reply-To 只用于取发件人）。 `experiments/reply-to-max-recipients-bypass/` ：显式 `maxRecipients: 2` 、信封固定 2 个 To 时，100,001 与 250,000 项 Reply-To 均成功（250,000 项时 `sendMail()` 1,198.29 ms，头完整保留全部地址，信封保持 2 项）。\[Experiment\] 修复版中 Reply-To 的解析已是线性，所以这只是常数成本而非停摆；但"用 `maxRecipients` 推导'地址字段总解析量有界'"的推理不成立。

边界行为本身（ `experiments/max-recipients-default-boundary/` ）：默认 100,000 下，99,999 与 100,000 项均成功并完整进入流式传输，100,001 项以 `EMAXRECIPIENTS` 拒绝且从未进入 stream 管线—— **等值放行、超一拒收、显式报错而非部分成功**。\[Experiment\]

### 9.6 从 Patch 反推开发者的隐含假设

四个 commit 的修复方式共同暴露了原始代码的隐含假设集：

|     |     |     |
| --- | --- | --- |  
| Patch 改动 | 反推出的原始假设 | 什么输入违反它 |
| `concat` → `push` | "累计的列表长度可忽略" | 万级以上平坦列表 |
| `splice` → 逆序构建 | "碎片数量是零星几个" | 系统性含逗号显示名的列表 |
| `some` → `Set` | "收件人列表短到扫描无感" | 万级互异收件人 |
| 入口建 `Set` → 整封信一个 `Set` （34da642） | "地址头就是 To/Cc/Bcc 三个" | `headers: { to: [...] }` 展开的多头 |
| `concat.apply` → 逐步收集 | "数组元素数远低于引擎参数上限" | 十万级地址对象数组 |
| `maxRecipients` 后置检查 | "先有信封、才有检查的意义" | 超限输入在检查前已付解析成本 |

每一行脆弱代码都是某个"输入不会那么大/那么多/那么怪"假设的实例化。复杂度漏洞的审计，本质上是 **清点代码中所有未显式声明的规模假设，并问：谁有权违背它？**

* * *

## 10\. 动态验证汇总（量化主表）

全文量化数据在本节集中汇总，§11 与 §14 只引用、不再重复秒数与倍率。除 §6–§9 已嵌入的数据外，两组规模剖面补全"输入 → 成本"的量化关系（均为单 CPU 容器、三次采样中位数）：

**规模梯度** （ `experiments/published-scale-profile/` ，原始日志： `20260918T112350Z.log` ）：\[Experiment\]

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 项数  | 9.0.6 墙钟 | 相邻 2× 比值 | 9.1.0 墙钟 | 版本差 |
| 25,000 | 984.04 ms | —   | 29.62 ms | 33× |
| 50,000 | 7,995.11 ms | **8.12×** | 69.50 ms | 115× |
| 100,000 | 34,051.42 ms | 4.26× | 122.19 ms | 279× |
| 200,000 | 119,593.67 ms | 3.51× | 287.09 ms | **416.6×** |

（比值从 8.12 收敛到 3.51 符合二次律 + 固定开销的形状：纯二次时比值趋近 4×。）

**按输入字节归一化** （ `experiments/input-byte-cost-profile/` ， `a@b.invalid,` 重复）：8,000→32,000 项（96,000→384,000 字节），9.0.6 墙钟/CPU 增长 **42.30×/44.85×**，9.1.0 为 **4.57×/3.25×**；32,000 项时 9.0.6 每兆字节输入 **3,869 ms 墙钟 / 5,221 ms CPU**，9.1.0 为 **77.75 / 111.32 ms**。\[Experiment\] 按字节口径的价值：应用层防护（请求体限额）天然以字节为单位，这个曲线直接给出"放行 N 字节的地址字段 = 预订多少 CPU"的换算基础（固定环境内的相对关系，不跨环境外推）。

**事件循环与服务层**：数值不在此重复——直接调用的零回调执行观测见 §7.2，HTTP 参考应用的同进程延后与重复负载恢复见 §3.2、§7.3，进程内外监控盲区见 §7.4。

**版本矩阵**：92 个稳定 6.x–9.0.x 冻结包全部含旧累计器、全部正常解析小输入；9.1.0 已移除。\[Experiment\]（该矩阵仅核对累计器一行；各路径的版本覆盖差异见 §1 的路径×版本矩阵）

* * *

## 11\. 漏洞原语与能力边界

### 11.1 原语

这个漏洞形成的原语是 **有放大率上限的同步 CPU 停摆** （algorithmic DoS）：攻击者控制地址字符串的长度与形状（前提是应用存在输入映射），库以 O(n²) 的复制/搬移/比较处理它——即前三条超线性路径（§6.1–§6.3，因果链见 §8.1）；与之相伴的二次方级临时分配与 GC 压力主要来自 `concat` 累计器路径（§6.1 的 GC 观测）。单次同步调用期间，同进程全部工作延后该调用的全时长。

放大率的量化数据统一见 §10 主表：9.0.6 的墙钟/CPU 随输入规模近二次增长，200,000 项处两版差距达两个数量级以上；单次同步调用期间已排队回调零执行的直接观测见 §7.2。"放行 N 字节地址字段 = 预订多少 CPU"的应用侧换算，以 §10 的字节归一化段为准。

附带原语： **确定性异常注入** （路径四）——地址对象数组超过引擎参数上限（本环境 110,092 项，§6.4）即抛 `RangeError` ，攻击者可让特定邮件请求稳定失败，且错误信息与真实原因完全脱节（排障成本攻击）。\[Experiment\]

### 11.2 能力边界（防止过度推断）

以下边界全部来自代码与实验，不是免责套话：

-   **不是内存破坏**：没有任何越界读写、UAF、类型混淆。退化的是时间与分配量，V8 内存分配器全程正确。实验中唯一接近资源极限的观察：500,000 项输入在 512 MiB 容器中触及 V8 堆限额（该运行未用于任何结论）。\[Experiment\]
-   **本文分析的路径未显示代码执行能力**：\[Inference\] 停摆期间 CPU 执行的始终是解析器自身的复制/比较逻辑，未发现任何输入可控的间接调用或对象注入点（与反序列化类漏洞的本质区别；此为基于现有证据的边界陈述，而非绝对否定）。
-   **作用域是进程，不是机器**：单线程停摆不影响同机其他进程；容器/编排层的 CPU 限额进一步约束每实例的占用形状（本实验集的 119.6 s 就是在单 CPU 限额下测得的）。
-   **可恢复**：处理结束后未观察到延迟残留（恢复 p95 0.214 ms）；不损坏状态、不需要重启。\[Experiment\]
-   **无信息泄露、无完整性影响**：与 CVSS 的 `C:N/I:N/A:H` 一致。\[Official\]
-   **远程可达性是部署命题**：库层实验证明的是"给定输入映射则必然停摆"；某具体服务是否暴露该映射、是否有认证前置，必须对该服务单独评估，本实验集不覆盖。

### 11.3 攻击的经济性

\[Inference，基于实验数据的算术，非实测攻击\] 请求体大小与同环境阻塞时长呈可观测的放大关系：参考应用中 1.27 MB 请求体（40,000 项）在 9.0.6 下对应约 8.4 s 的同进程停摆（§3.2），且随输入规模按近二次形状增长（§10）。应用放宽请求体限额（实验中显式 `2mb` 配置即放行同量级输入 \[Experiment\]），即按同一关系放行更大的最坏停摆上限。对防御侧的对应结论是：请求体限额直接限定最坏停摆时长，是 §13.1 缓解时序模型的依据。

* * *

## 12\. 研究局限性（集中声明）

以下限制散见前文各节，在此集中重申，界定本文结论的适用范围：

1.  **版本覆盖边界**：源级验证覆盖 92 个稳定 6.x–9.0.x 发布包（ `experiments/version-boundary-matrix/` ）；pre-6 版本（1.x–5.x）与预发布/非发布线构建未在本地验证，官方"< 9.1.0"的无下界表述只被稳定发布线上的证据支持。\[Experiment\]
2.  `uniqueList.some` **去重的引入时间未确证**：本地源码仓库为部分克隆，只能确认该形状在 ≥2026-03-18 的重构中可见（§1 时间线标注"部分验证"）；路径三的确切引入 commit 未定位，其存在史可能长于可证历史。\[Source\]
3.  **探针环境与主实验集不同**：调用链探针运行于 macOS arm64 / Node v24.20.0 / `nodemailer@9.1.0` / `streamTransport` （§2、§4.4），仅用于确认调用关系与调用次数——该次数是探针配置下的观察值，随字段、插件、传输层与拒绝路径变化，并非固定契约——不参与任何计时结论；全部耗时数据来自 Linux arm64 / Node v22.21.1 单 CPU 容器。\[Probe\]
4.  **绝对耗时不可跨环境外推**：文中所有秒数都产生于固定单 CPU 限额容器，跨 CPU、架构、Node 版本不可比；可迁移的是增长比、复杂度形状与同环境内的相对倍率——这也是 §13.4 回归测试思路采用"耗时不超过线性界"而非绝对秒数的原因。
5.  **真实部署可达性未覆盖**：库层实验证明的是"给定输入映射则必然停摆"；真实服务中该映射的流行度，以及认证、限流等前置防御的存在情况，均不在本实验集范围内（§3.2、§11.2）。

* * *

## 13\. 防御、修复与同类审计

### 13.1 使用方（应用层）防御，按生效时序排序

防护在调用链中的位置决定其性质：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd5c0d39ceed1bbe.png)

*图 9：防御措施按生效时序——\[A\] 应用层请求体限额（解析前，首选）、\[B\]* `maxRecipients` *（解析后的传输前后备）、\[C\] 解析预算（理想位置，本版本不存在）*

-   **A（首选，先于解析）**：在应用边界对承载地址字段的请求施加大小/数量限额。实验已验证 Express 默认 `express.json()` 限额在 parser 之前以 413 拒绝 308,898 字节请求（parser 调用 0 次）。\[Experiment\] 对收件人/邀请/导入类入口，地址数量上限应按业务真实上限（十到百级）设定，而不是按引擎或库的容忍上限设定。
-   **B（升级到 9.1.0 后的后备）**：默认 `maxRecipients = 100,000` 拦截的是"信封进入传输层"，检查发生在两轮完整解析之后；按信封收件人计数、不含 Reply-To。\[Source\] \[Experiment\] 部署时可按业务收紧（如 `maxRecipients: 1000` ），但不应把它当输入护栏引用。
-   **C（库方/框架可做的）**：解析预算（输入字节数上限或地址数上限在 **进入解析器前** 检查）在本版本不存在——这是该修复路线图上仍空着的一格。\[Inference\]
-   **升级**： `nodemailer ≥ 9.1.0` 是根本修复；核查锁文件中直接与传递依赖均已更新。\[Official\]

### 13.2 库方/框架维护者的加固模式

-   **成员测试的数据结构**：去重/查重发生在循环里时，容器必须是哈希集合（ `Set` / `Map` ），且构建成本要放在 **循环外的生命周期** （ `34da642` 的教训：入口重建 `Set` 在多头场景下把 O(n) 退化回 O(headers × n)，甚至慢于被替换的线性扫描 \[Commit\]）。
-   **展平禁止经过实参**： `concat.apply` / `...spread` 到函数参数的每一次使用都在隐式依赖引擎的参数上限；改为逐步 `push` 。审查规则可以直接 grep： `concat.apply` 、`.apply(null,`、`.apply(this,` 后接数组实参。
-   **结果缓存** （后续设计建议，非 9.1.0 补丁内容）： `getEnvelope()` 读缓存却从不写回，导致同一字符串在一次发送内被重复解析（本文探针配置下每个地址字符串 4 次，§4.4）\[Source\] \[Probe\]。解析结果可在节点生命周期内物化（或在 `setHeader` 时一次性解析、存储解析产物）——既削常数，也缩小任何残留超线性路径的暴露面。但落地前必须先定义失效规则： `setHeader` 覆盖、 `addHeader` 追加、插件改写头部后，缓存必须失效或重建，否则信封会固化过期的解析结果；并以"变更头部后取信封""经插件改写头部后再发送"两类场景测试覆盖。
-   **显式化规模假设**： `DEFAULT_MAX_RECIPIENTS` 的注释是范例——它明说自己是 backstop 而非 delivery policy，并且给出 RFC 5321 只要求服务器接受 100 收件人的业务参照 \[Source\]。上限没有对错， **隐式的无上限才有错**。
-   **回归测试的形态覆盖**：维护者的回归测试同时覆盖了平坦列表、显示名碎片、互异收件人、跨头去重、超参数上限数组五种形状 \[Commit\]——因为"最坏形状"与"触发报告的形状"不是同一种输入（§6.3 的 PoC 教训）。
-   **监控**：可用性探针必须在进程外（§7.4：进程内心跳在停摆期间结构性失明）；把"长时间单核高 CPU + 异常大的地址字段"作为关联审查线索（分析推断，非签名）。\[Inference\]

### 13.3 与 CVE-2025-14874 的路径区分（避免误配缓解）

同一文件还修过另一个 DoS：CVE-2025-14874（ [GHSA-rcmh-qjqh-p98v](https://github.com/advisories/GHSA-rcmh-qjqh-p98v) ，v7.0.11 修复）是 **嵌套地址组的递归深度** 问题，修复为 `MAX_NESTED_GROUP_DEPTH = 50` 的深度上限（ `lib/addressparser/index.js:451` ）。\[Official\] \[Source\]

`experiments/flat-vs-nesting-depth-cap/` 把两条路径显式分离：在已含该修复的 `nodemailer@7.0.11` 上，10/50 层嵌套组正常返回叶地址，100 层被上限截断为有界空结果；而 100 项 **平坦** 地址完整解析、不产生任何组结构—— **深度上限不约束宽度**。给"嵌套组"配的缓解（深度上限）对本漏洞（平坦规模）无效，反之亦然；审计与缓解清单必须把两个维度分开列。\[Experiment\]

### 13.4 可迁移的审计模式

从本漏洞抽象出的错误模式，可直接用于审计其他解析器/构建器代码：

**模式一：重建式累积**

```latex
信号：accumulator = accumulator.<op>(piece)   出现在 forEach/for 里
      （concat、+（字符串）、展开重建、map 后重建）
代价：第 k 步 ∝ k → 总计 O(n²)
本例：concat 累计器（9 年 7 个月）、字符串构建类同型缺陷在无数代码库中同构存在
```

**模式二：搬移式删除**

```latex
信号：splice(i, 1) / shift()（尤其出现在遍历中）
代价：每次删除搬移后续全部元素
本例：显示名合并循环（6 个月）
```

**模式三：稀疏洞式删除**

```latex
信号：delete arr[i]（含遍历中 delete 数组元素）
代价：不搬移后续元素，但留下稀疏洞——length 不变、按索引遍历读到
      undefined，数组可能退化为字典模式，后续访问与遍历性能下降；
      风险在稀疏性与迭代语义而非搬移，需另行分析
本例：无——本漏洞走的是 splice 搬移；把 delete 与 splice 区分开，
      是避免审计规则给 delete 误报搬移成本
```

**模式四：线性容器做循环内成员测试**

```latex
信号：list.some(x => x === item)、list.includes、indexOf 出现在每项处理的循环里
代价：互异输入下 Σk 次比较
本例：uniqueList.some 去重；且注意"重复输入掩盖退化"的验证盲区
```

**模式五：数组 → 实参的隐式契约**

```latex
信号：f.apply(null, arr)、f(...arr)
代价：容量契约绑在引擎参数上限上（版本/架构相关，无文档保证）
本例：concat.apply 展平，110,092 项处 RangeError（本机）
```

**模式六：无界输入 × 同步执行 × 结果不缓存**

```latex
信号：纯同步的解析/构建函数 + 入口无规模检查 + 每个下游步骤重复调用
代价：输入规模直接映射为事件循环停摆时长，且被调用次数放大
本例：同一字符串在一次发送内被重复解析（探针配置下 4 次，§4.4）；getEnvelope 无缓存写回
```

审计时的清点问题（对应 §9.6 的表格）：这段代码对输入规模有哪些未声明的假设？谁有权违背每个假设？违背后每一步的成本函数是什么？在哪一层、在解析之前，能把违背拦下来？

**Regression Test / Fuzz Harness 思路**：规模形状断言（对数级梯度 × 输入形状矩阵：平坦/碎片/互异/多头/超上限数组，断言相邻 2× 规模的耗时不超过线性界，如 < 3×），比断言绝对耗时更抗环境噪声——这正是本地 25 个实验采用增长比而非绝对秒数作为主判据的原因； `max-recipients-default-boundary` 的等值/超一两侧对拍是边界测试的通用形状。属性测试可断言：任意输入下解析输出地址数 == 预期计数（语义保持）且耗时/输入字节比值有界（复杂度保持）。

* * *

## 14\. 总结

GHSA-2x7j-588g-ccc2 的全部技术内容可以压缩成三句话：

1.  **漏洞是什么**：Nodemailer 的地址解析层用三个"每步付出与已积累规模成正比代价"的超线性实现（ `concat` 重建、 `splice` 搬移、 `some` 线性查重），加一个把容量契约绑在引擎参数上限上的展平实现（ `concat.apply` ，线性但触发确定性 `RangeError` ），处理一个从未被设界的输入维度——地址列表规模；主根因 `concat` 累计器自 2017 年沉睡至 2026 年。这些代码在 Node.js 单线程事件循环上同步执行、结果不被缓存、一次发送内重复执行，不可信输入的规模被逐字转化为全进程的停摆时长（量化剖面统一见 §10 主表）。
2.  **Root Cause 是什么**：错误的安全假设（"地址列表规模与人工场景匹配"）+ 实现缺陷（重建式累积）+ 缺失的约束（任何一层都没有在解析前检查规模）+ 敏感操作（单线程运行时上的同步解析）。修复之所以有效，是因为它替换了实现本身（ `push` /逆序构建/ `Set` /逐步收集全部回到 O(n)），而不是给触发条件打补丁——而 `34da642` 进一步表明，修复复杂度缺陷时同样要审新方案的构建成本生命周期，否则只是换一个二次方。
3.  **留给审计者什么**：复杂度是真实的安全属性，但它只在规模轴上显形——正确性测试永远抓不到它。审计解析器/构建器时，清点每一个"重建式累积、搬移式删除、线性容器查重、数组转实参"的用法，问每个规模假设"谁有权违背它"；验证时同时覆盖触发形状与最坏形状（本例中报告者的重复地址 PoC 恰好掩盖了最严重的互异收件人路径）；缓解按生效时序排序——对 HTTP 等不可信入口，解析前的字段/请求大小限制是必要的纵深防御，但它覆盖不了内部任务、CLI、消息队列或已进入业务层的地址数据；升级至 9.1.0 仍是消除库内超线性根因的必要措施。

* * *

## 附：核心材料索引

|     |     |
| --- | --- | 
| 材料  | 位置  |
| 官方公告 | [https://github.com/advisories/GHSA-2x7j-588g-ccc2](https://github.com/advisories/GHSA-2x7j-588g-ccc2) |
| 主报告（处置摘要与证据缺口） | `GHSA-2x7j-588g-ccc2.md` |
| 25 个实验的结论整合 | `experiments-conclusions.md` |
| 受影响版源码（固定 `4e467a8` ） | `source-repositories/nodemailer/worktrees/v9.0.6--4e467a8f/` |
| 修复版源码（固定 `efd6e29` ） | `source-repositories/nodemailer/worktrees/v9.1.0--efd6e29c/` |
| 修复 commit（直链） | `9116da9` · `7cc38af` · `34da642` · `83b8c48` |
| 引入 commit（直链） | `6218b8d` （2017-01-31， `concat` 累计器随 v3.0.0 EUPL 重构进入） · `fe27f7f` （2026-03-09，显示名合并引入路径二） |
| 各实验方法/日志 | `experiments/*/REPORT.md` 、 `experiments/*/results/` |
| 调用链探针脚本 | `probes/sendmail-parser-callsites.js` （附 `probes/README.md` ） |

**外部参考** （标准、弱点分类与关联漏洞，使本文脱离本仓库亦可独立审计）：

-   CVE-2025-14874 / GHSA-rcmh-qjqh-p98v（嵌套组递归深度 DoS，与本文的路径区分见 §13.3）： [https://github.com/advisories/GHSA-rcmh-qjqh-p98v](https://github.com/advisories/GHSA-rcmh-qjqh-p98v)
-   RFC 5321（ `DEFAULT_MAX_RECIPIENTS` 注释中"服务器至少接受 100 收件人"的出处）： [https://www.rfc-editor.org/rfc/rfc5321](https://www.rfc-editor.org/rfc/rfc5321)
-   CWE-400（Uncontrolled Resource Consumption）： [https://cwe.mitre.org/data/definitions/400.html](https://cwe.mitre.org/data/definitions/400.html)
-   CWE-407（Algorithmic Complexity）： [https://cwe.mitre.org/data/definitions/407.html](https://cwe.mitre.org/data/definitions/407.html)
