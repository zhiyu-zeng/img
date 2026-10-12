---
title: 【看雪】WinAFL 实战：从 0 到 crash
source: https://bbs.kanxue.com/thread-293205.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-12T23:06:59+08:00
trace_id: 7d841c0a-fdcc-4578-8dfe-7443ffcd9d7c
content_hash: 222c74ba5f941d691a5d178dd17e2c9143fa2a4f29c1f3b0fb38a0723847a473
status: synced
tags:
  - 看雪
  - 漏洞分析
  - Windows逆向
series: null
feed_source: 看雪·二进制漏洞
ai_summary: 在 Win10 虚拟机中用 WinAFL+DynamoRIO 对 test_gdiplus.exe 做持久化 fuzz，并用 WinDbg 判定两类 crash 的可利用性。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3f775244-d011-815d-9b45-ee08ae449a72
ioc:
  cves: []
  cwes:
    - CWE-121
    - CWE-476
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 在 Win10 虚拟机中用 WinAFL+DynamoRIO 对 test_gdiplus.exe 做持久化 fuzz，并用 WinDbg 判定两类 crash 的可利用性。
> 
> - **环境与编译：** 必须在 VS 原生工具命令行中 cmake，`-DDynamoRIO_DIR` 指向 DynamoRIO 解压目录下的 cmake 子目录；目标偏移须自算（main VA `0x140001070` − ImageBase `0x140000000` = `0x1070`），官方 README 的 0x16e0 不可照抄。
> - **目标函数四条件：** 需在函数内部完成打开、解析、关闭输入文件并正常返回；避免选 Image 构造函数（this 依赖调用者）和 CRT 库函数。
> - **冒烟测试：** `drrun -c winafl.dll -debug` 下检查 pre/post_fuzz_handler 各出现 10 次、日志无 Exception、末尾输出 running normally，才可正式 fuzz。
> - **结果：** test_gdiplus 跑约 3 小时、91 万次、220 条路径、0 crash（成熟系统组件）；test.exe 缺陷离种子仅一字节，很快产出 2 个 crash，但内容均为 test1，实为同一空指针写——unique crash ≠ unique bug。
> - **定级四类：** 空指针解引用 ＜ 栈 cookie 校验失败 ＜ 越界写 ＜ 可控覆写；可控性靠逐参数追问"攻击者能否决定"。test2 的栈溢出链为 strcat 越界读 → 异常展开经过 test_target 栈帧 → cookie 校验失败 → `int 29h`，归第②类。

本文记录一次完整的 WinAFL 模糊测试流程：从源码编译 WinAFL，到用 IDA 选取目标函数、计算偏移，再到正式 fuzz，最后用 WinDbg 分析两个不同类型的 crash。整个过程在 Win10 虚拟机中执行，宿主机的 VS2026 负责编译。

**环境准备**：VMware + Win10 虚拟机（1909）、VS2026（宿主机，用于编译）、DynamoRIO、IDA Pro、WinDbg。

## 1\. 下载 WinAFL 源码

GitHub 仓库：https://github.com/googleprojectzero/winafl ，Code → Download ZIP 下载源码。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/879f1f7a37871616.webp)

## 2\. 下载 DynamoRIO

WinAFL 默认使用 DynamoRIO 做动态二进制插桩，需要单独下载。

解压到工作目录，与 winafl-master 并列。

## 3\. 编译 WinAFL

在「x64 Native Tools Command Prompt for VS 2026」中逐行执行（普通 cmd 没有编译器环境，必须用 VS 自带的命令行）：

```python
cd /d C:\Users\Lenovo\Desktop\winafl-master\winafl-master
rmdir /s /q build64
mkdir build64
cd build64
cmake -G"Visual Studio 18 2026" -A x64 .. -DDynamoRIO_DIR=C:\Users\Lenovo\Desktop\winafl-master\DynamoRIO\DynamoRIO-Windows-11.91.20735\cmake
cmake --build . --config Release
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/84d3ab2442082bcc.webp)

说明：

-   第二行 `rmdir /s /q build64` 是清理旧构建目录，避免链接到旧版 DynamoRIO；提示不存在则忽略
-   `-DDynamoRIO_DIR` 指向 DynamoRIO 解压目录下的 `cmake` 子目录
-   配置成功的标志是结尾输出 `Configuring done` + `Generating done` ；编译成功的标志是 `build64\bin\Release\` 下生成 `afl-fuzz.exe` 、 `winafl.dll` 等文件
-   编译中的 C4311/C4312 警告是 WinAFL 源码自身的指针截断警告；LNK4281 基址提示是 DynamoRIO 客户端要求固定基址，均不影响使用
-   如果使用 VS2019，把生成器改成 README 中的 `"Visual Studio 16 2019"` 即可

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/61eea8ae8c779a8f.webp)

## 4\. 准备虚拟机与目标程序

把整个 winafl-master 目录复制到 Win10 虚拟机中（包含编译产物、DynamoRIO、官方测试用例）。

本次第一个目标是 WinAFL 官方提供的 `test_gdiplus.exe` （位于 `build64\bin\Release\` ），它调用系统 GDI+ 组件解析图片文件。先验证 DynamoRIO 在虚拟机里工作正常：

```python
C:\...\DynamoRIO-Windows-11.91.20735\bin64\drrun.exe -- C:\...\Release\test_gdiplus.exe C:\...\testcases\images\bmp\sample.bmp
```

程序正常结束、无 DynamoRIO 报错输出，即说明插桩环境可用。

## 5\. IDA 选取目标函数并计算偏移

fuzz 闭源程序前，必须先选定一个"目标函数"：WinAFL 会拦截在这个函数上，每次迭代重写输入文件后把执行流跳回函数开头，在一个进程内循环执行，避免反复重启程序。目标函数需要满足四个条件：

-   打开输入文件（必须在函数内部打开，否则读不到每轮重写后的新内容）
-   解析它（覆盖率才能反映解析行为）
-   关闭输入文件（否则 WinAFL 无法在迭代间重写它）
-   正常返回（WinAFL 依靠函数返回来捕获控制流；若函数直接退出进程，持久化 fuzzing 就失效）

**定位方法**：无参数运行 test_gdiplus.exe 会打印 `Usage: test_gdiplus.exe <image file>` ，在 IDA 的字符串窗口（Shift+F12）中搜到该字符串，顺交叉引用找到所在函数 `sub_140001070` （即 main）。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/158becc5794cabc1.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c8cefe8771e01e67.webp)

反编译后分析 main 的流程：

-   `GdiplusStartup` ：初始化 GDI+ 库
-   `sub_1400012F0` ： `operator new(24)` ，分配一个 Gdiplus::Image 对象
-   `sub_140001240` ：Image 的构造函数，内部调用 `GdipLoadImageFromFile` 加载并解析图片文件

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/da5d08794487e3c1.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b96541f794599df2.webp)

-   `sub_140001410` ： `Image::GetLastStatus` ，读取解析状态
-   虚调用：析构 Image 对象，释放资源
-   `GdiplusShutdown` 后 `return 0`

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/65137a7a930ccbbe.webp)

main 完成了「打开文件 → 解析 → 关闭 → 正常返回」的完整过程，四个条件全部满足，选定为目标函数。

**注意两个容易选错的层**：一是 `sub_140001240` （Image 构造函数）——它的第一个参数是 this 指针，依赖 main 先分配对象，直接 fuzz 它会把垃圾值当 this 用，崩溃毫无意义；二是 CRT 库函数（如 fread、printf 内部函数）——它们只操作控制台/文件句柄等基础设施，与输入文件的解析逻辑无关，目标函数必须是处理输入文件的业务代码。

**计算偏移**：main 的虚拟地址 VA = `0x140001070` ，64 位 exe 默认 ImageBase = `0x140000000` ，所以：

```python
target_offset = VA - ImageBase = 0x140001070 - 0x140000000 = 0x1070
```

注意：WinAFL README 示例中的偏移（0x16e0）是官方旧版本编译产物，自己编译的版本布局不同，偏移必须自己算，不能照抄。

## 6\. 冒烟测试（验证参数）

正式 fuzz 前，先用 drrun 的 debug 模式验证 offset 和参数是否正确。模板：

```python
drrun.exe -c winafl.dll -debug -coverage_module 【解析代码所在模块】 -target_module 【目标函数所在模块】 -target_offset 【函数偏移】 -fuzz_iterations 10 -nargs 【函数参数个数】 -- 【目标程序路径】 【一个正常输入文件】
```

各段含义：

**`drrun.exe -c winafl.dll`**：drrun 是 DynamoRIO 的启动器，负责启动目标程序并在运行时进行动态二进制插桩； `-c winafl.dll` 加载 WinAFL 的客户端模块，由它记录覆盖率、控制持久化循环、与 afl-fuzz 通信。之后的参数全部传给 winafl.dll。

**winafl.dll 的参数**：

-   `-debug` ：调试模式。不连接 fuzzer，在本地把目标函数循环执行指定次数并输出详细日志，用于验证参数
-   `-coverage_module` ：覆盖率统计在哪些模块上。test_gdiplus 的解析代码在系统 DLL 里，所以填 `gdiplus.dll` 和 `WindowsCodecs.dll` ；可写多个
-   `-target_module` / `-target_offset` ：目标函数所在模块及偏移
-   `-fuzz_iterations 10` ：循环 10 次后退出（冒烟测试求快；正式 fuzz 给几千）
-   `-nargs 2` ：目标函数的参数个数（main 的 argc、argv），winafl 每轮按此恢复参数

**`--` 之后**：目标程序的启动命令。 `--` 是分隔符，之后的内容原样传给目标程序。

实际执行：

```python
cd /d C:\Users\Lenovo\Desktop\winafl-master\winafl-master\build64\bin\Release
C:\Users\Lenovo\Desktop\winafl-master\DynamoRIO\DynamoRIO-Windows-11.91.20735\bin64\drrun.exe -c winafl.dll -debug -coverage_module gdiplus.dll -coverage_module WindowsCodecs.dll -target_module test_gdiplus.exe -target_offset 0x1070 -fuzz_iterations 10 -nargs 2 -- test_gdiplus.exe C:\Users\Lenovo\Desktop\winafl-master\winafl-master\testcases\images\bmp\sample.bmp
```

运行后在当前目录生成 `afl.test_gdiplus.*.log` 日志文件：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7cb7679ac0c6d50d.webp)

检查三项：

-   `pre_fuzz_handler` 和 `post_fuzz_handler` 各出现 10 次（对应 10 次迭代，说明函数被准确拦截并循环）
-   日志中没有 `Exception`
-   末尾输出 `Everything appears to be running normally`

三项全部满足，说明 offset、模块、参数全部正确，可以正式 fuzz。

## 7\. 正式 fuzz（test_gdiplus）

在虚拟机中建立种子目录并启动 afl-fuzz：

```python
mkdir in
copy C:\...\testcases\images\bmp\sample.bmp in\
```

也可以手动添加几张不同的.bmp/.jpg/.png 作为种子。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5afe6996508ac4cc.webp)

正式 fuzz 命令模板：

```python
afl-fuzz.exe -i 【种子目录】 -o 【输出目录】 -t 【超时毫秒】 -D 【DynamoRIO的bin64或bin32目录】 -- -coverage_module 【同上】 -target_module 【同上】 -target_offset 【同上】 -fuzz_iterations 【500~5000】 -nargs 【同上】 -- 【目标程序路径】 @@
```

实际命令：

```python
afl-fuzz.exe -i in -o out -t 20000 -D C:\...\DynamoRIO-Windows-11.91.20735\bin64 -- -coverage_module gdiplus.dll -coverage_module WindowsCodecs.dll -target_module test_gdiplus.exe -target_offset 0x1070 -fuzz_iterations 1000 -nargs 2 -- test_gdiplus.exe @@
```

`@@` 是占位符，每轮迭代会被替换成当前测试文件的路径。

**运行结果**：持续运行约 3 小时，执行约 91 万次，发现 220 条路径，未出现 crash。

这个结果在预期之内：GDI+ 是存在近二十年的系统组件，支持 BMP/JPEG/PNG/GIF/TIFF 等多种格式解析，历史上漏洞多发，也因此被微软和安全研究者长期 fuzz，BMP 这类成熟路径上容易触发的漏洞已基本修复。crash 不是预设结果，只有变异恰好命中程序缺陷才会产生。选目标时应评估其被 fuzz 的程度：成熟系统组件适合练流程，出洞更可能发生在冷门软件的解析代码上。

**两个实用提醒**：

-   cmd 窗口的"快速编辑模式"下，鼠标点击窗口会进入选择模式并 **冻结程序输出** （标题栏出现"选择"字样），按 Esc 恢复；可在窗口属性中关闭快速编辑模式
-   锁屏不影响 fuzzing，但宿主机睡眠会暂停虚拟机，长时间运行前检查电源设置

输出目录结构：

-   `crashes/` ：导致崩溃的输入文件
-   `queue/` ：触发了新覆盖率的测试用例（fuzzer 的"种子库"）
-   `hangs/` ：导致程序超时的输入文件

## 8\. 使用 test.exe 获取 crash 样本

为了演示 crash 分析，改用 WinAFL 自带的 `test.exe` （同样位于 Release 目录）。它内部检查输入文件的字符：前 4 字节为 "test" 时，第 5 字节为 '1' 触发空指针写，为 '2' 触发栈缓冲区溢出。

建立种子并启动 fuzz：

```python
mkdir in2
echo test0 > in2\seed.txt
afl-fuzz.exe -i in2 -o out2 -t 10000 -D C:\...\bin64 -- -coverage_module test.exe -target_module test.exe -target_offset 0x1000 -fuzz_iterations 1000 -nargs 2 -- test.exe @@
```

由于缺陷离种子仅一个字节，fuzzer 开始运行后很快产生 2 个 crash。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c64cf5e6a84ef0c9.webp)

检查 `out2\crashes\` 中的两个文件，内容均以 "test1" 开头——两个文件第 5 字节都是 '1'，实际触发的是同一个空指针写缺陷。这里需要注意： **unique crash 不等于 unique bug**，fuzzer 按崩溃上下文去重，同一个缺陷经由不同输入触发可能被保存为多份，最终去重仍需人工核对。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e8661db9c342e67d.webp)

## 9\. WinDbg 分析 crash 1：空指针写

将 crash 文件与 test.exe 复制到宿主机，用 WinDbg 打开（File → Open Executable，Arguments 填 crash 文件路径）：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8cf952d1a781db4f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c019b9afa59a3721.webp)

首次输出的报告中包含大量符号加载报错（ `WRONG_SYMBOLS` 、 `not a valid store` 等），原因是 WinDbg 符号路径配置错误，无法从微软符号服务器下载符号。这些报错不影响崩溃本身的信息，也可以通过以下命令修复后重新分析：

```python
.symfix
.reload
```

报告中需要关注的内容只有两处。

**崩溃指令** （断下时显示的指令）：

```python
mov byte ptr [rcx+rax], 1    ds:00000000`00000000=??
```

当前指令向 `rcx+rax` 指向的地址写入字节 1，而该地址计算结果为 `0x0` 。用 `r rcx` 、 `r rax` 查看，两个寄存器均为 0：

```python
0:000> r rcx
rcx=0000000000000000
0:000> r rax
rax=0000000000000000
```

**EXCEPTION_RECORD 段**：

```python
ExceptionAddress: test+0x124a
ExceptionCode: c0000005 (Access violation)
Attempt to write to address 0000000000000000
```

结论： `test+0x124a` 位于目标函数 test_target（0x1000 起始）内部，对应源码 `if (c == '1') { crash[0] = 1; }` —— `crash` 为 nullptr，输入第 5 字节为 '1' 即进入该分支向空指针写入。

**crash 的四种常见类型** （按可利用性从低到高）：

1.  **空指针解引用（NULL dereference，CWE-476）**：向地址 0 附近读写，地址和值均不可控，只能造成拒绝服务
2.  **栈 cookie 校验失败（/GS）**：栈溢出真实发生，但被编译器插入的 cookie 检查拦截，在函数返回前主动终止程序；溢出客观存在，上报厂商仍算漏洞
3.  **越界写（OOB write）**：写入越过缓冲区边界，覆盖相邻的合法内存（堆相邻块、栈上其他变量），可能破坏数据和指针，存在利用空间
4.  **可控覆写**：输入数据覆盖了返回地址或函数指针，执行流可被劫持，是 fuzzing 最希望得到的结果

**可控性的判断方法是逐参数追问"这个值攻击者能不能决定"**：本例中写入地址固定为 0、写入值为指令中的立即数 1，输入只能决定是否进入该分支，不能决定写入的内容和位置。因此定级为 **第①类，空指针解引用**，仅造成拒绝服务。

## 10\. WinDbg 分析 crash 2：栈缓冲区溢出

构造内容为 `test2` 的输入文件（第 5 字节为 '2' 即触发溢出分支），同样用 WinDbg 加载运行。

**第一阶段（first chance）**：程序先断在访问违例：

```python
test+0x17f4b:
mov al, byte ptr [rdx]
```

`!analyze -v` 的 FAILURE_BUCKET_ID 为 `INVALID_POINTER_READ_c0000005` ，即无效指针读。查看 STACK_TEXT（此时符号已修复，显示正常）：

```python
000000a4`8c19fdd8 00007ff6`6efe1295 : test+0x17f4b
000000a4`8c19fde0 6578652e`74736574 : test+0x1295
000000a4`8c19fe40 73726573`555c3a43 : 0x6578652e`74736574
...
```

STACK_TEXT 是 WinDbg `kb` 输出，x64 下各列含义为：Child-SP（栈指针）、RetAddr（返回地址）、Args to Child（参数）、Call Site（当前帧所在函数）。其中 RetAddr 指向调用者，Call Site 是当前函数，因此从"Call Site = B、RetAddr = A+xxx"可知 **A 调用了 B**；WinDbg 默认从上到下为"最内层 → 最外层"， **从下往上读即时间顺序**。

可以看到两层信息：

-   `test+0x1295` （位于 test_target 内）调用了 `test+0x17f4b` （CRT 的 strcat/strlen 实现），即 strcat 溢出后越界读取的崩溃点
-   栈上 `6578652e'74736574` 、 `73726573'555c3a43` 、 `5c6f766f'6e654c5c` 等值，按 ASCII 解读为 "test.exe"、"C:\\Users"、"\\Lenovo"—— **返回地址区域被 "C:\\Users\\Lenovo\\Desktop\\test.exe" 覆盖**，这是 strcat 将 argv_0 反复写入 5 字节栈缓冲区造成的栈破坏的直接证据

**第二阶段**：继续 `g` ，程序断在另一个异常：

```python
(2dc8.93bc): Security check failure or stack buffer overrun - code c0000409 (!!! second chance !!!)
Subcode: 0x2 FAST_FAIL_STACK_COOKIE_CHECK_FAILURE
test+0x1475:
int     29h
```

再次 `!analyze -v` ，报告开头的 Key 值直接给出结论：

```python
FailFast.Name : STACK_COOKIE_CHECK_FAILURE
FailFast.Type : 2
```

EXCEPTION_RECORD：

```python
ExceptionAddress: test+0x1475
ExceptionCode:    c0000409 (Security check failure)
Parameter[0]:     2 → Subcode: FAST_FAIL_STACK_COOKIE_CHECK_FAILURE
```

`int 29h` 是 Windows 的快速失败指令：编译器插入的 cookie 检查函数发现金丝雀值被覆盖后，通过 `__fastfail` 立即终止进程，阻止溢出被进一步利用。

从下往上读这次的 STACK_TEXT，完整时间线为：

```python
test+0x1295  →  test+0x17f4b           test_target 调 strcat，越界读异常
ntdll!KiUserExceptionDispatch          系统开始派发第一次异常
ntdll!RtlDispatchException
ntdll!RtlpExecuteHandlerForException
test+0x1493  →  test+0x1475 (int 29h)  异常展开经过 test_target 栈帧时执行
                                       cookie 检查，发现被覆盖，立即 fast fail
```

即： **strcat 溢出 → 越界读异常 → 异常处理经过 test_target 栈帧 → cookie 检查失败 → int 29h 终止**。两次断下不是两个独立事件，是同一条链。

FAILURE_BUCKET_ID 给出官方定性： `FAIL_FAST_STACK_BUFFER_OVERRUN_STACK_COOKIE_CHECK_FAILURE` 。

**定级**：栈缓冲区溢出（CWE-121），对应第②类——溢出客观存在，被 /GS 栈保护机制拦截。本例中溢出内容为程序路径 argv_0，非输入可控，不可利用，但漏洞类型成立。注意崩溃表现与编译选项相关：同一缺陷在不同构建中可能表现为越界读、cookie 拦截或两者先后出现，分析时以现场为准。
