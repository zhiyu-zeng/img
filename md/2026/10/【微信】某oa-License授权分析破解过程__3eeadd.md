---
title: 【微信】某oa License授权分析破解过程
source: https://mp.weixin.qq.com/s/QGIkuapdMUGNF3_sfG2ymQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-23T14:39:19+08:00
trace_id: b74f8fad-80fd-4ed8-b9e2-3ce8d26e617a
content_hash: 559fe0cd36a6e1ca06b95e1eba1953fd8049fc35dc72f5a6ce46e9bb3490294c
status: synced
tags:
  - 微信
  - Android逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 该 OA 系统 License 机制存在"公钥随数据下发"的根本缺陷，可自行生成密钥对伪造 License，无需破解私钥。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 40275244-d011-8164-a507-d7790025bb7d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该 OA 系统 License 机制存在"公钥随数据下发"的根本缺陷，可自行生成密钥对伪造 License，无需破解私钥。
> 
> - **授权校验链：** 取本机 MAC → MD5（大写十六进制）作识别码 → 读取 `license/<md5>.license`（临时授权走 `licensetemp/`）→ 解密 → 验签 → 比对 MAC 与有效期，任一失败即返回对应中文错误信息。
> - **文件结构：** 解密后明文为 `Base64(RSA公钥)|参数串|Base64(RSA签名)` 三段；参数串为 `k=v,k=v` 形式，经反射按白名单写入 `WxBaseLicense` 字段，int 解析失败兜底为 0。
> - **硬编码解密参数：** 算法 `PBEWITHMD5andDES`，口令 `weaver`，盐 `vM4B96HaxG0=`，迭代 100 次；实际只解密第一段，密钥由 MD5 循环派生，前 8 字节为 DES Key、后 8 字节为 IV。
> - **核心缺陷：** `SignProvider.verify` 使用的公钥来自 License 文件自身的第一段（X509 编码，MD5withRSA 1024 位），等于自签自验；攻击者本地生成密钥对即可通过校验。
> - **利用方式：** 脚本按目标 MAC 生成参数串并自签名，用同一 PBE 参数加密输出 `<macMd5>.license`，还附带复刻原校验逻辑的本地验证；注意中文 Windows 下 `getBytes()` 使用 GBK。

**安全逐梦人** *2026年10月23日 14:00*

## 1\. 代码流程图

简单来说，系统会读取服务器网卡的 MAC 地址，经过 MD5 处理后作为授权文件的识别码。License 文件经过加密，里面包含公钥、授权信息和签名。系统解密后会验证签名，并检查服务器 MAC 地址和授权有效期，全部通过才算授权有效。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/90e8ec10dfec2051.png)

## 2\. 验证主流程：ReadLN.readLN

```java
public static WxBaseLicense readLN(boolean ifTemp) {
        WxBaseLicense wxln = new WxBaseLicense();
        String msg = "";
        boolean ifTrue = false;
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        try {
            GetPhysicalAddress ga = new GetPhysicalAddress(PathKit.getWebRootPath());
            String macAddr = ga.getPhysicalAddress();
            if (!macAddr.equals("not find")) {
                File file;
                String md5MacAddr = LnUtil.getMd5(macAddr);
                wxln.setMacAddr(md5MacAddr);
                String filePath = String.valueOf(PathKit.getWebRootPath()) + "/license/" + md5MacAddr + ".license";
                if (ifTemp) {
                    filePath = String.valueOf(PathKit.getWebRootPath()) + "/licensetemp/" + md5MacAddr + ".license";
                }
                if ((file = new File(filePath)).exists()) {
                    String license = ReadLN.readLincense(filePath);
                    if (!license.equals("")) {
                        String[] l = license.split("\\|");
                        if (l != null && l.length == 3) {
                            String pubKey = l[0];
                            String params = l[1];
                            String key = l[2];
                            ifTrue = SignProvider.verify(pubKey.getBytes(), params, key.getBytes());
                            if (ifTrue) {
                                String[] ps = params.split(",");
                                if (ps != null && ps.length > 0) {
                                    String[] stringArray = ps;
                                    int n = ps.length;
                                    int n2 = 0;
                                    while (n2 < n) {
                                        String[] kv;
                                        String p = stringArray[n2];
                                        if (p != null && !p.equals("") && (kv = p.split("=")) != null && kv.length == 2 && lnMap.containsKey(kv[0])) {
                                            PropertyDescriptor pd = new PropertyDescriptor(kv[0], wxln.getClass());
                                            Method wM = pd.getWriteMethod();
                                            if (lnMap.get(kv[0]).equals("class java.lang.String")) {
                                                wM.invoke(wxln, kv[1]);
                                            } else if (lnMap.get(kv[0]).equals("int")) {
                                                wM.invoke(wxln, ReadLN.getIntValue(kv[1], 0));
                                            }
                                        }
                                        ++n2;
                                    }
                                    if (wxln.getMacAddr() != null && !wxln.getMacAddr().equals("")) {
                                        if (!wxln.getMacAddr().equals(md5MacAddr)) {
                                            wxln.setMacAddr(md5MacAddr);
                                            ifTrue = false;
                                            msg = "mac\u5730\u5740\u9519\u8bef";
                                        }
                                    } else {
                                        ifTrue = false;
                                        msg = "\u6ca1\u6709\u83b7\u53d6\u5230mac\u5730\u5740\u4fe1\u606f";
                                    }
                                    if (wxln.getExpDate() != null && !wxln.getExpDate().equals("")) {
                                        Date expDate = sdf.parse(String.valueOf(wxln.getExpDate()) + " 23:59:59");
                                        if (expDate.getTime() < System.currentTimeMillis()) {
                                            ifTrue = false;
                                            msg = "license\u6709\u6548\u671f\u5df2\u8fc7,\u8bf7\u91cd\u65b0\u7533\u8bf7";
                                        }
                                    } else {
                                        wxln.setExpDate("\u6c38\u4e45\u6709\u6548");
                                    }
                                } else {
                                    ifTrue = false;
                                    msg = "license\u4e2d\u6821\u9a8c\u53c2\u6570\u683c\u5f0f\u4e0d\u5bf9";
                                }
                            } else {
                                msg = "license\u9a8c\u8bc1\u5931\u8d25";
                            }
                        } else {
                            msg = "license\u683c\u5f0f\u4e0d\u5408\u6cd5";
                        }
                    } else {
                        msg = "\u89e3\u6790license\u51fa\u9519";
                    }
                } else {
                    msg = "license\u6587\u4ef6\u4e0d\u5b58\u5728";
                }
            } else {
                msg = "\u8bfb\u53d6MAC\u5730\u5740\u5931\u8d25";
            }
        }
        catch (Exception e) {
            msg = "\u8bfb\u53d6license\u4fe1\u606f\u5931\u8d25:" + e.getMessage();
        }
        wxln.setIfTrue(ifTrue);
        wxln.setMsg(msg);
        if (ifTrue) {
            ReadLN.setModuleLicense(wxln);
        }
        return wxln;
    }
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/577f385450cc5f7c.png)

### 2.1 获取本机 MAC 地址

```
GetPhysicalAddress ga = new GetPhysicalAddress(PathKit.getWebRootPath());
String macAddr = ga.getPhysicalAddress();
```

Windows 下 `ProcessBuilder("ipconfig", "/all")` 启动子进程，GBK 逐行读输出，匹配 `Physical Address` / 物理地址 行取冒号后的地址。  
linux 下同理跑 `ifconfig` 匹配 `HWaddr` 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2fbfd6706993e332.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f197ad2a84a71e22.png)

### 2.2 计算 MAC 的 MD5

```
String md5MacAddr = LnUtil.getMd5(macAddr);
wxln.setMacAddr(md5MacAddr);
```

### 2.3 定位并读取 License 文件

```javascript
String filePath = webRoot + "/license/" + md5MacAddr + ".license";
if (ifTemp) filePath = webRoot + "/licensetemp/" + md5MacAddr + ".license";
if (new File(filePath).exists()) {
    String license = ReadLN.readLincense(filePath);   // 解密入口
    ...
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a74219540310d84c.png)

### 2.4 验签与参数解析（readLN 中段）

解密得到明文后按 `|` 拆三段，结构是：

```
Base64(RSA公钥) | 参数串(k=v,k=v,...) | Base64(RSA签名)
```

```
String[] l = license.split("\\|");
if (l != null && l.length == 3) {                  // 段数≠3 → "license格式不合法"
    ifTrue = SignProvider.verify(l[0].getBytes(), l[1], l[2].getBytes());
    // 验签失败 → "license验证失败"
```

验签通过后，参数串按 `,` 拆成 `k=v` ，反射写入 `WxBaseLicense` 同名字段：

```java
if (kv.length == 2 && lnMap.containsKey(kv[0])) {  // 白名单=bean的全部字段名
    PropertyDescriptor pd = new PropertyDescriptor(kv[0], wxln.getClass());
    Method wM = pd.getWriteMethod();
    if (类型是String) wM.invoke(wxln, kv[1]);
    else if (类型是int) wM.invoke(wxln, getIntValue(kv[1], 0));  // 解析失败兜底0
}
```

## 3\. 解密：readLincense → PBECipher

按 `|` 拆段 → **只把第 1 段** 交给 `PBECipher.PBEDecrypt` ，其余段交给 `readModuleLicense` 入库

```
String[] le = license.split("\\|");
license = PBECipher.PBEDecrypt(le[0]);
  if (le.length > 1) {
      ReadLN.readModuleLicense(le, 1);
}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0d395e2e23582dc6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c9c93d47cb50154d.png)

`PBECipher` 的关键—— **口令、盐、算法全部硬编码**：

```java
private static final String ALGORITHM_PBE = "PBEWITHMD5andDES";
private static final String PASSWORD = "weaver";       // ← 口令
private static final String SALT     = "vM4B96HaxG0=";  // ← Base64 盐, 迭代100次
```

解密链路： `PBEKeySpec("weaver")` 派生密钥 → 固定盐+迭代次数构参 → `Cipher.doFinal(Base64.decode(data))` 。

## 4\. 验签：SignProvider.verify

```java
package weaver.weixin.license;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import weaver.weixin.license.Base64;

public class SignProvider {
    private SignProvider() {
    }

    public static boolean verify(byte[] pubKeyText, String plainText, byte[] signText) {
        try {
            X509EncodedKeySpec bobPubKeySpec = new X509EncodedKeySpec(Base64.decode(pubKeyText));
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            PublicKey pubKey = keyFactory.generatePublic(bobPubKeySpec);
            byte[] signed = Base64.decode(signText);
            Signature signatureChecker = Signature.getInstance("MD5withRSA");
            signatureChecker.initVerify(pubKey);
            signatureChecker.update(plainText.getBytes());
            return signatureChecker.verify(signed);
        }
        catch (Throwable e) {
            e.printStackTrace();
            return false;
        }
    }
}
```

`pubKeyText` 是 license 文件的 **第 1 段**——公钥来自 **被验证的数据自身**。这是整个机制最核心的缺陷。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/22fb83c2e787638b.png)

```python
# -*- coding: utf-8 -*-
"""

对应源码:
    ReadLN.readLN()     读取与校验
    PBECipher            PBEWITHMD5andDES / weaver / vM4B96HaxG0= / 100 轮
    SignProvider.verify  MD5withRSA 1024 位验签
    MD5.byteHEX()        大写十六进制！文件名与 macAddr 都用大写

用法:
    python gen_license.py --all-local                # 为本机全部网卡各生成一份
    python gen_license.py --mac B0-25-AA-41-56-21    # 指定目标机 MAC
    python gen_license.py --mac ... --company "某某公司" --charset gbk
"""
import argparse
import base64
import hashlib
import os
import subprocess
import sys
from datetime import datetime

from Crypto.Cipher import DES
from Crypto.Hash import MD5 as MD5_HASH
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Util.Padding import pad, unpad

PASSWORD = b"weaver"
SALT = base64.b64decode("vM4B96HaxG0=")
ITER = 100


def _kdf():
    t = hashlib.md5(PASSWORD + SALT).digest()
    for _ in range(ITER - 1):
        t = hashlib.md5(t).digest()
    return t[:8], t[8:16]


KEY, IV = _kdf()


def pbe_encrypt(text: str, charset: str) -> str:
    ct = DES.new(KEY, DES.MODE_CBC, IV).encrypt(pad(text.encode(charset), 8))
    return base64.b64encode(ct).decode()


def pbe_decrypt(data: str, charset: str) -> str:
    return unpad(DES.new(KEY, DES.MODE_CBC, IV).decrypt(base64.b64decode(data)), 8).decode(charset)


def java_md5(s: str) -> str:
    """复刻 MD5.getMD5ofStr：标准 MD5，大写十六进制。MAC 为 ASCII，编码无关。"""
    return hashlib.md5(s.encode("utf-8")).hexdigest().upper()


def forge(mac: str, company: str, exp_date: str, user_count: int,
          charset: str, quotas: dict):
    key = RSA.generate(1024)
    pub_b64 = base64.b64encode(key.publickey().export_key("DER")).decode()
    mac_hash = java_md5(mac)

    parts = ["companyName=" + company, "macAddr=" + mac_hash]
    if exp_date:
        parts.append("expDate=" + exp_date)
    parts.append("userCount=%d" % user_count)
    for k, v in quotas.items():
        parts.append("%s=%d" % (k, v))
    params = ",".join(parts)

    sig = base64.b64encode(
        pkcs1_15.new(key).sign(MD5_HASH.new(params.encode(charset)))
    ).decode()
    plain = "|".join([pub_b64, params, sig])
    return pbe_encrypt(plain, charset), mac_hash, params


def verify_like_readln(path: str, real_mac: str, charset: str):
    """复刻 ReadLN.readLN 的校验顺序"""
    content = "".join(l.strip() for l in open(path, encoding="utf-8"))
    seg = content.split("|")
    parts = pbe_decrypt(seg[0], charset).split("|")
    if len(parts) != 3:
        return False, "license格式不合法"
    pub_b64, params, sig_b64 = parts

    pub = RSA.import_key(base64.b64decode(pub_b64))
    try:
        pkcs1_15.new(pub).verify(MD5_HASH.new(params.encode(charset)),
                                 base64.b64decode(sig_b64))
    except Exception:
        return False, "license验证失败"

    kv = {}
    for p in params.split(","):
        if "=" in p:
            k, v = p.split("=", 1)
            kv[k.strip()] = v.strip()

    if kv.get("macAddr") != java_md5(real_mac):
        return False, "mac地址错误"

    exp = kv.get("expDate", "")
    if exp and datetime.strptime(exp + " 23:59:59", "%Y-%m-%d %H:%M:%S") < datetime.now():
        return False, "license有效期已过,请重新申请"
    return True, "OK"


def local_macs():
    try:
        out = subprocess.run(["ipconfig", "/all"], capture_output=True).stdout
        text = out.decode("gbk", "ignore")
    except Exception:
        return []
    macs = []
    for line in text.splitlines():
        if "Physical Address" in line or "物理地址" in line:
            i = line.find(":")
            if i < 0:
                continue
            v = line[i + 2:].strip()
            if v and v != "00-00-00-00-00-00-00-E0" and v not in macs:
                macs.append(v)
    return macs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mac", action="append", default=[], help="目标 MAC，可重复")
    ap.add_argument("--all-local", action="store_true", help="枚举本机全部网卡")
    ap.add_argument("--company", default="Weaver Licensed Customer")
    ap.add_argument("--exp", default="2099-12-31", help="yyyy-MM-dd，留空=永久有效")
    ap.add_argument("--users", type=int, default=99999)
    ap.add_argument("--charset", default="gbk", choices=["gbk", "utf-8"],
                    help="Java 端 String.getBytes() 默认编码，中文 Windows 为 gbk")
    ap.add_argument("--outdir", default="license_out")
    a = ap.parse_args()

    macs = list(a.mac)
    if a.all_local:
        macs += local_macs()
    if not macs:
        ap.error("需要 --mac 或 --all-local")

    quotas = {"customid": 0, "cpCount": -1, "mpCount": -1,
              "concurrentCount": 0, "ddCount": -1, "jlCount": -1, "lanxinCount": -1}

    os.makedirs(a.outdir, exist_ok=True)
    print("[*] DES key=%s iv=%s charset=%s" % (KEY.hex(), IV.hex(), a.charset))
    ok_all = True
    for mac in macs:
        lic, mac_hash, params = forge(mac, a.company, a.exp, a.users, a.charset, quotas)
        path = os.path.join(a.outdir, mac_hash + ".license")
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(lic)
        ok, msg = verify_like_readln(path, mac, a.charset)
        ok_all = ok_all and ok
        print("%s  MAC=%-20s 文件=%-34s %s" % (
            "[+]" if ok else "[!]", mac, mac_hash + ".license",
            "校验PASS" if ok else "校验FAIL:" + msg))
        print("    params: %s" % params)
    print("\n[*] 输出目录: %s" % os.path.abspath(a.outdir))
    print("[*] 全部校验: %s" % ("PASS" if ok_all else "存在失败项"))
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/de24945635f65650.png)

Java安全 · 目录
