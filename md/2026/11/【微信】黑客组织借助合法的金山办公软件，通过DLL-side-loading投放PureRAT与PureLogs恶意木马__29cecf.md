---
title: 【微信】黑客组织借助合法的金山办公软件，通过DLL side-loading投放PureRAT与PureLogs恶意木马
source: https://mp.weixin.qq.com/s/bkBOfOYxQq_jYn2rPvysMA
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T14:00:47+08:00
trace_id: 1da5f320-5964-437c-9767-a9d574ef4eb1
content_hash: e483dd88c12eaece4baaeda62d3a7e9edcb369580883c83f9c2660dddb2736f6
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
notion_page_id: 42375244-d011-813b-a697-e5bab160d088
ioc:
  cves: []
  cwes: []
  hashes:
    - d9301f099d9dd27cc9a1c190e40719cfaff77f65
  domains: []
  tools: []
  techniques: []
---

**白泽安全实验室** *2026年11月23日 17:07*

近日，网络安全研究团队监测到一条多阶段恶意投递链。攻击者以合法软件作掩护，用恶意 ZIP压缩包作为初始载体，诱骗用户下载解压。压缩包内预置了基于DLL side-loading的载荷。攻击过程结合文件扩展名伪装、密码保护压缩包、多层Python混淆解码等手段，最终释放PE载荷，投递PureLogs与PureRAT。

**一、事件概述**

此次攻击 是 以货运包裹查验为诱饵，投放名为 Shipment_Condition_And_Check_mp4.zip的恶意压缩包作为初始载体。压缩包内包含有有效数字签名的金山办公合法程序wpspdf.exe。攻击者将其重命名为Shipment_Condition_And_Check_mp4.exe，利用该程序从同级目录侧加载恶意DLL文krpt.dll ， 走的是 DLL side-loading 技术手段 。由于该程序属于金山办公正常组件，仅凭签名和哈希信息很难判断它有问题。

恶意 DLL加载后，攻击流程依次推进：先打开诱饵PDF，再调用伪装成PNG的WinRAR命令行程序解压密码保护压缩包；随后在C:\\Users\\Public下启动重命名为MicrosoftEdgeUpdate.exe的Python运行环境。该Python程序通过-c参数执行单行命令，对后缀为.pdf的文件做XOR解码，并调用exec()执行解码后的内容。这个.pdf文件只是后缀伪装，实际是编码后的Python脚本。第二阶段脚本继续用Base64与XOR解码还原最终PE载荷。载荷运行后回连到与PureLogs、PureRAT攻击活动关联的C2基础设施。

攻击者的 核心手法是滥用可信合法组件来规避检测。攻击者 通过 选用带有效签名的金山办公程序作为加载载体 ， 利用 程序本身没有恶意逻辑，签名和哈希也没有恶意特征， 能够 容易绕过静态 安全 检测。同时，攻击者对 WinRAR命令行工具、Python解释器做文件名和扩展名伪装，把恶意脚本伪装成PDF，形成多层嵌套链路 ， 传统基于文件特征的防护很难还原完整攻击链。 攻击者 本次投放的 PureLogs、PureRAT属于MaaS（恶意软件即服务）工具，具备信息窃取、远程控制能力。主机一旦失陷，攻击者可窃取敏感数据、远程操控终端，对企业办公主机构成严重安全威胁。整条攻击链路从文件释放到多阶段载荷启动，仅耗时数秒，攻击节奏快，隐蔽性较强。

**二、攻击链技术详细分析**

**（ 1）初始投递与DLL side-loading**

ZIP 文件 解压后，在用户 Downloads目录下生成同名嵌套文件夹Shipment_Condition_And_Check_mp4。内层文件夹中有重命名后的可执行文件、krpt.dll，以及名为x的子文件夹；诱饵文件和载荷文件放在x文件夹中。被重命名的可执行文件为合法的32位EXE文件，会从自身所在目录 中 加载 krpt.dll 文件 ， 随后攻击链通过 32位cmd.exe继续执行。

**2026-10-21（UTC）时间线如下：**

-   03:02:53：Windows Explorer 将 krpt.dll 写入磁盘，与用户解压 ZIP 的动作吻合；
    
-   03:03:06：重命名后的合法可执行文件启动；
    
-   03:03:07：该文件加载 krpt.dll；
    
-   03:03:09：DLL 完成加载，WinRAR 解压开始。
    

**（ 2）诱饵 PDF、WinRAR 解压与 Python 运行时启动**

攻击链执行 cd x && start "" "document.pdf"打开诱饵PDF，让受害者看到一份看似正常的文档。 文件的后缀为.png ， 但该 文件并不是图片， 而是带签名的 WinRAR控制台程序，仅靠.png后缀 扩展名 做 伪装 。 该程序把密码 加密 压缩包解压到 C:\\Users\\Public 目录下， 解压内容 的 MicrosoftEdgeUpdate子文件夹中 存放了 Python运行 环境 。

MicrosoftEdgeUpdate.exe并不是微软的文件，而是被重命名的Python解释器。该解释器 通过 用 \-c执行单行 代码 命令 ， 读取 pdf的原始字节，使用20字节 循环 密钥 d9301f099d9dd27cc9a1c190e40719cfaff77f65做XOR 解密 ，再把解密结果交给 exec()执行。所以，这个.pdf文件实际是编码后的Python脚本。

**（ 3）第二阶段脚本与最终PE载荷**

解密得到的第二阶段脚本做了混淆处理 ， 攻击者 用 XOR、移位、加法运算替代明文常量，变量标识符做随机化 处理 。脚本导入 base64、os、sys、time、winreg、ctypes、subprocess、random、ctypes.wintypes等模块，内置Base64密钥mq8/qZ7D/RkPOCbLyUUBs+wCuA==\`和一大段Base64编码数据。脚本先解码数据块，再用循环密钥XOR解密，得到带有标准MZ头（4D 5A 90）的PE文件。 最终 PE载荷运行后， 会回连 已归属 PureLogs、PureRAT 攻击 活动的 C2地址。

**三、威胁溯源与攻击特征**

从组件和基础设施看，本次攻击使用的 C2与过往PureLogs、PureRAT系列攻击保持一致。PureLogs是信息窃取类恶意软件，PureRAT是远程访问木马（RAT）。两者常搭配使用，以商业化MaaS工具的形式在黑产论坛流通。攻击者可采购套件开展定向攻击，目标主要是Windows办公终端，用于凭据窃取、文件窃取、屏幕监控和远程命令执行。

**这条攻击链有几个高价值狩猎检测点，防守方可重点监控：**

-   C:\\Users\\Public下出现名为MicrosoftEdgeUpdate.exe的Python运行时进程。微软原版Edge更新程序不会放在该路径；
    
-   Downloads目录内出现带合法数字签名的exe。同目录存在krpt.dll，且该可信程序加载了这个陌生DLL；
    
-   该 exe拉起cmd.exe，执行start "" "document.pdf"打开诱饵PDF；随后调用后缀为.png的WinRAR程序，并携带-p密码参数解压加密归档；
    
-   Python进程使用-c单行参数，读取.pdf文件原始字节；循环XOR解密后交给exec()执行。
    

**四、攻击事件总结**

这起 攻击 事件反映出 黑客组织 的典型 攻击 思路：不依赖高危系统漏洞，而是利用合法已签名软件、系统自带命令行工具和开源 Python运行环境 。 通过改文件名、篡改后缀、多层加密拆分载荷，绕开静态哈希、签名校验等传统防御。攻击组件比较分散，单个文件未必有明显恶意特征 ， 只有把完整行为链串起来，才容易识别入侵。

针对这类攻击，企业和个人用户需要调整防御思路：不能只靠恶意文件特征库，还要关注进程行为、异常文件路径和命令行参数。

**本事件相关原始事件报告和 IOC威胁情报线索，可以把文章点赞并转发朋友圈后，留言或私信找管理人员获取。**

往期推荐

[LockBit勒索组织发布声明并重建泄露网站——每周威胁情报动态第166期（2.23-2.29）](http://mp.weixin.qq.com/s?__biz=MzI0MTE4ODY3Nw==&mid=2247492114&idx=1&sn=8d7c5643b4d7b9e6ba5fdb73db25f5ac&chksm=e90dc838de7a412e358185c880ff13f5960c816f47faef975adecc92aa229dd947eaed7c1543&scene=21#wechat_redirect)

[GoldFactory组织开发针对iOS系统的GoldPickaxe木马病毒——每周威胁情报动态第165期（2.9-2.22）](http://mp.weixin.qq.com/s?__biz=MzI0MTE4ODY3Nw==&mid=2247492108&idx=1&sn=9a94a877d19aae993613beabfed515b9&chksm=e90dc826de7a4130e9c14fbecc4bb470c785600d65f4eca984822a3772b801007188d753444b&scene=21#wechat_redirect)

[新APT组织APT-LY-1009针对亚美尼亚政府投递VenomRAT——每周威胁情报动态第164期（02.02-02.07）](http://mp.weixin.qq.com/s?__biz=MzI0MTE4ODY3Nw==&mid=2247492097&idx=1&sn=53ec18ecbac467ab6dddeef971e8630f&chksm=e90dc82bde7a413df05e08bc4d6136b60d4a339310cdb66a046cc0645bb90e447b8564e16180&scene=21#wechat_redirect)

[APT28组织对全球多个组织发起NTLMv2哈希中继攻击——每周威胁情报动态第163期（01.26-02.01）](http://mp.weixin.qq.com/s?__biz=MzI0MTE4ODY3Nw==&mid=2247492083&idx=1&sn=2c985de24dfa929181ba8e6ae63b02ab&chksm=e90dcbd9de7a42cf2f738cbe44a3859ab3f78636b84ef2b930dfc29ecbfc05542ae161ab4e16&scene=21#wechat_redirect)

APT组织 · 目录
