---
title: 【看雪】中国观鸟记录中心 birdreport 请求 RSA 加密 + 响应 AES 解密逆向实战（JS 逆向 / JSEncrypt / 补环境 / execjs）
source: https://bbs.kanxue.com/thread-293261.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-18T09:41:14+08:00
trace_id: 027e2fa0-8b45-4385-a76a-1706550f6c48
content_hash: e3f5f0831d78a497939d15b05afb69594ab21146ccf8497eec97493588a498ab
status: synced
tags:
  - 看雪
  - 协议分析
  - 密码学
series: null
feed_source: 看雪·逆向工程
ai_summary: 抓取 birdreport 活动列表需要同时还原请求侧的 RSA 长加密、MD5 签名和响应侧的 AES 解密；通过用 `execjs` 加载从原站扣出的 JS 代码，可以跑通整条链路。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fd75244-d011-813f-b292-c4ab2ba24ac1
ioc:
  cves: []
  cwes: []
  hashes:
    - "53536868555767547048526949655455"
    - "6756696653534952657053656868665752665050485566485667545454484967"
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 抓取 birdreport 活动列表需要同时还原请求侧的 RSA 长加密、MD5 签名和响应侧的 AES 解密；通过用 `execjs` 加载从原站扣出的 JS 代码，可以跑通整条链路。
> 
> - **加密链路：** 请求 body 是经过 RSA 长加密的一段 Base64 字符串；自定义头包含 `requestId`（随机 UUID）、`timestamp`（毫秒时间戳）和 `sign`；响应返回 `{"data":"<密文>","timestamp":...}`，其中 `data` 段还需要再做一次 AES 解密。
> - **签名算法：** `sign = MD5(明文data + requestId + timestamp)`。拼接时使用的是加密前的明文 `data`，不是 RSA 密文；如果使用密文，服务端会直接判定签名错误。
> - **必须保留的补丁：** 站点在 JSEncrypt 3.1.2 上改写了 `encryptLong`，按长度分段做 RSA 加密后再拼接，并用 while 循环重试来处理末尾的 `null` 字节。这段代码不能替换成原生库，否则会报错或截断。
> - **补环境要点：** 响应脚本需要 `window = global`，并且要 `require('crypto-js')`（在 JS 目录执行 `npm i crypto-js`）。SDK 带有反调试行为，会改写或静音 `console`，所以要在运行前备份 `console` 的方法，运行后再恢复，否则调试输出会消失。
> - **调用与解析：** 先用 `Js.call("get_arg", page)` 取得 `requestId`、`sign`、`timestamp` 和 `data` 四件套，然后把前三项放入请求头，把 `data` 作为请求体发出；响应需要按 `"data":"...","timestamp` 手动切出密文串，再交给 `get_res` 解密，不能直接 `json.loads`。`requestId` 每次请求都要重新生成，复用旧值会触发风控。

## 中国观鸟记录中心 birdreport 请求 RSA 加密 + 响应 AES 解密逆向实战（JS 逆向 / JSEncrypt / 补环境 / execjs）

> 本文是「JS 逆向实战 30 例」系列第 7 篇，项目源码：JS 逆向实战 30 例 · 开源仓库 （ `Project7` ）

## 一、目标与背景

中国观鸟记录中心（birdreport）是国内常用的观鸟数据平台，我想抓它的活动/记录列表。

-   站点： `https://www.birdreport.cn/`
-   目标接口： `https://api.birdreport.cn/front/activity/search`
-   需还原字段： `requestId` 、 `sign` 、 `timestamp` 、 `data` （**请求参数 RSA 加密**）+ 响应解密
-   难度：⭐⭐⭐⭐（四星。请求侧有 RSA 长加密 + MD5 签名，响应侧还有一层 AES 解密，前后都要还原）

这个项目是典型的“ **双向加密** ”：发出去的 body 是 RSA 密文，带三个自定义头；收回来又是加密串，还得再解一次。把这一套吃透，基本就掌握了“请求加密 + 响应解密”的组合套路。

## 二、抓包分析

登录 `https://www.birdreport.cn/` ，打开 **Network**，筛 `Fetch/XHR` ，在页面上切换活动列表 / 翻页，就能抓到 `front/activity/search` 。

先看 **Request Headers（请求头）**，我注意到三个很显眼的自定义头：

```
requestId: <32 位十六进制串>
sign: <32 位十六进制串>
timestamp: <毫秒时间戳>
```

再看 **Payload（请求负载）**，body 是一串 `application/x-www-form-urlencoded` 格式的数据，但内容不是明文 JSON，而是 **一段 Base64 大字符串**。这就说明请求体被加密了。

再看 **Response**，返回的是 `{"data":"<加密串>","timestamp":...}` 这种结构， `data` 字段本身又是一段密文。于是判断：

-   `requestId` ：随机 UUID，每次请求都变；
-   `timestamp` ：当前毫秒时间戳；
-   `data` ：请求 JSON 被 RSA 加密后的密文；
-   `sign` ：把明文 JSON + requestId + timestamp 拼接后做 MD5；
-   响应里的 `data` ：AES 密文，需要解密。

【图1：activity/search 请求的 Headers 与加密后的 Payload —— 建议截图】

## 三、定位加密入口

这个接口的入口不在普通业务代码里，而是藏在 **站点自己的加解密 SDK** （压缩混淆过的 `BIRDREPORT_APIJS` ）中。我的定位步骤如下：

1.  **全局搜参数名**：在 Sources 里搜 `requestId` 、 `sign` 、 `encryptLong` 、 `setPublicKey` 。很快就能搜到一种非常熟悉的模式—— `JSEncrypt` 。
2.  **搜 `JSEncrypt`**：果然，站点用了 `JSEncrypt` 这套库（版本 `3.1.2` ），并且对 `encryptLong` 做了改写（原生 JSEncrypt 不支持长文本，站点自己加了分段加密）。
3.  **看响应解密**：搜 `decrypt` / `AES` ，能定位到一个 `BIRDREPORT_APIJS` 对象，它先设置 `key` / `iv` ，再调用自己的 `decode()` ！

请求侧的入口函数 `get_arg` 抠出来后是这样的（来自真实文件 `js/birdreport3_req.js` ）：

```javascript
// 取自仓库真实 js：Project7/birdreport/js/birdreport3_req.js
var encrypt = new JSEncrypt;
var paramPublicKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvxXa98E1uWXnBzXkS2yHUfnBM6n3PCwLdfIox03T91joBvjtoDqiQ5x3tTOfpHs3LtiqMMEafls6b0YWtgB1dse1W5m+FpeusVkCOkQxB4SZDH6tuerIknnmB/Hsq5wgEkIvO5Pff9biig6AyoAkdWpSek/1/B7zYIepYY0lxKQIDAQAB";
encrypt.setPublicKey(paramPublicKey);

function get_arg(page){
    var res = {}
    var timestamp = Date.parse(new Date);
    var requestId = getUuid();
    var data =  '{"limit":"20","page":"'  + page.toString() +   '"}'
    options.data = encrypt.encryptLong(data)
    var sign = MD5(data + requestId + timestamp);
    res["timestamp"] = timestamp.toString()
    res["requestId"] = requestId
    res["data"] = options.data
    res["sign"] = sign
    return res
}
```

可以看到逻辑非常清晰：

-   `data` 就是明文 JSON `{"limit":"20","page":"N"}` ，被 `encrypt.encryptLong()` 做了 RSA 长加密；
-   `sign = MD5(data + requestId + timestamp)` ，注意这里拼的是 **加密前的明文 data**；
-   `requestId` 由 `getUuid()` 生成。

响应侧的解密入口在 `js/birdreport3_res.js` ：

```javascript
// 取自仓库真实 js：Project7/birdreport/js/birdreport3_res.js
var CryptoJS = require('crypto-js');
// ...（站点自带的混淆加解密对象 BIRDREPORT_APIJS）...

BIRDREPORT_APIJS.iv = "53536868555767547048526949655455"
BIRDREPORT_APIJS.key = "6756696653534952657053656868665752665050485566485667545454484967"

function get_res(Data){
    resp = { data:Data }
    var decryptData = BIRDREPORT_APIJS.decode(resp.data);
    return decryptData
}
```

也就是说，站点把所有加解密都塞进了一个 `BIRDREPORT_APIJS` 对象里，我们只要给它喂上 `key` / `iv` ，调用 `decode()` 就能解响应。

【图2：搜索 JSEncrypt / encryptLong 定位加密函数，或 BIRDREPORT_APIJS.decode 调用栈 —— 建议截图】

## 四、JS 还原与补环境

这个项目的还原分三块：

### 1\. RSA 长加密（请求）

原生 JSEncrypt 只能加密很短的字符串（受模长限制），而这里的 `data` 可能较长，所以站点给 `JSEncrypt.prototype` 加了一个 `encryptLong` 。仓库里保留了这段改写：

```javascript
// 取自仓库真实 js：Project7/birdreport/js/birdreport3_req.js
JSEncrypt.prototype.encryptLong = function(str) {
    var encrypted = this.getKey().encryptLong(str) || "";
    var uncrypted = this.getKey().decryptLong(encrypted) || "";
    var count = 0;
    var reg = /null$/g;
    while (reg.test(uncrypted)) {
        count++;
        encrypted = this.getKey().encryptLong(str) || "";
        uncrypted = this.getKey().decryptLong(encrypted) || "";
        if (count > 10) { break }
    }
    return encrypted
};
```

它的做法是：底层 `RSAKey.encryptLong` 把长文本按长度 **分段** 分别 RSA 加密，再拼接成一段 Base64。上面那段 `while` 是在处理分段加密末尾出现的 `null` 字节，属于站点对 JSEncrypt 的补丁。 **这块代码必须原样保留**，自己重写很容易和站点不一致。

### 2\. MD5 签名（请求）

`sign = MD5(data + requestId + timestamp)` 。这个 `MD5` 是站点 webpack 打包进来的一整个模块（ `var MD5 = function(r){...}` ），我直接整块扣下来。

### 3\. AES 解密（响应）+ 补环境

响应解密依赖 `BIRDREPORT_APIJS` ，这是一个被压缩混淆的对象。为了让它能在 Node / `execjs` 里跑，我在文件顶部补了最小环境：把 `window` 指向 `global` 。同时站点 SDK 里带有 **反调试 / 控制台检测** （会遍历 `console` 的方法、检测 `toString` ），所以我还需要把它关掉——真实文件里就做了这件事：

```javascript
// 取自仓库真实 js：Project7/birdreport/js/birdreport3_res.js（顶部补环境）
window = global

const __console = {};
['log','info','warn','error','debug','table','trace'].forEach(m => {
    __console[m] = console[m].bind(console);
});
// ...中间是被混淆的 BIRDREPORT_APIJS 定义...

function get_res(Data){
    resp = { data:Data }
    var decryptData = BIRDREPORT_APIJS.decode(resp.data);
    Object.keys(__console).forEach(m => {
        console[m] = __console[m];
    });
    return decryptData
}
```

这里有个小技巧： **先把 `console` 的方法存起来，再让 SDK 运行，最后再恢复**。因为 SDK 运行时可能会改写 / 静音 `console` ，如果不还原，我们前面打印的调试信息就全没了。

工具选择上：

-   **请求侧** （含 RSA）用 `execjs` 即可，因为 `birdreport3_req.js` 是自包含的，不含复杂环境依赖；
-   **响应侧** （ `birdreport3_res.js` ）同样用 `execjs` ，但它 `require('crypto-js')` ，所以机器上要 `npm i crypto-js` 。

## 五、Python 实现

仓库里的 `py/birdreport.py` 把“取参数 → 发请求 → 截密文 → 解密”串成了一条线：

```python
# 取自仓库真实 py：Project7/birdreport/py/birdreport.py
import requests
import os
import execjs


def Spider(page:int):

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    JsPath = os.path.join(BASE_DIR,'..','js','birdreport3_req.js')
    JsResPath = os.path.join(BASE_DIR,'..','js','birdreport3_res.js')
    with open(JsPath, encoding="utf-8") as f:
        Js_code = f.read()
    with open(JsResPath, encoding="utf-8") as f:
        JsRes_code = f.read()
    Js = execjs.compile(Js_code)
    arg = Js.call("get_arg",page)
    JsRes = execjs.compile(JsRes_code)

    headers:dict[str,str] = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://www.birdreport.cn",
        "Referer": "https://www.birdreport.cn/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "requestId": arg["requestId"],
        "sign": arg["sign"],
        "timestamp": arg["timestamp"]
    }
    url:str = "https://api.birdreport.cn/front/activity/search"
    data:str = arg["data"]
    response:str = requests.post(url, headers=headers, data=data).text
    Data:str = response.split('"data":"')[1].split('","timestamp')[0]
    result:str = JsRes.call("get_res",Data)
    print(result)


Spider(7)
```

关键点：

-   `arg = Js.call("get_arg", page)` 拿到 `requestId / sign / timestamp / data` 四件套；
-   把 `requestId / sign / timestamp` 放进请求头，把 `arg["data"]` 作为 body 发出去；
-   响应回来后，用 `response.split('"data":"')[1].split('","timestamp')[0]` 先切出那段加密串，再交给 `get_res` 解密。

## 六、运行结果

执行 `python birdreport.py` ，终端会打印出解密后的活动列表 JSON（记录标题、时间、地点、鸟种数等字段）。大概如下：

```javascript
{'code': 0, 'data': {'list': [{'title': '某某观鸟活动', 'startTime': '2024-xx-xx', ...}], 'total': 100}}
```

如果 `data` 能正常展开成列表，说明 RSA 加密 + MD5 签名 + AES 解密整条链路都对了。

【图3：终端打印出的观鸟活动列表 —— 建议截图】

## 七、踩坑与注意

1.  **`sign` 拼的是明文 `data` ，不是加密后的密文。** 我第一版误把 RSA 密文拿去 MD5，服务端直接判签名错误。核对代码后确认是 `MD5(data + requestId + timestamp)` 。
    
2.  **`encryptLong` 是站点改过的，不能换成原生 JSEncrypt。** 原生库对长文本会抛错或截断，必须保留站点这段分段 + `null` 处理的补丁。
    
3.  **`window = global` 必须补。** 响应解密脚本里用到了 `window` ，在 Node 里没有这个变量，不补会直接报 `window is not defined` 。
    
4.  **响应里的 `data` 要手动切串。** 返回是 `{"data":"...","timestamp":...}` ，直接 `json.loads` 会失败（ `data` 是字符串），得先切出来再解密。
    
5.  **控制台被 SDK 改写。** 站点 SDK 会动 `console` ，所以要在运行前后保存/恢复 `console` 方法，不然 `execjs` 调试输出会莫名其妙消失（属于站点的一种反调试手段）。
    
6.  **`crypto-js` 依赖。** 响应脚本 `require('crypto-js')` ，记得在 JS 目录 `npm i crypto-js` ，否则 `execjs` 会报模块找不到。
    
7.  **`requestId` 每次请求都要重算。** 它是随机 UUID，直接复用旧值会被风控识别。
    

## 八、总结

1.  **“请求 RSA 加密 + MD5 签名 + 响应 AES 解密”是典型双向加密站点的标准结构**，定位方法就是搜 `JSEncrypt` / `encryptLong` / `decrypt` 。
2.  **站点对 JSEncrypt 的 `encryptLong` 补丁要原样保留**，这是与站点保持一致的唯一可靠做法。
3.  **补环境往往只需要补一个 `window`**，但要留意 SDK 的反调试（改写 `console` 等），运行前后记得保存 / 恢复。

* * *
