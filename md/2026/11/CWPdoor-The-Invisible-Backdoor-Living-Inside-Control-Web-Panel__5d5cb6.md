---
title: "CWPdoor: The Invisible Backdoor Living Inside Control Web Panel"
source: https://blog.xlab.qianxin.com/cwpdoor-the-invisible-backdoor-living-inside-control-web-panel/
source_host: blog.xlab.qianxin.com
clip_date: 2026-11-05T21:00:07+08:00
trace_id: 43d36de8-09a0-4a67-8e28-334cd73b5879
content_hash: e38783f6e0234a38621803a94d141cdf4ec1732dae88ea53b9273dede3ab26cd
status: synced
tags:
  - Linux安全
  - 恶意样本
series: null
feed_source: 奇安信XLab·僵尸网络逆向
ai_summary: XLab 抓获针对 Control Web Panel 的被动后门 cwpdoor：攻击者替换正版 cwpsrv 二进制，通过特制 HTTP 头远程执行命令，并抑制日志，隐蔽性极强。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 40f75244-d011-81ed-afaf-c5607e0b0e53
ioc:
  cves: []
  cwes: []
  hashes:
    - 965aea67fb40de1bab5169ada993349f
    - d3f4e95113d49ab3991b45e457bda75b
    - e505d4ffa21cf494a5dc2d7c8f4f1236
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> XLab 抓获针对 Control Web Panel 的被动后门 cwpdoor：攻击者替换正版 cwpsrv 二进制，通过特制 HTTP 头远程执行命令，并抑制日志，隐蔽性极强。
> 
> - **植入方式：** 感染脚本 `cwpsrv_update.sh` 伪装版本更新，下载被插入恶意代码并重编译的 cwpsrv（仅支持 1.24.0/1.15.10 两个版本），覆盖 `/usr/local/cwpsrv/bin/cwpsrv`；无论成败都会恢复文件与目录时间戳并执行 `history -d` 清除命令历史，使 `ls`/`stat` 检查失效。
> - **触发协议：** 请求需携带三个头：`X-Ngx-Integrity-Time`（校验 ±300 秒时间窗）、`X-Ngx-Integrity-Data`（AES-256-CBC 加密命令，前 16 字节为 IV，密钥为内嵌 RSA 公钥字符串的 SHA-256）、`X-Ngx-Integrity-Sig`（RSA 签名，公钥经 0x55 XOR 混淆存储），三者绑定实现防重放与授权控制。
> - **执行与回传：** 校验通过后 master 进程解密命令，经 Unix domain socket `ngx_http_integrity_helper` 交给 helper 子进程执行，结果 AES 加密后以 HTTP 200（`application/octet-stream`）回传，同时篡改日志模块上下文指针使请求不入日志。
> - **威胁态势：** 奇安信 Hunter 平台显示近一个月超 34 万个 CWP 实例暴露在互联网上均为潜在目标；2026 年 9 月 30 日巴西上传 VirusTotal 的 `evidencia.tgz` 含 Ebury 后门与 cwpdoor 样本，后者检测率为零，证明已有真实受害者。
> - **排查与处置：** 用 `ss -axp | grep integrity` 查 socket、`ps aux | grep cwpsrv` 查可疑 helper 进程、`strings` 查 `X-Ngx-Integrity` 字符串；确认感染后用 `cwpsrv.prev-*` 备份恢复、升级版本、立即轮换面板凭据并按失陷主机排查。

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/de6f6aeb50e7725f.jpg)

On June 29, 2026, the **XLab's Cyber Threat Insight and Analysis System(CTIA)** captured a suspicious script named `cwpsrv_update.sh`. The script downloads a file named `cwpsrv` from the remote server `136.0.141.71` and replaces the file of the same name on the system. Our analysis confirmed that the downloaded `cwpsrv` is a passive backdoor that can be triggered by specific headers in HTTP/HTTPS traffic to remotely execute commands specified by the attacker. Since it targets Control Web Panel, we named it **cwpdoor**.

cwpdoor is not standalone malware. Instead, it is embedded in cwpsrv— **the attacker inserts malicious code into the cwpsrv source code and recompiles it**. As a passive backdoor, it exhibits no obvious malicious behavior during normal operation and behaves just like a legitimate cwpsrv server. Its backdoor logic is triggered only when it receives a specially crafted request from the attacker. At the same time, it suppresses logging for that request, leaving no trace of the interaction in the access logs. **This combination of directly replacing the legitimate cwpsrv binary, passive triggering, and log suppression makes cwpdoor exceptionally stealthy.**

Control Web Panel (CWP) is a free, open-source server management control panel for CentOS and other Linux distributions. It provides a graphical interface for managing server resources such as websites, DNS, and email, eliminating the need for cumbersome SSH command-line operations. cwpsrv, meanwhile, is the web server dedicated to CWP's own management panel. It is responsible for serving the CWP control panel interface and its related built-in applications. According to data from **QiAnXin's Hunter Platform**, more than **340,000** CWP instances were exposed to the internet over the past month, making all of them potential targets for cwpdoor infection.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/531d9de282252173.png)

On September 30, 2026, a file named `evidencia.tgz` was uploaded to VirusTotal from Brazil. The archive contained two malicious files: `libkeyutils.so.1.5.2` and `cwpsrv.suspeito`. Most security vendors correctly identified `libkeyutils` as the Ebury backdoor, but the detection rate for `cwpsrv.suspeito` was zero. That file is the cwpdoor backdoor. This indicates that the campaign was not merely experimental: **real victims already exist in the wild**. (Note: The relationship between Ebury and cwpdoor remains unclear. It is possible that the two malware families were implanted on the same server by different attackers.)

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7b25b464590fc6f3.png)

Since mainstream security vendors have not yet identified cwpdoor, we decided to publish this article to share the relevant intelligence with the security community. We also welcome leads from industry peers with unique visibility into this activity, in the hope of clarifying cwpdoor's distribution channels and working together to improve cybersecurity.

## Script Analysis

The basic information about the infection script captured on June 29, 2026, is shown below:

```
MD5: e505d4ffa21cf494a5dc2d7c8f4f1236
Magic: Bourne-Again shell script text executable
Name: cwpsrv_update.sh
```

The script's functionality is straightforward. Disguised as a "version update," it is a cwpsrv replacement and deployment tool (supporting only versions 1.24.0 and 1.15.10). It must run with root privileges. First, it checks the local cwpsrv version, downloads the corresponding binary, and verifies that the version matches. It then backs up the original file, stops the cwpsrv service, overwrites `/usr/local/cwpsrv/bin/cwpsrv` with the malicious binary, restarts the service, and checks whether the master, worker, and helper processes are running. If the health check fails, it automatically rolls back; if it succeeds, it deletes the temporary files and backup. Most notably, whether the operation succeeds or fails, the script restores the new binary's atime/mtime and its parent directory's timestamp to their original values. It also runs `history -d` to delete the current session's command history. As a result, under routine checks such as `ls` and `stat`, the replaced file appears as though it has "never been modified." The script also reports the update result back to `136.0.141.71`.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/70c4d039f0fda97e.png)

## cwpdoor Analysis

We captured two cwpdoor samples, targeting cwpsrv versions 1.15.10 and 1.24.0, respectively. The following analysis focuses primarily on the sample targeting version 1.15.10. Its basic information is as follows:

```
MD5: 965aea67fb40de1bab5169ada993349f
Magic: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked (uses shared libs), for GNU/Linux 2.6.32, stripped
Name:cwpsrv_1.15.10
```

In essence, cwpsrv is a customized server based on Nginx by CWP. It is specifically responsible for serving the CWP control panel interface and related built-in applications. The cwpdoor deployed in this attack adds malicious backdoor functionality to the cwpsrv source code. The backdoor can be triggered by specific HTTP traffic to remotely execute commands issued by the attacker.

A complete attack interaction proceeds as follows:

1.  **Initiation:** The attacker crafts an HTTP request containing the following headers: `X-Ngx-Integrity-Time` (timestamp), `X-Ngx-Integrity-Data` (AES-encrypted command), and `X-Ngx-Integrity-Sig` (RSA signature).
    
2.  **Verification:** The cwpdoor master process intercepts the request at the entry point, validates the timestamp, and verifies the signature using its embedded public key. If either check fails, the request continues to be processed as ordinary traffic, and the backdoor logic is not triggered.
    
3.  **Execution:** Once verification succeeds, the master process decrypts the command and passes it to a helper child process through a Unix domain socket for execution.
    
4.  **Response:** The execution result is encrypted with AES and returned to the attacker in an HTTP 200 response with the content type `application/octet-stream`. The request is also excluded from logging.
    

Although the cwpdoor sample has been stripped, it still retains many symbols, including function names, making reverse engineering relatively straightforward. The following sections briefly examine how the backdoor works and summarize the indicators of infection on a compromised host, helping system administrators and incident responders quickly investigate and remediate infections.

## ① Indicators of Infection

cwpdoor is not standalone malware; its malicious code is embedded in the legitimate cwpsrv server. One way to determine whether a host is infected is to look for the Unix domain socket `ngx_http_integrity_helper`, which cwpdoor uses for inter-process communication. Run the following command for a quick check: `ss -axp | grep integrity`.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9bd87503407d2e76.png)

In addition to the socket, there are indicators at the process and file levels:

-   **Process indicator:** Run `ps aux | grep cwpsrv` and check whether the output shows any suspicious helper child processes associated with cwpsrv.
-   **File indicator:** Run `strings /usr/local/cwpsrv/bin/cwpsrv | grep X-Ngx-Integrity` and check whether any suspicious strings are present.

## ② Stealthy Backdoor Channel

cwpdoor adds two functions, `ngx_http_integrity_init` and `ngx_http_integrity_check`, to implement its passive backdoor functionality.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e3e6fd90c32a0bc5.png)

-   `ngx_http_integrity_init` (initializer / implantation point)

This function is called at the end of the `ngx_http_block` configuration-parsing stage. Its purpose is to implant a persistent backdoor service in the cwpsrv process. It first iterates through `ngx_modules` to locate and cache the index of the logging module for subsequent log suppression. It then cleans up any potentially lingering helper processes, creates and binds the Unix domain socket `ngx_http_integrity_helper`, and spawns a separate helper child process to execute commands issued by the attacker.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f7cd079e4d87856a.png)

-   `ngx_http_integrity_check` (trigger / command channel)

This function is called at the entry point of `ngx_http_process_request`, serving as the external trigger for the backdoor. It extracts `X-Ngx-Integrity-Time`, `X-Ngx-Integrity-Data`, and `X-Ngx-Integrity-Sig` from the HTTP request headers.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ef695b64752e0ded.png)

The **`X-Ngx-Integrity-Time`** field carries a timestamp. cwpdoor validates it against a time window of ±300 seconds.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3ee98434eef3013e.png)

The **`X-Ngx-Integrity-Sig`** field contains a Base64-encoded digital signature, which cwpdoor verifies using its embedded RSA public key. The signed data is the concatenation of `<X-Ngx-Integrity-Time value>:<X-Ngx-Integrity-Data value>`. Therefore, changing either the timestamp or the ciphertext independently invalidates the signature. By binding the three fields together and enforcing a ±300-second time window, the mechanism **provides replay protection and authorization control**.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fa3626d01600ea03.png)

The RSA public key embedded in the sample is XOR-encrypted. It can be recovered by XORing each byte with `0x55`.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1123392379bc37e9.png)

The decrypted public key is shown below:

```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwf9x0uLMxBK0AaCJuBsD
cqZgCasvDlgoA5NgPKPJrFP4YdoAztt6EAlZl/jC9LrbVAlmuXD9pt4tQkZAiiZ3
ia0I4nDzB+iLtYR2DjSwsjMSD5x2gNRdew5J1gflVVk1gub3izisExyxnZL0ahgM
4kszCeBS6ZijbzH3dZJvANdTnWulxL+rFsjm1RGrIv0B8bD8zAMxuC1NRvwM2x/u
7nhqrMaG4qHHoCEA4JTags56I03xBpHpH+jqj+Ps8CRkHCvwSeqZN2UgaP1nduLj
xMnAuffjHHErcJI4INI8CM3+SKdB0ulxPYRWHc6c4+ZO5w55noEoZ1f7Xd1YFWPW
jQIDAQAB
-----END PUBLIC KEY-----
```

The **`X-Ngx-Integrity-Data`** field contains the AES-encrypted attack command encoded in Base64. After Base64 decoding, the first 16 bytes are the IV, and the remaining bytes are the AES-256-CBC ciphertext. The AES key is derived from the SHA-256 digest of the embedded RSA public key string.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91ff9c6d1c5da488.png)

The decrypted command is sent to the helper process through the Unix domain socket for execution. The execution result is also encrypted with AES and returned in an HTTP 200 response with the content type `application/octet-stream`, forming a covert, bidirectionally encrypted command channel.

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e7577eb1a28df6f.png)

When a request triggers the backdoor, it copies and tampers with that request's module context array, replacing the context pointer corresponding to the logging module. This prevents the request from being logged normally, breaking the forensic trail. Combined with cwpdoor's **zero detection rate**, these techniques form a complete, stealthy attack cycle that is **"hidden from view and absent from the logs."**

![CWPdoor: The Invisible Backdoor Living Inside Control Web Panel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9b2d4ff1a6b1033a.png)

## Conclusion

This is all the intelligence we currently have on cwpdoor. Network administrators can investigate their systems using the indicators described in the preceding "Indicators of Infection" section. If an infection is confirmed, we recommend taking the following steps:

1.  Locate the legitimate backup file created by the attacker in `/usr/local/cwpsrv/bin` (with the naming format `cwpsrv.prev-$(date +%Y%m%d-%H%M%S)`) and use it to replace the malicious `cwpsrv`;
    
2.  Upgrade to the latest version and confirm that `ss -axp | grep integrity` no longer returns a match;
    
3.  Immediately rotate all control panel credentials. Since the backdoor can execute arbitrary commands, these credentials should be considered compromised. We recommend treating the host as compromised and investigating it for other threats.
    

We do not yet know which vulnerability cwpdoor uses to spread, nor can we determine whether Ebury in `evidencia.tgz` is related to cwpdoor. We welcome industry peers with unique visibility into this activity, as well as readers with relevant inside knowledge, to share additional intelligence. If you are interested in our research or would like assistance, please contact us via [X](https://x.com/Xlab_qax?ref=blog.xlab.qianxin.com).

## IOC

#### SAMPLE MD5

```
e505d4ffa21cf494a5dc2d7c8f4f1236 script
965aea67fb40de1bab5169ada993349f *cwpsrv_1.15.10
d3f4e95113d49ab3991b45e457bda75b *cwpsrv_1.24.0
```

#### Downloader URL

```
http://136.0.141[.]71/static/cwpsrv_update.sh
http://136.0.141[.]71/static/cwpsrv_1.15.10
http://136.0.141[.]71/static/cwpsrv_1.24.0
```

#### Downloader IP

```
136.0.141.71 
```
