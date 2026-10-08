---
title: 【微信】一键获取目标网站的源代码信息、网络数据包（HAR）、页面快照与媒体资源，方便进行逆向、二次开发与安全分析
source: https://mp.weixin.qq.com/s/vhVPHbGf7oXTAMlJweb3nQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T07:49:44+08:00
trace_id: b5cdf691-1748-4f10-876a-0bdb9996d890
content_hash: 16f76a68692a5b9881af4c13265a2d9cd4e10cdee757ce0f728bce869f2ead1c
status: synced
tags:
  - 微信
  - 安全工具
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: GetSourceCode 是一款基于 Chrome DevTools Protocol 的桌面工具，一次点击即可抓取目标网站的源码资源、HAR 数据包、页面快照与媒体资源，替代手动 F12 逐条另存。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f375244-d011-81c6-b8ea-d91934741090
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> GetSourceCode 是一款基于 Chrome DevTools Protocol 的桌面工具，一次点击即可抓取目标网站的源码资源、HAR 数据包、页面快照与媒体资源，替代手动 F12 逐条另存。
> 
> - **核心产出：** JS/CSS/字体/WASM 按原始目录结构存入 `source/<host>/…`；HAR 符合 1.2 规范且含响应体，可直接拖入 DevTools Network、Charles、Fiddler、Postman；快照保存 JS 执行后的真实 DOM。
> - **反检测取舍：** 通过移除可被页面检测的 `Runtime.enable`、强制关闭无头模式、等待挑战自然通过来提升过盾率，明确不做指纹伪造；能识别 `jsd`/`managed`/`turnstile`/`block` 挑战，失败时如实告知并给出换出口 IP、关无头、增大等待、手动登录等建议。
> - **可追溯性：** 过盾结果写入 `metadata.json` 的 `cf` 字段，含 `attempts` 尝试记录与 `nextSteps` 建议。
> - **登录态安全边界：** 使用 `userDataDir/profiles/<name>` 独立 profile，不读写日常浏览器数据；先开登录窗口登录一次，后续抓取自动携带登录态。
> - **浏览器与部署：** 来源支持系统 Chrome/Edge/Brave、内置浏览器（按需下载 Chrome for Testing，约 115–196MB，国内镜像自动回退）、自定义路径；提供免安装 exe，也可 `git clone` 后 `npm install && npm start`，`npm run build` 产物在 `dist/`。

**夜组安全** *2026年10月9日 07:30*

由于传播、利用本公众号夜组安全所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，公众号夜组安全及作者不为此承担任何责任，一旦造成后果请自行承担！如有侵权烦请告知，我们会立即删除并致歉。谢谢！ **所有工具安全性自测！！！VX：** **NightCTI**

朋友们现在只对常读和星标的公众号才展示大图推送，建议大家把 **夜组安全** “ **设为星标** ”，否则可能就看不到了啦！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ef3de906fd21ae79.png)

## 工具介绍

> 一键获取目标网站的 **源代码信息**、 **网络数据包（HAR）**、 **页面快照** 与 **媒体资源**，方便进行逆向、二次开发与安全分析。 基于 **Chrome DevTools Protocol (CDP)**—— 让开发者不再需要手动 F12 逐条另存。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f76c7cf8697ab5fa.png)

## 为什么需要它

逆向分析、安全测试、竞品研究时，我们常常要：

-   打开 F12 → Network → 逐个资源「Open in new tab → 另存为」 ❌ 低效
    
-   想保留下载后的 JS/CSS 目录结构 ❌ 手动重建
    
-   想保存完整请求/响应记录 ❌ 只能截图
    
-   想看 JS 执行后的真实 DOM ❌ 右键「查看源代码」拿不到
    

**GetSourceCode 把这些变成一次点击。**

## 功能特性

| 能力  | 说明  |
| --- | --- |
| **源码资源抓取** | JS / CSS / 字体 / WASM，按 **原始目录结构** 保存到 `source/<host>/…` |
| **HAR 网络数据包** | 符合 HAR 1.2 规范， **含响应体** （ `content.text` ），可直接拖入 Chrome DevTools Network 面板、Charles、Fiddler、Postman |
| **页面快照** | 保存 **JS 执行后** 的完整 DOM（非原始 HTML）+ 标题等元信息 |
| **媒体资源** | 图片 / 视频 / 音频，按需开启（体积较大） |
| **懒加载触发** | 自动检测页面高度是否停止增长；可选「滚动到底部」或「按比例逐屏」两种模式，分步滚动避免漏触发 |
| **并发任务捕获** | 监听整个页面生命周期，包括 XHR/Fetch 异步请求 |
| **Cloudflare 过盾** | 自动检测人机验证并尝试通过（jsd / managed / Turnstile），失败时明确告知而非假装成功 |
| **浏览器来源可选** | ① 系统已装 Chrome/Edge ② **内置浏览器** （无浏览器时自动下载）③ 自定义路径 |
| **登录态抓取** | 专用持久 profile，引导登录一次后可抓需登录的网站（**不碰你的日常浏览器数据**） |
| **可视化界面** | 实时进度、文件列表、目录树、日志 |
| **跨平台** | Windows / macOS / Linux，自动探测浏览器 |

### Cloudflare 过盾

部分站点会弹出 Cloudflare 人机验证。勾选「自动检测并尝试通过」后：

1.  工具识别挑战类型（ `jsd` / `managed` / `turnstile` / `block` ）
    
2.  非交互式挑战 **等待其自动通过**；Turnstile 可选键盘导航触发
    
3.  通过后继续正常抓取； **未通过则明确告知**，并给出建议（关闭无头 / 更换网络出口 / 手动介入）
    

**注意事项**：

-   开启过盾时会 **自动关闭「无头模式」**——无头浏览器更容易被识别
    
-   建议仅用于 **自有站点或已授权测试** 的目标
    
-   Cloudflare 是持续对抗的， **不承诺 100% 通过**
    
-   **过盾失败时会明确告知并给出可操作的处置建议** （按挑战类型区分： 换出口 IP / 关闭无头 / 增大等待 / 手动登录一次），绝不假装成功
    
-   过盾结果记录在 `metadata.json` 的 `cf` 字段（含 `attempts` 尝试记录与 `nextSteps` 建议），便于追溯
    

> 工具通过移除 `Runtime.enable` （该命令可被页面检测出自动化， `rebrowser-patches` 实证 Cloudflare/DataDome 在用）、 强制非无头、等待挑战自然通过等方式提升通过率， **不做指纹伪造**。

### 浏览器来源说明

| 来源  | 适用场景 | 说明  |
| --- | --- | --- |
| **系统浏览器** | 大多数情况 | 复用已安装的 Chrome / Edge / Brave，零下载 |
| **内置浏览器** | 未安装浏览器 | 从官方 CDN 或 **国内镜像** 按需下载 Chrome for Testing（约 115–196MB），缓存复用 |
| **自定义路径** | 特殊需求 | 手动指定任意 Chromium 内核浏览器 |

> 下载源支持 **国内镜像自动回退** （ `registry.npmmirror.com` ↔ `storage.googleapis.com` ）。

### 登录态抓取（需登录的网站）

**推荐流程** （安全、不污染你的数据）：

1.  Profile 模式切到「**持久**」，填入 profile 名称（如 `work` ）
    
2.  点「**打开登录窗口**」→ 在弹出浏览器里登录目标站点
    
3.  关闭登录窗口（登录态已保存到工具专用 profile）
    
4.  开始抓取 → 自动带上登录态
    

**原理与安全边界** （经实测验证）：

-   工具使用 `userDataDir/profiles/<name>` 作为 **独立 profile**， **绝不** 读写你日常 Chrome 的 profile
    

## 快速开始

### 方式一：下载免安装版（推荐）

从 Releases 下载：

-   `GetSourceCode-x.x.x-portable.exe` —— 免安装，双击即用
    
-   `GetSourceCode-Setup-x.x.x.exe` —— 安装版（含开始菜单 / 桌面快捷方式）
    

### 方式二：从源码运行

```bash
git clone https://github.com/lza6/Get-source-code.git
cd Get-source-code
npm install
npm start
```

### 方式三：自行打包

```bash
npm run build            # 生成安装版 + 免安装版
npm run build:portable   # 仅免安装版
```

产物位于 `dist/` 。

## 使用步骤

1.  **填写目标网址** （如 `https://example.com` ）
    
2.  **选择保存目录**
    
3.  **勾选抓取内容** （源码 / HAR / 快照 / 媒体）
    
4.  （可选）调整高级选项：无头模式、滚动次数、超时、单文件上限
    
5.  点击 **开始抓取**
    

## 工具获取

点击关注下方名片进入公众号

回复关键字【261009】获取下载链接

## 往期精彩

往期推荐

[](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497801&idx=1&sn=ac34ceb80f349b41ad189d04dfbe4dc0&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/23cb00bf164247fc.webp)

[一个 AI 驱动的安全研究工作台，面向 CTF、渗透测试、红队行动、逆向分析、Pwn、IoT/车联网研究和恶意样本分析](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497801&idx=1&sn=ac34ceb80f349b41ad189d04dfbe4dc0&scene=21#wechat_redirect)

[](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497796&idx=1&sn=3c7fb90b46b16ea97fc57eeee1c73f48&scene=21#wechat_redirect)

[应急响应流量分析工具，支持pcap、excel、log等多种数据源，同时结合加解密、反编译等多个工作流](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497796&idx=1&sn=3c7fb90b46b16ea97fc57eeee1c73f48&scene=21#wechat_redirect)

[](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497778&idx=1&sn=1663ea7a47eb13f7922cf01ad7298a70&scene=21#wechat_redirect)

[AISentinel · 大模型安全评测与 AI 内容鉴别平台](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497778&idx=1&sn=1663ea7a47eb13f7922cf01ad7298a70&scene=21#wechat_redirect)

[](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497777&idx=1&sn=26135255b6013b13f571d882e7b34e63&scene=21#wechat_redirect)

[企业关键系统失陷狩猎图谱 | 一款完全离线、单 HTML、自包含的调查规划与失陷痕迹狩猎工具](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497777&idx=1&sn=26135255b6013b13f571d882e7b34e63&scene=21#wechat_redirect)

[](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497753&idx=1&sn=d4409b83bd10e2a9452020ab3141dd68&scene=21#wechat_redirect)

[智能漏洞挖掘工作台：静态分析 → 模糊测试（AFL++）→ 崩溃分析 → CNVD 报告闭环](https://mp.weixin.qq.com/s?__biz=Mzk0ODM0NDIxNQ==&mid=2247497753&idx=1&sn=d4409b83bd10e2a9452020ab3141dd68&scene=21#wechat_redirect)

信息收集 · 目录
