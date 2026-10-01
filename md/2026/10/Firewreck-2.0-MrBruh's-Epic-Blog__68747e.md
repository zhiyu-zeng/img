---
title: Firewreck 2.0 | MrBruh's Epic Blog
source: https://mrbruh.com/firewreck2/
source_host: mrbruh.com
clip_date: 2026-10-01T10:34:26+08:00
trace_id: 456960f3-e0f0-49a9-8353-51cffb9501db
content_hash: 2df89eec873929b9f5e265480353b8833449520b00d7a8205125b1e53f74b711
status: synced
tags:
  - 漏洞分析
  - Android逆向
series: null
feed_source: mrbruh·漏洞研究
ai_summary: 扫描 Play 商店下载量最高的 150 万款 Android 应用，发现 11,126 个 Firebase 配置不当实例，共泄露约 14.3 亿条用户记录。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3ec75244-d011-81cc-bdb2-d7b338735b59
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 扫描 Play 商店下载量最高的 150 万款 Android 应用，发现 11,126 个 Firebase 配置不当实例，共泄露约 14.3 亿条用户记录。
> 
> - **数据来源与规模：** 通过 AndroZoo 的 150 万 API 额度获取热门应用，按下载量排序并取最新版 SHA256；因全部 APK 约 42TB，改为多机分片下载、边下边解析、不存盘，最终从 150 万应用中提取出 80 万份有效 Firebase 配置。
> - **解析与探测方法：** 移植 Google 的 ArscBlamer 解析 APK 内 resource.arsc，提取 Firebase project-id 与 Google API Key；扫描器先注册假账号拿 Bearer token，再对 users 集合发 structuredAggregationQuery 只取条目总数，避免读取真实用户数据，注册关闭时退回未认证查询。
> - **扫描结果：** 80 万实例约 5 小时扫完；11,126 个实例存在漏洞，暴露 14.3 亿条用户记录，涉及 25.9 亿次应用下载，其中包含 5 款下载量过亿、10 款过 5000 万的应用。
> - **通知成效：** 用 Resend 以约 20 美元发送 9,889 封开发者邮件（退信 1,619 封）；一个月后 220 封被点击、21 封回复，228 个实例修复，9,176 万条记录转为私有，剩余暴露记录降至约 13.4 亿。
> - **Google 态度：** Firebase 支持称系统会自动检测并邮件告警不安全规则；VRP 表示"开放访问/任意认证用户可读写"属于用户有意配置，最终标记为 Won't Fix (Intended Behavior)。作者实测控制台只对完全开放规则告警，对"任意认证用户可读写"无任何提示，而该配置正是官方文档点名警告的不安全规则。

**TLDR: Out of the top 1.5 Million Android apps on the Play Store, 11,126 were insecure and exposed users’ PII. In total these 11 thousand apps exposed 1.43 Billion user records. This includes 5 apps with 100 Million downloads and 10 apps with 50 Million downloads.**

Two years ago, along with a few friends, we looked into scanning the internet for insecure Firebase instances [(read here)](https://env.fail/posts/firewreck-1/). I wanted to take another look, but this time scanning mobile apps instead of websites.

## Part One: Downloading & Parsing

To do this, I reached out to the University of Luxembourg who provided me and two of my friends with access to their AndroZoo dataset. In total we were provided with 1.5 Million API credits to make use of.

To calculate the list of apps and file ids, I downloaded their Google Play Metadata dataset, and used some SQL to generate a list of the **top 1.5 million most popular apps** based on their download count, and also output the SHA256 hash of the latest version for each app.

Unfortunately, there was one small issue with this. The size of all of the APKs combined, totalled around 42 terabytes of data, and on my VDSL connection, it would’ve taken over 4 and a half months to finish downloading. Not to mention, who has 42 terabytes of free storage lying about?

The solution to this came in two parts. First, I decided to split the workload into multiple chunks, and spreading the work across multiple machines. I asked a few friends of mine for help with this.

Secondly, I made the decision to avoid storing all of the downloaded APKs, and instead opted to parse them on the fly & only save the relevant information to our research. For this, I ported a tool by Google called ArscBlamer. This program allowed for the parsing of a key:value store in APKs called resource.arsc, and let us extract the Firebase project-id and Google API Key from the app.

All up, the development of this program took about a month of on-and-off work to write, test and polish to the point where I was confident that it could autonomously download and parse all 1.5 Million apps without crashing or failing in any way.

At this point, it was time to let it loose and see how well it could do when deployed for real.

…

A week later, we had results. **Out of the 1.5 million apps downloaded, 800,000 apps had valid Firebase configurations** that were able to be extracted.

It’s important to note that a large portion of these apps only used Firebase for analytics, rather than for storing data.

## Part Two: Scanning for misconfigured instances

I wanted to be as ethical as possible when scanning for misconfigured Firebase instances. To achieve this, I wanted to avoid requesting any samples of user data and instead just request the number of rows in the vulnerable collections.

This makes it more difficult to understand the exact type of data that was being exposed, however I was confident that its composition would likely be similar to my previous internet-wide Firebase scan, for which I had statistics for the type of information that was being exposed.

I have published an open source version of the Firebase checker/scanner on GitHub for those who want to more deeply understand how it works.

Website: [https://firewreck.github.io/](https://firewreck.github.io/)

Source Code: [https://github.com/firewreck/firewreck.github.io/blob/main/index.html](https://github.com/firewreck/firewreck.github.io/blob/main/index.html)

In short it attempts to register a dummy account and request an authentication token for it, then it requests a **structuredAggregationQuery** for the total entries in the **“users”** collection using said Bearer token. If sign-ups are disabled, it will fall back and attempt the **structuredAggregationQuery** unauthenticated.

To test all **800 thousand** Firebase instances, it took about **5 hours**, however in reality this took place over the span of a couple days due to me finding and fixing multiple bugs during earlier test runs.

## Part Three: The results

**The results of the scan are as follows:**

Total Vulnerable Firebase Instances: **11,126**

Total Exposed user records: **1,432,693,875** (1.43 Billion)

Total Vulnerable app downloads: **2,597,837,909** (2.59 Billion)

For reference, here’s a list of the biggest breaches from **Have I Been Pwned**.

![HIBP.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/04d677de7ffa89df.avif)

* * *

Here is a graph showing the distribution of vulnerable Android apps based on their total downloads according to the Google Play Store. *(Including 5 apps with 100 Million downloads and 10 apps with 50 Million downloads)*

Raw data as CSV: [app_downloads.csv](https://mrbruh.com/firewreck2/app_downloads.csv)

* * *

Graph showing the distribution of number of exposed user records:

Raw data as CSV: [user_records.csv](https://mrbruh.com/firewreck2/user_records.csv)

## Part Four: Reporting

For reporting, I decided to use the developer contact emails which were included in the Androzoo Google Play Metadata dataset, combined with an email template I made that would automatically be filled out with the relevant details.

For sending these emails out, I settled on using **Resend** as it would only cost me $20 to send out 20 thousand emails and the documentation for it seemed very mature. After filtering out Firebase instances with fewer than 10 users and letting my computer run for a couple of hours, it ended up sending out a total of 9,905 emails with 16% of them bouncing.

**Statistics:**

-   Total Emails Sent: **9,889**
-   Emails Delivered: **8,270**
-   Emails Bounced: **1,619**

* * *

*One Month Later:*

-   Emails Clicked (according to click tracking analytics): **220**
-   Responses Received: **21**
-   Vulnerable instances fixed: **228**
-   User records made private: **91,763,448**
-   Remaining exposed user records: **1,340,930,427**

## Part Five: Google’s Response

I also reported this issue, the number of exposed user records, and the list of vulnerable Firebase project-ids to Google through their Firebase support form and their Bug Hunters portal.

### Firebase support

I received a response back from their Firebase support in two days, here it what it said:

```css
Hello MrBruh, 

Thank you for reaching out to Firebase Support, this is <Support Agent> and I will be happy to help you out.

I understand you are reporting a large number of Firestore instances with potentially insecure rules. While we cannot process external lists to send manual notifications to project owners, I want to assure you that we have systems in place to address this.

Firebase actively monitors for insecure Security Rules (such as allow read, write: if true;). When we detect these configurations, we automatically send Insecure Rules Alerts via email to the project owners and display warnings directly in the Firebase Console. These automated systems are designed to notify developers so they can take corrective action.

At the same time, if you believe that you have identified a vulnerability in the Firebase platform itself, or a way to bypass our security checks, I would encourage you to file a report through the Google Vulnerability Reward Program (VRP) at [bughunters.google.com](https://bughunters.google.com/). This will ensure that your findings are triaged by our dedicated security engineering teams.

I hope this gives you a sense of direction regarding your findings. If you have any questions or concerns, please feel free to contact me. 

Cheers, 

<Support Agent>
```

While it was good to hear that Google automatically alerts owners who have insecure Firebase rules, I wanted to test this for myself.

![open\_security\_rule.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4d4a20d8d53de668.avif)

Firebase automatically warns if you allow unrestricted read/write access…

![authed\_security\_rule.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/53c0363ebca8b8b8.avif)

… But gives no such warning when giving unrestricted read/write access to any authenticated user.

![insecure\_rules\_docs.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/41c0f8468dc0ac18.avif)

Despite this exact configuration being warned against in Google’s documentation for [insecure Firebase rules](https://firebase.google.com/docs/rules/insecure-rules?authuser=0#access_for_any_authenticated_user)!

### Google’s Vulnerability Reward Program

```kotlin
(Jan 22, 2026)

Hi there,

Thanks again for your report. We do understand how this is confusing and have had other similar reports and disclosures. However, we wanted to point out some key documentation and steps that the product takes to ensure that the projects that are “open access” are supposed to be.

First, Google Cloud has no insight into whether or not our customers have purposefully configured their apps to be public. There are extremely valid use cases for both of the configurations that you outline above and we are unable to take action in these cases without potentially breaking our customers application workflows.

Second, every customer that has chosen this configuration has made this change purposefully. We are very clear in our documentation that both open access and access for any authenticated user is not recommended (https://firebase.google.com/docs/rules/insecure-rules#open_access). To help our customers further understand their access configuration choices, we also provide a tool (https://firebase.google.com/docs/rules/simulator) and a security checklist (https://firebase.google.com/support/guides/security-checklist) which also outlines additional access patterns.

Lastly, while access defaults to private, the product takes additional steps to ensure that other configuration choices are intentional. We send weekly emails when the configuration choices you outlined are chosen. The product also has a banner in the console for open storage rules on Firestore, Firebase Storage and RTDB. There is no console warning for open auth rules, though the product team is considering it.

While you may be correct on the number of open access and access for any authenticated user, the product has taken and continues to take steps to ensure that these choices are intentional by our customers.

Thanks again for your report and if you think that we’ve missed something, please let us know!

Thanks, Cote’ - Cloud VRP Lead
```

```
(Jan 23, 2026)

Status: Won't Fix (Intended Behavior)
```

## Timeline (DD/MM/YYYY)

-   27/10/2025 - API Keys for Androzoo requested
-   27/10/2025 - Development on a Python program that could extract the Firebase configurations from Android apps begins
-   16/12/2025 - Final preparation for scraping top 1.5 Million Play Store apps
-   17/12/2025 - Scraping of Firebase configurations from top 1.5 Million Play Store apps begins
-   24/12/2025 - Scraping concludes
-   25/12/2025 - Development of mass email-er / reporting program begins
-   28/12/2025 - Development concludes and emails start getting sent out
-   01/01/2026 - “Vulnerability” is reported to Google / Firebase Support
-   01/01/2026 - “Vulnerability” is reported to Google’s Vulnerability Reward Program (VRP)
-   03/01/2026 - Firebase Support responds
-   22/01/2026 - Google VRP responds
-   23/01/2026 - Google VRP closed as *Won’t Fix (Intended Behavior)*
-   28/01/2026 - Blog Published

## Donations

If you found this interesting or useful, you can buy me a coffee via my KoFi: [https://ko-fi.com/mrbruhh](https://ko-fi.com/mrbruhh)

## Contact Me

If you have any questions you can contact me on Signal: @paul19.84

I can also be reached via email (contact \[at\] mrbruh.com), however I will likely only respond to journalists.

## Citations

-   [AndroZoo: Collecting Millions of Android Apps for the Research Community](http://doi.acm.org/10.1145/2901739.2903508)
    
    Kevin Allix, Tegawendé F. Bissyandé, Jacques Klein, and Yves Le Traon
    
    Proceedings of the 13th International Conference on Mining Software Repositories (MSR '16)
    
-   Marco Alecci, Pedro Jesús Ruiz Jiménez, Kevin Allix, Tegawendé F. Bissyandé, and Jacques Klein
    
    Proceedings of the 21st International Conference on Mining Software Repositories (2024)
