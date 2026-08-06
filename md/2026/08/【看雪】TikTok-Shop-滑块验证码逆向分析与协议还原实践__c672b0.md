---
title: 【看雪】TikTok Shop 滑块验证码逆向分析与协议还原实践
source: https://bbs.kanxue.com/thread-292336.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-06T19:04:37+08:00
trace_id: 39a6f7ba-e27a-4673-adc8-698d35fa9a91
content_hash: 99b259545c2fbbd26f997cc629f09f92b03e2eb7418146ecfd4f442648a65b2f
status: synced
tags:
  - 看雪
  - 协议分析
  - 风控对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: TikTok Shop 滑块验证码可通过还原浏览器最终提交的数据与生成逻辑，实现纯 HTTP 协议化校验，不再依赖浏览器拖拽。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3b475244-d011-8167-be2a-fdf90a9a779d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TikTok Shop 滑块验证码可通过还原浏览器最终提交的数据与生成逻辑，实现纯 HTTP 协议化校验，不再依赖浏览器拖拽。
> 
> - **核心入口：** 验证码最终调用的 POST /captcha/verifyV2 接口，请求体只含 captchaBody；逆向应从该接口反推 SDK，而非直接研究加密算法。
> - **明文还原：** 通过 JS 插桩拿到 SDK 加密前的 plain 对象（含 id、mode、reply、mp、mm、mu 等字段），其中 id 直接来自 /captcha/get，mp/mm/mu 为浏览器采集并可协议生成，真正耗时在 reply 轨迹构造。
> - **轨迹规律：** reply 中 x 表示拖动轨迹、time 表示时间，y 并非鼠标真实坐标，而是由 /captcha/get 参数计算出的偏移量决定。
> - **加密与签名：** plain 经序列化后由 SDK 加密为 captchaBody；Verify 请求还要求 Query 签名、Header、Cookie 派生票据等同步计算，二者缺一不可。
> - **最终结果与边界：** 协议化后仅依赖 HTTP 客户端、图像识别、SDK 加密环境与请求签名，真实挑战可返回 code 200 的 Verification complete；但有效 Cookie/会话、题图识别效果、SDK 与签名版本演进仍是工程边界。

> 本文记录一次针对 TikTok Shop 滑块验证码的逆向分析过程。从浏览器中的 JavaScript SDK 出发，逐步还原整个验证码协议，最终实现纯 HTTP 完成滑块校验，而无需驱动浏览器完成拖拽。

相比介绍某一个算法，本文更希望分享整个逆向思路： **如何分析一个现代 Web 验证码，以及如何一步步完成协议化。**

* * *

## 理论背景

现代电商平台的滑块验证码，真正需要验证的并不是"鼠标有没有移动"。

浏览器完成的一次滑块，大致包含下面几个阶段：

-   获取验证码挑战（Challenge）
-   下载图片资源
-   采集用户行为
-   构造轨迹数据
-   组装明文
-   SDK 加密
-   请求签名
-   服务端验证

页面上的拖动，仅仅只是其中的一小部分。

因此，与其不断模拟浏览器鼠标事件，不如直接分析：

> **浏览器最终向服务端提交了什么。**

如果能够完全还原这一过程，那么浏览器便不再是必需组件。

* * *

## 整体逆向流程

整个分析过程可以抽象为下面这条流水线。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e7ff1c84957fb73e.webp)

整个过程中，我们并不是直接研究加密，而是按照浏览器真正执行的顺序，一层层向前推。

* * *

## 第一步：定位提交入口

任何验证码最终都会调用一次 Verify 接口。

因此第一件事不是研究加密，而是找到：

```python
captchaBody
```

是谁生成的。

浏览器抓包后，可以看到 Verify 请求大致如下：

```
POST /captcha/verifyV2
```

请求体只有一个核心字段：

```json
{
    "captchaBody":"xxxxx"
}
```

说明：

整个滑块真正提交的数据，都已经被封装到了 captchaBody 中。

因此接下来需要继续逆向：

> captchaBody 是如何生成的？

* * *

## 第二步：还原明文结构

经过 JavaScript 插桩，可以定位到 SDK 加密之前的明文对象（plain）。

例如：

```json
{
    id,
    mode,
    reply,
    mp,
    mm,
    mu,
    ...
}
```

直到这里，整个验证码真正需要提交的数据才全部暴露出来。

这一步非常重要。

因为之后所有工作，都建立在：

> **先理解每个字段代表什么，再考虑如何生成。**

而不是一开始就研究加密算法。

* * *

## 第三步：分析每个字段来源

接下来开始逐个分析 plain 中的数据来源。

经过大量样本比对，可以发现字段主要分成几类。

## ① 服务端直接下发

例如：

```python
id
```

来自 /captcha/get 接口。

无需计算。

* * *

## ② 图像识别获得

例如：

```python
拖动距离
```

需要下载：

-   背景图
-   滑块图

然后通过 OpenCV 等算法识别缺口位置。

得到真正需要拖动的水平距离。

* * *

## ③ 浏览器环境采集

例如：

```python
mp
mm
mu
```

这些来自浏览器采集的环境数据。

协议实现时可以直接按照 SDK 格式生成。

* * *

## ④ 用户轨迹（reply）

真正花时间最多的是：

```python
reply
```

经过大量 Challenge 对比，可以发现：

-   x 表示拖动轨迹
-   time 表示时间
-   y 并不是鼠标真实坐标

真正影响 y 的，是 /captcha/get 中的参数计算出的偏移量。

* * *

## 第四步：生成完整轨迹

当所有字段都能够独立获得以后，就可以生成完整轨迹。

```python
reply
mp
mm
mu
```

整个 plain 就已经完整。

* * *

## 第五步：分析 SDK 加密

当 plain 已经完全一致以后，加密反而变成最简单的一步。

直接沿着 SDK 调用链即可定位：

```python
plain

↓

序列化

↓

SDK 加密

↓

captchaBody
```

只要执行与浏览器一致的加密流程，就能够得到完全一致的 captchaBody。

因此这里关注点已经不再是算法，而是：

> **如何保证输入完全一致。**

* * *

## 第六步：分析请求签名

TikTok Shop 在 Verify 请求之外，还存在额外的一层请求保护。

例如：

-   Query 签名
-   Header
-   Cookie 派生票据

这些通常都由页面 SDK 自动生成。

协议化时需要同步完成签名计算，否则 Verify 请求仍然会失败。

因此最终 Verify 请求包含两部分：

```python
captchaBody

+

请求签名
```

二者缺一不可。

* * *

## 最终协议链路

当所有步骤全部完成以后，整个流程可以收敛成：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a395f74e15b82b88.webp)

整个运行过程中，仅依赖：

-   HTTP 客户端
-   图像识别
-   SDK 加密执行环境
-   请求签名

无需驱动浏览器完成拖动。

* * *

## 最终结果

完成整个协议链路后，在真实挑战上即可获得 Verify 成功响应：

```json
{
    "code": 200,
    "data": null,
    "message": "Verification complete"
}
```

这说明：

-   验证码所需字段均已完成协议还原；
-   用户轨迹可以通过算法生成，而非依赖浏览器事件；
-   浏览器拖拽已经不是协议验证的必要条件。

当然，仍需注意以下工程边界：

-   有效 Cookie 与会话仍然是前提；
-   缺口识别效果会受到题图变化影响；
-   SDK 加密与请求签名可能随版本升级发生变化，需要持续跟进。

* * *

## 方法总结

回顾整个逆向过程，可以归纳为以下几个关键步骤：

1.  **从 Verify 接口反推 SDK，而不是直接研究加密算法。**
2.  **通过插桩获取加密前的明文（plain），先理解字段含义，再分析字段来源。**
3.  **将字段拆分治理：服务端参数、图像识别、环境信息、轨迹数据分别独立分析，而不是混在一起排查。**
4.  **当所有字段能够独立生成后，再复用 SDK 的加密与签名流程，最终完成协议化。**

这种方法不仅适用于 TikTok Shop，对于许多采用浏览器 SDK 的现代 Web 验证码同样具有参考价值。真正需要逆向的往往不是鼠标轨迹本身，而是浏览器最终向服务端提交的数据以及这些数据的生成逻辑。
