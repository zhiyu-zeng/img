---
title: 【微信】0day漏洞-mysql-mysqldump-show-tables-overflow
source: https://mp.weixin.qq.com/s/j-vGPZ0JEpOug9PWxEyn-Q
source_host: mp.weixin.qq.com
clip_date: 2026-10-08T00:33:40+08:00
trace_id: 80179765-4343-4c4e-870d-ff8db2becf64
content_hash: 5f143398d4f309e66867265a0d2d5f68ae1498f8205561145015eb37f8ec4a8a
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: MySQL 官方 `mysqldump` 26.7.0 将服务端返回的 `SHOW TABLES` 表名视作可信数据，经两处无边界检查的栈写入溢出 386/195 字节缓冲区；受害者执行 mysqldump 连向攻击者 MySQL 桩，一条 64KiB 表名即可令备份进程 SIGSEGV。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f275244-d011-8116-817b-effe3bb91929
ioc:
  cves:
    - CVE-2015-3152
    - CVE-2016-2047
    - CVE-2024-10979
    - CVE-2024-7348
    - CVE-2025-8715
  cwes:
    - CWE-120
    - CWE-121
  hashes:
    - 06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> MySQL 官方 `mysqldump` 26.7.0 将服务端返回的 `SHOW TABLES` 表名视作可信数据，经两处无边界检查的栈写入溢出 386/195 字节缓冲区；受害者执行 mysqldump 连向攻击者 MySQL 桩，一条 64KiB 表名即可令备份进程 SIGSEGV。
> 
> - **触发路径：** 恶意 MySQL 服务端在 `SHOW TABLES` 响应中回送超长表名，客户端 `getTableName()` 直接取 `row[0]` 裸指针，全程无长度校验。
> - **两个写点：** `dump_all_tables_in_db` 的 `hash_key[386]`（写入起点还偏移 `len(db)+1`，实际仅 379 字节余量）先崩；`dump_table` 中 `quote_name` 向 `table_buff[195]` 转义拷贝，反引号翻倍放大。
> - **实验设计：** 双端口差分对照（对照表名 `t` vs 64KiB 载荷），SUCCESS 需同时满足对照不崩、实验组崩、协议确实送达；载荷内置 witness 字符串便于 core dump 取证。
> - **为何 139 而非 134：** 64KiB 写入在拷贝循环内即冲出栈 VMA 触发页错误 SIGSEGV，glibc 栈保护 canary 尚未来得及在函数返回时比对。
> - **危害与修复：** 已证仅崩溃（自评 CVSS 8.8，按已证口径应 6.5），副产品是备份口令的 challenge-response 被收割；修复需对表名按 `NAME_LEN` 截断、给 `quote_name` 增加长度参数。

**网安之家-CyberHomestead** *2026年10月7日 23:55*

## KLEIN BLUEmysql-mysqldump-show-tables-overflow 全息研究报告

**对象**：https://github.com/abraxas/mysql-mysqldump-show-tables-overflow（Abraxas Labs，AGPL-3.0）  
**性质**：MySQL 官方备份客户端 `mysqldump` 的恶意服务端型栈溢出漏洞研究包（非扫描器、非 C2、非后门）  
**审计方法**：仓库全量源码静态审计 + 与官方 `mysql/mysql-server` 仓库 `mysql-26.7.0` 标签源码逐行比对 + 历史 CVE 联网核实  
**报告日期**：2026-10-07  
**写作规范**：writing-helper（写给授权红队/蓝队成员的桌面研究报告，正式技术体，事实优先，证据边界显式声明）

> **证据分级约定**：【已核验】= 本报告在官方源码树中逐字确认；【仓库声明】= 转述自 README/代码注释/提交信息；【推断】= 基于公开操作系统/编译器知识的标准推断；【未核验】= 标注待查。全文未见一个未经标注的"事实"。

## TL;DR

这不是一个"工具"，是一枚 **研究级漏洞 PoC 包**：MySQL 官方 `mysqldump` （26.7.0，标签 SHA `06a5c1c...`【已核验】）把服务端返回的 `SHOW TABLES` 表名当成长度≤192 字节的可信数据，经 `my_stpcpy` 与 `quote_name` 两处 **无边界检查的栈上写入** 直接落进 386/195 字节的栈缓冲区。攻击面完全倒置： **受害者执行 mysqldump 指向攻击者的 MySQL 协议服务端，一条 64KiB 表名即可让备份进程 SIGSEGV（退出码 139）**。仓库用双端口差分实验（对照组表名 `t` ，实验组 64KiB 名+witness+512 反引号）把因果钉死，实验声明 crash-only、无 RIP 控制——诚实到把四次"错误尝试"都写进了 README。CVSS 自评 8.8（本报告对其中 C:H/I:H 的口径提出质疑）。同型先例：BACKRONYM（CVE-2015-3152）、rogue MySQL server 家族（文件窃取/JDBC 反序列化）、PostgreSQL pg_dump TOCTOU（CVE-2024-7348）。本漏洞把"内存破坏"补进了这个攻击类的谱系。

## 这个"工具"是什么？名字有什么寓意？

### 1.1 先纠正一个定位

它不是 fscan 那种主动扫描器，而是标准的三件套 **漏洞披露包**：

| 组件  | 文件  | 角色  |
| --- | --- | --- |
| 恶意服务端 | `lab/stub.py`<br><br>（约 500 行） | 手写 MySQL 协议 4.1 桩：完成握手、应答会话 SQL、在 `SHOW TABLES` 处投毒 |
| 验证器 | `lab/poc.py` | 双端口差分实验：对照 vs 溢出，崩溃分类与 SUCCESS 判定 |
| 编排  | `lab/run.sh`<br><br>\+ `Dockerfile` + `docker-compose.yml` | 一键起环境（官方 `mysql:26.7.0` 镜像只取客户端），跑完自动 `down -v` 清场 |
| 门面  | `mysql-mysqldump-show-tables-overflow-Abraxas-Labs.py` | 彩虹横幅 + 把参数原样转发给 `lab/run.sh` 的 4 行启动器 |

### 1.2 名字寓意：三层解码

**第一层（命名法）**： `mysql` （厂商/产品）- `mysqldump` （组件）- `show tables` （触发点）- `overflow` （缺陷类）。这是漏洞研究社区的标准"坐标命名法"——名字本身就是漏洞简报，读名知位。作者用它替代了尚不存在的 CVE 编号（README 原文："no CVE yet"），等 Oracle 分配编号后这串名字可以直接映射为论文/工单标题。

**第二层（品牌）**：Abraxas 是灵知派（Gnosticism）神话中的鸟首蛇身神祇，希腊字母数值和为 365，象征"包罗万有"——安全圈常用作团队代号（作者 X 手柄 `@abraxas_null` ，口号 "analyze · reverse · disclose"）。横幅里 `abraxas!null` 把手柄和"零"做了双关：null 既是空指针梗，也是"无名研究员"的自谦。

**第三层（witness）**：载荷内置见证字符串 `MYSQL-DUMP-SHOW-TABLES-OVERFLOW-WITNESS` ——崩溃后它躺在栈内存和 core dump 里，一条 `strings core | grep WITNESS` 就能证明"崩溃来自本 PoC 的载荷"而非环境噪声。把漏洞名写进攻击载荷做"签名"，是 PoC 工程里少见但极规范的做法。

### 1.3 官方源码坐标（全部【已核验】）

| 坐标  | 内容  |
| --- | --- |
| `include/mysql_com.h:60` | `#define NAME_CHAR_LEN 64` |
| `include/mysql_com.h:67` | `#define NAME_LEN (NAME_CHAR_LEN * SYSTEM_CHARSET_MBMAXLEN)`<br><br>→ 64×3 = **192** |
| `client/mysqldump.cc:103` | `#define MAX_FIELDS 4000` |
| `client/mysqldump.cc:4195/4207` | `dump_table`<br><br>： `char buf[240], table_buff[NAME_LEN+3]` （195B）、 `bool real_columns[MAX_FIELDS]` |
| `client/mysqldump.cc:5213` | `dump_all_tables_in_db`<br><br>： `table_buff[NAME_LEN*2+3]` （387B）、 `hash_key[2*NAME_LEN+2]` （**386B**）、 `real_columns[MAX_FIELDS]` （4000B）同帧 |
| `client/mysqldump.cc:4671` | `getTableName`<br><br>： `return ((char*)row[0])` 裸指针直出 |
| `client/mysqldump.cc:2047` | `quote_name`<br><br>：无长度参数的转义拷贝 |
| `libmysql/libmysql.cc:733` | `mysql_list_tables`<br><br>：发出字面量 `"show tables"` ， `mysql_store_result` 全量收包 |

## 它为何诞生？——作者的自述与方法论还原

README "How I found it" 一节给出了完整的发现路径【仓库声明】：

1\. **系统性源码狩猎**：作者宣称对 `mysql/mysql-server` 的 `mysql-26.7.0` 标签跑了 **31 次 source hunt** （针对特定缺陷模式的自动化/半自动化源码筛查）。

2\. **CPU 节奏驱动**：2026 年 7 月 Oracle CPU（Critical Patch Update）把该 SHA 钉版上的服务端 Critical/High 行全部关闭——服务端这口井暂时枯了。

3\. **类迁移假设**：客户端工具成了"残余类"，并援引跨库同型："PostgreSQL `pg_basebackup` following a hostile path"。假设一句话： **pg 有恶意服务端打客户端的缺陷类，MySQL 客户端没有理由缺席。**

4\. **命中**： `getTableName` → `my_stpcpy(hash_key)` → `quote_name(table_buff)` 这条"服务端数据→栈缓冲"的无界流。

5\. **负结果披露**：README 记录了四条 wrong turns（把真 mysqld 当 oracle、4KiB 被 `real_columns` 吸收、全树 ASan 编译、误称 IP 控制）——研究纪律在漏洞 PoC 仓库里罕见地好。

git 历史佐证迭代过程：2026-10-06 一天四提交——初始研究 → `Add vuln class (Crash/File write/Privilege leftover/SQLi/RCE)` → `Mark Reach Remote` → `Refactor lab code to production style` 。分类从模糊到收敛的过程全在提交历史里。

**一句话回答"为何诞生"**：CPU 周期的服务端空窗期 + 跨数据库缺陷类迁移假设 + 客户端信任服务端的先天性契约缺口，三者交汇处的定向狩猎产物。

## 漏洞原理：抽丝剥茧（五层拆解）

### 3.1 L1 协议层：结果集行没有"标识符"概念

MySQL C/S 协议（本仓库手写的协议 4.1）里， `SHOW TABLES` 的响应就是一个普通结果集：column_count → N 个 ColumnDefinition41 → N 行（lenenc 字符串）→ EOF。协议对"这一行是不是合法表名" **没有任何类型校验**——行的上限只有 `max_allowed_packet` （服务端配置，可达 GB 级）。任何能说 MySQL 方言的 TCP 对端都能返回 64KiB 的"表名"。【已核验：stub.py 的 `send_result()` 就是这么构造的】

### 3.2 L2 契约层：服务端纪律被当成协议保证

`mysqld` 确实不会发出超过 `NAME_CHAR_LEN=64` 字符的标识符——但这是 **服务端的自我修养**，不是协议义务。 `mysqldump` 把前者当成了后者，从 `row[0]` 拿到字符串后 **一次长度检查都没做**。README 用一句话定性："The leftover is the client trusting the protocol."（残留问题是客户端信任了协议。）

### 3.3 L3 代码层：两个无界写点，一先一后

**入口** `mysql_list_tables()` （libmysql.cc:733【已核验】）：

```
char buff[255];
```

append_wild(my_stpcpy(buff, "show tables"), buff + sizeof(buff), wild); // 请求侧有界！

```
if (mysql_query(mysql, buff)) return nullptr;
```

return mysql_store_result(mysql); // 响应侧无界

同一函数内的不对称极具讽刺： **发出去的查询被钉死在 255 字节缓冲里，收回来的结果没有任何边界**。64KiB 的行先被完整收进堆内存，然后 `getTableName()` （mysqldump.cc:4671【已核验】）把 `row[0]` 裸指针递给上层。

**写点①（先执行）** `dump_all_tables_in_db()` （mysqldump.cc:5213【已核验】）：

```
char table_buff[NAME_LEN * 2 + 3];      // 387
```

```
char hash_key[2 * NAME_LEN + 2];        // 386 ← "db.tablename"
```

bool real_columns\[MAX_FIELDS\]; // 4000，同一栈帧

```
...
```

afterdot = my_stpcpy(hash_key, database); // 先写 "testdb"，返回尾指针\*afterdot++ = '.'; // 再写点号

```
while ((table = getTableName(0))) {
```

char \*end = my_stpcpy(afterdot, table); // ← 攻击者字符串从偏移 len(db)+1 开写，无界if (include_table(hash_key, end - hash_key)) { // std::string(hash_key,len) 读已破坏的内存 dump_table(table, database); // → 写点②

一个 README 没点破、审计中发现的细节： **写起点不是 `hash_key[0]` 而是偏移 `strlen(database)+1`** （"testdb." 占 7 字节）——实际余量只有 386−7=379 字节，比表面看更脆。

**写点②（后执行）** `dump_table()` → `quote_name()` （mysqldump.cc:4195/4256/2047【已核验】）：

char buf\[240\], table_buff\[NAME_LEN + 3\]; // 195 字节result_table = quote_name(table, table_buff, true); // force=true，必写

```
staticchar *quote_name(char *name, char *buff, bool force) {
```

```
...
```

```
*to++ = qtype;
```

```
while (*name) {
```

if (\*name == qtype) \*to++ = qtype; // ← 反引号翻倍：1 字节输入写 2 字节

```
*to++ = *name++;
```

```
}
```

to\[0\] = qtype; to\[1\] = 0; // 收尾再写 2 字节

`quote_name` 的 API 设计本身就是缺陷： **没有长度参数**，调用方想传界都没地方传——CWE-120 的教科书形态。这也解释了 stub 载荷尾部那 512 个反引号（ `QUOTE_NAME_BACKTICK_PAD = 512` ）：前缀长名砸写点①，反引号尾巴在写点② **翻倍放大**，一份载荷同时喂饱两个写点。【推断】——代码逻辑直接可见，具体崩溃点由实验观察定。

### 3.4 L4 栈帧层：为什么是 64KiB？

`dump_all_tables_in_db` 帧上有三块连续局部数组（387+386+4000 ≈ 4.8KB）。Oracle 官方构建开启 `-fstack-protector-strong` 【推断：主流发行版默认】，canary 位于局部数组与保存的 RBP/返回地址之间。README 记录的第一条 wrong turn——"4KiB 名字被 `real_columns[MAX_FIELDS]` 吸收，无信号"【仓库声明】——说明 4KiB 级写入全部落在同帧数组和填充里，连 canary 都没碰到。所以 stub 的 `MIN_OVERFLOW_BYTES = 8192` 设了配置下限，Dockerfile 默认 `OVERFLOW_BYTES=65536` ： **64KiB 足以贯穿整帧、canary、上层调用链帧，一路冲出主线程栈 VMA**。

### 3.5 L5 操作系统调用层：从 MOVDQU 到 SIGSEGV

这是用户点名要的部分，把死亡瞬间逐指令还原【推断，基于 Linux x86-64 公开机制】：

1\. **写入本身零系统调用**。 `my_stpcpy` 展开为 glibc 的 SSE2/AVX2 `stpcpy` 实现—— `MOVDQU` / `MOVAPS` 每次 16/32 字节正向存储，纯用户态内存写。要精确定位可在容器内 `ltrace -e stpcpy` 或反汇编 `strings/` 实现确认 Oracle 构建用的是自有实现还是 PLT 跳 glibc。

2\. **栈的生长方向决定了死亡方向**。x86-64 栈向低地址生长， `hash_key` 的正向溢出向 **高地址** 写 = 朝 main 帧、 `__libc_start_main` 帧、env/argv 区推进，直到栈 VMA 顶端之后的未映射区域。

3\. **命中未映射页**：某条 MOV 把数据写向 VMA 边界外 → CPU 页错误（error code = 写+用户态+页不存在）→ 内核 `do_page_fault()` → `bad_area_nosemaphore` → `force_sig_fault(SIGSEGV, SEGV_MAPERR, addr)` 。

4\. **信号送达**：进程被 SIGSEGV 击杀。两种退出路径都出现在 `poc.py` 的分类器里：容器 shell 报 **139** （128+11 惯例），Python `subprocess` 的 `returncode` 为 **\-11**—— `classify()` 两条都写了【已核验：poc.py:327-335】。

5\. **为什么不是 134（SIGABRT / stack-smashing-detected）**：glibc SSP 的 `__stack_chk_fail` 在 **函数返回时** 比对 canary。64KiB 写入在 `my_stpcpy` 还没返回时就冲出了 VMA—— **死亡发生在拷贝循环内部，canary 检查根本没机会执行**。只有"恰好撕开 canary 又不越出栈顶"的中等长度才会走 SIGABRT 路径。 `classify()` 对 `stack smashing detected` / `buffer overflow detected` /ASAN 字符串的三重字符串匹配，说明作者在阈值摸索阶段把 134/139/ASAN 三种死法全见过。

6\. **RCE 通道的诚实评估**：从 crash 到 RIP 需要越过 canary（需泄漏）+ PIE/ASLR（需泄漏），而本原语是 **纯线性正向覆盖、无任何读回传**——错误消息路径虽然会回显服务端字符串，但不构成栈内存读原语。仓库标注 "Crash (client SIGSEGV; not demonstrated RCE)"、Lab 行写 "No RIP payload"【仓库声明】，本报告认为该自我评级诚实。

## 攻击链定位：它在真实攻防里站在哪一环

### 4.1 攻击模型（UI:R 的含义）

攻击者 受害者

```
│                                │
```

│ ① 备好恶意 MySQL 桩(3306) │ │ ←──────────────────────────────│ ② cron/CI/运维脚本执行: │ TCP 握手+auth switch │ mysqldump -h db.internal -u backup -p\*\*\* │ ③ 回 OK 包,不校验任何口令 │ (真实口令的 handshake 响应已发给攻击者!) │ ④ 应答 SET/LOCK/SHOW VARIABLES │ │ ⑤ SHOW TABLES → 64KiB 表名 │

```
│ ←──────────────────────────────│
```

│ │ ⑥ SIGSEGV(139),备份失败 │ │ 副产品:口令哈希已在攻击者手里

### 4.2 怎么让受害者的 mysqldump 指向你（武器化前提，仅授权场景）

| 路径  | 手段  | 现实度 |
| --- | --- | --- |
| 内网名称解析 | LLMNR/NBT-NS/mDNS 投毒（Responder 系）——cron 里的 `mysqldump -h dbbackup` 短主机名解析 | 高，经典内网三件套 |
| 二层  | ARP 欺骗；配合 `--ssl-mode` 默认 PREFERRED（恶意桩不宣告 SSL 即明文握手） | 高   |
| DNS | 内部 DNS 记录篡改、过期域名接管、DHCP 下发恶意 DNS | 中高  |
| 配置/供应链 | docker-compose 镜像标签、Ansible 变量、 `my.cnf` include、备份脚本模板 | 中   |
| 云   | 备份编排系统的 SSRF/目标重定向、Route53 劫持后的定时任务 | 视架构 |

### 4.3 比崩溃更值钱的副产品

1\. **凭证收割**：stub 不校验口令、auth switch 到 `mysql_native_password` 后直接回 OK——受害者的真实备份口令已经完成了一次对攻击者的 challenge-response，SHA1 派生哈希可离线爆破。这是 rogue MySQL server 家族（MySQL_Fake_Server 等）的主打业务，本 PoC 的实验里被 `--password=` 空口令掩掉了，实网必须计入【推断：协议行为已核验，收益为分析】。

2\. **可用性打击**：全量备份静默失败——如果备份作业没有独立的成功校验（大量真实环境没有），这是 **无声的数据保护降级**，等真正需要恢复时才爆雷。

3\. **同族接口点**： `handle_query()` 的正则状态机加一个分支就能应答 `LOAD DATA LOCAL INFILE` （同家族文件窃取）——仓库没做，但架构上是即插即用的【推断：代码结构可见】。

### 4.4 蓝队检测点（对应上面的每一步）

• **主机侧**： `dmesg` /journal 的 `mysqldump[12345]: segfault at ... sp ... error 4` ；EDR 对 mysqldump 异常退出（139/134）的告警；core dump 里 `strings core | grep WITNESS` 。

• **网络侧**：3306 端口无 TLS 会话； **单行 64KiB 的巨型结果集** （正常 SHOW TABLES 行都是几十字节，这个体积在流量上极其扎眼）；握手 scramble 固定 20× `'a'` 是桩的网络指纹。

• **行为侧**：备份作业周期性失败 + 备份源主机与非常见 DB IP 建立了 3306 连接。

## 前世今生：恶意服务端打客户端的完整谱系

mysqldump 自 MySQL 3.23 时代就是官方备份标配， `--opt` 默认开启（含 `LOCK TABLES` ）——所以 README 说 "The overflow is in that first SHOW TABLES loop"： `lock_tables` 默认路径上【已核验：mysqldump --opt 语义】。这条漏洞的历史位置要放进" **客户端信任服务端** "这个 20 年的缺陷类里看：

| 年份  | 事件  | 类别  | 关系  |
| --- | --- | --- | --- |
| 2015-2016 | **BACKRONYM**<br><br>（CVE-2015-3152）：MySQL 客户端 <5.7.3 即使指定 `--ssl` 也会被中间人明文降级 | 恶意/中间人服务端·协议 | 同前提：客户端对服务端身份的轻信 |
| 2016 | CVE-2016-2047：MariaDB/MySQL 客户端库 `ssl_verify_server_cert` 不校验证书 CN/SAN 主机名 | 恶意/中间人服务端·TLS | 同前提 |
| 2019-2023 | **Rogue MySQL Server 家族**<br><br>（MySQL_Fake_Server 等）：恶意服务端借 `LOAD DATA LOCAL INFILE` 窃取客户端文件；配合 JDBC URL 的 `autoDeserialize` / `queryInterceptors` 触发 Java 反序列化 RCE | 恶意服务端·逻辑 | 同家族，红队已武器化 |
| 2024-08 | **CVE-2024-7348**<br><br>：pg_dump TOCTOU，对象创建者可让 pg_dump 以其身份执行任意 SQL（pg_dump 常为超级用户） | 恶意服务端·逻辑 | README 援引的同型参照 |
| 2025 | CVE-2025-8715：pg_dump/restore 恢复期 RCE | 恶意数据·客户端 | 同方向持续演进 |
| （勘误）2024-11 | CVE-2024-10979 是 **PL/Perl 环境变量** 漏洞，不属于 pg_dump——检索中常见张冠李戴，特此标注 | —   | 防止报告引用错误 |
| 2026-10 | **本漏洞**<br><br>：mysqldump 恶意服务端型 **内存破坏** （CWE-120/121） | 恶意服务端·内存 | 给该类补上 C 语言内存这一分支 |

**脉络结论**：这个类的问题模式 10 年没变过—— **客户端把服务端当可信组件，而协议从来不保证对端是谁**。变化的是后果形态：窃听（BACKRONYM）→ 文件窃取/反序列化（rogue server）→ 逻辑 RCE（pg_dump TOCTOU）→ 内存破坏（本漏洞）。内存破坏的"升级潜力"上限最高，但当前只演示到 crash。

## 源码审计：逐文件扒光细节与架构

### 6.1 lab/stub.py（恶意服务端，约 508 行）——全仓库的灵魂

**架构**：常量区（协议原语）→ 数据类（Packet/ClientSession/StubSettings）→ 线格式编解码 → 握手构造/解析 → 结果集构造 → SQL 分流状态机 → 连接循环 → 双端口 serve。分层干净，没有一行多余依赖（纯标准库 socket/struct/threading/re）。

**细节妙处（编号清单）**：

1\. **协议常量全表**： `CLIENT_*` 能力位、 `COM_*` 命令字、lenenc 四档编码（250/0xFC/0xFD/0xFE）全部具名常量——这是一份"最小 MySQL 协议参考实现"，可以直接当学习材料。

2\. **握手构造** （ `handshake_payload` ）：协议版本 10、版本串 `26.7.0` 、thread_id 自增锁保护、scramble 固定 20× `'a'` 、auth plugin `mysql_native_password` ——每个字段的偏移都符合协议 4.1。

3\. **握手响应解析** （ `parse_handshake_response` ）： `HANDSHAKE_USER_SKIP = 4+4+1+23` 跳过 capabilities+max-packet+charset+filler，然后按 `CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA` / `CLIENT_SECURE_CONNECTION` / 旧式 NUL 三分支跳 auth 数据，再可选跳 db 名、读 plugin 名。对真实 mysqldump 发来的任何能力组合都能正确走完。

4\. **SQL 分流状态机** （ `handle_query` ）——本文件最值钱的资产，它是对 **mysqldump 启动查询序列的精确编舞**：

◦ `SHOW TABLES` → 毒结果集（正则 `\bshow\s+tables\b` ）；

◦ `SET` （排除混入 SELECT/SHOW 的情况，先于 I_S 判断，因为存在 `SET SESSION information_schema_stats_expiry` ）→ OK 包；

◦ `SELECT version()` → 回 `"26.7.0"` 维持版本一致性（防客户端版本协商报警）；

◦ `SHOW VARIABLES` / `information_schema|performance_schema|column_masking_policy` SELECT → **空结果集而非错误**——注释写明"Empty result sets (not errors) so mysqldump reaches SHOW TABLES"：错误会让 mysqldump 提前退出，只有空集能让它走到投毒点；

◦ 其余 SHOW/SELECT → **错误 1146** （"Table 'testdb.t' doesn't exist"）——对照组靠它干净退出（退出码 2、无信号），否则会踩 `dump_table` 里的空行 NULL 解引用产生假阳性崩溃（注释原话："Later SHOW/SELECT in dump_table NULL-deref on an empty row"）。  
一个函数同时伺候"让实验组崩得干净、让对照组不崩得也干净"两个相反目标，正则顺序即状态机。

5\. **双 EOF 模式**： `deprecate_eof` 按客户端能力位（ `CLIENT_DEPRECATE_EOF = 1<<24` ）决定结果集是否省略 EOF 包，且末尾统一回 EOF 头 OK 包——注释："mysqldump accepts either closer"。

6\. **载荷三段式** （ `overflow_table_name` ）： `'A'×pad + WITNESS + '` '×512。pad 下限 8192 钳制（MIN_OVERFLOW_BYTES\`），注释直接给出帧布局依据（"4KiB is absorbed by real_columns\[MAX_FIELDS\]"）。三段各司其职：填充负责贯穿、witness 负责取证签名、反引号负责写点②翻倍放大。

7\. **ColumnDefinition41 完整实现** （ `column_def` ）：catalog/schema/table/org_table 空串、charset utf8mb4=45、length 16MiB、type 0xFD VAR_STRING——真实客户端会解析每个字段，少一个都不行。

8\. **工程兜底**： `recvall` 精确读满、30s 连接超时、每连接一线程+守护线程、异常分类日志（disconnect/stub-error）、 `SO_REUSEADDR` 。

**可指摘处** （审计也要说缺点）：seq 号管理在 `handle_client` 主循环里偷懒回 1（MySQL 服务端实际按请求递增），对真实客户端碰巧可用——说明作者只以"mysqldump 接受"为标准，不是严格协议实现； `RE_SET` 先于 I_S 判断依赖正则顺序，重构时容易踩。

### 6.2 lab/poc.py（验证器）——把因果钉死的科学设计

9\. **差分对照**：3306（control，表名 `t` ）与 3307（overflow）唯一变量是表名内容。SUCCESS 三条件： `not control.crashed and overflow.crashed and saw_show_tables` ——对照组不崩、实验组崩、协议确实送达（从 stub 日志反查 `show tables` ），三脚缺一不可。

10\. **崩溃分类矩阵** （ `classify` ）： `rc<0` （Python 的 -signum 语义）、 `rc≥128` （shell 惯例）、 `stack smashing detected` （glibc SSP→SIGABRT=134 路径）、 `stack-buffer-overflow/addresssanitizer` （ASAN 路径）——一套代码兼容四种死法，迁移到任何环境都能自动归类。

11\. **前置自检**： `dump_version()` 先确认容器里真是 `mysqldump Ver 26.7.0` ，版本不符直接 FAIL——防止"镜像漂移导致假成功"。

12\. **IOC 日志流水**：每步都打 `ioc ...` 键值行， `stub-queries-tail` 回放协议对话——审计可复现。

13\. **退出码语义**： `EXIT_SIGNAL_BASE=128` ，信号表 `{4:SIGILL, 6:SIGABRT, 7:SIGBUS, 11:SIGSEGV}` 。

### 6.3 lab/run.sh + Docker（编排）

14\. **清场-重试-探测-留证-清场** 五段式： `down -v --remove-orphans` 起手清场 → 5 次指数退避 `up --build` → Python socket 探测 18600/18601 就绪 → `tee poc-last-run.txt` 留证且校验尾行格式（ `grep -qE '^(SUCCESS|FAIL) '` ）→ 无论成败 `down` 兜底。 `PIPESTATUS[0]` 取 tee 管道首段退出码——bash 冷知识正确使用。

15\. **安全姿态**：端口只发布到 `127.0.0.1:18600/18601` ； `init: true` 防 zombie；dump 容器直接用官方 `mysql:26.7.0` 镜像（ `entrypoint sleep infinity` ）只取客户端二进制， **不用作者自编译**——证据可信度设计。

16\. **可配置面全部环境变量化**： `BIND_HOST/CONTROL_PORT/OVERFLOW_PORT/OVERFLOW_BYTES/WITNESS` ——这就是第 9 节"参数即模块"的物质基础。

### 6.4 门面脚本（-Abraxas-Labs.py）

17\. **print 全局劫持**： `_builtins.print = _cprint` ——按语义前缀自动上色（SUCCESS 绿/FAIL 红/status= 青/JSON 黄），所有下游 `print` 无感获得配色。这是把"日志可读性"做成模块的取巧实现，也解释了为什么两份 Python 脚本开头有 180 行一模一样的横幅代码（复制而非 import——单文件自包含的取舍）。

18\. **横幅本身**：真彩 ANSI 渐变（12 色插值）、引号状态机双色、终端宽度自适应、 `NO_COLOR` 环境变量尊重——纯品牌展示，零功能价值，作者自己也在提交信息里自嘲 "Refactor lab code to production style"。

### 6.5 架构总评

设计上最值得学的是 **实验方法论的代码化**：对照/实验差分、前置版本自检、崩溃分类、协议送达反查、见证字符串——每个科学实验的控制变量手段都变成了代码断言。这不是"能崩就行"的脚本，是可提交给厂商的 **证据机器**。短板：协议桩不是严格实现（seq 偷懒）、横幅代码复制粘贴、单线程 stub 在高并发 dump 下会排队（无影响，实验场景单连接）。

## 漏洞类型与评分审视

• **CWE-120** （Buffer Copy without Checking Size of Input）+ **CWE-121** （Stack-based Buffer Overflow）——准确。

• **CVSS 3.1 自评 8.8**： `AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H` 。

◦ AV:N ✓ AC:L ✓ PR:N ✓（stub 不验口令）UI:R ✓（需受害者执行）S:U ✓。

◦ **质疑 C:H/I:H**：已证影响只有 A（crash）。按"已证口径"应为 `C:N/I:N/A:H` = **6.5 Medium**；8.8 隐含了"内存破坏可升级 RCE，届时机密性完整性全失"的 **潜在口径**。评分时点口径之争，报告建议引用时注明"8.8（潜在 RCE 口径）/6.5（已证 crash 口径）"。仓库自己的提交历史（先写 "Crash/File write/Privilege leftover/SQLi/RCE" 五类再收敛为 Crash）显示作者也在这个口径里挣扎过。

• **触发条件边界**：需要受害者主动执行 mysqldump 指向攻击者；对真实 mysqld（正常服务端）不可触发——这不是服务端漏洞，是客户端漏洞。

## 落地实网攻防

### 8.1 红队（授权场景）

• **用途定位**：内网横向前的"备份链路打击"与凭证收割复合模块；红队报告中作为"信任边界倒置"的绝佳演示案例。

• **部署清单**： `stub.py` 可脱离 Docker 独跑（ `BIND_HOST` 环境变量已支持）；socat/iptables 重定向把目标主机名压到桩上； `--password=` 换成真实口令即可同步收割 native 哈希。

• **边界纪律**：仓库 AGPL-3.0 + 研究授权声明（"explicit written permission"），本体只投毒不外传数据——但扩展成文件窃取/RCE 的接口是现成的，武器化边界由使用者法律自负。

### 8.2 蓝队与修复

**上游修复（README "The fix" 三条，方向正确）** 【仓库声明，本报告认可】：

1\. `getTableName` 处对表名按 `NAME_LEN` 截断/拒绝；

2\. `quote_name` 增加缓冲区长度参数，拒绝越界写（API 级修复）；

3\. `hash_key` 的 `my_stpcpy` 改有界拷贝。  
本质：把"服务端纪律"翻译成"客户端校验"—— `A hostile SHOW TABLES name is not a table.`

**运维缓解**：

• `--ssl-mode=VERIFY_IDENTITY` + 私有 CA 固定（不解决本漏洞——崩溃发生在加密通道内的应用层——但封死同家族的 MITM 类）；

• 备份作业出口白名单（只有真 DB IP 可达）；

• 备份作业独立成功校验（crash 不能静默）；

• 高价值环境用 mydumper/mariadb-dump 等替代实现过渡；

• EDR 规则：mysqldump 退出码 139/134 告警。

## 冷门但准确无误的命令语法（mysqldump 冷知识清单）

以下均为长期稳定、文档可查但实战高频遗漏的语法【已核验语义出处为 MySQL 官方文档惯例】：

| 参数  | 冷知识 |
| --- | --- |
| `--no-defaults` | 必须是 **第一个** 参数；跳过所有 my.cnf——实验环境防串味的唯一正解 |
| `--print-defaults` | 打印将被读取的全部生效配置，排障神器 |
| `--defaults-extra-file=f` | 在全局配置之后追加读取；把口令放这里而非命令行（防 ps 泄漏） |
| `--column-statistics=0` | 8.x 客户端导 5.7 老库必踩的 `Unknown table 'COLUMN_STATISTICS'` 的对症药 |
| `--set-gtid-purged=OFF` | 导入时报 `@@GLOBAL.GTID_PURGED` 干扰时的解药 |
| `--result-file=f` | 用二进制模式写文件， **避免 Windows 下 `\n` → `\r\n` 污染 dump**；比 shell 重定向安全 |
| `--skip-extended-insert` | 一行一条 INSERT——diff/grep/局部恢复友好； `--extended-insert` 默认单条巨 INSERT |
| `--hex-blob` | BLOB 十六进制编码，绕过字符集/转义损坏 |
| `--single-transaction` | InnoDB 一致性快照不锁表；与 `--lock-tables` （ `--opt` 默认含它）语义互斥，混用看谁在后 |
| `--tab=dir` | 生成 `.sql` (建表)+`.txt` (数据) 分离文件；数据走 `SELECT ... INTO OUTFILE` —— **服务端** 落盘，受 `secure_file_priv` 管控，需 FILE 权限 |
| `--routines --triggers --events` | **默认三者只含 triggers 不含 routines/events**<br><br>——备份后存储过程消失的经典事故源 |
| `--where="created<'2026-01-01'"` | 表级 WHERE 部分导出 |
| `--no-tablespaces` | 8.0.21+ 用无 PROCESS 权限账号导出不再报错 |
| `--source-data=2` | 8.0.26+ 取代 `--master-data` ，注释形式记录 binlog 坐标 |
| `--force` | SQL 错误继续（对照实验里"exit 2 不崩"就依赖错误默认中止行为） |
| `--insert-ignore`<br><br>/ `--replace` | 导入冲突时跳过/替换 |
| `--login-path` | 配合 `mysql_config_editor set --login-path=prod -u ... -p` 的混淆凭据组，命令行零明文 |
| `MYSQL_PWD`<br><br>环境变量 | 能传口令但会进 `/proc/*/environ` ，官方自己都不推荐——冷知识里的反面教材 |
| `--max-allowed-packet=1G` | 客户端缓冲上限；本漏洞场景下行长受它约束的对照组 |
| `docker compose exec -T` | `-T`<br><br>禁用 TTY——管道/捕获输出的唯一正确姿势（poc.py 在用） |
| `echo ${PIPESTATUS[0]}` | bash 取管道 **首段** 退出码（run.sh 在用）； `$?` 只给管道末段 |
| 退出码 128+N / 负 returncode | shell 与 Python subprocess 各自的"死于信号 N"编码，写崩溃分类器必须双兼容 |

## Cheatsheet：命令配方（参数 = 可编程功能模块）

### 10.1 模块映射总表

| 功能模块 | 旋钮（环境变量/参数） | 取值域与语义 |
| --- | --- | --- |
| 载荷长度 | `OVERFLOW_BYTES` | ≥8192（代码钳制）；4K 会被同帧数组吸收 |
| 内存签名 | `WITNESS` | 任意字符串，落 core dump 作 IOC |
| 拓扑  | `BIND_HOST/CONTROL_PORT/OVERFLOW_PORT` | 对照/实验双端 |
| 协议编舞 | `handle_query()`<br><br>正则分支 | 源码级模块：OK/空集/毒行/1146 四态 |
| 死亡分类 | `classify()` | 信号码/SSP 字符串/ASAN 三通道 |
| 版本钉 | `IMAGE_TAG`<br><br>/ `DUMP_VERSION` | 防"镜像漂移假成功" |
| 目标  | mysqldump 旗标 `-h/-P/-u/--password/--ssl-mode/--protocol` | 受害端注入面 |

### 10.2 帮助信息本体

门面脚本无 `argparse` —— `python3 mysql-...-Abraxas-Labs.py --help` 会原样透传给 `run.sh` （不识别）。 **本包的帮助面 = `lab/` 环境变量表 + mysqldump 原生 `--help`**。受害端命令行（poc.py 的标准构造）：

```
mysqldump --protocol=TCP --ssl-mode=DISABLED -h stub -P <port> -u root --password= testdb
```

`mysqldump --help` 的骨架（供速查，非全文）：Usage 行 + `--no-defaults/--print-defaults/--defaults-*-file` + 连接组（ `-h -P -u -p --protocol --ssl-mode --max-allowed-packet --net-buffer-length` ）+ 输出控制组（ `--add-drop-table --extended-insert --skip-extended-insert --hex-blob --result-file --tab` ）+ 行为组（ `--opt --skip-opt --quick --single-transaction --lock-tables --force --where --ignore-table` ）+ 对象组（ `--all-databases --databases --routines --triggers --events --no-data --no-create-info` ）+ 复制组（ `--source-data --set-gtid-purged` ）。

### 10.3 配方（全部为授权实验语境）

**R1 · 基线复现**

```bash
git clone https://github.com/abraxas/mysql-mysqldump-show-tables-overflow
```

```
cd mysql-mysqldump-show-tables-overflow/lab && ./run.sh
```

\# 预期尾行: SUCCESS... overflow-signal=SIGSEGV... WITNESS

**R2 · 长度二分——找出"帧吸收阈值"（参数批量注入）**

```
cd lab
```

```
for LEN in 386 1024 4096 8192 16384 32768 65536; do
```

```
OVERFLOW_BYTES=$LEN docker compose -p vc$LEN up --build -d
```

```
sleep 3
```

```bash
docker compose -p vc$LENexec -T dump \
```

```
mysqldump --protocol=TCP --ssl-mode=DISABLED -h stub -P 3307 -u root --password= testdb \
```

```
>/dev/null 2>&1
```

```
rc=$?
```

```
echo"$LEN,$rc,$(( rc==139 ? 'SEGV' : rc==134 ? 'ABORT' : 'clean' ))" >> threshold.csv
```

```bash
docker compose -p vc$LEN down -v
```

```
done
```

column -t -s, threshold.csv # 期望: 4096 行 clean → 8192 起进入死亡区

**R3 · core dump 取证 witness**

```bash
docker compose -p BASE exec -T dump bash -c 'ulimit -c unlimited; \
```

```
mysqldump --protocol=TCP --ssl-mode=DISABLED -h stub -P 3307 -u root --password= testdb' \
```

```
; ls core.*
```

```bash
docker compose -p BASE cp dump:/core . 2>/dev/null || docker cp ...:
```

strings core.\* | grep -a WITNESS # 命中: MYSQL-DUMP-SHOW-TABLES-OVERFLOW-WITNESS

**R4 · strace 系统调用旁证（证明死亡是页错误不是 syscall）**

```bash
docker compose -p BASE exec -T dump sh -c \
```

```
'strace -f -e trace=network,write -o /tmp/st.txt \
```

```
mysqldump --protocol=TCP --ssl-mode=DISABLED -h stub -P 3307 -u root --password= testdb'
```

tail -5 /tmp/st.txt # 尾部: write→SIGSEGV 无辜收场; 全程无 execve/异常 write

**R5 · gdb 批量栈回溯（需要 SYS_PTRACE）**

```bash
docker run --rm -it --cap-add=SYS_PTRACE --network <BASE>_default mysql:26.7.0 bash -c '
```

```bash
apt-get update -qq && apt-get install -y -qq gdb >/dev/null &&
```

```
gdb -batch -ex "run --protocol=TCP --ssl-mode=DISABLED -h stub -P 3307 -u root --password= testdb" \
```

```
-ex "bt full" -ex "info registers rip rsp rbp" \
```

```
--args mysqldump'
```

\# 期望: Program received SIGSEGV / 回溯断在 dump_all_tables_in_db 或其下层拷贝循环

**R6 · Wireshark 网络取证**

捕获过滤: tcp port 18601显示过滤: mysql.query contains "show tables" # 定位投毒点指纹规则: mysql 登录成功后单帧结果集长度 > 60000 → 告警

**R7 · 无 Docker 裸奔版（快速演示）**

pip3 install nothing && python3 lab/stub.py & # 依赖纯标准库

```
BIND_HOST=127.0.0.1 CONTROL_PORT=13306 OVERFLOW_PORT=13307 python3 lab/stub.py &
```

```
mysqldump --protocol=TCP --ssl-mode=DISABLED -h 127.0.0.1 -P 13307 -u root --password= testdb; echo $?   # 139
```

**R8 · 蓝队金丝雀（双断言 CI）**

```bash
#!/usr/bin/env bash
```

\# cron 每 6h: 对照必须 rc=2, 溢出必须 rc=139, 双断言任一偏离即告警

```
./run.sh >/dev/null 2>&1; rc=$?
```

```
grep -q "SUCCESS .*overflow-signal=SIGSEGV" poc-last-run.txt || { alert "lab-broken rc=$rc"; }
```

\# 若某天 rc 突然变成 0 或 134 → 客户端版本变化/环境变化,先行排查

**R9 · 载荷动态注入（WITNESS 随机化追踪不同受害源）**

```
W="WITNESS-$(hostname)-$(date +%s)"
```

```
WITNESS=$W OVERFLOW_BYTES=65536 docker compose -p hunt up --build -d
```

\# 每个受害者源用独立 WITNESS,core dump 里 grep 即溯源

**R10 · stub 扩展为通用恶意服务端骨架（研究方向接口）**  
在 `handle_query()` 加分支即可接入同族研究：

if re.search(r"local\\s+infile", q_l): # 同家族: 文件窃取分支(需客户端 allow-local-infile)

```
...
```

——仓库没实现，但状态机结构上是即插即用的；这同时是蓝队排查 rogue server 的检查点。

**R11 · 一键起停模板（现场纪律）**

```
alias labup='cd /path/lab && COMPOSE_PROJECT_NAME=$(date +%s)-lab docker compose up --build -d'
```

```
alias labdn='docker compose -p $(docker compose ls -q | head -1) down -v --remove-orphans'
```

**R12 · 协议对话回放（审计用）**

```
grep -E 'query |init_db |handshake ' <(docker compose -p BASE logs stub) | tail -30
```

\# 对着 poc.py 的 RE\_\* 分支逐条核对: SET→OK, SHOW VARIABLES→空集, show tables→毒行

## AI 辅助头脑风暴与多版本对比

把"如何构建这类恶意服务端型 PoC 平台"当作设计题，AI 辅助生成三个候选并对比（结论标注仓库实际采纳了哪个）：

| 维度  | 方案 A：单文件桩+命令行参数 | 方案 B：容器差分对照台 ★仓库采纳 | 方案 C：协议模糊测试框架（boofuzz 扩展） |
| --- | --- | --- | --- |
| 因果可证性 | 弱（只有实验组，崩溃可能被归因环境） | **强**<br><br>（对照/实验双端，三条件 SUCCESS） | 中（fuzz 无对照概念） |
| 可移植性 | 强（一个 py 文件） | 强（docker compose 全托管） | 弱（依赖链长） |
| 面向厂商披露 | 弱（证据链不完整） | **强**<br><br>（版本自检+IOC 流水+留证文件） | 中   |
| 可扩展性 | 低（改载荷改源码） | 中（环境变量+正则分支） | **高**<br><br>（任意字段变异） |
| 建设成本 | 极低  | 低（半日） | 高（数周） |
| 蓝队复用 | 低   | 高（金丝雀/检测规则直接派生） | 中   |
| 适配场景 | 快速验证想法 | **负责任披露 & 教学** | 探索未知缺陷面 |

**迭代实录对照** （仓库 git 历史，一天四提交）：初始研究（≈方案 A 形态）→ 补类别标注 → 补 Reach 标注 → `Refactor lab code to production style` （收敛为方案 B）。README 的 "Wrong turns" 段落（真 mysqld 做 oracle / 4KiB 吸收 / 全树 ASan / 误称 IP 控制）就是 A→B 路径上被淘汰分支的化石记录。

**载荷设计三个变体的对比** （为什么是"A×pad + WITNESS + 反引号×512"）：

| 变体  | 写点①hash_key | 写点②table_buff | 取证性 |
| --- | --- | --- | --- |
| 纯长名 | ✓   | ✓（无放大） | 差（内存里没有可辨识签名） |
| 长名+字典词 | ✓   | ✓   | 中（词易撞库） |
| 长名+WITNESS+反引号尾 ★ | ✓   | ✓ **翻倍放大** | **强**<br><br>（唯一字符串+已知放大行为） |

**AI 辅助的价值点复盘** （本报告生产过程即样本）：把 stub 的正则状态机翻译成"mysqldump 查询序列编舞"的表述、把 139/134 的分歧还原成"SSP 返回时检查 vs 拷贝中越界"的机制解释、CVSS 口径双算——这三处是机器辅助放大了人类审计的深度；而 CVE 编号核实环节机器初稿把 CVE-2024-10979 错挂在 pg_dump 下，被联网检索纠正—— **AI 产出必须过一手证据关**，这条纪律写进了本报告的证据分级约定。

## 问题分析与任务拆解复盘

本报告的生产流水线（供复用）：

① 对象定性 读 README + 全文件清单 → 判定"PoC 包"而非"工具" → 修正审计框架② 一手对证 官方 mysql-26.7.0 标签存在性(SHA) → mysqldump.cc/mysql_com.h/libmysql.cc 逐行比对③ 机制还原 两写点代码 → 栈帧布局 → stpcpy 实现 → 页错误 → 信号 → 退出码,五层链④ 历史定位 恶意服务端类谱系联网核实(BACKRONYM/rogue server/pg_dump 系),含一次勘误(10979)⑤ 工程审计 逐文件细节清单 + 架构评价(优点/可指摘处并列)⑥ 落地转化 红队攻击链定位 + 蓝队检测点 + cheatsheet 12 配方(参数=模块)⑦ 方法沉淀 三方案对比 + 载荷三变体对比 + 证据分级约定⑧ 卫生清理 下载物删除(见文末执行记录)

**任务拆解中沉淀的三条审计纪律**：一手源码永远优先于仓库转述（本次发现 README 未提的 `+len(db)+1` 写入偏移）；机器产出必须过检索关（CVE-2024-10979 勘误）；负结果与未验证项显式声明（见第 14 节）。

## 骚操作 Top 8（速览收编）

1\. **对照组设计**：一个 stub 监听两端口，唯一变量是表名——差分法把"崩溃归因"钉死到协议字段级。

2\. **正则编舞状态机**：OK/空集/毒行/1146 四态精确伺候 mysqldump 的启动查询序列，让实验组"崩得干净"、对照组"不崩得也干净"。

3\. **反引号放大尾巴**：利用 `quote_name` 转义翻倍，一份载荷双写点收益，512 字节输入换 1024 字节写入。

4\. **帧布局算命**： `real_columns[4000]` 吸收 4KiB 的实测结论直接写进载荷下限（ `MIN_OVERFLOW_BYTES=8192` ），wrong turns 变成配置常量。

5\. **WITNESS 内存签名**：载荷里埋漏洞全名， `strings core` 一发入魂，溯源与免责双重用途。

6\. **print 劫持配色**： `_builtins.print` 全局替换，SUCCESS/FAIL/JSON 自动上色——19 行代码换全项目日志基建。

7\. **退出码双语分类器**：shell 128+N 与 Python 负 returncode 同帧兼容，外加 glibc SSP/ASAN 字符串兜底。

8\. **诚实工程**： `No RIP payload` 、 `no CVE yet` 、wrong turns 公开——研究诚信本身就是这个仓库最骚的操作。

## 证据边界与未决问题

• **未实际运行 docker lab**：本报告在 Windows 审计环境完成静态审计与官方源码比对； `overflow-rc=139 / control-rc=2 / SUCCESS` 等实验观察值转述自仓库 README【仓库声明】。R1-R12 配方交付即用，但复现数据以你环境实测为准。

• **`mysql:26.7.0` Docker Hub 镜像**：官方 GitHub 标签已核验存在；镜像 tag 未独立核验【未核验】。

• **`SYSTEM_CHARSET_MBMAXLEN=3`**： `NAME_LEN = NAME_CHAR_LEN × SYSTEM_CHARSET_MBMAXLEN` （mysql_com.h:67）已核验；乘数取值 3 与 README/公开文档一致，m_ctype.h 逐字抓取因网络中断未完成【部分核验】。

• **CVE 状态**：作者声明 no CVE yet。历史 CVE 编号（3152/2047/7348/8715/10979）均经检索核实，其中 10979 做了勘误（PL/Perl，非 pg_dump）。

• **RCE 可行性**：仓库与本报��一致结论——crash 已证，RCE 未证，升级路径存在理论通道（canary/PIE 泄漏原语缺失）。

• **CVSS 口径**：8.8 为作者潜在口径，本报告补充已证口径 6.5，引用时请双标。

## 参考与出处

**研究对象**

• https://github.com/abraxas/mysql-mysqldump-show-tables-overflow （AGPL-3.0，4 commits @ 2026-10-06）

**官方源码（本报告一手证据）**

• https://github.com/mysql/mysql-server/tree/mysql-26.7.0 （SHA `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8` 【已核验】）

• `client/mysqldump.cc` （ `getTableName`:4671 / `quote_name`:2047 / `dump_table`:4195 / `dump_all_tables_in_db`:5213 / `MAX_FIELDS`:103）

• `include/mysql_com.h` （ `NAME_CHAR_LEN`:60 / `NAME_LEN`:67）

• `libmysql/libmysql.cc` （ `mysql_list_tables`:733）

**历史谱系（检索核实）**

• CVE-2015-3152 (BACKRONYM)：CVE Record · backronym.fail · F5 K16845

• CVE-2016-2047（客户端证书主机名校验缺失）：NVD · Red Hat

• CVE-2024-7348（pg_dump TOCTOU）：NVD · PostgreSQL · Rapid7

• CVE-2025-8715（pg_dump/restore RCE）：NVD

• CVE-2024-10979 勘误（PL/Perl，非 pg_dump）：PostgreSQL

• Rogue MySQL Server 家族：su18.org - JDBC Connection URL Attack · pyn3rd - Make JDBC Attacks Great Again · Security Affairs 2019

*报告完 · 全文基于授权研究语境 · 请勿对未授权系统使用文中任何技术*
