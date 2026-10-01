---
title: The RCE that AMD wouldn’t fix! | MrBruh's Epic Blog
source: https://mrbruh.com/amd2/
source_host: mrbruh.com
clip_date: 2026-10-01T10:36:26+08:00
trace_id: ae003e5d-90f5-424d-a3ce-e44c7efe9a97
content_hash: 752445a85a4306c14750c0ad767172cf89688fa33ce60a0f56aa220ae6455dfc
status: synced
tags:
  - 漏洞分析
  - Windows逆向
series: null
feed_source: mrbruh·漏洞研究
ai_summary: AMD AutoUpdate 用 HTTP 下载更新程序且不做签名校验，可被中间人替换为任意可执行文件直接运行；但厂商拖延 124 天、拒付赏金，而该更新器实际上早已因重定向 bug 崩溃而无法触发漏洞。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ec75244-d011-8139-9c25-c4a0c217ff08
ioc:
  cves:
    - CVE-2026-40677
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> AMD AutoUpdate 用 HTTP 下载更新程序且不做签名校验，可被中间人替换为任意可执行文件直接运行；但厂商拖延 124 天、拒付赏金，而该更新器实际上早已因重定向 bug 崩溃而无法触发漏洞。
> 
> - **漏洞成因：** `app.config` 中的更新地址走 HTTPS，但该 XML 内列出的可执行文件下载链接全是 HTTP，同一网络或 ISP 级攻击者可 MITM 替换响应。
> - **校验缺失：** 反编译显示程序下载后无任何证书或签名验证，直接执行文件。
> - **厂商态度：** AMD 赏金计划以"MITM 不在范围内"关闭报告，后改口签发 CVE-2026-40677 并致谢，但拒付约 1 万美元奖金；要求作者撤下博客并延长禁售期，实际拖到 124 天才解禁。
> - **讽刺结局：** 更新器无法处理 ati.com 到 drivers.amd.com 的重定向而崩溃或卡死，导致漏洞代码根本执行不到，形成"要更新更新器才能修更新器"的死结。
> - **补丁打脸：** AMD 称更新已移至应用层、全程 HTTPS 并做签名校验；作者验证后指出实际只有 CRC-32 校验，并非密码学安全。

After being interrupted multiple times by an annoying console window that would pop up periodically on my new gaming PC, I managed to track the offending executable down to AMD’s AutoUpdate software.

In my frustration, I decided to punish this software by decompiling it to figure out how it worked, and accidentally discovered a trivial Remote Code Execution (RCE) vulnerability in the process.

The first thing I found is that they store their update URL in the program’s `app.config`. Although it’s a little odd that they use their “Develpment” URL in production, it uses HTTPS, so it’s perfectly safe.

![amd\_appconfig](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ff52b7f7c87f38d3.avif)

The real problem starts when you open up this `.xml` URL in your web browser, and realise that all the executable download URLs are using HTTP.

![amd\_updatexml](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/94af990e69fdaf64.avif)

This means that a malicious attacker on your network, or a nation-state that has access to your ISP, can easily perform a MITM attack and replace the network response with any malicious executable of their choosing.

I was hoping that AMD perhaps had some form of certificate validation to ensure that it could not download and run any unsigned executables. However, a quick look into the decompiled code revealed that the AutoUpdate software does no such validation and immediately executes the downloaded file.

![amd\_installupdates](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/710103cdd19f9ef1.avif)

After finding this, I thought it would be worth reporting to AMD, as it seemed pretty severe.

Unfortunately, the terms of service of their bug bounty program **state** that **man-in-the-middle** attacks are out of scope, and it was closed as such.

![amd\_disclosure](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3d45c042d2a671e9.avif)

**UPDATE! Within a day of this blowing up on [Hacker News](https://news.ycombinator.com/item?id=46906947), AMD reached back out to me and said they would be looking into the matter after all.**

```sql
I am writing from AMD PSIRT. We are still conducting an internal review of your report. Please note that even if Intigriti has rejected the submission as out of scope for the bounty program, we are still happy to review the details to determine whether there may be any potential validity.     
```

**Note:** Intigriti is the third-party bug bounty platform AMD uses for initial triage, while PSIRT (Product Security Incident Response Team) is AMD’s internal security team.

Additionally, they requested I take down the blog post until they patched the issue.

```
We were informed that a blog post discussing this issue has already been published, which does not appear to be in accordance with the program’s terms. Could you please take the post down and wait for us to complete our review and provide an official response?  
```

I agreed to do so, which, in hindsight, I believe was the wrong choice to make.

```
The report was marked out of scope because it is not eligible for a bounty under our current program guidelines, as it affects optional tools and relies on a MITM attack scenario.  
  
After further internal review, we've decided to:  
  
- Issue a CVE for this vulnerability  
- Implement a fix  
- Provide you with security researcher recognition  
```

After agreeing to take down my blog until the vulnerability was patched, they followed up by detailing that they would not be paying me because it’s an optional tool and requires MITM, but instead they would be issuing a CVE for this and giving me credit.

```
What disclosure timeline you intend to follow?  
  
e.g 90 + 30 days  
```

I asked them what disclosure period they were planning to follow for this issue. The industry standard is 90 days, and after looking at other researchers’ write-ups, I can confirm the majority of AMD’s vulnerabilities were addressed within 90 days.

```
Hi @mrbruh, We will likely need a longer embargo, as additional tools beyond Ryzen Master appear to be impacted and will need releases. I’ll keep you updated as we learn more.  
```

**So in summary, this is the current state of the disclosure:**

-   They declared it out of scope for a bounty, but requested that I take down the blog post because it was breaking the bug bounty’s rules.
-   Not only did they ask me to take the blog post down, but they also asked me to keep it down for an extended duration compared to the industry standard.
-   They justified this extended embargo period by saying that this issue might affect several of their software products; however, the patch itself could be as simple as adding a single `s` to an `http` URL in their hosted XML file (so it should be relatively easy to fix).
-   Also, if this is such a big issue that millions of people’s computers could get hacked at any time from a number of AMD’s products, then it should be a priority to fix this quickly, no?

I ended up waiting an additional 69 days, for a total of 87 days from disclosure until I reached out again.

I told them that I could not continue to wait an indefinite amount of time for them to fix this issue, and that I planned to publish my write-up again at 100 days after initial disclosure had passed.

AMD did not actively keep me updated, despite assuring me they would. They only told me what the fix for this vulnerability was a couple of days before the embargo ended (and only after I explicitly asked).

```sql
Multiple optional tools are affected by this. We are awaiting release on at least one of them. Moreover, our customers request additional time to review fixes once they are made available. So we request you to hold public disclosure to give additional time for customers.  
```

They initially just asked for “more time”, without specifying a disclosure period, but two days later they agreed to end the embargo on June the 9th.

```
Hi @mrbruh, I have asked the engineering teams to expedite this so we can disclose it on June 9th. Will keep you updated.  
```

I am planning to publish this updated write-up, a total of **124 days after initial disclosure**.

**124 days to get AMD to add an `s` to a couple of HTTP URLs!**

## The Kicker

I don’t think it even matters what patch AMD has cooked up to fix this issue.

According to [a link](https://reddit.com/r/AMDHelp/comments/ysqvsv/amd_autoupdateexe/mltu3z2/) posted in the Hacker News thread of my original post, the auto updater is completely broken due to a second, entirely unrelated reason.

They switched from hosting their list of software packages on ati.com to drivers.amd.com at some point.

Opening the XML URL in your web browser will automatically redirect you to the new domain. However, the AutoUpdater program cannot handle this redirection, causing it to crash or lock up.

![amd\_reddit\_post](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f6944d8524cf2981.avif)

In some weird twist of events, I guess this means that the vulnerability I found actually isn’t exploitable because the AutoUpdater doesn’t even reach that section of code before completely shitting the bed.

It also results in a kind of Catch-22: you need to update the updater to fix the vulnerability, but the updater won’t update until the redirection bug is fixed. Nice.

![Great Job AMD GIF](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2b3c05149f4f5bf4.gif)

If you are an AMD user with their software installed, I highly suggest fully uninstalling everything, then grabbing the new versions from their website.

**Final update: A couple of days before the embargo ended (and after I wrote the majority of this blog post), AMD told me what their patch for this vulnerability is:**

```sql
Hi @mrbruh In Ryzen Master, the auto-updater functionality has been removed from the installer and moved to the application layer. 

Within the application, all update communications are secured using HTTPS, and updates undergo signature verification.
```

I have since validated those claims. Although it is true that they now fully use HTTPS, the claim about signature verification is untrue; they only perform a CRC-32 check on the downloaded executable, which is not cryptographically secure.

## Donations

So far for the vulnerabilities I have reported to Google, ASUS, AMD, TP-Link, MSI (and more), have paid out a total of $0. The AMD vulnerability would have paid out ~10k USD if it was considered in scope.

If you found this article interesting or useful, you can buy me a coffee via my KoFi: [https://ko-fi.com/mrbruhh](https://ko-fi.com/mrbruhh)

## Timeline (DD/MM/YYYY)

-   27/01/2026 - Vulnerability Discovered (by me)
-   06/02/2026 - Vulnerability Reported
-   06/02/2026 - Vulnerability Closed as `won't fix/out of scope`
-   06/02/2026 - Blog published
-   07/02/2026 - AMD backtracks and says they’ll look into it after all
-   09/06/2026 - Embargo on the vulnerability ends after **124 days**
-   12/06/2026 - [CVE-2026-40677](https://www.cve.org/CVERecord?id=CVE-2026-40677) published by AMD
