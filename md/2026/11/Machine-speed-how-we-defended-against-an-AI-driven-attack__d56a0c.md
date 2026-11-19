---
title: "Machine speed: how we defended against an AI-driven attack"
source: https://labs.eye.security/how-we-defended-against-an-ai-driven-attack/
source_host: labs.eye.security
clip_date: 2026-11-19T08:26:12+08:00
trace_id: 8bc9c496-fcb0-42b9-a5a9-d0f0bda1a66f
content_hash: ede4c92dea48b289b1d512a61821e620ce40d087c3187cc94a5b7629cfff366c
status: synced
tags: []
series: null
feed_source: Eye Research·漏洞研究/IR
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-81bc-bfef-f36735572788
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - artex.noog2infra.site
    - artex.ok7777.eu.cc
    - artex.tokena2b.top
    - artxdiag20261106artx.3vd1og.dnslog.cn
  tools: []
  techniques: []
---

The call came in late in the evening, and our incident response capacity for external cases was already fully engaged elsewhere. We normally would reject or refer a case in this situation, but this one was different. In an early stage, the victim company had already shared a crucial bit of information: the AI-driven attack was being conducted using [ARTEX](https://cert.europa.eu/blog/from-penetration-testing-to-cyber-threat-beware-of-artex), an autonomous LLM-driven pentesting framework. Given these factors, we decided to take the case anyway and hand it to our research team, with plenty of IR experience across the board, led by our CTO. We quickly executed our tried-and-trusted IR playbook, such as spinning up a tenant for our EDR, giving us visibility in the environment within the hour.

What is ARTEX?

ARTEX is an offensive security framework that threat-intelligence reports describe as AI-driven: language-model agents, paired with standard hacking tools, run a “pentest” with little human input. Each agent picks a target, tries an attack, reads the result and decides what to try next.  
What makes it powerful is not any single new exploit, but scale and speed. Many agents work in parallel and share what they find, so every secret one agent discovers is tried by others almost immediately, along every path it might open. When something fails (a rate limit, a firewall rule, a blocked user agent), the agents adapt and try again within minutes, day or night. Mostly they reuse well-known tools and techniques, so the power lies in combining them faster and more broadly than a human team can.

Now if you’re like us, we usually don’t take the hype at face value. Sure, we have learned that LLMs are very (we’d even go so far as to say *extremely*) useful tools, but the claims of the coming ‘AIpocalypse’ with regards to cybersecurity attacks at machine speed still seemed outlandish. Less than a day later, battling the second wave of the attack, we had become true believers. We will share what we have learned and come across in this series of blogs, hoping that others can benefit from our experience.

## Part 1, in which the agents moved in

While the intake happened late at night, our CTO reported that the customer had a capable crew with senior devs full of energy and expertise. For us, this means that we work on a different level: supporting where we can, while keeping full focus on the security of the environment. The timeline of events was partly filled in already: there had been initial access via a PHP shell. We hear you thinking: they should have patched [PHP2Shell](https://labs.eye.security/php2shell-our-assessment-of-the-risk-for-systems-running-php/)! However, the initial access arose from a vulnerable custom PHP upload function, occurring the same night as the intake. To us, this is already different from most IR cases. In those, we typically enter the environment after ransomware has been deployed. In these cases, the root cause is usually a breached VPN account or a vulnerability in a popular software, which made the news weeks or months before. This was different, as it was custom PHP that was exploited to yield a webshell, which was immediately used to pivot further into the environment.

The PHP shell already gave the attacker access to data they should not have. The attacker was clearly after money, but this was not a ransomware group: they went straight for anything that could be turned into cash. We do expect ransomware groups to fully embrace AI tools soon and are bracing ourselves for the incoming stampede of incidents (sadly, we’re not exaggerating). The PHP shell gave the attacker (or rather: the LLM agents) even more value, as it exposed environment variables with more secrets. Now, when humans find these, they’re typically excited, but first have to figure out where and how to use them. With LLMs however, the newly discovered secrets are almost immediately used in parallel attack paths. This is what makes it so hard to defend against, and what we consider true “machine speed”.

> “No human team can work through a rate limit, a block and a change of infrastructure in that amount of time, let alone in the middle of the night.”

To see what that looks like in practice, here’s an example. Among the stolen secrets were API keys for a certain platform. Minutes after the agents found them, the first call with a stolen key reached the API. Fifteen minutes later, the agents had written scripts to scrape the API in bulk. When the API’s rate limiter started refusing them, it took the agents about three minutes to write a new version that put a different client IP in a request header on every call, and the rate limiter stopped working. Another fifteen minutes later, they hit their peak: over 9,000 requests in a single minute. When that route was closed by defenders, they simply went direct, through a pool of more than 17,000 residential proxy addresses, and kept going for most of the morning. No human team can work through a rate limit, a block and a change of infrastructure in that amount of time, let alone in the middle of the night.

Using the obtained secrets, the army of agents got access to the cloud provider’s secret store, exposing even more secrets (do you see where this is heading?). The agents pivoted from the PHP uploads into the internal network using reGeorg (Neo-reGeorg, to be precise). Nothing special, you might say, as this tunnel has been a favourite of pentesters for years. What struck us was how quickly the agents adapted it: within minutes of downloading it from GitHub (yes, the pod had outbound internet access), they had modified it to keep its state in the internal cache server, so the tunnel kept working no matter which of the load-balanced pods answered. They then kept it open for most of the day, relaying it through about a dozen residential IPs in turn, each handover overlapping by a few minutes, good for hundreds of thousands of requests. Surprisingly, very little data came back through the tunnel; the data left through other routes. The tunnel only stopped when a block at the edge cut it off. In parallel, stemming from this part of the breach, access was acquired to the identity of an engineer, allowing access to a Git hosting service. The LLMs then did something that trained red team operators may do, but never this noisy: they changed the Git repo, causing the deployment automation to deploy a pod for the attacker on Kubernetes. It was obvious that this was driven by ARTEX, because everywhere in the environment, the LLMs left traces in artefacts and logs, such as `artx-pod` or `artx-probe-qa-1`. The agents left a long trail for us to follow, as they installed persistence and exfiltrated data immediately. They then pivoted even further into the environment in search of data, such as gift card codes, that would allow financial gains, adding backdoor admins into custom-built applications as they went on their way.

## Part 2, in which we fight fire with fire

After initial containment, by isolating the compromised cloud environment, we worked to get in control of the situation. The team started acquiring logs and installing EDR into as many parts of the network as possible. This quickly gave us much needed visibility into the compromised machines, and we could start to assess the scale of the compromise. Little did we know that the attacker had some nasty surprises for us in store.

As mentioned, it was easy to see that the attacker was using ARTEX to conduct this AI-driven attack. Not only due to the sheer volume and breadth of the attacks, but also the obvious tells in the names and probes it sent. This made the attacks very noisy and easy to identify on the side of the hosts. The network side, however, was a different story. The threat actor used residential proxies to hide their origin IP and blend in with normal traffic. We did manage to find an [IP address](https://otx.alienvault.com/pulse/6ae98f0cb5828718e357e71b) that tied this threat actor to publicly known reports, further strengthening the ARTEX connection and [financial motivations](https://www.cert-in.org.in/s2cMainServlet?VLCODE=CIAD-2026-0058&pageid=PUBVLNOTES02). The use of ARTEX has been publicly linked to [financially](https://www.cert-in.org.in/s2cMainServlet?VLCODE=CIAD-2026-0058&pageid=PUBVLNOTES02) [motivated](https://www.microsoft.com/en-us/security/blog/2026/11/06/artex-abuse-expands-as-cybercriminals-target-financial-sector/) [threat actors](https://research.checkpoint.com/2026/hacking-on-autopilot-inside-artex-cybercrime-campaigns/) abusing payment APIs. In the days since taking on this case, we’ve noticed more companies with activities related to gift cards being the victim of cyberattacks.

> “Defending at machine speed means defending with machines, and keeping people in charge of them”

Given the scale of the compromise, we decided it was necessary to use LLMs ourselves to assist in the case. The ARTEX framework derives a lot of its impact from the fact that agents cooperate. So we wanted, as defenders, to allow our agents to work together in an auditable and safe way. We landed on a shared, private Git repo, with custom instructions to the LLM agent to sync every finding via pull requests, give situation reports and keep raw logs out of the repo (a decision we later regretted, but more on that later). This worked quite well despite the limitations, as findings by one agent were used by other agents directly, synthesizing their answers using git commits and consolidated handoffs and reports. We gave our agents full autonomy to investigate, using read-only access. We didn’t just take their word for it, though: a hook in the repo checked every command an agent ran against the cloud environment and blocked anything that could change something, read a secret or print a token. When the access could not be scoped to read-only, we let the agents build a wrapper that would enforce read-only by blocking potential write calls. Every hunt in the EDR telemetry got its own folder with hashes, so we could show afterwards what was queried, when and by whom. However, not all the access was symmetric: for example, one teammate was given access to the cloud environment, which enabled their agent to ingest logs and hunt for the attacker directly. The agents of the others were not able to use the data for the source and had to rely on documentation produced, which sometimes drifted out of sync.

For example, one agent labelled a customer network address as “probably guest Wi-Fi”. A guess, written down as a finding. Other agents picked it up from the shared notes (so that part worked well!), and within a day the label had spread into five documents and a data request before a teammate’s agent, working from live data, showed it was a normal staff connection. The guardrails had their own blind spots too: the hook that kept our agents read-only towards the cloud once blocked an agent from editing a plain text note, simply because the text mentioned the name of a cloud command-line tool. It was annoying, but we’d rather err on the side of blocking. Interestingly, where we expected the agents to drown in noise, they were often the ones cutting through it. With EDR on the endpoints, we instructed our agent to perform hunts every 30 minutes. The “alerts” poured in: a laptop showing “ransomware” behaviour, persistence and credential-store access in the same hour; a developer’s machine with repeated “sensor tampering”. Each time, the agents walked the process tree and came back within minutes with an adjusted verdict: things like a Windows update causing a reboot, or the Linux subsystem on Windows causing anomalous behaviour. We found this very valuable, as that’s exactly the kind of triage that eats a human analyst’s night.

We are planning to address all of these issues and release a proof-of-concept at a later time, as we feel that handling these cases using LLMs is the only practical way forward. This may not be the first case of an LLM-led attack, but it won’t be the last one either!

## Part 3, in which machine speed became a reality

After a day of working on the case, both on our side and the customer, we had a meeting to discuss the next steps. With no alerts from the EDR, no activity from the attacker, and the secrets replaced as far as we knew at that point, we jointly decided to go ahead and go live again. Less than an hour later, we were back in full-blown incident mode as the attacker was back, with several critical severity alerts in the EDR. What the heck had happened?

> “When a responder deleted the attacker’s workloads, the deployment automation dutifully re-created them within a second; the automation works just as hard for the attacker.”

We suspect that the cause of the lull in attacker activity was simply because they ran out of tokens; reading through the OSINT reports, we knew our customer wasn’t the only target of this AI-driven attack. Whatever the cause, the attack started back up and the attacker still had access to the Git hosting service. The agents used that access to change the deployment. Because the deployment tooling automatically synchronizes from a Git-backed repo, this led to the deployment of a malicious privileged pod on one of the staging hosts. After gaining access, the attacker immediately pivoted to the host node using [the nsenter technique](https://dev.to/cod3mason/til-may-28-2025-5547#:~:text=Host%20Level%20Operation%20on%20K8S%20Node%20within%20a%20container). When a responder deleted the attacker’s workloads, the deployment automation dutifully re-created them within a second; the automation works just as hard for the attacker. In the meantime, with a key for the CI app taken from the secret store, the agents registered self-hosted runners and kept re-registering them every eight minutes throughout the night, possibly to snatch more secrets if a deployment used one of the poisoned runners.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/acb385c019a9f798.png)

Having witnessed this, we can only say one thing: we now understand true machine speed. It is noisy, it is detectable, but it’s also thorough and extremely fast, faster than humans can manually respond. This meant that we had one option left: containment through full isolation, a decision we do not take lightly. However, we needed the breathing room to assess the damage and the extent to which secrets needed to be rotated. Going live had to be postponed until we were back in control.

The same evening, we got a glimpse of how carefully the attacker’s agents prepared. The environment had file-transfer servers that business partners use to deliver orders, and the agents had taken the account passwords earlier in the day. Just before they came back for those servers, more than a hundred addresses opened bare connections to them within a couple of seconds, without even starting a login, many times the normal background noise. Two minutes later, the logins began, from addresses in that same set. We think that the agents checked their proxy list first and kept only the proxies that could actually reach the target. When we locked one account, the next attempt came from a different proxy within seconds, trying the next stolen account name. It is a small detail, but it shows that this was not random noise: the agents were planning, testing and adapting as they performed their duties.

> “Thirteen logins in under three minutes, one socket per login, as if working down a checklist of every known way out of a container.”

Once inside, the attacker’s agents tried to get out of the file-transfer server itself. Within a second or two of each login, the session asked the server to forward a local socket, and each time it was a different one: the container runtimes (Docker, containerd, CRI-O, and the variant used by lightweight Kubernetes distributions), the system and message buses, the PHP worker pool, the process supervisor and the SSH daemon itself. Thirteen logins in under three minutes, one socket per login, as if working down a checklist of every known way out of a container. The server refused every one of them. A human operator would have tried one or two, looked around, and then decided. The agents simply tried them all, at the same breakneck pace as the rest of their actions.

From here on out, we needed and were given more access: the CDN, the cloud platform and the identity providers (yes, two of them). We could now search at scale for traces that the attacker left behind, allowing us to plan the recovery.

## Part 4, in which there’s light at the end of the tunnel

Given our new level of access, we started drafting a plan. The infrastructure needed to be put behind Cloudflare so we could allow- or blocklist traffic at scale. All the stolen secrets needed to be rotated, but there were so many that we had to prioritize. Our top-tier LLM agent couldn’t do this effectively by itself, because even a stolen SSH public key was on the list. Instead, we used a hybrid approach: have our agents trawl the endless amount of logs, break them down into actionable items, and we’d sift through the list, deleting, amending or ticking off items, before handing the list over to the IT team.

In parallel, we also pointed LLM agents at the source code of ARTEX itself, and tried to come up with ways to disrupt the AI-driven attack. While the framework does not execute prompts from external data, there are ways to steer the “pentest” away from the infrastructure you are guarding. We implemented this on Cloudflare and when it was enabled, we saw the attacker moving away from production systems, towards (less critical) dev infra! More on this trick later, but we’re keeping it up our sleeves for now…

Putting everything behind a CDN only helps if the CDN’s rules hold. Prior to the incident, one zone had a strict “block everything” rule for the internal tools, with an exception so a payment provider could deliver its webhooks. The exception used the provider’s user agent string. The agents’ plain requests to the internal tools were blocked; three minutes later, the same requests came back with the payment provider’s user agent and went through because the user agent was exempted. From then on that string became their key to the internal tools, used thousands of times that afternoon. When we disabled the exception, the agents started trying other user agents (generic clients, a search-engine crawler, even a made-up test string) to see if anything else was trusted. Again, this shows how fast the army of AI agents learn and adapt.

And then, finally, after countless hours of rotating secrets, scouring logs and configuring Cloudflare, we were confident enough again to go live. Slowly but surely, the environment became reachable again. With all of the newly added security, both on Cloudflare and using our trusty EDR solution, we no longer saw the attacker successfully exploiting the systems and business was almost back to usual. Looking back, even though the incident response lasted mere days, we can confidently say that without the added tooling and LLM assistance, it would have taken weeks to rebuild and secure the environment. It really gave us a speed advantage.

Naturally, we also tried to stay one step ahead. The goal of the attacker was clear: anything that could be turned into money. The same group of companies runs a related business, and we predicted it to be the obvious next stop. It was on an environment that could not run EDR. Instead, we pulled its traffic history and its application audit log and went through them looking for the attacker. We found no sign of them, before or after the attack on our customer. Using LLMs, we mapped who really needs access to its admin and API paths (using historical network traffic), and drafted a tight allow-list for them, ready to switch on when the site moves behind the CDN. An autonomous attacker is fast, but it turns out it is also predictable: it goes where the value is. That gives defenders a rare chance to get there first, but only if you make the hard decision of switching everything off.

## Conclusion

Looking back, cutting through the noise caused by ARTEX, four things stood out to us.

**The first** is the gap between finding something and using it. A human attacker who finds a key has to stop and think. These agents didn’t: from stealing a credential to first use took mere minutes; a rate limiter or a WAF rule gave us about three minutes before the agents had adapted their approach.

**The second** is that these agents are *loud*. The agents left their name in pod names and probes, hammered endpoints no human would touch, and tripped detections on systems with EDR installed. Where we had visibility, we saw them immediately.

**The third** is breadth. The agents didn’t just pick the best path and stick to it: they tried *every* path, and *in parallel*, and kept every foothold they got: backdoor admin accounts, CI runners, malicious Git commits, SSH account credentials. Containment is no longer about finding *the* way in: it is now about finding *all* ways in.

**And finally**: equality of arms. We could only keep up because our own agents worked the logs in parallel, behind hard guardrails, with humans deciding what to act on. Defending at machine speed means defending with machines, and keeping people in charge of them.

Six months ago we would’ve called this science fiction. Now we have seen an AI-driven attack work in waves against a real company, over the course of several days. In the next parts of this series we’ll go deeper into how the agents behaved, how we steered them away from production, and the setup we used to fight back.

## Indicators of compromise

We share this (non-exhaustive) list of IOCs for defenders.

User Agents, especially if multiple are observed:

-   `Mozilla/5.0 (ARTEX)` – ARTEX agent driving webshells
-   `Mozilla/5.0 (compatible; ArtExVerify/1.0)` – Scripted check of whether a new WAF bypass works.
-   `Python-urllib/3.14`, `python-requests/2.34.2`
-   `Mozilla/5.0 (X11; Linux x86_64; rv:38.0) Gecko/20100101 Firefox/38.0` – Neo-reGeorg default UA on tunnel traffic

ARTEX infrastructure (OSINT):

-   `207.5.195[.]93` – VPS used to host ARTEX in similar attacks
-   `artex[.]lol`, `staging[.]artex[.]lol`, `artex[.]tokena2b[.]top`, `artex[.]ok7777[.]eu[.]cc`, `artex[.]noog2infra[.]site`
-   Container images `tomicdd/artex`, `congdonglinux/artex`

Callbacks and exfiltration:

-   \*.dnslog.cn (e.g. `artxdiag20261106artx.3vd1og.dnslog[.]cn`)
-   \*.oast.me
-   webhook.site

Webshell traits:

-   HTTP header `X-ARTX-KEY`, also accepted as parameter?k=
-   Response marker `### ARTX-AGENT`
-   Shell access key `k=x9f3c2b7e`

Marker strings (high value: the agents label their own work)

-   File and object prefixes:
    -   `artx_`, `artx-`, `ARTX` (e.g. `artx_s5.php`, `artx-pod`, `artx-label-probe`);
    -   `zzartx0000.php`;
-   Data markers: `ARTEX_WRITE_PROBE`, `ARTEX-PROBE-0001`, `ARTX_PERSIST_OK`, `artex_control_marker_zz9q`.
-   Control-404 probes: `zz-notexist-`, `zzq*`, `artx-nonexistent`, `artx2909-zzq7`, `zznotexist-*` wildcard subdomains.
-   Names of planted objects:
    -   backdoor admins named like QA or audit accounts (`qa_probe_*`, `qa.audit29a`);
    -   self-hosted GitHub runners named `sink-*`.
-   Git authors: [`artx@example.local`](mailto:artx@example.local), [`artx@example.com`](mailto:artx@example.com).

Behavioural indicators

-   Rapid switching of user agents to bypass WAF, fake user agents
-   Uploads become webshells: PHP uploads use extension fuzzing (.phtml/.php5/.php7/.phar/.inc/.PHP), followed by stored-XSS test files (.html/.svg/.js).
-   A new credential is used within minutes, in parallel paths. Example: a token sweep over 122 machine accounts with GET /api/v1/me.
-   Database file read. `LOAD DATA LOCAL INFILE` through phpMyAdmin into scratch databases named `artx_*`, and `INTO OUTFILE` write tests (`/tmp/x.php5`) followed by a probe through HTTP.

The post [Machine speed: how we defended against an AI-driven attack](https://labs.eye.security/how-we-defended-against-an-ai-driven-attack/) appeared first on [Eye Research](https://labs.eye.security/).
