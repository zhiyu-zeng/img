---
title: 【微信】【工具学习30】wafw00f：一眼看穿目标网站的 WAF 老底
source: https://mp.weixin.qq.com/s/3VrUirJ7ZND2tPAT1sQd0Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T11:03:25+08:00
trace_id: 8604a39e-a8c0-4c7d-b818-b4ec857604fa
content_hash: e0c2622d85f74baf7220d716d46e2da86694009b2c39e711645d8c1c3e329752
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
notion_page_id: 41375244-d011-8156-af2c-e5e5c4bc16d2
ioc: null
---

**逆熵寻生** *2026年11月9日 09:54*

wafw00f：一眼看穿目标网站的 WAF 老底

渗透测试里有个特别容易被忽略、又特别关键的细节： **动手打之前，得先知道对面有没有 WAF 拦着。** 所谓 WAF（Web Application Firewall，Web 应用防火墙），就是蹲在网站前面的一层"门卫"。你发的攻击请求、恶意 payload，它都会先拦一道。要是上来就莽撞地甩一堆注入、XSS，可能还没碰到真身，就被这一层防得死死的，白忙一场。所以高手动手前都会先侦察一下：对面到底是哪家的 WAF？是什么型号？而这正是 **wafw00f** 的看家本事。

它给自己的定位很简单直接—— **Web 应用防火墙指纹识别工具**。老牌、专一：从 2009 年干到今天，20 多年专注一件事—— **判断目标网站有没有被 WAF 保护，以及是哪一款**。

它是靠什么"认出"WAF 的

wafw00f 用的是三层递进的探测逻辑，一层比一层扎得深：

第一层，先发一个 **完全正常** 的 HTTP 请求，看响应有什么异样。很多 WAF 会在响应头、cookie、返回体里留下自己的指纹——比如 Cloudflare 的 `cf-ray` 请求头、某些 WAF 特有的 cookie 名，这些一看就能对上号。

第二层，如果正常请求没露馅，它就换一批 **带"恶意味"的请求**——注入、检测型 payload 之类，用简单的逻辑去推理。因为很多 WAF 的规矩是"平时不吭声，一遇攻击就跳出来拦"，你一探它一试，它就露了。

第三层，要是前两种都没结果，它就把之前所有响应 **放一起综合分析**，用一套简单算法猜——这站点到底有没有安全措施在背后默默响应。

靠这三板斧，它把探测结果做成两个答案之一：要么明确告诉你"这站点被某某 WAF 挡着"，要么告诉你"没检测到 WAF"。

它认识多少种 WAF

这是 wafw00f 最厚实的地方。它内置了 **80 多款常见 WAF 的指纹库**，基本市面上叫得上号的都在里面。想看完整清单，一行命令：

wafw00f -l

列出的一长串覆盖了各路豪强——国外的 Cloudflare、AWS 的 WAF、Sucuri、Imperva、F5、Fortinet 的 FortiWeb、Barracuda；国内的对口也不少：阿里云的 AliYunDun、腾讯的 Qcloud、百度云加速 Yunjiasu、360 的 360WangZhanBao、知道创宇的 Yundun、雷池 Safeline 也在列。还有一大票开源玩家：ModSecurity（OWASP 系）、NAXSI、Varnish 等。可以说，你日常能碰到的 WAF，它基本都收了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ff57838cc4bb47b5.jpg)

用法简单到不像话

它用起来就一个动作——把目标丢给它：

wafw00f example.com

敲完它就开始探测，最后甩给你一句干净利落的结论：

\[\*\] Checking example.com  
\[+\] The site example.com is behind Cloudflare WAF.  
\[~\] Number of requests: 2

看到没，两行就交代完了：目标站点被 **Cloudflare** 挡着，而且它自己只发了 2 个请求。快、准、动静小，非常符合渗透侦察"少暴露"的调性。

它还有个很有价值的参数， **`--find`**。很多网站其实是套了 CDN 或反代在外面，把真实源站给藏起来了。用 `--find` 它不光帮你识别外面的 WAF，还会尝试顺着 CDN 背后把真实源站 IP 也翻出来。这对渗透来说价值很大——正面被别人 WAF 和 CDN 护得死死的，但真实源站一旦暴露，往往就是直捣黄龙的口子。

它在渗透链路里的位置

对渗透测试来说，wafw00f 填的是"动手前的知底"：知道对面是 Cloudflare 还是 ModSecurity，直接决定了后面用什么思路切入——有些攻击手法专门就是针对某款 WAF 的绕过方式，选对了工具和方法，命中率完全不一样；反过来要是一次次试探都撞在 WAF 的拦截上报错，那基本是瞎耗。它 2 个请求就给出答案，成本极低，但省下的全是后面的弯路。

对正在搭 Hermes 这种自动化渗透系统的人来说，wafw00f 是自动化链路里很好用的"判官"：扫描流程开始前先让它探一遍目标，把"有没有 WAF、是哪种"的结果喂给下游判定逻辑，程序就知道后面要不要挂上 WAF 绕过模块、用哪套 payload 策略。这个探路动作不值得人工一点点看，交给脚本一键完成正合适。

**蓝队视角同样有用。** 反过来想，攻击者用 wafw00f 一眼就能认出你的防护型号，那针对性的绕过思路自然也就有了。所以做防护时，光挂一个 WAF 不够，还要学会"藏"：隐藏 WAF 的特征头、给指纹加混淆、别让对方轻易数出请求规律，让对手猜不透你到底有几层防护，防守的含金量就上来了。

最后

工具下载地址：https://github.com/EnableSecurity/wafw00f

wafw00f 的厉害，在于它把"探测响应特征"这件事做到极致，还坚持了二十多年不动摇。它不负责打，只负责让你在动手前把对面的防护底细摸清楚——知道自己要绕的墙是哪一堵，后面每一步才有章法。

最后照例说规矩：扫描目标必须是你有权测试的对象——自己的资产、授权的项目、CTF 靶场。对他人系统做未授权探测，不管用什么工具，都是越线。工具再顺手，也得先分清哪条线能动、哪条线不能碰。

🎯 关注我，持续不断地成长！

渗透测试工具推荐 · 目录
