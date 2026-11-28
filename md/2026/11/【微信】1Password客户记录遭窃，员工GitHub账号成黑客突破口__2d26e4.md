---
title: 【微信】1Password客户记录遭窃，员工GitHub账号成黑客突破口
source: https://mp.weixin.qq.com/s/WzKErtAG4VrGc47TiBa9-w
source_host: mp.weixin.qq.com
clip_date: 2026-11-28T09:24:28+08:00
trace_id: 3bedd812-d3e0-4c37-8b64-eb8bcb1f0b46
content_hash: c37da94caa681c03b01ce061aac6f3f9cd3ae2ef7316ae8fb48ba03f6a6d3395
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
notion_page_id: 42675244-d011-8117-853d-ce2a0dc9f2bf
ioc: null
---

**FreeBuf** *2026年11月26日 18:01*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/20f965c5289e4a34.png)

Part01

员工GitHub账号失陷

身份安全厂商1Password近日披露一起安全事件，攻击者通过一名员工的企业GitHub账号，复制了部分客户的账户记录。

公司于11月19日发现该事件，当时监测到账号异常迹象，随即对这一疑似失陷的GitHub账号展开调查。攻击者利用该账号向公司后端服务推送恶意代码，通过代码下载了客户相关管理数据。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9ab03fcdc9b0f956.png)

Part02

非敏感元数据遭复制

客户核心密码库未受影响

此次被复制的记录包含姓名、邮箱地址、账户与用户标识符、账户创建时间、最后登录时间、公钥、安全远程密码协议参数，以及其他非涉密账户元数据。除此之外，部分邮件链接附带的令牌也被获取，这类令牌用于账户邀请、配置与恢复流程。

公司在披露公告中表示：“攻击者始终无法访问，也从未接触到客户保险库中的内容。” 客户保险库、库内存储的条目以及保护保险库的密钥均未受影响。公司本身不存储账户密码和Secret Key，账户恢复密钥、1Password应用及浏览器扩展也未被访问。

除客户记录外，攻击者还复制了私有代码仓库中的源代码，同时获得了公司持续集成与持续交付（CI/CD）系统的访问权限，该系统存储着产品运行所需的基础设施相关密钥。源代码中不包含任何用户敏感信息。目前公司已轮换所有可能泄露的凭证，事件未对服务可用性、产品安全造成任何影响。

Part03

已升级验证码防护机制

提醒用户警惕钓鱼攻击

被获取的邮件链接令牌无法单独用于访问账户，要完成邀请流程或账户恢复，还需通过单点登录验证，或输入发送至用户注册邮箱的6位验证码。事件发生时，仅有少量用户存在待处理的配置邀请或恢复请求，这部分用户已收到直接通知。

作为预防措施，公司已将邮件验证码从6位数字升级为10位字母数字组合。目前内部未发现任何利用泄露令牌接管账户的迹象。其他响应措施包括封禁涉事GitHub账号、作废被盗令牌、收紧内部管控措施，同时聘请独立网络安全专家验证遏制与修复工作的有效性。

公司提醒：“1Password绝不会主动联系用户索要账户密码或Secret Key。” 客户无需对自身1Password账户做任何调整。用户需警惕钓鱼攻击，若收到并非本人发起的邀请、账户恢复相关的陌生邮件、短信或电话，务必提高防范意识。

公司服务覆盖超过20万家企业，但目前并未披露有多少客户的记录被复制，也未说明该员工的GitHub账号失陷的具体原因。若后续调查发现新信息，导致当前披露内容出现变动，公司将及时更新公告。

这并非1Password首次披露入侵事件。2023年10月，该公司曾通报攻击者利用Okta客户支持系统泄露的会话数据，访问了其Okta租户，那次事件中未发现用户数据被泄露。

此次事件披露距竞争对手、密码管理厂商LastPass公开同类事件已过去近四年。当时LastPass通报称，黑客利用此前开发环境失陷窃取的信息，复制了客户加密的密码库数据。

参考来源：

Attacker used 1Password employee’s GitHub account to copy customer records

https://siliconangle.com/2026/11/25/attacker-used-1password-employees-github-account-to-copy-customer-records/
