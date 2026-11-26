---
title: AMSI Memory Patching Refrain
source: https://whiteknightlabs.com/2026/11/23/amsi-memory-patching-refrain/
source_host: whiteknightlabs.com
clip_date: 2026-11-26T14:09:53+08:00
trace_id: 5de0bfd8-30ba-4fb1-934f-d05ef32afba4
content_hash: 5d271d82806c67c2cb8799f6c8985f738d472a33b317a41ba98fd3e47e7112aa
status: synced
tags: []
series: null
feed_source: White Knight Labs·UEFI/红队
ai_summary: null
ai_summary_style: null
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 42475244-d011-81f9-8de3-f2c6760965ed
ioc: null
---

Much has been written about the Antimalware Scan Interface (AMSI) over the years in the cyber security industry. From a penetration testing perspective, AMSI is viewed as an impediment that needs to be overcome during offensive operations. Putting this aside for a moment, let’s start with defining exactly what AMSI is first.

## What is AMSI?

[AMSI](https://learn.microsoft.com/en-us/windows/win32/amsi/antimalware-scan-interface-portal) is Microsoft’s signature and behavioral analysis response to in-memory script object and.NET assembly execution threats. AMSI provides object scanning coverage for:

-   PowerShell since version 5.0
-   VBScript since Windows 10
-   Jscript since Windows 10
-   Office 2016+ macros
-   .NET Assemblies version 4.8 and above
-   Windows Management Instrumentation (WMI)

The architecture of AMSI is divided into two parts: the AMSI client implemented in the **amsi.dll** file, and the AMSI provider, which is Windows defender providing the signature matching and behavioral analysis components.

The AMSI client DLL has two functions that are called upon for scanning objects, **AmsiScanString()** and **AmsiScanBuffer()**. Ultimately, the string scanning function ends up just using the **AmsiScanBuffer()** function anyway, which means that all data flows through the **AmsiScanBuffer()** function in the DLL when scanning objects. There are two output indications from using this function. The first is the function return value itself, and the second is the result parameter. The buffer scanning function writes into a result parameter buffer one of [three values](https://learn.microsoft.com/en-us/windows/win32/api/amsi/ne-amsi-amsi_result):

-   **AMSI_RESULT_CLEAN (0x00 hex)** meaning no threat detected.
-   **AMSI_RESULT_NOT_DETECTED (0x01 hex)** again meaning no threat.
-   **AMSI_RESULT_DETECTED (0x8000 hex)** meaning malware has been detected.

The function return value is either going to be **S_OK**, which is a zero or some **HRESULT** (refer to MSDN for details) error code. A notable error code that can be returned, which we will address later in this blog is **E_INVALIDARG**, hexadecimal 0x80070057. How do we know if AMSI is enabled on a system? The easiest test and one that I personally love is to use PowerShell and just test a known evil string in a script or statement. The screenshot below shows my favorite test.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8089f9e3e07ab8b1.png)

There are many possibilities to effectively [bypass AMSI functionality](https://dev.to/cyberrscourse/amsi-bypass-techniques-the-complete-2026-developers-guide-4he), which include:

-   Memory patching
-   Script/object obfuscation
-   PowerShell scripted reflection bypass
-   Downgrade attacks
-   DLL hijacking
-   COM hijacking
-   Event Tracing for Windows (ETW) bypassing

Our focus in this blog is memory patching within the **amsi.dll** itself. Since the implementation of **amsi.dll** will change over time, the reader should note that this blog is based on research performed using the Windows installation as detailed in this table.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/443931d1e69fb56b.png)

## Memory (Machine Code) Patching

As already mentioned, the critical path with AMSI is the flow of data through the **AmsiScanBuffer()** function. What memory patching really represents is direct machine code patching once the **amsi.dll** is loaded. Using direct Win32 API calls, it is a simple recipe to:

1.  Load the **amsi.dll**
2.  Find the address of the **AmsiScanBuffer()** function
3.  Change memory protections to allow writing to some part of the function (Read/Write)
4.  Write a machine code patch
5.  Change the memory protections back to normal “Read/Execute”

Wait just a second though. If we do this, won’t we get caught by defenses? The answer to this question is maybe, because it depends on what defenses are installed on that system. In the context of installed EDR, there are ways you could get caught.

-   EDR might have installed user mode hooks on the use of **ntdll.dll** functions used to manipulate memory, the most common of which is: **NtProtectVirtualMemory()**. A very well-known EDR signature is the changing of any virtual memory page protections to Read/Write/Execute (RWX).
-   EDR is probably using Event Tracing for Windows (ETW) provider subscriptions to capture system telemetry.
-   Good EDRs also have a kernel driver component, which is probably subscribed to selected Windows kernel mode notifications.
-   During process creation, it is entirely feasible that EDR defensive solutions are scanning portions of memory pages of certain common DLLs, which may include **amsi.dll**.

There are methods to squelch telemetry feeds for EDRs, which include things like overwriting **ntdll.dll** hooks and patching ETW telemetry. There are also ways to perform direct or indirect system calls when leveraging **ntdll.dll** functions for memory protection and writing functions. For the purposes of this blog post, we are just going to focus on the in-memory AMSI patch itself in an x64 Windows architecture context.

In the [Intel/AMD 64-bit processor](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/x64-architecture), the **RAX** register is used to contain the return value for any function. When a function returns, it is executing the assembly instruction of “RET”, which is hexadecimal 0xc3.

The most obvious machine code patch in this case would be to search for the beginning of the **AmsiScanBuffer()** function and just write a single byte 0xc3 to that location. This seems very intuitive and might work, but there is one problem.  
  
When the function is called, we have no idea what the value of the **RAX** register is. A likely case is that **RAX** contains some other random value, and we just don’t know what the behavior will be of the PowerShell or other calling process that used the scan function. Why? Because some uses of **amsi.dll** might completely ignore the return code and purely focus on the “result” parameter (buffer) and some might take a return value other than the expected/defined codes as a real problem. The coolest thing, however, at this juncture is that we have options!

If we are patching at the very beginning of the function, we are in the context of the function prologue, which is focused on setting up the stack for this function variable/memory use, and then usually validating parameters. In other words, there are a lot of machine code opcodes between the start of the function and the subsequent function call into where the real signature or behavioral matching occurs. This implies that all we need to really care about here is the **RAX** (return code) value itself.

Here are some common [HRESULT](https://learn.microsoft.com/en-us/shows/inside/hresult) (return values) that we might consider putting into **RAX** before using our **RET** instruction.

-   **S_OK (0x00000000)**: Success
-   **S_FALSE (0x00000001)**: Success, but no results or data returned
-   **E_FAIL (0x80004005)**: Unspecified failure
-   **E_INVALIDARG (0x80070057)**: Invalid parameter or argument passed
-   **E_OUTOFMEMORY (0x8007000E)**: Out of memory
-   **E_ACCESSDENIED (0x80070005)**: Access denied / permissions issue
-   **E_NOTIMPL (0x80004001)**: Not implemented

Now we are getting into writing assembler code, albeit relatively simple assembler code. One of my favorite tools when I am researching a memory opcode patching technique is an online assembler by Taylor Hornby here at this URL: [https://defuse.ca/online-x86-assembler.htm](https://defuse.ca/online-x86-assembler.htm)

Using this really nice tool, we can enter the two assembler instructions we are interested in, **MOV RAX, 0** and **RET**, putting a zero in the RAX register and returning from the function, and have it assemble the exact byte sequence of opcodes we need.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/71bda88fa297450f.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2242a18ffba91e69.png)

If we are moving any value that is less than 32-bits a register, we also have the option to use different opcodes based on the bit-length of the register, giving us additional variability on opcode use. As we use smaller register opcodes, the arguments become progressively smaller, meaning we reduce the size of the byte patch.  
  
The more flexible variations we have to use for a machine code patch, the more likely we will be able to evade a signature match.  
  
For example:

-   **mov rax, 0** (64-bit register use)
    -   0x48, 0xc7, 0xc0, 0x00, 0x00, 0x00, 0x00 (7 bytes)
-   **mov eax, 0** (32-bit register use)
    -   0xb8, 0x00, 0x00, 0x00, 0x00 (5 bytes)
-   **mov ax, 0** (16-bit register use)
    -   0x66, 0xb8, 0x00, 0x00 (4 bytes)

For reference below is a diagram of the x64 processor architecture reminding us of the register layout.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cc5f35b476fb62b1.png)

The next thing you might wonder is how to test one of these bypass methods? All you need here is a process that loads **amsi.dll** and the use of a debugger, which can modify memory. In my case, to test bypasses, I used the latest PowerShell (pwsh) v7.x inside of Windows terminal, and Microsoft’s [WinDbg](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/getting-started-with-windbg) on a Windows 11 Pro system. As much as you might think it would be cool to break out some C, Go, Python, or Rust programming right now, you really don’t need to before working out what your patch is going to look like.  
  
The easiest way to launch is to use the **Launch Executable** option in WinDbg and navigate to the full pathname of the PowerShell exe file as shown here.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/78c66c28e6a5cd7f.png)

After launching, you immediately must hit the **Go** button or type the **g** command into the debugger so that PowerShell is fully launched and loads all the usual DLL/modules it needs. After this has occurred, you can use the **Break** button, which looks like a pause icon to break the running execution. Our first action is to look at the function prologue of the **AmsiScanBuffer()** function itself. In the debugging command Window, type **u amsi!AmsiScanBuffer** to disassemble the first few machine opcodes of this function.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe1fa17aae09c14e.png)

In the case of the screenshot above, the function is located at address **0x00007ffd85b58160**. Our next job is to attempt a patch by assembling machine code live inside the debugger!

Here are the steps:

1.  Click into the command box at the bottom and type the command for machine code assembly along with the memory address. Copy and paste works well here.  
      
    **a 00007ffd\`85b58160  
    **
2.  When you are in assembly mode in WinDbg, you can type the assembly code one line at a time, and then just hit enter a second time to exit from assembly mode.  
      
    0:001> **a 00007ffd\`85b58160  
    **Input> **mov eax, 0  
    **Input> **ret  
    **0:001>  
    
3.  Check your work by disassembling the code again!

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.03.20-AM-1024x406.png)

And there you have it, your very first machine code patch in a running process! Oh wait, the process is still paused in a break state, let’s just continue it by hitting the **Go** button or using the **g** command. Now just test your work and see what happens!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e4ff69dd57764ed9.png)

Look at the awesome hacking we are doing. PowerShell now does not see the string **“invoke-mimikatz”** as malicious. That’s fabulous, and thus we have just got our machine code hacker training wheels established.

Although we can use quite a lot of variability in the machine opcodes we use for this patch, we are actually doing something that can be detected quite easily by defensive software. The reason is that any memory scanners built into EDR products for example will scan the initial byte sequences of many critical functions (particularly in **ntdll.dll** and others) to see if any tampering has occurred. The EDR products do this by subscribing to kernel event notifications on process and thread startup. Having said this, memory scanning on process/thread startup is computationally expensive when you multiply the many hundreds of processes and threads that start and stop on any operating machine.

A better and potentially more evasive approach is to look much deeper into the function we are patching, gain an understanding in more depth about how the function works, and create a more sophisticated, light weight, patch. Disassembling the function in WinDbg shows an interesting set of tests and conditional branches just beyond the prologue. In the screenshot below, we can see that after each **TEST** or **CMP** instruction (which is a register or memory address comparison), there is a **JE** instruction, which means “jump if equal to”. We can observe that the destination of the **JE** instruction happens to be the same memory address in all the six cases, and that there happens to be six parameters to use this function according to MSDN documentation.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.05.27-AM-1024x431.png)

Looking at the destination of the **JE** instruction, we can see that the **RAX/EAX** register receives the value of 0x80070057 using a **MOV** instruction.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.06.03-AM-1024x131.png)

You might recall from the table above that this hexadecimal value corresponds to an invalid parameter error. Thus, we can confidently conclude that the sequence of instructions above is validating the correctness of the function parameters.

This analysis raises an opportunity for another bypass method. The x64 assembly **JMP** (short) instruction is a single byte opcode of “0xeb”; therefore, it becomes trivial to replace the **JE** instruction in one of six locations with a **JMP** instruction. The logic then becomes an unconditional **JMP** and the overall function will return a parameter error without writing anything into the result buffer as no actual scanning would have occurred assuming our analysis is correct.

As with our prior bypass attempt, we can validate this in WinDbg by taking the very first **JE** instruction opcode and replacing it with **JMP** using a direct byte entry command.

I followed this exact sequence in the screenshot below. The WinDbg command for replacing bytes in memory happens to be **eb** so don’t be confused that we entered the **eb** command with a memory address and then entered **eb** again to represent a **JMP** instruction. This just happens to be a coincidence! Repeating a disassembly command confirms that we now have an unconditional jump/branch entered correctly into the function.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.06.48-AM-1024x484.png)

In order to test, we can get into our PowerShell process and repeat the write-output command with the **invoke-mimikatz** string. If you want to confirm that the **JMP** is following the correct logic path, you can use the **bp** command in WinDbg to set a breakpoint at the 0x00007ffd85b581b0 address, hit the **Go** button, then use the write-output command and watch the debugging hit the breakpoint. After the breakpoint is hit, you can step through the instructions using the **t** command one at a time until the function hits its normal **RET** instruction.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.07.56-AM-1024x489.png)

If you do this, don’t be surprised when the PowerShell Window freezes as the breakpoint is hit! That’s completely normal. You can hit the **Go** button again to continue past a breakpoint; it is also possible that the breakpoint gets hit more than one time! For me, it was hit twice after I replaced the **JE** instruction with **JMP** and tried the PowerShell command. The screenshot below shows the before and after picture with my PowerShell test.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.08.35-AM-1024x301.png)

This is a pretty good solution overall. However, there are still more opportunities further down into the **AmsiScanBuffer()** function that we can consider. Think about either trying to avoid having the actual in depth buffer scanning function run, or alternatively if it does run, consider modifying the results to make things appear benign.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.09.14-AM-1024x158.png)

If we politely ask our favorite AI assisted search engines what **amsi!guard_dispatch_icall$thunk$10345483385596137414** represents, we find out that it is an indirect function call into the Microsoft Control Flow Guard (CFG) mechanism whereby the pointer to the actual function being called is expected to be contained in the **RAX** register. For the purposes of this research blog, we are going to steer clear of CFG for now but make the assumption that this particular indirect function call is where the actual AMSI buffer scanning is really taking place.

Our first task is to confirm this assumption. The most logical way to go about confirming this is to set a breakpoint right at the **JMP** instruction that follows this call and then examine the registers to see what comes back given both some benign and malicious input. We first need to make sure our earlier patch attempts are not in effect by restarting the debugging session.

We can also trace execution right up to the **RET** instruction and/or set another breakpoint at the **RET** instruction to examine memory and registers right before the **AmsiScanBuffer()** function returns. We care about the value of **RAX** (the return value), and the value of **RSP + 0x30**, which is the memory address where the result will be stored.

How do we know that the result will be stored in **RSP + 0x30**? The reason is that the function calling conventions for function arguments in the x64 processor and the Microsoft Windows operating system are defined as follows:

-   Argument #1 expected in register **RCX**
-   Argument #2 expected in register **RDX**
-   Argument #3 expected in register **R8**
-   Argument #4 expected in register **R9**
-   Any integer pointer arguments on the stack thereafter typically starting with:
    -   **RSP + 0x28**
    -   **RSP + 0x30**

The stack is expected to be 16-byte aligned, and the function caller is always expected to provide 32 bytes (0x20 hex) of shadow space for the first four arguments.

-   \[**RSP + 00h**\] Return address
-   \[**RSP + 08h**\] Shadow space for **RCX**
-   \[**RSP + 10h**\] Shadow space for **RDX**
-   \[**RSP + 18h**\] Shadow space for **R8**
-   \[**RSP + 20h**\] Shadow space for **R9**
-   \[**RSP + 28h**\] 5th argument
-   \[**RSP + 30h**\] 6th argument

In the screenshot below, we set a breakpoint right at the **RET** statement at the end of the function. We also set up a memory view looking at the stack. I use two statements in PowerShell, one to write-output “Hello Joff”, and the other to write-output “invoke-mimikatz”.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.11.08-AM-1024x524.png)

First, we trigger a malware/malicious response using our usual test string.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2dca596299d21ef7.png)

Then we calculate the position in the stack where we expect the sixth function parameter (the “result”) parameter to be stored. In the screenshot below, the value in the stack is **0x19f3f788**. Why is this not the actual result of the AMSI scan? Because it is a variable, which means it is a pointer to parent/caller stack frame!

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.12.28-AM-1024x554.png)

So now we examine the stack memory of parent/caller stack frame at this address, and we see the actual result of the AMSI scan as 0x8000. This corresponds to the value **AMSI_RESULT_DETECTED** meaning it is malicious which is exactly what we expected.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.13.42-AM-1024x446.png)

Then all we do is repeat the same exercise for the benign string of “Hello Joff”, and we get an AMSI result of 0x01, which means **AMSI_RESULT_NOT_DETECTED**. The stack addresses happen to be the same only because we are in the same debugging session. Looking at the **RAX** register in both sessions we see a function return value of 0x0 in both cases meaning the scan function itself was successfully executed and returned an **S_OK** HRESULT value.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2e9179e297247e28.png)

Wow that was fun! Now we have real questions to answer.

1.  Can we find a way between after the real CFG protected AMSI scan function runs and the **RET** opcode of this function to write 0x0 or 0x1 into that result stack variable in the parent/caller stack frame?
2.  Can we do it in a way that does not corrupt other machine code opcodes leaving the function to exit cleanly with proper stack management and alignment?

As I was personally approaching these particular questions, I decided that the most obvious target was the **JMP** instruction that exists right after the CFG AMSI function dispatch call as this function serves only to leap over the **MOV** instruction which places the invalid function arguments value in **RAX**. Between these two machine opcodes, we have a total of seven usable bytes.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.15.21-AM-1024x281.png)

The challenge thus becomes to write a 0x0 value into the correct parent/caller stack frame address using a maximum of seven bytes. We don’t care if we replace these two instructions because a return value of 0x80070057 (invalid function arguments) just does not matter but getting that result value written matters a lot!

Let’s just set a break point right at this address of 0x00007ffd85b58205 (the JMP instruction) and then see what the stack and registers look like when we hit this break. After triggering the break point with another PowerShell write-output command, we look at the registers and stack.

There are a few observations and an exciting discovery here:

1.  Our break point is hit before the stack is realigned for function exit.
2.  Stack realignment occurs using the effective address loaded from register r11, which is eventually moved to the stack pointer.
3.  The result value from the AMSI scan has already been written to the parent stack frame.
4.  The stack frame base pointer (RBP) happens to point at the exact address of the result variable memory in the parent stack frame.

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.16.24-AM-1024x638.png)

![](https://whiteknightlabs.com/wp-content/uploads/2026/11/Screenshot-2026-11-20-at-10.16.52-AM-1024x404.png)

The conclusion is that we can write an effective bypass by just writing a zero value to the stack base pointer (RBP) address if we do this in only seven bytes. Let’s go back to our online assembler.  
  
The assembly code we need is “MOV QWORD POINTER RBP, 0x0”. Once assembled, we get a resulting byte sequence of eight bytes.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5b6eff481b480e6a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/48387613a7b36dd4.png)

Ok, we used a quad word form of the **MOV** instruction which is a full 64-bit unsigned integer value. However, we are only storing a zero and it does not have to be expressed as a quad word. So, let’s try “MOV DWORD PTR \[rbp\], 0x0”.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/965644b3f5abe30a.png)

Exactly seven bytes! We have a winner! We can move forward with WinDbg and try our proposed solution. We very carefully type in the individual hexadecimal values using the **eb** function, and then disassemble to confirm afterwards, as seen below.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/633bbfb6fa6b23c9.png)

Eureka! We have patched replacing both the **JMP** and the **MOV** instruction while not corrupting the stack frame reconstruction for the function to exit properly. Of course, we have to test again with our usual fun testing string.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/42fdeaa2147063af.png)

With that achieved, we can now conclude this blog post. In the next blog of this series, I will talk about how to implement these ideas in the C programming language, followed by the same implementation in the Rust programming language.
