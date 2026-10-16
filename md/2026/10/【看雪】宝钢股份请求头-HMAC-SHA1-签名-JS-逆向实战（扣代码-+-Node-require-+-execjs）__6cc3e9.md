---
title: 【看雪】宝钢股份请求头 HMAC-SHA1 签名 JS 逆向实战（扣代码 + Node require + execjs）
source: https://bbs.kanxue.com/thread-293241.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-16T19:56:29+08:00
trace_id: ef7cbfa8-7fc0-4be5-980a-1e2dc78737ee
content_hash: cd76422c8218758dd42ce05444ad8aa9170958aea953695bb17d7ed30789386a
status: synced
tags:
  - 看雪
  - 协议分析
  - 安全工具
series: null
feed_source: 看雪·逆向工程
ai_summary: 宝钢股份 CMS 接口通过 MD5 校验请求体、HMAC-SHA1 签名请求头实现鉴权，还原算法后用 Python + execjs 复用 JS 成功请求，关键坑是相对 require 和原型链污染。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-8160-b30f-c36995889bb9
ioc:
  cves: []
  cwes: []
  hashes:
    - 13ade1de1eff43ffb821735f352a4148
    - 2fab58aaa35544d9c44bd789aa6af1cb
    - 56f5cff3cad14853a44782c2c689ab2a
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 宝钢股份 CMS 接口通过 MD5 校验请求体、HMAC-SHA1 签名请求头实现鉴权，还原算法后用 Python + execjs 复用 JS 成功请求，关键坑是相对 require 和原型链污染。
> 
> - **签名算法：** 待签名串为 `POST\n{url}\nx-user:...\nx-nonce:...\nx-date:...\nContent-Md5:...\n`，用固定密钥 `13ade1de1eff43ffb821735f352a4148` 做 HMAC-SHA1，结果转大写 40 位十六进制。
> - **各字段生成：** `x-user` 为固定值 `0/`+UUID；`x-nonce` 为 10 位随机数字；`x-date` 为 `parseInt(Date.now()/1000)` 秒级时间戳；`Content-Md5` 是对请求体 `JSON.stringify` 后算的 32 位小写 MD5。
> - **最大坑点：** `arg_sum.js` 中 `require("./arg_md5")` 按 cwd 解析，execjs 调用前必须 `os.chdir` 到 js 目录，否则报 `Cannot find module`。
> - **原型链污染：** 抠 crypto-js 时 `extend` 若挂到 `Object.prototype`，`for...in` 会多枚举出 `extend`，导致 HMAC 结果错误；应挂回 Base 原型。
> - **一致性要求：** 请求体键顺序与紧凑格式需与签名时一致（`separators=(',',':')`），签名串方法大写、行尾 `\n` 一个不能少；`page` 与 body 中 `pageNo` 相差 1（0 基）。

> 本文是「JS 逆向实战 30 例」系列第 3 篇，项目源码：https://github.com/scool112/openJSReverse （ `Project3` ）

## 一、目标与背景

宝钢股份官网的新闻列表，接口放在 `cmsauth.baowugroup.com` 上，请求头里带了一整套签名：

-   站点： `https://www.baosteel.com/media/news`
-   目标接口： `https://cmsauth.baowugroup.com/v1/web/api/content/list?domainId=12`
-   需还原字段（请求头）： `Content-Md5` 、 `x-date` 、 `x-nonce` 、 `x-signature` 、 `x-user`
-   难度：⭐⭐⭐（三星。算法是标准的 MD5 + HMAC-SHA1，但签名串的拼装格式、密钥、以及「相对 require」是三个坑点）

这个项目是 **请求头签名** 的教科书案例：接口用 `Content-Md5` 校验请求体完整性，用 `x-nonce` / `x-date` 防重放，用 `x-signature` （HMAC-SHA1）做整体签名，还带一个固定的 `x-user` 应用标识。我的做法是 **把签名逻辑拆成三个可复用模块**：MD5、HMAC-SHA1、拼装入口。

## 二、抓包分析

打开 `https://www.baosteel.com/media/news` ，F12 → **Network** → 筛 `Fetch/XHR` ，翻一下新闻列表，就能看到对 `cmsauth.baowugroup.com/v1/web/api/content/list` 的请求。

这是一个 **POST**， `Content-Type: application/json;charset=UTF-8` ，请求体是：

```json
{"pageNo":2,"pageSize":12,"condition":{"nodeId":436}}
```

`pageNo` 是页码（注意这里是 **0 基**， `pageNo:2` 对应第 3 页）。请求头里最扎眼的是这几个：

```
Content-Md5: 2fab58aaa35544d9c44bd789aa6af1cb
x-date: 1784356789
x-nonce: 3552214493
x-signature: 2C3A...（40 位大写的十六进制）
x-user: 0/56f5cff3cad14853a44782c2c689ab2a
```

几个判断：

-   `x-user` 形态固定（ `0/` + 一段 UUID），像是一个固定的应用/租户标识，值不随请求变化；
-   `x-date` 是 **秒级** 时间戳（10 位）， `x-nonce` 是 10 位随机数字，两者防重放；
-   `x-signature` 是 40 位大写十六进制 → 典型的 **SHA1** 长度，说明是 HMAC-SHA1；
-   `Content-Md5` 是 32 位小写十六进制 → **MD5**，用来校验请求体。

【图1：Network 面板里 content/list 请求的 Request Headers —— 建议截图】

结论：要还原的是「怎么由 method / url / body / nonce / date 拼出 `x-signature` 」，以及 `Content-Md5` 的算法。

## 三、定位加密入口

在 **Sources** 面板全局搜 `x-signature` 或 `x-nonce` ，很容易定位到 axios 的请求拦截器（ `interceptors.request.use` ）。因为是 axios 封装，拦截器里通常就是「给 config.headers 挨个赋值」的那段。

我把这段拦截器抠出来，顺手把 axios 本身的无关字段也保留成了配置对象，得到仓库里的入口 `js/arg_sum.js` 。下面是完整逻辑：

```javascript
// 取自仓库真实 js：Project3/baosteel/js/arg_sum.js
var Md5 = require("./arg_md5");
var Hmac = require("./arg_HmacSHA1")

function arg_sum(page){
    var page_tru = page - 1;
    function l(e) {
        for (var n = [], t = Array.of("0", "1", "2", "3", "4", "5", "6", "7", "8", "9"), a = 0; a < e; a++) {
            var c = Math.floor(10 * Math.random());
            n[a] = t[c]
        }
        return n.join("")
    }
    function s() {
        return parseInt((new Date).getTime() / 1e3)
    }
    var e = {
        "transformRequest": {},
        "transformResponse": {},
        "timeout": 20000,
        "xsrfCookieName": "XSRF-TOKEN",
        "xsrfHeaderName": "X-XSRF-TOKEN",
        "maxContentLength": -1,
        "headers": {
            "common": {
                "Accept": "application/json, text/plain, */*"
            },
            "delete": {},
            "get": {},
            "head": {},
            "post": {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            "put": {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            "patch": {
                "Content-Type": "application/x-www-form-urlencoded"
            },
        },
        "method": "post",
        "baseURL": "https://cmsauth.baowugroup.com",
        "url": "/v1/web/api/content/list?domainId=12",
        "data": {
            "pageNo": page_tru,
            "pageSize": 12,
            "condition": {
                "nodeId": 436
            }
        }
    }
    var n = l(10)
        , t = s()
        , a = Md5.Md5(e.data)
        , c = ""
        , o = "0/56f5cff3cad14853a44782c2c689ab2a"
        , i = "13ade1de1eff43ffb821735f352a4148";
    e.headers["x-user"] = o,
        e.headers["x-nonce"] = n,
        e.headers["x-date"] = t,
        e.headers["Content-Md5"] = a,
        c = "".concat(e.method.toUpperCase(), "\n").concat(e.url.replace(e.baseURL, ""), "\nx-user:").concat(o, "\nx-nonce:").concat(n, "\nx-date:").concat(t, "\nContent-Md5:").concat(a, "\n");
    var u = Hmac.hmac(c,i)
    e.headers["x-signature"] = u
    e.headers["x-date"] = e.headers["x-date"].toString();
    // console.log(e.headers)
    return e.headers
}

 // console.log(arg_sum(2))
```

从这段可以完整读出签名协议：

1.  `n = l(10)` ：生成 **10 位随机数字** → `x-nonce` ；
2.  `t = s()` ： `parseInt(Date.now()/1000)` → **秒级时间戳** → `x-date` ；
3.  `a = Md5.Md5(e.data)` ：对请求体做 **MD5** → `Content-Md5` （注意 `Md5.Md5` 内部会把对象 `JSON.stringify` 后再算）；
4.  `o = "0/56f5cff3..."` ：固定 `x-user` ； `i = "13ade1de1eff43ffb821735f352a4148"` ： **HMAC 的密钥**；
5.  拼「待签名串」 `c` ，格式非常关键：

```
POST
/v1/web/api/content/list?domainId=12
x-user:0/56f5cff3cad14853a44782c2c689ab2a
x-nonce:3552214493
x-date:1784356789
Content-Md5:2fab58aaa35544d9c44bd789aa6af1cb
（末尾还有一个 \n）
```

6.  `u = Hmac.hmac(c, i)` ：对 `c` 用密钥 `i` 做 **HMAC-SHA1**，结果即 `x-signature` 。

拼串顺序、字段名、大小写、每行末尾的 `\n` 都必须一模一样，差一个字符签名就废。

【图2：Sources 面板里 axios 请求拦截器 / HMAC 断点调用栈 —— 建议截图】

## 四、JS 还原与补环境

宝钢这份 JS 没有依赖 `window` / `document` ，但站点用的加密库被做了一点「取巧」处理（把 crypto-js 的 MD5/HMAC 抠出来独立成文件）。于是我把算法拆成三个文件：

```javascript
// 取自仓库真实 js：Project3/baosteel/js/arg_md5.js（尾部）
function MD5_my(Data){
    var md5 = r.MD5(JSON.stringify(Data ? Data : "")).toString(r.enc.Hex)
    return md5
}

module.exports = {
    Md5:MD5_my
}
```

```javascript
// 取自仓库真实 js：Project3/baosteel/js/arg_HmacSHA1.js（尾部）
RR = {
    HmacSHA1:function(e, r) {
        return new LL.HMAC.init(TT,r).finalize(e)
    }
}

function Hmac_my(c,i){
    var u = RR.HmacSHA1(c, i).toString().toUpperCase();
    return u
}

module.exports = {
    hmac:Hmac_my
}
```

注意两点：

-   `arg_md5.js` 里 `MD5_my` 对 `Data` 做了 `JSON.stringify` ，所以 Python 侧可以放心把请求体对象传进来；传 `""` /空则按空字符串算；
-   `arg_HmacSHA1.js` 的 `Hmac_my` 最后调了 **`.toUpperCase()`**，所以 `x-signature` 是大写的——这一点必须照抄。

这两个文件的开头都是手工「重塑」出来的 crypto-js 内部结构（ `proto3` / `proto2` / `Object.create` 那一套原型链）， `arg_HmacSHA1.js` 顶部的注释也印证了当初踩的坑：

```javascript
// 取自仓库真实 js：Project3/baosteel/js/arg_HmacSHA1.js（文件头注释）
/*
 proto1_TT.cfg.__proto__.extend = function(t) { ... }

 proto1_TT.cfg.__proto__ 指向的是 Object.prototype，相当于在所有对象上都添加了一个可枚举的 extend 方法。当 mixIn 中的
 for (var e in t) 遍历参数 t 时，会沿着原型链上溯到 Object.prototype，枚举出 "extend"，所以你的断点中 e = "extend"。
 而在浏览器中，extend 与 mixIn 是定义在同一个 Base 原型对象上的，Object.prototype 上没有 extend，所以 e 是正确的。
 */
```

也就是说： **在浏览器里 crypto-js 的 `extend` 挂在 `Base` 原型上，而顶层 `Object` 上没有；抠代码时如果不小心把 `extend` 挂到了 `Object.prototype` ， `for...in` 就会多枚举出 `extend` ，导致 HMAC 结果错误。** 这是本项目的核心坑点之一。

## 五、Python 实现

`py/baosteel.py` 里有一处很关键的处理—— **先 `os.chdir` 到 js 目录**，因为 `arg_sum.js` 用了 `require("./arg_md5")` ：

```python
# 取自仓库真实 py：Project3/baosteel/py/baosteel.py
import requests
import json
import os
import execjs

def Spider_baosteel(page:int):
    base_path  =  os.path.dirname(os.path.abspath(__file__))
    js_path = os.path.join(base_path,"..","js","arg_sum.js")
    js_dir = os.path.dirname(js_path)
    os.chdir(js_dir)
    with open(js_path,encoding="utf-8") as f:
        js_code = f.read()
    js = execjs.compile(js_code)
    headrs_arg = js.call("arg_sum",page)
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Md5": headrs_arg['Content-Md5'],
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://www.baosteel.com",
        "Referer": "https://www.baosteel.com/",
        # ... 其余为常规浏览器头（Accept-Language / Cache-Control / Connection /
        # Pragma / Sec-Fetch-* / User-Agent / dnt / sec-ch-ua* 等），此处节选
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "x-date": headrs_arg['x-date'],
        "x-nonce": headrs_arg['x-nonce'],
        "x-signature": headrs_arg['x-signature'],
        "x-user": headrs_arg['x-user']
    }
    url = "https://cmsauth.baowugroup.com/v1/web/api/content/list"
    params = {
        "domainId": "12"
    }
    data = {
        "pageNo": page - 1,
        "pageSize": 12,
        "condition": {
            "nodeId": 436
        }
    }
    data = json.dumps(data, separators=(',', ':'))
    print(headers)
    response = requests.post(url, headers=headers, params=params, data=data)

    print(response.text)
    print(response)


Spider_baosteel(3)
```

重点：

-   **`os.chdir(js_dir)`**：这是解决方案里最容易被忽略的一步。 `execjs` 默认用 Node， `require("./arg_md5")` 这种相对路径是相对 **当前工作目录** （cwd）解析的，不是相对 JS 文件。所以先把 cwd 切到 `js/` ， `require` 才能找到同目录的 `arg_md5.js` / `arg_HmacSHA1.js` 。
-   **请求体要和签名时完全一致**： `arg_sum` 内部签名用的 `e.data` 是 `{"pageNo": page-1, "pageSize": 12, "condition": {"nodeId":436}}` ；Python 发给服务端的 body 必须用同一份对象、同一顺序、同样紧凑（ `separators=(',', ':')` ），否则 `Content-Md5` 对不上。
-   **`page` 与 `pageNo` 差 1**：传 `page=3` ，实际 `pageNo=2` 。

## 六、运行结果

执行 `python baosteel.py` ，终端先打印由 JS 生成的整套签名头，再打印接口返回的新闻列表：

```javascript
{'Content-Md5': '2fab58aaa35544d9c44bd789aa6af1cb', 'x-user': '0/56f5cff3cad14853a44782c2c689ab2a', 'x-nonce': '3552214493', 'x-date': '1784356789', 'x-signature': '2C3A...40位大写...'}
{"code":200,"data":{"records":[{"title":"...","publishDate":"...","contentId":...}, ...],"total":...},"message":"success"}
<Response [200]>
```

只要返回 `code:200` 且有 `records` ，说明 MD5 + HMAC-SHA1 两条链路都对了。如果返回签名错误（401/403），优先核对拼串格式和 `x-date` / `x-nonce` 是否和签名时用的同一份值。

【图3：终端打印出的签名头与新闻列表数据 —— 建议截图】

## 七、踩坑与注意

1.  **相对 `require` 是最大坑。** `arg_sum.js` 里 `require("./arg_md5")` 依赖 cwd，Python 侧必须 `os.chdir(js_dir)` ，否则 `execjs` 报 `Cannot find module './arg_md5'` 。这也是 README 里专门点名的问题。
    
2.  **`extend` 挂错原型会导致 HMAC 出错。** 把 crypto-js 抠出来时， `extend` 必须挂在它自己的 `Base` 原型上，而不是 `Object.prototype` ，否则 `for...in` 会多枚举出 `extend` （文件头注释记录了这个坑）。
    
3.  **`x-signature` 必须大写。** `Hmac_my` 里做了 `.toUpperCase()` ，Python 侧不要自作主张 `.lower()` 。
    
4.  **签名串格式脆弱。** 方法大写、url 去掉 baseURL、字段名原样、每行末尾 `\n` （含最后一行），任何一处不一致都会失败。建议和浏览器里断点抓到的 `c` 逐字符比对。
    
5.  **请求体一致。** `Content-Md5` 是对 body 做的，body 的键顺序/紧凑度都要和签名时一致； `page` 传参与 `pageNo` 差 1。
    
6.  **低频请求、遵守条款。**
    

## 八、总结

1.  **`Content-Md5 + x-nonce + x-date + HMAC-SHA1` 是 CMS 类接口的常见组合**：MD5 保体、nonce/date 防重放、HMAC 做整体签名。
2.  **抠 crypto-js 时最怕原型链污染** （ `extend` 挂到 `Object.prototype` ），会静默改变哈希结果，务必按原库方式挂载。
3.  **`execjs` 调有相对 `require` 的 JS，先 `os.chdir` 到 JS 所在目录**，这是能用起来的关键一步。

* * *
