---
title: 【微信】政府Linux服务器遭定向攻击，涉SysGoRAT及疑似AI生成脚本
source: https://mp.weixin.qq.com/s/5ii-t_jcAfVD3LI-mbThvw
source_host: mp.weixin.qq.com
clip_date: 2026-11-03T19:02:32+08:00
trace_id: 4c13e768-d286-4ef4-a43e-c02c7e2c7014
content_hash: 7b5c62da80331f21a4a6f257e05818a359ab5ac1c879c5d04909e0c0818199b2
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40d75244-d011-814b-95a3-de331c552fa9
ioc: null
---

**FreeBuf** *2026年11月3日 18:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/01ead7b2ef4f7cbb.png)

网络安全研究人员披露了一起专门针对政府实体及国家关联机构Linux基础设施的网络间谍活动细节。

派拓网络（Palo Alto Networks）Unit 42团队在2025年10月至2026年4月间观测到这一活动，将其追踪编号定为CL-UNK-1211，其中"CL"代表活动集群，"UNK"代表动机未知。这起活动的一个显著特征是，攻击者使用大语言模型（LLM）和/或自动化AI Agent生成攻击载荷、执行恶意代码。

Roey Porat和Tom Fakterman表示："该活动集群背后的攻击者聚焦Linux环境，开展大规模侦察并维持持久网络访问，为情报收集活动提供支持。攻击者还尝试转储敏感数据库、窃取政府邮箱数据，以获取社交媒体账号访问权限。"

此次攻击活动战术灵活多样，组合使用开源工具、定制跨平台后门和Webshell维持访问权限。攻击者的另一个典型特征是，会尝试禁用端点防护、清除系统日志，还会植入具有欺骗性的红队标记，将攻击活动伪装成合法的安全评估行为。

研究人员还观测到，威胁攻击者使用疑似AI生成的恶意PHP脚本和Shell脚本，实现持久化驻留、开展侦察、窃取数据。

派拓网络指出："这些脚本中没有标准的开发者文档，反而包含对话式的分步推理注释，向提供初始指令的操作者解释代码逻辑。这类注释的存在说明，代码要么是直接复制自AI提示词的输出结果，要么是由自动化AI Agent部署的。"

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fb565bcbfdc9226a.png)

Part01

攻击者组合使用多类工具

攻击者组合使用开源和定制化PHP Webshell，在目标网络中植入持久化后门。获得访问权限后，攻击者会通过三种方式从目标环境中窃取凭证：

-   将.bashrc文件替换为包含密码窃取命令的恶意版本；
    

-   向PHP登录页面注入代码，收集管理员凭证；
    

-   扫描配置文件和命令历史文件，查找明文存储的邮箱、SMTP及数据库密码。
    

此次攻击中还投放了一款用Go语言编写的定制化跨平台远程访问木马SysGoRAT，支持多种持久化机制，可在Windows和Linux系统上维持长期访问。该木马会通过WebSocket向硬编码IP地址（104.194.158\[.\]65:443）建立C2连接，支持接收并执行七类命令：

-   command类：在Linux系统通过/bin/sh -c、Windows系统通过cmd /C执行任意命令；
    

-   control类：通过子命令启动交互式Shell（shell_start）、截取屏幕（screenshot）、向C2服务器外传文件（download）、安装持久化机制（persist）；
    
-   list_dir类：列出目录内容；
    
-   shell_input类：创建交互式Shell会话；
    
-   proxy_connect类：向任意目标建立TCP连接；
    
-   proxy_data类：在已建立的代理连接上双向转发数据；
    
-   proxy_close类：终止并清除代理会话。
    

![SysGoRAT攻击链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8c2dcc229ed7259a.png)  

此外，攻击者还使用内存型反向Shell，避免在磁盘上留下取证痕迹；同时遍历/var/qmail/mailnames/目录，统计特定文件夹中存储的邮件数量。

Unit 42解释称："完成上述操作后，攻击者会搜索与社交媒体相关的邮件。他们投放了名为search_social.php的PHP脚本，在邮件头中搜索特定关键词，并以易读的格式展示结果。"

该脚本还会解析响应内容，展示对应的精确文件路径、社交媒体账号相关邮件的发件人、收件人及邮件主题。

研究人员还发现，攻击者曾尝试生成名为zip_mails.sh的Bash脚本，计划将目标邮件压缩为ZIP包后外传，但由于脚本存在语法错误，运行时直接执行失败。

Unit 42表示："这起活动表明，攻击者正在将传统后渗透技术与AI加速的工作流结合，针对政府Linux服务器基础设施发起攻击。CL-UNK-1211背后的攻击者借助AI快速生成、调整、部署攻击脚本，在保持高攻击节奏的同时，降低了手动开发的工作量。"

Part02

Agentic攻击框架遭广泛滥用

同一时期，谷歌威胁情报组（GTIG）、Mandiant与微软共同发布报告称，威胁攻击者正在滥用ARTEX、PentAGI、Hexstrike、CAIRN等开源Agentic渗透测试框架，以前所未有的速度和规模，在攻击生命周期的各个阶段实施各类攻击行为。

在ARTEX被广泛滥用的报告公开后，其作者已下架该框架，但目前已衍生出多个版本，包括商业化版本ARTEX PRO，以及本地化变体ScopeWeaver。目前已观测到的相关滥用案例包括：

-   编号Storm-0940（又称UNC7228）的威胁组织使用ARTEX，针对美国、欧洲的企业软件、工业自动化、半导体制造与设计、电信行业实体发起数据窃取活动；
    
-   牟利型威胁攻击者使用ARTEX实施数据窃取勒索活动，目标包括亚洲地区的金融行业机构；
    
-   朝鲜国家背景黑客组织Onyx Sleet（又称Andariel）、Pearl Sleet（又称Lawrencium）在攻击活动中使用ARTEX；
    
-   攻击者使用PentAGI开展WHOIS资产测绘，对亚洲地区机构进行系统性侦察和漏洞扫描。
    

GTIG与Mandiant表示："ARTEX及同类Agentic攻击入侵框架的出现，标志着威胁攻击者正普遍转向采用开源多Agent攻击框架，甚至可能使用定制化的Agentic攻击工具。"

这类框架将攻击周期压缩到机器速度，但目前为了追求攻击效率牺牲了隐蔽性。无限制的自主执行会产生可被取证的流量，依赖可识别的特征，还会在代码层面留下独特痕迹，反而增加了被检测和拦截的概率。

参考来源：

Government Linux Servers Targeted With SysGoRAT and Suspected AI-Generated Scripts

https://thehackernews.com/2026/11/government-linux-servers-targeted-with.html
