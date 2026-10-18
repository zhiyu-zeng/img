---
title: 【看雪】五矿电商 ec.minmetals 请求 param 参数 RSA 长加密逆向实战（JS 逆向 / JSEncrypt / 补环境 / subprocess node）
source: https://bbs.kanxue.com/thread-293262.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-18T09:41:36+08:00
trace_id: 2c82cf7c-652b-4d49-897e-1951dd2ef822
content_hash: 5947fcdc385a4acfe8b5c8e7421eb1b4419aed89cc1a55eae127c81043b9dd7f
status: synced
tags:
  - 看雪
  - 协议分析
  - 密码学
series: null
feed_source: 看雪·逆向工程
ai_summary: 五矿电商采购列表接口的 `param` 字段是“动态公钥 RSA 长加密”的产物，因此需要先获取 Cookie，再换取公钥，最后用公钥加密参数；三步必须使用同一会话。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fd75244-d011-81d2-a270-e7a69aa2cabb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 五矿电商采购列表接口的 `param` 字段是“动态公钥 RSA 长加密”的产物，因此需要先获取 Cookie，再换取公钥，最后用公钥加密参数；三步必须使用同一会话。
> 
> - **加密链路：** `POST /logonAction.do` 获取 `__jsluid_s`、`JSESSIONID`、`SUNWAY-ESCM-COOKIE`，`POST /open/homepage/public` 返回 Base64 公钥（`MIGf...` 开头），业务接口 `/open/homepage/cgxj/by-lx-page` 的请求体只有一个 `param` 字段。
> 
> - **明文结构：** 加密前的 JSON = 业务查询条件（`lx: "CGGG"`、`pageIndex` 等）+ `sign`（对 `JSON.stringify(EE)` 求 MD5 小写十六进制）+ `timeStamp`（毫秒时间戳），入口函数为 `get_arg`。
> 
> - **长加密约定：** 站点重写 `encryptLong`，用 `A.match(/.{1,50}/g)` 按 50 字符分段，分别加密后拼接；分段长度不可修改，否则分段边界和拼接顺序会改变，服务端无法解密。
> 
> - **补环境与调用：** 只需 `window = global` 与 `window.crypto = require('crypto-js')`；Python 侧用 `subprocess + node -e + vm` 执行，通过 `vm.createContext` 构造沙箱，将 `window`、`global`、`globalThis` 指向该沙箱，再将 `crypto-js` 重定向到 Node 内置 `crypto`，参数经环境变量传入、用 `JSON.stringify` 输出结果。
> 
> - **踩坑：** `__jsluid_s` 是加速乐风控 Cookie，不能伪造；`subprocess.run` 必须指定 `encoding="utf-8"`，否则 Windows 下按 GBK 解码中文会崩；传给 Node 的参数使用 `ensure_ascii=True`，以防中文编码问题。

## 五矿电商 ec.minmetals 请求 param 参数 RSA 长加密逆向实战（JS 逆向 / JSEncrypt / 补环境 / subprocess node）

> 本文是「JS 逆向实战 30 例」系列第 8 篇，项目源码：JS 逆向实战 30 例 · 开源仓库 （ `Project8` ）

## 一、目标与背景

五矿电商（五矿集团采购平台）的采购信息页，我想抓它的采购公告列表。

-   站点： `https://ec.minmetals.com.cn/`
-   目标接口： `https://ec.minmetals.com.cn/open/homepage/cgxj/by-lx-page`
-   需还原字段： `param` （**RSA 长加密**）。请求体里只有一个字段 `param` ，它是把所有查询条件（含签名、时间戳）整体 RSA 加密后的密文。
-   难度：⭐⭐⭐⭐（四星。RSA 长加密 + 前置 Cookie + 动态公钥，且公钥是每次请求从服务端拉的）

和上一篇（观鸟记录）的 RSA 有点像，但这里有两个新东西值得单独写一篇：

1.  **公钥不是写死的**，而是启动时从 `/open/homepage/public` 动态拉取；
2.  要 **先拿 Cookie** （ `__jsluid_s` / `JSESSIONID` / `SUNWAY-ESCM-COOKIE` ）才能拉公钥、才能请求业务接口。

## 二、抓包分析

打开 `https://ec.minmetals.com.cn/open/home/purchase-info?tabIndex=5` ，F12 → **Network**，筛 `Fetch/XHR` ，在不同 tab 之间切换就能抓到：

```
POST https://ec.minmetals.com.cn/open/homepage/cgxj/by-lx-page
Content-Type: application/json

{"param":"<一大段 Base64 密文>"}
```

整个请求体只有一个 `param` ，其他什么查询条件都看不到——说明 **所有业务参数都被塞进 `param` 里一起加密了**。

同时我注意到一个前置请求：

```
POST https://ec.minmetals.com.cn/open/homepage/public
```

它的响应是 **一段 Base64**，通常是 `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...` 开头 —— 一眼就是 **RSA 公钥** （ `MIGf` 是 PEM/DER 里常见的前缀）。也就是说，站点是“ **动态下发公钥，前端用它加密 param** ”的模式。

再看请求 Cookie，有 `__jsluid_s` 、 `JSESSIONID` 、 `SUNWAY-ESCM-COOKIE` ，其中 `__jsluid_s` 是典型的\*\*加速乐（Jslu）\*\*风控 Cookie。所以完整链路应该是：

```
1) GET  /logonAction.do            拿基础 Cookie
2) POST /open/homepage/public      用 Cookie 换公钥
3) POST /open/homepage/cgxj/by-lx-page 用公钥加密 param 后请求
```

【图1：by-lx-page 请求体只有 param，以及 public 接口返回公钥 —— 建议截图】

## 三、定位加密入口

在 Sources 里搜 `param` 不太好搜（太常见），我改用 **搜加密库特征**：

-   搜 `setPublicKey` 、 `encryptLong` 、 `JSEncrypt` 、 `RSAKey` 。
-   很快定位到入口函数 `get_arg` ，逻辑如下（来自真实文件 `js/minmetals2.js` ）：

```javascript
// 取自仓库真实 js：Project8/minmetals/js/minmetals2.js
function get_arg(page,publickey){
    r = publickey
    TT = new EEE()
    TT.setPublicKey(r)

    EE = {
        "businessClassfication": "",
        "dwmc": "",
        "inviteMethod": "",
        "lx": "CGGG",
        "mc": "",
        "pageIndex": page
    }

    function AAAAA (t) {
        var e = "hex"
        return new Md5(!0).update(t)[e]()
    }

    AAA = mmm(mmm({}, EE), {}, {
        sign: AAAAA(JSON.stringify(EE)),
        timeStamp: +new Date
    })

    s = TT.encryptLong(JSON.stringify(AAA))

    return {"param":s}
}
```

一眼就懂：

-   `EE` 是业务查询条件（分类、物资名称、采购方式、类型 `CGGG` 、页码 `pageIndex` ）；
-   `AAAAA` 是 MD5（ `new Md5(!0).update(t)['hex']()` ，返回十六进制小写），对 `JSON.stringify(EE)` 求 `sign` ；
-   `AAA = { ...EE, sign, timeStamp }` ；
-   最后 `TT.encryptLong(JSON.stringify(AAA))` 做 **RSA 长加密**，结果就是 `param` 。

再看这个文件顶部，站点给环境补了 `window` 和 `crypto-js` ：

```javascript
// 取自仓库真实 js：Project8/minmetals/js/minmetals2.js（顶部）
window = global
window.crypto = require('crypto-js');
```

这说明它内部依赖 `window.crypto` ，Node 环境下需要把 `crypto-js` 挂上去。

另外仓库里还有个 `js/arg.js` ，它不是业务代码，而是一段 **从浏览器里抓下来的 fetch 请求片段** （用浏览器控制台直接取公钥用的，Cookie 是占位符）：

```javascript
// 取自仓库真实 js：Project8/minmetals/js/arg.js
var a = fetch("https://ec.minmetals.com.cn/open/homepage/public", {
    "headers": {
        "cookie": "你的cookie(形如 __jsluid_s=...; SUNWAY-ESCM-COOKIE=...; JSESSIONID=...)",
        "Referer": "https://ec.minmetals.com.cn/open/home/purchase-info?tabIndex=5"
    },
    "method": "POST"
});
console.log(a)
```

【图2：Sources 里 setPublicKey / encryptLong 调用栈 —— 建议截图】

## 四、JS 还原与补环境

`minmetals2.js` 是自包含的：RSA（ `EEE` / `TT` ）、MD5（ `Md5` ）都在文件里，唯一的外部依赖是 `require('crypto-js')` 。所以补环境只做两件事：

1.  `window = global` ；
2.  `window.crypto = require('crypto-js')` 。

长加密的实现值得一提。站点重写了 `encryptLong` ，会把长文本 **按 50 字符分段** 分别 RSA 加密再拼接（来自真实文件）：

```javascript
// 取自仓库真实 js：Project8/minmetals/js/minmetals2.js
e.prototype.encryptLong = function(A) {
    var e = this.getKey()
        , t = (e.n.bitLength() + 7 >> 3) - 11;
        var n = ""
            , r = "";
        if (A.length > t)
            return n = A.match(/.{1,50}/g),
                n.forEach((function(A) {
                        var t = e.encrypt(A);
                        r += t
                }
            )),
                w(r);
        var a = e.encrypt(A)
            , s = w(a);
        return s
}
```

分段长度 `50` 是站点固定的， **不能改**，否则拼接顺序和分段边界变了，服务端解不出来。

那么 Python 侧怎么调用这段 JS？这里用了一个很稳的方案： **`subprocess + node -e + vm`**，而不是 `execjs` 。原因是站点 JS 里用 `window = global` 、还 `require('crypto-js')` ， `execjs` 对这类相对 `require` 支持不好。 `py/minmetals.py` 里内联了一段 Node runner：

```python
# 取自仓库真实 py：Project8/minmetals/py/minmetals.py
NODE_RUNNER = r"""
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');
const jsPath = process.env.JS_PATH;
const fnName = process.env.FN_NAME;
const args = JSON.parse(process.env.FN_ARGS);
const source = fs.readFileSync(jsPath, 'utf-8');
const ctx = {
    require: function (name) { return name === 'crypto-js' ? nodeCrypto : require(name); },
    console: console,
    module: module,
    process: process,
    Buffer: Buffer,
};
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: jsPath });
const result = ctx[fnName].apply(null, args);
process.stdout.write(JSON.stringify(result));
"""
```

这个 runner 有几个巧思：

-   用 `vm.createContext` 造一个沙箱上下文，再把 `window / global / globalThis` 都指向它自己；
-   **把 `require('crypto-js')` 重定向到 Node 内置的 `crypto`** （因为 `crypto-js` 未安装时，直接用内置 `crypto` 也能满足站点的 `window.crypto` 用法）；
-   通过环境变量把 JS 路径、函数名、参数传进 Node，最后 `JSON.stringify` 输出，Python 端 `json.loads` 拿结果。

Python 侧再用这个 runner 调 `get_arg` ：

```python
# 取自仓库真实 py：Project8/minmetals/py/minmetals.py
def run_js(js_name: str, func_name: str, *args) -> dict:
    js_path = os.path.abspath(os.path.join(JS_DIR, js_name))
    env = os.environ.copy()
    env["JS_PATH"] = js_path
    env["FN_NAME"] = func_name
    env["FN_ARGS"] = json.dumps(list(args), ensure_ascii=True)
    proc = subprocess.run(
        ["node", "-e", NODE_RUNNER],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError("Node 执行失败:\n" + (proc.stderr or proc.stdout))
    return json.loads(proc.stdout)
```

## 五、Python 实现

`py/minmetals.py` 把整个链路（拿 Cookie → 拿公钥 → 生成 param → 请求）都串了起来，而且是 **单文件自包含**，不依赖任何自写工具模块：

```python
# 取自仓库真实 py：Project8/minmetals/py/minmetals.py（节选）
LOGON_URL = "https://ec.minmetals.com.cn/logonAction.do"
PUBLIC_KEY_URL = "https://ec.minmetals.com.cn/open/homepage/public"
LIST_URL = "https://ec.minmetals.com.cn/open/homepage/cgxj/by-lx-page"

def get_cookie() -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
    }
    response = requests.get(LOGON_URL, headers=headers)
    return {
        "__jsluid_s": response.cookies["__jsluid_s"],
        "JSESSIONID": response.cookies["JSESSIONID"],
        "SUNWAY-ESCM-COOKIE": response.cookies["SUNWAY-ESCM-COOKIE"],
    }

def get_publicKey(cookie: dict) -> str:
    cookies = {
        "SUNWAY-ESCM-COOKIE": cookie["SUNWAY-ESCM-COOKIE"],
        "JSESSIONID": cookie["JSESSIONID"],
        "__jsluid_s": cookie["__jsluid_s"],
    }
    return requests.post(PUBLIC_KEY_URL, headers=headers, cookies=cookies).text

def Summary_arg(page: int) -> dict:
    device = Device()
    cookie = get_cookie()
    publickey = get_publicKey(cookie)
    js_arg = run_js("minmetals2.js", "get_arg", page, publickey)

    headers = { ... }
    return {
        "url": LIST_URL,
        "headers": headers,
        "data": {"param": js_arg["param"]},
        "cookies": {
            "SUNWAY-ESCM-COOKIE": cookie["SUNWAY-ESCM-COOKIE"],
            "JSESSIONID": cookie["JSESSIONID"],
            "__jsluid_s": cookie["__jsluid_s"],
        },
    }

def run(req: dict) -> None:
    print(req)
    response = requests.post(
        url=req["url"],
        headers=req["headers"],
        json=req["data"],
        cookies=req["cookies"],
    ).text
    print(response)

if __name__ == "__main__":
    run(Summary_arg(1))
```

执行流程一目了然： `get_cookie()` → `get_publicKey(cookie)` → `run_js("minmetals2.js","get_arg",page,publickey)` 拿到 `param` → 带上同一套 Cookie 请求列表接口。

## 六、运行结果

执行 `python minmetals.py` ，脚本会先打印组装好的请求（含 `param` ），再打印接口响应。响应是采购公告列表的 JSON，能看到公告标题、发布时间、采购方式等字段：

```javascript
{'url': '.../by-lx-page', 'data': {'param': 'MIIB...（RSA 密文）'}, ...}
{"code":0,"data":{"records":[{"mc":"某采购公告","lx":"CGGG","...":"..."}],"total":...}}
```

【图3：终端打印请求与返回的采购列表 —— 建议截图】

## 七、踩坑与注意

1.  **公钥是动态拉的，必须两步走。** 直接写死一个公钥偶尔能跑，但站点会换公钥，正规做法是每次先 `POST /open/homepage/public` 取最新公钥。
    
2.  **Cookie 要复用同一套。** 拿公钥用的 Cookie 和请求业务接口用的 Cookie 必须是同一次会话， `JSESSIONID` 一换，之前加密好的 `param` 就可能失效。
    
3.  **分段长度 50 不能改。** `encryptLong` 里 `A.match(/.{1,50}/g)` 是站点约定，改成别的大小，服务端解密会失败。
    
4.  **`crypto-js` 未安装时的替代。** runner 里把 `require('crypto-js')` 重定向到了 Node 内置 `crypto` ，省去装包；但如果你站点 js 用到 crypto-js 的高级 API，最好还是老实 `npm i crypto-js` 。
    
5.  **`__jsluid_s` 是加速乐风控 Cookie。** 它是 Jslu 系反爬发的，别自己伪造；如果拿不到这三个 Cookie，首先要检查是不是被风控拦了（返回的是挑战页而不是正常 HTML）。
    
6.  **`subprocess` 的编码。** `subprocess.run(..., encoding="utf-8")` 必须指定，否则 Windows 下按 GBK 解码中文会报 `UnicodeDecodeError` 。
    
7.  **`json.dumps(..., ensure_ascii=True)` 。** 传参数给 Node 时用了 ASCII 转义，避免命令行 / 环境变量里的中文编码问题。
    

## 八、总结

1.  **“动态公钥 + RSA 长加密”的站点，标准流程是：先拿 Cookie，再用 Cookie 换公钥，最后加密业务参数。**
2.  **站点重写的 `encryptLong` （分段长度、拼接方式）必须整块保留**，不能换成原生 JSEncrypt。
3.  **当 JS 里有 `window = global` / 相对 `require` 时， `subprocess + node -e + vm` 比 `execjs` 更稳**，还能通过环境变量优雅地把参数传进去。

* * *
