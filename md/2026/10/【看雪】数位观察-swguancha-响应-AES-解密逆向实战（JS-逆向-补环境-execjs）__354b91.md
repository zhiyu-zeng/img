---
title: 【看雪】数位观察 swguancha 响应 AES 解密逆向实战（JS 逆向 / 补环境 / execjs）
source: https://bbs.kanxue.com/thread-293249.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-17T08:45:55+08:00
trace_id: 160739d0-3088-45f1-b5f9-56bb812e6178
content_hash: 5b8ddabeec37127318fa6c6128770a5039f99d9d922d7a737bfe990f535ec08e
status: synced
tags:
  - 看雪
  - 协议分析
  - 安全工具
series: null
feed_source: 看雪·逆向工程
ai_summary: 数位观察文章列表接口返回体为 AES 加密串，抠出前端 CryptoJS 解密函数用 execjs 调用即可还原明文 JSON。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fc75244-d011-81c8-acf4-efb44eff9632
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 数位观察文章列表接口返回体为 AES 加密串，抠出前端 CryptoJS 解密函数用 execjs 调用即可还原明文 JSON。
> 
> - **接口特征：** 请求体 `queryType/current/size` 明文，响应整体加密；无签名、无 Cookie 风控，难度两星。
> - **加密参数：** AES / ECB / Pkcs7，32 位 Key `QV1f3nHn2qm7i3xrj3Y9K9imDdGTjTu9` 经 `Utf8.parse` 即 AES-256；ECB 不能加 IV。
> - **定位方法：** Sources 全局搜接口路径顺 `.then()` 回调，或搜 `AES`/`decrypt`/`CryptoJS` 特征词。
> - **落地方式：** Node 侧 `require('crypto-js')` 保留 `Get_result(Data)` 签名，Python 用 `execjs.compile` 后 `Js.call` 传入 `response.text`。
> - **易错点：** 明文在解密结果 `s.data.data` 而非 `s.data`；读 JS 文件须 `encoding="utf-8"`；请求体用紧凑 `json.dumps`；密钥长度与 parse 方式必须照抄原站。

## 数位观察 swguancha 响应 AES 解密逆向实战（JS 逆向 / 补环境 / execjs）

> 本文是「JS 逆向实战 30 例」系列第 6 篇，项目源码：https://github.com/scool112/openJSreverse （ `Project6` ）

## 一、目标与背景

数位观察（swguancha）是一个行业数据资讯站，我的目标是抓它的文章列表接口。

-   站点： `https://www.swguancha.com/`
-   目标接口： `https://app.swguancha.com/client/v1/article/client/page`
-   需还原字段： **响应解密**。请求参数是明文的（ `queryType` / `current` / `size` ），但返回体不是普通 JSON，而是一段加密字符串，必须解密后才能拿到文章列表。
-   难度：⭐⭐（两星，属于响应解密里最温和的一类，适合作为“响应加密”入门练手）

这个项目的“逆向点”很纯粹：不涉及签名、不涉及 Cookie 风控，只解决一件事—— **把服务端返回的密文还原成明文 JSON**。

## 二、抓包分析

打开 `https://www.swguancha.com/` ，按 F12 切到 **Network（网络）** 面板，筛选 `Fetch/XHR` ，然后在页面上翻页 / 切换栏目，就能看到 `client/v1/article/client/page` 这个请求被触发。

点开它看 **Payload（请求负载）**，请求体是：

```json
{"queryType":3,"current":2,"size":20}
```

完全是明文，没有任何混淆， `current` 就是页码。再切到 **Response（响应）**，发现返回的不是我们期待的 `{"code":0,"data":[...]}` ，而是一个 **整体加密的字符串** （形如一段 Base64 / 十六进制混合的密文）。这时我就判断： **要还原的是响应解密，而不是请求签名。**

再看请求头： `Content-Type: application/json;charset=UTF-8` ， `Origin` 是 `https://www.swguancha.com` ，接口域名却是 `app.swguancha.com` （同站跨子域）。这类“前端展示域名 + 数据接口子域名”的结构很常见。

【图1：Network 面板中 article/client/page 请求的 Payload 与 Response —— 建议截图】

结论很明确：请求照抄即可，重点是把响应解密函数抠出来。

## 三、定位加密入口

既然是 **响应解密**，我不需要去猜请求参数，而是直接找“谁在解密响应”。

最有效的办法是在 **Sources（源代码）** 面板里全局搜索关键字。因为接口返回的是一个字段，前端一定会去读它，所以我会搜一些典型词：

-   先搜接口路径的一部分： `article/client/page` ，能定位到发起请求的那个 ajax 封装；
-   再顺着它的 `.then()` / `success` 回调往里看，回调里对 `res` 做了什么处理；
-   如果字符串被压缩得看不清，就搜解密库的典型特征： `AES` 、 `decrypt` 、 `CryptoJS` 、 `Pkcs7` 、 `ECB` 。

在这个站点里，我最终定位到一段类似这样的解密逻辑（核心就是 CryptoJS 的 AES）：

```javascript
// 站点前端里定位到的解密调用（示意）
var t = { data: res.encryptedString };
var n = CryptoJS.enc.Utf8.parse(key);
var r = CryptoJS.AES.decrypt(t.data, n, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
});
var i = r.toString(CryptoJS.enc.Utf8);
var s = JSON.parse(i);
```

模式是 **AES / ECB / Pkcs7**，密钥是一段写死的 32 位字符串，Key 直接用 `Utf8.parse` 解析（等价于 AES-256）。我把这段逻辑和密钥一起抠到本地，重写成仓库里的 `js/swguancha1.js` ：

```javascript
// 取自仓库真实 js：Project6/swguancha/js/swguancha1.js
var cryptoJS = require('crypto-js');

function Get_result(Data){
    u = cryptoJS
    var l = "QV1f3nHn2qm7i3xrj3Y9K9imDdGTjTu9"
    var t = { data: Data }
    var n = u.enc.Utf8.parse(l)
    var r = u.AES.decrypt(t.data, n, {
        mode: u.mode.ECB,
        padding: u.pad.Pkcs7
    })
    i = r.toString(u.enc.Utf8)
    s = JSON.parse(i);
    return s.data.data
}
```

注意最后一行 `return s.data.data` ：解密出来的 JSON 顶层还有个 `data` 包装，真正的文章列表在 `data.data` 里，这需要实际打印一次解密结果才能确认层级。

【图2：Sources 面板里 AES.decrypt 断点 / 调用栈 —— 建议截图】

## 四、JS 还原与补环境

这个项目 **几乎没有补环境成本**，属于“抠代码”里最省心的类型：

1.  站点前端本来就用 CryptoJS，所以我只需要一个能跑 `require('crypto-js')` 的 Node 环境；
2.  我保留了原始函数签名 `Get_result(Data)` ，参数就是服务端返回的那一整段密文；
3.  因为密钥、IV、模式都在函数内部写死，调用方不需要传任何额外参数，Python 侧只负责把响应原文喂进来。

关于 AES 参数，几个容易搞错的点：

-   **ECB 不需要 IV**：所以代码里没有 `iv` 字段，不要自己硬加一个，会解密失败；
-   **Key 用 Utf8.parse**： `"QV1f3nHn2qm7i3xrj3Y9K9imDdGTjTu9"` 是 32 个可见字符，parse 后就是 32 字节，对应 AES-256；
-   **padding 是 Pkcs7**：这是 CryptoJS 默认的填充方式。

把这个逻辑用 Python 的 `execjs` 串起来之前，我先单独在 Node 里跑一遍验证，确认解密结果可读：

```javascript
// 本地自测（示意）
var r = require('./swguancha1.js'); // 略
// 或者直接 node -e 分段验证
```

确认无误后，才交给 Python 侧封装。

## 五、Python 实现

仓库里的采集脚本 `py/swguancha.py` 结构非常直白：读 JS → `execjs.compile` → 发请求 → 把响应文本交给 `Get_result` ：

```python
# 取自仓库真实 py：Project6/swguancha/py/swguancha.py
import requests
import json
import os
import execjs

def Spider(page:int)->None:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    JsPath = os.path.join(BASE_DIR,'..','js','swguancha1.js')
    with open(JsPath, encoding="utf-8") as f:
        Js_code = f.read()
    Js = execjs.compile(Js_code)
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://www.swguancha.com",
        "Referer": "https://www.swguancha.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "deviceType": "1",
        "dnt": "1",
        "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-gpc": "1"
    }
    url = "https://app.swguancha.com/client/v1/article/client/page"
    data = {
        "queryType": 3,
        "current": page,
        "size": 20
    }
    data = json.dumps(data, separators=(',', ':'))
    response = requests.post(url, headers=headers, data=data).text
    res = Js.call("Get_result", response)
    print(res)

Spider(2)
```

几个实现细节值得说明：

-   **路径用 `os.path` 拼**： `JsPath = os.path.join(BASE_DIR,'..','js','swguancha1.js')` ，保证无论在哪个目录执行脚本都能找到 JS；
-   **文件读写指定 `encoding="utf-8"`**：Windows 下默认是 GBK，不加会乱码或报错；
-   **`json.dumps(..., separators=(',', ':'))`**：去掉空格，和浏览器实际发的紧凑 JSON 保持一致，减少被识别的概率；
-   **`Js.call("Get_result", response)`**：直接把 `requests` 拿到的响应 `.text` 传进去，返回值已经是解析好的 Python 对象。

## 六、运行结果

执行 `python swguancha.py` ，终端会打印出解密后的文章列表数据（列表 / 字典结构），能看到 `title` 、 `id` 、发布时间等字段。大概长这样：

```javascript
[{'id': 123456, 'title': '某行业观察文章标题', 'publishTime': '2024-xx-xx', ...},
 {'id': 123457, 'title': '另一篇观察', 'publishTime': '2024-xx-xx', ...}]
```

只要字段是中文正常显示、不再是乱码或密文，就说明 AES 解密链路完全打通。

【图3：终端打印出的文章列表数据 —— 建议截图】

## 七、踩坑与注意

1.  **密钥长度与 parse 方式必须和站点一致。** 我一开始把 32 位 Key 直接当字节数组手敲，结果长度对不上导致解密出空串。正确做法是把前端原样的 `key` 字符串用 `CryptoJS.enc.Utf8.parse` 处理，别自己改写。
    
2.  **ECB 不要加 IV。** 很多人习惯性给 AES 都塞一个 iv，这里加了反而解不出来。
    
3.  **返回层级 `s.data.data` 要确认。** 第一版我写的是 `s.data` ，打印出来还是被包了一层，实际数据在 `data.data` 。
    
4.  **响应可能变化。** 如果某天解密报错，先确认接口返回体结构有没有变（比如外面又套了字段），再确认密钥是否被换过。
    
5.  **execjs 编码问题。** 页面返回的都是 UTF-8，读取 JS 文件和传参时要保证编码一致，否则中文标题会花掉。
    
6.  **频率控制。** 这是公开接口但没有明确授权，务必控制请求频率，遵守站点 `robots.txt` 与服务条款。
    

## 八、总结

1.  **响应解密的核心是“找到解密调用”，而不是猜参数。** 搜接口路径顺回调、搜 `AES` / `decrypt` / `CryptoJS` 特征即可定位。
2.  **AES 三要素要照抄：模式(ECB)、填充(Pkcs7)、Key 的解析方式(Utf8.parse)**，任意一处改动都会失败。
3.  **`execjs` + `require('crypto-js')` 是响应解密最快的落地方式**，几乎零补环境成本。

* * *
