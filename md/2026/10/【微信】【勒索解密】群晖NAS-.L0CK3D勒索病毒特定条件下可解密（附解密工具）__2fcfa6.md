---
title: 【微信】【勒索解密】群晖NAS .L0CK3D勒索病毒特定条件下可解密（附解密工具）
source: https://mp.weixin.qq.com/s/MhVPW1c1n3FcubvkwGrzkA
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T15:38:27+08:00
trace_id: 56956e67-2812-4e3e-8f1b-0e810745e986
content_hash: 1de1e90224f3de8b7b7d24601c7418fb9abf2292dbad03333b9fdf065d0e65fa
status: synced
tags:
  - 微信
  - 恶意样本
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：群晖NAS遭.L0CK3D勒索后，若加密器仍在运行，可从进程内存提取会话AES密钥解密文件，但这是特定条件方案而非通用解密。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 40a75244-d011-81a1-82e4-cd2e4fcfa77e
ioc:
  cves:
    - CVE-2025-32023
    - CVE-2026-13639
    - CVE-2026-13684
  cwes: []
  hashes:
    - 802ac85d19dc6db2b1849bb3499877280544d04a0ae94d4c408b6c321669903d
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：群晖NAS遭.L0CK3D勒索后，若加密器仍在运行，可从进程内存提取会话AES密钥解密文件，但这是特定条件方案而非通用解密。
> 
> - **加密机制：** 样本为64位Linux ELF，用ChaCha8加密文件正文，每个文件有独立32字节密钥和8字节nonce，文件尾部追加588字节，其中前48字节存有AES-256-CBC加密的密钥材料；会话AES key和IV在加密器运行期间驻留内存，同一次会话的所有文件共用。
> - **恢复原理：** 并非破解ChaCha8或RSA，而是趁加密器运行时读取内存固定地址0x5427F8的会话指针，取得16字节IV+32字节AES key；进程退出或设备重启后内存被回收，此路径即失效。
> - **工具用法：** 团队发布`c3rb3r_memscan.sys`（因样本不加密.sys后缀文件而如此命名），可扫描内存生成`key.sys`，也支持用`--aes-key/--aes-iv`直接传入既有密钥；首次解密必须加`--keep-source`，因工具默认在解密成功后删除源文件，且须先单文件验证再批量恢复。
> - **时间窗口：** 实测加密速度可达2-3GB/s，数据量大且发现及时才更可能保留事中恢复条件；发现加密后应隔离网络，勿关机、重启或终止进程，勿删除加密文件与勒索信。
> - **入侵入口更新：** 群晖官方称攻击者利用2024年12月已修复的旧漏洞（Synology-SA-24:20）攻击旧版DSM设备；团队接报中DSM7.2.1-7.2.2占比最高，此前"疑似0day"表述及CVE-2026-13639/13684作为统一入口的说法不应再传播。

**solar应急响应团队** *2026年10月31日 12:22*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fef8e481955d8fbf.gif)

## 写在前面

本文首发于 **Solar应急响应团队「州弟学安全（徐龙州）、CHQ」**，转载请务必注明出处。

Solar应急响应团队由思而听（山东）网络科技有限公司组建，长期专注勒索病毒应急响应、攻击溯源与数据恢复，为遭遇突发勒索事件的企业提供7×24小时突发危机干预通道。

10月28日，我们发布了 [【勒索预警】群晖NAS最新版遭勒索病毒攻击，疑似涉及0day漏洞](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247514545&idx=1&sn=bb4ba1e1493d1d4a5661b085e6e9d887&scene=21#wechat_redirect) 。文章发布后，团队持续跟进相关样本和受害反馈，并对 **L0CK3D勒索病毒** 程序的加密流程、密钥生成和内存残留进行了进一步分析。

目前可以确认的是： **针对本文分析的勒索病毒程序样本，在加密器仍在运行、能够提取同一会话的密钥材料并保留完整加密文件等特定条件下，存在技术恢复数据的可能。** 基于样本分析和互联网公开恢复思路，团队进行了实际测试，并开发了对应的密钥提取与解密工具。

需要先强调， **这不是通用解密方案，也不代表所有`.L0CK3D` 文件都能恢复。比如加密器退出、设备重启、样本不同或会话材料已被清除时，本文工具可能无法使用。** 请先在隔离环境中备份并测试，不要直接对唯一一份加密数据批量操作。

## 一、为什么特定条件下可以恢复

本次分析对象为64位Linux ELF勒索载荷。样本使用ChaCha8加密文件正文，每个文件都有独立的32字节文件密钥和8字节nonce，并在加密文件末尾写入588字节数据。

这588字节尾部的前48字节，保存着由AES-256-CBC加密的文件密钥材料。用于加密这一密钥块的会话AES key和IV，在加密器运行期间保存在进程内存中，同一次运行环境处理的所有文件共用这一组会话材料。

因此，恢复过程并不是破解ChaCha8或RSA，而是在加密器仍运行时取得会话AES key和IV，再依次完成以下过程：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/80f3aa9b767ceaf0.png)

获取AES key和IV流程

勒索程序样本分析还显示，加密进程结束后相关内存会被操作系统回收。因此， **本文工具的在线扫描方式以加密器仍在运行为前提。加密进程退出或设备重启后，通常不能再通过该方式直接提取密钥。**

互联网公开案例中，也有受害者在发现加密后暂停进程、转储内存，并从内存中分析密钥材料，最终恢复部分文件。该个案与本次样本分析所指向的恢复条件相符，但仍只能作为特定场景下的参考。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2161004464b2996f.png)

公开案例展示了加密过程中转储内存并恢复部分文件的思路，相关讨论也受到关注

考虑到内存转储、密钥定位和文件尾部解析对操作经验有一定要求，团队将样本适配、会话密钥扫描、密钥块解析和正文恢复整合到 `c3rb3r_memscan.sys` 工具中，尽量减少手工操作。工具用于降低恢复门槛，不改变其适用条件。

## 二、使用前必须确认的条件

### 1.确认样本与文件特征

本文分析样本的主要特征如下：

| 项目  | 值   |
| --- | --- |
| 加密后缀 | .L0CK3D，其中 L 后为数字 0 |
| 勒索信 | read-me3.txt |
| 样本平台 | 64位Linux，x86_64 |
| 样本SHA256 | 802AC85D19DC6DB2B1849BB3499877280544D04A0AE94D4C408B6C321669903D |

**仅凭后缀相同不能确认属于同一样本。其他架构、其他变种或尾部结构不同的文件，不能直接套用本工具。**

### 2.确认加密器仍在运行

只有加密器仍在运行，且待恢复文件属于同一运行环境时，内存中的会话材料才可能有恢复价值。不要为了验证工具而再次运行勒索程序。

### 3.确认具备操作权限与备份条件

实时读取进程内存需要root权限。操作前应将加密文件和勒索信备份到独立存储，提取后的密钥材料也应单独备份。首次恢复必须使用 `--keep-source` 保留源文件。

**需要先说明时间窗口：团队实际测试中，该加密器的加密速度可达约2至3GB/s，实际速度受NAS性能、磁盘状态、文件类型和线程数量影响。该数据仅来自当前测试环境与样本，不代表所有设备。数据量较小时，往往很难在加密过程中及时发现；数据量较大且发现及时，才更可能保留事中恢复条件。**

如果加密早已结束、设备已经重启，建议保留现场并寻求其他恢复路径，不要对本文在线扫描方式抱有过高预期。

## 三、详细使用方法

### 1.隔离设备并保护现场

发现文件正在或已经被加密后，先隔离NAS网络，阻止攻击者继续连接，也不要让其他业务继续向设备写入数据。

**不要贸然关机、重启或终止相关进程，这些操作可能破坏内存中的恢复条件。不要直接重装系统，不要删除加密文件、勒索信和可疑进程文件。**

条件允许时，以只读方式克隆存储，或将加密文件复制到独立介质后再测试。后续恢复应优先在独立副本上进行，不要覆盖唯一一份原始数据。

### 2.检查勒索进程是否仍在运行

在终端执行：

```
pgrep -af 'MATCH_802ac85d19dc6db2|L0CK3D|init-rsysd' || echo "勒索进程未运行"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5a14964c56735003.png)

测试环境中， `pgrep` 匹配到分析样本进程并返回对应PID。

如果返回相关进程信息，说明仍存在匹配进程，应尽快在保护现场的前提下继续操作。如果只输出勒索进程未运行，表示没有匹配到相关进程，通常已不满足在线内存提取条件。

**该命令只匹配本文样本的常见名称。攻击者可能修改进程名，因此没有输出不等于绝对未运行，有输出也不等于一定能够提取有效密钥，仍需结合进程路径和内存扫描结果判断。**

### 3.提取会话AES key和IV

从团队官方工具中心获取工具后，将其放入一个独立工作目录，不要放在待恢复数据目录中。经分析，本文涉及的加密程序样本默认不加密处理`.sys` 后缀，因此工具使用 `c3rb3r_memscan.sys` 作为文件名。

进入工具所在目录，执行：

```
chmod 755 c3rb3r_memscan.sys
sudo ./c3rb3r_memscan.sys
```

工具会扫描进程PID，在适配样本的固定地址 `0x5427F8` 读取全局会话指针，定位由16字节IV和32字节AES key组成的48字节会话对象。成功提取后，程序会输出key和IV，并在工具所在目录生成 `key.sys` 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a0b10c995b459f70.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/909d0380866dfe88.png)

测试环境中，工具输出会话key和IV并生成 `key.sys`

**`key.sys` 包含敏感密钥材料，应妥善备份并限制访问，不要对外公开。出现 `UNVERIFIED_POINTER` 时，表示指针结果尚未通过验证文件确认，不等于密钥一定正确，必须先进行单文件测试。**

如果出现以下报错，通常与工具目录写权限不足有关，应使用 `sudo` 执行，并确认当前账号可以向工具所在目录写入文件：

```
key file error: cannot create /path/to/tool/key.sys
```

### 4.先解密一个文件进行验证

生成 `key.sys` 后，选择一个已经备份的非核心 `.L0CK3D` 文件进行测试：

```
sudo ./c3rb3r_memscan.sys --decrypt /path/file.db.L0CK3D --keep-source
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b66e314d0d2ba6f9.png)

解密一个文件进行测试（状态成功）

**工具默认会在解密成功后删除源`.L0CK3D` 文件。首次处理重要数据时必须添加** `--keep-source` **，不要直接使用默认模式批量操作。**

解密完成后，应实际打开输出文件，核对文件内容、大小和可用性，不能只看终端是否返回成功。数据库、虚拟机和压缩文件还应进行相应的完整性检查。

如果目标位置已经存在同名输出文件，例如同时存在 `1.txt.L0CK3D` 和 `1.txt` ，工具默认不会覆盖，并会返回失败。此时应先核对同名文件，将其移至独立备份目录后再测试，不要为了继续执行而直接删除数据。

### 5.单文件验证通过后再批量恢复

确认测试文件可以正常使用后，再处理目标目录：

```
sudo ./c3rb3r_memscan.sys --decrypt /path/to/encrypted/files --keep-source
```

目录模式只处理以 `.L0CK3D` 结尾的文件。使用 `--keep-source` 时，工具会保留原始加密文件，并生成去掉 `.L0CK3D` 后缀的恢复文件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a39385a85872e957.png)

测试输出显示21个文件成功、1个失败，提取密钥后仍需逐文件核对恢复结果。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ec1e7d3b2f7b5226.png)

实测恢复NAS中被L0CK3D加密的数据文件（状态成功）

**成功提取密钥不等于所有文件都能恢复。文件被截断、尾部被改写、来自不同运行会话或正文已被篡改时，仍可能失败。正文没有认证标签，工具可以验证密钥块和处理流程，但不能证明正文从未被篡改。**

批量处理后，应保留终端日志和失败文件清单，不要反复对同一原始文件写入。恢复完成后，还需逐项检查重要业务文件是否真实可用。

### 6.已有key和IV时的使用方法

如果已经通过其他取证方式取得同一会话的key和IV，可以不重新扫描内存，直接传入参数：

```
sudo ./c3rb3r_memscan.sys \
  --decrypt /path/to/files \
  --aes-key <64个十六进制字符> \
  --aes-iv <32个十六进制字符> 
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0c4cd145ba9c5ed5.png)

已有key和IV时的使用方法图示

key和IV必须来自加密这些文件的同一次运行环境。不同会话的材料不能混用，填入后也应先进行单文件验证。

## 四、工具下载

工具将通过以下两个官方页面发布，可在工具中心搜索 `L0CK3D` ，具体名称、版本和更新说明以页面实际上架内容为准：

```
https://应急响应.com/tools
https://应急响应.cn/tools.html
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a1d1dc7bd3a2b004.png)

应急响应.com工具中心提供勒索病毒恢复工具下载入口

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/021f878f2a6731c6.png)

应急响应.cn工具中心可按工具名称检索并下载

页面公布的下载文件解压密码为 `solarsecurity` 。如果暂未检索到本工具，可稍后刷新页面或通过文末方式联系团队，不要下载来源不明的同名程序。

## 五、关于入侵入口的信息更新

除恢复方法外，大家同样关心攻击者究竟通过哪个漏洞进入设备。

群晖官方近日发布 [群晖提醒尽快更新 DSM，防范旧版本面临安全威胁](https://mp.weixin.qq.com/s?__biz=MzAxMzAxNzUzMw==&mid=2650569371&idx=1&sn=40c5fde783143e9847f80c4fe62d8fb9&scene=21#wechat_redirect) ，说明恶意攻击者正在利用2024年12月已完成修复的安全弱点，攻击仍运行旧DSM版本的设备。

这份官方信息为排查提供了重要方向，但没有指明本轮事件对应的具体CVE，也不能证明所有受害现场都由同一入口造成。假设按照官方说法，那么此前网传将CVE-2026-13639、CVE-2026-13684作为本轮统一入口的说法，则不一致，不应继续作为结论传播。

我们此前根据初期集中受害反馈，将事件表述为“疑似0day”。随着官方说明发布，当前判断也需要相应调整： **应优先排查Synology-SA-24:20涉及的旧漏洞、设备实际补丁状态和入侵时间，不再用“疑似0day”概括全部事件。**

根据团队接到的数十起事件反馈，DSM7.2.1至7.2.2占比最高，7.4.0至7.4.1占比较低。 **该统计仅来自团队已经接触的反馈样本，不代表整体受害分布。** 其中还需排除黑群晖、部分组件未同步更新、升级时间晚于实际入侵等情况，版本大项也不能代替具体补丁号。

目前，团队仍在对受灾版本的日志和源码进行对比。若后续确认更具体的入侵入口或影响范围，我们会继续同步更新。

## 写在最后

本文工具解决的是特定样本、特定运行状态下的数据恢复问题，不是通用解密工具，也不能替代备份。 **操作时请始终保留原始加密文件，先单文件验证，再批量恢复。**

数据恢复也不等于事件处置已经结束。文件恢复后，仍需继续排查入侵入口、异常计划任务、持久化项和账号凭据，避免设备再次被攻击。如果设备仍在加密，或无法判断样本是否适配，建议先隔离网络并保护现场，可联系Solar应急响应团队协助。

> 文章撰写与优化： **州弟学安全（徐龙州）**
> 
> 逆向分析与工具开发： **CHQ**
> 
> 排版优化： **超级油麦**

> 在企业日常的安全运维中，突发勒索病毒往往让人措手不及。遇到这种情况，正确的应急响应流程能够最大程度控制影响范围、降低数据损失。
> 
> 这里为大家准备了一张完整的《勒索病毒应急处置指南》长图，建议各位安全从业者和IT运维人员收藏备用。如遇突发情况，请保持冷静，参考本图进行快速、规范的处置
> 
> 附加资料下载：防御与响应同样重要。扫描图末的二维码，还可以直接获取完整的《2025年勒索病毒年报》、《2026年勒索病毒上半年报》以及《勒索处置一体化》等专业文件，帮助大家深入了解当前的威胁趋势，提前做好防御规划。
> 
> 安全无小事，掌握科学的处置流程，是我们应对突发安全事件最有效的武器。

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d695700a86671578.png)

以下是solar安全团队近期处理过的常见勒索病毒后缀：

|     |     |     |
| --- | --- | --- |
| **收录时间** | **病毒家族** | **相关文章** |
| 2025/01/14 | Medusalocker | [【病毒分析】深入剖析MedusaLocker勒索家族：从密钥生成到文件加密的全链路解析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247497133&idx=1&sn=450c9eacc3956465a4c74fbdc1e6aa6e&scene=21#wechat_redirect)<br><br>[【病毒分析】新版勒索病毒MEDUSA LOCKER 首发深度分析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247503856&idx=1&sn=c598583331355f663797d16674d27849&scene=21#wechat_redirect) |
| 2025/01/15 | Medusa | [【病毒分析】“美杜莎”勒索家族：从入侵到结束的全流程深度解析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247496674&idx=1&sn=563563c98553956ba754f944352c26b3&token=227041078&lang=zh_CN&scene=21#wechat_redirect) |
| 2024/12/11 | weaxor | [【病毒分析】新崛起的weaxor勒索家族：疑似mallox家族衍生版，深度解析两者关联！](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247494968&idx=1&sn=3f2094961acc2a71a89d212025cb2edc&token=227041078&lang=zh_CN&scene=21#wechat_redirect) |
| 2024/10/23 | RansomHub | [【病毒分析】Ransom Hub:唯一不攻击中国的2024全球Top1勒索家族——ESXi加密器深度解析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247494152&idx=1&sn=890e58fbf8a7608ab92357dc60a41782&scene=21#wechat_redirect) |
| 2024/11/23 | Fx9 | [【病毒分析】Fx9家族首次现身！使用中文勒索信，熟练勒索谈判](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247493776&idx=1&sn=ed36290b329163feacefc1629fc7506a&scene=21#wechat_redirect) |
| 2024/11/04 | Makop | [【病毒分析】揭秘.mkp后缀勒索病毒！Makop家族变种如何进行可视化加密？](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247493346&idx=1&sn=f4e4ba03c43332158456bed4399409e9&token=740585290&lang=zh_CN&scene=21#wechat_redirect) |
| 2024/06/26 | moneyistime | [【病毒分析】使用中文勒索信及沟通：MoneyIsTime 勒索家族的本地化语言转变及其样本分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247493109&idx=1&sn=f70df4695b9e680f0b25b414cb1df28f&chksm=c20bd5f1f57c5ce732f842c42e526022a5541fb1314e0f6be25ac612825bdc472fafaa9cecf4&scene=21#wechat_redirect) |
| 2024/04/11 | babyk | [【病毒分析】BabyK加密器分析-Windows篇](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247487509&idx=1&sn=479d4f3628859dae82b177a8bdfa5b2d&chksm=c2082011f57fa907896ea111d93f3c6d181b9b52a1e3b0a632c81aa30b2995e06a8420335253&scene=21#wechat_redirect)  <br>[【病毒分析】Babyk加密器分析-NAS篇](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247489030&idx=1&sn=f9f57acd4ab2ef480099b960463ca8ac&chksm=c2082602f57faf146991ce8af68cb12ff80676992afd2f65f18754417ba9c2dc4f5a9ccfeed2&scene=21#wechat_redirect)  <br>[【病毒分析】Babyk加密器分析-EXSI篇](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247491906&idx=1&sn=a9a55f464fe0a919e29f08bae5e73b4b&chksm=c20bd146f57c5850f2ff4c5b14326cf2348ae941248192fe2f01648b5fa07cdc59ce4bb8d483&scene=21#wechat_redirect)  <br>[【病毒分析】Babuk家族babyk勒索病毒分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247486166&idx=2&sn=f6cdf0f0e24a366433be8d656eb528da&chksm=c2083ad2f57fb3c4e7bd744e5d7cbd5e71b88827e267c1d996411fe6202b0e0542f7de835243&scene=21#wechat_redirect)  <br>[【成功案例】利用多款国产内网渗透工具勒索数十台虚拟机的babyk解密恢复项目](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247486166&idx=1&sn=6d24d5fd782d627fce347e0c8e200263&chksm=c2083ad2f57fb3c4c8e6f3716499f71c4bb0a8cac20f7094945885d806049bf4a40bd5e50da9&scene=21#wechat_redirect) |
| 2024/09/29 | lol | [【病毒分析】全网首发！全面剖析.LOL勒索病毒，无需缴纳赎金，破解方案敬请期待下篇！](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247492281&idx=1&sn=5ba48ab1bc2a61dc8cf049be3a3fe0d5&chksm=c20bd2bdf57c5babc7c06b81951d17a3e6c7ca001377f3129b4777c8fbd171a6a1ba946605e1&scene=21#wechat_redirect)  <br>[【工具分享】.LOL勒索病毒再也不怕！完整破解教程分享+免费恢复工具首发](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247492349&idx=1&sn=98dd76a23608a6e7d2333e9ca7ecc572&chksm=c20bd2f9f57c5befa6fec74e21562cc2a52dd95fd006b945d0526294c0e3544a199845f144a5&scene=21#wechat_redirect) |
| 2024/06/10 | MBRlock | [【病毒分析】假冒游戏陷阱：揭秘MBRlock勒索病毒及其修复方法](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247488946&idx=1&sn=bbdc2c5e32d074e372d2a73d415e78af&chksm=c20825b6f57faca055f865b75892a0c095a96354f4a745433339b884dd9285651e37442731a1&scene=21#wechat_redirect) |
| 2024/06/01 | Rast gang | [【病毒分析】Steloj勒索病毒分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247488435&idx=1&sn=390e308b0532c2e709fb98ac9c8bae97&chksm=c20823b7f57faaa141c350ac73439215bc21345e5bf7afaaea049850aae026c86706d20a2157&scene=21#wechat_redirect) |
| 2024/06/01 | TargetOwner | [【病毒分析】技术全面升级，勒索赎金翻倍，新版本TargetOwner勒索家族强势来袭？](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247487811&idx=1&sn=ae873838f1126e1cc5c3ad12a2840364&chksm=c2082147f57fa851bc35f02454b76630bcf01a685762a332622a3dd74e0281329c2e0edccda6&scene=21#wechat_redirect) |
| 2024/11/02 | Lockbit 3.0 | [【病毒分析】Lockbit家族Lockbit 3.0加密器分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247487172&idx=2&sn=b7709a3116a0be848895db50970f6879&chksm=c2083ec0f57fb7d61f794cc9cdcd5572af1f8c88bf95ee54ae59b1f7e16c04fcd593a864c3f4&scene=21#wechat_redirect)  <br>[【成功案例】RDP暴露引发的蝴蝶效应：LockBit组织利用MSF工具及永恒之蓝漏洞进行勒索入侵](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247487172&idx=1&sn=da11170fb9edf9f285c99b8d8f3c39c6&chksm=c2083ec0f57fb7d6c2e092807d594d25bd77b26a00d2916878b5df62e1a9c2c34997f1f701ee&scene=21#wechat_redirect)  <br>[【成功案例】lockbit家族百万赎金不必付！技术手段修复被加密的数据库，附溯源分析报告](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247493976&idx=1&sn=0471fb1022806483600fe259b7826972&token=740585290&lang=zh_CN&scene=21#wechat_redirect)  <br>[【病毒分析】繁体勒索信暗藏玄机！要价50万RMB赎金的Lockbit泄露版分析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247493467&idx=1&sn=c60ce7442f326438f8a8d6f5637a168a&token=740585290&lang=zh_CN&scene=21#wechat_redirect) |
| 2024/05/15 | Wormhole | [【病毒分析】Wormhole勒索病毒分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247487253&idx=1&sn=e8da25281ec899b0544376185b76f343&chksm=c2083f11f57fb60720549ac98117637434149be928a8f5b4c3e288f1f19fd419c8003f3cd059&scene=21#wechat_redirect) |
| 2024/03/20 | tellyouthepass |     |
| 2024/03/01 | lvt | [【病毒分析】交了赎金也无法恢复--针对国内某知名NAS的LVT勒索病毒最新分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247484331&idx=1&sn=8c44f6f09744da52eb2c7fca73058524&chksm=c20833aff57fbab9ab98e65fe7420cad1ceacaf53bb074e73c05261fb3551e78788be29c4f52&scene=21#wechat_redirect) |
| 2024/03/04 | phobos | [【病毒分析】phobos家族2700变种加密器分析报告](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485026&idx=2&sn=4033be51ab6a9a59906a38f74efb9aea&chksm=c2083666f57fbf705f093ee4e39bb6eae24da316dfc49dca0eec305532c0f1afc51832898ded&scene=21#wechat_redirect)  <br>[【成功案例】某集团公司的Phobos最新变种勒索病毒2700解密恢复项目](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485026&idx=1&sn=da448cf74f07557f51a40a5b40f1d018&chksm=c2083666f57fbf70d0687b806bd7e95e6ca4d8b2a5f21d215c83a59e5e1d1085c4d5a8e63046&scene=21#wechat_redirect)  <br>[【病毒分析】phobos家族faust变种加密器分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485595&idx=1&sn=1ec720e9ecd1da48d2f40f89b45a2a5e&chksm=c208389ff57fb18931e4582a6b72234ce8f79867aebab755c03169a1898bd0ae5acc4daa5d78&scene=21#wechat_redirect)  <br>[【成功案例】某集团公司的Phobos最新变种勒索病毒jopanaxye解密恢复项目](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247484089&idx=1&sn=35d1d1cf7b42011380970f92a26aa0ca&chksm=c20832bdf57fbbabbd74314e9aaf6217c6b9035c96492595f36ecd8b1ee0d319575e809f69c1&scene=21#wechat_redirect)  <br>[【病毒分析】phobos家族Elbie变种加密器分析报告](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247484604&idx=1&sn=f0e5a3890a98ebd99cdd79a52d395013&chksm=c20834b8f57fbdae6ec3fee2e3dfcb1824c4847239932838322f5823f4c1a499d529a1e794e0&scene=21#wechat_redirect) |
| 2024/03/28 | DevicData |     |
| 2024/02/27 | live | [【病毒分析】独家揭秘LIVE勒索病毒家族之1.0（全版本可解密）](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247484738&idx=1&sn=b1572f6993c4e722571347d0f6e0b18d&chksm=c2083546f57fbc50d01c4b0ae4274c13e300aa4fa13f02efb2ffb90334b1425103ba59f25068&scene=21#wechat_redirect)  <br>[【病毒分析】独家揭秘LIVE勒索病毒家族之1.5（全版本可解密）](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247484900&idx=1&sn=a716c73661330e01b6e077dd592327ca&chksm=c20835e0f57fbcf6aeef085a36568361c667f5f4edbf700cc70654d2d055bf824e450507b4a7&scene=21#wechat_redirect)  <br>[【病毒分析】独家揭秘LIVE勒索病毒家族之2.0（全版本可解密）](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247484879&idx=1&sn=bcfc0d45a55fc3cd0358fa87e139773d&chksm=c20835cbf57fbcdd95157f3e2521c8a7cde3a521458bfde3ceebcfcf7e0e7a809b5a769e48bb&scene=21#wechat_redirect) |
| 2024/08/16 | CryptoBytes | [【独家破解】揭秘境外黑客组织的20美元锁机病毒：深度逆向分析+破解攻略！赎金？给你付个🥚](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247490657&idx=1&sn=be3b63ea2f7c4b788f1acd8c22599dee&chksm=c2082c65f57fa57353ee952c05d1b239dc22d926cd39945a369e9557731fdfcb084260a56a4c&scene=21#wechat_redirect) |
| 2024/03/15 | mallox | [【病毒分析】mallox家族malloxx变种加密器分析报告](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485139&idx=1&sn=d62fea58ad2284491e33a3c459f847d4&chksm=c20836d7f57fbfc1af15625c7ce1bda71bd615e75766bb0da89049538de1e9ab680f98a6ee92&scene=21#wechat_redirect)  <br>[【病毒分析】Mallox勒索家族新版本：加密算法全面解析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247494316&idx=1&sn=ca3a0e3c65458f01a0b9f2449d1c8800&scene=21#wechat_redirect)  <br>[【病毒分析】全网首发！袭扰国内top1勒索病毒家族Mallox家族破解思路及技术分享](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247494858&idx=1&sn=72a3b631951c1974c6c8ff950a6465d8&scene=21#wechat_redirect)  <br>[【成功案例】间隔数月双团伙先后利用某ERP0day实施入侵和勒索的解密恢复项目](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485381&idx=1&sn=49f3e3a1c3e4ce6f2d5bb0334a16bb30&chksm=c20837c1f57fbed7bc89f5c6255f0dc0883af0f1df29eeb2623e67dda4b887361b17c5529a02&scene=21#wechat_redirect)  <br>[【病毒分析】mallox家族rmallox变种加密器分析报告](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485304&idx=1&sn=d6664b024d804c90c807e5618133455f&chksm=c208377cf57fbe6ad0aaa0c70cdec93ebda39efb85beb13e5ae7484a74ecccd5be70755def8a&scene=21#wechat_redirect)  <br>[【病毒分析】Mallox家族再进化：首次瞄准Linux，勒索新版本全面揭秘！](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247491808&idx=1&sn=038733626c4e784cb71c81a71bea72b5&chksm=c20bd0e4f57c59f2df0a9293568dc740a6e2edfc467efa2d876dcd6b876c0ce771d5bf12bc61&scene=21#wechat_redirect) |
| 2024/07/25 | BeijngCrypt | [【病毒分析】全网首发！以国内某安全厂商名字为后缀的勒索病毒分析](http://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247489863&idx=1&sn=e243a72f138591ade1477f15b2bc7d7f&chksm=c2082943f57fa05504148b5df4649894fba2e9bb944c2609f6d8f607fc4fba424b6cbf36aef1&scene=21#wechat_redirect) |
| 2025/03/11 | 银狐  | [【病毒分析】潜伏在AI工具中的幽灵：银狐家族社工攻击的深度剖析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498226&idx=1&sn=1e092f005e09b522fdc39b51d95604ed&scene=21#wechat_redirect) |
| 2025/03/07 | CTF赛题 | [【病毒分析】伪造微软官网+勒索加密+支付威胁，CTF中勒索病毒解密题目真实还原！](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498350&idx=1&sn=242d145e297691f09187724c881d7811&scene=21#wechat_redirect)<br><br>[【病毒分析】2024年网鼎杯朱雀组REVERSE02——关于勒索木马解密详解](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247492515&idx=1&sn=cde28b906fff75a2029c4fb721ed6115&scene=21#wechat_redirect) |
| 2025/05/14 | 888 | [【病毒分析】888勒索家族再出手！幕后加密器深度剖析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247499309&idx=1&sn=e4d848d72a6b7cb947f7bcf11b13d8d6&scene=21#wechat_redirect) |
| 2025/06/13 | LockBit4.0 | [【病毒分析】缴纳了巨额赎金依旧无法解密？最新LockBit4.0解密器分析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247500805&idx=1&sn=0c8ab9391665c08a7ad5121a93760fd8&scene=21#wechat_redirect)<br><br>[【病毒分析】LockBit 4.0 vs 3.0：技术升级还是品牌续命？最新LockBit 4.0分析报告](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247500383&idx=1&sn=9e5c3641c525716354718a02e891821c&scene=21#wechat_redirect) |
| 2026/07/10 | WannaHammer 3.0 | [【病毒分析】老同学发来的压缩包别乱点，文件被锁还当众社死播放颜色音频，WannaHammer"求锤"勒索套路拆解](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247510987&idx=1&sn=e5fe517835f678e3726cc37b51a84566&chksm=c20b9bcff57c12d9f9f842e01bb69440e9bad1d428d522a8f31bdf53d345ab5ad48ea6d4b158&token=43433231&lang=zh_CN&scene=21#wechat_redirect) |

勒索攻击作为成熟的攻击手段，很多勒索家族已经形成了一套完整的商业体系，并且衍生了多个分支团队，导致勒索病毒迭代了多个版本。而每个家族擅用的攻击手法皆有不同，TellYouThePass勒索软件家族常常利用系统漏洞进行攻击；Phobos勒索软件家族通过RDP暴力破解进行勒索；Mallox勒索软件家族利用数据库漏洞，如(mssql命令执行)及暴力破解进行加密，攻击手法极多防不胜防。

|     |     |
| --- | --- |
| **收录时间** | **相关文章** |
| 2024/12/12 | [【攻击手法分析】勒索病毒如何轻松绕过安全设备防线：第二篇-流量致盲，无声突破](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247494587&idx=1&sn=761d5ecda1eb25d36828bee7b5e10eed&scene=21#wechat_redirect) |
| 2024/12/11 | [【攻击手法分析】勒索病毒如何轻松绕过安全设备防线：第一篇-驱动漏洞一击致命](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247494539&idx=1&sn=c9e951a6295df1f1f94a2f3793cc7ff2&scene=21#wechat_redirect) |

有效的预防方法包括针对自身业务进行定期的基线加固、补丁更新及数据备份，在其基础上加强公司安全人员意识。

|     |     |
| --- | --- |
| **收录时间** | **相关文章** |
| 2024/06/27 | [【教程分享】勒索病毒来袭！教你如何做好数据防护](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247488871&idx=1&sn=01c62bf7f6a5e9cf7f15999254be6977&scene=21#wechat_redirect) |
| 2024/06/24 | [【教程分享】服务器数据文件备份教程](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247488828&idx=1&sn=6854abd8da05fbc8776747b58f4a7f54&scene=21#wechat_redirect) |

**案例介绍篇** 聚焦于真实的攻击事件，还原病毒家族的攻击路径和策略，为用户提供详细的溯源分析和防护启示；

|     |     |
| --- | --- |
| ****收录时间**** | ****相关文章**** |
| 2024/06/27 | [【案例介绍】赎金提高，防御失效：某上市企业两年内两度陷入同一勒索团伙之手](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247488871&idx=1&sn=01c62bf7f6a5e9cf7f15999254be6977&scene=21#wechat_redirect) |
| 2024/01/26 | [【成功案例】某集团公司的Phobos最新变种勒索病毒jopanaxye解密恢复项目](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247484089&idx=1&sn=35d1d1cf7b42011380970f92a26aa0ca&scene=21#wechat_redirect) |
| 2024/03/13 | [【成功案例】某集团公司的Phobos最新变种勒索病毒2700解密恢复项目](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485026&idx=1&sn=da448cf74f07557f51a40a5b40f1d018&scene=21#wechat_redirect) |
| 2024/04/01 | [【成功案例】间隔数月双团伙先后利用某ERP0day实施入侵和勒索的解密恢复项目](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247485381&idx=1&sn=49f3e3a1c3e4ce6f2d5bb0334a16bb30&scene=21#wechat_redirect) |
| 2024/04/26 | [【成功案例】利用多款国产内网渗透工具勒索数十台虚拟机的babyk解密恢复项目](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247486166&idx=1&sn=6d24d5fd782d627fce347e0c8e200263&scene=21#wechat_redirect) |
| 2024/05/17 | [【成功案例】RDP暴露引发的蝴蝶效应：LockBit组织利用MSF工具及永恒之蓝漏洞进行勒索入侵](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247487172&idx=1&sn=da11170fb9edf9f285c99b8d8f3c39c6&scene=21#wechat_redirect) |
| 2024/11/28 | [【成功案例】lockbit家族百万赎金不必付！技术手段修复被加密的数据库，附溯源分析报告](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247493976&idx=1&sn=0471fb1022806483600fe259b7826972&scene=21#wechat_redirect) |
| 2025/10/23 | [【成功案例】成功挫败 888 勒索家族历时半年的百万赎金勒索，应急处置全流程高效修复，避免千万损失并获客户赠送锦旗](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247504605&idx=1&sn=fb942b0711ddbfab24897adad2ae2f4f&scene=21#wechat_redirect) |

**漏洞与预防篇** 侧重于技术层面的防御手段，针对病毒利用的漏洞和安全弱点，提出操作性强的应对方案：

|     |     |
| --- | --- |
| ******收录时间****** | ****相关文章**** |
| 2025/01/08 | [【漏洞与预防】RDP弱口令漏洞预防](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247496188&idx=1&sn=b75f5f6bc8a6534a8908b33653fc2888&scene=21#wechat_redirect) |
| 2025/01/21 | [【漏洞与预防】MSSQL数据库弱口令漏洞预防](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247496466&idx=1&sn=85d35deb77fc1bd39b867706687280c5&scene=21#wechat_redirect) |
| 2025/02/18 | [【漏洞与预防】远程代码执行漏洞预防](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247497471&idx=1&sn=72d14df7eae39f856c3cf1f0173ab801&scene=21#wechat_redirect) |
| 2025/04/10 | [【漏洞与预防】Atlassian Confluence存在远程代码执行漏洞](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498751&idx=1&sn=7318e65b2697d7e55c0a3fb345c42e0e&scene=21#wechat_redirect) |
| 2025/04/17 | [【漏洞与预防】畅捷通文件上传漏洞预防](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498861&idx=1&sn=04cd3572c613fdf4a9515777d4e5d3bd&scene=21#wechat_redirect) |
| 2025/05/27 | [【漏洞与预防】Microsoft Windows 文件资源管理器欺骗漏洞预防](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247499635&idx=1&sn=cca778a3a8b5c545de9edc8d2a4f2c92&scene=21#wechat_redirect) |
| 2025/09/02 | [【漏洞与预防】Redis CVE-2025-32023 RCE漏洞验证与预防](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247503165&idx=1&sn=3a2c94539f24326a01aea3cb8d00c6f5&scene=21#wechat_redirect) |

**应急响应工具教程篇** 重点分享应急响应过程中常用工具的安装、配置与使用说明，旨在帮助读者快速掌握这些工具的操作流程与技巧，提高其在实际应急场景中的应用熟练度与效率。

|     |     |
| --- | --- |
| ****收录时间**** | ****相关文章**** |
| 2025/01/10 | [【应急响应工具教程】Splunk安装与使用](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247496288&idx=1&sn=f80454bfad6904ae40151401ed29e8aa&chksm=c20bc264f57c4b720705f53f4490332d2566cd8e0ae8c2d032397c12e693227f08d6105c1e2e&token=227041078&lang=zh_CN&scene=21#wechat_redirect) |
| 2025/02/07 | [【应急响应工具教程】取证工具-Volatility安装与使用](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247496866&idx=1&sn=27bb5c01e5fca6238f39c861e95fbd3d&chksm=c20bc4a6f57c4db0246975aef958a2c61864cfaae265039e4b72cc7c6b3fb3646406366d2ab8&token=227041078&lang=zh_CN&scene=21#wechat_redirect) |
| 2025/02/20 | [【应急响应工具教程】流量嗅探工具-Tcpdump](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247497513&idx=1&sn=beb43815ad475d5718130d6cc18f2e64&scene=21#wechat_redirect) |
| 2025/02/26 | [【应急响应工具教程】一款精准搜索文件夹内容的工具--FileSeek](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247497803&idx=1&sn=89d78d578fda3c7154996b51561d3e3e&scene=21#wechat_redirect) |
| 2025/03/03 | [【应急响应工具教程】一款自动化分析网络安全应急响应工具--FindAll](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498059&idx=1&sn=811edcdb13b29871aa9001ac92da97f1&scene=21#wechat_redirect) |
| 2025/03/13 | [【应急响应工具教程】Windows 系统操作历史监控与审计工具-LastActivityView](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498247&idx=1&sn=d761426b390ca5acb54018451a213ae6&scene=21#wechat_redirect) |
| 2025/03/20 | [【应急响应工具教程】镜像取证之挂载镜像——Arsenal Image Mounter](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498374&idx=1&sn=5c0442326d569292bf4ea4da64140663&scene=21#wechat_redirect) |
| 2025/04/03 | [【应急响应工具教程】Windows 系统综合排查工具Hawkeye](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498622&idx=1&sn=28918f3513862908301d1799cea25c19&scene=21#wechat_redirect) |
| 2025/04/08 | [【应急响应工具教程】Linux下应急响应工具whohk](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498647&idx=1&sn=8745e982503d102e61e344fac2ce72e7&scene=21#wechat_redirect) |
| 2025/05/15 | [【应急响应工具教程】Windows日志快速分析工具——Chainsaw](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247499347&idx=1&sn=ca059b5ff80f6a8e90e7dabc22dc3afe&scene=21#wechat_redirect) |
| 2025/06/05 | [【应急响应工具教程】Logman 系统性能与日志采集工具](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247500144&idx=1&sn=e895b492566a1aad30f44582adf909d2&scene=21#wechat_redirect) |
| 2025/07/02 | [【应急响应工具教程】QDoctor应急响应神器：一键检测系统安全](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247500943&idx=1&sn=951be517514153e31e2204ca23bafcfa&scene=21#wechat_redirect) |
| 2025/07/08 | [【应急响应工具教程】Linux应急响应工具集：一键式安全评估与可视化报告系统](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247501016&idx=1&sn=d641e16c18554ec40b9e32bbe004b5fb&scene=21#wechat_redirect) |
| 2025/07/23 | [【应急响应工具教程】司稽（Whoamifuck）：纯Shell打造的Linux应急响应利器](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247502542&idx=1&sn=7057b837b1e000782ef3c029350aeacb&scene=21#wechat_redirect) |
| 2025/08/05 | [【应急响应工具教程】主机侧Checklist的自动全面化检测脚本-GScan](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247502817&idx=1&sn=189a5490e0cee5705b6c58511d4fbb93&scene=21#wechat_redirect) |
| 2025/08/19 | [【应急响应工具教程】SPECTR3：通过便携式 iSCSI 实现远程证据的只读获取与分析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247502996&idx=1&sn=45eaaaadaebde4fedb39a547d0e1b6d6&scene=21#wechat_redirect) |

如果您想了解有关勒索病毒的最新发展情况，或者需要获取相关帮助，请关注“Solar应急响应团队”。

**全国热线| 400-613-6816**

**更多资讯| 扫码加入群组交流**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cad32f72bd497e97.webp)

喜欢此内容的人还喜欢

[【紧急警示】Weaxor最新变种“.wxx”来袭，批量入国内知名财务类管理系统发起勒索攻击！](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247498941&idx=1&sn=bc6215afc52c9833b559b1385aca6ac6&scene=21#wechat_redirect)

Solar应急响应团队

[【病毒分析】新版勒索病毒MEDUSA LOCKER 首发深度分析](https://mp.weixin.qq.com/s?__biz=MzkyOTQ0MjE1NQ==&mid=2247503856&idx=1&sn=c598583331355f663797d16674d27849&scene=21#wechat_redirect)

Solar应急响应团队

## 【成功案例】成功挫败 888 勒索家族历时半年的百万赎金勒索，应急处置全流程高效修复，避免千万损失并获客户赠送锦旗Solar应急响应团队

勒索破解 · 目录
