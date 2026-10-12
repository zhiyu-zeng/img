---
title: 【微信】Eufy HomeBase 2 固件逆向：拆芯片、绕 UART 上锁、建调试环境
source: https://mp.weixin.qq.com/s/u6lnxVAzoxN5AmS94GOTZw
source_host: mp.weixin.qq.com
clip_date: 2026-10-12T08:58:18+08:00
trace_id: 34ebc9d1-b34b-43eb-b938-f54afe5326eb
content_hash: a31451e62cbb429f5f11131e810bb8c550d0d538f1ff4782495aeb6c8418feac
status: synced
tags:
  - 微信
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Eufy HomeBase 2 固件逆向完整链路：离线读闪存、逆向 Wi-Fi 密码算法、改 recovery 镜像绕过 UART 上锁拿 root，再搭起可跑主程序的调试环境。
ai_summary_style: key-points
images_status:
  total: 20
  succeeded: 20
  failed_urls: []
notion_page_id: 3f775244-d011-81db-8096-efea9111be02
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Eufy HomeBase 2 固件逆向完整链路：离线读闪存、逆向 Wi-Fi 密码算法、改 recovery 镜像绕过 UART 上锁拿 root，再搭起可跑主程序的调试环境。
> 
> - **硬件与固件提取：** 目标为 HomeBase 2（固件 3.4.2.2h），闪存 Winbond 25Q256JWEQ（256Mb/32MB）、SoC 为 MT7628；带电弹簧夹读取三次校验和不一致，只能拆芯片用树莓派 SPI0 离线读，代价是 0x500000 处 64KB 损坏。
> - **密码算法：** `set_wifi_pwd` 中 device_type==0x0C 时用 `z8GetSN()`（I2C 命令 0xC1 读回 0x11 字节 e-fuse）作 message、硬件序列号 T8010XXX 作 key 跑 HMAC-SHA256，再用去 padding 的自定义 Base64 字母表（含 `-_`）编码为 32 字符，写回 NVRAM 的 `WPAPSK1`，SSID 格式 `OCEAN_XXXXXX`。
> - **UART 上锁绕过：** `/sbin/login.sh` 要求 NVRAM `debug_log=1` 或存在 `/mnt/enable_console` 才进 login，否则死循环；因主镜像损坏、0xe70000 的 recovery 镜像完好，改其 login.sh 条件为恒真并把 `/bin/login` 换成 `/bin/sh`，重算 uImage 头与 payload CRC32 后烧回，bootloader 自动 fallback 即得 root shell。
> - **调试环境：** recovery 内 BusyBox 为阉割版且模块未加载；用 wget 拉扩展 BusyBox 与 rootfs，解压到 `/media/homeapp-debug/rootfs`，bind mount `/dev /proc /sys /etc /var /tmp /media`，并将 `vm.overcommit_ratio` 由 50 调至 75，约三小时试错后跑起 homeapp_security，流程已脚本化为 homeapp-restore-v5.sh。
> - **暴露面与后续：** `netstat -lntup` 显示 9000/554（pushMuxer，RTSP）、23（telnetd）、53（dnsmasq）及 10400-32392 等端口；推入 MIPS GDB attach 到 homeapp_security 以调试 MAC 白名单校验逻辑。

**黑白之道** *2026年10月12日 08:40*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：Adepts of 0xCC 团队把 Eufy HomeBase 2（智能门铃的中控中枢）拆了个底朝天：先拆掉 Winbond 25Q256JWEQ（一种常用的 256Mb 串行 NOR 闪存芯片）闪存芯片读出 32 MB 固件，再逆向 Wi-Fi 密码生成算法（HMAC-SHA256 加密 + 自定义字母表 Base64 编码），接着改 U-Boot recovery 镜像绕过 UART 上锁拿到 root shell，最后用 BusyBox + bind mount 在原始硬件上跑起完整的 homeapp_security 服务。整套流程串起来就是智能家居硬件渗透的标准剧本。

* * *

## 一、目标与准备工作

作者分析的是 HomeBase 2（firmware 3.4.2.2h，2026-06-05 发布），而不是更新款的 HomeBase 3。原因是 HomeBase 2 在当地最容易买到。本文需要先读过上一篇门铃固件分析（"From your doorbell to your home network"），很多上下文都建立在前文基础上。

目标硬件清单：

-   **闪存芯片**：Winbond 25Q256JWEQ（封装 WSON8，尺寸 8.6 mm）
    
-   **处理器**：MT7628（联发科 MIPS 架构 SoC）
    
-   **闪存容量**：256 Mbit（32 MB）
    
-   **编程器**：树莓派 SPI0 接口
    

拆芯片之前作者先尝试了带电读取——用弹簧夹夹住芯片、用橡皮筋固定，配合树莓派 SPI 接口读闪存。但带电读取时三次 dump（内存镜像）的校验和全不一样，是典型的"读出垃圾数据"症状。原因很简单：板载电源同时激活了其他元器件，干扰了正常读取。最后只能让作者的内兄（Óscar Lestón）硬着头皮把闪存芯片拆下来离线读取。

![用弹簧夹和橡皮筋临时搭出来的读固件装置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e00a4a3f41051d1.png "用弹簧夹和橡皮筋临时搭出来的读固件装置") ![脱焊过程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5cd4d7b6b7ae04bf.jpg "脱焊过程") ![拆下来的闪存芯片——看着损坏严重，实际上还能读](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f060fd35c79e6ede.jpg "拆下来的闪存芯片——看着损坏严重，实际上还能读") ![用树莓派离线读取闪存芯片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/31805e9f59f273b1.jpg "用树莓派离线读取闪存芯片")

### 1.1 64 KB 损坏

芯片拆下来之后离线读取三次，三次校验和完全一致。但代价是：地址 0x500000 处的 64 KB 块在拆芯片过程中被损坏了，Binwalk 解出来是缺一块的数据。

按理说这是灾难性的——这块地址刚好是主 image 的加载位置。但后续分析发现 0xe70000 位置还有一个小一点的 recovery 镜像完好无损。这就引出了后文绕过 UART 上锁的招数：既然主镜像坏了，那就把恢复镜像改成我们的后门版本，让 bootloader 去加载它。

* * *

## 二、固件结构与提取

固件镜像 32 MB，Binwalk 扫一遍能识别出三段有价值的部分：

| 偏移  | 类型  | 说明  |
| --- | --- | --- |
| 0x14580 | U-Boot 1.1.3 字符串 | 启动加载器版本 |
| 0x2E1D92 | XZ 压缩流 | 11,514,432 字节 |
| 0xE70000 | uImage 内核镜像 | 3.4 MB，MIPS32，LZMA 压缩 |
| 0x1440000 | JFFS2 文件系统 | 12,255,244 字节 |

作者嫌逐个解 XZ 流太麻烦，直接上 7z：

```
7z e -y -o7z_mandanga homestation2_firmware00.bin
```

7z 把整个固件 blob 当成一个超长压缩包暴力展开，输出 42 MB 的展开文件，后面所有 strings/grep 都直接在这份 blob 上跑。这种"把整个 firmware 当大杂烩搜"的做法看着土，但对定位字符串确实快。

* * *

## 三、逆向 Wi-Fi 密码生成算法

Eufy HomeBase 启动后会广播一个 SSID/密码对供门铃配网：

-   **SSID 格式**： `OCEAN_XXXXXX` （XXXXXX 是 MAC 地址后三段）
    
-   **Wi-Fi 加密**：WPA2-PSK
    
-   **默认密码变量**：NVRAM（Non-Volatile RAM，非易失随机存储器）变量 `WPAPSK1`
    

作者上一篇文章分析过 2024 年的密码算法，这次要确认 Eufy 是不是换了更安全的版本。

### 3.1 字符串搜索锁定关键变量

跑两个 grep 就能定位算法相关字符串：

```
strings homestation2_firmware00.bin | grep "OCEAN_"
# 输出 OCEAN_TEST_* 错误信息和 ssid_prefix="OCEAN_"
```

在反汇编出来的 ELF（carve_wifi.py 脚本会从前一个 ELF 头找下一个 ELF 头，截出可分析的二进制）里搜 `WPAPSK1` ，直接定位到目标函数：

```
set_wifi_pwd    33    1524   sym.set_wifi_pwd
```

### 3.2 算法逻辑分支

`set_wifi_pwd` 函数 0x0053b510 有个关键判断：

```
if (base_param->device_type == 0x0C) {
    // 走 z8GetSN() 分支
    serial = z8GetSN();
    password = mac_func(serial, hub_sn);
} else {
    // 走 MAC 地址分支
    password = mac_func(mac_addr, hub_sn);
}
```

HomeBase 2 命中第一个分支，所以密码依赖两个值：

1.  **z8GetSN()** 返回的序列号（17 字节）
    
2.  **HomeBase 的硬件序列号** （T8010XXX 格式，可预测）
    

### 3.3 z8GetSN()：I2C 取序列号

`z8GetSN()` 走的是 I2C（一种两线制串行通信协议）通道，发送命令 0xC1 给某个外设芯片，读回 0x11 字节。这段数据其实就是 Z8 系列微控制器里的 e-fuse 值（出厂烧死的只读标识），每台机器都不一样，但同一批次之间可能有规律。

![不同设备型号走不同分支](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/82f38412fb76b9b2.png "不同设备型号走不同分支") ![通过 I2C 提取序列号](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9c5129e1cf3864a9.png "通过 I2C 提取序列号")

### 3.4 HMAC-SHA256 + 自定义 Base64

![I2C 返回值与设备序列号作为 mac\_func 参数](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d85e6ed507953f26.png "I2C 返回值与设备序列号作为 mac_func 参数")

`mac_func()` 把两个字符串拼起来跑 HMAC-SHA256（一种基于 SHA-256 的带密钥哈希算法）：

-   **message**：z8GetSN() 返回值
    
-   **key**：HomeBase 硬件序列号 T8010XXX
    

![HMAC SHA256 调用](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/19c35cf6e4a250c0.png "HMAC SHA256 调用") ![编码内存内容](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/760dc71e223675ea.png "编码内存内容")

HMAC 结果再走一遍自定义 Base64 编码，字母表非常规：

```
ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_
```

标准的 urlsafe_b64 用 `-_` 替换 `+/` ，但这个实现去掉了 `=` padding 也去掉了 `+/` ，纯字母数字加 `-_` ，长度正好 32 字符。最后密码写回 NVRAM，再用 `iwpriv ra0 set WPAPSK=%s` 触发无线配置更新。

![更新 NVRAM 中的 WPAPSK1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f671330daf845e6f.png "更新 NVRAM 中的 WPAPSK1")

### 3.5 已知未知

唯一没法预测的就是 z8GetSN() 返回值。硬件序列号是可预测的（按设备类型有固定模板），但 I2C 读到的 e-fuse 字节得真机读取或者从别的渠道获取。所以密码生成算法不是完全可重放的——但只要有一台目标机器 + I2C 总线访问权，就能稳定生成其他机器的密码。

* * *

## 四、绕过 UART 上锁

上一篇文章的结尾留了一个坑：HomeBase 2 的 UART（Universal Asynchronous Receiver/Transmitter，通用异步收发传输器，是芯片内置的串口调试通道）连上去会卡在 "Please press Enter to activate this console" 的死循环：

```
starting pid 5617, tty '/dev/ttyS1': '/sbin/login.sh'
process '/sbin/login.sh' (pid 5617) exited. Scheduling for restart.
Please press Enter to activate this console.
```

按 Enter → login.sh 跑 → 退出 → 重启 login.sh，无限循环。这是一道 shell 前的关卡：检查 NVRAM 变量 `debug_log` 是否为 1 或 `/mnt/enable_console` 文件是否存在，两个条件都不满足直接退出循环。

### 4.1 上锁逻辑

UART 锁定逻辑写在 `/sbin/login.sh` ：

```bash
DEBUG_LOG="`nvram_get debug_log`"
if [ "$DEBUG_LOG" = "1" -o -f "/mnt/enable_console" ]; then
    echo "enter debug mode"
    /bin/login
fi
```

要想进入 shell，必须同时满足 NVRAM 调试开关或文件系统标记。这两条路都不太好走：NVRAM 变量没找到直接的设置接口，而 `/mnt/enable_console` 文件需要先有文件系统访问权，典型的鸡生蛋问题。

文档里还提到另一种远程开启方式——基于 ARP（Address Resolution Protocol，地址解析协议）的私有协议，用私钥签名的"魔法包"互相握手。作者原话吐槽："不确定他们到底吸了什么。"

### 4.2 既然绕不过去，那就改固件

既然上锁逻辑在固件里，那就直接把这段判断抹掉。作者思路很直接：

1.  recovery 镜像 0xe70000 完好
    
2.  把它的 login.sh 改成无条件进 shell
    
3.  烧回闪存芯片
    
4.  主镜像因为 64 KB 损坏 boot 不起来，bootloader 自动 fallback 到 recovery
    

recovery 镜像是个标准的 U-Boot uImage，64 字节头加 LZMA 压缩 payload：

| 偏移  | 长度  | 字段  | 值   |
| --- | --- | --- | --- |
| 0x00 | 4   | Magic | 0x27051956 |
| 0x04 | 4   | Header CRC32 | 0xe764e161 |
| 0x10 | 4   | 加载地址 | 0x80000000 |
| 0x18 | 4   | Payload CRC32 | 0x19b650c3 |
| 0x1C | 4   | OS/类型/压缩 | 05 05 02 03 |

payload 是套娃压缩——XZ 里套 cpio（一种简单的归档格式），cpio 里再套另一个 XZ，最终才是我们要改的 initramfs。改完 payload 之后还要重新算 CRC32 并把头里的 Header CRC32 也更新，否则 bootloader 拒绝加载。

![recovery 镜像的多层压缩结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/faa1d2fadae8f215.png "recovery 镜像的多层压缩结构")

### 4.3 最小改动

作者把改动压到最小——只改 login.sh 里那两个字符串：

```toml
old_condition = b'if [ "$DEBUG_LOG" = "1" ];then'
new_condition = b'if [ 1 = 1 ];then' + b' ' * 13   # 保持长度一致

old_login = b'\t/bin/login\n'
new_login = b'\t/bin/sh\n'
```

把条件改成永远为真，把 `/bin/login` 直接换成 `/bin/sh` ，跳过密码输入。改完在电脑上用 QEMU 模拟跑了一遍确认能正常解压。

### 4.4 烧写闪存

闪存芯片有写保护，要按文档接法拉高 WP 引脚才能烧：

![关写保护的接线图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/39ad2b0ed30d1221.jpg "关写保护的接线图") ![用编程器把改过的 recovery 镜像烧回去](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2115eb7e1c9c37a6.png "用编程器把改过的 recovery 镜像烧回去")

烧完读三次验证，再焊回板子：

![把芯片焊回板子](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/578591cc8839fe75.jpg "把芯片焊回板子")

插上 USB-TTL 串口线开机，主镜像果然因为损坏加载失败，fallback 到 recovery，然后直接拿到 root shell：

![成功进入管理 shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ff0c2fd58e7cb51b.png "成功进入管理 shell")

* * *

## 五、用 BusyBox + bind mount 搭调试环境

拿到 shell 还不够。recovery 镜像里的 BusyBox 是阉割版，缺一堆调试工具；文件系统没挂载，homeapp_security 服务依赖的 Wi-Fi 和 I2C 内核模块也都没加载。直接在这种环境下跑主程序会立即崩。

### 5.1 环境搭建思路

作者拿了一台 2015 年从西班牙电信（Telefónica）薅来的 TP-Link 路由器当本地服务器，把编译好的扩展 BusyBox、rootfs 压缩包、几个辅助脚本挂到 HTTP 服务：

![简陋的本地网络环境](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6ce68e3f40281ec0.jpg "简陋的本地网络环境")

思路分三步：

1.  用 `wget` 从本地 HTTP 拉一份扩展 BusyBox 和 rootfs tar 包
    
2.  解压到 `/media/homeapp-debug/rootfs`
    
3.  bind mount 把 `/dev /proc /sys /etc /var /tmp /media` 全挂到 rootfs 里，伪造一个"完整"的文件系统视图
    

为了凑内存还要把 `vm.overcommit_ratio` 从 50 调到 75，让内核允许更多超额内存分配。

![从改过的固件到主程序跑起来的完整流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/22f92ef81a2beb9c.png "从改过的固件到主程序跑起来的完整流程")

整个过程试错三小时才成功把 homeapp_security 拉起来。作者事后把 picocom 日志丢给 Codex 整理成了 homeapp-restore-v5.sh 自动化脚本——下一个玩这台设备的人就能一键还原环境，不用从头试错。

### 5.2 服务起来之后的网络暴露面

环境搭好之后跑 `netstat -lntup` ，能看到以下监听端口：

| 端口  | 进程  | 协议  | 用途  |
| --- | --- | --- | --- |
| 9000 | pushMuxer | TCP | 推送代理 |
| 554 | pushMuxer | TCP | RTSP 流媒体（暴露！） |
| 23  | telnetd | TCP | Telnet 服务（暴露！） |
| 53  | dnsmasq | TCP/UDP | DNS 服务 |
| 10400-32392 | home_security | TCP/UDP | 多个内部端口 |
| 5000 | mips_collector | TCP | 本地采集器 |
| 21200/32380 | home_security | UDP | 内部 UDP |

RTSP（Real Time Streaming Protocol，实时流媒体传输协议）和 Telnet 直接对外监听，作者特意标了出来——这两口子开了等于把摄像头流和远程 shell 拱手让人。后面的攻击面分析会基于这个环境做。

### 5.3 GDB 调试

最后一步是把为 MIPS 编译的 GDB 推到设备上，attach 到 homeapp_security 进程。从 UART shell 推到设备：

![在 HomeBase2 上跑 GDB](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d6cf41b3e029270d.png "在 HomeBase2 上跑 GDB")

有了 GDB 就能设断点、看调用栈、修内存，再去捅那些启动时检查 MAC 白名单的逻辑（设备会按 MAC 表拒绝/接受通信，没配表直接拒）。整个逆向流程这才算闭环。

* * *

## 六、红队启示

这套流程串起来是智能家居硬件渗透的标准剧本：

1.  **拆芯片拿固件**：硬件不可避免的步骤，闪存里的明文往往就是全部秘密
    
2.  **逆向算法**：哪怕加密再花哨，seed 必须依赖硬件读取，物理接触就是破局点
    
3.  **改固件改密码**：recovery 镜像、备用启动路径、生产环境冗余都是潜在后门入口
    
4.  **搭调试环境**：拿到 shell 不算完，主程序跑起来才算
    

最值得记住的两个点： **recovery 镜像** 和 **Telnet/RTSP 端口**。前者是硬件厂家标配的"出问题救命"通道，攻击者完全可以拿它当永久 root 后门；后者是很多 IoT 设备调试完忘了关的标准服务，一开就是十年。

* * *

## 素材出处

1.  原文：Adepts of 0x CC《A story of wifi secrets, UART lockdowns and a damaged flash memory chip — Eufy HomeBase 2 固件逆向》（https://adepts.of0x.cc/eufy-homestation2-firmware/），作者 psyconauta（@AdeptsOf0xCC），发布于 2026-09-28
    
2.  前文：Adepts of 0x CC《From your doorbell to your home network》Eufy 门铃固件分析，2024
    
3.  Winbond 25Q256JWEQ 数据手册（256 Mbit 串行 NOR 闪存）
    
4.  MT7628 datasheet（联发科 MIPS SoC）
    
5.  Binwalk 固件分析工具文档
    
6.  U-Boot uImage 头格式说明
    

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
