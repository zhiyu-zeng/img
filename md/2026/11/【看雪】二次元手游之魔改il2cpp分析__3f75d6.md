---
title: 【看雪】二次元手游之魔改il2cpp分析
source: https://bbs.kanxue.com/thread-293642.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-24T10:11:14+08:00
trace_id: 23a8dd75-cd34-4ac2-adeb-7d5c4693d3bd
content_hash: 18d24f7467cd84461256effb17f0c78048f5b0961a936dc2e67f4b7802dcc3db
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - 游戏安全
series: null
feed_source: 看雪·Android安全
ai_summary: 某神对 Unity 引擎做了深度魔改：global-metadata.dat 使用自定义文件头（`MHY\0`），表头内嵌在 SO 中，字段经过乱序、异或编码和结构体改动，因此标准 il2cppDumper 无法直接使用，只能修改 dumper 主动适配。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 42275244-d011-812f-a32a-c2fcb4775012
ioc:
  cves: []
  cwes: []
  hashes:
    - 6b7507a3a3df153952bdcd2132f20fe9
    - 6cafa4bca3a25e1ee867bb0a6251b1cf
    - 6d64aa7911896144dca0e9d3a28289c0
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 某神对 Unity 引擎做了深度魔改：global-metadata.dat 使用自定义文件头（`MHY\0`），表头内嵌在 SO 中，字段经过乱序、异或编码和结构体改动，因此标准 il2cppDumper 无法直接使用，只能修改 dumper 主动适配。
> 
> - **入口差异：** metadata 文件前 4 字节为 `4D 48 59 00`（即 `MHY\0`），而标准样本是 `0xFAB11BAF`；0x04 处的版本号为 0，不能按标准版本 0 来解释，仅修改 magic 无法恢复文件。
> - **表头内嵌：** SO 内嵌 header 位于 `0x6088DC`，其前 3 字节转成字符串即 `MHY`；加载 global-metadata.dat 后数据基址直接取 `映射起点 + 0x210`，本地文件头被遗弃，解析用的是 SO 内 header。
> - **导出混淆：** 标准样本有 181 个 `il2cpp_*` 已定义动态导出，某神为 0 个；IDA 中显示的 32 位十六进制名是 `OBJECT` 类型的数据符号（位于 `.data`），不是导出函数，也不能据此认定命名算法为 MD5。
> - **字段解码：** 字段偏移与数量均被编码，例如 typeDefinitions 为 `U32(h-0x6D78B4A3)//70`、methodsCount 为 `(h-0x20203A23)//26`、stringOffset 为 `h^0x14100732`；结构体步长也发生变化（methodDefinition 为 0x1a，类型定义为 0x46）。
> - **字符串解密：** `mhy_Metadata_ResolveNameToken`（`0x475E6F0`）对标 `GetStringFromIndex`，token 高字节为长度、低 24 位为偏移，逐 8 字节异或并按 `0x2A803B50569DD0DB` 递推的密钥解密，结果带缓存；Hook 该函数可直接打印 `mscorlib.dll` 等名称。

早些年听闻二次元游戏某神是Unity引擎开发的游戏，并且Unity经过深度魔改，il2cppDumper 也拿它没办法。见多了il2cpp加固、global-metadata.dat魔改等等，能像某神这样从引擎彻头彻尾的魔改，还是第一次接触。我会从一份标准的Unity引擎入手，辅助分析某神libxxxxshen.so。

## 章节一、了解标准 il2cpp

### 1.1 IL2CPP 与 global-metadata.dat

IL2CPP 将托管程序集转换为 C++，再通过原生编译器生成机器码。在 Android 平台，标准构建通常可以看到承载 IL2CPP 运行时及生成代码的 `libil2cpp.so` ，以及保存元数据的 `global-metadata.dat` 。

`global-metadata.dat` 主要描述程序集、类型、方法、字段、参数及字符串等信息。它与 SO 中的原生代码、注册表配合，供运行时建立类型和方法对象。方法的原生机器码位于 SO 中，不能只靠 metadata 文件取得完整实现。

### 1.2 标准 global-metadata.dat 格式

标准文件以 `Il2CppGlobalMetadataHeader` 开头。以本文参考版本为例，文件头前部如下，后续还有其他表的偏移和大小字段：

```cpp
struct Il2CppGlobalMetadataHeader
{
    int32_t sanity;                 // 固定标识：0xFAB11BAF
    int32_t version;                // metadata 格式版本
    int32_t stringLiteralOffset;
    int32_t stringLiteralCount;
    int32_t stringLiteralDataOffset;
    int32_t stringLiteralDataCount;
    int32_t stringOffset;
    int32_t stringCount;
    // 后续为事件、属性、方法、字段、类型等表的信息。
};
```

这里的 `Offset` 用于定位相对文件起点的数据区域。许多 `Count` 字段表示表的字节大小，例如方法记录数需要通过 `methodsCount / sizeof(Il2CppMethodDefinition)` 计算，不能把所有 `Count` 都直接当作记录条数。具体布局随 metadata 版本变化。

当前标准样本的前 8 字节为：

```
文件偏移    原始字节          小端解释
0x00        AF 1B B1 FA       sanity  = 0xFAB11BAF
0x04        18 00 00 00       version = 24
```

`sanity` 用于识别格式， `version` 用于判断结构版本。本文参考的标准初始化代码会检查 `sanity == 0xFAB11BAF` 、 `version == 24` ；这里的 24 属于当前标准样本，并非所有 Unity 版本都固定为 24。

### 1.3 libil2cpp.so 的导出函数

当前标准 `libil2cpp.so` 中可以直接找到具有明确语义的 IL2CPP API 导出名，例如：

| 导出函数 | 地址  | 作用  |
| --- | --- | --- |
| `il2cpp_string_new` | `00000000003E77C8` | 从 UTF-8 字符串创建托管字符串 |
| `il2cpp_assembly_get_image` | `00000000003E71C8` | 获取程序集对应的 image |
| `il2cpp_string_intern` | `00000000003E77D8` | 获取或建立字符串驻留项 |

这三个条目在 ELF 动态符号表中的类型均为 `FUNC` ，位于 `.text` 。这些名称使我们能够从导出表直接定位对应 API，再继续追踪其内部实现。

## 章节二、快速了解某神魔改 il2cpp + global-metadata.dat

### 2.1 本次使用的样本文件

| 文件名 | 本次分析中的角色 |
| --- | --- |
| `libxxxxshen.so` | 包含某神定制 IL2CPP 运行时及业务代码的原生库，是本次 IDA 分析的主要对象 |
| `global-metadata.dat` | 定制 metadata 主文件，文件头和数据解析方式与标准格式存在差异 |
| `global-metadata.md5` | 配套的 32 字节文本文件，内容为十六进制字符串；具体校验对象和使用方式需结合调用代码确认 |
| `startup-metadata.dat` | 初始化阶段与 `global-metadata.dat` 一起加载的辅助元数据文件 |

**`libxxxxshen.so` 是非标准、经过定制的 IL2CPP 实现，不能直接按标准 `libil2cpp.so` 的导出名和数据结构套用。** 它并不是简单改了一个库文件名；metadata 布局和运行时解析逻辑也发生了变化。

### 2.2 当前 metadata 的 sanity 与标准格式的区别

直接读取两份 `global-metadata.dat` 的开头，可以看到：

| 对比项 | 标准样本 | 当前某神样本 |
| --- | --- | --- |
| 文件前 4 字节 | `AF 1B B1 FA` | `4D 48 59 00` |
| 按小端 `uint32_t` 读取 | `0xFAB11BAF` | `0x0059484D` |
| ASCII 表现 | 标准二进制标识 | `MHY\0` |
| 偏移 `0x04` 的 4 字节 | `18 00 00 00` ，标准版本号 24 | `00 00 00 00` ，不能据此认定为标准版本 0 |
| 能否直接套用标准文件头 | 当前标准样本可以 | 不可以，需要追踪定制解析逻辑 |

严格地说， `sanity` 是标准结构中的字段名。这里把某神文件偏移 `0x00` 的四字节标识放在相同位置比较，并不表示已经确认它与标准字段具有完全相同的校验语义。

因此，把 `MHY\0` 改成标准 magic 并不足以恢复文件。识别标记不同只是入口处最直观的差异，后面的表头来源、偏移、记录布局及字段解释仍需要与运行时代码对应。

### 2.3 libxxxxshen.so 的导出与名称混淆

标准库保留的 `il2cpp_*` API 导出名，在当前 `libxxxxshen.so` 的动态导出表中已不可见。对原始 ELF 进行核对，标准样本有 181 个以 `il2cpp_` 开头的已定义动态导出，当前某神样本为 0。

可以将其理解为 IL2CPP 标准导出名被混淆，跟某盾等加固SDK对比，这是无法恢复的。但仍可通过函数行为、调用关系和标准实现对照，重新识别内部功能。

下面保留本次列出的三个 IDA 显示名与地址，同时注明实际符号类型：

| IDA 中的导出符号显示名 | 地址  | ELF 类型及所在节 |
| --- | --- | --- |
| `_6d64aa7911896144dca0e9d3a28289c0` | `00000000156EBB90` | `OBJECT` ，`.data` |
| `_6cafa4bca3a25e1ee867bb0a6251b1cf` | `000000001571B390` | `OBJECT` ，`.data` |
| `_6b7507a3a3df153952bdcd2132f20fe9` | `00000000156BF160` | `OBJECT` ，`.data` |

**这三个条目是导出数据符号，不能作为三个 IL2CPP 导出函数的例子。** 原始 ELF 名称不含表中 IDA 显示的前导下划线。仅凭名称由 32 个十六进制字符组成，也不能确认命名算法是 MD5，或认定它们分别对应第一章的三个 API。

## 章节三、global-metadata.dat 切入点

### 3.1 标准 global-metadata.dat 加载流程

先看标准实现的流程图。图中上半部分是启动时的注册与文件加载，下半部分是需要方法信息时的构建路径：

![标准 global-metadata.dat 注册、加载与方法信息构建流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/13dc0e195f0d2e8f.png)

*图 1：标准 IL2CPP metadata 加载流程。*

在本文参考版本中， `il2cpp_init()` 进入 `Runtime::Init()` ，先通过初始化回调注册代码表和元数据注册表，再进入 `MetadataCache::Initialize()` 。后者调用 `MetadataLoader::LoadMetadataFile()` ，由文件映射接口取得 `global-metadata.dat` 的映射地址，随后检查标准文件头并建立运行时缓存。

文件被映射到内存，并不意味着所有类型和方法对象都已经构建完成。后续需要某个类型的方法信息时，运行时仍会读取方法记录、名称及原生入口，填充 `MethodInfo` 。

### 3.2 在 IDA 字符串表中搜索文件名

将 `libxxxxshen.so` 加载到 IDA 后，可以从仍然可见的文件名入手：

1.  打开字符串窗口，通常可使用 `Shift + F12` 。
2.  搜索 `global-metadata.dat` ，跳转到对应字符串。
3.  在字符串处按 `X` ，查看它的全部交叉引用。
4.  逐个检查引用所在函数，优先关注运行时初始化路径，再按 `F5` 查看反编译伪代码。

![IDA 中 global-metadata.dat 字符串的全部交叉引用](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b9796c7f760fce8.png)

*图 2： `global-metadata.dat` 的交叉引用列表。*

截图中既有运行时初始化函数的引用，也有 `sub_77B3234` 中的引用；多条引用可能落在同一函数内，不能把引用行数直接当成加载入口数量。

这里进入初始化路径，对应函数原名为 **`sub_476A818`**，入口地址为 **`0x476A818`**。我将其命名为 `il2cpp_vm_Runtime_Init`

### 3.3 sub_476A818 中的 F5 代码

在 `sub_476A818` 的 F5 反编译结果中，可以看到下面这段 metadata 加载代码：

```cpp
mhy_os_Thread_GetOrCreateCurrentState();
MetadataFile = il2cpp_vm_MetadataLoader_LoadMetadataFile("global-metadata.dat");
v30 = il2cpp_vm_MetadataLoader_LoadMetadataFile("startup-metadata.dat");
v31 = *(_DWORD *)(g_mhy_RuntimeMetadataOptions + 4);
v32 = *(_DWORD *)(g_mhy_MetadataRegistration + 120);
```

这段代码先取得当前线程状态，再用同一个加载函数分别打开 `global-metadata.dat` 和 `startup-metadata.dat` ，随后读取运行时配置及注册信息。两个文件加载调用点分别位于 `0x476ABBC` 和 `0x476ABCC` ，调用的加载器入口均为 `0x43F9FC4` 。

### 3.4 加载方式接近标准，主要区别在解析

在文件加载这一层，当前样本与标准实现没有本质区别：向加载器传入文件名，拼接 metadata 路径，再打开并映射文件。上面两次调用返回的是文件映射结果，不能仅凭 `LoadMetadataFile` 的调用就认定 metadata 已完成解析或解密。

真正需要继续跟进的是返回地址如何被使用。当前样本的后续代码将主文件的数据基址设为：

```cpp
g_mhy_GlobalMetadataPayload = MetadataFile + 0x210;
```

这里的 `0x210` 是当前样本已经确认的数据起点跳过量，暂时理解 `0x210` 是 `Metadata` 的 `header` ，但它遗弃本地文件的 `header` ，这是为什么呢？？？难道就不需要header解析了吗？？

### 3.5 CodeRegistration与MetadataRegistration

-   **`CodeRegistration` ：主要解决“方法对应哪段原生代码”。**
-   **`MetadataRegistration` ：主要解决“类型如何表示、对象如何布局、泛型如何对应”。**

以标准的 `Unity 2017.4.30f1` 为例，标准的 `CodegenRegistration` 分两个阶段：SO 加载时登记回调， `Runtime::Init()` 时执行回调，注册代码表和类型表。

```c
inline void il2cpp_codegen_register(const Il2CppCodeRegistration* const codeRegistration, const Il2CppMetadataRegistration* const metadataRegistration, const Il2CppCodeGenOptions* const codeGenOptions)
{
    il2cpp::vm::MetadataCache::Register(codeRegistration, metadataRegistration, codeGenOptions);
}
```

魔改的 `libxxxxshen.so` 在对应配置函数，将内置的数据设置到全局常量里， `Il2CppCodeRegistration` `Il2CppMetadataRegistration` 是非标准结构。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ce883ba1a78b9b7.png)

图上能看出已经具备 `CodeRegistration` `MetadataRegistration` `MetadataHeader` ，前面提到的 "global-metadata.dat 加载解析跳过0x210字节"，这个疑点不攻自破

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/01823f8f97d71765.png)

MetadataHeader 是引擎内置在il2cpp 的0x210字节header，global-metadata.dat 中的header 并没有在引擎里用上， `0x6088DC` 的前三个字节转换成字符串就是MHY

### 3.6 标准与定制 Runtime::Init 的流程对比

先把两版初始化的主要节点放在一起。标准侧参考 Unity 2017.4.30f1 的 `Runtime::Init` 和 `MetadataCache::Initialize` ，并对照当前标准样本的 `0x3D7AF4` ；定制侧对应 `libxxxxshen.so` 中的 `0x476A818` 。图中只画首次正常初始化、直到取得 corlib image 的路径。

![标准 IL2CPP 的 Runtime::Init 简略流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0137202ebb128b93.png)

**样本魔改的il2cpp流程图**

![libxxxxshen.so 的 Runtime\_Init 简略流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d98c04f674138ea.png)

*图 4：定制 Runtime_Init，双文件映射、字段解码和启动对象构建均能在当前大函数中找到。*

两版的总体职责相近：先注册代码与元数据，再建立缓存和程序集关系，随后启动 GC、托管线程与反射，最后取得 `mscorlib.dll` 的 Image。定位定制实现时，最有价值的区别如下：

| 节点  | 本文标准参考 | 当前 libxxxxshen.so |
| --- | --- | --- |
| 注册入口 | `MetadataCache::Register` 接收 3 项参数 | 定制注册入口 `0x44179A0` 接收 5 项参数，其中包含 SO 内嵌编码表头 |
| metadata 来源 | 本阶段映射 `global-metadata.dat` | 同时映射 `global-metadata.dat` 与 `startup-metadata.dat` |
| 表头及数据基址 | 表头在 global 映射起点，偏移相对该起点 | 表头来自 SO；global 数据区从映射起点 `+0x210` 开始，startup 使用自己的映射基址 |
| 泛型与 Interop | 主要在标准 `Register` 内登记 | 相应构建和登记工作出现在定制 Init 的缓存分配之后 |
| Image 构建 | 32 字节定义记录 → 56 字节运行时 Image | 40 字节编码记录 → 80 字节运行时 Image，名称和多数字段需要变换 |
| corlib 获取 | `Assembly::Load` 后调用 `Assembly::GetImage` | 从返回的 Assembly `+8` 读取编码指针，再减常量取得 Image |

## 章节四、非标准MetadataHeader解析

**`libxxxxyuan.so` 的MetadataHeader魔改，不止是打乱字段顺序！在打乱顺序的前提下，对字段值做 `^` 异或加密，魔改字段结构体等等。**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8eba72c331719821.png)

### 4.1 typeDefinitions

图上g_mhy_MetadataHeader 来自 `0x6088DC` ，g_mhy_MetadataHeader + 0x134取值得到 `typeDefinitions` 字段，按四字节读取减去0x6D78B4A3得到的值才是typeDefinitions偏移。

```python
[libxxxxshen.so] 0x7d84f88c44!0x476ac44 ldr w8, [x8, #0x134]; w8=0x80e268dc x8=0x7d80e268dc mem_r=0x7d80e26a10 -> w8=0x6dd615a3 
[libxxxxshen.so] 0x7d84f88c48!0x476ac48 add w22, w8, w9; w22=0x9d100000 w8=0x6dd615a3 w9=0x92874b5d -> w22=0x5d6100
```

当前typeDefinitions / 0x46（结构体大小），取到 typeDefinitionsCount

### 4.2 methodDefinition

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0e5dccccee6d6967.png)

methodDefinition 结构体大小0x1a

### 4.3 methodSpecs

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1593be1b6694b93f.png)

### 4.4 image

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/33fa7b375dfe0271.png)

### 4.5 Assembly

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2f80ee9774b9645.png)

### 4.6 GenericClass

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/711b6e1e44c45b6e.png)

解密GenericClass的偏移跟大小，总字节数 / 8 = GenericClass记录数，给vector预留这么多个指针槽

### 4.7 结构总结

列举出的几个字段，跟标准对比，能看出不止是打乱偏移，甚至对字段也进行了编码，增大还原的人力物力。

## 章节五、字符串表解密

### 5.1 字符串定位

阅读过标准metadata.dat 结构的都知道，stringOffset 存放在header + 0x18，并且是明文的形式存放，以0x00的方式截断

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df4e21e353c87e9a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/257f8bd63f8fb0d1.png)

在魔改的 `libxxxxshen.so` 里，stringOffset 计算公式是 `(header + 0xF4) ^ 0x14100732` ，目前已知So内嵌的header地址0x6088DC，偏移地址0x6089D0

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4e6acd07d1e511f.png)

按照大小端序，（0x10566972 ^ 0x14100732) + 0x210 = 0x04466E40，因为从开始就跳过了metadata.dat 头0x210字节

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8f7601301b3bde23.png)

不难看出，string表全是加密的。那怎么知道引用解密地方呢？在标准的il2cpp里，有太多地方引用GetStringFromIndex，比如MetadataCache::Initialize 在首次就会初始化mscorlib 相关的常用基础函数

```python
void MetadataCache::Initialize()
{
    s_GlobalMetadata = vm::MetadataLoader::LoadMetadataFile("global-metadata.dat");
    ...
    for (int32_t imageIndex = 0; imageIndex < s_ImagesCount; imageIndex++)
    {
        const Il2CppImageDefinition* imageDefinition = imagesDefinitions + imageIndex;
        Il2CppImage* image = s_ImagesTable + imageIndex;
        image->name = GetStringFromIndex(imageDefinition->nameIndex);
    }
```

花点时间定位到对应的函数， `mhy_Metadata_ResolveNameToken` 对标 `GetStringFromIndex` ， `(v105 - 20) - (unsigned int)(v61 >> 15) - 0x20E65183` 是计算name token的一个过程

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eba68a10585ff2a1.png)

### 5.2 ResolveNameToken

```python
char *__fastcall mhy_Metadata_ResolveNameToken(unsigned int a1)
{
  __int64 v2; // x13
  __int64 v3; // t2
  unsigned __int64 v4; // x8
  unsigned __int64 v5; // x14
  unsigned __int64 v6; // x14
  __int64 *v7; // x15
  __int64 v8; // x16
  __int64 v9; // x23
  __int64 v10; // x15
  int8x8_t v11; // d0
  unsigned int v13; // w22
  __int64 v14; // x20
  int v15; // w8
  __int64 v16; // x8
  __int64 v17; // x10
  __int64 v18; // x8
  unsigned int v19; // w9
  __int64 *v20; // x12
  __int64 *v21; // x10
  __int64 v22; // t1
  __int64 v23; // x13
  __int64 v25[3]; // [xsp+8h] [xbp-58h] BYREF
  _DWORD v26[2]; // [xsp+28h] [xbp-38h] BYREF

  if ( a1 == -1 )
    return &byte_4F4D26;
  mhy_import_pthread_mutex_lock(qword_15B4F898);
  v2 = 1;
  v3 = __ROR8__((0x9E3779B185EBCA87LL * a1) ^ 0x27D4EB2F165667C9LL, 41);
  v4 = 0xC2B2AE3D27D4EB4FLL
     * ((0x165667B19E3779F9LL - 0x3D4D51C2D82B14B1LL * v3)
      ^ ((unsigned __int64)(0x165667B19E3779F9LL - 0x3D4D51C2D82B14B1LL * v3) >> 33));
  v5 = (0x165667B19E3779F9LL * (v4 ^ (v4 >> 29))) ^ ((0x165667B19E3779F9LL * (v4 ^ (v4 >> 29))) >> 32);
  while ( 1 )
  {
    v6 = v5 & g_mhy_DecodedNameTokenCache;
    v7 = (__int64 *)(qword_15B4F780 + 32 * (v6 >> 6));
    v8 = v7[1];
    v9 = (1LL << v6) & v8;
    if ( v9 )
      break;
    if ( (v7[2] & (1LL << v6)) == 0 || v2 - 1 >= (unsigned __int64)qword_15B4F788 )
    {
      v13 = HIBYTE(a1);
      v14 = mhy_MemoryPool_Allocate(g_mhy_MetadataMemoryPool, (HIBYTE(a1) + 8) & 0x1F8);
      v15 = v14 - *(_DWORD *)g_mhy_MetadataMemoryPool;
      v26[0] = a1;
      v26[1] = v15;
      mhy_Metadata_NameTokenCache_Insert(v25, &g_mhy_DecodedNameTokenCache, v26, v26);
      goto LABEL_14;
    }
LABEL_5:
    v5 = v2 + v6;
    ++v2;
  }
  v10 = *v7;
  v11.n64_u64[0] = vcnt_s8((int8x8_t)(v8 & ~(-1LL << (v6 & 0x3F)))).n64_u64[0];
  v11.n64_u8[0] = vaddv_s8(v11);
  if ( a1 != *(_DWORD *)(v10 + 8 * v11.n64_u64[0]) )
    goto LABEL_5;
  v16 = *(unsigned int *)(v10 + 8 * v11.n64_u64[0] + 4);
  v13 = 0;
  if ( (_DWORD)v16 )
    v14 = *(_QWORD *)g_mhy_MetadataMemoryPool + v16;
  else
    v14 = 0;
LABEL_14:
  mhy_import_pthread_mutex_unlock(qword_15B4F898);
  if ( !v9 )
  {
    if ( v13 )
    {
      v17 = a1 & 0xFFFFFF;                      // nameOffset 
      v18 = 0x58770C33480AD388LL * v17 + 0x24B53AFB90C43FA4LL;
      v19 = (v13 + 7) >> 3;
      v20 = (__int64 *)v14;
      // stringOffset = read32(H + 0xF4) ^ 0x14100732
      v21 = (__int64 *)(g_mhy_GlobalMetadataPayload + v17 + (*(int *)(g_mhy_MetadataHeader + 244) ^ 0x14100732LL));
      // for (uint32_t j = 0; j < (length + 7) / 8; ++j)
      // {
      //     output[j] = ciphertext[j] ^ key; // 每个元素是 uint64_t

      //     key += 0x2A803B50569DD0DBULL;
      // }
      do
      {
        v22 = *v21++;
        --v19;
        v23 = v22 ^ v18;
        v18 += 0x2A803B50569DD0DBLL;
        *v20++ = v23;
      }
      while ( v19 );
    }
    *(_BYTE *)(v14 + v13) = 0;
  }
  return (char *)v14;
}
```

先 hook mhy_Metadata_ResolveNameToken `0x475E6F0` 打印下入参跟回调

```javascript
Interceptor.attach(libxxxxshen.add(0x475E6F0), {
    onEnter: function (args) {
        this.lr = this.context.lr.sub(libxxxxshen)
        this.a1 = args[0]
    },
    onLeave: function (retval) {
        console.log(this.lr,this.a1,retval.readCString())
    }
});
...
0x476b578 0xc000008 mscorlib.dll
0x476b578 0x11027003 Mono.Security.dll
0x476b578 0xa02a3b9 System.dll
0x476b578 0xf03a381 System.Core.dll
0x476b578 0x2a03bc88 System.Runtime.CompilerServices.Unsafe.dll
0x476b578 0x2503bd76 UnityEngine.SharedInternalsModule.dll
0x476b578 0x1a03be37 UnityEngine.CoreModule.dll
0x476b578 0x2305a3c7 UnityEngine.TextRenderingModule.dll
0x476b578 0x1f05ac93 UnityEngine.AnimationModule.dll
```

mhy_Metadata_ResolveNameToken 函数关于字符串解密的代码不多，前面是一套查询缓存的机制，每次解密完的字符串都会缓存起来，真正关于解密的，只下面这段

```c
if ( v13 )
    {
      v17 = a1 & 0xFFFFFF;                      // nameOffset 
      v18 = 0x58770C33480AD388LL * v17 + 0x24B53AFB90C43FA4LL;
      v19 = (v13 + 7) >> 3;
      v20 = (__int64 *)v14;
      // stringOffset = read32(H + 0xF4) ^ 0x14100732
      v21 = (__int64 *)(g_mhy_GlobalMetadataPayload + v17 + (*(int *)(g_mhy_MetadataHeader + 0xF4) ^ 0x14100732LL));
      // for (uint32_t j = 0; j < (length + 7) / 8; ++j)
      // {
      //     output[j] = ciphertext[j] ^ key; // 每个元素是 uint64_t

      //     key += 0x2A803B50569DD0DBULL;
      // }
      do
      {
        v22 = *v21++;
        --v19;
        v23 = v22 ^ v18;
        v18 += 0x2A803B50569DD0DBLL;
        *v20++ = v23;
      }
      while ( v19 );
    }
```

以0x476b578 0xc000008 mscorlib.dll 为例

```python
length = 0xc000008 >> 24 => 0xc
offset = 0x0C000008 & 0xFFFFFF => 0x8
计算key
key = 0x58770C33480AD388LL * offset + 0x24B53AFB90C43FA4LL
for (uint32_t j = 0; j < (length + 7) / 8; ++j){
  output[j] = ciphertext[j] ^ key
  key += 0x2A803B50569DD0DBULL
}

明文：6D 73 63 6F 72 6C 69 62 2E 64 6C 6C
      m  s  c  o  r  l  i  b  .  d  l  l
密文：89 A8 79 BE E7 F0 04 8A 91 C8 D4 4B
```

## 数量字段

| H 偏移 | 标准英文字段 / 分析别名 | 中文用途 | 解码公式 | 当前结果 | 记录步长 | Header 读取指令 RVA | 对应汇编指令 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0x134` | `typeDefinitionsCount` | 类型定义数量 | `(U32(h - 0x6D78B4A3)) // 70` | 87,424 | —   | `0x476AC44` | `LDR W8, [X8,#0x134]` |
| `0x0B0` | `methodsCount` | 方法定义数量 | `(U32(h - 0x20203A23)) // 26` | 723,236 | —   | `0x476ACC0` / `0x476BD0C` | `LDR W8, [X8,#0xB0]` / `LDR W9, [X19,#0xB0]` |
| `0x1F8` | `genericMethodSpecCountSource` （分析别名） | 泛型方法实例描述数量 | `(U32(h - 0x678A3B7E)) // 12` | 574,889 | —   | `0x476AD3C` | `LDR W8, [X8,#0x1F8]` |
| `0x02C` | `imagesCount` （计数来源） | image 数量 | `(h ^ 0x04863A18) // 40` | 74  | —   | `0x476ADB4` | `LDRSW X8, [X8,#0x2C]` |
| `0x048` | `assembliesCount` （计数来源） | assembly 数量 | `(h >> 4) ^ 0x0187B65F` | 74  | —   | `0x476AEE4` | `LDR W24, [X8,#0x48]` |
| `0x060` | `genericClassStartupRecordCountSource` （分析别名） | 泛型类启动记录数量 | `(U32(h - 0x431ECCB0)) // 8` | 406,824 | —   | `0x476B018` | `LDR W8, [X8,#0x60]` |
| `0x0F0` | `fieldDefaultValuesCount` | 字段默认值记录数量 | `(U32(h - 0x171D9BDF)) // 12` | 74,681 | —   | `0x4760B84` | `LDP W11, W9, [X8,#0xEC]` |
| `0x06C` | `parameterDefaultValuesCount` | 参数默认值记录数量 | `(U32(h - 0x1146013E)) // 12` | 24,822 | —   | `0x43C4534` | `LDR W9, [X8,#0x6C]` |
| `0x01C` | `methodAlternativeEntryMapCountSource` （分析别名） | 方法替代入口映射数量 | `(U32(h - 0x1D4A04D8)) // 6` | 12,728 | —   | `0x475FC00` | `LDR W13, [X10,#0x1C]` |
| `0x0D8` | `typeDefinitionExtensionRecordCountSource` （分析别名） | 类型定义扩展记录数量 | `(h >> 3) ^ 0x011B1DB9` | 11,804 | —   | `0x43B6F1C` | `LDR W11, [X8,#0xD8]` |
| `0x050` | `delegateMarshalingRecordCountSource` （分析别名） | 委托封送关联记录数量 | `(U32(h - 0x1BB18B26)) // 16` | 4,363 | —   | `0x44254FC` | `LDR W10, [X9,#0x50]` |
| ... | ..  | ... | ... | ... | ... | ... | ... |

## global 表偏移

| H 偏移 | 标准英文字段 / 分析别名 | 中文用途 | 解码公式 | 当前结果 | 记录步长 | Header 读取指令 RVA | 对应汇编指令 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0x00C` | `typeDefinitionsOffset` | 类型定义 | `h ^ 0x1A71B469` | P+0xF44704；文件 0xF44914 | 70  | `0x43B6EBC` | `LDRSW X10, [X8,#0xC]` |
| `0x14C` | `methodsOffset` | 方法定义 | `h ^ 0x00111A32` | P+0x2B0AA30；文件 0x2B0AC40 | 26  | `0x4767FE8` | `LDRSW X8, [X8,#0x14C]` |
| `0x0F4` | `stringOffset` | 名称池 | `h ^ 0x14100732` | P+0x4466E40；文件 0x4467050 | —   | `0x475E8B8` | `LDRSW X11, [X11,#0xF4]` |
| `0x0E4` | `parametersOffset` | 参数定义 | `U32(h + 0xADE4F3A7)` | P+0x1CF8A70；文件 0x1CF8C80 | 8   | `0x4404BA4` | `LDR W10, [X10,#0xE4]` |
| `0x17C` | `fieldsOffset` | 字段定义 | `U32(h + 0xCF62BDAE)` | P+0x3CF97D8；文件 0x3CF99E8 | 8   | `0x43D00A8` | `LDR W9, [X9,#0x17C]` |
| `0x1E4` | `propertiesOffset` | 属性定义 | `h ^ 0x16B723D4` | P+0x1AB0FDC；文件 0x1AB11EC | 10  | `0x475FF28` | `LDRSW X8, [X8,#0x1E4]` |
| `0x068` | `genericParametersOffset` | 泛型参数 | `h ^ 0x50961787` | P+0x236C714；文件 0x236C924 | 14  | `0x47628C0` | `LDRSW X8, [X8,#0x68]` |
| `0x074` | `genericContainersOffset` | 泛型容器 | `h ^ 0x15DAE066` | P+0x1BE072C；文件 0x1BE093C | 16  | `0x475E988` | `LDRSW X8, [X8,#0x74]` |
| `0x1F0` | `eventsOffset` | 事件定义 | `U32(h - 0x4BFA729D)` | P+0x151A804；文件 0x151AA14 | 14  | `0x442B500` | `LDR W9, [X9,#0x1F0]` |
| ... | ... | ... | ... | ... | ... | ... |     |

## global 辅助表偏移

| H 偏移 | 标准英文字段 / 分析别名 | 中文用途 | 解码公式 | 当前结果 | 记录步长 | Header 读取指令 RVA | 对应汇编指令 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0x010` | `encodedMethodReferenceTableOffset` （分析别名） | RGCTXData 解析分支使用的 64 位编码项 | `h ^ 0x070D9E05` | P+0x0；文件 0x210 | 8   | `0x43D8308` | `LDRSW X11, [X10,#0x10]` |
| `0x028` | `referencedAssembliesOffset` | 程序集引用索引 | `h ^ 0x64103AB5` | P+0x2111EE0；文件 0x21120F0 | 4   | `0x475E108` | `LDRSW X9, [X16,#0x28]` |
| `0x18C` | `encodedFieldOffsetsOffset` （分析别名） | 字段偏移/扩展标志 | `h ^ 0x0B9AC2FB` | P+0xD73590；文件 0xD737A0 | 4   | `0x43CFED8` / `0x43D0168` | `LDR W8, [X8,#0x18C]` / `LDR W10, [X9,#0x18C]` |
| `0x19C` | `attributesInfoOffset` | 特性范围记录 | `h ^ 0x1E3B49A8` | P+0x176074C；文件 0x176095C | 8   | `0x4766A4C` | `LDRSW X8, [X8,#0x19C]` |
| `0x0C4` | `attributeTypesOffset` | 特性类型索引 | `U32(h - 0x69FBAE6B)` | P+0xEE4464；文件 0xEE4674 | 4   | `0x4766AD0` | `LDR W8, [X8,#0xC4]` |
| `0x0E0` | `methodAlternativeEntryMapOffset` （分析别名） | 方法到替代入口索引映射 | `U32(h - 0x23A45B02)` | P+0x4D7360C；文件 0x4D7381C | 6   | `0x475FC2C` | `LDR W14, [X10,#0xE0]` |
| `0x0B8` | `typeDefinitionExtensionRecordsOffset` （分析别名） | 类型定义扩展记录 | `U32(h - 0x63BD3EDA)` | P+0xF2D624；文件 0xF2D834 | 8   | `0x43B6F14` | `LDR W10, [X8,#0xB8]` |
| `0x0B4` | `delegateMarshalingRecordsOffset` （分析别名） | 委托封送关联记录 | `U32(h - 0x6364D3C7)` | P+0x230CA54；文件 0x230CC64 | 16  | `0x4425500` | `LDR W9, [X9,#0xB4]` |
| ... | ... | ... | ... | ... | ..  | ..  | ..  |

## 章节六、总结

样本对游戏引擎做了深度魔改，不是那些某盾、某guard的第三方安全sdk 能做到的效果。写着文章前，我想过要不要从标准引擎到魔改对比，发现里面的门道很深，不实际。本想修复->il2cppdumper，最后分析到结构体发现行不通，最后还是修改了il2cppdumper这个项目去主动适配

### 大部分信息都能还原出来，但没什么意义，很多函数类都是混淆的。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fcc747db06d51083.webp)  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4353494b8baf1726.png)

结束~又水了一篇
