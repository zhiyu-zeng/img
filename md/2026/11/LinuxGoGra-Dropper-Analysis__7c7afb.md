---
title: Linux/GoGra Dropper Analysis
source: https://cryptax.github.io/posts/gogra_dropper/
source_host: cryptax.github.io
clip_date: 2026-11-07T08:25:24+08:00
trace_id: 3bb586f2-d7de-4a58-ae12-43f1b2eee614
content_hash: 4cc0851418b0b9190821ad634093889c35bf080259681855284c872efe09a229
status: synced
tags: []
series: null
feed_source: cryptax·移动安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41175244-d011-817a-a7e7-f9e6a74b0aba
ioc:
  cves: []
  cwes: []
  hashes:
    - 9c23c65a8a392a3fd885496a5ff2004252f1ad4388814b20e5459695280b0b82
    - b14ca5898a4e4133bbce2ea2315a1916
    - e2f8b227e8b1046921acfd15acd06f32
    - e8114d6a18220998a1546cbbd633ce52
  domains: []
  tools: []
  techniques: []
---

## GoGra Linux Dropper analysis

**GoGra** is an backdoor family which emerged in 2024, mostly targeting India and Afghanistan. In April 2026, its developers released a *Linux variant*, which was analyzed [here](https://www.security.com/blog-post/harvester-new-linux-backdoor-gogra). In this blog post, we’ll go over a few interesting functionalities which were *not* detailed in that prior analysis.

IOC: `9c23c65a8a392a3fd885496a5ff2004252f1ad4388814b20e5459695280b0b82`

## Background info

[GoGra was first seen in November 2023](https://www.security.com/threat-intelligence/cloud-espionage-attacks). It is written in **Go** and abuses the **Microsoft Graph API**.

**Microsoft Graph API** is a REST API to access Office 365 resources. GoGra uses it to communicate via emails to a C2. This is smart for many reasons:

1.  The malicious communication to the C2 occurs through a **legitimate protocol**, Graph API. It is consequently difficult to spot and to block.
2.  It’s a **dead drop**: the bots don’t know who is the attacker. They use a mailbox to deposit information and read commands. The person who orchestrates the attacks is unknown, and may change over time.
3.  To log on the Outlook account, the bots use an *OAuth2 token*. Consequently, the email address the account corresponds to is unknown and cannot be used as an IOC.

GoGra is [attributed to the *Harvester* APT group](https://www.security.com/blog-post/harvester-new-linux-backdoor-gogra), which has been [active since 2021](https://www.security.com/threat-intelligence/harvester-new-apt-attacks-asia). GoGra is probably inspired from *Graphon*, a.NET backdoor also written by the Harvester group.

| Date | Event |
| --- | --- |
| **June 2021** | Harvester first observed, using **Graphon** (.NET backdoor abusing Graph API) |
| **Nov 2023** | **GoGra** first discovered — Windows Go backdoor against a South Asia media org |
| **Apr 22, 2026** | **Linux GoGra variant** |

The differences between the initial Windows variant of GoGra and the Linux variant are listed in a table [here](https://www.security.com/blog-post/harvester-new-linux-backdoor-gogra): they are quite minor.

| Feature | Graphon (2021) | GoGra Windows (2024) | GoGra Linux (2026) |
| --- | --- | --- | --- |
| Language | .NET | Go  | Go  |
| Platform | Windows | Windows | Linux |
| Inner package | `N/A` | `NEWCLIENT/services` | `OUTLOOKCLIENT/services` |
| C2 channel | Microsoft Graph API | Microsoft Graph API | Microsoft Graph API |
| Mailbox folder | N/A | “Dragan Dash” | “Zomato Pizza” |
| Command exec | `cmd.exe` | `cmd.exe` | `/bin/bash -c` |
| Beacon interval | N/A | 5 min (on HTTP 204) | 2 seconds |
| AES-256-CBC key | `b14ca5898a4e4133bbce2ea2315a1916` | `b14ca5898a4e4133bbce2ea2315a1916` | `b14ca5898a4e4133bbce2ea2315a1916` |

The attack chain for GoGra is the following:

1.  The victim receives a file which poses as a PDF file.
2.  In reality, the file is *not* a PDF but an ELF binary, a dropper.
3.  The dropper fetches within itself another embedded binary, the payload.
4.  The payload is immediately executed, while a decoy PDF is displayed.

## Juicy part no.1: the extraction mechanism

**embed.FS** is a read-only type in Go’s embed package. It allows [entire directories or multiple filed to be embedded in a Go binary at compile time](https://www.bytesizego.com/blog/go-embed).

```go
type FS struct {
   files *[] file    // pointer to a slice of file entries
}

type file struct {
   name string       // ptr + len
   data string
   hash [16] byte
}
```

In the binary, the structure is found at address 0x76ee20 (virtual address 0xb6ee20 in Ghidra):

![/images/embed-fs-slice.png](/svg/loading.min.svg)

![/images/embed-fs-slice.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1ee759f155dd392a.png "/images/embed-fs-slice.png")

So, the file entries are at 0x00acb000. If we jump at that address, we get the address of a pointer to the file name at 0x00acb018. That address points to 0x004f406d. After the pointer, note the presence of the length of the filename: 0x0a (10).

![/images/embed-fs-filename.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c55a70283a03de90.png "/images/embed-fs-filename.png")

Finally, we get the name of the file which is embedded (that’s the filename on the host of the malware developer): `format.pdf` (10 characters).

![/images/embed-fs-char.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fc229d73be73c6b3.png "/images/embed-fs-char.png")

We can script a quick program to read the embedded files:

```python
import struct

with open('gogra.elf', 'rb') as f:
    f.seek(0xacb018 - 0x400000)
    for i in range(2):
        entry = f.read(48)
        name_ptr, name_len = struct.unpack('<QQ', entry[0:16])
        data_ptr, data_len = struct.unpack('<QQ', entry[16:32])
        hash_val = entry[32:48]
        f.seek(name_ptr - 0x400000)
        name_str = f.read(name_len).decode('utf-8')
        f.seek(save_pos)
        print(f'file[{i}]: name="{name_str}" (ptr=0x{name_ptr:08x}, len={name_len}), data=0x{data_ptr:08x} len={data_len}, hash={hash_val[:4].hex()}...')
```

There are 2 embedded files. The first one, `format.pdf`, is the PDF decoy, the second one, `main`, is the ELF payload.

```fallback
file[0]: name="format.pdf" (ptr=0x004f406d, len=10), data=0x004fdee0 len=31769, hash=e8114d6a...
file[1]: name="main" (ptr=0x004f3478, len=4), data=0x00505b00 len=5902520, hash=e2f8b227...
```

Lazier approach: we can ask a LLM to write a Ghidra script that will extract all embedded files (source code in Appendix A). In Ghidra, we open the Script Manager, Run and select the script.

```fallback
ExtractPayload.java> Running...
[*] ExtractPayload: embed.FS at VA 0xb6ee20
[*] embed.FS.files ptr = 0xacb000
[*] File table: data=0xacb018  len=2  cap=2

[*] Entry 0: name='format.pdf'  data=0x4fdee0  size=31769  hash=e8114d6a18220998a1546cbbd633ce52
    [*] Read 31769 / 31769 bytes from VA 0x4fdee0
    [+] Written to: ./artifacts/format.pdf
    [+] File type: PDF (decoy?)

[*] Entry 1: name='main'  data=0x505b00  size=5902520  hash=e2f8b227e8b1046921acfd15acd06f32
    [*] Read 5902520 / 5902520 bytes from VA 0x505b00
    [+] Written to: ./artifacts/main
    [+] File type: ELF executable

[*] Done.
ExtractPayload.java> Finished!
```

| Filename | Description | Region |
| --- | --- | --- |
| `format.pdf` (this sample) | Indian MoEA briefing memo, EAM France/Luxembourg visit, Dec 2025 | India |
| `TheExternalAffairesMinister.pdf` | Misspelling of “Affaires” — EAM document | India |
| `Details Format.pdf` | Generic document filename | India |
| “Zomato Pizza” | Fake food delivery lure (Zomato = popular Indian delivery service) | India |
| `umrah.pdf` | Islamic pilgrimage to Mecca document | Afghanistan |

## Juicy part no. 2: how the files are displayed / executed

With the 2 files, the `main` (0x4c465d) (source code name `Dropper.go`) does the following:

1.  `embed.FS.ReadFile` (“main”) - reads the payload into memory
2.  `main.DropEmbeddedFile` (0x4c5960) 2.1 `embed.FS.ReadFile` (“format.pdf”) - reads the decoy PDF in memory 2.2 `os.OpenFile` with `O_WRONLY|O_CREATE` and perms=777, which actually writes the PDF in the current directory 2.3 `main.OpenFile` (0x4c5c20): runs LibreOffice on the PDF, to display it and deletes the file in the end.
3.  `main.filedroping` (0x4c5080): drops the payload, chmod +x and executes it with `exec.Start()`

![/images/main-assembly.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35344da5bf428c1d.png "/images/main-assembly.png")

**Don’t trust blindly your LLM**. At some point, I asked my LLM to produce source code matching `main.OpenFile`. It gave me this:

```go
// OpenFile executes the previously dropped payload at <cwd>/<name>.pdf,
// waits for it to finish, captures and prints its output, then removes
// the file from disk.
//
// The name "OpenFile" is a deliberate misdirection — it does not open
// a file for reading; it executes it.
//
// param name: base filename (without extension), same value passed to DropEmbededFile.
func OpenFile(name string) {
    // 1. Reconstruct full path of the dropped payload
    cwd, _ := os.Getwd()
    payloadPath := cwd + "/" + name + ".pdf"
    fmt.Println(payloadPath) // logged

    // 2. Execute the payload and capture output
    //    os.exec.Command(payloadPath) — no arguments passed
    //    A new bytes.Buffer is allocated and wired to cmd.Stdout
    cmd := exec.Command(payloadPath)
    ...
```

**LLM’s analysis is wrong**: it’s not the payload that is executed by **LibreOffice**.

![/images/openfile-llm-error.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4a08a6ba8a5a74d.png "/images/openfile-llm-error.png")

The LLM *assumed a payload would executed* - which makes sense in malware analysis - and invented a speech about OpenFile name being a “deliberate misdirection”. When we analyze malware, we tend to be paranoid, so this could have been plausible. But it’s not the reality: this function is called for the decoy PDF, it calls **LibreOffice** to open it and then deletes the file.

> **How can we spot such errors from LLMs?** My advice is (1) to cross examine everything a LLM says, and (2) to ask different LLMs, with different contexts, and see if they come up to the same conclusion…

## Juicy part no.3: How the malware handles persistance

The embedded payload “main” is written to `~/.config/systemd/user/userservice` and a user systemd service (`userservice.service`) is created to restart on failure or reboot. The service configuration contains:

```fallback
[Unit]
Description=Foo
[Service]
ExecStart=/home/<user>/.config/systemd/user/userservice
Restart=always
Restart=on-failure
[Install]
WantedBy=default.target
```

Note the service description is suspicious: “Foo”. IMHO it is a bad choice for a name. The service is enabled via the command `systemctl --user enable userservice`.

In addition to system services, the malware also deploys **XDG autostart**. XDG autostart is a mechanism to start applications in a Window Manager - it will only work for GUI logins. The malware creates a configuration file `~/.config/autostart/abc.desktop` with this content:

```fallback
[Desktop Entry]
Type=Application
Name=conky
Exec=/home/<user>/.config/systemd/user/userservice
```

The name is better chosen this time: [Conky](https://github.com/brndnmtthws/conky) is desktop system monitor.

## Appendix A: Ghidra script to extract embed.FS files

```java
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.mem.*;

import java.io.*;
import java.nio.file.*;

public class ExtractPayload extends GhidraScript {
    // embed.FS global VA 
    static final long EMBED_FS_VA     = 0xb6ee20L;

    // embed.file entry size
    static final int  EMBED_FILE_SIZE = 48;

    // Where to write extracted files 
    static final String OUTPUT_DIR    = "./artifacts";

    @Override
    public void run() throws Exception {
        Memory mem = currentProgram.getMemory();
        AddressFactory af = currentProgram.getAddressFactory();

        Files.createDirectories(Paths.get(OUTPUT_DIR));
        printf("[*] ExtractPayload: embed.FS at VA 0x%x\n", EMBED_FS_VA);

        // ----------------------------------------------------------------
        // Step 1: Read embed.FS.files pointer
        // ----------------------------------------------------------------
        Address fsAddr = af.getAddress(String.format("0x%x", EMBED_FS_VA));
        long slicePtr = readU64(mem, fsAddr);
        printf("[*] embed.FS.files ptr = 0x%x\n", slicePtr);

        if (slicePtr == 0) {
            printf("[!] embed.FS.files is nil — no embedded files found.\n");
            return;
        }

        // ----------------------------------------------------------------
        // Step 2: Read slice header {data ptr, len, cap}
        // ----------------------------------------------------------------
        Address sliceAddr = af.getAddress(String.format("0x%x", slicePtr));
        long dataPtr  = readU64(mem, sliceAddr);
        long length   = readU64(mem, sliceAddr.add(8));
        long capacity = readU64(mem, sliceAddr.add(16));
        printf("[*] File table: data=0x%x  len=%d  cap=%d\n", dataPtr, length, capacity);

        if (length == 0 || length > 1000) {
            printf("[!] Suspicious file count (%d), falling back to string search.\n", length);
            return;
        }

        // ----------------------------------------------------------------
        // Step 3: Iterate embed.file entries
        // ----------------------------------------------------------------
        for (long i = 0; i < length; i++) {
            long entryVA = dataPtr + i * EMBED_FILE_SIZE;
            Address entryAddr = af.getAddress(String.format("0x%x", entryVA));

            long namePtr = readU64(mem, entryAddr);
            long nameLen = readU64(mem, entryAddr.add(8));
            long filePtr = readU64(mem, entryAddr.add(16));
            long fileLen = readU64(mem, entryAddr.add(24));

            // Read hash (16 bytes) for display
            byte[] hashBytes = new byte[16];
            mem.getBytes(entryAddr.add(32), hashBytes);
            String hashHex = bytesToHex(hashBytes);

            // Decode name string
            String name = "(invalid)";
            if (namePtr != 0 && nameLen > 0 && nameLen < 512) {
                byte[] nameBytes = new byte[(int) nameLen];
                mem.getBytes(af.getAddress(String.format("0x%x", namePtr)), nameBytes);
                name = new String(nameBytes, "UTF-8");
            }

            printf("\n[*] Entry %d: name='%s'  data=0x%x  size=%d  hash=%s\n",
                   i, name, filePtr, fileLen, hashHex);

            // Skip directory entries
            if (name.endsWith("/") || fileLen == 0 || filePtr == 0) {
                printf("    [*] Directory or empty entry, skipping.\n");
                continue;
            }

            extractFile(mem, af, name, filePtr, fileLen);
        }

        printf("\n[*] Done.\n");
    }

    // ----------------------------------------------------------------
    // Write fileLen bytes starting at fileVA to OUTPUT_DIR/<safeName>
    // ----------------------------------------------------------------
    private void extractFile(Memory mem, AddressFactory af,
                              String name, long fileVA, long fileLen) throws Exception {
        Address dataAddr = af.getAddress(String.format("0x%x", fileVA));

        byte[] content = new byte[(int) fileLen];
        int bytesRead = mem.getBytes(dataAddr, content);
        printf("    [*] Read %d / %d bytes from VA 0x%x\n", bytesRead, fileLen, fileVA);

        // Sanitize filename for output
        String safeName = name.replace("/", "_").replace("..", "_");
        if (safeName.isEmpty()) safeName = "extracted_payload";
        Path outPath = Paths.get(OUTPUT_DIR, safeName);

        Files.write(outPath, content);
        printf("    [+] Written to: %s\n", outPath.toAbsolutePath());

        // File type hint
        if (bytesRead >= 4) {
            String magic = bytesToHex(java.util.Arrays.copyOf(content, 4));
            if (content[0] == 0x7f && content[1] == 'E' && content[2] == 'L' && content[3] == 'F') {
                printf("    [+] File type: ELF executable\n");
            } else if (content[0] == 'M' && content[1] == 'Z') {
                printf("    [+] File type: PE/MZ executable\n");
            } else if (content[0] == '%' && content[1] == 'P' && content[2] == 'D' && content[3] == 'F') {
                printf("    [+] File type: PDF (decoy?)\n");
            } else {
                printf("    [+] File magic: %s\n", magic);
            }
        }
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------
    private long readU64(Memory mem, Address addr) throws MemoryAccessException {
        byte[] b = new byte[8];
        mem.getBytes(addr, b);
        long v = 0;
        for (int i = 7; i >= 0; i--) {
            v = (v << 8) | (b[i] & 0xFFL);
        }
        return v;
    }

    private byte[] longToLE(long v) {
        byte[] b = new byte[8];
        for (int i = 0; i < 8; i++) {
            b[i] = (byte)(v & 0xFF);
            v >>= 8;
        }
        return b;
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
```

## Appendix B: LLM’s reconstruction of dropper’s main source code

*Warning: this is not the real source code, but what the LLM assumed the source code probably looks like.*

```go
package main

import (
    "fmt"
    "os"
    "os/exec"
    "os/user"
)

func main() {
    // Drop the embedded payload binary to disk and open/execute it
    DropEmbededFile()

    // Get current user info to build home-directory paths
    currentUser, err := user.Current()
    if err != nil {
        fmt.Println(err)
        return
    }
    username := currentUser.Username
    homeDir := currentUser.HomeDir
    fmt.Println(username)

    configDir := homeDir + "/.config"

    // Check if ~/.config/systemd/user/ exists
    systemdUserDir := configDir + "/systemd/user"
    _, statErr := os.Stat(systemdUserDir)

    if os.IsNotExist(statErr) {
        // systemd/user directory does not exist — create it
        fmt.Println("does not exist, systemd user is absent")
        fmt.Println(homeDir)

        mkdirCmd := exec.Command("mkdir", systemdUserDir)
        if err := mkdirCmd.Run(); err != nil {
            fmt.Println(err)
        }
        fmt.Println("systemd created")

        // After creating systemd dir, install the service file
        // Then check/create userservice unit
        userservicePath := systemdUserDir + "/userservice"
        _, statErr2 := os.Stat(userservicePath)
        if os.IsNotExist(statErr2) {
            fmt.Println("does not exist, systemd user is absent")

            // Enable the service
            enableCmd := exec.Command("systemctl", "--user", "enable", "userservice")
            if err := enableCmd.Run(); err != nil {
                fmt.Println(err)
            }
            fmt.Println("systemctl enable done")

            // Drop service file and launch payload
            filedroping()
            CreateServiceFile()
        } else {
            CreateServiceFile()
        }
    } else {
        // systemd/user directory exists — use XDG autostart fallback
        fmt.Println("exists")

        autostartDir := configDir + "/autostart"
        _, statErr2 := os.Stat(autostartDir)

        if os.IsNotExist(statErr2) {
            // autostart dir missing — create it then install desktop entry
            fmt.Println("autostart dir missing, creating")
            mkdirCmd := exec.Command("mkdir", autostartDir)
            if err := mkdirCmd.Run(); err != nil {
                fmt.Println(err)
            }
            fmt.Println("autostart created")
            creatingDesktopfile(homeDir)
        } else {
            // autostart dir already exists — just install desktop entry
            creatingDesktopfile(homeDir)
        }
    }
}
```
