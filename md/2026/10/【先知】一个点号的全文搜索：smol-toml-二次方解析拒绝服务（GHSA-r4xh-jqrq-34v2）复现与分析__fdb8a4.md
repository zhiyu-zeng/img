---
title: 【先知】一个点号的全文搜索：smol-toml 二次方解析拒绝服务（GHSA-r4xh-jqrq-34v2）复现与分析
source: https://xz.aliyun.com/news/92977
source_host: xz.aliyun.com
clip_date: 2026-10-20T15:00:47+08:00
trace_id: 6a988bf8-9f86-43da-a46f-14871a429bec
content_hash: f218faccd937fc7f7a8439dd0f43e062e99f283f437081f410e2f17766c23c39
status: synced
tags:
  - 先知
  - 漏洞分析
  - 开发工具
series: null
feed_source: 先知安全技术社区
ai_summary: smol-toml ≤ 1.8.0 的 `parseKey()` 在整篇文档上搜索点号却没有设置上界，导致合法 TOML 输入引发平方级解析；1.4 MB 输入就会阻塞 Node.js 事件循环数秒。
ai_summary_style: key-points
images_status:
  total: 20
  succeeded: 20
  failed_urls: []
notion_page_id: 3ff75244-d011-81eb-af75-ed484dc73bc1
ioc:
  cves: []
  cwes:
    - CWE-407
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> smol-toml ≤ 1.8.0 的 `parseKey()` 在整篇文档上搜索点号却没有设置上界，导致合法 TOML 输入引发平方级解析；1.4 MB 输入就会阻塞 Node.js 事件循环数秒。
> 
> - **根因与修复：** `indexOf('.')` 的搜索范围是整个 `ctx.s`，直到切片时才夹回本行；1.9.0（提交 99102aa）改为逐字符状态机，该版本同时把解析结果对象改成 null 原型。
> - **四条可达路径：** 裸键、引号键（sink A）、数组表头、内联表内层键，全部汇聚到 `parseKey()`；路径 3 的 `[[a]]` 仅 6 字节/条，768 KB 输入即可阻塞近 2 秒。
> - **实测数据：** 1.8.0 下 128,000 行裸键耗时 3,659.870 ms、引号键 4,365.483 ms，翻倍倍率 3.97–4.17 符合平方级；1.9.0 同规模仅 85–106 ms，并发 `/health` 从 3.5–4.3 秒降至约 1 ms。
> - **点号并非必要条件：** 全文仅 1 个垫底点号仍耗时 3,727.845 ms；按每 D 行撒一个点分键可把代价线性折减（变体 B 实测 514 ms）。
> - **防护要点：** 触发输入语法完全合法，WAF、限流、网关超时均无效；有效手段是升级 1.9.0+、从严设置请求体大小上限（1 MB 仍约 1.8 秒）、把解析移出事件循环（Worker/队列）。

> -   漏洞编号： [GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2) （无关联 CVE）
> -   受影响组件：npm 包 `smol-toml` ≤ 1.8.0； **1.9.0 修复**
> -   漏洞类型：CWE-407（低效算法复杂度），CVSS v3.1 **5.3** （ `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L` ，低可用性影响）
> -   触发前提：应用把攻击者可控的 TOML 文本交给同步的 `parse()` 解析

## 1\. 漏洞概述

一个键名后面还有没有点号，本该在本行之内就能确认。在 smol-toml ≤ 1.8.0 里，这个判断被做成了以整篇文档为范围的全文搜索。 [smol-toml](https://github.com/squirrelchat/smol-toml) 是 Squirrel Chat 维护的轻量 TypeScript TOML 解析器。它的 `parse()` 每解析一个键名，都会经由 `parseKey()` 执行一次 `ctx.s.indexOf('.', ctx.p)` ，以此分辨这个键是普通键，还是 `a.b.c` 这类点分键的一段。 [维护者安全公告](https://github.com/squirrelchat/smol-toml/security/advisories/GHSA-r4xh-jqrq-34v2) （GHSA-r4xh-jqrq-34v2）确认 ≤ 1.8.0 全部受影响，修复版本是 1.9.0。

问题出在搜索范围。当前行的边界本可以把搜索截住，这一步没有做：文档从当前位置到结尾若一个点号都没有， `indexOf` 要扫完整篇剩余文本，才返回 -1。于是，一份由大量不含点号的键组成的合法 TOML，会让每一行键名各触发一次全文扫描。这些扫描逐行缩短，累加起来，总工作量随输入规模近似 **平方级** 增长（CWE-407，低效算法复杂度）。 `parse()` 是同步的。只要应用把攻击者可控的 TOML 文本交给它，一个约 1.4 MB 的合法输入就能让 Node.js 的事件循环阻塞数秒。期间整个服务对所有请求都没有响应，构成低可用性的拒绝服务（CVSS v3.1 5.3）。

这个漏洞难防，难在触发输入上：那是一份语法完全合法的 TOML。语法校验挑不出毛病，WAF 的特征规则也匹配不上它；一切对着恶意载荷设防的环节，到这里都失去了目标。而入口不止一条。普通裸键、带引号键、数组表头、内联表内层键，四条互不相同的语法路径，全部汇聚到同一个有缺陷的函数 `parseKey()` 上。整条攻击链的全景见图 1-1。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3f74218d32a6feda.png)  
*图 1-1：GHSA-r4xh-jqrq-34v2 攻击链全景——攻击者可控的合法 TOML 输入经同步* `parse()` *进入* `parseKey()` *的无界点号搜索，四条语法路径在此汇聚成平方级扫描，最终阻塞事件循环，令服务在解析期间对一切请求不可用*

## 2\. 根因：一次没有上界的点号搜索

这次全文搜索的本体，只有三行代码（后文拆解 `parseKey()` 时再逐行细读）：

> **路径约定**：文中库内代码位置（如 `src/struct.ts:66` ）均相对上游 [smol-toml 仓库](https://github.com/squirrelchat/smol-toml/tree/v1.8.0) 的 **v1.8.0** 标签； `repro/` 等其余路径指本文附带的复现仓库。

```typescript
// src/struct.ts — parseKey 内部，v1.8.0
// parseKey(ctx, end = '=')：ctx.s 是整篇文档字符串，ctx.p 是解析游标，start 为键起点
let endPtr = ctx.s.indexOf(end, start)   // ① 本行边界：当前语句的 '=' 或 ']'
...
dot = ctx.s.indexOf('.', ctx.p)          // ② sink：在 ctx.s（整篇文档）里搜点号
let part = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot)
//                                        ③ 扫完之后才用 endPtr 把范围夹回本行
```

同一次调用里有两类 `indexOf` 。① 的 `indexOf(end)` 定位本行边界：合法 TOML 的结束符必然落在本行之内，找不到时直接抛错。这个搜索便宜，也够用。② 的 `indexOf('.')` 找点号。① 刚把 `endPtr` 量出来，② 不用它，搜索范围仍是整篇文档 `ctx.s` ，从游标一直延伸到文档末尾。③ 的截断发生在扫描之后： `dot` 要与 `endPtr` 比过大小，切片才被夹回本行，能省的字符比较，一次也没有省下。这对组合不是孤例。 `parseKey()` 的两个分支里各复制了一份：裸键分支的 sink B（ `struct.ts:97` ），引号键分支的 sink A（ `struct.ts:66` ）。缺陷相同，入口不同。

为什么是平方级。设文档有 N 行不含点号的键，行长基本一致；路径 4 把键收进一对花括号，模型不变。第 i 行的 `parseKey()` 执行 ② 时，搜索从本行键名起扫到文档末尾（返回 -1），代价正比于第 i 行到文末的 N−i+1 行。行号每推进一行，扫描范围就缩短一行。图 2-1 里逐级递减的红色箭头，画的就是这个过程。N 行全部加总 ≈ `N + (N-1) + … + 1 = N(N+1)/2 ≈ N²/2` 行的字符量。行长只是常数因子，字符比较次数随输入长度的平方增长。输入翻倍， **耗时约翻 4 倍**。后文四条路径在 1.8.0 上实测的翻倍倍率为 3.97–4.17，与预测吻合；1.9.0 修复后，同样的倍率降到约 1.7–2.7（毫秒级计时下波动更明显，后文路径 4 的实测里就有一例）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6cec617962d0d575.png)  
*图 2-1：平方级扫描代价——无点号文档中，第 i 行* `parseKey()` *的点号搜索从本行一路扫到文档末尾，扫描范围随行号逐级递减；对照组的* `indexOf('=')` *定界搜索止于本行，两种搜索一对照，"先扫描、后限界"的代价一目了然*

1.9.0 的修复是一次整段重写。官方提交 `99102aa` （"refactor: rewrite key parse logic"）把 `parseKey()` 换成一台逐字符状态机，② 对应的两处全文搜索随之消失：

```diff
- dot = ctx.s.indexOf('.', ctx.p)
+ while (c = ctx.s.charCodeAt(++ctx.p)) { … }
```

新实现逐字符识别结束符、点号、引号和空白，遇到本行的结束条件就停。图 2-1 里逐级递减的红色扫描不复存在。找点号还是同一件事，只是搜索回到了本行之内，成本重新与本行长度成正比。另有一处变动与性能无关：1.9.0 让解析结果对象改用 null 原型，依赖结果对象原型行为的应用，升级时需按 [发行说明](https://github.com/squirrelchat/smol-toml/releases/tag/v1.9.0) 自查兼容性。

## 3\. 复现环境与复现框架

缺陷与修复都已在源码里看清，剩下的工作是把平方级推导坐实成可核验的数字。这要靠一个能反复重建、结果可对照的实验台：用 Docker Compose 把受影响的 1.8.0 与修复后的 1.9.0 并排部署，让两者在同等条件下接收同一批输入。整套框架就两个文件——复现服务端 `server.mjs` 和 PoC 客户端 `poc.mjs` ，四条路径与点号稀疏变体的全部实测数字都出自这里。

### 3.1 Docker Compose 拓扑

`smol-toml` 是库，不是服务，没有官方镜像。复现用官方 `node:22-alpine` ，版本以 SHA-256 摘要固定，任何时候重建，拿到的都是同一个运行时。每条路径（及点号稀疏变体）各自成立一个独立的 Compose 项目，各起三个容器（完整拓扑见图 3-1）：

-   `vulnerable` **服务**：启动时向容器临时目录 `npm install smol-toml@1.8.0` ，把挂载的 `server.mjs` 复制到安装目录（与 `node_modules` 相邻，供裸导入解析）后启动；
-   `patched` **服务**：同一套流程，安装的是 `smol-toml@1.9.0` ，作修复对照；
-   `poc` **客户端**： `tools` profile 里的一次性容器，等两个服务的健康检查都通过后，运行 `poc.mjs` 。

三个容器统一做了安全收紧：只读根文件系统， `cap_drop: ALL` ， `no-new-privileges` ，内存 384m、PID 64 封顶。两个解析服务另挂一块 `/tmp` tmpfs，npm 安装与运行时写入都落在那里。解析端口只在 Compose 内部网络开放， `poc` 以服务名直连（ `vulnerable:3000` / `patched:3000` ）；只有路径 1 额外绑定宿主机 `127.0.0.1:18080/18081` ，留给手动 curl 抽查。首次运行需要访问 Docker Hub 和 npm registry。

本文出现的全部 Terminal 操作，都在一个一次性的 Docker-in-Docker 容器实验台里真实执行并截图：内部再跑一套独立的 dockerd，终端经 ttyd 网页终端呈现。五条路径顺序执行，互无并行负载。每条路径的 PoC 运行统一以 `| tee` 边展示边留档，各目录的 `evidence.jsonl` 即截图对应轮次的原始输出。截图里的提示符来自实验台内同一套中性环境（ `root@lab` ），不含任何真实宿主机信息。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fc3d96181ead3109.png)  
*图 3-1：复现环境拓扑（以路径 1 的 Compose 项目为代表）——容器实验台内一套* `docker compose` *编排在内部网络拉起三个容器：两个解析服务分别安装 smol-toml 1.8.0 与 1.9.0 供对照，* `poc` *一次性容器在两者健康检查通过后才运行；* `127.0.0.1` *端口绑定仅路径 1 配置，其余路径不发布任何端口*

### 3.2 复现服务端的关键函数（server.mjs）

|     |     |     |
| --- | --- | --- |  
| 函数/方法 | 位置（以 `repro/bare-keys/server.mjs` 为例） | 作用  |
| `reply(res, status, data)` | `server.mjs:10-14` | 统一的 JSON 响应出口： `JSON.stringify` 后写 `application/json` 头并结束响应 |
| `http.createServer` 回调 | `server.mjs:16-52` | 路由与解析编排： `GET /health` 返回版本； `POST /parse` 流式收集请求体，超过上限（路径 1/2/4 为 4 MiB、路径 3 为 2 MiB）返回 413 |
| `Buffer.concat` → `toString('utf8')` | `server.mjs:37` | 把收集到的字节片段拼成完整 UTF-8 字符串，成为 `parse()` 的入参—— **source 与 sink 之间的最后一跳** |
| `performance.now()` 计时 | `server.mjs:38-40` | 紧贴 `parse(source)` 前后打点，服务端返回的 `parseMs` **只含纯解析时间**，不含网络与校验，保证两版本对比公平 |

表里的四步在代码中首尾相接，构成 `POST /parse` 的主线。 `http.createServer` 回调的节选如下，路由分支与结果摘要略：

```javascript
http.createServer(async (req, res) => {
  const chunks = []
  let size = 0
  try {
    for await (const chunk of req) {          // 流式收集：边收边计数
      size += chunk.length
      if (size > maxBytes) {                  // 上限在收集过程中判定，超限即回 413
        reply(res, 413, { error: 'TOML input exceeds 4 MiB' })
        return
      }
      chunks.push(chunk)
    }
    const source = Buffer.concat(chunks).toString('utf8')
    const start = performance.now()
    const result = parse(source)              // 同步解析；计时紧贴 parse 前后
    const parseMs = performance.now() - start
    /* 结果摘要与 reply 略 */
  } catch (error) { /* 异常统一回 400 并记日志 */ }
})
```

各路径服务端的差异只有两处：请求体上限（见上表，413 的错误消息文本随上限相应写为 2/4 MiB），以及结果摘要。路径 1/2 返回键数与首尾键值。路径 3 校验"只有一个键 `a` 且 `a` 是全由空对象组成的数组"，返回 `count` （数组长度）与 `valid` ，长度是否等于表头数由 PoC 侧核对。路径 4 校验 `x` 是对象（非数组），返回内层键数与首尾值。解析异常统一捕获后回 400 并记日志， `container-logs.txt` 可查。

### 3.3 PoC 客户端的关键函数（poc.mjs）

四条路径与点号稀疏变体共用同一套骨架，差异只在输入生成器、校验字段这类少量细节：

|     |     |     |
| --- | --- | --- |  
| 函数  | 位置（以 `repro/bare-keys/poc.mjs` 为例） | 作用  |
| `document(lines)` | `poc.mjs:10-12` | 输入生成器。路径 1 产出 `kN = 1\n` ；路径 2 产出 `"kN" = 1\n` ；路径 3 是 `'[[a]]\n'.repeat(count)` ；路径 4 拼出 `x = { k0 = 1, k1 = 1, … }` |
| `request(label, method, path, body)` | `poc.mjs:14-24` | 封装 `fetch` ，带 `AbortSignal.timeout` （路径 1/2/3 与变体为 30 秒、路径 4 为 45 秒）与墙钟计时，返回状态码、JSON 与往返耗时 |
| `checkedParse(label, lines, body)` | `poc.mjs:26-34` | **校验闸门**：逐响应核对 HTTP 200、实际包版本、字节数与结果摘要（键数/元素数、首尾键值等），任何一项不符即抛错——排除"旧版报错快、新版正常慢"的假差异 |
| `main()` | `poc.mjs:36-73` | 编排：① 双服务健康与版本核对 → ② 4 个递增规模依次请求并记录服务端 `parseMs` → ③ 解析最大输入的同时并发 `GET /health` 测阻塞 → ④ 判定 |

判定只看两个比值。翻倍倍率是最大两档规模的耗时之比，路径 4 为 32,000 → 64,000，其余为 64,000 → 128,000；版本差距是最大档同规模下新旧版耗时之比。旧版两条同时达标才算 `success:true` （退出码 0）：翻倍倍率 ≥ 2.5，版本差距 ≥ 10。退出码 1 表示请求全部有效但未达阈值；退出码 2 表示环境或校验异常。倍率阈值 2.5 卡在线性增长的理论翻倍值 2 与平方级预测的约 4 之间——线性实现不会误报，实测的 3.97–4.17 也留足了波动余量。文末的自评估清单直接复用这套判定与退出码。对应 `main()` 第 ④ 步的判定代码：

```javascript
// repro/bare-keys/poc.mjs — main() 第 ④ 步（节选；measurements 为第 ② 步记录的各规模 parseMs）
const vulnerableGrowth = measurements.vulnerable[128000] / measurements.vulnerable[64000]
const versionGap = measurements.vulnerable[128000] / measurements.patched[128000]
const success = vulnerableGrowth >= 2.5 && versionGap >= 10
if (!success) process.exitCode = 1
```

## 4\. 关键函数详解

判定阈值与退出码到此都定了，实验台告一段落。四条路径怎么跑、跑出什么数字，是后面四章的事；这一章回到库内部。数据从 HTTP 请求体进入 `parse()` 后，沿途经过七个关键函数，静态调用结构见图 4-1：两个红色节点就是缺陷所在的 sink，四条路径从哪些边进入、又汇聚到哪个 sink，一图看尽；后面无论拆到哪一处，都可以回这张图定位。以下按数据流经的顺序逐个拆解，其中 `parseKey()` 是两个 sink 的宿主，篇幅也最多。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f7d9c6b8cf65e41a.png)  
*图 4-1：smol-toml 1.8.0 关键函数调用图——* `parse()` *在顶层驱动，* `parseInlineTable()` *在值内部放大，七函数的两个 sink（* `struct.ts:66` *引号键分支、* `struct.ts:97` *裸键分支）同在* `parseKey()` *之内；边上的路径标注对应后文四条复现路径，四个入口殊途同归*

### 4.1 parse() — 解析入口与主循环

|     |     |
| --- | --- | 
| 项目  | 内容  |
| 定义位置 | `src/parse.ts:133-195` （npm 包 `smol-toml@1.8.0` 的编译产物为 `dist/parse.js:95-149` ） |
| 签名  | 实现： `parse(toml: string, { maxDepth = 1000, integersAsBigInt }: ParseOptions = {}): TomlTable` （对外另有两个重载，差别只在 `integersAsBigInt` 取真值时的返回类型） |
| 选项  | `maxDepth` （默认 1000）、 `integersAsBigInt` |
| 调用者 | 应用代码（复现中即 `server.mjs:39` 的 `parse(source)` ） |
| 与漏洞的关系 | 把整篇文档放进 `ctx.s` ；对每条语句调用一次 `parseKey()` ，是缺陷调用的 **放大器** |

`parse()` 是库导出的唯一解析入口，同步执行，返回表示整篇 TOML 的对象。它自己不逐字符解析。它维护解析上下文，驱动主循环，在表头和键值行两种语句之间分派，强制行尾语法，管理当前写入表。主体结构如下（缩略）：

```typescript
export function parse(toml: string, { maxDepth = 1000, integersAsBigInt }: ParseOptions = {}): TomlTable {
    let ctx = { s: toml, p: 0, d: maxDepth }   // ① 上下文：s=整篇文档, p=游标, d=深度预算
    let res = {}                                //    解析结果
    let meta = {}                               //    表结构元数据（供 peekTable 使用）
    let tmp                                     //    语句起点（报错定位用）
    let tbl = res                               // ② 当前写入表
    let m = meta

    skipVoid(ctx)
    while (ctx.p < toml.length) {               // ③ 主循环：一条语句一轮
        if (toml.charCodeAt(ctx.p) === 0x5b /* [ */) {          // ④ 表头分支
            let isTableArray = toml.charCodeAt(++ctx.p) === 0x5b
            tmp = ctx.p += +isTableArray
            let k = parseKey(ctx, ']')                           //    以 ']' 为结束符解析表名
            /* 数组表头：核对游标前一字符是 ']'（即表名后的第一个 ']'，否则抛
               'expected end of table declaration'）并 ctx.p++ 越过第二个 ']' */
            let p = peekTable(k, res, meta, isTableArray ? Type.ARRAY : Type.EXPLICIT)
            if (!p) throw new TomlError('trying to redefine an already defined table or value', …)
            m = p[2]; tbl = p[1]                                 // ⑤ 切换当前表
        } else {                                                 // ⑥ 键值行分支
            tmp = ctx.p
            let k = parseKey(ctx)                                //    以 '=' 为结束符（默认）
            let p = peekTable(k, tbl, m, Type.DOTTED)
            if (!p) throw new TomlError('trying to redefine an already defined table or value', …)
            p[1][p[0]] = extractValue(ctx, void 0, integersAsBigInt)
        }
        skipVoid(ctx, true)                     // ⑦ 行尾：跳水平空白与注释，停在换行前
        if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 0xa /* \n */ && tmp !== 0xd /* \r */)
            throw new TomlError('each key-value declaration must be followed by an end-of-line', …)
        skipVoid(ctx)                           // ⑧ 跨过换行，进入下一条语句
    }
    return res
}
```

① 的上下文对象决定了后面所有函数看到的东西： `ctx.s` 从此刻起就是整篇文档字符串，后续所有函数，包括 `parseKey()` 的两个 sink，共享这同一个字符串和游标 `ctx.p` 。sink 之所以能一路搜到文档末尾，根源就在这里。 `ctx.d` 是嵌套深度预算，由 `extractValue()` 消耗，后文详解。

④ 的表头分支先做一次前瞻： `++ctx.p` 处再读一个字符，还是 `[` 则 `isTableArray` 为真（ `[[a]]` 数组表），游标跳过第二个 `[`，然后以 `]` 为结束符调 `parseKey()` 。返回后核对游标前一字符是 `]` ，即表名后的第一个 `]` 。 `parseKey()` 收尾只跳空格与制表符，游标恰停在 `]` 后第一个非空格/制表符字符处；核对通过，再 `ctx.p++` 越过第二个 `]` 。

⑤ 表头处理完后， `tbl` 和 `m` 指向新表，数组表时指向刚追加的元素，后续键值行写入其中；TOML 里表头之后的所有键归属该表，这条规则由此实现。⑥ 键值行分支是三段式流水线： `parseKey()` 取键， `peekTable()` 落表， `extractValue()` 取值。⑦ 行尾校验交给 `skipVoid(ctx, true)` ，它只跳水平空白和注释、不吞换行，随后要求当前字符是 `\n` / `\r` 或已到 EOF，否则抛"每个键值对必须以行尾结束"。

四条路径全部由这个主循环驱动。路径 1/2 走 ⑥ 分支，N 行输入即 N 次 `parseKey()` 调用；路径 3 走 ④ 分支，N 个表头同样是 N 次 `parseKey()` ；路径 4 在 ⑥ 中经 `extractValue()` 递归进内联表，后文 `parseInlineTable()` 一节详解。 `parse()` 自身没有缺陷，但它决定了两个放大参数：缺陷函数的调用次数，和 `ctx.s` 的内容范围。主循环自己的簿记， `charCodeAt` 判断、 `skipVoid()` 、行尾校验，都是每语句常数开销，整体线性。真正的耗时发生在它调用的 `parseKey()` 内部。

### 4.2 skipVoid() — 游标推进器

|     |     |
| --- | --- | 
| 项目  | 内容  |
| 定义位置 | `src/util.ts:79-93` |
| 签名  | `skipVoid(ctx: ParseContext, banNewLines?: boolean, banComments?: boolean)` （无返回值） |
| 协作函数 | `skipComment(ctx)` （ `util.ts:58-76` ） |
| 与漏洞的关系 | 无缺陷；是所有路径的必经"节拍器"，负责把游标精确对齐到下一个 token |

把 `ctx.p` 推过无关字符（空白、按需的换行与注释），让调用方拿到第一个有效字符，这就是 `skipVoid()` 的全部工作。 `parse()` 主循环每轮调它两次， `parseKey()` 收尾、 `parseInlineTable()` / `parseArray()` 的循环也反复调它，是解析器中调用频率最高的工具函数之一。

```typescript
export function skipVoid(ctx: ParseContext, banNewLines?: boolean, banComments?: boolean) {
    let c
    while (1) {
        while (
            (c = ctx.s.charCodeAt(ctx.p)) === 0x20 /* 空格 */ ||
            c === 0x9 /* \t */ ||
            (!banNewLines &&
                (c === 0xa /* \n */ || (c === 0xd /* \r */ && ctx.s.charCodeAt(ctx.p + 1) === 0xa))
            )
        ) ctx.p++

        if (banComments || c !== 0x23 /* # */) break
        skipComment(ctx)                         // 跳过注释后回到外层循环继续吞空白
    }
}
```

内层 `while` 逐字符吞掉空格、制表符，以及未被禁止时的 `\n` 与 `\r\n` ；外层决定是否进入注释， `#` 开头的注释由 `skipComment` 推进到行尾，并顺带校验注释里没有非法控制字符，有则抛 `TomlError` 。

三个布尔参数组合出库内实际使用的三种模式：

|     |     |     |
| --- | --- | --- |  
| 调用形态 | 实际语义 | 使用场景 |
| `skipVoid(ctx)` | 空白 + 换行 + 注释全跳 | 主循环开头/收尾、内联表与数组循环内 |
| `skipVoid(ctx, true)` | 只跳水平空白和注释， **停在换行前** | 行尾校验：换行本身要留给调用方检查 |
| `skipVoid(ctx, true, true)` | 只跳水平空白，注释也不跳 | `parseKey()` 收尾： `=` 之后到值之间只允许空格/制表符 |

对每条路径，它都在 `parseKey()` 之前把游标对到键名首字符， `parseKey()` 里 `charCodeAt` 的分支判断因此总能拿到有效首字符。路径 4 的链路它也全程在场：行首一次，外层 `=` 之后一次（ `parseKey()` 收尾），每个内层键名之前各一次，后文路径 4 的调用链里会逐个遇到它。

它是纯逐字符 `charCodeAt` 循环，扫描长度等于跳过的字符数，严格线性，无回溯。全部实测中它都不是耗时来源。同样逐字符推进， `skipVoid()` 停在它该停的位置； `parseKey()` 的搜索不是这样。

### 4.3 parseKey() — 漏洞本体：键名解析器与两个 sink

|     |     |
| --- | --- | 
| 项目  | 内容  |
| 定义位置 | `src/struct.ts:38-115` （npm 包 `smol-toml@1.8.0` 的编译产物为 `dist/struct.js:34-102` ） |
| 签名  | `parseKey(ctx: ParseContext, end = '='): string[]` |
| 调用方 | `parse()` 键值行（默认 `end` ）、 `parse()` 表头（ `end=']'` ， `parse.ts:148` ）、 `parseInlineTable()` 内层键（默认 `end` ， `struct.ts:136` ） |
| 与漏洞的关系 | **两个 sink 都在本函数内**： `struct.ts:66` （引号键分支）、 `struct.ts:97` （裸键分支） |

`parseKey()` 解析一个完整的键，可能是 `a.b.c` 这样的点分键，返回各段组成的 `string[]` ；解析结束时游标停在值的开头，或表头的 `]` 之后，交还调用方。四条路径都要过这一站。

第二个参数 `end` 描述当前语句的终止符：键值行传 `'='` （默认），表头传 `']'` 。函数第一步就用它确定边界：

```typescript
// parseKey() 开头：start 为键起点（进入函数时的 ctx.p）
let endPtr = ctx.s.indexOf(end, start)
if (endPtr < 0) {
    throw new TomlError('incomplete key-value: cannot find end of key', { toml: ctx.s, ptr: start })
}
```

`endPtr` 就是本行边界，当前键的活动范围本来到此封顶。后面两处 sink 的搜索，都没有拿它当上界。

完整实现如下，为阅读做了缩略与注释：

```typescript
export function parseKey(ctx: ParseContext, end = '='): string[] {
    let start = ctx.p
    let dot = start - 1
    let parsed = []

    let endPtr = ctx.s.indexOf(end, start)      // ① 本行边界（见上）
    do {
        let c = ctx.s.charCodeAt(ctx.p = ++dot) // ② 读下一段键的首字符

        if (c !== 0x20 && c !== 0x9 /* \t */) { //    纯空白段（如 `a . b` 点号旁的空格）直接跳过
            if (c === 0x22 /* " */ || c === 0x27 /* ' */) {
                // ③ 引号键分支
                if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2)) {
                    throw new TomlError('multiline strings are not allowed in keys', …)
                }
                let part = parseString(ctx)                 // 消费引号内容，ctx.p 停在闭引号后
                dot = ctx.s.indexOf('.', ctx.p)             // ★ sink A（struct.ts:66）
                let strEnd = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot)
                if (indexOfNewline(strEnd) > -1) throw new TomlError('newlines are not allowed in keys', …)
                if (strEnd.trimStart()) throw new TomlError('found extra tokens after the string part', …)
                if (endPtr < ctx.p) {                       // ④ '=' 落在字符串内部 → 重新找真 '='
                    endPtr = ctx.s.indexOf(end, ctx.p)
                    if (endPtr < 0) throw new TomlError('incomplete key-value…', …)
                }
                parsed.push(part)
            } else {
                // ⑤ 裸键分支
                dot = ctx.s.indexOf('.', ctx.p)             // ★ sink B（struct.ts:97）
                let part = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot)
                if (!KEY_PART_RE.test(part)) {
                    throw new TomlError('only letter, numbers, dashes and underscores are allowed in keys', …)
                }
                parsed.push(part.trimEnd())
            }
        }
    } while (dot + 1 && dot < endPtr)          // ⑥ 点号确实在本行内才继续下一段

    ctx.p = endPtr + 1                          // ⑦ 越过 '=' 或 ']'
    skipVoid(ctx, true, true)                   // ⑧ 只跳水平空白，停在值前
    return parsed
}
```

② 的游标技巧在 `dot` 的初值上： `start - 1` ，首次 `++dot` 恰好落在键首字符；此后每轮循环 `++dot` 都跳过上一段后面的点号，直奔下一段首字符。点号旁带空格的写法如 `a . b` 时，空白字符各占一轮循环、循环体直接跳过，效果相同。

③ 引号键分支先连查两个字符，排除三引号，TOML 禁止多行键。 `parseString()` 消费 `"…"` / `'…'` （下一节详解）后，执行 **sink A**。随后把闭引号到点号或行尾之间的片段切出来做两项检查：不许换行，不许字符串段之后还有多余 token。④ 处理一种边界：最初的 `=` 若其实落在字符串内部，如 `"a=b" = 1` ，此时 `endPtr < ctx.p` ，需要从闭引号之后重找真正的 `=` 。⑤ 裸键分支执行 **sink B**，随后切片夹回本行，用 `KEY_PART_RE` （ `/^[a-zA-Z0-9-_]+[ \t]*$/` ）校验裸键字符集：字母、数字、连字符、下划线，尾随空白允许； `trimEnd` 后收集为一段。

⑥ 的循环条件 `while (dot + 1 && dot < endPtr)` ： `dot + 1` 为 0 即没找到点号（-1）， `dot < endPtr` 确保点号在本行内。只有点分键（ `a.b.c` ）才会多轮循环；无点号文档每轮恰好在第一次 sink 后终止——sink 已执行，循环退出只意味着确认没有下一段。⑦⑧ 收尾：游标越过结束符， `skipVoid(true, true)` 只跳水平空白，把游标停在值首字符，交还 `parse()` / `parseInlineTable()` 。

开篇根因部分的三行示意正是本函数的浓缩。示意 ① 对应 `endPtr` 行，示意 ② 对应两处 `★` sink，示意 ③ 对应 sink 之后把 `dot` 夹回 `endPtr` 的 `slice` 行；这里补全的是这些片段所在的完整控制流。

每解析一个键，实际发生两类 `indexOf` 搜索：定位边界用掉一次 `indexOf(end)` ，此后每一段键各用掉一次 `indexOf('.')` ——四条路径的输入都是单段键，两类恰好一比一。前者有天然上界，合法 TOML 的结束符就在本行之内，代价 O(行长)；后者没有任何上界，搜索对象是整篇 `ctx.s` ，无点号时一路扫到文档结尾返回 -1，代价 O(剩余文档长度)。切片处的 `dot > endPtr ? endPtr : dot` 只是事后把结果夹回本行，撤销不了已经发生的扫描。判断只在本行内有意义，代价却按整篇文档支付。先扫描、后限界，错的就是这个顺序。

路径 1/3/4 的裸键输入全部命中 sink B， `end` 分别为 `=` 、`]` 、 `=` ；路径 2 的引号键命中 sink A。四条路径的差异只是从哪个入口、以什么结束符、走哪个分支进入本函数，缺陷本身是同一个。

1.9.0 的修复把两处 `indexOf('.')` 换成逐字符状态机：从 `ctx.p` 出发用 `charCodeAt` 前进，按状态转移，不再越出本行。四条路径的 1.9.0 解析结果与 1.8.0 完全一致；结果对象改用 null 原型是同版的另一处独立变更，前文根因部分提过。这里改变的只是扫描的边界。

### 4.4 parseString() — 字符串解析状态机

|     |     |
| --- | --- | 
| 项目  | 内容  |
| 定义位置 | `src/primitive.ts:40-191` |
| 签名  | `parseString(ctx: ParseContext): string` |
| 调用方 | `parseKey()` 引号键分支（ `struct.ts:65` ，即 `parseString()` 调用行——紧随其后的 `struct.ts:66` 就是 sink A）、 `extractValue()` 字符串值（ `extract.ts:59` ） |
| 与漏洞的关系 | 无缺陷；路径 2 中它消费键名的引号部分， **其返回时的游标位置正是 sink A 的搜索起点** |

`parseString()` 解析 TOML 的四种字符串形态：基本串 `"…"` 、字面串 `'…'` ，以及各自的三引号多行变体。键名场景（路径 2）解析 `"kN"` 这类引号键，值场景解析字符串值。转义解码与合法性校验（控制字符、非法转义、未闭合）也由它一并承担。

实现的开头读首字符 `first` ，即引号类型； `isLiteral` 判断是否字面串（ `'` ，无转义），连读两位相同引号判定 `isMultiline` 。多行串还会裁掉紧随三引号的首个换行，这是 TOML 规则。

源码在这里保留了一段被注释掉的字面串快速路径，作者附了实测数据：spec 场景 5.08→5.09 µs，5MB 场景 115.73→113.89 ms，结论是快速路径没有明显收益。这段注释就此留在源码里。事后看颇具讽刺意味——真正的性能问题不在字符串解码，而在 `parseKey()` 的无界搜索。

主循环维护四个状态，注释里明确列出含义：0 正常解码；1 处理 `\` 转义；2/3 处理行尾反斜杠续行的两个阶段（转义了行尾空白，多行串专用）。循环逐字符 `charCodeAt` 。多行串遇换行、状态非 0 时一律归一为 3，允许续行回到正常解码，行尾反斜杠续行的两阶段就是状态 2→3。控制字符（ `< 0x20` 且非 `\t` ，或 `0x7f` ）一律抛 `TomlError` 。

闭引号的匹配分两种情形。单引号串遇到同引号即结束；三引号串要求连续三个，还要处理结尾 4–5 个引号的边界，前 1–2 个属于内容。状态 1 里查转义表： `\b \t \n \f \r \e \" \\` ，以及 Unicode 转义 `\xHH` （2 位）、 `\uHHHH` （4 位）、 `\UHHHHHHHH` （8 位），逐位换算十六进制，并校验码点不为负、不超 `0x10ffff` 、不在代理区 `0xd800–0xdfff` 。状态 2 遇到非空白字符，抛"只有行尾空白可被转义"；循环自然结束仍未闭合，抛 `unfinished string` 。返回解码后的字符串内容， `ctx.p` 停在闭引号之后。

它的扫描长度等于字符串长度加定界符，单遍线性，四种形态共用一套循环，在任何路径里都不是瓶颈。路径 2 中每个键 `"kN"` 都由它消费：进入时游标在开引号，返回时在闭引号之后， `parseKey()` 紧接着以这个位置为起点执行 sink A（ `struct.ts:66` ）。这份耗时是路径 2 每行多出的固定成本；引号还让文档更大，每行多 2 字节、全文大 18%，各次全文扫描也随之变长。两件事叠起来，就是路径 2 在 1.8.0 上比路径 1 慢的原因：128,000 行，4,365.483 ms 对 3,659.870 ms。

### 4.5 peekTable() — 表结构状态机

|     |     |
| --- | --- | 
| 项目  | 内容  |
| 定义位置 | `src/parse.ts:50-124` |
| 签名  | `peekTable(key: string[], table: TomlTable, meta: MetaRecord, type: Type): PeekResult` ， `PeekResult = [string, TomlTable, MetaRecord] \| null` |
| 数据结构 | `Type` ： `DOTTED` / `EXPLICIT` / `ARRAY` / `ARRAY_DOTTED` ； `MetaState` ： `{ t: 类型, d: 已定义, i: 数组元素计数, c: 子元数据 }` |
| 与漏洞的关系 | 无缺陷；它的 ARRAY 追加机制是 **路径 3 输入可无限重复的语法基础**；路径 4 中负责安放外层键 |

`parse()` 每解析完一个键，表头或键值行，就调用 `peekTable()` 。它沿着键的各段，在结果表 `table` 和元数据树 `meta` 中锁步下钻，必要时创建中间表，登记键的类型与定义状态，最终返回往哪里写的三元组。任何违反 TOML 重定义规则的尝试都返回 `null` ，由 `parse()` 转成带位置的 `TomlError` （"trying to redefine an already defined table or value"，位置即语句开头 `tmp` ）。哪些表可以重复声明、哪些键不能再写，TOML 里最繁琐的这套规则，集中在了这一处。

下钻对键的每一段，同时在 `t` （结果侧）与 `m` （元数据侧）向下走。中间段不存在时 `(t[k] = {})` 创建空表，并在元数据里登记类型，数组表下的中间段记为 `ARRAY_DOTTED` 。类型冲突即拒绝：点分键试图穿过一个显式表或数组表（ `state.t === EXPLICIT || ARRAY` 且当前是 `DOTTED` ）时直接返回 `null` 。下钻遇到 `ARRAY` 键则跳到结果数组的最后一个元素（ `t = t[t.length - 1]` ，元数据侧同步下到该元素的 `c` 槽位），后续写入落在数组的最新元素里，多个 `[[a]]` 之后键值行写入最后一个元素，就是在这里实现的。遇到 `__proto__` 键时用 `Object.defineProperty` 显式定义，避免赋值触发原型链污染， `parseInlineTable()` 里有同款防护。

末段处理是类型相关的大分支。类型不匹配返回 `null` ，唯一例外是 `EXPLICIT` 允许落在 `ARRAY_DOTTED` 上，例如 `[[a.b]]` 之后再显式声明 `[a]` ，把数组表的隐式中间段转正。 `ARRAY` 分支与路径 3 直接相关：

```typescript
// peekTable() 末段处理：key 为最后一段，t/state 为下钻后的结果侧与元数据侧
if (type === Type.ARRAY) {
    if (!state.d) { state.d = true; t[k] = [] }   // 首个 [[a]]：创建数组
    t[k].push(t = {})                             // 每个 [[a]]：追加一个新空表
    state.c[state.i++] = (state = { t: Type.EXPLICIT, d: false, i: 0, c: {} })
}
```

首次出现时创建数组，之后 **每次都无条件追加** 一个新元素，并为其登记独立的元数据槽位。 `[[a]]` 因此可以无限重复而永不触发重定义错误，路径 3 的 128,000 个表头全部合法，靠的就是这一点。 `state.d` 已定义则返回 `null` ，这是普通表 `[a]` 不能声明两次的原因，第二次时 `d` 已为真；同一张表里重复写同一个键值行，则在下钻循环中被 `m[k].t === DOTTED && d` 的检查拦下。正常路径返回 `[k, t, state.c]` ：目标键，要写入的表（ `EXPLICIT` 时是表本身； `ARRAY` 时是刚 push 的元素； `DOTTED` 时是当前表），以及供子键使用的元数据。

路径 3 中每个 `[[a]]` 解析完键，由它追加数组元素， `parse()` 同时把 `tbl` 切到新元素。路径 4 中它以 `Type.DOTTED` 安放外层键 `x` ，返回写入位置，供 `extractValue()` 的结果挂载。路径 1/2 里它同样在场，每行键值对都要过一遍，只是不承担路径特色。它的开销与键的段数成正比，点分键多几段就多几轮下钻，线性，且没有字符串扫描。四条路径的耗时差异与它无关。

### 4.6 extractValue() — 值分派器

|     |     |
| --- | --- | 
| 项目  | 内容  |
| 定义位置 | `src/extract.ts:36-80` |
| 签名  | `extractValue(ctx: ParseContext, end: number \| undefined, integersAsBigInt: IntegersAsBigInt): TomlValue` |
| 调用方 | `parse()` 键值行取值（ `end` 传 `undefined` ）、 `parseInlineTable()` （ `end = 0x7d }` ）、 `parseArray()` （ `end = 0x5d ]` ） |
| 与漏洞的关系 | 无缺陷；路径 4 中它看到 `{` 把控制流交给 `parseInlineTable()` ，是 **递归入口的开启者** |

键已经解析完，游标停在值的首字符，接下来由 `extractValue()` 判断这个值是什么。分派完全基于首字符的字符码：

|     |     |     |
| --- | --- | --- |  
| 首字符 | 分派目标 | 说明  |
| `[` | `parseArray(ctx, …)` | 数组，消耗一层深度预算 |
| `{` | `parseInlineTable(ctx, …)` | 内联表（路径 4 的入口），消耗一层深度预算 |
| `"` / `'` | `parseString(ctx)` | 字符串（前文详解） |
| `t` / `f` | 布尔快速路径 | 首字符唯一确定合法值： `t` 只可能是 `true` 、 `f` 只可能是 `false` ，逐字符核对 `rue` / `alse` ，错一个就抛 `invalid value` |
| 其他  | `parseValue(ctx, …)` | 数字与日期。源码注释直言这是"Legacy logic for numbers and dates. Slow and needs to be rewritten." |

结构值（ `[`/ `{` ）进入分支前先查深度预算： `if (!ctx.d--) throw 'document contains excessively nested structures. aborting.'` 。 `ctx.d` 就是 `parse()` 选项 `maxDepth` （默认 1000）落到上下文里的预算，递归结构每层消耗一格、返回时归还（ `ctx.d++` ）。这是一套既有机制，防的是深嵌套爆栈与资源耗尽。对照之下，键名扫描的复杂度没有任何预算约束。 **库对结构深度设了防，对扫描范围没设防。**

参数 `end` 告诉值解析器这个值在什么环境下结束：内联表里传 `}` ，数组里传 `]` ，顶层传 `undefined` ，供数字、日期这类无定界符的值确定自己的右边界，例如配合注释剥离 `sliceAndTrimEndOf` 。

分派本身 O(1)；各分支的解析器，字符串、数组、内联表、数字，各自线性于值长度，从不做超出值范围的扫描。

路径 4 中，外层 `x =` 之后游标指向 `{` ， `extractValue()` 即刻把控制流交给 `parseInlineTable()` （下一节详解），从顶层键值行到内联表循环的递归交接在这里完成。路径 1/2 中它解析每行的值 `1` ，走数字路径。路径 3 的表头没有值，不经过它。

### 4.7 parseInlineTable() — 内联表循环

|     |     |
| --- | --- | 
| 项目  | 内容  |
| 定义位置 | `src/struct.ts:118-177` |
| 签名  | `parseInlineTable(ctx: ParseContext, integersAsBigInt: IntegersAsBigInt): TomlTable` |
| 调用方 | `extractValue()` 的 `{` 分支（ `extract.ts:51` ） |
| 与漏洞的关系 | 无自身缺陷；它在循环中反复调用 `parseKey()` （ `struct.ts:136` ），是 **路径 4 的缺陷调用放大器** |

`parseInlineTable()` 解析 `{ k1 = v1, k2 = v2, … }` 形式的内联表：进入时游标在 `{` ，逐项读键和值，读到 `}` 为止，返回组装好的对象。TOML 规定内联表定义后不可再扩展，它因此内置了一套严格的重复定义检查。

完整实现如下，为阅读做了缩略与注释：

```typescript
export function parseInlineTable(ctx: ParseContext, integersAsBigInt: IntegersAsBigInt): TomlTable {
    let res: TomlTable = {}
    let seen = new Set()                        // ① 已定义值的登记簿
    ctx.p++                                     // ② 越过 '{'
    while (ctx.p < ctx.s.length) {
        skipVoid(ctx)                           // ③ 跳空白（含换行）与注释
        if (ctx.s.charCodeAt(ctx.p) === 0x7d /* } */) { ctx.p++; return res }

        let t: any = res
        let p = ctx.p
        let key = parseKey(ctx)                 // ④ 内层键：与外层同一套 parseKey（默认 end='='）
        for (let i = 0; i < key.length; i++) {  //    点分内层键的中间表下钻
            /* 逐段：hasOwn/seen 重复定义检查（非对象值或已在 seen 里的对象 → 抛
               'trying to redefine an already defined value'）、__proto__ 防护 */
        }
        /* 最终段已存在（如点分键创建的中间表）→ 同样抛重定义错误 */

        let value = extractValue(ctx, 0x7d, integersAsBigInt)   // ⑤ 取值，end='}'
        seen.add(t[key.at(-1)!] = value)        // ⑥ 登记已定义的值（源码为 t[k!]，k 即末段键名）

        skipVoid(ctx)
        let c = ctx.s.charCodeAt(ctx.p++)
        if (c === 0x7d /* } */) return res      //    闭括号收尾
        if (c !== 0x2c /* , */) throw new TomlError('expected comma or end of structure', …)
    }
    throw new TomlError('unfinished table encountered', …)
}
```

① 的 `seen` 集合配合 `Object.hasOwn` 构成两层防护。每个成功赋值的值，无论是否对象，都进 `seen` 。循环内的检查拦下两种情形：目标已存在且是非对象值，或已在 `seen` 里的对象。循环外的检查补上最后一种，目标是为点分键创建的中间表（对象、但不在 `seen` 里）时，同样抛"trying to redefine an already defined value"。净效果：中间表允许被后续点分键穿过， `{a.b = 1, a.c = 2}` 合法；任何键一旦存在就不能再被赋值， `{a.b = 1, a = 1}` 抛错。 `__proto__` 键走 `defineProperty` 防原型污染，与 `peekTable()` 同款。

③ 的 `skipVoid(ctx)` 不禁换行。内联表内换行不是本库私加的扩展，而是 TOML 1.1.0 规范允许的写法，本库的兼容目标就是 1.1.0，因此超大内联表，甚至写成多行，都能解析。

④ 是路径 4 的核心。内层键调用的是同一个 `parseKey()` ，默认 `end = '='` ，走同一条裸键分支，命中同一个 **sink B** （ `struct.ts:97` ）。 `parseInlineTable()` 自己不做任何点号搜索，它决定的，是 `parseKey()` 在同一对花括号内被调用多少次。

⑤ 把值交给 `extractValue()` ， `end` 传 `}` ；嵌套结构，内联表套内联表、数组，在此继续递归并消耗深度预算。⑥ 登记与循环收尾：每个成功赋值的值经 `seen.add` 入簿，机制见 ①；每项之后必须是 `,`（继续）或 `}` （结束），否则抛"expected comma or end of structure"；文档在表未闭合时结束，抛"unfinished table encountered"。

它在循环里反复调用的都是同一个 `parseKey()` ，像复读机一样。一个含 64,000 个内层键的内联表，等于 64,001 次全文点号搜索：64,000 个内层键，加上外层 `x` 自己的一次，后者发生在进入本函数之前。关键的乘法关系在这里：内联表的所有键共享同一个 `ctx.s` （整篇文档），而内层 `parseKey()` 的 sink 从内层键的当前位置扫到文档末尾。排在当前键之后的所有内容，花括号内其余的内层键，乃至内联表之外的文档，都与这个键毫无关系，却每次都要陪扫一遍。PoC 只用一个外层键，正是为了让这部分工作量归因干净，后文路径 4 的复现就是这么设计的。

它自身的簿记， `skipVoid()` 、分隔符检查、 `seen` 维护，随键数线性；平方级耗时全部来自它调用的 `parseKey()` 的无界搜索。

七个函数按代价角色归为三类： `parse()` 与 `parseInlineTable()` 决定 `parseKey()` 被调用多少次，是放大器； `skipVoid()` 、 `parseString()` 、 `peekTable()` 、 `extractValue()` 各自线性，把数据送到该到的地方； `parseKey()` 自己，是唯一的平方级关节。

## 5\. 路径 1：大量普通裸键（kN = 1）

上一章把七个函数按代价归了类。分类是否成立，要放到容器里跑一遍。路径 1 是维护者公告给出的原始场景：一份没有点号的普通键值文档，每一行都走一遍 `parseKey()` 的裸键分支（sink B）。

### 5.1 复现方法

复现在仓库根目录进行，完整说明见 `repro/bare-keys/README.md` 。先起服务：

```bash
docker compose -f repro/bare-keys/compose.yaml up -d --wait
docker compose -f repro/bare-keys/compose.yaml ps
```

`up -d --wait` 要等两个服务都通过健康检查才返回， `ps` 确认二者均为 healthy。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f304b93a2e5f1815.png)  
*图 5-2：路径 1 复现服务启动实况——* `up -d --wait` *创建网络并等待两个服务通过健康检查（vulnerable 安装* smol-toml@1.8.0 *、patched 安装 1.9.0），* `ps` *确认二者均为 healthy，端口仅绑定回环地址*

PoC 生成 `k0 = 1\nk1 = 1\n…` 形式的输入，键名唯一，不含点号，语法完全合法。规模按 16,000 → 32,000 → 64,000 → 128,000 行递增，逐档发给两个服务。运行 PoC 时以 `tee` 同屏展示，原始证据同时留档：

```bash
docker compose -f repro/bare-keys/compose.yaml --profile tools run --rm -T poc | tee repro/bare-keys/evidence.jsonl
docker compose -f repro/bare-keys/compose.yaml logs --no-color > repro/bare-keys/container-logs.txt
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8e413a5034ae52c8.png)  
*图 5-3：路径 1 PoC 实测输出（* `tee` *同步留档）——两行健康检查核对版本后，四档规模的* `parse_ms` *逐对输出：1.8.0 从 66.564 ms 一路增至 3,659.870 ms，同规模下 1.9.0 仅 84.893 ms；并发健康请求在旧版解析期间等待 3,516.338 ms、新版 0.663 ms；末行* `verdict` *判定* `success:true` *。下节实测表格的数字即转录自本图*

这条路径还把两个服务的端口绑到了宿主机回环地址上，四条路径里唯一这样配的。复现期间可以手动抽查，测完清理：

```bash
curl -s http://127.0.0.1:18080/health; echo '   # vulnerable (1.8.0)'
curl -s http://127.0.0.1:18081/health; echo '   # patched (1.9.0)'
docker compose -f repro/bare-keys/compose.yaml down --remove-orphans
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/019cd7cf6943c6ae.png)  
*图 5-4：路径 1 手动抽查与测后清理——两个* `/health` *端点分别回报实际安装的版本（1.8.0 / 1.9.0），* `down --remove-orphans` *移除全部容器与网络，容器内临时安装的 npm 包随之清除*

这些命令背后是一次四阶段编排。PoC 与两个服务之间的完整交互时序见图 5-1；后面三条路径与点号稀疏变体复用的是同一套时序，不再另画。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5de871a2de7c43e6.png)  
*图 5-1：复现框架交互时序——PoC 客户端与 vulnerable（* smol-toml@1.8.0 *）、patched（* smol-toml@1.9.0 *）两服务之间的完整编排：① 依次* `GET /health` *通过并核对版本；② 对两服务各按 16,000 → 128,000 行四档递增发送* `POST /parse` *，逐响应过* `checkedParse` *校验闸门并记录服务端* `parseMs` *；③ 以最大档输入解析期间并发发* `GET /health` *测事件循环阻塞；④ 翻倍倍率 ≥ 2.5 且版本差距 ≥ 10 两条同时满足才判 success*

### 5.2 调用链与路径要点

按请求推进的先后顺序，一条 `kN = 1` 从 HTTP 请求体走到 sink，完整调用链如下。前 6 行是复现框架侧，后 6 行进入库内：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 顺序  | 函数/方法 | 位置  | 作用  | 详解  |
| 1   | `main()` | `repro/bare-keys/poc.mjs:36-73` | 编排健康检查、四规模请求、并发健康检查与判定 | PoC 客户端 |
| 2   | `document(lines)` | `repro/bare-keys/poc.mjs:10-12` | 生成无点号的 `kN = 1` 合法键值行 | PoC 客户端 |
| 3   | `checkedParse()` | `repro/bare-keys/poc.mjs:26-34` | 校验 200、版本、字节数、键数、首尾键值 | PoC 客户端 |
| 4   | `request()` | `repro/bare-keys/poc.mjs:14-24` | 封装 `fetch` （30 秒超时） | PoC 客户端 |
| 5   | `http.createServer` 回调 | `repro/bare-keys/server.mjs:16-52` | 路由、流式收体、4 MiB 上限 | 复现服务端 |
| 6   | `Buffer.concat` → `toString('utf8')` | `repro/bare-keys/server.mjs:37` | 字节流 → 字符串，进入库 | 复现服务端 |
| 7   | `parse(toml)` | `src/parse.ts:133-195` | 入口： `ctx.s` 装入全文，主循环逐行分派 | `parse()` |
| 8   | `skipVoid(ctx)` | `src/util.ts:79-93` | 游标对齐到键名 | `skipVoid()` |
| 9   | `parseKey(ctx)` | `src/struct.ts:38-115` | 解析当前键， `end` 默认 `=` | `parseKey()` |
| 10  | `indexOf('=', start)` | `src/struct.ts:43` | 找到本行 `=` → `endPtr` | `parseKey()` |
| 11  | `charCodeAt(ctx.p)` | `src/struct.ts:52` | 首字符非引号 → 裸键分支 | `parseKey()` |
| 12  | `indexOf('.', ctx.p)` **（sink B）** | `src/struct.ts:97` | 从当前键对 **整个剩余文档** 搜点号 | `parseKey()` |

四条路径里，这一条最纯粹：没有任何语法包装。每一行只发生三件与键有关的事， `indexOf('=')` 定界，便宜； `charCodeAt` 选分支，O(1)； `indexOf('.')` 做的是全文搜索，昂贵。

sink 返回 -1 后，循环条件 `dot + 1 && dot < endPtr` 随即终止，此时 `dot + 1` 为 0。 `slice` 夹回本行，拿到正确的 `kN` ， `KEY_PART_RE` 通过；之后 `parse()` 经 `peekTable()` 落表， `extractValue()` 取值 `1` ，一行结束。一份 128,000 行的文档，这个流程要走 128,000 遍。

每行的解析结果完全正确，出错的是代价。正确性掩盖了逐行一次的全文扫描，这类复杂度漏洞容易被忽视。第 i 行的扫描长度 ≈ N−i，总代价 ≈ N²/2，前文根因部分已推导。

### 5.3 实测结果

同一份文档发给两个服务，唯一的差别是 smol-toml 的版本。服务端 `parse()` 耗时（单位 ms，单次实测）：

|     |     |     |
| --- | --- | --- |  
| 行数  | 1.8.0 | 1.9.0 |
| 16,000 | 66.564 | 12.657 |
| 32,000 | 225.842 | 19.932 |
| 64,000 | 876.996 | 36.943 |
| 128,000 | **3,659.870** | 84.893 |

-   1.8.0 从 64,000 → 128,000 行耗时增长 4.173 倍，是平方级的特征；同规模下比 1.9.0 慢 43.112 倍；
-   解析 128,000 行期间，并发的 `GET /health` 在 1.8.0 上等待 3,516.338 ms，在 1.9.0 上仅 0.663 ms；
-   两版本都正确解析出 128,000 个键（最大请求 1,424,890 字节），差异全部来自解析工作量。PoC 判定 `success:true` ，退出码 0。
-   本组数据为单轮实测：在容器实验台内顺序执行、无并行复现容器，图 5-3 即该轮的完整终端输出， `evidence.jsonl` 为同轮 `tee` 留档。

## 6\. 路径 2：大量带引号键名（"kN" = 1）

路径 1 的数字刚落定。同一种输入来源，换一种写法，就是路径 2：每个键都加上双引号。TOML 允许用引号表达含特殊字符的键， `"k0" = 1` 因此完全合法。但引号一加， `parseKey()` 走的便不再是路径 1 的裸键分支，而是引号键分支，命中的是另一个点号搜索：sink A（ `struct.ts:66` ）。这处搜索不守在分支开头，要等 `parseString()` 消费完键名之后才执行。两个 sink 在调用图中的位置见图 4-1。

### 6.1 复现方法

起服务、跑 PoC、留日志，三条命令与路径 1 同一套，只换了目录：

```bash
docker compose -f repro/quoted-keys/compose.yaml up -d --wait
docker compose -f repro/quoted-keys/compose.yaml --profile tools run --rm -T poc | tee repro/quoted-keys/evidence.jsonl
docker compose -f repro/quoted-keys/compose.yaml logs --no-color > repro/quoted-keys/container-logs.txt
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d0a09422148f5f7b.png)  
*图 6-1：路径 2 PoC 实测输出（* `tee` *同步留档）——* `"kN" = 1` *输入在 1.8.0 上按档增至 4,365.483 ms，1.9.0 同规模 106.168 ms；并发健康请求旧版等待 4,312.051 ms、新版 0.716 ms；* `verdict` *判定* `success:true` *。下节实测表格的数字即转录自本图*

PoC 生成 `"k0" = 1\n"k1" = 1\n…` ，规模按 16,000 → 128,000 行四档递增，逐档发给两个服务，最大请求 1,680,890 字节，低于 4 MiB 上限。四阶段编排与交互时序同图 5-1。清理命令同路径 1，把目录换成 `repro/quoted-keys/` 即可；完整说明见 `repro/quoted-keys/README.md` 。

### 6.2 调用链与路径要点

HTTP 侧的 `main()` 、 `document()` 、 `checkedParse()` 、 `request()` 与服务端回调，同路径 1 复用一套编排，这里只列进入库之后的链路：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 顺序  | 函数/方法 | 位置  | 作用  | 详解  |
| 1   | `parse(toml)` | `src/parse.ts:133-195` | 键值行分支调用 `parseKey(ctx)` | `parse()` |
| 2   | `skipVoid(ctx)` | `src/util.ts:79-93` | 游标移到键名起点（ `"` ） | `skipVoid()` |
| 3   | `parseKey(ctx)` | `src/struct.ts:38-115` | 解析带引号键， `end` 仍为 `=` | `parseKey()` |
| 4   | `indexOf('=', start)` | `src/struct.ts:43` | 找到本行 `=` ，设定 `endPtr` | `parseKey()` |
| 5   | `charCodeAt(ctx.p)` | `src/struct.ts:52-63` | 首字符 `0x22` → 引号分支；连出三个引号即抛"多行键不允许" | `parseKey()` |
| 6   | `parseString(ctx)` | `src/primitive.ts:40-191` | 状态机消费 `"kN"` ，游标停在闭引号后 | `parseString()` |
| 7   | `indexOf('.', ctx.p)` **（sink A）** | `src/struct.ts:66` | 从闭引号之后对 **整个剩余文档** 搜点号 | `parseKey()` |
| 8   | `slice` + `indexOfNewline` | `src/struct.ts:68-82` | 闭引号后的片段做换行/多余 token 检查 | `parseKey()` |

表中第 7 行的 `indexOf('.', ctx.p)` 就是 sink A。同一种无界搜索，在另一个分支里原样出现，这恰好说明缺陷不是某一行代码手滑： `parseKey()` 的两个分支各自复制了同一个错误模式，sink A 与 sink B 即前文 `parseKey()` 逐段解读的 ③ 与 ⑤，分居引号键与裸键两个分支。

引号还给这条路径添了两项成本。一项是每行一次 `parseString()` 的固定成本；另一项在文档体积上：每行多出一对引号，2 字节，全文因此大 18%，各次全文扫描都随之更长。两项都只是低阶项与常数因子，平方级增长的主导项仍是 sink A。

正确性也在容器里用小样本单独看过（图 6-2）。进入 1.8.0 的服务容器，直接调用编译产物， `"k0" = 1\n"k1" = 1` 解析为 `{"k0":1,"k1":1}` 。输出正确，出问题的只有耗时。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4e5b36d4fe38a5f1.png)  
*图 6-2：路径 2 小样本验证——* `docker compose exec` *进入 vulnerable（1.8.0）服务容器，直接* `require("smol-toml")` *解析两行引号键输入，结果与规范一致*

### 6.3 实测结果

两个服务各自的 `parse()` 耗时（单位 ms，单次实测）：

|     |     |     |
| --- | --- | --- |  
| 行数  | 1.8.0 | 1.9.0 |
| 16,000 | 75.107 | 12.876 |
| 32,000 | 265.291 | 22.140 |
| 64,000 | 1,098.805 | 38.872 |
| 128,000 | **4,365.483** | 106.168 |

-   1.8.0 的耗时在 64,000 → 128,000 行之间增长 3.973 倍；128,000 行时与 1.9.0 的差距拉开到 41.119 倍。这个绝对耗时也是四条路径里最高的，比路径 1 同规模的 3,659.870 ms 慢近两成，差值就是上文那两项额外成本；
-   128,000 行解析期间，并发的 `GET /health` 在旧版上等了 4,312.051 ms，新版 0.716 ms；
-   两版本都正确返回 128,000 个键。这组数据也来自容器实验台内的单轮顺序实测，图 6-1 即完整输出， `evidence.jsonl` 为同轮 `tee` 留档。

## 7\. 路径 3：大量数组表头（\[\[a\]\]）

第三条路径轮到表头行。 `[a]` / `[[a]]` 里的表名同样要经过 `parseKey()` ，只是结束符从默认的 `=` 换成了 `]` 。普通表 `[a]` 不允许重复声明；数组表头 `[[a]]` 正相反，每出现一次，都合法地往数组里添一个新元素，凭的是前文 `peekTable()` 对 `ARRAY` 类型的无条件追加。于是它天然可重复，同样不带点号。每个表名，都会触发一次 sink B 的全文点号搜索。

### 7.1 复现方法

```bash
docker compose -f repro/array-headers/compose.yaml up -d --wait
docker compose -f repro/array-headers/compose.yaml --profile tools run --rm -T poc | tee repro/array-headers/evidence.jsonl
docker compose -f repro/array-headers/compose.yaml logs --no-color > repro/array-headers/container-logs.txt
docker compose -f repro/array-headers/compose.yaml stop
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4b54966ee84901c1.png)  
*图 7-1：路径 3 PoC 实测输出（* `tee` *同步留档）与测后* `stop` *——* `[[a]]` *表头输入在 1.8.0 上按档增至 1,912.590 ms，1.9.0 同规模 61.948 ms；并发健康请求旧版等待 1,742.585 ms、新版 0.683 ms；* `verdict` *判定* `success:true` *。下节实测表格的数字即转录自本图*

PoC 生成 `'[[a]]\n'.repeat(count)` ， `count` 按 16,000 → 128,000 个表头递增，最大请求 768,000 字节，本路径的服务上限为 2 MiB。服务端的结果校验与前两条路径不同： `server.mjs` 核对解析结果只有一个键 `a` 、且 `a` 是全由空对象组成的数组，返回 `count` 与 `valid` 字段；数组长度是否恰等于表头数，由 PoC 侧的 `checkedParse` 核对。四阶段编排与交互时序同图 5-1；清理命令同前，目录为 `repro/array-headers/` （详见 `repro/array-headers/README.md` ）。

### 7.2 调用链与路径要点

HTTP 侧（ `main` / `document` / `checkedParse` / `request` 、服务端回调）与路径 1/2 复用同一编排，此处只列进入库之后的链路；sink B 在调用图中的位置仍见图 4-1：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 顺序  | 函数/方法 | 位置  | 作用  | 详解  |
| 1   | `parse(toml)` | `src/parse.ts:133-195` | 见行首 `[`：前瞻第二个 `[` 判定数组表，跳过它后以 `]` 为结束符调用 `parseKey()` | `parse()` |
| 2   | `skipVoid(ctx)` | `src/util.ts:79-93` | 每轮迭代开始前跳过空白与换行 | `skipVoid()` |
| 3   | `parseKey(ctx, ']')` | `src/struct.ts:38-115` | 解析表头裸表名； `end` **由默认** `=` **被实参覆盖为** `]` | `parseKey()` |
| 4   | `indexOf(']', start)` | `src/struct.ts:43` | 找到本表头的 `]` ， `endPtr` 即表名边界 | `parseKey()` |
| 5   | `charCodeAt(ctx.p)` | `src/struct.ts:52` | `a` 非引号 → 裸键分支 | `parseKey()` |
| 6   | `indexOf('.', ctx.p)` **（sink B）** | `src/struct.ts:97` | 从表名对 **整个剩余文档** 搜点号（而非只搜到 `]` ） | `parseKey()` |
| 7   | `peekTable(k, res, meta, Type.ARRAY)` | `src/parse.ts:50-124` | 首个表头建数组，其后每个表头追加一个新空表 | `peekTable()` |

`parse()` 把 `]` 作为结束符传给了 `parseKey()` ， `endPtr` 也在 1 个字符之外便宜地找到——边界是现成的，点号搜索不用。把流程顺一遍： `parseKey(ctx, ']')` 走裸键分支，sink B 从表名 `a` 搜到文档末尾，返回 -1； `slice` 把终点夹回 `endPtr` ，得到表名 `a` ， `KEY_PART_RE` 通过。返回后 `parse()` 核对游标前一字符为 `]` 、再跳过第二个 `]` ； `peekTable()` 以 `ARRAY` 类型追加新元素，并把当前表切过去。

每个 `[[a]]` 行只有 6 字节，768,000 ÷ 128,000 = 6；这 6 个字节附带的，是一次数十万字符的扫描。同等字节预算下，这条路径的攻击效率在四条路径里最高：同样的预算能堆出最多的 `parseKey()` 调用，768 KB 输入即可造成近 2 秒阻塞。反过来按 128,000 条语句同规模对比，路径 1 的绝对耗时更高（3,659.870 ms 对本路径实测的 1,912.590 ms），字节开销也约为本路径的 1.85 倍（1,424,890 对 768,000 字节）。

容器里另做了一次小样本验证（图 7-2）：1.8.0 的编译产物把两个 `[[a]]` 正确解析为 `{"a":[{},{}]}` 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9af64b9ed03b94d2.png)  
*图 7-2：路径 3 小样本验证——重新* `up` *服务后，* `docker compose exec` *进入 vulnerable（1.8.0）容器解析两个* `[[a]]` *表头，结果为* `{"a":[{},{}]}` *，数组表头的可重复追加语义（* `peekTable()` *的 ARRAY 分支）得以确认*

### 7.3 实测结果

服务端 `parse()` 耗时（单位 ms，单轮实测）：

|     |     |     |
| --- | --- | --- |  
| 表头数 | 1.8.0 | 1.9.0 |
| 16,000 | 35.368 | 10.695 |
| 32,000 | 126.391 | 17.290 |
| 64,000 | 470.270 | 37.407 |
| 128,000 | **1,912.590** | 61.948 |

-   1.8.0 从 64,000 → 128,000 个表头，耗时增长 4.067 倍；128,000 表头同规模下，比 1.9.0 慢 30.874 倍。解析最大档期间，并发的 `GET /health` 在 1.8.0 上要等 1,742.585 ms；1.9.0 上的等待是 0.683 ms；
-   PoC 判定 `success:true` 、退出码 0，两版本都正确解析出对应长度的数组。这组数据出自容器实验台内的单轮顺序实测：图 7-1 即完整输出， `evidence.jsonl` 为同轮 `tee` 留档。

## 8\. 路径 4：内联表中的大量裸键（x = { kN = 1, … }）

前三条路径都由 `parse()` 的主循环逐条语句触发；第四条展示的是，递归下降同样能到达 sink。做法是把海量键塞进一个内联表。外层键 `x` 本身会先按路径 1 的方式触发一次 sink B；随后 `extractValue()` 见到值首字符 `{` ，开启值内递归， `parseInlineTable()` 在花括号内循环调用 `parseKey()` ，每个内层键再各触发一次。放大器就这样从顶层语句下沉到了值内部。

### 8.1 复现方法

```bash
docker compose -f repro/inline-table/compose.yaml up -d --wait vulnerable patched
docker compose -f repro/inline-table/compose.yaml --profile tools run --rm -T poc | tee repro/inline-table/evidence.jsonl
docker compose -f repro/inline-table/compose.yaml logs --no-color > repro/inline-table/container-logs.txt
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8348ecfdcf716a95.png)  
*图 8-2：路径 4 PoC 实测输出（* `tee` *同步留档）——单个内联表的内层键按档递增，1.8.0 在 64,000 键时达 970.772 ms，1.9.0 同规模 16.358 ms；并发健康请求旧版等待 889.337 ms、新版 1.010 ms；* `verdict` *判定* `success:true` *。下节实测表格的数字即转录自本图*

这一路径的载荷只有一条语句。PoC 生成单个外层键 `x = { k0 = 1, k1 = 1, … }` ，所有内层键唯一，且不含点号；规模按 8,000 → 16,000 → 32,000 → 64,000 个内层键递增，最大请求 756,897 字节，低于服务的 4 MiB 上限。PoC 侧的请求超时在本路径放宽到 45 秒，是各路径中唯一放宽的一档。服务端校验 `x` 是对象，返回内层键数与首尾值，由 PoC 的 `checkedParse` 逐响应核对。外层键只用一个，是这条路径的归因设计：随规模增长的解析工作量只能来自内联表内部的 `parseInlineTable() → parseKey()` ，排除了路径 1 成分的混杂。四阶段编排与交互时序同图 5-1；清理命令同前，目录为 `repro/inline-table/` （详见 `repro/inline-table/README.md` ）。

### 8.2 调用链与路径要点

HTTP 侧的 `main` 、 `document` 、 `checkedParse` 、 `request` 和服务端回调，与前三条路径复用同一套编排，此处只列进入库之后的链路。sink B 在静态调用图中的位置仍见图 4-1；这条链在运行时如何逐层递归、又如何共享上下文，见图 8-1：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 顺序  | 函数/方法 | 位置  | 作用  | 详解  |
| 1   | `parse(toml)` | `src/parse.ts:133-195` | 解析外层键 `x` ，随后取其值 | `parse()` |
| 2   | `skipVoid(ctx)` | `src/util.ts:79-93` | 跳过行首空白 | `skipVoid()` |
| 3   | `parseKey(ctx)` | `src/struct.ts:38-115` | 消费 `x =` ； **此步已触及一次 sink B** | `parseKey()` |
| 4   | `skipVoid(ctx, true, true)` | `src/struct.ts:113` | `parseKey()` 收尾： `=` 后只跳水平空白，游标指向 `{` | `skipVoid()` |
| 5   | `peekTable(k, tbl, m, Type.DOTTED)` | `src/parse.ts:50-124` | 以点分键类型安放 `x` ，返回写入位置 | `peekTable()` |
| 6   | `extractValue(ctx, void 0, …)` | `src/extract.ts:36-80` | 见首字符 `{` ，派发给内联表（消耗一层深度预算） | `extractValue()` |
| 7   | `parseInlineTable(ctx, …)` | `src/struct.ts:118-177` | 逐项读取 `{ }` 内逗号分隔的键值 | `parseInlineTable()` |
| 8   | `skipVoid(ctx)` | `src/util.ts:79-93` | 跳内层键名前的空白 | `skipVoid()` |
| 9   | `parseKey(ctx)` | `src/struct.ts:136` | 对每个内层 `kN` 再次解析键名（默认 `end='='` ） | `parseKey()` |
| 10  | `indexOf('=', start)` | `src/struct.ts:43` | 找内层键的 `=` | `parseKey()` |
| 11  | `charCodeAt(ctx.p)` | `src/struct.ts:52` | 选择裸键分支 | `parseKey()` |
| 12  | `indexOf('.', ctx.p)` **（sink B）** | `src/struct.ts:97` | 从内层键位置对 **整个剩余文档** 搜点号 | `parseKey()` |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/690d4131eff95d25.png)  
*图 8-1：路径 4 的运行时递归与共享上下文——左栏是文档条带：* `x = { k0 = 1, …, k63999 = 1 }` *只有一个外层键，整篇文档几乎全在花括号之内，红色箭头是某个内层键* `kN` *的 sink B 扫描范围（从花括号内的游标位置直到文档末尾，无点号返回 -1）；右栏是一次* `parse()` *的运行时递归链：外层* `x` *触发第 1 次全文搜索，* `extractValue()` *见* `{` *开启递归，* `parseInlineTable()` *循环 64,000 轮、逐个内层键触发第 2…64001 次；顶部是全链共享的同一个* `ctx` *对象——* `ctx.s` *永远是整篇文档，游标却已深入花括号之内。图 4-1 画的是全库的静态调用结构，本图只取路径 4 这一条链的运行时视角*

递归改变的是执行的层级，搜索范围没有随之缩小。 `parseInlineTable()` 拿到的仍是同一个 `ctx` ： `ctx.p` 只是被推进到花括号之内， `ctx.s` 还是整篇文档。于是每个内层键的 sink B 都从花括号内扫到文档结尾。64,000 个内层键，就是 64,001 次全文搜索，外层 `x` 那一次也计在内；机理就是前文 `parseInlineTable()` 的逐键循环。与路径 1 的对照最直接：同样的键数，摊在多行里是路径 1，收进一对花括号就是路径 4。放大发生在这两个层面， `parse()` 在顶层逐语句， `parseInlineTable()` 在值内部逐键；位置不同，每一步放大的对象却是同一个：无界点号搜索。容器内的小样本验证见图 8-3，1.8.0 编译产物把 `x = { k0 = 1, k1 = 1 }` 正确解析为 `{"x":{"k0":1,"k1":1}}` 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/42414b502c11e43b.png)  
*图 8-3：路径 4 小样本验证——* `docker compose exec` *进入 vulnerable（1.8.0）容器解析一个两键内联表，结果为* `{"x":{"k0":1,"k1":1}}`

### 8.3 实测结果

|     |     |     |
| --- | --- | --- |  
| 内层键数 | 1.8.0 | 1.9.0 |
| 8,000 | 22.768 | 8.480 |
| 16,000 | 65.214 | 4.024 |
| 32,000 | 241.279 | 7.572 |
| 64,000 | **970.772** | 16.358 |

-   32,000 → 64,000 个内层键，1.8.0 的耗时增长 4.023 倍；64,000 键这一档，它比 1.9.0 慢 59.345 倍；
-   旧版解析 64,000 键期间，并发的 `GET /health` 等了 889.337 ms；新版 1.010 ms；
-   两版本都正确解析全部内层键。数据出自容器实验台内的单轮顺序实测，图 8-2 即完整输出。其中 16,000 档的 1.9.0（4.024 ms）反而快于 8,000 档（8.480 ms）：8,000 档是 1.9.0 服务本轮的第一次解析请求，此后的 4.024 → 7.572 → 16.358 ms 恢复了随规模的单调，属毫秒级预热波动；判定只取 32,000 → 64,000 倍率与 64,000 档差距，不受影响。

## 9\. 路径变体：点号稀疏分布同样平方

四条路径测完，回头才看清它们共享同一个隐含前提：触发输入不含点号，sink 的 `indexOf()` 返回 -1，搜索一路伸到文档末尾。这个前提站不住，返回 -1 并非必要条件。回到 `parseKey()` 的代价分析： `indexOf('.', ctx.p)` 的返回值只被用来回答一个问题——点号是否落在本行 `endPtr` 之内；真正付出的代价，是从当前键一路扫到下一个点号。决定代价的是下一个点号在哪一行、离得多远。文档里有没有点号，不决定任何事。

代价可以写成一行式子。设第 i 个键段到下一个点号（若无，则到文档结尾）的字节距离为 dᵢ，总扫描代价 T = Σᵢ dᵢ；换成行数计量只差行长这个常数因子，下文按行数讨论。点号在文档里是荒原上的灯：扫描从当前键出发走向下一盏，灯在哪里，路就到哪里为止。所谓全文无点号，不过是每一段都无灯可循、走到尽头的特例，即 dᵢ 取到最大值（剩余全文）；而灯摆在哪些行，完全可以自由构造（两个方向的构造见图 9-1）：

-   **变体 A（垫底点号）**：N−1 行普通键，末尾一行 `a.b = 1` ，全文只有 1 个点号。它垫在所有键的身后，前面每一行的扫描都一路跑到它跟前才停。这里有个反直觉的细节：末行自己解析得非常便宜，首段的点号就在本行 `endPtr` 之内，末段之后又紧贴文档结尾；贵的是它前面的每一行。
-   **变体 B（低密度撒点）**：每 D 行把一行换成点分键（ `k{i}.d = 1` ）。灯与灯的间隔是 D 行，每行的扫描止于下一个点号，被压到 D 行以内，平均约 D/2 行，总代价 T ≈ (D/N) × 路径 1。点号越稀（D 越大），越接近最大伤害；D 取多大，在构造者手里是连续可调的。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f2104158980f7acc.png)  
*图 9-1：点号分布决定扫描长度——上（变体 A）：全文唯一的一个点号被垫到末行* `a.b = 1` *，前面每行的 sink B 扫描都几乎纵贯全文、到点号跟前才停，箭头又长又几乎一样；下（变体 B）：每 D 行撒一个点分键，每行扫描止于下一个点号，箭头短而均匀。dᵢ 是第 i 行到下一个点号的距离，总代价 T = Σᵢ dᵢ；图 2-1 的"全文无点号"只是每行 dᵢ 都取最大值（扫到文末）的特例*

### 9.1 复现方法

在仓库根目录执行（详见 `repro/sparse-dots/README.md` ）：

```bash
docker compose -f repro/sparse-dots/compose.yaml up -d --wait
docker compose -f repro/sparse-dots/compose.yaml --profile tools run --rm -T poc | tee repro/sparse-dots/evidence.jsonl
docker compose -f repro/sparse-dots/compose.yaml logs --no-color > repro/sparse-dots/container-logs.txt
docker compose -f repro/sparse-dots/compose.yaml down --remove-orphans
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b53072742a8a66a6.png)  
*图 9-2：点号稀疏变体 PoC 实测输出（* `tee` *同步留档）与测后清理——变体 A（全文仅 1 个垫底点号）在 1.8.0 上按档增至 3,727.845 ms、1.9.0 同规模 85.605 ms，并发健康请求旧版等待 3,613.027 ms；* `verdict` *之后另有两行* `sparse_sample` *：变体 B（7 个点分键）旧版 514.147 ms、新版 75.394 ms。下节实测表格的数字即转录自本图*

实验沿用路径 1 的框架：同款固定摘要镜像与安全收紧，独立 compose 项目名，不绑宿主机端口。 `document()` 的改动只有几行，N−1 行 `kN = 1` 之后拼上末行 `a.b = 1` ；校验闸门相应增加一项 `dotted` ，由服务端核对 `result.a?.b === 1` 。PoC 对每个响应核对版本、字节数、键数、首键值与 `dotted` ，确认两版本都正确解析了这份含点分键的文档，性能差异全部来自扫描代价。四档规模判定之后，PoC 另对两服务各发一次变体 B 输入，128,000 行、每 16,000 行一个点分键、全文共 7 个，作为附加采样，不计入判定。

库内的调用链与路径 1 逐项相同：同一个主循环，同一个 `parseKey()` 裸键分支，同一个 sink B。点分键行只是让 `parseKey()` 的段循环多走一轮，不引入任何新函数或新分支。伤害与语法路径正交，由点号间距这个纯数值属性决定。

### 9.2 实测结果

变体 A 服务端 `parse()` 耗时（单位 ms，单次实测）：

|     |     |     |
| --- | --- | --- |  
| 行数  | 1.8.0 | 1.9.0 |
| 16,000 | 68.086 | 13.169 |
| 32,000 | 233.432 | 20.750 |
| 64,000 | 892.147 | 36.462 |
| 128,000 | **3,727.845** | 85.605 |

-   1.8.0 从 64,000 → 128,000 行，耗时增长 4.179 倍；同规模下比 1.9.0 慢 43.547 倍；
-   旧版解析 128,000 行（1,424,886 字节，全文仅 1 个点号）期间，并发的 `GET /health` 等待 3,613.027 ms；新版 0.823 ms；
-   与路径 1 同规模对照：3,727.845 ms 对 3,659.870 ms，相差约 1.9%，文档里有没有那一个点号，对伤害几乎没有影响。本组同样是容器实验台内的单轮顺序实测（图 9-2 即完整输出），与路径 1 数据的采集条件相当；PoC 判定 `success:true` ，退出码 0。

变体 B 的附加采样（128,000 行、7 个点分键、1,424,904 字节）：1.8.0 耗时 514.147 ms，1.9.0 为 75.394 ms。成本模型预测 T ≈ (D/N) × 3,660 ≈ 457 ms，其中 D/N = 16,000/128,000 = 1/8，即降到路径 1 的 12.5%；实测为路径 1 的 14.1%，量级吻合。预测只含扫描项，实测另含约 0.1 秒的线性解析基线。即便文档里已经撒下 7 个点号，1.8.0 仍比 1.9.0 慢近 7 倍。

### 9.3 推论

1.  触发面比无点号文档宽得多，其中还包括真实文档。判定条件是下一个点号离当前键多远，而不是文档里有没有点号。一份机器生成的十万行 TOML（CI 配置聚合、数据导出）只要点分键稀疏，就天然落在这条平方曲线上，不需要任何人恶意构造。病理性输入与正常输入之间没有语法界线，只有数值界线。
2.  基于点号的输入预检在同一路径内也失效。前文四条路径证明结构性预检挡不住其他语法路径，这里再往前推一步：预检就算精确到点号的个数与分布，一个垫底点号就能绕过，而下一个点号离当前键多远，没有任何廉价的静态判据。有效缓解仍然只有三个：大小上限、升级、执行位置。
3.  伤害可以按预算调节。T 正比于 N×D：垫底点号（D≈N）取到最大值，此时后文攻击成本部分按路径 1 拟合的外推（T ≈ 1.8×B² 秒）照常适用；撒点加密则按约 D/N 折减。防守侧唯一可靠的数量级抓手是输入大小上限，它同时压缩所有 D 取值下的伤害。

## 10\. 同步解析为什么会"打死"整个服务

四条语法路径与点号稀疏变体，并发健康检查各测过一轮，结果是一致的：无论输入从哪条语法路径进来、点号如何分布，1.8.0 解析大输入期间， `GET /health` 要等 0.9–4.3 秒（路径 1/2/3/4 与变体 A 最大档实测依次为 3,516.338 / 4,312.051 / 1,742.585 / 889.337 / 3,613.027 ms）；换到 1.9.0，同样的请求都在约 1 ms（0.663–1.010 ms）内返回。这组测量就是前文 PoC `main()` 的第 ③ 步：以最大档输入发起 `POST /parse` ，不等待它完成，150 毫秒后并发发 `GET /health` 。健康检查等了多久，事件循环就被占用了多久。

原因只有两条。 `parse()` 是纯同步的 CPU 密集函数，Node.js 的事件循环是单线程的。这两条合在一起，前面那些以秒计的等待就有了着落。一个进程里所有的回调，HTTP 请求处理、定时器、I/O 完成通知，都排在事件循环的队列里，由这唯一的主线程逐个取出执行。哪段代码不返回，队列就一轮也走不下去。 `server.mjs` 的回调进入 `parse(source)` 之后，控制权在函数返回之前不会回到事件循环。期间到达的健康检查、下一个请求、任何定时器与 I/O 事件，都只能在队列里等。两个版本的时间轴对照见图 10-1。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a0d7bbfb25baafb3.png)  
*图 10-1：事件循环被同步* `parse()` *阻塞的时间轴（时间向下流动，时刻与块长为示意、非严格比例）——上，1.8.0：单个合法* `POST /parse` *的请求体收完后，回调进入* `parse(source)` *，主线程被占据约 3.7 秒（实测 3,659.870 ms），期间到达的* `GET /health` *连同其他请求、定时器与 I/O 一律排队，直到解析返回才得到响应（实测等待 3,516.338 ms）；同步 CPU 工作不可中断，攻击者断开连接也不中止解析（此语义属机制推断，后文攻击成本部分再作说明）。下，1.9.0：同一输入约 0.08 秒（实测 84.893 ms）解析完毕，* `GET /health` *实测 0.663 ms 返回，事件循环几乎不停摆*

这幅时间轴还解释了另一件事：单个请求就足够。伤害不取决于请求的数量，取决于一次解析占住主线程的时长。攻击者不需要并发洪泛，一个携带合法 TOML 的 `POST /parse` ，就能让服务在解析期间对所有用户不可用。同步 CPU 工作没有可供取消的断点，攻击者断开连接，也无法中止已开始的解析（此为机制推断，后文有展开）。以可接受的节奏重复发送，可用性就持续受损。在 CVSS 的记分里，这对应 `A:L` （低可用性影响）与 `AV:N/AC:L/PR:N/UI:N` （网络可达、攻击复杂度低、无需权限与交互）的组合。前提始终是：应用真的会把不可信来源的 TOML 交给这个同步解析函数。

## 11\. 攻击场景应用：暴露面判定与攻击成本核算

复现做完了，机制与数字都留在前文。往下是两个问题，分属攻防两端：防守方要弄清什么样的部署真的会暴露，攻击方要算清得付出多少成本、能换回多少伤害。除暴露面判定引用的 npm 生态统计外，本章的量化数字均取自前文四条路径的实测；另有两处属于机制推断的工程语义，文中会单独标注。

### 11.1 暴露面判定：四个条件缺一不可

`smol-toml` 是库，不是服务。有没有暴露面，完全取决于宿主应用怎么用它。官方公告也把触发前提限定为"应用把攻击者可控的 TOML 交给同步的 `parse()` "。把这句话拆开，得到一条可逐项核对的判定链：

|     |     |     |
| --- | --- | --- |  
| #   | 条件  | 判定方法 |
| 1   | 依赖 `smol-toml ≤ 1.8.0` （含传递依赖） | `npm ls smol-toml` ；核对 lockfile 里实际解析到的版本 |
| 2   | TOML 来源不可信 | 枚举 `parse()` 的 **全部** 调用点，追问每个输入从哪来 |
| 3   | 解析跑在长期驻留服务（主线程）的请求路径上 | 代码走查：是 HTTP 回调/任务 worker 直接调用，还是本地构建工具读自己的配置 |
| 4   | 输入大小无上限或上限宽松 | 检查请求体限制（上限的量化效果见后文防护对照） |

四个条件是 AND 关系，任何一条不成立即出局，判定就此终止。整条判定链的走向见图 11-1。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c6c6da3f0b9d4353.png)  
*图 11-1：暴露面判定链（上方判定表的可视化）——四个条件自上而下 AND 串联：绿实线"是"进入下一关，红虚线"否"任一命中即出局，直接落到"非网络暴露面"的终结节点（出局情形已在节点内逐条列出）；四条全"是"才沿绿线走到"攻击场景成立"。右侧示例是常见的出局路径：构建工具/CLI 只解析随软件分发的本地自有配置，条件 2、3 不成立，网络向量不存在*

按 source 归纳，常见的暴露形态有四类，不指向任何具体产品：

-   在线配置/TOML 工具服务：上传 TOML 做校验、转换（TOML→JSON）、导入的 Web 服务。请求体本身就是 source，四个条件在这里最容易同时满足，是最典型的目标；
-   代码托管与自动化平台：PR 触发的机器人、扫描类服务解析仓库里的 TOML 文件，source 是 PR 作者可控的仓库内容。攻击者提一个 PR，就同时满足了无特权与网络可达，这正是 CVSS 里 `PR:N` （无需特权）与 `AV:N` （网络可达）组合的含义；
-   Web IDE / 语言服务后端：文件一打开即触发解析。本地编辑器里的 LSP 还需要用户交互配合，若按这种形态评分，CVSS 的 UI 维度将取 `R` 而非公告评定的 `UI:N` ；托管版 Web IDE 则恢复了纯网络向量；
-   数据管道/消息网关：把 TOML 作为一种可接受 payload 格式的 ETL、格式转换节点。

这个面在体量上并不小： `smol-toml` 在 npm 上有约 2,600 个 [依赖方](https://www.npmjs.com/package/smol-toml) （截至 2026 年 10 月），是 npm 生态下载量最大的 TOML 解析器之一。条件 1 的命中面广，真正稀缺的是条件 2+3 的组合。排查时，力气值得优先花在查明谁把不可信 TOML 送进了请求路径，而不是版本号本身。

### 11.2 攻击成本核算：每 MB 输入买到多少阻塞

四条路径在最大实测规模下的输入与阻塞效果汇总：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 路径  | 最大实测输入 | 字节数 | 1.8.0 解析耗时 | 期间并发 `GET /health` 等待 |
| 1 裸键 | 128,000 行 | 1,424,890 | 3,659.870 ms | 3,516.338 ms |
| 2 引号键 | 128,000 行 | 1,680,890 | 4,365.483 ms | 4,312.051 ms |
| 3 数组表头 | 128,000 个 | 768,000 | 1,912.590 ms | 1,742.585 ms |
| 4 内联表 | 64,000 内层键 | 756,897 | 970.772 ms | 889.337 ms |

（单位：字节 / 毫秒；五组数字均出自同一容器实验台内顺序执行的五轮无并行实测，每轮的完整终端输出即前文各截图， `evidence.jsonl` 为同轮 `tee` 留档。）

路径 3 的输入只有 768 KB，阻塞已近 2 秒。

把这张表挪到攻击者那一边，能读出三个推论：

1.  带宽成本可以忽略。1.4 MB 的上行换来 3.7 秒的全服务阻塞，受影响的是事件循环上所有用户的每一个请求，不是攻击者自己那一条连接。每 10 秒发一个请求，节奏远低于常见的限流阈值；照此重复发送，3.7 秒的阻塞对上 10 秒的间隔，服务长期有约三分之一的时间窗处于不可用。
2.  伤害随输入平方增长，输入上限每翻一倍，单个请求的伤害乘以 4。按路径 1 的实测拟合，1.8.0 的阻塞时长近似 `T ≈ 1.8 × B²` 秒，B 为输入的 MB 数：实测点 1.4 MB 阻塞 3.7 秒，公式值约 3.5 秒；往上 2 MB 约 7 秒，4 MiB（复现服务自身的 body 上限，路径 1/2/4；路径 3 为 2 MiB）约 32 秒，8 MB 约 2 分钟。这是单机 Docker 环境的数量级外推，换一台硬件数字会有出入，但平方关系本身由实测 3.97–4.17 的翻倍倍率支撑。
3.  四条路径互为备份。应用若在解析前做了某种结构性预检，比如只接受键值行、或只接受表头，另外几条语法路径仍然可达。其中路径 3 的语句最短，每个 `[[a]]` 仅 6 字节，同样的字节数能堆出最多的 `parseKey()` 调用，适合抠字节数的场景。点号稀疏变体进一步收紧这个结论：连精确到点号个数与分布的预检，也会被一个垫底点号绕过（前文变体部分的推论 2）。

还有两个工程语义会把伤害进一步放大。它们属于机制推断，未在本复现中实测：

-   断开连接救不了服务端。请求体一旦送达、解析开始，攻击者断开连接，或网关超时把连接切断，都不会中止这次解析：同步的 CPU 工作无法被中断，服务端照付全部 CPU。超时保护下来的，只有攻击者自己的响应。
-   健康检查级联。实测中，解析期间 `/health` 最长排队 4.3 秒，出自路径 2。负载均衡或编排器的健康检查超时若低于这个量级，实例就会在攻击窗口内被标记不健康、摘除，甚至重启，把单实例的慢放大成一场服务雪崩。

### 11.3 为什么常见防护拦不住它

|     |     |     |
| --- | --- | --- |  
| 防护手段 | 效果  | 原因  |
| WAF / 恶意特征检测 | 无效  | 触发输入是语法完全合法的 TOML，没有可匹配的"恶意载荷"（文末方法论第 1 条） |
| 按请求数限流 | 基本无效 | 单个请求即成阻塞（前文事件循环部分），低速率节奏足以维持伤害 |
| 网关/客户端超时 | 只保住攻击者的响应 | 解析开始后不因连接断开而取消（上文机制推断），服务端照付全部成本 |
| 认证  | 收窄但不消除 | `PR:N` 的含义正是"任何能提交内容的用户"；开放注册的平台形同虚设 |
| **请求体大小上限** | **有效（维护者建议的缓解）** | 直接压缩平方公式里的 B：按上文攻击成本的拟合，1 MB 上限下单请求阻塞约 1.8 秒，256 KB 约 0.12 秒。需结合业务实际需要的 TOML 规模从严设置（文末处置部分再谈） |
| 升级 1.9.0 / Worker 线程隔离 | 根治 / 隔离 | 前者是唯一根治手段；后者把解析挪出事件循环并可获得可中止性，文末处置部分展开 |

这个漏洞恰好落在三件最常用防护的盲区交集里：畸形输入检测、限流、超时。有效的控制点（大小上限、版本升级、执行位置）则全都在应用与依赖层。

### 11.4 自评估清单

使用 `smol-toml` 的团队，可以按下面四步自查：

1.  跑 `npm ls smol-toml` （含传递依赖），确认 lockfile 实际解析的版本是否 ≤ 1.8.0；
2.  枚举 `parse()` 的全部调用点，IDE 的查找引用或全局搜索即可覆盖，注意别漏掉封装层背后的间接调用；
3.  对每个调用点核对前文判定链的四个条件：输入从哪来、有没有大小上限、是否在驻留服务的主线程上；
4.  需要实证时，用前文的复现框架实测：把 PoC 的规模档位递增至接近自身 body 上限，判定阈值与退出码可直接复用；所有测试仅应在自己拥有或获得授权的目标上进行。

## 12\. 修复、防御与思考

到这里，暴露面有了判定，攻击成本有了数字，剩下的就是怎么修、怎么防。复现过程中攒下的四点方法论收获，也一并记在这里。

根治手段只有一个：升级 `smol-toml` 到 **1.9.0** 及以上，并核对 lockfile 里实际解析到的版本。修复提交 `99102aa` 用逐字符状态机替换了两处整篇文档 `indexOf('.')` ，正是前文 `parseKey()` 一节逐行拆解过的那两处。替换是否有效，五组实测给了背书：同规模输入下，1.8.0 比 1.9.0 慢 43.1×、41.1×、30.9×、59.3×、43.5×，依次对应路径 1、2、3、4 与点号稀疏变体，数字全部出自前文各路径的实测。变体对照还说明了一件事：1.9.0 的解析代价基本不再随点号的个数与分布起伏，"点号间距"这个伤害旋钮在修复版上失灵了。升级前有一处兼容性要查清：1.9.0 同时把解析结果对象改成了 null 原型，直接在解析结果上调用继承的 `hasOwnProperty` 这类写法会失效，需按 [发行说明](https://github.com/squirrelchat/smol-toml/releases/tag/v1.9.0) 自查。

无法立即升级的时候，维护者建议对送入解析器的 TOML 设置 **最大文档尺寸**，公告没有给出统一阈值，要结合业务实际需要的 TOML 规模从严设置。从严的参照，本复现里就有：路径 3 仅用 768 KB 就造成近 2 秒阻塞；即便上限收到 1 MB，按上文攻击成本的拟合，单个请求仍有约 1.8 秒的阻塞。对来自 HTTP 请求体的 TOML，还可以把解析挪出请求路径，交给队列或 Worker 线程。同步解析一旦开始就无法中止（此语义属机制推断，上文已标注）；挪出事件循环之后，单个解析不再能占死整个服务，对单次解析设超时也成为可能。防守方从发现依赖到完成处置的整条决策路径，见图 12-1。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8207f73e1da13579.png)  
*图 12-1：处置决策流程——防守方发现自己依赖 smol-toml 之后的行动路径：第 1 步核对 lockfile 实际版本；已 ≥ 1.9.0 的核对 null 原型兼容性后即无事；仍 ≤ 1.8.0 的优先走"升级 1.9.0+"的根治分支，暂不能升级的并行两条缓解——按业务实际需要的 TOML 规模从严设最大文档尺寸（量化依据见上文防护对照表：1 MB 上限仍约 1.8 秒、256 KB 约 0.12 秒）、把解析挪出请求路径（队列/Worker：隔离事件循环、可设超时中止）；根治与缓解最终汇入同一收尾：枚举* `parse()` *全部调用点、按自评估清单持续核验*

四点方法论，一条一条记在下面。

1.  合法输入也能成为武器。四条路径和点号稀疏变体的输入，全部是语法正确的 TOML；任何基于畸形输入检测的防护，WAF 规则也好，语法预检白名单也好，对它们都无感。上文防护对照表把 WAF 判为无效，根子就在这里。点号稀疏变体的推论更进一层：病态与正常的界线不在语法，而在数值（前文变体部分的推论 1）。
2.  正确性测试发现不了复杂度缺陷。 `parseKey()` 的输出永远正确，单元测试全绿；只有把扫描范围和语句边界对照着读（前文 `parseKey()` 的代价分析），才能看出 `dot > endPtr ? endPtr : dot` 这个先扫后夹的顺序问题。要发现这类缺陷，得换方法。一是按调用形态做模式定位：拿"在整篇文档字符串 `ctx.s` 上调用 `indexOf('.')` 而不设上界"这样的特征去扫，能把 `struct.ts` 里的两个 sink（第 66 行与第 97 行）钉出来。二是做 source 到 sink 的数据流追踪：从 `parse(toml)` 的参数一路追到点号搜索的接收者 `ctx.s` ，确认输入确实流进这两处扫描。前者回答缺陷在哪，后者回答攻击者的输入到得了吗。
3.  一个函数缺陷，多条语法入口。裸键、引号键、表头（结束符换成 `]` ）、内联表内层键，四个互不相同的语法形态，都在 `parseKey()` 汇聚。评估此类漏洞的暴露面，要枚举所有能到达缺陷函数的语法路径，而不是只看公告里的那一种输入。点号稀疏变体补上另一半：同一条语法路径之内，还要枚举触发条件的参数空间，无点号只是点号间距这个连续参数的极端取值。
4.  复现要自证输入被正确解析。本复现的 PoC 每一步都核对版本、字节数、键数与首尾键值，靠 `checkedParse()` 这道校验闸门，排除旧版报错快、新版正常慢之类的假差异。性能对比只有建立在两边都做对了的前提上，才有意义。

回到标题里的那个点号。它从头到尾都不是武器；武器是那次没有上界的搜索。当 1.9.0 把扫描限定回本行之内，同样的字节流，就只是一份普通的配置文件了。复现目录与全部参考链接，见下方附录。

## 附：仓库导航与参考链接

|     |     |
| --- | --- | 
| 内容  | 位置  |
| 漏洞资料汇总 | `GHSA-r4xh-jqrq-34v2.md` |
| 复现总说明（四条路径与变体入口） | `repro/README.md` |
| 路径 1–4 复现目录 | `repro/bare-keys/` 、 `repro/quoted-keys/` 、 `repro/array-headers/` 、 `repro/inline-table/` |
| 路径变体（点号稀疏分布）复现 | `repro/sparse-dots/` |
| 分析所用 smol-toml v1.8.0 源码 | [上游仓库 v1.8.0 标签](https://github.com/squirrelchat/smol-toml/tree/v1.8.0) |
| 全文配图（图 1-1 ～ 图 12-1） | PNG 在 `assets/` |
| 全部终端实拍截图（图 5-2 ～ 图 9-2） | `assets/term-*.png` ，均为容器实验台内真实执行的终端截屏，与正文命令一一对应 |

**参考链接：** [维护者安全公告](https://github.com/squirrelchat/smol-toml/security/advisories/GHSA-r4xh-jqrq-34v2) · [GitHub 审核公告](https://github.com/advisories/GHSA-r4xh-jqrq-34v2) · [修复提交 99102aa](https://github.com/squirrelchat/smol-toml/commit/99102aa57fc932f760ea9c15b4cf1c181f952d24) · [v1.9.0 发行说明](https://github.com/squirrelchat/smol-toml/releases/tag/v1.9.0) · [OSV 记录](https://osv.dev/vulnerability/GHSA-r4xh-jqrq-34v2)
