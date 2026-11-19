---
title: APPLE-SA-11-09-2026-8 watchOS 26.6.1
source: https://seclists.org/fulldisclosure/2026/Nov/31
source_host: seclists.org
clip_date: 2026-11-19T08:21:46+08:00
trace_id: b80723eb-e600-4af6-9106-e4b5b4b07fbc
content_hash: fad4893a01d254b7e6ac4d86f11808d1521fb032ab633b3e4d47809d1166521f
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
notion_page_id: 41d75244-d011-8171-b6a8-cdfd8bf7328f
ioc:
  cves:
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

## APPLE-SA-11-09-2026-8 watchOS 26.6.1

* * *

*From*: Apple Product Security via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Mon, 09 Nov 2026 16:21:36 -0800  

* * *

```sql
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

APPLE-SA-11-09-2026-8 watchOS 26.6.1

watchOS 26.6.1 addresses the following issues.
Information about the security content is also available at
https://support.apple.com/149723.

Apple maintains a Security Releases page at
https://support.apple.com/100100 which lists recent
software updates with security advisories.

AirPlay
Available for: Apple Watch Series 6, Apple Watch Series 7, Apple Watch
Series 8, Apple Watch SE (2nd generation), and Apple Watch Ultra
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts
Description: A logic issue was addressed with improved state management.
CVE-2026-113968: Apple

Bluetooth
Available for: Apple Watch Series 6, Apple Watch Series 7, Apple Watch
Series 8, Apple Watch SE (2nd generation), and Apple Watch Ultra
Impact: An attacker in Bluetooth range may be able to corrupt process
memory
Description: A use-after-free issue was addressed with improved memory
management.
CVE-2026-113970: Apple

CoreUtils
Available for: Apple Watch Series 6, Apple Watch Series 7, Apple Watch
Series 8, Apple Watch SE (2nd generation), and Apple Watch Ultra
Impact: A malicious Bluetooth device may be able to establish a pairing
without user interaction
Description: This issue was addressed with improved checks.
CVE-2026-113965: Apple

CoreUtils
Available for: Apple Watch Series 6, Apple Watch Series 7, Apple Watch
Series 8, Apple Watch SE (2nd generation), and Apple Watch Ultra
Impact: An attacker in Bluetooth range may be able to bypass the rate
limit on pairing code attempts and pair with a device without user
interaction
Description: A logic issue was addressed with improved state management.
CVE-2026-113964: an anonymous researcher

rapportd
Available for: Apple Watch Series 6, Apple Watch Series 7, Apple Watch
Series 8, Apple Watch SE (2nd generation), and Apple Watch Ultra
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

iQIzBAEBCAAdFiEEhjkl+zMLNwFiCT1o4Ifiq8DH7PUFAmryYmsACgkQ4Ifiq8DH
7PUIZg//d2qdsd9FczlHYGX+r0EcVh7ODCRFN7k53cyBhMnY8MQRf0jZD7cXms/n
y5cSB3ihdcq6F+lrnASQtA3wtrtuqNdlbtoMuim9y25n4ipLpIdqGgWFQvTrTo1u
ZCRG/Sc6BnK65B47CwpkPSSt92TyV5LQhM9scyW4dsOCAdZMUuaj8Zcw6hLVxefd
KSClkNwRoglVg578VKxWHDU4HD2SZcLj9jKlN4m7FBG9+2dc59CSOFZ3+7xo19Q1
Rn3ZF1PXDc2AUQS+eiA5P0nOlB1sjKofIVwuXchSQ/Ulmo6m4IGij++qK+8tU1N7
N6Z6SQhjEy+MMa/7V/QvpZTSyP4Jnjoj2+bkRNt6Tf7TMIHqcybfg1OHyqUhSdyB
8PsUrT8cOJEneiKXOgbdDRwf8PMHiIszm+w8XYriYIEDWBtCkJsZQTUgVGp2B15W
qhZdVniwkz11avlMYyWVZUOofag6gI8LfWHBkWEVmiGURiQAyT7eLp1Wf5yaeGXj
E2bU3KcO5b8HQeVNtDw2JeRMZ91SxLEav3q7Ac7HzHBtZZfM6z6yqcJdzLdft+4C
imCemy7syDVZOpze6v+3v+9300EqdKSRSBXhlsDDAusNDg9vy7CHLWTN+JDqguMW
SvFsoP1K2Zfx9s1PGoS77aAqbPXAgUa4E00OEpjbKZbu0AwZEyI=
=FTiO
-----END PGP SIGNATURE-----

_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
