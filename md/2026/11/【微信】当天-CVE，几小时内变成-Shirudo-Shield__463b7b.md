---
title: 【微信】当天 CVE，几小时内变成 Shirudo Shield
source: https://mp.weixin.qq.com/s/8Hjq5C_WhbOqCoGThsNxHg
source_host: mp.weixin.qq.com
clip_date: 2026-11-28T01:41:57+08:00
trace_id: f730675a-5462-46b0-a3b5-b6eb7093b92d
content_hash: 89783f33851da2bc50eff27852070a39db4e87320bf0ec5374511f5915f58902
status: synced
tags:
  - 微信
  - 漏洞分析
  - 模拟执行
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Shirudo 作为 OpenAI 与 Cisco 联合发布的运行时防护平台，其团队能在数小时内为当天 CVE 写出可用的 Shield——Elasticsearch 越界读用 12 小时、FFmpeg 堆越界读写用 8 小时。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 42575244-d011-81f7-9533-e515e9a3a0ca
ioc:
  cves:
    - CVE-2026-135736
    - CVE-2026-82303
  cwes:
    - CWE-126
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Shirudo 作为 OpenAI 与 Cisco 联合发布的运行时防护平台，其团队能在数小时内为当天 CVE 写出可用的 Shield——Elasticsearch 越界读用 12 小时、FFmpeg 堆越界读写用 8 小时。
> 
> - **平台定位：** Shirudo 是承载“Shield”小防护程序的签名与交付基础设施，提供构建工具链、签名包格式、registry 拉取、只加载 operator 签名内容的内核及 TPM 加载记录；Shield 基于 eBPF（内核 hook 或 uprobe）或签名 Java agent。
> - **代价与限制：** 仍是 pre-release，生产主机需带 Shirudo signed-loader 补丁的内核与 TPM 2.0，落地等于更换整个机群内核；之后加载新 Shield 无需重启。
> - **预防型案例（Elasticsearch CVE-2026-82303，CVSS 7.5）：** 预认证 LZ4 帧声明的 literal run 超过 compressedLength，解压器越界读入共享 Netty 池化缓冲区并回吐凭据等内存。Java agent retransform `decodeBlock`，把源截断到 compressedLength，并在切片内解压后校验 consumed 是否相等，不符即断开连接。
> - **检测型案例（FFmpeg CVE-2026-135736，CVSS 9.2）：** deband 滤镜的 coupling 选项在运行时经 zmq/sendcmd 开启，绕过启动时的像素格式检查，子采样输入上下一帧堆越界读写。uprobe 挂 `avfilter_process_command`，读取内存中的像素格式，仅在色度子采样时告警，其余格式放行。
> - **两种边界与效果：** 预防型直接阻断利用路径直到补丁铺开；检测型只告警、ffmpeg 继续运行（随后崩溃，退出码 139），但撤下 Shield 后告警立即停止。核心逻辑是“只有运行中的进程知道像素格式”，因此静态网络规则无法区分攻击与正常使用。

**赛博生存指南** *2026年11月26日 17:20*

> 原文：https://second.security/shirudo/  
> 作者：Second Security（The Patchless Window）  
> 发布时间：2026-11-24  
> 翻译模型：DeepSeek V4.1 Flash  
> 质量评分：★★★★☆（4/5） ｜ 标签：AI×安全 · 检测基础设施 · Linux 攻防 · 漏洞利用

**AI 摘要**：OpenAI 与 Cisco 在 2026-11-23 发布 Shirudo——用 eBPF 或 Java agent 承载签名运行时防护的开源平台。Second Security 的实验室在 12 小时内为 Elasticsearch 预认证越界读 CVE-2026-82303 做出预防型 Java agent Shield，又在 8 小时内为 FFmpeg deband 滤镜的堆越界读写 CVE-2026-135736 做出检测型 eBPF uprobe Shield；文中给出两条利用路径、两段防护代码与实验室结果表。

本仓库 11-25 的《shirudo 简介》拆过它的签名加载与 TPM 证明链；这篇是平台发布次日的一手实战记录，最值得看的是「拿到 advisory 后几个小时就能写出 Shield」这条流水线，以及同一套框架下预防型与检测型两种 Shield 的边界。

OpenAIhttps://openai.com/index/introducing-shirudo/ 和 Ciscohttps://isovalent.com/blog/post/cisco-openai-shirudo/ 在前一天（2026-11-23）发布了 Shirudo：一个在运行时保护 Linux 系统的开源平台，随平台交付的是它称为 Shield 的签名小防护程序，基于 eBPF 或 Java agent。Shield 在运行中的系统上阻断或检出漏洞所需的行为，一直撑到真正的补丁铺开。

补丁跟不上。OpenAI 指出，一个补丁仍可能需要数天到数周的测试和铺开；用 Cisco 的话说，「AI 驱动的攻击以秒为单位展开」。

Shirudo 发布至今不到 24 小时，我们已经把实验室接上了它的 Shield 格式，现在它能构建 Shirudo Shields。我们为 CVE-2026-82303 和 CVE-2026-135736 做出了可用 Shield，两个 CVE 发布都不到 24 小时，Shield 在发布后几小时内完成。

| 时间（UTC） | 事件  |
| --- | --- |
| 11-23 21:04 | Elasticsearch CVE 发布 |
| +0h 33m | Shirudo 发布 |
| +12h 07m | 我们的 Shield 完成 |

## 什么是 Shirudo

Shirudo 是实时防护的基础设施。防护本身叫 Shield：小的、带签名的程序。Shirudo 负责把 Shield 从作者手里送到运行中的主机：构建工具链、签名包格式、每台主机从 registry 拉取的交付、只加载 operator 签名内容的内核，以及记录加载内容、供外部验证的 TPM。

Shirudo 还不是开箱即用的方案。它处于 pre-releasehttps://docs.shirudo.dev/start/faq.html，生产主机需要带 Shirudo signed-loader 补丁的内核和 TPM 2.0，采用它意味着更换整个机群（fleet）跑的内核。一旦主机跑上这个新内核，后续每个新 Shield 加载都不需要重启。

Shield 跑在 eBPF 上，eBPF 把经过验证的程序加载进运行中的 Linux 内核：可以是内核 hook，也可以是挂在应用内部某个函数上的 uprobe。Shirudo 也支持签名 Java agent，用来改写 JVM 内的 Java 字节码。

Shirudo 同样是为 AI agent 驱动而设计的，按 Cisco 的说法，agent 可以读取、编写和维护 Shield。

## CVE-2026-82303：AI 生成的预防型 Shield

### 漏洞：Elasticsearch 预认证越界读

CVE-2026-82303 是 Elasticsearch node-to-node transport 的预认证缓冲区越界读（CWE-126），CVSSv3.1 7.5（High），2026-11-23 随 Elastic 的安全公告https://discuss.elastic.co/t/391840发布。

transport 协议支持 LZ4 压缩，每个入站帧读进池化的 Netty buffer，其底层数组是一大块与其他在途请求共享的内存。解码器读 block 头，里面同时声明压缩长度和解压长度，然后把整个共享数组交给 LZ4 解压器，不限制读取多少源字节；于是一个 block 只要声明的 literal run 比 compressedLength 长，就会让解压器读过该 block 实际占用的字节，进入共享缓冲区里的相邻数据。

通过对利用流程的精细构造，我们让服务器在响应里把越界读到的字节返回给攻击者。这些字节是任意活跃堆内存，可能包含其他请求的凭据或会话密钥。

12 小时内，实验室从 advisory 走到可用 exploit，再到验证过的 Shirudo Shield 拦住它。

### Shield

并非所有 Shield 都是 eBPF 程序：Shirudo 也能把 Shield 作为签名 Java agent 交付。当 Shield 需要活在 Java 应用内部时，这很有用。Java agent 使用 JVM 自带的 instrumentation 接口 `java.lang.instrument` ，在类加载时改写字节码，或 retransform 已加载的类，不碰应用的 jar 和源码。

对 CVE-2026-82303，agent retransform `decodeBlock` ，把它对 LZ4 解压器的唯一一次调用改为调用我们的 guard。读取越过 compressedLength 的 block 会被拒绝并报错，Elasticsearch 处理这个错误的方式是关闭该 transport 连接；格式正确的良性 LZ4 帧则原样解压。

原文的系统示意图，按图示说明转写如下：

| 环节  | 内容  |
| --- | --- |
| 攻击者 | LZ4 帧，literal run 大于 compressedLength，预认证 |
| 入口  | node-to-node transport 的入站帧， `decodeBlock()` → `decompress()` |
| 改写点 | `Lz4TransportDecompressor`<br><br>，agent 改写了这次调用 |
| guard 检查 | ① 把源截断到 compressedLength；② 在切片内解压；③ 检查 consumed 是否等于 compressedLength |
| 越界  | 拒绝，抛错并关闭连接 |
| 正常  | 返回解压输出，行为不变 |

```java
static int decompress(byte[] src, int srcOff, byte[] dest, int destOff,
                      int destLen, int compressedLength) {
    byte[] bounded = Arrays.copyOfRange(src, srcOff, srcOff + compressedLength);  // read only the block's bytes
    int consumed;
    try {
        consumed = LZ4.decompress(bounded, dest, destOff, destLen);
    } catch (RuntimeException overRead) {
        throw blocked(compressedLength, overRead);       // read past the block
    }
    if (consumed != compressedLength)
        throw blocked(compressedLength, null);           // length disagreed
    return consumed;
}
```

实验里，没有 Shield 时越界读泄露内存中的敏感信息；加载 Shield 后，同样的帧在解压器处被拒，连接被断开，良性流量不受影响。

Elasticsearch 的结果，按 Shield 状态与帧类型分：

| Shield | 利用载荷 | 合法载荷 |
| --- | --- | --- |
| 无   | 泄露内存敏感信息 | 正常解压、响应 |
| 已加载 | 连接被拒 | 原样解压 |

它堵住了利用所需的路径，并一直撑到节点升级到修复版 Elasticsearch——那里的解压器已经被限制在 block 的 compressedLength 内。

## CVE-2026-135736：AI 生成的检测型 Shield

### 漏洞：FFmpeg 的堆越界读写

CVE-2026-135736 是 FFmpeg deband 视频滤镜里的堆越界读写，由 AISLE Research 的 Joshua Rogers 发现，CVSSv4 9.2（Critical）。影响 4.4 起、9.1 之前的版本，2026-11-24 发布。

Deband 是平滑 banding 的 FFmpeg 滤镜，banding 就是天空这类渐变里能看见的色阶。它的 coupling 选项让滤镜把每个像素的亮度和颜色放在一起处理。FFmpeg 可以在运行时改滤镜选项，走 zmq filter（网络命令）或 sendcmd（脚本命令），所以 `deband coupling 1` 能在流处理中途打开 coupling。

滤镜只在启动时检查一次输入，而这条命令跳过了检查。检查针对视频的像素格式，也就是颜色怎么存：最常见的 yuv420p 把色度放在亮度的四分之一分辨率上（chroma subsampling），yuv444p、RGB 和 gray 则保持全分辨率。在子采样输入上，coupling 让下一帧读过并写过较小颜色缓冲区的边界。公告警告会崩溃，也可能代码执行。修复https://github.com/FFmpeg/FFmpeg/commit/24ad423d908cd595c983b6c503ddb0ee94901ba2只对子采样格式拒绝这条命令：危不危险取决于像素格式，而只有运行中的进程知道像素格式，所以网络规则分不清攻击和正常使用。

8 小时内，实验室从 advisory 走到可用 exploit，再到验证过的 Shirudo Shield 检出它。

### Shield

我们的 Shield 是一个 uprobe：内核在应用的某个函数被调用时运行的 eBPF 程序，手里有这个函数的参数。它挂在 FFmpeg libavfilter 库的 `avfilter_process_command` 上——所有运行时滤镜命令都要经过这一个函数，不管来自 zmq 还是 sendcmd。内核在函数第一条指令前运行它。

关键在于像素格式。Shield 从 FFmpeg 自己的内存里读视频的像素格式。如果是子采样，Shield 在会溢出的那一帧之前告警。其他格式，比如 yuv444p、RGB 或 gray，命令直接放行，不告警，和修复划的线一致。

FFmpeg 的系统示意图，按图示说明转写如下：

| 环节  | 内容  |
| --- | --- |
| 攻击者 | zmq 消息 `deband coupling 1` |
| 入口  | zmq filter 拆出 target、command、value，调用 `avfilter_process_command()` |
| 挂钩点 | `libavfilter.so`<br><br>，函数首指令处的断点 |
| uprobe 检查 | ① 滤镜类型是 deband；② 选项是 coupling 或 c；③ 值为真（1、on、yes）；④ 输入是色度子采样 |
| 命中  | 四项全中，在 deband 改动前告警；随后调用照常恢复 |
| 后续  | 子采样输入上，下一帧越界 |

```kotlin
/* The format decides: alert only when it is chroma-subsampled. */
if (read_input_format(fctx, &fmt)) {
    vulnerable = fmt_is_vulnerable(fmt);
} else {
    stat_add(GUARD_STAT_ERRORS);
    /* Unknown format: fail per policy (default = treat as vulnerable). */
    vulnerable = guard_config.flags & FLAG_ALERT_ON_UNREADABLE;
    fmt = 0xFFFFFFFF;  /* mark "unknown" in the record */
}
...
if (!vulnerable) {
    stat_add(GUARD_STAT_SPARED);
    record(detail, 0);
    return 0;
}
stat_add(GUARD_STAT_ALERTED);
record(detail, 1);
/* The alert goes to user space; ffmpeg runs on. */
bpf_ringbuf_output(&alerts, detail, sizeof(*detail), 0);
return 0;
```

我们在实验室用未经修改的 FFmpeg 8.0.1 跑这个 Shield，经 Shirudo 的签名 registry 交付。uprobe 挂在库本身，所以既覆盖已在运行的 FFmpeg 进程，也覆盖新进程：加载或移除都不需要重启任何东西。它以检测模式运行：命中的命令告警，ffmpeg 继续跑。

FFmpeg 的结果，按 Shield 状态与命令分：

| Shield | 利用载荷 | 合法载荷 |
| --- | --- | --- |
| 无   | 崩溃，无告警 | 正常运行 |
| 已加载 | 告警，随后崩溃 | 正常运行，无告警 |
| 已撤下 | 崩溃，无告警 | 正常运行 |

退出码 139 是溢出导致的分段错误。检测型 Shield 在它之前告警，但不阻止它。

加载 Shield 时，每个利用载荷都在溢出前告警，合法载荷不告警。撤下 Shield（本身是签名操作）后，告警立刻停止。

## 收尾

漏洞发现、披露和利用最近都被打乱了。漏洞利用防护也会。还会有更多。

## 参考

OpenAI · OpenAI and Cisco introduce Shirudo · November 23, 2026：https://openai.com/index/introducing-shirudo/Isovalent · Cisco and OpenAI introduce Shirudo · November 23, 2026：https://isovalent.com/blog/post/cisco-openai-shirudo/Shirudo · FAQ：https://docs.shirudo.dev/start/faq.htmlCVE Program · CVE-2026-135736 · November 24, 2026：https://www.cve.org/CVERecord?id=CVE-2026-135736FFmpeg · avfilter/vf_deband: reject the coupling command for subsampled formats：https://github.com/FFmpeg/FFmpeg/commit/24ad423d908cd595c983b6c503ddb0ee94901ba2Second Security · The Patchless Window · October 2026：https://thepatchlesswindow.com/CVE Program · CVE-2026-82303 · November 23, 2026：https://www.cve.org/CVERecord?id=CVE-2026-82303elastic/elasticsearch · Bound the LZ4 transport decompressor to the block's compressed length：https://github.com/elastic/elasticsearch/pull/161345Elastic · Security announcement for CVE-2026-82303 · November 23, 2026：https://discuss.elastic.co/t/391840

前沿资讯 · 目录
