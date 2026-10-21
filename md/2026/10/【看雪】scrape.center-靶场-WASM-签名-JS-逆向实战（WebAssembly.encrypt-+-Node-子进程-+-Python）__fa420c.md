---
title: 【看雪】scrape.center 靶场 WASM 签名 JS 逆向实战（WebAssembly.encrypt + Node 子进程 + Python）
source: https://bbs.kanxue.com/thread-293283.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-21T08:01:17+08:00
trace_id: 16e5d447-da29-4ca8-a434-b981fd7f32ae
content_hash: 1c0922dd7ea1ef8d5180ad5b7913a3b29826fcde96c65621c5d1446937ad5ca1
status: synced
tags:
  - 看雪
  - WebAssembly逆向
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: WASM 签名的实现路径：把站点的 Wasm.wasm 下载到本地，用 Node 的 WebAssembly.instantiate 加载它，调用其中导出的 encrypt(offset, 秒级时间戳) 计算 sign，再由 Python 启动 Node 取回签名并请求接口。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40075244-d011-818c-ad23-c081a1ab8121
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WASM 签名的实现路径：把站点的 Wasm.wasm 下载到本地，用 Node 的 WebAssembly.instantiate 加载它，调用其中导出的 encrypt(offset, 秒级时间戳) 计算 sign，再由 Python 启动 Node 取回签名并请求接口。
> 
> - **签名来源：** spa14 接口的 `sign` 由 `/js/Wasm.wasm` 导出的 `encrypt(offset, timestamp)` 算出，不是 MD5/HMAC；翻页时 `offset=(page-1)*10`。
> - **本地实例化：** Node 用 `fs.readFileSync` 读二进制传给 `instantiate`，imports 只给空 `env` / `wasi_snapshot_preview1`；该 wasm 仅 232 字节、无导入表、纯函数，无需补浏览器环境。
> - **Python 桥接：** `subprocess.check_output(["node","../js/scrape.js",页码], cwd="../js")` 取签名；cwd 与 `readFileSync('Wasm.wasm')` 的相对路径必须对齐，否则找不到文件。
> - **输出时序坑：** `get_arg` 是 async 但内部用 `.then` 未 await，会先打印 `undefined` 再打印 JSON，文中用 `split('undefined\n')[1]` 解析，写法脆弱，建议改成固定前缀（如 `SIGN=`）输出。
> - **其他注意：** 必须先运行 `get_wasm.py` 下载 wasm；`.wasm` 属二进制，不要手改字节，应原样加载只调导出函数；若遇到带导入表的 wasm，需按签名补 importObject。

> 本文是「JS 逆向实战 30 例」系列第 13 篇，项目源码：JS 逆向实战 30 例 · 开源仓库 （ `Project13` ）

## 一、目标与背景

`scrape.center` 是公认的爬虫练习靶场，其中 `spa14` 这一关专门用来练 **WASM 签名**。接口参数里带一个 `sign` ，它不是常规的 MD5/HMAC，而是把原始数据交给一个 `.wasm` 里的函数算出来的。因为是入门靶场，难度不高，但它是打通「**下载 wasm → Node 实例化 → 调用导出函数 → 交给 Python**」这条链的最佳练手。

我把思路定为：把站点那个 `Wasm.wasm` 抠下来本地加载，用 Node 的 `WebAssembly.instantiate` 实例化，调用它导出的 `encrypt(offset, timestamp)` 得到 `sign` ，再由 Python 用 `subprocess` 起 Node、拿回签名去请求。

-   站点： `https://spa14.scrape.center/page/3`
-   目标接口： `https://spa14.scrape.center/api/movie/` （GET）
-   需还原字段： `offset` 、 `sign` （**WASM**）
-   难度：⭐⭐（WASM 入门 + Node/Python 桥接）

| 参数  | 含义  |
| --- | --- |
| `limit` | 每页数量，固定 10 |
| `offset` | `(page-1)*10` ，翻页偏移 |
| `sign` | wasm 导出函数算出的签名 |

## 二、抓包分析

打开 `https://spa14.scrape.center/page/3` ，F12 看 Network，翻页时抓到：

```python
GET https://spa14.scrape.center/api/movie/?limit=10&offset=20&sign=xxxxxx
```

`offset` 一眼是 `(page-1)*10` ； `sign` 是一串没有明显规律的字符。全局搜 `sign` 会命中页面 JS 里加载 wasm 的代码，说明签名来自 WASM。同时 Network 里能看到站点请求了 `https://spa14.scrape.center/js/Wasm.wasm` ——这就是我们要下载的目标。

【图1：抓包看到 /api/movie/?limit=10&offset=20&sign=... —— 建议截图】

## 三、定位加密入口

在 Sources 里搜 `instantiate` / `sign` ，定位到大致这样的逻辑：

```javascript
// 站点前端逻辑（示意，重点看它如何用 wasm 出 sign）
const wasmCode = fetch("/js/Wasm.wasm");
WebAssembly.instantiateStreaming(wasmCode, { env: {}, wasi_snapshot_preview1: {} })
    .then(result => {
        const sign = result.instance.exports.encrypt(offset, timestamp);
        // 请求带上 offset 与 sign
    });
```

关键就一句： `exports.encrypt(offset, timestamp)` 。也就是说，只要本地能实例化这个 wasm，就能复现 `sign` 。项目的 `js/scrape.js` 正是把它搬到了 Node：

```javascript
// 取自 js/scrape.js —— Node 里实例化并调用 wasm
const fs = require("fs");

async function get_arg(page){
    var n = (page - 1) * 10
    var t = parseInt(Math.round((new Date).getTime() / 1e3).toString())   // 秒级时间戳
    const wasmCode = fs.readFileSync('Wasm.wasm');                        // ★ 读本地 wasm
    WebAssembly.instantiate(wasmCode, {
        "env": {},
        "wasi_snapshot_preview1": {}
    }).then(data=>{
        const sign = data.instance.exports.encrypt(n, t)                  // ★ 调导出函数
        offset = n
        li = {}
        li["offset"] = n
        li["sign"] = sign
        console.log(JSON.stringify(li))
    })
}

async function run(page){
    const data = await get_arg(page)
    console.log(JSON.stringify(data))
}

run(parseInt(process.argv[2]))
```

可以注意到两件事：

1.  `instantiate` 的 imports 是空的 `env` / `wasi_snapshot_preview1` ，说明这个 wasm 很轻，没有依赖宿主的导入函数；本项目里 `Wasm.wasm` 只有 **232 字节**，是个「教学版」WASM。
2.  `encrypt(n, t)` 的两个入参分别是 `offset` 和 **秒级时间戳**，所以签名跟时间有关，每次翻页都会变。

【图2：Sources 里断到 `exports.encrypt(offset, timestamp)` 一行 —— 建议截图】

> 配图提示：本项目自带 wasm 二进制，路径是 `Project13/scrape/js/Wasm.wasm` ，可以直接用十六进制编辑器打开截图作为配图。

## 四、JS 还原与补环境

WASM 场景其实「无需补环境」—— `WebAssembly` 是 Node 原生支持的（Node ≥ 8 即可），只要用 `fs.readFileSync` 读二进制交给 `instantiate` 就行，不需要模拟浏览器。真正要处理的是两个小坑：

-   **相对路径**： `fs.readFileSync('Wasm.wasm')` 是相对 **进程 cwd** 的，所以调用时要保证 cwd 落在 `js/` （本项目 Python 用 `cwd="../js"` 起了 Node）。
-   **异步时序**： `get_arg` 是 `async` ，但它内部用 `.then` 包了 `instantiate` ，并没有 `await` ； `run` 里 `await get_arg(page)` 拿到的是 `undefined` ，于是先打印了一行 `undefined` ，随后 wasm 的 `.then` 回调才打印真正的 JSON。输出顺序变成 `undefined` 在前、JSON 在后——这也是 Python 侧解析要注意的点（见第五节）。

本项目的 wasm 是纯函数，没有 `WebAssembly.Memory` 交互、没有导入表，所以「抠下来直接跑」即可，没有复杂的补环境需求。

## 五、Python 实现

分两步：先下载 wasm，再用 Node 算签名并请求。

**① 下载 wasm** （ `py/get_wasm.py` ）：

```python
# 取自 py/get_wasm.py
import requests

def wasm() -> None:
    headers = {
        "Accept": "*/*",
        "Referer": "https://spa14.scrape.center/page/3",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    }
    url = "https://spa14.scrape.center/js/Wasm.wasm"
    response = requests.get(url, headers=headers)
    with open("../js/Wasm.wasm", "wb") as f:      # ★ 存到 js/ 下供 Node 加载
        f.write(response.content)
        print("wasm 下载完毕")
```

**② 算签名 + 请求** （ `py/scrape.py` ）：

```python
# 取自 py/scrape.py
import requests
import subprocess, json

# ★ 起 Node，cwd 指到 js/，取 stdout 里 undefined 之后的那段 JSON
out = subprocess.check_output(["node", "../js/scrape.js", "5"], cwd="../js").split('undefined\n')[1].split('\n')[0]
result = json.loads(out)

headers = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://spa14.scrape.center/page/3",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
}
url = "https://spa14.scrape.center/api/movie/"
params = {
    "limit": "10",
    "offset": result['offset'],
    "sign": result['sign']
}
print(params)
response = requests.get(url, headers=headers, params=params)

print(response.text)
print(response)
```

这里 `"5"` 是页码，Node 里 `encrypt((5-1)*10, ts)` 会算出对应 `offset=40` 的签名。

## 六、运行结果

先跑 `get_wasm.py` 下载（终端打印「wasm 下载完毕」），再跑 `scrape.py` 。终端会先打印参数（含算出来的 `offset` / `sign` ），随后打印电影列表 JSON：

```python
wasm 下载完毕
{'limit': '10', 'offset': 40, 'sign': 'xxxxxx'}
{"count":100,"results":[{"id":...,"name":"...","alias":"...","cover":"...","categories":[...]}, ...]}
<Response [200]>
```

服务端接受签名即返回数据；签名错则会返回 `sign` 校验失败。

【图3：终端打印 offset/sign 并拿到电影列表 —— 建议截图】

## 七、踩坑与注意

1.  **先下载 wasm**： `scrape.py` 依赖 `js/Wasm.wasm` ，没先跑 `get_wasm.py` 会因为读不到文件直接报错。
2.  **`split('undefined\n')[1]` 这个解析方式很脆弱**：它依赖「 `undefined` 先被打印、真 JSON 在后」这个时序。如果日后改写了 `scrape.js` （比如给 `get_arg` 加 `return` ），这段解析就会失效。更稳的做法是让 JS 输出带固定前缀（例如 `SIGN=...`）再解析。
3.  **cwd 很重要**： `subprocess` 用了 `cwd="../js"` ，同时 `fs.readFileSync('Wasm.wasm')` 也是相对路径，两边必须对齐，否则找不到 wasm。
4.  **时间戳参与签名**： `t` 是秒级时间戳， `sign` 与它绑定；如果要复现某次真实请求，记得同步时间。
5.  **Node 版本**： `WebAssembly.instantiate` 在 Node 8+ 都有，基本无门槛；但若 wasm 需要导入表（本例不需要），就要按导出/导入签名补出 `importObject` 。
6.  **别把 wasm 当黑盒乱改**：`.wasm` 是二进制，改字节很容易破坏结构；正确姿势是「原样加载、只调导出函数」。

## 八、总结

WASM 逆向的第一层，不是逆指令，而是 **读懂「谁在调 `exports.xxx` 、入参是什么」**。只要能把 `.wasm` 拿下来用 `WebAssembly.instantiate` 跑通、按原参数调用导出函数，就能在没有浏览器的情况下复现签名。 `scrape` 靶场把 `encrypt(offset, timestamp)` 写得清清楚楚，是练这条「下载 → 实例化 → 调用」链路最好的起点。

* * *
