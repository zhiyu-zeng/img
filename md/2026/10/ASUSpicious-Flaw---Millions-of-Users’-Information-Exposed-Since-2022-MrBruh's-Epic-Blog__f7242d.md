---
title: ASUSpicious Flaw - Millions of Users’ Information Exposed Since 2022 | MrBruh's Epic Blog
source: https://mrbruh.com/asus_p2/
source_host: mrbruh.com
clip_date: 2026-10-01T10:33:54+08:00
trace_id: 344d65cd-ac79-4a2f-bcc4-df16151c462b
content_hash: 488a176f35469b3920782f6003c200bb971f1b9764afda0ccf7ea986b510887e
status: synced
tags:
  - 漏洞分析
  - .NET逆向
series: null
feed_source: mrbruh·漏洞研究
ai_summary: MyAsus 客户端（C# 编写）的 AsusSSO.dll 与 AsusAPI.dll 中硬编码的加密凭据被解密后具备管理员级无限制权限，可读取任意 ASUS 账户的个人信息与工单内容，该漏洞自 2022 年 8 月起存在。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3ec75244-d011-8142-8bf9-f909a1f06176
ioc:
  cves:
    - CVE-2025-4569
    - CVE-2025-4570
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> MyAsus 客户端（C# 编写）的 AsusSSO.dll 与 AsusAPI.dll 中硬编码的加密凭据被解密后具备管理员级无限制权限，可读取任意 ASUS 账户的个人信息与工单内容，该漏洞自 2022 年 8 月起存在。
> 
> - **凭据发现：** 作者用 `file` 命令筛出 .NET 可执行文件，在 ILSpy 反编译的 AsusSSO.dll / AsusAPI.dll 中找到运行时解密的硬编码值，并借 ChatGPT 将解密函数移植为 Python 独立解密，确认其为 API 授权凭据与令牌。
> - **可滥用接口：** `GetCaseListByEmail` 按邮箱列工单，`GetCaseDetailByTopMail` 取工单全部对话，`UploadFile`/`CreateCase` 可向任意工单上传附件、创建无服务端校验的工单；`Openid/Login` 用邮箱换内部用户 ID，`Member/GetUserData` 再据此返回姓名、生日、电话、完整地址。
> - **影响范围：** 漏洞存在于 MyAsus 首发（2022 年 8 月）至今，波及数百万账户，含为 ROG 论坛等产品注册的 ASUS 账号，作者认为其简单性可能已被实际利用。
> - **修复时间线：** 2025-04-20 发现，04-23 提交报告，05-12 在 MyAsus 4.2.35.0 修复，07-21 公布 CVE-2025-4569（7.7）与 CVE-2025-4570（6.9）。
> - **厂商响应：** 华硕无漏洞赏金，还要求作者免费测试补丁并"审阅"博客，作者拒绝后未再回复。

Please note that it’s not particularly suspicious, it just made for a good play-on-words title.

## Introduction

*What do most people do when they’re mistreated by a multi-billion dollar company after reporting a zero-day RCE to them? Certainly not find another zero-day exploit, but that’s exactly what I ended up doing. Read part one of [this series on ASUS here](https://mrbruh.com/asusdriverhub/).*

I had recently spent a lot of hours trawling through decompiled C/C++ code in part one so I wanted something a little easier to read. This meant looking for executables made using C# since its decompilation creates a near perfect replica of the original code including file, function and variable names.

![ilspy.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e51edacbd2d0b36d.png)

After running a bash script to search for.net executables using the `file` command, I made a shortlist of about 10 files that piqued my interest. After examining the source code of them I found two that looked interesting, AsusSSO.dll and AsusAPI.dll used in their MyAsus software.

![file\_command.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7b3380bbd81b10eb.png)

## Finding hard-coded credentials

When examining these I noticed they both contained encrypted hard coded values that were decrypted on the fly, and after isolating the decryption functions I asked ChatGPT to port it to Python so I could decrypt values independently of the DLL which ChatGPT managed to successfully replicate on its second attempt.

AsusAPI.dll encryption algorithm: ![AsusAPI.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/75aece62d044e770.png) AsusSSO.dll encryption algorithm: ![AsusSSO.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8b7b58eaee1d3652.png)

After decrypting some of these values and reading over some of the functions using them I came to the conclusion that these were authorisation credentials and tokens for use with their API.

![GetUserInfo.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/26b4e0c7c708af4c.png)

My main concern was that these encrypted credentials may have unnecessarily permissive scopes that could facilitate malicious use if put in the wrong hands. This turned out to be true as **the hard coded credentials had administrator level / unrestricted permissions that could be abused to access the information of any ASUS account.**

## The Exploitable Endpoints

Here is a list of the different endpoints I found and what could be done with them if you had the hard coded credentials.

-   **/api/QuestionForm/GetCaseListByEmail**

This could list the ticket ID, Name and Date of any support issues filed by email

-   **/api/QuestionForm/UploadFile**

This would let you upload a text or image attachment to any support ticket if you had the ticket ID.

-   **/api/QuestionForm/CreateCase**

This would let you create a new support ticket, which did not seem to do any server side validation on the content of it.

-   **/api/QuestionForm/GetCaseDetailByTopMail**

This retrieved the full details and conversation history of a support ticket via its ticket ID.

**PoC:**  Your browser does not support the video lmao

* * *

-   **/api/repair-rest/rma/item/list/detail/customer-view/v1** (unconfirmed)

This would presumably return a list of RMA tickets for a specified customer, I was unable to test this due to not having my own RMA ticket to check.

-   **/api/repair-rest/rma/item/repair/report/v1** (unconfirmed)

This would presumably return the full details of a RMA ticket similar to the support ticket API above.

* * *

-   **/api/v1/Openid/Login**

This would return the internal ID of any user if you sent the endpoint their email.

-   **/api/v1/Member/GetUserData**

This would return the full information of any user if you provided their user ID. This information includes peoples **Full Names, Date of Birth, Phone Numbers and Full Addresses.**

**PoC:**  Your browser does not support the video lmao

## Conclusion

After further research I concluded that this vulnerability has **existed since August 2022** when MyAsus first released and there is a chance that it was being actively exploited due to this vulnerabilities simplicity. This likely **affects millions of accounts** including those who made ASUS accounts for other products such as the ROG forums.

As seen above, the data that can be compromised includes peoples names, **phone numbers**, date of birth, **addresses**, the contents of any support tickets and potentially peoples RMA requests.

At this point I finished writing up the PoC’s and sent it off to ASUS with a detailed report on the matter.

### Reporting Timeline (DD/MM/YYYY)

-   20/04/2025 - Stumbled upon AsusSSO.dll and AsusAPI.dll and started investigating.
-   23/04/2025 - Finished my investigation, wrote up PoC and sent vulnerability disclosure to ASUS. Had to remove PoC code since the form would block it (see part one)
-   24/04/2025 - Sent them the Python PoC’s manually via email.
-   29/04/2025 - Had to resend the PoC’s hosted externally because their mail system had silently blocked the email.
-   12/05/2025 - Vulnerability patched. (MyAsus 4.2.35.0 - Security update: ASUS account log-in/sign-up change to Webview design)
-   11/06/2025 - ASUS acknowledges my plans to publish my writeup within the next two weeks.
-   20/06/2025 - Blog published.
-   21/07/2025 - [CVE-2025-4569](https://www.cve.org/CVERecord?id=CVE-2025-4569) (7.7) and [CVE-2025-4570](https://www.cve.org/CVERecord?id=CVE-2025-4570) (6.9) were published.

## Bug Bounty

As seen in part one of this blog, ASUS states that they do not offer bug bounties or even merch to security researchers.

I feel like I should point out that this behaviour is incredibly dangerous and may lead or has already lead to exploits not being reported or sold to threat actors due to there being next to no actual incentives for security researchers.

Almost everyone has their price, and for a lot of people 100-250k (Estimated black market price of the RCE in part 1) would make it hard to resist.

## Fun Notes

-   ASUS asked me to test their patched builds- for free with no offer of compensation. When I stated I could not test their software for free, especially given the lack of bug bounty and my lack of free time as a university student, they never replied (to that email). They did however ask to “review” this blog before I publish it.

## Contact Me

If you have any questions you can contact me on Signal (preferred) `@paul19.84` or via email `contact [at] mrbruh.com`. Emails are less likely to get a response unless you are a journalist.

## Donations

If you want to buy me a coffee I welcome donations to my Monero wallet: `86kC5fcDybnGSUdYgDfWXm83XRBTtqRrGN26Pofrxq9nNM7EAw237yzX1se7fF7kQeKMxrEEDb1gQbZWvR3Sht1J1dZAhYu`
