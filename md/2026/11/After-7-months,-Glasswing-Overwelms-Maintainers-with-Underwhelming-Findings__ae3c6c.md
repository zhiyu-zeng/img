---
title: After 7-months, Glasswing Overwelms Maintainers with Underwhelming Findings
source: https://www.vulncheck.com/blog/anthropic-glasswing-november-update
source_host: www.vulncheck.com
clip_date: 2026-11-10T08:15:01+08:00
trace_id: f2322561-3e7a-416c-944c-5333e24589f0
content_hash: 4ca3cd7bd9bd7da3117acf80cd1c2a8ee86918ebc48cee227a50e39452725849
status: synced
tags: []
series: null
feed_source: VulnCheck·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41475244-d011-8105-ad52-ec37e213e615
ioc:
  cves:
    - CVE-2026-26980
    - CVE-2026-61500
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

![Anthropic November Ledger Update](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2ca1271b624cdce9.png)

Key Takeaways:

-   Seven months into Project Glasswing, VulnCheck has tracked 442 CVEs attributable to Anthropic, roughly 0.5% of all CVEs published this year, with only two identified as exploited in the wild. Of Anthropic’s 37,966 reported findings, only 7,349 (19.4%) have been made public and just 217 have been marked fixed.
-   Since September, Anthropic has added nearly 12,000 findings while recording just 15 additional fixes, widening the gap between discovery and remediation.
-   Roughly 1,654 findings (4.4%) have been marked as duplicates, nearly eight times the number fixed, and another 419 have been withdrawn.
-   Anthropic’s claimed true positive rate has risen from 90.8% to 94.2%, raising questions about how it accounts for duplicates and withdrawn findings.
-   Anthropic’s OSS Scanner shifts validation work to maintainers, with curl rejecting 19 of 34 published reports as vulnerabilities, confirming six as low severity and leaving nine awaiting assessment. Also putting Anthropic's true positive rates into question.

We're seven months into Anthropic's flagship Project Glasswing, and it's time for another update on the results. I've been tracking the project to see whether its claims are overhyped or grounded in reality.

As we all recall, Anthropic launched Project Glasswing on April 7th, claiming, "We have identified thousands of additional high- and critical-severity vulnerabilities that we are working on responsibly disclosing to open source maintainers." What surprised me was how little evidence the project offered, which made me wonder whether this was more of an overhyped marketing campaign.

That said, we shouldn't overlook that AI is an effective tool for finding vulnerabilities. But that story goes well beyond any single frontier model's capabilities.

If you're just catching up, this builds on my earlier posts:

-   [Tracking CVEs Attributed to Anthropic Researchers and Project Glasswing](https://www.vulncheck.com/blog/anthropic-glasswing-cves) - April 15
-   [Observations on Anthropic's Vulnerability Disclosure Ledger](https://www.vulncheck.com/blog/anthropic-ledger) - June 9
-   [1H-2026 State of Exploitation Report](https://www.vulncheck.com/blog/state-of-exploitation-1h-2026#has-anthropic-glasswing-lived-up-to-the-hype-it-brought-this-year) - July 28
-   [The Anthropic Glasswing Receipts Are Starting to Trickle In](https://www.vulncheck.com/blog/anthropic-glasswing-receipts) - September 8

## Tracking Anthropic-Discovered Vulnerabilities

I started tracking Anthropic's discovered vulnerabilities on April 17th, shortly after launch, in an open source repo called [Anthropic Credited CVEs](https://github.com/patrickmgarrity/Anthropic-Credited-CVEs). The goal was to see whether Anthropic's claims lived up to the hype. This was before Anthropic launched its own [disclosure ledger](https://red.anthropic.com/2026/cvd/ledger/), which is only updated in infrequent bulk batches.

![anthropic credited cves](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a3c7c43c8c832125.png)

My repo tracks every vulnerability attributable to Anthropic using CVE records, GHSAs, Linux kernel commits, and Anthropic's own ledger. I also manually audit advisories to catch CVEs that might otherwise get overlooked.

After seven months, I've tracked 442 CVEs attributable to Anthropic. That's an average of just 63 per month. Out of the 93,450 CVEs published this year, that's only about 0.5% of all CVEs.

For comparison, Anthropic's own public ledger lists just 217 fixed vulnerabilities, so I've tracked more than twice as many as Anthropic has disclosed itself.

## The Danger Narrative Isn't Adding Up

![Anthropic exploited vulnerabilties](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c8c97c852aa0ad68.png)

You may recall that Glasswing launched with the message that we'd entered the Mythos era of vulnerability discovery. But are these vulnerabilities actually useful to attackers? To find out, I've been tracking Anthropic-discovered CVEs against VulnCheck KEV. So far, only 2 of the 442 have been exploited in the wild, just 0.45%. (CVE-2026-61500 and CVE-2026-26980)

## Anthropic's Ledger Continues to Underwhelm

When Anthropic first launched its ledger in May, it reported 23,019 findings and a 90.8% true positive rate. As of its most recent update on November 2nd, there are 37,966 findings and just 217 fixes. That looks like a staggering failure to me, but let's take a closer look.

![Anthropic November Ledger Update](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2ca1271b624cdce9.png)

Of the 37,966 findings Anthropic reports, only 7,349 (19.4%) have been made public. Just 217 of those have been marked fixed. The more glaring number is that 4.4% (1,654) of the project's findings have already been marked as duplicates, 7.5x more duplicates than fixes. On top of that, 419 findings have been withdrawn. It seems odd that the ledger now claims a 94.2% true positive rate, up from 90.8% at launch, when more findings have been withdrawn or marked as duplicates than fixed, likely a feedback loop missing to the triage rates listed as “True Positives”.

The trend since my September update is even more telling:

|     | September 8 | November 2 | Change |
| --- | --- | --- | --- |
| Total findings | 26,153 | 37,966 | +11,813 |
| Made public | 2,736 (10.5%) | 7,349 (19.4%) | +4,613 |
| Fixed | 202 | 217 | +15 |
| Withdrawn | 245 | 419 | +174 |
| Duplicates | 2   | 1,670 | +1,668 |
| Claimed true positive rate | 91.4% | 94.2% | +2.8 pts |

In two months, Anthropic added nearly 12,000 findings and fixed just 15 more. Duplicates went from two to thousands, which is exactly what I warned about in September: the longer findings sit, the more likely someone else finds and fixes them first. I don't know how anyone can read these numbers as anything but damning.

You may also notice a correction in my visual. There appears to be a bug on Anthropic's ledger that inflates the number of findings marked as disclosed. Check for yourself using the "disclosed" filter.

## Anthropic's Pivot to OSS Scanner

Having humans triage every finding clearly didn't scale, and Anthropic has said as much. In its [OSS Scanner launch post](https://www.anthropic.com/research/launching-opt-in-vuln-finding-service-for-open-source) on October 8th, Anthropic said it had found more than 29,000 candidate vulnerabilities but had manually reviewed only about 6,000, and that it remains "bottlenecked on our human capacity to validate these findings." It had also already sent nearly 5,000 unverified reports to maintainers who asked for everything in bulk.

So with the Glasswing open source initiative hitting a wall, launching a self-service [OSS Scanner](https://github.com/anthropics/oss-scanner) that projects can opt into makes sense. Maintainers can now request a scan and triage the findings themselves. Anthropic is upfront that these reports are "fully model-generated, without human review or triage" and that "it is possible reports will be incorrect or invalid."

In other words, the triage bottleneck didn't go away. It moved to the maintainers. If the true positive rate is really as high as Anthropic claims, that shouldn't be a problem.

## curl Gives Anthropic's OSS Scanner a Reality Check

Three days ago, [Daniel Stenberg](https://www.linkedin.com/in/danielstenberg/), who maintains curl, [announced](https://www.linkedin.com/feed/update/urn:li:share:7524224297595269120/) that the project had received a batch of 45 vulnerability reports from Anthropic. Anthropic rated only one as medium severity and the rest as low. Daniel is moving them over to GitHub at a deliberate pace "to soften the impact for the team," with plans to have them all published by the end of the week. This gives us a rare look at what Anthropic's findings look like once a maintainer actually validates them.

Of the 34 reports published so far, 19 have been marked as not a vulnerability, 6 have been confirmed as low severity, and 9 are still awaiting assessment. That puts the false positive rate at 55.9% so far, and only 17.6% of findings have been confirmed, all of them low severity. That's a lot of work dumped on open source maintainers for a small handful of low-impact bugs, and when a maintainer has to pace reports just to protect his team, that says plenty about the burden.

![Curl Vulnerabilities](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f64710539c494bc0.png)

This also isn't new for curl. Back in May, Daniel [wrote](https://daniel.haxx.se/blog/2026/05/11/mythos-finds-a-curl-vulnerability/) that five Mythos findings boiled down to a single confirmed vulnerability.

It's a far cry from the 94.2% true positive rate Anthropic currently claims on its ledger. It also undercuts the "high- and critical-severity" framing Glasswing launched with. In September, I found that Claude rated 91.5% of ledger findings as critical or high, while maintainers rated only 51.3% that way. I'm curious whether other open source projects are seeing the same thing.

curl took a bold move by deciding to publish low and medium vulnerabilities findings publicly as issues for full transparency and we encourage other open source maintainers to follow their lead.

## Takeaways After Seven Months

AI is a valuable tool for finding vulnerabilities, and I'm not discounting that. But seven months in, the evidence still doesn't match the launch narrative. The CVEs are a sliver of this year's total, almost none are being exploited, fixes have stalled while duplicates and withdrawals pile up, and the triage burden is shifting onto the open source maintainers Glasswing promised to help. The receipts keep coming in. They still don't reconcile.

## About VulnCheck

VulnCheck is helping organizations not just to solve the vulnerability prioritization challenge - we’re working to help equip any product manager, CSIRT/PSIRT or SecOps team and Threat Hunting team to get faster and more accurate with infinite efficiency using VulnCheck solutions.

We knew that we needed better data, faster across the board, in our industry. So that’s what we deliver to the market. We’re going to continue to deliver key insights on vulnerability management, exploitation and major trends we can extrapolate from our dataset to continuously support practitioners.

Are you interested in learning more? If so, VulnCheck's [Exploit & Vulnerability Intelligence](https://vulncheck.com/product/exploit-intelligence) has broad threat actor coverage. Register and demo our data today.
