---
title: Hacking the My Arcade Contra Pocket Player
source: https://trustedsec.com/blog/hacking-the-my-arcade-contra-pocket-player-part-ii
source_host: trustedsec.com
clip_date: 2026-11-19T09:10:27+08:00
trace_id: bc0c4005-7f68-4379-8abf-09f8c73a3793
content_hash: 296fc7bcff015f3a3bb8fb209d06253c50930c409858047f04a3cf1c333fc86e
status: synced
tags: []
series: null
feed_source: TrustedSec
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 41d75244-d011-8177-ab32-d957ddd6a18d
ioc: null
---

Reports of my death have been greatly exaggerated.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82eab7d23c01da2d.png)

Not Dead Yet

Sorry for the long delay. No, I didn't die. I just got busy and totally forgot to come back to this project 😁  
  
In [Part I](https://trustedsec.com/blog/hacking-the-my-arcade-contra-pocket-player-part-i), we identified the Rockchip RK3128 SoC and Winbond SPI NAND flash inside the Contra Pocket Player, and dumped the full 128MB flash image over USB using RockUSB recovery mode. In this post, we'll analyze the firmware dump, explore the root filesystem, and work through the process of swapping in custom games.

## Analyzing the Firmware Dump

Looking at the NAND dump with a hex editor, the `0x55AA` boot signature at offset `0x1FE` signals a valid MBR. The single partition entry has type `0xEE`, marking it as a GPT protective MBR. At offset `0x200`, the `EFI PART` magic string confirms a GUID Partition Table.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/84e16452011df87d.png)

EFI PART Magic at Offset 0x200

The GPT contains five partitions:

| #   | Name | Size | Offset | Magic | Content |
| --- | --- | --- | --- | --- | --- |
| 1   | `uboot` | 1.0 MiB | 0x400000 | `LOADER` | U-Boot bootloader |
| 2   | `trust` | 2.0 MiB | 0x500000 | `TOS` | ARM Trusted Firmware |
| 3   | `boot` | 9.0 MiB | 0x700000 | `ANDROID!` | Linux kernel + ramdisk |
| 4   | `rootfs` | 65.0 MiB | 0x1000000 | `hsqs` | SquashFS filesystem |
| 5   | `userdata` | 26.7 MiB | 0x5100000 |     | User data (ext2) |

There is a ~4 MiB gap between the GPT entries and the first partition. This region isn't listed in the partition table, but some research into Rockchip SoCs revealed it contains the IDB (ID Block) loader, a first-stage bootloader that the SoC's boot ROM loads from a hardcoded offset on the flash to initialize DDR memory and hand off to U-Boot. Five redundant copies are written starting at sector 64, with the rest of the gap as zero padding. Decrypting the first sector with Rockchip's RC4 key (documented in [U-Boot's rkcommon.c](https://github.com/u-boot/u-boot/blob/master/tools/rkcommon.c)) reveals the standard `0x0FF0AA55` IDBLOCK magic. While this isn't important for the mod, it's useful to document the full NAND layout.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cdabecd7cd0d9aeb.jpg)

NAND Flash Layout

The first three partitions (`uboot`, `trust`, `boot`) handle the boot chain: U-Boot loads ARM Trusted Firmware, which launches the Linux kernel packaged as an Android boot image. From there, BusyBox init takes over and runs the startup scripts in `/etc/init.d/`. The `rootfs` partition is where the emulator, ROMs, and game launcher live. That's our focus for modifications.

### Extracting the Partitions

The flash is addressed in 512-byte sectors. Each partition can be extracted with `dd`:

```bash
dd if=nand_dump.bin of=uboot.img       bs=512 skip=8192   count=2048
dd if=nand_dump.bin of=trust.img       bs=512 skip=10240  count=4096
dd if=nand_dump.bin of=boot.img        bs=512 skip=14336  count=18432
dd if=nand_dump.bin of=rootfs.squashfs bs=512 skip=32768  count=133120
dd if=nand_dump.bin of=userdata.img    bs=512 skip=165888 count=54751
```

We can verify each partition by checking its magic bytes:

-   `LOADER` for uboot
-   `TOS` for trust
-   `ANDROID!` for boot
-   `hsqs` for rootfs

## Unpacking, Repacking, and Reflashing

The rootfs partition is a SquashFS image. You can unpack it with `unsquashfs`:

```
unsquashfs -d rootfs/ rootfs.squashfs
```

This produces a full Linux root filesystem. From here, we can make modifications, repack, and flash back to the device.  
  
\> **Warning for macOS users:** The rootfs contains two symlinks that differ only in case: `libMali.so` and `libmali.so`. macOS filesystems are case-insensitive by default, so `unsquashfs` fails to create the second symlink. If you repack and flash from macOS, the resulting image will be missing the Mali GPU library symlink and RetroArch will fail to launch. Use a Linux machine or VM for the unsquash/repack workflow.

The modification workflow is as follows:

1.  Extract rootfs from NAND dump
2.  Unpack the SquashFS image
3.  Make changes to the filesystem
4.  Repack into a new SquashFS image
5.  Copy modified rootfs back to NAND image
6.  Flash back to the device

Repacking uses `mksquashfs` with the same compression settings as the original:

```
mksquashfs rootfs/ rootfs_new.squashfs -comp gzip -b 131072 -noappend -no-xattrs
```

Since the only partition we're modifying is rootfs, we can just copy the original dump and write the new squashfs over the rootfs region:

```python
cp nand_dump.bin nand_modded.bin
dd if=rootfs_new.squashfs of=nand_modded.bin bs=512 seek=32768 conv=notrunc
```

Flash back to the device in RockUSB mode:

```python
sudo rkflashtool w 0 262144 < nand_modded.bin
```

The rootfs partition is exactly 65 MiB (68,157,440 bytes) so the repacked SquashFS image must fit within that space.

## Inside the Root Filesystem

Once the kernel mounts the rootfs, BusyBox init runs `/etc/init.d/rcS`, which executes init scripts in numerical order. The last script `S50ui` launches `/usr/bin/game`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e43977653c6d9ff.jpg)

Boot Process

The `game` binary is a proprietary MiniGUI application that displays the game selection menu.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ccb4c333ac8fb247.jpg)

Game Select and Mode Select Menus

When a game is selected, it calls a launch script with three arguments:

```
start.sh <game_index> <config_path> <rom_path>
```

-   `$1`: game index (0, 1, etc.)
-   `$2`: path to a RetroArch config file (e.g., `/usr/lib/libretro/games/zip.cfg`)
-   `$3`: full path to the ROM file (e.g., `/usr/lib/libretro/games/mzip/contra1.zip`)

Three launch scripts handle different play modes:

| Script | Mode | Core | Description |
| --- | --- | --- | --- |
| `start.sh` | Single player | `mame2016_libretro.so` | Launches RetroArch with the selected ROM |
| `startp1.sh` | Multiplayer P1 (host) | `fbalpha_libretro.so` | Configures eth0, launches RetroArch with `-H` (host mode) |
| `startp2.sh` | Multiplayer P2 (client) | `fbalpha_libretro.so` | Configures eth0, launches RetroArch with `-C` (client mode) |

The stock firmware uses different emulator cores depending on play mode. Single player uses MAME2016, while multiplayer uses FBAlpha.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e6818c4d3fcc1be.png)

Solo Play start.sh Script

The script selects an emulator core based on the game index, then passes the config and ROM path through to RetroArch. All cores and ROMs live under `/usr/lib/libretro/`.  
  
The multiplayer scripts configure static IPs on `eth0` (the CO/VS port) and add the `-H` or `-C` flags for host/client mode. Since the `game` binary calls these scripts for multiplayer menu selections, they provide entry points we can use to launch different games.

## First Attempt: Swap the ROM

With the filesystem layout understood, the first approach I tried was to drop a new arcade ROM zip into the games directory, update the single-player launch script to point at it, repack, and flash.  
  
I selected the Contra game, but was met with a black screen.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/92ef943b976ae9a2.gif)

Womp Womp

To understand why the ROM swap failed, I examined the two cores included in the stock firmware.

### RetroArch Arcade Cores

Running `strings` on the `mame2016_libretro.so` binary and searching for compiled driver source paths reveals why:

```bash
$ strings mame2016_libretro.so | grep 'src/mame/drivers'
../../../../../src/mame/drivers/contra.cpp
../../../../../src/mame/drivers/thunderx.cpp
../../../../../src/mame/drivers/segas32.cpp
```

The core was compiled with only three drivers:

-   **contra.cpp**: Contra and Super Contra
-   **thunderx.cpp**: Thunder Cross
-   **segas32.cpp**: Sega System 32 (SegaSonic The Hedgehog, Jurassic Park, etc.)

Unlike console emulators (where a single emulator runs any ROM for that console), each arcade game ran on unique hardware with different CPUs, sound chips, and graphics hardware per cabinet. MAME and FBNeo implement a separate "driver" for each arcade board or family of boards.  
  
When building a MAME or FBAlpha core from source, you have to select which drivers to include. A core compiled with only the Contra driver would not be able to run a Donkey Kong ROM because the correct driver is not in the binary.  
  
Running the same `strings` analysis on the `fbalpha_libretro.so` binary shows thousands of game titles, including Donkey Kong, Galaga, TMNT, and more. This is a build with broad arcade support enabled. The single-player script uses the stripped down MAME2016 core, while the multiplayer scripts use the FBAlpha core, which explains the initial failure when attempting a ROM swap.

## Second Attempt: Using FBAlpha

With a better understanding of the arcade cores, there are two potential paths we could take:

1.  \*\*Modify `start.sh`:\*\* replace the MAME2016 core reference with `fbalpha_libretro.so` and add ROMs to `games/fzip/`. This replaces the single-player Contra games with custom ROMs.
2.  \*\*Modify the multiplayer scripts:\*\* redirect `startp1.sh` and `startp2.sh` to custom ROMs while keeping the original Contra games playable through `start.sh`.

We are going to go with option 2 for this attempt and modify `startp1.sh`.

The `fzip/` directory contains the FBAlpha compatible `contra1.zip` and `scontra.zip` ROMs. We can drop additional FBA-compatible ROM zips alongside them. For this test I used TMNT II and 1941:

```bash
cp tmnt2.zip usr/lib/libretro/games/fzip/
cp 1941.zip  usr/lib/libretro/games/fzip/
```

### Modify the Launch Scripts

The `game` binary passes the ROM path to the launch scripts as argument `$3`, and we can intercept it with a `case` block.  
  
The key change to `startp1.sh` captures the ROM path into a variable, then matches against the Contra or Super Contra paths to substitute our own:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61b764f39b492b7a.png)

Modified Multiplayer startp1.sh Script

When Contra is selected from the game menu and then Player 1 is chosen, the `game` binary passes `contra1.zip` as the ROM path to `startp1.sh`. The `case` block intercepts this and redirects to `tmnt2.zip`. When Super Contra is selected and Player 1 is chosen, the second case maps `scontra.zip` to `1941.zip`.  
  
The `startp2.sh` script can be modified in the same way to either add additional games for solo play (commenting out the `ifconfig` line and removing the `-C` flag from the RetroArch launch arguments), or point to the same game as `startp1.sh` so that two devices can play multiplayer.

### Repack and Flash

```
mksquashfs rootfs/ rootfs_new.squashfs -comp gzip -b 131072 -noappend -no-xattrs
```

Copy the original dump and write the new squashfs over the rootfs region, then flash:

```python
cp nand_dump.bin nand_modded.bin
dd if=rootfs_new.squashfs of=nand_modded.bin bs=512 seek=32768 conv=notrunc
sudo rkflashtool w 0 262144 < nand_modded.bin
```

The rootfs partition is 65 MiB. The stock rootfs uses about 50 MiB, so there's room for additional ROMs as long as the repacked image stays under 68,157,440 bytes.

### Result

Power on the device and the stock menu appears as usual. Selecting solo play still launches the original Contra games, but choosing Contra --> Player 1 now launches TMNT II through the FBAlpha core, and Super Contra --> Player 1 launches 1941.

 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd65d49bbaecba8d.png) Play

## Want to Mod Your Own?

I have made a full modding toolkit available on GitHub: [https://github.com/Kc57/contra-pocket-mod](https://github.com/Kc57/contra-pocket-mod)  
  
It includes a Docker-based cross-compilation environment using a Buildroot toolchain that matches the on-device glibc and linked libraries, a replacement game launcher that scans `/usr/lib/libretro/games/fzip/` for ROM zips and builds the menu dynamically, and a pipeline that handles the entire workflow: extracting the firmware, compiling the launcher, injecting it along with your ROMs into the rootfs, and rebuilding the NAND image.  
  
Here is the launcher in action:

 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a94200305cbe31b8.png) Play
