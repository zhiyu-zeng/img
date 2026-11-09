---
title: 【微信】AI 时代下还需要 Fuzzing 吗?
source: https://mp.weixin.qq.com/s/Ja3itvXKZVrOdiWMC3oesQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:33:13+08:00
trace_id: 74e12b62-37a5-4b85-bdbb-1f628a304fb2
content_hash: 0f55feaaf51498c2a8a6d56931d41ebe547cfb601e43e079785ed5fc4e73294b
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41375244-d011-81ca-88b1-ff1e6a3eae09
ioc: null
---

**漏洞战争** *2026年11月8日 10:50*

1.  Fuzz引擎已经同质化，壁垒转移到 fuzz driver和编排。 AFL++、libFuzzer、honggfuzz 这几个开源引擎已经覆盖通用fuzz能力，如覆盖引导技术，性能差距在工程调优层面通常不超过一个数量级。真正拉开差距的是：有多少解析器被接进了 fuzz driver（也叫harness，但与当前agent harness易混淆，故用fuzz driver），语料能不能跨版本复用，崩溃后是否有人修复漏洞。
    
2.  商业平台卖的不是 fuzzing，是“证据”和“人效”。 协议套件卖的是标准符合性与测试报告，一体化平台卖卖的是开箱即用的接入与 triage，咨询服务卖的是帮你写 fuzz driver。封装出易用好看UI的纯 fuzzing 平台很难营利，这部分正在被开源基础设施取代。2020 年 ForAllSecure、2025 年 Metalware 先后以 fuzzing 产品进入 RSAC 创新沙盒前十；而 2025 年底 Mayhem 被 Bugcrowd 收购，说明纯 fuzzing 平台很难独立做大，价值要么纵向做深，要么被更大的测试平台吸收。
    
3.  固件是分水岭。 桌面和移动端 fuzzing 已经有成熟路径，固件 fuzzing 的瓶颈在重宿主（rehosting）和外设建模，不在 fuzzer 本身。能把固件跑起来的团队，和只会跑 afl / libFuzzer 的团队，能力差一个量级。
    
4.  AI 先改变的是 fuzz driver编写和崩溃筛选，不是 fuzzer 本身。以前都是人工写fuzz driver，再做崩溃筛选，但现在可以直接让AI去做。以往fuzz的代码覆盖率瓶颈常常受限于fuzz driver编写，很消耗人力，现在借助AI可以大大提效，而它始终并没有改变Fuzzer本身原有的处理逻辑。
    
5.  AI 时代仍需要fuzz工具，fuzz 是底座而不是对手。 AI与fuzz存在较大的经济账差异——fuzzer 用几美元的 CPU 跑几百万次执行，agent 用同样的钱只能提出几十个假设、验证其中几个。AI拥有不确定性，无法保证该测的接口都测了，测试覆盖面没有fuzz工具本身更确定。因此，AI 越强，越需要一套可确定、可复现、可并行、可回归的执行基础设施来承接它的判断——这套基础设施就是 fuzzing 平台；而 AI 系统本身，也正在变成新的解析器和攻击面。
