---
title: 【先知】【Web安全】GWT-RPC 逆向实战：混淆调用还原与请求重构
source: https://xz.aliyun.com/news/92816
source_host: xz.aliyun.com
clip_date: 2026-09-11T21:06:06+08:00
trace_id: 5d5240b2-1db8-4f2f-a86c-d14054a596b6
content_hash: b8fa37f4c8b6a5d7af0b36b06353562c9af2e5535290001a6ebbc4c1fe5a0902
status: synced
tags:
  - 先知
  - 协议分析
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: GWT-RPC 请求虽可抓包却难改，需从混淆 permutation 恢复 RPC Schema，再用 Shadow Request 中间层稳定重写报文，最终暴露方法级授权缺失与序列化策略回退两个真实服务端边界。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3d875244-d011-81ae-a157-d2bd231ac2d6
ioc:
  cves: []
  cwes: []
  hashes:
    - 5673ee239e1cae627b9a203c33398a18
    - f26cd9c9a49c19836f75f29e33f2593b
    - fbfa1ff64570a7ad8b98c8ae569b08ed
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GWT-RPC 请求虽可抓包却难改，需从混淆 permutation 恢复 RPC Schema，再用 Shadow Request 中间层稳定重写报文，最终暴露方法级授权缺失与序列化策略回退两个真实服务端边界。
> 
> - **报文结构：** 请求体由 `|` 分隔，依次为协议版本、flags、字符串表长度、字符串表、baseUrl/strongName/服务名/方法名的索引、参数数量、全部类型索引、全部值索引；索引从 1 开始且类型与值分开排列，改动值或类型都需重算字符串表、去重与索引。
> - **工具失效原因：** GWTMap 在 GWT 2.10.0 样本上识别不出服务和方法的根因是 `extract_method_signature()` 依赖固定行偏移、`find_value()` 只做单行单次回溯，而实际方法名经 `d.b → this.b → 'login'` 多级间接引用。
> - **Schema 恢复方法：** 以 RPC 组包调用为 sink，顺实参追服务字面量、方法字段、类型变量和参数数量；再用改类型签名、改方法名、改服务接口触发的服务端报错反向校验，形成静态加动态双证据。
> - **请求重构：** 用 Shadow Request JSON 承载参数，Inlet 解析、Egress 回写；字符串表按值去重（同值、值撞方法名/签名/baseUrl 均复用索引），需处理 `|` 与反斜杠转义，round-trip 基线须完全一致才能做后续 fuzz。
> - **两个真实边界：** 前端无入口的 `AdminService` 仍可达，说明需方法级授权；strongName 指向的策略文件不存在时服务端未 fail-close，而是回退 `LegacySerializationPolicy` 继续解码（Legacy 仍有 `IsSerializable` 等约束，不单独构成 RCE）。

> **本文内容仅供技术学习与交流使用，严禁用于任何非法用途。请遵守《中华人民共和国网络安全法》等相关法律法规，因违规使用产生的一切后果，由使用者自行承担，与作者无关。**

## 引言

在实际渗透测试里，偶尔会碰到一种比较难受的情况：请求明明已经抓到了，但真正开始改包时，才发现它并不好下手。

GWT-RPC 就是一个比较典型的例子。浏览器发出的 HTTP 并没有加密，代理里也能看到完整请求体，但它不像常见的 JSON 接口那样直观。服务名、方法名、类型签名、字符串表和参数值都被组织在一串 `|` 分隔的 token 里，很多字段之间还通过索引互相引用。只改一个现有字符串通常问题不大，但一旦涉及新增值、替换方法或修改类型，字符串表长度、去重结果和后续索引都可能跟着变化。

我一开始只是想解决一个很实际的问题：怎么把这类请求变成一个可以稳定修改、反复测试的格式。等请求重构跑通以后，问题自然又往前走了一步——既然前端调用的语义可以恢复出来，那么那些页面上没有按钮、也没有直接入口的 RPC 方法，是不是真的就无法访问？

## 一、GWT-RPC 请求解析

### 1.1 GWT-RPC 报文结构

实验里的登录请求如下：

```http
POST /gwtlab/auth HTTP/1.1
Host: 127.0.0.1:8088
Content-Type: text/x-gwt-rpc; charset=utf-8
X-GWT-Permutation: F26CD9C9A49C19836F75F29E33F2593B
X-GWT-Module-Base: http://127.0.0.1:8088/gwtlab/

7|0|7|http://127.0.0.1:8088/gwtlab/|FBFA1FF64570A7AD8B98C8AE569B08ED|com.example.client.AuthenticationService|login|java.lang.String/2004016611|admin|password|1|2|3|4|2|5|5|6|7|
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/12d6ffa0c340a129.png)

这一串内容可以先拆成三部分：

|     |     |     |
| --- | --- | --- |  
| 位置  | 内容  | 含义  |
| 1   | `7` | RPC 协议版本 |
| 2   | `0` | flags |
| 3   | `7` | 字符串表长度 |
| 4-10 | URL、strongName、服务名、方法名、类型签名、参数值 | 字符串表 |
| 11-14 | \`1 | 2   |
| 15  | `2` | 参数数量 |
| 16-17 | \`5 | 5\` |
| 18-19 | \`6 | 7\` |

容易看错的是最后几组数字。它们不是参数值，而是从 1 开始的字符串表索引；类型索引和值索引也不是交错排列，而是先写完全部类型，再写全部值。

所以只把 `admin` 改成 `testuser` 还比较简单。如果新值和已有字符串发生去重、参数类型发生变化，或者方法名被替换，字符串表长度和后续索引都要重新计算。很多看起来像“服务端拒绝”的异常，实际只是请求本身已经被手工改坏了。

到这里可以确定，第一个问题并不是 payload 怎么写，而是必须先保证请求本身能够被正确解析和重建。但仅仅知道字符串表和索引还不够。如果后面要替换方法、修改参数类型，甚至构造一条前端没有直接发出的 RPC 调用，还需要知道当前请求对应的服务、方法和参数签名。这些信息最终都要回到浏览器实际加载的 GWT 编译产物里去找。

### 1.2 实验环境与验证流程

本文使用 GWT 2.10.0 和 Jetty，本地服务监听 `127.0.0.1:8088` 。编译完成后保留 permutation 缓存文件和 `.gwt.rpc` 策略文件，后续分析均以浏览器实际加载的 permutation 为准，避免混入其他编译产物造成判断偏差。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d192bc25e2ad7683.png)

整个验证过程按四个阶段展开：先确认 GWT-RPC 请求的基本结构，再从 permutation 中定位仍然保留的 RPC 信息；随后恢复服务名、方法名和参数类型，并完成请求解析与重构；最后再把重构后的请求发回服务端，观察真实的方法调用和策略校验结果。

这样安排的原因很直接：如果前面的请求解析和回写还不稳定，后面即使出现 `500` 、方法匹配失败或异常响应，也很难判断问题究竟来自业务逻辑、协议编码，还是字符串表和索引错位。

因此，后面的分析实际上分成两条线：一条解决“这条调用到底是什么”，也就是从 permutation 中恢复 RPC Schema；另一条解决“这条请求怎么稳定修改”，也就是重新处理字符串表、索引和转义。在开始重构请求之前，先看第一个问题：GWT 编译并混淆以后，这些 RPC 调用信息还剩多少。

### 1.3 混淆代码中的 RPC 语义保留

GWT 会把 Java 编译成浏览器执行的 JavaScript。函数名和局部变量名可以被压得很短，但 RPC 运行时仍然需要服务接口、方法名和 Java 类型信息。这些内容可能被放进短变量或对象字段，却不会因为标识符混淆就消失。

编译前的一次登录调用大致是这样：

```javascript
function $login_0(this$static, username, password, callback) {
    var helper, streamWriter;
    helper = new RemoteServiceProxy$ServiceHelper(
        this$static, 'AuthenticationService_Proxy', 'login');
    try {
        streamWriter = $start(
            helper, 'com.example.client.AuthenticationService', 2);
        $append(streamWriter,
            '' + $addString(streamWriter, 'java.lang.String/2004016611'));
        $append(streamWriter,
            '' + $addString(streamWriter, 'java.lang.String/2004016611'));
        $append(streamWriter, '' + $addString(streamWriter, username));
        $append(streamWriter, '' + $addString(streamWriter, password));
        $finish_0(helper, callback, ...);
    } catch ($e0) { ... }
}
```

混淆以后会变成类似下面的形式：

```javascript
function Cd(b,c,d,e){
    var f,g;
    f=new yu(b,iH,'login');
    try{
        g=xu(f,jH,2);
        nu(g,''+cu(g,cH));
        nu(g,''+cu(g,cH));
        nu(g,''+cu(g,c));
        nu(g,''+cu(g,d));
        wu(f,e,(Nu(),Ju))
    }
    catch(a){
        a=Xq(a);
        if(!bl(a,12))throw Yq(a)
    }
}
```

单看 `cu(g,cH)` 很难知道它到底是类型签名还是普通字符串，但在完整 permutation 里继续查，可以看到服务名、方法名和 Java 类型签名仍然存在。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/18651d8ae399ff9b.png)

这里得到的结论不是“GWT 混淆很弱”，而是更具体的一点： **标识符被压缩以后，阅读路径变了，但完成 RPC 组包所需的协议语义仍然要在运行时存在。**

既然这些信息还在，接下来的问题就是能不能自动把它们提取出来。相比手工在大段 permutation 里追短变量，优先尝试现有工具更合理。我首先测试了 GWTMap，但显然--它给出的结果和前面的字符串搜索并不一致。

## 二、GWTMap 解析失效分析

### 2.1 GWTMap 识别结果

GWT-RPC 相关工具并不少，但它们解决的问题不完全一样：

|     |     |     |
| --- | --- | --- |  
| 工具  | 主要能力 | 本次复现中的限制 |
| GDS GWTEnum/GWTParse/GWTFuzzer | 枚举方法、解析参数、结合 Burp 变异 | 更偏早期 GWT 输出，对当前 `*.cache.js` 布局支持有限 |
| Gwt.py | 枚举方法并生成 RPC payload | 依赖非混淆代码，服务路径关系也需要额外补齐 |
| GWTab | 在已有请求中高亮参数 | 适合修改已知请求，不能解决未知方法枚举 |
| GWTMap | 解析混淆 permutation 并生成 RPC 请求 | 当前 GWT 2.10.0 样本中没有识别出服务和方法 |

GWTMap 对当前样本的输出是：

```plain
[+] Services Found
====================
No services were identified!

[+] Methods Found
====================
No methods were identified!
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/068515f05be4f24f.png)

但前面已经确认，服务名、方法名和类型签名确实还在 permutation 中。所以“工具没识别出来”和“前端没有 RPC 信息”是两回事。

### 2.2 GWTMap 解析机制与失效原因

继续看 GWTMap 的源码，它的流程大致是：

```plain
压缩 JS
  → clean_code() 重排代码
  → 逐行正则匹配
  → find_value() 回溯变量
  → 生成服务和方法对象
```

几个关键点比较明显。

`extract_method_signature()` 会依赖固定行偏移，先 `line += 5` 跳到预期位置，再找 `catch(`，最后按 `(offset - 2) / 2` 推算参数数量。代码布局、换行和异常处理结构一变，参数边界就可能偏掉。

源码位置：

-   [extract_method_signature()](https://github.com/FSecureLABS/GWTMap/blob/master/gwtmap.py#L539-L564)
-   [extract_method_info()](https://github.com/FSecureLABS/GWTMap/blob/master/gwtmap.py#L580-L627)
-   [find_value()](https://github.com/FSecureLABS/GWTMap/blob/master/gwtmap.py#L314-L324)

更关键的是 `find_value()` 。它只做一次、单行、首个命中的赋值查找，而当前样本里的方法名存在这种间接关系：

```plain
d.b → this.b → 'login'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d347672f5894a465.png)

所以问题不是“给 GWTMap 再补一条 regex”就能解决。它把固定代码布局、固定调用位置和单层变量回溯当成了输入前提，而 GWT 2.10.0 的当前输出把这些关系拆到了对象字段、全局变量和调用点里。

问题定位到这里，处理思路也就比较明确了：RPC 信息并没有消失，只是原来的工具没有能力重新建立这些跨变量、跨字段的关系。与其继续修补表面正则，不如直接从 RPC 组包调用出发，沿实参和赋值关系反向追数据流。

## 三、混淆调用链与 RPC Schema 恢复

### 3.1 调用参数数据流分析

先把同一次 RPC 调用相关的片段放到一起，可以看到下面这组关系：

```plain
// 类型签名
To = 'java.lang.String/2004016611';

// 方法代理对象
function zi(a) {
    this.a = 'AuthenticationService_Proxy.login';
    this.b = 'login';
}

// RPC 组包调用
function F() {
    ki(d.d, 'com.example.client.AuthenticationService');
    ki(d.d, d.b);
    ui(d.d.a, '2');
    qi(f, ji(f, To));
    qi(f, ji(f, To));
}
```

这里没必要先给 `ki` 、 `ui` 、 `ji` 这些短函数重新命名。对恢复当前调用来说，更直接的做法是顺着实参关系看：

1.  `ki(d.d, 'com.example.client.AuthenticationService')` 给出服务接口。
2.  `ki(d.d, d.b)` 继续追 `d.b` ，在代理对象初始化位置落到 `this.b = 'login'` 。
3.  `To` 保存 `java.lang.String/2004016611` ，并被写入两次。
4.  `ui(d.d.a, '2')` 给出参数数量。

恢复出的最小 Schema 是：

```plain
service:    com.example.client.AuthenticationService
method:     login
param 0:    java.lang.String/2004016611
param 1:    java.lang.String/2004016611
count:      2
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a739c0632792eae0.png)

这套恢复过程可以概括成一个很小的逆向流程：先找 RPC 组包调用作为 sink，再分别追服务字面量、方法字段、类型变量和参数数量。它不要求先知道每个短函数的原始名字，重点是把一次调用的语义重新拼完整。

不过，静态恢复出来的 Schema 还需要再确认一次。混淆代码里的字符串和调用关系只能说明“推断结果合理”，要证明这些字段真的参与了服务端的方法匹配，还需要一个动态反馈。

### 3.2 服务端反馈校验

这里保持服务和方法不变，只修改第一个参数的类型签名，观察服务端实际如何匹配方法。

把第一个参数从：

```plain
java.lang.String/2004016611
```

改成：

```plain
java.lang.Integer/3438268394
```

服务端会按新的签名寻找方法：

```plain
Could not locate requested method 'login(java.lang.Integer, java.lang.String)'
in interface 'com.example.client.AuthenticationService'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2a9e7d1aa5b0fda2.png)

同样，把方法改成 `logout` ，错误里会出现 `logout(String, String)` ；把服务接口换成 `AdminService` ，服务端会提示该接口没有由当前 servlet 对应的实现类实现。

这些异常本身不是漏洞，但能反过来验证三件事：方法名是否真正进入服务端匹配、参数类型是否进入方法签名、服务接口是否落到了正确的实现类。这样恢复结果就不只是“看着像”，而是有静态和动态两条证据链。

### 3.3 Schema 恢复边界

这里恢复的是当前 permutation、当前调用里的最小 Schema，不是一个“任何 GWT 文件都能自动还原”的结论。

如果输入里只有方法定义，没有服务调用；或者 deferred fragment 没有合并；又或者调用点被截断，那么最多只能拿到部分字段。遇到这种情况，结果应该标记成不完整，而不是硬拼一个 RPC 请求。

到这里已经解决了“这条 RPC 调用是什么”的问题，但最开始那个“请求不好改”的问题其实还没有解决。即使已经知道 `AuthenticationService.login(String,String)` ，原始管道报文仍然受字符串表、索引和转义规则约束，直接在 Repeater 里维护并不可靠。

所以下一步不再继续分析 JavaScript，而是回到最初那条 HTTP 请求：把已经恢复出的 Schema 放进一个稳定的中间表示，再由编码层负责重新生成合法的 GWT-RPC。

## 四、GWT-RPC 请求中间表示与重构

### 4.1 Shadow Request 中间表示设计

直接在 Burp Repeater 里维护 GWT-RPC，主要有三个麻烦：

-   参数值通过字符串表索引间接引用；
-   字符串表要去重，新值可能复用已有索引；
-   `|` 和反斜杠需要按 GWT-RPC 规则转义。

手工修改一次可以，连续 fuzz 很快就会变得不可靠。所以我没有继续在原始报文上做字符串替换，而是在中间加了一层 Shadow Request。

原始请求：

```plain
7|0|7|...|AuthenticationService|login|java.lang.String/2004016611|admin|password|1|2|3|4|2|5|5|6|7|
```

先转成可读 JSON：

```json
{
  "version": 7,
  "flags": 0,
  "baseUrl": "http://127.0.0.1:8088/gwtlab/",
  "strongName": "FBFA1FF64570A7AD8B98C8AE569B08ED",
  "service": "com.example.client.AuthenticationService",
  "method": "login",
  "params": [
    {
      "type": "java.lang.String",
      "signature": "java.lang.String/2004016611",
      "value": "admin"
    },
    {
      "type": "java.lang.String",
      "signature": "java.lang.String/2004016611",
      "value": "password"
    }
  ]
}
```

普通参数变异只改 `params[].value` 。字符串表、去重、索引和转义都不再由人维护。

有了这层中间表示以后，问题就被拆开了：Inlet 只负责把原始 GWT-RPC 解析成 Shadow Request，Egress 只负责把修改后的 Shadow Request 重新编码成合法报文。业务参数的修改不再和协议细节混在一起。

### 4.2 Inlet/Egress 编解码流程

整个流程如下：

```plain
浏览器原始 GWT-RPC
        ↓
Inlet：管道报文 → JSON Shadow Request
        ↓
人工 / Burp / Fuzzer 修改 params[].value
        ↓
Egress：JSON → 合法 GWT-RPC
        ↓
重新计算字符串表、索引和转义
        ↓
发送服务端
```

我用 Yakit Codec 实现这层转换。第一次执行 Codec 时把完整 HTTP 包里的 GWT-RPC body 解析成 JSON；改完参数后再执行一次，重新编译成 `text/x-gwt-rpc` 请求。 `Content-Length` 交给 Yakit 重新计算。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6c80e23ba4313bc3.png)

当前原型明确限制在本文实际验证过的类型范围：String、用于方法/类型探测的 Integer/Boolean/Gadget，以及靶机中的 `Task` 对象。它不是一个完整的 GWT-RPC 通用序列化库，数组和其他复杂对象仍需要按各自规则扩展。

Inlet 相对直接，真正容易出错的是 Egress。因为一旦 JSON 中的值发生变化，字符串表是否需要新增条目、是否可以复用旧索引、转义后长度是否变化，都要重新计算。

### 4.3 字符串表去重与索引重算

回写时不能直接把 JSON 字段按顺序拼回去，而是要重新建立字符串表。

例如两个参数的类型都是：

```plain
java.lang.String/2004016611
```

字符串表只保留一份，两个类型索引都指向同一项。如果参数值正好等于方法名 `login` ，也应该复用方法名已有的索引，而不是再追加一个重复字符串。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/502e2160ffc02824.png)

我用下面几个边界用例检查这部分：

|     |     |     |
| --- | --- | --- |  
| 用例  | 场景  | 结果  |
| same-value | 两参数值均为 `admin` | 去重为 1 项 |
| value-collides-method | 值为 `login` | 复用 method 索引 |
| value-collides-sig | 值等于类型签名 | 复用 signature 索引 |
| value-collides-baseurl | 值等于 baseUrl | 复用 baseUrl 索引 |
| triple-same-value | 三个参数同值 | 只保留 1 项 |
| empty-string | 空字符串 | 正常处理 |
| pipe-in-value | 值为 \`a | b\` |

这些边界用例只能说明编码器在局部规则上没有明显问题，还不能证明一条完整请求经过“解析 → 修改 → 回写”后仍然能被服务端正常接受。最后还需要做一次真正的 round-trip。

### 4.4 Round-trip 保真验证

先从不修改任何业务字段的基线请求开始：

```plain
原始报文:  7|0|7|...|admin|password|...|5|5|6|7|
回写报文:  7|0|7|...|admin|password|...|5|5|6|7|
匹配: True
```

之后只把用户名从 `admin` 改成 `testuser` ：

```json
"params": [
  {
    "type": "java.lang.String",
    "signature": "java.lang.String/2004016611",
    "value": "testuser"
  },
  {
    "type": "java.lang.String",
    "signature": "java.lang.String/2004016611",
    "value": "password"
  }
]
```

Egress 重新生成：

```plain
7|0|7|http://127.0.0.1:8088/gwtlab/|FBFA1FF64570A7AD8B98C8AE569B08ED|com.example.client.AuthenticationService|login|java.lang.String/2004016611|testuser|password|1|2|3|4|2|5|5|6|7|
```

原始和变异请求都返回 HTTP 200，区别只在业务结果：

```plain
原始: //OK[1,["OK: logged in as admin"],0,7]
变异: //OK[1,["FAIL: invalid credentials"],0,7]
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6388e2ab49f830f4.png)

到这里能证明的只有两件事：协议回写是正确的，参数变异确实到达了业务方法。它并不能证明登录接口有注入或越权。后面真正值得看的，是前端之外的 RPC 服务边界。

## 五、服务端调用边界与序列化策略

到这里，协议层的问题基本解决了：已知 Schema 可以稳定重构成合法请求，参数修改也能够真实到达业务方法。接下来才适合把测试重点从“请求能不能发出去”转到“服务端到底允许调用什么”。

### 5.1 隐藏服务方法调用

实验靶机里额外实现了一个 `AdminService` 。前端 EntryPoint 没有调用它，页面上也没有管理入口，但 servlet 仍然注册在 `/gwtlab/admin` 。

核心实现可以简化成：

```java
public class AdminServiceImpl extends RemoteServiceServlet
        implements AdminService {

    public String runCommand(String command) throws Exception {
        Runtime.getRuntime().exec(command);
        return "executed: " + command;
    }

    public String processTask(Task task) throws Exception {
        if ("system".equals(task.getName())) {
            return runCommand(task.getCommand());
        }
        return "ignored";
    }
}
```

对应部署映射：

```xml
<servlet>
    <servlet-name>adminService</servlet-name>
    <servlet-class>com.example.server.AdminServiceImpl</servlet-class>
</servlet>
<servlet-mapping>
    <servlet-name>adminService</servlet-name>
    <url-pattern>/gwtlab/admin</url-pattern>
</servlet-mapping>
```

从新的 permutation 中恢复 `AdminService` 的 Schema 后，构造 Shadow Request：

```json
{
  "version": 7,
  "flags": 0,
  "baseUrl": "http://127.0.0.1:8088/gwtlab/",
  "strongName": "5673EE239E1CAE627B9A203C33398A18",
  "service": "com.example.client.AdminService",
  "method": "runCommand",
  "params": [
    {
      "type": "java.lang.String",
      "signature": "java.lang.String/2004016611",
      "value": "open -a Calculator"
    }
  ]
}
```

Egress 生成：

```plain
7|0|6|http://127.0.0.1:8088/gwtlab/|5673EE239E1CAE627B9A203C33398A18|com.example.client.AdminService|runCommand|java.lang.String/2004016611|open -a Calculator|1|2|3|4|1|5|6|
```

发送到 `/gwtlab/admin` 后返回：

```plain
//OK[1,["executed: open -a Calculator"],0,7]
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4fd208b613bcbd68.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f0962670669f0633.png)

这里的重点不是“GWT-RPC 自带 RCE”。 `runCommand()` 本身就是靶机里人为放置的危险方法。这个实验真正验证的是： **前端没有 UI 入口，并不等于服务端方法不可达。只要 RPC Schema、端点和参数签名已知，最终边界仍然是服务端的方法授权。**

不过，方法可达并不意味着客户端可以随意构造任意参数。GWT-RPC 在真正进入业务方法之前，还要根据请求中的类型签名完成方法匹配和参数反序列化。既然现在 Schema 可以主动修改，下一步正好可以观察服务端对这些类型信息的校验发生在哪一层。

### 5.2 类型签名校验与错误反馈

这里不再只改参数值，而是直接修改类型签名和调用元数据，观察服务端在不同阶段如何拒绝请求：

|     |     |     |
| --- | --- | --- |  
| 篡改内容 | HTTP 状态 | server.log |
| `java.lang.Integer/3438268394` | 500 | `Could not locate requested method 'login(java.lang.Integer, java.lang.String)'` |
| `java.lang.Boolean/476441737` | 500 | `Could not locate requested method 'login(java.lang.Boolean, java.lang.String)'` |
| `com.evil.Gadget/1234567890` | 500 | `Parameter 0 is of an unknown type 'com.evil.Gadget'` |
| method → `logout` | 500 | `Could not locate requested method 'logout(String,String)'` |
| service → `AdminService` | 500 | `not implemented by 'AuthenticationServiceImpl'` |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a9bcaf42655521f5.png)

服务端确实会校验类型，但错误信息同时也会回显方法签名、接口名和实现类。对授权测试来说，这些信息可以拿来校准前面恢复的 Schema；它是反馈信号，不是权限控制。

复杂对象还有一个更容易踩坑的点。 `processTask(Task task)` 里的 `Task` 在 Java 源码中可能先声明 `name` 、再声明 `command` ，但 GWT-RPC 序列化时不能直接假设按源码声明顺序写字段。

追到 GWT 2.10.0 的实现：

-   [SerializabilityUtil.java FIELD_COMPARATOR](https://github.com/gwtproject/gwt/blob/2.10.0/user/src/com/google/gwt/user/server/rpc/impl/SerializabilityUtil.java#L54-L59)
-   [SerializabilityUtil.java 字段获取与排序](https://github.com/gwtproject/gwt/blob/2.10.0/user/src/com/google/gwt/user/server/rpc/impl/SerializabilityUtil.java#L188-L206)
-   [ServerSerializationStreamReader.java 字段读取](https://github.com/gwtproject/gwt/blob/2.10.0/user/src/com/google/gwt/user/server/rpc/impl/ServerSerializationStreamReader.java#L824-L858)

`getDeclaredFields()` 的返回顺序本身不应作为跨 JVM 的稳定协议依据，所以 GWT 会对字段做显式排序。当前 `Task` 中， `command` 按字母序排在 `name` 前面，因此 payload 也要先写 `command` 的值。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/92ddade0b5074b5b.png)

构造后的对象参数请求：

```plain
7|0|7|http://127.0.0.1:8088/gwtlab/|5673EE239E1CAE627B9A203C33398A18|com.example.client.AdminService|processTask|com.example.shared.Task/62376796|open -a Calculator|system|1|2|3|4|1|5|5|6|7|
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8cee5f2cc89b1f3e.png)

服务端返回：

```plain
//OK[1,["executed: open -a Calculator"],0,7]
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9205236aac958d1b.png)

这个实验验证的是当前 `Task` 对象的字段编码和业务调用路径，不应扩展成“任意对象都可以反序列化利用”。

到这里可以看到，错误类型并不是完全不受约束，服务端确实存在方法匹配和类型解析边界。继续往下追，这些类型限制最终又会落到当前 permutation 对应的 serialization policy 上。于是还剩一个关键问题：如果请求里的 `strongName` 找不到对应策略文件，服务端会直接拒绝，还是会走其他分支继续处理？

### 5.3 strongName 校验与序列化策略回退

`strongName` 用于定位当前 permutation 对应的 `.gwt.rpc` 序列化策略文件，本身不是身份凭证。

在当前靶机配置下，测试结果如下：

|     |     |     |
| --- | --- | --- |  
| 场景  | strongName | 服务端行为 |
| 正确策略 | `5673EE23...3A18` | 接受并执行 |
| 旧策略 | `FBFA1FF6...08ED` | 接受并执行 |
| 无对应策略文件 | `00000000...0000` | 接受并继续处理 |

策略文件不存在时，请求没有直接被拒绝。沿 GWT 2.10.0 源码往下看，调用链可以简化成：

```plain
HTTP 请求
  → AbstractRemoteServiceServlet.doPost()
    → RemoteServiceServlet.processPost()
      → RemoteServiceServlet.processCall(payload)
        → checkPermutationStrongName()
        → RPC.decodeRequest(...)
          → ServerSerializationStreamReader.prepareToRead()
            → 读取 strongName
            → getSerializationPolicy()
              → loadSerializationPolicy()
                → getResourceAsStream(path)
              → policy == null
              → getDefaultSerializationPolicy()
                → LegacySerializationPolicy
```

第一处 `checkPermutationStrongName()` 主要检查请求头里是否存在 permutation strongName，并不证明对应策略文件真实存在：

-   [RemoteServiceServlet.java#L395-L400](https://github.com/gwtproject/gwt/blob/2.10.0/user/src/com/google/gwt/user/server/rpc/RemoteServiceServlet.java#L395-L400)

策略文件加载失败时， `loadSerializationPolicy()` 返回 `null` ：

-   [RemoteServiceServlet.java#L86-L121](https://github.com/gwtproject/gwt/blob/2.10.0/user/src/com/google/gwt/user/server/rpc/RemoteServiceServlet.java#L86-L121)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e2af4f0b6f534ca4.png)

之后 `getSerializationPolicy()` 会继续取默认策略：

-   [RemoteServiceServlet.java#L245-L253](https://github.com/gwtproject/gwt/blob/2.10.0/user/src/com/google/gwt/user/server/rpc/RemoteServiceServlet.java#L245-L253)
-   [RPC.java#L505-L507](https://github.com/gwtproject/gwt/blob/2.10.0/user/src/com/google/gwt/user/server/rpc/RPC.java#L505-L507)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/35843580e8b10992.png)

这里更准确的说法不是“strongName 被绕过了鉴权”，而是： **当前配置下，策略文件缺失之后没有 fail-close，而是回退到** `LegacySerializationPolicy` **继续解码。**

`StandardSerializationPolicy` 和 `LegacySerializationPolicy` 也不是“校验”和“完全不校验”的区别。前者会使用当前策略文件里的逐类型白名单；Legacy 模式仍有可实例化、 `IsSerializable` 、自定义序列化器等约束，只是不再使用当前 permutation 对应的那份逐类型白名单。

所以这条链不能单独推出 RCE。是否能继续形成实际利用，还取决于服务端有哪些可达方法、有哪些可实例化类型，以及业务代码最终把这些对象送到哪里。

本文靶机之所以能看到命令执行，是因为 `AdminService` 本身存在一个直接调用 `Runtime.getRuntime().exec()` 的危险方法。授权缺失和策略回退是两条不同的安全边界，不能合并成一个笼统的“GWT-RPC 漏洞”。

分析到这里，问题已经可以明确拆成两个位置：一是 RPC 方法调用前有没有做真正的权限判断；二是 serialization policy 加载失败时有没有及时终止请求。后面的修复和复测也应该分别围绕这两个边界展开，而不是只看前端入口是否消失，或者异常请求最终有没有返回 `500` 。

## 六、修复验证

### 6.1 方法级授权验证

页面上删掉管理按钮没有意义。只要 servlet 端点还在，普通身份就可能直接构造 RPC 请求。

修复后至少验证三件事：普通身份发送已知管理方法请求时被拒绝；拒绝发生在进入 `Runtime.getRuntime().exec()` 之前；服务端日志记录的是授权失败，而不是方法已经执行后再隐藏响应。

方法授权解决的是“谁可以调用”，另一条线还需要确认“策略文件失效时请求会不会继续被反序列化”。

### 6.2 序列化策略加载失败验证

`strongName` 对应的策略文件不存在、读取失败或解析失败时，请求应该在反序列化之前结束，不能继续回退到默认 Legacy 策略。

复测至少包括：有效 strongName 的正常请求仍然可用；全零或不存在的 strongName 被明确拒绝；日志能区分“策略不存在”和“业务方法异常”；失败请求没有进入对象实例化和方法调用。

把这两条修复线放到一起，最终可以收敛成三个检查位置。

### 6.3 修复复测标准

|     |     |     |
| --- | --- | --- |  
| 检查位置 | 需要验证的内容 | 预期结果 |
| 方法调用前 | 当前身份是否有权调用管理服务和管理方法 | 无权请求直接拒绝 |
| 反序列化前 | strongName 是否能定位到当前模块的真实策略文件 | 不存在时拒绝，不回退 |
| 类型解析时 | 请求类型是否在业务真正需要的范围内 | 未登记类型在实例化前拒绝 |

修复验证最好同时保存请求、响应和服务端日志。只看浏览器有没有弹错，无法确认请求究竟在哪一层被挡住。

## 七、总结

这次复现最开始只是为了把一条难改的 GWT-RPC 请求变得可维护。真正往下做以后才发现，请求重构只是中间步骤，前面还要先解决调用语义，后面才能继续看服务端边界。

GWT 的混淆会压缩函数名和变量名，但 RPC 组包需要的服务、方法和类型信息仍然存在。GWTMap 在当前样本上没有恢复出这些内容，原因也不在于“信息被彻底混淆掉了”，而是它依赖固定代码布局和单层变量回溯。沿调用点、对象字段和变量赋值重新追数据流后，当前调用需要的 Schema 仍然能够恢复出来。

Schema 恢复以后，原始管道报文的字符串表、索引和转义又成了新的限制，所以我把它转换成 Shadow Request，再由 Inlet/Egress 负责协议层回写。只有 round-trip 能稳定通过，后面的异常响应、方法匹配和类型校验才有分析价值。

最后真正暴露出来的并不是一个笼统的“GWT-RPC 漏洞”，而是两个更具体的服务端问题：前端没有入口的 RPC 方法仍然需要方法级授权；serialization policy 加载失败时也应该明确 fail-close，而不是依赖默认回退继续处理请求。

这也是这次复现里最有价值的一点：先把协议噪声处理掉，再看服务端到底信任了什么。请求一旦能够稳定重建，原本藏在复杂编码后面的授权和反序列化边界就会清楚很多。

## 附录：Yakit Codec 实现（gwt_rpc_shadow.yak）

下面是本文实验使用的完整 Yakit Codec。当前实现按本文样本支持 String、Integer/Boolean/Gadget 探测类型以及 `com.example.shared.Task` ，其他复杂对象需要继续扩展编码规则。

```python
/*
GWT-RPC Shadow Request for Yakit

第一次执行：
原始 GWT-RPC 请求 -> JSON 影子请求

第二次执行：
JSON 影子请求 -> GWT-RPC 请求

当前处理：
1. String 参数
2. Integer、Gadget 类型探测
3. com.example.shared.Task 对象
*/

gwtEscape = func(s) {
    // 管道符是 GWT-RPC 的分隔符，需要转义成 \!
    // 反斜杠需要先处理，避免后续解析产生歧义。
    s = str.ReplaceAll(s, "\\", "\\\\")
    return str.ReplaceAll(s, "|", "\\!")
}

gwtUnescape = func(s) {
    // 将字符串表中的转义内容还原成原始值。
    result = ""
    pos = 0

    for pos < len(s) {
        if s[pos] == "\\" && pos+1 < len(s) {
            if s[pos+1] == "!" {
                result = result + "|"
                pos = pos + 2
                continue
            }

            if s[pos+1] == "\\" {
                result = result + "\\"
                pos = pos + 2
                continue
            }
        }

        result = result + s[pos]
        pos++
    }

    return result
}

isStringSignature = func(signature) {
    return str.HasPrefix(signature, "java.lang.String/")
}

isTaskSignature = func(signature) {
    // 识别 Task 对象，后面按 command、name 两个字段读取。
    return str.HasPrefix(signature, "com.example.shared.Task/")
}

isProbeSignature = func(signature) {
    // 这些类型用于观察服务端的方法匹配和类型解析结果。
    return str.HasPrefix(signature, "java.lang.Integer/") ||
        str.HasPrefix(signature, "java.lang.Boolean/") ||
        str.HasPrefix(signature, "com.evil.Gadget/")
}

isSupportedSignature = func(signature) {
    return isStringSignature(signature) ||
        isTaskSignature(signature) ||
        isProbeSignature(signature)
}

typeName = func(signature) {
    parts = str.Split(signature, "/")

    if len(parts) > 0 {
        return parts[0]
    }

    return signature
}

inlet = func(body) {
    // GWT-RPC v7 的主体依次包含：
    // version、flags、字符串表、元数据索引和参数区。
    tokens = str.Split(str.TrimSpace(body), "|")

    if len(tokens) > 0 && tokens[len(tokens)-1] == "" {
        tokens = tokens[:len(tokens)-1]
    }

    pos = 0

    version = int(tokens[pos])
    pos++

    flags = int(tokens[pos])
    pos++

    tableLen = int(tokens[pos])
    pos++

    // 读取字符串表。
    table = []

    for i=0; i<tableLen; i++ {
        table = append(table, gwtUnescape(tokens[pos]))
        pos++
    }

    // 元数据索引从 1 开始，读取数组时需要减 1。
    baseURLIndex = int(tokens[pos])
    pos++

    strongNameIndex = int(tokens[pos])
    pos++

    serviceIndex = int(tokens[pos])
    pos++

    methodIndex = int(tokens[pos])
    pos++

    paramCount = int(tokens[pos])
    pos++

    // 参数类型索引集中排列在参数区前面。
    typeIndices = []

    for i=0; i<paramCount; i++ {
        typeIndices = append(typeIndices, int(tokens[pos]))
        pos++
    }

    params = []

    for i=0; i<paramCount; i++ {
        signature = table[typeIndices[i]-1]

        if !isSupportedSignature(signature) {
            return nil
        }

        if isTaskSignature(signature) {
            // Task 的两个字段按 command、name 顺序写入。
            if pos+1 >= len(tokens) {
                return nil
            }

            commandIndex = int(tokens[pos])
            pos++

            nameIndex = int(tokens[pos])
            pos++

            if commandIndex < 1 || commandIndex > len(table) ||
                nameIndex < 1 || nameIndex > len(table) {
                return nil
            }

            params = append(params, {
                "type": typeName(signature),
                "signature": signature,
                "value": {
                    "command": table[commandIndex-1],
                    "name": table[nameIndex-1],
                },
            })

            continue
        }

        // String、Integer 和 Gadget 探测包都从字符串表读取值。
        if pos >= len(tokens) {
            return nil
        }

        valueIndex = int(tokens[pos])
        pos++

        if valueIndex < 1 || valueIndex > len(table) {
            return nil
        }

        params = append(params, {
            "type": typeName(signature),
            "signature": signature,
            "value": table[valueIndex-1],
        })
    }

    return {
        "_gwtRpcShadow": true,
        "version": version,
        "flags": flags,
        "baseUrl": table[baseURLIndex-1],
        "strongName": table[strongNameIndex-1],
        "service": table[serviceIndex-1],
        "method": table[methodIndex-1],
        "params": params,
    }
}

egress = func(shadow) {
    // 回写时重新建立字符串表，并同步生成所有索引。
    table = []
    indexByValue = {}

    addString = func(value) {
        if value in indexByValue {
            return int(indexByValue[value])
        }

        table = append(table, value)
        index = len(table)
        indexByValue[value] = index

        return index
    }

    baseURLIndex = addString(shadow["baseUrl"])
    strongNameIndex = addString(shadow["strongName"])
    serviceIndex = addString(shadow["service"])
    methodIndex = addString(shadow["method"])

    typeIndices = []
    encodedValues = []

    for p in shadow["params"] {
        signature = p["signature"]

        if !isSupportedSignature(signature) {
            return nil
        }

        typeIndices = append(typeIndices, addString(signature))

        if isTaskSignature(signature) {
            task = p["value"]

            if task == nil ||
                task["command"] == nil ||
                task["name"] == nil {
                return nil
            }

            // Task 字段按照 command、name 顺序写回。
            encodedValues = append(
                encodedValues,
                addString(string(task["command"])),
            )

            encodedValues = append(
                encodedValues,
                addString(string(task["name"])),
            )

            continue
        }

        // 普通参数和类型探测参数写入一个字符串表索引。
        encodedValues = append(
            encodedValues,
            addString(string(p["value"])),
        )
    }

    parts = [
        string(shadow["version"]),
        string(shadow["flags"]),
        string(len(table)),
    ]

    for value in table {
        parts = append(parts, gwtEscape(value))
    }

    parts = append(
        parts,
        string(baseURLIndex),
        string(strongNameIndex),
        string(serviceIndex),
        string(methodIndex),
        string(len(shadow["params"])),
    )

    for index in typeIndices {
        parts = append(parts, string(index))
    }

    for index in encodedValues {
        parts = append(parts, string(index))
    }

    return str.Join(parts, "|") + "|"
}

handle = func(input) {
    packet = input

    _, bodyBytes = poc.Split(packet)
    body = string(bodyBytes)
    trimmed = str.TrimSpace(body)

    // 第一次执行：GWT-RPC 请求转换为 JSON 影子请求。
    if str.HasPrefix(trimmed, "7|") {
        shadow = inlet(trimmed)

        if shadow == nil {
            log.warn("GWT-RPC request parse failed")
            return input
        }

        newBody = json.dumps(
            shadow,
            json.withIndent("  "),
        )

        // 转成 JSON 后修改 Content-Type。
        packet = poc.ReplaceHTTPPacketHeader(
            packet,
            "Content-Type",
            "application/json; charset=utf-8",
        )

        // Yakit 会同步更新 Content-Length。
        packet = poc.ReplaceHTTPPacketBody(
            packet,
            newBody,
        )

        return string(packet)
    }

    // 第二次执行：JSON 影子请求回写为 GWT-RPC 请求。
    if str.HasPrefix(trimmed, "{") {
        shadow = json.loads(trimmed)

        if shadow == nil {
            return input
        }

        if shadow["_gwtRpcShadow"] != true {
            return input
        }

        newBody = egress(shadow)

        if newBody == nil {
            log.warn("GWT-RPC request rebuild failed")
            return input
        }

        // 回写后恢复 GWT-RPC 的 Content-Type。
        packet = poc.ReplaceHTTPPacketHeader(
            packet,
            "Content-Type",
            "text/x-gwt-rpc; charset=UTF-8",
        )

        packet = poc.ReplaceHTTPPacketBody(
            packet,
            newBody,
        )

        return string(packet)
    }

    return input
}
```

## 参考资料

1.  [Google Web Toolkit 2.10.0](https://github.com/gwtproject/gwt/tree/2.10.0) 及 GWT-RPC Wire Protocol 相关资料。
2.  [FSecureLABS/GWTMap](https://github.com/FSecureLABS/GWTMap) ，正文重点引用了响应分类、方法签名提取、方法信息提取和变量回溯部分。
