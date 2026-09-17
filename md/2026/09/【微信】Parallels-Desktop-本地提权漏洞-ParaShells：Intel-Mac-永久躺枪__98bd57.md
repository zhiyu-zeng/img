---
title: 【微信】Parallels Desktop 本地提权漏洞 ParaShells：Intel Mac 永久躺枪
source: https://mp.weixin.qq.com/s/0v2vugZitjf_qj704pVQAQ
source_host: mp.weixin.qq.com
clip_date: 2026-09-17T09:04:00+08:00
trace_id: 8834b949-0d99-4ace-95f4-ef76bd1c46e9
content_hash: 48e71702f89077460a4a1b450366073ed0ae4c69f0724e6777002105347e7dd0
status: synced
tags:
  - 微信
  - 漏洞分析
  - Linux安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: CVE-2026-90894（ParaShells）让 Parallels Desktop 的本地普通账户直通 root，而修复只在 Apple Silicon 版 27 中，Intel Mac 被永久留在受影响版本上。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3de75244-d011-81ba-a030-fa90431be16e
ioc:
  cves:
    - CVE-2026-90894
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CVE-2026-90894（ParaShells）让 Parallels Desktop 的本地普通账户直通 root，而修复只在 Apple Silicon 版 27 中，Intel Mac 被永久留在受影响版本上。
> 
> - **漏洞定位：** Mac 端 root 服务 `prl_disp_service`，套接字 `/var/run/prl_disp_service.socket` 权限位为 `srwxrwxrwx`，任意本地进程可连。
> - **三处缺陷叠加：** 套接字权限过宽 + `PrlSrv_LoginLocal` 仅凭内核凭据放行（不校验代码签名）+ `InstallAppliance` 用 `tar -xf "%1" -C "%2"` 拼接命令，目录名注入双引号可闭合，再借 `--use-compress-program` 执行任意程序。
> - **利用门槛：** 装有 Parallels、服务在跑、有低权限账户即可；无需启动虚拟机或打开界面，PoC 效果是写入免密码 sudo 规则并弹出 root shell。
> - **补丁困局：** 修复位于 27.0.0，Intel Mac 只能停在 26.x（含最新的 26.4.2），Parallels 未承诺 26.x 线补丁，也未就此事发布官方声明。
> - **自检与应对：** 用 `defaults read .../Info CFBundleShortVersionString` 与 `ls -l /var/run/prl_disp_service.socket` 判断暴露面；Apple Silicon 升级到 27.0.1，Intel 用户限制本地账户、考虑换 UTM/VMware Fusion，并检查 `/Library/LaunchDaemons/`、`/Library/LaunchAgents/` 的异常 plist——root 后可经 launchd 持久化，重装最稳。

**黑白之道** *2026年9月17日 08:35*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：JFrog 周二公开 Parallels Desktop 本地提权漏洞 CVE-2026-90894，评分 7.8——只要 Mac 上有普通账户，就能一路打到最高权限。真正扎心的是漏洞本身吗？不是，是补丁只存在于 Apple Silicon 版 27，Intel Mac 用户被官方永久关在门外。

* * *

## 一、事件概述：JFrog 周二扔出 ParaShells

9 月 15 日，JFrog 漏洞研究负责人 Yuval Moravchick 发布报告，标题直白："Parallels Desktop Turns Appliance Install Into Root Shell"（Parallels Desktop 把应用安装变成了 root shell）。漏洞命名 ParaShells——致敬 2014 年的 Shellshock（壳冲击），命名风格说明一切。编号 CVE-2026-90894，JFrog 自评 7.8 分。

![Parallels Desktop 本地提权漏洞警示](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/82e69bc0776dbb31.png "Parallels Desktop 本地提权漏洞警示")

漏洞出在 Mac 端后端服务 `prl_disp_service` （派发服务）上，负责给虚拟机搭宿主机网络、解压应用包，所以必须以 root（macOS 最高管理员账户）身份跑。JFrog 在 Parallels Desktop 26.4.0（build 57513）的 Apple Silicon 机器上验证成功，并明确表态："任何还在暴露同一个 InstallAppliance（应用安装接口）解压模板和派发器 Unix 套接字的桌面安装，都视为在攻击范围内。"

更讽刺的是 Parallels 至今没发任何官方声明。按他们政策"漏洞公开后才讨论"，但补丁在公告前一个月就悄悄进了 27.0.0。

* * *

## 二、技术剖析：三处叠加缺陷打穿 root

JFrog 把这个漏洞归类为"漏洞链"——单看每一处都不致命，叠在一起就成了 root shell 的入场券。

![ParaShells 攻击链路示意图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/854418635fe99d15.png "ParaShells 攻击链路示意图")

**第一处，Unix 套接字权限失控。** 派发服务监听 `/var/run/prl_disp_service.socket` ，权限位 `srwxrwxrwx` ——任何本地进程都能连。能连进 root 服务的套接字就是攻击入口。

**第二处，登录鉴权只看内核。** 调用 `PrlSrv_LoginLocal` （Parallels 本地登录接口），只核对内核报告的进程凭据，连 Parallels 自己的代码签名都不验。访客账户都能过这关。

**第三处，InstallAppliance 命令拼接。** 解压应用包时按 `tar -xf "%1" -C "%2"` 拼一行命令， `%2` 是用户指定的安装目录，再用 Qt（C++ 图形界面框架）的 `QProcess::splitCommand` 拆回参数数组。攻击者在目录名里塞个双引号，比如 `~/Documents/Victim" --use-compress-program=/tmp/evil.sh` ——引号提前闭合，剩下的字符就成了 tar 的额外参数。 `--use-compress-program` （指定 tar 调用其他解压程序）让 tar 把归档交给任意程序执行，而此时 tar 跑的是 root，调用出来的程序也是 root。

JFrog 的 PoC（概念验证代码）就是写一条免密码 sudo 规则，再弹一个 root shell。

* * *

## 三、攻击复盘：一句文件夹名换 root shell

漏洞利用门槛低到让人不适——装上 Parallels Desktop、派发服务在跑、有个低权限账户就够了。攻击过程不用启动任何虚拟机，也不用进 Parallels 界面。

实际操作四步：写一个 shell 脚本到 `/tmp/evil.sh` （写免密码 sudo 规则 + 弹 root shell）；在"文档"目录下建一个名字精心构造的文件夹，里面塞双引号 + `--use-compress-program=/tmp/evil.sh` ；调用 InstallAppliance 接口，把这个目录作为目标路径传给派发服务；等待——派发服务以 root 执行 tar，tar 顺手调用 `/tmp/evil.sh` ，root shell 弹出。

整个链条没有 0day（未公开漏洞）味道，全是老掉牙的套路——套接字权限过宽、身份校验过松、命令拼接未转义——但堆在一起就是教科书级的 LPE（本地权限提升）。这暴露了 macOS 上第三方系统扩展类软件的通病：跑在最高权限里，写代码的人用最低标准。JFrog 文末也提到 App Store 版"底层风险是同一类问题"。

* * *

## 四、Intel Mac 的死局：官方不给你补丁

这才是这次漏洞最扎心的部分。Parallels Desktop 27 系统要求里处理器只列 Apple Silicon，操作系统最低 macOS Sonoma 14.7。Parallels 在 27 里正式砍掉 Intel Mac 支持，理由是"跟随苹果的计划"——macOS 26 Tahoe 是最后一个支持 Intel 的 macOS，macOS 27 已经 Apple Silicon only。

JFrog 报告里写得很明白：补丁在 27.0.0。但 Intel Mac 装不了 27，只能停在 26.x，JFrog 也明确说"停留在 26.x 线的宿主机，包括 26.4.2，都没有这个解压修复"。最新的 26.4.2（build 57518，9 月 8 日发布）发行说明里只提了一个企业版部署问题，没提这个 CVE。

![Intel Mac 用户的版本困局](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9f71e5823355152.png "Intel Mac 用户的版本困局")

Parallels 8 月 25 日发过声明："Parallels Desktop 26 今天完全支持 Intel Mac，未来也不会变"，并承诺 Intel 用户"可以期待未来的安全与维护更新"。但 JFrog 报告和 26.4.2 发行说明都没提修复，Parallels 也没承诺 26.x 线会补。

更狠的是 JFrog 最后那句："攻击者拿到 root 后可以通过 launchd（macOS 的系统服务管理器）保持持久化驻留，产品更新清不掉。"就算你哪天拿到补丁，已经被攻破的机器仍然处于被控状态。

* * *

## 五、自检与防御建议

两条只读命令能立刻判断 Mac 是否暴露： `defaults read "/Applications/Parallels Desktop.app/Contents/Info" CFBundleShortVersionString` 查版本， `ls -l /var/run/prl_disp_service.socket` 查套接字权限位。JFrog 的判定标准是：版本在 26.4.0 附近且套接字显示 `srwxrwxrwx` ，就视为暴露，直到确认升级到带修复的版本。两条命令只能反映暴露面，不能反映是否已被攻破。

防御建议分三档。Apple Silicon 用户尽快升到 27.0.1（build 58670，9 月 1 日）；用 MDM 推送升级的先确认版本规则不会把 v27 推到 Intel Mac。Intel Mac 用户短期内没有补丁，建议限制能本地登录的账户，同时排查所有装了 Parallels 的 Mac 建立资产清单，必要时临时卸掉换 UTM 或 VMware Fusion。所有用户都应检查 launchd 持久化痕迹，看 `/Library/LaunchDaemons/` 和 `/Library/LaunchAgents/` 下有没有创建时间异常的 plist；已被 root 过的机器，备份数据后重装最稳。

* * *

## 六、总结

ParaShells 不是那种让人惊掉下巴的 0day——它甚至有点"老套"。JFrog 这份报告真正敲打的，是软件厂商对旧硬件用户的态度：一边砍掉 Intel 支持，一边不承诺 26.x 线的安全更新，等于在 Intel Mac 用户头顶挂了一把没柄的剑。

至于攻击者？Apple Silicon 的 Parallels Desktop 26.4.0 用户，本地账户就能 root；Intel Mac 的 Parallels Desktop 26.x 用户，本地账户也能 root，而且没人来救。两种情况的攻击面都是"装上 Parallels 就自动生效"，比大多数 RCE（远程代码执行）漏洞都更接近"白送"。

最讽刺的彩蛋是漏洞名——ParaShells，致敬 2014 年的 Shellshock。十年过去了，命令拼接这种基础错误还在以 root 权限运行的服务里活蹦乱跳。

**版权声明**：本文由华盟网原创发布，保留所有权利。配图由华盟网授权使用。

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
