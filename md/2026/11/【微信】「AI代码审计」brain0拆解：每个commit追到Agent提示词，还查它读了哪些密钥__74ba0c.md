---
title: 【微信】「AI代码审计」brain0拆解：每个commit追到Agent提示词，还查它读了哪些密钥
source: https://mp.weixin.qq.com/s/HVopqL4nHmhVEMc7NnbzGA
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T13:44:53+08:00
trace_id: 858c937e-6299-4cc3-9772-9c23d46705dd
content_hash: 9f09951d424e20f51c35cc3c959fecace446b74565da314824632a570e508c0b
status: synced
tags:
  - 微信
  - AI代码审计
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: brain0 是一个被动记录 AI Agent 代码行为的审计工具：追踪声明与实际的漂移、Agent 读过的敏感文件，但它自身曾有漏洞且只能做事后侦探而非拦截。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40e75244-d011-8176-9ec1-cc3576bd1423
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> brain0 是一个被动记录 AI Agent 代码行为的审计工具：追踪声明与实际的漂移、Agent 读过的敏感文件，但它自身曾有漏洞且只能做事后侦探而非拦截。
> 
> - **三大记录维度：** 对齐 Agent「声明改动」与 git「实际改动」并给漂移打分（示例中 Agent 声称小改、实际动了十几文件得满分漂移 1.00）；从会话记录抽取读取集合，扫描 `.env`、`cat`、`grep` 等命中密钥的情况（只存路径和种类，不存值），甚至能发现 8 次仓库外读取进入了模型上下文；每个产物有先验+后验风险分，重点标记「当时安全、后来危险」的 gold signal。
> 
> - **被动设计是双刃剑：** 不装 hook、不改代码，只读 git 和 Agent 会话记录（自动发现 `~/.codex`、`~/.claude/projects`），好处是零侵入；代价是看不见 MCP 工具、环境变量、`ssh`/`docker exec`、脚本内部的读取——读取集合只是下界，且 `remote` 标记是假设而非观测（本地模型走代理也会被标为出网）。
> 
> - **可出签名的审计证据：** `attest` 用 Ed25519 签 in-toto Statement；官方 compliance 示例显示 8 个 commit 中 6 个 AI 参与、0 个经人 review、453 次未声明漂移。但签的是字面 statement 字符串，与标准 DSSE/base64 生态尚未对齐。
> 
> - **自身两个已公开漏洞揭示风险结构：** GHSA-8vg9-5mf9-5c84（CVSS 6.5）`/api/diff` 路径遍历 + 所有 API 路由 CORS 全开，任意网页可读本地图数据；GHSA-xx23-cw3c-xh5w（CVSS 5.9）`.brain0/` 目录含密钥和 Ed25519 签名种子，被 `git add -A` 提交即同时破坏加密与签名保证。核心结论：这类工具记录的数据比代码本身更敏感，爆炸半径大一个量级。
> 
> - **定位边界：** guard 是侦探不是门卫，真正的拦截原语是 `preflight --staged`（事前、无需索引）；仅适配 Claude Code/Codex；默认 payload 不加密、摘要缓存和嵌入均为明文/可逆；多租户、RLS、TLS 在另一个 AGPLv3 企业仓库。项目仅 316 星、四个版本，仍处早期——作者建议先跑一周看漂移和敏感读取数字，再决定是否接入 CI。

**句芒安全实验室** *2026年11月4日 12:26*

你让 Claude Code 改了一个函数。它动了三行，提交信息写「fix parser edge case」。

三天后线上出问题，你 `git blame` 到那三行，看到的名字是你自己。因为 commit 是你按的。

git 记的是谁提交、改了哪几行。它不记这段代码是哪个 Agent、哪个模型、哪一句提示词写出来的，也不记这个 Agent 在动手之前读过哪些文件。

brain0 想补的就是这一层。它的自我介绍只有一句话：git 告诉你改了什么，brain0 告诉你为什么。

截至 2026 年 11 月 4 日，这个仓库 316 星、11 个 fork、1 个未关 issue，Apache-2.0，Rust 写核心、TypeScript 写界面，npm 上最新版本 0.1.3。

这篇只讲这一个工具：它记了什么、怎么记、哪些地方它其实看不见，以及它自己身上那两个已经公开的洞。

## 它记的三样东西，前两样别人没有

brain0 的定位是「AI 写的代码的黑匣子」。它被动地给仓库建一张决策图，每个 commit 挂上背后的 Agent 意图，细到单个函数。

它自己列了三个别人做不到的答案。

**第一样，声明与实际的差。**

Agent 会告诉你它改了什么，git 会记录它实际改了什么。这两件事经常对不上。

brain0 把两边对齐，给差距打分。官方 README 里贴的是它自己的报告：

```
drift — declared vs done (41)
  · [1.00] claude-code — changed but not declared: crates/brain0-cli/src/main.rs,
           packages/gui/src/main.ts … +12 more
```

1.00 是满分漂移：Agent 说自己只动了一点，实际改了十几个文件，一个都没在声明里出现。这个数字比任何「AI 很可靠」的说法都直接。

**第二样，Agent 读过什么。**

这一条是它和普通代码审计工具真正的分界线。

Agent 读文件这件事，通常没人记录。你只知道它改了 `config.py` ，不知道它在改之前把 `.env` 读进了上下文，而那段上下文已经发给了远端模型。

brain0 从 Agent 的会话记录里抽出读取集合：显式 `Read` 调用、 `Grep` 返回的内容、shell 里的 `cat .env` 、 `sed -n` 、 `head` 、 `tail` 、 `awk` 、 `jq` ，以及子 Agent 的记录。返回的内容会被扫一遍，命中密钥就在图里标出来。

它只存路径和密钥的 **种类**，不存值。报告长这样：

```
sensitive reads — DLP (7)
  · claude-code read crates/brain0-agentsrc/src/driver.rs [env_secret]
  · 8 read(s) outside the repo reached the model's context
```

第二行值得停一下：8 次读取发生在仓库之外。也就是说，Agent 的上下文里进了仓库以外的文件，而那些内容已经出了这台机器。

![官方 demo 录屏的第一屏：仓库被展开成一张可点的图，节点按风险从绿到红上色，左侧是图例和操作说明](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4ca85afac66c775d.png "官方 demo 录屏的第一屏：仓库被展开成一张可点的图，节点按风险从绿到红上色，左侧是图例和操作说明")

**第三样，会学习的风险分。**

每个产物有两个分：一个先验分，看影响面、改动频率、漂移、diff 大小；一个后验分，看后续证据，比如这个改动是不是马上被 revert、是不是马上被补修。

两个分合起来渲染成绿到红。它特别盯一种情况：当时看着安全、后来证明危险的改动，官方叫 gold signal。这类样本才是真正值得复盘的东西。

## 被动，是它最硬的设计，也是它最大的限制

brain0 不装 hook，不改你的代码，不要求 Agent 配合，不碰 git 历史。它只做两件事：读 git，读 Agent 自己写到磁盘上的会话记录。

Codex 的 `~/.codex` 、Claude Code 的 `~/.claude/projects` ，它自动发现。索引落在 `.brain0/` 目录里，这个目录会自己写一条 `.gitignore` 把自己忽略掉。

这个设计的好处很实际：你不用说服团队里每个人去装插件，也不用担心某个 Agent 版本升级把钩子弄丢。装上就能用，卸掉就没有。

代价同样实际：它只能看见会话记录里有的东西。

官方文档把这条写得很清楚。它看不见的包括：通过 MCP 工具读的文件、 `WebFetch` 抓的网页、环境变量（ `printenv` 、 `echo $KEY` ）、shell 解析器不认识的读取命令、脚本内部（ `python x.py` ）、以及 `ssh` 和 `docker exec` 后面的东西。

一句话：读取集合是 **下界**，不是证明。它证明「这些内容进了上下文」，不证明「只有这些」。

还有一个更容易被忽略的点： `remote` 这个标记是假设出来的。brain0 看不见模型端点，所以每个会话都按「发给了远端模型」处理。你在本地跑 Ollama，只要经过一层代理，它照样会标成出网。

## 图是怎么建的

四级结构：仓库 → 模块 → 文件 → 符号。点进去看的是同一个对象的下一层，不是换了一张图。

符号的身份靠 Tree-sitter 抽出来的 AST 指纹，不是行号。文件改名、函数搬家，节点还是同一个节点，只是多一条带日期的版本记录。这一条决定了它的历史能不能长期用：按行号做身份的工具，一次格式化就全乱了。

存储是两层的：轻索引放导航和嵌入，重载荷放 diff、提交信息和摘要，点开才加载。索引小到可以放好几年，载荷按需水化。

数据是 append-only 加内容寻址的， `brain0 verify` 可以重新校验。本地版是 SQLite 加 sqlite-vec；Postgres 加 pgvector 那套在另一个企业仓库里。

## 上手只有一条命令

```
npx brain0 up
```

在一个仓库里跑，它会从 git remote 推断仓库 id，索引 git 历史（事实），被动吃进 Agent 会话（意图），然后在 `http://localhost:8787` 打开界面。

硬性要求只有 Node.js ≥ 20。Linux 上还要 glibc ≥ 2.28，也就是 Debian 10+、Ubuntu 20.04+、RHEL 8+，Alpine 的 musl 现在不支持。

离线是默认状态。没有模型也能跑完：确定性摘要加本地 feature-hash 嵌入，零出网。想让它更聪明，装 Ollama 拉两个模型：

```
ollama pull qwen3:4b
ollama pull qwen3-embedding:0.6b
```

摘要会按内容缓存到 `~/.cache/brain0/` ，之后重建索引不再花模型调用。中断了也不丢已算的部分。

日常三条命令：

```
brain0 today            # 最近 24 小时，风险高的排前面
brain0 report           # 漂移、敏感读取、高风险、Agent 足迹
brain0 query "why did the parser break"
```

再加一条 MCP，让 Agent 在动代码之前先问一遍：

```
claude mcp add brain0 -- brain0 mcp
```

它给 Agent 四个工具： `brain0_context` 查一个文件或符号的风险、历史和背后的意图； `brain0_blame` 把 `file:line` 解析到符号，回答「这一行是哪个意图写的」； `brain0_debug` 给根因候选； `brain0_audit` 给整个仓库的风险分布和 gold signal。

![点开一个 commit：124 个改动文件，每行带增删行数，这是「声明与实际」对账的原料](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57d72d2aabf0acfe.png "点开一个 commit：124 个改动文件，每行带增删行数，这是「声明与实际」对账的原料")

## DLP 有三档，别把事后当拦截

这一块最容易被误读，官方自己分得很清楚。

`brain0 guard` 是事后审计，跑在索引上。 `brain0 guard --watch` 是准实时，每 5 秒轮询一次索引，新违规推一次，按 `(task, path, rule, model)` 去重。 `brain0 preflight` 是事前，不需要索引，直接读文件扫内容，命中就非零退出。

规则只有三条： `secret-in-read` 是 critical，文件内容里有密钥而且进了远端模型； `sensitive-path` 是 warn，路径命中 `.env` 、 `*.pem` 、 `*.key` 、 `credentials` 、`.aws/` 、`.ssh/` 这类敏感 glob； `external-read` 是 warn，读了仓库之外的绝对路径。

接 CI 是三道闸：

```
brain0 preflight --staged     # 拦住密钥进 commit，不需要索引
brain0 guard --strict        # 索引里已经有密钥进过模型就失败
brain0 compliance --strict   # 整段历史的发布门
```

接 git hook 也简单，`.git/hooks/pre-commit` 里一行 `exec brain0 preflight --staged` 就行。

但必须说清楚：guard 是 **侦探**，不是 **门卫**。它观察的是 Agent 已经发生的出网，不是坐在数据通路里拦。真正的拦截原语是 preflight，而且 preflight 只在你给它的文件或暂存区上生效。

官方也承认这一点：真正的 inline LLM 代理是另一件更大的事，现在没有。

## 出证据这一段，是它最像企业工具的地方

`brain0 provenance <sha>` 给一个 commit 的完整记录：谁提交、哪个 Agent、哪个模型、改了哪些文件、读了什么、读的东西里有没有密钥、有没有人 review。

`brain0 attribution <sha>` 细到文件和 hunk。 `brain0 attest` 把这份记录包成 in-toto Statement，用 Ed25519 签名字节串，输出里有 keyid、publicKey、signature 三段。 `brain0 verify-attestation` 用内嵌公钥验内部一致性，加 `--pubkey` 才是对一个 **你信任的** 公钥验。

review 状态来自 commit message 的 trailer： `Reviewed-by:` 和 `Acked-by:`，大小写不敏感，解析出来绑进签名里，也算进 `compliance` 。

`brain0 compliance` 是给审计看的汇总包，官方文档的示例输出是这样：

```yaml
commits indexed:          8
AI-assisted commits:      6
└─ unreviewed (no human): 6
models seen:              claude-opus-4-8
commits w/ secret reads:  0  (total 0 secret-file read(s))
undeclared drift events:  453
```

8 个 commit 里 6 个是 AI 参与，6 个没有人 review，453 次未声明的漂移。这组数字本身就是一份审计发现。

这里有个细节值得注意：attestation 的签名是「对字面 statement 字符串签名」，验证方重新校验的是那些字节。官方说严格的 DSSE/base64 信封是后续改进。也就是说，现在这套能自洽验证，但和标准供应链 attestation 生态还不是同一个东西。

![点开一个文件节点：右侧直接写「CHANGED BY INTENT」，标明是 claude-code（agent）在哪个时间改的，下面是两版历史](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9557f1e2ddf68d06.png "点开一个文件节点：右侧直接写「CHANGED BY INTENT」，标明是 claude-code（agent）在哪个时间改的，下面是两版历史")

## 它自己身上有两个洞，都公开了

这一段是这篇文章真正想讲的部分。

一个专门记录「Agent 读了哪些密钥」的工具，自己在 10 月底公开了两个 GHSA。两个都是 medium，都在 0.1.3 之前。

**第一个，GHSA-8vg9-5mf9-5c84，CVSS 6.5。**

0.1.2 及更早，本地服务的 `/api/diff` 把 `ref` 查询参数直接拼到 payload 目录上，没有校验。构造一个 `aa/../../secret` 这样的 ref，就能读到你账号能读的任意 `.blob` 文件。

更麻烦的是同一版本里，所有 API 路由都回 `Access-Control-Allow-Origin: *` ，而且接受任意 `Host` 。这意味着你开着 `brain0 up` 的时候，浏览器里任何一个网页都能向 `127.0.0.1` 发请求，读你的图、节点详情、diff，还能触发 smart chat 查询——配了远端模型的话，那是要花钱的。

0.1.3 的修法很干脆：payload ref 只接受 64 位小写十六进制 BLAKE3 摘要，TypeScript 读取层和 Rust 存储层都改，ref 再也没法指到 payload 目录外面。CORS、Host 校验、 `Sec-Fetch-Site` 、 `Origin` 一起补上，带副作用的两个路由还要自定义头（ `x-brain0-ask` 、 `x-brain0-refresh` ），跨站页面发不出来。

**第二个，GHSA-xx23-cw3c-xh5w，CVSS 5.9。**

0.1.1 及更早，brain0 把本地状态写在当前目录的 `.brain0/` 里，也就是被观察仓库的工作树，而且不加忽略规则。这个目录里有四样东西：索引 `index.db` （决策图，含提示词摘要和 Agent 读过的文件）、payload 存储（diff 和会话片段）、 `keyring.key` （payload 的密钥加密密钥）、 `attest.key` （签 attestation 的 Ed25519 种子）。

Agent 天天跑的 `git add -A` 会把它们全部暂存。一旦推上去，有仓库读权限的人就能用提交进去的 KEK 解开 payload，用提交进去的私钥伪造 brain0 的 attestation。

两个核心保证同时破掉：加密和签名。

0.1.2 起它把密钥移出仓库、让 `.brain0/` 自己忽略自己、发现 git 还在跟踪就警告。但官方写得很坦白：这只保护以后，不保护已经提交进去的。

如果你在 0.1.1 或更早用过，官方给的处置是四步： `git rm -r --cached .brain0` 并提交；推过或共享过就把那些 commit 里的索引、payload、密钥全部当成已泄露；删掉 `attest.key` 重新生成并公布新公钥，停止信任旧签名；payload 的 KEK 泄露了就删掉 `.brain0/` 和密钥目录重建。

这件事的意义不在「一个工具翻车了」。它说明这类工具的风险结构： **它要记录的东西，比你的代码更敏感。**

一个代码审计工具被拖库，丢的是代码。一个 Agent 行为审计工具被拖库，丢的是提示词、读了哪些文件、哪些文件里有密钥、以及能伪造审计结论的私钥。后者的爆炸半径大一个量级。

所以部署这类工具时，第一条不是「它能查什么」，而是「它的库放哪、密钥放哪、谁能读」。

## 六个边界，部署前必须知道

**一、读取集合是单源的，而且只是下界。** 它来自 harness 写的 JSONL，同一家厂商的进程写、没有第三方联签、用户可以改。brain0 用 BLAKE3 把每次 ingest 的字节范围钉住， `verify` 能发现 ingest 之后被改写的记录；ingest 之前就被改的，发现不了。官方把这条写在「honest limitations」里。

**二、 `remote` 是假设，不是观测。** 本地模型走代理也会被标成出网。反过来，真正发到远端的路径它看不见。

**三、 `npx brain0 up` 默认 payload 不加密。** 因为 TypeScript 那层 GUI 要读明文。想加密要 `up --encrypt` ，或者走 Rust 查询路径。这一点官方文档写得很直白，很多人会漏。

**四、摘要缓存是明文的。** `~/.cache/brain0/summary-cache.db` 在可加密的 payload 存储之外，存的是每轮摘要。摘要是在已经脱敏的文本上算的，但位置本身是个风险点。介意就 `BRAIN0_SUMMARY_CACHE=off` 或指到别处。

**五、嵌入是可逆的。** 官方把 embedding 和 payload 放在同一保护级别，理由就是它可逆。这一点很多做 RAG 的团队会忽略。

**六、Postgres、TLS、行级安全都在企业仓。** 开源仓只有一个 `require_tls` 策略助手。多租户、RLS、append-only 触发器、服务端最小权限角色，全在另一个 AGPLv3 加商业许可的仓库里。开源版是单用户本地版，不是团队版。

再补一条：仓库现在只有 1 个未关 issue（#6，加更便宜的推理 provider），说明它还在很早期。0.1.0 是 2026 年 7 月 2 日建的，四个版本走到 0.1.3。

## 适合谁，不适合谁

适合三类。

一类是团队里 Claude Code 和 Codex 写掉大部分 diff、又需要回答「这个改动是谁写的、它读什么」的。 `brain0 report` 一天看一次，比翻会话记录快。

一类是要过审计或合规的。AI 辅助声明、 `Reviewed-by` 覆盖率、有没有密钥进过模型，这三样它都能出成结构化记录， `attest` 还能签名。

一类是只想在 CI 里加一道密钥闸的。 `preflight --staged` 不需要索引，接在 pre-commit 上就行，成本最低。

不适合三类。

一类是想要 inline 拦截的。它是侦探，不是门卫； `preflight` 只覆盖你递给它的文件，不覆盖 Agent 运行时的任意读取。

一类是 Agent 不是 Claude Code 或 Codex 的。没有 adapter 就没有意图层，只剩 git 图。

一类是想要团队多租户的。那套在另一个仓库，开源版没有。

## 最后一句

brain0 值得看的地方，不是它画了一张好看的图。是它把「AI 写的代码」拆成两个可以分别验证的东西：写了什么（git 独立见证），说它写了什么（transcript 单源见证）。前者能对账，后者只能当下界。

这个区分很关键。很多团队把「Agent 说它只改了一点」当成事实，把「会话记录里有这些读取」当成全部。brain0 至少把这两件事分开标了。

但从句芒的角度看，还有三个问题它没有回答：会话记录本身可信吗， `remote` 这个标记什么时候能被真正观测，attestation 的私钥最后放在谁手里。

这三个问题不解决，它给的是「可审计的记录」，不是「可采信的证据」。这两者之间的距离，就是这类工具接下来要补的部分。

如果你正在用 Claude Code 或 Codex 写生产代码，先跑一周 `brain0 up` 和 `brain0 report` ，看两件事：漂移有多少，敏感读取有几条。看完这两个数字，再决定要不要把 `preflight` 接进 CI。

作者提示: 内容由AI生成
