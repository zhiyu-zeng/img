---
title: APPLE-SA-11-09-2026-7 watchOS 27.2.1
source: https://seclists.org/fulldisclosure/2026/Nov/30
source_host: seclists.org
clip_date: 2026-11-19T08:21:33+08:00
trace_id: 863ad4b1-a4a8-4d92-9281-af7dfca24b28
content_hash: a98b27f5594f07a6e8bf0501644e9fb9e459d8171ee581fbe25c71d68531a939
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
notion_page_id: 41d75244-d011-812b-a301-e6f83d0c62f5
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

## APPLE-SA-11-09-2026-7 watchOS 27.2.1

* * *

*From*: Apple Product Security via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Mon, 09 Nov 2026 16:21:11 -0800  

* * *

```
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

APPLE-SA-11-09-2026-7 watchOS 27.2.1

watchOS 27.2.1 addresses the following issues.
Information about the security content is also available at
https://support.apple.com/149722.

Apple maintains a Security Releases page at
https://support.apple.com/100100 which lists recent
software updates with security advisories.

AirPlay
Available for: Apple Watch Series 9 and later
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113968: Apple

App Intents
Available for: Apple Watch Series 9 and later
Impact: An app may be able to access sensitive user data
Description: An authorization issue was addressed with improved state
management.
CVE-2026-113963: László Várady

Bluetooth
Available for: Apple Watch Series 9 and later
Impact: An attacker in Bluetooth range may be able to corrupt process
memory
Description: A use-after-free issue was addressed with improved memory
management.
CVE-2026-113970: Apple

brotli
Available for: Apple Watch Series 9 and later
Impact: Processing maliciously crafted input may lead to memory
corruption
Description: An out-of-bounds write issue was addressed with improved
input validation.
CVE-2026-111497

CoreUtils
Available for: Apple Watch Series 9 and later
Impact: A malicious Bluetooth device may be able to establish a pairing
without user interaction
Description: This issue was addressed with improved checks.
CVE-2026-113965: Apple

CoreUtils
Available for: Apple Watch Series 9 and later
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts and pair with a device without user
interaction
Description: A logic issue was addressed with improved state management.
CVE-2026-113964: an anonymous researcher

Messages
Available for: Apple Watch Series 9 and later
Impact: A remote attacker may be able to join an iMessage group chat and
receive its messages
Description: An authorization issue was addressed with improved
validation.
CVE-2026-113961: an anonymous researcher

Messages
Available for: Apple Watch Series 9 and later
Impact: A user added to an iMessage group may be able to access messages
sent before they joined
Description: This issue was addressed by removing the vulnerable code.
CVE-2026-113960: an anonymous researcher

rapportd
Available for: Apple Watch Series 9 and later
Impact: An attacker on the same network may be able to bypass the rate
limit on AirPlay pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113969: Apple

Instructions on how to update your Apple Watch software are
available at https://support.apple.com/kb/HT204641

To check the version on your Apple Watch, open the Apple Watch app
on your iPhone and select "My Watch > General > About".

Alternatively, on your watch, select "My Watch > General > About".

All information is also posted on the Apple Security Releases
web site: https://support.apple.com/100100.

This message is signed with Apple's Product Security PGP key,
and details are available at:
https://www.apple.com/support/security/pgp/

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCAAdFiEEhjkl+zMLNwFiCT1o4Ifiq8DH7PUFAmryPJwACgkQ4Ifiq8DH
7PU57A/+MjEqUmgdUxHQBA0A3aAyuLUSmQ8jw0uXA7ujj3ZPZ79jnbgAQmgY5uxR
tCzp+9cvPdA5oHK1oK+/IOxhzIWQWV8K8DdSdCChKMM3IMK+L8YnBeo7upzcxQJj
OG3/nqlUpWESuK/UPhP+zaWXmzgudhSYtwso1RNQlsb0oLenfIuwK+Z23BENybbg
oAPv0pO7wwA4mwbTtsqrNWGUcw4bi+HL0mnkx+62gQfkktlolvcfy5CwM+wHcI/i
kEHxoDtxAHIWSO/qlNxoY8Ykba2PI0et1/87DRmduLVLcWUeARi4JuYiMzM2JGoo
TTWn/wp/RXAzIBFV1/kfX9fgLKTTMzEIjeM6hTAIPdt6RSoF4X9+iIXBhOI0HDWv
ovTg5ZLd483VI//YRaJQMF6309ExQJmaHun9CTlxRzJZmB1NcW1u8S0B6//lk/6Q
Iwgn9PlMH1ia/kFK45sU5IYO1Uyvel/2BjGL7VGnMyitryTV8gHOaES0jYryvxgR
KL6RDKrvBJSAXpSecVAdZcdjJe/PK2JtG30fnGSyrd/JqL4hdkDwCq5HPaRucAUf
wI7ygmrkauWN91MHyAtHlFaaXi+eBh3Xy3omYS/Bd/ARR/xTaj+C/pVZU3+heo0W
Tekk4XjsaVCDn2orf73El+Q6IohEhmtYqoLnGB1aFqkeE+YbMTY=
=EIIa
-----END PGP SIGNATURE-----

_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```
