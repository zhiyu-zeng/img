---
title: 【微信】Apple M芯片如何选择本地大模型部署工具
source: https://mp.weixin.qq.com/s/-lff7DxN-gPSxkPFc6vbwA
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T19:51:54+08:00
trace_id: 226e057c-db67-4377-b222-d654970eb64a
content_hash: 5b47d139c755c7aa9015189c35f1129250c437e887ff6d082c23e562bd7bd1e2
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 41475244-d011-81f8-94a0-e2db9ca7104d
ioc: null
---

**一只岸上的鱼** *2026年11月10日 15:10*

## Apple M芯片如何选择本地大模型部署工具

## 缘起

AI的兴起，让老黄赚了盆满钵满，内存和硬盘也翻了几番。

而大模型的发展，也还没真正到端侧可用，目前看起来比较实用的qwen3.8-27b，也需要20+的显存，老黄的业余卡，也只有5080/90才可以。

这时候才发现，苹果m的统一内存，给了本地大模型的另一个选择。

我有一个32g的m4的mini，一个32g的m2max的mbp，所以想着折腾一下apple m系列芯片部署大模型。

## 基本概念

### 统一内存

苹果将CPU、GPU、神经网络引擎 NE、媒体编解码器封装在一起，共用一个物理内存池，称为统一内存。

优点是，可以根据任务的需求，来划分各自的占比，这个划分一般是系统自动负责，偶尔也可以自己调整。

比如当32g跑qwen3.8-27b的时候，默认的系统配置无法支持长上下文和多轮，则可以手工调整，但是单次生效，重启失效，调整方法如下：

```
# 查询当前上限: 0表示系统分配
sysctl iogpu.wired_limit_mb
# 修改（临时，重启失效，单位MB）
sudo sysctl iogpu.wired_limit_mb=24576
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a64dbefe4abcfbd.png)

### MLX

MLX的全称应该是：Machine Learning Explore

是苹果机器学习团队开源、专门为 **Apple Silicon（M 系列）统一内存** 打造的数组 / 机器学习框架，底层基于 Metal GPU 加速PyPI

github地址： https://github.com/ml-explore/mlx

## 部署工具选择

**原生 MLX**、 **oMLX**、 **vMLX**、 **MTPLX** 是我用过的4款工具，每个单独简单介绍一下：

### 原生MLX

最低层的支持、更新快，但是只有最基础的功能，缺少高级调度功能，长上下文加载也慢，适合模型微调等研究大模型本身的事儿，用来当工具就比较累了。

使用Qwen2.5 Coder 14B测试：

```css
mlx_lm.server  --model ./Qwen2.514B  --port 8000 --host 127.0.0.1 --kv-bits 4 --kv-group-size 64 --prefill-step-size 512 --top-p 0.9 --max-tokens 4096
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a3aa110ef828e7b.png)

顺便介绍一下一个工具，continue，这是一个vscode的插件，现在已经不开发了，并入了cursor。为什么不用opencode？因为qwen2.5系列在tools的支持上和opencode不兼容。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2cc5213a8b3f7601.png)

补充说明一下Qwen2.5 Coder 14B，这个模型是我本地做代码补全的时候，最喜欢用的，古法编程么，行级、块级补全就够了，因为简单，速度够快，可以省下一些线上模型的费用，用来干大事（解决架构设计、vibecoding、ctf题解等复杂问题）

### vMLX

可以说是视觉增强版本的mlx，这里有2个意思，一个是指他处理图像的时候，会更加流畅：大模型看图也是指将图像编码成数据，他对图像和视频编码针对metal内核优化了，另外一个是他有一个app客户端，如果是简单的使用，可以不用接入其他agent（如opencode）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4fed2e956a9dda52.png)

使用的是，他可以直接扫码你制定的目录，然后直接点启动，就能发起对话：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1deb3450c3698383.png)

### oMLX

这个号称是生产力的王者，因为他专注入提供服务，本身没有提供太多客户端的功能，当然，他的web客户端功能也是足够用，也足够强大的。而且，教新的版本也支持了MTP，这个曾经MTPLX的专享。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ec2cf6b0c832460f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b99a0912367f068a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c41b14d04e054343.png)

web

支持mtp

### MTPLX

号称为了MTP而生的运行时，这里先介绍一下MTP：

**MTP：Multi‑Token Prediction，多 Token 预测头**

Qwen3（Qwen3.8-27B 这类）原生内置的 **辅助预测多头**，属于内置在同一个模型里的推测解码组件， **不需要单独草稿小模型**。

**原理**

普通 LLM：主干输出隐态，只预测 **下 1 个 token** （自回归，一次出 1 个）。  
MTP：在主干之外附加一组独立预测头（MTP 头，depth 一般 = 3），基于同一个隐态， **一次性并行预测后面第 2、第 3 个候选 token，生成一串草稿序列**；  
然后主干模型一次性批量校验这一串草稿，找到最长连续匹配前缀，直接收下这一批 token；遇到不匹配就截断回退，从失败位置重新生成

**吞吐提速**：代码、连贯文本接受率高，速度通常是普通 AR 的 1.8～2.5 倍

而MTPLX有自研的处理MTP的内核：

**MTP 内核 = MTPLX 自研的一套 Metal 计算内核 + 推测解码校验逻辑**，专门用来跑 Qwen3 系列自带的 MTP 多头，实现 **自草稿推测解码（speculative decoding）**，是 MTPLX 区别原版 mlx-lm 的核心；模型本身带的叫 **MTP 头（权重）**，MTP 内核是运行时用来驱动、校验这些头的计算代码PyPI

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e3ecf2b8ee5b06b0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de746412a8f2d27a.png)

启动：

对话：

## 选择建议

这是我当前根据不同提供需求的使用：

| 你的需求 | 推荐工具组合 | 理由  |
| :--- | :--- | :--- |
| **我是开发者，要微调模型** | **原生 MLX** | 灵活性最高，直接访问底层算子，社区示例最全。 |
| **我要跑超长文档/知识库 (100K+)** | **oMLX** | 唯一的 SSD 分层缓存方案，防止 OOM，重启不断片。 |
| **我要写代码/实时对话 (追求极速)** | **MTPLX** | MTP 加速效果最明显，延迟最低，体验最丝滑。 |
| **我要频繁分析图片/视频** | **vMLX** | 针对视觉编码器做了专项优化，吞吐量更高。 |

另外推荐我当前32g内存环境下的模型推荐：

### 1\. 代码神器：Qwen2.5-code-14B

-   **特点**：14B 参数量，专为编程优化，体积适中。
    
-   **推荐工具**： **MTPLX**
    

### 2\. 多模态先锋：Qwen2.5-vl-coder-7b

-   **特点**：7B 参数，原生支持图像/视频输入，轻量级。
    
-   **推荐工具**： **vMLX** 或 **oMLX**
    

### 3\. 旗舰全能王：Qwen3.8-27B

-   **特点**：27B 稠密模型，SWE-bench Pro 得分超越 Opus 4.6，支持 262K 上下文，被誉为“本地版 Opus”。
    
-   **推荐工具**： **oMLX** (长文本) / **MTPLX** (日常对话)
    

AI · 目录
