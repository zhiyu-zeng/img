---
title: "On the clock: Escaping VMware Workstation at Pwn2Own Berlin 2025"
source: https://www.synacktiv.com/en/publications/on-the-clock-escaping-vmware-workstation-at-pwn2own-berlin-2025.html
source_host: www.synacktiv.com
clip_date: 2026-09-16T13:49:50+08:00
trace_id: 4cb40c4e-9ef7-4c17-8453-8b7a5003ebaf
content_hash: 79a17bb414b4be074840986dc52324e2aeecda16b293d1d902b65d7bde8e5dc3
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: Synacktiv
ai_summary: 利用 PVSCSI 堆溢出漏洞，配合 LFH 侧信道与堆布局操控，完成 VMware Workstation 逃逸，并在 Pwn2Own 首试成功。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3dd75244-d011-8163-aa4e-f1ce83eb6118
ioc:
  cves:
    - CVE-2025-41238
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 利用 PVSCSI 堆溢出漏洞，配合 LFH 侧信道与堆布局操控，完成 VMware Workstation 逃逸，并在 Pwn2Own 首试成功。
> 
> - **漏洞根因：** PVSCSI 读取 S/G 段时，超过 512 条后仍按固定 0x4000 重分配，超过 1024 条即产生 16 字节步长的越界写（CVE-2025-41238）。
> - **LFH 难题：** 0x4000 分配落入 Windows 11 LFH，受元数据校验和与随机分配阻碍；利用 PING-PONG 在 B1/B2 桶间交替写入，避开校验。
> - **关键对象：** Shader 用于堆喷和布局控制，URB 作为持久腐蚀目标；Reap Oracle 可定位连续四个 Hole 块。
> - **合并原语：** 滥用 S/G 合并逻辑把越界数据“上移”，构造 Hybrid URB，泄漏 URB 头并绕过堆 ASLR，进而实现任意读、写与调用。
> - **侧信道与结果：** 用 VMware backdoor 同步命令测量 0x4000 分配耗时，推断初始 LFH 状态；比赛现场首次尝试即成功。

Written by, - 23/01/2026 - in Exploit, Reverse-engineering

At Pwn2Own Berlin 2025, we exploited VMware Workstation by abusing a Heap-Overflow in its PVSCSI controller implementation. The vulnerable allocation landed in the LFH allocator of Windows 11, whose exploit mitigations posed a major challenge. We overcame this through a complex interplay of techniques: defeating the LFH randomization using a side-channel; shaping and carefully preserving an exploitable heap layout; and abusing subtle behaviors of the vulnerable function to create powerful primitives. Ultimately, the exploit worked on the first attempt, though getting there was anything but simple.

## Introduction

At Pwn2Own Berlin 2025, we successfully exploited VMware Workstation using a single Heap-Overflow vulnerability in the PVSCSI controller implementation. While we were initially confident in the bug's potential, reality soon hit hard as we confronted the latest Windows 11 Low Fragmentation Heap (LFH) mitigations.

This post details our journey from discovery to exploitation. We start by analyzing the PVSCSI vulnerability and the specific challenges posed by the LFH environment. We then describe a peculiar LFH state that enables deterministic behavior, alongside the two key objects used for spraying and corruption. Building on this setup, we demonstrate how to leverage the vulnerability to craft powerful memory manipulation primitives, ultimately achieving arbitrary Read, Write, and Code Execution.

Finally, we reveal how—just two days before the contest—we exploited a timing side-channel within the LFH to fully defeat its randomization, ensuring a first-try success during the live demonstration.

## The PVSCSI Bug

In VMware Workstation, the `vmware-vmx` process implements most of the guest machine emulation: CPU, memory, peripherals, etc. Peripheral devices are a well-known attack surface for VM escape exploits, since the hypervisor code must emulate a wide variety of complex devices: graphics accelerator, network adapters, drives, and more. We started our audit by focusing on this area, and fairly quickly found an interesting vulnerability.

The main vulnerability ([`CVE-2025-41238`](https://support.broadcom.com/web/ecx/support-content-notification/-/external/content/SecurityAdvisories/0/35877#VMSA20250013.-3c.PVSCSIheap-overflowvulnerability\(CVE-2025-41238\))) lies in the PVSCSI (Paravirtualized SCSI) controller emulation code. This controller is responsible for handling SCSI commands and forwarding them to the appropriate devices (disks, CD-ROM, etc.). Since it is used to transmit large amounts of data (such as reading or writing to the disk), the guest OS can split the data into chunks of variable sizes. In SCSI commands, these chunks are represented as Scatter-Gather (S/G) segments, each specifying a guest physical address as well as the size of the data chunk.

In the Linux PVSCSI driver (`linux/drivers/scsi/vmw_pvscsi.c`), S/G segment entries are represented by the `PVSCSISGElement` structure:

```cpp
struct PVSCSISGElement {
    u64 addr;
    u32 length;
    u32 flags;
} __packed;
```

The vulnerable function is the one that retrieves the S/G segments entries provided by the guest’s driver. It copies the entries to an internal array, and then compacts the array by coalescing contiguous entries.

Initially, the function uses a statically-allocated buffer to store the entries. It has room for 512 segments (0x2000 bytes in total). If the guest provides more than 512 entries, the function dynamically allocates a 0x4000-byte buffer to store all entries, and then reallocates the buffer for each newly added entry. The intended design is to double the size of the internal buffer whenever it needs to grow, but there are issues in the implementation:

```cpp
bool __fastcall PVSCSI_FillSGI(pvscsi_vmx *pvscsi_vmx, ScsiCmd *scsi_cmd, sgi *sgi)
{
  // [...]
  while ( 1 )
  {
    next_i = i + 1;
    if ( 0x10 * (unsigned __int64)(i + 1) > leftInPage )
    {
      Log("PVSCSI: Invalid s/g segment. Segment crosses a page boundary.\n");
      goto return_invalid;
    }
    idx = i;
    pInPage = &page[idx];
    if ( (page[idx].flags & 1) == 0 )
    {
      seg_len = page[idx].length;
      if ( sg_table_len_1 < seg_len )
        seg_len = sg_table_len_1;
      seg_count = sgi_1->seg_count;
      if ( seg_count > 0x1FF )
      {
        v13 = page;
        pEntries = (SGI_Entry *)UtilSafeRealloc1(
                                  sgi_2->entries_buffer,
                                  0x4000uLL,
                                  0xFFFFFFFF,
                                  "bora/devices/pvscsi/pvscsi.c",
                                  0xC5A);
        page = v13;
        sgi_1 = sgi_2;
        sgi_2->entries_buffer = pEntries;
        sgi_2->pEntries = pEntries;
        seg_count = sgi_2->seg_count;
      }
      else
      {
        pEntries = sgi_1->pEntries;
      }
      seg_idx = (int)seg_count;
      pEntries[seg_idx].addr = pInPage->addr;
      pEntries[seg_idx].entry_size = seg_len;
      sg_table_len_1 -= seg_len;
      sgi_1->seg_count = seg_count + 1;
      goto loop_over;
    }
  // [...]
}
```

The main problem is that the size passed to `UtilsSafeRealloc1()` is fixed to 0x4000, instead of being doubled when required. As a result, if the guest sends more than 1024 entries, the subsequent ones will be written out of the bounds of the heap buffer.

A secondary (functional) issue is that once 512 entries have been collected, the function reallocates the array at every loop iteration instead of only when its capacity is exceeded.

To sum up, if the guest sends more than 512 entries, the function allocates a new 0x4000-byte buffer at each iteration. Once the number of entries exceeds 1024, each additional entry is written past the end of the newly allocated buffer. This results in scattered out-of-bound writes, each targeting a different heap buffer and occurring at 16-byte intervals.

The overflowing data consists of 16-byte elements. The guest defines each entry as `{u64 addr; u32 length; u32 flags}`, while the controller stores only `{u64 addr; u64 length}` in the buffer. No validation is performed on `addr` and `length`, so both fields are fully controlled by the guest. Because the controller represents `length` as a 64-bit field, the guest’s 32-bit `length` is zero-extended to 64 bits, leaving the last 4 bytes of each out-of-bounds entry always zero and not controllable.

## A Heap of Trouble

Due to the vulnerability's constraints, the target heap buffers were fixed at 0x4000 bytes, placing them inevitably in the Windows 11 Low Fragmentation Heap (LFH). This allocator implements security mitigations that are notorious for being difficult to bypass. Typically, attackers would target a different size class to shift the allocation to a less hardened allocator, avoiding the LFH entirely. However, the nature of the PVSCSI vulnerability offered no such flexibility. This section details the main challenges we faced.

Note that we did not fully reverse-engineer (nor understand) the LFH internals. To keep this article concise, we intentionally omit implementation details and only provide a simplified model sufficient to understand our exploitation method. Readers interested in a comprehensive analysis should refer to existing litterature [\[1\]](https://www.synacktiv.com/en/publications/on-the-clock-escaping-vmware-workstation-at-pwn2own-berlin-2025#ref1). Finally, for the sake of simplicity, we assume throughout this section that all allocations are of 0x4000 bytes.

The LFH groups the allocations into buckets. Each bucket can hold 16 elements of 0x4000 bytes. A chunk is preceeded with 16 bytes of metadata, so a bucket’s size is 0x4010*16 bytes in total.

![16-elements bucket](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2d651472a961aabe.webp)

Exploiting the LFH with the PVSCSI bug was extremely challenging due to the combination of two mitigations: strict checking of chunk’s metadata and shuffling of allocations.

The metadata contains a checksum that is computed using a secret key. When a chunk is allocated or freed from a bucket, this checksum is verified first, and if it has been corrupted the program will abort. So whenever we corrupt a chunk’s metadata, we must ensure that this chunk will never be allocated or freed again. To achieve this in our exploit, we were dreaming of simple, deterministic heap shaping strategies. But the shuffling of allocations order made the whole process a living nightmare.

When we allocate a chunk, the LFH returns one random chunk among the ones that are not allocated. Note that **it first looks into the bucket containing the most recently freed chunk**. If no chunk is available, the LFH creates a new bucket and returns a random chunk from it. If several chunks are available, the LFH returns a random free chunk.

Triggering the realloc() bug once roughly behaves as follows on the 1025th iteration:

```cpp
p2 = malloc(0x4000);         // Allocate the new chunk
memcpy(p2, p1, 0x4000);
free(p1);                    // Free the current chunk

memcpy(p2+0x4000, elem, 16); // Write 16 bytes past the end, corrupting the new chunk's metadata 
```

If we send more than 1024 S/G entries to the vulnerable function, the 1025th entry corrupts a chunk header. The function then continues to free and allocate 0x4000-byte buffers at each loop iteration. Due to the LFH's randomized allocation order, the allocator will inevitably end up reusing the corrupted chunk. As soon as this happens, the process detects the corruption and aborts. We tried various techniques to work around this blindly, but without prior knowledge of the heap state, none succeeded.

## A Tale of Two Objects

In order to exploit the vulnerability from inside the VM, we need to find interesting 0x4000-byte heap objects we can allocate directly from the guest. In practice, we need to combine two objects: one to shape the heap layout, and another to act as a durable corruption target.

### Shaders

Spraying chunks of controlled size and data is fairly easy to do from inside the guest using shaders. They contain user-controlled data which gets compiled by the graphics acceleration component of VMware. Despite compilation, large parts of the resulting shader object remain attacker-controlled [\[2, 3\]](https://www.synacktiv.com/en/publications/on-the-clock-escaping-vmware-workstation-at-pwn2own-berlin-2025#ref2).

Hundreds of compiled shader objects can be sprayed; they are identified by handles, allowing us to free them at will, or to keep them alive eternally. This object is perfect to fill a few LFH buckets with non-critical controlled data. Note that compiled shader objects are great to spray controlled data but they cannot be read back from the guest.

### URBs

URB objects are a central transport primitive in VMware’s USB emulation layer. They handle data transfers between guest machine and (virtual) USB devices. They have a variable-sized structure which can hold data as well as pointers to other structures related to USB emulation.

In our case, we assumed the guest OS to use the Universal Host Controller Interface (UHCI) emulator. This is the default interface when creating a new Linux VM. By default in this configuration, there are two virtual devices attached to the controller: the root hub and a virtual mouse.

When initiating a new USB data transfer, the guest will make VMware allocate a URB of controlled size. The URB remains alive for the duration of the transfer and until all associated data has been retrieved by the guest (transfer status and optional data from the device). When data is received by the guest, the URB can be “reaped”, which causes VMware to copy available transfer data back to the guest. Reaping can be performed until no more data remains to be received, at which point the URB object is freed by VMware.

```asciidoc
Offset   +0x00           +0x04           +0x08           +0x0C
       +---------------------------------------------------------------+
0x00   |    refcount   |  urb_datalen  |      size     |  actual_len   |
       +---------------------------------------------------------------+
0x10   |     stream    |     endpt     |             pipe              |
       +---------------------------------------------------------------+
0x20   |      pipe_urb_queue_next      |      pipe_urb_queue_prev      |
       +----------------------------///////----------------------------+
0x70   |           data_ptr            |              unk              |
       +---------------------------------------------------------------+
0x80   |           pDataCur            |              pad              |
       +---------------------------------------------------------------+
       |                         Variable-size                         |
0x90   |                                                               |
       |                           User Data                           |
       +---------------------------------------------------------------+
```

The ability to keep URBs alive until all data has been retrieved, combined with a header structure containing fields of interest for corruption (such as the remaining data length and linked lists to other internal objects), makes URBs particularly attractive corruption targets.

It is not possible to spray a lot of URB objects (a few dozen) and they can only be freed in their instantiation order because they are stored in a FIFO queue, which makes them well-suited as corruption targets, but unsuitable for heap spraying or layout control.

Both shader and URB objects have been used in previous VMware escape exploits [\[4\]](https://www.synacktiv.com/en/publications/on-the-clock-escaping-vmware-workstation-at-pwn2own-berlin-2025#ref4) and are pretty easy to handle from the guest.

## Winning a Ping-Pong Game

While experimenting with the vulnerability, we observed an interesting LFH behavior that could provide a degree of determinism, allowing us to build more powerful primitives. However, there was a prerequisite: knowing the initial state of the LFH, specifically **the number of available chunks in the 0x4000 buckets**. At that point, we had no way of retrieving this information. Lacking a better alternative, we decided to investigate further, acting as if the initial state was already known.

The core idea is as follows: first, we allocate every free chunk to "align" the LFH and ensure that all existing buckets are full. Next, we allocate 32 shaders to create two fully occupied buckets, **B1** and **B2**. We know that the first 16 shaders will land in **B1**, and the next 16 in **B2**, but we do not know in which order they will be allocated inside their bucket. The resulting layout is shown below. For the sake of clarity, the figures display 4-chunk buckets:

![B1 and B2 fully occupied by shaders](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5098851f878cabf1.webp)

Then, we free all chunks from **B1** except for one, which we call **Hole_0**. This prevents the **B1** bucket from being released.

![B1 is almost entirely free, except for Hole\_0 at a random position](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5cab6b3dc0d964d0.webp)

Then, we allocate fifteen URBs. They will use all the available chunks from **B1**.

![B1 is now fully occupied by URBs and Hole\_0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/144e7a351a50faf8.webp)

To prepare the exploitation, we free one chunk from **B2** (the **"PONG"** buffer), followed immediately by **Hole_0** from **B1**. By doing so, we ensure that the LFH allocator's "Last Freed" pointer targets **B1**.

![PONG (B2) and Hole\_0 (B1) are freed](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0ff007266b2f7621.webp)

As mentioned before, once the guest provides more than 512 entries, the function begins its reallocation loop, allocating and freeing a new 0x4000-byte buffer at every single iteration. This is where the **"Ping-Pong"** effect manifests: for all iterations, the allocator will incessantly bounce between our two available slots, which we now call **PING** (in **B1**) and **PONG** (in **B2**).

The following animation illustrates how, starting from index 512, the entries are written alternately to the **PING** and **PONG** buffers:

![The Ping-Pong cycle](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bb96ec69c315fac7.gif)

Because the LFH always looks into the bucket containing the most recently freed chunk, the function will pick **B1** (**PING**), then **B2** (**PONG**), then **B1** again, and so on. This "Ping-Pong" continues while the out-of-bounds write offset increases by 16 bytes at each step.The 1025th allocation claims the **PONG** buffer slot in **B2** and overwrites the metadata header of the adjacent chunk in **B2**. The 1026th allocation uses the **PING** buffer in **B1**. Its out-of-bounds write now targets the first 16 bytes of the URB data adjacent to **PING**, effectively corrupting the first 16 bytes of the URB without affecting its chunk header. Immediately after triggering the corruption, we allocate two placeholder shaders to reclaim the **PING** and **PONG** chunks, to maintain the buckets in a known state.

This strategy circumvents the LFH's security mitigations. We only corrupted the header of the chunk following **PONG** in **B2**, but since this chunk is never freed or re-allocated, it is never validated by the allocator. Furthermore, we can still free the URBs and the **PING** / **PONG** buffers at will. By precisely bookkeeping all allocations and frees, we can maintain this state and repeat the Ping-Pong method multiple times.

### The Reap Oracle

To implement the rest of our primitives, we needed four contiguous chunks in a known order in **B1**. This is where the Reap Oracle comes into play. As previously mentioned, allocated URBs are stored in a FIFO queue. By repeatedly calling the UHCI controller's `reap` method, we can retrieve the content of the next URB in the queue and free it. This allows us to detect which URB was corrupted.

The 16-byte overwrite affects the following four fields of the URB structure:

```cpp
struct Urb {
  int refcount;
  uint32_t urb_datalen;
  uint32_t size;
  uint32_t actual_len;
  [...]
}
```

The critical field here is `actual_len`. Recall that for the 16-byte overflow, we control the first 12 bytes, but the last 4 bytes are always forced to zero. Consequently, the overflow invariably sets `actual_len` to zero. This corruption acts as a marker, allowing us to identify the affected URB.

The Reap Oracle Strategy:

1.  **Allocation**: We allocate 15 URBs to fill the **B1** bucket.
2.  **Corruption**: We trigger the vulnerability (Ping-Pong) to zero out the `actual_len` field of the URB located immediately after **Hole0**. Then, we allocate two placeholder shaders to reuse **Hole0** and **PONG**.
3.  **Inspection & Replacement**: We iterate through the URB queue. For each URB, we `reap` it and check its length. We immediately allocate a placeholder shader in its place.
4.  **Identification**: When we retrieve a URB with a modified `actual_len`, we know that the shader we just allocated to replace it resides in the slot following **Hole0**. We label this new slot **Hole1**.

We repeat the process to locate **Hole2** and **Hole3**. For each iteration, we free the non-essential placeholders (keeping **Hole0**, **Hole1**, etc.), refill the bucket with URBs, and use the previous Hole as the **PING** buffer. Once the heap is prepared, we re-execute the corruption and identification steps to pinpoint the next contiguous slot. Ultimately, we obtain a sequence of four contiguous chunks (**Hole0** – **Hole3**), currently occupied by shaders, which can then be freed to enforce adjacency for subsequent allocations.

## Coalescing Is All You Need

As stated earlier, after copying all S/G segments into its internal array, VMware's SCSI controller performs a coalescing pass intended to merge adjacent entries and reduce fragmentation. At first glance, the algorithm is straightforward and seems to be purely an optimization step. However, several subtle behaviors provide interesting primitives when combined with the out-of-bounds vulnerability.

```rust
// [...]
res = ((__int64 (__fastcall *)(pvscsi_vmx *, ScsiCmd *, sgi *))scsi->pvscsi->fillSGI)(// PVSCSI_FillSGI
          scsi->pvscsi,
          scsi_cmd,
          &scsi_cmd->sgi);
  LODWORD(real_seg_count) = 0;
  if ( !res )
    return 0;

  seg_count = (unsigned int)scsi_cmd->sgi.seg_count;
  if ( (int)seg_count <= 0 )
  {
    numBytes_1 = 0LL;
  }
  else
  {
    pEntries = scsi_cmd->sgi.pEntries;
    numBytes_1 = pEntries->entry_size;
    if ( (_DWORD)seg_count != 1 )
    {
      next_entry = (SGI_Entry *)((char *)pEntries + 0x18);
      LODWORD(real_seg_count) = 0;
      for ( i = 1LL; i != seg_count; ++i )
      {
        idx = (int)real_seg_count;
        entry_size = pEntries[idx].entry_size;
        addr = ADJ(next_entry)->addr;
        if ( entry_size + pEntries[idx].addr == addr )
        {
          pEntries[idx].entry_size = ADJ(next_entry)->entry_size + entry_size;
        }
        else
        {
          real_seg_count = (unsigned int)(real_seg_count + 1);
          if ( i != real_seg_count )
          {
            real_seg_idx = (int)real_seg_count;
            pEntries[real_seg_idx].addr = addr;
            pEntries[real_seg_idx].entry_size = ADJ(next_entry)->entry_size;
          }
        }
        numBytes_1 += ADJ(next_entry++)->entry_size;
      }
    }
  }
// [...]
```

This coalescing pass runs immediately after all S/G segments have been read from the guest, which means the bug has already been triggered. As a result, this loop is applied to all copied entries, including those that are out-of-bounds.

To illustrate the basic behavior of the coalescing pass, consider the following three entries:

```
Entry 1: {.addr = 0x11000, .size = 0x4000}
Entry 2: {.addr = 0x15000, .size = 0x2000}
Entry 3: {.addr = 0x30000, .size = 0x1000}
```

During the coalescing pass, the controller scans the array sequentially and merges entries that describe contiguous memory regions. In this case, the first two entries are adjacent in memory and are therefore folded into a single entry.

Subsequent entries are then "moved up" (compacted) to close the gap created by the merge:

```
Entry 1′: {.addr = 0x11000, .size = 0x6000}
Entry 2′: {.addr = 0x30000, .size = 0x1000}
```

This behavior is particularly interesting in the context of our vulnerability, as it allows out-of-bounds memory to be “moved up” during compaction.

Additionally, although the S/G entries copied from the guest have a size field limited to 32 bits, the coalescing pass performs size updates using a 64-bit extended field. As a result, summing two maximum-sized entries (`0xFFFFFFFF`) causes a carry into the next byte, allowing control over an extra bit in the overflow (the LSB of the 13th byte of an entry). By chaining additional entries, it is theoretically possible to extend this control further, yet it would require an impractically large number of entries.

Finally, if the S/G list copied from the guest is terminated with an invalid entry, the function returns early, allowing the coalescing step to be skipped after the out-of-bounds S/G entries have been copied, which can be useful in some cases.

All of these properties give us more control over what happens to the overflowed data, making the bug quite powerful, even though the initial corruption is highly constrained.

### Building a controlled overflow

To illustrate how the coalescing mechanism can be harnessed, let's consider the following (simplified) heap layout:

![Coalescing step 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/163b2c7b2fc2c5b8.webp)

Our ultimate goal is to overwrite the entire **URB1** structure with fully controlled data, including the elusive bytes that are usually zeroed out by the bug. To achieve this, we use the coalescing algorithm to "move up" a payload of controlled data prepared in **Shader2** as a list of specially crafted fake S/G entries.

After this initial setup, we can trigger the vulnerability. However, due to the bug's "Ping-Pong effect" which alternates OOB writes between two buffers, a single pass leaves 16-byte gaps. We must trigger it twice to achieve our goal.

First, we trigger the vulnerability using **PING** as the starting buffer, writing all **odd-indexed** OOB entries up to the end of **URB** **1**. At this point, we force the function to skip the coalescing phase via an early exit. We end up with the following state:

![URB overflow (first pass)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1895010405470372.webp)

Then, we trigger the vulnerability a second time with a larger number of elements and we use **PONG** as the starting buffer. This overwrites the remaining **even-indexed** OOB entries in **URB1** and continues further into **Shader2**.

![Coalescing step 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d4088c21bf7d3b3.webp)

The memory now contains a sequence of fake S/G entries primed for the coalescing algorithm:

1.  **The Vacuum (entry\[1023\]...entry\[2047\]):** These entries are all set to `{.addr=0, .len=0}`. The algorithm perceives them as a long sequence of empty, contiguous blocks and merges them all into a single entry at `entry[1023]`. This massive merge creates a logical "hole" in the array.

2.  **The Payload (entry\[2048\]...):** To close the gap created by the previous merge, the algorithm shifts the subsequent entries "up" in memory. Consequently, the content of `entry[2048]` and beyond (our payload from **Shader2**) is copied directly into the memory slot of `entry[1024]` (inside **URB1**).

However, simply moving existing S/G entries isn't enough, as we overwrote half of the shader payload with the constrained overflow (thus leaving four null bytes at the end of all **even-indexed** entries). We want to write completely arbitrary values into **URB1** (e.g., to forge pointers): we achieve this by abusing the coalescing logic's adjacency check `AddrA+LenA==AddrB`.

If we set `LenA​=0`, the check simplifies to `AddrA​==AddrB​`. This allows us to craft pairs of entries that look contiguous to the algorithm but actually carry arbitrary values for both the address and the length fields.

For example, to write the pattern `0x4141414141414141 0x4242424242424242` followed by `0x4343434343434343 0x4444444444444444` into **URB1**, we arrange the payload in **Shader2** into pairs of entries as follows:

**Pair 1:**

```
entry[i]   = { .addr = 0x4141414141414141, .size = 0 }
entry[i+1] = { .addr = 0x4141414141414141, .size = 0x4242424242424242 }
```

**Pair 2:**

```
entry[i+2] = { .addr = 0x4343434343434343, .size = 0 }
entry[i+3] = { .addr = 0x4343434343434343, .size = 0x4444444444444444 }
```

Note that **even-indexed** entries (with the size set to zero) are written by the heap-overflow, while **odd-indexed** entries are the ones that were already present in **Shader2**.

Each pair of entries is merged into a single one due to their matching addresses and the zero size:

```
entry[i]   = { .addr = 0x4141414141414141, .size = 0x4242424242424242 }
entry[i+1] = { .addr = 0x4343434343434343, .size = 0x4444444444444444 }
```

Consequently, as these OOB entries are pulled up into **URB1**, they are simultaneously merged with the data already prepared in the shader. The final memory content of **URB1** becomes exactly what we desired:

![Coalescing step 3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6a78a4dc1dd7bd8f.webp)

This is a very interesting primitive that allows us to completely overwrite a URB structure with arbitrary data. Nevertheless, we still need an infoleak in order to forge pointers in our fake structure, otherwise any use of the URB will cause a crash of the hypervisor.

## Leaking a URB

The most straightforward path to an information leak is to corrupt the `actual_len` field of a URB object. This field dictates how many bytes VMware copies back to the guest when the URB is "reaped". If we could increase this value beyond the size of the allocated buffer, we would obtain a classic Out-Of-Bounds Read, as previously described by Jiang and Ying [\[4\]](https://www.synacktiv.com/en/publications/on-the-clock-escaping-vmware-workstation-at-pwn2own-berlin-2025#ref4). But once again, due to the constraints of the overflow, we can only set this field to zero.

To bypass this, we devised a strategy that leverages the coalescing logic to perform a series of operations on the heap, rather than a direct write.

### Step 1: The Setup

Thanks to the Reap Oracle, we can now force four 0x4000-byte heap objects to be allocated contiguously by freeing the corresponding Hole shader just before performing the allocations. The layout is as follows:

![URB leak initial step](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a13db2a1a2ce467.webp)

-   **Hole0:** The PING buffer from which we trigger our overflow (initially free).

-   **URB1:** The object we will corrupt in order to obtain the leak.

-   **URB2:** A valid object whose header we want to "move up" into **URB1**. Note its `actual_len` is `0x0`, as all its data has already been read by the guest, which means the data buffer pointer has been advanced right before **URB3**.

-   **URB3:** The object we intend to leak.

### Step 2: The Overflow

We trigger the vulnerability. As **Hole0** expands, it overflows into the adjacent chunks. We carefully craft the payload to write fake S/G entries into the memory space of **URB1**. These fake entries are designed with specific properties:

-   **Addresses:** They are contiguous (virtually), mimicking a segmented buffer.

-   **Sizes:** We always set them to `0xFFFFFFFF`.

Just like in the previous section, we trigger the vulnerability twice in order to overwrite both **odd-indexed** and **even-indexed** entries of **URB1**, and corrupt only half of **URB2** while keeping its critical fields intact. We end up with the following state:

![URB leak overflow step](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c0a24d1e97f6c9ca.webp)

### Step 3: The Coalescing

This is where the magic happens. After the overflow, the PVSCSI controller runs its coalescing pass. It scans the array (which now extends into **URB1** and **URB2**) and finds our sequence of fake entries. It proceeds as follows:

1.  **Merge & Sum:** The algorithm detects that all entries in **URB1** are contiguous. It merges them into a single entry located at offset 0 in **URB1**.

2.  **Size Summation:** It calculates the size of the new entry: `0xFFFFFFFF*0x401`. The addition result's top dword is stored in the upper 32 bits of the field, matching the offset of our target `actual_len` field, effectively setting it to `0x400`.

3.  **Compaction (Move Up):** To finalize the merge, the algorithm copies the data which follows all the contiguous entries into the next slots (inside **URB1** 's buffer). In practice, it copies **URB2** 's header into **URB1**.

![URB leak coalescing step](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b27d9c0d0ee7a68.webp)

The result is a **Hybrid URB** residing at the address of **URB1**:

-   **Header:** It contains a copy of **URB2** 's critical pointers (specifically the USB pipe object pointer and linked list pointers), making it a valid object that won't crash the VM.

-   **Data Length:** The `actual_len` is now the result of our sum (`0x400`).

-   **Data Pointer:** It points to **URB2** 's original data buffer, which is already at the boundary of its original buffer (pointing right before **URB3**).

When we ask the guest to reap **URB1**, VMware believes it needs to return 0x400 bytes from its data buffer. Since the buffer now points at the end of **URB2** 's real data buffer, the read continues into the next chunk: **URB3**, effectively creating an OOB-Read capability.

This allows us to dump the entire content of **URB3**, including its header. The URB header contains a pointer to the USB pipe object and self-referencing pointers. By leaking these, we can defeat the heap ASLR by calculating the precise addresses of **Hole0**, **1**, **2**, and **3**.

To wrap up this section: because we could not directly control `actual_len` to get a leak, we instead leveraged the coalescing algorithm to craft a Frankenstein URB in memory, composed of parts of another URB and OOB S/G entries.

Note to the reader: A keen eye might notice that our figures and explanations ignore the LFH chunk headers. We deliberately omitted them for the sake of clarity, along with some intermediate steps of the construction of the URB, as they don't affect the exploit's core logic.

## Arbitrary Read, Write and Call Primitives

After leaking a URB header and defeating the heap ASLR, it becomes quite easy to build more powerful primitives, such as a read and write, and finally, an arbitrary call.

We reuse the memory layout from our leak phase: `[Hole0, URB1, URB2, Shader3]`

At this stage, **URB1** and **URB2** have corrupted heap metadata and can no longer be safely freed. However, **Shader3** (the former **URB3** location) remains uncorrupted and can be freely reallocated at will.

We gain full control over the structure of **URB1** by using **Shader3** as our source buffer. By placing a forged URB structure inside **Shader3** and triggering the "move up" primitive, we shift our data directly into **URB1** ’s memory space, effectively replacing its contents with arbitrary data. Having previously leaked a URB header, we already possess all the pointers necessary to forge a perfectly valid one.

#### A Persistent Arbitrary URB

To ensure full stability, we aim to create a persistent fake URB that can be controlled through simple heap reallocations, bypassing the need to trigger the vulnerability ever again. The trick is to change the `URB1.next` pointer to point to **Hole0**. We also increment the reference count of **URB1** to ensure it stays in memory despite its corrupted metadata.

When VMware "reaps" **URB1**, it sets `URB1.next` as the new head of the URBs FIFO queue. This effectively places our fake URB in **Hole0** at the top of the FIFO. We can now control this fake structure at will by reallocating **Hole0** with a new shader whenever needed, removing any further need to trigger the PVSCSI vulnerability.

#### Read & Write Operations

For both read and write primitives, each time we need to use any of them, we just allocate a new shader in **Hole0** containing a fake URB structure such as:

-   **Read primitive**: set `URB.actual_len` to the length to read and `URB.data_ptr` to the address to read, then reap the fake URB to read back the data in the guest.

-   **Write primitive**: set `URB.pipe` pointer to a known controlled location (e.g: inside **Hole0**) and abuse the TDBuffer writeback mechanism (as per UHCI specifications) to write a controlled 32-bits value at an arbitrary address.

#### Call primitive

The last piece of the puzzle is the call primitive. By having an arbitrary R/W primitive, it is pretty straightforward to build. We decided to corrupt the callback function pointer in the USB pipe object structure, which is always called on newly created URBs. This gives us an arbitrary indirect call, with controlled data in `RCX+0x90` (where the URB user data resides).

To ensure our exploit is portable across Windows versions, we avoid hardcoded offsets. Instead, we use our read primitive to parse `Kernel32` in memory and dynamically resolve the address of `WinExec`.

The last hurdle is bypassing Control Flow Guard (CFG). We cannot jump directly to `WinExec`, so we use a CFG-whitelisted gadget within `vmware-vmx`. This gadget pivots data from `RCX+0x100` into a fully controlled argument before jumping to a second arbitrary function pointer, in this case, `WinExec("calc.exe")`.

At this point, we are able to demonstrate a completely stable VM escape in VMware Workstation, given we know the initial state of the LFH.

## On the Clock

Two days before the competition—and three days after registering—we finally had a working exploit. The only minor issue was that it relied on the assumption that we knew the initial LFH state—but we didn’t. The number of free LFH chunks was a moving target. Right after booting the guest OS, the value was almost always the same, but as soon as a graphical session was launched, it started changing in unpredictable ways. To make things worse, our various testing setups all had close but distinct initial LFH states. Basically, we needed to pick one number out of 16, knowing only that the odds were somewhat skewed in favor of certain values. At this point, our best strategy was rolling a slightly loaded 16-sided die.

We had previously envisaged a solution based on a simple hypothesis: when a chunk is allocated from the LFH, if all the current buckets are full, the LFH needs to create a new bucket, a process that should take additional time. By allocating multiple 0x4000 buffers and precisely measuring the duration of each allocation, we should be able to detect a slightly longer delay each time a new bucket is created. We hoped this would provide a reliable timing-channel to uncover the initial LFH state.

The catch was that we needed a synchronous allocation primitive. In VMware, almost all allocations are performed asynchronously. For instance, to allocate shaders, we push commands in the SVGA FIFO, which are then processed in the background, leaving us no way to precisely time the allocation.

By chance, VMware exposes one feature that is perfectly synchronous: the backdoor channel. This channel is used to implement VMware Tools features, such as copy-and-paste. It is implemented via "magic" assembly instructions, which return only after the command has been fully processed. Here is an excerpt from Open VM Tools, which provides an open-source implementation of the VMware Tools:

```cpp
/** VMware backdoor magic instruction */
#define VMW_BACKDOOR "inl %%dx, %%eax"

static inline __attribute__ (( always_inline )) uint32_t
vmware_cmd_guestrpc ( int channel, uint16_t subcommand, uint32_t parameter,
              uint16_t *edxhi, uint32_t *ebx ) { 
    uint32_t discard_a;
    uint32_t status;
    uint32_t edx;

    /* Perform backdoor call */
    __asm__ __volatile__ ( VMW_BACKDOOR
                   : "=a" ( discard_a ), "=b" ( *ebx ),
                 "=c" ( status ), "=d" ( edx )
                   : "0" ( VMW_MAGIC ), "1" ( parameter ),
                 "2" ( VMW_CMD_GUESTRPC | ( subcommand << 16 )), 
                 "3" ( VMW_PORT | ( channel << 16 ) ) );
    *edxhi = ( edx >> 16 );

    return status;
}
```

To trigger controlled allocations using the VMware Tools, we leveraged the `vmx.capability.unified_loop` command [\[5\]](https://www.synacktiv.com/en/publications/on-the-clock-escaping-vmware-workstation-at-pwn2own-berlin-2025#ref5). By providing a string argument of 0x4000 bytes, we could force the host to allocate exactly two buffers of that size.

Since a bucket for the 0x4000 size class contains exactly 16 chunks, triggering this command 8 times (for a total of 16 allocations) guaranteed that we would cross a bucket boundary and observe a bucket creation event.

To time the allocations, we relied on the `gettimeofday` system call. While the timing signal was subtle, it was definitely noticeable. To clean up the noise, we implemented some "poor man's signal processing":

1.  We triggered the command 8 times to collect a batch of measurements.
2.  We discarded any batch containing significant outliers (typically much longer measurements caused by host context-switches).
3.  We summed multiple valid batches to obtain a smoother, more reliable estimation.

When tuned correctly, the results were clear: among the 8 measurements, one was consistently longer, indicating that a new bucket had been created during that specific call. We could then allocate a single 0x4000 buffer and repeat the process to determine precisely which of the two allocations within the command had triggered the new bucket's creation.

This second pass allowed us to deduce the exact LFH offset: if the timing spike appeared at the same index as before, it meant the LFH offset was odd; if the spike shifted to the next index, the offset was even. Any other result was flagged as incoherent—usually due to background heap activity or, more commonly, excessively noisy measurements—meaning we had to restart the process from scratch.

### Racing Against Noise

In theory, we could have used a very large number of batches to arbitrarily increase the signal-to-noise ratio (SNR). In practice, however, we hit a significant bottleneck in the `vmx.capability.unified_loop` command: the strings allocated by this command are added to a global list and cannot be freed.

Furthermore, these strings must be unique. This means that every time we issued the command, the host would first compare our string argument against every string already present in the list, only performing a new allocation if it found no match.

This posed a major challenge. Initially, when the list was empty, the string comparison was instantaneous. But after a few hundred allocations, the command had to perform hundreds of comparisons before even reaching the allocation logic. This $O(n)$ search overhead meant that as we were collecting more batches to improve our SNR, the baseline noise and latency were actually increasing.

This created a race against time: every batch of measurements we collected to increase our precision paradoxically raised the noise floor for the next one.

We knew that if the algorithm didn't converge quickly enough, the VM state would become too "polluted" to ever yield a clear reading again. Luckily, after testing and tuning the algorithm on multiple computers, we found a working balance. During the competition, the exploit worked on the first attempt, much to our relief.

## Demonstration

Here is a video of the exploit in action:

## Conclusion

This research was conducted over three months of evenings and weekends. The first month was dedicated to reverse-engineering VMware and discovering the vulnerability. Convinced that exploitation would be straightforward, we spent the second month procrastinating.

The third month was a reality check. While we developed the drivers necessary to allocate interesting objects, we hit a wall with Windows 11 LFH mitigations, exhausting countless bypass strategies that ultimately failed. Consequently, the core of the exploit—including the leak, the Read/Write/Execute primitives, and the timing-channel—was developed in the final five days leading up to the competition.

While this last-minute sprint ultimately paid off, we strictly advise against replicating our timeline—unless you particularly enjoy sleep deprivation.

## References

\[1\] Saar Amar, *Low Fragmentation Heap (LFH) Exploitation - Windows 10 Userspace*

\[2\] Zisis Sialveras, *Straight outta VMware: Modern exploitation of the SVGA device for guest-to-host escape exploits*

\[3\] Corentin Bayet, Bruno Pujos, *SpeedPwning VMware Workstation: Failing at Pwn2Own, but doing it fast*

\[4\] Yuhao Jiang, Xinlei Ying, *URB Excalibur: The New VMware All-Platform VM Escapes*

\[5\] nafod, *Pwning VMware, Part 2: ZDI-19-421, a UHCI bug*
