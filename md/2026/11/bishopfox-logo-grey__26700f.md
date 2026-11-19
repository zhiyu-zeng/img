---
title: bishopfox-logo-grey
source: https://bishopfox.com/blog/proofpoint-itm-4-4-3-148-5-0-1
source_host: bishopfox.com
clip_date: 2026-11-19T13:30:13+08:00
trace_id: 018c78dd-c75c-4436-b8bb-03df3521482d
content_hash: b93d91b8015ddfbbac8e87e1d501330f6234a940bd50f48f5e0de735ae3b5045
status: synced
tags: []
series: null
feed_source: Bishop Fox
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-81f2-b1af-c626afd2067d
ioc:
  cves: []
  cwes:
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

The following document describes a vulnerability identified by Bishop Fox staff in Proofpoint ITM (formerly ObserveIT) macOS agent 4.4.3.148–5.0.1. The vulnerability was discovered during a security assessment for a Bishop Fox client.

**Product Vendor**

Proofpoint, Inc.

**Product Description**

Proofpoint ITM macOS agent is a SaaS-delivered insider threat management agent that monitors endpoint file, application, and data activity to detect and investigate risky user behavior. The product’s official website is [https://www.proofpoint.com/us/products/information-protection/insider-threat-management](https://www.proofpoint.com/us/products/information-protection/insider-threat-management). Proofpoint does not publish a single public “latest version” number or changelog for the ITM agent; the versions confirmed affected by this issue range from 4.4.3.148 to 5.0.1.

**Affected Version** **s**

Version 4.4.3.148–5.0.1

**Summary of Findings**

Bishop Fox staff identified one vulnerability in Proofpoint ITM macOS agent 4.4.3.148–5.0.1. The issue allowed Bishop Fox staff to perform a local privilege escalation caused by OS command injection in the File Activity Monitor (FAM) service, which allowed any standard, unprivileged user to execute arbitrary commands as root simply by creating a file with a crafted name in a OneDrive-managed directory. Because the agent runs as root on every managed device, this access could serve as an initial foothold for further compromise of the affected host.

**Recommended Solution or Mitigation**

Update to a version of Proofpoint ITM that remediates this issue, once Proofpoint releases one.

In the interim, configure the FAM LaunchDaemon to use the least privilege necessary rather than as the root account wherever the design permits, to reduce the impact of any residual injection. If mitigation is not possible, disable the File Activity Monitor (FAM) component of Proofpoint ITM until Proofpoint issues a remediated version. Note that this removes file-activity-based insider-threat detection coverage for the affected endpoint.

**Timeline**

-   07/13/2026: Initial discovery
-   07/21/2026: Contact with vendor
-   07/21/2026: Vendor acknowledged vulnerabilities
-   11/11/2026: Vulnerabilities publicly disclosed

**Credits**

-   [Zachary Harding](https://bishopfox.com/authors/zachary-harding), Senior Security Consultant, Bishop Fox

## Proofpoint ITM 4.4.3.148–5.0.1 Vulnerabilities

Bishop Fox staff identified the following vulnerability in Proofpoint ITM:

### Arbitrary Command Injection

**Security Risk:** High

### Definition

Arbitrary command injection occurs when untrusted input is used directly in the construction of operating system commands without proper sanitization or validation. This enables an attacker to execute unintended system-level commands within the host environment, often with the privileges of the underlying application or web server. Such attacks can lead to full system compromise, data exfiltration, privilege escalation, or lateral movement within a network.

### Public Identifier(s)

Pending — Proofpoint is its own CVE Numbering Authority (CNA); no CVE or PFPT-SA identifier had been assigned.

### Details

Bishop Fox staff discovered a command injection vulnerability in the Proofpoint ITM macOS agent that allowed any standard user to execute arbitrary commands as the root administrative account. This could allow attackers with non-privileged access to a device managed by Proofpoint ITM to obtain administrator-level access to the device, potentially allowing them to collect information such as credentials from other users of the same device. Bishop Fox staff confirmed that the Proofpoint ITM Windows agent, which used.NET Core with structured IPC, was not vulnerable to this issue.

The vulnerability existed in the `/etc/omonitor/service` binary, which had a File Activity Monitor (FAM) LaunchDaemon that affected versions of Proofpoint ITM for macOS configured to run as the root administrative account. The FAM service monitored filesystem events and, when processing file operations in OneDrive Known Folder Move (KFM) directories, constructed shell commands by interpolating user-controlled file paths into /bin/bash -c invocations without sanitizing shell escape characters.

Bishop Fox staff performed static analysis of the `/etc/omonitor/service` ARM64 Mach-O binary using binary analysis frameworks such as radare2. The vulnerable method was `FSEListener.sendToLoggerWithUid:srcFile:trgfile:fileopr:browser:processid:StorageType:` at address `0x10000eef8`. This method used the `NSString stringWithFormat`: method to construct a shell command string with the following format specifier, as shown below:

```
%s %d %s %@ %d "%@" "%@" %@ "%@" %d "%@"
```

**Figure** **1** **–** Format string inputs

The %@ placeholders received user-controlled values including `srcFile` and `trgfile`, which were file paths derived from filesystem event notifications. These paths were placed inside double quotes within the formatted string. The resulting string was then passed as the argument to an NSTask object, configured with the fixed launch path `/bin/bash` and a command argument (`formattedCmd`) built from user-controlled data, as demonstrated below:

```
[task setLaunchPath:@"/bin/bash"]; 
[task setArguments:@[@"-c", formattedCmd]];
```

**Figure** **2** **–** Vulnerable function taking unsanitized input

Because macOS permitted all characters except forward-slash \[ `/` \] and null \[`\0`\] in filenames and because Bash expanded `$()` command substitution and backtick expressions inside double-quoted strings, a file whose name contained `$(command)` caused command to execute as root when the FAM service processed the filesystem event.

Bishop Fox staff used `fs_usage` kernel tracing to identify the following precise trigger chain:

-   A user created a file in a directory managed by OneDrive KFM. In the environment where Bishop Fox staff discovered this vulnerability, OneDrive KFM was enabled for users’ `~/Documents or ~/Desktop` directories.
-   The macOS `FileProvider` subsystem signaled file creation to registered listeners.
-   The Proofpoint FAM service received the `FileProvider` notification.
-   The FAM service invoked the `sendToLoggerWithUid:srcFile:trgfile:fileopr:browser:processid:StorageType`: function, which constructed the `/bin/bash -c` command with the unsanitized filename.
-   The Bash shell executed the expression inside the `$()` shell metacharacters as the `root` account.

The entire chain from file creation to root command execution completed in approximately one second.

### Additional Attack Paths

Bishop Fox staff's analysis of `NSTask setLaunchPath`: call sites in the binary revealed additional command injection vectors that shared the same /bin/bash string constant at `0x100130470` and the same `NSString` command-construction pattern, as shown below:

|     |     |     |     |
| --- | --- | --- | --- |
| **Method** | **Address** | **Trigger** | **Format String** |
| `sendToLoggerWithUid:srcFile:trgfile:` | `0x10000eef8` | OneDrive KFM file creation | `%s %d %s %@ %d "%@" "%@" %@ "%@" %d "%@"` |
| `OITMIPLabels.initWithFile:` | `0x100012d7c` | Microsoft Information Protection (MIP) label check on Office files | " `%s %@` " (runs /usr/bin/file <path>) |
| `OITMIPLabels.getXMLFromDoc:` | `0x100015ef4` | MIP XML extraction from Office ZIP | " `%s %s -p %@ %s` " (runs /usr/bin/unzip -p <path>) |

e second and third methods were triggered by MIP label processing on Office files (.docx,.xlsx,.pptx). When Proofpoint detected an Office file, `initWithFile`: ran `/usr/bin/file` with the file path to determine the document type, and `getXMLFromDoc` ran `/usr/bin/unzip -p` to extract `docProps/custom.xml` for sensitivity label data. In both cases, the file path was interpolated via `%@ into a /bin/bash -c` command string, enabling the same `$()` injection.

### Affected Locations

**File**

-   `/etc/omonitor/service`

**Total Instances** **1**

### Recommendations

To remediate the command injection vulnerability, Bishop Fox recommends the following actions:

-   Do not construct shell commands via string concatenation of filesystem paths.
-   Replace the /bin/bash -c invocations in the File Activity Monitor (FAM) service with direct process execution that passes arguments as a discrete argument (for example, NSTask with setArguments: containing the path as a single element), so filenames are never interpreted by a shell.
-   Remediate every NSTask setLaunchPath: call site that shares the /bin/bash constant at 0x100130470, including OITMIPLabels.initWithFile: (0x100012d7c) and OITMIPLabels.getXMLFromDoc (0x100015ef4).
-   Configure the FAM LaunchDaemon to use the least privilege necessary rather than as the root account wherever the design permits, to reduce the impact of any residual injection.
-   Audit the Windows and other platform agents for analogous path-to-shell patterns, even though the.NET Core Windows agent was not vulnerable to this specific issue.

### Additional Resources

CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')

[https://cwe.mitre.org/data/definitions/78.html](https://cwe.mitre.org/data/definitions/78.html)

OWASP OS Command Injection Defense Cheat Sheet

[https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html)

Apple Secure Coding Guide

[https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/)

Apple – Designing Daemons and Services

[https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/DesigningDaemons.html](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/DesigningDaemons.html)

![Zachary Harding](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9978e0c530b7fe0a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a10729e6ade629c7.svg)

Subscribe to our blog

Be first to learn about latest tools, advisories, and findings.
