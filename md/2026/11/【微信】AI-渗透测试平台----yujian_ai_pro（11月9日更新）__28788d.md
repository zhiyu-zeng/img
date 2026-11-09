---
title: 【微信】AI 渗透测试平台 -- yujian_ai_pro（11月9日更新）
source: https://mp.weixin.qq.com/s/wzU0zQMpGv9gRHzQIghmSw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T11:44:53+08:00
trace_id: 0a5233e0-c73e-48f5-b662-af7ed029309d
content_hash: 4a333a1626f3364dda783652354986744a70cd9d913055ba69b38bb21331d27d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41375244-d011-81da-af7f-e359167cceac
ioc: null
---

**Web安全工具库** *2026年11月9日 10:14*

\===================================

请勿利用文章内的相关技术从事非法测试，由于传播、利用此文所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，作者不为此承担任何责任。工具来自网络，安全性自测，大家都要把工具当做病毒对待，在虚拟机运行。如有侵权请联系删除。个人微信：ivu123ivu

**0x01 工具介绍**

YujianAI Pro 是一个智能化、通用性、自动化、模块化的渗透测试平台，支持从侦察到报告生成的全流程自动化测试。

**0x02 安装与使用**

一、装完之后，我先敲了一条最没有风险、也最应该先敲的命令： python ai_assistant.py --help。它的输出，就是下面这张图。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f6f96191f2e56aa1.png)

— 三条初始化结果：一条勉强算过，一条直接失败

第一行是 AI 引擎：默认去连本机 11434 端口的 Ollama，模型写死成 mistral:7b。我没装 Ollama，于是连接被拒。有意思的是，紧接着它还是打了一行 「✅ AI智能检测引擎就绪」 ——异常被 try/except 吞掉了，状态文案照旧。

中间是扫描器，正常起来了：15 线程、aggressive 模式、限速 10 次每秒。

最后一行才是重点： 攻击器初始化失败，报了 AttributeError。这行警告来自主流程初始化时的一次方法查找—— 它找不到自己要的那个方法。

我顺手翻了源码，原因很朴素：装载攻击模块时引用的名字是 attack_authentication，而类里实际定义的方法叫 test_authentication。一次改名没改全，整个攻击器对象就没建起来。不是网络问题，不是环境问题，是一处对不上的字符串。

帮助信息本身倒是写得很完整，还列着 attack \[URL\] 这条命令——虽然背后那个对象此刻是空指针。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/888664a79ad1137c.png)

— 帮助里五个命令，其中两个依赖那个没起来的模块

还有一个更要先知道的差别：这份帮助里的 scan 和 attack 只在交互模式里有效。README 示范的写法是 python ai_assistant.py scan http://目标，我照着敲了一遍，得到的是：

未知参数: scan

使用: python ai_assistant.py \[URL\] 或 python ai_assistant.py --interactive

同一份仓库里，docs/指导文档.md 又写着「运行 python main.py --config 配置文件.yaml」——而这个仓库里根本没有 main.py。三份文档，三种入口。

二、靶站是我自己起的：一个首页、一个登录页、一个 /admin、一个 /api/v1、一份 robots.txt、一个.env。先看指纹。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7bfd8c4d2be90e8e.png)

— 两次 AI 请求都失败了，流程仍然走完并给出结论

结论是准的，但准得有限：识别出 Python（来自响应头的 Server 字段），判成一般网站，指出缺四个安全头，风险分 40，中等。它只看 首页前 5000 个字符，页面上写了什么就信什么。

AI 那一段则是彻底空转：两次请求都因连接被拒失败，最后 AI 分析 一栏写着「未知」。它没有因此停下来，这点算设计得体面——降级路径是通的，只是降级之后剩下的，就是几条规则匹配。

接着是目录发现，220 条内置路径，限速调到每秒 30 次，13 秒跑完。结果是 6 条命中—— 但 6 条其实只有 3 个地址。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5390db4133dcff31.png)

— admin 出现两次，api 出现三次，其实是同一批地址

翻了下字典才明白：同一批路径，带斜杠和不带斜杠的版本都被收了进去（/admin 和 /admin/、/api 和 /api/），而请求又开着跟随重定向，两个变体最后都落到同一个地址上。结果直接往列表里追加，没有按最终地址去重。三条真发现就这样被撑成六条，肉眼看着还挺热闹。

网盘下载链接（一定要在虚拟机运行）：

```javascript
后台回复：20260720
获取下载链接，仅一天有效
```

**·** **今 日 推 荐** **·**

|     |     |
| --- | --- |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/55895035c2536642.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e4a3cfcd0d78c35.jpg)
|     |     |
