---
title: Who Is aocr.org and Why Is It Reading My Blog?
source: https://blog.zsec.uk/aocr-org-referrer-bot/
source_host: blog.zsec.uk
clip_date: 2026-11-08T08:25:13+08:00
trace_id: e0e1d940-14cc-4fa1-b5d3-367fc8a79cee
content_hash: 3f4c1ff9a02973c1bfcf0eef27e05eec54ef25149515a39ab8cdc0a0dd5e0362
status: synced
tags: []
series: null
feed_source: zsec·逆向安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41275244-d011-8185-a890-fb95b8459626
ioc: null
---

![Who Is aocr.org and Why Is It Reading My Blog?](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d5ee34f1bae8dd4d.jpg)

A bit of a post out of the norm but a little investigation into some interesting behaviour I saw in my logs.

While tidying up `404` entries on this blog, I kept seeing one referrer in my nginx logs: `https://www.aocr.org/`. It was linked to old URLs that no longer exist, it hit dozens of posts, and it showed up in my analytics. A new site linking to my work would be nice, however upon further investigation the problem is that aocr.org is the **American Osteopathic College of Radiology**, and I'm fairly sure they aren't reading about Kerberoasting or NUC lab builds.

This post covers how I worked out what it was, what it costs a small site, and the one Cloudflare rule that deals with it. Ege Demir has already published an excellent deep dive on the same bot ([tin.computer: the aocr.org referrer bot](https://tin.computer/blog/aocr-org-referrer-bot?ref=blog.zsec.uk)), and I'll draw on it. Below are my own numbers from an independent vantage point, which line up closely with theirs.

## TL;DR

-   **What:** a headless Chrome crawler that sends a fake `Referer: https://www.aocr.org/` on every request. Nobody clicked a link.
-   **How it hides:** it uses a new proxy IP for almost every page (368 IPs for 1,524 requests), so per-IP rate limits, fail2ban and IP blocks never fire.
-   **Why it matters:** it runs your JavaScript, so it shows up in analytics as real readers or at least hides as one. On my worst day it made up about **20% of all page views**.
-   **Who:** the tin.computer research found its TLS/HTTP/2 fingerprint matches ByteDance's Bytespider. Who actually operates it is **not proven** but the fingerprints do match which is interesting.
-   **Fix:** one Cloudflare WAF custom rule on the referrer, set to Managed Challenge to block basically bot traffic.

## How it turned up

I was auditing 404s across the blog by cross-referencing 92 days of nginx logs against the sitemap, my analytics data and every internal link. Most 404s on any public site are scanner noise (`/wp/`, `/cms/`, `/two-factor-challenge/` and friends), so I only kept 404s that looked like real page slugs or had a real external referrer.

Two hits stood out: `/steelcon2023-workshop/` and `/csv-dangers-mitigations/4/`, both "referred" by `aocr.org`. They're old URLs and not linked anywhere recently but they're also *not related to each other at all*. The first is a page I've since moved, and the second looks like pagination from a previous version of the site. I thought it was pretty odd for a live link, and typical of a crawler working from a stale URL list (an archive, an old crawl, a dataset).

So I pulled every request with that referrer:

```bash
zcat -f /var/log/nginx/access.log* \
  | awk -F'"' '$4 ~ /aocr\.org/' > aocr.log
wc -l aocr.log                                   
awk '{print $1}' aocr.log | sort -u | wc -l      
awk -F'"' '{print $6}' aocr.log | sort | uniq -c
awk -F'"' '{print $4}' aocr.log | sort | uniq -c
```

## What the logs show

|     |     |
| --- | --- |
| Requests with the aocr.org referrer | **1,524** |
| First / last seen | 28 Sep 2026 → 7 Nov 2026 (my logs start 27 Sep, so it may be older) |
| By month | Sep 35 · Oct 273 · **Nov 1,216** (almost all on 5–7 Nov) |
| Distinct client IPs | **368** (all IPv4) |
| Distinct user agents | **1** |
| Distinct referrers | **1**: exactly `https://www.aocr.org/`, never a specific page |
| Posts crawled | **72** distinct posts, 210 page loads |

### One browser but seemingly hundreds of addresses

Every request used the same user agent:

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36
```

That's several major versions behind what my real visitors run. Meanwhile, the IPs barely ever repeated, of the 184 addresses that loaded an actual page, **161 loaded exactly one page and never came back**, 20 loaded two and 3 loaded three. That's the signature of a rotating proxy pool: every request leaves through a fresh exit, so no per-IP threshold ever trips.

The exits are a mix of hosting and what look like residential IPs or regular ISP consumer connections. Among the busiest:

-   **EGIHosting** (US), a host often resold as proxy capacity
-   **Television Internacional, S.A. de C.V.** (Mexico), cable broadband
-   **Coop. Entrerriana de Comunicaciones** (Argentina), a regional co-op ISP
-   **Link3 Technologies** (Bangladesh), an ISP
-   a RIPE-registered netblock (Netherlands)

A random sample of 25 exits came out as US 10, NL 7, FR 2, AU 2, and one each for TW, RO and IN. EGIHosting also appears in the tin.computer ASN breakdown, alongside Datacamp/CDN77, Web2Objects, M247 and others. A genuine link on a US medical association's site would bring a US-heavy crowd on ordinary connections, not this.

### It's a real browser, and it runs JavaScript

This was the most useful clue from everything, it is what pointed me at thinking it might have been playwright or headless chrome, of those 1,524 requests, only 210 were page loads. The rest were the side effects of a full browser rendering the page and running its scripts:

| Request type | Count |
| --- | --- |
| Ghost Portal/Content API calls (settings, tiers, newsletters) | 537 |
| Ghost Members API calls | 360 |
| Images and assets | 238 |
| Page loads | 210 |
| Analytics page-view beacons | 179 |

A plain scraper that only downloads HTML never touches `/members/api/` or fires an analytics beacon, however this one does, so it's driving a real (headless) Chrome. The `tin.computer` write-up referenced further up goes further, with session recordings that show a ~28-second wait and scroll per page, an 800×600 screen, `Asia/Shanghai` as the time zone, and browser timing fields named after ByteDance's internal resource loader.

### What it costs a small site

Load isn't the issue as I've got caching and things setup, so a few thousand requests over a few days is nothing. **Analytics is the annoying part** because the bot fires real page-view beacons, it gets counted as readers:

| Day | Bot beacons | All beacons | Share |
| --- | --- | --- | --- |
| 5 Nov | 81  | 415 | **~20%** |
| 6 Nov | 51  | 379 | ~13% |
| 7 Nov | 14  | 832 | ~2% |

On a site where "popular posts" and per-post view counters are driven by those numbers, a fifth of a day's views being fake skews the ranking. They also count against analytics API quotas.

The same user agent also appears about 2,800 more times in my logs with **no** referrer. I can't prove those are the same crawler, but the user-agent match, the timing and the lack of client hints make it likely. If so, the referrer is only the part that's easy to see.

## Who is behind it?

My data alone only gets as far as "an automated browser behind rotating proxies with a fixed fake referrer". The attribution comes from Ege Demir's research, which found:

-   **199 of 199** aocr.org-style requests matched Bytespider's network fingerprint on three separate signals (TLS ClientHello length, HTTP/2 priority, Accept header). Only 0.08% of other traffic matched.
-   The real machines appear to sit in **AS132510** (China Mobile, Shanxi), revealed through a WebRTC check, with only rented proxies visible to the target site.
-   Browser timing fields (`forestResFrom`, `forestResLoadStart`) that the author connects to ByteDance's "Forest" resource loader.

Their conclusion, and mine, is careful: **the fingerprint matches ByteDance's crawler, but who operates it isn't proven.** It could be a ByteDance team or a customer using their tooling. ByteDance had been asked for comment.

Why aocr.org in particular? I suspect it's arbitrary picked at random at some point. Some bot filters distrust requests with no referrer, and a real, reputable domain makes the traffic look organic thus tripping analytics.

![Who Is aocr.org and Why Is It Reading My Blog?](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4dc13c48ac7045f.png)

Who Is aocr.org and Why Is It Reading My Blog?

It isn't classic referrer spam either, where the spammer's own domain goes in the header so you'll visit it. The radiology college is almost certainly not involved.

## Blocking it

**IP blocking is pointless** because it appears to rotate IP each time. You'd be chasing a new address on every request, and some of those addresses belong to residential customers. My next thought was what about robots.txt but sadly that won't help either, because it doesn't identify itself as Bytespider. My existing Cloudflare rule that blocks declared AI crawlers by user agent (including Bytespider) never saw it and more importantly never blocked it.

What works is a Cloudflare WAF **custom rule** on the one thing it never varies:

```
(http.host eq "blog.zsec.uk" and http.referer contains "aocr.org")
```

Action: **Managed Challenge**. No genuine reader arrives from a radiology college to a red-teaming blog, and if one ever does, a challenge lets a human through where a block wouldn't.

The tin.computer post also suggests a fingerprint-based rule, which keeps working if the crawler ever drops the fake referrer:

```sql
any(http.request.headers["accept"][*] contains "image/heif,image/avif")
and not any(lower(http.request.headers.names[*])[*] == "sec-ch-ua")
```

That one is broader, so I haven't deployed it yet because I'd rather monitor for anything else that is sus. The free plan has no log-only mode to trial it against real traffic first. If you're on a plan with logging, run it in log mode before turning on the challenge.

### Testing gotcha: don't trust curl from your own box

After adding the rule, I tested it from the server:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -e 'https://www.aocr.org/' https://blog.zsec.uk/
# 200
```

Still 200 after several minutes, so was a request with a `GPTBot` user agent, which my existing rule definitely blocks. My origin server's IP is on the zone's IP Access allowlist (handy for health checks), and allowlisted IPs skip WAF custom rules entirely. If you've allowlisted your own infrastructure, testing from it tells you nothing.

The correct way to test is Cloudflare's **request tracer**. It simulates a request with whatever headers you like and shows which rules matched:

```bash
cf request-tracers traces create -z example.com --body '{
  "url": "https://blog.example.com/",
  "method": "GET",
  "headers": { "Referer": "https://www.aocr.org/" }
}'
```

With the aocr.org referrer, the trace showed my new rule matching with `managed_challenge`. With a Google referrer, no custom rule matched and the request carried on as normal. (The same thing is available in the dashboard under Trace.)

## Indicators

| Indicator | Value |
| --- | --- |
| Referer | `https://www.aocr.org/` (exactly, no path) |
| User-Agent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36` |
| Client hints | no `sec-ch-ua` headers (per tin.computer) |
| Behaviour | executes JS, fires analytics, ~1 page per IP, crawls stale URLs |
| Exit networks seen here | EGIHosting, Television Internacional (MX), Coop. Entrerriana (AR), Link3 (BD), others |
| Active here | 28 Sep → 7 Nov 2026, peak 5–7 Nov |

## Takeaways

1.  **Treat referrers as untrusted input.** They're a header anyone can set; A referrer that makes no sense for your audience is a lead worth chasing and something that piqued my interest.
2.  **Look at what a "visitor" requests, not just how many visits there are.** Members/Portal API calls and analytics beacons without any human-paced navigation are how you spot a headless browser in plain access logs.
3.  **Rotating proxies defeat IP-based defences by design** so with that said, develop matching on what the client can't or doesn't bother to vary: a header, a fingerprint, behaviour.

Thanks to Ege Demir for the original research. If you're seeing aocr.org in your own analytics, their post has filters for GA4, PostHog, Plausible, Umami and Fathom. Same bot, same tells.
