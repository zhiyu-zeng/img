---
title: 别再手工写 Hook 了！Python + Frida 一网打尽 SO 层动态注册 JNI 调用 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E5%88%AB%E5%86%8D%E6%89%8B%E5%B7%A5%E5%86%99-hook-%E4%BA%86python-+-frida-%E4%B8%80%E7%BD%91%E6%89%93%E5%B0%BD-so-%E5%B1%82%E5%8A%A8%E6%80%81%E6%B3%A8%E5%86%8C-jni-%E8%B0%83%E7%94%A8/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T13:56:11+08:00
trace_id: 04a4fe99-c6a4-4e7c-bf51-445fab215b30
content_hash: 14d330a87bd517a9e3a00c8a02ea43f39da166f726e7e2b7198782d27a07912a
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: Python + Frida 可自动化完成 RegisterNatives 动态注册 JNI 方法的导出、解析与批量 Hook，将逆向分析从手动逐个函数改写为一键式全量调用监控。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3b275244-d011-8157-abaf-f6be6f1174d9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Python + Frida 可自动化完成 RegisterNatives 动态注册 JNI 方法的导出、解析与批量 Hook，将逆向分析从手动逐个函数改写为一键式全量调用监控。
> 
> - **自动化流程：** 先 Hook `libart.so` 的 `RegisterNatives` 导出所有 JNI 绑定信息到 `register_natives.txt`，再用 Python 解析该文件生成 Frida Hook 脚本，最后加载脚本实时捕获全部动态注册方法的调用参数与返回值，日志保存至 `rn2frida.txt`。
> - **关键解析逻辑：** `parse_txt` 函数以 `==================== RegisterNatives ====================` 为分隔符分块，正则提取类名、方法名、签名、模块、偏移量，返回结构化字典列表，作为生成脚本的输入。
> - **签名类型映射：** 定义了 `JAVA_TYPE_MAP`，将 JNI 基本类型和 `Ljava/lang/String;` 等引用类型映射为 Frida 可用的打印表达式，并正确处理 `jobject` 和 `jstring` 的读取。
> - **脚本生成与 Hook：** `gen_frida_script` 为每个函数生成独立 IIFE 闭包，根据偏移量计算绝对地址，在 `onEnter` 中解析 args（跳过前两个参数 `JNIEnv*` 和 `jobject`），并将日志通过 `send` 传给 Python 端落地；默认不打印调用堆栈，支持可选开启。
> - **交互式执行：** 主程序提供菜单选项，输入 `1` 生成 `rn2frida.js`（共 4023 个函数被 Hook），输入 `2` 附加到远程设备的当前前台应用并运行脚本，日志实时追加写入文件。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

很多 Android 应用会把核心逻辑都写在 SO 层，并通过 **RegisterNatives** 动态注册 JNI 方法，把 Java 层的 native 方法和真实的 C/C++ 函数地址在运行时绑定。

通过这样 **隐藏真实函数名和地址**，增加逆向难度。

虽然我们可以 Hook RegisterNatives 拿到所有 JNI 绑定信息，但是：

-   函数数量巨大：可能有上百上千个 JNI 方法。
    
-   调用路径未知：不知道哪些函数会被实际调用。
    
-   手动 Hook 成本高：一个个写 Frida Hook 既耗时又容易漏掉。
    

**如何一次性 Hook 所有动态注册函数**，并且自动解析参数、记录调用日志？

## 目标

用一份 **Python 脚本 + Frida** 实现：

1.  Hook RegisterNatives 导出 JNI 绑定信息到 **register_natives.txt**
    
2.  自动解析 **register_natives.txt** 文件，提取所有 JNI 绑定信息。
    
3.  自动生成完整的 Frida Hook 脚本， **一次性 Hook 所有动态注册函数**。
    
4.  支持自动类型识别、参数打印，并将日志直接保存到文件。
    

只需要一次运行，就能一网打尽 SO 层所有动态注册的 JNI 调用。

## Hook RegisterNatives 导出 JNI 绑定信息

```typescript
// 查找 libart.so 中的 RegisterNatives 地址
function findRegisterNativesAddr() {
    let symbols = Module.enumerateSymbolsSync("libart.so");
    for (let symbol of symbols) {
        if (symbol.name.indexOf("RegisterNatives") >= 0 &&
            symbol.name.indexOf("CheckJNI") < 0) {
            console.log("[+] Found RegisterNatives symbol: " + symbol.name + " at " + symbol.address);
            return symbol.address;
        }
    }
    console.log("[!] No non-CheckJNI RegisterNatives symbol found!");
    return null;
}

// Hook RegisterNatives 函数，打印方法相关信息
function hookRegisterNatives(addrRegisterNatives) {
    if (!addrRegisterNatives) {
        console.log("[!] Cannot hook RegisterNatives because the address is null.");
        return;
    }

    Interceptor.attach(addrRegisterNatives, {
        onEnter: function (args) {
            let logs = [];
            try {
                const env = Java.vm.tryGetEnv();
                const javaClass = args[1];
                const methodsPtr = ptr(args[2]);
                const methodCount = args[3].toInt32();

                const className = env.getClassName(javaClass);
                logs.push("\n==================== RegisterNatives ====================");
                logs.push("[*] Class: " + className);
                logs.push("[*] Method Count: " + methodCount);

                // 遍历注册的每个 JNI 方法
                for (let i = 0; i < methodCount; i++) {

                    // 读取每个方法的名称、签名和函数指针
                    const methodPtr = methodsPtr.add(i * Process.pointerSize * 3);
                    const namePtr = Memory.readPointer(methodPtr);
                    const sigPtr = Memory.readPointer(methodPtr.add(Process.pointerSize));
                    const fnPtr = Memory.readPointer(methodPtr.add(Process.pointerSize * 2));

                    const name = Memory.readCString(namePtr);
                    const sig = Memory.readCString(sigPtr);
                    const symbol = DebugSymbol.fromAddress(fnPtr);
                    const module = Process.findModuleByAddress(fnPtr);

                    // 打印每个 JNI 方法的详细信息
                    logs.push(`  [${i}] Method: ${name}`);
                    logs.push(`      Signature: ${sig}`);
                    logs.push(`      Function Symbol: ${symbol.name} (${fnPtr})`);

                    // JNI 方法所在模块信息
                    if (module) {
                        const offset = fnPtr.sub(module.base);
                        logs.push(`      Module: ${module.name}`);
                        logs.push(`      Offset in Module: ${offset}`);
                    } else {
                        logs.push(`      Module: Unknown`);
                    }
                }

                // 打印调用堆栈
                const backtrace = Thread.backtrace(this.context, Backtracer.ACCURATE)
                    .map(DebugSymbol.fromAddress)
                    .join('\n');
                logs.push("\n[*] Backtrace:\n" + backtrace);
                logs.push("=========================================================");

            } catch (e) {
                logs.push("[!] Exception in hookRegisterNatives: " + e);
            }

            // 统一打印
            console.log(logs.join('\n'));
        }
    });
}

// 执行查找并 hook RegisterNatives
setImmediate(function () {
    const addrRegisterNatives = findRegisterNativesAddr();
    hookRegisterNatives(addrRegisterNatives);
});


// frida -H 127.0.0.1:1234 -l register_natives.js -f com.ss.android.ugc.aweme -o register_natives.txt
// frida -H 127.0.0.1:1234 -l register_natives.js -f com.shizhuang.duapp -o register_natives.txt
// frida -H 127.0.0.1:1234 -l register_natives.js -f com.shizhuang.duapp
// frida -H 127.0.0.1:1234 -F -l register_natives.js
```

导出 app 中所有 JNI 绑定信息到 register_natives.txt

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c0e7a25449b2f16b.png)](data:image/png;base64,inline-184122B)

## 解析 register_natives.txt

parse_txt() 函数的核心逻辑：

1.  读取文件内容：一次性把 register_natives.txt 读入内存。
    
2.  按模块分块：用 “==================== RegisterNatives ====================” 作为分隔符，把文件分成多个模块。
    
3.  提取类名：通过正则匹配 \[\*\] Class: … 找到当前块的 Java 类。
    
4.  匹配方法信息：用正则匹配方法名、签名、绝对地址、模块名、模块内偏移等关键信息。
    
5.  整理成结构化数据：把每个方法保存成一个字典，最后返回一个列表，方便后续生成 Frida Hook 脚本。
    

```python
def parse_txt(filepath):
    """解析 RegisterNatives 格式txt，返回函数信息"""
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    blocks = content.split('==================== RegisterNatives ====================')
    funcs = []
    for block in blocks:
        class_match = re.search(r'\[\*\] Class:\s+(.+)', block)
        if not class_match:
            continue
        class_name = class_match.group(1).strip()

        for m in re.finditer(
                r'\[\d+\] Method:\s+([^\n]+)\n\s+Signature:\s+([^\n]+)\n\s+Function Symbol:\s+[^\n]+\((0x[0-9a-fA-F]+)\)\n\s+Module:\s+([^\n]+)\n\s+Offset in Module:\s+(0x[0-9a-fA-F]+)',
                block):
            method_name, sig, abs_addr, module, offset = m.groups()
            funcs.append({
                'class': class_name,
                'method': method_name,
                'sig': sig,
                'module': module,
                'offset': offset
            })
    return funcs
```

返回结果示例：

```rust
[
    {
        'class': 'com.example.MyClass',
        'method': 'nativeDoSomething',
        'sig': '(Ljava/lang/String;I)V',
        'module': 'libnative-lib.so',
        'offset': '0x51a23'
    },
    ...
]
```

这样，后续脚本可以直接遍历这个列表，一次性生成所有 JNI 函数的 Hook 代码。

## 解析 Java 签名

把 JNI 方法签名字符串解析成一个易于处理的参数类型列表，并且通过 JAVA_TYPE_MAP 建立了 Java 类型 → Frida 打印代码的映射，为后续自动生成 Hook 逻辑做准备。

```python
# Java签名到Frida打印代码映射
JAVA_TYPE_MAP = {
    'I': ('int', 'args[{idx}]'),
    'Z': ('boolean', 'args[{idx}] !== 0'),
    'J': ('long', 'args[{idx}]'),
    'F': ('float', 'args[{idx}]'),
    'D': ('double', 'args[{idx}]'),
    'Ljava/lang/String;': (
        'java.lang.String',
        '"[" + args[{idx}] + "] " + Memory.readUtf8String(Java.vm.tryGetEnv().getStringUtfChars(args[{idx}], null))'
    ),
    'Ljava/lang/Object;': ('java.lang.Object', 'args[{idx}]'),
    # 其他引用类型按Object处理
}

def parse_signature(sig):
    """解析Java方法签名，返回参数类型列表"""
    params_str = re.search(r'^\((.*?)\)', sig).group(1)
    params = []
    i = 0
    while i < len(params_str):
        if params_str[i] in ('I', 'Z', 'J', 'F', 'D', 'B', 'S', 'C'):
            params.append(params_str[i])
            i += 1
        elif params_str[i] == 'L':
            end = params_str.find(';', i)
            params.append(params_str[i:end + 1])
            i = end + 1
        elif params_str[i] == '[':
            # 简单处理数组类型
            arr_type = params_str[i]
            i += 1
            if params_str[i] == 'L':
                end = params_str.find(';', i)
                arr_type += params_str[i:end + 1]
                i = end + 1
            else:
                arr_type += params_str[i]
                i += 1
            params.append(arr_type)
        else:
            i += 1
    return params
```

最终返回一个参数类型列表，例如：

```
parse_signature("(Ljava/lang/String;I)V")
# 输出: ['Ljava/lang/String;', 'I']
```

## 生成 JS Hook

在完成 **register_natives.txt → Python 数据结构** 的解析后，下一步就是生成一个可以直接加载到 Frida 的 Hook 脚本，自动拦截所有 JNI 调用。

```python
def gen_frida_script(funcs):
    """生成Frida hook脚本"""
    lines = [
        "var callCounter = 0;",
        ""
    ]

    for f in funcs:
        params = parse_signature(f['sig'])
        lines.append(f"// Hook {f['class']}.{f['method']} {f['sig']}")
        lines.append(f"(function() {{")
        lines.append(f"    var moduleName = \"{f['module']}\";")
        lines.append(f"    var baseAddr = Module.findBaseAddress(moduleName);")
        lines.append(f"    if (!baseAddr) {{")
        lines.append(f"        console.log(\"[!] Module not found: \" + moduleName);")
        lines.append(f"        return;")
        lines.append(f"    }}")
        lines.append(f"    var targetAddr = baseAddr.add({f['offset']});")
        lines.append(f"    Interceptor.attach(targetAddr, {{")
        lines.append(f"        onEnter: function (args) {{")
        lines.append(f"            this.callId = ++callCounter;")
        lines.append(f"            this.logBuf = [];")
        lines.append(f"            var tid = Process.getCurrentThreadId();")
        lines.append(f"            this.logBuf.push(\"\\n[Call \" + this.callId + \"] Thread:\" + tid + \" -> {f['class']}.{f['method']} called\");")
        lines.append(f"            this.logBuf.push(\"    Signature: {f['sig']}\");")
        lines.append(f"            this.logBuf.push(\"    Module: {f['module']}, Offset: {f['offset']}\");")

        arg_index = 2  # JNI函数前两个参数是JNIEnv* 和 jobject
        for idx, ptype in enumerate(params):
            type_name, expr = JAVA_TYPE_MAP.get(ptype, ('object', f"args[{{idx}}]"))
            expr = expr.replace("{idx}", str(arg_index))
            lines.append(f"            try {{ this.logBuf.push(\"    arg{idx} ({type_name}): \" + {expr}); }} catch(e) {{ this.logBuf.push(\"    arg{idx} ({type_name}): <error> \" + e); }}")
            arg_index += 1

        lines.append(f"        }},")
        lines.append(f"        onLeave: function (retval) {{")
        lines.append(f"            try {{ this.logBuf.push(\"[Call \" + this.callId + \"] Return: \" + retval); }} catch(e) {{ this.logBuf.push(\"[Call \" + this.callId + \"] Return: <error> \" + e); }}")

        # 直接打印日志
        # lines.append(f"            console.log(this.logBuf.join(\"\\n\"));")

        # 将日志发送给 Python 端而不是 console.log
        lines.append(f"            var log = this.logBuf.join(\"\\n\");")
        lines.append(f"            send({{ tag: \"rn2frida\", payload: log }});")

        lines.append(f"        }}")
        lines.append(f"    }});")
        lines.append(f"}})();")
        lines.append("")

    return "\n".join(lines)

def gen_frida_script_to_file(txt_path, output_js_path):
    funcs = parse_txt(txt_path)
    script = gen_frida_script(funcs)

    with open(output_js_path, "w", encoding="utf-8") as f:
        f.write(script)

    print(f"[+] 生成完成: {output_js_path}，共 {len(funcs)} 个函数 Hook")
```

## 运行 JS Hook

运行 Frida JS Hook 并把日志落地保存。

```python
LOG_FILE = "rn2frida.txt"


def on_message(message, data):
    if message["type"] == "send":
        tag = message["payload"].get("tag")
        log = message["payload"].get("payload")
        if tag == "rn2frida":
            # a：追加；w：覆盖
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(f"{log}\n\n")
    elif message["type"] == "error":
        print("❌ Frida script error:", message["stack"])


def run_frida_script():
    # USB链接
    # device: frida.core.Device = frida.get_usb_device()

    # 远程链接
    device = frida.get_device_manager().add_remote_device("127.0.0.1:1234")

    # 附加到当前前台应用
    pid = device.get_frontmost_application().pid
    session: frida.core.Session = device.attach(pid)

    # 加载脚本
    with open("rn2frida.js", "r", encoding="utf-8") as f:
        script = session.create_script(f.read())

    script.on("message", on_message)
    script.load()

    print(f"✅ Script loaded and logging to {LOG_FILE}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Exit by user.")
```

## 整体流程

整理流程大概如下：

```
register_natives.txt → parse_txt → gen_frida_script → run_frida_script → 日志文件
```

## 测试

整个工具的 **入口调度器**，让用户在运行 Python 脚本时，可以交互式选择执行哪一步操作。

```python
# 示例调用
if __name__ == "__main__":
    actions = {
        "1": ("生成 Frida 脚本文件", lambda: gen_frida_script_to_file("register_natives.txt", "rn2frida.js")),
        "2": ("运行 Frida 脚本", run_frida_script)
    }

    print("请选择要执行的操作：")
    for k, (desc, _) in actions.items():
        print(f"{k}. {desc}")

    choice = input("输入序号: ").strip()
    if choice in actions:
        actions[choice][1]()  # 调用对应函数
    else:
        print("[!] 无效的选择，请重新运行程序。")
```

## 1\. 生成 Frida 脚本文件

运行脚本时，输入 1 生成 Hook 脚本

```
请选择要执行的操作：
1. 生成 Frida 脚本文件
2. 运行 Frida 脚本
输入序号: 1
[+] 生成完成: rn2frida.js，共 4023 个函数 Hook
```

生成的 Hook 脚本大概如下：

```kotlin
var callCounter = 0;

// Hook com.bytedance.mobsec.matrix.a.a (IIJLjava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;
(function() {
    var moduleName = "libmetasec_ml.so";
    var baseAddr = Module.findBaseAddress(moduleName);
    if (!baseAddr) {
        console.log("[!] Module not found: " + moduleName);
        return;
    }
    var targetAddr = baseAddr.add(0x12fb84);
    Interceptor.attach(targetAddr, {
        onEnter: function (args) {
            this.callId = ++callCounter;
            this.logBuf = [];
            var tid = Process.getCurrentThreadId();
            this.logBuf.push("\n[Call " + this.callId + "] Thread:" + tid + " -> com.bytedance.mobsec.matrix.a.a called");
            this.logBuf.push("    Signature: (IIJLjava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;");
            this.logBuf.push("    Module: libmetasec_ml.so, Offset: 0x12fb84");
            try { this.logBuf.push("    arg0 (int): " + args[2]); } catch(e) { this.logBuf.push("    arg0 (int): <error> " + e); }
            try { this.logBuf.push("    arg1 (int): " + args[3]); } catch(e) { this.logBuf.push("    arg1 (int): <error> " + e); }
            try { this.logBuf.push("    arg2 (long): " + args[4]); } catch(e) { this.logBuf.push("    arg2 (long): <error> " + e); }
            try { this.logBuf.push("    arg3 (java.lang.String): " + "[" + args[5] + "] " + Memory.readUtf8String(Java.vm.tryGetEnv().getStringUtfChars(args[5], null))); } catch(e) { this.logBuf.push("    arg3 (java.lang.String): <error> " + e); }
            try { this.logBuf.push("    arg4 (java.lang.Object): " + args[6]); } catch(e) { this.logBuf.push("    arg4 (java.lang.Object): <error> " + e); }
        },
        onLeave: function (retval) {
            try { this.logBuf.push("[Call " + this.callId + "] Return: " + retval); } catch(e) { this.logBuf.push("[Call " + this.callId + "] Return: <error> " + e); }
            var log = this.logBuf.join("\n");
            send({ tag: "rn2frida", payload: log });
        }
    });
})();

...
```

## 2\. 运行 Frida 脚本

输入 2 运行 Hook 脚本并开始抓取 JNI 调用，日志会输出到 rn2frida.txt

```
[Call 34] Thread:22296 -> com.bytedance.mobsec.matrix.a.a called
    Signature: (IIJLjava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;
    Module: libmetasec_ml.so, Offset: 0x12fb84
    arg0 (int): 0x1000001
    arg1 (int): 0x0
    arg2 (long): 0x0
    arg3 (java.lang.String): [0x7dedb74b28] 7e1e95
    arg4 (java.lang.Object): 0x7dedb74b2c
[Call 34] Return: 0x35


[Call 35] Thread:22296 -> com.bytedance.mobsec.matrix.a.a called
    Signature: (IIJLjava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;
    Module: libmetasec_ml.so, Offset: 0x12fb84
    arg0 (int): 0x1000001
    arg1 (int): 0x0
    arg2 (long): 0x0
    arg3 (java.lang.String): [0x7dedb74b28] f94d18
    arg4 (java.lang.Object): 0x7dedb74b2c
[Call 35] Return: 0x31
```

## 完整源码

rn2frida.py

```python
# !/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
import time
import frida

# Java签名到Frida打印代码映射
JAVA_TYPE_MAP = {
    'I': ('int', 'args[{idx}]'),
    'Z': ('boolean', 'args[{idx}] !== 0'),
    'J': ('long', 'args[{idx}]'),
    'F': ('float', 'args[{idx}]'),
    'D': ('double', 'args[{idx}]'),
    'Ljava/lang/String;': (
        'java.lang.String',
        '"[" + args[{idx}] + "] " + Memory.readUtf8String(Java.vm.tryGetEnv().getStringUtfChars(args[{idx}], null))'
    ),
    'Ljava/lang/Object;': ('java.lang.Object', 'args[{idx}]'),
    # 其他引用类型按Object处理
}

def parse_signature(sig):
    """解析Java方法签名，返回参数类型列表"""
    params_str = re.search(r'^\((.*?)\)', sig).group(1)
    params = []
    i = 0
    while i < len(params_str):
        if params_str[i] in ('I', 'Z', 'J', 'F', 'D', 'B', 'S', 'C'):
            params.append(params_str[i])
            i += 1
        elif params_str[i] == 'L':
            end = params_str.find(';', i)
            params.append(params_str[i:end + 1])
            i = end + 1
        elif params_str[i] == '[':
            # 简单处理数组类型
            arr_type = params_str[i]
            i += 1
            if params_str[i] == 'L':
                end = params_str.find(';', i)
                arr_type += params_str[i:end + 1]
                i = end + 1
            else:
                arr_type += params_str[i]
                i += 1
            params.append(arr_type)
        else:
            i += 1
    return params

def parse_txt(filepath):
    """解析 RegisterNatives 格式txt，返回函数信息"""
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    blocks = content.split('==================== RegisterNatives ====================')
    funcs = []
    for block in blocks:
        class_match = re.search(r'\[\*\] Class:\s+(.+)', block)
        if not class_match:
            continue
        class_name = class_match.group(1).strip()

        for m in re.finditer(
                r'\[\d+\] Method:\s+([^\n]+)\n\s+Signature:\s+([^\n]+)\n\s+Function Symbol:\s+[^\n]+\((0x[0-9a-fA-F]+)\)\n\s+Module:\s+([^\n]+)\n\s+Offset in Module:\s+(0x[0-9a-fA-F]+)',
                block):
            method_name, sig, abs_addr, module, offset = m.groups()
            funcs.append({
                'class': class_name,
                'method': method_name,
                'sig': sig,
                'module': module,
                'offset': offset
            })
    return funcs

def gen_frida_script(funcs, print_backtrace=False):
    """生成Frida hook脚本
    :param funcs: 从 register_natives.txt 解析出的 JNI 函数列表
    :param print_backtrace: 是否在 onEnter 打印调用堆栈
    """
    lines = [
        "var callCounter = 0;",
        ""
    ]

    for f in funcs:
        params = parse_signature(f['sig'])
        lines.append(f"// Hook {f['class']}.{f['method']} {f['sig']}")
        lines.append(f"(function() {{")
        lines.append(f"    var moduleName = \"{f['module']}\";")
        lines.append(f"    var baseAddr = Module.findBaseAddress(moduleName);")
        lines.append(f"    if (!baseAddr) {{")
        lines.append(f"        console.log(\"[!] Module not found: \" + moduleName);")
        lines.append(f"        return;")
        lines.append(f"    }}")
        lines.append(f"    var targetAddr = baseAddr.add({f['offset']});")
        lines.append(f"    Interceptor.attach(targetAddr, {{")
        lines.append(f"        onEnter: function (args) {{")
        lines.append(f"            this.callId = ++callCounter;")
        lines.append(f"            this.logBuf = [];")
        lines.append(f"            var tid = Process.getCurrentThreadId();")
        lines.append(f"            this.logBuf.push(\"\\n[Call \" + this.callId + \"] Thread:\" + tid + \" -> {f['class']}.{f['method']} called\");")
        lines.append(f"            this.logBuf.push(\"    Signature: {f['sig']}\");")
        lines.append(f"            this.logBuf.push(\"    Module: {f['module']}, Offset: {f['offset']}\");")

        # 打印参数
        arg_index = 2  # JNI函数前两个参数是JNIEnv* 和 jobject
        for idx, ptype in enumerate(params):
            type_name, expr = JAVA_TYPE_MAP.get(ptype, ('object', f"args[{{idx}}]"))
            expr = expr.replace("{idx}", str(arg_index))
            lines.append(f"            try {{ this.logBuf.push(\"    arg{idx} ({type_name}): \" + {expr}); }} catch(e) {{ this.logBuf.push(\"    arg{idx} ({type_name}): <error> \" + e); }}")
            arg_index += 1

        # 打印调用堆栈
        if print_backtrace:
            lines.append(f"            this.logBuf.push('    --- Backtrace ---');")
            lines.append(f"            var bt = Thread.backtrace(this.context, Backtracer.FUZZY)")
            lines.append(f"                .map(DebugSymbol.fromAddress)")
            lines.append(f"                .join('\\n');")
            lines.append(f"            this.logBuf.push(bt);")

        lines.append(f"        }},")
        lines.append(f"        onLeave: function (retval) {{")
        lines.append(f"            try {{ this.logBuf.push(\"[Call \" + this.callId + \"] Return: \" + retval); }} catch(e) {{ this.logBuf.push(\"[Call \" + this.callId + \"] Return: <error> \" + e); }}")

        # 直接打印日志
        # lines.append(f"            console.log(this.logBuf.join(\"\\n\"));")

        # 将日志发送给 Python 端
        lines.append(f"            var log = this.logBuf.join(\"\\n\");")
        lines.append(f"            send({{ tag: \"rn2frida\", payload: log }});")

        lines.append(f"        }}")
        lines.append(f"    }});")
        lines.append(f"}})();")
        lines.append("")

    return "\n".join(lines)

def gen_frida_script_to_file(txt_path, output_js_path, print_backtrace=False):
    funcs = parse_txt(txt_path)
    script = gen_frida_script(funcs, print_backtrace)

    with open(output_js_path, "w", encoding="utf-8") as f:
        f.write(script)

    print(f"[+] 生成完成: {output_js_path}，共 {len(funcs)} 个函数 Hook")

LOG_FILE = "rn2frida.txt"

def on_message(message, data):
    if message["type"] == "send":
        tag = message["payload"].get("tag")
        log = message["payload"].get("payload")
        if tag == "rn2frida":
            # a：追加；w：覆盖
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(f"{log}\n\n")
    elif message["type"] == "error":
        print("❌ Frida script error:", message["stack"])

def run_frida_script():
    # USB链接
    # device: frida.core.Device = frida.get_usb_device()

    # 远程链接
    device = frida.get_device_manager().add_remote_device("127.0.0.1:1234")

    # 附加到当前前台应用
    pid = device.get_frontmost_application().pid
    session: frida.core.Session = device.attach(pid)

    # 加载脚本
    with open("rn2frida.js", "r", encoding="utf-8") as f:
        script = session.create_script(f.read())

    script.on("message", on_message)
    script.load()

    print(f"✅ Script loaded and logging to {LOG_FILE}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Exit by user.")

# 示例调用
if __name__ == "__main__":
    actions = {
        "1": ("生成 Frida 脚本文件", None),
        "2": ("运行 Frida 脚本", run_frida_script)
    }

    print("请选择要执行的操作：")
    for k, (desc, _) in actions.items():
        print(f"{k}. {desc}")

    choice = input("输入序号: ").strip()
    if choice == "1":
        # 询问是否打印调用堆栈
        bt_choice = input("是否打印调用堆栈？(y/n): ").strip().lower()
        print_backtrace = bt_choice == "y"
        gen_frida_script_to_file("register_natives.txt", "rn2frida.js", print_backtrace)
    elif choice == "2":
        actions[choice][1]()  # 调用对应函数
    else:
        print("[!] 无效的选择，请重新运行程序。")
```
