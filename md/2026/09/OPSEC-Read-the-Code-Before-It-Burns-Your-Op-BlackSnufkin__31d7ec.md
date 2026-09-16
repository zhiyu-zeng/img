---
title: "OPSEC: Read the Code Before It Burns Your Op | BlackSnufkin"
source: https://blacksnufkin.github.io/posts/opsec-offensive-code-review/
source_host: blacksnufkin.github.io
clip_date: 2026-09-16T10:17:01+08:00
trace_id: 77063a99-fbc9-4b1e-8feb-00e77d7dd837
content_hash: 530b627f6d7ea06b465b644dd9e61da3c9001b5b0150cf78a769a7074f2fecc0
status: synced
tags:
  - 安全工具
  - 恶意样本
series: null
feed_source: BlackSnufkin
ai_summary: 进攻工具中的硬编码常量（进程名、管道名、域名、模板值）会跨部署保持稳定，成为防守方可靠的检测签名，使用前必须审查源码。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3dd75244-d011-81d1-b95d-f779564d4f4d
ioc:
  cves:
    - CVE-2025-44228
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 进攻工具中的硬编码常量（进程名、管道名、域名、模板值）会跨部署保持稳定，成为防守方可靠的检测签名，使用前必须审查源码。
> 
> - **拼写错误即签名：** Rubeus 旧版把 LSA 进程名写成 `User32LogonProcesss`（多一个 s），出现在 4624/4634 认证日志；KrbRelayUp 复用同段代码继承了该标识。Impacket psexec 的主通信管道拼作 `communicaton`，在命名管道创建与 SMB 流量中可定位工具。
> - **协议固定值：** Impacket SimpleSMBServer 初始化时硬编码 NTLM challenge，使每次握手的 NTLMSSP_CHALLENGE 均为 `4141414141414141`；即便调用 `setSMBChallenge()` 传空串仍会回退到该值。Mimikatz 旧版金票默认域名 `<3 eo.oe ~ ANSSI E>` 曾出现在 Kerberos 认证日志。
> - **云端与产物痕迹：** ROADtools 设备注册硬编码域 `iminyour.cloud`，出现在 Azure 注册与云审计日志；AADInternals 的设备回调固定电话号 `1234567890` 留在 Intune/MDM 与 SyncML 记录。NetExec `drop-sc` 生成的 searchConnector 文件含固定 rickroll URL；Huan 加壳器统一使用 `.huan` 节名。
> - **审查方法：** 确认配置项是否真正覆盖输出中的默认值、枚举全部外部产物（文件/注册表/流量/日志/进程名）、检查 XML/JSON/二进制模板字段、排查协议头与管道名、清理错误与调试信息里的工具名和版本串。
> - **反向陷阱：** 伪造成 `cve-2025-44228` PoC 的恶意仓库用 `.vbproj` 的 MSBuild PreBuildEvent 在 IDE 打开时自动执行并释放 AES 加密 PowerShell；应先以文本方式打开项目、禁用自动构建步骤，并在可丢弃的 VM 中审查。

Hardcoded constants in offensive tools become detection signatures. Static strings that seem harmless during development persist in logs, network traffic, and file systems, creating reliable indicators for defensive teams.

This analysis examines specific examples from commonly used tools and outlines a review methodology to identify these issues before operational use.

* * *

## Detection Through Static Artifacts

Defense systems increasingly rely on stable identifiers embedded in tools rather than behavioral patterns. Process names, pipe identifiers, domain values, and template content provide high-confidence detection opportunities when they remain constant across deployments.

These artifacts appear in Windows event logs, network monitoring, file forensics, and cloud audit trails. Once cataloged, they enable retrospective analysis and cross-campaign attribution.

* * *

## Tool Analysis

### Rubeus: LSA Process Name (Historical)

Rubeus is a C# toolset for Kerberos interaction and attacks. It handles authentication operations through the Local Security Authority (LSA) interface.

Earlier versions registered with the Local Security Authority using a non-standard process name:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/61b98fe5865372dc.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/rubeus-typo.png)

The legitimate Windows process name is `User32LogonProcess`. Those versions used `User32LogonProcesss` with an additional ‘s’, creating a unique identifier that appeared in authentication events (Event ID 4624/4634) on every target system.

This deviation from the documented LSA interface made Rubeus activity distinguishable from legitimate authentication processes. This has been addressed in current versions.

**Signature Propagation**: The same typo appears in [KrbRelayUp](https://github.com/Dec0ne/KrbRelayUp), a local privilege escalation tool that leverages Kerberos relay attacks. KrbRelayUp inherited this identifier when implementing similar LSA functionality, demonstrating how detection signatures propagate across tools when developers reuse code without reviewing for operational security implications.

This creates a shared IOC between two distinct tools, allowing defenders to attribute activity to either Rubeus (historical versions) or KrbRelayUp through the same authentication log signature.

### NetExec: Search Connector Module

NetExec is a network execution tool for penetration testing with various attack modules. The `drop-sc` module implements a technique for lateral movement using Windows Search Connectors.

The `drop-sc` module generates Windows Search Connector files containing hardcoded URL values:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/23d83efd21f8a613.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/nxc-rickroll.png)

Each generated `.searchConnector-ms` file embeds this default URL in its XML structure unless explicitly overridden. File analysis immediately identifies the tool and technique through this constant.

### Mimikatz: Golden Ticket Domain (Historical)

Mimikatz is a post-exploitation tool for credential extraction and Kerberos manipulation. The golden ticket functionality allows creation of forged Kerberos tickets.

Previous versions used a static domain in golden ticket generation. The problematic code appeared in the validation info structure:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/932e19548e7cc306.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/mimikatz-ansi.png)

This hardcoded domain `<3 eo.oe ~ ANSSI E>` appeared in Kerberos authentication logs for every generated ticket using default parameters. The string became a reliable detection signature in Windows Security logs before being addressed in later releases.

### Impacket: Named Pipe Implementation

Impacket is a Python library for network protocol implementation. The psexec module provides remote command execution capabilities similar to Microsoft’s PsExec tool.

The psexec module creates named pipes with consistent patterns and contains a spelling error:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/06db06ae9d2c672f.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/impacket-typo.png)

The primary communication pipe uses “communicaton” instead of “communication”. This identifier appears in named pipe creation events and SMB traffic analysis, providing definitive tool attribution.

### Impacket: SMB Challenge Value

Impacket is a Python library for network protocol implementation. The SimpleSMBServer class provides SMB server functionality used by smbserver.py and ntlmrelayx relay operations.

Server initialization hardcodes the NTLM challenge value:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a85b6fd030802ee7.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/impacket-smb_server_challenge.png)

This produces `4141414141414141` in NTLMSSP_CHALLENGE messages during every authentication handshake. The constant appears in network traffic analysis, packet captures, and IDS/IPS monitoring of SMB authentication flows.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a293d0ce5d31bb3.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/impacket-smb_server_challenge_2.png)

The smbserver.py script includes a `setSMBChallenge()` method for customization, but most operators use default configurations. Setting an empty string through this method still results in the hardcoded value being used.

### ROADtools: Device Authentication Domain

ROADtools is a framework for Azure AD security research and testing. The `DeviceAuthentication` class handles device registration and Primary Refresh Token (PRT) operations for Azure AD environments.

During device registration, the code hardcodes a target domain:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/72e03fe72d2d9767.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/roadtool_domain.png)

This domain appears in Azure enrollment logs, cloud audit trails, and device management systems, linking operations across organizations. The static domain becomes a persistent identifier that connects ROADtools usage across different engagements and target environments.

### AADInternals: Device Attributes

AADInternals is a PowerShell module for Azure Active Directory and Office 365 security testing. This code handles Intune MDM device enrollment and callback functionality.

The `Start-DeviceIntuneCallback` function simulates device communication with Microsoft Intune, sending device status and configuration information.

Within the device settings, a fixed phone number appears:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/02a9fee2bfb54d45.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/aadinternals-phonenum.png)

This value persists in Intune/MDM logs, device registration events, and SyncML communication records, creating a consistent tracking identifier.

### Huan: PE Section Naming

Huan is a PE file packer that encrypts executables and stores them in new PE sections. The tool provides file protection capabilities for avoiding static analysis.

The packer creates PE sections with a static name:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/39a28c4fad8977b1.png)](https://blacksnufkin.github.io/assets/posts/2025-09-09-OPSEC-OFFENSIVE-CODE-REVIEW/huan-section.png)

All processed executables contain this section name, making them identifiable through standard PE analysis tools and automated malware scanning systems.

* * *

## Source Review Methodology

### Configuration Analysis

Identify all user-configurable parameters. Trace their usage to confirm they override hardcoded values in output artifacts. Many tools accept configuration changes but still embed static values in specific contexts.

### Output Mapping

Document every external artifact generated by the tool: files, registry entries, network traffic, log messages, and process names. Verify that identifiable content can be customized or randomized.

### Template Review

Examine code that builds structured output (XML, JSON, binary formats). Look for hardcoded field values that should vary based on target environment or operational requirements.

### Network Protocol Implementation

Check protocol handlers for static identifiers in headers, user agents, pipe names, service descriptions, and other transmitted metadata.

### Error and Debug Content

Review error messages, debug output, and status information for embedded tool names, version strings, or developer identifiers that could appear in logs.

* * *

## Current and Historical Detection Signatures

Active and historical tool identifiers:

-   **Rubeus** (historical): `User32LogonProcesss` in Windows authentication logs
    
-   **NetExec**: `https://rickroll` in search connector file content
    
-   **Mimikatz** (historical): `<3 eo.oe ~ ANSSI E>` in Kerberos ticket domains
    
-   **Impacket**: `\RemCom_communicaton` in named pipe creation events
    
-   **ROADtools**: `iminyour.cloud` in Azure device enrollment logs
    
-   **AADInternals**: `"1234567890"` in device management records
    
-   **Huan**: `.huan` in PE section headers
    

These signatures enable both real-time detection and historical analysis of tool usage patterns. While some issues have been resolved, the detection patterns demonstrate how hardcoded values become lasting operational signatures.

* * *

## Bonus: When the Hunters Become the Hunted

While searching GitHub for `cve-2025-44228` PoCs, I encountered several malicious repositories targeting security researchers through weaponized project files. These attacks exploit the fact that researchers routinely download and examine untrusted code.

The variant I observed used malicious `.vbproj` files with MSBuild PreBuildEvents that execute automatically when projects load in Visual Studio.

**The kill chain:**

1.  Researcher downloads the “PoC”
    
2.  Opens the Visual Studio project
    
3.  MSBuild executes the PreBuildEvent automatically
    
4.  VBS script drops and runs AES-encrypted PowerShell
    

**What to inspect in source:**

-   Project files (`*.csproj`, `*.vbproj`, `.sln`) for hidden build steps
    
-   Build scripts with encoded download URLs or payload staging logic
    
-   Auto-execution mechanisms triggered by IDE operations
    

**Safe workflow:**

-   Open project files as text first; neutralize auto steps before building
    
-   Use disposable VMs; snapshot before opening solutions
    

This technique has multiple variants ([documented example](https://checkmarx.com/blog/new-technique-to-trick-developers-detected-in-an-open-source-supply-chain-attack/)), demonstrating the importance of source review even for security tools and research materials.
