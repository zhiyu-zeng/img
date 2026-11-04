---
title: YouTube
source: https://qbtau.in/posts/building_frida_on_termux/
source_host: qbtau.in
clip_date: 2026-11-04T10:39:06+08:00
trace_id: ed95cf1f-5a92-48b2-ad20-f5d550dfe0a0
content_hash: 0c8e9bd6e7e0bde95dcf3307233f9bc7fb639241d59bf71ce6f3f3d3bc68d889
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Abhi·Frida/Android
ai_summary: TL;DR：作者成功在 Termux 上用原生编译器（不依赖 NDK/交叉编译）完整编译出 Frida，核心是修补版 Vala/GLib 加 11 个 Android/Bionic 特化补丁。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40e75244-d011-81f2-abc6-fdc6d29cd7fd
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：作者成功在 Termux 上用原生编译器（不依赖 NDK/交叉编译）完整编译出 Frida，核心是修补版 Vala/GLib 加 11 个 Android/Bionic 特化补丁。
> 
> - **前置条件：** 必须自建带 `-frida` 后缀的修补版 Vala 编译器，使用 Frida 官方 fork 的 GLib（系统 GLib 缺 `gio_shutdown()` 等内部函数），并禁用 compat、compiler_backend（Go/npm 在 Android 崩溃）和 frida_tools（npm/TypeScript 会 OOM/SIGABRT）。
> - **关键 configure 参数：** `--build=linux-arm64`（用 `android-*` 会触发 NDK 依赖）；`--force-fallback-for=glib-2.0,...` 强制用修补版 GLib；`-Dglib:iconv=external` 解决 `libiconv_open` 未定义符号（Bionic iconv 不完整）。
> - **Bionic 链接器假阳性：** Bionic 链接器不报未解析符号错误，导致 meson 误判 `close_range`、`lchmod`、`getmntent_r` 等函数存在，需每次 configure 后运行脚本删除 config.h 中的假 `HAVE_*` 宏；重新配置前必须 `rm -rf build` 避免缓存污染。
> - **11 个源码补丁：** 覆盖 compat/build.py 的 prebuilds 下载逻辑、selinux 子目录顺序与 include 路径、libc-shim.c 为 Bionic 定义 `FRIDA_STDIO_OPAQUE_FILE` 并守卫 stdin/stdout/stderr/tmpfile、GLib 多处假阳性防御、minizip-ng 4.x 新旧 API（`mz_zip_reader_create` 返回值）适配。
> - **产物与限制：** 可产出 frida-server、frida-inject、frida-gadget.so 及 Python 绑定，用 `-j2` 防 OOM；补丁因过于侵入且 Android 特化无法上游合并；compat 禁用后只能注入同架构进程，`frida.compile()` 不可用但核心注入功能正常。

## How hard can it be to build Frida natively on Android/Termux(without NDK?)

Seriously, How hard can it be?

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/15c6daaf772f4432.jpg)

## A bit of history

I like making tools I use available on Termux a lot. My journey with computers, Linux, reverse engineering, all of it started on Termux running on a little 3gb RAM Android Pie device. So when a friend asked me around [May 2024](https://t.me/fridadotre/114888) if I could build [Frida](https://frida.re/) natively on Termux, my first response was it’s already possible! Termux already ships Frida in [root-packages/frida/build.sh](https://github.com/termux/termux-packages/blob/master/root-packages/frida/build.sh), built using Android NDK.

But that wasn’t what he was asking about. He wanted to build it the same way you would on a Linux or macOS machine, just `./configure && ninja`, using the native compiler that comes with Termux, no NDK, no cross-compilation, no dependency on `build.frida.re` prebuilts. A truly native build. I honestly didn’t know if that was even possible, and when I asked around, everyone said the same thing: Frida can’t compile natively on Termux. To be fair, most people who work on Frida are PC/laptop folks, so native Android compilation isn’t really on their radar.

I dropped it at the time. I didn’t have enough knowledge of Frida’s codebase or how Vala/VAPI things worked to even know where to start.

Over time though, I kept learning. Around August 2024, Frida’s 17.x release switched to source compilation for `frida-python` installation, which completely broke the existing Termux setup. Before that, `frida-python` supported installation via the devkit, you could grab the cross-compiled devkit artifact from Frida’s GitHub releases and install from that. With the new release, that path was gone. People went from saying “Frida can’t be *compiled* on Termux” to “Frida can’t be *installed* on Termux”. That’s when I forked and started maintaining a [`frida-python`](https://github.com/AbhiTheModder/frida-python) ([https://t.me/AbhiTheM0dder/1317](https://t.me/AbhiTheM0dder/1317)) port that still supports devkit installation. It’s now the go-to way for Termux users to get Frida working.

As I spent more time contributing to VAPI-related projects on the radare2 side, I slowly started understanding how Frida’s build system actually works under the hood.

Two years later 😂, exactly on April 23, 2026 I was on vacation with my family, didn’t have my laptop, and thought I’d take another crack at the native Frida build. To my surprise, all those past efforts actually paid off. I was able to compile Frida natively on Termux. The catch? The patches required are too invasive and Android/Bionic-specific to be accepted into official Frida which you’ll see why as we go through them.

## Prerequisites

Before we get into the build steps, a few things that should be common knowledge if you’ve ever built Frida anywhere (even on GitHub Actions):

-   Frida requires a patched Vala compiler with a `-frida` version suffix, stock Vala is rejected by the build system.
-   Frida requires its own patched GLib subproject, system GLib (even Termux’s) lacks internal functions like `gio_shutdown()` that Frida needs.
-   We must disable the compat system to avoid cross-architecture prebuilt downloads from `build.frida.re`.
-   We must disable `compiler_backend` because the Go/npm step crashes on Android.
-   We must disable `frida_tools` because npm/TypeScript compilation also crashes on Android (OOM/SIGABRT).

Let’s install the basic dependencies first:

```bash
pkg up -y && pkg i -y build-essential cmake clang ninja git python valac gobject-introspection libiconv libminizip-ng && pip install meson
```

Note: `valac` here is the **system** Vala, not the Frida-patched one (we need it as a bootstrap to build the Frida-patched Vala in Step 1). `libiconv` is needed because Bionic’s iconv is incomplete and GLib needs external libiconv. `libminizip-ng` is needed for ELF module support in frida-gum (with a minor API shim we’ll set up later).

Now grab the Frida source:

```bash
git clone https://github.com/frida/frida.git ~/frida --recursive
```

## Step 1: Build Frida-patched Vala compiler

```bash
git clone --depth 1 https://github.com/frida/vala.git ~/frida/deps/src/vala
mkdir -p ~/frida/deps/toolchain-linux-arm64
cd ~/frida/deps/src/vala
meson setup build --prefix=$HOME/frida/deps/toolchain-linux-arm64 -Doptimization=2
ninja -C build -j$(nproc)
meson install -C build
```

```bash
~/.../src/vala $ ls ..
vala
~/.../src/vala $ ls ../../
src  toolchain-linux-arm64
~/.../src/vala $ ls ../../toolchain-linux-arm64/
bin  include  lib  share
~/.../src/vala $ ls ../../toolchain-linux-arm64/lib/
libvala-0.58.so  pkgconfig  vala-0.58
~/.../src/vala $ ls ../../toolchain-linux-arm64/lib/vala-0.58/
gen-introspect-0.58  libvalacodegen.so
```

Now as it can be seen `libvalacodegen.so` install to `lib/vala-0.58/` which isn’t on the standard lib path, we’ll symlink it:

```bash
~/.../src/vala $ ln -sf $HOME/frida/deps/toolchain-linux-arm64/lib/vala-0.58/libvalacodegen.so $HOME/frida/deps/toolchain-linux-arm64/lib/libvalacodegen.so
```

Verify it:

```bash
~/.../src/vala $ LD_LIBRARY_PATH=$HOME/frida/deps/toolchain-linux-arm64/lib $HOME/frida/deps/toolchain-linux-arm64/bin/valac --version
Vala 0.58.0-frida
```

## Step 2: Clone Frida-patched GLib

```bash
cd ~/frida/subprojects/frida-gum/subprojects
git clone https://github.com/frida/glib.git glib
cd glib && git log --oneline -1
# Should show: 81b631758 gtask: Track pending GTasks...
```

We’ll also copy the wrap file to the top-level subprojects dir so meson can find it:

```bash
cp ~/frida/subprojects/frida-gum/subprojects/glib.wrap ~/frida/subprojects/glib.wrap
```

Now here’s something important that took me a while to figure out, Frida requires a **patched GLib** from `github.com/frida/glib` because it adds internal functions like `gio_shutdown()`, `glib_shutdown()`, `gio_deinit()` which are used by `agent-glue.c`, `gadget-glue.c`, `frida-glue.c`. System GLib (even Termux’s) does NOT have these, so we **must** use Frida’s version. That `--force-fallback-for` flag later ensures meson doesn’t try to use system GLib via pkg-config.

Also heads up, GLib ends up in **two** locations after this: `subprojects/glib/` (top-level, auto-cloned by meson from the wrap file) and `subprojects/frida-gum/subprojects/glib/` (the one we just cloned). The build actually uses the **top-level** one, but you should patch both to avoid confusion. The top-level one isn’t tracked by git either (it’s in `.gitignore`), so changes there won’t show up in `git status`.

## Step 3: Apply source patches

Alright, this is the part where things get fun (and by fun I mean painful). Multiple source files need patching before we can even configure, and these are exactly why this can’t be upstreamed into official Frida, the changes are too invasive and Android-specific.

> **Note**: All the patches and line numbers below are based on Frida **17.9.1** (the latest release at the time of working on it). Upstream changes may shift line numbers or restructure files, so if something doesn’t match up, check if the upstream code has changed since this version.

### Patch 1: compat/build.py — Skip upstream output groups when compat disabled

**File**: `subprojects/frida-core/compat/build.py` (~line 353)

Even with `compat=disabled`, the `glib_flavor == "upstream"` code path unconditionally creates an arm64 output group that triggers a separate meson configure for building agent/gadget binaries, which tries to download the prebuilt toolchain from `build.frida.re`. We need to gate it on compat actually being enabled:

```python
# Before:
if glib_flavor == "upstream":
# After:
if glib_flavor == "upstream" and len(compat) > 0:
```

### Patch 2: compat/build.py — Respect empty allowed_prebuilds

**File**: `subprojects/frida-core/compat/build.py` (~line 500, inside `compile()` function)

When we pass `--without-prebuilds`, `state.allowed_prebuilds` becomes an empty set. But the code overrides `allowed` to `None` when it’s an empty set, which re-enables all prebuild downloads. Classic 🤦

```python
# Before (approximate):
if state.allowed_prebuilds is not None:
    allowed = state.allowed_prebuilds
# After:
if state.allowed_prebuilds is not None and len(state.allowed_prebuilds) > 0:
    allowed = state.allowed_prebuilds
```

### Patch 3: selinux/meson.build — Swap subdir order

**File**: `subprojects/selinux/meson.build`

`libselinux` needs `libsepol_incdir` from `libsepol`, but `libselinux` subdir is processed first. Simple swap:

```meson
# Before:
subdir('libselinux')
subdir('libsepol')
# After:
subdir('libsepol')
subdir('libselinux')
```

### Patch 4: selinux/libselinux/src/meson.build — Add libsepol include path

**File**: `subprojects/selinux/libselinux/src/meson.build`

`load_policy.c` includes `<sepol/sepol.h>` but the include path isn’t set. Add `libsepol_incdir` to `include_directories` for both the library target and the `declare_dependency` call.

### Patch 5: libc-shim.c — FRIDA_STDIO_OPAQUE_FILE for Android

**File**: `subprojects/frida-core/lib/payload/libc-shim.c`

This one caused me a lot of headaches. Android Bionic has opaque `FILE*` struct (like musl), but the code only guards with `#ifdef HAVE_MUSL`. Accessing `FILE->_lbf_size` etc. just doesn’t work on Bionic.

After the existing `#ifdef HAVE_MUSL` block (around lines 55-58), add:

```c
#ifdef HAVE_ANDROID
#define FRIDA_STDIO_OPAQUE_FILE 1
#endif
```

Don’t worry about `HAVE_ANDROID` not being defined, frida-core’s top-level meson.build force-includes `config.h` via `add_project_arguments('-include', config.h, language: c_languages)`, so it propagates to all C files.

### Patch 6: libc-shim.c — Guard stdin/stdout/stderr and tmpfile

**File**: `subprojects/frida-core/lib/payload/libc-shim.c`

Bionic’s `<stdio.h>` already defines `stdin`, `stdout`, `stderr` as macros/inline functions, and `tmpfile()` as an inline function. Frida’s shim redefines them, causing compile errors. We need to guard them:

```c
#ifndef FRIDA_STDIO_OPAQUE_FILE
G_GNUC_INTERNAL FILE __sF[3];

# ifndef __ANDROID__
G_GNUC_INTERNAL FILE * stdin = &__sF[0];
G_GNUC_INTERNAL FILE * stdout = &__sF[1];
G_GNUC_INTERNAL FILE * stderr = &__sF[2];
# endif
// ...
```

And for `tmpfile()` (around line ~1517):

```c
#ifndef FRIDA_STDIO_OPAQUE_FILE
G_GNUC_INTERNAL FILE *
tmpfile (void)
{
  // ... code here ...
}
#endif
```

### Patch 7: glib/gspawn.c — Bionic close_range false positive

**File**: `subprojects/glib/glib/gspawn.c` (AND `subprojects/frida-gum/subprojects/glib/glib/gspawn.c`)

Add `!defined(__ANDROID__)` to the `HAVE_CLOSE_RANGE` guards:

```c
// Line ~1663: Change
#if defined(HAVE_CLOSE_RANGE) && defined(CLOSE_RANGE_CLOEXEC)
// To:
#if defined(HAVE_CLOSE_RANGE) && defined(CLOSE_RANGE_CLOEXEC) && !defined(__ANDROID__)

// Line ~1728: Change
#if defined(HAVE_CLOSE_RANGE)
// To:
#if defined(HAVE_CLOSE_RANGE) && !defined(__ANDROID__)
```

This is a defense-in-depth fix. The primary fix is the config.h post-processing we’ll do later.

### Patch 8: glib/gunixmounts.c — Bionic mntent false positives

**File**: `subprojects/glib/gio/gunixmounts.c` (AND `subprojects/frida-gum/subprojects/glib/gio/gunixmounts.c`)

After `#include "config.h"`, add:

```c
#ifdef __ANDROID__
#undef HAVE_CLOSE_RANGE
#undef HAVE_PRLIMIT
#undef HAVE_GETMNTENT_R
#undef HAVE_ENDMNTENT
#undef HAVE_SETMNTENT
#undef HAVE_HASMNTOPT
#endif
```

Again, defense-in-depth for the Bionic linker false positives.

### Patch 9: glib/meson.build — Remove close_range from function list

**File**: `subprojects/glib/meson.build` (AND `subprojects/frida-gum/subprojects/glib/meson.build`)

Remove `'close_range',` from the `functions = [...]` list (around line 618). This prevents meson from even checking for it, reducing false-positive cache entries. Not sufficient alone but reduces noise.

### Patch 10: glib/glocalfileinfo.c — Bionic lchmod false positive

**File**: `subprojects/glib/gio/glocalfileinfo.c` (AND `subprojects/frida-gum/subprojects/glib/gio/glocalfileinfo.c`)

After `#include "config.h"`, add:

```c
#ifdef __ANDROID__
#undef HAVE_LCHMOD
#endif
```

Bionic doesn’t have `lchmod()` but meson falsely detects it due to the permissive linker.

### Patch 11: minizip-ng 4.x API compatibility

This one was… interesting. Termux ships `libminizip-ng` 4.x which has a different API from the minizip Frida expects. Old API: `mz_zip_reader_create(&reader)` (pointer arg). New API: `reader = mz_zip_reader_create()` (returns pointer).

**File 1**: `subprojects/frida-gum/gum/gumelfmodule.c`

```c
// Before:
mz_stream_os_create(&zip_stream);
mz_zip_reader_create(&zip_reader);

// After:
zip_stream = mz_stream_os_create();
zip_reader = mz_zip_reader_create();
```

**File 2**: `subprojects/frida-core/vapi/minizip.vapi`

```vala
// Before:
public static Reader.create (out Reader stream = null);
// After:
public static Reader.create ();
```

We also need some system library setup (these are Termux system files, not in any git tree):

```bash
ln -sf minizip-ng/mz_compat.h /data/data/com.termux/files/usr/include/minizip/mz_compat.h
ln -sf minizip-ng/mz_zip.h /data/data/com.termux/files/usr/include/minizip/mz_zip.h
ln -sf minizip-ng/mz_zip_rw.h /data/data/com.termux/files/usr/include/minizip/mz_zip_rw.h
ln -sf minizip-ng/mz_os.h /data/data/com.termux/files/usr/include/minizip/mz_os.h
ln -sf libminizip-ng.so /data/data/com.termux/files/usr/lib/libminizip.so

# mz_config.h is missing from the package, create it:
cat > /data/data/com.termux/files/usr/include/minizip/mz_config.h << 'EOF'
#ifndef MZ_CONFIG_H
#define MZ_CONFIG_H
#define MZ_ZLIB 1
#define MZ_BZIP2 1
#define MZ_LZMA 1
#define MZ_PKCRYPT 1
#define MZ_WZAES 1
#define MZ_COMPAT 1
#endif
EOF
```

Phew, that’s all the patches. Yeah I know, it’s a lot. That’s exactly why this can’t go upstream, these are all Android/Bionic-specific workarounds that don’t make sense to any other platform.

## Step 4: Configure

Now we can finally configure. Set up the environment variables first:

```bash
cd ~/frida
export PATH=$HOME/frida/deps/toolchain-linux-arm64/bin:$PATH
export LD_LIBRARY_PATH=$HOME/frida/deps/toolchain-linux-arm64/lib:$LD_LIBRARY_PATH
```

**Always `rm -rf build` before configure** after patching, meson caches function detection results and stale caches will haunt you.

```bash
rm -rf build

./configure --build=linux-arm64 \
  --without-prebuilds=sdk,toolchain \
  -- -Dfrida-core:compat=disabled \
  -Dfrida-core:compiler_backend=disabled \
  -Dfrida-core:local_backend=enabled \
  -Dfrida_tools=disabled \
  --force-fallback-for=glib-2.0,gobject-2.0,gio-2.0,gmodule-2.0,gthread-2.0 \
  -Dglib:iconv=external \
  -Dserver=enabled \
  -Dinject=enabled \
  -Dgadget=enabled
```

Let me explain the important flags here because they matter a lot:

-   `--build=linux-arm64`: **NOT** `android-arm64`. Using `android-*` triggers `env_android.py` which requires NDK. `linux-arm64` uses native Termux clang/Bionic directly.
-   `--without-prebuilds=sdk,toolchain`: Skip downloading prebuilt deps from `build.frida.re` (the server is often down anyway).
-   `-Dfrida-core:compat=disabled`: Disable the compat system that cross-compiles/downloads agent/helper for foreign architectures.
-   `-Dfrida-core:compiler_backend=disabled`: Disable Go/npm compiler backend (frida-compile). Go crashes on Android. Disabling it means `frida.compile()` won’t work, but core frida-server still works fine.
-   `-Dfrida_tools=disabled`: frida-tools requires npm/TypeScript which crashes on Termux. The core binaries still build.
-   `--force-fallback-for=glib-2.0,...`: Force Frida-patched GLib subproject instead of system GLib. **Critical**— without this, meson finds Termux’s system GLib 2.88.0 via pkg-config and the build fails because system GLib lacks `gio_shutdown()` etc.
-   `-Dglib:iconv=external`: **Critical**: Use Termux’s libiconv. Without this, you’ll get `undefined symbol: libiconv_open`. Bionic’s `iconv.h` defines `iconv_open` as a macro to `libiconv_open`, so `-liconv` is required.
-   `-Dserver=enabled -Dinject=enabled -Dgadget=enabled`: By default these are `auto` and might not build if `local_backend` isn’t detected. Force-enable them.

If the configure Python wrapper SIGABRTs at the end (OOM on Termux), don’t panic, check if `build/build.ninja` exists. The meson setup already succeeded, only the post-setup file copying failed. Same thing if configure hangs on `ensure-submodules.py frida-python`, if `build/build.ninja` exists after a few minutes, you can Ctrl+C and move on.

## Step 5: Post-configure fixup — Bionic false positives

**This is critical and you need to do this after EVERY configure/reconfigure.**

Android Bionic’s linker doesn’t error on unresolved symbols at link time. This means meson’s `cc.has_function()` falsely reports functions as available. These false-positive `HAVE_*` defines cause compile errors when the code tries to call functions that don’t actually exist.

I made a helper script to automate this. Create `~/frida/bionic-fixup-config.sh`:

```bash
#!/bin/sh
# Fix false-positive HAVE_* defines in meson-generated config.h files
# caused by Bionic's permissive dynamic linker that doesn't error on
# unresolved symbols at link time.

for CONFIG_H in "$@"; do
  [ -f "$CONFIG_H" ] || continue
  for func in CLOSE_RANGE PRLIMIT LCHMOD GETMNTENT_R ENDMNTENT SETMNTENT HASMNTOPT; do
    sed -i "/^#define HAVE_${func} /d" "$CONFIG_H"
  done
  echo "Fixed Bionic false positives in $CONFIG_H"
done
```

Run it after every configure:

```bash
chmod +x ~/frida/bionic-fixup-config.sh
./bionic-fixup-config.sh $(find build/subprojects -name "config.h")
```

You can also test if a function actually exists in Bionic if you encounter more false positives:

```bash
echo "extern char FUNC(void); int main(){return FUNC();}" | cc -xc - -o /dev/null 2>/dev/null
# Exits 0 = false positive (Bionic linker allowed unresolved symbol)
# Exits 1 = properly detected as missing
```

## Step 6: Build

```bash
ninja -C build -j2
```

Use `-j2` on Termux (or even `-j1` if you’re on a low-RAM device). Higher parallelism causes OOM kills. Make sure `PATH` and `LD_LIBRARY_PATH` are still set as in Step 4.

If meson regenerates `config.h` during build (e.g. after a `--reconfigure`), run the fixup from Step 5 again.

With all patches applied and `compiler_backend` disabled, here’s roughly what to expect during the build:

-   ~450/1645: GLib compilation
-   ~750/1645: frida-gum linking (first major checkpoint)
-   ~1150/1645: frida-core linking (second checkpoint)
-   ~1639/1645: Final linking

If the build fails around 750-800, check for iconv linking errors (need `-Dglib:iconv=external`). If it fails around 1150, check for libc-shim errors (need the tmpfile and stdin/stdout/stderr guards).

## Build output

After a successful build (which takes a while, be patient), you should have:

-   `build/subprojects/frida-core/src/frida-helper` — Frida helper binary (ARM64)
-   `build/subprojects/frida-core/server/frida-server` — Main frida-server
-   `build/subprojects/frida-core/inject/frida-inject` — Injection tool
-   `build/subprojects/frida-core/lib/gadget/frida-gadget.so` — Gadget library
-   `build/subprojects/frida-python/frida/_frida/_frida.abi3.so` — Python bindings

## Running Frida

```bash
export LD_LIBRARY_PATH=~/frida/deps/toolchain-linux-arm64/lib:~/.local/lib:$LD_LIBRARY_PATH

# Run frida-server (requires root)
~/frida/build/subprojects/frida-core/server/frida-server &

# Test Python bindings
cd ~/frida
export PYTHONPATH=build/subprojects/frida-python
python3 -c "import frida; print(frida.__version__)"
```

## Common issues & pitfalls

### System GLib used instead of Frida-patched GLib

Without `--force-fallback-for=glib-2.0,...`, meson finds Termux’s system GLib via pkg-config. System GLib lacks `gio_shutdown()`, `glib_shutdown()`, `gio_deinit()`. Build fails at `agent-glue.c` with “undeclared function” errors. Always use `--force-fallback-for`.

### TWO copies of GLib

Meson places GLib source in `subprojects/glib/` (top-level) but `subprojects/frida-gum/subprojects/glib/` also exists. The **build uses the top-level copy**. Patch both to avoid confusion. You can verify which copy the build references with: `grep "glib/glib/gspawn" build/build.ninja`.

### Bionic linker false positives

**Always `rm -rf build` before reconfigure** after patching glib or any subproject. Meson caches function detection results. And always run the bionic-fixup script after configure.

### libiconv link error

Build fails with `undefined symbol: libiconv_open`. Fix: `-Dglib:iconv=external`. This tells GLib to use external libiconv from Termux.

### Compiler backend / Go crashes

The `frida-compiler-backend` requires Go and npm to build a TypeScript compiler. On Android, this crashes with SIGABRT. Disable with `-Dfrida-core:compiler_backend=disabled`. `frida.compile()` won’t work but core functionality (frida-server, injection) works fine.

### Configuring hangs or SIGABRTs

The `./configure` wrapper may SIGABRT (likely OOM) after meson setup succeeds. Check if `build/build.ninja` exists, if yes, you’re good. Also, `ensure-submodules.py frida-python` can hang, same advice, if `build/build.ninja` exists, Ctrl+C and proceed.

### Termux OOM during build

Use `-j2` or `-j1`. I know it’s slow but Android RAM isn’t unlimited. Higher parallelism causes OOM kills.

## Architecture notes

-   Native build links against Termux’s Bionic libc
-   `glib_flavor=upstream` is used when using bundled Frida GLib (forced via `--force-fallback-for`)
-   Compat disabled means frida-server can only inject into same-architecture processes
-   `host_system` in meson is `linux` (not `android`) because we use `--build=linux-arm64` so, `if host_system == 'android'` guards in meson.build WON’T trigger. Use `#ifdef __ANDROID__` in C code instead.
-   `__ANDROID__` is always defined by the Android toolchain, use it for source-level Bionic guards.

## Quick configure command reference

```bash
cd ~/frida
export PATH=$HOME/frida/deps/toolchain-linux-arm64/bin:$PATH
export LD_LIBRARY_PATH=$HOME/frida/deps/toolchain-linux-arm64/lib:$LD_LIBRARY_PATH

rm -rf build

./configure --build=linux-arm64 \
  --without-prebuilds=sdk,toolchain \
  -- -Dfrida-core:compat=disabled \
  -Dfrida-core:compiler_backend=disabled \
  -Dfrida-core:local_backend=enabled \
  -Dfrida_tools=disabled \
  --force-fallback-for=glib-2.0,gobject-2.0,gio-2.0,gmodule-2.0,gthread-2.0 \
  -Dglib:iconv=external \
  -Dserver=enabled \
  -Dinject=enabled \
  -Dgadget=enabled

./bionic-fixup-config.sh $(find build/subprojects -name "config.h")

ninja -C build -j2
```

## Wrapping up

So yeah, that’s how you build Frida natively on Termux. Is it a lot of patches? Yes. Is it worth it? Also yes. There’s something satisfying about building a tool natively on the same device you’re going to use it on, without needing a laptop or cross-compilation setup.

The reason this can’t be upstreamed isn’t that Frida can’t build on Android (it can, via NDK cross-compilation). The reason is that the patches required for native Bionic compilation are too hacky/invasive, things like post-processing `config.h` to remove false positives, adapting to Termux’s specific minizip-ng version, etc. These aren’t changes the upstream project would accept because they’re workarounds, not proper fixes. Bionic is just… different enough to make things painful.

But if you’re like me and your phone is your primary machine, or you just want to hack on Frida while on the go, now you can. Happy reversing!
