---
title: The fridge hack UK supermarkets narrowly avoided?
source: https://www.pentestpartners.com/security-blog/the-fridge-hack-uk-supermarkets-narrowly-avoided/
source_host: www.pentestpartners.com
clip_date: 2026-11-20T10:08:15+08:00
trace_id: 13f60078-a3bc-4db5-8850-8988c7d9a2ca
content_hash: e318fb6dc3d7fbf9989cd282e003a5915486767af4177383d534d10b89b5c7ad
status: synced
tags: []
series: null
feed_source: Pen Test Partners·IoT/硬件
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41e75244-d011-814d-9128-dc53431d105e
ioc: null
---

## TL;DR

-   UK supermarkets weren’t affected by the [Danfoss incident](https://www.pentestpartners.com/security-blog/you-dont-need-a-nation-state-to-warm-up-a-fridge/) as in France and elsewhere, as a different manufacturer is popular here.
-   These controllers, from a firm called RDM, have a related vulnerability, though not identical.
-   Multiple supermarkets, retailers and supply chain operators were exposed.
-   Huge efforts were made during November to ensure that refrigeration controllers in UK supermarkets were taken off the internet, or were already on private networks.
-   These efforts were kept very quiet to avoid alerting potential threat actors.

## Introduction

A significant vulnerability was found by Neil McCourt of Omega Solutions. Andrew Tierney of Pen Test Partners worked with Neil to validate his findings, discovering a number of additional vulnerabilities in the process.

Pen Test Partners, Omega Solutions, NCSC, RDM, the British Retail Consortium, DEFRA, the Food Standards Agency and others were involved in a mass effort to contact supermarkets and their supply chains, locate exposed controllers and mitigate the issue.

Significant efforts were made to address it in a very short space of time, resulting in teams at retailers working evenings and weekends.

The issue has been largely mitigated, though smaller cold chain operators may still be exposed.

The manufacturer, RDM, acted responsibly and have released new firmware that should address this and several other issues. The best course of action remains to take these controllers off the public internet.

We are not publishing exploits nor the method to discover the vulnerabilities at this time. Through some fortuitous decisions by RDM some time ago, these are harder to find than the Danfoss issues were. That buys time, not protection. Get the controllers off the public internet and apply the firmware update.

## How we helped UK supermarkets dodge a bullet

We have been asking ourselves why the UK supermarkets haven’t been targeted during the spate of supermarket chiller attacks.

There have been small incidents in small suppliers, but nothing widespread.

It’s well known that the French incident was a result of Danfoss refrigeration controllers being exposed to the public internet, mostly on cellular modems. Together with a back door account whose daily password algorithm was seeded from the date, it was only a matter of time before someone exploited the vulnerabilities disclosed by [Claroty in May](https://www.cisa.gov/news-events/ics-advisories/icsa-25-140-03) 2025.

The same vulnerabilities were exploited back in 2022, so it was only a matter of time.

## But why not the UK?

Then we had a breakthrough which explained everything, but also created a huge problem that threatened many of our supermarkets.

We had a call from Garry Turner and Neil McCourt at Omega Solutions. They specialise in fridge telemetry, among many things. They had been helping a UK retailer ensure their fridges weren’t exposed to similar issues to the Danfoss controllers.

Danfoss controllers aren’t particularly popular in the UK. The more popular controllers in the UK market are from a firm called RDM, short for Resource Data Management.

Neil had noticed something in the RDM controllers and wanted our help validating it and getting it addressed. He knew we had a lot of experience engaging with manufacturers and getting vulnerabilities fixed. Andrew Tierney and our hardware security team also found a whole load more vulnerabilities in the device.

And now a very large can of worms was opened…

We’ve seen an initial advisory from RDM to customers (RDM-SA-2026-001, 2 November, revised 3 November), but it was really quite weak. It failed for example to:

-   State what the vulnerability could allow an attacker to do
-   Provide independent validation that the proposed new firmware was secure and addressed the issue
-   Acknowledge and thank the source of the report
-   Provide any confirmation that users deeper down the supply chain had been alerted
-   Provide any detail of further efforts to uncover and fix other vulnerabilities in the firmware

We are also not aware of any attempt to alert NCSC, given the critical national infrastructure impact of the vulnerability.

Omega took it on themselves to alert NCSC, providing a much more comprehensive vulnerability report. Unfortunately, NCSC didn’t acknowledge receipt of this, but did issue an urgent alert through the various channels they have in to UK supermarkets.

Hence, PTP were asked by Omega to get involved.

We met with NCSC in person that afternoon to share our new findings and started taking action.

We also spoke to every supermarket security contact we knew to check whether they had received alerts.

Some had received the alert and discovered that some of their systems were exposed. Remediation actions were occurring at full speed.

Others had their RDM controllers on private networks or behind VPNs, so the exposure was significantly reduced.

We provided briefings to several supermarkets about the Omega and PTP findings.

In tandem, Andrew Tierney and our hardware team started working on the RDM controller firmware. We found a few additional significant vulnerabilities, which have also been reported directly to RDM. We hope to validate the fixes as soon as possible.

## Liaising with RDM, the manufacturer

Vulnerability disclosure had potential to be very challenging, but we got in touch with the CEO and CTO of RDM. Whilst their initial response to Omega was a little light on detail, once we had engaged direct, we found them open and responsive.

It was quite the opposite of most disclosure processes we have: the vendors are often combative and unhelpful. RDM by contrast had been working 24×7 to write new firmware and took our advice and guidance. It sounds that the business had been through a lot of change in the last couple of years, but a new more dynamic and effective dev team were now in place.

Other than the initial advisory and the existence of the vulnerability in the first place, we aren’t sure what more that they could have done. They even took it upon themselves to locate controllers installed by third parties and send advisories to their operators.

We have had ongoing dialogue with NCSC on the new RDM findings and several related findings in other technologies. They have been very helpful, finding contacts for us overseas to share critical threat intelligence with, and using their networks to share intel.

So, some UK supermarkets dodged a bullet as a result of great collaboration work between Neil, Omega Solutions, Andrew and the PTP team together with NCSC. The amount of work required by the supermarkets’ cyber teams should not be underestimated either – some good people had a lot of work to do at very short notice.

## There’s more

We have no idea how far down the supply chain that alerts have got to. We know that NCSC and BRC have been sharing intel, but the supply chain for chilled and frozen food is complex and extensive. Hence, we’re not yet sharing details of the vulnerabilities that we and Omega have found.

We successfully used Shodan to locate exposed controllers. Some of these provided useful location information, which we used to work out which organisation operated them. Using other open source data, we managed to contact the people responsible, brief them and have their controllers taken off the internet.

We managed to find and contact many of the significant operators out of the thousands of exposed controllers. After supermarkets, these were typically food manufacturers and operators of large cold storage warehouses. The remainder were impossible to identify without compromising the controller, which we weren’t prepared to do.

At this point, we determined the best method to alert the food supply chain after the efforts by us, NCSC, industry and others was to draw attention to it.

## Urgent actions

If you run RDM (or any refrigeration controller system) then please verify that it is not available from the public internet.

Common issues include use of cellular modems on the public internet. Use a VPN or private APN.

Then, apply the latest firmware from RDM, which should mitigate the most serious issues.
