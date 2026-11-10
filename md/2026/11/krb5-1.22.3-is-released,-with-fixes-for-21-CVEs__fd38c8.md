---
title: krb5-1.22.3 is released, with fixes for 21 CVEs
source: https://seclists.org/oss-sec/2026/q4/618
source_host: seclists.org
clip_date: 2026-11-10T08:14:44+08:00
trace_id: d4ebb909-071f-4d24-afd2-65a714c9f07f
content_hash: 6023f4c4eddf33bfabc256ec68dd74527970c0813dd11a211df73eca2751f1b3
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
notion_page_id: 41475244-d011-81ca-8ad5-ee9f42812a4e
ioc:
  cves:
    - CVE-2026-107364
    - CVE-2026-107708
    - CVE-2026-107778
    - CVE-2026-107884
    - CVE-2026-111423
    - CVE-2026-112314
    - CVE-2026-112315
    - CVE-2026-112316
    - CVE-2026-112317
    - CVE-2026-112318
    - CVE-2026-112319
    - CVE-2026-112320
    - CVE-2026-112321
    - CVE-2026-112322
    - CVE-2026-112323
    - CVE-2026-118380
    - CVE-2026-119079
    - CVE-2026-40355
    - CVE-2026-40356
    - CVE-2026-71199
    - CVE-2026-71200
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## krb5-1.22.3 is released, with fixes for 21 CVEs

* * *

*From*: Alan Coopersmith <alan.coopersmith () oracle com>  
*Date*: Mon, 9 Nov 2026 15:54:42 -0800  

* * *

```
https://mailman.mit.edu/pipermail/kerberos-announce/2026q4/000212.html announces:
```

> ```swift
> The MIT Kerberos Team announces the availability of MIT Kerberos 5
> Release 1.22.3.  Please see below for a list of some major changes
> included, or consult the README file in the source tree for a more
> detailed list of significant changes.
> 
> RETRIEVING KERBEROS 5 RELEASE 1.22.3
> ====================================
> 
> You may retrieve the Kerberos 5 Release 1.22.3 source from the
> following URL:
> 
>            https://kerberos.org/dist/
> 
> The homepage for the krb5-1.22.3 release is:
> 
>            https://web.mit.edu/kerberos/krb5-1.23/
> 
> Further information about Kerberos 5 may be found at the following
> URL:
> 
>            https://web.mit.edu/kerberos/
> 
> and at the MIT Kerberos Consortium web site:
> 
>            https://www.kerberos.org/
> 
> Major changes in 1.22.3 (2026-11-09)
> ====================================
> 
> This is a bug fix release, with a focus on security issues discovered
> with the aid of large language models.  See
> https://web.mit.edu/kerberos/advisories/MITKRB5-SA-2026-001.txt for
> information on the risks of continuing to use unpatched releases.
> 
> * Fix a logic error when checking PAC server checksums
>    [CVE-2026-111423].
> 
> * Check for unkeyed checksums when validating CAMMAC verifiers
>    [CVE-2026-71199].
> 
> * Fix a loophole in the KDC's client authdata filtering which could
>    allow clients to include fake PAC and CAMMAC authdata values when
>    requesting service tickets.  These fake values would be rejected by
>    application servers, were it not for the two bugs noted above.
> 
> * Check for the lockdown_keys attribute when processing password
>    change protocol requests in kadmind [CVE-2026-107884].
> 
> * In libgssrpc, when processing RPC messages using the RPCSEC_GSS
>    flavor, use the verified service type included in the RPC request to
>    determine how to unwrap arguments and wrap return values, instead of
>    the unverified service type included during authentication
>    [CVE-2026-118380].
> 
> * In libgssrpc, disable the AUTH_GSSAPI server auth flavor unless the
>    "GSSRPC_ALLOW_AUTH_GSSAPI" environment variable is set.  AUTH_GSSAPI
>    is only needed for very old (pre-1.4) clients [CVE-2026-112322]
>    [CVE-2026-112323].
> 
> * Fix numerous null pointer deferences, read overruns, unbounded
>    memory allocations, and memory leaks that could be used as denial of
>    service attacks against the KDC, kadmind, application servers, or
>    client programs [CVE-2026-40355] [CVE-2026-40356] [CVE-2026-71200]
>    [CVE-2026-107364] [CVE-2026-107708] [CVE-2026-107778]
>    [CVE-2026-112314] [CVE-2026-112315] [CVE-2026-112316]
>    [CVE-2026-112317] [CVE-2026-112318] [CVE-2026-112319]
>    [CVE-2026-112320] [CVE-2026-112321] [CVE-2026-112323]
>    [CVE-2026-119079].
> 
> * Fix a client crash when a KKDCP proxy daemon closes the TLS session
>    without supplying any response data.
> 
> * Shut down kpropd gracefully when a termination signal is received,
>    when operating in incremental propagation mode.
> 
> * Detect when an incremental propagation update is applied to a
>    nonexistent principal; when this happens, force a full resync
>    instead of crashing.
> 
> * Fix a KDC crash when the LDAP KDB module loses its connection to the
>    LDAP server.
> 
> * Avoid a crash on macOS when the native API ccache type is used
>    before and after forking a process.
> 
> * When an application accepts a GSS context without asking for
>    delegated credentials, discard any credentials sent by the initiator
>    without parsing them first.
> 
> * On Windows, prevent buffer overflows when the KDC sends an
>    unexpectedly long prompt string via OTP preauthentication.
> 
> * On Windows, move the default per-machine krb5.ini location from
>    C:\ProgramData\MIT\Kerberos to C:\Program Files\MIT\Kerberos5, as
>    the former location could be pre-created by an unutrusted user
>    before KfW installation.
> 
> * On Windows, add error checking to kfwlogon to ensure that it does
>    not set ACLs on a cache file it did not create.
> 
> * On Windows, prevent several buffer overflows that could occur if an
>    application passes a large principal name to leashdll APIs.
> 
> * On Windows, prevent buffer overflows when the LSA cache contains
>    credentials with long principal name components.
> ```

```
https://web.mit.edu/kerberos/advisories/MITKRB5-SA-2026-001.txt advises:
```

> ```sql
> MITKRB5-SA-2026-001
> 
> MIT krb5 Security Advisory 2026-001
> Original release: 2026-11-09
> Last update: 2026-11-09
> 
> Topic: Multiple vulnerabilities fixed in patch 1.22.3
> 
> SUMMARY
> =======
> 
> Like many open source projects, MIT krb5 has faced greatly increased
> scrutiny over the past few months from researchers employing large
> language models.  As a result, release 1.22.3 fixes many more
> vulnerabilities than a typical MIT krb5 patch release.  This advisory
> discusses the combined impact of those vulnerabilities on unpatched
> components.
> 
> AUTHORIZATION BYPASS ATTACKS
> ============================
> 
> An authenticated attacker can bypass authentication indicator
> enforcement by requesting a service ticket with fake CAMMAC
> authorization data.  Updating to the 1.22.3 release on the KDC is
> sufficient to prevent this attack.
> 
> An authenticated attacker can bypass an application server's PAC
> authorization data checks by requesting a service ticket with a fake
> PAC.  Updating to the 1.22.3 release on either the KDC or the affected
> application server will prevent this attack.
> 
> An authenticated attacker with administrative privileges can bypass
> the lockdown_keys attribute by using the password change protocol
> instead of the kadmin protocol to modify a principal's keys.
> 
> The CVEs in this category include:
> 
> CVE-2026-71199
> CVE-2026-107884
> CVE-2026-111423
> 
> DENIAL OF SERVICE ATTACKS
> =========================
> 
> The KDC, kadmind, and GSS-API application servers are all vulnerable
> to denial of service attacks by unauthenticated attackers.  The CVEs
> in this category include:
> 
> CVE-2026-40355
> CVE-2026-40356
> CVE-2026-71200
> CVE-2026-107364
> CVE-2026-107708
> CVE-2026-107778
> CVE-2026-112314
> CVE-2026-112315
> CVE-2026-112316
> CVE-2026-112317
> CVE-2026-112318
> CVE-2026-112319
> CVE-2026-112320
> CVE-2026-112321
> CVE-2026-112322
> CVE-2026-112323
> CVE-2026-119079
> 
> GSS-RPC USE OF UNVERIFIED SERVICE TYPE
> ======================================
> 
> Application servers using libgssrpc with RPCSEC_GSS protection may be
> vulnerable to an active network attack that fools the server into
> disabling cryptographic protection of RPC arguments and return values.
> The primary component affected by this vulnerability is kadmind, which
> serves the kadm5 and iprop RPC protocols.
> 
> Using this vulnerability, an active network attacker on the path
> between a replica KDC and the primary KDC can cause kadmind to reveal
> the contents of an incremental update reply in plain text.  This
> update may contain sensitive Kerberos database material.  Any key
> information in the incremental update will be encrypted in the master
> key, but if the master password is not strong, a dictionary attack may
> reveal the unencrypted key data.  Updating to the 1.22.3 release on
> the primary kadmin server is sufficient to prevent this attack.
> 
> We believe that this vulnerability is not exploitable in the kadm5
> protocol, because the kadmin client makes an INIT remote procedure
> call before issuing any substantive RPCs.  Because only the server is
> fooled into disabling encryption, the client will abort the kadmin
> session when it tries to decode the INIT reply.  We also considered
> scenarios where an attacker replays a modified copy of a recorded
> kadmin session, but we believe that the replay cache and the use of
> subkeys prevent this variant of the attack.
> 
> The CVE in this category is CVE-2026-118380.
> 
> WINDOWS CLIENT VULNERABILITIES
> ==============================
> 
> Applications using leashdll are vulnerable to a buffer overflow
> (possibly leading to code execution) if the KDC supplies a very long
> prompt banner.  Exploitating this vulnerability may be impossible
> because only the FAST OTP preauth mechanism permits large prompt
> banners, and the leashdll APIs do not set a FAST armor cache.
> 
> If an application supplies principal names from an untrusted source to
> leashdll initial ticket functions (such as Leash_kinit_dlg()), an
> attacker could cause buffer overflows by supplying long names,
> possibly leading to code execution.
> 
> On a Windows host with untrusted users, an attacker could potentially
> trick kfwlogon into setting ACL rights on a file of the attacker's
> choice via a hard link.
> 
> On a Windows host with untrusted users, a user could create a krb5.ini
> file in the default per-machine location prior to Kerberos for Windows
> installation.  This file would then be used by other users, allowing
> code execution via module loading.
> 
> ACKNOWLEDGEMENTS
> ================
> 
> The following individuals and organizations contributed to the
> discovery of the vulnerabilities fixed in the 1.22.3 release:
> 
> Arthur Chan
> Rahul Hoysala
> Alexandru-Ionut Jipa
> Cem Onat Karagun
> David Korczynski
> Erin Liman
> Tristan Madani
> Alejandro Pacheco
> Julien Rische
> Moritz Theile
> Rickey Visinski
> 
> Ada Logics
> AISLE
> Anthropic
> AWS Security
> Deutsche Bank
> Red Hat
> Talence Security
> 
> REVISION HISTORY
> ================
> 
> 2026-11-09      original release
> 
> Copyright (C) 2026 Massachusetts Institute of Technology
> ```
