---
title: "AlertZero in Elastic Security: Every alert answered. Every decision yours"
source: https://www.elastic.co/security-labs/blog/ai-soc-agents-alertzero-workers
source_host: www.elastic.co
clip_date: 2026-11-26T10:58:48+08:00
trace_id: 4b95836a-a0c0-40d8-b6c1-92c1d80f9df4
content_hash: b1ce4f93f629458c69572cf6318398f3951b20a1af550b11a95eb36c1c9f8126
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
notion_page_id: 42475244-d011-81ef-9e51-c702909b0a12
ioc: null
---

Most security operations center (SOC) teams we talk to describe the same problem. There are more alerts than people to work them, so the queue decides what gets looked at, and threat hunting and detection rule tuning keep slipping to the following week. And most of the time that an alert eats up isn't spent deciding what to do with it; it’s spent digging up context first, like whether this rule has fired on this host before and what else was going on around it. We built AlertZero to do that digging for you, so your analysts can spend their time on the calls that really need them. Starting today, with Elastic Security 9.6, AlertZero is available in technical preview in Elastic Cloud Serverless and is expected to be available for ECH and Self-Managed deployments in 9.6 in early December.

In October 2026, we offered [an early look at AlertZero](https://www.elastic.co/security-labs/blog/ai-soc-automation-alertzero), where we followed one suspicious login from the first alert, through the evidence gathered in an investigation, to a proposed host isolation waiting for an analyst's approval. Today, we’re giving you the full breakdown on what’s in the technical preview release: the six Workers and what each one proposes, how much they can do at each level of autonomy, how to choose models, and how to get started in both written and video form.

## What’s inside AlertZero: 4 Watches and 6 Workers

Let’s start with an overview. AlertZero covers four areas of SOC work: alert triage, threat hunting, detection engineering, and endpoint forensics. Each Watch covers one of these four areas, and they hold the Workers that do that work. A Worker has one specific job, such as triaging new alerts or tuning a noisy rule.

![AlertZero Watches: Triage, Hunt, Detection and Forensics, each with an example Worker, under your security team](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67e57e3300973504.png)

Under the hood, each Worker is an AI-powered unit of work that belongs to a Watch. It runs in the background, either on a schedule or in response to events like new alerts, and then analyzes your data and brings you proposed actions. Every Worker is built as a workflow in Elastic Workflows, and each one has its own settings, including its schedule and its autonomy level.

### AlertZero deep dive video

Here’s a video overview, where Elastic’s James Spiteri, Senior Director of Security Product Management, and Jackie McGuire, Senior Director of Security Product Marketing Management, show you AlertZero.

## Why we build Workers and Watches this way

AlertZero builds every Worker as a workflow of deterministic steps, and it calls a model only where judgment is needed. That split does four things:

-   Lookups and checks run as code, so they behave the same way every time.
    
-   You can check the model’s conclusions against the evidence, because it works from data pulled from your own environment.
    
-   Cost stays down, since model calls go only to the steps that need judgment.
    
-   Nothing changes in your environment based solely on the model’s recommendation. A Worker’s AI steps can only read your data, and every change is carried out by deterministic steps. Its autonomy level decides which of those wait for approval.
    

To see how a Worker reached a result, you can open the run and follow each step it took. When a Worker thinks something in your environment should change (for example, that a false positive should be closed or a host should be isolated), it writes that up as a proposed action. The proposal lays out what the Worker wants to do and why, along with what it found. The level of autonomy (Manual, Assisted, or Supervised) that you’ve assigned the Worker dictates how it proceeds. At Manual, it waits until someone on your team approves or declines it.

You’ll find six Workers in this technical preview release:

**Watch**

**Worker**

**What the Worker does**

Triage Watch

[Alert Triage Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-alert-triage)

Classifies new alerts as true or false positives, with a confidence score for each

Closing alerts that it classifies as false positives

Manual, Supervised

Triage Watch

[Attack Discovery Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-attack-discovery)

Groups related alerts into potential attacks, and opens an investigation for each one

Endpoint analysis for attacks that look real or can't be ruled out

Manual, Supervised

Hunt Watch

[Continuous Threat Hunt Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-continuous-threat-hunt)

Searches your data for activity that matches threat reports, and records any detection gaps it finds

Response actions when your data matches a threat report, and detection gaps for Rule Coverage to review

Manual

Detection Watch

[Rule Tuning Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-rule-tuning)

Finds rules that keep producing false positives, and determines why

Edits and exceptions for rules that analysts keep closing as false positives

Manual, Assisted

Detection Watch

[Rule Coverage Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-rule-coverage)

Reviews the detection gaps that Continuous Threat Hunt records

Enabling, installing, or creating rules to close detection gaps

Manual, Assisted

Forensics Watch

[Endpoint Analysis Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-endpoint-analysis)

Reconstructs the attack timeline on the main host involved, and pulls out indicators of compromise

Isolating a host, or killing or suspending a process

Manual, Supervised

## How the Alert Triage Worker classifies alerts

Now that we’ve covered the basics, let's look at what happens inside a run of the Alert Triage Worker, one of the two Workers in the Triage Watch. Every Worker is a workflow made of deterministic steps that run as code and AI steps that call a model only where judgment is needed.

On each run, the Alert Triage Worker picks up new alerts and starts with the same steps that an SOC analyst would follow before deciding whether to close an alert or escalate it, or possibly to dig deeper. It looks up how past alerts from that rule were closed and how common the activity is in your environment. It also looks up what the rule is designed to detect. Those lookups are deterministic, so no model is involved.

Only once the evidence is assembled does the Worker pass it to a model, and it does so in a single AI step, deciding whether each alert looks like a true or false positive and how confident it is with that determination. The Worker's deterministic steps then take over again to record the verdict and, for confident false positives, to propose closing them.

![Alert Triage Worker workflow: four deterministic queries, one AI step classifying alerts, then code proposes closing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ec928275f004c6e9.png)

## How AlertZero Workers hand off work to each other

You can run any combination of Workers. A team that mainly wants help with triage and noisy rules, for example, can run Alert Triage and Rule Tuning without turning on Attack Discovery or Endpoint Analysis. The false positives that Alert Triage flags count toward Rule Tuning, which looks for the rules that keep producing them and proposes fixes. Other Workers also hand work to each other in the same way.

Attack Discovery passes attacks to Endpoint Analysis for a closer look at the hosts involved, and Rule Coverage works from the detection gaps that Continuous Threat Hunt records. If you turn off one side of a handoff, the other keeps running but has less context to work with. Response actions in this release, whether they come from Endpoint Analysis or Continuous Threat Hunt, run through [Elastic Defend](https://www.elastic.co/docs/solutions/security/configure-elastic-defend), which Endpoint Analysis also needs to investigate hosts.

![How AlertZero Workers hand off: alerts to triage, false positives to rule tuning, attacks to endpoint analysis](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/09ee3ad52baa1f6c.png)

## AlertZero autonomy levels: Manual, Assisted, and Supervised

Every Worker has an autonomy setting with up to three levels. At **Manual**, anything that a Worker proposes waits for someone on your team to approve it. **Assisted** applies only to Rule Tuning and Rule Coverage. At that level, they start looking into a rule or a coverage gap without asking first, although any change they come up with still needs approval. **Supervised** goes the furthest: the Worker approves its own proposals and acts on them, and afterward, you review what it did.

![Endpoint Analysis Worker autonomy settings in Elastic Security, with Manual selected and Supervised available](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db391af9d3bd4ef7.png)

Whatever its autonomy level, every Worker can tag and annotate the alerts it reviews and can open investigations without preapproval. The rest depends on the level you set.

**Worker**

**Manual**

**Assisted**

[Alert Triage Worker](https://www.elastic.co/docs/solutions/security/alertzero/configure-worker-settings#configure-worker-settings-alert-triage)

Classifies new alerts and proposes closing the false positives.

You approve or decline each proposed closure.

–

Closes false positives at or above its minimum confidence score (85%, by default).

[Attack Discovery Worker](https://www.elastic.co/docs/solutions/security/alertzero/configure-worker-settings#configure-worker-settings-rule-tuning)

Opens an investigation for each potential attack and proposes handing the attack to the Forensics Watch.

You approve or decline each handoff.

–

Opens an investigation for each potential attack and hands the attack to the Forensics Watch on its own.

[Continuous Threat Hunt Worker](https://www.elastic.co/docs/solutions/security/alertzero/configure-worker-settings#configure-worker-settings-rule-tuning)

Hunts each threat report, opens an investigation for it, and proposes response actions for the threats it finds.

You approve or decline each proposed action.

–

–

[Rule Tuning Worker](https://www.elastic.co/docs/solutions/security/alertzero/configure-worker-settings#configure-worker-settings-rule-tuning)

Finds each qualifying rule, but waits for your approval before it analyzes the rule.

You approve or decline each proposed tuning change.

Diagnoses and proposes a tuning change for a noisy rule on its own; any edit or exception still needs your approval.

–

[Rule Coverage Worker](https://www.elastic.co/docs/solutions/security/alertzero/configure-worker-settings#configure-worker-settings-rule-coverage)

Reviews the detection gaps that the Hunt Watch finds, but waits for your approval before it checks a gap.

You also approve or decline each proposed next step.

Reviews and proposes a change for detection gaps on its own; any rule change still needs your approval

–

[Endpoint Analysis Worker](https://www.elastic.co/docs/solutions/security/alertzero/configure-worker-settings#configure-worker-settings-endpoint-analysis)

Adds an attack timeline, indicators of compromise, and its rationale to the investigation, and proposes response actions.

You approve or decline each proposed response action.

–

Adds an attack timeline, indicators of compromise, and its rationale to the investigation, and runs the response actions.

You review the results afterward.

-   Alerts inside an acknowledged attack are marked as such, rather than closed, so Alert Triage can still pick them up.
    
-   At any autonomy level, Endpoint Analysis asks before closing an investigation.
    

When you approve an action, it runs as you, with your privileges, and is recorded as your decision. If you skip the approval, it runs as the Worker’s service account.

## How to review and approve a proposed action

A lot of an analyst's day is taken up by the work that leads to a decision. For example, you pull context on an alert and determine whether a rule has misfired before, or you search your data for something that a new threat report describes. The decision itself, like whether to contain a host or change a rule, or maybe to close a batch of alerts, is usually the quicker part. AlertZero takes on that groundwork and attaches everything it found to the decision that it brings you. What changes in your environment remains up to you, and you choose how much of it to hand off.

Every proposed action lands on the proposed actions page, grouped under **Respond**, **Investigate**, and **Configure**. Open one, and you're in its investigation, which is where the Worker keeps its notes, including the evidence it gathered and the reasoning behind its recommendation, along with the hosts and users involved. Because an investigation is an [Elastic Agent Builder](https://www.elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder) conversation, you can ask follow-up questions before you decide, such as, *What else is that host connected to?* Or, *What would the proposed exception stop matching?*

![AlertZero Proposed Actions page grouped under Respond, Investigate and Configure, with an Investigation flyout open](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ec4d78bf35d3c914.png)

When you approve, the action runs as you, with your privileges, and it's recorded as your decision. If you decline, the action doesn't run.

![Isolate host Proposed Action in AlertZero with the Worker’s evidence and Approve or Decline buttons](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/94c3986315b68a6c.png)

### Working a case together with escalations

Some cases need more than one person. An escalation brings one or more related investigations into a shared conversation. You can assign it to people on your team and keep it private or make it public. You work the case together there, with the agent available for questions along the way.

## Choosing models for AlertZero: Efficient, Balanced, and Frontier tiers

No single model is the right fit for every step, and the one you rely on today can change. A provider tightens its guardrails or retires a version, or even changes its pricing, and a step that used to work starts failing or costing more. Security work runs into this more than most. When Hugging Face [investigated its July 2026 intrusion](https://huggingface.co/blog/agent-intrusion-technical-timeline), the first models that its team reached for refused much of the forensic work, because their guardrails treated reverse engineering an exploit the same as launching one. The team finished the analysis with an open-weight model.

That's why AlertZero lets you choose the models that its Workers use. We assign each AI step in a Worker's workflow to one of three model tiers, based on what the step needs. You pick the models for each tier in the **AlertZero** section of **Feature Settings**, and the Workers draw from those:

-   **Efficient** handles quick, frequent calls, such as checking detection coverage, where a small, low-cost model does the job.
    
-   **Balanced** covers work where accuracy matters and a step uses tools over many rounds, like diagnosing a noisy rule or analyzing a host**.**
    
-   **Frontier** is for single-pass work where one output carries the most weight, such as generating attack discoveries, so that's where your most capable model belongs.
    

You can use your [model of choice](https://www.elastic.co/docs/explore-analyze/ai-features/llm-guides/llm-connectors) for any tier, including an open-weight model or [one that you host yourself](https://www.elastic.co/docs/explore-analyze/ai-features/llm-guides/local-llms-overview). If every tier points to a model that you host, the prompts built from your alerts go to that model instead of a third-party service. If a model stops working well, you can switch it for that tier without changing anything else about how your Workers run.

## What AlertZero changes for your SOC team

AlertZero changes where your team’s time goes. New alerts will keep coming, and some of them will always need a person. Watches focus on emptying your queue. The groundwork behind each decision, including pulling context on an alert and noticing that a rule keeps misfiring, happens in the background. What reaches your team is a shorter list of decisions to make, with the evidence behind each one. You determine which Workers run and how much each one can do on its own, along with which models do the work, and you can change any of that as your team gets comfortable.

That's the shift we built AlertZero for: less time spent assembling context and more time for the hunts and rule fixes, as well as the investigations, that keep slipping to next week.

## Getting started with AlertZero: Requirements and setup

In this preview, AlertZero is available now on Elastic Cloud Serverless and will be coming to Elastic Cloud Hosted (ECH) and Elastic Self-Managed deployments with an Enterprise subscription or a trial license. You turn it on one space at a time, so you can start with a single team or environment and grow from there. Check the [requirements](https://www.elastic.co/docs/solutions/security/alertzero/requirements) first, and then follow [Set up AlertZero](https://www.elastic.co/docs/solutions/security/alertzero/set-up-alertzero) to turn it on and add an AI model, along with enabling your first Workers. [AlertZero privileges](https://www.elastic.co/docs/solutions/security/alertzero/alertzero-privileges) cover the roles that your team will need, including the separate privilege for creating escalations.
