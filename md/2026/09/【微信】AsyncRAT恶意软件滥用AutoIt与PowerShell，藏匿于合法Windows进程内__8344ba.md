---
title: 【微信】AsyncRAT恶意软件滥用AutoIt与PowerShell，藏匿于合法Windows进程内
source: https://mp.weixin.qq.com/s/oTQW42yJ558vYr9KlfixmQ
source_host: mp.weixin.qq.com
clip_date: 2026-09-14T16:02:21+08:00
trace_id: 0bfd41ba-abff-4f65-9bdc-e53c5d6f289c
content_hash: 4f42ebd90133cd69766f702cd85969daa996661192ea9f7c0e159aa59ff576eb
status: synced
tags:
  - 微信
  - 恶意样本
  - Windows逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 右键打开发票详情的钓鱼批处理释放带合法签名的AutoIt解释器，经PowerShell与异或解码后将AsyncRAT注入微软签名的charmap.exe，并借启动文件夹免权限持久驻留。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3db75244-d011-812b-aad6-ef9b1bcd0c63
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 右键打开发票详情的钓鱼批处理释放带合法签名的AutoIt解释器，经PowerShell与异或解码后将AsyncRAT注入微软签名的charmap.exe，并借启动文件夹免权限持久驻留。
> 
> - **初始载荷：** 诱饵文件“右键打开发票详情.bat”需用户手动触发；确切传播途径未证实，典型渠道为钓鱼邮件附件、恶意下载、被植入木马的软件及聊天诱饵。
> - **免杀解码：** PowerShell隐藏窗口运行并禁用用户配置文件加载，从10段Base64中剔除人为垃圾字符、以循环密钥异或还原下一阶段，使完整Base64、文件名与载荷都不以完整字符串出现。
> - **免权限持久化：** 在 %LOCALAPPDATA%\Temp 释放重命名且带合法签名的AutoIt解释器、脚本 kojuyn.ini 与无后缀加密文件，并在当前用户启动文件夹写 h73la8.bat，登录即执行；对应 ATT&CK T1547.001，无需注册表Run、计划任务或管理员权限。
> - **注入链：** kojuyn.ini 用异或编码整数数组动态解析 OpenProcess/VirtualAllocEx/WriteProcessMemory/CreateRemoteThread，以单字节密钥 0x36 内存解密后注入隐藏的 %WINDIR%\SysWOW64\charmap.exe；PE‑Sieve 证实该进程内存含PE镜像而磁盘无对应文件，CLR与AMSI亦被内存篡改。
> - **最终载荷与检测点：** 解出 Veukuzmw.dll（AsyncRAT），可截屏窃密并以原始TCP回传至C2 158.51.122.136:4944；文件名与密钥逐样本变化，但“隐藏窗口PowerShell＋写Temp＋启动文件夹＋调用AutoIt”行为链固定，是稳定检测点。

**安全圈的那点事儿** *2026年9月14日 15:39*

感染始于名为 “右键打开发票详情.bat” 的钓鱼诱饵文件，需要用户手动触发执行。  
目前尚未确定确切传播途径，这类文件一般通过钓鱼邮件附件、恶意下载链接、被植入木马的软件以及聊天平台诱饵进行分发。  
  
一旦被打开，该批处理文件将启动PowerShell，运行窗口被隐藏，同时禁用用户配置文件加载。  
恶意代码从10段Base64片段重建编码载荷，剔除人为插入的无效垃圾字符，再通过循环密钥异或（XOR）算法，解码出下一阶段的攻击数据。  
  
该手法可以绕过静态特征检测：完整Base64内容、有明确含义的文件名以及最终载荷，不会以完整字符串形式暴露，避免被扫描工具直接识别。  
  
PowerShell执行阶段会在 %LOCALAPPDATA%\\Temp 目录下创建经过混淆的文件夹，并释放3个文件：经过重命名、带有合法数字签名的AutoIt解释器、AutoIt加载脚本 kojuyn.ini ，以及一个无后缀的加密二进制文件 nloemfbihmhm 。  
  
## 启动文件夹免权限持久化

同时它会在当前用户的启动文件夹生成批处理脚本 h73la8.bat 。用户每次登录系统时，该脚本就会调用重命名后的AutoIt程序，并传入 kojuyn.ini 作为参数。攻击者无需修改注册表Run启动项、无需创建计划任务，也不需要管理员权限，即可实现恶意程序持久驻留。  
  
该行为对应MITRE ATT&CK攻击矩阵技术项：T1547.001 启动或登录自动执行：注册表Run键/启动文件夹。  
  
该持久化手段的特点是：攻击者复用带合法签名的解释器，而非直接投放自定义恶意可执行程序。  
PointWild威胁情报研究人员表示：这起攻击活动体现出，普通远控木马攻击者正在结合轻量脚本与内存执行技术，用来对抗基于文件的杀毒检测机制。  
  
AsyncRAT如何藏匿在Windows进程内  
  
AutoIt二进制程序充当了看起来可信的执行载体，恶意逻辑全部写在配套脚本中。  
文件夹列表中蓝色圆形图标是AutoIt程序图标，不是普通应用图标。根据版本不同，AutoIt.exe大小约900KB‑1MB。  
  
恶意软件在不同样本之间会变换文件名和XOR密钥。但是它的行为链特征是固定的：隐藏窗口的PowerShell、向用户可写的Temp临时目录写入文件、利用启动文件夹持久化、调用AutoIt执行。这些行为给防御方提供了稳定的检测点，不受文件名变化影响。  
  
加载脚本 kojuyn.ini 通过经过XOR编码的整数数组，动态解析Windows系统API函数名称： OpenProcess 、 VirtualAllocEx 、 WriteProcessMemory 、 CreateRemoteThread 。  
脚本读取无后缀的加密载荷，使用单字节XOR密钥 0x36 在内存中完成解密；随后后台静默启动系统程序 %WINDIR%\\SysWOW64\\charmap.exe （字符映射表），窗口完全隐藏不可见。  
  
## 远程线程注入流程

加载器使用经典远程线程注入流程，把解密后的恶意代码注入目标进程：  
OpenProcess（打开进程）→ VirtualAllocEx（申请远程内存）→ WriteProcessMemory（写入内存）→ CreateRemoteThread（创建远程线程）  
  
PE‑Sieve工具分析确认： charmap.exe 进程内存中被植入PE可执行镜像，磁盘上并无对应的恶意文件，证实载荷完全运行在内存中。  
扫描同时发现CLR公共语言运行库、AMSI反恶意软件扫描模块遭到内存修改，说明.NET运行环境被加载，并且AMSI防护功能可能在进程内部被篡改绕过。  
  
借助微软签名的 charmap.exe 作为宿主进程，恶意软件所有网络通信、系统探测、数据窃取行为对外都表现为由 charmap.exe 发起，而不是来自Temp目录下可疑程序。  
  
后续解密阶段生成混淆的DLL文件 Veukuzmw.dll ，这就是AsyncRAT主体载荷，具备屏幕截图、窃取信息能力。  
该远控木马通过.NET图形接口捕获主显示器画面，截图数据在内存中编码，通过命令控制通道回传给攻击者服务器。  
  
## C2地址与通信方式

研究人员捕获的C2（命令控制服务器）IOC： 158\[.\]51\[.\]122\[.\]136:4944 ，通信使用原始TCP协议，不走普通Web流量。  
  
AsyncRAT本身是开源远程访问工具，被大量恶意攻击滥用；常见能力包含远程命令执行、监控、窃取各类数据。

恶意软件 · 目录
