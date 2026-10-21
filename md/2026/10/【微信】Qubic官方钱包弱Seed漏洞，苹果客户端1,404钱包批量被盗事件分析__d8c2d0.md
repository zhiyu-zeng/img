---
title: 【微信】Qubic官方钱包弱Seed漏洞，苹果客户端1,404钱包批量被盗事件分析
source: https://mp.weixin.qq.com/s/xRGP9xPW0nza0imp_T6dcg
source_host: mp.weixin.qq.com
clip_date: 2026-10-21T09:25:27+08:00
trace_id: ed9e45e3-9058-4c2e-aa0b-c08e509ef760
content_hash: 4ec88b2704d5f7086d2b5e6d0affdc78ccafa4e504e808d5f40d1129a3835f79
status: synced
tags:
  - 微信
  - 密码学
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Qubic 官方钱包在苹果客户端用 Math.random() 生成 Seed，导致仅 2^32 种可能；攻击者离线枚举并碰撞出 1,404 个有钱包，盗走约 130 万美元的 QU。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40075244-d011-8110-bcb8-cc17bfb8e370
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Qubic 官方钱包在苹果客户端用 Math.random() 生成 Seed，导致仅 2^32 种可能；攻击者离线枚举并碰撞出 1,404 个有钱包，盗走约 130 万美元的 QU。
> 
> - **根因与平台局限：** Seed 理论上有 26^55 种可能，但实际安全取决于生成它的 PRNG 内部状态熵；Apple 各浏览器都强制使用 WebKit，JavaScriptCore 的 Math.random() 只有 32 位种子，可秒级恢复，而其他引擎的种子更强，所以事件只波及 Apple 端。
> - **攻击三步：** 离线遍历 2^32 个种子，逐个生成 55 位 Seed；经 KangarooTwelve 派生私钥与 60 字符地址（矿工生态已有高度优化 K12 实现，成本极低）；与链上有余额地址比对，命中后用私钥转账至 7 个归集地址，并部分经跳板充值 MEXC。
> - **损失与处置：** 被盗 2,939,606,531,944 QU（约 $1.3M）；87.1% 被冻结在链上，12.9% 进入 MEXC 后被冻结账户；官方发布 Web 钱包 v4.26.4，改用 crypto.getRandomValues 填充 Uint8Array（CSPRNG）。
> - **受影响范围：** 2026-10-18 前在 iPhone/iPad 任意浏览器、Mac Safari 创建的钱包，以及 2025 年 7 月前创建的 Qubic iOS App 钱包。
> - **同类事件与启示：** 2026 年 5—8 月，Ill Bloom 等应用沿用 CryptoJS 弱随机实现，损失约 570 万美元；7 月 Coldcard 旧固件弱种子致 1,816 BTC（约 1.16 亿美元）被盗；审计须追溯种子生成时的真实随机源与历史依赖，仅升级客户端无法消除已生成的弱种子。

**杂杂咱谈** *2026年10月21日 08:28*

10月17日至18日，攻击者利用@Qubic官方Web钱包在Apple平台用Math.random()生成钱包Seed的随机性缺陷，离线枚举全部2^32个可能Seed，碰撞出1,404个有余额的钱包私钥，并盗走2,939,606,531,944 QU，大约$1.3M。

攻击发生后，Qubic进行了保护性停机，87.1%被盗资金冻结在链上，12.9%进入MEXC并被冻结账户。官方目前已发布Web钱包v4.26.4修复(改用crypto.getRandomValues)，请相关用户及时更新。

一、受害者范围

1,404个钱包地址，这些地址的共同点: Seed由Qubic官方客户端在下述环境中生成，随机性不足:

## 受影响钱包范围

iPhone/iPad上任意浏览器(Safari、Chrome、Firefox等均被强制使用WebKit内核)，2026-10-18之前创建；

MacBook/iMac的Safari，2026-10-18之前创建；

Qubic iOS App，2025年7月之前创建；

二、漏洞根因:Math.random()生成的密钥种子的随机性不足

Qubic的Seed是55位小写字母串，理论空间26^55 (≈2^258)，但实际安全性取决于生成它的PRNG的内部状态熵。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/46e5d0902cf5ce36.jpg)

Math.random()在不同JS引擎中的种子强度截然不同，这也是本次攻击仅限于Apple平台的原因:

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9ef53c2e4085b19a.jpg)

2026年9月，针对JavaScriptCore该弱点的公开研究与工具相继出现，演示了秒级恢复JSC Math.random()的32位种子并预测全部输出。攻击者在一个月后将其武器化并运用到本次Qubic攻击事件中。

三、攻击手法(离线碰撞+链上清扫)

## 攻击手法：枚举碰撞清掃

①枚举: 攻击者离线遍历2^32个WeakRandom种子，按钱包的算法各生成一条55位Qubic Seed，再经KangarooTwelve派生私钥、公钥和60字符地址(Qubic矿工生态已有高度优化的K12实现，枚举成本极低)；

②碰撞: 将枚举出的地址与链上有余额的地址比对，命中即意味着完整掌握了该钱包的私钥和资产；

③盗币: 2026-10-17 23:42 UTC起，攻击者用受害者私钥进行转账，将余额转入7个归集地址，攻击中途即开始将部分资金经跳板地址转入MEXC充值地址套现，之后被冻结。

四、通过crypto.getRandomValues修复

事件发生后，Qubic发布新版本v4.26.4进行了修复。

## CSPRNG修复方案

新实现通过crypto.getRandomValues(bytes)填充Uint8Array，取得取值为0–255的随机字节，使用了浏览器提供的密码学安全伪随机数生成器(CSPRNG)，解决了Math.random()随机性不足的问题。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/14029aa19e3eed0f.jpg)

五、弱随机数问题在2026年频繁爆发

①Ill Bloom/旧版CryptoJS弱随机数实现漏洞: 2026年5—8月发生多轮被盗被盗， Coinspect发现部分钱包在生成恢复短语时沿用了CryptoJS的弱随机数实现，确认受影响应用包括RRWallet、Bexo、NanChat、Bitcoin Libre和Milo，造成损失约570万美元。

②Coldcard硬件钱包被盗: 2026年7月30日，Coldcard旧固件生成的弱随机性种子被利用，被盗资产涉及1,816 BTC、价值约1.16亿美元，覆盖5,200多个地址。

## 同类弱随机案例与启示

这些案例说明: AI时代，加密算法破解的门槛被快速降低(尤其是加密算法的代码实现漏洞)，安全审计需要覆盖种子最初生成时的真实随机源、平台实现和历史依赖；仅检查密钥长度、升级当前客户端或加强生成后的保管，无法消除已形成的弱种子风险。

https://blog.drstra.in/posts/jsc-randomness-predictor/(二)

https://coinspect.com/blog/ill-bloom-investigation/(五①)

https://coldcard.com/security/status(五②)

引用来源: GoPlus

漏洞警报 · 目录
