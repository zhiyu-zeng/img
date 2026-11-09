---
title: Why Don’t We Just Use AI?
source: https://blog.includesecurity.com/2026/11/why-dont-we-just-use-ai/
source_host: blog.includesecurity.com
clip_date: 2026-11-10T03:39:43+08:00
trace_id: c80671e5-bae4-4f28-93ca-5ab45baabebe
content_hash: 0734dd279d4626ab6c8204c5bc876acc3569d75e68046b6780bc08bc8da0b334
status: synced
tags: []
series: null
feed_source: Include Security
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41375244-d011-81b8-9d98-e047144d984c
ioc:
  cves:
    - CVE-2026-52813
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Here at Include Security we have been having a lot of conversations about AI’s role in penetration tests. We often hear two questions from clients:

1\. The news says that AI can hack now. Why don’t we just have AI do the pentest?

2\. We still want an expert to sign off on the results, but shouldn’t the pentest be cheaper since AI can do the hacking?

The reality is that these questions are based on an assumption that the AI companies have misrepresented in their marketing, that AI-driven vulnerability discoveries take little to no human time and effort to turn a list of potential findings into a high-quality assessment. This post addresses both questions with a combination of our own experience and information shared by other peers and researchers in the field.

## Why don’t we just use AI?

The short version: It’s [not sufficiently reliable yet](https://arxiv.org/abs/2606.14295). That’s not to say that it won’t get there, just that it’s not there right now. Like everyone else, we’ve seen AI’s [highlight reel](https://techcrunch.com/2026/03/06/anthropics-claude-found-22-vulnerabilities-in-firefox-over-two-weeks/) in news stories and [marketing releases](https://xbow.com/news/announcing-xbow-pentest-on-demand-for-security-at-machine-speed). There is enough there to be excited about what LLMs can contribute to software security assurance. We are actively evaluating models, internally developed harnesses (a harness is code built around a model to supply instructions, run tools, and collect results), open-source harnesses, and commercial products to improve the quality of our work and to achieve results faster. However, the models, harnesses, and processes around them are all still works in progress.

New LLM achievements are highlighted daily by researchers and LLM providers, but the stories often [leave out many details](https://media.defcon.org/DEF%20CON%2034/DEF%20CON%2034%20presentations/DEF%20CON%2034%20-%20Albert%20Corzo%20-%20Taming%20the%20Swarm%20Hard%20Architectural%20Lessons%20from%20Building%20a%20Deterministic%20Agentic%20Web%20Pentesting%20System%20-%20v1.pdf#page=33) that would detract from the excitement of the findings. Impressive feats can leave the impression that simple prompting of an LLM can provide a practical replacement for teams of technical experts.

## What’s missing from the highlight reels?

**Coverage/Assurance.** There is an important distinction to make about the goals. Bug hunting to find *a* vulnerability is different from an assessment that aims to enumerate *all* vulnerabilities. Some categories are more easily discovered than others. For example: [hardcoded secrets can be found pretty reliably](https://github.com/gitleaks/gitleaks) with pre-AI tools. Models can now find some logic flaws, such as a missing authorization check. [Business logic flaws that require a very specific state or sequence are still quite difficult](https://pentest-tools.com/insights/ai-pentesting-survey). Highlight reels can be built with specific, narrow cases. Finding some [memory corruption vulnerabilities in old C libraries](https://www.anthropic.com/research/zero-days) does not demonstrate broad security competence. It’s cool. It’s useful. But it’s still a limited tool.

**False positives.** Our testing has not identified a tool, AI or otherwise, that finds real vulnerabilities at an acceptable rate without also introducing false positives. This is not always a critical failing. If a tool’s output has a high enough signal-to-noise ratio, it can still be a net win. However, reporting on AI-driven vulnerability discoveries is almost entirely lacking in statistics about false positives. How many false alarms did human reviewers need to [wade through to reach the real issues](https://semgrep.dev/blog/2025/finding-vulnerabilities-in-modern-web-apps-using-claude-code-and-openai-codex)? If a qualified hacker could find the true vulnerability without the tool in less time than it takes the hacker to sift through the false positives, the tool is actually a hindrance. That’s the worst case, and we’ll assume that tools will be abandoned when that happens – unless of course your goal is not efficiency but rather marketing… For real-world use, the [false positive cost needs to be considered](https://www.bugcrowd.com/blog/the-hidden-cost-of-agentic-pentesting/). A vulnerability found by a tool is not free. Its real cost includes the time spent on every erroneous finding that came with it. Additionally, the non-deterministic nature of LLMs mean the same scan can also [return different findings each time it runs](https://snyk.io/blog/snyk-vulnbench-js-1-0-llm-security-review-repeatability/).

**Constructing the right harness isn’t as simple as it’s made out to be.** In some cases, testers have found success with a simple harness. Even with simple training apps, our testing found that more guidance was needed than a one-shot prompt (a single request with no follow-up). To cover a full, real application, a one-shot prompt was not successful, and [others have measured the same](https://semgrep.dev/blog/2026/3-5x-more-true-positives-how-we-benchmark-ai-powered-detection/). There are many open-source harnesses and many businesses working on proprietary solutions. If simply asking the model to solve the problem worked, none of this would exist. There are commonalities to the existing harnesses, but they have not yet converged to an accepted best practice. Getting the most from LLMs is not a solved problem. We’re all still working on it. Building systems around a [non-deterministic core](https://arxiv.org/abs/2606.21397) is a new challenge.

None of this retracts what [we published in August](https://blog.includesecurity.com/2026/08/web-app-pentesting-in-the-ai-era/): a simple harness and a frontier model performed well (in recall and false positive rate) against a set of intentionally vulnerable training applications. The density of vulnerabilities in the small training applications made the harness look more reliable than it is on real codebases. More lines of non-vulnerable code in scope lead to more false positives in the tool output.

## What else holds us back?

**Access to frontier models without guardrails.** The top model providers have implemented [guardrails which will cause the models to reject some security tasks](https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude-opus-and-sonnet). This [keeps users from the full capacity of the model](https://huggingface.co/blog/security-incident-july-2026#the-asymmetry-problem). Providers offer verification programs that lift some of these limits, but an organization that requires zero data retention may not qualify, and approved users can still be blocked.

**Client comfort.** We are not all-in on the latest models because our clients are not. In some cases, we are prohibited from using third-party hosted models entirely. Some clients also do not want an autonomous agent to act against their systems without a human who approves each step. This post is not arguing for or against such policies. Different businesses with different data classifications can reasonably have different risk tolerances. There is a tradeoff between privacy and inference capabilities.

## Why aren’t the assessments cheaper?

A discount would have to come from time savings. The effort that AI removes is what the highlight reels show: producing candidate findings. The effort it does not remove is reading those candidates, deciding which ones are real, and maintaining the harness that produced them. [ISC2’s May 2026 survey](https://www.isc2.org/insights/2026/07/rethinking-ai-impact-on-cybersecurity-roles) of practitioners already using AI found that 65% spend more time deciding when to trust its output and 63% spend more time validating it. [CREST’s 2026 report on 62 providers](https://www.crest-approved.org/crest-research-how-ai-is-changing-penetration-testing/) found a second reason across the industry: AI reduces manual effort, but that “doesn’t directly translate into savings.” Where AI does save time, that time goes into deeper investigation and broader coverage, not a lower price.

In some circumstances our clients have found that a deluge of AI-reported vulnerabilities has created more work. Our team has been brought in to correct the risk ratings, remove false positives, improve the remediation advice, and build proofs of concept to prevent development teams from being buried by AI Jira slop.

## What’s good now?

Where a client allows it, our testers use LLMs today as an aid, and a human verifies every finding that reaches a report.

**LLM-augmented experts.** Rather than assigning the whole application assessment to the LLM system, testers can use LLMs to facilitate investigation of specific concerns in portions of the code. [This is helpful](https://bishopfox.com/blog/ai-finds-vulnerabilities-security-experts-find-impact). It is also still a new skill. Which questions can a model be trusted to answer? How do you write the prompt to set the model up for success? These are the types of questions that are energizing our team and prompting (pun intended) exciting knowledge sharing conversations in our Slack.

**Scripting for testing and creating proofs of concept (PoCs).** LLMs are great at small coding tasks. When a tester needs to create code during an assessment, it is now much easier.

## Before your next assessment

The most useful thing a client can do is set AI expectations before the engagement starts.

· **State up front what AI use is allowed.** Whether third-party hosted models may see your code, whether local-only models are required, and whether you want AI-assisted findings identified in the report. This decides our tooling before day one.

· **Understand the trade-off.** Hosted frontier models reason better, and they can run many requests in parallel. In our own runs on a real application, a hosted model finished in about an hour what a local model needed most of a day for, and far more of the hosted model’s top findings were real. A local-only policy is a legitimate privacy choice, but it costs speed and accuracy. The trade-offs should be understood from the start rather than a surprise.

· **Ask any product vendor these questions.** How many candidates did the tool produce for each finding that made the report? How many hours of human validation did each finding take? Did the demonstration target have a known answer key? What did the tool miss on a target where the vulnerabilities were already known? If the tool runs twice on the same code, does it return the same findings? [Semgrep](https://semgrep.dev/blog/2026/operationalizing-ai-powered-detection/) and [the GitHub Security Lab](https://github.blog/security/how-to-scan-for-vulnerabilities-with-github-security-labs-open-source-ai-powered-framework/) published their numbers. Many vendors have not.

For our part, we will keep evaluating models, harnesses and products, reporting what we measure, and adopting tools into our methodology only when the evidence says it helps more than it distracts.

## Further reading

### Reliability and the highlight reel

· [Quantifying the Expectation-Realisation Gap for Agentic AI Systems](https://arxiv.org/abs/2602.20292) (2026). A review of controlled trials in software engineering and clinical tools. Measured gains fell short of what users and vendors expected, and the paper names “verification burden” as one of the causes.

· [Mythos finds a curl vulnerability](https://daniel.haxx.se/blog/2026/05/11/mythos-finds-a-curl-vulnerability/) (Daniel Stenberg, 2026). The model’s report listed five “confirmed security vulnerabilities.” After hours of review the curl team confirmed one, at low severity. Stenberg found the report useful, but concluded that “the big hype around this model so far was primarily marketing.”

### Coverage and narrow cases

· [Decompiling the Synergy: Human-LLM Teaming in Software Reverse Engineering](https://doi.org/10.14722/ndss.2026.240380) (NDSS 2026). Experts using an LLM were at least 248% faster on functions implementing common algorithms and at least 314% slower on custom ones.

### False positives and triage cost

· [Refute-or-Promote](https://arxiv.org/abs/2604.19049) (2026). Adversarial review killed about 79% of 171 AI-generated candidates, and unanimously killed a real CVE that was recovered only by human override.

· [Operationalizing AI-Powered Detection](https://semgrep.dev/blog/2026/operationalizing-ai-powered-detection/) (Semgrep, 2026). A vendor that publishes its own false-positive rate: 19% against 41% for a model-only baseline.

### Guardrails, access and control

· [Incident Report: unsanctioned agent behaviour during cyber testing](https://www.aisi.gov.uk/blog/incident-report-unsanctioned-agent-behaviour-during-cyber-testing) (UK AISI, 2026). 19 unsanctioned live-internet actions across 10 of 122 test runs.

· [Defensive Refusal Bias: How Safety Alignment Fails Cyber Defenders](https://arxiv.org/abs/2603.01246) (2026). Models refuse defensive requests with security keywords at 2.7 times the rate of equivalent neutral wording.

· [Researchers say OpenAI revoked their access to limited cyber program](https://techcrunch.com/2026/08/19/researchers-complain-that-openai-revoked-their-access-to-limited-cyber-program/) (TechCrunch, 2026). Vetted researchers lost access to OpenAI’s gated cyber tier overnight, and OpenAI called it a technical error. Gated capability is revocable capability.

### Harnesses

· [3.5x more true positives: How we benchmark AI-powered detection](https://semgrep.dev/blog/2026/3-5x-more-true-positives-how-we-benchmark-ai-powered-detection/) (Semgrep, 2026). “The harness turns out to matter more than the model version.”

· [When Finding Bugs Is the Easy Part](https://owaspglobalappsecusa2026.sched.com/event/2VvPw/) (OWASP Global AppSec USA 2026, talk abstract). A nine-step harness run across twenty production applications found over 400 verified vulnerabilities that SAST missed, and SAST found roughly 90 that the harness missed. The first run’s precision was “too low to hand to any developer.” The fix was “structural changes,” “not prompt tuning.”

### Augmented experts

· [AI-supported vulnerability triage with the GitHub Security Lab Taskflow Agent](https://github.blog/security/ai-supported-vulnerability-triage-with-the-github-security-lab-taskflow-agent/) (2026). Experts used a model to triage CodeQL alerts into about 30 real vulnerabilities, and reviewed every generated output before reporting.

· [Yet another RCE in Gogs, but it’s fixed this time!](https://www.aikido.dev/blog/fixed-rce-gogs-cve-2026-52813) (Aikido, 2026). The agent flagged a path traversal; humans took over the investigation and escalated it to RCE (CVE-2026-52813).

### Numbers from before 2026

These four are older than the rest. They are here because they report what most announcements do not: the false-positive rate on real applications, the reviewer time spent per report, and the gap between how much faster people believed they were and what the clock showed. Each one found a cost that the headline results leave out. The models changed a great deal in 2026, so these numbers have almost certainly improved. METR’s own [2026 follow-up](https://metr.org/blog/2026-02-24-uplift-update/) says developers are likely faster now, but calls its new data “only very weak evidence for the size of this increase.”

· [Finding vulnerabilities in modern web apps using Claude Code and OpenAI Codex](https://semgrep.dev/blog/2025/finding-vulnerabilities-in-modern-web-apps-using-claude-code-and-openai-codex) (Semgrep, 2025). On 11 real web applications, 86% and 82% of reported findings were false positives, and three identical runs on one application produced 3, 6 and then 11 findings.

· [Death by a thousand slops](https://daniel.haxx.se/blog/2025/07/14/death-by-a-thousand-slops/) (Daniel Stenberg, 2025). Each report engaged three or four people for thirty minutes to a few hours, on a stream where about 5% of submissions were genuine.

· [The end of the curl bug-bounty](https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/) (Daniel Stenberg, 2026). In 2025 the confirmed-report rate fell from above 15% to below 5%, and the program closed. By April 2026 Stenberg reported the rate back at 15-16%, with report volume as the new load.

· [Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) (METR, 2025). Experienced developers were 19% slower with AI on their own repositories while believing they had been 20% faster.

The post [Why Don’t We Just Use AI?](https://blog.includesecurity.com/2026/11/why-dont-we-just-use-ai/) appeared first on [Include Security Research Blog](https://blog.includesecurity.com/).
