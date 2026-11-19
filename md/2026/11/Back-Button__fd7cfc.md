---
title: Back Button
source: https://www.rapid7.com/blog/post/etr-cve-2026-114938-reported-critical-pre-authentication-remote-code-execution-java-17
source_host: www.rapid7.com
clip_date: 2026-11-19T09:16:21+08:00
trace_id: c83a8b19-136d-43ee-92bc-bd5635ffeacd
content_hash: 78e812f0c8e801570cbef76afc7c00bc6f33a52a9948b38d59ac2592f31ada99
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
notion_page_id: 41d75244-d011-81c9-b706-f43aa236eaed
ioc:
  cves:
    - CVE-2026-114938
  cwes:
    - CWE-122
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Overview

On November 17, 2026, Oracle released patches for [CVE-2026-114938](https://www.cve.org/CVERecord?id=CVE-2026-114938), a heap-based buffer overflow ([CWE-122](https://cwe.mitre.org/data/definitions/122.html)) in the hardware-accelerated Base64 decoder used by OpenJDK and its downstream distributions, such as Oracle Java SE, and Oracle GraalVM. The vulnerability, dubbed “ [Java4Shell](https://calif.io/java4shell) ” by finders Calif, can allow an unauthenticated remote attacker to crash a Java application or execute code with the privileges of its Java process. Oracle rates the vulnerability High, with a CVSS v3.1 score of [8.1](https://www.first.org/cvss/calculator/3.1#CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H) and high attack complexity, in its [November security advisory](https://www.oracle.com/security-alerts/cspunov2026.html).

Affected OpenJDK runtimes enable the vulnerable Base64 optimization by default when the Java virtual machine (JVM) can use the required x86-64 CPU features, including AVX-512 VBMI. A Java application exposes the flaw when it passes untrusted data to that optimized decoder. For example, a web service may decode HTTP Basic credentials before it checks the username and password. Red Hat reports no known exposure on ARM64 or on x86-64 processors without AVX-512 VBMI in its [OpenJDK bulletin](https://access.redhat.com/security/vulnerabilities/RHSB-2026-018).

Calif’s disclosure states that they demonstrated unauthenticated remote code execution against several popular Java based applications, and they have [published](https://calif.io/java4shell#poc) a local proof of concept (PoC) for CVE-2026-114938, which can test if a local JDK is vulnerable.

Given the ubiquitous nature of Java and its deployment across enterprise environments, Rapid7 recommends identifying and remediating affected systems, with a focus on Internet exposed systems, on an emergency basis and outside of normal patching cycles.

Rapid7 is actively monitoring the situation and will update this blog as new information arrives.

For the latest vendor release information, refer to [Oracle's November security update notice](https://www.oracle.com/security-alerts/cspunov2026.html) and [OpenJDK's vulnerability advisories](https://openjdk.org/groups/vulnerability/advisories/).

## Technical overview

CVE-2026-114938 affects a hardware-specific optimization in HotSpot, the Java virtual machine used by many OpenJDK distributions. When frequently used Base64 decoding code is compiled, HotSpot can substitute a native routine that processes multiple bytes at once. The vulnerable path requires an x86-64 runtime, CPU features including [AVX-512 VBMI](https://access.redhat.com/security/vulnerabilities/RHSB-2026-018), and effective JVM settings that permit the optimizing compiler and Base64 intrinsic. Consequently, an affected Java version alone does not establish that a particular application is exploitable.

The defect occurs when that routine processes a malformed final Base64 group. Its calculation of the remaining output length can become negative, enabling a wider memory write than the destination can accommodate. Confirmed malformed-tail cases produce a 64-byte store extending 62 or 63 bytes beyond the calculated decoded-output length. Java subsequently rejects the malformed input, but catching that exception does not undo the corruption. Damage to another object can remain unnoticed until later activity, including garbage collection, crashes the JVM.

Turning this constrained overwrite into code execution requires additional work. A reliable exploit typically needs to influence which objects occupy the affected memory, convert the initial corruption into useful access to other objects, and identify application or runtime behavior that permits further execution. The practical outcome therefore depends on the application, JVM build, memory layout, and security boundaries. This distinction explains why a working corruption trigger does not establish a portable exploit for every Java service.

Remote exposure arises when an application passes attacker-controlled data to the affected decoder. Authentication headers and tokens are relevant examples, but reachability must be established for the actual implementation. The [published OpenJDK fix](https://github.com/openjdk/jdk/commit/5177a70b385c16f26ede191fdac7aaba0bed0f8b) hands final groups shorter than four bytes to the ordinary Java decoder. Organizations should apply their runtime vendor's fixed build and restart affected JVMs; disabling Base64 intrinsics with -XX:-UseBASE64Intrinsics is a temporary mitigation where supported.

## Mitigation guidance

Rapid7 recommends applying the November security update as soon as possible, starting with internet-facing services that decode credentials or tokens before authentication. Identify the runtime vendor and full build each service uses, including Java runtimes bundled with applications, appliances, and container images.

OpenJDK lists release versions 17, 21, 25, and 27 as affected by CVE-2026-114938 in its [November 17 advisory](https://openjdk.org/groups/vulnerability/advisories/2026-11-17). [Red Hat](https://access.redhat.com/security/vulnerabilities/RHSB-2026-018) identifies OpenJDK 17.0.6 as the earliest affected version 17.

Oracle separately identifies its Java 8 Enterprise Performance Pack as affected in the [Java risk matrix](https://www.oracle.com/security-alerts/cspunov2026.html). The table below pairs affected Oracle builds with the November updates listed in the [JDK security baselines](https://www.oracle.com/java/technologies/javase/27-0-1-1-relnotes.html), [Enterprise Performance Pack release notes](https://www.oracle.com/java/technologies/javase/8u513-perf-relnotes.html), and [GraalVM release calendar](https://www.graalvm.org/release-calendar/).

| **Product Name** | **Vulnerable Java Version** | **Patched Version (Official Release Notes)** |
| --- | --- | --- |
| Oracle Java SE 8 Performance Edition | 8u511b33-perf | [8u513-perf](https://www.oracle.com/java/technologies/javase/8all-relnotes.html?utm_source=chatgpt.com) |
| Oracle Java SE 17 | 17.0.21.0.3 | [17.0.21.1](https://www.oracle.com/java/technologies/javase/17-0-21-1-relnotes.html) |
| Oracle Java SE 21 | 21.0.13.0.3 | [21.0.13.1](https://www.oracle.com/java/technologies/javase/21-0-13-1-relnotes.html) |
| Oracle Java SE 25 | 25.0.5.0.3 | [25.0.5.1](https://www.oracle.com/java/technologies/javase/25-0-5-1-relnotes.html) |
| Oracle Java SE 27 | 27.0.1.0.3 | [27.0.1.1](https://www.oracle.com/java/technologies/javase/27-0-1-1-relnotes.html) |
| Oracle GraalVM for JDK 17 | 17.0.21.0.3 | [17.0.21.1](https://docs.oracle.com/en/graalvm/jdk/17/docs/release-notes/) |
| Oracle GraalVM for JDK 21 | 21.0.13.0.3 | [21.0.13.1](https://docs.oracle.com/en/graalvm/jdk/21/docs/release-notes/) |
| Oracle GraalVM Enterprise Edition | 21.3.20.0.3 | [21.3.20.1](https://docs.oracle.com/en/graalvm/enterprise/21/docs/release-notes/) |

For other OpenJDK based distributions, use the patched package from your Java vendor. If an application or appliance bundles Java, use the product vendor’s update. Rebuild affected container images, redeploy the workloads, and restart affected services. Verify that each running Java process uses the patched build, as [CIRCL recommends](https://www.circl.lu/pub/tr-104/).

If you cannot patch an affected OpenJDK service immediately, restart its JVM with -XX:-UseBASE64Intrinsics. This disables hardware acceleration for Base64 decoding while leaving other CPU optimizations in place.

## Rapid7 customers

To learn how to use Rapid7 capabilities to find systems affected by this vulnerability and for answers to common questions, read the [Oracle OpenJDK Java (CVE-2026-114938) documentation](https://docs.rapid7.com/insightvm/oracle-openjdk-java/).

### Exposure Command, Vulnerability Management, and Nexpose

Exposure Command, Vulnerability Management, and Nexpose customers can assess exposure to CVE-2026-114938 with an authenticated vulnerability check available to the scan engine and Rapid7 Agent in the November 17 content release (1.1.4115).

## Updates

-   **November 17, 2026**: Initial publication.
    
-   **November 18, 2026**: Updated the Overview to reflect the published advisory. Added a Technical overview section. Added a Mitigation guidance section.
-   **November 18, 2026**: Added link to the Rapid7 [Oracle OpenJDK Java (CVE-2026-114938) documentation](https://docs.rapid7.com/insightvm/oracle-openjdk-java/). Clarified VM check availability.
