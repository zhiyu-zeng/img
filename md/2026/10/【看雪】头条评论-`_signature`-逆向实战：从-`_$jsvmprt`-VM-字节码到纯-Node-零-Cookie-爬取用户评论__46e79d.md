---
title: 【看雪】头条评论 `_signature` 逆向实战：从 `_$jsvmprt` VM 字节码到纯 Node 零 Cookie 爬取用户评论
source: https://bbs.kanxue.com/thread-293096.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-10T00:02:22+08:00
trace_id: 70a490d7-0f07-4223-bc34-4be7bb758d96
content_hash: 8c388201ee7e1a6171443f9167aa0ce6a80fff581c877583d346f3ea1068dbfb
status: synced
tags:
  - 看雪
  - 协议分析
  - Hook
series: null
feed_source: 看雪·逆向工程
ai_summary: 纯 Node 还原某资讯平台评论接口 `_signature`：识别出 acrawler SDK 是自研 VM 字节码后改走「补环境重放原脚本」，并用消融测试砍掉整条 cookie 反爬链。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-818f-b3ec-fdc06a4d275a
ioc:
  cves: []
  cwes: []
  hashes:
    - 484e4f4a403f5243000d2d1aea78184c36c3d671
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 纯 Node 还原某资讯平台评论接口 `_signature`：识别出 acrawler SDK 是自研 VM 字节码后改走「补环境重放原脚本」，并用消融测试砍掉整条 cookie 反爬链。
> 
> - **保护定性：** `_$jsvmprt("484e4f…",[…])` 是自研栈式 JS 虚拟机 + hex 字节码，属编译产物而非混淆，外层无任何明文哈希，手写还原与单值结构分析两条路均死。
> - **可行路线：** `vm.createContext` 伪造 window/global/navigator/canvas 等 33 个探测对象后原样执行 71KB 脚本，直接调 `sign({url})`；坑包括 global 未定义、误设 `exports/module/define` 被判成 Node、`getElementsByTagName` 须返回含元素数组、`sign` 不接受非空裸字符串。
> - **消融测试：** 仅 `_signature`、加 Node 自造 `__ac_signature`、加完整浏览器 cookie 三组结果一致（HTTP 200 + 20 条评论），证明评论接口零 cookie、零 ttwid，服务端只校验 MAC 与格式而不验指纹真实性。
> - **字节码格式：** 头部含魔数 `HNOJ@?RC`、XOR 密钥 r（样本=2）、代码区长度 21922B/11262 条指令与 682 条映射加密字符串池；opcode 解码为 `op = 13*j % 241`（13 与质数 241 互质构成双射），操作数长度须用原始字节 `j` 查 F 的 6 张表而非 `op`。
> - **算法骨架：** 逆出 XTEA 变种（轮数 `6+52/len`、`(sum>>>2)&3` 选密钥、CBC 链式）、SDBM 家族（乘数 65599）与 30 位→5 字符的自定义 base64；剩 128 位内嵌密钥未抠出，故仍依赖原脚本，且 `_signature` 秒级时效、每页需重签。

> 摘要：本文按时间顺序，完整记录一条"还原 `_signature` 并爬取评论"的逆向全过程。目标接口的签名藏在 **acrawler SDK** 里，而 acrawler 的算法本体是一台 **自研 JS 虚拟机 `_$jsvmprt` 解释的字节码**——不是混淆，是编译产物，肉眼不可读。两条常规路线（手写还原算法 / 分析签名值）全部走不通后，最终靠 **补环境 + 原脚本重放**，把 71KB 的 SDK 原样塞进 Node 的 `vm` 沙箱里跑起来，直接调用它的 `sign()` 产出有效签名。中途一个 **消融测试** 把整个任务砍掉了大半：实测评论接口 **只认 `_signature` 、零 cookie、零 ttwid**。本文把走通的、走不通的、以及补环境时踩的每一个坑，一五一十都写出来。全文分两半： **上半场** （§0~§10）讲怎么靠「补环境 + 消融测试」把评论爬下来； **下半场** （§11）回头把 VM 字节码拆开，还原出签名算法骨架

## 0\. 起因：一个"爬评论"的目标

起因很朴素：想爬某平台一篇文章的 **评论**。评论接口长这样：

```python
GET /article/v4/tab_comments/?aid=24&app_name=toutiao_web&offset=0&count=20&group_id=XXXX&item_id=XXXX&_signature=...
```

`_signature` 是客户端生成的签名，服务端校验它。需求落到工具上就一句话： **用纯 Node 把这个签名算出来**，脱离浏览器。

当时手上有：

-   目标文章 URL（公开页面）
-   评论接口 URL（含真实的 `_signature` 样例，但那是浏览器里生成的、带时间戳的过期值）
-   Chrome DevTools MCP（真实浏览器，用来过验证、拿 ground truth）

一眼看去这是个标准的 JS 逆向任务：找到签名函数，还原它。结果第一脚就踢到了铁板——而且后面证明，前面拦着的是两块硬骨头： **`_$jsvmprt` VM 字节码保护**、以及 **一整套看似必需、实则对评论接口完全多余的 cookie 反爬链**。

## 1\. 第一个异常：请求文章，拿到的却是"挑战页"

还没开始逆签名，先撞上一个更基础的问题： **直接 curl 文章 URL，返回 200，但内容根本不是文章**，而是一段反爬挑战脚本，内联了约 71KB 的 acrawler SDK：

```javascript
window.byted_acrawler.init({aid:99999999,dfp:0});
var __ac_nonce = _f2("__ac_nonce");                        // 从 cookie 读 nonce
__ac_signature = window.byted_acrawler.sign("", __ac_nonce); // 算 __ac_signature
_f3("__ac_signature", __ac_signature);                      // 写回 cookie
window.location.reload();                                   // 刷新
```

这段挑战脚本本身就是一条重要线索，它告诉我们反爬链的起点：

```python
请求文章 URL
  └─(1) 挑战页 + Set-Cookie: __ac_nonce          [服务端下发]
  └─(2) 算 __ac_signature = acrawler.init({aid:99999999,dfp:0}).sign("", nonce)
  └─(3) 带 cookie 二次请求 → ttwid 注册页 → 真实文章页
  └─(4) 文章页加载 CDN acrawler，init({aid:24, dfp:true})，sign({url}) → _signature
```

**关键认识 ①**： `_signature` 前面还有一道 `__ac_signature` 反爬门（ `aid=99999999` ）。当时第一反应是"完了，要爬评论得先把这一整条链都过一遍"—— **这个判断后面被消融测试推翻了，先按下不表**。

> 这里埋一个贯穿全过程的教训，我提前说出来： **"反爬链很长"不等于"目标接口依赖整条链"。** 画全链路地图是对的，但别被地图吓住。后面 §7 的消融测试证明，评论接口其实只依赖其中一环。

## 2\. 定位签名入口：byted_acrawler.sign({url})

过门后的真实页面（用真实浏览器打开）才暴露 acrawler 的本体。几个事实：

-   acrawler 的 CDN 地址拿到后， `acrawler.js` 下载下来约 **71KB**，与验证页内联版 **完全相同**。
-   页面加载后调用 `window.byted_acrawler.init({aid:24, dfp:true})` ，随后 `sign({url})` 生成接口用的 `_signature` 。
-   先摸清 API 面， `Object.keys(byted_acrawler)` ：

```json
["BytedAcrawler", "getReferer", "init", "sign"]
```

`sign` 有两种入参形态，走不同代码路径：

| 调用  | 用途  | 返回  |
| --- | --- | --- |
| `sign({ url: "https://..." })` | 接口 `_signature` | `_02B4Z6wo00f01...`（含指纹段，长） |
| `sign("", __ac_nonce)` | 反爬 `__ac_signature` | `_02B4Z6wo00f01...`（47 字符，无指纹段） |

到这里，目标已经很清晰： **还原 `sign({url})` 的实现**。

* * *

## 3\. 关键判断：这是 VM 字节码，不是混淆

去读 `acrawler.js` 的 `sign` 实现，傻眼了。SDK 里签名算法的本体长这样：

```javascript
var glb;(glb="undefined"==typeof window?global:window)._$jsvmprt=function(b,e,f){...};
glb._$jsvmprt("484e4f4a403f5243000d2d1aea78184c36c3d671...", [33个全局对象]);
```

-   `_$jsvmprt` 是 **自研 JS 虚拟机解释器**，紧跟着的十六进制是 **编译后的字节码**。
-   `sign` 算法 **全部在字节码里**，外层 **搜不到任何明文算法**——没有可读的 MD5/HMAC/SHA 调用链，没有肉眼可辨的字符串拼接。

这就是整场逆向最关键的判断：

> **关键认识 ②**： `_$jsvmprt` + 一坨 hex = VM 字节码保护。这不是混淆（混淆是把可读代码搅乱，理论上还能还原），这是 **编译产物**——算法已经被编译成另一门字节码，由内嵌的解释器执行。 **"手写干净 JS 还原哈希"是死胡同**，你面对的不是代码，是一台虚拟机。

怎么确认它是"虚拟机"而不是"一段被压缩的普通代码"？看 `_$jsvmprt` 函数体的形状。美化后约 460 行，核心是三个互相调用的函数（我后面用 §11 的命名先剧透一下）：

-   一个 **预处理器**：拿到那串 hex，从头 walk 一遍，把每条指令的操作数按长度抽出来，存进一个数组备用。
-   一个 **函数入口**：负责构造调用帧、绑定参数和作用域，然后跳进主循环。
-   一个 **主分发循环**： `while` + 一个巨大的分支表，每次从字节流里取一个字节，映射成操作码，压栈/弹栈/跳转/调用——这就是 **栈式虚拟机** 的教科书结构（有操作数栈、栈顶指针、局部变量表、异常处理栈）。

一段普通代码不会有"取字节 → 查表 → 分派 → 操作栈"这套循环。 **看到这个形状，就能一眼定性：这是解释器，hex 是它的字节码。** 这个判断直接决定了后面的路线——不是去"读算法"，而是要么"带着这台 VM 一起跑"（§6 补环境），要么"把这台 VM 拆开读"（§11 静态还原）。

同时，VM 启动时把 **33 个全局对象** 注入环境，作为环境探测面：

```python
exports, module, define, Object, TypeError, document, InstallTrigger, safari,
Date, Math, navigator, location, history, Image, console, PluginArray,
indexedDB, DOMException, parseInt, String, Array, Error, JSON, Promise,
WebSocket, eval, setTimeout, encodeURIComponent, encodeURI, Request, Headers,
decodeURIComponent, RegExp
```

-   `exports/module/define` 检测 Node/AMD 环境；
-   `InstallTrigger/safari` 检测浏览器家族；
-   `document/navigator/...` 做设备指纹。

**这就是「脱离浏览器」的真正难点**：签名算法依赖一个它以为存在的浏览器环境，你得把这个环境补给它。

* * *

## 4\. 第一条死路：手写还原算法

**现象**：想从 `acrawler.js` 里把签名算法读出来、翻译成干净 JS。

**证据**：外层只有 `_$jsvmprt("484e4f...", [...])` 一行，没有任何明文哈希函数； `sign` 的赋值在字节码里，外层搜不到。

**结论**：算法被编译进字节码，肉眼不可读，逐行翻译无门。 **排除手写还原。**

* * *

## 5\. 第二条死路：分析某个签名值

**现象**：对单个 `_signature` 值做结构拆分，想反推出算法。

**证据**：对比同一浏览器多次 `sign({url})` 的结果，结构是这样的：

```python
_02B4Z6wo00f01 [时间戳+aid+随机段, 每次变] [设备指纹段, 稳定不变] [校验码]
```

-   前缀 `_02B4Z6wo00f01` 固定（版本 + aid 编码）；
-   **指纹段** （约 97 字符）跨调用 **完全一致** （设备指纹稳定）；
-   `dfp:true` 才采集指纹 → 签名长（131~147 字符）； `dfp:0` （或采集失败）→ 签名短（47 字符）。

**结论**：签名值与时间/参数绑定，时间戳段 **每次都变**，分析一个过期值没有意义。方向错了——要先定位「生成代码」，不是「分析值」。

> 这两条死路的价值不在"此路不通"，而在它们共同指向了唯一可行的方向： **算法不可读、值不可反推，那就让原脚本自己跑起来**。这就引出了补环境。

* * *

## 6\. 最终路线：补环境跑原脚本

思路一句话： **伪造一个"足够像浏览器"的全局，让 acrawler 原样在 Node `vm` 里跑起来，直接调 `sign()`**。算法还在字节码里，但没关系——我们不读它，我们执行它。

核心代码（ `acrawler_env.js` ）：

```javascript
const vm = require('vm');

function createAcrawler(initOpts) {
  const sandbox = buildSandbox();              // 伪造 window/document/navigator/canvas...
  vm.createContext(sandbox);
  vm.runInContext(ACRAWLER, sandbox);          // 原脚本原样执行
  const ac = sandbox.byted_acrawler;           // 脚本自己挂上来的
  ac.init(initOpts || { aid: 24, dfp: true });
  return ac;
}

function sign(url) {                            // 接口 _signature
  return createAcrawler({ aid: 24, dfp: true }).sign({ url });
}
```

这三行看着轻描淡写，真正的功夫全在 `buildSandbox()` ——那台"假浏览器"造得像不像，直接决定 acrawler 肯不肯吐签名。

### 6.1 假浏览器怎么造：buildSandbox() 走读

`vm.createContext` 给的沙箱是 **空的**——连 `window` 、 `document` 都没有。而 §3 已经看到，VM 启动时要探测 33 个全局对象。所以 `buildSandbox` 要做的，就是照着那张探测面，一样一样把浏览器"糊"出来。分四层：

**第一层，语言内建。** 这些浏览器和 Node 都有，直接把宿主的塞进去就行：

```javascript
Object.assign(s, {
  Date, Math, parseInt, String, Array, Error, TypeError, Object, JSON,
  Promise, RegExp, eval, setTimeout, setInterval, clearTimeout, clearInterval,
  encodeURIComponent, encodeURI, decodeURIComponent, console,
});
```

**第二层，宿主类。** Node 里可能有也可能没有的（ `WebSocket` / `Request` / `Headers` / `DOMException` ）——有就用真的，没有给个空壳，不让 acrawler 里的 `typeof` 检测抛错：

```javascript
s.WebSocket = typeof WebSocket !== 'undefined' ? WebSocket : function WebSocket() {};
s.Request   = typeof Request   !== 'undefined' ? Request   : function Request() {};
```

**第三层，浏览器指纹面。** `navigator` / `location` / `screen` / `localStorage` 这些，acrawler 的 `dfp` 指纹采集要逐个读。给一套自洽的假值即可——关键是自洽（UA 说自己是 Chrome， `vendor` 就得是 `Google Inc.`， `webdriver` 必须 `false` ）：

```javascript
s.navigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/120.0.0.0 Safari/537.36',
  platform: 'Win32', language: 'zh-CN', vendor: 'Google Inc.',
  hardwareConcurrency: 8, webdriver: false, /* ... */
};
s.location = { href: 'https://www.toutiao.com/', protocol: 'https:', /* ... */ };
s.screen   = { width: 1920, height: 1080, colorDepth: 24, /* ... */ };
```

**第四层，DOM / canvas 桩。** 这是最容易崩的一层。 `init` 会往 `<head>` 塞 `<script>` ， `sign` 会 `createElement("canvas")` 采集画布指纹。桩要"能被调用不报错"，但 **不需要真渲染** （原因见 §6.3）：

```javascript
function makeCanvas2D() {
  return {
    fillText() {}, strokeText() {},
    measureText(t) { return { width: String(t).length * 8 }; },   // 假的文字宽度
    getImageData(x, y, w, h) { return { data: new Uint8Array(w*h*4), width: w, height: h }; },
    // ...其余 fillRect/arc/save/restore 全给空函数
  };
}
```

`canvas` 元素的 `toDataURL` 干脆返回一张固定的 1×1 PNG base64——反正服务器不校验它长什么样。

最后一步，也是 **第一个把我卡住的坑** （见 §6.2 坑 1）——沙箱里没有 `global` ，得让 window 自引用：

```javascript
s.window = s;
s.global = s;
```

### 6.2 补环境踩的坑（每一个都真实报过错）

**坑 1： `global is not defined` 。**

第一次跑，直接 `ReferenceError: global is not defined` 。原因： `vm.createContext` 的沙箱里 **没有 `global`**。修复很简单——自引用：

```javascript
sandbox.window = sandbox;
sandbox.global = sandbox;
```

**坑 2：环境判定。**

沙箱里如果定义了 `exports/module/define` ，VM 会判定这是 Node 环境；定义了 `InstallTrigger/safari` 会被判定为 Firefox/Safari。这两个都不能有—— **留 undefined，让 VM 判定为 Chromium 系**。

**坑 3： `init` 报 `appendChild` 错。**

`init` 内部会 `document.getElementsByTagName("head")[0].appendChild(...)` 。一开始我的 `getElementsByTagName` 返回 `[]` ，`...[0]` 是 undefined，直接报 `Cannot read properties of undefined (reading 'appendChild')` 。修复： **必须返回含元素的数组**。

**坑 4：DOM/canvas 桩。**

`init({dfp:true})` 会做 canvas/webgl/字体指纹采集。 `sign` 里会 `createElement("canvas")` + `getContext("2d")` + `toDataURL` 。关键是——canvas 桩给 **空实现** 即可（ `fillText/measureText/getImageData` 返回假值）， **无需真实渲染**。为什么？因为（§6.2 会讲）服务器根本不校验指纹真实性。

**坑 5： `sign` 入参形态。**

`sign("https://...")` 这种传字符串的调用，直接抛 `[object Object]` 。因为 `sign` 只认两种形态： `sign({url})` 或 `sign("", nonce)` 。 **传一个非空裸字符串是不合法的**，这个错很容易犯。

### 6.2 为什么最小补环境就够

`init({dfp:true})` 本意是采集设备指纹，但我们 **只提供了"能跑通"的 DOM 桩，没复现真实 canvas 像素**。结果签名照样有效（§7 实测 HTTP 200）。

原因： **服务器只校验 acrawler 内嵌密钥算出的 MAC + 格式，不校验设备指纹是否"真实"**。47 字符（无指纹段）的 Node 签名同样能过。这是补环境方案能成立的根本前提。

* * *

## 7\. 决定性的一步：消融测试

原以为「脱离浏览器」要过完整反爬链（ `__ac_nonce → __ac_signature → ttwid → 文章页` ）。但直觉靠不住，直接做 **消融测试**——把 cookie 一件件剥掉，看评论接口还认不认。

三组配置对比（ `ablation.js` ）：

| 配置  | 结果  |
| --- | --- |
| 仅 `_signature` ，无任何 cookie | ✅ HTTP 200 + 20 条评论 |
| `_signature` + Node 生成的 `__ac_signature` / `__ac_nonce` | ✅ HTTP 200 + 20 条评论 |
| `_signature` + 完整浏览器 cookie | ✅ HTTP 200 + 20 条评论 |

三者结果 **完全一致**。

> **关键认识 ③**：整条反爬链（ `__ac_signature` / ttwid）是给「加载文章页」用的， **评论接口根本不管 cookie**，只看 `_signature` 对不对。

这是整个实验 **最省工作量的一个判断**。它把原本要啃的 ttwid（一个 104KB 的 webpack 打包、调 `ttwid.bytedance.com` 拿服务端下发 JWT 的机制） **整个砍掉了**——评论接口不需要它。

* * *

## 8\. 附带验证：\__ac_signature 也能还原（过门）

虽然消融测试证明 `__ac_signature` 对爬评论非必需，但为了完整验证"补环境方案真的还原了 acrawler"，还是顺手过了那道反爬门（ `full_chain.js` ）：

```python
[1] 首次请求 → Set-Cookie: __ac_nonce=...，响应为挑战页
[2] Node 算 __ac_signature = signAc(nonce) → 47 字符
[3] 带 cookie 二次请求 → 不再返回挑战页，进入 ttwid 注册页
```

即 `aid=99999999, dfp=0` 这条 `sign("", nonce)` 路径 **也还原成功**。这证明补环境方案不是"碰巧只对 `_signature` 生效"，而是真的把 acrawler 的 `sign` 完整跑起来了。

* * *

## 9\. 成果：纯 Node 零 Cookie 爬取全部评论

### 9.1 签名与请求

真实端到端验证输出（ `verify.js` ，签名已脱敏，结构保留）：

```python
_signature = _02B4Z6wo00f01Ziq****…ec4
长度 = 47

HTTP 200
评论条数: 20
```

关键点： **每页（offset）都要重新生成签名**——签名覆盖 URL，含 offset，且内嵌秒级时间戳，必须"取到 → 立刻用"，不可缓存复用。

### 9.2 全量爬取

-   分页靠 `offset` （0/20/40...）。
-   `tab_index=0` （热度）/ `tab_index=1` （时间）两 tab 是 **同一集合、不同排序**，去重后得 **全部主评论 429 条**。
-   爬虫内置 800ms 延迟 + 重试。

### 9.3 数据结构 schema（与直觉不符，两个坑）

**坑 6：主评论正文在 `comment.text` ，不是 `comment.content` 。**

一开始按直觉取 `comment.content` ，结果全是空。实际字段是 `comment.text` 。

**坑 7：回复的作者字段和主评论不一样。**

主评论作者是 `comment.user_name` ；但回复的作者在 `.user.name` / `.user.screen_name` ， **没有 `user_name` 这个字段**。回复正文在 `.content` 。主评论和回复的 schema 是 **两套**，混用就拿到空值。

* * *

## 10\. 回复分页：new_reply_list 不够

主评论的 `comment.new_reply_list` 只含 **顶部几条** 回复，不是全部。一条热门评论的 `reply_count` 可能上百，完整回复历史要另走回复分页接口：

```python
GET /2/comment/v4/reply_list/?aid=24&app_name=toutiao_web&id=<评论id>&offset=0&count=20&repost=0
```

响应内层结构：

```python
j.data.data        → 回复数组（本页）
j.data.has_more    → 是否还有下一页
j.data.total_count → 该评论回复总数
```

用 **同一个 `_signature` （aid=24）**，每页重新生成。实测一条最热评论 **146 条回复完整拉满（8 页）**：

```python
└ 评论76****…3474 回复 20/146
└ 评论76****…3474 回复 40/146
└ 评论76****…3474 回复 60/146
...
└ 评论76****…3474 回复 146/146
```

> **坑 8（自己犯的）**：写回复分页时， `maxCount` 参数一度失效——一页固定返回 20 条， `break` 判断写在 `push` 之后，传 `maxCount=1` 实际拿到 20 条。教训： **限流判断要放在入列之前，不是之后**。

* * *

## 11\. 进阶：回头把 VM 字节码拆开看

补环境跑通、评论也爬到了，任务本该结束。但有个问题一直悬着： **签名算法到底是什么？** 补环境是「骗过它」，不是「看懂它」——算法在字节码里，我们只是让原脚本自己跑了起来，里面算的到底是 MD5 还是别的、用了什么哈希，其实一直没搞清。

于是回头做了一轮 **静态还原**：不执行字节码，纯靠读 `_$jsvmprt` 解释器源码（ `F` / `G` / `K` 三个函数），把那段 hex 逆向成可读的伪汇编。这条线和前面的补环境是 **两条独立的路**：补环境是「带 VM 一起跑」，静态还原是「把 VM 拆开读」。

### 11.1 先破解字节码的包装

那串 hex 不是从头到尾都是指令。 `_$jsvmprt(b, e, f)` 拿到参数 `b` （就是那串 hex）后，做的第一件事不是执行，而是 **解析头部**。跟着解释器源码里对 `b` 的下标访问走一遍，头部布局就出来了（下标以「hex 解码成字节后」的字节偏移计）：

```python
偏移        长度   含义
[0  .. 16)  16B   魔数 "HNOJ@?RC"        校验失败直接 throw "error magic number"
[16 .. 24)   8B   版本 / 保留位
[24 .. 32)   8B   XOR 密钥 r             本样本 r = 2
[32 .. 48)  16B   保留 / 计数字段
[48 .. 56)   8B   代码区长度 L           本样本 L = 21922 字节
[56 .. 56+L)      代码区                 11262 条指令
[56+L ..  ]       字符串池               682 条，逐字节 XOR 加密
```

魔数这一步很关键：解释器一上来就拿前 16 字节和硬编码的 `"HNOJ@?RC"` 比，对不上就抛 `error magic number` 。这既是完整性校验，也是给逆向者的第一个明确锚点—— **看到 `HNOJ@?RC` 基本就能确认这是同一套 `_$jsvmprt` VM，跨样本通用**。

字符串池的解密是整个还原的突破口。池里每条字符串都被 XOR 加密，解密就一行：

```javascript
// p 是字符串池字节数组，r 是头部第 [24..32) 段取出的密钥（本样本 = 2）
str = "";
for (P = start; P < end; P++) str += String.fromCharCode(r ^ p[P]);
```

`r ^ byte` 逐字节一异或，682 条字符串全出来了：

```python
byted_acrawler   encryptUint32Array   decryptUint32Array   directSign
getSignature     encryptSecDid        body_hash=           _signature=
&_signature=     ?_signature=         nonce must be an object with a url property!
canvas           getContext           toDataURL            userAgent   ...
```

**函数名和字段名一出来，后面识别算法就有了锚点**—— `encryptUint32Array` 一看就是分组加密， `getSignature` 是主流程， `body_hash=` / `_signature=` 是输出字段名。这一步的意义是把「一坨 hex」变成「一堆有名字的函数」：反汇编时每条 `push_str N` 都能内联出真实字符串，天书立刻有了可读的地标。

### 11.2 最关键的突破：opcode 解码公式

拿到可读字符串只是有了「地标」，还不能反汇编。要把代码区那 21922 字节切成 11262 条指令，必须先回答两个问题： **每个字节对应哪个操作码？每条指令的操作数占几个字节？** 这两个答案都藏在 `G` 函数（解释器主循环）里。

主循环的骨架是这样的：从代码区当前位置取一个字节 `j` ，先把它变换成内部操作码 `op` ，再进一个巨大的分支表按 `op` 分派。变换那一行是整个还原的钥匙：

```javascript
op = 13 * j % 241        // 仿射置换：j ∈ [0,255] → op ∈ [0,240]
```

为什么是 `13` 和 `241` ？这不是随手写的常数，是精心挑的一组 **互质对**：

-   `241` 是质数， `13` 与 `241` 互质 → 映射 `j → 13j mod 241` 在模 241 下是 **双射** （一一对应，无碰撞），所以每个 `op` 都能唯一反解回一个 `j` ，反汇编器可以稳定地正查反查。
-   效果是把字节值 `0,1,2,3,...` 打散成 `0,13,26,39,...` 这种跳跃序列， **彻底抹掉操作码的连续性**。普通字节码里相邻功能的 opcode 往往数值相邻，静态扫描能靠「一段连续递增的字节」猜出指令边界；这里被仿射置换一搅，肉眼和模式匹配全失效。这是一层轻量但有效的抗静态识别。

拿到 `op` 后， `G` 再把它拆成几个子字段来决定语义：

```javascript
A1 = op & 3;          // 低 2 位：常作寄存器/栈操作的子类型
A2 = (op >> 2) & 3;   // 次 2 位
hi = op >> 4;         // 高位：主操作类别
```

**最容易踩的坑在操作数长度上**：一条指令后面跟几个字节的操作数，不是由解码后的 `op` 决定，而是由 **原始字节 `j`** 查表决定的。 `F` 函数（预处理器）里有 6 张长度表，按 `j` 落在哪个区间给出操作数宽度（0/1/2/4 字节等）。我一开始想当然用 `op` 去查长度，结果指令边界整个错位，dump 出来后面全是乱码——回头对着 `F` 的分段才发现长度锚定的是 `j` 不是 `op` 。 **解码用 `op` ，切长度用 `j` ，两者不能混。**

这也解释了 `G` 里为什么有两条 **对称的分发路径**：一条 `I=0` 直接从 hex 流里现读现解码，一条 `I=1` 从 `F` 预处理好的操作数数组 `W[]` 里取。两条路语义完全一致，只是取操作数的来源不同——这本身也是一个交叉验证点：两条路径对同一条指令解出的操作数必须一致，对不上就说明长度表读错了。

摸清「 `op=13j%241` 解码 + `j` 查表定长 + `F` / `W` 双路校验」这套规则后，写个反汇编器 `disasm.js` 把 11262 条指令 dump 出来，再把 §11.1 解出的字符串常量按索引内联进去，字节码就从天书变成可读伪汇编：

```python
@14873 push_str 457  // "getSignature"
1076

...
@14918 push_str 459  // "nonce must be an object with a url property!"
1

@14923 throw
```

最后这三行还顺带印证了字符串锚点的价值：看到 `push_str "nonce must be..."` 紧跟 `new 1` + `throw` ，不用读上下文就知道这里是 `sign` 的入参校验分支——把裸字符串抛成一个 Error 对象。（完整的 241 项 opcode 语义表见内部报告，正文不铺开。）

### 11.3 最难的一坎：作用域链

反汇编出来遇到一个矛盾：局部变量读 `c["$"+z]` （带 `$` 前缀），函数参数又读 `c[z]` （数字键），两套怎么统一？答案在 `K` 函数构造作用域对象的三行：

```javascript
o["$" + l] = o;                               // 自引用
for (t = 0; t < l; t++) o["$" + t] = d["$" + t];   // 链式复制父作用域
for (t = 0; t < a.length; t++) o[t] = a[t];        // 参数绑到数字键
```

拆开就是：作用域对象同时是「自己 + 父作用域链 + 参数表」三样东西。搞清 `$N` 指向谁，反汇编里的 `load_local $2` 才不是天书—— `$2` 就是主模块作用域 = 那张工具函数表。 **不打通这个模型，算法还原无从谈起。**

### 11.4 识别出的算法家族

顺着 `encryptUint32Array` 、 `getSignature` 这些函数名追下去，签名的算法骨架浮出来了（**只讲家族特征，内嵌密钥与可复现常量已脱敏**）：

1.  **XTEA 变种分组加密**：轮数公式 `Math.floor(6 + 52/len)` + `sum` 累加黄金比例常量 + `(sum>>>2)&3` 选密钥 + 元素间 CBC 链式反馈——四个特征对上，确认是 XTEA 家族。
2.  **SDBM 哈希家族**：乘数都是公开的 `65599` ，三种变体——标准 SDBM、异或变体、带 UTF-16 代理对处理的 `sdbm_stable_pony` （处理 emoji 保证哈希稳定）。
3.  **自定义 base64**：字符集非标准，编码粒度是 30 位 → 5 字符（不是标准 base64 的 24 位 → 4 字符）。

还原公式与 VM 实跑 **对拍一致** （如 `sdbm(0,"abc") = 807794786` 、 `b64_30(123456789) = "HW80V"` ），交叉验证通过。

一个 **反面教训**：中间一度把某个哈希误判成 Adler-32——因为 getSignature 里出现了模数 65521，恰好等于 Adler 的 `MOD_ADLER` 。追到函数体才发现累加是 SDBM（乘数 65599），65521 只是取模用。 **看到熟悉的常数别急着下结论，得追到函数体看累加方式。**

* * *

## 12\. 诚实边界（本文没做到 / 做不完全的地方）

1.  **还原到「算法家族级」，不是「可独立复现的纯算法」**：§11 已逆向出签名 = XTEA 变种加密 + SDBM 哈希 + 自定义 base64 的骨架，但 XTEA 的 128 位内嵌密钥字节尚未抠出，所以签名仍依赖本地保存的原始 `acrawler.js` （等于「带 VM 一起跑」），SDK 一升级就得重新抓。要「抛开原脚本手算」，还差最后一块密钥拼图。
2.  **只过了「评论接口」这一环**：整条反爬链里，ttwid（服务端 JWT 注册） **未做**——因为消融测试证明评论接口根本不需要它。
3.  **指纹是软校验，随时可能升级**：当前服务器不校验设备指纹真实性，所以最小补环境即可。字节若升级为硬校验（指纹绑定账号/IP），需补真实 canvas/webgl 指纹。
4.  **签名秒级时效**： `_signature` 内嵌时间戳，必须「取到立刻用」，不可缓存复用。
5.  **脱敏说明**：本文所有真实 `group_id` 、cookie 指纹（ `ttcid` / `tt_scid` / `s_v_web_id` / `__ac_nonce` / `__ac_signature` ）、用户昵称/IP 属地均已打码；原始 71KB SDK 字节码不随文附上。

* * *

## 13\. 复盘：整条路的取舍

把整个过程串起来看，真正的转折点有四个：

1.  **识别出 `_$jsvmprt` 是 VM 字节码，不是混淆**——这是第一个关键认知，它直接排除了手写还原，把方向从"读算法"扭到"跑算法"。
2.  **消融测试证明评论接口零 cookie**——这是第二个、也是最省事的一个认知，它砍掉了 ttwid 那一大块本该啃的硬骨头。
3.  **补环境 + 原脚本重放跑通**——这是第三个、也是最关键的一个认知，它把"逆向算法"降维成"伪造运行环境"。
4.  **回头静态拆 VM，把算法骨架还原出来**——这是第四个认知（§11），它把"跑算法"又补回了"读算法"：签名原来是 XTEA + SDBM + 自定义 base64 的组合，而不是之前以为的某一种标准哈希。

而贯穿全程的一条主线是： **先定位「生成代码」而非「分析值」，再判断「最小依赖」而非「整条反爬链」**。前者告诉你往哪走，后者告诉你不用走多远。很多时候，消融测试省下的工作量，比任何一步逆向都大。

最后留一句给同行：字节系这类 `_$jsvmprt` 保护的 SDK， **别手写还原哈希**——那是拿头撞虚拟机。想「跑通」，补环境跑原脚本 + 消融测试定最小依赖，是性价比最高的路；想「看懂」，就拆 VM——破解字节码格式 → 反推 opcode 解码公式 → 建语义表反汇编 → 打通作用域链 → 识别算法家族，这条静态路也能走到算法骨架。两条路不冲突，一个务实，一个求真。每一层死路都会告诉你下一层该看哪里：手写还原的死路指向字节码，分析值的死路指向生成代码，而"要整套 cookie"的假设，被一次消融测试证伪。
