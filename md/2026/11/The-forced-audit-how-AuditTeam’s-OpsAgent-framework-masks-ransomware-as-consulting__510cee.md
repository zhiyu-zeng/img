---
title: "The forced audit: how AuditTeam’s OpsAgent framework masks ransomware as consulting"
source: https://securelist.com/auditteam-opsagent-forced-audit/122031/
source_host: securelist.com
clip_date: 2026-11-19T09:12:32+08:00
trace_id: 37b1eece-d8c8-46b5-aa70-4f3f300a58e7
content_hash: a13fbf762d90c3f4628462baf94e2d29963b24e6b5108f91b5ef806efdbb5e9d
status: synced
tags: []
series: null
feed_source: Kaspersky Securelist
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41d75244-d011-8166-9b9b-db63828cc566
ioc:
  cves: []
  cwes: []
  hashes:
    - 109cdc24ccd4872a3e4bf6f2d4f3c3d4
    - 5d1425ab3dad1d2de053f69529d227e1
    - 83768e994c6bb72d0b430b98a71ec8d6
    - bd4c327ad208cb722ad25e43ea3f35fc
    - d3e49dceb89a25f5da4ff0c42e996857
    - f0d5752054f6b7af1325ea340c4326d0
    - f4bb8c7e15d8b98d535eb20b09176b3d
  domains: []
  tools: []
  techniques: []
---

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3d04e73067cd38e0.jpg)

AuditTeam is an active threat group that uses the OpsAgent framework to compromise organizations across at least seven countries and territories. The campaign began in January 2026 and remained active through October 2026, at a minimum. In its ransom note, AuditTeam demands an “Audit & Consulting fee” in exchange for vulnerability reports. During this period, the group has infected dozens of organizations in Russia, Italy, the Philippines, Hong Kong, Senegal, Finland and China. The group’s leak site also claims victims in seven additional countries.

OpsAgent provides file system management, process injection, privilege escalation, keylogging, screenshot capture, and network pivoting. During the campaign OpsAgent was transitioned from C++ to Rust while adding new capabilities including interactive shells and WebSocket upgrades. Its command-and-control domains use Amazon CloudFront subdomains, which OpsAgent discovers via a public GitHub repository. Two specialized modules extend its functionality. An antivirus/endpoint detection and response (AV/EDR) killer module installs a digitally signed Beijing Jiangmin Antivirus driver to terminate security products. A cryptor module encrypts files using AES-CBC or ChaCha20 with X25519 key exchange and targets database processes for termination prior to doing so.

## Background

On March 10, 2026, we discovered suspicious activity targeting an organization in Hong Kong. The tool used was OpsAgent, a framework designed to resemble a penetration testing utility. Further investigation revealed attacks in additional countries, prompting an active research phase. This implant offers extensive operator capabilities, including host reconnaissance, shellcode injection via named pipes, and lateral movement through agent networks based on compromised hosts.

Analysis indicates OpsAgent was used by AuditTeam. The group was first mentioned publicly [by dbdigest.com](https://www.dbdigest.com/2026/04/data-leaking-ransomware-report-march-2026.html) in March 2026. On June 25, 2026, [DeXpose](https://www.dexpose.io/auditteam-strikes-russian-software-leader-i-sys/) reported that AuditTeam had claimed responsibility for an attack on a Russian organization and listed it on its leak site. AuditTeam leaves a ransom note threatening to release stolen data unless a fee is paid. They call this fee the “Audit & Consulting fee.” According to the note, payment results in a vulnerability report being delivered to the victim instead of leaking the stolen data archive to the public internet. While the note does not mention file encryption, it is left by the cryptor module. Therefore, if a victim sees the note, their files are already encrypted.

[![The ransom note](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/257cfc8679ffbf3b.png "auditteam-opsagent-forced-audit1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/17152820/auditteam-opsagent-forced-audit1.png)

The ransom note

GitHub commit history shows the campaign started on January 5, 2026. The leak site lists its first victim on February 21, 2026. Dozens of machines across at least seven countries were infected. On August 19, 2026, a C2 domain for the new OpsAgent version was added to the public repository and subsequently used in attacks.

[![AuditTeam timeline activity](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3d4efab27f795b8b.png "auditteam-opsagent-forced-audit2")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/17152845/auditteam-opsagent-forced-audit2.png)

AuditTeam activity timeline

## Technical details

### Loaders

OpsAgent uses multiple loader variants during its campaign. All discovered loaders unpack OpsAgent by parsing the MZ header and transferring execution to the entry point of the unpacked payload.

The C loader was discovered in April 2026. It injects shellcode into `msiexec.exe` using standard API calls: `CreateProcessA`, `VirtualAllocEx`, `WriteProcessMemory`, and `CreateRemoteThread`.

The.NET loader was found in June 2026. It uses `NtQueueApcThread` instead of direct process creation for injection. It contains strings such as `DApc`, `DProtect`, `DResume`, and `msiexec.exe`. Both the C and.NET loaders inject shellcode into a separate target process. They are also protected by OLLVM obfuscation with control-flow flattening enabled.

In September 2026, we discovered the Rust loader. It retrieves an encrypted payload from the C2 server, decrypts it, parses the PE header, and runs the Execute export function within its own process rather than injecting into another process. This in-process execution model eliminates the need for remote process manipulation.

### OpsAgent main implant

The implant (version 5.2.8) rivals Cobalt Strike in functionality. It uses a worker-thread architecture: the main thread monitors connection health, while a worker thread processes commands from a queue. Three concepts structure its behavior:

-   the worker thread (handles nearly all C2 commands)
-   jobs (background tasks run in separate processes)
-   links (connections to child agents used for lateral movement)

Exceptions include `info`, `jobs`, `jobkill`, `worker_status`, `worker_restart`, and `exit`, which execute immediately in the main thread.

OpsAgent can optionally obtain its C2 address by reading a public GitHub repository: *hxxps://github\[.\]com/RonaldCMalcolm1983/staticPage*. The address is stored in an encrypted form using AES‑CBC with the SHA‑256 hash of `f4bb8c7e15d8b98d535eb20b09176b3d` as the key and a zero initialization vector. The encrypted payload is wrapped with the markers `GetConfig` and `EndConfig` and then base64‑encoded.

Several commands — `mimikatz_spawn`, `execute_assembly`, `pth_spawn`, `runpe`, `monitor start`, and `screenshot_service start` — run background jobs in a separate process. To run a job, each creates a process and a named pipe, and receives shellcode from the C2 server. No command contains embedded mimikatz or PTH binaries. All payloads arrive remotely through the pipe, encrypted with XOR using key `604902af7b70b271`. By default these commands use `msiexec.exe` as a host process, but the path can be changed. The exception is the `monitor` command, which uses notepad.exe for shellcode injection. This design keeps the implant small and lets operators deliver custom payloads remotely.

Injection commands support two modes: Legacy and DbgInjector. Legacy mode uses `CreateProcessA` and `NtCreateThreadEx`. DbgInjector creates a process in DEBUG state, allocates shared memory, sets a hardware breakpoint on `FileTimeToSystemTime`, then redirects RIP to the shellcode without creating a new thread.

Several code patterns suggest LLM-assisted development. For example, OpsAgent resolves WinAPI functions dynamically by hash: it calculates the hash of a function name, then searches for the matching address. Sometimes the plaintext name remains in memory before hashing. Additionally, all injection commands share near‑identical code structures, differing only in argument count and target process selection. This uniform approach matches LLM‑generated scaffolding.

#### Commands description

The OpsAgent command set covers file system operations, process management, privilege escalation, shellcode injection, monitoring, and network pivoting. The C2 protocol runs over WebSocket with TLS and exchanges data in units called frames. Protocol frame types function as an extra command set enabling SOCKS proxy establishment, chunked file uploads, and inter-agent data forwarding. These frames are handled by a dedicated frame-handler function rather than the standard command decoder. The following combined table lists all text-based commands and protocol frame types together.

Several commands deserve closer attention. The `monitor` command manages keylogging through subcommands that start, stop, and configure logging threads. Screenshot features follow a similar design with session management subcommands. In contrast, the pivot subsystem uses a flatter command structure where each pivot command (`pivot_list`, `pivot_start`, `pivot_stop`, `pivot_add`, `pivot_remove`, `pivot_auto`) operates independently without nested subcommand hierarchies.

Some frame type numbers such as 0x20 appear unused in the current implementation. These may be traces of previous versions.

| Type | Identifier | Description |
| --- | --- | --- |
| Command | rm  | Removes a directory or a file |
| Command | ps  | Gets a process list |
| Command | drives | Retrieves a list of drives |
| Command | ls  | Lists files in current or specified directory |
| Command | cat | Returns the content of a file |
| Command | cd  | Sets current directory |
| Command | pwd | Gets current directory |
| Command | run | Runs an executable file |
| Command | shell | Runs command in cmd.exe |
| Command | kill | Terminates a specified process |
| Command | info | Gets system information |
| Command | ps_icons | Gets icons from a specified executable |
| Command | download | Fetches a file from an infected machine |
| Command | exec | Runs open in a shell with the specified path |
| Command | exit | Stops OpsAgent running |
| Command | shinject | Injects shellcode into a target process |
| Command | shspawn | Creates a process and injects shellcode |
| Command | mimikatz_spawn | Launches mimikatz via named pipe |
| Command | execute_assembly | Runs.NET shellcode via injected loader |
| Command | pth_spawn | Runs shellcode with pass-the-hash technique |
| Command | runpe | Runs PE file inside another process |
| Command | make_token | Creates token using username and password |
| Command | steal_token | Steals token from another process |
| Command | rev2self | Restores initial privilege of the process |
| Command | getuid | Gets current user |
| Command | getsystem | Attempts to obtain System-level privileges |
| Command | screenshot_sessions | Lists screenshot sessions |
| Command | screenshot_service | Manages screenshot sessions |
| Command | session_helper_status | Shows status of all launched sessions |
| Command | monitor | Manages keylogging threads |
| Command | link | Connects agents via SMB |
| Command | unlink | Disconnects from a child agent |
| Command | links | Lists linked agents |
| Command | connect | Connects agents via HTTP |
| Command | http_connect | Connects agents via TCP |
| Command | pivot_list | Lists pivot sessions |
| Command | pivot_start | Starts pivot session |
| Command | pivot_stop | Stops pivot session |
| Command | pivot_add | Adds task to configuration file |
| Command | pivot_remove | Removes task from configuration file |
| Command | pivot_auto | Sets auto parameter for configuration items |
| Command | re_register | Re-registers with C2 |
| Command | jobs | Lists background jobs |
| Command | jobkill | Terminates a specified job |
| Command | worker_restart | Restarts stuck worker thread |
| Command | worker_status | Returns worker thread status |
| Frame type | 0x00 | Heartbeat |
| Frame type | 0x02 | Acknowledge data |
| Frame type | 0x10 | Process command |
| Frame type | 0x14 | Cancel command |
| Frame type | 0x30 | Start file upload |
| Frame type | 0x31 | Upload file chunk |
| Frame type | 0x32 | End upload |
| Frame type | 0x33 | Cancel upload |
| Frame type | 0x40 | Establish SOCKS connection |
| Frame type | 0x42 | Send data via SOCKS |
| Frame type | 0x43 | Close SOCKS connection |
| Frame type | 0x44 | Control SOCKS connections |
| Frame type | 0x52 | Forward frame to child agent |
| Frame type | 0x54 | Close link connection |

### Additional modules

#### AV/EDR killer module

This module installs a driver disguised as Beijing Jiangmin Antivirus (KV series), utilizing the `\KvCorePortX0` filter port for communication. Upon receiving the `0x1D` command followed by a target filename, the driver terminates the corresponding process. Its target list covers nearly every major security product on the market.

Additionally, the driver carries a valid digital signature, which facilitates its initial execution.

The process kill list contains approximately 220 entries, including:

-   -   Security products: `MsMpEng`, `SecurityHealthService`, `avp`, `ekrn`, `ccSvcHst`, `fcag`, `eadrline`
    -   Remote access tools: `TeamViewer_Desktop`, `TeamViewer_Service`, `tv_w32`, `tv_x64`
    -   Monitoring/logging: `Sysmon`, `Sysmon64`, `splunkd`, `wazuh-agent`
    -   Backup services: `VeeamNFSSvc`, `AcronisAgent`, `MBAMService`
    -   Database processes: `sqlservr`, `mysqld`, `mongod`, `redis-server`

#### Cryptor module

This module encrypts files using either AES-CBC or ChaCha20 based on a command-line flag. Each file receives a unique encryption key produced by `RtlGenRandom`. A 12-byte array serves as the ChaCha20 nonce or expands to a 16-byte AES initialization vector. Key exchange relies on X25519 Diffie-Hellman with a static public key embedded in the binary. The module generates an ephemeral key pair per session and encrypts the file key with ChaCha20 using the shared secret.

Beyond file encryption, the module actively disrupts infrastructure by terminating database processes including SQL Server, Oracle, MySQL, PostgreSQL, MongoDB, and Redis. It also stops backup services such as Veeam. The module removes shadow copies, empties the recycle bin, and wipes temporary folders. Furthermore, any file deletion overwrites content with random data before removing the entry, preventing forensic recovery.

After encryption, the module drops a ransom note. It formats the message as an audit log demanding payment through a Tor onion address. The note offers two options: pay the “Audit & Consulting fee” for a vulnerability report or face public data disclosure.

Finally, the module’s configuration parameters include file extensions to encrypt, directories and files to whitelist, processes and services to terminate, and shadow copy deletion flags.

### OpsAgent-rs (Rust version)

The Rust rewrite maintains functional parity with the C++ version while introducing new capabilities. OpsAgent-rs initially communicates with the C2 via HTTP POST requests to retrieve commands. There are special commands that change this behavior. After receiving an upgrade command, the implant establishes a persistent WebSocket connection over TLS for ongoing C2 communication instead of continuing to send POST requests. Additionally, command identifiers shifted from text names to numeric constants. New commands include interactive shells, directory creation, and sleep-interval changes.

Command mapping between versions shows most legacy commands have Rust equivalents. However, screenshot and monitor commands now consolidate into a unified identifier rather than relying on an extensive set of subcommands. The Rust version removes the entire pivot command set, eliminating pivoting task management functionality.

C2 acquisition in the Rust version changed significantly. The configuration contains a flag controlling whether the implant checks GitHub for new C2 addresses. It also stores markers indicating the beginning and end of the encrypted C2 string. The GitHub README page holds both the legacy C2 format and an additional base64-encoded blob specifically for OpsAgent-rs. The encryption scheme was reworked to use AES-GCM instead of AES-CBC. To derive the GCM key, the decryption flow computes HMAC-SHA256 of the secret key `c2-framework-psk-salt-v1` against the configuration data blob, then applies a second HMAC with the salt `c2-encryption-key\x01`. The nonce is the first 12 bytes of the decrypted payload and the tag occupies the last 16 bytes.

### Infrastructure

The implant uses AWS-generated CloudFront CDN subdomains as C2 endpoints. Because these domains operate on shared infrastructure, their underlying IP addresses cannot serve as reliable standalone IOCs.

| Domain | IP  | Added on GitHub | First seen | ASN |
| --- | --- | --- | --- | --- |
| d19v1tntmz2i98.cloudfront.net | –   | Jan 29, 2026 | Feb 21, 2026 | –   |
| d35htktbyt7nxc.cloudfront.net | –   | Aug 20, 2026 | Sep 6, 2026 | –   |
| –   | 157.20.104.111 | Aug 19, 2026 | Aug 24, 2026 | AS 136557 |

The GitHub repository stayed active throughout the campaign until November 2026. Commit history shows ongoing updates until September 29, 2026, when the actor deleted the legacy C2 domain from the repository. This suggests the actor maintains the infrastructure actively and rotates domains as needed.

In November 2026, the GitHub repository was removed. However, this does not mean the campaign is over, as the latest Rust implants found contained a configuration with the GitHub feature disabled.

## Victims

AuditTeam targets organizations from different countries. We observed victims in China, the Philippines, Senegal, Italy, Finland, Hong Kong and Russia. And according to the group’s leak site, there are victims in Turkey, Thailand, Ukraine, Argentina, South Korea, Japan, and Spain. All identified victims belong to different industries.

## Attribution

We attribute the OpsAgent campaign to AuditTeam with high confidence. The following evidence supports this assessment:

-   Ransom note format and “Audit & Consulting fee” terminology unique to this group
-   Tor-based leak site listing targeted organizations
-   Operational philosophy distinguishing them from conventional ransomware groups through remediation reports

Open sources first identified AuditTeam in March 2026 via [dbdigest.com](https://www.dbdigest.com/2026/04/data-leaking-ransomware-report-march-2026.html). In June, DeXpose [reported](https://www.dexpose.io/auditteam-strikes-russian-software-leader-i-sys/) that AuditTeam claimed responsibility for attacking a Russian organization and listed it on its leak site. The group claims a mission to educate organizations about cybersecurity through exploitation and remediation reports. This tactical approach separates them from traditional ransomware operators.

## Conclusions

AuditTeam frames extortion as a paid security audit — a distinctive model among ransomware groups. The C++ to Rust transition signals continued toolchain investment. New Rust commands cover interactive shells, WebSocket upgrades, and directory management.

The specialized modules reveal thorough operational preparation: the AV/EDR killer uses a signed Jiangmin driver to disable security products, and the cryptor module terminates database processes, encrypts files, and removes shadow copies. These tools let the group neutralize defenses and optionally destroy data.

CloudFront CDN subdomains complicate takedown and make IP-based blocking impractical because the IP space is shared with legitimate traffic. While the actor rotates infrastructure, the public GitHub repository enables C2 discovery and its removal disrupts the attack chain.

Custom malware frameworks are typically developed and maintained by APT groups with dedicated engineering resources. AuditTeam shows that a ransomware crew can build comparable tooling. This shift may be enabled by AI-assisted development tools lowering the barrier to creating functional, multi-module implant architectures.

## Indicators of compromise

### File hashes

Stagers  
[d3e49dceb89a25f5da4ff0c42e996857](https://opentip.kaspersky.com/d3e49dceb89a25f5da4ff0c42e996857/results/?icid=gl_sl_post-opentip_sm-team_7f50e897007a0bbe&utm_source=SL&utm_medium=SL&utm_campaign=SL)  
[bd4c327ad208cb722ad25e43ea3f35fc](https://opentip.kaspersky.com/bd4c327ad208cb722ad25e43ea3f35fc/results/?icid=gl_sl_post-opentip_sm-team_a01a6f923e130bce&utm_source=SL&utm_medium=SL&utm_campaign=SL)  
[5d1425ab3dad1d2de053f69529d227e1](https://opentip.kaspersky.com/5d1425ab3dad1d2de053f69529d227e1/results/?icid=gl_sl_post-opentip_sm-team_9775779758cd2cdc&utm_source=SL&utm_medium=SL&utm_campaign=SL)  
[f0d5752054f6b7af1325ea340c4326d0](https://opentip.kaspersky.com/f0d5752054f6b7af1325ea340c4326d0/results/?icid=gl_sl_post-opentip_sm-team_c75b5df8a4ae96fd&utm_source=SL&utm_medium=SL&utm_campaign=SL)  
[83768e994c6bb72d0b430b98a71ec8d6](https://opentip.kaspersky.com/83768e994c6bb72d0b430b98a71ec8d6/results/?icid=gl_sl_post-opentip_sm-team_76b5a7d590e28079&utm_source=SL&utm_medium=SL&utm_campaign=SL)

Driver  
[109cdc24ccd4872a3e4bf6f2d4f3c3d4](https://opentip.kaspersky.com/109cdc24ccd4872a3e4bf6f2d4f3c3d4/results/?icid=gl_sl_post-opentip_sm-team_ac99e82f081288db&utm_source=SL&utm_medium=SL&utm_campaign=SL) # driver of a legitimate antivirus product

### File paths

C:\\ProgramData\\Microsoft\\Windows\\Caches\\syscache.dat  
C:\\Users\\{username}\\AppData\\Local\\Microsoft\\Windows\\Caches\\syscache.dat  
C:\\Users\\{username}\\AppData\\Local\\Microsoft\\CLR_v4.0\\syscache.dat  
{modulepath}\\syscache.dat  
{TempPath}\\syscache.dat  
C:\\Users\\Public\\kv_dbg.log  
C:\\Windows\\Sysnative\\drivers\\kvcore.sys  
C:\\Windows\\System32\\drivers\\kvcore.sys  
**  
Domains and IPs**  
[d19v1tntmz2i98\[.\]cloudfront\[.\]net](https://opentip.kaspersky.com/d19v1tntmz2i98.cloudfront.net/results/?icid=gl_sl_post-opentip_sm-team_4676db3be021544a&utm_source=SL&utm_medium=SL&utm_campaign=SL)  
[d35htktbyt7nxc\[.\]cloudfront\[.\]net](https://opentip.kaspersky.com/d35htktbyt7nxc.cloudfront.net/results/?icid=gl_sl_post-opentip_sm-team_7fe046fa84980679&utm_source=SL&utm_medium=SL&utm_campaign=SL)  
[157.20.104\[.\]111](https://opentip.kaspersky.com/157.20.104.111/results/?icid=gl_sl_post-opentip_sm-team_95178586c61a5b6a&utm_source=SL&utm_medium=SL&utm_campaign=SL)  
**  
GitHub page with C2**  
[hxxps://github\[.\]com/RonaldCMalcolm1983/staticPage](https://opentip.kaspersky.com/hxxps%3A%2F%2Fgithub.com%2FRonaldCMalcolm1983%2FstaticPage/results/?icid=gl_sl_post-opentip_sm-team_9f1a5f61452ee6f8&utm_source=SL&utm_medium=SL&utm_campaign=SL)
