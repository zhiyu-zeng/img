---
title: "Java4Shell: OpenJDK Base64 RCE"
source: https://www.hacktron.ai/blog/java4shell
source_host: www.hacktron.ai
clip_date: 2026-11-19T22:49:37+08:00
trace_id: d0065d84-75e6-4b99-a414-0e9b01dc833f
content_hash: d8eaabe8466edf4464a7f6501ed53b4d74ebee1dc27e6ae14a1d006f589a322d
status: synced
tags: []
series: null
feed_source: Hacktron·漏洞/利用研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-816a-a9f9-cfa681894f94
ioc:
  cves:
    - CVE-2026-114938
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Java4Shell is [CVE-2026-114938](https://www.cve.org/CVERecord?id=CVE-2026-114938 "CVE-2026-114938, High severity, CVSS 3.1 8.1, oracle"), a heap overflow in OpenJDK’s Base64 decoder. Malformed Base64 can corrupt memory, leak heap contents and, in some applications, let an unauthenticated attacker run code. Oracle, OpenJDK and Amazon Corretto released fixes on 17 November 2026. Until you can update, a JVM option turns off the vulnerable accelerated code.

## Who is affected

A system is exposed when all three of these are true, unless the accelerated decoder has been turned off (see [What to do](#what-to-do)):

-   It runs an unpatched Java 17 build from 17.0.6 onward, an affected Java 21, 25 or 27 build, or any release of Java 18 to 20, 22 to 24 or 26. Those releases no longer get updates, so they have no fix.
-   Its CPU is x86-64 with AVX-512 VBMI, such as Intel Xeon Ice Lake and newer, or AMD Zen 4 and newer.
-   An application on it decodes attacker-controlled Base64 with `java.util.Base64`. Red Hat’s examples include HTTP Basic credentials, SAML artifacts, CSRF tokens and MIME encoded words, which are often decoded before login.

This covers builds from Oracle, Corretto, Temurin, Microsoft, Zulu, Liberica, SapMachine, Red Hat and GraalVM. ARM64 systems are not affected. Standard Java 8 and Java 11 are not affected either, with one exception: Oracle’s Java 8 Enterprise Performance Pack build 8u511b33-perf.

In the cloud, check the CPU flags inside the running VM. Red Hat names these instance families as the most likely to be affected. They are examples, not a complete list:

-   AWS: C6i, M6i, R6i, C7i, M7i and R7a
-   Google Cloud: C3, C3D, C4, C4D, N4, N4D, M3 and M4
-   Azure: D-series v5 to v7

Whether an attacker can then run code depends on the application. Calif demonstrated pre-auth RCE in default installs of Keycloak, Jira, Confluence, JFrog Artifactory, Jenkins and PingFederate, and post-auth RCE in Kafka, Solr, Elasticsearch, Gerrit and Spinnaker. A Java client connecting to a malicious TLS server can also be compromised.

## How to check

1.  Check the CPU features inside the host or VM. All four flags must be present:
    
    ```bash
    grep -m1 '^flags' /proc/cpuinfo | tr ' ' '\n' | grep -E '^(avx512f|avx512bw|avx512vbmi|bmi2)$'
    ```
    
2.  Check the Java build serving traffic with `jcmd <pid> VM.version`. Containers, app servers and appliances often bundle their own JDK. Compare the build with your vendor’s advisory, not the upstream version number alone: distributions such as Red Hat backport fixes, so a patched package can keep an older version string.
    
3.  Start with internet-facing services and identity providers that decode Base64 from requests before login.
    
4.  To test, run Calif’s [safe test program](https://calif.io/java4shell/) on a non-production host with the same JDK and instance type. It uses the input for Java 21 and later and checks for exact overwrite offsets, so it can miss a vulnerable Java 17 build. For Java 17, check the build against your vendor’s list of fixed builds or packages instead. A negative result doesn’t prove you’re patched.
    

## What to do

-   Update to a Java build that lists [CVE-2026-114938](https://www.cve.org/CVERecord?id=CVE-2026-114938 "CVE-2026-114938, High severity, CVSS 3.1 8.1, oracle") as fixed (see [Fixed versions](#fixed-versions)), restart every JVM and confirm the running version. On Java 18 to 20, 22 to 24 or 26, move to a supported release that has a fix.
    
-   If you build your own container images, rebuild them on a patched base image or runtime and redeploy.
    
-   For products and appliances that ship their own JVM, follow the vendor’s supported update procedure rather than replacing the JVM yourself.
    
-   If you can’t update yet, start every JVM with `-XX:-UseBASE64Intrinsics`. It turns off only the hardware-accelerated Base64 code, so Base64 decoding keeps working without it and other AVX-512 optimisations stay on. Calif published it, and Red Hat recommends it until you can update. `-XX:UseAVX=2` also works but disables all AVX-512 code, and stops the JVM starting on ARM. Test performance first if your service decodes a lot of Base64.
    
-   Confirm the option is active in every running JVM, including replicas, failover nodes and pods replaced during rolling updates. Checking the environment variable is not enough. Red Hat’s check:
    
    ```bash
    jcmd <pid> VM.flags -all | grep -F UseBASE64Intrinsics
    # expected: bool UseBASE64Intrinsics = false
    ```
    
    For `UseAVX`, the same command with `grep -w UseAVX` should show `2`. Remove the option once you have updated.
    

## Fixed versions

| Vendor | Status |
| --- | --- |
| Oracle Java SE | Fixed in 17.0.21.1, 21.0.13.1, 25.0.5.1, 27.0.1.1 |
| Oracle Java 8 Enterprise Performance Pack | Fixed in 8u513-perf |
| Oracle GraalVM | Patch guidance: see [Oracle’s advisory](https://www.oracle.com/security-alerts/cspunov2026.html) |
| Amazon Corretto | Fixed in 17.0.21.1.2, 21.0.13.1.2, 25.0.5.1.2, 27.0.1.1.4 |
| Red Hat | No fixed packages listed as of 18 November 2026, 20:34 UTC. Track [CVE-2026-114938](https://access.redhat.com/security/cve/CVE-2026-114938) for errata |
| Java 18 to 20, 22 to 24, 26 | No fix: these releases no longer get updates. Move to a supported release |
| Others | Check your vendor’s advisory |

## What to monitor

-   Cisco Talos lists [Snort rules for subscribers](https://blog.talosintelligence.com/java4shell/) (Snort 2: 1:67502–1:67513; Snort 3: 1:301754, 1:67502–1:67513) that detect malformed Base64 in specific HTTP request fields. Talos notes the bug is implementation-specific, so the rules cover common applications rather than every path.
-   A failed attempt can crash the JVM, according to Calif, and the malformed input makes Java throw a decoding error, although both may happen for other reasons.
-   Investigate unexpected shell processes launched by Java and unusual outbound connections from Java processes. Neither is specific to Java4Shell.
-   Patching does not tell you whether a system was compromised before the update.

## Timeline

1.  17 November 2026
    
    OpenJDK publishes its [advisory](https://openjdk.org/groups/vulnerability/advisories/2026-11-17); Oracle and Corretto ship fixes
    
2.  17 November 2026
    
    Calif publishes its [write-up](https://calif.io/java4shell/) and a safe test program
    

As of 18 November, GreyNoise had reported exploitation attempts but had not confirmed successful exploitation against its sensors, according to [Tenable](https://www.tenable.com/blog/java4shell-cve-2026-114938-frequently-asked-questions-about-openjdk-rce-vulnerability). Java4Shell is not in CISA’s [Known Exploited Vulnerabilities catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog). Calif is withholding its application exploits, and [VulnCheck](https://www.vulncheck.com/blog/java4shell) says a full exploit is available to its paying customers.

## Technical summary

OpenJDK’s fast Base64 decoder, used on CPUs with AVX-512 VBMI, writes its output 64 bytes at a time. A mask limits the last write to the bytes that are left.

Some malformed inputs that end in padding make that count go negative. The mask then lets all 64 bytes through, and the write runs past the end of the output array. Correctly padded input is not affected. [Calif’s analysis](https://calif.io/java4shell/) lists the exact inputs.

With 64 `A` characters and `=`, the output array is 50 bytes and 62 bytes land past it. Java rejects the input afterwards, but by then the memory is overwritten:

0 16 32 48 64 80 96 9a 9a 9a 9a 9a 9a 9a 9a 9a 9a 9a 9a 9a 9a 9a 9a 112 0 8 16 24 32 40 48 56 64 72 80 88 96 9a 9a 9a 9a 9a 9a 9a 9a 104 9a 9a 9a 9a 9a 9a 9a 9a 112 120

Decoded normallyFaulty store, inside the arrayFaulty store, past the endUntouchedEnd of the 50-byte array

The overwritten bytes are fixed, not chosen by the attacker. Calif uses them to enlarge a neighbouring array, the writer. Bytes written into the writer then spill into a second array, the reader, and enlarge it too.

The application copies the reader into a response, which returns heap memory beyond it. Calif calls this JavaBleed. From there it repairs the damage and escalates to code execution:

Warm up Valid Base64 until C2 compiles the fast decoder Rehearse (optional) Calibrate timing, no corruption Groom the heap Line up decoder output, writer and reader Trigger Malformed tail spills into the writer's length Widen the reader Writer sets the reader's length JavaBleed Reader returns heap memory in the response Repair Restore damaged objects so the JVM survives Escalate Arbitrary writes reach the code cache and JVM hooks Code execution Application-specific final step Warm up Valid Base64 until C2 compiles the fast decoder Rehearse (optional) Calibrate timing, no corruption Groom the heap Line up decoder output, writer and reader Trigger Malformed tail spills into the writer's length Widen the reader Writer sets the reader's length JavaBleed Reader returns heap memory in the response Repair Restore damaged objects so the JVM survives Escalate Arbitrary writes reach the code cache and JVM hooks Code execution Application-specific final step

There is no universal exploit. Each application needs its own chain, and remote heap grooming is sensitive to network latency. [Calif’s write-up](https://calif.io/java4shell/) has the full details.

## References

-   [OpenJDK Vulnerability Group advisory](https://openjdk.org/groups/vulnerability/advisories/2026-11-17)
-   [Oracle Critical Security Patch Update, November 2026](https://www.oracle.com/security-alerts/cspunov2026.html)
-   [Oracle JDK 17.0.21.1 release notes](https://www.oracle.com/java/technologies/javase/17-0-21-1-relnotes.html)
-   [Oracle Java 8u513 Enterprise Performance Pack release notes](https://www.oracle.com/java/technologies/javase/8u513-perf-relnotes.html)
-   [Amazon Corretto 17 changelog](https://github.com/corretto/corretto-17/blob/develop/CHANGELOG.md)
-   [Red Hat: RHSB-2026-018](https://access.redhat.com/security/vulnerabilities/RHSB-2026-018)
-   [Red Hat: CVE-2026-114938](https://access.redhat.com/security/cve/CVE-2026-114938)
-   [Calif: Java4Shell](https://calif.io/java4shell/)
-   [Cisco Talos: CVE-2026-114938](https://blog.talosintelligence.com/java4shell/)
-   [Tenable: Java4Shell FAQ](https://www.tenable.com/blog/java4shell-cve-2026-114938-frequently-asked-questions-about-openjdk-rce-vulnerability)
-   [VulnCheck: Java4Shell](https://www.vulncheck.com/blog/java4shell)
-   [Apache Flink: Mitigating CVE-2026-114938](https://flink.incubator.apache.org/2026/11/18/mitigating-cve-2026-114938-java4shell-in-apache-flink-deployments/)

Credits, from Oracle’s advisory: Quang Luong of Calif.io and Albert Yang.
