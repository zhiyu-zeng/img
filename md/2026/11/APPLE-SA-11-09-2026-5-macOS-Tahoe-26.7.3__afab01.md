---
title: APPLE-SA-11-09-2026-5 macOS Tahoe 26.7.3
source: https://seclists.org/fulldisclosure/2026/Nov/28
source_host: seclists.org
clip_date: 2026-11-19T08:21:06+08:00
trace_id: 8cbbcfdd-855b-4f84-bf10-8c667cff83ec
content_hash: e43fc4efbc7a9523f4fc5d937a537fe0e495b3c70b57e8bb3a44008e1e3f0e3b
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
notion_page_id: 41d75244-d011-8119-86ff-c6eb9dd714b0
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

## APPLE-SA-11-09-2026-5 macOS Tahoe 26.7.3

* * *

*From*: Apple Product Security via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Mon, 09 Nov 2026 16:06:27 -0800  

* * *

```
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

APPLE-SA-11-09-2026-5 macOS Tahoe 26.7.3

macOS Tahoe 26.7.3 addresses the following issues.
Information about the security content is also available at
https://support.apple.com/149719.

Apple maintains a Security Releases page at
https://support.apple.com/100100 which lists recent
software updates with security advisories.

AirPlay
Available for: macOS Tahoe
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113968: Apple

Bluetooth
Available for: macOS Tahoe
Impact: An attacker in Bluetooth range may be able to corrupt process
memory
Description: A use-after-free issue was addressed with improved memory
management.
CVE-2026-113970: Apple

brotli
Available for: macOS Tahoe
Impact: Processing maliciously crafted input may lead to memory
corruption
Description: An out-of-bounds write issue was addressed with improved
input validation.
CVE-2026-111497

CoreUtils
Available for: macOS Tahoe
Impact: A malicious Bluetooth device may be able to establish a pairing
without user interaction
Description: This issue was addressed with improved checks.
CVE-2026-113965: Apple

CoreUtils
Available for: macOS Tahoe
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts and pair with a device without user
interaction
Description: A logic issue was addressed with improved state management.
CVE-2026-113964: an anonymous researcher

Messages
Available for: macOS Tahoe
Impact: A user added to an iMessage group may be able to access messages
sent before they joined
Description: This issue was addressed by removing the vulnerable code.
CVE-2026-113960: an anonymous researcher

Messages
Available for: macOS Tahoe
Impact: A remote attacker may be able to join an iMessage group chat and
receive its messages
Description: An authorization issue was addressed with improved
validation.
CVE-2026-113961: an anonymous researcher

rapportd
Available for: macOS Tahoe
Impact: An attacker on the same network may be able to bypass the rate
limit on AirPlay pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113969: Apple

macOS Tahoe 26.7.3 may be obtained from the Mac App Store or
Apple's Software Downloads web site:
https://support.apple.com/downloads/

All information is also posted on the Apple Security Releases
web site: https://support.apple.com/100100.

This message is signed with Apple's Product Security PGP key,
and details are available at:
https://www.apple.com/support/security/pgp/

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCAAdFiEEhjkl+zMLNwFiCT1o4Ifiq8DH7PUFAmryPGsACgkQ4Ifiq8DH
7PX0RhAAgCxbkOSlvX+HM53rlKreDXsbyKKa2Uo4eBmJxZJq2xa/c1MmEjtmGy7x
EtjZKmmgdjzul60yfUo6U4tMHSFBkxHAzNqXT4fPnWWNuCHXVoPijkPAeJpMdSj1
5Ph5faMKhkJI8XYylVhGTTnCk8R0tyAn4lbb22Hq+PJiJmmZt3j76C+JwwAjzBNS
kgfTjEKqN7QeEADqX8UuH01szer9vcPoOw3LhgKavE5r07j1o8y26gKuQuQBcDwn
+tJft6/HCHw+BVnPv+2Fr2k8aRxUod/7VDinv0WFdPic3GkgVeCKVUxh9awVCgTc
/isuj1OQ9plvXhHhxb9IL97nZDjtfu5Ukfrmtpbyvw+V+mBLOWS9fZJP8nMDTfFu
RcybFMC8hMObjVpG2RBDbplKJqCf/blAwgjmom9H8C7g8Do4KiJO9T7TjNms9vfg
V7SGoXdfTfTQ4sDUIYqi9fntxVWDOQ6AytGiAuFwcWVKZtNutv9laUphz+u3PsV6
TDOI4nLxkj0rRj7x4nzLKX+eO11xSZEdKrMUX/2ba1/iuGHIOElqLBkXwJ/Un18t
VR4P9qqKz4oaGnRyNePeas4qUdyaZSfpqq/vv963qMOTx4tPXvkXaLb2CGKJjIoW
jW7hpIqBp+DweBqHIigNl9glj9F/ogJBdEYz6wovmGDnIvXDzhE=
=Shzn
-----END PGP SIGNATURE-----

_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
