---
title: 【微信】抓 HTTPS 明文不用再安装证书
source: https://mp.weixin.qq.com/s/QnIOwZtSK4wf9S7lNBJ8gA
source_host: mp.weixin.qq.com
clip_date: 2026-11-23T10:52:38+08:00
trace_id: 9bd7a60e-6c5a-47df-87ce-fa523f54ac08
content_hash: 2f1c86b7ccc6caa84a8ee97d54ce6b9e58a829f62946e8624565a270ea1ef543
status: synced
tags:
  - 微信
  - Hook
  - Linux安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: eCapture v2.10.0 用 eBPF uprobe 钩住 libssl 等 TLS 库的读写函数，直接从进程里取到明文，绕过 MITM 代理，也不用安装 CA 证书。
ai_summary_style: key-points:weak
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 42175244-d011-81f1-8c83-da6e259be79b
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> eCapture v2.10.0 用 eBPF uprobe 钩住 libssl 等 TLS 库的读写函数，直接从进程里取到明文，绕过 MITM 代理，也不用安装 CA 证书。
> 
> - **原理与限制：** 用户态程序在内核 eBPF 探针上挂钩 SSL_read/SSL_write/SSL_do_handshake；需要 root 或特定 capability，内核版本要求 x86_64 ≥4.18、aarch64 ≥5.5、LoongArch ≥6.6，Windows 与 macOS 原生不支持。
> - **模块覆盖：** 除 OpenSSL/LibreSSL/BoringSSL 外，还支持 Go 自带 TLS、GnuTLS、NSS，以及 bash/zsh 命令行、mysqld 与 PostgreSQL 查询语句；后几项是常被忽略的凭据泄露面。
> - **输出与联调：** 支持 text（可配 `--text-source=pcapng` 重建 HTTP/1.1、HTTP/2 与 QUIC）、keylog（供 tshark 实时解密）、pcapng 三种形态；官方验证流程用 editcap `--extract-secrets` 抽密钥后 tshark 跟随 TLS 流。
> - **v2.10.0 更新：** 增加 LoongArch 专用 CI 与 LLVM 22 交叉编译、实测 GnuTLS 3.8.10–3.8.13 布局、改进 pcapng 文本输出并验证 QUIC v1/v2，补齐最小权限、防御检测、性能基线、发布校验四篇文档。
> - **边界与检测：** ECH 加密 Client Hello 抓不到，DTLS 不等于能解 WebRTC，零长度 client-CID 的 QUIC 回环问题仍在；防御侧可用 `bpftool prog list | grep -i uprobe`、查 uprobe_events、auditd 监控 bpf() 系统调用，或设 `kernel.unprivileged_bpf_disabled=1`。
> - **Android 与客户端：** 设备 root 后可跑 x86_64/arm64 版；eCaptureQ 图形客户端以“远程模式”让 Windows/macOS 用户本地交互、远端 Linux 采样。

**黑白之道** *2026年11月20日 08:42*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**:eCapture v2.10.0 发布:用 eBPF 挂 uprobe 直接钩出 TLS 明文,不用代理不用装 CA 证书,Linux 与安卓通吃,附下载链接。

* * *

## 一个不用装证书的"抓包"工具

11 月 7 日,eCapture(中文名"旁观者")发布 v2.10.0。这是作者 gojue 挂在 GitHub 上的开源项目,Apache-2.0 协议,2022 年建仓,如今攒下 15500 多颗星、1600 多个 fork,官网 ecapture.cc 同步更新。

它的自我介绍很短:Capture SSL/TLS plaintext with eBPF—no MITM proxy or custom CA installation。翻译成人话:传统抓包要么做中间人代理,要么往系统里塞自签 CA 证书,过程总会留下痕迹;eCapture 换了个思路,在内核里给 TLS 库的读写函数挂 uprobe,进程自己把明文交出来。

## 原理:在内核态挂 uprobe

![eCapture 工作原理,用户态挂载与内核态探针](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb89f5982ff873ea.png "eCapture 工作原理,用户态挂载与内核态探针")

*(图源:eCapture 官方仓库)*

如图,eCapture 本体跑在用户态,真正干活的是内核里的 eBPF 程序:探针挂到 libssl.so 这类共享库的 SSL_read、SSL_write、SSL_do_handshake 上,进程调用这些函数时数据被顺手抄一份。对目标程序来说,它只是"多了一次函数调用",不用改代码、不用装证书、也不用改路由。

代价同样直白:要 root 或特定的 Linux capability;内核要求 x86_64 4.18 以上、aarch64 5.5 以上、LoongArch 6.6 以上;Windows 和 macOS 不支持。

## 八个模块,不只抓 HTTPS

| 模块  | 抓什么 |
| --- | --- |
| tls | OpenSSL/LibreSSL/BoringSSL 明文,支持 1.0.x、1.1.x、3.0.x |
| gotls | Go 程序自带的 TLS/HTTPS 明文 |
| gnutls | GnuTLS 明文,同样不需要 CA |
| nss | NSS/NSPR 明文(curl 底层那套) |
| bash / zsh | 终端里敲的每一条命令 |
| mysqld | MySQL 5.6/5.7/8.0 与 MariaDB 查询语句 |
| postgres | PostgreSQL 10+ 查询语句 |

后面这几行才常被忽略:bash 和 zsh 抓的是命令行本身,那条 curl 里的 token、那句 export SECRET=xxx,会原样落到屏幕上;mysqld 和 postgres 抓的是 SQL,谁在半夜导出用户表,一眼就清楚。

## 三种输出,对接不同的下游

eCapture 有三种输出形态:text 模式直接打明文,配合 `--text-source=pcapng` 还能从实时流量里重建完整的 HTTP/1.1、HTTP/2 乃至 HTTP/3(QUIC)消息;keylog 模式把 TLS 握手密钥存成 keylog 文件,可喂给 tshark 实时解密;pcapng 模式把加密包和密钥一起写成 pcap-NG,Wireshark 打开即看。

![eCapture 实际抓到的 HTTP/2 明文](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c08d1424e609c45c.png "eCapture 实际抓到的 HTTP/2 明文")

*(图源:eCapture 官网演示)*

命令并不复杂:

```
sudo ecapture tls
sudo ecapture tls -m text --text-source=pcapng -i eth0 --eventaddr /tmp/http.events 'tcp port 443'
sudo ecapture tls -m pcap -i eth0 --pcapfile=ecapture.pcapng tcp port 443
```

![Wireshark 打开 eCapture 抓到的 pcapng](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/195f437b9bad75c6.png "Wireshark 打开 eCapture 抓到的 pcapng")

*(图源:eCapture 官方仓库)*

官方还给了标准验证流程:先用 `--pcapfile` 存下原始 pcapng,再用 editcap 抽出内嵌密钥,最后让 tshark 跟随 TLS 流:

```bash
keys=$(mktemp)
editcap --extract-secrets /tmp/raw.pcapng - >"$keys"
tshark -n -r /tmp/raw.pcapng -o "tls.keylog_file:$keys" -q -z follow,tls,ascii,0
rm -f -- "$keys"
```

v2.10.0 主要做了四件事:给 LoongArch 配专用 CI runner 并用 LLVM 22 交叉编译,补上 GnuTLS 3.8.10 至 3.8.13 的实测布局支持,改进 pcapng 文本输出并验证 QUIC v1/v2,同时把最小权限、防御检测、性能基线、发布校验四篇文档补齐。

边界也得说清楚:ECH(加密 Client Hello)仍需 ECH_SECRET/ECH_CONFIG 素材,当前探针抓不到;DTLS/DATAGRAM 不等于能解 WebRTC;v1.4.0 遗留的零长度 client-CID 的 QUIC 回环抓取连接路由失败问题依旧。指望它"什么都能解"就失望了。

## 安卓也能跑,桌面另开一扇门

![eCapture 在 Android 上抓 HTTPS 明文](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8e153cf729130b06.png "eCapture 在 Android 上抓 HTTPS 明文")

*(图源:eCapture 官方仓库)*

Android 的 x86_64 与 arm64 同样支持,前提是设备已经 root。项目另有一个 Rust + Tauri + React 写的图形客户端 eCaptureQ,Windows 和 macOS 用户可以用"远程模式":界面在本地,采样在远端 Linux 主机上完成。

## 下载地址

仓库:https://github.com/gojue/ecapture (Apache-2.0,官网 https://ecapture.cc) v2.10.0 发布页:https://github.com/gojue/ecapture/releases/tag/v2.10.0

| 平台  | 下载包直链 |
| --- | --- |
| Linux x86_64 | https://github.com/gojue/ecapture/releases/download/v2.10.0/ecapture-v2.10.0-linux-amd64.tar.gz |
| Linux arm64 | https://github.com/gojue/ecapture/releases/download/v2.10.0/ecapture-v2.10.0-linux-arm64.tar.gz |
| Linux loong64 | https://github.com/gojue/ecapture/releases/download/v2.10.0/ecapture-v2.10.0-linux-loong64.tar.gz |
| Android amd64 | https://github.com/gojue/ecapture/releases/download/v2.10.0/ecapture-v2.10.0-android-amd64.tar.gz |
| Android arm64 | https://github.com/gojue/ecapture/releases/download/v2.10.0/ecapture-v2.10.0-android-arm64.tar.gz |
| Debian/Ubuntu | ecapture_v2.10.0_linux_amd64.deb / \_arm64.deb / \_loong64.deb |
| 校验文件 | checksum-v2.10.0.txt(与压缩包同目录) |

Docker 镜像同步上架:

```bash
docker pull gojue/ecapture:latest
docker run --rm --privileged=true --net=host -v ${HOST_PATH}:${CONTAINER_PATH} gojue/ecapture ARGS
```

注意 README 对 `--privileged=true` 挂了警告:那等于把宿主机整个交出去,生产环境请按最小权限文档改用精确 capability。

## 紫队怎么看

从红队视角,eCapture 解决的是一个老问题:很多 App 和脚本做了证书绑定,中间人代理一装就被识破,而它不碰证书链,直接从进程内存门口抄明文;bash 与 postgres 模块更是把"密码从哪漏出去的"降维成看屏幕。

从蓝队视角,这把刀是双刃的:拿它做数据外泄排查、密钥使用审计、密码合规检查,都是官方文档鼓励的用法;同一把刀落到别人手里,就是无感的流量监听。

好在检测有现成路径:

```bash
sudo bpftool prog list | grep -i uprobe
sudo cat /sys/kernel/debug/tracing/uprobe_events | grep -E "ssl|SSL|gnutls|nspr"
sudo auditctl -a always,exit -F arch=b64 -S bpf -k bpf_activity
```

不需要 eBPF 的机器,直接关掉非特权 bpf:`kernel.unprivileged_bpf_disabled=1`;需要它的机器,用 AppArmor 拒绝 bpf() 的 capability,或用 auditd 对 bpf() 系统调用和该二进制执行做告警。

最后一句法律提醒:在自己或书面授权的系统上用它做审计,和拿它去抓别人的流量,是性质完全不同的两件事。前者是工具,后者是犯罪。

**版权声明**:本文由华盟网原创发布,保留所有权利。文中配图来自 eCapture 开源项目仓库与官网(Apache-2.0 协议),经裁切排版后引用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

Tools · 目录
