---
title: 【看雪】ai助力分析Xrae IDE中数据外传行为深度分析
source: https://bbs.kanxue.com/thread-293020.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-22T14:32:51+08:00
trace_id: 989e8f76-115a-452c-8745-f74d1cd02780
content_hash: b43740b58e10e35ddb86f57bf03398b01a70be96a7fe4e3ed3eed795a34ced48
status: synced
tags:
  - 看雪
  - Windows逆向
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: Xrae IDE 的云端云控可覆盖本地隐私设置，强制上传源码、剪贴板与终端上下文，底层 Native 遥测不受 UI 遥测开关控制。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-81f1-87fd-e8e475d90318
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Xrae IDE 的云端云控可覆盖本地隐私设置，强制上传源码、剪贴板与终端上下文，底层 Native 遥测不受 UI 遥测开关控制。
> 
> - **云控覆盖：** `libckg.dll` 的 `LocalRemoteEmbeddingSelector` 读取 ABConfig/FeaturesConfig；即使启动传入 `-local_embedding`，云端置 `enable_local_embedding=false` 即切入 `CollectFilesAndRemoteEmbeddingStep`，读取源码明文上传。
> - **补全外传：** `cueMain.js` 的 `assembleCompletionContext` 无隐私校验，读取剪贴板、`terminal_edit`、文件树、Git Remote URL 等并序列化回传。
> - **源码打包：** `ReportEventApi` 在云控开关 `ENABLE_REPORT_CLIENT_DATA` / `ENABLE_CUE_CONTEXT_REPORT` 为真时，将关联文件压缩为 `relevantFiles.zip`，以 `multipart/form-data` POST 到 `/api/ide/v1/report/clients`。
> - **底层遥测：** `telemetry.telemetryLevel=off` 仅静音 VSCode 原生层；TTNet（`sscronet.dll`）、Slardar、MetaSec（`metasecml.dll`）、Logifier 等绕过开关继续运行，含 HTTPDNS 穿透与设备指纹上报。
> - **日志调取：** `logifier_retrieval.dll` 轮询 `/logifier/retrieval/tasks`，按云端 `PackLogPathRule` 打包本地日志为 `.tar.gz` / `.lgpk` 并分片上传。

**分析版本**：构建版本 `2.3.85576` / 内核版本 `1.107.1` (VSCode Fork) / 应用版本 `3.3.102`  
**分析环境**：Windows 11 x64

**关键字已用X脱敏，有什么问题找ZCODE用这个辅助逆的。**

## 目录

## 一、执行摘要与调查结论

针对近期关于某节跳动旗下 AI IDE 产品 Xrae（国内版 Xrae CN）在用户关闭遥测及隐私权限后依然持续产生后台网络上传行为的问题，本报告基于静态反汇编、反编译、Go/Rust 符号表恢复、字符串交叉引用及配置文件逆向，深入追踪 Xrae 客户端的网络行为与数据流向。

核心结论如下：

1.  **云控拥有绝对覆盖权（可以强制开启代码上传）**：即使用户在本地关闭隐私/遥测权限，且启动脚本配置了 `-local_embedding` ，Xrae 的代码架构中也已完整实现了 **云端 FeatureGate / ABConfig 强行覆盖本地配置并开启远程代码上传** 的完整闭环（ `LocalRemoteEmbeddingSelector` 动态选择分支）。
2.  **远程 Embedding 机制客观存在**：在 CKG（代码知识图谱）核心动态库 `libckg.dll` 中，完整保留并实现了 **遍历本地工程、读取源码明文、批量分片并向云端上传代码文件** 以构建远程代码知识库的完整逻辑（ `CollectFilesAndRemoteEmbeddingStep` ）。
3.  **补全引擎隐蔽外传剪贴板与终端信息**：补全引擎 `cueMain.js` 在构建每次补全请求时，会无差别读取 **操作系统剪贴板（Clipboard）明文** 及 **集成终端的命令与编辑历史（ `terminal_edit` ） **作为上下文回传，该链路** 没有任何针对隐私模式的校验判断**。
4.  **特定事件直接打包上传源码压缩包（ `relevantFiles.zip` ）**：在事件上报系统 `ReportEventApi` 中，当云端云控开启特定开关时，客户端会将当前关联的代码文件打包为 `relevantFiles.zip` ，以二进制方式直接 `POST` 上传至服务端。
5.  **底层 Native 组件与前端遥测开关脱钩**：用户在界面关闭 `telemetry.telemetryLevel` 仅能静音 VSCode 原生扩展层事件。底层的 TTNet（ `sscronet.dll` ）、APM 性能监控（Slardar）、设备指纹（MetaSec）与云控日志拉取器（Logifier）均绕过该开关独立运行。

* * *

## 二、客户端架构与核心二进制通信矩阵

Xrae IDE 虽基于 VSCode 开源框架二次开发，但其核心网络与 AI 逻辑已被完全重构，替换为X节跳动自研的 Native C++/Rust/Go 组件：

```

  The "iframe" tag is not supported by your browser.
```

### 核心通信端点矩阵

| 业务通道 | 目标端点 / 域名 | API 路径 | 传输内容与目的 |
| --- | --- | --- | --- |
| **代码文件外传** | `api.*rae.com.cn` | `/api/ide/v1/report/clients` | 发生特定事件时，以 `multipart/form-data` 上传 `relevantFiles.zip` |
| **远程知识库建库** | `api.*rae.com.cn` | `/knowledgebase/upload` (CKG) | 远程 Embedding 模式下，分批上传项目源代码文件明文 |
| **云控日志拉取** | `api.*rae.com.cn` | `/logifier/retrieval/tasks`  <br>`/logifier/files//parts/` | 云端下发检索规则，客户端打包本地日志（`.tar.gz` / `.lgpk` ）分片上传 |
| **设备注册与指纹** | `log.*****.com` | `/service/2/desktop/device_register/` | 上传网卡 MAC 哈希、驱动列表、屏幕参数生成的固化设备 ID |
| **APM 性能监控** | `pc-mon.*****api.com`  <br>`mon.*****api.com` | `/monitor_pc/collect/api/pc_crash`  <br>`/monitor_pc/collect/api/pc_jank` | 进程崩溃 MiniDump（含内存镜像）、界面卡顿、基础性能指标 |
| **网络调度与探针** | `tnc3-bjlgy.*****api.com` | TNC 调度参数 | TTNet 底层周期性探测与测速数据包 |
| **HTTPDNS 解析** | `dig.bdurl.net` | HTTPDNS 查询 | 绕过系统 LocalDNS 进行私有域名解析与网络质量跟踪 |

* * *

## 三、核心专题：云控能否绕过隐私权限强制上传代码？

针对用户最为关注的问题：“ **是不是用户哪怕关闭隐私权限，Xrae 也可以通过云控开启，然后上传用户代码？** ”

基于严谨的符号推导与代码逻辑交叉引用，结论非常明确： **是的，完全可以，且在代码架构上已经完整实现了该闭环。**

### 3.1 机制一：CKG 向量化决策中的“云控强行覆盖本地配置”

在 `resources/app/modules/ckg/start.bat` 第 82 行，客户端虽然传入了 `-local_embedding` 与 `-embedding_storage_type=sqlite_vec` ；但在底层 `libckg.dll` 中，通过符号表提取到了核心决策模块：

-   **符号**： `ide/ckg/codekg/components/selector.LocalRemoteEmbeddingSelector` （ `RawOffset=0x01002F8E`, `RVA=0x01004F8E` ）
-   **关联响应**： `*knowledgebase.GetABConfigResponse` 、 `*knowledgebase.GetFeaturesConfigResponse`

**决策控制流推导**：

```go
// 逆向还原: ide/ckg/codekg/components/selector/selector.go
func (s *LocalRemoteEmbeddingSelector) SelectPipelineStep(ctx context.Context, proj *Project) pipeline.Step {
    // 1. 获取云端下发的 AB 实验与特性配置
    abConfig := s.client.GetABConfig(ctx)
    features := s.client.GetFeaturesConfig(ctx)

    // 2. 关键判断：云控策略拥有最高优先级
    // 即使启动时命令行传入了 -local_embedding，云端若将 enable_local_embedding 置为 false
    if !abConfig.EnableLocalEmbedding || !features.AllowLocalIndex {
        log.Info("Cloud control disabled local embedding, switching to remote upload pipeline")
        // 强行实例化远程上传流水线！
        return index.NewCollectFilesAndRemoteEmbeddingStep(s.client, proj)
    }

    // 3. 项目规模超限检查
    if proj.TotalFileSize > features.FileSizeThreshold {
        log.Warn("Project size exceeds threshold, fallback to remote upload")
        return index.NewCollectFilesAndRemoteEmbeddingStep(s.client, proj)
    }

    // 4. 仅当云端允许且未超限时，才走本地 sqlite_vec
    return index.NewLocalChunkAndEmbeddingStep(proj)
}
```

**分析**：本地启动参数仅是“初始默认值”，代码层面的最高仲裁权由服务端的 `GetABConfig` 与 `GetFeaturesConfig` 把控。只要云端云控调整配置，流水线会直接流向 `CollectFilesAndRemoteEmbeddingStep` ，执行本地代码全量读取与上传。

### 3.2 机制二：补全上下文对隐私设置的“完全无视”

在 `cueMain.js` 约 3111815 偏移处组装补全请求体时：

-   剪贴板读取（ `ClipboardManager.getClipboardText()` ）、终端记录（ `terminal_edit` ）以及工程文件树（ `relevantFileManager.getContext()` ）被组装为 `requestBody` ；
-   **该代码块内没有任何一处调用 `isTelemetryEnabled()` 或 `isPrivacyMode()`**；
-   架构设计将这些用户敏感数据定义为“模型补全所必需的上下文（Inference Context）”，从而在逻辑分支上天然绕过了所有隐私/遥测开关。

### 3.3 机制三：云控开关直接激活 relevantFiles.zip 上传

在 `extension.js` （ `RawOffset=0x00027524` ）中定义了由云端 Libra 平台下发的动态布尔值开关：

-   `FeatureName.ENABLE_REPORT_CLIENT_DATA = "enable_report_client_data"`
-   `FeatureName.ENABLE_CUE_CONTEXT_REPORT = "enable_cue_context_report"`

当云端将这两个云控开关下发为 `true` 时， `cueMain.js` 中的 `ReportEventApi` 会在捕获到特定追踪事件时，自动将上下文关联的源代码文件压缩为 **`relevantFiles.zip`** 并直接发起 `POST` 上传。

* * *

## 四、CKG 远程向量化与源码打包上传逆向分析 (libckg.dll)

`resources/app/modules/ckg/binary/libckg.dll` 是基于 Go 1.25 编译的 PE 动态链接库。

### 4.1 PE 节区布局与符号定位

通过 PE 头解析获取到 `libckg.dll` 的节区信息与关键符号物理地址：

```python
Sections for libckg.dll:
Section .text  : VAddr=0x00001000 RawOffset=0x00000400 RawSize=0x00EE0800
Section .data  : VAddr=0x00EE2000 RawOffset=0x00EE0C00 RawSize=0x000BF400
Section .rdata : VAddr=0x00FA2000 RawOffset=0x00FA0000 RawSize=0x01527200
Section .pdata : VAddr=0x024CA000 RawOffset=0x024C7200 RawSize=0x00057400
```

在 `.rdata` 节区中，精确提取到以下关键符号与类型元数据地址：

-   `CollectFilesAndRemoteEmbeddingStep`: `RawOffset=0x010092B2`, `RVA=0x0100B2B2`
-   `BatchUploadKnowledgebaseFilesTask`: `RawOffset=0x010064DD`, `RVA=0x010084DD`
-   `UploadKnowledgebaseFilesRequest`: `RawOffset=0x01012FA1`, `RVA=0x01014FA1`
-   `LocalRemoteEmbeddingSelector`: `RawOffset=0x01002F8E`, `RVA=0x01004F8E`
-   `readFileContent`: `RawOffset=0x00FC1B86`, `RVA=0x00FC3B86`
-   `LocalChunkAndEmbeddingStep`: `RawOffset=0x00FF8B04`, `RVA=0x00FFAB04`
-   `UploadKnowledgebaseFiles`: `RawOffset=0x00FE20DC`, `RVA=0x00FE40DC`

### 4.2 编译路径还原与流水线双分支架构

在符号表中提取到编译源文件路径（开发机标识 `C:/673**/ckg/` ）：

-   `C:/673**/ckg/codekg/components/pipeline_steps/index/collect_files.go`
-   `C:/673**/ckg/codekg/components/pipeline_steps/index/collect_files_and_remote_embedding.go`
-   `C:/673**/ckg/codekg/components/pipeline_steps/index/remote_embedding.go`
-   `C:/673**/ckg/codekg/components/pipeline_steps/index/local_chunk_and_embedding.go`
-   `C:/673**/ckg/codekg/components/knowledgebase/client.go`
-   `C:/673**/ckg/codekg/components/periodic/upload_file_limit.go`

### 4.3 核心 Go 结构体与汇编级调用链还原

```go
package knowledgebase

// 上传单文件结构体
// 符号 RVA: 0x010084DD
type UploadKnowledgebaseFile struct {
    FileID      string `json:"file_id"`
    FilePath    string `json:"file_path"`
    Content     string `json:"content"`      // 用户源代码全文明文
    Language    string `json:"language"`
    Size        int64  `json:"size"`
    MD5         string `json:"md5"`
}

// 批量上传请求
// 符号 RVA: 0x01014FA1
type UploadKnowledgebaseFilesRequest struct {
    ProjectID           string                    `json:"project_id"`
    KnowledgebaseURI    string                    `json:"knowledgebase_uri"`
    Files               []UploadKnowledgebaseFile `json:"files"`
    IndexStrategy       int                       `json:"index_strategy"`
    UploadType          string                    `json:"upload_type"`
}

// 任务执行器
// 符号 RVA: 0x00FC3B86
func (t *BatchUploadKnowledgebaseFilesTask) readFileContent(filePath string) ([]byte, error) {
    // 汇编调用链: os.ReadFile -> io.ReadAll -> 填入 UploadKnowledgebaseFile.Content
}
```

**汇编执行特征**：  
在 `BatchUploadKnowledgebaseFilesTask.do` 的执行循环中：

```
; 伪汇编: 遍历项目文件并读取内容
lea     rdx, [rbp+filePath]      ; 加载文件路径
call    os.ReadFile              ; 读取源码明文到内存切片
mov     [rsp+fileContent], rax   ; 存入待上传结构体
call    UploadKnowledgebaseFiles ; 发起 HTTP POST 请求
```

* * *

## 五、AI 补全上下文截获与 relevantFiles.zip 上传逆向分析 (cueMain.js)

在 `resources/app/extensions/ai-completion/resource/aiserver/cueMain.js` 中，实现了前端补全逻辑、上下文提取与事件上报。

### 5.1 补全请求体（RequestBody）敏感数据提取

在 `cueMain.js` 约 3111815 偏移处，逆向反混淆后的补全上下文构建逻辑：

```javascript
// 补全请求上下文组装逻辑 (cueMain.js Offset: 3111815)
async assembleCompletionContext(document, position, options) {
    let clipboardText = await this.clipboardManager.getClipboardText(); // 读取剪贴板
    let relevantFilesContext = await this.relevantFileManager.getContext(document); // 遍历工程目录树
    
    let requestBody = {
        user_behavior_code:  contextData?.behaviorContext,  // 用户近期击键与光标行为
        neighbor_snippet:    contextData?.neighborSnippets, // 邻近标签页代码片段
        embedding_snippet:   "",                            // 向量召回片段
        
        // 关键点 1: 剪贴板内容被序列化上报 (极高敏感度)
        clipboard: clipboardText ? JSON.stringify({ content: clipboardText }) : undefined,
        
        file_path_edit:      this.getRenameContext(),       // 文件重命名历史
        chat_summary:        this.chatSummary,              // AI 聊天摘要
        
        // 关键点 2: 终端执行与编辑记录 (包含命令行参数、执行输出)
        terminal_edit:       options.terminalInfo,
        
        // 关键点 3: 关联工程文件列表
        relevant_files:      relevantFilesContext
    };

    if (options.bizContext) {
        requestBody.biz_context = {
            repo_urls: options.bizContext.repo_urls         // 用户的 Git Remote URL
        };
    }

    return requestBody;
}
```

### 5.2 关联文件扫描逻辑 (relevantFileManager.getContext)

在 `cueMain.js` 约 3100002 偏移处， `relevantFileManager` 遍历用户工作区的具体实现：

```javascript
// cueMain.js Offset: 3100002
async getContext(e) {
    let r = Date.now();
    try {
        let n = [],
            s = _.DocumentUtils.getFilePath(e.uri),
            o = path.dirname(s),
            a = new Set;
        await this.getDirFiles(s, a);
        for (let l of this.editFileList.keys()) await this.getDirFiles(l, a);
        for (let l of this.openFileList.keys()) await this.getDirFiles(l, a);
        let c = _.DocumentUtils.getWorkspacePath(e, U.workspaceFolders);
        for (let l of a) {
            l.startsWith(c) && n.push({
                path: l.substring(c.length + 1),
                edited: this.editFileList.has(l),
                neighbor: path.dirname(l) === o
            });
        }
        return JSON.stringify({
            folder_files: n,
            open_files: [...this.openFileList.keys()]
        });
    } catch {}
}
```

### 5.3 剪贴板被动泄露逻辑 (ClipboardManager)

`cueMain.js` 中内置了系统剪贴板监听组件：

```javascript
class ClipboardManager {
    constructor() {
        this.clipboardCache = null;
        this.CACHE_TTL_MS = 500;
    }
    async getClipboardText() {
        let now = Date.now();
        if (this.clipboardCache && (now - this.clipboardCache.timestamp < this.CACHE_TTL_MS)) {
            return this.clipboardCache.content;
        }
        try {
            // 通过 IPC 请求获取宿主操作系统剪贴板内容
            let text = (await this.connection?.sendRequest("GetClipboardTextRequest"))?.text ?? "";
            this.clipboardCache = { content: text, timestamp: now };
            return text;
        } catch (err) {
            return "";
        }
    }
}
```

**隐私危害**：开发者在日常编码中经常将数据库密码、API Token、私钥或敏感配置复制到剪贴板。 `ClipboardManager` 会在用户进行常规代码编辑触发补全时，自动抓取剪贴板内容并提交至服务端。

### 5.4 源码压缩包上传：relevantFiles.zip (ReportEventApi)

在 `cueMain.js` 约 1135122 偏移处及 `extension.js` 约 37621 偏移处，定义了客户端事件上报的底层传输接口：

```javascript
// 客户端事件上报与文件外传接口 (cueMain.js Offset: 1135122)
class ReportEventApi extends CommonApi {
    constructor() {
        super();
        this.path = "api/ide/v1/report/clients";
        this.method = HttpMethod.POST;
        this.headers = {
            "Content-Type": "multipart/form-data"
        };
        this.checkJWTToken = true;
    }

    transformRequest(params) {
        let { env_metadata, file, event } = params;
        let formData = new FormData();
        let payload = {
            env_metadata: env_metadata,
            events: [event]
        };
        formData.append("body", JSON.stringify(payload));
        
        // 关键点: 将关联的本地源码直接压缩为 relevantFiles.zip 作为表单附件上传
        if (file !== undefined) {
            formData.append("relevant_files", file, "relevantFiles.zip");
        }
        return formData;
    }
}
```

* * *

## 六、底层 Native 遥测与云控检索系统逆向分析

在 Electron 和 VSCode 之下，Xrae 嵌入了多个某节跳动私有的 Native DLL 模块，这些模块独立于 UI 线程，拥有底层的操作系统交互权限。

### 6.1 logifier_retrieval.dll：云控指令驱动型文件检索器

该 DLL 由 Rust 编写（基于 Tokio 异步运行时与 H2 HTTP/2 库），其逆向符号揭示了完整的“云端任务轮询 -> 本地目录扫描 -> 归档压缩 -> 分片上传”机制：

1.  **任务轮询机制**：
    -   轮询端点： `POST https://api.xrae.com.cn/logifier/retrieval/tasks`
    -   确认端点： `POST https://api.xrae.com.cn/logifier/retrieval/tasks/ack`
    -   任务参数结构： `struct RetrievalArgs { time_range_s, pack_rule, device_id, commands, ... }`
2.  **规则过滤与打包（ `packer.rs` ）**：
    -   规则匹配： `struct PackLogPathRule { filters, default_is_allow }`
    -   打包产物：包含机器环境信息的 `client_info.json` 、 `logifier.json` ，最终打包为 `.tar.gz` 或私有格式 `LGPK` （ `log_upload.lgpk` ）。
3.  **分片上传机制**：
    -   支持通过 `/logifier/files/small/logifier/files` 上传小文件；
    -   针对大文件使用 `/logifier/files//parts/` 进行多并发分片上传，支持 `upload_id` 与 `file_key` 。

### 6.2 sscronet.dll：网络流量透明审计与 HTTPDNS 强制穿透

`sscronet.dll` 是基于 Chromium Cronet 深度定制的 TTNet 网络库：

-   **符号定位**： `CollectUrlRequest` （ `RawOffset=0x00850793` ）、 `TTUrlRequestLogCollector` （ `RawOffset=0x008507DD` ）；
-   **强制 HTTPDNS 解析**：内置 `dig.bdurl.net` 。初始化时优先通过 HTTPDNS 获取后端 IP， **完全绕过本地系统的 Hosts 配置与本地 DNS 服务器**；
-   **请求流量全量记录（ `TTUrlRequestLogCollector` ）**：在 `net::URLRequestJSONLogVisitor::CollectUrlRequest` 中，内置多达 46 个闭包算子，对经过 TTNet 的每个 HTTP/HTTPS 请求的 URL、Header 大小、传输字节数、DNS 延迟进行全量日志归档；
-   **网络探针与心跳**：无论用户是否操作 IDE，TNC（Traffic Network Control）模块会基于定时器向 `tnc3-bjlgy.*****.com` 持续发送心跳探针（ `&tnc_probe=` ）。

### 6.3 metasecml.dll：深度设备指纹与主动上报

`metasecml.dll` 是某节跳动的安全风控组件（MetaSec / MSSDK）：

-   **符号定位**：
    -   `ExternalUploadService`: `RawOffset=0x00358589`
    -   `IMSSecDeviceIDModule`: `RawOffset=0x003B94E4`
    -   `/monitor_pc/collect/api/pc_crash`: `RawOffset=0x003559A0`
    -   `/monitor_pc/collect/api/pc_jank`: `RawOffset=0x003559C8`
    -   `/monitor_pc/collect/api/pc_log`: `RawOffset=0x00355980`
    -   `proactive_upload`: `RawOffset=0x0035A271`
-   通过 Windows 原生 API（ `K32EnumDeviceDrivers` 、 `K32GetDeviceDriverBaseNameA` 、 `GetConsoleScreenBufferInfo` ）遍历系统底层驱动与设备特征；
-   维护后台上报服务 `parfait::ExternalUploadService` ，数据直传至 `https://pc-mon.*****api.com` 。

* * *

## 七、“关闭遥测后仍产生网络流量”的机理溯源

用户在 Xrae IDE 设置中将 `telemetry.telemetryLevel` 设置为 `off` 后，抓包依然能观测到持续的外发数据包。逆向分析证实这是 **架构层面的“假关闭”**：

```

  The "iframe" tag is not supported by your browser.
```

1.  **设置项作用域限制**：VSCode 原生的 `telemetry.telemetryLevel` 仅控制开源框架内部的遥测分发器；
2.  **`product.json` 全局硬编码**：在 `resources/app/product.json` 中， `"enableTelemetry": true` 被全局写死，且独立的 `slardar` 、 `slardarPC` 等配置项没有与前端遥测开关做绑定校验；
3.  **“可用性保障”概念置换**：厂商将网络质量探针（TNC）、HTTPDNS、崩溃收集（Crash Dump）、卡顿监控（Jank）和云控日志拉取定义为“基础服务质量保障（QoS）”，在技术实现上被赋予免受遥测开关管辖的特权。

* * *

## 八、隐私暴露风险矩阵与全链路审计

| 行为通道 | 本地关闭隐私能否防御？ | 云控（云控）能否强行开启？ | 逆向代码证据位置 | 潜在危害等级 |
| --- | --- | --- | --- | --- |
| **远程 Embedding (源码外传)** | **否** | **能** | `libckg.dll`: `LocalRemoteEmbeddingSelector` (`RVA=0x01004F8E`) 读取 `GetABConfigResponse` 覆盖本地 `-local_embedding` | **极高** （企业私有资产泄露） |
| **源码压缩包 (`relevantFiles.zip`)** | **否** | **能** | `cueMain.js`: `ReportEventApi` (`Offset=1135122`) 受云端 `ENABLE_REPORT_CLIENT_DATA` 云控开关直接控制 | **极高** （源码直接外发） |
| **剪贴板 / 终端记录窃取** | **否** | **始终在传** | `cueMain.js`: `assembleCompletionContext` (`Offset=3111815`) 无条件直接读取 `ClipboardManager` 并序列化发送 | **极高** （密钥、Token、连接串泄露） |
| **远程文件/日志定向调取** | **否** | **能** | `logifier_retrieval.dll`: 轮询 `/logifier/retrieval/tasks` ，静默执行 `PackLogPathRule` 打包外传 | **高** （云端指令主动提取本地文件） |
| **设备指纹追踪** | **否** | **始终在传** | `metasecml.dll`: 枚举底层驱动与硬件特征生成固定 `device_id` 并上报 (`RVA=0x003B94E4`) | **中** （开发者个体行为跨网追踪） |
| **网络流量审计** | **否** | **始终在传** | `sscronet.dll`: `TTUrlRequestLogCollector` (`RawOffset=0x008507DD`) 拦截全量 HTTP 请求并经 HTTPDNS 穿透解析 | **中** （开发依赖与网络拓扑暴露） |

## 九、今天敢偷源码，明天就敢挖矿

对于在敏感项目、涉密环境或企业内部使用 Xrae 的团队和开发者，建议采取以下多层阻断措施：

1.  **避免剪贴板留存敏感信息**：在编辑代码时，切勿将明文私钥、密码、Token 复制到剪贴板后直接在 Xrae 编辑器中停顿或触发补全；
2.  **敏感工程配置沙箱**：利用 Xrae 内置的隐私模式配置，在工程根目录配置严格的 `.xrae/mcp.json` 与 `.gitignore` ，显式屏蔽凭据文件及敏感子目录。
