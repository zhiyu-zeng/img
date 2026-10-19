---
title: 【看雪】山西省政府采购电子卖场 nsssjss/sign 请求头签名逆向实战（JS 逆向 / RSA / 嵌套哈希 / execjs）
source: https://bbs.kanxue.com/thread-293267.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-19T08:04:33+08:00
trace_id: b3f55aa3-a7d3-426c-90dc-2222d9db92fb
content_hash: 9c46da22123068638339b19415501d8b4c834be93d0d2662dc5067dbd9df437d
status: synced
tags:
  - 看雪
  - 协议分析
  - 密码学
series: null
feed_source: 看雪·逆向工程
ai_summary: 山西省政府采购电子卖场接口的请求头加密全部集中在 `get_arg()` 一处：`nsssjss` 由 RSA 生成密文，`sign` 由 md5(sha1(...)) 生成嵌套哈希；配合 execjs 调用原始 JS，即可打通抓取。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fe75244-d011-8136-ad42-ef40ef6df34c
ioc:
  cves: []
  cwes: []
  hashes:
    - c3b1d9f4ec6359a4b18be6fc78d49e3f
    - d502cbd21715dc472875dddc20611dcf
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 山西省政府采购电子卖场接口的请求头加密全部集中在 `get_arg()` 一处：`nsssjss` 由 RSA 生成密文，`sign` 由 md5(sha1(...)) 生成嵌套哈希；配合 execjs 调用原始 JS，即可打通抓取。
> 
> - **加密位置：** 请求体为明文，加密只发生在自定义请求头上；`nsssjss`（RSA 加密接口路径 + "$$" + 毫秒时间戳）、`sign`（32 位十六进制）、`time`、`timestamp` 均由同一个 `get_arg()` 一次性生成。
> - **`sign` 真实算法：** `md5(sha1(time + "_" + 去掉 query 的路径 + "_bosssoft_platform_095285"))`，外层 MD5 作用在 SHA1 的十六进制字符串上；只算 MD5 永远对不上，且 `time` 在调用签名函数时才取，因此与模块加载时的 `timestamp` 通常不相等。
> - **定位手法：** 先搜索接口路径，再打 XHR 断点回溯调用栈；对字符串数组混淆的 `n(nnn)` 索引，必须运行站点自身的解码函数来还原（数组初始化时经过 push/shift 旋转），得到 `getTime/split/time/url/sign` 等映射后再代入，才完成反混淆。
> - **还原策略：** 保留完整的 webpack 运行时与原始 `6f3c` 模块（连同其内部哈希实现），只暴露 `get_arg`；补环境仅需 `window = global` 与 Node 内置 `crypto.getRandomValues`。RSA 公钥由逗号分隔的 charCode 经 `String.fromCharCode` 还原。
> - **调用与常量：** Python 端用 `execjs.compile()` 调一次 `get_arg()` 取四个头；`sitecode/siteguid/regioncode/regionguid/form-token` 是站点级公开常量，照抄抓包即可，需与目标区域保持一致，JSON 用 `separators=(',',':')` 保持紧凑。

## 山西省政府采购电子卖场 nsssjss/sign 请求头签名逆向实战（JS 逆向 / RSA / 嵌套哈希 / execjs）

> 本文是「JS 逆向实战 30 例」系列第 10 篇，项目源码： [JS 逆向实战 30 例 · 开源仓库](https://github.com/scool112/openJSreverse) （ `Project10` ）

## 一、目标与背景

山西省政府采购电子卖场（gpmall）的公告列表，我想抓它的 `getNoticeList` 接口。

-   站点： `https://shanxisheng-zfcgdzmcgov.cn/gpmall-main-web/basic/sxNotice`
    
-   目标接口： `https://shanxisheng-zfcgdzmcgov.cn/gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList`
    
-   需还原字段： `nsssjss` 、 `sign` 、 `time` 、 `timestamp` （全部是 **自定义请求头**）
    
-   难度：⭐⭐⭐⭐（四星。一个头是 RSA 加密，另一个头是“SHA1 套 MD5”的嵌套哈希，且整段 JS 被字符串数组混淆）
    

这个项目的看点有两个：

1.  `nsssjss` 这个诡异的名字，本质是 **RSA 对 `接口路径 + "$$" + 时间戳` 加密**；
    
2.  `sign` 不是普通 MD5，而是 **`md5(sha1(...))` 的嵌套哈希**，我一开始只算 MD5 死活对不上。
    

## 二、抓包分析

打开 `.../gpmall-main-web/basic/sxNotice` ，F12 → **Network**，筛 `Fetch/XHR` ，翻页时抓到：

```
POST https://shanxisheng-zfcgdzmcgov.cn/gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList
```

看 **Request Headers**，除了常规头，有一堆站点自定义头特别扎眼：

```yaml
nsssjss: <Base64 密文>
sign:    <32 位十六进制>
time:    <毫秒时间戳>
timestamp: <毫秒时间戳>
sitecode: sxzfcg
siteguid: 6883226032309207040
regioncode: 140001000
regionguid: 140001
url: /gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList
form-token: d502cbd21715dc472875dddc20611dcf
webapp: 1
```

再看 **Payload**，是一个普通 JSON：

```json
{"regionGuid":"232","regionCode":"140000000","webApp":"1","pageSize":10,"pageNum":4,"noticeType":"0"}
```

结论： **请求体是明文，加密全在请求头里**。其中：

-   `nsssjss` 是 Base64 密文（RSA 特征， `MIGf...` 那种公钥加密后就是长 Base64）；
    
-   `sign` 是 32 位十六进制（哈希特征）；
    
-   `time` / `timestamp` 是两个毫秒时间戳，且数值非常接近，说明是请求时分别取的。
    

【图1：getNoticeList 请求头里的 nsssjss / sign / time / timestamp —— 建议截图】

## 三、定位加密入口

这个站点的 JS 被 **字符串数组混淆** （ `javascript-obfuscator` 风格），所以直接搜 `nsssjss` 这种明文是没有的。我的做法：

1.  **全局搜接口路径**：搜 `/gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList` ，能定位到 `get_arg` 调用处；
    
2.  **XHR 断点**：在 Sources 里对 `getNoticeList` 下 XHR 断点，命中断下来后看调用栈，找到生成请求头的函数；
    
3.  **搜 RSA 特征**：搜 `setPublicKey` 、 `JSEncrypt` 、 `encrypt` ，定位到 `nsssjss` 的生成逻辑。
    

抠出来之后， `get_arg` 的结构其实很清晰（来自真实文件 `js/zfcgdzmcgov.js` 第 3152 行）：

```php
// 取自仓库真实 js：Project10/zfcgdzmcgov/js/zfcgdzmcgov.js
function get_arg(){
    var nsssjss = m("".concat(_, "$$").concat(b))  //  nsssjss
    var timestamp = b.toString()  //   timestamp
    var MMMX = BB("6f3c")
    var vvx = MMMX.default("/gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList","")
    time = vvx["time"].toString()
    sign = vvx["sign"]
    li = {}
    li["nsssjss"] = nsssjss
    li["timestamp"] = timestamp
    li["time"] = time
    li["sign"] = sign
    return li
}
```

这里 `_` 和 `b` 是文件底部定义的两个变量：

```
// 取自仓库真实 js：Project10/zfcgdzmcgov/js/zfcgdzmcgov.js
b = (new Date).getTime()
_ = "/gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList"
```

所以：

-   `nsssjss = m(路径 + "$$" + b)` ，而 `m` 是 RSA 加密；
    
-   `timestamp = b` ；
    
-   `sign / time` 来自 `MMMX = BB("6f3c")` 这个 webpack 模块的 `default()` 。
    

`m` 的定义（同上文件）也一眼可读——它用 charCode 还原出 Base64 公钥，再 `setPublicKey` + `encrypt` ：

```javascript
// 取自仓库真实 js：Project10/zfcgdzmcgov/js/zfcgdzmcgov.js
o = "77,73,71,102,77,65,48,...（省略）...,65,81,65,66"   // 逗号分隔的 charCode
var m = function (e) {
    var t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : p(o)
        , n = new i.a;
    return n.setPublicKey(t),
        n.encrypt(e)
}
```

而 `p()` 就是把那段逗号分隔的数字还原成字符串（公钥）：

```javascript
// 取自仓库真实 js：Project10/zfcgdzmcgov/js/zfcgdzmcgov.js
function p() {
    for (var e = "", t = (arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "").split(","), n = 0; n < t.length; n++)
        e += String.fromCharCode(Number(t[n]));
    return e
}
```

【图2：XHR 断点命中 getNoticeList 后回溯到 get_arg 的调用栈 —— 建议截图】

## 四、JS 还原与补环境

`nsssjss` 这块很好还原（就是 RSA）。真正难的是 `sign` 。

`MMMX = BB("6f3c")` 拿到的模块里， `default` 函数是 **被字符串数组混淆** 的，原文长这样：

```javascript
// 取自仓库真实 js：Project10/zfcgdzmcgov/js/zfcgdzmcgov.js（6f3c 模块，混淆形态）
t.default = function (e, t) {
    const n = b
        , i = (new Date)[n(303)]()
        , r = _(p(i + "_" + String(e)[n(311)]("?")[0] + (n(301) + n(305) + n(296))))
        , o = {};
    if (o[n(312)] = i,
        o[n(295)] = String(e)[n(311)]("?")[0],
        o[n(313)] = r,
    null != t && "" !== t) {
        const r = _(p("" + t + String(e)[n(311)]("?")[0] + i));
        o[n(308)] = r
    }
    return o
}
```

`n(303)` 、 `n(311)` 这些是 **字符串数组索引**。我把文件里的字符串数组 `x()` 拿出来，用站点自己的解码函数还原，得到映射：

```java
n(303) => getTime     n(311) => split      n(301) => _bosssoft_
n(305) => platform_0  n(296) => 95285      n(312) => time
n(295) => url         n(313) => sign       n(308) => tokensign
```

代入后反混淆得到：

```javascript
// 反混淆后的 6f3c.default
t.default = function (e, t) {
    const i = new Date().getTime();                                   // 时间
    const salt = "_bosssoft_" + "platform_0" + "95285";               // 混淆常量拼成的固定盐
    const r = publicHash(i + "_" + String(e).split("?")[0] + salt);   // 核心：签名
    const o = {};
    o["time"] = i;
    o["url"]  = String(e).split("?")[0];
    o["sign"] = r;
    if (t != null && t !== "") {
        o["tokensign"] = publicHash("" + t + String(e).split("?")[0] + i);
    }
    return o;
}
```

到这一步我以为 `publicHash` 就是 MD5，直接在 Node 里用 `crypto.createHash('md5')` 复现—— **结果对不上**。于是我把 `publicHash` 拆开单独测，才发现它是 **嵌套哈希**：

```
sign = md5( sha1( time + "_" + 路径 + "_bosssoft_platform_095285" ) )
```

也就是 **先算 SHA1（取十六进制字符串），再对它做一次 MD5**。我用真实请求返回的 `time` 和 `sign` 做了对拍验证：

```
time   = 1792149059952
path   = /gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList
salt   = _bosssoft_platform_095285
传入   = 1792149059952_/gateway/.../getNoticeList_bosssoft_platform_095285
sha1   = <64位十六进制>
sign   = md5(sha1) = c3b1d9f4ec6359a4b18be6fc78d49e3f   ← 与接口头一致
```

确认无误后，我 **没有自己重写哈希**，而是 **保留了站点原始的 `6f3c` 模块** （连同它内部的 SHA1/MD5 实现），只把入口函数 `get_arg` 暴露出来。这样做最稳，不需要担心站点的哈希实现和我本地的细节差异。

补环境方面很简单，只做了：

-   `window = global` （部分打包代码会引用 `window` ）；
    
-   保留整个 webpack 运行时（ `BB = o` 是 `__webpack_require__` ），不能删；
    
-   站点的 RSA 用到了 `window.crypto.getRandomValues` ，Node 下有内置 `crypto` 可用。
    

## 五、Python 实现

Python 侧非常省事： `execjs` 编译整个文件，调一次 `get_arg()` 就拿到全部四个头：

```lua
# 取自仓库真实 py：Project10/zfcgdzmcgov/py/zfcgdzmcgov.py
import requests
import json
import os
import execjs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JsPath = os.path.join(BASE_DIR, '..', 'js', 'zfcgdzmcgov.js')
with open(JsPath, encoding="utf-8") as f:
    Js_code = f.read()
Js = execjs.compile(Js_code)
arg = Js.call('get_arg')
headers = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "form-token": "d502cbd21715dc472875dddc20611dcf",
    "nsssjss": arg['nsssjss'],
    "origin": "https://shanxisheng-zfcgdzmcgov.cn",
    "referer": "https://shanxisheng-zfcgdzmcgov.cn/gpmall-main-web/basic/sxNotice",
    "regioncode": "140001000",
    "regionguid": "140001",
    "sign": arg["sign"],
    "sitecode": "sxzfcg",
    "siteguid": "6883226032309207040",
    "time":  arg["time"],
    "timestamp": arg["timestamp"],
    "url": "/gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "webapp": "1"
}
cookies = {
    "webapp": "1",
    "siteCode": "sxzfcg",
    "siteGuid": "6883226032309207040",
    "regioncode": "140001000",
    "regionguid": "140001",
    "theme": "default",
    "regionpguid": "232",
    "rootregionguid": "232",
    "isOpenArea": "true",
    "tenantId": "ZF_GYS_000001",
    "regionname": "%E7%9C%81%E6%9C%AC%E7%BA%A7"
}
url = "https://shanxisheng-zfcgdzmcgov.cn/gateway/gpmall-bpoc/notice/v1/ignore/getNoticeList"
data = {
    "regionGuid": "232",
    "regionCode": "140000000",
    "webApp": "1",
    "pageSize": 10,
    "pageNum": 4,
    "noticeType": "0"
}
data = json.dumps(data, separators=(',', ':'))
response = requests.post(url, headers=headers, cookies=cookies, data=data)

print(response.text)
print(response)
```

说明：

-   `nsssjss / sign / time / timestamp` 固定从 `arg` 里取；
    
-   `sitecode / siteguid / regioncode / regionguid / form-token` 是 **站点级配置参数** （不是加密产物），照抄抓包即可；
    
-   `form-token` 是一个固定的十六进制串，属于站点公开常量。
    

## 六、运行结果

执行 `python zfcgdzmcgov.py` ，终端会打印公告列表 JSON：

```css
{"code":0,"data":{"list":[{"title":"某政府采购公告","publishTime":"2024-xx-xx",...}],"total":...},"msg":"success"}
```

如果 `sign` 或 `nsssjss` 任一对不上，会返回签名校验失败 / 未授权。能看到 `list` 正常展开，就说明 RSA（ `nsssjss` ）+ 嵌套哈希（ `sign` ）全套头都还原对了。

【图3：终端打印出的采购公告列表 —— 建议截图】

## 七、踩坑与注意

1.  **`sign` 不是单一 MD5，而是 `md5(sha1(...))` 。** 这是本项目最大的坑。我一开始只算 MD5，怎么都对不上；后来把 `publicHash` 拆开单独验证，才发现里面先跑了 SHA1，并且外层 MD5 处理的是 **SHA1 的十六进制字符串**。
    
2.  **`time` 和 `timestamp` 是两个不同的时间戳。** `timestamp` 是模块加载时 `(new Date).getTime()` ； `time` 是签名函数 **调用那一刻** 再取的 `getTime()` 。两者数值接近但通常不相等，别混用。
    
3.  **签名里拼的是“去掉 query 的路径”。** `String(e).split("?")[0]` 说明如果 URL 带参数，签名只取问号前的部分。
    
4.  **混淆字符串数组的索引是位移过的。** 不能按数组下标硬猜 `n(303)` 到底是什么，必须跑一遍站点自己的解码函数（它的字符串数组在初始化时会 `push/shift` 旋转到正确顺序）。
    
5.  **`nsssjss` 里 `$$` 是分隔符，不能漏。** 拼接格式是 `路径 + "$$" + 时间戳` ，直接拼错位置服务端就解不出来。
    
6.  **公钥是 charCode 编码的。** 站点没有直接写 Base64 公钥，而是存了一长串逗号分隔的数字，用 `String.fromCharCode(Number(...))` 还原。还原时别把逗号或空格带进公钥。
    
7.  **`form-token` 等是站点公开常量。** 这些不是你的隐私，可以照抄；但 `siteguid` / `region` 等在同站点不同区域可能不同，注意和抓包保持一致。
    
8.  **编码问题。** Python 读取 JS 与发送请求都要 UTF-8； `json.dumps(..., separators=(',', ':'))` 保证紧凑格式。
    

## 八、总结

1.  **自定义请求头加密的定位方法：搜接口路径 + XHR 断点回溯**，加密逻辑通常集中在一个 `get_arg()` 里一次性生成全部头。
    
2.  **别假设哈希算法就是 MD5。** 遇到“32 位十六进制但算不对”的情况，一定要试试 `md5(sha1(...))` 、 `sha1(md5(...))` 这类嵌套组合。
    
3.  **混淆字符串数组必须用站点自己的解码函数还原**，靠肉眼猜索引一定会错；拿到映射后把 `default` 函数反混淆，逻辑立刻就清楚了。
    

* * *
