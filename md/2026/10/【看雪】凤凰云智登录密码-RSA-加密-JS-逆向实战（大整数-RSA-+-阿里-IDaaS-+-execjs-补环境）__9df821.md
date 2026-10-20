---
title: 【看雪】凤凰云智登录密码 RSA 加密 JS 逆向实战（大整数 RSA + 阿里 IDaaS + execjs 补环境）
source: https://bbs.kanxue.com/thread-293278.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-20T08:32:17+08:00
trace_id: 069a6107-e638-42b8-be5f-a79c843c42d5
content_hash: 0d0401e0ae8e0e5898bde9bcc867d0b1c4c68e4997bb6f09e79a03ed4175e919
status: synced
tags:
  - 看雪
  - 密码学
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: 还原凤凰云智登录密码的 RSA 加密：站点把密钥与 RSA 实现一起打包进 webpack bundle，补出 window、localStorage、GLOBAL_CONFIG 让 bundle 跑起来，就能直接调用现成的加密函数。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-8101-861d-f46bd2c9e359
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 还原凤凰云智登录密码的 RSA 加密：站点把密钥与 RSA 实现一起打包进 webpack bundle，补出 window、localStorage、GLOBAL_CONFIG 让 bundle 跑起来，就能直接调用现成的加密函数。
> 
> - **入口定位：** 全局搜 `encryptedString` 命中 webpack 模块 `757026`；它导出函数，把明文先 `encodeURIComponent` 再加密。底层模块 `954746` 是大整数 + Barrett 约减 RSA，按 `chunkSize` 分组做 `m^e mod n` 并拼成十六进制。
> - **密钥来源：** 指数固定 `"10001"`（65537）、私钥 `d` 为空；模数按 `window.GLOBAL_CONFIG.env` 从 daily、pre、prod 三套硬编码十六进制中选取，且 `localStorage.publicKey` 优先，env 写错则密文模数错、服务端判密码错误。
> - **补环境做法：** 文件顶部令 `window = global`，补 `self`、`localStorage`（publicKey 置 undefined）、`GLOBAL_CONFIG`，即可用 `node yuekeyun.js` 打印密文；`BB("757026")` 即 webpack 模块加载器。
> - **易错细节：** `setMaxDigits(130)` 不可省；Python 侧须设 `separators=(',', ':')` 输出紧凑 JSON，并带上 `gray-lease-code`、`gray-user-id` 等请求头。
> - **限制条件：** `captchaVerifyParam` 绑定浏览器指纹与行为，纯 requests 难稳定复现，需打码或专项逆向；用 execjs 直调会被 JS 尾部 `console.log` 污染 stdout，建议改成只返回值的导出函数。

> 本文是「JS 逆向实战 30 例」系列第 11 篇，项目源码：JS 逆向实战 30 例 · 开源仓库 （ `Project11` ）

## 一、目标与背景

凤凰云智（ `lark.yuekeyun.com` ）是一套企业办公平台，它的登录走的是 **阿里 IDaaS** （ `lark-acl.alibaba.com` ）。抓包会发现，账号只以明文 `loginId` 出现，而 `password` 是一长串十六进制——这就是这篇文章要还原的核心： **登录密码的 RSA 加密**。除了密码，请求体里还有 `captchaVerifyParam` （阿里无痕验证的票据）和 `sceneId` ，前者需要靠打码/指纹方式自取，后者是站点级公开常量。

这是一个很经典的「JS 加密 + 只还原单个加密函数」的场景，难点不在算法本身（就是标准 RSA），而在于：

-   RSA 是大整数实现，密钥是页面里写死的三套公钥（按环境区分）；
    
-   站点 JS 是一整个 **webpack bundle**，必须补出 `window` / `localStorage` / `GLOBAL_CONFIG` 才能跑；
    
-   加密前对明文做了 `encodeURIComponent` ，这个编码细节很容易漏。
    
-   站点： `https://lark.yuekeyun.com/`
    
-   目标接口： `https://lark-acl.alibaba.com/idp/loginAccountAndPwd` （POST）
    
-   需还原字段： `password` （RSA）、 `captchaVerifyParam` 、 `sceneId`
    
-   难度：⭐⭐⭐（webpack 补环境 + 大整数 RSA）
    

| 字段  | 含义  |
| --- | --- |
| `loginId` | 账号明文 |
| `password` | RSA 加密后的十六进制串（本文重点） |
| `captchaVerifyParam` | 阿里验证码的验证票据，需自行获取 |
| `sceneId` | 验证码场景 ID（站点公开常量） |

## 二、抓包分析

打开 DevTools 的 Network，在登录页输入账号密码、点登录，筛 `loginAccountAndPwd` ，就能看到这个 POST：

```python
POST https://lark-acl.alibaba.com/idp/loginAccountAndPwd?access_token=
content-type: application/json;charset=UTF-8
origin: https://lark.yuekeyun.com
referer: https://lark.yuekeyun.com/
gray-lease-code: null
gray-user-id: null

{"loginId":"你的账号","password":"你的密码(密文)","captchaVerifyParam":"你的captchaVerifyParam","sceneId":"1fz224se"}
```

一眼能判断： `loginId` 是明文， `password` 不是 MD5（MD5 是 32 位固定长度），而是一长串十六进制、长度随明文变化——这是 **RSA** 的典型特征。 `captchaVerifyParam` 是阿里验证码 SDK 生成的，属于「环境绑定」产物，不在本次还原范围内，先留占位。

【图1：DevTools 里抓到的 loginAccountAndPwd 请求，圈出 password —— 建议截图】

我把请求头里的 `gray-lease-code` / `gray-user-id` 一起抄进 Python，服务端对这几个头有校验。

## 三、定位加密入口

站点只有一个大的 bundle（本项目的 `js/yuekeyun.js` ，约 82KB）。定位加密函数最快的办法是 **全局搜关键字**：搜 `RSA` 、 `encryptedString` 、 `password` 。

搜 `encryptedString` 会落到一个 webpack 模块 `757026` ，它导出「把明文转成密文」的函数：

```javascript
// 取自 js/yuekeyun.js 模块 757026 —— 密码加密入口
757026: (e, t, n) => {
    "use strict";
    var r = n(385784).default;
    var a = r(n(954746))          // 大整数 RSA 实现
        , o = r(n(624362))        // daily 环境公钥
        , i = r(n(896378))        // pre 环境公钥
        , s = r(n(949284));       // prod 环境公钥
    const l = {
        daily: o.default, zlg_daily: o.default,
        pre:   i.default, zlg_pre:   i.default,
        prod:  s.default, zlg_prod:  s.default
    };
    a.default.setMaxDigits(130);
    const u = new a.default.RSAKeyPair(
        "10001", "",                                    // 指数 e
        localStorage.publicKey || l[window.GLOBAL_CONFIG.env]   // 模数 n（按环境取）
    );
    t.default = e => a.default.encryptedString(u, encodeURIComponent(e))  // ★ 先编码再加密
}
```

几个关键点立刻清晰了：

1.  公钥不是从接口拿的，而是 **按 `window.GLOBAL_CONFIG.env` 在页面里选死的** （daily / pre / prod 三套，都是十六进制模数， `624362` / `896378` / `949284` 三个模块的 `e.exports` 就是那串长十六进制）。本项目 `GLOBAL_CONFIG.env = "prod"` 。
2.  指数 `e = "10001"` （即 65537）， `d` 为空（只有公钥，无需私钥）。
3.  `setMaxDigits(130)` 决定了分包大小，必须调用，否则大整数运算会崩。
4.  最容易被忽略的是 `encodeURIComponent(e)` —— **先 URL 编码、再加密**。

再往上一层，模块 `954746` （ `encryptedString` 的宿主）就是一份经典的「大整数 + Barrett 约减」RSA：

```javascript
// 取自 js/yuekeyun.js —— 大整数 RSA 的出口
e.exports = {
    RSAKeyPair: function (e, t, n) {
        this.e = C(e), this.d = C(t), this.m = C(n),
        this.chunkSize = 2 * w(this.m), this.radix = 16, this.barrett = new G(this.m)
    },
    setMaxDigits: d,
    encryptedString: function (e, t) {          // e=RSAKey, t=明文
        for (var n = new Array, r = t.length, a = 0; a < r;) n[a] = t.charCodeAt(a), a++;
        for (; n.length % e.chunkSize != 0;) n[a++] = 0;     // 补零到 chunkSize 整数倍
        var o, i, s, l = n.length, u = "";
        for (a = 0; a < l; a += e.chunkSize) {
            for (s = new p, o = 0, i = a; i < a + e.chunkSize; ++o)
                s.digits[o] = n[i++], s.digits[o] += n[i++] << 8;
            var c = e.barrett.powMod(s, e.e);                // 分组幂模
            u += (16 == e.radix ? E(c) : v(c, e.radix)) + " ";
        }
        return u.substring(0, u.length - 1)
    }
}
```

这就是一份可独立复现的算法：把明文按 `chunkSize` 分组、每组当大整数做 `m^e mod n` 、转十六进制拼接。

【图2：在 `t.default = e => ...encryptedString(...)` 一行打断点，看调用栈 —— 建议截图】

## 四、JS 还原与补环境

由于打包代码一启动就引用 `window` / `localStorage` / `window.GLOBAL_CONFIG` ，直接用 Node 跑会报「window is not defined」。所以在文件顶部先 **补环境** （这也是仓库的真实做法）：

```javascript
// 取自 js/yuekeyun.js —— 顶部补环境
var BB;

window = global
self = window

localStorage = {
    "__ETAG__CNA__ID__": "20260728_fpbvIgnmvHEBASQIgmayfsy0",
    "tfstk__": "...",       // 站点埋点字段，照抄，非隐私
    "isg__": "...",
    "syfhs": "1346664329",
    "ETLCD": "false",
    "auyst": "1785243896"
}
localStorage.publicKey = undefined          // 关键：默认 undefined，走 GLOBAL_CONFIG.env 分支
window.GLOBAL_CONFIG = {
    "assets": "//g.iyunzhi.com/s/v/alipic-lark/larkportal-front/5.0.23/",
    "envType": "PROD",
    "appType": "YZ",
    "appName": "云智",
    "env": "prod",                          // ★ 决定用哪套公钥
    "version": "5.0.23"
}
```

补完环境后，bundle 能正常初始化，末尾就是原作者留下的调用示范：

```javascript
// 取自 js/yuekeyun.js —— 尾部调用
NN = { "loginId": "dssdfasg aoijsdf;ngs", "password": "gbaeoijg;qjg36" }  // 占位/示例值

DD = BB("757026")
const password = (0, DD.default)(NN.password)   // ← 拿到 RSA 密文
console.log(password)

TT = "C0Hd0zExy5"
NXNX = "1.0" === "3.0" ? t : window.btoa(JSON.stringify({
    certifyId: t,
    sceneId: this.config.SceneId,
    isSign: !0,
    securityToken: this.config.securityToken
}))
```

运行 `node yuekeyun.js` ，控制台就会打印出 `NN.password` 对应的密文。 `BB("757026")` 是 webpack 的模块加载器，等价于 `require` 。

> 说明：仓库里 `NN.loginId` / `NN.password` 是演示占位值，不是真实凭据；真实账号密码属于隐私，按仓库约定统一用 `你的xxx` 占位。

## 五、Python 实现

Python 侧比较简单：密码密文和验证票据作为 **输入** （先用 `node` 或本条 JS 算出密文，再填进去），然后带齐请求头 POST。

```python
# 取自 py/yuekeyun.py
import requests
import json

headers = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "gray-lease-code": "null",
    "gray-user-id": "null",
    "origin": "https://lark.yuekeyun.com",
    "referer": "https://lark.yuekeyun.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
}
url = "https://lark-acl.alibaba.com/idp/loginAccountAndPwd"
params = {"access_token": ""}
data = {
    "loginId": "你的账号",
    "password": "你的密码(密文)",          # ← RSA 密文
    "captchaVerifyParam": "你的captchaVerifyParam",
    "sceneId": "1fz224se"
}
data = json.dumps(data, separators=(',', ':'))   # ★ 紧凑 JSON，不能带空格
response = requests.post(url, headers=headers, params=params, data=data)

print(response.text)
print(response)
```

也可以把它接到 `execjs` 里，让 Python 直接调 JS 出密文（需要注意 `yuekeyun.js` 末尾那段 `console.log(password)` 会污染 stdout，最好改成一个只返回值的入口函数）：

```python
import execjs
Js = execjs.compile(open("js/yuekeyun.js", encoding="utf-8").read())
# 前提：把文件尾部改成导出函数，例如 function get_pwd(p){ return BB("757026").default(p) }
# pwd = Js.call("get_pwd", "你的明文密码")
```

## 六、运行结果

`node yuekeyun.js` 跑通后，终端会给出一长串十六进制密文（ `NN.password` 的 RSA 结果），长度明显大于明文。把这段密文填进 `yuekeyun.py` 的 `password` ，带上有效的 `captchaVerifyParam` ，服务端就不再返回「密码错误」，而是正常下发登录流程：

```python
{"success":true,"content":{"data":{...},"...":"..."}}   // 或成功后的跳转态数据
<Response [200]>
```

若验证码票据过期/无效，会看到类似验证失败的返回（阿里侧错误码）。

【图3：终端打印 RSA 密文 + loginAccountAndPwd 返回 200 —— 建议截图】

## 七、踩坑与注意

1.  **先编码、后加密**： `encryptedString(u, encodeURIComponent(e))` ，明文里的中文、 `+` 、 `@` 等会被 URL 编码后再进 RSA，漏掉这一步结果一定不对。
2.  **`setMaxDigits(130)` 不能省**：它初始化大整数位宽，不调用直接 `RSAKeyPair` 会异常。
3.  **公钥按环境选**： `l[window.GLOBAL_CONFIG.env]` 用的是当前环境的公钥；自己补环境时 `env` 写错（比如写成 `pre` ）会导致密文换了模数，服务端直接判定密码错误。仓库里 prod 对应 `949284` 那段长十六进制。
4.  **`captchaVerifyParam` 是环境绑定产物**：它不是纯算法，跟浏览器指纹、行为、时间戳都相关，纯 `requests` 很难稳定复现，需要打码平台或专门的验证码逆向。仓库里同样以 `你的captchaVerifyParam` 占位。
5.  **`execjs` 的 stdout 污染**： `yuekeyun.js` 尾部自带 `console.log(password)` ，用 `execjs` 直调时该输出会混进 node stdout。稳妥做法是把它改写成导出函数，只在页面返回字符串。
6.  **JSON 必须紧凑**： `json.dumps(..., separators=(',', ':'))` ，阿里 IDaaS 对 body 原文（哪怕空格）可能参与校验。
7.  **占位符**：仓库里 `loginId` / `password` / `captchaVerifyParam` 均为占位，直接运行必失败，请替换为你自己的。

## 八、总结

凤凰云智这类站点把「密钥 + RSA 实现」整体打进 webpack，逆向的关键不是重写 RSA，而是 **补出 `window` / `localStorage` / `GLOBAL_CONFIG` 让 bundle 跑起来，再拿到那个封装好的加密函数**。记住 RSA 密文两个特征：十六进制、长度固定且远大于明文；再记住「先 `encodeURIComponent` 再加密」这个最容易翻车的细节。

* * *
