---
title: It's the certificates, stupid! | Reverse Engineering
source: https://reverse.put.as/2025/08/11/itsthecertificatesstupid/
source_host: reverse.put.as
clip_date: 2026-09-14T10:29:29+08:00
trace_id: 05e6469a-fdf1-43c0-aca7-dbce0d0d90a5
content_hash: 6b60981b340c9229618d2cea8cca67501b9391b9a1859e54f93ec62f41db1a5b
status: synced
tags:
  - 恶意样本
  - APT溯源
series: null
feed_source: reverse.put.as·macOS/iOS
ai_summary: 泄露档案中的代码签名证书把疑似中国 APT 与 Lazarus 关联到同一家韩国安全公司 Dream Security，证书可提取且已过期近二十年。
ai_summary_style: key-points:weak
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3db75244-d011-8180-85e2-f150fb02a1b4
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 泄露档案中的代码签名证书把疑似中国 APT 与 Lazarus 关联到同一家韩国安全公司 Dream Security，证书可提取且已过期近二十年。
> 
> - **核心发现：** 泄露包内 `SignTool/` 目录存放 4 张逾二十年历史的 Windows 代码签名证书及签名脚本，用于给疑似窃取公民证书的恶意样本签名。
> - **证书归属：** 证书主体为韩国 Dream Security（含 PKI Tech、Digital ID 等），签发者为 VeriSign 与 Thawte，有效期集中在 2002–2008 年，签名算法为 md5/sha1WithRSA。
> - **Lazarus 关联：** ESET 2020 年报告称 Lazarus 在韩国供应链攻击中使用两张被盗证书，其中一张来自 Dream Security 美国子公司，与本次泄露分属不同部门。
> - **归属线索：** 文档与代码含大量中文注释，作者认为"中国制造"假设较可信；但也不排除材料被刻意植入。
> - **提取细节：** `cert` 目录口令为 `dream1998`；需旧版 OpenSSL（1.0.2g 可行）因新版移除 PVF 支持；时间戳服务因证书过期拒绝签名。
> - **后续价值：** VirusTotal 可对该证书做历史回溯狩猎，验证攻击是否早于 2020 年。

This weekend two real hackers leaked the results of an hack to a possible APT linked to China and/or North Korea. Big hat tip and thanks to Saber and cyb0rg for disclosing such interesting material!

The leak can be found [here](https://ddosecrets.com/article/apt-down-the-north-korea-files) at [Distributed Denial of Secrets](https://ddossecrets.com/). The Phrack article is included in the archive while Phrack #72 isn’t released online (come on people finish that CTF!).

The authors describe some of the contents and ask for help analysing the rest of the contents. Further leaks are promised, which we anxiously wait for!

## 翻查泄露档案

After reading the article and becoming curious, it was time to spin a VM and dive into the archives. There is a lot of stuff to look at so I just kept going through things trying to find something that calls for attention.

For example, there’s an `encrypted-openpgp-passphrase.txt` in one of the Thunderbird profiles and the decryption key can be recovered. But there are no OpenPGP keys in sight. I’m not sure if this is a Thunderbird default and didn’t look further after recovering the decryption key and failing to find the goodies.

Anyway, from my quick analysis I can say that this is an APT competing in the Europa League versus the ShadowBrokers APT which definitely was Champions League material. I’m still puzzled how so few analysis were made public for those leaks. That stuff is fascinating to look at, a rare peek of a top tier APT. You can definitely “feel” their high quality software engineering (although not without bugs here and there, but AI will solve everything, right?).

Still, this is a great leak and you should definitely explore it!

## 可疑的签名证书目录

Something that triggered my curiosity was this folder `work/mnt/hgfs/Desktop/111/2/01_행자부 웹보안API(ORG) - 권유미 인수/03_deploy/SignTool/`. It contains code signing certificates and scripts to sign Windows executables. Now this is interesting!

It becomes even more interesting when we verify who the certificates belong to!

```plaintext
cert_info: 
  version: 2
  serialNumber: 170029916841236378034687590211105296362
  signature: 
    algorithm: md5WithRSAEncryption (1.2.840.113549.1.1.4)
    parameter: NULL
  issuer: C=ZA, O=Thawte Consulting (Pty) Ltd., CN=Thawte Code Signing CA
  validity: 
    notBefore: Apr  3 06:25:54 2006 GMT
    notAfter: Apr 15 08:22:17 2008 GMT
  subject: C=KR, ST=Seoul, L=Songpa-gu, O=Dream Security Co., Ltd., 
  OU=PKI Tech, CN=Dream Security Co., Ltd.
```

## 与Lazarus供应链攻击关联

This doesn’t look like an APT front company. Because it doesn’t ring an immediate bell (although stolen certificates do) a quick web search reveals the answer I was looking for:

> [Lazarus supply-chain attack in South Korea](https://www.welivesecurity.com/2020/11/16/lazarus-supply-chain-attack-south-korea/)

![cert](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1856eb04abed604f.png)

![cert](https://reverse.put.as/2025/08/11/itsthecertificatesstupid/images/lazarus-cert_hu06c0b3c1bed6aed28a0518ec06f154ba_75640_1204x0_resize_q80_h2_box_3.webp)

Lazarus cert, from the ESET post

So according to ESET, Lazarus was using two stolen Windows code signing certificates in a 2020 campaign. One of them is from Dream Security USA, a wholly owned subsidiary of Dream Security Korea. And now we can find four two decades old (!) code signing certificates belonging to Dream Security Korea. Scripts are set to use them to sign what appears to be malicious binaries designed to steal the citizen certificates referenced in the Phrack article.

One of the target binaries in `1. codesignX.bat` :

> .\\SignTool\\VeriSignTool\\SignCode -spc.\\SignTool\\Cert\\mycredentials.spc -v.\\SignTool\\Cert\\myprivatekey.pvk -a sha1 -t [http://timestamp.verisign.com/scripts/timstamp.dll](http://timestamp.verisign.com/scripts/timstamp.dll) -n “GPKIInstaller”.\\bin\\GPKIInstaller.dll

The `bin` folder contains binaries signed with this certificate in 2007:

![dll](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b569fbed1add14cf.png)

![dll](https://reverse.put.as/2025/08/11/itsthecertificatesstupid/images/signed-dll_hu40c6579d610d195f8ab9af072344c2de_26786_405x0_resize_q80_h2_box_3.webp)

Signed DLL in 2007

## 证书揭示二十年攻击史

Now this is very interesting. First because these are very old certificates, so there is a chance that this APT has been hacking South Korea (and maybe others) for the last 20 years. Those who have VirusTotal access could have some interesting retrohunting looking for any binaries signed with these certificates.

Second because the Phrack article discusses the theory that this is a made in China APT with possible ties to North Korea APT(s). The made in China hypothesis looks real, since there are a lot of Chinese comments in docs and code. What’s the probability of having a North Korea APT internally speaking Chinese? These guys don’t even bother to have work shifts to disguise the damn hours (honestly neither everyone else, to my serious confusion how hard this can be!) much less writing internally in a different language.

> Another recurring detail was the threat actor’s strict office hours, always connecting at around 09:00 and disconnecting by 17:00 Pyongyang time.

Bug and hacking collisions happen, it’s not the first time you have different APTs playing on the same machine (2016, hello?). But looks like a bit of a coincidence that Lazarus and a more than probable made in China APT both have code signing certificates from the same company. Although they are from different divisions. So this is probably another interesting bit to help make the connection between the two countries as the Phrack article calls for.

There is always the chance that this (and other material) has been planted. I don’t have knowledge of what went on here and authors’ intentions, so it’s always a possibility in every leak (Gucifer, hello?).

## 证书口令与提取方法

The passphrase for the certs in the `cert` folder is `dream1998` (the empty text file there). The certificates and private key can be extracted using older OpenSSL versions (1.0.2g worked for me) because PVF support was removed on newer versions. The timestamp service obviously refuses to sign anything since the certs are more than expired but other than that everything is available. The other certificates don’t have the same passphrase, so I’ll probably run `rockyou.txt` against them to see if there is some luck just for the lulz.

The other certicates info (issuers were VeriSign and Thawte):

```plaintext
cert_info: 
  version: 2
  serialNumber: 29598626789411103482620040331033826604
  signature: 
    algorithm: md5WithRSAEncryption (1.2.840.113549.1.1.4)
    parameter: NULL
  issuer: O=VeriSign, Inc., OU=VeriSign Trust Network, OU=Terms of use at 
   https:\/\/www.verisign.com\/rpa (c)01, CN=VeriSign Class 3 Code Signing 2001-4 CA
  validity: 
    notBefore: Mar 26 00:00:00 2002 GMT
    notAfter: Apr  8 23:59:59 2003 GMT
  subject: C=KR, ST=HanSung Plaza 12F, 13-1, HungIn-Dong, Joong-Gu, L=Seoul, 
  O=Dreamsecurity co., OU=Digital ID Class 3 - Microsoft Software Validation v2, 
  OU=Security Solution Development, CN=Dreamsecurity co.
```

```plaintext
cert_info: 
  version: 2
  serialNumber: 154916525924551668138434563576260568983
  signature: 
    algorithm: sha1WithRSAEncryption (1.2.840.113549.1.1.5)
    parameter: NULL
  issuer: O=VeriSign, Inc., OU=VeriSign Trust Network, OU=Terms of use at 
   https:\/\/www.verisign.com\/rpa (c)01, CN=VeriSign Class 3 Code Signing 2001 CA
  validity: 
    notBefore: Mar 28 00:00:00 2003 GMT
    notAfter: Apr 16 23:59:59 2004 GMT
  subject: C=KR, ST=HanSung Plaza 12F, 13-1, HungIn-Dong, Joong-Gu, L=Seoul, 
  O=Dreamsecurity co., OU=Digital ID Class 3 - Microsoft Software Validation v2, 
  OU=Security Solution Development, CN=Dreamsecurity co.
```

```plaintext
cert_info:
  serialNumber: 2167112
  signature: 
    algorithm: md5WithRSAEncryption (1.2.840.113549.1.1.4)
    parameter: NULL
  issuer: C=ZA, O=Thawte Consulting (Pty) Ltd., CN=Thawte Code Signing CA
  validity: 
    notBefore: Apr 14 08:36:05 2005 GMT
    notAfter: Apr 16 08:20:37 2006 GMT
  subject: C=KR, ST=Seoul, L=Songpa-gu, O=Dream Security Co., Ltd., 
  OU=PKI Tech, CN=Dream Security Co., Ltd.
```

I couldn’t find any information about these certificates, in particular related to anything malicious. If you know something about this please do tell me (in private or public) since I’m curious. Even better if you are lucky on that VT retrohunt and find some different malware or at least proof that these campaigns are much older than 2020.

Have fun and keep exploring those archives! An opportunity like this doesn’t appear often:-).  
fG!
