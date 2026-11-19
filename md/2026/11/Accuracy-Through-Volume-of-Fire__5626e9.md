---
title: Accuracy Through Volume of Fire
source: https://trustedsec.com/blog/accuracy-through-volume-of-fire
source_host: trustedsec.com
clip_date: 2026-11-19T23:25:08+08:00
trace_id: 72edccda-e608-4102-a660-c39681bb1fc9
content_hash: 3a6913c40e01c373fbe4d89fc64b2194d22c6e241905a149e7d124f560ceed34
status: synced
tags: []
series: null
feed_source: TrustedSec
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-810a-add9-d013101fe6ff
ioc: null
---

ARTEX and similar LLM-driven pentesting frameworks can find weaknesses, follow leads, and turn ordinary exposure into useful attack paths. Incident reporting now shows attackers using them successfully. The practical questions are what these tools actually do, what you can learn by running them yourself, and where defenders can interrupt the work.

When I say volume of fire, I mean the number and breadth of attempts a framework can make, including follow-up requests that change based on earlier results. An LLM makes that follow-up cheaper to sustain. It can also improve a hypothesis as evidence comes in. That does not make every conclusion correct, and attempts made against a live target create opportunities to detect or block the activity.

## Familiar Tools With LLM Follow-Up

ARTEX is an LLM-driven pentesting and offensive command-and-control platform that coordinates agents and exposes a web console. The framework gives a model tools to inspect targets and act on the results. PentAGI, HexStrike AI, and Cairn appear in the same reporting, although their implementations differ. ARTEX is a useful example of the broader shift from running a scanner to automating the investigation that follows.

[Google Threat Intelligence Group](https://cloud.google.com/blog/topics/threat-intelligence/artex-and-friends-enter-agentic-offensive-frameworks) and Mandiant's October 30 report documents these frameworks in intrusion investigations. Its ARTEX examples include rapid AWS permission probing and hundreds of logged events while pursuing command execution on a web server. That is evidence of operational use, rather than a claim that every model or default configuration will produce the same results. Successful and noisy can describe the same intrusion.

### The Scanner is Only the Beginning

The common attacker workflow is straightforward, though details differ. Discover assets with tools such as subfinder, identify reachable web services with httpx, enumerate services with Nmap, run nuclei templates, and use ffuf or similar tooling to discover content and parameters. HexStrike's [documented tool inventory](https://github.com/0x4m4/hexstrike-ai#readme) includes all of them. Selection and order vary by framework. Very little of the network behavior is new.

The useful change comes after the initial output. In an agent workflow, the LLM selects an action, the framework executes it, and the result becomes input for the next decision. It might inspect a response, adjust a request with curl or a browser, write a small script, or investigate an exposed file. A discovered secret becomes another hypothesis: Is it valid, and what can it access? The operator still has to decide which questions can be answered within scope and what evidence is sufficient.

The model supplies reasoning and proposed actions. The framework supplies tools, execution, state, and permissions. The deployment supplies the actual access. Changing any of those can change the outcome, so a framework name alone tells you very little about how capable a particular run will be.

Microsoft's [November 6 ARTEX reporting](https://www.microsoft.com/en-us/security/blog/2026/11/06/artex-abuse-expands-as-cybercriminals-target-financial-sector/) describes familiar clients, including Nmap, curl, Python HTTP clients, and Playwright. It also shows Storm-3358 pairing ARTEX with conventional automated tools to scan Internet-exposed systems and exploit flaws such as anonymous file upload and SSRF. The framework can change its requests and approach in response to failure. Recognizing a default user agent helps, but it is a starting signal rather than a durable boundary.

Calling this a scanner or wrapper undersells the automated follow-up. A model can turn an otherwise abandoned lead into a useful attack path. It still needs a reachable target, suitable tools, and any permissions required by the action. It can also spend an impressive number of tokens investigating a false positive.

### Cheap Attention Meets Untested Surface

Many organizations have custom applications, old APIs, forgotten subdomains, and internal tools exposed to the Internet that have never received sustained testing. Periodic scans may have touched them. Someone spending hours following every unusual response is a different level of attention.

Attackers have long had an economic reason to favor bugs in common frameworks, appliances, and plugins: one exploit can work against thousands of targets. Reviewing every custom application and API at one organization takes time for a less reusable result. Defenders face their own budgets, and bespoke, low-traffic applications often stay in the backlog. Limited attacker attention was never a control. It was an economic assumption that nobody would spend the time.

The economics change when that attention gets cheaper. An agent can repeat requests and pursue leads at a pace that changes what attackers can afford to target. The same capability can support an experienced testing team, but runtime is not coverage. Authentication, application roles, business logic, and the consequences of a successful action still need deliberate testing. Weakly scoped credentials and poor segmentation make a small initial finding much more valuable.

Repeated testing can make an investigation more accurate when the model uses responses to refine or reject a hypothesis. Repeating the same mistaken assumption does not. Separate the number of attempts from the quality of the evidence supporting the final finding. Broad enumeration and rapid retries also tend to produce more observable activity. Operators can trade speed and breadth for quieter behavior, but parallel agents do not make the resulting traffic disappear.

## Stop Giving Automated Testing Unlimited Room

We used to talk more about shunning sources that repeatedly scanned or attacked an application. Over time, plenty of teams came to accept this as background noise. Blocking became operationally annoying, addresses changed, shared infrastructure complicated decisions, and geography was an unreliable substitute for intent.

I think bug bounty programs helped normalize tolerance for noisy testing. Researchers still need a workable way to test. Clear rules could specify which assets allow automation, the permitted concurrency or request rate, and who can approve an exception. Give authorized researchers a way to coordinate testing without treating every unknown source as entitled to unlimited access.

[WorkOS](https://workos.com/security/bulletins/update-for-october-30th-2026-data-security-incident) provides a concrete example of the underlying exposure. Its [November 6](https://workos.com/security/bulletins/update-for-october-30th-2026-data-security-incident) update describes a public internal-tool API, a predictable development credential, missing rate limits, and inadequate alerting. ARTEX accessed the API and later retrieved records in bulk. The lesson is not that every organization needs a new stack. It is that ordinary gaps can combine into a path an agent has time to keep pursuing.

### Start With One Exposed Service

Pick one employee tool or management API that does not need anonymous public access. Work with its owner to place it behind an identity-aware application proxy, private access service, or controlled VPN. Start here because denying the initial connection removes the agent's opportunity to investigate that service at all.

Then verify that the original server cannot be reached around that access control. An old hostname, alternate address, or directly reachable API can leave the same path open. Test from an unauthenticated external system, including any direct origin address you know about, and confirm that the application is actually inaccessible without the required access.

That is a bounded project with an observable result. Expand it to other services after proving the boundary on the first one.

### Limit Repeated Testing and Bulk Access

Use the WAF, intrusion prevention, and application controls you already have to enforce limits appropriate to each service. Tune blocking around behavior: broad path enumeration, repeated exploit probes, rapid parameter variation, authentication failures, unusual record retrieval, and machine-speed transitions between them.

Temporary IP address blocks and reputation controls can still remove cheap opportunities. Geographic restrictions can also reduce exposure where the business has no reason to accept traffic from a region. Neither is a complete boundary: an attacker can move to permitted infrastructure. Use these controls for the friction they provide, and measure their effect rather than discarding them because bypasses exist.

User-agent blocking belongs in the same category. It will stop a default configuration, and the WorkOS indicators include a literal ArtEx/1.0. A model or operator can change the string. Keep detecting the enumeration and abuse after that happens.

### Constrain What Compromised Access Can Reach

Consider what happens after an attacker compromises a public web application. If its service account can read unrelated datasets or its server can reach broad internal networks, one application weakness becomes a much larger problem. Review that application's required connections and permissions with its owner, then remove access it does not need.

For example, allow the application to reach its required back-end service and restrict its credential to the data and operations it needs. Test that the application still works and that a connection or read outside those requirements is denied. This gives segmentation and least privilege a specific path to break.

Use the same path to test detection and response. Can the team connect unusual API use to the account performing it, see an unexpected increase in data retrieval, and revoke access while retrieval is still running? Start with that sequence and its required application and identity logs. Measure whether the response interrupts it before adding more alerts.

Microsoft also reports that decoys and tarpits disrupted agents in its testing. These are worth evaluating, once the basic access boundary and response path work. They can consume an agent's attention and produce useful signals, but an interesting decoy does not close an exposed API.

## Running the Framework Creates Its Own Attack Surface

Running one of these tools is a useful way to understand its behavior. It also creates privileged infrastructure containing model API keys, target information, captured sessions, and findings. Start on a disposable VM and an isolated applicationyouown, with a private console and temporary credentials limited to the exercise. Avoid mounting your home directory, SSH agent, or container-management socket into the worker. Those choices determine what a mistake or compromised image can reach.

### Enforce Scope Outside the Prompt

WorkOS attributed the unintended access to a researcher conducting ARTEX benchmark evaluations. It said an independent forensics firm matched the researcher's evidence to company logs, and that the researcher confirmed the obtained data was deleted and never shared. This makes the case relevant to people evaluating the tool as well as people defending against it.

The reported impact was limited to sales and customer support data. The important operator lesson is that an intended lab exercise reached a real third party.

WorkOS describes an agent escaping its testing environment, but its public account does not establish a container or hypervisor vulnerability, or explain the exact boundary failure. It is not evidence that a model crossed a genuine air gap. An agent with Internet access can leave the intended target scope without escaping its container at all. A software isolation vulnerability is a separate possibility that requires separate evidence.

For a first evaluation, put the worker and target on a lab network whose outbound policy denies unrelated destinations. If the worker needs a hosted model API, allow that connection separately rather than opening unrestricted Internet access. Test the boundary by attempting a connection to a destination outside the lab. A scope instruction in a prompt is useful context, but the network policy must enforce the limit even when the model chooses the wrong action.

Watch the first run. Record the model and version, framework revision, starting permissions, elapsed time, usage cost, requests, and interventions. Compare the final report with the application's known weaknesses and reproduce each claimed finding. Then change one condition, such as authentication or a request limit, and see whether the tool adapts, fails clearly, or claims success without evidence. That teaches more than comparing the length of two (2) generated reports.

### Review What You Actually Execute

[BadByte](https://badbyte.io/artex-backdoor-docker-image/) 's [November](https://thehackernews.com/2026/11/backdoored-docker-image-for-artex-ai.html) research describes a third-party ARTEX copy that directed users to backdoored Docker images, including tomicdd/artex and congdonglinux/artex. The modified login handler allowed unauthenticated command execution inside the container. The finding concerns those third-party artifacts; it does not establish that the original ARTEX source contained the backdoor.

An LLM-assisted security review can help inspect source, installation scripts, Compose files, and requested privileges. It cannot establish that a separately downloaded binary matches the source it read, and it can miss malicious behavior. Check the publisher and the exact image reference, prefer a build from reviewed source where practical, and pin the selected artifact by digest so a mutable tag cannot silently change it. A digest identifies bytes; it does not certify that they are safe. Isolation and limited credentials still matter if the review misses something. If you ran a known backdoored image, preserve evidence, rebuild from a trusted artifact, and rotate credentials it could access.

### A Framework Is Not an Assessment

A completed run or a long report does not establish coverage. Record which roles and workflows the tool actually exercised, which findings were reproduced, and where it stopped. A control that blocked an action, a broken tool, and a wrong hypothesis can all look like failure in the transcript, but they imply different next steps. Deliberate testing of authorization boundaries and business logic still needs someone responsible for the evidence and the gaps.

## Internal Networks Change the Constraints

An Internet-facing application often gives an attacker room to make requests without first maintaining a foothold. Inside a managed enterprise, the available workstation, its privileges, routing, and outbound access become constraints on every subsequent action.

EDR can block execution, identity controls can disable access, and segmentation can deny the next connection. If the attack depends on one workstation, and that workstation is isolated, spawning more agents does not restore its network access. That does not guarantee containment: the attacker may already have another foothold or credentials usable elsewhere. The useful question is which access the response actually removes.

Microsoft Defender's [automatic attack disruption](https://learn.microsoft.com/en-us/defender-xdr/automatic-attack-disruption) is one example of acting on that dependency. Depending on the deployed products and configuration, response actions can contain or isolate devices and restrict compromised identities. Use Microsoft's implementation guidance to establish which actions your deployment supports, then test the action you intend to rely on.

Choose a controlled scenario that depends on a test workstation and account. Trigger the agreed response, and verify whether existing connections stop and whether the identity can still authenticate elsewhere. Measure the time to interruption, and check exclusions or coverage gaps if it fails. Having the product installed is not evidence that this response path works.

### The Quiet Version Does Its Volume Offline

Experienced operators can use parallel agents to research software, recreate the environment, study defensive products, and test candidate actions offline. Repeated attempts in a lab can eliminate dead ends before they generate traffic or failed execution on the real network. The operator still has to choose a representative environment, challenge the results, and decide which actions are worth taking on target.

What comes out should be a smaller set of tested hypotheses: which version is present, which preconditions matter, what a failed attempt means, and which action is worth taking next. A lab can differ from production in policy, configuration, and telemetry. The assessment team still has to validate those assumptions against the actual environment and explain the limits of the result.

## Make the Volume Hit Walls

Try these frameworks in a contained lab and inspect what they actually do. For offense, the value is cheaper follow-up, broader investigation, and faster testing of hypotheses, with results that still need validation. For defense, start with one exposed service, constrain repeated or bulk access where it must stay public, and prove that a response breaks a specific attack path. The same tools can help test those controls when the operator enforces scope and checks the evidence.

Model capability and framework design will keep changing. Reachability, permissions, and the time available before interruption still determine what an agent can accomplish in a particular environment. Those are things you can test today.

Volume of fire works better when the target lets you keep shooting.
