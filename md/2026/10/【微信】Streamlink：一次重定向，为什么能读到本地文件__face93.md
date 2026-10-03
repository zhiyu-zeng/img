---
title: 【微信】Streamlink：一次重定向，为什么能读到本地文件
source: https://mp.weixin.qq.com/s/J4aEi0dDpFUYwCd9kmodkQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-03T10:06:54+08:00
trace_id: 8934b471-661b-4905-9d7d-b6b93a354d87
content_hash: a9a651959f4257abdddcbe69d2865e4b3d082c7f076f99580041b8b725627052
status: synced
tags:
  - 微信
  - 漏洞分析
  - 网络工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Streamlink 8.5.0 的 HTTPSession 跟随重定向时不校验目标协议，可被 302 跳到 `file://` 读取本地文件（CVE-2026-92164），8.6.0 已修复。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ee75244-d011-81a4-82ca-ce3720bc7f68
ioc:
  cves:
    - CVE-2026-92164
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Streamlink 8.5.0 的 HTTPSession 跟随重定向时不校验目标协议，可被 302 跳到 `file://` 读取本地文件（CVE-2026-92164），8.6.0 已修复。
> 
> - **漏洞形态：** 协议白名单只校验初始 URL，未校验重定向后的每一跳；HTTP 客户端自动跟随跳转，`file://` 由本地 urllib 处理器打开，请求远程播放列表变成读本地文件。
> - **实测结果：** 恶意源站返回 302 指向 `file:///…/secret.txt`，Streamlink 8.5.0 最终 URL 变为 `file://` 开头，状态码 200，响应体即凭据原文（如 CLOUD_STREAM_TOKEN、CDN_SIGNING_KEY）。
> - **修复位置：** 8.6.0 在 HTTPSession 重定向前置检查中拦截，报 `Disallowed redirection to file:// URL from http://…`；放在会话层可覆盖所有插件与调用路径，无需各功能重复实现。
> - **SSRF 治理五条：** 每一跳校验协议白名单（仅 http/https，禁 file/gopher/dict）；限制重定向次数并记录目标；解析后校验实际 IP，拦截回环、私网与 `169.254.169.254`；无需出网就关闭出口；收敛下载目录与媒体库路径权限。
> - **排查快捷键：** 搜索 `allow_redirects`、`follow_redirects`、`max_redirects` 及自实现的跳转循环，确认每处打开重定向的代码旁都有目标 URL 校验，并覆盖 301/302/303/307/308 与跨协议跳转。

**云梦安全** *2026年10月3日 09:00*

2026 年 9 月 24 日，Streamlink 披露 GHSA-vf2x-4v53-pm7v（CVE-2026-92164，中危）：HTTPSession 在跟随 HTTP 重定向时没有校验目标 URL 的协议，可以被跳到 file://，把本地文件当响应体读出来。Streamlink 是流媒体下载与播放工具，常被部署在下载器、媒体服务器和自动化脚本里——这些机器上通常有媒体库路径、CDN 签名密钥和云存储凭据。

这类问题的形态在基础设施中非常常见：协议白名单只校验了初始 URL，没有校验每一跳。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b8dd6ad9754c91c0.png)

## 实验：本机起一个恶意源站

隔离环境里写了一个最小的恶意源站 evilsrv.py，监听 127.0.0.1:8099。它只有一个路由 /playlist.m3u8，对任何请求都回 302，Location 指向 file:///…/\_lab/07_streamlink/secret.txt。目标文件里放了三行模拟凭据：CLOUD_STREAM_TOKEN=sl-live-…、CDN_SIGNING_KEY=…。

在 Streamlink 8.5.0 上发起请求：初始 URL 是合法的 http://127.0.0.1:8099/playlist.m3u8，但脚本打印的“最终 URL”已经变成 file:// 开头；unquote 解码后可以看到完整的本地路径；HTTP 状态码 200，Content-Type 为 None，响应正文就是那三行凭据原文。脚本最后的判定行写着“远程重定向成功读取本地文件，敏感内容随响应体返回”。

这条链路里没有任何复杂技巧：HTTP 客户端自己跟随了重定向，而 file:// 由本地的 urllib 处理器负责打开，于是“取一个远程播放列表”就变成了“读一个本地文件”。

## 8.6.0 的修复：把校验放在跟随之前

升级到 8.6.0 后，同一个请求直接失败：PluginError: Unable to open URL: … (Disallowed redirection to file:// URL from http://127.0.0.1:8099/playlist.m3u8)。异常信息把来源 URL 和被拒的目标协议都写清楚了，便于排查。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5fbe738768c4f821.png)

值得留意的是修复的位置：它发生在 HTTPSession 的重定向前置检查里，而不是在某个插件内部做条件判断。这个位置选择是对的——所有插件、所有调用路径都共用这一个会话对象，校验放对了地方，就不需要每个功能各自实现一遍，也不会漏掉其中一个。

## 把它当成 SSRF 来治

只要是“用户或第三方给出的 URL，由服务端去取”的功能，都应该按服务端请求伪造来对待。落到实现上至少有五条：协议白名单必须在每一跳校验，只允许 http/https，显式禁止 file、gopher、dict 等；重定向次数设上限，并记录每一次跳转的目标；解析域名后校验实际 IP，拦截回环、私网网段与云元数据地址（169.254.169.254）；不需要出网的功能直接把出口关掉，而不是只在代码里做判断；对下载目录与媒体库挂载路径做权限收敛，不要给运行用户整盘可读。

Streamlink 这类工具往往以有媒体库和对象存储凭据的账号运行，读到的不只是“一个文件”。所以复测时建议顺手做一次“进程可读文件”的核查，而不只是验证漏洞请求被拒绝。

## 复测清单

升级后确认三件事：恶意源站的 file:// 重定向被拒绝；正常的 http → https 重定向仍能跟随，别把订阅源和 CDN 跳转一起挡掉；被读过的敏感凭据已经轮换，尤其是实验里出现过的流媒体 Token 与签名密钥。

## 同一类问题在别处的样子

“跟随重定向时忘了重新校验”不是 Streamlink 独有的实现细节，而是一类非常常见的失误：只在入口处做一次 URL 校验，之后就交给底层 HTTP 客户端自己处理跳转。凡是把协议、主机或路径白名单写在校验函数里的代码，都要回头确认这个校验在每一跳都执行了一遍——包括 301、302、303、307、308 这些不同的状态码，以及跨协议的跳转。

排查时有个捷径：搜代码里 allow_redirects、follow_redirects、max_redirects 这类开关，以及自己实现的跳转循环。每一个打开重定向的地方，都应该紧邻一段“校验目标 URL”的逻辑；如果只有入口处有校验，那里就是同类问题的候选点。

## 一句话总结

“我只允许 http 和 https”这句话，只有在每一次跳转后都再说一遍，才算数。
