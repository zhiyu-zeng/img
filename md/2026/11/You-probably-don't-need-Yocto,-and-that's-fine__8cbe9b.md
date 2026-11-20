---
title: You probably don't need Yocto, and that's fine
source: https://sigma-star.at/blog/2026/05/you-probably-dont-need-yocto-and-thats-fine/
source_host: sigma-star.at
clip_date: 2026-11-20T10:40:19+08:00
trace_id: 5827b6f0-8384-41bc-8270-ced0c9017ec2
content_hash: ab6578ee818e8fd122e0140a6357bc5a0b313a7972ef07d5380b6fa60127448c
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
notion_page_id: 41e75244-d011-81c0-9316-c658fb9745b5
ioc: null
---

New customers often look surprised when, during the planning phase, we ask whether they really need Yocto. The unspoken assumption is usually that any serious embedded Linux project these days has to use Yocto. We at sigma star gmbh consider ourselves power users and Yocto experts. That’s exactly why we’re often the ones telling our customers to think twice before reaching for it. So why is Yocto the default, and when is it the wrong default?

## What is Yocto, actually?

People sometimes call it “the Yocto Linux distribution”. That’s not what it is. Yocto is a *toolkit for building your own Linux distribution*. The Yocto Project itself ships a reference distribution called Poky, built from `bitbake`, `openembedded-core`, and `meta-yocto` [1](#fn:1).

The ability to assemble a Linux system that matches your needs exactly makes Yocto incredibly powerful for embedded projects. You can compile the whole user space for your CPU, apply patches to any component, toggle features on or off in any recipe, and pin or change every version. On top of that, many System on Chip (SoC) vendors and hardware partners publish ready-to-use Board Support Package (BSP) layers, which give you a working starting point on real hardware.

That mix of flexibility and vendor support makes Yocto the default choice. The same mix also turns it into a trap when you don’t actually need that much control.

## Your distribution means your responsibility

With regulations like the Cyber Resilience Act (CRA) [2](#fn:2), product vendors now have to keep the software they ship secure and provide security updates for the lifetime of the product. That can be a long time to maintain a Linux system.

A regular Yocto release lives only about seven months, until the next release lands. Long Term Support (LTS) releases get up to four years of updates, which is the current policy starting with Yocto 5.0 (Scarthgap) [3](#fn:3).

One might ask why four years isn’t enough. But there’s a less obvious problem. To see it, we need to look at what a Yocto LTS release actually maintains.

A Yocto release is a set of `bitbake` recipes for software components, with specific versions and metadata, plus the reference distribution Poky. During the maintenance period, the Yocto maintainers apply bug and security fixes to those components and to Poky. For software components, those fixes usually take the form of backports from newer upstream versions.

And here’s the twist. Since Yocto is a *tool to build your own distribution*, you’ve most likely made changes like these:

-   Non-trivial patches or local tweaks to a handful of components.
-   Extra components added on top of what Yocto ships.
-   Version bumps or pins to pick up a fix or hold a known-good state.

With every Yocto maintenance release, you’ll have to check whether your changes still apply cleanly on top of the new state. On top of that, you need to confirm that the components you added or pinned still receive fixes from somewhere, because Yocto’s maintainers don’t know about them. At the end of the day, it’s *your* maintenance work.

If you take Poky and use it almost unchanged, a fair question to ask is: Why are you using Yocto in the first place?

### The elephant in the room: the Linux kernel

Yocto ships a Linux kernel and maintains it as part of each release. But you probably won’t use it unmodified. You almost always have to apply at least your vendor’s patches, and run a kernel new enough to include the drivers and fixes you depend on. So once you factor in CVE tracking, the kernel alone is a big part of your maintenance work, whether you use Yocto or not.

There’s a way to keep that work under control. We strongly advise our customers to build on top of an LTS kernel from kernel.org [4](#fn:4) and keep all their changes in a tidy patch queue. To stay current on security fixes, move to each new stable release and re-apply the patch queue. kernel.org maintains LTS kernels for years, so your patch queue usually applies cleanly and only needs real work when you jump to a new LTS release.

Depending on your setup and security requirements, the same applies to the bootloader, which is usually just as vendor-specific.

And for completeness: sticking with the kernel your vendor ships is usually a bad idea. Vendor kernels sit years behind kernel.org, rarely receive updates, and miss almost all security fixes. Exceptions prove the rule.

## The hidden cost of a custom distribution

Building “your own distribution” sounds great in a slide deck. In practice, it costs real engineering time.

-   **Build times.** Yocto compiles practically everything from source. A clean build of a non-trivial image takes hours on a fast workstation. The `sstate-cache` and a shared `DL_DIR` make repeat builds faster, but the cache itself is fragile: a small recipe change can invalidate large parts of it.
-   **Disk and CI cost.** A working Yocto build directory easily reaches 100 GiB or more. CI runners need beefy storage and a way to share `sstate` between jobs. You can mirror `sstate` and `DL_DIR` to make this less painful, but that infrastructure is yours to operate.
-   **Learning curve.** `bitbake` recipes, layers, dynamic layers, classes, overrides, `bbappend` files, `PACKAGECONFIG`, the difference between `DEPENDS` and `RDEPENDS`: the list of things you need to internalise before you can ship a Yocto image is long. Onboarding an engineer into a Yocto codebase takes weeks, not days.
-   **BSP layer quality varies.** Some SoC vendors ship clean, well-maintained BSP layers. Others ship a `meta-vendor` layer that pins a five-year-old kernel or bootloader, hardcodes machine-specific recipes into the wrong layers, and breaks every time you bump Poky. That “good starting point” can become the worst part of your build.

None of this is a reason to avoid Yocto. It’s a reason to make sure you actually need it before you commit.

## An alternative: reuse an established distribution

If all you really need is a solid Linux foundation to run your application on, an established distribution like Debian GNU/Linux solves most of the same problems with much less per-project work [5](#fn:5).

Debian today ships about 70,000 binary packages, built for all common architectures: `amd64`, `i386`, `arm64`, `armhf`, `riscv64`, `ppc64el`, and a handful of others [6](#fn:6). Chances are good that your SoC can run those binaries directly, with no recompilation required.

Debian doesn’t only ship modern user space with `systemd`, `udev`, and `dbus`. The archive also contains everything you need to build small Linux systems with SysV-style init or BusyBox. You pick a slim base, install only the packages your product needs, and still benefit from the work of Debian’s package maintainers.

### Debian maintenance

Debian stable receives security updates from the Debian Security Team for roughly three years. After that, the Debian LTS project, a community effort, extends support for about two more years on common architectures [7](#fn:7). That works out to around five years per release in practice, close to a Yocto LTS, but with far less per-project work.

To pick up the latest fixes, you fetch the latest Debian packages and re-roll your image. Compared to a Yocto setup where you have to backport upstream patches yourself, or recheck whether your local modifications still apply on top of a maintenance release, that’s a different world.

### How does an embedded image actually get built?

This is usually the point where people get confused. They picture booting an SoC from a USB flash drive and running the Debian installer. That’s not what we mean.

The idea is to generate a flashable image on a build host and write it to the device. To do that, you need:

-   Bootloader, usually SoC-specific (e.g. `u-boot`).
-   Linux kernel, usually SoC-specific too.
-   Root filesystem with the Linux user space, taken straight from Debian.
-   Image assembly tool to glue the three together into a flashable image.

For that last piece, the three usual suspects are `mkosi` [8](#fn:8), `ELBE` [9](#fn:9), and `debos` [10](#fn:10).

All three are free software, and all three produce a deterministic image you can flash to your hardware. The maintenance work shrinks dramatically: most updates become an `apt` -style refresh of the packages in the image, not a recipe rewrite.

### Example: debos

To make the Debian path concrete, here’s the rough shape of a `debos` -based build.

`debos` reads a YAML *recipe*: a list of *actions* such as running a command, generating a root filesystem, or installing a Debian package from a configured source.

The basic workflow looks like this:

-   Use `aptly` [11](#fn:11) to run a local Debian mirror that holds a copy of every Debian package you need.
-   Build your Linux kernel and, optionally, your bootloader as Debian packages and add them to the mirror.
-   Snapshot the mirror and tag the snapshot. That tag is your release.
-   Configure `debos` to use the mirror, and write recipe actions that produce your target image.
-   If needed, archive the Debian source packages and the image’s Software Bill of Materials (SBOM) alongside the image. That keeps you on the right side of GPL source-availability and CRA bill-of-materials requirements. Tools like `debsbom` [12](#fn:12) generate the SBOM straight from a Debian system.

![debos workflow: a local aptly mirror of Debian plus the project’s kernel, bootloader, and apps feeds debos, driven by a YAML config, which emits a disk image alongside GPL sources and an SBOM](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8225ffe316360440.svg)

debos workflow: a local aptly mirror of Debian plus the project’s kernel, bootloader, and apps feeds debos, driven by a YAML config, which emits a disk image alongside GPL sources and an SBOM

## Yocto or not Yocto? How to decide

After all that, when *should* you pick Yocto?

Use Yocto when:

-   You need a heavily customised distribution: custom user space, custom compile flags, deep changes to base components.
-   You have hard size or boot-time constraints that an off-the-shelf distribution can’t meet.
-   You operate under license restrictions that exclude common license categories. Some industries (medical devices, automotive, certain defense work) won’t ship GPLv3 components. Yocto’s `INCOMPATIBLE_LICENSE` mechanism makes excluding a whole license family across the image straightforward; with a stock Debian base you have to audit and trim packages yourself.
-   Your SoC vendor’s official support path is Yocto and the BSP is solid.

Skip Yocto when:

-   You “just” need a modern Linux to run your application on top of.
-   Your storage and memory budget can absorb a normal Debian-based image (say, hundreds of MB of flash and 256 MB or more of RAM).
-   Your product lifetime is long enough that you’d rather rely on Debian’s Security Team than maintain your own.

Skip Debian when:

-   You need to modify or rebuild many of its packages. Rebuilding a few is manageable, but each rebuilt package is maintenance you take on yourself. Patching dozens of upstream packages recreates the work the Debian maintainers were doing for you, and Yocto’s recipe model handles that scale more cleanly.
-   You need a non-glibc libc such as `musl` or `uClibc`. Debian’s main archive uses glibc throughout; swapping it out means rebuilding most of the archive yourself.
-   You need software much newer than Debian stable ships. Backports help for some packages, but if your product needs a recent compiler or a recent runtime, Debian stable will fight you, and Debian testing isn’t a production target.

Whichever way you decide, decide consciously and decide early. This is a foundational choice that’s hard to walk back once a product is in the field. When in doubt, start with an established distribution. Migrating *to* Yocto later, once you have a real reason for it, is much cheaper than the reverse: discovering halfway through a project that you’ve taken on years of maintenance work for no real benefit.

## Conclusion

Yocto is a remarkable piece of engineering. It lets you build exactly the Linux system you need, and that’s precisely the problem when you don’t need *exactly* that. The same goes for other build-from-source tools like Buildroot: almost everything above applies there too, because the moment you assemble your own distribution, you own its maintenance.

-   “Your own distribution” really means *your own maintenance*. The CRA and similar regulations make that bill come due.
-   A heavily modified Yocto build doesn’t inherit upstream fixes for free. Every maintenance release becomes review and rework.
-   An established distribution like Debian, assembled into an image with `mkosi`, `ELBE`, or `debos`, covers the common case with a fraction of the per-project effort.
-   When you need surgical control over the system, Yocto wins. When you don’t, picking it is a long, expensive way of solving a problem you don’t have.

For customers building a *custom* distribution, we always recommend Yocto. For everyone else, we keep asking the same question: Do you really need it?

1.  [yoctoproject.org/software-overview](https://www.yoctoproject.org/software-overview/) [↩](#fnref:1 "return to article")
    
2.  [Regulation (EU) 2024/2847](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202402847) [↩](#fnref:2 "return to article")
    
3.  [Yocto release process](https://docs.yoctoproject.org/ref-manual/release-process.html) [↩](#fnref:3 "return to article")
    
4.  [kernel.org releases](https://www.kernel.org/category/releases.html) [↩](#fnref:4 "return to article")
    
5.  [debian.org](https://www.debian.org/) [↩](#fnref:5 "return to article")
    
6.  [Debian ports](https://www.debian.org/ports/) [↩](#fnref:6 "return to article")
    
7.  [Debian LTS](https://wiki.debian.org/LTS) [↩](#fnref:7 "return to article")
    
8.  [github.com/systemd/mkosi](https://github.com/systemd/mkosi) [↩](#fnref:8 "return to article")
    
9.  [elbe-rfs.org](https://elbe-rfs.org/) [↩](#fnref:9 "return to article")
    
10.  [github.com/go-debos/debos](https://github.com/go-debos/debos) [↩](#fnref:10 "return to article")
     
11.  [aptly.info](https://www.aptly.info/) [↩](#fnref:11 "return to article")
     
12.  [debsbom](https://siemens.github.io/debsbom) [↩](#fnref:12 "return to article")
