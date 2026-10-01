---
title: "I’m The Captain Now: Hijacking a global ocean supply chain network"
source: https://eaton-works.com/2026/01/14/bluspark-bluvoyix-hack/
source_host: eaton-works.com
clip_date: 2026-10-01T10:39:00+08:00
trace_id: 90a0b55a-7402-4e48-815c-35e08b6b1488
content_hash: 9a414978caf9600bfd74af8615ae224a0098dd67c6d2c03a168ac3af6436e516
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: Eaton Works·漏洞研究
ai_summary: 安全研究者发现海运物流 SaaS 平台 BLUVOYIX 的 API 全部未鉴权且明文保存密码，可自建管理员账号并接管全部客户货运数据。
ai_summary_style: key-points
images_status:
  total: 33
  succeeded: 0
  failed_urls:
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8ec7e540-79ea-4225-2899-9ec968150400/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/478a6137-ee3d-4124-82f4-8c253ff89200/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/c91ccbec-9066-4f91-115d-0c3173b0cc00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/0268ae23-0ad4-4ab9-dc3b-4393985dec00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b248b597-f0fe-4d54-7bf6-5260c5d65c00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/6ea86f3b-4343-4e80-5fc2-0bf0f3873a00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b607e91d-3998-4e55-e584-c81cd5e4a100/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/58e6b960-6be1-49d9-083a-93a5c137e900/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a460f05d-e961-4475-362d-350e91bef700/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/774ff7d9-8fa5-43ad-dd0a-38d8f3c31200/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/267b3292-3141-4a92-5665-b25de47e2800/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/79d126cc-16bc-4445-4b2f-37480b73c200/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/03166ed6-67c4-438b-f942-b9f7ecebcc00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8060bee5-8a1e-44b1-76ba-d4ed4dae0600/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/7df16d2c-7acd-4aca-e8bd-ca9db7b6ca00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f74fa472-7fd9-44e9-26d0-c008a41de700/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/00322283-47f6-4eb0-5f8c-96c546e75600/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b1e0f641-dc8c-4bc3-9cf2-a3b9ac0dc000/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8c16362e-ef7b-4e8d-812f-04e7fa048500/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/4002e140-367b-4065-2c4d-1358fb6dc900/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b87b9bc5-6f0c-4e82-fedf-3be8bc81d100/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ae775596-076b-4b04-25b4-630561ea8000/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/32aa5c3d-6a51-4e56-206f-438ba283e800/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/bd623494-2fa2-444b-6937-699a39aabb00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/de600a20-7f38-41de-3177-9512f864f900/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/00b6efc7-7229-4ca2-2617-deaa4d73d600/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f4c63109-f542-47bc-4e8a-93aee4379b00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ac8f066c-5262-4297-83a2-1176de637900/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ea1a7fce-63a8-4cee-7ef7-0710da80b900/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8ea47bb3-1f0c-462c-54ed-cbd90102ed00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/31e32dd3-0eb3-4168-e2d0-3a9085666b00/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b80b6ab4-b5d8-4a78-a580-83e9375e3400/full
    - https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/6f0dc93c-7773-4809-ef16-a3f132a0e500/full
notion_page_id: 3ec75244-d011-816e-96df-c59275949c9c
ioc:
  cves:
    - CVE-2026-22236
    - CVE-2026-22237
    - CVE-2026-22238
    - CVE-2026-22239
    - CVE-2026-22240
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 安全研究者发现海运物流 SaaS 平台 BLUVOYIX 的 API 全部未鉴权且明文保存密码，可自建管理员账号并接管全部客户货运数据。
> 
> - **事件概况：** 海洋运输/供应链 SaaS 平台 BLUVOYIX（Bluspark Global）服务约 500 家全球大型企业，5 个关键漏洞可实现平台完全接管、访问所有客户与货运数据；截至发布日已全部修复。
> - **API 全面失守（CVE-2026-22236 / 22237）：** 所有 API 不校验授权令牌，删掉 JWT 或填任意 Authorization 值都能正常调用、永不返回 401；API 根路径还暴露完整文档，两者叠加使攻击门槛极低。
> - **可自建管理员（CVE-2026-22238）：** 向 users API 发一个 HTTP POST 即可注册自己的管理员账号，注册邮件中同样回传明文密码，之后登录 NVO 门户即可在大量客户租户间切换。
> - **明文密码泄露（CVE-2026-22240）：** 共 3 个 API 可返回全部账号（含管理员）的明文密码；另一客户站点只需已知邮箱 + 猜测角色值即可取回密码，验证其确为管理员。
> - **客户端发信与影响面（CVE-2026-22239）：** 邮件发送逻辑被写在客户端 JS 中，可发送看似官方的钓鱼邮件；管理员权限可查看、修改甚至取消追溯至 2007 年的客户货运记录。披露时间线：2025-10-09 起多次联系无回应，11-03 求助记者，11-05 才建立联系，11-07 大部分修复，2026-01-14 公开。

**News coverage:**

-   [TechCrunch](https://techcrunch.com/2026/01/14/us-cargo-tech-company-publicly-exposed-its-shipping-systems-and-customer-data-to-the-web/) ([Front page screenshot – January 14, 2026](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/6dd78138-c62a-4ae8-8605-af05a70a0c00/full))

## Key Points / Summary

-   [BLUVOYIX by Bluspark Global](https://blusparkglobal.com/bluvoyix/) is an ocean logistics / supply chain platform used by hundreds of the world’s largest companies. The software is also used by several affiliated companies.
-   Critical vulnerabilities were uncovered that enabled full platform takeover and access to all customer data/shipments. **As of the date of publication, these issues are resolved.**
    1.  [CVE-2026-22236](https://www.cve.org/cverecord?id=CVE-2026-22236): APIs did not check for a valid authorization token. As a result, all APIs were unauthenticated.
    2.  [CVE-2026-22237](https://www.cve.org/cverecord?id=CVE-2026-22237): Exposed API documentation. Coupled with #1, this made it possible to cause real damage easily.
    3.  [CVE-2026-22238](https://www.cve.org/cverecord?id=CVE-2026-22238): You could create your own admin account through an HTTP POST to the users API.
    4.  [CVE-2026-22239](https://www.cve.org/cverecord?id=CVE-2026-22239): Email sending code was found in client-side JS, making it possible to send official-looking phishing/malicious emails.
    5.  [CVE-2026-22240](https://www.cve.org/cverecord?id=CVE-2026-22240): Plaintext passwords. There were 3 APIs that could be used to retrieve the plaintext passwords of all accounts, including admins.
-   Admin access made it possible to view, modify, and even cancel customer shipments going back to 2007.

There’s a good chance you have never heard of BLUVOYIX or Bluspark Global, and that’s ok! Not every company that powers global commerce is a household name. Despite their low profile, companies like these have an important role to play in keeping the global supply chain running in the background. [Breaches at companies you haven’t heard of can often have the worst impacts](https://www.gao.gov/blog/solarwinds-cyberattack-demands-significant-federal-and-private-sector-response-infographic).

BLUVOYIX is a SaaS platform that powers the cargo and ocean shipping/logistics industry. It is best described by this block of text [from their website](https://blusparkglobal.com/bluvoyix/#how:~:text=A%20cloud%2Dbased%20solution%20that%20helps%20shippers%20manage%20their%20supply%20chain%20data%20in%20a%20frictionless%2C%20neutral%20environment%20supported%20by%20a%20best%2Din%2Dclass%20tech%20stack): *A cloud-based solution that helps shippers manage their supply chain data in a frictionless, neutral environment supported by a best-in-class tech stack*

There’s also [this PDF](https://uspto.report/TM/99023246/APP20250130112726/9.pdf) that explains it in more detail. What you basically need to know is, 500 companies use it to manage their global supply chain, and the platform ran on plaintext passwords and unauthenticated APIs. Let’s dive in!

## The discovery & plaintext passwords

Hacking automakers is a lot of fun, but in recent months I wanted to try branching out into a different industry to see what I could find. Searching for shipping associations and login/registration panels landed me on the joining page of a BLUVOYIX customer that uses the platform:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8ec7e540-79ea-4225-2899-9ec968150400/full)

It’s a React JS website (my favorite!) Poking around, I found the API root. One of the first things I like to try is visiting the API root in the browser. With some luck, you can find documentation – and that was the case here!

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/478a6137-ee3d-4124-82f4-8c253ff89200/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/c91ccbec-9066-4f91-115d-0c3173b0cc00/full)

Some juicy stuff there. The “getUserList” API stuck out:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/0268ae23-0ad4-4ab9-dc3b-4393985dec00/full)

The endpoint in the docs is invalid for some reason, but removing the port and adding HTTPS was all that was needed to make the API call work:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b248b597-f0fe-4d54-7bf6-5260c5d65c00/full)

It just gave me the entire users list ***without me authenticating***. Worse, there are ***plaintext passwords*** – even for the admin. After only a few minutes, I have presumably compromised the entire system.

## Admin account creation

In another test, I used the create user API to create my own administrator account:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/6ea86f3b-4343-4e80-5fc2-0bf0f3873a00/full)

That email came in. They also provided the plaintext password there too…

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b607e91d-3998-4e55-e584-c81cd5e4a100/full)

From there, all you do is log in via the “NVO” portal…

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/58e6b960-6be1-49d9-083a-93a5c137e900/full)

And then you are in!

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/a460f05d-e961-4475-362d-350e91bef700/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/774ff7d9-8fa5-43ad-dd0a-38d8f3c31200/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/267b3292-3141-4a92-5665-b25de47e2800/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/79d126cc-16bc-4445-4b2f-37480b73c200/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/03166ed6-67c4-438b-f942-b9f7ecebcc00/full)

## A look at the login

Let’s take a look at how the login works for that NVO site. When you log in via username and password, it returns a JWT. Pretty standard.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8060bee5-8a1e-44b1-76ba-d4ed4dae0600/full)

When you make an API call, that token gets sent. But it turns out it’s not even needed. If you remove it, the API goes through just the same. Oops.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/7df16d2c-7acd-4aca-e8bd-ca9db7b6ca00/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f74fa472-7fd9-44e9-26d0-c008a41de700/full)

## First Customer

Let’s go back to that first customer now. I found the login page you presumably use after your registration is approved:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/00322283-47f6-4eb0-5f8c-96c546e75600/full)

I then found the APIs it uses, and it had the same problem with public API documentation:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b1e0f641-dc8c-4bc3-9cf2-a3b9ac0dc000/full)

Happy Diwali to you too

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8c16362e-ef7b-4e8d-812f-04e7fa048500/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/4002e140-367b-4065-2c4d-1358fb6dc900/full)

The get user API stuck out. Looking at the documentation, the response information indicates it would return a password if you provided a valid username and role. I wasn’t sure about the role, but finding a valid email was easy because there are a few there in the code used for client-side email sending. Yes, they were forming emails client-side to send. **Do not do this!**

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b87b9bc5-6f0c-4e82-fedf-3be8bc81d100/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ae775596-076b-4b04-25b4-630561ea8000/full)

Plugging in that email with a guessed role value yielded the password:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/32aa5c3d-6a51-4e56-206f-438ba283e800/full)

The account was, of course, the admin, so you had access to all customer data. Some going back to the 2000s!

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/bd623494-2fa2-444b-6937-699a39aabb00/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/de600a20-7f38-41de-3177-9512f864f900/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/00b6efc7-7229-4ca2-2617-deaa4d73d600/full)

At the top right, there is an account switcher where you could switch into customer tenants, and there were *a lot* of them. The full list of customers is not being shared.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/f4c63109-f542-47bc-4e8a-93aee4379b00/full)

The auth was broken here too. You can put in any Authorization header value you want, and it will never give you a 401.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ac8f066c-5262-4297-83a2-1176de637900/full)

## Second Customer

At this point I had almost seen enough, but then tried my luck with another one of their customers using the BLUVOYIX platform.

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/ea1a7fce-63a8-4cee-7ef7-0710da80b900/full)

Similar tech stack:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/8ea47bb3-1f0c-462c-54ed-cbd90102ed00/full)

Same vulnerabilities:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/31e32dd3-0eb3-4168-e2d0-3a9085666b00/full)

Same takeover of all customers:

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/b80b6ab4-b5d8-4a78-a580-83e9375e3400/full)

![⚠️ 图片托管失败](https://eaton-works.com/cdn-cgi/imagedelivery/VwwCqBIYNXeyNQwEQ8uyVQ/6f0dc93c-7773-4809-ef16-a3f132a0e500/full)

There may be other portals or shipping associations out there, but after taking over the 3 most prominent systems, that was enough to prove the impact, so I started getting the report together.

## Timeline

I believed these vulnerabilities were CVE-worthy, so I submitted the details to the [Maritime Hacking Village VDP](https://maritimehackingvillage.com/vdp), which seemed to be a perfect fit for this type of research. I heard back from them right away and they have been a pleasure to work with. If you ever find something maritime related, I can’t recommend them enough.

We attempted to contact Bluspark multiple different ways, but did not receive a substantive response until we asked a journalist for help. A prominent customer was contacted by the journalist to help escalate. Once contact was established with Bluspark, they were appreciative, responsive, and ultimately fixed all reported vulnerabilities in a timely manner.

The full timeline:

-   **October 9, 2025:** Messages sent to Bluspark executives on LinkedIn, voicemails left on office phones.
-   **October 10, 2025:** Called CEO again, left message. Email sent to public email listed on website.
-   **October 13, 2025:** Called CEO again, left message. Email sent to CEO.
-   **October 16, 2025:** Emails resent to CEO and public email.
-   **October 23, 2025:** [Attempted plea on LinkedIn](https://www.linkedin.com/posts/maritimehackingvillage_sos-we-are-looking-for-a-security-contact-activity-7387190939863130112-07s7). Employee of Bluspark responds via LinkedIn message.
-   **October 27, 2025:** New email sent to Bluspark employee. CEO calls representative of Maritime Hacking Village to inquire if this is legitimate.
-   **October 29, 2025:** Follow-up to Oct 27th email sent.
-   **November 3, 2025:** In the initial email sent to Bluspark, we indicated the intent to disclose after 90 days in collaboration with them, or after 30 days if there is no response. In a last ditch effort to try and save their customers from a breach, a TechCrunch journalist was contacted for help.
-   **November 4, 2025:** Bluspark customer contacted by journalist for help escalating.
-   **November 5, 2025:** Contact finally established with Bluspark team.
-   **November 7, 2025:** First meeting held to discuss the vulnerabilities and the timeline. The vulnerabilities were also mostly fixed today. After this date and up until January 7, 2026, there were a few more back-and-forth emails to answer questions, iron out details, etc.
-   **January 14, 2026:** This blog and 5 CVEs published.
