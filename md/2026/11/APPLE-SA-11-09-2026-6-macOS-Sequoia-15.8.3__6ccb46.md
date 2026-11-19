---
title: APPLE-SA-11-09-2026-6 macOS Sequoia 15.8.3
source: https://seclists.org/fulldisclosure/2026/Nov/29
source_host: seclists.org
clip_date: 2026-11-19T08:21:19+08:00
trace_id: 08fe78b1-256a-4c93-9e9f-61bc090835eb
content_hash: a2333e41574632c98fd399d830cb3dfa8f9e0fd0bdf695ddfc3842e173f6fb6d
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
notion_page_id: 41d75244-d011-8158-97a2-dccf0c3a47a4
ioc:
  cves:
    - CVE-2026-111497
    - CVE-2026-113960
    - CVE-2026-113961
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

## APPLE-SA-11-09-2026-6 macOS Sequoia 15.8.3

* * *

*From*: Apple Product Security via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Mon, 09 Nov 2026 16:06:59 -0800  

* * *

```
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

APPLE-SA-11-09-2026-6 macOS Sequoia 15.8.3

macOS Sequoia 15.8.3 addresses the following issues.
Information about the security content is also available at
https://support.apple.com/149720.

Apple maintains a Security Releases page at
https://support.apple.com/100100 which lists recent
software updates with security advisories.

AirPlay
Available for: macOS Sequoia
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113968: Apple

Bluetooth
Available for: macOS Sequoia
Impact: An attacker in Bluetooth range may be able to corrupt process
memory
Description: A use-after-free issue was addressed with improved memory
management.
CVE-2026-113970: Apple

brotli
Available for: macOS Sequoia
Impact: Processing maliciously crafted input may lead to memory
corruption
Description: An out-of-bounds write issue was addressed with improved
input validation.
CVE-2026-111497

CoreUtils
Available for: macOS Sequoia
Impact: A malicious Bluetooth device may be able to establish a pairing
without user interaction
Description: This issue was addressed with improved checks.
CVE-2026-113965: Apple

CoreUtils
Available for: macOS Sequoia
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts and pair with a device without user
interaction
Description: A logic issue was addressed with improved state management.
CVE-2026-113964: an anonymous researcher

Messages
Available for: macOS Sequoia
Impact: A user added to an iMessage group may be able to access messages
sent before they joined
Description: This issue was addressed by removing the vulnerable code.
CVE-2026-113960: an anonymous researcher

Messages
Available for: macOS Sequoia
Impact: A remote attacker may be able to join an iMessage group chat and
receive its messages
Description: An authorization issue was addressed with improved
validation.
CVE-2026-113961: an anonymous researcher

rapportd
Available for: macOS Sequoia
Impact: An attacker on the same network may be able to bypass the rate
limit on AirPlay pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113969: Apple

macOS Sequoia 15.8.3 may be obtained from the Mac App Store or
Apple's Software Downloads web site:
https://support.apple.com/downloads/

All information is also posted on the Apple Security Releases
web site: https://support.apple.com/100100.

This message is signed with Apple's Product Security PGP key,
and details are available at:
https://www.apple.com/support/security/pgp/

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCAAdFiEEhjkl+zMLNwFiCT1o4Ifiq8DH7PUFAmryPH8ACgkQ4Ifiq8DH
7PVXgA//W5a4x+xuVhxU5xkLGd6EOAmJsHp6p2v00/1mHOT1Vbzv0mE9Z6oi3ZPX
eToAeFI0xryV6x2zVDm12NHpSVbOz86yjWH45+JnGc3J/9FPbTtGTZsw31Qa5sjK
NPHwAUs7KHPKHfgOg50QdWYl4S+3iiS26yEs8WleKYKZtVOPiG7spDDJShP0TEBC
NsWMlAnMShE2FubGU03P8i01ojGCWjblbBsoLg+XbSrBlJYZzze9BxombbAqdSuW
SiWEJEGu9/G0mLvtebbts65yjRM2eu7TaWL/Ud84u9+xCmQciZnfd6Kii0zf1eT9
8zydrj2dqF5Ogeb3i/PCdPhyGUdPmCvcE1j2L4awhP6SDHeVtltiCHUCIZ4wDhoW
V6XjG8NFdvTWux2RRteRTtE0jeRB8EP0HAwz18kv3/megarw1GmPTy2ubndupd3U
o4JoD/glOQvT6X0y74G78En3oLF+/hBiAfn0ifs9IuVf87wEAKu4K0iduX75z0bj
xayg4YW6y5xsNXcESSyvKLj4bkmoBBzk0xn8LwR+HVFd7s2Z+MpxGG6PCVfkhLtJ
WmMeUgwNqiBHa6KxuPCbZdQI9iBGnEIqQU4uBCikwB3x9YhASc+CK10zwPOYW58M
0H1EjIQoJqsXUHwoUqnX1yEHzoVvN/VVP+lAy0zgtNK8dDWJvxY=
=tmJ8
-----END PGP SIGNATURE-----

_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
