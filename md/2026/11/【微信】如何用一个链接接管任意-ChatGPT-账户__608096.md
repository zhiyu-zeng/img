---
title: 【微信】如何用一个链接接管任意 ChatGPT 账户
source: https://mp.weixin.qq.com/s/odXloMjZhKscQdVeflrHTQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T13:27:35+08:00
trace_id: 290ec101-5392-4d3f-8d0d-69905c9873b4
content_hash: 89e1546f4dad59fb85aff5b734efeb39ffca58e498b9237fed7c177e52361ab5
status: synced
tags:
  - 微信
  - 漏洞分析
  - CSP绕过
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 一条 ChatGPT 公开分享链接即可在受害者登录会话中执行任意 JavaScript 并接管账户；OpenAI 于 10 月 26 日修复，评级 P1 并发放 5,000 美元赏金。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40b75244-d011-8154-8237-e87fbb344977
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一条 ChatGPT 公开分享链接即可在受害者登录会话中执行任意 JavaScript 并接管账户；OpenAI 于 10 月 26 日修复，评级 P1 并发放 5,000 美元赏金。
> 
> - **攻击链：** 攻击者将恶意对话经常规分享功能发布为 `/share/<id>` 链接，受害者只需打开链接（后期版本预览自动打开，约 4.5 秒触发），载荷即以 `chatgpt.com` 身份在其已登录会话中运行，无需安装 App 或开发者工具。
> - **沙箱逃逸核心：** 交互图表加载的 MathLive 库监听 `postMessage` 时不校验来源，接受含原始 HTML 的虚拟键盘布局消息，经 `innerHTML`（`createHTML` 为恒等包装器而非净化器）写入主页面，再借助无 `sandbox` 属性的 `srcdoc` iframe 创建继承 `chatgpt.com` 身份的新文档。
> - **CSP 绕过：** ChatGPT 的 CSP 允许 YouTube 脚本，而 YouTube oEmbed 端点在返回校验错误前已将非法 JSONP callback 反射进响应，用 `;void` 收尾使错误对象无害，从而实现任意 JS 执行。
> - **实际危害：** 同源脚本解析 `#client-bootstrap` 提取受害者会话令牌，调用 `/backend-api` 枚举并读取从未分享过的私密对话，再以图片请求外传数据，等效于以受害者身份执行任意账户操作。
> - **经验教训：** 接收方须同时校验 `event.origin` 与 `event.source`；跨窗口设置不应携带原始 HTML；动态创建文档须保持沙箱化；CSP 只能作纵深防御而非唯一屏障。

**骨哥说事** *2026年11月1日 11:09*

## 声明：文章中涉及的程序(方法)可能带有攻击性，仅供安全研究与教学之用，读者将其信息做其他用途，由用户承担全部法律及连带责任，文章作者不承担任何法律及连带责任。

通过绕过 ChatGPT 的沙箱 (sandbox) 和内容安全策略 (Content Security Policy, CSP)，我们的研究团队只需发送一个链接，就能接管任何人的账户。

2026 年 10 月，我们发现了一种方法，可以把一个普通的 ChatGPT 公开分享 (public share) 变成由攻击者控制的 JavaScript，并让它运行在任何打开该分享的人所处的已登录会话中。

攻击者可以创建一个恶意对话，使用 ChatGPT 的常规分享功能将其发布，然后把链接发给另一名用户。当受害者打开分享内容时，攻击载荷 (payload) 会以 `chatgpt.com` 的身份执行，并能够访问受害者的已认证网页会话。

我们确认，这段代码可以枚举受害者的对话列表，读取一段从未与攻击者分享过的私密对话内容，并把该对话中的数据发送到外部服务器。该载荷并不局限于修改页面或弹出警告，它还能以受害者身份直接调用 ChatGPT 的已认证 API (authenticated API)，这实际上意味着我们可以接管受害者的 ChatGPT 账户。

受害者无需安装 App、加入项目 (Project)、粘贴代码或打开开发者工具。唯一需要做的操作就是打开分享链接。

OpenAI 于 10 月 26 日修复了该问题，并将这份报告评为 P1。

这条攻击链最初源自两个单独看起来都无害的功能：一张图表和一次 HTML 预览 (HTML Preview)。

> **攻击链**
> 
> 攻击者发布一个 ChatGPT 对话  
> ↓  
> 受害者打开分享链接  
> ↓  
> HTML 预览跨越进入主 `chatgpt.com` 页面  
> ↓  
> JavaScript 在受害者的已登录会话中运行  
> ↓  
> 以受害者身份在 `chatgpt.com` 上执行任意操作：  
> 读取私密聊天和文件、修改账户

### 技术剖析

* * *

### 故事始于一张图表和一次预览

这项研究最初的问题很简单：如果预览 (Preview) 代码被限制在一个不同的网站中，它还能与什么通信？

ChatGPT 可以通过预览功能把一个 HTML 代码块变成一个小型可运行网页。由于该页面可能包含任意代码，ChatGPT 很合理地将其运行在一个受限框架 (frame) 中，并置于不同的网址下。预览可以运行 JavaScript，但浏览器会把它当作另一个网站，因此它无法直接检查其外围那个已登录的 ChatGPT 页面。

起初，这种隔离看起来完全按预期生效。预览中的代码无法读取 `parent.document` ，也就是主 ChatGPT 页面。事情本应到此为止。

该对话中还包含一张正常的交互式图表 (interactive graph)。在后台，这张图表加载了一个名为 MathLive 的数学库。加载它不仅会绘制图表，还会在主 ChatGPT 页面中安装一个消息监听器，用来处理与 MathLive 屏幕键盘相关的消息。

浏览器将相关 API 称为 `postMessage` 。即便浏览器禁止两个 frame 读取彼此的页面，它仍是 frame 之间交换信息的一种合法方式。你可以把它想象成一个投信口：受限的预览无法进入主页面，但仍然可以通过这个投信口投递消息。

只有当接收方检查消息发送者时，这种做法才是安全的。

对于我们关注的那项设置，MathLive 并没有做这项检查。它的监听器接受了一条用于更改虚拟键盘布局的消息，而该布局允许包含 HTML。图表安装了接收方，预览则为我们提供了不可信的发送方。两个互不相关的功能偶然间在沙箱上搭出了一条通路。

### 本不该生效的消息

预览发送了两条消息。第一条用我们的 HTML 替换了虚拟键盘布局。第二条通知 MathLive 显示键盘，从而让它渲染新的布局：

```php
top.postMessage(
  {
    type: "mathlive#virtual-keyboard-message",
    action: "update-setting",
    layouts: [
      {
        label: "Compatibility",
        layers: [{ id: "compatibility", markup }],
      },
    ],
  },
"*",
);

top.postMessage(
  {
    type: "mathlive#virtual-keyboard-message",
    action: "show",
    animate: false,
  },
"*",
);
```

MathLive 识别出了这个公开的消息类型，但其顶层控制器使用的来源策略 (origin policy) 是 `none` ，这意味着它会接受来自任意网址的消息。它也没有要求 `update-setting` 消息必须来自此前已获批准的窗口。任何能够触达该监听器并知晓消息格式的人，都可以替换布局。

当键盘打开时，MathLive 会把提供的布局拼接成一个 HTML 字符串，并把它赋给真实 ChatGPT 页面中的 `innerHTML` 。一个名为 `createHTML` 的辅助函数乍看之下似乎会净化该值。但它并没有；它只是把这个字符串标记为可信，然后原样放行我们的 HTML。

这令人兴奋，但我们仍未获得 JavaScript 执行能力。通过 `innerHTML` 插入的 `<script>` 标签不会自动运行。

下一步是使用带有 `srcdoc` 的 `iframe` 。这是一项浏览器功能，可让内嵌 frame 把自身 HTML 直接放在一个属性中：

```
<iframe srcdoc="..."></iframe>
```

MathLive 在没有 `sandbox` 属性的情况下把这个 frame 插入了主 ChatGPT 文档。这为我们带来了两个有用的特性。第一， `srcdoc` 创建了一个全新的文档，外部脚本可以在其中执行。第二，由于该 frame 是由主 ChatGPT 页面创建的，浏览器赋予了它 `https://chatgpt.com` 的 Web 身份。因此，新 frame 中的代码能够访问父页面。

#### 借助 YouTube JSONP 绕过 CSP

ChatGPT 的内容安全策略 (CSP) 再次拦住了我们。CSP 控制页面可以加载哪些脚本，而该策略正确地阻止了内联 JavaScript。不过，它确实允许来自 YouTube 的脚本。

YouTube 的 oEmbed 端点支持一种 JSONP 风格的回调 (callback) 参数。JSONP 响应是 JavaScript，而非普通 JSON。该端点试图拒绝无效的 callback，但在返回校验错误之前，它已经把 callback 放进了响应中：

```
https://www.youtube.com/oembed?callback=globalThis.__marker=31337;void
```

响应开头如下：

```
// API callback
globalThis.__marker = 31337;
void {
  error: {
    code: 400,
    message: "Invalid JSONP callback name: ...",
  },
};
```

用 `;void` 结束 callback，使 YouTube 追加的对象变得无害。由于 ChatGPT 的 CSP 已经允许 YouTube，浏览器把这段响应当作脚本加载，并在新 frame 中运行了我们的 callback。

现在我们已拥有以 `chatgpt.com` 身份运行的任意 JavaScript。原始预览仍然被隔离在它自己的网址上；我们通过诱使主页面中的一个受信任组件为我们创建一个新的、未加沙箱的文档，越过了边界。

### 把一个实验室漏洞变成一个公开链接

到目前为止，这只是一个有用的沙箱逃逸，但第一个能工作的版本还不是一个有说服力的真实攻击。它使用研究人员控制的 ChatGPT App 作为发送方。受害者必须先连接或调用该 App。

接下来，我们尝试通过原生 HTML 附件投递载荷。ChatGPT 会在同一个受沙箱限制的预览中打开该附件，因此它可以发送恶意的 MathLive 消息。

然而，当我们把对话导出为公开分享时，附件保留了，但之前的图表没有保留。图表至关重要，因为它会加载 MathLive，并在主页面中安装存在漏洞的消息监听器。没有它，附件仍然可以发送消息，但没有任何组件在监听或处理这些消息。

突破点在于把两个部分直接放进同一个普通的公开对话中：

1.  一张真实图表在主页面中初始化了 MathLive。
    
2.  随后由助手编写的 HTML 预览发送了这两条消息。
    

由此生成的 `/share/<id>` 链接会为另一名用户保留完整的攻击链。攻击者可以像发送任何 ChatGPT 分享对话一样投递该链接——通过电子邮件、聊天、支持工单或社交帖子。受害者无需安装任何东西、加入攻击者的工作区，也无需经过攻击者控制的流程进行身份验证。他们只需访问攻击者分享的 ChatGPT URL。

我们观察到了两种交互方式。在最稳定的复现中，受害者打开分享内容，并点击一次 ChatGPT 常规的 **预览 (Preview)** 按钮。后来，我们把该 HTML 块标记为可预览，以便 ChatGPT 自动打开它。在那个版本中，打开链接就是受害者唯一需要执行的一次点击。我们在一个独立账户中三次复现了自动路径，包括在强制刷新之后；警告大约在 4.5 秒后出现。

图表和预览是独立加载的，因此载荷有时可能会在 MathLive 准备就绪之前就发送消息。最终的载体通过在一段有限时间内重试同样的两条消息来处理这种竞态。主页面中的一个保护机制确保私密对话证明和外发请求只运行一次。

![公开分享修改了真实的 ChatGPT 页面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8daa530b91871de1.png)

公开分享修改了真实的 ChatGPT 页面

公开分享修改了真实的 ChatGPT 页面

此时，公开分享已经可以显示一个被浏览器识别为来自 `chatgpt.com` 的警告，并且可以在主页面中添加横幅。这证明了我们的代码正在何处运行，但还没有说明这个漏洞为何重要。

### 仅弹出警告还不够

此时，弹出警告已经是这个漏洞利用能做的事情中最无趣的一项。JavaScript 正以 `chatgpt.com` 的身份运行，这意味着它可以像正常 Web 应用一样，使用相同的已认证上下文与 ChatGPT 交互。

载荷读取了页面已经可用的会话信息，并利用它调用 ChatGPT 的对话 API。首先，它枚举了受害者最近的对话。然后，它可以请求某个选定的私密对话的消息数据：

```
GET /backend-api/conversations?...&limit=20&order=updated&offset=0
GET /backend-api/conversations/<conversation-id>?num_turns=2
```

这是直接的已认证 API 访问，而不是抓取屏幕上恰好可见的文本。目标对话与恶意分享无关，且从未与攻击者分享过。

一旦注入的 JavaScript 获得了响应，把数据发送到站外就很简单了。载荷会向我们控制的服务器发起一个普通的图片请求。

我们特意只把响应中的一小部分发送到站外。注入的代码已经接收到了经过认证的对话响应，并可以读取其内容，因此该漏洞的影响并不局限于这个值。

![受控证明：私密对话数据能够离开受害者的会话](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/78563f201d61dff8.png)

受控证明：私密对话数据能够离开受害者的会话

受控证明：私密对话数据能够离开受害者的会话

最终结果是一个实用的跨用户数据窃取原语 (primitive)。一个恶意的公开对话可以在另一名用户的已登录 ChatGPT 会话中执行，枚举私密对话，获取私密消息内容，并把选定的数据发送到攻击者控制的服务器。

由于代码以 Web 应用的已认证权限运行，其影响范围本质上并不局限于我们证明中所用的对话端点。通过 ChatGPT 已认证前端 API 暴露的其他数据和操作也处于同一安全边界内。基本上，我们可以代表受害者的 ChatGPT 账户执行任何操作。

### 问题出在哪里，OpenAI 修复了什么

预览沙箱本身是有效的。预览中的代码无法直接读取 ChatGPT 页面。问题在于，主页面中的另一个组件愿意接受它的指令。

三个设计决策把这一失误变成了一次完整的漏洞利用：

1.  MathLive 接受了一条会改变状态的消息，却没有验证它是由哪个 frame 发送的。
    
2.  消息格式允许把原始 HTML 作为键盘布局数据提供。
    
3.  该 HTML 可以创建一个未加沙箱的文档，而该文档继承了 `chatgpt.com` 的身份。
    

YouTube 响应只是绕过 CSP 的最后一层变通手段，并非根本原因。仅封禁该端点只会移除一条通往 JavaScript 的路径，同时仍然让不可信的预览能够向 ChatGPT 注入 HTML。

OpenAI 复现了 JavaScript 执行和私密对话证明这两部分。修复分两个版本在 ChatGPT Web 前端推出。在推出期间，CSP 变更阻止了原始攻击链的一部分，但其中一个版本仍需要更新。10 月 26 日，OpenAI 确认两个版本现在都会拒绝报告中使用的跨 frame MathLive 消息，并将该问题标记为已解决。

防御层面的经验相当简单：

-   消息接收方应同时验证发送方的网址，以及被授予权限的确切窗口。
    
-   跨窗口设置不应包含原始 HTML。
    
-   当动态创建的文档内容可能受到不可信 frame 影响时，这些文档应始终保持沙箱化。
    
-   CSP 应作为后备控制措施，而不是攻击者控制的 HTML 进入主站后的唯一屏障。
    

这个漏洞之所以有意思，是因为每一个单独的功能看起来都合理。预览是隔离的；图表可以加载数学键盘；frame 之间可以交换消息；CSP 允许一家大型媒体提供商；公开对话可以被分享。只有当所有这些功能都组合在同一个页面上时，漏洞才显现出来。

### 时间线

| 日期  | 事件  |
| --- | --- |
| 2026 年 10 月 13 日 | 在 ChatGPT 生产代码中确认了 MathLive 从消息到 HTML 的路径。 |
| 2026 年 10 月 14 日 | 通过正常 UI 复现攻击链，并将固定的警告弹窗升级为任意 JavaScript 执行。 |
| 2026 年 10 月 16 日 | 确认公开分享可以在不同账户和工作区之间投递，且只需点击一次预览。 |
| 2026 年 10 月 17 日 | 确认从分享导航自动打开预览，并在强制刷新后复现。 |
| 2026 年 10 月 18 日 | 向 OpenAI 漏洞赏金计划提交报告。 |
| 2026 年 10 月 19 日 | 添加受控的私密聊天泄露证明。 |
| 2026 年 10 月 21 日 | OpenAI 复现问题；严重性从初始分诊的 P2 提升至 P1。 |
| 2026 年 10 月 22 日 | OpenAI 表示一个 Web 前端已修复，另一个仍在更新。 |
| 2026 年 10 月 23 日 | CSP 变更阻止了攻击链的一部分，但仍有一个前端更新待完成。 |
| 2026 年 10 月 26 日 | OpenAI 确认两个前端均拒绝了报告中的消息，解决了问题，并发放总计 5,000 美元的赏金。 |

### 技术细节

上面的主体内容已经包含完整的漏洞利用链。以下细节面向希望更深入追踪生产代码和载荷变换过程的读者。

相关反混淆后的控制流等价于：

```kotlin
window.addEventListener("message", (event) => {
  if (event.data?.type !== "mathlive#virtual-keyboard-message") return;
  if (!validateOrigin(event.origin, this.originValidator)) return;
  this.handleMessage(event.data, event.source);
});

if (message.action === "update-setting" && message.layouts) {
  this.layouts = message.layouts;
}
```

布局归一化保留了 `layouts[].layers[].markup` 。显示键盘最终执行的操作等价于：

```
keyboardContainer.innerHTML = MathfieldElement.createHTML(keyboardHTML);
```

`createHTML` 充当的是恒等包装器或 Trusted Types 包装器，而不是净化器。Trusted Types 可以限制谁能够向 HTML 接收器 (HTML sink) 赋值，但恒等策略 (identity policy) 并不会让攻击者控制的字符串变得安全。

**解析器与 CSP 的过渡。** `innerHTML` 操作可以创建一个 iframe，但以这种方式直接插入的脚本仍会处于惰性状态。未加沙箱的 `srcdoc` 触发了一次全新的 HTML 文档解析，并继承了嵌入它的 ChatGPT 源 (origin)。该文档还继承了测试期间捕获的实际生效 CSP；该策略阻止内联代码，但允许在 `script-src-elem` 中使用 `www.youtube.com` 。

oEmbed 响应返回 HTTP 200，带有 `Content-Type: text/javascript; charset=UTF-8` 和 `X-Content-Type-Options: nosniff` ；未观察到跨源资源策略 (Cross-Origin-Resource-Policy, CORP) 响应头。Google 重写了 callback 中的尖括号，因此载荷使用了经典的 `function` 语法，而不是箭头函数。用 `;void` 结束程序，消耗掉了端点追加的错误对象。

对于私密对话证明，函数先通过 `toString()` 转换为源码，双引号转换为单引号，并折叠了空白字符。随后， `URLSearchParams` 将其编码进 callback，脚本 URL 在 `<script src>` 中进行 HTML 转义，而整个元素又被再次转义进 iframe 的 `srcdoc` 属性。最终 callback 长度为 5,533 个字符；YouTube URL 为 7,309 个字符；脚本元素为 7,337 个字符；最终的 iframe 标记为 7,390 个字符。

**已认证读取。** 同源 frame 从父文档中解析 `#client-bootstrap` ，提取会话访问令牌和账户 ID，并在两者都存在时要求令牌中的账户 ID 与会话一致。它使用了以下内存中的请求头：

```
Authorization: Bearer <victim token>
ChatGPT-Account-ID: <victim account>
Accept: application/json
```

主要请求为：

```bash
GET /backend-api/conversations?exclude_conversation_origin=tpp&expand=false&is_archived=false&is_starred=false&limit=20&order=updated&offset=0
GET /backend-api/conversations/<id>?num_turns=2&include_has_versions=true
```

只有当详情请求返回 403、404 或 405 时，代码才会尝试旧版 `/backend-api/conversation/<id>?include_full_conversation=true` 路由。验证过程只传输响应中一个经过选择的小值。在发起外部图片请求之前，它会清除对令牌、账户、bootstrap、会话和请求头的引用。

### 关键要点

-   隔离的强度取决于跨越它的每一座桥梁。当特权监听器信任了错误发送方的消息时，即使 frame 已加沙箱，仍可能危及父页面。
    
-   `postMessage` 接收方在接受会改变状态的指令前，必须同时验证 `event.origin` 和 `event.source` 。
    
-   HTML 注入可以借助一个全新的、未加沙箱的文档，以及一个被允许的第三方脚本端点，升级为 JavaScript 执行。CSP 是有价值的纵深防御 (defense in depth) 措施，但它无法让不安全的渲染路径变得安全。
    
-   同源 JavaScript 的影响必须放在受害者的已认证上下文中衡量。一旦代码以 `chatgpt.com` 身份运行，它就能触达正常前端可访问的相同私密数据和账户操作，而不仅仅是显示警告。
    
-   跨功能测试很重要。这条攻击链存在于公开分享、预览、MathLive、frame 创建和 CSP 之间的接缝中，而不是单独存在于某个功能里。
    

更广泛的教训是：安全边界必须在整个产品范围内成立，而不只是存在于各个组件内部。任何公开或可分享的界面都应被视为攻击者控制的输入；每一条跨 frame 消息都应经过认证；不可信标记在整个渲染路径中都应始终保持沙箱化。

原文：https://www.parameter.ai/labs/we-found-a-gap-at-openai

\- END -

**感谢阅读，如果觉得还不错的话，动动手指给个三连吧～**

AI · 目录
