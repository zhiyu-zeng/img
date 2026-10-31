---
title: 【微信】空 token 绕过登录直达 root：拆 KUNBUS Revolution Pi 工业 PLC 四条 CVE
source: https://mp.weixin.qq.com/s/TxLqk_TGuTWlwcTcFmn8Lg
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T09:41:10+08:00
trace_id: 9862f427-611f-4b28-ba9a-d76364f7ea4a
content_hash: c97eef091ba79b1576d0d47492b64d4749f5a3019fff485c10e0f577f0742da8
status: synced
tags:
  - 微信
  - 漏洞分析
  - 工控安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: KUNBUS Revolution Pi 工业 PLC 被静态分析公开固件挖出四条 CVE，未认证远程攻击可从登录绕过一路打到系统 root，全程无需购买设备。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 40a75244-d011-812b-93de-e372177601a9
ioc:
  cves:
    - CVE-2025-24522
    - CVE-2025-32011
    - CVE-2025-35996
    - CVE-2025-36558
    - CVE-2026-31077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> KUNBUS Revolution Pi 工业 PLC 被静态分析公开固件挖出四条 CVE，未认证远程攻击可从登录绕过一路打到系统 root，全程无需购买设备。
> 
> - **零鉴权入口：** CVE-2025-24522，Node-RED（TCP 41880）出厂镜像未配置任何认证，攻击者可直接以 `nodered` 用户建 flow 执行任意系统命令，CVSS 10.0/9.3，Critical。
> - **空 token 登录绕过：** CVE-2025-32011，`sso_login.php` 把 `sso_token` 直接拼路径后用 `file_exists()` 校验，留空即拼出永远存在的 SSO 目录，未带任何合法令牌即建立会话，CVSS 9.8/9.3。
> - **XSS 借站提权：** CVE-2025-35996 存储型 XSS 藏在文件名里（`getFileList.php` 无输出编码），Cookie 无 `HttpOnly`；因 PiCtory 与 Cockpit 同站同端口（41443），脚本可带 Cockpit 会话经 WebSocket 以 root spawn 命令、反弹 shell。
> - **反射型 XSS：** CVE-2025-36558，token 不存在时服务端原样回显未转义，需诱导点击，CVSS 6.1/5.1，Medium。
> - **修复与披露：** 给 Node-RED 配置密码或关闭、PiCtory 升级到 2.12（影响 2.5.0–2.11.1 及 01/2025 固件）；经 CISA 协同披露，90 天内修复并发布 ICSA-25-121-01。

**黑卷的IoT攻防日记** *2026年10月31日 09:08*

工厂车间最底层那排 PLC，很多人以为它只会闷头读传感器、拨继电器，离「被远程打穿」很远。Pen Test Partners 的 Adam Bromiley 这次挑了德国 KUNBUS 的 Revolution Pi——一台「能跑完整 Linux 的工业 PLC」——结果从网络可达一路挖到操作系统 root，四条 CVE 串成一条高速路。

更扎心的是：这四个洞全是靠 **静态分析公开固件** 找出来的，连设备都没买，直接把固件装进一台普通树莓派就复现了。

![一边喊「让我进去」，一边直接绕过鉴权——Revolution Pi 这次中招的四条 CVE](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/097dee188bf60b76.png)

Revolution Pi 的特别之处在于：文档公开、固件可下载、还鼓励用户在 OS 层自定义。好处是透明、长期更安全；代价是攻击者也能像读源码一样审计它。这次拿到的就是 2025 年 01 月（250124）那版固件。

![从网络可达到 root：两条未认证入口 + 一次借刀杀人](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cca90df2d716a786.png)

## 一、目标：一台「能跑 Linux 的 PLC」

Revolution Pi 坐在工业网络最底层，用简单 I/O 和现场总线去控阀门、驱动器，监视工艺过程。它基于树莓派计算模块，套上导轨外壳、24V 供电、双千兆网口，符合 PLC 标准 EN 61131-2——装进配电柜里就像一台 PLC，而不是藏在盒子里的小电脑。

配置这台设备主要靠两个网页界面： **PiCtory** （配置数字 I/O 和扩展模块）和 **Node-RED** （流程化可视编程控制 I/O）。这次四条洞，三条出在 PiCtory，一条出在 Node-RED。

![PiCtory 2.11.1 的配置界面：左边设备目录，中间是 RevPi Core / DIO / AIO 与 Profinet 网关模块](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/04071474078342d0.png)

## 二、第一条路：Node-RED 默认根本不设密码

Node-RED 跑在 TCP 41880 端口。它本身支持鉴权，但 Revolution Pi 的出厂镜像 **没有配置任何认证**，文档里也没有提示或警告。

于是一个未认证的远程攻击者，等于直接拿到了 Node-RED 的管理员权限：不光能改 I/O 引脚，还能建一个 flow 以 `nodered` 用户身份执行任意操作系统命令。这就是 **CVE-2025-24522**，CVSS 打到 10.0（v3.1）/ 9.3（v4.0），Critical。

![Node-RED 的 flow + debug：以 nodered 用户身份打印出完整进程环境，等于已能任意执行命令](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e35acaa9210b2b3.png)

对一台控制现场设备的 PLC 来说，这一条已经足够：改 I/O 就能干扰生产，甚至带来安全或财务风险。但真正精彩的是另一条——PiCtory 这边。

![攻击面坐标：两个端口、四条 CVE、90 天披露](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/255bc8b684cc4377.png)

## 三、一个空 token 绕过整个登录

PiCtory 不让用户直接访问，而是要从 Cockpit 管理服务「单点登录」进来。流程是这样的：

-   用户登录 Cockpit；
    
-   请求访问 PiCtory，Cockpit 生成一个一次性 token 文件，名字是随机 UUID，放在 `/run/cockpit-revpi-pictory-sso/` 下；
    
-   用户带着这个 UUID 跳到 `php/sso_login.php?sso_token=UUID` ；
    
-   PHP 侧用 `file_exists()` 判断这个 token 文件在不在，在就建会话、放行。
    

问题出在第四步。 `sso_login.php` 是这么拼路径的：把 `sso_token` 直接接到目录后面， **不做任何校验**：

```bash
$sso_token = $_GET['sso_token']; $sso_token_directory = "/run/cockpit-revpi-pictory-sso"; $sso_file_path = $sso_token_directory . "/" . $sso_token; if (!file_exists($sso_file_path)) { http_response_code(401); ... }
```

那如果我把 `sso_token` 留空呢？拼出来就是目录本身 `/run/cockpit-revpi-pictory-sso/` ——这个目录永远存在， `file_exists()` 永远返回真。于是不需要任何合法令牌，直接被标记为 `sso_logged_in=true` ，会话建好，登录完成。

![空 sso\_token 绕过认证：直接 302 跳进 PiCtory，弹窗证明已拿到会话](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4fadb1d883b0b5fe.png)

实测很直白：填一个不存在的 token 回 401， `sso_token=` 留空反而回 302 跳转、带上会话 Cookie 登录成功。这就是 **CVE-2025-32011**，路径穿越导致认证绕过，CVSS 9.8 / 9.3，Critical。拿到 PiCtory 就等于拿到了对 I/O 端子和扩展模块的控制权。

![为什么一个空字符串就能顶开整扇门](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f563281abec1619f.png)

顺带一提，这个拼路径的 `sso_token` 还能填 `../../var/www/revpi/pictory/` 这类别的已存在路径；校验完还会 `unlink()` 删掉 token 文件，于是又多出一个任意文件删除的副作用。只是 PHP 的 `open_basedir` 把可访问范围限制在了几个固定目录，没能进一步放大成任意文件读。

## 四、把 XSS 塞进文件名

绕过登录只是拿到了 PiCtory 的权限，还没到 root。接力的是 **CVE-2025-35996**——一个藏在文件名里的存储型 XSS。

PiCtory 有个功能，会把 `export/` 、 `projects/` 目录下的配置文件列出来给用户看，而用户可以往前两个目录上传文件。列文件的 `getFileList.php` 直接把文件名 echo 出去， **不做任何输出编码**：

```php
foreach($result as $r)   if (file_exists($r))     echo substr($r,2).",".date("Y|m|d|H|i|s", filemtime($r)).";";
```

于是攻击者造一个文件名里带 HTML 标签的工程文件，比如 `<img onerror="alert(document.domain)" src=x>.rsc` ，列表一渲染，这段标签就被浏览器当代码执行了。

![文件名里的 <code><img onerror=...></code> 被原样当 HTML 渲染](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f63cba0630615f73.png)

两个会话 Cookie 都没设 `HttpOnly` ，所以脚本能直接读出来外带给攻击者，完成会话劫持。文件名里不能带正斜杠，就用 `eval(atob('base64'))` 把真正的大段脚本 Base64 编码塞进去，当跳板去加载远程的 `xss.js` 。

![文件名里塞进 Base64 编码的 <code>eval(atob(...))</code> 载荷，绕开斜杠限制](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/821900014314813b.png) ![把脚本藏进文件名，再借同站会话跨到 root](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a56e020991012bb1.png)

## 五、顺着同站 Cockpit 打到 root

真正的放大器，是 PiCtory 和 Cockpit **跑在同一个站点**、只是路径不同：PiCtory 在 `/pictory/` ，Cockpit 在根 `/` ，端口都是 41443。

这意味着在 PiCtory 里执行的 XSS 脚本，能带着 **Cockpit 的会话 Cookie** 去发请求。而 Cockpit 允许以 root 身份跑命令——于是这段网页脚本，直接就能在操作系统上执行代码。

远程 `xss.js` 会向 `wss://revpi.local:41443/cockpit-revpi/cockpit/socket` 发起一个 WebSocket，带上 `superuser:try` 去 spawn 命令。演示里先跑 `id` 和 `cat /etc/shadow` 证明已是 root，再直接 spawn 一个反弹 shell 回攻击者。

![借 Cockpit 会话跑命令：uid=0(root)，cat /etc/shadow，并反弹一个 root shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/86c43e1415c3b7b1.png)

至此，从「登录页填个空 token」到「一个 root 交互 shell」，整条链闭合。攻击者能完全控制 PLC 的数字 I/O 和扩展模块，干扰工艺、制造安全或财务后果。

![四条 CVE 一览：两条 Critical 未认证，一条 High，一条 Medium](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/947c1299d720234e.png)

## 六、还有一条反射型 XSS

第四条是 **CVE-2025-36558**，反射型 XSS。同样出在 `sso_login.php` ：当 token 不存在时，服务端会把这个 token 原样回显在响应里（ `No SSO file found for token ...`），同样没做 HTML 转义。

于是构造一个 `sso_token=<script>alert(document.domain)</script>` 的链接，诱导管理员在连着工控网时点开，就能在其浏览器里执行脚本，偷 PiCtory 或 Cockpit 会话。只是它要靠「骗人点链接 + 当时正好连着控制网」，利用门槛比前面几条高，CVSS 6.1 / 5.1，Medium。

![反射型 XSS：token 原样回显，<code><script></code> 直接在浏览器里弹窗](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f7ee237c2831db7d.png)

## 七、怎么修、以及这次披露

厂商的修法并不复杂：

-   **Node-RED**
    
    ：在 `settings.js` 里给它配上用户名密码；用不到就直接关掉。
    
-   **PiCtory**
    
    ：升级到 2.12（ `apt update && apt upgrade` ），也会随下一版完整镜像（04/2025）发出。受影响范围是 PiCtory 2.5.0–2.11.1、Revolution Pi OS 01/2025（250124）及更早。
    
-   **老规矩**
    
    ：工控环境按 ISA/IEC 62443、Purdue 模型做好分区——如果坏人已经能摸到你的 PLC，本身就该拉警报了。
    

披露方面，因为涉及 ICS 设备，PTP 和 CISA、KUNBUS 的 PSIRT 走了协同披露：2025-02-21 首次联系，中间因为 KUNBUS 没有 VINCE 账号、CISA 联系邮箱填错等小插曲有些波折，但整体在 90 天内完成修复，CISA 发了 ICSA-25-121-01，四个 CVE 同步公开。

## 黑卷点评

Revolution Pi 这一仗，打的不是什么精巧的内存漏洞，而是把工控设备上两类「结构性毛病」钉得很清楚。

-   **默认不设防，是第一道本不该开的门**
    
    。Node-RED 出厂零鉴权、还没任何提示，等于把一个能跑系统命令的管理面直接挂在网上。工业设备的「开箱即用」，常常是以「开箱即不设防」为代价。
    
-   **用 `file_exists` 当认证，是把「有没有」错当成「对不对」**
    
    。一个空字符串就把整扇登录门顶开——这类逻辑错误在 Web 里不新鲜，但长到工控设备上，后果直接落到物理世界的阀门和继电器。
    
-   **管理面挤在同一个站点，是最被低估的放大器**

公开文档、公开固件是把双刃剑：它让防守方能持续审计、长期更安全，也让攻击者能像读源码一样找洞。真正决定胜负的，还是出厂那一刻——鉴权有没有默认开、会话域有没有隔开、输出有没有转义。藏在配电柜最底层的那台小橙盒子，值得被当成真正的攻击面来对待。

![真正要命的是缺省与同站](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2b24bc008c1335b6.png)

* * *

⚠️  
本人所有文章均为技术分享，均用于防御为目的的记录，请勿用于其他用途，否则后果自负。

![星球「黑卷的IoT攻防日记」](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/74bd9299db9f7113.jpg)

👇 扫码进星球「黑卷的IoT攻防日记」· 🎟 早鸟价 ¥98/年

**往期推荐**

-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
    
-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485429&idx=1&sn=5a4cdfd6982657765522258b8310892d&scene=21#wechat_redirect)
    
-   [从 UART 焊到未认证后门：ANJIA PTZ 摄像头（CVE-2026-31077）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486026&idx=1&sn=3786d4d0ca929f9d35b3913c6a6d6c1a&scene=21#wechat_redirect)
