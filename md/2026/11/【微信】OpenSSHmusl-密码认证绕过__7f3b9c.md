---
title: 【微信】OpenSSH/musl 密码认证绕过
source: https://mp.weixin.qq.com/s/sUMLECu2KJ1e60em5ZBbbg
source_host: mp.weixin.qq.com
clip_date: 2026-11-06T13:54:25+08:00
trace_id: 6c976153-21d0-43f2-96a5-8e7453b8c8be
content_hash: 5d915e9a4c8ab1c282ba1fe9fdd83a2868d97e84ce9380df1347accd7f23f4c1
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
notion_page_id: 41075244-d011-814a-a45b-da1fc72ce96a
ioc:
  cves:
    - CVE-2026-123158
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## CVE-2026-123158 · OpenSSH/musl 密码认证绕过

**暗影安全** *2026年11月6日 12:42*

**现在就做：** 在服务器上跑一遍第 2 节的三条命令。全中 → 立刻 `apk upgrade -U -a` 并 **重启 sshd**；暂时不能升级 → 关掉密码认证并重启。只升级不重启等于没修。

## 01影响范围

一句话原理 + 谁中招、谁不用慌。

没启用 PAM 时，sshd 自己校验密码：账户没设密码（ `/etc/shadow` 字段是 `*` ），它会借别的账户的盐算一次；musl 的 `crypt()` 遇到超过 256 字节的密码会返回 `*` 表示「算不了」，两边一比相等，登录就通过了。 **攻击者不需要知道任何密码**，只要知道一个「没密码」的账户名、能连到 SSH 端口。OpenSSH < 10.6p2 受影响。

| 中招（以下条件全部满足） | 不用慌 |
| --- | --- |
| ① sshd 跑在 **musl libc** 上  <br>② **未启用 PAM** （Alpine 默认 openssh-server 就不带）  <br>③ **PasswordAuthentication yes** （默认开）  <br>④ 存在 shadow 字段 **恰为 `*`** 的账户，且系统里另有 `$5$` / `$6$` 哈希账户 | glibc / libxcrypt 系（Debian、Ubuntu、RHEL、Fedora）  <br>`UsePAM yes` 的机器  <br>Dropbear、OpenBSD  <br>已关密码认证 / 没有裸 `*` 账户 / 没有盐源  <br>锁成 `!`、`!!`、 `*LK*` 的账户 |
| **典型环境：**<br><br>Alpine Linux、OpenWrt / Buildroot / Yocto 的 musl 构建、大量 musl 容器镜像 | **升级后：**<br><br>Alpine 3.16 起所有分支都有修复包；3.21.10 / 3.22.8 / 3.23.8 / 3.24.4 已内置 |

**两个反直觉点：** 有密码的账户只是「提供盐」，被打进来的是 **没设密码** 的那个；若该账户有免密 doas/sudo（官方 tiny-cloud 镜像的 `alpine` 用户就是），一次登录直接到 root。

## 02自查方法

在目标主机本机以 root 执行，只读、不改配置、不做认证尝试。

① 是不是 musl + 无 PAM + 密码登录开着

```
ldd "$(command -v sshd)" | grep -Ei 'musl|libpam'
sshd -T | grep -Ei '^(usepam|passwordauthentication)'
```

看 `sshd -T` 的有效配置，别只看配置文件（drop-in 和 Match 块会覆盖）。出现 `musl` + `usepam no` + `passwordauthentication yes` 才继续。

② 有没有裸 `*` 账户和盐源

```swift
awk -F: '
NR==FNR { h[$1]=$2; if ($2=="*") t=t" "$1; next }
!f && h[$1] ~ /^\$/ { f=h[$1] }
END { print "目标账户:", (t ? t : "无");
      print "盐源:", (f ? substr(f,1,4) : "无") }' /etc/shadow /etc/passwd
```

目标账户非空、且盐源是 `$5$` 或 `$6$` → 条件齐备，按高危处理。

③ 版本和有没有已被登录的痕迹

```
ssh -V 2>&1
grep -E 'sshd.*Accepted password' /var/log/messages* 2>/dev/null \
  | grep -Ei 'for (root|alpine)'
```

本应无密码的账户出现 `Accepted password` 就是异常。这种攻击没有爆破噪声，别指望「连续失败 N 次」告警能报出来。 **无法排除异常登录，按已失陷处置**。

## 03修复建议

按顺序执行，动作越少越好。

A · 首选：升级并重启（Alpine）

```
apk upgrade -U -a
rc-service sshd restart
sshd -t
sshd -T | grep -i passwordauthentication
```

**升级包不会替换正在运行的 sshd 进程，必须手动重启。** 源码部署升到 >= 10.6p2 后重新编译安装并重启服务。

B · 暂时不能升级：关掉密码认证

```bash
# 先确认 SSH 密钥登录可用，保持当前会话不断开，另开终端验证成功后再执行
mkdir -p /etc/ssh/sshd_config.d
echo 'PasswordAuthentication no' > /etc/ssh/sshd_config.d/00-no-passwords.conf
sshd -t && rc-service sshd restart
sshd -T | grep -i passwordauthentication
```

最后一条应输出 `passwordauthentication no` 。Alpine 3.19 以前不读 drop-in 目录，需直接改 `/etc/ssh/sshd_config` （含 Match 块里的行），同样用 `sshd -T` 复核。建议同时把 `PermitRootLogin` 设为 `prohibit-password` 。

**四个必须记住的点**

-   **别把 shadow 里的 `*` 改成 `!`**
    
    —— 无 PAM 的 Alpine 会当成账户锁定，连合法公钥登录一起拒掉。
    
-   **升级 ≠ 修复**
    
    ，重启 sshd 才算完成。
    
-   已暴露的机器，同步查 doas/sudo 记录、新增用户、 `authorized_keys` 变更和异常文件。
    
-   官方 tiny-cloud 镜像自带 `alpine` 用户 + 免密 doas，设过任意 `$6$` 密码后就「装弹」，镜像和存量实例都要查。
