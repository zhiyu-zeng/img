---
title: "WMI Internals: Providers, the CIM Repository, and Eventing"
source: https://blog.yunolay.com/wmi-internals-providers-cim-repository-eventing/
source_host: blog.yunolay.com
clip_date: 2026-10-13T10:17:44+08:00
trace_id: 82a28267-f686-4e2d-a18a-965d31b1c73f
content_hash: 5f7cf871b8283724946cafac2e4ea1a1cde26feae096c51dc4ff84d99e95b480
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: Yunolay·Windows内核/逆向
ai_summary: WMI 是一套以 SYSTEM 权限运行的管理栈，对内可查询控制系统状态，对外是攻击者常用的执行、侦察与无文件持久化载体。掌握其内部结构（CIMOM、提供程序、CIM 仓库、事件订阅）是防御 WMI 滥用的前提。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-81c0-b4cc-c9bd7d9be08f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WMI 是一套以 SYSTEM 权限运行的管理栈，对内可查询控制系统状态，对外是攻击者常用的执行、侦察与无文件持久化载体。掌握其内部结构（CIMOM、提供程序、CIM 仓库、事件订阅）是防御 WMI 滥用的前提。
> 
> - **核心架构：** `Winmgmt` 服务内的 CIMOM 只做请求路由，真正的数据由 COM DLL 形式的提供程序返回；提供程序被隔离在 `WmiPrvSE.exe` 宿主进程中运行，DLL 被异常加载或该进程派生脚本解释器是重要告警信号。
> - **命名空间与查询：** 类按命名空间组织，默认 `root\cimv2` 提供 `Win32_*` 类；用只读的 WQL 查询，如 `SELECT * FROM Win32_Process WHERE Name = 'lsass.exe'`。
> - **CIM 仓库：** 位于 `C:\Windows\System32\wbem\Repository`，`objects.data` 存 schema 与提供程序注册，动态数据（进程、服务状态）由提供程序实时获取；唯一持久化的动态内容是**永久事件订阅**。
> - **事件订阅三件套：** `root\subscription` 下的 `__EventFilter`（WQL 触发器）、`__EventConsumer`（`CommandLineEventConsumer` 或 `ActiveScriptEventConsumer` 执行载荷）、`__FilterToConsumerBinding`（绑定），永久订阅由 WMI 服务托管，可跨重启运行且无落地文件。
> - **攻击面与检测：** `Win32_Process.Create` 可以 SYSTEM 身份本地或远程启动进程；WQL 侦察不掉工具；检测手段包括基线并监控 `root\subscription`、启用 Microsoft-Windows-WMI-Activity ETW、监控 `WmiPrvSE.exe` 派生 shell 及远程进程创建调用。

Windows Management Instrumentation (WMI) is one of those subsystems that sysadmins use every day without thinking about, that monitoring products are built on top of, and that attackers reach for constantly because it is powerful, ubiquitous, and runs as `SYSTEM`. It is Microsoft’s implementation of the industry **Web-Based Enterprise Management (WBEM)** standard and its **Common Information Model (CIM)**— a uniform way to query and control almost every aspect of a machine’s state, from running processes and services to disks, event logs, and installed software. This article looks at how WMI is put together internally: the service and providers that answer queries, the object model and query language, the on-disk repository, and the permanent-event-subscription mechanism that makes WMI both a great automation tool and a favorite persistence technique.

## Architecture: CIMOM, Providers, and Consumers

At the center of WMI is the **WMI service**, `Winmgmt`, which runs inside a shared `svchost.exe` process. Its core component is the **CIM Object Manager (CIMOM)**— the broker that sits between management applications and the code that actually knows how to answer their questions. When an application asks WMI for the list of running processes, the CIMOM does not know the answer itself; it routes the request to the appropriate **provider**.

A **provider** is a component — almost always a COM DLL — that exposes a set of classes backed by a real subsystem. The process provider surfaces `Win32_Process` by talking to the process manager; the registry provider exposes registry access; the event-log provider surfaces log records, and so on. To isolate these often third-party DLLs from the critical `Winmgmt` service, providers are loaded into a separate host process, **`WmiPrvSE.exe`** (WMI Provider Host). Seeing `WmiPrvSE.exe` spawn a child process, or consuming unusual resources, is frequently the first observable sign that something is using WMI. Applications that consume WMI data — PowerShell, monitoring agents, or an attacker’s script — are the **consumers**.

## Namespaces and Classes

WMI’s data is organized into a hierarchy of **namespaces**, which behave like directories for classes. The default and most-used namespace is `root\cimv2`, home to the familiar `Win32_*` classes; others include `root\default`, `root\subscription` (important later), `root\security`, and vendor-specific trees. Within a namespace live **classes**, each describing a manageable entity:

-   `Win32_Process` — running processes, with a `Create` method to start new ones.
-   `Win32_Service` — services and their configuration.
-   `Win32_LogonSession`, `Win32_ComputerSystem`, `Win32_OperatingSystem` — session and host information.

A class definition can expose **properties** (data) and **methods** (actions), and at runtime the provider returns concrete **instances**. You query them with **WQL (WMI Query Language)**, a read-only SQL-like dialect. For example, `SELECT * FROM Win32_Process WHERE Name = 'lsass.exe'` returns the LSASS process instance. WQL’s familiarity is part of why WMI is so approachable — and so easy to weaponize for reconnaissance.

## The CIM Repository

Class definitions, provider registrations, and certain persistent objects are stored in the **CIM repository**, a database on disk at `C:\Windows\System32\wbem\Repository`. Its main files are `objects.data` (the object store), `index.btr` (a b-tree index), and mapping/transaction files. It is important to understand what does and does not live here: the repository holds the static schema — the *definitions* of classes and the registration of which provider backs each one — but the *dynamic* data (the actual list of processes, current service states) is fetched live from providers on demand, not stored in the repository.

The crucial exception is **permanent event subscriptions**, which *are* persisted in the repository. That single fact is what turns the repository from a boring schema cache into a place defenders must inspect, because an attacker can plant something there that survives reboots without any file on disk in the usual sense.

## WMI Eventing

WMI can do more than answer queries — it can **react to events**. The eventing model has two flavors. **Temporary** subscriptions live only as long as the subscribing process runs (for example, a script that waits for a USB device to be inserted). **Permanent** subscriptions are registered into the repository and are serviced by the WMI service itself, so they persist across reboots and run independently of any user process. A permanent subscription is built from three objects, all in the `root\subscription` namespace:

-   **`__EventFilter`**— the trigger, defined as a WQL event query. It says *when* to fire: at a certain time, when a process starts, when a service changes state, when the machine has been up for N seconds, and so on.
-   **`__EventConsumer`**— the action, defined by one of the built-in consumer classes. `CommandLineEventConsumer` runs a command line; `ActiveScriptEventConsumer` runs an embedded VBScript or JScript; others log to the event log or send email.
-   **`__FilterToConsumerBinding`**— the glue that ties a specific filter to a specific consumer, activating the subscription.

WMI events themselves come in two kinds. **Intrinsic** events describe changes to the WMI objects that model the system — an instance being created, modified, or deleted (for example `__InstanceCreationEvent` where the target instance is a `Win32_Process`). **Extrinsic** events are raised directly by a provider to represent something that has no natural CIM-object mapping. Filters most commonly key off intrinsic events, which is how a subscription can say “fire whenever a new process named X appears.”

## Access and Transport

WMI is reachable both locally and remotely. Historically the remote transport is **DCOM** (RPC over the endpoint mapper), and more modern deployments use **WinRM** (the WS-Management protocol, the basis of PowerShell Remoting), which is firewall-friendlier. Locally, the consumer talks to `Winmgmt` through COM, which is itself layered on RPC and — for local calls — the **ALPC** transport discussed earlier in this series. Because `Winmgmt` and `WmiPrvSE.exe` run with high privilege (typically `LocalSystem`), an action invoked through WMI generally executes as `SYSTEM`, which is a large part of its appeal to both administrators and adversaries.

## Inspecting WMI

Everything above is directly observable from PowerShell. The modern CIM cmdlets (which use WinRM) are preferred over the legacy `Get-WmiObject` (DCOM), and the old `wmic` utility is deprecated but still seen in the wild:

```powershell
# Query instances (modern CIM cmdlets)
Get-CimInstance -ClassName Win32_Process | Select-Object ProcessId, Name
Get-CimInstance -Query "SELECT * FROM Win32_Service WHERE State = 'Running'"

# Legacy equivalents still common in scripts and tooling
Get-WmiObject Win32_OperatingSystem
wmic process list brief

# Enumerate the object model
Get-CimClass -Namespace root\cimv2 | Select-Object CimClassName
```

For defenders, the single most important query targets the permanent-subscription namespace, because that is where fileless persistence hides:

```python
# Hunt for permanent WMI event subscriptions (persistence)
Get-WmiObject -Namespace root\subscription -Class __EventFilter
Get-WmiObject -Namespace root\subscription -Class __EventConsumer
Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding

# A benign baseline machine usually has very few of these;
# an ActiveScriptEventConsumer or CommandLineEventConsumer here is worth investigating.
```

The `Get-CimInstance` cmdlet reads live instances by asking the provider; the `root\subscription` queries read persisted objects straight out of the repository. On a clean system the subscription classes are nearly empty, which makes anomalies stand out.

## Security Relevance

WMI earns its reputation as a dual-use technology. On the offensive side it supports three distinct capabilities that show up throughout intrusion tradecraft, all worth understanding defensively:

-   **Execution.** The `Win32_Process.Create` method launches a process, locally or remotely, as `SYSTEM` — a well-known lateral-movement and code-execution primitive that leaves a different footprint than a service or scheduled task.
-   **Reconnaissance.** WQL queries enumerate processes, services, users, patches, antivirus products, and hardware without dropping tools, blending into normal administrative activity.
-   **Fileless persistence.** The signature abuse: a permanent `__FilterToConsumerBinding` that pairs an `__EventFilter` trigger (for instance, “5 minutes after boot” or “when `explorer.exe` starts”) with a `CommandLineEventConsumer` or `ActiveScriptEventConsumer` payload. The trigger and payload live entirely in the CIM repository, so there is no obvious executable or autostart-registry entry, and the WMI service — not the attacker’s process — runs the payload on schedule.

Defenders counter this on several fronts: baselining and monitoring the `root\subscription` namespace for new filters, consumers, and bindings; consuming the **Microsoft-Windows-WMI-Activity** ETW provider (tying back to the ETW article earlier in this series) to record operations and provider activity; watching for `WmiPrvSE.exe` spawning script interpreters or shells; and alerting on remote `Win32_Process.Create` invocations. Understanding the filter/consumer/binding triad is what lets an analyst distinguish a legitimate management subscription from an implant. (Everything here is described for defensive understanding and authorized administration only.)

## Conclusion

WMI is a full management stack hiding behind a few PowerShell cmdlets: the `Winmgmt` service and its CIMOM broker, providers hosted in `WmiPrvSE.exe`, a namespaced object model queried with WQL, an on-disk CIM repository, and an eventing engine whose permanent subscriptions can run `SYSTEM` code on a trigger. That last capability is exactly why WMI sits on both the administrator’s and the adversary’s toolbench, and why the `root\subscription` namespace deserves a permanent place on any hunting checklist. In the next article we turn to the component that guards the system’s most sensitive secrets: the Local Security Authority and Windows authentication internals.

## You Might Also Like

This article is part of the Windows Internals series. These related deep-dives cover adjacent parts of the system:

-   [Event Tracing for Windows (ETW) Internals](https://blog.yunolay.com/event-tracing-for-windows-etw-internals/)
-   [ALPC: Advanced Local Procedure Call Internals](https://blog.yunolay.com/alpc-advanced-local-procedure-call-internals/)
-   [Windows Services and the Service Control Manager](https://blog.yunolay.com/windows-services-and-the-service-control-manager/)
-   [Windows Registry Internals: Hives, Cells, and the Configuration Manager](https://blog.yunolay.com/windows-registry-internals-hives-cells-configuration-manager/)

投稿 [WMI Internals: Providers, the CIM Repository, and Eventing](https://blog.yunolay.com/wmi-internals-providers-cim-repository-eventing/) は [Yunolay's Blog](https://blog.yunolay.com/) に最初に表示されました。
