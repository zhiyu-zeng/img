---
title: 【看雪】论如何在2026年使用uiautomatorviewer.bat
source: https://bbs.kanxue.com/thread-291771.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-23T22:19:49+08:00
trace_id: 88fe9531-0144-4ed7-a5f7-95e4a2bdaf2f
content_hash: 20f09dc7a96ae6d0cb1430fe31ddeae011f19beee2666446a8cbaf3c4b8d85fb
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: uiautomatorviewer.bat因Android系统升级已失效，需通过adb手动导出UI数据或改用文本编辑器分析以适配现代设备。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 38875244-d011-8186-ab58-f00a6db5cc09
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - cdn.jsdelivr.net
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> uiautomatorviewer.bat因Android系统升级已失效，需通过adb手动导出UI数据或改用文本编辑器分析以适配现代设备。
> 
> - **工具功能：** uiautomatorviewer.bat是Android SDK的官方图形化工具，用于查看设备或模拟器的UI布局结构和控件属性（如resource-id、text），辅助自动化测试。
> - **兼容性问题：** 该工具对Android 8.0及以上版本支持不佳，Google已逐步废弃；在Android 10+上直接截图成功率低，Android 14/15后完全无法传统抓取UI层级。
> - **手动导出方法：** 使用adb命令导出uix布局文件和png截图（如`adb shell uiautomator dump`和`adb shell screencap`），再通过工具的Open Files功能导入。
> - **界面适配问题：** 工具老旧不适配Windows高缩放比例（如125%/150%），导致Browse按钮隐藏；可连续按Tab键后按空格键弹出文件选择窗口。
> - **替代方案：** 直接用文本编辑器（如记事本）打开uix文件，按Ctrl+F搜索关键词，快速获取UI信息，无需依赖图形界面。

最近用到了 `uiautomatorviewer.bat` 这个工具，但是出现了很多报错，这里仅作一些记录，供读者参考，本人小白一枚，如有错误，还请指正。

`uiautomatorviewer.bat` 是 Android SDK 官方提供的一个 UI 分析工具脚本，主要用于辅助 Android 自动化测试和 UI 分析。可以通过它直观地查看 Android 设备或模拟器当前屏幕的 UI 布局结构，以及各个控件的详细属性（如 resource-id、text、class、bounds 坐标等），这些信息是编写 UI 自动化脚本时定位控件的关键依据。

该工具随 Android 4.1（API 16）一同发布，与 `uiautomator` 测试框架配套使用。 `uiautomator` 是 Google 提供的 UI 自动化测试 Java 库，而 `uiautomatorviewer` 则是其配套的图形化界面分析工具。两者共同构成了 Android 原生 UI 自动化测试的基础工具链。

从文件类型来看， `uiautomatorviewer.bat` 是一个 Windows 批处理脚本，位于 Android SDK 的 `tools/bin/` 目录下（旧版本位于 `tools/` 目录）。双击该脚本即可启动 `uiautomatorviewer` 图形界面程序。

uiautomatorviewer.bat的工具栏主要包含四个按钮（从左向右数）：

**Open Files：** 打开已保存的.uix 布局文件和截图。

**Device Screenshot：** 连接设备并获取当前屏幕的界面布局（最常用）。

**Compressed Hierarchy：** 获取简化版的界面布局，会过滤掉一些纯装饰性的布局节点。

**Save：** 保存当前捕获的界面信息，会生成一个截图文件和一个.uix (XML布局结构)文件。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/0c067bfbe915c2e0.webp)

随着 Android 系统版本的不断升级， `uiautomatorviewer` 的兼容性问题日益突出。该工具对 Android 8.0 及以上版本的系统直接截屏支持不佳。在 Android 10+ 设备上，直接截图成功率已大幅下降。随着 Android 14/15 的持续安全增强，Google 已逐步废弃 `UiAutomatorViewer` ，已经无法再通过传统方式抓取 UI 层级。

如下图就是最典型的错误——正在使用的 uiautomatorviewer 版本太旧，无法兼容手机/模拟器的高版本 Android 系统。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b6cd22ab164d5238.webp)

解决方法是使用下面的命令导出手机/模拟器当前屏幕的uix文件和png截图。为什么导出是uix文件不是xml文件，这是因为 uiautomatorviewer.bat 这个老古董工具默认只认.uix 后缀的文件。

```cpp
adb shell uiautomator dump /data/local/tmp/ui.uix
adb pull /data/local/tmp/ui.uix 导出路径
 
C:\Users\114514\Desktop>adb shell screencap /data/local/tmp/sc.png
C:\Users\114514\Desktop>adb pull /data/local/tmp/sc.png
```

点击工具栏的第一个按钮Open Files，导入刚刚导出的uix文件和png截图。问题又来了，如下图，原本在“UI XML Dump”这一行右边应该有一个 “Browse...” 按钮（用来选择文件），但因为这个工具太老旧，没有适配 Windows 缩放比例（比如 125%/150% 显示），导致按钮被直接挤出了窗口边缘。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f098bb8400bfce4f.webp)

解决方法是在弹窗界面，连续按三次键盘上的 Tab 键（切换焦点），直接按键盘上的 空格键（Space） 或 回车键（Enter），UI XML Dump的文件选择窗口就会弹出来。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/2d82661935f196aa.webp)

这里还有个点要注意，模拟器不要选择平板模式而是手机模式，原因在于平板模式导出的uix文件处于 “横屏”或“倒置”旋转状态（rotation=3），而 `uiautomatorviewer.bat` 这个老古董工具在解析非竖屏（rotation=0）的布局时，内部渲染引擎会直接“罢工”，导致它无法解析出任何子控件。在导出的uix文件中可以查看。

```xml
<hierarchyrotation="3">
```

如下图是成功导入uix和png文件，软件正常运行的截图。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dd9dc858244cc2a5.webp)

但其实使用这个破图形化软件太费劲了，根本不需要依赖破图形界面，用记事本或 Notepad++ 直接打开导出uix文件，按 Ctrl + F 搜索想要的文件中的关键词，所有信息秒拿。

仅是学习过程中遇到的一些感觉有趣的事情，分享给大家，大家图一乐就行。
