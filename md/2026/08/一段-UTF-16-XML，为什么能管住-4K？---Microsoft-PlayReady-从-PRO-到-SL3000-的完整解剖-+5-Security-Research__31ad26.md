---
title: 一段 UTF-16 XML，为什么能管住 4K？ - Microsoft PlayReady 从 PRO 到 SL3000 的完整解剖 | +5 Security Research
source: https://overkazaf.github.io/blogs/posts/playready-pro-license-sl3000-deep-dive/
source_host: overkazaf.github.io
clip_date: 2026-08-24T14:23:23+08:00
trace_id: de4f9511-fb9a-4968-92fa-5c7076f15a45
content_hash: bd4e83bb7165e78fb286c548064287c0d3d5f18ff030f3e49432c0ae7921d902
status: synced
tags:
  - 协议分析
  - DRM
series: null
feed_source: overkazaf·逆向
ai_summary: PlayReady 的安全边界不在 MPD 里那段 UTF-16 XML，而在 License 对证书身份、安全级别、执行环境和输出策略的完整绑定链。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c675244-d011-816b-825b-ed734bc4a6b8
ioc:
  cves: []
  cwes: []
  hashes:
    - 000102030405060708090a0b0c0d0e0f
    - 00112233445566778899aabbccddeeff
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> PlayReady 的安全边界不在 MPD 里那段 UTF-16 XML，而在 License 对证书身份、安全级别、执行环境和输出策略的完整绑定链。
> 
> - **媒体信令分层：** PSSH/PRO/WRMHEADER 只做路由与描述，不含内容密钥；`cenc:pssh` 是完整 box，`mspr:pro` 只有 PRO，PRO 是小端记录容器，0x0001 记录是 UTF-16LE 的 WRMHEADER XML。
> - **数据面：** PlayReady 基于 CENC，支持 AES-CTR（cenc）与 AES-CBC pattern（cbcs，Header 4.3+），不支持 cens/cbc1；同一 {KID, CK} 不可跨 CTR/CBC 复用；多 DRM 共用 CK 时内容机密性上限由最弱授权路径决定。
> - **控制面与绑定：** License 采用 XMR，绑定客户端证书公钥，包含时间、最低安全级别、OPL 等策略；Challenge 需验证证书链、能力与业务授权，复制 HTTP 请求头无法获得可导出密钥。
> - **安全等级边界：** SL150 仅开发测试，SL2000 是强化软件客户端，SL3000 把私钥、License bind、解密样本、状态和输出控制推入 TEE；SL 不是分辨率，4K 只给 SL3000 是业务策略而非规范。
> - **风险与运营：** 输出保护按类型区分 OPL（如未压缩数字视频 100/250/270/300），最弱显示器可能阻断播放；Key Seed 泄露会重算大量历史 CK；License Server 的 KID/CK 越权、撤销陈旧、日志不全是最被低估的短板。

> **读完本文，你将获得：**
> 
> -   分清 `cenc:pssh` 、 `mspr:pro` 、PRO、PRH、WRMHEADER 和 License，避免把六个对象叫成同一个“DRM 数据”
> -   看懂 PlayReady 从 KID、内容密钥到客户端证书和许可证绑定的完整控制面
> -   理解 SL150、SL2000、SL3000 的真实边界，以及为什么安全等级不等于分辨率等级
> -   理解 AES-CTR/CBCS、密钥轮换、Root/Leaf License、Secure Stop 和输出保护分别解决什么问题
> -   用 Shaka Packager、Bento4、GPAC、Shaka Player 和 dash.js 搭建只处理自有测试内容的分析环境
> -   从攻击面而不是宣传页评估 PlayReady：哪些边界稳，哪些风险只是被推到了 TEE、OEM 和 License Server

## 〇、摘要：我最初把那段 Base64 当成了许可证

笔者第一次认真拆 PlayReady，是在 DASH MPD 里盯着这样一个节点：

```xml
<ContentProtection
  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">
  <cenc:pssh>AAA...</cenc:pssh>
</ContentProtection>
```

第一反应很自然：这一大段 Base64 应该就是 License，里面也许还藏着内容密钥。

解开第一层，得到一个 ISO BMFF `pssh` box；继续取出 `Data` ，得到 PlayReady Object；按小端字段再拆一层，遇到 `0x0001` 记录；最后用 UTF-16LE 解码，才看见一段 `WRMHEADER` XML。里面有 KID、算法和 License URL，唯独没有内容密钥。

这个过程像连续拆了四层包装，最后发现盒子里只有一张取件单。

也正是从这里开始，PlayReady 最容易被误解的地方浮了出来： **媒体里的 Header 负责描述和路由，不负责建立信任；真正的安全性来自 License 对客户端身份的绑定、客户端私钥、策略校验、受保护执行环境和输出路径。**

换句话说，一段 UTF-16 XML 管不住 4K。能管住它的是 XML 后面那条没有写在 MPD 里的信任链。

本文会从字节布局一路走到 SL3000，但先约定三种证据等级：

| 标记  | 含义  | 本文示例 |
| --- | --- | --- |
| **公开规范** | Microsoft、W3C、DASH-IF 或工具官方资料明确说明 | PRO 字段、Header 版本、Key System String、SL 定义 |
| **工程观察** | 可在公开测试内容或自有媒体上重复观察 | PSSH/PRO 嵌套、KID 字节序、EME 消息顺序 |
| **安全推断** | 从威胁模型和系统约束推导，不声称是某家服务的内部实现 | 多 DRM 共用 CK 的最弱路径效应、策略误配风险 |

> **研究边界**：本文只讨论公开规范、自有内容打包、官方测试服务和防御性分析。不会给出商业服务密钥获取、设备私钥提取、生产 License 请求复刻或受保护内容导出的操作链。

* * *

## 一、PlayReady 不是“微软版 Widevine”

把 PlayReady、Widevine 和 FairPlay 放到同一张表里时，人很容易只看见共同部分：都是 CENC、都有 License Server、都能在硬件里保护密钥。于是 PlayReady 被粗暴地归纳成“微软版 Widevine”。

这句话对理解行业位置有帮助，对理解技术细节却几乎没帮助。

PlayReady 的公开设计里，有几处很鲜明的工程取舍：

1.  内容侧使用结构化的 PlayReady Header，历史版本兼容跨度很长；
2.  License 不只是发一把 CK，还把权利、时间、最低安全级别和输出策略绑定在一起；
3.  客户端证书与非对称密钥是设备身份和 License 绑定的基础；
4.  除了单次播放，还有 Domain、Metering、Secure Stop、Secure Delete、License Chain 等完整的商业发行能力；
5.  同一套协议既要覆盖 Windows/Edge，也要进入电视、机顶盒、主机和 Android OEM 的平台 DRM。

因此，理解 PlayReady 不能只盯着 AES。AES 只是数据面；PlayReady 真正复杂的是 **谁能拿到哪把钥匙、在什么环境里使用、能用多久、能从哪个输出口出去**。

### 1.1 六层模型

笔者最终把 PlayReady 拆成了六层：

| 层   | 关键对象 | 解决的问题 |
| --- | --- | --- |
| **媒体信令** | `ContentProtection` 、SystemID、 `pssh` 、PRO、WRMHEADER | 用哪个 DRM、去哪里申请、需要哪个 KID |
| **媒体加密** | CENC、 `cenc` 、 `cbcs` 、IV、subsample、KID/CK | 分片如何被 AES 加密 |
| **授权协议** | Challenge、License Response、XMR License | 客户端能否获得受约束的 CK |
| **设备身份** | Client Certificate、证书链、加密/签名密钥 | License 发给谁，谁能解开 |
| **执行环境** | SL2000、SL3000、REE、TEE、Secure Decoder | 密钥和明文在哪一侧出现 |
| **输出策略** | OPL、HDCP、模拟/数字输出限制 | 解密后能否送到显示链路 |

这六层之间任何一层不满足，最终表现都可能只是一个很无聊的“播放失败”。但失败原因可能分别是：Header 不兼容、License 被拒、证书级别不足、时钟不可信、输出不满足 HDCP，或者密钥已经绑定却不能在当前安全环境中使用。

* * *

## 二、一张图看完端到端信任链

下图按 Cocoon AI `architecture-diagram` 规范绘制。箭头上蓝色数据大多可以公开分发；红色对象必须留在 KMS、License Server 或设备安全边界里；紫色是策略，它本身不保密，却决定客户端是否允许密钥被绑定和使用。

这张图里最值得注意的不是箭头，而是三条边界：

-   CDN 可以看到 KID、PSSH、PRO 和加密分片，但不应持有 CK；
-   Web App 可以驱动 EME、转发 Challenge/Response，却不应获得可导出的 CK；
-   SL3000 把私钥、License 绑定、内容密钥、解密和关键输出控制进一步压进 TEE。

所以，PlayReady 的目标不是让攻击者“看不见协议”。协议的大部分路由信息本来就是公开的。它的目标是让攻击者即使复制了 MPD、PSSH、Challenge、Response 和全部媒体分片，也无法在另一台不受信任的执行环境中重放出同样的结果。

* * *

## 三、从 MPD 到 UTF-16：逐层拆开初始化数据

PlayReady 的名词密度很高。最有效的办法不是背术语，而是沿着实际字节流往里走。

### 3.1 第一层：DASH ContentProtection

PlayReady 的 Content Protection System ID 是：

```text
9a04f079-9840-4286-ab92-e65be0885f95
```

一个多 DRM 的 MPD 通常同时包含通用加密描述和一个或多个 DRM 描述：

```xml
<ContentProtection
  schemeIdUri="urn:mpeg:dash:mp4protection:2011"
  value="cenc"
  cenc:default_KID="00112233-4455-6677-8899-aabbccddeeff" />

<ContentProtection
  schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"
  value="MSPR 2.0">
  <cenc:pssh>BASE64_COMPLETE_PSSH_BOX</cenc:pssh>
  <mspr:pro>BASE64_PRO_ONLY</mspr:pro>
</ContentProtection>
```

这里有第一个常见坑：

-   `cenc:pssh` 是 **完整的 `pssh` box**，Base64 解码后从 size 和 `pssh` 类型开始；
-   `mspr:pro` 只有 **PRO payload**，外面没有 ISO BMFF box 头；
-   初始化分片的 `moov` 里也可以直接带 `pssh` ；
-   同时存在时，MPD 中的信令可以覆盖媒体文件里较早打包进去的 License URL。

这套设计非常适合 CDN：媒体文件不用因为 License Server 地址变化而重新加密，服务方可以在生成 MPD 时改路由。

### 3.2 第二层：ISO BMFF pssh

常见的 version 0 PSSH 可以抽象成：

```text
size        4 bytes, big-endian
type        4 bytes, "pssh"
version     1 byte
flags       3 bytes
system_id  16 bytes
data_size   4 bytes, big-endian
data        data_size bytes
```

version 1 还会在 `system_id` 后带一个 KID 数组。PlayReady 在 `data` 中放的是 PRO。这里要记住两种字节序同时存在： **ISO BMFF box 的整数使用网络/大端语义，而 PRO 和 PlayReady GUID 又带着微软生态的小端表示。**

### 3.3 第三层：PlayReady Object

PRO 的结构并不神秘，公开 Header 规范给得很清楚：

```text
PlayReady Object
+0x00  DWORD  Object Length       // 整个 PRO 的字节数，最大 15 KiB
+0x04  WORD   Record Count
+0x06  ...    Records

PlayReady Object Record
+0x00  WORD   Record Type
+0x02  WORD   Record Length
+0x04  ...    Record Value
```

目前公开定义的 Record Type：

| Type | 含义  |
| --- | --- |
| `0x0001` | PlayReady Header / PRH |
| `0x0002` | 保留  |
| `0x0003` | Embedded License Store / ELS |

大多数流媒体初始化数据里看到的是一个 `0x0001` 记录，Record Value 就是 UTF-16LE 编码的 XML。

下面这个解析器故意只做 metadata 检查，不生成 Challenge，不处理 License，也不接触任何设备材料：

```python
import struct

def parse_pro(blob: bytes):
    if len(blob) < 6:
        raise ValueError("PRO too short")

    total_len, record_count = struct.unpack_from("<IH", blob, 0)
    if total_len != len(blob) or total_len > 15 * 1024:
        raise ValueError("invalid PRO length")

    offset = 6
    records = []
    for _ in range(record_count):
        record_type, record_len = struct.unpack_from("<HH", blob, offset)
        offset += 4
        value = blob[offset:offset + record_len]
        if len(value) != record_len:
            raise ValueError("truncated record")
        offset += record_len
        records.append((record_type, value))

    if offset != total_len:
        raise ValueError("trailing or inconsistent data")
    return records
```

解析时必须校验总长度、记录长度和上限。把 PRO 当“可信 XML 前缀”直接切字符串，不仅会读错，也会把二进制解析面变成一个不必要的攻击入口。

### 3.4 第四层：WRMHEADER

典型 Header 4.3 如下：

```xml
<WRMHEADER xmlns="http://schemas.microsoft.com/DRM/2007/03/PlayReadyHeader"
           version="4.3.0.0">
  <DATA>
    <PROTECTINFO>
      <KIDS>
        <KID ALGID="AESCBC"
             VALUE="MyIRAFVEd2aImaq7zN3u/w=="></KID>
      </KIDS>
    </PROTECTINFO>
    <LA_URL>https://license.example.test/playready</LA_URL>
  </DATA>
</WRMHEADER>
```

这段 XML 看起来宽松，实际解析要求相当古典：元素和属性名区分大小写、命名空间属性要在普通属性之前、属性按字母顺序排列、所有节点必须显式闭合。把一个能被浏览器 XML parser 接受的 Header 交给旧 PlayReady 客户端，不代表它也会接受。

Header 版本与能力的关系：

| Header | 引入  | 关键能力 |
| --- | --- | --- |
| `4.0.0.0` | PlayReady 1 | 单 KID、早期 AES-CTR 信令 |
| `4.1.0.0` | PlayReady 2 | 扩展字段与兼容演进 |
| `4.2.0.0` | PlayReady 3 | `KIDS` 容器与多 KID |
| `4.3.0.0` | PlayReady 4 | `AESCBC` ，对应 CENC `cbcs` 互操作 |

几个字段需要单独纠偏：

-   `KID` 是密钥标识，不是内容密钥；
-   `LA_URL` 是 License 路由，不是授权凭据；
-   `CHECKSUM` 用于发现 KID/CK 配错，不能替代签名或完整性保护；
-   `CUSTOMATTRIBUTES` 是业务自定义元数据，Microsoft 客户端不会自动赋予它安全语义；
-   `DECRYPTORSETUP=ONDEMAND` 是建图/许可证获取时序提示，不等于“允许无 License 解密”。

### 3.5 最容易把人绕晕的 KID 字节序

假设 MPD 中写的是：

```text
00112233-4455-6677-8899-aabbccddeeff
```

CENC `tenc.default_KID` 按 16 字节大端 UUID 表示；PlayReady Header 的 `KID VALUE` 则是 GUID 的小端字段布局再 Base64。前三段字段会发生重排，最后 8 字节不变。

```text
CENC UUID bytes:
00 11 22 33 44 55 66 77 88 99 aa bb cc dd ee ff

PlayReady GUID bytes:
33 22 11 00 55 44 77 66 88 99 aa bb cc dd ee ff
```

这不是“两把不同的 KID”，而是同一个 128-bit 标识的两种序列化。很多自制打包器最后死在这里：MPD、 `tenc` 和 WRMHEADER 看起来各自都合法，License Server 却查不到同一把 CK。

* * *

## 四、数据面：KID、CK 与 CENC 到底怎么配合

一份受保护内容至少有两个核心对象：

```text
KID = public identifier
CK  = secret 128-bit content key
```

KID 可以出现在 MPD、PSSH、PRO、 `tenc` 和 License 请求里；CK 应只存在于打包/KMS 边界、License 生成过程和受保护客户端边界。

### 4.1 PlayReady 没有发明另一套媒体加密

现代 DASH/CMAF 工作流通常使用 ISO Common Encryption：

| Scheme | 模式  | PlayReady 支持边界 |
| --- | --- | --- |
| `cenc` | AES-CTR | 最广泛兼容；PlayReady 1.x 起支持 |
| `cbcs` | AES-CBC pattern encryption | PlayReady 4.0+ 与 Header 4.3 支持 |
| `cens` | AES-CTR pattern | Microsoft 当前支持矩阵标记为不支持 |
| `cbc1` | AES-CBC full-sample/subsample | Microsoft 当前支持矩阵标记为不支持 |

老客户端的 IV 支持也不同：早期 PlayReady 主要使用 8-byte IV，PlayReady 4 之后才覆盖 16-byte IV 的现代场景。面向电视存量设备时，算法正确不代表兼容矩阵正确。

Microsoft 还特别提醒： **不要用同一组 `{KID, CK}` 对同一内容同时做 CTR 和 CBC 加密。** 这不只是播放器兼容问题，也是密码工程里不应跨模式复用同一密钥材料的基本卫生。

### 4.2 一份密文，多套 DRM

CENC 最有价值的地方，是允许同一份加密媒体配多种 DRM 信令：

```text
encrypted CMAF segments
  + Widevine PSSH
  + PlayReady PSSH / PRO
  + FairPlay signaling in its delivery path
```

服务方可以让多个 DRM 使用同一个 `{KID, CK}` ，只为每种客户端生成不同格式和策略的 License。CDN 不需要存三份视频。

但安全上有一个直接后果： **内容机密性的上限会受到最弱授权路径影响。** PlayReady SL3000 做得再严，如果同一个 CK 还能通过另一个低保障客户端获得，攻击者不会执着于最硬的一扇门。这是多 DRM 架构必须做分层密钥、轨道分级和设备策略的原因之一。

### 4.3 一部片不一定只有一把钥匙

常见策略包括：

-   音频和视频分开 KID；
-   SD/HD/UHD 使用不同 KID；
-   不同 Period 或时间窗口做 Key Rotation；
-   Root License 保护 Leaf License 的 key，实现 License Chain；
-   直播按时间段轮换 key，同时让许可证提前覆盖有限窗口。

这里要区分两个概念：

| 动作  | 变化对象 | 目的  |
| --- | --- | --- |
| **Key Rotation** | 媒体分片使用的 CK/KID | 缩小单把 CK 的内容范围 |
| **License Rotation/Renewal** | 授权对象、时效或策略 | 缩小会话时间与策略窗口 |

二者可以一起发生，也可以独立发生。只轮换 License 而媒体一直用同一 CK，泄露后的内容半径并不会自动缩小。

### 4.4 Key Seed：方便，但爆炸半径很大

PlayReady 公开了一种从 `KeySeed + KID` 确定性派生 CK 的标准算法。它能让服务方只保存 seed，不必为每个 KID 存 CK。

工程上很省事，安全上却要看规模：全局 seed 一旦泄露，攻击者可以为大量历史 KID 重新计算 CK。现代服务更适合把 seed 按租户、内容域或轮换周期隔离，或者直接由 KMS 保存显式的 KID/CK 映射，并对导出、审计和销毁做独立控制。

* * *

## 五、控制面：License Acquisition 不是一次“取 Key”请求

当播放器从 MPD 或初始化分片得到 init data 后，Web 场景通常进入 EME：

```javascript
const access = await navigator.requestMediaKeySystemAccess(
  "com.microsoft.playready.recommendation",
  configurations
);
```

在当前 Microsoft 文档中：

-   `com.microsoft.playready.recommendation` 是 Edge 上优先使用的现代 Key System String；
-   `com.microsoft.playready.recommendation.3000` 用于请求满足硬件 DRM/SL3000 的路径；
-   `com.microsoft.playready` 属于兼容历史实现的旧字符串，在新 Porting Kit 中已经被弃用或移除。

第三方播放器为了兼容旧设备仍会保留多个字符串。生产播放器不能只写一个字符串然后把所有失败归因于 License Server。

### 5.1 Reactive 与 Proactive

PlayReady 有两种典型的许可证获取时序：

| 模式  | 触发点 | 适合场景 |
| --- | --- | --- |
| **Reactive** | 播放器遇到受保护内容后创建会话 | 简单在线播放 |
| **Proactive** | 应用提前获得 Header 并发起 License Acquisition | 离线、预取、降低首帧延迟 |

无论哪种，逻辑链都可以简化为：

```text
Header/init data
  -> Client builds Challenge
  -> App transports Challenge over HTTP(S)
  -> License Server validates client + business authorization
  -> Server returns signed, client-bound License(s)
  -> Client validates, binds, stores or keeps temporary
  -> Decryptor becomes usable
```

### 5.2 Challenge 里为什么要带客户端信息

License Server 不只需要知道 KID，还要回答三个问题：

1.  请求来自什么客户端和证书链？
2.  客户端声明并证明了什么安全能力？
3.  业务侧是否允许这个账户、设备、地区和播放会话获得对应策略？

PlayReady 客户端证书包含客户端身份信息、公钥和安全级别。Server SDK 新版本还可以读取客户端上报的 REE/TEE feature list，例如安全时钟、Secure Stop、硬件解码和某些输出能力。服务端可以据此选择不同轨道和 License Policy。

这也是为什么复制浏览器请求头没有意义：HTTP 外壳可以仿，能够解开 License 的客户端私钥和受认证安全能力不能靠改 UA 获得。

### 5.3 License 里装的不是“裸 CK”

PlayReady License 使用 XMR（Extensible Media Rights）格式。公开概念文档说明每个 License 对应一个 `{KID, CK}` ，一个 Response 可以携带多个 License，同时包含权利和策略。完整 XMR 二进制格式并非面向所有人的公开实现规范，因此分析时应克制：知道它承载什么，不代表可以凭公开网页重写一个兼容实现。

常见策略维度包括：

-   Play right；
-   开始时间、绝对过期时间；
-   首次播放后的相对过期时间；
-   最低 Security Level；
-   压缩/未压缩、模拟/数字输出对应的 OPL；
-   License 是否持久化；
-   是否需要安全时钟、Secure Stop 或其他能力。

Server 会把 License 绑定到客户端证书中的公钥。对应私钥没有离开客户端安全边界时，抓到 Response 只是抓到一份发给别人的密文授权。

### 5.4 “License 成功”仍可能不能播

许可证获取成功只代表 Response 被客户端接受，不代表最终媒体一定出画。后面还要过：

```text
signature and certificate validation
  -> KID match
  -> time policy
  -> minimum security level
  -> output protection
  -> decryptor/decoder capability
  -> protected rendering path
```

这解释了很多看似矛盾的日志：HTTP 200、License session 也更新了，视频仍然黑屏。问题可能已经不在网络，而在 bind 或 output 阶段。

* * *

## 六、设备身份：证书、私钥与 Provisioning

PlayReady 不是单纯相信“客户端说自己是 SL3000”。安全级别和公钥被放在客户端证书体系中，License Server 根据证书和协议结果做决策。

从功能上看，一个客户端至少需要：

```text
certificate chain
encryption key pair
signing key pair
implementation identity / capabilities
secure persistent state
```

不同平台如何生成、注入和保护这些材料，属于 Porting Kit、OEM 集成和合规体系的一部分。桌面软件 DRM、Windows 硬件 DRM、电视 SoC 和 Android DRM Plugin 的实现不会完全相同。

### 6.1 Individualization 与 Remote Provisioning

老资料经常把 provisioning 简化成“下载一个设备证书”。实际上它还涉及：

-   设备或实现组身份；
-   证书链更新；
-   密钥生成与封装；
-   撤销和版本状态；
-   TEE 与 REE 间安全消息；
-   固件更新后的身份连续性。

对 SL3000 来说，最关键的问题不是证书文件放在哪个目录，而是 **生成和使用私钥的执行环境是否让 REE 无法读出它**。如果把硬件级证书复制进一个普通进程就能获得同等能力，SL3000 的定义本身就失效了。

### 6.2 撤销为什么必须是系统能力

DRM 客户端永远可能出现实现漏洞。没有撤销机制时，一次客户端私钥或实现密钥泄露会永久有效。

PlayReady 的服务侧可以结合证书、客户端版本、Server SDK revocation data 和策略拒绝已知不安全实现。这里的难点是运维平衡：撤销太慢，攻击窗口变长；撤销太激进，大量仍在使用旧固件的电视会一起变砖。

* * *

## 七、SL150、SL2000、SL3000：安全等级不是清晰度标签

Microsoft 对三档安全级别的公开定义可以压缩成下面这张表：

| Security Level | 定位  | 典型保护边界 | 适用性 |
| --- | --- | --- | --- |
| **SL150** | 开发与测试 | 不要求有意义的秘密保护 | 不能作为商业内容安全基线 |
| **SL2000** | 强化商业客户端 | 可用软件保护，也可结合硬件能力 | 常见软件 DRM 与主流商业播放 |
| **SL3000** | PlayReady 3.0+ 硬件安全 | TEE、硬件 Root of Trust、受保护媒体路径 | 高价值/UHD 等增强场景 |

License 中的 `MinimumSecurityLevel` 是下限。客户端证书声明的等级低于它时，客户端必须拒绝绑定。

但下面这个等式是错的：

```text
SL2000 = 1080p
SL3000 = 4K
```

安全等级描述客户端保护能力，不描述视频分辨率。把 4K 只发给 SL3000，是流媒体服务的业务与风险策略；规范没有把某个像素数硬编码成安全等级。

### 7.1 SL2000 的真实含义

SL2000 并不等于“毫无保护的软件”。合规实现仍需要代码和秘密保护、抗篡改、完整性检查、证书校验和策略执行。

但它的根本限制也很明确：如果密钥使用和解密最终发生在攻击者完全控制的通用执行环境里，那么动态分析、内存观察、控制流篡改和白盒密码分析始终是威胁模型的一部分。软件可以显著抬高成本，却很难创造真正独立的信任根。

### 7.2 SL3000 把什么推进 TEE

SL3000 的目标不是只把 AES 函数搬进 TrustZone，而是把关键链路一起推进受保护环境：

-   客户端私钥和内容密钥；
-   License 解析、校验和 bind 的安全关键部分；
-   安全时钟与回滚保护；
-   压缩媒体解密；
-   安全视频解码或受保护的解码接口；
-   输出控制与关键状态；
-   密钥历史和防重复使用状态。

Microsoft 的 SL3000 要求强调，解密后的压缩或未压缩音视频都不应被 TEE 外部任意读取。这句话很重要：只保护 CK，却把解密后的 H.265 sample 原样交回普通进程，攻击者根本不需要再偷 key。

### 7.3 Android 上的映射

在 Android PlayReady Plugin 模型中，应用通过 `MediaDrm` 进入 PlayReady DRM Plugin，用 `getKeyRequest` / `provideKeyResponse` 完成许可证获取； `MediaCrypto` 和解码器建立受保护媒体路径。OEM 需要保证安全等级要求下的明文 sample 不离开 TEE 或安全视频路径。

所以浏览器或 App 只是调用者。它能控制会话时序，却不能因为自己有 root Java 对象就自动越过 OEM DRM Plugin 和 secure decoder 的边界。

* * *

## 八、OPL：密钥已经到了，显示器仍然可以把门关上

PlayReady 的输出保护不是一个简单的 `require_hdcp=true` 。License 可以分别约束：

-   压缩数字音频；
-   未压缩数字音频；
-   压缩数字视频；
-   未压缩数字视频；
-   模拟电视输出；
-   特定的显式数字输出保护。

公开文档列出的合法 OPL 取值也因输出类型不同：

| 输出类型 | OPL 取值 |
| --- | --- |
| 压缩数字音频 | 100 / 150 / 200 / 250 / 300 |
| 未压缩数字音频 | 100 / 150 / 200 / 250 / 300 |
| 压缩数字视频 | 400 / 500 |
| 未压缩数字视频 | 100 / 250 / 270 / 300 |
| 模拟电视 | 100 / 150 / 200 |

数字越高一般表示更强的限制，但不同类别不能直接横向比较。例如，未压缩数字视频 OPL 270/300 与 HDCP 和降分辨率/阻断行为有关；压缩数字视频的 400/500 是另一套输出类别。

这层防护堵的是“合法解密后从接口重新录制”的路径。它不能阻止对屏幕最终发光结果的摄像，但可以让 HDMI capture、无 HDCP 显示链路或不满足安全输出要求的组合无法得到高价值信号。

在多显示器环境里还会出现非常实际的兼容问题：硬件 DRM 可能按最弱显示器能力做整体决策。用户明明把视频放在支持 HDCP 的屏幕上，旁边一个旧显示器仍可能导致播放失败。这不是 License 没发下来，而是输出拓扑没有通过策略。

* * *

## 九、那些经常被忽略的 PlayReady 能力

只研究一次在线播放，会漏掉 PlayReady 很大一部分设计。

### 9.1 License Chain

Root License 的内容密钥可以保护 Leaf License 中的内容密钥。这样一批媒体的 Leaf License 可以随内容分发，客户端只需动态获得较少的 Root License。

它适合大规模目录、订阅窗口和可扩展密钥轮换，但也增加了链解析、缓存、撤销和过期语义。调试时看到 KID 对应的 Leaf License，不代表已经拥有完整可绑定链。

### 9.2 Domain

Domain 允许多个已加入同一域的设备共享域绑定 License。它解决“一个家庭多设备”的授权，不等于把单设备私钥直接复制给所有设备。

### 9.3 Metering 与 Secure Stop

Metering 用于聚合播放计量；Secure Stop 用于让客户端在会话结束后形成可回传的安全停止记录。服务端可以知道某次授权是否结束，而不是只在发 License 时看见一次请求。

这类机制不是媒体保密算法，却对并发控制、租赁、广告计费和异常检测非常关键。

### 9.4 Secure Delete

离线 License 到期后，普通文件删除不足以证明授权状态不可恢复。Secure Delete 关注受保护存储中的 License 被安全移除及其状态证明。

### 9.5 Key Exchange

PlayReady 4.5+ 引入 Key Exchange，用 PlayReady 的设备身份和 License 机制保护任意密码密钥，而不要求被保护的数据本身一定走媒体解密管线。4.6 又扩展到一个 Key Exchange License 中携带不同算法的多个 key。

这说明 PlayReady 的核心能力已经不只是一套视频 AES glue，而是一套“把受策略约束的秘密交付到认证客户端”的通用框架。

* * *

## 十、安全评估：PlayReady 真正防住了什么

安全评估必须先确定攻击者站在哪。

### 10.1 网络观察者

网络侧通常能获得：

-   MPD 与 KID；
-   PSSH、PRO、WRMHEADER、LA_URL；
-   加密的 fMP4/CMAF 分片；
-   Challenge 与 License Response；
-   会话时间和请求模式。

但不能仅凭这些公开/可复制对象得到：

-   License Server KMS 中的 CK；
-   客户端私钥；
-   已绑定后的可导出 License key；
-   TEE 内的明文和安全解码输出。

因此 TLS 很重要，却不是 PlayReady 唯一屏障。即使攻击者在自己的设备上合法看见 Challenge/Response，License 绑定仍要阻止跨设备重放。

### 10.2 控制 Web App 或 REE 的本地攻击者

攻击者可以 hook JavaScript、EME 调用、IPC 和网络，甚至修改普通进程。对 SL2000，这会形成显著的逆向压力；对 SL3000，REE 被假定为不可信，安全目标是让这些控制权无法直接变成 key 或明文导出。

但“进了 TEE”不是结论，只是攻击面搬家。剩余风险包括：

-   REE/TEE 消息解析漏洞；
-   共享内存边界和长度校验；
-   secure decoder 或驱动实现错误；
-   固件回滚和安全时钟回滚；
-   调试口、DMA、内存隔离或密钥封装缺陷；
-   OEM 把本应留在 TEE 的中间结果送回 REE；
-   证书或 provision 流程供应链泄露。

### 10.3 License Server 才是最容易被低估的核心

客户端做得再硬，Server Policy 配错仍然可以主动把授权发给不该发的人。需要重点审计：

| 风险  | 典型后果 | 防御  |
| --- | --- | --- |
| KID/CK 映射越权 | 低权限会话拿到高价值轨道 License | 内容、轨道、账号、设备上下文强绑定 |
| 只信客户端声明 | 伪造能力获得更高策略 | 验证证书链、SL 和受认证 feature |
| License 过宽/过长 | 泄露窗口和离线重放扩大 | 最小权利、短窗口、按风险续租 |
| 全局 Key Seed 泄露 | 大范围历史 CK 可重算 | KMS、分域 seed、轮换与审计 |
| 撤销数据陈旧 | 已知失陷客户端继续获取许可证 | 自动化 revocation 发布与灰度 |
| 日志只记 HTTP 结果 | 无法区分拒绝、bind、output 失败 | 端到端 reason code 与匿名化遥测 |

### 10.4 公开研究告诉了我们什么

公开 DRM 研究普遍指出三件事：

1.  设计文档描述的是目标，OEM/浏览器/CDM 的实现质量决定实际下限；
2.  软件 DRM 的攻击成本可以很高，但攻击者和秘密仍在同一通用执行环境；
3.  硬件 DRM 能缩小暴露面，却引入 TEE、固件、驱动和供应链的新复杂度。

因此，正确的安全结论不是“SL3000 不可破”，也不是“只要最终能显示就等于 DRM 无效”。更准确的说法是： **PlayReady 用证书、策略绑定和硬件隔离把批量、可复制、可自动化的攻击，尽量变成高成本、设备相关、容易撤销和难以规模化的攻击。**

* * *

## 十一、一个合法且可复现的实验室

PlayReady Server SDK 和 Porting Kit 是商业交付物，不能靠 GitHub 拼出完整生产栈。但我们仍然可以在不触碰第三方内容的前提下验证大部分公开结构。

### 11.1 实验目标

```text
自有 clear MP4
  -> CENC 打包
  -> 注入 PlayReady SystemID + 测试 PRO
  -> 检查 MPD / PSSH / PRO / WRMHEADER
  -> 使用官方测试内容/测试服务验证 EME 流程
```

边界很明确：本地 raw key 只用于自己生成的测试内容；官方测试服务只配官方测试资产和测试客户端；不接入任何商业流媒体 endpoint。

### 11.2 Shaka Packager 构建

Ubuntu/Debian 环境可按项目当前构建系统执行：

```bash
git clone --recurse-submodules https://github.com/shaka-project/shaka-packager.git
cd shaka-packager
git checkout v3.9.3
git submodule update --init --recursive

cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
./build/packager/packager --version
```

本文固定的是 2026 年 7 月 27 日发布的 `v3.9.3` 。 `--recurse-submodules` 拉取该 revision 对应的第三方依赖， `-G Ninja` 选择项目推荐的生成器， `CMAKE_BUILD_TYPE=Release` 决定优化配置。当前官方构建文档要求 CMake 3.24+。关键参数不是越多越好，而是固定 release tag、记录编译器、CMake 与 submodule revision；DRM/CENC 测试最怕工具版本漂移后仍拿旧命令解释新产物。

### 11.3 打包自己的测试视频

下面的 KID/key 是文档占位值，只能用于自己制作的实验媒体：

```bash
./build/packager/packager \
  in=clear.mp4,stream=video,output=video_cenc.mp4 \
  --enable_raw_key_encryption \
  --keys label=:key_id=00112233445566778899aabbccddeeff:key=000102030405060708090a0b0c0d0e0f \
  --protection_scheme cenc \
  --protection_systems PlayReady \
  --mpd_output manifest.mpd
```

这一步只是在 CENC 文件中写入 PlayReady 信令，不会凭空生成一个受 Microsoft 信任的生产 License Server。raw key 模式的价值是检查媒体面和 init data，不是模拟完整设备信任链。

如果需要覆盖 `cbcs` ，应使用另一组实验 `{KID, CK}` ，并把兼容目标限定在 PlayReady 4+：

```bash
--protection_scheme cbcs
```

### 11.4 用 Bento4 与 GPAC 做交叉检查

```bash
mp4dump video_cenc.mp4
MP4Box -info video_cenc.mp4
```

检查顺序：

1.  `schm` 的 scheme 是不是预期的 `cenc` / `cbcs` ；
2.  `tenc.default_KID` 是否和 MPD 一致；
3.  `pssh.system_id` 是否为 PlayReady UUID；
4.  `pssh.data` 解出的 PRO 总长度和 record count 是否合理；
5.  `0x0001` record 能否严格按 UTF-16LE 得到 WRMHEADER；
6.  WRMHEADER 的 KID 经 GUID 字节序转换后是否回到 `default_KID` 。

只用一个工具检查自己的输出容易形成“同一个 bug 同时负责写和读”的闭环。Shaka 打包、Bento4/GPAC 复核，可以尽早发现字节序和 box size 问题。

### 11.5 播放侧

浏览器 EME 测试可以使用 Shaka Player 或 dash.js，License 侧使用 Microsoft 官方测试服务器与测试内容。应用层只负责：

```text
select key system
create MediaKeys/session
forward message to test license endpoint
feed response to session.update()
observe keystatuseschange / errors
```

不要把生产服务的 Cookie、MSL token、设备材料或 License Response 塞进这个实验室。那既污染变量，也越过了本文的研究边界。

* * *

## 十二、参考项目地图：谁负责哪一层

PlayReady 的生产实现不是一个全开源仓库。下面把“官方资料”“可运行工具”“研究项目”分开，避免看到 GitHub 上写着 CDM 就误以为它等价于经过认证的 PlayReady Client。

### 12.1 Microsoft 官方与标准

| 项目/规范 | 层   | 用途  | 注意事项 |
| --- | --- | --- | --- |
| [Microsoft PlayReady Docs](https://learn.microsoft.com/en-us/playready/) | 全局  | 官方概念、打包、客户端、服务器与安全等级入口 | 公开资料的第一来源 |
| [MicrosoftDocs/PlayReady](https://github.com/MicrosoftDocs/PlayReady) | 文档源码 | 跟踪规范页面历史与变更 | 不是 SDK 源码 |
| [PlayReady Header Specification](https://learn.microsoft.com/en-us/playready/specifications/playready-header-specification) | 信令  | PRO/Record/WRMHEADER 的规范结构 | 最适合实现 metadata parser |
| [DASH Content Protection using PlayReady](https://learn.microsoft.com/en-us/playready/specifications/mpeg-dash-playready) | DASH/CENC | SystemID、MPD、PSSH、KID 字节序 | 文档版本老，但互操作细节仍关键 |
| [Windows Universal Samples / PlayReady](https://github.com/microsoft/Windows-universal-samples/tree/main/Samples/PlayReady) | Windows Client | Reactive/Proactive、硬件 DRM、Secure Stop 示例 | 学习 Windows API，不是生产播放器模板 |
| [PlayReady Test Server docs](https://learn.microsoft.com/en-us/playready/advanced/testservers/query-string-syntax) | 测试授权 | 官方测试配置、策略和错误验证 | 只能配测试内容与测试设备 |
| [W3C Encrypted Media Extensions](https://www.w3.org/TR/encrypted-media/) | Browser API | `MediaKeySystemAccess` 、session 与事件模型 | 不定义 PlayReady License 格式 |
| [W3C CENC Initialization Data](https://www.w3.org/TR/eme-initdata-cenc/) | Init Data | 浏览器如何处理一个或多个 PSSH | 连接 CENC 与 EME |
| [DASH-IF Content Protection Identifiers](https://dashif.org/identifiers/content_protection/) | 注册表 | DRM SystemID 对照 | 适合做识别表，不替代 DRM 规范 |

PlayReady Server SDK 和 Device Porting Kit 是 Microsoft 授权产品，不是缺失在 GitHub 某个角落的开源项目。生产 License 签发、设备认证和合规实现应使用正式交付物。

### 12.2 打包、检查与播放

| 项目  | 角色  | PlayReady 相关能力 | 推荐用法 |
| --- | --- | --- | --- |
| [Shaka Packager](https://github.com/shaka-project/shaka-packager) | CENC Packager | `PlayReady` protection system、PSSH/MPD、多 DRM | 自有媒体打包与互操作测试 |
| [Bento4](https://github.com/axiomatic-systems/Bento4) | ISOBMFF 工具箱 | `mp4encrypt` 、 `mp4dash` 、PRO/PSSH 生成与 `mp4dump` | box 级检查和交叉验证 |
| [GPAC](https://github.com/gpac/gpac) | 多媒体框架 | MP4Box CENC/PIFF、DASH、PSSH 注入与检查 | 复杂 MP4/CMAF 工作流 |
| [Shaka Player](https://github.com/shaka-project/shaka-player) | Web 播放器 | EME、多 Key System、License URL 配置 | 浏览器测试与错误观测 |
| [dash.js](https://github.com/Dash-Industry-Forum/dash.js) | DASH 参考播放器 | PlayReady Key System 与 protectionData | DASH-IF 互操作验证 |
| [pssh-box-rs](https://github.com/emarsden/pssh-box-rs) | PSSH parser | 多 DRM PSSH 解析和序列化 | 只分析 init data，适合写检查工具 |

FFmpeg 很适合编码、demux、探测和 clear 内容验证，但它不是 PlayReady License/设备信任实现。把“能读取加密 MP4 容器”写成“支持 PlayReady”，会把容器能力和 DRM 能力混为一谈。

### 12.3 研究项目：能读代码，不等于能进生产

| 项目  | 状态/范围 | 研究价值 | 风险提示 |
| --- | --- | --- | --- |
| [ready-dl/pyplayready](https://github.com/ready-dl/pyplayready) | 非官方 Python 协议研究实现；GitHub 当前只保留 [迁移指针](https://git.gay/ready-dl/pyplayready) | 观察 PSSH、证书、Challenge 和二进制结构 | 不是 Microsoft CDM，不是认证客户端；不要导入来源不明的设备秘密 |
| [playready-rs](https://github.com/devine-dl/playready-rs) | 基于 pyplayready 的 Rust 重实现/分支 | 类型化 parser、证书和 PSSH 代码阅读 | 同样不代表合规或生产安全性 |
| [replayready](https://github.com/devine-dl/replayready) | SL3000 wrapping 机制的窄范围研究代码 | 理解 TEE wrapper 研究方向 | 范围很窄，不能据此推导完整 SL3000 实现 |
| [A First Look at DRM Systems](https://arxiv.org/abs/2308.00437) | 学术对比研究 | 对比 Widevine、FairPlay、PlayReady 的移动安全模型 | 论文分析不替代最新版合规规则 |

笔者刻意没有把通用下载器、商业服务模块和密钥库项目列为“PlayReady 参考实现”。它们解决的是内容获取工作流，既不能说明协议实现正确，也很容易把研究带到不必要的授权风险里。

* * *

## 十三、实现和审计时最值得记住的十条

1.  `cenc:pssh` 包含完整 box， `mspr:pro` 只包含 PRO。
2.  PRO 是小端记录容器，PRH 是其中 `0x0001` 记录的 UTF-16 XML。
3.  KID 可以公开，CK 不能；Header 里没有 CK。
4.  CENC UUID 与 PlayReady GUID 表示存在字节序转换。
5.  Header XML 有严格 canonicalization、大小写、属性顺序和显式闭合要求。
6.  License Response 能被抓到，不代表能在另一客户端绑定。
7.  SL 是客户端安全能力，不是固定分辨率标签。
8.  SL3000 必须保护的不只是 key，还包括解密 sample、状态和输出路径。
9.  多 DRM 共用 CK 时，要按最弱授权路径重新评估整套内容安全性。
10.  License Server 的策略、KMS、撤销和可观测性，与客户端 TEE 同样重要。

* * *

## 十四、结语：真正的边界不在那段 XML 里

回到开头那段 Base64。

它可以被复制，可以被解码，可以被改写，甚至可以在文本编辑器里看见 License URL。PlayReady 并不指望靠隐藏这段 XML 获得安全性。

真正的边界在它后面：KID 只负责定位，CK 留在 KMS；Challenge 携带客户端身份，License 绑定到公钥；SL 决定在哪个执行环境里使用；OPL 决定明文最终能从哪里出去；撤销和 Secure Stop 再把一次播放纳入长期运营控制。

所以，PlayReady 最值得研究的不是某个 AES 调用，也不是某个 SOAP 标签，而是它如何把 **内容、设备、策略、时间和输出** 绑成一个不能被轻易拆开的授权状态机。

一段 UTF-16 XML 当然管不住 4K。

但当它指向一条从 License Server 一直延伸到 TEE 和 HDMI 的信任链时，事情就完全不同了。
