---
title: "UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing"
source: https://blog.talosintelligence.com/uat-12643-suspected-north-korea-aligned-actor-blends-blockchain-resilience-with-targeted-infostealing/
source_host: blog.talosintelligence.com
clip_date: 2026-11-19T09:01:45+08:00
trace_id: 2ffb06db-4605-4215-8cd1-cac7f48f2993
content_hash: 3912f797cc7c6a260c3eebe19845926fcbb74acd54150c7e906a5410721bc3cc
status: synced
tags: []
series: null
feed_source: Cisco Talos
ai_summary: null
ai_summary_style: null
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 41d75244-d011-817e-b15a-c506de609b90
ioc: null
---

-   Cisco Talos discovered malicious infrastructure associated with a financially motivated threat group we are tracking as UAT-12643.
-   The actor’s arsenal has several payloads including the Go-based Overlord remote access trojan (RAT), a Python-based infostealer internally labelled “Good Game,” and a multi-cryptocurrency clipboard hijacker.
-   The threat actor is likely operating a campaign targeting cryptocurrency holders, gaming platform account owners, and VoIP software users based on the lure file names of the initial vectors and the payloads.
-   The Overlord RAT implements a command-and-control (C2) resilience technique in which encrypted server URLs are embedded in Solana blockchain transaction memos.

* * *

## Victimology

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d1b0fc1610cdd584.jpg)

The threat actor is potentially targeting victims in Europe, according to the payload’s keyword-based file harvesting capability, which specifically targeted documents that had file names in English, French, Spanish, and Portuguese.

Based on the lure themes and payload file names, the potential victim pool spans across multiple verticals. A lure financial statement decoy PDF — launched when the Good Game stealer is executed — indicates targeting finance and accounting staff. The Viber trojanized installer lure targets messaging platform users, while additional payload variants of files named microsip indicate targeting VoIP softphone operators, consistent with call-center or business telephone environments. Cryptocurrency and gaming users are also targeted by both the clipboard hijacker and the infostealer.

## Potential links to North Korea-aligned actors

Talos assesses with low confidence that UAT-12643 is a North Korea-aligned advanced persistent threat (APT) actor based on overlaps in tactics, techniques, and procedures (TTPs) with those of the other known North Korean APT actors.

In the current campaign, Talos observed that the actor is using the Overlord RAT as one of their payloads. The threat cluster called UNK_DeadDrop, likely a North Korean threat actor, had employed the Overlord RAT in their earlier campaigns as reported by the security researchers in [June 2026](https://www.proofpoint.com/us/blog/threat-insight/dont-fear-repo-unkdeaddrop-phishing-campaign-targets-developers-steal).

The Overlord RAT variant observed in this campaign implements a blockchain C2 resilience technique with Solana blockchain transactions. This technique was first reported in [March 2026](https://intel.breakglass.tech/post/lazarus-group-is-using-the-solana-blockchain-as-a-dead-drop-c2-channel-and-nobody-noticed-for-4-months), employed by the Lazarus APT group. Although the implementation methodology differs (earlier, it was through Node.js), the technique of leveraging Solana transaction memo stayed consistent.

Talos is aware that Overlord RAT and Solana blockchain hosting technique is also leveraged by other threat actors in their campaigns, as reported by external security researchers in [October 2026](https://thehackernews.com/2026/10/eight-malicious-npm-packages-downloaded.html).

## Threat actor infrastructure

Talos observed that the actor hosted the malicious files on a server with IP address “41\[.\]216\[.\]188\[.\]11”, running a Flask-based file delivery service on port 8000 with resumable byte-range download support, and serving the payload staging directory. Due to the actor’s operational security failure, the server’s root folder was exposed to the internet, and Talos’ analysis of the exposed folder showed us actor’s tool sets, and the port numbers configured on the C2 server for different services.

|     |     |     |
| --- | --- | --- |
| Port number | Service | Payload file name |
| 8000 | Flask file-drop (HTTP) | Payload.exe, MyApp2.exe, HTA files |
| 5173 | Overlord RAT WebSocket C2 | Ovl.exe, Client.exe |
| 5656 | Python stealer TCP C2 | Ova.exe, MyApp2.exe |
| 5959 | Python stealer TCP C2 | Microsip-config.exe, microsip-config1.exe |

The actor does not use the traditional data exfiltration approach of transferring the data to the C2 server; instead, the stolen data is exfiltrated using two different services. The actor used the discord webhook, which receives an immediate notification that contains a victim’s fingerprint and a single click download link. The stolen data archive is uploaded to “gofile\[.\]io” and is later accessed by the actor through the download link.

We also observed the actor’s LNK generation script among the samples of the staging directory, indicating the actor’s lure creation workflow. The script accepts a payload URL and icon type (PDF, Word, or Windows Update) and generates a COM-based LNK with the spoofed and hidden execution.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://storage.ghost.io/c/af/a0/afa04ee3-414f-4481-8d23-7e7c146f192e/content/images/2026/11/LNK.png)

Figure 1. Sample Windows shortcut generation script.

## Initial access vectors

Talos observed that the actor uses three different methods to gain initial access to victims’ environments. They have instrumented Windows shortcuts, HTA files, and XML files, so the embedded malicious instructions execute and grant initial access. In this campaign, we have not observed how the actor delivers these malicious initial vector files to victims’ machines.

### Weaponized LNK

One of the initial access vectors is the usage of the weaponized LNK files paired with the icons spoofed from legitimate system binaries to appear as a legitimate file in the Windows Explorer.

The shortcut file impersonates a PDF using the standard Windows document icon and abuses MpCmdRun.exe, Windows Defender's command line utility and the argument -DownloadFile to get the payload. Since MpCmdRun.exe is a signed Microsoft binary, the download passes application allowlisting controls transparently. The downloaded payload will be saved as RuntimeBroker.exe to blend into process inventories, and the console window is minimized with no visible trace.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7b2a0da850472341.png)

Figure 2. Embedded command line in a sample LNK.

Another shortcut file applies the same PDF disguise through a double-extension file name and the Microsoft Edge PDF icon and uses certutil -urlcache –f, a one-liner download command that operates under the guise of a certificate cache update. Both shortcuts were built on the same machine (win-8oa3ccqae4d).

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dcd7bb8676e0f506.png)

Figure 3. Embedded command line in a sample LNK.

### HTA dropper

Talos observed that the actor has weaponized the JavaScript HTML Application (HTA) file to gain initial access. The weaponized HTA is executed by mshta.exe and the JavaScript in the HTA uses “MSXML2.ServerXMLHTTP” to fetch the payload as raw binary and “ADODB.Stream” to write it to %TEMP%\\s.exe, then executes it stealthily by hiding the execution window.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68f14703bcc4f746.png)

Figure 4. Sample HTA file.

### MSBuild living-off-the-land binary (LOLBin)

The actor has also weaponized a standard MSBuild XML project file “dl.xml” by including an inline C# CodeTaskFactory task. When the XML file is executed via msbuild.exe, it compiles and executes the C# code in memory, and no intermediate executable is written to disk for the downloader stage. The download uses a spoofed Microsoft BITS/7.8 User-Agent string, impersonating the Windows Background Intelligent Transfer Service (BITS) used by Windows Update, Microsoft Defender and many third-party updaters, so the request blends in with routine background download traffic.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/15e54ed3ece8beb0.png)

Figure 5. Sample malicious MSBuild project XML file.

## Analysis of Overlord RAT

The Overlord RAT variant utilized by UAT-12643 in this campaign is a modular Windows RAT compiled from Go source code.

The defense evasion and anti-analysis techniques implemented include the detection of in-memory execution to suppress forensic artifacts when running in sandboxes and a “kill flag” mechanism that triggers a kernel-level Blue Screen of Death (BSoD), making the process effectively unremovable without triggering a full system crash.

The RAT first verifies that the current process is running with administrative privilege. It then acquires SeDebugPrivilege for the current process. With that privilege held, it calls a native NT kernel API (NtSetInformationProcess) directly, bypassing the documented Win32 API layer entirely, to set the ProcessBreakOnTermination information class on the current process handle to value 1, which indicates the kernel will handle the process as critical to system operation. With these settings, the operating system treats the process the same way as the core Windows system processes. When a user or a security tool attempt to forcibly terminate the process, the kernel does not allow it to exit cleanly. Instead, it immediately halts the entire operating system and triggers a BSoD with the stop code CRITICAL_PROCESS_DIED.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/223427a1d7136c48.png)

Figure 6. Snippet of Overlord RAT function that triggers BSoD.

For persistence, the RAT employs two approaches. The primary approach is through a registry autorun entry under the current user's hive, with a randomized value name pointing to the RAT binary located in the Network folder of the local user profile application data folder. The secondary approach is a pre-boot persistence via the Windows Recovery Environment OEM script path. It first removes any previous version of itself and then sets up the OEM environment directly under %TARGETOSDRIVE%\\Recovery\\OEM\\. This folder is the location that the Windows Recovery Environment accesses when performing a "Reset this PC" operation. By placing files here, anything registered in this directory gets executed inside WinRE before the operating system is restored.

Once the directory is set, the RAT generates a random 20-character file name for its payload file. Each character is picked individually at random from a fixed character set, meaning every installation produces a uniquely named file. With a random name chosen, it writes the RAT's own executable binary into the OEM directory as that payload file. It then constructs the shell command that WinRE will use to launch the payload and wraps it into Windows batch script with the.bat extension.

```
cmd.exe /c start %TARGETOSDRIVE%\Recovery\OEM\"random_stub_name"
```

The use of %TARGETOSDRIVE% is significant, as this environment variable only exists and resolves correctly inside the WinRE pre-boot environment, not in normal Windows. This means the command is specifically crafted to work at recovery time, not during a regular session.

Before modifying any system configuration, it backs up the existing WinRE reset configuration file. Finally, it modifies the ResetConfig.xml file that governs what WinRE does during a reset. If no config file exists yet, it creates one from scratch; if one already exists, it patches it to append the malicious batch scripts as registered OEM tasks. From this point forward, whenever the victim triggers "Reset this PC" whether from within Windows Settings or from the recovery boot menu, Windows Recovery Environment will execute the RAT's payload before restoring the operating system, ensuring the implant survives a full system reset.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a9115eebbbb1d662.png)

Figure 7. Snippet of Overlord RAT function configuring the malicious script in WinRE location.

Analysis of the RAT’s binary showed a complete command surface with 35 commands, each corresponding to a distinct capability delivered over the C2 channel. These commands belong to several remote administration capability categories as described in the table below:

|     |     |
| --- | --- |
| Category | Capabilities |
| Surveillance | Captures keystroke using GetAsyncKeyState, Webcam streaming, microphone and desktop audio capture and desktop screen capture. |
| File system | Directory listing and creation, file read, write, delete, copy, move, perform recursive search, upload, download, and compression tasks. |
| Process control | Process enumeration and termination. |
| Script execution | Execute arbitrary command and script with real-time console output streaming back to C2. |
| Lateral Movement | Establishes Reverse SOCKS proxy tunnel that routes operator TCP traffic through the victim network, enabling access to internal hosts unreachable from the public internet. |
| Plugin delivery | HTTP-based plugin downloads with reflective DLL injection at runtime where new capabilities are loaded entirely in memory with no binary update or written to the disk. |

### Overlord’s Solana blockchain C2 URL hosting

The RAT implements a resilient C2 server discovery mechanism by using the Solana blockchain. The actor embeds encrypted C2 URLs into the Solana blockchain using the Solana Memo Program, a native Solana program that validates and permanently records arbitrary text strings in the blockchain ledger as part of a transaction. Any Solana wallet can include a memo instruction in a transaction of up to 566 bytes of arbitrary data to the permanent, globally replicated transaction record.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/105decf59baa7667.png)

Figure 8. The Snippet of Overlord RAT function queries the Solana Memo address.

A threat actor can post one such transaction from a controlled wallet address whenever the C2 server address needs to be updated. Every deployed RAT picks up the update on its next discovery cycle without any redeployment or reconfiguration.

This is achieved by first retrieving the transaction history for the actor-controlled wallet using the Solana getSignatures JSON-RPC method which receives a chronologically ordered list of transaction signatures with the newest transaction first. For each signature it fetches the full transaction via getTransaction with jsonParsed encoding, which instructs the RPC node to decode every instruction data field into structured JSON response. The RAT module then walks every instruction in the parsed transaction looking for one whose data string is exactly 43 characters in length. The 43-character length is the fixed string length produced when a Base58-encoded WebSocket URL is AES-256 encrypted. Any instruction whose data field is a different length will be skipped, including legitimate Memo transactions from other users and all other Solana program instructions. Only instructions matching this precise length signature are treated as C2 memos.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2359871250cf8870.png)

Figure 9. RPC response format for the getTransaction request.

## Good Game stealer

The Good Game stealer payload Talos observed in the arsenal of UAT-12643 is a publicly available Python-based infostealer developed under the label *"* Good Game *(*version 1.1.2)” by [CirqueiraDev](https://github.com/CirqueiraDev). The actor of this campaign is not the developer, and the malware is distributed as a self-contained Windows executable produced by packaging a Python 3.12.0 code with PyInstaller. Its architecture is split between two cooperating bytecode modules. The “final_build.pyc” acts as the launcher, decoy interface, and reverse-shell client, while “kora.pyc” contains the full data-harvesting stealer logic.

### Good Game’s anti-analysis and evasion

The malware employs evasion techniques at every stage of execution, beginning the moment the process starts. The launcher immediately retrieves the console window handle via GetConsoleWindow() and calls ShowWindow() to hide the terminal window. A fully functional Notepad-style graphical user interface (GUI) is rendered in the foreground via tkinter, a Python’s standard, built-in library used for creating GUIs while all malicious threads run as daemon threads behind it.

Before the stealer module begins with any data collection, it runs three sequential execution checks. First, it confirms the host operating system is Windows by checking platform.system(); the stealer aborts silently on Linux or macOS. Second, it verifies network connectivity by performing an HTTP GET request to Google, and if the request fails, the stealer exits and records the failure reason in a file named “skipped" in the temporary directory. Third, and most significantly, it runs sandbox detection checks in five steps.

1.  It checks for the presence of libraries including sbiedll.dll, api_log.dll, vmcheck.dll, wpespy.dll, cmdvrt64.dll, avghookx.dll, snxhk.dll, and guard32.dll.
2.  The MAC address check extracts the host's network adapter hardware address via the getmac module and compares it against known OUI prefixes assigned to virtualization vendors: VMware (00:05:69, 00:0c:29, 00:50:56), VirtualBox (08:00:27), Hyper-V (00:15:5d), Xen (00:16:3e), and Parallels (00:1c:42).
3.  The hardware memory check queries GlobalMemoryStatusEx through a ctypes MEMORYSTATUS structure and flags machines with less than two gigabytes of physical RAM as sandbox environments.
4.  The boot-time check uses psutil.boot_time() to compute system uptime and treats an uptime of fewer than five minutes as indicative of a freshly provisioned analysis VM.
5.  Finally, the Wine emulation check probes for the presence of “C:\\windows\\system32\\wineboot.exe” to detect Windows API compatibility layers.

If any single check triggers, the stealer exits silently, leaving no harvested data and minimal trace.

The decoy URL mechanism of the stealer adds a further layer of camouflage. It opens a PDF-hosted document in the victim's default browser exactly once per machine and computes an MD5 hash of the URL and stores a flag file named “url_opened\_<hash>.flag” in the temporary directory of the victim machine. On all subsequent executions, the lure URL is not re-opened, preventing repeated suspicious browser launches that would alert the victim.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7bacf265cb9db3de.png)

Figure 10. Decoy PDF opened by Good Game stealer in victim’s browser.

### Persistence established by Good Game

The malware establishes persistence through two independent mechanisms on Windows, ensuring the implant survives reboots regardless of which pathway is disrupted. The primary method is a registry autorun by opening the key `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` using winreg.KEY_SET_VALUE” and writes the absolute filesystem path of the running executable under the value name `Zoipers`, causing the binary to be launched automatically at every subsequent user logon without requiring elevated privileges. The secondary persistence mechanism is executed from within the stealer module of kora.pyc. The stealer copies the running executable into the Windows Startup folder at `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\` using shutil.copy().

Beyond simple re-execution persistence, the stealer also temporarily disables the Windows Task Manager during its active operation. It calls `advapi32.RegCreateKeyExW` directly through ctypes against the key *`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`* and sets a DWORD value *`DisableTaskMgr=1`* via RegSetValueExW. After the data exfiltration completes successfully, the stealer restores the value to zero (*`DisableTaskMgr=0`*), reducing the probability that the victim will notice the restriction.

### Good Game stealer functionalities

The stealer's most extensive capability targets 23 Chromium-family and Firefox-based browser variants, covering Google Chrome across all distribution channels, Microsoft Edge, Opera, Opera GX, Brave, Vivaldi, Yandex Browser and all its regional variants, Amigo, Torch, Kometa, Orbitum, CentBrowser, 7Star, Sputnik, Epic Privacy Browser, Uran, and Iridium.

The stealer scans LevelDB stores across Discord clients and over 19 Chromium-based browsers for authentication tokens using two regex patterns one for plain-text tokens and one for tokens encrypted with the “dQw4w9WgXcQ:” prefix introduced in newer Discord versions. It decrypts the stolen token via the browser's extracted master key, then validates each recovered token against the Discord API to build a complete account profile covering username, display name, user ID, email, phone number, Nitro subscription tier, linked payment methods, gift codes, and multi-factor authentication (MFA) status.

The stealer additionally extracts ROBLOSECURITY cookies from browser databases, validating each against the Roblox authentication API to confirm active sessions and retrieve the associated account details. A full system profile is assembled covering hostname, username, hardware specifications, OS details, network interfaces, and public IP geolocation metadata queried from ipwhois.app, serialized to system_infos.txt in the archive root.

The stealer also captures a full-monitor screenshot and a single webcam frame, both saved as PNGs and added to the archive before the temporary files are deleted and terminated. The stealer then harvests session data from 21 cryptocurrency wallets including Exodus, Electrum, Ledger Live, Trezor Suite, Atomic Wallet, Trust Wallet, Coinbase, and Binance, as well as four gaming platform launchers (Steam, Riot Games, Epic Games, and Rockstar Games).

Beyond structured credential databases, the stealer conducts a targeted sweep of the victim's personal file system across the folders Desktop, Downloads, Documents, Pictures, Videos, OneDrive root, and the Windows Recent Items folder at %APPDATA%\\Microsoft\\Windows\\Recent. The sweep applies to two independent filters that a file must satisfy simultaneously before it is collected.

The first filter is an extension allowlist covering 45 file types spanning different categories mentioned in the table below:

|     |     |
| --- | --- |
| File types | File extension |
| Plain text and configuration formats | .txt,.log,.ini,.json,.xml,.csv,.md,.rtf,.cfg,.conf |
| Image formats | .png,.jpg,.jpeg,.bmp,.gif,.tiff,.svg,.webp |
| Document formats | .pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp |
| archive formats | .zip,.rar,.7z,.tar,.gz,.bz2 |
| video and audio formats | .mp4,.avi,.mkv,.mov,.wmv,.flv,.mp3,.wav,.aac,.flac,.ogg |

The second filter is a keyword allowlist of four languages English, French, Spanish, and Portuguese that must match the file's base name exactly. The keyword list is designed to maximize overlap with the types of sensitive documents that cryptocurrency users, online gamers, and financially active individuals are likely to store on their desktops or in their documents folders. It covers two-factor authentication backup codes, mnemonic seed phrases, cryptocurrency wallet application names, generic password file naming conventions, banking and payment terms, private key and recovery phrase labels, Discord authentication tokens, Telegram session identifiers, and generic high-value labels such as secret, vault, backup, admin, and root.

Files that satisfy both the extension and keyword filters are written into the archive in the temporary directory, with each file name suffixed by a randomly generated four-digit number before the extension.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://storage.ghost.io/c/af/a0/afa04ee3-414f-4481-8d23-7e7c146f192e/content/images/2026/11/stealer_files.png)

Figure 11. Targeted files search and exfiltration program for Good Game stealer.

### Data exfiltration mechanism of Good Game stealer

All harvested data is written progressively into a single ZIP file. The ZIP file object is opened with ZIP_DEFLATED compression in the system temporary directory. The archive file name uses the prefix “SK\_”, followed by eight randomly generated characters, creating a unique identifier per victim and making the archive harder to identify by name alone.

The ZIP is structured into named subdirectories such as Screenshot/, Webcam/, Session Files/Wallets/, Session Files/Game Launchers/, Session Files/Apps/Telegram/, and Interesting Files/ alongside flat files in the root for system information and antivirus enumeration results. Browser-derived outputs are labelled with a count suffix such as Passwords (N).txt, where N reflects the number of credentials recovered from that browser, enabling the actor to prioritize.

Once all stealer modules have been completed, the closed archive is uploaded to *hxxps\[:\]//upload\[.\]gofile\[.\]io/uploadFile* using an HTTP POST request. The server returns a JSON response containing a direct download link to the uploaded archive.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cede7ff1b3b4eb8e.png)

Figure 12. Snippet of Good Game stealer exfiltration function.

With the GoFile download URL in hand, the stealer constructs a Discord webhook notification and POSTs it to the hardcoded webhook endpoint. The notification takes the form of a Discord message containing the victim's hostname, username, machine architecture, operating system version, and OS release label providing the operator with an immediate preview of the victim's machine profile without needing to download the archive first. After the webhook POST completes, the stealer calls its cleanup routine to delete the local ZIP archive and all temporary intermediate files including the screenshot PNG and webcam PNG from the temporary directory.

![UAT-12643: Suspected North Korea-aligned actor blends blockchain resilience with targeted infostealing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2f6aee85477f6392.png)

Figure 13. Snippet of Good Game that POSTs reconnaissance data to Discord Webhook.

## Clipboard hijacker targets multi-cryptocurrency wallet addresses

The clipboard hijacker Talos identified in the actor’s toolset is a compact Windows x64 executable written in C++. It has no network component or C2 communication protocol; instead, the actor configuration is compiled directly into the binary as XOR-encrypted wallet addresses in the binary data section.

Upon execution, the binary dynamically resolves the API function addresses and creates a global mutex “UuuRjinBZPBMIjnc”. Then it retrieves the machine name and searches for the substrings including VBOX, VMWARE, QEMU, and SANDBOX. Persistence is established by copying the binary to %APPDATA%\\MsgEdgeUpdate.exe with FILE_ATTRIBUTE_HIDDEN and FILE_ATTRIBUTE_SYSTEM attributes applied, then adding it under user hive’s Run registry key with value named “MsgEdgeUpdate”, spoofing the appearance of a legitimate Microsoft Edge updater process.

The hijacker polls the Windows clipboard every 500 milliseconds in an infinite loop, applying address-format fingerprinting to detect the copied cryptocurrency. All clipboard APIs are resolved dynamically through user32.dll. On detection, the corresponding attacker wallet address is XOR-decrypted from the data section and overwrites the original wallet address in the victim machine clipboard.

## Coverage

The following ClamAV signatures detect and block this threat:

-   Win.Trojan.OverlordRAT-10060615-0
-   Ps1.Trojan.LNKBuilder-10060627-0
-   Win.Trojan.OverlordRAT2-10060616-0
-   Win.Infostealer.GoodGame-10060617-0
-   Win.Infostealer.PyStealerDeps-10060618-0
-   Py.Infostealer.GoodGame-10060619-0
-   Py.Trojan.GoodGameLoader-10060620-0
-   Win.Trojan.WalletClipper-10060621-0
-   Win.Downloader.LNKMpCmdRun-10060622-0
-   Win.Downloader.LNKCertutil-10060623-0
-   Win.Trojan.LNKVideosExe-10060624-0
-   Html.Downloader.HTAStager-10060656-1
-   Xml.Downloader.MSBuildInline2-10060657-0

The following Snort2 and Snort3 Snort Rules (SIDs) detect and block this threat:

-   Snort2: 1:67491, 1:67490
-   Snort3: 7:75, 7:74

## Indicators of compromise (IOCs)

IOCs for this research can be found at our GitHub repository [here](https://github.com/Cisco-Talos/IOCs/tree/main/2026/11).
