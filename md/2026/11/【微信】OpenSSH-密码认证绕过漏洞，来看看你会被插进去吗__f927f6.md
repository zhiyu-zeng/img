---
title: 【微信】OpenSSH 密码认证绕过漏洞，来看看你会被插进去吗
source: https://mp.weixin.qq.com/s/qSZbWHVhNc5S-0q6GsclYw
source_host: mp.weixin.qq.com
clip_date: 2026-11-06T12:25:03+08:00
trace_id: 2af9466c-5516-402f-a97e-cd67031a2778
content_hash: ee80ccb50a21bc4c5e53614d723228ab5fed3e35f5cc80251ff802ec332b605c
status: synced
tags:
  - 微信
  - 漏洞分析
  - Linux安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: musl libc 的 crypt() 处理超长密码时返回 "*"，恰好匹配无密码账户的密码字段，导致 sshd 误判密码正确、直接放行登录。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41075244-d011-812d-bb51-f36cc63ad630
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> musl libc 的 crypt() 处理超长密码时返回 "*"，恰好匹配无密码账户的密码字段，导致 sshd 误判密码正确、直接放行登录。
> 
> - **漏洞原理：** 密码字段为 `*` 的无密码账户登录时，sshd 会对输入密码算哈希比对；musl 的 crypt() 遇到 257 字节以上的密码直接返回 `*`，与账户存储值一致，sshd 误判认证成功。不是暴力破解或内存溢出。
> - **触发条件：** 需同时满足：未启用 PAM（UsePAM no）、PasswordAuthentication yes、存在密码字段为 `*` 的无密码账户、系统中有至少一个 `$5$`/`$6$` 真实密码哈希。
> - **受影响范围：** Alpine 最易中招（尤其 tiny-cloud 镜像的 alpine 用户），OpenWrt、Buildroot、Yocto 等 musl 环境需排查；glibc 系统及使用 PAM 校验的环境基本不受影响。
> - **修复方式：** 优先升级（`apk upgrade -U -a` 后重启 sshd）；临时措施为设置 `PasswordAuthentication no`，改动后用 `sshd -t` 校验并重启，注意别断开当前会话以免自锁。
> - **事后排查：** 检查 `/var/log/messages` 中的 `Accepted password for` 记录，重点关注 root、alpine、部署及仅密钥账户，并核对 doas 记录、新建用户与授权密钥；另需区分 `*` 与 `!` 账户，`!` 不会触发此漏洞。

**喵星安全研究所** *2026年11月6日 11:31*

先说总结再看原理，这个洞最骚的地方不是技术多花，而是它专挑你以为已经锁好的门下手，257 字节乱码一塞，直接插进去

### 一、一句话总结

**glibc / PAM / 已关密码登录 / 不跑 sshd 的，可以安睡**  
**musl + 无 PAM + 密码认证开着 + 有 `*` 账户的，爬起来修**

二、原理到底是啥

对于密码字段是 \* 的无密码账户，sshd 会拿用户输入的密码去算哈希；而musl libc的crypt()遇到超过256字节的密码时，会返回 \* 表示失败。这个 \* 恰好和账户里存的 \* 完全一样，sshd 就误判“密码正确”，放行登录，懂了吗，臭弟弟

### 三、它到底在干什么

简单说：  
对那些密码字段是 `*` 的无密码账户，sshd 会拿用户输入去算哈希。  
musl 的 `crypt()` 碰到 **257 字节以上** 的密码，会直接返回一个 `*` 。  
巧的是，这个 `*` 正好和账户里存的 `*` 一模一样。  
于是 sshd 就误以为：“嗯，对上了，进来吧。”

不是暴力破解，也不是内存溢出。  
更像是几层“合理设计”叠在一起，最后把门缝挤开了。

### 四、谁能被它插进去

```powershell
必须同时满足这几条：

1）没开 PAM，或者配了 UsePAM no
2）PasswordAuthentication yes
3）存在密码字段为*的无密码账户；
4）系统里至少有一个 $5$ 或 $6$ 的真实密码哈希。
```

Alpine 最容易中招，尤其是 tiny-cloud 镜像里的alpine用户；OpenWrt、Buildroot、Yocto 这些 musl 环境也要查；Debian、Ubuntu、RHEL 这类 glibc 系统，以及用 PAM 校验密码的，基本不受影响。

### 五、怎么防止插进来

最稳的是升级

```css
apk upgrade -U -a
rc-service sshd restart
```

来不及升级，就先关密码登录

```nginx
PasswordAuthentication no
```

改完用sshd -t 检查检查，再重启，别急着断当前会话，小心把自己锁外面

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d604f260f0e31b9d.png)

### 六、怎么判断是不是第一次

去看看 `/var/log/messages` ，重点找

```nginx
Accepted password for
```

先看看root、alpine、部署账户、仅密钥账户，再顺手摸一摸doas记录、新建用户、文件变动、授权密钥。如果有痕迹，就按开口处理。

### 七、送给运营一句话

一是分清 `*` 账户和 `!` 账户；`!` 不会触发这个洞。  
二是把“无 PAM + 密码认证开启”单独列为风险项，不能只看有没有开密码登录。先把手里 Alpine 和 musl 环境的 sshd 过一遍。  
别等别人拿着 257 字节法棍，“轻轻撬开你的门”

喵星安全研究所

邀请你前往腾讯公益一起捐

金华家家都有救护员
