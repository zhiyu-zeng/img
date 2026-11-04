---
title: 【微信】Linux 蓝队应急响应“一把梭”检查脚本
source: https://mp.weixin.qq.com/s/kXYfuz_dmlkT9_IvYny5bA
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T18:10:53+08:00
trace_id: aadf252e-0a49-4a25-9d4a-70f76375b0fb
content_hash: d4cd77eb0414980cc53cdc012107949c1adf6c3945f58218f7fa80cdac830b62
status: synced
tags:
  - 微信
  - Linux安全
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: LinuxGun 是一款纯 Shell 离线运行的 Linux 应急响应检查脚本，批量采集主机排查信息并落地存证，供安全人员人工研判。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 40e75244-d011-81ad-afde-c864288614a4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LinuxGun 是一款纯 Shell 离线运行的 Linux 应急响应检查脚本，批量采集主机排查信息并落地存证，供安全人员人工研判。
> 
> - **定位与局限：** 需 root 权限执行；本身不做流量拦截、不查杀恶意程序、不自动判定失陷，仅模块化批量执行排查命令并保存输出，风险须人工复核。
> - **版本矩阵：** 由旧版 linuxcheck（v5.0 停更）模块化重构而来，仓库并存四个脚本——交互增强版 linuxGunPro.sh、快速稳定版 linuxGun.sh、旧版一键全量 linuxcheck.sh 及英文输出版 linuxcheck_EN.sh。
> - **检查范围：** 覆盖 15 大类，可归为五组：账户与登录（克隆用户、口令策略、wtmp/btmp）、持久化（crontab、服务、启动项）、网络（混杂模式、高危端口、防火墙、ARP）、文件与日志（SUID/SGID、24 小时变动文件、auditd 等）、基线与扩展（K8s、黑客工具规则匹配）；部分模块标注未完成，选型前需留意。
> - **使用要点：** 必须下载完整文件夹，否则规则匹配空跑不报错；结果输出至 output/ 并打包 tar.gz 取证；同一天同一主机重复执行会覆盖上次结果，建议跑完立即改名留存。
> - **配套工具：** tools/ 目录提供指定 IP 通信进程定位、网卡流量实时监控、iptables/firewalld 批量封禁管理，以及带 token 认证的 HTTP 结果回传服务。

**网络个人修炼** *2026年11月4日 16:32*

LinuxGun 是安全从业者 sun977 开源的 Linux 主机安全排查脚本，仓库在 GitHub 的 sun977/Linuxgun。作者在 README 联系方式中自述所属“启点安全实验室”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6dfe4fd6dc199131.png)

脚本用纯 Shell 编写，不依赖 Python，不依赖第三方库，运行时不需要联网。早期版本叫 linuxcheck，更新到 v5.0 后停止迭代；在此基础上做模块化重构，新版本叫 linuxGun。目前仓库里并存四个脚本：

|     |     |     |
| --- | --- | --- |
| 脚本  | 版本  | 说明  |
| linuxGunPro.sh | 增强版 | 交互模式，详细日志记录和错误追踪的场景 |
| linuxGun.sh | 稳定版 | 快速应急响应场景 |
| linuxcheck.sh | 旧版本 | 一键全量检查场景 |
| linuxcheck_EN.sh | 旧版本 | 纯英文输出场景 |

## 执行逻辑与局限

核心工作逻辑说明：

脚本需要 root 权限执行；本身不具备流量拦截、恶意程序查杀能力，也不会自动判定主机是否失陷。它本质是模块化批量执行排查指令，把命令输出、原始日志采集落地保存，所有可疑风险，需要安全人员人工复核研判。

* * *

一、能查什么

按帮助信息，脚本覆盖十五个大类，大致可以归为五组：

账户与登录——系统基础信息（IP、发行版、内核）、登录用户、克隆用户（UID 重复的账户）、非系统用户、口令策略、last/lastlog/wtmp/btmp 登录记录。

持久化——系统级与用户级 crontab、系统服务、用户服务、启动项、/etc/rc.d/rc.local。

网络——ARP 欺骗迹象、TCP/UDP 高危端口、ss 连接与对应进程、DNS 配置、网卡混杂模式、路由表、防火墙策略、IP 转发开关。

文件与日志——敏感目录（/tmp、/root、隐藏文件）、SSH 配置、环境变量、/etc/hosts、shadow 属性、24 小时内变动文件、SUID/SGID 特权文件；日志侧覆盖 messages、secure、cron、yum、dmesg、journalctl、auditd。

基线与扩展——安全基线检查、Kubernetes（集群信息、secret 凭据、敏感文件、基线）、黑客工具规则匹配、系统性能。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b76dc26604b3454a.png)

重要提示：部分模块作者在帮助信息里标注了开发状态（未完成 ），选型和使用前务必留意，不要预期过高。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0b732cb6805f1e81.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c3f6314bc0eb9e3b.png)

* * *

## 下载与运行

二、怎么下载、怎么跑

仓库地址：https://github.com/sun977/Linuxgun

```bash
git clone https://github.com/sun977/Linuxgun.git    # 目标机可联网
unzip Linuxgun.zip #离线环境：本地下载 Linuxgun.zip 压缩包上传主机后解压
```

注意： **必须下载完整文件夹**，脚本依赖目录内配套规则文件，只拷单个脚本不会报错，但规则匹配会空跑。

运行前赋权

```
chmod +x linuxGunPro.sh 
```

常用运行示例

```bash
sudo bash linuxGunPro.sh [选项] 
# -h 参数查看帮助
sudo bash linuxGunPro.sh -h 
# 指定模块函数运行（分析用户信息模块函数）
sudo bash linuxGunPro.sh --system-user 
# 完全交互模式运行（在执行每个模块前询问用户）
sudo bash linuxGunPro.sh --all --inter
#全量运行
sudo bash linuxGunPro.sh --all
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c8bc129e7f5c9dfd.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b0c8f537883af2b.png)

## 结果留存

查看结果

所有采集产物输出在当前目录 `output/` 下,根目录下另有打包好的 tar.gz，取证时把整个包拿走即可。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2fd6b271bca9bb6d.png)

完整路径：

即 output/linuxgun\_<IP信息>\_<日期>/check_file

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61af329a7185a4d9.png)

风险提醒：同一天、同一台主机重复执行脚本，会覆盖上一次的检测结果，多次排查建议跑完立即把 tar.gz 复制改名留存。

* * *

## 三、其他

## 配套工具

脚本还带了几个配套小工具，放在 `tools/` 目录：

-   `monitorPs2Ip.sh <IP>`
    
    实时定位与指定 IP 通信的进程（支持 TCP/UDP）；
    
-   monitorInter.sh <网卡>
    
    实时查看网络接口出入流量；
    
-   `blockIP/`
    
    IP 封禁管理，支持 iptables 与 firewalld，可批量、可备份恢复；
    
-   `uploadServer/`
    
    HTTP 文件上传服务（基于Python），用于接收 `--send` 发送的结果，带 token 认证。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f4ce3bd8f9de408.png)
    

网络工具 · 目录
