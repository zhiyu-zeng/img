---
title: 【看雪】企查查动态请求头签名 JS 逆向实战（HMAC + 自定义字符表 + execjs）
source: https://bbs.kanxue.com/thread-293242.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-16T20:13:33+08:00
trace_id: baa1561c-1197-44fb-85f6-c60751818f4d
content_hash: c32bf9e9f042102dd953d6d2f119420d38da5ef80adc340bf7743dff759efda1
status: synced
tags:
  - 看雪
  - Android逆向
  - 风控对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: 企查查 `searchMulti` 接口用一个「头名+头值」都动态变化的签名头替代固定签名，头名是 HMAC 结果的中间 20 位小写字符，头值需混入页面 `window.tid`，密钥由接口路径经自定义字符表映射生成。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-8185-ad78-e387b5218f89
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 企查查 `searchMulti` 接口用一个「头名+头值」都动态变化的签名头替代固定签名，头名是 HMAC 结果的中间 20 位小写字符，头值需混入页面 `window.tid`，密钥由接口路径经自定义字符表映射生成。
> 
> - **签名构造：** 头名 = `HMAC(path + JSON体小写, 密钥).toLowerCase().substr(8,20)`；头值 = `HMAC(path + "pathString" + JSON体小写 + window.tid, 密钥)`。
> - **密钥来源：** 路径转小写后复制两份，逐字符 `charCodeAt() % 20` 查 `codes` 表（20 项映射，如 0→W、1→l）拼成定长密钥，硬编码不可改。
> - **环境依赖：** 页面内联脚本提供 `window.pid`/`window.tid`，Python 用字符串切分从搜索页抠出；JS 侧仅需补 `window = global; window.tid = ...`，`tid` 拆成字符数组 `eval` 拼接以绕过静态搜索。
> - **抠码陷阱：** 手抠 crypto-js 类哈希库时，`extend`、`init`、`_doProcessBlock` 中 `var` 覆盖参数等 5 处原型链/作用域问题会导致哈希静默算错。
> - **调用要点：** `path` 需与常量 `/api/search/searchmulti` 一致（大小写敏感），`pageIndex` 为 1 基，Cookie（`qcc_did`/`_c_WBKFRo`/`QCCSESSID`）为登录态需自行替换。

> 本文是「JS 逆向实战 30 例」系列第 4 篇，项目源码：https://github.com/scool112/openJSReverse （ `Project4` ）

## 一、目标与背景

企查查（qcc.com）的企业搜索接口，最大的特点是——它的签名 **不叫固定名字**：请求头的 key 和 value 都是动态生成的，每次可能都不一样，全靠 `x-pid` 把二者关联起来。

-   站点： `https://www.qcc.com/`
-   目标接口： `https://www.qcc.com/api/search/searchMulti`
-   需还原字段：一个 **动态请求头** （header 的 key/value 都不固定）+ `x-pid`
-   难度：⭐⭐⭐⭐（四星。算法是 HMAC，但 key 由「路径经自定义字符表映射」得到、value 又掺了页面里的 `window.tid` ，链路比宝钢更长）

这个项目是 **动态请求头** 的典型：服务端不认「某个固定头名」，而是把「头名 = 一段哈希的中间 20 位、头值 = 另一段 HMAC」一起下发校验，再加 `x-pid` 绑定浏览器会话。所以逆向要解决两件事： **头名/头值怎么算** + **`tid` / `pid` 从哪来**。

## 二、抓包分析

打开 `https://www.qcc.com/` ，搜索任意关键词（比如 `vivo` ），F12 → **Network** → 筛 `Fetch/XHR` ，找到 `api/search/searchMulti` 这个 POST。

看 **Request Headers**，会发现一个很反直觉的现象—— **除了常规头之外，多了一个我从没见过的头名**，而且它每刷新一次可能又换一个名字：

```
接受常规头：accept / origin / referer / user-agent ...
x-pid: qcc_web_xxxxxxxxxxxxxxxx
<一串 20 位的小写字母头名>: <一段很长的十六进制>
```

再看 **Payload**：

```json
{"searchKey":"vivo","pageIndex":2,"pageSize":20}
```

请求体是明文。请求头里 `x-pid` 是一段 `qcc_web_` 前缀的 ID，结合那个「随机头名」，我判断：

-   `x-pid` 对应页面里的 `window.pid` （ `WindowPid` ），是会话级标识；
-   那个「随机头名 + 头值」是签名对，头名由 **接口路径 + 请求体** 算出来，头值还要额外掺一个 `window.tid` （ `WindowTid` ）。

【图1：Network 面板里 searchMulti 请求的动态请求头与 x-pid —— 建议截图】

结论：要还原的是「头名/头值」的算法，以及从页面里抠 `window.pid` / `window.tid` 。

## 三、定位加密入口

先在 **Sources** 面板全局搜 `searchMulti` ，顺到发起请求的封装；再搜 header 赋值处，会看到它调用了一个 `getXXX(...)` 之类的函数来生成那个动态头。

继续往里跟，找到核心的签名模块。我把这段逻辑单独抠成了仓库里的 `js/arg.js` 。它的结构是：一个哈希实现（HMAC-SHA256）+ 一个「路径→密钥」的字符表映射函数 + 两个拼接函数：

```javascript
// 取自仓库真实 js：Project4/qcc/js/arg.js（核心模块，节选）
    AA = {                                   // 对 e 用密钥 t 做 HMAC，返回字符串
        default:function(e, t) { return (0, AA_3.default)(e, t).toString() }
    }

    AA_2 = {
        "default": {
            "n": 20,
            "codes": {
                "0": "W", "1": "l", "2": "k", "3": "B", "4": "Q",
                "5": "g", "6": "f", "7": "i", "8": "i", "9": "r",
                "10": "v", "11": "6", "12": "A", "13": "K", "14": "N",
                "15": "k", "16": "4", "17": "L", "18": "1", "19": "8"
            }
        }
    }

    AA_3 = {                                 // 内部其实是 PP.HMAC(SHA-256)
        default:function(e, n) { return new PP.HMAC.init(TT,n).finalize(e) }
    }

    OO = {
        default:function() {
            for (var e = (arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "/").toLowerCase(), t = e + e, n = "", i = 0; i < t.length; ++i) {
                var o = t[i].charCodeAt() % AA_2.default.n;
                n += AA_2.default.codes[o]
            }
            return n
        }
    }

    RR = {
        default:function() {
            var e = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {}
                , t = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : ""
                , n = (arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "/").toLowerCase()
                , i = JSON.stringify(e).toLowerCase();
            return (0,
                AA.default)(n + "pathString" + i + t, (0,
                OO.default)(n))
        }
    }
```

三个函数理清后就明白了：

-   **`AA.default(e, t)`**：对字符串 `e` 用密钥 `t` 做 **HMAC** （ `AA_3` 内部是 `PP.HMAC.init(TT, n).finalize(e)` ，这里用的是 SHA-256 实现——文件里能看到 SHA-256 的初始常数 `1779033703` 和轮常数 `1116352408` ）；
-   **`OO.default(path)`**：把路径 `path` 转小写后复制两份（ `t = e + e` ），逐字符取 `charCodeAt() % 20` ，去 `codes` 表里查字母，拼成一个 **定长密钥**。这个「字符表映射」就是让密钥看起来像随机串、又不用额外下发的地方；
-   **`RR.default(path, data, tid)`**： `HMAC(path + "pathString" + JSON(body).toLowerCase() + tid, OO(path))` 。

最后是导出给 Python 用的入口 `get_arg` ，它把「头名」和「头值」一起返回：

```javascript
// 取自仓库真实 js：Project4/qcc/js/arg.js（尾部）
    TT = "/api/search/searchmulti"

    EE = {
        data:{
            "searchKey": name,
            "pageIndex": page,
            "pageSize": 20
        }
    }

    SS = {
        default:function() {
            var list = ["w", "i", "n", "d", "o", "w", ".", "t", "i", "d"];
            return eval(list.join(""))
        }
    }

    oX = {                                   // 生成「头名」
        default:function() {
            var a = AA, o = OO
            var e = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {}
                , t = (arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "/").toLowerCase()
                , n = JSON.stringify(e).toLowerCase();
            return (0, a.default)(t + n, (0, o.default)(t)).toLowerCase().substr(8, 20)
        }
    }

    u = (0, RR.default)(TT, EE.data, (0, SS.default)());
    var i = (0, oX.default)(TT, EE.data)

    res = { key:i, value:u }
    return res;
}
```

其中 `SS.default` 那行 `eval(list.join(""))` 拼出来就是 `window.tid` （作者故意拆成数组绕过静态搜索），也就是 `get_arg(WindowTid, ...)` 传进来的第一个参数。

于是：

-   **头名 `key`** = `HMAC(path + JSON(body).toLowerCase(), OO(path)).toLowerCase().substr(8, 20)` → 取哈希结果的第 8~27 位， **20 个小写字符**；
-   **头值 `value`** = `HMAC(path + "pathString" + JSON(body).toLowerCase() + window.tid, OO(path))` 。

`get_arg(WindowTid, name, page)` 的签名是 `function get_arg(WindowTid,name,page){ window = global; window.tid = WindowTid; ... }` ：它先把 `window = global` 、 `window.tid = WindowTid` 补上环境，后面的 `SS.default` 才能通过 `eval` 拿到 `window.tid` 。

【图2：Sources 面板里 oX/RR 调用处断点 / HMAC 调用栈 —— 建议截图】

## 四、JS 还原与补环境

这个文件的补环境只有一句 `window = global` ，剩下几乎全是纯逻辑。真正麻烦的是「抠代码」时的原型链问题——文件尾部作者留了一段非常详细的「修复总结注释」，记录了 5 处坑：

```javascript
// 取自仓库真实 js：Project4/qcc/js/arg.js（文件尾部修复注释，节选）
/*
 修复总结（5 处）：create.toString / AA_4.init.prototype.toString / tox32 的 i.create；
 以及 _doProcessBlock 里 `for (var t=0;t<80;t++)` 用 var 覆盖了参数 t（数据数组），
 和 extend 与 e.init 处理错误导致 cfg.init 被永久改写、hash 对象 high/low 全 NaN。
 已恢复为原始的 e.$super.init.apply(this, arguments)
 */
```

这些坑的共同点是： **手抠 crypto-js / 自研哈希时， `extend` 、 `init` 、 `_doProcessBlock` 的变量作用域和原型链稍有不慎，哈希就会算错** （而且往往不报错，只是结果不对）。另外 `OO.default` 里字符表的 `n=20` 和 `codes` 映射是写死的，还原时 **一个字都不能改**； `path` 在计算前后被 `.toLowerCase()` 处理，传大写路径会得到不同头名。

Python 侧只需要提供 `WindowTid` （从页面抠），其余全在 JS 里算。

## 五、Python 实现

先看「从页面抠 `pid` / `tid` 」的 `py/arg/qcc_arg.py` ：请求搜索页，用字符串切分解析内联 `<script>window.pid='...'` ：

```python
# 取自仓库真实 py：Project4/qcc/py/arg/qcc_arg.py
import requests


def qcc_arg(name:str)-> dict[str,str]:
    headers:dict[str,str] = {
        # ... 常规浏览器头（accept / accept-language / cache-control / dnt /
        # pragma / sec-ch-ua* / sec-fetch-* / user-agent 等），此处节选
        "referer": "https://www.qcc.com/",
        "priority": "u=0, i",
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    }
    cookies:dict[str,str] = {
        "qcc_did": "你的qcc_did",
        "_c_WBKFRo": "你的_c_WBKFRo",
        "QCCSESSID": "你的QCCSESSID",
        "acw_tc": "你的acw_tc"
    }
    url:str = "https://www.qcc.com/web/search"
    params:dict[str,str] = {
        "key": name,
        "p": "2"
    }
    response:requests.Response = requests.get(url, headers=headers, cookies=cookies, params=params)

    result:str = response.text
    WindowPid:str = result.split("<script>window.pid='")[1].split("'")[0]
    WindowTid:str = result.split("<script>window.pid='")[1].split("='")[1].split("';")[0]
    WindowVersion:str = result.split("'</script>")[0].split("window.version='")[1]
    return {"WindowPid":WindowPid, "WindowTid":WindowTid, "WindowVersion":WindowVersion}
```

再看主脚本 `py/Spider_qcc.py` ：先拿 `WindowPid` / `WindowTid` ，再 `execjs` 算头，拼进请求：

```python
# 取自仓库真实 py：Project4/qcc/py/Spider_qcc.py
import requests
import json
from arg.qcc_arg import qcc_arg
import os
import execjs
from urllib.parse import quote
from typing import Union,Any

def Spider(Name:str,Page:int)-> None:
    name:str = Name
    pageIn:int = Page
    header_refererNa:str = quote(name,encoding="utf-8")
    header_referer:str = "https://www.qcc.com/web/search?key=" + header_refererNa + "&p=2" if pageIn == 1 else "https://www.qcc.com/web/search?key=" + header_refererNa
    arg:dict = qcc_arg(name)
    WindowPid:str = arg["WindowPid"]
    WindowTid:str = arg["WindowTid"]

    base_path:str = os.path.dirname(os.path.abspath(__file__))
    js_path:str = os.path.join(base_path,"..","js","arg.js")
    js_dir:str = os.path.dirname(js_path)
    os.chdir(js_dir)

    with open(js_path,encoding="utf-8") as f:
        js_code:str = f.read()
    js:Any = execjs.compile(js_code)
    hea_arg:dict[str,str] = js.call("get_arg",WindowTid,name,pageIn)
    key:str = hea_arg["key"]
    value:str = hea_arg["value"]

    headers:dict[str,str] = {
        "Content-Type": "application/json",
         key: value,                          # ← 动态头名:头值
        # ... 常规浏览器头（accept / origin / referer / sec-ch-ua* / user-agent 等），此处节选
        "origin": "https://www.qcc.com",
        "referer": header_referer,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "x-pid": WindowPid,
        "x-requested-with": "XMLHttpRequest"
    }
    cookie:dict[str,str] = {"qcc_did":"你的qcc_did", "_c_WBKFRo":"你的_c_WBKFRo", "QCCSESSID":"你的QCCSESSID"}
    url:str = "https://www.qcc.com/api/search/searchMulti"
    Data:[str, Union[str, int]] = {"searchKey": Name, "pageIndex": pageIn, "pageSize": 20}
    data:str = json.dumps(Data, separators=(',', ':'))
    response:requests.Response = requests.post(url, headers=headers, cookies=cookie, data=data)
    print(response.text)
    print(response.status_code)


Spider("vivo",2)
```

关键点：

-   **动态头** 是 `{ key: value }` 直接塞进 headers（ `key` 是那 20 位随机名， `value` 是 HMAC 值）；
-   `x-pid` 用 `WindowPid` ， `referer` 用关键词 URL 编码后的搜索页地址；
-   `pageIndex` 传的是 `Page` （企查查这里是 **1 基**，和宝钢不同）；
-   Cookie（ `qcc_did` / `_c_WBKFRo` / `QCCSESSID` ）是登录态， **已脱敏**，需替换。

## 六、运行结果

执行 `python Spider_qcc.py` ，终端打印接口返回的搜索结果 JSON 和状态码：

```javascript
{"status":200,"data":[{"name":"维沃移动通信有限公司","creditCode":"...","regNo":"...","operName":"..."}, ...],"message":"OK"}
200
```

返回 `200` 且有企业列表即说明动态头被认可。若返回 `401/403` 或一段风控 HTML，多半是 Cookie 失效或 `x-pid` / `tid` 与请求不匹配。

【图3：终端打印出的企查查企业搜索结果 —— 建议截图】

## 七、踩坑与注意

1.  **头名是动态的、20 位小写。** 不要指望有固定 header 名；它是 `HMAC(...).toLowerCase().substr(8,20)` 。调试时可以先把算出的 `key` / `value` 打印出来和浏览器 Network 对比。
    
2.  **`window.tid` 必须来自真实页面。** `get_arg` 的第一个参数就是页面里的 `window.tid` ；不用真值（或用了过期页面的 tid），头值会算错。所以每次跑前都先请求一次搜索页拿 `pid` / `tid` 。
    
3.  **路径大小写敏感。** `path` 参与哈希前被 `.toLowerCase()` ，但匹配时对不上就白搭，保持和内部常量 `TT = "/api/search/searchmulti"` 一致。
    
4.  **手抠哈希最怕原型链/作用域坑。** 文件尾部那 5 条修复注释（ `extend` 挂载、 `_doProcessBlock` 的 `var t` 覆盖、`.cfg.init` 被永久改写…）说明一旦 `extend` / `init` 处理错，哈希会 **静默算错**。尽量照着原库结构还原。
    
5.  **Cookie 是登录态且会失效。** `qcc_did` / `_c_WBKFRo` / `QCCSESSID` 是脱敏占位符，必须换成自己登录后的值。
    
6.  **`pageIndex` 基数是 1。** 和宝钢的 0 基不同，别混淆。
    
7.  **低频请求、遵守条款。**
    

## 八、总结

1.  **「动态头名 + 动态头值」是比固定签名更隐蔽的一层**：头名往往只是某个哈希的中间片段，靠 `x-pid` / `tid` 与会话绑定。
2.  **`HMAC` 的密钥不一定明文下发**，企查查用「路径字符表映射」现场生成密钥（ `charCodeAt() % 20` 查表），这是个很值得记住的小套路。
3.  **抠哈希库时，原型链与作用域比算法本身更致命**；算错了不报错，只能靠和浏览器逐段比对。

* * *
