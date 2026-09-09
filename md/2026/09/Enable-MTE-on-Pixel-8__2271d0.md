---
title: Enable MTE on Pixel 8
source: https://outflux.net/blog/archives/2023/10/26/enable-mte-on-pixel-8/
source_host: outflux.net
clip_date: 2026-09-09T10:57:22+08:00
trace_id: a6ebdb9f-f01b-45b4-97e2-fe71dd66a4f2
content_hash: 268de5e85dca1ee44b094fb959bcc43992f00a930c077c544140d07b6dc867be
status: synced
tags:
  - Android安全
  - 内存安全
series: null
feed_source: Kees Cook·Linux
ai_summary: Pixel 8/Google Tensor G3 支持 ARM MTE；用户态可在开发者选项中直接开启，内核态需用 adb 设置 `arm64.memtag.bootctl` 为 `memtag,memtag-kernel` 后重启，再通过 bugreport 确认内核命令行出现 `kasan=on`。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d675244-d011-81db-864f-e20c656936c2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Pixel 8/Google Tensor G3 支持 ARM MTE；用户态可在开发者选项中直接开启，内核态需用 adb 设置 `arm64.memtag.bootctl` 为 `memtag,memtag-kernel` 后重启，再通过 bugreport 确认内核命令行出现 `kasan=on`。
> 
> - **硬件与用途：** Tensor G3 支持 ARM MTE，可有效防御线性缓冲区溢出和多种 use-after-free 漏洞。
> - **用户态开启：** 在“开发者选项 → Memory Tagging Extension”中启用；系统会在 `arm64.memtag.bootctl` 属性中加入 `memtag`。
> - **内核态开启方法：** 用 `adb shell setprop arm64.memtag.bootctl memtag,memtag-kernel` 设置属性，然后重启手机；该模式基于内核 KASAN 的 hardware tag-based 模式。
> - **验证方式：** 重启后抓取 `adb bugreport`，解包并 `grep kasan=`，若启动命令行中出现 `kasan=on` 则说明内核 MTE 已生效；后面的 `kasan=on` 会覆盖前面的 `kasan=off`。

The Pixel 8 hardware ([Tensor G3](https://www.androidpolice.com/google-tensor-g3/)) supports the ARM [Memory Tagging Extension (MTE)](https://source.android.com/docs/security/test/memory-safety/arm-mte), and software support is available both in Android userspace and the Linux kernel. This feature is a powerful defense against linear buffer overflows and many types of use-after-free flaws. I’m extremely happy to see this hardware finally available in the real world.

## 用户态开启

Turning it on for userspace is already wired up the Android UI: `Settings / System / Developer options / Memory Tagging Extension / Enable MTE until you turn if off`. Once enabled it will internally change an Android “system property” named “ [`arm64.memtag.bootctl`](https://source.android.com/docs/security/test/memory-safety/bootloader-support) ” by adding the option “ `memtag` “.

## 内核态开启思路

Turning it on for the kernel is slightly more involved, but not difficult at all. This requires manually setting the “ `arm64.memtag.bootctl` ” property mentioned above to include “ `memtag-kernel` ” as well:

-   Plug your phone into a system that can run the `adb` tool
-   If not already installed, install `adb`. For example on Debian/Ubuntu: `sudo apt install adb`
-   Turn on “USB Debugging” in the phone’s “Developer options” menu, and accept the debugging session confirmation that will pop up when you first run `adb`
-   Verify the current setting: `adb shell getprop | grep memtag.bootctl`

`[arm64.memtag.bootctl]: [memtag]`

## 设置属性并重启

-   Enable kernel MTE: `adb shell setprop arm64.memtag.bootctl memtag,memtag-kernel`
-   Check the results: `adb shell getprop | grep memtag.bootctl`

`[arm64.memtag.bootctl]: [memtag,memtag-kernel]`

-   Reboot your phone

To check that MTE is enabled for the kernel (which is implemented using [Kernel Address Sanitizer’s Hardware Tagging](https://docs.kernel.org/dev-tools/kasan.html#hardware-tag-based-kasan) mode), you can check the kernel command line after rebooting:

```bash
$ mkdir foo && cd foo
$ adb bugreport
...
$ mkdir unpacked && cd unpacked
$ unzip ../bugreport*.zip
...
$ grep kasan= bugreport*.txt
...: Command line: ... kasan=off ... kasan=on ...
```

The latter “ `kasan=on` ” overrides the earlier “ `kasan=off` “.

Enjoy!
