---
title: 【看雪】100美元悬赏 CrackMe 挑战 – Custom VM / Anti-Debug / Anti-Tamper
source: https://bbs.kanxue.com/thread-293495.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-12T05:48:58+08:00
trace_id: 56860fd2-6789-483f-bf41-3d18bb376483
content_hash: 22ab18cec7d9f3624452c75adb03bb51ec0b93c2d4ac28cd117b71e119d3f6d4
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41575244-d011-81b1-82e6-cc5b43bdb5fe
ioc: null
---

**\[原创\] 高难度 CrackMe 挑战 – Custom VM / Anti-Debug / Anti-Tamper**

**挑战目标：**

找出程序内部嵌入的密码，并成功获取正确的 **Flag**。

第一个成功完成挑战的人将获得奖励。奖励仅提供给第一位成功破解该程序的参与者。

祝大家好运！

**程序保护机制：**

-   **Custom VM（自定义虚拟机）：** 程序运行在具有独立指令集的自定义虚拟机上。需要分析并还原 VM 的 Opcode 和 Dispatcher（指令分发器）。
    
-   **Custom Anti-Debug（自定义反调试）：** 程序使用多种反调试技术，包括 PEB 检测、硬件断点检测以及 Debug Port 检查，实现实时调试器检测。
    
-   **Custom Anti-Tamper（自定义防篡改）：** 如果程序检测到任何外部修改或未经授权的干预，将立即触发保护机制并自动退出。
    
-   **Custom CRC Check（自定义 CRC 校验）：** 程序持续检查各个 Section 的完整性并计算校验和。如果计算结果与预设的参考值不匹配，程序将自动退出。
    

**文件下载（DW – 2026年11月10日）：**  
[https://dosya.co/9zvanmlamuib/TestCrackMe.exe.html](https://dosya.co/9zvanmlamuib/TestCrackMe.exe.html)

alternative: https://workupload.com/file/U2fe2AcyR6P

**VirusTotal：**  
[https://www.virustotal.com/gui/file-analysis/Y2IwODI3YTAxOGYyMGM1NDc1ZDJiMjhhNGEwMTFmNWM6MTc4OTQxMTQ5Nw==](https://www.virustotal.com/gui/file-analysis/Y2IwODI3YTAxOGYyMGM1NDc1ZDJiMjhhNGEwMTFmNWM6MTc4OTQxMTQ5Nw==)

[#软件保护](https://bbs.kanxue.com/forum-4-1-3.htm) [#VM保护](https://bbs.kanxue.com/forum-4-1-4.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm) [#其他内容](https://bbs.kanxue.com/forum-4-1-10.htm)

* * *

## 评论

> **XalrGG · 2 楼**
> 
> 另外，本次挑战已设置 \*\*100 美元奖金\*\*。请放心，如果你真的能够成功找到程序中隐藏的密码并获取正确的 Flag，我很乐意向你支付这 100 美元奖励。
