---
title: "Securing Internet-Critical Software: How We Could Have Backdoored Bash"
source: https://www.hacktron.ai/blog/hacking-gnu-savannah
source_host: www.hacktron.ai
clip_date: 2026-11-01T05:21:22+08:00
trace_id: dab99864-40a8-40b1-bedc-0cae27b39562
content_hash: 31303a8010b7a4cc4f8232039b59f81d1c4247344b6e5996324cdae83b8675b1
status: synced
tags:
  - 漏洞分析
  - 供应链安全
series: null
feed_source: Hacktron·漏洞/利用研究
ai_summary: GNU Savannah（托管 Bash、Coreutils 等项目）存在命令注入漏洞：研究者用一个含反引号的邮箱地址即可拿到后端 RCE，一路提权到 root 并可向 Bash 上游仓库添加维护者 SSH key，已报告 FSF 并全部修复。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40a75244-d011-81f5-a1d2-eb0aaf9bcb36
ioc:
  cves:
    - CVE-2023-2640
    - CVE-2023-32629
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GNU Savannah（托管 Bash、Coreutils 等项目）存在命令注入漏洞：研究者用一个含反引号的邮箱地址即可拿到后端 RCE，一路提权到 root 并可向 Bash 上游仓库添加维护者 SSH key，已报告 FSF 并全部修复。
> 
> - **注入链路：** Savane 的邮箱校验器（RFC dot-atom 规则）放行反引号、`$`、`{}`、`/` 等字符；“测试 GPG key” 功能将邮箱明文拼接进命令，经 PHP `proc_open()` 以字符串形式走 `/bin/sh` 执行，反引号内命令在 gpg 启动前运行，用 `${IFS}` 绕过空格过滤
> - **横向提权：** Web shell 读取含数据库凭据的配置后，直接给自己账号设 `superuser` 标志，再借 "Become this user" 功能冒充 Bash 维护者 chet，其 SSH key 页面可授权 `bash.git` 的 push 权限
> - **内核逃逸：** Savannah 的 Trisquel 11 使用 5.15 linux-libre 内核，未修复 GameOver(lay)（CVE-2023-2640 / CVE-2023-32629），公开 exploit 一次成功拿到 root，并以 `gnubackup` 用户 SSH 登入 GNU 备份服务器
> - **漏洞窗口：** 受影响代码随 2026-03-07 发布的 Savane 3.17-c369 引入，同时波及 savannah.gnu.org 与 nongnu.org，暴露约两个月；2026-05-11 报告，次日获 FSF 确认
> - **审计总量：** 对 Savane 源码（源自 2001 年 SourceForge 代码）持续审计共 33 个发现，剔除 7 个误报后提交 26 个确认漏洞（2 critical、6 high、16 medium、2 low），FSF 于 2026-08-07 发布事故报告与补丁

**TL;DR:** GNU Savannah hosts Bash, Coreutils, and hundreds of other GNU projects. Using Hacktron, we found that an email address like ``a`touch${IFS}/tmp/savane-rce-proof`@attacker.example`` gave any registered user code execution on its backend. From there, we made our account a superuser, impersonated Bash’s maintainer, and confirmed we could add an SSH key with push access to the upstream Bash repository. An unpatched kernel gave us root access and access to a GNU backup server. We reported it to the FSF on May 11, 2026.

We then ran Hacktron’s pentest across the rest of Savane to find further bugs and reported those too, bringing the total to 26 confirmed vulnerabilities. The FSF fixed them and published an [incident report](https://static.fsf.org/nosvn/security/savannah-20260807.pdf).

Exploit chain

1.  **Regular account** savannah.gnu.org
2.  **Email address** Shell metacharacters allowed
3.  **GPG key test** Email in a shell command
4.  **Web server RCE** Database access
5.  **Superuser** Impersonate any user
6.  **Bash maintainer** Add SSH keys
7.  **OverlayFS** Unpatched kernel
8.  **Root** Savannah backend
9.  **Backup server** GNU

## Why Savannah

Savannah is where much of the GNU userland lives, including Bash and Coreutils, which provides commands such as `ls`, `cp`, and `rm`. It holds the repositories, the maintainer accounts, and the SSH keys that decide who can push. Code that lands there gets packaged by distributions and installed on millions of machines, and the [xz backdoor](https://www.openwall.com/lists/oss-security/2024/03/29/4) showed what one compromised link in that chain can do.

Like much of the infrastructure free software depends on, it’s run by a handful of volunteers and FSF staff with limited resources. We wanted to put our resources to work there. Savannah runs [Savane](https://savannah.nongnu.org/projects/administration), a PHP application that is itself free software, so we pointed Hacktron at the source and audited it.

What came back is probably the most impactful bug we’ve ever found.

## The bug: an email address that runs commands

Savane let us register with this email address:

```
a`touch${IFS}/tmp/savane-rce-proof`@attacker.example
```

You know where this is going, right?

### The validator

Savane’s email validator (`frontend/php/include/account.php:275`) accepts dot-atom addresses with characters like backticks, `$`, `{}`, `/`, and `|`. Most of these are technically allowed in the local part of an email address by the RFC, so the address above passes validation. Any user can set it at registration or through the email-change flow (`frontend/php/my/admin/change.php:271`).

### The sink

Every logged-in user can manage a GPG key for their account, and Savane offers a “Test GPG keys” button at `/my/admin/change.php?item=gpgkey`. One of the checks it runs lists key fingerprints for the email address on the account. In `frontend/php/include/gpg.php`:

```php
function test_gpg_command ($temp_dir, $command, &$ret, $in = null)
{
  $cmd = gpg_name () . " --home '$temp_dir' $command";
  ...
  $res = utils_run_proc ($cmd, $out, $err, $aux);
  ...
}

function test_listing ($temp_dir, $level, &$ret, $test_against_email = false)
{
  ...
  if ($test_against_email)
    {
      $email = user_get_email (0);
      ...
    }
  $options = '--list-keys --fingerprint';
  if ($test_against_email)
    $options .= " $email";
  $res = test_gpg_command ($temp_dir, $options, $ret);
}
```

The email is appended to `$options` as plain text, `$options` is concatenated into `$cmd`, and `utils_run_proc()` hands that string to `proc_open()`. With a string command, PHP runs it through `/bin/sh`. The shell sees our backticks and runs whatever is between them before `gpg` even starts. `${IFS}` is there because the validator rejects spaces, and the shell expands it to one.

Exploiting it takes four steps:

1.  Register with the payload above as your email address, or change an existing account’s email address to it. The app accepts it.
2.  Open `/my/admin/change.php?item=gpgkey`.
3.  Paste any GPG key and click “Test GPG keys”.
4.  The command inside the email runs on the server as the web server user.

The FSF later traced the vulnerable path to the March 7, 2026, release of Savane (3.17-c369). It affected both savannah.gnu.org and savannah.nongnu.org, so the window was about two months.

## From a shell to superuser

To see how far it went, we swapped the payload for a reverse shell and landed on the backend as the web server user.

The web server user can read Savane’s configuration, which includes the database credentials, so there was nothing to crack. We set the `superuser` flag on our own account, `harshjaiswal`, and reloaded the page.

![Logged in as superuser on savannah.gnu.org](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2e06f2fc17f145c1.webp)

Superusers get a “Become this user” box in the sidebar, which lets a site admin act as any account without its password.

## Becoming Bash’s maintainer

We typed `chet` into that box. Chet Ramey maintains Bash.

![Logged in as chet, on the Change Authorized Keys page](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/18f16c3e198f93fb.webp)

That’s his SSH key page, with an empty slot for one more. Savannah’s Git hosting is keyed off these entries, so adding a key here grants push access to `bash.git` as the maintainer. We confirmed the page accepted edits and stopped there. We did not add a key and we did not touch the repository.

An attacker in this position could have pushed a commit to upstream Bash under Chet’s name and done the same to Coreutils or any other project on Savannah.

## Root and a backup server

The web shell was unprivileged. Savannah runs Trisquel GNU/Linux 11, with a linux-libre kernel built from Ubuntu 22.04’s 5.15 LTS kernel. That kernel was still affected by [GameOver(lay)](https://www.wiz.io/blog/ubuntu-overlayfs-vulnerability), two OverlayFS bugs from 2023 (CVE-2023-2640 and CVE-2023-32629). Canonical fixed the 5.19 and 6.2 kernels back then, but the 5.15 kernel didn’t get a fix until USN-8255-1 on May 7, 2026, four days before our report. The public exploit worked on the first try and gave us root on the Savannah backend.

As root, we found a key that let us SSH to a GNU backup host as the `gnubackup` user.

![Shell on the GNU backup server as gnubackup](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee5c358e29eb8d06.webp)

At that point, we had root on the forge, access to its backups, and the ability to act as any maintainer. We stopped doing recon and wrote the report.

## The rest of Savane

The RCE was one finding of many. After the initial report, we kept Hacktron running on the Savane codebase, which descends from the 2001 SourceForge code. It produced 33 findings; we threw out 7 false positives and sent the FSF the remaining 26 (2 critical, 6 high, 16 medium, 2 low) with file paths, line numbers, and reproduction steps. The notable ones:

| ID  | Severity | Finding |
| --- | --- | --- |
| HCK-001 | Critical | Command injection to RCE through the GPG key test email |
| HCK-002 | Critical | Authorization bypass in site-wide admin group configuration (`siteadmin/triggercreation.php`) |
| HCK-003 | High | Any group member can delete the group’s mailing lists |
| HCK-004 | High | Any user can change any group’s tracker notification addresses |
| HCK-006 | High | Any group member can reset mailing list admin passwords |
| HCK-008 | High | Private file access trusts a `file_uid` parameter from the request instead of the session |
| HCK-010 | Medium | Session hijacking: cross-domain SSO passes `session_uid` and `session_hash` in the URL |
| HCK-012 | Medium | Password reset and email change confirmation hashes never expire |
| HCK-017 | Medium | Stored XSS through the real name field, which only strips `<` |

## Working with the FSF

Corwin Brust, a Savannah administrator, replied the same night. The FSF treated it as a full compromise: it patched the kernel, audited access controls, databases, and logs, and warned the operator of the other public Savane instance. The authorization bugs were fixed through a refactor rather than individual patches.

## Disclosure timeline

| Date | Event |
| --- | --- |
| 2026-03-07 | Savane 3.17-c369 ships with the vulnerable GPG key path |
| 2026-05-07 | Canonical publishes USN-8255-1, fixing GameOver(lay) in the 5.15 kernel |
| 2026-05-11 | We report RCE, root access, and access to the Bash repository to savannah-hackers-private |
| 2026-05-12 | Corwin Brust, Savannah administrator, acknowledges the report and our 30-day disclosure window |
| 2026-05-14 | FSF installs the fixed kernel and removes our account |
| May 2026 | We send the remaining 25 findings from the full Savane audit |
| 2026-06-19 | FSF publishes a statement on the incident |
| 2026-08-07 | FSF publishes its [incident report](https://static.fsf.org/nosvn/security/savannah-20260807.pdf) and the Savane patches |

Thanks to Ineiev, Corwin Brust, and Bob Proulx from the Savannah hackers and the FSF sysops for working with us.

### Work with the team behind this research

Hacktron brings together top CTF researchers, experienced red teamers, and offensive security researchers. We use AI to accelerate security research, finding and eliminating vulnerabilities in widely trusted software before malicious actors do. We’re continuing our research across the infrastructure the world depends on. If you’re responsible for securing some of it, we’d like to work with you through [red teaming](https://www.hacktron.ai/red-team), [pentests](https://www.hacktron.ai/pentests), or [AI code review](https://www.hacktron.ai/pr-review). Reach out at [hello@hacktron.ai](mailto:hello@hacktron.ai).
