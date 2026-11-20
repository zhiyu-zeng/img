---
title: "TrustZone Intermezzo: Broken OP-TEE Memory Isolation on i.MX 8M"
source: https://sigma-star.at/blog/2026/06/trustzone-intermezzo/
source_host: sigma-star.at
clip_date: 2026-11-20T10:40:35+08:00
trace_id: 290bbfd9-6b87-4e4b-8ccb-5390810e00d3
content_hash: 8f678853c09867bcbb51981aea2d6323ded95eb6644cd2c5b6975fabe1101d32
status: synced
tags: []
series: null
feed_source: sigma star·嵌入式/TrustZone
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41e75244-d011-8162-ad00-cae71eddef8f
ioc: null
---

TL;DR: *If you don’t run upstream OP-TEE newer than v4.10.0 with `CFG_TZASC_REGION0_SECURE=y` or i.MX downstream OP-TEE newer than lf-6.12.49_2.2.0, OP-TEE’s memory is not properly protected and can be compromised from the normal world.*

Recently, a [commit from 2024](https://github.com/OP-TEE/optee_os/commit/31bb491f8e7c78794b6f9615cc4f2deec58b4ed9) in the OP-TEE OS git repository caught our attention. It makes sure the TrustZone Address Space Controller (TZASC) is enabled on all i.MX 8M SoCs. Our first reaction was mixed. Can it really be that prior to this commit OP-TEE *forgot* to protect its own memory region? Or does the commit just add another safeguard against certain misconfigurations? And if so, why was no CVE filed?

Remember how the two worlds are split. OP-TEE runs in the so-called secure world of the SoC, while an operating system such as Linux runs in the normal world (AKA non-secure world). Arm TrustZone enforces this split using the TZASC.

![The normal world and the secure world, separated by Arm TrustZone](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4922ef540950d39f.svg)

The normal world and the secure world, separated by Arm TrustZone

So it is crucial that the normal world cannot directly access secure world memory. OP-TEE often implements a software TPM or holds other secret keys. Linux must not touch it, neither the kernel nor root in userspace.

That commit nagged at us, so we decided to dig in and give it a try. Many of our customers run i.MX 8M based systems and strongly emphasize security. We had a lot of fun along the way, so this blog post documents our journey.

## Confirming the Bug

We booted one of our i.MX 8M boards, to be precise the NXP i.MX 8M Mini EVK, with OP-TEE version 4.1.0, which does not contain that commit. On this system, OP-TEE places its main memory at address `0xbe000000`, so we tried to dump that region from Linux. The attempt should fail, because Linux runs in the normal world and OP-TEE in the secure world.

On Linux, root can reach all system memory through `/dev/mem`, so we attempted to read from `0xbe000000` that way. Tools such as [devmem2](https://github.com/denix0/devmem2) exist, but we wrote a few lines of Python to stay flexible. Access failed right away. Good. Right?

Not so fast. The kernel on this system was built with `CONFIG_STRICT_DEVMEM`. That option limits `/dev/mem` to device memory only, so it blocked our read before TrustZone ever came into play. Time to rebuild the kernel with `CONFIG_STRICT_DEVMEM` disabled.

On the freshly built kernel, the read still failed. Good, but were we sure? Thinking harder, we turned to the kernel log and found this line:

```
OF: reserved mem: 0x00000000be000000..0x00000000bfbfffff (28672 KiB) nomap non-reusable optee_core@be000000
```

OP-TEE adds reserved-memory nodes to the device tree passed to Linux, so Linux ignores this memory region completely. The `nomap` property in particular makes sure the region is never mapped. So our test could not work: Linux *itself* keeps the OP-TEE region out of reach. But that is not what we wanted to test. We wanted to know whether the access is possible at all. Linux runs in the normal world, and it must not reach that memory even when it really wants to. After changing a few lines of code, we had a kernel that ignored the `nomap` hint from OP-TEE. In a real-world scenario, an attacker who has taken over the kernel can bypass this restriction too, most simply by loading a custom kernel module.

Time to check again.

```bash
# dump memory
$ python3 devmem.py 0xbe000000 0x100000 > optee_core.bin

# check for a well known string
$ strings optee_core.bin | grep "OP-TEE version"
OP-TEE version: %s
```

Indeed, we could read OP-TEE’s memory from Linux! The bug is real and serious. It renders the whole security purpose of OP-TEE void. A compromised Linux system can reach the secure world and extract or even alter key material.

## It’s Not Over Yet: The Mysterious region0 and Memory Aliases

This story could have ended here. OP-TEE forgot to enforce the memory restriction on a certain platform, a single commit fixed it, and we’re good. Not nice, but bugs happen. That’s life.

While further investigating, we found other commits related to the TZASC:

-   arm-trusted-firmware: [fix(imx8m): don’t reconfigure default region0](https://github.com/ARM-software/arm-trusted-firmware/commit/9bf148071aad597e7fe7d1080c00aeb35b67a3dd)
-   optee: [drivers: imx: tzc380: add support to verify region0](https://github.com/OP-TEE/optee_os/commit/443c5817de47f1bd19091b419806898070382a67)

These commit messages hinted at a deeper problem. Protecting the secure world from the normal world takes more than enabling the TZASC correctly. The root cause is that the TZASC is not memory alias aware.

With the right [fix](https://github.com/OP-TEE/optee_os/commit/31bb491f8e7c78794b6f9615cc4f2deec58b4ed9), OP-TEE makes sure its memory region cannot be reached from the normal world. But that protection rests on the address alone, in our case `0xbe000000`. Because the controller is not memory alias aware, another address can point to the very same memory location and slip past the access check.

This is where `region0` becomes relevant. The TZASC allows configuring access permissions for certain memory address ranges. If a requested address has no configured range in the TZASC, it falls back to `region0`. `region0` is a memory range configuration that covers the whole address space known to the SoC. Think of it as a wildcard. In the reset state `region0` is secure-only, ensuring the fallback is safe. So all good? Sadly not, and that is exactly what the [TF-A commit](https://github.com/ARM-software/arm-trusted-firmware/commit/9bf148071aad597e7fe7d1080c00aeb35b67a3dd) fixes.

If memory aliases can happen on your system, and some component reconfigures `region0` during boot to allow normal world access, you are in deep trouble. Nothing about that configuration makes the danger obvious.

## Trying harder

After upgrading both OP-TEE and TF-A, everything seemed fine. Access to `0xbe000000` was no longer possible. All good, until we noticed that the OP-TEE config option `CFG_TZASC_REGION0_SECURE` was disabled in our test setup. `CFG_TZASC_REGION0_SECURE` tests whether `region0` is securely configured, which means only access from the secure world is allowed. Enabling it revealed the harsh truth. OP-TEE panicked very early at startup:

```
E/TC:0 0 Panic 'region0 is not secure configured, non-secure memory alias access possible!' at core/arch/arm/plat-imx/tzc380.c:217 <imx_configure_tzasc>
```

So something on our system was *still* touching `region0`. Following a hunch, we looked at what our bootloader, [U-Boot](https://source.denx.de/u-boot/), does. In `arch/arm/mach-imx/imx8m/soc.c` it allows non-secure access to `region0`.

```c
void enable_tzc380(void)
{
[...]
        /*
         * set Region 0 attribute to allow secure and non-secure
         * read/write permission. Found some masters like usb dwc3
         * controllers can't work with secure memory.
         */
        writel(0xf0000000, TZASC_BASE_ADDR + 0x108);
}
```

Removing that `writel()` made the OP-TEE panic go away and confirmed that nobody else touches `region0` anymore.

Still, the aliasing question nagged at us. Was this a real issue or only a theoretical one? The i.MX 8M Mini reference manual showed no memory alias for the area our OP-TEE uses. Maybe we were safe even without the `region0` fixes?

Therefore, we wrote a tiny program that uses `/dev/mem` and `/proc/self/pagemap` to find addresses that map to the same physical memory. It picks a page, reads its contents, flips a few high bits of the address, and checks whether the new address returns the same bytes. The approach turned out to be far more complicated than needed once it found the first aliases. Testing the OP-TEE area with the protection disabled, one alias for `0xbe000000` came out as `0x1be000000`.

So the DDR controller of the i.MX 8M series *ignores* the upper 32 bits of a memory address. The TZASC and the DDR controller therefore disagree: the TZASC sees two unrelated addresses, while the DDR controller maps them to the same location. The TZASC settings do not apply to the alias, so the access falls through to `region0`. Not all upper bits are usable on Linux, because the address still has to fit into the configured address space. But setting bit 32 seemed to work fine.

As a final test, we re-applied all fixes but left U-Boot untouched, such that it reconfigured `region0`, and tried to dump OP-TEE’s memory:

```
$ python3 devmem.py 0xbe000000 0x100000 > optee_core.bin
Bus error
$ python3 devmem.py 0x1be000000 0x100000 > optee_core.bin
$ strings optee_core.bin | grep "OP-TEE version"
OP-TEE version: %s
```

It worked. The direct address was blocked, but the alias sailed right through, and all the protection turned out to be in vain.

## Am I affected?

You are potentially affected if you run OP-TEE on an i.MX 8M SoC. Two separate issues make the bypass possible, and either one is enough to break the isolation:

1.  OP-TEE prior to 4.2.0 does not enable the TZASC by default on i.MX 8M, so the secure region is never protected.
2.  Other components, such as bootloaders and TF-A, reconfigure `region0`. Once a memory alias falls through to an open `region0`, the normal world reaches secure memory. Starting with OP-TEE 4.10.0, it’s possible to detect this.

To check your own system, run a recent OP-TEE with `CFG_TZASC_REGION0_SECURE` enabled. With that option OP-TEE verifies `region0` at startup and panics when it is not secure, so it also catches the case where another component reconfigures `region0` behind its back. The option is only available on OP-TEE 4.10.0 and newer.

If you use U-Boot as your bootloader, revert commit [imx8m: Configure trustzone region 0 for non-secure access](https://source.denx.de/u-boot/u-boot/-/commit/b3cf0a8f03d162e030cde1131751d060853e16fc) in the meantime. We gave the developers a [heads-up](https://lore.kernel.org/u-boot/3208216.Ym5mLc6kNg@nailgun/T/#u). As soon as a better solution is available, we’ll note it here.

There is a special case for the i.MX downstream OP-TEE. If you run it, use at least the version that contains commit [LFOPTEE-468 core: plat-imx: tzc380: update TZASC configuration](https://github.com/nxp-imx/imx-optee-os/commit/c09d6e9da171f8c5ee42b42ff144b320761a5f16). Sadly, downstream chose a different path. Instead of insisting on fixing the other components, they reconfigure `region0` to disable non-secure access. It only papers over the real problem: other software components change `region0` for the wrong reasons. Our hint on the U-Boot mailing list caused a [heated discussion](https://github.com/OP-TEE/optee_os/pull/7838) on the OP-TEE GitHub about how to deal with it.

Our main advice is simple: update OP-TEE, TF-A, and your bootloader regularly, because they carry important bug fixes. Sadly, no CVE numbers have been filed for these issues, so there is a good chance many users missed them. Although we are late to the party, we have requested CVE numbers and will update this blog post as soon as the CVEs are assigned.

## Conclusion

Modern computer systems are endlessly complex, and even well-established components can hide odd issues. We had to peel back multiple layers to fully confirm the real issue:

-   `CONFIG_STRICT_DEVMEM` blocked the first test.
-   The device tree `nomap` property kept Linux from mapping the region at all.
-   Only after removing both did the TZASC alias bypass become visible.

From a security and code-audit perspective, one principle holds once more: do not trust anything. Even the memory protection of OP-TEE needs rigorous testing and, as we showed, you have to be sure you are testing the right thing. A less experienced engineer might have concluded that all was well, because Linux itself denied the first access attempts.

Finally, thanks to [Pengutronix](https://www.pengutronix.de/) for addressing the issue in TF-A and OP-TEE!
