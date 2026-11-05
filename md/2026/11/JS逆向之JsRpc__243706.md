---
title: JS逆向之JsRpc
source: https://fatkun.github.io/post/2025/reverse_jsrpc/
source_host: fatkun.github.io
clip_date: 2026-11-05T10:21:57+08:00
trace_id: f447323a-c3b2-4501-bafb-311afa2f0e08
content_hash: fb6d57d67aeb7fcc2e7838a69c668edc2ba8c42241d6e18a1893b236079fa435
status: synced
tags:
  - JS逆向
  - Hook
series: null
feed_source: Fatkun·安卓逆向
ai_summary: JsRpc 通过 WebSocket 让服务端远程在浏览器中执行 JS 来生成加密参数，用浏览器原生环境彻底绕过补环境难题。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40f75244-d011-8182-86d7-fcda6f9b9281
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> JsRpc 通过 WebSocket 让服务端远程在浏览器中执行 JS 来生成加密参数，用浏览器原生环境彻底绕过补环境难题。
> 
> - **核心原理：** 在浏览器控制台建立 WebSocket 客户端连接服务端，服务端可下发命令在浏览器执行 JS，前提是允许使用浏览器且能定位加密方法入口，从而免去 Node 环境补环境的痛苦。
> - **目标场景特征：** 小程序加密逻辑带防重放参数（URL 一段时间只能访问一次）；APP 加密走 native 方法难以跟踪；部分网址可在浏览器直接访问，提供了单点调试的条件。
> - **Hook 关键坑：** 请求实际经 axios 底层的 `XMLHttpRequest.open` 改写 URL，直接覆盖 open 方法会导致加密参数失效，因为代码用 `toString` 加正则检测 native 方法，需重定义 `toString` 返回 `function open() { [native code] }` 绕过检测。
> - **覆盖时机：** 必须先覆盖 open 并保存 URL 到 `_url`，再加载加密逻辑（它会二次覆盖 open），最终通过 `xhr._url` 拿到加密后的 URL 和 cookies。
> - **JsRpc 使用步骤：** 运行服务端程序与 config.yaml、控制台注入 JsEnv_Dev.js、用 `Hlclient` 注册 `regAction` 方法、最后通过 `http://127.0.0.1:12080/go?group=...&action=enc&param=...` 的 HTTP 接口调用；缺点是依赖浏览器、部分操作需手工、WebSocket 可能被针对性检测。

## 概要

最近在学习补环境，补到哭，学艺不精，虽然代码没报错，但是就是得不到想要的结果，肯定是哪里环境没补到位。 焦头烂额，灰心丧气中发现JsRpc这个东西。

## 什么是JsRpc

JsRpc是指在控制台新建一个WebScoket客户端链接到服务器通信，服务端可以发送命令在浏览器执行js代码。这样就天然不需要补环境，因为本身就在浏览器下运行。 适用场景：

-   允许使用浏览器
-   能找到加密方法如何执行

## 回到具体场景

我测试的是一个小程序，同时也有一个APP。小程序代码可以使用网上的工具解包还原，但是里面只找到一些加密和解密的逻辑，它还做了防重放处理。它会在url加上一个参数，每隔一段时间只能访问一次。 转而去分析APP应用，发现APP有两种请求，一种是不带参数的，一种的带参数的。不带参数的header里额外加了参数，跟踪代码发现通过native方法来加密，触发知识盲区，放弃跟踪，而且没带参数的请求类型不多。这个APP更像是一个webview，把小程序的代码放进来了。话说回来，好像也有通过RPC调用的方式，执行某些方法来调用so。 偶尔通过抓包发现有部分网址可以在浏览器访问，这真的是帮了大忙。可以使用控制台看输出了，并且可以单点调试。

首先遇到的第一个问题是js代码防断点，里面有非常多的debugger，不过chrome浏览器可以一键把所有忽略匿名方法里的debugger，直接就跳过了。 我测试的这个网页非常像瑞数，代码类似，验证的环境也比较像，但是和网上的又不一样，只请求一次，只设置一次cookies。回到代码本身，我要找到什么时候在请求的时候，增加了校验参数。代码使用了axios来请求，我在它的拦截器里面打死找不到哪里改了url。分析axios实际是使用XMLHttpRequest来请求的，在XMLHttpRequest.open可以对URL做出修改。 尝试把关键代码提取出来，构造一个XMLHttpRequest请求，发现主要逻辑在混淆代码上，有两个js，第一段js只是设置一些值，第二段js是真正的逻辑，里面有非常多的浏览器环境检测，以及我们想要的添加token代码。 尝试把两段代码都保存到本地，发现执行会报错，可能对时间还是什么做了校验，只好第一段保存，第二段还是从网络获取了。我在补环境的时候，使用nodejs也是动态加载的。

```javascript
async function downloadAndExecute(url) {
  const response = await fetch(url);
  const code = await response.text();
  window.fetch = function fetch() {}
  eval(code); // 不推荐，因为 eval 有安全隐患
}
```

上面代码只是补环境需要，使用JsRpc不需要用到。 尝试hook XMLHttpRequest.open方法

```javascript
// 保存原始的 XMLHttpRequest 对象
const originalOpen = XMLHttpRequest.prototype.open;

// 覆盖 open 方法
XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    // 在这里添加你的自定义逻辑
    console.log('自定义逻辑：', method, url);
    this._url = url;

    // 调用原始的 open 方法
    return originalOpen.apply(this, arguments);
};
```

但是发现加了之后，就不增加加密参数了。之前在做断点调试分析时发现有用到toString，有用正则表达式判断是否是native方法。所以还得还原toString()，欺骗它还是native方法。

```javascript
// 修改 toString 方法以模仿原生方法的行为
Object.defineProperty(XMLHttpRequest.prototype.open, 'toString', {
    value: function() {
        return 'function open() { [native code] }';
    },
    writable: false,
    enumerable: false,
    configurable: true
});
```

果然，改了之后又正常了。能够正常调用之后，JsRpc就可以进场了。理论上在原来网页上也可以做的，不用抽取代码。只是当时提取了，就用提取的代码操作了，构造一个方法方便我获取加参数的URL。

```javascript
function enc(url) {
    var xhr = new XMLHttpRequest();
    //console.log(url)
    xhr.open("POST", url, true);
    return {
        url: xhr._url,
        cookies: document.cookie
    }
}
```

由于xhr.open之后无法获取它的url，我在前面覆盖了open方法，设置url后保存在\_url上，后面就可以用xhr.\_url获取到最终的url。注意前面代码覆盖的时机，我是先覆盖，然后再加载加密方法，里面会再覆盖一次xhr.open方法，这样我们覆盖的方法就能拿到加密后的url。

增加额外方法之后，就可以使用JsRpc了，很简单，可以看首页上的说明。 主要步骤有：

1.  下载程序和config.yaml，运行起来
2.  在控制台填入JsEnv_Dev.js的代码
3.  连接你的程序，然后可以注册一个方法调用你自己的方法

```javascript
var demo = new Hlclient("ws://127.0.0.1:12080/ws?group=zzz");
demo.regAction("enc", function (resolve, param) {
    //这样添加了一个param参数，http接口带上它，这里就能获得
    var value = enc(param)
    resolve(value);
})
```

4.  最后浏览器尝试调用一下就完成了

```
http://127.0.0.1:12080/go?group=zzz&action=enc&param=https://xxx.com/xxx
```

## 总结

使用JsRpc真的非常省时间，你只要能够找到调用入口就行了，浏览器原生环境，不需要补环境。缺点当然是要求浏览器运行，而且现在我有些是手工操作，不能自动运行，WebSocket也可能被针对，但是对于当前我的用途已经足够了。
