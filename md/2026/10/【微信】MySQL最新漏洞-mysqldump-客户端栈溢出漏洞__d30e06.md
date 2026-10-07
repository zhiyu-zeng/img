---
title: 【微信】MySQL最新漏洞 mysqldump 客户端栈溢出漏洞
source: https://mp.weixin.qq.com/s/Fr-YDlLIfd3nokcNo5OUuw
source_host: mp.weixin.qq.com
clip_date: 2026-10-07T09:55:49+08:00
trace_id: 0a92d088-5d89-4bcb-a641-39fdf9910573
content_hash: 63c6bc9986a9cdc3514cb328fe06a072c48fceae7eac41f49a29cbdabf751777
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: MySQL 26.7.0 的 mysqldump 解析服务端 SHOW TABLES 应答时缺少边界检查，恶意 MySQL 服务器可发超长表名使其栈溢出并稳定 SIGSEGV 崩溃。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3f275244-d011-8196-b340-dbafd69c0080
ioc:
  cves: []
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
> MySQL 26.7.0 的 mysqldump 解析服务端 SHOW TABLES 应答时缺少边界检查，恶意 MySQL 服务器可发超长表名使其栈溢出并稳定 SIGSEGV 崩溃。
> 
> - **漏洞定性：** CWE-120/121 栈缓冲区溢出（无界拷贝），CVSS 8.8 High，CVE 暂未分配，仅影响 MySQL Community Server 26.7.0 的 mysqldump 客户端。
> - **成因链条：** `getTableName` 用 `mysql_fetch_row` 原样返回协议列值；`my_stpcpy` 拷进 386 字节的 `hash_key[2*NAME_LEN+2]`；`quote_name` 再逐字节写入 387 字节的 `table_buff[NAME_LEN+3]`，三处均无长度校验。
> - **攻击模型：** 反向攻击面——受害者主动把 mysqldump 连到攻击者控制的 MySQL，服务端回 65536 字节表名；攻击者不可控 RIP，危害是备份脚本、CI/CD、迁移工具等进程被反复打崩。
> - **PoC 要点：** 恶意 stub 同时监听 3306（正常应答）与 3307（超长表名），docker-compose 跑 `./run.sh`；溢出信号为 rc=139（128+11 SIGSEGV）；必须用 stub 而非真 mysqld，且 4KiB 溢出不够、需 64KiB 才能跨过含 `real_columns[4096]` 的栈帧。
> - **修复方向：** `getTableName` 按 NAME_LEN 截断、`quote_name` 传入 buffer 尾指针判断、`my_stpcpy` 换 `my_stpncpy`、协议层校验标识符长度；官方补丁未出。

**黑白之道** *2026年10月7日 09:30*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：MySQL 服务端漏洞满天飞，但客户端工具的洞常被忽略。安全研究员 abraxas_null（@abraxas_null）今天披露：MySQL Community Server 26.7.0 的 mysqldump 在解析服务器返回的 SHOW TABLES 应答时， **客户端自己没做长度校验**。攻击模型是反向的——受害者把 mysqldump 连到攻击者控制的 MySQL 服务器，服务器回一个 64KB 的表名，dump 进程当场 SIGSEGV 崩掉。攻击不可控 RIP，但能稳定让备份脚本和自动化运维进程瘫痪。

* * *

## 一、漏洞全貌

| 字段  | 值   |
| --- | --- |
| 漏洞名 | mysql-mysqldump-show-tables-overflow |
| CWE | CWE-120 缓冲区溢出（无界拷贝） / CWE-121 栈溢出 |
| CVSS | **8.8 High**<br><br>（AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H） |
| 产品  | MySQL Community Server `mysqldump` |
| 影响版本 | **26.7.0**<br><br>（commit `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8` ） |
| CVE | 暂未分配 |
| 认证要求 | 受害者主动跑 `mysqldump` 指向攻击者 MySQL |
| 利用后果 | 稳定的 SIGSEGV 崩溃 dump 进程；未证明可控 RIP |
| 许可证 | AGPL-3.0（PoC 公开） |
| 披露日期 | 2026-10-07（Twitter @abraxas_null） |

* * *

## 二、漏洞根源：三个手写缓冲区函数都没做边界检查

漏洞出在 `client/mysqldump.cc` 里三个互相串联的函数，每个都没做边界检查。

### 2.1 getTableName：原样吃下协议返回值

```cpp
static char *getTableName(int reset) {
  static MYSQL_RES *res = nullptr;
  MYSQL_ROW row;
  if (!res) {
    if (!(res = mysql_list_tables(mysql, NullS))) return (nullptr);
  }
  if ((row = mysql_fetch_row(res))) return ((char *)row[0]);
}
```

`mysql_fetch_row` 把 MySQL 协议应答里那一列字符串原样返回， **没看长度**。真实的 `mysqld` 服务端不会发超过 64 字符的标识符（这是 SQL 标准），但客户端默认信任了"服务端是诚实的"。

### 2.2 dump_all_tables_in_db：my_stpcpy 进 386 字节栈

```
static char hash_key[2*NAME_LEN+2];   // 386 bytes
// ...
my_stpcpy(hash_key, table_name);
```

`NAME_LEN = 64 * 3 = 192` ，所以 `hash_key` 是 386 字节。 `my_stpcpy` 是 MySQL 自己写的 strcpy， **无界**——只要 table_name 长度超过 386，下一行栈帧就开始被覆盖。

### 2.3 quote_name：写进 387 字节栈 buffer

```cpp
static char *quote_name(char *name, char *buff, bool force) {
  char *to = buff;
  const char qtype = ansi_quotes_mode ? '"' : '`';
  if (!force && !opt_quoted && !test_if_special_chars(name)) return name;
  *to++ = qtype;
  while (*name) {
    if (*name == qtype) *to++ = qtype;
    *to++ = *name++;
  }
```

`table_buff[NAME_LEN+3]` 是 387 字节， `quote_name` 一个字节一个字节拷过去也不查边界。攻击者发 64KiB 表名，能一路写到返回地址之后几个栈帧。

### 2.4 整条链路

```
攻击者 MySQL 服务器 ──SHOW TABLES 应答──> mysqldump 客户端
                                              ↓
                              mysql_fetch_row() 拿原始字节
                                              ↓
                              my_stpcpy 进 hash_key[386]
                                              ↓
                              quote_name 写进 table_buff[387]
                                              ↓
                                       SIGSEGV
```

* * *

## 三、攻击模型：客户端的反向被攻击面

这个洞和常规 Web 服务漏洞思路完全不同—— **被攻击的是客户端进程，攻击者控制的是服务端**。符合这个模型的所有场景都是潜在受害面：

-   **自动化备份脚本**— `mysqldump --host=db.example` 跑在 crontab 里，连接信息被攻击者替换过（DNS 劫持、hosts 注入、配置文件污染）
    
-   **CI/CD 拉数据库备份**— `mysqldump` 接临时构建环境里的 MySQL 做 snapshot
    
-   **数据库迁移工具**— 第三方 MySQL 服务（云厂商镜像、共享数据库实例）
    
-   **运维手工失误**— 工程师 `mysqldump testdb` 接错 IP，连到攻击者网络
    

尤其第一类最危险——CI/CD 流水线每天自动 dump 几十次，没人盯着崩没崩。

* * *

## 四、PoC 验证：abraxas 公开了完整 lab

abraxas 在 GitHub 公开了完整可跑的 PoC（AGPL-3.0），核心结构：

-   **`lab/stub.py`**— Python 写的恶意 MySQL 协议服务器
    

-   监听 3306（control，应答正常但不发表名让 mysqldump 触发 SQL 1146 错误退出码 2）
    
-   监听 3307（overflow，应答含一个 65536 字节表名的 `SHOW TABLES` ）
    

-   **`lab/poc.py`**— 编排 mysqldump 客户端分别连两个端口，打印崩溃证据
    
-   **`lab/docker-compose.yml`**— 编排 stub 容器 + `mysql:26.7.0` dump 容器
    
-   **`lab/run.sh`**— 一键启停、自动验证崩溃、自动清理
    
-   **`lab/Dockerfile`**— stub 的容器镜像构建
    
-   **`mysql-mysqldump-show-tables-overflow-Abraxas-Labs.py`**— 主入口 PoC（不用 docker 直接跑的版本）
    

跑法只有三行：

```bash
git clone https://github.com/abraxas/mysql-mysqldump-show-tables-overflow
cd mysql-mysqldump-show-tables-overflow/lab
./run.sh
```

预期输出：

```
control-rc=2 control-signal=0
overflow-rc=139 overflow-signal=SIGSEGV
SUCCESS mysql-mysqldump-show-tables-overflow ... MYSQL-DUMP-SHOW-TABLES-OVERFLOW-WITNESS
```

`139 = 128 + 11 (SIGSEGV)` ，Linux 信号编码。

* * *

## 五、abraxas 自己也踩过的坑

PoC README 里 abraxas 详细记录了他 31 次源码扫描里的"绕弯路"，对后来挖同类洞的研究员很有参考价值：

1.  **把 Early Access 当 GA**— `26.10.0` 看起来像"latest"，其实是 EA； `26.7.1` 看起来像 CPU Patch，其实是 image tag 没对应完整源码
    
2.  **拿真实 mysqld 当 oracle**— 真实服务端的标识符上限是 64 字符，永远发不出 193+ 字节的表名。所以攻击场景必须用 stub，不能用真 mysqld
    
3.  **4KiB 不够大**— `dump_all_tables_in_db` 里 `real_columns[MAX_FIELDS]` （4096 个 bool）和 `hash_key[386]` 在同一个栈帧上。几 KB 溢出落到 bool 数组里，lock-tables 循环还没用到， **没有信号**。64KiB 才能走过这个 frame 触发 SIGSEGV
    
4.  **没 ASan 也能证**— 官方 `mysql:26.7.0` 镜像本身就有栈内存保护，SIGSEGV 本身就是崩溃证据；非要把 mysqldump 整个项目 ASan 编译一遍是 day-scale 浪费
    
5.  **没拿到 RIP 不算 RCE**— MariaDB 历史上同类 `quote_name` 模式洞有人声称拿到了指令指针控制，他没复现， **所以这个 PoC 只证崩溃，不证 RCE**
    

这些踩坑记录对想跟这条线的研究员价值极高——尤其是第 2、3 条，决定了 PoC 是否能跑出预期信号。

* * *

## 六、修复方案

abraxas 自己给出的修复建议（按文件改）：

1.  **`getTableName` 加 `NAME_LEN` 上限截断**— 超过直接返回 NULL 或跳过这张表
    
2.  **`quote_name` 加 buff 长度参数，循环里 `if (to >= buff_end) break;`**
    
3.  **`my_stpcpy` 改成 `my_stpncpy` ，接 `hash_key` 的剩余空间**
    
4.  **协议层加防御**— MySQL 协议层返回列值时校验 SQL 标识符长度，超长直接 1146 错误
    

官方补丁目前还没出，社区在等 MySQL CPU。

* * *

## 七、红队视角：能拿来干什么

### 7.1 攻击者角度

-   **CI/CD 流水线瘫痪**— 给目标公司的 build farm 注入假 MySQL 端点（DNS rebinding / SSRF），dump 进程每天崩一次让运维怀疑人生
    
-   **供应链钓鱼**— 仿冒一个"免费 MySQL 数据库镜像"服务，等自动化备份工具来连然后崩
    
-   **取证对抗**— 攻击者入侵完主机后留一个伪 MySQL，让应急响应工具 dump 时崩溃，延迟响应
    

### 7.2 防御方角度

-   **审计 mysqldump 调用链**— CI/CD、cron、备份工具里所有指向外部 host 的 mysqldump 都要审计
    
-   **mysqldump 升级**— 26.7.0 之后等官方 CPU Patch；当前可临时把 mysqldump 替换成 `mysql --batch -e "SHOW TABLES" | xargs ...` 这种间接路径
    
-   **网络层防御**— 数据库备份走专用 VPC + 安全组，不暴露公网；DNS 锁定，不允许解析到陌生 IP
    

* * *

## 八、思考题

1.  同样的"客户端信任服务端协议返回值"模式， **PostgreSQL `pg_basebackup` 跟随恶意路径**、 **Redis `redis-cli` 跟随恶意响应**、 **MongoDB `mongodump` 跟随恶意应答**——分别有什么历史 CVE？
    
2.  为什么 abraxas 的 PoC 选 64KiB 而不是更大？背后的栈帧布局是什么？能不能用 GDB 在 mysqldump 里 `disas quote_name` 反推栈布局？
    
3.  如果 `mysqldump` 加了 `--ssl-mode=VERIFY_CA` 、强制证书校验，攻击者还能不能伪造服务端？为什么？
    
4.  这类"客户端反向被攻击"模型在 OSS 漏洞数据库里有没有统一分类？CWE 给了什么参考？
    

* * *

## 九、附录：素材与 PoC

### 原文出处

-   Twitter 原文：https://x.com/abraxas_null/status/2107518588039106984
    
-   详细 Write-up：https://abraxaslabs.tech/research/mysql-mysqldump-show-tables-overflow
    
-   PoC GitHub：https://github.com/abraxas/mysql-mysqldump-show-tables-overflow
    

### PoC 使用方式

```bash
# 克隆 PoC 仓库
git clone https://github.com/abraxas/mysql-mysqldump-show-tables-overflow
cd mysql-mysqldump-show-tables-overflow/lab

# 一键跑（需要 Docker / Docker Compose）
./run.sh

# 不用 docker 直接跑的版本
cd ..
python3 mysql-mysqldump-show-tables-overflow-Abraxas-Labs.py
```

### 关键源码位置（MySQL 26.7.0）

-   `client/mysqldump.cc` — `getTableName` 、 `quote_name` 、 `dump_all_tables_in_db`
    
-   `include/mysql_com.h` — `NAME_LEN` 定义
    
-   `libmysql/libmysql.cc` — `mysql_list_tables` 实现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)
    

* * *

> 👇 点击，访问我的网站

* * *

漏洞专题 · 目录
