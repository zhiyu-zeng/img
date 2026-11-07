---
title: "SEC Consult SA-20261104-0 :: Improper device certificate validation enables AiTM attacks in Siemens SICAM Toolbox II device communication"
source: https://seclists.org/fulldisclosure/2026/Nov/12
source_host: seclists.org
clip_date: 2026-11-08T03:18:31+08:00
trace_id: fcba5bd7-82fa-4117-9803-466713ec0acc
content_hash: d7d3b0d66383a3bea7cdd8624cef939ddbd02481477de49dc25e607f419b3250
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
notion_page_id: 41175244-d011-8164-a77a-d5e295801827
ioc:
  cves:
    - CVE-2024-31853
    - CVE-2024-31854
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Full Disclosure mailing list archives

## SEC Consult SA-20261104-0:: Improper device certificate validation enables AiTM attacks in Siemens SICAM Toolbox II device communication

* * *

*From*: SEC Consult Vulnerability Lab via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Wed, 4 Nov 2026 08:24:01 +0000  

* * *

```yaml
SEC Consult Vulnerability Lab Security Advisory < 20261104-0 >
=======================================================================
              title: Improper device certificate validation enables AiTM attacks
            product: Siemens SICAM Toolbox II device communication
 vulnerable version: <V07.11
      fixed version: V07.11
         CVE number: CVE-2024-31853, CVE-2024-31854
             impact: High
           homepage:https://www.siemens.com/en-us/products/sicam/toolbox-ii/
              found: 2023-10-16
                 by: Stefan Viehböck
                     Constantin Schieber-Knöbl (Office Vienna)
                     SEC Consult Vulnerability Lab

                     An integrated part of SEC Consult, an Atos business
                     Europe | Asia

                     https://www.sec-consult.com

=======================================================================

Vendor description:
-------------------
"Siemens SICAM Toolbox II - Engineering software for SICAM RTUs.
SICAM TOOLBOX II provides all functions for integrated and standard
engineering throughout the entire plant, e.g.: Data collection, data
modeling, configuration, and parameterization. Engineering of process
information for the automation and central control-room systems.
SICAM TOOLBOX II is an ideal tool for plants and systems of all sizes."

Source:https://www.siemens.com/global/en/products/energy/energy-automation-and-smart-grid/substation-automation/engineering-software-for-sicam-rtus-sicam-toolbox-ii.html


Business recommendation:
------------------------
The vendor provides a patched version V07.11 or higher since July 2025.

SEC Consult highly recommends to perform a thorough security review of the product
conducted by security professionals to identify and resolve potential further
security issues.


Vulnerability overview/description:
-----------------------------------
1) Improper device certificate validation enables AiTM attacks (CVE-2024-31853, CVE-2024-31854)
The SICAM Toolbox II connects with supported devices via an HTTPS connection
(TCP port 443, TLS1.2). The Toolbox II software uses a hard-coded client
certificate issued by the same Siemens CA when connecting to a device. Each
device uses a device-specific certificate issued by a Siemens CA
("SICAM1703-Access-V1") as a server certificate. The certificate is
generated/signed during the production process. The common name is the device
serial number.

Due to a vulnerability in the certificate validation during the TLS connection,
an attacker can perform an adversary-in-the-middle-attack.

The Toolbox II software only checks if the certificate was issued by the
trusted CA, but does not check if the certificate is actually issued to the target
device (e.g. by checking the certificate common name against an expected
value). It is even possible to use the hard-coded Toolbox II client certificate
instead of an actual device-specific certificate.

This attack can be used to steal RTU connection passwords, process data or modify
the device configuration.


Proof of concept:
-----------------
1) Improper device certificate validation enables AiTM attacks (CVE-2024-31853, CVE-2024-31854)
An attacker requires the private key of any certificate issued by the
"SICAM1703-Access-V1" CA for successful exploitation.

The most simple way to exploit the vulnerability is to extract the
certificate/private key pair from the Toolbox II software. The P12 container
can be found in the satzp.exe executable (located in /EMII/BIN/). The P12 file
is stored in obfuscated form and de-obfuscated at runtime when establishing new
TLS connections. Furthermore the P12 container is protected by a passphrase which
is stored in obfuscated form as well.

Unlike a regular device-specific certificate, the common name of this
certificate is "ToolboxII" and the extended key usage is "TLS Web Client
Authentication".

Alternatively an attacker could also extract a device-specific certificate
private key from a device (from the VaultIC chip).

Below is the Toolbox II client certificate and the corresponding private key
(redacted).

Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number: 2 (0x2)
        Signature Algorithm: sha256WithRSAEncryption
        Issuer: C = DE, ST = Deutschland, L = Berlin, O = Siemens AG, OU = Energy Automation, CN = SICAM1703-Access-V1
        Validity
            Not Before: Jan  1 01:01:01 2011 GMT
            Not After : Dec 31 23:59:59 9999 GMT
        Subject: C = DE, ST = Deutschland, L = Berlin, O = Siemens AG, OU = Energy Automation, CN = ToolboxII
        Subject Public Key Info:
            Public Key Algorithm: rsaEncryption
                RSA Public-Key: (2048 bit)
                Modulus:
                    00:eb:56:a3:40:86:72:42:42:ca:1c:6c:25:41:11:
                    09:1d:20:ad:79:71:14:94:5c:02:a0:95:a6:ce:26:
                    1f:30:e2:21:9e:39:30:66:35:0c:df:77:e5:60:0b:
                    76:89:66:4a:08:f1:27:65:84:fc:d9:f1:b0:a3:b4:
                    4b:cf:dc:30:da:93:2b:74:e8:ac:3e:c5:5b:00:dd:
                    a9:03:79:f6:38:c5:1a:26:87:51:dd:1c:ad:72:b6:
                    c2:97:4c:62:f1:82:aa:86:e7:79:c9:82:b9:53:5b:
                    8d:40:26:76:1d:b0:03:2f:ce:ec:6e:f2:4a:af:79:
                    f3:e1:67:8b:c0:52:3b:f1:3e:dc:0d:8f:a4:f8:20:
                    e5:92:e3:ff:97:2b:34:a8:90:2c:79:42:3a:d0:e8:
                    ff:0d:d0:98:64:a8:5f:76:5f:e3:d8:bd:3e:85:3d:
                    49:33:ab:ae:54:5c:2a:2d:70:d0:95:3f:aa:cb:2d:
                    bf:34:f3:a2:f9:ae:17:a9:97:8f:a3:e2:ad:ad:f2:
                    ab:55:57:5b:04:56:b8:26:c3:fc:04:81:c9:ea:f5:
                    83:34:25:4a:22:9e:d5:73:6e:a4:d4:96:5b:65:3f:
                    cc:9d:97:df:6e:62:49:ae:a4:f2:4a:28:04:65:7d:
                    3d:7a:af:ba:69:49:75:32:a0:51:f0:93:69:fd:da:
                    eb:d1
                Exponent: 65537 (0x10001)
        X509v3 extensions:
            X509v3 Subject Alternative Name:
                email:support.energy () siemens com
            X509v3 Key Usage: critical
                Digital Signature, Key Encipherment, Data Encipherment
            X509v3 Extended Key Usage: critical
                TLS Web Client Authentication
    Signature Algorithm: sha256WithRSAEncryption
         21:15:68:6e:5c:34:80:a7:95:d5:a9:fa:62:64:6f:16:63:c5:
         8f:d6:42:c3:d3:dc:41:b4:98:e1:9c:13:47:d0:c7:c6:6c:66:
         a5:27:1e:b2:f1:99:5b:17:cc:63:78:2e:d5:26:84:8a:58:68:
         81:ee:f9:4f:0a:46:09:ec:23:77:e2:d6:f9:51:31:80:34:c3:
         9f:e5:45:01:e4:e9:5e:2e:94:08:ea:80:7b:1b:25:01:95:32:
         5c:6b:5b:30:8c:a5:5c:e4:b2:99:2a:83:22:ee:82:55:6e:d6:
         38:57:8e:37:54:53:89:03:8d:1a:26:2c:15:a2:d9:6f:88:c5:
         b0:a4:4b:e8:85:43:9d:25:c1:f4:eb:c0:b0:14:d0:7f:32:d7:
         d1:54:34:28:7d:a7:59:ff:35:25:9f:33:df:18:8f:1f:74:cd:
         c2:51:a0:06:35:d2:4d:c5:c3:b2:3e:b4:b0:05:fb:30:d1:c1:
         44:44:84:d6:90:ce:24:b3:2f:a4:4a:8b:d0:04:11:50:22:16:
         8e:39:1f:53:1d:e2:73:e0:c7:7b:2a:3a:4d:6b:83:e8:38:33:
         a9:10:e8:f0:1d:42:d2:54:67:3b:14:7a:03:48:16:a3:cd:7b:
         96:20:7f:de:cf:fc:ee:c6:37:e1:29:10:61:4f:22:de:46:cf:
         d1:0d:8f:5a
-----BEGIN CERTIFICATE-----
MIIDyzCCArOgAwIBAgIBAjANBgkqhkiG9w0BAQsFADCBgzELMAkGA1UEBhMCREUx
FDASBgNVBAgTC0RldXRzY2hsYW5kMQ8wDQYDVQQHEwZCZXJsaW4xEzARBgNVBAoT
ClNpZW1lbnMgQUcxGjAYBgNVBAsTEUVuZXJneSBBdXRvbWF0aW9uMRwwGgYDVQQD
ExNTSUNBTTE3MDMtQWNjZXNzLVYxMCIYDzIwMTEwMTAxMDEwMTAxWhgPOTk5OTEy
MzEyMzU5NTlaMHkxCzAJBgNVBAYTAkRFMRQwEgYDVQQIEwtEZXV0c2NobGFuZDEP
MA0GA1UEBxMGQmVybGluMRMwEQYDVQQKEwpTaWVtZW5zIEFHMRowGAYDVQQLExFF
bmVyZ3kgQXV0b21hdGlvbjESMBAGA1UEAxMJVG9vbGJveElJMIIBIDALBgkqhkiG
9w0BAQEDggEPADCCAQoCggEBAOtWo0CGckJCyhxsJUERCR0grXlxFJRcAqCVps4m
HzDiIZ45MGY1DN935WALdolmSgjxJ2WE/NnxsKO0S8/cMNqTK3TorD7FWwDdqQN5
9jjFGiaHUd0crXK2wpdMYvGCqobnecmCuVNbjUAmdh2wAy/O7G7ySq958+Fni8BS
O/E+3A2PpPgg5ZLj/5crNKiQLHlCOtDo/w3QmGSoX3Zf49i9PoU9STOrrlRcKi1w
0JU/qsstvzTzovmuF6mXj6Pira3yq1VXWwRWuCbD/ASByer1gzQlSiKe1XNupNSW
W2U/zJ2X325iSa6k8kooBGV9PXqvumlJdTKgUfCTaf3a69ECAwEAAaNRME8wJQYD
VR0RBB4wHIEac3VwcG9ydC5lbmVyZ3lAc2llbWVucy5jb20wDgYDVR0PAQEBBAQD
AgSwMBYGA1UdJQEBAQQMMAoGCCsGAQUFBwMCMA0GCSqGSIb3DQEBCwUAA4IBAQAh
FWhuXDSAp5XVqfpiZG8WY8WP1kLD09xBtJjhnBNH0MfGbGalJx6y8ZlbF8xjeC7V
JoSKWGiB7vlPCkYJ7CN34tb5UTGANMOf5UUB5OleLpQI6oB7GyUBlTJca1swjKVc
5LKZKoMi7oJVbtY4V443VFOJA40aJiwVotlviMWwpEvohUOdJcH068CwFNB/MtfR
VDQofadZ/zUlnzPfGI8fdM3CUaAGNdJNxcOyPrSwBfsw0cFERITWkM4ksy+kSovQ
BBFQIhaOOR9THeJz4Md7KjpNa4PoODOpEOjwHULSVGc7FHoDSBajzXuWIH/ez/zu
xjfhKRBhTyLeRs/RDY9a
-----END CERTIFICATE-----

-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDrVqNAhnJCQsoc
bCVBEQkdIK15cRSUXAKglabOJh8w4iGeOTBmNQzfd+VgC3aJZkoI8SdlhPzZ8bCj
tEvP3DDakyt06Kw+xVsA3akDefY4xRomh1HdHK1ytsKXTGLxgqqG53nJgrlTW41A
[...]
L7bTzPviSAvMQwaa5i6vJXCvhfB6q05rYgs4i/1eWQKBgQCkSGpuCF/ZwhQZ3KmD
rM7CoHgy4j2rbItWkIYbq9J5mJh7wpdYknY2pdRAocSLERiiLErFKU+k4QKilts2
oXLGKMem7ZxxvNVhij1g6Ypqm2bKWWkUsbW5X3WwGmYsGzMzeg+BhhxNn39Gq3QO
PkcoHTu5hSDvo1Y+qNakl2+3Hg==
-----END PRIVATE KEY-----


Vulnerable / tested versions:
-----------------------------
The following version has been tested which was the latest version available
at the time of the test:
* 7.1.0.0

According to the vendor, all versions before V07.11 are affected.


Vendor contact timeline:
------------------------
2023-10-22: Contacting vendor throughproductcert () siemens com
2023-10-23: Siemens opens case #33071
2024-01-02: Siemens confirmed the vulnerability. Patch planned for Autumn 2024.
2024-04-03: Asking regarding fix timeline. Offering help in reviewing the new cert handling.
2024-04-05: Siemens split the advisory into two parts and plans to release them at end of 2024:
            CVE-2024-31853: Addresses the proper check of certificates
            CVE-2024-31854: Prevent AiTM attacks via certificate pinning created from first connect.
2024-11-29: Due to other fixes that have to be integrated into the software, there won't be a release
            this year. New release scheduled for June 2025.
2025-02-10: Requested update. No response.
2025-02-19: Requested update. No response.
2025-07-04: Siemens confirms that both parts of the advisory are now fixed. A Siemens security
            advisory release is planned for 8th July 2025.
2025-07-07: Siemens asks SEC Consult to review the credit section of their advisory so the
            correct people involved are present in the advisory.
2025-07-18: The people involved are communicated to Siemens; vendor advisory updated.
2025-07-18: Siemens releases SSA-183963 (https://cert-portal.siemens.com/productcert/html/ssa-183963.html)
2025-2026: Internal delays at SEC Consult, advisory got lost. No information from vendor as well.
2026-10-28: Informing Siemens about scheduled advisory release; no response.
2026-11-03: Attempting to contact vendor via LinkedIn, immediate response from one contact, tickets
            were somehow disconnected. Received feedback and confirmation for fixes.
2026-11-04: Coordinated publication of advisory.


Solution:
---------
The vendor has released software updates (V07.11 or higher) for the identified
security issues back in July 2025:
https://support.industry.siemens.com/cs/ww/en/view/109822197/

Further security advisory information from the vendor:
https://cert-portal.siemens.com/productcert/html/ssa-183963.html


Workaround:
-----------
None


Advisory URL:
-------------
https://sec-consult.com/vulnerability-lab/


~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

SEC Consult Vulnerability Lab
An integrated part of SEC Consult, an Atos business
Europe | Asia

About SEC Consult Vulnerability Lab
The SEC Consult Vulnerability Lab is an integrated part of SEC Consult, an
Atos business. It ensures the continued knowledge gain of SEC Consult in the
field of network and application security to stay ahead of the attacker. The
SEC Consult Vulnerability Lab supports high-quality penetration testing and
the evaluation of new offensive and defensive technologies for our customers.
Hence our customers obtain the most current information about vulnerabilities
and valid recommendation about the risk profile of new technologies.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Interested to work with the experts of SEC Consult?
Send us your applicationhttps://sec-consult.com/career/

Interested in improving your cyber security with the experts of SEC Consult?
Contact our local officeshttps://sec-consult.com/contact/
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Mail: security-research at sec-consult dot com
Web:https://www.sec-consult.com
Blog:https://blog.sec-consult.com
X:https://x.com/sec_consult

EOF Stefan Viehböck, Constantin Schieber-Knöbl / @2026

```

**Attachment: [smime.p7s](https://seclists.org/fulldisclosure/2026/Nov/att-12/smime_p7s.bin)**  
*Description:* S/MIME Cryptographic Signature

```
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/
```

* * *

### Current thread:

-   **SEC Consult SA-20261104-0:: Improper device certificate validation enables AiTM attacks in Siemens SICAM Toolbox II device communication** *SEC Consult Vulnerability Lab via Fulldisclosure (Nov 04)*
