---
title: 【看雪】typora的launch.dist.js解读
source: https://bbs.kanxue.com/thread-292105.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-21T21:09:09+08:00
trace_id: 09916eb4-6618-4b0d-80f0-c8b8f54e19ef
content_hash: 1e7aca8ced3d7ce203e484bac6eee67ebe76a548e388de3cad7051529bcd4bb7
status: summarized
tags:
  - 看雪
  - Typora逆向
  - V8代码缓存
series: null
feed_source: 看雪·逆向工程
ai_summary: Bytenode通过修改Node.js模块加载机制并利用V8代码缓存，实现将JS编译为JSC字节码执行，以保护Typora代码并增加逆向难度。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3a475244-d011-81d3-89c0-da75f8f01d40
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Bytenode通过修改Node.js模块加载机制并利用V8代码缓存，实现将JS编译为JSC字节码执行，以保护Typora代码并增加逆向难度。
> 
> - **修改模块加载机制：** 通过设置`Module._extensions[".jsc"] = loadJsc`，使Node.js能识别和加载.jsc文件。
> - **loadJsc函数处理：** 读取JSC文件缓冲区，复制V8 header以通过引擎校验，并处理源码长度。
> - **利用V8代码缓存：** 使用vm.Script的cachedData优先运行编译后的字节码，节省编译时间。
> - **解决flag hash问题：** 覆盖dummyBytecode中的header，使V8引擎参数匹配，确保缓存有效。
> - **逆向保护效果：** 作者巧妙利用V8特性，增加代码保护，提高逆向难度。

我在研究typora逆向的时候我遇到了JSC

我很感兴趣

好奇JS本身是不支持加载JSC的

它是如何做到require的时候引入了JSC的

过程中发现它是来自于：

https://github.com/bytenode/bytenode 这个项目

把JS变成JSC的里面会自动嵌入进去这段js加载逻辑

JS本身不支持运行V8编译的字节码（JSC）

但Bytenode作者利用了

Node暴露的V8 code cache被借来执行编译好的字节码

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/40d2a1c6b74b3b83.webp)

我们可以看到上面图片

答案是写上上面了

原因是它修改了 Node 的模块加载机制

Module.\_extensions\[".jsc"\] = loadJsc;

当遇到.jsc文件的时候 会走loadJsc函数

我们详细看看loadJsc函数 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/be1dbca8ad372996.webp)

首先是一个fs.readFileSync

读取里面字节buffer

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/345b40868064b413.webp)

用了一个setFlagHashHeader函数

目的是

为了把dummyBytecode里面的V8 header复制到JSC buffer里面

让JSC代码执行的时候可以通过V8引擎的校验

大白话:

相当于：

告诉V8：这个bytecode是在你当前配置下生成的

问：他们V8在执行这个JSC文件字节码不对应的问题?

答：Typora 自带完整的 Electron 运行 不依赖系统安装的 Node.js 或 V8 所以不需要 并且JSC也是里面自带的V8引擎编译的

问：既然引擎是同一套 那为什么会出现flag hash不同出现需要特地覆盖的情况?

答：是因为构造时的JSC V8引擎的参数是默认参数 然后在执行JSC后的V8引擎不是默认参数 如下图

Launch.dist.js里面在V8引擎执行的时候加入了以下的参数

最终才导致的flag hash变化

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9a664e8c1774c7f2.webp)

接着继续看

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/11b934f19719153a.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/29eac9a01bab8f74.webp) sourceLength是在读取源码的长度为空间开辟做准备

buffer.slice(8,12)可以读取出jsc的源码长度

buffer2Number是把大端数据变成小端数据

dummySource用”\\u200b”

原因也是很无聊

(我开始以为是什么很厉害的说法 干嘛不直接用空格)

就是因为单纯人看不到而已

V8官方代码里面就是只对长度进行hash

也就是长度对的上就行了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c547a0ac15c6ee7a.webp)

在开辟成功后会把开辟好的放到vm.script中占位让V8接受cachedData V8本身设计也是这样如果cachedData通过校验了那就会优先运行它

你可以认为是缓存来的

对于V8来说这样可以节省编译时间

大白话：

优先读字节码

是因为 「同一份脚本编译过就别再编译」 这个性能设计

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8d624b75ce91cf2c.webp)

runInThisContext就是相当于开关运行了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/58908cb111a0559d.webp)

总结：

作者的思路很巧妙

能够特地去研究V8引擎的特性利用cache来运行字节码

还能够实现保护增加逆向难度
