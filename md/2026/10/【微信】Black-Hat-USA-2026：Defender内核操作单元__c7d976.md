---
title: 【微信】Black Hat USA 2026：Defender内核操作单元
source: https://mp.weixin.qq.com/s/fhdebq2EyvrgBwouAtzogA
source_host: mp.weixin.qq.com
clip_date: 2026-10-10T10:26:02+08:00
trace_id: 749f28e0-0b97-44a5-b583-17726da74818
content_hash: 49c65dd595fa25a9cc7c21354805d503927123a32eebab71a7712cf88dc4ba4f
status: synced
tags:
  - 微信
  - Windows逆向
  - 内核
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 微软签名的 Defender BTR 启动修复驱动可被滥用为内核操作原语，需从哈希黑名单转向执行血缘与上下文检测。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 3f575244-d011-8173-9988-e24909c21593
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 微软签名的 Defender BTR 启动修复驱动可被滥用为内核操作原语，需从哈希黑名单转向执行血缘与上下文检测。
> 
> - **研究对象：** BTR.sys 是 Defender Boot Time Removal Tool，嵌入 `MpEngine.dll`，系统启动时一次性加载，从 `:changelist` ADS 读取加密配置，执行文件/注册表操作后自行卸载，且为微软签名驱动。
> - **攻击面：** 配置采用固定流加密与自定义 CRC；加密只隐藏格式、CRC 只防意外损坏，均不证明调用者身份，掌握私有协议与管理员权限即可编排其修复能力。
> - **兼容性：** 分析 18 个 64 位签名 BTR.sys 版本，从 Win7 Build 7601 到 Win11 25H2+，加密材料、事务形态与 Action ID 保持兼容，使该原语可长期复用。
> - **黄金窗口：** BTR 作为 Start=1 驱动位于 Boot Bus Extender 组，文件系统已就绪而 Defender 用户态引擎未启动；实验中 BTR 完成约 34 秒后 MsMpEng.exe 才启动。
> - **检测：** 用 Sysmon ID 6/11/12/13/15/23/26 关联 ADS、服务键、驱动加载与 PID 4 文件删除；Sigma 规则检测 `:changelist` ADS 和 Boot Bus Extender Args，完整序列命中应进入 Incident。

**白帽子罗棋琛** *2026年10月10日 10:00*

## Defender 修复驱动如何变成内核操作单元

> Black Hat USA 2026 议题笔记：BTR Reforged — Weaponizing Defender's Remediation Driver as a Kernel Operation Primitive

一条系统启动驱动记录显示：文件名是随机八位字符，服务组为 Boot Bus Extender，参数指向驱动文件的 `:changelist` Alternate Data Stream。它看起来像典型 Rootkit 持久化，签名和来源却指向 Microsoft Defender。

Jiří Vinopal 的公开课件从这个“不是误报的误报”出发，逆向了 Defender Boot Time Removal Tool（BTR.sys）。BTR 是 Defender 在文件被占用、必须重启才能清理时使用的一次性内核驱动。它从加密配置读取事务，在 Ring 0 完成文件和注册表操作，然后自行卸载。

真正的问题不在内存破坏，也没有依赖第三方漏洞驱动。研究表明，如果攻击者取得管理员级前置权限、掌握驱动的私有配置语言并安排启动时序，就可能让这枚微软签名的防御组件执行任意文件/注册表操作，甚至在 Defender 用户态服务启动前破坏安全栈。

![议题课件封面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f4524f9525fc4931.jpg)

*图 1：研究对象是 Defender 自身修复驱动被重新编排，而不是传统第三方 BYOVD*

本文保留架构、启动窗口与检测方法，不提供硬编码密钥、事务二进制布局、Action Builder、驱动加载命令或任何针对安全组件的破坏性配置。

## 1、BTR 是什么，为什么它拥有高权限

BTR 即 Boot Time Removal Tool。课件说明它是 Microsoft-signed Kernel-mode Driver，嵌入 `MpEngine.dll` 的 PE Resource 中，仅在某次恶意软件修复需要重启时落盘。Defender 会随机化驱动文件名，把加密指令写入该文件的 `:changelist` ADS。

![不是恶意软件，而是 Defender](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3070bf480b2d30ff.jpg)

*图 2：BTR 的设计目标是绕过文件占用，在系统启动阶段完成可信修复*

![BTR 的正常来源与落盘时机](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/20d8194f64377dee.jpg)

*图 3：驱动平时不常驻，只有 Reboot Remediation 场景才由 MpEngine.dll 暂时释放*

内核权限本身是功能需要。恶意软件文件可能在用户态被进程占用、被 ACL 保护或在服务启动后立即恢复；Boot-time Driver 可以在更早阶段删除文件和修改修复所需的注册表项。

风险来自授权模型：BTR 不与在线 Defender 服务进行持续会话，也没有面向外部调用者的 IOCTL 认证。启动时，它根据 Service Registry 中的参数找到配置，校验并执行，然后退出。谁能准备一份可接受配置并安排服务加载，谁就能借用这组修复能力。

这是一类容易漏审的 Trusted Remediation Primitive：备份恢复、EDR Quarantine、系统升级、磁盘修复、驱动卸载和 Boot-time Cleanup 都需要超出普通应用的权限。它们的私有控制协议和异常启动路径，同样应进入攻击面管理。

## 2、一次性执行模型让配置成为全部攻击面

课件把生命周期概括为四步：System-start 加载、执行配置中的事务、自行卸载、结束。没有长期 Device Object 或公开文档，攻击面集中在配置文件与 Service Key。

![BTR 的一次性执行模型](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dd4ec657c48bc465.jpg)

*图 4：加载、执行、Self-unload 的短生命周期减少常驻痕迹，也缩短检测窗口*

![逆向对象是私有配置协议](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/968d74e499ed93a9.jpg)

*图 5：研究围绕加密、完整性、事务结构和内核操作菜单展开*

研究者发现，配置采用固定的流加密材料与自定义 CRC 完整性校验，并由全局部分和多条 Operation Item 组成。关键安全结论是：加密只隐藏格式，不证明调用者身份；CRC 只能发现意外损坏，不能阻止知道算法的人重算。

可以用通用审计模型描述这类风险，而不记录可复现协议：

yaml

```
trusted_primitive:component:defender-boot-time-removal-drivertrust:signer:microsoftrequired_by_os:trueactivation:mechanism:system-start-driver-serviceconfiguration_locator:service-registry-argsconfiguration_storage:named-file-streamauthorization:online_broker_required:falseper-device_secret:falsecaller_identity_bound:falsecapabilities:-privileged_file_operation-privileged_registry_operationlifecycle:-load-consume_configuration-execute_once-write_feedback-self_unloaddefensive_focus:-configuration_creation_lineage-service-key-creation-driver-load-to-kernel-operation-sequence
```

签名验证回答“二进制是否由可信发布者签发”，不能回答“这次配置是否由合法 Defender Remediation 创建”。后一个问题必须依靠创建进程、服务变更、预期维护事件和行为结果共同判断。

## 3、十五年的兼容性把维护能力变成稳定原语

课件对 Winbindex 与 VirusTotal 样本去重后，分析了 18 个不同的 64 位 Microsoft-signed BTR.sys 版本。研究者称，从 Windows 7 Build 7601 到 2026 年 7 月的 Windows 11 25H2+，加密材料、事务形态和识别到的 Action ID 保持兼容。

![跨版本稳定的 BTR 实现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4503f052f05db758.jpg)

*图 6：兼容性对系统修复是优点，对攻击者而言也意味着原语可长期复用*

这类稳定性与常见 Vulnerable Driver 不同。BYOVD 通常使用一个过期、第三方签名、带越界或任意读写漏洞的驱动；BTR 是操作系统安全产品的功能组件，研究中没有利用 Memory Corruption。

风险评估不能再只维护“Bad Driver Hash”列表，还要维护允许驱动的 Expected Context：

json

```json
{"driver_family":"Boot Time Removal Tool","allowed_signer":"Microsoft Windows","expected_parent_workflow":"Defender remediation requiring reboot","expected_service_start":1,"expected_configuration_stream":":changelist","expected_creator":"approved Defender platform binary","maximum_age_before_reboot_minutes":30,"expected_cleanup_after_boot":true,"unexpected_conditions":["created_by_interactive_admin_tool","driver_staged_outside_defender_workflow","service_group_changed_manually","kernel_file_delete_targets_security_binaries","repeated_activation_without_remediation_case"]}
```

即使 Hash 随 Defender Platform 更新变化，这些上下文不变量仍能工作。

## 4、真正危险的是操作菜单，不是解密算法

课件把 BTR 配置中的六类 Action 称为六个 Kernel Primitive。其中包括删除/移动文件、处理受锁文件、创建注册表路径、设置任意类型的注册表值等。组合后可能形成文件替换、持久化或安全配置破坏。

![六类内核修复动作](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e0d1819eb490b7f7.jpg)

*图 7：驱动原本用于修复，配置一旦失去可信来源约束，同一能力即可被反向使用*

不需要公开每个 Action 的二进制结构，也能进行威胁建模：

text

```
Source：谁创建了驱动、ADS 与服务项？ Authorization：驱动如何确认配置来自 Defender？ Scope：文件和 Registry Target 是否有限定目录与 Key？ Freshness：旧配置能否重放？ Binding：配置是否绑定设备、Boot、Remediation Case 和 Driver Build？ Audit：执行结果是否留在独立、防篡改的日志中？ Failure：校验失败时是否 Fail Closed，是否自动清理？ 
```

对于任何高权限 Remediation Driver，理想设计应使用设备级或启动级不可伪造授权，把 Operation Scope 绑定到已签发的修复 Case，并由受保护 Broker 创建服务。固定加密密钥和 CRC 不应承担认证责任。

## 5、“黄金窗口”位于文件系统就绪与安全栈完整启动之间

BTR 需要直接访问文件，因此不能作为最早的 `Start=0` Boot Driver 运行。研究者据此推导出可利用时机： `Start=1` 的 System Driver 阶段，文件系统已准备好，而 Defender 用户态引擎尚未启动。

![文件系统已就绪、安全栈仍休眠](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2b853ebd2c75d91a.jpg)

*图 8：启动早期存在一个能力不对称窗口，内核可写文件但用户态检测尚未在线*

Windows 两阶段加载会按 ServiceGroupOrder 决定同一阶段的先后。课件将 BTR 安排在 Boot Bus Extender Group，位置靠前；WdFilter 虽已加载，但尚未得到用户态引擎配合。Procmon Boot Logging 显示，实验环境中 BTR 完成工作约 34 秒后 MsMpEng.exe 才启动。

![启动组顺序与 BTR 位置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d709037056e5b80e.jpg)

*图 9：Boot Bus Extender 位于 Phase 1 前段，早于多数 Filter 与网络驱动组*

![Procmon 捕获的启动时序](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/615fc2bef8fe03d6.jpg)

*图 10：课件在 Windows 11 25H2 实验中验证了驱动与 Defender 用户态服务之间的时间差*

时间差不能直接外推到所有设备，固件、存储、版本、策略和驱动数量都会改变毫秒/秒数。检测规则应使用因果顺序与短窗口，而不是写死“34 秒”：

text

```
服务/ADS 创建 → 系统重启 → 随机名签名驱动加载 → PID 4 文件或注册表操作 → BootClean.log 创建/删除 → Defender 服务异常缺失或启动失败 
```

离线或启动期行为也说明遥测必须独立于被保护产品。若唯一的 EDR 正是攻击目标，其用户态 Sensor 可能来不及上报。Windows Event Log、Sysmon Driver、远程 WEF、UEFI/Boot Telemetry 和网络侧健康检查要形成互补。

## 6、WDAC 与 Vulnerable Driver Blocklist 为什么难以直接阻断

研究材料指出，BTR 是 Windows 内置、Microsoft-signed 且对合法修复有功能价值，把它加入 Vulnerable Driver Blocklist 会破坏正常 Defender Remediation。传统 LOLDriver 生态假设“坏驱动是第三方、过期或存在漏洞”，在这里并不成立。

![签名与 Blocklist 的边界](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/13fd74f1a2861700.jpg)

*图 11：允许签名驱动加载不代表允许任意主体编排其私有修复协议*

WDAC 仍然重要，它能阻止大量未知或不允许驱动。只是该场景要求从 Allow/Block 二元判断升级到 Contextual Trust：

-   BTR Driver Hash 是否属于企业当前批准的 Defender Platform；
    
-   文件是否由预期 Defender 进程从受保护路径落盘；
    
-   是否存在对应的 Threat Remediation、Reboot Pending 和管理工单；
    
-   Service Name、ImagePath、Start、Group 与 Args 是否符合正常模式；
    
-   配置与服务项创建后是否在短时间内重启；
    
-   启动后 Driver 是否完成一次性清理；
    
-   Operation Target 是否落在已确认威胁对象，而不是安全产品自身或关键系统文件。
    

允许列表需要记录工作流，而不只是证书链。

## 7、先把 Sysmon 需要的事件真正采集起来

课件给出四组行为信号：`:changelist` ADS 写入对应 Sysmon Event ID 15；DriverLoad 后由 PID 4 删除文件对应 ID 6 + 23；Service Key 写入 `Args` 、 `Group=Boot Bus Extender` 对应 ID 12/13； `BootClean.log` 的创建与删除对应 ID 11 + 23。

![行为检测信号](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fc674c0c623c0058.jpg)

*图 12：单条事件都有合法解释，组合和时间顺序才形成高置信告警*

Microsoft 官方 Sysmon 文档确认：ID 6 记录 Driver Load，ID 11 记录 File Create，ID 12—14 记录 Registry Modification，ID 15 记录 Named Alternate Data Stream，ID 23/26 记录 File Delete，其中 ID 23 还会归档删除文件。事件并非全部默认启用，需要显式配置并评估容量。

xml

```ruby
<Sysmonschemaversion="4.90"><HashAlgorithms>sha256,imphash</HashAlgorithms><ArchiveDirectory>Sysmon</ArchiveDirectory><EventFiltering><DriverLoadonmatch="include"><Signaturecondition="contains">Microsoft</Signature></DriverLoad><FileCreateStreamHashonmatch="include"><TargetFilenamecondition="end with">:changelist</TargetFilename></FileCreateStreamHash><RegistryEventonmatch="include"><TargetObjectcondition="contains">\SYSTEM\CurrentControlSet\Services\</TargetObject></RegistryEvent><FileCreateonmatch="include"><TargetFilenamecondition="end with">\BootClean.log</TargetFilename></FileCreate><FileDeleteonmatch="include"><TargetFilenamecondition="contains any">\Windows\System32\drivers\;\ProgramData\Microsoft\Windows Defender\;\BootClean.log</TargetFilename></FileDelete></EventFiltering></Sysmon>
```

生产配置不要仅采集 `:changelist` 。攻击者掌握实现后可能使用不同 Feedback ADS 名称；驱动本身的 Args、服务组、随机文件名、签名和后续 PID 4 行为更难同时改变。

ID 23 会归档删除文件，容量与敏感数据风险较高。若无法承受，应使用 ID 26 记录删除而不归档，或只对安全产品目录启用精确 Include。

## 8、检测要关联 ADS、Service、Driver 与 Kernel File Operation

课件演示中，Sysmon 把驱动执行的删除归因给 System PID 4。仅以 `ProcessId == 4` 告警会产生大量噪声；但它紧随随机名 BTR Driver Load，就形成清晰的 Execution Lineage。

![DriverLoad 与 PID 4 FileDelete](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/80bfe4f00c8afd67.jpg)

*图 13：内核操作缺少普通进程父子链，需要用主机与时间窗口重建血缘*

Microsoft Sentinel / Defender XDR 风格的 KQL 可以先建立候选事件，再按 Device 与时间关联：

kusto

```sql
let window = 90s; let btrAds = Sysmon | where EventID == 15 | where TargetFilename endswith ":changelist" | project DeviceId, AdsTime=TimeGenerated, AdsPath=TargetFilename,           AdsCreator=Image, AdsProcessGuid=ProcessGuid;  let driverLoads = Sysmon | where EventID == 6 | where ImageLoaded endswith ".sys" | where SignatureStatus =~ "Valid" and Signature contains "Microsoft" | project DeviceId, DriverTime=TimeGenerated, DriverPath=ImageLoaded,           DriverHash=Hashes;  let kernelDeletes = Sysmon | where EventID in (23, 26) | where ProcessId == 4 or Image =~ "System" | project DeviceId, DeleteTime=TimeGenerated,           DeletedPath=TargetFilename, DeleteHashes=Hashes;  btrAds | join kind=inner driverLoads on DeviceId | where DriverTime between (AdsTime .. AdsTime + 30m) | join kind=inner kernelDeletes on DeviceId | where DeleteTime between (DriverTime .. DriverTime + window) | extend SecurityTarget = DeletedPath has_any (     @"\Windows\System32\drivers\",     @"\Windows Defender\",     @"\SecurityHealth\" ) | project AdsTime, DriverTime, DeleteTime, DeviceId,           AdsCreator, AdsPath, DriverPath, DriverHash,           DeletedPath, SecurityTarget | order by DeleteTime desc
```

不同 SIEM 的 Sysmon 字段名会变化，部署时必须以实际 Parser 为准。规则还应把正常 Defender Remediation Case 作为 Context，而不是简单排除 `MpEngine.dll` ：合法进程也可能被注入或其文件被替换，排除会留下盲区。

## 9、用 Sigma 拆成可复用的基础分析

先部署低层 Atomic Detection，再由 SIEM Correlation 提升置信度。下面两条 Sigma 风格规则分别检测配置 ADS 和可疑 Service Key；它们不单独触发隔离，输出应进入聚合规则。

yaml

```
title:BTRChangelistAlternateDataStreamCreatedid:670fc8c0-427a-4fdb-917c-74ae8483fe79status:experimentallogsource:product:windowscategory:create_stream_hashdetection:selection:TargetFilename|endswith:':changelist'condition:selectionfalsepositives:-LegitimateMicrosoftDefenderrebootremediationlevel:mediumtags:-attack.defense-evasion
```

yaml

```rust
title:SystemDriverServiceConfiguredWithBTRChangelistArgsid:2448774d-48db-45fc-b6c2-b92bb3ab04ddstatus:experimentallogsource:product:windowscategory:registry_setdetection:service_key:TargetObject|contains:'\SYSTEM\CurrentControlSet\Services\'value_name:TargetObject|endswith:-'\Args'-'\Group'-'\Start'suspicious_details:Details|contains:-':changelist'-'Boot Bus Extender'condition:service_keyandvalue_nameandsuspicious_detailsfalsepositives:-LegitimateMicrosoftDefenderrebootremediationlevel:high
```

![实验中的信号](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e1ade1d4ea6da4e0.jpg)

*图 14：ADS 和 BootClean.log 都能在 Sysmon 中留下短暂但可关联的证据*

高置信 Correlation 可以要求：同设备 30 分钟内出现 ADS 与 Service 变更；重启后 120 秒内加载签名驱动；随后 90 秒内 PID 4 删除安全组件文件或快速创建/删除 BootClean.log；最后 Defender Health 变为 Degraded。四步全部满足时，应该直接进入 Incident，而不是只发低优先级 IOC 告警。

## 10、响应重点是保全启动证据与恢复信任

课件在研究时称尚未观察到真实世界滥用，并强调应在技术公开后尽快部署检测。它同时记录：研究于 2026 年 2 月 21 日报告给 MSRC，当时没有计划立即 Servicing。这个状态属于课件时间点，后续应以 Microsoft 当前公告与 Defender Platform Update 为准。

![研究时尚未观察到在野滥用](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a4cb68fb85ec5307.jpg)

*图 15：没有在野样本不等于没有风险，检测需要在攻击工具普及前准备*

一旦命中完整序列，不能只重新安装 Defender 后关闭告警。攻击者已经具备管理员或等价的服务/驱动加载前置能力，系统信任根可能被修改。响应流程应包括：

yaml

```
incident_playbook:trigger:btr_behavioral_sequence_high_confidencecontain:-isolate_host_at_network_control_plane-block_interactive_admin_credentials-preserve_remote_event_logscollect:-sysmon_events_6_11_12_13_15_23_26-system_and_defender_event_logs-service_registry_hives-driver_file_and_ads_metadata-secure_boot_and_code_integrity_logs-defender_platform_health_and_version-boot_timelinevalidate:-compare_driver_hash_with_approved_defender_build-identify_ads_creator_process_and_user-map_deleted_files_to_security_stack-search_same_service_pattern_across_fleetrecover:-rebuild_from_known_good_media_if_security_stack_modified-rotate_admin_and_service_credentials-update_defender_platform_and_os-verify_secure_boot_vbs_hvci_policyhunt:-changelist_ads_across_30_days-random_system_start_driver_services-pid4_deletes_of_security_binaries-defender_health_drop_after_reboot
```

![信任不能只看签名](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b6bee812c130ae92.jpg)

*图 16：签名是必要条件，行为上下文和执行血缘必须补足“这次使用是否可信”*

预防侧最重要的是收紧 `SeLoadDriverPrivilege` 、限制本地管理员、保护 Service Registry、启用 Secure Boot/VBS/HVCI、保持 Defender Platform 与 Windows 更新，并将驱动服务创建纳入高价值审计。它们不能单独阻止 BTR 被合法路径调用，却能抬高攻击者准备 Service 与重启链路的门槛。

BTR Reforged 把一个常见检测误区暴露得很清楚：微软签名、Windows 内置、Security Product 组件都不是“无需观察”的同义词。高权限修复能力必须验证调用来源和操作范围；防守方也必须从 Hash Allowlist 转向 Execution Lineage。真正有辨识度的不是某个驱动文件，而是它由谁准备、在什么启动阶段加载、紧接着让 PID 4 对哪些对象做了什么。

* * *

延伸资料：Microsoft Sysmon Event Reference · Sysmon 官方说明

Black Hat 官方 Session 页面

**原始会议材料（仓库内）**

-   演讲课件 PDF
    

开源资料与原始议题 PDF

本文对应的 Markdown 原稿、Black Hat 原始议题 PDF 与配图已整理到 GitHub，可按文章编号查找和下载。

https://github.com/cybermaxluo/black-hat-usa-2026-talks

也可以点击文末“阅读原文”进入仓库。欢迎 Star、提交 Issue 或参与勘误。

Black Hat · 目录
