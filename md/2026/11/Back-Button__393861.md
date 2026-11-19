---
title: Back Button
source: https://www.rapid7.com/blog/post/tr-spying-on-governments-no-malware-custom-webworms-toolkit-softether-bridge
source_host: www.rapid7.com
clip_date: 2026-11-20T02:21:30+08:00
trace_id: a3310014-4b5b-4ada-8d7c-6af9537078b7
content_hash: 29378169cc994bf23fa84098ab1bfa55d86e7bf157d8788a977ee2b43286310f
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-8186-86f2-de7d55b669d4
ioc: null
---

## Introduction

For a threat actor, the perfect malware is one they don’t have to write, and already does all they need. One example of this is shown by the China-aligned APT known as Webworm, which has been known to deploy the open-source SoftEther VPN into the networks of compromised governmental organizations to maintain low-profile, long-term access.

After this was publicly documented and defenders could keep an eye out for this tactic, the actor presumably started thinking of ways to make their covert access stealthier. In this post, we share our analysis of what we believe to be a so-far unknown custom SoftEther-based tool, which implements various tricks to hide itself from security tools, and which we attribute to Webworm with moderate confidence. We additionally provide guidance and tooling for detecting its presence on a system and extracting the configuration(s) associated with it.

## Technical analysis

To illustrate how the tool works, we will use the only public sample of this tool we are aware of, which can be found in our IoCs list (90e7…).

The sample is a Windows PE32+ file targeting the x64 architecture. Based on cleartext strings and constants in the binary, we identified it as a (modified) build of the SoftEther VPN Bridge executable, specifically version 4.44, build 9807. Similarly, the PDB path included in the executable reads C:\\Users\\Administrator\\Desktop\\SoftEtherVPN_Stable\\SoftEtherVPN_Stable\\SoftEtherVPN_Stable\\src\\DebugFiles\\pdb\\x64_Release\\vpnbridge.pdb. As such, the tool doesn’t hide its identity from reverse engineers, only external interactions.

The first and most trivial change the threat actor implements is in the PE metadata. Here we learn that the OriginalFileName of this binary is netcapa.exe, and it brands itself as “Network Monitor Software” published by a company named “Network Systems Solutions Inc.“. The only field unchanged against the stock SoftEther executable (vpnbridge_x64.exe) is the Version, which reads 4, 44, 0, 9807.

Next, we wanted to identify any functionality added or modified by the threat actor. The SoftEther bridge alone is a powerful tool to maintain remote access to a compromised network, but we wanted to know if perhaps there was a backdoor to give the threat actor direct command execution on the infected host. For that reason we checked out the corresponding tag in the public “SoftEtherVPN_Stable” repository on GitHub and compared it to the decompiled sample.

### Internal rebranding

The rebranding apparent in the exposed metadata extends into internal strings used in debug banners, service names, registry keys, the contents of the server’s HTTP 401 error page, or firewall rule names, where occurrences of “SoftEther VPN” are replaced by “NtMonitor VPN”.

However, the renaming is inconsistent; for example, the service name used by the entry point is still SEVPNBRIDGE, and many registry key paths still reference the “SoftEther Project”.

### Network stealth

Stock SoftEther VPN Mayaqua/Network.h defines HTTP endpoints used by the protocol:

```html
HTTP_VPN_TARGET   "/vpnsvc/vpn.cgi"
HTTP_VPN_TARGET2  "/vpnsvc/connect.cgi"
```

NtMonitor replaces these endpoints with much more innocent-sounding names, in particular:

```html
HTTP_VPN_TARGET   "/update/alive.cgi"
HTTP_VPN_TARGET2  "/update/picture.cgi"
```

A client initiating a connection to a SoftEther VPN server will send a handshake request to HTTP_VPN_TARGET2 along with a "watermark", i.e. a byte pattern proving that the client is speaking the correct VPN protocol. Otherwise, the server answers with a decoy HTTP response.

NtMonitor changes the upstream GIF watermark with a custom byte pattern (a truncated PNG file showing the Windows logo), so that stock SoftEther clients and servers cannot handshake with this build, and NtMonitor's own peers cannot be fingerprinted with the well-known stock GIF watermark.

### Embedded resource archive

As the threat actor probably realizes, a SoftEther resource archive named hamcore.se2, which sits next to the executables in the installation directory and is required to be present at runtime, provides a straightforward detection opportunity for unauthorized installations. We think that, for this exact reason, the actor chose to reduce the contents of this archive to a bare minimum, package the archive inside the bridge executable itself (as a PE resource), and implement a custom resource directory walk to load the archive at runtime. As a side effect, this increases the binary’s size by about 1.5 MB compared to the official build.

### Encrypted configuration

Another weak point (for the attacker) in stock SoftEther is that its configuration is stored on disk in plain text in a well-recognizable format. The actor changes its name from vpn_bridge.config to setting.conf and modifies the configuration loader to handle custom-encrypted files that start with the magic bytes RCEN in ASCII. The rest of the encrypted file has a simple format and includes the encryption key. A Python script to decrypt such files with the actor’s custom RC4-like cipher is [available](https://github.com/rapid7/Rapid7-Labs/tree/main/Malware%20Config%20Extractors/webworm_rcen_decrypt.py) on the Rapid7 Intelligence GitHub repository.

![Rapid7](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f89feb53c668b828.svg)

## Attribution and interpretation of findings

Beyond the changes described above, we did not identify any additional malware functionality. Clearly, the threat actor prioritizes stealth above raw capability. It seems like they methodically analyzed SoftEther’s detection surface and implemented counter-measures to all of the easy ways a detection engineer may target it. At the time of our analysis, only one anti-virus vendor detected the sample on VirusTotal, although it has been public since January.

This aligns well with the TTPs [previously reported](https://www.welivesecurity.com/en/eset-research/webworm-new-burrowing-techniques/) for Webworm by ESET, and such attribution is further supported by indicators in decrypted configurations Rapid7 Intelligence has access to. In all of the cases, the VPN is configured to bridge (“cascade”) a remote network into the local one; furthermore, in cases that were not likely deliberate tests, the remote IP address was located inside AS 20473 belonging to The Constant Company, LLC, which (also including its subsidiary, Vultr) has been associated with Webworm on many occasions in the past.

Considering this attribution, we can put together some important takeaways: Quite likely, we are looking at a new evolution in the tooling used by Webworm, a China-aligned APT whose activity is known to focus on governmental organizations, especially in Europe. Earlier this year, ESET already noted this group to shift away from custom malware to dual-use tools such as SoftEther VPN, but now we are observing a sort of hybrid of the two — stock SoftEther software that is not *trojanized*, but rebuilt from source in a way that erases much of its detection fingerprint.

## Detection guidance

To detect this particular variant of Webworm’s tooling, we provide a [list of IoCs](https://github.com/rapid7/Rapid7-Labs/tree/main/IOCs/Webworm_NtMonitor_IOCs.txt) and a [YARA ruleset](https://github.com/rapid7/Rapid7-Labs/tree/main/Yara/Webworm_NtMonitor.yar) on our public GitHub repository. If you have the ability to inspect TLS traffic in your organization, one of the most reliable detections you can deploy right now is to look for POST requests to /update/picture.cgi with Content-Type: image/jpeg and a request body starting with and 89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52 (initial bytes of the custom PNG watermark).

Although the samples we have seen all use the same NtMonitor branding internally (despite the PE metadata differing across samples), this is the easiest change for the threat actor to implement next. Similarly, the HTTP endpoints and watermark can be swapped out trivially. As such, we recommend defenders in the government sector to familiarize themselves with intrinsic SoftEther VPN behavior in order to stay one step ahead of when the threat actor decides to update the tool next.
