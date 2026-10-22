---
title: "How Windows UCPD Grew from a 29 KB Registry Filter into a 196 KB Policy Engine :: Xusheng Li"
source: https://xusheng.dev/posts/reversing/ucpd_evolution/main/
source_host: xusheng.dev
clip_date: 2026-10-22T10:24:50+08:00
trace_id: 811e1e9d-c40c-44d4-bf11-4610ebd58fa8
content_hash: 829151a484257901841e2f99076ec76273de9733bdbd6e95e8de4a63082c66aa
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: Windows 驱动 UCPD.sys 从 2023 年 8 月的 29 KB 浏览器关联过滤器，三年内扩展为 196 KB、约 355 个函数的内核策略引擎。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40175244-d011-81eb-a147-fe987c36c6ec
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 驱动 UCPD.sys 从 2023 年 8 月的 29 KB 浏览器关联过滤器，三年内扩展为 196 KB、约 355 个函数的内核策略引擎。
> 
> - **样本与对比方法：** 借助 Winbindex 与微软符号服务器取回 24 个版本、38 个 x64 二进制，按文件版本与策略内容排序后逐版本比对；多数版本已无 PDB，因此从 PE 异常目录的函数计数和字符串定位到代码，确认规则确实生效。
> - **发布时间早于曝光：** 最早版本 1.0.1.383513 随 2023-08-22 的 KB5029351 发布，比 2024 年初的公开发现早约七个月；1.0 已包含 HTTP/HTTPS UserChoice 键与 dllhost、reg、rundll32、svchost 工具黑名单。
> - **防护范围扩大：** 2.x 纳入 PDF、DeviceRegion、Feeds、任务栏，并把 powershell、regedit、wscript、cmd 加入黑名单；3.0 开始转向进程与发布者层面的完整性防护；4.1 覆盖 OpenWith、Office 关联与 ACL、删除和重命名；4.3 增加 OriginalFilename 与栈回溯校验。
> - **签名策略通道：** 4.2 引入 `Services\UCPD\DR` 下的 Base64 数据型 PE，验签、解密并分发 TLV 规则，使改策略无需更换驱动或重启；4.6 改用 SHA-512，与抓取策略的生产端算法不匹配，导致解密失败。
> - **新增策略族：** 4.4 加入 CrossDeviceResume（FeatureV2 位 0x08000000），4.5 加入 GamingConfiguration（位 0x40000000），4.6 引入 64 位 FeatureV3 并映射 7 个特性 ID，4.7 将 bssafe.exe、mshta.exe 写入静态列表，凑满 14 项。

## TL;DR

-   I collected 38 `UCPD.sys` binaries representing 24 versions
-   UCPD first shipped in August 2023, seven months before its public discovery
-   It grew from a 29 KB browser-association filter into a 196 KB registry and process policy engine
-   Later versions added ACL, rename, injection, UI Automation, backtrace, and dynamic-rule defenses
-   Versions 4.4–4.7 added cross-device resume, gaming, `FeatureV3`, and an expanded deny list

## Going backward

My [recent article](https://binary.ninja/2026/08/04/ucpd-dynamic-rules.html) examined how the Dynamic Rules (DR) work in the UCPD driver, and earlier research by [Christoph Kolbicz](https://kolbi.cz/blog/2024/04/03/userchoice-protection-driver-ucpd-sys/), [Gunnar Haslinger](https://hitco.at/blog/windows-userchoice-protection-driver-ucpd/), and [me](https://binary.ninja/2025/03/25/default-browser-upcd.html) captured individual stages of its development. The remaining piece was to track how the driver evolved over time.

So I used Winbindex to locate and retrieve 38 reconstructable x64 `UCPD.sys` files from Microsoft’s public symbol server. Microsoft had removed the corresponding PDBs for most versions, so the comparison relied on the binaries rather than symbol information. The files cover 24 versions, and I compared adjacent versions.

Most of this work was performed by Codex using Binary Ninja’s MCP integration. I was quite surprised by its ability to diff binaries without specialized tools such as BinDiff and BinExport.

## UCPD was already in Windows in August 2023

The oldest indexed binary is `UCPD.sys` version `1.0.1.383513`. Winbindex associates it with Windows 11 22H2 preview update [KB5029351](https://support.microsoft.com/help/5029351), released on August 22, 2023.

That is about seven months before the reports that led to UCPD’s public discovery.

The distinction is important. Early 2024 appears to be when Microsoft activated or broadly rolled out the protection, not when it wrote the driver. Microsoft had already been developing and servicing UCPD in public Windows packages for months.

The first version was not an empty shell, either. It was a 29,184-byte driver with 58 unwind-described functions. Its strings and code identify the essential design:

```text
Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice
Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice

RemoveUserChoice
RenameUserChoice
OriginalFilename

*\dllhost.exe
*\reg.exe
*\rundll32.exe
*\svchost.exe
```

In other words, version 1.0 already knew which registry keys represented the default browser, distinguished operations against them, and had a list of Microsoft utilities that should not be trusted merely because Microsoft signed them.

The architecture that would define UCPD was present from the beginning:

```text
registry operation
      |
      v
is this a protected key?
      |
      v
is the requesting executable trusted?
      |
      +-- not Microsoft-signed -> deny
      |
      `-- Microsoft-signed
              |
              `-- utility deny list -> deny
```

Everything that followed made the protected surface wider and made the definition of “trusted” much harder to fool.

## The complete growth curve

The driver grew almost sevenfold over three years:

| Version | Approximate period | Size | Functions | Important visible addition |
| --- | --- | --- | --- | --- |
| 1.0.1 | Aug 2023 | 29 KB | 58  | HTTP/HTTPS UserChoice protection |
| 2.0.0 | Dec 2023 | 34 KB | 65  | PDF, DeviceRegion, FeatureV2 |
| 2.1.0 | 2024 | 45 KB | 74  | Feeds, NandI, taskbar |
| 2.2.0 | Jun 2024 | 41 KB | 74  | `cmd.exe` deny entry |
| 3.0.0 | Jul 2024 | 86 KB | 143 | Process/publisher defenses, Search, Taskband |
| 3.1–3.2 | late 2024 | 86–96 KB | 146–156 | Copilot experiments, more denied utilities |
| 4.0.x | early 2025 | 102–112 KB | 181 | Backtrace-era process/module architecture |
| 4.1.x | Mar–Apr 2025 | 115–119 KB | 193 | Unknown/OpenWith, Office, ACL operations |
| 4.2.x | Apr 2025 | 135 KB | 248 | Dynamic rules and self-protection |
| 4.3.0 | Jun 2025 | 157 KB | 295 | StackTrace and renamed-file parsing |
| 4.4.x | late 2025 | 164–174 KB | 312–316 | CrossDeviceResume |
| 4.5.0 | Oct 2025 | 168 KB | 333 | GamingConfiguration |
| 4.6.0 | Feb 2026 | 176 KB | 341 | FeatureV3 and SHA-512 |
| 4.7.x | 2026 | 197 KB | 354–355 | Complete 14-entry deny list |

Function counts come from the x64 exception directory. They are not a perfect source-level function count, but they are consistent enough to show the scale of each transition.

Windows servicing branches do not form a perfectly linear history. The same logical version can appear as multiple binaries for 22H2, 24H2, 25H2, or 26H1, and release dates can cross. I therefore treated file version and policy contents as the primary ordering and used KB dates as supporting provenance.

## Version 2: no longer just the default browser

Version 2.0 added the first major expansion:

```text
Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice
SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\DeviceRegion
FeatureV2
```

It also introduced `UserChoiceLatest` and `UserChoicePrevious` forms for HTTP, HTTPS, and PDF. `UserChoiceLatest` would not become operationally important until much later, when Windows enabled its new association-hash rotation design. Christoph eventually documented that migration in [UserChoiceLatest – Microsoft’s new protection for file type associations](https://kolbi.cz/blog/2025/04/20/userchoicelatest-microsofts-new-protection-for-file-type-associations/).

The code had been waiting in UCPD since 2023.

The deny list also changed. Version 2 removed `svchost.exe` and added `powershell.exe` and `regedit.exe`. Version 2.1 added `wscript.exe` and `cscript.exe`; version 2.2 added `cmd.exe`.

Version 2.1 was also where UCPD visibly escaped its name. It added registry rules for Windows UI features:

```text
SOFTWARE\Microsoft\Windows\CurrentVersion\Feeds
SOFTWARE\Microsoft\Windows\CurrentVersion\NandI
Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced

ShellFeedsTaskbarViewMode
IsFeedsAvailable
TaskbarDa
```

At that point, “User Choice Protection Driver” was already becoming a misleading description. It was protecting choices, but they were no longer limited to file associations.

## Version 3: defending trusted processes from other processes

The jump from 2.2 to 3.0 is the first enormous one: 41 KB became 86 KB and 74 functions became 143.

This is where the problem changed from “who made this registry call?” to “can I trust what is running inside the process that made it?”

Version 3 added process and publisher vocabulary for Kingsoft, Qihoo/360, Edge, Explorer, and Opera. It classified selected processes and used object callbacks to prevent particular vendors from injecting into trusted Microsoft processes or driving the Settings UI through desktop journal playback.

The driver also expanded its registry surface to Search and Taskband, while the deny list gained `InfDefaultInstall.exe` and `pwsh.exe`.

Version 3.1 is an interesting reminder that this history is not monotonic. One 3.1 build contains the Copilot `BrandedKeyChoiceType` rule; another removes its path and value strings. Version 4.0 restores them. That looks like branch divergence or A/B feature experimentation rather than a feature being implemented once and permanently enabled.

The manager confirms the feature-driven design. I recovered the original UCPDMgr input from my old Binary Ninja database, then downloaded its matching PDB from Microsoft’s symbol server. Its feature traits include:

```text
UCPD
UCPDV2
UCPD_PRONG1
UCPD_PRONG2
UCPD_TASKBAR
UCPD_WSB
UCPD_ANTIUIA
UCPD_ANTIINJECTION
UCPD_NEWDENYLIST
UCPD_RENAME_ATTACK
```

UCPDMgr did not invent the policies. It translated Windows Feature Staging decisions into the `FeatureV2` mask consumed by the driver.

## Version 4.1: a general registry integrity engine

Version 4.0 broadened the publisher and regional policies, but 4.1 is the more important conceptual transition. It added:

-   unknown-file/OpenWith handler repair
-   `.htm` and `.html` associations
-   Word, Excel, and PowerPoint associations
-   `UserChoiceLatest\ProgId` rules
-   registry security and ACL operations
-   explicit delete and rename handling for the new families

The Unknown handler is especially illustrative. Windows expects these keys to launch the real `OpenWith.exe`:

```text
SOFTWARE\Classes\Unknown\shell
SOFTWARE\Classes\Unknown\shell\open\command
SOFTWARE\Classes\Unknown\shell\openas\command
```

UCPD contains the expected command, DelegateExecute CLSID, and dedicated `UnknownModify`, `UnknownDelKey`, and `UnknownRenKey` paths. This is not about choosing a browser. It is registry integrity protection against replacing a trusted shell action with an attacker-controlled command.

Version 4.1 also removed the remaining `UserChoicePrevious` strings. Windows kept `UserChoiceLatest`; the earlier fallback design apparently did not survive.

## Version 4.2: a signed policy channel appears

Version 4.2 grew from 119 KB to 135 KB and added the machinery that led to my dynamic-rules article:

```text
\REGISTRY\MACHINE\SYSTEM\CurrentControlSet\Services\UCPD\DR

Base64Decode
ParsePEFormat
CalculatePEHashInMem
CertificateVerify
DecryptData
DispatcherConfig

AntiInjection
AllowListV1
DenyListV1
```

The registry value is a Base64-encoded, data-only PE. UCPD parses it, verifies its Microsoft signature, decrypts the `.rdata`, and dispatches nested TLV records into independent policy structures.

This solved an operational problem for Microsoft. Before this mechanism, changing UCPD policy required a new driver and usually a reboot. A signed registry policy can change deny/allow, injection, UI Automation, or stack-trace rules independently.

The same version also contains explicit paths for protecting the UCPD service and `DR` key themselves. A remotely updatable kernel policy is only useful if another administrator-level process cannot replace its input.

## Version 4.3: trust the original file and the entire stack

Version 4.3 added two names that summarize the next defenses:

```text
ParseOriginalFileName
StackTrace
```

The original UCPD trust rule had a wonderfully simple weakness: copy a Microsoft binary under another name. Its signature remained valid, but it no longer matched the utility deny list. VMware even used this approach for its default-association tooling.

The OriginalFilename check closes that gap by reading the PE version resource and comparing the program’s real name rather than trusting its current path.

The stack check addresses the other obvious route. Even if the registry write originates in `SystemSettings.exe`, UCPD can walk the stack, identify the loaded modules behind the call, and reject the operation when a blocked publisher appears in the chain.

At this point, the trust decision looked more like this:

```text
registry operation
      |
      +-- protected path/value/operation?
      |
      +-- Microsoft-signed caller?
      |
      +-- denied utility by path or OriginalFilename?
      |
      +-- blocked process/publisher classification?
      |
      +-- suspicious module publisher in stack?
      |
      `-- allow or deny, then emit telemetry
```

## Version 4.4: CrossDeviceResume

Version 4.4 introduced a previously undocumented rule family named `CrossDeviceResume`. It protects five path/value pairs:

| Path suffix | Value |
| --- | --- |
| `CrossDeviceResume\ResumeIntent` | `AppIconPath` |
| same | `AppDisplayName` |
| same | `IsAppInstalled` |
| `CrossDeviceResume\Notification` | `Status` |
| `CrossDeviceResume\Configuration` | `OverlayIconPath` |

In the later driver, this family is controlled by `FeatureV2` bit `0x08000000` and has a dedicated `CrossDeviceResume` ETW label.

The names strongly suggest protection against spoofing a cross-device resume notification: which app it claims to represent, its icon, whether it is installed, and its notification state. I have not found public documentation for this internal registry schema, so that interpretation is an inference rather than a confirmed product contract.

Version 4.4 also adds `regini.exe` to the hardcoded deny list and makes the dynamic loader’s `CertificateVerify` stage explicit in its event vocabulary.

## Version 4.5: GamingConfiguration

Version 4.5 added another complete policy family:

```text
Software\Microsoft\Windows\CurrentVersion\GamingConfiguration
    DefaultGamingApp
    DefaultToGamingExperience
```

This is controlled by `FeatureV2` bit `0x40000000`. Unlike a coincidental registry string, it has dedicated paths for every important operation:

```text
SetGameConfig
DelGameConfig
RenameGameConfig
DeleteGameConfigValue
GameConfig
```

Microsoft’s current [Gaming Configuration documentation](https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/microsoft-windows-gaming-configuration) describes an OEM-configurable full-screen gaming experience, including the gaming-home app launched at startup. The public setting names differ, but `DefaultGamingApp` and `DefaultToGamingExperience` line up closely with that design.

The security motivation is sensible: a third-party program should not silently install itself as a shell-like gaming launcher or force the device to start in that experience.

## Version 4.6: FeatureV3 and the broken cipher

Version 4.6 adds three particularly revealing strings:

```text
FeatureV3
SHA512
Unknown publisher
```

`FeatureV2` is a 32-bit `REG_DWORD`, and by this point Microsoft had assigned nearly every bit. `FeatureV3` is a separate 64-bit `REG_QWORD`. The 4.7 manager’s public PDB identifies its writer exactly:

```c
SetFeatureV3Status(__int64 mask)
```

It currently maps seven Windows feature IDs into bits 0 through 6. The feature traits have only numeric names, so the PDB tells us their IDs but not their product descriptions. The driver consumes those bits in its rule database and in several distinct enforcement paths.

This also dates the dynamic-rule crypto bug more precisely.

The captured DR policy was encrypted using the old MD5-derived CS64 algorithm. Version 4.6’s consumer uses SHA-512 to derive its state. The policy consequently decrypts to garbage. The loader existed in 4.2, while the incompatible SHA-512 change appears in 4.6.

That does not prove the entire mechanism can never work. It proves that the captured producer and this consumer disagree. Microsoft could correct the policy producer without changing UCPD again.

## Version 4.7: the dynamic deny list becomes the baseline

The DR sample contained 14 denied Microsoft utilities:

```text
dllhost.exe          reg.exe             rundll32.exe
powershell.exe       regedit.exe         wscript.exe
cscript.exe          cmd.exe             InfDefaultInstall.exe
pwsh.exe             wmiprvse.exe        regini.exe
bssafe.exe           mshta.exe
```

In 4.6, the last two existed only in the captured dynamic policy. Version 4.7 adds `bssafe.exe` and `mshta.exe` to the driver’s hardcoded strings, so the static and dynamic lists finally become identical.

Version 4.7 also adds generic matching vocabulary:

```text
*\UserChoice
*\ProgId
*\UserChoiceLatest
\ProgId
```

The explicit paths are still present, but these patterns suggest Microsoft was consolidating parts of the association matching logic rather than continuing to special-case every suffix.

## What changed, conceptually?

Looking across all versions, UCPD evolved through four different jobs:

1.  **Association filter**— protect HTTP and HTTPS UserChoice from simple registry writes.
2.  **Shell-setting filter**— protect PDF, DeviceRegion, Feeds, taskbar, Search, Copilot, and Office associations.
3.  **Process integrity system**— track processes, publishers, loaded modules, injection rights, UI Automation, original filenames, and call stacks.
4.  **Updatable policy engine**— accept Microsoft-signed rule blobs and protect its own configuration.

The name stayed the same while the product changed underneath it.

The pattern of additions also looks much less arbitrary when placed on a timeline. Many changes are direct answers to a bypass:

| Bypass or concern | UCPD response |
| --- | --- |
| Use a Microsoft utility to write the key | Utility deny list |
| Use another utility not yet listed | Expanded and dynamic deny lists |
| Copy a signed utility under another name | OriginalFilename verification |
| Inject into Edge or Explorer | Process/thread handle-right filtering |
| Automate the Settings UI | Desktop/UIA restrictions |
| Inject a module into SystemSettings | Stack/module publisher inspection |
| Delete instead of setting a protected value | Delete-value enforcement |
| Reset the key ACL | SetSecurityKey enforcement |
| Rename a protected key | Rename enforcement |
| Disable features through UCPD’s own registry | Self-protection |
| Require policy changes without a reboot | Signed dynamic-rule PE |

It is an arms race preserved in version history.

## How I built the corpus

I queried Winbindex for every indexed x64 `UCPD.sys`, then downloaded the available PE reconstruction from Microsoft’s symbol server. For each entry I recorded:

-   indexed original SHA-256
-   downloaded-file SHA-256
-   file version and size
-   Windows branch, KB, build, and release metadata
-   PE sections and imports
-   exception-directory function count
-   ASCII and UTF-16 strings
-   CodeView/PDB identity
-   additions and removals relative to the adjacent version

Microsoft no longer serves the corresponding UCPD PDBs for most of this corpus, so this comparison did not depend on symbols. I grouped equivalent branch builds, ordered the remaining versions, and compared their strings, imports, and PE metadata. For important additions, I followed the string references into the machine code to confirm that they created real rules rather than being unused text.

There is an important provenance detail here. The Microsoft symbol server sometimes reconstructs the executable without its original Authenticode certificate overlay. Consequently, the downloaded file can differ from the original indexed SHA-256 and may report `NotSigned` even though it came from Microsoft’s symbol infrastructure.

I kept the two hashes separate and did not treat every reconstruction as independently signature-valid. Several original binaries recovered from my older `.bndb` files still retain their exact signatures, as does the current locally installed pair.

I also gave Codex access to the Binary Ninja databases from my earlier UCPD research, covering snapshots from March 2024 through June 2026. Symbols for `UCPD.sys` were missing for most versions, but Microsoft still served matching PDBs for the corresponding `UCPDMgr.exe` files. Those manager symbols exposed feature traits and helper names that offered another view into the changes, while the driver comparison itself remained symbol-free.

## Conclusion

Following one binary over time tells a different story from analyzing one version deeply.

UCPD began as a small, narrowly focused registry filter at least as early as August 2023. Each generation responded to another way software could influence a supposedly trusted registry operation. By 2026 it had become a region- and feature-dependent kernel policy engine that watches registry operations, process creation, loaded images, object handles, UI Automation, publishers, original filenames, and stacks—and can consume signed policy from the registry.

The most interesting additions are not even about the default browser anymore. Cross-device resume prompts and the default gaming experience are now part of the same protection framework.

I suspect `FeatureV3` is a good indication of what happens next. `FeatureV2` ran out of room, but Microsoft is clearly not finished adding rules.
