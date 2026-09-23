---
title: "iOS secure boot chain: SecureROM, iBoot, Image4, checkm8"
source: https://sigreturn.com/blog/ios-chain-of-trust/
source_host: sigreturn.com
clip_date: 2026-09-23T10:08:44+08:00
trace_id: 4b2a54f4-5bad-4c49-8656-0ebcc4559c66
content_hash: 48849b75b82910281e9679f8dd72e1e9c776dd58688c42d98e49493e5d7f6e7f
status: synced
tags:
  - iOS逆向
  - 漏洞分析
series: null
feed_source: Sigreturn Labs·Apple internals
ai_summary: iOS 的安全启动链以只读 Boot ROM 为信任锚，逐级验签直到内核，而 ROM 内的漏洞（checkm8 等）可一次性击穿整条链。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-810c-89b8-da535acb71e7
ioc:
  cves:
    - CVE-2019-8900
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> iOS 的安全启动链以只读 Boot ROM 为信任锚，逐级验签直到内核，而 ROM 内的漏洞（checkm8 等）可一次性击穿整条链。
> 
> - **信任链结构：** Boot ROM/SecureROM 出厂固化 Apple Root CA 公钥不可改；A9 及更早为 Boot ROM→LLB→iBoot，A10+ 直接载 iBoot，A15+ 还加载 SPTM 与 TXM；保证完整性与防降级。
> - **签名容器：** 全链用 Image4（DER 编码 ASN.1），含 IM4P 载荷（四位标签 krnl/ibot/sepi 等）、IM4M 清单即 APTicket（SHA-384 摘要、RSA 签名、证书链，非 CMS/PKCS#7）、IM4R 携带 BNCN 启动 nonce。
> - **个性化与签名窗口：** TSS 按 ECID 与 ApNonce 逐机签发：ECID 防跨设备搬移，nonce 防重放；Apple 停签旧版后仅存的 SHSH blob（.shsh2）可回滚，还需越狱重现 nonce（futurerestore），A12 后基本封死。
> - **启动模式：** 正常启动走完全链；恢复模式停在 iBoot 等待 USB；DFU 停在 Boot ROM，iBSS→iBEC 仍须签名并个性化。
> - **漏洞影响：** checkm8（CVE-2019-8900）为 Boot ROM USB 代码 use-after-free，仅 DFU 加物理 USB 可达，A5–A11 无法修补；只夺取启动链，不破 SEP、密码与静态加密，重启即失效（半受控）。2026 年 usbliter8 把同类 ROM 漏洞扩至 A12/A13 与 S4/S5。Apple Silicon Mac 额外以本机 SEP 签名的 LocalPolicy 选择 Full/Reduced/Permissive 三档安全级别。

Turn on an iPhone and within a few milliseconds it is running an operating-system kernel signed by Apple. The flash storage that holds that kernel is writable and the USB port is exposed, so in principle an attacker who can change the bytes on disk should be able to boot their own code. In practice they cannot, because the device runs a sequence of signature checks that begins in the SoC (the chip itself) and continues until the kernel is loaded. Each stage checks the signature of the next before running it.

Note

Everything in this article is public. It contains no exploit and no 0day.

## The problem: a root of trust

Verification like this is circular unless it ends somewhere: the kernel is trusted because iBoot checked its signature, iBoot because an earlier stage checked its signature, and so on down. Either that goes on forever or it stops at something the device trusts without checking, which is the root of trust. It has to meet two conditions: an attacker must not be able to modify it, and it must hold the reference value every later check compares against.

The chain gives two separate guarantees. Integrity: at each stage, only code signed by Apple runs, so an unsigned kernel never boots. Anti-downgrade: the device refuses an older signed version, so nobody reinstalls an old iBoot to reuse a vulnerability Apple has since fixed.

## The anchor: Boot ROM

The root of trust is the first code the Application Processor (the main CPU, Apple’s AP) runs when it leaves reset. Apple calls it the Boot ROM. Most people who study it call it SecureROM, after the string inside the code. It is read-only memory written when the chip is fabricated, and it contains a small amount of code plus the Apple Root CA public key.

The Boot ROM uses that key to verify that the next stage was signed by Apple before running it. Nothing can change the key or the code after fabrication. That is what lets the Boot ROM serve as the anchor: a modifiable anchor would verify the attacker’s code as readily as Apple’s.

The same property has a cost: a bug in later code can be patched, a bug in read-only silicon cannot. checkm8 is the example.

## The stages: one link at a time

Trust moves up from the anchor one stage at a time, each stage verifying the signature on the next before transferring control to it.

The exact stages depend on the age of the device. On A9 and earlier there is an extra one, the Low-Level Bootloader (LLB): the Boot ROM verifies and runs LLB, which verifies and runs iBoot. On A10 and later the Boot ROM loads iBoot directly. LLB still ships as an image, but it is now identical to iBoot, and iBoot does LLB’s old job in its first internal phase. Up to A14 the chain is three stages; on A15 and later iBoot also loads SPTM (the Secure Page Table Monitor) and TXM (the Trusted Execution Monitor), which come up before the kernel:

```
   Application Processor, out of reset
             │
             ▼
        Boot ROM        immutable, holds the Apple Root CA public key
             │          verify signature, then jump
             ▼
         iBoot          (A10+; older SoCs run LLB before this stage)
             │          verify signature, then jump
             ▼
       kernelcache      XNU + kexts, wrapped in an Image4 container
```

iBoot is a full bootloader: its own USB stack, a command interpreter in development builds, and the code that loads the kernel.

A kernelcache is XNU, the kernel iOS and macOS share, prelinked with the kernel extensions (kexts) the device needs, compressed, and, on every 64-bit device, wrapped in the Image4 container described in the next section.

## Boot modes: normal, recovery, and DFU

The same chain runs differently depending on how the device was started, and each way stops at a different stage.

Normal boot runs the entire chain and starts the OS. Recovery mode runs it up to iBoot, which stops short of the kernel and waits for a host over USB: that is the “connect to computer” screen, and it is what an ordinary restore or update talks to. DFU mode, for Device Firmware Update, stops one stage lower. The device halts in the Boot ROM with the screen black and waits for the host to send the next image, which it checks exactly as it would at normal boot: the host sends iBSS, the restore first stage, which in turn loads iBEC, and each has to be signed and personalized for that device or the Boot ROM refuses it. DFU is used for the lowest-level restores, and it is the mode a Boot ROM exploit needs, because the USB code listening there belongs to the Boot ROM itself.

```
   Boot ROM ──▶ iBoot ──▶ kernelcache ──▶ iOS     normal boot
       │           │
       │           └──▶ iBoot waits on USB        recovery mode
       │                ("connect to computer")
       │
       └──▶ Boot ROM waits on USB                 DFU mode
            (screen black; checkm8 attacks the USB code here)
```

## Image4: the container everything is signed in

Every signed object in the chain uses the same container: Image4, written IMG4. iBoot, the kernelcache, the device tree, the Secure Enclave Processor (SEP) firmware, and the restore ramdisk are all IMG4 files. It is an ASN.1 structure in DER encoding, the same tagged binary format X.509 certificates use, with three parts that matter here.

The payload is the IM4P: a four-character tag naming the contents (`krnl` for the kernelcache, `ibot` for iBoot, `sepi` for the SEP firmware), a description string such as a build version, the payload bytes, and the compression scheme if there is one. Two appear in practice: LZSS, which Apple wraps in a `complzss` header, and LZFSE, Apple’s own compressor. An encrypted payload also carries a KBAG, its wrapped key material.

The manifest is the IM4M; the personalized copy a device actually boots under is the APTicket. It lists the expected digest (SHA-384 on modern devices) of every image in the boot chain, plus a set of manifest properties, an X.509 certificate chain, and an RSA signature over all of it. That chain terminates at an Apple-controlled secure-boot root whose public key is the one held in the Boot ROM. Despite the certificates, this is not a CMS (Cryptographic Message Syntax) or PKCS#7 signature, as is often claimed, but an Apple-specific structure.

The restore info is the IM4R. It carries the boot nonce, tagged `BNCN`.

Verifying an image against a manifest is three steps: the manifest’s signature is valid and chains to Apple; its properties match this silicon and this boot (chip ID, board ID, the ECID or Exclusive Chip Identification, the boot nonce, the production and security state); and the image about to run hashes to the digest the manifest lists for it.

## Personalization and the signing window

The checks so far verify a signature. They do not explain why a valid, Apple-signed iBoot from an old release cannot be installed today. That takes a separate mechanism.

Apple signs each build per device and per install rather than once for all devices. During a restore or update, the device sends Apple’s signing service (the Tatsu Signing Server, TSS) the list of images it wants to install plus two device-specific values: the ECID, a serial number unique to that SoC, and the ApNonce, a fresh anti-replay value derived from a random generator value and hashed (SHA-384 on current chips) into the manifest field `BNCH`. TSS returns a manifest bound to that ECID and that nonce. That personalized manifest is the APTicket; a saved copy is an SHSH blob, `.shsh2` on modern devices.

The binding does two things. The ECID stops a ticket signed for one device from validating on another, so signed firmware cannot be moved between devices. The nonce stops replay: a stock device picks a new ApNonce at every restore, so a ticket signed against yesterday’s nonce no longer matches. Reusing an old ticket means forcing the device to produce the original nonce again, which stock firmware will not do.

The signing window is a time limit on top of this. Apple issues fresh signatures only for the build it currently ships; some days or weeks after a new release it stops signing the previous one, and TSS will no longer personalize that build for any device. Without a saved ticket and a reproducible nonce, there is then no way back to it.

Note

This is why people save SHSH blobs. While Apple still signs a build, a tool such as `tsschecker` can request and store its personalized ticket, and once the signing window closes that saved ticket is the only way back to that build. Using one is the harder half: it also takes a jailbreak, to force the boot-nonce generator to reproduce the nonce the ticket was signed against. `futurerestore` does both, taking a saved blob plus a forced generator. On A12 and later this is largely closed off.

## The Secure Enclave boots alongside

While the Application Processor works through that sequence, the Secure Enclave runs an equivalent one in parallel, isolated in hardware, with its own Boot ROM: a separate root of trust on the same die. At startup iBoot reserves a region of memory for it and passes the enclave its operating system, sepOS. The enclave’s own Boot ROM verifies that image’s hash and signature before running it; iBoot delivers the image but does not check it. If the check fails, the enclave stops operating until the next full chip reset.

On A13 and later a hardware mechanism, System Coprocessor Integrity Protection (SCIP), lets the enclave processor run nothing but its Boot ROM at startup, and the enclave cannot change that configuration itself. Widening it is the job of a separate Boot Monitor: to make sepOS runnable the Boot ROM has to ask that monitor, which resets the enclave processor, hashes the image, widens SCIP to cover it, and starts it. The Boot Monitor keeps a running measurement of everything it makes executable and hands the final value to the Public Key Accelerator, which uses it for OS-bound keys. Secure boot is two chains, rooted in two separate ROMs, that meet at a shared memory region; the enclave gets its own article.

## When the chain breaks: checkm8

The chain’s security depends entirely on the anchor, and on a large range of devices the anchor is exploitable.

In September 2019, axi0mX published checkm8 (CVE-2019-8900), a use-after-free in the Boot ROM’s USB code. It is reachable only in DFU mode and only over a physical USB connection. When DFU brings USB up it allocates one fixed-size buffer for control transfers. A control transfer that carries a data phase then aims a second set of globals at that buffer, a write cursor plus the expected and received byte counts, and those are cleared only once the whole data phase has arrived. Stop the data phase short and they are never cleared. Aborting DFU at that point frees the buffer and does null the buffer pointer itself, but the stale write cursor still holds the address, and the next DFU cycle writes through it. Whoever controls what lands in the freed memory gets code execution in the first code the device runs.

Apple’s Boot ROM is closed source, so the pseudocode below is reconstructed from public analysis, not copied from it:

```c
static void    *io_buffer;             /* the DFU control-transfer buffer, 0x800 bytes */
static uint8_t *ep0_data;              /* data-phase write cursor, into io_buffer */
static size_t   ep0_expected, ep0_got; /* bytes this phase wants, bytes that arrived */

/* Entering DFU allocates the buffer, once. */
static void usb_dfu_init(void)
{
    io_buffer = memalign(0x800, 0x40);
}

/* A control request with a data phase aims the cursor at that buffer. */
static void handle_interface_request(uint16_t wLength)
{
    ep0_data     = io_buffer;
    ep0_expected = wLength;
    ep0_got      = 0;
}

/* The cursor is cleared only once the whole data phase has arrived. */
static void handle_ep0_data_phase(const void *data, size_t len)
{
    memcpy(ep0_data + ep0_got, data, len);
    ep0_got += len;
    if (ep0_got == ep0_expected) {
        ep0_data     = NULL;           /* the only path that clears it */
        ep0_expected = 0;
    }
}

/* Leaving DFU frees the buffer and does clear io_buffer. */
static void usb_dfu_exit(void)
{
    free(io_buffer);
    io_buffer = NULL;                  /* but ep0_data still holds the old address */
}
```

The rest of checkm8 is heap control. SecureROM’s allocator is deterministic, so the buffer allocated on the next DFU entry would land straight back on the freed block; the exploit first leaks allocations to push that new buffer elsewhere, lets a USB request structure fall into the freed region instead, and overwrites its callback and next pointers through the stale cursor. When the USB stack completes that request it calls into the attacker’s payload.

checkm8 affects every SoC from A5 to A11, meaning iPhones from the 4S through the iPhone 8 and iPhone X, along with many iPads and iPods and the A10-derived T2 chip in Intel Macs. Because the vulnerable code is in read-only ROM, none of these devices can be patched.

Two distinctions matter. The checkm8 bug is not the checkra1n jailbreak built on it: checkra1n supported only A7 through A11, and A5 and A6 needed other tools. The unreset data-phase state is in fact still there on A12 and A13, but not exploitable, because those ROMs offer no way to keep the new buffer off the freed block. And checkm8 by itself gives no access to user data. It requires physical possession of the device and a cable, it does not survive a reboot, and it does not defeat the Secure Enclave, the passcode, or the data-at-rest encryption they protect. checkm8 gives control of the boot chain itself.

That control still matters, because every guarantee above the Boot ROM (the signature checks, the signing window, the trust caches and code-integrity mechanisms) is enforced by code that checkm8 can replace. It is why later mitigations are designed on the assumption that the layer below them may be compromised.

## From a Boot ROM bug to a jailbreak

checkm8 puts an attacker’s code inside that first stage. Once you are running inside the component that decides what runs next, you can change the decision: skip the signature check instead of performing it.

From there you work up the chain. You hand the Boot ROM a modified iBoot and your code lets it through unverified; that iBoot then loads a patched kernel the same way. Each stage you own disables the check on the next.

At the top you have a kernel running your changes. That is what a jailbreak is. The device will run software Apple never signed, you can load your own kernel code, and for a researcher the whole system becomes something to inspect, patch and debug from the inside.

Because the Boot ROM is read-only, none of this sticks: reboot without a computer attached and the device comes back up stock. That is why checkm8 jailbreaks are called semi-tethered.

## Apple Silicon Macs: LocalPolicy and security levels

Everything above describes an iPhone. Since Apple Silicon it describes a Mac too: Boot ROM, then LLB, then iBoot, then the kernel, with LLB still a distinct stage rather than merged into iBoot. The one addition is that a Mac owner can choose how strict the chain is, and that choice is itself signed.

The choice lives in a file called LocalPolicy, an Image4 object that the machine’s own Secure Enclave signs rather than Apple, with a key generated on that Mac that never leaves it. The enclave’s attached secure storage blocks rollback of the policy, so it cannot be silently downgraded to a weaker setting.

There are three settings. Full Security is the default and matches iOS: the OS is personalized to the machine with its ECID, giving the same anti-rollback guarantee. Reduced Security uses Apple’s global, non-personalized signatures, which allows booting older signed versions of macOS and is also required to load third-party kernel extensions. Permissive Security accepts boot objects signed locally by the enclave rather than by Apple, including a custom XNU kernel, and it is the prerequisite for turning System Integrity Protection off, since on Apple Silicon that policy lives in the signed LocalPolicy rather than in NVRAM. It is intended for developers and researchers.

Changing any of these settings requires physical access. The user boots into recoveryOS through One True Recovery, entered by pressing and holding the power button (a signal software running in macOS cannot generate), and authenticates as an administrator.

## Hands-on: from IPSW to kernelcache

An IPSW is a zip archive of Image4 objects, and two open tools, blacktop’s `ipsw` and `pyimg4`, are enough to go from the download to a kernel you can disassemble.

Exact flags change between tool versions, so check each tool’s `--help`.

```bash
# 1. Pull one object straight out of the remote archive: --pattern
#    fetches only the zip entries whose path matches.
ipsw download ipsw --device iPhone10,3 --build 19A346 --pattern 'kernelcache'
```

The rest of the chain is in the same archive: `Firmware/all_flash/` holds iBoot, LLB, the device tree and the SEP firmware, and `Firmware/dfu/` holds the two DFU payloads, iBSS and iBEC. Change the pattern to pull any of them.

```bash
# 2. Read the payload header: what is this, and how is it packed?
pyimg4 im4p info -i kernelcache.release.iphone10b
```

```yaml
Reading kernelcache.release.iphone10b...
Image4 payload info:
  FourCC: krnl
  Description: KernelCacheBuilder_release-2238.10.3
  Data size: 15645.59KB
  Data compression type: LZFSE
  Data size (uncompressed): 42420.8KB
  Encrypted: False
```

`krnl` is the type tag from the IM4P, the description is the build tool that produced this kernelcache, and this one is LZFSE rather than the older `complzss`.

```bash
# 3. Pull the raw payload out of the IM4P. extract decompresses by default.
pyimg4 im4p extract -i kernelcache.release.iphone10b -o kernelcache.raw
file kernelcache.raw
```

```
Reading kernelcache.release.iphone10b...
[NOTE] Image4 payload data is LZFSE compressed, decompressing...
Extracted Image4 payload data to: kernelcache.raw
kernelcache.raw: Mach-O 64-bit executable arm64
```

The kernelcache is now a Mach-O. Before disassembling it, look at the manifest that lists its digest. The values below are representative of the format, not one device’s real signed ones:

```bash
# 4. The manifest: the object that says 'Apple signed this'.
# The personalized manifest is not in the IPSW; it comes from your own
# device or a saved SHSH blob (for example via tsschecker).
pyimg4 im4m info -i APTicket.der
#   Device Processor:    T8015           (A11, the iPhone10,3 SoC)
#   ECID (hex):          0x<your device's ECID>
#   ApNonce (hex):       <nonce hash, the BNCH field>
#   SepNonce (hex):      <SEP nonce>
#   Manifest images (N): krnl, ibot, sepi, rdsk, dtre, ...
#   (add -v for each image's DGST digest and the rest of the properties)
```

The `Manifest images` list is the set of components this ticket vouches for; with `-v`, each is shown alongside the digest (`DGST`) the loader will require the real image to match. The `ECID` is the personalization described earlier: run this on a manifest from your own phone and the ECID it prints is that phone’s. Open `kernelcache.raw` from step three in a disassembler and you have the starting point for the next article, on XNU.

## State in 2026

The anchor itself is still an active research target. In June 2026, Paradigm Shift published usbliter8, a Boot ROM exploit reaching A12, A13 and the S4 and S5 watch chips: the iPhone XR and XS through the iPhone 11 line, the second-generation SE, several iPads, the Series 4 and 5 watches, the HomePod mini. It is a different bug from checkm8. The Synopsys DWC2 USB controller buffers up to three consecutive Setup packets by DMA and, on a fourth, rewinds its write pointer by a fixed 24 bytes; short Setup packets are still stored in 4-byte chunks, so feeding it short ones walks the pointer backwards 12 bytes at a time into SRAM it was never meant to reach. DFU is again where it is reachable, and the ROM is again unpatchable. Two more generations of device.

Above the boot chain, the mitigations belong to later articles. Once the kernel is running, pointer authentication changes what an attacker can do with a bug, which is the subject of [the arm64e post](https://sigreturn.com/blog/pointer-authentication-arm64e/) and comes back when this series reaches the kernel.

## Where this leaves us

This is the full chain, from the Boot ROM to the kernel the rest of the system runs inside. Little of what follows in [the series](https://sigreturn.com/blog/apple-security-stack/) introduces a new kind of trust: the sandbox, code signing, the trust caches and the entitlements that decide what a process can do are all enforced by a kernel that runs only because these signatures verified in order, which is why a Boot ROM compromise undermines all of them at once.

This post stops at the moment the kernel starts, and says nothing about what that kernel then enforces. [The next article](https://sigreturn.com/blog/xnu-under-the-hood/) moves up one level, into XNU itself: its Mach and BSD halves, and the capability model the rest of the security stack is built on.

## Notes and sources

Everything here is drawn from public documentation, open tooling, and published research.

-   Apple Platform Security: [Boot process for iPhone and iPad](https://support.apple.com/guide/security/boot-process-for-ipad-and-iphone-devices-secb3000f149/web), [Boot process for a Mac with Apple silicon](https://support.apple.com/guide/security/boot-process-secac71d5623/web), [The Secure Enclave](https://support.apple.com/guide/security/the-secure-enclave-sec59b0b31ff/web), [Secure software updates](https://support.apple.com/guide/security/secure-software-updates-secf683e0b36/web), and [the LocalPolicy file contents](https://support.apple.com/guide/security/contents-a-localpolicy-file-mac-apple-silicon-secc745a0845/web).
-   The Image4 format and the APTicket / SHSH scheme: [The Apple Wiki on IMG4](https://www.theapplewiki.com/wiki/IMG4_File_Format) and [APTicket](https://www.theapplewiki.com/wiki/APTicket); Jay Freeman (saurik), [“Where did my iOS 6 TSS data go?”](https://www.saurik.com/apticket.html); and amarioguy’s [“An analysis of iBoot’s Image4 parser”](https://amarioguy.github.io/2025/10/20/iboot_image4_validator.html).
-   checkm8: axi0mX’s [ipwndfu](https://github.com/axi0mX/ipwndfu) and CERT [VU#941987](https://www.kb.cert.org/vuls/id/941987/) (CVE-2019-8900).
-   usbliter8, the June 2026 SecureROM exploit for A12, A13, S4 and S5: Paradigm Shift’s own writeup was unreachable at the time of writing, so the mechanism and device list here come from [Security Affairs](https://securityaffairs.com/193965/hacking/usbliter8-brings-unpatchable-bootrom-exploit-to-apple-a12-and-a13-devices.html) and [The Hacker News](https://thehackernews.com/2026/06/unpatchable-usbliter8-exploit-breaks.html).
-   Tooling used above: [blacktop/ipsw](https://github.com/blacktop/ipsw) and [pyimg4](https://github.com/m1stadev/PyIMG4).
-   For depth beyond any of this, the standard reference is Jonathan Levin’s *\*OS Internals*: Volume III (Security & Insecurity) for the boot chain and secure boot, Volume II (Kernel Mode) for XNU.
