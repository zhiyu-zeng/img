---
title: 【看雪】MyToken（mytokencap）code/timestamp 参数 JS 逆向实战（补环境 + execjs 还原 MD5 签名）
source: https://bbs.kanxue.com/thread-293240.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-16T19:55:07+08:00
trace_id: a0f35a81-88e1-4dc4-9bd5-fefbe606edc3
content_hash: a2bacf01870963a125758f8a7b586a192dfb02550e59feb830622d4dc7e59419
status: synced
tags:
  - 看雪
  - JS逆向
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: MyToken 排行榜接口的 `code` 由 `MD5(时间戳+"9527"+时间戳前6位)` 生成，用 execjs 调原打包函数现算即可还原签名。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-8114-93b9-cf05a9cd2754
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> MyToken 排行榜接口的 `code` 由 `MD5(时间戳+"9527"+时间戳前6位)` 生成，用 execjs 调原打包函数现算即可还原签名。
> 
> - **签名公式：** `p=Date.now().toString()`，`code=v.V8.hashStr(p+"9527"+p.substring(0,6))`，另有写死常量 `platform:"web_pc"`、`v:"0.1.0"`；其余 pages/sizes/subject 等为明文业务参数。
> - **定位手法：** webpack 产物中全局搜索参数名或接口路径易被模块化打断，改用搜 `timestamp:` 这类对象字面量，可一击命中构造签名的模块变量 `d`。
> - **哈希判定：** 模块 94786 导出的 `V8.hashStr` 含 `_md5cycle` 与 `-680876936`、`-389564586` 等常数，即增量式 MD5；但输出未必等同常见 `md5()` 十六进制小写形式，不要自行替换算法。
> - **补环境成本：** 该段代码只依赖 `Date.now()`，不触碰 document/window，Node 直接 `require` 即可跑通；配 `execjs.compile` 后 `call("get_code", str(page))` 返回含 `code`、`timestamp` 的字典。
> - **踩坑要点：** 页码必须传字符串（内部做 `page+",1"` 拼接）；时间戳须为毫秒级字符串；盐 `"9527"` 不可改；站点重打包后 `BB(88077)` 之类 webpack 模块编号会失效，需重新搜索定位；请求频率需控制。

> 本文是「JS 逆向实战 30 例」系列第 2 篇，项目源码：https://github.com/scool112/openJSReverse （ `Project2` ）

## 一、目标与背景

MyToken（mytokencap.com）是一个加密货币行情/市值榜站，我要抓它的币种排行榜列表接口。

-   站点： `https://www.mytokencap.com/`
-   目标接口： `https://api.mytoken.info/ticker/currencyranklist`
-   需还原字段： `code` 、 `timestamp` 两个 query 参数
-   难度：⭐⭐⭐（三星。签名算法本身很清晰——MD5，但要先把被 webpack 打包 + 混淆的导出函数补环境跑起来）

这个项目的逆向点同样是 **请求签名**，但比七麦那次温和得多：JS 是 webpack 产物，函数名被混淆成 `Fk` / `xZ` 这种两字母，但逻辑一旦理顺就只是一次 MD5。我的做法依旧是「补环境 + 执行导出函数」，只是这次我把签名公式也读出来验证了一遍。

## 二、抓包分析

打开 `https://www.mytokencap.com/` ，F12 → **Network** → 筛 `Fetch/XHR` ，翻一下排行榜，就能看到对 `api.mytoken.info/ticker/currencyranklist` 的请求。

看 **Payload（Query String）**：

```
pages=2,1
sizes=100,100
subject=market_cap
language=zh_CN
legal_currency=USD
code=xxxxxxxxxxxxxxxxxxxxxxxx
timestamp=1783931313912
platform=web_pc
v=0.1.0
mytoken=
```

除了 `code` 和 `timestamp` ，其它参数（ `pages` / `sizes` / `subject` …）都是明文业务参数。 `timestamp` 一看就是毫秒时间戳，会随时间变化； `code` 是一串十六进制，跟着 `timestamp` 一起变，明显是由 `timestamp` 派生出来的签名。

【图1：Network 面板里 currencyranklist 请求的 Query String —— 建议截图】

结论：要还原的是 `code = f(timestamp)` 这个派生关系，请求其它部分照抄即可。

## 三、定位加密入口

在 **Sources** 面板全局搜参数名 `code` / `timestamp` ，或者搜接口路径 `currencyranklist` ，会落到站点的主 JS 上（webpack 打包）。因为被 webpack 分模块，我用的办法是： **搜 `timestamp:` 这种对象字面量**，直接定位到构造签名对象的地方。

在打包代码里我找到了关键几行：

```javascript
// 取自仓库真实 js：Project2/mytoken/mytoken1.js
r.d(t,{rQ:function(){return b}, ..., xZ:function(){return k}, Fk:function(){return w}});
var e=r(47568), o=r(828), i=r(97582), u=r(2568), a=r.n(u), c=r(35487), f=r.n(c), l=r(59130),
    s=r(26042), v=r(94786),
    p=Date.now().toString(),
    d={timestamp:p, code:v.V8.hashStr(p+"9527"+p.substring(0,6)), platform:"web_pc", v:"0.1.0"},
```

这一行信息量极大：

-   `p = Date.now().toString()` —— 当前毫秒时间戳，就是 query 里的 `timestamp` ；
-   `code = v.V8.hashStr(p + "9527" + p.substring(0,6))` —— 签名算法一目了然： **把 时间戳 + 固定盐 "9527" + 时间戳前 6 位 拼起来，做一次 `hashStr`**；
-   `platform: "web_pc"` 、 `v: "0.1.0"` 是写死的常量。

`v = r(94786)` 是 webpack 的模块编号，模块 94786 里导出的是 `V8` 这个类。 `Fk` （即 `w` ）是负责把参数对象拼成 query 字符串的函数。

【图2：Sources 面板里 code/timestamp 构造处 / hashStr 调用栈 —— 建议截图】

## 四、JS 还原与补环境

先确认 `V8.hashStr` 到底是什么哈希。扒到模块 94786：

```javascript
// 取自仓库真实 js：Project2/mytoken/mytoken1.js（模块 94786）
94786: function(t, e, r) {
    "use strict";
    r.d(e, {
        V8: function() {
            return s
        }
    });
    class s {
        constructor() {
            this._dataLength = 0,
                this._bufferLength = 0,
                this._state = new Int32Array(4),
                this._buffer = new ArrayBuffer(68),
                this._buffer8 = new Uint8Array(this._buffer,0,68),
                this._buffer32 = new Uint32Array(this._buffer,0,17),
                this.start()
        }
        static hashStr(t, e=!1) {
            return this.onePassHasher.start().appendStr(t).end(e)
        }
        ...
        static _md5cycle(t, e) {
            let r = t[0]
                , s = t[1]
                , n = t[2]
                , i = t[3];
            r += (s & n | ~s & i) + e[0] - 680876936 | 0,
                r = (r << 7 | r >>> 25) + s | 0,
                i += (r & s | ~r & n) + e[1] - 389564586 | 0,
                ...
```

看到 `_md5cycle` 和那串经典常数（ `-680876936` 、 `-389564586` 、 `606105819` …）就能确认： **`V8` 其实是一份增量式 MD5 实现** （128 位、4 个 32 位状态字， `_buffer` 68 字节 = 64 字节分组 + 4 字节长度）。所以

```
code = MD5(timestamp + "9527" + timestamp.substring(0, 6))
```

理解了算法，但要落成一个 query，还得看 `Fk` （ `w` ）怎么把对象拼成串：

```javascript
// 取自仓库真实 js：Project2/mytoken/mytoken1.js（Fk 即拼接函数，节选）
w = function(n){
    var t = new URLSearchParams, r = !0, e = !1, i = void 0;
    try {
        for (var u, a = Object.entries(n)[Symbol.iterator](); !(r = (u = a.next...
```

它就是用 `URLSearchParams` 把对象按 key 拼成 `key=value&...`。最后是导出给外部调用的入口 `get_code` ：

```javascript
// 取自仓库真实 js：Project2/mytoken/mytoken1.js（文件尾部）
function get_code(page){
    a = BB(26042)
    s = BB(88077)
    n = {
        "pages":  page + ",1",   //  参数改变
        "sizes": "100,100",
        "subject": "market_cap",
        "language": "zh_CN",
        "legal_currency": "USD"
    }
    t = (0,
        s.Fk)((0,
        a.Z)({}, n, (0,
        s.xZ)(null === n || void 0 === n ? void 0 : n.mytoken)))
    var t_s =  t.toString();
    console.log(t_s)
    var result = {}
    var timestamp = t_s.split("timestamp=")[1].split("&")[0]
    var code =  t_s.split("code=")[1].split("&timestamp")[0]
    result["timestamp"] = timestamp
    result["code"] = code
    return result
}
console.log(get_code("3").timestamp)
console.log(get_code("3").code)
```

这里 `BB(26042)` / `BB(88077)` 是 webpack 的 `__webpack_require__` ，分别取到工具模块和「含 `Fk` / `xZ` 的签名模块」。 `get_code` 把业务参数和签名对象（ `d` ）合并后，交给 `Fk` 拼成完整 query，再用字符串切分把 `timestamp` 和 `code` 抠出来返回。

补环境成本几乎为零：这段代码不依赖 `document` / `window` 的任何东西（时间戳来自 `Date.now()` ），所以只要 Node 能 `require` 到打包依赖即可， `execjs` 直接跑通。

## 五、Python 实现

仓库里的 `py/mytoken1.py` ：读 JS → `compile` → 调 `get_code(page)` → 取 `code` / `timestamp` 填进 query：

```python
# 取自仓库真实 py：Project2/mytoken/mytoken1.py
import requests
import execjs

def Spider_mytoken(page:int):
    page_i = str(page)
    with open("mytoken1.js",encoding="utf-8") as f:
        js_code = f.read()

    js = execjs.compile(js_code)

    arg = js.call("get_code",page_i)
    code = arg["code"]
    timestamp = arg["timestamp"]

    headers = {
        "accept": "*/*",
        "accept-language": "zh-CN,zh;q=0.9",
        "cache-control": "no-cache",
        "dnt": "1",
        "origin": "https://www.mytokencap.com",
        "pragma": "no-cache",
        "priority": "u=1, i",
        "referer": "https://www.mytokencap.com/",
        "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "sec-gpc": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    }
    url = "https://api.mytoken.info/ticker/currencyranklist"
    params = {
        "pages": "2,1",
        "sizes": "100,100",
        "subject": "market_cap",
        "language": "zh_CN",
        "legal_currency": "USD",
        "code": code,
        "timestamp": timestamp,
        "platform": "web_pc",
        "v": "0.1.0",
        "mytoken": ""
    }
    print(params)
    response = requests.get(url, headers=headers, params=params)

    print(response.text)
    print(response)

Spider_mytoken(4)
```

要点：

-   `get_code` 接收的是 **字符串** 页码（ `str(page)` ），因为它内部会做 `page + ",1"` 的字符串拼接；
-   返回的 `arg` 是个字典，直接取 `arg["code"]` / `arg["timestamp"]` ；
-   其余参数（ `subject` / `language` / `legal_currency` …）和浏览器保持一致。

## 六、运行结果

执行 `python mytoken1.py` ，终端先打印本次的 `params` ，能看到 `code` / `timestamp` 每次都不同，随后是接口返回的币种列表：

```javascript
{'pages': '2,1', 'sizes': '100,100', 'subject': 'market_cap', 'language': 'zh_CN', 'legal_currency': 'USD', 'code': '3f2a...e1', 'timestamp': '1783931313912', 'platform': 'web_pc', 'v': '0.1.0', 'mytoken': ''}
{"data":{"tickerList":[{"symbol":"BTC","price_usd":...,"market_cap_usd":...}, ...]},"code":0}
<Response [200]>
```

只要列表能正常返回、字段完整，签名链路就算打通。

【图3：终端打印出的币种排行榜数据 —— 建议截图】

## 七、踩坑与注意

1.  **页码必须传字符串。** `get_code` 里是 `page + ",1"` 的字符串拼接，传数字（如 `4` ）在 `execjs` 里行为可能和预期不一致；仓库统一用 `str(page)` 。
    
2.  **`timestamp` 用「毫秒字符串」。** `Date.now().toString()` 是毫秒级、字符串形态， `p.substring(0, 6)` 取的是毫秒时间戳的前 6 位数字。别写成秒级或数字类型。
    
3.  **固定盐 `"9527"` 别改。** 这是写死在打包代码里的常量，改了签名就错。
    
4.  **`hashStr` 不是普通 `md5(...)` 的十六进制小写。** 它是增量式 MD5，输出可能是大写/带 seed 的变体（ `hashStr(t, e=!1)` 的第二个参数）。最稳的仍是直接调原函数，不要自作主张用别的 MD5 库顶替。
    
5.  **webpack 模块编号会变。** 站点重新打包后 `BB(88077)` 这类编号可能失效，届时重新用搜索定位 `Fk` / `hashStr` 即可。
    
6.  **低频请求。** 行情接口数据更新快，但仍要控制频率，遵守站点条款。
    

## 八、总结

1.  **`code = MD5(timestamp + "9527" + timestamp.substring(0,6))`** 这类「固定盐 + 时间戳」是最常见的签名形态，先搜 `timestamp` 字面量往往一击命中。
2.  **判断 JS 哈希库看常数即可**：出现 `_md5cycle` / `-680876936` 就是 MD5，别的库同理（SHA 系则是 `1779033703` 一类初值）。
3.  **能跑原函数就别复现算法**：签名由时间戳驱动， `execjs` 每次现算，比自己用 Python 复现哈希更稳。

* * *
