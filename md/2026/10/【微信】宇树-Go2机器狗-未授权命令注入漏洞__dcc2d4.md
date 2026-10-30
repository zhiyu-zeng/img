---
title: 【微信】宇树 Go2机器狗 未授权命令注入漏洞
source: https://mp.weixin.qq.com/s/Tc8_PJ8r9O0w69wuydF3tg
source_host: mp.weixin.qq.com
clip_date: 2026-10-30T08:14:09+08:00
trace_id: 8218f57b-0d29-4d56-8dae-cd298e5ba0ac
content_hash: 90be574a8d305d16c172643a337b5fc591d30196fc37e5676bf3b58a360ff19c
status: synced
tags:
  - 微信
  - 漏洞分析
  - 固件安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: |-
  - **根因链路：** gpt_thread.py 的 set_volume 将大模型 function_call 返回的 value 未做任何校验直接拼入 f-string 命令，shell_manger.py 再以 subprocess.run(shell=True) 执行，而 chat_go 以 root 运行——即机器狗把云端模型输出直接翻译成 shell 命令。
  - **配套漏洞：** websocket.py 的 WebSocketClient.connect 关闭了 TLS 证书校验（CVE-2026-115996），攻击者可借 DNS 劫持 + 自签名证书伪造 wss://gpt-proxy.unitree.com 上游并注入 function_call 帧，五分钟内在固件 1.1.7 设备上拿 root shell。
  - **评分分歧：** VulDB（CNA）给 9.6，研究者给 8.9（仅注入点）与 7.7（完整链），分歧集中在 AV:N/A:A、AC:L/H、UI:R/N 三个指标；NVD 状态仍为 Received。
  - **版本自查：** CVE 标注受影响 1.1.11.0–1.1.11.4、修复 1.1.11.5，但研究者实测 1.1.4 与 1.1.7 也受影响，直接查日志、进程、DNS、6080 证书及 /tmp 下 root 属主文件。
  - **处置重点：** 升级固件仅是治标，治本需在 6080 出口用 DNS 允许列表钉住 gpt-proxy.unitree.com、限制机器狗出口网段；厂商未发公开公告，披露从 7 月提交到 10 月编号历时约三个月。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40975244-d011-8117-93c7-fcb6cc81a86a
ioc:
  cves:
    - CVE-2026-115995
    - CVE-2026-115996
  cwes:
    - CWE-77
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> - **根因链路：** gpt_thread.py 的 set_volume 将大模型 function_call 返回的 value 未做任何校验直接拼入 f-string 命令，shell_manger.py 再以 subprocess.run(shell=True) 执行，而 chat_go 以 root 运行——即机器狗把云端模型输出直接翻译成 shell 命令。
> - **配套漏洞：** websocket.py 的 WebSocketClient.connect 关闭了 TLS 证书校验（CVE-2026-115996），攻击者可借 DNS 劫持 + 自签名证书伪造 wss://gpt-proxy.unitree.com 上游并注入 function_call 帧，五分钟内在固件 1.1.7 设备上拿 root shell。
> - **评分分歧：** VulDB（CNA）给 9.6，研究者给 8.9（仅注入点）与 7.7（完整链），分歧集中在 AV:N/A:A、AC:L/H、UI:R/N 三个指标；NVD 状态仍为 Received。
> - **版本自查：** CVE 标注受影响 1.1.11.0–1.1.11.4、修复 1.1.11.5，但研究者实测 1.1.4 与 1.1.7 也受影响，直接查日志、进程、DNS、6080 证书及 /tmp 下 root 属主文件。
> - **处置重点：** 升级固件仅是治标，治本需在 6080 出口用 DNS 允许列表钉住 gpt-proxy.unitree.com、限制机器狗出口网段；厂商未发公开公告，披露从 7 月提交到 10 月编号历时约三个月。

**网络安全透视镜** *2026年10月27日 14:30*

本文看点

01

漏洞成因：一行 f-string 如何变成 root shell

02

评分之谜：9.6、8.9、7.7 三套分数的分歧

03

五步自查：从版本到日志到证书

01

OVERVIEW

### 漏洞速览

| 项目  | 内容  |
| --- | --- |
| 漏洞编号 | CVE-2026-115995 |
| 影响产品 | Unitree Go2 机器狗（chat_go 语音对话组件） |
| 漏洞位置 | gpt_thread.py → set_volume（第 331-332、211-213 行） |
| 漏洞类型 | OS 命令注入（CWE-78 / CWE-77） |
| 厂商评分 | CVSS v3.1 9.6 Critical（CNA 为 VulDB） |
| 攻击前提 | 网络可达、无需认证，但需一次语音或 App 交互（UI:R） |
| 执行身份 | chat_go 以 root 身份运行 |
| 修复版本 | 1.1.11.5（CVE 记录标注） |
| 公开 PoC | 无独立公开 PoC，但披露材料已含完整复现要素 |
| 在野利用 | 未确认，未列入 CISA KEV |
|     |     |
|     |     |

02

ROOT CAUSE

### 漏洞成因

根因是：音量参数没有做任何过滤就拼进了系统命令。但完整的链路比「没做校验」要长得多

漏洞代码

...python

\# gpt_thread.py 第 331-332、211-213 行

elif　response\['state'\]　==　'function_call':

　　　　text　=　self.\_call_function(response,　msg\['tts_id'\])

...

elif　req\['function'\]　==　'set_volume':

　　　　cmd　=　f"amixer　set　Speaker　{req\['value'\]}"

　　　　perform_cmd(cmd)

\# shell_manger.py 第 8 行

result　=　subprocess.run(cmd,　shell=True,　stdout=subprocess.PIPE)

后端校验什么都没有：没有转成整数、没有范围校验、没有字符白名单、没有 shell 转义。而最后那行 shell=True 让分号、管道、命令替换重新拿回了 shell 语义 —— 一个本该表示音量的数字，从此可以是一串命令。

但真正值得注意的是这个 value 从哪来。它不是某个 HTTP 接口的请求参数，而是云端大模型返回的 function_call 帧里的一个字段。chat_go 连的上游是 wss://gpt-proxy.unitree.com:6080/ws/chat。换句话说，这台机器狗把「远端模型让它干什么」直接翻译成了 shell 命令。

披露者在提交材料里写了一句我觉得可以直接抄进认知模型的话：schema 只是对一个概率性文本生成器的建议，不是强制机制。你没法靠声明 value 是数字来约束它。

03

AFFECTED VERSIONS

### 影响范围

| 版本  | 状态  |
| --- | --- |
| 1.1.11.0 — 1.1.11.4 | 受影响（CVE 记录标注） |
| 1.1.11.5 | 修复版本（CVE 记录标注） |
| 1.1.4 / 1.1.7 | 研究者实测受影响（提交材料） |
| 1.1.0 — 1.1.15.1 | 配套证书漏洞 CVE-2026-115996 的覆盖范围 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2fa86f3f4712dd76.png)

— 两个 CVE 的版本覆盖曲线：修好注入不等于修好链路

CVE 记录把受影响版本列为 1.1.11.0 到 1.1.11.4，但披露者的提交材料里写着：受影响的代码在 1.1.4、实测的 1.1.7 设备，以及「最新可独立验证的固件包」中通过文件哈希确认完全一致、未被修复。

💡 如果你的设备版本号比 1.1.11.5 更低（比如 1.1.7 或 1.1.4），不要因为 CVE 列表里没写就松口气 —— 研究者是在这些版本上实测成功的。

04

SCORING

### 评分之谜

9.6 这个数字来自 VulDB，也就是 CVE 记录里的 CNA（编号分配方）。NVD 上这条记录的状态还是 Received，尚未给出自己的评估。所以 9.6 是一家 CNA 的判断，不是整个社区的共识。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ac690fc9fcdd905a.png)

— CNA 口径与研究者口径的三套评分对照

研究者对自己提交的这条漏洞给了两套分数：完整端到端链 7.7（向量 AV:A/AC:H/PR:N/UI:N），以及假定已能控制模型响应、只评估注入点本身的 8.9（向量 AV:A/AC:L/PR:N/UI:N）。

分歧其实集中在三个指标上：

1

AV:N 对 AV:A —— 攻击者到底能不能从网络上够到这个服务，还是必须已经身处机器人可达的网络里；

2

AC:L 对 AC:H —— 完整链条还要叠加控制 DNS 与伪造证书，不能算作轻量；

3

UI:R 对 UI:N —— CNA 认为需要用户正常说一句指令；研究者认为日常使用即触发，不构成额外屏障。

「分数争的是口径，口径决定的是名单 —— 你的资产到底在不在那张名单上。」

05

ATTACK CHAIN

### 危害推演

目前没有独立发布的公开 PoC，但披露材料本身已经包含了足以复现的全部要素：漏洞代码、载荷、设备日志和端到端攻击链。下面这条链是研究者在自己名下的 Go2 EDU（固件 1.1.7）上跑通的，全过程约五分钟。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bf03c2caeb19e64f.png)

— CVE-2026-115995 完整攻击链：从 DNS 劫持到 root shell

五个步骤

1

控制 DNS 解析，把硬编码的上游 gpt-proxy.unitree.com 指向自己的主机；

2

在 6080 端口起一个测试用的 WebSocket 上游，递上自签名证书，并在 3 秒首帧窗口内应答；

3

chat_go 接受这个自签名证书 —— 因为 websocket.py 里的 WebSocketClient.connect 关闭了 TLS 证书校验（这就是第六节要讲的 CVE-2026-115996）；

4

上游回一个伪造的 function_call 帧，value 字段填入 50; touch /tmp/fc_pwned; id; uname -a；

5

用户说一句话或在 App 里发一条消息触发这一轮对话，set_volume 拼接后经 shell=True 以 root 身份执行。

06

DETECTION

### 检测与排查

STEP 01查版本

登录机器狗确认固件版本是否 ≤ 1.1.11.4。版本号低于 1.1.11.0 的老固件同样要重点查（研究者在 1.1.4 与 1.1.7 上实测成功）。

STEP 02查日志

在设备日志里搜 amixer set Speaker，看它后面跟的是不是纯数字。正常形态是 amixer set Speaker 50，后面多出任何字符就是被利用了。

STEP 03查进程

查 chat_go 派生的异常子进程 —— 一个调音量的处理函数派生 shell、id、uname、curl、wget，本身就不正常。

STEP 04查网络

翻 DNS 日志，看 gpt-proxy.unitree.com 的解析结果是否指向预期地址。再检查 6080 端口上呈现的证书 —— 自签名证书就是冒充动作的特征。

STEP 05查文件

检查 /tmp 等可写路径下是否存在 root 属主的异常文件，参考样本是 /tmp/fc_pwned。

可直接落地的命令

...bash

\# 日志里搜 amixer set Speaker 后接非数字的记录

grep　-E　'amixer　set　Speaker\[\[:space:\]\]+\[^0-9\[:space:\]\]'　/path/to/device.log

\# 查 chat_go 派生的异常进程

ps　-ef　|　grep　chat_go　|　grep　-E　'shell|id|uname|curl|wget'

\# 查上游解析是否被劫持

dig　+short　gpt-proxy.unitree.com

\# 查 6080 端口上的证书是不是自签名

openssl　s_client　-connect　$ROBOT_IP:6080　\\

　　|　openssl　x509　-noout　-issuer　-subject

！踩坑提示 🕳

「日志里搜不到就说明安全」是个坑 —— 如果 chat_go 组件日志没开，或者日志轮转已经把那段冲掉了，搜不到不代表没被打过。更可靠的证据在进程侧、DNS 侧和证书侧。

07

REMEDIATION

### 修复建议

1

立即升级固件到 1.1.11.5。这是根治命令注入的唯一手段。升级包按机型选，官方包名里的 GO2_Edu_Max_Pro_X 覆盖 Edu / Max / Pro / X 变体。

2

把 CVE-2026-115996 作为独立条目继续跟踪。截止发稿没有公开的厂商修复，别因为升到 1.1.11.5 就在台账上销号。

3

收敛网络暴露面。6080 端口是模型 function_call 的传输通道，绝不能暴露到机器人管理网之外；用 DNS 允许列表把 gpt-proxy.unitree.com 钉到预期地址集合。

4

收敛出口。机器狗只允许访问控制器、管理端点和更新端点，这一条同时收窄了攻击路径和数据外带路径。

5

回溯已部署设备。翻一遍受影响设备所在网段的异常外联记录，重点找有没有指向自签名证书上游的连接。

升级固件是治标的最后一环， **把「谁能控制这台机器的指令」这个问题在网络层挡住**，才是治本。出口收敛比入口过滤更可靠 —— 因为你无法枚举模型会返回什么。

∞

THE END

### 结语

这条 CVE 从披露到发号走了三个月。7 月 18 日提交给厂商安全响应中心拿到工单 #474，7 月 21 日厂商回复说已有另一位研究者报过，9 月 3 日研究者补交了设备实测证据并询问 CVE 状态与修复版本，9 月 8 日那封含六个问题的跟进邮件一直没有得到实质性回复，10 月 24 日才由 VulDB 编成 CVE-2026-115995。

到发稿为止，厂商没有发布公开的安全公告 —— CVE 记录的参考链接里只有工单号和一个.upk 固件包下载地址。这意味着防守方大概率得靠自己盯漏洞库，才知道该升到哪个版本号。

同一时期还有一条信息值得留个心眼：经 ThreatAft 的信源汇总提到，Black Hat USA 2026 上有团队演示了通过摄像头与麦克风输入操控 Go2 行为。这个没有一手材料，仅作线索。

END

我是 网络安全透视镜，专注 Java 后端安全审计与渗透测试，写点源码里才看得见的东西。

如果你觉得今天这篇有收获，欢迎 **点赞、在看、转发** 三连，我们下篇见。
