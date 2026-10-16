---
title: 【微信】红队新利器：群晖NAS ABB数据库离线解密——渗透测试人员的基础设施"直通车"
source: https://mp.weixin.qq.com/s/x3xj5HdHIuW9f1hmyPwXYA
source_host: mp.weixin.qq.com
clip_date: 2026-10-16T11:31:28+08:00
trace_id: def0c90f-14c4-4bfd-a88a-de0f96481cc4
content_hash: c2a91bbc1af2a8283193082537601c55ea10a42a793b9731818a2b0b81bd8363
status: synced
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 群晖 Active Backup for Business 的 config.db 以可离线解密的方式存储所有被备份系统的明文凭证，拿到该文件即可接管整个企业基础设施。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3fb75244-d011-818d-9716-f39f8655fd94
ioc:
  cves: []
  cwes: []
  hashes:
    - 5fed151ed24021f9fd689f18c7b0434c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 群晖 Active Backup for Business 的 config.db 以可离线解密的方式存储所有被备份系统的明文凭证，拿到该文件即可接管整个企业基础设施。
> 
> - **核心工具：** Synology-Inventory-Decryptor，输入 config.db 即可输出 ESXi、vCenter、Hyper-V、Windows/Linux、MSSQL、Oracle 的明文密码，仅在 DS920+ 上验证过。
> - **凭证金矿：** ABB 为备份必须持有各系统特权账户，config.db 内含 ESXi root、vCenter/Hyper-V 管理员、域管理员、MSSQL sa、Oracle SYSDBA 及其他 NAS 的 DSM 凭证。
> - **四条攻击路径：** NAS 拿到 Shell 后直接读库解密；窃取 .abb 备份离线提取；SMB/NFS 共享暴露 /volume1/ 直读；用默认/弱口令进 NAS 作横向跳板。
> - **加密弱点：** 硬编码种子做密钥派生、静态 IV、修改版 RC4-KSA 替换密码，参数可从 libsynoabk.so.1 提取。
> - **关键路径与用法：** config.db 位于 /var/packages/ActiveBackup/target/etc/setting/config.db；`python decrypt.py --so libsynoabk.so.1 config.db`，支持 table/json/csv 输出与 --table 过滤，需 Python≥3.10 与 cryptography。

**Hack分享吧** *2026年10月16日 09:45*

现在只对常读和星标公众号才展示大图推送，建议大家把“Hack分享吧”设为星标，否则可能看不到了！

## Synology ABB 凭证解密工具深度解析：一台NAS如何成为整个基础设施的"后门"

> **导读**：你以为群晖NAS只是个安全的备份设备？研究人员发现，Synology Active Backup for Business（ABB）的配置数据库中竟然以可解密的方式存储着所有被备份系统的明文凭证——从ESXi root到域管理员，从MSSQL sa到Oracle SYSDBA。只需拿到一个 `config.db` 文件，整个企业基础设施的钥匙就尽在掌握。

## 一、项目概述：什么是 Synology Inventory Decryptor？

**Synology-Inventory-Decryptor** 是一款后渗透利用工具，能够 **瞬间解密** 群晖 Active Backup for Business (ABB) `config.db` 数据库中存储的所有凭证，输出 ESXi、vCenter、Hyper-V、Windows/Linux 服务器、MSSQL 以及 Oracle 数据库的明文密码。

> ⚠️ **测试说明**：该工具仅在 Synology DS920+ NAS 上经过测试验证。

项目地址：https://github.com/wh0amitz/Synology-Inventory-Decryptor

* * *

## 二、为什么这很重要——群晖NAS的"凭证金矿"属性

运行 Active Backup for Business 的群晖 NAS 设备，本质上是一个 **凭证集中存储库**。为了能够对各种系统进行备份，ABB 需要拥有每一个被备份系统的特权访问权限。这意味着 `config.db` 中存储着：

-   **Hypervisor 根凭证**—— ESXi `root` 、vCenter 管理员、Hyper-V 管理员、SCVMM
    
-   **服务器操作系统凭证**—— 每台被备份的 Windows/Linux 服务器的域管理员或本地管理员账户
    
-   **数据库凭证**—— MSSQL `sa` 、Oracle `SYSDBA` 或应用级账户
    
-   **DSM 管理员凭证**—— 备份拓扑中其他群晖 NAS 设备的凭据
    

**一句话总结：攻陷一台群晖 NAS，你就拿到了整个基础设施的钥匙。**

* * *

## 三、攻击场景全景图

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/06aafb87ebce8abf.png)

### 场景1：NAS 被攻陷 → 基础设施全面接管

```
NAS 上获取 Shell → 拿到 config.db → 解密得到 ESXi root → 控制所有虚拟机
```

这是最直接的攻击路径。一旦攻击者在群晖 NAS 上获得了命令执行权限，只需读取 `config.db` 并解密，就能横向移动到整个虚拟化环境。

### 场景2：备份文件外泄

```
窃取 NAS 的 .abb 备份文件 → 从中提取 config.db → 离线解密
```

即使 NAS 本身没有被直接攻陷，如果其备份文件（.abb 格式）存储在不安全的位置，攻击者同样可以从中提取配置数据库并解密凭证。

### 场景3：共享存储 / 权限配置不当

```
SMB/NFS 共享暴露 /volume1/ → 直接读取 config.db
```

很多企业将 NAS 的卷通过 SMB 或 NFS 共享出来，如果权限配置不当，攻击者可以直接在网络上读取到 `config.db` 文件。

### 场景4：横向移动跳板

```
低权限立足点 → 通过默认凭证进入 NAS → 获取 ABB 凭证 → 域管理员 / vCenter 管理员
```

攻击者即使只有一个低权限的网络立足点，也可能利用群晖 NAS 的默认凭证或弱口令作为跳板，进而通过 ABB 凭证提升到域管理员级别。

* * *

## 四、凭证价值矩阵：解密后你能得到什么？

| 凭证类型 | 你能获得什么 | 攻击影响 |
| --- | --- | --- |
| **ESXi root** | 完整的 Hypervisor 控制权 | 快照虚拟机、提取内存、植入后门、访问所有客户机 VM |
| **vCenter 管理员** | 集中管理所有 ESXi 主机 | 整个虚拟化基础设施——迁移/克隆/快照任意 VM |
| **Hyper-V 管理员** | Windows Hypervisor 控制权 | 访问所有 Hyper-V 客户机 VM，如加入域可横向到 AD |
| **Windows 服务器登录** | 通常是域管理员或本地管理员 | 横向移动、DCSync、凭证收集、勒索软件部署 |
| **Linux 服务器登录** | Root 或具有 sudo 权限的账户 | SSH 跳板、数据外泄、持久化 |
| **MSSQL 凭证** | 数据库管理员访问权限 | 数据窃取、xp_cmdshell → OS 命令执行、链接服务器跳板 |
| **Oracle 凭证** | 数据库管理员访问权限 | 数据窃取、通过数据库功能执行 Java/OS 命令 |
| **DSM 管理员** | 其他群晖 NAS 设备 | 链式攻陷更多 NAS → 更多 ABB 实例 → 更多凭证 |

* * *

## 五、技术原理：解密是如何实现的？

该工具的实现基于对 Synology ABB 加密机制的完整逆向工程。完整的技术分析文章——包括硬编码种子、修改版 RC4-KSA 替换密码、 `EVP_BytesToKey` 密钥派生、AES-256-CBC 加密方案、静态 IV 弱点，以及 `config.db` 的数据库结构——详细记录在作者的博客中：

核心加密弱点包括：

-   使用 **硬编码种子** 进行密钥派生
    
-   采用 **静态 IV** （初始化向量），降低了加密强度
    
-   通过分析 `.so` 库文件可以提取解密所需的所有参数
    

* * *

## 六、环境要求与安装

### 系统要求

-   Python >= 3.10
    
-   cryptography >= 3.0
    

### 安装依赖

```bash
pip install cryptography
```

* * *

## 七、使用指南

### 基本语法

```css
python decrypt.py [-h] [--so PATH] [--seed HEX] [--table {inventory,device,all}]
                  [--format {table,json,csv}] [--version]
                  db
```

### 快速开始

```
# 最快方式 — 使用内置默认种子
python decrypt.py config.db

# 自动从 .so 二进制文件中提取种子
python decrypt.py --so libsynoabk.so.1 config.db

# 手动指定种子
python decrypt.py --seed 5fed151ed24021f9fd689f18c7b0434c config.db
```

### 多种输出格式

```
# 人类可读的表格形式（默认）
python decrypt.py config.db

# JSON 格式 — 适用于脚本编写和进一步处理
python decrypt.py --format json config.db

# CSV 格式 — 便于管道操作，可导入电子表格
python decrypt.py --format csv config.db > creds.csv
```

### 按表过滤

```
# 仅显示 Hypervisor（ESXi、vCenter、Hyper-V）
python decrypt.py --table inventory config.db

# 仅显示设备（服务器、虚拟机、DSM）
python decrypt.py --table device config.db
```

* * *

## 八、目标文件位置

在安装了 Active Backup for Business 的群晖 NAS 上，关键文件位于以下路径：

| 文件  | 路径  |
| --- | --- |
| `config.db` | `/var/packages/ActiveBackup/target/etc/setting/config.db` |
| `libsynoabk.so.1` | `/var/packages/ActiveBackup/target/usr/lib/libsynoabk.so.1` |

### 目标机上一键操作

```ruby
# 复制两个文件到本地进行离线解密
scp root@nas:/var/packages/ActiveBackup/target/etc/setting/config.db .
scp root@nas:/var/packages/ActiveBackup/target/usr/lib/libsynoabk.so.1 .
python decrypt.py --so libsynoabk.so.1 config.db
```

* * *

## 九、安全启示与防御建议

这个工具的曝光揭示了一个重要的安全问题： **备份系统本身往往成为最薄弱的环节**。以下是一些防御建议：

1.  **严格限制 NAS 访问权限**—— 确保只有授权人员能够访问群晖 NAS 的管理界面和 SSH
    
2.  **使用强密码并启用 MFA**—— 为 DSM 管理员账户启用双因素认证
    
3.  **定期轮换 ABB 凭证**—— 不要使用永久不变的特权账户进行备份
    
4.  **隔离备份网络**—— 将备份流量和管理接口放在独立的网络分段中
    
5.  **监控异常访问**—— 建立针对 `config.db` 文件和 ABB 配置的访问审计
    
6.  **最小权限原则**—— ABB 使用的备份账户应仅授予必要的最小权限
    

* * *

本工具仅用于 **授权的渗透测试、红队行动、应急响应和安全研究**。请仅在你拥有或获得明确书面授权的系统上使用。未经授权访问计算机系统和数据属于刑事犯罪。

* * *

**知 识 星 球**

星球已过800人，暂不再发放优惠券，如还有需要的师傅可加我VX： **S_3had0w， **等你一起来学习**...！**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d3a8885d1a2498aa.jpg)

项目推荐 · 目录

作者提示: 内容由AI生成
