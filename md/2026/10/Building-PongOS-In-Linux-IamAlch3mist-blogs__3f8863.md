---
title: "Building PongOS In Linux :: IamAlch3mist blogs"
source: https://iamalch3mist.github.io/posts/building_pongos/
source_host: iamalch3mist.github.io
clip_date: 2026-10-09T10:26:25+08:00
trace_id: 51c3693f-d2c8-4e8c-9269-ad38b06ed496
content_hash: b834f4cc775aea41968760e193773a14a554da4b46d8c47acdd763ba52d2d901
status: synced
tags:
  - iOS逆向
  - 开发工具
series: null
feed_source: IamAlch3mist·Android/固件逆向
ai_summary: 在 Ubuntu 24.04 上无法直接编译的 PongoOS，通过补丁与指定工具链（cctools-strip、clang-15、checkra1n ld64）可成功构建出可在 checkm8 设备上引导的镜像。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-8152-9791-cf1b50c8520f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 在 Ubuntu 24.04 上无法直接编译的 PongoOS，通过补丁与指定工具链（cctools-strip、clang-15、checkra1n ld64）可成功构建出可在 checkm8 设备上引导的镜像。
> 
> - **依赖安装：** 添加 checkra1n 的 Debian 源、导入 archive.key，安装 `cctools-strip` 作为 STRIP 工具。
> - **源码与链接器：** `git clone --recursive` 拉取 PongoOS，并单独下载 checkra1n 的 `ld64-x86_64` 放到 `/usr/bin/ld64`。
> - **必须打的两个补丁：** `src/kernel/task.c` 增加 `#include <stdarg.h>`；Makefile 中把 `-Werror` 换成 `-Wunused-but-set-variable`，避免警告即错误导致中断。
> - **编译命令：** `EMBEDDED_CC=clang-15 EMBEDDED_LDFLAGS="-fuse-ld=/usr/bin/ld64 -fno-lto" STRIP=cctools-strip make -j1 all`，即单线程构建并禁用 LTO。
> - **产物与引导：** 结果位于 `build/`，含 `Pongo`、`Pongo.bin`、`PongoConsolidated.bin`、`checkra1n-kpf-pongo`、`vmacho`；用 `checkra1n -k Pongo.bin` 引导。

A while ago I tried to build PongOS (a pre-boot execution enviroinment for checkm8 vulnerable iOS devices) on my Linux (ubuntu 24.04) machine but it didn’t compile out of the box.

DOCUMENTING IT FOR FUTURE REFERENCES.

```bash
echo 'deb https://assets.checkra.in/debian /' | sudo tee /etc/apt/sources.list.d/checkra1n.list
sudo apt-key adv --fetch-keys https://assets.checkra.in/debian/archive.key
sudo apt update && sudo apt install cctools-strip
```

Download PongOS repo from github.

```bash
git clone --recursive https://github.com/checkra1n/PongoOS
```

Download checkra1n ld64 linker.

```bash
wget https://github.com/checkra1n/ld64-build/releases/download/954.16-0/ld64-x86_64 -o /usr/bin/ld64
```

## 源码与 Makefile 补丁

Apply the below patches.

```patch
diff --git a/src/kernel/task.c b/src/kernel/task.c
index 0e6fa22..3ffffd1 100644
--- a/src/kernel/task.c
+++ b/src/kernel/task.c
@@ -27,6 +27,7 @@
 #include <errno.h>
 #include <stdlib.h>
 #include <pongo.h>
+#include <stdarg.h>

 extern void task_load(struct task* to_task);
 extern void task_load_asserted(struct task* to_task);
```

```patch
diff --git a/Makefile b/Makefile
index 38bef74..cdd9391 100644
--- a/Makefile
+++ b/Makefile
@@ -52,7 +52,7 @@ RA1N                    := checkra1n/kpf

 # General options
 EMBEDDED_LD_FLAGS       ?= -nostdlib -static -Wl,-fatal_warnings -Wl,-dead_strip -Wl,-Z $(EMBEDDED_LDFLAGS)
-EMBEDDED_CC_FLAGS       ?= --target=arm64-apple-ios12.0 -std=gnu17 -Wall -Wunused-label -Werror -O3 -flto -ffreestanding -U__nonnull -nostdlibinc -DTARGET_OS_OSX=0 -DTARGET_OS_MACCATALYST=0 -I$(LIB)/include $(EMBEDDED_LD_FLAGS) $(EMBEDDED_CFLAGS)
+EMBEDDED_CC_FLAGS       ?= --target=arm64-apple-ios12.0 -std=gnu17 -Wall -Wunused-label -Wunused-but-set-variable -O3 -flto -ffreestanding -U__nonnull -nostdlibinc -DTARGET_OS_OSX=0 -DTARGET_OS_MACCATALYST=0 -I$(LIB)/include $(EMBEDDED_LD_FLAGS) $(EMBEDDED_CFLAGS)

 # Pongo options
 PONGO_LDFLAGS           ?= -L$(LIB)/lib -lc -lm -Wl,-preload -Wl,-no_uuid -Wl,-e,start -Wl,-order_file,$(SRC)/sym_order.txt -Wl,-image_base,0x100000000 -Wl,-sectalign,__DATA,__common,0x8 -Wl,-segalign,0x4000
```

## clang-15 编译命令

Use clang-15 to compile.

```
EMBEDDED_CC=clang-15 EMBEDDED_LDFLAGS="-fuse-ld=/usr/bin/ld64 -fno-lto" STRIP=cctools-strip make -j1 all
```

After building PongOS binaries can be found in build/ dir.

```bash
ls -la build/
total 2228
drwxrwxr-x  2 puck puck   4096 Jan 26 23:59 .
drwxrwxr-x 14 puck puck   4096 Jan 26 23:58 ..
-rwxrwxr-x  1 puck puck  87848 Jan 26 23:59 checkra1n-kpf-pongo
-rwxrwxr-x  1 puck puck 758368 Jan 26 23:59 Pongo
-rw-rw-r--  1 puck puck 659712 Jan 26 23:59 Pongo.bin
-rw-rw-r--  1 puck puck 747576 Jan 26 23:59 PongoConsolidated.bin
-rwxrwxr-x  1 puck puck  16824 Jan 26 23:58 vmacho
```

## 引导 PongoOS

Boot the pongOS binary using checkra1n loader.

```
checkra1n -k Pongo.bin
```

## References

-   [https://github.com/checkra1n/PongoOS](https://github.com/checkra1n/PongoOS)
-   [https://github.com/checkra1n/PongoOS/issues/85#issuecomment-881963954](https://github.com/checkra1n/PongoOS/issues/85#issuecomment-881963954)
