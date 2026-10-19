---
title: 【看雪】36Kr 登录接口 sign 签名 + 密码 RSA 加密逆向实战（JS 逆向 / MD5 签名 / JSEncrypt / execjs）
source: https://bbs.kanxue.com/thread-293266.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-19T08:04:10+08:00
trace_id: 37fc4898-b642-4c1b-a274-20029b0276a1
content_hash: fc3717f11f877cec77f77514ea5ba2c093a157d28e81af42c2e89dc82842a481
status: synced
tags:
  - 看雪
  - 协议分析
  - 密码学
series: null
feed_source: 看雪·逆向工程
ai_summary: 36Kr 登录的 sign 由请求体紧凑 JSON 与首页下发的 nonce 拼接后做 MD5 生成；手机号和密码则分别用固定 RSA 公钥加密后再 Base64，因此需要“先取 nonce、再算签名”两段配合才能还原登录协议。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fe75244-d011-81de-a86d-d1547913e724
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 36Kr 登录的 sign 由请求体紧凑 JSON 与首页下发的 nonce 拼接后做 MD5 生成；手机号和密码则分别用固定 RSA 公钥加密后再 Base64，因此需要“先取 nonce、再算签名”两段配合才能还原登录协议。
> 
> - **签名算法：** `sign = md5(body紧凑JSON + window.__GATEWAY_SIGN__)`；其中 JSON 的字段顺序必须是 krtoken→partner_id→timestamp→param，最终拼成 `{"krtoken":"","partner_id":"web","timestamp":...,"param":{...}}`，顺序或空格变化都会导致校验失败。
> - **加密方式：** 手机号与密码用 JSEncrypt 的 `setPublicKey` + `encrypt`（PKCS#1 v1.5，每次密文不同），结果 Base64 放入 `param`；并非 `encryptLong`。
> - **nonce 获取：** 请求首页后从 `<script async>window.__GATEWAY_SIGN__="..."` 切出该值，它与 WAF Cookie（如 `_c_WBKFRo`）配套，Cookie 失效就取不到。
> - **一致性强约束：** 签名中的密文必须与实际发出的密文来自同一次加密调用，重复加密会导致 sign 对不上；Python 侧用 `json.dumps(separators=(',',':'))` 复现紧凑格式并保持字段顺序。
> - **代码与环境：** JS 侧保留 webpack 运行时以取 `BBB(491)` 的 JSEncrypt 模块，补 `window=global; self=window`，md5 依赖 `crypto-js`；Python 用 execjs 编译调用，签名放 query、其余参数放 body。

## 36Kr 登录接口 sign 签名 + 密码 RSA 加密逆向实战（JS 逆向 / MD5 签名 / JSEncrypt / execjs）

> 本文是「JS 逆向实战 30 例」系列第 9 篇，项目源码： [JS 逆向实战 30 例 · 开源仓库](https://github.com/scool112/openJSreverse) （ `Project9` ）

## 一、目标与背景

36Kr 的手机号密码登录，我想还原它的登录协议。

-   站点： `https://36kr.com/`
    
-   目标接口： `https://gateway.36kr.com/api/mus/login/byMobilePassword`
    
-   需还原字段： `sign` 、 `nonce` 、 `timestamp` 、 `mobileNo` 、 `password`
    
-   难度：⭐⭐⭐⭐（四星。手机号 / 密码各自 RSA 加密，再加一层 MD5 签名，且签名依赖首页下发的动态 `nonce` ）
    

这个项目有意思的地方在于： **签名里混入了一个来自首页的随机串 `nonce`**，也就是 `window.__GATEWAY_SIGN__` 。只扣 JS 还不够，必须先请求一次首页把这个值取回来，才能算出正确的 `sign` 。这在网关型 API（gateway）里非常常见。

## 二、抓包分析

打开 `https://36kr.com/` ，登录框输入手机号密码点登录，F12 → **Network**，抓 `byMobilePassword` 这个请求。

先看 **Request URL 的 Query**：

```
POST https://gateway.36kr.com/api/mus/login/byMobilePassword?sign=<32位十六进制>
```

`sign` 挂在 **query** 上。

再看 **Payload（请求体）**，是一个 JSON：

```json
{
  "nonce": "<base64 串>",
  "krtoken": "",
  "partner_id": "web",
  "timestamp": 1785212736314,
  "param": {
    "countryCode": "86",
    "mobileNo": "<base64 密文>",
    "password": "<base64 密文>"
  }
}
```

规律非常清晰：

-   `mobileNo` / `password` 都是 **Base64 密文** （RSA 加密后 Base64）；
    
-   `nonce` 是一个 Base64 串；
    
-   `timestamp` 是毫秒时间戳；
    
-   `sign` 是 query 上的 MD5 串。
    

【图1：byMobilePassword 请求的 Query 里的 sign 与 Body 里的加密 param —— 建议截图】

还有一个关键线索：登录前页面里会有 `window.__GATEWAY_SIGN__="..."` ，它就是这里的 `nonce` 。

## 三、定位加密入口

登录是前端 JS 发出的，所以定位思路：

1.  **XHR 断点**：在 Sources → XHR/Fetch Breakpoints 里加 `byMobilePassword` ，触发登录，断下来后看调用栈；
    
2.  **往上层回溯**：找到封装请求的函数后，往上看它怎么组装 `param` 和 `sign` ；
    
3.  同时全局搜 `setPublicKey` 、 `JSEncrypt` 、 `encrypt` 、 `MD5` 、 `sign` 。
    

最终抠出来的核心函数 `get_arg` （来自真实文件 `js/36kr_2.js` ）：

```javascript
// 取自仓库真实 js：Project9/36kr/js/36kr_2.js
function get_arg(GATEWAY_SIGN){
    var i = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCeiLxP4ZavN8qhI+x+whAiFpGWpY9y1AHSQC86qEMBVnmqC8vdZAfxxuQWeQaeMWG07lXhXegTjZ5wn9pHnjg15wbjRGSTfwuZxSFW6sS3GYlrg40ckqAagzIjkE+5OLPsdjVYQyhLfKxj/79oOfjl/lV3rQnk/SSczHW0PEyUbQIDAQAB"
        , a = function() {
        var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "";
        if (true) {
            var t = BBB(491)
                , r = new t.JSEncrypt;
            r.setPublicKey(i);
            var a = r.encrypt(e);
            return a
        }
    }
    countryCode = "86"
    mobileNo = a("你的手机号")
    password = a("你的密码")
    var timestamp = Date.now();
    var OO = GATEWAY_SIGN
    Arg = '{"krtoken":"","partner_id":"web","timestamp":' + timestamp.toString() + ',"param":{"countryCode":"86","mobileNo":"' + mobileNo + '","password":"' + password + '"}}' + OO
    var sign = md5(Arg)
    li = {}
    li["countryCode"] = countryCode
    li["mobileNo"] = mobileNo
    li['password'] = password
    li["timestamp"] = timestamp
    li["nonce"] = OO
    li["sign"] = sign
    return li
}
```

拆解一下：

-   `i` 是站点写死的 **RSA 公钥**；
    
-   `a(...)` 是一个内部函数：用 `BBB(491)` 拿到 webpack 里的 `JSEncrypt` 模块， `setPublicKey(i)` 后 `encrypt()` ，对手机号 / 密码分别加密（注意 RSA 加密是 **每次都带随机 padding** 的，所以同样的手机号每次密文也不同）；
    
-   `md5` 是文件顶部定义的 `cryto_js.MD5(text).toString()` ；
    
-   **`sign = md5(JSON串 + GATEWAY_SIGN)`**—— 这就是签名精髓：把登录 body 的 JSON **原样字符串** 再拼上首页下发的 `nonce` ，一起 MD5。
    

文件顶部很简单，直接 `require('crypto-js')` ：

```javascript
// 取自仓库真实 js：Project9/36kr/js/36kr_2.js（顶部）
window = global
self = window

var cryto_js = require('crypto-js');
function md5(text) {          // md5加密
    return cryto_js.MD5(text).toString()
}
```

【图2：XHR 断点命中后回溯到 get_arg 的调用栈 —— 建议截图】

## 四、JS 还原与补环境

这一篇的还原重点是 **两段环境的配合**：

### 1\. 先拿 nonce（GATEWAY_SIGN）

`nonce` 不从 JS 里算，而是 **从首页 HTML 里抠**。仓库里 `py/arg.py` 专门干这件事：

```swift
# 取自仓库真实 py：Project9/36kr/py/arg.py
import requests

def get_arg()->str:
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "https://36kr.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\""
    }
    cookies = {
        "_c_WBKFRo": "你的_c_WBKFRo",
        "_nb_ioWEgULi": "",
        "SERVERID": "你的SERVERID",
        "_wafchallengeid": "你的_wafchallengeid",
        "_waftokenid": "你的_waftokenid"
    }
    url = "https://36kr.com/"
    response = requests.get(url, headers=headers, cookies=cookies).text
    res = response.split('<script async>window.__GATEWAY_SIGN__="')[1].split('"')[0]
    return res
```

做法就是 GET 首页，然后从 `<script async>window.__GATEWAY_SIGN__="..."` 里切出那串 Base64。 **注意 `nonce` 和 Cookie 是配套的**， `_c_WBKFRo` 这类 WAF Cookie（占位符 `你的_c_WBKFRo` ）如果失效，首页可能拿不到这个值。

### 2\. 算 mobileNo / password / sign

把上一步的 `nonce` 作为 `GATEWAY_SIGN` 参数喂给 `36kr_2.js` 的 `get_arg` ：

-   补环境只做了 `window = global; self = window` ；
    
-   `JSEncrypt` 从 webpack 模块 `BBB(491)` 里取，所以我 **把整个 webpack 运行时保留**，没有把那段 `!function(e){...}` 删掉；
    
-   `md5` 用 `crypto-js` ，所以要 `npm i crypto-js` 。
    

关于 RSA 加密，几个必须记住的点：

-   用 `setPublicKey` + `encrypt` ， **不是** `encryptLong` （这里手机号密码都不长）；
    
-   每次 `encrypt` 结果不同（PKCS#1 v1.5 随机填充），所以 **`sign` 里的密文和实际发出去的密文必须来自同一次调用**，不能分开算两次。
    

## 五、Python 实现

主脚本 `py/36kr.py` 把“取 nonce → 生成签名参数 → 发登录请求”串起来：

```lua
# 取自仓库真实 py：Project9/36kr/py/36kr.py
import requests
import json
from arg import get_arg
import os
import execjs

GATEWAY_SIGN = get_arg()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JsPath = os.path.join(BASE_DIR, '..', 'js', '36kr_2.js')
with open(JsPath, encoding="utf-8") as f:
    Js_code = f.read()
Js = execjs.compile(Js_code)
arg = Js.call(get_arg, GATEWAY_SIGN)

headers = {
    "Content-Type": "application/json",
    "Origin": "https://36kr.com",
    "Referer": "https://36kr.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    # ...其余 sec-ch-ua / dnt 等略...
}
cookies = {
    "sensorsdata2015jssdkcross": "你的sensorsdata",
    "_c_WBKFRo": "你的_c_WBKFRo",
    "_nb_ioWEgULi": ""
}
url = "https://gateway.36kr.com/api/mus/login/byMobilePassword"
params = {
    "sign": arg["sign"]
}
data = {
    "nonce": arg["nonce"],
    "krtoken": "",
    "partner_id": "web",
    "timestamp": arg["timestamp"],
    "param": {
        "countryCode": arg["countryCode"],
        "mobileNo": arg["mobileNo"],
        "password": arg["password"]
    }
}
data = json.dumps(data, separators=(',', ':'))

response = requests.post(url, headers=headers, cookies=cookies, params=params, data=data)

print(response.text)
print(response)
```

结构非常干净： `get_arg()` （network）拿 `nonce` → `Js.call(...)` 拿签名参数 → `sign` 放 query、其余放 body。

> ⚠️ 小提醒：这里 `Js.call(get_arg, GATEWAY_SIGN)` 的第一个参数严格来说应该是 **函数名字符串** （ `"get_arg"` ）。仓库里直接把 Python 的 `get_arg` 函数对象传了进去（因为 `from arg import get_arg` 同名），属于一个容易踩的写法坑，实际使用时建议写成 `Js.call("get_arg", GATEWAY_SIGN)` ，语义更明确。

## 六、运行结果

执行 `python 36kr.py` ，终端会打印登录接口的返回。如果账号密码正确、签名与 nonce 匹配，会返回类似：

```css
{"code":0,"data":{"token":"...","userId":...},"msg":"success"}
```

如果 `sign` 不对，会返回签名校验失败的提示——这正好可以用来验证我们的签名算法是否还原正确。

【图3：终端打印登录接口返回 —— 建议截图】

## 七、踩坑与注意

1.  **`nonce` 和 Cookie 是配套的。** `GATEWAY_SIGN` 来自首页，首页又依赖 WAF Cookie（ `_c_WBKFRo` 等占位符）。换一套 Cookie 后要重新请求首页拿新 `nonce` ，否则签名必错。
    
2.  **`sign` 里的密文必须和发出去的密文一致。** RSA 每次加密都带随机填充，如果你为了打印调试而对密码调了两次 `a("你的密码")` ，两次密文不同，签出来的 `sign` 就对不上。
    
3.  **`sign` 拼的是 body 的紧凑 JSON。** `Arg` 里字段顺序是 `krtoken → partner_id → timestamp → param` ，顺序和空格都影响 MD5， **必须和最终发出的 JSON 完全一致**。Python 侧用了 `json.dumps(..., separators=(',', ':'))` 来保证紧凑格式，但 **字段顺序由 dict 决定**，要保证和 JS 里拼的一样。
    
4.  **`JSEncrypt` 从 webpack 模块取。** 别把 `BBB(491)` 那段 webpack 运行时删掉，否则找不到模块。
    
5.  **`self = window` 也要补。** 有些打包代码会访问 `self` ，Node 里没有，补上更稳。
    
6.  **`crypto-js` 依赖。** 顶部 `require('crypto-js')` 需要 `npm i crypto-js` 。
    
7.  **账号密码脱敏。** 仓库里 `mobileNo = a("你的手机号")` / `password = a("你的密码")` 都是占位符，跑之前换成自己的可用测试账号。
    

## 八、总结

1.  **网关型 API 的签名常常混入“首页下发的随机 nonce”**，所以还原 = “取 nonce（Python）+ 算签名（JS）”两段配合。
    
2.  **RSA 加密结果每次不同，签名与密文必须取自同一次调用**，否则前后端校验必然失败。
    
3.  **签名的拼串顺序和 JSON 紧凑格式是硬约束**，Python 复现 body 时字段顺序要和 JS 完全对齐。
    

* * *
