---
title: 【微信】应急响应：linux中常用的日志文件
source: https://mp.weixin.qq.com/s/YyzlNRmzCGGIr-qM2keiGw
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T11:31:23+08:00
trace_id: b409e4ee-d732-4d23-8943-220d005921fe
content_hash: e197d5d60432c44b2910adebbed1943be56a1ca87f990fd56c39e1955858e239
status: synced
tags:
  - 微信
  - Linux安全
  - 应急响应
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Linux 应急响应需分层取证：认证域 secure、系统调用域 auditd、调度域 cron、二进制登录日志与 bash_history 各有覆盖面与盲区，需交叉验证。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40f75244-d011-81ae-b4a6-d780f6db7673
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Linux 应急响应需分层取证：认证域 secure、系统调用域 auditd、调度域 cron、二进制登录日志与 bash_history 各有覆盖面与盲区，需交叉验证。
> 
> - **secure 局限：** `/var/log/secure` 只记录认证与授权事件（SSH 登录、sudo 提权、useradd 建户），反弹 shell、Web RCE 等绕过认证获得会话的行为不留痕；排查爆破先统计 Failed password 攻击源 IP，再交叉验证同源 Accepted 记录，一旦出现即判定失陷。
> - **auditd 价值：** 基于内核审计子系统按 `/etc/audit/rules.d/` 规则记录 execve、connect、setuid 等系统调用，能还原攻击者敲的命令与反弹 shell 外连；可见性完全取决于规则配置，查询用 `ausearch -i`，汇总用 `aureport`。
> - **cron 排查：** `/var/log/cron` 只记录“任务被调度”（6 字段含执行用户与命令），不记录执行结果；grep curl/wget/bash//tmp//dev/shm 等特征可发现持久化后门，可疑命令以 (root) 身份运行需立即上调威胁等级，日志出现时间空白段本身即疑点。
> - **登录日志：** wtmp/btmp/lastlog/utmp 均为二进制，须用 last/lastb/lastlog/who 读取；致命信号是同源 IP 在 btmp 大量失败后出现 wtmp 成功记录，`last -x` 还可锚定入侵后重启的时间线。
> - **bash_history：** 信息最丰富但最不可靠——默认无时间戳、shell 正常退出才一次性落盘、可被 history -c 清除；若可疑 shell 进程仍存活，可用 Volatility 的 linux_bash 插件从内存找回被删记录。

**信安路漫漫** *2026年11月5日 07:00*

## 01前言

在日常的应急处理过程中，要结合系统各种日志来排查该告警是真实告警还是误报。本篇文章就来看看linux中常见的一些日志，以及其作用，目的是为了在应急响应时可以快速的找到排查目标

## 02linux中常见的日志

目前linux的大部分系统日志都是在目录 `/var/log/` 中，常用的日志有下面的这些

示例 · TEXT

```swift
/var/log/messages — 包括整体系统信息，其中也包含系统启动期间的日志。此外，mail，cron，daemon，kern和auth等内容也记录在var/log/messages日志中。
/var/log/dmesg — 包含内核缓冲信息（kernel ring buffer）。在系统启动时，会在屏幕上显示许多与硬件有关的信息。可以用dmesg查看它们。
/var/log/boot.log — 包含系统启动时的日志。
/var/log/dpkg.log – 包括安装或dpkg命令清除软件包的日志。
/var/log/lastlog — 记录所有用户的最近信息。这不是一个ASCII文件，因此需要用lastlog命令查看内容。
/var/log/maillog /var/log/mail.log — 包含来着系统运行电子邮件服务器的日志信息。例如，sendmail日志信息就全部送到这个文件中。
/var/log/user.log — 记录所有等级用户信息的日志。
/var/log/alternatives.log – 更新替代信息都记录在这个文件中。
/var/log/btmp – 记录所有失败登录信息。使用last命令可以查看btmp文件。例如，”last -f /var/log/btmp | more“。
/var/log/cups — 涉及所有打印信息的日志。
/var/log/anaconda.log — 在安装Linux时，所有安装信息都储存在这个文件中。
/var/log/yum.log — 包含使用yum安装的软件包信息。
/var/log/cron — 每当cron进程开始一个工作时，就会将相关信息记录在这个文件中。
/var/log/secure — 包含验证和授权方面信息。例如，sshd会将所有信息记录（其中包括失败登录）在这里。
/var/log/wtmp或/var/log/utmp — 包含登录信息。使用wtmp可以找出谁正在登陆进入系统，谁使用命令显示这个文件或信息等。
/var/log/faillog – 包含用户登录失败信息。此外，错误登录命令也会记录在本文件中。
/var/log/audit/  - 包含命令执行，文件操作等的审计日志
```

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b9a2bb331b9cba9.png)

图 01

接下来我们看一下linux系统中常见的一些系统日志，以及他们在排查中的作用

## 03安全日志：/var/log/secure

该日志文件专门聚焦于 **身份验证和权限变更** 的环节，主要涵盖以下事件：

-   **用户登录与注销**：无论是通过 SSH、本地控制台还是其他方式，登录的 **成功与失败** 尝试都会被记录。
    
-   **权限提升（提权）**：使用 `sudo` 或 `su` 切换到高权限用户（尤其是 root）的行为，其执行的 **具体命令** 会被完整记录。
    
-   **账户状态变更**：账户的锁定、解锁，以及密码修改等操作。
    
-   **PAM 相关事件**：由可插拔认证模块（PAM）产生的错误和警告信息。
    
-   **其他安全事件**：如 `useradd` 创建新用户、 `groupadd` 创建新用户组等。
    
-   出于安全考虑， **默认仅 root 用户可读**
    

它记录的是 **认证与授权事件**，而不是“访问”或“代码执行”事件。只要攻击者 **没有通过系统的认证机制（如 SSH、本地终端、** `su` **/** `sudo` **登录）获得一个“登录会话”**， `/var/log/secure` 中就不会出现任何与之相关的记录，也就是命令执行和反弹shell获取到shell是不会记录的

### 常见的日志格式

`/var/log/secure` 遵循标准的 syslog 格式，每一行通常由 **四列** 构成：

-   **时间戳**：事件发生的日期和时间（如 `Oct 10 10:00:01` ）。
    
-   **主机名**：产生日志的服务器主机名。
    
-   **服务/程序名\[PID\]**：产生事件的程序及其进程 ID（如 `sshd[12345]` 、 `sudo:`）。
    
-   **事件具体信息**：日志的核心内容，描述了具体发生了什么。
    

| 事件类型 | 日志示例（节选） | 解读要点 |
| --- | --- | --- |
| **SSH 登录成功** | `sshd[12345]: Accepted password for username from 192.168.1.100 port 12345 ssh2` | 用户 `username` 从 IP `192.168.1.100` 通过 **密码** 成功登录。若使用密钥，则显示 `Accepted publickey` |
| **SSH 登录失败** | `sshd[12346]: Failed password for username from 192.168.1.100 port 12346 ssh2` | 上述用户从同一 IP 尝试密码登录 **失败**。若用户不存在，会显示 `invalid user` |
| ```<br>sudo 提权<br>``` | `sudo: username : TTY=pts/0 ; PWD=/home/username ; USER=root ; COMMAND=/bin/ls /root` | 用户 `username` 在终端 `pts/0` 下， **以 root 身份** 执行了 `/bin/ls/root` 命令。<br><br>`COMMAND` **字段是关键线索**。 |
| **会话打开** | `pam_unix(sshd:session): session opened for user root by (uid=0)` | 用户 `root` 的会话被成功打开，通常紧随登录成功日志出现。 |
| **用户/组创建** | `useradd[1661]: new user: name=bb, UID=501, GID=501...` | 系统中新建了一个名为 `bb` 的用户，UID 为 501。 |

### 在应急排查中的核心作用

`/var/log/secure` 是判断系统是否遭遇 **账户入侵** 和 **暴力破解** 的首要证据来源。其排查逻辑通常围绕以下场景展开：

### 场景一：确认是否遭受 SSH 暴力破解

攻击的典型特征是 **短时间内出现大量来自同一或不同 IP 的“Failed password”记录**。

### 1\. 统计攻击源 IP（找出“凶手”）

示例 · BASH

```bash
bash
grep "Failed password" /var/log/secure | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr | head
```

*命令解读*：提取所有失败登录记录中的 IP 地址字段（ `$(NF-3)` 或 `$11` 均可），排序后统计频次，列出尝试次数最多的 IP。输出结果可能显示某个 IP 尝试了数十万次登录。

### 2\. 检查是否有爆破成功的迹象（最关键的一步）

在确认存在大量失败记录后， **必须立即检索是否有来自同一攻击源的成功登录**。这是判断系统是否已被攻陷的转折点。

示例 · BASH

```
bash
grep "Accepted" /var/log/secure | grep "<攻击源IP>"
```

如果上述命令有输出，意味着攻击者 **已经成功猜解出密码或密钥**，系统应被视为已失陷，需立即启动入侵响应流程。

### 3\. 确认攻击的时间范围与目标账户

示例 · BASH

```bash
# 查看爆破的起止时间
grep "Failed password" /var/log/secure | head -1
grep "Failed password" /var/log/secure | tail -1

# 统计被尝试爆破的用户名
grep "Failed password" /var/log/secure | grep -oP 'for \K[^ ]+' | sort | uniq -c | sort -nr
```

这有助于了解攻击的持续时间和攻击者针对的账户（如 root 或常见系统账户）。

### 场景二：审计异常权限提升（sudo）行为

攻击者在获得初始立足点后，通常会尝试提权。 `/var/log/secure` 中的 `sudo` 记录可以揭示这一点。

**排查要点：**

-   **异常用户提权**：一个平时不使用的服务账户突然出现 `sudo` 成功记录。
    
-   **异常命令执行**： `COMMAND` 字段显示执行了敏感操作，如 `cat /etc/shadow` 、 `useradd` 、修改 `authorized_keys` 等。
    
-   **异常时间与终端**：提权发生在非运维时段，或来自不常见的 `TTY` （如非交互式的 `?`）。
    

示例 · BASH

```
# 快速查看所有成功的 sudo 命令执行记录
grep "sudo:.*COMMAND=" /var/log/secure
```

### 场景三：发现攻击者的持久化与账户操作痕迹

攻击者为了维持访问，可能会创建后门账户或修改认证配置。

示例 · BASH

```bash
# 检查是否有新增用户
grep "new user" /var/log/secure

# 检查是否有用户被添加到特权组（如 wheel, sudo）
grep -E"new group|added to group" /var/log/secure
```

### 场景四：按照时间点排查登录的记录

在排查告警的时候，我们通常需要根据时间点去排查

#syslog 时间格式是 Mon DD HH:MM:SS，按小时/分钟范围过滤需要借助 awk 做字符串比较，因为时间字段是固定宽度的，可以直接按字典序比较。

## 04系统调用层面记录：/var/log/audit/

`auditd` **记录的是“系统调用域”的事件（进程到底做了什么）**。 `auditd` 在应急响应中的核心价值：它能捕获那些 **完全绕过认证机制** 的行为，例如 Web RCE 派生 shell、反弹 shell、以及攻击者获得初始访问后的具体命令执行。

`/var/log/audit/audit.log` 由 auditd 守护进程写入，其数据源是内核审计子系统。根据预先加载的规则（ `/etc/audit/rules.d/` ），内核会在特定的系统调用（syscall）发生时生成审计事件。

这意味着 auditd 能记录 secure 日志天然无法覆盖的行为：

命令执行：通过 execve 系统调用，记录哪个进程执行了什么程序、带了什么参数（type=EXECVE）。

文件访问与修改：对关键文件（如 `/etc/passwd` 、 `~/.ssh/authorized_keys` ）的读写、属性变更，前提是配置了相应的 watch 规则。

网络连接：进程发起的 connect 系统调用（如果配置了审计规则），可用于捕获反弹 shell 的外连行为。

权限提升：setuid 等系统调用序列，可揭示从普通用户切换到 root 的过程。

审计策略篡改：CONFIG_CHANGE 类型事件，可发现攻击者试图关闭或修改审计规则的行为。

关键前提：auditd 的可见性完全取决于规则是否被正确配置。如果 `/etc/audit/audit.rules` 中只有最基础的规则（例如仅记录 SELinux AVC 拒绝），那么 execve、connect 等关键行为不会被记录，audit.log 在应急排查中的价值会大打折扣。

### 规则配置

auditd 的可见性完全由规则决定。没有规则，它几乎不记录任何进程或文件层面的行为；规则配得不对，要么什么都抓不到，要么日志泛滥到不可用。

auditctl 命令行：规则立即生效，但重启后丢失，仅用于测试或临时排查。

写入 `/etc/audit/rules.d/` 目录：持久化配置，augenrules 在服务启动时按文件名字典序拼接生成 `/etc/audit/audit.rules` ，重启后依然生效。不要直接编辑 `/etc/audit/audit.rules` ，它是由 rules.d/ 自动生成的，手动修改会在下次服务启动时被覆盖

### 文件监控

示例 · BASH

```
w /etc/passwd -p wa -k identity
```

\-w <path>：要监控的文件或目录。

\-p <permissions>：触发权限，r 读、w 写、x 执行、a 属性变更。wa 表示写和属性变更都记录。

\-k <key>：自定义关键字，用于后续 ausearch -k 快速筛选。每条规则都建议打上 -k，否则在海量日志中定位如同大海捞针

常见的一些配置

### 账户与认证文件

示例 · BASH

```
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k identity
-w /etc/ssh/sshd_config -p wa -k sshd_config
```

### 持久化位置

示例 · BASH

```
-w /etc/crontab -p wa -k cron
-w /etc/cron.d/ -p wa -k cron
-w /var/spool/cron/ -p wa -k cron
```

### SSH 密钥（攻击者常留后门的位置）

示例 · BASH

```
-w /root/.ssh/authorized_keys -p wa -k ssh_keys
```

### 系统调用监控

这是捕获 RCE、反弹 shell、提权行为的核心。语法：

示例 · BASH

```
-a always,exit -F arch=b64 -S <syscall> -k <key>
```

\-a always,exit：在系统调用退出时始终记录（exit 过滤器能看到返回值和执行结果）。

\-F arch=b64：指定 64 位架构。强烈建议始终带上 arch 字段，否则同一规则在 32 位和 64 位系统上可能行为不一致，且性能更差。

\-S <syscall>：要监控的系统调用名，可多个逗号分隔。

\-F 可进一步过滤字段（如 path=、perm=、uid= 等）

## 05命令执行（必配）—— 捕获 execve，还原攻击者敲了什么

示例 · BASH

```
-a always,exit -F arch=b64 -S execve -k proc_exec
```

## 06权限变更（发现提权路径）

示例 · BASH

```
-a always,exit -F arch=b64 -S chmod,fchmod,fchmodat -k perm_mod
-a always,exit -F arch=b64 -S setuid,setgid -k privilege_change
```

## 07网络连接（捕获反弹 shell 的外连，需内核支持）

示例 · BASH

```
-a always,exit -F arch=b64 -S connect -k network_connect
```

### 日志格式：多记录构成一个“事件”

`audit.log` 的格式比 `secure` 的纯文本行复杂得多。 **一个逻辑上的“事件”（如一次命令执行）通常由多行记录（record）构成**，它们共享同一个 `audit(...:serial)` 标识中的 `serial` 号。

每行记录以 `type=` 开头，标识记录类型，后面跟随一系列 `key=value` 字段。

### 应急响应中最关键的几类记录与字段

| 记录类型 (`type=`) | 含义  | 关键字段举例 | 排查价值 |
| --- | --- | --- | --- |
| `SYSCALL` | 系统调用的主记录 | `syscall=` （系统调用号） `success=` 、 `exit=` 、 `auid=` 、 `uid=` 、 `pid=` 、 `comm=` 、 `exe=` | 确定行为是否成功、执行者身份、程序路径 |
| `EXECVE` | **命令执行** 的参数记录 | `argc=` 、 `a0=` 、 `a1=` 、 `a2=`<br><br>...（命令行参数） | **还原攻击者敲了什么命令**，例如 `a0="bash" a1="-i"` |
| `PATH` | 涉及的文件路径 | `name=` 、 `inode=` 、 `nametype=` | 确定操作了哪个具体文件 |
| `CWD` | 当前工作目录 | `cwd=` | 辅助判断命令执行的上下文位置 |
| `USER_LOGIN` / `USER_AUTH` | 用户登录/认证 | `acct=` 、 `addr=` 、 `terminal=` 、 `res=` | 定位攻击入口时间点 |
| `CONFIG_CHANGE` | 审计配置变更 | `op=` 、 `key=` | 发现攻击者是否试图篡改审计规则 |

没有设置规则是否还会记录哪些内容

### 在应急排查中的核心用法：ausearch 与 aureport

直接 cat 或 grep audit.log 效率极低，因为记录是多行、原始字段值多为数字。应使用 auditd 自带的查询工具，其中 -i 参数的作用是将数字字段（如 UID、系统调用号、时间戳）解释为可读名称，应急排查中几乎总是需要它

### 场景一：定位入口与锚定追踪线索（AUID）

## 1\. 查找用户登录事件，确定 auid

示例 · BASH

```
ausearch -m USER_LOGIN -ts recent -i
```

查看输出中的 `auid=` 。假设得到 `auid=1001` ，后续所有追踪都围绕这个 ID 展开。

## 2\. 围绕 auid 拉出该会话的全部行为

示例 · BASH

```
ausearch -ua 1001 -i
```

这会返回该原始用户身份下 **所有被审计规则捕获的事件**，是还原攻击链的主干。

### 场景二：还原命令执行（追踪 EXECVE）

## 3\. 查看某个 auid 下执行过的所有命令

示例 · BASH

```
ausearch -ua 1001 -m EXECVE -i
```

输出会展示每条命令的 `a0` 、 `a1` 、 `a2` 等参数，可以直接读出攻击者敲了什么。

## 4\. 快速筛查反弹 shell 或下载行为的关键词

示例 · BASH

```
ausearch -m EXECVE -ts recent -i | grep -E"bash.*-i|/dev/tcp|nc.*-e|curl.*-o|wget|python.*-c"
```

`EXECVE` 记录的是 **命令行参数**，因此 `/dev/tcp` 这类 bash 内建重定向也会出现在参数中，这是捕获反弹 shell 命令的关键入口。

### 场景三：文件访问与持久化排查

## 5\. 查询对关键文件的访问（依赖预先配置的 watch 规则）

示例 · BASH

```
ausearch -f /etc/sudoers -i
ausearch -f /root/.ssh/authorized_keys -i
ausearch -f /etc/crontab -i
```

如果系统没有为这些文件配置 `-w` 审计规则，这些命令将 **没有输出**，这本身也是一个重要的排查结论（说明该主机未对关键文件进行审计覆盖）。

### 场景四：统计概览（使用 aureport）

当面对大量日志时，先用 `aureport` 生成汇总，快速定位异常集中的区域。

## 13总体摘要

示例 · BASH

```
aureport --summary
```

## 14按用户统计事件（快速发现哪个 auid/uid 行为异常频繁）

示例 · BASH

```
aureport -u -i
```

## 15按可执行文件统计（快速发现异常程序）

示例 · BASH

```
aureport -x -i
```

## 16查看所有失败事件

示例 · BASH

```
aureport --failed -i
```

## 17定时任务日志：/var/log/cron

`/var/log/cron` 是记录定时任务调度事件的核心日志，也是应急响应中排查攻击者持久化（Persistence） 行为的首要证据源。和 secure（认证域）、auditd（系统调用域）不同，cron 日志的定位非常聚焦：它回答的是“系统在什么时间、以什么身份、自动执行了什么命令”。

这条日志只告诉你“任务被调度了”，不告诉你“任务执行得怎么样”。脚本内部的报错、输出、是否真的完成了预期动作，cron 日志本身不会记录，必须通过脚本内部的重定向或 auditd 来补充

### 日志格式

该日志包含了6个字段：时间戳，主机名，守护进程，执行用户，事件类型，命令内容

示例 · TEXT

```
Apr2014:00:01 myserver CRON[1234]: (root) CMD (/usr/local/bin/backup.sh)
```

### 在应急排查中的核心用法：追踪持久化

攻击者在获得初始访问后， **最常见的持久化手法之一就是写入恶意 cron 任务**，以实现定期下载 payload、重启恶意进程或重建访问通道。 `/var/log/cron` 是发现这类行为的直接入口。

### 场景一：快速筛查可疑的调度命令

攻击者写入的 cron 任务通常带有 **网络下载、管道执行、临时目录脚本** 等特征。直接在 cron 日志中搜索这些关键词：

示例 · BASH

```swift
# CentOS/RHEL
grep CRON /var/log/cron | grep -E"(curl|wget|bash|sh|nc|python|/tmp/|/dev/shm/)"

# Debian/Ubuntu
grep CRON /var/log/syslog | grep -E"(curl|wget|bash|sh|nc|python|/tmp/|/dev/shm/)"
```

**高危模式举例**：

`* * * * * curl`  http://... `| bash` —— 每分钟从外部下载并执行脚本。

`@reboot /tmp/.hidden/payload` —— 开机自启隐藏在临时目录中的 payload。

执行路径位于 `/tmp` 、 `/var/tmp` 、 `/dev/shm` 等非标准位置的脚本。

### 场景二：定位“谁”在调度可疑任务

一旦发现可疑的 `CMD` 行， **(执行用户) 字段** 告诉你任务是以哪个身份运行的。如果可疑命令以 `(root)` 身份运行，说明攻击者要么已经获得 root 权限，要么利用了某个以 root 运行的服务写入了 cron 配置，威胁等级需要立即上调。

### 场景三：确认任务是否“真的”在运行

如果怀疑某个 cron 任务被植入了但不确定是否已经触发， `/var/log/cron` 中的 `CMD` 记录就是 **调度发生的直接证据**。结合时间戳，你可以判断恶意任务是否已经在你的系统中周期性执行。 **如果 cron 日志中没有对应记录，至少说明该任务在日志覆盖的时间窗口内没有被调度过**。

### 场景四：与配置源交叉验证

`/var/log/cron` 只记录 **被执行的任务**，不记录 **任务是如何被写入的**。因此，发现可疑调度后，需要回到配置源头确认任务内容：

示例 · BASH

```
bash
# 当前用户
```

示例 · BASH

```
crontab -l
```

示例 · BASH

```bash
# 所有用户的 crontab（存放位置因发行版而异）
ls -la /var/spool/cron/crontabs/   # Debian/Ubuntu
ls -la /var/spool/cron/            # RHEL/CentOS

# 系统级 cron 配置
cat /etc/crontab
ls -la /etc/cron.d/ /etc/cron.hourly/ /etc/cron.daily/ /etc/cron.weekly/ /etc/cron.monthly/
```

**注意**： `/var/log/cron` 本身可能被攻击者删除或篡改。如果发现 cron 日志存在 **时间上的空白段**，或日志文件被异常截断，这本身就是需要警惕的信号。

## 18当前与历史登录：wtmp / btmp / lastlog / utmp

这一组日志回答的是“ **谁登录过、从哪来、什么时候、成功与否** ”。它们都是二进制文件，不能直接用文本工具读取，必须使用配套命令。

| 文件  | 记录内容 | 对应命令 | 关键特征 |
| --- | --- | --- | --- |
| `/var/log/wtmp` | **成功** 的登录、注销，以及系统启动/关机事件 | `last` | 永久追加，包含会话起止时间、来源 IP、TTY |
| `/var/log/btmp` | **失败** 的登录尝试 | `lastb` | 暴力破解排查的直接入口 |
| `/var/log/lastlog` | **每个用户最近一次登录** 的时间和来源 | `lastlog` | 稀疏文件，按 UID 索引，用于快速判断“某账户是否被使用过” |
| `/var/run/utmp` | **当前** 登录会话 | `who` / `w` | 动态文件，重启丢失；反映的是“此刻谁在线” |

last 和 lastb 默认按时间倒序输出，关键选项包括 -i（显示 IP 而非主机名，避免 DNS 解析干扰）、-x（包含关机/运行级别变更记录）、-f <file>（指定轮转后的归档 wtmp `/btmp` 文件，用于追溯更早时间）

### 应急排查中的核心用法：

## 1\. 快速判断某个账户是否“活着”

示例 · BASH

```
lastlog -u <username>
```

如果输出显示 `**Never logged in**` ，但该账户出现在可疑进程的 `auid` 中，本身就是矛盾信号——要么账户被非登录方式使用（如 `su` 或服务派生），要么 `lastlog` 数据被篡改。

## 2\. 排查暴力破解的成功突破点

示例 · BASH

```
bash
# 先看失败尝试的规模和来源
```

示例 · BASH

```
lastb -i | head -50
```

## 21再交叉检查同一来源 IP 是否有成功登录

示例 · BASH

```
last -i | grep "<可疑IP>"
```

`btmp` 中大量失败记录本身不致命， **致命的是同一来源在失败之后出现了** `wtmp` **中的成功记录**。这一步和之前分析的 `/var/log/secure` 中 `Failed password` → `Accepted` 的交叉验证逻辑完全一致，只是数据源换成了二进制记录，粒度更粗（不含具体认证方式）但不易被文本日志轮转策略影响。

## 3\. 发现“幽灵会话”

`last` 的输出中，如果某个用户的会话 **没有对应的 logout 记录** （时间列显示 `still logged in` ），但当前 `w` 或 `who` 中并不存在该会话，可能是异常断开或 `utmp` / `wtmp` 状态不一致。这在攻击者强制关闭会话或系统异常时可能出现，需要结合 `secure` 中的对应时间点判断。

## 4\. 追溯系统重启时间线

`last -x | grep reboot` 可以列出所有重启记录。如果攻击者在入侵后重启系统以清除内存中的痕迹或使某些配置生效，这个时间点会成为串联 `secure` 、 `cron` 、 `auditd` 日志的关键锚点。

## 24命令历史：~/.bash_history（及其他 \*\_history）

这是用户域日志中 **信息最丰富、但也最不可靠** 的一层。只有 **交互式 Bash Shell** 中执行的命令，才可能被记录。非交互式 Shell（如脚本执行）或使用 `sh` 等其它 Shell 时，通常不记录到 `~/.bash_history`

**每个用户有自己独立的** `~/.bash_history` **文件。**

`~` 代表当前用户的主目录，因此不同用户的历史文件路径天然不同。例如：

`root` 用户： `/root/.bash_history`

普通用户 `alice` ： `/home/alice/.bash_history`

你可以通过 `echo $HISTFILE` 命令查看当前 Shell 实际使用的历史文件路径。

**默认情况下，不是输入一个就记录一个，而是整个会话期间命令都暂存在内存中，直到 Shell 正常退出时才一次性写入** `~/.bash_history` **文件。**

**信息丰富之处：** `~/.bash_history` （以及 `.mysql_history` 、`.python_history` 、`.viminfo` 等）可以直接展示攻击者在 shell 中敲入的命令和参数，是还原攻击意图的 **直接文本证据**。如果攻击者没有刻意清理，一次 `cat /root/.bash_history` 可能比翻遍 `auditd` 日志更快地暴露下载 payload、提权、反弹 shell 等动作。

**不可靠之处（必须同时考虑）：**

**默认没有时间戳。** 没有配置 `HISTTIMEFORMAT` 的情况下，历史记录只有命令序列， **无法将命令与具体时间点关联**。可以通过在 `/etc/bashrc` 或 `/etc/profile.d/` 中设置 `export HISTTIMEFORMAT='%F %T '` 来开启时间记录，但这是 **事后加固措施**，不能追溯已记录的历史。

**可以被攻击者清除或禁用。** `history -c` 、 `unset HISTFILE` 、 `set +o history` 、直接删除 `~/.bash_history` ，都能让磁盘上的历史记录消失。但有一个重要例外： **即使** `HISTFILE` **被 unset，当前 bash 进程内存中仍然保存着历史**。

在应急响应中，如果可疑 shell 进程仍然存活，从内存中提取 bash 历史（如通过 Volatility 的 `linux_bash` 插件）可能找回磁盘上已被清除的记录。

**多用户、多 shell 混淆。** 每个用户、每种 shell 有独立的历史文件。只查 `/root/.bash_history` 会遗漏通过 `su` 切换到其他用户后在该用户下执行的操作。

* * *

### 感谢阅读

如果这篇文章对你有帮助，欢迎关注、收藏，也欢迎留言交流。

应急响应 · 目录
