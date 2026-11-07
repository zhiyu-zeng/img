---
title: 【微信】免费开源，安卓神器！无需 Root，让 AI Agent 帮你操作App、淘宝购物、小红书查攻略、携程订票、美团点外卖、发消息、订闹钟
source: https://mp.weixin.qq.com/s/j6N3EhHNRP8OR2rq5I9K5w
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:29:59+08:00
trace_id: 62d9ddca-8426-4cec-9697-783fd46fa584
content_hash: b18aec4abd6d52160a827aba0faa3c6de5e8f1725a528c06db248858cb35d543
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41175244-d011-8107-9679-da3f9fae9bf2
ioc: null
---

**IoT物联网技术** *2026年11月6日 18:27*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0e3dc73cc8730ce3.jpg)

> 适配Android手机、无需 Root、内置Web浏览器

Mika 是一款免费开源的安卓手机AI Agent 应用，可接入 DeepSeek、Qwen、豆包、Kimi等大语言模型，无需 root 权限，只需下载安装APK，就能在后台操作手机 App：打开微信整理聊天记录、刷网页收集资料、搜索商品，甚至执行定时任务。

Mika 会记住你说过的话，使用偏好；办成的事自动总结成技能，下次更快更稳。

Mika 有独立后台屏幕，AI 干活时你依然能正常玩手机！

Mika 功能清单

操作 App ：读长列表和聊天记录、点击输入、分享文字进 App；登录、验证码、付款请你接管

操作浏览器：内置浏览器，登录状态保留，能读页面、下载上传；翻页有节奏，遇到拦截交给你

屏幕记忆：双击悬浮胶囊，把你正在看的这一屏发给 Mika：「这个怎么回」「帮我记下来」

定时触发：「明早 9 点提醒我」「每周五做某件事」，到点会在原对话里执行

随时插话、随时停：任务进行中继续说话补充要求，还没处理的可以长按撤回或修改；停下后交代做到哪了，说「继续」接着做

按住说话：输入框按住说话，字填进框里改了再发；悬浮胶囊长按说话，松开直接发出。用手机自带的语音识别，没有时可选服务商的语音模型

文件与计算：每个对话一个 Linux 沙箱，跑 Python、Node 和 shell，处理你发来的文件

远程操控：电脑端的 AI 工具通过 CLI + Skill 或 MCP 给手机端 Mika 派任务

Mika安装过程

1.下载安装：从 Github项目的 Releases 下载 APK。

2.配置模型：设置 › 模型，选一家服务商填 API Key，或者直接用账号登录。

3.要操作手机 App 时：按设置里「设置手机操作」的向导，在手机上配对一次无线调试。只聊天、上网、处理文件可以跳过这一步。

Mika 功能演示

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c4bb3f279b1d0895.png)

Mika 与曾经引爆舆论的豆包手机从操作系统底层访问App不同，它会像普通人一样看屏幕、找按钮、点击输入，看得到就能操作：订闹钟、京东比价、定时任务、微信聊天、美团找餐馆、小红书查旅游攻略，全都不在话下，能直接上手开干。

📱 不占你的屏幕：在一块单独的后台屏上打开 App、点、打字、翻页，你照常用手机；想看就点开小画面

🧩 任何App 都能用：像人一样看屏幕、找按钮，不需要 App 开放接口，也不用事先适配

🌐 自由网页操作：内置浏览器里，对着正在看的这一页说一句，它就在这一页上干活；你一碰页面它就停

🧠 越用越会：记住你说过的偏好；办成的事自动总结成技能，下次更快更稳

🔒 数据本地存储：没有 Mika 服务器；用你自己的模型 Key，或用 ChatGPT、xAI、OpenRouter 账号登录

🆓 开源、免费：项目基于Apache-2.0协议，代码全部公开

Mika设置闹钟

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/afafa97619cd0c9b.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b52021c5f63b879c.png)

Mika购物

当你说「从京东搜索iphoneduo的价格」，Mika 会 **开启两块虚拟屏干活，你的主屏什么都没被占。** 任务结束，虚拟屏7、8自动回收，系统只剩主屏。另外中文输入走的是剪贴板桥——写入、粘贴、然后把你的原剪贴板原样恢复，细节到位。

最后，Mika 返回结果：全球购苹果Duo折叠屏新人到手¥17449（原价¥18449）、iPhoneDuo折叠5G¥17298.22（原价¥19529）、准新机国行原封¥17398.22、星光白256G¥17998.22；汇总 **京东自营256GB最低¥15999，第三方全新集中在¥17300–19500**。它还主动指出：结果里混着华为MateX6、小米MIXFold、荣耀MagicV5的链接，以及二手/准新机，注意甄别。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/053aafad5239ef8d.webp)

Mika 操作小红书

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c835a6b41c9e1107.png)

![总结一位博主最近发的内容](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ad75974a95fe1be.gif)

总结一位博主最近发的内容

开源信息

Mika 没有服务器，你的话、屏幕内容只发给你自己配置的模型服务商，重要的事请启用询问模式，并检查结果。你配置的 API Key、记忆加密保存在手机上；对话、运行记录也只存在本机；Mika 只会访问 GitHub，获取升级更新包。

Github 项目：wangzan101/Mika

那么，你安装 Mika 了吗？

IoT物联网 · 目录
