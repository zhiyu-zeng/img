---
title: "Inside the loop: Five AI attack frameworks that never ask permission"
source: https://www.elastic.co/security-labs/threat-command/agentic-offensive-frameworks-detection-artex
source_host: www.elastic.co
clip_date: 2026-11-18T10:02:34+08:00
trace_id: f66496e9-8283-4b79-925b-15dcb699ae5c
content_hash: bff4d52f0b386ab4752935b472c8fbafa6ce888ff7b88d71d4155d84449ead30
status: synced
tags: []
series: null
feed_source: Elastic Security Labs
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41c75244-d011-8115-b381-ef498cf385b8
ioc: null
---

Five agentic offensive frameworks install with a single script or Compose file and have drawn more than 60,000 GitHub stars between them: ARTEX, CyberStrikeAI, Cairn, PentAGI, and HexStrike. All five have already turned up in intrusions rather than only in red team engagements. Google Threat Intelligence Group (GTIG) and Mandiant have observed [ARTEX, Cairn, HexStrike, and PentAGI in incident response engagements](https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks), and Microsoft has [attributed ARTEX use to Storm-0940](https://www.microsoft.com/en-us/security/blog/2026/10/21/storm-0940-uses-artex-agentic-ai-connectwise-supply-chain-compromise/). We traced an AI-assisted AWS intrusion to a CyberStrikeAI server in [One CyberStrikeAI Server, Eight AWS Identities](https://www.elastic.co/security-labs/cyberstrikeai-server-aws-cloud-intrusion).

An agentic offensive framework puts a large language model (LLM) in charge of the scanners, curl, shells, and cloud CLIs that red teams and threat actors already use. The tools are familiar, but the loop around them is new: a model plans each step, splits the work across agents, builds or installs what it lacks, and in ARTEX’s case moves on in bursts of two to 25 seconds. We read the source of all five, alongside the public incident reporting, to work out what reaches a defender’s telemetry when one of them runs. None of them enforces authorization in code, and every action they take still has to land in telemetry you already collect.

## Key takeaways

-   Agentic frameworks such as ARTEX work in bursts of seconds, so the detections trusted to start containment have to be chosen before an incident begins.
    
-   None of the five frameworks enforces authorization in code by default. Three assert it in the prompt, and the only target restrictions active by default are blocklists for government and education domains.
    
-   The frameworks are loud by default and, in ARTEX and CyberStrikeAI, change route when blocked. They also change faster than signatures, but their actions do not. Every action that touches your environment reaches defenders as a process, a web request, an API call, or a sign-in, so detections anchored on behavior outlast those anchored on a source address, a User-Agent, or a framework's fingerprint.
    

## How agentic offensive frameworks differ from Traditional C2 Frameworks

[Cobalt Strike](https://attack.mitre.org/software/S0154/) and [Brute Ratel C4](https://attack.mitre.org/software/S1063/) put a human operator behind an implant, deciding what to run next. Agentic frameworks keep the tools and replace the operator's think time with a planning loop. GTIG observed ARTEX execution bursts of roughly two to 25 seconds, while NorForge, tracking exposed Cairn panels it assessed as malicious, found that one actor cluster's successful projects took [just under 23 hours on average](https://norforge.com/blog/inside_cairn) from start to goal. Individual bursts fit within a short detection window, but operations can run for hours, so connecting bursts into one operation requires a long lookback.

The agents and most of the tooling usually run on infrastructure the attacker controls, calling a hosted or self-run model. What reaches your environment is what the tools do to it, recorded as new processes on your hosts, API calls in your cloud audit logs, and sign-ins.

![Diagram of an agentic offensive framework loop reaching defender endpoint, cloud audit and identity telemetry](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00085f5941271900.png)

## ARTEX, CyberStrikeAI, Cairn, PentAGI and HexStrike compared

The five frameworks share the same loop but differ in where the model runs and what starts each tool.

![Process lineage for ARTEX, CyberStrikeAI, HexStrike, Cairn and PentAGI starting nmap, by framework or container](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d292ded46a253af.png) ![Design and safeguards in ARTEX, CyberStrikeAI, Cairn, PentAGI and HexStrike: approval, authorization, targets](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/447bf4d9c248f982.png)

Autonomy is the default. CyberStrikeAI ships with approval mode off, PentAGI's Compose file sets ASK_USER to false, Cairn [launches two of its three coding-agent worker types with their approval prompts disabled](https://github.com/oritera/Cairn/blob/8e7e0ea67552383851dfcabfba0c4e9c8d007878/cairn/src/cairn/dispatcher/workers/adapters/claudecode.py#L38-L61), and ARTEX runs its agents in a bypass permission mode, so none of the four waits for human approval by default.

Beyond the shared loop, each framework makes a distinctive design choice.

-   [ARTEX](https://github.com/BaaRai/ARTEX) pairs an event-driven planner with parallel workers and keeps the human to a chat agent that observes progress and steers by hints. Its bundled browser extension records an operator's authenticated session, with captchas and one-time codes solved once, and hands those requests to the agents as evidence. We reviewed a public English-translated copy of the original repository.
    
-   [CyberStrikeAI](https://github.com/AIPentest/CyberStrikeAI) is a complete operator console. It builds its own implants, runs C2 listeners and a WebShell manager, and connects to chat platforms such as Telegram, Slack, Discord, and DingTalk.
    
-   [Cairn](https://github.com/oritera/Cairn) delegates the work to existing coding agents. Its workers are command-line tools running inside Kali containers, and its README describes its debut in an AI penetration testing competition.
    
-   [PentAGI](https://github.com/vxcontrol/pentagi) keeps its agents moving with a reflector agent. When an agent hesitates or answers in prose instead of acting, the reflector replies in the user's voice, and the exchange is recorded as a human message.
    
-   [HexStrike](https://github.com/0x4m4/hexstrike-ai) has no model of its own. It exposes about 150 tool functions through the Model Context Protocol (MCP) to whatever AI assistant the operator already uses.
    

What each framework ships differs as well. CyberStrikeAI builds its own implants, and three of the five bundle cloud tooling, which puts cloud accounts within reach as readily as hosts.

![Shipped defaults in ARTEX, CyberStrikeAI, Cairn, PentAGI and HexStrike: C2, shells, cloud tooling, browser](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9652ff8e3d0a26c.png)

## What agentic offensive frameworks change for detection and response

![What agentic offensive frameworks change for detection and response, and what still works for defenders](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be40f54d22df7b17.png)

### Agentic attacks land effects in seconds

Within a burst, an agentic loop issues steps seconds apart, and each step takes effect as soon as it is sent. At that pace, the decisions that matter are made before an incident begins, starting with which detections are trusted to start containment automatically.

### Do agentic offensive frameworks check authorization?

Like conventional offensive tools, none of the five frameworks enforces authorization in code by default. Three of them go further and tell the model it is authorized. CyberStrikeAI tells its model that authorization was settled in advance and that it should never question it or wait for approval, PentAGI opens nine of its role prompts with a pre-authorization block, and ARTEX describes each agent as part of an authorized penetration testing system. Cairn instructs its workers never to reject a task, and when a model refuses anyway, its dispatcher sidelines that worker for five seconds and hands the task to another configured worker, or retries the same one if it is the only worker.

The only target restrictions active by default are blocklists for government domains in ARTEX and CyberStrikeAI, and for education domains in ARTEX. Beyond those blocklists, the safeguards that ship are narrow:

-   **ARTEX** blocks destructive commands such as `rm -rf` and `mkfs`, and can check a task’s assets against an allow list the operator writes, which is empty by default. A shell command can still reach any host.
    
-   **ARTEX’s** rules-of-engagement scope mechanism was removed, its [source notes](https://github.com/BaaRai/ARTEX/blob/e6e9b2f9787d42c00d85a3dc1ba9eb87a12252f2/guard/guard.go#L4) and assets its workers record are added to the task’s scope automatically.
    
-   **HexStrike** accepts an out-of-scope list and never consults it.
    

ARTEX [labels its own blocks as platform controls](https://github.com/BaaRai/ARTEX/blob/e6e9b2f9787d42c00d85a3dc1ba9eb87a12252f2/guard/guard.go#L125-L141) because a bare denial reads to an agent like a target's defense to bypass. A model provider's refusal is not a control defenders can rely on, because a framework can route around it, as Cairn's dispatcher can.

### How agentic offensive frameworks respond when you block them

As shipped, the five frameworks default to capability, autonomy, and speed. Their scanners run with stock settings, several defaults name the framework outright, and CyberStrikeAI's implant checks in every five seconds with no jitter. Stealth ships as skills the model can load. CyberStrikeAI's operational security skill covers rate limits, IP-ban workarounds, and anti-forensics.

The change comes when ARTEX or CyberStrikeAI is blocked. ARTEX tells its workers that a filtered payload or a 404 does not exhaust an intent, and GTIG, relaying Wiz Research's findings on a campaign it tracks as UNC7228, reports that the actor fell back to open proxies when its initial infrastructure was blocked. CyberStrikeAI's skills tell the agent to answer a block by switching proxies, User-Agents, and forwarding headers, falling back to free proxies in the target's own country and then Tor. After a block, expect the same requests to return from new addresses and User-Agents, so detections that key on what is requested hold up better than those keyed on source address. A block on the source address leaves the framework's access in place, so it should be paired with revoking the credentials the framework was using.

### Why IOC-based detections go stale on agentic frameworks

Agentic offensive frameworks move quickly. ARTEX's developers logged about 390 commits, more than 450 counting merges, in the ten and a half weeks from July 26 to October 7, 2026, and after its creator [took the original repository down in October 2026](https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks), public forks carried it on. CyberStrikeAI logged more than 2,400 commits in its first year, and several of the frameworks write or install new tools in the middle of a task. The strings, file names, and defaults that identify a framework today can disappear in its next release, while the behaviors it depends on, such as credential access, remote execution, and offensive tools started by a service, stay the same, so detections anchored on behavior age more slowly than those anchored on a framework's fingerprint.

### Why revoking credentials does not stop an agent immediately

[AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html) and [Google](https://docs.cloud.google.com/iam/docs/access-change-propagation) each document a propagation delay for access changes, and in Entra ID an access token issued before a user or service principal is deleted or disabled generally stays valid until it expires, typically 60 to 90 minutes, unless the resource and client support [continuous access evaluation](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation), which Microsoft documents for Exchange, Teams, and SharePoint and, [for service principals, only Microsoft Graph](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation-workload). An acknowledged revocation may not stop the next request, and an agent operating at machine speed can act within that gap. AWS's role-session revocation also leaves IAM users' long-term keys alone and does not block sessions requested after its cutoff, so pair it with removing whatever can still assume the role.

## How to detect agentic offensive frameworks

### Detecting agentic tempo and sequence per identity

Behavioral rules are the foundation, and the reach of the tooling sets how broad they need to be. [GTIG's catalog of ARTEX tradecraft](https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks) includes SQL injection, Kerberoasting, and mapping of Azure and AWS permissions. Agentic tempo adds two signals that emerge between individual events.

-   Tempo per identity. Count distinct sensitive actions per identity and issuing role in short windows, so a burst stands out even when every action in it is routine.
    
-   Sequence across sessions. Join discovery, secret access, and remote execution under the issuing role or source address to link activity from several sessions into one operation.
    

[Higher-order detection rules](https://www.elastic.co/security-labs/blog/higher-order-detection-rules) apply the same logic to alerts, correlating related alerts that share a host, user, or address into a higher-confidence finding, because each added signal makes a benign explanation less likely. We expect more signals like these to emerge as the frameworks change.

### An ES|QL hunt for tool-family bursts

A loop works through its toolbox as the task demands, so one source address can use curl, a Python client, a browser User-Agent, and an AWS client within the same minute. The ES|QL hunt below normalizes User-Agents into tool families, counts families and requests per source address in one-minute windows, and returns windows with at least three families and a burst of requests. Because the loop runs on infrastructure the attacker controls, the hunt reads the logs that record its requests, such as web server, proxy, and cloud audit logs (point the index pattern at those sources), and it excludes private, loopback, link-local, carrier-grade NAT, and multicast source ranges.

![ES|QL hunt result: one source IP using python, aws and curl tool families in a single minute, 25 requests](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/300ccb180a27011d.png)

Build systems, monitoring scripts, administrators working from the AWS CLI, and shared NAT or proxy addresses can also mix these clients, so baseline that automation and tune the thresholds of three families and 20 requests per minute before alerting on the results. The hunt keys on how many kinds of client one address uses in a minute, so it does not depend on any single string, but a framework that returns from a new address starts a new window. The family list can also take the framework User-Agents in the table below, and norma\* already covers the norma/0.4 that ARTEX's web fetch tool sends.

### What to watch for in ARTEX, CyberStrikeAI, Cairn, PentAGI and HexStrike

These defaults appear on the systems under attack and, where noted, on a host you monitor. They are worth hunting for today, though any of them can change in the next release.

***Framework***

***What to watch for***

*ARTEX*

*Traffic from the scanners it ships, such as nuclei, httpx, katana, ffuf, and sqlmap,* which three parallel workers per task run by default, *requests with the User-Agent artex-enrich/1.0 or norma/0.4, and new accounts registered on your applications followed by sign-ins from several sessions, because its agents register and share their own test accounts.*

*CyberStrikeAI*

*Webshell requests that* [*carry the User-Agent*](https://github.com/AIPentest/CyberStrikeAI/blob/557f74d747bf622eda2ea74d84bee0894d476ebf/internal/handler/webshell.go#L799) *Mozilla/5.0 (compatible; CyberStrikeAI-WebShell/1.0) and a pass form field, a web server process running echo:OSPROBE\_%OS%:END, and implant persistence named SystemUpdate (a scheduled task or Run key) or com.apple.systemupdate (a LaunchAgent), a* .bashrc line ending in # cs, or an @reboot cron entry that launches the implant binary and carries no marker of its own.

*Cairn*

*Reverse shells and out-of-band callbacks to the operator host's own address, because its example configuration runs worker containers on the host's network. Where it runs on a host you monitor, two of its three worker adapters start their coding-agent command-line tools with approval prompts disabled and the full task prompt in the command line.*

*PentAGI*

*Connections from compromised hosts to* [*TCP ports 28000 to 29999*](https://github.com/vxcontrol/pentagi/blob/cffed9485aa1cca70762cd08a57ac62a80406258/backend/pkg/docker/client.go#L121-L130) *on the PentAGI host (two per engagement by default), and each page it browses requested twice at once, once for content and once for a screenshot. An installation on your network also reports to update.pentagi.com every three hours.*

*HexStrike*

*The User-Agents* [*HexStrike-HTTP-Framework/1.0*](https://github.com/0x4m4/hexstrike-ai/blob/d689933ff579d839c676c82b231f8e98326c5f04/hexstrike_server.py#L13287) *and* [*HexStrike-BrowserAgent/1.0*](https://github.com/0x4m4/hexstrike-ai/blob/d689933ff579d839c676c82b231f8e98326c5f04/hexstrike_server.py#L13644) *and, when the browser agent's active tests run, the cross-site scripting marker <hexstrikeXSSTest123>. Where it runs on a host you monitor, a Python server listens on port 8888 by default on all interfaces and starts security tools through a shell, so a tool can show the Python server as its parent.*

Beyond these defaults, the scanners run with stock settings, so on the network the frameworks largely resemble the tools they drive.

## How to defend against agentic offensive frameworks

1.  Decide in advance which high-confidence detections start containment. Connect them to [automated response actions](https://www.elastic.co/docs/solutions/security/endpoint-response-actions/automated-response-actions) on endpoints and to [Elastic Workflows](https://www.elastic.co/docs/explore-analyze/workflows) to orchestrate the response, including calls to your own automation for cloud steps such as deactivating an access key or revoking a role's active sessions.
    
2.  Combine any block on a source address with revoking the identity's sessions and tokens, because these frameworks return from new addresses, then confirm that the next request fails.
    
3.  Measure tempo and sequence per identity over windows long enough to connect bursts, and baseline the automation that already behaves like an agent.
    
4.  Scope assumed roles and app-only identities to the actions they need, because an agent inherits everything the identity allows.
    
5.  Remove secrets from the places an agent can read, such as file shares, wikis, code repositories, and CI/CD variables, rotate any that were exposed, and prefer short-lived credentials. [GTIG reports](https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks) that operators hand ARTEX compromised credentials and that it harvests more through Kerberoasting, SQL injection, and DCSync, so each exposed secret lets an operation reach another platform and makes containment harder.
    
6.  Act on threat intelligence about framework infrastructure. [GTIG reports](https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks) ARTEX and PentAGI used against multiple organizations, and [exposed consoles such as Cairn's](https://norforge.com/blog/inside_cairn) can be enumerated from the internet, so intelligence on their infrastructure is an early chance to block an intrusion. Block those addresses at the perimeter or proxy, and feed the same intelligence into Elastic's threat intelligence integrations so the prebuilt Threat Intel IP Address Indicator Match rule flags traffic to and from known consoles and C2 servers. [Build an enrichment workflow](https://www.elastic.co/docs/explore-analyze/workflows/use-cases/security/automate-security-operations/enrich-alert-with-threat-intel), triggered by the alert, that runs a reputation lookup on the matched address. Consoles can sit behind shared hosting or CDN addresses, so the lookup helps separate a dedicated server from a shared address before a match drives a block, and behavioral detections still cover the infrastructure that changes.
    

## Open questions about agentic offensive frameworks

These are worth answering now, before the next releases change the answers.

-   What changes when the agent extends itself? ARTEX's operator assistant can create new tools, MCP servers, and skills, and PentAGI keeps the code it writes in a store shared across engagements. A tool written for one target has no history to match, which favors detections on behavior and parentage over tool names.
    
-   Is the advantage pace or adaptation? Scripts can match an agent's pace, so the more meaningful test is how quickly a new finding or an unfamiliar error becomes a new action.
    
-   How many actors is a multi-agent run? ARTEX runs a planner and parallel workers under one task. Several sessions or agent names can look like several actors, but the identity and controller behind them is the unit that matters.
    

## Conclusion: What this means for detection and response

Agentic offensive frameworks amount to a new kind of operator, a loop that plans, coordinates agents, extends its own tools, and moves at a tempo that changes what detection and response have to do. None of the five enforces authorization in code by default, which leaves defender telemetry and controls as the real boundary.

This analysis covers five frameworks, and more deserve tracking. Gambit Security [reported](https://gambit.security/blog-posts/autonomous-ai-agents-online-retailers-25-a-company) a criminal campaign that used [Strix](https://github.com/usestrix/strix) for vulnerability discovery, [Cairn](https://github.com/oritera/Cairn) for exploitation, and the general-purpose agent Hermes as its control console. Other open-source projects that use models for penetration testing include [Shannon](https://github.com/KeygraphHQ/shannon), [PentestGPT](https://github.com/GreyDGL/PentestGPT), [CAI](https://github.com/aliasrobotics/CAI) (now archived), [CyberStrike](https://github.com/CyberStrikeus/cyberstrike) (not CyberStrikeAI), [RedAmon](https://github.com/samugit83/redamon), [PentestAgent](https://github.com/GH05TCREW/pentestagent), [hackingBuddyGPT](https://github.com/IPA-Lab/HackingBuddyGPT), [Nebula](https://github.com/BerylliumSec/nebula), and [BugTraceAI](https://github.com/BugTraceAI/BugTraceAI). New ones will keep appearing, so track each by how it plans, what starts its tools, and what it leaves for defenders to see.

Elastic's behavioral rules key on the actions these frameworks take, such as credential access and remote execution, rather than on the framework or the model, and LLM-based triage rules can roll related alerts on one user or host into a single verdict. Elastic keeps adding AI-focused protections, and its rules are published in the open [detection-rules](https://github.com/elastic/detection-rules) and [protections-artifacts](https://github.com/elastic/protections-artifacts) repositories. Add tempo and sequence analysis per identity, confirm that revocation took effect, and contain through automated response actions and Elastic Workflows, so the response is decided before the operation starts.

## References

The following were referenced throughout the above research:

-   [https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks](https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks)
    
-   [https://www.microsoft.com/en-us/security/blog/2026/10/21/storm-0940-uses-artex-agentic-ai-connectwise-supply-chain-compromise/](https://www.microsoft.com/en-us/security/blog/2026/10/21/storm-0940-uses-artex-agentic-ai-connectwise-supply-chain-compromise/)
    
-   [https://www.elastic.co/security-labs/cyberstrikeai-server-aws-cloud-intrusion](https://www.elastic.co/security-labs/cyberstrikeai-server-aws-cloud-intrusion)
    
-   [https://www.elastic.co/security-labs/blog/higher-order-detection-rules](https://www.elastic.co/security-labs/blog/higher-order-detection-rules)
    
-   [https://norforge.com/blog/inside_cairn](https://norforge.com/blog/inside_cairn)
    
-   [https://attack.mitre.org/software/S0154/](https://attack.mitre.org/software/S0154/)
    
-   [https://attack.mitre.org/software/S1063/](https://attack.mitre.org/software/S1063/)
    
-   [https://github.com/BaaRai/ARTEX](https://github.com/BaaRai/ARTEX)
    
-   [https://github.com/AIPentest/CyberStrikeAI](https://github.com/AIPentest/CyberStrikeAI)
    
-   [https://github.com/oritera/Cairn](https://github.com/oritera/Cairn)
    
-   [https://github.com/vxcontrol/pentagi](https://github.com/vxcontrol/pentagi)
    
-   [https://github.com/0x4m4/hexstrike-ai](https://github.com/0x4m4/hexstrike-ai)
    
-   [https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html)
    
-   [https://docs.cloud.google.com/iam/docs/access-change-propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
    
-   [https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation)
    
-   [https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation-workload](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation-workload)
    
-   [https://www.elastic.co/docs/solutions/security/endpoint-response-actions/automated-response-actions](https://www.elastic.co/docs/solutions/security/endpoint-response-actions/automated-response-actions)
    
-   [https://www.elastic.co/docs/explore-analyze/workflows](https://www.elastic.co/docs/explore-analyze/workflows)
    
-   [https://www.elastic.co/docs/explore-analyze/workflows/use-cases/security/automate-security-operations/enrich-alert-with-threat-intel](https://www.elastic.co/docs/explore-analyze/workflows/use-cases/security/automate-security-operations/enrich-alert-with-threat-intel)
    
-   [https://gambit.security/blog-posts/autonomous-ai-agents-online-retailers-25-a-company](https://gambit.security/blog-posts/autonomous-ai-agents-online-retailers-25-a-company)
    

## About Elastic Security Labs

Elastic Security Labs is the threat intelligence branch of Elastic Security dedicated to creating positive change in the threat landscape. Elastic Security Labs provides publicly available research on emerging threats with an analysis of strategic, operational, and tactical adversary objectives, then integrates that research with the built-in detection and response capabilities of Elastic Security.

Follow Elastic Security Labs on Twitter [@elasticseclabs](https://twitter.com/elasticseclabs?ref_src=twsrc%5Egoogle%7Ctwcamp%5Eserp%7Ctwgr%5Eauthor) and check out our research at [www.elastic.co/security-labs/](https://www.elastic.co/security-labs/).
