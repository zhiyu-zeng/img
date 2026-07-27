---
title: 让扫描器理解差异：面向Web安全场景的智能Diff引擎设计-先知社区
source: https://xz.aliyun.com/news/92559
source_host: xz.aliyun.com
clip_date: 2026-07-27T17:00:15+08:00
trace_id: ee302abd-8935-42a2-90d2-b3cf72d80c1f
content_hash: 3c1956ba2bd1e6cd4d41a16d7d4e6614e943e828b5c8fa213a09fdf3f90c09b8
status: synced
tags: []
series: null
feed_source: 先知安全技术社区
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 1
  failed_urls:
    - https://xz.aliyun.com/api/v2/files/7899bf22-4283-35a2-b3d9-6396dec42e57
    - https://xz.aliyun.com/api/v2/files/14fee171-6a98-3144-bf24-704ab6ed00db
    - https://xz.aliyun.com/api/v2/files/21c85668-ea05-30bb-92ac-b414cb8172ed
notion_page_id: 3aa75244-d011-8151-886c-e172f4384858
ioc: null
---

0x00 第一版已经能比对了，但不够"聪明"

WebHunter 的第一版 Diff 引擎做了基础工作——自研了 LCS 和 SequenceMatcher，不依赖 Python 的

difflib

，能对 HTTP 响应的 Status、Header、Cookie、Body 做四维比较。跑是能跑，但有两个问题一直没解决：

第一，权重是固定的。不管比的是 JSON API 还是 HTML 页面，status 永远占 15%、body 占 25%。实际场景里，一个 JSON 接口的 DOM 维度永远是满分（因为根本没有 DOM），这会让相似度被虚高。

第二，比较结果只有一个数字。

similarity: 0.72

——然后呢？安全人员得自己翻 diff 输出找"到底哪里不一样"。如果差异是因为

role=student → admin

还是因为时间戳变了，从这个数字上是看不出来的。

第三，缺乏"正常波动"的概念。同一个接口连续请求 10 次，响应体可能有 ±5 字节的正常波动。如果只做 A/B 比较，这种波动会被当成差异报警。

这三个问题指向同一个方向：Diff 引擎需要从"能做比较"进化到"能理解差异"。

0x01 安全场景的 Diff 到底要多做什么

普通的文本 Diff 只需要回答"哪里不同"。安全场景的 Diff 需要回答三个问题：

1

这个差异是不是动态噪声？

—— 时间戳、UUID、CSRF Token 每次都不一样，但不是漏洞

2

这个差异在结构化层面意味着什么？

—— JSON 里少了一个字段和多了一个字段，安全意义完全不同

3

这个差异在业务层面有多严重？

—— 状态码从 403 变成 200，和多了个空格，显然不能给一样的分数

这三个需求没有一个能用现成的标准库解决。所以我从 LCS 算法开始，把整个 Diff 引擎重新写了一遍。

0x02 自研 LCS + SequenceMatcher —— 不调 difflib

为什么从 LCS 开始？

因为

difflib.SequenceMatcher

不让你控制"什么算匹配"。在安全场景里，我需要先过滤掉动态值，再做序列匹配。而且

difflib

的

get_opcodes()

返回的编辑操作粒度太粗——我需要知道具体是哪个 JSON 字段变了、哪个 Header 变了，而不是"第 15-20 行被替换了"。

LCS 本身的实现不复杂，核心是一个 O(n*m) 的动态规划：

然后基于 LCS 实现了完整的 SequenceMatcher——

ratio()

、

quick_ratio()

、

find_longest_match()

、

get_matching_blocks()

、

get_opcodes()

，全部不依赖标准库。

但 LCS 只是第一步。真正的难点在于：

比较之前，要自动识别并忽略那些跟漏洞无关的动态值。

0x03 12 种自动忽略模式——解决的问题比算法本身还多

在真实测试中，下面这些东西每次都会变，但它们跟漏洞毫无关系：

如果不对这些做处理，每次扫描都会因为动态值变化而产生大量误报。

我的做法不是"跳过这些字段"——是

先替换为固定占位符，再做 Diff

：

这样做的效果是：对于动态噪声，Diff 引擎看到的是

\__IGNORED_timestamp\_\_

vs

\__IGNORED_timestamp\_\_

——完全匹配，零差异。但真正的安全差异（比如状态码变了、字段多了、权限字段被改了）依然会被捕获。

这个设计解决了大概 60% 的误报来源。

![屏幕截图 2026-07-22 222004.png](⚠️ https://xz.aliyun.com/api/v2/files/7899bf22-4283-35a2-b3d9-6396dec42e57)

0x04 多维 Diff —— JSON、HTML、Header、Cookie 各自独立比较

字符串级别的 Diff 在安全测试里远远不够。两个 HTTP 响应可能在以下任何一个维度上产生差异：

|     |     |
| --- | --- | 
| 维度  | 安全意义 |
| Status Code | 403→200 可能是权限绕过 |
| Headers | 新增<br><br>X-Internal: true<br><br>可能是调试接口泄露 |
| Cookies | Session 变化可能意味着会话固定 |
| JSON 结构 | 新增<br><br>role<br><br>字段可能是 Mass Assignment |
| JSON 值 | role=user<br><br>→<br><br>role=admin<br><br>是明确的提权 |
| HTML 标签 | DOM 结构变化可能是页面注入 |
| Body 长度 | 内容增长 10x 可能是数据泄露 |

所以我把 Diff 拆成了 8 个独立维度，每个维度有自己的比较逻辑：

●

StatusDiff

：直接比较 HTTP 状态码，自动归类变化幅度（200 系→500 系 = 严重，200→201 = 轻微）

●

HeaderDiff

：比较所有 Header Key/Value，自动应用忽略模式处理动态值

●

CookieDiff

：独立比较 Cookie，因为 Cookie 变化的安全含义和 Header 完全不同

●

JSONDiff

：

递归深度优先遍历

JSON 树，输出

added/removed/changed/type_changed

四种变化类型

●

HTMLDiff

：抽取 HTML 标签序列做结构比较，同时比较纯文本内容

●

DOMDiff

：剥离所有标签后比较 DOM 文本内容

●

TextDiff

：传统的逐行比较，但支持 unified 格式输出（

+

/

\-

行）

●

LengthDiff

：快速检测响应体长度的显著变化

JSONDiff 是整个引擎里最复杂的部分。它不是把 JSON 当成字符串比较，而是

先转换成 Python 对象，再递归遍历每个 key

：

这样出来的结果是

精确到每个叶子节点的差异路径

，比如

user.profile.role: student → admin

。不是"第 47 行不一样"。

0x05 自适应权重——JSON API 和 HTML 页面不该用同一把尺

8 个维度的比较结果怎么合成一个相似度分数？最简单的做法是固定权重：

但这个固定权重在面对不同类型的响应时会出问题。比如：

●

JSON API

：

body

和

json

维度最重要，

html

和

dom

完全无关

●

HTML 页面

：

dom

和

html

维度最重要，

json

完全无关

●

认证接口

：

cookies

和

status

的变化可能意味着认证失败，权重应该更高

所以加了自适应权重。引擎先检测响应类型，然后动态调整权重：

这层逻辑让相似度分数在不同场景下都有了可解释性——不会因为一个 JSON API 的 DOM 维度永远是满分而拉高了整体相似度。

0x06 从"0.72"到"权限字段变了"——差异解释

对于安全人员来说，看着

similarity: 0.72

和一堆 diff 输出，需要手动分析"到底发生了什么"。

explain()

方法把差异转成自然语言：

实现原理是把 8 个维度的差异按安全优先级排序：Status > Permission 字段 > JSON 字段变化 > Cookie > 长度。权限相关字段（

role

、

is_admin

、

permission

、

identity

）被单独标记为高优先级，一旦变化就出现在解释的最前面。

![屏幕截图 2026-07-22 222033.png](⚠️ https://xz.aliyun.com/api/v2/files/14fee171-6a98-3144-bf24-704ab6ed00db)

0x07 行为基线——让扫描器理解"正常"是什么

现有扫描器都是做 A/B 比较。但如果一个接口的正常行为就有一定波动呢？

行为基线解决的是：

先收集 N 次正常请求，建立"正常变化范围"，然后把新请求放进去看是否异常。

基线的学习内容包括：正常状态码集合、稳定出现的字段集合、响应体长度范围、body hash 去重。一个字段如果在 5 次正常请求中都出现，它就被标记为"稳定字段"；如果第 6 次请求突然多了一个

id_card

，立即标记异常。

这个方法对于发现"版本更新导致的意外数据泄露"特别有效

——新版本上线后、某个接口开始返回之前没有的字段，行为基线能在不需要规则更新的情况下自动发现。

![屏幕截图 2026-07-22 222051.png](⚠️ https://xz.aliyun.com/api/v2/files/21c85668-ea05-30bb-92ac-b414cb8172ed)

0x08 基准测试数据

在 8 个测试场景上的表现：

|     |     |     |
| --- | --- | --- |  
| 场景  | 描述  | 效果  |
| 动态噪声过滤 | 两个除了时间戳/UUID外完全相同的 JSON 响应 | 相似度 100%，零差异 |
| 权限字段变化 | {"role":"student"}<br><br>→<br><br>{"role":"admin"} | 正确识别并标记为 high 优先级 |
| JSON 结构变化 | 新增<br><br>phone<br><br>、<br><br>email<br><br>字段 | +2 keys<br><br>，自适应权重标记 |
| 状态码变化 | 200 → 403 | status 维度归零，整体相似度显著下降 |
| HTML 结构变化 | 标签数量变化 | HTML diff 独立报告 |
| 行为基线异常 | 5 次正常请求后，突然出现<br><br>id_card | is_anomalous=True |
| 跨场景权重 | JSON API vs HTML 页面 | 权重自适应调整 |

0x09 局限和其他应用场景

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1cdcf601c4be4ea1.png)

这套 Diff 引擎是为 Web 安全测试设计的，在以下场景有局限：二进制响应不做逐字节比较、超大响应体（>10MB）会因为内存消耗跳过 body 维度、URL 参数级别的差异需要配合参数发现模块使用。

但换个角度看，它的设计思路可以搬到其他场景：API 版本变更监控、灰度发布自动回归、前后端接口契约校验。只要是需要"理解 JSON/HTML/HTTP 差异"的地方，行为基线 + 自适应权重的组合都能用。

引擎源码已开源，文中代码为简化示例。
