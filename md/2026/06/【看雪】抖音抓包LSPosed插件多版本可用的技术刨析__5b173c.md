---
title: 【看雪】抖音抓包LSPosed插件多版本可用的技术刨析
source: https://bbs.kanxue.com/thread-291805.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-29T00:44:12+08:00
trace_id: b4615c18-26f1-48fc-bbb6-35ef4075911d
content_hash: 7b5601e3e6840631ff4ab302fba9ecd42d2087f387f5c69d37da4353ed3a62e6
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 通过Hook BoringSSL的`SSL_CTX_set_custom_verify`函数实现抖音抓包，因其比直接Hook Cronet更稳定，能避免证书验证状态不完整的问题。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 38d75244-d011-814d-aee1-d4c4f2924e62
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - cdn.jsdelivr.net
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过Hook BoringSSL的`SSL_CTX_set_custom_verify`函数实现抖音抓包，因其比直接Hook Cronet更稳定，能避免证书验证状态不完整的问题。
> 
> - **稳定性优势：** 直接Hook Cronet的`CertVerify`易导致证书链、OCSP、SCT等状态填充不完整，引发后续逻辑错误。Hook底层BoringSSL的setter函数则更干净、稳定。
> - **Hook策略：** 抖音主流量通过`SSL_CTX_set_custom_verify`在`CTX`级别注册回调，只需Hook此函数即可覆盖。必须按`SSL_CTX`对象保存原始回调，不能使用全局变量，以防止多组件间相互覆盖。
> - **实现细节：** 握手时BoringSSL传递`SSL*`指针，需通过固定偏移（如39.1.0-39.3.0版本未变）从`SSL`结构反查出其所属的`SSL_CTX*`，再用`CTX`查找已保存的原始回调函数。
> - **回调逻辑：** 自定义验证回调（`MyVerifyCb`）必须先调用原始回调以维持Cronet内部状态，随后才能安全地覆盖其返回结果。需正确处理自定义回调的返回值语义。
> - **注意事项：** 若未找到原始回调（如Hook时机晚于CTX创建或偏移变化），应输出诊断信息，而非静默放行，以确保可调试性和安全性。

**如果只需要插件，不想看技术实现，可以关注公众号，发送“抖音插件”，获取编译好的插件**  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1da14f1df0db8461.webp)

`libsscronet.so` 会引用 BoringSSL 的 SSL API，比如 `SSL_CTX_set_custom_verify` 和 `SSL_do_handshake` ；真实实现位于 `libttboringssl.so` 。所以这里 hook 的不是 Cronet 的导入符号，而是 BoringSSL 里的 `custom_verify` setter。

直接 hook Cronet 的 `CertVerify` 语义上最直观，但稳定性不如 BoringSSL setter。

Cronet 的证书校验不只是一个 bool。它还会填充证书链、host、OCSP、SCT、verify flags、SSLInfo 等状态。高层粗暴截断，很容易让后续逻辑拿到不完整状态。

`custom_verify` setter 更干净：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8307ac9f5b75a6ff.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6e516ed6df9d0901.webp)

这两个函数的特点很适合 hook：

核心 detour：

BoringSSL 的 verify callback 有 per-CTX 和 per-SSL 两种注册粒度。抖音 Cronet 的主流量都通过 `SSL_CTX_set_custom_verify` 在 CTX 级注册，所以只 hook 这一个 setter 就能覆盖。

不要丢掉原始 callback。原 callback 后面还要被调用，用来维持 Cronet / BoringSSL 内部状态。

不能只用一个全局变量保存“最后一次看到的 callback”。

同一个进程里可能有多套 TLS 使用者：

它们各自创建自己的 `SSL_CTX` ，注册各自的 verify callback。如果只保存一个全局 callback，后注册的组件会覆盖前面的组件。结果就是：

所以要按 CTX 对象保存：

但握手时 BoringSSL 交给回调的是 `SSL*` ，不是 `SSL_CTX*` 。要回到这张表，还得先从 `SSL*` 反查出它的 `SSL_CTX*` ——这就是下一节的事。

主流量通常走 `SSL_CTX_set_custom_verify` 。注册时我们保存的是 `ctx -> callback` ，但握手时 `MyVerifyCb` 收到的是 `SSL* ssl` ，所以需要从 `ssl` 反查 `ctx` 。

`SSL_get_SSL_CTX` 很短：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ce60fe5c9b1449ec.webp)

代码里直接按偏移读取：

然后用这个 `ctx` 去 `g_ctx_cb` 里找原始 callback，这个值目前看到抖音39.1.0-39.3.0目前最新版本没变化，其余版本我就不一一测试了，需要自行测试。

`MyVerifyCb` 做三件事：

核心逻辑：

查找路径只有一条： `ssl -> ctx` （按 §4 的偏移） `-> g_ctx_cb` 。如果没找到（ `orig == nullptr` ），通常意味着 hook 晚于 CTX 创建，或偏移变了；这种情况应当打诊断暴露出来，而不是悄悄放行。

这一步的重点是先调原 callback。它会继续执行 Cronet 的证书校验逻辑，填充后续还会使用的状态。我们只是在它返回之后改最终结果。

custom verify callback 的返回值不是普通 bool：

同步失败可以覆盖：

[回复或点赞可查看完整内容](#quick_reply_form)
