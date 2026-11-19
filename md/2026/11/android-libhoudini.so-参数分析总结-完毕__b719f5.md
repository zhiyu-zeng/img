---
title: android libhoudini.so 参数分析总结 完毕
source: https://iosre.com/t/android-libhoudiniso-%E5%8F%82%E6%95%B0%E5%88%86%E6%9E%90%E6%80%BB%E7%BB%93-%E5%AE%8C%E6%AF%95/26306
source_host: iosre.com
clip_date: 2026-11-19T10:45:48+08:00
trace_id: 10029669-22a4-42ec-bf93-e2f8a88f1216
content_hash: ae0d51db29d729f668a89539cbccd33c8ef2e2ea140002946f1b39cb6475b6c1
status: synced
tags: []
series: null
feed_source: iOSRE睿论坛·干货分享
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81e7-8d34-f50f93c8fed4
ioc: null
---

qaz

在hook时最主要的就是获取和修改参数，返回值，修改代码，等等；代码修改实现很简单，但是arm的参数传递时前四个参数是r0-r3寄存器，其余的参数在栈中，这样就不得不将houdini的上下文分析出来。

先纠正一下之前的错误，

之前分享的有一个错误，调用接口好像错了，影响不大

[![IMG\_20261118\_070441](https://cdn.iosre.com/uploads/default/optimized/2X/3/386bb6ab75db84fbef4c447d7995f3b6c15d6982_2_690x417.png)](https://cdn.iosre.com/uploads/default/original/2X/3/386bb6ab75db84fbef4c447d7995f3b6c15d6982.png "IMG_20261118_070441")

是从这里开始获取代码块

[![IMG\_20261118\_070503](https://cdn.iosre.com/uploads/default/optimized/2X/3/373ea0abc9617360fc65db97663714f6d6c2bb8c_2_690x417.png)](https://cdn.iosre.com/uploads/default/original/2X/3/373ea0abc9617360fc65db97663714f6d6c2bb8c.png "IMG_20261118_070503")

代码一行一行的翻译，工作量太大，不干这种事，于是通过断点观察即可

[![IMG\_20261118\_070531](https://cdn.iosre.com/uploads/default/optimized/2X/0/044ca37fbc26208a3235472773ea26a0a03ca352_2_690x417.png)](https://cdn.iosre.com/uploads/default/original/2X/0/044ca37fbc26208a3235472773ea26a0a03ca352.png "IMG_20261118_070531")

在模拟的一行arm指令不停的执行就发现栈中前面是模拟的arm寄存器，然后就是arm的模拟栈，arm的返回地址，arm的下一行代码

前面是r0-r3寄存器，后面运算操作了r4,r5寄存器，要获取上下文的话可以通过这里继续分析。

模拟栈有其余的参数，而且这个内存也处在堆区，说明是malloc出来的，没有执行属性

[![IMG\_20261118\_071808](https://cdn.iosre.com/uploads/default/optimized/2X/8/81bb95514dff271a1ec17899cd560070e512955d_2_690x418.png)](https://cdn.iosre.com/uploads/default/original/2X/8/81bb95514dff271a1ec17899cd560070e512955d.png "IMG_20261118_071808")

好的，houdini到此就分析完毕，感谢支持。
