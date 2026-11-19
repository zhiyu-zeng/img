---
title: bishopfox-logo-grey
source: https://bishopfox.com/blog/tracing-cves-to-deployed-code
source_host: bishopfox.com
clip_date: 2026-11-19T10:19:51+08:00
trace_id: 4813563a-9941-462c-b06c-ee6688be3032
content_hash: aac935cfa606dbc51d03fa7bb550b0b3667577c8aacd8b77ed244b219e893bdb
status: synced
tags: []
series: null
feed_source: Bishop Fox
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41d75244-d011-81f3-bd51-f3b30c7600fa
ioc:
  cves:
    - CVE-2023-4863
    - CVE-2026-109618
    - CVE-2026-109619
    - CVE-2026-111497
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> **
> 
> ##### TL;DR
> 
> **
> 
> -   Our experiments show how checking the code an application actually uses helps establish whether a fix applies, and where more evidence is needed before reaching a conclusion.
> -   The experiments examine Node.js builds with identical Brotli version strings but different patch status, a PHP backport identified through Apache's loaded module, and a separate libwebp installation found through ImageMagick's dependency checks.

## Following the Bug into an Application

The PHP2Shell and Node2Shell disclosures prompted me to look at how the affected code fits into an application. [AndrewMohawk's PHP2Shell analysis](https://andrewmohawk.com/2026/10/26/picking-apart-php2shell/) covers the exploit mechanics, and [Bishop Fox's responder guidance](https://bishopfox.com/blog/responder-guidance-for-php2shell) addresses remediation. Which inspired me to follow a different question: what happens when an application’s behavior and the available version and/or package records do not give an obvious answer to it’s patch status?

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/94c567156c28b7d4.svg)

A pathcched build can report the same library version as an affected one. A PHP installation can report an older version while still containing the fix., Jjust like an application’s dependency checks can point to a vulnerable library even when the system copy is patched.

## Node.js: No Calls Required

Starting with a Node.js application that had no npm dependencies and no explicit decompression call to test whether an ordinary HTTP fetch could still reach the Brotli decored affected by [CVE-2026-111497](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). I used Node.js’s built-in `fetch()` to retrieve a response from a local server.

I ran the same application in official Node.js 24.22.0 and 24.22.1 images, immediately before and after the fix. The client sent `Accept-Encoding: identity`, asking for an uncompressed response. The local server deliberately returned known text compressed with Brotli and labeled it `Content-Encoding: br`. In both builds, reading the response body returned the original text:

```javascript
// Client excerpt, after the local server has started 
 const address = server.address(); 
 const response = await fetch(`http://127.0.0.1:$;{address.port}/`, { 
   headers: { "accept-encoding": "identity" }, 
 }); 
 const body = await response.text(); 
  
// Selected probe output, identical in both builds 
 { 
   "requestAcceptEncoding": "identity", 
   "responseContentEncoding": "br", 
   "decodedBody": "synthetic lab response\n", 
   "decoderReached": true 
}
```

*Figure 1. The fetch() probe and selected output. The decoderReached field records a match with the expected text*

An attacker would need control over a response the application retrieves to supply malicious Brotli data through this path.

To distinguish the affected and fixed builds, I checked their version and inventory data. Both reported Brotli 1.2.0, but the [Node.js 24.22.1 release notes](https://nodejs.org/en/blog/release/v24.22.1) record the cherry-picked fix. Docker Scout 1.18.3 found no separate Brotli entry in either image's software bill of materials (SBOM). It did distinguish the Node.js releases, which let me connect each image to its release notes.

That made the Node.js release the relevant patch identifier for these images. [Red Hat documents Node.js packages that use system Brotli and others that bundle it](https://access.redhat.com/security/cve/cve-2026-111497). For a build that uses system Brotli, the Brotli package supplies the decoder and its fix.

## PHP Backports in the HTTP Worker

PHP2Shell concerns PHP's request handling, so I checked the build serving HTTP requests. I compared official Apache images running PHP 8.3.35 and the [fixed 8.3.36 release](https://www.php.net/archive/2026.php) with Ubuntu's PHP 8.3.6 package. Ubuntu had backported the fixes to that older release, yet both the CLI and HTTP still reported 8.3.6. I needed to identify the file handling the web request to find the package revision that accounted for the fix.

The HTTP endpoint also returned the worker's process ID (PID) and `apache2handler`, identifying PHP's Apache module. I used that PID to inspect the worker. The CLI had run `/usr/bin/php8.3`, while Apache handled the HTTP request with `libphp8.3.so` mapped into memory. I therefore checked the Apache module's package record:

```bash
# HTTP endpoint response (selected fields) 
 { 
   "php_version": "8.3.6", 
   "sapi": "apache2handler", 
   "pid": 23, 
   "process_executable": "/usr/sbin/apache2" 
 } 
  
# Inspect the worker identified by that response 
 $ readlink /proc/23/exe 
 /usr/sbin/apache2 
  
$ grep -E 'libphp|/php([0-9.]*)?$' /proc/23/maps 
 ... /usr/lib/apache2/modules/libphp8.3.so 
  
# Apache PHP package record from the same container 
 libapache2-mod-php8.3  8.3.6-0ubuntu0.24.04.13 
```

*Figure 2. The HTTP worker, its mapped PHP module, and the module's package revision.*

[Ubuntu's security notice](https://ubuntu.com/security/notices/USN-8948-1) lists that full package revision as fixed for CVE-2026-109618 and CVE-2026-109619. In this freshly built container, the HTTP response and process inspection connected Ubuntu's fix to the web server.

Solely using upstream's fixed version as the cutoff would have flagged this patched Ubuntu web server for remediation. The full Apache-module package revision was needed to recognize Ubuntu's backport.

## Libwebp Outside the System Package

After connecting PHP's fix to its package, I examined a case with another library copy installed alongside the distribution's package. During CVE-2023-4863, [Seth Larson found libwebp libraries bundled in Python wheels](https://sethmlarson.dev/security-developer-in-residence-weekly-report-16) that were absent from Python dependency metadata. I used ImageMagick to examine whether its dependency checks would find a separately installed libwebp.

I built libwebp under `/opt/libwebp` in two otherwise matched ImageMagick setups. One used affected upstream 1.3.1 and the other used [1.3.2, which fixed the lossless-decoder vulnerability](https://github.com/webmproject/libwebp/blob/main/NEWS). Both retained Ubuntu's fixed `libwebp7` package, revision `1.3.2-0.4build3`. I set `LD_LIBRARY_PATH` to `/opt/libwebp/lib` so the loader would search that directory before the normal system library locations.

I used `ldd` to check the shared-library dependencies of ImageMagick’s `convert` executuable. The output contained no libwebp match.

ImageMagick's WebP support came through a loadable module, so I checked that module under the same environment. Its dependencies resolved to the libraries under `/opt` in both setups. In the commands below, `webp_module` holds the path to ImageMagick's `coders/webp.so.`

```bash
# Configuration in the container Dockerfile 
 ENV PATH=/opt/libwebp/bin:${PATH} 
 ENV LD_LIBRARY_PATH=/opt/libwebp/lib 
  
# Linkage checks inside each container 
 $ ldd /usr/bin/convert | grep libwebp 
 [no matching output] 
  
$ ldd "$webp_module" | grep libwebp 
 libwebpmux.so.3 => /opt/libwebp/lib/libwebpmux.so.3 
 libwebpdemux.so.2 => /opt/libwebp/lib/libwebpdemux.so.2 
 libwebp.so.7 => /opt/libwebp/lib/libwebp.so.7 
```

*Figure 3. Dependency checks for the convert executable and its WebP module. Bracketed text describes an empty result.*

With the module check pointing to `/opt`, I checked whether ImageMagick could still decode a valid lossless WebP in both setups. I compared its raw RGB output with dwebp's output for the same image. All outputs contained identical pixels.

Both libwebp versions could decode this valid image, so matching pixels could not identify which copy ImageMagick loaded. The `ldd` check examined the module separately from the image conversion. It pointed to `/opt`, but I did not inspect the conversion process's memory mappings or record library loading to confirm that choice.

Ubuntu's fixed package was present in both setups, while the module check pointed to the vulnerable libwebp 1.3.1 sitting in `/opt/libwebp/lib/libwebp.so.7.` A package-only assessment would have treated those setups as equivalent.

## The Application Changes the Assessment

Patch status is specific to a build and deployment. Extending a finding to other applications requires establishing that they use the same affected code and that the relevant conditions apply. Without that connection, an assessment can recommend an update that leaves the affected copy untouched or flag a build that already contains the fix.

This has practical consequences for remediation. The component named in an advisory may be maintained by the operating system, bundled into a runtime, or installed separately. Identifying which build supplies it determines which update addresses the finding. Closing that finding then requires evidence that the application uses the corrected build. An updated package record alone may leave that question unanswered.

The research record should make those conclusions reviewable. Recording the application operation, the identified build, and the source establishing its patch status gives reviewers a basis for accepting or challenging the assessment. Where a connection remains unverified, naming the missing observation defines the follow-up work and keeps the finding within the evidence.

[Bishop Fox's Emerging Threat Testing](https://bishopfox.com/services/continuous-security-testing/emerging-threat-testing) service assesses new vulnerabilities against organizations' environments to validate exposure and guide remediation.

![Emilio Gallegos Bio Image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac5d27e72e03ce37.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a10729e6ade629c7.svg)

Subscribe to our blog

Be first to learn about latest tools, advisories, and findings.
