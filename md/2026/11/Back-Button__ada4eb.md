---
title: Back Button
source: https://www.rapid7.com/blog/post/em-claude-access-brings-ai-context-into-surface-command-asm-easm
source_host: www.rapid7.com
clip_date: 2026-11-19T09:15:32+08:00
trace_id: ab52d159-bc95-4134-8e79-77b12762f181
content_hash: 6ca13c32d7a5573eb10dc315bbc52a0024c42d75cf100a81ce7f06b597dfc311
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-81e0-8145-dafe5ba0e465
ioc: null
---

Approving an AI service is only the starting point. As employees adopt Claude and their responsibilities change, security teams need to know who has access, which users hold administrative privileges, and whether those roles and group memberships still reflect the work they do.

[IBM’s 2025 Cost of a Data Breach Report](https://newsroom.ibm.com/2025-07-30-ibm-report-13-of-organizations-reported-breaches-of-ai-models-or-applications%2C-97-of-which-reported-lacking-proper-ai-access-controls) found that, among studied organizations reporting an AI-related breach, 97% lacked proper AI access controls. The finding highlights a broader challenge: AI adoption needs security practices that extend beyond the initial approval, supported by information teams can use to review access with administrators and service owners.

[Rapid7 Surface Command](https://www.rapid7.com/products/command/attack-surface-management-asm/) now integrates with Claude’s Compliance API, bringing supported organization, user, role, group, and settings information into the same platform teams use to understand other assets and identities. The integration helps security teams make enterprise Claude access part of their existing review practices.

## Bring enterprise AI access into your security view

An account list tells security teams who is present, while roles and group memberships help explain how access is organized and where further review may be needed. Surface Command’s integration with Claude’s Compliance API brings together:

-   **Organizations and users:** Visibility into the Claude organization and its associated user accounts.
    
-   **Roles and groups:** Context to understand users’ assigned roles and group memberships.
    
-   **Organizational settings:** Available configuration information to support review of the enterprise Claude environment.
    

With those details in Surface Command, practitioners can examine Claude identities alongside the other assets and identities they manage. That gives them a clearer basis for working with service owners to evaluate whether access remains appropriate as teams and responsibilities change.

The integration focuses on administrative visibility. It does not ingest Claude conversation content, provide threat detection on Claude activity, or control Claude’s behavior.

## From a user record to an informed access review

Consider a security practitioner reviewing administrative access to Claude. In Surface Command, they can inspect an imported user’s details, review their organization role and administrative status, and examine their group memberships. The relationship graph provides a visual view of how that user connects to the organization and its groups, making those associations easier to follow.

![image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a5dc09c1233a55db.png)

The practitioner can then work with the service owner to confirm whether administrative privileges are still needed, whether group memberships reflect current responsibilities, and whether those assignments align with the organization’s access model.

Surface Command provides information to support the review, while the team applies its policies and judgment to determine whether a change is needed.

![image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9faa66e0098d455c.png)

## Support AI adoption with clearer accountability

As Claude becomes part of everyday work, reviewing its users and access relationships becomes part of managing the environment. Bringing that information into Surface Command helps security practitioners and service owners work from a shared understanding of assigned roles and group memberships. It supports more informed access decisions and helps security leaders incorporate enterprise AI into established oversight practices.

## Get started with Claude and Surface Command today

The integration is available through the Anthropic connector in the Rapid7 Extension Library. Using Claude’s Compliance API requires a Compliance API key and the appropriate entitlement for your Claude organization.

Visit the [connector page](https://extensions.rapid7.com/extension/anthropic_app) to get started and see how Surface Command brings Claude users, roles, and group relationships into view.
