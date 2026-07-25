---
title: 【微信】[工具推荐]全自动深度-收集各种响应中的API接口-API剑
source: https://mp.weixin.qq.com/s/V5DfCdJ9nZ-RrKYRu-zw8w
source_host: mp.weixin.qq.com
clip_date: 2026-07-25T17:29:31+08:00
trace_id: 67ebdab8-41e9-4cd5-8094-215563d34a02
content_hash: ef5cdf9f6b77fde8e87e51a9dc286d7b026ea43754cd901b730a38d0fdedfd07
status: summarized
tags:
  - 微信
  - 安全工具
  - 网络工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: API剑是Burp Suite插件，能全自动从HTTP响应中递归提取API和JS文件，集成结果到Burp，大幅提升安全测试中的接口发现效率。
ai_summary_style: key-points
images_status:
  total: 28
  succeeded: 28
  failed_urls: []
notion_page_id: 3a875244-d011-81f0-a01e-d21435c5a504
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> API剑是Burp Suite插件，能全自动从HTTP响应中递归提取API和JS文件，集成结果到Burp，大幅提升安全测试中的接口发现效率。
> 
> - **自动提取机制**：从经过Burp的HTTP响应中捕获链接，清洗后对API和JS文件主动发起请求，递归处理并内置防死循环功能。
> - **结果集成优势**：提取的API接口及来源JS文件直接推送到Burp GUI，并自动添加到target sitemap，便于一站式分析和测试。
> - **简单使用步骤**：需安装至Burp Suite 2024.7以上版本，设置合理范围后，让浏览器流量经过Burp，工具即可自动工作。
> - **灵活配置选项**：可设置主动请求开关、是否使用原headers、速率限制、自定义路径等，以适应不同测试场景需求。

**陌笙不太懂安全** *2026年7月25日 17:01*

```javascript
由于传播、利用本公众号所提供的信息而造成
的任何直接或者间接的后果及损失，均由使用
者本人负责，公众号陌笙不太懂安全及作者不
为此承担任何责任，一旦造成后果请自行承担！
如有侵权烦请告知，我们会立即删除并致歉，谢谢！
```

## 前言

这个插件结合了我近期的工作内容和此前我的4万美刀赏金微软账户漏洞api的部分经验，API剑开发者利用API剑已多次在项目上获得成果及通用0day，拥有此工具后，我再也没有手动从任何js里痛苦的查找任何接口、路径及参数。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/66227195cde1c0fa.png)

与众多JS Finder、URLFinder等比较火热的相关js、api挖掘工具类似，它们是非常优秀的工具， **而API剑凭借burp的特点而获得能力和优势。**

插件主页面截图：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e5d14bf4cfff5228.png)

## API剑的主要功能

API剑 全自动防环路，从各种响应里提取指定范围内的api和js文件，然后递归深度提取api，主动请求api、js等有价值文件

api结果所见即所得，右边的窗口显示api的来源js，可以立刻从js里面获得api的参数信息，然后burp再ctrl + r一键过去测

它没有想象的那么复杂，API剑做的事情更多是为我们 **减少了大量重复耗时且无趣的js、api、api参数搜寻工作。**

1.  API剑捕获经过burp的范围内的流量，并从 **http响应中提取绝大多数link**
    
2.  API剑将对上一步提取的任意链接、路径进行清洗，并由 **API剑判断后对API、JS等主动发起GET、POST请求**
    
3.  API剑对上一步主动请求的响应进一步的处理，继续从响应中提取信息，并重复上一步的动作， **API剑具有防环路功能，无需担心死循环请求问题**
    
4.  API剑对所有符合条件的API请求、响应，以及该API接口来源的js文件响应，全部推送到API剑的burp GUI中
    
5.  API剑自动将所有相关请求添加至burp的target sitemap中， **您可在target的sitemap的分析等功能中尽情享受API剑带来的果实**
    

用户只需要启用API剑并设置一个“合理的范围”，接着在浏览器中继续点击web系统的各种功能，让所有流量经过burp，最终交给API剑做分析处理，API剑将会向您返回您想要的恶魔果实。

**考虑到opsec等操作安全风险，目前API剑不会主动fuzz参数，如果后续有需求再额外添加作为可选功能。**

## 如何使用？

```
注意：插件需要运行在2024.7版本以上的burpsuite；（对于低于2024.7的版本，则需要手动在插件的settings页面将“是否使用原headers”功能关闭）
```

API剑的使用非常的简单，

1.  将插件安装至burp 2024以后的版本，确保插件无任何报错
    
2.  为插件设置Scope
    
3.  打开浏览器确保浏览器的流量会通过burp
    
4.  进入目标网站，点击和测试任何在网站中看到的一切
    
5.  过一段时间后，从API剑的Sitemap检查果实
    

## API剑的设置

在Scope选项卡中，我们可以设置范围，范围可以是url、域名、ip

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f545cadb1173c394.png)

这个范围特别重要，建议谨慎考虑，否则容易扫到外太空去。

设置好范围后我们再看Setting选项卡

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5caa238aea4493d5.png)

1.允许主动对API请求

这个选项默认开，不建议关，否则API剑无法更深层提取数据

2\. 是否使用原headers

默认开，如果想专门测试未授权api接口，可以把这个选项关掉，关掉后不会携带任何cookie或session等信息

3.立即停止发送所有请求

默认关，避免遇到突发情况想暂停，用来刹车的，建议搭配第一个选项一起使用

4.清除当前SiteMap所有数据

这个按钮用于清除API剑的Site Map中的所有站点数据

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d78f57b56b31bbce.png)

5.启用主动http请求速率限制每个请求的间隔时间

6.是否在主动请求时额外添加自定义路径请求

启用该选项后，API剑会在拼接前为主URL添加指定的自定义路径后再进行拼接

7.过滤掉非200的自定义响应码

8.允许API剑主动从响应中寻找baseURL并主动对baseURL进行路径拼接

9.添加自定义header字段：（自动覆盖已有的header字段）

10.启用绕过危险接口访问(接口包含字符串则跳过)

11.保存范围及所有设置

12.是否在API接口后、参数前额外添加自定义路径

13.线程数量控制

工具链接

```javascript
https://github.com/Sugobet/API_Sword
```

**后台回复加群加入交流群  
**

**广告：** **cisp pte/pts &nisp1级2级低价报考**

**陌笙安全纷传圈子+陌笙src挖掘知识库+陌笙安全漏洞库+陌笙安全面试题库** **简单介绍** **（** **加入纷传圈子** **送知识库+漏洞库+面试题库** **）**

如果觉得合适可以加入,圈子目前价格39.9元，价格只会根据圈子内容和圈子人数进行上调，不会下跌。。。

**圈子福利**

**edu漏洞挖掘1v1指导出洞**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/133744e78ee257e6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4325478c817aa3fb.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/291d0f13735a0ee2.png)

**陌笙src挖掘知识库介绍（内容持续更新中!!!)**

```css
信息收集(主域名信息收集,子域名信息收集等&会永久提供fofa-key助力)
弱口令漏洞&未授权访问漏洞挖掘
任意文件读取&删除&下载&上传漏洞
sql注入漏洞
url重定向漏洞
csrf&ssrf漏洞挖掘
XSS&XXE漏洞挖掘等等常见漏洞
cors&目录遍历&越权漏洞挖掘
EDUSRC(证书站挖掘案例分享&edusrc挖掘技巧分享)
CNVD挖掘技巧分享&实战案例报告编写
公益漏洞挖掘（公益src挖掘漏洞分享&提供补天1权重资产）
SRC挖掘实战(针对各种常见功能总结的常见测试思路等快速提升)
经典常见Nday漏洞(常见中间件&以及各种常见框架)复现
云安全相关漏洞挖掘（云key扫盲&云存储桶&快速识别云环境&云攻防）
AI相关学习（AI基础&AI代码审计实战测试&webLLM攻击等）
APP&小程序漏洞挖掘
等各模块不在一一介绍
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a5a9526c04ca82e2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/55d95f056e0ccf90.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3121dfe6083ea07e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e578c40e9cd61e62.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/24f96a9898859025.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0458ef9d7a83cbed.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/db0608e7dbfad79e.png)

信息收集

src挖掘基础

src挖掘实战

edusrc

经典nday复现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/91feed6aac03f174.png)

云安全&AI安全

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dd7acc8d3a29bd0d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dd8a29373cb7ad97.png)

**陌笙安全漏洞库介绍**

```sql
最新漏洞查看
1day&0day分享
EDU学校相关漏洞
Web应用漏洞
CMS漏洞
OA产品漏洞
中间件漏洞
云安全漏洞
人工智能漏洞
其他漏洞
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f639476be4ccc8b6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/930f6c88a39ecca5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4b8135c0c2526f85.png)

**陌笙安全面试库**

```javascript
渗透测试基本问题一汇总
渗透测试基本问题二汇总
渗透测试基本问题三汇总
微步护网面试题目
长亭科技面试
深信服护网面试
启明星辰渗透测试面试题目
安恒面试题目
绿盟笔试题目
360面试
奇安信护网面试
运维面试题目
运维面试题库
网安面试相关文档大全
相关面试文章推荐
等等
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/68bba849a294ed14.png)

**POC库** **&&更新适配afrog&&nuclei&&dddd的POC&1day/Nday等&&** ****dddd二开**** **工具\[助力渗透测试&&红蓝攻防\]**

**工具截图**

**实战效果**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b1f6a12faa09436b.png)

**poc库【后续持续更新】**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6289c17ff054c179.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5bde621a04c52bca.png)

**AI赋能-** **skill辅助** **漏洞挖掘（免责&&慎用）**

**圈友ai辅助渗透** **实战效果** **，支持打假！**

证书站

普通站点

**陌笙** **纷传圈子介** **绍**

```apache
1、src挖掘思维导图，信息收集思维导图，edusrc挖掘思维导图，以及后续的红队&面试思维导图&自己网安笔记等持续更新
2、2025-2026的edusrc实战报告包含证书站和非证书站以及2025之前的各种优质报思路分享
3、各种src报告思路分享（内部&外部）
4、分享各种src挖掘&edusrc挖掘培训资料&视频
5、不定期分享通杀、0day
6、有圈子群可以技术交流以及不定期抽取证书&免费rank
7.分享各种护网资料各家安全厂商讲解视频&精选实战面试题目
8、各种框架漏洞技巧分享
9、各种源码分享（泛微、正方系统、用友等）
10、漏洞挖掘工具&信息收集工具&内网渗透免杀等网安工具分享
11、各种ctf资料以及题目分享
12、cnvd挖掘技巧&CNVD资产&src资产分享&补天1权重资产分享&fofakey共用
13、免杀、逆向、红队攻内网防渗透等课程分享
14、漏洞库&字典以各种内容不在一一说明
15、cisp-pte/pts&nisp一级&nisp二级&edusrc证书内部价格
15、如果有漏洞挖掘问题或者工具资料需求可以找群主(尽量满足)
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/087e8c93f06bfc42.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/db599fd789126f7d.png)

**目前800多条内容，扫描下方二维码查看详情以及加入圈子，持续更新中。。**

**如果觉得合适可以加入，价格不定期会根据圈子内容和圈子人数进行上调。。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4808592b2a52a623.png)

渗透测试常用工具 · 目录
