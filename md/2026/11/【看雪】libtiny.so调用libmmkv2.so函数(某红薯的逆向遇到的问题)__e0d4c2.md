---
title: 【看雪】libtiny.so调用libmmkv2.so函数(某红薯的逆向遇到的问题)
source: https://bbs.kanxue.com/thread-293667.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-27T01:07:38+08:00
trace_id: bf53d4a8-e46f-4606-a886-2d8fcc8defb5
content_hash: f191d1cbef37e9dba164a11a1d9d4c84a35f584974879ae4e474b800de9da607
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
notion_page_id: 42475244-d011-81e1-b9ed-feb329f0c2be
ioc: null
---

在libtiny 初始化时读取.tistore设备档案时，走的不是java的mmkv接口也不走由 libtiny 自己调 libc 的的open而是直接调用libmmkv2.so内部中的五个C++函数（负责 put / getLength / readValue 这类读写操作），但是我的unidbg中这个五个函数的位置 全是0，因为libtiny 初始化时回调 t.b 要函数表，unidbg 侧这个回调返回了空/全 0，native 就把 0 写了进去。这个错误找了半天才找到，libtiny.so的ELF 头里面也没有声明依赖 libmmkv2.so，程序到了这一步才发现这个错误。

这里要先把 libmmkv2.so 真正加载并初始化(跑 init_array、显式 callJNI_OnLoad 、jniInitialize(rootDir)（设 g_rootDir，为空会短路）、getSafeFunctionPointers())，再在 libtiny 初始化时的 t.b(opencode) Java 回调里返回 libmmkv2 的真实函数表。这样 libtiny 才能用真地址调用 libmmkv2 的内部函数——关键不是“把库加载进来”本身，而是把回调返回的函数表补成真的。

注意 libmmkv2.so 真正加载并初始化，把 t.b(opcode) 的返回值补成真实的函数表 这个顺序一定要在加载libtiny 之前完成！因为t.b发生在 libtiny 的加载/初始化过程中，晚一步 native 就会拿到全 0 并写进槽里面去了。

我这个使用的是unidbg所以在abstractJni的子类中重写callStaticObjectMethodV函数，在其中的 switch 添加一个"com/xingin/tiny/internal/t->b(I\[Ljava/lang/Object;)Ljava/lang/Object;"的case，这个case里面 再根据opcode去匹配到具体的opcode某个是需要拿到 MMKV 函数表的，我们给这个提供我们上面拿到的函数地址表。

最后补充下：要真正产出 mua 的 u，还需要t.a(1030797452)这个第一次调用必须是空参（带参首调会丢 u），并确保.tistore 放在 rootDir 对应的 VFS 路径下
