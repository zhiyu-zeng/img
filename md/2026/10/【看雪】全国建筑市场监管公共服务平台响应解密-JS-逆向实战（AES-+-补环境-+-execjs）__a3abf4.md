---
title: 【看雪】全国建筑市场监管公共服务平台响应解密 JS 逆向实战（AES + 补环境 + execjs）
source: https://bbs.kanxue.com/thread-293248.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-17T08:45:31+08:00
trace_id: 7119b7f9-85c6-4071-8c63-9ff9a8d5bc6f
content_hash: bffd83e7ecdb3389cf7453bd746c3b1503b17aff9813ba25fb07885d3036e5c6
status: synced
tags:
  - 看雪
  - 协议分析
  - JS逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: 全国建筑市场监管公共服务平台企业列表接口的响应体是 hex 密文，需先 Hex.parse 转 Base64 再走 AES-CBC/Pkcs7 解密，才能拿到 JSON 数据。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fc75244-d011-81af-bcb2-eb062ec4e624
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 全国建筑市场监管公共服务平台企业列表接口的响应体是 hex 密文，需先 Hex.parse 转 Base64 再走 AES-CBC/Pkcs7 解密，才能拿到 JSON 数据。
> 
> - **加密定位：** 在 Sources 搜接口路径 `query/comp/list` 顺 ajax 回调，找到处理响应的 `get_res()`，即真正的解密实现。
> - **解密链路：** `Hex.parse(密文)` → `Base64.stringify` → `AES.decrypt(n, key, {iv, CBC, Pkcs7})` → `toString(Utf8)` → `JSON.parse` 后取 `data.list`（顶层有 data 包装）。
> - **密钥与 IV：** Key 为 `Utf8.parse("Dt8j9wGw%6HbxfFn")`（16 字符即 AES-128），IV 为 `Utf8.parse("0123456789ABCDEF")`，都必须原样传字符串，不能手动转 hex 或补位。
> - **请求侧无需处理：** GET 参数 `pg`/`pgsz`/`total` 均为明文；但请求头中 `v: "231012"`、`timeout: "30000"`、`accessToken;`（头名带分号）需原样照抄，缺失可能返回风控页。
> - **Python 落地：** requests 取 `.text` 原文直接交给 execjs 的 `js.call("get_res", data)`，JS 端仅依赖 crypto-js，不用补 window/document，只需在 js 目录 `npm i crypto-js`。

> 本文是「JS 逆向实战 30 例」系列第 5 篇，项目源码：https://github.com/scool112/openJSReverse （ `Project5` ）

## 一、目标与背景

全国建筑市场监管公共服务平台（jzsc.mohurd.gov.cn），我要抓它的企业列表接口。这个接口的请求是明文的，但 **响应体是一整段十六进制密文**，必须解密才能拿到 JSON。

-   站点： `https://jzsc.mohurd.gov.cn/data/company`
-   目标接口： `https://jzsc.mohurd.gov.cn/APi/webApi/dataservice/query/comp/list`
-   需还原字段： **响应处理（解密）**。请求参数 `pg` / `pgsz` / `total` 都是明文。
-   难度：⭐⭐⭐（三星。算法是标准 AES-CBC/Pkcs7，难点在于「密文是十六进制、要先转再解」，以及 `require('crypto-js')` 的编码细节）

这个项目属于 **响应解密**，和 Project6（数位观察）是一对：那个是「Base64 密文直接 AES」，这个是「**Hex 密文，先 Hex→Base64 再 AES**」。看起来只差一步，但这一步是很多人的第一道坎。

## 二、抓包分析

打开 `https://jzsc.mohurd.gov.cn/data/company` ，F12 → **Network** → 筛 `Fetch/XHR` ，翻一下企业列表，找到对 `query/comp/list` 的请求。

看 **Payload**，请求是 GET，query 明文：

```toml
pg=2
pgsz=15
total=450
```

`pg` 是页码， `pgsz` 是每页条数。 **请求这边完全不用管。**

再看 **Response**，返回的不是 JSON，而是一大段 **十六进制字符串** （全是 `0-9a-f` ，没有 `+` `/` 这些 Base64 特征字符）：

```
7a3b9c...（一长串 hex）...
```

这就说明是响应体加密。虽然它长得像 Base64，但细看只有 `0-9a-f` ，其实是 **Hex 编码**——这正是坑所在。

【图1：Network 面板里 query/comp/list 请求的 Response 原始密文 —— 建议截图】

结论：请求照抄，重点是把「hex 密文 → 明文 JSON」的解密函数抠出来，并解决 `require` 与编码问题。

## 三、定位加密入口

响应解密的定位套路和 Project6 一样： **去找谁在处理响应**。

在 **Sources** 面板里搜接口路径的一部分（ `query/comp/list` ）或业务字段名，顺到 ajax 的 `.then()` 回调；回调里通常有一段「把 res 交给某个函数处理」的代码。继续跟进那个函数，就会落到真正的解密实现。

我抠出来的是仓库里的 `js/mohurd1.js` ，完整逻辑如下：

```javascript
// 取自仓库真实 js：Project5/mohurd/js/mohurd1.js
var cryptoJS = require('crypto-js');


function get_res(Data){
    var d = {
        a:cryptoJS
    };
    function BB(t) {
        f = d.a.enc.Utf8.parse("Dt8j9wGw%6HbxfFn");
        m = d.a.enc.Utf8.parse("0123456789ABCDEF");
        var e = d.a.enc.Hex.parse(t)
            , n = d.a.enc.Base64.stringify(e)
        var a = d.a.AES.decrypt(n, f, {
            iv: m,
            mode: d.a.mode.CBC,
            padding: d.a.pad.Pkcs7
        })
            , r = a.toString(d.a.enc.Utf8);
        return r.toString()
    }
    TT = {
        data:Data
    }
    var EE = JSON.parse(BB(TT.data));
    list = []
    for (var i = 0;i<EE.data.list.length;i++){
        list[i] = EE.data.list[i]
    }
    return list
}
```

一步步拆开看：

1.  **`f = Utf8.parse("Dt8j9wGw%6HbxfFn")`**—— 密钥。这是 **16 个可见字符**， `Utf8.parse` 后是 16 字节 → **AES-128**；
2.  **`m = Utf8.parse("0123456789ABCDEF")`**—— IV 也是 16 字节，且是一段 **看起来很朴素** 的字符串（ `0-9A-F` ）；
3.  **`e = Hex.parse(t)`**—— 关键第一步：把服务端返回的 **十六进制密文** 解析成 WordArray；
4.  **`n = Base64.stringify(e)`**—— 关键第二步：把同一个 WordArray **重新编码成 Base64 字符串**；
5.  **`a = AES.decrypt(n, f, {iv: m, mode: CBC, padding: Pkcs7})`**—— 用 Base64 串做 AES-CBC 解密；
6.  **`r = a.toString(Utf8)`**—— 明文转成 UTF-8 字符串；
7.  **`JSON.parse` 后再取 `EE.data.list`**—— 解密出的 JSON 顶层有 `data` 包装，真正的企业数组在 `data.list` 。

第 3、4 步就是本项目的精髓： **服务端把 AES 密文用 Hex 编码下发，而 `CryptoJS.AES.decrypt` 默认按 Base64 解读入参**，所以必须先 `Hex.parse` 再 `Base64.stringify` ，等价于「把 hex 转成 base64」，否则 `decrypt` 会把 hex 字符串当成 base64 解析，直接解出空串或乱码。

【图2：Sources 面板里解密函数 / AES.decrypt 断点调用栈 —— 建议截图】

## 四、JS 还原与补环境

这个文件的补环境成本几乎为零：

-   它只依赖 `crypto-js` ，所以本地 Node 环境 `require('crypto-js')` 即可；
-   没有用到 `window` / `document` / `navigator` ；
-   函数签名 `get_res(Data)` 保持原样， `Data` 就是服务端返回的原始字符串。

需要留意的是作者在这里用了一些「隐式全局变量」（ `f` / `m` / `e` / `n` / `a` / `r` / `TT` / `EE` / `list` 都没写 `var/let` ）——在 `get_res` 这种一次性调用里没问题，但如果要在同一进程里多次调用、或追求严谨，建议给它们补上 `var` ，避免污染全局。

另外： `cryptoJS.enc.Utf8.parse` 用的是 CryptoJS 的 UTF-8 编码，密钥/IV 必须 **原样字符串** 传进去，不要自己转十六进制或手动补位。

## 五、Python 实现

`py/mohurd1.py` 分两步： `Spider()` 拿响应原文， `js_fun()` 把原文交给 JS 解密：

```python
# 取自仓库真实 py：Project5/mohurd/py/mohurd1.py
import requests
import os
import execjs
from typing import Union,Any

def js_fun(data:str)->list[dict[str,Union[str,int]]]:
    base_path:str = os.path.dirname(os.path.abspath(__file__))
    js_file:str = os.path.join(base_path,"..","js","mohurd1.js")
    js_dir:str = os.path.dirname(js_file)
    os.chdir(js_dir)
    with open(js_file,encoding="utf-8") as f:
        js_code = f.read()
    js:Any = execjs.compile(js_code)
    res:list[dict[str,Union[str,int]]] = js.call("get_res",data)
    return res

def Spider(page:str)->str:
    headers:dict[str,str] = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Pragma": "no-cache",
        "Referer": "https://jzsc.mohurd.gov.cn/data/company",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "accessToken;": "",
        "dnt": "1",
        "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-gpc": "1",
        "timeout": "30000",
        "v": "231012"
    }
    url:str = "https://jzsc.mohurd.gov.cn/APi/webApi/dataservice/query/comp/list"
    params:dict[str,str] = {
        "pg": page,
        "pgsz": "15",
        "total": "450"
    }
    response:str = requests.get(url, headers=headers, params=params).text
    return response

def main(page:int):
    Data:str = Spider(str(page))
    res:list[dict[str,Union[str,int]]] = js_fun(Data)
    print(res)

if __name__ == "__main__":
    main(2)
```

要点：

-   **`os.chdir(js_dir)`**：保留这个习惯，保证 `require('crypto-js')` 和相对路径都在预期目录下解析；
-   **请求头里几个"伪装"字段** 要带上： `v: "231012"` （版本）、 `timeout: "30000"` 、 `accessToken;: ""` （注意这个头名带分号，原样照抄）。这个站点对头比较敏感，缺了可能返回风控页；
-   **直接传 `.text`**： `js.call("get_res", data)` 的入参是响应 **原文** （hex 字符串），不要在 Python 里做任何解码。

## 六、运行结果

执行 `python mohurd1.py` ，终端会打印解密并解析后的企业列表（Python 列表/字典）：

```javascript
[{'QY_NAME': '某某建筑工程有限公司', 'QY_ORG_CODE': '91...', 'QY_REG_ADDR': '...', 'QY_ID': '...'},
 {'QY_NAME': '某某建设集团有限公司', 'QY_ORG_CODE': '91...', 'QY_REG_ADDR': '...', 'QY_ID': '...'}]
```

只要 `QY_NAME` 等中文字段正常显示、不再是密文，就说明「Hex→Base64→AES-CBC→JSON」这条链路完全打通。

【图3：终端打印出的企业列表数据 —— 建议截图】

## 七、踩坑与注意

1.  **密文是 Hex 不是 Base64。** 这是最大坑： `AES.decrypt` 默认按 Base64 解析入参，直接把 hex 串丢进去会解密失败。正确姿势是 `Hex.parse(t)` 后再 `Base64.stringify` ，即「先转成 base64」。
    
2.  **密钥/IV 用 `Utf8.parse` 。** `"Dt8j9wGw%6HbxfFn"` 是 16 字符（AES-128）， `"0123456789ABCDEF"` 是 16 字节 IV，都要原样 `Utf8.parse` ，别手动转 hex。
    
3.  **CBC 必须带 IV。** 和 ECB 不同，这里 `{iv: m, mode: CBC, padding: Pkcs7}` 三件套缺一不可。
    
4.  **返回层级是 `data.list` 。** 解密出的 JSON 顶层有 `data` 包装，直接取 `data.list` ；如果打印出来是 `{...}` 而不是列表，多半是层级取错。
    
5.  **`require('crypto-js')` 要能加载。** 本地需 `npm i crypto-js` ，且 `execjs` 的 Node 要能找到它（放在 js 目录或全局）。若报 `Cannot find module 'crypto-js'` ，就在 `js/` 下装一份。
    
6.  **站点对请求头敏感。** `v` / `timeout` / `accessToken;` 这些字段照抄，别删；否则可能返回加密的错误页，让你误判成算法错。
    
7.  **编码统一 UTF-8。** 读取 JS、传递响应、打印结果都用 UTF-8，避免中文企业名乱码。
    
8.  **低频请求、遵守条款。**
    

## 八、总结

1.  **响应解密的核心是找「处理响应的那个函数」**，搜接口路径顺回调 / 搜 `AES` / `decrypt` / `CryptoJS` 即可定位。
2.  **密文的编码方式决定成败**：Base64 密文直接解，Hex 密文要先 `Hex.parse → Base64.stringify` 再解——这一步是「Hex 响应」最常见的坑。
3.  **AES-CBC 三要素（Key/IV/模式+填充）照抄， `crypto-js` + `execjs` 零补环境落地**，是响应解密最快的方案。

* * *
