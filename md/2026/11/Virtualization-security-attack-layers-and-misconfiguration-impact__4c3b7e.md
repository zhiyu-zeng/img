---
title: "Virtualization security: attack layers and misconfiguration impact"
source: https://securelist.com/virtualization-security-esxi-and-proxmox-ransomware-cases/121819/
source_host: securelist.com
clip_date: 2026-11-06T19:39:39+08:00
trace_id: e796e49e-db2d-4846-b55f-8d0d410e3ffe
content_hash: 7d901cc4581e1d1f9227da86eb568f535c2e5a6c2ff59d1b3d4e6998169456db
status: synced
tags: []
series: null
feed_source: Kaspersky Securelist
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41075244-d011-815a-a391-c6862d5751fb
ioc:
  cves:
    - CVE-2024-21626
    - CVE-2025-22224
    - CVE-2026-31431
    - CVE-2026-41567
    - CVE-2026-41568
    - CVE-2026-42306
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73e57108a394d3cb.jpg)

## Introduction

Incidents in virtual environments can begin with a software vulnerability, human error, a configuration weakness, or several of these factors at once. The investigation is rarely limited to the workload. Hypervisors, container runtimes, management consoles, monitoring platforms, identity systems, virtual networks, datastores, backups, and automation accounts all influence what an attacker can reach.

Kaspersky GERT recently investigated two more ransomware cases on ESXi and Proxmox environments in which weak access controls, insufficient network separation, exposed administrative services, and poor management of privileged credentials contributed to the impact. A monitoring system that could reach the virtualization layer also exposed a reusable root credential. Once the attacker controlled that route, ordinary administrative access was enough to affect several hosts. No VM escape was required.

The incidents show why patching and secure configuration must be managed together. A fully patched hypervisor can still be compromised through a shared password, an overprivileged monitoring account, an open SSH path, or an administrator interface reachable from a general server network. [NIST guidance](https://csrc.nist.gov/pubs/sp/800/125/final) places secure configuration baselines, restricted administrative access, current patches, and monitoring across all layers within the same set of sound security practices.

In this article, we’re going to describe both incidents with additional focus on common unsafe practices that were exploited, leading to compromise, as well as remediation tactics. We’ll also discuss the broader scope of threats targeting virtual environments for a better understanding of possible protection strategies.

## The connected system defenders must protect

A business virtual environment is not just Hyper-V, VMware, or Docker but rather a connected stack. Management consoles, orchestration tools, monitoring platforms, and automation accounts sit above hypervisors and container engines. Registries, image stores, virtual switches, datastores, and backup systems connect the layers. Applications and business services run at the bottom, while much of the administrative power sits near the top.

The important boundaries extend beyond guest to host. They include workload to management plane, monitoring system to hypervisor, registry to deployment, administrator workstation to console, management plane to storage, and one virtual network segment to another. An attacker only needs one usable route. The possibility of compromise may lie in one stolen or insecurely placed administrator credential rather than in a complex escape exploit. In the GERT case, the compromise route passed through the monitoring platform and included a valid virtualization platform credential.

## Case #1: From network monitoring to ESXi encryption

The investigation began with evidence of BlackNevas ransomware activity on a Windows system in a virtualized domain controller segment. [UserAssist artifacts](https://securelist.com/userassist-artifact-forensic-value-for-incident-response/116911/) recorded execution of the AnyDesk RMM tool and GMER binaries. The environment also used PRTG Network Monitor to monitor its virtual infrastructure.

[![UserAssist artifacts](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e4e3d125f75f535.png "virtualization1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/11/04181157/virtualization1.png)

UserAssist artifacts

The available evidence showed that the PRTG deployment had broad access to the ESXi hosts and that the same root password was reused across several nodes. After obtaining access to the monitoring environment, the attacker used the ESXi credential to connect over SSH to the hosts that shared the same password. This design joined monitoring, credential storage, and direct administration into one attack path.

PRTG supports storing VMware credentials at the device or inherited group level. That feature is operationally useful, but a monitoring server becomes privileged infrastructure when it holds credentials that can administer the systems it observes. The security question is therefore not whether monitoring needs access, but whether the identity, privileges, storage method, and permitted network path are limited to the monitoring task.

The threat actor gained root access to the ESXi environment and used the `esxcli` command to bypass the system restriction by disabling the `execInstalledOnly` policy to execute the encryption binary and also perform anti-forensic log deletion. Let’s look closely at the timeline of the initial host compromise.

**ESXi (192.168.\*.\*) timeline**

```sql
2025-10-18 Connection attempts from IP address 192.168.*.*.
2025-10-19 During an SSH session by root from IP 192.168.*.*, the file esx is uploaded to the system.
2025-10-19 User "root" attempts to execute the binary esx with the error "Execution of non-installed file prevented".
	chmod 777 esx
	./esx /log
2025-10-19 User "root" deactivates the execInstalledOnly option.
	esxcli system settings advanced set -o 
	/User/execInstalledOnly -i 0
2025-10-19 User "root" executes the malware esx.
2025-10-19 New connection attempts from IP 192.168.*.*.
```

Now, at the same time, the following activities ensued on a different host with the same password for the `root` user:

**ESXi (172.16.\*.\*) timeline**

```bash
2025-10-19 SSH connection by user "root" from IP 172.16.*.*.
2025-10-19 User "root" executes the malware esx and clears the logs.
	chmod a+x esx && chmod 777 esx
	./esx /selftest
	nohup ./esx /p /vmfs/ /depth 5 /log /wipe
	./esx /depth 5 /log /wipe
```

## Case #2: Credential notes impacting the whole Proxmox environment

GERT responded to a ransomware incident by [The Gentlemen](https://securelist.com/the-gentlemen-raas/120447/) group, in which the threat actor gained access to Proxmox using information collected during the dwell time between initial access and visible impact. On a compromised system administrator workstation, the actor discovered administrative credentials and access details stored in notes in plain text. These records provided the information needed to log in to Proxmox using the root account.

The actor then activated the VNC web socket through the compromised root account, gaining extensive control over the Proxmox environment. This access was subsequently used to download and execute ransomware within the cluster, which resulted in the encryption of the entire virtual environment. Below are the log records showing the root account being used to access other hosts via a VNC web socket.

```swift
root@pam [01/08/2026:00:28:36 -0400] "GET /api2/json/nodes/******/vncwebsocket?port=5900&vncticket=****
root@pam [01/08/2026:00:30:17 -0400] "GET /api2/json/nodes/******/vncwebsocket?port=5900&vncticket=****
root@pam [01/08/2026:00:31:19 -0400] "GET /api2/json/nodes/******/vncwebsocket?port=5900&vncticket=****
root@pam [01/08/2026:00:43:38 -0400] "GET /api2/json/nodes/******/vncwebsocket?port=5900&vncticket=****
root@pam [01/08/2026:00:44:49 -0400] "GET /api2/json/nodes/******/vncwebsocket?port=5900&vncticket=****
```

This incident is a clear example of the risks of storing privileged credentials in unsecured notes or other easily accessible files. Once the administrator workstation was compromised, the saved credentials allowed the actor to move from a single endpoint into the virtualization management layer. Because the credentials belonged to a highly privileged root account, one poor credential handling practice significantly increased the scope and impact of the attack. Privileged credentials should instead be stored in an approved password manager or privileged access management system, protected with multifactor authentication and rotated immediately if an administrator workstation is suspected of being compromised.

## Why the misconfiguration caused broad impact

Both cases exhibited unsafe misconfiguration practices whose exploitation led to a bigger impact on the host system. Next, we will break down each misconfiguration to see how it enabled further compromise and what should be done to avoid it.

### Monitoring inherited excessive privilege

In Case 1, the monitoring platform could do more than collect health and performance data. It held or could use credentials with enough privilege to reach ESXi directly. A compromise of the monitoring system therefore became a compromise of the management plane. Monitoring identities should be dedicated to the task and given only the permissions required by the deployed sensors.

### Credential reuse

Password reuse converted one recovered secret into farm-wide access. System administration should use named identities through the central management plane. Each host should have unique credentials and proper password storage hygiene. Password strength alone does not limit the impact of theft, but where the credential can be used and where it is stored do.

### Direct root access bypassed central control

Direct SSH access allowed the actor to authenticate as root, upload a binary, and change a security setting without first passing through vCenter role controls. Broadcom, the parent company of VMware, [recommends](https://knowledge.broadcom.com/external/article?legacyId=1008077) managing vSphere through vCenter, disabling SSH during normal operation, and using Lockdown Mode where suitable. Required service accounts should be explicit exceptions rather than members of a broad administrator group.

### Lack of enhanced security settings

The initial execution attempt was blocked by `execInstalledOnly`, but the attacker had enough privilege to disable this policy. Broadcom documents [enforcement options](https://knowledge.broadcom.com/external/article/373898) that combine `execInstalledOnly` with UEFI Secure Boot and TPM-backed configuration protection. These controls must be enabled, tested, and monitored for change. A setting that can be silently disabled by the same credential used for daily administration provides limited resistance after account compromise.

### Unsafe credential storage

Case 2 demonstrated the possibility of compromise lying in privileged credential exposure. The mitigation strategy involves not only securing the administrative credential storage but also general hardening practices of secret handling, such as privilege management and regular access audits.

## How to close this attack path

In this section, we share remediation advice on how to mitigate such attacks, and detect and prevent them from going further. We recommend the following actions:

-   **Separate monitoring from administration.** Create a dedicated monitoring identity for each platform and restrict it to the smallest set of objects and actions that the monitoring sensors require. Do not use ESXi root or another emergency account for routine polling. Prevent monitoring servers from starting interactive administrator sessions unless a separately approved support workflow requires it. The same principle applies beyond VMware.
-   **Replace stored root passwords.** Locate every copy of hypervisor, management, storage, and backup credentials in monitoring tools, scripts, scheduled tasks, connection managers, and service configurations. Replace static passwords with vault retrieval, brokered identities, or limited API tokens where the platform supports them. Record every retrieval and rotate the secret after emergency use or compromise.
-   **Restrict direct host access.** Route normal ESXi administration through vCenter and enable an appropriate Lockdown Mode after testing monitoring, backup, and recovery dependencies. Keep ESXi Shell and SSH stopped by default. When support work requires SSH, enable it for a defined period, restrict the source, and alert on service activation, root login, and changes to the exception list of users who are allowed to connect via SSH.
-   **Use a specialized security solution.** In our portfolio, [Kaspersky Cloud Workload Security](https://www.kaspersky.com/enterprise-security/cloud-workload-security?icid=gl_sl_post-kcws_sm-team_be17aa3e37b302ee) (KCWS) is perfectly suited to address virtual environment risks, offering a powerful combination of two products: Kaspersky Hybrid Cloud Security (KHCS) and Kaspersky Container Security (KCS). [Kaspersky Hybrid Cloud Security](https://www.kaspersky.com/enterprise-security/cloud-security?icid=gl_sl_post-khcs_sm-team_a76ef74564e35a0a) is specifically built to secure virtualized infrastructures, private data centers, and hybrid clouds. A patented Light Agent architecture minimizes resource impact without compromising performance, while comprehensive infrastructure visualization through a unified console gives administrators complete visibility and control over the entire hybrid network. [Kaspersky Container Security](https://www.kaspersky.com/enterprise-security/container-security?icid=gl_sl_kcs-lnk_sm-team_83bf213ec07f15fd) covers every stage of a containerized app’s lifecycle, from development to operation. Among other capabilities, the solution allows for detecting misconfigurations using a dedicated scanner for images, file systems, and repositories that contain IaC files (such as Terraform, CloudFormation, Azure ARM templates, Helm charts, and Dockerfiles).
-   **Treat configuration changes as security events.** Alert when `execInstalledOnly`, Secure Boot enforcement, Lockdown Mode, SSH, local accounts, exception users, firewall rules, or remote logging settings change. Baseline the expected state and test whether the security team can detect an unauthorized change. A secure configuration set once does not mean that the control remains active on the host.
-   **Isolate the management network.** Place hypervisor, monitoring, backup, storage, and cluster administration on restricted management networks. Permit only the exact source and destination services required. Administrative workstations should enter through hardened jump hosts with named identities and multifactor authentication.
-   **Protect logs, backups, and recovery.** Forward ESXi, vCenter, Proxmox monitoring, identity, and network logs to protected storage that a compromised administrator cannot erase. Backup platforms should use separate identities, restricted management paths, and recovery copies outside ordinary administrative reach.

## Configuration checks for monitored virtualization

Below are recommended checks to run when enabling virtualization monitoring. The safest state depends on the platform and monitoring method, but each control should be tested.

|     |     |     |
| --- | --- | --- |
| **Control area** | **Safer state** | **Verification** |
| Monitoring identity | Dedicated service account or token with only required read and polling rights | Review assigned roles and test every sensor without root or global administrator access |
| Credential storage | No recoverable host root password on a monitoring or general-purpose server | Review tool configurations, scripts, scheduled tasks, and connection stores for embedded credentials, access tokens, or other secrets |
| Network path | Monitoring reaches only required polling services while administration uses a jump host | Test management ports from monitoring server, user segments and untrusted network segments |
| Direct host access | Lockdown Mode where suitable with SSH and ESXi Shell stopped by default | Attempt direct client API and SSH access to host using a routine account |
| Configuration integrity | Secure Boot and execInstalledOnly enforcement enabled where supported and tested | Change a test setting through the approved process and confirm an alert is generated |
| Evidence | Host, management, identity, monitoring, firewall, and PAM logs stored remotely | Generate successful and failed logins and verify source, account, host, time, and action |

## The wider attack surface

Closing the monitoring and credential routes does not secure the environment by itself. Virtualization also relies on isolation boundaries, trusted images, management APIs, virtual networks, storage, and backups. Each layer requires a different control and leaves evidence in a different place.

### VM and container escapes

In a VM escape, code inside a guest reaches past the VM boundary and affects the host or another guest. The weakness may be in a virtual device, an integration feature, a hypercall interface, or another component that translates guest requests for the host. If the escape works, control of one VM may lead to control of the physical server and every workload on it. [VMware CVE-2025-22224](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/25390) showed this risk: an attacker with administrator rights inside a VM could execute code as the VMX process on the host, and Broadcom reported exploitation in the wild.

A container escape can reach a similar result, but the starting point is different. Linux containers share the host kernel, so their isolation model differs from that of a VM. Namespaces limit what processes can see, cgroups control resource use, and capabilities split root privileges into smaller parts. A kernel or runtime bug can break this isolation. [Copy Fail](https://securelist.com/tr/copyfail-root-linux/119634/) (CVE-2026-31431) is a good example of a kernel flaw. Code already running in a container could use a Linux AF_ALG crypto socket to change pages in the shared Linux kernel page cache. Because the host and other containers may read the same cached pages, the effect did not have to stay inside one container. The fix is a kernel update; Docker Engine 29.4.3 also tightened its default security profiles to reduce exposure on hosts that had not yet been patched.

[Unsafe settings](https://securelist.com/container-attack-vectors/120010/) can also break the boundary. Privileged mode, excessive capabilities, writable host mounts, or access to the Docker socket may remove isolation without any software exploit. For instance, runc [CVE-2024-21626](https://github.com/opencontainers/runc/security/advisories/GHSA-xr7r-f8xq-vfvv) involved leaked file descriptors that could expose the host filesystem to a malicious image or container process.

This difference changes the investigation. A VM can often be treated like a separate computer with its own kernel, memory, and disk. A container is a group of host processes placed inside namespaces. If investigators collect only the container filesystem, they may leave the most useful process, socket, and control-plane evidence on the host.

### Images and templates

A compromised golden VM image or container base image can spread through normal automation. Common weaknesses include unofficial public images, mutable tags, overprivileged build tokens, recoverable secrets in older layers, and stale templates that restore vulnerable software or forgotten accounts. Scanning might help, but it does not establish who built the artifact or whether the exact image tested and approved was the one ultimately deployed to production. Use controlled builders, provenance records, signature checks, and planned rebuilds from trusted sources.

### Management tools and APIs

A stolen vCenter identity, exposed Docker API, overpowered Portainer role, or compromised backup console may give an attacker an easier route than an escape exploit. Portainer advisory [GHSA-7fw3-x4r2-g7wc](https://github.com/portainer/portainer/security/advisories/GHSA-7fw3-x4r2-g7wc) showed how a proxy validated one bind-mount representation but missed an equivalent API form, allowing an authenticated non-administrator with container creation privileges to reach host paths. The runtime performed a valid request after authorization had already failed in the management layer.

Administrative file-copy operations also deserve attention. Docker fixed archive and mount-handling flaws in CVE-2026-41567, CVE-2026-41568, and CVE-2026-42306. These cases required particular conditions and operator or API activity. They are a reminder to patch the daemon and record who initiated copy operations, which container was involved, the source and destination paths, and the result.

### Virtual networks, storage, and backups

East-west traffic between virtual workloads may stay inside one host and bypass a physical sensor. Management, migration, storage, and workload traffic should use separate zones with filtering between them. Snapshot and memory files may contain credentials, while weak datastore permissions can expose whole virtual disks. Backup systems need broad access to recover services, which also makes them valuable to an attacker who wants to delete recovery points or reach several hosts.

## Attack surface examples by layer

To sum up, the described attack vectors might be mitigated as follows:

|     |     |     |     |
| --- | --- | --- | --- |
| **Attack surface** | **Initial access** | **Possible impact** | **Primary control** |
| Credentials and configuration | Password recovered from monitoring or an overprivileged account | Direct control of several hypervisor nodes | Unique vaulted credentials, segmented access, and configuration monitoring |
| VM escape | Administrative access or code execution privileges inside a guest plus a hypervisor flaw | Host process or neighboring workload compromise | Patch the hypervisor and reduce risky virtual devices and guest privilege |
| Malicious container affecting kernel or runtime | Code in a container or a malicious image | Host filesystem, kernel, or shared cache impact | Patch kernel and runtime, and remove privileged settings |
| Images and templates | Compromised build input registry or golden image | Repeated deployment of the compromise | Immutable digests, controlled builds, provenance, and verification |
| Management API | Stolen identity exposing endpoint or authorization gap | Fleet-wide administrative actions | MFA, least privilege, network restrictions, and complete API validation |
| Networks, storage, and backups | Flat network or broad datastore and access through backups | Lateral movement, data theft, encryption, and recovery loss | Segmentation, least privilege, protected backups, and traffic monitoring |

## Conclusion

GERT cases that we presented in this article did not require an attacker to break the VM boundary. The attack path was created by an overprivileged monitoring relationship, an insecure password storage approach, a recoverable and reused root credential, broad management-network reachability, and direct SSH administration. Each element was legitimate on its own, but together they allowed one compromise to reach virtualization hosts and their workloads.

Misconfiguration should therefore receive the same operational attention as vulnerability management. Teams need to know where privileged credentials exist, which systems can use them, which network paths make them effective, and which logs will show their use. Escape flaws, unsafe images, API weaknesses, virtual network exposure, and attacks on storage or backups remain serious, but closing the known administrative route should come first.
