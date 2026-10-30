---
title: 【微信】Linux挖矿病毒应急排查实战【附靶机链接】
source: https://mp.weixin.qq.com/s/c1lB-AInRvMeEUS1b8KSEA
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T02:15:18+08:00
trace_id: 621b9810-cadd-4f11-b6ca-eeff782ddab6
content_hash: 388bcd565365c392d9ac26201cf3996cea825cc3ac37a1a74b162853a72482ba
status: synced
tags:
  - 微信
  - Linux安全
  - 应急响应
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 一台对外提供会员业务的服务器 CPU 长期 90% 以上，排查确认为 kdevtmpfsi 挖矿病毒，经 webshell（文件上传漏洞）植入，最终清除守护并还原攻击链。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 40975244-d011-8186-9b06-fd957fc3a664
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一台对外提供会员业务的服务器 CPU 长期 90% 以上，排查确认为 kdevtmpfsi 挖矿病毒，经 webshell（文件上传漏洞）植入，最终清除守护并还原攻击链。
> 
> - **定位挖矿：** `top -c` 发现 kdevtmpfsi 进程高占用，`ss -antp` 查看外联，并在 /tmp 发现隐藏配置 `.sysconfig.json`，其中矿池地址、钱包、线程数俱全，坐实挖矿事件。
> - **复活机制：** 直接杀进程立刻重启；守护来自定时任务脚本 `/usr/lib/.cache/.upd`（注释藏 flag{cr0n_k33ps_th3_m1n3r_al1ve}，每分钟检查挖矿程序、配置文件及 python 挖矿进程）和可疑服务 network-helper.service（同样每分钟检查一次）。
> - **入侵源头：** web 日志排查确认由文件上传漏洞植入 webshell，第二个 flag 为 flag{w3bsh3ll_1s_th3_d00r}。
> - **处置步骤：** `systemctl disable --now` 并删除 network-helper.service 后 daemon-reload；`crontab -r -u root` 清定时任务；删除 `.upd`、`.kdev.bak`、`pool.py`；`pkill -9` 杀 kdevtmpfsi 与 pool.py 并删 /tmp 落地文件；`sleep 120` 后 pgrep 验证无复活。
> - **遗留事项：** 实际应急中还需修复文件上传漏洞（由开发完成），文中因演练未做；靶机共设两个 flag。

**内存余响** *2026年10月30日 22:31*

场景：一台对外提供会员业务的服务器，CPU使用率长时间90%以上，页面卡顿。

靶机账号密码【root免密】：ir/Ir@2024

靶机地址：https://pan.baidu.com/s/1Tp2oPsiGFcn9HbXRFF5KkQ?pwd=ram6 提取码: ram6

本题共两个flag

通过查看CPU使用情况得知名为“kdevtmpfsi”的程序高度使用

查看CPU使用情况：

```css
top -c
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1ae3fdda3f64c725.png)

看外联：

```apache
ss -antp | grep 972
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/feabcd3ccd2d68fa.png)

查看目录额外发现同一时间存在另一个可疑文件，还是隐藏的：.sysconfig.json

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/35da2066441a8f53.png)

查看隐藏的配置文件：

```bash
cat /tmp/.sysconfig.json
```

矿池地址、钱包、线程数，一应俱全。到这里，进程、文件、外联三件事已经串起来了，可以确认是一起挖矿事件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/08eef2f2e7492157.png)

## 复活机制排查

像这种挖矿的一般有复活程序，不过也可以试试能不能杀掉；

尝试下，杀掉后马上就起来了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b8810c888551f669.png)

找出他的守护者，一般是两个方向：定时任务、系统服务。

定时任务有一个复活程序，在程序注释里得到一个flag

```bash
crontab -l
cat /usr/lib/.cache/.upd
```

flag{cr0n_k33ps_th3_m1n3r_al1ve}

代码分析：

复活函数，一分钟检查一次挖矿程序、配置文件、python挖矿进程及二进制挖矿程序。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8fd67597a94e3376.png)

检查下系统服务，发现可疑服务：network-helper.service

```bash
systemctl list-unit-files --type=service --state=enabled
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/aa3ddb49c006ecef.png)

查看服务详情，这个文件路径跟上面定时任务的一样，程序也是一分钟检查一次

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d3e702b7be800a89.png)

## 入侵源头追溯

排查web日志发现是文件上传漏洞造成的，这里拿到第二个flag

flag{w3bsh3ll_1s_th3_d00r}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c421c84194de5aba.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2e0ba4c82d8a976b.png)

处置环节：

1、关掉服务

```bash
systemctl disable --now network-helper.service
rm -f /etc/systemd/system/network-helper.service
systemctl daemon-reload
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f38c1dc22b54cc88.png)

2、清理定时任务

```css
crontab -r -u root
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/50f0b3f480866f4a.png)

3、删脚本与备份

```swift
rm -f /usr/lib/.cache/.upd /usr/lib/.cache/.kdev.bak
rm -f /usr/lib/.cache/pool.py
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0c2053b0076096ed.png)

4、杀进程及删除落地文件；另外需要修复漏洞，因为是应急响应练习，所以不做这一步了，实际工作中一般由开发完成。

```bash
pkill -9 -x kdevtmpfsi
pkill -9 -f 'cache/pool.py'
rm -f /tmp/kdevtmpfsi /tmp/.sysconfig.json
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/29b41267c517b2f1.png)

5、观察两分钟，看看还会不会再复活

```bash
sleep 120; pgrep -x kdevtmpfsi || echo clean
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9d9c015be69c8400.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ea14dfde2af74832.png)

还原攻击链：
