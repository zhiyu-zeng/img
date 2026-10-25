---
title: 【看雪】瑞幸咖啡附近门店接口逆向实战：从 Chaos VM 字节码到纯 Node.js 零登录复现
source: https://bbs.kanxue.com/thread-293326.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-25T19:54:45+08:00
trace_id: b4ec51bd-d158-4fc8-a215-14f560df40c9
content_hash: 60d9c1e3ea067e85738d80bda1c42f2ddc3694d68f22f18169b4f2a0558c170f
status: synced
tags:
  - 看雪
  - 协议分析
  - 密码学
series: null
feed_source: 看雪·逆向工程
ai_summary: 瑞幸小程序“附近门店”接口可在不启动微信的情况下纯 Node.js 复现：用 AES-128-ECB 加密业务 JSON，再把 MD5 的四个 32 位有符号整数分别取绝对值后拼成十进制串作为签名；签名原文必须包含匿名 `uid` 和内置 key。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40475244-d011-8129-ac25-f8eebeb3b109
ioc:
  cves: []
  cwes: []
  hashes:
    - 9a566746e2a18ea259e0011557ab5a10
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 瑞幸小程序“附近门店”接口可在不启动微信的情况下纯 Node.js 复现：用 AES-128-ECB 加密业务 JSON，再把 MD5 的四个 32 位有符号整数分别取绝对值后拼成十进制串作为签名；签名原文必须包含匿名 `uid` 和内置 key。
> 
> - **签名原文格式：** 格式为 `cid=230101;dk=1;q=<密文>;uid=<UUID+毫秒时间戳><key>`，整体做一次 MD5；其中 `uid` 与 Cookie 中的 `uid` 同值，用于会话绑定和防重放。
> - **自定义哈希：** 标准 MD5 的 4 个大端有符号 int32 各自取绝对值后直接拼接（如 `170561349849272867015078525651470847504`），所以 sign 是约 40 位十进制而非 32 位 hex。
> - **加解密：** `q` 为 AES-128-ECB/PKCS#7 + URL-safe Base64（`+`→`-`、`/`→`_`）；响应用同一 key 反解，且需校验 `code=1` 且 `status="SUCCESS"`，HTTP 200 不等于成功。
> - **调用顺序：** 先 GET `homeshop` 获取 `cityId`/`nearShop`，再 POST `shopList` 分页取 `commonShopList`/`otherShopList`/`joinShopList`，按 `deptId` 去重。
> - **核心教训：** mock 中把 `uid` 设为空串会隐藏该字段，导致误判“签名只有三个字段”；在“AES 25/25 全对”的麻痹下死磕加盐参数，实际错在字段集合而非参数取值。

> 目标：不启动微信、不打开小程序，用一段纯 Node.js 代码直接拉取瑞幸咖啡"附近门店"列表。  
> 手段：xiaojianbang 小程序 trace 抓包 + 反汇编腾讯 Chaos VM 字节码 + 还原 AES 与自定义签名。  
> 结果：算法全还原，25 个历史样本 100% 复现，在线拿到门店数据。  
> 最大的坑：不是 AES，不是 VM，而是一个被漏掉的 `uid` 字段。

* * *

## 0\. 起因：一次"纯协议"目标

事情的起点很明确：瑞幸咖啡小程序有个"附近门店"功能，我想绕过小程序运行时，直接复现它背后的 HTTP 协议。

判断一个接口能不能"纯协议复现"，核心只看三件事：

1.  请求发到哪个 URL；
2.  请求体里的每个字段怎么来的（尤其是 `q` 密文和 `sign` 签名）；
3.  响应怎么解密。

只要这三件事都还原出来，就可以用 `node` 脚本对着服务器裸发请求。瑞幸这个接口恰好满足——它用的是 **匿名会话 + 固定 key 对称加密**，不强制微信登录态（后文会验证这一点）。

手头有的材料是一份 xiaojianbang 工具抓的 trace。这套工具能做两件关键的事：一是 **协议级抓包** （能看到小程序发出的原始 HTTP 字节，包括密文前的明文），二是 **把小程序运行时的 JS 源码全部 dump 下来**。这两样合起来，就是逆向一套签名协议的全部原料。

### 目标黑盒长什么样

先让读者看懂"黑盒"：瑞幸小程序跑在微信的 WMPF（微信小程序框架）里，运行时分成两层——渲染层 `page-frame` 和逻辑层 `AppService` 。门店业务 JS（包括 `utils/api.js` 、 `utils/crypto.js` ）跑在 **AppService** 这一层，trace 工具 dump 出来的就是这一层的源码。

一个关键的前置判断：这次"附近门店"是 **纯小程序链路**——主业务页面是 `page-frame.html` ，target 类型是 `page` ，网络请求直连 `capi.lkcoffee.com` ，没有业务 WebView/H5，也没有 iframe。这意味着算法一定在小程序 JS 里，而不是藏在某个 H5 页面的脚本里。判断时要避开几个坑：

-   `context_role: webview` 是 WMPF 对 page-frame 执行上下文的内部命名， **不代表外部 H5**；
-   `blob:https://servicewechat.com/...` 是小程序 worker/blob 运行时， **不是业务网站**；
-   静态图片、字体、腾讯地图请求是资源依赖，不是业务页面。

trace 原料也分两部分：一是 `normalized/http.jsonl` 里的协议级 HTTP 事件（请求原文、响应密文），二是 `scripts/source/` 下按 SHA-256 命名的 JS sidecar（AppService 源码）。 **前者回答"发了什么"，后者回答"怎么生成的"**——两边的交集，就是签名算法的全部证据。

下面按我实际走过的顺序讲。 **死路和踩坑都写**，尤其是我自己犯的那个低级错误——它才是这篇文章最值钱的部分。

* * *

## 1\. 第一个异常：sign 是一串 40 位十进制数，不是 md5 hex

先扫一遍 trace 里的请求端点。按 host + path 聚合后，和门店业务相关的就两个：

```
GET  https://capi.lkcoffee.com/resource/m/sys/base/homeshop
POST https://capi.lkcoffee.com/resource/m/shop/shopList
```

-   `homeshop` 返回一个 `nearShop` ，同时给出 `cityId` 、 `cityName` ——是"定位到城市"这一步；
-   `shopList` 返回 `commonShopList` 、 `otherShopList` 、 `joinShopList` ——是真正的门店列表。

所以正确调用顺序是： **先 `homeshop` 定位城市，再 `shopList` 拿列表**。

打开 `shopList` 的请求体，看到的不是业务 JSON，而是一段表单：

```
cid=230101&q=-RJEtjvnlPqTd-Fu4l7W-pRpeYKiUvIC62dDPdZ8U08=&dk=1&sign=170561349849272867015078525651470847504
```

响应也是密文：

```
EAT879wHdBcY3c3j161FWaNXWDgyfk3p...
```

在拆样本之前，有一个容易踩的坑要先说：CDP 事件是 **并发交错** 的，响应正文不一定紧跟请求事件。要把"某个请求用了什么密文、签了什么 sign"精确对上，关联键不能靠"日志相邻行"，而要靠：

```
Network.requestWillBeSent.data.requestId
    == response_body.data.request_id
```

用这个键，我从 trace 里把 `homeshop` 和 `shopList` 两个接口的请求逐个提出来，每个请求都能拿到它的 **明文业务对象、密文 `q` 、 `sign` 、 `Cookie` 里的 `uid` 、 `cid` 、 `dk`**，一共凑出 25 个"明文 → 密文 → 签名"的完整样本。这 25 个样本就是后面所有验算和穷举的原料，也是最终能确认"签名算法还原正确"的底气。

到这里，问题被拆成四个：

1.  业务对象怎么序列化；
2.  `q` 用什么加密；
3.  `sign` 怎么算；
4.  响应怎么解密。

其中 `sign` 最扎眼——它不是 32 位 hex 的 md5，而是一串 **40 位十进制数字**。这个"看起来像 md5 又不像 md5"的形状，就是后面所有折腾的根源。

* * *

## 2\. 第一回合：定位统一封装，一头撞上 Chaos VM

抓包只能看到"字段长什么样"，看不到"字段怎么生成"。要找到生成 `q` 和 `sign` 的代码，得顺着 HTTP 事件的 initiator 往源码里追。

`shopList` 请求的 initiator 指向一个 `scriptId` ，对应到 trace 里 dump 出的 JS sidecar，再往调用栈里看，最终定位到业务 bundle 里的统一封装 **`utils/api.js`**。

到这里本该是柳暗花明，结果打开一看—— `api.js` 的核心被包在这样一层里：

```javascript
__TENCENT_CHAOS_VM(function(...) { ... }, "base64编码的字节码", ...)
```

这是 **腾讯的 Chaos VM** （ `__TENCENT_CHAOS_VM` ），一种把真实逻辑编译成自研字节码、再由解释器执行的混淆方案。原本应该明晃晃写在那里的签名拼接逻辑，现在变成了一坨 base64 编码的字节码。

### 2.1 Chaos VM 字节码长什么样

字节码的还原链是：

```
base64 字符串
  -> LEB128 varint 解码（变长整数）
  -> zigzag 反解（恢复有符号数）
  -> 逐条 opcode + 操作数
```

解释器的 `switch` 覆盖 `case 0` 到 `case 69` 左右，是一个典型的 **栈机 + 寄存器混合** 的字节码虚拟机——既有一个操作数栈做临时计算，又有一个局部数组 `l[]` 当"寄存器"存变量。字符串拼接、数组操作、对象赋值、函数调用，全是靠这些 opcode 组合出来的，单看字节码几乎看不出业务语义。

这两层编码各有各的用途：

-   **LEB128 varint**：变长整数，每字节低 7 位是数据、最高位是"后面还有字节"的继续标志，小端序。它让操作数不占固定宽度——小整数 1 字节，大整数多字节。
-   **zigzag**：varint 天然只适合无符号数，但字节码里到处是有符号整数（负常量、负跳转偏移）。zigzag 把有符号数映射成无符号： `0→0` 、 `-1→1` 、 `1→2` 、 `-2→3` ……负数变奇数、正数变偶数，解码时反解。

这一步不是玄学，但很吃耐心：要把每一条 opcode 的语义对上，再手工"翻译"回等价的 JS 逻辑。我当时的做法是 **不逐条静态翻译**，而是写一个 mock 环境，让这段字节码在真实 JS 引擎里跑起来，同时 hook 住 `md5` 、 `aes` 这些函数，把它们被调用时的 **入参** 全部打印出来。

> 这里有个关键思路： **与其逐条反汇编字节码，不如让字节码"自己跑"，然后在关键函数入口挂 hook 看入参。** 混淆再强，它最终还是要调 `md5` 、调 `aes` ，这些调用点的入参就是算法的真身。

> 但这条路有个代价，也是我后面栽跟头的地方： **"跑起来"依赖 mock 环境对真实运行态的还原程度。** mock 里少一个字段、多一个空值，字节码就会走进一条和真实运行不同的分支——你拿到的那条分支看起来照样自洽，却可能是错的。

* * *

## 3\. 第二回合：意外收获——crypto.js 是明文

trace 里 dump 出来的源码不是全部被混淆。 **`utils/crypto.js` 就是明文**，里面躺着两样关键东西：

### 3.1 一个"不正经"的 md5

```javascript
function md5(t) {
  const w = MD5(t).words;            // crypto-js 的 MD5，words 是 4 个 signed 32-bit int
  return Math.abs(w[0]).toString()
       + Math.abs(w[1]).toString()
       + Math.abs(w[2]).toString()
       + Math.abs(w[3]).toString();  // 四个绝对值直接拼，不是 hex！
}
```

源码里还留着一句中文报错 `MD5加密结果字节数组错误` ——这就是业务自己封装的 md5。

这里要补一个 crypto-js 的坑： `CryptoJS.MD5(t).words` 返回的不是 16 个字节，而是 **4 个 32 位 word**，而且默认是 **有符号** 的（ `signed int32` ）。当某个 word 的最高位是 1 时，它会被当成负数。所以如果直接 `w[0].toString()` ，有概率得到一串带负号的数字——业务代码里的 `Math.abs(...)` 正是为了消掉这个负号。这个细节也直接解释了后面 `sign` 为什么是"取绝对值拼接"。

它和标准 md5 的区别在于： **标准 md5 输出 32 位 hex；这个输出的是"四个大端 signed int32 各自取绝对值后拼起来的十进制串"**。所以 `sign` 才会是 40 位左右的数字，而不是 32 位 hex。

### 3.2 AES 的 key 来源

`crypto.js` 的 AES 封装很朴素：AES-ECB + PKCS#7，key 从配置里取。配置模块（ `store/system/index.js` ）暴露了 `appId` 、 `code` 、 `version` 、 `prod key` 、 `akv` 这些字段，其中 `prod key` 就是加密用的 key。

到这里，四件事已经解决了一件半：

-   `q` 的加密 = **AES-128-ECB / PKCS#7**，结果做 URL-safe base64（ `+` → `-` ， `/` → `_` ）；
-   `sign` 的哈希函数 = **取绝对值的十进制拼接 md5**。

* * *

## 4\. 第三回合：AES 全对，sign 却一个都对不上

先把 AES 坐实。用真实样本做"明文 → 密文"的往返验证：

```css
明文: {"miniversion":"5603"}
密文 q: -RJEtjvnlPqTd-Fu4l7W-pRpeYKiUvIC62dDPdZ8U08=
解密还原: {"miniversion":"5603"}
```

在写解密代码之前，其实先有一个"旁证"可以瞄一眼：把 `q` 做 URL-safe 还原、Base64 解码后，得到 **192 字节**，正好是 16 字节（AES 块大小）的整数倍（192 = 16 × 12）。长度能被 16 整除不直接等于"这就是 AES-ECB"，但配合源码里的 `aes.en` 调用，两者互相印证，方向就锁死了。

这里顺带解释"URL-safe"的来由： `q` 最后要放进 GET 的 query string（ `homeshop` 是 GET）或表单体（ `shopList` 是 POST）。标准 Base64 里有 `+` 和 `/` 两个字符，它们在 URL 里都有特殊含义—— `+` 在 query string 里会被解析成空格， `/` 是路径分隔符。所以业务在 Base64 之后又做了一次 `+` → `-` 、 `/` → `_` 的替换，让 `q` 能安全塞进 URL 而不被转义破坏；解密前再反向换回来。trace 里 `q` 出现的 `-` 、 `_` 就是这次替换留下的痕迹。

25 个历史样本，明文加密后和 trace 里的 `q` **逐字一致，25/25 全对**。AES 这块已经铁板钉钉。

但 `sign` 就邪门了。md5 的"取绝对值拼接"算法我明明拿到了，key 也拿到了，可就是算不出 trace 里的 `sign` 。

当时的思路是：sign 原文大概是某种 `cid` 、 `dk` 、 `q` 的拼接，再加一个盐。于是我写了个穷举脚本，把可能的结构全试一遍：

```
字段顺序：cid/dk/q 的全排列
分隔符：; & | , 空格 空串
盐：key、空串、cid、版本号、appId、akv ...
md5 输出解释：hex、大写 hex、absConcat、unsignedConcat、signedConcat ...
```

结果： **0 命中**。

这里我犯了一个方向性错误——后面会专门讲。先看这个穷举为什么注定失败。

* * *

## 5\. 第四回合：陷入"猜盐"死循环

穷举失败后，我陷入了一个很典型的死循环： **认定"结构没问题，只是盐不对"，于是不断加大盐的候选空间**。

-   是不是盐不是 `key` 本身，而是 `key` 的某种变形？
-   是不是先对 key 做一次 md5 再拼？
-   是不是 cid 的 code/version 拆开各自当盐？

每猜一次都是 0 命中。当时的心理是"就差一个盐了"，实际上—— **结构本身错了，盐再怎么加都对不上**。

这是一个非常典型的逆向陷阱：

> **当你确认了"部分环节是对的"（比如 AES 25/25），就会默认"整体也快对了"，于是把剩下的所有误差都归因到"还差一个值"。但真正的问题可能是"结构里少了一个字段"，而不是"某个值猜错了"。**

用一张对照表说清楚我当时卡在哪：

| 变量  | 我穷举了什么 | 实际真相 |
| --- | --- | --- |
| 哈希函数 | md5 的 hex / absConcat / unsigned / signed | absConcat ✓（这一步对了） |
| 参与签名的字段 | `cid` 、 `dk` 、 `q` 三个 | **还有第四个 `uid` （漏了）** |
| 分隔符 | `;` `&` `\|` 等 | `;` ✓ |
| 盐   | key、空串、各种变形 | key ✓（拼接在末尾） |

可以看到，五个变量里我对了四个，唯独"字段集合"这一项是错的——而它恰恰是 **最高优先级** 的变量。我却在最低优先级的"盐"上死磕。

* * *

## 6\. 中途一次自证：uid 设空的坑（我自己犯的错）

> 教训先抛出来： **做 mock / 动态执行的时候，永远用"真实样本里的非空值"去喂，不要用空串、0、null 这类"干净但失真"的默认值。空值会让代码走进一条和真实运行完全不同的分支，而你拿到的那条分支看起来照样"自洽"。**

这个坑具体是怎么发生的：

我用 mock 环境跑 `api.js` 那段被混淆的字节码，想在 `md5` 入口把签名原文打印出来。结果打印出来的是：

```
cid=230101;dk=1;q=-RJEtjvnlPqTd-Fu4l7W-pRpeYKiUvIC62dDPdZ8U08=  <-- 后面直接接 key，没有 uid
```

于是我就认定签名原文只有 `cid` 、 `dk` 、 `q` 三个元素，拿着这个"3 元素"结构去做穷举——当然全错。

**问题出在哪？** 我的 mock 环境里把 `uid` 设成了空字符串 `''` 。而真实代码的逻辑是： `uid` 这个字段是 **动态拼进签名原文的**。当 `uid` 为空时，拼出来的字符串里就看不到它；当 `uid` 有值时（真实请求里它是个 `UUID+毫秒时间戳` ），签名原文才会多出 `;uid=xxx` 这一段。

换句话说： **我拿一个 `uid=''` 的空转环境，去跑真实代码，得到了一条"uid 为空"的运行路径，然后把这条特殊路径当成了通用算法。**

这就引出了第二个教训：

> **"部分正确"是逆向里最危险的状态。** AES 25/25 对、md5 函数对、 `cid/dk/q` 的拼接也对，这些"对"让我坚信自己只差一个盐，从而完全没想过回头质疑"参与签名的字段到底是不是三个"。

如果当时我做任何一件事——用真实 trace 里那个非空的 `uid` 去喂 mock，或者反汇编时回头数一下"这个数组到底是 3 个还是 4 个元素"——这个坑当场就暴露了。

### 6.1 另一个 mock 坑：Proxy 的 Symbol.toPrimitive 自证循环

除了 `uid` 设空，我在 mock 阶段还踩过第二个坑，性质更隐蔽。

为了跑那段字节码，我用 JS 的 `Proxy` 模拟 `config.api` 这类配置对象。 `config.api.key` 下面才是 `prod` / `pre` / `test03` / `test04` 四个环境的 key。问题在于：我的 `apiTable` 代理对 **未知属性** 一律返回一个"接口配置对象"，于是 `config.api.key.prod` 这条访问路径里， `key` 没被正确解析，一路塌缩成了假对象。

更糟的是，我的 stub 让 `Symbol.toPrimitive` 返回 `0` 。当这个假对象被拼进签名原文的字符串时，被强制转成了 `"0"` ——于是"盐"变成了 `"0"` ，算出来的 `sign` 自然全错。

后来又走了另一个极端：把 key `"CJQjAc1hYieC4QYb"` 直接硬编码进 mock 的 `aes.en` 。结果代码"揭示"出来的 key，其实是我自己喂进去的—— **一个自证循环**：用已知答案的 mock，去"发现"了这个答案，还以为是靠逆向还原出来的。

这两个坑合起来是一条更通用的教训：

> **mock / 动态执行时，你的 Proxy 拦截和默认值就是代码运行环境的一部分。** 拦截到不该拦截的路径、返回一个会被 `Symbol.toPrimitive` 污染成 `0` / `""` 的假对象、或干脆把正确答案硬编码进去，都会让你得到一条"看起来对、其实自欺"的运行路径。mock 要尽量还原真实运行态，而不是图省事。

* * *

## 7\. 换一条思路：签名原文里的第四个元素 uid

卡住之后，我把目光转向了 **版本差异**。

我逆向的这份 trace 是小程序 `miniversion=5603` 的版本， `api.js` 被 Chaos VM 混淆了。而更早的 `5593` 版本， `api.js` 是 **明文可读** 的（瑞幸是在这两个版本之间给签名封装加的 VM 混淆）。两个版本的对比：

| 维度  | 5593（更早） | 5603（本次） |
| --- | --- | --- |
| 采集时间 | 2026-09-07 | 2026-10-21 |
| `api.js` 形态 | 明文可读 | Chaos VM 字节码 |
| `;uid=` 在源码里的明文出现次数 | 有（直接可读） | 0（在字节码里） |
| `crypto.js` | 明文  | 明文  |
| AES key / 签名算法 | 相同  | 相同  |

这张表本身就说清了两件事：

1.  **算法是跨版本稳定的**——两个版本的 key、AES、签名拼接规则完全一致，变的只是混淆强度；
2.  **混淆是"选择性"的**——瑞幸只把 `api.js` （签名封装）包进了 VM， `crypto.js` （纯算法）两个版本都是明文。

在 `5593` 的明文版本里，签名原文的构造一眼就能看到：

```rust
业务对象
  -> JSON.stringify
  -> aes.en
  -> q
  -> 生成 cid、dk、uid
  -> md5(sign_preimage)
  -> sign
  -> HTTP 请求
```

签名原文的完整格式是：

```
cid=230101;dk=1;q=<本次 q>;uid=<本次匿名 uid><协议 key>
```

**原来签名原文有四个元素，第四个是 `uid` ——而且它的值和请求 `Cookie: uid=...` 里的值是同一个。**

这是一个非常典型的\*\*"会话态进签名"\*\*设计：把匿名会话的 `uid` 同时放进 Cookie 和签名，既做会话绑定，又防重放。而 `uid` 恰恰是我在 mock 里设成空串、导致被隐藏掉的那个字段。

### 7.1 为什么"混淆分布"本身就是情报

回头看，其实有个信号早该抓住：

-   `crypto.js` （AES/md5 纯算法）→ **明文**；
-   `api.js` （AES 加密 + 签名拼接的统一封装）→ **Chaos VM 混淆**。

开发者把混淆火力集中砸在 `api.js` 上，而不是 `crypto.js` 上，说明 **他们最想保护的不是 AES/md5 算法本身，而是"签名原文怎么拼"这条规则**。因为算法是标准库、key 在配置里，抄走了影响有限；但签名原文的字段拼接规则是自研的、非标准的，一旦被人看到就能直接复现签名。

> 逆向时先扫一遍混淆标志（ `__TENCENT_CHAOS_VM` 、 `eval` 、 `Function` 构造等）的分布， **哪些模块被混淆、哪些是明文，这个分布本身就告诉你"开发者最在意、最值得逆向的是哪一块"。** 这次被混淆的 `api.js` ，恰好就是答案所在。

* * *

## 8\. 最后一步：验算 25/25 + 端到端跑通

拿到完整格式后，立刻用真实样本验算。取一个最简单的样本（ `q` 对应明文是 `{"miniversion":"5603"}` ），完整走一遍：

```
preimage = cid=230101;dk=1;q=-RJEtjvnlPqTd-Fu4l7W-pRpeYKiUvIC62dDPdZ8U08=;uid=8ee27e09-8ff5-4a8c-aa81-5e3c21a9ded31792588240282CJQjAc1hYieC4QYb
```

对这个 preimage 做 md5，看四个 word：

```
md5 hex = 9a566746e2a18ea259e0011557ab5a10

word[0] = 0x9a566746 = -1705613498 (signed)  -> abs = 1705613498
word[1] = 0xe2a18ea2 = -492728670  (signed)  -> abs = 492728670
word[2] = 0x59e00115 = 1507852565           -> abs = 1507852565
word[3] = 0x57ab5a10 = 1470847504           -> abs = 1470847504
```

拼接四个绝对值：

```
sign = 1705613498 492728670 1507852565 1470847504
     = 170561349849272867015078525651470847504
```

和 trace 里的真实 `sign` **完全一致**。

注意一个细节：md5 结果的前两个 word 最高位是 `1` ，按 signed int32 解析是 **负数** （ `0x9a566746` 、 `0xe2a18ea2` ）。如果直接 `toString()` 会得到带负号的结果，所以业务代码才要 `Math.abs()` ——这就是"取绝对值拼接"存在的真正原因。

再用全部 25 个历史样本做交叉验证：

```
命中 25/25
```

签名算法彻底闭环。

### 8.1 端到端：真实拿到门店

最后跑完整的纯协议客户端，对四川阿坝的坐标（GCJ-02）发起查询：

```powershell
node luckin_nearby_stores.js --longitude 102.224504 --latitude 31.899427 --user-longitude 0 --user-latitude 0 --output .\output\nearby-stores-zero-user-location.json
```

输出：

```json
{"output":"...\\nearby-stores-zero-user-location.json","stores":8,"city":"阿坝藏族羌族自治州"}
```

拿到了 8 家门店，前几家：

```
- 马尔康民族团结广场店 | deptId 612495 | 四川省阿坝藏族羌族自治州马尔康市...
- 马尔康滨江路店       | deptId 621479 | 四川省阿坝藏族羌族自治州马尔康市...
- 金川新街店           | deptId 603111 | 四川省阿坝藏族羌族自治州金川县...
```

这里顺带验证了一个边界：把 `userLongitude/userLatitude` 设成 `0` ，服务端就不再按有效用户点做"附近"筛选，而是返回 **城市列表页** （本次 8 家）。这印证了 `longitude/latitude` （查询点）和 `userLongitude/userLatitude` （用户定位点）是两个不同语义，不能只看前者就断言接口一定做了距离筛选。

* * *

## 9\. 结果：完整算法与可复现脚本

### 9.1 协议参数表

| 参数  | 值   | 说明  |
| --- | --- | --- |
| origin | `https://capi.lkcoffee.com` | 接口域名 |
| appId | `wx21c7506e98a2fe75` | 小程序 AppID |
| cid | `230101` | `code(230) + version(101)` |
| dk  | `1` | 固定  |
| key | `CJQjAc1hYieC4QYb` | AES-128 密钥（客户端内置，随版本变化） |
| akv | `lk-wxmp-v5.3.22` | 请求头 `X-LK-AKV` |
| sdkVersion | `3.17.2` | 请求头 `x-lkwx-sdkversion` |
| miniVersion | `5593` / `5603` | 小程序版本，随版本变化 |

### 9.2 加密与签名

```javascript
const crypto = require("node:crypto");

const PROTOCOL = Object.freeze({
  origin: "https://capi.lkcoffee.com",
  appId: "wx21c7506e98a2fe75",
  cid: "230101",
  dk: "1",
  key: "CJQjAc1hYieC4QYb",
  akv: "lk-wxmp-v5.3.22",
  sdkVersion: "3.17.2",
  miniVersion: "5593",
});

// AES-128-ECB + PKCS#7，结果做 URL-safe base64
function encryptPayload(plaintext) {
  const cipher = crypto.createCipheriv("aes-128-ecb", Buffer.from(PROTOCOL.key, "utf8"), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_");
}

// 自定义 md5：四个大端 signed int32 取绝对值后拼接
function luckinMd5(input) {
  const digest = crypto.createHash("md5").update(input, "utf8").digest();
  return [0, 4, 8, 12]
    .map(offset => Math.abs(digest.readInt32BE(offset)).toString())
    .join("");
}

// 签名原文：cid=...;dk=...;q=...;uid=... + key
function signEnvelope(q, uid) {
  return luckinMd5(`cid=${PROTOCOL.cid};dk=${PROTOCOL.dk};q=${q};uid=${uid}${PROTOCOL.key}`);
}

// 匿名会话：uid = UUID + 毫秒时间戳（同时进 Cookie 和签名）
function createAnonymousSession() {
  return {
    uid: crypto.randomUUID() + Date.now(),
    csid: crypto.randomUUID(),
  };
}

// 构造请求信封
function buildEnvelope(payload, uid) {
  const q = encryptPayload(JSON.stringify(payload));
  return { cid: PROTOCOL.cid, q, dk: PROTOCOL.dk, sign: signEnvelope(q, uid) };
}
```

响应也是对称处理：响应体是 URL-safe 密文，先 `-` → `+` 、 `_` → `/` 还原成标准 Base64，再用同一个 key 做 AES-128-ECB 解密，得到业务 JSON。但"解出来"不等于"成功"，还要过一层业务状态校验：

```javascript
if (result.code !== 1 || result.status !== "SUCCESS") {
  throw new Error(`business failure: code=${result.code} msg=${result.msg ?? ""}`);
}
```

`HTTP 200` 只代表传输层成功， `code=1` 且 `status="SUCCESS"` 才代表业务层成功。这两层要分开判断，不能看到 200 就以为拿到了数据。

### 9.3 两个接口的字段

`homeshop` （GET，定位城市）：

```json
{
  "longitude": 102.224504,
  "latitude": 31.899427,
  "lonHere": 102.224504,
  "latHere": 31.899427,
  "channel": "GCJ-02",
  "isExpress": 0,
  "deptId": "",
  "isSelfShop": 0,
  "shopMainNo": "",
  "pageFlag": 0,
  "groupOrderType": 0,
  "productIdSaleCheck": "",
  "shopModel": 2,
  "miniversion": "5593"
}
```

`shopList` （POST，取列表）：

```json
{
  "channel": "GCJ-02",
  "longitude": "102.224504",
  "latitude": "31.899427",
  "cityId": 166,
  "offSet": 0,
  "pageSize": 8,
  "searchValue": "",
  "scene": null,
  "userLongitude": 0,
  "userLatitude": 0,
  "miniversion": "5593"
}
```

请求头：

```yaml
Cookie: uid=<匿名 uid>
X-LK-AKV: lk-wxmp-v5.3.22
X-LK-CSID: <csid UUID>
x-lkwx-ostype: windows
x-lkwx-sdkversion: 3.17.2
User-Agent: Mozilla/5.0 MiniProgramEnv/Windows
Content-Type: application/x-www-form-urlencoded   (POST 时)
```

`shopList` 返回的门店对象，主要字段语义如下（客户端 `normalizeShop` 保留的部分）：

| 响应字段 | 含义  | 说明  |
| --- | --- | --- |
| `deptId` | 门店内部 ID | 分页去重的主键 |
| `name` | 门店名称 |     |
| `number` | 门店编号 |     |
| `address` | 门店地址 |     |
| `cityId` / `cityName` | 所属城市 ID / 名称 |     |
| `longitude` / `latitude` | 门店坐标 | GCJ-02 |
| `distance` | 服务端返回的距离 | 与本地算出的距离分开存 |
| `workTime` / `workTimeStart` / `workTimeEnd` | 营业时间 | 文本 + 起止 |
| `status` | 服务端状态 | `1` 不单独等于"当前营业" |
| `isShopClosed` / `isShopShutUp` / `forceClosed` | 闭店 / 停业 / 强制关闭标记 |     |
| `supportSend` | 是否支持配送 |     |
| `shopModel` | 门店模型 |     |
| `brandName` / `cooperationName` | 品牌名 / 合作名 |     |
| `shopPhoneNumber` | 门店电话 |     |
| `labelNames` | 门店标签数组 |     |

这里有个容易被忽略的点： `status=1` 不能单独当作"当前营业"来解读。客户端是 **原样保存多个状态字段** （闭店、停业、强制关闭），由业务层根据实际页面语义综合判断，而不是只看一个 `status` 。

### 9.4 完整流程

```bash
读取经纬度
  -> 生成内存匿名 uid/csid
  -> 构造 homeshop 明文对象
  -> AES-ECB 加密得到 q，再算 sign
  -> 请求 homeshop，拿到 cityId/cityName/nearShop
  -> 构造 shopList 明文对象
  -> AES-ECB 加密得到 q，再算 sign
  -> 分页请求 shopList
  -> 合并 commonShopList / otherShopList / joinShopList
  -> 按 deptId 去重
  -> 计算本地距离并输出 JSON
```

整个流程不读取历史 Cookie、微信 code、手机号或业务 session——这就是它能"零登录"跑通的原因。

### 9.5 分页、去重与距离

`shopList` 是分页的， `offSet = (pageNo - 1) * pageSize` ，默认 `pageSize=8` 。每页返回三组列表： `commonShopList` 、 `otherShopList` 、 `joinShopList` ，合并时按 `deptId` 去重，没有 `deptId` 才退回"名称 + 经纬度"组合。停止条件是：当前页为空、整页无新增、页数小于 `pageSize` 、或达到 `maxPages` 。因为接口不返回门店总数，只能证明"当前查询条件下抓完整"，不能声明"全国全量"。

距离有两个口径：服务端返回的 `distance` （ `distance_km_server` ），和客户端按坐标现算的 haversine 距离（ `distance_km_calculated` ）。两者分开存，排序用本地算的距离：

```javascript
// haversine：6371.0088 是地球平均半径（km）
function haversineKm(lon1, lat1, lon2, lat2) {
  const toRad = v => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### 9.6 字段数据流：cityId 从 homeshop 流进 shopList

`shopList` 请求里的 `cityId` 不是凭空来的，而是第一步 `homeshop` 响应里返回的（ `content.cityIdHere` 或 `content.cityId` ）。这条"响应字段 → 下游请求字段"的传递链，是这类两步接口的标准结构：

```
homeshop(经纬度)
  -> content.cityId / cityName / nearShop
       -> shopList(cityId, offSet, pageSize, ...)
             -> commonShopList / otherShopList / joinShopList
```

验证它的方法不是看字符串像不像，而是证明"上游响应 JSON 里的值 == 下游请求体里的值"。这个字段流一旦断了（比如 `cityId` 传错），后面的列表就拿不到。

* * *

## 10\. 复盘：真正的转折点

这次逆向真正的转折点有四个：

1.  **从"逐条反汇编 VM"转向"让字节码自己跑 + hook 关键函数入参"**——混淆再强也要调 `md5` / `aes` ，调用点就是算法真身；
2.  **发现 `crypto.js` 明文里的"取绝对值 md5"**—— `sign` 是 40 位十进制数的谜底；
3.  **揪出"部分正确"的陷阱**——AES 25/25 对，让我误以为只差一个盐，其实差一个字段；
4.  **把 mock 里的 `uid` 从空串换成真实值**——签名原文的第四个元素浮出水面。

其中第 3、4 条是同一件事的两面： **我用一个 `uid=''` 的空转环境跑真实代码，得到了一条"看起来自洽"的错误路径，然后被"部分正确"麻痹，没有回头质疑字段个数。**

**留一句给同行：**

> 逆向卡住的时候，最该做的往往不是"继续猜那个还不知道的值"，而是回头质疑"我已经认定对的那个前提"。这次的前提是"签名只有三个字段"，它是错的。AES 对了、md5 对了、拼接顺序对了，恰恰是这些"对"一起把我钉死在了错误的前提上。

* * *
