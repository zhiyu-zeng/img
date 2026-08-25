---
title: 【微信】RegPwn：Github再现exp投毒？
source: https://mp.weixin.qq.com/s/LmNR-zDC4J6ZVgfpjpJT1g
source_host: mp.weixin.qq.com
clip_date: 2026-08-25T16:58:49+08:00
trace_id: 39640ac2-8b4f-48eb-b6d4-86542826e41b
content_hash: abd49f9807c97f60621e9bd9eec681e4cb9dd2463e4187a7d6bff9cd1a2f3b9b
status: synced
tags:
  - 微信
  - 恶意样本
  - 供应链投毒
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: GitHub 上出现伪装成 RegPwn 提权漏洞工具的投毒项目，源码可正常编译但依赖目录内藏 ZIP 木马载荷，可投递 Cobalt Strike 等多种恶意软件。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3c775244-d011-8190-aa21-ec2c28e8a128
ioc:
  cves:
    - CVE-2026-24291
  cwes: []
  hashes:
    - 00884d5c51d9539ca937afd04565c2646a8d9e6fef0eac5788b67cdfc9b36310
    - 0204515d5b437a343cd0fe1098c5dee672d7f8628a417da44977753529b88a55
    - 13e63c6bab3745586f735b453606c2f29ebba3ca8b9c1e4f00417b4dc7db3c65
    - 181df7e581cc4bd773f9c80f70eab84d45e82c9a27dbf7b379ade3422db3275b
    - 1a43df3e4efb8faa7425c9c973197ddb8ef8556c798c9c07b7baee528314475f
    - 1ab9627f730d9633ff24f5227b36c423faf470bd991c230be17a7a26c69f9e95
    - 1f83f20c7f6200d13b173ca6e374a7d367f39c465a1ae451c7fd1700ebbbfff9
    - 239817232de32474ca0d6092d6694502
    - 352151a90cf8dc21f297f6ffa9d29693e87d0fdd80a129c4cbab464221f16867
    - 3e53a93bbb75cc2e281a05510c2243d2256eb0f77673a8264d386f20538120a7
    - 3ee51b5f9579b775e87edb23c238650a512c2fe46efc06694cd906a771727f97
    - 448976e03696fa95af0dc4746041d50723b9931021763be93957d7290ac031f2
    - 58448cb79f50cf71408e7eabfe7e0718e77a09910fd59963f83840b67faa245f
    - 5ff4a962dd1aa0d255c42dcd0556d3eff2a01e594b6bb02328b8e8ee80523809
    - 6f44e6c57ec997c1a6679121d21cdabfffd745d40225e41904920a7b2830eb1c
    - 7600888ea1ad6c61d67f1bc221d17e6f5d1d6c88ee4531148241b55a2ec22c79
    - 903ddc01ec499a5d2485f9daa18d01489534d8c561594c238c5dab0e120034d4
    - ad4078b3e25d1a63c2ce4fb203af6e38
    - c218f533813b39627346649651677af803e04fbe
    - c5588d42251b6f3638180e6d8ca2a01cddd2cb537e67dbb97f6bda22c61e493c
    - d71cdcdd390fb300904a7fdc31d56c0a3a728350eca2debf3d00d7932dc14839
  domains:
    - github.com
    - ip-api.com
    - polygon.drpc.org
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GitHub 上出现伪装成 RegPwn 提权漏洞工具的投毒项目，源码可正常编译但依赖目录内藏 ZIP 木马载荷，可投递 Cobalt Strike 等多种恶意软件。
> 
> - **投毒手法：** 两个新注册账号（2026年3月注册）分别分发 RegPwn、RegPwnBOF 项目，源码本身是正常 CVE-2026-24291 提权 PoC，但在 `packages\NtApiDotNet.1.1.33\lib\netstandard2.0\` 目录人为放入 `Reg_Pwn_1.5.zip`，内含 `Launcher.cmd`、`lua51.exe`、`rest.txt`；官方 nuget 包中并无此 zip。
> - **触发条件：** 仅编译源码或运行编译后的 RegPwn.exe 不会中招；唯一感染途径是手动解压并运行 ZIP 内 `Launcher.cmd`（执行 `start lua51.exe rest.txt`），或使用攻击者分发的预编译版本。
> - **载荷分析：** `lua51.exe` 是木马化 LuaJIT 2.1.0-beta3（VT 48/69，标签 trojan.lazy/convagent），`rest.txt` 是经 VM 混淆、字符串表洗牌、算术混淆等处理的 299KB Lua 脚本（VT 26/60，标签 trojan.mldk/ravartar），含 "Tamper Detected!" 反调试逻辑。
> - **C2 与攻击链路：** 脚本先请求 ip-api.com 获取地理位置，再通过 Polygon 区块链 RPC（polygon.drpc.org）动态解析 C2 地址，主 C2 为 `http://85.137.52.21/api/NTE3YjdjNWU1NjYzNjU2YTA1N2Y=`（荷兰 AS43641），已知可投递 Cobalt Strike、njRAT、IcedID、Luca Stealer、Satacom 等二级载荷。
> - **防护与传播范围：** 该项目依赖目录中 zip 为静态文件，DLL 未被篡改；该木马载荷已打包进 97 个以上父级 ZIP，伪装成游戏外挂、AI 工具、开源软件等诱饵传播；建议用 NuGet 官方源还原依赖并校验哈希，删除异常 zip，排查对上述 C2 地址的连接记录。

**蚁景网安** *2026年8月25日 16:30*

早上起来闲着没事，本想复现测试下 RegPwn 提权漏洞写插件，在 github 搜索看到有两个几小时前刚更新过的项目：RegPwn、RegPwnBOF。

```bash
hxxps://github[.]com/tracyliving606/RegPwn
hxxps://github[.]com/Snowyheronmusculusadductorlongus456/RegPwnBOF
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6ddd06de622052d2.png)

第一眼看头像就感觉不太正常，两个账号下都只有这一个项目，而且注册时间均为2026年3月新建起开始活跃，正是 RegPwn 漏洞曝出的月份。

```nginx
curl https://api.github.com/users/tracyliving606 | findstr _at
  "created_at": "2026-03-07T23:08:29Z",
  "updated_at": "2026-03-07T23:08:31Z"

curl https://api.github.com/users/Snowyheronmusculusadductorlongus456 | findstr _at
  "created_at": "2026-03-01T08:02:32Z",
  "updated_at": "2026-07-09T09:50:49Z"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0b194fa5cec1fce8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/29c1ef6602ffc027.png)

RegPwn、RegPwnBOF两个源码传的都挺早，最近才更新的Reg_Pwn恶意文件包和README.md，并会在README.md中引导受害者下载运行...！

```apache
Reg_Pwn_1.5.zip
BOF_Reg_Pwn_v3.8.zip
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fe4a967430851686.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/10e125f8adb1d376.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8b22d89516fa6d65.png)

注意：近几年在Github上投毒的很多，我们做安全研究时还得注意检查下项目的安全性，现在有了AI也方便很多，直接丢给AI去分析就行。。。

* * *

以下内容是我用AI对"RegPwn"投毒项目进行的静态分析报告，另一个"RegPwnBOF"投毒项目也差不多的，大概率为同一人或组织，这里我就不再去重复分析了，感兴趣的师傅可以自己去看下...。

## RegPwn 项目木马化供应链攻击分析报告

> **分析日期**：2026-08-23
> 
> **威胁等级**：高危（trojan.lazy/convagent + trojan.mldk/ravartar）
> 
> **分析结论**：RegPwn 源码本身为正常提权漏洞 PoC，但项目副本被植入了多层木马载荷，通过隐藏在 NuGet 依赖包目录中的 ZIP 文件进行投递。

* * *

## 目录

1.  项目背景与概况
    
2.  源代码分析：正常的漏洞利用工具
    
3.  木马发现：隐藏在 NuGet 包中的恶意载荷
    
4.  编译安全性分析：编译过程是否会中招
    
5.  触发机制：什么情况下才会中招
    
6.  rest.txt 深度分析：VM 混淆与后门触发
    
7.  C2 基础设施与攻击链路
    
8.  完整 IOC 列表
    
9.  攻击者画像与威胁评估
    
10.  防护建议与处置措施
     

* * *

## 1\. 项目背景与概况

RegPwn 是一个针对 **CVE-2026-24291** （Windows 辅助功能基础设施本地提权漏洞）的.NET 4.7.2 C# 漏洞利用工具。该漏洞由 Google Project Zero 安全研究员 James Forshaw 报告，MDSec 的 Filip Dragovic 公开了利用技术细节\[^1\]。

### 项目文件结构

```python
RegPwn/
├── App.config
├── Config.cs                    # 配置类（用户输入参数存储）
├── Confuser.crproj              # ConfuserEx 代码混淆配置
├── packages.config              # NuGet 包引用
├── Program.cs                   # 主程序（漏洞利用逻辑）
├── RegPwn.csproj                # 项目文件
├── RegPwn.sln                   # 解决方案文件
├── WindowsApi.cs                # Windows API P/Invoke 声明
├── Properties/
│   └── AssemblyInfo.cs
└── packages/
    ├── dnMerge.0.5.15/          # 程序集合并工具
    │   └── ...
    └── NtApiDotNet.1.1.33/      # NT API .NET 库
        ├── NtApiDotNet.1.1.33.nupkg
        ├── .signature.p7s
        ├── lib/
        │   ├── net461/
        │   │   ├── NtApiDotNet.dll     # 未被篡改
        │   │   └── NtApiDotNet.xml
        │   └── netstandard2.0/
        │       ├── NtApiDotNet.dll     # 未被篡改
        │       ├── NtApiDotNet.xml
        │       └── Reg_Pwn_1.5.zip     # ★ 恶意文件（不属于官方包）
        └── ...
```

### 漏洞原理

CVE-2026-24291 的根源在于 Windows 对注册表符号链接的创建和解析缺乏严格的权限验证\[^2\]。攻击者在用户可写的 `HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Accessibility\Session<id>\ATConfig\osk` 键上创建符号链接，当 SYSTEM 权限进程复制该键时，跟随链接将攻击者控制的值写入任意注册表位置，从而实现本地提权\[^3\]。

* * *

## 2\. 源代码分析：正常的漏洞利用工具

### 2.1 Program.cs — 漏洞利用主逻辑

程序接受四个命令行参数： `--regKey` 、 `--regValueName` 、 `--regValueData` 、 `--regValueType` ，执行以下流程：

1.  **读取目标注册表值**：检查 HKLM 下目标键是否存在
    
2.  **获取会话路径**：通过 `GetTokenInformation` 获取当前会话 ID，构造 ATConfig 路径
    
3.  **启动隐藏 OSK 进程**：通过 `ShellExecuteEx` 以隐藏窗口模式启动 `osk.exe`
    
4.  **写入注册表值**：在 `HKCU\...\ATConfig\osk` 下写入攻击者控制的值
    
5.  **设置 Oplock**：对 `oskmenu.xml` 文件设置独占锁
    
6.  **锁定工作站**：调用 `LockWorkStation()` 触发辅助功能流程
    
7.  **竞争窗口利用**：当 Oplock 被触发时，删除原注册表键并创建符号链接指向目标
    
8.  **清理**：删除符号链接，验证提权是否成功
    

### 2.2 WindowsApi.cs — API 声明

声明了所需的 Windows API 函数，包括 `NtDeleteKey` 、 `RegCreateKeyExW` 、 `RegSetValueExW` 、 `ShellExecuteEx` 、 `LockWorkStation` 等，以及相关常量（ `REG_OPTION_CREATE_LINK` 、 `REG_LINK` 等）。

### 2.3 源码结论

**源代码本身是正常的安全研究工具**，不含任何恶意网络通信、文件下载、持久化或数据窃取行为。所有逻辑均围绕注册表符号链接竞争条件提权展开。

* * *

## 3\. 木马发现：隐藏在 NuGet 包中的恶意载荷

### 3.1 异常文件发现

在 `packages\NtApiDotNet.1.1.33\lib\netstandard2.0\` 目录下发现了一个名为 `Reg_Pwn_1.5.zip` 的文件（580,808 字节，创建时间 2026/3/29）。

### 3.2 官方包验证

通过检查 `.nupkg` 原始归档内容，确认 **官方 NtApiDotNet 1.1.33 包中不包含此文件**。官方包的 `lib/netstandard2.0/` 目录仅包含：

| 文件  | 大小  | 说明  |
| --- | --- | --- |
| `NtApiDotNet.dll` | 2,832,896 | 程序集 |
| `NtApiDotNet.xml` | 2,580,492 | XML 文档 |

`Reg_Pwn_1.5.zip` 是在 NuGet 包恢复后被 **人为注入** 的。

### 3.3 NtApiDotNet.dll 完整性验证

对 DLL 进行哈希比对，确认未被篡改：

```
官方 nupkg 内 DLL SHA256: 7600888EA1AD6C61D67F1BC221D17E6F5D1D6C88EE4531148241B55A2EC22C79
本地解压 DLL SHA256:      7600888EA1AD6C61D67F1BC221D17E6F5D1D6C88EE4531148241B55A2EC22C79
```

哈希完全一致，DLL 内部不存在加载 zip 的逻辑。

### 3.4 ZIP 内容分析

| 文件  | 大小  | 说明  |
| --- | --- | --- |
| `Launcher.cmd` | 26 字节 | 启动器 |
| `lua51.exe` | 872,448 字节 | 木马化 LuaJIT 解释器 |
| `rest.txt` | 299,679 字节 | VM 混淆 Lua 载荷 |

#### Launcher.cmd 内容

```
start lua51.exe rest.txt
```

#### VirusTotal 验证结果

**lua51.exe** （SHA256: `3EE51B5F9579B775E87EDB23C238650A512C2FE46EFC06694CD906A771727F97` ）：

-   **48/69** 个安全厂商标记为恶意
    
-   威胁标签： **trojan.lazy/convagent**
    
-   威胁类别：trojan + PUA
    
-   编译器：Microsoft Visual C/C++ 19.36.35724 (Visual Studio 2022)
    
-   实际为 **LuaJIT 2.1.0-beta3** 编译的 PE64 可执行文件
    

**rest.txt** （SHA256: `58448CB79F50CF71408E7EABFE7E0718E77A09910FD59963F83840B67FAA245F` ）：

-   **26/60** 个安全厂商标记为恶意
    
-   威胁标签： **trojan.mldk/ravartar**
    

**VT 社区标签**： `#cobalt-strike #icedid #luca-stealer #njrat #satacom` \[^4\]

* * *

## 4\. 编译安全性分析：编译过程是否会中招

### 结论：编译过程不会触发木马，编译产物不包含恶意代码。

### 4.1 逐环节验证

#### 环节 1：C# 编译器引用范围

`.csproj` 中对 NtApiDotNet 包的唯一引用：

```
<Reference Include="NtApiDotNet, Version=1.0.0.0, ...">
  <HintPath>packages\NtApiDotNet.1.1.33\lib\net461\NtApiDotNet.dll</HintPath>
</Reference>
```

编译器只引用 `net461\NtApiDotNet.dll` ，而 `Reg_Pwn_1.5.zip` 位于 `netstandard2.0\` 目录下，路径不在编译器引用范围内。

#### 环节 2：构建事件检查

| 检查项 | 结果  |
| --- | --- |
| `.csproj`<br><br>PreBuildEvent | 空（ `<PreBuildEvent></PreBuildEvent>` ） |
| `.csproj`<br><br>PostBuildEvent | 空   |

#### 环节 3：dnMerge 构建目标

`dnMerge.targets` 在 `AfterTargets="CopyFilesToOutputDirectory"` 时执行，仅处理 `ReferenceCopyLocalPaths` （即被复制到输出目录的.NET 程序集 DLL）。`.zip` 文件不是.NET 程序集，不在处理列表中。

#### 环节 4：NuGet 包机制

NuGet 的 `lib/` 目录约定：只有 `.dll` （引用程序集）和 `.xml` （文档）会被 MSBuild 识别和处理。其他类型的文件（如 `.zip` ）被完全忽略，不会被复制到输出目录，也不会被嵌入程序集。

`.nupkg` 中不存在 `content/` 、 `contentFiles/` 、 `tools/install.ps1` 、 `init.ps1` 等自动执行机制。

#### 环节 5：源代码引用检查

对项目所有源文件（`.cs` 、`.csproj` 、`.sln` 、`.config` 、`.targets` 、`.props` ）进行字符串搜索，查找 `Reg_Pwn` 、 `zip` 、 `Launcher` 、 `lua51` 、 `rest.txt` 等关键词—— **无任何匹配结果**。

### 4.2 编译产物内容

编译 + dnMerge 后， `RegPwn.exe` 中包含：

| 组件  | 来源  |
| --- | --- |
| RegPwn 的 IL 代码 | `Program.cs`<br><br>、 `WindowsApi.cs` 、 `Config.cs` 编译 |
| NtApiDotNet.dll 的 IL 代码 | dnMerge 合并 |

**不包含** `Reg_Pwn_1.5.zip` 、 `lua51.exe` 、 `rest.txt` 、 `Launcher.cmd` 中的任何内容。

### 4.3 编译安全性总结

| 行为  | 是否安全 |
| --- | --- |
| 编译项目（ `msbuild` / `dotnet build` ） | **安全** |
| 运行编译后的 `RegPwn.exe` （基于此源码） | **安全** |
| 手动解压并运行 `Reg_Pwn_1.5.zip` | **中招** |
| 使用攻击者分发的预编译版本 | **可能中招** |
| 将此 `packages` 目录重新打包分发 | **传播风险** |

* * *

## 5\. 触发机制：什么情况下才会中招

### 5.1 核心结论

`Reg_Pwn_1.5.zip` 是一个被"放置"在 NuGet 包目录中的 **静态文件**。编译器不引用它，dnMerge 不处理它，NuGet 机制不复制它，DLL 也不加载它。 **唯一的感染途径是手动解压并运行 zip 中的 `Launcher.cmd` 。**

### 5.2 攻击者的投放策略

```
攻击者的设计思路：

1. 将木马嵌入正常安全工具的项目中
2. 借助 RegPwn/CVE-2026-24291 的知名度，受害者主动下载
3. 项目能正常编译 → 降低怀疑（"能编译说明没问题"）
4. 木马文件伪装在 NuGet 依赖包目录中 → 不易被注意到
5. 文件名 "Reg_Pwn_1.5.zip" 与项目名相关 → 看起来像正常组件
6. 通过社工话术或文档引导受害者手动执行
7. lua51.exe 是合法 LuaJIT → 部分杀软可能放行
8. rest.txt 是纯文本 → 进一步降低检测率
```

### 5.3 实际触发场景

#### 场景 1：社工诱导（最可能）

攻击者在分发被污染的 RegPwn 项目时，附带说明文档或聊天消息引导受害者解压运行。

#### 场景 2：开发者好奇心

开发者在浏览 `packages` 目录时发现 `Reg_Pwn_1.5.zip` ，误以为是工具的更新版本或附加组件，手动解压并双击运行。

#### 场景 3：预编译二进制分发

攻击者可能分发已被修改的预编译 `RegPwn.exe` （项目包含 `Confuser.crproj` 混淆配置，原始构建环境为 `C:\Users\Administrator.GOTHAM\` ），该版本可能在运行时自动释放并执行 zip 中的载荷。

* * *

## 6\. rest.txt 深度分析：VM 混淆与后门触发

### 6.1 混淆技术分析

`rest.txt` 是一个 299,679 字节的 Lua 脚本，使用 **专业级 VM-based 混淆器** 保护：

| 混淆技术 | 实现方式 |
| --- | --- |
| **自定义虚拟机** | 定义了一套完整的 VM 指令集，恶意逻辑编码为 VM 字节码，通过状态机变量 `U` 驱动执行 |
| **控制流平坦化** | 所有逻辑被转换为一个巨大的 `if-elseif` 状态机，用算术表达式计算跳转目标 |
| **字符串表洗牌** | `Ti()`<br><br>和 `ti()` 函数从索引表+数据表重建字符串，所有 API 名称均通过此方式动态构造 |
| **算术混淆** | 常量全部替换为等价算术表达式，如 `483267+-483267` 表示 `0` |
| **环境间接访问** | 通过 `getfenv()` 获取全局环境，所有函数调用通过 `i[Q[...]]` 间接索引 |
| **GC Finalizer 执行** | 使用 `newproxy` + `getmetatable` 设置 `__gc` 元方法，确保即使主流程失败也能执行清理代码 |
| **反篡改检测** | 解码出字符串 `"Tamper Detected!"` ，检测到调试/分析时终止执行 |

### 6.2 脚本结构

脚本外层结构为：

```lua
return(function(...)
    local U=function(U)-- 字符串解码函数
        local C,q=U[#U],""
        for r=1,#C,1 do q=q..C[U[r]] end
        return q
    end
    return(function(C,r,Q,g,J,Z,X,x,K,N,E,W,B,j,e,d,G,O,l,q,S,i,v,n)
        -- VM 主逻辑：巨大的 if-elseif 状态机
        ...
        U=#g
        return r(J)
    end,function(U,C) ... end, -- 闭包生成器
    ...
    )(
        r(X) -- 执行入口
    )
end)(
    getfenv and getfenv() or _ENV,
    unpack or table[U({2,1,{"\097\099\107","\117\110\112"}})], -- "unpack"
    newproxy, setmetatable, getmetatable, select, {...}
)
end)(...)
```

### 6.3 解码出的关键字符串

通过逆向 `Ti()` 和 `ti()` 字符串表函数，成功解码出以下 API 名称和标识：

| 解码字符串 | 用途  |
| --- | --- |
| `type` | Lua 类型检查 |
| `table` | 表操作库 |
| `string` | 字符串操作库 |
| `pcall` | 受保护调用（错误处理） |
| `find` | 字符串查找 |
| `value` | 值操作 |
| `number` | 数字类型 |
| `Tamper Detected!` | 反分析检测字符串 |

此外还解码出多个随机字符串（如 `t6ufEZE0BLjEu` 、 `RAbWe7UXlKBo` 等），疑似为变量名或配置标识符。

### 6.4 lua51.exe 二进制分析

`lua51.exe` 的 PE 分析结果：

| 属性  | 值   |
| --- | --- |
| 类型  | PE32+ executable (GUI) x86-64 |
| 编译器 | Microsoft Visual C/C++ 19.36.35724 (Visual Studio 2022) |
| 实际身份 | LuaJIT 2.1.0-beta3 |
| 区段  | .text,.rdata,.data,.pdata,.reloc |

**导入的 DLL**： `kernel32.dll` 、 `ntdll.dll` 、 `user32.dll` 、 `gdi32.dll` 、 `winmm.dll`

**关键导入函数**： `CreateProcessW` 、 `CreatePipe` 、 `CreateThread` 、 `GetExitCodeProcess` 、 `GetTempPathW` 等——这些函数支持进程创建、管道通信和线程创建，为后门功能提供底层能力。

### 6.5 后门触发流程

基于静态分析和 VirusTotal 沙箱行为分析，后门触发流程如下：

```
1. 启动阶段
   ├─ LuaJIT (lua51.exe) 加载 rest.txt
   ├─ 通过 getfenv() 获取全局环境访问权
   └─ 反篡改检查（检测失败则输出 "Tamper Detected!" 并退出）

2. 环境探测阶段
   ├─ 请求 http://ip-api.com/json/ 获取受害者地理位置
   └─ 连接 https://polygon.drpc.org/ 查询 Polygon 区块链智能合约
      获取动态 C2 地址

3. C2 通信阶段
   ├─ 连接主 C2: http://85.137.52.21/api/NTE3YjdjNWU1NjYzNjU2YTA1N2Y=
   │   └─ URL 参数为 Base64 编码的 XOR 加密 Bot ID
   └─ 等待 C2 下发指令

4. 载荷投递阶段
   ├─ 从 C2 下载并执行二级载荷
   └─ 已知投递的恶意软件家族: Cobalt Strike / njRAT / IcedID /
      Luca Stealer / Satacom
```

* * *

## 7\. C2 基础设施与攻击链路

### 7.1 主 C2 服务器

| 属性  | 值   |
| --- | --- |
| C2 URL | `http://85.137.52.21/api/NTE3YjdjNWU1NjYzNjU2YTA1N2Y=` |
| C2 IP | `85.137.52.21` |
| ASN | AS43641 (SOLLUTIUM EU Sp z.o.o.) |
| 地理位置 | 荷兰  |
| VT 检测率 | 10/91 安全商标记为恶意 |
| HTTP 状态 | 400（需要正确的 Bot ID 参数） |

### 7.2 Base64 参数解码

```
Base64 参数: NTE3YjdjNWU1NjYzNjU2YTA1N2Y=
解码结果:    517b7c5e5663656a057f
```

该值为 XOR 加密的 Bot 标识符（Hex 解码为 `Q{|^Vcej\x05\x7f` ），用于在 C2 服务器上标识受感染主机。

### 7.3 区块链 C2 解析

| 属性  | 值   |
| --- | --- |
| 区块链 RPC | `https://polygon.drpc.org/` |
| VT 检测率 | 4/92 |
| 用途  | 通过 Polygon 智能合约动态获取 C2 地址，实现抗封禁 |

攻击者创新性地利用 Polygon 区块链基础设施进行 C2 服务器地址的间接传递。恶意程序通过调用链上智能合约动态获取 C2 地址，使得传统的流量监测和溯源变得更加困难\[^5\]。

### 7.4 辅助网络基础设施

| IP 地址 | 国家  | ASN | VT 检测 | 用途  |
| --- | --- | --- | --- | --- |
| `85.137.52.21` | NL  | AS43641 | 10/91 | **主 C2 服务器** |
| `217.119.129.99` | LV  | AS207957 | 5/91 | 可疑 C2 节点 |
| `194.48.248.94` | BG  | AS200019 | 3/91 | 可疑 C2 节点 |
| `208.95.112.1` | US  | AS53334 | 1/91 | ip-api.com 解析 |
| `104.18.10.59` | \-  | AS13335 | 0/91 | Cloudflare CDN |

| 域名  | 用途  |
| --- | --- |
| `ip-api.com` | 受害者 IP 地理位置探测 |
| `polygon.drpc.org` | Polygon 区块链 RPC（C2 地址动态解析） |
| `assets.adobedtm.com` | 环境检测/合法性伪装 |
| `www.microsoft.com` | 环境检测 |

### 7.5 MITRE ATT&CK 映射

| 战术  | 技术  | 说明  |
| --- | --- | --- |
| TA0002 Execution | T1129 Shared Modules | 通过 LuaJIT 加载共享模块执行恶意代码 |
| TA0007 Discovery | T1046 System Info Discovery | 请求 ip-api.com 获取地理位置信息 |
| TA0011 C2 | T1071 Application Layer Protocol | HTTP 通信与 C2 服务器交互 |
| TA0011 C2 | T1568 Dynamic Resolution | 通过区块链智能合约动态解析 C2 |
| TA0005 Defense Evasion | T1027 Obfuscated Files | VM 混淆、字符串表洗牌、算术混淆 |
| TA0005 Defense Evasion | T1497 Virtualization/Sandbox Evasion | "Tamper Detected!" 反分析机制 |

* * *

## 8\. 完整 IOC 列表

### 8.1 文件 IOC

| 文件名 | SHA256 | VT 检测 | 说明  |
| --- | --- | --- | --- |
| `lua51.exe` | `3EE51B5F9579B775E87EDB23C238650A512C2FE46EFC06694CD906A771727F97` | 48/69 | LuaJIT 木马化解释器 (trojan.lazy/convagent) |
| `rest.txt` | `58448CB79F50CF71408E7EABFE7E0718E77A09910FD59963F83840B67FAA245F` | 26/60 | VM 混淆 Lua 载荷 (trojan.mldk/ravartar) |
| `Launcher.cmd` | `D71CDCDD390FB300904A7FDC31D56C0A3A728350ECA2DEBF3D00D7932DC14839` | 1/46 | 启动器 |
| `Reg_Pwn_1.5.zip` | `00884D5C51D9539CA937AFD04565C2646A8D9E6FEF0EAC5788B67CDFC9B36310` | 未提交 | 打包载体 |
| `lua51.exe` | `903ddc01ec499a5d2485f9daa18d01489534d8c561594c238c5dab0e120034d4` | 41/70 | LuaJIT 木马化解释器 (trojan.lazy/convagent) |
| `Launcher.cmd` | `6f44e6c57ec997c1a6679121d21cdabfffd745d40225e41904920a7b2830eb1c` | 3/60 | 启动器 |
| `BOF_Reg_Pwn_v3.8.zip` | `c5588d42251b6f3638180e6d8ca2a01cddd2cb537e67dbb97f6bda22c61e493c` | 41/65 | 打包载体 |

#### 补充哈希

| 算法  | lua51.exe 哈希 |
| --- | --- |
| MD5 | `AD4078B3E25D1A63C2CE4FB203AF6E38` |
| SHA1 | `C218F533813B39627346649651677AF803E04FBE` |
| imphash | `239817232DE32474CA0D6092D6694502` |

### 8.2 网络 IOC

| 类型  | 值（已脱毒） |
| --- | --- |
| C2 URL | `hxxp://85[.]137[.]52[.]21/api/NTE3YjdjNWU1NjYzNjU2YTA1N2Y=` |
| C2 IP | `85[.]137[.]52[.]21` |
| 可疑 IP | `217[.]119[.]129[.]99`<br><br>, `194[.]48[.]248[.]94` |
| 区块链 RPC | `hxxps://polygon[.]drpc[.]org/` |
| IP 探测 API | `hxxp://ip-api[.]com/json/` |
| Base64 参数 | `NTE3YjdjNWU1NjYzNjU2YTA1N2Y=`<br><br>→ `517b7c5e5663656a057f` |

### 8.3 已知投递的父级 ZIP 包（社工诱饵）

该木马载荷已被打包在 97 个以上的父级 ZIP 文件中在野外传播，以下为部分样本：

| 文件名 | SHA256 |
| --- | --- |
| `Absolutely-Skilled-v3.5.zip` | `0204515d5b437a343cd0fe1098c5dee672d7f8628a417da44977753529b88a55` |
| `Software_v3.8.zip` | `5ff4a962dd1aa0d255c42dcd0556d3eff2a01e594b6bb02328b8e8ee80523809` |
| `aether-ecosystem-v2.1-beta.2.zip` | `13e63c6bab3745586f735b453606c2f29ebba3ca8b9c1e4f00417b4dc7db3c65` |
| `Plus-Chat-Gpt-v3.6.zip` | `181df7e581cc4bd773f9c80f70eab84d45e82c9a27dbf7b379ade3422db3275b` |
| `DDO-ATTAC-BOT-MINECRAF-v2.9.zip` | `1ab9627f730d9633ff24f5227b36c423faf470bd991c230be17a7a26c69f9e95` |
| `plasma_appgrid_applet_granitic.zip` | `1f83f20c7f6200d13b173ca6e374a7d367f39c465a1ae451c7fd1700ebbbfff9` |
| `manager-codex-2.0.zip` | `352151a90cf8dc21f297f6ffa9d29693e87d0fdd80a129c4cbab464221f16867` |
| `rdt-cli-v1.7.zip` | `3e53a93bbb75cc2e281a05510c2243d2256eb0f77673a8264d386f20538120a7` |
| `xjtlu-ai-email-1.2.zip` | `1a43df3e4efb8faa7425c9c973197ddb8ef8556c798c9c07b7baee528314475f` |
| `browser_automation_successfactors_3.5-beta.4.zip` | `448976e03696fa95af0dc4746041d50723b9931021763be93957d7290ac031f2` |

* * *

## 9\. 攻击者画像与威胁评估

### 9.1 威胁标签

基于 VirusTotal 社区分析和沙箱行为：

-   **恶意软件家族**：trojan.lazy / convagent / mldk / ravartar
    
-   **投递的二级载荷**：Cobalt Strike（C2 框架）、njRAT（远控木马）、IcedID（银行木马）、Luca Stealer（信息窃取）、Satacom（下载器）
    

### 9.2 攻击模式

| 特征  | 描述  |
| --- | --- |
| **投递方式** | 伪装为游戏外挂、AI 工具、浏览器自动化插件、开源软件等 ZIP 包 |
| **技术特征** | LuaJIT VM 混淆 + 区块链 C2 解析（Polygon 智能合约）+ 多阶段载荷投递 |
| **活跃时间** | 2026年3月至今持续活跃，最新样本提交于 2026-08-17 |
| **目标群体** | 开发者、游戏玩家、企业用户（通过 AI/软件主题诱饵） |
| **C2 架构** | 主 C2（荷兰）+ 区块链动态解析 + 多节点冗余 |

### 9.3 攻击链路图

```
社工诱饵 (ZIP包)
  │  伪装为游戏外挂/AI工具/开源软件/安全工具
  ▼
Reg_Pwn_1.5.zip (或其他名称)
  │  包含 Launcher.cmd + lua51.exe + rest.txt
  ▼
Launcher.cmd
  │  执行: start lua51.exe rest.txt
  ▼
lua51.exe (LuaJIT 2.1.0-beta3)
  │  加载并解释执行 rest.txt
  ▼
rest.txt (VM 混淆 Lua 脚本)
  │
  ├─► 反篡改检测 ("Tamper Detected!")
  ├─► 环境探测 (ip-api.com → 地理位置信息)
  ├─► 区块链 C2 解析 (polygon.drpc.org → 动态 C2 地址)
  ├─► 主 C2 通信 (85.137.52.21 → 接收指令/上传数据)
  └─► 二级载荷投递
       ├─► Cobalt Strike (C2 框架)
       ├─► njRAT (远控木马)
       ├─► IcedID (银行木马)
       ├─► Luca Stealer (信息窃取)
       └─► Satacom (下载器)
```

* * *

## 10\. 防护建议与处置措施

### 10.1 立即处置

1.  **删除恶意文件**：删除 `packages\NtApiDotNet.1.1.33\lib\netstandard2.0\Reg_Pwn_1.5.zip`
    
2.  **不要运行** zip 中的任何文件
    
3.  **全盘杀毒扫描**：使用 Microsoft Defender 或其他 AV 对系统进行全面扫描
    
4.  **检查网络日志**：排查是否有对 `85.137.52.21` 、 `polygon.drpc.org` 的网络连接记录
    

### 10.2 溯源排查

1.  检查该项目的 **下载来源** （URL、分享者、仓库地址）
    
2.  检查系统是否有 `lua51.exe` 异常进程运行记录
    
3.  检查临时目录是否有从 C2 下载的未知可执行文件
    
4.  检查注册表启动项、计划任务是否有异常条目
    

### 10.3 安全实践

1.  **从官方渠道获取依赖**：通过 NuGet 包管理器重新还原 NtApiDotNet 包，而非使用项目内附带的 packages 目录
    
2.  **验证包完整性**：对 NuGet 包进行签名验证和哈希比对
    
3.  **不在项目中附带 packages 目录**：使用 `nuget restore` 或 `dotnet restore` 在构建时恢复依赖
    
4.  **对来源不明的安全工具保持警惕**：即使能正常编译，也需检查依赖包目录中是否存在异常文件
    

### 10.4 YARA 检测规则（参考）

```bash
rule RegPwn_Trojanized_Package {
    meta:
        description = "Detects trojanized RegPwn package with lua51.exe + rest.txt"
        date = "2026-08-23"
        severity = "high"
    strings:
        $launcher = "start lua51.exe rest.txt" ascii
        $luajit = "LuaJIT 2.1.0-beta3" ascii
        $tamper = "Tamper Detected!" ascii
        $c2_ip = "85.137.52.21" ascii
        $c2_b64 = "NTE3YjdjNWU1NjYzNjU2YTA1N2Y=" ascii
    condition:
        ($launcher and $luajit) or ($tamper and any of ($c2_*))
}
```

* * *

## 参考来源

\[^1\]: MDSec, "RIP RegPwn", https://www.mdsec.co.uk/2026/03/rip-regpwn/

\[^2\]: 77169.net, "CVE-2026-24291:Windows ATConfig辅助功能本地提权漏洞深度解析", https://www.77169.net/html/353997.html

\[^3\]: HackTricks, "Secure Desktop Accessibility Registry Propagation LPE (RegPwn)", https://hacktricks.wiki/en/windows-hardening/windows-local-privilege-escalation/secure-desktop-accessibility-registry-propagation-regpwn.html

\[^4\]: VirusTotal Community, lua51.exe analysis, https://www.virustotal.com/gui/file/3ee51b5f9579b775e87edb23c238650a512c2fe46efc06694cd906a771727f97/community

\[^5\]: 安全内参, "从开源仓库到链上C2:一起利用GitHub与AI热点的规模化攻击活动分析", https://www.secrss.com/articles/89114

* * *

*本报告基于对 `tracyliving606/RegPwn` 项目的静态分析、VirusTotal 沙箱行为分析及开源威胁情报综合编写。*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/53ae67ca79c9a242.gif)

学习网安实战技术，戳“阅读原文”
