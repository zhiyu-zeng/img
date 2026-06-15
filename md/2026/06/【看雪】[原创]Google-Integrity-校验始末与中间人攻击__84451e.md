---
title: 【看雪】[原创]Google Integrity 校验始末与中间人攻击
source: https://bbs.kanxue.com/thread-291541.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-15T17:00:12+08:00
trace_id: b81ed9ae-c800-4734-8f1e-2f377a10a346
content_hash: 54662984cf18f6e6c368f03850e3e852a83ec4cc1e5ab01a5a3cb62e5d412cb8
status: summarized
tags:
  - 看雪
series: null
ai_summary: Google Integrity 校验并非绝对安全，通过中间人攻击利用 Root 权限和未解锁 Bootloader 的设备可绕过其验证机制。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 38075244-d011-81fc-8fe4-da1b7b2763d1
---

> 💡 **AI 总结（key-points）**
>
> Google Integrity 校验并非绝对安全，通过中间人攻击利用 Root 权限和未解锁 Bootloader 的设备可绕过其验证机制。
> 
> - **校验机制：** Integrity Token 生成依赖客户端收集设备信息、包名等，服务端发起 Key Attestation 获取 TEE 证书链，并使用 ECDSA 算法验证签名以确保设备完整性。
> - **Key Attestation 原理：** TEE 生成包含 Root、Attestation 和 Leaf 证书的链条，后端通过公钥验证签名链，并校验 RootOfTrust 等信息来判断设备状态。
> - **攻击前提条件：** 当设备拥有 Root 权限且 Bootloader 未解锁时，既能通过 Integrity 验证，又能导出 Key Attestation 证书链，从而具备中间人攻击基础。
> - **攻击方法：** 使用 Frida 脚本 hook API 调用，将未通过验证设备的证书链请求转发到已通过验证的设备，获取有效证书链以绕过校验。
> - **实验验证：** 在 Pixel 6（未通过验证）和 Y700（通过验证）上实施攻击，成功绕过 Integrity 校验，证明其脆弱性。

Google Integrity 一直以绝对可信闻名，基于此大量的银行、金融类APP都高度依赖 Integrity 服务来验证客户端的请求是否可信。但它真的完全可靠吗？怀揣着这个疑问，我深度分析了 Integrity Token 的生成过程与 Key Attestation 的原理。得出的结论是不可靠。

### Integrity Token 的生成

在官方的文档中，想要获取一个 Token 有两种请求方式。分别为传统与标准请求。

传统请求的示例代码为：

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

标准请求的示例代码为：

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

这两种请求方式的区别仅仅是标准请求使用了缓存，高频调用的响应速度更快。从业务安全的角度来说是完全一致的。因此，我们以传统请求 API 为例，来

分析完整的生成过程。

#### 客户端分析

首先我们通过 Maven 拿到 Integrity 的 jar 包。然后使用 Jadx 打开定位到 requestIntegrityToken 函数：  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3c498dfe259f6068.webp)

发起请求时携带了一个 IntegrityTokenRequest 参数，里面主要包含了获取 Token 的必要参数：nonce、cloudProjectNumber。

进入到 this.a.c 函数：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b77b66c16b2d5e16.webp)

-   将 nonce 解码为 byte\[\]
-   初始化 TaskCompletionSource 回调类
-   初始化 an 执行类（继承自 Runnable ）
-   this.a.u 启动 an 线程

组装 Binder 跨进程调用参数：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/552485a19b178c7d.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/78b943472a8a7600.webp)

发起调用：

最终由 IIntegrityService 做为服务端处理来自客户端的请求，至此我们正式进入 Google Play 源码分析。

#### 服务端分析

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/2ff2d091382b851b.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/7885ba210d1deada.webp)

  

-   经由 dispatchTransaction 转发到 c 函数
-   由 c 函数具体处理客户端的请求

由于篇幅的关系，我这里不展开 c 以及一系列子函数的调用。我只大概讲一下它的流程：

-   接收客户端参数
-   验证客户端的身份（通过 Binder.getCallingUid() 验证 Uid 是否与包名相等）
-   收集设备信息（ro.build.product、ro.product.brand、ro.vendor.build.fingerprint）
-   收集登录账号信息（用于验证是否具有指定 APP 的安装权限）
-   收集包名信息（通过 PMS 获取版本号、签名 Signature\[\] apkContentsSigners = signingInfo.hasMultipleSigners()? signingInfo.getApkContentsSigners(): signingInfo.getSigningCertificateHistory(); 、安装来源标识等……）
-   将包名等信息转发给 GMS DroidGuard 签名
-   发起 Key Attestation 挑战拿到 Tee 证书链（验证设备是否已解锁）
-   将所有信息组装为 Protobuf 数据包发给后端验证
-   后端返回 Integrity Token 回调客户端

```json
Request Body：
{
  "type": "IntegrityRequestParameters",
  "deviceIntegritySignals": {
    "type": "DeviceIntegritySignals",
    "droidguardTokenByteString": {
      "type": "ByteString",
      "size": 39032,
      "sha256": "bd5a30d9d722df7e36397b918861aa9084ef9eb54ae31255926e7552e84e4104",
      "asciiPreview": "..'..i........O.].....[.....s.......D.Q..M.w+.t..o...@..{HD..~-..U'....V.Y..z......._.}......DL.",
      "hexPreview": "0a06270ae369a80012c1b0020a064c06f22f2f1e1e68ae3126dba9ac7ae367a7488b1cc40d81ff230e19a6c55d75537e7d3",
      "base64Preview": "CgYnCuNpqAASwbACCgZPrF2VyZrSEFsAAOOyvHOlh8C+TYZbQWkeIyFfTKs5JIvjXQqUIFrFi1qWSY0nXJZIXfHo0tpmUUwpdGWPHySiA"
    },
    "flowName": "pia_attest_e1",
    "keyAttestationMetadata": {
      "type": "bmyq",
      "raw": "# bmyq@5eb8d24",
      "field_b": "2",
      "field_d": "null",
      "field_e": "# bmyn@7c344",
      "field_f": "null",
      "certificateChain": [
        {
          "type": "ByteString",
          "size": 678,
          "sha256": "984470b2b5ceafcdcd705c1a6285bc93ffe420fea2d25d373dcdc3949ac85fda",
          "asciiPreview": "0...0..H........0...*.H.=...091.0...U....TEE1)0'..U... 22317fdd8510cac935893090d9b6e2a00...70010",
          "hexPreview": "308202a230820248a003020102020101300a060828648ce3d020106082a8648ce3d0301070342000413a0b0fdc54e9e1861e41bdc30",
          "base64Preview": "MIICojCCAkigAwIBAgIBATAKBggqhkjOPQQDAjA5MQwwC30Oo4IBWTCCAVUwDgYDVR0PAQH/BAQDAgeAMIIBQQYKKwYBBAHWeQIBEQSCATEw"
        },
        {
          "type": "ByteString",
          "size": 503,
          "sha256": "5e6af0046b0b9faf744df21648abe4e049c1c7e5c0de06b830e6b784187d7e8d",
          "asciiPreview": "0...0..y........&..Y...O.B....M0...*.H.=...091.0...U....TEE1)0'..U... d492ff615155c8a4a60926ded6",
          "hexPreview": "308201f330820179a00302010202101c26a48a5902c1a64f97429fadfbe538393330393064396236653261",
          "base64Preview": "MIIB8zCCAXmgAwIBAgIQHCakilkCwaZPl0KfrfvhTTAKBggqhkjOCWgwDTmGjYzBh"
        },
        {
          "type": "ByteString",
          "size": 920,
          "sha256": "2812ef63dd35e8d8c7cbc6453dbd7961ec5f1e3645d4eae0584dbd383f0ae7ec",
          "asciiPreview": "0...0..|...................G..w.0...*.H........0.1.0...U....f92009e853b6b0450...240202225757Z..3",
          "hexPreview": "308203943082017ca003020102021100941cbcc1e8a41de02e17e847c3b877db300d06092a052b810400220362000408",
          "base64Preview": "MIIDlDCCAXygAwIBAgIRAJQcvMHopB3gLhfoR8O4d9swDQYJKoZIhvcNAQELBQAwGzEZMBcGABGuj"
        },
        {
          "type": "ByteString",
          "size": 1312,
          "sha256": "cedb1cb6dc896ae5ec797348bce9286753c2b38ee71ce0fbe34a9a1248800dfc",
          "asciiPreview": "0...0.............r.....0...*.H........0.1.0...U....f92009e853b6b0450...220320180748Z..420315180",
          "hexPreview": "3082051c30820304a0030201041663abef982f32c77f7531030c9752",
          "base64Preview": "MIIFHDCCAwSgAwIBAgIJAPHBcqaZ6vUdM+T+W8a9nsNL/ggj"
        }
      ],
      "certificateChainCount": 4
    },
    "buildFingerprintMetadata": {
      "type": "bmyh",
      "fingerprint": "Lenovo/TB320FC_PRC/TB320FC:15/AQ3A.240812.002/ZUXOS_1.1.350_250418_PRC:user/release-keys",
      "raw": "# bmyh@8f6a54a8"
    }
  },
  "packageName": "gr.nikolasspyr.integritycheck",
  "versionCode": 22,
  "nonce": "4X4a4MUeHGybbu9GQF9vYBbqYTg==",
  "certificateSha256Digests": [
    "F5UrXPhnBbreh3Q_WjMe_kyYK_tNoNL9XXC_wjXPeeM"
  ],
  "timestampAtRequest": "2026-04-18T13:45:51.190Z",
  "cloudProjectNumber": null,
  "playCoreVersion": {
    "type": "bmyu",
    "major": 1,
    "minor": 4,
    "patch": 0,
    "versionString": "1.4.0"
  },
  "playProtectDetails": {
    "type": "bmyv",
    "raw": "# bmyv@7bcd9",
    "fields": {
      "b": "1",
      "c": "2"
    }
  },
  "appAccessRiskDetailsResponse": {
    "type": "abfk",
    "raw": "AppAccessRiskDetailsResponse{installedAppsSignalData={2=[com.motorola.mobiledesktop, com.zui.pp, com.zui.wifip2p, com.lenovo.penservice, com.lenovo.ue.device, com.lenovo.levoice.trigger, com.zui.safecenter, com.qualcomm.qti.services.systemhelper, com.zui.cores, com.dolby.dolbyvisionservice, vendor.qti.qesdk.sysservice, com.qualcomm.qti.uceShimService, com.qualcomm.qti.dynamicddsservice, com.qti.dpmserviceapp, com.motorola.android.providers.settings], 6=[bin.mt.plus]}, accessibilityAbuseSignalData={}, displayListenerMetadata=DisplayListenerMetadata{isActiveDisplayPresent=false, displayListenerInitialisationTimeDelta=Optional.empty, lastDisplayAddedTimeDelta=Optional[PT-0.001S], displayListenerUsed=2}, signalGenerationLatency=PT0.002342813S, signalGenerationBreakdownTelemetry=SignalGenerationBreakdownTelemetry{requestParametersLatency=RequestParametersLatencyBreakdown{installedPackages=PT0.040158698S, runningAppProcesses=PT0.002319791S, runningServices=PT0.001184271S, activeDisplays=PT0.001730833S, enabledAccessibilityServices=PT0.004136928S, mediaProjectionDebugDump=PT0.001912032S, runningApps=PT0.000196459S, installedPackagesIsRecognized=PT0.000449375S, appOpsToOpEntry=PT0.00093677S, manifestPermissionToPackages=PT0.067272969S, activeDisplayInfo=PT0.000058125S, accessibilityServiceData=PT0.000021302S, runningMediaProjectionTypeServicePackages=PT0.000812031S}, installedAppsSignalLatency=PT0.000189688S, screenCaptureSignalLatency=PT0.00091099S, accessibilityAbuseSignalLatency=PT0.000031927S, screenOverlaySignalLatency=PT0.000257761S, displayListenerMetadataLatency=PT0.001320938S}}"
  },
 "installSourceMetadata": {
        "type": "bmyk",
        "formatted": "1:1,2:1,3:0,4:1,5:[],6:0",
        "raw": {
          "c": "31",
          "d": "1",
          "e": "1",
          "f": "0",
          "g": "1",
          "i": "0"
        }
      },
      "locationTrustMetadata": null,
      "deviceIdentifier": {
        "type": "ByteString",
        "size": 64,
        "sha256": "e47aa4c751f9079c06367ff3814e9bb441c754242e2154929de5067a680a3b4e",
        "ascii": "894ce4844f1b477fa99a4f515de4acaa80121998b19efe3e7faffae6497be163",
        "hex": "383934636534383434663162343737669376265313633",
        "base64": "ODk0Y2U0ODQ0ZjFiNDc3ZmE5="
      }
    }
}

Response Body:
{
  "token": "eyJhbGciOiJBMjU2S1ciLCJlbmMiOiJBMjU2R0NNIn0.ullChctbyhVID6nmtbgtcMqN3fxb2tsNIeLD9baKL6YnkFjbfjGcWSyADMZLeaK1XbmSYMO3OegfoX0CwEQkSDSa3bfwfM9Bo_NTD3b8i_hXCkpdAuPpahcLy_VLh5tvcqwSx7KAFEyg5IxkPPGeIIVehPwi22xBPcq3V5Pe7NOF705Av4nXv1-GgP9t5IPnf3moFbo4lqMJBANi8.35KbgY4kp8sL9jJyRNjE5w",
  "statusCode": "0",
  "extra": "null",
}
```

在收集的所有信息中，最为人津津乐道的便是 Tee 签名的证书链。这是由绝对安全的硬件空间生成的设备描述信息，按理说是绝对可信的。因为，一旦你更改了返回的证书链，你没办法重签。不重签后端就不认这个证书链，直接判定为伪造。你想要重签，就必须拿到私钥，可是私钥放到 Tee 中，不可导出不可读取。因此，形成了完美闭环。

这套完美的防御体系，看似无懈可击。但是当 Tee 私钥泄漏了之后呢？这条防御链条中最重要的一环，将土崩瓦解。

### Key Attestation 的原理

Google Play 发起 Key Attestation 的代码为：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/66e378f52e53a427.webp)

-   首先指定别名、密钥生成算法、挑战值（防重放）等信息构建一个 KeyGenParameterSpec
    
-   通过 KeyPairGenerator 指定 AndroidKeyStore 为具体的处理服务
    
-   generateKeyPair 生成派生密钥对
    
-   getCertificateChain 拿到最终的认证证书链
    
-   发送给服务端验证
    

这些调用的背后实际上发生了什么呢？generateKeyPair 具体的流程如下：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/36bf562bf5e1b000.webp)
  
这一步调用完以后 ，Tee 返回一个 X.509 证书链。这个证书链就是 Key Attestation 验证的核心。一般情况下至少包含三个证书：

-   Root Certificate（厂商根证书（预存在 Tee），必须交由 Google 备案。否则不能通过验证。）
-   Attestation Certificate（中间证书（预存在 Tee），当前设备的证书。必须经过 Root Private Key 签名。）
-   Leaf Certificate（叶子证书（Tee 动态生成的证书），必须经过 Attestation Private Key 签名。附带大量的设备描述与辅助验证信息）

根据官方文档描述，Leaf Certificat 附带的信息至少包含如下两项：

1.  RootOfTrust（用于校验设备是否已解锁）
2.  AttestationApplicationId（用于校验发起密钥认证的 APP 签名）

拿到证书链之后，便组包发给了 Google 后端进行校验。那么在后端是如何校验的呢？依赖的便是在上文中指定的签名算法：EC（secp256r1），实际上使用的算法是：ECDSA（椭圆曲线数字签名算法）secp256r1为指定的椭圆曲线参数。算法具体的签名与验证过程：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/227a4c958176b510.webp)

根据图中的验证过程可知：私钥只签名不参与验证，公钥只验证不参与签名。签名值与公钥分别附加在证书的 Certificate.signatureValue Certificate.TBSCertificate.subjectPublicKeyInfo 中。因为每张证书都由上张证书签名，所以 Google 拿到三张证书依次进行校验：

-   r, s = decode\_ecdsa\_signature(Leaf.signatureValue); ecdsa\_verify(Leaf.TBSCertificate, r, s, Attestation Public Key)
-   r, s = decode\_ecdsa\_signature(AttestationsignatureValue); ecdsa\_verify(Attestation.TBSCertificate, r, s, Root Public Key)

```python
def ecdsa_verify(message, r, s, Q):
    # 1. 检查签名范围
    if r <= 0 or r >= n:
        return False

    if s <= 0 or s >= n:
        return False

    # 2. 计算消息哈希
    e = sha256(message)

    # 3. 求 s 的模逆
    w = inverse_mod(s, n)

    # 4. 计算两个系数
    u1 = (e * w) % n
    u2 = (r * w) % n

    # 5. 椭圆曲线点运算
    P = point_add(
            scalar_mult(u1, G),
            scalar_mult(u2, Q)
        )

    if P is INF:
        return False

    # 6. 验证
    x = P.x % n

    return x == r
```

当校验到 Root Certificate 时，由于没有上级证书。这时拿 Root Certificate 去数据库匹配，如果这张 Root Certificate 是由厂商提交过备案的，则证明整条链条可信。接下来再继续校验 AttestationApplicationId、RootOfTrust 等信息。其中 RootOfTrust 是获得 MEETS\_DEVICE\_INTEGRITY 也就是二绿的关键。这里面携带了设备是否解锁的标识：deviceLocked。并且整个 RootOfTrust 状态是由 Tee 维护的，因此不具备伪造性。

但是当我们拥有一台有 Root 权限并且没有解锁 Bootloader 设备的时候呢？那么这台设备就具备就具备以下两个发起中间人攻击的条件：

-   能通过 Google Integrity 验证（因为 BootLoader 未解锁）
-   能将 Key Attestation 的证书链导出（因为拥有 Root 权限）

### 中间人攻击实验

设备A：Y700 - 拥有 Root 权限 - 三绿

设备B：Pixel6 - 拥有 Root 权限 - 一绿

Google Play 版本均保持一致（过 AttestationApplicationId 签名校验）

| 设备  | 是否具有Root 权限 | 是否通过 Google Integrity 验证 |
| --- | --- | --- |
| Y700 | 是   | 是   |
| Pixel 6 | 是   | 否   |

我们使用如下 Frida 脚本启动 Pixel 的 Google Play：

```javascript
// 伪代码：
let cache_certificate_chain = []

function sendToY700(challenge) {
    // connect server
    // send challenge
    return certificate_chain
}

function hook() {
    Java.perform(function () {
        const KeyPairGeneratorSpec = Java.use('android.security.keystore.KeyGenParameterSpec$Builder');
        KeyPairGeneratorSpec.setAttestationChallenge.overload('[B').implementation = function (challenge) {
            cache_certificate_chain = sendToY700(challenge)
            return this.setAttestationChallenge(challenge);
        };


        const SecLevel = Java.use('android.security.keystore2.IKeystoreSecurityLevel$Stub$Proxy');
        SecLevel.getCertificateChain.implementation = function () {
            return cache_certificate_chain
        };

    });
}

setImmediate(hook)
```

如下脚本启动 Y700 的 Google Play：

```javascript
// 伪代码：
function receiveFormPixel6(challenge) {
    let KeyGenParameterSpec keyGenParameterSpecBuild = new KeyGenParameterSpec.Builder("integrity.api.key.alias", 4).setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1")).setDigests("SHA-512").setAttestationChallenge(challenge).setDevicePropertiesAttestationIncluded(false).build();
    let KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("EC", "AndroidKeyStore");
    keyPairGenerator.initialize(keyGenParameterSpecBuild);
    if (keyPairGenerator.generateKeyPair() == null) {
        throw new IllegalStateException("Failed to create the key pair.");
    }
    let String keystoreAlias = keyGenParameterSpecBuild.getKeystoreAlias();
    return keyStore.getCertificateChain(keystoreAlias);
}
```

然后惊奇的发现：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/328f79d16aafc6fa.webp)

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
