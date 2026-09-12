---
title: 【看雪】IDA Pro 基础教程：从目录结构到动态调试的入门指南
source: https://bbs.kanxue.com/thread-292932.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-12T16:16:45+08:00
trace_id: 16c4d5ee-f84f-4238-bf17-7afda9c98ab3
content_hash: d917eff2f2229d3d75018b94e5ee7568614aa0ea4e39b52e8acc2235d828addf
status: synced
tags:
  - 看雪
  - 安全工具
  - Windows逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: 一份基于《IDA Pro 权威指南》的学习笔记，系统梳理 IDA Pro 从目录结构、数据库机制到反汇编导航、结构体、签名、Patch 与动态调试的基础操作。
ai_summary_style: key-points
images_status:
  total: 102
  succeeded: 102
  failed_urls: []
notion_page_id: 3d975244-d011-81ea-b74e-c63c48b55236
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一份基于《IDA Pro 权威指南》的学习笔记，系统梳理 IDA Pro 从目录结构、数据库机制到反汇编导航、结构体、签名、Patch 与动态调试的基础操作。
> 
> - **数据库机制：** 打开文件生成 .id0/.id1/.nam/.til，关闭时可打包为 i64；所有修改只作用于数据库，不改动原可执行文件，故无撤销功能。
> - **窗口与视图：** View → Open Subviews 可打开函数、字符串、导入导出、段、签名等窗口，也可恢复误关窗口；反汇编视图按空格在图形/列表视图间切换。
> - **常用快捷键：** N 命名变量或函数、Y 改函数原型、X 查交叉引用、G 跳转地址、F5 生成伪代码；C/D/U 与 A/O 用于代码、数据、字符串、偏移的转换。
> - **Patch 与结构体：** Edit → Patch program 改字节需 Apply，KeyPatch 插件可直接改指令；结构体支持 Local Types 自定义、导入标准结构、解析 C 头文件及 PDB 加载。
> - **动态调试：** F9/F7/F8/F4 控制执行、F2 下断点；软件断点不限数量、硬件断点最多 4 个；Linux 远程调试需 dbgsrv 配合 Remote Linux debugger。

大家好，我是正在学习软件二进制逆向的菜鸟一名.写这篇文章的初衷，是记录和整理自己在学习 IDA Pro 过程中的一些笔记，同时也希望能给刚接触 IDA 的同学提供一份相对完整的基础参考。

本文内容覆盖了 IDA Pro 的基础使用流程，包括目录结构、文件加载、数据库机制、桌面窗口、反汇编导航、常用操作、结构体、签名制作、Patch、动态调试、插件以及一些使用技巧。文章整体偏基础，适合刚入门 IDA、希望系统了解其常用功能的读者，也适合作为平时查阅的备忘录。

需要特别说明的是：本文主体内容整理 **自《IDA Pro 权威指南（第 2 版）》**，并结合了我在学习中的一些使用经验，以及网络上公开的资料。建议有条件的同学阅读原书，以获得更系统、准确的理解。如果文中存在错误、遗漏或版权相关问题，欢迎联系我处理。

## 本文目录

1.  IDA 目录结构
2.  IDA 启动流程
3.  IDA 桌面简介
4.  初始分析时的桌面行为
5.  IDA 各个窗口介绍
6.  IDA 桌面提示和技巧
7.  反汇编导航
8.  反汇编窗口操作
9.  其他常用功能
10.  动态调试
11.  IDA 插件
12.  IDA 使用技巧

## 阅读建议

-   本文基于 IDA Professional 9.4 和IDA Professional 8.2的环境编写，不同版本在菜单名称和界面上可能略有差异，但基础操作大体相通。
-   建议边看边在 IDA 中实际操作，尤其是快捷键、交叉引用、重命名、结构体、Patch 和动态调试部分。
-   本文不是对原书的替代，而是一份个人学习笔记。遇到不确定的地方，建议以 IDA 官方文档和原书为准。
-   欢迎各位前辈在评论区指出错误或补充更好的用法，我会尽量更新和修正。

希望这篇文章能对刚接触 IDA 的你有所帮助。

## IDA 基础教程

## 1\. IDA目录结构

1.  cfg:各种配置文件 基本IDA配置文件.ida.cfg.GUI配置文件.idagui.cfg等
    
2.  dbgsrv:多架构远程调试服务器端可执行文件
    
3.  idc:IDA内置脚本语言IDC所需要的核心文件
    
4.  ids：一些符号文件
    
5.  loaders:包含用于识别和解析PE或者ELF的模块
    
6.  plugins:附加的插件模块
    
7.  procs:包含处理器模块
    
8.  sig:存放IDA签名文件的目录
    
9.  tools:存放IDA的一些小工具的目录
    

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5ca519f97fad9a2a.png)

## 2\. IDA启动流程

1.  启动IDA
    
    1.  启动IDA后 会显示一个对话框 为你进入桌面环境提供三种选项  
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/863456d93747f2f1.png)
    2.  如果不喜欢看到这个页面 可以通过将底部的 `Display at startup` 的勾取消掉 那么之后启动IDA将默认选择Go按钮 显示空白的工作区 如果想让这个工作框再次出现 那么可以编辑注册表项的 `HKEY_CURRENT_USER\SOFTWARE\Hex-Rays\IDA` 中的 `DisplayWelcome` 字段的值设置为1 这个对话框可以方便地返回最近使用过的文件  
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f675c2aba0d6e2a8.png)
    3.  下面简要说明三种进入IDA桌面的方式
        -   New(新建):选择New将启动一个标准的File Open对话框来选择将要分析的文件，然后会出现多个对话框用于选择特定的文件分析选项然后再加载、分析和显示该文件
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/809ba0993e560450.png)
            
        -   Go(运行)：选择Go将会打开一个空白的IDA工作区。这时 如果要打开一个文件，可以文件直接拖到IDA的工作区，或者使用菜单栏中的 `File` 菜单中的选项打开文件,`File->Open` 命令可启动 `File Open` 对话框 这时注意将文件的过滤选项改为 `All Files` 来打开文件。之后就和 `New` 选项没有区别了
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d5edc9c01bc15df1.png)
            
        -   Previous：使用Previous按钮将打开其下“最近用过的文件”列表中的一个文件，(也可以直接双击该列表中的文件)最初这个历史记录列表的最大长度为10，可以通过编辑idagui.cfg或ifatui.cfg文件中的相应项目来更改为100。要想重新处理最近用过的数据库文件，使用这个历史记录列表是最方便的选择  
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fb151d67740caac.png)
            
2.  IDA文件加载
    
    1.  使用FIle->Open 命令打开一个新文件时，会看到加载对话框。  
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/69a51195c0e0fb0c.png)
        
        1.  对话框最上面部分的列表中的选项是加载器选项，IDA通过执行loaders目录中的每一个文件加载器，来确定能够识别新文件的加载器，从而建立了这个列表。一般选择默认选项，除非有能够推翻IDA决定的信息。 `Binary File（二进制文件）` 是IDA无法识别加载文件的默认选项 其会一直出现在最底部
            
        2.  在 `Processor Type(处理器类型)` 下拉菜单中可以指定在反汇编中使用的处理器模块(在IDA的procs目录中)。多数情况下，IDA会根据它在可执行文件头中读取的信息选择合适的处理器。若IDA无法自动识别，在继续文件加载操作前 必须手动选择一款处理器类型。
            
        3.  在选择不同的加载器和处理器模块的情况下， `Loading segment(加载段)` 和 `Loading offset(加载偏移量)` 将处于不同的状态。这里输入的内容将共同构成所加载文件内容的基址类似于 `CS:IP` 若忘记指定基址，可以在任何时候使用 `Edit->Segments->Rebase Program` 命令来修改IDA镜像的基址
            
        4.  Kernel Options(核心选项)按钮用于配置特定的反汇编分析选项，IDA可利用这些选项改进递归下降过程，通常选择默认。其余可查IDA帮助文件
            
        5.  Processor Options(处理器选项)按钮用来选择适用于选中的处理器模块的配置选项
            
        6.  其他选项复选框可帮助用户更好地控制文件加载过程。IDA的帮助文件详细介绍了这里的每一个选项。
            
    2.  使用二进制文件加载器
        
        1.  选用二进制文件加载器，将手动完成更加强大的加载器自动完成的任务。需要使用二进制加载器的情形包括：
            
            1.  分析从网络数据包或日志文件中提取出来的ROM镜像
                
            2.  破解程序负载。
                
        2.  如果同时选择x86处理器模块和二进制加载器，将会显示对话框指定代码作为16位模式代码，还是32位模式代码处理
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6289437fcf1412a3.png)
            
        3.  如果将所有的配置都设置完毕，那么就到了最后一个步骤，IDA没有可用的信息帮助它区分二进制文件中的代码字节和数据字节 这时需要手动确定一个字节作为入口点，并在此处按 快捷键C 将字节转换成代码然后开启自动分析
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/db549ce1cb0080df.png)
            
    3.  IDA数据库文件
        
        1.  IDA数据库概述
            
            1.  当使用file->open打开要分析的文件后 所选文件的目录中会出现以下三个文件  
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/30e1ab1bdd323a1b.png)
                
                1.  `.id0` 文件是一个二叉树形式的数据库，
                    
                2.  `.id1` 文件包含描述每个程序字节的标记
                    
                3.  `.nam` 文件包含与 IDA的 `Names窗口` 中给定程序位置有关的 索引信息
                    
            2.  当点击了加载选项里的OK之后，会生成一个.til文件 该文件用于存储 与一个给定数据库的本地类型定义有关的 信息
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c0897dd6f53eeff5.png)
                
            3.  当关闭当前项目时，这几个文件将被存档，还可以选择将它们压缩成一个IDB文件(IDA数据库)。若数据库正常关闭，则看不到这些文件。如果关闭了还能看见 说明数据库可能出现了损坏。
                
            4.  当IDA为可执行文件创建了数据库之后，就不再访问这个可执行文件本身，除非动态调试它。IDA本质上是一个数据库应用程序 用户在IDA中的所有修改只会影响数据库而不会影响可执行文件本身
                
        2.  创建IDA数据库
            
            1.  IDA的处理过程
                
                1.  在选择文件并指定相应的选项之后，IDA将开始创建数据库。IDA先将控制权交给选定的加载器模块，工作包括：从磁盘加载文件，解析能识别的文件头信息，创建各种包含代码或数据的程序块(I在文件头中指定的程序块)，最后再将控制权返还IDA之前确定的代码入口点。总的来说加载器的功能就是根据程序文件头包含的信息，确定一个虚拟内存布局，并对数据库进行配置
                    
                2.  之后，IDA的反汇编引擎将接管控制权，一次传一个地址给处理器模块。工作包括：确定位于该地址的指令的类型、长度，以及从这个地址继续执行指令的位置。找完了之后二次遍历地址列表，并请处理器模块将每个指令转换成汇编语言，然后将他们显示出来 总的来说处理器模块的功能就是反汇编代码
                    
                3.  反汇编完成之后，IDA会自动对二进制文件进行额外的分析，以提取出对分析人员有用的信息 包括
                    
                    1.  编译器识别
                        
                    2.  函数参数和局部变量识别
                        
                    3.  数据类型信息
                        
        3.  关闭IDA数据库
            
            1.  如果关闭一个IDA数据库，将显示一个保存数据的对话框，提供了多种对数据库进行处理的选项
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/17edd6afb4679e99.png)
                
                1.  **Don’t pack database（不打包数据库）**，这个选项仅仅刷新对 4 个数据库组件文件所做的更改，在关闭桌面前并不创建 IDB 文件
                    
                2.  **Pack database（Store）［打包数据库（存储）］**，选择该选项会将 4 个数据库组件文件存到一个 i64 文件中，然后这 4 个数据库文件会被删除，Store 选项不使用压缩
                    
                3.  **Pack database（Compressed file）［打包数据库（压缩）］**，该选项等同于 Store 选项，其唯一的差别在于数据库组件文件被压缩到.i64文件中。
                    
                4.  **Collect garbage（收集垃圾）**，如果勾选该选项，IDA 会在关闭数据库之前，从数据库中删除没有用的内存页面.选择 Deflate选项可创建尽可能小的 IDB文件.通常，只有在磁盘空间不足时才选择这个选项
                    
                5.  **DON’T SAVE the datebase（不保存数据库）**，选择这个选项时，IDA 会删除 4 个数据库组件文件，保留现有的未经修改的 IDB 文件使用这个选项类似于在使用 IDA 时应用了撤销或还原功能
                    

## 3\. IDA桌面简介

1.  IDA默认桌面  
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/66c3e59e6b781de0.webp)
    
    1.  工具栏区域：包含与 IDA 的常用操作对应的工具，可以使用 View -> Toolbar显示或隐藏工具栏。也可以使用 View -> Toolbars -> Show all 显示整整三排工具按钮
        
    2.  彩色的水平带是 IDA 的 **概况导航栏（2）**，导航带是被加载文件地址空间的线性视图。不同的颜色 表示不同类型的文件内容，如数据或代码。将光标悬停在导航带的任何位置，IDA 会显示一个工具提示，指出其在二进制文件中的对应位置。单击导航带，反汇编视图将跳转到二进制文件中所选定的位置
        
    3.  数据显示窗口栏,IDA 为当前打开的每一个数据显示窗口都提供了标签，数据显示窗口中包含从二进制文件中提取的信息，它们代表数据库的各种视图。绝大多数分析工作需要通过数据显示窗口完成， **通过 `View -> Open Subviews` 菜单** 可打开其他数据显示窗口，还可恢复任何意外关闭的窗口。
        
    4.  反汇编视图：是主要数据显示视图，它有两种不同的形式： `图形视图（默认）` 和 `列表视图` 。在图形视图中，IDA 显示的是某个函数。在某一时间的流程图 `使用空格键` 可以在图形视图样式和列表视图样式之间切换。
        
        1.  图形视图
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7e7cae196d7a4777.png)
            
        2.  列表视图
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ced0c69893ea40d0.png)
            
    5.  图形概况视图，仅在使用图形视图时显示，可提供基本图形结构的缩小快照，其中的虚线矩形表示图形视图在图形概况视图中的位置 在图形概况窗口内单击鼠标，可重新定位图形视图的显示位置
        
    6.  **输出窗口** 显示的是 IDA 输出的信息。在该窗口，用户可以找到与文件分析进度有关的状态消息，以及由用户操作导致的错误消息。输出窗口基本上等同于一个控制台输出设备
        
    7.  **函数窗口** 是默认 IDA 显示窗口的最后一部分，包含了IDA识别到的函数 后续详细介绍
        

## 4\. 初始分析时的桌面行为

1.  当输出窗口出现这一行代码 `You may start to explore the input file right now.`表示可以开始浏览各种数据显示窗口，但是不要尝试修改。
    
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1cb62ae8da0085dd.png)
    
2.  当输出窗口出现这一行代码的时候 `The initial autoanalysis has been finished.`表示数据显示窗口的内容将不再自动更改。这时，才可以修改各个数据显示窗口
    
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aba1969d56e635ee.png)
    

## 5\. IDA各个窗口介绍

1.  IDA用户界面的基本规则
    
    1.  IDA不提供撤销功能，如果要恢复到某个步骤之前 只能关闭数据库并选择： `Don't save the database` 再重新打开选择自己之前保存过的idb文件
        
    2.  几乎所有的操作都有其对应的菜单项、热键和工具栏按钮。
        
    3.  IDA提供方便的、基于上下文的鼠标右键操作菜单。
        
2.  IDA主要的数据显示窗口
    
    1.  本篇所讲的所有窗口都可以在 `View -> Open Subviews` 中打开
        
    2.  反汇编窗口
        
        1.  反汇编窗口也叫 `IDA-View` 窗口 该窗口有两种显示模式 列表视图和图形视图 可以使用 `Space` 键用于切换
            
        2.  IDA图形视图
            
            1.  IDA会将一个函数分解成许多基本块，可以生动显示块与块之间的控制流程。IDA使用不同的彩色箭头区分函数块之间各种类型的流，在条件跳转位置， `绿色线条` 表示 **真** 就跳转到； `红色线条` 表示 **非** 就跳转到。只有一个后继块的基本块会利用 `蓝色线条` 指向下一个块
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d262db426743b41e.png)
                
            2.  在图形模式中 可以使用 `Ctrl+鼠标滑轮` 来调整图形大小。 遇到大型函数时，可以配合概况窗口来观察完整的函数结构。
                
            3.  控制图形视图的基本方式
                
                1.  平移：可以通过拖动图形视图的背景来调整视角
                    
                2.  重新调整块位置：
                    
                    1.  通过单击图形块的标题栏可以将其拖动到一个新的位置。浅蓝色的位置就是标题栏;
                        
                        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e6876432bffbb22d.png)
                        
                    2.  可以通过拖动线条的顶点改变线的连接路径，也可以 `“Shift+双击线条”` 在双击位置处新添加一个顶点
                        
                    3.  右键图形选择 `Layout Graph` 可以还原到默认图形布局
                        
                3.  分组和折叠块
                    
                    1.  可以对块分组，每个块单独分组，或者与其他块一起分组（使用Ctrl选择多块），并可将分组后的块折叠起来。
                        
                    2.  折叠块特别有用，可以帮助你追踪已经分析过的块。要折叠块，可以右击块的标题栏，然后在出现的菜单上选择 `Group Nodes` 。
                        
                        1.  折叠前的块
                            
                            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c38ce87f631d35bd.png)
                            
                        2.  折叠后的块
                            
                            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/14d989a560496f08.png)
                            
                4.  创建其他反汇编窗口
                    
                    1.  可以在 `View->Open Subviews->Disassembly` 中打开多个反汇编窗口，每个窗口互相独立。
                5.  打开行前缀
                    
                    1.  要想显示与每个反汇编行有关的其他信息，可以通过 `Options▶General` 命令打开IDA常规选项，然后在 `Disassembly` 选项卡的可用的反汇编行部分选择相应的选项
                        
                        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc0ecb2b769dd839.png)
                        
                        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/73386300c12e550f.png)
                        
        3.  IDA列表视图
            
            1.  文本显示窗口会呈现一个程序的完整反汇编代码清单（而在图形模式下一次只能显示一个函数），用户只有通过这个窗口才能查看一个二进制文件的数据部分。
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a5a4a53b27ada86d.png)
                
                1.  窗口中的反汇编代码分行显示，虚拟地址则默认显示。通常，虚拟地址以 `[ 区域名称 ]:[ 虚拟地址 ]` 这种格式显示，如 `.text:00401589` 可以通过修改 `Options->General->Disassembly` 来修改显示的内容
                    
                2.  **位置 1** 的声明（也出现在图形视图中）是 IDA 对于函数栈帧布局的最准确估算,IDA 会对函数栈指针及函数使用的任何栈帧指针的行为进行仔细分析，从而计算出该函数的栈帧的结构
                    
                3.  **位置 2** 的注释（以分号开头）属于交叉引用.代码交叉引用（而不是数据交叉引用），它表示另一个程序指令将控制权转交给交叉引用注释所在位置的指令
                    
                4.  显示窗口的左边部分叫做 **箭头窗口**，用于描述函数中的非线性流程。 **实线箭头** 表示 **非条件跳转**， **虚线箭头** 则表示 **条件跳转** 如果一个如果是 **往高地址处跳转**，会使用细线表示(分支结构)，如果是往 **低地址处跳转**，会使用粗线箭头表示（循环结构）.
                    
                    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e4047d380ec3d1df.png)
                    
                5.  双击指令中的 `var_xx` 等用于表示局部变量和参数的关键字，可以跳转至IDA对于该函数模拟的堆栈视图，便于变量和参数的识别
                    
                    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/650108930aaf516b.png)
                    
        4.  伪代码视图
            
            1.  在反汇编窗口按下F5快捷键，IDA会尝试将当前反汇编窗口的内容以函数为单位转换成C语言，只能参考 不可全信。数据类型 函数参数都有可能分析错误  
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60a8cbec1d8e7a0f.webp)
    3.  函数窗口
        
        1.  函数窗口用于列举 IDA 在数据库中识别的每一个函数，Functions 窗口中的条目如下所示(点击小函数窗口的右上角最大化按钮可以完整显示)：
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d6804dc671513452.png)
            
            1.  Function name：函数的名称。双击 `Functions` 窗口中的一个条目，反汇编窗口将跳转到选定函数所在的位置（反汇编窗口会自动打开）
                
            2.  Segment：函数所在的段
                
            3.  Start：函数相对所在段的偏移地址
                
            4.  Length：函数以字节为单位的大小
                
            5.  Locals：局部变量和保存的寄存器以字节为单位的大小
                
            6.  Arguments：传递给函数的参数以字节为单位的大小
                
            7.  R - function returns to the caller 函数返回给调用方
                
            8.  F - far function 远函数
                
            9.  L - library function 库函数
                
            10.  S - static function 静态函数
                 
            11.  B - BP based frame. IDA will automatically convert all frame pointer \[BP+xxx\] operands to stack variables. IDA会自动使用EBP寻址堆栈变量
                 
            12.  T - function has type information 函数具有类型信息
                 
            13.  \= - Frame pointer is equal to the initial stack pointer.In this case the frame pointer points to the bottom of the frame.EBP==ESP 在这种情况下 指针指向栈底
                 
        2.  双击Functions窗口中的一个条目，反汇编窗口将跳转到选定函数所在的位置（反汇编窗口会自动打开）
            
    4.  输出窗口
        
        1.  打开一个新文件时，IDA 工作区底部的输出窗口与其他窗口一起组成了 IDA 的默认窗口。输出窗口是 IDA 的输出控制台，从中可以找到与 IDA 所执行的任务有关的信息。通常，输出窗口是显示 IDA 开发的任何脚本和插件的输出的主要窗口
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da7fc5d85f613649.png)
            
        2.  点击输出栏的左侧Python按钮，可以切换输入的命令的语言 可以在Python和C中切换 编辑框中可以输入命令
            
    5.  十六进制窗口
        
        1.  对应 `Views->Open Subviews->Hex dump`,十六进制窗口可以配置为显示各种格式，并可作为十六进制编辑器使用。和在反汇编窗口中一样，可以同时打开几个十六进制窗口。第一个叫做 `Hex View-1` ，第二个叫做 `Hex View-2` ，依次类推。
            
        2.  同步关联
            
            1.  默认情况下，第一个十六进制窗口会与第一个反汇编窗口同步,你也可以通过在任一窗口中右击选击\*\* `Synchronize with` \*\*然后选择一个窗口进行同步
        3.  编辑
            
            1.  在16进制窗口中 右键选择 **Edit** 进入编辑模式 即可修改16进制内容 注意：修改的位置是光标右边第一个内容。完成编辑后，必须提交或取消更改才能返回查看模式。
        4.  更改数据格式
            
            1.  右键选择\*\* Data Format \*\*选择各种显示格式，如 1、2、4、8 字节十六进制，带签名的十进制或不带签名的十进制整数及各种浮点格式
        5.  更改列数
            
            1.  可以使用Columns菜单项更改显示的列数
        6.  右侧文本块设置
            
            1.  右键选择Text进行设置
                
                1.  show 是否显示右侧文本块
                    
                2.  其余选项 修改编码的方式
                    
    6.  导出窗口
        
        1.  导出窗口列出文件的入口点。这些入口点包括程序的执行入口点（在程序的文件头部分指定），以及任何由文件导出给其他文件使用的函数和变量。通常，用户可在共享库（如 Windows DLL 文件）中找到导出的函数导出的项目按名称、虚拟地址和序数排列。对于可执行文件，导出窗口中至少包含一个项目：程序的执行入口点，IDA 将这个入口点取名为 start。与许多其他 IDA 窗口一样，双击导出窗口中的一个条目，IDA 将会跳转到反汇编窗口中与该项目有关的地址。导出窗口提供与 objdump (-T) 、 readelf (-s) 和 dumpbin (/EXPORTS) 等命令行工具类似的功能
    7.  导入窗口
        
        1.  导入窗口列出被分析的二进制文件导入的所有函数。导入窗口中的每个条目列出一个导入项目（函数或数据）的名称，以及包含该项目的库的名称。由于被导入的函数的代码位于共享库中，窗口中每个条目列出的地址为相关导入表条目的虚拟地址
            
        2.  双击后反汇编窗口跳转到的反汇编窗口位置为？？，是因为IDA是静态分析工具，无法知道程序在执行之后内存的内容
            
        3.  导入窗口还提供与 objdump (-T) 、 readelf (-s) 和 dumpbin (/IMPORTS) 等命令行工具类似的功能
            
        4.  导入窗口仅显示二进制文件想要动态加载器自动处理的符号，二进制文件选择使用 dlopen/dlsym 或 LoadLibrary/GetProcAddress 等机制自行加载的符号将不会在导入窗口中显示
            
    8.  本地类型窗口(Local Type)
        
        1.  用于查找程序中声明的数据类型,以及添加 编辑 删除自定义结构体
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48f4e4530e415011.png)
            
            1.  左边的Name为名称栏，显示了IDA认为的数据类型的名称
                
            2.  点击Name 将跳转到指定位置 ，点击左边的尖括号 可以展开 ，显示IDA识别出的结构体的每个字段的名称和大小
                
    9.  字符串窗口
        
        1.  通过 `View->Open subviews->Strings` 命令打开字符串窗口 显示从二进制文件中提取出的字符串以及字符串的长度 地址 类型
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a2015c04dc1e9d5c.png)
            
            1.  双击Strings窗口中的字符串，反汇编窗口将自动跳转到该字符串的地址。
                
            2.  结合交叉引用，可以追踪到程序中任何引用该字符串的位置
                
            3.  右键->Set up 可以对IDA字符串扫描进行设置
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/358cc20db176df95.png)
                
    10.  名称窗口
         
         1.  列举一个二进制文件的所有全局名称（对一个程序虚拟地址的符号描述） 通过 `View->Open subviews->Names` 命令打开
             
             1.  IDA对名称的编码
                 
                 -   F 常规函数 IDA认为不属于库函数
                     
                 -   L 库函数
                     
                 -   I 导入的名称 共享库导入的函数名称，没有代码。而库函数的主题在反汇编代码清单中显示
                     
                 -   C 命名代码 已命名的程序指令位置。
                     
                 -   D 数据
                     
                 -   A 字符串数据
                     
             2.  IDA自动生成的名称的前缀含义
                 
                 -   sub\_\__xxxx 地址xxxx处的函数
                     
                 -   loc\_\__xxxx 地址xxxx处的一个指令
                     
                 -   byte\_\__xxxx 地址xxxx处的8位数据
                     
                 -   word 16位数据
                     
                 -   dword 32位数据
                     
                 -   unk 大小未知的数据
                     
                 
                 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9563d13259508f9.png)
                 
    11.  段窗口 通过 `View->Open subviews->Segment` 命令打开
         
         1.  显示的是在二进制文件中出现的段的简要列表，与节相对应
             
             ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed6feb6950268276.png)
             
             1.  显示的信息包括段名称、起始和结束的虚拟地址以及许可标志 段寄存器 。右键 可以删除，增加，编辑现有段
    12.  签名窗口 通过 `View->Open subviews->Signature` 命令打开
         
         1.  ida利用一个巨大的签名库来识别已知的代码块
             
             ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2c28a73936fcc088.png)
             
         2.  经过ida的识别，这个二进制文件应用了vcseh.sig签名，
             
    13.  类型库窗口 通过 `View->Open subviews->TypeLibraryies` 命令打开
         
         1.  类型库保存IDA积累的一些信息，即IDA从最常用的编译器的头文件中搜集到的有关预定义数据类型和函数原型的信息
    14.  交叉引用窗口 `View->Open subviews->Cross References tree` 打开
         
         1.  打开窗口时，IDA会确定光标所在位置的函数的“近邻”并生成一个窗口
             
             ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/013c9e57fb7656bf.png)
             
             1.  该窗口显示了所选函数为 `sub_401160` 被off_41B9D4从1个位置调用，而它又调用了3个另外的函数。双击任何一行，IDA将立即跳转到反汇编窗口中对应的函数
    15.  问题窗口 `View->Open subviews->Problems` 打开
         
         1.  问题窗口包含了IDA在反汇编二进制文件时遇到的困难，以及如何处理这些困难
             
             ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eedaed227276b391.png)
             
             1.  该窗口显示了问题发生的地址 问题的类型 以及问题的指令

## 6\. IDA桌面提示和技巧

1.  IDA包含大量信息，可以通过以下操作充分利用桌面的功能
    
    1.  使用 `View -> Open Subviews` 恢复无意中关闭的数据显示窗口
        
    2.  使用 `Windows -> Reset Desktop` 可迅速将桌面恢复到原始布局
        
    3.  使用 `Windows -> Save Desktop` 保存当前的桌面布局
        
    4.  用 `Windows -> Load Desktop` 打开之前保存的一个桌面布局
        
    5.  反汇编窗口（无论是图形视图或列表视图）是唯一一个可以修改其显示字体的窗口，使用 `Options -> Font` 命令可以设置字体
        

## 7\. 反汇编窗口操作

1.  命名和重命名
    
    1.  局部变量和参数重命名
        
        1.  IDA中 默认给局部变量命名 `var_xx`,x为相对ebp的偏移.当我们理解了某个局部变量的意义后，可以对变量更改名称，提高反汇编代码的可读性;
            
        2.  点击 `var_xx`,高亮后按下 `n` 键，会弹出命名对话框，输入新的局部变量名(示例中是example)即可；参数为 `arg_xx` x也是偏移,对 `arg_xx` 进行同样的操作也可以对参数进行重命名
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/582ded71afef2844.png)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/67b8d95f7867fe84.png)
            
    2.  地址重命名
        
        1.  IDA中 会对部分地址(发生跳转的目标地址)默认命名为 `loc_xx` xx为地址。
            
        2.  点击 `loc_xx` 或者点击左侧地址列表的`.text:地址` 中的地址，会弹出命名对话框，输入新的地址名称即可. 该操作可以显著提高代码的可读性，理清程序的执行流程，例如对于循环结构 可以对指定位置命名 `LOOPN_CONDITION` ， `LOOPN_BODY` ， `LOOPN_UPDATE` ；对于分支结构 可以命名 `IFN_BODY` ， `IFN_END` ， `IFN_ELSE` 等等
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5ed5d9782ef3c61b.png)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b3bef3cef4514509.png)
            
    3.  函数重命名
        
        1.  IDA默认给无法识别的函数命名为 `sub_xx` xx为函数的首地址
            
        2.  可以对函数名按N，对函数进行重命名，提高代码可读性
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5fbb5c9ac9bea6b9.png)
            
    4.  寄存器重命名
        
        1.  当我们分析出某个寄存器在某段地址范围内的作用时，可以对寄存器进行命名，给出更符合含义的名称，提高代码的可读性
            
        2.  对寄存器按下N键，弹出寄存器重命名对话框，输入地址范围，寄存器名，已经更改后的名字，注释，即可修改寄存器名
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/61568fbb0dcf8e08.png)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c3609adba463b6a0.png)
            
2.  注释
    
    1.  常规注释
        
        1.  在反汇编窗口中按下 `Shift+;`可以对光标所在行添加常规注释
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/311e7496f9f257fd.png)
            
    2.  可重复注释
        
        1.  在反汇编窗口中按下`;`可以对光标所在行添加可重复注释，如果一个位置引用了另一个包含可重复注释的位置，那么该位置也会显示这个可重复注释 在 `004010A0` 即 `lea eax, [i+i*8]` 处添加可重复注释 底部jl指令处也出现了该注释
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/86f746ab5061b9b6.png)
            
        2.  当一个位置既编写了可重复注释又编写了常规注释时，优先显示常规注释
            
    3.  函数注释
        
        1.  IDA在函数名位置会默认生成`;`开头的函数注释，该注释包含函数原型的信息，当我们修改函数原型时，会自动修改函数注释
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3d1cdf6a5346296a.png)
            
3.  IDA数组操作
    
    1.  将数组的大小转换为合适的大小，在变量定义处按D转换为数据 然后再按D 转换为不同大小的数据
        
        1.  示例:是4个字节为一个元素 所以需要改为DWORD
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4a42e5ce21bc3ee5.png)
            
    2.  右键变量定义处 点击Array 设置元素的个数 以及每行显示的元素个数等属性
        
        1.  语法
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0745ecdff9f8d980.png)
            
            -   (Array Size)数组大小：数组中元素的总数；
                
            -   一行中的项目数：一行中要打印的项目数（最多）。0 表示打印适合反汇编行的最大数量；
                
            -   元素打印宽度：每个元素打印多少个字符。与前一个参数一起可用于将数组格式化为漂亮的表格。例如
                
                -   每行 8 项，打印宽度-1：
                    
                    ```
                    db 1, 2, 3, 4, 5, 6, 7, 8
                    db 9, 10, 11, 12, 13, 14, 15, 16
                    db 17, 18, 19, 20, 21, 22, 23, 24
                    db 25, 255, 255, 255, 255, 255, 255, 26
                    db 27, 28, 29, 30, 31, 32, 33, 34
                    db 35, 36, 37, 38, 39, 40, 41, 42
                    ```
                    
                -   宽度为0
                    
                    ```
                    db   1,  2,  3,  4,  5,  6,  7,  8
                    db   9, 10, 11, 12, 13, 14, 15, 16
                    db  17, 18, 19, 20, 21, 22, 23, 24
                    db  25,255,255,255,255,255,255, 26
                    db  27, 28, 29, 30, 31, 32, 33, 34
                    db  35, 36, 37, 38, 39, 40, 41, 42
                    ```
                    
                -   宽度为5
                    
                    ```
                    db     1,    2,    3,    4,    5,    6,    7,    8
                    db     9,   10,   11,   12,   13,   14,   15,   16
                    db    17,   18,   19,   20,   21,   22,   23,   24
                    db    25,  255,  255,  255,  255,  255,  255,   26
                    db    27,   28,   29,   30,   31,   32,   33,   34
                    db    35,   36,   37,   38,   39,   40,   41,   42
                    ```
                    
            -   使用 "dup "结构：对于支持该结构的汇编程序，具有相同值的重复项目将合并为一个 dup 表达式，而不是单独打印每个项目；
                
                -   dup off: db 0FFh, 0FFh, 0FFh, 0FFh, 0FFh, 0FFh
                    
                -   dup on：db 6 dup(0FFh)
                    
            -   有符号元素：整数项目将被视为有符号数字；
                
            -   显示索引：每一行的第一个项目的数组索引将打印在注释中。
                
            -   创建为数组：如果未选中，IDA 将把数组转换为单独的项。
                
        2.  示例
            
            1.  总共7个元素 每行显示一个元素 宽度为4
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d620569f07deb4f4.png)
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bfdcfbb3b3011d21.png)
                
    3.  右键数组元素的内容 转换为字符集中的字符 提升可读性
        
        1.  示例：本例是字符串数组，所以要将数据转换为字符串
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b0a5c18280c4a27b.png)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a535f75be72619cc.png)
            
4.  格式化操作数
    
    1.  对指令的操作数按下右键，在弹出的菜单中选择不同的显示模式，可以使操作数以方式显示(包含进制 取相反数等等)，可以通过后缀和图标判断 具体是什么显示模式
        
    2.  如果确定该操作数是一个宏 右键点击 `Use standard symbolic constant` 弹出对话框 可以选择IDA根据常用的库提前定义好的宏
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1881f427e21b57f7.png)
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/432c117752bf1764.png)
        
5.  代码和数据的转换(反汇编窗口) 选中后按下快捷键进行切换
    
    1.  **U** undefined 将一个函数全部变成数据
        
    2.  D 将某一行反汇编指令变成数据 然后按D可以在多种类型中切换
        
    3.  C 将一部分的数据转换成指令
        
    4.  A 会以该位置为起点定义一个以 `\0` 结尾的字符串类型
        
    5.  O 将此处定义为一个地址偏移(指针) 将后三个字节的数据和当前字节数据放在一起(按照小尾字节序放在一起)
        
    6.  也可以在反汇编窗口处按下鼠标右键进行选择
        
    7.  IDA添加数据类型 Options->set up data types 勾选其他的数据类型 例如浮点数就是float和double
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/689f61dd2ebb16cc.png)
        
6.  IDA操作函数
    
    1.  修改函数名：在反汇编窗口选中对应行后 按下 **n** 键，可以修改函数的名称
        
    2.  修改函数参数：在反汇编窗口选中对应行后 按下 **y** 键，可以修改函数的声明,包括返回值类型，调用约定，函数名，参数 \*(参数写...可以改为 变参) \*
        
    3.  定义函数：在反汇编窗口选中对应行后 按下 **ALT+p** 键，可以修改函数的具体范围 局部变量区域等等
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/05a855f831c7e30e.png)
        
    4.  删除函数 函数窗口 选中函数后 按下 **Delete** 键 或 光标放在函数头按 **U**
        
    5.  修改函数范围 在函数窗口选中并按\*\* `Ctrl+E` **组合键，或在反汇编窗口的函数内部按** Alt+P\*\*组合键
        
7.  字符集问题：将UTF-8修改为GBK显示中文字符
    
    1.  选中单个字符串修改： `Options->String literal->Currently->空白区域右键` ，选中Insert 插入gb2312中文字符集
        
        ![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d581f62038558f3c.webp)
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f85265b02340caf4.png)
        
        1.  修改前
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6b5e51ddccdd9388.png)
            
        2.  修改后
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5f5df8023f0b5ab0.png)
            
    2.  修改针对于所有字符串的默认字符集：Options->Gerneric->String 根据位数修改对应字符集
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b70546f54a9171e.png)
        
        1.  要把8位的默认字符集修改为gbk:点击8-bit对应的按钮，在新弹出的对话框空白区域右键,选中insert 输入gbk即可添加gbk编码
8.  在反汇编窗口中按下ESC键，可以撤销上一次操作
    

## 8\. 其他常用功能

1.  结构体操作
    
    1.  结构体窗口 `(View->OpenSubview->Local Types)`
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8169585e95202f45.png)
        
    2.  在IDA中添加结构体
        
        1.  自定义结构体
            
            1.  右键 `Local Types窗口->add type->C syntax` 在编辑框中直接输入结构体的定义
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/095ee5e0ed66fc8d.png)
                
            2.  点击OK后就可以在窗口中看到自己定义的结构体数据类型
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6483e9d8ebd8a082.png)
                
        2.  IDA定义好的官方结构体
            
            1.  右键 `local types窗口->insert->import standard structure` 选中对应的结构体即可
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd75f174fedc41d6.png)
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6495029afac2c4d3.png)
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/755d05ca4e69488b.png)
                
        3.  开源库的结构体
            
            1.  获取包含对应结构体的头文件
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/04e3757813ddbfd4.png)
                
            2.  然后IDA加载该头文件 `File->Load File->Parse CHeader file`
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8c796bfc8c1911be.png)
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/03dc212b58f3bf27.png)
                
            3.  头文件中的结构体会自动进入Local types窗口
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d04f1eb92460619b.png)
                
        4.  PDB中提供的结构体
            
            1.  如果逆向分析的文件有PDB IDA会自动加载PDB中的结构体，例如逆向微软提供的部分程序，其中的PDB可以从微软的符号服务器中下载，辅助逆向分析。
    3.  导入结构体
        
        1.  将局部变量识别为寄存器变量:
            
            1.  双击对应的局部变量，进入IDA的模拟堆栈视图，然后对局部变量按ALT+Q 或者右键选中Struct var
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13fa7fee2de2de27.png)
                
            2.  在弹出的窗口中选中对应的结构体定义，然后反汇编中的会自动将该变量识别为结构体，对应偏移的操作会直接识别为对字段进行操作
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/44c05dbcfe1765a8.png)
                
        2.  将指令的操作数视为结构体偏移，显示对应的字段
            
            1.  点击对应的操作数，右键选择structure offset 或者 按T
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70d1bcdb9bbd2bc9.png)
                
            2.  选中对应的字段 并点击OK
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/857bd20602795232.png)
                
            3.  IDA会将对应偏移以结构体的字段显示(Point.z)
                
                ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/416d6f8a50ce348d.png)
                
2.  签名制作
    
    1.  IDA通过推出Sig文件和MakeSig的工具 可以让IDA载入Sig文件使IDA在分析的过程中可以识别静态库函数
        
    2.  IDA载入签名文件的流程
        
        1.  获取要创建签名文件的静态库文件（.lib）
            
        2.  通过得到的静态库文件生成.pat文件
            
            1.  流程
                
                1.  在 `IDA安装路径\IDA Professional 9.4\tools\flair` 路径下打开命令行
                    
                2.  使用 `path IDA安装路径\IDA Professional 9.4\tools\flair;%path%` 设置临时环境变量
                    
                3.  使用 `pcf 库名.lib` 通过.lib文件生成.pat文件
                    
            2.  不同的生成.pat文件的工具
                
                1.  `pcf` -> 处理windows的.lib文件
                    
                2.  `pelf` -> 处理Linux的.o 和.a静态库文件
                    
                3.  `pmacho` -> 处理Mac OS的.a静态库文件
                    
            3.  生成.pat文件的内容
                
                1.  剔除掉绝对地址后库函数的机器码全部拷贝下来
                    
                    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/96f2e1ed687ab3bb.png)
                    
            4.  多个库生成一个.pat文件命令:`pcf *.lib 文件名.pat` 将用到的库文件放在一个目录中，一次性处理目录中的所有库文件
                
        3.  通过.pat文件生成.sig文件 使用 `sigmake .pat文件名 .sig文件名` 生成.sig文件 例如 `sigmake MyMath.pat MyMath.sig`
            
            1.  签名冲突问题解决
                
                1.  使用-r参数 用后面的名称覆盖前面的名称
                    
                2.  减少.lib的个数
                    
                3.  手动编辑.exc文件 保留更准确那个
                    
                    -   无意义冲突：直接删除开头 4–5 行以 `;` 开头的注释行，sigmake 会丢弃所有冲突模块
                        
                    -   有意义冲突：保留开头注释行不动，在希望保留的模块行首加 `+` 号
                        
        4.  将.sig文件移动到IDA的sig目录中指定指令集的目录下
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6a04d520b654325c.png)
            
            1.  其中windows和linux的签名 放到pc目录中
        5.  IDA通过 `View->SubView->Signature->Apply New Sig` 打开签名窗口并添加新的签名文件 在弹出的对话框中选择需要的签名文件
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3e7716461695a2fe.png)
            
3.  函数调用图
    
    1.  函数调用图
        
        1.  选择 `View -> Graphs -> function calls` 打开函数调用图
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c39772825f4f89e7.png)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/03270ebfbddf1bc6.png)
            
4.  Patch 打补丁
    
    1.  IDA自带的patch工具(最好在Hex dump窗口中进行 更加直观 修改数据)
        
        1.  光标选中需要 `patch` 的内容，点击 `Edit -> patch program -> change byte/change word`
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bbce176194b36c1.png)
            
        2.  在弹出的对话框中 根据旧值，设置新值
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/510f60c75adaae84.png)
            
        3.  patch program->change Byte 打了之后要应用才有作用(patch program ->apply)
            
    2.  KeyPatch插件(可以在反汇编窗口Disassemble窗口中进行 更直观 修改指令)
        
        1.  光标选中需要patch的指令所在的行， 右键菜单中选中 `Keypatch->patcher`
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b949a2438c3b826.png)
            
        2.  在弹出的对话框中可以直接修改反汇编指令 例如将jle改为jge 然后点击patch即可
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7d5ae74c2e42784b.png)
            
    3.  将Patch保存到文件中
        
        1.  点击 `Edit->Patch program->Apply patches to input file`
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/22ce4c39c03700e4.png)
            
        2.  弹出的对话框中选择 保存的路径 然后点击OK即可
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f3f375e18c268e87.png)
            
5.  搜索功能
    
    1.  IDA集成了多种搜索功能供用户使用，都在菜单栏Search中  
        ![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8d09cd3d449dccaa.webp)
    2.  文本搜索(Text)
        -   入口与快捷键：Search→Text，快捷键Alt+T
        -   使用方法：打开对话框后输入要搜索的文本，可勾选Match case（区分大小写）、Regular expression（启用POSIX正则表达式）、Identifier（仅匹配完整标识符，比如函数名、助记符），还能选择向上/向下搜索，勾选Find all occurrences会在新窗口列出所有匹配结果。
        -   作用与场景：可搜索反汇编代码中的助记符（比如mov、call）、函数名、注释内容、字符串文本等，比如查找某个API的调用位置，或者搜索包含特定关键词的注释。注意文本搜索的局限是如果同一个数值以不同格式显示（比如10000h和65536），可能无法匹配所有结果。
    3.  立即数搜索(immediate value)
        -   入口与快捷键：Search→Immediate value，快捷键Alt+I，搜索下一个用Ctrl+I。
        -   使用方法：输入要搜索的数值，支持十进制、十六进制（加0x前缀）、八进制（C语言语法），还可以选择是否匹配未类型化的数值。
        -   作用与场景：专门用于搜索指令中的立即数、数据段中的常量，核心优势是无论该数值在IDA中显示为哪种格式（比如十六进制10000h、十进制65536、符号常量AW_HIDE），都能匹配到对应的指令或数据，避免了文本搜索因显示格式不同导致的漏搜问题，适合查找程序中的魔法数、错误码、关键常量。
    4.  二进制 字节序列搜索
        -   入口与快捷键：Search→Sequence of bytes，快捷键Alt+B，搜索下一个用Ctrl+B。
        -   使用方法：在输入框中输入十六进制字节序列，字节间用空格分隔，支持通配符?（代表任意单个字节），比如55 8B?C会匹配所有以55 8B开头的两字节序列。也可以直接输入字符串字面量，IDA会自动按当前编码转换为字节序列，比如输入"test"会搜索对应的ASCII/UTF-16字节。建议勾选Case sensitive避免误匹配。
        -   作用与场景：适合搜索特定的机器码、程序特征码（比如PE文件头4D 5A）、函数序言（比如x86的55 8B EC）、加密数据的特征字节，即使是被IDA识别为数据的未知字节也能精确匹配，是定位关键代码位置的核心功能。
6.  窗口同步:反汇编窗口和Hexdump窗口可以使用窗口同步功能，让Hexdump窗口和反汇编窗口呈现同地址数据
    
    1.  反汇编窗口或者Hexdump窗口 `右键->Synchronize with`
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/323f87d365fdb0e3.png)
        
    2.  选中要具体和哪个窗口同步，之后Hex窗口和反汇编窗口会根据对方的地址自动跳转到相同的地址显示内容
        
    3.  小技巧：可以反汇编窗口或者HexDump窗口拖出来，分析可以更加直观
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/823052493a875f15.png)
        
7.  交叉引用 不管是数据(反汇编窗口) 函数参数还是局部变量(伪代码窗口) 都可以按X键查找其在何处被引用了，非常提高逆向效率
    
    1.  交叉引用注释
        
        1.  代码引用
            
            1.  在有代码交叉引用的注释 会出现如下格式的注释 `CODE XREF: main+57↑j`
                
                1.  格式解析
                    
                    1.  CODE XREF:表示这是一个代码交叉引用
                        
                    2.  main：表示交叉引用的源头地址所在的函数(大部分情况下是 `sub_xxx`)
                        
                    3.  +57:表示源头地址距离函数第一条指令的偏移
                        
                    4.  `↑`:上箭头表示源头地址相对于当前地址，在较低的內存地址处，需要上滚鼠标滚轮才可以到达,下箭头则表示需要下滚鼠标滚轮才可以到达
                        
                    5.  j表示代码引用的具体类型, 该处是jmp类型 其他情况可能是p 表示调用类型
                        
        2.  数据引用
            
            1.  在有数据交叉引用的注释 会出现如下格式的注释 `DATA XREF: .rdata:stru_403680↓o`
                
                1.  格式解析
                    
                    1.  大部分情况和代码引用相同
                        
                    2.  最后的交叉引用类型有其他的表示方式
                        
                        1.  o:偏移量引用，表示引用的是一个地址
                            
                        2.  r:读取
                            
                        3.  w:写入
                            
    2.  交叉引用列表
        
        1.  在可以在局部变量、地址等标识符处按下 `x` ，会弹出交叉引用列表 该列表显示哪些位置引用了该标识符
            
        2.  点击列表中的任何一行，可以跳转到对应地址处进行分析
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c13f195c0c354272.png)
            
        3.  也可以点击上文的交叉引用窗口进行分析
            
8.  地址跳转
    
    1.  IDA中集成了多种多样的jump功能，都被封装在jump菜单栏中 可以按需点击进行使用
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8b67a1c944e5a4fc.png)
        
    2.  最常见的就是在反汇编窗口和Hexdump窗口中按G 进行任意地址跳转
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed878b65cfe8f263.png)
        

## 9\. 动态调试

1.  选择调试器 (Windows本地调试器或者Linux远程调试器) 选择了对应的调试器之后直接点击Debugger->Start process即可
    
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/38794a9d52f52316.png)
    
2.  常用快捷键
    
    1.  执行到断点处 F9
        
    2.  单步步入 F7
        
    3.  单步步过 F8
        
    4.  执行到返回 Ctrl+F7
        
    5.  执行到光标处 F4
        
    6.  添加 删除断点 F2
        
3.  断点调试
    
    1.  软件断点 在伪代码和反汇编窗口下的断点都是软件断点 可以下无数个
        
    2.  硬件断点 先下一个断点 然后debugger-》breakpoints breakpoint list(断点界面) 设置hardware 右键 settings 选中hardware 就是硬件断点了最多下四个
        
    3.  条件断点 一样的界面 编辑condition列就可以设置条件
        
4.  内存数据提取 同静态分析部分一样
    
    1.  数据修改
        
        1.  寄存器 断点断下来之后双击寄存器即可修改
            
        2.  内存 在内存查看窗口里按F2 进入编辑模式 然后再按F2应用编辑
            
    2.  配置命令行参数 打开debugger-》process options 在Parameters一栏写入命令行参数
        
5.  Linux远程调试
    
    1.  根据程序是64位还是32位选择对应的dbgsrv 然后复制到虚拟机中
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6e890da91a2ac785.png)
        
    2.  将要分析的文件也复制一份到虚拟机中
        
    3.  然后输入代码赋予可执行权限 `sudo chmod +x r3` (r3是文件名)
        
    4.  尝试运行r3 `./r3` 发现可以运行
        
    5.  使用命令 `pwd` 查看当前路径
        
    6.  回到windows操作系统打开IDA并将文件拖进去 debugger选择Remote Linux debugger
        
    7.  (顶部工具栏)Debugger->Process debugger 设置参数
        
        1.  Application 文件的目录
            
        2.  input file 文件的目录
            
        3.  Directory 文件的上一级目录
            
        4.  Hostname 虚拟机的IP地址(ifconfig查看)
            

## 10\. IDA插件

1.  安装
    
    1.  [IDA官方插件网站](https://plugins.hex-rays.com/)
        
    2.  IDA存放插件的路径： `IDA下载目录\IDA Professional 9.4\plugins`
        
    3.  不同的插件有不同的具体安装流程，在安装的时候需要具体看插件开发者提供的安装教程，下面就简述安装一个插件的基本流程
        
        1.  IDA官方插件网站中下载插件/github中下载插件
            
        2.  按照官方教程安装插件(最后都有一步将文件拷贝到\\plugins的步骤)
            
        3.  在Edit->plugins中查看插件是否安装成功并使用(不同的插件有不同的使用方式)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/866d6572d77fe001.png)
            
2.  插件推荐
    
    1.  IDA官方插件网站流行程度排序(Most Popular) 从上往下根据需求 挨个装就行
        
        ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/173130dbe3363545.png)
        

## 11\. IDA部分使用技巧

1.  IDA中区分流水线优化:高亮，在没有流水线情况下，高亮的代码块之间的操作数应该连续。如果发现不连续 则可能发生了流水线优化。
    
2.  ida中搜索程序main函数
    
    1.  ida有时候可以自动识别，但是无法识别的情况下可以根据以下方法找
        
    2.  通过 `_exit` 查找，从调用 `_exit` 的位置往前找，前几个函数中就有main(所有版本通用)
        
        1.  IDA,在函数窗口中查找到exit函数(j_exit),然后找交叉引用，到了最顶层之后网上找call指令，点进去看是否有连续三个的push 如果有则是main函数
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0b907e0bdabcb2f0.png)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/71d81e9a94f0ee46.png)
            
    3.  通过参数p_argc找，main会使用p_argc作为参数(高版本才可以用)
        
        1.  IDA，在导入表中找 `_p_argc` ，然后不断查找交叉引用往外跟，找到call j_p_argc或者 call \_p_argc处 紧跟着的就是main
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c485b48cc3a0ae25.png)
            
            ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d36f2076101d910.png)
            
3.  ida流程视图便于理清函数结构
    
    1.  分析程序的箭头，如果是分叉说明是分支结构(if-else switch)
        
    2.  如果是往上的箭头，说明是循环
        
4.  字符串窗口+搜索功能+交叉引用->定位关键API 关键代码段
    
    1.  我们可以在初步分析程序 获运行了程序时 打开string窗口,查看是否有关键的字符串 例如flag 等等，然后就可以双击跳转和交叉引用定位代码块，查看程序的flag判断逻辑等等
