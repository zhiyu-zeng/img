---
title: APPLE-SA-11-12-2026-1 HomeView Software Version 27.2
source: https://seclists.org/fulldisclosure/2026/Nov/33
source_host: seclists.org
clip_date: 2026-11-19T08:22:13+08:00
trace_id: 935f78da-97e2-4eb3-a15a-31bd27576ed5
content_hash: 6f34f3f8c474f7e76c353ceacc90563957737c0eb45a1501685cd3bff033fe69
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
notion_page_id: 41d75244-d011-81f4-97ac-d9a8240db91a
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

## APPLE-SA-11-12-2026-1 HomeView Software Version 27.2

* * *

*From*: Apple Product Security via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Thu, 12 Nov 2026 16:38:29 -0800  

* * *

```
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

APPLE-SA-11-12-2026-1 HomeView Software Version 27.2

HomeView Software Version 27.2 addresses the following issues.
Information about the security content is also available at
https://support.apple.com/149851.

Apple maintains a Security Releases page at
https://support.apple.com/100100 which lists recent
software updates with security advisories.

AirPlay
Available for: Apple HomeView
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113968: Apple

App Intents
Available for: Apple HomeView
Impact: An app may be able to access sensitive user data
Description: An authorization issue was addressed with improved state
management.
CVE-2026-113963: László Várady

Bluetooth
Available for: Apple HomeView
Impact: An attacker in Bluetooth range may be able to corrupt process
memory
Description: A use-after-free issue was addressed with improved memory
management.
CVE-2026-113970: Apple

brotli
Available for: Apple HomeView
Impact: Processing maliciously crafted input may lead to memory
corruption
Description: An out-of-bounds write issue was addressed with improved
input validation.
CVE-2026-111497

CoreUtils
Available for: Apple HomeView
Impact: A malicious Bluetooth device may be able to establish a pairing
without user interaction
Description: This issue was addressed with improved checks.
CVE-2026-113965: Apple

CoreUtils
Available for: Apple HomeView
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts and pair with a device without user
interaction
Description: A logic issue was addressed with improved state management.
CVE-2026-113964: an anonymous researcher

Messages
Available for: Apple HomeView
Impact: A remote attacker may be able to join an iMessage group chat and
receive its messages
Description: An authorization issue was addressed with improved
validation.
CVE-2026-113961: an anonymous researcher

Messages
Available for: Apple HomeView
Impact: A user added to an iMessage group may be able to access messages
sent before they joined
Description: This issue was addressed by removing the vulnerable code.
CVE-2026-113960: an anonymous researcher

rapportd
Available for: Apple HomeView
Impact: An attacker on the same network may be able to bypass the rate
limit on AirPlay pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113969: Apple

Apple HomeView automatically installs software updates by default.
Instructions on how to manually install Apple HomeView software
updates are available at https://support.apple.com/149085.

To check the software version on your Apple HomeView, open the
Settings app and choose General > About.

All information is also posted on the Apple Security Releases
web site: https://support.apple.com/100100.

This message is signed with Apple's Product Security PGP key,
and details are available at:
https://www.apple.com/support/security/pgp/

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCAAdFiEEhjkl+zMLNwFiCT1o4Ifiq8DH7PUFAmr2VR4ACgkQ4Ifiq8DH
7PXqHA/9Ef7XNcYYv5FLb9sisFWQaoBXK3Ep1B0PQq7hY9bOSL9vAzJX0VoXGt5j
ju5d158WueSVKCzFcnsFp8FUpk0DlB+cABVGenZd4x2YO4gdSHK1d6QqMFCvwrwr
CheKrSRxvu2R+vBf1J9RzTg/zrSp//Svo2fWcVAsku44nGtLvDRPnR9cozxV84Tg
jgh6FQIVK/m7yFNWQeuOnMDhqaE35mqjXXYOo+6TAdZb89n0TUk2BG+OBk7j5bC9
+ZPc623+eA38O4aB9GB+U1ZvdDs+/UeZLEViTn/ei+BlAmRNoi8neej/siC6zU7j
Rk/m/u9XJJcMplw/WWFJZ38QLN+4SnGTZrTr9Mi7WN3CPIzFtc9V4n812lTapbpI
10S7y1PPsZsLMwQ2shdyn2vhYiJsTRfeHZkBirnA+ubDmKNzvDpkpidjCh4TdXNp
VhV9uE6m+meTXjSuQhavWp8D8qAYUveh2j9rd1nSqx8VPA5Dt6UshK7gEmFNn3Lc
M0oEXAgKZRF6/oihJJlVLbk7JtPyuidELWFAYYpyY2rUMwoEmjMhqaRrUp6YbCNf
XHOECOXADUAi4qcAgmFNKrzGu97BiOWxRIGksaTf18eQzgMFa2tWf1OPwjm2zNuS
KSdJ1urWakp7DkQ6vb9y9gnQ8MfqmgfFNggb+4raY2tOw+Uqvms=
=uLXd
-----END PGP SIGNATURE-----

_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
