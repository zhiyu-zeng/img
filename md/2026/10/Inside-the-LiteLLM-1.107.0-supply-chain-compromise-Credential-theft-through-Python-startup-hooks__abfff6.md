---
title: "Inside the LiteLLM 1.107.0 supply chain compromise: Credential theft through Python startup hooks"
source: https://www.microsoft.com/en-us/security/blog/2026/10/23/inside-the-litellm-1-107-0-supply-chain-compromise-credential-theft-through-python-startup-hooks/
source_host: www.microsoft.com
clip_date: 2026-10-24T02:21:38+08:00
trace_id: 85fe1862-8a32-4915-a7e8-e7485bd67fd6
content_hash: 58ecd0d3b2381c80a9af7caa258f8428521febc8d68d1edc71d2b601368c6c9c
status: synced
tags:
  - 恶意样本
  - 开发工具
series: null
feed_source: Microsoft Security Blog
ai_summary: LiteLLM 1.107.0 被投毒的 PyPI 包借助 Python 启动钩子自动执行凭据窃取程序，仅启动 Python 即可能中招，且删除包不足以恢复。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40275244-d011-81b5-b0b6-dee31bc8ae2a
ioc:
  cves: []
  cwes: []
  hashes:
    - 03ac2a8b752605d1d7710979c17ff18b03dd978203ba23ba97fd8ce3d6f897ea
    - 0aaf7ba346d41ef2f40390436738b001180d5a1c03aa093f121078a9969d9a1a
    - 12d4ccc5c6f8d35cf4f2cf233b7f3e418e863e657d81ff5f5fc9e210005b9484
    - 1bbce8caa94f01c0aaa0b7ddae51553a8a32e1ce53d96d44fe583272aff7ad00
    - 34bef04fe88ac9d0aae0475630b1738681d15b94f233ac8aa46eacf5968305fa
    - 462d0c9f67ca522d9e0e4acd245e90b36ce0d5353604a66bb7c43a1ec4a6fcf7
    - 668169d35b87bf51324080390b1b1c5ab12bd335cfe5f1a99e3689abd5e02ae6
    - 7598727f209d717041db37f7dca271d3a7d328a279890e0e1d55375729aeb86d
    - 7f191632e7320705d154b85204f1ae546b543acbd7e8861229b76f5042b92bdb
    - 84dc8c82c0a4a4a62552ef826b49fcc86d1a5c4a5d0f2c06665723f93d129d7d
    - 9dd0a3926f96a37eb86cf1ee2310d9be93139cc4ebef3ef9e2efe9531390be25
    - b6122440d0d9cb1eb1ade9933f49214da8c31288de7710c076c2680dfa528465
    - c2e32d0ce2548aa662c18bf5001911a79fe5b30cf8357132275add02fdcde054
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> LiteLLM 1.107.0 被投毒的 PyPI 包借助 Python 启动钩子自动执行凭据窃取程序，仅启动 Python 即可能中招，且删除包不足以恢复。
> 
> - **投毒文件与启动机制：** wheel 包在 `litellm-1.107.0.data/purelib/` 内置 `cook.pth`、`cook.py`、`sitecustomize.py`，安装时被放到环境库目录而非 litellm 应用目录；`.pth` 中的 `import cook` 与 sitecustomize 导入在解释器初始化阶段自动执行，无需导入 litellm。
> - **两条执行路径：** 第一条是 Base64、zlib 双层编码的窃密程序 PRIVCOLLECT，它在守护线程中运行，用 `PRIVCOLLECT_ACTIVE` 环境变量抑制重复执行，并写入 `/tmp/.pc_once_…` 标记；第二条是 Unix 方向的 `sitecustomize.py` 加载器，它读取 GitHub 上可变的 `domain.txt` 指针，再从 `/codepy` 拉取并执行代码，而该路径尚未确认成功执行。
> - **收集范围：** 覆盖 AI 助手、IDE、Copilot、VS Code、MCP 配置，Git 与包管理器凭据，AWS、Azure CLI、GCP 配置与元数据凭证，K8s ServiceAccount、Docker、SSH 与 GPG 密钥、浏览器凭据与历史，Linux procfs 中其他进程环境变量；还通过 Prisma 从 LiteLLM 代理的两张表读取字段，单表上限 500 行。
> - **加密与外传：** 每次运行生成随机 AES-256-CBC 密钥与 IV，用 4096 位 RSA-OAEP 封装密钥，打包为 gzip 压缩包，内含 data.bin、key.bin、hdr.json，然后 POST 至 `www.litellm.dev/healthcheck`，仅把 HTTP 200 视为成功。
> - **处置要点：** 不要在可疑环境中运行 python 或 pip 取证；需重建环境，确认三个启动文件已清除，从干净机器轮换模型密钥、云凭证、CI/CD 与 SSH 密钥并吊销会话；排查命令包括按 SHA-256 匹配启动文件、`.pc_e_` 暂存目录与 OpenSSL aes-256-cbc、pkeyutl 调用、TVM-2026-0003 暴露查询。

On October 21, 2026, a compromised LiteLLM 1.107.0 release was published to the Python Package Index (PyPI) and distributed through official container images. The malicious package added files that Python could execute during normal interpreter initialization. An application did not need to import LiteLLM for the payload to run: starting Python in an affected environment could be enough.

Microsoft analyzed two execution paths in the affected wheels: a credential collector launched through a path extension, and a Unix-oriented loader persisted through site-specific configuration. The collector targeted authentication material across developer tools, AI applications, cloud environments, browsers, and infrastructure. A separate database module attempted to read selected credential and model-configuration records from the LiteLLM proxy.

Endpoint observations on Windows and macOS matched the recovered collector’s discovery, encryption, and outbound-connection behavior. In one Windows example, a routine Python invocation to install an unrelated dependency activated the collector. This distinction matters for response: investigators should not start Python or pip inside a suspect environment to determine whether the malicious package is present.

This blog explains the startup mechanisms, the credentials the payload could reach, and the evidence defenders can use to investigate exposure. It also provides Microsoft Defender detection information, advanced hunting queries, and recovery guidance. **Removing the package or a release tag is not sufficient recovery.** Organizations must address the affected Python environment, any surviving processes, and credentials accessible to the compromised identity.

## Attack overview

LiteLLM is commonly deployed as a gateway between applications and model providers. In that position it may have access to model-provider API keys, database connection strings, workload identities, routing configuration, and tenant policy data. The same package is also used on developer workstations, build agents, test systems, and containers, which widened the set of environments that could be exposed by the compromised release.

According to LiteLLM [maintainers](https://docs.litellm.ai/blog/security-incident-oct-21-2026), stolen developer GitHub credentials were used to alter the release workflow and redirect it to the lookalike repository Berri-AI/litellm rather than the legitimate BerriAI/litellm repository. A credential associated with another developer account was then used to satisfy a production approval step. Microsoft has not independently determined how the attacker first accessed the upstream environment or obtained those credentials.

The compromised package used Python startup mechanisms to execute malicious code automatically, meaning exposure was not limited to systems actively using a LiteLLM gateway. Developer workstations, continuous integration and continuous delivery/deployment (CI/CD) agents, test environments, containers, and other systems that started Python with the affected package installed could also execute the payload. The malicious code supported credential collection and, on Unix-based systems, retrieval and execution of additional Python code.

![Diagram showing compromised LiteLLM 1.107.0 installing Python startup files that automatically launch a credential collector. Stolen developer, cloud, browser, SSH, environment, and LiteLLM database data is encrypted and sent to an attacker-controlled endpoint. An optional Unix path can retrieve and execute additional Python code; this activity was not confirmed.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/97d88b6392403cb6.webp)

Figure 1: Compromised LiteLLM 1.107.0 execution flow.

**1\. Compromised package distribution**

The compromised LiteLLM 1.107.0 release delivered malicious Python startup files to environments where the package was installed.

**2\. Automatic payload execution**

Python startup processing launched the credential collector without requiring the application to actively use LiteLLM gateway functionality.

**3\. Credential and sensitive-data collection**

The collector targeted developer credentials, cloud credentials, browser data, SSH material, environment variables, and LiteLLM database data accessible to the affected process.

**4\. Encryption and exfiltration**

Collected data was encrypted and transmitted to an attacker-controlled endpoint.

**5\. Conditional retrieval and execution of additional code**

On Unix-based systems, the payload supported retrieving and executing additional Python code, although this activity was not confirmed.

## Technical details

### Compromised package distribution and automatic payload execution

The compromised wheel packaged *cook.pth*, *cook.py*, and *sitecustomize.py* under *litellm-1.107.0.data/purelib/*. During installation, these files were relocated into the Python environment’s library directory, outside the normal *litellm* application directory. This placement enabled execution through Python’s normal site initialization, which processes executable import statements in *.pth* files and later attempts to import the *sitecustomize* module.

The first execution path began with the single executable line in *cook.pth*: “import cook”. This loaded *cook.py*, whose wrapper Base64-decoded and zlib-decompressed an embedded Python program before executing the recovered source. The program identified itself as PRIVCOLLECT and performed credential collection in a daemon thread.

![Python code checks the PRIVCOLLECT\_ACTIVE flag, then launches the credential collector in a daemon thread or synchronously.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8dfb9ef5e64ee709.webp)

Figure 2. The executable.pth line imports cook, and the recovered collector starts a daemon thread after checking its inherited environment flag.

Before starting the thread, the collector checked the inherited *PRIVCOLLECT_ACTIVE* environment variable. A nonempty value caused it to return; otherwise, it set the flag, limiting duplicate collection in descendant processes. After an upload returned HTTP 200, it attempted to write */tmp/.pc_once_72129118c59f5636c0bb*. These duplicate-suppression gates were not containment controls: startup alone did not prove collection or upload completed, because a short-lived process could exit before the thread finished, while write failures or temporary-storage changes could leave the marker absent.

![Python code decodes and executes an embedded Base64- and zlib-encoded payload. The recovered Linux collector configuration specifies an upload endpoint and RSA key, and enables asynchronous collection of system, browser, SSH, shell-history, and cloud-credential data.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2e009982daa94f83.webp)

Figure 3. Encode Cook.py file and decoded PRIVCOLLECT credential Stealer configuration.

A second startup mechanism used *sitecustomize.py*, providing a separate Unix-oriented execution path with an embedded collector and functionality to retrieve and execute additional Python code from a remote host. Remote retrieval and execution through this path were not confirmed.

Together, these mechanisms extended potential exposure beyond active LiteLLM deployments: simply starting Python in an affected environment could activate the malicious code, even when LiteLLM itself was never imported. Because the startup files resided outside the *litellm* application directory, removing only the application files could leave the malicious startup components behind.

### Credential and sensitive-data collection

The recovered collector was designed to gather sensitive authentication material across developer tools, AI applications, cloud environments, browsers, and infrastructure. It runs multiple collection modules sequentially with independent error handling, allowing collection to continue even when individual targets are unavailable or inaccessible.

|     |     |
| --- | --- |
| **Target** | **Recovered collection behavior** |
| Developer and AI tools | Reads selected authentication and configuration files for AI assistants, integrated development environments (IDEs), GitHub Copilot, VS Code, and MCP integrations. Collects fixed paths and top-level JSON files in selected tool directories under a collection budget. |
| Source control and package ecosystems | Searches Git credentials, package-manager configuration, selected dotenv files, and private-key extensions. Shallow directory walks and file-size limits constrain these searches. |
| Cloud and workload credentials | Reads AWS, Azure CLI, and Google Cloud configuration or credential caches; Kubernetes service-account files; Docker configuration; and mounted secrets. It also attempts AWS and GCP metadata credential retrieval. |
| Browsers and user histories | Accesses Chromium-family and Firefox credential-related data and browsing history, plus shell, database-client, and interactive-tool histories. Password decryption is platform- and format-dependent. |
| Process environments | Collects its own environment and, on Linux, other process environments readable through procfs. This can expose secrets beyond variables explicitly configured for the LiteLLM process. |
| Private keys and infrastructure | Targets readable Secure Shell (SSH) material and selected GNU Privacy Guard (GPG), Transport Layor Security (TLS), CI/CD, Vault, and infrastructure-tool configuration. A target appearing in the code does not establish successful access. |
| LiteLLM proxy data | When its prerequisites are satisfied, starts a Python child using Prisma to read selected fields from two proxy database tables, with a 500-row limit for each query |

### Encryption and exfiltration

After collection, the payload serializes module results and host metadata as JSON. Each run generates a 32-byte AES key and a 16-byte initialization vector. AES-256-CBC encrypts the collection document; an embedded 4,096-bit RSA public key wraps the AES key using OAEP. The OpenSSL path tries SHA-256 and then SHA-1 for OAEP, and the resulting metadata records the selected digest.

![Python code encrypts collected data with AES, wraps the key with RSA, packages the results in a gzip archive, and uploads it.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/97fb3314d4a71578.webp)

Figure 4. The collector generates a fresh AES key and IV, wraps the key with RSA, and packages the encrypted collection in a gzip tar archive before attempting upload. Selected code excerpts are wrapped for readability.

The collector places three members in a gzip-compressed tar archive: *data.bin*, containing the initialization vector (IV) and encrypted collection; *key.bin*, containing the wrapped AES key; and *hdr.json*, containing plaintext envelope metadata. It then attempts an HTTP POST to *hxxp://www\[.\]litellm\[.\]dev/healthcheck*, using *application/octet-stream*, a fixed browser-like User-Agent, and a body checksum in an X-SHA256 header. The upload routine retries and treats only HTTP 200 as success.

The OpenSSL backend creates temporary directories beginning with *.pc_e\_*, stages input and output files and removes them after use.

### Conditional retrieval and execution of additional code

In addition to the credential collector, the compromised package contained a separate Unix-oriented loader in *sitecustomize.py*, designed to retrieve and execute additional Python code. When Python starts, the loader takes an exclusive lock on */tmp/remote_code_loader.lock* so that only one instance runs per host and detaches into the background. Each cycle reads a GitHub-hosted *domain.txt* file, which acts as a mutable pointer to an attacker-controlled server.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/071154abc21fc869.webp)

Figure 5. The remote-loader path checks the pointer and DNS before retrieving code, then compiles and executes the response without a content-signature check.

If a valid server address is returned and successfully resolved, the loader is designed to request */codepy* from that server, compile the returned content, and execute it as Python code within the affected environment. This gives the attacker a mechanism to change the second-stage payload without publishing another compromised LiteLLM package. This loader is separate from the credential collector delivered directly in the compromised package.

At the time the cited researchers examined domain.txt, it was empty and no second-stage retrieval or execution was confirmed. Because the file could be changed, the loader remained a re-armable remote-code execution mechanism.

## Mitigation and protection guidance

Microsoft recommends the following actions for organizations that installed, mirrored, or built images with LiteLLM 1.107.0:

-   **Find and contain every affected copy.** Identify LiteLLM 1.107.0 across installed environments, uv and pip caches, internal package mirrors, lock files, build outputs, and container images. Scope mutable container tags and the relevant exposure windows once validated and compare artifacts with the customer-ready hashes in the indicators of compromise section. For background, see [secure software supply chain practices](https://www.microsoft.com/en-us/securityengineering/sdl/practices/sscs?msockid=2bb1167811446f881835013410836e11) and Docker image digests. Digests are preferable to mutable tags because they identify immutable image content.

-   **Prevent Python execution and investigate from outside the environment.** Isolate affected developer workstations, build agents, test systems, containers, and AI gateway hosts. Where operationally safe, stop running Python processes and prevent automation from restarting them. Do not run python, pip, or other commands that invoke the affected interpreter during evidence collection; inspect the environment with trusted tools from a known-clean system. Python normally processes site configuration, including executable import lines in *.pth* files, during initialization.

-   **Rebuild from verified artifacts.** Confirm that *cook.pth*, *cook.py*, and *sitecustomize.py* were removed from the environment library path. Rebuilding is more reliable than assuming that deleting the *litellm* directory cleaned the top-level startup files.

-   **Rotate reachable credentials from a known-clean machine.** Include model-provider keys, cloud and workload credentials, CI/CD secrets, source-control and registry tokens, SSH and GPG keys, AI coding-tool tokens, and browser sessions available to the affected identity. On proxy hosts, include stored provider credentials and DATABASE_URL. Revoke affected identity sessions rather than assuming password or key rotation immediately invalidates every active token or application session. See [revoke user access in Microsoft Entra ID](https://learn.microsoft.com/entra/identity/users/users-revoke-access).

-   **Correlate before declaring compromise.** Combine file hashes, Python process ancestry, *.pc_e\_* cryptographic staging, network destination, workload identity, and subsequent cloud or identity use. Do not use package presence or a generic filename as the sole verdict.

-   **Strengthen dependency controls.** Use hash-pinned lock files, verify package and image provenance, use container digests instead of floating tags, and admit packages to internal mirrors only after review. See [best practices for a secure software supply chain](https://learn.microsoft.com/nuget/concepts/security-best-practices) and [dependency scanning in Azure DevOps](https://learn.microsoft.com/azure/devops/repos/security/github-advanced-security-dependency-scanning?view=azure-devops).

-   **Restrict outbound access.** Developer workstations, build agents, test systems, containers, and AI gateway hosts should not have unrestricted outbound HTTP access unless required. Route outbound traffic through managed egress controls, deny unnecessary destinations, and allowlist required services. See [control outbound internet access from Azure](https://learn.microsoft.com/azure/networking/design-guide/outbound-egress?pivots=lift-shift).

-   **Enable Microsoft Defender for Endpoint** protections. Onboard supported developer workstations, build agents, and AI gateway servers to Microsoft Defender for Endpoint, and enable Microsoft Defender Antivirus real-time and cloud-delivered protection where supported. See [configure always-on protection](https://learn.microsoft.com/defender-endpoint/configure-real-time-protection-microsoft-defender-antivirus) and [configure cloud protection](https://learn.microsoft.com/defender-endpoint/cloud-protection-configure).

### Microsoft Defender XDR detections

As of October 22, 2026, the following Microsoft Defender Antivirus signatures and Microsoft Defender for Endpoint alerts were available for activity associated with the compromised LiteLLM 1.107.0 release. Detection names and availability may change as protection is updated.

|     |     |     |
| --- | --- | --- |
| **Tactic** | **Observed activity** | **Microsoft Defender coverage** |
| Initial Access / Execution | Malicious components associated with the compromised package are detected and blocked; related suspicious script and network activity is identified across endpoints and cloud workloads. | **Microsoft Defender Antivirus**  <br>– Trojan:PyPI/Stealer.SA  <br>– Trojan:PyPI/LiteLlmSupplyChain.A  <br>– Trojan:PyPI/LiteLlmSupplyChain.B  <br>– Backdoor:PyPI/LiteLlmSupplyChain.C  <br>  <br>**Microsoft Defender for Endpoint**  <br>– Suspicious script launched  <br>– Suspicious network connection observed |
| Command and Control / Credential Access | Credential-like data is staged by Python and followed by network activity to a public destination, including malicious-domain lookups and OpenSSL activity associated with the compromise. | **Microsoft Defender for Endpoint**  <br>**–** Possible theft of passwords and other sensitive web browser information  <br>– Suspicious OpenSSL command launch  <br>  <br>**Microsoft Defender for Cloud**  <br>Microsoft Defender for Cloud triggers below detections for related activity in Azure App Service and Kubernetes workloads:  <br>  <br>– OpenSSL activity associated with possible LiteLLM compromise detected  <br>– DNS lookup of a known malicious domain |
| Vulnerability Management | Devices vulnerable to this security issue are surfaced for remediation. | **Microsoft Defender Vulnerability Management**  <br>– Endpoints exposure tab in the Microsoft Defender portal: TVM-2026-0003 |

### Threat intelligence reports

Microsoft customers can use the following reports in Microsoft products to get the most up-to-date information about the threat actor, malicious activity, and techniques discussed in this blog. This report provides intelligence, protection information, and recommended actions to prevent, mitigate, or respond to associated threats found in customer environments.

### Microsoft Defender XDR Threat analytics

[Inside the LiteLLM 1.107.0 supply chain compromise: Credential theft through Python startup hooks](https://security.microsoft.com/threatanalytics3/669bd0d8-2721-4c3c-b098-b9fbde9d68d8)

### Advanced hunting

These queries support investigation of the stages discussed above. Select the appropriate lookback in Defender XDR and correlate results with environment, process and identity evidence. They are investigation leads, not standalone verdicts.

**Connections to the collector domain**

Normalize URL/hostname observations before matching the campaign domain. The query rejects suffix lookalikes such as www\[.\]litellm\[.\]dev\[.\]example; a match still needs process and workload context.

```java
DeviceNetworkEvents
| extend UrlForParsing = iff(RemoteUrl contains "://",
    RemoteUrl, strcat("http://", RemoteUrl))
| extend RemoteHost = trim_end(@"\.",
    tolower(tostring(parse_url(UrlForParsing).Host)))
| where RemoteHost in ("www.litellm.dev", "litellm.dev")
| project Timestamp, DeviceId, DeviceName, ActionType,
    RemoteUrl, RemoteIP, RemotePort, InitiatingProcessFileName,
    InitiatingProcessId, InitiatingProcessCreationTime, ReportId
```

**Known startup-file hashes**

The four hashes cover LF and CRLF variants. A missing SHA-256 field limits this hunt; a generic filename is not an equivalent match.

```sql
DeviceFileEvents
| where SHA256 in~ (
    "9dd0a3926f96a37eb86cf1ee2310d9be93139cc4ebef3ef9e2efe9531390be25",
    "03ac2a8b752605d1d7710979c17ff18b03dd978203ba23ba97fd8ce3d6f897ea",
    "34bef04fe88ac9d0aae0475630b1738681d15b94f233ac8aa46eacf5968305fa",
    "b6122440d0d9cb1eb1ade9933f49214da8c31288de7710c076c2680dfa528465")
| project Timestamp, DeviceId, DeviceName, ActionType,
    FileName, FolderPath, SHA256, InitiatingProcessFileName,
    InitiatingProcessId, InitiatingProcessCreationTime, ReportId
```

**Inline database-collection program**

Look for the sensitive table/field pair together with the query API, serialization and complete output-suppression pattern. Legitimate exports may overlap. The recovered parent’s /proc prerequisite limits its applicability; raw arguments are omitted because they can contain a database secret.

```sql
DeviceProcessEvents
| where FileName startswith "python" or FileName startswith "platform-python"
| where strlen(ProcessCommandLine) <= 4096
| where ProcessCommandLine contains_cs "-c "
| where (ProcessCommandLine contains_cs "LiteLLM_CredentialsTable"
        and ProcessCommandLine contains_cs "credential_values")
    or (ProcessCommandLine contains_cs "LiteLLM_ProxyModelTable"
        and ProcessCommandLine contains_cs "litellm_params")
| where ProcessCommandLine contains_cs "query_raw"
| where ProcessCommandLine contains_cs "json.dumps("
    or ProcessCommandLine contains_cs "json.dump("
| where ProcessCommandLine contains_cs "os.devnull"
    and ProcessCommandLine contains_cs "os.dup2"
| project Timestamp, DeviceId, DeviceName, FileName,
    ProcessId, ProcessCreationTime, InitiatingProcessFileName,
    InitiatingProcessId, InitiatingProcessCreationTime, ReportId
```

**Collector-like encryption staging**

The staging prefix plus encryption operation identifies a behavioral lead, not an upload or a uniquely malicious OpenSSL invocation. Alternate backends are outside this query, and key-bearing arguments are not projected.

```sql
DeviceProcessEvents
| where FileName in~ ("openssl", "openssl.exe")
| where ProcessCommandLine contains_cs ".pc_e_"
| where (ProcessCommandLine contains_cs " enc "
        and ProcessCommandLine contains_cs "-aes-256-cbc")
    or ProcessCommandLine contains_cs " pkeyutl "
    or ProcessCommandLine contains_cs " rsautl "
| extend CryptoOperation = iff(
    ProcessCommandLine contains_cs " enc ", "AES packaging", "RSA wrapping")
| project Timestamp, DeviceId, DeviceName, FileName, CryptoOperation,
    ProcessId, ProcessCreationTime, InitiatingProcessFileName,
    InitiatingProcessId, InitiatingProcessCreationTime, ReportId
```

**Vulnerability/Posture Check | Is the device potentially exposed to the affected Litellm?**

Use this query to identify devices potentially exposed to TVM-2026-0003. A match indicates potential exposure, not confirmed exploitation or compromise.

```
DeviceTvmSoftwareVulnerabilities
| where CveId == "TVM-2026-0003"
```

**CloudProcessEvents query to detect encryption before exfiltration**

*Identifies OpenSSL public-key encryption using /tmp/.pc\_ staging paths, consistent with key wrapping before potential exfiltration.*

```java
CloudProcessEvents
| where ProcessName == 'openssl' and ProcessCurrentWorkingDirectory has_any ('/runner/','/app','/tmp/')
    and ProcessCommandLine has_all ('pkeyutl','-encrypt','-pubin') and ProcessCommandLine contains '/tmp/.pc_'
```

### MITRE ATT&CK techniques observed

Microsoft mapped the following techniques based on observed activity and analysis of the recovered malicious components; individual entries note where behavior was not confirmed. For standard industry documentation, refer to the [MITRE ATT&CK framework](https://attack.mitre.org/).

**Initial Access**

-   [T1195.001 Compromise Software Dependencies and Development Tools](https://attack.mitre.org/techniques/T1195/001/) | Malicious files shipped in LiteLLM 1.107.0 wheels and images; upstream release abuse reported by the maintainer.

**Persistence**

-   [T1546.018 Event Triggered Execution: Python Startup Hooks](https://attack.mitre.org/techniques/T1546/018/) | cook.pth and sitecustomize.py run during Python site initialization.

**Execution**

-   [T1059.006 Command and Scripting Interpreter: Python](https://attack.mitre.org/techniques/T1059/006/) | The collector runs in the interpreter; an inline Python child performs database queries.

**Defense Evasion**

-   [T1027.013 Obfuscated Files or Information: Encrypted/Encoded File](https://attack.mitre.org/techniques/T1027/013/) | Collector source is embedded as Base64-encoded, zlib-compressed content.
-   [T1140 Deobfuscate/Decode Files or Information](https://attack.mitre.org/techniques/T1140/) | cook.py decodes and decompresses the collector at runtime.

**Credential Access**

-   [T1552.001 Unsecured Credentials: Credentials In Files](https://attack.mitre.org/techniques/T1552/001/) | Reads authentication and configuration files for developer, AI, and cloud tools.
-   [T1552.004 Unsecured Credentials: Private Keys](https://attack.mitre.org/techniques/T1552/004/) | Reads selected SSH, GPG, and TLS key material.
-   [T1552.005 Unsecured Credentials: Cloud Instance Metadata API](https://attack.mitre.org/techniques/T1552/005/) | Requests AWS and GCP credentials from metadata services; returned credentials were not confirmed in Microsoft telemetry.
-   [T1555.003 Credentials from Password Stores: Credentials from Web Browsers](https://attack.mitre.org/techniques/T1555/003/) | Copies browser databases and supports selected Chromium password recovery on Windows.

**Discovery**

-   [T1082 System Information Discovery](https://attack.mitre.org/techniques/T1082/) | systeminfo was launched by Python in an observed Windows sequence.
-   [T1016 System Network Configuration Discovery](https://attack.mitre.org/techniques/T1016/) | ipconfig, route, arp, and netstat were launched by the same Python process.

**Collection**

-   [T1005 Data from Local System](https://attack.mitre.org/techniques/T1005/) | Collects selected local histories, environment variables, and configuration.

**Command and Control**

-   [T1102.001 Web Service: Dead Drop Resolver](https://attack.mitre.org/techniques/T1102/001/) | The loader reads its server address from a specific GitHub-hosted file.
-   [T1105 Ingress Tool Transfer](https://attack.mitre.org/techniques/T1105/) | The loader can retrieve Python code from /codepy; retrieval and execution were not confirmed.

## Indicators of compromise

URLs are defanged. Use precise roles and context rather than blocking shared infrastructure indiscriminately.

|     |     |     |
| --- | --- | --- |
| **Indicator** | **Type** | **Role** |
| www\[.\]litellm\[.\]dev | Domain | Exfiltration Domain |
| hxxp://www\[.\]litellm\[.\]dev/healthcheck | URL | Exfiltration URL |
| hxxps://raw\[.\]githubusercontent\[.\]com/letters9813/pythonclient-test/main/domain.txt | URL | C2 dead-drop URL |
| 9dd0a3926f96a37eb86cf1ee2310d9be93139cc4ebef3ef9e2efe9531390be25 | SHA-256 | cook.py, variant |
| 03ac2a8b752605d1d7710979c17ff18b03dd978203ba23ba97fd8ce3d6f897ea | SHA-256 | cook.py, Windows wheel variant |
| 34bef04fe88ac9d0aae0475630b1738681d15b94f233ac8aa46eacf5968305fa | SHA-256 | sitecustomize.py, variant |
| b6122440d0d9cb1eb1ade9933f49214da8c31288de7710c076c2680dfa528465 | SHA-256 | sitecustomize.py, Windows wheel variant |
| 7f191632e7320705d154b85204f1ae546b543acbd7e8861229b76f5042b92bdb | SHA-256 | cook.pth |
| 84dc8c82c0a4a4a62552ef826b49fcc86d1a5c4a5d0f2c06665723f93d129d7d | SHA-256 | cook.pth, variant |
| /tmp/remote_code_loader.lock | file | Lock file created by the background loader. |
| /tmp/.pc_once_72129118c59f5636c0bb | file | Marker written after stolen data was sent. |
| 7598727f209d717041db37f7dca271d3a7d328a279890e0e1d55375729aeb86d | SHA-256 | litellm-1.107.0-cp310-abi3-macosx_10_12_x86_64.whl |
| 0aaf7ba346d41ef2f40390436738b001180d5a1c03aa093f121078a9969d9a1a | SHA-256 | litellm-1.107.0-cp310-abi3-macosx_11_0_arm64.whl |
| 668169d35b87bf51324080390b1b1c5ab12bd335cfe5f1a99e3689abd5e02ae6 | SHA-256 | litellm-1.107.0-cp310-abi3-manylinux_2_28_aarch64.whl |
| 462d0c9f67ca522d9e0e4acd245e90b36ce0d5353604a66bb7c43a1ec4a6fcf7 | SHA-256 | litellm-1.107.0-cp310-abi3-manylinux_2_28_x86_64.whl |
| c2e32d0ce2548aa662c18bf5001911a79fe5b30cf8357132275add02fdcde054 | SHA-256 | litellm-1.107.0-cp310-abi3-musllinux_1_2_aarch64.whl |
| 1bbce8caa94f01c0aaa0b7ddae51553a8a32e1ce53d96d44fe583272aff7ad00 | SHA-256 | litellm-1.107.0-cp310-abi3-musllinux_1_2_x86_64.whl |
| 12d4ccc5c6f8d35cf4f2cf233b7f3e418e863e657d81ff5f5fc9e210005b9484 | SHA-256 | litellm-1.107.0-cp310-abi3-win_amd64.whl |

## References

-   LiteLLM, [Contained: Oct 21, 2026 LiteLLM release v1.107.0 Compromised](https://docs.litellm.ai/blog/security-incident-oct-21-2026)
-   Python Software Foundation, [Site-specific configuration hook](https://docs.python.org/3/library/site.html)**.**

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

The post [Inside the LiteLLM 1.107.0 supply chain compromise: Credential theft through Python startup hooks](https://www.microsoft.com/en-us/security/blog/2026/10/23/inside-the-litellm-1-107-0-supply-chain-compromise-credential-theft-through-python-startup-hooks/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog).
