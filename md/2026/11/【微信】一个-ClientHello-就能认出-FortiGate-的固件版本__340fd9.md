---
title: 【微信】一个 ClientHello 就能认出 FortiGate 的固件版本
source: https://mp.weixin.qq.com/s/09_Z_MC-zvjPgT-2XWINAg
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:21:10+08:00
trace_id: 91b8a0a7-624c-4f1a-92b0-81f7741ccaa9
content_hash: 0429acd927825a32ade0343d2156bbe44d540d3338395412c4381b51434075ed
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41d75244-d011-81b0-8748-cd7a1ca803af
ioc:
  cves:
    - CVE-2018-13374
    - CVE-2018-13379
    - CVE-2018-13382
    - CVE-2018-13383
    - CVE-2019-5591
    - CVE-2019-6693
    - CVE-2020-12812
    - CVE-2021-44168
    - CVE-2022-41328
    - CVE-2022-41335
    - CVE-2022-42475
    - CVE-2023-27997
    - CVE-2024-21754
    - CVE-2024-21762
    - CVE-2024-23113
    - CVE-2024-47575
    - CVE-2024-55591
    - CVE-2025-24472
    - CVE-2025-24477
    - CVE-2025-25249
    - CVE-2025-25252
    - CVE-2025-59718
    - CVE-2025-61624
    - CVE-2025-62631
    - CVE-2025-68686
    - CVE-2026-24858
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**幻泉之洲** *2026年11月18日 10:21*

> 互联网上躺着 37 万多台把 FGFM 管理端口直接暴露出去的 FortiGate。这些设备本身不主动报版本号——全量 FortiOS 主机里只有 0.03% 会告诉你自己跑什么。但它们的 ClientHello 会。用 JA4 指纹能把这些设备分成六代，圈定 FortiOS 版本区间和对应的 CVE。至少 16 万台落在已知漏洞的影响范围内，其中 11,264 台无一幸免。

2026 年 10 月 14 日到 11 月 12 日，Target Intelligence 数据集里出现了 375,904 台暴露 FortiGate-to-FortiManager（FGFM，FortiGate 与 FortiManager 之间的管理协议）端口的互联网主机。Fortinet 白纸黑字说过这个端口不该对公网开放。光这一条就够让人皱眉了。

同一时期，被识别为 FortiOS 的主机有 838,100 台，其中只有 269 台会主动公布版本号——0.03%。剩下 99.97% 的设备在扫描器面前是哑巴。

FGFM 端口给了一条侧门。每台暴露的主机都会发出一个 TLS ClientHello，用 JA4 指纹做归类，正好能把这些设备切成六代，每一代对应一段 FortiOS 版本区间，以及落在这段区间上的 CVE。

结果是：6.8% 到 36.1% 的主机跑在已经停止支持的 FortiOS 分支上。区间为什么这么宽？因为有一代把已经 EOL（End of Life，生命周期终止）的 7.0、7.2 和仍在支持期的 7.4、7.6 混在了一起，没法再细分。

还有一个数字：至少 16 万台设备的版本对应着某个已知 CVE。这里面包括全部 11,264 台 Gen 2 主机，跑的是 FortiOS 5.4 到 6.0.4——每一台都受 CVE-2022-42475 \[1\] 影响。那是一个预认证 SSL-VPN 堆溢出漏洞，和勒索软件团伙挂过钩。

## 数据是怎么翻出来的

这事起点很随意。我决定花点时间看看 Target Intelligence 里那堆所谓的"未识别数据"（call unknown data）。里面全是我们的解析器认不出来的 banner 抓取结果。

以前我们靠这堆东西补过协议实现。有些协议跑出了古怪的变体，我们看明白了，回头给扫描器加上解析逻辑；Initial Access 团队的一些研究也是从这儿起的头。

### 一堆不认识的 TLS ClientHello

上一份工作里，我对着 PCAP 数据看了几百个小时。分析各种奇葩的协议实现是那份活儿里最有意思的部分。最书呆子的超能力，就是盯着 hex dump 说一句"嘿，这玩意儿像 RFC X"。

这次就是靠这个：一簇以 `16 03 01 03 c8 01` 开头的数据，一眼认出来是 TLS ClientHello。有点意思。banner 抓取里出现 ClientHello 只有两种可能——服务器把我们发的东西原样丢回来了，或者它在尝试建立 TLS 会话。前者很快排除了：这些记录彼此并不相同，而我们的 TLS 扫描器用的是固定 ClientHello。

找它们只需要一条查询：匹配 TLS 握手记录（ `16 03` ），首条消息类型为 01（ClientHello），在 30 天的未识别数据里按端口统计主机数。

WITH ClientHellos AS (  
SELECT ip_int, port  
FROM target_intelligence.unknown_parsed  
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)  
AND STARTS_WITH(banner, 'FgM')  
AND SUBSTR(SAFE.FROM_BASE64(SUBSTR(banner, 1, 8)), 6, 1) = b'\\x01'  
)  
SELECT port, COUNT(DISTINCT ip_int) AS hosts  
FROM ClientHellos  
GROUP BY port  
ORDER BY hosts DESC

376,794 台发送 ClientHello 的主机里，375,904 台（99.8%）走的是 541 端口。除非另外注明，本文所有主机数都覆盖同样的 30 天区间：2026-10-14 至 2026-11-12，查询时间为 2026-11-13。

### 该开 Wireshark 了

下一步是批量下载这批数据，用 Scapy 塞进 PCAP，然后打开 Wireshark 的图形界面，让我的 hex 眼睛歇一歇。

立刻见效——满屏 Fortinet 的 SNI。

SNI（Server Name Indication，服务器名称指示）是客户端在 TLS 握手时填的扩展字段，用来告诉服务器它想访问哪个服务。多站点共用 IP 的场景下这玩意儿用得极多，一个 IP 上挂几百个网站是常事。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a9c58a1a7090823a.png)

▲ 到达 541 端口的 ClientHello，每条都带着 support.fortinet-ca2.fortinet.com 这类 Fortinet SNI。

顺着这条线索查下去，指向 FortiGate 的 FGFM 管理服务——跑在 TCP 541（IPv6 上是 542）。和我看到的端口对得上。

如果你知道 CVE-2024-47575 \[2\] ，也就是 FortiJump，那看到一台 FortiGate 把 541 敞开在公网上，第一反应必然是心里一沉。那是 FGFM 守护进程里的认证缺失漏洞，2024 年被野外利用过。

这个直觉错了。FortiJump 是 FortiManager 的漏洞，而在 541 端口上，FortiManager 是以 TLS 服务端的身份应答的。FortiGate 才是主动发 ClientHello 的那一方。

对扫描数据来说，这个方向是反的：我们是客户端，我们连过去的主机本不该反过来给我们发 ClientHello。541 端口是唯一一处出现这种情况的地方，也正是这些 banner 掉进"未识别数据"的原因。

* * *

说实话，这恰好解释了为什么这批数据在库里躺了那么久没人管。扫描器按"我是客户端、对面是服务端"的模型解析响应，一台设备反手甩过来一个 ClientHello，解析器只会当作垃圾丢掉。而对我们来说，这个"垃圾"里恰好藏着版本信息。

先排除一种误判：这会不会是 FortiManager 的行为，而不是 FortiGate？我翻了扫描器根据 TLS 证书标记为 FortiManager 的 30 台主机，没有一台回吐 ClientHello。所以这就是 FortiGate 的特性。

541 端口上真正对得上的漏洞是 CVE-2024-23113 \[3\] ，FortiOS 的 FGFM 守护进程里一个预认证远程代码执行，已进入 VulnCheck 的已知被利用漏洞（KEV，Known Exploited Vulnerabilities）清单。影响范围是 FortiOS 7.0.0 到 7.0.13、7.2.0 到 7.2.6、7.4.0 到 7.4.2。

不管具体版本是多少，541 端口上的 FGFM 是一条设备管理通道，本来就不该从公网可达。Fortinet 自己的建议是移除 fgfm 访问 \[4\] 。而这批主机每一台都在把 FortiGate 的控制平面摊开给任何能建立 socket 连接的人——这已经不是"配置疏忽"能轻轻带过的级别了。

## 版本发现

VulnCheck 提供 CPE 到 CVE 的查询能力，Target Intelligence 用它给主机打 CVE 标签。我接下来的目标很直接：能不能靠这些 ClientHello 拿到带版本号的 CPE，甚至圈出受 CVE-2024-23113 影响的版本区间。

分组用的是 JA4——FoxIO \[5\] 设计的算法，从 ClientHello 里提取非临时性特征，生成一个大致人能读的字符串。它由 JA4_a、JA4_b、JA4_c 三段组成，下划线分隔。

看下面截图里的第四行和第五行：JA4_a 和 JA4_b 完全一致，只有 JA4_c 不同。差异来自多出的一个签名算法 ML-DSA，2024 年发布的后量子密码数字签名方案。按常识推断，这大概是更新的版本。这个猜测只对了一半——第四行实际是 FortiOS 7.4.12，它固定了自己的 TLS 设置，细节见附录里的"Fixed and Configurable TLS Settings"。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/17587c6a7f3ce771.png)

▲ 第一轮得到的五组 JA4 指纹。第 4、5 行共用 JA4_a 与 JA4_b（t13d171100_a02ea570dccb），只在 JA4_c 上分开：第 5 行多了 ML-DSA，而第 4 行是 FortiOS 7.4.12 固定的 TLS 配置（Gen 5P）。

这五个值的逐项拆解放在"JA4 Breakdown"附录里。关键结论只有一句：每一个都比前一个多带了点 SSL/TLS 生态里更新的东西。

于是我有理由相信，这五个 JA4 值对应 FortiOS 的不同版本，且依次变新。后来实测固件，五个变成了六个：下表中的 Gen 1 到 Gen 5，再加一个 Gen 5P，P 代表 pinned（固定），因为 FortiOS 7.4.12 和 7.4.13 把 TLS 设置写死了。

## OpenSSL 版本发现

随手搜了一下，FortiOS 打包了 OpenSSL。再回头对照 JA4 值，每个值都能映射到一个更新的 OpenSSL 版本。运气不错。

用 fortitool \[6\] ——官方描述是"一个静态 Go 二进制与库，用于解密和拆包 Fortinet 固件"——我跑了 FortiOS 7.6.7，识别出 OpenSSL 3.5.5。

写了点脚本，加一个小的 Claude 技能，就能批量跑多个版本，得到下面这张表，假设成立。

| Gen | FortiOS 版本 | OpenSSL | 完整 JA4 |
| --- | --- | --- | --- |
| 5P  | 7.4.12 · 7.4.13（7.4.12 起加固定） | 3.5.5，已固定 | t13d171100_a02ea570dccb_9482eddbd848 |
| 5   | 7.4.9 · 7.4.11 · 7.6.7 · 8.0.0 · 8.0.1 | 3.5.0–3.5.7 | t13d171100_a02ea570dccb_168ae6a8d753 |
| 4   | 7.4.8 · 7.6.1–7.6.4 | 3.4.0 | t13d171100_a02ea570dccb_412547015303 |
| 3   | 6.0.5–6.0.11 · 6.2.0 · 7.0.13 · 7.2.4 · 7.4.0–7.4.7 · 7.6.0 | 1.1.1–3.1.4 | t13d251000_d50cb0bd0c54_5ac7197df9d2 |
| 2   | 5.4.12 · 5.6.14 · 6.0.0–6.0.4 | 1.0.2k–1.1.0h | t12d220700_ad4cf32d3c22_a8cc486ca5dc |
| 1   | 无实测\* | 1.0.2 或更早 | t10i310400_9d330406ce80_282f11336259 |

\* 我们启动过的版本里，没有一个发出 Gen 1 的 ClientHello。能启动的最老版本 5.4.12 发的是 TLS 1.2（Gen 2）。更早的 5.4 版本我们只拿到硬件固件，而 5.4.0 到 5.4.12 每一版都带 OpenSSL 1.0.2、TLS 客户端方法相同，所以从固件本身判断不出谁发了 TLS 1.0。Gen 1 最可能是 5.4 或更老的固件，或者是我们没复现出来的某种配置；另外我们那批没授权的 6.4 实验虚机也发了 TLS 1.0。它的 CVE 统计按 5.4.0 计。

这张表的用法：只要看到某个 JA4 命中上面某一行的特征，就能给出该主机对应的 FortiOS 版本区间。

换个说法——OpenSSL 越老，FortiOS 越老。这招管用。

要提醒的是，每一代是一个 JA4 变体家族，不是单一值；而且我们没能测遍所有 FortiOS 版本，缺口见"JA4 Breakdown"和"Versions We Could Not Measure"两个附录。

## Target Intelligence 数据

接着，我们把 30 天窗口内 541 端口 FGFM 队列里每台主机的 JA4 全部重算了一遍，发现 375,904 台主机在往外泄露自己的版本区间。

把每条原始 banner（服务器在握手时返回的响应）的 JA4 重新计算一遍，每台主机就能归入一个代际（generation，指同一时期一组 OpenSSL 版本对应的固件家族）。分桶语句放在“JA4 Generation SQL”附录里。所谓锚定版本（anchor version），是指我们确实拿到固件样本、实测过 JA4 的那些 FortiOS 版本。

| 代际  | OpenSSL 版本与发布时间 | 锚定版本 | 支持状态 | 主机数 | 占比  |
| --- | --- | --- | --- | --- | --- |
| Gen 5 | 3.5.x（被 FortiOS 固定在 P 分支）·2025 年底→2026 | 7.4.12、7.4.13 | 受支持 | 98,797 | 26.3% |
| Gen 5 | 3.5.x · 2025 年底→2026 | 7.4.9、7.4.11、7.6.7、8.0.0、8.0.1 | 受支持 | 102,560 | 27.3% |
| Gen 4 | 3.2–3.4 · 2024 年底→2025 年中 | 7.4.8、7.6.1–7.6.4 | 受支持 | 38,829 | 10.3% |
| Gen 3 | 1.1.1–3.1 · 2019→2024 年中 | 6.0.5–6.0.11、6.2.0、7.0.13、7.2.4、7.4.0–7.4.7、7.6.0 | 混合：6.0/6.2/7.0/7.2 已 EOL | 110,078 | 29.3% |
| Gen 2 | 1.0.2k–1.1.0 · 约 2017–2021 | 5.4.12、5.6.14、6.0.0–6.0.4 | EOL | 11,264 | 3.0% |
| Gen 1 | 1.0.2 或更早 · 约 2017 年前 | 无实测样本 | EOL | 14,376 | 3.8% |
| 合计  | —   | —   | EOL 占 6.8%–36.1% | 375,904 | 100% |

支持状态以 2026-11-13 为准，取自 Fortinet 的产品生命周期页面 \[7\] ，需要登录；公开摘要见 endoflife.date \[8\] 。Gen 2 对应 FortiOS 5.4、5.6 和早期 6.0，Gen 1 更老，两者早就过了支持期。真正麻烦的是 Gen 3。

Gen 3 是一个混合体。6.0 在 2022-09-29 终止，6.2 在 2023-09-28，7.0 在 2025-09-30，7.2 在 2026-09-30，可它的锚定版本里还带着仍在维护的 7.4 和 7.6。JA4 分不开这些分支。所以 EOL 份额只能给区间：6.8% 只统计 Gen 1 和 Gen 2，绝对数约 25,640 台；36.1% 把整个 Gen 3 也算进去，约 135,718 台。两者相差五倍多，这个宽度本身就是结论：对近三成的主机，JA4 已经失去分辨力。

表里“受支持”三个字最容易被误读。它说的是分支还在厂商维护周期内，不代表这台设备打到了最新补丁。Gen 5 里躺着 7.4.9 和 7.4.11 的主机，分支没问题，patch level 可能是几个月前的。

FortiCare Elite 客户能把 7.2 的延长支持买到 2028-03-31，Gen 3 里有小部分设备实际仍在覆盖范围内。这会让区间下限略微上移，但改变不了 Gen 3 内部良莠不齐的事实。

### 怎么确认这批主机真是 FortiGate

95% 的主机在 ClientHello 里就自报家门了：SNI（Server Name Indication，客户端在握手时声明的目标域名）里写着 Fortinet，或者受信 CA 列表里全是 Fortinet 的证书。剩下 5% 是老式 TLS 1.0/1.2 握手，压根不带主机名。

这 5% 靠旁证。拿我们自己的扫描数据交叉比对，凡是它们暴露了其他信息的，表现和已确认的 FortiGate 几乎一样：在别的端口凭 HTTP 和 TLS banner 被判定为 Fortinet 的比例是 86%，已确认主机这一项是 83%；它们开放 10443 端口（FortiGate 的 SSL-VPN 端口）的比率是全网平均的 15 倍，已确认主机是 14 倍。两个数字都比对照组略高，反而更像而不是更不像。完整证据在“Checking the Cohort Is FortiGate”附录。

### 同一批数据里的对照组

同样看 Target Intelligence 这 30 天，有 838,100 台主机被识别为 FortiOS，其中只有 269 台（0.03%）公开广播了版本号，而且清一色是 7.2.1 到 7.2.3。三千多台里才有一台肯说出自己是谁。指望读版本字符串做资产测绘，在这个目标群体上基本等于放弃。

### CPE 到 CVE 的查询

用上面这张结果表，配上 VulnCheck 的 CPE to CVE 数据 \[9\] ，查每一代锚定版本对应的 CVE，再和 KEV（Known Exploited Vulnerabilities，已被在野利用的漏洞清单）求交集。

下表中一代的 CVE 数是该代所有锚定版本的并集——Gen 3 横跨十四个版本，去重后 216 个。KEV 和勒索软件关联两个子集，是把并集和 VulnCheck KEV 相交之后的结果。Gen 3 最后剩 21 个已知被利用漏洞，其中 9 个和勒索软件有关。

CPE 范围和 KEV 清单都会随时间变长，所以数字截至 2026-11-13。JA4 只能定位到代际而非精确版本，这些是代际级别的暴露量，不是逐台设备的漏洞判决。Gen 1 没有实测版本，按 5.4.0 估算；而较新 CVE 的 CPE 范围经常不列已 EOL 的分支，比如 CVE-2023-27997 和 CVE-2024-21762 都没有列 5.4.0。所以 Gen 1 的数字是下限，不能当成“老版本更安全”的证据。

| 代际  | 主机数 | CVE（锚定版本） | FortiOS KEV | 勒索关联 | 含 FGFM RCE CVE-2024-23113 \[3\] |
| --- | --- | --- | --- | --- | --- |
| Gen 5 | 98,797 | 100 | 0   | 0   | —   |
| Gen 5 | 102,560 | 222 | 0   | 0   | —   |
| Gen 4 | 38,829 | 517 | 1   | 0   | —   |
| Gen 3 | 110,078 | 216 | 21  | 9   | 是   |
| Gen 2 | 11,264 | 100 | 12  | 10  | —   |
| Gen 1 | 14,376 | 567 | 6   | 0   | —   |

看这张表别只盯 CVE 总数。Gen 4 有 517 个 CVE，KEV 只有 1 个，勒索关联 0；Gen 3 的 CVE 数是 216，KEV 却有 21 个，9 个和勒索挂钩。CVE 数量衡量的是代码里修过多少洞，KEV 数量衡量的是有多少洞已经被人拿起来用了。做优先级排序，后者才有意义。

Gen 2 那个组合也值得看一眼：11,264 台主机，100 个 CVE，12 个 KEV，其中 10 个和勒索软件有关。按每千台主机的 KEV 密度算，它是全场最高的一档，而按 CVE 总数算它毫不起眼。老固件上被反复利用的那几个洞，攻击链早就成熟到能打包出售了。

Gen 1 的具体清单如下：CVE-2018-13374 \[10\] 、CVE-2018-13383 \[11\] 、CVE-2019-5591 \[12\] 、CVE-2019-6693 \[13\] 、CVE-2020-12812 \[14\] 、CVE-2021-44168 \[15\] 、CVE-2022-42475 \[1\] 。最后那个是 SSL-VPN 上的预认证 RCE，2022 年底被用来打过一波大规模的勒索投放，2024 年还有人在扫。

还有一点容易被略过：CVE-2024-23113 是 FGFM 协议自身的远程代码执行漏洞，而我们这一轮扫的正是 541 端口。扫描器和漏洞入口是同一条通道。手上有一份 541 端口清单，下一步就是往里面灌构造包，中间不需要任何转化。

这批数字的用法要说清楚。JA4 定位到代际，所以它给不出“这台机器是否可被攻破”的答案，只能回答“这个代际历史上暴露过什么”。拿它做三件事是靠谱的：盘点你名下资产的代际分布、算出还有多少台压在 EOL 分支上、按 KEV 和勒索关联排补救顺序。要做逐台判决，还得靠 541 端口之外的指纹或者主动探测补最后一环。

**代际只是中间产物。** 防守方要的不是 Gen 4 这个数字，是 CVE 编号，是"这个月先打哪台机器"的排序。所以这一层要做的，是把代际逐个落到漏洞清单上。

VulnCheck 的 CVE 页面地址格式固定，把编号拼进去就能查到详情：console.vulncheck.com/cve/ 后接 CVE 号，例如 CVE-2024-23113 对应 https://console.vulncheck.com/cve/CVE-2024-23113 。下面按代际列，不逐个贴完整链接了。

### 各代对应的 CVE 清单

-   **Gen 2**
    
    （TLS 1.2、22 个套件那一档）：CVE-2018-13374、CVE-2018-13379、CVE-2018-13382、CVE-2018-13383、CVE-2019-5591、CVE-2019-6693、CVE-2020-12812、CVE-2021-44168、CVE-2022-41328、CVE-2022-42475、CVE-2023-27997、CVE-2024-21762
    
-   **Gen 3**
    
    （TLS 1.3、25 个套件那一档）：CVE-2019-5591、CVE-2019-6693、CVE-2020-12812、CVE-2021-44168、CVE-2022-41328、CVE-2022-41335、CVE-2022-42475、CVE-2023-27997、CVE-2024-21754、CVE-2024-21762、CVE-2024-55591、CVE-2025-24472、CVE-2025-24477、CVE-2025-25249、CVE-2025-25252、CVE-2025-59718、CVE-2025-61624、CVE-2025-62631、CVE-2025-68686、CVE-2026-24858，另外追加 CVE-2024-23113（FGFM / 541 端口 RCE）
    
-   **Gen 4**
    
    ：CVE-2025-24477、CVE-2025-25249、CVE-2025-25252、CVE-2025-59718、CVE-2025-61624、CVE-2025-68686、CVE-2026-24858
    
-   **Gen 5**
    
    ：CVE-2025-61624、CVE-2026-24858；VulnCheck 的 CPE 范围里目前还没收录对应条目（none in VulnCheck's CPE ranges yet）
    

这几张表里有两处值得单独说。

一是 Gen 3 末尾那个追加项。前面那二十条属于"这一代历史上暴露过的"——泛泛的关联，覆盖什么版本、什么时候修的，得回原始公告对。CVE-2024-23113 不一样，它挂在 541 端口这条通道上。换句话说，如果你的设备已经被 JA4 判定到 Gen 3，同时又把这个端口对着公网开，那就不是"存在历史风险"的问题，是"攻击面直接摆在那里"的问题。这两类风险在处理优先级上不该同级。

二是 Gen 5 下面那行空。清单里出现 2026 年的编号，说明这条曲线还在往后滚，而最新一代的 CPE 映射没建起来。空白容易被误读成"没问题"，实际含义是"查不到"。扫描器给你一个绿色结论，有时候只代表它不认识。

### 真正的处置动作：关端口

不管代际判成哪一个，缓解措施只有一条，而且不需要任何指纹技术。

> 不要把 TCP 541 和 542 暴露在公网上。FGFM（FortiGate-FortiManager 管理协议）是 FortiGate 和 FortiManager 之间的管理通道，只应该限制在管理网段内，或者只放行确实需要连过来的那几个对端地址。

端口分配上有个细节常被漏掉。Fortinet 的文档里，541 是 FGFM over IPv4，542 是 FGFM over IPv6；从 FortiManager 7.4.1 起，541 也被列入 IPv6 用途。所以双栈环境里两个端口、两个地址族都得管，别只盯着 541 加 IPv4。

这里也得说清楚这项研究的观测边界：扫描数据只覆盖 IPv4 上的 541。IPv6 那一侧、542 那两个口子上暴露了多少台，文中没有数字。 **37.6 万这个量级，是下限，不是全貌。**

想在自己网内找暴露面的，Detections 附录里给了覆盖全部观测到的 JA4 的 Suricata 和 Snort 规则，可以直接挂上去跑。

### 结论

公网上大约 37.6 万台 FortiGate 把 FGFM 管理端口亮着，每一台回过来的 ClientHello 都在交代自己的代际。

那些从 banner 抓取里拿到、一直没人解释的十六进制串，现在可以落到对应的 FortiOS 版本区间；版本通过 CPE 落到 CVE，其中既有 KEV 条目，也有 541 端口上的 CVE-2024-23113。

这类研究最终会进到 VulnCheck 的 Target Intelligence 数据集，让防守方能找到并修掉那些自己都不知道已经向全世界公开的暴露面。

### 附录：JA4 明细

| Gen | 完整 JA4 | JA4_a / JA4_b | JA4_c | 特征细节 | OpenSSL | FortiOS 版本 |
| --- | --- | --- | --- | --- | --- | --- |
| 5P  | t13d171100_a02ea570dccb_9482eddbd848 | —   | —   | TLS 1.3、带 SNI、17 个套件、11 个扩展；固定列表：ECDSA-SHA1 排最前、Brainpool 在 EdDSA 之前、无 ML-DSA | 3.5.5 | 7.4.12 · 7.4.13 |
| 5   | t13d171100_a02ea570dccb_168ae6a8d753 | —   | —   | TLS 1.3、带 SNI、17 个套件、11 个扩展；+ML-DSA（0904-6） | 3.5.0–3.5.7 | 7.4.9 · 7.4.11 · 7.6.7 · 8.0.0 · 8.0.1 |
| 4   | t13d171100_a02ea570dccb_412547015303 | —   | —   | TLS 1.3、带 SNI、17 个套件、11 个扩展；+Brainpool-TLS1.3（081a-c） | 3.4.0 | 7.4.8 · 7.6.1–7.6.4 |
| 3   | t13d251000_d50cb0bd0c54_5ac7197df9d2 | —   | —   | TLS 1.3、带 SNI、25 个套件、10 个扩展；+TLS1.3 扩展、+PSS/EdDSA | 1.1.1–3.1.4 | 6.0.5–6.0.11 · 6.2.0 · 7.0.13 · 7.2.4 · 7.4.0–7.4.7 · 7.6.0 |
| 2   | t12d220700_ad4cf32d3c22_a8cc486ca5dc | —   | —   | TLS 1.2、带 SNI、22 个套件、7 个扩展；有 sig_algs、无 PSS | 1.0.2k–1.1.0h | 5.4.12 · 5.6.14 · 6.0.0–6.0.4 |
| 1   | t10i310400_9d330406ce80_282f11336259 | —   | —   | TLS 1.0、无 SNI、31 个套件、4 个扩展；无 sig_algs 扩展 | 1.0.2 或更早 | 未观测到\* |

先补一条脚注。我们启动过的版本里，没有一个发出 Gen 1 的 ClientHello。能启动的最老版本是 5.4.12，它发的是 TLS 1.2，落在 Gen 2。更早的 5.4 我们只拿到硬件固件形态，而 5.4.0 到 5.4.12 每个构建都打包 OpenSSL 1.0.2，TLS 客户端方法一模一样，所以光看固件没法判断其中到底哪一个（如果有）会发 TLS 1.0。Gen 1 大概率是 5.4 或更老的固件，也可能是我们没复现出来的某种配置。手头那些没装 license 的 6.4 实验虚拟机也发 TLS 1.0，这一点值得记一笔：授权状态本身就可能改变握手指纹。CVE 统计按 5.4.0 计算。

每一代都是一族 JA4 值，不是某一个值。把“一代一个指纹”当结论用，误判率会很高。

| 代   | JA4 变体数（30 天） | 实测最常见的 JA4 | 占该代比例 |
| --- | --- | --- | --- |
| Gen 5P | 7   | t13d171100_a02ea570dccb_9482eddbd848 | 94% |
| Gen 5 | 23  | t13d171100_a02ea570dccb_168ae6a8d753 | 79% |
| Gen 4 | 6   | t13d171100_a02ea570dccb_412547015303 | 92% |
| Gen 3 | 28  | t13d251000_d50cb0bd0c54_5ac7197df9d2 | 44% |
| Gen 2 | 12  | t12d220700_ad4cf32d3c22_a8cc486ca5dc | 61% |
| Gen 1 | 17  | t10i310400_9d330406ce80_282f11336259 | 35% |

决定“代数”的是 OpenSSL 提供的签名算法里那些标记位——Gen 5 有 ML-DSA（基于格的数字签名算法），Gen 4 有 Brainpool 的 TLS 1.3 曲线，依此类推。同一代内部的变体，差在密码套件列表、多一个扩展、或者发不发 SNI。这些差异多半反映管理员的加密设置，比如 FGFM（FortiGate-FortiManager 管理通道）的加密强度选项。

只有一个例外。FortiOS 7.4.12 和 7.6.7 都打包 OpenSSL 3.5.5，却给出不同的 JA4——7.4.12（以及 7.4.13）用一份自己钉死的列表覆盖了 OpenSSL 的默认值。这类主机单独算一代：Gen 5P。详见后面“固定与可配置的 TLS 设置”附录。

### 附录：代数统计的 SQL

Target Intelligence Data 里的分代计数出自下面这条完整查询。数字跑于 2026-11-13，窗口是 2026-10-14 到 2026-11-12 的 30 天，换一天重跑会有小幅漂移。为什么用 30 天而不是 7 天？541 端口的主机大约一个月才被扫一次，这批主机在窗口内的平均可见天数只有 1.0 天，7 天窗口只能覆盖约四分之一的目标。

> 窗口长度不是随手定的参数，它直接决定分母。用 7 天做统计，你看到的不是“有多少台”，而是“这个月碰巧被我撞见了几台”。

每个 JA4 靠原始（未哈希）形态里的加密标记归代，不需要查表，任何变体都能落位：signature_algorithms 列表以 0203,0403,0503,0603,081a 开头（先 ECDSA-SHA1，再 Brainpool，即 FortiOS 7.4.12 钉死的那份）的是 Gen 5P；带 ML-DSA（0904–0906）的是 Gen 5；带 Brainpool TLS 1.3（081a–081c）的是 Gen 4；其它 TLS 1.3 握手是 Gen 3；TLS 1.2 是 Gen 2；TLS 1.0/1.1 是 Gen 1。每台主机只计一次，按最近一次观测到的代数计。

WITH parsed AS (  
SELECT ip_int, timestamp, \`target\_intel.ja4\_parts\`(banner) AS p  
FROM target_intelligence.unknown_parsed  
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)  
AND port = 541 AND STARTS_WITH(banner, 'FgMB')  
),  
classified AS (  
SELECT ip_int, timestamp,  
CASE  
WHEN STARTS_WITH(SPLIT(p.ext_sigalg_string, '\_')\[SAFE_OFFSET(1)\], '0203,0403,0503,0603,081a') THEN '5P'  
WHEN REGEXP_CONTAINS(SPLIT(p.ext_sigalg_string, '\_')\[SAFE_OFFSET(1)\], r'090\[456\]') THEN '5'  
WHEN REGEXP_CONTAINS(SPLIT(p.ext_sigalg_string, '\_')\[SAFE_OFFSET(1)\], r'081\[abc\]') THEN '4'  
WHEN STARTS_WITH(p.ja4_a, 't13') THEN '3'  
WHEN STARTS_WITH(p.ja4_a, 't12') THEN '2'  
WHEN STARTS_WITH(p.ja4_a, 't10') OR STARTS_WITH(p.ja4_a, 't11') THEN '1'  
END AS gen  
FROM parsed WHERE p IS NOT NULL  
),  
per_host AS (  
SELECT ip_int,  
ARRAY_AGG(gen ORDER BY timestamp DESC LIMIT 1)\[OFFSET(0)\] AS gen,  
COUNT(DISTINCT gen) AS gens_seen,  
COUNT(DISTINCT DATE(timestamp)) AS days_seen  
FROM classified GROUP BY ip_int  
)  
SELECT gen, COUNT(\*) AS hosts,  
ROUND(100 \* COUNT(\*) / SUM(COUNT(\*)) OVER (), 1) AS share_pct,  
COUNTIF(gens_seen > 1) AS hosts_seen_in_2plus_gens,  
ROUND(AVG(days_seen), 2) AS avg_days_seen  
FROM per_host GROUP BY gen ORDER BY gen DESC

输出就是上面 Target Intelligence Data 那张表。

93 个 JA4 全部落进了这六代：Gen 5P 7 个变体，Gen 5 有 23 个，Gen 4 有 6 个，Gen 3 有 28 个，Gen 2 有 12 个，Gen 1 有 17 个。稀有变体会随窗口移动进进出出；另有一个来自被截断的抓包，已剔除。

一个月内跨代出现过的主机只有 387 台。这个数字比想象中小得多——说明在真实网络里，FortiGate 的固件升级节奏相当慢，多数设备从被看到到消失，一直待在同一个代里。

Gen 4 最常见的变体 t13d171100_a02ea570dccb_412547015303（35,908 台），就是一台在跑的 FortiOS 7.6.2 发出的 ClientHello。我们启动了一台 7.6.2，它的 JA4_c 与这个值逐字节一致。整篇文章的可信度就建立在这一点上：不是统计推断出来的匹配，是实机比对出来的。

### 附录：固定与可配置的 TLS 设置

JA4 只有在管理员改不动它的时候，才算固件指纹。为了验证这个前提，我们解密了 52 个 FortiGate 固件镜像，版本从 5.4.0 到 8.0.1（36 个虚拟机镜像，16 个硬件镜像，覆盖 5.4.0–5.4.11、7.4.11、7.6.3、7.6.4、7.6.8），用 fortitool 读出每个镜像里编译进去的 TLS 配置，与 Fortinet 官方文档逐条对照；另外启动了 15 个 FortiOS KVM 镜像（5.4.12、5.6.14、6.0.0、6.0.2、6.0.4、6.0.5、6.0.11、6.2.0、6.4.0、6.4.15、7.4.13、7.6.2、7.6.7、8.0.0、8.0.1），直接抓它们的 ClientHello。

固件固定下来的部分是：构成 JA4_c 的扩展和签名算法，以及密钥交换组。每个版本自带一套 OpenSSL，配置目录在编译时就写死为 /ssl；Fortinet 没有为 FGFM 提供任何设置 TLS 组或签名算法的 CLI 选项。连 7.6.5 关于管理界面后量子 TLS 的说明都明确写着：没有选择组的选项。所以一个 ClientHello 落在哪一代，由 FortiOS 版本决定。

例外是 FortiOS 7.4.12 和 7.4.13。两者启动时会写一个 OpenSSL 配置文件 /ssl/openssl.cnf，在系统级默认值里把两张列表都钉住：

\[system_default_sect\]  
SignatureAlgorithms = ECDSA+SHA1:ECDSA+SHA256:ECDSA+SHA384:ECDSA+SHA512:ecdsa_brainpoolP256r1tls13_sha256:ecdsa_brainpoolP384r1tls13_sha384:ecdsa_brainpoolP512r1tls13_sha512:ed25519:ed448:rsa_pss_pss_sha256:rsa_pss_pss_sha384:rsa_pss_pss_sha512:RSA-PSS+SHA256:RSA-PSS+SHA384:RSA-PSS+SHA512:RSA+SHA1:RSA+SHA256:RSA+SHA384:RSA+SHA512:DSA+SHA1:DSA+SHA256:DSA+SHA384:DSA+SHA512  
Groups = P-256:P-384:P-521:ffdhe2048:ffdhe3072:ffdhe4096:ffdhe6144:ffdhe8192:x25519:x448

钉住的这两行，正好就是 **t13d171100_a02ea570dccb_9482eddbd848** 这个家族的签名算法和组： **ECDSA-SHA1 打头，Brainpool 排在 EdDSA 前面，没有 ML-DSA，P-256 密钥共享里也没有 ML-KEM**——尽管底下的库已经是 OpenSSL 3.5.5。这个固定把 OpenSSL 版本盖住了，所以最早那版分类器把这批主机划进了 Gen 4。现在它们单列，叫 Gen 5P。

边界很清楚。FortiOS 7.4.8（OpenSSL 3.4.0）和 7.4.9（OpenSSL 3.5.0）没有这一段；7.6.0 到 7.6.2、7.6.7 也没有（7.6.0 到 7.6.2 确实会写 /ssl/openssl.cnf，但只为加载 OpenSSL 的 FIPS provider，一个 TLS 选项都不设）；7.4.11 同样没有（OpenSSL 3.5.0，在 FortiGate 60E 硬件固件上核过）。所以这个固定是随 7.4.12 一起来的，同一批变化里还包含升级到 OpenSSL 3.5.5。7.4.13 保留，列表一模一样。7.6.7、8.0.0、8.0.1 又都没有了。

7.6.8 走得更远。它写一个 **system_default_sect**，里面的 CipherString、Ciphersuites、SignatureAlgorithms和 Groups 全是运行时填的，另外加了 tls-groups 和 client-sigalgs 两个设置项。Fortinet 不发布 7.6.8 的 VM 镜像，我们看不到它到底填什么值。

> 如果这些值最终可以由管理员改，那 JA4_c 从 7.6.8 起就不再是纯粹的固件指纹了。这条线一旦跨过去，"单个 ClientHello 认固件"这个方法就要打个折扣——你看到的可能是固件，也可能是某位运维的偏好。

扫描数据跟这条时间线对得上。截至 2026-11-12 的 90 天里，16,622 台主机从 Gen 5 挪到 Gen 5P，4,648 台从 Gen 4 挪到 Gen 5P；约 1,500 台从 Gen 5P 移出，几乎全进了 Gen 5。

### 哪些东西管理员能改，哪些不能

下面四个开关里，前两个只影响密码列表和 TLS 版本（对应 JA4_a 和 JA4_b，不是 JA4_c）；FIPS-CC 模式是唯一还能动到 JA4_c 的开关。

-   **config system central-management，set enc-algorithm {default | high | low}**
    
    （默认 high）：FGFM 提供的密码强度。每一代都出现好几种 JA4_b 变体，最可能就是这里的差异造成的。
    
-   **config system global，set ssl-min-proto-version**
    
    （默认 TLSv1-2）：FortiGate 主动发起连接时的最低 TLS 版本。
    
-   **FIPS-CC 模式**
    
    ：收窄算法集（Fortinet 明确写了后量子组在此模式下不可用），所以一台 FIPS-CC 主机可能落到别的代。
    
-   **strong-crypto、admin-https-ssl-\*、ssl-static-key-ciphers**
    
    ：这些管的是管理面 HTTPS/SSH，以及 FortiGate 终止的 TLS 会话，跟它作为客户端发出去的 ClientHello 无关。
    

这几条值得记一下，免得看到异常 JA4_c 就往"新固件"上猜。

### 实机跑一遍

我们把 FortiOS 7.6.2 的 KVM 镜像启起来，抓了两个 ClientHello：一个是我们连它 541 端口时它发的，一个是它连出去到配置好的 FortiManager 时发的。两个的 JA4_c 和 SNI 都一样，跟前面那 35,908 台主机的 Gen 4 变体完全相同。

换 7.4.13、7.6.7、8.0.1 重复，每一次两个方向都发同一个 ClientHello，JA4_c 也符合固件该有的值：7.4.13 是 **9482eddbd848** （Gen 5P），7.6.7 是 **168ae6a8d753** （Gen 5），8.0.1 是 **1ca2267b4e11** （Gen 5）。

更老的镜像则精确落在各代最常见的那个变体上：6.0.5、6.0.11、6.2.0 发 **t13d251000_d50cb0bd0c54_5ac7197df9d2** （Gen 3），5.6.14、6.0.0、6.0.2、6.0.4 发 **t12d220700_ad4cf32d3c22_a8cc486ca5dc** （Gen 2）。6.0 分支内部从 Gen 2 跳到 Gen 3，对应的就是 OpenSSL 1.1.0h（6.0.4）换成 1.1.1（6.0.5）——第一个带 TLS 1.3 的 OpenSSL 版本。5.4.12 发的是 **t12i220500_ad4cf32d3c22_a1e935682795**，一个不带 SNI 的 Gen 2 变体，我们的数据里有 1,995 台主机在发它。8.0.0 的 JA4_c 是 168ae6a8d753，所以证书压缩那个变体是从 8.0.1 开始的。

实验室 VM 的 JA4_b 反而对不上常见变体：7.4.13 和 7.6.7 只提供三个 TLS 1.3 套件，这个 JA4_b 在我们数据里只有 8 台主机。这说明差异来自一台全新、未授权的 VM 的默认设置，不是固件本身。做指纹的时候要留意这一点，别拿开箱 VM 的 JA4_b 当基准。

出方向尤其有用。这时候 FortiGate 是客户端，Suricata 自带的 ja4.hash 规则直接就能命中；在任何 FortiGate 跟 FortiManager 通信的网络上，同一张查表都能被动跑起来，不需要碰设备。

### 附录：测不到的版本

静态测了 52 个固件镜像，启动了 15 个 FortiOS KVM 镜像。下面这些版本要么拿不到，要么在我们实验室跑不起来，它们的代是从 ClientHello 推断的，不是从固件测出来的；只影响这些版本的 CVE 也不在本文的代统计里。

-   **FortiOS 6.4.x**
    
    ：6.4.0 和 6.4.15 的 KVM 镜像都发 TLS 1.0 的 ClientHello，没有签名算法，分类器会判成 Gen 1——可我们的数据里发这些 JA4 的主机不到 30 台。6.4 搭载的是 OpenSSL 1.1.1，跟 6.0.11、6.2.0 用来发 TLS 1.3 的是同一个库。所以我们倾向于认为未授权的实验室 VM 回落到了一套更弱的配置，真实的 6.4 主机大概率在 Gen 3。这事没法确认，代统计里就不放 6.4 的 CVE 了。
    

-   **Gen 1（TLS 1.0）**
    
    ：我们手上能启动的固件里，没有一版会发 TLS 1.0。5.4.12 属于 Gen 2；5.4.0 到 5.4.11 我们只拿到硬件固件，它们和 5.4.12 用的是同一套 OpenSSL 1.0.2 与 TLS client methods。所以 Gen 1 大概率是 5.4 或更老的固件，也可能是我们没复现出来的某种配置。既然无从验证，Gen 1 的 CVE 统计就按 5.4.0 来算。
    
-   **FortiOS 7.4.10**
    
    ：拿不到。7.4.9 和 7.4.11 都用 OpenSSL 3.5.0 且不带 pin，7.4.10 极可能落在 Gen 5。
    
-   **FortiOS 7.6.5 与 7.6.6**
    
    ：拿不到。7.6.4 还在 OpenSSL 3.4.0（Gen 4），7.6.7 已是 3.5.5（Gen 5），7.6 分支切到 Gen 5 的动作发生在 7.6.5 或 7.6.6。
    
-   **FortiOS 7.6.8**
    
    ：只有硬件镜像，而它的系统级 TLS 配置是在运行时填进去的（见"固定与可配置 TLS 设置"附录），所以这一版归到哪一代，我们说不准。
    

## 一个正在长大的 Gen 5 变体

Gen 5 里有一支 JA4_c 为 `1ca2267b4e11` 的变体，目前约 1.68 万台主机，而且数量还在涨。它的 ClientHello 多带了证书压缩扩展。一台实机 FortiOS 8.0.1 发出的正是这个 JA4_c，8.0.0 则不发——所以这批主机极可能跑在 8.0.1 或更高版本上（8.0.1 发布于 2026-09-15，跟主机数上涨的时间对得上）。当然，其他版本会不会也发这个扩展，我们排除不了。

证书压缩不是 Fortinet 自己加的功能，Fortinet 的 release notes 里一个字都没提。原因在 OpenSSL：8.0.1 的 OpenSSL 3.5.7 编译时链接了 zlib，8.0.0 的 3.5.5 没链接。OpenSSL 3.2 之后只要编译时带了压缩库（这里只有 zlib），就会自动通告证书压缩。它的签名算法仍是 OpenSSL 默认值，所以归代还是 Gen 5。

## 附录：先证明这批主机是 FortiGate

541 端口上的每一个 JA4 都只落进两个组，没有交叉：

| 证据  | ClientHello 中带 Fortinet 名称 | ClientHello 中无主机名 |
| --- | --- | --- |
| JA4 变体数 | 76  | 17  |
| 主机数 | 358,293（95.3%） | 17,611（4.7%） |
| 在另一端口被识别 | 23.8% | 28.2% |
|     | 83.1% | 85.5% |
| 开 443 的主机中同时开 10443 | 10.8% | 12.1% |
| 全网基准：443 中占 10443 | 0.79% | 0.79% |

两组里有 15% 到 17% 的主机在别的端口上被识别成别的东西，比例差不多。这类情况基本都是通过 FortiGate 的 SSL-VPN 门户发布的 Web 应用，不是另一款产品。另有 4 个很小的 JA4（合计 7 台主机）找不到旁证，我们照原样计入。

顺带说一句，10443 在两组里的占比都在 10% 以上，是全网基准的十几倍。这个数字比任何指纹都更能说明这批主机的身份——FortiGate 的 SSL-VPN 默认就往那儿挪。

## 附录：检测规则

Suricata 和 Snort 开箱都解析不了这个 ClientHello。FortiGate 是以监听方的身份发 ClientHello，而两个工具都假定 TLS 由连接方发起。Suricata 干脆不把这些流当 TLS，也就不会算 JA4；Snort 会标成 SSL，但它的 SSL inspector 从不登记 ClientHello， `ssl_state:client_hello` 永远不触发。

Suricata \[16\] 因此用不上 `ja4.hash` 关键字。下面的规则改为直接在原始字节里匹每代的标记：先匹 7.4.12 的 pin 签名列表，再匹 ML-DSA，再匹 Brainpool，最后落到 TLS 版本。这样也能抓到我们没见过的变体。Snort 3 的规则匹同一组标记。

光有加密算法标记不行，那是 OpenSSL 的通用特征。所以下面每条规则都附加了源端口 541 或 542 的条件——那意味着是 FortiGate 用自己的 ClientHello 回话。两套规则我们都在全变体抓包上测过（Suricata 7.0.12、Snort 3.10）：每台主机恰好触发一条代别告警，外加端口兜底。2026-11-11 用 Gen 5P 规则复测，2026-11-13 又对 FortiOS 7.4.13、7.6.7、8.0.1 的实机抓包复测。

### Suricata

\# FortiGate FGFM ClientHello, one rule per generation. The FortiGate sends the ClientHello as the listener, so Suricata's TLS parser (and ja4.hash) never sees it; these rules match the generation markers in the raw bytes instead.  
alert tcp $HOME_NET \[541,542\] -> any any (msg:"FortiGate FGFM ClientHello, Gen 5P (FortiOS 7.4 pinned TLS config, OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; content:"|02 03 04 03 05 03 06 03 08 1a|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100007; rev:1;)  
alert tcp $HOME_NET \[541,542\] -> any any (msg:"FortiGate FGFM ClientHello, Gen 5 (OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; content:"|09 05 09 06 09 04|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100001; rev:3;)  
alert tcp $HOME_NET \[541,542\] -> any any (msg:"FortiGate FGFM ClientHello, Gen 4 (OpenSSL 3.2-3.4)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; content:"|08 1a 08 1b 08 1c|"; content:!"|09 05 09 06 09 04|"; content:!"|02 03 04 03 05 03 06 03 08 1a|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100002; rev:4;)  
alert tcp $HOME_NET \[541,542\] -> any any (msg:"FortiGate FGFM ClientHello, Gen 3 (OpenSSL 1.1.1-3.1)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; pcre:"/\\x00\\x2b\\x00\[\\x03-\\x0b\]\[\\x02-\\x0a\]\\x03\\x04/"; content:!"|08 1a 08 1b 08 1c|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100003; rev:3;)  
alert tcp $HOME_NET \[541,542\] -> any any (msg:"FortiGate FGFM ClientHello, Gen 2 (OpenSSL 1.0.2k-1.1.1)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; byte_test:2,=,0x0303,9; pcre:!"/\\x00\\x2b\\x00\[\\x03-\\x0b\]\[\\x02-\\x0a\]\\x03\\x04/"; content:!"|08 1a 08 1b 08 1c|"; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100004; rev:3;)  
alert tcp $HOME_NET \[541,542\] -> any any (msg:"FortiGate FGFM ClientHello, Gen 1 (OpenSSL 1.0.2k)"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; byte_test:2,<,0x0303,9; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100005; rev:3;)  
  
\# Port-only fallback: any TLS handshake record whose first message is a ClientHello, sent by a host listening on 541/542  
alert tcp $HOME_NET \[541,542\] -> $EXTERNAL_NET any (msg:"FortiGate FGFM port exposed: ClientHello sent by listener"; flow:established,to_client; content:"|16 03|"; depth:2; byte_test:1,=,1,5; threshold:type limit, track by_src, count 1, seconds 3600; classtype:policy-violation; sid:4100006; rev:2;)

### Snort

同样的代别标记，换 Snort 3 语法。Snort 每条流只报一次，所以不像 Suricata 那套需要 threshold：

\# FortiGate FGFM ClientHello, one rule per generation. The FortiGate sends the ClientHello as the listener, so Snort's SSL inspector never registers it as a ClientHello; these rules match the generation markers in the raw bytes instead.  
alert tcp $HOME_NET \[541,542\] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 5P (FortiOS 7.4 pinned TLS config, OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; content:"|02 03 04 03 05 03 06 03 08 1a|"; classtype:policy-violation; sid:4100007; rev:1; )  
alert tcp $HOME_NET \[541,542\] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 5 (OpenSSL 3.5.x)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; content:"|09 05 09 06 09 04|"; classtype:policy-violation; sid:4100001; rev:1; )  
alert tcp $HOME_NET \[541,542\] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 4 (OpenSSL 3.2-3.4)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; content:"|08 1a 08 1b 08 1c|"; content:!"|09 05 09 06 09 04|"; content:!"|02 03 04 03 05 03 06 03 08 1a|"; classtype:policy-violation; sid:4100002; rev:2; )  
alert tcp $HOME_NET \[541,542\] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 3 (OpenSSL 1.1.1-3.1)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; pcre:"/\\x00\\x2b\\x00\[\\x03-\\x0b\]\[\\x02-\\x0a\]\\x03\\x04/"; content:!"|08 1a 08 1b 08 1c|"; classtype:policy-violation; sid:4100003; rev:1; )  
alert tcp $HOME_NET \[541,542\] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 2 (OpenSSL 1.0.2k-1.1.1)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; byte_test:2,=,0x0303,9; pcre:!"/\\x00\\x2b\\x00\[\\x03-\\x0b\]\[\\x02-\\x0a\]\\x03\\x04/"; content:!"|08 1a 08 1b 08 1c|"; classtype:policy-violation; sid:4100004; rev:1; )  
alert tcp $HOME_NET \[541,542\] -> any any ( msg:"FortiGate FGFM ClientHello, Gen 1 (OpenSSL 1.0.2k)"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; byte_test:2,<,0x0303,9; classtype:policy-violation; sid:4100005; rev:1; )  
  
\# Port-only fallback: any TLS handshake record whose first message is a ClientHello, sent by a host listening on 541/542  
alert tcp $HOME_NET \[541,542\] -> $EXTERNAL_NET any ( msg:"FortiGate FGFM port exposed: ClientHello sent by listener"; flow:established,to_client; content:"|16 03|",depth 2; byte_test:1,=,1,5; classtype:policy-violation; sid:4100006; rev:1; )

* * *

### 参考资料

\[1\] https://console.vulncheck.com/cve/CVE-2022-42475

\[2\] https://console.vulncheck.com/cve/CVE-2024-47575

\[3\] https://console.vulncheck.com/cve/CVE-2024-23113

\[4\] https://www.fortiguard.com/psirt/FG-IR-24-029

\[5\] https://foxio.io/

\[6\] https://github.com/mosajjal/fortitool

\[7\] https://support.fortinet.com/Information/ProductLifeCycle.aspx

\[8\] https://endoflife.date/fortios

\[9\] https://docs.vulncheck.com/products/exploit-and-vulnerability-intelligence/cpe

\[10\] https://console.vulncheck.com/cve/CVE-2018-13374

\[11\] https://console.vulncheck.com/cve/CVE-2018-13383

\[12\] https://console.vulncheck.com/cve/CVE-2019-5591

\[13\] https://console.vulncheck.com/cve/CVE-2019-6693

\[14\] https://console.vulncheck.com/cve/CVE-2020-12812

\[15\] https://console.vulncheck.com/cve/CVE-2021-44168

\[16\] https://docs.suricata.io/en/suricata-7.0.12/rules/ja-keywords.html

\[17\] https://www.vulncheck.com/product/target-intelligence

\[18\] https://www.vulncheck.com/product/canary-intelligence

\[19\] https://www.vulncheck.com/blog/meowproject

\[20\] https://console.vulncheck.com/browse/kev

\[21\] https://console.vulncheck.com/browse

\[22\] https://www.vulncheck.com/product/exploit-intelligence

\[23\] https://wwv.vulncheck.com/demo-request

\[24\] https://www.vulncheck.com/blog/fortigate-firmware-clienthello
