---
title: Close search modal
source: https://unit42.paloaltonetworks.com/optimjack-supply-chain-attack/
source_host: unit42.paloaltonetworks.com
clip_date: 2026-11-19T09:06:54+08:00
trace_id: 41fd8457-1a08-4a10-8bf8-f1e55b10db1a
content_hash: 8c2837fee2b6f149cfcedcb3d0ea6613ace088520fabfc1f12b90c7bd1d079b3
status: synced
tags: []
series: null
feed_source: Unit 42
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8127-8290-f138a34e6e39
ioc: null
---

## Introduction

On Nov. 16, 2026, a threat actor exploited a vulnerability in Optimizely's Web Experimentation platform to inject malicious JavaScript into customer accounts. Nicknamed OPTIMJACK, this campaign delivered that code to visitors of at least 178 organizations' websites.

The tampered code was delivered directly from the vendor's legitimate content delivery network (CDN), under the vendor's own security certificate.

Enterprises invest heavily in hardening their core web infrastructure. A single compromised third-party tool can undermine that work. OPTIMJACK is a reminder that any vendor script with dynamic execution privileges on your site is part of your direct production code.

Threat actors know that third-party apps are the path of least resistance into lucrative environments. Defenders can respond with a fundamental principle that security engineering has relied on from the beginning: segmentation.

## What Happened in OPTIMJACK

On Nov. 16th, 2026, the attacker exploited the vulnerability to place malicious JavaScript in the custom Project JavaScript field of customer accounts.

Because the tampered snippets were served from the vendor's legitimate CDN under its own certificate, at least 178 organizations, including well-known media, technology and financial services brands, unknowingly served the code to their visitors.

Once the code loaded in a visitor's browser, it did three things:

-   **Cryptocurrency wallet swapping:** It replaced wallet addresses that visitors copied with the attacker's own
-   **Payment card skimming:** It collected card details from checkout forms
-   **Mobile exploit delivery:** It attempted to deliver the Coruna and DarkSword exploit kits to iPhones and iPads

Optimizely patched the flaw, removed the injected code and secured affected accounts early on November 17.

## Trusted Vendors Are the Path of Least Resistance

Websites are not a single monolith. They are dynamic assemblies of dozens of third-party scripts, analytics tags and optimization tools.

That diversity drives speed, but it also introduces new vectors of attack through the software supply chain. When attackers compromise a single trusted vendor upstream, they bypass the perimeter defenses that vendor's customers have built.

The choice of malicious payload also matters. Swapping valid cryptocurrency wallet addresses on a page is a quick and persistent way to direct ill-gotten payments to a threat actor.

## Segmentation Is the Strongest Step Available Today

If a third-party script executes on your page, it effectively has the same privileges as your own developers. Organizations need to architect their sites with that assumption in mind.

The best thing security teams can do right now is apply strict segmentation. The goal is simple— a compromised vendor script should never be able to touch sensitive user inputs. Methods of accomplishing this goal include:

-   **Remove non-essential tags from sensitive pages:** Strip all non-essential marketing, experimentation and analytics tags from authentication and checkout pages
-   **Isolate payment collection:** Place payment collection inside hardened, cross-origin iframes

Segmentation has been a cornerstone of good security engineering since the beginning.

## What Affected Organizations Should Know

Even with the flaw patched, affected websites still need to act. Security teams should take these steps now:

-   Audit all project modifications made while the malicious code was available
-   Double-check all code that may have been altered during that period
-   Treat exposed payment data as potentially compromised, including payment card details entered into checkout forms on affected pages

## Conclusion

OPTIMJACK is a reminder that any vendor script with dynamic execution privileges on your site is part of your direct production code. One vulnerability at a single vendor allowed an attacker to reach visitors of at least 178 organizations through a trusted, legitimate delivery channel.

Third-party scripts drive speed, but when they execute on your page, they effectively have the same privileges as your own developers.

Administrators of affected websites should start with the cleanup steps above. These segmentation steps will help keep a compromised vendor script away from sensitive user inputs. Isolating and segmenting as much as possible is key to software supply chain security management.

The [Unit 42 Compromise Assessment](https://www.paloaltonetworks.ca/unit42/strengthen-your-defenses/compromise-assessment) can help you proactively search for historical and ongoing indicators of compromise to discover if, how, and why previously undetected malicious activity is occurring so that you can respond before further damage occurs.

### Contact Us

If you are experiencing an active breach or think you may have been impacted by a cybersecurity incident, [contact Unit 42](https://start.paloaltonetworks.com/contact-unit42.html) to connect with a team member. The Unit 42 incident response team is available 24/7/365. If you have cyber insurance or legal counsel, you can request Unit 42 by name. You can also take preventative steps by requesting a [Proactive Assessment](https://www.paloaltonetworks.com/unit42/proactive-assessments) and putting our team on speed dial with a [Unit 42 Retainer](https://origin-www.paloaltonetworks.com/resources/datasheets/unit42-retainer).

[Threat Research Center](https://unit42.paloaltonetworks.com/ "Threat Research") [Next: QUIC and Covert: Novel HTTP/3-Powered RATs Target Southeast Asian Governments](https://unit42.paloaltonetworks.com/custom-rats-target-southeast-asia-governments/ "QUIC and Covert: Novel HTTP/3-Powered RATs Target Southeast Asian Governments")
