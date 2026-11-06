---
title: Threat actors use agentic AI tooling to find and abuse exposed secrets
source: https://www.microsoft.com/en-us/security/blog/2026/11/05/threat-actors-use-agentic-ai-tooling-to-find-and-abuse-exposed-secrets/
source_host: www.microsoft.com
clip_date: 2026-11-06T11:34:27+08:00
trace_id: 5246fd6f-26bb-4886-b1d9-f4c26e922861
content_hash: 74ab709dce7e35beb098748eb1a395197ce277ebdad9254f17502ee1ea2baeb6
status: synced
tags: []
series: null
feed_source: Microsoft Security Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41075244-d011-81e8-a622-d12a1b4744c8
ioc: null
---

Microsoft Threat Intelligence has observed threat actors using an agentic AI offensive framework to search public GitHub repositories for exposed secrets, including credentials, application credentials, and AI inference-related API keys across multiple applications and cloud services. These threat actors can then use the secrets for further malicious activity against the compromised organization.

Searching open code repositories for exposed credentials, secrets, keys, and other authentication material is a well-documented technique that has historically been limited by the time required for human operators to find code repositories, review the data in the repositories, and leverage authentication material for further action. However, agentic tooling like ARTEX allows threat actors to not only scan for secrets across multiple repositories at a quicker pace but also use the agents to analyze the output and conduct follow-on attacks, cutting down on the need for the threat actor to have hands-on-keyboard interactions throughout the attack chain. In at least one case, Microsoft observed an AI agent advance from scanning GitHub for secrets to exfiltrating data from Azure Key Vault in just five minutes.

Microsoft has also investigated follow-on activity involving the misuse of valid application credentials. As early as October 28, 2026, Microsoft began observing successful service principal sign-ins from the IP address 199.19.77\[.\]84 involving multiple application IDs across some impacted customers, including cases where a multitenant application credential was compromised at the source (vendor-owned application) and used to access multiple downstream tenants. The threat actor used the compromised credentials for cloud resource discovery, and credential and data exfiltration, including from Azure Key Vaults and Storage Accounts, and abuse of Azure AI services consistent with the activity described above. Additionally, Microsoft observed malicious activity originating from two IP addresses potentially associated with this campaign. We identified malicious operations from 65.87.223\[.\]26, including indications of vulnerability exploitation by embedded shell commands in a user agent and attempts to obtain App Service authentication tokens. A similar campaign involving the same IPs addressed was also reported by [Todyl](https://www.todyl.com/blog/stolen-app-credentials-real-access-an-actor-is-signing-into-entra-id-and-azure-devops-as-your-workloads). Separately, Microsoft observed reconnaissance operations from 157.22.126\[.\]128 targeting AI workloads deployed by victims on Azure AI services.

Microsoft encourages organizations to scan their code in GitHub and determine where any secrets are present. In addition to removing the secrets from the code base, affected organizations should immediately rotate any exposed keys or credentials. GitHub monitors public repositories by automatically scanning for secrets. In addition to scanning their own repositories, organizations can [enable public monitoring](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning) through GitHub to detect secrets leaked in secondary public repositories across GitHub. This extends secret scanning beyond the repositories an enterprise owns to follow potential secret exposure across the platform. [GitHub Advanced Security for Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/repos/security/github-advanced-security-secret-scanning?view=azure-devops) scans for credentials and other sensitive content in source code. Push protection can also block supported secrets before they’re pushed. Organizations need either GitHub Advanced Security for Azure DevOps or, for organizations using the standalone experience, GitHub Secret Protection for Azure DevOps enabled.

Secrets are exposed in public repositories when code containing the secret is committed to GitHub. Developers might store secrets in configuration files, scripts, or other code to quickly operationalize the OAuth application or avoid configuring more modern authentication flows. Organizations can reduce exposure by protecting workload identities and secrets, enforcing least privilege, safeguarding recovery resources, and enabling relevant [Microsoft Defender for Cloud](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-cloud-introduction) protections. Publicly exposed credentials remain usable until revoked or rotated; removing the original disclosure alone does not remediate the exposure. Microsoft recommends that developers [migrate OAuth applications away from secret-based authentication](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/migrate-applications-from-secrets). While storing long-lived application client secrets in code is a common practice, using managed identities for application authentication eliminates the possibility of secret exposure in code, manual processes associated with secret management, and barriers to securely scaling applications.

This activity illustrates an ongoing trend of threat actors [accelerating all stages of the attack chain with agentic AI](https://www.microsoft.com/en-us/security/blog/2026/10/21/storm-0940-uses-artex-agentic-ai-connectwise-supply-chain-compromise/) penetration testing frameworks, including ARTEX. As these capabilities evolve, defenders must similarly use AI to investigate and respond across large environments.

## From exposed secrets to cloud compromise

Starting in August 2026, Microsoft observed threat actors using an agentic AI offensive framework to submit large volumes of queries to GitHub for secrets. The queries submitted by the AI framework often included the name of a target organization, keywords for secrets, a keyword linked to cloud services, or a keyword linked to another AI service provider. Organizations that find their secrets exposed in public repositories must assume that the exposed secrets and associated applications are compromised.

## Follow-on actions

### Credential abuse via Entra ID

In one follow-on attack that began as early as October 28, 2026, an agentic framework used valid leaked or stolen application credentials to access Microsoft Entra ID tenants of certain organizations and connected Azure and Microsoft 365 resources. The sign-ins primarily came from two IP addresses: 199.19.77\[.\]84 and 199.19.77\[.\]18. The latter IP address is a Tor exit node, which might be associated with unrelated malicious activity, including from unrelated sources. The agent successfully conducted service principal sign-ins on dozens of associated applications across multiple tenants.. Service principals are the identities that applications use to authenticate and give direct, programmatic access to whatever the application is authorized to reach.

The threat actor targeted operations that return credentials, including storage account keys, App Service settings, connection strings and publishing credentials, AI and machine learning (ML) connections and datastores, and Azure Kubernetes Service (AKS) user credentials. The compromised applications subsequently accessed SharePoint and OneDrive in the targeted organization tenants, including file downloads and mailbox-item access. In some tenants, the threat actor sent Microsoft Graph API requests, which were mostly searches to find content of interest. The threat actor enumerated subscriptions, resource groups, permissions, AI model deployments, and service configurations in Azure to map the environment.

Additionally, the threat actor attempted to validate stolen Azure resources, including compromised Azure AI services, as identified using Defender for Cloud’s AI threat protection. Observed activity suggests that the threat actor might have attempted to abuse some of these compromised AI resources to facilitate their broader attack activity.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ce6400b2d6302315.webp)

Figure 1. Tactics, techniques, and procedures (TTPs) observed across the credential abuse attack chain

### Cloud API adjustments indicative of adaptive behavior

Additionally in this attack the agent’s operations on a victim’s Azure Resource Manager (ARM) instance originating from 199.19.77\[.\]84 demonstrated sequences consistent with adaptive troubleshooting, where failed cloud API requests were followed by changes to HTTP methods or API versions and subsequent HTTP 200 responses:

-   A batch of ARM requests attempting to enumerate secret metadata across multiple Azure Key Vault resources returned HTTP 400 (Bad Request). These requests specified a version associated with Key Vault’s data-plane APIs against ARM (control-plane) APIs. Approximately 28 seconds after the first failed response, a batch rerun began against the same vault resource paths using the ARM API version 2023-07-01 and returned HTTP 200.
-   A GET request to enumerate an Azure SQL server’s firewall rules specified an outdated API version and returned HTTP 400. Approximately 60 seconds after that request, a matching GET began using a supported version and subsequently returned HTTP 200. The URL changed only in its api-version parameter.
-   An ARM POST request to an Application Insights query endpoint returned HTTP 400 because an outdated API version was specified. Approximately 80 seconds after the failed request, another POST began against the same endpoint, specifying a supported API version, and subsequently returned HTTP 200.

### OAuth application abuse

In multiple cases, Microsoft observed the same agentic AI tools subsequently obtain a token for a [single-tenant OAuth application](https://learn.microsoft.com/en-us/entra/identity-platform/single-and-multi-tenant-apps) in the same target organization, then use the compromised OAuth application to enumerate other cloud resources within the organization. In some cases, the agents exfiltrated secrets from the organization’s Azure Key Vault. The agents once authenticated have also searched Azure DevOps for secrets. Until the secrets are revoked or rotated, they can allow a threat actor to maintain persistence in the organization, compromise additional identities, or hijack resources. In one observed case, an AI agent progressed from searching for the client secrets in GitHub to exfiltrating data from Azure Key Vault in five minutes.

The agents also used the compromised OAuth application to use the [Run Command](https://learn.microsoft.com/en-us/azure/virtual-machines/run-command-overview), which runs scripts in Azure VMs. With access to this functionality on a VM, a threat actor can access unsecured credentials and other stored data, compromise associated workload identities, or run code that provides persistence or lateral movement.

During this activity, the AI agents repeatedly demonstrated a focus on credentials that provide access to AI services, such as API keys for major AI service providers and OAuth applications with access to Foundry Tools (previously known as Azure Cognitive Services). Multiple public reports have documented threat actors using agentic AI tools to compromise credentials for AI services, sometimes to run the same agentic AI workflow.

## Mitigating application credential abuse activity

Microsoft recommends the following mitigation steps to contain, detect, and investigate this threat.

**Containment**

-   Block 199.19.77\[.\]84/32 as a named location in a Conditional Access policy targeting workload identities, assigned directly to service principals, and in a user-scoped block policy to cover replayed sessions. Note that workload identity policies require Workload ID Premium licensing and cover only single-tenant apps registered in your tenant. Block the exact IP rather than the whole ASN.
-   For affected users, revoke Entra sessions, Azure DevOps PATs and SSH keys.
-   For any affected application, remove all client secrets, certificates and federated credentials, including those added by the threat actor and disable the service principal if needed. Tokens already issued remain valid until expiry.
-   Rotate everything stored in any Key Vault the affected application could read, and any credentials found in accessed documents.
-   MSPs: Review Partner Center access, GDAP relationships, and customer tenants, and notify affected customers per your agreements.

**Detection and hunting**

-   Review Entra service principal and non-interactive sign-in logs for 199.19.77\[.\]84 and 199.19.77\[.\]18 including failed attempts. Sign-in errors AADSTS7000215 (invalid secret) or AADSTS7000222 (expired secret) indicate someone holds a credential for your app; a failure followed by a success is urgent.
-   Review Azure Activity, Key Vault and Storage diagnostics, Entra audit, Azure DevOps audit and Microsoft 365 unified audit logs for the address, including secret reads, blob and file downloads, and changes to apps, permissions or pipelines.
-   In Azure DevOps auditing, review PAT creation and first use, federated service connections, pipeline runs and edits, and unfamiliar user agents. Enable auditing if it is off.
-   Look for behavior as well as the IP: one address authenticating to three or more service principals with mixed success, or one app requesting tokens across Azure Resource Manager, Key Vault, Storage and Graph in a short window. Search as far back as retention allows.

## Defending against agentic AI attacks

Threat actors can and do change the source IP address, user agent strings, and other fingerprints left by the agentic AI penetration testing tools they use. This can make identifying and blocking malicious network traffic early difficult for defenders.

Several behavioral signals can help organizations determine that they are being targeted by threat actors using agentic AI. Agentic AI frameworks scanning a target send a wide variety of requests in a brief time and retry variations on the same technique or move on to next-stage actions at machine speed. Agentic AI frameworks use existing penetration testing tools. For example, ARTEX by default uses Nmap, curl, wget, Python HTTP clients, Norma SDK WebFetch, and headless Chromium through Playwright, among others. These tools may send network traffic with distinctive characteristics, such as default user agent strings. While blocking network traffic with these characteristics will not stop an attack by an AI agent, which will quickly change them, identifying them can alert defenders to the activity.

[Defensive honeypots](https://learn.microsoft.com/en-us/security/zero-trust/adopt/prevent-reduce-business-damage-breach-infrastructure#create-honeypot-resources), decoys, tarpits, and fake wins can pull autonomous AI attacks away from legitimate targets. Honeypots and decoy surfaces such as [Microsoft Sentinel Deception](https://github.com/Azure/Azure-Sentinel/tree/master/Solutions/HoneyTokens) give the agent attractive but worthless targets to pursue. Tarpits consume the agent’s time and budget. Fake wins present convincing evidence that the agent’s objective is complete, which can cause it to stop on a false success. In Microsoft’s testing, these controls helped reduce the attack traffic reaching real assets and produced high-confidence, attribution-quality signal.

Microsoft recommends the following mitigations to reduce the impact of this threat.

-   Protect and continuously assess application credentials and secrets. Avoid storing service principal credentials, storage keys, connection strings, and other secrets in source code, configuration files, public repositories, issues, or other locations where they might be inadvertently exposed. To find credentials in source code, consider using tools like [GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security) or other [OWASP source code analysis tools](https://owasp.org/www-community/Source_Code_Analysis_Tools).
-   Rotate compromised or exposed credentials immediately and establish credential lifecycle practices. Treat credentials that have been publicly exposed as compromised, even if the original location has subsequently been edited or deleted. Removing the content does not invalidate the credential or eliminate copies retained in edit history, caches, archives, logs, or other systems. Immediately revoke or rotate the affected credentials and investigate their historical use. Where supported, organizations should favor mechanisms that reduce reliance on long-lived credentials. Learn more about [protecting secrets with Defender for Cloud](https://learn.microsoft.com/en-us/azure/defender-for-cloud/secrets-scanning).
-   Enable appropriate Microsoft Defender for Cloud plans for critical Azure workloads. Consider enabling workload protections relevant to the resources in your environment, including Defender for Resource Manager, Defender for Storage, Defender for Key Vault, Defender for App Service, and Defender for Databases. Learn more in the [Microsoft Defender for Cloud overview](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-cloud-introduction).
-   Apply least privilege to service principals and other workload identities. Review the Azure role-based access control (RBAC) permissions assigned to service principals and restrict their privileges to the resources and operations required by their applications. Learn more about [best practices for Azure RBAC](https://learn.microsoft.com/en-us/azure/role-based-access-control/best-practices).
-   Protect backup and recovery infrastructure as part of resilience. Restrict access to backup and recovery resources and closely monitor attempts to modify or remove their protection controls. Learn more about [Azure Backup security best practices](https://learn.microsoft.com/en-us/azure/backup/azure-backup-data-protection-best-practices).

Hardening OAuth applications against compromise involves managing the permissions of the applications in your organization and securing application secrets. To triage applications in your environment, enforce security policies with new applications as they are created, and address existing applications over time beginning with the most recent ones.

-   Identify and catalog applications running in your cloud environment. The [Cloud app catalog](https://learn.microsoft.com/defender-cloud-apps/risk-score?ocid=magicti_ta_learndoc) page in Defender for Cloud Apps is one service that can help accomplish this.
-   Use Microsoft Defender for Cloud Apps [Cloud Discovery](https://learn.microsoft.com/defender-cloud-apps/set-up-cloud-discovery?ocid=magicti_ta_learndoc) tools to identify unmanaged apps, and prioritize the most frequently used apps to migrate and integrate.
-   Use [Conditional Access policies for workload identities](https://learn.microsoft.com/entra/identity/conditional-access/workload-identity?ocid=magicti_ta_learndoc). Consider augmenting identity signals with [workload identity risk protection](https://learn.microsoft.com/entra/id-protection/concept-workload-identity-risk?ocid=magicti_ta_learndoc).
-   Set permission restrictions to limit who can create an application in the tenant. This can be achieved by setting the ability for users to register apps to “No” and limiting the [application developer](https://learn.microsoft.com/entra/identity/role-based-access-control/permissions-reference?ocid=magicti_ta_learndoc#application-developer) role to privileged users. Review the list of [least privileged roles by task](https://learn.microsoft.com/entra/identity/role-based-access-control/delegate-by-task?ocid=magicti_ta_learndoc) to help scope role-based access control in your environment.
-   [Integrate enterprise applications with Microsoft Entra ID](https://learn.microsoft.com/entra/fundamentals/five-steps-to-full-application-integration?ocid=magicti_ta_learndoc).

## Microsoft detections

[Microsoft Defender](https://www.microsoft.com/security/business/microsoft-defender) and [Microsoft Sentinel](https://www.microsoft.com/security/business/siem-and-xdr/microsoft-sentinel-siem) customers can refer to the list of applicable detections below. Microsoft Defender coordinates detection, prevention, investigation, and response across endpoints, identities, email, and apps to provide integrated protection against attacks like the threat discussed in this blog.

|     |     |     |
| --- | --- | --- |
| **Tactic** | **Observed activity** | **Microsoft Defender and Sentinel coverage** |
| Initial access | Multiple identity-protection alerts identified authentication attempts from anonymized or high-risk infrastructure. This pattern can indicate attempted access through proxy, VPN, or previously reported malicious network sources. | **Microsoft Entra ID Protection**  <br>– Anonymous IP address |
| Initial access | Attack-analysis detections identified OAuth application activity consistent with compromise. This type of detection is useful when evaluating whether an app identity, rather than only a user identity, may have been abused. | **Microsoft Defender XDR**  <br>– Potentially compromised OAuth application identified through attack activity analysis |
| Initial access, Discovery | Unattributed network indicators related to ARTEX use are flagged by Microsoft Threat Intelligence research and surfaced across multiple alerts. Suspected ARTEX use can include activity beyond the GitHub repository scanning activity discussed in this blog. | **Microsoft Sentinel**  <br>– Abnormal Deny Rate for Source IP  <br>– Abnormal Port to Protocol  <br>– Inbound Network Attack detected  <br>– Malformed user agent  <br>– Password spray attack against Azure AD application  <br>  <br>**Microsoft Defender XDR**  <br>– Account compromised following a password-spray attack  <br>– Anomalous OAuth device code authentication activity  <br>– Multiple Service Principal Sign-ins from Single IP  <br>– Graph API activity from a Microsoft threat intelligence IP address  <br>  <br>**Microsoft Defender for Cloud Apps**  <br>– Activities from suspicious user agents  <br>– Multiple failed login attempts  <br>– Multiple failed user log on attempts to an app  <br>– OAuth application activity from an uncommonly visited ISP  <br>– Suspicious OAuth app registration  <br>  <br>**Microsoft Defender for Cloud**  <br>– Key vault unusual access denied – user/application accessing high volume of denied key vaults  <br>– Access from an unusual location to a sensitive blob container  <br>– Azure Resource Manager operation from suspicious IP address  <br>  <br>**Microsoft Entra ID Protection**  <br>– Atypical travelMalicious IP addressPassword Spray  <br>– Verified threat actor IP |
| Credential access | Identity-protection detections observed password spray behavior. This indicates repeated authentication attempts across accounts or tenants using a common source pattern. | **Microsoft Entra ID Protection**  <br>– Password spray  <br>  <br>**Microsoft Defender for Identity**  <br>– Suspicious service principal sign-in following credential addition |
| Credential access | Azure Key Vault access | **Microsoft Defender for Cloud (Defender for Key Vault)**  <br>– Unusual operation pattern in a key vault  <br>– High volume of operations in a key vault  <br>– Unusual application accessed a key vault  <br>– Suspicious secret listing and query in a key vault  <br>– Unusual access to the key vault from a suspicious IP (Non-Microsoft or External) |
| Command and control | Suspicious Microsoft Graph API usage was observed from campaign infrastructure. The activity involved Graph requests that can support discovery, collection, or follow-on cloud operations. | **Microsoft Defender for Identity**  <br>– Suspicious Entra Graph API query observed |

## Advanced hunting queries

The following hunting queries are related to the October 28 Entra ID service principal sign-in activity.

**Find successful and failed application sign-ins from the suspicious IP addresses**

```sql
let startTime = datetime(2026-10-28T00:00:00Z);
let endTime = now();
EntraIdSpnSignInEvents
| where Timestamp between (startTime .. endTime)
| where IPAddress in ("199.19.77.84")
| project Timestamp, TenantId, Application, ApplicationId, ServicePrincipalName, ServicePrincipalId, ResourceDisplayName, ResourceId, ResourceTenantId, IPAddress, ErrorCode, UserAgent, CorrelationId, RequestId
| order by Timestamp asc
```

**Find Microsoft Graph API requests from the two IP addresses, including searches and response status**

```sql
let startTime = datetime(2026-10-28T00:00:00Z);
let endTime = now();
GraphAPIAuditEvents
| where Timestamp between (startTime .. endTime)
| where IpAddress in ("199.19.77.84")
| project Timestamp, TenantId, ApplicationId, ServicePrincipalId, AccountObjectId, IpAddress,
          RequestMethod, RequestUri, ResponseStatusCode, ResponseSize, Scopes, EntityType,
          TargetWorkload, UniqueTokenIdentifier, ClientRequestId, OperationId, RequestId
| order by Timestamp asc
```

**Find available Microsoft 365 and Microsoft Azure cloud activity details from the suspicious IP addresses**

```sql
let startTime = datetime(2026-10-28T00:00:00Z);
let endTime = now();
CloudAppEvents
| where Timestamp between (startTime .. endTime)
| where IPAddress in ("199.19.77.84")
| project Timestamp, Application, CloudAppId = ApplicationId, ActionType, ActivityType,
          AccountType, AccountDisplayName, AccountId, AccountObjectId, IPAddress, UserAgent,
          ObjectName, ObjectType, ObjectId, ActivityObjects, ReportId, RawEventData
| order by Timestamp asc
```

**CloudAuditEvents table to identify suspicious controlplane operations**

```
CloudAuditEvents
| where IPAddress has_any  ('199.19.77.84','65.87.223.26')
```

**CloudStorageEvents table to identify possible exfiltration from Storage Accounts.**

```plain
CloudStorageAggregatedEvents
| where IPAddress in   ('199.19.77.84','65.87.223.26')
| where SuccessfulOperationsCount > 0   
```

### Microsoft Security Copilot

[Microsoft Security Copilot](https://www.microsoft.com/en-us/security/business/ai-machine-learning/microsoft-security-copilot) is [embedded in Microsoft Defender](https://learn.microsoft.com/defender-xdr/security-copilot-in-microsoft-365-defender) and provides security teams with AI-powered capabilities to summarize incidents, analyze files and scripts, summarize identities, use guided responses, and generate device summaries, hunting queries, and incident reports.

Customers can also [deploy AI agents](https://learn.microsoft.com/defender-xdr/security-copilot-agents-defender), including the following [Microsoft Security Copilot agents](https://learn.microsoft.com/copilot/security/agents-overview), to perform security tasks efficiently:

-   [Threat Intelligence Briefing agent](https://learn.microsoft.com/defender-xdr/threat-intel-briefing-agent-defender)
-   [Phishing Triage agent](https://learn.microsoft.com/defender-xdr/phishing-triage-agent)
-   [Threat Hunting agent](https://learn.microsoft.com/defender-xdr/advanced-hunting-security-copilot-threat-hunting-agent)
-   [Dynamic Threat Detection agent](https://learn.microsoft.com/defender-xdr/dynamic-threat-detection-agent)

Security Copilot is also available as a [standalone experience](https://learn.microsoft.com/en-us/copilot/security/experiences-security-copilot) where customers can perform specific security-related tasks, such as incident investigation, user analysis, and vulnerability impact assessment. In addition, Security Copilot offers [developer scenarios](https://learn.microsoft.com/copilot/security/developer/custom-agent-overview) that allow customers to build, test, publish, and integrate AI agents and plugins to meet unique security needs.

### Threat intelligence reports

Microsoft Defender XDR customers can use [threat analytics](https://learn.microsoft.com/defender-xdr/threat-analytics) reports in the Defender portal (requires license for at least one Defender XDR product) to get the most up-to-date information about the activity and techniques discussed in this blog. These reports provide intelligence, protection information, and recommended actions to prevent, mitigate, or respond to associated threats found in customer environments.

-   [Activity Profile: Stolen application credentials used to sign in as Entra ID workload identities and access Azure, Microsoft 365 resources](https://security.microsoft.com/threatanalytics3/9cc2a43d-9456-47e5-9058-fabeb57e70b9/analystreport)

Microsoft Security Copilot customers can also use the [Microsoft Security Copilot integration](https://learn.microsoft.com/defender/threat-intelligence/security-copilot-and-defender-threat-intelligence?bc=%2Fsecurity-copilot%2Fbreadcrumb%2Ftoc.json&toc=%2Fsecurity-copilot%2Ftoc.json) in Microsoft Defender Threat Intelligence, either in the Security Copilot standalone portal or in the [embedded experience](https://learn.microsoft.com/defender/threat-intelligence/using-copilot-threat-intelligence-defender-xdr) in the Microsoft Defender portal to get more information about this threat.

### Learn more

For the latest security research from the Microsoft Threat Intelligence community, check out the [Microsoft Threat Intelligence Blog](https://aka.ms/threatintelblog).

To get notified about new publications and to join discussions on social media, follow us on [LinkedIn](https://www.linkedin.com/showcase/microsoft-threat-intelligence), [X (formerly Twitter)](https://x.com/MsftSecIntel), and [Bluesky](https://bsky.app/profile/threatintel.microsoft.com).

To hear stories and insights from the Microsoft Threat Intelligence community about the ever-evolving threat landscape, listen to the [Microsoft Threat Intelligence podcast](https://thecyberwire.com/podcasts/microsoft-threat-intelligence).

The post [Threat actors use agentic AI tooling to find and abuse exposed secrets](https://www.microsoft.com/en-us/security/blog/2026/11/05/threat-actors-use-agentic-ai-tooling-to-find-and-abuse-exposed-secrets/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog).
