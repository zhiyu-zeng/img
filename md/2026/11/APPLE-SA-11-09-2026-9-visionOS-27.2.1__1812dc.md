---
title: APPLE-SA-11-09-2026-9 visionOS 27.2.1
source: https://seclists.org/fulldisclosure/2026/Nov/32
source_host: seclists.org
clip_date: 2026-11-19T08:21:59+08:00
trace_id: 9478ca57-ff09-486a-a9ec-ada6e476ef5a
content_hash: 621a64c00d41b9179e51b282065652a6c4822af4c34d83aca50f1ee9905b1d3d
status: synced
tags: []
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-819f-b93f-f6bd93c45005
ioc:
  cves:
    - CVE-2026-111497
    - CVE-2026-113960
    - CVE-2026-113961
    - CVE-2026-113963
    - CVE-2026-113964
    - CVE-2026-113965
    - CVE-2026-113968
    - CVE-2026-113969
    - CVE-2026-113970
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Full Disclosure mailing list archives

## APPLE-SA-11-09-2026-9 visionOS 27.2.1

* * *

*From*: Apple Product Security via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Mon, 09 Nov 2026 16:22:14 -0800  

* * *

```
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

APPLE-SA-11-09-2026-9 visionOS 27.2.1

visionOS 27.2.1 addresses the following issues.
Information about the security content is also available at
https://support.apple.com/149724.

Apple maintains a Security Releases page at
https://support.apple.com/100100 which lists recent
software updates with security advisories.

AirPlay
Available for: Apple Vision Pro (all models)
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113968: Apple

App Intents
Available for: Apple Vision Pro (all models)
Impact: An app may be able to access sensitive user data
Description: An authorization issue was addressed with improved state
management.
CVE-2026-113963: László Várady

Bluetooth
Available for: Apple Vision Pro (all models)
Impact: An attacker in Bluetooth range may be able to corrupt process
memory
Description: A use-after-free issue was addressed with improved memory
management.
CVE-2026-113970: Apple

brotli
Available for: Apple Vision Pro (all models)
Impact: Processing maliciously crafted input may lead to memory
corruption
Description: An out-of-bounds write issue was addressed with improved
input validation.
CVE-2026-111497

CoreUtils
Available for: Apple Vision Pro (all models)
Impact: A malicious Bluetooth device may be able to establish a pairing
without user interaction
Description: This issue was addressed with improved checks.
CVE-2026-113965: Apple

CoreUtils
Available for: Apple Vision Pro (all models)
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts and pair with a device without user
interaction
Description: A logic issue was addressed with improved state management.
CVE-2026-113964: an anonymous researcher

Messages
Available for: Apple Vision Pro (all models)
Impact: A remote attacker may be able to join an iMessage group chat and
receive its messages
Description: An authorization issue was addressed with improved
validation.
CVE-2026-113961: an anonymous researcher

Messages
Available for: Apple Vision Pro (all models)
Impact: A user added to an iMessage group may be able to access messages
sent before they joined
Description: This issue was addressed by removing the vulnerable code.
CVE-2026-113960: an anonymous researcher

rapportd
Available for: Apple Vision Pro (all models)
Impact: An attacker on the same network may be able to bypass the rate
limit on AirPlay pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113969: Apple

Instructions on how to update visionOS are available
at https://support.apple.com/kb/HT214009

To check the software version on your Apple Vision Pro,
open the Settings app and choose General > About.

All information is also posted on the Apple Security Releases
web site: https://support.apple.com/100100.

This message is signed with Apple's Product Security PGP key,
and details are available at:
https://www.apple.com/support/security/pgp/

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCAAdFiEEhjkl+zMLNwFiCT1o4Ifiq8DH7PUFAmryPNsACgkQ4Ifiq8DH
7PV7cw//XvsvQAHMfkXR35OLWtPJDXxcz0EXU+h8KhueWvnvpSX3HC/yzikobjcE
qC0hXySXbR51FmyucVfEkCqVmP4X1UHDNUUCW3OE/yCVGPKyoZtyVN0r2qbiZrDF
IkwIlNhbFy2FOlqsJcwwHCaMt5cwUeSkwxnkn0wgTpt33SEj2u98Vpqac4DZd+zk
BIXGtN8XvSQMgxDlxm/6NN76G5jdl4kIcBPPsOI9QISCYaTVby7ZfLwaRo8epphe
CtGLV7P9p4Hn5wSoZZeCtDSi3Qtmk3CkEOPDu+/pKQvGTXjFFDLtpfPadoo5aaGf
+wlSL5/4J+E0/QWQo9LoRBUb7N+cQ9ckbJPhdljWD8ug3npgfdAYz4HSpwisPc12
AE3LrsLPLyiP6EOp4QxVvaSkD3OlBqRIprZgeVQPCBpCg1STuY8atCgmnAgVzfiC
EuTvPrgngLED1yBZykWovVTAD6AFBlo7ldcUZC/k30A64rqf658bj2/TplPxYvxB
p0QZMbWVutDwaIViROjHo4djr706lVrNq8ZGBUyUc3DYi77/OMCXSYojb2/IVoFw
R8D0JImdBVb0MI+1EZ3q0TX6fZPnK6dD8daI9Kow7MIOGtkNRsJiCsbnkQKYS4ko
S+zCQ8GeuX244n5jO8Iunnk9j4dcgMj2AH/XRguaSSb3l0n1K2E=
=CIAD
-----END PGP SIGNATURE-----

_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
