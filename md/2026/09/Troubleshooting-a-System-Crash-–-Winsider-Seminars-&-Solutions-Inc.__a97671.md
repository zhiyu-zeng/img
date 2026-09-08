---
title: Troubleshooting a System Crash – Winsider Seminars & Solutions Inc.
source: https://windows-internals.com/troubleshooting-a-system-crash/
source_host: windows-internals.com
clip_date: 2026-09-09T01:32:29+08:00
trace_id: 3f465068-d996-467a-9da0-bab75a28a028
content_hash: 660b27b96699a812b0ef7572d67c88c77c05141ac1eac7db6607a98139e4c3b0
status: summarized
tags:
  - 系统崩溃排查
  - Intel SUR
series: null
feed_source: null
ai_summary: 系统频繁蓝屏且完全不生成内存转储，排查发现 Intel SUR 服务中两个可疑启动参数，禁用后崩溃减少但未彻底解决，作者推测转储缺失可能源于 securekernel.exe。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: null
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 系统频繁蓝屏且完全不生成内存转储，排查发现 Intel SUR 服务中两个可疑启动参数，禁用后崩溃减少但未彻底解决，作者推测转储缺失可能源于 securekernel.exe。
> 
> - **现象：** 系统每天多次蓝屏且伴随多种错误码；即使配置了完整内存转储，所有崩溃都没有生成任何 .dmp 文件，常规日志仅有“崩溃且无法写转储”的通用记录。
> - **异常线索：** Microsoft-Windows-Hyper-V-Hypervisor 频道出现一条 ETW 事件，声称 MSR 0x1F1 被 Hyper-V 阻止；这是日志中唯一异常，但不能确定与崩溃直接相关。
> - **源头定位：** 关联到一个名为 Intel “System Usage Report” 的驱动，其服务 ESRV_SVC_QUEENCREEK 由 esrv_svc.exe 以 LocalSystem 启动，命令行中加载了大量 DLL 与配置项。
> - **关键参数：** 启动参数包含 `--do_not_generate_dump_files`，可解释 crash dump 为何始终未被写入；`--watchdog_cpu_usage_limit 50` 则可能在 CPU 使用率超过 50% 时触发系统崩溃。
> - **验证结论：** 禁用该服务及相关服务后，蓝屏次数显著减少但未完全停止；转储生成没有恢复，作者表示无 dump 可能是 securekernel.exe 的 bug，最终未找到完整修复方案。

One day my system started crashing. A lot. Multiple blue screens per day, with a few different error codes. The worst part – even though my system was configured to collect full memory dumps, no crash dumps were generated (not even mini dumps). They failed to get written every single time, so I couldn’t analyze them to try and get to the root of the problem.

Before giving up and re-imaging my machine, I decided to take a look at Event Viewer to maybe get some hints to what might be going wrong, and maybe find a way to fix it. I started with the Application and System logs found under the “Windows Logs” category. Those didn’t have any information besides generic events letting me know that my system crashed and that a dump file could not be written. And I already knew both of these things.

## 在Hyper-V日志发现异常

So, I went to look at other ETW events, with the vague hope of finding something useful. I ended up finding it in an unexpected place – the Microsoft-Windows-Hyper-V-Hypervisor channel:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e68bee718470d384.png)

This really isn’t giving me much information and is in no way an indicator that this is the cause of the crashes, but this is the only unusual thing I could find so it’s a start.

On a side note, I couldn’t find any information about MSR 0x1F1 or why it should be blocked by Hyper-V. If anyone has any information to share with me, I’d be happy to learn! You might also notice that this ETW message discloses some kernel pointers, which is an interesting piece of data. But this is unrelated to the topic of this post so I’ll move on.

## 锁定Intel SUR驱动

Now, let’s look at this driver. This is the “Intel System Usage Report” driver, and there really isn’t much information about what it is or what it’s meant for. This driver creates a device with the same name, so finding the process that uses this driver is easy, using the System Informer search function:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d70b6055d452bd1.png)](https://windows-internals.com/wp-content/uploads/2024/01/system_informer_handle_search.png)

Esrv_svc.exe is a process that runs through the `ESRV_SVC_QUEENCREEK` service, which is described as “Intel(r) Energy Checker SDK. ESRV Service queencreek”. When looking at the image path that gets executed when the service starts, we can see an unusual path:

`"C:\Program Files\Intel\SUR\QUEENCREEK\x64\esrv_svc.exe" "--AUTO_START" "--start" "--start_options_registry_key" "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\services\ESRV_SVC_QUEENCREEK\_start"`

Of course, the next step is to look at the service registry key that is referenced in this command:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/74afec4f940980a4.png)](https://windows-internals.com/wp-content/uploads/2024/01/regedit_queencreek.png)

The \_start registry value is a long command that doesn’t fit in the regedit view, no matter how much I expand it. So I’ll dump it from the command line with reg query:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a3ca6c393ba8fdc.png)](https://windows-internals.com/wp-content/uploads/2024/01/reg_query_queencreek.png)

**`reg query HKLM\SYSTEM\CurrentControlSet\Services\ESRV_SVC_QUEENCREEK`**

`Type                REG_DWORD        0x10`

`Start               REG_DWORD        0x2`

`ErrorControl        REG_DWORD        0x1`

`ImagePath           REG_EXPAND_SZ    "C:\Program Files\Intel\SUR\QUEENCREEK\x64\esrv_svc.exe" "--AUTO_START" "--start" "--start_options_registry_key" "HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\services\ESRV_SVC_QUEENCREEK\_start"`

`DisplayName         REG_SZ           Energy Server Service queencreek`

`ObjectName          REG_SZ           LocalSystem`

## 解析服务启动参数

`_start              REG_EXPAND_SZ    "--START" "--output_folder" "%LOCAL_APP_DATA%\Intel\SUR\QUEENCREEK\collected_data" "--depend_on_key" "SOFTWARE\Intel\SUR\ICIP_RUN" "--depend_on_folder" "%LOCAL_APP_DATA%\Intel\SUR\QUEENCREEK\intermediate_data" "--depend_on_folder_size_less_than" "262144000" "--depend_on_folder_files_count_less_than" "300" "--depend_on_folder_depth_less_than" "20" "--depend_on_folder_scan_time_less_than" "40000" "--depend_check_period" "3600000" "--address" "127.0.0.1" "--port" "49350" "--do_not_generate_dump_files" "--time_in_ms" "--pause" "5000" "--watchdog" "5" "--watchdog_cpu_usage_limit" "50" "--end_on_error" "--priority_boost" "--kernel_priority_boost" "--shutdown_priority_boost" "--do_not_use_system_error_logs" "--library" "C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_modeler.dll" "--no_pl" "--resume_delay" "30000" "--device_options" " time=no  generate_key_file=no performance=no in_cycle_performance=no output=w output_folder='%LOCAL_APP_DATA%\Intel\SUR\QUEENCREEK\intermediate_data' upload_folder='%LOCAL_APP_DATA%\Intel\SUR\QUEENCREEK\collected_data' lock_xls=yes deferred_logger_stop=yes il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_acpi_battery_input.dll','start_at=6' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_wifi_input.dll' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\devices_use_input.dll','service=yes enumerate_pid=yes' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_system_power_state_input.dll','numsamples_to_buffer=6 clock=5000 delayed_resume=30000' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_os_input.dll','clock=5000 threads=auto configuration_file=C:\Program Files\Intel\SUR\QUEENCREEK\x64\sur_os_counters.txt optimize=yes auto_min_tick=10 auto_tick_gap=5' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_phat_input.dll','delay=1000 always_log_phat_metadata=YES extract_phat_on_new_boot_only=YES' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_process_input.dll','configuration_file=C:\Program Files\Intel\SUR\QUEENCREEK\x64\process_input_options.txt' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_hw_input.dll','configuration_file=C:\Program Files\Intel\SUR\QUEENCREEK\x64\sur_hw_config.txt' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_etw_input.dll','configuration_file=C:\Program Files\Intel\SUR\QUEENCREEK\x64\etw_options_config.txt' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_crashlog_input.dll','start_at=12 nogpr_cpusig_count=3 read_sampling_count_max=200 configuration_file=C:\Program Files\Intel\SUR\QUEENCREEK\x64\crashlog_options.txt ' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_fps_input.dll','clock=5000' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_heartbeat_input.dll','service=yes' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_csme_input.dll','start_at=8' il='C:\Program Files\Intel\SUR\QUEENCREEK\x64\intel_process_watcher_input.dll','override=yes configure=yes generate_samples=yes enumeration=no enumeration_delay=10000 enumeration_pause=250' ll='C:\Program Files\Intel\SUR\QUEENCREEK\x64\sql_logger.dll','db_differential_elaspsed_time=yes db_wal=yes db_wal_autocheckpoint=0 db_cache=yes db_cache_size=auto db_max_page_count=300000 db_synchronous=off db_journal_mode=off db_locking_mode=exclusive+ delayed_dctl=summarize dctl_process_delay=5000' "`

`DelayedAutostart    REG_DWORD          0x1`

`description         REG_SZ             Intel(r) Energy Checker SDK. ESRV Service queencreek`

`run                 REG_DWORD          0x1`

This command line has a lot of DLL paths and configuration options. There are some interesting persistence options here (which require running as admin) – replace any of the DLLs in the command with your own DLLs and you’ll get code execution when the service starts. This service also uses some batch and VBS files which are executed on installation, update and uninstallation. Those have some other interesting persistence options, though they also require admin privileges to use.

## 识别可疑配置项

But the parts relevant to my system crashes are the configuration flags. First, the `do_not_generate_dump_files` flag might be the one responsible for the lack of dump files after system crashes. Second, the `--watchdog_cpu_usage_limit 50` flag might be responsible for the crashes themselves by crashing the system when the CPU usage gets too high.

To try and resolve the issue I disabled this service and all its related services. It did make my system crash less, but didn’t stop the crashes completely, so looks like this was only part of the problem. Crash dump generation didn’t resume, so my guess was wrong (later on I learned that it might be a bug in securekernel.exe causing that issue).

## 调查未完全解决

This investigation didn’t have a very satisfying resolution, as I didn’t find a complete fix for the repeated crashes or lack of memory dumps (yet!). But I thought the research process itself might be interesting enough to publish it, and hopefully it’ll help some other people.
