---
title: 【微信】再战MuMu模拟器：改完能启动，为什么几分钟又崩了？
source: https://mp.weixin.qq.com/s/crLFEWfcZq6sYgUmYsaFNg
source_host: mp.weixin.qq.com
clip_date: 2026-09-23T17:24:51+08:00
trace_id: c588047f-2f67-4fa6-a143-7a106e6d2145
content_hash: fac14d2955c1ce20d049327e0720be74343027c9e6f903dae7f261c446a502d7
status: synced
tags:
  - 微信
  - Android逆向
  - 模拟器逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：MuMu 1.9.2（Apple Silicon，构建 1009002000）闪退的根因不在播放按钮本身，而在安卓系统多个组件的异常动作分发逻辑；仅改启动判断只能让窗口多活约 3 分钟。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-8155-8af7-d5c9c2763946
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：MuMu 1.9.2（Apple Silicon，构建 1009002000）闪退的根因不在播放按钮本身，而在安卓系统多个组件的异常动作分发逻辑；仅改启动判断只能让窗口多活约 3 分钟。
> 
> - **启动双点补丁：** MuMuPlayer 与 MuMuEmulator 各有一处启动状态判断，RVA 分别为 `0x6f90c0`、`0x686248`，均以 `mov w0,#3; ret`（机器码 `60008052c0035fd6`）覆盖原 8 字节 `fc6fbca9f65701a9`；只改第一处窗口仍会退出。
> - **22000 的真实来源：** 安卓内核 `Kernel panic - not syncing: Attempted to kill init! exitcode=0x00007f00`，调用栈 `PropertySet → std::thread::~thread → std::terminate → abort`；uprobe 在 180.57 秒捕获 vold 写入 `<随机前缀>xnemu="1"`（调用点 RVA `0x1b5da4`）。
> - **五个组件需分别处理：** vold `0x1b5864`、mediaserver `0x3fb564`、nemuinit `0x19cdc0`、libandroid_runtime.so `0x4a1008`、libandroid_servers.so `0x38b868`，将动作回调首指令 `fd7bbca9` 换成 `ret`；不同轮次分别在第 180、233、365 秒暴露下一条未覆盖路径。
> - **登录需完整 Swift 值：** `User?` 240 字节、`UserData?` 488 字节，经 `x8` 间接返回，不能只回传 `x0` 指针；`LoginStatus` 需返回 `completeLogin=5`；主程序、模拟器进程与 `mumu-cli` 共 12 处账号位置，User getter RVA 各为 `+0x703b50`、`+0x690dbc`、`+0x27de48`。
> - **工程化与边界：** 补丁放入宿主后台线程，核对 PID/UUID/原始字节并回读，写后刷新指令缓存；未用 Dobby。仅实现本地账号、免登录与资源自包含，未完成全断网与网络审计；副本为 ad-hoc 签名、签名已变，最长验证 uptime 634.40 秒。

# 再战MuMu模拟器：改完能启动，为什么几分钟又崩了？

原创 心态与度量 心态与度量 随心记事

_2026年9月23日 16:59_

在小说阅读器读本章

去阅读

在公众号小说中沉浸阅读

**从窗口一闪而过，到 Swift 用户模型，再到双击即用的独立 App。**

![⚠️ 图片托管失败 · 图片](https://mmbiz.qpic.cn/mmbiz_png/ib6PGXfLnjAMn5KIvyx6mB54YtiafS7br7KAkc8mRCAYducWz6QmFu1p8JyZnrfgXHGuribEO4lluyaFZpS8zRW3YFHFKJicnKS6xXhXtrIXJDw/640?wx_fmt=png&from=appmsg&watermark=1&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=0)

点击播放，窗口出现，然后瞬间消失。。。

找到判断，改掉，窗口终于留下来了。安卓桌面亮起，鼠标也能点。

我以为最难的部分已经结束。

三分钟后，整个安卓设备失去响应。屏幕中央只剩一句话：

> 安卓设备进程无响应。错误码：22000。

这是这次 MuMu 逆向里，第一个真正有意思的转折。

沿着它继续追，问题从 macOS 上的启动判断，进入安卓的属性服务，再进入多个系统组件中的异常动作分发逻辑。等设备终于能继续运行，另一个问题又出现了：界面明明已经显示“已登录”，启动接口却仍然返回 `invalidUser`。

最后做出的东西，也从几条临时补丁，变成了一个包含引擎、基础镜像和本地用户模型的独立 App。

这篇文章按实验发生的顺序，把证据、失败尝试和实现细节展开。对象是本次本地 CTF 环境中的 **MuMu 1.9.2，构建号 1009002000，Apple Silicon 版本**。文中的地址和结构布局只对应这个精确构建。

先交代成果的边界：我们实现了本地模拟账号、免登录启动、已定位故障路径的处理，以及单 App 封装；**没有完成全断网测试，也没有证明所有网络依赖都已经消失。**

“把启动链本地化”是已经做出的结果。“彻底离线版”还需要另一组证据。

## 01｜播放按钮后面，远不止一个进程

面对这种问题，最容易产生的冲动，就是搜索“会员”“登录”“启动失败”，找到附近的条件分支，然后把它改掉。

但窗口一闪而过，至少存在几种完全不同的解释：主程序拒绝启动、子进程主动退出、运行时加载失败，或者安卓已经启动但很快崩溃。

它们在用户眼里很像，在代码里却隔着几层边界。

本次实验里，需要分别观察三个 macOS 程序，以及它们启动的安卓系统：

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

图1：播放按钮背后的三层观察对象与检查重点

_图 1｜沿着橙色箭头，从控制室查到虚拟机，再进入安卓工厂。图中是排查层级，不代表所有箭头都是实际进程创建关系。_

\*\*照着图查：\*\*窗口消失时，先确认 `MuMuEmulator` 是否还在；宿主还在而画面无响应，再检查设备状态和安卓日志。把现象落到具体层级，后面的地址分析才有方向。

静态分析侧，我用 LIEF 解析 Mach-O，用 Capstone 查看 ARM64 指令和直接分支引用，再结合 Swift 元数据和 Objective-C 运行时可见的类型定位功能。动态侧则对照宿主进程、CLI 状态、安卓日志和内核日志。

首先确认的一件事是：**主程序放行，不等于模拟器子进程放行。**

在这个构建里，主界面与模拟器进程分别存在启动相关的状态判断。只处理第一处，窗口仍然会出现后退出。

最终核对的两处相对映像地址是：

程序

RVA

MuMuPlayer

`0x6f90c0`

MuMuEmulator

`0x686248`

实验中的替换指令为：

`mov w0, [#3](javascript:;) ret `

对应的 ARM64 小端机器码是 `60008052c0035fd6`。两处被覆盖的原始 8 字节都经过核对：`fc6fbca9f65701a9`。

这里的 `3` 是本构建中实验采用的状态返回值，不能脱离调用方，把它解释成一个通用的“会员开关”。后面遇到的登录状态，又是另一套枚举。

两处处理后，设备第一次真正进入了桌面。

然后，第 180 秒的问题来了。

## 02｜22000 是结果，真正的线索在时间线上

看到“进程无响应”，很自然会怀疑：是不是补丁停止了？是不是 macOS 验签没有通过？

我先把这些猜测放回时间线里。

其中一次运行，宿主心跳从 **23:31:11** 起已经超时，人工关闭操作发生在 **23:34:52**。故障在前，关闭在后，不能把后面的关闭动作解释成最初失去响应的原因。

同时，原应用的磁盘文件签名检查仍然通过。

这还不能排除所有运行时校验，但至少说明，“磁盘签名被改坏了”没有得到这组证据支持。

安卓内核日志给出了更具体的方向：

`Kernel panic - not syncing: Attempted to kill init! exitcode=0x00007f00 `

相关调用栈落在下面这条路径上：

`PropertySet   → std::thread::~thread   → std::terminate   → abort `

这一次，宿主窗口里的 22000 对应的是安卓系统内部已经发生的严重故障。继续盯着播放按钮，就会错过真正的执行路径。

接着，我把 uprobe 与日志放在一起看。uprobe 提供了用户态执行点的动态证据，日志补上属性值、服务动作和后续系统状态。

在一次实验的 **180.572457 秒**，捕获到了 `vold` 的属性调用：

`进程：vold 属性名：<随机前缀>xnemu 属性值："1" `

对应的调用点相对地址为 `0x1b5da4`。

随机前缀被省略了。对理解问题有价值的是调用者、后缀、属性值，以及它与故障发生的时间关系。

到这里，调查方向已经从“某个按钮是不是没改干净”，变成了“谁在触发安卓内部的异常动作”。

## 03｜挡住一次崩溃，只是把下一次崩溃放了出来

最初尝试，是处理 `init` 中已经观察到的特殊属性分支。

结果很有迷惑性：设备确实越过了原先的失败时间点。

但在另一轮实验的 **约 232.77 秒**，后续动作继续发生：停止 `surfaceflinger`、停止 `adbd`，以及通过 sysrq 路径触发内核崩溃。

这说明异常处理不只有一种落点。阻止属性分支，不能阻止同一套逻辑继续采用其他动作。

随后，把处理位置前移到 `vold` 中已经确认的动作回调。设备又多运行了一段时间。

直到 **约 364.78 秒**，`mediaserver` 再次触发了同类故障。

注意，这三个时间点来自不同实验轮次，不是同一次开机依次发生了三次完整崩溃。它们记录的是每次修改之后，下一条未覆盖路径暴露出来的时刻。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

图2：不同实验轮次在约180、233和365秒暴露的故障路径

_图 2｜三格漫画分别代表三轮实验。每次从新起点出发，遇到的路障也不同。_

\*\*照着图查：\*\*每次实验都记下 boot ID、宿主 PID、首次异常时间与最后一次补丁修改。比较两轮结果时，先确认比较的是同一条故障路径，还是另一条新暴露的路径。

继续做静态对照后，最终定位到五个包含对应动作分发逻辑的组件：

组件

本构建中的目标回调 RVA

`/system/bin/vold`

`0x1b5864`

`/system/bin/mediaserver`

`0x3fb564`

`/system/bin/nemuinit`

`0x19cdc0`

`libandroid_runtime.so`

`0x4a1008`

`libandroid_servers.so`

`0x38b868`

最终处理的是已经检查过的动作回调，让它直接返回。原始首条指令字节为 `fd7bbca9`，替换成 ARM64 的 `ret`：`c0035fd6`。

这个结论依赖前面的函数分析：目标是特定的动作回调，不能把任意系统函数的开头都替换成 `ret`。正常服务入口、需要返回有效对象的函数、承担锁释放或资源清理的函数，都可能因为这种处理产生新问题。

最终版本也没有继续修改 `init` 的状态字节。

但仍有一处空白必须保留：**我们确认了这些异常动作的执行路径，没有证明上游究竟是哪一个校验条件触发了它们。**

所以文章能写“定位并处理了观察到的故障路径”，不能写成“已经完整还原全部反篡改机制”。

## 04｜让补丁跨过下一次重启，比让它生效一次更难

第一次验证地址时，可以手动查看进程映射，再验证某条指令。

要把它交给另一个人双击使用，就必须面对几个更现实的问题：地址会变、进程会重启、PID 会复用，设备也可能同时开了不止一个。

因此，最终的安卓处理逻辑被放进模拟器宿主的后台线程，按下面的顺序执行：

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

图3：从设备身份到修改回读的五步核对流程

_图 3｜跟着代码方块走过五道关卡；不匹配的目标走红色停止分支，通过回读才算完成。_

\*\*照着图查：\*\*先从 CLI 取得当前设备的 ADB 端口，并核对宿主 PID；读到目标地址后先比原始字节，写完再回读。若版本或字节不匹配，应停止对该目标写入，回到定位阶段。

这里每一步都在收窄“我到底正在修改谁”。

宿主进程确认，防止连错设备；文件哈希确认，防止把旧版本地址用于新文件；原始字节确认，防止地址计算错误时仍然写入。

映射解析也有前提：当前实现使用这些已检查 ELF 的零文件偏移映射推导基址，再加目标 RVA。换一个 ELF 布局，需要重新验证映射与虚拟地址的对应关系，不能机械地拿 maps 第一行相加。

后台线程还记录进程启动时间，避免“PID 相同”被误当成“还是刚才那个进程”。安卓 boot ID 改变后，则清空旧状态，重新核对组件。

初始化阶段每条子命令有 5 秒上限，整体初次等待最多 120 秒。进入正常跟踪后，每 15 秒检查新进程或服务重启。

这是有间隔的检查，不是实时、无竞争窗口的监控。它在本次实验中覆盖了观察到的启动过程，不能因此推导出对任意时序都可靠。

早期完整验证中，五个组件对应了 25 处进程映射。后续启动也观察到 26、27 处。**文件数量、进程数量和映射数量不是同一个指标**，不能只数“找到了五个文件”就宣布全部生效。

## 05｜界面已经登录，接口为什么还说 invalidUser？

设备能启动之后，我开始做本地账号。

初看很简单：个人中心换成固定姓名和 ID，隐藏登录与购买入口，再让登录状态返回成功。

但自动启动接口给出了另一个答案：

`invalidUser `

问题在于，调用方使用的不只有一个“是否登录”的布尔值。

这个构建里，需要分别理解 `User`、`UserData`、账号响应和当前设备响应。最初只提供 UID、token，而没有完整的用户资料，启动接口仍然不接受。

沿着 Swift 类型元数据、字段描述和 getter 继续分析后，才能把需要提供的数据组织起来：用户标识、账号资料、当前设备、设备状态，以及调用方读取的其他字段。

Swift 在这里增加了一层门槛：源代码中的一个结构体，不是往内存里放一段 JSON 就能替代的。

在本次检查到的布局里：

返回类型

观察到的存储大小

`User?`

240 字节

`UserData?`

488 字节

这两处 getter 使用间接返回：调用方提供结果缓冲区，地址通过 `x8` 传入。

因此，替代实现必须把完整结果写进调用方的存储区，而不是简单地把一个指针放进 `x0`。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

图4：Swift间接返回中的x8缓冲区和两种结果大小

_图 4｜调用方给出 `x8` 指向的空箱，getter 搬入数据块；指针与返回值数据承担不同角色。_

\*\*照着图查：\*\*观察调用前如何准备 `x8`，以及调用后如何读取结果，再结合字段描述核对大小。不要只看函数名字像 getter，就假定它通过 `x0` 返回一个对象。

下面是 `User?` 返回桩的核心逻辑，省略了标签导出和对齐声明：

`ldr  x9, fixture_pointer mov  x10, [#15](javascript:;) copy_loop:     ldr  q0, [x9], [#16](javascript:;)     str  q0, [x8], [#16](javascript:;)     subs x10, x10, [#1](javascript:;)     b.ne copy_loop     ret `

15 次，每次 16 字节，正好写入 240 字节。`UserData?` 则复制 480 字节后，再写入最后 8 字节。

这段代码只是返回约定的一部分。更难的是，准备好的那块内存，必须真的是当前调用方能够正确读取、复制和销毁的 Swift 值。

例如：

-   `Optional.none` 的表示需要按具体类型确认，不能假定都是全零。

-   字符串有长度和表示方式；中文名字不能直接塞进一个用于短 ASCII 的构造函数。

-   数组和引用类型牵涉对象生命周期，伪造一个普通地址可能在 retain/release 时崩溃。

-   返回值大小、字段偏移和嵌套结构只对已验证的构建成立。


本次本地数据尽量使用已核对的内联短 ASCII 字符串；需要的空数组，引用 Swift 运行时提供的 `_swiftEmptyArrayStorage`。中文展示名称在 AppKit 界面层设置，避免把展示文案硬塞进内部短字符串布局。

补齐本地账号和设备资料，再让独立的 `LoginStatus` getter 返回本构建中的 `completeLogin = 5` 后，启动接口才真正接受了这套数据。

前面启动判断里的 `3`，和这里登录状态里的 `5`，至此也有了明确的区别。

## 06｜三个程序，必须读到同一个本地用户

还有一个容易漏掉的角色：`mumu-cli`。

如果主程序和模拟器进程读到的是本地用户，而 CLI 仍沿用另一套账号读取逻辑，自动启动和后台设备查询就可能出现不一致。

因此，三个程序分别处理四个位置：

`User getter UserData getter LoginStatus getter 用户缓存键 `

总计 12 个本地账号相关的位置。这里给出 `User getter` 的三个 RVA，方便理解同一套逻辑如何出现在不同二进制里：

`MuMuPlayer    +0x703b50 MuMuEmulator  +0x690dbc mumu-cli      +0x27de48 `

每个目标分别按自己的 Mach-O UUID 和原始字节校验，不能因为类型名称相同，就跨程序复用地址。

最终本地 ID 统一为 `Remember-Things`，模拟器进程的 `--user_id` 也同步到这个值。另一个不透明的启动参数 `--a` 没有因为“看起来像编码串”就被替换掉。

缓存也单独处理：本地模拟数据的潜在写入，使用 `ctfUser` 命名空间，保留原账号缓存。一次验证中，对原缓存的 8 个条目逐项比较，结果保持一致。

账号一致性建立之后，再处理界面：替换个人中心，整理账号菜单，隐藏购买和登录入口，并处理旧购买窗口与 WebView 的显示、导航方法。

最终展示为：

`公众号：随心记事 ID：Remember-Things 特权版本 此版本已特权，仅供学习使用，请24小时内删除 `

这些是本地展示内容，不是服务端签发的账号或交易凭证。最后一句也是文案，没有实现定时删除设备或文件的行为。

## 07｜没有用 Dobby，也能完成这次补丁；但不能泛化

最初讨论过 Dobby、dylib 和直接二进制补丁。它们其实不处于同一个层次。

Dobby 是 Hook 实现工具；dylib 是代码载体；二进制补丁描述的是修改落在哪个阶段、哪个位置。

这次最终没有引入 Dobby。原因比较具体：目标构建固定，需要替换的函数已经定位，多处目标采用完整替代返回逻辑，不需要保留原函数继续执行的 trampoline。

宿主代码的运行时处理顺序是：

`确认映像与 UUID → 核对待覆盖指令 → 计算页边界 → 临时改变内存页权限 → 写入替代指令 → 刷新指令缓存 → 恢复 RX 权限 `

ARM64 上，写入数据以后不能忽略指令缓存处理。按页修改权限时，也不能把跨页长度当作一条指令的长度来处理。

这种做法适合本次已经核对的具体目标。遇到需要重定位被覆盖指令、保留原函数调用、处理复杂分支或指针认证约束的场景，需要重新选择实现方式，不能把这里的返回桩包装成“万能 Hook”。

## 08｜原签名没变，和复制给同事就能用，是两道题

早期方案是外部启动器加载 dylib，只改变进程内存。

它保留了 `/Applications/MuMuPlayer.app` 的磁盘内容。三个官方可执行文件的 SHA-256 没变，原应用的深度严格签名验证也通过。

但这只能说明原安装没有被修改。

它不能回答另一个问题：换一台 Mac，是否允许同样的加载方式？

实验机的 SIP 原本关闭。在这个环境里跑通，不能直接外推到默认安全配置的机器。

当需求变成“复制一个 App 给同事，双击就启动”，工程方案也必须跟着变。

最终的独立包结构是：

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

图5：独立App的内置引擎、补丁加载和首次启动流程

_图 5｜引擎、工具和镜像装进同一个行李箱。带到另一台电脑后，仍需检查运行环境与首次安全提示。_

\*\*照着图查：\*\*用加载命令确认 dylib 路径，用 `lsof` 核对实际打开的镜像和库，再把 App 换一个目录启动。仅把外部补丁复制进包里，还不能证明程序正在使用它。

实际包内，启动器位于 `Contents/MacOS/MuMuLocalLauncher`；内置引擎位于 `Contents/Resources/Engine/MuMuPlayer.app`。模拟器和基础镜像继续保留在内置引擎的子 App 中。

对副本中的三个目标 Mach-O，加入显式的 `LC_LOAD_DYLIB`，引用：

`@executable_path/../Frameworks/libmumu_ctf_v192.dylib `

这样，补丁成为随程序加载的依赖，不再需要外部的 `DYLD_INSERT_LIBRARIES`。

构建时先检查加载命令后的空间是否足够、是否为可用填充，再添加命令，保留已经分析过的代码布局。CLI、ADB 和基础镜像的定位也改为从内置 App 推导，避免把开发机的绝对路径带到同事电脑上。

然后，由内向外重新签名。

这一版必须说清楚：\*\*副本的代码签名已经改变。\*\*原官方安装仍然保留，但不能继续声称交付出去的修改副本也保有原签名。

本次副本采用 ad-hoc 签名，并为相关进程设置运行时补丁需要的权限例外。Apple 对内存补丁、库加载与 Hardened Runtime 的关系有明确说明；这些例外作用于程序，不等于关闭整个系统的 SIP。Apple：内存权限、库验证。

还有一个非常容易误判的检查结果：本机 `spctl` 返回过 `accepted`，但后面同时写着：

`override=security disabled `

只截前一行，就会制造一个错误结论。

它不能证明这个包已经通过默认 Gatekeeper 检查。当前副本没有 Developer ID 分发签名，也没有 Apple 公证；在另一台机器上，首次打开仍可能出现安全确认。面向默认安全配置的常规分发，需要单独完成签名、公证和目标环境验证。Apple：Developer ID、首次打开检查。

## 09｜双击即用，需要把第一次启动也做完

一个 App 能在开发机上打开，可能只是因为开发机早就准备好了账号、设备和路径。

为了接近真正可交付的状态，启动器还需要负责第一次运行：

1.  检查内置程序完整性，确认本地用户组件已经就绪。

2.  查询设备列表；没有设备时，使用包内基础镜像创建一台设备。

3.  为当前安卓补丁准备所需的安卓 root 配置。

4.  启动设备，等待宿主状态和画面就绪。

5.  隐藏设备列表，显示安卓窗口，然后让启动器自行退出。


本次空白设备使用 4 核、4 GB 内存。这里开启的是安卓设备的 root，不是 macOS root。

对已有设备则保持克制：优先使用现有设备，不重置它的数据；遇到另一个版本正在运行，提示正常退出，避免两个管理进程争用同一份设备状态。

还做了一个很实际的验证：用 `lsof` 查看宿主真正打开的文件。

确认补丁 dylib 和基础 `system.qcow2` 都来自独立 App 内部，才能证明程序没有悄悄借用开发机上的官方安装。

包里也没有复制我的用户数据盘。空白设备启动后只有基础预装内容，用户数据在接收方电脑上生成。

最终，App 从构建目录移动后仍能启动，又安装到了 `/Applications/MuMu Local.app`，实际进程路径和安卓桌面都做了核对。

## 10｜“离线化”究竟完成了哪一部分？

做完本地账号和自动启动，很容易把文章标题写成“彻底离线”。

但要回答离线问题，至少应该区分三件事：

目标

本次结果

启动时不再依赖真实账号读取和交互式登录

已实现本地用户模型与免登录启动

启动引擎、工具和基础镜像随包携带

已实现，并核对实际文件来源

从第一次运行开始全程断网，仍完成创建、启动及持续使用

尚未完成验证

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

图6：本地账号、资源自包含与全断网验证的区别

_图 6｜前两个平台已经完成，第三个实验室仍挂着问号；本机 hosts 路牌不等于全断网验证。_

\*\*照着图查：\*\*先写清准备验证哪一层，再设定环境。若要证明全离线，就应在第一次启动前隔离外部网络，同时保留连接记录；只在桌面启动后断网，覆盖不到首次创建与初始化依赖。

本次没有把所有网络接口替换掉，也没有完成更新、遥测、资源获取等路径的网络审计。安卓内第三方应用的联网能力与账号系统，更不在这次修改范围里。

实验机还存在一条既有 hosts 配置，将 `api-pro.mumu.163.com` 指向回环地址。本轮没有修改它，也没有在移除这条配置的干净环境中完成对照实验。它同样意味着：不能把这台开发机上的成功启动，直接推广成“任何电脑都已经摆脱所有在线依赖”。

所以目前最准确的叫法是：**本地账号驱动、自包含的启动版本。**

如果继续做严格离线化，下一轮实验应当从干净环境开始，在首次启动前就阻断外部网络；同时记录连接尝试，区分宿主、CLI、安卓系统和第三方应用发起的请求。

然后逐项验证：首次创建设备是否依赖下载，登录或设备刷新失败会不会改变运行状态，离线重启是否仍正常，较长时间运行是否出现新的延迟路径。

如果确实发现某个必要流程依赖网络响应，再分析它的请求与消费方，为它设计本地替代数据。直接把所有请求都改成“成功”，可能只会制造下一处缺字段、状态不一致或解析崩溃。

上面这些是下一阶段的方法，不是本次已经完成的战绩。

## 11｜把验证记录摊开，才能知道到底“拿下”了多少

这次保留了几组不同阶段的验证结果：

阶段

记录到的结果

早期完整安卓修复

uptime 到 634.40 秒，目标组件和映射回读正常

后续 UI 与用户参数版本

uptime 到 420.80 秒，共 14 次采样

免登录与自动进入版本

uptime 到 407.97 秒，共 9 次采样

独立包的空白设备

4 次采样，最后 uptime 为 138.16 秒；之后设备不再存在，验证终止

最新文案与 ID、安装目录

核对启动、实际进程路径、ID 和个人中心文字

早期成功采样覆盖了此前观察到的约 180、233、365 秒失败时间点。判断依据也不只是“桌面还亮着”，还包括 boot ID、宿主 PID、`sys.boot_completed` 和目标指令回读。

但是，634 秒不能冒充 24 小时稳定性；早期版本的 634 秒，也不能算到后来每一个改版头上。

此外，还遇到过一次独立的 `Scudo invalid chunk state`，调用路径涉及 `nemuinit → OperationSet::startLocal → ProxyOperation::~ProxyOperation`，随后设备重启。

它与前面的 init/sysrq 故障不同。后续验证没有复现，但根因并未证明。这条记录应该保留，不能因为最终桌面能打开，就从复盘里删掉。

到这里，“拿下 MuMu”对这次实验有了具体含义：在一个精确构建上，拆清启动相关的多进程边界，定位已观察到的安卓故障动作，提供调用方能接受的本地用户值，再把它们组织成可启动的独立副本。

过程里最有价值的时刻，往往都发生在“看起来已经成功”之后：窗口留下来，才看见第 180 秒；越过第 180 秒，才看见另一条路径；界面显示登录，才发现调用方需要完整的 Swift 值。

如果当时在第一次亮起的安卓桌面前停下来，这次实验只会留下一个很漂亮、也很短命的截图。

—— 🫡 向探索者（我自己）致敬

* * *

**技术资料**

资料 1：Apple：Allow Unsigned Executable Memory

资料 2：Apple：Disable Library Validation

资料 3：Apple：Developer ID 分发

资料 4：Apple：在 Mac 上安全打开 App

具体实验数据来自本次保存的日志、`patch-points.json`、用户模型实现、运行时补丁源码与分阶段验证记录。本文没有附带真实账号缓存、启动令牌或用户虚拟机数据。

**成果展示**

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

预览时标签不可点

**微信扫一扫赞赏作者**喜欢作者

逆向分析 · 目录

#逆向分析

上一篇\[小记\] 学习 MuMu模拟器 x-param-sign 响应验签链绕过

作者提示: 个人观点，仅供参考

留言

暂无留言

1条留言

发消息

  写留言:

微信扫一扫
关注该公众号

知道了

 微信扫一扫
使用小程序

取消 允许

取消 允许

取消 允许

![⚠️ 图片托管失败 · 作者头像](http://mmbiz.qpic.cn/mmbiz_png/BfOib3dGxj5RDwaiaCtREjkDndTuJgxIsYnOthBr5RkKJiaEicUYHibRWxyTxrGUOpbuQ9DsqEX05xIr43YaXK1fvpQ/0?wx_fmt=png)

微信扫一扫可打开此内容，
使用完整服务

![⚠️ 图片托管失败](https://mmbiz.qpic.cn/mmbiz_png/BfOib3dGxj5RDwaiaCtREjkDndTuJgxIsYnOthBr5RkKJiaEicUYHibRWxyTxrGUOpbuQ9DsqEX05xIr43YaXK1fvpQ/0?wx_fmt=png)

随心记事

,

选择留言身份
