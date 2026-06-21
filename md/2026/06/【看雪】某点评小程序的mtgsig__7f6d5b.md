---
title: 【看雪】某点评小程序的mtgsig
source: https://bbs.kanxue.com/thread-291735.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-21T18:53:22+08:00
trace_id: 42b09ee1-f77c-492a-be4b-df02e0d12611
content_hash: bf422642e6d41d8538f7daabf0f81dd46511f0685a963e40ef034b3cdd405e6f
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过补环境技术成功模拟 mtgsig 签名，实现了某点评小程序数据获取，验证了签名机制的可行性。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 38675244-d011-81ff-afc9-ee2459762dc8
---

> 💡 **AI 总结（key-points）**
>
> 通过补环境技术成功模拟 mtgsig 签名，实现了某点评小程序数据获取，验证了签名机制的可行性。
> 
> - **mtgsig 字段构成**：对象包含 a1 (SDK版本)、a2 (时间戳)、a3 (设备指纹)、a4 (签名哈希)、a5 (加密元数据)、a6 (设备标识)、a7 (appId)、x0 (固定值3) 和 d1 (完整性校验) 等加密字段。
> - **签名函数入口**：使用 `ue(n, r)` 函数生成签名，通过补环境方法模拟执行上下文以完成动态签名。
> - **补环境实现**：作者扣下签名逻辑相关代码，并通过补环境模拟所需对象和环境，以绕过爬虫防护。
> - **验证测试结果**：利用接口 `/dpcategory/unifyshopaggregatedump.bin` 进行测试，根据 shop_id 成功获取数据，证明签名正确有效。

为防止爬虫，在每次请求时动态生成一个名为 `mtgisg` 的对象，包含多个加密字段：

|     |     |     |
| --- | --- | --- |
| a1  | SDK版本号 | "1.2" |
| a2  | 时间戳（毫秒） |     |
| a3  | 设备指纹ID（dfpId） |     |
| a4  | 签名哈希（96字符hex） |     |
| a5  | 加密的请求元数据（Base64） |     |
| a6  | siua设备唯一标识 |     |
| a7  | 微信小程序appId |     |
| x0  | 固定值 | 3   |
| d1  | 完整性校验hash（32字符hex） |     |

生成的签名的函数入口如下：

function ue(n, r) {

void 0 === r && (r =!0);

try {

if (Yn\["sig"\]) return n; // 如果已经签名过，直接返回

//... 签名逻辑

} catch (e) {

// 错误处理

}

}

ue(n, r)是入口函数。 这里使用的是补环境，所以我这个函数相关的地方整个扣了下来。如下图所示：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1ce3b572155a5387.webp)

接下来就是补环境了，下图是部分补 的环境

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/efd87abac81d0a10.webp)

使用

```
/dpcategory/unifyshopaggregatedump.bin
```

这个接口进行测试，看是否可以获取到相关的数据，最后的结果如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/42dc779ea9c06e70.webp)

根据shop\_id获取到数据成功！！ 证明签名正确。
