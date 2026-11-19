---
title: 【微信】文件上传&Windows末尾（空格【 】）绕过
source: https://mp.weixin.qq.com/s/lwC7_ibDnxeoCUlpXf1pmw
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:07:54+08:00
trace_id: b55f2a62-5fac-49a7-8a93-5e15af63d001
content_hash: e863ffa24b0e145f6c6c9d48ef115d3e4338ee7484f808bda20cb40c064dc7b2
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 41d75244-d011-81d5-b1a8-f101077f31b0
ioc: null
---

**建哥聊安全** *2026年11月18日 09:35*

## 后缀名检测与绕过之Windows特性（空格【 】）绕过

## 实验目的

通过本实验，掌握文件上传服务端检测中的后缀名的检测原理以及绕过方法。

## 实验环境

-   操作机：Win10用户名：Administrator密码：Aa123!7890
    
-   靶机：Apache + PHP
    
-   实验地址：http://ip/upfile/2/upload4.html
    

## 实验原理

文件上传从客户端进行检测显然是防护不足的，一些特殊的文件命名方式在Windows下是不被允许的，利用Burp Suite工具抓包修改后缀名，绕过服务端的验证后上传文件，Windows会自动去掉后面添加的。注：此方法只适应于Windows，因为Unix/Linux系统没有这个特性。

## 实验步骤

1、登录操作机，打开浏览器，输入实验地址：http://ip/upfile/2/upload4.html

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/926d815f9cbafa57.png)

2、在操作机上准备要上传的文件（脚本文件），比如新建info.php文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a3e69bca5d94650d.png)

3、点击“选择文件”按钮，选中要上传的文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f670259d12c4cc9f.png)

4、点击“submit”按钮，文件上传失败，此文件不允许上传

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8f52a84a0e16a853.png)

5、尝试利用大小写绕过，将脚本文件info.php更改为info.pHp，以及尝试寻找黑名单列表之外可允许上传的文件后缀名进行绕过，将脚本文件info.php更改为info.php3或者info.phtml，再次选择脚本文件上传，依然失败，此文件不允许上传

6、打开桌面的的“Burp”文件夹，双击“BURP.cmd”启动Burp Suite抓包工具

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dc22c3c360cea3c1.png)

7、切换到“Proxy”代理模块的“Options”，查看Bp的代理

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e1e755d2ed36511.png)

8、切换到浏览器，选择火狐插件中的代理（配置浏览器的的代理），与Bp的代理一致

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/870c8872c6726306.png)

9、点击“submit”按钮，再次上传文件，Bp成功抓取数据包

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7f30c90d02cc5fa.png)

10、利用Windows特性，给文件名加“.”绕过服务端后缀名的检测，将数据包中的后缀名info.php改为info.php.

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d675a32a5368df87.png)

11、点击“Forward”，转发数据包，切换到浏览器，依然上传失败，后缀名不允许“.”出现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/290774150463603a.png)

12、关闭浏览器代理，重新选择脚本文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b2a02f3f5d89d0e9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eaa16ea12a948663.png)

13、再次打开浏览器代理，点击“submit”按钮，上传文件并抓取数据包

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/516fcdfb9c661d86.png)

14、利用Windows特性，给文件名加“（空格）”绕过服务端后缀名的检测，将数据包中的后缀名info.php改为info.php

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e416c696e2417ffb.png)

15、点击“Forward”，转发数据包，切换到浏览器，脚本文件成功上传

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/60133d6cb894ec20.png)

16、关闭浏览器代理

17、访问http://ip/upfile/2/upload/info.php （访问http://ip/upfile/2/upload/info.php也可以），上传的脚本文件成功解析

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39b28fa92b9919f3.png)

## 实验总结

掌握文件上传的服务端检测中的后缀名检测原理，“【 】”在Windows下是不被允许的，利用Burp Suite抓包在文件后缀名处添加“【 】”，绕过服务端的验证后上传文件，Windows会自动去掉后面添加的空格（【 】）。

漏洞复现实验篇 · 目录
