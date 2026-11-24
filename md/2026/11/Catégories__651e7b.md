---
title: Catégories
source: https://blog.randorisec.fr/passthesalt-2026/
source_host: blog.randorisec.fr
clip_date: 2026-11-24T10:57:52+08:00
trace_id: 14d11228-e384-4c02-932c-af6482998e0e
content_hash: b1e80d5fa2f1a30ad4d89d8005bc478ac9e9eea009efd3a9daa7f0ada7ef6c95
status: synced
tags: []
series: null
feed_source: RandoriSec·移动/漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42275244-d011-8183-951e-e4404a356852
ioc: null
---

### Riccardo Pagnozzi and Julien Reveret 8 min

This year again, RandoriSec was a sponsor of Pass the SALT, a small but high quality conference dedicated to free software and security.

Here are all the [slides](https://archives.pass-the-salt.org/Pass%20the%20SALT/2026/slides/) and [videos](https://passthesalt.ubicast.tv/channels/#2026) of the talks and rumps.

And as usual, you can find a quick review of our favourite talks and workshops with no specific order.

## Oblivious HTTP - when the server does not want to see your IP (Thibault Meunier)

In this talk, Thibault Meunier presented the inner workings of OHTTP (Oblivious HTTP), its uses and limitations.

OHTTP is a possible solution for servers that do not want to see your IP address. Examples of such services include telemetry services, health-tracking apps and DNS resolution services.

OHTTP has been standardized in [RFC 9458](https://www.ietf.org/rfc/rfc9458.html) and allows a server to communicate with a client without ever seeing the client’s IP address.

Thibault explained that not seeing the user’s IP address is not as simple as placing a proxy in between and having it strip identifying request metadata.

Because the proxy can see the content of the request, it might go rogue and tamper with it. OHTTP’s solution is to have four different parties involved: the standard client and server, plus a relay and a gateway.

The simplified workflow of an OHTTP request is as follows:

1.  The client encrypts the request with the gateway’s public key and sends the encrypted request to the relay.
2.  Then, the relay forwards it to the gateway without the client’s identifiable information.
3.  The gateway can then decrypt the content of the request and send it to the server.

This separation of concerns allows the server to process your request without seeing your IP address, while having data integrity enforced by the gateway. Because the data is encrypted by the client, the relay is not able to tamper with the request, which limits the impact in the case of a compromise.

Thibault then discussed the implementation in detail, the talk is worth watching for the full explanation.

## Threat Detection Engineering with Suricata (Eric Leblond)

In this workshop, Eric Leblond presented several techniques for improving network threat detection with the Suricata tool and guided us through their practical use.

As a reminder, Suricata is a free and open-source tool that can be used as an IDS/IPS.

We looked at multiple features of the tool, including the LSP that allows for integration with some of the most common IDEs.

Overall it was a great workshop and it was nice to talk with someone involved in the development of the tool.

## A phishing trip with Fancy Bear - Let’s analyze APT malware together! (Marius Genheimer)

In this workshop, Marius Genheimer guided us through the analysis of real-world Fancy Bear malware.

The workshop was hands on, and we analyzed the different steps of the malware, starting with the analysis of an EML file, all the way up to Windows shellcode and the final payloads.

## dicozorus: advanced web fuzzing (Vincent Herbulot)

As a pentester, Vincent has to do some reconnaissance when pentesting web applications to list applications and potential entry points. According to him, 50% of red team entry points are web applications. Finding those entry points implies the use of wordlists. The problem faced by all pentesters and red teamers is efficiency: wordlists can be sorted alphabetically, but the efficiency is low. For example, what’s the point of scanning for WordPress endpoints on a Joomla CMS? Vincent decided to solve this problem and started his project, dicozorus, a wordlist maintenance tool. The wordlists created by the tool contain not only URL paths but also a category (is it used for a XXE, LFI, RCE, SQL injection?), a count about how many times it was previously found. The tool can ingest well-known wordlists as well as result files from tools like patator or dirsearch to insert it into a local SQLite database. The output file format of a dicozorus wordlist is CSV. The tool comes with a set of built-in wordlists from relevant sources.

[Project repository](https://github.com/synacktiv/dicozorus)

## Automated vuln detection in Go (Karolina Gorna)

Karolina Gorna presented the results of her PhD thesis about automation of vulnerability detection in Go. Her thesis started with an observation: after trying multiple symbolic execution analysis tools, none was fitting her needs to inspect Go binaries.

She started coding her own tool: Zorya, in Rust. It is a concolic analysis tool for Go only binary with a built-in pseudo-code generator and parser. Among its features, it shows all the threads during execution, even if the binary is single-threaded as Go binary embed at least a garbage collector, which runs as a thread. Concurrency bugs can be found too, thanks to the Volos module.

An MCP server exists for Zorya and has been tested between April and June 2026, it allowed Karolina to test different IA models on 146 entry points to detect 20 vulnerabilities which have been reported.

[Zorya repository](https://github.com/Ledger-Donjon/zorya)

## Mozilla & security LLM - retex (Sylvestre Ledru)

Sylvestre presented the results of the usage of LLM on the Firefox browser. He briefly summed up Firefox numbers in 2025:

-   On the main branch: 13 major updates and 26 releases.
-   A full CI run on the Firefox project takes on average 2000 hours of computing time, dispatched between 5400 tasks.
-   Build infrastructure needs between 100 and 180 machines.

Mozilla teams have multiple QA types: pre-release review, in-dev bug catching. Tested scopes are JS features, dom layout, CSS, media file formats, API.

Enters AI!

Anthropic gave Mozilla access to the Mythos model, which was used and allowed them to spot a huge number of bugs. In April 2026, 423 bugs were fixed. The prompt methodology used by Mozilla is divided in 4 phases:

-   Phase 1: use of searchfox-cli to browse the searchfox.org website to map definitions, graphs and cross references. Then procude code snippets, vulnerability indicators, testcase strategy.
-   Phase 2 is exploitation and validation, during which the testcase is built to confirm the expected crash
-   Phase 3 is validation, a verifier subagent is called with the testcase, the crash, the source file where the vulnerability has been found and it must reproduce the result.
-   Phase 4 emits the final analysis results

No wonder Firefox will benefit from AI and will become harder to exploit in the near future.

## Workshop Lookyloo (Raphael Vinot)

Raphael Vinot and Quinn Norton presented a workshop about the use of lookyloo, a web application which aims at browsing a URL and empowers cyber security researchers, mostly blue teamers, with information about the targeted URL.

It can be used to browse suspicious links received in phishing emails or found on darkweb forums, for example. By tuning lookyloo options, you can bypass some of the security barriers attackers may have put in place to prevent their malicious links from being inspected by blue teamers. It is even possible to add a virtual sandboxed browser to humanly interact with the link, in case a captcha must be completed or human check is required to draw a conclusion on the nature of the site.

The workshop ended with a small exercise / CTF to explore some of the options for lookyloo and see how to improve suspicious links analysis.

Last but not least, as it’s a free software, you can use a public instance or run your own, and make it interact with other awesome projects like: pandora, sanejs or your own.

[You can try it on CIRCL public instance](https://lookyloo.circl.lu/)

## BadUSB forensics (Antoine Cervoise)

BadUSB is a category of devices under which falls teensy, rubber ducky or even flipper zero but not only. Nowadays even charging cables can embed miniaturized malicious devices.

Antoine Cervoise presented many DIY methods for forensics investigators who must be able to detect such devices without triggering the potentially malicious payload contained. There are commercial products such as la401 malicious cable detectors but a raspberry pi can also do the trick. Connecting the USB device and looking at `dmesg` command output can give hints. Also, good old software like `wireshark` with `usbmon` module or `airmon-ng` can help in communication detection.

## Free censorship-resistant infra (Thomas Lowagie)

What happens when a malware author decides to use a blockchain as a command and control infrastructure? That’s the starting point of Thomas Lowagie’s rump. Hiding techniques can basically be cut into 3 parts:

-   Putting a base64 encoded payload as a smart contract
-   Then querying it with an eth_call which is free
-   Decoding the payload and executing it on the victim

Attackers love decentralised infrastructure: it is harder to take down for defenders, it is a public but trusted infrastructure and easy to update remotely. It is both a resilient and flexible C2, the clickfix malware used it.

On defenders’ side, there are still advantages. There are CTI opportunities, the blockchain is public, immutable and timestamped, accessible with web explorers. It is quite easy to track a campaign by getting transaction logs and putting them into a SIEM, then tracking payloads, victims. Also, tracking attackers, correlating their activities (tracking smart contracts to get new payloads) and monitoring evolution over time is easy because of the nature of blockchain.

## rulezet.org: Open source security intel repo

A lot of open-source software is born from frustration, rulezet doesn’t make an exception here. Defenders who use Yara or Suricata rules to detect anomalous or malicious events are facing a problem, when searching for rules on big repository websites like GitHub, they end up with hundreds if not thousands, following rules update, finding out which are less prone to false positives can become a real burden.

Enters rulezet, a web platform retrieve, follow updates, collect metadata, evaluate and manage cyber security rules. Rulezet is co-funded by CIRCL and can be downloaded from the GitHub repository: [repository](https://github.com/rulezet/rulezet-core)

[A public instance can be browsed here](https://rulezet.org/)

## Catégories

[0day (15)](https://blog.randorisec.fr/fr/categories/0day)

[Bugbounty (2)](https://blog.randorisec.fr/fr/categories/bugbounty)

[Conference (44)](https://blog.randorisec.fr/fr/categories/conference)

[Ctf (5)](https://blog.randorisec.fr/fr/categories/ctf)

[General (7)](https://blog.randorisec.fr/fr/categories/general)

[Gestion de crise (1)](https://blog.randorisec.fr/fr/categories/gestion-de-crise)

[Pentest (30)](https://blog.randorisec.fr/fr/categories/pentest)

[Publications (18)](https://blog.randorisec.fr/fr/categories/publications)

[Red team (1)](https://blog.randorisec.fr/fr/categories/red_team)

[Responsible disclosure (18)](https://blog.randorisec.fr/fr/categories/responsible_disclosure)

[Spyware (1)](https://blog.randorisec.fr/fr/categories/spyware)

[Sstic (1)](https://blog.randorisec.fr/fr/categories/sstic)

[Swift (1)](https://blog.randorisec.fr/fr/categories/swift)

[Training (15)](https://blog.randorisec.fr/fr/categories/training)

[Workshop (1)](https://blog.randorisec.fr/fr/categories/workshop)

[Writeup (2)](https://blog.randorisec.fr/fr/categories/writeup)
