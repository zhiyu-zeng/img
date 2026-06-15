---
title: 【看雪】[原创]Google Integrity 校验始末与中间人攻击
source: https://bbs.kanxue.com/thread-291541.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-15T15:24:56+08:00
trace_id: 94a6fc41-7a34-4f85-8af9-810af3582974
content_hash: 3fabf9acba40abb3ec18b749725f7eab08046deae73b3067893acb837928b5c6
status: summarized
tags:
  - 看雪
series: null
ai_summary: Google Integrity校验虽基于硬件可信，但存在漏洞，可通过中间人攻击在已Root设备上伪造通过验证。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 38075244-d011-81c6-af6d-d94264ecd89a
---

> 💡 **AI 总结（key-points）**
>
> Google Integrity校验虽基于硬件可信，但存在漏洞，可通过中间人攻击在已Root设备上伪造通过验证。
> 
> - **核心结论：** 作者通过逆向分析Integrity Token生成过程和Key Attestation原理，证明Google Integrity校验并非绝对可靠，可通过中间人攻击绕过。
> - **攻击条件：** 需要一台拥有Root权限且未解锁Bootloader的设备，作为中间人代理请求，配合Frida脚本拦截和转发。
> - **实验设置：** 使用Y700设备（三绿，已Root）和Pixel6设备（一绿，已Root），通过Frida脚本启动Google Play，模拟中间人攻击。
> - **验证机制：** Key Attestation依赖Tee生成的ECDSA证书链，但后端校验可通过中间人重定向或伪造证书链，使非法设备通过MEETS_DEVICE_INTEGRITY验证。
> - **影响范围：** 银行、金融类APP高度依赖Integrity服务，此漏洞可能被用于伪造可信客户端请求，威胁业务安全。

Google Integrity 一直以绝对可信闻名，基于此大量的银行、金融类APP都高度依赖 Integrity 服务来验证客户端的请求是否可信。但它真的完全可靠吗？怀揣着这个疑问，我深度分析了 Integrity Token 的生成过程与 Key Attestation 的原理。得出的结论是不可靠。

在官方的文档中，想要获取一个 Token 有两种请求方式。分别为传统与标准请求。

传统请求的示例代码为：

标准请求的示例代码为：

这两种请求方式的区别仅仅是标准请求使用了缓存，高频调用的响应速度更快。从业务安全的角度来说是完全一致的。因此，我们以传统请求 API 为例，来

分析完整的生成过程。

首先我们通过 Maven 拿到 Integrity 的 jar 包。然后使用 Jadx 打开定位到 requestIntegrityToken 函数：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3c498dfe259f6068.webp)
![图片描述](https://bbs.kanxue.com/upload/attach/202606/1012164_B69EBUDPH8GVH9R.webp)

发起请求时携带了一个 IntegrityTokenRequest 参数，里面主要包含了获取 Token 的必要参数：nonce、cloudProjectNumber。

进入到 this.a.c 函数：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b77b66c16b2d5e16.webp)

组装 Binder 跨进程调用参数：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/552485a19b178c7d.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/78b943472a8a7600.webp)

发起调用：

最终由 IIntegrityService 做为服务端处理来自客户端的请求，至此我们正式进入 Google Play 源码分析。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/2ff2d091382b851b.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/7885ba210d1deada.webp)

  

由于篇幅的关系，我这里不展开 c 以及一系列子函数的调用。我只大概讲一下它的流程：

在收集的所有信息中，最为人津津乐道的便是 Tee 签名的证书链。这是由绝对安全的硬件空间生成的设备描述信息，按理说是绝对可信的。因为，一旦你更改了返回的证书链，你没办法重签。不重签后端就不认这个证书链，直接判定为伪造。你想要重签，就必须拿到私钥，可是私钥放到 Tee 中，不可导出不可读取。因此，形成了完美闭环。

这套完美的防御体系，看似无懈可击。但是当 Tee 私钥泄漏了之后呢？这条防御链条中最重要的一环，将土崩瓦解。

Google Play 发起 Key Attestation 的代码为：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/66e378f52e53a427.webp)

首先指定别名、密钥生成算法、挑战值（防重放）等信息构建一个 KeyGenParameterSpec

通过 KeyPairGenerator 指定 AndroidKeyStore 为具体的处理服务

generateKeyPair 生成派生密钥对

getCertificateChain 拿到最终的认证证书链

发送给服务端验证

这些调用的背后实际上发生了什么呢？generateKeyPair 具体的流程如下：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/36bf562bf5e1b000.webp)
  
这一步调用完以后 ，Tee 返回一个 X.509 证书链。这个证书链就是 Key Attestation 验证的核心。一般情况下至少包含三个证书：

根据官方文档描述，Leaf Certificat 附带的信息至少包含如下两项：

拿到证书链之后，便组包发给了 Google 后端进行校验。那么在后端是如何校验的呢？依赖的便是在上文中指定的签名算法：EC（secp256r1），实际上使用的算法是：ECDSA（椭圆曲线数字签名算法）secp256r1为指定的椭圆曲线参数。算法具体的签名与验证过程：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/227a4c958176b510.webp)

根据图中的验证过程可知：私钥只签名不参与验证，公钥只验证不参与签名。签名值与公钥分别附加在证书的 Certificate.signatureValue Certificate.TBSCertificate.subjectPublicKeyInfo 中。因为每张证书都由上张证书签名，所以 Google 拿到三张证书依次进行校验：

当校验到 Root Certificate 时，由于没有上级证书。这时拿 Root Certificate 去数据库匹配，如果这张 Root Certificate 是由厂商提交过备案的，则证明整条链条可信。接下来再继续校验 AttestationApplicationId、RootOfTrust 等信息。其中 RootOfTrust 是获得 MEETS\_DEVICE\_INTEGRITY 也就是二绿的关键。这里面携带了设备是否解锁的标识：deviceLocked。并且整个 RootOfTrust 状态是由 Tee 维护的，因此不具备伪造性。

但是当我们拥有一台有 Root 权限并且没有解锁 Bootloader 设备的时候呢？那么这台设备就具备就具备以下两个发起中间人攻击的条件：

设备A：Y700 - 拥有 Root 权限 - 三绿

设备B：Pixel6 - 拥有 Root 权限 - 一绿

Google Play 版本均保持一致（过 AttestationApplicationId 签名校验）

我们使用如下 Frida 脚本启动 Pixel 的 Google Play：

如下脚本启动 Y700 的 Google Play：

然后惊奇的发现：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/328f79d16aafc6fa.webp)

| 设备  | 是否具有Root 权限 | 是否通过 Google Integrity 验证 |
| --- | --- | --- |
| Y700 | 是   | 是   |
| Pixel 6 | 是   | 否   |

```java
import com.google.android.gms.tasks.Task; ...

// Receive the nonce from the secure server.
String nonce = ...

// Create an instance of a manager.
IntegrityManager integrityManager =
    IntegrityManagerFactory.create(getApplicationContext());

// Request the integrity token by providing a nonce.
Task<IntegrityTokenResponse> integrityTokenResponse =
    integrityManager
        .requestIntegrityToken(
            IntegrityTokenRequest.builder().setNonce(nonce).build());
```

```python
import com.google.android.gms.tasks.Task;

// Create an instance of a manager.
StandardIntegrityManager standardIntegrityManager =
    IntegrityManagerFactory.createStandard(applicationContext);

StandardIntegrityTokenProvider integrityTokenProvider;
long cloudProjectNumber = ...;

// Prepare integrity token. Can be called once in a while to keep internal
// state fresh.
standardIntegrityManager.prepareIntegrityToken(
    PrepareIntegrityTokenRequest.builder()
        .setCloudProjectNumber(cloudProjectNumber)
        .build())
    .addOnSuccessListener(tokenProvider -> {
        integrityTokenProvider = tokenProvider;
    })
    .addOnFailureListener(exception -> handleError(exception));
```

[回复或点赞可查看完整内容](#quick_reply_form)

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#漏洞相关](https://bbs.kanxue.com/forum-161-1-123.htm)

* * *

## 评论

> **SomeMx · 2 楼**
> 
> 学习一下

> **wx\_唔. · 3 楼**
> 
> 6666

> **brookwang · 4 楼**
> 
> 学习一下

> **酷伯 · 5 楼**
> 
> 学习一下

> **pareto · 6 楼**
> 
> 1

> **pareto · 7 楼**
> 
> google play 认证 有效果吗

> **4Chan · 8 楼**
> 
> 学习一下

> **apxar · 9 楼**
> 
> 1

> **New对象处 · 10 楼**
> 
> 一大早起来，看到别的群发无root做rpc转发，卷起来了

> **git\_73061mrtdev4 · 11 楼**
> 
> good

> **wlmf · 12 楼**
> 
> mark,话说无root有方案吗？还是说无解

> **温泉划水鱼 · 13 楼**
> 
> ![](https://bbs.kanxue.com/view/img/face/067.gif)

> **mb\_elqwyvnm · 14 楼**
> 
> 学到就是赚到

> **ivy1 · 15 楼**
> 
> 学到就是赚到

> **cobe · 16 楼**
> 
> 666

> **zxc · 17 楼**
> 
> 1

> **MsScotch · 18 楼**
> 
> 划重点：拥有一台有 Root 权限并且没有解锁 Bootloader 设备

> **wx\_666\_974 · 19 楼**
> 
> 学习

> **YAR · 20 楼**
> 
> 666

> **mb\_bvvcoitr · 21 楼**
> 
> 本质上还是play integrity检测太松。否则 deviceIdAttestion 就够喝一壶的

> **mb\_enbuhisq · 22 楼**
> 
> 66666666

> **kingking888 · 23 楼**
> 
> 666

> **Ascend\_202904 · 24 楼**
> 
> 66666666666

> **wx\_Huber Barrientos · 25 楼**
> 
> 666
