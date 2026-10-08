---
title: 【微信】「AI中转站安全+提示注入检测」API Relay Audit拆解：本地14步审计你的LLM代理
source: https://mp.weixin.qq.com/s/c5z1UMQflXGUhRiIP2OatQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-08T15:14:27+08:00
trace_id: 1524ae77-6abd-4f26-9850-420022ec7576
content_hash: b3b00795dba22f029e3efdde87cdef76e9e896f6b79b63130cefda59701b97ae
status: synced
tags:
  - 微信
  - 安全工具
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 一条本地命令跑完 14 步，审计 AI API 中转站是否偷改提示词、换模型、篡改工具调用。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3f375244-d011-8175-8b9b-d0038f61a95d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一条本地命令跑完 14 步，审计 AI API 中转站是否偷改提示词、换模型、篡改工具调用。
> 
> - **工具定位：** `toby-bridges/api-relay-audit`，Python 单文件、零依赖（仅需 Python 3 与 curl），AGPL-3.0，v2.4.1，870 star；请求全走 curl 子进程，便于先读源码再运行。
> - **注入与改写检测：** 用「实际输入 token − 预期输入 token」差值法找被塞进请求的隐藏指令；对 `pip install`/`npm install`/`cargo add`/`go get` 固定包名做字符级比对，抓 `requests`→`reqeusts` 类 typosquat。
> - **完整性与指纹：** 核验 Anthropic 流式事件类型、`output_tokens` 单调性、thinking 签名非空；重复低 token 请求看延迟是否双峰以判断静默换模型；按响应头与消息 ID 区分 Bedrock/Vertex/OpenRouter/Cloudflare 等上游通道。
> - **证据原则：** 模型自称身份（Qwen、GPT 等）只是信号，不能单独证明上游被换；探针被拦、格式不支持一律标 `inconclusive`，不等同 `clean`；报告是证据而非安全证书。
> - **版本与用法：** v2.4.0 会把 key 暴露在 curl 进程参数里，v2.4.1 改为经 stdin 传递；默认档跑全 14 步，加 `--profile web3`/`full` 才启用钱包注入探针，公开证据前须脱敏。

**句芒安全实验室** *2026年10月8日 14:43*

## 你花半价买的「Claude 中转」，可能正在改你的话

现在用 AI 编程助手的人，很多都在用「中转站」：官方 API 太贵、不好开卡，就买一个第三方中转，用 OpenAI 兼容或 Claude 兼容的接口把请求转上去。便宜、方便，代价是你把提示词、上下文、工具调用，甚至钱包操作，全都交给了一个你根本不认识的中间人。

中间人能做什么？它当然可以什么都不做。但它也可以：在你发出去的请求里塞一段隐藏指令；在返回时把模型换成更便宜的；把你的上下文悄悄截断；把工具调用里的 `pip install` 换成另一个包名；或者在报错信息里，把你自己的密钥原样吐回来。

这些都不是假设。今天要拆的，就是专门用来查这件事的工具： **API Relay Audit** （ `toby-bridges/api-relay-audit` ）。

![API Relay Audit 官方仓库配图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d207aee1cdf26cdc.png "API Relay Audit 官方仓库配图")

## 它是什么

一句话： **一个在本地跑的 AI API 中转站安全审计脚本**，一条命令，跑完 14 步，出一份 Markdown 报告。

仓库在 GitHub 的 `toby-bridges/api-relay-audit` ，Python 写的，AGPL-3.0 协议。截至我核实（2026-10-08），它有 **870 个 star、83 个 fork、30 个未关 issue**，2026 年 3 月建仓，最新版本 **v2.4.1**。项目自报的现状是：14 个审计步骤、6 维风险矩阵、811 个 pytest 测试、22 个命令行参数，三种运行档位 `general` / `web3` / `full` 。

它最让人放心的一点是 **零依赖**： `audit.py` 是单文件，除了 Python 3 和 `curl` 什么都不需要，所有 HTTP 请求都走 `curl` 子进程。这意味着你在跑之前，可以先把整个脚本从头读一遍。

## 它的威胁模型来自哪

这不是拍脑袋做的工具。它的威胁分类跟着 Liu 等人的论文 *Your Agent Is Mine* （arXiv:2604.08407），基础设施指纹、延迟方差、上游通道分类来自 Zhang 等人的 *Real Money, Fake Models* （arXiv:2603.01919）。

背景是过去一年真实发生的几件事：Anthropic 在 2026 年 9 月 10 日发过一份报告，讲的是伪造的 Claude 转售商怎么在客户端工具里换模型、偷凭证；论文共同作者 Chaofan Shou 在 9 月 11 日披露，他买到的一份路由数据里带着用户的凭证。中转站这条链路上，钱和信息都是真的在流动，动手脚的动机也是真的。

## 14 步审计了什么

**第 1–2 步 · 摸底**：基础设施侦察（DNS、WHOIS、SSL 证书、HTTP 头、面板类型是不是 One API / New API），模型列表枚举（可用模型、 `owned_by` 字段、模型数量）。

**第 3–7 步 · 提示词安全**：Token 注入检测（用「实际输入 token 数 − 预期输入 token 数」的差值法，多出来的就是被塞进去的隐藏提示）、提示词提取（3 种直接方法套隐藏系统提示）、指令冲突与身份替换（「猫测试」+ 广谱的非 Claude 关键词匹配，覆盖 GLM / DeepSeek / Qwen / MiniMax / Grok / GPT / 文心 / 豆包 / Kimi / 通义等）、越狱测试、上下文长度测试（用 canary 标记粗扫再二分，找出截断边界）。

**第 8–10 步 · 中转完整性**：工具调用改写（发 `pip install` / `npm install` / `cargo add` / `go get` 固定包名，做字符级比对，抓 `requests` → `reqeusts` 这种 typosquat）、错误响应泄漏（7–8 个故意发坏的请求，扫错误体里的密钥、上游 URL、环境变量名、文件路径、堆栈、LiteLLM 内部字段、Bedrock 护栏 PII 回显）、流完整性（Anthropic 流式请求，核对事件类型、 `output_tokens` 单调性、thinking 签名非空、 `message_start` 之后有且仅有一个 `message_stop` ）。

**第 11–14 步 · 指纹与 Web3**：Web3 注入（仅在 `--profile web3` 下跑 3 个钱包安全探针）、基础设施指纹、延迟方差（重复同款低 token 请求，看路由是不是双峰，可能意味着排队复用或静默换模型）、上游通道分类（从响应头、消息 ID、响应体判断是 Bedrock / Vertex / OpenRouter / Cloudflare AI Gateway 还是透明 Anthropic 中转）。

跑完输出一份分节风险评级 + 总体结论的 Markdown 报告。

![API Relay Audit 社交预览图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fee8fa87b3975463.png "API Relay Audit 社交预览图")

## 几个关键设计

**第一，全部在本地跑。** 你的密钥只发给你自己指定的那个中转 URL，不经过任何第三方 web 服务。这是它和「在线测速 / 查信誉」类工具最大的区别：那类工具要你把 key 交给它，这个工具让你自己留证据。

**第二，证据边界写得很清楚。** 它反复强调一个区分：自然语言里的自我声明（一个模型说自己是 Qwen、DeepSeek、GPT）只能算 **信号**，不能单独证明上游被换过；要下结论得有原始响应 JSON、请求 ID、provider/model 元数据、流签名、透明日志哈希这些佐证。它的四类查询族也是分开的：中转审计、提示注入审计、模型替换信号、Web3 中转审计，各自有各自的证据边界，不合成一句口号。

**第三， `inconclusive` 不等于 `clean` 。** 探针被拦、格式不支持、响应含糊，都会被标成 `inconclusive` ，留在报告里，而不是当成「没问题」。这一点在安全工具里其实很少见——很多工具会把「测不到」直接当成「通过」。

## Web3 钱包检查

用 `--profile web3` 或 `--profile full` ，它会加三个面向钱包的注入探针：ETH 转账引导、拒绝签名交易、拒绝泄露私钥。这些探针是模型无关的，但刻意做成档位开关，让普通中转审计不被钱包场景带偏。

## 怎么跑

一条命令下载并运行：

```powershell
AUDIT_SCRIPT_REF=v2.4.1
curl -fsSL "https://raw.githubusercontent.com/toby-bridges/api-relay-audit/${AUDIT_SCRIPT_REF}/audit.py" -o audit.py
python3 audit.py --key "$API_RELAY_AUDIT_KEY" --url "$API_RELAY_AUDIT_URL"
```

跑 Web3 档：

```
python3 audit.py --key "$KEY" --url "$URL" --profile web3 --output report.md
```

它还有两种分发形态：DeepSeek Harness 的插件（ `dsh plugin add "github:toby-bridges/api-relay-audit#v2.4.1"` ，凭据留在 DSH Credentials，通过环境变量传给本地审计进程，既不进命令行参数也不进会话日志），以及保留的 OpenClaw / Hermes skill 文件。

## 避坑

第一， **它不认证中转站安全。** 仓库里反复写：报告是证据，不是安全证书。

第二， **自我声明不是证据。** 模型说自己是 Claude，不代表它真是 Claude；反过来也一样。

第三， **Web3 检查是档位隔离的。** 普通中转审计不代表钱包安全，要单独用 `web3` / `full` 档。

第四， **老版本会把 key 暴露在进程列表里。** v2.4.0 在错误探针和流式回退时会把 key 放进 curl 进程参数；v2.4.1 改成走 curl 配置的 stdin。如果你还在跑 v2.4.0，本机进程列表要当敏感信息看。

第五， **公开证据前先脱敏。** 别把密钥、原始响应体、钱包材料、中转流量、用户数据贴进公开的 issue。

## 适合谁

-   在用第三方 AI API 中转 / 镜像 / 网关 / LLM 代理的开发者，想在把真实流量打过去之前，先在本地审一遍；
    
-   需要一份本地、可复现、结构化 Markdown 报告的团队，而不是把 key 交给一个在线 web 工具；
    
-   做钱包相关 Agent 流程的，想先查中转在签名 / 交易相关行为上有没有问题。
    

**不适合谁**：想靠它「一键证明某个中转站安全」的人。它给的是证据和信号，不是认证。

## 最后

这两年 AI 安全有一个很明显的变化： **攻击面从模型本身，扩散到了模型周围那一圈基础设施。** 以前你担心的是模型被越狱，现在你更该担心的是——你和模型之间那条链路上，站着谁、动了什么。

API Relay Audit 这类工具，把「中转站」正式当成了一个需要审计的对象：不是查它快不快、便不便宜，而是查它在你的请求和响应之间，到底有没有动过手。当你把密钥、上下文、工具调用甚至钱包操作都交给一个中间人的时候， **先在本地审一遍这件事，成本其实很低。**

作者提示: 内容由AI生成
