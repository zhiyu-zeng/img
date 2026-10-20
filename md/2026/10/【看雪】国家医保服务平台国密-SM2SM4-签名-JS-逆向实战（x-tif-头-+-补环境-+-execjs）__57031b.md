---
title: 【看雪】国家医保服务平台国密 SM2/SM4 签名 JS 逆向实战（x-tif 头 + 补环境 + execjs）
source: https://bbs.kanxue.com/thread-293279.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-20T08:49:26+08:00
trace_id: 5a8ff517-6871-4958-b41a-0bd23867a596
content_hash: 3686e39b865189a9aed17c16c7b53501a75ed5449409f7fdb86aa7f5ccea15f5
status: synced
tags:
  - 看雪
  - 密码学
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: 国密接口逆向不必读懂 3.8MB 混淆包的每个字节：补齐浏览器环境，让 webpack bundle 在 execjs 里跑通，再把入口函数 `get_arg`/`get_res` 当黑盒调用，就能还原 x-tif 头签名与 SM2/SM4 加解密。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-8164-a45c-dd96b5f971c1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 国密接口逆向不必读懂 3.8MB 混淆包的每个字节：补齐浏览器环境，让 webpack bundle 在 execjs 里跑通，再把入口函数 `get_arg`/`get_res` 当黑盒调用，就能还原 x-tif 头签名与 SM2/SM4 加解密。
> 
> - **接口构成：** 医保定点医院查询为 POST `queryFixedHospital`，请求头含 `x-tif-timestamp`/`x-tif-nonce`/`x-tif-signature`/`x-tif-paasid`，body 是“明文包密文”：`encData` 为 SM4 密文、`signData` 为 SM2 签名，`encType`/`signType` 固定 `SM4`/`SM2`，响应 `encData` 同样需 SM4 解密。
> - **定位策略：** bundle 模块 id 为 hex 串、字符串经 `a4_0x4e42` 函数表解密；不逐模块还原，直接从作者留的 `get_arg(page)`/`get_res(encType,data)` 反推，二者均走 `BB("7d92").a()/.b()`，该模块打包了 SM4、SM2、SM2Cipher、doSm3Hash。
> - **补环境四件事：** 静音 `console.*`、`process.on("unhandledRejection")` 吞异步异常、`window = global`、按站点真实值填 `location`/`localStorage`；另用 Proxy 包裹 window/document/navigator 便于观测属性访问。
> - **调用链：** `execjs.compile` 载入整份 JS → `Js.call("get_arg", 4)` 拿头与密文 → requests 发送 → `Js.call("get_res","SM4",response)` 用同一份 JS 解密；`x-tif-paasid` 必须传字符串 `"undefined"`。
> - **主要坑点：** 3.8MB 首次编译要数秒到十几秒；不静音 console 会污染 stdio 返回值甚至超时；时间戳与 nonce 一次性、不可复用旧头；JS 路径用 `os.path.join` 相对定位。

> 本文是「JS 逆向实战 30 例」系列第 12 篇，项目源码：JS 逆向实战 30 例 · 开源仓库 （ `Project12` ）

## 一、目标与背景

国家医保服务平台（ `fuwu.nhsa.gov.cn` ）的定点医院查询接口，是「**请求头签名 + 请求体国密加密 + 响应国密解密**」三件套凑齐的典型样本。它用到了国产密码算法：请求体里的 `encData` 是 **SM4** 加密的业务数据， `signData` 是 **SM2** 签名，请求头还有一整套 `x-tif-*` 签名/时间戳/随机数。响应同样要按 `encType` 用 SM4 解回来。

这类站点的难点不在算法（SM2/SM4 都有现成实现），而在于：

-   站点 JS 是一个约 **3.8MB 的混淆 webpack bundle**，模块名、字符串全部被 `a4_0x4e42` 这种函数表打散；
    
-   一跑就依赖浏览器环境，且内部有大量异步 `Promise` （未捕获会拖垮 `execjs` ）、 `console.log` 噪音；
    
-   需要在 `execjs` 这种「stdio 喂代码」的方式下补出环境并吞掉异常，才能稳定拿到签名。
    
-   站点： `https://fuwu.nhsa.gov.cn/`
    
-   目标接口： `https://fuwu.nhsa.gov.cn/ebus/fuwu/api/nthl/api/CommQuery/queryFixedHospital` （POST）
    
-   需还原字段： `x-tif-nonce` / `x-tif-paasid` / `x-tif-signature` / `x-tif-timestamp` / `encData` / `appCode` / `signData` （**SM2 签名 + SM4 加密**）
    
-   难度：⭐⭐⭐⭐⭐（3.8MB 混淆包 + 国密 + 补环境吞异常）
    

| 位置  | 字段  | 含义  |
| --- | --- | --- |
| 请求头 | `x-tif-timestamp` | 时间戳（毫秒） |
| 请求头 | `x-tif-nonce` | 一次性随机数 |
| 请求头 | `x-tif-signature` | 对请求内容做的签名（base64） |
| 请求头 | `x-tif-paasid` | 站点传的是 `"undefined"` |
| body | `encData` | 业务数据经 **SM4** 加密 |
| body | `signData` | 经 **SM2** 签名 |
| body | `appCode` / `timestamp` | 应用标识与时间戳 |
| body | `encType` / `signType` | 固定 `"SM4"` / `"SM2"` |

## 二、抓包分析

在「定点医院查询」页翻页，筛 `queryFixedHospital` ，抓到的 POST 长这样：

```python
POST /ebus/fuwu/api/nthl/api/CommQuery/queryFixedHospital
content-type: application/json
channel: web
contentType: application/x-www-form-urlencoded
origin: https://fuwu.nhsa.gov.cn
referer: https://fuwu.nhsa.gov.cn/nationalHallSt/
x-tif-nonce: <一串随机数>
x-tif-paasid: undefined
x-tif-signature: <base64 签名>
x-tif-timestamp: <毫秒时间戳>

{"data":{"data":{"encData":"<SM4 密文>"},"appCode":"<应用码>","version":"1.0.0","encType":"SM4","signType":"SM2","timestamp":<ts>,"signData":"<SM2 签名>"}}
```

请求体是「明文包着密文」的套娃结构：真正查询条件（ `addr` / `regnCode` / `pageNum` 等）被 SM4 塞进 `encData` ，外层 `signData` 是签名。响应里 `encData` 同样要解密才能看到医院列表。所以我判断要还原的就是「生成这几个头 + 加密 body」和「解密响应」两组能力。

【图1：抓包看到 x-tif-\* 头与套娃 body，圈出 encData / signData —— 建议截图】

## 三、定位加密入口

因为是一整个 webpack bundle，模块 ID 是 hex 字符串。我不打算逐个还原内部模块，而是 **从入口函数反推**：文件末尾作者已经留好了两个出入口—— `get_arg(page)` （生成请求头 + body）和 `get_res(encType, data)` （解密响应）。

先看入口怎么调内部模块：

```javascript
// 取自 js/nationalHallSt_arg.js —— 明文调内部模块 "7d92"
function get_arg(page){
    arg = {
        "headers": { "Accept": "application/json", "Content-Type": "application/json", "channel": "web" },
        "baseURL": "/ebus/fuwu/api",
        "method": "post",
        "url": "/nthl/api/CommQuery/queryFixedHospital",
        "data": {
            "addr": "", "regnCode": "110000", "medinsName": "",
            "medinsLvCode": "", "medinsTypeCode": "", "outMedOpenFlag": "",
            "pageNum": page, "pageSize": 10, "queryDataSource": "es"
        }
    }
    res = BB("7d92").a(arg)                 // ← 加密/签名都发生在模块 7d92 里
    li = {}
    li['x-tif-signature'] = res["headers"]['x-tif-signature']
    li['x-tif-timestamp'] = res["headers"]['x-tif-timestamp'].toString()
    li['x-tif-nonce']     = res["headers"]['x-tif-nonce']
    li['encData'] = res['data'].split('"encData":"')[1].split('"}')[0]
    li['appCode'] = res['data'].split('"appCode":"')[1].split('",')[0]
    li["timestamp"] = Number(res['data'].split('"timestamp":')[1].split(',"')[0])
    li['signData'] = res['data'].split('signData":"')[1].split('"}}')[0]
    return li
}

// 解密：SM4 由模块 7d92 的 b 导出
function get_res(encType, data){
    res = BB("7d92").b(encType, data)
    return res
}
```

重点来了： `BB` 是这份混淆 bundle 的 require：

```javascript
// 取自 js/nationalHallSt_arg.js —— 混淆 webpack 的模块加载器
function _0x3fb7b7(_0x58f5ec) {
    var _0x3c15a4 = a4_0x4e42;            // 字符串解密函数 a4_0x4e42
    if (_0x4423aa[_0x58f5ec]) return _0x4423aa[_0x58f5ec][_0x3c15a4(0x245f)];
    var _0x1f4c1b = _0x4423aa[_0x58f5ec] = { 'i': _0x58f5ec, 'l': !0x1, 'exports': {} };
    return _0x1cd029[_0x58f5ec][_0x3c15a4(0x18a3)](_0x1f4c1b[_0x3c15a4(0x245f)], _0x1f4c1b, _0x1f4c1b[_0x3c15a4(0x245f)], _0x3fb7b7),
        _0x1f4c1b['l'] = !0x0, _0x1f4c1b[_0x3c15a4(0x245f)];
}
BB = _0x3fb7b7
```

`a4_0x4e42(0x245f)` 之类就是「字符串表 + 下标解密」的混淆： `0x245f` 解出来是 `exports` ， `0x18a3` 解出来是 `call` 。模块 `7d92` 里同时打包了 `SM4` （ `encType="SM4"` ）、 `SM2` 、 `SM2Cipher` 、 `doSm3Hash` 这些国密实现（在字符串表里能搜到 `SM4` / `SM2Cipher` / `doSm3Hash` ）。

到这里我的策略定了： **不追求看懂 7d92 的每个字节，只保证它跑起来、 `a()` 和 `b()` 结果正确即可**。这正是补环境方案的适用场景。

【图2：在 `BB("7d92")` 两侧打断点，或直接在 bundle 里搜字符串 'SM4'/'SM2Cipher' —— 建议截图】

## 四、JS 还原与补环境

补环境部分是本项目的核心。文件顶部做了四件事： **静音 console、吞掉未处理的 Promise 拒绝、用 Proxy 造环境观测点、把 global 补成浏览器**。

```javascript
// 取自 js/nationalHallSt_arg.js —— 顶部补环境
var DEBUG = false
if (!DEBUG) {                              // ① 静音 console，避免 execjs 卡在巨量输出
    console.log = function () {}
    console.error = function () {}
    console.warn = function () {}
    console.info = function () {}
    console.debug = function () {}
}

if (typeof process !== "undefined" && process.on) {   // ② 吞掉未捕获的 Promise 拒绝
    process.on("unhandledRejection", function () {})
}

function get_enviroment(proxy_array) {      // ③ 给 window/document/navigator... 套 Proxy，便于观测属性访问
    for (var i = 0; i < proxy_array.length; i++) {
        handler = '{ get: function(target, property, receiver){ ... return target[property]; },'
                + '  set: function(target, property, value, receiver){ ... return Reflect.set(...arguments); } }'
        eval('try{ ' + proxy_array[i] + '; ' + proxy_array[i]
            + '=new Proxy(' + proxy_array[i] + ', ' + handler + ')}catch(e){ ' + proxy_array[i] + '={}; '
            + proxy_array[i] + '=new Proxy(' + proxy_array[i] + ', ' + handler + ')}')
    }
}
proxy_array = ['window', 'document', 'location', 'navigator', 'history', 'screen']

window = global                            // ④ 把 Node 的 global 当 window
self = window
delete _filename
delete _dirname
window.webpackJsonp = undefined
window["__core-js_shared__"] = undefined
window.addEventListener = function (s, t) {};
```

接着是「把浏览器里常用但 Node 没有的构造器和属性补齐」，一长串 `window.X = function(){}` 占位（ `CSSRuleList` 、 `NodeList` 、 `MutationObserver` 、 `requestAnimationFrame` 等），再补出 `window.location` / `window.localStorage` 这些带真实值的对象：

```javascript
// 取自 js/nationalHallSt_arg.js —— 补 location / localStorage
window.location = {
    "href": "https://fuwu.nhsa.gov.cn/nationalHallSt/#/search/medical?...",
    "origin": "https://fuwu.nhsa.gov.cn",
    "protocol": "https:", "host": "fuwu.nhsa.gov.cn",
    "hostname": "fuwu.nhsa.gov.cn", "port": "",
    "pathname": "/nationalHallSt/", "search": "",
    "hash": "#/search/medical?code=174000&message=serverUrl%20is%20null&gbFlag=true"
}
window.localStorage = {
    "LOCAL_PW_DICT": "{\"MDTRTAREA_OTP_OPEN_FLAG\":[...],\"IPT_OPEN_FLAG\":[...]}"   // 站点字典缓存
}
```

这些 `location` / `localStorage` 的值就是站点运行时真实值（字典、URL 等站点级数据，不是隐私）。补全之后， `BB("7d92")` 里的 SM4/SM2 才能真正跑起来。

## 五、Python 实现

Python 通过 `execjs` 加载这份大 JS，调用 `get_arg` 拿头与 body，再调 `get_res` 解密响应：

```python
# 取自 py/nationalHallSt.py
import requests, json, os, execjs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JsPath = os.path.join(BASE_DIR, '..', 'js', "nationalHallSt_arg.js")
with open(JsPath, encoding="utf-8") as f:
    Js_code = f.read()
Js = execjs.compile(Js_code)
arg = Js.call("get_arg", 4)               # 第 4 页

headers = {
    "Accept": "application/json", "Content-Type": "application/json",
    "Origin": "https://fuwu.nhsa.gov.cn",
    "Referer": "https://fuwu.nhsa.gov.cn/nationalHallSt/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "channel": "web",
    "contentType": "application/x-www-form-urlencoded",
    "x-tif-nonce": arg["x-tif-nonce"],
    "x-tif-paasid": "undefined",          # ★ 站点写死
    "x-tif-signature": arg["x-tif-signature"],
    "x-tif-timestamp": arg['x-tif-timestamp'],
}
url = "https://fuwu.nhsa.gov.cn/ebus/fuwu/api/nthl/api/CommQuery/queryFixedHospital"
data = {
    "data": {
        "data": { "encData": arg['encData'] },
        "appCode": arg['appCode'],
        "version": "1.0.0",
        "encType": "SM4",
        "signType": "SM2",
        "timestamp": arg['timestamp'],
        "signData": arg['signData']
    }
}
data = json.dumps(data, separators=(',', ':'))
response = requests.post(url, headers=headers, data=data).json()
res = Js.call("get_res", "SM4", response)   # ★ 用同一份 JS 解密响应
print(res)
```

注意 `x-tif-paasid` 站点传的就是字符串 `"undefined"` ，照抄即可。响应解密和请求加密共用模块 `7d92` ，所以「加密/解密」一套 JS 解决。

## 六、运行结果

跑通后终端会打印解密后的医院列表 JSON（ `data.list` 之类结构），说明 `x-tif-signature` 被服务端认可、 `encData` 与 `signData` 也通过了校验：

```python
{'code': 200, 'data': {'list': [{'medinsName': '...', 'medinsAddr': '...',
 'medinsLvName': '...', 'medinsTypeName': '...'}, ...], 'total': ..., 'pageNum': 4}}
```

若签名或加密头对不上，会返回错误码/空数据。

【图3：终端打印解密后的医院列表 —— 建议截图】

## 七、踩坑与注意

1.  **3.8MB 大文件 `execjs` 编译慢**：首次 `execjs.compile` 会明显卡顿（几秒到十几秒），属正常；别急着判死。
2.  **必须吞掉 `unhandledRejection`**：bundle 里有大量异步，Node 下未处理的 rejection 默认会终止进程， `process.on("unhandledRejection", ()=>{})` 是稳定运行的保险。
3.  **必须静音 `console.log`**：混淆代码本身会疯狂打印，通过 stdio 交给 `execjs` 时会污染返回、甚至拖慢到超时。
4.  **相对路径**： `py` 用 `os.path.join(BASE_DIR,'..','js',...)` 定位 JS，跨平台不要写死绝对路径。
5.  **`paasid = "undefined"`**：这是字符串 `undefined` ，不是 JS 的 `undefined` 值，写错会签名不符。
6.  **时间戳与 nonce 一次性**： `get_arg` 每次调用都重新生成，别复用旧头。
7.  **脚本无隐私凭据**：本项目接口本身不依赖登录 Cookie，但 `localStorage` 里的字典等是站点公开数据，按原样保留即可；如果你改动其中字段，可能影响签名。

## 八、总结

面对「大混淆包 + 国密」，最省力的路线不是读懂每个字节，而是 **补出浏览器环境让 bundle 完整跑起来，再把入口函数 `get_arg` / `get_res` 当成黑盒** 调用。国密 SM2/SM4 在 JS 里通常成对出现（ `signType` / `encType` 暗示），配合 `x-tif-*` 这类安全头，就是「头签名 + body 加密 + 响应解密」的完整闭环。

* * *
