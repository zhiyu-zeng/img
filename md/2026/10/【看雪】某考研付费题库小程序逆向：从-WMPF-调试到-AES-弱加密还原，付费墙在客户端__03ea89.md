---
title: 【看雪】某考研付费题库小程序逆向：从 WMPF 调试到 AES 弱加密还原，付费墙在客户端
source: https://bbs.kanxue.com/thread-293282.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-20T22:07:44+08:00
trace_id: 124d7cda-a3c1-4c22-878c-03effae3049c
content_hash: 1cd76ea878c9fd29c27b039921edbf5b38314542f3a58a3604ccb6b45601d1c7
status: synced
tags:
  - 看雪
  - 协议分析
  - Frida
series: null
feed_source: 看雪·逆向工程
ai_summary: TL;DR：某考研题库小程序的付费墙其实只在客户端 UI 层；服务端把 2328 道题连同答案明文无条件下发，传输层仅套了固定密钥的 AES-256-CBC。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-8158-bd89-ea7fe8b508b4
ioc:
  cves: []
  cwes: []
  hashes:
    - 59b87344b54f31977f7c3dd445ab13e1
    - f623e75af30e62bbd73d6df5b50bb7b5
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：某考研题库小程序的付费墙其实只在客户端 UI 层；服务端把 2328 道题连同答案明文无条件下发，传输层仅套了固定密钥的 AES-256-CBC。
> 
> - **调试链路顺序：** WMPFDebugger 须先注入 Frida 再开小程序，否则静默 hook 不到；62000 供 DevTools 前端、9421 供运行时；Chrome 需单独 `--user-data-dir` 才让 9222 生效；MCP 的 `--experimentalDevtools` 等开关要写进 `~/.claude.json` 顶层，改 `mcp.json` 无效。
> - **源码采集：** `https://usr/appservice.app.js` 是虚拟 URL，fetch 拿不到，须遍历 `TargetManager` 下全部 `DebuggerModel` 调 `requestContentData()`；共 53 脚本 / 3 target，SHA-256 去重后 23 个，主包约 1.28MB。
> - **算法还原：** AES-256-CBC + PKCS7；IV 固定 `59b87344b54f3197`；请求 key = `UTF8(MD5("D").hex)` = `f623e75af30e62bbd73d6df5b50bb7b5`，响应 key = `MD5(RequestId+"D")`，兜底回 `MD5("D")`；那个 32 字符字面量只是被覆盖的声明初值，非真 key。
> - **样本验证：** 请求侧 16/16 byte 级往返一致，登录后响应 15/15 解密成功；登录前那条 401 无 `data`，不属解密失败，须先按登录态分层。
> - **付费墙定性：** 列表接口无差别返回 2328 个题目 ID，详情接口 11 个字段无 `isPay`/`isLock`，答案图片是 OSS 无签名直链，脱离登录态即可下载；漏洞成立只需一个免费账号。

> **脱敏声明**：以下 AppID、API 域名、接口内部代号后缀（统一以 `_xxx` 一类占位）、会话 RequestId 均已脱敏或打码，接口只保留语义名；保留的是加密算法常量与协议结构，二者不构成可定位身份或可重放凭证。题目正文与答案正文 **只贴字段结构和长度，不贴版权原文**。

## 摘要：一句话链路

`WMPFDebugger 先监听 62000 → 再开小程序 → DevTools MCP 连 9222 → TargetManager 遍历所有 DebuggerModel 读 appservice.app.js 源码（踩了配置改错文件、孤儿进程占端口、MCP 存文件被 JSON 引号包住三个坑）→ NetworkLog 抓 18 条 AutoModel 密文 → 从源码定位 encrypt/decrypt，还原出 AES-256-CBC + key=MD5("D") + 固定 IV → 16/16 往返复算一致 + 15/15 响应解密 → 解出第一道题的题目+答案+解析 → 发现列表接口无差别返回 2328 个题目 ID、详情接口无任何授权字段、答案图片是 OSS 无签名直链 → 结论：付费墙不在服务端，在客户端 UI 层。`

* * *

## 起因

一款考研数学付费题库小程序，用户买会员才能看答案和解析。目标有两个：

1.  它的题目 / 答案内容在网络传输时是怎么保护的——加密算法能不能还原；
2.  它的"付费墙"到底卡在哪一层——是服务端不给你发，还是发给你了只是前端不给你看。

约束：只做 **概念性验证** （还原机制、解一道题证明可行），不做批量下载。这决定了本文所有结论都建立在"单题端到端 + 机制推断"上，而不是"爬了整个题库"。这一点在下文的「诚实边界」里会再次强调。

先交代一下手头的环境与工具，后面每个环节都依赖它：

| 组件  | 作用  |
| --- | --- |
| PC 微信 + 小程序运行时 `WeChatAppEx.exe` | 目标运行载体（WMPF 运行时，版本 25715） |
| WMPFDebugger | 向运行时注入 Frida，暴露 CDP 调试端口 |
| Chrome（ `--remote-debugging-port=9222` ） | 作为 DevTools 前端的宿主 |
| chrome-devtools-mcp | 让脚本化环境能驱动 DevTools 前端 |

一条反常识但贯穿全文的前提：微信小程序跑在 PC 上时，逻辑层（AppService）是一个独立的 JS 引擎，跟网页的浏览器页面不是一回事。想读它的源码、抓它的请求，不能直接 F12，得先把它的调试接口暴露出来——这就是 WMPFDebugger 干的事。

* * *

## 背景补充：小程序运行时长什么样

在动手前，先把"目标"这个黑盒拆开看清楚。微信小程序在 PC 上运行时，不是"一个网页"，而是几个协作的 JS 环境：

| 层   | 角色  | 源码来源 |
| --- | --- | --- |
| page-frame（渲染层） | 负责把 WXML/WXSS 画出来，跑在渲染进程 | 各页面的渲染代码 |
| AppService（逻辑层） | 跑业务 JS，发请求、管状态 | `appservice.app.js` 等 |
| worker | 独立的后台线程，跑耗时任务 | worker 脚本 |

关键认知： **业务逻辑（包括加密、发请求）全在 AppService 层**，它的源码就是那几个 `*.appservice.js` 文件。所以"读源码"的实质，是去读逻辑层的 AppService 脚本；而"还原加密"的实质，是在这些脚本里找到 `encrypt` / `decrypt` 那几行。

这也解释了为什么普通 F12 抓不到：AppService 跑在独立 JS 引擎里，不在浏览器的页面上下文里，必须用 WMPFDebugger 这种专门工具把它的调试通道暴露出来。这也是为什么后面抓包要绕道 DevTools 前端的 NetworkLog，而不是直接开浏览器开发者工具。

* * *

## 第一回合：WMPFDebugger 的启动顺序是反直觉的

第一脚就踢到铁板——不是技术上难，而是 **顺序**。

WMPFDebugger 干的事是：向 `WeChatAppEx.exe` 注入 Frida，hook 住小程序的调试通道，然后在本地开两个 WebSocket 端口，让标准 DevTools 前端能连上来。它的启动日志能精确说明端口职责：

```lua
[server] debug server running on ws://localhost:9421     ← 小程序运行时连这里
[server] debug server waiting for miniapp to connect...
[server] proxy server running on ws://localhost:62000     ← DevTools 前端连这里
[server] link: devtools://devtools/bundled/inspector.html?ws=127.0.0.1:62000
[frida] script loaded, WMPF version: 25715, pid: 24736
[frida] you can now open any miniapps                     ← 这句话出现后才能开小程序
```

注意最后一行 `[frida] you can now open any miniapps` —— **它出现之前，小程序是不能先打开的**。因为注入是"先挂上钩子、再等目标加载"，如果小程序先起来了，注入点就错过了，后面 CDP 上什么都没有。

所以正确的顺序是：

```
1. 启动 WMPFDebugger（frida 注入 + 两个端口就绪）
2. 在微信里打开目标小程序
3. 再打开 inspector（DevTools 前端连 62000）
```

教训一句话：

> **先起调试器，再开目标。** 凡是"先注入后加载"的工具，启动顺序反了等于白跑，而且没有任何报错——就是安静地什么都没 hook 到。

这条没走弯路，是因为一开始就确认了顺序。真正开始踩坑是下一步。

* * *

## 第二回合：接 Chrome DevTools MCP

小程序源码和请求在 DevTools 前端里，但要脚本化地读它、而不是手动点，得用一个能驱动 DevTools 的 MCP。这里用的是 `chrome-devtools-mcp` ，它连的是 Chrome 的调试端口 9222。

### 坑 1：9222 上根本没有 Chrome

第一步就失败： **9222 上连不上**。原因很简单——日常用的 Chrome 没开 `--remote-debugging-port` ，而 PC 微信的 WMPF 运行时是独立进程，跟浏览器没关系。

解决：单独拉一个带调试口的 Chrome：

```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:/Users/<你>/.claude/chrome-debug-profile
```

`--user-data-dir` 必须单独指定，否则会撞上已开着的日常 Chrome 实例， `--remote-debugging-port` 不生效。

### 坑 2（最典型的自摆乌龙）：配置改错了文件

要让 MCP 看到 `devtools://` 这类 **内部页面**，得给 `chrome-devtools-mcp` 加两个开关： `--experimentalDevtools` 和 `--experimentalIncludeAllPages` 。否则 `devtools://` 页面在页面列表里根本不出现，等于拿到了钥匙却找不到门。

我改完配置、重启， **结果没生效**。

排查手段是看 MCP 进程的真实命令行：

```
（重启后 MCP 进程命令行仍是）
npx chrome-devtools-mcp@latest --browser-url=http://localhost:9222
```

两个标志根本没进去。真相是—— **我改错了文件**。Claude Code 2.x 读的是 `~/.claude.json` 顶层的 `mcpServers` ，不是 `~/.claude/mcp.json` 。我改了后者，白改。改对位置、再重启一次，两个标志才进命令行：

```
npx chrome-devtools-mcp@latest --browser-url=http://localhost:9222 --experimentalDevtools --experimentalIncludeAllPages
```

> **教训：改完配置先验证"真的生效了"，别默认"我改了就一定对"。** 最可靠的手段是看目标进程的真实命令行 / 真实日志，而不是"我以为配置文件是对的"。这里前后重启了两次，纯粹是栽在"配置文件有多个候选位置，我凭直觉选错了一个"。

### 补一句：MCP 配置长这样

脱敏后的配置形态，供参考：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest",
               "--browser-url=http://localhost:9222",
               "--experimentalDevtools",
               "--experimentalIncludeAllPages"]
    }
  }
}
```

关键就是 `--experimentalDevtools` （允许访问 devtools:// 内部页面）和 `--experimentalIncludeAllPages` （把内部页面也算进页面列表）。

* * *

## 中途一次自证：这一路还犯过这几个错

按时间线，下面三个坑散落在源码采集阶段，都是自己造成的，单独列出来。读者照着做可以直接避开。

### 错 1：孤儿进程占端口

用 `TaskStop` 杀后台任务时，只杀掉了外层 shell 包装进程，真正干活的 node 进程（PID 10032）成了孤儿，还死死占着 62000 / 9421。新起的 WMPFDebugger 直接报错：

```
Error: listen EADDRINUSE: address already in use 0.0.0.0:62000
```

排查和解决：

```bash
# 查出到底是谁占着端口
netstat -ano | findstr :62000
# 强杀真凶
taskkill //PID 10032 //F
```

> **教训：杀任务要杀到底层的那个进程，杀包装进程不算数。** 端口被占时先用 `netstat -ano` 把 PID 查出来，别想当然地再起一个、再撞一次 EADDRINUSE。

### 错 2：MCP 存源码，存成了.json

用 MCP 的 `filePath` 参数把脚本正文落盘时，纯字符串被套了一层 JSON 引号， `appservice.app.js` 存成了 `appservice.app.json` ——内容变成了一个带转义的字符串字面量，不是真正的 JS：

```
（本该是）    "use strict";var t=require(...)...
（实际存成）  "\"use strict\";var t=require(...)..."   ← 一个 JSON 字符串，不是源码
```

解决：改成传对象 `{ source, ... }` 落盘，再写个解包脚本把正文抽出来重存。落盘后立刻算一次 SHA-256、比对长度，确认文件是"真 JS"而不是"包了一层引号的字符串"。

> **教训：序列化边界要盯死——字符串在 JSON 里会被再包一层。** 落盘后立刻校验，别等分析到一半才发现文件是坏的。

### 错 3：Inspector 里一个脚本都看不到

DevTools 前端加载得太早，小程序还没连上。现象是 Sources 面板一片灰、 `scriptCount = 0` 。解决： **reload 一次 inspector 页面**，标题从空变成 `DevTools - servicewechat.com/...` 后，脚本才出现。

> **教训：小程序调试里，"页面先加载、目标后连接"是常态。** 连上目标后 reload 前端再读，别对着空面板死磕。

* * *

## 第三回合：源码采集

### 3.1 为什么不能直接 fetch 源码

先破一个直觉：小程序源码在 DevTools 里显示的 URL 长这样：

```
https://usr/appservice.app.js
```

这是 **小程序运行时为调试器暴露的虚拟 URL**，不是普通网络服务器上的资源。浏览器 `fetch()` 、PowerShell 下载、常规 HTTP 客户端都拿不到它。正文必须由对应的 Debugger `Script` 内容提供器返回。所以正确姿势不是"下载"，而是"让 DevTools 前端把 Script 的正文吐出来"。

### 3.2 稳定读取链路

走通的链路是：

```
当前 DevTools 前端
  -> SDK.TargetManager
  -> 遍历所有 DebuggerModel（不是只读 models[0]）
  -> 当前会话 Script
  -> requestContentData()
```

入口代码：

```javascript
const SDK = await import('./core/sdk/sdk.js');
const targetManager = SDK.TargetManager.TargetManager.instance();
const models = targetManager.models(SDK.DebuggerModel.DebuggerModel);
```

**为什么必须遍历所有 model**：小程序的渲染层（page-frame）、逻辑层（AppService）、worker 分属不同 target，只读 `models[0]` 会漏文件。这一步实际拿到 **53 个脚本（3 个 target）**。

### 3.3 两阶段导出：先元数据，再正文

不要一上来就无脑读正文，分两步：

**阶段一：枚举元数据**，给每个 script 记下它的 targetId / scriptId / sourceURL / 长度：

```javascript
const out = [];
for (const model of models) {
  const target = model.target();
  for (const script of model.scripts()) {
    out.push({
      targetId: target.id(),
      targetType: target.type(),
      targetUrl: target.url(),
      scriptId: script.scriptId,
      sourceURL: script.sourceURL,
      isWasm: script.isWasm(),
      contentLength: script.contentLength(),   // 运行时观测值
      hasSourceURL: !!script.sourceURL,
    });
  }
}
```

**阶段二：按清单读正文**，用 `targetId + scriptId` 定位：

```javascript
const content = await script.requestContentData();
// content.text 为正文；content.error 记失败
// 只保存 isTextContent 的 JS；Wasm 单独标记
```

两个关键纪律：

1.  找不到 model / script 时 **立即停止用旧 ID**，重新枚举，别拿过期 ID 硬读；
2.  大源码走 MCP `filePath` 直接落盘，不要塞进对话文本（主包 1.28MB，塞进去就是灾难）。

### 3.4 去重与产物

批量导出后做 SHA-256 去重。最终：

```
53 个脚本（3 target）
  -> 其中业务脚本 27 个
  -> SHA-256 去重后 23 个唯一文件
  -> 主包 appservice.app.js 约 1.28MB（业务逻辑 + 加密逻辑都在里面）
```

去重脚本的核心逻辑（真实落盘的那份）：

```javascript
const crypto = require('node:crypto');
function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}
// 相同 hash 只存一份，但在 manifest 的 observations 里保留所有观察记录
// 相同源码出现在多个 worker 里，本身也是有价值的运行时证据
```

关键词命中情况（这是确认"拿到的是业务源码"的判据）：

```yaml
AutoModel                 : 1 个文件命中
api/Master                : 1 个文件命中
GetQuestionDetails_rel_xxx: 1 个文件命中
GetRelQuestionList_rel_xxx: 1 个文件命中
DesEncryptModel           : 1 个文件命中
PKCS7                     : 1 个文件命中
```

`api/Master` + `AutoModel` + `DesEncryptModel` 同时命中，基本锁定了"这是一个统一的加密业务接口"——这直接引出下一回合的抓包。

* * *

## 第四回合：抓包

### 4.1 抓包方式

走 DevTools 前端的 NetworkLog：

```javascript
const reqs = NetworkLog.NetworkLog.instance().requests();
const out = reqs.map(r => ({
  requestId: r.requestId,
  url: r.url(),
  method: r.requestMethod,
  statusCode: r.statusCode,
  mimeType: r.mimeType,
  requestData: r.requestFormData(),      // POST body
  responseData: r.requestContentData(),  // 响应体
}));
```

### 4.2 抓到的形态

所有业务请求都打到同一个接口（域名已脱敏）：

```
POST https://api.某域名.com/api/Master/AutoModel
```

请求体是 URL 编码的 `command + data` 对，一条真实样本：

```
requestData:
command=GetUserQuestionLogTypeList_xxx&data=QmW%2B1PxuRt%2BipYSviOEhCj3f1iyj6lAabrvQosMSV3TCfD4T3HfwA3jUpAF6GgIN%2Bug78YJjDZCMexqfDlaB0g%3D%3D
```

响应体是一条 JSON， `data` 字段是密文：

```json
{
  "code": 0,
  "RequestId": "6ea444f9-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "msg": "",
  "SuccessResponse": true,
  "data": "xi5aCyce2s3sh/Ibjf8+E6d5P+pWj+fC2HHx/9lct6M=",
  "count": 0,
  "DES": true
}
```

### 4.2.1 抓包的技术细节（几个容易踩的点）

抓包本身不难，但有几个细节不提前知道就会在解密时翻车：

1.  **`requestFormData()` vs `requestContentData()`**：前者拿的是 POST body（ `command=...&data=...`），后者拿的是响应体。两者别用反——用 `requestContentData()` 去拿请求体，会拿到空或拿错。
2.  **URL 编码的 Base64**：请求里的 `data` 是 `application/x-www-form-urlencoded` 编码过的，Base64 的 `+` 会被编成 `%2B` 、 `/` 编成 `%2F` 、 `=` 编成 `%3D` 。 **解密前必须先做一次 URL decode**，否则密文就是脏的，AES 必然解不出来。上面那条真实样本里 `QmW%2B1Pxu...` 的 `%2B` 就是 `+` 。
3.  **`requestId` 是带点的**：抓到的 `requestId` 形如 `34220.2018` ，这是 DevTools 网络层自己的编号，跟业务响应里的 `RequestId` （那才是解密 key 的输入）是两码事，别混淆。

### 4.3 一个命名彩蛋：DES: true

响应里那个 `"DES": true` 字段很有意思——它跟源码里的 `DesEncryptModel` 对得上，说明 **这个加密模块在开发者内部被称为 "DES"，但实际上是 AES**。这个命名误导性极强：如果只按名字去找 DES 算法，方向从一开始就错了。它是后面算法还原时的一个重要提示： **别信变量名，信代码**。

### 4.4 命令分布与分层

抓到 **18 条** 请求，命令分布（接口后缀已脱敏）：

```
GetUserPayFirstVipList      x2
checkUserInCourse            x1
GetUserPullNewIsFinish       x1
GetUserBookBy1149            x1
GetLookAnalysis              x1
GetVipFreeList               x1
GetExamFreeList              x1
GetRelQuestionMenu_xxx       x1
GetRelPropertyList_xxx       x1
GetRelQuestionList_xxx       x1   ← 题目列表，一次返回 2328 个题目 ID
GetUserQuestionLogTypeList   x1
GetUserVipInHelpDesk         x1
GetQuestionDetails_xxx       x1   ← 单题详情，含答案
GetUserLogQuestionList_xxx   x1
GetQuestionFilesGiveAuto     x1
```

其中 15 条是登录后的正常响应（ `200` ），前 3 条是登录前发的（ `401` ）。

这里埋了个 **几乎让我误判的点**：有一条 401 的 `GetUserPayFirstVipList` ，响应里没有 `data` 字段，一开始被当成"解密失败"记了一笔（ `responseDecryptFailure: 1` ）。 **其实它根本不是解密失败，是登录前请求、服务端压根没返回 data。** 把这个 401 从"算法问题"里剔掉之后，登录后的 15 条响应是 **15/15 全部解密成功**。

> **教训：抓包时先按登录态 / 状态码分层，别把"没数据"和"解不开"混为一谈。** 一个 401 混进样本里，差点污染了"算法对不对"的判断。样本分层（登录前 / 登录后）是做算法验证的第一步，不是最后一步。

* * *

## 第五回合：还原加密算法（核心）

这是全文的重头。还原分四步： **反推形态 → 定位函数 → 读完整赋值链 → 交叉验证**。

### 5.1 从密文反推形态

先看请求密文的长度。一条真实样本：

```
requestText:   {"ID":6075}                  ← 明文 11 字节
requestCipher: l8OyMWP0H7raI3utDY2Fww==       ← 密文 Base64，解码后 16 字节
```

`{"ID":6075}` 是 11 字节，PKCS7 填充到 16 字节，正好是 **1 个 AES 块**；Base64 编码 16 字节 = 24 字符（末尾 `==` ）。这基本锁定： **AES 块加密 + PKCS7 填充**。

再结合源码里搜到的 `PKCS7` 、 `crypto-js` 引用，方向收敛到 AES-CBC + PKCS7。

### 5.2 定位加密函数

在 1.28MB 的主包里定位，靠的是关键词收敛： `DesEncryptModel` 、 `PKCS7` 、 `MD5` 、 `AES` 。最终锁到业务加密函数（源码已做最小脱敏，保留算法本体）：

```javascript
var o, u, d, f = {};
o = f,
u = e.default.enc.Utf8.parse("59b87344b54f31977f7c3dd445ab13e1"),  // 声明初始值，运行时被覆盖
d = e.default.enc.Utf8.parse("59b87344b54f3197"),                  // IV：固定

o.encrypt = function(t) {
  var a = t;
  return u = e.default.enc.Utf8.parse(e.default.MD5("D").toString()),   // 请求 key = MD5("D")
    e.default.AES.encrypt(a, u, { iv: d, mode: e.default.mode.CBC, padding: n() }).toString()
}

o.decrypt = function(t) {
  var r = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],  // 兜底开关
    o = t.data;
  u = e.default.enc.Utf8.parse(e.default.MD5(t.RequestId + "D").toString()), // 响应 key = MD5(RequestId+"D")
  r && (u = e.default.enc.Utf8.parse(e.default.MD5("D").toString()));        // 兜底 key = MD5("D")
  var f = e.default.AES.decrypt(o, u, { iv: d, mode: e.default.mode.CBC, padding: n() });
  try { return e.default.enc.Utf8 ? f.toString(e.default.enc.Utf8) : "" }
  catch (t) { /* ... 上报异常，不影响主流程 ... */ }
}

function n() {  // padding 选择
  try {
    var t = getApp();
    if (t && t.globalData && "ZEROS" === t.globalData.DesEncryptModel) return e.default.pad.ZeroPadding;
  } catch (t) {}
  return e.default.pad.Pkcs7;
}
```

### 5.3 逐行拆解

**变量语义表**：

| 符号  | 含义  |
| --- | --- |
| `u` | 密钥变量。声明时给了个 32 字符初始值，但 **运行时在函数体内被重新赋值** |
| `d` | 固定 IV = `59b87344b54f3197` （UTF-8 编码），全程不被改 |
| `n()` | 填充选择器：默认 PKCS7，特殊模式（ `DesEncryptModel === "ZEROS"` ）用 ZeroPadding |
| `MD5("D")` | 请求侧密钥派生： `MD5("D").toString()` 得到 32 字符 hex，再 UTF-8 编码成 32 字节密钥 |

**请求侧**：

```haskell
业务对象 {ID:6075}
  -> JSON.stringify -> {"ID":6075}
  -> AES-256-CBC( key = UTF8(MD5("D").hex), iv = d, PKCS7 )
  -> Base64
  -> command=GetQuestionDetails_xxx&data=<Base64>  POST /api/Master/AutoModel
```

其中请求侧密钥是固定的： `MD5("D") = f623e75af30e62bbd73d6df5b50bb7b5` 。

**响应侧**：

```rust
响应 {code, RequestId, data:<Base64>, ...}
  -> data 用 key = UTF8(MD5(RequestId + "D").hex) 解密
  -> UTF-8 字符串
  -> JSON.parse 出业务对象
  -> 兜底 key = MD5("D")（当 decrypt 的第二个参数为 true 时）
```

### 5.4 一次误判自证：那个 32 字符字面量根本不是 key

还原到一半时，我盯上了源码里这行：

```javascript
u = e.default.enc.Utf8.parse("59b87344b54f31977f7c3dd445ab13e1")
```

这是一个 32 字符的 hex 串，长得特别像"预计算好的 AES-256 密钥"。我当时 **差点把它当成真正的 key**。但一算， `MD5("D") = f623e75af30e62bbd73d6df5b50bb7b5` ，两个值对不上，卡住了。

直到把 `encrypt` / `decrypt` **完整函数体** （而不是孤立的常量）抽出来，才发现真相：

-   `u = ...("59b87344b54f31977f7c3dd445ab13e1")` 是 `var u` **声明时的初始值**；
-   在 `encrypt` / `decrypt` 函数体里， `u` 会被 **重新赋值** 为 `MD5("D")` 或 `MD5(RequestId+"D")` 的结果；
-   所以那个字面量是个 **死值 / 被覆盖的初始值**，运行时根本不会用它。

> **教训：不要盯单个常量，要盯完整的赋值链。** 一个"长得像密钥"的常量，可能是声明初始值、可能是另一条代码路径的、也可能压根是废弃代码。只有顺着函数体把赋值顺序看全，才知道运行时到底用的是哪个。

（顺带， `d = Utf8.parse("59b87344b54f3197")` 才是真·IV，它在函数里从不被重新赋值。这正说明"看完整赋值链"的重要性：同样是常量， `d` 是活的， `u` 的初始值是死的。）

### 5.5 底层与业务层的对照

主包里还能看到 CryptoJS 的 **底层 AES 实现**，和上面的业务封装层是两回事。底层长这样（变量名已被混淆，但结构一眼可辨）：

```javascript
// CryptoJS 底层 raw AES —— encrypt 核心（真实片段）
encrypt = function(t) {
  if (16 != t.length) throw Error("invalid plaintext size (must be 16 bytes)");
  for (var e = this._Ke.length - 1, r = [0,0,0,0], n = k(t), i = 0; i < 4; i++)
    n[i] ^= this._Ke[0][i];                       // 第 0 轮：白化密钥
  for (var o = 1; o < e; o++) {                    // 中间轮
    for (var i = 0; i < 4; i++)
      r[i] = d[n[i]>>24&255] ^ v[n[(i+1)%4]>>16&255] ^ y[n[(i+2)%4]>>8&255] ^ g[255&n[(i+3)%4]] ^ this._Ke[o][i];
    n = r.slice();
  }
  for (var a, u = s(16), i = 0; i < 4; i++)        // 末轮：无 MixColumns
    a = this._Ke[e][i],
    u[4*i]   = 255 & (l[n[i]>>24&255] ^ a>>24),
    u[4*i+1] = 255 & (l[n[(i+1)%4]>>16&255] ^ a>>16),
    u[4*i+2] = 255 & (l[n[(i+2)%4]>>8&255] ^ a>>8),
    u[4*i+3] = 255 & (l[255&n[(i+3)%4]] ^ a);
  // ...
}
```

逐块认一下，就能确认这是 **标准 AES-128/192/256 的 T 表实现**，不是目标自研的加密：

| 符号  | 对应 AES 语义 |
| --- | --- |
| `_Ke` / `_Kd` | 加密 / 解密轮密钥表（key schedule 展开） |
| `d` / `v` / `y` / `g` | 四个 T 表（Te0~Te3），把 SubBytes + ShiftRows + MixColumns 合并成一次查表 |
| `l` | S 盒，末轮专用（末轮没有 MixColumns） |
| `n[i] ^= _Ke[0][i]` | 首轮白化（AddRoundKey） |

区分这两层 **极其重要**： **业务层的 `o.encrypt` 才是我们要还原的协议**，底层那堆是 CryptoJS 库自带的 AES，不用管它。定位错层级，就会陷入"对着 AES 轮函数发呆"的死胡同——你分析半天还原出来的只是 CryptoJS 开源库里本来就公开的 AES，跟目标的协议半毛钱关系没有。真正有价值的是 **业务层怎么选 key、怎么选 IV、怎么组织明文**，而不是 AES 本身怎么转轮。

### 5.6 交叉验证

算法对不对，不能只靠"读代码看懂了"，要靠 **真实样本回放**。做两件事：

1.  **请求侧往返复算**：用还原出的 key/iv，把明文 `{"ID":6075}` 重新加密，跟抓到的 `requestCipher` 比对， **16/16 条 byte 级一致**；
2.  **响应侧解密**：用 `MD5(RequestId+"D")` 解每条响应， **登录后 15/15 全部解开** （剩下 1 条是登录前 401，无 data，不算）。

还原脚本（Node，逻辑与线上一致）：

```javascript
const crypto = require('node:crypto');
const KEY_D = crypto.createHash('md5').update('D', 'utf8').digest('hex'); // f623e75af30e62bbd73d6df5b50bb7b5
const IV = '59b87344b54f3197';

function encrypt(plain) {
  const key = Buffer.from(KEY_D, 'utf8');           // 32 字节 -> AES-256
  const iv  = Buffer.from(IV, 'utf8');              // 16 字节
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64');
}

function decrypt(cipherB64, requestId) {
  const keyHex = crypto.createHash('md5').update(requestId + 'D', 'utf8').digest('hex');
  const key = Buffer.from(keyHex, 'utf8');
  const iv  = Buffer.from(IV, 'utf8');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]).toString('utf8');
}
```

上面是核心的两个函数。把它们接进一个 **完整解码流水线** （从抓包原始记录到可用数据），逻辑长这样：

```javascript
function decodeCapture(cap) {
  // 1. 从 URL 编码的 body 里抽出 command 和 data（顺带完成 URL decode）
  const params = new URLSearchParams(cap.requestData);
  const command = params.get('command');
  const dataB64 = params.get('data');

  // 2. 请求侧往返复算：用固定 key 解自己的请求，验证 key 对不对
  const plainRequest = decrypt(dataB64, '');          // 请求侧 key = MD5("D")，与 RequestId 无关

  // 3. 响应侧：从响应 JSON 里拿 RequestId 和密文，用动态 key 解
  const resp = JSON.parse(cap.responseData);
  const plainResponse = decrypt(resp.data, resp.RequestId);   // key = MD5(RequestId + "D")

  // 4. 剥多层 JSON：解密结果可能是字符串套字符串
  let node = plainResponse;
  while (typeof node === 'string') node = JSON.parse(node);

  // 5. 再剥数组嵌套：[[[...]]] 这种单元素数组逐层解包
  while (Array.isArray(node) && node.length === 1) node = node[0];

  return { command, plainRequest, plainResponse, data: node };
}
```

跑完全部抓包记录，得到一张干净的验证结果表：

```
16/16  请求往返复算 byte 级一致   （key=MD5("D") 请求侧全部命中）
15/15  登录后响应解密成功        （key=MD5(RequestId+"D") 响应侧全部命中）
 1     登录前 401，响应无 data    （跳过，不算解密失败）
```

这组数字就是"算法还原正确"的硬证据——不是"我读代码觉得对"，而是"每一密文都能用还原出的 key 解回明文"。

到这一步，"内容保护机制能不能还原"有了确定答案： **能，而且零门槛**——固定密钥、固定 IV、明文算法全在 JS 里。

### 5.7 多层 JSON：协议里还有一层"洋葱皮"

算法还原只是第一关。真正写解析器时，会发现 **明文解出来不是直接可用的对象，而是套了好几层 JSON**。这是协议层面的"洋葱皮"，不剥干净就拿不到数据。

**请求侧** 的真实层结构：

```
requestLayers: [ "{\"ID\":6075}", {ID:6075} ]
```

拆开理解：

| 层   | 内容  | 说明  |
| --- | --- | --- |
| L0 业务对象 | `{ID:6075}` | 真正的业务数据 |
| L1 JSON 字符串 | `"{\"ID\":6075}"` | `JSON.stringify(L0)` 的结果 |
| 密文  | Base64 | 对 L1 这个 **字符串** 做 AES 加密 |

也就是说，被 AES 加密的明文是 **字符串 `{"ID":6075}`** （L1），而不是直接对对象做序列化加密。这一层 stringify 是谁做的、为什么要套，可以暂时不深究，但解析时要按"解密 → 得字符串 → JSON.parse → 得对象"来。

**响应侧** 则更夸张，是三层嵌套：

```
responseLayers: [ [ [ {QuestionType, ID, AnswerImg, AnswerTxt, ...} ] ] ]
```

即：解密得到字符串 → `JSON.parse` 得到数组 → 再 `parse` 一层数组 → 再 `parse` 一层数组 → 最内层才是题目对象。这大概率是后端框架把结果 **逐层 JSON 序列化** 造成的（每个处理环节都 stringify 一次，堆了三层）。写解析器时别想当然"解出来就是对象"，先探测一下最外层是什么类型、要剥几层。

> **教训：明文解出来 ≠ 数据拿到手。** 加密还原到"能解密"只是及格线，多层序列化、嵌套数组、字段名映射这些"洋葱皮"，才是真正让解析器能跑通的最后一公里。这一步靠的是一次次 `typeof` / `Array.isArray` 的探测，而不是猜。

* * *

## 第六回合：解出第一道题，端到端跑通

### 6.1 响应的多层嵌套

用上面的 `decrypt` 解开详情接口的响应后，得到的不是一层 JSON，而是 **三层嵌套** （真实结构）：

```
responseLayers: [ [ [ { QuestionType, ID, AnswerImg, AnswerTxt, ... } ] ] ]
```

即：解密得到的是一个 JSON 字符串， `JSON.parse` 一层套一层，最内层才是题目对象。这一层嵌套结构本身也是协议的一部分，写解析器时得按层剥。

### 6.2 第一道题（ID 6075）

剥到最后，完整拿到这道题的字段：

```yaml
QuestionType : "填空题"
ID           : 6075
QuestionTxt  : 题目正文（LaTeX 文本，长度若干字符）
AnswerTxt    : 答案 + 解析全文（1421 字符，LaTeX + 分步解析）
AnswerImg    : 答案图片 URL
QuestionImg  : 题目图片 URL
BookID       : 12
QuestionPage : 7
...
```

（题目正文和答案正文是付费版权内容，这里只贴字段名和长度，不贴原文。）

端到端验证完成： **从抓到的密文，到还原的算法，到解开明文题目 + 答案 + 解析，全链路跑通。**

* * *

## 最后一步：付费墙到底在哪？——答案是客户端

把列表接口和详情接口的响应结构摆出来，结论自己会浮出来。

### 7.1 列表接口：无差别返回 2328 个题目 ID

`GetRelQuestionList_xxx` 一次返回 **2328 个题目 ID**，每个条目长这样（真实结构，题目 ID 为验证样本）：

```json
{
  "QuestionID": 6075,
  "json_data": "{\"data\": [{\"PropertyID\": 31, \"PropertyContentID\": 3220}, {\"PropertyID\": 25, \"PropertyContentID\": 779}, {\"PropertyID\": 17, \"PropertyContentID\": 198}, {\"PropertyID\": 16, \"PropertyContentID\": 194}]}"
}
```

拆开看，条目里只有两个字段：

| 字段  | 含义  |
| --- | --- |
| `QuestionID` | 题目标识（后续调详情接口用） |
| `json_data` | 一段属性映射 JSON，形如 `PropertyID -> PropertyContentID` 的键值列表 |

`PropertyID` （31 / 25 / 17 / 16 这类）是属性维度（题型、章节、知识点等）， `PropertyContentID` 是对应维度下的具体值。注意这里用 ID 引用而不是内联文字，是为了 **数据归一化**——正文由另外的属性接口提供。

**重点**：这 2328 个条目里， **没有任何"付费 / 锁定 / 未解锁 / 价格"字段**。也就是说，服务端连"哪些题该收费"的标记都不下发——列表阶段就已经是无差别全量返回了。

### 7.2 详情接口：11 个字段，无授权门控

`GetQuestionDetails_xxx` 返回的字段就这 11 个：

```
QuestionType, ID, AnswerImg, AnswerTxt, BookID,
LinkNames, LinksCount, QuestionID, QuestionImg, QuestionPage, QuestionTxt
```

逐字段语义：

| 字段  | 含义  |
| --- | --- |
| QuestionType | 题型（填空/选择/解答…） |
| QuestionTxt | 题目正文（明文下发） |
| AnswerTxt | 答案 + 解析全文（**明文下发**） |
| AnswerImg | 答案图片 URL |
| QuestionImg | 题目图片 URL |
| BookID / QuestionPage | 教材号 / 页码（来源定位） |
| LinkNames / LinksCount | 关联知识点 |
| ID / QuestionID | 题目标识 |

注意： **没有 `isPay` / `isLock` / `price` / `status` 任何一个授权字段**。答案全文 `AnswerTxt` 、题目 `QuestionTxt` 是 **无条件明文下发** 的。

### 7.3 最致命的一条：答案图片是无签名直链

```
AnswerImg: https://<某-oss>.<region>.aliyuncs.com/yjs_book/12/A_7_1.jpg?x-oss-process=style/yjs
```

这是对象存储的 **裸 URL，没有签名、没有防盗链、没有过期参数**。也就是说，答案图片 **连解密都不用，脱离登录态直接就能下载**。这个 URL 一旦泄露，图片资源就完全脱离了任何授权机制。

### 7.4 结论

三条合起来：

> **这个付费服务的付费墙不在服务端，在客户端 UI 层。** 服务端把全部题目 + 答案明文无条件推给任何登录账号，客户端根据"用户是否已购"来决定要不要把答案画出来。所谓加密只是给传输过程穿了件透明衣服——固定密钥、固定 IV、算法明文，对逆向者零门槛。

用一句话对照：一个合格的付费墙，应该是"未购用户根本拿不到答案明文"（服务端按授权裁剪响应，或至少对答案单独做服务端门控 + 图片用签名 URL）。这里恰恰相反： **答案是全量下发的，只是前端不显示**。

* * *

## 结果

### 8.1 还原出的算法（可直接复现）

| 项   | 值   |
| --- | --- |
| 密码算法 | AES-256-CBC |
| 填充  | PKCS7（特殊模式 ZeroPadding，由 `DesEncryptModel` 控制） |
| IV  | `59b87344b54f3197` （UTF-8 编码） |
| 请求侧密钥 | `UTF-8( MD5("D").hex )` = `f623e75af30e62bbd73d6df5b50bb7b5` |
| 响应侧密钥 | `UTF-8( MD5(RequestId + "D").hex )` |
| 响应兜底密钥 | `UTF-8( MD5("D").hex )` |
| 传输形态 | 业务对象 → `JSON.stringify` → AES 加密 → Base64 → `POST /api/Master/AutoModel` 的 `data` 字段 |
| 响应形态 | `{code, RequestId, data:<Base64>, count, DES:true}` → data 解密 → JSON 多层嵌套 |

### 8.2 核心漏洞定性（这才是本文的真正交付物）

1.  **付费内容在服务端无授权校验**：题目 + 答案 + 解析明文随接口无条件下发，响应里无任何授权字段；
2.  **图片资产无签名直链**：答案图片 / 题目图片是对象存储裸 URL，脱离账号即可下载；
3.  **客户端弱加密**：固定密钥 + 固定 IV，密钥派生逻辑明文写在 JS 里，可被完整还原；
4.  **攻击成本极低**：只需一个（免费）账号登录态，即可拉取全量题库明文。

* * *

## 诚实边界

-   **只解了 1 道题（ID 6075）做端到端验证**。"全部 2328 道都能拿到答案"是 **机制推断** （列表全量下发 + 详情无授权字段 + 解密算法通用）， **没有穷举验证**，也没有实际批量下载——这是本文一开始就定下的边界。
-   还原的是 **业务层密文** （应用自己套的 AES），不是微信 / WMPF 底层的传输加密；底层那条链路不在此次范围内。
-   `MD5("D")` 里的 `"D"` 这个魔数、IV 常量是从源码里扒出来的事实值，但 **为什么取 `"D"` 、这个派生规则背后的设计动机** 没有进一步深挖（不影响复现）。
-   登录态、鉴权 token 的获取与维持不在本文范围，仅验证"有一个登录态即可"。
-   代码片段为脱敏后引用的真实片段，做了最小改动（变量名、域名、接口后缀），算法本体与常量未改。

* * *

## 复盘

**真正的转折点有 4 个：**

1.  **启动顺序**——先注入后加载，顺序反了全盘皆空；
2.  **配置文件的真实位置**—— `~/.claude.json` 而不是 `~/.claude/mcp.json` ，这是靠"看进程真实命令行"才揪出来的；
3.  **完整赋值链 vs 孤立常量**——32 字符字面量差点被误认成 key，靠抽全函数体纠正；
4.  **401 与登录态的区分**——一条登录前请求差点污染"算法正确性"的判断。

把这四点抽象一下，其实是一条 **可迁移的方法论**：

> 逆向里一半的坑不在"目标有多难"，而在"环境没对齐、样本没分层、代码没看全"。 **先验证工具链真的生效，再分层清洗样本，最后看完整代码路径**——顺序对了，剩下的就是体力活。

**留一句给同行**：小程序 AppService 的加密十有八九是"前端防君子"——固定密钥 / 固定 IV / 算法明文，而真正的付费墙，去看服务端到底有没有在响应里做授权字段，答案往往比你想的简单。
