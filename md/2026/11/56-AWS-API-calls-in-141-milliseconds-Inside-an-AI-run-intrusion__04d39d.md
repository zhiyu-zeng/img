---
title: "56 AWS API calls in 141 milliseconds: Inside an AI-run intrusion"
source: https://www.elastic.co/security-labs/threat-command/cyberstrikeai-aws-cloudtrail-intrusion
source_host: www.elastic.co
clip_date: 2026-11-18T10:00:57+08:00
trace_id: 9aebe289-9a5d-49d2-bc75-c43191babacd
content_hash: 0c832be38528f5f831ff3663e87d6f33f3292df9754110a88ffdbf9fba251c5a
status: synced
tags: []
series: null
feed_source: Elastic Security Labs
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41c75244-d011-81f5-9054-dbd81c4ae972
ioc: null
---

One server read 56 EC2 user data scripts in 141 milliseconds. Then it went quiet for 14 days and came back. That gap did more damage than the burst, because fixed correlation windows cannot span two weeks.

Between September 30 and October 16, 2026, a [CyberStrikeAI](https://github.com/Ed1s0nZ/CyberStrikeAI) server worked through stolen AWS credentials in a familiar sequence: validate identities, harvest secrets from Secrets Manager, pull EC2 user data, decrypt an SSM parameter, send a remote command. Every one of those is a call a legitimate role makes every day. Nothing in CloudTrail looked urgent at the time.

CyberStrikeAI is an open-source platform that pairs LLM agents with offensive security tools. Will Thomas at Team Cymru [counted 21 IPs running it in early 2026](https://thehackernews.com/2026/03/open-source-cyberstrikeai-deployed-in.html?hl=en_US), all of them aimed at Fortinet edge devices. This is the first case we have seen of the same tooling turned on AWS.

We call this AI-assisted on the strength of the tool attribution and the machine-speed behavior in the logs. We cannot prove an LLM agent was making the decisions, and we do not know how the attacker obtained the credentials.

## Key findings from the CyberStrikeAI AWS intrusion

-   Between Sep 30 and Oct 16, 2026, one CyberStrikeAI server (43\[.\]240\[.\]29\[.\]11) used credentials from eight AWS identities (five IAM users and three EC2 instance roles) across four accounts and generated 78 alerts.
    
-   app-role sent 56 user data requests in 141 milliseconds, part of 58 user data retrieval alerts (74% of the total), which points to automated tooling.
    
-   On Oct 2, container-role read an encrypted SSM parameter and issued an SSM SendCommand 29 seconds later. The audit log does not show what the command was or whether it succeeded.
    
-   43\[.\]240\[.\]29\[.\]28 and 43\[.\]240\[.\]29\[.\]33 serve a CyberStrikeAI page on port 8080 with the same self-signed certificate as 43\[.\]240\[.\]29\[.\]11, which ties the three servers together. As of November, none of the three is serving that interface, so treat the IPs as indicators for retrospective hunting.
    
-   All 78 alerts were medium or low severity and only made sense once correlated by source IP.
    

## How the CyberStrikeAI server moved through four AWS accounts

### Threat infrastructure and the eight AWS identities used

One CyberStrikeAI server used credentials belonging to eight IAM identities across four AWS accounts over 16 days, with activity on four of those days. Account and identity names are replaced with aliases.

Attribute

Value

Source IP

43\[.\]240\[.\]29\[.\]11

Attribution

CyberStrikeAI server (confirmed)

Target cloud

AWS

Accounts involved

4 (Accounts A to D)

IAM identities used

8

EC2 instances whose role credentials were used

3

Total alerts

78

Campaign duration

16 days (Sep 30 to Oct 16)

Alias

Type

Account

Actions

Alerts

Active window

app-role

EC2 instance role

A

GetSecretValue, DescribeInstanceAttribute

60

Sep 30 to Oct 1

logship-user-1

IAM user

A, C

GetCallerIdentity

5

Sep 30 to Oct 16

logship-user-2

IAM user

B

GetCallerIdentity

3

Sep 30 to Oct 16

email-svc-user

IAM user

A

GetCallerIdentity, GetSessionToken

3

Sep 30

nonprod-role

EC2 instance role

A

GetSecretValue

2

Oct 1

cert-renew-user

IAM user

A

GetCallerIdentity

2

Sep 30 to Oct 1

container-role

EC2 instance role

A

GetParameter, SendCommand

2

Oct 2

named-user

IAM user

D

GetSessionToken

1

Oct 16

The three role sessions were named after EC2 instance IDs, so the credentials came from instance profiles. Using them from an outside IP means they were taken from the instances, for example through SSRF or host compromise.

### How we attributed the IP to CyberStrikeAI

Internet scan data shows 43\[.\]240\[.\]29\[.\]11 serving a CyberStrikeAI web interface with a self-signed CyberStrikeAI certificate, one day before the first alert. A FOFA search for the IP combined with the page title returns two records, one HTTP and one HTTPS, both on port 8080.

Observation

Value

FOFA query

ip="43.240.29.11" && title=="CyberStrikeAI"

Service

Port 8080: HTTPS record seen 2026-09-29, HTTP record seen 2026-10-06

Page title

CyberStrikeAI

Hosting

AS133199, SonderCloud Limited, Hong Kong SAR

Response

HTTP/2.0 200 OK with permissive CORS headers (methods POST, OPTIONS, GET, PUT, DELETE)

FOFA fid

gOOpHYKNnstDLjmeRfUoIg== on both records

TLS certificate

Self-signed and untrusted, issuer and subject CN CyberStrikeAI, ECDSA with SHA-256, valid 2026-09-15 to 2027-09-15

Three dates place the server on the IP before the AWS activity started:

-   **September 15, 2026** - the self-signed CyberStrikeAI certificate was issued
    
-   **September 29, 2026** - internet scan data recorded the HTTPS service on port 8080
    
-   **September 30, 2026** - the first AWS detection alert fired from 43\[.\]240\[.\]29\[.\]11
    

Port 8080 is the web interface port in the platform's default setup, and the Hong Kong hosting matches earlier reporting that placed most CyberStrikeAI servers in China, Singapore, and Hong Kong. The scan data identifies what runs on the IP, and the alerts tie that IP to the AWS activity. Full certificate fields are in the Indicators section.

### Attack timeline: 16 days across four AWS accounts

The activity ran in four phases over four active days, with a 14-day gap before a final return visit. Times are shown as offsets from the first event in each phase.

#### Phase 1: Validating stolen AWS credentials (Sep 30)

The server called GetCallerIdentity on four IAM users across three accounts within 51 minutes, a standard way to check which credentials still work. Three of those calls landed in the same second, one in each of three accounts, which points to automation. Two GetSessionToken calls on one user show it requesting temporary credentials.

Time offset

Identity

Account

Action

T+0 min

email-svc-user

A

GetCallerIdentity

T+22 min

email-svc-user

A

GetSessionToken

T+26 min

cert-renew-user

A

GetCallerIdentity

T+27 min

email-svc-user

A

GetSessionToken

T+51 min

logship-user-1

A

GetCallerIdentity

T+51 min

logship-user-2

B

GetCallerIdentity

T+51 min

logship-user-1

C

GetCallerIdentity

The validated accounts are service accounts, which are often rotated rarely and watched less closely.

#### Phase 2: Harvesting Secrets Manager and EC2 user data (Sep 30)

The main activity came from app-role, an EC2 instance role in Account A. It read a secret, made one user data request, then fired a burst of 56 user data requests in 141 milliseconds.

Time offset

Action

Detail

T+0 min

GetSecretValue

First access to Secrets Manager by this role

T+3 h 18 min

DescribeInstanceAttribute

First user data retrieval, probably a test

T+6 h 10 min, over 141 ms

DescribeInstanceAttribute (56 calls)

Burst at about 2.5 ms per call

Each call asked for the userData attribute, the startup script attached to an instance. These scripts often hold hardcoded API keys, database credentials, bootstrap secrets, SSH keys, or certificates. The spacing is consistent with tooling working through a prepared list of instance IDs, not a person at a console. All 57 calls that day came from the same assumed-role session.

#### Phase 3: SSM parameter decryption and SendCommand (Oct 1 to 2)

On October 1 the server revalidated credentials, pulled more secrets, and used a second role.

Time offset

Action

Identity

Detail

Oct 1, T+0 s

GetCallerIdentity (4 calls)

Several users

Revalidation across accounts

Oct 1, T+1 s

GetSecretValue

app-role

More secrets

Oct 1, T+14 s

DescribeInstanceAttribute

app-role

One more user data request

Oct 1, T+4 h 10 min

GetSecretValue

nonprod-role

Secrets from a non-production environment

Oct 1, T+4 h 14 min

GetSecretValue

nonprod-role

Second pull, about 3 minutes later

Oct 2, T+0 s

GetParameter with decryption

container-role

SSM SecureString parameter read

Oct 2, T+29 s

SendCommand

container-role

Remote command through SSM

Non-production environments often have weaker controls and sometimes share secrets with production, so access to one is worth treating as access to the other until shown otherwise.

The October 2 sequence is the highest-risk activity in the data. Within 29 seconds, a third role read an encrypted SSM parameter and then issued an SSM SendCommand. The audit log records that a command was sent.

#### Phase 4: Return after a 14-day gap (Oct 16)

After 14 quiet days, the server came back and revalidated credentials, including a user in a fourth account that had not appeared before.

Time offset

Identity

Account

Action

T+0 min

named-user

D

GetSessionToken

T+1 h 57 min

logship-user-1

C

GetCallerIdentity

T+3 h 7 min

logship-user-2

B

GetCallerIdentity

The Oct 16 activity is consistent with checking whether access survived after the gap. It could also mean a deliberate cool-down, or the operator returning after working on other targets. The data doesn't separate these.

## How Elastic detections caught the CyberStrikeAI activity

### Which detection rules fired, and why severity stayed low

Six Elastic detection rules fired, and between them they covered every phase. Taken alone, every alert is medium or low severity and easy to dismiss. The source IP is what ties them together.

![Bar chart of 78 AWS alerts by API call: DescribeInstanceAttribute 58, GetCallerIdentity 11, GetSecretValue 4, others 5](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af9ebafadb586298.png)

Rule

Alerts

Severity

Phase

[AWS EC2 User Data Retrieval for EC2 Instance](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/discovery_ec2_userdata_request_for_ec2_instance.toml)

58

Medium

2, 3

[AWS STS GetCallerIdentity API Called for the First Time](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/discovery_new_terms_sts_getcalleridentity.toml)

11

Medium

1, 3, 4

[First Time Seen AWS Secret Value Accessed in Secrets Manager](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/credential_access_new_terms_secretsmanager_getsecretvalue.toml)

4

Medium

2, 3

[AWS STS GetSessionToken Usage](https://github.com/elastic/detection-rules/blob/main/rules_building_block/privilege_escalation_sts_getsessiontoken_abuse.toml)

3

Low

1, 4

[AWS SSM SendCommand Execution by Rare User](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/execution_ssm_sendcommand_by_rare_user.toml)

1

Low

3

[AWS Systems Manager SecureString Parameter Request with Decryption Flag](https://github.com/elastic/detection-rules/blob/bfb4a62ddad9fc0ea2d46693943d2ce4448edfb1/rules/integrations/aws/credential_access_retrieve_secure_string_parameters_via_ssm.toml#L21)

1

Medium

3

*Figure 2: Alerts breakdown by phase and severity.*

Date

Alerts

Dominant activity

Sep 30

65

57 user data requests, credential validation, first secrets access

Oct 1

8

Secrets from a second role, credential revalidation

Oct 2

2

SSM parameter decryption and SendCommand

Oct 16

3

Return visit, credential revalidation in two accounts plus one new

*Figure 3: Timeline of the attack.*

Several details point to automated tooling:

-   56 user data requests in 141 milliseconds from a single session.
    
-   Three GetCallerIdentity calls in one second, across three accounts.
    
-   A sharp change in tempo. 83% of alerts (65 of 78) came on day one, then activity dropped to a few targeted actions per day.
    

None of this proves an LLM agent was making decisions, but it matches how an agentic platform works through a list of credentials and targets.

### Automating IAM containment with Elastic Workflows

AI-assisted offense is often sporadic and fast, especially with compromised identities. Elastic Workflows can enable responders by making API calls to AWS services such as IAM to block the identity automatically.

[Elastic Workflows](https://www.elastic.co/docs/explore-analyze/workflows), shipped with the stack (9.4+), lets detection rules invoke custom workflows with a YAML-defined pipeline of steps on every alert. As a PoC we created a custom workflow that triggered on the detections shared below while emulating this behavior that mirrors suggested response actions.

![Elastic Workflow 'Remediate AWS - Stolen Access Key' deactivating keys, revoking sessions and quarantining an IAM user](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a182a8dc37df1488.png)

On every alert, the workflow does the following, executing in seconds and aiding with containment of the identity:

1.  Triggers on [AWS EC2 Bulk User Data Enumeration](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/discovery_ec2_bulk_user_data_enumeration.toml) detection rule
    
2.  Iterates each user name associated with the alerts
    
3.  Invokes an AWS Lambda function through Elastic’s AWS Lambda connector
    
4.  Deactivates compromised access key using iam:UpdateAccessKey.
    
5.  Blocks older temporary sessions associated with IAM user by adding inline deny policy via iam:PutUserPolicy and aws:TokenIssueTime cutoff
    
6.  Quarantines IAM user by attaching inline deny-all policy
    

An example of this workflow can be found [here](https://github.com/elastic/workflows/pull/117/changes#diff-da4b32ed5494cc940976aee0e310b259e27f7aa2770405a8ce50a2903a92a593).

## MITRE ATT&CK techniques observed in this AWS intrusion

The activity maps to five techniques across four tactics.

Tactic

Technique

Evidence

Initial Access

T1078.004 Valid Accounts: Cloud Accounts

IAM user and instance role credentials used from an external IP

Discovery

T1087.004 Account Discovery: Cloud Account

GetCallerIdentity across 8 identities in 4 accounts

Credential Access

T1552.005 Unsecured Credentials: Cloud Instance Metadata API

58 DescribeInstanceAttribute calls for user data

Credential Access

T1555.006 Credentials from Password Stores: Cloud Secrets Management Stores

GetSecretValue and GetParameter with decryption

Execution

T1651 Cloud Administration Command

SSM SendCommand

## Indicators of compromise (IOCs)

Three IPs in one /24 are linked to CyberStrikeAI, and only the first appeared in our AWS telemetry. The behavioral indicators below are more durable than the IPs, because the operator can change servers.

IP (defanged)

Seen in AWS telemetry

Notes

43\[.\]240\[.\]29\[.\]11

Yes, 78 alerts

Source of all alerts. CyberStrikeAI web interface on port 8080 with a self-signed certificate

43\[.\]240\[.\]29\[.\]28

Not in this investigation

CyberStrikeAI page on port 8080, with the same hosting (AS133199), FOFA fid, and TLS certificate as 43\[.\]240\[.\]29\[.\]11

43\[.\]240\[.\]29\[.\]33

Not in this investigation

CyberStrikeAI page on port 8080, with the same hosting (AS133199), FOFA fid, and TLS certificate as 43\[.\]240\[.\]29\[.\]11

CyberStrikeAI fingerprint. All three IPs serve the same self-signed certificate, with an identical serial number and public key:

Attribute

Value

Type

Page title

CyberStrikeAI

Default

Service port

8080

Default

Certificate issuer

CommonName CyberStrikeAI, organization empty

Default

Certificate subject

CommonName CyberStrikeAI, organization empty

Default

Certificate type

Self-signed, untrusted, X.509 v3

Default

Signature algorithm

ECDSA-SHA256

Default

Public key algorithm

ECDSA

Default

Key usage

Digital Signature, with extended key usage Server Auth

Default

Subject alternative names

DNS localhost, IP 127.0.0.1 and::1

Default

Serial number

3356730520974368630

Shared

Validity

2026-09-15 04:13 UTC to 2027-09-15 05:13 UTC

Shared

Public key

See the block below

Shared

IP Addresses:

-   43\[.\]240\[.\]29\[.\]11
    
-   43\[.\]240\[.\]29\[.\]28
    
-   43\[.\]240\[.\]29\[.\]33
    

Certificate serial number (all three IPs)

-   3356730520974368630
    

Certificate ECDSA public key (all three IPs)

-   45:FD:83:A2:38:2C:DD:70:2A:97:1D:E4:66:57:7D:E9:
    
-   B0:EA:41:48:80:8A:B9:D1:63:95:90:C5:1E:A7:04:94:
    
-   E3:21:7C:73:9F:EA:D2:29:3F:31:66:87:75:EC:BA:83:
    
-   23:59:CA:4D:D9:7E:C2:9A:FC:FE:7D:28:5A:31:1C:67
    

Behavioral indicators to hunt for in CloudTrail:

-   A burst of DescribeInstanceAttribute calls requesting userData, many per second, from one role session.
    
-   First-time GetCallerIdentity calls from the same external IP across several accounts or users within the same minute.
    
-   GetSessionToken or GetSecretValue from an instance role session whose source IP is not the instance or your NAT.
    
-   GetParameter with decryption followed within a minute by SSM SendCommand from the same role.
    

We added two high-severity, low false positive ES|QL detections for the burst enumeration behavior: [AWS EC2 Bulk User Data Enumeration](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/discovery_ec2_bulk_user_data_enumeration.toml) alerts when one principal and source IP read userData from more than 20 distinct instances in 10 minutes, and [AWS STS GetCallerIdentity Bulk Account Enumeration](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/discovery_sts_getcalleridentity_bulk_account_enumeration.toml) alerts when three or more distinct non-role identities call GetCallerIdentity from the same external IP and ASN in 10 minutes.

## How to respond if your AWS identities were exposed

Assume anything an affected role could read is compromised, and work outward from the credentials.

1.  Rotate credentials for every identity that touched the indicator IP, and revoke active sessions, including those from temporary credentials.
    
2.  For instance roles, rotate by replacing the instance profile or the instance, since stolen role credentials expire but can be reissued while the host stays compromised.
    
3.  Treat all secrets in EC2 user data as exposed, and move them to the Secrets Manager or Parameter Store.
    
4.  Review SSM command history for the window of any unexpected SendCommand call to see what ran. Check for abuse of AWS-managed documents, AWS-RunShellScript and AWS-RunPowerShellScript or custom documents.
    
5.  Check non-production roles and secrets for overlap with production.
    
6.  Block the indicator IP at the WAF, VPC, NaCL and security group level, but rely on the behavioral detections, since the infrastructure can change and network blockage is not effective at stolen credentials to API calls prevention.
    
7.  Restrict ec2:DescribeInstanceAttribute for userData to the roles that need it, using IAM policy or a service control policy.
    
8.  Enable GuardDuty if it isn't already, and alert on credentials used from outside your expected IP ranges.
    
9.  Hunt for how the instance credentials were obtained, starting with exposed web applications, SSRF, code repositories and IMDS.
    

## Conclusion: What this intrusion means for alert correlation

AI-assisted attacks are driven by objectives, so they generate a lot of alerts. One CyberStrikeAI server produced 78 alerts across six rules in 16 days, and 65 of them came on the first day. Every alert was medium or low severity, and each one looked routine on its own: a first-time GetCallerIdentity, a GetSessionToken, an SSM SendCommand from a rare user. Only the shared source IP showed they belonged to one intrusion.

Defenders need high-signal detections to stop the damage early; low false positive behavior rules, such as the two bulk enumeration rules described above, that justify acting immediately. Medium and low severity alerts are good candidates for correlation, but only by source IP, and the correlation window needs to be flexible because AI-assisted activity is irregular. Here, 56 requests landed in 141 milliseconds, later steps came hours to days apart, and the operator returned after 14 days. A short fixed window would have split this intrusion into unrelated alerts.

High-signal detections can also drive remediation. Attached to a workflow, such as those in the [Elastic Workflows](https://github.com/elastic/workflows) library, a rule like this can disrupt the attack automatically, for example by blocking the source IP, while analysts investigate.

## References

-   CyberStrikeAI: [https://github.com/Ed1s0nZ/CyberStrikeAI](https://github.com/Ed1s0nZ/CyberStrikeAI)
    
-   Team Cymru, Tracking CyberStrikeAI Usage: [https://www.team-cymru.com/post/tracking-cyberstrikeai-usage](https://www.team-cymru.com/post/tracking-cyberstrikeai-usage)
    
-   Elastic Workflows: [https://github.com/elastic/workflows](https://github.com/elastic/workflows)
    

## About Elastic Security Labs

Elastic Security Labs is the threat intelligence branch of Elastic Security dedicated to creating positive change in the threat landscape. Elastic Security Labs provides publicly available research on emerging threats with an analysis of strategic, operational, and tactical adversary objectives, then integrates that research with the built-in detection and response capabilities of Elastic Security.

Follow Elastic Security Labs on Twitter [@elasticseclabs](https://twitter.com/elasticseclabs) and check out our research at [www.elastic.co/security-labs/](https://www.elastic.co/security-labs/).
