---
title: 【看雪】drozer 扩展模块
source: https://bbs.kanxue.com/thread-293482.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-10T11:54:08+08:00
trace_id: 7a1256f7-f743-46c8-8ac3-13e5312998f1
content_hash: be69b9e1b74051bb2fb60790cab748c9b02db92cadfdedb44deee13a1033236f
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41475244-d011-81f8-afd1-de306abef0c8
ioc: null
---

在使用drozer做安全测试时，需要扩展drozer模块，整理扩展内容如下：

**apk模式扩展：apk+python**

将java文件编译为apk文件，在python脚本中调用相应的函数

java --> apk:

javac -cp lib\\android.jar xxx.java

dx.jar --dex --output=xxx.apk xxx\*.class

实例：

javac -cp C:\\Appie\\base\\python\\Lib\\drozer\\lib\\android.jar ErrorDataDoS.java

dx.jar --dex --output=ErrorDataDoS.apk ErrorDataDoS\*.class ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/795052e0a12d8c39.webp)

**Python中调用apk中的函数**：

ErrorIntent = self.loadClass("common/ErrorDataDoS.apk", "ErrorDataDoS")

ErrorDataDoS.apk ：java文件生成的apk

ErrorDataDoS ：java文件的主类

ErrorIntent.superfuzz_Activity(self.getContext(), package, component.name)

superfuzz_Activity ：java文件中的函数

解释如下图：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed99b88c41756646.webp)

纯脚本模式：python

def execute(self, arguments): 必须存在

license = "BSD (3 clause)" 必须存在

path = \["app", "dos"\] 为 run 模块路径 run app.dos.xxx

实例：

#!python

from drozer.modules import Module

class GetInteger(Module):

name = ""

description = ""

examples = ""

author = "Joe Bloggs (@jbloggs)"

date = "2012-12-21"

license = "BSD (3-clause)"

path = \["exp", "test"\]

def execute(self, arguments):

random = self.new("java.util.Random")

integer = random.nextInt()

self.stdout.write("int: %d\\n" % integer)

name 模块的名称

description 模块的功能描述

examples 模块的使用示例

author 作者

date 日期

license 许可

path 描述模块命令空间

permission 权限

**模块安装**：

drozer模块安装有两种方法，一种是直接在repository中按照python包管理的方法新建目录结构，将python文件放入相应目录中，另一种是在drozer console中通过module install命令直接安装模块。

这两种方法都需先在本地创建一个drozer 的repository目录，可以直接在drozer console中通过命令创建：dz> module repository create \[/path/to/repository\]，也可以在~/.drozer_config文件中指定本地repository目录

\[repositories\]

/path/to/repository = /path/to/repository

第一种方式：

当path = \["app", "dos"\]时，执行命令:

dz>module install path\\drozer\\modules\\common\\xxxx.py\\app.dos.xxxx

实例：

dz> module install path\\drozer\\modules\\common\\NullDataDeny.py\\app.dos.nulldatadeny

第二种方式：

按照python包管理的方式，在本地repository目录下创建目录exp,新建\__int\_\_.py空白文件，然后将Python模块源码放入exp目录即可。例如将test.py放入exp目录下,安装好模块之后即可在drozer console端通过命令run exp.test.getinteger运行该模块。

步骤：（Ubuntu环境）

第一步：dz> module repository create /usr/lib/python2.7/dist-packages/drozer/dos

Initialised repository at /usr/lib/python2.7/dist-packages/drozer/ddos.

第二步：在/usr/lib/python2.7/dist-packages/drozer/dos 下新建 \__init\_\_.py 空文件

第三步：把NullDataDeny.py 拷贝到 /usr/lib/python2.7/dist-packages/drozer/dos 中

第四步：dz> run app.d 执行命令验证

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b0722d1be9a20115.webp)

第一步：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c05c1578f5453ab.webp)

第二步：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f5a3cac2b0432405.webp)

第三步：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/704bd0f825a71247.webp)

第四步：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/69089c35d5af619f.webp)
