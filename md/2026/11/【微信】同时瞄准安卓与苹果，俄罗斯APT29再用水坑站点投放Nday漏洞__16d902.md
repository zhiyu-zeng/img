---
title: 【微信】同时瞄准安卓与苹果，俄罗斯APT29再用水坑站点投放Nday漏洞
source: https://mp.weixin.qq.com/s/HHuf8fbK2EaJAmRibkFnCg
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T10:14:06+08:00
trace_id: bd7fd144-f431-4d2c-b7b2-fabbe3647b4b
content_hash: 5a8abce23d31e3bca972eed18d93d820dde0fcb57b04260c80c3cac703ca0d91
status: synced
tags:
  - 微信
  - 水坑攻击
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 俄罗斯APT29借水坑网站与供应链投毒，用已修补的n-day漏洞同时攻击iPhone和Android手机，窃取cookie乃至整机数据。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 40f75244-d011-81af-a32d-cdcd63a2a357
ioc:
  cves:
    - CVE-2024-27808
    - CVE-2024-27833
    - CVE-2024-27834
    - CVE-2025-14174
    - CVE-2025-24201
    - CVE-2025-27038
    - CVE-2025-31277
    - CVE-2025-43510
    - CVE-2025-43520
    - CVE-2025-43529
    - CVE-2026-20700
    - CVE-2026-3910
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 俄罗斯APT29借水坑网站与供应链投毒，用已修补的n-day漏洞同时攻击iPhone和Android手机，窃取cookie乃至整机数据。
> 
> - **投递路径：** 攻陷乌克兰燃气企业、美国化工协会、保加利亚军事网站等注入JS；另注册america250.holiday、theowo.club两个反向代理假站（AiTM），后者瞄准泽连斯基访英下榻、紧邻英国国防部的酒店；还于8月27日–9月3日投毒乌克兰Plerdy的SEO追踪脚本，把水坑放大到数千个站点。
> - **指纹脚本：** UltimateFingerprinter伪装在2.3MB的AngularJS压缩库内（占文件98%体积），含61个采集器、上报394个JSON字段，但服务器实际只按屏幕尺寸和maxTouchPoints=0过滤是否下发漏洞，指纹数据后续未再被使用。
> - **三条利用链全为n-day：** A链打iOS 16.7（CVE-2025-43529+CVE-2024-27834绕PAC）偷全浏览器cookie；B链为DarkSword套件打iOS 18.5，收割短信、Keychain、Wi-Fi密码、通讯录、相册、iCloud Drive等；C链用CVE-2026-3910+CVE-2025-27038（Adreno驱动）打Android Chrome 139–145（跳过143），AndroSnitch窃取Chrome数据与Wi-Fi密码，检测到三星S25 Ultra则中止。
> - **归因依据：** 被攻陷站点残留与2025年已归因APT29的水坑活动IOC吻合；Google TAG确认框架与2024年APT29攻击蒙古政府网站风格相近；所用漏洞与NSO、Intellexa等商业监控厂商（CSV）惯用同批，交付配置与漏洞覆盖范围不匹配，侧面印证漏洞来自第三方现成套件。
> - **防御结论：** 链条中无0day，及时更新系统与浏览器即可免疫；第三方JS依赖应做最小化与版本监控，防止组件本身成为攻击面。

**黑鸟** *2026年11月4日 23:53*

## 2026年10月中旬，Sekoia披露了一场规模可观的水坑攻击活动。被盯上的不是电脑，而是口袋里的iPhone和Android手机。

根据技术重叠、受害分布和基础设施特征，团队以中等偏高置信度判断，幕后操作者是APT29。这个组织还有几个更出名的代号，Midnight Blizzard、Cozy Bear、The Dukes，外界普遍将其与俄罗斯对外情报局（SVR）联系在一起。

* * *

调查从乌克兰一家燃气生产企业网站顶部的一段恶意JavaScript外链开始。顺着这条线摸下去，研究人员又陆续发现了另外两类入口。三条路径最终都把访客引向同一台攻击者控制的漏洞交付主机。

在乌克兰燃气企业的官网上，攻击者改动了网站主模板。页面加载完成后，脚本会动态创建一个新的script标签，把外部文件static.flux-telemetry\[.\]com上的一段脚本拉下来执行。这段脚本被攻击者自己命名为UltimateFingerprinter。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5bb696a2d7490073.png)

同类被攻陷的网站还有不少，包括美国化工行业一家大型行业协会的官网，以及欧洲某极右翼政党的网站。在另一些站点上，攻击者没有动模板，而是把恶意代码追加到一个原本就存在的合法JavaScript文件末尾，保加利亚一家军事相关网站就是这种情况。

当攻击者无法直接攻破某个目标网站时，他们换了一种做法，自己注册一个看起来几乎一样的域名，在中间充当反向代理。访客以为自己打开的是官网，实际流量先经过攻击者的服务器，对方在HTML回包的底部顺手塞进一段恶意JavaScript，再把页面原样吐给浏览器。这种手法在行业里叫Adversary-in-the-Middle，缩写AiTM。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8848edec668be4c2.png)

调查中确认了两个这样的假站。一个是america250\[.\]holiday，反向代理的对象是america250.org，后者是美国纪念独立250周年的官方网站，套着Cloudflare的防护。研究人员判断，攻击者挑这个站下手，很可能是想借国家级庆典的由头，发起带邀请函主题的鱼叉式钓鱼。

另一个是theowo\[.\]club，目前已经下线。它代理的是伦敦OWO Raffles酒店，那家酒店坐落于旧陆军部大楼里，旁边就是英国国防部和唐宁街10号。公开报道显示，乌克兰总统泽连斯基在10月14日访英期间就下榻于此。攻击者通过这个假站截获的，很可能是外交代表团和高访宾客。

## 一次持续一周的供应链投毒

随着调查推进，研究人员注意到一个奇怪现象。许多访问漏洞交付服务器的请求，来源网站跟APT29以往的目标画像并不沾边。把这些网站放在一起比对，共同点浮了出来，它们都加载了同一个第三方组件，乌克兰网站分析服务Plerdy的SEO追踪脚本。

8月27日到9月3日这一周时间里，Plerdy被攻破。攻击者在合法文件a.plerdy\[.\]com/public/js/click/main.js里追加了一段恶意代码，导致加载该脚本的数千个网站同时把访客导向攻击基础设施。这几千个站点绝大多数位于乌克兰，其中不少直接关联军队、特种作战和弹道导弹、无人机等军事装备方向。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c320e45fe2180cad.png)

攻击者是想精准喂饱特定目标，还是先广撒网捞一波再慢慢筛，现在还没有定论。但可以确定的是，这次供应链攻击把原本局限在几个特定网站的水坑，一夜之间放大到了数千个站点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c853333db84086fd.png)

## 整场攻击的投递链路：从合法网站到数据外发

## UltimateFingerprinter：一段收集394个字段的脚本

不管从哪条路径进来，访客落到的第一个东西都是那段UltimateFingerprinter脚本。文件名看起来像随机串5b4c8fea5cbcee273e8d830f52-temfp.js，但在所有受害者样本里都一模一样。

这段脚本外头裹着一层AngularJS的压缩库作为伪装，压缩库占了整个文件98%的体积，总共2.3MB。研究人员推测这么做有两种可能，一是文件太大，自动分析用的大语言模型上下文窗口装不下，二是把恶意脚本嵌在一个知名开源库里，看起来更像正常资源。

真正干活的部分由61个采集器组成，一共往服务器上报394个JSON字段。采集范围相当宽，canvas、audio、webgl、字体、CSS、数学函数、屏幕分辨率这些经典设备指纹项都在列，WebRTC、媒体设备、电池、传感器、网络、性能时序这些沙箱检测项也一个不落。针对Apple生态还单独抓了iOS特性、mac特性、Safari扩展和触摸手势。更现代的Web API也没放过，USB、NFC、蓝牙、空闲检测、计算压力、形状识别、支付能力全测了一遍。

收集完之后，脚本把这一大包JSON POST给一个带随机nonce的接口。服务器根据上报数据决定回什么。如果符合攻击者的筛选条件，回包就是一段可执行的JavaScript漏洞利用代码；不符合，就回一个200空响应。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ba9bd1107491b5e5.png)

有意思的是，攒了394个字段，真正影响是否下发漏洞的判断却非常简单。屏幕宽高如果不像手机尺寸，或者navigator.maxTouchPoints等于0也就是非触屏设备，服务器直接啥也不发。其余那一大堆指纹字段，在后续整个感染链里没再被用过。这么大费周章地采集，意图暂时还说不清。

## 三条利用链：偷cookie、偷整机、偷Android

研究人员用不同浏览器配置对着指纹接口反复测试，陆续拿回了三条完整的利用链。三条链全靠已经修补过的n-day漏洞，没有zero-day，也打不动完全更新的设备。换句话说，只要系统和浏览器及时更新，这轮攻击基本够不着你。

|     |     |     |
| --- | --- | --- |
| 类别  | 使用的CVE | 目标与最终目的 |
| A   | CVE-2025-43529、CVE-2024-27834 | iOS 16.7，窃取浏览器cookie |
| B   | CVE-2025-43529、CVE-2026-20700、CVE-2025-14174、CVE-2025-43510、CVE-2025-43520 | iOS 18.5，全量设备数据窃取 |
| C   | CVE-2026-3910、CVE-2025-27038 | Android Chrome 139至145（跳过143），窃取Chrome数据和Wi-Fi密码 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d6bcc05b5538d36d.png)

## Class A：给iOS 16.7偷cookie

第一条链专门针对iOS 16.7设备，理论上从16.0到17.4都能打。服务器下发的是一个单文件JavaScript，漏洞利用和最终载荷写在一起。脚本开头先种一个叫VDGH_TOKEN_REF的标记cookie，值是硬编码的固定字符串，发现这个cookie已经存在就直接退出，防止同一个受害者被重复打两次。

整个链条分三步走。第一步用CVE-2025-43529在WebContent渲染进程里拿到远程代码执行权限，这个漏洞跟今年9月被人传到VirusTotal上的DarkSword泄露利用套件里的RCE是同一个，只是被重新实现了一遍。文件里还留着两个没用上的废弃漏洞，CVE-2024-27808的AccessCase UAF和CVE-2024-27833的SBFX溢出，应该是旧版本套件的残留。

第二步是绕过PAC。现代Apple芯片用指针认证码对控制流指针做加密签名，攻击者就算能读写内存，乱改函数指针只会让进程直接崩溃，跳不到自己的代码上。这条链用CVE-2024-27834伪造出合法的指针签名，把执行流接过来。

第三步才是真正偷cookie。两个配合的函数负责遍历系统里每个进程ID，让内核把该进程的沙箱容器路径写进自己能控制的堆缓冲区，然后挨个打开这些路径下的Cookies.binarycookies文件，检查文件魔数是不是cook，是的话整份读出来，再用利用链自己的读原语拼回JavaScript字符串。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a1d437dcbbff0d1a.png)

这种读法的好处是，只要目标App正在运行、cookie存在自己的容器目录里，不管Safari还是第三方浏览器都能一并捞走。偷完之后用一个POST请求发到ad.starx-net\[.\]com:8881/telemetry/v12，载荷结构里写着category是only_cookies。

## Class B：DarkSword整机收割

第二条链是完整的DarkSword套件，目标是iOS 18.5。指纹通过之后，载荷分三段从ad.starx-net\[.\]com的/api/nonce/v1、v2、v3依次拉下来。

[通过攻陷合法网站传播的新型iOS漏洞利用工具包DarkSword](https://mp.weixin.qq.com/s?__biz=MzAxOTM1MDQ1NA==&mid=2451185849&idx=1&sn=90f390064e47068e7f7b5a5c0eef796c&scene=21#wechat_redirect)

v2阶段是沙箱逃逸。现代WebKit把渲染进程关在一个受限沙箱里，直接拿RCE碰不到文件系统和敏感数据。这一段连续用CVE-2025-14174和CVE-2025-43510两个漏洞，跳出沙箱，摸到系统IPC和内核接口。

v3阶段是内核提权加后渗透。CVE-2025-43520给出内核级的读写能力，之后就是一顿收割。短信和iMessage从sms.db里捞，邮件索引和语音留言一并带走，WhatsApp和Telegram的数据库整份下载，Keychain里存的密码和令牌、Accounts3.sqlite里的账户凭证、wifi_passwords.txt里的Wi-Fi预共享密钥全在清单上。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bc30a494dc7dcea3.png)

消息内容之外，通信元数据也没放过。通讯录、通话记录、日历、备忘录、Safari的History.db和cookie文件都被扫一遍。Apple自己在设备上做的那套本地化数据也被翻了个底朝天，App使用时间线、routined和locationd的位置缓存、健康数据。最后是媒体，整本相册包括DCIM和PhotoData，还有iCloud Drive。数据同样外发到那个ad.starx-net\[.\]com:8881/telemetry/v12。

套件里其实还备了CVE-2025-31277作为备用入口和CVE-2025-24201作为备用逃逸，但这次投递都没用上。

## Class C：Android上的AndroSnitch

第三条链针对Android上未打补丁的Chrome。交付服务器只往Chrome 139.0.0.0到145.0.0.0的版本发，奇怪的是明确跳过了143版，原因还不清楚。139到144和145两版下发的载荷基本一致，只是GPU漏洞那段shellcode重新编译过。

这条链没有Class A那种cookie防重放，连打两次也没人拦。开局直接用CVE-2026-3910在Chrome渲染进程里拿执行权，然后加载一段shellcode。这段shellcode由一个小loader、一个stager和一个共享库组成，共享库利用Adreno显卡驱动里的CVE-2025-27038逃出浏览器沙箱，再以更高权限起第二段shellcode。代码里有个有趣的判断，如果检测到设备是SM-S938B也就是三星Galaxy S25 Ultra，整个利用直接中止。

第二段shellcode被研究人员命名为AndroSnitch。它内部的共享库叫libexploit.so，只导出16个函数，目的单一，收集Chrome数据和Wi-Fi密码。具体盯死了三个路径，Chrome的Cookies文件、Login Data文件和History文件，以及系统里两份WifiConfigStore.xml。收完之后组两个HTTP头发出去，一个是Filename，一个是硬编码的X-Device-Id，用libcurlPOST到同一个telemetry接口。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd37ef44487a427e.png)

研究人员之所以给它起这个名字，是因为它跟Google TAG在2024年报告里提过的AndroSnatch高度相似。两者盯的文件几乎一样，只是AndroSnitch用WifiConfigStore顶替了TrustTokens。编译工具链都指向Clang/LLD 14.0.7，不过这种信息本来就容易伪造。两者都用libcurl外发，都带硬编码token。这些相似性也许意味着某种血缘关系，但样本和能力样本太少，还不足以定论。

## 为什么是APT29

把这些线索拼起来，黑鸟觉得指向性已经相当清楚。

第一，合作的各国CERT反馈，其中一个被攻陷网站的后端文件里留着另一组恶意活动的痕迹，那组痕迹跟一份2025年已被归因到APT29的水坑活动报告里的TTP和IOCs对得上。那组旧IOCs里有一个域名已经失效，但网站文件里还留着注入代码，要么是操作者没清理干净，要么是这次攻陷时顺手把上次的残留组件又注了进去。

第二，研究团队把利用链细节同步给Google TAG后，对方确认这套框架跟2024年APT29针对蒙古国政府网站搞的那轮水坑攻击风格相近。两轮的目标都是偷cookie，差别在于2024年那次有硬编码过滤，只针对特定网站，这次不挑，浏览器里有什么cookie偷什么，部分链条甚至直接上整机收割。

第三，Google TAG指出，2024年那轮用的漏洞跟NSO Group、Intellexa这类Commercial Surveillance Vendor（CSV，商业监控厂商）惯用的是同一批。APT29当年是怎么拿到这些漏洞的，外界一直没搞清楚。这次的链条侧面印证了漏洞来自第三方。比如Class A的交付服务器只认iOS 16.7和16.7.10，但漏洞实际从16.0到17.4都能打，这种不匹配更像是操作者直接套用现成漏洞包，懒得按自己的投递范围去改配置。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/15bc07c1a5fe33b8.png)

受害分布也对得上。受害者横跨欧美，重点压在乌克兰，跟俄罗斯的战略利益一致。攻击者控制的域名分散在多家主机商名下，这种基础设施布置方式在APT29过往行动里多次出现，包括它以前用过的Cobalt Strike的Cs2modrewrite模块。被攻陷的网站里还包括捷克一个极右翼运动的站点，这跟APT29长期针对欧洲政党的历史记录吻合。

这场活动最值得关注的，不是哪个具体漏洞多惊艳，而是一个趋势在被反复确认。国家级入侵团队正在越来越多地直接采用Commercial Surveillance Vendor打包好的移动利用框架。DarkSword这种套件一旦泄露、流转、再被二次利用，先进移动攻击的门槛和成本就会被持续拉低。

对普通用户来说，结论其实朴素。这轮链条里没有0day，所有漏洞厂商都已经修过。系统及时更新、浏览器及时更新，比装任何防护软件都更直接有效。

而Plerdy那一周的供应链投毒波及数千个乌克兰网站，说明第三方组件本身也能成为攻击面，网站运营方对引入的JavaScript依赖做最小化和版本监控，不是可有可无的洁癖。

至于那些被挑中的高价值假站，america250\[.\]holiday背后是国家级庆典的人流，theowo\[.\]club背后是唐宁街和国防部隔壁的酒店。

黑鸟觉得，水坑攻击选点的逻辑从来不是看网站流量多大，而是看会有谁路过。

这一点，多年来一直没变。

相关：

sekoia.com/blog/poisoned-source-apt29-watering-holes-targets-mobile-devices-with-n-day-exploits

blog.google/threat-analysis-group/state-backed-attackers-and-commercial-surveillance-vendors-repeatedly-use-the-same-exploits/

威胁情报 · 目录
