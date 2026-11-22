---
title: 【微信】nginx2root 深度复盘：一个 HTTP/2 整数下溢，凭什么号称「未认证 RCE + 容器逃逸」？&&【你们绷住了吗?】
source: https://mp.weixin.qq.com/s/9mGhsz-GxRu_Wb2hOHlxdw
source_host: mp.weixin.qq.com
clip_date: 2026-11-23T00:37:39+08:00
trace_id: c70519e0-4dd4-4a78-bc07-d71c3a5265cd
content_hash: 76f245261dc66aab7b879c16289421c931568da43304db07f15ce95e67f0a4dc
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 42075244-d011-8103-aeef-d7b3a29620f3
ioc:
  cves:
    - CVE-2026-123007
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**网络安全007** *2026年11月19日 09:35*

## 先说结论：影响面是真的大，但「一键拿下 root」是真的难。别被其他标题带节奏，也别因为难复现就划走。

2026 年 11 月 18 日，nginx 的维护方 F5 在同一天放出了 mainline 1.31.9 与 stable 1.30.7 两个版本，一口气修补了 **5 个远程代码执行漏洞**，社区给了一个很炸裂的合集代号—— **nginx2root**。消息一出，几个安全应急响应中心连夜发通告、复现、写 PoC，朋友圈刷屏。

这篇文章我把技术要点一次讲透：漏洞到底怎么触发、为什么难打、以及你现在该怎么自查处置。

01先看全貌：5 个 CVE，其实是 1 + 4

五个漏洞全是 **内存破坏** 类缺陷，且每一条都能独立触发、不需要互相组合，差异只在「需要什么样的配置才会被命中」。其中真正的主角只有一个：

| CVE | 类型  | 受影响版本(OS) | 触发配置 | 关 HTTP/2 能否挡 |
| --- | --- | --- | --- | --- |
| **123007** | 整数下溢→堆越界 | 1.9.5–1.31.8 | 开启 HTTP/2 | 能   |
| 123633 | UAF | 1.19.7–1.31.8 | HTTP/2 且转发到上游 | 能   |
| 123634 | UAF | 0.6.18–1.31.8 | resolver + 请求派生 proxy_pass + mirror | 不能  |
| 121810 | UAF | 1.25.0–1.31.8 | HTTP/3 且转发到上游 | 不能  |
| 113425 | UAF | 0.5.33–1.31.8 | mail 代理 proxy on + auth_http | 不能  |

划重点： **CVE-2026-123007** 是唯一一个「基础配置就能打」的洞——它不需要后端、不需要第三方模块、不需要特殊 location，只要你开了 HTTP/2 就落入射程。其余四个是释放后使用（Use-After-Free），前置条件更苛刻，实战中反而更少见。

02拆解主战场：123007 的三步失控

这个洞藏在 `ngx_http_v2_module` 里，本质是 HTTP/2 连接级发送窗口的「账」算错了。理解它，只需要盯住三个动作：

-   nginx 在排队把响应 DATA 帧发出去时，会从 **连接级发送窗口** 里 **扣减** 额度；
    
-   客户端可以通过 `WINDOW_UPDATE` 帧 **再次补充** 这个窗口；
    
-   如果一个流在 DATA 真正发出前被 `RST_STREAM` **取消**，清理逻辑会把「已经扣掉的额度」 **重新加回** 窗口——而且不做上限校验。
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4e9352e3d728d54.png)

图 1 · HTTP/2 流控窗口整数下溢的三段式成因

于是攻击者反复构造「扣减→补充→取消归还」的组合，就能让一个 `size_t` 类型的发送窗口一路越过 31 位上限（2^31-1）。后续做剩余容量计算时发生 **无符号下溢**，窗口被推高到接近 2^64；当这个数被当成有符号的 `off_t` 长度使用时，就变成了一个 **巨大的负数**，最终喂给 TLS 输出路径的 `memcpy()` ，形成有界的 **堆越界读 + 越界写**。

有了堆越界，剩下的就是标准的现代 pwn 流程——先越界读 **泄露** 出堆、nginx 镜像和 libc 的地址（ASLR 在这里形同虚设），再越界写 **覆盖 cleanup 回调函数指针**，在请求收尾时跳转到攻击者可控的地址，以 nginx worker 权限执行任意命令。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b039a9d33bed3732.png)

图 2 · 从 HTTP/2 控制帧到宿主机 root 的完整利用链路

**关于「2root」：** worker 拿到的是普通用户权限， **到 root 不是这个 nginx 洞本身给的**。演示里是额外串联了一个 Linux 内核 `SCTP` 子系统的 UAF 才完成容器逃逸。内核这个细节 Xint 并未完全公开，也暂无对应 CVE，属于「借刀」而非「nginx 自带提权」。

03冷静一下：这颗「核弹」到底有多难打

这是我认为整件事最该讲清楚、也最容易被标题党略过的一段。 **能 RCE ≠ 能随手打。** 把公开 PoC（Rapid7 版）跑通的条件摆出来：

-   **流量离谱：**
    
    PoC 要往目标灌 上百 GB 的 HTTP/2 明文流量才能完成窗口推高与内存泄露，日志里那句 `plaintext=119.02 GiB` 不是噱头；
    
-   **挑 CPU：**
    
    现成 PoC 针对 glibc 选择 EVEX/YMM 拷贝例程的机器，还要求 `avx512f` 、 `avx512vl` 指令集，换个机器就可能不 work；
    
-   **挑布局：**
    
    完整 RCE 依赖堆布局塑造与地址泄露命中特定 profile，稳定「只崩不 RCE」倒是容易（重复触发即可）；
    
-   **演示的「几秒钟」有前提：**
    
    Xint 的短视频里攻击者和目标都在 AWS **同一区域** 的 EC2 上，同区域实例间有数十到数百 Gbps 内网带宽，才撑得起那上百 GB 流量——换个真实公网环境根本灌不动。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2282b5daf78e78d0.png)
    

翻译成人话：这个洞的 **危害下限** 是「能让 nginx worker 崩、能拒绝服务」， **危害上限** 才是「未认证 RCE」，而要摸到上限，攻击者得同时满足指令集、堆布局、超大带宽三个条件。它是「理论严重、实战昂贵」的典型。

所以下次再看到「XX2root」，先别慌，也别急着否定，问三个问题就够了：① 我的暴露面命中它的前置配置吗？② 攻击者打得动它需要的那些条件吗？③ 就算打不动 RCE，能不能被拿来打崩服务？ 三个问题把「标题恐惧」还原成「风险评估」。

04自查：三步判定你是否受影响

把「版本」和「配置」两个条件叠起来看， **同时命中** 才算真的暴露在射程内。下面这套命令可以直接抄：

第 1 步 · 看版本：是否落在 1.9.5–1.31.8

```
# 打印版本（注意：发行版常用补丁回移，nginx -v 可能不变，要对比完整包版本与发行版安全公告）nginx -v 2>&1
```

第 2 步 · 二进制里到底编没编 HTTP/2 模块

```
nginx -V 2>&1 | grep -q -- '--with-http_v2_module' \   && echo 'HTTP2_MODULE=present' || echo 'HTTP2_MODULE=absent'
```

出现 `absent` 说明这份二进制压根没有 HTTP/2 代码，123007 直接免疫；出现 `present` 再往下查配置。

第 3 步 · 配置里 HTTP/2 是不是真开着

```
sudo nginx -T 2>&1 | sed 's/#.*//' \  | grep -nE 'listen[[:space:]].*http2|^[[:space:]]*http2[[:space:]]+on[[:space:]]*;'
```

只要命中 `listen 443 ssl http2;` 或 `http2 on;`，就说明 HTTP/2 是开着的。最后再从外网验证一把可达性：

```
openssl s_client -connect {HOST}:443 -servername {HOST} -alpn h2 &1 \  | grep -E 'ALPN protocol:|No ALPN negotiated'
```

看到 `ALPN protocol: h2` = 服务器对公网接受 HTTP/2，命中； `No ALPN negotiated` = 挡在外面。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/29b6b45da69d6687.png)

图 3 · 受影响判定与处置流程

05修复与缓解：能升就升，升不动就按配置关

**首选永远是升级。** 官方 1.31.9（mainline）/ 1.30.7（stable）已覆盖全部 5 个洞；两个分支互不替代，1.31 分支不能用 1.30.7 修，1.30 之前的稳定分支已 EoTS 不再提供修复，需要跨分支升。

| 产品线 | 修复版本下限 |
| --- | --- |
| NGINX Open Source | 1.31 分支 ≥ 1.31.9；1.30 分支 ≥ 1.30.7（覆盖全部 5 个 CVE） |
| NGINX Plus | 37.0 分支 ≥ 37.0.8.1；37.1–37.2 分支 ≥ 37.3.0.1  <br>（123633 分别对应 37.0.7.1 / 37.2.0.1） |
| 遗留分支 R33–R36 | **无修复**<br><br>，必须迁移到 37.x 受支持分支 |

实在不能马上升级的，按你自己的配置选择性缓解（会牺牲部分业务功能，升级后要记得撤掉）：

-   **关 HTTP/2**
    
    （挡 123007、123633）：1.25.1+ 在每个受影响 server 块写 `http2 off;` 并去掉 listen 里的 http2 参数；更老版本直接移除 `listen ... http2` 。代价：原生 gRPC 等强依赖 HTTP/2 的业务会受影响，且要检查同一监听端口上的 **所有** server 块；
    
-   **消除请求期 DNS**
    
    （123634）：把含变量的 `proxy_pass http://$host` 改成固定 upstream；注意 `mirror_request_body on` 只能挡已测过的利用路径，并不修复缺陷本身，SSI 等也会走到同一 bug；
    
-   **关 HTTP/3 / QUIC**
    
    （121810）：移除含 quic 的 listen、 `http3 off;`、Alt-Svc 改 `clear` ，并用防火墙封 UDP 443；
    
-   **限制 mail 代理**
    
    （113425）：把 IMAP/POP3/SMTP 监听绑回环或仅放行可信 IP。
    

**两个最容易踩的坑：**  
① **reload 不顶用。** 换二进制必须 `restart` （或受支持的二进制热升级），仅 reload 不会替换正在运行的进程；而且 reload 只作用于 **新连接**，存量 HTTP/2/HTTP/3/邮件会话仍由旧 worker 处理，要确认没有 `worker process is shutting down` 残留。  
② **光看访问日志会漏。** 123007 的利用以 HTTP/2 **控制帧** 为主，默认 access log 可能 **一条记录都没有**。排查要结合连接字节统计、worker 是否 fork 了外部程序、异常退出与 core dump（利用成功后常见 `double free ... worker exited on signal 6` ）综合判断。

06给安全人的三点启示

-   **AI 挖洞时代，「量」会暴涨，「质」要自己判。**
    
    这批 nginx 漏洞由 Wiz、Rapid7、Xint 等多家独立发现，背后都有 AI 辅助的影子。以后这种「名字唬人、条件苛刻」的洞只会越来越多，研判能力比追逐热度更值钱。
    
-   **暴露面治理才是护城河。**
    
    关掉不需要的 HTTP/2 / HTTP/3、收敛 `resolver` +变量 `proxy_pass` ，本身是良好的最小化配置——它既降这类洞的面，也降所有配置类漏洞的面。
    
-   **nginx 在入口，务必把「重启」纳入变更流程。**
    
    因为 nginx 通常位于业务最前端，一个基础配置就能中的 RCE，哪怕实战门槛高，也值得在下一个维护窗口把它升上去。
    

* * *

**参考来源**  
\[1\] NGINX 官方安全公告：https://nginx.org/en/security_advisories.html  
\[2\] nginx2root 专题站：https://nginx2root.com  
\[3\] Xint Research：https://xint.io/blog/nginx2root-remote-code-execution  
\[4\] Wiz Research：https://www.wiz.io/blog/nginx-http2-rce-vulnerabilities  
\[5\] PoC 仓库：https://github.com/sfewer-r7/CVE-2026-123007

本文章仅做网络安全技术研究使用！另利用网络安全007公众号所提供的所有信息进行违法犯罪或造成任何后果及损失，均由 **使用者自身承担负责**，与网络安全007公众号 **无任何关系**，也不为其负任何责任， **请各位自重！** 公众号发表的一切文章如有侵权烦请私信联系告知，我们会立即删除并对您表达最诚挚的歉意！感谢您的理解！ **让我们一起为中国网络安全事业尽一份自己的绵薄之力！**

\---推荐阅读---

[攻防演习系列](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzI1NTE2NzQ3NQ==&action=getalbum&album_id=4480577090483748870#wechat_redirect)

[技术文章系列](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzI1NTE2NzQ3NQ==&action=getalbum&album_id=4483666897053253633#wechat_redirect)

[未授权漏洞系列](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzI1NTE2NzQ3NQ==&action=getalbum&album_id=4483456618323345413#wechat_redirect)

[HW专项系列](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzI1NTE2NzQ3NQ==&action=getalbum&album_id=4483461171911426059#wechat_redirect)

[应急响应系列](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzI1NTE2NzQ3NQ==&action=getalbum&album_id=2735815599062548484#wechat_redirect)

[工具推荐系列](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzI1NTE2NzQ3NQ==&action=getalbum&album_id=4483471065368592394#wechat_redirect)

[漏洞通告系列](https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzI1NTE2NzQ3NQ==&action=getalbum&album_id=4728706414628405252#wechat_redirect)

写作不易，分享快乐

期待你的 **分享** ● **点赞●在看 **●关注 **●收藏******

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/83ab473b1bb6a41e.png)

技术文章系列 · 目录

作者提示: 个人观点，仅供参考
