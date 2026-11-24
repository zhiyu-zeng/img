---
title: 【微信】AI 简讯｜45亿美元买下模型部署入口：Palo Alto Networks为何押注Applied Compute
source: https://mp.weixin.qq.com/s/zjX70Ebpr9pRfPO-GGatMg
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T07:38:20+08:00
trace_id: e0c77f57-96d6-4ed2-b9f5-3e0bd2808f3d
content_hash: e95b1cce3a4b8c5043ca8be0b7dcc538a0bdbc8a88cad3f0be167f73b74ea89d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 42275244-d011-814b-9265-ef2480e7d237
ioc: null
---

**山石网科新视界** *2026年11月23日 14:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4fe9d36efc203173.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f6761b047c05f689.gif)

## AI赋能网安创新2026年11月18日，Palo Alto Networks宣布签署收购协议，拟以45亿美元的全股票对价收购Applied Compute。Palo Alto Networks预计将于其2027财年第三季度完成交割。 Palo Alto Networks看重的是Applied Compute在模型后训练和推理服务方面的能力。对内，这些技术可用于训练适合不同安全任务的专用模型；对外，公司希望借此参与客户的模型部署，在企业确定数据访问权限、运行环境和发布条件时，就将安全要求纳入设计。一、Applied Compute的主营业务Applied Compute成立于2025年，总部位于美国旧金山，主要为企业提供开放权重模型的后训练、评测和部署服务。三位联合创始人均曾任职于OpenAI：Applied Compute首席执行官Yash Patil曾参与编程智能体Codex的研发，首席技术官Rhythm Garg曾参与推理模型o1的研发，Linden Li则曾参与强化学习训练系统的研发。Applied Compute的研究和工程团队与客户的业务专家共同确定训练目标。客户提供业务样本、专家审核记录和质量标准；双方据此建立评测方法，选取基础模型进行后训练，并检验模型在特定任务上的表现。评测标准能否准确反映实际业务要求，直接影响训练结果的可信度。其核心产品Applied Compute Agent Cloud（AC2）将模型训练、评测和推理服务集中在同一平台。企业可以按统一标准比较不同版本，选择达到要求的版本投入生产，再将实际运行中出现的错误及人工修正结果用于后续训练。由此，模型更新的依据既包括实验数据，也包括生产环境中已确认的问题。二、为什么一家安全公司要进入模型部署专用模型与安全运营的任务差异安全运营对模型的要求因任务而异。重复告警归类的处理量大，选用模型时需兼顾分类准确性、处理时延和单次成本；判断异常登录是否需要启动应急响应，则更依赖证据的完整性和判断依据的可靠性。对后一类任务，分析师作出的判断及其理由可以转化为评测样本，用以检验新版本能否纠正既有误判，同时识别此前能够正确处理的事件。AC2的潜在价值在于支持这种评测与训练；其在其他行业的测试结果不能直接作为安全产品的效果依据。从运行监测延伸至部署阶段的权限控制Palo Alto Networks的Prisma AIRS已具备模型安全检查和运行时防护能力。但应用是否越权，并不总能从模型的输出内容中判断。例如，客服助手返回同一笔订单的金额，向负责该订单的员工披露可能符合授权，向无权访问该订单的员工披露则构成越权。两种情况下内容相同，判断依据是用户身份和订单系统的授权记录。如果助手通过权限过大的共享账号查询订单，业务系统便难以区分不同员工的请求。若在部署时保留请求者身份，由订单系统按原有权限返回结果，就可以在数据进入模型之前限制访问。参与模型部署，使安全厂商有机会与客户共同设计身份传递、数据访问和审计机制。这是AC2与Prisma AIRS可能形成互补的环节。收购的潜在收益与客户的独立核验需求收购的潜在收益在于，两支团队能够共同制定模型发布和更新机制，将安全测试结果作为版本发布的条件。例如，新版本即使回答更准确，只要未通过数据访问权限测试，企业仍可暂缓上线。这意味着安全厂商有机会在业务部门和技术部门设计应用时参与决策，安全评估也可随模型更新持续开展。部署与防护由同一厂商提供，可以降低系统对接成本，但如果安全结论只能由该厂商验证，客户将难以独立判断控制措施是否有效。客户能否导出审计记录、能否在迁移模型后继续执行原有权限规则，是衡量一体化方案能否适应多平台环境的具体标准。参考资料1.Palo Alto Networks｜收购公告，2026年11月18日：https://investors.paloaltonetworks.com/news-releases/news-release-details/palo-alto-networks-acquire-applied-compute-bringing-secure-open2.美国SEC｜Palo Alto Networks Form 8-K，交易条款：https://www.sec.gov/Archives/edgar/data/1327567/000132756726000030/panw-20261117.htm3.Palo Alto Networks｜FY2027第一季度财报电话会记录：https://investors.paloaltonetworks.com/static-files/ba371128-3ec5-4f39-be80-d2ec1fc992544.Applied Compute｜融资及经营数据公告，2026年11月2日：https://www.appliedcompute.com/company/100m-run-rate-fundraise5.Applied Compute｜AC2产品发布，2026年8月25日：https://www.appliedcompute.com/platform/introducing-ac26.Palo Alto Networks｜Prisma AIRS产品文档：https://docs.paloaltonetworks.com/prisma-airs山石网科登榜《2026年中国网络安全企业AI能力应用图谱》山石网科·网安圆桌派｜一颗安全芯片，如何成为多条产品线的共同算力底座山石网科安全托管服务合作伙伴，火热招募中！山石网科是中国网络安全行业的技术创新领导厂商，由一批知名网络安全技术骨干于2007年创立，并以首批网络安全企业的身份，于2019年9月登陆科创板（股票简称：山石网科，股票代码：688030）。现阶段，山石网科掌握30项自主研发核心技术，申请560多项国内外专利。山石网科于2019年起，积极布局信创领域，致力于推动国内信息技术创新，并于2021年正式启动安全芯片战略。2023年进行自研ASIC安全芯片的技术研发，旨在通过自主创新，为用户提供更高效、更安全的网络安全保障。目前，山石网科已形成了具备“全息、量化、智能、协同”四大技术特点的涉及基础设施安全、云安全、数据安全、应用安全、安全运营、工业互联网安全、信息技术应用创新、AI安全、安全服务、安全教育等10大类产品及服务，50余个行业和场景的完整解决方案。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/782eb0ba0fbd2029.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53152d47e57c297a.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2f25dd9ddade2287.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5ecd999c77ac6a8.webp)

AI简讯 · 目录
