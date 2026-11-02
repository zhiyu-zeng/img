---
title: 【看雪】IDA Pro 9.x 中文汉化插件 WiN MAC 支持中英文切换【汉化的还可以】
source: https://bbs.kanxue.com/thread-293395.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-02T12:44:27+08:00
trace_id: 46eccc1f-105e-490f-ba07-2cffdd179180
content_hash: 42c1b826f9a65959326e3951f01f31e7e3c397bb95956bcdf3ff041454b7524f
status: synced
tags:
  - 看雪
  - 安全工具
  - IDA汉化
series: null
feed_source: 看雪·逆向工程
ai_summary: 零二进制修改的 IDA Pro 9.x 纯插件化汉化方案，覆盖 2700+ 词条，支持 Ctrl+Alt+L 一键中英文切换，兼顾生产级稳定性与第三方插件兼容。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40c75244-d011-8180-bdb3-fb9719ad5d5f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 零二进制修改的 IDA Pro 9.x 纯插件化汉化方案，覆盖 2700+ 词条，支持 Ctrl+Alt+L 一键中英文切换，兼顾生产级稳定性与第三方插件兼容。
> 
> - **痛点：** 早期汉化依赖替换二进制、改 ida.hlp 或遍历 QMenu，导致 macOS 破坏代码签名无法启动、IDA 小版本更新即失效、依赖英文菜单路径的第三方插件挂载失败，且易触发 signum=11 崩溃。
> - **覆盖范围：** 外部词典驱动 2700+ 词条，含全部主菜单及多级子菜单、830+ Action 与 Tooltip、各视图右键菜单、工作区标签页，以及 Options 全部 9 大设置页；Ctrl+Alt+L 可毫秒级切换中英文并持久化状态。
> - **菜单锚点兼容：** 逆向 attach_action_to_menu 发现 IDA 查找二级子菜单时按去除 & 后的英文前缀匹配文本，因此从整个程序包提取 26 个路径锚点 Action 保留“English 中文”前缀，其余 800+ 菜单项用纯中文，实现 100% 插件挂载兼容。
> - **防崩溃设计：** 彻底摒弃 QTranslator（PySide6/Shiboken 跨线程争抢 GIL 致 SIGSEGV），改用 ida_kernwin.UI_Hooks 生命周期回调加 Shiboken.isValid() 存活校验；针对 macOS 原生 NSMenu 回调顺序（aboutToHide 先于 triggered）采用 100% 静态菜单架构，注册后仅调用一次 update_action_label。
> - **安装使用：** 仅 ida_zh_cn.py 与 ida_zh_cn_dict.json 两个文件、零第三方依赖，复制到用户 plugins 目录重启即生效；编辑 JSON 词典后连按两次 Ctrl+Alt+L 即可热重载自定义词条。

> 日常使用 IDA Pro 9.x（尤其是最新的 IDA Professional 9.5）进行高强度逆向分析时，原版仅有英文界面。市面上早期的汉化方案大多采用 **直接替换二进制文件**、 **修改 ida.hlp** 或 **粗暴遍历修改 QMenu** 的方式，在实际生产环境中往往伴随以下严重问题：
> 
> -   **破坏签名与版本绑定**：macOS 下修改.app 包内文件会直接破坏 Apple Code Signature 导致无法启动，且每次 IDA 小版本更新即失效；
> -   **第三方插件菜单消失**：许多汉化脚本把菜单标题改成纯中文后，导致依赖英文菜单路径（如 Edit/Plugins/、Edit/Patch program/）的内置及第三方插件挂载失败；
> -   **偶发崩溃（signum=11）与菜单点击失灵**：不当使用 Qt 翻译器或动态菜单钩子，会导致 IDA 在长时间反编译、切换视图或点击顶部菜单时崩溃或无响应。
> 
> 为此，我对 IDA Professional 9.5 主程序与 Qt 平台插件进行了完整逆向分析，设计并实现了这套 **零二进制修改、零崩溃、支持快捷键一键切换中英文** 的纯插件化汉化方案。
> 
> * * *
> 
> 本插件通过外部词典驱动，目前已覆盖 **2700+ 核心词条**：
> 
> -   **顶部主菜单栏与多级子菜单**
> 
> -   完整汉化 文件(File)、编辑(Edit)、跳转(Jump)、搜索(Search)、视图(View)、调试器(Debugger)、选项(Options)、窗口(Windows)、帮助(Help) 及其下属全部多级子菜单。
> 
> -   **830+ 注册动作（Action）与提示信息（Tooltip）**
> 
> -   覆盖反汇编操作、Hex-Rays 反编译器（伪代码重命名、类型修改、批量反编译、微代码视图）、调试控制、交叉引用、结构体/本地类型编辑、Lumina 与 Teams 协同等全部内置 Action。
> 
> -   **右键上下文弹出菜单（Popup Menu）**
> 
> -   反汇编视图、伪代码视图、十六进制视图、函数窗口、字符串窗口、结构体窗口的右键菜单实时汉化。
> 
> -   **工作区多标签页（TabBar）**
> 
> -   自动识别并汉化 IDA View-A -> 反汇编视图-A、Pseudocode-A -> 伪代码-A、Hex View-1 -> 十六进制视图-1、Functions -> 函数、Strings -> 字符串、Local Types -> 本地类型、Exports -> 导出表、Imports -> 导入表 等全部工作区标签。
> 
> -   **常规选项 (Options -> General...) 全量 9 大标签页及子对话框**
> 
> -   完整覆盖 反汇编、自动分析、交叉引用、字符串、浏览器、流程图、Teams、Lumina 符号服务、其他 全部 9 个设置页；
> -   覆盖 内核分析选项 1/2/3、编译器设置、C++ 符号反修饰格式、数据类型设置、快捷键设置 等常用配置弹窗。
> 
> -   **一键无损切换中英文（Ctrl+Alt+L）**
> 
> -   随时按 Ctrl+Alt+L（或点击 选项 -> 切换中英文界面）即可在全中文与原版英文界面之间毫秒级切换，状态自动持久化保存。
> 
> * * *
> 
> 为了让汉化达到 **生产级稳定性**，本插件在实现过程中通过逆向 IDA 9.5 解决了三个核心底层难题：通过逆向 IDA 主程序中的 attach_action_to_menu 逻辑发现：
> 
> -   IDA 在查找 **顶级菜单** （如 File/、Edit/、Options/）时，是通过 QMenu.objectName() 查找的，因此顶级菜单的 title 可以直接改为纯中文；
> -   但在查找 **二级子菜单** （如 Edit/Patch program/、View/Open subviews/Strings）以及 **相对挂载锚点** 时，IDA 底层会去除快捷键符号 & 后按 **英文前缀** 匹配菜单项文本。
> 
> 如果把所有菜单项粗暴改成纯中文，后续加载的插件就会找不到挂载点。为此，通过扫描 IDA 9.5 整个程序包（主程序、全部.dylib/.dll 插件、Python 脚本及.cfg配置），提取出全量 **26 个作为路径锚点的叶子 Action** （如 Rename、OpenStrings、JumpEnter、DebuggerRunTo 等）以及二级子菜单，对这极少数锚点保留 "English 中文" 静态前缀，而其余 **800+ 个菜单项全部使用纯中文**。这样既保证了纯正的中文体验，又 100% 兼容所有插件菜单挂载。  
> **2\. 规避 PySide6 / Shiboken 跨线程重入崩溃（signum=11）** 在 IDA 9.x（基于 Qt 6 / PySide6）中，如果像常规 PyQt 程序那样挂载自定义的 QCoreApplication.installTranslator()，当 IDA 后台分析线程或 C++ 控件析构阶段调用 QCoreApplication::translate() 时，Shiboken 会在非预期上下文跨 C++/Python 边界争抢 GIL，触发 SIGSEGV (signum=11)。因此，本插件 **彻底摒弃了 QTranslator 全局拦截**，完全基于 IDA 官方的 ida_kernwin.UI_Hooks 生命周期回调（ready_to_run、database_inited、widget_visible、finish_populating_widget_popup）与 QApplication.focusChanged 信号，在纯主线程安全上下文中按需完成控件汉化，并对所有 Qt 对象执行 Shiboken.isValid() 存活校验。通过对 macOS 平台插件 libqcocoa.dylib 的逆向分析发现，macOS 顶部菜单栏使用的是系统原生 NSMenu。当用户点击某个菜单项时，AppKit 的底层回调顺序是：menuWillOpen: (aboutToShow) -> **menuDidClose: (aboutToHide) 先执行** -> **itemFired: (QAction.triggered) 后执行**。如果在 aboutToShow 或 aboutToHide 信号里动态调用 QAction.setText() 切换中英文，会触发 QCocoaMenuItem::sync() 在菜单关闭瞬间重建底层 NSMenuItem，导致随后的 itemFired: 丢失目标，表现为菜单项偶发点不开。  
> 本插件因此采用 **100% 静态菜单架构**：每个 Action 注册后仅调用一次 ida_kernwin.update_action_label()，菜单展开与收起过程中零 setText调用、零信号拦截，彻底消除了 macOS 原生菜单的点击竞态问题。
> 
> * * *
> 
>   
> **四、安装与使用方法（支持 macOS & Windows）** 本插件仅包含两个文件，无需安装任何第三方依赖，不修改 IDA 安装包内的任何原有文件：
> 
> -   ida_zh_cn.py（插件主程序）
> -   ida_zh_cn_dict.json（汉化词典文件）
> 
> 将上述两个文件同时复制到你的 IDA 用户插件目录（推荐，升级 IDA 不会丢失）或安装目录下的 plugins 文件夹中：
> 
> -   **macOS / Linux**： *(也可放入 /Applications/IDA Professional 9.5.app/Contents/MacOS/plugins/)*
> -   **Windows**：  
>     %APPDATA%\\Hex-Rays\\IDA Pro\\plugins\\ *(即 C:\\Users\\<你的用户名>\\AppData\\Roaming\\Hex-Rays\\IDA Pro\\plugins\\，也可放入 IDA 安装目录的 plugins\\ 下)*
> 
> -   复制完成后重启 IDA Pro，插件会自动加载并切换为简体中文界面，底部 Output 窗口会输出： \[IDA-ZH\] IDA 简体中文插件已加载 | Author: CHENDIYAO (转发请注明出处) | Ctrl+Alt+L 切换中英文
> -   **切换中英文**：随时按下快捷键 **Ctrl+Alt+L**，或在顶部菜单栏点击 **选项 -> 切换中英文界面**，即可实时恢复英文或切回中文。
> -   **自定义词条**：直接编辑 ida_zh_cn_dict.json 即可增补或调整任意菜单与对话框翻译，按两次 Ctrl+Alt+L 即可热重载生效。
> 
> * * *
> 
> -   **作者**：CHENDIYAO
> -   **仓库**：https://github.com/chendiyao/IDA-Pro-zh-CN
> -   **声明**：本插件仅供逆向工程技术交流与个人学习使用。欢迎 Star、Fork 与提交词条补充 PR； **任何转载、公众号/论坛发文引用或打包分发，请务必注明原作者 CHENDIYAO 及本仓库地址。**
> 
> **直接下载** [IDA-Pro-zh-CN.zip](https://pan.baidu.com/s/1TWcB0ikmc10Boek1p5rTZA) *(191.4 KB,)*  

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b7b2974c381e3d5d.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61dcb55f8adea5df.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6aa01161371d0cd2.png)
