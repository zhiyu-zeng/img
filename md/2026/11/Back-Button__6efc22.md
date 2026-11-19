---
title: Back Button
source: https://www.crowdstrike.com/en-us/blog/crowdstrike-helps-protect-against-java4shell-cve-2026-114938/
source_host: www.crowdstrike.com
clip_date: 2026-11-20T02:20:21+08:00
trace_id: c816688e-bd7e-410b-8d59-4c3c75e1fc1f
content_hash: 5e722200f24d8108248b2498c9ca6ace451dbe7d0c269a9da8eedc80d1bf7672
status: synced
tags: []
series: null
feed_source: CrowdStrike Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 41d75244-d011-81bd-aff9-dc422a671aaa
ioc:
  cves:
    - CVE-2026-114938
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

CVE-2026-114938, dubbed "Java4Shell," is a memory corruption vulnerability in the HotSpot Java Virtual Machine (JVM), the runtime shared by Oracle Java SE, OpenJDK, and many downstream Java distributions.

Although HotSpot is widely deployed, exposure to this vulnerability is narrower than its footprint suggests. Exploitation requires three conditions: an affected Java version, x86-64 hardware that supports AVX-512 VBMI, and an application that decodes attacker-supplied Base64 data. Even when all three are met, the limited size of the memory overwrite makes reliable remote code execution difficult, though not impossible.

Oracle and OpenJDK released fixes on November 17, 2026. Organizations should patch systems that meet all three conditions immediately, starting with internet-facing Java services. Remaining Java deployments can be addressed through regular scheduled patching.

Oracle rates the vulnerability 8.1 (High) under CVSS 3.1. Red Hat rates it 9.8 (Critical) under CVSS 3.0. Oracle and OpenJDK released fixes on November 17, 2026.

The flaw resides in HotSpot's AVX-512-optimized Base64 decoding routine, a performance shortcut the JVM uses only on processors that support AVX-512 Vector Byte Manipulation Instructions (VBMI). Base64 is everywhere in modern applications. It carries credentials in HTTP Basic authentication headers, encodes JSON Web Tokens (JWTs) and SAML assertions, and wraps file uploads and binary API payloads. As a result, the vulnerable code path is frequently reachable from untrusted input before any application-level validation takes place.

What elevates this vulnerability is its placement in the stack. The defect sits in the runtime itself, rather than an application, framework, or library. An application that decodes attacker-supplied Base64 using the standard Java class library is exposed even if its own code is flawless. Because the vulnerable code lives in shared HotSpot code, exposure extends beyond Oracle-branded Java. It includes OpenJDK builds from multiple vendors, applications that bundle their own Java runtime, container images, and managed cloud services.

Java4Shell also has meaningful constraints. The vulnerable code path is only active on specific x86-64 hardware, and the size of the out-of-bounds write is limited.

An unauthenticated remote attacker who can pass a specially crafted Base64 string to an affected application can trigger an out-of-bounds heap write of up to 62 bytes. Because the overflow lands on the Java heap, its consequences depend on what sits adjacent to the destination buffer when the write occurs. These may include:

-   **Denial of service**: Corrupting object headers or JVM metadata causes the JVM to crash. This would be the most likely outcome.
-   **Memory disclosure ("JavaBleed")**: Under certain conditions, corruption of adjacent object state can cause the application to return heap contents it should not. This could include fragments of other requests, session tokens, or credentials.
-   **Remote code execution**: Achieving code execution requires the attacker to influence heap layout precisely enough that the limited overwrite corrupts a security-relevant structure, such as an object header, array length, or reference, in a way that can be leveraged further. The 62-byte ceiling, hardware dependency, and variability of heap layout across JVM versions, garbage collectors, and workloads make this the most difficult outcome to reliably achieve.

Several conditions must be met at once for successful exploitation to occur.

-   First, the Java runtime must match with the affected software.
-   Second, the runtime must be running on an x86-64 processor that supports AVX-512 VBMI, such as Intel Ice Lake or newer or AMD Zen 4 or newer. On supported hardware, HotSpot enables the vulnerable AVX-512 Base64 decoding routine by default, so no special configuration is needed for a JVM to be exposed.
-   Finally, an attacker must be able to deliver a specially crafted Base64 string to an application that decodes it using the standard Java class library. Common entry points include authentication headers, tokens, and file uploads, which are often processed before authentication completes. Denial of service is the most reliable outcome. Remote code execution additionally requires the attacker to shape heap memory precisely enough for the limited 62-byte overwrite to corrupt a useful structure, which significantly constrains large-scale exploitation.

Exposure depends on both hardware and software.

### Affected Hardware

Only x86-64 processors that support AVX-512 VBMI are affected. This includes Intel Ice Lake and newer, and AMD Zen 4 and newer. ARM64 and i386 systems are not affected.

### Affected Software

|     |     |     |
| --- | --- | --- |
| **Branch** | **Affected Versions** | **Fixed Version** |
| Java 17 | 17.0.6 through 17.0.21 | 17.0.21.1 |
| Java 21 | Up to 21.0.13 | 21.0.13.1 |
| Java 25 | Up to 25.0.5 | 25.0.5.1 |
| Java 27 | Up to 27.0.1 | 27.0.1.1 |
| Oracle Java 8 Performance Pack | 8u511b33-perf | See Oracle advisory |

Standard Java 8 and Java 11 environments are not affected. The Oracle Java 8 Performance Pack is the exception.

Downstream distributions are also affected. These include, but are not limited to:

-   Amazon Corretto
-   Eclipse Temurin
-   Microsoft Build of OpenJDK
-   Azul Zulu
-   Red Hat OpenJDK
-   Oracle GraalVM
-   BellSoft Liberica
-   SAP SapMachine

-   Upgrade to patched versions. Apply the fixes from Oracle's and OpenJDK's Critical Security Patch Update for November 2026, or the equivalent update from your Java vendor.
-   Restart running JVMs. Upgrading the runtime on disk does not protect processes that are already running. Restart all Java processes after patching.
-   Rebuild container images. Rebuild images on patched base images and redeploy them.
-   Inventory embedded runtimes. Many appliances and third-party applications ship their own Java runtime. Check vendor advisories and review the [CISA alert on CVE-2026-114938](https://www.cisa.gov/news-events/alerts/2026/11/17/critical-java-vulnerability-requires-immediate-patching).

CrowdStrike employs a layered approach to detecting adversary activity, using machine learning and behavior-based detections, including indicators of attack (IOAs). The CrowdStrike Falcon platform provides out-of-the-box visibility and detection coverage for post-exploitation activity that may follow exploitation of CVE-2026-114938. Existing IOAs detect and prevent common post-exploitation activity, including web shell deployment, suspicious child processes spawned by Java processes, hands-on-keyboard activity, and living-off-the-land techniques.

The Falcon platform also identifies the attack surface and exposure to the vulnerability using CrowdStrike Falcon® Exposure Management and CrowdStrike Falcon® Cloud Security’s Image Assessment functionality.

![November 2026 Patch Tuesday: 1,252 CVEs Include One Zero-Day and 68 Critical Vulnerabilities](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7b07fe9b1334f3a2.png)

Falcon Exposure Management provides comprehensive visibility across affected environments. Sensor-based assessment identifies Java runtimes affected by CVE-2026-114938 on supported Windows, Linux, and macOS hosts. This covers Oracle Java SE, OpenJDK, and downstream distributions such as Amazon Corretto, Eclipse Temurin, Microsoft Build of OpenJDK, Azul Zulu, Red Hat OpenJDK, Oracle GraalVM, BellSoft Liberica, and SAP SapMachine.

Falcon Exposure Management flags hosts running affected versions: Java 17 (17.0.6 through 17.0.21), Java 21 (up to 21.0.13), Java 25 (up to 25.0.5), Java 27 (up to 27.0.1), and the Oracle Java 8 Performance Pack (8u511b33-perf). Hosts updated to 17.0.21.1, 21.0.13.1, 25.0.5.1, or 27.0.1.1 are no longer flagged.

Falcon Exposure Management detects standard Java installations on all supported sensor versions. These checks have no minimum sensor version requirement:

-   **Windows**: standard Windows installs
-   **Linux**: rpm and dpkg package installs
-   **macOS**: dmg installs

CrowdStrike has also added the following sensor-based detections. They find Java installations that the standard checks might miss, such as custom installs or runtimes bundled with other applications. They are available only on the sensor versions listed:

**Windows (Falcon sensor 7.40 or later)**: A system-wide check for Java installations. This requires “Enable Full System Visibility” to be turned on in the Exposure Management policy (checks on C: drive only; if C: is not the default drive the in-depth check does not work).

**Linux (Falcon sensor 7.31 or later)**: A check of running processes to identify Java installations performed outside the package manager.

Customers on earlier sensor versions are still covered by the standard install checks. They will not get the additional system-wide and running-process checks until they upgrade.

CrowdStrike has updated Falcon Exposure Management detections on all supported platforms to flag only x86-64 systems, and is adding a check on Linux for whether AVX-512 VBMI support is enabled. This hardware check (AVX-512 VBMI support) is available on Linux only. On Windows and macOS, Falcon Exposure Management may flag hosts that are not exploitable, so customers should prioritize patching on systems with supported processors.

Falcon Exposure Management and Falcon Spotlight customers can find exposed hosts in the Falcon console under Exposure Management > Vulnerability Management > Vulnerabilities.

![Figure 1. Identification of vulnerable Java runtimes within Falcon Exposure Management](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a5002b8d137f990.png) Figure 1. Identification of vulnerable Java runtimes within Falcon Exposure Management

In the cloud, Java usually lives inside container images, often in common base images that bundle the JDK. Falcon Cloud Security image assessment checks the packages inside container images that carry an affected Java runtime and shows which of them are running, so teams can fix what’s live first. Previously assessed images are re-assessed within 24 hours when CrowdStrike updates its vulnerability data.

Find affected images and running containers:

1.  In the Falcon console, go to Cloud security > Vulnerabilities > Image assessments, then select the Image vulnerabilities tab.
2.  Select the CVE ID filter, type CVE-2026-114938 in the Filter CVE ID box, select it, and click Apply. The table shows the Images impacted, Packages impacted, and Containers impacted counts for the CVE.
3.  Select the Images impacted count to list the affected images, or the Containers impacted count to list the running containers that use them.
4.  To find the running containers and the clusters they belong to, go to Cloud security > Assets > Kubernetes and containers inventory, select Containers, click Add/remove filters, add the CVE ID filter and enter CVE-2026-114938, then set Container running status to Running.

To see which Java packages are involved, open the Packages tab and filter CVE ID to CVE-2026-114938. Java runtimes installed through the operating system, such as java-17-openjdk, appear with the package type os.

![Figure 2. Finding of vulnerable container images and their running instances with Falcon Cloud Security’s Image Assessment](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82b51f22e991f89c.png) Figure 2. Finding of vulnerable container images and their running instances with Falcon Cloud Security’s Image Assessment

Falcon Cloud Security customers can identify internet-exposed cloud compute instances that are vulnerable to CVE-2026-114938 via Cloud Security > Posture and Compliance > Cloud Security Posture > Cloud Risks. The cloud risk combines exposure and vulnerability data, so customers can prioritize the assets an attacker can reach from the internet.

![Figure 3. Cloud Risk Rule for the Java4Shell (CVE-2026-114938)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6978ec29cbd38693.png) Figure 3. Cloud Risk Rule for the Java4Shell (CVE-2026-114938) ![Figure 4. Cloud Risk Flags Asset vulnerable to CVE-2026-114938 and Publicly Exposed](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/33a724d15e63a1af.png) Figure 4. Cloud Risk Flags Asset vulnerable to CVE-2026-114938 and Publicly Exposed

The cloud risk flags an asset when both of the following are true:

-   The asset is publicly exposed to the internet with a Global or Broad access range (reachable from 65,536 or more IP addresses).
-   The asset is running a Java version affected by CVE-2026-114938

A vulnerable asset that is not internet-facing does not trigger this cloud risk. It still appears in the vulnerability findings as described.

Use CrowdStrike Falcon® for IT’s Application Management to update Java on impacted hosts.

Application Management lists the applications that Falcon for IT can manage within the Application Catalog. Before you can update Java runtime, it must be available as a managed application within your environment.

Enabling an Application for visibility and updates:

1.  In the Falcon console, go to **IT automation**, then **Application management**, then **Applications**.
2.  Select the **Catalog** tab.
3.  Select the **Application** filter and type part of the name, for example corretto, temurin, jdk or jre. Check the boxes for the entries you want and select **Apply**. The **Vendor** filter narrows the list further.
4.  Find the entry that matches the vendor and line you need to update, such as Corretto 17 JDK. JDK and JRE builds are separate catalog entries, so choose the one that matches what is installed.
5.  In the **Actions** menu on the row (the three dots), select **Enable management**.
6.  Read the disclaimer. By enabling the application, you confirm that you hold a valid license to use and deploy the software. Select the checkbox, then **Enable application**.

Not every vendor and application line is available within the catalog. If a runtime you need is missing, update it through the vendor's own package or installer using a Falcon for IT custom task or through your existing software deployment tooling.

Once you have enabled management of an application, you can deploy that application to the impacted hosts using Application Deployments. *Note: It may take up to 24 hours before hosts start returning information on newly managed applications.*

![Figure 5. Falcon for IT Application Catalog view for the patching](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd0ac74302d7c187.png) Figure 5. Falcon for IT Application Catalog view for the patching

Organizations should first identify every system running vulnerable Java runtimes affected by CVE-2026-114938 (Java4Shell), including hosts, container images, and cloud workloads. They should then apply the latest security updates according to official Oracle, OpenJDK, or vendor guidance. After patching, restart running JVM processes and rebuild container images on patched base images.

The CrowdStrike Falcon platform helps at each step:

-   Falcon Exposure Management identifies exposed hosts
-   Falcon Cloud Security surfaces vulnerable container images and their running instances,cloud workloads, and internet-exposed instances.
-   Falcon for IT deploys updates at scale

CrowdStrike researchers are analyzing potential Java4Shell exploitation vectors to develop new behavioral detection logic. The Falcon platform already detects post-exploitation activity that may follow successful exploitation. CrowdStrike continues to monitor this evolving situation and will provide updates as new information becomes available.

[](https://www.linkedin.com/shareArticle)[](https://twitter.com/share)

* * *

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c236ed1bf000bfb3.png)

## CrowdStrike 2026 Global Threat Report

AI threats have reached a critical turning point. Access the definitive look at the cyber threat landscape.

[Download](https://www.crowdstrike.com/en-us/global-threat-report/)
