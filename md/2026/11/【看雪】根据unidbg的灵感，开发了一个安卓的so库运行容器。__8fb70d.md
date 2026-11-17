---
title: 【看雪】根据unidbg的灵感，开发了一个安卓的so库运行容器。
source: https://bbs.kanxue.com/thread-293537.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-17T08:51:15+08:00
trace_id: 6741bf4d-516f-4098-8f1b-e4f6d90346c7
content_hash: 96b9ae77ee9e85f032bcba017ef17e82a0270bb40281fb306a6580378d901697
status: synced
tags:
  - 看雪
  - Android逆向
  - 模拟执行
series: null
feed_source: 看雪·Android安全
ai_summary: |-
  - **核心思路：** 参照 unidbg 开发的安卓 so 运行容器，在真机非 root 环境下加载执行任意 so 库，native 层劫持 libc / linker / ART，配合 Java 层 JNI 代理与 DVM 模拟，让 so 以为运行在另一套环境中。
  - **对比 unidbg 的优势：** 无 QEMU 指令转义，运行速度与真机一致；多线程、反射等 unidbg 的痛点（时间切片、内存占用大）得到规避；调用点封装成 HTTP 接口，手机插电连 wifi 即可作为服务端，每次请求约 200ms，瓶颈在 wifi。
  - **实测效果：** 已完整跑通 xhs 的 tiny.so 和 xyass.so 初始化与运行，每实例内存约 100MB；tiny.so 依赖 mmkv2.so，故支持单实例加载多个 so，并通过内嵌汇编实现符号名 + 自定义 shellcode 植入 PLT/GOT 或函数入口，应对 SVC 裸调用。
  - **已实现能力：** 文件系统伪装（系统文件透传、私有/公共目录模拟）、系统属性伪装、JNI 调用拦截、ART/Dalvik 模拟、符号级 inline hook、HTTP 证书拦截、Mock 文件系统、远程控制 API；API 风格对齐 unidbg，每个对象即独立容器，数据互不影响。
  - **调试差异：** unidbg 遇到未处理点会报错，而真机运行时未处理处会默认走真机调用，反而"正常"跑过，导致遗漏不易被发现，完整模拟仍需继续深挖。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41b75244-d011-81cc-80a9-ecdbc4c2924a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **核心思路：** 参照 unidbg 开发的安卓 so 运行容器，在真机非 root 环境下加载执行任意 so 库，native 层劫持 libc / linker / ART，配合 Java 层 JNI 代理与 DVM 模拟，让 so 以为运行在另一套环境中。
> - **对比 unidbg 的优势：** 无 QEMU 指令转义，运行速度与真机一致；多线程、反射等 unidbg 的痛点（时间切片、内存占用大）得到规避；调用点封装成 HTTP 接口，手机插电连 wifi 即可作为服务端，每次请求约 200ms，瓶颈在 wifi。
> - **实测效果：** 已完整跑通 xhs 的 tiny.so 和 xyass.so 初始化与运行，每实例内存约 100MB；tiny.so 依赖 mmkv2.so，故支持单实例加载多个 so，并通过内嵌汇编实现符号名 + 自定义 shellcode 植入 PLT/GOT 或函数入口，应对 SVC 裸调用。
> - **已实现能力：** 文件系统伪装（系统文件透传、私有/公共目录模拟）、系统属性伪装、JNI 调用拦截、ART/Dalvik 模拟、符号级 inline hook、HTTP 证书拦截、Mock 文件系统、远程控制 API；API 风格对齐 unidbg，每个对象即独立容器，数据互不影响。
> - **调试差异：** unidbg 遇到未处理点会报错，而真机运行时未处理处会默认走真机调用，反而"正常"跑过，导致遗漏不易被发现，完整模拟仍需继续深挖。

unidbg在我实际的使用过程中，遇到了很多潜在的问题，做不到开箱即用。比如多线程（unidbg本质是时间切片），反射部分处理起来非常麻烦等等。而且它是通过QEMU执行其他平台指令，代码运行的耗时明显不同，做成接口以后的内存占用也是不容小觑的。当前，我也不是说unidbg不好，将近一年的时间里，我都是通过unidbg来学习的，当然我也学习不是非常的彻底，遇到各种问题解决不了，不然也就不会有现在这个项目了，但是很多地方给了我非常棒的灵感。

本项目是基于真机，非root环境，加载执行任意so库到app内来执行调用的。在默认环境的基础上，虚构环境给so库。理解为如果什么都不配置的情况下，so库会默认自己运行在当前的真机上，不存在cpu指令转义，所以运行速度和真机一模一样。核心思路是在 native 层劫持 libc / linker / ART，结合 Java 层的 JNI 代理和 DVM 模拟，让目标 so 认为自己运行在另一台设备 / 另一套环境里。

## HTTP 接口与实测性能

然后将全部调用点，都封装成http接口，手机上安装好编译后的apk，只需要插上充电器，连接wifi，扔在一边即可，实测xhs的tiny.so和xyass.so，每个实例占用内存100mb左右，每次请求最大的耗时是wifi，大概在200ms左右。

放一个最新的运行日志吧，目前已经可以完整的完成xhs的tiny.so和xyass.so的初始化和运行了，但是总感觉哪里还是有缺失的地方。想要做到完整的模拟，还是需要继续深入挖掘和分析。我的这种调试方式和unidbg不同的就是unidbg在遇到没有处理的地方会报错。真机运行的时候，遇到没有处理的地方，它会默认真机调用，反而会正常运行....

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5e68542944f073fe.webp)

## 已实现功能

**目前实现了的部分**

1.文件系统伪装

so会检测各种系统文件，文件处理分几种模式。第一种是系统文件，这种可以直接透传，so库根据文件内容，来检测环境的。第二种是app私有目录，会根据进程建立自己的目录，在目录下进行模拟对应的操作。第三种是公共目录，这种也是直接在第二种情况的目录下进行模拟，因为so库可能会在下载目录中建立文件，然后同时读写会有问题，索性直接模拟了。部分代码放在这里先，整个项目越做越大，很多地方三言两语说不清楚。彻底完成后在进行更新吧，现在想到哪里写哪里。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/810f269af3f93a09.webp)

2.系统属性伪装

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a940cf50d64db17.webp)

3.JNI 调用拦截

4.ART/Dalvik 模拟

5.符号级 inline hook

6.HTTP 证书拦截

7.Mock 文件系统

8.远程控制 API

实测xhs的so库，全部代码风格我会尽量对齐unidbg，并在unidbg的基础上进行改进，尽量减少上手难度。部分初始化代码如下，每次创建对象，就是一个完全的独立的容器，容器之间数据互不影响，一个手机可以创建多少个，和手机内存性能相关。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aadc236adce4ee40.webp)

## tiny.so 适配难点

尝试过xhs的都知道，最复杂的是tiny这个硬骨头，他会使用mmkv2.so，所以我新增了在一个实例中，加载多个so库的能力，同时它会进行各种SVC裸调用，通过嵌入汇编，实现给定符号名 + 自定义 shellcode，直接在 PLT/GOT 或函数入口植入跳转。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/42832f7d935670da.webp)

好多地方欠缺，并没有完善彻底，慢慢写吧。项目越写越大，脑袋快装不下了~

[#程序开发](https://bbs.kanxue.com/forum-161-1-124.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)
