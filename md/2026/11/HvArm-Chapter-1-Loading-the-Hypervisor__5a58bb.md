---
title: "HvArm: Chapter 1: Loading the Hypervisor"
source: https://0xabe.io/hypervisor/arm/2026/03/31/HvArm-Chapter-1.html
source_host: 0xabe.io
clip_date: 2026-11-20T10:34:43+08:00
trace_id: 79e75ed5-1320-4ef9-8e53-60647992804b
content_hash: 5ebe30f64204a7a0f86525390bd326688ea40114b6877065af8bd1f85873067f
status: synced
tags: []
series: null
feed_source: 0xabe·ARM Hypervisor/UEFI
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41e75244-d011-81f8-8346-c95e0417ea28
ioc: null
---

In Chapter 0, we set up the development environment, built a simple UEFI application that reads the current exception level, and confirmed that our QEMU virtual machine exposes EL2. Now we need to take the next step: loading the hypervisor binary into memory and calling its entry point.

This sounds straightforward — UEFI has standard services for loading and starting images — but there is a fundamental problem. The standard UEFI image loader allocates memory that will be freed when the operating system calls `ExitBootServices()`. A hypervisor that needs to survive the transition to runtime and continue running at EL2 while the OS executes beneath it cannot live in memory that the OS is free to reclaim. We need to load the hypervisor ourselves, into memory that will persist.

This chapter covers the UEFI protocol model (the mechanism through which firmware services are discovered and called), the PE/COFF binary format used by UEFI applications, the manual loading process that places our hypervisor in runtime-persistent memory, and the initialization work we must do ourselves because the standard UEFI loader is bypassed.

The source code for this chapter is available at [https://gitlab.com/0xabe.io/hvarm](https://gitlab.com/0xabe.io/hvarm).

* * *

## Why Manual Loading

When the firmware loads a UEFI application through the standard path — the boot manager calling the image loading services during the BDS phase, or the UEFI Shell launching an `.efi` file — it allocates memory for the image using the `EfiBootServicesCode` memory type. This is boot services memory: it is available while boot services are active (during the TSL phase), but the operating system is permitted to reclaim it after calling `ExitBootServices()`. In practice, most operating systems do exactly that — they treat all boot services memory as free and immediately repurpose it for their own use.

For a normal UEFI application, this is fine. The application runs, does its work, and returns before the OS boots. But a passthrough hypervisor is fundamentally different. Our hypervisor will configure EL2, set up Stage 2 page tables, and then deprivilege the boot environment to EL1. From that point on, the hypervisor lives at EL2 permanently — through the rest of the UEFI boot, through `ExitBootServices()`, and for the entire lifetime of the operating system. Its code and data must remain in memory indefinitely.

The UEFI memory map defines several memory types, and the operating system’s obligations differ for each. The two types that survive `ExitBootServices()` are `EfiRuntimeServicesCode` and `EfiRuntimeServicesData`. Memory marked with these types is reserved for firmware runtime services — the variable driver, the capsule update driver, and other runtime components described in Chapter 0. The UEFI specification requires the operating system to preserve these regions; it must not reclaim them or map them for other purposes. By allocating our hypervisor’s memory as `EfiRuntimeServicesCode`, we ensure that neither the firmware nor the OS will touch it after the boot-to-runtime transition.

This is why we cannot use the standard `LoadImage()` and `StartImage()` boot services. Those services allocate `EfiBootServicesCode` memory internally and we have no control over the memory type. Instead, we will:

1.  Allocate pages ourselves using `AllocatePages()` with the `EfiRuntimeServicesCode` memory type.
2.  Read the hypervisor’s `.efi` binary from disk into that allocation.
3.  Parse the PE/COFF headers to find the entry point.
4.  Call the entry point directly.

This gives us full control over where the hypervisor lives in memory and guarantees its persistence.

* * *

## UEFI Protocols

Before we can load a file from disk, we need to understand how UEFI exposes its services. While basic services like memory allocation are available through the boot services table (a global struct of function pointers accessible via `gBS` in EDK2), most hardware and firmware functionality is exposed through **protocols**.

### The protocol model

A protocol in UEFI is a named interface — a C struct of function pointers — identified by a 128-bit GUID. Protocols are installed on **handles**, which are opaque pointers representing firmware objects (a device, a loaded image, a driver, etc.). The handle database is the firmware’s central registry: it maps handles to the protocols they support.

The pattern for using a protocol is:

1.  You know which protocol you need (by its GUID).
2.  You know which handle should provide it (or you ask the firmware to find one).
3.  You call `OpenProtocol()` on that handle with the protocol’s GUID.
4.  The firmware returns a pointer to the protocol’s interface struct.
5.  You call functions through that struct pointer.

This is conceptually similar to COM interfaces on Windows or vtable-based polymorphism in C++ — you query an object for an interface by identifier, and if the object supports it, you get back a function table.

In EDK2 code, protocol GUIDs are declared in DEC files and referenced by their C-language names. For example, `gEfiLoadedImageProtocolGuid` is the GUID for the Loaded Image Protocol, and `gEfiSimpleFileSystemProtocolGuid` is the GUID for the Simple File System Protocol. These names resolve to actual 128-bit GUID values at compile time via the DEC declarations in `MdePkg.dec`.

### The protocols we need

To read a file from the same file system that our Helper application was loaded from, we need to chain through three protocols:

**[EFI_LOADED_IMAGE_PROTOCOL](https://uefi.org/specs/UEFI/2.10/09_Protocols_EFI_Loaded_Image.html)**— Every loaded UEFI image (application or driver) has this protocol installed on its image handle. It provides metadata about the image: where it was loaded from (`DeviceHandle` — the handle of the device containing the file system), the memory range it occupies, its load options (command-line arguments), and the image’s own file path. We need this protocol to discover which device our Helper was loaded from, so we can open the same device and read the hypervisor binary.

**[EFI_SIMPLE_FILE_SYSTEM_PROTOCOL](https://uefi.org/specs/UEFI/2.10/13_Protocols_Media_Access.html#simple-file-system-protocol)**— This protocol is installed on handles representing devices with a recognizable file system (FAT12/16/32 for UEFI). It exposes a single function, `OpenVolume()`, which returns the root directory of the file system as a file protocol instance. We retrieve this protocol from the `DeviceHandle` we obtained through the Loaded Image Protocol.

**[EFI_FILE_PROTOCOL](https://uefi.org/specs/UEFI/2.10/13_Protocols_Media_Access.html#efi-file-protocol)**— This is the file I/O interface. It provides `Open()`, `Read()`, `Write()`, `Close()`, `GetInfo()`, and other file operations. `OpenVolume()` returns the root directory as an `EFI_FILE_PROTOCOL` instance, and opening a file within that directory returns another `EFI_FILE_PROTOCOL` instance for the specific file. The interface is straightforward and resembles POSIX file operations, with the obvious difference that it works through struct function pointers rather than system calls.

### Walking the protocol chain

The code in `Helper.c` chains through these protocols in sequence. First, it opens the Loaded Image Protocol on its own image handle (`gImageHandle` is a global provided by EDK2 that holds the current application’s image handle):

```c
status = gBS->OpenProtocol(gImageHandle,
                           &gEfiLoadedImageProtocolGuid,
                           (VOID**)&loadedImageProtocol,
                           gImageHandle,
                           NULL,
                           EFI_OPEN_PROTOCOL_GET_PROTOCOL);
```

The `OpenProtocol()` call takes the handle to query, the protocol GUID, a pointer-to-pointer for the result, an agent handle (who is opening the protocol), a controller handle (NULL for simple queries), and an open mode. `EFI_OPEN_PROTOCOL_GET_PROTOCOL` is the simplest mode — it just retrieves the interface without affecting reference counts or exclusive access tracking.

Next, using the `DeviceHandle` from the loaded image protocol (which identifies the device the Helper was loaded from — in our case, the CDROM), it opens the Simple File System Protocol on that device:

```c
status = gBS->OpenProtocol(loadedImageProtocol->DeviceHandle,
                           &gEfiSimpleFileSystemProtocolGuid,
                           (VOID**)&simpleFileSystemProtocol,
                           loadedImageProtocol->DeviceHandle,
                           NULL,
                           EFI_OPEN_PROTOCOL_GET_PROTOCOL);
```

Then it opens the volume (the root directory) and opens the target file by path:

```c
status = simpleFileSystemProtocol->OpenVolume(simpleFileSystemProtocol, &rootDir);
```

```c
status = rootDir->Open(rootDir, &imageFile, Path, EFI_FILE_MODE_READ, 0);
```

Notice the pattern: every protocol function takes the protocol instance pointer as its first argument. This is the UEFI convention — it is the equivalent of the `this` pointer in C++ method calls, and it is how the implementation identifies which instance is being operated on.

At this point, `imageFile` is an `EFI_FILE_PROTOCOL` handle for the hypervisor binary. We can query its size via `GetInfo()` and read its contents into a memory buffer.

* * *

## Memory Allocation

Before reading the file, we need somewhere to put it. This is where the memory type decision we discussed earlier becomes concrete. The code queries the file’s size, calculates how many 4 KB pages are needed, and allocates them as `EfiRuntimeServicesCode`:

```c
bufferSize = sizeof(fileInfoBuffer);
status = imageFile->GetInfo(imageFile, &gEfiFileInfoGuid, &bufferSize, fileInfoBuffer);
fileInfo = (EFI_FILE_INFO*)fileInfoBuffer;

pagesNeeded = EFI_SIZE_TO_PAGES(fileInfo->FileSize);
status = gBS->AllocatePages(AllocateAnyPages,
                            EfiRuntimeServicesCode,
                            pagesNeeded,
                            (EFI_PHYSICAL_ADDRESS*)&imageBuffer);
```

`GetInfo()` with `gEfiFileInfoGuid` returns an `EFI_FILE_INFO` structure containing the file’s size, timestamps, and attributes. `EFI_SIZE_TO_PAGES` is a macro that converts a byte count to a page count (rounding up). `AllocatePages()` with `AllocateAnyPages` lets the firmware choose any available physical address — we don’t care where the hypervisor is placed in memory, only that it persists.

After allocating, we zero the buffer and read the entire file into it:

```c
ZeroMem(imageBuffer, EFI_PAGES_TO_SIZE(pagesNeeded));

bufferSize = fileInfo->FileSize;
status = imageFile->Read(imageFile, &bufferSize, imageBuffer);
```

The `Read()` call reads up to `bufferSize` bytes and updates `bufferSize` with the number of bytes actually read. For a complete file read like this, the two values should match.

One critical detail: after the entry point returns successfully, the code sets `imageBuffer = NULL` before reaching the cleanup section:

```c
//
// The image has to stay in memory
//
imageBuffer = NULL;
```

This prevents the cleanup path from calling `FreePages()` on the allocation. The hypervisor’s code must remain in memory — it will be needed later when the hypervisor is actively running at EL2. If the entry point fails (returns an error status), the code falls through with `imageBuffer` still set, and the memory is freed normally.

* * *

## The PE/COFF Binary Format

UEFI uses the PE/COFF (Portable Executable / Common Object File Format) binary format — the same format used by Windows executables and DLLs. Every `.efi` file produced by the EDK2 build system is a PE32+ (64-bit PE/COFF) binary. Understanding the header structure is essential because we need to parse it to find the entry point.

### Header layout

A PE/COFF binary starts with a **DOS header** (`EFI_IMAGE_DOS_HEADER` in EDK2’s type definitions). This is a legacy structure inherited from MS-DOS, and in the context of UEFI only two fields matter:

-   `e_magic` — the magic number, which must be `0x5A4D` (the ASCII characters “MZ”, standing for Mark Zbikowski, one of the original MS-DOS architects). This is the first thing to check when validating a PE file.
-   `e_lfanew` — a 32-bit offset (from the beginning of the file) to the **NT headers**. This is the bridge from the legacy DOS header to the actual PE structure.

Following the `e_lfanew` offset, we find the **NT headers** (`EFI_IMAGE_NT_HEADERS64`), which contain:

-   `Signature` — the PE signature, which must be `0x00004550` (the ASCII characters “PE\\0\\0”). This is the second validation check.
-   `FileHeader` — the **COFF header**, containing the machine type (`0xAA64` for AArch64, `0x8664` for x86-64), the number of sections, timestamps, and the size of the optional header.
-   `OptionalHeader` — despite the name, this header is not optional for executables. For PE32+, it is an `EFI_IMAGE_OPTIONAL_HEADER64` and contains the fields we care about most: `AddressOfEntryPoint` (a Relative Virtual Address — an offset from the image base), `ImageBase` (the preferred load address), `SectionAlignment`, `FileAlignment`, and `SizeOfImage`.

### Finding the entry point

The field `AddressOfEntryPoint` in the Optional Header is a **Relative Virtual Address (RVA)**— an offset from the beginning of the image as it would be laid out in memory. When the UEFI loader maps an image through the standard `LoadImage()` service, it places sections at their virtual addresses and the entry point is at `ImageBase + AddressOfEntryPoint` in virtual memory.

In our case, we are loading the raw PE file into a flat buffer without remapping sections. This works because EDK2’s build tools (specifically the `GenFw` post-processing tool) produce UEFI PE/COFF files where the file layout mirrors the memory layout — the `FileAlignment` equals the `SectionAlignment`, and each section’s file offset matches its virtual address. As a result, the byte at RVA *N* in the mapped image is at file offset *N* in the raw file, and we can compute the entry point as a simple offset from the buffer start:

```c
dosHeader = (EFI_IMAGE_DOS_HEADER*)imageBuffer;
if (dosHeader->e_magic != EFI_IMAGE_DOS_SIGNATURE)
{
  Print(L"MZ header not found: %x", dosHeader->e_magic);
  status = EFI_UNSUPPORTED;
  goto Exit;
}

ntHeader = (EFI_IMAGE_NT_HEADERS64*)(imageBuffer + dosHeader->e_lfanew);
if (ntHeader->Signature != EFI_IMAGE_NT_SIGNATURE)
{
  Print(L"PE signature not found: %x", ntHeader->Signature);
  status = EFI_UNSUPPORTED;
  goto Exit;
}

imageEntryPoint = (EFI_IMAGE_ENTRY_POINT)(imageBuffer + ntHeader->OptionalHeader.AddressOfEntryPoint);
```

The parsing is straightforward: validate the DOS magic, follow `e_lfanew` to the NT headers, validate the PE signature, and then add `AddressOfEntryPoint` to the buffer base to get a callable function pointer. `EFI_IMAGE_ENTRY_POINT` is a typedef for the standard UEFI image entry point signature: a function taking an `EFI_HANDLE` and an `EFI_SYSTEM_TABLE*` and returning `EFI_STATUS`.

### What about base relocations?

A careful reader will notice that we are not processing base relocations. Normally, when a PE image is loaded at an address different from its preferred `ImageBase`, the loader must apply relocation fixups — patching absolute address references in the code and data to account for the actual load address. We skip this entirely.

This works because AArch64 code generated by GCC for UEFI is position-independent: branch instructions use PC-relative offsets, and data references are computed relative to the current instruction pointer rather than as absolute addresses. The relocation entries in the PE file exist (the UEFI specification requires them), but for simple applications they refer primarily to the data-section global variables that the compiler handles through PC-relative addressing anyway.

* * *

## Calling the Entry Point

With the PE headers parsed and the entry point located, we can call into the hypervisor. The standard UEFI entry point signature expects two parameters: an image handle and a pointer to the system table. Since our image was not loaded through the standard path, there is no legitimate image handle for it — the firmware doesn’t know it exists. We pass a magic number (`HVARM_MAGIC`, defined as `0xfeedc0de` in `HvArm.h`) in place of the image handle so the hypervisor can verify it was called from our loader and not accidentally invoked through some other path:

```c
status = imageEntryPoint((EFI_HANDLE)HVARM_MAGIC, gST);
```

`gST` is the global system table pointer provided by EDK2. The system table is the root of the entire UEFI service tree — it contains pointers to the boot services table, the runtime services table, the console I/O protocols, and the configuration tables (ACPI, SMBIOS, etc.). By passing it to the hypervisor, we give it access to the full UEFI environment.

* * *

## The Hypervisor Placeholder

The hypervisor binary (`HvArm.efi`) is currently a placeholder that verifies the loading mechanism works and confirms it is executing at EL2. It is located in `HvArmPkg/Applications/HvArm/HvArm.c`. Let’s walk through it.

### Entry point and magic validation

The PE entry point is `_ModuleEntryPoint`, as specified in the INF file (`ENTRY_POINT = _ModuleEntryPoint`). Its first action is to verify the magic number:

```c
EFI_STATUS
EFIAPI
_ModuleEntryPoint (
  IN EFI_HANDLE ImageHandle,
  IN EFI_SYSTEM_TABLE* SystemTable
  )
{
  if ((UINT64)ImageHandle != HVARM_MAGIC)
  {
    return EFI_UNSUPPORTED;
  }
```

If someone tries to run `HvArm.efi` directly from the UEFI Shell (which would pass a real image handle, not our magic number), it silently returns `EFI_UNSUPPORTED` and exits. This is a safety check — the hypervisor binary is not meant to be launched through the standard path, and doing so would fail anyway because the initialization assumptions would not hold.

### Manual library initialization

This is where the consequences of bypassing the standard UEFI image loader become a problem. When the firmware loads an image through `LoadImage()`, it does not just map the binary into memory — it also runs library constructors. In EDK2, library instances can declare constructor functions that the build system arranges to be called automatically before the module’s entry point executes. These constructors initialize internal state that the library depends on.

The most important constructor for our purposes is the one belonging to `DebugLib`. The DSC maps `DebugLib` to `UefiDebugLibConOut`, a debug library implementation that outputs messages through the UEFI console output protocol. Its constructor, `DxeDebugLibConstructor`, stores a pointer to the system table internally — without this initialization, any call to `DEBUG()` (which our logging macros `HVARM_INFO`, `HVARM_ERROR`, etc. expand to) would fail because the pointer to the system table would be `NULL`.

Since we loaded the image manually, no constructors were called. The entry point must do it explicitly:

```c
DxeDebugLibConstructor(NULL, SystemTable);
```

The constructor is forward-declared in `HvArm.c` and called with `NULL` for the image handle (we don’t need a real one because the code does not use it) and the system table pointer that was passed in from the Helper. After this call, the `DEBUG()` macro and all the `HVARM_*` logging macros work correctly.

This is a pattern that will grow as the hypervisor becomes more complex. Every library class we add to the hypervisor’s INF that has a constructor will need its constructor called manually in `_ModuleEntryPoint`. The build system’s `AutoGen.c` file generated during the build lists all constructors for a given module — it is a useful reference for identifying which ones need manual invocation.

### The hypervisor main function

With the library initialized, the entry point calls `HvArmMain()`:

```c
INTN currentEL = GetCurrentEL();
HVARM_INFO("CurrentEL: %d", currentEL);
if (currentEL != 2)
{
  HVARM_ERROR("Unsupported Exception Level!");
  return EFI_UNSUPPORTED;
}

return EFI_SUCCESS;
```

`GetCurrentEL()` reads the `CurrentEL` system register via an inline assembly `mrs` instruction and shifts the result right by 2 (the exception level is encoded in bits \[3:2\] of the register). If the hypervisor is not running at EL2, it reports an error and returns failure — there is no point continuing if we don’t have hypervisor privilege.

This is the same exception level check we performed in the Helper application in Chapter 0, but now it executes from within a separately loaded binary that was placed in runtime-persistent memory. It validates the entire loading chain: the file was read from disk correctly, the PE headers were parsed correctly, the entry point was found and called, the library was initialized, and the code is executing at the expected privilege level.

* * *

## The Helper’s Load Command

Tying it all together, the Helper application (`Helper.c`) has been restructured from Chapter 0. It no longer just reads `CurrentEL` — it now accepts commands via the UEFI Shell’s argument parsing. The entry point has been changed from `UefiMain` to `ShellAppMain`, which is provided by EDK2’s `ShellCEntryLib` and gives us a standard `Argc` / `Argv` interface:

```c
INTN
EFIAPI
ShellAppMain (
  IN UINTN Argc,
  IN CHAR16** Argv
  )
{
  ...
  cmd = Argv[1];
  if (StrCmp(cmd, L"load") == 0 && Argc == 3)
  {
    status = CommandLoad(Argv[2]);
  }
  ...
}
```

The `load` command takes a file path as its argument and invokes `CommandLoad()`, which contains the full protocol chain, memory allocation, PE parsing, and entry point invocation described above. From the UEFI Shell, the usage looks like:

```
FS1:\> Helper.efi load HvArm.efi
```

This loads `HvArm.efi` from the same file system, allocates it into runtime-persistent memory, parses its PE headers, and calls its entry point. If everything works correctly, the hypervisor prints its exception level and returns success.

* * *

## Build Changes

The DSC has been updated to build both modules:

```
[Components]
  ../HvArmPkg/Applications/Helper/Helper.inf
  ../HvArmPkg/Applications/HvArm/HvArm.inf
```

And the build script now packages both `Helper.efi` and `HvArm.efi` into the generated ISO:

```python
TARGET_FILES: List[str] = [
    'Helper.efi',
    'HvArm.efi',
]
```

The build and ISO generation work exactly as in Chapter 0:

```
./build.py --iso /tmp/hvarm.iso
```

Both binaries end up on the same FAT image inside the ISO, so when the CDROM is mounted in the UEFI Shell, `Helper.efi` can find and load `HvArm.efi` from the same file system.

* * *

## Running It

With the ISO rebuilt, attach it to the virtual machine as before (replacing the old CDROM contents or updating the ISO path), ensure virtualization is enabled in the QEMU machine configuration (`virtualization=on`), and boot into the UEFI Shell.

Navigate to the file system containing the binaries and run the load command:

```
Shell> fs1:
FS1:\> Helper.efi load HvArm.efi
```

You should see output indicating that the entry point was called, followed by the hypervisor’s log messages showing the current exception level. If `virtualization=on` is configured correctly, the output will report EL2:

![HvArm successful output](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a64610638916c6b.png)

If you see EL1 instead, verify the QEMU XML configuration from Chapter 0 — the `virtualization=on` flag must be present in the `-machine` argument.

* * *

## Conclusion

This chapter established the loading mechanism that all future hypervisor development will build on.

We started with the fundamental problem: the standard UEFI image loader allocates boot services memory that the OS will reclaim, but a hypervisor needs to persist through `ExitBootServices()` and beyond. The solution is manual loading — allocating `EfiRuntimeServicesCode` pages that the OS must preserve, reading the binary into that allocation ourselves, and calling the entry point directly.

That required understanding the UEFI protocol model: protocols as GUID-identified interface structs installed on handles, queried via `OpenProtocol()`, and chained together to accomplish higher-level tasks. We walked through the specific protocol chain needed to read a file from disk — Loaded Image Protocol to find our device, Simple File System Protocol to open the volume, and File Protocol for the actual I/O.

We then examined the PE/COFF binary format that UEFI uses for all executable images: the DOS header with its `MZ` signature and `e_lfanew` pointer, the NT headers with the `PE` signature and COFF/Optional Header fields, and the `AddressOfEntryPoint` RVA that gives us a callable entry point when added to the load address. The fact that EDK2’s build tools produce PE files where file offsets match virtual addresses lets us skip section remapping and load the raw file directly.

Finally, we confronted the initialization gap left by bypassing the standard loader. Library constructors — specifically the `DebugLib` constructor — must be called manually before any library functionality works. This is a pattern that will repeat as we add more library dependencies in future chapters.

The hypervisor placeholder is minimal by design. It validates the loading mechanism, confirms EL2 access, and returns. But the memory it occupies is runtime-persistent, and the entry point mechanism is in place. In the next chapters, we will fill that placeholder with real hypervisor code: configuring the EL2 exception vector table, setting up `HCR_EL2` and `SCTLR_EL2`, building identity-mapped Stage 2 page tables, and executing our first `ERET` to deprivilege the boot environment to EL1.
