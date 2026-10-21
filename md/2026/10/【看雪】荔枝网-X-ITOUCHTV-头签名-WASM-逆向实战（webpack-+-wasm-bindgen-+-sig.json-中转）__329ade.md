---
title: 【看雪】荔枝网 X-ITOUCHTV 头签名 WASM 逆向实战（webpack + wasm-bindgen + sig.json 中转）
source: https://bbs.kanxue.com/thread-293284.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-21T08:01:46+08:00
trace_id: ec606fee-bab2-44e3-9bda-defa94a8b96f
content_hash: 01954b2a2404d8ae8f5a0f184cb4b9fcd83c51b32e690160a00b5a2b8aeba526
status: synced
tags:
  - 看雪
  - 协议分析
  - 模拟执行
series: null
feed_source: 看雪·逆向工程
ai_summary: 不抠wasm指令，而是补环境跑通webpack bundle，用全局回调`__SIG_SAVE__`把wasm生成的签名头导出到`sig.json`，Python读文件拼头即可请求荔枝网资讯接口。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40075244-d011-81cc-8e9b-f37e0d332fa0
ioc:
  cves: []
  cwes: []
  hashes:
    - "89541943007407288657755311868534"
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 不抠wasm指令，而是补环境跑通webpack bundle，用全局回调`__SIG_SAVE__`把wasm生成的签名头导出到`sig.json`，Python读文件拼头即可请求荔枝网资讯接口。
> 
> - **定位信号：** 全局搜不到 `Ca-Key` 字面量，因为签名头是 WASM 执行后返回的整个 header Map；调用链为 `callApi → S() → m(wasm)`，取设备 ID 的优先级是 `t.__DEVICEID__ || getDeviceId() || ""`。
> - **WASM 形态：** wasm 以 `data:application/wasm;base64,...` 内联在 `vendor_w_*.js` 中，由 wasm-bindgen 的 `initSync` 自行解码，无需找独立 `.wasm` 文件；导入对象会读取 `document.location.host`、日期、时区偏移等宿主信息，因此必须有环境才能跑。
> - **关键字段：** 需还原 `X-ITOUCHTV-CLIENT`（固定 `WEB_PC`）、`DEVICE-ID`（`WEB_<uuid>`）、`Ca-Timestamp`（毫秒数字）、`Ca-Key`、`Ca-Signature`（base64）。
> - **落盘实现：** `main.js` 补 `document/location/navigator/screen` 与真实 Cookie，`__SIG_SAVE__` 用 `path.join(__dirname,'sig.json')` 写文件后 `process.exit(0)`；Python 侧 `subprocess` 调 `node main.js <url> <params-json>` 再读 JSON。
> - **易错点：** `Ca-Timestamp` 是数字，requests 头值必须 `str(v)` 转换；签名掺入 `DEVICEID`，换设备或清 Cookie 后旧头立即失效需重新生成；chunk 约 5.2MB，首次运行较慢。

> 本文是「JS 逆向实战 30 例」系列第 14 篇，项目源码：JS 逆向实战 30 例 · 开源仓库 （ `Project14` ）

## 一、目标与背景

荔枝网（广东广播电视台， `http://www.gdtv.cn` ）的资讯接口，请求头带了一整组 `X-ITOUCHTV-*` 签名头。这组头由站点前端的一个 **webpack bundle** 生成，其中的核心算法被打包进一个 **Rust + wasm-bindgen** 编译出来的 WASM 模块（以 base64 data-URL 形式内联在 `vendor_*.js` 里）。这是一个「大前端 + WASM」的组合样本，难度比裸 wasm 高：算法藏在 webpack 模块和 wasm 两层里，还绑定了设备 Cookie。

我的还原路线不是去抠 wasm 指令，而是： **补环境跑通它的 webpack bundle，直接调用其 `callApi` ，让它在生成请求头时把结果写进一个 `sig.json` ，Python 读文件拼头**。这也是仓库里的真实做法。

-   站点： `https://www.gdtv.cn/`
-   目标接口： `https://gdtv-api.gdtv.cn/api/channel/v1/news` （GET）
-   需还原字段： `X-ITOUCHTV-CLIENT` 、 `X-ITOUCHTV-Ca-Key` 、 `X-ITOUCHTV-Ca-Signature` 、 `X-ITOUCHTV-Ca-Timestamp` 、 `X-ITOUCHTV-DEVICE-ID` （**WASM 头签名**）
-   难度：⭐⭐⭐⭐（5.2MB chunk + 内联 WASM + 设备 Cookie）

| 请求头 | 含义  |
| --- | --- |
| `X-ITOUCHTV-CLIENT` | 固定 `WEB_PC` |
| `X-ITOUCHTV-DEVICE-ID` | 设备 ID，形如 `WEB_<uuid>` |
| `X-ITOUCHTV-Ca-Timestamp` | 毫秒时间戳（**数字**，别当字符串） |
| `X-ITOUCHTV-Ca-Key` | wasm 生成的 key |
| `X-ITOUCHTV-Ca-Signature` | wasm 生成的签名（base64） |

## 二、抓包分析

打开 `https://www.gdtv.cn/` ，在资讯流里翻页，筛 `gdtv-api.gdtv.cn/api/channel/v1/news` ，抓到：

```python
GET https://gdtv-api.gdtv.cn/api/channel/v1/news?beginScore=0&channelId=108&pageSize=11
accept: application/json, text/plain, */*
referer: https://www.gdtv.cn/
X-ITOUCHTV-CLIENT: WEB_PC
X-ITOUCHTV-DEVICE-ID: WEB_xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
X-ITOUCHTV-Ca-Key: 89541943007407288657755311868534
X-ITOUCHTV-Ca-Timestamp: 1790128990186
X-ITOUCHTV-Ca-Signature: FS/ayGRdZkksFlg5k0aeQWrrSqOcajVPfDuRMudz+bg=
```

`Ca-Key` / `Ca-Signature` / `Ca-Timestamp` 三者都随请求变化（含时间戳）， `Ca-Signature` 是 base64，明显是签名。全局搜 `Ca-Key` 搜不到字面量——因为它不是拼在 JS 里，而是 **WASM 执行后返回的一整个 header Map**。这就是判断「算法在 WASM 里」的关键信号。

另一个关键点是 `DEVICE-ID` ：它是设备 Cookie（ `DEVICEID` ）派生出来的，抓包时浏览器 cookie 里能看到。仓库里已把 cookie 脱敏为 `你的cookie(DEVICEID=...; UM_distinctid=...; CNZZDATA...)` 。

【图1：抓包看到 X-ITOUCHTV-\* 一组头，圈出 Ca-Key/Ca-Signature —— 建议截图】

## 三、定位加密入口

站点资源很大： `main.js` （约 139KB）、 `chunk.js` （约 5.2MB）、 `vendor_w_5f98e7de.js` （约 698KB）。全局搜 `callApi` ，定位到主入口模块 `713` ：

```javascript
// 取自 js/chunk.js 模块 713 —— callApi 出口
"713": function (t, e, n) {
    "use strict";
    var r = n(13), o = r(n(15)), i = r(n(21)), a = n(38), u = r(n(1332)), c = r(n(726));
    e.callApi = function (e, n, r, i) {
        var s = r && "GET" !== n.toUpperCase() ? JSON.stringify(r) : "";
        e = /* GET 时把 params 拼到 url */;
        var l = t, ...;
        return (0, c.default)(n, e, s).then(function (t) { ... });
    }
}
```

而真正生成签名头的，是同 bundle 里一个 `S` 函数（授权/签名逻辑），它内部会调一个被 wasm 驱动的 `m()` 来产出 headers Map：

```javascript
// 取自 js/chunk.js —— 生成请求头（含 wasm 计算的签名头）
function S() {
    return S = /* async wrapper */(function e(n, o) {
        var a, u, c, s, f, h, d, v, g = arguments;
        return /* ... */ (function (e) {
            case 0:
                return c = g.length > 2 && void 0 !== g[2] ? g[2] : "",
                    s = l.default.getUser,
                    f = l.default.getJWT,
                    h = l.default.getDeviceId,
                    d = t.__DEVICEID__ || h() || "",
                    e.next = 8,
                    m(n, o, d, "WEB_PC", c, /* SSR_API_SCOPE */);   // ★ m() 调 wasm 产出签名头
            case 8:
                return e.t3 = e.sent,
                    e.t4 = (0, e.t2)(e.t3),                          // t2 = w()：Map -> object
                    v = (0, e.t0)(e.t1, e.t4),
                    f() && (v.Authorization = f()),
                    s() && s().pk && (v["X-ITOUCHTV-USER-PK"] = s().pk),
                    e.abrupt("return", v);
        })
    });
}
```

`m()` 的下游就是那个 **wasm-bindgen** 模块。 `vendor_w_5f98e7de.js` 里能看到它的典型痕迹： `initSync` 、 `greet` 、以及把 wasm 以 base64 内联：

```javascript
// 取自 js/vendor_w_5f98e7de.js —— wasm-bindgen 加载与执行
B.initSync = function (A) {
    if (void 0 !== w) return w;
    var g = t();                                            // 导入对象
    A instanceof WebAssembly.Module || (A = new WebAssembly.Module(A));
    return O(new WebAssembly.Instance(A, g), A);
};
// ...
w.greet(B, Q, C);                                          // 调用 wasm 导出函数
var E = s()[B/4+0], D = s()[B/4+1];
return g = E, I = D, K(E, D);                              // 从 wasm memory 读回字符串
```

```javascript
// wasm 以 data URL 内联（片段）
void 0 === I && (I = "data:application/wasm;base64,AGFzbQEAAAABmgIlYAJ/fwBgAn9/AX9g...");
```

导入对象里还偷偷用了浏览器 API（ `Window` 、 `document.location.host` 、 `new Date` 、 `TimezoneOffset` ），说明 **这份 wasm 会读运行环境的宿主信息参与签名**——这也是为什么不能把它当纯函数、必须补环境跑。

【图2：在 `chunk.js` 里搜 `callApi` / `WEB_PC` ，或在 `vendor_*.js` 里看 wasm-bindgen 的 `initSync` —— 建议截图】

## 四、JS 还原与补环境

`main.js` 的角色是「补环境 + 加载 bundle + 把结果落盘」。它开头就补了 `document` / `location` / `navigator` / `screen` 并带上真实 Cookie 与设备信息：

```javascript
// 取自 js/main.js —— 顶部补环境
var NAX;

window = global
window.RES;
self = window
self.self = window

document = {
    "URL": "https://www.gdtv.cn/404",
    "domain": "www.gdtv.cn",
    "cookie": "你的cookie(DEVICEID=...; UM_distinctid=...; CNZZDATA...)",
    "readyState": "loading",
    "title": "荔枝网",
    "visibilityState": "visible",
    // ...（一长串浏览器 document 字段）
}
document.all = { "length": 31 }
document.createElement = function (s) {
    if (s === "script") {
        res = { "src": "", "type": "", "async": true, "defer": false, "text": "", /* ... */ }
        return res
    }
}
```

bundle 是在文件尾部初始化（webpack 运行时 `a.p = "https://img.gdtv.cn/sitecdn/platforms/gdtv/"` ， `window.webpackJsonp` 那套），最后作者用两招收口： **劫持一个 `global.__SIG_SAVE__` 回调，把签名头写进 `sig.json` ；再调用 `callApi` 触发一次**：

```javascript
// 取自 js/main.js —— 落盘 + 入口
OSX = function (e) { return e && e.__esModule ? e : { default: e } }

global.__SIG_SAVE__ = function (res) {
    require('fs').writeFileSync(
        require('path').join(__dirname, 'sig.json'),           // ★ 用 __dirname，避免写死路径
        JSON.stringify(Object.fromEntries(res), null, 2)       // res 是 headers Map -> 转普通对象
    );
    process.exit(0);
};

function run(url, params) {
    return OSX(NAX("713")).callApi(url, "GET", params, undefined);
}

var __url = process.argv[2];
var __params = process.argv[3] ? JSON.parse(process.argv[3]) : undefined;
run(__url || "https://gdtv-api.gdtv.cn/api/channel/v1/news", __params);
```

在 `chunk.js` 里，签名头 Map 生成后有一段钩子：

```javascript
// 取自 js/chunk.js —— 生成签名头后回调落盘
a = o.a;
res = a.apply(void 0, u);
if (global.__SIG_SAVE__) {
    global.__SIG_SAVE__(res);       // ★ main.js 里把它指向写 sig.json
    process.exit(0);
}
return t.abrupt("return", res);
```

于是 `node main.js <url> <params-json>` 跑完， `js/sig.json` 里就出现了我们要的头：

```json
// 取自 js/sig.json（真实产物，设备 ID 已脱敏）
{
  "Content-Type": "application/json",
  "X-ITOUCHTV-Ca-Timestamp": 1790128990186,
  "X-ITOUCHTV-Ca-Signature": "FS/ayGRdZkksFlg5k0aeQWrrSqOcajVPfDuRMudz+bg=",
  "X-ITOUCHTV-Ca-Key": "89541943007407288657755311868534",
  "X-ITOUCHTV-CLIENT": "WEB_PC",
  "X-ITOUCHTV-DEVICE-ID": "WEB_1ccdb240-8f0f-11f1-8075-eb675b327f47"
}
```

## 五、Python 实现

Python 侧用 `subprocess` 起 Node 生成签名，读 `sig.json` ，再把签名头合并进请求头。注意 `X-ITOUCHTV-Ca-Timestamp` 是数字，requests 要求头值必须是 `str` ，所以要统一转字符串：

```python
# 取自 py/gdtv.py
import os, sys, json, subprocess, requests

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

params = {"beginScore": "0", "channelId": "108", "pageSize": "11"}
url = "https://gdtv-api.gdtv.cn/api/channel/v1/news"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JS_DIR = os.path.join(BASE_DIR, "..", "js")
SIG_FILE = os.path.join(JS_DIR, "sig.json")

# 1. 调 Node 生成签名（main.js 会把结果写进 sig.json）
proc = subprocess.run(
    ["node", "main.js", url, json.dumps(params, ensure_ascii=False)],
    cwd=JS_DIR, capture_output=True, text=True, timeout=60,
)
if proc.returncode != 0:
    print("=== Node 退出码:", proc.returncode, "===")
    print("stdout:", proc.stdout)
    print("stderr:", proc.stderr)
    raise SystemExit("Node 生成签名失败")

with open(SIG_FILE, encoding="utf-8") as f:
    sig = json.load(f)
print("=== 生成的签名头 ===")
print(json.dumps(sig, indent=2, ensure_ascii=False))

# 2. 组装请求头
headers = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Origin": "https://www.gdtv.cn",
    "Referer": "https://www.gdtv.cn/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
}
headers.update({k: str(v) for k, v in sig.items()})   # ★ 头值必须 str（Ca-Timestamp 是数字）

# 3. 发请求
resp = requests.get(url, headers=headers, params=params, timeout=15)
print("=== HTTP", resp.status_code, "===")
try:
    data = resp.json()
    print(json.dumps(data, indent=2, ensure_ascii=False)[:3000])
except Exception:
    print(resp.text[:3000])
```

## 六、运行结果

跑 `python gdtv.py` ，终端先打印 Node 生成的签名头，再打印 HTTP 状态和资讯列表 JSON：

```python
=== 生成的签名头 ===
{
  "Content-Type": "application/json",
  "X-ITOUCHTV-Ca-Timestamp": 1790128990186,
  "X-ITOUCHTV-Ca-Signature": "FS/ayGRdZkksFlg5k0aeQWrrSqOcajVPfDuRMudz+bg=",
  "X-ITOUCHTV-Ca-Key": "89541943007407288657755311868534",
  "X-ITOUCHTV-CLIENT": "WEB_PC",
  "X-ITOUCHTV-DEVICE-ID": "WEB_1ccdb240-8f0f-11f1-8075-eb675b327f47"
}
=== HTTP 200 ===
{"code":200,"data":{"list":[{"id":"...","title":"...","coverBig":"...","publishTime":"..."}, ...]}}
```

只要签名头被服务端认可，就能拿到资讯列表；否则返回 `401/403` 或签名错误体。

【图3：终端打印签名头并成功拉到资讯列表 —— 建议截图】

## 七、踩坑与注意

1.  **头值必须是字符串**： `X-ITOUCHTV-Ca-Timestamp` 在 `sig.json` 里是数字， `requests` 传入非 str 会报错，所以 `headers.update({k: str(v)...})` 不能省。
2.  **Cookie / 设备 ID 会失效**：wasm 签名里掺了 `DEVICEID` （ `t.__DEVICEID__ || h() || ""` ），仓库里 `main.js` 的 cookie 是 `你的cookie(...)` 占位，DEVICE-ID 也是脱敏值。 **换一台设备/清一次 Cookie， `DEVICE-ID` 就变，旧签名头会失效**，必须重新生成。
3.  **wasm 是内联 base64**：不要去找独立的 `.wasm` 文件，它在 `vendor_*.js` 里以 `data:application/wasm;base64,...` 存在， `initSync` 自己会解。
4.  **`__dirname` 定位落盘文件**： `main.js` 用 `path.join(__dirname, 'sig.json')` ，而不是写死相对路径——这是应对「 `subprocess` 的 cwd 与脚本目录不一致」的正确姿势。
5.  **Node 会 `process.exit(0)`**： `__SIG_SAVE__` 里写完文件直接退出，所以 `subprocess` 的 `returncode` 是 0 属正常；若看到非 0，读 `stderr` 定位。
6.  **别把 `callApi` 当纯签名函数**：整套逻辑依赖补出来的 `document` / `location` / `navigator` 和 Cookie，环境不对签名就不对。
7.  **chunk.js 5.2MB**：加载和解析都比较重，Node 首次运行慢是正常的。

## 八、总结

「WASM 签名」配合 webpack 时，最优解往往不是逆 wasm 指令，而是 **补环境把 bundle 跑起来，用一个全局回调（如 `__SIG_SAVE__` ）把中间产物导出来**。荔枝网这个案例把「webpack + wasm-bindgen + 设备 Cookie」串成了一条完整链：理解 `callApi → S → m(wasm)` 的调用链，再让结果落盘，Python 只需读文件拼头即可。

* * *
