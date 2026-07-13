---
title: "Roaming Alpha: 9块9的高通410随行WIFI打造成VoWiFi//WiFi calling/远程ESIM管理/短信转发神器、轻松激活CMLink UK、CTExcel"
source: https://sharingman.cf/2026/06/99410wifivowifiwifi-callingesimcmlink.html?m=1
source_host: sharingman.cf
clip_date: 2026-07-13T10:15:21+08:00
trace_id: db728611-bc79-405d-a9bf-cc9013411235
content_hash: 005d4bb1a70f4564f0d48a003561d02e2d9138659fc94272a0b05dee96cd435a
status: summarized
tags: []
series: null
feed_source: null
ai_summary: 将高通410随行WIFI刷机为Debian系统并安装Vohive软件，实现VoWiFi、远程ESIM管理及短信转发功能，以激活国际SIM卡服务。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 39c75244-d011-8179-abac-fec3bbded1fc
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 将高通410随行WIFI刷机为Debian系统并安装Vohive软件，实现VoWiFi、远程ESIM管理及短信转发功能，以激活国际SIM卡服务。
> 
> - **刷机要求：** 设备需刷入Debian13操作系统，并通过SSH进行远程连接。
> - **关键命令：** 使用`nmcli connection modify modem connection.autoconnect no`关闭开机自动拨号，再通过curl命令一键安装Vohive。
> - **功能实现：** 安装后设备支持VoWiFi/WiFi calling、远程ESIM管理和短信转发。
> - **服务激活：** 该设置可轻松激活CMLink UK和CTExcel等国际SIM卡服务。

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8ca24d42a82adce4.png)](https://blogger.googleusercontent.com/img/a/AVvXsEgHaHLhnUH6D5eqiN20YIRzHo1ShKdQRAYkgXiOpEsFNvVM3cHuFXi_flwg9jcz3bbbik0pjYLhZKna2XyIFp-bKtQ9GgCtgrfl-ru0OE40slreyIPlXQMDhbxvhEiu21j6JbKFlESJ-1nBu7Uul72YOdCJEf5Z0BS5GbWPD6b993o-PI6MZeDfKzc2yqU)

先把高通410刷机为debian13系统

jz02v10教程参考👉 [https://www.cpolar.com/blog/flash-debian-13-and-enable-ssh-remote-access](https://www.cpolar.com/blog/flash-debian-13-and-enable-ssh-remote-access)  
UFI003教程参考👉 [https://blog.iamsjy.com/2023/12/11/snapdragon-410-portable-wifi-hotspot-flash-debian-and-optimize/](https://blog.iamsjy.com/2023/12/11/snapdragon-410-portable-wifi-hotspot-flash-debian-and-optimize/)  
最新debian系统可以去交流群下载  
然后就可以连接ssh 一键安装vohive

```
复制代码 隐藏代码
// 关闭开机自动拨号
nmcli connection modify modem connection.autoconnect no

curl -fsSL https://raw.githubusercontent.com/iniwex5/vohive-release/master/install.sh | bash
```

#### 发布频道：

[https://t.me/vohive_channel](https://t.me/vohive_channel)

#### 交流群：

[https://t.me/vohive](https://t.me/vohive)
