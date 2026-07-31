---
title: 【看雪】一次针对WeGame的BYOVD盗号木马剖析
source: https://bbs.kanxue.com/thread-292247.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-31T10:09:18+08:00
trace_id: 9368b59c-4ad0-444c-9a64-a4d01f4db46d
content_hash: bfc259ef1bb9874a657c71030cd054099a360bc825244c459da57cc009056c4b
status: synced
tags:
  - 看雪
  - Windows逆向
  - 恶意样本
series: null
feed_source: 看雪·逆向工程
ai_summary: WeGame盗号木马通过BYOVD技术借助签名驱动在内核加载恶意模块，扫描进程内存窃取QQ号、密码哈希与令牌并回传黑客服务器。
ai_summary_style: key-points
images_status:
  total: 26
  succeeded: 26
  failed_urls: []
notion_page_id: 3ae75244-d011-815c-a5e5-ca15311e25eb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WeGame盗号木马通过BYOVD技术借助签名驱动在内核加载恶意模块，扫描进程内存窃取QQ号、密码哈希与令牌并回传黑客服务器。
> 
> - **环境检测：** 样本通过进程快照检查wegame.exe和rail.exe是否运行，确保用户已登录WeGame，解密字符串中包含xclient.exe等网吧程序名。
> - **反射式DLL加载：** 主程序从云存储下载恶意DLL，使用反射注入技术避免LoadLibrary等API监控，DLL仅存在于私有内存而不出现在模块列表。
> - **白驱动利用：** 恶意DLL释放带Microsoft签名的合法驱动，通过其设备通信接口传入加密的恶意驱动数据；白驱动内核中采用RC4解密（密钥: dsmjklsafbv）后手工映射PE，完成内核级反射加载。
> - **凭证窃取：** 恶意驱动扫描WeGame内存，定位硬编码特征"uin":"以获取QQ号，并提取pass、stpass、token等认证信息。
> - **数据外传：** 将窃取的敏感信息加密打包，发送至黑客控制的远程服务器。

近日，我司例行检测中，捕获到一个针对WeGame游戏平台的新型窃密样本，该样本行为隐蔽、对抗性强，安全团队第一时间启动应急分析，通过分析，完整还原了该木马的窃密逻辑。

该盗号木马通过白驱动加载黑驱动的方式，借助内核级反射式PE加载技术加载恶意驱动，读取WeGame数据；本文将对样本的逆向过程与技术细节进行深度拆解。

系统日志记录如下，cli2update.exe 为盗号木马的主程序。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ef4fa70d2db1dfb7.webp)

样本的SHA256如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b8c3a524a05b3296.webp)

样本启动后，并不立即执行恶意行为，而是校验运行环境。先通过进程快照（ CreateToolhelp32Snapshot ）的方式检查 wegame.exe 是否运行。若未发现WeGame进程在运行，则进入休眠轮询状态。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0b9b19ad0cf1a671.webp)

在确认进程存在之后，样本进一步验证用户登录状态，确保受害者已经成功登入，检测到 rail.exe 进程存在。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/20c5e7bcf3fbab4c.webp)

调试发现，该样本也内置了xclient.exe网吧安全程序的字符串信息，这些字符串同样加密，并在运行时动态解密。在解密函数的结尾下断点可以看到解密后的字符串内容，如图所示：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e348850e7d615217.webp)

解密后的进程字符串清单如下，包括：

xclient.exe,

xcomw.exe,

xcomu.exe,

ACE-Tray.exe,

等进程。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0f468acac79b9ef0.webp)

在信息收集结束并且环境检测也通过后，样本从云存储下载一个大小为 3783680 字节的恶意DLL。样本使用反射加载技术，在自己的进程空间中通过反射注入的方式加载这个DLL。全程避免LoadLibrary等监控点触发，具有明显的反分析意识。这个DLL最终会出现在程序的私有内存中，并不会出现在模块列表中。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e9f61fc3e121eb3c.webp)

该恶意DLL导出了一些核心函数，是盗号的主要依赖技术。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/58082affd6d6b17e.webp)

待恶意DLL加载完毕，该样本调用恶意DLL的导出函数 HD_DriverLoad，该恶意DLL在Temp目录下释放了一个带有Microsoft Windows Hardware Compatibility Publisher有效签名的合法驱动文件，并使用随机字符串命名这个文件。由于驱动带有有效签名，此驱动会被顺利地加载进内核空间中。

然而，该合法驱动的真正用途并非直接进行恶意行为，而是充当一个内核代码加载器。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/27710b7a90716c63.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6cec66d6d95df6c9.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5133dc48b2d24964.webp)

逆向该合法驱动发现，其 DriverEntry 中通过 IoCreateDevice 创建设备对象，并提供一个通信接口，其实现存在极高风险——它接受用户态传入的输入缓冲区，将其解释为一个加密的PE文件，然后在内核中执行解密与加载。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cac8a36124ef7787.webp)

如图所示，分发函数中会调用PsCreateSystemThread创建一个系统线程，将解密和加载逻辑置于该线程中执行。逆向分析确定该解密算法为 RC4 流密码（Rivest Cipher 4），密钥硬编码于驱动中，密钥为：dsmjklsafbv

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3c5d85c761025b33.webp)

白驱动在非分页内存池中申请空间，将解密后的PE镜像按照其节表进行映像，手工处理重定位及导入表。此种技术即为内核模式下的反射式加载。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/aa5299aef242735b.webp)

在用户态，盗号木马的恶意DLL通过 CreateFile 打开合法驱动的设备对象，并调用 DeviceIoControl，将一个加密的恶意驱动文件数据作为输入缓冲区传入。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/eddf347ba8ebbf6a.webp)

该恶意驱动文件本体同样被加密，左侧为传入的原始加密数据。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/46771dbea999820a.webp)

在解密之后，恶意驱动的基本信息如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/84febe25b29ce2b0.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/40872cc9b4b2ee91.webp)

当恶意驱动加载起来之后，盗号木马就可以任意读取所有进程的内存了。

盗号木马首先解密出需要调用的导出函数字符串名称，然后通过自己实现的GetProcAddress函数，用来获取恶意DLL的导出函数地址，通过直接调用导出函数来控制恶意驱动读取WeGame的内存。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d4ed63d7495cb9cd.webp)

凭证窃取的第一步是获取受害者的QQ号码。分析显示，木马在WeGame进程内存中扫描一个硬编码的二进制特征码：22 75 69 6E 22 3A 22，其ASCII字符串为 "uin":。WeGame客户端在登录后会将当前登录的QQ号码以JSON片段形式存储在堆内存中，该特征码正是定位账号字段的关键标识。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0196b468e0da1286.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7fb42e946405ec39.webp)

根据特征码在WeGame内存中的搜索结果如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/608ef3270343c46c.webp)

接着获取用户的密码哈希，会话令牌等敏感信息（pass, stpass, token），用于后续免密登录及服务鉴权。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b251c61973710bc4.webp)

这些信息同样可以在wegame.exe进程的内存中找到。

PASS:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/283ab59218e35be8.webp)

STPASS:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0cbdb56d51f1a102.webp)

TOKEN:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1c351991036e3e74.webp)

在拿到这些信息之后，盗号木马这些信息加密并打包发送给黑客服务器。

## 二、IoCs

## 三、处置建议与防护方案

1.源头管控：确保网内所有商业核心软件均来自正版合规厂商，勿使用盗版、破解版或来源不明的“免费版”商业程序。从源头建立可信供应链是防御根基。

2.终端加固：部署安全软件，并实时更新，有效拦截反射加载、白驱动利用等高级攻击手法。
