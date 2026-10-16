---
title: 'When Backups Open Backdoors: Accessing Sensitive Cloud Data via "Synology Active Backup for Microsoft 365"'
source: https://modzero.com/en/blog/when-backups-open-backdoors-synology-active-backup-m365/
source_host: modzero.com
clip_date: 2026-10-16T10:24:12+08:00
trace_id: d2ca673b-095c-40e3-8c10-aa62e86a6a34
content_hash: f983581bf33235303e29753dbd645ea6ef83e80ef72529832fc646faf7dbe04a
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: modzero·漏洞研究
ai_summary: Synology ABM 中间件在每次设置时于 302 重定向 URL 中泄露全局应用的 client_secret，任何人可借此换取 Microsoft Graph 令牌，读取所有使用该备份插件的组织的 Teams 频道消息与组数据。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3fb75244-d011-81bc-b327-e04427cca1c9
ioc:
  cves:
    - CVE-2025-3695
    - CVE-2025-4679
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Synology ABM 中间件在每次设置时于 302 重定向 URL 中泄露全局应用的 client_secret，任何人可借此换取 Microsoft Graph 令牌，读取所有使用该备份插件的组织的 Teams 频道消息与组数据。
> 
> - **泄露方式：** 设置流程中 SynoOauth 中间件跳回 NAS 的 `Location` 头明文携带 `graph_refresh_token`、`client_id` 和 `client_secret`，而该 secret 从未被实际使用。
> - **密钥归属：** 泄露的是 Synology 自己租户中 ABM 全局应用注册（client ID `b4f234da-3a1a-4f4d-a058-23ed08928904`）的凭据，并非用户租户内新建的应用。
> - **利用条件：** 用 `client_credentials` 授权向任意租户的 `login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token` 请求即可拿令牌，无需任何前置访问；令牌含 `Group.Read.All`、`ChannelMessage.Read.All`，可读全部组、Outlook 会话及公开/私有 Teams 频道消息（不含群聊）。
> - **影响与定级：** ABM 装机量超 120 万，等于对所有已同意该应用的组织形成后门；Synology 给 CVSS 6.5（Moderate），研究者主张 8.6（High），分歧在 PR 与 Scope。
> - **披露与检测：** 2025-04-04 报告，CVE-2025-4679，05-16 发公告（未事先告知、描述含糊且未通知受影响用户），06-27 研究者公开；IoC 包括上述 client ID、secret 前 15 字符 `ARI8Q~sHOuwMoX.`、来自 220.130.175.235 / AS3462 的服务主体登录及非备份时段对 Graph 的异常请求。

## TL;DR

We discovered a leaked credential that allowed anyone unauthorized access to all Microsoft tenants of organizations that use Synology’s [“Active Backup for Microsoft 365”](https://www.synology.com/en-global/dsm/feature/active_backup_office365) (ABM). This flaw could be leveraged by malicious actors to obtain potentially sensitive information — such as all messages in Microsoft Teams channels. It was reported to Synology and tracked as [CVE-2025-4679](https://www.cve.org/CVERecord?id=CVE-2025-4679).

This blog post contains the full technical walk-through and discovery of the vulnerability, its impact, and our experience during the responsible disclosure process with Synology.

The standalone disclosure report is available on our [advisory page](https://modzero.com/en/advisories/mz-25-02-synology-active-backup-m365/) and potential Indicators of Compromise (IoC) are provided [in a dedicated section](https://modzero.com/en/blog/when-backups-open-backdoors-synology-active-backup-m365/#indicators-of-compromise) further below.

* * *

## Background

During a red-team engagement against a customer’s Microsoft Entra tenant and Azure infrastructure we came across an application named [“Synology Active Backup for M365”](https://www.synology.com/en-global/dsm/feature/active_backup_office365).

The application had broad permissions — such as read access to all groups and Microsoft Teams channel messages — making it an ideal target to obtain information that may be useful for further attacks (i.e. credential abuse or [social engineering](https://www.microsoft.com/en-us/microsoft-365-life-hacks/privacy-and-safety/what-is-social-engineering)).

To analyze it, we created our own lab environment consisting of a [Microsoft sandbox tenant](https://developer.microsoft.com/en-us/microsoft-365/dev-program) and the ABM add-on installed within Synology’s [DiskStation Manager](https://www.synology.com/en-us/dsm) (DSM) operating system. For research purposes it is not necessary to have a Synology NAS appliance, as the entire OS can be [virtualized via Docker](https://github.com/vdsm/virtual-dsm). We also built some tools along the way, which can be helpful to reverse engineer [DSM add-on packages](https://archive.synology.com/download/Package/). We will share them for other security researchers on [our GitHub](https://github.com/modzero/) soon.

### About ABM

Synology is best known for its network-attached storage (NAS) solutions, marketed as backup servers for private or business use. “Active Backup for Microsoft 365” (ABM) is their free software add-on developed for the DSM. It offers integration with Microsoft services, such as OneDrive, SharePoint, Exchange Online and Microsoft Teams, to perform automated backups. With over 1.2 million installations, the add-on sees broad adoption among organizations that are transitioning to cloud-based workloads.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/52778ea9d46c1d25.png)

Synology DSM Package Center – ABM add-on page

#### Setup

After installing ABM, the user is guided through a setup wizard, which is designed to link the NAS instance to their respective Microsoft tenant. This is the most interesting aspect of the [setup process](https://kb.synology.com/en-uk/DSM/tutorial/Quick_Start_Active_Backup_for_Microsoft_365), as it facilitates the access to an organization’s data in the cloud.

High-level setup procedure:

1.  **Login & Consent** – The wizard sends the user to the Microsoft login portal where they sign in, and are prompted to grant admin consent for ABM’s requested permissions within the tenant.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9dfb56ec8bf7e1fc.png)

ABM permissions admin consent prompt for the organization

2.  **Handoff** – After confirmation, an OAuth login through the ABM application is performed. Microsoft hands off the user and their resulting authorization details (the auth code) to a Synology middleware service, which then forwards everything back to the user’s NAS instance.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/845fb47e05b81ee8.png)

Synology middleware ("SynoOauth") – NAS instance redirect prompt \[redacted for display\]

3.  **Finalization** – The ABM add-on on the NAS exchanges the user’s authorization details for a Microsoft Graph API scoped access token at the organization’s Microsoft OAuth endpoint to finalize the setup.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3f58d6ebb64828b8.png)

General ABM setup overview

*Sidenote: The user is also required to activate the add-on with their Synology account after installation as part of the setup procedure, for which further details are skipped in this post.*

## Technical Concepts & Context

Before diving into the details of the vulnerability, let’s take a step back and cover a few basics related to the [authentication concepts of Microsoft Entra](https://learn.microsoft.com/en-us/graph/auth/auth-concepts).

### Identities, Applications, and Permissions

The ABM add-on leverages the [Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-overview), allowing companies like Synology to publish Software-as-a-Service (SaaS) applications that users access through their Microsoft account. These accounts are managed by the dedicated Microsoft tenant of an organization, which is a trusted cloud instance of [Microsoft Entra ID](https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id). Each tenant stores and manages all organizational data across Microsoft 365 services, like Microsoft Teams.

ABM is published as a *multi-tenant application* by the Synology tenant, enabling other organizations to “install” it within their own. The application properties, such as authentication settings, are globally defined by the “app registration” of the publishing tenant. Whereas each consuming tenant maintains a local representation known as a “service principal” — determining the application’s effective permissions within that tenant.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/66b9e25570541105.png)

Simplified Microsoft Entra multi-tenant application concept (ABM)

Permissions granted through consent — either by individual users or the organization’s administrators — determine the actions an application can perform against APIs such as [Microsoft Graph](https://learn.microsoft.com/en-us/graph/traverse-the-graph). These permissions can be of type *delegated* (signed-in user required) or *application* (may act independently). Therefore, authenticating as either a user or the service principal of an application grants access to the tenant’s protected data. ABM is configured to request both types of permissions, including privileged access such as reading [**details of every group**](https://graphpermissions.merill.net/permission/Group.Read.All?tabs=apiv1%2CadministrativeUnit1) (`Group.Read.All`) as well as [**all Microsoft Teams channel messages**](https://graphpermissions.merill.net/permission/ChannelMessage.Read.All?tabs=apiv1%2CaiInteraction1) (`ChannelMessage.Read.All`) via application permissions. As such, when ABM is setup for the first time, an organization’s administrator must grant those requested permissions for their entire tenant.

However, we will later learn why granting those privileges to ABM is a **fatal mistake**.

### Authentication

After ABM is installed and consented to within the tenant, an [OAuth authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) login through the application is performed. This lets third-party applications authorize the logged-in user against the configured APIs via an authorization code issued by Microsoft. This code is then relayed to the ABM add-on on the respective NAS instance where the setup was initiated from.

Now, you might still be wondering how it is determined as to where exactly the authorization details should be returned to in the first place. As noted earlier, the setup process involves a middleware component that acts as a broker between Microsoft and the NAS instance. When the OAuth flow is initiated, the location of the NAS (DNS hostname) is included as part of the redirect URL. After successful authentication, Microsoft forwards the user to the aforementioned Synology middleware service (a web application at `synooauth.synology.com`), which uses the URL to facilitate the hand off to the NAS instance.

### Data Access

After receiving the authorization details, the ABM add-on exchanges it for access tokens at the respective user’s tenant. This allows the user to complete the setup procedure as [per documentation](https://kb.synology.com/en-uk/DSM/tutorial/How_to_register_an_Azure_AD_app_M365), by following up with registering a *dedicated* app registration within the organization *on behalf of the authenticated user*. Subsequently the actual backup tasks are performed through this access.

## The Vulnerability

With these technical concepts in mind, we can get to the actual vulnerability. The flaw itself is surprisingly trivial, and specifically involves the *granted application permissions* of ABM and the *Synology middleware component* (SynoOauth) utilized during the setup process.

In our analysis of ABM we examined our browser’s network traffic during the setup, and noticed something peculiar in the HTTP response of the redirect from the middleware component to our NAS instance:

```http
HTTP/2 302 Found
Location: [...]/activebackupoffice365-cgi.cgi?action=oauth
          &graph_refresh_token=1.Aa4ABLPUicJgkEm4oYYv[...]
          &resource=https%3A%2F%2Fgraph.microsoft.com
          &client_id=b4f234da-3a1a-4f4d-a058-23ed08928904
          &client_secret=ARI8Q%7EsHOuwMoX.[...]
```

SynoOauth middleware – HTTP 302 response redirect containing OAuth information \[truncated and redacted for display\]

Did you spot it? The response includes several parameters within the `Location` header, one of which is a value for `client_secret`. But we logged in to ABM through a user account of our Microsoft tenant using *OAuth code flow*, why would there be a *secret credential* for an *application*?

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/011f7b303029559b.png)

Secret credential exposed in response redirect of SynoOauth middleware during ABM setup

We initially assumed that we might have overlooked a network request — which would register an application with client credentials within our tenant — but we were surprised that this was not the case. Remember, the full installation procedure does in fact mandate creating an app registration within the user’s tenant, but this is not initiated until the flow reaches the NAS instance to complete the setup.

When we verified that there was no such application created within our lab tenant, an uneasy feeling came over us that the exposed secret might belong to something else…

### Discovery

To test whether the credential was actually valid at all, we sent the following HTTP request to obtain an access token for the ABM service principal from our tenant’s OAuth endpoint:

```bash
curl -X POST https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token \
     -d "grant_type=client_credentials" \
     -d "client_id=b4f234da-3a1a-4f4d-a058-23ed08928904" \
     -d "client_secret=ARI8Q%7EsHOuwMoX.[...]" \
     -d "scope=https://graph.microsoft.com/.default"
```

cURL command demonstrating the ["OAuth client credentials grant flow"](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow) to retrieve a Microsoft Graph API access token for the ABM service principal using the client credentials \[redacted for display\]

And… we were surprised that it worked:

```json
{
    "aud": "https://graph.microsoft.com",
    "iss": "https://sts.windows.net/<TENANT_ID>/",
    [...]
    "app_displayname": "Synology Active Backup for M365",
    "appid": "b4f234da-3a1a-4f4d-a058-23ed08928904",
    [...]
    "idtyp": "app",
    [...]
    "roles": [
        "Group.Read.All",
        "ChannelMessage.Read.All"
    ],
    [...]
}
```

Access token (JWT) showing granted application permissions for Microsoft Graph confirming validity of the secret credential \[base64-decoded and truncated for display\]

### Impact

So, what does this mean? Remember that we went through the concept of multi-tenancy and permissions earlier, and that by default, ABM requests tenant-wide application permissions to access all Teams channel conversations and group data.

Well what if the secret is not actually a credential for a *service principal in our tenant* but that of the *app registration in Synology’s tenant*? To verify this, we also tried the credentials with the tenant of our customer during the red-team engagement (to which we had only guest-level access up until that point), which shockingly worked just the same.

And indeed, it turns out that the credential belonged to Synology’s ABM *global* app registration in *their* Microsoft tenant. What’s even worse is that this means that their middleware service had been inadvertently exposing this credential during *every setup*.

As previously mentioned, the add-on had been installed over *a million times*, meaning that we had **discovered a serious backdoor** into *a lot* of **organization’s Microsoft tenants** and their **cloud data** through the Synology published application. This ultimately allowed broad read-only access to:

-   List and read all groups and their properties, including memberships and their Microsoft 365 content such as Outlook conversations, calendar and events, etc.
-   List and read all public and private Teams channel messages (not group chats), including replies and embedded content such as images or cards

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8da5deb6bf7d0d75.png)

Attack scenario leveraging the ABM application secret to access an organization's cloud data

One could also imagine scenarios where malicious actors exploit such access for industrial espionage, ransomware preparation, or selling sensitive data on underground forums.

Crucially, exploitation requires **no prior foothold** in any target’s Microsoft tenant, as simply observing the leaked secret from the SynoOauth middleware *once* is sufficient. Thus, for an unknown period of time, **anyone could have obtained this secret** to compromise organizations that use ABM.

*Sidenote: What’s even more confusing is that the secret is never actually used within the setup, whether in the tenant nor add-on in DSM.*

## The Cloud

Before we dissect the disclosure process, it is worth pausing to reflect on what this tells us about cloud-based services.

Cloud providers and managed solutions promise advantages like easier server hosting and running certain services, yet this convenience often substitutes the complexity of *operating* with that of *configuring* (i.e. securing) everything correctly. This complexity increases with the number of components that you integrate, which inherently expands your attack surface. Supply-chain issues, like the one discussed in this blog post, are a textbook example of how this is becoming increasingly prevalent. For that reason, it is important to ensure that you do your best in all aspects over which you still have control; such as implementing appropriate logging, monitoring, and detection capabilities across the organization, as well as realizing the [shared-responsibility model](https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility).

Managed cloud services differ substantially from traditional, self-hosted solutions, primarily because vulnerability disclosure is often opaque or absent. Since the vendor is responsible for fixing any issues, users often remain unaware of vulnerabilities that may exist or have existed. This might seem desirable from a customer point of view, but it feeds into a bigger issue. When vendors silently update, their users will never learn that they were vulnerable in the first place, as they did not (have to) disclose that. Additionally, there would be no way to properly evaluate the vendor’s security posture, i.e. by how many vulnerabilities there have been in the past, especially concerning how long it took to fix them. This typically means that no CVE is assigned specifically in cases of cloud vulnerabilities.

Recognizing this, industry leaders such as Microsoft have started [advocating for greater transparency](https://msrc.microsoft.com/blog/2024/06/toward-greater-transparency-unveiling-cloud-service-cves/) by calling upon providers to disclose vulnerabilities even in fully managed cloud-based scenarios. We share this sentiment and have explicitly requested Synology ([an authorized CNA](https://www.synology.com/en-ca/security#:~:text=CVE%20Numbering%20Authority)) to assign a CVE during our disclosure. Synology seemingly concurred and assigned [CVE-2025-4679](https://www.cve.org/CVERecord?id=CVE-2025-4679) for the vulnerability. We want to *highly commend* them at that point, but the subsequent disclosure process is unfortunately where the good part ends…

## Disclosure

Following our standard [vulnerability disclosure process and policy](https://modzero.com/static/modzero_Disclosure_Policy.pdf), we reported our finding to Synology on April 4th 2025, while also explicitly requesting CVE assignment. They acknowledged and confirmed the vulnerability and informed us that `CVE-2025-3695` (note: a different one at first) had been reserved, while also working on a fix. However, from here on the communication mainly involved discussions about the discrepancies in the assessment of severity and scope.

In a follow up email, Synology had determined the details of the CVE and stated that they had come up with a CVSS score of `6.5` (severity `"Moderate"`), a big step down from our proposed `8.6` (severity `"High"`). The main difference in their calculation being the metrics “privileges required” (PR) from `None` to `Low`, and the “scope” (S) from `Changed` to `Unchanged`. We explained that these changes did not reflect our assessment of the issue, which made us question whether the vulnerability was understood correctly by Synology in the first place. This doubt was further raised by the bug bounty amount they wanted to “reward” us, as they initially assumed that our report was submitted as part of their [Security Bug Bounty Program](https://www.synology.com/en-uk/security/bounty_program). However, since we generally deny accepting the restrictive nature of bug bounty conditions (i.e. restriction of publication), we clarified that we submitted following industry practice responsible disclosure, and declined their offer of *~$417* for the report.

We further emphasized that it is trivial to obtain the secret, as an attacker does not require any “special” privileges for neither Synology’s middleware component nor any target’s Microsoft tenant. This circumstance clearly demonstrates the [“Scope: Changed” metric](https://www.first.org/cvss/v3-1/specification-document#2-2-Scope-S), as the exploited vulnerability affects data within entirely different security boundaries — namely all organizations’ Microsoft tenants, not just Synology’s own systems.

Despite our attempts at clarification, Synology would not consider our arguments further. Later it came to our surprise that they maintained their own assessment, as they [published the advisory](https://web.archive.org/web/20250522140114/https://www.synology.com/en-ca/security/advisory/Synology_SA_25_06) without informing us. In our opinion, apart from severely lowering the impact rating, they opted to be vague in the abstract of the vulnerability:

> “A vulnerability in Synology Active Backup for Microsoft 365 allows remote authenticated attackers to obtain sensitive information via unspecified vectors.”

Excerpt from the advisory of Synology's description of the vulnerability

This description omits all the interesting details, such as *which* and *how* “sensitive information” could have been accessed. It also makes it sound like the requirement for an attacker to authenticate *somewhere* would constitute a security boundary. In reality, malicious actors could **trivially compromise all users of ABM** by leveraging the **publicly exposed credential**.

To our knowledge, Synology also has yet to inform impacted users of this attack vector having potentially been exploited. Apart from publishing the advisory which states that customer action is not required, we believe that a more informative notice i.e. containing [Indicators of Compromise (IoC)](https://www.microsoft.com/en-us/security/business/security-101/what-are-indicators-of-compromise-ioc) would have been more appropriate. Therefore, we independently provide a few of those in this post further below.

## Conclusion

At the risk of sounding preachy: the real lesson is that the convenience of cloud does not absolve anyone of doing their security diligence. In today’s shifting threat landscape, organizations invite attacks simply through the complexity of everything. The fact that third-party vendors, such as Synology, have this kind of access to an organization’s data at any given time should already send shivers down your spine. A simple 40-character string leaked by a vendor you entrusted to use can be all it takes for your precious data to be compromised and sold on the dark web. If your data is so important that it merits backups, you must accept that the very risks and responsibilities you hoped to delegate will ultimately end up back with you. Therefore, you should implement the appropriate measures before that day comes.

### Takeaways

A few concrete learnings for the different stakeholders:

**Organizations**

-   Regularly audit third-party provider permissions and access
-   Implement logging and monitoring for capabilities to detect unauthorized access
-   Realize your due diligence responsibilities within the [shared responsibility model](https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility)

**Researchers**

-   Follow your intuition when doing security research
-   Identify assumed security boundaries to understand broader implications
-   Advocate for transparency of cloud vulnerabilities for more awareness and as potential learning material

**Vendors**

-   Apply and validate adherence to the principle of least privilege
-   Transparently disclose vulnerabilities and notify/support impacted users appropriately
-   Recognize that your services may have substantial impact due to being high value targets within cloud-based supply chain attacks

* * *

## Indicators of Compromise

| Signal | Location |
| --- | --- |
| ABM client ID (global application ID): `b4f234da-3a1a-4f4d-a058-23ed08928904` (`"Synology Active Backup for M365"`) | Entra/Azure sign-in logs |
| ABM app registration client secret value: `ARI8Q~sHOuwMoX.` (first 15 characters) | Traffic logs (i.e. WAFs/load balancers) |
| ABM service principal sign-ins from IP `220.130.175.235` or ASN range `"AS3462 Data Communication Business Group"` (Taiwan) | Entra/Azure sign-in logs |
| Large volume API requests for Microsoft Teams from IPs not maching the respective NAS instance | Microsoft Graph activity logs |
| Unusual egress from NAS instance to Microsoft Graph API outside backup windows | Traffic logs (i.e. WAFs/load balancers) |
| Foreign service principals with (privileged) application permissions | Microsoft Graph API (`appOwnerOrganizationId`!= tenant GUID) |

*Note: It is unknown why IPs from AS3462 are singning in to the ABM service principals. They are likely performed by Synology.*

## Disclosure Timeline

| Date | Comment |
| --- | --- |
| April 4, 2025 | modzero sends responsible disclosure report to Synology and requests CVE through Synology CNA |
| April 11, 2025 | modzero inquires whether report was received |
| April 14, 2025 | Synology confirms reception of the report, points out that submissions are only accepted via their Security Bug Bounty Program |
| April 14, 2025 | modzero inquires about CVE assignment |
| April 15, 2025 | Synology offered to reward modzero for the efforts, reserved CVE-2025-3695 for the vulnerability as a “one time exception” |
| April 23, 2025 | modzero clarifies report was not a submission for the bug bounty program, asks for description and CVSS vector of CVE-2025-3695 |
| April 24, 2025 | Synology provides assessed description and CVSS vector |
| May 5, 2025 | modzero proposes adapting CVSS vector |
| May 7, 2025 | Synology declines proposal, provides reasoning |
| May 16, 2025 | Synology publishes vulnerability advisory with CVE-ID CVE-2025-4679 |
| May 16, 2025 | modzero requests to update CVSS vector and description, provides justification |
| May 22, 2025 | modzero asks for response to the feedback |
| May 25, 2025 | Synology revises advisory to fix credits, refuses justification regarding vulnerability abstract and impact |
| June 27, 2025 | modzero publishes advisory and blog post |
