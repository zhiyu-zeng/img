---
title: 结合AI对WhatsApp的分析（三） - 奋飞安全
source: http://91fans.com.cn/post/whatsappthr/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:30:14+08:00
trace_id: 65d846f2-b9e9-46d1-8897-7bf78c00f317
content_hash: 4d11c4c0ae9b5c7a18ce6d5826beccd6756fa014a10c9a431a0e957322f44c6f
status: synced
tags:
  - Android逆向
  - AI辅助逆向
series: null
feed_source: 91fans·逆向
ai_summary: WhatsApp的jnidispatchOO算法实为AndroidKeyStore中ECDSA私钥对数据做SHA256withECDSA签名，AI辅助写成了公钥提取与验证Demo。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3b275244-d011-8170-b419-db206f0598c1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WhatsApp的jnidispatchOO算法实为AndroidKeyStore中ECDSA私钥对数据做SHA256withECDSA签名，AI辅助写成了公钥提取与验证Demo。
> 
> - **算法确认：** Hook `jnidispatchOO` 并对照Jadx，i==3时调用链进入 `C51032Wh.A01.A07`，实际通过AndroidKeyStore中的私钥执行 `Signature.sign()`，算法为 SHA256withECDSA。
> - **签名流程：** App生成ECDSA密钥对并存储于AndroidKeyStore，本地用私钥对数据签名，公钥以X.509证书链形式放在请求头 `Authorization` 上传，服务器用公钥验签。
> - **长证书解释：** Authorization头中的Base64串是完整X.509证书链，包含签名算法标识、公钥、所有者、有效期、扩展字段和签名值，经ASN.1/DER编码后再Base64编码，因此远长于91字节的ECDSA P-256公钥DER结构。
> - **AI辅助效果：** AI能解释证书长度差异、区分压缩/未压缩公钥与DER编码，并直接生成提取公钥和验签的Python代码，但整体逆向思路和Hook定位仍需人工引导。

一、目标

## 一、目标

书接上文 [结合AI对WhatsApp的分析（二）](http://91fans.com.cn/post/whatsapptow/) ，我们找到了 jnidispatchOO ，下一步就是搞定它的具体算法。

## 二、步骤

### 先HOOK

```javascript
let JniBridge = Java.use("com.whatsapp.wamsys.JniBridge");
JniBridge["jnidispatchOO"].implementation = function (i, obj) {

        let bCls = Java.use('[B')

        if(i == 3){
                let buffer = Java.cast(obj, bCls);
                let rc1 = Java.array('byte', buffer);

                console.log(` ---- JniBridge.jnidispatchOO is called: i=${i}, obj=${buf2hex(rc1)}`);
        }

        let result = this["jnidispatchOO"](i, obj);

        if(i == 3){
                let buffer2 = Java.cast(result, bCls);
                let rc2 = Java.array('byte', buffer2);

                console.log(` ---- JniBridge.jnidispatchOO result = ${buf2hex(rc2)}`);
        }
        return result;
};
```

跑一下

```javascript
 ---- JniBridge.jnidispatchOO result = 3045022031c495bb8bf2bbe39124b0c539cc0929e3d6cf1960874ecd019a0e7412160506022100a056754c60d842fd2e12aa06fd00aae06999d8808e213875424e4489ce26ff28

// 对应的 base64 = MEUCIDHElbuL8rvjkSSwxTnMCSnj1s8ZYIdOzQGaDnQSFgUGAiEAoFZ1TGDYQv0uEqoG/QCq4GmZ2ICOITh1Qk5Eic4m/yg=
```

确认了眼神，这次没错了

### 上Jadx

```javascript
public static Object jnidispatchOO(int i, Object obj) {
    ...
     case 3:
        byte[] bArr2 = (byte[]) obj;
        C51032Wh c51032Wh = (C51032Wh) INSTANCE.jniCallbacksIJniCallbacks.A04.get();
        if (!AbstractC17350u8.A01() || bArr2 == null) {
            return null;
        }
        // 这个 A01.A07 应该就是计算H的位置
        return c51032Wh.A01.A07(bArr2, c51032Wh.A00.A0J());
    ...
}

// X.17J
 public byte[] A07(byte[] bArr, byte[] bArr2) {
        byte[] bArr3 = null;
        if (!A06()) {
            return null;
        }
        A02(C00Q.A01, bArr2);
        long elapsedRealtime = SystemClock.elapsedRealtime();
        try {
            try {
                                // 从android的KeyStore拿到密钥
                KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
                keyStore.load(null);
                KeyStore.Entry entry = keyStore.getEntry(A01(), null);
                if (entry instanceof KeyStore.PrivateKeyEntry) {
                    Signature signature = Signature.getInstance(AbstractC15060oI.A01(C15080oK.A02, this.A02, 2075));
                    signature.initSign(((KeyStore.PrivateKeyEntry) entry).getPrivateKey());
                    signature.update(bArr);
                                        // H 就是这里来的
                    bArr3 = signature.sign();
                } else {
                    Log.e("blacknoise/Not an instance of a PKEntry");
                    this.A04.A0H("attestation-nosign", "cannot sign payload, att pair missing", true);
                }
            } catch (Exception e) {
                Log.e("blacknoise/exception on pair sign", e);
                AbstractC213314r abstractC213314r = this.A04;
                StringBuilder sb = new StringBuilder();
                sb.append("unable to sign payload: ");
                sb.append(e.getMessage());
                abstractC213314r.A0F("attestation-nosign", sb.toString(), e);
            }
            return bArr3;
        } finally {
            C17K c17k = new C17K();
            c17k.A00 = Long.valueOf(SystemClock.elapsedRealtime() - elapsedRealtime);
            c17k.A02 = "att-sign";
            this.A06.CG2(c17k);
        }
    }
```

我们再 Hook一下 java.security.Signature.getInstance

```javascript
var Signature = Java.use("java.security.Signature");

Signature.getInstance.overload("java.lang.String").implementation = function(algorithm) {
        console.log(`/* TID ${gettid()} */` + "[*] Hooked Signature.getInstance");
        console.log("    Algorithm: " + algorithm);
    return this.getInstance(algorithm);
};

// 打印
/* TID 10091 */[*] Hooked Signature.getInstance
    Algorithm: SHA256withECDSA
```

这次形势明朗了 SHA256withECDSA

App生成一对ECDSA的公钥和私钥，本地用私钥给数据做sign，把公钥和sign结果传给服务器，服务器用公钥去做verify。

把这些数据扔给AI，AI轻松就把Demo代码写好了。

### 新的问题，证书不对。

公钥上传的位置只有一种可能，放在请求头的 Authorization

新的问题是，AI给我生成的公钥是91个字节，明显小于 Authorization

继续问AI

```bash
ME: MIIFHDCCAwSgAwIBAgIJANUP8luj8tazMA0GCSqGSIb3DQEBCwUAMBsxGTAXBgNV(完整的Authorization头贴上去) 为什么这个证书这么长，我只需要SHA256withECDSA的公钥证书，应该是91个字节才对

AI: 你贴的是一大串 Base64 编码后的证书链，这其实是**X.509 证书（或多个）**的完整内容，被编码成了一大段字符串，常见于 .pem 或 .crt 文件中。
确实看起来非常长，但这并不是“公钥”的长度，而是整个证书的编码内容。

解答你的两个关键疑问：
❓ 1. 为什么这个证书这么长？
因为它不仅仅包含公钥，而是包含了：

签名算法标识（如 SHA256withECDSA）
公钥（你想要的）
证书所有者信息（issuer, subject, 序列号等）
有效期（not before / not after）
签名值
扩展字段（可能还包含 CA 标识、密钥用法等）
这些内容都被 ASN.1/DER 格式编码，然后再被 base64 编码，所以变得很长。

❓ 2. 我只需要 SHA256withECDSA 的公钥部分，应该是 91 字节左右，怎么提取？
你说的“91字节”是 ECDSA P-256（secp256r1）曲线上的压缩公钥长度：

压缩格式：33 字节
未压缩格式：65 字节
公钥 DER 编码结构，整体会有 91 个字节左右（SEQUENCE -> BIT STRING -> ECPoint）

需要哪种？可以直接发一句：“帮我提取公钥（hex）”之类的，我马上给你。
```

必须要，帮我写个python代码把里面的 SHA256withECDSA 提取出来，然后写个 verify 的Demo。

## 三、总结

AI不能直接帮你写好ws的H算法，但是能按照你的思路辅助你把H算法写出来。

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/96408a8e0d80bc96.webp)

1:ffshow

AI只是强健的四肢+翅膀，你才是大脑，决定飞向哪里

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
