---
title: 【看雪】The Enigma Protector vm还原插件
source: https://bbs.kanxue.com/thread-292906.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-10T01:16:29+08:00
trace_id: 97cfa4c2-c4d2-4e69-988b-91d4db2a5694
content_hash: 05ee4fda3a353eea7d7f5763d1055dab54429a76f988d552b6080c6b53107550
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: Enigma Protector 的 VM 代码还原 x32dbg 插件，可把壳内 `push 0xxxxxx / jmp xxxxx` 形式的虚拟化代码还原为近似可执行指令，用于辅助调试壳的 VM 检测、文件检测与授权。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f475244-d011-811c-a7d8-fedf285027d2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Enigma Protector 的 VM 代码还原 x32dbg 插件，可把壳内 `push 0xxxxxx / jmp xxxxx` 形式的虚拟化代码还原为近似可执行指令，用于辅助调试壳的 VM 检测、文件检测与授权。
> 
> - **使用方式：** 在 x32dbg 中对 `push 0xxxxxx jmp xxxxx` 这类地址右键 → EnigmaVM → 还原当前地址，即可得到还原后的代码。
> - **两种还原模式：** 单个还原适合边调试边还原，落到哪段还原哪段；全部还原只用于浏览整体代码结构，大概率无法完整运行。
> - **异常处理：** 还原结果大部分可执行；若某段执行异常或中途报错，多为该段少数指令解析有误，建议跳过该段、从下一段继续还原调试。
> - **适配范围：** 仅支持 32 位，作者实测过 Enigma 5.x 与 7.x，其他版本需自行测试。
> - **附件：** EnigmaVM 还原插件.zip（344.55kb），作者声明仅供学习交流，如有不良影响可联系删除。

不做过多介绍，能用的上的人都知道怎么用，字越少，越强大

一直以来都是用各位大神的各种工具，今天也发一个好用的东西给大家用一下

主要还原壳代码，遇到 push 0xxxxxx jmp xxxxx这种地址，右键---EnigmaVM---还原当前地址，就可以还原，还原的代码大部分都可以执行的，遇到不能执行的或者中途执行就异常的，大概率是小部分指令解析有问题，我也修改不起了，反正现在能用，配合x32dbg调试壳的vm检测，文件检测，授权这些基本上没问题，如果遇到还原后部分指令异常导致不能继续执行的，建议参考下代码，然后不要还原这段，在下一段还原继续调试。

全部还原功能可以用来看整体代码，但大概率是不能完整运行，一般调试就建议单个还原，调试到哪里还原到哪里看

大家拿去研究出好东西别忘了分享，共同研究才有进步

测试了一个5.x和7.x，只支持32位，其他的没测试，大家自己测试一下

下面是虚拟机检测部分还原前后对比

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2fb874587f644a15.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6fdf7a5f1d0d80b8.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/21bb40a8cd56e6aa.webp)

仅供学习交流用，如有不好影响，联系我删除

## 附件

- [EnigmaVM还原插件.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/0742fa1ba0226e78.zip) （344.55kb，148次下载）
