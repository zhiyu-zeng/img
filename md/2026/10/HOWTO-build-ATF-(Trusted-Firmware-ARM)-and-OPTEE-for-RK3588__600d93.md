---
title: "HOWTO: build ATF (Trusted Firmware ARM) and OPTEE for RK3588"
source: https://hardenedvault.net/blog/2025-03-10-build-atf-optee-rk3588/
source_host: hardenedvault.net
clip_date: 2026-10-07T10:17:54+08:00
trace_id: fcf305e6-027c-4cb5-8bd8-698884332bf1
content_hash: b44f86d22021f6d4eb9b1c42912aa04c884c15f6955d2f674a26a233b5073d52
status: synced
tags:
  - Linux安全
  - 内核
series: null
feed_source: HardenedVault·Linux内核利用/加固
ai_summary: 在 RK3588（Radxa ROCK 5A）上从零构建 ATF+OP-TEE 可信启动链，并用 tzram-audit 验证 TZDRAM 隔离。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f275244-d011-81cd-8d89-d1d37893ea68
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 在 RK3588（Radxa ROCK 5A）上从零构建 ATF+OP-TEE 可信启动链，并用 tzram-audit 验证 TZDRAM 隔离。
> 
> - **选型理由：** RK3588 开源生态成熟（U-Boot、内核、NPU、ATF），Dogecoin Foundation 维护者参与 OP-TEE 的 OTP、HUK 等信任根特性；带 MMU 安全扩展，且具备 6 TOPS NPU 支持边缘 AI。
> - **启动布局：** SD 卡启动时 SoC ROM 使用前 16MiB；外部启动代码分两段，位于 32KiB（64 扇区）和 8MiB（16384 扇区），前者做内存初始化，后者含 ATF、TEE 与 U-Boot。
> - **闭源部分：** RK3588 内存初始化无源码，只有 rkbin 的 DDR 二进制 blob，需与 u-boot-spl.bin 组合成可用的第一段。
> - **构建与合并：** ATF 以 `PLAT=rk3588 SPD=opteed` 生成 bl31.elf；optee_os 以 `PLATFORM=rockchip PLATFORM_FLAVOR=rk3588 CFG_CORE_ARM64_PA_BITS=<ram-bits>` 生成 tee.bin；再作 BL31/TEE 编 U-Boot，并用 `mkimage -T rksd` 合并 ddr.bin 与 spl（cat 方式无效）。
> - **隔离验证：** tzram-audit 给 OP-TEE 打补丁后读取 `CFG_TZDRAM_START` 物理地址，正常世界加载内核模块访问同一地址即触发 synchronous external abort，证明隔离生效。

![HOWTO: build ATF (Trusted Firmware ARM) and OPTEE for RK3588](https://hardenedvault.net/images/blog/tee_custody_huef3cb3102b95eb4887edcfcd357e1764_351988_1110x0_resize_q100_h2_box_3.webp)

## HOWTO: build ATF (Trusted Firmware ARM) and OPTEE for RK3588

## HOWTO: build ATF (Trusted Firmware ARM) and OPTEE for RK3588

To better implement the protection of digital assets in embedded systems, we have chosen the RK3588 as the prototype platform. Firstly, the RK3588 is backed by an increasingly mature open-source ecosystem. Thanks to the continuous [efforts of Collabora](https://www.collabora.com/news-and-blog/blog/2024/02/21/almost-a-fully-open-source-boot-chain-for-rockchips-rk3588/) and the open-source community over the past two years, the RK3588 has achieved a [nearly complete ecosystem with support for key components](https://www.cnx-software.com/2024/12/21/rockchip-rk3588-mainline-linux-support-current-status-and-future-work-for-2025/) such as U-Boot, Linux kernel, NPU driver, ATF. In the meanwhile, the maintainer team of [The Dogecoin Foundation](https://github.com/dogecoinfoundation) has joined in supporting OP-TEE and completing key features of the hardware-based chain of trust and root of trust, such as OTP (One-Time Programmable) and HUK (Hardware Unique Key). Although open-source does not equal to security, its transparency benefits the security in either security audits and vulnerability hunting, thereby providing a solid foundation for the protection of digital assets.

Secondly, this SoC not only possesses excellent general computing performance but also must implement security extensions for MMU, similar to TZASC (TrustZone Address Space Controller). Such a design effectively isolates permissions across different software layers, preventing security risks revealed in analyses like [tzram-audit](https://github.com/hardenedlinux/tzram-audit), and ensuring strict isolation between various security zones within the system, thus providing robust hardware-level protection for sensitive assets.

Thirdly, the RK3588 is equipped with a 6 TOPS NPU (Neural Processing Unit), which offers strong support for edge AI in embedded applications. For private AI application scenarios, such as assisting in crypto trading decisions and building secure, real-time knowledge bases, the high-performance NPU of the RK3588 can achieve efficient data processing and intelligent analysis, thereby promoting the deep application of AI in areas such as secure communication and digital asset management.

## the boot process of Rockchip

See [https://opensource.rock-chips.com/wiki_Boot_option](https://opensource.rock-chips.com/wiki_Boot_option), When booting from the SD card, the code in the SOC’s built-in ROM can use the first 16MiB of the SD card as ROM (therefore, other partitions are located after 16MiB).

The boot code outside of the SOC is mainly divided into two stages, located after 32KiB (64 sectors) and 8MiB (16384 sectors), respectively. The first stage is primarily responsible for memory initialization, while the second stage includes the ARM Trusted Firmware (ATF), TEE, and bootloader. U-Boot can be responsible for generating both of these stages

## proprietary code

The first stage of U-Boot consists of TPL and SPL, but the source code for memory initialization of the RK3588 has not been made public; only binary blobs are available. [https://github.com/rockchip-linux/rkbin/blob/master/bin/rk35/rk3588_ddr_lp4_2112MHz_lp5_2400MHz_v1.18.bin](https://github.com/rockchip-linux/rkbin/blob/master/bin/rk35/rk3588_ddr_lp4_2112MHz_lp5_2400MHz_v1.18.bin), When combined with u-boot-spl.bin, it can still form a usable first stage.

## Build ATF

```
$ make CROSS_COMPILE=aarch64-linux-gnu- PLAT=rk3588 DEBUG=1 SPD=opteed clean
$ make CROSS_COMPILE=aarch64-linux-gnu- PLAT=rk3588 DEBUG=1 SPD=opteed
```

Copy or link build/rk3588/debug/bl31/bl31.elf to rk3588/bl31.elf in the u-boot directory.

## Build optee_os

```objectivec
$ make   CROSS_COMPILE64=aarch64-linux-gnu-   PLATFORM=rockchip PLATFORM_FLAVOR=rk3588   CFG_ARM64_core=y   CFG_USER_TA_TARGETS=ta_arm64   CFG_DT=y CFG_CORE_ARM64_PA_BITS=<ram-bits> clean
$ make   CROSS_COMPILE64=aarch64-linux-gnu-   PLATFORM=rockchip PLATFORM_FLAVOR=rk3588   CFG_ARM64_core=y   CFG_USER_TA_TARGETS=ta_arm64   CFG_DT=y CFG_CORE_ARM64_PA_BITS=<ram-bits>
```

Where ram-bits is the number of binary bits representing the actual size of memory in bytes.

Copy or link out/arm-plat-rockchip/core/tee.bin to rk3588/tee.bin in the u-boot directory.

## Build u-boot

Download the aforementioned memory initialization blob and copy it to rk3588/ddr.bin in the u-boot directory.

```bash
$ make ARCH=arm CROSS_COMPILE=aarch64-linux-gnu- rock5a-rk3588s_defconfig
$ make ARCH=arm CROSS_COMPILE=aarch64-linux-gnu- ROCKCHIP_TPL=rk3588/ddr.bin BL31=rk3588/bl31.elf TEE=rk3588/tee.bin
$ mkimage -T rksd -n rk3588 -d rk3588/ddr.bin:spl/u-boot-spl.bin idbloader.img
```

Noted that the combination method using cat(1) in [https://opensource.rock-chips.com/wiki_Boot_option#The_Pre-bootloader.28IDBLoader.29](https://opensource.rock-chips.com/wiki_Boot_option#The_Pre-bootloader.28IDBLoader.29) cannot generate a usable first stage; instead, mkimage is needed to combine the two parts.

## Writing

idbloader.img is the first stage, and u-boot.itb is the second stage. Writing both to the specified locations on the SD card will create a usable bootloader:

```bash
# dd if=idbloader.img of=/dev/sdX seek=64
# dd if=u-boot.itb of=/dev/sdX seek=16384
```

/dev/sdX is SD card.

## Boot log

```yaml
U-Boot SPL 2025.04-rc3-00023-g6ae0a578de67 (Mar 03 2025 - 11:46:06 +0800)
Trying to boot from MMC2
## Checking hash(es) for config config-1 ... OK
## Checking hash(es) for Image atf-1 ... sha256+ OK
....
....
....
NOTICE:  BL31: v2.12.0(debug):v2.12.0-617-ga8a5d39d6
NOTICE:  BL31: Built : 16:15:14, Mar  6 2025
INFO:    GICv3 without legacy support detected.
INFO:    ARM GICv3 driver initialized in EL3
INFO:    Maximum SPI INTID supported: 511
INFO:    BL31: Initializing runtime services
INFO:    BL31: cortex_a55: CPU workaround for erratum 1530923 was applied
INFO:    BL31: Initializing BL32
I/TC: 
I/TC: No non-secure external DT
I/TC: OP-TEE version: 4.5.0-87-g873f5f6c7 (gcc version 14.2.0 (Debian 14.2.0-12)) #1 Tue Feb 25 03:51:56 UTC 2025 aarch64
I/TC: WARNING: This OP-TEE configuration might be insecure!
I/TC: WARNING: Please check https://optee.readthedocs.io/en/latest/architecture/porting_guidelines.html
I/TC: Primary CPU initializing
I/TC: GIC redistributor base address not provided
I/TC: Assuming default GIC group status and modifier
I/TC: Primary CPU switching to normal world boot
INFO:    BL31: Preparing for EL3 exit to normal world
INFO:    Entry point address = 0xa00000
INFO:    SPSR = 0x3c9
NOT_SUPPORTED: A Firmware Framework implementation does not exist


U-Boot 2025.04-rc3-00023-g6ae0a578de67 (Mar 06 2025 - 16:16:43 +0800)

Model: Radxa ROCK 5A
SoC:   RK3588S
DRAM:  8 GiB
NOT_SUPPORTED: A Firmware Framework implementation does not exist
I/TC: Reserved shared memory is enabled
I/TC: Dynamic shared memory is disabled
I/TC: Normal World virtualization support is disabled
I/TC: Asynchronous notifications are disabled
optee optee: OP-TEE capabilities mismatch
Core:  344 devices, 32 uclasses, devicetree: separate
MMC:   mmc@fe2c0000: 1, mmc@fe2e0000: 0
Loading Environment from nowhere... OK
In:    serial@feb50000
Out:   serial@feb50000
Err:   serial@feb50000
Model: Radxa ROCK 5A
SoC:   RK3588S
Net:   eth0: ethernet@fe1c0000
Hit any key to stop autoboot:  2  1  0 
Scanning for bootflows in all bootdevs
Seq  Method       State   Uclass    Part  Name                      Filename
---  -----------  ------  --------  ----  ------------------------  ----------------
Scanning global bootmeth 'efi_mgr':
Card did not respond to voltage select! : -110
Cannot persist EFI variables without system partition
  0  efi_mgr      ready   (none)       0  <NULL>                    
** Booting bootflow '<NULL>' with efi_mgr
Loading Boot0000 'mmc 1' failed
EFI boot manager: Cannot load any image
Boot failed (err=-14)
Scanning bootdev 'mmc@fe2c0000.bootdev':
  1  extlinux     ready   mmc          3  mmc@fe2c0000.bootdev.part /boot/extlinux/extlinux.conf
** Booting bootflow 'mmc@fe2c0000.bootdev.part_3' with extlinux
U-Boot menu
1:	Debian GNU/Linux 12 (bookworm) 6.1.43-20-rk2312
2:	Debian GNU/Linux 12 (bookworm) 6.1.43-20-rk2312 (rescue target)
Enter choice: 1:	Debian GNU/Linux 12 (bookworm) 6.1.43-20-rk2312
Retrieving file: /boot/vmlinuz-6.1.43-20-rk2312
Retrieving file: /boot/initrd.img-6.1.43-20-rk2312
append: root=UUID=3f7cc3b2-4026-493b-bc46-ee2668d25bcc console=ttyFIQ0,1500000n8 iomem=relaxed quiet splash loglevel=4 rw earlycon consoleblank=0 console=tty1 coherent_pool=2M irqchip.gicv3_pseudo_nmi=0 cgroup_enable=cpuset cgroup_memory=1 cgroup_enable=memory swapaccount=1
Retrieving file: /usr/lib/linux-image-6.1.43-20-rk2312/rockchip/rk3588s-rock-5a.dtb
## Flattened Device Tree blob at 12000000
   Booting using the fdt blob at 0x12000000
Working FDT set to 12000000
   Loading Ramdisk to ebeef000, end eceaeda5 ... OK
   Loading Device Tree to 00000000ebeb2000, end 00000000ebeee8a8 ... OK
Working FDT set to ebeb2000

Starting kernel ...

I/TC: Secondary CPU 1 initializing
I/TC: Secondary CPU 1 switching to normal world boot
I/TC: Secondary CPU 2 initializing
I/TC: Secondary CPU 2 switching to normal world boot
I/TC: Secondary CPU 3 initializing
I/TC: Secondary CPU 3 switching to normal world boot
I/TC: Secondary CPU 4 initializing
...
...
...
[   19.295224] rk-pcie fe190000.pcie: PCIe Link Fail, LTSSM is 0x3, hw_retries=1
[   20.330335] rk-pcie fe190000.pcie: failed to initialize host

Debian GNU/Linux 12 rock-5a ttyFIQ0

rock-5a login: 
```

## tzram-audit

### Patch the OPTEE OS:

```cpp
diff --git a/core/arch/arm/kernel/boot.c b/core/arch/arm/kernel/boot.c
--- a/core/arch/arm/kernel/boot.c
+++ b/core/arch/arm/kernel/boot.c
@@ -1121,6 +1121,12 @@ static void init_secondary_helper(void)
 	init_vfp_nsec();
 
 	IMSG("Secondary CPU %zu switching to normal world boot", get_core_pos());
+
+	{
+		const paddr_t pa = CFG_TZDRAM_START;
+		void *va = phys_to_virt (pa, MEM_AREA_TEE_RAM, 0x100);
+		IMSG("VAULT: pa: 0x%08x val: 0x%08x,", (unsigned int)pa, *(unsigned int*)va );
+	}
 }
 
 /*
```

### TEE OS:

```
I/TC: Secondary CPU 7 initializing
I/TC: Secondary CPU 7 switching to normal world boot
I/TC: VAULT: pa: 0x08400000 val: 0xaa0003f3,
```

### insmod the linux kernel module in tzram-audit:

```yaml
[   54.127820] Internal error: synchronous external abort: 0000000096000010 [#1] SMP
[   54.128488] Modules linked in: tzram_test(O+) zram zsmalloc vfat binfmt_misc fat snd_soc_es8316 pwm_fan cpufreq_dt rockchip_cpufreq ledtrig_netdev ledtrig_timer ledtrig_pattern ledtrig_heartbeat ledtrig_default_on fuse dm_mod ip_tables sdhci_of_dwcmshc dw_hdmi_qp_cec d
[   54.131014] CPU: 1 PID: 1330 Comm: insmod Tainted: G           O       6.1.43-20-rk2312 #3e26818dc
[   54.131804] Hardware name: Radxa ROCK 5A (DT)
[   54.132190] pstate: 40400009 (nZcv daif +PAN -UAO -TCO -DIT -SSBS BTYPE=--)
[   54.132806] pc : tzram_test_init+0x2c/0x1000 [tzram_test]
[   54.133298] lr : do_one_initcall+0x84/0x1c4
[   54.133678] sp : ffff80000cf3bae0
[   54.133977] x29: ffff80000cf3bae0 x28: ffff800009eaa390 x27: 0000000000000000
[   54.134609] x26: ffff80000cf3bca0 x25: 0000000000000000 x24: 0000000000000000
[   54.135241] x23: 0000000000000000 x22: 0000000000000000 x21: ffff80000107c058
[   54.135872] x20: ffff800009eaa2b8 x19: ffff80000104c000 x18: 0000000000000000
[   54.136504] x17: 726464615f747269 x16: 76202c7838302578 x15: 0000aaaac5d10f70
[   54.137135] x14: 5f736968745f5f00 x13: 0064692d646c6975 x12: 622e756e672e6574
[   54.137767] x11: 0000000000000000 x10: 0000000000000000 x9 : ffff800008014bec
[   54.138398] x8 : 0101010101010101 x7 : 7f7f7f7f7f7f7f7f x6 : 00000000000024a8
[   54.139029] x5 : 00000000ffffffff x4 : 0000000000000cc0 x3 : 0000000000000000
[   54.139661] x2 : ffff000008400000 x1 : 0000000008400000 x0 : ffff80000107b054
[   54.140292] Call trace:
[   54.140516]  tzram_test_init+0x2c/0x1000 [tzram_test]
[   54.140973]  do_one_initcall+0x84/0x1c4
[   54.141318]  do_init_module+0x54/0x1d8
[   54.141654]  load_module+0x1848/0x1918
[   54.141988]  __do_sys_finit_module+0x100/0x11c
[   54.142388]  __arm64_sys_finit_module+0x20/0x28
[   54.142797]  invoke_syscall+0x80/0x114
[   54.143131]  el0_svc_common.constprop.0+0xd0/0x120
[   54.143562]  do_el0_svc+0x98/0xbc
[   54.143863]  el0_svc+0x24/0x48
[   54.144144]  el0t_64_sync_handler+0x90/0xf8
[   54.144520]  el0t_64_sync+0x174/0x178
```

## TODO

-   OTP and eFuses
-   Data encryption based on HUK and user-defined seeds
-   Compartmentation for bootflow ([VaultBoot](https://github.com/hardenedvault/vaultboot)) and runtime TAs
-   Further assessment, trade-off of anti-rollback, RPMB, use-case, etc.
