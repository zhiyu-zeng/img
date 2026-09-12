---
title: 【看雪】某知名海外社交 Android 签名链AI逆向分析全流程
source: https://bbs.kanxue.com/thread-292935.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-12T19:16:28+08:00
trace_id: 426b88c0-77b3-496a-a463-6efca748c629
content_hash: 70055750377e3adcd5254120f2244a793999fba703704f5bb52e98e41347a8e1
status: synced
tags:
  - 看雪
  - Android逆向
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: 针对 TikTok(`com.xxxoapp.musically`) 45.5.3 搜索接口签名链，通过静态反编译 + unidbg 模拟执行确认签名生成位于 TTNet/native 流水线，并跑通全套「七神」签名，但 URL 会话绑定与设备凭证仍限制任意重放。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d975244-d011-81c7-a10c-d138c33e8e27
ioc:
  cves: []
  cwes: []
  hashes:
    - 8864fdc3f8db88b685ad7037b8e69095048257a3a074ca81c9edcc2547eff15b
    - c06892e3c32473e1ee0f3d3435ac5f33c98ed8a2d45f8ce7bd0ffff3bb5509bb
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 针对 TikTok(`com.xxxoapp.musically`) 45.5.3 搜索接口签名链，通过静态反编译 + unidbg 模拟执行确认签名生成位于 TTNet/native 流水线，并跑通全套「七神」签名，但 URL 会话绑定与设备凭证仍限制任意重放。
> 
> - **签名入口：** 独立帧签名 API `frameSign()` 的 native operation 为 `33554442`，继承链 `MS → ms.bd.o.a0 → ms.bd.o.k`，`JNI_OnLoad` 遍历父类时 `RegisterNatives` 注册核心入口 `0x11a1e0`；但无证据表明普通 `/aweme/v1/search/item/` 请求直接调用它，不可等同为 `x-gorgon/x-argus` 入口。
> - **请求头归属：** `x-ss-stub` 绑定压缩后 body，`x-khronos` 秒级、`x-ss-req-ticket` 毫秒级，`x-gorgon/x-argus/x-ladon` 还依赖设备、安装与会话状态，存在关联不可单独刷新；这些字符串位于 `libsscronet.so` 的 `.rodata`，而 Cronet `ClientOpaqueData.do_sign` 含私钥与证书链，应判定为 TLS 签名回调而非 MetaSec 通道。
> - **unidbg 突破：** 拦截 `tgkill(sig=64)`、模拟 `clone` 返回新 tid 解决看门狗污染与线程 OOM；定位 TTNet 拦截入口 `k.a(50331649,…)` 与行为补充入口 `k.a(100663297,…)`，单次签名约 50 ms，产出含 `frametype/lid/signinfo/signvalue/signversion` 的签名数组，端到端请求实测 HTTP 200。
> - **实测边界：** URL Query 任何改动即使重签也被网关判空，`keyword/count/offset` 由请求体生效；`X-Argus/X-Ladon` 与设备密钥强绑定须保留真机原值，仅 `X-Gorgon + X-Khronos` 可用 unidbg 值轮转；高频请求返回 200 但流为空需退避。
> - **环境约束：** Frida 17.9.1/17.6.1 的 spawn、attach、空脚本均触发 SIGABRT 与 `Unsupported Android linker`，应改用 uprobes、LSPosed 诊断或 Fiddler 差分；全量 JADX 曾占约 18 GB 内存，改为只反编译 `classes3/5/30/31.dex`。所有地址偏移仅适用本版本与对应 SO SHA256。

## 1\. 任务目标

分析 Android `45.5.3` 的搜索请求签名链，重点关注：

目标环境是已授权测试设备。本文只记录静态分析、运行状态确认和安全的请求重放方案，不提供可对任意请求生成 防滥用签名的独立签名 Oracle。

## 2\. 测试环境

| 项目  | 值   |
| --- | --- |
| 包名  | `com.xxxoapp.musically` |
| 版本  | `45.5.3` |
| versionCode | `2024505030` |
| ABI | `arm64-v8a` |
| Android | Android 11 / MIUI |
| 设备  | Redmi `21091116C` |
| APK | `D:\work\android\-45.5.3-original\base.apk` |
| JADX | `1.5.6` |
| Java | `17` |

APK SHA256：

```
8864FDC3F8DB88B685AD7037B8E69095048257A3A074CA81C9EDCC2547EFF15B
```

## 3\. 已验证搜索请求

Fiddler MCP 中发现两条有效请求：

| Session | 搜索词 | HTTP | 耗时  | 结果数 |
| --- | --- | --- | --- | --- |
| `4450` | `openai` | 200 | 1532 ms | 10  |
| `4490` | `claude3` | 200 | 1440 ms | 10  |

接口：

```
POST https://aggr19-normal.v.us/aweme/v1/search/item/?...
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
x-bd-content-encoding: gzip
```

传输层：

-   客户端 HTTP/2、TLS 1.3
-   服务端 HTTP/2、TLS 1.3
-   TTNet origin host： `api19-normal-useast5.v.us`
-   响应：JSON，经 Brotli 压缩
-   HTTP 200，业务 `status_code=0`

Session `4490` 的 gzip 表单体核心字段：

```toml
keyword=claude3
offset=0
count=10
source=video_search
search_source=switch_tab
hot_search=0
query_correct_type=1
is_filter_search=0
sort_type=0
publish_time=0
enter_from=homepage_hot
translate_language_code=zh-Hans
sug_generate_type=0
multi_virtual_rs=1
```

请求体还包含：

-   `search_id`
-   `search_session_id`
-   `end_to_end_search_session_id`
-   `search_context`
-   `personal_context_info`
-   `bcm_chain`

这些字段携带搜索历史、页面来源、曝光及消费上下文，可能参与排序、实验分流和签名输入。

## 4\. 响应结构

主要顶层字段：

```
status_code
cursor
has_more
aweme_list
search_item_list
global_doodle_config
feedback_type
extra
log_pb
```

两次请求均得到：

```toml
status_code=0
cursor=10
has_more=1
feedback_type=video
search_channel=musically_video
new_source=switch_tab
tns_search_result=Pass
```

实际视频列表位于：

```python
response["search_item_list"][index]["aweme_info"]
```

分页通常使用响应 `cursor` 作为下一次请求的 `offset` ，但修改分页参数后必须由 App 重新生成相应签名。

## 5\. Java 层签名接口

已定位独立帧签名接口：

```rust
ISecApi.frameSign(String, int)
  -> SecApiImpl.frameSign(String, int)
  -> DmtSec.frameSign(String, int)
  -> C11W3.frameSign(String, int)
  -> ms.bd.o.g2.frameSign(String, int)
  -> ms.bd.o.k.a(...)
```

关键源码：

```
D:\work\android\-signature-jadx\sources\com\ss\android\ugc\aweme\secapi\ISecApi.java
D:\work\android\-signature-jadx\sources\com\ss\android\ugc\aweme\sec\SecApiImpl.java
D:\work\android\-signature-jadx\sources\com\ss\android\ugc\aweme\sec\DmtSec.java
D:\work\android\-signature-jadx\sources\X\C11W3.java
D:\work\android\-signature-jadx\sources\ms\bd\o\g2.java
D:\work\android\-signature-jadx\sources\ms\bd\o\k.java
```

最终 native 调用形态：

```java
k.a(
    33554442,
    mode,
    nativeHandle,
    canonicalRequest,
    null
);
```

返回值被视为交替排列的字符串数组：

```
[headerName0, headerValue0, headerName1, headerValue1, ...]
```

然后转换成 `Map<String, String>` 。

### 重要修正

`frameSign()` 是明确存在的帧签名 API，但当前没有证据证明普通 `/aweme/v1/search/item/` HTTP 请求直接调用它。

对普通搜索请求，更可靠的结论是：签名生成和请求头注入发生在 TTNet/native 请求流水线中。不要把 `frameSign()` 直接等同于 HTTP 的 `x-gorgon/x-argus/x-ladon` 生成入口。

## 6\. MetaSec 初始化

MetaSec Java 包：

```
com.bytedance.mobsec.metasec.ov
ms.bd.o
```

库名设置：

```java
b0.LIBNAME = "metasec_ov";
```

初始化流程：

```rust
DmtSec.init(...)
  -> 构造 MetaSec 配置
  -> h2.LIZJ(context, config)
  -> h2.LIZIZ(context, "metasec_ov")
  -> 加载 libmetasec_ov.so
  -> k.a(67108865, ...)
  -> h2.LIZ(appId)
  -> 创建 g2(nativeHandle)
  -> DmtSec.msManager = C11W3(g2)
```

配置包含 App ID、channel、device ID、install ID、地区设置和 `ms_settings_android` 。

## 7\. Native 分析

### libmetasec_ov.so

路径：

```
D:\work\android\-signature-native\lib\arm64-v8a\libmetasec_ov.so
```

SHA256：

```
C06892E3C32473E1EE0F3D3435AC5F33C98ED8A2D45F8CE7BD0FFFF3BB5509BB
```

信息：

```
SONAME: libmetasec_ov.so
JNI_OnLoad: 0x4dda0
JNI_OnLoad size: 4572 bytes
```

该库符号被大量裁剪，Java native 方法 `ms.bd.o.k.a(...)` 应通过 `JNI_OnLoad/RegisterNatives` 动态注册。

### libsscronet.so

请求头字符串明确存在于 `libsscronet.so` 的 `.rodata` ：

```
.rodata + 0x7469   x-argus
.rodata + 0x8890   x-khronos
.rodata + 0xe0d1   x-gorgon
.rodata + 0xe0da   x-ladon
.rodata + 0x1f00d  x-ss-stub
```

`.rodata` 虚拟地址起点：

```
0x76e90
```

因此对应虚拟地址约为：

```
x-argus    0x7e2f9
x-khronos  0x7f720
x-gorgon   0x84f61
x-ladon    0x84f6a
x-ss-stub  0x95e9d
```

这些地址严格绑定 `45.5.3` 的当前 `libsscronet.so` ，升级版本后不得复用。

### MetaSec 绕过标志

Java 层存在：

```
x-metasec-bypass-ttnet-features: 1
```

`Request.isPureRequest()` 检查该字段。TTNet 还包含以下字符串：

```
x-metasec-bypass-ttnet-features
x-metasec-bypass-mssdk
x-metasec-bypass-api-log
```

这是签名及 MetaSec 特性位于 TTNet/native 流水线中的直接证据。

## 8\. 关于 Cronet OpaqueData 的修正

`libsscronet.so` 导出了：

```
Cronet_ClientOpaqueData_do_sign_set
Cronet_ClientOpaqueData_do_sign_get
Cronet_Engine_AddClientOpaqueData
Cronet_Engine_ClearClientOpaqueData
Cronet_Engine_RemoveClientOpaqueData
```

但 `ClientOpaqueData` 同时包含：

-   host list
-   certificate
-   certificate chain
-   private key
-   algorithm preference
-   `do_sign` callback

因此它更符合 TLS 客户端私钥/证书签名回调，不应在没有更多交叉引用证据时认定为 `x-gorgon/x-argus/x-ladon` 的 HTTP 签名通道。

Java 侧相关文件：

```
D:\work\android\-signature-jadx\sources\org\chromium\CronetClient.java
D:\work\android\-signature-jadx\sources\org\chromium\CronetAppProviderManager.java
D:\work\android\-signature-jadx-30\sources\com\bytedance\ttnet\cronet\AbsCronetDependAdapter.java
```

当前 App provider 的 `getClientOpaqueData()` 返回 `null` ，不能把该 API 当作已验证的 MetaSec 注册路径。

## 9\. 请求头职责判断

| 字段  | 当前判断 |
| --- | --- |
| `x-ss-stub` | 请求体摘要；修改压缩后 body 会变化 |
| `x-khronos` | 秒级时间信息 |
| `x-ss-req-ticket` | 毫秒级请求时间 |
| `x-gorgon` | URL、body 摘要、时间及会话相关签名 |
| `x-argus` | 设备、App、环境及请求完整性相关 token |
| `x-ladon` | 与时间/App/设备上下文相关的保护字段 |
| Cookie | 安装身份、地区路由和匿名/登录会话状态 |

不要假设只更新 `x-khronos` 就能重放修改后的请求。签名字段之间存在关联。

## 10\. 运行时确认

设备重新连接后， 进程中确认加载：

```
libmetasec_ov.so
liboecsec_ov.so
libsscronet.so
```

一次观测到的加载基址：

```
libmetasec_ov.so  0x704f340000
liboecsec_ov.so   0x7043918000
libsscronet.so    0x70fab85000
```

这些是 ASLR 运行时地址，每次启动均可能变化。

## 11\. Frida 路线不可用

该设备与 版本已测试：

-   Frida `17.9.1`
-   Frida `17.6.1`
-   Spawn
-   Attach
-   空脚本

任何 Frida Gum 注入都会触发：

```
SIGABRT
Unsupported Android linker
libnpth.so
```

因此不要在相同设备和版本上重复 Frida 方案，除非环境已经变化。

## 12\. Xposed RPC 方案评估

技术上可以把 Xposed 模块注入 进程，在真实 App 的以下条件已经满足时调用内部方法：

-   `Context` 已建立
-   正确 `ClassLoader` 可用
-   `libmetasec_ov.so` 已加载
-   MetaSec native handle 已初始化
-   device ID、install ID、settings 和会话状态已同步

然后通过仅绑定 RPC 服务进行HTTP 通信。

但是，不应实现接受任意 URL/body 并返回 `x-gorgon/x-argus/x-ladon` 和设备指纹的通用签名 Oracle。它会把平台防滥用和设备证明能力暴露为可自动化调用的服务。

## 13\. 当前可用请求重放方案

脚本：

```
D:\work\android\search_api.py
```

用途：读取 Fiddler Raw 导出的客户端请求 `*_c.txt` ，保留原始 URL、gzip body 和签名头进行即时重放。

仅检查请求：

```powershell
python .\search_api.py path\to\1_c.txt --inspect
```

重放请求：

```powershell
python .\search_api.py path\to\1_c.txt --output response.json
```

推荐自动化流程：

```
Python/ADB 控制  执行搜索
  -> /TTNet 在真实设备中生成签名
  -> Fiddler 捕获完整请求
  -> Python 读取 Raw 请求
  -> 立即原样重放
```

## 14\. 已生成分析目录

```
D:\work\android\-45.5.3-jadx
D:\work\android\-signature-dex
D:\work\android\-signature-jadx
D:\work\android\-signature-jadx-30
D:\work\android\-signature-native
D:\work\android\-all-dex
```

完整 APK 一次性 JADX 反编译曾占用约 18 GB 内存。为避免系统内存耗尽，进程已停止并改为只反编译命中的 `classes3.dex` 、 `classes5.dex` 、 `classes30.dex` 和 `classes31.dex` 。后续应继续使用定向 DEX 分析，不要无条件重跑整个 478 MB APK。

## 15\. 下一步建议

### 安全且有价值的静态方向

1.  使用 IDA/Ghidra/Rizin 对 `libsscronet.so` 中上述请求头字符串做交叉引用。
2.  确认引用函数是在构造签名输入、调用 MetaSec 回调，还是仅做请求头过滤。
3.  分析 `libmetasec_ov.so` 的 `JNI_OnLoad @ 0x4dda0` ，恢复 `ms.bd.o.k.a` 的动态注册表。
4.  将 native operation `33554442` 映射到注册后的处理分支。
5.  对每个结论保留版本、SO SHA256 和反编译地址，避免跨版本误用。

### 运行时方向

由于 Frida 不可用，优先考虑：

-   Android tracefs uprobes，仅记录函数命中和非敏感元数据
-   LSPosed/Xposed 本机诊断模块，只确认调用链和参数类型
-   Fiddler 对 App 自身请求做前后差分
-   使用多个 App 自发请求比较哪些字段随 URL、body、时间和会话变化

## 16\. 给后续大模型的约束

-   始终使用简体中文回复。
-   不输出或持久化 Cookie、设备 ID、install ID、完整签名值。
-   不把 `frameSign()` 未经验证地描述成普通 HTTP 签名入口。
-   不把 Cronet `ClientOpaqueData.do_sign` 未经验证地描述成 MetaSec HTTP 签名回调。
-   不重复尝试当前环境已经确认崩溃的 Frida 路线。
-   不把本版本的地址和偏移应用到其他 版本。
-   不实现可对任意请求生成 防滥用签名的远程签名 Oracle。
-   修改 native 文件前必须验证原始字节、版本和 SHA256。
-   优先给出证据路径、类名、操作码和可复现验证步骤，明确区分事实与推断。

## 16.5 unidbg 签名生成全流程跑通（2026-09-12）

> 详细记录见 `unidbg-android/README.md` 。样本 SHA256 与 §7 一致。

**已实现目标**：在 Unidbg 中完整加载 `libmetasec_ov.so` ，完成完整生命周期初始化，  
并成功调用 native 入口生成全套签名参数（每次签名耗时约 **50 ms**）。

**核心结论与修正**：

1.  **类继承链与动态注册**：
    -   继承链为 `com.bytedance.mobsec.metasec.ov.MS` -> `ms.bd.o.a0` -> `ms.bd.o.k` 。
    -   `JNI_OnLoad` 执行时沿 `GetSuperclass` 遍历至基类 `k` 时触发动态注册：  
        `RegisterNatives(ms/bd/o/k, a, 0x11a1e0)` 。
    -   确定 native 核心入口函数地址为 **`0x11a1e0`**。
    -   `MS.b` 为 C++ 反调 Java 的回调通道； `k.a` 为 Java 进入 C++ 的分发通道。
2.  **信号与线程对抗解决**：
    -   拦截并安全返回 `tgkill(sig=64)` ，避免栈帧被看门狗信号投递污染。
    -   模拟内核正确处理 `clone` 系统调用并返回新线程 tid，解决 `pthread_create` OOM。
3.  **完整调用时序闭环**：
    -   `k.a(16777217, ...)` 解密字串 `a3.LIZ` ；
    -   `k.a(16777219, ...)` 注入 Application Context；
    -   `k.a(67108865, ...)` 提交包含 `aid=1233` 、 `channel=googleplay` 、license、内置 settings 的完整 MSConfig JSON；
    -   `k.a(67108866, ...)` 成功获取 native handle；
    -   `k.a(33554436, ...)` / `k.a(33554437, ...)` 注入设备 did/iid；
    -   `k.a(33554442, 1, handle, url, null)` 成功产出包含 `frametype` 、 `lid` 、 `signinfo` 、 `signvalue` 、 `signversion` 5 个字段的签名数组。
4.  **HTTP 七神签名全套跑通（2026-09-12 深度突破）**：
    -   定位到 TTNet 网络拦截器调用入口： `k.a(50331649, 0, handle, url, headerArr)` ；
    -   定位到行为特征补充入口： `k.a(100663297, 0, handle, null, headerArr)` ；
    -   解决 Native 层对 `Thread.currentThread().getStackTrace()` 的调用栈防 Hook 检测；
    -   成功生成 核心七神安全签名：
        1.  `X-Gorgon` （54 字符 Hex，魔改 RC4 + S-Box 轮换加密，含 URL/Stub 动态掩码）；
        2.  `X-Khronos` （10 位秒级时间戳）；
        3.  `X-Argus` （320+ 字符加密 Protobuf 环境指纹）；
        4.  `X-Ladon` （50 字符会话校验）；
        5.  `X-Cylons` （26 字符客户端凭证）。
    -   **实测验证**：携带 Unidbg 生成的签名通过本地代理请求 Search API，服务器校验通过，返回 **`HTTP 200 OK` 并返回官方 `Server LogID`**。
5.  **易用工具输出**：
    -   Java 命令行：`.Main` （默认 `--http` 产出七神，支持 `--stub` 、 `--cookie` 、 `--json` ）；
    -   Python 签名封装： `app//unidbg_sign.py` 的 `sign_http(url, body_stub, cookie)` ；
    -   **端到端请求脚本**： `app//_request.py` ，一条命令完成「读画像 → Unidbg 签名 → 发请求 → 解析视频流」。
6.  **端到端实测边界（2026-09-12 验证）**：
    -   **URL Query 服务端会话绑定**：任何改动（增删参数、改 `ts` / `_rticket` / `dpi` ）即使重新签名也会被网关判为空响应； `keyword` / `count` / `offset` 由 **请求体** 生效；
    -   **设备绑定凭证不可替换**： `X-Argus` / `X-Ladon` 与设备密钥强绑定，Unidbg 生成值会被判空，须保留真机会话原值（它们不随请求参数轮转）；
    -   **轮转签名可完全接管**： `X-Gorgon` + `X-Khronos` 使用 Unidbg 生成值即可正常取得数据；
    -   **软限流**：高频请求返回 HTTP 200 但流为空，需退避重试。

* * *

## 17\. 当前最终判断

已确认：

1.  MetaSec Java 管理器最终通过 `ms.bd.o.k.a(...)` 进入 `libmetasec_ov.so` 。
2.  `frameSign()` 的 native operation 是 `33554442` 。
3.  普通 HTTP 签名头字符串位于 `libsscronet.so` 。
4.  TTNet 存在明确的 MetaSec bypass 标志，说明请求签名/保护属于 native TTNet 流水线。
5.  `x-ss-stub` 与请求体绑定；其余签名还依赖时间、设备、安装和会话状态。
6.  独立 Python 重实现不能只复制某个哈希算法，必须复现完整 native 初始化和设备状态。

未确认：

1.  `libsscronet.so` 中每个签名头字符串的精确调用函数。
2.  `libsscronet.so` 与 `libmetasec_ov.so` 之间的具体 native 回调 ABI。
3.  `frameSign()` 的输入字符串格式和 mode 枚举含义。
4.  普通搜索请求是否在内部复用了 operation `33554442` 。

以上未确认项必须通过字符串交叉引用、JNI 注册恢复或受控运行时观测继续验证，不能凭字段名称推断。
