---
title: 【微信】一个星号，两种含义：OpenSSH 在 musl 上的认证绕过
source: https://mp.weixin.qq.com/s/Xhy5MrlqhfLmxNz4Y7EewQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T20:17:31+08:00
trace_id: f133db58-e4ac-4a9f-8256-c776f29773a5
content_hash: aa62fd30ab8923793c815c014b91eeb076ce6f314d5910f26f45d04b32acce74
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-81f0-9171-d16bd969a897
ioc:
  cves:
    - CVE-2026-123158
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**松杨网络安全资料库** *2026年11月10日 17:03*

2026 年 11 月 5 日，OpenSSH 发布 10.6p2。此版本修复的是：在 musl libc 上，只要机器里另有一个持有 `5` 或 `6` 哈希的账户， **任何 257 到 1024 字节的字符串，都能登录一个密码字段为 `*` 的账户**。不需要知道密码，不需要私钥，不需要任何凭据。

这个漏洞被研究者称作 \*sshole，编号 CVE-2026-123158。它的成因不是某一方写错了代码，而是两个都算合理的设计，在接缝处撞到了一起。

## 一、漏洞背景

`*` 出现在 `/etc/shadow` 的密码字段里，含义是「这个账户不能用密码登录」。

问题在于，这个\*是一个 **字符串**，而字符串会被比较。

| 项   | 内容  |
| --- | --- |
| 编号  | CVE-2026-123158（公开名称 \*sshole） |
| 类型  | 认证绕过 |
| 影响组件 | OpenSSH sshd，运行于 musl libc 且未启用 PAM |
| 影响版本 | 7.3p1（2016-08）至 10.6p1 |
| 修复版本 | OpenSSH 10.6p2（2026-11-05） |
| 评分  | 8.1（NVD， `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H` ） |
| 在野状态 | 已确认。CISA KEV 于 2026-11-09 收录，修复期限 2026-11-12 |

## 二、漏洞原理

`/etc/shadow` 里密码字段为 `*` 的账户，本意是禁止密码登录。但 sshd 在没有 PAM 时仍会算一次哈希再比对： `*` 取不出盐，就借另一个真实 `6` 账户的盐来算（2016 年修用户名枚举侧信道时引入），而 musl 的 `crypt()` 在密码超过 256 字节时返回 `"*"` ，两个星号相等，257 到 1024 字节的任意密码就此通过。

## 三、漏洞复现

### 环境

| 项   | 值   |
| --- | --- |
| 宿主  | Ubuntu 26.04，Docker 29.7.2 |
| 靶场  | Alpine 3.21.10 容器，平台分配宿主端口 32768 |
| sshd | OpenSSH 9.9p2，上游源码编译，未编译 PAM |
| 目标账户 | `alice`<br><br>，shadow 密码字段 `*` |
| 借盐账户 | `bob`<br><br>，真实 `6` SHA-512 哈希 |
| sshd 配置 | `PasswordAuthentication yes`<br><br>、 `PermitRootLogin no` |

### 部署没打补丁的环境

容器里装编译链，拉上游源码， `--without-pam` 编出来：

```bash
apk add --no-cache build-base openssl-dev zlib-dev linux-headers wget
wget https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-9.9p2.tar.gz
tar xzf openssh-9.9p2.tar.gz && cd openssh-9.9p2

./configure --without-pam --prefix=/opt/ssh-vuln \
    --sysconfdir=/etc/ssh --with-privsep-path=/var/empty
make -j"$(nproc)" && make install
```

确认版本：

```
$ sshd -V
OpenSSH_9.9p2, OpenSSL 3.3.7  7 Apr 2026
```

### 构造账户

```swift
adduser -D -s /bin/sh alice
adduser -D -s /bin/sh bob
echo 'bob:BobPass123!' | chpasswd
sed -i 's/^alice:![^:]*:/alice:*:/' /etc/shadow

$ awk -F: '$1=="alice"||$1=="bob"{print $1":"$2}' /etc/shadow
alice:*
bob:$6$QN2/L8MR8SNlwcmZ$lrbp09B36m1CfbRA0apqRR4ZitkyAPXZqIDtzfHvkP8aYJURFM0crP1t8Su25LO6BuQb0T5cF/.x.uEwdq4Ms1
```

### 复现结果

> **【图 1】复现结果**
> 
> ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d5fb17142ad217a3.png)

## 四、修复方式

### 官方修复逻辑

10.6p2 的补丁有两行有效逻辑：

```
#define MIN_PASSWORD_HASH_LEN   4
...
ret = encrypted_password != NULL &&
    strlen(pw_password) >= MIN_PASSWORD_HASH_LEN &&
    strcmp(encrypted_password, pw_password) == 0;
```

在 `strcmp` 之前加一道长度检查：存储的密码字段至少 4 个字符，才可能被当作有效哈希。 `*` 只有 1 个字符，直接出局。`!`、 `x` 、`!!`这些短标记也一并覆盖。

顺带还改了一处内存处理： `shadow_pw()` 返回的是静态缓冲区指针，补丁用 `xstrdup` 复制一份，结束时 `freezero` 清理，避免对静态指针做释放。

### 修复项

| 项   | 说明  |
| --- | --- |
| 存储值长度校验 | ≥ 4 才进入 `strcmp` |
| 覆盖短标记 | `*`<br><br>、`!`、 `x` 一律拒绝 |
| 内存修正 | `xstrdup`<br><br>\+ `freezero` ，不再释放静态指针 |
| 发行版回移 | 3.21 为 `9.9_p2-r1` ，3.22 为 `10.0_p1-r11` ，<br><br>3.23 为 `10.2_p1-r1` ，3.24 为 `10.3_p1-r2` ，edge 为 `10.6_p2-r0` |

### 缓解方法

暂时升不了级的环境：

```
# /etc/ssh/sshd_config.d/00-no-passwords.conf
PasswordAuthentication no
PermitRootLogin prohibit-password

rc-service sshd restart     # Alpine
```

PS： **不要把 shadow 里的 `*` 改成 `!`**。无 PAM 环境下，`!`会连带让密钥登录失效。

### 排查方法

在 musl 主机上查 `sshd` 日志，看本应无密码的账户有没有出现过 `Accepted password` ：

```
grep 'Accepted password' /var/log/messages | grep -E 'root|alpine|<你的仅密钥账户>'
```

重点核对三类账户： `root` 、Alpine 云镜像的 `alpine` 、以及任何配置为仅密钥登录的用户。
