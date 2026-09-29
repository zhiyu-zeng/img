---
title: 【微信】Black Hat USA 2026：AI画像反向狩猎诈骗
source: https://mp.weixin.qq.com/s/IW9U27ID6G_PSmYyi0duTw
source_host: mp.weixin.qq.com
clip_date: 2026-09-29T17:10:53+08:00
trace_id: dcf7d119-71fe-4698-b3de-f867f656bd44
content_hash: 7b4b5b4c7f02b70cccc91e5b3d579540767678c3306a3a0d674cc43d6b76a110
status: synced
tags:
  - 微信
  - 风控对抗
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**TL;DR：** ScamBuster 用 AI 虚构人设接替真人受害者与骗子周旋，在对方以为即将收款时套出银行账户、钱包、电话等资金链指标，再聚类成可调查情报。"
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3ea75244-d011-8191-8739-f0bdf4b892f5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** ScamBuster 用 AI 虚构人设接替真人受害者与骗子周旋，在对方以为即将收款时套出银行账户、钱包、电话等资金链指标，再聚类成可调查情报。
> 
> - **核心思路：** 不再止步于"识别—隔离—删除"邮件，而是持续交互采集第一方诈骗指标（银行账户、IBAN/BIC、加密钱包、电话号码、Telegram/WhatsApp 账号、收款主体）。
> - **六个 Agent 分工：** Classifier 判定诈骗类型、Generator 按 persona 写回复、Extractor 抽指标、Validator 决定能否发送、Injection Detector 记录劫持尝试、Orchestrator 管循环；分类器用固定标签，不匹配返回 unknown。会话按有限状态机运行：最多 12 轮、72 小时、1.50 美元成本、3 次重试，拿到已验证金融指标即停。
> - **外发门必须确定性：** 固定规则先查收件人数量与域名、长度、密钥类话术、虚假付款声明、外链，再由第二模型评分，默认失败关闭；生成模型不持有邮箱、文件系统或 CTI 写入权限，kill switch 独立于模型与队列。提示注入只做取证、不承担阻断。
> - **情报必须带证据：** 每个指标保存归一化值、来源消息、原文片段 Hash、抽取器版本与置信度，输出 STIX 2.1/MISP；价值在跨会话聚类——同一账户或电话把孤立邮件连成同一套套现通道，但不足以证明同一主体。
> - **生产数据与边界：** 28 个 persona 运行 9 个月，回复率 54%、每会话平均 5 个唯一 IOC、草稿通过率 95%、自动分类 82%，最佳 persona 产出约为最差者的 5 倍；当时仅处理邮件，附件只保存不读取，尚不接收入站情报。

**白帽子罗棋琛** *2026年9月29日 16:30*

## 用 AI 受害者画像反向狩猎诈骗团伙

> Black Hat USA 2026 议题笔记：ScamBuster — Social Engineering Scammers at Scale

多数反诈骗系统在邮件进入收件箱前完成使命：识别、隔离、删除。对收件人而言这是正确动作，但对情报团队而言，故事往往停在了最有价值的地方——骗子使用哪个收款账户、电话号码、即时通信账号和套现通道，只有继续对话后才会出现。

Laurent Giovannoni 的公开课件介绍了 ScamBuster：系统不让真人受害者继续冒险，而是用 AI persona 扮演诈骗者期待的目标，让对方主动交出基础设施和金融指标。它把邮件线程转为 STIX 2.1 或 MISP 情报，再利用重复出现的账户、电话和域名聚类不同诈骗会话。

![ScamBuster 课件封面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9aaee09a2a7bd96e.jpg)

*图 1：ScamBuster 的目标不是生成更像人的邮件，而是从持续交互中获取可调查的诈骗基础设施*

这类系统的工程难点不是“让大模型回一封信”。真正困难的是安全边界：只接收已判定的诈骗邮件，绝不触达无关第三方；输出必须经过确定性过滤；模型受到提示注入时不能泄露内部信息或执行外部动作；每段情报必须保留原始证据与置信度。

## 1、从删除邮件转向收集资金链指标

传统 phishing feed 擅长域名、URL、IP 和附件 Hash。针对 BEC、假发票、投资骗局、爱情骗局等社会工程攻击，决定执法和止付效果的往往是另一组指标：银行账户、IBAN/BIC、钱包地址、电话号码、Telegram/WhatsApp 账号、付款方式和收款主体。

这些数据不会完整出现在第一封诱饵邮件里。骗子通常先确认“受害者”相信剧情，再提供转账信息。ScamBuster 的思路是反转心理学：维持可信 persona，根据骗术阶段提出合理问题，让诈骗者在以为即将收款时暴露关键指标。

课件引用的背景数字包括诈骗损失达到十亿美元级别，并强调“这不是安全产品没拦住邮件，而是后续情报没人采集”。具体损失统计会随口径和年份变化，本文不把课件中的单一数字扩展为普遍结论。

一个合格的项目目标不应写成“浪费骗子时间”，而应定义为可验证的情报产出：

yaml

```
mission:objective:collect_first_party_fraud_indicatorsallowed_inputs:-analyst_confirmed_scam_mailbox-organization_owned_honeypot_addressprioritized_outputs:-bank_account-iban-bic-crypto_wallet-phone_number-messaging_handle-attacker_domainprohibited_outcomes:-send_money-open_or_execute_attachments-contact_unrelated_third_parties-impersonate_real_employee_or_customer-make_threats_or_illegal_promises
```

## 2、Persona 不是文案模板，而是实验变量

同一种诈骗面对不同 persona，情报产出差异很大。一个过于谨慎的财务人员会让骗子提前结束对话；一个完全不提问题的“受害者”可能看似顺从，却拿不到第二收款账户、手机号或付款路径。

![Persona 选择会放大情报产出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b33718d8c7f9dade.jpg)

*图 2：课件报告同一诈骗中，最佳与最差 persona 的情报产出可相差约 5 倍*

Persona brief 至少应包含身份背景、语言能力、技术熟悉度、沟通习惯、可接受的犹豫方式，以及绝不能声称的事实。这里尤其要避免使用真实员工、客户或社会弱势群体的可识别信息。

json

```json
{"persona_id":"retail-customer-formal-v3","fictional":true,"locale":"en-GB","traits":{"financial_literacy":"medium","technical_literacy":"low","tone":"formal","response_latency_minutes":[20,180]},"conversation_goal":"obtain_payment_destination_and_callback_channel","allowed_claims":["needs_bank_transfer instructions","requires invoice reference","asks for beneficiary confirmation"],"forbidden_claims":["real employer relationship","actual funds sent","law enforcement identity","access to victim personal data"]}
```

Persona 的好坏不应以邮件长度、语言自然度或骗子回复次数衡量，而应以经过验证的唯一指标、金融指标权重、会话成本和安全违规数共同评分。

## 3、六个 Agent 各做一件事

课件明确反对让一个“万能 Agent”从收信一直做到发信。ScamBuster 把流程拆成六个角色：Classifier 判定诈骗类型；Generator 以 persona 写回复；Extractor 抽取指标；Validator 决定草稿能否发送；Injection Detector 标记模型劫持尝试；Orchestrator 管理整个循环。

![六个 Agent 的职责划分](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8686e10cb6d911e2.jpg)

*图 3：分类、生成、抽取、安全判断和流程控制被拆开，降低一个提示词同时承担所有责任的风险*

![单封邮件的完整处理流水线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f79611c4f3688d96.jpg)

*图 4：主回复链与取证链分离；Bandit 选择 persona，Extractor 把证据输出到 STIX/MISP*

这一结构的工程价值是可以分别测试：分类器要看混淆矩阵；生成器要看角色一致性与情报推进；抽取器要看 precision/recall；验证器要追求 fail-closed；编排器要保证幂等、预算和熔断。

python

```python
from dataclasses import dataclass from enum import Enum  classScamType(str, Enum):     CEO_FRAUD = "ceo_fraud"     INVOICE = "invoice_fraud"     ROMANCE = "romance"     JOB = "job_offer"     UNKNOWN = "unknown"@dataclass(frozen=True)classClassifiedMail:     message_id: str     scam_type: ScamType     confidence: float     risk_score: intdefroute(mail: ClassifiedMail) -> str:     if mail.confidence < 0.85or mail.scam_type is ScamType.UNKNOWN:         return"human_review"if mail.risk_score < 70:         return"observe_only"return"controlled_engagement"
```

课件中的 Classifier 使用固定标签集合；无法匹配时返回 unknown，而不是让模型创造新标签。这能避免后续策略因自由文本类别而失控。

## 4、生成回复之前，先定义会话目标和停止条件

Generator 接收完整邮件线程、诈骗类型和 persona brief。它必须记住对方已经透露的内容，避免反复问同一个问题；不同诈骗类型还需要不同的情报目标，例如 CEO 欺诈优先收集收款账户。

![Generator 以 persona 回复并跟踪会话信息](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/56d1eb6a17fd3e2a.jpg)

*图 5：回复不是开放式闲聊，而是围绕该诈骗类型的具体情报目标推进*

编排器必须把无限对话改成有限状态机。每条会话应有最大轮次、最大 Token、最大持续时间、失败重试上限和明确终止原因：

yaml

```
engagement_policy:max_turns:12max_duration_hours:72max_model_cost_usd:1.50max_generation_retries:3stop_when:-verified_financial_indicator_collected-scammer_requests_real_payment-conversation_moves_to_voice_or_video-threat_or_extortion_detected-third_party_contact_requested-validator_fails_three_timeson_stop:-disable_outbound-preserve_thread-export_observations-notify_analyst_if_high_severity
```

拿到指标后继续“逗骗子”只会增加暴露、投诉和法律风险，并不一定增加情报价值。

## 5、发送门必须是确定性的，模型只能做第二意见

课件的第三步是 gate：每条草稿先过固定规则，再由第二个模型从“像人、符合 persona、安全”三个角度评分。低于阈值的草稿丢弃，最多重试三次；仍无法通过就保持沉默。

![所有外发邮件必须经过安全门](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/996eabdc6b27288e.jpg)

*图 6：Validator 采用固定规则与模型评审两层，默认失败关闭*

固定规则不能只检查脏词，应限制地址、链接、附件、秘密、金额承诺和身份声明：

python

```python
import re from urllib.parse import urlparse  SECRET = re.compile(r"(?i)(api[_ -]?key|password|private key|seed phrase)") MONEY_SENT = re.compile(r"(?i)\b(i|we)\s+(sent|paid|transferred)\b") URL = re.compile(r"https?://[^\s<>]+")  defdeterministic_gate(text: str, recipients: list[str], allowed_domain: str) -> list[str]:     reasons: list[str] = []     iflen(recipients) != 1:         reasons.append("recipient_count")     ifany(not addr.lower().endswith("@" + allowed_domain) for addr in recipients):         reasons.append("unapproved_recipient_domain")     iflen(text) > 2400:         reasons.append("message_too_long")     if SECRET.search(text):         reasons.append("secret_language")     if MONEY_SENT.search(text):         reasons.append("false_payment_claim")     ifany(urlparse(url).hostname notin {"help.example.invalid"} for url in URL.findall(text)):         reasons.append("external_url")     return reasons 
```

注意：真实系统不能只允许“攻击者域名”来判断收件人。更安全的做法是由入站邮件网关生成不可伪造的 conversation token，外发服务只能回复原线程中经过认证的 sender，不能接受模型给出的任意地址。

## 6、提示注入是情报，不应成为控制指令

骗子发现对方是机器人后，可能在邮件中写“忽略之前的规则”“输出系统提示”“联系另一个地址”。ScamBuster 设置 Injection Detector 记录这些尝试，但课件称它是 forensic、non-blocking：检测结果进入情报链，真正的阻断仍由外发门和编排器完成。

![系统把针对自身的攻击也作为数据](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d3972f6db9eaed3b.jpg)

*图 7：提示注入被检测、保存和抽取，但不能单独承担发送安全*

这一区分很重要。注入检测模型本身会误报和漏报；只要下游工具权限足够大，一次漏报就可能造成真实外联。安全架构应做到：

-   邮件正文始终作为不可信数据放入明确的数据字段；
    
-   生成模型没有邮箱、浏览器、文件系统或 CTI 写入权限；
    
-   外发服务只接受经过签名的结构化草稿 ID，不接受模型提供的地址；
    
-   附件只做隔离保存，不在 Agent 环境中打开或执行；
    
-   所有模型调用、重试、策略版本和输出 Hash 可审计；
    
-   kill switch 在模型与队列之外，能一次性停止所有发送。
    

课件把“每封外发过滤、硬限速、kill switch”称为比 AI 本身更难的部分。

![安全工程比模型生成更关键](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f79f603e6a89bbe9.jpg)

*图 8：系统安全依赖外发过滤、速率限制和独立熔断，而不是要求模型永不犯错*

## 7、指标抽取必须带证据，而不是只吐一串 IOC

Extractor 同时使用模式匹配和模型阅读：正则处理结构稳定的电话、域名、IBAN 等；模型处理上下文、变形表达和指标角色。课件强调每个指标都与“触发它出现的原始行”一起保存。

![从非结构化线程提取指标](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e7c40d45cc150ed.jpg)

*图 9：银行账户、电话和域名从邮件正文进入结构化记录*

![指标保留其产生原因](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/01332674d16436a0.jpg)

*图 10：同一个值为何被认定为诈骗指标，可以回到对话中的直接请求或被动披露证据*

最低限度的数据模型应包含归一化值、原始值、类型、来源消息、原文片段 Hash、抽取器版本、置信度和验证状态：

json

```json
{"indicator_type":"iban","value_normalized":"GB82WEST12345698765432","value_display":"GB82 WEST **** 5432","source":{"conversation_id":"conv-0192","message_id":"msg-0007","direction":"inbound","evidence_sha256":"<sha256-of-canonical-evidence>","evidence_locator":"body:text:line-18"},"extraction":{"method":"regex+llm-context","extractor_version":"2026.08.1","confidence":0.97},"validation":{"syntax_valid":true,"external_confirmation":false,"analyst_status":"unreviewed"}}
```

“模型说这是诈骗账户”不能直接成为封禁依据。金融指标还可能属于被盗用的 mule account、误导性第三方账户或被攻击者故意投毒的合法账户。情报平台应把 observation、indicator、attribution 和 enforcement 分层。

## 8、STIX/MISP 的价值在关联，不在格式转换

ScamBuster 可将结果输出为 STIX 2.1、MISP 或普通 feed。课件演示了把金融账户、电话和域名装入 STIX Bundle，并声称可在较短时间送入 SOC。

![将诈骗指标导出到 STIX 2.1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e6b826090e687f0b.jpg)

*图 11：标准化输出让邮件会话可以进入现有 CTI 与 SOC 流程*

真正的价值是跨会话聚类。同一个银行账户或电话号码在不同 persona、不同邮箱和不同诈骗话术中重复出现，能把一堆孤立邮件连接成同一套 cash-out pipe。

![从指标列表转为调查关系图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/12960d764ebc4fb7.jpg)

*图 12：共享收款基础设施把多个会话连接为可调查的活动簇*

入库前应进行规范化和去重：IBAN 去空格并校验；电话转 E.164；域名转小写并处理 IDNA；钱包地址按链校验 checksum；账户展示时脱敏，原始值放在受控存储。

python

```python
import re  defnormalize_iban(raw: str) -> str:     value = re.sub(r"\s+", "", raw).upper()     ifnot re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", value):         raise ValueError("invalid IBAN shape")     rotated = value[4:] + value[:4]     numeric = "".join(str(ord(ch) - 55) if ch.isalpha() else ch for ch in rotated)     ifint(numeric) % 97 != 1:         raise ValueError("invalid IBAN checksum")     return value  defcluster_key(kind: str, normalized: str) -> str:     returnf"{kind}:{normalized}"
```

聚类证据应区分“同值复用”和“同一主体”。共享银行账户是强关联线索，但不足以单独证明多个邮箱由同一自然人控制。

## 9、生产指标值得看，但不能脱离样本与口径

课件报告系统使用 28 个 persona，连续运行 9 个月，诈骗者回复率 54%，每个会话平均获取 5 个唯一 IOC，覆盖 36 类指标；最佳 persona 的产出约为最差 persona 的 5 倍，回复草稿通过率 95%，自动分类率 82%。

![课件报告的生产运行指标](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a263306ad2edb000.jpg)

*图 13：这些数字说明系统能持续运行，但仍需结合样本量、诈骗类型分布和“唯一 IOC”定义解释*

作为工程评审，至少要补问：

-   54% 的分母是所有入站诈骗、进入 engagement 的会话，还是成功投递邮件；
    
-   5 个 IOC 是否包括同一邮件里的域名、邮箱、电话等低价值重复字段；
    
-   95% approval 是一次生成通过，还是三次重试后通过；
    
-   82% 自动分类的其余 18% 是否全部进入人工队列；
    
-   不同语言、地区、诈骗类型和邮件服务商是否存在偏差；
    
-   对第三方误伤、投诉、账号封禁和提示注入的发生率是多少。
    

课件也诚实列出当时能力边界：只处理邮件；附件只保存、不读取；对外分享情报，但尚不接收入站情报。

![系统当时未覆盖的能力](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c7c0044412319d5d.jpg)

*图 14：SMS、语音、聊天、附件分析和外部情报融合仍不在当前闭环内*

这些限制反而有利于控制风险。扩展到语音或聊天前，应重新评估录音同意、号码合规、平台条款、未成年人和跨境数据处理。

## 10、上线前先过法律、伦理与安全运营三道门

ScamBuster 已把产品界面做到会话、IOC Explorer、Cluster、Persona 和 Monitoring 分离，课件还展示了可回放的 Live Bait Theater 与威胁行为画像。

![会话与情报管理界面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9fbfa43fe04a73e1.jpg)

*图 15：运营台把诈骗类型、persona、风险、IOC 数量和会话状态放在同一视图中*

![跨会话的诈骗行为聚类](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a4dae29204f4b72.jpg)

*图 16：系统用共享基础设施、心理施压方式和活动时间构建行为视图*

技术能运行不等于组织可以直接运行。上线前应完成以下控制：

1.  由法务确认主动回复、身份虚构、数据保留、跨境传输及证据使用的合法边界。
    
2.  只使用组织控制的蜜罐收件箱，不自动接管真实员工的个人对话。
    
3.  采用 inbound-origin-bound reply，禁止系统主动搜索或联系新目标。
    
4.  不支付资金、不购买礼品卡、不访问账户、不入侵或扫描对方基础设施。
    
5.  不使用真实个人 persona，不制造可被误认为真实员工的身份材料。
    
6.  将外发服务与模型隔离；实行硬限速、预算、轮次上限和全局 kill switch。
    
7.  所有指标保留原始证据、提取版本、置信度与人工处置状态。
    
8.  将 IOC 作为调查线索，不自动触发账户冻结、公开归因或执法结论。
    
9.  为误判、合法发件人投诉、邮箱服务商封禁和模型失控准备响应流程。
    
10.  对系统自身做红队测试，覆盖提示注入、数据外泄、地址替换、线程劫持和队列重放。
     

课件最后用一句话概括方法：骗子的心理是漏洞，persona 是 exploit。对安全工程师而言，还应补上后半句：只有把外发权限、证据链和停止条件做成确定性控制，persona 才是情报传感器，而不是另一个不受控的社会工程机器人。

![课件对反向社会工程的总结](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/586e98822e519ea5.jpg)

*图 17：系统利用虚构员工身份与骗子互动，但真正可复用的成果是结构化、可验证的资金链情报*

* * *

**资料来源**

-   Black Hat 官方 Session 页面
    
-   ScamBuster 官方项目说明
    
-   Dark Reading：Turning the Tables on Email Scammers With ScamBuster
    

**原始会议材料（仓库内）**

-   演讲课件 PDF
    

开源资料与原始议题 PDF

本文对应的 Markdown 原稿、Black Hat 原始议题 PDF 与配图已整理到 GitHub，可按文章编号查找和下载。

https://github.com/cybermaxluo/black-hat-usa-2026-talks

也可以点击文末“阅读原文”进入仓库。欢迎 Star、提交 Issue 或参与勘误。

Black Hat · 目录
