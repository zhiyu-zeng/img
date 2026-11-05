---
title: '"sshole": password authentication bypass: OpenSSH + musl libc'
source: https://seclists.org/oss-sec/2026/q4/522
source_host: seclists.org
clip_date: 2026-11-06T06:15:57+08:00
trace_id: ee309fec-21cb-42ff-abfd-55f04435959f
content_hash: c47c2587e0dce22bbf3237324f94751b8e5e01c4e8dc1f10d2fc57dd51b67866
status: synced
tags:
  - 漏洞分析
  - Linux安全
series: null
feed_source: oss-security·漏洞披露
ai_summary: musl libc 的 crypt(3) 处理超长密码时返回 '*'，可绕过禁用 PAM 的 OpenSSH 密码认证，登录任意哈希字段为 '*' 的账户。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40f75244-d011-8134-a79e-d7dd35d9d4eb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> musl libc 的 crypt(3) 处理超长密码时返回 '*'，可绕过禁用 PAM 的 OpenSSH 密码认证，登录任意哈希字段为 '*' 的账户。
> 
> - **触发条件：** 系统使用 musl libc 且 sshd 在构建/运行时禁用了 PAM 支持，Alpine Linux 是典型的受影响系统。
> - **利用方式：** 对密码哈希字段为 '*'（无效/锁定状态）的账户，输入超过 257 个字符的密码会使 musl 的 crypt(3) 返回 '*'，恰好与存储的哈希匹配，从而认证通过。
> - **根因归属：** OpenSSH 官方认为漏洞根因在 sshd 之外（即 musl libc），但可以通过 sshd 被利用，因此仍在 OpenSSH 10.6p2 中发布关键修复。
> - **代码修复：** 新版本改为使用 MIN_PASSWORD_HASH_LEN 检查哈希长度，不再依赖 musl crypt(3) 默认返回的 "*" 值来判定。
> - **临时缓解：** 在 /etc/ssh/sshd_config 中设置 `PasswordAuthentication no` 即可规避该问题，代价是失去密码认证功能。漏洞由 Wakefield 的 Özgün Kültekin 报告。

## oss-sec mailing list archives

## "sshole": password authentication bypass: OpenSSH + musl libc

* * *

*From*: Jan Schaumann <jschauma () netmeister org>  
*Date*: Thu, 5 Nov 2026 09:14:35 -0500  

* * *

```
OpenSSH just published OpenSSH 10.6p2 with a critical
fix for a password authentication bypass on systems
that use musl libc and have PAM disabled.  Alpine
Linux has been called out as one such affected
system:

https://www.openssh.org/releasenotes.html#10.6p2

```

> ```kotlin
>  * sshd(8): avoid password authentication bypass
>  that is exploitable through sshd(8) that affects
>  some Linux systems when built and run with PAM
>  support disabled. We consider the root cause of
>  this bug to be outside sshd, but it is exploitable
>  via sshd and can be avoided there.
> 
>   This bug was reported by Özgün Kültekin of
>   Wakefield (wakefield.co)
> ```

```swift

The vulnerability itself is described here:

https://sshhole.com/

(The history of how we got here is actually fun.)

That is, for any account that has an invalid password
hash field of '*', you can log in by entering a
password >257 characters, which will cause crypt(3) in
musl libc to return '*'.


The code fix (checking for MIN_PASSWORD_HASH_LEN
instead of using musl crypt(3)'s default "*") is
here:
https://github.com/openssh/openssh-portable/commit/4353fdc43ef646c43a8dda7025cc1a898caf1482

Setting `PasswordAuthentication no` in
/etc/ssh/sshd_config mitigates the problem (at the
obvious cost of not being able to do password auth).

```

* * *

### Current thread:

-   **"sshole": password authentication bypass: OpenSSH + musl libc** *Jan Schaumann (Nov 05)*
    -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/528) *Loganaden Velvindron (Nov 05)*
