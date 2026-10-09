---
title: 【微信】型号就是口令：Hanwha WiseNet 从 BGA 拆 NAND 到固件加密逆向
source: https://mp.weixin.qq.com/s/LLIyVJCNEiHh7QvnbGh5qw
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T09:39:11+08:00
trace_id: 61174480-b4b0-4dd8-a39a-6dd8a57e2e0e
content_hash: 8b6cd6bae973dbc28b978b574273b717d3fa5cdbc92526361c83afdc6f9b51c7
status: synced
tags:
  - 微信
  - 硬件逆向
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Hanwha WiseNet 摄像头升级包加密口令可预测：物理拆 NAND 取固件、逆向硬编码密钥 `zeppelin`，解出口令基本就是型号（前缀 HTW）。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3f475244-d011-819e-b6d6-c0954fc7e91f
ioc:
  cves:
    - CVE-2026-20374
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Hanwha WiseNet 摄像头升级包加密口令可预测：物理拆 NAND 取固件、逆向硬编码密钥 `zeppelin`，解出口令基本就是型号（前缀 HTW）。
> 
> - **物理入口：** 未焊接排线座上找到 UART，串口启动日志直接打印分区表，按 offset/size 用 `dd` 切割 NAND dump（`wisenet-nospare.bin`，BGA 拆下抽了带/不带 spare 两份）。
> - **升级包线索：** 官网包 `XNF-8010R_2.10.04_20230328_R640.zip` 解出的 `.img` 被 `file` 识别为 `openssl enc'd data with salted password`，头部为 `Salted__`。
> - **逆向关键：** partition 8 中 binwalk 抠出 ELF，IDA 定位 `decrypt_imageFile` → `get_modelStr(122)` → `decrypt_modelfeature`，硬编码 `zeppelin`，经 SHA-256 作密钥、AES-256-CFB8（IV 全 0）解密 `MODELINFO_*` base64 密文。
> - **口令规律：** 解出明文如 `HTWXNF-8010R`、`XNF-8010R`；用「口令 `HTWXNF-8010R` + digest md5」解开官方包得 gzip 与完整升级树；无实物型号 TNO-L4040TR 用 `HTWTNO-L4040TR` 同样一次解开。
> - **结论：** 加密升级包不等于安全边界，有样品即可批量解包；防御需用设备唯一密钥或签名链、取消硬编码派生、关闭量产件 UART/JTAG。

**黑卷的IoT攻防日记** *2026年10月9日 09:11*

## 型号就是口令：Hanwha WiseNet 从 BGA 拆 NAND 到固件加密逆向

目标是一台商用级物联网监控——Hanwha（韩华）WiseNet **XNF-8010RW**。作者按 IoT 渗透测试的节奏做了一轮安全审计：拆机找 UART、BGA 拆 NAND 抽固件，再顺着官方升级包上的 `openssl Salted__` 头，一路 IDA 逆向，最后发现升级包解密口令几乎就是 **型号字符串本身**。

## 拆机与 UART

先拆开设备，在一块未焊接的排线座上摸到 UART；接着把板上的 BGA NAND 拆下来抽固件。

![Hanwha WiseNet XNF-8010R](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b9e1b1f85995f75.jpg)

NAND 带 spare area，作者抽了两份：带 spare 和不带 spare。后面分析用的是去掉 spare 的镜像，命名为 `wisenet-nospare.bin` 。

## 官方升级包也是加密的

手上已经有板子里的固件，作者又去官网搜了一圈——果然有升级包可下。

![固件下载页](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2819a013480f5642.jpg)

解压 `XNF-8010R_2.10.04_20230328_R640.zip` 得到 `.img` 。对它跑 `file` ，直接报： `openssl enc'd data with salted password` 。看文件头，开头就是熟悉的 `Salted__` ——OpenSSL 加盐加密的标志。

于是问题变成一句话： **口令是什么？**

## 先有鸡还是先有蛋

口令肯定藏在固件里——设备升级时本地得能解开这个包。但要读固件内容，又得先拿到镜像。好在物理侧已经做完：BGA 拆下来的 dump 把这个死结解开了。

## 从 UART 分区表切镜像

启动时 UART 会把分区表打出来，地址一目了然。按表用 `dd` 把 `wisenet-nospare.bin` 切成多个 partition。

![UART 打出的分区表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/aed71cb01a7e71b7.jpg)

在分区里搜字符串，能看到大量 `openssl` 调用，其中两条最关键：

-   `openssl enc -d -aes-256-cbc ... -pass file:%s`
-   `openssl enc -aes-256-cbc -d -k`

附近还堆着 `fwupgrader` 相关路径——升级器本体就在这附近。

另一条线索是 `MODELINFO_MODEL_DECRYPTIONKEY` / `MODELINFO_CONFIG_BACKUP_KEY` ：一串 base64，解码后大约 32 字节，熵看起来很高，像是密钥材料。

## Binwalk 抠 ELF，丢进 IDA

`openssl enc -aes-256-cbc -d -k` 落在 **partition 8**。用 `binwalk` 只抠 ELF，再 grep 定位到目标二进制，丢进 IDA（ARM Little-endian）。

![把二进制载入 IDA](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/339c74aae880c175.jpg)

打开 Strings，找到那条 openssl 命令串。

![IDA Strings 里的 openssl 串](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/38ec1945ee716162.jpg) ![字符串地址](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4e14e3923aaff676.jpg)

交叉引用指向函数 `decrypt_imageFile` 。

![字符串交叉引用](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e87ee44bfbd35a1a.jpg)

反编译后能看到它调用 `get_modelStr` ，第一个参数是 **122**——正好对应前面 `MODELINFO_MODEL_DECRYPTIONKEY` 那一行的编号。

![decrypt\_imageFile 调用 get\_modelStr(122, …)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bcd587e4587663d7.jpg)

把那些 base64「密钥」直接当 `openssl -k` 口令爆破，全部 `bad decrypt` 。说明它们本身还是密文，得再往下挖一层。

## 硬编码口令：zeppelin

顺着 `get_modelStr` → `get_featureData` → `replace_featureData` ，最终落到 `decrypt_modelfeature` 。

函数里拼出硬编码字符串 **"zeppelin"**，再走自定义的 `HashedKeyCipher` ：

![硬编码 zeppelin](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fe29c1e8c174b0af.jpg)

`HashFactory::create_hash(1)` → **SHA-256**； `DecryptorFactory::create_decryptor(..., 6, ...)` → **AES-256-CFB8**。

![HashFactory / create\_hash](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/62d94f1563e80c7a.jpg) ![create\_decryptor 选中 Aes256CFB8](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d50949532139c787.jpg) ![featureData 相关路径](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/65323b2f6f6f7547.jpg)

脚本流程很直白：

1.  `SHA256("zeppelin")`
    
    当 AES 密钥；
    
2.  IV 全 0；
    
3.  对每条 base64 密文做 AES-256-CFB8 解密。
    

解出来的明文是一串「像型号」的口令： `HTWXNF-8010R` 、 `HTWQNF-8010` 、 `XNF-8010R` ……

## 解开升级包

再拿这些明文去解官方 `.img` ，轮询 md5/sha1/sha256 等 digest。命中的是：

**口令 `HTWXNF-8010R` + digest `md5`** → 得到 gzip，解开就是完整升级树： `fwupgrader` 、 `uImage` 、work 根文件系统等。

作者顺手验证了另一台没有实物的型号 **TNO-L4040TR**：猜口令 `HTWTNO-L4040TR` ，同样一次解开。规律很粗暴—— **升级包加密口令基本上就是型号（前面加个 HTW 之类前缀）**。

## 小结

整条链可以压缩成四步：

1.  拆机找 UART，确认分区布局；
    
2.  BGA 拆 NAND，拿到本地 dump（打破「口令在固件里」的死结）；
    
3.  字符串 + IDA 挖到 `decrypt_modelfeature` ，硬编码 `zeppelin` → SHA256 → AES-CFB8；
    
4.  解出型号型口令，回头解开官网升级包；同系列可直接猜。
    

对厂商来说：升级包加密如果口令可预测、密钥派生硬编码，对持有一颗样品的攻击者几乎没有门槛。对测评/红队来说：商用摄像头别只盯着 Web/云端，物理抽固件 + 升级包逆向，往往比猜默认口令更快摸到完整攻击面。

## 黑卷点评

这篇是典型的「物理入口 + 软件逆向」组合拳，我在 IoT / 车联网实测里几乎每周都会走到类似路径。几点值得记：

一是 **加密升级包不等于安全边界**。 `Salted__` + AES-CBC 看起来很正规，但口令派生硬编码成 `zeppelin` ，解出来又是「HTW + 型号」这种可猜规则——有一颗样品做 chip-off，全系列升级包都可以批量解开。摄像头、NVR、T-BOX、充电桩的 OTA 包，评估时都要问一句：口令从哪来、能不能从型号/序列号推出来。

二是 **UART 分区表是免费地图**。作者几乎没做什么花活，串口启动日志就把各分区 offset/size 打全了，后面 `dd` 切割、定位 `fwupgrader` 全靠这张表。很多车机/T-BOX/网关也一样：调试口没关，等于把 Flash 布局和启动链直接摊给你。

三是 **BGA NAND 抽固件仍是破死结的杀手锏**。Web 口、云接口再硬，本地升级逻辑总要把密钥或口令放在设备上；chip-off 一次，鸡生蛋问题就结束。做 GB 44495 / ISO 21434 陪跑或整车评估时，硬件侧抽固件、对照官方加密包，是我固定会排进日程的项。

防御侧很直接：升级包要用设备唯一密钥或签名链，不要型号可猜；密钥派生别硬编码字符串；量产件 UART/JTAG 关掉或熔断；NAND/eMMC 有读保护就评估已知绕过，而不是假设「焊不下来就安全」。

* * *

![免责声明与星球引流](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0ca3244844683078.jpg)

### 往期推荐

-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485532&idx=1&sn=830a2906b6710b7fb97e14a1b4cbd62e&scene=21#wechat_redirect)
    
-   [拆机焊 UART 还不够：Nokia Beacon 1 从受限串口到 CGI 注入 + Qiling 算口令](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485552&idx=1&sn=e530240c9e9ca18dbd50c9a14c73017b&scene=21#wechat_redirect)
    
-   [19.9 美元路由拆到 RCE：Dbit N300 UART + Boa 溢出（CVE-2026-20374）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485467&idx=1&sn=0e60fa2762561a009b3d8edc49f5538b&scene=21#wechat_redirect)
    
-   [四根铜焊盘听出 root：TP-Link TL-WR845N UART 未认证调试口](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485877&idx=1&sn=80508f309304188b09a02e14d5a03733&scene=21#wechat_redirect)
    
-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
