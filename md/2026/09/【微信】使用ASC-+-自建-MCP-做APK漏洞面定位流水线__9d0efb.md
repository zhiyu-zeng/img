---
title: 【微信】使用ASC + 自建 MCP 做APK漏洞面定位流水线
source: https://mp.weixin.qq.com/s/rGr1WhpTcPK2WoFngUcVHw
source_host: mp.weixin.qq.com
clip_date: 2026-09-15T12:30:26+08:00
trace_id: a406e086-4556-44fd-a0c0-3a5c9ad31f2c
content_hash: 286ef250a9fbbdefc7da62627a6b3f15e65adb6dd2134a0a9d0d397cd568d4ce
status: synced
tags:
  - 微信
  - Android逆向
  - AI辅助逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 把 300MB 混淆 APK 当只读数据库按危险面反查引用点，用 ASC 毫秒级定位 + 自建 MCP 交给 Agent 批量扫面，人只做判断和串链。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3dc75244-d011-81be-a598-edac6e33c92d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 把 300MB 混淆 APK 当只读数据库按危险面反查引用点，用 ASC 毫秒级定位 + 自建 MCP 交给 Agent 批量扫面，人只做判断和串链。
> 
> - **核心转向：** 赏金审计成本在「筛选」而非「阅读」，先想清项目收哪类问题，再从表 A 右往左倒推要查的引用点，避免产出没人付钱的发现。
> - **性能实测：** ASC 无预处理、无磁盘缓存，WPS 352MB 包全局搜索 1.79s vs jadx 8m2s（269x），CLI 内存 141MB vs 13.2GB；单次查询低到「比打开搜索框还便宜」。
> - **常用命令：** `findrefs app.apk string|type|method|field <值>` 定位引用，`getclass` 拉单类源码；参数均为模糊子串匹配，`--threads` 默认 8。
> - **关键坑：** 类名过滤 `--class/--fuzzy-class` 实测 0 命中需自行验证；方法查询不收敛会洪泛；单条 0 命中不等于不存在，须换维度交叉验证；先剪掉热修、广告 SDK 与壳噪声（查 `changeQuickRedirect` 判断是否挂热修）。
> - **MCP 与边界：** 官方暂无 MCP，需自建约 130 行的 stdio server（只回结论、max_hits 硬约束、stdout 仅走 JSON）；「跳过完整解压」是未合入主线的实验特性，勿依赖。提示词中必须禁止 Agent 下「存在漏洞」结论，判断权留给人。

**赛博57库** *2026年9月15日 05:00*

MOBILE BUG BOUNTY · APK AUDIT PIPELINE

## APK 赏金：ASC + 自建 MCP 的漏洞面定位流水线

毫秒级定位危险 API 调用点，把「先反编译全包」倒转成「按危险面反查引用点」——附实测命令、输出与合规红线（成稿 2026-09-14）

📌 本文怎么读

本文先看两条流水线的时间损耗展示，方便读者建立「查询式审计」的直觉；再照表 A 把危险面换成可直接复制的查询命令，用本文实测的公开练习包走一遍「命中 → 收敛 → 精读」；随后自建一层 MCP 让 Agent 批量扫面，最后照 SOP 与红线收尾。第 08 节明确写了 ASC 现在做不到什么，动手前务必先读。

⚠ 边界与合规

①「跳过完整解压」是作者自述的实验特性、未合入主线，不要当成成熟能力依赖；②官方目前没有 MCP，第 06 节的 server 是自建的，文中已显式标注；③所有测试只在授权的目标上进行（赏金项目以项目范围为准）。本文不提供任何未授权目标的漏洞细节或利用代码。

移动App赏金真正的瓶颈不是「看不看得懂代码」，而是时间和效率的最大化。本文给一条可复现的流水线：先用 ASC 把 300MB 混淆包当只读数据库来查询，再自建一层 MCP 把它的两个原语交给 Agent 批量跑面，人只负责验证与串链。全文命令与数据均来自GitHub项目文档里的实测引用，争议处已显式标注。

## 01 · 先算一笔账：赏金审计的时间烧在哪

一个 300MB 级别的商业 APK，用传统姿势（jadx 全量反编译 → 建全局索引 → 人眼加 grep）意味着什么？作者拿四个真实商业包做过对比，352MB 那个包的全局字符串交叉引用直接把 jadx 跑到 OOM；同一张图上 jadx GUI 的内存峰值标注是 **223GB+**。

这就是赏金猎人的现实约束：你在一个「可能没有漏洞」的目标上，先付掉 8 分钟索引、13GB 内存和一次 OOM 崩溃，才有资格开始看代码。而移动赏金的命中率又天然偏低——大多数包里没有能提交的问题，真正值钱的是那几个类。换句话说， **赏金审计的核心成本是「筛选」，不是「阅读」**。

所以工具选型的第一性问题应该是：能不能不做全量反编译，直接回答「危险 API 在哪里被调用」。ASC 就是冲着这个问题来的。

## 02 · 赏金视角：APK 里到底在找什么

移动端可提交的问题，绝大多数落在有限几类「危险面」上。把危险面翻译成 **可查询的引用点**，是整条流水线最关键的一步——因为反编译器只能告诉你「谁引用了什么」，判断价值仍然是人。

表 A：危险面 → 查询 → 可提交漏洞类型（ `findrefs` 查询维度为 string/type/method/field 四种）

|     |     |     |
| --- | --- | --- |
| 危险面 | 典型查询目标 | 常见可提交问题 |
| WebView 桥 | `addJavascriptInterface`<br><br>/ `javascript:` | JS 桥反射调用可达 RCE（低版本）、任意方法暴露 |
| WebView 配置 | `setAllowFileAccessFromFileURLs` | `file://`<br><br>跨源读取、本地文件窃取、任意页面加载 |
| 动态加载 | `Ldalvik/system/DexClassLoader;` | 加载可写目录代码 → 提权/RCE 链 |
| 导出组件 | manifest 中 `exported=true` 的 Activity/Service/Receiver/Provider | 越权调用、敏感功能暴露、Provider 数据越权 |
| 意图重定向 | Intent 透传 / `startActivity` 携带外部参数 | Trampoline 绕过权限、跳进非导出组件 |
| 明文凭据 | `field apiKey`<br><br>/ `secret` / 字符串 `Bearer` | 硬编码密钥、内网 endpoint 泄露 |
| 命令执行 | `Runtime.exec`<br><br>/ `ProcessBuilder` | 拼接可控入参 → 命令注入 |
| 传输校验 | `TrustManager`<br><br>/ `checkServerTrusted` | 证书校验空实现 → MITM |

用法要点：这张表要 **从右往左用**。先想清楚自己的赏金项目里哪类问题最可能被接受（有些项目不收 MITM、不收自测的低危），再倒推该查哪些引用点，最后才决定跑什么命令。反过来从工具能力出发，会得到一堆没人付钱的发现。

## 03 · 为什么快：把 R8 的优化反过来当反编译原语

ASC 全名是「Droid ASC: R8 Compiler Optimization as a DeCompiler Primitive」，Black Hat Europe Arsenal 议题（Apache-2.0，依赖只有 `androguard==4.1.3` ）。它不封装 jadx，而是重新设计了三个环节：

01 **不建重型映射表，用 O(1) 指令定位原语**：把原始字节码 offset 常数时间映射回方法，跳过全量索引构建。

02 **按需在内存重建最小 DEX**：命中目标类后，只抽它的字节码与依赖，在内存里现场拼出一个自洽的小 DEX，再交给反编译；不落磁盘、无缓存目录。

03 **武器化 R8 的编译行为**：确定性常量重定位加指令去重，让相关代码在物理布局上高度聚集，这让跨 DEX 的引用搜索变成顺序扫描而不是随机寻址。

04 **无状态零预处理**：每次调用都是独立查询，没有「先建库」这一步——这一点对 Agent 化尤其重要，后面细说。

实测数据（作者基准图，ASC vs jadx，10 线程）：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| 目标 APK | 全局 search | 单类反编译 | CLI 内存 | 磁盘缓存 |
| TelegramX 59MB | 493ms vs 20s（41x） | 168ms vs 6s（36x） | 36MB vs 1.0GB（28x） | 0 / 119MB |
| WhatsApp 130MB | 620ms vs 32s（52x） | 160ms vs 15s（94x） | 36MB vs 2.1GB（61x） | 0 / 30MB |
| Grab 228MB | 1.011s vs 2m14s（133x） | 177ms vs 37s（206x） | 58MB vs 7.1GB（125x） | 0 / 127MB |
| WPS 352MB | 1.79s vs 8m2s（269x） | 415ms vs 1m32s（222x） | 141MB vs 13.2GB（96x） | 0 / 322MB |

（左列为 ASC，右列为 jadx；括号内为倍数）

![img3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3f8fd39942097c92.jpg)

![img1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8d1367ec012ce76a.jpg)

对赏金工作的实际意义有三个：第一，查询一次的代价低于「打开 IDE 搜索框」的心理成本，于是你会愿意多试几组假设；第二，零磁盘缓存意味着你可以在同一台机器上并行审计多个目标而不炸硬盘；第三，也是最重要的—— **毫秒级、无状态的单次调用，正好是 Agent 需要的那种工具接口**。

## 04 · 装上，先跑通几条命令

环境只有一个依赖，装完即可用：

`git clone https://github.com/MG1937/ASC.git`

`cd ASC`

`pip install androguard==4.1.3`

`python main.py --help`

`python main.py app.apk --gui`

四条查询命令覆盖绝大多数场景（ `--threads` 控制并行度）：

\# 定位单个类并反编译（支持 Lcom/poc/Main; 或点号写法）

`python main.py getclass app.apk com.poc.Main --threads 16 -o Main.java`

\# 字符串引用（查 deeplink scheme、密钥前缀、内网域名）

`python main.py findrefs app.apk string "javascript:" -o refs.txt`

\# 类型引用（查谁用了 WebView / DexClassLoader）

`python main.py findrefs app.apk type Lcom/poc/Target;`

\# 方法引用（查谁调了敏感 API；配合类名收敛命中面）

`python main.py findrefs app.apk method onCreate --class com.poc.Main`

`python main.py findrefs app.apk method notify --class MainActivity --fuzzy-class`

`python main.py findrefs app.apk field apiKey -o field_refs.txt`

按表 A 落地的第一批命令（可以直接复制，把包名换掉）：

\# 危险面扫描：一个危险面对应一条查询

`python main.py findrefs app.apk method addJavascriptInterface`

`python main.py findrefs app.apk method setAllowFileAccessFromFileURLs`

`python main.py findrefs app.apk type Ldalvik/system/DexClassLoader;`

`python main.py findrefs app.apk method checkServerTrusted`

`python main.py findrefs app.apk type Ljava/lang/ProcessBuilder;`

\# 凭据与配置面（field 查询按字段名模糊匹配）

`python main.py findrefs app.apk field apiKey`

`python main.py findrefs app.apk field secret`

`python main.py findrefs app.apk string "Bearer "`

\# deeplink 与跳转面

`python main.py findrefs app.apk string "://"`

`python main.py findrefs app.apk method startActivity`

两个容易忽略的细节： **所有查询参数都是模糊（子串）匹配**——不需要写全字符串， `string flag` 会命中一切包含 `flag` 的字面量，这既省事也意味着你必须自己控制命中面； `--threads` 默认是 8，大包可以往上调。

实测手感（本文所有输出来自真实执行：InjuredAndroid 1.0.12，23.6MB，单个 classes.dex）：

`$ python main.py findrefs InjuredAndroid.apk string flag`

`classes.dex | Lb3nac/injuredandroid/FlagOneLoginActivity;->submitFlag`

            `| matched=(flagOneButtonColor)`

`classes.dex | Lb3nac/injuredandroid/FlagSevenSqliteActivity;->submitFlag`

            `| matched=(flagSevenButtonColor; flagSevenEncrypted)`

`classes.dex | Lb3nac/injuredandroid/DeepLinkActivity;->onCreate`

            `| matched=(flag11)`

...（实际 30 行命中）

`TIME elapsed=0.18s rss=42332KB`

实战建议：先 `string` 扫面（命中少、信息密度高、最适合开荒），再用 `method` / `type` 收敛到具体类，最后 `getclass` 把候选类拉成 Java 源码读。类型查询要注意 **命中洪泛**——像 `Landroid/content/Intent;` 这种到处都在用的类型会刷屏，必须配合 `--class` 或先按包名过滤，别让它淹没真正有价值的几条。

**一条必须提前知道的校准项**： `--class` / `--fuzzy-class` 的类名过滤，我在这次实测里没跑出命中——精确 Dalvik 名、点号写法、README 里的 `--class MainActivity --fuzzy-class` 、以及不带 `--class` 只给方法名四种写法，对 `method` 查询分别返回 0 行、0 行、0 行与数十行；同一包里 `type` 查询正常返回调用者。也就是说 **这个类名过滤在你手上的版本与目标上是否生效，必须先自己验一次**，别把 0 命中读成「没有该调用」。稳妥做法：用 `string` 与 `type` 两个面交叉定位， `method` 只在不带类名时做粗筛再人读收敛。

## 05 · 从命中到漏洞：把查询结果读成线索

工具只能给出「谁引用了什么」，漏洞是人读出来的。下面是我在一线审计里最常用的几组查询，以及每条线索该怎么往下走：

\# 1. JS 桥：谁暴露了原生对象

`python main.py findrefs app.apk method addJavascriptInterface`

\# 2. 本地文件跨源：WebView 的经典错配

`python main.py findrefs app.apk method setAllowFileAccessFromFileURLs`

\# 3. 动态加载：注意排除热修框架，见下方过滤规则

`python main.py findrefs app.apk type Ldalvik/system/DexClassLoader;`

\# 4. 明文凭据：先扫字段名，再扫前缀

`python main.py findrefs app.apk field apiKey`

`python main.py findrefs app.apk string "Bearer "`

\# 5. 命令执行与拼接

`python main.py findrefs app.apk method exec --class java.lang.Runtime`

**先看一个真实闭环（原始输出）。** 同一个练习包上， `string flag` 圈出 30 个候选类，挑一个拉源码：

`$ python main.py getclass InjuredAndroid.apk Lb3nac/injuredandroid/FlagOneLoginActivity;`

`public final void submitFlag(android.view.View p4)`

`{`

    `android.widget.EditText v4_5 =`

        `(android.widget.EditText) this.findViewById(2131230887);`

    `if (d.s.d.g.a(v4_5.getText().toString(), "F1ag_0n3")) {`

        `...`

    `}`

`}`

硬编码口令 `F1ag_0n3` 就躺在反编译结果里——从查询到读出版本凭据，两三秒。这才是这条流水线真正的手感： **反编译不再是「打开工程」，而是小查询的副产品。**

然后是反面教材，也是本节最该记住的部分： **同一个包，三条命令的结果天差地别。**

• `findrefs method addJavascriptInterface` → **0 命中**；但 `findrefs type Landroid/webkit/WebView;` 给出 3 处 WebView 使用点（DisplayPostXSS、FlagTwelveProtectedActivity、TestBroadcastReceiver）。 **单条查询 0 命中不等于「没有」**，换查询维度才能下结论——这也正是自动化流水线必须多维度扫面的原因。

• `findrefs method onCreate` （不加 `--class` ）→ 刷出 80 多行，绝大多数是 androidx、Google Play Services、Flutter 的框架方法。 **方法查询必须配 `--class` 收敛**，否则洪泛会淹没业务代码。

• `findrefs string "http://"` → 全包只有 4 条，且全是库样板（ `schemas.android.com` 的 XML 命名空间、 `localhost` ）。字面量查询抓不到被拼接、编码或走 HTTPS 的域名，得多组关键词分轮扫。

**误报过滤是这一节的全部价值所在。** 直接看命中列表会被三类噪声淹没：

• **热修与插件框架**：Tinker、Sophix、RePlugin 这类框架天然大量使用 `DexClassLoader` 与 `System.load` ，命中数会爆掉。按包名或类名前缀先剪掉，再看剩下的。有个 3 秒判断法：查热修框架注入的标志字段 `changeQuickRedirect` ——0 命中说明包里没挂热修（本文练习包实测就是 0）；命中很多则说明业务代码与热修框架混在一起，后面 `DexClassLoader` 类查询的噪声要按这个预期去剪。

• **广告与统计 SDK**：它们会引用 WebView、网络、加密相关 API，且通常在赏金范围之外。

• **框架的同名词**：模糊匹配不区分语言。 `string flag` 在练习包里前几条命中是 `suggest_flags` 、 `Must provide flag PRE or POST` 、 `removeDetachedView ... not flagged as tmp detached` ，全部来自 androidx。所以 `string` 查询尽量给更长的特征串（ `Bearer`  、`://` 、域名片段），短英文单词的命中列表基本要整条扔掉。

• **自带加固壳**：壳本身会做大量自省与动态加载，属于「看起来像但不可利用」。

过滤完之后，进入真正的判断环节，顺序是： **这个调用点的入参是否可控** → **能否从外部组件（导出 Activity/Service/Provider、deeplink）走到它** → **走到之后能否产生越权或执行效果**。三步都走通才是可提交的问题。

![img2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7359fba918d15e56.jpg)

## 06 · 接上 Agent：给 ASC 自建一层最小 MCP

先说清现状，避免你按网上的说法踩空： **ASC 目前官方没有 MCP**。仓库里能看到的信号是——有人开 issue 请求做 MCP（issue #1，作者未答复）；有人提了带 `--json` 和 stdio MCP 工具的 PR（#14），被作者关闭；真正在路上的是另一个给 `getclass` 与 `findrefs` 加 `--json` 结构化输出的 PR（#15，仍在审），它返回的命中项包含 `dex_name` 、 `caller_class` 、 `caller_method` 、 `matched` ，诊断走 stderr，并保留原有的并行搜索路径。

也就是说： **「搭配 MCP 做审计」这条路成立，但工具要你自己包一层。** 好消息是这件事很小——把 CLI 的两次调用（findrefs 扫面、getclass 取源码）注册成 MCP 工具即可。核心设计只有三条：

01 **只回传结论，不回传上下文**：findrefs 的返回要截断成「类名 + 方法 + 命中项」，绝不把整包数据灌进模型上下文。

02 **预算硬约束**：每个工具调用都设 `max_hits` 、超时和包名白名单，超限即返回「命中过多，请缩小查询」而不是硬撑。

03 **保留原文本输出**：Agent 读文本比读 JSON 更省 token，而机器解析场景再切 `--json` 。

![img4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c94798e64270963c.jpg)

### 一个最小可跑实现（本文已实测）

完整文件约 130 行（见本文配套的 `mcp_asc_server.py` ），核心只有三块：工具定义、预算裁剪、请求分发。

`TOOLS = [`

  `{"name": "asc_findrefs",`

   `"inputSchema": {"type": "object", "required": ["apk","kind","value"],`

     `"properties": {`

       `"apk":  {"type": "string"},`

       `"kind": {"enum": ["string","type","method","field"]},`

       `"value":{"type": "string"},`

       `"class_name": {"type": "string"},`

       `"max_hits":   {"type": "integer", "default": 40}}}},`

  `{"name": "asc_getclass",`

   `"inputSchema": {"type": "object", "required": ["apk","class_name"],`

     `"properties": {"apk": {"type": "string"},`

                    `"class_name": {"type": "string"},`

                    `"max_lines":  {"type": "integer", "default": 120}}}},`

`]`

def \_clip(text, limit): # 预算硬约束：超限即截断并提示缩窄

    `lines = [l for l in text.splitlines() if l.strip()]`

    `if len(lines) > limit:`

return "\\n".join(lines\[:limit\]) + "\\n...（命中 %d 条，已截断）" % len(lines)

return "\\n".join(lines) or "（无命中）"

def tool_findrefs(a): # 只回结论：类 + 方法 + 命中项

    `argv = ["findrefs", a["apk"], a["kind"], a["value"]]`

    `if a.get("class_name"):`

        `argv += ["--class", a["class_name"]]`

    `code, out = run_asc(argv, timeout=300)`

return \_clip(out, a.get("max_hits", 40)) if code == 0 else "ASC 退出码 %d" % code

分发逻辑就是 JSON-RPC 三件套： `initialize` 回协议版本与 `capabilities.tools` ， `tools/list` 回上面的定义， `tools/call` 起子进程调 CLI。两个工程要点： **诊断信息一律走 stderr，stdout 只许出现 JSON 报文** （否则客户端解析失败）；每个工具调用都要有超时，别让一次卡死的查询把 Agent 挂在那儿。

实测结果（本文练习包）： `initialize` 、 `tools/list` 、 `tools/call` 三段全部正常返回； `asc_findrefs(kind=string, value=flag)` 与 `asc_getclass(Lb3nac/injuredandroid/FlagOneLoginActivity;)` 的命中列表与直接跑 CLI 完全一致， `structuredContent.count` 分别为 6 与 15（含截断提示那一行）。也就是说， **这条路今天就能用，不必等官方 MCP**。

### Agent 侧的提示词骨架

工具给对了，分工就清楚了： **Agent 扫面，人判断**。实测好用的骨架是「清单 + 约束 + 固定输出格式」三件套：

你是 APK 审计的扫面助手。目标包 {apk}，已授权范围 {scope}。

任务：按下表逐个危险面调用 asc_findrefs；每个危险面至多 2 次查询，

优先 kind=string，其次 kind=type，不要用带类名过滤的 method 查询。

约束：

\- 单次 max_hits ≤ 40；命中超过 40 条就换更长的关键词重查，不许拆请求刷量。

\- 命中里属于 androidx、google、gms、okhttp 及第三方 SDK 的直接丢弃。

\- 不许给出「存在漏洞」的结论；你只负责输出候选调用点。

输出（严格按格式，一行一条）：

危险面 | 类名 | 方法 | 命中项 | 为什么值得看（≤20 字）

最后另起一行给出「建议优先精读的 3 个类」及理由。

第三条约束是这份骨架的关键：把「判断」从 Agent 手里拿走，它就不会拿一堆「疑似 RCE」来糊你；而它真正擅长的事——把十几次查询跑完、把几百条命中收敛成一张能读的清单——正好是你不想自己做的那部分。

顺带说清一个分工底线：让 Agent 负责「按表 A 逐个危险面扫一遍、把命中汇总成候选清单」，人负责「判断可达性与可利用性」。不要让它直接下「这里存在 RCE」的结论——它会很乐意编一个给你。

## 07 · 端到端演练：面 → 点 → 链 → 验证

练习建议用公开的故意脆弱 App，合法、可复现：InjuredAndroid（B3nac，本文实测用的就是它，23.6MB、单个 classes.dex）、DIVA（payatu/diva-android）、OVAA（oversecured）。用它们把手感练出来，再上真实赏金目标。整条流程四步：

01 **面**：按表 A 逐项 `findrefs` 扫一遍，得到原始命中（练习包里几十条量级，商业包几百条）。

02 **点**：剪掉 SDK 与框架噪声，留下与业务包名相关的调用点，用 `getclass` 拉源码精读。

03 **链**：从外部可达入口出发，检查能否串到该点——导出组件的 manifest 配置、deeplink 解析路径、WebView 加载的 URL 是否可控，都是这一环的关键。

04 **验证**：只在自己的授权环境里动手。命令行侧可用 adb shell am start -n 包名/类名 --es 参数 值 触发导出组件，deeplink 用 `adb shell am start -a android.intent.action.VIEW -d "scheme://..."` ；WebView 类问题用一个本地恶意页面加载到目标视图上验证桥方法是否真的可达。

![img5](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/62d9179eb84f08b5.jpg)

产出是一份能直接提交的报告，要素固定四样： **影响面** （哪些用户、什么后果）、 **复现步骤** （从安装包到结果的完整命令链）、 **证据** （截图与日志，不是推理）、 **修复建议** （具体到配置或代码改动）。缺任何一项，赏金项目都会把报告打回来。

### 报告骨架（照抄填空）

标题：\[组件名\] 导出/配置不当导致 \[后果\]（可影响 \[范围\]）

影响：一句话说清谁能做什么、能拿到什么。

前置条件：受影响版本 / 是否需安装某 App / 是否需要用户交互。

复现步骤：

  `1) adb install target.apk`

2) adb shell am start -n 包名/.导出Activity --es 参数 值

3) 观察到 X（截图见附件）

证据：截图 + logcat 关键行 + 涉及的类与方法（可附 getclass 源码片段）

影响面评估：版本区间、是否只需本地攻击者、是否需要已安装其他应用

修复建议：exported=false / 校验调用方签名 / 改走内部组件并加权限

### 时间预算：一次常规 APK 审计

|     |     |     |
| --- | --- | --- |
| 阶段  | 时间  | 说明  |
| 授权与情报 | 30 分钟 | 读项目范围，确认版本、加固与收不收低危 |
| 扫面（Agent 跑） | 10 分钟 | 表 A 全跑一轮，产出候选清单 |
| 剪枝  | 20 分钟 | 去 SDK / 热修 / 壳噪声，留下与业务包名相关 |
| 精读  | 1–2 小时 | `getclass`<br><br>拉源码，逐条判断入参可控性与可达性 |
| 串链与验证 | 1–3 小时 | 只对走通的假设做实测，其余写进笔记 |
| 写报告 | 30 分钟 | 按上面骨架填，附证据 |

对照一下旧流程：光是「等 jadx 建完索引」就要 8 分钟起步、内存 13GB 起，而且第一个目标跑完你就下意识不想再试第二个了。新流程把前两步压进 40 分钟以内， **真正决定收益的精读与串链时间反而更充裕**——省下来的不是工时，是「敢不敢多试一组假设」的决策空间。

## 08 · 边界、坑与合规红线

**必须写在最前面的一条：ASC 宣称的「跳过完整解压」目前是实验性功能，没有合入主线。** 仓库 issue #4 里有人直接质疑该实现找不到，作者的回答是：跳块解压属于实验特性、会在 Black Hat 现场演示，因为部分场景没命中、还要继续修，直接合并会导致可用性问题，所以暂不进主线。他给出的自测输出是：对某个 300MB 级商业包用 8 个 worker 查询单一类型引用， `fast_dex 170.220ms` 、 `exact-lookup 49.451ms` 、总计 `84.425ms` ，在 `classes30.dex` 命中。

这段信息有两层意思：一是 **标题式的「不解压就能搜」现在别信**，成熟能力是第 03 节那套机制；二是 **作者自己会公开承认未完成项**，这反而是工程可信度的正面信号。

其它边界：

• **输入形态**：README 的输入是单个 `app.apk` 。Play 上很多目标只有 split APK 或 XAPK，需要先合并或用 bundletool 导出，官方未声明支持，请自测后再依赖。

• **能力边界**：ASC 解决的是「引用面定位」与「单类反编译」，不替代 manifest 深挖、资源分析、动态抓包。赏金流程里它管前半程，后半程仍是 adb、frida、抓包工具。

• **字符串搜索的漏检**：作者承认部分场景字符串未命中，所以任何「扫不到」的结论都要用第二种方法交叉验证一次再下判断。

**合规红线**：只对自己有授权的目标动手；严格遵守赏金范围，界外的组件即使能打通也不碰；不把工具用在真实用户数据上。这个仓库的 issue 区里也有人提醒过「小心有人拿这个搞黑产」——工具中性，用法不中性。

## 09 · 收尾：一张可以带走的 SOP

表 C：APK 赏金审计流水线（按顺序执行，每步有明确产出）

|     |     |     |
| --- | --- | --- |
| 步骤  | 动作  | 产出  |
| 0 授权 | 确认范围、界外组件、目标版本 | 一份可测试清单 |
| 1 情报 | 版本、加固情况、历史漏洞、业务模型 | 优先危险面（表 A 子集） |
| 2 扫面 | 针对子集跑 `findrefs` （string 优先） | 原始命中列表 |
| 3 剪枝 | 剔除 SDK、热修、加固壳噪声 | 候选调用点 |
| 4 精读 | `getclass`<br><br>拉源码 + 人读 | 可疑点假设 |
| 5 串链 | 从外部入口到可疑点验证可达性 | 可复现路径 |
| 6 验证 | 授权环境内 adb/浏览器实测 | 截图与日志证据 |
| 7 提交 | 影响、步骤、证据、修复建议 | 报告  |

![img6](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9c63009692462b4b.jpg)

一句话总结： **把反编译器从「IDE 里的大工程」降级成「一次毫秒级查询」，再用 MCP 把这查询交给 Agent 批量做，赏金审计的重心就回到了人真正值钱的那部分——判断和串链。**
