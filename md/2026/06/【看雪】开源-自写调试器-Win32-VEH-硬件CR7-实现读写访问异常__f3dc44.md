---
title: 【看雪】开源-自写调试器 Win32 VEH 硬件CR7 实现读写访问异常
source: https://bbs.kanxue.com/thread-291741.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-22T02:15:31+08:00
trace_id: 63fa7321-c3f1-460a-9b83-157eb02bc91b
content_hash: 0653ff5c595765ceea41054feeff45958bd9c74bd5c85606e47dbac0cd000865
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过VEH和硬件调试寄存器DR7实现对内存地址读写访问的断点监控，用于调试和逆向工程中的异常捕获。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38675244-d011-819e-aa24-ee17cc9484cc
---

> 💡 **AI 总结（key-points）**
>
> 通过VEH和硬件调试寄存器DR7实现对内存地址读写访问的断点监控，用于调试和逆向工程中的异常捕获。
> 
> - **VEH注册优先级：** 使用 `AddVectoredExceptionHandler` 注册最高优先级的向量化异常处理程序，确保在异常发生时首先捕获单步异常。
> - **硬件断点配置：** 通过设置调试寄存器DR0-DR3和DR7，支持Execute、Write、Access三种断点类型，以及1、2、4、8字节的监控大小。
> - **异常处理流程：** VEH处理程序检查DR6状态判断断点命中，记录命中信息后临时禁用所有断点并设置TF标志进行单步执行，之后恢复断点以避免干扰。
> - **示例验证效果：** 测试代码演示了设置写入断点监控变量、触发写入时断点命中、以及移除断点后不再触发的完整流程，验证了实现的可行性。

```cc

// =====================================================
// DR7 编码工具
// =====================================================
enum class HwBpType : BYTE {
    Execute = 0,   // R/W = 00
    Write = 1,   // R/W = 01
    Access = 3    // R/W = 11 (读写)
};
enum class HwBpSize : BYTE {
    Size1 = 0,     // LEN = 00 → 1 字节
    Size2 = 1,     // LEN = 01 → 2 字节
    Size4 = 3,     // LEN = 11 → 4 字节
    Size8 = 2      // LEN = 10 → 8 字节 (x64)
};
// =====================================================
// VEH Handler
// =====================================================
struct BpRecord {
    DWORD_PTR address;
    DWORD_PTR rip;
    DWORD     drIndex;
    bool      hit;
};
static volatile BpRecord g_lastHit = {};
static volatile int g_stepping = 0;
static volatile DWORD_PTR g_savedDR7 = 0;
LONG CALLBACK HwBpVEH(EXCEPTION_POINTERS* ep) {
    PCONTEXT ctx = ep->ContextRecord;
    if (ep->ExceptionRecord->ExceptionCode != STATUS_SINGLE_STEP)
        return EXCEPTION_CONTINUE_SEARCH;
    if (g_stepping == 0) {
        // ========== 断点命中 ==========
        DWORD dr6 = (DWORD)ctx->Dr6;
        DWORD drIndex = 0xFFFF;
        if (dr6 & 0x1) drIndex = 0;
        else if (dr6 & 0x2) drIndex = 1;
        else if (dr6 & 0x4) drIndex = 2;
        else if (dr6 & 0x8) drIndex = 3;
        else return EXCEPTION_CONTINUE_SEARCH; // 不是我们的断点
        // 记录命中信息
        g_lastHit.rip = ctx->Rip;
        g_lastHit.drIndex = drIndex;
        g_lastHit.hit = true;
        switch (drIndex) {
        case 0: g_lastHit.address = ctx->Dr0; break;
        case 1: g_lastHit.address = ctx->Dr1; break;
        case 2: g_lastHit.address = ctx->Dr2; break;
        case 3: g_lastHit.address = ctx->Dr3; break;
        }
        printf("[!] DR%d HIT | RIP: 0x%p | Watched Addr: 0x%p\n",
            drIndex, (void*)ctx->Rip, (void*)g_lastHit.address);
        // 临时禁用所有断点，设 TF 单步跳过当前指令
        g_savedDR7 = ctx->Dr7;
        ctx->Dr7 = 0;
        ctx->EFlags |= 0x100;  // TF = 1
        ctx->Dr6 = 0;
        g_stepping = 1;
        return EXCEPTION_CONTINUE_EXECUTION;
    }
    else {
        // ========== TF 单步完成，恢复断点 ==========
        ctx->Dr7 = g_savedDR7;
        ctx->Dr6 = 0;
        g_stepping = 0;
        return EXCEPTION_CONTINUE_EXECUTION;
    }
}
// =====================================================
// 对当前线程设置硬件断点
// =====================================================
bool SetHardwareBreakpoint(
    DWORD     drIndex,   // 0~3
    void* address,   // 监控地址
    HwBpType  type,      // Execute / Write / Access
    HwBpSize  size       // 1/2/4/8 字节
) {
    if (drIndex > 3) return false;
    CONTEXT ctx = {};
    ctx.ContextFlags = CONTEXT_DEBUG_REGISTERS;
    HANDLE hThread = ntid();
    // 使用你的 nt 封装
    NTSTATUS status = ntGetContextThread(hThread, &ctx);
    if (status != 0) {
        printf("[-] ntGetContextThread failed: 0x%08X\n", status);
        return false;
    }
    // 写入目标地址到 DRn
    switch (drIndex) {
    case 0: ctx.Dr0 = (DWORD_PTR)address; break;
    case 1: ctx.Dr1 = (DWORD_PTR)address; break;
    case 2: ctx.Dr2 = (DWORD_PTR)address; break;
    case 3: ctx.Dr3 = (DWORD_PTR)address; break;
    }
    // 清除该 DR 在 DR7 中的旧配置
    // 每个 DR 占：L位(1bit) + G位(1bit) + 条件(2bit) + 长度(2bit)
    // Ln 在 bit 2*n, Gn 在 bit 2*n+1
    // R/Wn 在 bit 16 + 4*n (2bits)
    // LENn 在 bit 18 + 4*n (2bits)
    DWORD_PTR clearMask = 0;
    clearMask |= (DWORD_PTR)0x3 << (drIndex * 2);       // 清 Ln, Gn
    clearMask |= (DWORD_PTR)0xF << (16 + drIndex * 4);  // 清 R/W, LEN
    ctx.Dr7 &= ~clearMask;
    // 设置新配置
    ctx.Dr7 |= (DWORD_PTR)1 << (drIndex * 2);                          // Ln = 1 (局部启用)
    ctx.Dr7 |= (DWORD_PTR)((BYTE)type) << (16 + drIndex * 4);          // R/W
    ctx.Dr7 |= (DWORD_PTR)((BYTE)size) << (18 + drIndex * 4);          // LEN
    // 写回
    status = ntSetContextThread(hThread, &ctx);
    if (status != 0) {
        printf("[-] ntSetContextThread failed: 0x%08X\n", status);
        return false;
    }
    printf("[+] DR%d set | Addr: 0x%p | Type: %d | Size: %d\n",
        drIndex, address, (int)type, (int)size);
    return true;
}
// =====================================================
// 移除硬件断点
// =====================================================
bool RemoveHardwareBreakpoint(DWORD drIndex) {
    if (drIndex > 3) return false;
    CONTEXT ctx = {};
    ctx.ContextFlags = CONTEXT_DEBUG_REGISTERS;
    HANDLE hThread = ntid();
    ntGetContextThread(hThread, &ctx);
    // 清地址
    switch (drIndex) {
    case 0: ctx.Dr0 = 0; break;
    case 1: ctx.Dr1 = 0; break;
    case 2: ctx.Dr2 = 0; break;
    case 3: ctx.Dr3 = 0; break;
    }
    // 清 DR7 配置
    DWORD_PTR clearMask = 0;
    clearMask |= (DWORD_PTR)0x3 << (drIndex * 2);
    clearMask |= (DWORD_PTR)0xF << (16 + drIndex * 4);
    ctx.Dr7 &= ~clearMask;
    ctx.Dr6 = 0;
    ntSetContextThread(hThread, &ctx);
    printf("[+] DR%d removed\n", drIndex);
    return true;
}
// =====================================================
// 使用示例
// =====================================================
volatile DWORD g_testValue = 0xDEAD;
int test() {
    // 1. 注册 VEH（最高优先级）
    PVOID veh = rtlAddVectoredExceptionHandler(1, HwBpVEH);
    if (!veh) {
        printf("[-] AddVectoredExceptionHandler failed\n");
        return 1;
    }
    printf("[*] VEH registered\n");
    // 2. 在 DR0 上设置写入断点，监控 g_testValue
    SetHardwareBreakpoint(
        0,                              // DR0
        (void*)&g_testValue,            // 监控地址
        HwBpType::Write,                // 写入触发
        HwBpSize::Size4                 // 4 字节
    );
    // 3. 触发断点
    printf("\n[*] Writing 0xBEEF...\n");
    g_testValue = 0xBEEF;
    printf("[*] Value after write: 0x%X\n", g_testValue);
    printf("\n[*] Writing 0xCAFE...\n");
    g_testValue = 0xCAFE;
    printf("[*] Value after write: 0x%X\n", g_testValue);
    printf("\n[*] Writing 0x1337...\n");
    g_testValue = 0x1337;
    printf("[*] Value after write: 0x%X\n", g_testValue);
    // 4. 移除断点
    RemoveHardwareBreakpoint(0);
    // 5. 不再触发
    printf("\n[*] Writing after removal...\n");
    g_testValue = 0x9999;
    printf("[*] No hit. Value: 0x%X\n", g_testValue);
    // 6. 清理
    rtlRemoveVectoredExceptionHandler(veh);
    printf("\n[*] Done.\n");
    return 0;
}
```

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#软件保护](https://bbs.kanxue.com/forum-4-1-3.htm) [#VM保护](https://bbs.kanxue.com/forum-4-1-4.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm) [#病毒木马](https://bbs.kanxue.com/forum-4-1-6.htm) [#其他内容](https://bbs.kanxue.com/forum-4-1-10.htm)
