---
title: "Hacking India’s largest automaker: Tata Motors"
source: https://eaton-works.com/2025/10/28/tata-motors-hack/
source_host: eaton-works.com
clip_date: 2026-10-01T10:38:34+08:00
trace_id: df7d09a0-738e-4e6e-9f81-24548c180a38
content_hash: 8c8e768277327c19b6fc8da50f9fd5ebbd2d7d1dfb685329ec84d3a4635bbaca
status: synced
tags:
  - 漏洞分析
  - 云安全
series: null
feed_source: Eaton Works·漏洞研究
ai_summary: Tata Motors 公开网站上泄露 2 组 AWS 密钥与多处凭据，暴露 70TB+ 数据、可无密码登录 Tableau，密钥轮换耗时近 5 个月。
ai_summary_style: key-points
images_status:
  total: 23
  succeeded: 0
  failed_urls:
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b00cc688-abf7-41f4-1146-35be0d456200/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/08c980e5-9b14-4f02-e0a6-92a68f36b800/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/5b215880-1b94-44ec-4833-1e943c310f00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/de67f515-4344-475a-ff26-ac47a398d500/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/22ea75de-48bd-41bc-a669-4ede1ce6d500/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/96b73311-f7ac-414c-eda6-fb978dfab400/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/06b92b92-23bf-4e7e-df58-c9c46c9a0b00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/5afc2c31-1ad4-45d8-f7be-e0f7b02c3700/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/5491e2ef-41d8-45c0-3a22-57bad3794b00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/e6416109-fdbc-4c76-911b-b18e0a645b00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/6aabd02d-ee7f-4d1b-d1ea-c2191ef20f00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/9c90e5ce-be59-45ef-aa68-8fe54fa82700/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a50fb993-0625-49b0-e9f9-65a6ab371000/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f7bd5304-12dc-4843-f776-346502798200/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a511c0f1-60c5-4128-3f62-ac6ed4467b00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ca4ce1c3-0306-45a4-a494-5d03a912a200/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/04c2a112-2eac-4117-db05-cca2f774b600/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f75832f6-3394-4a33-04a8-0479bcecc000/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/e46a59e5-0839-4f8b-781b-ea63fcfd6f00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/bd0515ca-2268-4826-f356-bce1ded99f00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/16382547-6037-485e-c9d5-2c4ff6d85a00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a67ac2e5-a5e2-471a-d395-2f92c5dd7a00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8d0e5112-823d-4013-32e6-94147c9dae00/full
notion_page_id: 3ec75244-d011-81fe-846e-cb38954f12a9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Tata Motors 公开网站上泄露 2 组 AWS 密钥与多处凭据，暴露 70TB+ 数据、可无密码登录 Tableau，密钥轮换耗时近 5 个月。
> 
> - **E-Dukaan 明文密钥：** 电商站前台直接硬编码 AWS 密钥，可读取客户数据库备份、数十万张含 PAN 的发票、约 40GB 管理员订单报表；暴露如此多数据，密钥本身只用于下载一个 4KB 税率文件。
> - **FleetEdge 可解密密钥：** 访客态 API 响应返回加密的 AWS 密钥，前端解密函数下断点即可取出，属"客户端解密"式无效防护；可访问单个桶超 70TB（数据最早到 1996 年），并对部分网站有写权限，可篡改首页植入恶意内容。
> - **Tableau 后门：** E-Dukaan 源码注释残留用户名与密码，获取 "trusted token" 的 HTTP 接口只需用户名和站点名、不要密码；凭此可冒充任意用户登录，包括服务器管理员，暴露内部项目、财务报表与经销商看板。
> - **Azuga 密钥泄露：** 试驾网站 JS 中硬编码 Azuga 车队管理平台 token，直接发起 API 调用即确认有效，可影响试驾车队定位管理。
> - **披露时间线：** 2023-08-08 经 CERT-IN 上报，9-01 厂商称已修复，9-03 研究员核实仅 2/4 修复且密钥仍有效；反复催促至 2024-01-02 才完成密钥吊销。所有凭据均已轮换，测试未大量下载数据。

**Discussion links:** [Hacker News](https://news.ycombinator.com/item?id=45741569) | LinkedIn ([Post 1](https://www.linkedin.com/posts/lawrencesystems_indias-largest-automaker-forgot-to-lock-activity-7389326976324493312-BRxN), [Post 2](https://www.linkedin.com/posts/cybersecurity-news_cybersecuritynews-activity-7389183006634053632-xJYb))

**News coverage:**

-   [TechCrunch](https://techcrunch.com/2025/10/28/tata-motors-confirms-it-fixed-security-flaws-that-exposed-company-and-customer-data/) ([Front page screenshot – October 29, 2025](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/fc72423f-2d66-4ee7-dd0a-172ff4161d00/full))
-   [Cyber Security News](https://cybersecuritynews.com/tata-motors-data-leak/)
-   [GBHackers](https://gbhackers.com/massive-tata-motors-data-leak/)
-   [The Indian Express](https://www.financialexpress.com/life/technology-tata-motors-confirms-fixing-cyber-security-flaws-that-left-70tb-of-customer-data-at-risk-4024897/)

## Key Points / Summary

-   2 exposed AWS keys on public-facing websites revealed 70+ TB of sensitive information and infrastructure across hundreds of buckets.
-   Pointless AWS key encryption easily defeated.
-   Tableau backdoor made it possible to log in as anyone without a password, including the server admin. This exposed countless internal projects, financial reports, and dealer dashboards.
-   Exposed Azuga API key compromised test drive fleet management system.

If you are in the US and ask your friends and family if they have heard of “Tata Motors”, they would likely say no. However, if you go overseas, Tata Motors and the Tata Group in general are a massive, well-known conglomerate. Back in 2023, I took my hacking adventures overseas and found many vulnerabilities with Tata Motors. This post covers 4 of the most impactful findings I discovered that I am finally ready to share today. Let’s dive in!

**Note that all secrets/credentials shown have been rotated**, meaning they are no longer valid and cannot be used anymore. Additionally, no substantial amounts of data were downloaded as part of any testing, nor was there any obvious evidence of malicious access.

## AWS Keys in E-Dukaan Marketplace

[E-Dukaan](https://edukaan.cv.tatamotors/) is a Tata Motors site where their customers can buy spare parts for their vehicles. It’s a typical E-Commerce site, but it had a dark secret!

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b00cc688-abf7-41f4-1146-35be0d456200/full)

Can you see it? Right there, in plaintext, are AWS keys. For those unfamiliar, you NEVER EVER want to expose these because people can use them to download all your files stored on Amazon, upload malicious content, rack up massive bills, etc.

Intrigued, I put them into S3 Browser to see what it unlocked access to. The answer was.. basically everything. A long list of buckets packed with sensitive information. Here’s a few examples:

**A customer database backup?** Check ✅

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/08c980e5-9b14-4f02-e0a6-92a68f36b800/full)

**Customer lists and market intelligence?** Yup ✅

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/5b215880-1b94-44ec-4833-1e943c310f00/full)

**Hundreds of thousands of invoices for E-Dukaan containing customer information, like PAN?** Of course ✅

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/de67f515-4344-475a-ff26-ac47a398d500/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/22ea75de-48bd-41bc-a669-4ede1ce6d500/full)

**Admin order reports?** Absolutely ✅ (about 40 GB worth of reports in here)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/96b73311-f7ac-414c-eda6-fb978dfab400/full)

You may be wondering, where was this AWS keyset actually used? What made it worth the risk of exposing so much? Answer: to download a 4 KB file containing tax codes:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/06b92b92-23bf-4e7e-df58-c9c46c9a0b00/full)

The code where the keys are used.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/5afc2c31-1ad4-45d8-f7be-e0f7b02c3700/full)

The file that gets downloaded.

## Decryptable AWS Keys in FleetEdge

Finding the AWS keys in E-Dukaan was so easy that it felt like cheating. This next one was more challenging (but not by much).

[FleetEdge](https://fleetedge.home.tatamotors/) is Tata Motors’ fleet management/tracking solution. More info is [here](https://fleetedge.tatamotors.com/). Looking at the API calls that are executed on site load as a guest user, one immediately stuck out:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/5491e2ef-41d8-45c0-3a22-57bad3794b00/full)

Right there in the response is another set of AWS keys, but this time they were not plaintext – they appeared to be encrypted. A quick search of a decrypt method turned up the exact code, and setting a breakpoint there was enough to reveal the contents:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/e6416109-fdbc-4c76-911b-b18e0a645b00/full)

[As recently seen with Intel](https://eaton-works.com/2025/08/18/intel-outside-hack/), there seems to be a trend where developers will do this pointless client-side decryption. When the client has the key, it’s strange that anyone would think that would be secure. Maybe these devs knew what the E-Dukaan team was doing and wanted to (try) doing things a little better?

This set of AWS keys has a similarly serious impact. There was another long list of new buckets you could access. At one point, S3 Browser had estimated *70 TB* in one bucket before it crashed. Here’s a few examples:

Fleet insights – this is where 70 TB+ of data was found. There was some datalake with files going back to 1996!

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/6aabd02d-ee7f-4d1b-d1ea-c2191ef20f00/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/9c90e5ce-be59-45ef-aa68-8fe54fa82700/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a50fb993-0625-49b0-e9f9-65a6ab371000/full)

You also had write access to some websites. You could easily slip in some malware on the frontpage and wreak some havoc.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f7bd5304-12dc-4843-f776-346502798200/full)

## Backdoor admin access to Tableau

**Note:** This flaw is not believed to be linked to Tableau itself and instead was introduced by Tata Motors.

Let’s go back to E-Dukaan now. Turns out, it’s the gift that keeps on giving. Poking around the source code of the website, I came across some interesting code:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a511c0f1-60c5-4128-3f62-ac6ed4467b00/full)

The first obvious issue was the username and password in the comments. If you look closer, you can see an HTTP call to get a “trusted token”. Crucially, it only needs username and site name (no password). Thanks to the code comment, we had a username to try. Performing the HTTP POST manually yielded a token!

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ca4ce1c3-0306-45a4-a494-5d03a912a200/full)

Definitely trust me, even though I have no password.

When you plug that into the infoviz URL like the code does, you will be redirected to Tableau!

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/04c2a112-2eac-4117-db05-cca2f774b600/full)

But there is more fun to be had. This user didn’t have access to much. Since we essentially had a backdoor into Tableau needing only username, we could in theory log in as anyone. One of the cards had the server admin as the owner, and it was possible to get the username that way:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f75832f6-3394-4a33-04a8-0479bcecc000/full)

With that in hand, I went through the same process of getting a token, and then I had total control over Tableau with access to everything. I didn’t dig too deep after this since it was a lot of sensitive corporate stuff, and I had proven the vulnerability at this point.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/e46a59e5-0839-4f8b-781b-ea63fcfd6f00/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/bd0515ca-2268-4826-f356-bce1ded99f00/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/16382547-6037-485e-c9d5-2c4ff6d85a00/full)

## Azuga API Key Leak

[Azuga](https://www.azuga.com/) is a fleet management platform. Tata Motors used it for their test drive website, presumably to keep tabs on where their cars are. Right there in the JS code was the Azuga token that should never have left the server. A quick API test was enough to confirm it was valid, and that is where I wrapped things up.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a67ac2e5-a5e2-471a-d395-2f92c5dd7a00/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8d0e5112-823d-4013-32e6-94147c9dae00/full)

## Timeline

Special thanks to [India’s Computer Emergency Response Team (CERT-IN)](https://www.cert-in.org.in/) for working with me on these disclosures.

All 4 issues were reported to Tata Motors through CERT-IN. Tata Motors was a bit slow in rotating the AWS keys. Given what was exposed, I had hoped they would have done it faster.

-   **August 8, 2023:** Reported. A response is received shortly after confirming they will take action with the concerned authority.
-   **August 30, 2023:** I request an update.
-   **September 1, 2023:** Tata Motors shared with CERT-IN (who then shared with me) that the issues are remediated.
-   **September 3, 2023:** I confirm **only 2/4** issues were remediated and the AWS keys were still present on the websites, and active.
-   **October 22, 2023:** After no updates and finding the AWS issues still not remediated, I send over some more specific steps on what must be done.
-   **October 23, 2023:** They confirm receipt and are working on taking action. After this date and up until **January 2, 2024**, there were various back and forth emails trying to get Tata Motors to revoke the AWS keys. I am not sure if something was lost in translation, but it took a lot of pestering and specific instructions to get it done.

## India’s largest automaker should be more secure

Compared to some of my other recent hacks, these weren’t anything super sophisticated. You just had to know where to look. Secrets leak all the time, but the impact is often tempered by the secret having limited access. In this case, having 2 sets of AWS keys leak with access to so much is incredibly concerning. When buying a car, you should be able to trust the automaker will take reasonable actions to keep your data secure. I hope Tata Motors does better in the future – someone else would have absolutely discovered these vulnerabilities at some point, and that would have been a much darker story.
