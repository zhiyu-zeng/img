---
title: WebKitGTK and WPE WebKit Security Advisory WSA-2026-0007
source: https://seclists.org/oss-sec/2026/q4/771
source_host: seclists.org
clip_date: 2026-11-19T09:32:15+08:00
trace_id: 118690e2-bb04-415b-95bf-74fbecfee1a1
content_hash: 991cedeb3856cc250562850eb71ac968f2b8c949f79df41e0b2c51447e97b13d
status: synced
tags: []
series: null
feed_source: oss-security·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81d8-95e8-c8754fb5ca7d
ioc:
  cves:
    - CVE-2026-112599
    - CVE-2026-112615
    - CVE-2026-112623
    - CVE-2026-112626
    - CVE-2026-112637
    - CVE-2026-112639
    - CVE-2026-112640
    - CVE-2026-112651
    - CVE-2026-112653
    - CVE-2026-112654
    - CVE-2026-112655
    - CVE-2026-112666
    - CVE-2026-112673
    - CVE-2026-112684
    - CVE-2026-112686
    - CVE-2026-112693
    - CVE-2026-112695
    - CVE-2026-113897
    - CVE-2026-113901
    - CVE-2026-113903
    - CVE-2026-113904
    - CVE-2026-86922
    - CVE-2026-86973
    - CVE-2026-86974
    - CVE-2026-86985
    - CVE-2026-86986
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## WebKitGTK and WPE WebKit Security Advisory WSA-2026-0007

* * *

*From*: Adrian Perez de Castro <aperez () igalia com>  
*Date*: Wed, 18 Nov 2026 19:09:40 +0100  

* * *

```yaml
------------------------------------------------------------------------
WebKitGTK and WPE WebKit Security Advisory                 WSA-2026-0007
------------------------------------------------------------------------

Date reported           : November 18, 2026
Advisory ID             : WSA-2026-0007
WebKitGTK Advisory URL  : https://webkitgtk.org/security/WSA-2026-0007.html
WPE WebKit Advisory URL : https://wpewebkit.org/security/WSA-2026-0007.html
CVE identifiers         : CVE-2026-112599, CVE-2026-112615,
                          CVE-2026-112623, CVE-2026-112626,
                          CVE-2026-112637, CVE-2026-112639,
                          CVE-2026-112640, CVE-2026-112651,
                          CVE-2026-112653, CVE-2026-112654,
                          CVE-2026-112655, CVE-2026-112666,
                          CVE-2026-112673, CVE-2026-112684,
                          CVE-2026-112686, CVE-2026-112693,
                          CVE-2026-112695, CVE-2026-113897,
                          CVE-2026-113901, CVE-2026-113903,
                          CVE-2026-113904, CVE-2026-86922,
                          CVE-2026-86973, CVE-2026-86974,
                          CVE-2026-86985, CVE-2026-86986.

Several vulnerabilities were discovered in WebKitGTK and WPE WebKit.

CVE-2026-112599
    Versions affected: WebKitGTK and WPE WebKit before 2.54.0.
    Credit to Avinash Kumar Thapa & Jay Kaushik Patel.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process crash. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 317465

CVE-2026-112615
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Chris Rohlf with Anthropic Research.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process termination. Description: A use-after-free issue
    was addressed with improved memory management.
    WebKit Bugzilla: 324735

CVE-2026-112623
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to pwn2addr, Lily Cohl (@GenericCoding).
    Impact: Processing maliciously crafted web content may lead to
    arbitrary code execution. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 323265

CVE-2026-112626
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Euntae Jang, Luke Francis (@lukefr09), Shubham Chaskar, Josef Korbel
    (Citadelo).
    Impact: Processing maliciously crafted web content may lead to
    arbitrary code execution. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 328141

CVE-2026-112637
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Chris Rohlf with Anthropic Research, 은태 장.
    Impact: Processing maliciously crafted web content may lead to
    arbitrary code execution. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 323377

CVE-2026-112639
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Luke Francis (@lukefr09).
    Impact: Processing maliciously crafted web content may lead to
    arbitrary code execution. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 322743

CVE-2026-112640
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to an anonymous researcher.
    Impact: Processing maliciously crafted web content may lead to
    memory corruption. Description: A use-after-free issue was addressed
    with improved memory management.
    WebKit Bugzilla: 324262

CVE-2026-112651
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Euntae Jang.
    Impact: Processing maliciously crafted web content may lead to
    arbitrary code execution. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 322120

CVE-2026-112653
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Malik M. (@m411k_).
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process termination. Description: A use-after-free issue
    was addressed with improved memory management.
    WebKit Bugzilla: 323227

CVE-2026-112654
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Charles Kern.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process termination. Description: A use-after-free issue
    was addressed with improved memory management.
    WebKit Bugzilla: 321934

CVE-2026-112655
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Euntae Jang.
    Impact: Processing maliciously crafted web content may lead to
    arbitrary code execution. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 324150

CVE-2026-112666
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Luke Francis (@lukefr09).
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process termination. Description: A use-after-free issue
    was addressed with improved memory management.
    WebKit Bugzilla: 321669

CVE-2026-112673
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Myungyong Lee.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process termination. Description: A type confusion issue
    was addressed with improved state handling.
    WebKit Bugzilla: 322033

CVE-2026-112684
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Gia Bui (@yabeow) from Calif.io.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process crash. Description: This issue was addressed
    through improved state management.
    WebKit Bugzilla: 328132

CVE-2026-112686
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to an anonymous researcher.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process termination. Description: A race condition was
    addressed with improved locking.
    WebKit Bugzilla: 323986

CVE-2026-112693
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to 은태 장.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected Safari crash. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 328131

CVE-2026-112695
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Josef Korbel (Citadelo), Luke Francis (@lukefr09).
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process termination. Description: A use-after-free issue
    was addressed with improved memory management.
    WebKit Bugzilla: 322671

CVE-2026-113897
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Luke Francis, Jackson Kuja.
    Impact: A remote attacker may be able to break out of Web Content
    sandbox. Description: This issue was addressed by removing the
    vulnerable code.
    WebKit Bugzilla: 328129

CVE-2026-113901
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Kwak Kiyong (@Pwnkai23), Song Nuri.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process crash. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 323096

CVE-2026-113903
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Eddy Tsalolikhin, OpenAI Codex Security - Amy Burnett, Lily Cohl
    (@GenericCoding).
    Impact: Processing maliciously crafted web content may lead to
    unexpected memory modification. Description: A use-after-free issue
    was addressed with improved memory management.
    WebKit Bugzilla: 321652

CVE-2026-113904
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Lily Cohl (@GenericCoding), Do Young Park (adawn), MYUNGYONG LEE,
    Luke Francis (@lukefr09), Shubham Chaskar, Kwak Kiyong, Song Nuri.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process crash. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 328114

CVE-2026-86922
    Versions affected: WebKitGTK and WPE WebKit before 2.54.0.
    Credit to Nathaniel Oh (@calysteon), Kwak Kiyong / kakaogames.
    Impact: Processing maliciously crafted web content may lead to
    arbitrary code execution. Description: A type confusion issue was
    addressed with improved state management.
    WebKit Bugzilla: 308231

CVE-2026-86973
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Narendra Singh (@_3P1C), an anonymous researcher.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process crash. Description: An out-of-bounds read was
    addressed with improved bounds checking.
    WebKit Bugzilla: 323079

CVE-2026-86974
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Hossein Lotfi (@hosselot) of TrendAI Zero Day Initiative.
    Impact: Processing maliciously crafted web content may lead to
    memory corruption. Description: A type confusion issue was addressed
    with improved checks.
    WebKit Bugzilla: 321609

CVE-2026-86985
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to Pasquale Scola.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected process crash. Description: This issue was addressed with
    improved input validation.
    WebKit Bugzilla: 318522

CVE-2026-86986
    Versions affected: WebKitGTK and WPE WebKit before 2.54.3.
    Credit to an anonymous researcher.
    Impact: Processing maliciously crafted web content may lead to an
    unexpected Safari crash. Description: A use-after-free issue was
    addressed with improved memory management.
    WebKit Bugzilla: 318331

We recommend updating to the latest stable versions of WebKitGTK and WPE
WebKit. It is the best way to ensure that you are running safe versions
of WebKit. Please check our websites for information about the latest
stable releases.

Further information about WebKitGTK and WPE WebKit security advisories
can be found at: https://webkitgtk.org/security.html or
https://wpewebkit.org/security.

The WebKitGTK and WPE WebKit team,

```

**Attachment: [signature.asc](https://seclists.org/oss-sec/2026/q4/att-771/signature_asc.bin)**  
*Description:*
