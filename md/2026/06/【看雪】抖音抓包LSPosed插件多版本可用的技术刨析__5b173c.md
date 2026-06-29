---
title: 【看雪】抖音抓包LSPosed插件多版本可用的技术刨析
source: https://bbs.kanxue.com/thread-291805.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-29T10:17:45+08:00
trace_id: cbd80f17-a4e9-40bd-95cf-893151f9a7bd
content_hash: 2e0812c025b04f4bd92e294e16ad5ac1f868069bd7e139702de25602b1864af7
status: summarized
tags:
  - 看雪
series: null
feed_source: null
ai_summary: 通过 hook BoringSSL 的 `SSL_CTX_set_custom_verify` 和 `SSL_get_verify_result` 函数，可以接管抖音的证书校验过程，从而实现网络抓包。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 38e75244-d011-81df-ab01-e105e373e0cd
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - bbs.kanxue.com
    - cdn.jsdelivr.net
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过 hook BoringSSL 的 `SSL_CTX_set_custom_verify` 和 `SSL_get_verify_result` 函数，可以接管抖音的证书校验过程，从而实现网络抓包。
> 
> - **Hook 点选择：** 针对 `libttboringssl.so` 中的 `SSL_CTX_set_custom_verify` 进行 hook，而非 Cronet 的 `CertVerify`，因为前者更稳定且能避免证书链状态不完整。
> - **Callback 管理：** 在注册阶段保存原始 callback 到 per-CTX 的 map 中，并用自定义 callback 替换，以避免多组件状态错乱。
> - **校验覆盖策略：** 在握手阶段自定义 callback 调用原始校验链，但仅将同步失败结果覆盖为成功；异步校验则保持原样，避免提前推进握手。
> - **结果读取 hook：** 额外 hook `SSL_get_verify_result` 函数，在最终读取阶段将错误码覆盖为 0，确保覆盖动作在正确位置执行。

**如果只需要插件，不想看技术实现，可以关注公众号，发送“抖音插件”，获取编译好的插件**  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1da14f1df0db8461.webp)

## 1\. 落点选 custom\_verify

`libsscronet.so` 会引用 BoringSSL 的 SSL API，比如 `SSL_CTX_set_custom_verify` 和 `SSL_do_handshake` ；真实实现位于 `libttboringssl.so` 。所以这里 hook 的不是 Cronet 的导入符号，而是 BoringSSL 里的 `custom_verify` setter。

直接 hook Cronet 的 `CertVerify` 语义上最直观，但稳定性不如 BoringSSL setter。

Cronet 的证书校验不只是一个 bool。它还会填充证书链、host、OCSP、SCT、verify flags、SSLInfo 等状态。高层粗暴截断，很容易让后续逻辑拿到不完整状态。

`custom_verify` setter 更干净：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8307ac9f5b75a6ff.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6e516ed6df9d0901.webp)

这两个函数的特点很适合 hook：

```
函数体短
没有 paciasp
x2 就是 verify callback
语义稳定，和上层业务混淆关系不大
```

* * *

## 2\. 注册阶段：保存原 callback，再替换

```
Cronet:
  SSL_CTX_set_custom_verify(ctx, mode, cronet_cb)
Detour:
  保存 cronet_cb
  调原 setter，把 MyVerifyCb 写入 BoringSSL
TLS handshake:
  BoringSSL 调 MyVerifyCb
  MyVerifyCb 再调 cronet_cb
  MyVerifyCb 覆盖最终结果
```

核心 detour：

```cpp
using VerifyCb = int (*)(void *ssl, uint8_t *out_alert);
using SetVerifyFn = void (*)(void *obj, int mode, VerifyCb cb);
void CtxSetVerifyDetour(void *ctx, int mode, VerifyCb cb) {
    if (cb && cb != MyVerifyCb) {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_ctx_cb[ctx] = cb;
    }
    g_orig_ctx_set(ctx, mode, MyVerifyCb);
}
```

BoringSSL 的 verify callback 有 per-CTX 和 per-SSL 两种注册粒度。抖音 Cronet 的主流量都通过 `SSL_CTX_set_custom_verify` 在 CTX 级注册，所以只 hook 这一个 setter 就能覆盖。

不要丢掉原始 callback。原 callback 后面还要被调用，用来维持 Cronet / BoringSSL 内部状态。

* * *

## 3\. 为什么要 per-CTX 保存

不能只用一个全局变量保存“最后一次看到的 callback”。

同一个进程里可能有多套 TLS 使用者：

```
主 Cronet
媒体下载
PCDN / ODL
WebView / sandbox
其他 native 网络组件
```

它们各自创建自己的 `SSL_CTX` ，注册各自的 verify callback。如果只保存一个全局 callback，后注册的组件会覆盖前面的组件。结果就是：

```
SSL 对象 A（属于 CTX a）
  -> 被喂给组件 B 的 callback
  -> callback 按 B 的上下文解析 A
  -> 状态错乱或崩溃
```

所以要按 CTX 对象保存：

```cpp
std::unordered_map<void *, VerifyCb> g_ctx_cb;  // SSL_CTX* -> 这个 CTX 自己的原始 callback
```

但握手时 BoringSSL 交给回调的是 `SSL*` ，不是 `SSL_CTX*` 。要回到这张表，还得先从 `SSL*` 反查出它的 `SSL_CTX*` ——这就是下一节的事。

* * *

## 4\. 从 SSL\* 找回 SSL\_CTX\*

主流量通常走 `SSL_CTX_set_custom_verify` 。注册时我们保存的是 `ctx -> callback` ，但握手时 `MyVerifyCb` 收到的是 `SSL* ssl` ，所以需要从 `ssl` 反查 `ctx` 。

`SSL_get_SSL_CTX` 很短：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ce60fe5c9b1449ec.webp)

代码里直接按偏移读取：

```cpp
constexpr uintptr_t kSslCtxOff = 0x68;
void *ctx = *reinterpret_cast<void *const *>(
    reinterpret_cast<const char *>(ssl) + kSslCtxOff);
```

然后用这个 `ctx` 去 `g_ctx_cb` 里找原始 callback，这个值目前看到抖音39.1.0-39.3.0目前最新版本没变化，其余版本我就不一一测试了，需要自行测试。

* * *

## 5\. 握手阶段：MyVerifyCb

`MyVerifyCb` 做三件事：

```
1. 从 SSL* 反查 SSL_CTX*，再到 g_ctx_cb 找回 Cronet 原始 callback
2. 调用原始 callback，让原始校验链路继续执行
3. 根据返回值语义决定是否覆盖
```

核心逻辑：

```cpp
int MyVerifyCb(void *ssl, uint8_t *out_alert) {
    VerifyCb orig = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        void *ctx = *reinterpret_cast<void *const *>(
                        reinterpret_cast<const char *>(ssl) + kSslCtxOff);
        auto it = g_ctx_cb.find(ctx);
        if (it != g_ctx_cb.end()) orig = it->second;
    }
    int r = orig ? orig(ssl, out_alert) : kSslVerifyOk;
    return r == kSslVerifyRetry ? kSslVerifyRetry : kSslVerifyOk;
}
```

查找路径只有一条： `ssl -> ctx` （按 §4 的偏移） `-> g_ctx_cb` 。如果没找到（ `orig == nullptr` ），通常意味着 hook 晚于 CTX 创建，或偏移变了；这种情况应当打诊断暴露出来，而不是悄悄放行。

这一步的重点是先调原 callback。它会继续执行 Cronet 的证书校验逻辑，填充后续还会使用的状态。我们只是在它返回之后改最终结果。

custom verify callback 的返回值不是普通 bool：

```toml
0 = ssl_verify_ok
1 = ssl_verify_invalid
2 = ssl_verify_retry
```

同步失败可以覆盖：

```
origret=1 -> 0
```

但异步校验不能提前放行：

```
origret=2 -> 2
```

`retry(2)` 表示证书校验还在异步流程里。这个时候如果直接改成 `ok(0)` ，握手会被提前推进，但 Cronet 内部状态还没准备好，后面很容易触发断言或状态不一致。

* * *

## 6\. 为什么还要 hook SSL\_get\_verify\_result

只 hook custom verify setter，可以处理同步失败；但更严格的异步路径里，最终错误码还会被后续读取。

所以补一层：

```cpp
using GetVerifyResultFn = long (*)(void *ssl);
long GetVerifyResultDetour(void *ssl) {
    // 仍调原函数让内部状态走完，只把最终错误码覆盖成 0
    if (g_orig_get_verify_result) g_orig_get_verify_result(ssl);
    return 0;
}
```

这层的作用是把覆盖动作放到更晚的位置：

```
custom_verify 阶段：
  尊重 retry，不提前推进握手
verify_result 读取阶段：
  把最终错误码覆盖成 0
```

这也是整套方案稳定的关键：握手状态按真实流程走，最终结果在读取点再改。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1b8e59b3f9e346a4.webp)

* * *

## 7\. 总结

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8ed8ccca7053abaa.webp)

这套方案的核心不是直接改 Cronet 的证书校验结果，而是接管 BoringSSL 的 `custom_verify` callback 注册点。最终只剩两个 hook 点、一张 map：

```
注册阶段：
  Cronet 调 SSL_CTX_set_custom_verify 注册 verify callback
  hook 这个 setter，把原 callback 存进 g_ctx_cb[ctx]
  把真正写入 BoringSSL 的 callback 换成 MyVerifyCb
握手阶段：
  BoringSSL 调 MyVerifyCb
  MyVerifyCb 用 ssl->ctx 偏移反查 g_ctx_cb，找回并调用 Cronet 原 callback
  retry(2) 原样返回
  同步失败(1) 覆盖为 ok(0)
结果读取阶段：
  SSL_get_verify_result 覆盖为 0
```

> 不要跳过原始校验流程；让它把状态喂完整，再在返回值边界上做最小改动。

[#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)
