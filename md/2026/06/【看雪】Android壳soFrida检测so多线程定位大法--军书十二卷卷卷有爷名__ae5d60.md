---
title: 【看雪】Android壳so/Frida检测so多线程定位大法--军书十二卷卷卷有爷名
source: https://bbs.kanxue.com/thread-291655.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-17T10:50:29+08:00
trace_id: 467778fa-5766-4f4d-9e94-780b2775beae
content_hash: dfb41d88d8a4c9def04e353fd2798fd77e49edbcf841d39d73ad4ac245ef65fd
status: summarized
tags:
  - 看雪
series: null
ai_summary: 通过分析Android应用进程的线程及其Creator_SO，可以有效定位加固壳so，尤其适用于应对多线程守护机制。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38275244-d011-813f-8016-ddb56afcdb1f
---

> 💡 **AI 总结（key-points）**
>
> 通过分析Android应用进程的线程及其Creator_SO，可以有效定位加固壳so，尤其适用于应对多线程守护机制。
> 
> - **工具与方法：** 使用Python脚本（如`misc/print_threads.py`）自动解析包名，列出运行中的所有进程及线程，并拉取用户态堆栈进行逆向定位。
> - **核心指标：** 线程的Creator_SO字段标识创建线程的SO库，用于区分壳so（如libDexHelper.so、libcrashsdk.so）与系统或业务SO。
> - **案例分析：** 在com.yyyyy应用中，多个进程（如PID 22824、22860等）出现大量由libDexHelper.so和libcrashsdk.so创建的线程，指示壳活动。
> - **多线程守护识别：** 该方法特别有效，因为壳so通过多线程自我保护，线程列表中反复出现相同Creator_SO，形成“军书十二卷卷卷有爷名”的态势。
> - **输出分类：** 脚本输出将线程分为安全审计/外壳线程、安卓核心线程、业务工作线程等类别，壳线程被标记为WARN，便于快速识别。

```
<br>
```

定位加固壳so的方法有很多，介绍其中一种，对于多线程守护尤其有效

直接列出 app 所有进程及其所有线程，列出谁起的线程 **Creator\_SO**

你说不是你，每个进程里都有你的名字，军书十二卷卷卷有爷名，这种情况花木兰都要替父从军

你说不是你，一直活着浪费内存和CUP干啥，干啥啥不行，吃饭第一名？

你说不是你，kill 了线程你又不乐意，frida 又没法干活(我没试，没找到简单的办法 kill 线程)

看这个case，多线程守护是否更具象化了

**➜** **scanApk** **git:(****develop****)** python3 misc/print\_threads.py com.yyyyy

\>>> 自动将包名解析为运行中的 6 个进程 PIDs: 22824, 22841, 22860, 22861, 22889, 22892

\>>> \[PID: 22824\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.yyyyy** (**PID: 22824**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 22824 (om.yyyyy) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libutils.so\]

├── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (13 threads)

│ ├── **WARN** TID: 22826 (perfetto\_hprof\_) \[State: Sleeping, **Creator\_SO**: **libperfetto\_hprof.so**, **Active\_SO**: **libperfetto\_hprof.so**\]

│ ├── **WARN** TID: 22840 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22842 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22843 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22854 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libcrashsdk.so**, **Active\_SO**: **libcrashsdk.so**\]

│ ├── **WARN** TID: 22855 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libcrashsdk.so**, **Active\_SO**: **libcrashsdk.so**\]

│ ├── **WARN** TID: 22922 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libAPSE\_8.0.0.so**, **Active\_SO**: **libAPSE\_8.0.0.so**\]

│ ├── **WARN** TID: 22923 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libAPSE\_8.0.0.so**, **Active\_SO**: **libAPSE\_8.0.0.so**\]

│ ├── **WARN** TID: 22996 (TracingMuxer) \[State: Sleeping, **Creator\_SO**: **libperfetto\_c.so**, **Active\_SO**: **libperfetto\_c.so**\]

│ ├── **WARN** TID: 22999 (AgentImplHandle) \[State: Sleeping, **Creator\_SO**: libart.so, **Active\_SO**: libutils.so\]

│ ├── **WARN** TID: 23046 (hwuiTask0) \[State: Sleeping, **Creator\_SO**: **libhwui.so**, **Active\_SO**: **libhwui.so**\]

│ ├── **WARN** TID: 23047 (hwuiTask1) \[State: Sleeping, **Creator\_SO**: **libhwui.so**, **Active\_SO**: **libhwui.so**\]

│ └── **WARN** TID: 23084 (binder:22824\_4) \[State: Sleeping, **Creator\_SO**: **libgui.so**, **Active\_SO**: **libgui.so**\]

├── ⚙️ JVM, Android Runtime & IPC Daemon (安卓核心线程) (11 threads)

│ └── \[Merged System Threads\] (11 threads: 6\*libutils.so, 5\*libart.so)

├── App Business & General Workpool (业务工作线程) (104 threads)

│ └── \[Merged System Threads\] (104 threads: 82\*libart.so, 22\*Unknown)

└── Network, Event Loop & Async I/O (网络与事件循环) (15 threads)

└── \[Merged System Threads\] (15 threads: 14\*libart.so, 1\*Unknown)

\>>> \[PID: 22841\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.yyyyy** (**PID: 22841**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 22841 (om.yyyyy) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libDexHelper.so\]

└── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (1 threads)

└── **WARN** TID: 22844 (om.yyyyy) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

\>>> \[PID: 22860\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.yyyyy:push** (**PID: 22860**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 22860 (bileTicket:push) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libutils.so\]

├── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (6 threads)

│ ├── **WARN** TID: 22864 (perfetto\_hprof\_) \[State: Sleeping, **Creator\_SO**: **libperfetto\_hprof.so**, **Active\_SO**: **libperfetto\_hprof.so**\]

│ ├── **WARN** TID: 22888 (bileTicket:push) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22893 (bileTicket:push) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22894 (bileTicket:push) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22909 (bileTicket:push) \[State: Sleeping, **Creator\_SO**: **libcrashsdk.so**, **Active\_SO**: **libcrashsdk.so**\]

│ └── **WARN** TID: 22910 (bileTicket:push) \[State: Sleeping, **Creator\_SO**: **libcrashsdk.so**, **Active\_SO**: **libcrashsdk.so**\]

├── ⚙️ JVM, Android Runtime & IPC Daemon (安卓核心线程) (9 threads)

│ └── \[Merged System Threads\] (9 threads: 5\*libart.so, 4\*libutils.so)

└── App Business & General Workpool (业务工作线程) (14 threads)

└── \[Merged System Threads\] (14 threads: 14\*libart.so)

\>>> \[PID: 22861\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.v:tools** (**PID: 22861**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 22861 (ileTicket:tools) \[State: Sleeping, Creator\_SO: **libcrashsdk.so**, Active\_SO: **libcrashsdk.so**\]

├── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (5 threads)

│ ├── **WARN** TID: 22871 (perfetto\_hprof\_) \[State: Sleeping, **Creator\_SO**: **libperfetto\_hprof.so**, **Active\_SO**: **libperfetto\_hprof.so**\]

│ ├── **WARN** TID: 22887 (ileTicket:tools) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22890 (ileTicket:tools) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ ├── **WARN** TID: 22891 (ileTicket:tools) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

│ └── **WARN** TID: 22916 (ileTicket:tools) \[State: Sleeping, **Creator\_SO**: **libcrashsdk.so**, **Active\_SO**: **libcrashsdk.so**\]

├── ⚙️ JVM, Android Runtime & IPC Daemon (安卓核心线程) (9 threads)

│ └── \[Merged System Threads\] (9 threads: 5\*libart.so, 4\*libutils.so)

└── App Business & General Workpool (业务工作线程) (10 threads)

└── \[Merged System Threads\] (10 threads: 10\*libart.so)

\>>> \[PID: 22889\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.yyyyy:tools** (**PID: 22889**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 22889 (ileTicket:tools) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libDexHelper.so\]

└── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (1 threads)

└── **WARN** TID: 22896 (ileTicket:tools) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

\>>> \[PID: 22892\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.yyyyy:push** (**PID: 22892**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 22892 (bileTicket:push) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libDexHelper.so\]

└── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (1 threads)

└── **WARN** TID: 22895 (bileTicket:push) \[State: Sleeping, **Creator\_SO**: **libDexHelper.so**, **Active\_SO**: **libDexHelper.so**\]

看这个case，虽然没有辣么明显，但是也挺清晰的了

**➜** **scanApk** **git:(****develop****)** python3 misc/print\_threads.py com.xxxxx

\>>> 自动将包名解析为运行中的 3 个进程 PIDs: 18762, 19212, 19797

\>>> \[PID: 18762\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.xxxxx:PinProcess** (**PID: 18762**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 18762 (tuan:PinProcess) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libutils.so\]

├── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (2 threads)

│ ├── **WARN** TID: 18770 (perfetto\_hprof\_) \[State: Sleeping, **Creator\_SO**: **libperfetto\_hprof.so**, **Active\_SO**: **libperfetto\_hprof.so**\]

│ └── **WARN** TID: 18835 (unwind\_thread) \[State: Sleeping, **Creator\_SO**: **libsnare\_2.0.0.so**, **Active\_SO**: **libsnare\_2.0.0.so**\]

├── ⚙️ JVM, Android Runtime & IPC Daemon (安卓核心线程) (10 threads)

│ └── \[Merged System Threads\] (10 threads: 6\*libart.so, 4\*libutils.so)

├── App Business & General Workpool (业务工作线程) (128 threads)

│ └── \[Merged System Threads\] (128 threads: 128\*libart.so)

└── Network, Event Loop & Async I/O (网络与事件循环) (5 threads)

└── \[Merged System Threads\] (5 threads: 5\*libart.so)

\>>> \[PID: 19212\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.xxxxx** (**PID: 19212**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 19212 (sankuai.meituan) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libutils.so\]

├── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (23 threads)

│ ├── **WARN** TID: 19215 (perfetto\_hprof\_) \[State: Sleeping, **Creator\_SO**: **libperfetto\_hprof.so**, **Active\_SO**: **libperfetto\_hprof.so**\]

│ ├── **WARN** TID: 19237 (unwind\_thread) \[State: Sleeping, **Creator\_SO**: **libsnare\_2.0.0.so**, **Active\_SO**: **libsnare\_2.0.0.so**\]

│ ├── **WARN** TID: 19352 (TracingMuxer) \[State: Sleeping, **Creator\_SO**: **libperfetto\_c.so**, **Active\_SO**: **libperfetto\_c.so**\]

│ ├── **WARN** TID: 19380 (hwuiTask0) \[State: Sleeping, **Creator\_SO**: **libhwui.so**, **Active\_SO**: **libhwui.so**\]

│ ├── **WARN** TID: 19381 (hwuiTask1) \[State: Sleeping, **Creator\_SO**: **libhwui.so**, **Active\_SO**: **libhwui.so**\]

│ ├── **WARN** TID: 19398 (binder:19212\_4) \[State: Sleeping, **Creator\_SO**: **libgui.so**, **Active\_SO**: **libgui.so**\]

│ ├── **WARN** TID: 19437 (NetThreadPool) \[State: Sleeping, **Creator\_SO**: **libmquic.so**, **Active\_SO**: **libmquic.so**\]

│ ├── **WARN** TID: 19438 (NetThreadPool) \[State: Sleeping, **Creator\_SO**: **libmquic.so**, **Active\_SO**: **libmquic.so**\]

│ ├── **WARN** TID: 19440 (NetThreadPool) \[State: Sleeping, **Creator\_SO**: **libmquic.so**, **Active\_SO**: **libmquic.so**\]

│ ├── **WARN** TID: 19441 (NetThreadPool) \[State: Sleeping, **Creator\_SO**: **libmquic.so**, **Active\_SO**: **libmquic.so**\]

│ ├── **WARN** TID: 19442 (NetThreadPool) \[State: Sleeping, **Creator\_SO**: **libmquic.so**, **Active\_SO**: **libmquic.so**\]

│ ├── **WARN** TID: 19443 (NetThreadPool) \[State: Sleeping, **Creator\_SO**: **libmquic.so**, **Active\_SO**: **libmquic.so**\]

│ ├── **WARN** TID: 19465 (M:19212:19465) \[State: Sleeping, **Creator\_SO**: **libmtguard.so**, **Active\_SO**: **libmtguard.so**\]

│ ├── **WARN** TID: 19489 (V8 DefaultWorke) \[State: Sleeping, **Creator\_SO**: **libv8.mt.so**, **Active\_SO**: **libv8.mt.so**\]

│ ├── **WARN** TID: 19490 (V8 DefaultWorke) \[State: Sleeping, **Creator\_SO**: **libv8.mt.so**, **Active\_SO**: **libv8.mt.so**\]

│ ├── **WARN** TID: 19491 (V8 DefaultWorke) \[State: Sleeping, **Creator\_SO**: **libv8.mt.so**, **Active\_SO**: **libv8.mt.so**\]

│ ├── **WARN** TID: 19549 (Alarm) \[State: Sleeping, **Creator\_SO**: **libmtmap-combine.so**, **Active\_SO**: **libutils.so**\]

│ ├── **WARN** TID: 19716 (ThreadPoolServi) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

│ ├── **WARN** TID: 19717 (ThreadPoolForeg) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

│ ├── **WARN** TID: 19731 (ChromiumNet) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

│ ├── **WARN** TID: 19732 (Network File Th) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

│ ├── **WARN** TID: 19733 (ThreadPoolForeg) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

│ └── **WARN** TID: 19734 (ThreadPoolForeg) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

├── ⚙️ JVM, Android Runtime & IPC Daemon (安卓核心线程) (13 threads)

│ └── \[Merged System Threads\] (13 threads: 7\*libutils.so, 6\*libart.so)

├── App Business & General Workpool (业务工作线程) (134 threads)

│ └── \[Merged System Threads\] (134 threads: 131\*libart.so, 2\*Unknown, 1\*libutils.so)

└── Network, Event Loop & Async I/O (网络与事件循环) (16 threads)

└── \[Merged System Threads\] (16 threads: 16\*libart.so)

\>>> \[PID: 19797\] 正在拉取用户态堆栈，进行逆向源头 SO 定位...

**\================================================================================**

**Process:** **com.xxxxx:dppushservice** (**PID: 19797**)

**\================================================================================**

├──???? **\[Main Thread\]** TID: 19797 (n:dppushservice) \[State: Sleeping, Creator\_SO: libandroid\_runtime.so, Active\_SO: libutils.so\]

├── **???? Security, Custom SO & Protective Agent (安全审计/第三方/外壳线程)????** (6 threads)

│ ├── **WARN** TID: 19799 (perfetto\_hprof\_) \[State: Sleeping, **Creator\_SO**: **libperfetto\_hprof.so**, **Active\_SO**: **libperfetto\_hprof.so**\]

│ ├── **WARN** TID: 19840 (unwind\_thread) \[State: Sleeping, **Creator\_SO**: **libsnare\_2.0.0.so**, **Active\_SO**: **libsnare\_2.0.0.so**\]

│ ├── **WARN** TID: 19862 (abtestv2\_callba) \[State: Sleeping, **Creator\_SO**: libart.so, **Active\_SO**: libart.so\]

│ ├── **WARN** TID: 20123 (NetABTestCallba) \[State: Sleeping, **Creator\_SO**: libart.so, **Active\_SO**: libart.so\]

│ ├── **WARN** TID: 20242 (ThreadPoolServi) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

│ └── **WARN** TID: 20243 (ThreadPoolForeg) \[State: Sleeping, **Creator\_SO**: **libcronet.90.0.4402.0.so**, **Active\_SO**: **libcronet.90.0.4402.0.so**\]

├── ⚙️ JVM, Android Runtime & IPC Daemon (安卓核心线程) (9 threads)

│ └── \[Merged System Threads\] (9 threads: 6\*libart.so, 3\*libutils.so)

├── App Business & General Workpool (业务工作线程) (119 threads)

│ └── \[Merged System Threads\] (119 threads: 119\*libart.so)

└── Network, Event Loop & Async I/O (网络与事件循环) (7 threads)

└── \[Merged System Threads\] (7 threads: 7\*libart.so)

[#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm)
