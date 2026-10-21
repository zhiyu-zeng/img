---
title: "Recent AI-Assisted Cyber Attacks in Japan: Investigating Attack Infrastructure and Techniques - JPCERT/CC Eyes | JPCERT Coordination Center official Blog"
source: https://blogs.jpcert.or.jp/en/2026/10/web_api_attacks.html
source_host: blogs.jpcert.or.jp
clip_date: 2026-10-21T10:16:12+08:00
trace_id: 8f6f36be-772b-499a-ad24-a100d6da68bc
content_hash: 8cb0857283225b7b700a12f5ddb49b08b42a5ee2a2db6998ba46fee631584ebd
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: JPCERT/CC Blog EN
ai_summary: JPCERT/CC 调查确认，日本多起信息泄露事件的攻击者借助 AI 扫描已知漏洞、逆向解析 APK 定位后端 API 并发起攻击；被攻击目标不限于日本境内。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40075244-d011-8191-ada8-dd751fd0d6de
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> JPCERT/CC 调查确认，日本多起信息泄露事件的攻击者借助 AI 扫描已知漏洞、逆向解析 APK 定位后端 API 并发起攻击；被攻击目标不限于日本境内。
> 
> - **攻击手法：** 在大规模未授权访问事件中，攻击者用 AI 扫描已知漏洞并通过 API 实施攻击；其中一项显著特征是逆向分析 Android APK，以识别并利用其 API。
> - **服务器证据：** 调查发现，一台服务器上存有尚未分析的 APK 和用于测试 SSRF 的 Python 脚本，该脚本以 HTTPS 服务方式运行，并对特定请求返回 302 重定向；另一台服务器则存有多个 APK 和 Flutter 逆向工具 Blutter、Android 分析工具 jadx，以及 apk_extract/ 目录、strings_libapp.txt 等提取产物。
> - **横向渗透迹象：** 第三台服务器（与本次攻击无直接关联）存有针对 Web 应用、MySQL、Jenkins 和邮件网关的多类攻击工具，以及规避 EDR 的尝试和疑似已植入目标网络的 WebShell，这表明攻击者意图进入内网。
> - **Flutter 逆向风险：** 对 AOT 编译的 libapp.so 进行静态与动态分析，可以提取内嵌 RSA 私钥、API 认证机制和请求签名逻辑；已有案例在复现签名流程后，用独立 Python 客户端绕过官方 App 直接访问生产 API。
> - **防护建议：** 不要在客户端内嵌私钥或长期凭证；认证与授权必须由服务端执行，不能仅依赖签名或代码混淆；对 API 做限流，并监控异常请求；对会获取外部 URL 的接口限制可访问目标，并校验重定向地址。

On October 8, 2026, JPCERT/CC issued [an alert](https://www.jpcert.or.jp/at/2026/at260030.html "alert_Oct_8") regarding a series of unauthorized access incidents involving the leakage of personal and other information reported by multiple organizations in Japan. In cooperation with multiple organizations, JPCERT/CC has been investigating infrastructure that may have been used in these attacks. We confirmed that the attackers had used AI to scan for known vulnerabilities and carry out attacks via APIs. We identified several servers used for these activities and confirmed that the attackers had also targeted web services intended for users outside Japan.  
This article presents our findings from an investigation of attack servers involved in attacks targeting web services and other systems in Japan and abroad.

### Investigation of Attack Servers: Part 1

One notable characteristic of these attacks was that the attackers analyzed Android application packages (APK files) to identify APIs and exploit them [\[1\]](#1). On one of the attack servers, we found evidence that the attackers had analyzed APK files and tested the associated APIs for vulnerabilities such as server-side request forgery (SSRF).  
Figure 1 shows a partial list of files found on this server. The server also contained applications intended for users outside Japan.

![Files found on the server under investigation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5d2c6237e9cb8c31.png)

Figure 1: Files found on the server under investigation

Figure 2 shows a Python script that appears to have been used to test for SSRF.

![Python script related to SSRF testing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ec39ce637d20f4ec.png)

Figure 2: Python script related to SSRF testing

The script functions as an HTTPS server and returns an HTTP 302 redirect response to specific requests.

### Investigation of Attack Servers: Part 2

On another server under investigation, we found several APK files, along with files associated with two tools: Blutter, used for reverse engineering Flutter applications, and jadx, used for analyzing Android applications. For more information on Blutter, see Appendix A.  
Figure 3 shows a partial list of files found on the server.

![Files related to Android application analysis and vulnerability testing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a73a424bc3effd6e.png)

Figure 3: Files related to Android application analysis and vulnerability testing

The server also contained directories such as **apk_extract/**, which may have been associated with APK extraction. Filenames such as **strings_libapp.txt** suggest that the files may have been used to store strings extracted from native libraries.

### Investigation of Attack Servers: Part 3

On a separate server not directly related to these attacks, we found files associated with various attack techniques targeting web applications, MySQL, Jenkins servers, and email gateways.  
Figure 4 shows a partial list of files found on this server. We also found evidence of attempts to evade EDR systems, as well as web shells believed to have been deployed within the targeted network. These findings suggest that the attackers were attempting to gain access to internal networks.

![Files associated with attempts to access internal networks](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4c7e676ca4301f46.jpg)

Figure 4: Files associated with attempts to access internal networks

### In conclusion

JPCERT/CC will continue working with relevant parties to respond to these attacks. We would appreciate the assistance of security researchers in hunting for servers used in these attacks. If you uncover any information related to attacks targeting Japanese organizations or incidents affecting them during your investigations, please share your findings with JPCERT/CC at **info@jpcert.or.jp** so that we can help notify the affected organizations.

JPCERT/CC Attack Infrastructure Investigation Team  
(This article was machine-translated and manually reviewed.)

#### References

\[1\] NICT：【注意喚起】相次ぐ情報漏洩、その原因の一つは「アプリ解析からのサーバ攻撃」  
[https://cynex.nict.go.jp/library/261013-01.html](https://cynex.nict.go.jp/library/261013-01.html)

### Appendix A: Reverse Engineering Flutter Applications

Flutter is a framework for building applications for multiple platforms from a single codebase. Blutter, identified on one of the attack servers, is an open-source tool for analyzing ahead-of-time (AOT)-compiled Dart code in Flutter applications. Reverse engineering with such tools can reveal an application's internal structure and how it communicates with APIs.  
A technical article published by IQCrafter in June 2026 describes an approach to analyzing a real-world Flutter application using Frida, Blutter, LIEF, Capstone, and other tools. Static and dynamic analysis of libapp.so revealed an embedded RSA private key, API authentication mechanisms, and the logic used to generate request signatures. The article also reports that the request-signing process was successfully reproduced, enabling a standalone Python client to access the production API without using the legitimate application.  
A technical article by NerdzLab describes techniques for analyzing APK files and AOT-compiled libapp.so files to examine API keys, secrets, class structures, and function addresses. These examples demonstrate that reverse engineering may reveal embedded secrets and API authentication mechanisms, even in compiled applications.  
If a shared private key or other secrets used for API authentication are embedded in an application, attackers may be able to extract them and generate API requests without using the legitimate application. To address these risks, we recommend the following measures:

-   **Protect secrets**: Do not embed private keys used for API authentication or long-lived credentials in applications.
-   **Enforce server-side authentication and authorization**: Do not rely solely on request-signing mechanisms or code obfuscation within the application. Authenticate users on the server and verify that they are authorized to access the requested resources and perform the requested operations.
-   **Prevent API abuse**: Implement rate limiting and monitor for anomalous requests. Account for the possibility that the API may be accessed by clients other than the legitimate application.
-   **Prevent SSRF**: For APIs that retrieve content from external URLs, restrict the destinations they can access and validate redirect destinations as well.

References：

-   [Reverse Engineering a Flutter Mobile App: A Complete Security Research Methodology（IQCrafter）](https://www.iqcrafter.com/blog/flutter-app-reverse-engineering-security-research "Link1")
-   [Reverse Engineering a Flutter App: How Secure Is Your Data, Really?（NerdzLab）](https://nerdzlab.com/reverse-engineering-a-flutter-app-how-secure-is-your-data-really/ "Link2")
-   [I Reverse Engineered a Banking App With a Million Downloads（Medium）](https://medium.com/@nerdz_lab/i-reverse-engineered-a-banking-app-with-a-million-downloads-5bbbad44fa52 "Link3")
-   [Blutter（GitHub）](https://github.com/worawit/blutter "Link4")
