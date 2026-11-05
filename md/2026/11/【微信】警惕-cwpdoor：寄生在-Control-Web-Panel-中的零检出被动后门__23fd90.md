---
title: 【微信】警惕 cwpdoor：寄生在 Control Web Panel 中的零检出被动后门
source: https://mp.weixin.qq.com/s/hDkWyDkCUIFVvYOt-uM1IQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T17:02:00+08:00
trace_id: 4bc0cebb-8152-4b7c-bc66-1f01ecf1829e
content_hash: 641754e6e69d2818cf21607393abf02df2d954dee14a2e4145bc9fd8d76ee948
status: synced
tags:
  - 微信
  - Linux安全
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 奇安信XLab披露零检出被动后门cwpdoor：寄生CWP面板的cwpsrv服务器中，经特制HTTP头触发任意命令执行并抹除访问日志。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 40f75244-d011-81d7-85d4-ed340d001e0d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 奇安信XLab披露零检出被动后门cwpdoor：寄生CWP面板的cwpsrv服务器中，经特制HTTP头触发任意命令执行并抹除访问日志。
> 
> - **感染方式：** 投放脚本伪装“版本更新”，需root权限，将恶意二进制覆盖 /usr/local/cwpsrv/bin/cwpsrv，成功后恢复文件与目录时间戳、执行 history -d 清除命令记录，并向 136.0.141.71 回传结果。
> - **触发链路：** 攻击者发送携带 X-Ngx-Integrity-Time/Data/Sig 三个HTTP头的请求；cwpdoor 以 ±300 秒时间窗校验时间戳、用内置RSA公钥验签，再用AES-256-CBC解密指令（密钥取自公钥字符串SHA256），经Unix套接字交helper子进程执行，结果加密回传。
> - **隐蔽手段：** 触发后篡改日志模块上下文使本次请求不落日志；防重放由时间窗+签名绑定实现；全球超34万CWP实例暴露于互联网，均为潜在感染目标。
> - **在野证据：** 2026年9月30日巴西上传至VirusTotal的 evidencia.tgz 中，cwpdoor样本检测率为0，同包 libkeyutils 被判定为Ebury后门，两者关系尚不明确。
> - **排查处置：** 用 `ss -axp | grep integrity` 检查 ngx_http_integrity_helper 套接字及异常helper进程；用 cwpsrv.prev-* 备份恢复文件、升级版本，并立即轮换面板凭据、按主机失陷排查。

**奇安信XLab** *2026年11月5日 15:33*

背景介绍

2026年6月29日，XLab大网威胁感知系统捕获了一个名为“cwpsrv_update.sh”的可疑脚本。该脚本的功能是从远程服务器136.0.141.71下载cwpsrv文件，并替换系统中的同名文件。经分析确认，下载的cwpsrv是一个被动式后门木马，可通过HTTP/HTTPS流量中特定的header触发，远程执行黑客的攻击命令。基于这个木马针对的是CentOS Web Panel，我们将它命名为cwpdoor。

cwpdoor 并非独立的恶意软件，而是寄生于 cwpsrv服务器 —— 攻击者在 cwpsrv 源码中植入恶意代码后重新编译而成。作为被动式后门，它在运行时并无明显恶意行为，表现如同正常的 cwpsrv 服务器；只有接收到攻击者构造的特定请求时，才会被动触发后门逻辑。而在触发的同时，它还会抑制本次请求的日志记录，使这次交互在访问日志中不留痕迹。这种"直接替换正常 cwpsrv 二进制文件"配合"被动触发"再叠加"日志抑制"的技术组合，极大增强了 cwpdoor 的隐蔽性。

Centrol Web Panel（CWP）是一款面向CentOS等Linux发行版的免费开源服务器管理控制面板，用于通过图形界面管理网站、DNS、邮箱等服务器资源，替代繁琐的SSH命令行操作；而cwpsrv则是CWP自身管理面板专用的Web服务器，专门负责运行CWP的控制面板界面及相关内置应用。根据奇安信网络空间测绘全球鹰图平台的数据，过去一个月暴露在互联网的 CWP 实例超过 34 万，它们都是cwpdoor的潜在感染目标。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/563cc385ff05d012.png)

2026年9月30日，一个名为evidencia.tgz的文件从巴西上传至VirusTotal，该压缩包内含俩个恶意文件：libkeyutils.so.1.5.2和cwpsrv.suspeito。其中libkeyutils已被大多数厂商正确判定为Ebury后门，但cwpsrv.suspeito的检测率为0——该文件正是cwpdoor后门。这表明此次攻击活动并非实验性质，在野已存在真实受害者。（注：Ebury 与 cwpdoor 的关系尚不明确，有可能是同一台服务器被不同攻击者植入的两种恶意软件。）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f616a7b346a9b5c7.png)

考虑到主流安全厂商尚未识别cwpdoor，我们决定撰写本文，向安全社区分享相关情报。我们也希望有独特视野的友商不吝分享线索，以厘清cwpdoor的传播渠道，共同维护网络安全。

* * *

脚本分析

## 投放脚本分析

2026年6月29日捕获的感染脚本的基本信息如下所示：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ce41771b6aaff1ef.png)

这个脚本的功能非常直观，它是一个以“版本更新”为伪装的 cwpsrv 替换投放器（仅支持 1.24.0 和 1.15.10 两个版本）：它必须以root 权限运行，先检测本地 cwpsrv 版本，下载对应二进制并校验版本一致后，备份原文件、停止 cwpsrv 服务、用恶意二进制覆盖 /usr/local/cwpsrv/bin/cwpsrv，再启动服务并检查 master/worker/helper 进程是否存活；若健康检查失败则自动回滚，若成功则删除临时文件和备份。最关键的是，它在成功或失败后都会把新二进制的 atime/mtime 以及所在目录的时间戳恢复成原文件的旧时间，并执行 history -d 删除当前会话命令历史，使替换后的文件在 ls、stat 等常规检查下看起来“从未被改动”，同时向 136.0.141.71 回传更新结果。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8a9f546de8a340c1.png)

* * *

cwpdoor分析

我们共捕获了2个cwpdoor样本，分别针对cwpsrv 1.15.10和1.24.0两个版本。下文以针对1.15.10的样本为主要分析对象，其基本信息如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b4883c2cbd07f183.png)

cwpsrv本质上是CWP基于Nginx定制的服务器，专门负责运行CWP的控制面板界面及相关内置应用。此次攻击中投放的cwpdoor，是在cwpsrv源码基础上加入了恶意后门功能——后门可通过特定的HTTP流量触发，远程执行攻击者下发的指令。

一次完整的攻击交互如下所示：

1.  发起：攻击者构造 HTTP 请求，在头部携带 X-Ngx-Integrity-Time（时间戳）、X-Ngx-Integrity-Data（AES 加密的指令）、X-Ngx-Integrity-Sig（RSA 签名）。
    
2.  校验：cwpdoor 主进程在请求入口拦截，校验时间戳并用内置公钥验签；任一不通过，请求即按普通流量继续处理，不触发后门逻辑。
    
3.  执行：校验通过后，主进程解密出指令，经 Unix 套接字交给 helper 子进程执行。
    
4.  回传：执行结果经 AES 加密，以 application/octet-stream 的 200 响应回传攻击者，同时抑制本次请求的日志记录。
    

cwpdoor 样本虽经 strip 处理，但仍保留了大量函数名等符号，逆向分析门槛很低。下文将简要剖析后门功能的实现方式，并梳理主机被感染后的特征，以帮助运维和应急人员快速排查与处置。

* * *

## 感染特征排查

①感染后的特征

cwpdoor 并非独立的恶意软件，其恶意代码寄生于正常的 cwpsrv 服务器中。判断是否被感染，可依据 cwpdoor 依赖 Unix 域套接字 ngx_http_integrity_helper 进行消息传递这一特征，通过执行 ss -axp | grep integrity 进行快速排查。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f31ff18881b9fd55.png)

除套接字外，进程与文件层面也有特征可查：

-   进程特征：ps aux | grep cwpsrv，检查输出中cwpsrv是否存在异常的 helper 子进程。
    
-   文件特征：strings /usr/local/cwpsrv/bin/cwpsrv | grep X-Ngx-Integrity，检查输出中是否存在异常字串。
    

* * *

## 隐蔽指令信道

②隐蔽的后门信道

cwpdoor 新增了 ngx_http_integrity_init 和 ngx_http_integrity_check 两个函数，用于实现被动后门功能。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca0e1e2907c52a0b.png)

1: ngx_http_integrity_init（启动器 / 植入点）

该函数在 ngx_http_block 配置解析收尾阶段被调用，作用是在 cwpsrv进程中植入一个常驻后门服务。它首先遍历 ngx_modules 定位并缓存日志模块索引（供后续日志抑制使用），随后清理可能残留的旧 helper 进程，创建并绑定 Unix 域套接字 ngx_http_integrity_helper，并创建一个独立的 helper 子进程，用于执行攻击者下发的指令。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e9b7b16d11af12f5.png)

2: ngx_http_integrity_check（触发器 / 指令通道）

该函数在 ngx_http_process_request 入口处被调用，构成后门的外部触发点。它从 HTTP 请求头中提取 X-Ngx-Integrity-Time、X-Ngx-Integrity-Data 和 X-Ngx-Integrity-Sig。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ebe0377ec0d29f9c.png)

其中X-Ngx-Integrity-Time 字段携带时间戳，cwpdoor 以 ±300 秒的时间窗口进行校验。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1eadea6104595d5a.png)

X-Ngx-Integrity-Sig 字段承载 Base64 编码的数字签名，cwpdoor 用内置 RSA 公钥对其验签。验签原文是 <X-Ngx-Integrity-Time 的值>:<X-Ngx-Integrity-Data 的值> 拼成的整体，因此单独改动时间戳或密文都会导致签名失效——三者被绑定在一起，再配合 ±300 秒的时间窗口，共同实现防重放与授权控制。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f893b0d7f691714.png)

样本内置RSA公钥采用XOR加密，解密时只需将每个字节与0x55异或即可还原。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/08471f55f0b5c73b.png)

解密后的公钥如下所示：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae278094fb944840.png)

X-Ngx-Integrity-Data 字段为 Base64 编码的 AES 加密攻击指令：Base64 解码后，前 16 字节是 IV，其余为 AES-256-CBC 密文；AES 密钥则由内置 RSA 公钥字符串的 SHA256 摘要派生。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24430e38e6f6f943.png)

解密后的指令经 Unix 套接字送入 helper进程 执行，执行结果同样以 AES 加密，并封装为 application/octet-stream 的 200 响应回传，由此构成双向加密的隐蔽指令通道。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a5a41b7c63d0477.png)

后门一旦命中触发请求，便会复制该请求的模块上下文数组并加以篡改，将日志模块对应的上下文指针替换，使本次请求无法正常写入日志、溯源链就此断裂。再叠加 cwpdoor 的"零查杀"，二者共同构成"藏得住、查不到"的完整无痕攻击闭环。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7926f2a214731dc6.png)

* * *

## 处置建议

总结

这是我们目前掌握的关于 cwpdoor 的全部情报。网络管理员可依据前文「感染后的特征」章节进行排查。若确认已被感染，建议按以下步骤处置：

1.  在 /usr/local/cwpsrv/bin 目录下找到攻击者备份的正常文件（命名格式 cwpsrv.prev-$(date +%Y%m%d-%H%M%S)），用其替换恶意的 cwpsrv；
    
2.  升级至最新版本，并确认 ss -axp | grep integrity 不再命中；
    
3.  立即轮换所有面板凭据，由于后门可执行任意命令，相关凭据应视为已泄露，建议按主机已失陷排查同机其他威胁。
    

我们尚不清楚 cwpdoor 通过何种漏洞传播，也不确定 evidencia.tgz 中的 Ebury 与 cwpdoor 是否存在关联。欢迎有独特视野的友商、了解内幕的读者向我们提供更多情报。如果你对我们的研究感兴趣，或希望获取帮助，可通过公众号留言与我们联系。

对威胁情报感兴趣的读者，请点击下方的“”访问我们的官方博客，原文提供了cwpdoor详尽的IoC。
