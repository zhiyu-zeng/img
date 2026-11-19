---
title: Google Bug Hunters
source: https://bughunters.google.com/blog/thats-a-wrap-on-escal8-2026
source_host: bughunters.google.com
clip_date: 2026-11-19T10:36:18+08:00
trace_id: f7b01d4d-8688-4ba0-9eae-2d2759c5e832
content_hash: 571cef363266565c81431cf3bdf64fbef61c1d8a0194263813e094bac2dcd164
status: synced
tags: []
series: null
feed_source: Google Bug Hunters·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41d75244-d011-8170-b435-f48d9f8f2fb2
ioc: null
---

From **October 23–25, 2026**, Google’s flagship annual security conference, **ESCAL8**, touched down at **Google Singapore** (Mapletree Business City) for three high-intensity days of vulnerability research, competitive hacking, and technical education.

Since its inaugural gathering in 2017, ESCAL8 has served as Google’s marquee gathering uniting the global cybersecurity ecosystem. This year, more than 200 participants convened in Southeast Asia, including 50 of the world’s top bug hunters, 8 elite CTF squads, over 75 university students, and Google security engineers from across the globe.

Singapore provided the ideal backdrop for this year’s core theme: **Securing Autonomous AI & Agentic Systems**. Between late-night triage sessions fueled by laksa, satay, and chilli crab from Lau Pa Sat, attendees tackled the emerging threat landscape of autonomous systems head-on.

## ESCAL8 2026 at a Glance

| Program Track | Audience & Scale | Focus Areas & Highlights |
| --- | --- | --- |
| **bugSWAT** | 50 invited security researchers | Live-hacking event focused on selected VRP targets. |
| **Hackceler8** | 8 premier CTF teams (32 competitors overall) | Gamified, arcade-style esports CTF with custom hardware and AI-augmented challenges. |
| **init.g(singapore)** | 75 university students | Two days of workshops on agent security, web exploitation, modern crypto, and career development. |
| **Community & Culture** | 200+ attendees across all tracks | Offsite tracks at Gardens by the Bay, Hyperdrive, ArtScience Museum, and Lau Pa Sat. |

## bugSWAT: Live-Hacking and SAIF in Action

Google’s bugSWAT, together with [our VRPs](https://bughunters.google.com/about/rules/about-this-section), showcases an important cornerstone of Google's proactive approach to securing its products: collaboration with external researchers. Building on the success of our previous live-hacking event in Seoul earlier this year, the Singapore edition focused heavily on Google’s Secure AI Framework, also known as [SAIF](https://saif.google/).

As AI rapidly transitions from passive chat models into autonomous agents equipped with tool-use, persistent memory, and live execution environments, our researcher community stress-tested our latest AI attack surfaces.

This edition of bugSWAT featured **50 of the world's top bug hunters from 28 countries** for two days of intensive training, knowledge exchange, and live-hacking across many different targets. These targets were scoped to our Abuse VRP, AI VRP, Android VRP, Chrome VRP, Cloud VRP, and Google VRP.

We are incredibly proud of our researchers for their efforts. In the course of this event, we received **476 bug reports** (many of them high-impact) and have already rewarded **$692k+** (security engineers triaged and rewarded live on-site). This makes this edition of bugSWAT one of our most successful events to date, or as one of the participants put it:

> *“Frankly, it was a total blast, way beyond my expectations. I loved it.”*

We are especially thankful for our reward winners:

-   👑 [Leo Golovyrin](https://www.linkedin.com/in/leo-golovyrin/) – MVH (“Most Valuable Hacker”)
-   🥈 [Joseph Thacker (rez0)](http://x.com/rez0__) – 2nd place
-   🤖 [Adnan](https://adnanthekhan.com/) – for the most Ingenious report
-   🌩️ [Ciarán Cotter](https://x.com/monkehack) – for the best meme and top Chrome researcher
-   🦀 [inspector-ambitious](https://x.com/inspector_amb) – for the best meme
-   🌤 [lambdasawa](https://lambdasawa.page/) – for the best Cloud researcher
-   ✨ [Valentino Massaro](https://x.com/valent1nee) – for the top AI researcher
-   🚌 [ret2happy](https://x.com/ret2happy/) – for the top Abuse researcher
-   📱 James Wang (王睿扬) – for the top Android researcher

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2002095fe4392036.gif)

*Fig. 1. Scenes from bugSWAT*

## Hackceler8: The Google CTF Finals

The custom-built Hackceler8 arena brought high-octane, esports-style cybersecurity to the Google Singapore office. Eight premier CTF teams earned their spots based on previous editions and global rankings, going head-to-head in a three-day competitive showdown.

Hackceler8 is a fully gamified, spectator-friendly experience. This year's competition featured custom-built game environments requiring real-time reverse engineering, logic puzzle solving, and binary exploitation. It also introduced novel AI-augmented challenges designed to test AI-enabled hacking and automated reasoning under the clock. Spectators on-site and online followed the action via dynamic LED lighting, live tournament commentary, and real-time scoreboards hosted at hx8.dev.

Congratulations to all of our elite participating teams for delivering an electric on-stage performance. A special shout-out goes to BunkyoWesterns for claiming the ESCAL8 2026 Hackceler8 Championship, followed by DiceGang in second place, and Kalmarunionen and Maple Mallard Magistrates in a shared third place.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad82287eb5fa200b.gif)

Fig. 2. Highlights from Hackceler8

## init.g(singapore): Nurturing Future Cyber Defenders

Fostering a diverse, inclusive talent pipeline is essential to securing our collective digital future. Over the weekend, the Google Singapore Developer Space welcomed over 75 university students from across Singapore and the broader APAC region for init.g(singapore).

This two-day immersive workshop provided aspiring security engineers with direct mentorship from Google security specialists through hands-on technical sessions. The curriculum kicked off by taking a look at foundational security, but with an agentic spin, covering web application security, threat intelligence, and modern cryptography. The second day of the workshop included practical hands-on workshops and individual CV-coaching sessions. The event wrapped up with an inspiring career panel and ask-me-anything sessions, giving students the chance to learn how to grow their careers in Cybersecurity.

What the init.g() attendees had to say:

> *“A lot of insights which we would not have gained from university only.”*

> *“Listening and learning new things from the speakers, it made me realise there are so much more exciting things waiting for me to discover in the cyber security field.”*

> *“This was the best event I've been to in my life as a university student, I gained so much valuable insight and confidence.”*

> *“init.g was one of the most insightful and interactive cyber security programs I've experienced in Singapore, especially for people looking to start or pivot into security.”*

🎥 [Watch the aftermovie from init.g(singapore) 2026](https://youtu.be/5wcO_Vq86fM) *(also embedded at the end of this post)* to see the workshop in action.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df7f7b6eb75d9086.gif)

Fig. 3. Snapshots from init.g()

## Community and Exploring Singapore

ESCAL8 is as much about building community connections as it is about vulnerability research.

BugSWAT attendees had the opportunity to step away from their laptops and explore the Lion City during Friday’s Activity Day. Participants explored the futuristic biodomes of Gardens by the Bay, experienced immersive exhibits at the ArtScience Museum, and raced around the track at Hyperdrive—wrapping up the evening with a scenic rooftop dinner at Baia overlooking Marina Bay.

As a further highlight, we brought together all ESCAL8 attendees to savor local culinary favorites during a social dinner at Lau Pa Sat, Singapore's historic hawker centre. This event brought our researchers, students, and Googlers closer together, creating memories and partnerships that will extend far beyond the conference. You can find highlights and photos from the weekend by searching the #ESCAL8-2026 and [#initg](https://www.linkedin.com/search/results/content/?keywords=%23initg&origin=GLOBAL_SEARCH_HEADER) hashtags on social media ([example](https://x.com/GoogleVRP/status/2113782523218014513) from the GoogleVRP channel).

## Expanding Our Footprint: Join Google PSS in Singapore!

Singapore is a vital global engineering hub for Google. As we continue to scale our presence across APAC, our teams in Singapore are tackling some of the most critical challenges in modern computing—from proactive threat intelligence and enterprise defense to cryptography and autonomous agent safety architectures.

If you are passionate about defending billions of users and shaping the future of AI security, we are actively hiring! You can read Matthew Bilotti’s [article](https://www.linkedin.com/pulse/new-chapter-privacy-safety-security-singapore-matthew-bilotti-laxge/) on the new chapter for Privacy, Safety & Security in Singapore to learn more about our mission and the future of security in APAC. To view our current opportunities, please explore open security roles in Singapore at Google Careers via the [goo.gle/sg-pss](http://goo.gle/sg-pss) link.

## Thank You and See You Next Year!

A huge thank you to all the security researchers, CTF competitors, university students, Googlers, and event partners who made ESCAL8 2026 our most dynamic event yet. Your ingenuity, dedication, and partnership help keep billions of users safe every single day.

-
