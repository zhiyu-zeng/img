---
title: DUCTF 2024 ESPecially Secure Boot Writeup - elttam
source: https://www.elttam.com/blog/ductf24-especially-secure-boot
source_host: www.elttam.com
clip_date: 2026-09-18T10:46:28+08:00
trace_id: 9062f9ca-b22c-4ec9-937d-c9f6a2b5dc91
content_hash: c0a651be0d2f28f72393e1aa4c1220e2310a9f663e15a38c63e818bd3aacbb38
status: synced
tags:
  - CTF
  - 硬件逆向
series: null
feed_source: elttam
ai_summary: 利用 ESP32 应用镜像段头未校验加载地址的缺陷，覆盖二级 bootloader 的验签分支，绕过 Secure Boot 读出 flash 中的 flag。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3df75244-d011-8122-837a-c717d4505bad
ioc:
  cves:
    - CVE-2018-18558
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 利用 ESP32 应用镜像段头未校验加载地址的缺陷，覆盖二级 bootloader 的验签分支，绕过 Secure Boot 读出 flash 中的 flag。
> 
> - **漏洞根因：** ESP-IDF 2.x/3.0.5/3.1 的 `process_segment()` 只检查段末尾是否压到 bootloader 栈，未校验 `load_addr` 是否落在 0x40078000 起的 `iram_loader_seg`（二级 bootloader 自身代码区）；v3.1.1 补丁新增 else 分支并用 `bootloader_util_regions_overlap()` 做重叠检查。
> - **环境与准备：** 挑战监听 1337 端口，`run.py` 把 base64 blob 写入镜像偏移 0x20000 后用 QEMU 模拟；bootloader 为 v3.1-rc2、启用 Secure Boot V1；可编译带符号 bootloader 建 Ghidra FID/类型库，再用 esp32knife 从 flash-base.bin 提取并恢复符号。
> - **利用原语：** 篡改 `esp_image_segment_header_t.load_addr` 得到 write-what-where；写入内容会被 `ram_obfs_value` 随机异或混淆且验签后才解密，作者放弃精确控制写入字节，改赌 PRNG（QEMU 以 `-seed 1234` 固定）。
> - **攻击点：** 目标是 `esp_image_load()` 中 `verify_secure_boot_signature()` 之后判断是否跳 err 的分支，位于 0x4007a3f4；覆盖它即可让验签失败仍继续执行应用。
> - **Payload 与取旗：** 以 hello_world 工程为壳，追加 `load_addr=0x4007a3f4`、`data_len=4` 的伪段，更新镜像 checksum/SHA256 并附伪造签名块；应用内用 `spi_flash_read(0x133370)` 读取并打印 "DUCTF{...}"。

## Introduction

elttam recently had the pleasure of being a gold sponsor for DownUnderCTF (DUCTF), Australia and New Zealand’s largest capture the flag competition.Not only is it the largest, but it’s also one of the most creative CTF’s around which forces players to push the boundaries of what they know and learn something new in the process.This blog post describes the author’s approach to solving a Medium difficulty pwn challenge titled “ESPecially Secure Boot”, which required writing an exploit for [CVE-2018-18558](https://www.espressif.com/en/news/Espressif_Product_Security_Advisory_Concerning_Secure_Boot_\(CVE-2018-18558\)).

Dockerfiles and associated code have been published on the elttam GitHub repo [here](https://github.com/elttam/DUCTF-ESPecially-secure-boot), which the reader is encouraged to use and follow along with the writeup.Quick setup steps are as follows:

-   Clone repo with `git clone https://github.com/elttam/DUCTF-ESPecially-secure-boot/`
-   Build Docker containers with `./setup.sh`
-   Start containers with: `docker compose up --detach`
-   Stop containers: `docker compose stop`
-   Interact with challenge container with: `docker compose exec challenge /bin/bash`
-   Interact with the solution container with: `docker compose exec solution /bin/bash`

## Challenge: ESPecially Secure Boot

The challenge description clearly indicates the goal for players will be to craft a malicious application image for the [ESP32](https://www.espressif.com/en/products/socs/esp32), which can be used to bypass the Second Stage bootloader’s Secure Boot implementation:

“The ESP-IDF 2nd stage Bootloader implements functions related to the Secure Boot feature.In previous releases of ESP-IDF releases (2.x, 3.0.5, 3.1), the 2nd stage Bootloader did not sufficiently verify the load address of binary image sections.If the Secure Boot feature was used without the Flash Encryption feature enabled, an attacker could craft a binary which would overwrite parts of the 2nd stage Bootloader’s code whilst the binary file is being loaded.Such a binary could be used to execute arbitrary code, thus bypassing the Secure Boot check.”

The challenge itself listens on port `1337`, and executes `run.py` for each new connection.The run script is responsible for copying the original firmware in `flash-base.bin` to a new temporary file, asking the user for a base64 blob which will be decoded and written to the file at offset `0x20000` (thereby “flashing” our new application image), and will finally use QEMU to emulate it.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/40d6d237ac817e30.avif)

The readme.txt file also provides some useful information about the challenge environment:

“The QEMU binary used in this challenge is compiled from https://github.com/espressif/qemu.No modifications have been made to QEMU or the ROMs provided.The bootloader was built from https://github.com/espressif/esp-idf/tree/v3.1-rc2 with relatively standard configs and secure boot V1 enabled.No modifications have been made to the bootloader.This is an old version of ESP-IDF, make sure to check for any known vulnerabilities!You can find the flag in flash.”

By knowing the specific bootloader release being used (`v3.1-rc2`), this information will assist with vuln triage and creating type and function signature databases for reversing as shown later in the article.

## CVE-2018-18558

The [Espressif Advisory](https://www.espressif.com/en/news/Espressif_Product_Security_Advisory_Concerning_Secure_Boot_\(CVE-2018-18558\)) says “ESP-IDF V3.1.1 and V3.0.6 contain the fix”.Therefore, we can diff one of these with a previous version (v3.1.1 with v3.1 in this example) to find the vulnerability.The second stage bootloader code responsible for segment loading can be found under `components/bootloader_support/esp_image_format.c:process_segment()`, so we’ll use this knowledge to narrow our focus to code which has changed in its proximity:

```objectivec
diff --git a/components/bootloader_support/src/esp_image_format.c b/components/bootloader_support/src/esp_image_format.c
index 92acf3b025..0ecf6e6c98 100644
--- a/components/bootloader_support/src/esp_image_format.c
+++ b/components/bootloader_support/src/esp_image_format.c
@@ -287,18 +306,41 @@ static esp_err_t process_segment(int index, uint32_t flash_addr, esp_image_segme
                  (do_load)?'load':(is_mapping)?'map':'');
     }

+
+#ifdef BOOTLOADER_BUILD
+    /* Before loading segment, check it doesn't clobber bootloader RAM. */
     if (do_load) {
-        /* Before loading segment, check it doesn't clobber bootloader RAM... */
-        uint32_t end_addr = load_addr + data_len;
-        if (end_addr < 0x40000000) {
+        const intptr_t load_end = load_addr + data_len;
+        if (load_end <= (intptr_t) SOC_DIRAM_DRAM_HIGH) {
+            /* Writing to DRAM */
             intptr_t sp = (intptr_t)get_sp();
-            if (end_addr > sp - STACK_LOAD_HEADROOM) {
-                ESP_LOGE(TAG, 'Segment %d end address 0x%08x too high (bootloader stack 0x%08x liimit 0x%08x)',
-                         index, end_addr, sp, sp - STACK_LOAD_HEADROOM);
+            if (load_end > sp - STACK_LOAD_HEADROOM) {
+                /* Bootloader .data/.rodata/.bss is above the stack, so this
+                 * also checks that we aren't overwriting these segments.
+                 *
+                 * TODO: This assumes specific arrangement of sections we have
+                 * in the ESP32. Rewrite this in a generic way to support other
+                 * layouts.
+                 */
+                ESP_LOGE(TAG, 'Segment %d end address 0x%08x too high (bootloader stack 0x%08x limit 0x%08x)',
+                         index, load_end, sp, sp - STACK_LOAD_HEADROOM);
+                return ESP_ERR_IMAGE_INVALID;
+            }
+        } else {
+            /* Writing to IRAM */
+            const intptr_t loader_iram_start = (intptr_t) &_loader_text_start;
+            const intptr_t loader_iram_end = (intptr_t) &_loader_text_end;
+
+            if (bootloader_util_regions_overlap(loader_iram_start, loader_iram_end,
+                    load_addr, load_end)) {
+                ESP_LOGE(TAG, 'Segment %d (0x%08x-0x%08x) overlaps bootloader IRAM (0x%08x-0x%08x)',
+                         index, load_addr, load_end, loader_iram_start, loader_iram_end);
                 return ESP_ERR_IMAGE_INVALID;
             }
         }
     }
+#endif // BOOTLOADER_BUILD
+
```

What is immediately obvious in this diff is the introduction of an `else{}` block which will ensure the `load_addr` and `load_end` variables don’t overlap the region between `loader_iram_start` and `loader_iram_end`.These new variables are initialized like so:

```ruby
ctf@4df76f5095bf:~/esp-idf$ grep -irE 'loader_iram_(start|end) ='
components/bootloader_support/src/esp_image_format.c:            const intptr_t loader_iram_start = (intptr_t) &_loader_text_start;
components/bootloader_support/src/esp_image_format.c:            const intptr_t loader_iram_end = (intptr_t) &_loader_text_end;
```

Digging a little deeper, it just so happens `_loader_text_start` and `_loader_text_end` are defined by the `esp32.bootloader.ld` linker script:

```plaintext
MEMORY
{
  /* I/O */
  dport0_seg (RW) :                     org = 0x3FF00000, len = 0x10
  /* IRAM POOL1, used for APP CPU cache. Bootloader runs from here during the final stage of loading the app because APP CPU is still held in reset, the main app enables APP CPU cache */
  iram_loader_seg (RWX) :           org = 0x40078000, len = 0x8000  /* 32KB, APP CPU cache */
  iram_seg (RWX) :                  org = 0x40080000, len = 0x10000 /* 64KB, IRAM */
  /* 64k at the end of DRAM, after ROM bootloader stack */
  dram_seg (RW) :                       org = 0x3FFF0000, len = 0x10000
}

/*  Default entry point:  */
ENTRY(call_start_cpu0);


SECTIONS
{

  .iram_loader.text :
  {
    . = ALIGN (16);
    _loader_text_start = ABSOLUTE(.);
    *(.stub .gnu.warning .gnu.linkonce.literal.* .gnu.linkonce.t.*.literal .gnu.linkonce.t.*)
     *(.iram1 .iram1.*) /* catch stray IRAM_ATTR */
    *liblog.a:(.literal .text .literal.* .text.*)
    *libgcc.a:(.literal .text .literal.* .text.*)
    *libbootloader_support.a:bootloader_common.o(.literal .text .literal.* .text.*)
    *libbootloader_support.a:bootloader_flash.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:bootloader_random.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:bootloader_utility.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:bootloader_sha.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:efuse.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:esp_image_format.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:flash_encrypt.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:flash_partitions.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:secure_boot.*(.literal .text .literal.* .text.*)
    *libbootloader_support.a:secure_boot_signatures.*(.literal .text .literal.* .text.*)
    *libmicro-ecc.a:*.*(.literal .text .literal.* .text.*)
    *libspi_flash.a:*.*(.literal .text .literal.* .text.*)
    *libsoc.a:rtc_wdt.*(.literal .text .literal.* .text.*)
    *(.fini.literal)
    *(.fini)
    *(.gnu.version)
    _loader_text_end = ABSOLUTE(.);
  } > iram_loader_seg
```

What this essentially says is `_loader_text_start` will be equal to the start address of `iram_loader_seg` (`0x40078000`), and `_loader_text_end` will be equal to the end of the second stage bootloader (known only at link time, in my debug setup it’s `0x4007b8b9`).

Therefore, we now understand that vulnerable versions did not sufficiently protect the region of memory at `iram_loader_seg` which contains… you guessed it… the second stage bootloader.If we review the vulnerable `process_segment()` function, we see there’s insufficient verification of `load_addr` and `end_addr`, and it just so happens these values are calculated from **our application image**… Now we’re getting somewhere.

The vulnerable `process_segment()` function looks like so:

```c
static esp_err_t process_segment(int index, uint32_t flash_addr, esp_image_segment_header_t *header, bool silent, bool do_load, bootloader_sha256_handle_t sha_handle, uint32_t *checksum)
{
    esp_err_t err;

    /* read segment header */
    err = bootloader_flash_read(flash_addr, header, sizeof(esp_image_segment_header_t), true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, 'bootloader_flash_read failed at 0x%08x', flash_addr);
        return err;
    }
    if (sha_handle != NULL) {
        bootloader_sha256_data(sha_handle, header, sizeof(esp_image_segment_header_t));
    }

    intptr_t load_addr = header->load_addr;
    uint32_t data_len = header->data_len;
    uint32_t data_addr = flash_addr + sizeof(esp_image_segment_header_t);

    ESP_LOGV(TAG, 'segment data length 0x%x data starts 0x%x', data_len, data_addr);

    err = verify_segment_header(index, header, data_addr, silent);
    if (err != ESP_OK) {
        return err;
    }

    if (data_len % 4 != 0) {
        FAIL_LOAD('unaligned segment length 0x%x', data_len);
    }

    bool is_mapping = should_map(load_addr);
    do_load = do_load && should_load(load_addr);

    if (!silent) {
        ESP_LOGI(TAG, 'segment %d: paddr=0x%08x vaddr=0x%08x size=0x%05x (%6d) %s',
                 index, data_addr, load_addr,
                 data_len, data_len,
                 (do_load)?'load':(is_mapping)?'map':'');
    }

    if (do_load) {
        /* Before loading segment, check it doesn't clobber bootloader RAM... */
        uint32_t end_addr = load_addr + data_len;
        if (end_addr < 0x40000000) {
            intptr_t sp = (intptr_t)get_sp();
            if (end_addr > sp - STACK_LOAD_HEADROOM) {
                ESP_LOGE(TAG, 'Segment %d end address 0x%08x too high (bootloader stack 0x%08x liimit 0x%08x)',
                         index, end_addr, sp, sp - STACK_LOAD_HEADROOM);
                return ESP_ERR_IMAGE_INVALID;
            }
        }
    }

    err = process_segment_data(load_addr, data_addr, data_len, do_load, sha_handle, checksum);
    if (err != ESP_OK) {
        return err;
    }
    return ESP_OK;

err:
    if (err == ESP_OK) {
        err = ESP_ERR_IMAGE_INVALID;
    }

    return err;
}
```

The astute reader will see this function doesn’t actually read segment data into memory, it’s simply enforcing some validation rules:

-   The segment data length must be 4-byte aligned
-   The segment end must not intrude on the bootloader stack region

The actual segment loading happens in `process_segment_data()`, which we’ll look at soon.

We now have enough context about the underlying vulnerability that needs to be exploited, we can now shift our attention to how to trigger it.

## Application Image Format

If we’re going to be manipulating segment load address information, we’ll need to learn a little about the application image format - which is fortunately very well documented in [App Image Format](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/app_image_format.html).The author also created an 010 Editor Template which can be found [here](https://github.com/elttam/DUCTF-ESPecially-secure-boot/blob/main/solution/esp32-image-template.bt), and is useful for quickly navigating around the image segments in a hex editor and having a colourful visualisation of what’s happening.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7e4c709b1ff88717.avif)

The overall structure of an application image is as follows:

-   The first 24 bytes consist of the `esp_image_header_t` structure (let’s call this `header`).
-   There’s an array of `header.segment_count` entries of type `esp_image_segment_header_t` (lets call this `segmenthdr`).
-   After each `segmenthdr` is a data blob of `segmenthdr.data_len` size (lets call this `segmentdata`).
-   After the final `segmentdata`, there may be up to 15 padding bytes followed by a checksum.
-   The checksum is the xorsum of 0xEF and all data bytes within the image segments.
-   If `header.hash_appended` is set, a SHA256 digest of all data after `header` is appended to the image for integrity verification.
-   If the application is compiled with secure boot enabled, an `esp_secure_boot_sig_block_t` structure will be appended for Secure Boot verification.

For easy reference, the structures we’ve just talked about are defined as:

```c
typedef struct {
    uint8_t magic;
    uint8_t segment_count;
    uint8_t spi_mode;
    uint8_t spi_speed: 4;
    uint8_t spi_size: 4;
    uint32_t entry_addr;
    uint8_t wp_pin;
    uint8_t spi_pin_drv[3];
    uint8_t reserved[11];
    uint8_t hash_appended;
} __attribute__((packed))  esp_image_header_t;

/* Header of binary image segment */
typedef struct {
    uint32_t load_addr;
    uint32_t data_len;
} esp_image_segment_header_t;

#define ESP_IMAGE_MAX_SEGMENTS 16

typedef struct {
    uint32_t version;
    uint8_t signature[64];
} esp_secure_boot_sig_block_t;
```

We’ll be manipulating the `esp_image_segment_header_t.load_addr` members of our application image to abuse the fact that `process_segment()` does insufficient validation resulting in a write-what-where primitive in `process_segment_data()`.

## Exploitation

### Application

If our primary objective is to bypass secure boot, our secondary objective is to have an application which if executed can read the flag.The esp-idf [SPI Flash API](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/spi_flash/index.html) docs mention the [`esp_flash_read()`](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/spi_flash/index.html#_CPPv414esp_flash_readP11esp_flash_tPv8uint32_t8uint32_t) function, which we can use to read data from an arbitrary flash address.

To confirm which address we want to read, we can search for the unique identifier “DUCTF” in flash - which is present at address 0x133370.

```ruby
root@e84757f52fc0:/home/ctf# strings --radix=x ./flash-base.bin | grep DUCTF
 133370 DUCTF{dummy_test_flag_real_flag_is_on_the_server}
root@e84757f52fc0:/home/ctf#
```

Putting this information together, our application should look like so:

```c
#include <stdio.h>
#include <string.h>
#include 'freertos/FreeRTOS.h'
#include 'freertos/task.h'
#include 'esp_system.h'
#include 'esp_spi_flash.h'

#define READ_OFFSET 0x133370
#define BUFFER_SIZE 64  // Adjust size as needed

void app_main(void)
{
    uint8_t buffer[BUFFER_SIZE];
    esp_err_t ret;

    // Initialize buffer to zero
    memset(buffer, 0, BUFFER_SIZE);

    // Read data from SPI flash
    ret = spi_flash_read(READ_OFFSET, buffer, BUFFER_SIZE);
    if (ret != ESP_OK) {
        printf('Error reading SPI flash: %s\n', esp_err_to_name(ret));
    } else {
        printf('Data read from SPI flash: %s\n', buffer);
    }

    while (1) {
        vTaskDelay(1000 / portTICK_PERIOD_MS);
    }
}
```

The `esp-idf` framework comes with some really useful and ready to use example applications, so we’ll repurpose the `esp-idf/examples/get-started/hello_world/` project for our testing. Simply replace the `main/hello_world_main.c` file with the above code and run `make`.

### Write What?

What are we going to write? The obvious answer is “some bytes which will bypass secureboot verification”.For example, we might want to change the opcodes or operands of a branch instruction to invert the logic so execution continues on signature verification failure.This seems straightforward, however there’s a catch.The `process_segment_data()` function will obfuscate image data in RAM, and not deobfuscate until **after** secureboot verification.This means we don’t have reliable control over the “what” in our write-what-where primitive.

```c
static esp_err_t process_segment_data(intptr_t load_addr, uint32_t data_addr, uint32_t data_len, bool do_load, bootloader_sha256_handle_t sha_handle, uint32_t *checksum)
{
    const uint32_t *data = (const uint32_t *)bootloader_mmap(data_addr, data_len);
    if(!data) {
        ESP_LOGE(TAG, 'bootloader_mmap(0x%x, 0x%x) failed',
                 data_addr, data_len);
        return ESP_FAIL;
    }

    // Set up the obfuscation value to use for loading
    while (ram_obfs_value[0] == 0 || ram_obfs_value[1] == 0) {
        bootloader_fill_random(ram_obfs_value, sizeof(ram_obfs_value));
    }
    uint32_t *dest = (uint32_t *)load_addr;

    const uint32_t *src = data;

    for (int i = 0; i < data_len; i += 4) {
        int w_i = i/4; // Word index
        uint32_t w = src[w_i];
        *checksum ^= w;
        if (do_load) {
            dest[w_i] = w ^ ((w_i & 1) ? ram_obfs_value[0] : ram_obfs_value[1]);
        }
        // SHA_CHUNK determined experimentally as the optimum size
        // to call bootloader_sha256_data() with. This is a bit
        // counter-intuitive, but it's ~3ms better than using the
        // SHA256 block size.
        const size_t SHA_CHUNK = 1024;
        if (sha_handle != NULL && i % SHA_CHUNK == 0) {
            bootloader_sha256_data(sha_handle, &src[w_i],
                                   MIN(SHA_CHUNK, data_len - i));
        }
    }

    bootloader_munmap(data);

    return ESP_OK;
}
```

The author believes this is why the `run.py` script in the challenge files use the `-seed 1234` argument to QEMU, which will force the guest to use a deterministic PRNG, seeded with `1234`.If the state of the `ram_obfs_value` array is dumped, it should allow for reliable exploitation.However, the author decided to live dangerously and let the gods of chaos choose *what* the data is.By not caring what specific bytes we’re writing and passing that level of control over to the PRNG, we hope that at least some of the time a byte sequence is produced which is advantageous to the player.

### Write Where?

We want to write to a location in the second stage bootloader which will be executed soon after the load.The ideal location will be the branch statement which makes the decision to continue or exit application execution after secure boot verification.Revisiting the `esp_image_load()`, function which is the caller of `process_segment()`, we see a call to `verify_secure_boot_signature()` to check the application signature, followed by the conditional statement we want to abuse.

```c
esp_err_t esp_image_load(esp_image_load_mode_t mode, const esp_partition_pos_t *part, esp_image_metadata_t *data)
{
    //...
    bool is_bootloader = (data->start_addr == ESP_BOOTLOADER_OFFSET);
    if (!is_bootloader) {
        // secure boot images have a signature appended
        err = verify_secure_boot_signature(sha_handle, data);
    }
    // ...
    sha_handle = NULL;
    if (err != ESP_OK) {
        goto err;
    }
```

The real question is, where in this 4MB firmware dump can we find this check? We can take the following approach:

-   Compile our own second stage bootloader with debug symbols.Loading this into Ghidra, we can capture custom type information into a new Ghidra Type Archive.

-   Create our own Ghidra FunctionID database, which can be used to pattern match a stripped binary like the challenge firmware and restore identified function names.

-   Extract the challenge bootloader out of `flash-base.bin` using the open source [esp32knife](https://github.com/BlackVS/esp32knife) project.Loading this into Ghidra, we can enable the “Function ID” analysis step which will use our custom FIDdb to restore function names.We can also apply type archive to the identified functions to restore type information.

As a result, it was simple to navigate to `esp_image_load()` and find the corresponding check which happens at address `0x4007a3f4`.This will be the target of our overwrite and answers our question of “write where?”.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/14c995c4ed8dd4da.avif)

### PoC

With all this information at hand, we can now write a proof of concept.Our code will do as follows:

1.  Load our “hello_world.bin” application payload
2.  Add a new segment with the load_addr set to `0x4007a3f4`, data_size set to 0x04, and 4 bytes that can be anything.
3.  Update the image checksum
4.  Add the sha256 integrity hash if needed
5.  Add a fake Secure Boot signature to ensure the loader gets to the point of signature verification
6.  Base64 encode and send our payload to the target
7.  Poll until our exploit is successful and we get the flag

The proof of concept exploit can be found [here](https://github.com/elttam/DUCTF-ESPecially-secure-boot/blob/main/solution/exploit.py), and when run should look something like this:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e476ba4f0eb30382.gif)

## Conclusion

This challenge forced players to learn about the internals of the ESP-IDF second stage bootloader, often used on ESP32 microcontrollers.The challenge had several interesting obstacles such as obfuscation and data constraints, which made it enjoyable to play in a CTF.And finally, it required writing an exploit for [CVE-2018-18558](https://www.espressif.com/en/news/Espressif_Product_Security_Advisory_Concerning_Secure_Boot_\(CVE-2018-18558\)) which, at the time of publishing this post, had no such PoC.

During the process of solving the challenge, there were also several interesting observations which the reader is encouraged to play with, especially if wanting to exploit this issue on real hardware.

1.  The challenge publishes the `qemu-efuse.bin` binary, which gives attackers read-access to the usually secret [eFuse](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/efuse.html) blocks `EFUSE_BLK1` and `EFUSE_BLK2`.If flash encryption were enabled, could we still exploit this issue?
2.  If we write `0x00000000` to `ram_obfs_value[0]`, it will make `ram_obfs_value[0] = ram_obfs_value[1]`.As the Xtensa ISA allows 2 and 3 byte instructions, is this a useful primitive?
3.  To write into the `0x3fff0000` range, we need the end to be `>= 0x40000000`.If our data is nothing but `0x00` bytes, it seems we can leak the key of `ram_obfs_value` in error messages.Is this a useful primitive?

The author would like to thank the DUCTF organisers for running a very enjoyable event, as well as the challenge creators joseph and HexF for the really interesting puzzle.

If you enjoyed this post and the topic of Secure Boot and MCUs interest you, come and check out elttam’s upcoming presentation at BSides Canberra 2024 on “ [Boot Security in the MCU](https://cfp.bsidescbr.com.au/bsides-canberra-2024/talk/LUSMY8/) ”.If you’re an Australian player of DUCTF, solved multiple challenges, and are interested in a career at elttam please feel free to [get in touch](https://www.elttam.com/#contact).
