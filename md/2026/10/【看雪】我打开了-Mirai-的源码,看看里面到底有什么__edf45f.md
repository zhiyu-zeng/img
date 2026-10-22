---
title: 【看雪】我打开了 Mirai 的源码,看看里面到底有什么
source: https://bbs.kanxue.com/thread-293300.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-22T18:46:40+08:00
trace_id: 52d1f078-315d-4225-ac9c-507b5c870a9d
content_hash: 9db0b588b6107533192e9f68734bff6efcc3bd75cbe49ff5fc301d7de751f909
status: synced
tags:
  - 看雪
  - 恶意样本
  - Linux安全
series: null
feed_source: 看雪·二进制漏洞
ai_summary: 逐行拆解 Mirai 的 `main.c`：它启动时先删掉自身文件、关闭看门狗、把进程名改成随机字符串，再加载攻击、清除竞争、扫描三个模块，最终进入与 C2 保持连接的死循环；整套动作都按反取证思路安排。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40175244-d011-814d-bbdb-f3530814e6b4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 逐行拆解 Mirai 的 `main.c`：它启动时先删掉自身文件、关闭看门狗、把进程名改成随机字符串，再加载攻击、清除竞争、扫描三个模块，最终进入与 C2 保持连接的死循环；整套动作都按反取证思路安排。
> 
> - **先删证据：** Mirai 执行的第一件事是 `unlink(args[0])`。在 Linux 中，程序加载到内存后，可以继续运行，不受磁盘文件被删除的影响。这样调查人员扫描文件系统时看不到任何痕迹。
> - **关看门狗：** 打开 `/dev/watchdog` 或 `/dev/misc/watchdog`，再用 `ioctl(wfd, 0x80045704, &one)` 关闭硬件定时器。否则，运行在 32/64MB 内存设备上的高强度扫描会导致超时重启，感染过程会归零。
> - **进程隐匿与单实例：** 用 `rand_alphastr()` 生成随机字符串，替换 `argv[0]` 和 `prctl(PR_SET_NAME)` 设置的进程名，使 `ps aux` 看到的是乱码。`ensure_single_instance()` 通过 `bind` 独占固定控制端口；新实例会杀掉旧实例，避免在低内存设备上两个实例并存并耗尽内存。
> - **模块加载顺序：** 依次调用 `attack_init()`（预先将 DDoS 数据结构载入内存）、`killer_init()`（清掉其他僵尸网络或挖矿程序，以腾出内存）和 `scanner_init()`（开始扫描）。顺序是刻意安排的：先清理环境，再清除竞争对手，最后扩大感染范围。
> - **主循环：** `while(TRUE)` 持续接收 C2 命令，并交给 `attack_parse()` 处理。每 6 次循环发送一次心跳 ping（约每 10 秒），以维持连接。

**(一个新手第一次读恶意软件)**

*Mirai 僵尸网络系列 第 3 篇*

> 本文是我在个人论坛 iotsec.in 上写的英文系列,这里翻译成中文发给看雪的朋友。原文:https://iotsec.in/t/i-opened-mirais-source-code-here-is-what-i-found/20

* * *

我第一次打开 Mirai 的源码时,完全不知道该从哪里下手。

20 多个文件,几千行 C 代码,函数名乍一看毫无意义。

于是我做了任何新手都该做的事:

我从 `main.c` 开始读。

每个 C 程序都从 `main()` 开始执行。程序最先做的事,往往就是最重要的事。而 Mirai 最先做的事,就能告诉你攻击者是怎么思考的。

下面我带你一行一行地读,就像我当初希望有人带我读一样。

* * *

## 先把源码拿到手

不要只看文章,自己打开它。

```bash
git clone https://github.com/jgamblin/Mirai-Source-Code
cd Mirai-Source-Code/mirai/bot/
ls
```

你会看到这样的目录:

![ls 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/37b21ecc0d442f6c.png)

每个文件都有各自的职责:

```python
main.c      → 入口,启动一切,连接 C2
scanner.c   → 寻找有漏洞的设备,爆破默认口令
killer.c    → 清除竞争对手的恶意软件,独占设备内存
attack.c    → 收到 C2 命令后发起 DDoS 洪水攻击
table.c     → 存放加密后的字符串和配置
```

我们先从 `main.c` 开始:

```bash
cat main.c
```

* * *

## 第 1 部分 —— Mirai 做的第一件事

看 `main()` 里最开头的几行:

```c
int main(int argc, char **args)
{
    // Delete self
    unlink(args[0]);
```

在连接 C2 之前。  
在扫描任何东西之前。  
在做任何其他事情之前。

**Mirai 先把自己删掉。**

我第一次读到这里时想:等等,它把自己删了,怎么还能继续运行?

答案如下,这一点你一定要牢牢记住。

```python
运行中的程序 = 被加载到内存(RAM)里
磁盘上的文件 = 只是存储

这是两个完全独立的东西。
```

打个比方。你在电脑上打开了一个 PDF,它已经加载到内存里,显示在屏幕上。现在你把"下载"文件夹里的这个 PDF 文件删掉,屏幕上的 PDF 会消失吗?

不会。它仍然开着,仍然在运行,仍然在内存里。

这里也是一样的道理。

```python
第 1 步:Mirai 二进制被上传到 /tmp/mirai.arm(在磁盘上)
第 2 步:开始执行 → 被加载到内存
第 3 步:unlink() 把 /tmp/mirai.arm 从磁盘上删除
第 4 步:一切继续在内存中完美运行
```

那为什么要先删?为什么不晚点再删?

因为 Mirai 刚开始运行的那一刻,对攻击者来说是最危险的。如果此时调查人员检查文件系统,就会发现这个文件。这就是证据,可以顺藤摸瓜追溯到攻击者。

所以要立刻删掉,趁一切还没出问题。

```python
调查人员赶到,检查 /tmp/         → 什么都没有
杀毒软件扫描磁盘                 → 什么都没有
设备主人查找可疑文件             → 什么都没有

但 Mirai 仍然在内存里完美运行。
不可见。干净。没有证据。
```

一行代码,证据永远消失。

* * *

## 第 2 部分 —— 关闭看门狗

自删除之后紧接着是:

```c
// Prevent watchdog from rebooting device
if ((wfd = open("/dev/watchdog", 2)) != -1 ||
    (wfd = open("/dev/misc/watchdog", 2)) != -1)
{
    int one = 1;
    ioctl(wfd, 0x80045704, &one);
    close(wfd);
}
```

什么是看门狗(watchdog)?

便宜的 IoT 设备(摄像头、路由器、DVR)都有一个硬件定时器,叫看门狗。它的作用很简单:如果软件失去响应或崩溃,就自动重启设备。这样即使软件出问题,设备也能保持在线。

正常情况下这很有用:设备崩溃,看门狗把它重启,设备重新上线。

但对 Mirai 来说,这是个麻烦。

Mirai 马上要干很重的活:扫描数以百万计的 IP 地址,同时跟踪上百个连接,爆破口令。而这一切都跑在只有 32MB 或 64MB 内存的设备上。

```python
看门狗没有关闭:
Mirai 开始高强度扫描
设备压力变大
看门狗定时器超时
设备重启
Mirai 从内存中消失
所有扫描成果丢失
与 C2 的连接断开
一切归零
```

![看门狗未关闭](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e19273b17f3aa07d.png)

对比:

```python
看门狗已关闭:
Mirai 自由扫描
再重的活也没问题
设备永远不会重启
扫描持续进行
C2 保持连接
攻击不会中断
```

![看门狗已关闭](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/09233144eb09ad3c.png)

所以这个顺序是刻意安排的:

```python
1. 删除证据      → 磁盘上没有痕迹
2. 关闭看门狗    → 不被打断
3. 其他一切
```

先清理现场,再保障环境,然后才开工。

* * *

## 第 3 部分 —— 大隐隐于市

接下来的部分我觉得很有意思:

```c
// Hide argv0
name_buf_len = ((rand_next() % 4) + 3) * 4;
rand_alphastr(name_buf, name_buf_len);
util_strcpy(args[0], name_buf);

// Hide process name
name_buf_len = ((rand_next() % 6) + 3) * 4;
rand_alphastr(name_buf, name_buf_len);
prctl(PR_SET_NAME, name_buf);
```

`rand_alphastr()` 会生成一个随机字符串,比如 `xkqpfmra` 或 `tnjvwqkp` 。

Mirai 把自己的进程名替换成这种随机乱码。

为什么?因为在任何 Linux 设备上,你都可以查看所有正在运行的进程:

```bash
ps aux
```

![ps aux 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3c5a1e18a100ed8.png)

不隐藏的话:

```python
PID   NAME
1234  mirai.arm     ← 可疑,调查人员一眼就会注意到
```

隐藏之后:

```python
PID   NAME
1234  xkqpfmra      ← 看起来像一个正常的系统进程
```

每次都是不同的随机字符串,没有规律,无法按名字搜索。

恶意软件就在进程列表里运行,就在眼前,但没人知道自己在看什么。

* * *

## 第 4 部分 —— 同一时间只运行一个 Mirai

```c
ensure_single_instance();
```

这个函数保证设备上任何时候只有 **一个** Mirai 进程在运行。

原因很简单。这些 IoT 设备很弱,一个便宜的摄像头总共可能只有 32MB 内存。Mirai 的扫描器要同时跟踪上百个连接,光这一项就会占用大量内存。

如果同时跑两个 Mirai 进程:

```python
进程 1:扫描 → 占用内存
进程 2:扫描 → 占用内存
摄像头自己的服务 → 也要占用内存
总内存:32MB
结果:内存耗尽 → 设备崩溃 → 重启 → Mirai 消失
```

那它是怎么做到的?一个聪明的小技巧:

```c
// Try to bind to a specific port
bind(fd_ctrl, ..., SINGLE_INSTANCE_PORT)
```

第一个 Mirai 在设备上占用一个特定端口,就像插上一面旗子。

```python
第一个 Mirai:占用端口 → 成功 → "我是唯一的一个"
第二个 Mirai:尝试占用同一个端口 → 失败
              → "已经有人在这里了"
              → 杀掉旧实例
              → 自己占用该端口
              → 成为新的唯一实例
```

新版本永远获胜,旧版本永远被杀掉,设备保持稳定。

* * *

## 第 5 部分 —— 加载三个模块

环境安全之后,Mirai 加载它的三个主要模块:

```c
attack_init();
killer_init();
scanner_init();
```

三行代码,但 **顺序** 很重要。

**`attack_init()` —— 准备武器**

想象一个士兵在任务前准备武器。他不知道命令什么时候会来,但命令一到,他必须立刻就绪。

`attack_init()` 把所有 DDoS 攻击能力加载进内存,为 UDP 洪水、TCP 洪水、HTTP 洪水准备好所需的数据结构,一切就绪,静候命令。

之后当 C2 发来 "attack 8.8.8.8" 时,攻击模块会立刻开火,没有任何准备延迟。

**`killer_init()` —— 独占设备**

它刻意在扫描器 **之前** 运行。

Mirai 并不是唯一盯上 IoT 设备的恶意软件。它进入设备时,上面可能已经有别的恶意软件在运行:别的僵尸网络、别的挖矿程序,都在消耗同样有限的内存。

`killer_init()` 把它们全部清除。竞争对手消失,内存被腾出来,设备资源完全归 Mirai 所有。

```python
killer_init() 之前:
内存:[Mirai] [其他恶意软件] [其他僵尸网络] [摄像头服务]
总计:几乎占满

killer_init() 之后:
内存:[Mirai] [摄像头服务]
总计:有大量空间用于扫描
```

**`scanner_init()` —— 开始招募**

只有在环境安全、武器就位、竞争对手被清除之后,扫描器才启动。

它开始在整个互联网上扫描随机 IP 地址,寻找下一台有漏洞的设备、下一个默认口令、下一个要加入僵尸网络的受害者。

* * *

## 第 6 部分 —— 主循环

初始化完成后,Mirai 进入一个无限循环:

```c
while (TRUE)
{
    // Stay connected to C2
    // Receive attack commands
    // Execute them
}
```

这个循环永不退出。bot 就这样待在那里,与 C2 服务器保持连接,等待命令。

它每 10 秒发送一个小的 ping:

```c
if (pings++ % 6 == 0)
    send(fd_serv, &len, sizeof(len), MSG_NOSIGNAL);
```

就像心跳:"我还活着,还连着,随时待命。"

当 C2 发来攻击命令时,循环接收它并交给 `attack_parse()`,攻击随即开始。

* * *

## 完整的 main.c 启动流程

把它们串起来:

```python
Mirai 二进制被上传并执行
            │
            ▼
1. unlink()
   从磁盘上删除自己
   在做任何事之前先消灭证据

            │
            ▼
2. 关闭看门狗
   打开 /dev/watchdog
   发送关闭信号
   不允许重启

            │
            ▼
3. 隐藏进程名
   把名字替换成随机字符串
   在进程列表里不可见

            │
            ▼
4. ensure_single_instance()
   占用控制端口
   杀掉之前的实例
   只有一个 Mirai 在运行

            │
            ▼
5. attack_init()
   把 DDoS 武器加载进内存
   随时准备接收 C2 命令

            │
            ▼
6. killer_init()
   清除竞争对手的恶意软件
   独占设备内存

            │
            ▼
7. scanner_init()
   开始扫描新的受害者
   僵尸网络自我增长

            │
            ▼
8. while(TRUE) 循环
   保持与 C2 的连接
   等待攻击命令
   执行命令
   永远如此
```

八个步骤,每一步都是刻意设计,每一步都在保护这次感染。

* * *

## 我从 main.c 学到了什么

读这段代码教会我的东西,比 Mirai 本身更重要。

攻击者是像取证调查人员那样思考的。他问自己:"如果有人发现了这台设备,他们会查什么?"

```python
他们会检查文件系统     → 先把文件删掉
他们会检查运行中的进程 → 随机化进程名
他们会查是否有重复实例 → 用固定端口保证只运行一个
```

调查人员用的每一种防御手段,攻击者都预料到了,并且在代码里绕开了。

这就是黑盒思维的极致:不是照着手册读,而是去摸清事物如何运作,深入理解整个系统,然后利用这种理解。

这种思维方式,才是 Mirai 代码如此精妙的原因。不在于复杂,而在于简单:每一行代码只做它必须做的事,不多一分。

* * *

## 小结

```python
unlink()               = 从磁盘删除文件,进程仍留在内存中
watchdog               = 设备崩溃时负责重启的硬件定时器
/dev/watchdog          = Mirai 用来关闭该定时器而打开的文件
ensure_single_instance = 占用一个端口当作旗子,杀掉旧实例
attack_init()          = 在需要之前先加载 DDoS 能力
killer_init()          = 清除竞争对手的恶意软件,独占内存
scanner_init()         = 开始扫描新的受害者
while(TRUE)            = 无限循环,永远与 C2 保持连接
```

在 **下一篇** 里,我们深入扫描器:Mirai 如何生成随机 IP 地址、它刻意避开哪些 IP 段,以及硬编码在源码中的那 63 组默认口令。

感染引擎,下篇见。

* * *

## 参考资料

-   Mirai 源码 - GitHub
-   Linux unlink() man 手册
-   Linux Watchdog 文档
-   ELF 二进制格式

* * *

*系列原文(英文)首发于 iotsec.in:https://iotsec.in/t/the-complete-mirai-botnet-series-from-zero-to-source-code/24*

## 附件

- [1_ls.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/37b21ecc0d442f6c.png) （33.07kb，0次下载）
