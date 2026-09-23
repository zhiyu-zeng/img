---
title: "iOS code signing: AMFI, amfid, trust cache and CoreTrust"
source: https://sigreturn.com/blog/ios-code-signing-pipeline/
source_host: sigreturn.com
clip_date: 2026-09-23T10:09:30+08:00
trace_id: f6d68ac3-8eed-4eda-9779-0d50f6e893e9
content_hash: 9ff43debc18febb72deb571163315522f779de2db232c8389a311008e6ba75e4
status: synced
tags:
  - iOS逆向
  - 漏洞分析
series: null
feed_source: Sigreturn Labs·Apple internals
ai_summary: iOS 可执行性裁决按固定流水线进行：信任缓存 → CoreTrust → amfid+描述文件，任一环节的逻辑缺陷比内存破坏更致命。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-8138-8c87-d4eace586e63
ioc:
  cves:
    - CVE-2020-9842
    - CVE-2022-26766
    - CVE-2022-42855
    - CVE-2023-41991
  cwes: []
  hashes:
    - 0023c7654da7272bbd68953586f1a299b8bed350
    - 00262ea6bb7dcf7ee984c8280a6e5e5ac7a14584
    - 0037fc2307eae66eaf7139916862dc2b7336b43f
    - 1205ca11b1c3f706109656bcf4e2c12439d843b7
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> iOS 可执行性裁决按固定流水线进行：信任缓存 → CoreTrust → amfid+描述文件，任一环节的逻辑缺陷比内存破坏更致命。
> 
> - **裁决流水线：** AMFI 挂在通用 MACF 框架（仅分发、deny-wins），exec 时 `mac_vnode_check_signature` 依次查信任缓存（命中即作平台二进制运行，全程无 CMS 校验）、CoreTrust（内核内验证 CMS 链至固定 Apple 根证书）、amfid（比对描述文件），全失败则 SIGKILL。
> - **核心身份：** cdhash 是 CodeDirectory 的 20 字节哈希，为二进制规范身份；信任缓存即其白名单，静态缓存随内核启动加载、只读锁定，可加载缓存在运行时注入。
> - **攻击手法：** 有内核读写即可改 `cr_label` 中 AMFI 标签槽、`p_csflags` 或向可加载信任缓存追加 cdhash 来伪造裁决；但 A15+ 的 TXM/SPTM 把裁决移出内核地址空间，这些手法失效。
> - **逻辑优于破坏：** Psychic Paper（三方 plist 解析器不一致）、DER 版 CVE-2022-42855、CoreTrust 未校验根锚点 CVE-2022-26766（TrollStore 1 基础）均为检查照常执行却返回错误裁决。
> - **权限与关停：** `get-task-allow` 任意签名者可携带，`platform-application` 等受限权限需授权且第三方描述文件不授予；`amfi_get_out_of_my_way` 需 SIP 已关，iOS 生产机不可用。

[The previous post](https://sigreturn.com/blog/xnu-under-the-hood/) ended on a single field. Inside every process’s credentials, `p_ucred`, sits `cr_label`, a slot the kernel reserves for the Mandatory Access Control Framework. AMFI and the sandbox hang their per-process policy there. This post is about what hangs there.

Every time a process is created, through `execve` or `posix_spawn`, the kernel answers one question before it runs a single instruction of the new image: may these bytes execute? Anyone who has built for iOS has seen the visible answer, the log line `AMFI: code signature validation failed`. That line names AMFI, Apple Mobile File Integrity, so it is easy to read AMFI as *the* code-signing check. It is one policy module plugged into a generic kernel framework, and the verdict it reports comes out of a pipeline behind it, walked in a fixed order.

Note

Everything here is public: Apple’s open-source XNU, the Apple Platform Security documentation, and published research from Siguza, Project Zero, Linus Henze and others. It contains no exploit, private detail, or 0day.

## MACF: the framework AMFI plugs into

**MACF** was inherited from TrustedBSD and wired into XNU. It is not a security policy and enforces nothing on its own. It is a registration and dispatch layer: hook points placed through the kernel at every sensitive operation, into which separate *policy modules* register their callbacks.

AMFI is one of those policy modules, and so is the sandbox. `AppleMobileFileIntegrity.kext`, a kernel extension (kext), is a set of `mpo_*` callbacks hung on MACF hook points. That is why the two acronyms always show up together in a stack trace: AMFI is the policy, MACF is the mechanism it runs on. The sandbox, covered in the next post, is a second set of callbacks on the same hooks.

Two properties of the framework are load-bearing for an attacker.

Checks are deny-wins: when several policies implement the same check, the kernel keeps the most restrictive answer, so AMFI and the sandbox each hold an independent veto over the same operation. A bug that makes AMFI return “allow” early does not disable the sandbox’s hook on that operation, and the reverse is also true.

Each policy keeps its state in label slots on the objects the kernel tracks, and the one that matters here is `cr_label`, on a process’s credentials, the field we met at the end of the last post. AMFI’s per-process code-signing verdict and the sandbox’s compiled profile both live in it. The offensive consequence is direct: with kernel read/write, editing that slot rewrites the verdict the policy stored. Patch the AMFI slot and the recorded verdict says your process passed; patch the sandbox slot and the process is no longer confined. The framework is also its own target, since corrupting the policy list turns enforcement off wholesale. The sanctioned form of exactly that switch is the boot argument `amfi_get_out_of_my_way`.

## What a signature is, ending at the cdhash

What the kernel decides *about* is the code signature embedded in the Mach-O, and it reduces to a single 20-byte number.

The invariant the whole component exists to enforce is **W^X (write xor execute) plus code integrity**: no page of memory is ever both writable and executable, and the contents of every executable page hash to a value a trusted party signed. Break that and a memory-corruption bug stops being a crash and becomes persistent native code, which is why every jailbreak eventually has to defeat this layer.

A signed Mach-O carries an `LC_CODE_SIGNATURE` load command pointing at a blob in its `__LINKEDIT` segment. That blob is a **SuperBlob** (magic `0xFADE0CC0`): a small header, a count, and an index of `(type, offset)` pairs, each pointing at a sub-blob. The sub-blobs are the parts of the signature:

| Sub-blob | What it holds |
| --- | --- |
| CodeDirectory | the page-hash array, and the thing the cdhash is a hash *of* |
| Entitlements (XML or DER, Distinguished Encoding Rules) | signed key/value capabilities |
| Requirements | rules a valid signer must satisfy |
| CMS wrapper | the cryptographic signature itself, a CMS (Cryptographic Message Syntax, PKCS#7) structure |

The **CodeDirectory** is the sub-blob that matters. It holds one hash per 4 KiB page of the signed region: the **code slots**. When a page is first faulted in, the virtual-memory system hashes it and compares it to the stored slot (`cs_validate_page`). Every normal process on iOS carries the `CS_HARD | CS_KILL` flags, so a mismatch is fatal: the kernel kills the process on the spot with `SIGKILL`, the signal a process cannot catch or ignore. That per-page check on first fault is the mechanism behind “you cannot patch a signed page in memory”. The exception is a page in a region that was never signed at all, which is the JIT (just-in-time compiled code) hole we return to later.

The CodeDirectory also binds the other sub-blobs into itself through **special slots**, each holding the hash of one sub-blob. You cannot alter the entitlements blob without changing the CodeDirectory, which is why the entitlement parser bugs later in this post are interesting.

And now the number. The **cdhash** is the hash of the CodeDirectory blob itself, truncated to `CS_CDHASH_LEN`, **20 bytes**, whatever the underlying algorithm. It is the canonical identity of a binary, and every mechanism downstream keys on it: the trust cache is an allowlist of cdhashes, a launch-constraint category is assigned per cdhash, amfid’s reply is a cdhash, `csops(CS_OPS_CDHASH)` hands one back to userland. In the kernel it lives in a `struct cs_blob` hanging off the file’s vnode, the kernel’s handle on a file.

A binary is, for this purpose, its cdhash. “May these bytes run?” becomes “what does the kernel do with this 20-byte value at exec?”

## The verdict pipeline

At exec, the kernel’s `mac_vnode_check_signature` entry point calls AMFI’s `mpo_vnode_check_signature` callback, the routine that produces the verdict. The other AMFI hooks around it do the smaller jobs: setting the `CS_HARD | CS_KILL` flags, enforcing library validation on loaded dylibs, gating `MAP_JIT` and `get-task-allow`. The signature check is the one that decides whether the process runs at all.

Inside that check, AMFI computes the binary’s cdhash and walks a pipeline. **The order matters**, because each stage trusts a different thing and has a different attack surface:

| Step | What AMFI checks | On a match | CMS validated? |
| --- | --- | --- | --- |
| 1\. Trust cache | cdhash present in the static or a loadable trust cache | runs as a **platform binary** | **No** |
| 2\. CoreTrust | CMS chain validates to a pinned Apple root; classify the signer | App Store signer runs directly | Yes, in the kernel |
| 3\. amfid + profile | signer and entitlements checked against a provisioning profile | developer / enterprise binary runs | Yes (via CoreTrust) plus the profile |
| none of the above | nothing vouches for the cdhash | `SIGKILL` | not reached |

Read top to bottom, this is the entire answer to “may these bytes run?” The first row is the one that matters most: for most of the code on the device, there is no cryptography at exec time at all.

## Trust caches: the allowlist

The base OS is thousands of Mach-O files, and validating a CMS chain for each one on every launch would be slow. Apple’s answer is an allowlist. A **trust cache** is a sorted list of cdhashes trusted *without* any signature validation: if a binary’s cdhash is in the cache it runs immediately as a platform binary, and the CMS blob is never read. That is step 1 of the pipeline, and the path taken by essentially the whole OS.

The cache is carried in an Image4 container (an `IM4P` payload, the format from [the boot-chain post](https://sigreturn.com/blog/ios-chain-of-trust/)), tagged `trst` for the static cache, `rtsc` for a restore cache, `ltrs` for a loadable one. Inside is a short header (version, uuid, entry count) followed by sorted `{ cdhash, hashType, flags }` entries, so a lookup is a binary search on the 20-byte cdhash. Version 2 adds a byte tying each entry to a launch-constraint category.

There are two kinds. The **static trust cache** is a signed Image4 object loaded alongside the kernelcache at boot, one per system disk image, and locked read-only after early boot: the allowlist for the shipped OS. **Loadable trust caches** are added at runtime, for a mounted disk image’s contents or a developer’s binaries.

This is one of the jailbreak’s oldest techniques. Before the page-table monitors existed, a loadable trust cache lived in ordinary writable `__DATA` kernel memory, and an exploit with kernel read/write appended its own binaries’ cdhashes to it. From that moment those binaries ran as platform code with no signature check. Electra’s `inject_trusts` is the canonical example, adding the cdhashes of `amfid_payload.dylib` and the rest of the jailbreak’s userland.

### Aside: injecting a cdhash by hand in lldb

Attach a kernel debugger, lldb against a target matched to its Kernel Debug Kit, and you have kernel read/write for free, the same position a finished exploit is in when it reaches this step. On a build where the loadable trust cache still sits in writable kernel memory, the move is short: find the module, read its header, write your binary’s cdhash into a fresh entry, and raise the count over it.

```ruby
(lldb) # a loadable trust cache module in kernel memory
(lldb) #   (recover the list-head symbol during symbolication)
(lldb) p (struct trust_cache_module1 *)<trust cache module>
(struct trust_cache_module1 *) $0 = 0xfffffff0<...>

(lldb) # header: version, a 16-byte uuid, then the entry count
(lldb) p $0->num_entries
(uint32_t) $1 = 41

(lldb) # each entry is { cdhash[20], hash_type, flags }, kept sorted
(lldb) # write your binary's cdhash (the 20 bytes from codesign -dvvv)
(lldb) # into the next slot, then raise the count over it
(lldb) memory write --infile cdhash.bin &$0->entries[41]
(lldb) expr -- $0->num_entries = 42
```

Two things make this harder than the four lines suggest. The entries are sorted so the lookup can binary-search them, so a correct injection inserts in order, or splices in a fresh single-entry module, which is what real injectors do. And it only works where that memory is writable: on a PPL device (Page Protection Layer, the pre-A15 page-table monitor) the trust cache lives in `pmap_cs` pages the kernel may not write, and on an SPTM device (Secure Page Table Monitor, its A15-and-later replacement) it is a monitor-owned frame. The identical write faults.

## CoreTrust: the check that moved into the kernel

If the cdhash is not in a trust cache, the binary has to prove itself with its CMS signature. This stage exists because of what it replaced.

For years the real signature validation happened in userland, in the `amfid` daemon we meet next. The kernel’s AMFI would compute a cdhash, hand it to amfid, and trust amfid’s yes-or-no answer. That design has an obvious weakness once an attacker has kernel read/write: patch amfid. Every jailbreak of that era did. LiberiOS pointed amfid’s import of the validation function at a bad address and caught the resulting fault; Electra rebound it to a `fake_MISValidateSignatureAndCopyInfo` that simply returned success.

**CoreTrust** removed that weakness. It is an in-kernel validator (packaged as `CoreTrust.kext` on most builds) that parses the CMS `SignedData` structure, builds the X.509 certificate chain (X.509 is the standard certificate format), verifies every signature in it, and confirms the chain terminates at an **Apple root certificate pinned inside the kernel**. It then classifies the leaf certificate by its extensions into a signer class, App Store, developer or enterprise, and hands those *policy flags* back to AMFI. It deliberately does not look at entitlements or provisioning profiles; its entire job is “is this a genuine Apple-rooted signature, and of what kind.”

The consequence is that a patched amfid is no longer enough on its own. The cryptographic decision lives in the kernel now, anchored to a key an attacker with read/write can read but cannot make the CMS math validate against. With no valid Apple-rooted chain the binary dies in CoreTrust before amfid is ever asked, so jailbreaks moved their code-execution root to trust-cache injection and, later, to logic bugs in CoreTrust itself.

Its entire input is attacker-controlled ASN.1 (the tag-length-value encoding certificates are written in), which makes the parser and the chain-validation logic a target in their own right. CVE-2022-26766 is a real one, walked below.

## amfid and provisioning profiles

**amfid** (`/usr/libexec/amfid`) is the userland daemon behind the third row of the pipeline, the one that carries third-party code: apps signed by a developer or an enterprise rather than baked into the OS or shipped through the App Store. The kernel’s AMFI reaches it over a dedicated Mach special port (port 18). It validates the binary against the **provisioning profiles** installed on the device, by calling `MISValidateSignatureAndCopyInfo` in `libmis`, and returns the cdhash and signer information.

A **provisioning profile** is a CMS-signed plist, stored under `/var/MobileDeviceProvisioningProfiles`, that binds four things together:

-   the developer or enterprise **certificate(s)** allowed to sign,
-   the **entitlements** the binary is permitted to claim,
-   the **device UDIDs** (per-device unique identifiers) it may run on,
-   an **expiry date**.

amfid cross-checks the binary’s actual signer and requested entitlements against this profile. That is the machinery behind a detail every iOS developer has hit: a free “personal team” profile expires in **7 days**, so a sideloaded app stops launching a week later. Enterprise profiles last far longer, which is why enterprise certificates are what sideloading and iOS malware distribution run on.

## Entitlements: signed capabilities

Entitlements have come up at every stage; here is the definition. An **entitlement** is a signed key/value pair bound into the CodeDirectory by a special slot, so it cannot be altered without changing the cdhash. It is a capability the signer cryptographically granted.

They fall into three groups:

| Group | Examples | Who may carry it |
| --- | --- | --- |
| Benign | `get-task-allow` | any developer-signed binary |
| Restricted | `platform-application`, `com.apple.private.*`, `apple-internal` | only Apple-signed or specially provisioned binaries |
| Sandbox exceptions | file and `mach-lookup` exceptions | granted here, enforced by the sandbox module |

AMFI enforces that a third-party binary may carry only the entitlements its provisioning profile authorizes; it cannot simply ask for `platform-application` and receive it. Forging membership in the restricted group, getting the kernel to believe a binary holds an entitlement it was never granted, is what the signature bugs below go after.

The last group is the handoff to the next post. A sandbox exception is an entitlement AMFI validates here, at exec, and that the sandbox *consumes* at runtime to widen what the process may touch.

## The offensive angle: logic beats corruption

So where are the bugs? The memory-safety surface is real: the CMS ASN.1 decoder and the CodeDirectory’s bounds arithmetic are reachable from anything that gets a Mach-O parsed, and worth fuzzing. But the defining bugs of this component are **logic**. A logic bug in the code-signing policy needs no heap shaping, survives kalloc_type (the type-segregated kernel allocator), is untouched by memory tagging and is unaffected by the page-table monitor. The check runs exactly as written and still returns the wrong verdict. Three cases show the pattern.

**Psychic Paper** (Siguza, 2020, CVE-2020-9842, fixed in iOS 13.5) is the clearest case. iOS parsed the entitlements blob with three different plist parsers, `OSUnserializeXML` in the kernel, `CFPropertyListCreateWithData` in amfid, and libxpc’s `xpc_create_from_plist`, and Siguza found a comment construct they read differently: one saw a harmless plist, another an entitlement that was not there. The launch-time check validated the benign reading while the runtime granted the malicious one, so an unprivileged app could claim any entitlement it liked, up to `platform-application`. No memory was corrupted, two parsers disagreed, and the disagreement granted the entitlement. The fix added `AMFIUnserializeXML` to both AMFI and amfid and rejects the blob when its reading disagrees with the old parsers.

**The DER sequel** (Ivan Fratric, Project Zero, CVE-2022-42855, fixed in iOS 15.7.2) is the same bug in binary form. Apple had moved entitlements to DER partly to end these differentials, since DER is meant to have exactly one canonical reading, but `libCoreEntitlements` had three traversals that disagreed on how far a sequence extended. An entitlement smuggled in as an extra element was honored at runtime and invisible to the check meant to reject it.

**The CoreTrust root bug** (Linus Henze, CVE-2022-26766, fixed in iOS 15.5) attacked the certificate check instead of the parser, and it has the largest footprint. CoreTrust validated the CMS chain but never confirmed it terminated at an Apple root, so a certificate merely *carrying the App Store extension*, whoever issued it, made CoreTrust set the App Store flag and AMFI run the binary with nearly any entitlement. This is the primitive behind **TrollStore 1**: permanent, arbitrary code signing, with no memory corruption anywhere in it.

When the bug is in the kernel instead of the policy, this same component is the last step of post-exploitation. With kernel read/write, an attacker does not need a fresh signing bug: append a cdhash to a loadable trust cache, flip `CS_PLATFORM_BINARY` and clear `CS_HARD | CS_KILL` in a process’s `p_csflags` (its code-signing flags word), or edit the AMFI label slot to grant an entitlement. Each is a data-only write that turns “I control kernel memory” into “I run whatever code I want.” On pre-PPL hardware they all land as written; on a PPL device they need a PPL bypass first, for the reason the aside gave.

## State in 2026

The pipeline above has not moved, but forging a verdict now takes more than a kernel write.

**TXM, the Trusted Execution Monitor, makes the decision now.** On A15 and M2 and later running iOS 17 or newer, the SPTM devices, Apple moved the code-signing verdict out of the XNU address space entirely. TXM runs above the kernel and holds the trust caches, the provisioning-profile registry and the signature objects in memory the page-table monitor never maps writable to the kernel. That is the lldb aside generalized: trust-cache injection and `p_csflags` forging are **dead** on this hardware. Post-exploitation now needs a monitor bug on top of the kernel bug, a subject for the hardening post later in this series.

The rest, in brief:

-   **DER entitlements are the enforced form** since iOS 15, retiring the XML parser-differential class, though the DER decoder produced its own CVE-2022-42855.
-   **Launch constraints** (iOS 16, everywhere by 2026) pin a system binary to the context it may launch in, closing the “reuse an old Apple-signed binary” and “repurpose a privileged helper” tricks.
-   **CoreTrust was hardened** after CVE-2022-26766: the root anchor has been enforced since iOS 15.5. The same component then produced a second TrollStore-grade bug, CVE-2023-41991, a multiple- `SignerInfo` validation flaw that carried TrollStore 2 through iOS 15.5 to 16.6.1 and 17.0 and was fixed in 16.7 and 17.0.1. Permanent signing died with that fix, not with the 2022 one.
-   **Developer Mode** (iOS 16) replaced the ad-hoc “just disable AMFI” paths with a signed, reboot-gated state.

What still works is the logic, for the reason the offensive section gave: a differential in the *policy* corrupts nothing, so none of these mitigations apply to it. The JIT hole is permanent by construction too: a process holding `dynamic-codesigning` owns a legitimately writable-then-executable mapping, and a bug inside such a process, a browser’s JavaScript engine being the obvious one, reaches native code without touching any of this machinery.

## Hands-on: dumping the policy off a real binary

You can watch this whole pipeline from a Mac, no jailbreak needed, because every value it turns on is dumpable from a signature and a firmware image.

**1\. Read the SuperBlob and the cdhash.** `codesign -dvvv` prints the CodeDirectory summary and the cdhash for any signed binary. `/bin/ls` is a good first target, one of Apple’s own platform binaries:

```bash
codesign -dvvv /bin/ls
```

```
Executable=/bin/ls
Identifier=com.apple.ls
Format=Mach-O universal (x86_64 arm64e)
CodeDirectory v=20400 size=741 flags=0x0(none) hashes=18+2 location=embedded
Hash type=sha256 size=32
CDHash=1205ca11b1c3f706109656bcf4e2c12439d843b7
Signature size=4442
Authority=Software Signing
Authority=Apple Code Signing Certification Authority
Authority=Apple Root CA
TeamIdentifier=not set
```

`hashes=18+2` is 18 code slots plus 2 special slots, and `CDHash=1205ca11...` is the 20 bytes everything downstream keys on. The `Authority=` chain is what CoreTrust validates, terminating at `Apple Root CA`; the `Software Signing` leaf marks this as Apple’s own platform code, which is why it carries no team identifier and no entitlements.

**2\. See the allowlist itself.** `ipsw fw tc` pulls the trust caches out of an IPSW (Apple’s signed firmware bundle): the static `trst` cache for the system volume, plus an `rtsc` restore cache for each restore ramdisk. Point it at the IPSW, not at a decompressed kernelcache:

```bash
ipsw fw tc iPhone10,3,iPhone10,6_15.0_19A346_Restore.ipsw
# ipsw fw tc --remote '<IPSW URL>' streams it instead of downloading
```

```
UUID:       E45C2F07-B759-44D4-BBD5-B3844FDBBED6
Version:    1
NumEntries: 2407
    0023c7654da7272bbd68953586f1a299b8bed350 sha256
    00262ea6bb7dcf7ee984c8280a6e5e5ac7a14584 sha256
    0037fc2307eae66eaf7139916862dc2b7336b43f sha256
    ...
```

This IPSW carries three; the system volume’s is the big one, **2,407** cdhashes, each a 20-byte value like the one `codesign` printed for `/bin/ls` in step 1, sorted for the binary search. Nearly all of the OS runs as platform code because its cdhash is one of these, with no CMS validation at all.

**3\. Try to grant yourself an entitlement.** Steps 1 and 2 read Apple’s policy off finished binaries; now sign a capability into one. This is a macOS demonstration, because macOS runs locally-signed code at all; on iOS the binary would be killed for having no trust-cache entry and no Apple signature, long before entitlements came up.

A freshly compiled binary is ad-hoc signed by the linker and carries no entitlements. Sign a benign one in, the macOS debug entitlement `com.apple.security.get-task-allow`, and it still runs: any signer may carry that key, because it grants no authority the system has to vouch for. `platform-application` is the other kind. It marks a binary as Apple’s own platform code, the `CS_PLATFORM_BINARY` from the pipeline, so a self-signed binary must not be able to claim it:

```bash
cd /tmp
printf 'int main(void){return 0;}\n' > hello.c && clang -o hello hello.c
echo '{"platform-application":true}' | plutil -convert xml1 -o restricted.plist -
codesign -s - --entitlements restricted.plist -f ./hello
./hello; echo "exit: $?"
# zsh: killed  ./hello
# exit: 137
```

A `SIGKILL`, before `main`. With `log stream --predicate 'sender == "kernel"'` open in another Terminal, the reason prints as the process dies:

```
kernel: mac_vnode_check_signature: /private/tmp/hello: code signature validation failed fatally:
  Code has restricted entitlements, but the validation of its code signature failed.
kernel: validation of code signature failed through MACF policy: 1
```

`platform-application` is a **restricted** entitlement, so carrying it forces the signature to be *authorized* to carry it, and an ad-hoc signature is authorized by nobody. Note the check: `mac_vnode_check_signature`, failing `through MACF policy`, the exact hook and framework from the top of this post.

Sign the same binary with a genuine Apple Development identity and it dies the same way, exit 137, on the same `mac_vnode_check_signature` kill. Holding a real certificate is not authorization to carry a restricted entitlement. A developer can unlock some restricted entitlements with a provisioning profile, but `platform-application` is not one of them: no third-party profile grants it. Signing lets you *write* any entitlement into the blob and confers no authority to *use* a restricted one. That is what a bug like Psychic Paper bought.

**4\. Turn the enforcement off, and see what that takes.** The sanctioned off-switch is the boot argument from the MACF section, `amfi_get_out_of_my_way`: set it and AMFI’s hooks allow without checking, so unsigned code runs. On a Mac it goes in NVRAM, the non-volatile store the boot loader reads at startup:

```bash
sudo nvram boot-args="amfi_get_out_of_my_way=0x1 cs_enforcement_disable=1"
```

On a stock machine that command changes nothing. The kernel ignores AMFI-disabling boot-args unless System Integrity Protection (SIP) is already off, and SIP comes off only from recoveryOS with `csrutil disable`, on Apple Silicon only after lowering the machine’s security policy from Full to Reduced.

On iOS none of that is available: a production iPhone will not let you write boot-args, and its release kernel would ignore them if you could. The argument is honored only on Apple’s own development-fused hardware, or on a device whose boot chain you have already broken: a checkm8-class Boot ROM bug that lets you patch iBoot and inject boot-args, or a kernel already patched by a jailbreak. You can only relax code signing if you can influence the boot chain, and the boot chain is the thing built to stop you.

## Where this leaves us

When a process is created, the kernel computes its cdhash and walks a pipeline: the trust cache first (the allowlist that runs the base OS with no cryptography), then CoreTrust (an in-kernel CMS check anchored to a pinned Apple root), then amfid with the provisioning profiles. The outcome is written into the process’s credentials as flags and a label, along with the entitlements it was granted. AMFI runs this, plugged into MACF alongside the sandbox, and its defining bugs are logic: two parsers, or a certificate check, made to disagree.

That last handoff is [the next post](https://sigreturn.com/blog/ios-sandbox/). AMFI has decided what this binary is allowed to *be* and stamped the answer, including its sandbox-exception entitlements, into `cr_label`. The sandbox reads that same label and decides the other question: now that the process is running, what is it allowed to *touch*? It is the second policy module on the same framework, and escaping it is usually a logic problem too.

## Notes and sources

Everything here is drawn from open source, vendor documentation, and published research.

-   Apple, [Apple Platform Security](https://support.apple.com/guide/security/welcome/web), for code signing and trust caches at the vendor-documentation level.
-   Apple’s open-source [XNU](https://github.com/apple-oss-distributions/xnu) is ground truth for the structures named here: `osfmk/kern/cs_blobs.h` (the `CSMAGIC_*` and `CSSLOT_*` values, `CS_CDHASH_LEN`), `osfmk/kern/trustcache.h` (the trust-cache header and entry layout), `bsd/sys/code_signing.h` and `bsd/kern/code_signing/{xnu,ppl,txm}.c` (the `csm_*` monitor interface), and `security/mac_policy.h` (the `mpo_*` MACF hook names).
-   Siguza, [“Psychic Paper”](https://blog.siguza.net/psychicpaper/) (2020), the technical account of the XML entitlement parser-differential and the `AMFIUnserializeXML` fix. Apple’s iOS 13.5 advisory credits CVE-2020-9842 to Linus Henze, not to Siguza, who had held the bug as a 0day.
-   Ivan Fratric, [“DER Entitlements: The (Brief) Return of the Psychic Paper”](https://projectzero.google/2023/01/der-entitlements-brief-return-of.html) (Project Zero, 2023, CVE-2022-42855), the `libCoreEntitlements` DER traversal differential.
-   Linus Henze, the CoreTrust root-anchor bug (CVE-2022-26766), documented on [The Apple Wiki](https://theapplewiki.com/wiki/CoreTrust_Root_Certificate_Validation_Vulnerability); the primitive behind TrollStore 1.
-   Marwan Anastas, [“Modern Jailbreaks’ Post-Exploitation”](https://blog.quarkslab.com/modern-jailbreaks-post-exploitation.html) (Quarkslab, 2018), for trust-cache injection (`inject_trusts`) and the amfid-patching history that CoreTrust ended.
-   Moritz Steffin and Jiska Classen, [“Modern iOS Security Features: A Deep Dive into SPTM, TXM, and Exclaves”](https://arxiv.org/abs/2510.09272) (2025), for TXM as the code-signing monitor and the `txm_kernel_call` path.
-   Jonathan Levin, *\*OS Internals, Volume III: Security & Insecurity* ([newosxbook.com](https://newosxbook.com/index.php)), the reference for AMFI, amfid, CoreTrust, trust caches, and provisioning profiles.
