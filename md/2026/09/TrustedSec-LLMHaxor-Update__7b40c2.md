---
title: TrustedSec | LLMHaxor Update
source: https://trustedsec.com/blog/llmhaxor-update
source_host: trustedsec.com
clip_date: 2026-09-11T10:27:34+08:00
trace_id: 7af23c9f-7ffe-4089-8d60-1473a15bbf82
content_hash: 5002a10c5b3f9553f17dcf8a6a93834bc02f0412e7452fb593b7dccacf5e7d75
status: synced
tags:
  - 安全工具
  - AI应用
series: null
feed_source: TrustedSec
ai_summary: LLMHaxor 的价值依旧存在：为应对 WebSocket 流式接口与客户受限环境，它新增了 WebSocket 代理，让 Burp Intruder 也能对聊天类接口做 LLM 模糊测试。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3d875244-d011-8153-90fd-e36c37cf96b1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LLMHaxor 的价值依旧存在：为应对 WebSocket 流式接口与客户受限环境，它新增了 WebSocket 代理，让 Burp Intruder 也能对聊天类接口做 LLM 模糊测试。
> 
> - **工具生态现状：** Garak、Augustus 等框架已让 LLM 测试比一年前简单得多，常改改 JSON 即可，但仍达不到"点选即用"；Burp 原生 AI 扩展体验极佳，但收费且模型非本地。
> - **仍是老问题：** 通用 Web 测试的麻烦照旧——维持会话、获取 access token、检测过期，以及确保消息格式正确，否则可能测错层。
> - **环境约束：** 大多数工具依赖与要求繁杂，通常装在容器/VM 里；若客户要求在其 VDI 上测试、无外网或有合规限制，Burp 内置 AI 等方案直接不可用。
> - **LLMHaxor 定位：** 最小依赖（Ollama CPU 模式 + Granite/Llama3.2 等小模型、JRuby.jar、Burp Suite），全部可装在用户主目录，无需特殊权限、无需联网。
> - **WebSocket 适配：** 新增代理把 WebSocket 响应伪装成 Intruder 支持的 HTTP 接口；找到返回 101 Switching Protocols 的接口，将协议改为 ws/wss 并指向本地即可，可能需调整部分 HTTP 头。

Today I am sharing some updates on a tool I created from an earlier time — before Burp Suite included native AI testing enhancements and before an almost explosive growth of open-source AI tooling and testing frameworks hit the scene. My little tool became obsolete almost overnight, except I find test after test, engagement after engagement, that isn't quite true. I still have a lot of the same problems I did a year ago; the degree has just changed. I'll recap and update my "practitioners" point of view.

## LLM 测试工具生态现状

About a year ago I first published the blog post [Getting Started Using LLMs in Application Testing With an MVP](https://trustedsec.com/blog/getting-started-using-llms-in-application-testing-with-an-mvp). At the time, the alternative testing solutions were often complex to stand up. Nothing too difficult, but before you could start using PyRIT or any other framework against some client's arbitrary application, you were faced with creating adapters and transformers. It is better now — tools like [Garak](https://garak.ai/) and more recently [Augustus](https://www.praetorian.com/blog/introducing-augustus-open-source-llm-prompt-injection/) have made things quite a lot simpler; often just playing with a JSON query for a bit can now get you where you need to go. Oh, and you can of course just ask your favorite model to write something for you! It is, however, still not exactly point-and-click as far as AI/LLM-specific testing goes.

## 会话与格式等遗留难题

Also don't forget this still usually comes with a number of "fun" web application testing problems like maintaining sessions, obtaining access tokens, and detecting expiration. Finally, you still have to ensure you have messages formatted correctly, lest you find out you are not really testing the layer you thought you were.

For more general web application testing, [Portswigger's native AI extensions to Burp](https://portswigger.net/burp/documentation/desktop/burp-ai) are nothing short of fantastic and about as near to "see that, scan that, do it now" as you could hope for. It is not free, though, and the model isn't local.

## 受限环境下的落地困境

All of these things assume you can actually use the tool in the environment you want to test in. Most come with a pile of dependencies and environment requirements; as a practical matter they end up installed either in a container or VM that you clone for each engagement. This solution quickly falls apart when your client tells you all testing will take place from their VDI or another machine they are providing you. Lack of internet access, policy, or disclosure rules might very well prevent you from using Burp's built-ins. LLMHaxor's minimal footprint and ability to run entirely within a user's home directory — without special permissions or internet access — makes it uniquely suited for exactly these situations.

**TL;DR #1 – I still find I want to get something going right away and explore things quickly.**

-   I need to be able to log in, copy/paste some HTTP headers, and get fuzzing.
-   I need to be able to look for interesting responses without development time on my end or excessive machine time running models on CPU.

**TL;DR #2 – I still find I want to be able to test with a local model in an environment where I don't need a lot of software, and everything I do need can install to my home/profile directory and run without special permissions.**

## 最小依赖清单

-   Ollama (CPU mode) + small models like Granite / Llama3.2
-   JRuby.jar
-   Burp Suite

My original LLMHaxor tool still fits the bill. One comment I made in my original blog post was that the choice to leverage Burp's Intruder as the request framework left out WebSocket testing. At the time, a lot of chat functions and other things I wanted to let AI explore in an adaptive context — versus a simple fuzz list — ran over HTTP. Increasingly, these integrations have standardized on streaming responses via WebSockets. So I have added a proxy to the tool that gathers WebSocket responses and presents them to Intruder as an HTTP interface that Intruder supports.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/21229c3157cdf272.png)

## WebSocket 代理使用步骤

Find your websocket API, usually a GET with a “1XX Switching Protocols” response, change the protocol to ‘ws/wss’, point your intruder at local host and Go!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f8b441cbad076019.png)

It is ‘almost’ that simple, you might need to move some http headers around as well. You can read all the details at: [https://github.com/GeoffWalton/LLMHaxor/blob/main/WS_ADAPTER_GUIDE.md](https://github.com/GeoffWalton/LLMHaxor/blob/main/WS_ADAPTER_GUIDE.md)

You can get an updated version of the plugin with the new WebSock proxy support and an number of other bug fixes and improvements to reliability and logging at: [https://github.com/GeoffWalton/LLMHaxor/blob/main/LLMHaxor.rb](https://github.com/GeoffWalton/LLMHaxor/blob/main/LLMHaxor.rb)
