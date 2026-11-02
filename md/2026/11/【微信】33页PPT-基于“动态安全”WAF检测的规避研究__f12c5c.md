---
title: 【微信】33页PPT 基于“动态安全”WAF检测的规避研究
source: https://mp.weixin.qq.com/s/pJt3FYmf8Qitx6emrGkZDA
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T12:46:08+08:00
trace_id: 3f537eca-5769-4cd6-80f3-262fb4a1c9f1
content_hash: 3a780d9ea9b3d44dceac9ec91d1f0e87a6f98dd4ddd78774cf3a2df772d0755c
status: synced
tags:
  - 微信
  - 风控对抗
  - 模拟执行
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 不开浏览器也能过动态 WAF 的 JS 挑战：把 WAF 自己的混淆 JS 放进 Node.js 沙箱完整执行，从外部定位检测点并生成有效 Cookie。
ai_summary_style: key-points
images_status:
  total: 21
  succeeded: 21
  failed_urls: []
notion_page_id: 40c75244-d011-81b2-a098-dc1a863ace20
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 不开浏览器也能过动态 WAF 的 JS 挑战：把 WAF 自己的混淆 JS 放进 Node.js 沙箱完整执行，从外部定位检测点并生成有效 Cookie。
> 
> - **核心痛点：** 动态 WAF 的 T Cookie 与当前 TLS session 绑定，Burp/Yakit 抓包重放必定返回 412；curl/requests 无 JS 执行能力只能拿到混淆挑战代码，Selenium 启动慢且暴露 30 多种自动化特征。
> - **技术路线：** 不逆向 296K 混淆代码，让 WAF 的 JS 在 Node.js 虚拟机里完整跑一遍，外部精确控制并观察其检测逻辑；先用 tls_client 模拟 Chrome 131 的 JA3 指纹获取挑战页，再提取脚本、构建浏览器环境、生成 cookie。
> - **分型对抗：** 按三类子型推进——c393 需处理 JSDOM 方案选型、eval 拦截与 AST 补丁；nsd v1 涉及四个环境检测点、native code 伪装、Error.stack 路径泄漏；nsd v2 新增 906 个全局构造函数的 typeof 检测。
> - **方法沉淀：** 总结一套可复用黑盒手段——Proxy 属性追踪、差分测试、CRC32 注入 dump 明文、全局属性数量对比，价值在于"不逆向、让代码自己跑、从外部定位检测点"。
> - **落地工具：** 最终实现 Yakit 可直接挂载的反向代理，自动识别 WAF 类型并续期 Cookie，测试人员只需把目标域名换成 localhost:8787。

**蓝星安全** *2026年11月2日 11:35*

**点击上方蓝星安全关注我**

**获取资料，请扫码下方二维码加入知识星球**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af8fd195e1df1a7f.png)

这是一份关于“如何在不打开浏览器的前提下通过动态 WAF 拦截”的实战研究，源自中国电信大可实验室安全研究员郝东衡的技术分享。从渗透测试中一个高频痛点切入：目标站点的接口被动态 WAF 用 JS 挑战保护着，Burp、Yakit 抓到的包重放必定得到 412，因为包里的 T Cookie 与当前 TLS session 绑定；curl、requests 没有 JS 执行能力，只能拿到一堆混淆的挑战代码；Selenium 又因启动慢，且被识别出 30 多种自动化特征，同样无法通过。作者的思路是只用一个跑 JS 的沙箱环境，而不去逆向 296K 混淆代码；具体做法是让 WAF 自己的 JS 在 Node.js 虚拟机里完整执行一遍，在外部精确控制并观察它究竟在检测什么。全篇按 c393、nsd v1、nsd v2 三类子型层层推进：先用 tls_client 模拟 Chrome 131 的 JA3 指纹获取挑战页，再提取脚本、构建浏览器环境、执行并生成 cookie；针对 c393，作者分别处理 JSDOM 方案选型、eval 拦截与 AST 补丁，针对 nsd 系列，作者则处理四个环境检测点、native code 伪装、Error.stack 路径泄漏，以及 v2 中 906 个全局构造函数的 typeof 检测。文中沉淀了一套可复用的黑盒方法（Proxy 属性追踪、差分测试、CRC32 注入 dump 明文、全局属性数量对比），并最终落地为 Yakit 可直接挂载的反向代理：自动识别 WAF 类型、自动续期 Cookie，测试人员只需把域名换成 localhost:8787。对做攻防对抗和 WAF 产品的人来说，这份材料最大的价值不在于某个 payload，而在于“不逆向、让代码自己跑，从外部定位检测点”这套方法论。完整版文档已上传蓝星安全知识星球，以下是部分内容：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/88eb9202e80b5626.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee759402fa707b6d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aaa0dbc962ac750d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35c3cb3803b1af1b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1db270e6d824d056.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d9d62e8ee2e06454.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eb9bfce8e8f56648.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e35a22b12db6db3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2c9cb9101dd426c7.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/311a0a9a3d89c4c0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e0938772c72901cc.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb1367932765a5ed.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4bfb60ae53054b19.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b4df44ef1fa12e6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6adde2ebc750ddc9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d2310d1f8bbd6f7.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/909f345c2f709aad.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8afaa02ebab4c831.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/79797eb078772634.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d56e6debfcda760c.png)

渗透攻防 · 目录
