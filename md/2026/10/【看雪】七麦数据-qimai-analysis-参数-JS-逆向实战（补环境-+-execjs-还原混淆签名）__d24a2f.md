---
title: 【看雪】七麦数据 qimai analysis 参数 JS 逆向实战（补环境 + execjs 还原混淆签名）
source: https://bbs.kanxue.com/thread-293239.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-16T19:53:42+08:00
trace_id: c11b848e-fb1a-4ee1-8866-ffe35997b1ca
content_hash: 5b26cd5fefcf42ec5c5d4b46bd694b0ecbaa4773fa02ead34bd0725f1dd66f0a
status: synced
tags:
  - 看雪
  - 协议分析
  - JS逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: 执行混淆 JS 原函数、补出 `document` 环境，配合登录 Cookie 即可自动生成七麦 `analysis` 签名，无需人肉还原算法。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-818d-bc18-d80ad5553dc4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 执行混淆 JS 原函数、补出 `document` 环境，配合登录 Cookie 即可自动生成七麦 `analysis` 签名，无需人肉还原算法。
> 
> - **目标接口：** GET `https://api.qimai.cn/rank/offline`，query 中 `option`（4=下架榜）、`sdate`/`edate` 均明文，唯一不可读的是与参数强绑定的 `analysis` 签名。
> - **前置条件：** 接口需登录态，请求要带站点 `Origin`/`Referer` 及 `PHPSESSID`、`qm_check`、`USERINFO`、`AUTHKEY`、`synct` 等 Cookie，Cookie 过期则签名再对也会被拒。
> - **签名构造：** `get_T` 把 params 遍历成数组 → 排序 → 用分隔符拼串 → 追加 url、时间戳与固定常量 → 对称加密并编解码 → `toString()` 输出类 Base64 串；`option` 在函数内写死。
> - **还原策略：** 该 JS 由 javascript-obfuscator 混淆（字符串表 + 单字母变量），逐行还原性价比低；改为在 Node 顶部伪造 `global.document`（填入 cookie），整包加载后直接调用站点导出的 `get_analysis`。
> - **落地与踩坑：** Python 侧 `execjs.compile` 后 `js.call("get_analysis")` 取签名，再随同一份 Cookie 用 `requests.get` 请求，返回 `code:0` 即有数据；文件须按 UTF-8 打开，否则 Windows 默认 GBK 会乱码。

\> 本文是「JS 逆向实战 30 例」系列第 1 篇，项目源码：https://github.com/scool112/openJSreverse （\`Project1\`）  
  
\## 一、目标与背景  
  
七麦数据（qimai.cn）是 App 排行榜数据站，我想抓它的「下架应用榜」列表。它的接口不是裸奔的，query 里带了一个叫 \`analysis\` 的签名参数，缺少或算错就直接被拒。  
  
\- 站点：\`https://www.qimai.cn/rank/offline\`  
\- 目标接口：\`https://api.qimai.cn/rank/offline\`  
\- 需还原字段：\`analysis\` 参数（另外几个是普通业务参数 \`option\` / \`sdate\` / \`edate\`）  
\- 难度：⭐⭐⭐⭐（四星。难点不在算法本身，而在目标 JS 被重度混淆，需要「补环境 + 执行原函数」才能拿到 \`analysis\`）  
  
这个项目的逆向点非常典型：\*\*参数签名\*\*。它不像 MD5 那样一眼能看懂，而是被 javascript-obfuscator 一类工具做了字符串表 + 成员表达式混淆，单靠肉眼看变量名完全读不出来。我的策略是不硬刚混淆，而是\*\*把浏览器环境补出来，直接调用站点自己导出的 \`get\_analysis()\`\*\*。  
  
## 抓包分析

\## 二、抓包分析  
  
打开 \`https://www.qimai.cn/rank/offline\`，F12 切到 \*\*Network\*\* 面板，筛选 \`Fetch/XHR\`，然后点一下页面上的榜单切换/翻页，就能看到对 \`api.qimai.cn/rank/offline\` 的请求。  
  
点开这个请求看 \*\*Payload\*\*，query 长这样：  
  
\`\`\`text  
analysis=eCRbWihbVghUX1xMCwdfWgwIAihbSEgHBwZUUVcMAlRUJ0tL  
option=4  
sdate=  
edate=  
\`\`\`  
  
\`option\` 是榜单类型（4 代表下架榜），\`sdate\`/\`edate\` 是日期区间，都是明文。\*\*唯一不可读的就是 \`analysis\`\*\*——它是一段大小写混杂、像 Base64 又像加密结果的字符串。每换一个榜单类型 / 日期，它都会变，说明它和数据强绑定，是一个真正的「签名」。  
  
再看请求头：\`Origin: https://www.qimai.cn\`、\`Referer\` 也是 qimai 站内，并且请求\*\*带着登录 Cookie\*\*（\`PHPSESSID\` / \`qm\_check\` / \`USERINFO\` / \`AUTHKEY\` 等）。所以这个接口还需要登录态，光有 \`analysis\` 不够。  
  
【图1：Network 面板里 rank/offline 请求的 Payload 与请求头 Cookie —— 建议截图】  
  
结论：接口是 GET，参数明文，难点是把 \`analysis\` 的生成逻辑还原出来。  
  
## 定位加密入口

\## 三、定位加密入口  
  
既然是「参数签名」，我就去 \*\*Sources\*\* 面板全局搜参数名 \`analysis\`，或者直接搜它附近的业务字段 \`option\`、\`sdate\`。搜索结果会落到一个体积很大的混淆 JS 上（七麦的主包）。  
  
一开始我尝试直接读它——变量名全是 \`n2 / t2 / e2 / R / b / t\` 这种单字母，字符串全被塞进一个字符串数组，通过 \`n(12,13,14,...)\` 这种「下标取值」函数还原（javascript-obfuscator 经典套路）。逐行还原成本太高，我决定换思路：\*\*能不能直接把它的导出函数抠出来跑？\*\*  
  
顺着 \`analysis\` 的赋值处找，我找到了导出语句：  
  
\`\`\`js  
// 取自仓库真实 js：Project1/qimai/qimai.js（文件开头与结尾）  
var AA;  
var get_analysis;  
...  
// （get_T 定义略，见下方第四节）  
  
get_analysis = get_T;  
}(function(a) {  
return function() {  
for (var n = arguments, t = "", e = 0, r = n.length; e < r; e++)  
t += a\[n\[e\]\];  
return t  
}  
}(\["p", "u", "s", "h", "w", "e", "b", "a", "c", "k",...  
\`\`\`  
  
也就是说，执行完这一整包，全局就会多出一个 \`get\_analysis\`，它指向内部那个被混淆得看不清的 \`get\_T\` 函数。这正是我要的入口。  
  
【图2：Sources 面板里 analysis 赋值处 / get_T 调用栈断点 —— 建议截图】  
  
## JS还原与补环境

\## 四、JS 还原与补环境  
  
\`get\_T\` 内部一开头就访问了 \`document.cookie\`（它要把登录态的 \`synct\` 之类信息也掺进签名），而 Node 里没有 \`document\`。所以补环境的第一步，就是在文件最顶上\*\*伪造一个 \`global.document\`\*\*，把 Cookie 塞进去：  
  
\`\`\`js  
// 取自仓库真实 js：Project1/qimai/qimai.js（已脱敏，请换成你自己的登录 Cookie）  
var AA;  
var get_analysis;  
  
global.document = {  
cookie: "PHPSESSID=你的PHPSESSID; qm_check=你的qm_check; USERINFO=你的USERINFO; AUTHKEY=你的AUTHKEY; syncd=-700; synct=你的synct"  
}  
\`\`\`  
  
接着就是还原出来的核心函数 \`get\_T\`。它把参数对象整理成一个数组，排序后拼串，再做哈希 / 对称加密，最后 \`toString()\` 成那段 \`analysis\`。真实代码如下：  
  
\`\`\`js  
// 取自仓库真实 js：Project1/qimai/qimai.js（get_T 尾部，混淆变量原样保留）  
function get_T() {  
var i = AA(21725)  
, r = AA(9669)  
, o = AA\[d7\](r)  
, r = AA(80129)  
, u = AA\[d7\](r)  
, c = AA(C)  
, f = c\[x\]\[k\]\[A\]  
, s = (o()\[Pt\]\[Tt\] = At,  
o()\[Pt\]\[Ct\] =!H,  
c\[x\]\[k\]\[Rt\])  
, d = (0,  
i\[zt\])(Bt, B)  
, m = (0,  
i\[Ht\])((0,  
i\[Nt\])(\_t), d)  
, l = (0,  
i\[Ht\])((0,  
i\[Nt\])(Et), d)  
, p = (0,  
i\[Ht\])((0,  
i\[Nt\])(Gt), d)  
, v = ((0,  
i\[Ht\])((0,  
i\[Nt\])(It), d),  
(0,  
i\[Ht\])((0,  
i\[Nt\])(Dt), d),  
(0,  
i\[Ht\])((0,  
i\[Nt\])($t), d),  
(0,  
i\[Ht\])((0,  
i\[Nt\])(Ft), d));  
var n;  
f || $!= s || (n = (0,  
i\[Zt\])(m),  
s = c\[x\]\[k\]\[Rt\] = -(0,  
i\[Zt\])(l) || +new R\[K\] - r2 \* n);  
var e, r = +new R\[K\] - (s || H) - 1661224081041, a = \[\];  
t = {  
params: {  
edate: "",  
option: 4,  
sdate: ""  
},  
url: "/rank/offline"  
}  
return void 0 === t\[Ot\] && (t\[Ot\] = {}),  
R\[W\]\[o7\](t\[Ot\])\[M\](function (n) {  
if (n == v)  
return!B;  
t\[Ot\]\[\_2\](n) && a\[b\](t\[Ot\]\[n\])  
}),  
a = a\[jt\]()\[I5\](N),  
a = (0,  
i\[Jt\])(a),  
a = (a += p + t\[qt\]\[T\](t\[Tt\], N)) + (p + r) + (p + 3),  
e = (0,  
i\[Jt\])((0,  
i\[Qt\])(a, d))  
return e.toString()  
}  
get_analysis = get_T;  
\`\`\`  
  
从这段能看出 \`analysis\` 的大致构造：  
  
1\. 把 \`params\`（\`edate\` / \`option\` / \`sdate\`）遍历成数组 \`a\`；  
2\. \`a\[jt\]()\`（数组排序）后 \`\[I5\](N)\` 用分隔符 \`N\` 拼接；  
3\. 拼上 \`url\`、时间戳 \`r\` 和一串固定常量（\`p\`、\`3\` 等）；  
4\. 用表达式里的对称加密方法 \`i\[Qt\]\` 加密、\`i\[Jt\]\` 做编解码，最终 \`e.toString()\` 输出。  
  
那些常量（\`p\` / \`N\` / \`d\` / \`Bt\` / \`\_t\` 等）都被字符串表还原函数 \`n(...)\` 藏着，逐个人肉解性价比太低。所以我的做法是：\*\*不还原算法，直接把整包 JS 跑起来，调用它自己的 \`get\_analysis\`。\*\*  
  
为了在 Node/\`execjs\` 下跑，我做了两件补环境的事：  
  
\- 伪造 \`global.document\`（上面已贴）；  
\- 文件尾部原本还留了 \`// console.log(get\_analysis())\` 的自测注释，说明在浏览器里它就是这么被调用的。  
  
\## 五、Python 实现  
  
## Python实现

仓库里的 \`py/qimai1.py\` 非常短：读 JS → \`execjs.compile\` → 调 \`get\_analysis()\` → 拼进 query：  
  
\`\`\`python  
\# 取自仓库真实 py：Project1/qimai/qimai1.py  
import requests  
import execjs  
  
with open("qimai.js",encoding="utf-8") as f:  
js_code = f.read()  
  
js = execjs.compile(js_code)  
  
analysis = js.call("get_analysis")  
  
headers = {  
"Accept": "application/json, text/plain, \*/\*",  
"Accept-Language": "zh-CN,zh;q=0.9",  
"Cache-Control": "no-cache",  
"Connection": "keep-alive",  
"Origin": "https://www.qimai.cn",  
"Pragma": "no-cache",  
"Sec-Fetch-Dest": "empty",  
"Sec-Fetch-Mode": "cors",  
"Sec-Fetch-Site": "same-site",  
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",  
"dnt": "1",  
"sec-ch-ua": "\\"Not)A;Brand\\";v=\\"8\\", \\"Chromium\\";v=\\"138\\", \\"Google Chrome\\";v=\\"138\\"",  
"sec-ch-ua-mobile": "?0",  
"sec-ch-ua-platform": "\\"Windows\\"",  
"sec-gpc": "1"  
}  
cookies = {  
"PHPSESSID": "你的PHPSESSID",  
"qm_check": "你的qm_check",  
"USERINFO": "你的USERINFO",  
"AUTHKEY": "你的AUTHKEY",  
"synct": "你的synct",  
"syncd": "-700"  
}  
url = "https://api.qimai.cn/rank/offline"  
params = {  
"analysis": analysis,  
"option": "4",  
"sdate": "",  
"edate": ""  
}  
print(params)  
response = requests.get(url, headers=headers, cookies=cookies, params=params)  
  
print(response.text)  
print(response)  
  
\# "analysis": "eCRbWihbVghUX1xMCwdfWgwIAihbSEgHBwZUUVcMAlRUJ0tL",  
\`\`\`  
  
几个细节：  
  
\- \`js.call("get\_analysis")\` 无参调用，返回的就是那一整段 \`analysis\` 字符串；  
\- Cookie 用同一个登录态填进 \`cookies\`，和 JS 里 \`document.cookie\` 里塞的是同一份（\*\*已脱敏，必须换成你自己登录后的值\*\*）；  
\- 参数保持 \`option=4\`（下架榜）和空的日期，和浏览器一致。  
  
\## 六、运行结果  
  
执行 \`python qimai1.py\`，终端先打印出本次的 \`params\`（能看到 \`analysis\` 每次都不一样），然后打印接口返回的 JSON：  
  
\`\`\`text  
{'analysis': 'eCRbWihbVghUX1xMCwdfWgwIAihbSEgHBwFSUVIPB1xXJ0tL', 'option': '4', 'sdate': '', 'edate': ''}  
{"code":0,"msg":"成功","data":{"list":\[{"appName":"...","appId":"...","rankChange":"..."},...\],...}}  
<Response \[200\]>  
\`\`\`  
  
只要返回 \`code:0\` 并且 \`data.list\` 有数据，就说明 \`analysis\` 算对了。如果返回的是 \`code:-1\` / \`未登录\` / \`签名错误\` 之类，优先怀疑 Cookie 失效或 \`analysis\` 对应的参数不对。  
  
【图3：终端打印出的 analysis 与接口返回数据 —— 建议截图】  
  
\## 七、踩坑与注意  
  
## 踩坑与注意

1\. \*\*\`document\` 必须补。\*\* \`get\_T\` 内部读 \`document.cookie\`，直接 \`execjs.compile\` 会报 \`document is not defined\`。我一开始忘了在文件顶部补 \`global.document\`，折腾半天。  
  
2\. \*\*Cookie 是实时登录态。\*\* \`synct\` 是带时间戳的会话字段，会过期。JS 里那串 Cookie 和 Python 请求头里的必须一致，且都得用你自己登录后的值（仓库里是 \`你的xxx\` 占位符）。Cookie 一失效，\`analysis\` 算得再对也会被拒。  
  
3\. \*\*不要试图逐行人肉还原字符串表。\*\* 混淆器的 \`n(12,13,14,...)\` 取值函数可以靠 AST + 自动化还原，但为了拿一个参数不值当；补环境跑原函数是最快路径。  
  
4\. \*\*\`analysis\` 与参数强绑定。\*\* 一旦把 \`option\` / \`sdate\` 改了，就要重新算 \`analysis\`（本例里 \`get\_T\` 内部写死了 \`option:4\`，换榜单类型要改这里）。  
  
5\. \*\*编码统一 UTF-8。\*\* \`open(..., encoding="utf-8")\` 不能省，Windows 默认 GBK 会读出乱码导致 JS 解析失败。  
  
6\. \*\*频率控制。\*\* 这是需要登录的数据接口，务必低频、遵守站点条款与当地法规。  
  
\## 八、总结  
  
1\. \*\*面对重度混淆的签名，最优解常常不是「还原算法」，而是「补环境执行原函数」\*\*——只补它真正用到的 \`document\` / \`window\` 等几个对象即可。  
2\. \*\*七麦 \`analysis\` 的本质是「参数排序拼串 + 哈希 + 对称加密 + Base64」\*\*，入口就是站点自己导出的 \`get\_analysis\`。  
3\. \*\*\`execjs\` 调 JS 导出函数 + \`requests\` 带登录 Cookie\*\*，是这类「混淆签名」最快落地的组合。  
  
\---  
\>
