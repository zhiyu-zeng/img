---
title: 【微信】挖矿病毒-CPU爆满之后我才看清这台机器
source: https://mp.weixin.qq.com/s/AUCPXD1rxeovcHGjq9Z05w
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T09:19:49+08:00
trace_id: f69546b0-ff1f-4ffc-aa9f-98c15e0bfa22
content_hash: 7848a19b3cf945dcd4e7507cc991194e20d439a78492cee897f8471134bec319
status: synced
tags:
  - 微信
  - Linux安全
  - 应急响应
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Ubuntu 挖矿病毒靠劫持 alias 和替换 9 个系统命令让排查者“失明”，处置必须先断持久化再清本体，重启只会丢失现场。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40a75244-d011-8183-b8d2-e139c909ed23
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Ubuntu 挖矿病毒靠劫持 alias 和替换 9 个系统命令让排查者“失明”，处置必须先断持久化再清本体，重启只会丢失现场。
> 
> - **命令劫持：** `top` 无输出的真凶是 alias 被改为 `echo ""`；病毒共感染 ls/ps/cat/rm/ss/stat/top/wget/whoami 九个命令，每个都对应一种排查动作（看进程、删文件、查外联等），系统性剥夺受害者观察能力
> - **进程伪装：** 挖矿进程伪装成 `kworkerds`，比真内核线程 kworker 多两个字母且不带中括号，本体藏在 `/tmp`；用 strings 提取出挖矿池登录 JSON 报文，完成定性
> - **杀不死的根源：** `/etc/cron.d/0guardian` 每分钟执行隐藏脚本 `/usr/bin/.0guardian`，发现本体被删就重新释放；脚本还依赖被感染的 `stat` 判断文件状态，所以 kill 换 PID 重生、正常 rm 报 Operation not permitted
> - **外联确认：** netstat 和 ss 均查不到外联（ss 本身在被感染名单），lsof 抓到进程连向 104.21.6.99:10235 且处于 SYN_SENT；被入侵机器上判断外联应以设备侧流量日志为准
> - **处置五步与入口：** 断网（勿关机丢现场）→ 删 cron 项和守护脚本 → 用 busybox 杀进程删本体 → 离线 deb 包 `dpkg -i --force-overwrite` 恢复命令 → 至少等一个 cron 周期验证；入口是员工从 Google 搜索第一条的仿冒下载站装了带毒软件

**围巢安全笔记** *2026年10月31日 09:00*

应急响应 · 实战篇

告警说这台 Ubuntu 的 CPU 一直 90% 以上，安全设备还报了一条外联挖矿。  
  
我登上去，敲 `top` —— **一片空白**。  
  
不是没进程，是根本没有输出。那一刻我就知道，这台机器已经不能信了： **它有东西在替我决定我看到什么**。  
  
这篇是完整复盘：从 top 空白开始，一步步把挖矿本体、外联地址、守护脚本、被感染的 9 个系统命令全挖出来，最后讲为什么「重启一下」在这里是错的。约 5300 字。

01｜top 为什么会是空的

正常情况， `top` 敲下去就该刷出一屏进程。这次回车之后，光标跳了一下，什么都没有。

第一反应是终端有问题，换了个 SSH 会话，还是空。第二反应是命令坏了，敲 `which top` ，路径正常。

那就只剩三种可能：

1\. alias 被改了，你敲的 top 其实指向别的东西

2\. PATH 被改了，优先命中了另一个同名程序

3\. top 这个二进制本身被替换了

## alias劫持排查

查第一种，一条命令就够：

```
$ alias alias top='echo ""'
```

果然。有人把 `top` 指向了 `echo ""` ——你敲什么它都回一个空行。

`unalias top` ，再看，进程出来了。

![命令被劫持的四个层次](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ec895f95a945168f.png)

图 1｜命令骗人有四层，alias 只是最浅的一层

这一步很关键： **你知道自己被骗了，才知道后面每一个结论都要打折扣**。从那以后我看任何输出都多问一句——这命令干净吗？

**应急第一原则**  
当一台机器已经被入侵，它输出的每一个结果都可能是伪造的。  
所以动手前先做两件事： **断网隔离**、 **记录你用了哪些命令、这些命令本身可信吗**。

02｜找到进程：它伪装成内核线程

## 挖矿进程伪装

top 恢复之后，一眼就看到不对劲的：

```
  PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND   363 root      20   0  102544   4864  30.3   0.1  12:41.88 kworkerds
```

进程名 `kworkerds` 。

Linux 内核确实有一堆叫 `kworker` 的线程，格式是 `kworker/0:1` 这种。攻击者加了两个字母 `ds` ，肉眼扫过去几乎看不出来。

但有个细节藏不住： **真正的 kworker 是内核线程，方括号包着**。top 里显示成 `[kworker/0:1]` ，带中括号；而这个没有。

再确认一下它到底是什么：

```bash
$ ls -l /proc/363/exe lrwxrwxrwx 1 root root 0 Oct 12 09:31 /proc/363/exe -> /tmp/kworkerds  $ ls -l /tmp/kworkerds -rwxr-xr-x 1 root root 102544 Oct 12 09:28 /tmp/kworkerds
```

内核线程的 exe 链接会指向空或者不存在，这个指向了一个真实文件，在 `/tmp` 下面。

挖矿程序放 /tmp 是常规操作：这个目录人人可写、经常被清理、监控往往不关注。而且 `/tmp` 在很多系统上没挂 noexec，能直接跑。

文件是二进制，直接 cat 是乱码。用 strings 提取可读字符串：

```bash
$ strings /tmp/kworkerds | grep -E 'pid|login|stratum|pool' /tmp/kworkerds.pid {"id": 1, "method": "login", "params": {"login": "%s", "pass": "x", "agent": "%s"}}
```

那个 JSON 是挖矿协议的登录报文格式。到这一步， **定性完成**：这不是可疑进程，这就是挖矿本体。

03｜外联为什么 netstat 看不到

接下来要找它跟谁通信。按习惯敲 `netstat -anlpt` ，没有异常。

换 `ss -antup` ，也没有。

两条命令都是空的。这时候很容易得出一个错误结论： **它没有外联**。但安全设备明明报了外联告警。

## 外联定位

矛盾出现的时候，先怀疑工具，别怀疑告警。

```
$ lsof -p 363 | grep TCP kworkerds 363 root 4u IPv4 46485 0t0 TCP 192.168.32.181:47524 -> 104.21.6.99:10235 (SYN_SENT)
```

有了。目标 `104.21.6.99:10235` 。

为什么 netstat 和 ss 看不到，lsof 能看到？三种解释，按可能性排：

**第一，心跳机制。** 挖矿程序不是一直连着，它隔一段时间连一次，连不上就退。你敲命令的那一秒，它恰好没连。这是最可能的——所以 netstat 要多敲几次、隔几秒再敲。

**第二，ss/netstat 也被感染了。** 这台机器上 `ss` 确实在被感染列表里。它给你返回空，可能是真的空，也可能是它不想让你看见。

**第三，连接处在 SYN_SENT。** 这个状态说明它一直在尝试连、但没连上（可能被防火墙拦了）。部分工具默认只显示 ESTABLISHED，会把 SYN_SENT 过滤掉。

**这一节的教训**  
「没看到」不等于「没有」。在已被入侵的机器上，两个工具给出一致结论也可能是巧合。  
判断外联，最可靠的是 **看设备侧的流量日志**，而不是主机上敲命令。

04｜杀不死，删不掉

定位清楚了，常规操作：kill 进程、删文件。

```
$ kill -9 363 $ ps aux | grep kworkerds root  1268  ...  kworkerds        # 换了个 PID，又回来了  $ rm -f /tmp/kworkerds rm: cannot remove '/tmp/kworkerds': Operation not permitted
```

两个现象，两个不同的原因。

**kill 之后换 PID 重生**——说明有东西在盯着它。要么是守护进程，要么是计划任务。

**rm 提示 Operation not permitted**——第一反应是文件被加了不可变属性。查一下：

```
$ lsattr /tmp/kworkerds ----------------e----- /tmp/kworkerds
```

没有 `i` （immutable）也没有 `a` （append only）。属性正常。

那为什么删不掉？因为 `rm` 这个命令本身有问题——它也在被感染名单里。

绕过它，用 busybox：

```bash
$ busybox rm -rf /tmp/kworkerds $ ls /tmp/kworkerds ls: cannot access '/tmp/kworkerds': No such file or directory
```

删掉了。但几秒之后：

```
$ ls -l /tmp/kworkerds -rwxr-xr-x 1 root root 102544 Oct 12 09:52 /tmp/kworkerds
```

又回来了，时间戳是新的。

到这一步，问题的性质变了： **不是「有个恶意文件」，是「有个机制在维持这个文件」**。你要杀的不是文件，是那个机制。

## 持久化根系

05｜根系：计划任务 + 守护脚本

找持久化，第一个看的就是 crontab：

```
$ crontab -l no crontab for root
```

空的。但 crontab 只是「当前用户的任务」，系统级的任务在 `/etc/cron*` 下面：

```bash
$ ls -la /etc/cron.d/ -rw-r--r-- 1 root root  56 Oct 12 09:28 0guardian -rw-r--r-- 1 root root 189 Sep 03 11:02 e2scrub_all  $ cat /etc/cron.d/0guardian */1 * * * * root /usr/bin/.0guardian
```

每分钟执行一次 `/usr/bin/.0guardian` 。

文件名前面加个点，是 Linux 下隐藏文件的常规做法—— `ls` 不带 `-a` 根本看不见。放在 /usr/bin 这种「一看就是系统目录」的地方，很多人扫目录时直接跳过。

看它干什么：

```
$ cat /usr/bin/.0guardian #!/bin/bash if [ ! -f /tmp/kworkerds ]; then     ...释放并启动... fi
```

![挖矿守护进程的循环机制](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fc1f2b6f7bbbd445.png)

图 2｜循环不破，删多少次都一样

逻辑很朴素：检查文件在不在，不在就补一份。但配合 cron 一分钟一次，效果就是 **「你永远删不完」**。

这里还有一个细节：脚本里用的是 `stat` 来检查文件状态，而 `stat` 也被感染了。所以它自带一个「白名单」——只认它自己那份 stat 的判断。

顺带解释了一件事：为什么我删了文件它还能判断出来「文件不在了」。因为它压根不是靠正常的文件系统 API，是靠它自己改过的版本。

**找到根之后，处置顺序就定了**  
先删 `/etc/cron.d/0guardian` ，再删 `/usr/bin/.0guardian` ，最后才删挖矿本体。  
顺序反了，你删本体的时候它还在补。

06｜被感染的 9 个命令

病毒文件里还藏着一份清单，strings 一提就出来了：

```swift
/bin/ls     /bin/ps     /bin/cat    /bin/rm /bin/ss     /usr/bin/stat  /usr/bin/top /usr/bin/wget  /usr/bin/whoami
```

这份清单值得单独看一眼。它不是随便选的， **每一个都对应一个排查动作**：

`ls` —— 让你看不见恶意文件

`ps` / `top` —— 让你看不见恶意进程

`cat` —— 让你看不见恶意内容

`rm` —— 让你删不掉

`ss` —— 让你看不见外联

`stat` —— 让守护脚本自己判断

`wget` —— 让下载走它的通道

`whoami` —— 判断当前权限，决定下一步动作

这是一套 **「让受害者失去观察能力」** 的组合，比单纯藏起来高明得多。

所以正确做法不是「再找个命令试试」，而是 **用没被感染的路径去验证**：busybox、静态编译的工具、或者直接从离线介质跑。

怎么确认哪些命令被换过？有包管理器的系统最省事：

```
# Debian / Ubuntu debsums -c coreutils procps iproute2  # CentOS / RHEL rpm -Va
```

输出里标 FAILED 的，就是被改过的文件。这比一个个手动比对快得多，也可靠得多。

## 正确处置顺序

07｜处置：为什么「重启一下」是错的

很多人到这一步会说：重启不就好了？

不好。而且很危险。

因为这台机器的根不在内存里， **在磁盘上**：

· `/etc/cron.d/0guardian` 还在，开机后一分钟内就触发

· `/usr/bin/.0guardian` 还在，被感染的 stat 还在

· 被替换的 ls/ps/rm 还在，你重启后照样看不见

· `/tmp` 里的本体可能被清理，但守护脚本会重新放一份

重启的结果是： **你用一次重启，换来了「症状重新出现」，同时丢掉了内存里的现场**。

正确顺序是这样：

![挖矿处置五步顺序](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3cc17e97b7d9dd76.png)

图 3｜顺序错了，做多少都是白做

**第一步，断网。** 不是关机，是断网。关机会丢内存现场，断网只是切断 C2 和横向扩散。

**第二步，断持久化。** 删 cron 项、删守护脚本。这一步必须在删本体之前做。

**第三步，杀进程、删本体。** 用 busybox 绕过被感染的命令。

**第四步，恢复系统命令。** 从离线 deb 包覆盖安装：

```
cd /deb_final dpkg -i --force-overwrite *.deb
```

注意 `--force-overwrite` ：不加这个，dpkg 会因为「文件已存在且属于另一个包」而跳过。

**第五步，验证。** 等至少一个 cron 周期，确认文件没有重生，进程没有回来。 **别急着解除隔离**——很多复发都是因为验证得太早。

这个案例里，恢复完 coreutils / procps / iproute2 / sudo / wget 之后，才敢确认清干净了。

08｜入口在哪：一次「搜个工具」

清完之后一定要回答一个问题： **它是怎么进来的？**

这个案例的入口特别朴素——开发同事要一个日志分析工具，懒得去官网找，直接 Google 搜了个关键词，点了第一条结果。

那个站点仿的是正规软件下载页，页面、图标、版本号、更新日志都有，下载下来的安装包也能正常装、正常用。唯一的区别是：装的时候顺手放了个挖矿程序。

这类入口在真实环境里占比极高。不是 0day，不是钓鱼邮件，就是 **「搜索结果第一条」**。

![从钓鱼站到命令感染的五步攻击链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f71db65f6fbe930e.png)

图 4｜整条链里，前两步最没技术含量，也最难防

09｜复盘：下次怎么快一点

这次从登录到清干净用了三个多小时，其中至少一半时间浪费在「不知道该信谁」上。事后总结几条，给自己也给同行：

**1\. 上机第一件事，先确认工具可信。** busybox、静态编译的 ps/netstat，或者从自己机器上拷一份干净的上去。别用目标机自带的命令做判断。

**2\. 「命令没输出」本身就是一个强信号。** 正常的排查不会静默失败。空输出、报错、卡住——都要停下来想一想，是不是被人做了手脚。

**3\. 外联判断以设备侧日志为准。** 主机上敲命令只能作为辅助证据，尤其当主机已经不可信的时候。

**4\. 先找根，再动手。** 删文件之前先问：它为什么会回来？找到那个「让它回来」的东西，一次就能断干净。

**5\. 定期跑一次完整性校验。** `debsums -c` 或者 `rpm -Va` ，成本很低，能提前发现命令被替换。

**挖矿应急的一句话版本**  
挖矿不危险， **「你看不见」才危险**。  
它做的所有花招——改 alias、换 ps、感染 rm——只有一个目的：让你在排查时得出错误结论。你只要破了这一层，剩下的就是耐心活。

最后说一句可能不太中听的：这类事件里，技术从来不是瓶颈。真正的瓶颈是「有人从非官方渠道下了个东西就双击运行」，而且这个人往往是有 root 权限的。

加固建议写十条，不如把「软件只从官方渠道装」这条执行到位。

围巢安全笔记

不生产焦虑，只分享踩过的坑和挖过的洞

你遇到过最会「装」的恶意进程叫什么名字？👇

有想聊的话题，后台留言告诉我

往期回顾

-   应急响应：服务器被黑了，第一时间该干什么
    
-   内存马：杀软扫不到的后门，藏在 JVM 的哪一层
    
-   痕迹清理：干完活之后怎么把日志清干净
    
-   权限维持：拿到服务器之后怎么留后门
    

哦买噶是应急响应呀 · 目录
