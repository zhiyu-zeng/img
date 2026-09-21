---
title: 【微信】Windows 原生文件与日志安全分析实战指南
source: https://mp.weixin.qq.com/s/ExB3GtMzHp36lke9RGMN2Q
source_host: mp.weixin.qq.com
clip_date: 2026-09-21T09:40:53+08:00
trace_id: 2b3e51e9-874f-45a3-8317-72f397d15475
content_hash: ddd823d9cf15eb25a6d1f8f28cd59a1df759cb25cbb227a67648a8af053495e9
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e275244-d011-81b3-bdc3-e36f74d58d43
ioc: null
---

**ITPAPA** *2026年9月21日 00:19*

安全专家调查与溯源指导文档

以 Windows 自身产生的文件、注册表、事件日志和运行痕迹为主线，说明它们位于哪里、记录什么、能够支持哪些结论，以及如何交叉验证。用于主机入侵调查、横向移动分析、数据访问核查和现场取证指导。

核心原则是将账户、会话、进程、文件和网络活动关联起来，再判断行为与影响。单条日志通常只证明一个技术动作；缓存中出现文件名、登录认证成功或网络流量增加，均不能直接证明攻击成功、实际操作者身份或数据外泄。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/12739afb4c504f6d.png)

图 1 Windows 原生证据的四个层次 图中内容为分析框架而非产品界面

## 范围与阅读约定

重点覆盖 Windows 10、Windows 11 和 Windows Server 2016 至 2025；保留 XP 至 Windows 8.1 的历史取证差异。功能是否可用，以目标主机的版本、构建号、角色、策略和实际文件为准，不以产品名称推定。

文中“原生”包含系统核心机制、随系统提供的组件，以及明确标注的 Windows 可选功能。独立安装的 Sysmon、PowerShell 7、浏览器和服务器角色均单独标明适用条件。

## 01 使用方法与版本差异

## 先确认这台主机能留下什么

依次记录系统版本与构建号、客户端或服务器角色、文件系统、时区、审计子类别、日志启用状态、容量及覆盖策略，再开始解释痕迹。不能将新版事件字段套入旧版事件，也不能以没有某个文件证明没有发生某种行为。

| 系统世代 | 常见证据变化 | 调查时的重点 |
| --- | --- | --- |
| XP 与 Server 2003 | 常见为 EVT 日志、旧式 Prefetch、旧用户目录 | 事件编号与新系统不同；不套用 4624 等编号 |
| Vista 与 Windows 7 | EVTX 普及；Windows 7 引入 Jump Lists | 区分 NTUSER.DAT 与 UsrClass.dat；部分 Win7 更新环境可见 Amcache |
| Windows 8 与 8.1 | SRUM、Amcache 更常见；Prefetch 可含多次运行时间 | 有数据库不代表所有应用、用户、时段都有记录 |
| Windows 10 与 Server 2016 至 2022 | 审计字段和组件不断更新；部分 Win10 可见 BAM | 客户端和服务器默认配置不同；服务器勿预设存在 Prefetch |
| Windows 11 与 Server 2025 | 新构建可能提供内置可选 Sysmon；Recall 另有硬件和用户条件 | 核对补丁和功能状态；可选功能不等于已启用或已有历史日志 |

## 按调查问题选择入口

| 调查问题 | 优先阅读 |
| --- | --- |
| 谁以何种方式进入系统 | 第 04 至 07 节 登录 身份与远程访问 |
| 什么程序被启动并形成驻留 | 第 06 至 11 节 进程 脚本 持久化与执行痕迹 |
| 哪些文件被访问 修改或转移 | 第 12 至 17 节 NTFS 用户痕迹 USB与网络 |
| 安全组件有没有发现或阻止 | 第 18 至 19 节 Defender 应用控制与跟踪 |
| 如何采集 验证和形成报告 | 第 24 至 29 节 命令 案例 快查与纠错 |

## 专家记录格式

每项发现至少写出“证据文件与哈希、原始记录定位、原始字段、时间语义、事实描述、推断及置信度、反证与缺口”。保留原始 EVTX、数据库和配置单元，CSV 与截图只作派生材料。

本文不按操作系统世代重复同一条目，而按证据类别讲清字段与关联方法。

## 02 现场采集与证据保全

## 顺序由易失性和事件影响决定

正在发生破坏时，隔离与遏制可以优先，但应记录操作、时间和影响。主机尚在运行且具备采集条件时，先保留时钟、会话、进程、连接等易失状态；需要内存时再进行受控内存采集。随后导出事件日志、配置、用户痕迹及磁盘证据。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a93187cc9230555.png)

图 2 现场处置与证据采集决策 每项操作都应留痕

## 三种采集方式的边界

| 方式  | 适合保留 | 需要说明的限制 |
| --- | --- | --- |
| 在线逻辑采集 | EVTX 导出、当前配置、运行状态 | 会产生新进程与日志；导出期间源仍可能变化 |
| 现有快照或一致性副本 | 锁定的配置单元和数据库及伴随日志 | 快照是特定时点；新建 VSS 会改变现场且可能触发空间回收 |
| 离线镜像或卷级采集 | NTFS 元数据、ADS、未分配空间和删除残留 | 加密卷须保留可解锁条件；SSD TRIM 或覆盖会限制恢复 |

## 最小保全要求

使用独立证据介质或受控存储，记录主机名、卷标、序列号、路径、UTC 时间、采集人、工具版本、命令和错误。对采集产物计算 SHA256；原件只读，解析、事务日志回放和修复均在副本上进行。

注册表应同时保留对应.LOG1、.LOG2 及存在的事务文件；ESE 应保留同目录相关日志与检查点；SQLite 应保留存在的 -wal 与 -shm。不能把“只复制主数据库”视为一致性已保证。

哈希能证明从采集到交付的副本一致性，不能独立证明采集前没有被篡改。不要为了让痕迹写盘而重启，不要先运行清理、修复或全盘扫描再采集。

## 03 事件日志的结构与读取方法

## 文件和通道

现代系统默认目录为 %SystemRoot%\\System32\\winevt\\Logs\\。常见文件有 Security.evtx、System.evtx、Application.evtx；组件通道可映射为 Microsoft-Windows-PowerShell%4Operational.evtx 等文件名。通道名中的斜杠与文件名中的 %4 不可混用；实际路径可以配置，应查询通道元数据。

EVTX 是二进制事件容器，事件可呈现为 XML，但不是纯 XML 文本文件。旧系统常见 %SystemRoot%\\System32\\config\\SecEvent.Evt、SysEvent.Evt、AppEvent.Evt，仍应查询实际配置。

| 字段  | 记录要素 | 分析用途与边界 |
| --- | --- | --- |
| Provider 与 Channel | 提供程序名或 GUID、日志通道 | 必须与事件编号一起使用；相同 ID 可在不同源中含义不同 |
| EventID 与 Version | 事件类型、该事件模式版本 | 决定字段含义；不要按属性数组固定下标取值 |
| TimeCreated SystemTime | 事件写出的时间 通常带 Z 表示 UTC | 与事件内容中的业务时间区分；受主机时钟影响 |
| EventRecordID | 当前日志中的记录编号 | 用于定位；不是跨主机唯一 ID，也不是不可篡改序列 |
| Computer 与 Correlation | 来源主机、ActivityID 等 | 用于定位与组件关联；转发日志应保留原始来源 |
| EventData 或 UserData | SID、LogonId、路径、IP、PID 等 | 主要分析内容；优先解析 XML 字段名 |
| Execution ProcessID | 写日志的提供者执行上下文 | 不应一律当作业务进程或攻击进程 PID |

## 同一条证据如何定位

使用“来源主机 + 通道 + Provider + EventID + Version + EventRecordID + 时间 + 证据文件哈希”引用事件。离线机器缺少消息资源时，事件说明可能无法显示，但原始 XML 字段仍可分析。

先检查最早和最新事件、记录数量、容量、覆盖方式及采集错误；再判断时间空洞。日志缺口还可能来自未启用、循环覆盖、服务异常或采集过滤，不应立即断言被清除。

## 清除与审计变化

Security 1102 表示安全审计日志被清除；其他日志清除可查 Microsoft-Windows-Eventlog 的事件 104 并读取其通道信息。4719 用于审计策略变化分析。结合日志服务状态、集中转发副本与处置记录，区分运维操作和规避行为。

## 04 登录会话与本机身份活动

## Security 日志的登录主线

4624 是成功登录会话的核心来源，4625 记录失败登录；4634、4647 可辅助判断会话结束或用户发起注销。前提是对应审计策略及日志保留覆盖了调查时段。

| 4624 关键字段 | 应读取的信息 | 可支持的判断 |
| --- | --- | --- |
| TargetUserSid 与账户域 | 登录主体 SID 账户名 域 | 关联同一账户；同名本地用户并非同一身份 |
| TargetLogonId | 本机登录会话标识 | 与同主机的 4672、4688、5145 等关联 |
| LogonType | 登录类型 | 区分交互、网络、服务、批处理等上下文 |
| IpAddress 与 IpPort | 来源地址与端口 如有 | 寻找远端来源；空值、回环、网关地址均需解释 |
| AuthenticationPackageName | NTLM Kerberos 或其他包 | 识别认证路径；不能单独证明凭证被盗 |
| LogonProcessName 与 ProcessName | 登录进程及有关可执行文件 | 比较正常基线，排查异常认证链 |
| LogonGuid 与 LinkedLogonId | 可用时的关联标识 | 结合事件版本使用；全零 GUID 不可做有效关联 |

## 常见登录类型

| 类型  | 含义  | 不应作出的推断 |
| --- | --- | --- |
| 2 或 7 | 本地交互登录 或解锁 | 不能直接确认坐在机器前的自然人 |
| 3   | 网络登录 常见于 SMB 等 | 不能直接等同 RDP 或攻击者获得桌面 |
| 4 或 5 | 批处理 或服务 | 不一定由人实时操作 |
| 9   | NewCredentials 新凭据上下文 | 不等于已成功访问远程服务 |
| 10  | RemoteInteractive 远程交互 | 仍需远程会话日志和后续行为验证 |
| 11  | 缓存域凭据交互登录 | 不代表当时域控完成了在线认证 |

## 登录失败如何分析

4625 应结合 Status、SubStatus、FailureReason、账户、地址、时间分布与后续 4624。大量失败可能来自爆破，也可能是失效服务密码或映射驱动器。报告应说明失败原因和成功会话是否在同一合理链路上，不仅报告失败次数。

LogonId 只在相应主机和运行上下文内使用，不跨主机直接相等关联；经过重启、日志截断时应重新划定会话窗口。

## 05 账户权限与域认证证据

## 账户变化要同时看操作者与目标

Security 中 Subject 通常描述执行动作的主体，Target 或 Member 字段描述被操作对象。调查新增账户、加组、改密或启用账号时，必须保留两个身份，而不能将目标账户写成操作者。

| 事件编号 | 主要动作 | 关键字段与分析要点 |
| --- | --- | --- |
| 4720 4722 4725 4726 | 用户创建 启用 禁用 删除 | SubjectLogonId、目标 SID、账户域；区分域账户和本地账户 |
| 4723 4724 4738 | 尝试改密 尝试重置密码 用户更改 | 检查成功或失败标识、操作者与变更属性 |
| 4728 4732 4756 | 加入全局 本地或域本地 通用安全组 | MemberSid、组 SID、Subject；组类型不同不可混淆 |
| 4729 4733 4757 | 从上述安全组移除成员 | 与新增记录及目录快照比较，发现短时提权 |
| 4740 4767 | 账户锁定 解锁 | 定位关联来源与服务，避免仅按账号名称归因 |
| 4672 | 登录会话被分配特殊权限 | 查看权限列表；系统和管理员正常登录也会出现 |
| 4648 | 尝试使用显式凭据登录 | 分开读取 Subject 与被使用的凭据；不等于远程认证成功 |

## 域控日志与终端日志承担不同角色

4768 为 Kerberos TGT 请求相关记录，4769 为服务票据请求相关记录，4771 可体现 Kerberos 预身份验证失败；通常在域控取证。4776 反映凭据验证，由对账户具有权威性的计算机记录。审计策略及认证方式决定可见性。

应读取账户与 SID、服务名、客户端地址、结果码、加密类型、票据选项及版本新增字段。2025 年起部分已更新的 Windows Server 版本增强了 4768 等字段，不能按旧模板丢弃新增内容。

## 横向移动的判断边界

NTLM 认证不能单独证明 Pass the Hash；Kerberos 票据使用也不能单独证明 Pass the Ticket。需要结合源端进程或凭据访问痕迹、域控认证、目标端登录和实际资源访问，排除正常运维、服务账号与跳板机使用。

账户 SID 可用于身份关联，但不是自然人身份的充分证明。结合账户托管记录、跳板机审计、授权工单和时间线，明确“账户被使用”与“某人实施操作”的证据差距。

## 06 进程创建与 PowerShell 记录

## 原生进程审计

Security 4688 在启用进程创建审计后记录新进程；读取 NewProcessId、NewProcessName、创建者 PID、SubjectLogonId，以及版本支持的 ParentProcessName、TargetLogonId、MandatoryLabel。命令行需要额外启用 Include command line in process creation events，默认可能为空。

4689 可补充进程结束。PID 会复用，应结合来源主机、进程启动时间、映像路径和会话；新进程字段中的十六进制 PID 与其他日志的十进制值需统一。创建了进程不表示命令已成功执行完毕。

## PowerShell 的三类数据不能混为一谈

| 数据源 | 关键内容 | 前提与限制 |
| --- | --- | --- |
| Windows PowerShell 经典日志 | 引擎启动停止、主机程序等 如 400 与 403 | 有助于定位宿主；不保证记录脚本全文 |
| Microsoft-Windows-PowerShell/Operational | 4103 模块或管道信息；4104 脚本块内容 | 受版本与日志策略影响；4104 不保证记录每次调用和所有执行结果 |
| PSReadLine 历史文本 | 交互式输入命令 | 仅覆盖使用该模块的交互宿主；通常没有逐条可靠时间戳 |

脚本块日志要读取 ScriptBlockId、MessageNumber、MessageTotal、Path、ScriptBlockText；长脚本可能分片，需按同主机与脚本块 ID 合并。4104 中出现某函数定义或代码文本，不证明其中每条分支都运行；进一步查看调用日志、进程和产物。

Windows PowerShell 常见历史路径为 %APPDATA%\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt。PowerShell 7 是独立组件，常见路径位于 %APPDATA%\\Microsoft\\PowerShell\\PSReadLine\\，通道可为 PowerShellCore/Operational。最终以配置的 HistorySavePath、宿主和实际文件为准。

## 转录记录与无文件行为

启用 PowerShell Transcription 后，转录文件可能包含会话头、输入与输出；存储位置可由策略指定。转录不替代全部底层执行审计。历史文件缺失可能是未启用、非交互执行、用户删除或不同宿主，不能排除 PowerShell 活动。

分析编码参数和脚本时，在副本上解码为文本，不直接执行不可信内容；用子进程、文件写入、注册表变化或网络连接验证脚本行为是否落地。

## 07 远程桌面 共享与管理活动

## RDP 应形成会话链

常查 Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational 和 Microsoft-Windows-TerminalServices-LocalSessionManager/Operational。远程认证、会话登录、断开与重连是不同阶段。

| 记录  | 常用编号或字段 | 结论边界 |
| --- | --- | --- |
| RemoteConnectionManager | 1149 用户 域 来源地址 | 认证阶段线索；单条不代表桌面会话已建立 |
| LocalSessionManager | 21 登录 22 Shell启动 23注销 24断开 25重连 | 按 SessionID、用户、来源和时间关联；版本消息应核实 |
| Security | 4624 类型10 4778重连 4779断开 | 与同机 LogonId、会话和后续进程互证 |
| RDP 客户端记录 | HKCU\\Software\\Microsoft\\Terminal Server Client\\Servers 与 Default | 记录目标或最近使用项，不证明连接成功 |

RDP 经网关、代理或跳板机进入时，终端日志中的地址可能只到中间节点。应追加网关、源终端与认证服务证据；不要用单个公网地址直接归属攻击主体。

## SMB 访问证明到了哪一步

5140 提供共享访问线索；5145 提供 ShareName、ShareLocalPath、RelativeTargetName、IpAddress、SubjectLogonId 与请求访问权限。5145 的访问检查成功不等于文件内容已被完整复制，失败审计也不覆盖所有 NTFS 权限拒绝情形。

对敏感文件读取，可结合配置了相应审计的 4663，读取 ObjectName、ProcessName、ProcessId、AccessMask 与 HandleId。4663 表示特定访问权被使用，仍不提供完整读取字节数或最终外传目的地。

## WinRM WMI 与远程服务

WinRM/Operational、WMI-Activity/Operational、Security 与 System 可共同提供管理活动线索。对 WMI 读取 ClientProcessId、User、Operation、ResultCode；5858 等常与错误有关，不能当作所有 WMI 执行的总账。

以 wsmprovhost.exe、WmiPrvSE.exe 或服务启动为父链的进程可指向管理通道，但正常运维也常见。先对齐源端任务、目标端会话、父子进程及动作产物，再判断是否异常。不同通道中没有共同标识时，应将时间相关标记为推断。

## 08 服务 任务与其他持久化配置

## 配置存在与实际执行分别验证

| 机制与默认位置 | 关键要素 | 分析与互证 |
| --- | --- | --- |
| SYSTEM\\CurrentControlSet\\Services\\<名称> | ImagePath、Start、Type、ObjectName、Parameters\\ServiceDll | 判断启动模式和执行主体；配合 System 7045、7036 及 Security 4697 |
| %SystemRoot%\\System32\\Tasks\\ | 任务 XML 的命令 参数 触发器 主体 运行级别 | 与 4698、4702 和任务操作日志核对；文件名常无扩展名 |
| SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\TaskCache | 任务树、GUID 与注册信息 | 对比任务文件，查找残留或异常不一致 |
| HKLM 或 HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run 与 RunOnce | 值名 命令 路径 | 检查目标文件和配置来源；RunOnce 可被正常删除 |
| 用户或公共 Startup 文件夹 | LNK 脚本 可执行文件 | 解析快捷方式目标与参数，再查登录后进程 |

服务记录能帮助回答“以什么身份、从哪个路径、在何种启动条件下运行”。Start 或 ImagePath 的当前值不提供完整变更历史；键 LastWrite 也不等于该特定值的变更时间。

## 计划任务取证

4698 表示任务创建，4702 表示任务更新；4699、4700、4701 可用于删除、启用、禁用调查。读取 SubjectLogonId、TaskName、TaskContent；新版本可能含 ClientProcessId 等信息。任务 XML 的 Author 与 Date 可由提交者填写，不作为真实创建者与创建时间的独立证明。

TaskScheduler/Operational 中的任务注册、启动、操作完成和结果码可以补充生命周期；应以任务名、实例标识和时间关联。任务存在不等于触发过，退出码为零也不等于业务目标达成。

## WMI 永久订阅与其他入口

检查 root\\subscription 中的 \__EventFilter、消费者和 \__FilterToConsumerBinding，读取查询、目标动作和绑定关系。底层仓库位于 %SystemRoot%\\System32\\wbem\\Repository\\，包含 OBJECTS.DATA 等文件；需一致性采集，不在原件上修复。

另外检查 Winlogon 的 Shell 与 Userinit、IFEO Debugger、登录脚本、组策略和服务 DLL。用户启动目录通常为 %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup；公共目录位于 %ProgramData% 下的对应路径。先比较系统及软件安装基线，避免把全部自启动项视为恶意。

## 09 注册表配置单元与身份映射

## 配置单元本身是证据文件

| 文件 默认位置 | 主要内容 | 安全分析价值 |
| --- | --- | --- |
| %SystemRoot%\\System32\\config\\SYSTEM | 控制集 服务 设备 时区及启动配置 | 驻留、USB、系统状态和时间解释 |
| 同目录 SOFTWARE | 系统及软件配置 安装信息 ProfileList | 系统版本、用户配置文件路径、程序清单 |
| 同目录 SAM | 本地账户与有关安全属性 | 本地账户存在和变化；不等同域账号数据库 |
| 同目录 SECURITY | 本地安全策略和受保护秘密等 | 策略与认证上下文；按敏感证据管理 |
| 同目录 DEFAULT | HKEY_USERS\\.DEFAULT 对应内容 | 系统登录桌面相关配置；不是新用户模板 |
| %USERPROFILE%\\NTUSER.DAT | 用户配置及多种 MRU 痕迹 | UserAssist、RunMRU、RecentDocs、用户启动项 |
| %LOCALAPPDATA%\\Microsoft\\Windows\\UsrClass.dat | 用户类注册与 Shell 相关数据 | ShellBags、每用户 COM 配置 |

## 离线解析容易出错的三个位置

SYSTEM 离线文件通常包含 ControlSet001 等真实控制集，应读取 Select\\Current 决定当时选中的控制集；CurrentControlSet 是在线映射，不能把它当作离线必然存在的实体键。

SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\ 的 ProfileImagePath 用于把 SID 与用户目录关联。调查要覆盖相关用户及服务账户配置文件，而不仅是采集者当前 HKCU。

注册表键常有 LastWrite 时间，但通常没有每个值的独立修改时间。值数据中的 FILETIME、安装日期或 MRU 顺序又有不同语义。键的最后写入可能由其他值变化触发，报告应具体到字段。

## 事务日志与当前状态

采集主配置单元及其存在的事务日志。主文件可能尚未包含所有已提交更新，解析工具可以在工作副本上回放日志；应记录是否回放、工具版本以及回放前后哈希。

注册表可表明配置、账户或文件关联曾存在；要证明动作何时发生，应结合事件日志、文件系统或历史快照。SAM、SECURITY 与用户凭据相关文件应限制访问，本指南关注身份和配置取证，不把凭据导出作为常规分析步骤。

## 10 Prefetch Amcache 与 Shimcache

## Prefetch 提供程序启动的较强佐证

位置为 %SystemRoot%\\Prefetch\\\*.pf。常见要素包括程序名、运行计数、最近运行时间、卷信息，以及启动阶段触及的文件和目录列表。PF 文件名中的哈希不是可执行文件的内容哈希；也不要把引用的每个 DLL 都解释为完整加载历史。

旧格式通常仅保存一个最近运行时间；Windows 8 及之后的相关格式可保存最多八个。格式 17、23、26、30、31 是常见结构版本线索，但应以实际头部及解析器支持为准。服务器、禁用预读取、清理和运行条件均可能导致无记录。

Prefetch 支持“相关程序曾在该环境启动”的判断，但不能独自确定执行用户、全部参数或首次执行时间。PF 自身创建时间可能受清理、复制或重建影响。

## Amcache 主要用于文件与程序清单线索

位置为 %SystemRoot%\\AppCompat\\Programs\\Amcache.hve。解析 InventoryApplicationFile、InventoryApplication 等实际存在的键，关注完整路径、名称、大小、发行者、版本、FileId、LinkDate 及键时间。不同版本结构差异明显。

Amcache 可记录系统盘点发现的文件，条目存在不应直接写成“已执行”；时间字段也不应统一标注为“首次执行”。部分 FileId 对大文件仅计算前 31,457,280 字节，即 30 MiB 的 SHA1，应按解析器规则处理前缀并注明哈希覆盖范围。

## Shimcache 是兼容性缓存

常见位置为 SYSTEM\\CurrentControlSet\\Control\\Session Manager\\AppCompatCache 下的 AppCompatCache 值。可包含文件路径、文件修改时间及版本相关字段，用于寻找曾出现过的程序路径。磁盘持久化具有时机差异，在线内存与磁盘内容可能不同。

现代系统中不能仅凭 Shimcache 条目证明执行；其中的文件修改时间也不是运行时间。应与 4688、Prefetch、用户痕迹或任务日志结合，且不得为触发缓存落盘而重启现场。

| 证据  | 优先回答 | 需要追加验证 |
| --- | --- | --- |
| Prefetch | 程序是否有启动痕迹 | 用户 会话 参数与后续动作 |
| Amcache | 文件是否曾被系统记录 | 是否执行 哈希覆盖范围与条目时间语义 |
| Shimcache | 哪些程序路径进入兼容性缓存 | 具体行为是否发生及发生时间 |

## 11 用户程序活动与近期执行线索

## UserAssist 与 RunMRU

NTUSER.DAT\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist\\{GUID}\\Count 常保存与 Shell 启动有关的统计。值名使用 ROT13 编码，不是保护秘密的加密；数据可含运行计数、最近运行时间及版本相关焦点信息。

UserAssist 更接近用户图形界面活动，不覆盖全部命令行、服务或后台执行。计数和时间可能受更新机制影响，某些条目不具备可靠的执行时间。不能将每条记录都还原为用户双击一次。

同一 Explorer 分支下的 RunMRU 记录运行对话框有关输入与 MRU 顺序；它不是所有 shell 的命令历史，也不提供每条命令的精确运行时间。将命令字符串与进程审计、产物和会话关联。

## BAM 与 DAM

在部分 Windows 10 及后续系统中，可见 SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings\\ ，旧构建可能没有 State 层；DAM 也应以实际存在的结构为准。BAM 条目可包含程序设备路径和最近执行相关 FILETIME，帮助关联用户 SID 与程序。

这些机制有程序覆盖、保留与清理限制，不能作为全量执行台账，也不要承诺固定保留天数。应保存原始二进制值，注明路径版本，将 \\Device\\HarddiskVolumeX 映射到采集时的卷身份，避免直接假定它等于 C 盘。

## Windows 11 的 PCA 补充线索

部分 Windows 11 构建中，%SystemRoot%\\AppCompat\\PCA\\ 可出现 PcaAppLaunchDic.txt、PcaGeneralDb0.txt、PcaGeneralDb1.txt 等兼容性辅助文件。按实际版本解析其中的程序路径、时间和退出相关字段，不把该目录假设为所有 Windows 11 和服务器通用。

| 调查目标 | 适合组合 | 判断范围 |
| --- | --- | --- |
| 某用户是否启动过程序 | UserAssist 或 BAM 加 4688 | 区分用户交互与账户上下文 |
| 程序存在但没有执行审计 | Amcache 加 Prefetch 或 PCA | 说明各机制采样与缺失条件 |
| 可疑命令是否实际完成 | RunMRU 或历史文本加产物证据 | 输入历史本身只提供线索 |

## 解析输出必须回到原始字段

工具列名中的 LastRun、Executed、FirstSeen 不一定对应相同系统语义。关键发现应核查解析器版本、原始值和同构建测试结果；“首次在现有证据中观察到”比“首次在主机上执行”更符合证据边界。

## 12 NTFS 元数据与文件生命周期

## 三类核心元数据

| 原生对象 | 关键记录要素 | 可以分析什么 |
| --- | --- | --- |
| 卷根的 $MFT | 文件记录号 序列号 属性 父目录引用 文件名 数据流 | 文件身份、路径关系、分配状态、时间戳和部分驻留内容 |
| $Extend\\$UsnJrnl 的 $J 流 | USN、文件引用、父引用、时间、Reason、文件名 | 创建 删除 重命名 数据变化等文件生命周期线索 |
| 卷根的 $LogFile | 文件系统事务与重做撤销相关记录 | 补充短期元数据变化顺序；需专业解析 |

这些是 NTFS 的特殊元数据，不是普通资源管理器文件。$UsnJrnl 的常见完整表示为 C:\\$Extend\\$UsnJrnl:$J；普通复制命令通常不能完整获取，宜采用支持原始卷读取的采集工具或镜像方式。

## USN Journal 的字段语义

V2 记录包括 FileReferenceNumber、ParentFileReferenceNumber、Usn、TimeStamp、Reason、SourceInfo、SecurityId、FileAttributes 和文件名。SecurityId 是安全描述符索引相关字段，不是操作者 SID；USN 不记录发起进程或完整写入内容。

Reason 可包含 FILE_CREATE、FILE_DELETE、RENAME_OLD_NAME、RENAME_NEW_NAME、DATA_EXTEND、DATA_OVERWRITE、BASIC_INFO_CHANGE、CLOSE 等。位标志可能组合，不能把每条日志等同一次独立 API 调用。重命名关联需综合文件引用和顺序，不能只按相同文件名拼接。

## 从删除记录走向实际内容

$MFT 记录有“记录号 + 序列号”的身份约束，删除后可能复用。恢复路径时要检查父引用与序列，避免把旧子记录挂到新的同号目录。

USN 是有界日志，可能循环覆盖或被重建；$LogFile 主要面向文件系统恢复，历史范围通常更短，不提供完整用户活动日志。三者都不保证保存被删除文件内容，恢复还取决于磁盘覆盖、文件驻留方式、TRIM 与加密状态。

## 数据流与隐藏内容

NTFS 文件可有多个 $DATA 流。检查常规数据流及命名流，记录流名、大小和哈希。存在 ADS 不等于恶意；Zone.Identifier 就是常见合法用途。跨文件系统复制、压缩解压或工具选择可能导致命名流丢失。

## 13 时间戳解释与关联原则

## 先确定时间表示的是什么

| 时间来源 | 通常的意义 | 常见误读 |
| --- | --- | --- |
| EVTX SystemTime | 提供者写出事件的时间 | 当作业务动作绝对准确的发生时间 |
| NTFS $STANDARD_INFORMATION | 文件创建 内容修改 元数据变化 访问相关时间 | 忽略复制、恢复、软件更新和 API 修改影响 |
| NTFS $FILE_NAME | 文件名属性中的相关时间副本 | 把它视为不可修改且总与 SI 同步 |
| 注册表 LastWrite | 整个键最后写入时间 | 当作该值或该操作的精确时间 |
| LNK 内部时间 | 目标文件元数据的快照 | 当作用户打开文档的时间 |
| SRUM 桶时间或数据库更新时间 | 周期统计或落盘相关时间 | 当作单条网络连接的精确开始时间 |

## 统一时间时保留原始值

建议输出原始时间、原时区或单位、归一化 UTC 时间、时间语义和误差说明。Windows FILETIME 常以 1601 年起的 100 纳秒单位表示，分辨率高并不等于采集精度高；本地显示还受时区和夏令时影响。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2bc78841e182532.png)

图 3 跨源关联的连接键 跨主机只能使用经验证的时间与身份关系

## 判断篡改应形成证据组合

SI 与 FN 时间差异可由正常复制、移动、备份恢复和文件系统行为产生；差异是调查起点，不是时间戳伪造的充分证据。结合 USN 的 BASIC_INFO_CHANGE、已启用 Sysmon 的时间变更记录、进程和历史快照建立解释。

如果主机时间异常，保留原始时钟状态与时间更改记录，例如 Security 4616，并与域控、网关或集中日志接收时间比较。不要直接修改现场时钟以“修正时间线”。若只能确定一个时段，应报告时间范围。

## 14 快捷方式 Jump Lists 与最近文件

## LNK 记录目标对象的引用

常见位置为 %APPDATA%\\Microsoft\\Windows\\Recent\\\*.lnk，桌面、启动目录和其他文件夹也可能存在。MS-SHLLINK 结构可包含目标路径、命令参数、工作目录、目标文件时间与大小、卷类型和序列号、网络共享信息以及部分跟踪标识。

区分 LNK 文件本身的文件系统时间和 LNK 内嵌的目标时间。LNK 可以由应用程序或人工创建、复制甚至构造，不能把它的存在直接解释为该用户阅读了内容或目标程序已经运行。

## Jump Lists 连接应用与对象

自动列表位于 %APPDATA%\\Microsoft\\Windows\\Recent\\AutomaticDestinations\\\*.automaticDestinations-ms；自定义列表位于同级 CustomDestinations\\\*.customDestinations-ms。文件名常与应用标识有关，自动列表可能包含 DestList 与嵌入的 LNK。\[29\]

| 字段或结构 | 可以提供 | 应避免的结论 |
| --- | --- | --- |
| AppID 与列表文件名 | 对应的应用线索 | 未核实映射便认定应用名称 |
| DestList 项目与访问相关时间 | 近期目标及列表更新线索 | 当作完整、不可删除的文档访问账本 |
| 嵌入 LNK 的目标路径 | 本地路径、共享路径或外接卷线索 | 仅凭路径就证明文件被复制 |
| 卷序列号与网络信息 | 关联卷或共享 | 把卷序列号当作全球唯一 USB 硬件序列号 |

## RecentDocs 与打开保存对话框

NTUSER.DAT\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs 可含最近对象及 MRU 顺序。ComDlg32 分支下的 OpenSavePidlMRU、LastVisitedPidlMRU 可反映公共打开保存对话框交互，旧版本结构不同。

这些痕迹帮助查找用户接触的文件、目录与应用，但最近出现顺序不等于精确时间。程序可以自行维护最近列表，隐私设置、应用兼容性和清理都会影响记录范围。

## 典型判断

发现“报价表.lnk”指向 E:\\客户资料\\报价表.xlsx，可写为“该用户配置文件中存在指向该卷路径的快捷方式”。若要进一步判断是否从本机复制到 USB，应追加目标卷的文件创建、源文件访问、内容哈希及会话证据。

## 15 ShellBags 回收站与缩略图

## ShellBags 表示 Shell 对文件夹的处理痕迹

现代系统重点检查 UsrClass.dat 中 Local Settings\\Software\\Microsoft\\Windows\\Shell\\BagMRU 与 Bags，同时检查 NTUSER.DAT 中有关 Shell 分支。可恢复目录层级、Shell Item、视图设置和部分对象元数据。

它能补充曾被 Shell 浏览或处理过的路径，包括现已不存在的目录、共享和外接卷。ShellBags 不是逐文件读取审计，也不能单独证明复制或泄露。键时间和 Shell Item 内部时间应分别解释。

## 回收站的成对文件

现代 Windows 常见 <卷根>\\$Recycle.Bin\\ \\。$I 开头文件通常保存原始路径、大小和移入回收站时间等元数据，$R 对应内容。按相同后缀配对，检查格式版本和内容是否仍存在。

SID 子目录可提供用户上下文，但目录内容可能被操控。Shift+Delete、部分程序删除、网络共享删除及清理操作不一定经过本地回收站；找不到 $I 文件不能排除删除行为。XP 时代常见 RECYCLER 与 INFO2，不能套用现代格式。

## 缩略图和图标缓存

%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\thumbcache\_\*.db 与 iconcache\_\*.db 可含 Shell 生成的缩略图或图标。某些目录还可能存在 Thumbs.db。可辅助证明某内容曾被系统生成预览，但原路径和原文件并不总能从缓存直接确定。

| 发现  | 可表述的事实 | 仍需验证 |
| --- | --- | --- |
| ShellBags 中有离线共享目录 | 该用户 Shell 痕迹中记录了该目录 | 实际访问时间、操作内容和远端身份 |
| $I 存在而 $R 不存在 | 发现回收站元数据残留 | 文件内容是否可恢复及后续清理情况 |
| 缓存中出现敏感文档缩略图 | 系统缓存过相关视觉内容 | 谁查看、是否完整读取和是否外传 |

## 与用户意图保持距离

缩略图可能由自动预览、索引或应用行为产生；共享账户也会削弱自然人归因。应把“系统处理过”“账户上下文出现过”“用户主动操作过”分成不同结论层次。

## 16 USB 与其他外接设备

## 设备安装 连接与文件使用是三条证据线

| 原生位置 | 关键要素 | 主要价值 |
| --- | --- | --- |
| SYSTEM\\CurrentControlSet\\Enum\\USBSTOR | 设备型号 实例标识 序列相关信息 | 识别 USB 大容量存储设备历史线索 |
| 同控制集 Enum\\USB | VID PID 实例与设备属性 | 补充总线与设备实例关系 |
| SYSTEM\\MountedDevices | 卷与盘符映射相关值 | 将设备卷与路径关联；盘符会变化 |
| NTUSER.DAT 的 Explorer\\MountPoints2 | 用户遇到的卷或挂载点 | 辅助建立用户上下文 |
| %SystemRoot%\\INF\\setupapi.dev.log | 安装节 起止时间 设备实例 INF与结果 | 证明设备安装配置过程，不是每次插拔账本 |

USBSTOR 不覆盖所有外设协议；手机可能走 MTP，UASP 存储也可能在其他枚举分支体现。应按设备实例、容器标识、存储卷与设备类关联，不只搜索 USBSTOR。

## 安装日志的正确用法

SetupAPI 记录设备安装和配置过程。定位对应设备实例的日志节，读取起止时间、驱动 INF、执行状态与错误信息。首次保留的安装节只证明“现有记录中最早观察到的安装”，不能笼统称为设备首次接入时间。

部分设备属性和 Kernel-PnP、DriverFrameworks 等通道可提供连接、移除或配置线索，但字段、事件编号和启用状态随版本及设备类型变化。不要把 20001、20003 等编号泛化为所有 Windows 的 USB 插拔事件。

## 怎样支持复制到外接介质的结论

先建立“设备实例—卷身份—当时盘符—用户会话”，再检查源端文件读取或应用记录、目标卷 $MFT 与 USN 的创建写入、目标文件大小和内容哈希。LNK 与 Jump Lists 可加强路径关联；它们本身不证明发生完整复制。

设备序列号可能缺失、由系统生成或可被仿冒；格式化会改变卷层信息。注册表也可能被清理、重建或随系统重装消失，因此不能宣称 USB 历史永久保留。

## 17 网络连接与资源使用记录

## SRUM 是资源统计数据库

常见位置为 %SystemRoot%\\System32\\sru\\SRUDB.dat，格式为 ESE。应保留相关日志和 SOFTWARE 配置单元，以补充应用、用户和网络配置映射。不同表可包含 AppId、UserId、TimeStamp、接口标识、收发字节数与资源计数。

SRUM 有助于回答“哪个应用在某个统计时段、以哪个用户上下文、使用了多少网络或资源”。它通常不是逐连接日志，不提供完整远端 IP、域名、URL 或载荷；不能仅凭发送流量认定外传，也不应承诺固定粒度或完整保留周期。

## 防火墙文本日志与 WFP 审计

| 来源  | 常见字段 | 关键限制 |
| --- | --- | --- |
| %SystemRoot%\\System32\\LogFiles\\Firewall\\pfirewall.log | 日期 时间 action 协议 源目的IP 端口 等 | 要先开启对应配置文件日志；以 #Fields 和头部为准 |
| Security 5156 | WFP 允许连接的应用 PID 地址 端口 协议 | 需过滤平台连接审计；允许不等于业务会话完成 |
| Security 5157 与 5152 | 连接或数据包被阻止相关记录 | 按事件模式区分连接和包；不推断内容 |
| 已启用 Sysmon 的事件3与22 | 进程关联的连接和 DNS 查询 | 依赖过滤配置；DNS 查询不等于成功建立连接 |

防火墙可对 Domain、Private、Public 使用不同日志和设置，应先读取配置及真实路径，不能只查看默认文件。文本日志的时间解释应遵循文件头与版本，避免一律当作 UTC。

## 网络配置与易失数据

SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Profiles 与 Signatures 可提供网络配置文件名称、类别和签名线索。WLAN-AutoConfig/Operational、DHCP-Client 和 DNS-Client 相关通道按启用状态补充连接与解析信息。

DNS 缓存、ARP/邻居表、路由、当前 TCP 连接通常是易失状态，不能当作长期日志。hosts、代理与 DNS 配置可解释流量去向，但当前配置不能重建所有历史访问。综合 SRUM、WFP、DNS、源端应用及网络侧记录，才有条件讨论可能的远端通信链。

## 18 Microsoft Defender 检测与处置证据

## 优先分析 Operational 日志

通道为 Microsoft-Windows-Windows Defender/Operational，默认事件文件位于 winevt\\Logs 目录的对应 %4Operational.evtx。应保存引擎、平台、安全情报版本及工作模式，确认调查时段防护是否运行。

| 事件  | 主要内容 | 应读取与验证 |
| --- | --- | --- |
| 1116 | 检测到恶意软件或潜在不需要的软件 | Threat ID、名称、严重性、路径、来源、进程和用户等实际字段 |
| 1117 | 对威胁采取动作 | 动作、状态、错误和关联威胁；不只看名称 |
| 1118 与 1119 | 处置中出现错误或严重错误 | 明确是否处置失败、对象是否仍存在 |
| 5007 | 防护配置变化 | 原值、新值和上下文；可能来自正常策略更新 |
| ASR 与网络保护相关事件 | 审核或阻止动作 | 核对规则 GUID、模式和目标，不把审核模式当成阻止 |

## 支持目录与隔离内容

常见根目录为 %ProgramData%\\Microsoft\\Windows Defender\\。Support\\MPLog-\*.log 可包含诊断、扫描和检测上下文；Scans\\History\\Service\\ 与 Quarantine\\ 可保留保护历史或隔离材料，但内部布局受平台版本与保留策略影响。

这些文件可补充已删除对象的路径、检测过程与处置信息，不能把 MPLog 视为完整进程审计。保护历史清除或平台升级可能改变留存；对受保护或加密隔离数据，保留原始目录与元数据，使用匹配版本的方法在隔离工作环境中处理。

## 原文数据库说法的修正

不能假定所有系统都存在固定名称的 HistoryStore.edb，也不能把 esentutl 当作通用的业务字段解析器。应先验证文件签名、真实格式与版本，再选择工具；任何修复或事务处理都只对工作副本进行。

## 从告警走向影响判断

“检测到”不等于“执行过”，“采取动作”不等于“攻击已完全清除”。以威胁标识、路径、哈希、进程和时间关联执行证据、驻留点和后续连接，再判定是否有残留或扩散。误报与正常策略变化应保留核查记录。

若系统安装第三方防护产品、Defender 处于被动模式或相关通道未留存，需明确该数据源的覆盖限制，而不是据此判定主机安全。

## 19 应用控制 Sysmon 与 ETW

## 应用控制区分审核与强制阻止

App Control for Business 原称 WDAC，常查看 Microsoft-Windows-CodeIntegrity/Operational。3076 常用于审核模式下“本会阻止”的记录，3077 常用于强制模式阻止；3089 可提供有关签名信息，应结合活动标识、策略和文件关联。

AppLocker 位于 Microsoft-Windows-AppLocker 的 EXE and DLL、MSI and Script 等通道。记录可包含文件路径、发布者、规则、用户与允许审核阻止结果；通道和 ID 要与文件类型匹配。Smart App Control 是有特定适用条件的 Windows 功能，不能假设全部设备启用。

## Sysmon 的原生范围与安装状态

截至本次核查，微软文档说明 Windows 11 与 Windows Server 2025 的较新环境可使用内置可选 Sysmon。旧环境可能使用独立 Sysinternals 版本。两者不能同时启用；应记录构建号、服务、驱动、功能状态及过滤配置。

| 事件类别 | 常见 ID | 核心字段与用途 |
| --- | --- | --- |
| 进程启动与退出 | 1 与 5 | ProcessGuid、ParentProcessGuid、映像、命令行、用户 |
| 网络与 DNS | 3 与 22 | 进程、端点或查询名称；依赖规则启用 |
| 驱动与映像加载 | 6 与 7 | 路径、哈希、签名；大量记录需评估配置 |
| 文件及注册表变化 | 2、11、12至14 | 时间变更、文件创建、键值动作 |
| 进程访问与线程 | 10 与 8 | 来源目标进程、访问权限或线程信息；合法软件也会产生 |

Sysmon 是遥测来源，本身不完成恶意性判定；新增配置只能改善未来可见性，不能补回过去事件。ProcessGuid 可减少 PID 复用歧义，但仍应保留主机身份及原始日志。

## ETW 与 ETL 的区别

ETW 是跟踪机制，ETL 是常见跟踪文件容器；并非全部 ETW 事件都会写成长期文件。会话可能实时消费、循环缓存或选择性记录，应保留 Provider、会话配置、关键词、级别和丢失计数。

可使用系统 tracerpt 或匹配的分析工具处理现有 ETL。新启动跟踪会改变现场且只能观察后续行为。DiagTrack、WMI 和其他诊断目录中的文件应按具体版本确认，不承诺某个通用 ETL 含完整已删除程序记录。

## 20 系统二进制 驱动与关键配置文件

## 这些文件首先提供当前状态与完整性信息

| 系统位置或文件 | 包含要素 | 安全分析重点 |
| --- | --- | --- |
| %SystemRoot%\\System32\\\*.exe 与 \*.dll | PE 结构、架构、版本资源、签名、导入等 | 与相同构建和补丁基线比较，检查替换和冒名 |
| %SystemRoot%\\System32\\drivers\\\*.sys | 内核驱动二进制与签名 | 关联服务键、加载记录、安装日志和版本 |
| %SystemRoot%\\System32\\DriverStore\\FileRepository\\ | 驱动包 INF CAT 及相关文件 | 核对设备驱动来源；第三方驱动也可合法存在 |
| %SystemRoot%\\WinSxS\\ | 组件存储 多版本文件和清单 | 辅助校验维护历史；不当作独立备份或执行记录 |
| %SystemRoot%\\System32\\drivers\\etc\\hosts | 静态主机名映射 | 判断解析是否被改写；结合写入和网络证据 |
| BCD 与 EFI 引导分区 | 引导配置和引导文件 | 检查异常启动项；实际位置随 BIOS UEFI 与安装方式变化 |

## PE 字段如何用于调查

记录文件 SHA256、大小、架构、节区、入口点、导入表、版本资源和签名。PE 的 TimeDateStamp、公司名称、OriginalFilename 可以被修改；有效签名也不保证当前行为无害。哈希比较需使用同版本、同补丁、同架构的可信基线。

在 x64 Windows 上，System32 通常保存本机 64 位系统组件，SysWOW64 用于 x86 兼容组件；32 位采集进程还可能遭遇重定向。ARM64 与兼容场景另行确认，记录采集工具架构和实际访问路径。

## 证书与身份保护相关文件

系统和用户证书存储、机器或用户私钥目录、DPAPI Protect、Credentials 与 Vault 目录可帮助解释证书使用、身份保护和凭据存储状态。这些不等于成功认证日志；数据可能受 DPAPI、TPM 或其他机制保护，不能宣称复制后即可读取。

BitLocker 恢复信息可能备份于 AD DS、Microsoft Entra ID、微软账户或指定介质，取决于部署策略。Credential Guard、Windows Hello 和 FIDO2 是保护或认证机制，不是一份固定“溯源文件”；应调查对应配置、认证事件与设备注册状态。

## 21 系统维护 错误报告与转储

## 安装和更新日志解释系统变化

| 原生位置 | 主要记录 | 分析价值与限制 |
| --- | --- | --- |
| %SystemRoot%\\Logs\\CBS\\CBS.log 及持久日志 | 组件维护、包安装和系统文件检查结果 | 区分补丁维护与异常文件变化；不是程序运行总账 |
| %SystemRoot%\\Logs\\DISM\\dism.log | 映像和组件维护动作 结果与错误 | 解释维护行为；工具执行者需其他日志关联 |
| %SystemRoot%\\Panther\\setupact.log 与 setuperr.log | 安装 升级与阶段错误 | 判断系统升级重建；也检查相关回滚目录 |
| %SystemRoot%\\Logs\\WindowsUpdate\\\*.etl | Windows Update 跟踪 | 新版常需转换；生成的 WindowsUpdate.log 是派生快照 |
| %SystemRoot%\\SoftwareDistribution\\DataStore\\DataStore.edb | 更新客户端的有关状态和历史 | 不等同全部补丁安装事实，以维护及系统记录验证 |

Get-WindowsUpdateLog 可把相关 ETL 合成可读日志；需保留原 ETL、使用环境与转换结果。不同构建的格式和解析能力应核查。

## 启动 关机与异常重启

System 中 EventLog 6005/6006 表示事件日志服务启动/停止，只能辅助界定系统运行区间；User32 1074 可记录发起关机或重启的进程、用户与原因。6008 提示此前异常关机；Kernel-Power 41 通常在随后启动时记录上次未正常关机，不能单凭它归因断电、蓝屏或攻击。结合消息中的发生时间、BugcheckCode、转储与维护记录分析。

## WER 与应用崩溃

常见 WER 目录为 %ProgramData%\\Microsoft\\Windows\\WER\\ReportArchive 与 ReportQueue，也可能有用户目录。Report.wer 可包含应用路径、版本、故障模块、异常码、报告标识与时间；队列和附件的实际留存受配置影响。

Application 中应用错误及 Windows Error Reporting 记录可与报告标识、进程、模块相连。它们支持异常或崩溃发生的分析，不直接证明漏洞利用成功。LocalDumps 必须配置，默认目录通常为 %LOCALAPPDATA%\\CrashDumps，并可按应用修改。

## 系统转储与虚拟内存文件

%SystemRoot%\\MEMORY.DMP、%SystemRoot%\\Minidump\\\*.dmp 及 LiveKernelReports 依故障与配置生成；不同转储类型覆盖不同内存范围。pagefile.sys、swapfile.sys、hiberfil.sys 可能包含内存片段，但不是有序审计日志。

快速启动产生的休眠数据不一定包括完整用户会话。不要在嫌疑机上触发蓝屏、调整转储或休眠设置来“补齐”既有证据。需要转储分析时，保留 OS 构建、符号匹配信息、转储类型与采集时间，避免错误模块归因。

## 22 浏览 下载 搜索与 Recall

## 浏览器数据属于组件或应用痕迹

Microsoft Edge 常见配置文件目录为 %LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\，也应枚举 Profile 1 等目录及策略重定向位置。History 常为 SQLite，Cookies、Cache、Sessions 等位置随版本变化。

读取 URL、标题、访问时间、跳转关系、下载目标、起止时间、状态和接收字节等实际字段。浏览历史可以受重定向、同步和应用行为影响；历史中的 URL 不一定是用户主动输入，也不能单独证明下载完成或用户阅读了内容。

旧 IE 的 index.dat 与较新 WebCacheV01.dat 分属不同机制。后者常位于 %LOCALAPPDATA%\\Microsoft\\Windows\\WebCache\\，不应把它视为 Chromium Edge 的统一历史数据库。

## 下载来源与 Zone Identifier

支持命名流的文件可能带有:Zone.Identifier，常见内容包括 ZoneId，以及由下载程序写入的 HostUrl、ReferrerUrl。ZoneId=3 通常代表 Internet 区域，不表示文件恶意；来源字段也不保证每个下载器都写入。

流可能因文件系统、解压、复制或显式解除阻止而消失。无 Zone.Identifier 不能证明文件来自本地。应与下载数据库、NTFS 创建记录、文件大小和哈希相互验证。

## Windows Search 索引

默认索引目录常为 %ProgramData%\\Microsoft\\Search\\Data\\Applications\\Windows\\，可能存在 Windows.edb 或 Windows.db。索引可包含路径、属性和被索引内容的有关信息，具体格式和表依系统版本变化。

索引由后台服务维护，出现文档不证明用户打开；未索引、排除目录、重建及延迟会造成缺失。读取前先保全文件及一致性材料，不能为了查询方便重建索引。

## Recall 只作为条件性补充

Recall 受支持设备、功能部署、用户选择和组织策略约束；快照与相关数据受安全保护。它不是所有 Windows 11 都有的通用日志，也不是连续录屏或固定每隔若干秒必有记录。

如确有相关数据，应使用符合当前版本支持方式的授权访问或导出，记录数据来源与导出范围。不要假设离线复制数据库即可读取，也不要把缺失画面视为动作没有发生的证明。敏感画面与文档正文应严格控制流转范围。

## 23 Windows Server 角色专属证据

## 仅在相应角色安装并启用时适用

| 角色或组件 | 默认位置或通道示例 | 核心字段与安全用途 |
| --- | --- | --- |
| AD DS 域控 | Security、Directory Service；%SystemRoot%\\NTDS\\ntds.dit 及事务材料 | 认证、目录对象与变更；数据库不是逐次认证日志 |
| 组策略 | SYSVOL 中域策略目录；本机 System32\\GroupPolicy | Registry.pol、脚本和策略版本；解释配置来源 |
| IIS | %SystemDrive%\\inetpub\\logs\\LogFiles\\W3SVC\*\\ | URI、方法、客户端IP、状态、用户名、字节和耗时等已选字段 |
| HTTP.sys 错误 | %SystemRoot%\\System32\\LogFiles\\HTTPERR\\ | 内核 HTTP 层拒绝和错误；可能补足未到 IIS 的请求 |
| DHCP Server | %SystemRoot%\\System32\\dhcp\\DhcpSrvLog-\*.log | 租约、客户端标识、MAC、IP和时间；路径可调整 |
| DNS Server | DNS Server 及分析审计或配置的调试日志 | 查询或服务事件；不默认保存完整历史查询 |
| UAL | %SystemRoot%\\System32\\LogFiles\\SUM\\ | 用户设备、角色、FirstSeen、LastSeen、ActivityCount |

## Web 访问不是命令执行证据

IIS W3C 日志字段由 #Fields 定义，通常使用 UTC；IIS 其他格式可能使用本地时间。反向代理后的 c-ip 常为代理地址，只有经过可信配置校验的转发字段才可用于推断真实来源。

可疑请求或 HTTP 200 不足以证明漏洞利用成功。应检查工作进程派生、应用日志、脚本文件变更及对应请求上下文。日志一般不保存完整请求体，不能保证还原上传或利用载荷。

## UAL 是角色使用统计

UAL 聚合角色或产品的客户端使用数据，UserName、IPAddress、RoleGUID、FirstSeen、LastSeen 与 ActivityCount 有助于历史访问画像，但不是完整成功登录或网络连接日志。不同角色提供的数据能力不同。

## 域控和文件服务的交叉验证

域控上的票据请求与目标服务器上的登录、共享访问应分开采集；目录修改可结合 5136 等审计和对象标识。要解释某时刻 IP 对应哪台主机，需该时段 DHCP、DNS、资产和网络信息，而不是仅查当前解析结果。

NTDS、SYSVOL、证书服务数据库与备份可能涉及大量身份或密钥信息。只有调查范围需要时才采集，使用专门一致性方法，保留访问和交接记录。

## 24 原生日志导出示例

## 使用条件与输出

以下为 Windows PowerShell 5.1 管理员会话中的教学示例，目标 E:\\Evidence 应事先确认为独立证据存储。代码未在受检 Windows 主机上实测，应在匹配系统的验证环境中确认后按现场范围使用。操作会创建输出、进程与日志，但不清除源日志。

先记录 UTC 时间、时区、系统构建与审计策略；再导出实际存在的通道。示例通道只是起点，按角色追加 RDP、WinRM、WMI、AppLocker、SMB 等。成功和失败都应保留。

$case = Join-Path 'E:\\Evidence' (

$env:COMPUTERNAME + '\_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))

New-Item -ItemType Directory -Path $case -ErrorAction Stop | Out-Null

\[DateTime\]::UtcNow.ToString('o') | Set-Content "$case\\utc.txt"

Get-TimeZone | Format-List \* | Out-File "$case\\timezone.txt"

Get-CimInstance Win32_OperatingSystem |

Select-Object Caption,Version,BuildNumber,LastBootUpTime |

Export-Clixml "$case\\os.xml"

auditpol /get /category:\* > "$case\\auditpol.txt"

wevtutil el > "$case\\channels.txt"

$channels = @('Security','System','Application',

'Microsoft-Windows-PowerShell/Operational',

'Microsoft-Windows-TaskScheduler/Operational',

'Microsoft-Windows-Windows Defender/Operational')

$status = foreach ($channel in $channels) {

$name = $channel.Replace('/','\_')

wevtutil gl "$channel" > "$case\\$name-config.txt" 2>&1

$configExit = $LASTEXITCODE

$message = & wevtutil epl "$channel" "$case\\$name.evtx" 2>&1

$exportExit = $LASTEXITCODE

\[pscustomobject\]@{ Channel=$channel; ConfigExit=$configExit

ExportExit=$exportExit; Message=($message -join ' ') }

}

$status | Export-Csv "$case\\export-status.csv" -NoTypeInformation

Get-ChildItem -LiteralPath $case -File |

Get-FileHash -Algorithm SHA256 |

Export-Csv "$case\\hashes.csv" -NoTypeInformation

## 怎么验证采集完成

检查 export-status.csv 的退出码、导出文件大小和可读性；对预期存在却失败的通道记录原因，不能用空文件冒充成功。记录每份日志的最早最新时间，确认覆盖事件窗口。hashes.csv 是本轮产物清单，不包含它自身的哈希；交接时可另对整个归档包计算哈希。

此示例没有采集内存、原始卷、用户配置单元、数据库伴随日志或全部通道，不能当作完整取证工具。在线导出表示某个采集时段的结果，不是磁盘原始 EVTX 的逐字节副本。

## 25 离线事件查询与现状核查

## 从 XML 字段名提取登录要素

下面示例在分析工作站读取已导出的 Security.evtx，不在嫌疑主机运行。时间窗口显式使用 UTC，以免不同分析机器时区改变筛选结果；输出保留原始记录定位信息。

$src = 'E:\\Evidence\\HOST01\\Security.evtx'

$query = "\*\[System\[(EventID=4624) and TimeCreated\[" +

"@SystemTime>='2026-09-01T00:00:00.000Z' and " +

"@SystemTime<'2026-09-02T00:00:00.000Z'\]\]\]"

Get-WinEvent -Path $src -FilterXPath $query -Oldest |

ForEach-Object {

$event = $\_

$xml = \[xml\]$event.ToXml()

$fields = @{}

foreach ($item in $xml.Event.EventData.Data) {

$fields\[\[string\]$item.Name\] = \[string\]$item.'#text'

}

\[pscustomobject\]@{

Computer = $event.MachineName

RecordId = $event.RecordId

UTC = $event.TimeCreated.ToUniversalTime().ToString('o')

UserSID = $fields\['TargetUserSid'\]

User = $fields\['TargetUserName'\]

LogonId = $fields\['TargetLogonId'\]

Type = $fields\['LogonType'\]

SourceIP = $fields\['IpAddress'\]

}

} | Export-Csv 'E:\\Analysis\\logons.csv' -NoTypeInformation

## 其他原生命令的用途

| 查询示例 | 用于确认 | 解释限制 |
| --- | --- | --- |
| Get-NetTCPConnection | 当前连接与所属 PID | 只是查询时刻状态；进程可能退出或 PID复用 |
| Get-CimInstance Win32_Process | 当前进程 路径 命令行 | 权限不足或进程退出可导致字段缺失 |
| Get-ScheduledTask | 当前任务与动作 | 不提供已删除任务的完整历史 |
| Get-NetFirewallProfile | 各配置文件的日志设置 | 当前设置不保证调查期间一直如此 |
| Get-FileHash -Algorithm SHA256 -LiteralPath 'E:\\Analysis\\sample.bin' | 文件内容指纹 | 不说明恶意性；先确保对象是分析副本 |

代码中的目录须实际存在。签名检查可用 Get-AuthenticodeSignature，分析结果还受证书信任链、目录签名和验证环境影响。所有派生 CSV 均不能替代原始 EVTX 或证据文件。

## 26 教学案例 远程登录后的任务驻留

## 场景与证据条件

以下记录均为构造示例。假设 HOST01 已启用有关安全审计、命令行记录和任务日志，所有时间统一为 UTC；域账户 CORP\\ops1 的会话 ID 为 0x7A31。来源 192.0.2.24 是文档示例地址。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/460ba10799bb14fc.png)

图 4 一条可复核的远程访问与任务活动链 连线表示需要验证的关联

| 时间  | 观察到的原始记录 | 当时能得出的结论 |
| --- | --- | --- |
| 09:12:03 | RDP 1149 账户 ops1 来源192.0.2.24 | 观察到远程认证阶段线索 |
| 09:12:05 | Security 4624 Type10 LogonId 0x7A31 | 目标机建立远程交互登录会话 |
| 09:13:10 | 4688 同会话启动任务管理命令 | 此会话下出现相关进程；检查父进程与参数 |
| 09:13:11 | 4698 任务名\\UpdateCheck 主体ops1 | 创建任务；TaskContent 指向异常用户目录 |
| 09:14:00 | 任务操作记录加 4688 启动目标映像 | 任务触发与程序启动获得互证 |
| 09:14后 | USN文件写入与有关网络审计 | 程序后续产生行为；具体关联仍需进程和路径 |

## 专家如何推进

先以 4624 的 TargetLogonId 关联 4698 的 SubjectLogonId 和 4688 的适当身份字段；任务若随后以 SYSTEM 运行，会话 ID 可能改变，不能硬套相同 ID。再核对任务实例、目标路径、启动时间及目标进程。

对任务 XML 的动作路径采集文件和 SHA256，比较签名与软件基线；检查变更工单。要认定“未经授权驻留”，需证明任务异常且不属于批准的运维行为，而不只是任务名可疑。

## 报告示例

“HOST01 在 09:12:05 建立了 CORP\\ops1 的远程交互会话。该会话在 09:13:11 创建了指定任务，后续日志与进程审计支持任务执行了目标程序。现有证据可支持账户活动与任务执行链，但尚不能确定自然人操作者，也不能仅凭网络记录认定发生数据外传。”

若缺少后续进程或任务启动记录，应把结论收敛为“任务已创建”，并明确日志覆盖不足；不可补写没有观察到的步骤。

## 27 教学案例 文件复制与批量破坏

## 案例一 资料是否被复制到 USB

假设在某用户的 Recent 中发现 LNK 指向 E:\\方案\\设计稿.docx，同时注册表有 USB 设备记录。当前证据支持“存在目标路径引用与设备历史线索”，不足以认定该用户完成复制。

| 核验步骤 | 需要的证据 | 结论如何增强 |
| --- | --- | --- |
| 还原盘符 | 设备实例、卷身份、MountedDevices与当时记录 | 将 E 盘与调查设备联系起来 |
| 确认用户上下文 | SID、ProfileList、4624会话 | 避免误用其他用户的缓存 |
| 检查目标写入 | USB镜像中的 $MFT 与USN 如该卷为NTFS | 判断目标文件是否在调查期间创建或修改 |
| 比较内容 | 源目标文件哈希 大小与版本 | 相同哈希支持内容一致，但不独立证明复制方向 |
| 关联动作 | 文件审计、应用或进程记录与时间先后 | 加强源读取和目标写入的关联 |

如果仅取得源主机，未取得 USB 或目标端写入证据，报告应保留“疑似转移”的不确定性。即使两个文件哈希相同，也需排除共同来源、备份同步或更早复制。

## 案例二 批量重命名是否意味着勒索加密

假设 USN 中短时出现大量 DATA_OVERWRITE 和 RENAME 记录，扩展名改变。先按卷、文件引用和时间聚合，确定受影响路径范围；再关联 4688、任务或服务记录，以及 Defender 与文件内容变化。

批处理、压缩、备份和业务迁移也可能产生大量类似操作。仅凭扩展名变化或熵升高不能确认加密；应在副本上检查文件格式、头部、可打开性和内容差异，并评估是否出现勒索说明文件。

## 怎样定位责任进程

USN 不记录写入进程。若存在覆盖该目录的 4663 或合适的端点遥测，可将写入进程、文件路径和时间关联；若没有，应把“某进程同时运行”和“它导致全部文件变化”分开表述。

删除卷影、清除日志或修改时间的相关命令和事件，可加强破坏行为链，但仍要核实返回状态和实际结果。只有命令行不能证明操作成功；现有 VSS 缺失也不能单独证明攻击者删除了快照。

## 两个案例共同的报告要求

明确影响范围、证据覆盖窗口、已确认行为、合理替代解释和未解决问题。教学链路用于指导核验，不应写成任何真实案件的既成事实。

## 28 现场快查矩阵与报告验收

## 从问题直达证据组合

| 问题  | 主证据 | 补充证据 | 判断边界 |
| --- | --- | --- | --- |
| 账户如何登录 | 4624 4625 | RDP 域控 源端记录 | 不直接归属自然人 |
| 程序是否启动 | 4688或Sysmon1 | Prefetch BAM PCA | 创建不等于操作成功 |
| 文件是否曾存在 | $MFT Amcache | LNK 索引 快照 | 缓存不是完整目录历史 |
| 文件是否被读取 | 4663相关访问权 | 应用记录 Jump Lists | 不保证读取全部内容 |
| 是否向外通信 | WFP或连接记录 | DNS SRUM 网络侧日志 | 不等同数据外泄 |
| 是否建立持久化 | 任务服务启动配置 | 创建事件 后续进程 | 配置存在不等于执行 |
| 是否删除文件 | USN 回收站元数据 | $MFT 快照 | 删除记录不保证可恢复 |
| 是否连接外设 | 设备属性与相关事件 | SetupAPI 卷映射 | 安装不等于每次插拔 |
| 是否清除日志 | 1102或104等对应源 | 转发副本 运维记录 | 清除原因仍需判断 |

## 每个结论的三层写法

事实层：记录原文、字段值、主机和可复核定位，例如“EventRecordID 8421 的 TaskName 为指定名称”。推断层：说明哪些独立证据支持行为链及其时间关联。限制层：说明缺失记录、版本条件、替代解释和待补证据。

建议用“已确认”“较强支持”“仅有线索”“证据不足”表明结论强度，并写出依据；不使用未经校准的百分比置信度。保留与主要假设不一致的记录，而不是只搜集支持证据。

## 交付前检查

确认范围包含相关用户、卷、主机与角色；路径完整且可定位；日志的 Provider、通道、版本与字段匹配；时间已归一但保留原值；哈希、采集记录和解析工具版本齐全；事实与推断分开；关键结论能够回到原始记录。

验证未来日志策略时，在测试环境产生受控登录、文件访问、任务及脚本活动，检查是否生成预期事件及命令行。根据实际日志量设置容量、保留与转发，并监测采集停止和解析失败。调查时补开日志只能记录未来，不能修复历史空白。

Security · 目录
