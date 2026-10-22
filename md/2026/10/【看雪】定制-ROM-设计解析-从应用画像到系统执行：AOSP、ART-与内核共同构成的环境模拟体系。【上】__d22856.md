---
title: 【看雪】定制 ROM 设计解析 从应用画像到系统执行：AOSP、ART 与内核共同构成的环境模拟体系。【上】
source: https://bbs.kanxue.com/thread-293302.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-23T02:51:01+08:00
trace_id: 10b8cb46-138d-4325-a168-34023a17df92
content_hash: f1ea02d4c73c8f7c598f5d6c467e87fcabaca19311dd9e8017de07429a77782d
status: synced
tags:
  - 看雪
  - Android逆向
  - 设备指纹
series: null
feed_source: 看雪·Android安全
ai_summary: 定制 ROM 以“应用+分身”为配置单位，通过五层协作（Agent、设备中间件、AOSP/Framework、ART/系统运行库、Linux 内核），在保持应用原有调用方式不变的前提下，让同一份代码读到不同的设备环境。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 40175244-d011-816c-9f0b-fd9a79c9cd72
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 定制 ROM 以“应用+分身”为配置单位，通过五层协作（Agent、设备中间件、AOSP/Framework、ART/系统运行库、Linux 内核），在保持应用原有调用方式不变的前提下，让同一份代码读到不同的设备环境。
> 
> - **五层分工：** Agent 负责任务编排与参数设置；中间件把设备画像转成属性快照与配置文件；Framework 在预埋调用点处理系统对象与回调；ART 负责进程内方法替换与属性/Native 适配；内核处理文件打开、元数据、statfs、网络与 proc 输出。
> - **多读取链：** Java 接口、Native 包装层和直接系统调用覆盖范围不同，必须按信息类型分别选择修改层；例如 8 GiB 内存同时由 Framework 的 MemoryInfo 钩子、libc sysinfo 包装和 /proc/meminfo 页换算三处呈现，而原始 sysinfo 仍显示真实 3.57 GiB。
> - **文件覆盖机制：** 把原始绝对路径拼到当前配置空间的覆盖根目录，候选存在则新 fd 指向覆盖文件，否则回落原路径；stat/fstat/statfs 需另行补齐属性与容量，难点在于路径别名（/data/data 与 /data/user/0）、FD 路径缓冲长度、32/64 位 ABI 结构与大容量字段截断（已测 statfs64 可保留超过 2³² 块数）。
> - **身份映射边界：** 内核以真实运行 UID 为起点映射到参数空间，仅选择环境数据，不会改变进程的 Linux 凭据；分身还涉及包管理身份、数据目录与进程启动等独立动作，需跨启动、退出、子进程隔离与分身切换维护状态，并处理 UID 复用、卸载、目录删除导致的缓存与磁盘文件不一致。
> - **接入点协同：** 预埋钩子适合稳定的系统接入点（电话订阅、定位回调、应用启动），ART 方法替换负责运行时扩展，二者需协同初始化；电话、定位、网络画像（IPv4/IPv6、前缀长度、地址结构大小）都要在各入口转换为正确结构，控制接口还应限定调用主体与目标范围。

大家好，新手逆向，改机小白说说最近研究的定制 ROM 设计，也是借鉴了很多大佬的项目和源码！！！

此 ROM 以应用和分身为配置单位，将设备属性、文件视图、资源统计、定位及电话信息组织为独立环境。 Agent 提供操作入口，设备中间件 组织参数，底层执行点分布于 Android Framework、运行时、系统运行 库和 Linux 内核。 自写“ROM 示例应用”实机画面。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e315b7db36ab4268.webp)

## 本文的重点

结合自写应用的配置前后对照，解释功能如何进入系统，以及身份、路径、缓存、ABI 和编译优化为何成为 底层实现的难点。所有应用截图均为自写示例，不展示业务应用、账号、设备序列号或服务端地址。

## 1.让相同代码读到不同环境

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/187e809ab25a7758.webp)

这个对照体现了环境模拟的基本思路：配置改变系统的返回路径，应用保留原有调用方式。8 GiB 是接口呈 现值，不会增加真实物理内存；文件替换的作用范围也由实际打开路径决定。

## 2.五层协作，分工明确

不同层处理不同类型的信息，共同遵循应用身份和配置空间的选择结果

01 Agent：入口与任务编排 选择应用和分身，设置参数，启动、脚本、代理、远程任务等。

02 设备中间件：参数生成与服务 将设备画像转换为属性快照、结构化参数及各类底层配置文件。

03 AOSP / Framework：系统语义 在预埋调用点处理参数、系统对象与回调，承接定位、电话和应用生命周期。

04 ART / 系统运行库：进程内执行 方法入口替换、原方法回调、属性读取与 Native 接口适配。

05 Linux 内核：路径与查询基础 按配置身份参与文件打开、元数据、文件系统统计、网络信息和 proc 输出

## 3.一份环境，需要多条读取链共同表达

Java 接口、Native 包装层和直接系统调用的覆盖范围各不相同。定位“在哪一层改写”，才能决定需要修 改哪些入口、什么时候加载参数，以及如何核对最终结果。

## 4.预埋钩子把功能接进系统

在系统既定调用位置保留扩展入口，再由功能分发器执行参数代理和结果替换

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/136741e6a5c6bb7a.webp)**

**5.钩子的价值：进入对象真正产生的位置**

电话订阅、定位回调、应用启动和内存对象具有不同生命周期。将钩子放进 AOSP 调用链，可以在对象创建、 参数分发或结果返回时接入，使功能实现与对应系统服务保持明确关系。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/23694fd30d83d743.webp)

预埋钩子适合稳定的系统接入点；ART 方法替换服务于运行时扩展。二者分别处理调用位置与方法入口，需要协 同初始化。

按身份选择一套环境 内核以真实运行 UID 为起点，经过映射找到对应参数空间。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/976dc5a74dfbc59c.webp)

映射把“哪个进程正在运行”与“这次使用哪套参数”联系起来。它选择环境数据，本身不会把进程的 Linux 凭据改成配置身份。分身启动链还会组织包管理身份、数据目录与进程启动，这些是相互配合的独立 动作

## 底层难点：不能只处理“启动成功”

配置关联需跨越启动、退出、隔离子进程和分身切换。UID 复用、卸载和目录删除都可能改变状态，因此身份映射、参数缓存和磁盘文件需要分别维护。控制接口还应限定调用主体与目标范围，保证配置能力只作用 于预期应用。

## 6.文件内容可以在打开时替换

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/764d9d984bfd358d.webp)**

**原路径 → 覆盖候选 → 实际文件对象**

底层将原始绝对路径拼接到当前配置空间的覆盖根目录。候选文件存在时，新打开的描述符指向覆盖文件； 没有覆盖时继续原路径。示例中内容由 BASELINE_CONTENT 变为 DEMO_OVERLAY_CONTENT。

## 7.stat 与 statfs 补齐文件画像

内容、文件属性和文件系统容量形成关联，需要在对应查询入口分别表达。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8236c84595fcc738.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/987f3f2f3ccf00cc.webp)

难点一：匹配范围

stat 使用的路径字符串、fstat 还原出的 FD 路径，以及 /data/data 与 /data/user/0 等别名可能不同。 statfs 还包含按原始总块数回退的匹配逻辑，作用范围可能覆盖同一文件系统的其他路径。

难点二：结构与长度边

内核需要正确填写 32 位和 64 位 ABI 的结构；大容量字段尤其要避免截断。已测 statfs64 可保留超过 2³² 的块数，但 FD 路径缓冲长度会影响匹配。缓存命中、路径长度和错误返回都应进入兼容性检查。

## 8.同一个 RAM 参数，多个接入点

Java 对象、libc 包装和内核 proc 输出分别参与内存信息呈现。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b02cf2b4d0e322f7.webp)

三个 8 GiB 来自不同执行层

ActivityManager 的 MemoryInfo 由 Framework 钩子改写；libc sysinfo 在包装层使用内存参数； /proc/meminfo 由内核按页换算后输出。示例保留原始 sysinfo 系统调用作为对照，因此同时显示真实总 量 3.57 GiB。

## 9.网络画像与数据路径分别控制

网卡枚举、本地地址查询、DNS 参数和代理转发承担不同职责。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7b372b2a7e7bf5bf.webp)

此 ROM 在部分网络查询路径中按配置返回地址信息。网卡枚举与 socket 查询需要分别适配，尤其是 IPv4、 IPv6、前缀长度以及地址结构大小。相同网络画像必须在各入口中转换为正确结构。

## 10.proc 输出与运行时状态协作

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dd3c8fe49e84d3af.webp)**

ART 方法替换需要跳转包装等可执行代码区域。映射本身、映射权限和诊断接口展示属于不同环节。

## 11.方法入口替换与原方法回调

ART 承接动态方法替换，使模块可以在原有调用路径上加入自己的逻辑。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/620dbae195a4300c.webp)

## 12.一套应用，多套保存环境

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dce8d7f138ae9cde.webp)**

## 13.坐标、Provider 与回调共同构成位置

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eafb004d3eeedb68.webp)

系统钩子组织位置对象，并对 network、passive、gps 等路径分别处理。

## 14.围绕应用可见的电话对象模拟

运营商、订阅、卡状态、信号和基站信息构成互相关联的电话环境。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6d6fc67d61edfb42.webp)

实现思路：让字段进入对应对象与事件。通过电话与订阅相关钩子处理对象和返回值，并结合位置及运营商信息组织部分小区参数。对象型 接口与简单字符串接口需要分别适配，监听回调还涉及系统注册过程和不同事件掩码。
