---
title: 【微信】Claude Code 被投毒
source: https://mp.weixin.qq.com/s/kob_9c98FxwD0_uumZt1aA
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T06:49:34+08:00
trace_id: bfee9e89-3325-4c40-baf2-2679e98dc7d7
content_hash: 040810e0f4e2dcdab732294932c70eec25cdb330d3ccf7279607400ff4e997b2
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40975244-d011-8151-ab8b-f57a6e260a45
ioc:
  cves: []
  cwes: []
  hashes:
    - 7e0a52885fadee05544a9e99eb18c792bec05900a5e1a66d68f8383decb0e278
    - ecb58cb29078d9646ad1dcdbe51526f2d9cfea06be5fb2ab183e8ecc3ab6bf15
  domains: []
  tools: []
  techniques: []
---

**RTAi-Lab** *2026年10月30日 14:54*

安全 · 已实锤

先把结论放最前面： **这事是真的。**

10 月 30 号，Open VSX 上的 Claude Code 官方扩展被人投毒。恶意版本 **2.1.313** 在正常的扩展代码前面，塞了一段 66 行的加载器——扩展一运行，它就先动手，把你的电脑改造成一台能被远程登录的机器。

整个过程中，你不需要跟 Claude 说一句话，不需要点任何链接。 **装上，打开编辑器，就完了。**

版本当天就被下架了，2.1.314 紧跟着上线。但有意思的是，Anthropic 和 Open VSX 官方，到现在一句话都没说。

66 行

恶意加载器全部代码

60 秒

隧道断线自动重连

3 平台

Mac / Linux / Win

它在你电脑上干了七件事

01先摸你家底

收集主机名、用户名、系统版本、CPU 架构、家目录，还有你的 Git 邮箱。顺带扫一遍环境变量，专挑名字里带 KEY、TOKEN、SECRET、PASS、AWS、GCP 的，最多 40 个。这里它只记名字，不往外传值——先把你的底细摸清楚。

02留钥匙

往 **~/.ssh/authorized_keys** 里追加一枚 Ed25519 公钥，注释写成 **svc-telemetry**，伪装成一个看起来正经的服务账号，权限设成 0600。

03开门

macOS 上开远程登录，Linux 上用 systemctl 拉起 sshd，Windows 上直接装 OpenSSH Server。你的 SSH 服务，就这么被打开了。

04反着连回来

它内置了一把私钥，反复去连 **tunnel@134.209.82.225**，转发参数是 **\-R \*:0:localhost:22**，每 60 秒重连，还关掉了主机密钥校验。意思是：它从你电脑里往外开了一条隧道，防火墙拦不住——因为门是从里面往外开的。

05让它开机就活

macOS 写 **com.apple.sysmond.plist**，伪装成苹果的组件名，再 launchctl 加载；Linux 写 **~/.config/.smt** 和 **.smtk**，加一条 crontab @reboot；Windows 建一个叫 SysMon 的计划任务，用 SYSTEM 权限跑，失败了就往启动文件夹里丢。

06报个信

1.5 秒后查一下你的公网 IP，把收集到的东西打包成 JSON，发到 /beacon——本地 8099 一份，C2 的 8099 一份。回包它根本不在乎，发了就行。

07没有第七步

它没下载任何额外文件，注入阶段就这些。但别小看——那条隧道本身就是攻击者进你 SSH 的门，危害已经拉满了。

![恶意代码分析](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d1920b290bfc102e.jpg)

恶意加载器与正常代码的对比 · 来源 OpenSourceMalware

记不住上面这些，就照这几个值查

C2 134.209.82.225（22 / 8099）

路径 /beacon

公钥注释 svc-telemetry

持久化痕迹

~/.config/.smt、.smtk

~/Library/LaunchAgents/com.apple.sysmond.plist

SysMon、${TMPDIR}/.stk\_\*

extension.js 哈希

ecb58cb29078d9646ad1dcdbe51526f2d9cfea06be5fb2ab183e8ecc3ab6bf15

内置私钥哈希

7e0a52885fadee05544a9e99eb18c792bec05900a5e1a66d68f8383decb0e278

官方的反应，是沉默

**Open VSX：** 版本已经删了，2.1.313 直接返回 Extension not found，列表从 312 跳到 314。但什么时候删的？没公开。

**Anthropic：** 2.1.314 的 changelog 是发了，内容是权限加固那套，通篇没提这次是不是安全响应。官方声明？没有。

**微软商店：** 装机量 2907 万，发布者 Anthropic，版本 2.1.314。分析方谨慎起见也报了微软市场，但目前只确认 Open VSX 那个样本是恶意的。

还有个细节：出事的 Open VSX 账号所有者，显示是 **igorkofman**——Igor Kofman，Anthropic 技术负责人，Claude Code 核心成员。是他本人账号被黑，还是发布环节有别的口子？没人出来给答案。

![版本状态](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6ccb951f9fca817d.jpg)

版本从 2.1.312 直接跳到 2.1.314，313 被移除

谁会中招

默认从 Open VSX 拉扩展的编辑器，都在射程内： **VSCodium、Cursor、Devin Desktop（原 Windsurf）、Kiro、Gitpod**……

如果你用的是微软官方 Marketplace 里的 VS Code，目前没有证据说你被波及。但下面这份自查，建议顺手做一遍。

花两分钟，自查这 6 处

①authorized_keys 里，有没有一行注释是 svc-telemetry

②macOS 的 LaunchAgents 里，有没有一个叫 com.apple.sysmond 的东西

③crontab 里，有没有 @reboot 指向 ~/.config/.smt

④Windows 里，有没有 SysMon 计划任务，或启动项里的 sysmon.cmd

⑤有没有长期挂着的 ssh / autossh 进程，参数里带 -R \*:0:localhost:22

⑥有没有网络连接指向 134.209.82.225，22 或 8099 端口

真中招了，先做这五件事

先别手忙脚乱删东西。顺序是： **断网 → 保留证据 → 封掉那个 IP（22 和 8099）→ 再删扩展和持久化 → 从干净的机器把能触达的凭证轮换一遍**。

还有句丑话得说：这是交互式 SSH 后门，你看到的文件未必是全部痕迹。真确认中招了， **重装系统比清文件靠谱**。

顺手把这几件事分清楚

最近 Claude Code 的安全新闻有点多，别混了：

不是去年 8 月那次误标（当时被误判恶意，后来澄清了）；不是今年 7 月工信部 NVDB 那条（那针对 2.1.91 到 2.1.196 的内置监控，版本范围都不一样）；也不是源码泄露、npm 投毒、Chrome 扩展漏洞——那些是另外几起独立的事。

这次的，就是 Open VSX 上的 Claude Code 扩展被投毒，版本号 2.1.313。

AI Agent · 目录
