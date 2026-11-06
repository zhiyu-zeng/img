---
title: Back Button
source: https://www.rapid7.com/blog/post/pt-metasploit-wrapup-unauth-rce-modules-in-network-perimeter-devices-and-much-more
source_host: www.rapid7.com
clip_date: 2026-11-07T01:52:56+08:00
trace_id: b5223d29-bec9-40fe-98a8-395bd8d4042e
content_hash: 2ab37b54552e70711aa1f850a0b3c90bc69de7ddde8cd07fc687caed0c8efe22
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41075244-d011-81a6-8125-c7240e660cb7
ioc:
  cves:
    - CVE-2024-5450
    - CVE-2025-58434
    - CVE-2026-25856
    - CVE-2026-39908
    - CVE-2026-76443
    - CVE-2026-88771
    - CVE-2026-88773
    - CVE-2026-97229
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Buckle up Metasploit-Framework enthusiasts because we have another action packed release for you. I'm talking, unauthenticated remote code execution modules in some of the biggest names in network perimeter devices like Citrix NetScaler and Cisco Secure Email Gateway. That's not all, we have an authenticated GitLab CI/CD regular expression integer overflow RCE module that was recently making head lines among many other awesome exploit modules. Looking for auxiliary modules? We've got you covered this release with a Flowise authentication bypass and a OpenBullet2 NTLMv2 hash disclosure, because who doesn't love collecting and cracking (or in some cases relaying) NTLM hashes am I right or am I right? In our continued effort to expand the payloads supported by the framework this week we saw fetch payload support for LoongArch. Lastly, if you're ever on an engagement or at home doing some testing and you see something that's not supported in Metasploit-Framework that you'd like to see supported, either drop us suggested-features issue on GitHub or trying throwing up a Pull Request, we'd love to hear from you. Happy hacking everyone!

## New module content (13)

### Flowise Authentication Bypass

Authors: Arthur Gervais, Isaac David, and Richard Howe

Type: Auxiliary

Pull request: [#21757](https://github.com/rapid7/metasploit-framework/pull/21757) contributed by [rmhowe425](https://github.com/rmhowe425)

Path: `admin/http/flowise_auth_bypass_cve_2025_58434`

CVE reference: [CVE-2025-58434](https://www.rapid7.com/db/vulnerabilities/cve-2025-58434/)

Description: Adds a new auxiliary module that exploits CVE-2025-58434, an unauthenticated account takeover in Flowise versions 3.0.5 and earlier. Flowise's password reset API returns a valid reset token directly in its response, so the module can reset the password of any account whose email address is known, with no credentials needed.

### SPIP Password Change IDOR Privilege Escalation

Authors: 0xkidz and Julien Voisin

Type: Auxiliary

Pull request: [#21865](https://github.com/rapid7/metasploit-framework/pull/21865) contributed by [jvoisin](https://github.com/jvoisin)

Path: `admin/http/spip_idor_password_reset`

Description: This adds an auxiliary module which exploits a vulnerability in SPIP before 4.4.23 which allows attackers to change any user's password given a validly-signed POST without checking that the caller is authorized for that id_auteur. This issue was patched in 4.4.23 although no CVE has been assigned at the time of writing.

### HashiCorp Consul Version Scanner

Author: h00die

Type: Auxiliary

Pull request: [#22010](https://github.com/rapid7/metasploit-framework/pull/22010) contributed by [h00die](https://github.com/h00die)

Path: `scanner/http/hashicorp_consul_version`

Description: Adds Hashicorp Consul version scanner.

### OpenBullet2 NTLMv2 Hash Disclosure via UNC Path Proxy Source

Author: Maksim Rogov

Type: Auxiliary

Pull request: [#21541](https://github.com/rapid7/metasploit-framework/pull/21541) contributed by [vognik](https://github.com/vognik)

Path: `scanner/http/openbullet2_unauth_hash_disclosure_cve_2026_39908`

CVE reference: [CVE-2026-39908](https://www.rapid7.com/db/vulnerabilities/cve-2026-39908/)

Description: This adds two new modules targeting unauthenticated vulnerabilities in OpenBullet2. CVE-2026-25856: A Remote Code Execution (RCE) exploit that abuses the plain C# execution mode to run arbitrary.NET APIs and access the file system. CVE-2026-39908: A credential disclosure scanner for Windows that forces the app to reveal the NTLMv2 hash by loading a malicious UNC path. Both vulnerabilities affect OpenBullet2 releases starting from version 0.2.5.

### Citrix NetScaler Unauthenticated Login Log Command Injection (CVE-2026-88771)

Authors: CERT-EU, Scyrix LLC, sfewer-r7, and watchTowr

Type: Exploit

Pull request: [#21962](https://github.com/rapid7/metasploit-framework/pull/21962) contributed by [sfewer-r7](https://github.com/sfewer-r7)

Path: `freebsd/http/citrix_netscaler_cve_2026_88771`

CVE reference: [CVE-2026-88773](https://www.rapid7.com/db/vulnerabilities/cve-2026-88773/)

Description: This adds in an exploit module for the recent Citrix NetScaler unauth RCE via command injection (CVE-2026-88771), that was reported as being exploited in the wild by the vendor prior to public disclosure.

### Portainer Authenticated Docker API Remote Root

Author: Aman Singh Gill (Gill-Singh-A)

Type: Exploit

Pull request: [#21745](https://github.com/rapid7/metasploit-framework/pull/21745) contributed by [Gill-Singh-A](https://github.com/Gill-Singh-A)

Path: `linux/http/portainer_authenticated_docker_rce`

Description: Adds an exploit module that uses valid Portainer credentials and access to a managed Docker environment to create a privileged container, bind-mount the host filesystem, and execute a native Linux or Unix command payload as root on the underlying Docker host. The module optionally pulls the required container image and removes temporary containers after payload execution.

### Linux ELF Executable Payload Injection Persistence

Author: dledda-r7

Type: Exploit

Pull request: [#21839](https://github.com/rapid7/metasploit-framework/pull/21839) contributed by [dledda-r7](https://github.com/dledda-r7)

Path: `linux/persistence/elf`

Description: This adds a new Linux ELF injector persistence module supporting x86, x64, and AArch64 architectures to enable payload injection and persistence. The tool uses code cave and segment injection techniques alongside architecture-specific trampolines to seamlessly preserve original execution flow.

### GitLab CI/CD RegExp Integer Overflow Remote Code Execution

Authors: Jonah Burgess, jheysel-r7, and joaxcar

Type: Exploit

Pull request: [#22017](https://github.com/rapid7/metasploit-framework/pull/22017) contributed by [jheysel-r7](https://github.com/jheysel-r7)

Path: `multi/http/gitlab_cicd_regexp_rce_cve_2026_97229`

CVE reference: [CVE-2026-97229](https://www.rapid7.com/db/vulnerabilities/cve-2026-97229/)

Description: Adds an exploit module for CVE-2026-97229, an integer overflow in GitLab’s CI/CD regular expression compiler that can lead to remote command execution as the git user. The module targets affected official GitLab CE/EE Linux amd64 releases, requires credentials with write access to a public project, and uses the unauthenticated CI lint API for payload delivery. Temporary branches and personal access tokens are automatically removed after exploitation.

### OpenBullet2 Unauthenticated RCE via Config Configuration Interface

Author: Maksim Rogov

Type: Exploit

Pull request: [#21541](https://github.com/rapid7/metasploit-framework/pull/21541) contributed by [vognik](https://github.com/vognik)

Path: `multi/http/openbullet2_unauth_rce_cve_2026_25856`

CVE reference: [CVE-2026-25856](https://www.rapid7.com/db/vulnerabilities/cve-2026-25856/)

Description: This adds two new modules targeting unauthenticated vulnerabilities in OpenBullet2. CVE-2026-25856: A Remote Code Execution (RCE) exploit that abuses the plain C# execution mode to run arbitrary.NET APIs and access the file system. CVE-2026-39908: A credential disclosure scanner for Windows that forces the app to reveal the NTLMv2 hash by loading a malicious UNC path. Both vulnerabilities affect OpenBullet2 releases starting from version 0.2.5.

### Cisco Secure Email Gateway S/MIME SQL Injection RCE

Author: sfewer-r7

Type: Exploit

Pull request: [#22018](https://github.com/rapid7/metasploit-framework/pull/22018) contributed by [sfewer-r7](https://github.com/sfewer-r7)

Path: `unix/smtp/cisco_secure_email_gateway_smime_sqli_rce`

CVE reference: [CVE-2026-76443](https://www.rapid7.com/db/vulnerabilities/cve-2026-76443/)

Description: This module exploits a SQLi for unauthenticated RCE as root against Cisco Secure Email Gateway. The Cisco advisories are vague, however we have reason to believe this maps to CVE-2026-76443.

### WordPress Bug Library Plugin Prior To 2.1.1 Unauthenticated PHP File Upload RCE

Authors: Bob Matyas and TrinityBerserker

Type: Exploit

Pull request: [#21716](https://github.com/rapid7/metasploit-framework/pull/21716) contributed by [TrinityBerserker](https://github.com/TrinityBerserker)

Path: `unix/webapp/wp_bug_library_file_upload`

CVE reference: [CVE-2024-5450](https://www.rapid7.com/db/vulnerabilities/cve-2024-5450/)

Description: Adds a new exploit module for CVE-2024-5450, an unauthenticated arbitrary PHP file upload vulnerability in the WordPress Bug Library plugin before version 2.1.1 that can lead to remote code execution.

### FTP, HTTP, HTTPS, SHELL, SHELL_BIND_TCP, SHELL_REVERSE_TCP and TFTP Fetch, Linux Chmod

Authors: Brendan Watters, Spencer McIntyre, and bcoles [bcoles@gmail.com](mailto:bcoles@gmail.com)

Type: Payload (Adapter)

Pull request: [#21954](https://github.com/rapid7/metasploit-framework/pull/21954) contributed by [bwatters-r7](https://github.com/bwatters-r7)

Description: This PR adds loongarch64 shell payloads and adds the required configs to get them to work with fetch payloads.

This adapter adds the following payloads:

-   `cmd/linux/ftp/loongarch64/chmod`
-   `cmd/linux/ftp/loongarch64/exec`
-   `cmd/linux/ftp/loongarch64/reboot`
-   `cmd/linux/ftp/loongarch64/shell/bind_tcp`
-   `cmd/linux/ftp/loongarch64/shell/reverse_tcp`
-   `cmd/linux/ftp/loongarch64/shell_bind_tcp`
-   `cmd/linux/ftp/loongarch64/shell_reverse_tcp`
-   `cmd/linux/http/loongarch64/chmod`
-   `cmd/linux/http/loongarch64/exec`
-   `cmd/linux/http/loongarch64/reboot`
-   `cmd/linux/http/loongarch64/shell/bind_tcp`
-   `cmd/linux/http/loongarch64/shell/reverse_tcp`
-   `cmd/linux/http/loongarch64/shell_bind_tcp`
-   `cmd/linux/http/loongarch64/shell_reverse_tcp`
-   `cmd/linux/https/loongarch64/chmod`
-   `cmd/linux/https/loongarch64/exec`
-   `cmd/linux/https/loongarch64/reboot`
-   `cmd/linux/https/loongarch64/shell/bind_tcp`
-   `cmd/linux/https/loongarch64/shell/reverse_tcp`
-   `cmd/linux/https/loongarch64/shell_bind_tcp`
-   `cmd/linux/https/loongarch64/shell_reverse_tcp`
-   `cmd/linux/tftp/loongarch64/chmod`
-   `cmd/linux/tftp/loongarch64/exec`
-   `cmd/linux/tftp/loongarch64/reboot`
-   `cmd/linux/tftp/loongarch64/shell/bind_tcp`
-   `cmd/linux/tftp/loongarch64/shell/reverse_tcp`
-   `cmd/linux/tftp/loongarch64/shell_bind_tcp`
-   `cmd/linux/tftp/loongarch64/shell_reverse_tcp`
-   `linux/loongarch64/shell_bind_tcp`
-   `linux/loongarch64/shell_reverse_tcp`
-   `linux/loongarch64/shell/bind_tcp`
-   `linux/loongarch64/shell/reverse_tcp`

### SMB Fetch, Windows AArch64 Command Execution

Authors: Alexander "xaitax" Hagenah, Spencer McIntyre, alanfoster, and vinicius-batistella

Type: Payload (Adapter)

Pull request: [#21914](https://github.com/rapid7/metasploit-framework/pull/21914) contributed by [vinicius-batistella](https://github.com/vinicius-batistella)

Description: Previously, selecting an AARCH64 Windows dll payload ended in what appeared to be success, but the generated payload was x86, not AARCH64. This Added an AARCH64 Windows DLL template and hooks up the payload generation to use it.

This adapter adds the following payloads:

-   `cmd/windows/smb/aarch64/exec`
-   `cmd/windows/smb/aarch64/shell/reverse_tcp`
-   `cmd/windows/smb/aarch64/shell_reverse_tcp`

## Enhancements and features (3)

-   [#21477](https://github.com/rapid7/metasploit-framework/pull/21477) from [M4nu02](https://github.com/M4nu02) - Adds Windows support to the Docker Image Persistence module, enabling Meterpreter sessions on Windows hosts running Docker Desktop to create a persistent Alpine container with access to the host’s C: drive.
-   [#21824](https://github.com/rapid7/metasploit-framework/pull/21824) from [bwatters-r7](https://github.com/bwatters-r7) - This adds rubocop rules to catch when a contributor redeclares a pre-existing option and guides them to simply change that option's default value. It still allows contributors to deregister and then re-register options that are different, but have the same key value.
-   [#22068](https://github.com/rapid7/metasploit-framework/pull/22068) from [cgranleese-r7](https://github.com/cgranleese-r7) - Performs a routine update of multiple docker runtime dependencies.

## Bugs fixed (8)

-   [#21312](https://github.com/rapid7/metasploit-framework/pull/21312) from [msutovsky-r7](https://github.com/msutovsky-r7) - Fixes a bug where a post modules can call the `cleanup` method twice.
-   [#22009](https://github.com/rapid7/metasploit-framework/pull/22009) from [4n33sh](https://github.com/4n33sh) - Fixes duplicate target prefixes in MySQL login scanner.
-   [#22027](https://github.com/rapid7/metasploit-framework/pull/22027) from [kx7m2qd](https://github.com/kx7m2qd) - Replaces the deprecated Rex::Socket::Udp#sendto with send(mesg, flags, host, port) at all 12 call sites in the TFTP library and modules.
-   [#22039](https://github.com/rapid7/metasploit-framework/pull/22039) from [cgranleese-r7](https://github.com/cgranleese-r7) - Improves how remote users are initially created in the remote `msfdb` HTTP service.
-   [#22052](https://github.com/rapid7/metasploit-framework/pull/22052) from [Yeagerist0](https://github.com/Yeagerist0) - Fixes duplicate `peer:port` prefixes in login scanners that include `Msf::Exploit::Remote::Tcp`.
-   [#22058](https://github.com/rapid7/metasploit-framework/pull/22058) from [Yeagerist0](https://github.com/Yeagerist0) - Fixes duplicate `peer:port` prefixes in the Redis login scanner.
-   [#22060](https://github.com/rapid7/metasploit-framework/pull/22060) from [Yeagerist0](https://github.com/Yeagerist0) - Fixes duplicate `peer:port` prefixes in the Telnet login scanner.
-   [#22061](https://github.com/rapid7/metasploit-framework/pull/22061) from [Yeagerist0](https://github.com/Yeagerist0) - Fixes a bug in `varnish_cli_login` consistently crashing with `NoMethodError`.

## Documentation added (1)

-   [#21967](https://github.com/rapid7/metasploit-framework/pull/21967) from [ZainnQureshii](https://github.com/ZainnQureshii) - This fixes 5 module documentation files that listed an incorrect default value for a datastore option. These have all been resolved and now all documentation in the framework lists the correct default value of their corresponding datastore option.

You can always find more documentation on our docsite at [docs.metasploit.com](https://docs.metasploit.com/).

## Get it

As always, you can update to the latest Metasploit Framework with `msfupdate` and you can get more details on the changes since the last blog post from GitHub:

-   [Pull Requests 6.5.8...6.5.9](https://github.com/rapid7/metasploit-framework/pulls?q=is:pr+merged:%222026-10-22T17%3A09%3A29Z..2026-11-05T00%3A11%3A37Z%22)
-   [Full diff 6.5.8...6.5.9](https://github.com/rapid7/metasploit-framework/compare/6.5.8...6.5.9)

If you are a `git` user, you can clone the [Metasploit Framework repo](https://github.com/rapid7/metasploit-framework) (master branch) for the latest. To install fresh without using git, you can use the open-source-only [Nightly Installers](https://github.com/rapid7/metasploit-framework/wiki/Nightly-Installers) or the commercial edition [Metasploit Pro](https://www.rapid7.com/products/metasploit/download/)
