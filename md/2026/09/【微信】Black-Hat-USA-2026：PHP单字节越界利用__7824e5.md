---
title: 【微信】Black Hat USA 2026：PHP单字节越界利用
source: https://mp.weixin.qq.com/s/C837CZZ5TNo1ajD3uXpyaw
source_host: mp.weixin.qq.com
clip_date: 2026-09-23T08:40:12+08:00
trace_id: 48e46a80-b476-465f-b00b-c92d2e25accc
content_hash: bee14eb65214c82b816269852f49f025af383a23983ffd4ebbb08e9dfd7dd7d5
status: synced
tags:
  - 微信
  - 漏洞分析
  - PHP内存安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Black Hat USA 2026 议题展示：PHP 最新堆加固开启时，单字节越界仍可经数组索引伪造与 zval 语义升级为解释器原语。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3e475244-d011-8169-be59-ce269bf18030
ioc:
  cves:
    - CVE-2019-6977
    - CVE-2022-31626
    - CVE-2024-2961
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Black Hat USA 2026 议题展示：PHP 最新堆加固开启时，单字节越界仍可经数组索引伪造与 zval 语义升级为解释器原语。
> 
> - **加固范围：** Shadow Pointer、Unlink Prevention、只读 ZendMM 元数据、Heap Isolation 分别封堵 Freelist poisoning、伪造解链、Hook 篡改与请求数据塑形，但未覆盖解释器对象层。
> - **利用链：** 单字节受限越界→篡改 HashTable 索引低字节→伪造 Bucket 通过 Hash/Key 复核→借 zval 类型与引用计数构造 OOB/UBI/UAF/间接增减，最终形成 ZOP 的 Leak、Probe、Hijack。
> - **单请求条件：** PHP-FPM 的 share-nothing 反而让相同请求产生近似一致布局，一个 JSON Body 可同时完成对象喷射、释放、放置与触发，检测须关联同一 request_id 的状态、上游响应和 Worker 生命周期。
> - **修复开销：** HashTable 索引边界检查约 0.17%，通用 Refcount 目标校验约 8.86%；优先修根因、解引用前校验索引、校验 refcount 目标为合法堆对齐对象，并入口拒绝重复 JSON Key 等。
> - **验证与纵深：** 对 CVE-2024-2961、CVE-2022-31626、CVE-2019-6977 及 CTF Case 重评，100 次运行成功率 100%，旧 PoC 失效不等于不可利用；需 ASan/UBSan Fuzzing、最小扩展、只读 RootFS 和出站白名单。

**白帽子罗棋琛** *2026年9月23日 08:18*

## 烧穿 PHP 内存加固：从单字节越界到解释器原语

> Black Hat USA 2026 议题笔记：Burning Tears of PHP's Memory Hardening

近几年的 PHP 内存加固，确实切断了多条经典利用路径：Freelist 指针被保护，双向链表解链增加一致性检查，ZendMM 元数据转为只读，原始请求数据与应用对象也被分配到不同区域。旧的公开利用链因此失效。

但“旧 Exploit 不能运行”和“内存破坏不可利用”不是同一件事。公开课件展示了一条绕开分配器的路线：攻击者不再篡改 Freelist，也不再争夺 ZendMM Hook，而是利用 PHP 内建对象的布局，把一个受限的单字节越界转成数组索引伪造，再借 `zval` 类型与引用计数语义构造读、探测和控制流原语。

![议题课件封面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/596fc8a17998ab23.jpg)

*图 1：研究目标是在 PHP 最新堆防御开启的情况下，从受约束的单字节越界构造通用远程利用路径*

这份材料的价值不只在 PHP。它揭示了内存加固的一个共性问题：当防御紧盯分配器元数据时，解释器自身的对象模型、解码器和引用计数仍可能提供另一套“可编程接口”。

下面只保留理解修复和检测所需的利用原理，不提供完整载荷、地址计算或控制流劫持代码。

## 1、PHP 已经堵住了哪些经典路径

传统 PHP 堆利用通常从溢出相邻空闲 Chunk 开始，篡改单链表的 `next` ，让后续分配返回攻击者指定的位置；或者伪造双向链表、改写分配器 Hook，最后覆盖函数指针。

课件总结了四项针对性加固：

-   **Shadow Pointer**：对 Freelist 指针加密并在分配时核验，阻止直接 Poisoning；
    
-   **Unlink Prevention**：在解链前检查前后指针关系，阻止伪造链表写；
    
-   **Read-only Metadata**：运行时保护 ZendMM 的 `_malloc` 、 `_free` 、 `_realloc` 等元数据；
    
-   **Heap Isolation**：把 `$_GET` 、 `$_POST` 、 `$_COOKIE` 等原始请求数据与应用对象分开。
    

![PHP 的四类内存加固](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d60222ba30af3a5f.jpg)

*图 2：Freelist、解链、只读元数据和堆隔离分别封堵经典利用技术*

这些措施不是“无效”。它们迫使攻击者离开熟悉的分配器路径，显著抬高了研究和利用成本。问题在于覆盖面：每项控制主要针对一种已知技术，而攻击者仍能调用解释器公开支持的数组、字符串、解码和引用计数逻辑。

防守方评估 Runtime 加固时，不能只问某个 PoC 是否崩溃，还应问：

text

```
原语是否被消除？   ├─ 否：只是原有布局不再稳定，攻击者可能重新做堆塑形   ├─ 部分：写范围或值受限，但能否经对象语义升级？   └─ 是：错误状态在进入对象解释、解引用或释放之前被验证并终止 
```

真正强的修复通常靠近不变量被破坏的位置，而不是继续在后面的利用阶段增加摩擦。

## 2、Share-nothing 模型反而提供了可重复的初始状态

PHP-FPM 常被认为不利于远程堆利用：请求结束后，Zend Heap 被回收；攻击者不能像浏览器或内核 Exploit 那样通过数千次操作逐步训练分配器。课件把限制概括为“One request”。

但 Share-nothing 也带来可重复性。在相同 PHP 版本、相同扩展、相同 Worker 状态和相同请求下，新的 Request Heap 使用相同的 Best-fit 与 LIFO 行为，容易形成近似一致的布局。

![相同请求构造相同堆布局](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6c3107620fd73fd8.jpg)

*图 3：没有跨请求状态，不代表布局随机；相同请求可能从同样的空闲页和链表状态开始*

这改变了防守模型。攻击流量未必包含长时间的“准备阶段”，也未必先发侦察请求。单个 Body 可以同时承担：

1.  分配大量可控对象；
    
2.  释放其中一部分制造空洞；
    
3.  把目标对象放到特定页或相邻位置；
    
4.  触发内存破坏；
    
5.  在同一请求中完成泄漏、探测或控制流转移。
    

因此，只对“同一 IP 多次请求后出现 502”告警是不够的。WAF、反向代理和 FPM 必须保留单次异常请求的 Content-Type、压缩前后大小、JSON 结构统计、上游响应码和 Worker 生命周期信息。

## 3、研究路线刻意绕开了内存分配器

课件的主链条分为四步：单字节越界、Index Forgery、任意引用计数增减，以及 Zend-Oriented Programming（ZOP）。每一步都发生在 PHP 内建对象内部，不依赖修改 ZendMM Freelist 或应用自定义类。

![从单字节越界到 ZOP](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b4ed7cb6ea2ff21a.jpg)

*图 4：攻击链从受限越界进入数组索引，再借 zval 语义建立更强原语*

这里的单字节越界还有额外约束：越界值不能任意选择，也没有直接的越界读。通常这类缺陷只会被评为“可能造成崩溃”。研究思路不是要求漏洞立即提供任意写，而是寻找一个对低字节敏感、后续又会被解释器信任的字段。

这是一种通用的 Exploit 评估方法：

-   写入值受限时，寻找枚举值、长度、索引、标志位或低字节指针；
    
-   无信息泄漏时，寻找类型混淆后的序列化输出或崩溃差异；
    
-   无直接函数指针覆盖时，寻找析构、回调、迭代器和虚表等生命周期路径。
    

对漏洞修复团队来说，这意味着“只能写一个字节”不能作为低风险结论。应追踪这一字节落入的具体字段，以及该字段以后参与了哪些数组访问、对象解释和引用计数操作。

## 4、Index Forgery 利用的是 HashTable 对索引的信任

PHP 的 `zend_array` 基于 HashTable。课件中， `arData` 指向一块独立的 Butterfly 布局：一侧是 Hash Index，另一侧是连续 Bucket。字符串 Key 经过 Hash 与 Mask 定位索引槽，槽中的整数再决定读取哪个 Bucket。

![zend\_array 与 arData 布局](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a4a5242d39c53ec4.jpg)

*图 5：arData 两侧分别保存索引和 Bucket，索引决定后续访问位置*

如果单字节越界落到某个索引整数的低字节，它不需要覆盖指针，只要把一个正常的小索引改成较大的数，就可能让 `$table[$key]` 访问 Bucket 数组之外。攻击者再尝试让越界位置看起来像一个合法 Bucket。

PHP 并非完全不验证：查找过程还会比较 Bucket 中的 Hash 与 Key。课件说明，DJBX33A Hash 可逆，加上残留或重新占位的 Key 数据，伪造 Bucket 仍可能通过一致性检查。

![伪造 Bucket 通过 Key 与 Hash 复核](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cb0c56fae13910bb.jpg)

*图 6：仅复核 Hash 和 Key 不足以证明 Bucket 位于合法 arData 范围内*

根因不是 Hash 算法弱，而是“索引来自可信内部结构”的假设已经被越界写破坏。即使 Key 和 Hash 完全匹配，运行时仍应先验证索引对应的 Bucket 位于 `nNumUsed` 和当前分配边界内。

概念上的修复点如下，实际实现必须按 PHP 对负索引、未使用槽和 Packed/Hash 两种布局的编码规则处理：

c

```
/* 防御性伪代码：在解引用 Bucket 前验证索引。 */int32_t index = HT_HASH_EX(arData, slot);  if (UNEXPECTED(index < 0)) {     return NOT_FOUND; } if (UNEXPECTED((uint32_t) index >= ht->nNumUsed)) {     zend_error_noreturn(E_ERROR, "corrupted HashTable index"); }  Bucket *bucket = &ht->arData[index]; 
```

检测越界后应 Fail Closed，而不是取模、截断或继续尝试修复。解释器已经进入内存完整性未知的状态，继续运行会把可控崩溃变成后续利用机会。

## 5、zval 让受限写具备了类型语义

`zval` 保存 8 字节 Value 和类型信息。相同的 8 字节在 `IS_STRING` 、 `IS_DOUBLE` 、 `IS_ARRAY` 或 `IS_OBJECT` 下具有完全不同的含义。引用计数标志又决定解释器是否把 Value 当成 `zend_refcounted` 指针，并在读写或释放时执行增减操作。

伪造 Bucket 一旦让查找返回攻击者控制的 `zval` ，普通 PHP 语义就可能替攻击者完成间接内存操作：读取一个 Refcounted 值触发引用计数增加，覆盖或销毁它触发减少。

![一个损坏索引形成多种原语](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e51784bbaf3f43b.jpg)

*图 7：OOB、未初始化字段、UAF 与受限指针写在伪造 Bucket 处汇合*

课件把由此得到的能力拆成四类：

-   OOB：伪造索引让 Bucket 访问越界；
    
-   UBI：伪造结构中部分字段来自未初始化或残留内存；
    
-   UAF：Key 或对象指针可能指向已释放的 `zend_string` ；
    
-   IF（Indirect Free/Increment/Decrement）：借引用计数对目标地址做受限增减。
    

单独看，引用计数 `++/--` 比任意写弱得多；但如果低字节能够指向另一个 `zval` 的 `type_flags` ，修改类型标志又能让下一个值被解释成 Refcounted 指针，从而逐层扩大地址范围。

运行时加固不能只验证“指针非空”。对任何即将执行引用计数操作的值，至少需要验证：

text

```
地址对齐正确   + 地址位于当前 PHP Heap 的合法分配区   + 指向对象头的类型与 zval 类型一致   + Refcount 处于允许范围   + 对象没有处于已释放或隔离状态 
```

课件给出的实验补丁之一正是校验目标为 PHP Heap 上对齐的 `zend_refcounted` ；测得开销为 8.86%。这比索引边界检查的 0.17% 高得多，说明通用对象完整性校验需要在安全收益和热路径成本之间做工程取舍。

## 6、ZOP 把解释器内部逻辑变成 Gadget Set

研究将后半段命名为 Zend-Oriented Programming。它与 ROP 的共同点是组合现成语义，但“Gadget”不再是短机器指令，而是解释器对类型、引用计数、序列化和析构的合法处理路径。

![Zend-Oriented Programming 的三类能力](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b237f46b2ff7247d.jpg)

*图 8：受控增减可以进一步形成泄漏、地址探测和析构函数劫持*

课件给出三个关键阶段：

1.  **Leak**：把保存堆指针的 `zval` 类型从 String 改成 Double，同一组位被 JSON/XML 以浮点数形式返回；
    
2.  **Probe**：从已知 Heap Anchor 附近逐页试探，利用正常响应与 502/崩溃差异推断映射边界；
    
3.  **Hijack**：伪造 `zend_array` ，让引用计数归零时触发可控 `pDestructor` 。
    

这说明应用层输出格式也可能成为内存泄漏通道。安全测试不应只寻找十六进制地址；极小或极大的异常浮点数、 `null` /Number/String 类型在同一字段上的不稳定切换，都值得与 Worker Crash 关联。

在 API 网关或检测平台中，可以先做低成本统计：

sql

```sql
SELECT     route,     upstream_status,     count(*) AS responses,     sum(CASEWHEN response_body RLIKE 'e-[23][0-9]{2}'THEN1ELSE0END)         AS subnormal_float_responses,     sum(CASEWHEN upstream_status =502THEN1ELSE0END)         AS bad_gateway_responses FROM http_transaction WHERE event_time >=CURRENT_TIMESTAMP-INTERVAL'10'MINUTEAND upstream_runtime ='php-fpm'GROUPBY route, upstream_status HAVING subnormal_float_responses >0AND bad_gateway_responses >0; 
```

这类规则只能做线索。科学计算、序列化精度问题和合法的极小浮点数都可能触发，必须结合请求结构、FPM Crash 和应用版本判断。

## 7、Heap Isolation 的缺口在解码之后

PHP 把原始 `$_GET` 、 `$_POST` 和 `$_COOKIE` 放入隔离区域，能阻止攻击者直接用请求字符串塑形应用 Heap。但应用通常会对请求 Body 执行 `json_decode()` 或 XML 解析，解码产生的 `zend_string` 、 `zend_array` 和 `zend_object` 仍需进入应用 Heap。

![解码器跨越用户输入堆隔离](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ad696c349d3b6249.jpg)

*图 9：原始字段被隔离，解码后的内建对象仍落入漏洞所在的应用 Heap*

课件指出两种解码器驱动的布局能力：

-   重复 JSON Key 会让同一属性被多次分配、覆盖和释放，相当于一个 Alloc/Free 脚本；
    
-   Packed Integer Array 以连续 `zval` 保存数值，能产生规则的 8 字节模式。
    

业务通常不需要重复 Key。入口层应拒绝它，而不是让不同语言按“第一个生效”或“最后一个生效”各自解释。Python 网关可以使用 `object_pairs_hook` 做严格解析：

python

```python
import json from typing importAnyclassDuplicateKeyError(ValueError):     passdefreject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:     result: dict[str, Any] = {}     for key, value in pairs:         if key in result:             raise DuplicateKeyError(f"duplicate JSON key: {key!r}")         result[key] = value     return result   defparse_untrusted_json(body: bytes) -> Any:     iflen(body) > 1_048_576:         raise ValueError("request body too large")     return json.loads(body, object_pairs_hook=reject_duplicate_keys) 
```

这不是 PHP 内存漏洞的根本修复，但能消除一类远程 Heap Shaping 输入。还应限制数组深度、元素数量、字符串总长度和整数数量，且在解压之后计算大小，避免小型压缩 Body 展开成巨型对象图。

## 8、单请求链要求网关和 FPM 共享上下文

课件把 Build、Place、Forge 和 Trigger 全部放进一个 JSON Body：用内建对象构造布局，用重复 Key 制造释放，用 Packed Integer 写入规则数据，最后在同一个请求内触发目标行为。

![单请求完成构造、放置、伪造与触发](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a28bfd932f760879.jpg)

*图 10：单个 HTTP Body 同时承担对象喷射、释放、目标放置和触发*

检测不能依赖第二次请求。反向代理需要为每个 Request 生成稳定 ID，并传到 PHP-FPM 日志：

nginx

```swift
map$request_id$security_request_id {     default$request_id; }  log_format php_security escape=json   '{"time":"$time_iso8601",''"request_id":"$security_request_id",''"remote_addr":"$remote_addr",''"method":"$request_method",''"uri":"$uri",''"content_type":"$content_type",''"content_length":"$content_length",''"status":$status,''"upstream_status":"$upstream_status",''"upstream_time":"$upstream_response_time"}';  fastcgi_param HTTP_X_REQUEST_ID $security_request_id; access_log /var/log/nginx/php-security.json php_security; 
```

同时在 PHP-FPM Pool 中开启必要的慢日志与错误日志，并控制请求寿命：

ini

```
; 具体数值需要按业务基线调整。request_terminate_timeout = 30s request_slowlog_timeout = 5s slowlog = /var/log/php-fpm/www-slow.log catch_workers_output = yesdecorate_workers_output = no; 周期性回收 Worker，降低长期状态漂移；这不是漏洞修复。pm.max_requests = 1000
```

发生 `SIGSEGV` 、 `SIGABRT` 或 Worker 异常退出时，采集器应记录 PID、二进制 Build ID、已加载扩展、最近 Request ID、上游 URI 和 Core Dump 引用。请求 Body 涉及个人数据或凭据时，不应默认全量落盘；可保存结构摘要、字段计数、重复 Key 位置、内容 Hash 和受控采样。

## 9、验证加固时要看“旧 CVE 是否能换路线复活”

课件使用 CVE-2024-2961、CVE-2022-31626、CVE-2019-6977 和两个 CTF Case 验证方法。在全部新防御开启的环境中，旧公开链已失效；换成 Index Forgery 与 ZOP 后，表格报告这些目标在 100 次运行中均达到 100% 成功率。表中的 `REQS` 数值从 2 到 371 不等，不能简单等同于单次链的网络交互数；材料另行强调每次完整构造可以收敛在一个 HTTP Body 内。

![旧漏洞在新利用路径下的评估结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/433c466e91020b5b.jpg)

*图 11：研究对多个真实 CVE 与 CTF Case 重新评估，并报告 100 次运行均成功*

安全补丁的回归标准不应是“公开 PoC 退出码非零”。更可靠的测试矩阵包括：

yaml

```
runtime_matrix:php:-production_version-next_supported_minorallocator_hardening:shadow_pointer: [on]     unlink_prevention: [on]     read_only_metadata: [on]     heap_isolation: [on]   sapi:-fpmdecoders:-json-xmlassertions:-malformed_index_fails_before_bucket_dereference-refcount_target_must_be_heap_aligned-worker_crash_is_not_a_passing_result-duplicate_keys_are_rejected_at_boundary-sanitizer_build_reports_no_oob_or_uaf
```

PHP 核心、扩展和发行版维护团队还应在 ASan/UBSan 构建中运行覆盖解码器与 HashTable 的 Fuzzing。业务团队无法证明解释器内存安全，但可以对高风险扩展做最小化：删除不使用的 `iconv` 转换路径、图像解析器、归档器和自研 C 扩展，避免把 PHP-FPM 与不必要的系统工具、凭据和可写目录放在同一容器。

## 10、最小修复与纵深防御的优先级

课件比较了两类直接补丁：HashTable 索引边界检查的实验开销为 0.17%，可在源头阻断 Index Forgery；通用 Refcount 目标校验开销为 8.86%，覆盖面更广但成本明显更高。

![两类补丁的性能对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cbc80b634ab182a6.jpg)

*图 12：靠近损坏源头的索引检查成本低，通用引用计数校验覆盖广但开销更高*

这给出了很实际的修复顺序：

1.  先修复具体 OOB/UAF 根因，升级 PHP、glibc 和相关扩展；
    
2.  在 HashTable 解引用前增加廉价边界验证；
    
3.  对跨类型共用的 `zend_refcounted` 操作引入通用完整性校验；
    
4.  进一步按对象类型隔离分配区，打破跨类型相邻布局；
    
5.  为页级布局加入真正的随机化，而不是只随机 Freelist 顺序；
    
6.  在入口拒绝重复 Key、超深对象和异常大型数组；
    
7.  关联单请求结构、502、Worker Crash 和异常响应类型；
    
8.  以低权限、只读 RootFS、最小 Capability 和出站网络白名单运行 FPM。
    

![PHP 后续加固方向](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fb485b45dd1b4b5f.jpg)

*图 13：Freelist 加固已经奏效，剩余重点转向内建对象、对象隔离和随机化*

容器或服务级限制不能阻止进程内 RCE，但能压低后续影响。一个偏保守的运行基线如下：

yaml

```ruby
services:php-fpm:image:registry.example/php-app@sha256:REPLACE_WITH_APPROVED_DIGESTread_only:trueuser:"10001:10001"cap_drop:-ALLsecurity_opt:-no-new-privileges:truetmpfs:-/tmp:size=64m,noexec,nosuid,nodevvolumes:-type:bindsource:./publictarget:/srv/app/publicread_only:truenetworks:-app_internal
```

还应限制 FPM 到互联网、云元数据、数据库管理端口和内部控制面的出站访问。即使攻击者取得 PHP 进程控制，也不应直接接触部署凭据、Docker Socket、Kubernetes ServiceAccount 或宿主机敏感挂载。

原始资料：

-   Black Hat 官方 Session 页面
    

PHP 的新加固没有失败，它成功淘汰了依赖旧分配器技巧的利用链。真正需要补上的，是解释器对象层的共同防线：索引必须在边界内，引用计数目标必须属于有效对象，解码器不能无成本地成为 Heap 脚本，崩溃与触发它的单个请求必须能被关联。只有这些约束同时成立，“旧 Exploit 已失效”才会逐步接近“这一类漏洞难以利用”。

**原始会议材料（仓库内）**

-   演讲课件 PDF
    

开源资料与原始议题 PDF

本文对应的 Markdown 原稿、Black Hat 原始议题 PDF 与配图已整理到 GitHub，可按文章编号查找和下载。

https://github.com/cybermaxluo/black-hat-usa-2026-talks

也可以点击文末“阅读原文”进入仓库。欢迎 Star、提交 Issue 或参与勘误。

Black Hat · 目录
