---
title: 【看雪】某约稿平台 M-S 签名逆向：从 "Ascon" 烟雾弹到 ChaCha20 铁证，再到 Node 黑盒补环境复现
source: https://bbs.kanxue.com/thread-293164.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-10T00:17:23+08:00
trace_id: dc145bc1-4d8d-4a61-8742-3cb3b96fb03d
content_hash: 10f2f6fdd819e299805a17aeacf427a0afff5e9a22d6b95b22da62212af719cb
status: synced
tags:
  - 看雪
  - Android逆向
  - Frida
series: null
feed_source: 看雪·逆向工程
ai_summary: 目标站点的 `M-S` 签名由 Rust 编译的 WebAssembly 生成，内部为 ChaCha20 流加密；只需在 Node 里 mock 少量浏览器环境，即可黑盒复现签名，无需还原 wasm 内部逻辑。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-8146-b55b-e56572aebd75
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 目标站点的 `M-S` 签名由 Rust 编译的 WebAssembly 生成，内部为 ChaCha20 流加密；只需在 Node 里 mock 少量浏览器环境，即可黑盒复现签名，无需还原 wasm 内部逻辑。
> 
> - **工具选型：** 用改版 Firefox（RuyiTrace）记录 JS 运行时的 DOM/BOM/WebAPI 调用日志（本次主进程 24 万行），把"读混淆代码猜行为"变成"查运行时日志"。
> - **算法定性：** 字符串 `ascon` 是烟雾弹；WAT 中精确命中四常量 `0x61707865 / 0x3320646e / 0x79622d32 / 0x6b206574`，即 `"expand 32-byte k"`，证实为 ChaCha20。
> - **环境依赖：** 读取 `link[rel*='icon']` 的 href 作物指纹、`Reflect.set(navigator,"webdriver",true)` 须返回 false、`crypto.getRandomValues` 取 32 字节随机数（故同一 URL 每次签名不同）。
> - **四个补环境坑：** navigator.webdriver 须用 defineProperty 设为不可写；不污染 global；令 `process/require/node/versions` 相关 import 返回 0 逼走浏览器路径；签名输入只用 path，不带 query。
> - **验证与边界：** 带签名请求返回 200；两份字节不同的 wasm 产出相同固定片段；签名长度 = (53 + url_len)/3*4，未完成 key 派生（18 字节非标准 32 字节）与纯算法重构。

> 目标站点： `http://www.example.com` · 目标参数：请求头 `M-S` （签名）与 `M-T` （时间戳）· 内部算法：ChaCha20 流加密 · 最终方案：Node.js 补环境 + WASM 黑盒 · 时间：2026-10

**摘要**：这一单我踩了三块硬骨头——先是被 wasm 里一个叫 `ascon` 的字符串骗得以为算法是 Ascon，结果反汇编挖出来是 ChaCha20；再是拿一串 124 字符的真实签名当基准，对着自己 100 字符的输出怀疑"是不是少算了 18 字节"，最后发现签名长度本来就随 URL 长度变；最后在"逆 wasm 内部"这条死路上耗了很久，才掉头走"补环境黑盒"这条路，几行 mock 就把签名在 Node 里原样复现出来了。全程没碰 wasm 内部一行明文逻辑，但把它的底裤——算法家族、密钥、环境依赖——全扒了一遍。

* * *

## 起因：一个 403 的接口

目标是要抓某约稿平台「约稿大厅」的数据，接口长这样：

```python
https://www.example.com/api/v1/stalls/preview?topic_count=4
```

浏览器里点开正常返回 JSON，但直接 `curl` / `requests` / `fetch` 过去就是 403。抓包一看，请求头里多了两个字段：

```python
M-S: 一串 100~124 字符不等的乱码
M-T: 1778571128
```

`M-T` 一眼就是秒级时间戳， `M-S` 一看就是签名。签名不对，服务端直接拒绝。

所以目标非常明确，就一句话： **还原生成 `M-S` 这个参数的算法，在 Node.js 里零浏览器、零登录态地复现**。拿到这个签名，后面的爬取、自动化、数据采集才谈得上。

* * *

## 工具与环境：一个能记录每一次 DOM 调用的改版 Firefox

先交代手上的家伙，因为整个逆向的入口就是它—— **RuyiTrace** （如意 trace）。它是个改了内核的 Firefox（内核版本 155.0.1），核心能力是： **在页面运行时，把 JS 引擎触发的每一次 DOM / BOM / WebAPI 调用都记录成结构化日志**。

为什么要用它？因为对混淆 JS 做逆向，传统手段（下断点、搜字符串、读混淆代码）效率太低——你根本不知道那堆乱码里哪一段在干活。而 trace 的哲学是反过来的： **不管代码长什么样，我只看它运行时到底调用了什么**。签名最终要发出去，就必然要 `setRequestHeader` ；签名要用加密，就必然要碰 `crypto` ；签名要读环境，就必然要碰 `document` / `navigator` 。这些调用是藏不住的。

启动它靠一组环境变量 + 命令行，全自动，不需要手动点：

```bash
export MOZ_DOM_TRACE=1
export MOZ_DOM_TRACE_FILE="D:/trace/run.jsonl"
export MOZ_DOM_WASM_DUMP=1        # dump 出页面加载的 wasm
export MOZ_DOM_WASM_CALL=1        # 记录 wasm 导出函数的调用
export MOZ_DOM_HTTP_PACKET_TRACE=1  # 记录 HTTP 报文

firefox.exe --new-instance -no-remote -profile "D:/trace/profile" \
    "https://www.example.com/stalls"
```

跑完，日志目录里会生成一批 NDJSON 文件，核心是 `domtrace/trace_process_<pid>.jsonl` 。某约稿平台首页这一次，主渲染进程的日志有 **24 万多行**，旁边还有 cookie、descriptor、eval、event、wasm 几个子目录，wasm 目录里直接 dump 出了页面加载的 `fe_sign_*.wasm` ——这个文件后面会反复用到。

每一条 trace 记录长这样，是一个 JSON 对象：

```json
{
  "type": "call",                          // call / get / set 三种之一
  "interface": "XMLHttpRequest",           // 哪个对象
  "member": "setRequestHeader",            // 哪个成员
  "args": ["M-S", "3F9aJFJZ..."],          // 入参（get 是 value，call 是 return）
  "stack": [                               // 完整调用栈，定位用
    {"func":"sign","file":"http.BzJ4_4Bj.js","line":2,"col":741}
  ]
}
```

`type` 分了三种： `call` 是方法调用（带 `return` 返回值）、 `get` 是属性读取（带 `value` ）、 `set` 是属性写入。这个结构是全文后面所有定位工作的基础。

> 一句话说清这套工具的价值： **它把"读混淆代码猜行为"变成了"直接查运行时日志"**。逆向从"考古"变成了"查案卷"。

* * *

## 第一回合：先拿到真实样本，锁定签名在哪产生

第一步永远是 **拿到真实样本**——没有真值，后面一切"我复现得对不对"都无从判断。

有了 trace 日志，直接从结果倒推。签名要发出去，必然经过 `setRequestHeader` ，所以在 24 万行日志里 grep 这个关键字，命中了一小段：

```json
{"type":"call","interface":"XMLHttpRequest","member":"setRequestHeader",
 "args":["Accept","application/json, text/plain, */*"]}
{"type":"call","interface":"XMLHttpRequest","member":"setRequestHeader",
 "args":["Authorization","Bearer null"]}
{"type":"call","interface":"XMLHttpRequest","member":"setRequestHeader",
 "args":["M-S","3F9aJFJZweno_oVRtVCO+RWLM1mUV1GOB9Wb40CZtMGarRjMwYjM5cTO0gTbV9GTvZGO4QHW39WIYFSMSpFZtYlVSd2ZzR0ZSJVTzxDP"]}
{"type":"call","interface":"XMLHttpRequest","member":"setRequestHeader",
 "args":["M-T","1778571128"]}
{"type":"call","interface":"XMLHttpRequest","member":"setRequestHeader",
 "args":["Web-Version","frontend"]}
```

三个结论当场落地：

1.  `M-T` = `1778571128` ，秒级时间戳，后面会再验证它的生成方式；
2.  `M-S` 和 `M-T` 、 `Web-Version` 在 **同一处** 被连续塞进 headers，说明生成逻辑集中在同一个拦截器里；
3.  签名值是一段 base64 风格的字符串，这个样本长 104 字符——注意， **长度不固定**，这个伏笔后面会变成一个差点让我翻车的坑。

再往前翻几行，找到了组装好的完整 headers 对象：

```json
{
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "undefined",
  "Authorization": "Bearer null",
  "M-S": "3F9aJFJZweno_oVRtVCO+...",
  "M-T": "1778571128",
  "Web-Version": "frontend"
}
```

到这里，第一回合收工： **真实样本到手，签名产生的落点（axios 拦截器）锁定了**。

* * *

## 第二回合：追溯 M-S 的源头，一路追进 WASM

有了样本，下一步找"这个字符串到底是谁吐出来的"。这比"在哪设置"更进一步——设置只是把现成的值塞进 header，我们要找的是 **值本身在哪诞生**。

方法是在日志里搜这个签名值 **第一次出现** 的位置。结果是一段 `TextDecoder.decode` 的调用——签名是从一块 wasm 内存里解码出来的：

```json
{
  "type":"call","interface":"TextDecoder","member":"decode",
  "args":[{"0":51,"1":70,"2":57,"3":97,"4":74,"..."}],
  "return":"3F9aJFJZweno_oVRtVCO+RWLM1mUV1GOB9Wb40CZtMGarRjMwYjM5cTO0gTbV9GTvZGO4QHW39WIYFSMSpFZtYlVSd2ZzR0ZSJVTzxDP",
  "stack":[
    {"func":"O","file":"http.BzJ4_4Bj.js"},
    {"func":"sign","file":"http.BzJ4_4Bj.js","line":2,"col":741},
    {"func":"sign","file":"http.BzJ4_4Bj.js","line":2,"col":11451}
  ]
}
```

`args` 里那串数字就是内存里的原始字节， `return` 是解码出来的签名字符串。关键在调用栈——再往上追，看到一个 wasm-bindgen 的标志性函数名，栈底落在一个 `.wasm` 文件上：

```json
{
  "type":"call","interface":"TextDecoder","member":"decode",
  "args":[{"0":101,"1":120,"2":105,"3":116}],
  "return":"exit",
  "stack":[
    {"func":"O","file":"http.BzJ4_4Bj.js"},
    {"func":"Se/t.wbg.__wbindgen_string_new","file":"http.BzJ4_4Bj.js"},
    {"func":"","file":"fe_sign_bg.DLpTGLRB.wasm","line":54608}
  ]
}
```

结论清晰了：签名算法被封装在 **Rust 编译的 WebAssembly 模块** `fe_sign_bg.DLpTGLRB.wasm` 里，JS 只是 wasm-bindgen 自动生成的胶水层。文件名 `fe_sign` 直译就是"前端签名"（fe = frontend，sign = 签名），直接坐实了。

同时顺带确认了时间戳的生成方式，日志里 `Date.now` → `Math.floor` 的调用链一清二楚：

```json
{"type":"call","interface":"Date","member":"now","return":1.77857e+12}
{"type":"call","interface":"Math","member":"floor","args":[1.77857e+09],"return":1778571128}
```

`M-T = Math.floor(Date.now() / 1000)` ，秒级时间戳，和第一回合的 `1778571128` 对上了。

第二回合收工： **算法在 wasm 里，不在 JS 里。** 这决定了后面的路线选择。

* * *

## 第三回合：把 WASM 的环境依赖摸个底朝天

到这里出现岔路，两条路摆在面前：

-   **路 A（硬刚）**：把 wasm 反汇编，逆出内部算法，手写一个等价的 JS/Python 实现；
-   **路 B（黑盒）**：不碰内部，把 wasm 依赖的浏览器环境 mock 出来，让它在我这照常跑。

选哪条，取决于一个关键问题： **wasm 到底从环境里吃了多少东西？** 吃得多，补环境就麻烦；吃得少，补环境就是最优解。于是继续翻 trace，把 wasm 初始化时碰过的每一个环境 API 都翻出来。

**它把 favicon 的 URL 当签名材料。** 日志 7712 行附近，wasm 初始化时主动去查 DOM：

```json
{"type":"call","interface":"TextDecoder","member":"decode",
 "args":[{"0":108,"1":105,"2":110,"3":107,"..."}],
 "return":"link[rel*='icon']"}

{"type":"call","interface":"Document","member":"querySelector",
 "args":["link[rel*='icon']"],
 "return":"[Object HTMLLinkElement]"}

{"type":"call","interface":"Element","member":"getAttribute",
 "args":["href"],
 "return":"https://js-assets.example.com/assets/legacy/favicon.ico"}
```

它主动去取页面 `<link rel="icon">` 的 `href` 。为什么签名要碰 favicon？因为这是 **环境指纹**——真实浏览器里这个值一定存在且正确，无头环境里就没有。把它混进签名，等于把"你在不在真浏览器里"这件事焊进了签名里。

**它做反自动化检测—— `navigator.webdriver` 必须是只读的。** 日志 7727 行附近：

```json
{"type":"get","interface":"Window","member":"get navigator"}
{"type":"call","interface":"TextDecoder","member":"decode","return":"webdriver"}
{"type":"call","interface":"Reflect","member":"set",
 "args":["[Object Navigator]","webdriver",true],
 "return":false}
{"type":"get","interface":"Navigator","member":"get webdriver","value":false}
```

这个 `return: false` 是精髓。wasm 尝试 `Reflect.set(navigator, "webdriver", true)` ：

-   如果返回 `true` （写入成功），说明这个 navigator 是普通可写对象，多半是 Puppeteer/Selenium 注入的假环境 → **panic**；
-   如果返回 `false` （写入被拒），说明 `webdriver` 是原生只读 getter → 判定为真浏览器 → **放行**。

**它有随机成分。** 日志 8741 行：

```json
{"type":"call","interface":"Crypto","member":"getRandomValues",
 "args":[{"0":168,"1":26,"...共32字节"}],
 "return":{"0":32,"1":183,"...共32字节"},
 "stack":[{"func":"Se/t.wbg.__wbg_getRandomValues_bcb4912f16000dc4/<","file":"http.BzJ4_4Bj.js"}]}
```

`getRandomValues` 被调用、每次 32 字节随机数，说明签名里掺了 nonce/随机盐。 **同一 URL 每次签出来的 M-S 都不一样**——这直接否掉了"它是确定性 HMAC"的猜测，也解释了为什么第一回合拿到的样本没法定长。

把这几条拼起来，wasm 的环境依赖清单就出来了，一共没几个：

| 环境 API | 用途  | 补环境怎么处理 |
| --- | --- | --- |
| `document.querySelector("link[rel*='icon']")` | 取 favicon 指纹 | 返回固定 mock 元素 |
| `element.getAttribute("href")` | 取 favicon URL | 返回真实固定值 |
| `navigator.webdriver` | 反自动化检测 | 设为不可写的 `false` |
| `Reflect.set(navigator, "webdriver", true)` | 反自动化检测 | 必须返回 `false` |
| `crypto.getRandomValues()` | 生成 nonce | 用 Node 的 crypto 顶上 |
| `process` / `node` / `require` | 环境检测 | 全部隐藏，返回 0 |

结论出来了： **依赖就这么几个，路 B（黑盒补环境）完全走得通，而且成本远低于路 A。** 但当时的我没立刻想通，还在路 A 上耗了一阵——这是后面第五回合的学费。

* * *

## 第四回合：读胶水层和拦截器，搞清"签名到底签的是什么"

补环境之前，还差最后一块拼图——签名函数的 **真实输入** 到底是什么。

先读胶水层 `http.BzJ4_4Bj.js` 。它是 wasm-bindgen 生成的，虽然混淆过，但结构是标准的。反混淆后， `SignTool` 类长这样：

```javascript
class pe {
    constructor() { this.__wbg_ptr = _.signtool_new() >>> 0; }   // 调 wasm 建实例
    sign(e, n) {
        // e = URL 路径字符串, n = 时间戳数字
        _.signtool_sign(y, this.__wbg_ptr, fe, le, n);          // 调 wasm 签名
        return O(x, A);                                          // 从 wasm 内存读出结果
    }
}
```

wasm 导出两个关键函数： `signtool_new()` 建实例、 `signtool_sign(ret, ptr, url_ptr, url_len, ts)` 签名。JS 层就是传参 + 读内存，没有任何算法逻辑。

再读拦截器 `http.Uxzu40tg.js` ，看签名是怎么被喂进去的：

```javascript
const G = async (e, n, r = () => Math.floor(Date.now() / 1e3)) => {
    const t = r();                      // 时间戳
    const u = encodeURI(e.url);         // ← 关键：对 URL 做 encodeURI
    const a = n(u, t);                  // sign(url, timestamp)
    e.headers = Object.assign(e.headers, { "M-S": a, "M-T": t, "Web-Version": "frontend" });
};
```

这里埋着一个最容易翻车的坑： `e.url` 是 axios 的 `config.url` ， **只含路径、不含 query 参数** （ `params` 是 axios 单独拼的，发送时才拼上）。所以签名输入是：

```python
/api/v1/stalls/preview                          ← 22 字节，正确
/api/v1/stalls/preview?topic_count=4            ← 带上 query，签出来的就是错的
```

这个细节，连同第三回合的环境依赖清单，就是补环境所需的全部信息了。万事俱备，但我先拐去走了一段弯路。

* * *

## 第五回合（死路）：逆 WASM 内部，挖出 ChaCha20 却及时止损

在最终选定黑盒之前，我在路 A（逆 wasm 内部）上耗了不少功夫。这条死路最后 **没走完就退了**，但它吐出来的东西反而是全文最有意思的部分——它让我看清了签名算法的真面目。

### 5.1 反汇编：把 wasm 摊开看

第一步是把 wasm 反汇编成可读的 WAT。wasm 文件 64979 字节，反汇编出来的 WAT 有 **901KB**。这个量级就已经在暗示：里面是个不小的算法实现，逐行逆下去的性价比很低。但我还是硬着头皮扫了字符串和常量。

### 5.2 一个字符串把我带沟里了

用 `strings` 扫 wasm 的 data segment，看到一个明晃晃的字符串：

```python
js-.example-ascon
```

`ascon` 四个字母让我直接下结论："好，这是 **Ascon AEAD** 加密。"（Ascon 是 2023 年 NIST 轻量密码竞赛的胜出算法，AEAD 模式，常出现在这种前端签名场景里。）我还顺着这个思路去找 Ascon 的 64 位初始化常量 `0x00400c0000000100` ，结果—— **一无所获**。

这就是第一个误判的起点，先记在这里，后面"中途自证"里专门复盘。

### 5.3 四个 i32 常量，让真相浮出水面

Ascon 的常量找不到，我却发现了另一组更眼熟的数字。ChaCha20 流加密的初始状态，用固定常量 `"expand 32-byte k"` 开 4 个字，编译成 wasm 后是四个 `i32.const` 。我在 WAT 里搜这四个整数值， **全部精确命中**：

| 常量  | 字节（小端） | i32 值 | 出现次数 |
| --- | --- | --- | --- |
| `"expa"` | `0x61 0x70 0x78 0x65` | `1634760805` (0x61707865) | 10  |
| `"nd 3"` | `0x6e 0x64 0x20 0x33` | `857760878` (0x3320646e) | 2   |
| `"2-by"` | `0x32 0x2d 0x62 0x79` | `2036477234` (0x79622d32) | 10  |
| `"te k"` | `0x74 0x65 0x20 0x6b` | `1797285236` (0x6b206574) | 2   |

这四个字串起来就是 **`"expand 32-byte k"`**，ChaCha20 的标志性初始化常量，铁证如山。搜索方式也很直白，就是把字符串转成小端整数再 grep：

```bash
# "expa" = 0x61707865 = 1634760805
grep -c "const 1634760805" fe_sign.wat   # → 10
grep -c "const 857760878"  fe_sign.wat   # → 2   ("nd 3")
grep -c "const 2036477234" fe_sign.wat   # → 10  ("2-by")
grep -c "const 1797285236" fe_sign.wat   # → 2   ("te k")
```

（对比一下：字符串形式 `expa` 在 wasm 二进制里 **0 次**，因为它被编译成了整数常量，不是字符串；而 `ascon` 是 **1 次**，因为它是 data segment 里的明文。这个反差本身就是个很好的判别技巧。）

所以真相是： **内部算法是 ChaCha20 流加密，而 key 字符串里那个 `ascon` 是作者放的烟雾弹** （也可能只是 key 命名 `js-<域名>-ascon` 的历史遗留，不代表算法）。key 本体是 `js-.example-ascon` ，18 字节——注意，这 **不是** 标准 ChaCha20 的 32 字节 key，说明它是变体或有 key 派生，这点我到最后也没完全还原，下面边界里会诚实交代。

### 5.4 为什么及时止损

这条死路的结论： **逆 wasm 内部能把算法家族定性成 ChaCha20，但要从 901KB 的 WAT 里把 key 派生、nonce 布局、counter 初始化、base64 封装整条链还原成纯 JS，成本极高，且完全没必要**——因为黑盒补环境已经能稳定产出正确签名了。

想通这一点，我掉头就走。这里的判断标准很朴素： **目标是"拿到能用的签名"，不是"写一篇密码学论文"**。定性出 ChaCha20 是好奇心，复现出签名才是交付。

* * *

## 中途一次自证：两个把自己带沟里的误判

这一节单独拎出来，因为这两个坑最容易被后来者再踩一遍。

### 误判一：Ascon 还是 ChaCha20

> **教训：别拿字符串当算法证据。** `ascon` 出现在字符串里，只能说明有个字符串叫 ascon，不能说明算法是 Ascon。真正能定性的，是那些编译进代码段、不以字符串形态存在的魔数（比如 ChaCha20 的四个 i32 常量）。反过来也成立——一个算法真正的特征，藏在它编译后的机器码里，而不是作者想让你看到的字符串里。

### 误判二：124 字符和 100 字符，我以为自己"少算了 18 字节"

这个坑更隐蔽，也更典型。

一开始我手上有 7 条真实抓包样本（ `sigs.txt` ），长度清一色是 **124 字符**。而我自己的实现吐出来的是 **100 字符**。124 − 100 = 24 字符 ≈ 18 字节，我第一反应是"我是不是漏了一段固定字段"，于是反复查环境、查拼接，自我怀疑了很久。

直到我做了一次消融实验。先老老实实把样本的长度分布打印出来：

```bash
$ python analyze.py
样本数: 7
  len=124 × 7
长度分布: [124]
```

再拿自己的实现对一个 **确定长度** 的 URL 签一次：

```python
len = 100
M-S = vXo5ihXchvKJ__QbuN2YvZmbtJVVthTQv1mMSVVLjh2a0IDM2MDM2YDO5EURaVFOahDOtQEO3IDT3UVWhYlVSd2dSJVTSJ1dnxDP
```

问题出在哪？ **`M-S` 的长度本来就是 URL 长度的函数，不是常数。** 明文 = 固定 53 字节开销 + URL 字节数，再 base64 一下：

```python
M-S 字符数 = (53 + url_len) / 3 * 4
```

对照一下就全通了：

| URL 长度 | 明文字节 | base64 字符 |
| --- | --- | --- |
| 22（ `/api/v1/stalls/preview` ） | 75  | **100** |
| 25  | 78  | 104 |
| 28  | 81  | 108 |
| 37  | 90  | 120 |
| 40  | 93  | **124** |

`preview` 接口是 22 字节 → 100 字符； `sigs.txt` 那 7 条全是 40 字节的 URL → 124 字符。 **根本不是同一个接口的样本，我却拿它们当基准对比，当然对不上。** 这 18 字节的"差异"从头到尾是我自己造的假警报。

> **教训：做任何"我的输出对不对"的判断之前，先确认两边的输入是否真的同构。** 长度对不上，先查 URL 长度，再查固定开销，别一上来就怀疑自己的实现漏了东西。

* * *

## 第六回合：Node 补环境，四行 mock 决定成败

回到正路。黑盒方案的核心就一句话： **不还原 wasm 内部，只把 wasm 依赖的浏览器环境 mock 出来，让它照常跑。**

`sign_tool.js` 的整体结构是三层：

```python
① Mock 浏览器环境（document / navigator / crypto）
② wasm-bindgen 胶水层（42 个 __wbg_* import 的 Node 实现）
③ SignTool 封装（加载 wasm → sign(path, ts) → 返回 M-S）
```

### 6.1 补环境骨架

先搭环境。wasm-bindgen 的胶水层需要一个"对象堆"，把 JS 对象映射成 wasm 能看懂的 i32 句柄，标准做法是：

```javascript
const heap = [undefined, null, true, false];   // 前 4 个是保留槽位
function addHeapObject(obj) { heap.push(obj); return heap.length - 1; }
function getObject(idx) { return heap[idx]; }
```

然后 mock 三个环境对象：

```javascript
const FAVICON_HREF = "https://js-assets.example.com/assets/legacy/favicon.ico";

// document：只认 favicon 和 keywords 两个选择器
const fakeDocument = {
  querySelector(sel) {
    if (sel === "link[rel*='icon']") return makeElement({ href: FAVICON_HREF });
    if (sel === "meta[name='keywords']") return makeElement({ content: KEYWORDS_CONTENT });
    return null;
  },
};

// navigator：webdriver 必须是只读的
const mockNavigator = Object.create(null);
Object.defineProperty(mockNavigator, "webdriver", {
    value: false, writable: false, configurable: false, enumerable: true
});

// crypto：用 Node 的 crypto 顶 getRandomValues
const mockCrypto = { getRandomValues(arr) { crypto.randomBytes(arr.length).copy ? null : null; return arr; } };
```

### 6.2 补环境跑通，踩了四个坑

补环境能跑通，是靠四个坑一个个踩过去的。每个坑都对应 wasm 的一处环境检测，踩错一个就是 panic。

**坑 1： `navigator.webdriver` 必须真只读。**

```javascript
// 错：普通对象，Reflect.set 返回 true → wasm 判为自动化环境，panic
const mockNavigator = { webdriver: false };

// 对：defineProperty 设为不可写，Reflect.set 返回 false → 通过检测
const mockNavigator = Object.create(null);
Object.defineProperty(mockNavigator, "webdriver", {
    value: false, writable: false, configurable: false, enumerable: true
});
```

原理回到第三回合那条 trace：wasm 用 `Reflect.set(navigator, "webdriver", true)` 探测，普通对象会写入成功（返回 true），被判定为假环境；只有原生只读 getter 才会返回 false。这个坑踩中的现象是 **直接 panic**，报错里根本没有"webdriver"字样，只能靠 trace 日志反推。

**坑 2：别污染 `global` 。**

```javascript
// 错：污染全局，wasm 的 SELF/WINDOW/GLOBAL_THIS 访问会拿到不一致的对象
global.Window = MockWindow;
global.window = mockWindow;

// 对：只在 imports 层返回 mockWindow，不碰真实 global
imports.wbg.__wbg_static_accessor_WINDOW = () => addHeapObject(mockWindow);
imports.wbg.__wbg_static_accessor_SELF   = () => addHeapObject(mockWindow);
imports.wbg.__wbg_static_accessor_GLOBAL_THIS = () => addHeapObject(mockWindow);
```

为什么？设了 `global.window` 之后，wasm 里 `typeof self` 、 `instanceof Window` 这类检测会走错分支——它以为自己在浏览器里，拿到的却是一个结构和预期不一致的对象，后续调用链断裂。补环境的黄金法则是： **mock 只存在于 imports 这个边界上，永远不要去污染真实的 globalThis。**

**坑 3：必须藏掉 Node 的 `process` 。**

wasm-bindgen 生成的 crypto 初始化有两条路径：检测到 `process.versions.node` 就走 `require("crypto").randomFillSync` （Node 路径），检测不到才走 `globalThis.crypto.getRandomValues` （浏览器路径）。Node 路径里 `randomFillSync` 往 wasm 内存视图写数据时会崩。所以这些 import 全部返回 0，逼它走浏览器路径：

```javascript
imports.wbg.__wbg_static_accessor_PROCESS_2c90d3b3264f2c90 = () => 0;
imports.wbg.__wbg_process_5c1d670bc53614b8 = () => 0;
imports.wbg.__wbg_versions_c71aa1626a93e0a1 = () => 0;
imports.wbg.__wbg_node_02999533c4ea02e3 = () => 0;
imports.wbg.__wbg_require_79b1e9274cde3c87 = () => 0;
```

**坑 4：签名输入只给 path，别带 query。**

这个在第四回合埋过，这里再强调一次： `sign("/api/v1/stalls/preview", ts)` ，而不是带 `?topic_count=4` 的完整 URL。带 query 签出来的 M-S 是错的，服务端不认。

### 6.3 最终 sign 封装

补环境调通后，封装就水到渠成了：

```javascript
sign(url, timestamp) {
    const stackPtr = wasm.__wbindgen_add_to_stack_pointer(-16);
    try {
        const { ptr, len } = passStringToWasm(url, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        wasm.signtool_sign(stackPtr, this.ptr, ptr, len, timestamp);
        // 从 stackPtr 读回 (结果指针, 长度, 异常对象, 是否有异常)
        // ... 有异常就 throw，否则解码返回
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_3(retPtr, retLen, 1);   // 释放 wasm 侧的字符串
    }
}
```

到这里，补环境这条路彻底走通。剩下的就是验证。

* * *

## 结果：真实输出，一次命中，双 wasm 交叉验证

补环境调通后，对 `preview` 接口签一次：

```python
len = 100
M-S = vXo5ihXchvKJ__QbuN2YvZmbtJVVthTQv1mMSVVLjh2a0IDM2MDM2YDO5EURaVFOahDOtQEO3IDT3UVWhYlVSd2dSJVTSJ1dnxDP
```

光有一份输出还不够，得证明它不是"看起来像"而是"真的对"。我做了两件事。

**第一，和一份独立实现对固定字段。** 另一个来源（同样补环境、但用的是 sha256 不同的另一个 wasm 构建）对同一个 `/api/v1/stalls/preview` 签出来的是：

```python
185lDw8l7veT__QbuN2YvZmbtJVVthTQv12cSJVLjh2a0IDM2ITOzYTOwEURaVFOahDOENWXSN3YnVlWrZlVSd2dSJVTSZDdVxDP
```

同一 URL、不同时间戳、不同随机数下，两串里有一段恒定不变的长子串，这就是"算法没跑偏"的铁证：

| 固定片段 | 说明  |
| --- | --- |
| `__QbuN2YvZmbtJVVthTQv1` | 同一 URL 下恒定不变（随机数/时间戳怎么变它都不动） |
| `Ljh2a0IDM2I` | 同上  |
| `EURaVFOahD` | 同上  |

**第二，直接发真实请求。** 带上和前端一致的 headers 打过去：

```python
[+] Status: 200
[+] Response: { "stall_preview": { "stall_topics": [ { "id": 263, "name": "软糯QQ人6月刊！", ... } ] } }
```

服务端返回 **200**，数据正常拿到，签名验证通过。

两个补充事实，都指向同一个结论：我用的 `fe_sign.wasm` （sha256 `972bf383…` ）和独立复核用的 `fe_sign_bg.DLpTGLRB.wasm` （sha256 `2a2bb49c…` ） **字节不同，却产出相同固定字段、都能通过服务端校验**——说明站点前后端是同一套算法、只是前端构建版本不同，补环境的复现是稳定的，不是撞运气。到此， `M-S` 签名在 Node 里零浏览器、零登录态地复现完成。

* * *

## 诚实边界：我到底还原到了哪一层

这一节必须说清楚，避免误导：

**做到了**

-   在 Node.js 里 **黑盒复现** 签名：任意 path + 时间戳 → 正确 `M-S` ，可离线、可批量、无浏览器。
-   定性了内部算法： **ChaCha20 流加密** （四常量铁证），不是 Ascon。
-   定位了 key 字符串 `js-.example-ascon` （18 字节，在 wasm data segment）与全部环境依赖清单。

**没做到 / 存疑**

-   **没有把 ChaCha20 完整还原成纯 JS/Python 算法。** 最终方案是"加载原 wasm 黑盒跑"，不是"手写一个等价的加密函数"。这意味着复现依赖原 wasm 文件本身。
-   key `js-.example-ascon` 只有 **18 字节**，而标准 ChaCha20 是 32 字节 key，说明这里存在 **key 派生 / 填充 / 变体**，这条链我没拆到底。
-   签名里 53 字节固定开销的内部布局（nonce 放哪、counter 怎么初始化、如何拼接再 base64）没有逐字节还原——因为黑盒方案不需要知道这些就能产出正确结果。

一句话： **我拿到的是"能用的签名生成器"，不是"签名算法的完整数学重构"。** 前者够用，后者是另一个量级的工程。

* * *

## 复盘：真正的转折点有两个

**转折点一：把"逆 wasm 内部"从"目标"降级成"手段"。** 一开始总想"还原算法 = 把 wasm 拆开看明白"，结果在 901KB 的 WAT 里越陷越深。真正让我走通的是换了个问题——不问"它内部怎么算"，只问"它从环境里吃了什么、又吐了什么"。这两个问题答案一样能让我拿到正确签名，成本却差一个数量级。

**转折点二：先搞清楚"样本对应什么 URL"，再谈长度对不对。** 124 vs 100 那 18 字节的假警报，本质是 **拿错了基准**——把不同接口的样本当成同一接口来对比。做任何"我的输出对不对"的判断之前，先确认两边的输入是否真的同构。

> 留一句给同行：逆向里最贵的不是看不懂的代码，是 **自己造出来的假问题**。误判算法、误判长度，这两个坑都不是难在技术，是难在"先入为主之后不愿意回头验证"。每次自我怀疑之前，先做一个单变量的消融实验，把怀疑的对象钉死再动手。

* * *

## 后续可做

-   **完整还原 ChaCha20 变体**：补齐 key 派生方式（18 字节 → 32 字节的 pad/derive 规则）、nonce 与 counter 布局、base64 封装顺序，写出不依赖原 wasm 的纯算法实现。难度中等，纯体力活。
-   **通用化补环境脚本**：把这次的 wasm-bindgen 胶水层适配做成模板，遇到同类"Rust→wasm 签名"能直接套。
-   **反自动化检测的完整清单**：这次看到的是 `webdriver` 只读检测 + favicon 指纹 + `process` 探测，站点还可能有 `instanceof Window` 等，值得系统整理成一份"wasm 环境检测特征库"。
