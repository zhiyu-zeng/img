---
title: "From posture to root cause: Investigate OpenShift compliance with Elastic Agent Builder"
source: https://www.elastic.co/security-labs/blog/openshift-compliance-elastic-agent-builder
source_host: www.elastic.co
clip_date: 2026-11-20T02:04:05+08:00
trace_id: a6ee6c72-2cc9-42c5-90e1-966c3bccd820
content_hash: f1abb0309cc18b553f1773d4f3be1a6ef3bdf6b0262ba57a9d34bc42ab532f9a
status: synced
tags: []
series: null
feed_source: Elastic Security Labs
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41d75244-d011-8187-9bd1-fbf48f4c3ae8
ioc: null
---

A single [Elastic Agent](https://www.elastic.co/elastic-agent) on each cluster polls [OpenShift Compliance Operator](https://docs.redhat.com/en/documentation/openshift_container_platform/latest/html/security_and_compliance/compliance-operator) APIs every 60 seconds. An [Elastic Agent Builder](https://www.elastic.co/elasticsearch/agent-builder) agent on top of that data can tell you what change failed the compliance control. Every scan and check result lands in Elasticsearch, as do the remediations, so the agent answers questions (like, *Which clusters failed checks this week?* *Why did a control start failing, and when?*) in plain English. The rules that the scanner marks as manual get evaluated with Common Expression Language (CEL) custom rules, and a scheduled [workflow in Elastic Workflows](https://www.elastic.co/elasticsearch/workflows) annotates the result back to the manual rule in the cluster. Rescans and remediation patches run through those same workflows and pause for your approval. Everything in this post is on [GitHub](https://github.com/elastic/elastic-labs/tree/main/supporting-blog-content/security-labs/openshift-compliance-agent), including the integration package and workflows, along with the manifests.

The Compliance Operator scans each [OpenShift](https://www.redhat.com/en/technologies/cloud-computing/openshift) cluster against configured profiles covering the CIS Benchmarks, National Institute of Standards and Technology (NIST) 800-53 moderate (the basis for [Federal Risk and Authorization Management Program \[FedRAMP\]](https://www.fedramp.gov/) authorization), the [Australian Essential Eight](https://www.cyber.gov.au/essential-eight) and more, and then stores the results on that cluster. For one cluster, that’s fine, but across a fleet, nobody has a single view. A rule that passed last week starts failing after a deployment, and a scheduled scan silently fails to trigger. But the only way to find out is to log in and run `oc get compliancecheckresult` cluster by cluster.

## Why OpenShift compliance is hard to track across a fleet

### Scan results stored on each cluster

The Compliance Operator runs scans on each OpenShift cluster and stores the results locally. This approach works across a few clusters, but as the fleet grows, it becomes difficult for OpenShift administrators to maintain visibility across each cluster.

A compliance rule that had previously passed might start to fail after a new workload deployment or a cluster upgrade. Similarly, a scheduled scan can fail to trigger, due to unresolved dependencies. Without a central view of compliance scan status and results, these failures go unnoticed until an OpenShift administrator logs in to the cluster and manually checks, using commands such as `oc get compliancecheckresult` and `oc get compliancescan`.

In this blog post, we explore how this challenge can be addressed by ingesting OpenShift compliance data into Elasticsearch, giving platform and security teams a unified way to track compliance posture and investigate drift across the fleet.

### Manual compliance rules tracked outside the cluster

Not all compliance rules are automated, so they need a manual assessment. Platform teams usually track these rules and their status in shared spreadsheets or Confluence pages. Those trackers sit apart from the scan results, and someone has to update and reconcile them with each cluster’s findings.

Organizational controls add another layer. A team may exclude certain controls from specific clusters because of internal requirements or operational needs. Without a central record, it’s hard to determine which controls apply to which cluster and why an exception exists, and that’s exactly what an auditor will ask.

### Compliance reporting spread across clusters

With scan results spread across clusters, security teams have to find their own way to aggregate the data before they can build a report. Auditors can ask for reports at regular intervals, so this aggregation repeats every cycle. Each report draws on scan output and manual rule status, along with documented exceptions that live in different places. Pulling all of that together can leave gaps.

## Centralizing OpenShift compliance data in Elasticsearch

[Elastic Agent Builder](https://www.elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder) lets you build interactive AI agents on top of your compliance data. Teams can query compliance posture across their entire fleet in plain English, investigate why specific controls failed, and safely trigger remediations with human-in-the-loop approvals, rather than combing through endless scan JSON or switching between cluster consoles.

A custom [Elastic integration](https://www.elastic.co/docs/extend/integrations/what-is-an-integration) collects compliance scan data from each cluster and sends it to Elasticsearch. It uses the HTTP JSON input to query the OpenShift Compliance Operator APIs and retrieve scan results, in addition to ingesting them into Elasticsearch. During ingestion, compliance data is parsed and normalized, making it easier to search, build dashboards, set up alerts, and generate compliance reports.

With the data centralized, the next step is to make it easy for platform and security teams to work with it. Together, the integration and the agent turn compliance data into something that teams can interact with directly instead of static dashboards. The agent helps the team to find the information it needs and decide what to investigate next.

The following diagram illustrates the high-level architecture of the entire workflow discussed in this solution:

![OpenShift compliance architecture: Compliance Operator APIs to Elasticsearch, Elastic Agent Builder, and chat](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/29b427c4650e9f97.png)

Note: The proof of concept (PoC) in this solution has been tested with OpenShift Local version 4.22, Compliance Operator 1.10.0, and Elastic Serverless. On Elastic Stack deployments (self-managed or Elastic Cloud Hosted \[ECH\]), both Agent Builder and Workflows require version 9.5 or later and an [Enterprise subscription](https://www.elastic.co/subscriptions). On Elastic Cloud Serverless, these capabilities are available on supported project feature tiers (such as Serverless Security Complete).

Elastic also offers a [free, 14-day Elastic Cloud trial](https://www.elastic.co/cloud/cloud-trial-overview) to help you get started.

## How to ingest OpenShift compliance data into Elasticsearch

We deploy Elastic Agent directly on each OpenShift cluster using a single integration policy. Every 60 seconds, the agent queries the Compliance Operator API endpoints via HTTP JSON and ships the raw scan records into Elasticsearch data streams across your entire fleet.

The integration reads three Compliance Operator resources:

**Resource / API**

**What it provides**

compliancescans.compliance.openshift.io

The scans configured in the cluster, including scan name, phase, and result.

compliancecheckresults.compliance.openshift.io

Individual check details, including rule name, status, and severity.

complianceremediations.compliance.openshift.io

Available remediations for checks, including their current state.

Because the HTTP JSON integration appends time-series documents to a data stream on every polling cycle, three [Elasticsearch transforms](https://www.elastic.co/guide/en/elasticsearch/reference/current/transforms.html) (`scans`, `checks`, and `remedy`) continuously collapse each stream into dedicated latest-state indices (`ospm-compliance_-latest`). The `checks` transform deduplicates events by cluster and check resource name (`metadata.name`). This ensures that checks evaluated across different node roles (such as master and worker) are preserved without creating duplicate records across repeated scan cycles.

The agent queries these latest-state indices for current posture and uses the raw time-series data streams for historical investigations.

The following diagram illustrates the compliance scan data ingestion workflow from multiple OpenShift clusters into Elastic:

![Four OpenShift clusters running Elastic Agent polling Compliance Operator APIs into centralized Elasticsearch](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6563310184bdd81a.png)

Note: This is a custom-built integration and isn’t officially supported by Elastic Support.

### Deploy the OpenShift compliance integration in Kibana

The custom integration is a zip file package that has all the required components. To deploy the package, you can upload the package directly using Kibana UI.

The integration follows the standard Elastic package specification and bundles all the required Kibana and Elasticsearch assets into a single archive. When uploaded through the Kibana UI, the package registers three data streams with dedicated ingest pipelines, configures prebuilt dashboards, sets up latest-state index views, and installs the continuous Elasticsearch transforms that maintain current compliance posture:

OpenShift Security Posture Management │ ├── 1. Dashboards (kibana/dashboard/) │ ├── \[OpenShift Compliance\] Posture Overview │ ├── \[OpenShift Compliance\] Overall Results │ └── \[OpenShift Compliance\] Auto Remediations │ ├── 2. Data Views / Index Patterns (kibana/index_pattern/) │ ├── ospm-compliance-\*-latest │ └── logs-openshift_security_posture_management.compliance\* │ ├── 3. Data Streams (data_stream/) │ ├── compliance_check_results (with Ingest Pipeline) │ ├── compliance_scans (with Ingest Pipeline) │ └── compliance_remediations (with Ingest Pipeline) │ └── 4. Elasticsearch Transforms (elasticsearch/transform/) ├── checks ├── remedy └── scans

Download the integration from the GitHub [repository](https://github.com/elastic/elastic-labs/tree/main/supporting-blog-content/security-labs/openshift-compliance-agent/elastic/integration).

The video below walks through deploying and configuring the custom OpenShift Security Posture Management (OSPM) integration package in Kibana Fleet. It covers setting the three compliance endpoints for scans, check results, and remediations, setting the 60-second polling interval, and mapping the `orchestrator.cluster.name` field from the agent's environment variables.

### Configure the Compliance Operator API endpoints and polling interval

The integration has three data collection endpoints that cover compliance scans, check results, and remediations. Each endpoint builds the OpenShift API URL from environment variables that Kubernetes sets in the pod, so the same configuration works on every cluster.

For compliance check results, the URL looks like this:

https://${env.KUBERNETES_SERVICE_HOST}:${env.KUBERNETES_SERVICE_PORT_HTTPS}/apis/compliance.openshift.io/v1alpha1/compliancecheckresults

The integration polls each endpoint every 60 seconds by default. You can change the interval to match how fresh you need the data to be.

When the configuration is complete, create an Elastic Agent policy with these settings and deploy it on your OpenShift cluster to start collecting compliance data.

### Deploy Elastic Agent on each OpenShift cluster

To deploy the agent and the integration:

1.  In Kibana, create or update an Elastic Agent policy and add the OSPM integration to it. Confirm that the API endpoints and polling interval match your environment.
    
2.  The integration automatically enriches each event with `orchestrator.cluster.name` using the `CLUSTER_NAME` environment variable configured on the agent.
    
3.  Generate an enrollment token to be passed along with the Fleet URL endpoint.
    
4.  Replace the token and Fleet URL in the following reference YAML, and deploy the Elastic Agent on the cluster.
    
5.  In Fleet, check that the agent is healthy.
    
6.  Once healthy, add the OSPM integration policy to the agent to start polling data.
    
7.  In Kibana, open the integration’s data streams. Confirm that documents are arriving and that each one carries the expected cluster name in `orchestrator.cluster.name`.
    
8.  Repeat these steps for every OpenShift cluster that you want to monitor, and set the matching cluster name for each environment.
    

To collect OpenShift compliance data, deploy Elastic Agent as a single-replica deployment on each OpenShift cluster. The manifest below runs the agent with Fleet enrollment enabled and mounts a persistent volume to preserve agent state across pod restarts. It also injects the `CLUSTER_NAME` environment variable. The integration uses this variable to tag every ingested event with `orchestrator.cluster.name`, ensuring that multi-cluster scan results remain separated in Elasticsearch.

\--- apiVersion: apps/v1 kind: Deployment metadata: name: elastic-agent namespace: elastic-agent-ocp labels: app.kubernetes.io/name: elastic-agent spec: replicas: 1 selector: matchLabels: app.kubernetes.io/name: elastic-agent template: metadata: labels: app.kubernetes.io/name: elastic-agent spec: serviceAccountName: elastic-agent containers: - name: elastic-agent image: docker.elastic.co/elastic-agent/elastic-agent:9.5.5 env: - name: CLUSTER_NAME value: "<Replace-cluster-name>" #replace this with your actual cluster name # Set to 1 for enrollment into Fleet server. If not set, Elastic Agent runs standalone. - name: FLEET_ENROLL value: "1" # Set to true to communicate with Fleet with either insecure HTTP or unverified HTTPS. - name: FLEET_INSECURE value: "false" # Fleet Server URL to enroll the Elastic Agent into. # Found in Kibana: Management > Fleet > Settings. - name: FLEET_URL value: "<Replace-fleet-url>" # Enrollment token used to enroll the Elastic Agent in Fleet. - name: FLEET_ENROLLMENT_TOKEN value: "<replace-token>" resources: limits: memory: 500Mi requests: cpu: 100m memory: 200Mi volumeMounts: # Persist Elastic Agent state across pod restarts within the pod's lifetime. - name: elastic-agent-state mountPath: /usr/share/elastic-agent/state volumes: - name: elastic-agent-state persistentVolumeClaim: claimName: agent-state

Note: The above manifest is to deploy a single replica `elastic agent` pod to scan and ingest compliance data. For OpenShift cluster logs and metrics, use the Elastic [Kubernetes](https://docs.elastic.co/integrations/kubernetes) integration separately.

Complete Kubernetes manifests and role-based access control (RBAC) are available in the GitHub [repository](https://github.com/elastic/elastic-labs/tree/main/supporting-blog-content/security-labs/openshift-compliance-agent/openshift).

## How to automate manual OpenShift compliance rules with CEL

Starting with [Red Hat OpenShift Compliance Operator version 1.10.0](https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/security_and_compliance/compliance-operator#compliance-operator-release-notes-1-10-0_compliance-operator-release-notes-v0), CEL-based custom rules are generally available (GA). Using this feature, create a `CustomRule` object for rules tagged as `Manual`.

For example, the compliance rule `accounts-restrict-service-account-tokens` is common across the profiles `ocp4-cis` and `ocp4-high`. Using a CEL expression, check whether any pods have the property `spec.automountServiceAccountToken` set to `true`:

apiVersion: compliance.openshift.io/v1alpha1 kind: CustomRule metadata: name: custom-accounts-restrict-service-account-tokens namespace: openshift-compliance spec: id: xccdf_org.ssgproject.content_rule_accounts_restrict_service_account_tokens title: "Service account tokens should not be automounted unless required" severity: medium checkType: Platform scannerType: CEL expression: | pods.items.all(p,!has(p.spec.automountServiceAccountToken) || p.spec.automountServiceAccountToken == false ) failureReason: "A pod has automountServiceAccountToken set to true" inputs: - name: pods kubernetesInputSpec: apiVersion: v1 resource: pods

Note: In the custom rule above, `spec.id` is mapped the same as in the original rule with status of `Manual`.

Custom rules cannot be evaluated directly on their own; they must be enabled through a [`TailoredProfile`](https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/security_and_compliance/compliance-operator#tailored-profile-object_compliance-crd) object. To execute the checks, bind this `TailoredProfile` to a `ScanSetting` using a `ScanSettingBinding`.

For example, create a `TailoredProfile` named `custom-ocp4-manual-rules` for the custom CEL rule `custom-accounts-restrict-service-account-tokens`:

apiVersion: compliance.openshift.io/v1alpha1 kind: TailoredProfile metadata: name: custom-ocp4-manual-rules namespace: openshift-compliance spec: title: "Custom CEL automation for shared manual rules (cis/e8/high)" description: "Each rule is evaluated once; rationale documents which native profiles it should be patched back to." enableRules: - name: custom-accounts-restrict-service-account-tokens kind: CustomRule rationale: "applies-to: cis,high"

Using a similar pattern, CEL checks for all the rules tagged as `MANUAL` can be evaluated.

Note: CEL-based evaluation only supports `platform` type rules.

In the [Elastic Workflows for live OpenShift cluster actions](https://www.elastic.co/security-labs/blog/openshift-compliance-elastic-agent-builder#elastic-workflows-for-live-openShift-cluster-actions) section, we define a workflow that reads scan data from these custom rules ingested into Elasticsearch and uses it to annotate `MANUAL rules` on the OpenShift Container Platform (OCP) cluster based on their `custom scan status`. Because the OpenShift Compliance Operator automatically propagates custom annotations from `Rule` custom resources (CRs) to their corresponding `ComplianceCheckResult` objects during scan runs, these evaluated statuses are automatically ingested into Elasticsearch on the subsequent scan cycle.

The following diagram illustrates the sequence for evaluating MANUAL compliance rules using a CEL-based check and annotating the result to the actual rule:

![Sequence diagram: CEL CustomRule scan in OpenShift, result ingested to Elasticsearch, workflow annotates rule](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/11cc36feb9e676cf.png)

## Build the OpenShift compliance agent in Agent Builder

Agent Builder lets you build purpose-driven AI agents connected to your Elasticsearch data. It provides four core building blocks (instructions, skills, tools, and connectors) that govern how the agent reasons and queries data, along with how it interacts with external platforms.

In this post, we build a custom OpenShift compliance agent, which reviews compliance scan data and identifies noncompliant clusters. It also evaluates failed compliance rules. Using tools, it can also trigger compliance scans and apply auto-remediation patches. Plus, it can generate operational reports.

The goal of this compliance agent is to let platform and security teams query compliance data in natural language, without writing custom queries or manually correlating results across clusters.

The following diagram illustrates the anatomy of the OpenShift compliance agent:

![Anatomy of the OpenShift compliance agent in Elastic Agent Builder: instructions, skills, tools, data sources](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8da1245508731636.png)

### Set the compliance agent’s instructions and guardrails

Configuring an agent in Agent Builder starts with custom instructions, which become part of the system prompt. They set the persona and reasoning habits for everything the agent does, in addition to the guardrails. For an OpenShift compliance agent, the most important decision is what level of actions the agent is allowed to perform. This agent uses a strictly precautionary role. It reviews and queries ingested compliance data and can apply remediation patches or trigger scans on the cluster with user approval. It treats the data in Elasticsearch as the source of truth and asks for any unstated detail, such as the cluster name or scan identifier, rather than assuming defaults.

The instructions are structured in Markdown across six focused sections (goal, steps, guardrails, domain context, output conventions, and edge cases):

**Section**

**What it covers**

Goal

The agent only handles OpenShift compliance; the ingested Elasticsearch data is the source of truth.

Steps

Confirm scope, retrieve data with the provided tools, verify the results, summarize, and then ask before acting.

Guardrails

No change without explicit approval; only the provided tools; no invented IDs or remediation; and off-topic requests are declined.

Domain context

Rules that the model cannot infer from the data, such as the custom scan and how manual checks are reported.

Output conventions

Timestamps in local time, plus the ingested and original timestamps for Elasticsearch data; sources are cited.

Edge cases

Missing input means ask; a failed or empty tool result is stated, never read as "compliant."

This excerpt from the directives and guardrails shows the tone:

\# Guardrails - \*\*Cluster Mapping\*\*: Cluster name provided by the user must match `orchestrator.cluster.name` exactly as recorded in compliance data. - \*\*Silent Exclusion of Custom Scans\*\*: By default, completely omit and suppress any scan or check result where `scan_name` contains `custom` (case-insensitive `*custom*`). Do NOT list, mention, or show an "Excluded custom scans" section or table in the output. Filter them out completely silently. Only include them if the user explicitly requests custom scans. - \*\*Handling Manual Rules\*\*: Treat OpenShift's base status MANUAL as manual review. If a custom automated evaluation exists, read `manual_scan_status` (`PASS` / `FAIL`) and `last_manual_scan` timestamp and report that custom evaluation separately. If absent, report "no manual scan annotation recorded". - \*\*Strict Read-Only Workload Investigation\*\*: When investigating which workload or pod caused a rule to fail, the agent operates in strictly read-only mode. The agent must NEVER mutate, patch, or change application workloads. It identifies the root cause and user attribution, and provides the remediation steps for the OpenShift administrator to execute. - \*\*Safety\*\*: Never execute live cluster changes or scans without presenting the plan and receiving explicit user confirmation. - \*\*Concise Communication\*\*: Answer directly and concisely using clear Markdown tables. Do not ask follow-up questions or offer unsolicited next steps unless clarification is strictly necessary to answer the prompt.

The instructions also carry domain context that a model cannot infer from the data. In OpenShift clusters, a custom scan bound to the `custom-ocp4-manual-rules` tailored profile tests manual rules. The agent leaves it out of summaries and counts unless the user asks for it.

For manual checks in the other scans, the agent reports two statuses side by side: the original status (MANUAL); and the manual scan status from the annotation that a scheduled Elastic workflow writes back to the cluster. Putting these rules in the instructions keeps them in one place, so no tool or skill needs to repeat them. Also, the whole block is static, with no timestamps or session IDs, so prompt caching keeps working.

### Add skills for posture, failure investigation, and reporting

Custom instructions are loaded on every turn, making them ideal for general guardrails and domain context. However, adding detailed task workflows to system instructions creates unnecessary prompt overhead. Instead, define modular skills that the agent loads dynamically when the user request matches the skill description.

The OpenShift compliance agent uses four skills, each covering a single responsibility:

**Skill**

**Reads from**

**What it does**

Posture summary

Latest-state indices

Summarizes current scan results, pass and fail counts, failed controls by severity, manual check status, and remediation state.

Failure investigation

Raw data streams

Explains why a check failed or when it started failing, using history and remediation records. Kubernetes log correlation comes once audit logs are ingested.

Live cluster actions

Live cluster, through workflows

Reads live state, triggers a rescan, and applies or reverts a remediation, always after user approval.

Reporting

Latest and raw data

Produces reports, trends, and scan comparisons, and creates dashboards after user approves.

Each skill includes a description specifying its purpose and trigger criteria. Below is the description for the `Posture Summary` skill:

Summarize OpenShift compliance posture, scan execution status, check results, manual rule evaluations, and remediation states from latest-state indices (ospm-compliance\_\*-latest).

Each skill defines its own trigger conditions, available tools, workflow rules, and decision trees, along with output standards, execution steps, examples, and edge cases. For example, the manual check logic described in the previous section is implemented as:

**Manual Rules & Custom Automated Evaluations** When manual rules are requested, call **ocp_compliance.list_checks_by_status** with status: **"MANUAL"**. For every manual check, inspect both the base OpenShift status and the custom evaluation annotations: Report the base status as **MANUAL**. If **manual_scan_status** contains a value (e.g. **PASS** or **FAIL**), present it separately as: "Custom Evaluation Status: (last evaluated at <last_manual_scan>)". If both **manual_scan_status** and **last_manual_scan** are empty/null, explicitly state: **"No manual scan annotation recorded"** (indicating it still requires manual verification). Do not interpret or alter values beyond what the data fields show.

### Custom ES|QL tools for querying compliance data

Skills tell the agent how to approach a task, but executing those steps requires tools to query data and perform actions. Because compliance scan data is normalized and stored in Elasticsearch, the agent uses targeted tools to search current posture and historical trends. Following are the tools configured for the compliance agent:

**Tool**

**Type**

**What it does**

ocp_compliance.get_scan_status

Elasticsearch Query Language (ES|QL)

Lists the scans on a cluster with result, phase, and timestamps.

ocp_compliance.list_checks_by_status

ES|QL

Lists checks with a given status, including manual scan annotations for manual checks.

ocp_compliance.list_remediations

ES|QL

Lists auto remediations with their apply flag, state, and target object.

ocp_compliance.get_rule_details

ES|QL

Looks up a specific compliance rule from latest-state data.

ocp_compliance.search_audit_logs

Index search

Searches the OpenShift cluster audit logs ingested into Elasticsearch cluster.

ocp_compliance.search_compliance_history

Index search

Offers open-ended search over the raw event history.

### Elastic Workflows for live OpenShift cluster actions

Although large language models (LLMs) excel at reasoning and synthesis, you don't want an AI model improvising arbitrary mutations against a live OpenShift cluster. [Elastic Workflows](https://www.elastic.co/docs/explore-analyze/workflows) solves this by executing deterministic, YAML-defined steps that run identically every time. When exposed to Agent Builder as tools, the agent decides when to invoke a workflow based on your prompt but cannot alter its underlying execution logic, ensuring strict guardrails around cluster interactions.

Four workflows handle the live cluster interactions supported by the agent, alongside a scheduled automation workflow that reconciles manual rule annotations:

**Workflow name**

**Agent tool**

**What it does**

openshift-compliance-query-live-workload

ocp_compliance.query_live_workload

Executes a strictly read-only HTTP GET request against the live OpenShift API to inspect objects and pinpoint the offending resource.

openshift-compliance-read-live-state

ocp_compliance.live_read_state

Reads the live state of one ComplianceScan, ComplianceCheckResult, or ComplianceRemediation directly from the OpenShift API.

openshift-compliance-trigger-scan

ocp_compliance.trigger_scan

Reruns an existing ComplianceScan on the live cluster by setting the rescan annotation.

openshift-compliance-set-remediation-state

ocp_compliance.set_remediation_state

Applies (apply: true) or reverts a native ComplianceRemediation on the live cluster.

Annotate custom compliance Rule resources

N/A

Checks custom CEL rule outcomes in Elasticsearch and annotates the corresponding rule object on the OpenShift cluster.

Each workflow tool has `Require user confirmation` set to `Always`, so Agent Builder pauses and asks to approve every call.

### Connect Elastic to the OpenShift API with the Kubernetes connector

The Elastic [Kubernetes connector](https://www.elastic.co/docs/reference/kibana/connectors-kibana/kubernetes-action-type) provides secure connectivity between the Elastic Stack and OpenShift API endpoints, allowing workflows to interact directly with cluster resources.

The service account token configured for the connector must follow the principle of least privilege, scoped strictly to the operations required by the workflows.

The connector needs patch permissions on the Compliance Operator custom resource definitions (CRDs), so workflows can trigger scans and apply remediations. Investigations need more than that; the agent has to read pods and service accounts, along with RBAC bindings, to find the workload behind a failed check, which also means read-only access to cluster workloads. You can grant both in two ways:

**Approach**

**Permissions granted**

**When to use**

Dedicated connector service account

Bound to the OpenShift view or cluster-reader ClusterRole for read-only workload queries, plus a scoped role granting patch on compliancescans and complianceremediations in compliance.openshift.io.

Production. The connector’s access is separate from the agent’s and can be audited and revoked on its own.

Extend the existing agent service account

Adds get and list on pods, serviceaccounts, and rolebindings to the existing elastic-agent-ospm ClusterRole.

PoCs and lab environments, where standing up a second service account is more setup than the exercise warrants.

The example below generates a token for the existing `elastic-agent` service account:

oc create token elastic-agent -n elastic-agent-ocp --duration=720h

Note: When deploying across multiple clusters or staging environments, ensure that `connector-id` in the workflow matches the specific Kubernetes connector configured for that cluster.

### The complete OpenShift compliance agent architecture

The finished agent combines custom instructions, skills, tools, workflows, and connectors. The final structure looks like this:

![Agentic compliance for OpenShift: agent read path to Elasticsearch and approval-gated act path to the cluster](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c8077fa29324372.png)

The complete agent and its supporting components manifests are available in the GitHub [repository](https://github.com/elastic/elastic-labs/tree/main/supporting-blog-content/security-labs/openshift-compliance-agent/elastic).

## OpenShift compliance agent demo: From failed control to root cause

The demo below follows the OpenShift compliance agent across an end-to-end investigation scenario. It shows how the agent summarizes multi-cluster posture and flags rule failures. It also demonstrates how the agent uses Elastic Workflows to query live pods without leaving the chat interface. From there, the agent correlates OpenShift audit logs in Elasticsearch to trace the exact user and deployment that caused the policy drift and documents the timeline into an Elastic case. And it shows how execution guardrails block unauthorized or destructive cluster commands.

## Conclusion: OpenShift compliance monitoring at fleet scale

The OpenShift Compliance Operator does the essential work of auditing cluster configurations, but keeping a multi-cluster fleet compliant shouldn't require juggling spreadsheets or hunting down failed pods manually, nor should it force you to scramble before every audit.

Centralizing compliance findings in Elasticsearch and putting Agent Builder on top shifts the experience from static dashboards to active, evidence-backed investigation. Teams can query posture across clusters in plain English and automate manual checks with CEL and scheduled workflows. They can also trace policy drift down to the exact OpenShift user and timestamp, all while keeping humans firmly in control of live cluster changes.
