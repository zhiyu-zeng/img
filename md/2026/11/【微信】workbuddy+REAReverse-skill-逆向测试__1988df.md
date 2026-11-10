---
title: 【微信】workbuddy+REA/Reverse-skill 逆向测试
source: https://mp.weixin.qq.com/s/9hKEwoLvGpZ8_aI0X8dg1A
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:47:47+08:00
trace_id: 6eda960b-da32-44e3-b18d-04b586bbda25
content_hash: c9bcb5b1d7bd95f03ba13c4ab2438ede5e5e0e4d09ddcf167e02b4b8caec3dc5
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
notion_page_id: 41475244-d011-81c7-88ec-ceb1c5d266d2
ioc: null
---

**MicroPest** *2026年11月10日 07:03*

用了两种：workbuddy+REA或workbuddy+Reverse skill；

测试对象就是上篇的“PhonePerf”手机性能监测apk。

一、workbuddy+Reverse skill

已经搞懂了!这个 `PhonePerf-release1.5.apk` (实际是 **1.6** 版)是一个 **纯 Kotlin 写的 Android 手机性能监视器**。我按逆向工程的方法论完整还原了它的实现,报告已生成。

## 🧩 一句话结论

**MVVM 架构的本地性能监控应用**:每 **2 秒** 读一次 Linux 内核的 `/proc` 、 `/sys` 节点,采集 CPU/内存/电池/温度/存储等指标,用 **自绘仪表盘 + 折线图** 展示。无网络、无原生代码、无后台服务。

## 📦 技术栈

-   **语言**
    
    : 纯 Kotlin(无 `.so` 原生库)
    
-   **框架**
    
    : AndroidX(AppCompat、Lifecycle、ViewModel、RecyclerView、SwipeRefreshLayout)+ Material Components + ViewBinding
    
-   **架构**
    
    : MVVM —— `MainActivity` (UI)→ `ViewModel` (p030t0.p)→ 数据域 `p027r0.m`
    
-   **混淆**
    
    : R8 已混淆,类名被压缩成 `p027r0.m` 、 `p030t0.p` 等短名
    
-   **兼容**
    
    : minSdk 24 / targetSdk 34
    

## 🔍 它到底怎么"监视"

读取的都是标准内核节点(无需 root):

-   **CPU 使用率**
    
    ← `/proc/loadavg`
    
-   **CPU 频率**
    
    ← `/sys/devices/system/cpu/cpuN/cpufreq/cpuinfo_cur_freq`
    
-   **芯片型号**
    
    ← `/proc/cpuinfo`,并映射成中文品牌(高通骁龙/联发科天玑/华为麒麟/Google Tensor/紫光展锐/瑞芯微…)
    
-   **内存**
    
    ← `/proc/meminfo`;**电池** ← `/sys/class/power_supply/*`;**温度** ← `/sys/class/thermal`
    

## 🎨 界面怎么画

-   **GaugeView**
    
    : 270° 弧形仪表,值 0~1 按阈值变色(≥0.75 黄、≥0.9 红),带 450ms 平滑动画
    
-   **LineChartView**
    
    : 二次贝塞尔平滑曲线 + 渐变填充,双系列(CPU% + 温度℃)
    
-   **RecyclerView**
    
    : 4 种布局(顶部总览卡 / 分组卡 / 分区标题 / 页脚),每个指标行带彩色进度条,按 NORMAL/WARN/DANGER 三级着色
    

## ⚙️ 刷新机制

`onStart` 启动协程每 **2000ms** 采样一次 → 构建 `Snapshot` → 发布到 LiveData;`onStop` / `onCleared` 立即取消,后台不耗电。

## 📂 产出文件

-   **完整报告**
    
    : `REPORT.md`
    
-   **反编译源码**
    
    : 同目录 `jadx-out\sources\` (1394 个文件,已定位核心类)
    

## ⚠️ 两点提示

1.  **版本疑点**
    
    : 文件名写 `release1.5`,但清单实际是 `versionName=1.6` ——APK 是 1.6 版,只是文件名没同步。
    
2.  **静态分析的边界**
    
    : CPU 使用率的具体 **计算公式**、电池细分字段等尚未 100% 确认(报告「剩余未知」有列出)。如果需要,我可以继续深挖某个具体指标,或用模拟器安装运行验证「每 2 秒刷新」的实际行为。
    

二、逆向完了功能，现在我们让它仿造着搓一个

提示词：我也想做个类似的，用python帮我先简单实现一个mvp版本的

MVP 做好了,已经跑通并截图验证!🎉

## 📁 项目位置

`C:\Users\Administrator\WorkBuddy AI\2...`

-   `phone_perf_mvp.py`
    
    — 主程序(单文件,约 460 行)
    
-   `README.md`
    
    — 使用说明
    
-   `requirements.txt`
    
    — 依赖(仅 psutil)
    
-   `screenshot.png`
    
    — 运行效果截图
    

## 🖥️ 它做了什么(对照原版 APK)

我用 tkinter + psutil 复刻了逆向出的核心架构:

| 原版(Android) | Python MVP |
| --- | --- |
| 读 `/proc/loadavg` 、 `cpuinfo_cur_freq` | `psutil.cpu_percent()`<br><br>、 `psutil.cpu_freq()` |
| ViewModel + LiveData,2000ms 刷新 | `tk.after(2000)`<br><br>定时刷新 |
| `GaugeView`<br><br>270° 弧形仪表 | 自定义 `Gauge` (270° 弧,缺口朝下) |
| `LineChartView`<br><br>平滑曲线+渐变 | 自定义 `LineChart` (`smooth=True` B 样条+填充) |
| NORMAL/WARN/DANGER 阈值配色 | 同一套: ≥75% 黄、≥90% 红 |
| 电池反向着色 | `invert=True`<br><br>(满电=蓝=好) |

## ✨ 运行效果(见截图)

-   **顶部**
    
    : 设备信息(Windows 10 · AMD64 · 20 核 · 2300 MHz)
    
-   **三个仪表**
    
    : CPU / 内存 RAM / 电池
    
-   **历史曲线**
    
    : CPU% + 内存% 滚动折线图(保留 60 点)
    
-   **每核 CPU 使用率**
    
    : 20 根进度条
    
-   **其他指标**
    
    : CPU 频率、磁盘、电池、网络↑↓、运行时间
    

## 🚀 运行方式

bash

```
cd phoneperf-mvp
python phone_perf_mvp.py          # 图形界面
python phone_perf_mvp.py --cli# 命令行,每 2s 打印一行
python phone_perf_mvp.py --once# 打印一次(测试采集)
```

## ⚠️ 两点说明

1.  **Python 环境**
    
    : 本机要用 `D:\python-3.11.9\python.exe` (自带 tkinter + psutil;WorkBuddy 自带的 3.13 缺 tkinter)。已用 `--once` 和 GUI 截图双重验证通过。
    
2.  **MVP 简化**
    
    : Windows 上 psutil 不支持温度传感器,所以第三个仪表自适应为电池(有温度的平台会自动显示温度);折线图填充用 `stipple` 模拟半透明。
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a78864a1e243e1a.png)

虽然还要修正，但基本模样出来了。

三、workbuddy+REA

用 REA 跑完了,这次是 **真正走通了 REA 技能** 的完整工作流。

## ✅ 这次做了什么

**先补装 + 搭好 REA 环境,再按它的主链路跑:**

1.  **安装 REA 技能**
    
    (Reverse Engineering Assistant v6.5.0,从 SkillHub)
    
2.  **前置检查**
    
    : 授权确认(你自有文件,只读离线)✓;发现 APK 分析需要 `jadx-headless-mcp 0.7.1` jar —— 从 GitHub 官方 release 下载了 `jadx-headless-mcp-0.7.1-all.jar` (42.6MB)并设置 `REA_JADX_MCP_JAR` ✓
    
3.  **REA0 路由**
    
    : 目标类型 = Android APK,入口 summary-first
    
4.  **REA1 侦察**
    
    : `inspect-android-package` → 解码完整清单(包名/版本/权限/主题/Activity)
    
5.  **REA2 取证**
    
    : `search-android-classes` (1394 类)、 `inspect-android-class` (MainActivity 成员)、 `inspect-android-method` (反编译 `onStart` 和 `GaugeView.onDraw` 拿伪代码)
    
6.  **REA4 交付**
    
    : 按「事实/推断/未知」三分写结论,每条 **附证据 ID**
    

## 📄 产出

`REA_report.md` (已展示)

## 🔑 REA 证据亮点

-   **`onStart()` 反编译**
    
    : `new o(2000L, pVarA, null)` —— **2000ms 周期刷新** 直接证据
    
-   **`GaugeView.onDraw` 反编译**
    
    : `drawArc(rectF, 135.0f, 270.0f)` 270° 弧 + >=0.9 红 / >=0.75 黄 阈值 —— UI 实现直接证据
    
-   **清单证据**
    
    : versionName 1.6 / versionCode 6 / 权限 / `Theme.PhonePerf` / 单 Activity / androidx.startup / ProfileInstallReceiver
    

## ⚠️ 诚实说明(REA 自己的纪律)

-   REA 的 jadx provider **明确标注限制**: 静态反编译 **不构成运行时行为**、APK 从未被执行 —— 我没有夸大结论
    
-   **未进入 REA2-04(运行时观察)**
    
    : 静态证据已足够,且运行时属于高风险(需你确认才执行),所以按纪律跳过
    
-   环境小坑: `rea doctor` 说 Node 22.22.2 未达它要求的 ≥22.23.4,但 CLI 实际可用
    

## 🔁 结论一致性

REA 这次跑出的结果与我之前用 jadx 手工分析 **完全一致**,而且多了 **证据 ID 可复核** 的背书 —— 相当于给之前的结论做了一次独立验证。

四、两种方法的总结

两个方法都实际用过了,下面给你一份完整的对比总结。

> 注: 你说的 "Reserve-skill" 我理解为我们第一轮装的 **Reverse Engineering** (逆向工程)技能。

## （一）、两者是什么

| 维度  | **Reverse Engineering 技能** | **REA(逆向工程助手)技能** |
| --- | --- | --- |
| 来源  | SkillHub · 作者 ivangdavila · v1.0.0 | SkillHub · 作者王教成(波动几何)· v1.0.0 |
| 本质  | **方法论 + 交付规范**<br><br>(纯文档) | **方法论 + 真实工具链**<br><br>(文档 + CLI 引擎) |
| 自带工具 | 无,自带 jadx/aapt 等工具 | 有,`rea` CLI 6.5.0 + jadx-headless-mcp 0.7.1 |
| 触发词 | 逆向/反编译/未文档化 API/遗留系统 | 逆向/反编译/拆包/复现功能/版本差异 |

## （二）、工作流对比

**Reverse Engineering —— TRACE 协议(5 步)**

1.  **Triage**
    
    界定最小问题(目标/答案/边界/最快路径)
    
2.  **Record**
    
    先记录可观察行为(静态表面→行为→内部)
    
3.  **Abstract**
    
    把观察变成可检验假设
    
4.  **Challenge**
    
    用最小探针挑战假设
    
5.  **Explain**
    
    压缩成可用产出(已知/如何知道/未知/下一步)
    

配套: **证据分层(evidence-ladder)**、 **安全边界(boundaries)**、 **5 份交付模板(target brief / interface map / hypothesis ledger / reproduction note / remaining unknowns)**、 **常见陷阱表** (别一上来就反编译、别把日志当真理等)。

**REA —— 六域主链路(18 个任务)**

plaintext

```
REA0 路由 → REA1 侦察 → REA2 取证 →(REA3 重建·按需)→ REA4 交付
                              ↖ REA5 环境恢复(支持域,随时介入)
```

-   REA0: 授权确认 → 目标类型判定 → 方案规划
    
-   REA1: 复用已有状态 → 打开核验 → **summary-first 总览**
    
-   REA2: 静态分析 → 字符串→引用→调用链→伪代码追踪 → **证据登记+未决项**
    
-   REA3: 功能重建 + 对拍验证(按需)
    
-   REA4: 结论三分(事实/推断/未知)→ 证据导出 → 回访归档
    
-   REA5: 环境核验 / 故障处置 / 更新卸载
    

## 三、核心差异(这是关键)

| 差异点 | Reverse Engineering | REA |
| --- | --- | --- |
| **证据纪律** | 有证据分层,靠人工标注 | **每条结论自动带 `evidence_id`**<br><br>,provider 自带 limitations 声明 |
| **结论格式** | 模板化(假设台账) | 强制「事实/推断/未知」三分 |
| **分析执行** | 手动(自己跑 jadx/aapt) | **命令化**<br><br>(`rea inspect-android-method` 等) |
| **可复核性** | 中(靠文档引用) | **高**<br><br>(证据 ID 可回查) |
| **限制声明** | 提醒勿混淆观察/推断 | **引擎强制声明**<br><br>"静态≠运行时、APK 未执行" |
| **目标覆盖** | 通用(二进制/API/协议/工作流) | 更细(APK/Electron/.NET/固件/网站…) |
| **运行时/高风险** | 边界里要求授权 | **REA2-04 独立成任务**<br><br>,须先确认 |

## 四、这次会话的实际体验

-   **Reverse Engineering**
    
    : 因技能会话中途安装未注册,我 **直接读它的 SKILL.md/protocol.md/boundaries.md/deliverables.md 手动执行**;用 jadx CLI + aapt 反编译,逐步还原出全部实现。
    
-   **REA**
    
    : 走通了完整链路。中途发现需要 `jadx-headless-mcp` jar(REA 不代下载),从 GitHub 官方 release 下载后设置 `REA_JADX_MCP_JAR` 才跑通。产出 **带证据 ID** 的 `REA_report.md` 。
    
-   **结果一致性**
    
    : 两轮结论 **完全一致** (2000ms 刷新、270° 仪表、阈值配色、指标采集),REA 额外给了可复核证据背书。
    

## 五、怎么选(结论)

| 场景  | 建议  |
| --- | --- |
| 快速搞懂一个东西、手边有工具 | **Reverse Engineering**<br><br>够用,轻量、灵活 |
| 要 **正式、可复核、可对外** 的逆向结论 | **REA**<br><br>,证据 ID + 三分结论 + 限制声明更规范 |
| 要重建/复现功能 | 两者都可,REA 有 REA3 对拍验证更严 |
| 环境受限、无 Node/引擎 | Reverse Engineering(纯文档,零依赖) |
| 需要 CLI 自动化解析大量目标 | **REA**<br><br>(155+ 子命令,可脚本化) |

**一句话**: Reverse Engineering 是「方法论手册」——教你怎么想、怎么取证、怎么交付;REA 是「方法论 + 工具链」——不仅教你怎么想,还 **强制用工具把每一步变成带证据 ID 的可复核产物**。分析复杂/正式场景 REA 更稳,快速探索 Reverse Engineering 更快。
