---
title: "Writing a Hyper-V “Bridge” for Fuzzing — Part 2 : Hypercalls & MDLs"
source: https://www.alex-ionescu.com/writing-a-hyper-v-bridge-for-fuzzing-part-2-hypercalls-mdls/
source_host: www.alex-ionescu.com
clip_date: 2026-09-14T10:31:47+08:00
trace_id: 7782ef9c-1a5b-4274-a890-ecc45e921ff3
content_hash: d1fdacf3b1f64e24cc2e924f8c257a5b376b043469c8e72988063bcc65e093fb
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: Alex Ionescu
ai_summary: 通过 IOCTL 在内核驱动中把用户缓冲区转为 MDL 物理地址，调用 Windows 导出的 HvlInvokeHypercall，即可从用户态发起 Hyper-V 慢速 hypercall。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3db75244-d011-8168-a6c2-c7dae5402456
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 通过 IOCTL 在内核驱动中把用户缓冲区转为 MDL 物理地址，调用 Windows 导出的 HvlInvokeHypercall，即可从用户态发起 Hyper-V 慢速 hypercall。
> 
> - **两类 hypercall：** *regular/slow* 用物理地址传参、需 MDL 对齐；*extended fast* 用寄存器（含 XMM）传最多 112 字节，8 字节对齐，速度快但更复杂。
> - **输入/输出值结构：** `HV_X64_HYPERCALL_INPUT` 含 CallCode、IsFast、CountOfElements、RepStartIndex；输出值含 CallStatus 与 ElementsProcessed，支撑重复 hypercall 的断点续传。
> - **重复机制：** hypercall 期间 OS 失去处理器控制，Hyper-V 将其拆成"工作块"，填满约 50 微秒时间片后返回当前索引，供 OS 处理中断与调度。
> - **MDL 用途：** 锁定用户态/内核缓冲区并返回 PFN 数组；本文用 `MapUserBufferToMdl` 分配连续物理页并拷贝数据（输入拷贝、输出回拷），释放时需 `MmFreePagesFromMdlEx` + `ExFreePool`。
> - **Windows 内部实现：** 用 `HvlpAcquireHypercallPage`/`HvlpReleaseHypercallPage`，优先取 KPRCB 的 SLIST 缓存页（HypercallCachedPages 索引 2 起共 4 页），其次用栈缓冲区（抬 IRQL 至 DISPATCH_LEVEL），否则用索引 0/1 两页。
> - **样例：** 定义 `IOCTL_ISSUE_HYPER_CALL`（0x100，FILE_DEVICE_UNKNOWN，METHOD_BUFFERED），驱动 `HandleRegularHvCall` 构 MDL 并调 `HvlInvokeHypercall`，用户态演示 `HvCallGetVpIndexFromApicId`（单元素、根分区 1:1 映射）。

## Introduction

Previously, in [Part 1](http://www.alex-ionescu.com/?p=377), we were able to see how the *Windows Driver Foundation (WDF)* can significantly simplify the development of drivers, including even “research-type” non-PnP drivers. In this part, we will now enter the guts of Hyper-V and talk about how *hypercalls* work (a portmanteau of *syscall* (system call) as applied when talking about an OS->Hypervisor transition instead of an App->OS transition).

First, it’s important to learn that there are two kinds of hypercalls that Hyper-V supports, which are described in the [*Top Level Functional Specification (TLFS)*](https://docs.microsoft.com/en-us/virtualization/hyper-v-on-windows/reference/tlfs). The first, called *regular* or *slow* hypercalls, use physical addresses of RAM in order to send and receive input and output parameters, which are aligned to natural boundaries. We’ll have to learn about the Windows concept of *Memory Descriptor Lists (MDLs)* to explain how we can pass such data to Hyper-V, and this will be the topic of this part.

The second kind of hypercall is called an *extended fast* hypercall and uses registers, including *XMM* non-integer registers in order to pass in up to 112 bytes of data, aligned on and padded to 8 byte boundaries. This is much faster as memory allocations and mappings are not involved, but requires some more complex understanding of memory alignments, and we’ll leave this for the next part.

## Hypercall Basics

Regardless of the type of hypercall being initiated, a *hypercall input value* and a *hypercall result value* are always used and returned. This data is used to both inform the hypervisor as to the calling convention and type of hypercall being attempted, as well as to provide any errors, intermediate state, or final result back to the caller. To begin with, here’s what the *input value* looks like:

```objectivec
typedef union _HV_X64_HYPERCALL_INPUT
{
    struct
    {
        UINT32 CallCode : 16;
        UINT32 IsFast : 1;
        UINT32 Reserved1 : 15;
        UINT32 CountOfElements : 12;
        UINT32 Reserved2 : 4;
        UINT32 RepStartIndex : 12;
        UINT32 Reserved3 : 4;
    };
    UINT64 AsUINT64;
} HV_X64_HYPERCALL_INPUT, *PHV_X64_HYPERCALL_INPUT;
```

While the first members should be self-evident (specifying the hypercall index and the calling convention used, the count and start index fields related to a concept not yet introduced — the *repeated hypercall*. You see, because processing a hypercall essentially results in the OS losing control of the processor (no interrupts and no scheduling), it’s important for the hypervisor to minimize this time.

Hyper-V employs an innovative idea of allowing more complex requests to be split up as “chunks of work” (i.e.: repetitions), and for the hypervisor to perform enough repetitions to fill up a timeslice (say, 50 microseconds), return back the current index where it left off, and allowing the OS some time to handle interrupts and scheduling needs, before re-issuing the hypercall at the updated start index. This works, by the way, both for input and output parameters.

Now let’s see what the *result value* has in store:

```objectivec
typedef union _HV_X64_HYPERCALL_OUTPUT
{
    struct
    {
        HV_STATUS CallStatus;
        UINT16 Reserved1;
        UINT32 ElementsProcessed : 12;
        UINT32 Reserved2 : 20;
    };
    UINT64 AsUINT64;
} HV_X64_HYPERCALL_OUTPUT, *PHV_X64_HYPERCALL_OUTPUT;
```

Once again, we can see both the obvious return value itself (similar to an **NTSTATUS** or **HRESULT**) as well as a specific *repeated hypercall* field, which allows the caller, as explained above, to correctly restart the hypercall with the start index pointing after the number of elements processed (or, in the case of an error, determine which element caused the error).

## Memory Descriptor Lists

*Memory Descriptor Lists* are an extremely useful construct in the Windows kernel which allows driver writers to either take existing user-mode memory or kernel-mode memory (such as a nonpaged pool buffer) and lock it down in memory (pinning it so that it can not be reused nor freed), guaranteeing its access rights, and returning an array of corresponding *Page Frame Numbers (PFNs)* that map to the virtual buffers.

Obviously, this type of data structure is extremely useful when doing *Direct Memory Access (DMA*) with a *Network Interface Card (NIC)* and its driver, but it also has software-specific uses such as re-mapping an existing buffer with different permissions (by creating a new, secondary mapping, of the initial buffer whose pages are now locked down) — this specific use case being seen in certain rootkits, for example. Windows also provides APIs for directly requesting empty physical memory and attaching an *MDL* to it, followed by APIs which allow mapping the physical pages into a virtual buffer based on the requested mapping flags.

In our use case, the hypervisor expects a page aligned contiguous set of input physical pages that match the data (potentially repeated) specified by the *hypercall input value* and a similar set of pages for the output buffer. In the code snippet below, a helper function is used to take a user-mode buffer and convert it into an appropriate *MDL* for use with Hyper-V *hypercalls*, returning the underlying physical address.

Note that, as mentioned above, it is technically possible to directly construct an *MDL* around the initial user buffer without requiring a kernel-copy to be made, but this would assume that the user-buffer is on physically contiguous pages (or page-aligned within a single page). A safer approach is taken here, where the *MDL* is allocated and a copy of the user buffer is made. On output, this means that the caller must copy the *MDL* buffer back into the user buffer.

Also take note that the virtual buffer is not zeroed out for performance reasons, which means that the output buffer copied back into user-mode should only copy the exact number of bytes that the hypervisor returned back, in order to avoid leaking arbitrary kernel memory back to the user (in this particular implementation, this is a moot point, as the hypercalls used in the fuzzing interface regularly accept/return kernel pointers and assume a Ring 0 attacker to begin with).

```cpp
NTSTATUS
MapUserBufferToMdl (
    _In_ PVOID UserBuffer,
    _In_ ULONG BufferSize,
    _In_ BOOLEAN IsInput,
    _Out_ PULONGLONG MappedPa,
    _Out_ PMDL* MdlToFree
    )
{
    PMDL hvMdl;
    PHYSICAL_ADDRESS low, high;
    PVOID mapBuffer;
    ULONG pageCount;
    ULONG idealNode;
    ULONG flags;
    NTSTATUS status;

    //
    // Allocate an MDL for the number of pages needed, in the
    // current NUMA node, and allow the processor to cache them.
    // In case more than a page of data is needed, make sure to
    // require contiguous pages, as the hypervisor only receives
    // the starting PFN, not an array. We also allow the memory
    // manager to look at other non local nodes if the current
    // one is unavailable, and we speed it up by not requesting
    // zeroed memory.
    //
    *MdlToFree = NULL;
    *MappedPa = 0;
    low.QuadPart = 0;
    high.QuadPart = ~0ULL;
    pageCount = ROUND_TO_PAGES(BufferSize);
    idealNode = KeGetCurrentNodeNumber();
    flags = MM_ALLOCATE_REQUIRE_CONTIGUOUS_CHUNKS |
            MM_ALLOCATE_FULLY_REQUIRED |
            MM_DONT_ZERO_ALLOCATION;

    //
    // Use the very latest 1809 API which also allows us to
    // pass in the Memory Partition from which to grab the
    // pages from -- in our case we pass NULL meaning use the
    // System Partition (0).
    //
    hvMdl = MmAllocatePartitionNodePagesForMdlEx(low,
                                                 high,
                                                 low,
                                                 pageCount,
                                                 MmCached,
                                                 idealNode,
                                                 flags,
                                                 NULL);
    if (hvMdl == NULL)
    {
        //
        // There is not enough free contiguous physical memory,
        // bail out
        //
        DbgPrintEx(DPFLTR_IHVDRIVER_ID,
                   DPFLTR_ERROR_LEVEL,
                   "Failed to allocate MDL\n");
        status = STATUS_INSUFFICIENT_RESOURCES;
        goto Cleanup;
    }

    //
    // Map the MDL pages in kernel-mode, with RWNX permissions
    //
    mapBuffer = MmGetSystemAddressForMdlSafe(hvMdl,
                                            MdlMappingNoExecute);
    if (mapBuffer == NULL)
    {
        DbgPrintEx(DPFLTR_IHVDRIVER_ID,
                   DPFLTR_ERROR_LEVEL,
                   "Failed to map buffer\n");
        status = STATUS_INSUFFICIENT_RESOURCES;
        goto Cleanup;
    }

    //
    // Use SEH in case the user-mode buffer is invalid
    //
    __try
    {
        if (IsInput != FALSE)
        {
            //
            // Make sure the input buffer is aligned user-mode
            // memory, then copy it into the mapped kernel buffer
            //
            ProbeForRead(UserBuffer,
                         BufferSize,
                         __alignof(UCHAR));
            RtlCopyMemory(mapBuffer,
                          UserBuffer,
                          BufferSize);
        }
        else
        {
            //
            // Make sure the output buffer is aligned user-mode
            // memory and that it is writeable. The copy will be
            // done after the hypercall completes.
            //
            ProbeForWrite(UserBuffer,
                          BufferSize,
                          __alignof(UCHAR));
        }
    }
    __except(EXCEPTION_EXECUTE_HANDLER)
    {
        //
        // An exception was raised, bail out
        //
        status = GetExceptionCode();
        DbgPrintEx(DPFLTR_IHVDRIVER_ID,
                   DPFLTR_ERROR_LEVEL,
                   "Exception copying buffer : %lx\n",
                   status);
        goto Cleanup;
    }

    //
    // Hyper-V will want to know the starting physical address
    // for the buffer, so grab it
    //
    *MappedPa = *MmGetMdlPfnArray(hvMdl) << PAGE_SHIFT;
    *MdlToFree = hvMdl;
    status = STATUS_SUCCESS;

Cleanup:
    //
    // On failure, clean up the MDL if one was created/mapped
    //
    if (!(NT_SUCCESS(status)) && (hvMdl != NULL))
    {
        //
        // This also cleans up the mapping buffer if one exists
        //
        MmFreePagesFromMdlEx(hvMdl, 0);
        ExFreePool(hvMdl);
    }
    return status;
}
```

As a small addendum related to Windows Internals, however, it should be noted that Windows does not typically go through this heavy handed approach each time it wishes to issue a hypercall. Instead, two helper functions: ***HvlpAcquireHypercallPage*** and ***HvlpReleaseHypercallPage***, are used to grab an appropriate physical page from one of the following possible locations:

-   An *SLIST (Lock-Free Stack List)* is used, which is used to cache a number of pre-configured cached hypercall pages stored in the **KPRCB** (**HypercallPageList**). 4 such pages are stored in the **KPRCB HypercallCachedPages** array, starting at index 2.
-   If no cached pages are available, and the stack buffer can be used, it is page aligned and its physical address is used for the hypercall. The *Interrupt Request Level (IRQL)* is raised to **DISPATCH_LEVEL** to avoid the kernel stack from being marked as non-resident.
-   If the stack buffer cannot be used, two hardcoded pages are used from the **KPRCB HypercallCachedPages** array — index 0 for the input page, index 1 for the output page.

For processor 0 (the *bootstrap processo* r or *BSP*) the default and cached pages are allocated by the ***HvlpSetupBootProcessorEarlyHypercallPages*** function by using the *HAL (Hardware Abstraction Layer)* early allocation code (***HalAllocateEarlyPages*** from the *HAL Private Dispatch Table*), which ends up grabbing memory from the so-called *HAL Heap* (advanced readers are advised that this is interesting), while for the *Application Processors (APs)*, ***MmAllocateIndependentPages***, the ***HvlInitializeProcessor*** function uses ***MmAllocateIndependentPages*** to grab per-NUMA-node local physical pages.

## Issuing the Hypercall

Now that we know how to take the input and output buffer and convert them into appropriate physical addresses, we need to talk about how to actually talk to Hyper-V to issue this call. First, it’s important to note that the goal of this series is not to go into Hyper-V specifics as much as it is to talk about interfacing with Hyper-V on a Windows system, for security/fuzzing purposes — therefore, the details of how the actual ***VMCALL*** instruction works and how Hyper-V maps its “hypercall page” through the *Hypercall Interface MSR* will be left to readers curious enough to read the *TLFS*.

Our approach, instead, will be to re-use Windows’ existing capabilities, and avoid handcrafing assembly code (and conflicting with the *memory manager*, *VSM*, and *Patchguard*). In order to assist us, Windows 10 has a helpful exported kernel call which lets us do just that:

```
NTKERNELAPI
HV_X64_HYPERCALL_OUTPUT
NTAPI
HvlInvokeHypercall (
    _In_ HV_X64_HYPERCALL_INPUT InputValue,
    _In_ ULONGLONG InputPa,
    _In_opt_ ULONGLONG OutputPa
    );
```

As you may have expected, this API simply takes in the *hypercall input value*, comes back with the *hypercall result* *value*, and accepts the physical addresses of the input and output buffers (if any). Therefore, all we have to do is plug in a call to this export from our *IOCTL* handler (seen in Part 1), and correctly construct the *MDLs* with the copy of the input and output buffer.

## Sample Code — Bridging User and Kernel

All the building blocks are now ready and we begin by first defining the *IOCTL* value itself as well as the data structure that will be used to communicate between the two worlds. Then, we add some code to the *IOCTL* event callback to execute our handler, which will build the *MDLs* and then issue the call. Afterwise, we copy any output data back to the caller, and the user-mode client displays the result.

#### Defining the IOCTL Value and Buffer

In this approach, we’ve decided to simply use the standard of beginning our *IOCTL* functions at 0x100, and picking the **FILE_DEVICE_UNKNOWN** device type instead of defining our own. The input data structure contains the actual pointers to the input and output buffers (and their size), as well as the *hypercall input value* and the *hypercall result value*.

```
#define IOCTL_ISSUE_HYPER_CALL   \
    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x100, METHOD_BUFFERED, FILE_WRITE_ACCESS)

typedef struct _VTL_BRIDGE_ISSUE_HYPER_CALL
{
    HV_X64_HYPERCALL_INPUT InputDescriptor;
    _Field_size_(InputSize) _User_always_
        PVOID InputBuffer;
    ULONG InputSize;

    HV_X64_HYPERCALL_OUTPUT OutputDescriptor;
    _Field_size_opt_(OutputSize) _User_always_
        PVOID OutputBuffer;
    ULONG OutputSize;
} VTL_BRIDGE_ISSUE_HYPER_CALL, *PVTL_BRIDGE_ISSUE_HYPER_CALL;
```

#### Extending the IOCTL Event Callback

We take the stub code seen in Part 1 and we add the following block of code to the IOCTL switch statement, which now calls the handler itself.

```go
    case IOCTL_ISSUE_HYPER_CALL:
    {
        //
        // The input and output buffer sizes are identical
        //
        if (InputLength != OutputLength)
        {
            DbgPrintEx(DPFLTR_IHVDRIVER_ID,
                       DPFLTR_ERROR_LEVEL,
                       "Size mismatch: %llx %llx\n",
                       InputLength,
                       OutputLength);
            status = STATUS_INVALID_PARAMETER;
            goto Exit;
        }

        //
        // Handle a regular hypercall request
        //
        status = HandleRegularHvCall(inBuffer,
                                     InputLength,
                                     &resultLength);
        break;
    }
```

#### Implementing the Handler

The handler needs to take our request buffer, make sure it’s the expected size, and then construct *MDLs* for the input and output buffers that are referenced. Once they are constructed, the HVL interface can be used to communicate to Hyper-V, after which the *result value* can be written back in the buffer.

Recall that *WDF* takes care of probing and copying the request buffer, but the deep pointers to the input and output buffers are user-mode data for us to correctly handle.

```rust
NTSTATUS
HandleRegularHvCall (
    _In_ PVOID RequestBuffer,
    _In_ SIZE_T RequestBufferSize,
    _Out_ PULONG_PTR ResultLength
    )
{
    NTSTATUS status;
    PVTL_BRIDGE_ISSUE_HYPER_CALL hcCall;
    HV_X64_HYPERCALL_OUTPUT output;
    ULONGLONG inputPa, outputPa;
    PMDL inputMdl, outputMdl;

    //
    // Grab the hypercall buffer from the caller
    //
    hcCall = (PVTL_BRIDGE_ISSUE_HYPER_CALL)RequestBuffer;
    inputMdl = NULL;
    outputMdl = NULL;
    inputPa = 0;
    outputPa = 0;

    //
    // The request buffer must match the size we expect
    //
    *ResultLength = 0;
    if (RequestBufferSize != sizeof(*hcCall))
    {
        DbgPrintEx(DPFLTR_IHVDRIVER_ID,
                   DPFLTR_ERROR_LEVEL,
                   "Buffer size mismatch: %lx\n",
                   RequestBuffer);
        status = STATUS_INVALID_BUFFER_SIZE;
        goto Cleanup;
    }

    //
    // Check if the hypercall has any input data
    //
    if (hcCall->InputSize != 0)
    {
        //
        // Make an MDL for it
        //
        status = MapUserBufferToMdl(hcCall->InputBuffer,
                                    hcCall->InputSize,
                                    TRUE,
                                    &inputPa,
                                    &inputMdl);
        if (!NT_SUCCESS(status))
        {
            DbgPrintEx(DPFLTR_IHVDRIVER_ID,
                       DPFLTR_ERROR_LEVEL,
                       "Failed to create input MDL: %lx\n",
                       status);
            goto Cleanup;
        }
    }

    //
    // Check if the hypercall has output data
    //
    if (hcCall->OutputSize != 0)
    {
        //
        // Make an MDL for it too
        //
        status = MapUserBufferToMdl(hcCall->OutputBuffer,
                                    hcCall->OutputSize,
                                    FALSE,
                                    &outputPa,
                                    &outputMdl);
        if (!NT_SUCCESS(status))
        {
            DbgPrintEx(DPFLTR_IHVDRIVER_ID,
                       DPFLTR_ERROR_LEVEL,
                       "Failed to create output MDL: %lx\n",
                       status);
            goto Cleanup;
        }
    }

    //
    // Issue the hyper call, providing the physical addresses
    //
    output = HvlInvokeHypercall(hcCall->InputDescriptor,
                                inputPa,
                                outputPa);
    hcCall->OutputDescriptor = output;

    //
    // Check if the caller expected an output buffer
    //
    if (hcCall->OutputSize != 0)
    {
        //
        // The user buffer may have become invalid,
        // guard against this with an exception handler
        //
        __try
        {
            NT_ASSERT(outputMdl != NULL);
            RtlCopyMemory(hcCall->OutputBuffer,
                          MmGetMdlVirtualAddress(outputMdl),
                          MmGetMdlByteCount(outputMdl));
        }
        __except (EXCEPTION_EXECUTE_HANDLER)
        {
            status = GetExceptionCode();
            goto Cleanup;
        }
    }

    //
    // Return the data back to the user, who will deal with it
    //
    *ResultLength = sizeof(*hcCall);
    status = STATUS_SUCCESS;

Cleanup:
    //
    // If there was an input MDL, free it
    //
    if (inputMdl != NULL)
    {
        NT_ASSERT(hcCall->InputSize != 0);
        MmFreePagesFromMdlEx(inputMdl, 0);
        ExFreePool(inputMdl);
    }

    //
    // To the same for the output MDL
    //
    if (outputMdl != NULL)
    {
        NT_ASSERT(hcCall->OutputSize != 0);
        MmFreePagesFromMdlEx(outputMdl, 0);
        ExFreePool(outputMdl);
    }
    return status;
}
```

#### Issuing the IOCTL from User-Mode

Now let’s try an actual hypercall and see if the bridge works. For this example, we’ll use ***HvCallGetVpIndexFromApicId***, which is a very simple call that returns the *Virtual Processor (VP)* index based on the physical *Advanced Programmable Interrupt Controller (APIC) ID* of the processor. From the host, this call should be allowed, and should return the identical number back — as on the root partition, there is a 1:1 mapping between *VPs* and *APIC IDs*.

You might note that this is actually a *repeated call* as is visible by the setting of the **CountOfElements** field. This is because an array of *APIC IDs* can be provided, which will result in an array of *VPs*. In this sample, though, we are only specifying a single element, so we don’t have the restarting logic that a repeated call normally requires.

```objectivec
DWORD
HcBridgeTest (
    _In_ HANDLE hFuzzer
    )
{
    HV_INPUT_GET_VP_INDEX_FROM_APIC_ID Input;
    HV_VP_INDEX Output;
    VTL_BRIDGE_ISSUE_HYPER_CALL hcCall;
    BOOL bRes;
    DWORD dwError;
    HV_STATUS hvStatus;

    //
    // Clear buffers
    //
    RtlZeroMemory(&Input, sizeof(Input));
    RtlZeroMemory(&Output, sizeof(Output));

    //
    // Issue a slow call with a single element
    //
    hcCall.InputDescriptor.AsUINT64 = HvCallGetVpIndexFromApicId;
    hcCall.InputDescriptor.CountOfElements = 1;
    hcCall.InputDescriptor.IsFast = 0;

    //
    // Request the VP Index for APIC ID 1
    //
    Input.PartitionId = HV_PARTITION_ID_SELF;
    Input.TargetVtl = 0;
    Input.ProcHwIds[0] = 1;

    //
    // Construct the request buffer
    //
    hcCall.InputSize = sizeof(Input);
    hcCall.OutputSize = sizeof(Output);
    hcCall.InputBuffer = &Input;
    hcCall.OutputBuffer = &Output;

    //
    // Issue the IOCTL to our bridge
    //
    bRes = DeviceIoControl(hFuzzer,
                           IOCTL_ISSUE_HYPER_CALL,
                           &hcCall,
                           sizeof(hcCall),
                           &hcCall,
                           sizeof(hcCall),
                           NULL,
                           NULL);
    if (bRes == FALSE)
    {
        //
        // The bridge failed in some way
        //
        dwError = GetLastError();
        printf("Bridge failed to issue call: %lx\n", dwError);
        goto Exit;
    }

    //
    // Bridge worked -- see what the hypervisor returned
    //
    hvStatus = hcCall.OutputDescriptor.CallStatus;
    if (hvStatus != HV_STATUS_SUCCESS)
    {
        //
        // The hypercall made it, but it failed for some reason
        //
        printf("Hypercall failure: %lx\n", hvStatus);
        dwError = RtlNtStatusToDosError(0xC0350000 | hvStatus);
        goto Exit;
    }

    //
    // Print the processor index and return 
    //
    printf("VP Index: %lx\n", Output);
    dwError = ERROR_SUCCESS;
Exit:
    return dwError;
}
```

## Conclusion

By now, you have hopefully gained an insight into how the elementary *hypercall* interface works in Windows, for regular (slow) calls that are either simple or repeated, and additional clarity on how to interface with kernel-mode drivers from user-mode through an *IOCTL* -based interface on top of *WDF* (although a *WDM* driver would behave identically in this particular case).

In part 3, we will continue this series by looking at *extended fast hypercalls*, which will require some careful understanding of stack layouts and memory alignments due to the use of *XMM* registers. I’ve asked [Azeria](https://azeria-labs.com/) to help me with one or two diagrams which should hopefully make things easier to visualize, thanks to her amazing graphic skills.
