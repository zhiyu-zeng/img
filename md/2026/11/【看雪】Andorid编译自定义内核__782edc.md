---
title: 【看雪】Andorid编译自定义内核
source: https://bbs.kanxue.com/thread-293564.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-19T08:54:20+08:00
trace_id: e973f6d0-f77d-4107-833c-4ba40db908e4
content_hash: 314a3f796b7481621363ede20dee00c9b67cea0d71e563d98fa08cd3e948debf
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81cc-a996-c1126ddcc5ee
ioc: null
---

> 上次说"改源码、编译、打包、刷机，四十分钟"，很多人在后台问细节。
> 
> 这次把全流程写出来：从下载源码，到改配置，到编出镜像，到刷进手机开机。
> 
> 每一步的命令都是真机跑过的，不是抄的。

* * *

## 一、先说清楚：为什么要自己编

你可能会说：网上那么多现成内核，下载一个刷进去不就行了？

三个问题：

-   **来路不明**。别人的内核里塞了什么，你不知道。内核是最高权限，等于把 root 后门刷进手机。
-   **版本对不上**。第三方内核通常只适配某个系统版本，你一升级，全废。
-   **改不了**。想做自己的东西——比如把抓包逻辑放进内核——就得动源码。动源码，就得自己编。

一句话：

> **用别人的内核，你是在信任一个陌生人；自己编，你只需要信任编译器。**

我编内核的动机很具体：想把抓包做进内核（就是之前那篇《我把抓包做进了内核——然后卡住了》）。但不管你的动机是什么——装 KernelSU、改调度、加功能——流程都是同一条。

## 别跳过：手机不一样，内核全都不一样

**本文以下全部以小米9 为例。你如果用的不是小米9，命令不能照抄。**

不同机型差的不只是名字，几乎每个环节都要换：

| 环节  | 小米9 | 换个机型会怎样 |
| --- | --- | --- |
| 内核源码 | MiCode 仓库 `cepheus-xxx` 分支 | 一加在 OnePlus 仓库、三星要下 tar、Google 在 AOSP——仓库都不一样 |
| 源码放不放 | 小米放得全 | 有的厂商只放一部分，甚至不放（那就编不了） |
| 编译配置 | `cepheus_user_defconfig` | 每个机型一个名字，要去 `arch/arm64/configs/` 里找 |
| 编译产物 | `Image.gz-dtb` | 有的机型是 `Image.gz` 、 `Image` ，老设备还有 `zImage` |
| 内核版本 | 4.14 | 有的是 4.9、4.19、5.x，能用的编译器跟着变 |
| 打包刷入 | magiskboot 换芯 boot.img | 有的机型 dtb 在单独分区，有的还有专用打包工具 |

**但流程本身是通用的**：

```python
对版本下源码 → 原样先编过 → 只改一小步 → 换芯打包 → 刷入验证
```

你要做的，就是把这五步里的"小米9 参数"换成自己机型的参数。怎么找？搜" `你的机型` + kernel source"，能找到开源仓库的，才有得玩。

下面正式开始，小米9 全流程。

* * *

## 二、开工前：三样东西

### ① 一台 Linux 环境

Ubuntu 实体机或者 WSL2 都行，内存 16G 以上，硬盘留 50G。

装依赖，一条命令：

```bash
sudo apt install -y bc bison flex libncurses-dev \
  libssl-dev python3 python-is-python3 zip
```

### ② 和手机系统版本对上的源码分支

这是 **整个流程最容易翻车的一步**，先记住一个原则：

> **内核源码的分支，必须和手机当前系统的大版本一致。**

小米的开源内核都在 MiCode 仓库。小米9 的分支长这样：

| 分支  | 对应系统 | 内核版本 |
| --- | --- | --- |
| `cepheus-p-oss` | Android 10 (MIUI 12) | 4.14 |
| `cepheus-s-oss` | Android 12 (MIUI 13) | 4.14 |

手机上查一下自己的版本：设置 → 我的设备。 **是 12 就用 s 分支，是 10 就用 p 分支。**

分支用错是什么后果？编出来的内核和厂商分区（vendor、dtbo）对不上接口， **刷进去卡开机 logo，一卡一个准**。

### ③ 原厂 boot.img 备份

这是你的救命稻草，先准备好：

从官方线刷包（fastboot 包，卡刷包不行）里解出 `boot.img` 和 `vbmeta.img` ，放好。

**没备份就别往下看。**

* * *

## 三、下载：源码 + 编译器

源码很大，用 `--depth 1` 只拉最新一层，能省一半时间：

```bash
# 内核源码（Android 12 的 s 分支，按自己系统选）
git clone https://github.com/MiCode/Xiaomi_Kernel_OpenSource \
  -b cepheus-s-oss --depth 1 kernel
```

编译器用 Google 官方的 clang（国内走清华镜像）：

```bash
# clang
git clone https://mirrors.tuna.tsinghua.edu.cn/git/AOSP/platform/prebuilts/clang/host/linux-x86/ \
  -b android-12.0.0_r1 --depth 1 clang

# 配套的 gcc（编 dtb 等小工具用）
git clone https://mirrors.tuna.tsinghua.edu.cn/git/AOSP/platform/prebuilts/gcc/linux-x86/aarch64/aarch64-linux-android-4.9/ \
  --depth 1 gcc64
git clone https://mirrors.tuna.tsinghua.edu.cn/git/AOSP/platform/prebuilts/gcc/linux-x86/arm/arm-linux-androideabi-4.9/ \
  --depth 1 gcc32
```

**一个坑**：clang 不是越新越好。这个 4.14 的老内核，配 Android 12 年代的 clang 正好，你非要拿 clang 17 去编，报一堆看不懂的错。 **用什么年代的系统，就用什么年代的编译器。**

* * *

## 四、第一次编译：一个字都别改

新手最大的毛病是迫不及待想改东西。忍住。

**第一次的目标只有一个：原样编过。** 证明环境没问题、源码没问题，再谈自定义。

```bash
cd kernel

# 把三个编译器加进 PATH
export PATH=$PWD/../clang/bin:$PWD/../gcc64/bin:$PWD/../gcc32/bin:$PATH

# 生成默认配置（小米9 的默认配置文件就叫这个名）
make O=out ARCH=arm64 cepheus_user_defconfig

# 开编，几杯咖啡的功夫
make O=out ARCH=arm64 \
  CC=clang CLANG_TRIPLE=aarch64-linux-gnu- \
  CROSS_COMPILE=aarch64-linux-gnu- \
  CROSS_COMPILE_ARM32=arm-linux-gnueabi- \
  -j$(nproc)
```

第一次编译大概 20~40 分钟（看机器）。编完看这两个文件：

```bash
ls out/arch/arm64/boot/Image.gz-dtb   # 内核本体
ls out/arch/arm64/boot/dtbo.img       # 设备树（这次不动它）
```

**看到 `Image.gz-dtb` ，恭喜，最难的一关过了。**

### 常见报错速查

| 报错关键词 | 原因  | 解决  |
| --- | --- | --- |
| `bison: not found` / `flex` | 依赖没装全 | 回头跑第二条的 apt 命令 |
| `openssl/bio.h: No such file` | 少 libssl-dev | 同上  |
| `python: command not found` | 缺 python 软链 | 装 `python-is-python3` |
| 一堆 clang 语法报错 | 编译器太新 | 换对应年代的 clang 分支 |

* * *

## 五、自定义：改什么、怎么改

现在可以动手了。自定义有两种改法，从轻到重。

### ① 最轻的：改个版本号，先跑通全流程

强烈建议第一次刷机前，只改版本号——这样刷进手机后， `uname` 一眼就能看出"这是我自己编的"。

打开 `Makefile` ，改头四行：

```makefile
VERSION = 4
PATCHLEVEL = 14
SUBLEVEL = 343
EXTRAVERSION = -mykernel    # 原来是空的，加上自己的记号
```

然后重新编译（只需要上面那条 `make O=out ...` 命令）。

### ② 进阶：改内核配置（menuconfig）

想加功能、开模块支持，用菜单改配置：

```bash
make O=out ARCH=arm64 cepheus_user_defconfig
make O=out ARCH=arm64 menuconfig
```

进去是一个蓝底菜单， `/` 可以搜索配置项。新手值得看的几项：

-   `CONFIG_LOCALVERSION` ：版本字符串，改成自己的
-   `CONFIG_MODULES` ：允许加载.ko 模块（做内核模块必须开）
-   `CONFIG_KALLSYMS` ：符号表（调试用，一般默认开着）

改完 Save，退出，重新编译。

**一个原则**：看不懂的选项别关。厂商默认配置是能开机的底线，你关掉一个"不知道干嘛的"选项，代价可能就是卡 logo。

### ③ 装 KernelSU（以它为例，其他补丁同理）

KernelSU 官方给了一键脚本，在源码根目录跑：

```bash
curl -LSs "https://raw.githubusercontent.com/tiann/KernelSU/main/kernel/setup.sh" | bash -
```

脚本会把 KSU 源码拉进 `drivers/kernelsu` ，然后配置里打开：

```bash
make O=out ARCH=arm64 menuconfig
# 路径：Kernel hacking  →  KernelSU  →  打开
```

再编译出来的内核，刷进手机装上管理器，就是带 KSU 的自制内核了。

* * *

## 六、打包：把内核塞回 boot.img

编出来的是裸内核 `Image.gz-dtb` ，不能直接刷。要用 **magiskboot** 把原厂 boot.img 里的内核换掉，其他部分（ramdisk 等）原样保留：

```bash
mkdir repack && cd repack
cp ../boot.img .                # 原厂备份那个
cp ../kernel/out/arch/arm64/boot/Image.gz-dtb .

magiskboot unpack boot.img      # 解开，得到 kernel、ramdisk 等一堆文件
cp Image.gz-dtb kernel          # 用自己的内核顶掉原来的
magiskboot repack boot.img      # 打包 → 生成 new-boot.img
```

magiskboot 在哪？Magisk 的安装包里就有（apk 解压出来），也可以单独下个编译好的。Windows、Linux、安卓上都能跑。

**为什么不直接刷裸内核？** 因为 boot.img 是"内核 + 内存盘 + 参数头"打包成的标准镜像，手机只认这个格式。刷裸文件等于给人输错了血型。

* * *

## 七、刷入：见证时刻

手机进 fastboot（音量下 + 电源），连电脑：

```bash
fastboot devices                  # 确认能看到设备

fastboot flash boot new-boot.img  # 刷入（A/B 机器刷的是当前槽位）
fastboot reboot
```

重启后验证：

```bash
adb shell uname -r
# 输出类似：4.14.343-mykernel  ← 你自己写的记号

adb shell cat /proc/version
# 编译时间、编译主机，都是你的
```

看到 `4.14.343-mykernel` 那一刻—— **这块手机上跑的每一行内核代码，都是你自己编出来的。**

如果装了 KernelSU，管理器打开显示"工作中"，就算全流程通了。

* * *

## 八、卡 logo 了怎么办（以及怎么预防）

先说结论： **只要 bootloader 没锁，小米9 就刷不死。**

最坏情况的救援流程：

```bash
# 卡 logo → 强制重启进 fastboot（长按电源 + 音量下）
fastboot flash boot boot.img     # 刷回原厂备份
fastboot reboot
```

开机了，虚惊一场。

如果刷回原厂还是起不来，把验证也关掉再试：

```bash
fastboot flash vbmeta vbmeta.img --disable-verity --disable-verification
```

还不行，直接线刷官方完整包，一切归零重来。

### 预防清单

-   每次刷机前， `boot.img` 备份放在 **电脑上**，不要只留手机里
-   一次只改一个地方。改两处，卡 logo 了都不知道怪谁
-   换了系统版本（OTA 大版本升级），源码分支要跟着换，重新编
-   动手前想清楚：这台是主力机还是测试机？主力机别拿来做实验

* * *

## 九、全流程避坑速查

| 坑   | 症状  | 一句话解法 |
| --- | --- | --- |
| 源码分支选错 | 刷完卡 logo，刷回原厂就好 | 系统什么版本，源码什么分支 |
| clang 太新 | 编译报一堆语法错 | 用系统同年代的 clang |
| 依赖没装全 | bison/flex/openssl 报错 | apt 一条龙装齐 |
| 配置改翻车 | 卡 logo 或没 Wi-Fi/指纹 | 只改看得懂的，改前留备份 |
| 忘了备份 | 卡 logo 且没有原厂包 | 线刷官方包，数据全没 |
| OTA 后内核失效 | 升级后变回官方内核 | 正常现象，重编重刷 |

* * *

## 十、写在最后

回头看，整个流程其实就五句话：

```python
对版本下源码 → 原样先编过 → 只改一小步 → 换芯打包 → 刷入验证
```

没有什么高深的东西，难的只是 **每一步都有好几个能翻车的岔路口**，而网上教程大多默认你已经知道。

至于我编这个内核干嘛用——老读者知道，是想把抓包做进内核。内核已经能自己编了，下一步就是把那个模块编进去。 **写到哪一步了，下篇接着聊。**

**留言说说：你要是有能随便改的手机内核，第一个想改什么？**

（我先来：把 `/proc/modules` 里自己的名字藏掉。）

* * *

> 本文为内核技术研究与学习交流，涉及的设备均为本人合法持有、已解锁的测试环境。  
> 编译、刷入内核存在设备无法启动的风险，请勿在主力设备上尝试，操作前务必备份。  
> 请勿将相关技术用于任何未经授权的系统。
