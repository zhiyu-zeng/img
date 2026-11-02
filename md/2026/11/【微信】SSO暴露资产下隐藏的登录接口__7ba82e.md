---
title: 【微信】SSO暴露资产下隐藏的登录接口
source: https://mp.weixin.qq.com/s/ft_QzDCH09WeeMyi-iB6Mg
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T11:01:39+08:00
trace_id: 22ac696a-4cb4-4da7-8518-e0bea62de67a
content_hash: 13c4f1d141bf3917f2f8be4d0062d5fb5d5ddd0907076d79f94b48d98cf36cff
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 40c75244-d011-8176-9706-d3a9700ff50b
ioc: null
---

**月的造梦星球** *2026年11月2日 10:33*

`hunter` 信息收集开局 `403` 如果是没有图标的话我一般会把此类响应站点放到最后去渗透，扫目录碰碰运气，但是观察发现是存在图标的，那么大概率是存在某个 `web` 系统

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9a3ab9cc75ce3dc.png)

字典扫描后出现系统登录页

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/220f42d93da4b36b.png)

优先测试弱口令，正常输入账户密码抓包发现走的的 `sso` 登录机制，会请求到该 `SRC sso` 进行繁琐的身份验证，一般来说会走 `sso` 登录的内部系统，都不会直接裸露在外部，首次访问应当马上一闪而过取而代之的是 `sso` 页面，但是此系统却没有显然是未被及时收敛，只是第一层登录机制走的是 `sso`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7b9eb5d3d2ac5374.png)

于是跟进到此 `sso` 接口发现了写在 `sso` 下面的第二套隐藏的登录机制，构造接口参数上字典简简单单拿到弱口令回显 `admin jwt`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ab37c4507b648b9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f8b2c9278a34ca23.png)

懒得卡包换了直接让 `A` I给了个控制台注入代码，刷新接管管理员后台

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/78e75578b19930a0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/548feea99c6a32e9.png)

接管后发现该管理员其实是管理下面的老师身份二者对应 `B C` 端的身份，并且在得到管理员 `token` 时响应包回显了 `role：admin` 现在正好存在一个老师，不同身份的角色其实会出现共用同一个平台的情况知识根据权限不同展示的功能点也不同，随即制作用户名碰撞弱口令，接管第二个教师权限平台，后续也是测试出了垂直越权

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e43b136954783680.png)

* * *

欢迎加入纷传圈学习更多漏洞报告小思路
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a1cb01e306ffd91.jpg)
