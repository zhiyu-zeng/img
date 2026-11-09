---
title: 【微信】为了改个车载时钟，我把雷诺的导航系统给 root 了
source: https://mp.weixin.qq.com/s/fHwWMigtRm5ZsaYI809t-g
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T11:50:29+08:00
trace_id: 324666de-4066-4cf0-8eae-9516cc618934
content_hash: 482691ad49fdbd72a10debfab7551b6b2c982f60be2ea25982a7c83e8cd40a4f
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41375244-d011-815d-9e80-d4c05e7985b1
ioc: null
---

**幻泉之洲** *2026年11月9日 10:53*

> 一辆 2014 款雷诺 Latitude，换个冬令时而已，仪表盘上的时间却怎么都调不了。前车主说这车必须有导航 SD 卡才能改时间，我当时不信。后来拆固件、跑模拟器、翻汇编，才发现他说的是真的——而且这张卡还有 CID 绑定和签名校验。最后我用了内核 exploit 里常见的 core_pattern 技巧拿到了 root，改了一个数字，把时区从 180 分钟调成 120 分钟。整件事的荒诞程度，值得写下来。

我开的是一辆 2014 款雷诺 Latitude。不是什么好车，年头也不短了，但能把我从 A 点送到 B 点，其他方面也凑合，所以一直没什么可抱怨的。

买车的时候，前车主问我要不要带一张“导航地图 SD 卡”。他说这车好像必须插着这张卡才能改时钟。我当时不太信——倒不是觉得他骗我，可能是他没找到正确的设置菜单。网上同款车机的视频里，时钟设置选项明明就在菜单里摆着。

那张卡里的地图数据老得不行，也不太好用，我就说不用了，前车主顺手扔了。

我也没觉得少了什么。仪表盘上确实一直顶着一行大字：“No maps found!”，占了屏幕一大半，但看久了也就习惯了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/76a6d32fb3e5a854.png)

爱沙尼亚跟大多数欧洲国家一样用夏令时。前阵子刚从夏令时（UTC+3）切到冬令时（UTC+2），仪表盘上的时间就慢了一小时。我钻进设置菜单，想着找个“Set time”应该不难。

结果就是找不到。

那个本该有“Set time”的菜单里，压根没这一项。我拿网上的视频一帧帧对比，人家的菜单里有，我的没有。仪表台上有两个“Settings”按钮，一个能用，但只能改蓝牙和电话簿，没有时间和日期；另一个按下去毫无反应，只弹一句“No maps detected!”。

我大概花了一个小时，翻遍各种菜单、按各种按钮组合，上网搜这款车机的资料。就是不肯相信改个时间会没有办法——肯定是哪里漏了。

## 先逆向再说

我还是不死心，决定把固件抓下来拆开看，想找出进设置菜单的门路。

好在我不是第一个走这条路的人。GitHub 上已经有人对这款车机做过逆向（github.com/andronedev/carminat-tomtom-live-re）。文档是法语的，看起来大量借助了 LLM 生成，但至少给出了下载更新包的准确 URL。

更新包解压出来有个 ttsystem 文件，其实是一个 ext3 文件系统，里面装着设备的根文件系统——正是我要的东西。这台机器是 TomTom Carminat LIVE，代号 beaumont，主控是三星 S5P6440，跑的是 TomTom 基于 Linux 2.6.28.10 改的系统。

逆向了一阵，结论出来了：前车主说的完全正确。不插导航 SD 卡，就是没有任何办法进那个设置菜单。菜单定义本身是从 SD 卡里读的，卡不在，系统连怎么进 Settings 都不知道。

TomTom 或者雷诺当年做这个决定，我到现在都想不通。

更麻烦的是，这卡还得是“正版”的。系统有 DRM 校验：卡的 CID（烧在卡里的唯一 ID）不对就拒绝，文件签名还得跟这个 CID 对上。所以把文件拷到空白卡上也没用。我猜这套 DRM 本来是为了防地图盗版。

可我不需要地图。导航我用手机。我只想改个时间。

网上确实有第三方在卖这张卡，算上寄到爱沙尼亚的运费大概 60 欧元。这钱我实在不想花。

行吧，我自己 root。

## 有没有省事的办法？

网上找不到任何人给这机器做过越狱。只有几个老论坛帖子，图床全挂了，内容也很泛泛，大意是这机器不好搞。

2011 年的 Linux 2.6 系统，我天真地以为不会太难。

第一个想法是直接改那个 ext3 更新镜像。挂载文件系统，改几个 init 脚本，拷到空白 SD 卡上，让车机刷我改过的镜像——听起来很顺。

结果，原版未修改的 ttsystem 镜像刷起来毫无问题，确认提示正常弹出。换成我改过的镜像，死活不认，而且看不出原因。我把更新包里自带的升级逻辑翻了一遍，也找不到任何拒绝的理由。

到这一步，我搭了个 QEMU 模拟环境，用同样基于 2.6 的内核，打了几个补丁，还写了个极简的 CAN 模拟器，让系统能勉强启动——它每 3 秒就想重启一次，我把 reboot 系统调用直接忽略掉才算稳住。

用这个环境测试安装修改过的镜像，我才意识到：设备刷机时进的那个 recovery 分区，我手里根本没有。那里面八成还有一层校验，是我没看到的。

再仔细看 ttsystem 镜像，基本能确认这一点。文件尾部跟了一大段高熵数据，然后是几个全零块，最后是 40 个高熵字节。我猜这是某种签名（40 字节可能是 DSA with SHA-1），但拿不到真正做校验的二进制，没法判断能不能攻、怎么攻。

## 回到起点

搭模拟器的时候我还有点不情愿，后来发现它太有用了——试各种攻击思路、摸清系统行为，全靠它。

比如我发现大部分分区要么只读，要么 noexec，要么两个都占。实机上的挂载是这样的：

rootfs on / type rootfs (rw)  
none on /sys type sysfs (rw,nosuid,noexec)  
none on /proc type proc (rw,nosuid,noexec)  
/dev/mmcblk0p5 on /content type ext3 (rw,nosuid,nodev,noexec,noatime,nodiratime,errors=continue,data=ordered)  
/dev/loop0 on / type ext2 (ro,noatime,nodiratime,errors=continue)  
none on /dev type tmpfs (rw,nosuid,noexec,size=1024k)  
none on /tmp type tmpfs (rw,nosuid,noexec,size=2048k)  
none on /var type tmpfs (rw,nosuid,noexec,size=5120k)  
none on /dev/pts type devpts (rw,nosuid,noexec,gid=5,mode=620)  
none on /var/log type tmpfs (rw,nosuid,noexec,size=1024k)  
/dev/mmcblk0p3 on /mnt/flash type ext3 (rw,sync,nosuid,nodev,noexec,errors=continue,data=ordered)  
/dev/mmcblk1p1 on /media/sdcard type vfat (rw,sync,nosuid,nodev,noexec,noatime,nodiratime,fmask=0022,dmask=0022,codepage=cp437,iocharset=iso8859-1)  
/dev/loop1 on /media/loopback type ext3 (rw,nosuid,nodev,noexec,noatime,nodiratime,errors=continue,commit=3600,data=journal)  
none on /mnt/movi type unionfs (rw,nosuid,nodev,noexec,noatime,nodiratime,dirs=/media/loopback=rw:/media/sdcard=ro)

注意 SD 卡原本的 FAT32 文件系统挂在 /media/sdcard，系统在 /mnt/movi 上用 unionfs 盖了一层，可写层指向一个 ext3 文件系统——这个 ext3 本身又是 SD 卡上的一个文件。我不太确定这么设计是为了什么，也许是为了能用 data=journal，掉电时数据更稳？但不管怎样，这些挂载全是 noexec。

2011 年的设备，安全做到这个程度，说实话有点出乎意料。

模拟器还帮我揪出了系统每次启动会从外部 SD 卡读的所有文件。其中有个 master.script，是一种自定义脚本语言写的，用来做界面导航的自动化操作。它每次开机都加载，我指望能靠它打开那个该死的设置菜单。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2895a47426ab5c3.jpg)

我把负责解析这个脚本的 ttn 二进制逆了一遍，边逆边记功能。可惜，没找到任何能打开目标菜单的办法。

## 又一次撞墙

我还是觉得 master.script 值得继续挖，功能不少，攻击面应该也在里面。

按惯例先找 system 和 popen 调用，看能不能命令注入。没有。没有一处是用用户输入拼出来的。

逆解析器的时候看到 SHEX / SHELLEXECUTE 命令，我以为中了头奖。它把任意参数传给 launchserver，后者用 execve 执行任何命令行。

但有两个坎。第一，还是没法直接执行自定义程序——SD 卡挂载是 noexec，卡上的可执行文件和脚本都跑不起来。不过这个能绕：不直接执行脚本，而是执行 `/bin/sh /media/sdcard/payload.sh` ，走的是 rootfs 上的 /bin/sh，那个分区不是 noexec。

第二个坎更麻烦。launchserver 什么都肯执行，但 SHEX 只接受一个空白分隔的 token。也就是说我能控制执行哪个二进制，但给不了任何参数。叠加上第一个限制，这条路也死了——我只能跑 rootfs 上已有的东西。我把它们翻了个遍，没找到什么能用的。

没办法，转头研究文件写入。能写到本不该能写的地方，也许能换来点什么。

果然找到了 LOG 命令。它能截断一个文件（路径由 `#define LOGFILE log.txt` 定义），然后往里写一行。这个命令允许空格和常规 ASCII 字符，但只限 0x20 到 0x7E，写二进制数据是别想了。ttn 是以 root 跑的，所以写文件也是 root 权限。

它还有个经典的路径穿越漏洞。把 LOGFILE 定义成带 `../` 的路径，就能写到日志目录之外，理论上可以把可打印 ASCII 写到系统任何位置。

结果又被挂载方式卡住。rootfs 只读，覆盖不了；其他分区全是 noexec，写进去也不会被执行。我又去找有没有什么有用的配置文件可以覆盖，但大部分是自定义二进制格式，用 LOG 根本写不出来，剩下的也没什么价值。又是死胡同。

master.script 还能在屏幕上显示图片（GIF/BMP）。我用 Unicorn 搭了个 fuzzing 环境，想看能不能触发图像解码器的内存破坏。越界读找到不少，但有用的写一个也没有。

## 借一个内核 exploit 的思路

前前后后研究、逆向、想各种执行任意代码的路子，折腾了很久。令人沮丧的是，一个都没成。我退回来重新看全局，想把手里的碎片拼一拼。

我确定能做到两件事：

-   执行任意二进制，但没有参数，而且只能是 rootfs 上已有的
    
-   往任意路径写 ASCII 内容
    

然后我脑子里闪了一下，想起内核 exploit 里常用的一个招：与其想办法让用户态跑我们的脚本，为什么不让内核来跑？

内核 exploit 拿到任意内存写之后，经常会去覆盖 core_pattern 这个字符串。它本来规定进程崩溃时 coredump 存哪儿，但还支持一种特殊语法，把 coredump 通过管道送给一个进程（ `|/bin/my-coredump-handler` ）。一旦有崩溃发生，内核就会启动 core_pattern 里指定的程序，把数据从管道灌进去。

core_pattern 还支持给启动的进程传命令行参数。这里我运气不错：这个特性在 2.6.24 才加进去，而这台机器的内核是 2.6.28。

关键在于，用户态可以直接往 `/proc/sys/kernel/core_pattern` 写内容来设置它。

那我只要把 LOGFILE 指向 `../../proc/sys/kernel/core_pattern` ，写进 `|/bin/sh /media/sdcard/payload.sh` ，就能让 rootfs 上的 /bin/sh 以 root 身份执行我的脚本。

能执行任意二进制这件事，在没参数的情况下也派上了用场——总得让某个程序崩溃才能触发 coredump。用 DoS 漏洞把脚本解析器或者主界面搞崩不太行，因为那会立刻触发整机重启，我的脚本跟着一起没。

我在模拟器里把系统上几乎所有二进制都跑了一遍，发现 `/bin/dbus-monitor` 在连不上系统总线（这机器根本没跑）的时候会抛 SIGABRT，正好能触发 coredump。完美。

## 拼起来

最终的 master.script 短得出奇：

#define LOGFILE../../proc/sys/kernel/core_pattern  
LOG |/bin/sh /media/sdcard/payload.sh  
SHEX /bin/dbus-monitor

我先在 payload.sh 里只写了一行 reboot 验证。插卡、开机，屏幕上问“Execute master.script?”，选“Yes”，车机重启了。代码执行拿到了。

第一件事是用 dd 把内部 eMMC 完整备份下来。有了更完整的系统副本，很快就查到我要的日期时间设置存在 /mnt/flash/settings.dat 里，是自定义二进制格式。再逆一下发现，这台机器压根没有时区的概念——时间从 GPS 拿，本地偏移存成一个分钟数。我的是 180。

改成 120。

这就是我终于把车上的时间调对的全过程。

* * *

回头看，这件事最值得说的不是漏洞本身，而是安全边界画错了地方。

TomTom 和雷诺把用户态锁得相当严：只读 rootfs、noexec 挂载、CID 绑定、签名校验、镜像高熵尾部。单看每一层，都是正经的防护。可整个方案有个前提——把“改时间”这种基本功能跟“正版地图卡”绑在一起。这个前提本身就是荒谬的，它逼着用户去攻击系统，而一旦有人真的开始攻击，防线就撑不住了。

真正被利用的也不是他们写的代码，而是 Linux 内核自己的 core_pattern 机制。这个功能在 2.6.24 引入了参数支持，刚好能用。设计者大概从没想过，一个正经的内核特性会变成绕过整套 DRM 的钥匙。

所以问题不是“他们安全做得不够好”，而是“他们选错了要保护的东西”。防地图盗版没错，但顺手把基础功能一起锁上，等于给自己制造敌人。60 欧元的卡，我本来也可以买，但那种“被逼着买”的感觉，比 60 块更让人不爽。

至于现在，仪表盘上那行“No maps found!”还在。时间对了，我就不计较了。

* * *

### 参考资料

\[1\] https://blog.nns.ee/2026/11/02/renault-hack/
