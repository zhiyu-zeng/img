---
title: MLA et l’implémentation d’une hybridation cryptographique - Camille Mougey & Jérémy Barallon
source: https://blog.randorisec.fr/conference-sstic-2026/
source_host: blog.randorisec.fr
clip_date: 2026-11-24T10:56:48+08:00
trace_id: c0cdc29a-9bb4-4d25-a9c2-29b594d2c084
content_hash: b5187a7c4850cb4899a06e5dd2f347cf9febb6c348ff45f7f78cf681f5d2d12c
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
notion_page_id: 42275244-d011-812f-b46d-ca018844d82e
ioc: null
---

### RandoriSec 9 min

For the 24th edition of the [SSTIC](https://www.sstic.org/) conference, a team of seven persons from RandoriSec went to Rennes. As usual, the conference was pleasant, with nice technical talks. In this article, you can read a brief overview of the presentations we enjoyed the most. Thanks for the organizers and the speakers!

Most of the slides and videos of the conference are available at the following URL:

-   [https://www.sstic.org/2026/programme/](https://www.sstic.org/2026/programme/)

## High Score, High Risk: The Evolving Threat Landscape of the Video Game Industry - Philippe Paquet

In this talk, [Philippe Paquet](https://www.sstic.org/user/Philippe_Paquet) exposed the threat landscape of the video game industry.

The largest part of the talk (and the most interesting part for me) was about the cheat industry. Using facts and numbers, the speaker demonstrated that the cheat industry targets several sectors of the player base, including both casual and professional players. The speaker also presented the various existing cheat techniques (from ring 0 cheats to external PCI devices using DMA). Then, he explained how digital assets, which are increasingly used in video games, are exploited by criminal organisations for money laundering. He explained that these threat actors were highly organised, publishing jobs offers for anti-cheat reverse engineers and community managers to promote their cheats. He also revealed that many cheaters were “paying” to be compromised, as several cheat engines are just disguised stealers.

It was interesting to learn about this sector, which rarely goes public on this topic. Great talk!

## Shift Happens: Uncovering two built-in command injections in Windows context menus - Rémi Gascou

Podalirius gave a fun talk about some issues with the Windows context menu option.

It showed a few ways to play around with file names to trigger command injection and arbitrary execution in the « Open Powershell Window Here » entry of the Windows extended context menu. This is due to poorly thought-out commands configured into the corresponding registry entry, which allows for injecting arbitrary commands through a « -command » Powershell argument.

After showing various ways to leverage this, like creating a malicious file tree to trigger the injection, the talk showed LLM bias toward trusting the MS implementation, thus propagating vulnerable command snippets for other context menu entries when asked.

Broken code used to be copy-pasted from stackoverflow and will still copy-pasted from an LLM output in the AI era… some things never change, I guess.

## Flicker and fall: rooting the Philips Hue Bridge both remotely and wirelessly - Anthony Remy, Baptiste Verstraeten, Guillaume Chantrel, Maxime Turlure, Valentino Ricotta

As part of Pwn2Own Ireland, the Thalium team tackled the Philips Hue Bridge; this talk was a summary of their findings. The Philips Hue Bridge is the control center for the `Hue` lighting system. The target can be reached from two different interfaces: either the LAN, or — more interestingly — the ZigBee interface. The team found two chains, targeting both of these paths. The first chain goes through the LAN. The surface they analyzed is the `hk_hap` process, which implements the Apple HomeKit Accessory Protocol. Without any authentication the surface was very limited, but they found a clever auth bypass by analysing the SRP implementation (`Secure Remote Password` protocol) and how it was used on the target. A missing `device_password` field in the configuration, combined with setting the `kPairingFlag` during the M3 phase, gave them a full auth bypass, opening all endpoints to them. From there, they achieved code execution through a heap buffer overflow in the `/accessories` endpoint. As usual with such targets, mitigation was absent and the heap was executable. They later moved on to the ZigBee chain, which is far more interesting, as it allows someone outside of the current network to compromise the device Over The Air! However, they did not elaborate on this chain (too bad, but they promised the audience a better talk specifically on this one). Still, we know they found two bugs reachable OTA: weak authentication when pairing a device, and a heap buffer overflow during packet reassembly. We’re eager to learn more about it.

## MLA et l’implémentation d’une hybridation cryptographique - Camille Mougey & Jérémy Barallon

Camille and Jérémy presented the project Multi-Layer Archive (MLA) made by Agence National de la Sécurité des Systèmes d’Information (ANSSI). MLA was initiated because ANSSI collect data from his beneficiary with the purpose to do an audit, the first version of MLA was released in 2020. Camille explained the various constraints that the project must take into account (large volume, truncated data, etc.) and the needs of encryption.

In August 2025, MLA 2 was released to support Post Quantum Cryptography (PQC), with the threat of quantum computers, to be secure today and tomorrow it was necessary to switch to hybrid cryptography. This is where the difficulty lies, as there is currently no standardized algorithm for hybridisation, so they have to develop their own, that what Jérémy’s part is about.

Jérémy tells us that they began to take a look at how cryptographic hybridisation was done in TLS, Signal, Apple and OpenSSH. This highlighted the fact that everyone was doing things their own way, and that they would not be able to rely on an existing solution for various reasons, but three of the four solutions have one thing in common, they all use HKDF. HKDF is well suited to the requirements of hybridisation, which is why it is also used in the MLA 2, and Jérémy explains how they managed to build everything together (classical KEM, PQ KEM and HKDF).

I found this presentation interesting because it talked about a tool developed by ANSSI that is used in the course of their work. It also highlights the need for them to improve security, even against distant threats.

## Fuzzing en boîte noire assisté par trace matérielle avec LibAFL et Intel PT — Marco Cavenati & Romain Malmain

The presentation was about the integration of Intel PT within LibAFL and how such integration can be helpful in blackbox fuzzing.

Intel PT is a hardware feature, directly integrated in some Intel CPU(s). This feature is mainly used for performance profiling. Romain explain how this feature can be used for blackbox fuzzing. During the execution of a binary, Intel PT can retrieve valuable information such as branch tracing. After performing some decoding on those traces, coverage information can be retrieved by repeating this process.

In blackbox fuzzing we usually “instrument” the binary during the emulation (e.g. AFL++ with Qemu mode). With Intel PT integration in libAFL, the instrumentation overhead is reduced since both Qemu and KVM support Intel PT tracing. Moreover this step can be totally removed if performed in baremetal.

The authors explained how other fuzzers attempt to integrate Intel PT. These fuzzers seem to come with some limitations (e.g. kAFL require a heavy setup, HongFuzz only collect indirect branching info, WinAFL is specific to Windows)

LibALF x Intel PT is still in the development stage, particularly for Windows support. Depending on the complexity of the target binary, the decoding of the traces can impact the performance of the fuzzing campaign.

This integration seems to be a promising work for blackbox fuzzing approach.

## Spatial Frinet: application des index spatiaux aux traces d’exécution - Théo Emeriau

The presentation was about the work done during the past two years on [Frinet](https://github.com/synacktiv/frinet), which is a tool to generate execution traces using Frida. Generated traces can be visualized using an IDA plugin: tenet. In their everyday uses, the author has met some efficiency issues, especially with big traces: the load could be very long (hours for very large traces), and the UI could freeze during the exploitation of the trace.

Based on those observations, the author starts thinking about how to fix those limitations, more especially the UI freezes. His goal was to reduce the time of execution to 1ms for each action. The actions are various, but there are 3 main categories: fetch of a register value, fetch of memory values and search for a breakpoint.

The main problem here was to find a correct way to represent the data in memory which uses either the time and the address for indexing, while not taking too much space in memory and on the disks. After various research of other programs that have this kind of issue (like OpenStreetMap), they conclude that the `Hilbert Packed R-Tree` algorithm will do the job.

Since the math behind the algorithm will be too long to explain here, we’ll skip them and jump to the conclusion, but the speaker explained it very well; go take a look at its presentation! For both the memory access and the breakpoints, the goal is reached: the computation stays under the milliseconds for very big captures!

For registers, it is another story: the representation does not work as expected, some works remain here, but still, the new implementation looks very interesting!

## Rétro-ingénierie d’un micrologiciel pour architecture Pi32v2 - Damien Cauquil

In this talk, Damien Cauquil explained how he reversed the firmware of a cheap smartwatch. He began by introducing the smartwatch itself and how he dumped the firmware, which was the subject of another presentation.

With the firmware, he quickly found out that the smartwatch was using an exotic architecture: Pi32v2. Ghidra is the only reverse engineering framework supporting this architecture. However, it only implements version 1 of the architecture (and even some instructions are not supported). Consequently, the speaker had to improve the Ghidra implementation and dig into the architecture. Fortunately, an objdump tool for this architecture was available on Github. The Pi32v2 architecture uses instruction size of 16, 32 and 48 bits and some of them can be executed concurrently.

Then, the speaker presented how he implemented the version 2 of the architecture in Ghidra using the SLEIGH language. This is a description language used by Ghidra to describe the format and the semantic of the instructions. Unfortunately, SLEIGH does not support loops which were needed to parse bitmaps encoded in certain instructions. To solve this issue, he used recursion that is supported by SLEIGH to parse.

Finally, he almost fully implemented the Pi32v2 CPU in Ghidra and began the reverse engineering. He quickly found the code that was responsible for heart rate monitoring. He discovered that the `rand()` function from the newlib library was used to read the heartbeat, proving that there was no heart sensor on the smartwatch.

## Categories

[0day (15)](https://blog.randorisec.fr/categories/0day)

[Bugbounty (2)](https://blog.randorisec.fr/categories/bugbounty)

[Conference (44)](https://blog.randorisec.fr/categories/conference)

[Ctf (5)](https://blog.randorisec.fr/categories/ctf)

[General (7)](https://blog.randorisec.fr/categories/general)

[Gestion de crise (1)](https://blog.randorisec.fr/categories/gestion-de-crise)

[Pentest (30)](https://blog.randorisec.fr/categories/pentest)

[Publications (18)](https://blog.randorisec.fr/categories/publications)

[Red team (1)](https://blog.randorisec.fr/categories/red_team)

[Responsible disclosure (18)](https://blog.randorisec.fr/categories/responsible_disclosure)

[Spyware (1)](https://blog.randorisec.fr/categories/spyware)

[Sstic (1)](https://blog.randorisec.fr/categories/sstic)

[Swift (1)](https://blog.randorisec.fr/categories/swift)

[Training (15)](https://blog.randorisec.fr/categories/training)

[Workshop (1)](https://blog.randorisec.fr/categories/workshop)

[Writeup (2)](https://blog.randorisec.fr/categories/writeup)
