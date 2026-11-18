---
title: "0% GPU utilization: How SANSAR hides Linux cryptomining"
source: https://www.elastic.co/security-labs/threat-command/sansar-linux-cryptomining-malware
source_host: www.elastic.co
clip_date: 2026-11-18T09:58:46+08:00
trace_id: acb0eba0-95f0-4825-98d1-e8ad93dd2624
content_hash: 871ad37468d5da8bc18a0b9713e31035b75b340dc38d4ae20aac98461c039a20
status: synced
tags: []
series: null
feed_source: Elastic Security Labs
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41c75244-d011-8139-b83c-feb8a938612f
ioc:
  cves: []
  cwes: []
  hashes:
    - 00c9ac44291f83c72d54302e99d155a3e26d02225a3e516764d5833a99657c9e
    - 43eb291f56688c63c93e8a93c4591fc997cf6349
    - 675c24728f87f7aa0fa07527027c95c24c246049c65eaef89270ab04ea50a180
    - 6ba1aa275e0e2826e8b48b36473539ca56cbdc41f429e539a45f8532b084d7a4
    - 96fc528ca5e7d1c2b3add5e31b8797cb126f704976c8fbeaecdbf0aa4309ad46
    - acc706afc9322a3eae1ef49049749e0a7c9f1a123895ac56dc8a289beb2fb5b7
    - cc1ad7f14777a098ccc91fd4e8f6143da14418c2b6fdf23b7f8f6b3d1b0b7f1d
    - df8ab6fd699e6ae90e63e9696bae8f01342708bafc2ed88af414337e4f237194
  domains: []
  tools: []
  techniques: []
---

Elastic Security Labs is tracking REF3364, a Linux cryptomining intrusion that combines custom malware with publicly available miners. The toolkit includes **SANSAR**, a Rust orchestrator that receives commands over Tor (The Onion Router) used to manage CPU and GPU miners.

The threat actor also deployed a kernel rootkit to hide selected processes and files, an NVIDIA Management Library (NVML) wrapper to falsify GPU readings, and a separate backdoor named `netns`. This backdoor retrieves its C2 address from an Ethereum smart contract before connecting to the server directly.

The use of public blockchains to locate C2 infrastructure is a pattern we also discussed in our 2026 [Threat Command quarterly report](https://www.elastic.co/resources/security/report/threat-command-cybersecurity-report).

## Key takeaways

-   The actor abused an exposed Ray job agent, obtaining root and deploying the toolkit across three Linux GPU hosts.
    
-   SANSAR uses Tor for C2 and supervises CPU and GPU miners.
    
-   SANSAR’s command handlers support miner configuration and interactive shells.
    
-   The NVIDIA Management Library (NVML) wrapper falsifies GPU readings, while the kernel rootkit hides selected processes, files and socket entries.
    

## Initial access: an exposed Ray job agent

The attacker compromised the first host through an exposed [Ray](https://docs.ray.io/en/latest/ray-overview/index.html) job agent. Ray is an open-source framework for distributing Python workloads, including AI model training and inference, across multiple machines. Its [Jobs API](https://docs.ray.io/en/latest/cluster/running-applications/job-submission/index.html) lets users submit commands to run applications on the cluster.

On that host, the dashboard on Ray's head node listened only on the local loopback interface. The job agent remained reachable from the internet and accepted job submissions without authentication. The attacker used this interface to execute commands through Ray.

Between October 22 and 25, 2026, the recorded activity progressed from external probing to persistent access:

1.  October 22, 2026: external probes first appeared in the Ray logs.
    
2.  October 24, 2026: a submitted job ran the NVIDIA System Management Interface (`nvidia-smi`) and sent the GPU inventory to an external server.
    
3.  October 25, 2026: the actor submitted a Python reverse-shell job that connected to an external listener.
    

The reverse shell ran under the local account that owned the Ray session. The actor subsequently added an SSH key to that account’s `authorized_keys` file to establish persistent access.

## Inside the SANSAR Linux cryptomining toolkit

### Toolkit deployment

After obtaining root, the actor staged the toolkit under `/opt/vadi_`, built the `acpi_thermal_mgr` kernel module through Dynamic Kernel Module Support (DKMS) and added an [initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html#what-is-initramfs) loader. An [initramfs](https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html#what-is-initramfs) is a temporary root filesystem loaded into RAM during early boot, before Linux switches to its normal root filesystem. The module and loader are stored in the boot image on disk, so the rootkit can load again when the host boots with that image.

The installation also replaced the NVML library and registered the separate `netns` backdoor as a `systemd` service.

The GPU miner arrived later on two hosts. A kernel log records `/opt/vadi_/tilki` starting on one machine; cache creation and new GPU contexts support execution on the other system.

The following is a table identifying the files deployed on the machines:

**File**

**Identification**

**Role**

`sansar`

Rust client, version `0.1.3`

Tor C2, host inventory, miner supervision, shell and traffic tasks, NVML-hook maintenance

`kurt`

XMRig `6.25.0`

Miner selected by SANSAR's CPU branch; consumes external pool configuration

`tilki`

SRBMiner-MULTI `3.6.9`

Miner selected by SANSAR's GPU branch

`lyrebird`

Lyrebird `0.8.1` build metadata

Tor pluggable-transport helper, including obfs4 and WebTunnel

`nvml-hook/libnvidia-ml.so.1`

Modified NVML wrapper

Filters process information and changes GPU telemetry returned to callers

`acpi_thermal_mgr.ko`

Linux ftrace rootkit

Process, directory and socket-list concealment; configurable watchdog

`netns`

Ethereum-assisted backdoor

Retrieves a controller IPv4 address and handles reverse-shell requests over TCP

The collected `tilki` has the same SHA-256 hash as the executable in the [official SRBMiner-MULTI 3.6.9 Linux release](https://github.com/doktor83/SRBMiner-Multi/releases/tag/3.6.9).

The diagram below shows the toolkit’s components, SANSAR’s Tor control channel and the separate `netns` backdoor’s use of Ethereum to retrieve its C2 address:

![SANSAR Linux cryptomining toolkit diagram: Tor C2, lyrebird bridges, miners, kernel rootkit and netns Ethereum C2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de6f5444aabd2577.png)

### SANSAR analysis: anti-debugging and the encoded onion C2 domain

The name SANSAR comes from its filename and the `sansar-client v0.1.3` version string.

Before setting up the connection, SANSAR performs an anti-debugging check by reading `/proc/self/status` and exits if `TracerPid` is nonzero. It also records the time for a 1,000-iteration loop and exits if it takes 501 milliseconds or longer.

The controller hostname is stored as 62 encoded bytes. We reproduced the decoder offline: each byte is rotated right by `(i % 7) + 1`, then XORed with a byte from a repeating 32-byte mask.

plaintext\[i\] = ROR8(ciphertext\[i\], (i % 7) + 1) XOR mask\[i % 32\]

Which results to the following domain with a hardcoded port value of `9051`:

efxisnqldelyr5ra25oqfrsut54b34g26e7zrsiuupsoekjof2gho2id.onion:9051 ![IDA Pro view of SANSAR Linux cryptomining malware decoding its embedded .onion C2 domain in memory](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9959fc03cc6a6ec6.png)

SANSAR uses this onion service for C2 communication, receiving commands, reporting host inventory and obtaining the miner’s status.

#### Tor client initialization

SANSAR uses [Arti](https://arti.torproject.org/integrating-arti/), the Tor Project's Rust implementation of Tor, as a library for its C2 connection. It resolves its supporting paths relative to the executable directory. These include:

-   `arti_data/state`
    
-   `arti_data/cache`
    
-   `bridges`
    
-   `.client_id`
    
-   `lyrebird`
    

The `bridges` file lists alternative entry points into Tor. [Bridges](https://support.torproject.org/tor-browser/circumvention/unblocking-tor/#what-are-bridges) are relays whose addresses are not listed in the public relay directory and can help clients reach Tor when direct connections are blocked. The collected file contains seven WebTunnel entries and three obfs4 entries.

![SANSAR bridges file listing WebTunnel and obfs4 Tor bridge entries used for bridge-mode C2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b73e38ce42ff6a32.png)

Sansar supports two Tor connection modes. Direct mode connects through Arti without Lyrebird. Bridge mode uses Lyrebird to reach Tor through the configured WebTunnel or obfs4 bridges. Both modes connect to the same onion C2. Their initial bootstrap deadlines are 60 and 900 seconds, respectively.

#### Host and GPU enumeration

SANSAR collects GPU information with the following command:

nvidia-smi --query-gpu=name --format=csv,noheader

SANSAR uses the startup result to decide whether a GPU miner can be launched. It repeats the query during registration and sends both GPU inventories to the C2, together with the logical CPU count.

**Collection**

**Source**

**Value sent**

Client identity

`.client_id` and compiled version

Client ID and `0.1.3`

Hostname

`/etc/hostname`

Trimmed hostname; `unknown` on failure

Startup GPU inventory

`nvidia-smi` output

Optional GPU description and device count

Current inventory

`nvidia-smi` and `/proc/cpuinfo`

GPU-query success, optional GPU description and logical CPU count

Public IP

IP-discovery HTTP response

Validated address; `unknown` if all attempts fail

Periodic host status

`/proc/uptime`, `who`, `/proc/loadavg`

Optional uptime, count of nonempty session lines and three load averages

To establish the host’s public IP, SANSAR queries four external services in order, with a five-second deadline per attempt, stopping at the first valid response:

1.  `api.ipify.org`
    
2.  `ifconfig.me/ip`
    
3.  `icanhazip.com`
    
4.  `checkip.amazonaws.com`
    

#### Registration, HMAC authentication and heartbeats

SANSAR sends a 40-byte authentication field during registration: a timestamp followed by an HMAC-SHA256 digest. It calculates the digest from the client ID followed by the timestamp, using a key embedded in the binary. Host inventory is not included in the calculation.

timestamp = BE64(unix_seconds) authentication = timestamp || HMAC-SHA256(K, client_id_bytes || timestamp)

Heartbeats report how long SANSAR has been running, its Tor connection mode (`direct` or `bridge`) and the number of successful reconnects. They can also report how many bridges were tested, how many were healthy and when the last test ran.

#### SANSAR’s binary C2 message protocol over Tor

SANSAR exchanges binary messages over its Tor connection. Each frame starts with a four-byte big-endian body length, followed by a four-byte little-endian message type and the payload for that type. The length covers the type and payload, excluding the length field itself.

typedef struct { uint8_t body_length\[4\]; uint8_t message_type_id\[4\]; uint8_t payload\[\]; } sansar_c2_comm_frame;

An illustrative `ShellData` frame carrying whoami followed by a newline would contain:

**Field**

**Size**

**Value**

Body length

4 bytes

27

Message type

4 bytes

6 (ShellData)

Shell session ID

8 bytes

Identifies the existing shell

Data length

8 bytes

7

Data

7 bytes

`whoami\n`

#### The 16 C2 command types SANSAR handles

SANSAR handles 16 incoming message types covering registration, connection management, interactive shells, traffic generation and miner control.

**ID**

**Message**

**Description**

0

`RegisterAck`

Confirms registration and supplies the session ID and heartbeat interval.

1

`HeartbeatAck`

Acknowledges a client's heartbeat.

2

`Command`

Returns the client version, acknowledges a restart request or rejects a custom command.

3

`Disconnect`

Requests closure of the current C2 session and supplies a reason.

4

`BridgeUpdate`

Updates the Tor bridge list used for bridge-mode connections.

5

`ShellOpen`

Opens an interactive Bash session in a pseudo-terminal.

6

`ShellData`

Writes controller-supplied input to an existing shell session.

7

`ShellResize`

Changes the terminal dimensions of a shell session.

8

`ShellClose`

Closes a selected shell session.

9

`StressStart`

Starts a raw IPv4 TCP SYN traffic task against a specified address and port.

10

`StressStop`

Stops a selected traffic task; task ID 0 stops all traffic tasks.

11

`MinerStart`

Starts a CPU or GPU miner using the supplied mining configuration.

12

`MinerStop`

Stops a selected miner; \* selects all managed miners.

13

`MinerConfigUpdate`

Updates an existing miner's configuration, retaining fields omitted from the update.

14

`MinerOutputStart`

Enables forwarding of a miner's console output to the C2.

15

`MinerOutputStop`

Disables console-output forwarding without stopping the miner or its statistics collection.

![Disassembly showing the call to sansar\_poll\_client\_command\_dispatch, SANSAR’s C2 command handler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/20a9006672b91c12.png)

##### General command handlers

`ReportVersion` returns `sansar-client v0.1.3`. The `Restart` handler replies with success and `Restart initiated`, then returns to message processing without restarting SANSAR. `Custom` returns an unknown-command error without executing the supplied command or arguments.

##### Interactive shells in a pseudo-terminal

`ShellOpen` starts `/bin/bash --norc --noprofile` in a pseudo-terminal. It sets `HISTFILE=/dev/null` and zeroes the history-size variables to suppress saved shell history. A session ID links subsequent input, resize and close requests to the correct terminal. SANSAR forwards the terminal's output to the C2.

##### CPU and GPU miner management

The C2 sends a `MinerStart` message to SANSAR with the settings for a mining job: the pool address, wallet or pool login, optional algorithm, extra command-line arguments and proxy flag. SANSAR saves this configuration and uses it to build the miner's command line. Its launch paths provide no hardcoded fallback for the pool or wallet/login.

The message also includes a miner ID, which identifies the managed miner in later update, stop and output requests. A separate `miner_type` field selects the executable:

**Value**

**Miner type**

**Internal name**

**Executable**

`0`

GPU

`GpuWildrig`

`tilki` (SRBMiner-MULTI)

`1`

CPU

`CpuXmrig`

`kurt` (XMRig)

The C2 can later send SANSAR a `MinerConfigUpdate` message with the miner ID and replacement settings. SANSAR changes only the supplied fields.

### How the NVML wrapper fakes GPU utilization

NVML is the user-space management library used by `nvidia-smi`. The collected `libnvidia-ml.so.1` wraps that interface. Its hooks call the genuine NVIDIA library, then change selected results before returning them to the caller. [NVIDIA's NVML header](https://raw.githubusercontent.com/NVIDIA/go-nvml/24abee76fd30561afcf1a65de1687d66f1791c5b/pkg/nvml/nvml.h) defines the interface and its structures.

The recovered `/opt/vadi_/nvml-hook/` directory contains `nvml_hook.c` and a Makefile. SANSAR's maintenance task locates this source directory and can run `make` followed by `make install` to build and install the wrapper. The Makefile uses `ldconfig` to locate the NVIDIA library directory and replaces its `libnvidia-ml.so.1` with the wrapper. It leaves the genuine versioned library in place for backend calls and creates `/usr/lib/.libnvidia-ml.so.1.backup` if no backup exists.

The wrapper hooks NVML calls used by monitoring tools such as `nvidia-smi`. It forwards queries to the genuine NVIDIA library, then alters selected results: GPU utilization is reported as 0%, while temperature and power are replaced with random readings of 36 to 46 degrees Celsius and 100 to 200 watts.

![NVML wrapper source code: hooks return 0% GPU utilization with random temperature and power values](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c75312ec03878a94.png)

### How the acpi_thermal_mgr rootkit conceals cryptomining activity on Linux

`acpi_thermal_mgr.ko` uses [Function Tracer (ftrace)](https://docs.kernel.org/trace/ftrace.html) to intercept system calls such as `getdents64` for directory listings, `openat` for file access and `kill` for signals, along with the kernel routines that produce TCP and UDP socket listings. Its handlers remove matching entries or reject requests involving hidden processes and files.

The collected files included the module's C source, `acpi_thermal_mgr.c`, under `/usr/src/acpi_thermal_mgr-1.0/`. The source also contains Turkish comments, including `Tüm gizli isimleri kontrol et` ("Check all hidden names").

Its module’s parameters control process and file concealment, module self-hiding and the executable paths used by its watchdog.

`kurt` and `lyrebird` are compiled into the module as default process names. The remaining process names, filename prefix and client paths start empty, and module self-hiding is disabled by default. These defaults can be overridden through [module parameters](https://devarea.com/linux-kernel-development-kernel-module-parameters/) supplied when the module is loaded.

![acpi\_thermal\_mgr rootkit source: module parameters with kurt and lyrebird as default hidden process names](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f5971be13fba0aae.png)

#### How the rootkit filters processes and files

The module hides processes whose names match its configuration. It also hides their worker threads, even when those threads use different names.

The `getdents` and `getdents64` hooks rewrite directory records returned by the original syscall. When a program lists `/proc`, they omit entries for hidden PIDs. In `hook_getdents64`, a matching first record is removed from the buffer; later matches are skipped by extending the preceding record:

offset = 0; prev = NULL; while (offset < ret) { cur = (void \*)kdirent + offset; if (should_hide_dirent(cur->d_name, strlen(cur->d_name))) { if (!prev) { ret -= cur->d_reclen; memmove(cur, (void \*)cur + cur->d_reclen, ret - offset); continue; } prev->d_reclen += cur->d_reclen; } else { prev = cur; } offset += cur->d_reclen; } copy_to_user(udirent, kdirent, ret);

Other hooks block direct inspection. `open` and `openat` return `ENOENT` ("No such file or directory") for hidden `/proc/<pid>` paths. Selected metadata and link queries apply the same path check, while PID queries such as `sched_getaffinity` return `ESRCH` ("No such process").

When `hide_prefix` is set, the directory hooks also omit file and directory names that begin with that prefix. The `open` and `openat` hooks reject paths whose final component matches it. The checks in `hook_openat` are:

fn\[PATH_MAX - 1\] = '\\0'; if (is_proc_path_hidden(fn)) { kfree(fn); return -ENOENT; } bn = strrchr(fn, '/'); bn = bn? bn + 1: fn; if (is_file_hidden(bn, strlen(bn))) { kfree(fn); return -ENOENT; } kfree(fn); return orig_openat(regs);

The `kill` hook also normally returns `ESRCH` for hidden PIDs. It forwards the request to the original syscall when the caller's name matches `hide_name`, allowing the configured manager to signal hidden processes:

if (is_pid_hidden(pid)) { /\* Sansar (ana süreç) kendi çocuk süreçlerini yönetebilmeli. \* Çağıran sürecin comm'u hide_name (sansar) ise kill'e izin ver. \*/ get_task_comm(caller_comm, current); if (hide_name\[0\] && strncmp(caller_comm, hide_name, TASK_COMM_LEN) == 0) return orig_kill(regs); return -ESRCH; } return orig_kill(regs);

If `hide_module` is enabled at load time, initialization removes the module's entry from the kernel module list and its sysfs object.

### Netns: the backdoor that resolves its C2 from Ethereum

To locate its controller, `netns` sends `eth_call` requests over HTTPS through public Ethereum RPC services to the embedded contract `0x43eb291f56688c63c93e8a93c4591fc997cf6349`, using selector `0x6ded96e7`. The response is expected to contain an encoded IPv4 address. `netns` decodes it and attempts a plain TCP connection to that address on port `8080`.

![netns backdoor pseudocode: eth\_call request to the Ethereum contract that returns its C2 IPv4 address](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/606d08aad033a6ea.png)

Once `netns` connects to the controller on port 8080, the controller can send a text command in the form `SHELL <host> <port>`. netns parses the destination, forks a child process and starts `Bash`, which opens a separate outbound connection to the supplied host and port. That destination can differ from the controller address retrieved from Ethereum. The command loop has no application authentication or integrity check.

![netns backdoor pseudocode: parsing the SHELL command and forking Bash to the supplied host and port](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4fdc23105e8b053e.png)

## Conclusion: What this means for GPU and AI infrastructure

SANSAR manages CPU and GPU miners over Tor. The kernel rootkit hides selected processes and socket entries, while the NVML wrapper falsifies GPU readings.

The separate `netns` backdoor provides shell access and retrieves its controller address from Ethereum. We documented similar blockchain-based C2 discovery in our 2026 [PHANTOMPULSE research](https://www.elastic.co/security-labs/threat-command/blockchain-c2-phantompulse-rat-sinkhole).

Organizations expanding GPU infrastructure for AI and LLM workloads should check who can submit jobs and whether GPU monitoring libraries have been modified, as cryptojacking can divert compute capacity from legitimate workloads and increase operating costs.

## MITRE ATT&CK

Elastic uses the [MITRE ATT&CK](https://attack.mitre.org/) framework to document common tactics, techniques, and procedures that advanced persistent threats use against enterprise networks.

### Tactics

Tactics represent the why of a technique or sub-technique. It is the adversary’s tactical goal: the reason for performing an action.

-   [Initial Access](https://attack.mitre.org/tactics/TA0001/)
    
-   [Execution](https://attack.mitre.org/tactics/TA0002/)
    
-   [Persistence](https://attack.mitre.org/tactics/TA0003/)
    
-   [Privilege Escalation](https://attack.mitre.org/tactics/TA0004/)
    
-   [Stealth](https://attack.mitre.org/tactics/TA0005/)
    
-   [Defense Impairment](https://attack.mitre.org/tactics/TA0112/)
    
-   [Discovery](https://attack.mitre.org/tactics/TA0007/)
    
-   [Lateral Movement](https://attack.mitre.org/tactics/TA0008/)
    
-   [Command and Control](https://attack.mitre.org/tactics/TA0011/)
    
-   [Impact](https://attack.mitre.org/tactics/TA0040/)
    

### Techniques

Techniques represent how an adversary achieves a tactical goal by performing an action.

-   [Exploit Public-Facing Application (T1190)](https://attack.mitre.org/techniques/T1190/)
    
-   [Command and Scripting Interpreter: Python (T1059.006)](https://attack.mitre.org/techniques/T1059/006/)
    
-   [Command and Scripting Interpreter: Unix Shell (T1059.004)](https://attack.mitre.org/techniques/T1059/004/)
    
-   [Escape to Host (T1611)](https://attack.mitre.org/techniques/T1611/)
    
-   [Create Account: Local Account (T1136.001)](https://attack.mitre.org/techniques/T1136/001/)
    
-   [Account Manipulation: SSH Authorized Keys (T1098.004)](https://attack.mitre.org/techniques/T1098/004/)
    
-   [Create or Modify System Process: Systemd Service (T1543.002)](https://attack.mitre.org/techniques/T1543/002/)
    
-   [Boot or Logon Autostart Execution: Kernel Modules and Extensions (T1547.006)](https://attack.mitre.org/techniques/T1547/006/)
    
-   [Valid Accounts: Local Accounts (T1078.003)](https://attack.mitre.org/techniques/T1078/003/)
    
-   [Remote Services: SSH (T1021.004)](https://attack.mitre.org/techniques/T1021/004/)
    
-   [Rootkit (T1014)](https://attack.mitre.org/techniques/T1014/)
    
-   [Debugger Evasion (T1622)](https://attack.mitre.org/techniques/T1622/)
    
-   [Obfuscated Files or Information (T1027)](https://attack.mitre.org/techniques/T1027/)
    
-   [Deobfuscate/Decode Files or Information (T1140)](https://attack.mitre.org/techniques/T1140/)
    
-   [Disable or Modify Tools: Clear Linux or Mac System Logs (T1685.006)](https://attack.mitre.org/techniques/T1685/006/)
    
-   [Prevent Command History Logging (T1690)](https://attack.mitre.org/techniques/T1690/)
    
-   [System Information Discovery (T1082)](https://attack.mitre.org/techniques/T1082/)
    
-   [System Network Configuration Discovery (T1016)](https://attack.mitre.org/techniques/T1016/)
    
-   [Proxy: Multi-hop Proxy (T1090.003)](https://attack.mitre.org/techniques/T1090/003/)
    
-   [Web Service: Dead Drop Resolver (T1102.001)](https://attack.mitre.org/techniques/T1102/001/)
    
-   [Non-Application Layer Protocol (T1095)](https://attack.mitre.org/techniques/T1095/)
    
-   [Ingress Tool Transfer (T1105)](https://attack.mitre.org/techniques/T1105/)
    
-   [Resource Hijacking: Compute Hijacking (T1496.001)](https://attack.mitre.org/techniques/T1496/001/)
    
-   [Network Denial of Service: Direct Network Flood (T1498.001)](https://attack.mitre.org/techniques/T1498/001/)
    

## Detecting SANSAR Linux cryptomining malware and toolkit

### YARA rules for SANSAR and netns

Elastic Security has created YARA rules to identify this activity. Below are YARA rules to identify the SANSAR and the backdoor netns:

rule Linux_Trojan_Sansar_11eea454 { meta: author = "Elastic Security" os = "Linux" category_type = "Trojan" family = "Sansar" threat_name = "Linux.Trojan.Sansar" strings: $a1 = { 8A 0A 88 4C 24?? 44 8A 5C 24?? 8D 48 01 44 89 DB D2 EB 34 07 89 C1 41 D2 E3 41 08 DB 89 F0 83 E0 1F 46 32 1C 10 44 88 1C 37 48 FF C6 48 FF C2 } condition: all of them } rule Linux_Trojan_Netns_c94a4b17 { meta: author = "Elastic Security" os = "Linux" category_type = "Trojan" family = "Netns" threat_name = "Linux.Trojan.Netns" strings: $a1 = { 66 89 85???????? 48 C7 85???????? 08 07 00 00 48 C7 85???????? 00 00 00 00 48 8D 95???????? 8B 85???????? 41 B8 10 00 00 00 48 89 D1 BA 14 00 00 00 BE 01 00 00 00 89 C7 E8???????? } condition: all of them }

## Observables and indicators

The following observables were discussed in this research.

Observable

Type

Name

Reference

`00c9ac44291f83c72d54302e99d155a3e26d02225a3e516764d5833a99657c9e`

SHA-256

`sansar`

Miner orchestrator

`96fc528ca5e7d1c2b3add5e31b8797cb126f704976c8fbeaecdbf0aa4309ad46`

SHA-256

`kurt`

Xmrig 6.25.0

`acc706afc9322a3eae1ef49049749e0a7c9f1a123895ac56dc8a289beb2fb5b7`

SHA-256

`tilki`

SRBMiner-MULTI

`cc1ad7f14777a098ccc91fd4e8f6143da14418c2b6fdf23b7f8f6b3d1b0b7f1d`

SHA-256

`lyrebird`

Tor Project transport helper 0.8.1

`675c24728f87f7aa0fa07527027c95c24c246049c65eaef89270ab04ea50a180`

SHA-256

`libnvidia-ml.so.1`

wrapper

`6ba1aa275e0e2826e8b48b36473539ca56cbdc41f429e539a45f8532b084d7a4`

SHA-256

`acpi_thermal_mgr.ko`

Kernel module

`df8ab6fd699e6ae90e63e9696bae8f01342708bafc2ed88af414337e4f237194`

SHA-256

`netns`

backdoor
