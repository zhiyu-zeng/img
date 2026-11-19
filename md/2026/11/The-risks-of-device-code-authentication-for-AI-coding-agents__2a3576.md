---
title: The risks of device code authentication for AI coding agents
source: https://www.microsoft.com/en-us/security/blog/2026/11/17/the-risks-of-device-code-authentication-for-ai-coding-agents/
source_host: www.microsoft.com
clip_date: 2026-11-19T09:04:32+08:00
trace_id: db466ee4-53d6-4f83-b03b-e92bae35dacb
content_hash: ad00a3b303993ad510a3306dcb5edafed2a677e3b59ccaa6e660ebc7bfc9718d
status: synced
tags: []
series: null
feed_source: Microsoft Security Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41d75244-d011-81f4-9f80-c1ffb8c6e420
ioc: null
---

Device code phishing has become a recurring route to account takeover. Instead of stealing a password, an attacker persuades someone to approve a sign-in on a legitimate site simply by entering a code. The resulting access often can reach email, files, or other cloud services, depending on the account and the permissions granted. Notable earlier campaigns such as [EvilTokens](https://www.microsoft.com/en-us/security/blog/2026/09/22/unmasking-eviltokens-getting-to-the-root-of-device-code-phishing/) show how readily this technique can be scaled to do real damage. Microsoft worked hard with partners in industry and law enforcement to [disrupt EvilTokens](https://blogs.microsoft.com/on-the-issues/2026/09/22/disrupting-eviltokens-the-ai-chatbot-built-for-cybercrime/) in September 2026.

That led us to a different question: what else can an attacker do with a phished device code authorization? What happens when the same trick targets an AI agent rather than a mailbox?

We used GitHub Copilot CLI as an illustrative example. Depending on its configuration, it can work with code, run commands on a user’s machine, retain context across sessions, and allow an active session to be steered remotely. Like many command-line tools, it supports the OAuth device flow for sign-in. The phishing technique itself is not specific to GitHub or Copilot CLI: any public client that supports the device flow can be abused the same way, and the attacker chooses the requested scopes when starting the flow.

We explored this scenario in a controlled lab simulation. A victim test account approved a GitHub device-code request initiated by an attacker client we controlled. With that approval, we were able to analyze four possible outcomes:

-   Steer an active Copilot CLI session remotely, if the user has enabled remote control and organization policy allows it, and, subject to local permissions and approval settings, have the agent run commands on the user’s machine.
-   Add misleading entries to the agent’s memory that could influence later interactions.
-   Read Copilot CLI sessions that were synchronized to the cloud.
-   Access private repositories available to the affected account.

These are proof-of-concept results showing how existing features, working as designed, could be abused after a phished authorization; they are not attacks we have observed in the wild. These outcomes require the victim user to approve a device code request initiated by the attacker; each outcome also depends on the account permissions and enabled features described below.

Later in this post, we show how Microsoft Defender helps detect these attacks by connecting phishing attempts with GitHub authentication activity, and how organizations can disrupt suspicious access to protect affected identities.

## From a familiar phishing technique to an AI coding agent

The [OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) helps clients such as command-line tools sign in without displaying a full browser. A client requests a short code; the user enters it on the service’s verification page; the requesting client receives access after approval. In device code phishing, the attacker starts the request and persuades someone else to approve it.

Microsoft has reported device code phishing against accounts in several campaigns, including [Storm-2372](https://www.microsoft.com/en-us/security/blog/2025/02/13/storm-2372-conducts-device-code-phishing-campaign/), an [AI-enabled campaign](https://www.microsoft.com/en-us/security/blog/2026/04/06/ai-enabled-device-code-phishing-campaign-april-2026/) in 2026, and [EvilTokens](https://www.microsoft.com/en-us/security/blog/2026/09/22/unmasking-eviltokens-getting-to-the-root-of-device-code-phishing/). Those cases motivated us to examine a different target: a coding agent that can work with repositories and, when remote control is enabled, expose an active session to remote interaction.

The remainder of this post describes a controlled GitHub Copilot CLI simulation; we have not observed the four outcomes below in those campaigns or in the wild.

## How the attack works

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a26670c08bb0f638.webp)

Figure 1. A user approves a legitimate GitHub device-code request that was initiated by the attacker-controlled client. Conceptual illustration.

1.  **Initiate:** The attacker starts a device-code sign-in request. In our simulation, we used the Copilot CLI client, but any device-flow client could be used.
2.  **Lure:** The attacker sends the short code and GitHub verification link to the user, for example under the pretext of an IT request or a Copilot license check. The verification page is genuinely hosted by GitHub; the legitimate domain alone does not establish who initiated the request.
3.  **Approve:** The user opens the GitHub page, signs in if needed, and approves the request. This is the social engineering step.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/27d6be6cb21cf097.webp)

4.  **Sign in:** After approval, the attacker-controlled client completes the sign-in automatically.
5.  **Operate:** The attacker can act within the permissions granted to the application and the resources available to the affected account.

### The request behind the code

The following example shows the initial HTTP request to GitHub’s [device authorization endpoint](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps). The Copilot CLI client identifier is public; it is not a client secret. The attacker sends the short code returned by GitHub to the user. Once the user approves it, the requesting client signs in without another manual step.

```plain
GitHub Device Code Authentication (Simplified)
Endpoint: GitHub Device Authorization Endpoint
Client ID: 
Requested scopes: 
```

#### The request looks legitimate

The user signs in on the real GitHub site, not a lookalike page. A familiar domain therefore cannot tell the user whether the request was theirs. An authorization also appears under a legitimate application name; the name alone cannot distinguish the attacker-controlled client from an expected sign-in.

## One approval, four ways the impact can spread

The device code approval was only the starting point. What an attacker could do next depended on the account’s permissions, enabled features, memory settings, and whether an active session could be controlled remotely.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d5d2bd724fec56c2.webp)

Figure 2. Four possible outcomes in the lab, each subject to the account’s permissions and enabled features. Conceptual illustration.

### 1\. An attacker can steer an enabled remote session

Copilot CLI supports [remote steering](https://docs.github.com/copilot/concepts/agents/copilot-cli/about-remote-control) of an active interactive session when the user has enabled remote control for that session and organization policy allows it. In our lab, the attacker-controlled client used the test account’s authorization to interact with a remotely controllable session. The agent ran a command on the test machine, subject to the session’s approval prompts and local operating-system permissions. This demonstrates misuse of an authorized remote-session capability working as designed; it is not unauthenticated remote code execution and does not apply when remote control is disabled, the session is not running, or the machine is offline.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/977e6e2541d58393.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aff068bf8502e486.webp)

Figure 3. Remote-session misuse is bounded by the local machine’s permissions and approval controls. Conceptual illustration.

### 2\. Memory can carry the attack forward

[Copilot Memory](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/copilot-memory/manage-as-administrator) can retain repository facts and user preferences. In the simulation, we added misleading entries using the agent’s /memory command. If those entries are used in later interactions, the effects can outlast the initial sign-in. The behavior depends on which memory features and policies are enabled.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ca99025e30c8da6.webp)

Figure 4. Misleading memory can affect later agent interactions. Conceptual illustration.

### 3\. Synced sessions reveal earlier context

Where [cloud session storage](https://docs.github.com/copilot/concepts/agents/copilot-cli/chronicle) is enabled, we could read the test account’s synced Copilot CLI sessions, including sessions from before the simulation. They may contain code snippets, file paths, architecture discussions, and other work context. For Copilot Business and Enterprise, availability depends on the organization’s session-storage policy; syncing a session does not itself enable remote control.

### 4\. Repository access follows the account

In the lab, the authorization let us access private repositories available to the test account. The request included the repo scope along with read:user, read:org, gist, and codespace. These scopes are chosen by the client that starts the flow; the resulting repository access reflects the requested scopes and the account’s permissions, not a property of Copilot CLI itself. The potential exposure is bounded by the account’s repository access, which can include application code and infrastructure definitions.

A phishing message, a click, and a GitHub authorization can each look unremarkable on their own. The challenge for defenders is recognizing when they belong to the same attempted takeover. The legitimate verification page is part of the story, not evidence that the request was safe.

## Turning a phishing attempt into a Defender signal

Microsoft Defender helps organizations detect and respond to device code phishing targeting GitHub accounts. With the [GitHub Enterprise Cloud connector enabled](https://learn.microsoft.com/en-us/defender-cloud-apps/protect-github) in Microsoft Defender for Cloud Apps, organizations gain visibility into GitHub activity that can support investigations of suspicious authorization patterns.

As part of our research, we developed two detections for suspected GitHub Copilot CLI device code phishing, covering attacks delivered through email and Microsoft Teams.

These detections correlate suspicious messages and clicks with subsequent GitHub OAuth token creation and regeneration events, helping identify potentially unauthorized Copilot CLI authorizations that might otherwise appear legitimate. Microsoft Defender XDR customers can refer to the list of applicable detections below.

|     |     |     |
| --- | --- | --- |
| **Microsoft Defender coverage** | **Observed activity** | **Tactic** |
| Microsoft Defender XDR: Suspected GitHub Copilot CLI device code phishing via email | Suspected device code phishing delivered through email, potentially resulting in unauthorized GitHub Copilot CLI access. | Initial Access / Credential Access |
| Microsoft Defender XDR: Suspected GitHub Copilot CLI device code phishing via Microsoft Teams | Suspected device code phishing delivered through Microsoft Teams, potentially resulting in unauthorized GitHub Copilot CLI access | Initial Access / Credential Access |

Beyond detection, we also developed a disruption action for GitHub Enterprise Managed Users (EMU). This action suspends the affected managed identity through the organization’s identity provider, interrupting the attacker’s access. We validated this capability in our research environment.

Responders should also review and revoke unexpected OAuth authorizations, verify that access is blocked, and investigate potentially affected sessions, repositories, and saved memory.

Together, these capabilities help security teams move from identifying a potential phishing attempt to containing the affected identity. Detection and disruption availability depend on the supported configuration, required telemetry, identity integration, and deployment prerequisites.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf28d32d53bbd009.webp)

Figure 5. Microsoft Defender alert generated for suspected GitHub Copilot CLI device code phishing via email.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59d96a9501d1e24e.webp)

Figure 6. Research model for identifying and containing the affected managed identity. Conceptual illustration.

## Mitigation and protection guidance

-   Make the approval rule clear to everyone who uses developer and AI tools: enter a device code only for a sign-in you initiated yourself. An unexpected request to “verify” GitHub or activate Copilot should be treated as a phishing attempt, even if the page is hosted on github.com. GitHub’s own verification page warns users never to use a code sent by someone else.
-   Configure [Safe Links policies](https://learn.microsoft.com/en-us/defender-office-365/safe-links-policies-configure) in Microsoft Defender for Office 365 for email and verify [Safe Links protection for Microsoft Teams](https://learn.microsoft.com/en-us/defender-office-365/mdo-support-teams-quick-configure). These protections can help with malicious links and provide investigation context; a legitimate GitHub verification URL still requires the user to recognize an unsolicited code request.
-   **Review** **[GitHub Copilot CLI session settings](https://docs.github.com/copilot/concepts/agents/copilot-cli/about-remote-control).** For organization-provided seats, GitHub’s “Store local sessions in the Cloud” policy determines whether sessions can be stored and remotely controlled. Choose the least permissive setting that supports your workflows. Remote control also requires an active, online interactive session.
-   Review [authorized OAuth applications](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/reviewing-your-authorized-oauth-apps) in GitHub account settings and revoke authorizations that are unexpected or no longer needed. Limit repository access with appropriate [organization roles](https://docs.github.com/organizations/managing-user-access-to-your-organizations-repositories/repository-roles-for-an-organization) so an affected account cannot reach more code than its work requires.
-   If Copilot Memory is enabled, use GitHub’s [memory-management controls](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/copilot-memory/manage-as-administrator) to review and remove suspicious repository facts or user preferences. [Disabling memory](https://docs.github.com/copilot/how-tos/use-copilot-agents/copilot-memory/manage-for-yourself) does not automatically delete entries already stored, so review the saved content during incident response.
-   [Connect GitHub Enterprise Cloud](https://learn.microsoft.com/en-us/defender-cloud-apps/protect-github) to Defender for Cloud Apps and validate the activity available in your environment before relying on it for investigations.

### Remember: A legitimate sign-in can still be the wrong one

The most striking part of this simulation was how little needed to look suspicious. The user visited the real GitHub site and approved a normal-looking request. Yet the approval belonged to a client the user had not started. From there, the consequences depended on what that identity could access and which Copilot CLI capabilities were enabled.

That is why this is more than a story about a code. As AI agents gain access to repositories, session history, and local tools, the impact of a phished authorization increasingly depends on what those agents can reach.

A legitimate verification page does not mean the request is safe. Users should approve only device-code requests they initiated. Organizations should regularly review and revoke unexpected GitHub OAuth authorizations, restrict Copilot session and memory settings to what their workflows require, and validate GitHub activity visibility in Microsoft Defender for Cloud Apps to support investigations.

Ultimately, protecting against device code phishing requires both user awareness and the ability to connect suspicious authorization activity to the phishing attempt that preceded it.

### MITRE ATT&CK techniques observed

These mappings describe behaviors demonstrated in the proof-of-concept simulation, not an attributed campaign.

-   [T1566.002 – Phishing: Spearphishing Link](https://attack.mitre.org/techniques/T1566/002/) (Initial Access). In the tested email delivery, a link led the user to the device authorization page and prompted approval.
-   [T1528 – Steal Application Access Token](https://attack.mitre.org/techniques/T1528/) (Credential Access). After the test account approved the request, the attacker-controlled client obtained an OAuth token.

## References

1.  [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps). GitHub Docs. Explains the OAuth device authorization flow, including how users approve requests and how applications obtain access tokens.
2.  [Authenticating GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli). GitHub Docs. Describes the supported authentication methods for GitHub Copilot CLI.
3.  [Remote control of GitHub Copilot CLI sessions](https://docs.github.com/copilot/concepts/agents/copilot-cli/about-remote-control). GitHub Docs. Explains how active Copilot CLI sessions can be accessed and controlled remotely, including relevant prerequisites.
4.  [GitHub Copilot session data](https://docs.github.com/copilot/concepts/agents/copilot-cli/chronicle). GitHub Docs. Provides information about session history and cloud synchronization in GitHub Copilot CLI.
5.  [Managing Copilot Memory for an enterprise, organization, or repository](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/copilot-memory/manage-as-administrator). GitHub Docs. Describes how administrators can manage memory settings and stored information.
6.  [Reviewing your authorized OAuth apps](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/reviewing-your-authorized-oauth-apps). GitHub Docs. Explains how users can review and revoke OAuth application authorizations.
7.  [Repository roles for an organization](https://docs.github.com/organizations/managing-user-access-to-your-organizations-repositories/repository-roles-for-an-organization). GitHub Docs. Describes repository permission levels and how organizations can limit access according to user responsibilities.
8.  [Protect your GitHub Enterprise environment](https://learn.microsoft.com/en-us/defender-cloud-apps/protect-github). Microsoft Learn. Explains how to connect GitHub Enterprise Cloud to Microsoft Defender for Cloud Apps to gain visibility into GitHub activity and support security investigations.
9.  [Configure Safe Links policies in Microsoft Defender for Office 365](https://learn.microsoft.com/en-us/defender-office-365/safe-links-policies-configure). Microsoft Learn. Provides configuration guidance for Safe Links protection against malicious URLs.

## Learn More

For the latest security research from the Microsoft Threat Intelligence community, check out the [Microsoft Threat Intelligence Blog](https://aka.ms/threatintelblog).

To get notified about new publications and to join discussions on social media, follow us on [LinkedIn](https://www.linkedin.com/showcase/microsoft-threat-intelligence), [X (formerly Twitter)](https://x.com/MsftSecIntel), and [Bluesky](https://bsky.app/profile/threatintel.microsoft.com).

To hear stories and insights from the Microsoft Threat Intelligence community about the ever-evolving threat landscape, listen to the [Microsoft Threat Intelligence podcast](https://thecyberwire.com/podcasts/microsoft-threat-intelligence).

Review our documentation to learn more about our real-time protection capabilities and see how to enable them within your organization.  

-   Learn more about  [securing Copilot Studio agents with Microsoft Defender](https://learn.microsoft.com/en-us/defender-cloud-apps/ai-agent-protection)  
-   Evaluate your AI readiness with our latest [Zero Trust for AI workshop](https://microsoft.github.io/zerotrustassessment/).
-   [Microsoft 365 Copilot AI security documentation](https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-ai-security)
-   [How Microsoft discovers and mitigates evolving attacks against AI guardrails](https://www.microsoft.com/en-us/security/blog/2024/04/11/how-microsoft-discovers-and-mitigates-evolving-attacks-against-ai-guardrails/)
-   [Prompt injection protection in Microsoft Defender for Office 365](https://learn.microsoft.com/en-us/defender-office-365/step-by-step-guides/prompt-injection-protection-defender-for-office-365) – official documentation of the prompt injection protection in Microsoft Defender for Office 365.
-   [How Microsoft discovers and mitigates evolving attacks against AI guardrails | Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2024/04/11/how-microsoft-discovers-and-mitigates-evolving-attacks-against-ai-guardrails/)
-   [Manipulating AI memory for profit: The rise of AI Recommendation Poisoning | Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/) – a related example of an AI-era technique observed in email traffic
-   [Defending the inbox against prompt injection attacks | Microsoft Defender for Office 365 Blog](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/defending-the-inbox-against-prompt-injection-attacks/4534636) – feature announcement introducing prompt injection protection in Microsoft Defender for Office 365.
-   Learn how Microsoft is reimagining the SOC for the agentic era with [ISOC in Microsoft Defender](https://www.microsoft.com/security/blog/2026/09/23/reimagining-the-soc-for-the-agentic-era-in-microsoft-defender/)

The post [The risks of device code authentication for AI coding agents](https://www.microsoft.com/en-us/security/blog/2026/11/17/the-risks-of-device-code-authentication-for-ai-coding-agents/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog).
