---
title: 【先知】谁在偷偷调用大模型？内网 LLM API 流量的识别、检测与绕过实测
source: https://xz.aliyun.com/news/92806
source_host: xz.aliyun.com
clip_date: 2026-09-11T13:42:47+08:00
trace_id: 68961b50-55e9-4f33-9b2a-93a50b90b85a
content_hash: 056e1a8da61e1009b58c3874c054b39b053737d2659170450d7a2c9c87f446aa
status: synced
tags:
  - 先知
  - 协议分析
  - 安全工具
series: null
feed_source: 先知安全技术社区
ai_summary: 不解密 HTTPS，仅凭流量侧的 DNS、SNI、JA3 与 SSE 行为四层特征，就能识别内网谁在调用大模型 API；但静态特征均可被绕过，需靠纵深分层兜底。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3d875244-d011-8182-a944-ce760172c320
ioc:
  cves: []
  cwes: []
  hashes:
    - 3adacb99ecb51ed59c4f6c4ed9a7dcaa
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 不解密 HTTPS，仅凭流量侧的 DNS、SNI、JA3 与 SSE 行为四层特征，就能识别内网谁在调用大模型 API；但静态特征均可被绕过，需靠纵深分层兜底。
> 
> - **四层特征与失效条件：** DNS 明文查询、TLS SNI、JA3/JA4 客户端指纹、SSE 流式行为各有存活条件；DoH/DoT 灭 DNS 层，ECH 或前置代理灭 SNI 层，模拟浏览器指纹灭 JA3 层，只有行为层无天然失效条件、只能被噪声淹没。
> - **Suricata 四道闸门实测：** 按 dns.query、tls.sni、http.uri、ja3.hash 写规则；四类混合 pcap（4088 包）命中 6 条告警全部真阳性，12 个主流站点加 pip 装包（2043 包）误报为 0。
> - **绕过结果：** DoH 让闸门 1 静默但闸门 2 照常命中；IP 直连前置代理因 RFC 6066 不发 SNI，DNS+SNI 双双消失、四道闸门零告警；域名连代理在 8443 端口仍命中 SNI——非标端口因 Suricata 按内容而非端口识别协议而失效。
> - **SSE 行为兜底：** 流式调用呈小包（均值 430 或 139 字节）、毫秒级稳定间隔（15/26ms）、持续数秒，可与下载的满包 1ms 狂灌区分；非流式调用仅 8 个包，行为层完全隐身。
> - **工程教训与建设顺序：** startswith 必须写在 content 之后，否则签名加载失败仅留一行日志、静默缺防；防御按“域名清单盘点 → 静态规则 → 统一 LLM 网关收敛出口 → SSE 行为兜底”由零成本到持续运营推进。

* * *

## 一、引言：一片 HTTPS 掩护下的检测盲区

先说一个我最近才意识到的问题。

假设某天，公司里一位员工为了赶方案，把一份还没发布的合同文本贴进 DeepSeek 的网页对话框，让它帮忙润色。这个动作从网络层面看是什么？一次再普通不过的 HTTPS 请求：目的端口 443，证书合法，内容加密。防火墙看不见里面有合同，DLP（Data Loss Prevention，数据防泄漏系统）如果只做网络侧关键字匹配，看到的也只是一段密文。

如果这位员工更进一步，直接在自己电脑上装了 Python，用脚本调 DeepSeek 的 API 批量处理客户数据呢？网络层面还是一模一样：DNS 查一下 `api.deepseek.com` ，然后 TLS 握手，然后 443 端口上加密传输。整个过程不需要任何「越权」动作，没有爆破，没有可疑端口，安全设备大概率全程无感。

这类现象在国外有个专门的词，叫 Shadow AI（影子 AI）——员工绕开 IT 审批，私自把业务数据交给外部 AI 服务处理。它和早年的 Shadow IT 是同一个逻辑，但 AI 版本有个更麻烦的地方：AI 服务的使用门槛极低、频次极高，而且大模型 API 的调用模式（长连接、流式输出）和企业里其他 HTTPS 流量长得很不一样，用通用的"上网行为管理"思路去套，经常漏。

OWASP 在《Top 10 for LLM Applications》2025 版里，把"敏感信息泄露"（Sensitive Information Disclosure）列在第 2 位。而泄露通道里，把数据喂给外部 LLM API 是最常见、也最难被网络侧发现的一种。

问题就来了： **在不解密 HTTPS、不装终端插件的前提下，纯靠流量侧，能不能把「谁在调用 LLM API」挖出来？** 挖出来之后，想绕开管控的人用 DoH（加密 DNS，把域名查询也藏进 HTTPS）、改 SNI（TLS 握手里明文声明的目标域名）、套中转，又能把检测打回原形几成？

这篇文章就是我自己动手回答这两个问题的记录。我搭了一个隔离的虚拟机环境，从零分析了大模型 API 调用在 DNS、TLS、HTTP、行为四层留下的痕迹，写了一套 Suricata 检测规则跑出检出率和误报率，然后站在「想绕过检测的人」的视角，把这套规则亲手绕了一遍，最后验证了行为统计检测能不能兜底。

先交代清楚结论的适用范围：这是一次在授权隔离环境里的攻防实验，所有流量都产生在我自己的虚拟机网段，不涉及任何第三方目标；文章里涉及 API 的部分只出现服务名称（DeepSeek、Ollama），通过 API 访问，不涉及任何密钥。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7fc04791e09cc965.png)

## 二、LLM API 调用的协议栈画像：每一层都留了什么

要检测一种流量，先得看清它的全貌。这一节是机制推导，把一次典型的 LLM API 调用逐层拆开，看每一层留了什么痕迹、这些痕迹分别在什么条件下会消失。这也是后面所有检测规则的依据。

### 2.1 一次调用的完整链路

以最常见的 DeepSeek API 调用为例，一个 Python 脚本发起请求后，网络上依次发生这些事：

1.  **DNS 解析**：客户端明文向 DNS 服务器查询 `api.deepseek.com` 的 A 记录。此时如果你在看 DNS 流量，域名是肉眼可见的。
2.  **TCP 三次握手**：连向解析出的 IP，端口 443。
3.  **TLS 握手**：ClientHello 里有两个关键信息—— **SNI** （Server Name Indication，服务器名称指示，TLS 握手时明文告诉服务器"我要访问哪个域名"，可以理解为信封上写的收件地址，加密的是信纸而不是信封）和各种扩展参数，后者会被算成 **JA3/JA4 指纹** （根据 TLS 客户端握手的版本号、密码套件、扩展列表等参数算出的哈希，相当于客户端 TLS 栈的身份证，curl、Python、Chrome 各不相同）。
4.  **HTTP 请求**：加密传输 POST `/chat/completions` ，请求体是 JSON 格式的对话和参数。
5.  **SSE 流式响应**：服务端通过 **SSE** （Server-Sent Events，服务器向客户端单向持续推送数据流的 HTTP 机制，大模型"打字机式"逐字输出就是靠它实现的）持续返回生成的 token，这段时间连接上会出现大量下行小包。

本地部署的大模型服务（比如 Ollama，默认监听 11434 端口）走的是明文 HTTP，没有 TLS 层，所有内容直接可读。那是本机或内网调用，和出网流量是两件事，后面分开处理。

### 2.2 四层特征及其"消失条件"

把上面的链路整理成检测视角，每层特征都有它的存活条件和失效条件：

|     |     |     |     |
| --- | --- | --- | --- |   
| 层   | 特征  | 存活条件 | 失效条件 |
| DNS | 明文查询 LLM API 域名 | 客户端用普通 DNS | 客户端启用 DoH/DoT |
| TLS | SNI 明文域名 | 未部署 ECH | 启用 ECH 或走前置代理 |
| TLS | JA3/JA4 客户端指纹 | TLS 栈未被刻意伪装 | 主动模拟浏览器指纹 |
| HTTP | 路径、SSE 响应 | 明文 HTTP（内网服务） | 任何 HTTPS |
| 行为  | 流式小包、长持续 | 只要走网络就在 | 不存在，只能被噪声淹没 |

这张表值得多看一眼，因为它决定了检测体系的设计思路： **静态身份特征（DNS、SNI）查得准、误报低，但每一项都有已知的绕过手段；行为特征难绕，但阈值设计不好就容易误报。** 单靠任何一层都不够，这一点会在后面的绕过实验里反复得到验证。

还有一层值得单独说：JA3 指纹对"脚本调用"这件事有很强的区分度。同一个域名的访问，来自浏览器和来自 Python 脚本，JA3 完全不同——因为浏览器用的是 BoringSSL/NSS，Python 的 httpx、requests 库用的是系统 OpenSSL。也就是说，即便是网页版 DeepSeek 和脚本批量调 API 这两种访问，在 TLS 指纹层面也是两类东西。对"批量导出数据"这个威胁场景来说，脚本调用的指纹恰恰是我们要抓的重点。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e28cf37a11397f21.png)

## 三、实验一：三类流量的特征采集与画像

理论说完，开始动手。实验一的目标是把"调用 LLM API 的流量"和"普通上网流量"放在同一张 pcap 里，逐层对比，验证第二节那张表到底站不站得住。

### 3.1 环境编排

整套环境跑在 VMware 的隔离网段（192.168.3.0/24，NAT 模式，虚拟机之间直接互通，出网流量经宿主机 NAT 访问 DeepSeek API，网段内没有任何真实业务系统），两台虚拟机分工如下：

|     |     |     |
| --- | --- | --- |  
| 机器  | 角色  | 用途  |
| Ubuntu 24.04 虚拟机 | 员工电脑 | 跑 Python 调用脚本（DeepSeek API）、Ollama 0.33.3（qwen2.5:0.5b/1.5b，扮演本地 LLM 服务）、tcpdump 抓包 |
| Kali 虚拟机 | 安全分析机 | tshark 流量分析、Suricata 检测、自写检测脚本，同时扮演调用内网明文 LLM 服务的客户端 |

环境就绪的验证方式很简单：在 Kali 上确认 Suricata 与 tshark 的版本，并确认规则引擎支持本文要用 ja3、tls.sni、dns.query 这几个关键字（验证输出见本节末配图）。

对照组我选了三类最常见的流量： `curl` 访问搜索引擎（普通 HTTPS 浏览）、一次 3MB 的文件下载、以及从 Kali 远程调用 Ubuntu 上的 Ollama——这里有个小设计：Ollama 默认只监听 127.0.0.1，我把它改绑到 `0.0.0.0` 并在防火墙放行 11434，让调用从另一台机器进来，这样明文 HTTP 才会真正出现在被抓的物理网卡上（本机回环流量抓不到）。实验一我抓了两个 pcap：一个单独抓 DeepSeek 调用，逐层看协议栈明细；另一轮把四类流量（DeepSeek API、Ollama 明文 API、普通浏览、文件下载）混在一个时段里采，留给实验二做检出与误报对照。

抓包在员工电脑上做（ `tcpdump -w` ，过滤器 `port 53 or port 443 or port 11434` ），这模拟的是 NDR（Network Detection and Response，网络检测与响应）最常见的部署：旁路镜像，检测方只拿到一份流量副本，不改转发路径。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd6ae8518855f574.png)

### 3.2 观察什么

拿到 pcap 后，我关注四个问题：

1.  DNS 层：DeepSeek API 调用前是否有独立的 `api.deepseek.com` 查询？普通流量里这个域名出现频率如何？
2.  TLS 层：SNI 是否明文可见？DeepSeek、普通网站的 ClientHello 里各带了什么？
3.  JA3/JA4：Python SDK（openai 库底层是 httpx）、curl、wget（前两者走 OpenSSL、后者走 GnuTLS，三种 TLS 实现）的指纹差异有多大？
4.  行为层：SSE 流式响应期间的包长分布、包间隔、会话时长，和文件下载（也是长会话、大流量）怎么区分？

其中第 4 个问题是我觉得最有意思的部分：SSE 和文件下载在"会话长、下行量大"这个粗粒度上很像，区分点在细节——SSE 是"匀速小雨"，下载是"倾盆大雨"。具体量化差异留到实验四。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e97b4f42053a56e2.png)

### 3.3 JA3 指纹对比

这一步用 tshark 直接读 JA3 字段（JA3 是对 TLS ClientHello 里版本、密码套件、扩展列表等参数拼串后取 MD5，相当于客户端的"握手指纹"），对比 Python 脚本、curl、wget 三种客户端先后访问同一个 api.deepseek.com 时的指纹。实测三个 JA3 哈希完全不同—— `d39e1be3…` 、 `0149f47e…` 、 `e91ce640…` ，三者分别绑定 OpenSSL 的 Python 绑定、curl 的 OpenSSL 调用和 wget 的 GnuTLS 栈，扩展列表和顺序的差异在哈希里一览无余。

更有意思的一个细节：实验一里调用 DeepSeek 的是 openai 库（底层 httpx），它的 JA3 是 `3adacb99…` ，和这次裸 Python ssl 握手的 `d39e1be3…` 也不一样—— **同一种语言、不同的 HTTP 库，指纹都不同**。这说明 JA3 的粒度细到"哪个库发起的连接"，对企业检测是好消息：办公网里绝大多数 TLS 流量来自浏览器（各自的指纹长期稳定、可枚举），"脚本型指纹"天然是少数派。少数派意味着可运营：给已知合规客户端的指纹加白名单，新出现的脚本型 TLS 客户端本身就是告警理由，和它访问什么域名无关。当然 JA3 不是铁板一块——客户端升级 TLS 栈指纹就会变，白名单要跟着维护，这也是它只能做闸门之一的原因。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d7fd349f0e0afa8.png)

## 四、实验二：Suricata 规则上线，检出和误报怎么走

特征有了，下一步把它变成可运营的检测。工具选 Suricata（开源网络入侵检测引擎，规则语法和 Snort 兼容，是目前企业侧最常用的旁路检测引擎之一），版本随 Kali 仓库安装。

### 4.1 规则设计：四道闸门

按第二节的分层特征，我写了四组规则：

```bash
# 闸门1：DNS 层——明文查询 LLM API 域名
alert dns any any -> any any (msg:"GATE1 LLM DNS query api.deepseek.com"; dns.query; content:"api.deepseek.com"; nocase; sid:1000001; rev:1;)

# 闸门2：TLS 层——SNI 直指 LLM API 域名
alert tls any any -> any any (msg:"GATE2 LLM TLS SNI api.deepseek.com"; tls.sni; content:"api.deepseek.com"; nocase; sid:1000002; rev:1;)

# 闸门3：HTTP 层——内网明文大模型服务（Ollama 为例）
alert http any any -> any any (msg:"GATE3 plaintext LLM API /api/chat"; http.uri; content:"/api/chat"; startswith; sid:1000003; rev:2;)

# 闸门4：TLS 层——脚本型客户端指纹（JA3，哈希来自实验一 openai 库实测）
alert tls any any -> any any (msg:"GATE4 script-like TLS client ja3"; ja3.hash; content:"3adacb99ecb51ed59c4f6c4ed9a7dcaa"; sid:1000004; rev:1;)
```

这里有个现场踩坑值得一记：闸门 3 我第一版写的是 `http.uri; startswith; content:"/api/chat"` —— `startswith` 放在了 `content` 前面，Suricata 8 直接报错 `startswith needs a preceding content option` ，整条签名加载失败被静默跳过，其余规则照常跑，不细看日志根本发现少了一条闸门。正确写法是 `content:"/api/chat"; startswith;`（修饰符跟在 content 之后）。这个坑的教训是： **引擎对加载失败的规则只给一行日志，检测覆盖面可能已经悄悄缺了一角，规则上线前必须核对加载清单。**

另外闸门 4 的哈希用的是实验一实测的 openai 库 JA3（ `3adacb99…` ），而不是刻意构造的"恶意指纹"——这套规则的语义是"出现了脚本型 TLS 客户端"这个行为本身，它对自研程序、CI 任务、当然也包括员工私接脚本，一视同仁。

设计逻辑上还有两点值得说明。第一，规则端口全部写 `any any` 而不是限定 443/53：Suricata 做的是应用层协议识别（看报文内容判断是 DNS 还是 TLS），不是看端口——这意味着客户端把 HTTPS 挪到 8443 这类非标端口，闸门 2 照样命中，这个特性会在实验三里专门验证。第二，闸门 1 和 2 是冗余设计，正常流量里两条会同时命中，这种冗余不是浪费——它正是实验三里 DoH 绕过闸门 1 后闸门 2 仍然兜住的伏笔。四道闸门在整体检测链路中的位置见下图。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8a7b72f7d388ac6b.png)

### 4.2 实测：检出率与误报率

检测规则的生命线不是"能不能报"，而是"报得准不准"。测试分两步：

**第一步，回放四类混合 pcap** （4088 个包），统计每类流量触发哪些闸门。实测结果：六条告警，全部是真阳性——

|     |     |     |
| --- | --- | --- |  
| 规则  | 命中数 | 命中内容 |
| 闸门 1（DNS） | 3   | `api.deepseek.com` 的 A / AAAA 查询，外加 CDN 的 CNAME 链查询 `api.deepseek.com.eo.dnse1.com` |
| 闸门 2（SNI） | 1   | DeepSeek TLS 连接的 ClientHello |
| 闸门 4（JA3） | 1   | **与闸门 2 同一条连接** （同一时间戳、同一源端口） |
| 闸门 3（HTTP） | 1   | 内网 192.168.3.5 → Ollama 11434 的 `POST /api/chat` |
| 普通浏览 / 文件下载 | 0   | 百度访问和 3MB 文件下载全程静默 |

两个细节比数字本身更有价值。其一，闸门 1 的三次命中里有一次是 CNAME 链查询——CDN 把 `api.deepseek.com` 别名到 `api.deepseek.com.eo.dnse1.com` ，子串匹配让规则把这条链也连坐命中了；如果当初图严谨加上 `endswith` 锚定，这条就漏了。子串匹配的代价是理论上的撞库风险（比如 `evil-api.deepseek.com.attacker.com` ），于是有了第二步。其二，闸门 2 和闸门 4 在同一条连接上同时命中——TLS 握手一出就同时暴露"访问了谁"和"用的是什么客户端"，两条独立证据互相印证，这正是冗余闸门想要的效果。

**第二步，误报压力测试**。批量访问 12 个主流站点（百度、QQ、B站、知乎、CSDN、掘金、GitHub、Gitee、阿里云、腾讯云、网易、搜狐，覆盖 CDN 与各种证书部署）加一次 pip 在线装包，抓 2043 个包——其中 34 条 DNS 查询、14 条 TLS 会话——回放同一套规则， **告警总数 0**。子串匹配在这批真实域名上没有撞出任何误报——LLM API 域名与常见业务域名的字符分布差异足够大，但这也说明单靠两个域名的内容匹配误报可控；如果规则库扩到几十上百个 LLM 服务域名，压力测试就该常态化跑。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8b5c8feb6e0cbbd8.png)

## 五、实验三：把我的规则亲手绕一遍

自己写的规则，最怕的就是"看起来很美"。这一节换到「想绕开管控的内部员工」视角，把第二节那张表里的失效条件逐一变成现实，看四道闸门各自还能活几道。

### 5.1 DoH：干掉 DNS 闸门

DoH（DNS over HTTPS，把 DNS 查询也装进 HTTPS 加密通道的协议，RFC 8484）是最容易上手的绕过手段。实测只需要 curl 的一个参数： `curl -s --doh-url https://doh.pub/dns-query https://api.deepseek.com/ -o /dev/null` ，API 调用照常成功。抓包结果和机制推导完全一致——明文 DNS 里 `api.deepseek.com` 的查询彻底消失，只剩两条 `doh.pub` 的查询；Suricata 回放这段 pcap，闸门 1 静默，闸门 2 照常命中（SNI 还是 `api.deepseek.com` ）。

**DNS 加密只是把问题从"查了什么域名"挪到了"从哪个域名 TLS 握手"，对 SNI 层的检测没有实质影响。** 顺带一提，DoH 还送了一个新信号： `doh.pub` 这个域名本身进了明文查询——企业网里出现终端直连公共 DoH 服务器，本身就是值得告警的行为。

### 5.2 前置代理：SNI 的生死取决于客户端怎么连

比 DoH 更狠的是"第三方中转"：员工把调用发给一台自己的 VPS（Virtual Private Server，租来的境外云服务器），VPS 再转发给 DeepSeek。我在 Kali 上用 socat（一个命令行 TCP 中转工具）起了一个纯 TCP 中转（监听 8443，转发到 `api.deepseek.com:443` ），模拟这个场景——实测发现一个初稿没预料到的细节： **前置代理对 SNI 的影响，完全取决于客户端用什么地址连代理**。

**连法一：IP 直连代理** （ `https://192.168.3.5:8443` ，攻击者防域名监控的常规做法）。这里撞出一个 RFC 层面的"彩蛋"：SNI 扩展按 RFC 6066 只能放域名、不能放 IP——所以 curl 直连 IP 时 **压根不发 SNI**。抓包验证：网段内零条 DNS 查询（socat 侧硬编码了目标 IP，连代理解析也不发生）、ClientHello 里没有 SNI。Suricata 回放： **闸门 1、2 双双静默，四道闸门零告警**。TLS 层的静态身份特征被连根拔掉——这比我预想的"绕过"要彻底得多。有个小插曲值得一提：第一次测试时 HTTP 层返回了 418，原因是 curl 把 `Host: 192.168.3.5:8443` 原样发给了转发链，DeepSeek 的 CDN/WAF 不认，加上 `Host: api.deepseek.com` 头才通——说明即使 TLS 层伪装到位，应用层的 Host 一致性校验还在服务端守着，攻击者每多藏一层，请求就要多伪装一处。

**连法二：域名连代理** （本地 hosts 把 `api.deepseek.com` 指到代理 IP，URL 仍写域名）。这时 ClientHello 的 SNI 就是 `api.deepseek.com` ，纯 TCP 中转把这个 SNI 原样透传给真实服务器。Suricata 回放： **闸门 2 在 8443 端口照常命中**——这一发同时验证了两件事：SNI 在域名连法下存活，以及非标端口拦不住按内容识别协议的检测（本来在 5.3 单独测的那条"哑弹"结论，顺手就证完了）。

还有一种连法本文没有单独实测但值得说明：客户端用 VPS 自己的域名连代理（SNI=VPS 域名）。这时闸门 2 对 `api.deepseek.com` 的规则确实失效，但流量会留下一个"新面孔域名"的 SNI——对基线化的企业网，陌生域名的 TLS 握手本身就是可运营的告警点，和闸门 4 的指纹白名单是同一个思路。

这时还活着的检测面：目的 IP 情报（VPS 的 IP 大概率带"代理/IDC"标签，这是情报运营的活）、陌生 SNI 基线、以及 **行为特征**——中转不改变 SSE 流式传输的物理形态，这正是实验四存在的理由。

值得强调的是，传统思路里的"域名前置"（Domain Fronting，TLS SNI 与 HTTP Host 填不同域名来藏真实目标）在今天的公有云上基本已经失效——主流云厂商都强制 SNI 与 Host 一致性校验了，所以本实验没有把它作为绕过手段测试，只在机制层面说明。

### 5.3 非标端口与 ECH：一个"哑弹"和一个"未爆弹"

**非标端口**：实测结论如 5.2 所述——闸门 2 在 8443 上照常命中。Suricata 靠报文内容识别协议而非端口，把 HTTPS 挪到 8443 这类"绕过"手段在 LLM API 检测场景下接近哑弹。

**ECH** （Encrypted Client Hello，把 ClientHello 里的 SNI 字段也加密的新 TLS 扩展）是理论层面最彻底的静态特征杀手。但实测环境凑不齐它的触发条件：客户端 curl 8.5.0 / OpenSSL 3.0.13 尚未启用 ECH 支持，主流 LLM API 端点也未见公开的 ECH 部署声明——两头都不支持，这个实验只能诚实标注为"未实测"。从检测对抗的角度看，ECH 普及之日就是 SNI 闸门失效之时，届时静态特征只剩 JA3/JA4 指纹和目的 IP，行为检测的权重会进一步提高。在 ECH 真正普及之前，SNI 依然是性价比最高的检测点。

### 5.4 小结：绕过之后的残余风险

把实测结果叠在一起看（括号内为 Suricata 实际回放告警）：DoH 干掉闸门 1（GATE1 静默、GATE2 命中）；IP 直连代理最狠，DNS 和 SNI 一起消失（**零告警**）；域名连代理则 SNI 存活、非标端口无效（GATE2 在 8443 命中）。规律很清楚： **静态身份特征是"点名式"检测，点到就准，但每个点都能被拆；行为特征是"体貌式"检测，拆不掉名字却拆不掉体貌。** IP 直连代理那个零告警场景就是最好的警示——静态特征真的会被拆干净，那时候兜底的只有行为检测。这就是实验四要回答的问题。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b527cb0ec78bd90a.png)

三种绕过叠在四道闸门上，命中和失效可以收成一张矩阵。IP 直连代理那一格是空的：闸门 1、2 一起没了。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a44466bd6f7901a3.png)

## 六、实验四：SSE 行为指纹——最后一道兜底

### 6.1 把"打字机"变成数字指纹

SSE 流式输出的物理形态非常独特：模型每生成几个 token 就推一段数据，表现为 **下行方向大量小包、包与包间隔均匀且毫秒级、会话持续数秒到数十秒**。对比文件下载：包大、突发、窗口式推进。两者在包长分布和时序统计上是两种形状。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5c2e998c9ea2a6a2.png)

我在分析机上写了一个流级统计脚本 `sse_detector.py` ，思路是先把 TCP 流按方向拆开，对每条流计算五个统计量：下行包长均值与方差、下行包间隔均值、会话时长、下行/上行字节比，然后用简单阈值（阈值来自实验一对照组的分布）做分类。这里刻意不用任何机器学习——一个场景明确的分类问题，先把统计特征的判别力摸清楚，比急着上模型更有价值，也更容易向审计方解释每一条告警的依据。

测试流量除了实验一对照采集的四类混合 pcap，我还补采了一段流式调用（DeepSeek 开 `stream=True` 、Ollama 用默认的流式模式，各跑一次长回答）——因为实验一里的 LLM 调用是非流式的，这一点后来被证明非常关键。

实测结果，六条有下行业务的流全部判对：

|     |     |     |     |     |     |
| --- | --- | --- | --- | --- | --- |     
| 流量  | 下行包数 | 包长均值±std | 间隔  | 时长  | 判别  |
| DeepSeek **流式** （补采） | 231 | 430±437 | 15ms | 3.3s | **LLM-SSE流式** |
| Ollama **流式** （补采） | 401 | 139±14 | 26ms | 10.6s | **LLM-SSE流式** |
| 3MB 文件下载 | 2170 | 1387±243 | 1ms | 1.7s | 文件下载 |
| DeepSeek 非流式（实验一） | 8   | 820±529 | 163ms | 1.1s | 普通  |
| 百度访问 | 8   | 1023±599 | 36ms | 0.3s | 普通  |
| Ollama 非流式（实验一） | 1   | 565 | —   | 0s  | 普通  |

三条结论。第一，两条流式 LLM 的形态在表格里肉眼可辨： **一两百字节的小包、十几到几十毫秒的稳定间隔、持续数秒**，与文件下载的"1387 字节满包、1ms 间隔狂灌 1.7 秒"是两种完全不同的动物，阈值法完全够用。第二，也是这次实验最有意思的发现： **实验一那条 DeepSeek 调用（非流式）在行为层完全隐身**——8 个包、1 秒钟结束，统计上与普通 HTTPS 浏览无法区分。也就是说 SSE 行为检测抓的不是"用了 LLM"，而是"用了 LLM 的流式输出"；企业里如果终端客户端默认关了流式，这层兜底会跟着失效。行为检测的覆盖面，取决于攻击者"想不想打字机式地看输出"。第三，Ollama 的流式间隔（26ms）比 DeepSeek（15ms）更疏、包更小，不同后端的"雨滴节奏"不同——这意味着阈值要按基线校准，也暗示行为特征甚至能粗分后端类型。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ea95f2b4ee41a043.png)

### 6.2 行为检测的天花板

丑话说在前面：行为检测有两个天然短板。一是 **归因弱**——它只能告诉你"这条流长得像 LLM 流式输出"，但加密之下说不出是 DeepSeek 还是别的什么服务，定位到人还要靠旁证（终端、时段、频率）；二是 **阈值漂移**——不同模型、不同输出长度、不同网络抖动都会移动分布，阈值要靠持续运营校准。所以行为特征的正确定位是纵深体系的兜底层，而不是主力层。

## 七、四层防御按什么顺序建

实验做完了，回到防御视角。企业里比较稳的排法是四层，按建设成本从低到高：

1.  **资产盘点层（零成本，先做）**：把主流 LLM API 的域名清单（DeepSeek、OpenAI、Anthropic 等）落进 DNS 与 SNI 监控清单。这一层不拦任何东西，只回答"我的网里有没有人在用"，是后面所有决策的数据基础。
2.  **静态规则层（低成本）**：本文实验二那四道闸门，检出准、误报低，能覆盖绝大多数"不设防"的使用者。
3.  **出口收敛层（中成本，治理重点）**：这是治本的一层——与其在流量里大海捞针，不如给企业建统一的 LLM 网关（代理 + 审计 + 敏感词过滤），防火墙层面只放行网关访问 LLM API。收敛之后，"直连 LLM API"这个行为本身就变成高价值告警，实验二那套规则从"大海捞针"变成"瓮中捉鳖"。
4.  **行为兜底层（持续运营）**：实验四的 SSE 统计检测，专抓走中转、换域名的残余流量，同时为第 3 层的收敛效果提供验证（收敛后行为层告警应当趋零，不趋零说明有漏网出口）。

四层不是并列的菜单，而是有先后的建设路径：没做盘点就上行为检测会淹死在误报里，没做收敛就谈运营是缘木求鱼。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c843902325513d9a.png)

## 八、总结

这篇文章从一个很实际的问题出发：HTTPS 加密之下，网络侧还能不能发现「谁在调用大模型」。四个实验把它拆开回答了一遍。机制层面，LLM API 调用在 DNS、SNI、TLS 指纹、SSE 行为四个层面各留痕迹，各有各的失效条件；攻防层面，DoH、前置代理这些绕过手段干掉的只是静态点名，SSE 的物理形态是最后拆不掉的指纹；工程层面，四层防御的正确打开方式是先盘点、再规则、再收敛、最后行为兜底。

对我来说，这次实验最大的收获不是那几条规则本身，而是验证了一个做检测的朴素道理： **任何单一特征都有绕过手段，检测体系的强度来自层与层之间的互补，而不是某一层的精度。** 静态特征负责"准"，行为特征负责"全"，中间靠出口收敛把攻击者的选择空间压到最小——这个思路不只适用于 LLM API，放进任何"加密流量里找特定应用"的场景都成立。

* * *

## 参考文献

\[1\] OWASP，Top 10 for LLM Applications 2025， `https://genai.owasp.org/`

\[2\] Salesforce，JA3 – TLS Client Fingerprinting， `https://github.com/salesforce/ja3`

\[3\] FoxIO，JA4+ Network Fingerprint Suite， `https://github.com/FoxIO-LLC/ja4`

\[4\] OASIS，Suricata User Guide – TLS Keywords / JA3 Support， `https://docs.suricata.io/`

\[5\] IETF，RFC 8484 – DNS Queries over HTTPS (DoH)， `https://datatracker.ietf.org/doc/rfc8484/`

\[6\] IETF，draft-ietf-tls-ech – Encrypted Client Hello， `https://datatracker.ietf.org/doc/draft-ietf-tls-ech/`

\[7\] Wireshark Foundation，TShark Manual – TLS JA3 Fields， `https://www.wireshark.org/docs/`
