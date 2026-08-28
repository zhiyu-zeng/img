---
title: 【看雪】某货的frida反调试绕过
source: https://bbs.kanxue.com/thread-292800.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-28T20:06:28+08:00
trace_id: 3a50860d-e007-4e17-a20a-a088cbffb823
content_hash: 5e9505d0eedcbcae6eec1ae77b1426dcd3dfd7b62b4d2279b31c644dd14a91bf
status: synced
tags:
  - 看雪
  - Android逆向
  - 反调试
series: null
feed_source: 看雪·逆向工程
ai_summary: 识货 App 的 frida 反调试可稳定绕过：在 libmsaoaidsec.so 的 .init_proc 刚执行时，用 RET 补丁打掉 3 个检测线程和 6 个自杀执行点，最小侵入、不闪退。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ca75244-d011-819f-877a-d2ed5e6d96cd
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 识货 App 的 frida 反调试可稳定绕过：在 libmsaoaidsec.so 的 .init_proc 刚执行时，用 RET 补丁打掉 3 个检测线程和 6 个自杀执行点，最小侵入、不闪退。
> 
> - **检测来源：** 目标为识货 7.73.0（com.hupu.shihuo），检测逻辑在娜迦壳加载的 `libmsaoaidsec.so` 中，frida 注入后 App 随机闪退。
> - **定位凶手：** 先 hook `android_dlopen_ext` 观察 so 加载顺序，确认加载该 so 后 frida 会话断裂；再 hook `JNI_OnLoad` 未触发，证明检测发生在 `.init_proc` / `.init_array` 阶段。
> - **最早时机：** 通过 hook `__system_property_get`，当其参数为 `ro.build.version.sdk` 时，说明 `.init_proc` 刚开始执行，此时检测线程尚未创建，是可行注入点。
> - **检测机制：** IDA 静态分析发现控制流平坦化混淆的 so 内有 3 个检测线程——查 `TracerPid` 与父进程、扫 `/proc/self/task` 找 `gum-js-loop`/`gmain`、扫 maps/fd 找 frida 特征，以及 6 个自杀/退出执行点（含 `mmap` 写 `exit_group(0)` shellcode）。
> - **绕过方案：** 用 `Memory.patchCode` 在早期时机把 3 个检测线程体和 6 个自杀函数开头改为 aarch64 RET（`C0 03 5F D6`）；相比 `Interceptor.replace` 可避免 linker 死锁，并带 `/proc/self/maps` 兜底轮询，9 处打补丁后 App 正常进主页且业务 hook 不闪退。

> 一份给初学者的完整记录：从"frida 一注入就被杀"到"稳定绕过"。  
> 最终采用 **最早时机 + RET 补丁** 方案，最小侵入、稳定不闪退。

* * *

## 一、遇到的问题

| 项目  | 内容  |
| --- | --- |
| 目标 App | 识货7.73.0（包名 `com.hupu.shihuo` ） |
| 检测来源 | `libmsaoaidsec.so` （美数 OAID 安全 SDK，被娜迦加固壳加载） |
| 现象 1 | frida spawn 注入后，App 启动一段时间就闪退 |
| 现象 2 | 有的运行根本不加载检测 so，有的加载后就死，行为随机 |

一句话总结： **这个 so 里住着一个"保安"（检测线程），专门盯着 frida；一旦发现，就按下"自爆按钮"（静默自杀），让 App 直接退出。**

* * *

## 二、第一步：确认"凶手"是谁

先别急着逆向，用 frida 自己就能定位—— **hook `dlopen` ，看 so 的加载顺序**：

```javascript
Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
    onEnter(args) {
        console.log("load " + args[0].readCString());
    }
});
```

运行后观察：当 `libmsaoaidsec.so` 被加载之后，frida 会话就断了。结论： **检测代码就在这个 so 里**。

* * *

## 三、第二步：判断检测发生在 so 的哪个阶段

Android 加载一个 so 的顺序是固定的：

```python
映射 so → 执行 .init_proc（构造函数）→ 执行 .init_array → 调用 JNI_OnLoad
```

检测在哪一步？ **先 hook `JNI_OnLoad`**：

-   如果 JNI_OnLoad 被调用了 → 检测可能在那之后
-   如果根本没触发 → 检测在更早的 `.init_xxx` 里

实测：JNI_OnLoad 没触发就死了 → **检测在 `.init_proc` / `.init_array` 阶段**。

这里有个经典难题：`.init_proc` 在 `dlopen` 返回 **之前** 就执行完了，等你 dlopen 返回再去 hook，检测线程早就创建好了。

### 关键取巧：找一个"最早的注入时机"

`.init_proc` 一开始会调用一个系统函数 `__system_property_get("ro.build.version.sdk")` （读取 Android 系统版本号）。

所以思路是：

1.  hook `dlopen` ，发现它要加载 `libmsaoaidsec.so` ；
2.  在这个瞬间， **hook `__system_property_get`**；
3.  当它的参数是 `"ro.build.version.sdk"` 时，说明 **`.init_proc` 刚开始执行**——这就是我们能拿到的最早时机（此刻检测线程还没被创建！）。

```javascript
function hookDlopen() {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
        onEnter(args) {
            var path = args[0].readCString();
            if (path && path.indexOf("libmsaoaidsec") !== -1) {
                hookSystemPropertyGet();   // 注册时机监听
            }
        }
    });
}

function hookSystemPropertyGet() {
    Interceptor.attach(Module.findExportByName(null, "__system_property_get"), {
        onEnter(args) {
            var name = args[0].readCString();
            if (name === "ro.build.version.sdk") {
                console.log("[!] .init_proc 刚开始执行，这是最早的注入时机");
                // 在这里做绕过动作
            }
        }
    });
}
```

* * *

## 四、第三步：用 IDA 静态分析，看清检测机制

用 IDA 打开 `libmsaoaidsec.so` （arm64），从 `_init` （0x12f18）开始跟。

> 这个 so 被"控制流平坦化"混淆了（源码里全是 if/else 状态机，很难读），但 **抓住它调用了哪些关键函数** 就够了。

### 4.1 找到"保安"：三个检测线程

| 函数  | 作用  | 干了什么 |
| --- | --- | --- |
| `sub_16D30` | 查调试状态 | 反复读 `/proc/<pid>/status` 的 `TracerPid` （被调试就不为 0）、比对父进程 |
| `sub_175F8` | 扫 Frida 特征 | 遍历 `/proc/self/task/*/status` 找 `gum-js-loop` / `gmain` 线程名；扫 `/proc/self/fd` 找 `linjector` ；扫 maps 找 `frida-agent` / `/data/local/tmp` |
| `sub_163DC` | 监控子进程 | 每 2 秒检查反调试用的 fork 子进程是否还活着 |

### 4.2 找到"自爆按钮"：自杀执行点

| 函数  | 作用  |
| --- | --- |
| `sub_112A0` | 检测命中后的统一"自杀入口" |
| `sub_1AECC` | 自杀执行器 1： `mmap` 一块可执行内存，写入 `exit_group(0)` 的 shellcode 后执行 |
| `sub_1B420` | 自杀执行器 2：和上面一样，另一条触发路径 |
| `sub_17054 / 17200 / 17314` | 三个 Frida 特征扫描函数，扫到就直接 `exit(0)` |

### 4.3 确认它找的是 frida

这些 so 里的字符串是加密的（XOR），解密后全是 frida 特征：

```python
"gum-js-loop"      ← frida 的 JS 引擎线程名
"gmain"            ← frida 的主循环线程名
"linjector"        ← frida 注入工具
"frida-agent"      ← frida 注入的 agent
"/data/local/tmp"  ← frida gadget 默认存放目录
```

结论闭环： **检测线程发现 frida 特征 → 调 `sub_112A0` → 执行 `exit_group(0)` shellcode → 进程"静默自杀"** （退出码 0，看起来像正常退出，很难排查）。

* * *

## 五、最终绕过方案（v12）：最早时机 + RET 补丁

### 核心思路（两句大白话）

1.  **把"保安"变成摆设**：把检测线程体函数的开头改成 `RET` （arm64 返回指令），线程一创建执行到入口就立刻返回退出——相当于保安刚上岗就下班，什么也查不到。
2.  **把"自爆按钮"拆掉**：把自杀函数的开头也改成 `RET` ，就算检测到了、调用了自杀函数，也直接返回杀不了进程。

### 为什么用 RET 补丁而不是 hook 函数？

| 方式  | 问题  |
| --- | --- |
| `Interceptor.replace` 替换函数 | 早期执行容易和 Android linker 内部锁死锁，App 直接卡死（我们踩过坑） |
| `Memory.patchCode` 写 RET | 只改 4 个字节，最轻量，不碰 linker 锁，不影响 SDK 初始化 |

### 需要打 RET 的 9 个点

```python
检测线程体（3个）：  0x16D30  0x175F8  0x163DC
自杀/闪退点（6个）： 0x112A0  0x1AECC  0x1B420
                    0x17054  0x17200  0x17314
```

### 完整脚本（bypass_v12.js）

```javascript
'use strict';

var MODULE_NAME = 'libmsaoaidsec.so';
var RET_BYTES = [0xC0, 0x03, 0x5F, 0xD6];   // aarch64 RET 指令

// 要 patch 成 RET 的函数偏移
var RET_OFFSETS = [
    0x16D30, 0x175F8, 0x163DC,   // 三个检测/监控线程体
    0x112A0, 0x1AECC, 0x1B420,   // 两个自杀执行器 + 自杀入口
    0x17054, 0x17200, 0x17314    // 三个直接 exit(0) 的扫描函数
];

var patched = false;
var gBase = null;

// 找模块基址：标准 API 不行就用 /proc/self/maps
function findBase() {
    try {
        var b = Module.findBaseAddress(MODULE_NAME);
        if (b !== null) return b;
    } catch (e) {}
    // maps 兜底（libc 读取，兼容旧版 frida）
    try {
        var fopen = new NativeFunction(Module.findExportByName(null, 'fopen'), 'pointer', ['pointer', 'pointer']);
        var fgets = new NativeFunction(Module.findExportByName(null, 'fgets'), 'pointer', ['pointer', 'int', 'pointer']);
        var fclose = new NativeFunction(Module.findExportByName(null, 'fclose'), 'int', ['pointer']);
        var mode = Memory.allocUtf8String('r');
        var fp = fopen(Memory.allocUtf8String('/proc/self/maps'), mode);
        var buf = Memory.alloc(2048), lowest = null;
        while (true) {
            var r = fgets(buf, 2048, fp);
            if (r.isNull()) break;
            var line = buf.readUtf8String();
            if (line.indexOf(MODULE_NAME) !== -1) {
                var start = line.split(' ')[0].split('-')[0];
                var a = ptr('0x' + start);
                if (lowest === null || a.compare(lowest) < 0) lowest = a;
            }
        }
        fclose(fp);
        return lowest;
    } catch (e) {}
    return null;
}

// 给指定地址写 RET
function patchRet(addr, tag) {
    try {
        Memory.patchCode(addr, 4, function (code) {
            code.writeByteArray(RET_BYTES);
        });
        console.log('[+] RET 0x' + tag + ' @ ' + addr);
    } catch (e) {
        console.log('[!] patch failed 0x' + tag + ' : ' + e);
    }
}

function earlyPatch() {
    if (patched) return;
    patched = true;
    console.log('[!] 早期时机命中，开始打补丁，base=' + gBase);
    RET_OFFSETS.forEach(function (off) {
        patchRet(gBase.add(off), off.toString(16));
    });
}

// 时机：dlopen 加载 so 时，监听 __system_property_get
function hookSystemPropertyGet() {
    var spg = Module.findExportByName(null, '__system_property_get');
    Interceptor.attach(spg, {
        onEnter: function (args) {
            try {
                var name = args[0].readCString();
                if (name === 'ro.build.version.sdk') {
                    console.log('[!] .init_proc early point reached');
                    if (gBase === null) gBase = findBase();
                    if (gBase !== null) earlyPatch();
                }
            } catch (e) {}
        }
    });
}

function hookDlopen() {
    ['android_dlopen_ext', 'dlopen'].forEach(function (name) {
        var p = Module.findExportByName(null, name);
        if (p === null) return;
        Interceptor.attach(p, {
            onEnter: function (args) {
                try {
                    var s = args[0].readCString();
                    if (s && s.indexOf('libmsaoaidsec') !== -1) hookSystemPropertyGet();
                } catch (e) {}
            }
        });
    });
}

// 兜底：早期时机错过时，轮询找模块再打补丁
setInterval(function () {
    if (patched) return;
    var b = findBase();
    if (b !== null) { gBase = b; earlyPatch(); }
}, 50);

setTimeout(hookDlopen, 0);
```

### 运行方法

```bash
frida -U -f com.hupu.shihuo -l bypass_v12.js
```

**成功标志**：

```python
[*] dlopen listener installed
[*] __system_property_get listener installed
[!] .init_proc early point reached     ← 早期时机命中
[+] RET 0x16d30 @ 0x...
[+] RET 0x175f8 @ 0x...
...（共 9 行）
```

之后 App 正常进主页， **再叠加业务 hook（比如绕过强制更新）也不会闪退**。

如果没看到 `.init_proc early point reached` 、只看到 `found module via poll` ，说明早期时机错过了，兜底轮询也会打同样的补丁，一样有效。

* * *

## 六、总结：一句话记住这套方法

> **找对时机（`.init_proc` 刚执行）比 hook 多少函数更重要；改动越小越不容易被干扰。**

完整流程回顾：

1.  **hook `dlopen`** → 确认凶手是 `libmsaoaidsec.so`
2.  **hook `JNI_OnLoad`** → 确认检测在 `.init_xxx` 阶段
3.  **hook `__system_property_get("ro.build.version.sdk")`** → 拿到 `.init_proc` 最早执行时机
4.  **IDA 静态分析** → 找到检测线程体 + 自杀执行点
5.  **早期 RET 补丁** → 线程体失效 + 自杀失效 → 稳定绕过

* * *

*参考文献：博客园《APP使用frida反调试检测绕过》——提供了" `__system_property_get("ro.build.version.sdk")` 是 `.init_proc` 最早注入时机"的关键思路。*
