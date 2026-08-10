---
title: 【微信】Vmware虚拟机镜像Linux密码Hash提取取证工具V2.0
source: https://mp.weixin.qq.com/s/F3Dar2LMAccsyMWiahDK3Q
source_host: mp.weixin.qq.com
clip_date: 2026-08-10T22:09:40+08:00
trace_id: 0a9f72ed-0b0c-43ca-8844-0cc7cdf95a4f
content_hash: 0afdac9622feee79d32fe25cbe644632a69453d59cd53499d9dd24a5544a5d84
status: synced
tags:
  - 微信
  - 安全工具
  - Linux安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "TL;DR: vmLinuxHash 是一款离线提取 Linux 虚拟机密码哈希的轻量级取证工具，支持四种磁盘镜像格式，无需启动虚拟机或 root 权限即可读取 /etc/shadow 等凭据文件。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b875244-d011-8121-bcba-c459b1efdfd3
ioc:
  cves: []
  cwes: []
  hashes:
    - 04160f238b281d882f4565e4cfe032cd0c75dc23
    - 1ad0dbea459947c8689da4aa35f1ad7e647d6c38
    - 4d956ef5353004eb74559dec3c1167fc13ea64aa
    - 7a5c3e7fb846267a52284bfe145f5c7e2e7225a7
    - cd82a64c21cd28dbcb6a860e79eb167320a4d9d5
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: vmLinuxHash 是一款离线提取 Linux 虚拟机密码哈希的轻量级取证工具，支持四种磁盘镜像格式，无需启动虚拟机或 root 权限即可读取 /etc/shadow 等凭据文件。
> 
> - **核心能力：** 支持 VMDK（SPARSE）、RAW/IMG、QCOW2、VDI 四种磁盘镜像，自动识别 MBR/GPT 分区，内置 ext4 解析器（extent 树、间接块映射、64-bit）；统一 DiskReader 接口（VmdkDisk grain、Qcow2Disk L1/L2、VdiDisk block map、RawDisk 直接偏移）。
> - **凭据提取：** 自动读取 /etc/shadow、/etc/passwd、/etc/group、/etc/gshadow，汇总显示所有用户及其哈希字段，包括锁定账户的 `*`、`!`、`!*`，不过滤锁定用户。
> - **使用方法：** 命令行格式 `vmLinuxHash.exe <disk_image_or_directory>`；传入目录时自动扫描 `*.vmdk/*.raw/*.img/*.qcow2/*.qcow/*.vdi/*.bin` 文件。
> - **实测结果：** 在 Ubuntu 24.04 VMDK+GPT 镜像上成功提取 root（yescrypt `$y$`）和 test1（SHA-512 `$6$`）真实哈希，系统账户显示锁定状态。
> - **交付与限制：** 提供 32/64 位 Windows、Linux、macOS 可执行文件及 SHA1 校验值；工具只读解析不修改镜像，需在授权范围内使用。

**幽狼之影** *2026年8月10日 21:37*

## vmLinuxHash — Linux 虚拟机密码Hash提取取证工具V2.0

vmLinuxHash 是一款用于 **离线提取 Linux 虚拟机密码Hash提取** 的轻量级取证工具。它可直接解析VMDK、RAW/IMG、QCOW2、VDI 四种主流磁盘镜像格式，在不启动虚拟机、无需 root 权限的情况下，离线读取并提取 Linux 系统中的用户凭据Hash信息，适用于红队渗透、取证分析及内部安全审计等场景。

* * *

## 1\. 功能特性

| 功能  | 说明  |
| --- | --- |
| **多格式磁盘解析** | 支持 VMDK（SPARSE）、RAW/IMG、QCOW2、VDI 四种磁盘镜像格式 |
| **双分区表支持** | 自动识别 MBR和 GPT（EFI PART）两种分区表 |
| **Ext4 文件系统读取** | 完整 ext4 解析器，支持 extent 树、间接块映射、64-bit 特性 |
| **凭据文件提取** | 自动读取 `/etc/shadow` 、 `/etc/passwd` 、 `/etc/group` 、 `/etc/gshadow` |
| **哈希汇总输出** | **显示所有用户及其 Hash 字段**<br><br>（包括锁定账户的 `*` 、`!`、`!*` ），不过滤锁定用户 |
| **目录批量处理** | 传入目录时自动扫描该目录下所有支持的磁盘镜像文件 |
| **跨平台支持** | 提供 Windows / Linux / macOS 多平台可执行文件 |

* * *

## 2\. 使用方式

### 2.1 命令行用法

```
vmLinuxHash.exe <disk_image_or_directory>
```

| 参数  | 说明  |
| --- | --- |
| `<disk_image_or_directory>` | 磁盘镜像文件路径，或包含磁盘镜像文件的目录路径 |

**支持的文件格式：** VMDK（sparse）、RAW/IMG、QCOW2、VDI

### 2.2 用法

```
Home: https://github.com/0x7556/hacktool

Usage: vmLinuxHash.exe <disk_image_or_directory>

  Supported formats: VMDK (sparse), RAW/IMG, QCOW2, VDI

Examples:
  vmLinuxHash.exe C:\VMs\Kali\Kali.vmdk
  vmLinuxHash.exe disk.qcow2
  vmLinuxHash.exe disk.vdi
  vmLinuxHash.exe disk.raw
  vmLinuxHash.exe Y:\Kali
```

### 2.3 使用示例

**示例 1：提取单个Vmware VMDK 文件**

```
vmLinuxHash.exe C:\VMs\Kali\Kali.vmdk
```

**示例 2：提取QEMU QCOW2 镜像**

```
vmLinuxHash.exe disk.qcow2
```

**示例 3：提取 VDI 镜像**

```
vmLinuxHash.exe disk.vdi
```

**示例 4：提取 RAW/IMG 镜像**

```
vmLinuxHash.exe disk.raw
```

**示例 5：提取目录下所有支持的镜像**

```
vmLinuxHash.exe Y:\Kali
```

工具会自动扫描目录下所有 `*.vmdk` 、 `*.raw` 、 `*.img` 、 `*.qcow2` 、 `*.qcow` 、 `*.vdi` 、 `*.bin` 文件，逐个解析并提取哈希。

* * *

## 3\. 输出示例

```swift
[1/1] Y:\Ubuntu\Ubuntu.vmdk
  Linux ext4 partition base offset: 2048 (LBA 4)
  Ext4: blockSize=4096 groups=7680 inodeSize=256
  --- /etc/shadow ---
  root:$y$j9T$abc...def:19865:0:99999:7:::
  kali:$y$j9T$xyz...uvw:19865:0:99999:7:::

  === Password Hashes (all accounts) ===
  root  $y$j9T$abc...def
  kali  $y$j9T$xyz...uvw
  daemon  *
  bin   *
  sys   *

Found 1 disk image file(s)
Elapsed: 12.34s
```

* * *

### 真实环境测试结果

**测试目标：** `Y:\Ubuntu 64-bit.24.04`

主磁盘 `Ubuntu 64-bit.24.04-cl1.vmdk` （VMDK + GPT 分区）成功提取：

| 用户  | Hash 类型 | 状态  |
| --- | --- | --- |
| `root` | `$y$...`<br><br>（yescrypt） | 真实哈希 |
| `test1` | `$6$...`<br><br>（SHA-512） | 真实哈希 |
| `daemon, bin, sys, ...` | `*` | 锁定（V4 显示） |
| `systemd-network, ...` | `!*` | 锁定（V4 显示） |
| `dhcpcd, messagebus, ...` | `!` | 锁定（V4 显示） |

* * *

## 6\. 技术实现

### 6.1 统一磁盘读取接口（DiskReader）

| 驱动  | 格式  | 实现方式 |
| --- | --- | --- |
| `VmdkDisk` | VMDK（SPARSE） | grain directory / grain table 解析 |
| `RawDisk` | RAW/IMG/BIN | 直接偏移读取 |
| `Qcow2Disk` | QCOW2/QCOW | L1/L2 表 + 缓存 |
| `VdiDisk` | VDI | block map 解析 |

### 6.2 分区表解析

-   **MBR：** 遍历 4 个主分区，检测 type=0x83（Linux）
    
-   **GPT：** 解析 EFI PART 头，遍历分区条目，检测 ext4 超级块
    

### 6.3 ext4 文件系统解析

-   超级块读取（1024 字节偏移）
    
-   块组描述符表（支持 32-bit 和 64-bit）
    
-   数据块寻址：extent 树 + 间接块映射（单/双/三间接）
    
-   目录遍历：线性目录项读取
    
-   文件读取：inode → 数据块 → 完整内容
    

### 6.4 凭据提取

-   读取 `/etc/shadow` 、 `/etc/passwd` 、 `/etc/group` 、 `/etc/gshadow`
    
-   哈希汇总： **显示所有用户及其 Hash 字段**
    

* * *

## 7\. 文件校验信息（SHA1）

| 文件  | SHA1 |
| --- | --- |
| `Bin/vmLinuxHash.lnx` | `04160F238B281D882F4565E4CFE032CD0C75DC23` |
| `Bin/vmLinuxHash.exe` | `4D956EF5353004EB74559DEC3C1167FC13EA64AA` |
| `Bin/vmLinuxHash_64.exe` | `1AD0DBEA459947C8689DA4AA35F1AD7E647D6C38` |
| `Bin/vmLinuxHash_64.lnx` | `CD82A64C21CD28DBCB6A860E79EB167320A4D9D5` |
| `Bin/vmLinuxHash_64.mac` | `7A5C3E7FB846267A52284BFE145F5C7E2E7225A7` |

> **说明：**
> 
> -   `vmLinuxHash.exe` / `vmLinuxHash.lnx` ：32 位版本
>     
> -   `vmLinuxHash_64.exe` / `vmLinuxHash_64.lnx` / `vmLinuxHash_64.mac` ：64 位版本
>     
> -   请根据目标平台选择对应版本，并可通过上述 SHA1 值校验文件完整性。
>     

* * *

## 8\. 使用场景

-   **红队 / 渗透测试**：获取目标 Linux 虚拟机中的密码哈希，配合离线破解工具（如 hashcat / John the Ripper）进行口令破解。
    
-   **取证分析**：在不启动虚拟机、不修改镜像的情况下，提取用户凭据信息，保证证据完整性。
    
-   **内部安全审计**：批量检查虚拟机镜像中的弱口令或已泄露账户。
    

* * *

## 9\. 注意事项

-   本工具仅用于 **授权范围内** 的安全测试、取证分析及教学研究。
    
-   请勿用于任何未经授权的系统，滥用可能触犯法律。
    
-   工具通过只读方式解析磁盘镜像，不会对源文件造成任何修改。
    

* * *

-   使用工具，请遵循相关法律法规，确保在授权的环境中测试和使用。
    
-   本工具仅供教育和研究目的，任何滥用行为将由用户自行承担后果。
    

## 软件主页

-   幽狼 AI Shell：https://github.com/0x7556/wolfshell
    
-   McpSerer: https://github.com/0x7556/PentestMCP
