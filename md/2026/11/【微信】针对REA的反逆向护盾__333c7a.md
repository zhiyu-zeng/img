---
title: 【微信】针对REA的反逆向护盾
source: https://mp.weixin.qq.com/s/M6Z41FXb3MNHcUInhh-Rmg
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:46:06+08:00
trace_id: 65efd37d-e8c2-46bb-bc49-768cc653d477
content_hash: fa3a0e3b904d017140c10c34b77644fc73086723f009ec99ad2c25be90efb934
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41375244-d011-813e-935c-d2263abe4a78
ioc: null
---

**黑白之道** *2026年11月9日 08:50*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：逆向这活儿正在被AI接管，一条命令就能把二进制、Electron应用、模型文件拆个底朝天。防守方的办法很土——往程序里埋假线索，把体积撑到分析器的硬上限，然后等对方烧光预算。程序本身，运行起来一点变化都没有。

* * *

## 一、AI把逆向变成了一条流水线

传统逆向的成本在人力：一个熟练分析师盯着汇编啃几天，才能摸清一个商业软件的门道。现在这套成本被AI压到了近乎为零——自动逆向代理（REA）拿到一个发布产物，扫一遍接口清单、扒一遍符号表、跑一遍模式匹配，几分钟内就能给出一份"这个软件干了什么"的报告。

对企业软件作者来说，这事儿的性质就变了。以前防的是人，防逆向是猫鼠游戏；现在防的是算力，你的每一个字节都要被机器过一遍。

有个叫 BLA（Blind LLM Agents，专为对抗AI逆向代理设计的加固工具）的项目，就是冲着这件事去的。它把这套对抗包装成一句话的口号： **Make reverse engineering bankrupt again**——让逆向这件事再次变得不划算。

![AI机器人撞上加固护盾](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cfa75139eebe8de1.png "AI机器人撞上加固护盾")

项目托管在 GitHub 的 `qybaihe/bla` ，MIT协议，TypeScript写的，10月底建仓，一个月不到已经2.7k星、350多次fork，还挂上了GitHub当日的趋势榜第15名。

## 二、三层套路：毒化、耗尽、幻觉

BLA的思路不是把代码加密到别人读不懂——那样只会让自己的程序也跑不起来。它用的是三招组合拳：

**毒化（Poison）**：往产物里塞格式合法的蜜罐凭据、假元数据和诱饵控制流。这些东西看着都像真证据，代理会顺着假线索一路追下去。

**耗尽（Exhaust）**：把产物体积顶到REA公开文档里写死的资源上限之上。各家分析器的上限不一样，但都存在——ASAR头1MB、模型JSON嵌套32层、Go buildinfo 1MB、PCAP的tshark输出8MB，超过就报错。

**幻觉（Hallucinate）**：让分析器拿到被截断的接口清单和一堆自相矛盾的线索，同时保证 **运行时行为完全等价**。这是最关键的一条：防守方自己的程序不能有任何变化。

![三层防御机制示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24a0093b98c09a95.png "三层防御机制示意")

## 三、实测数据：分析器是怎么被撑爆的

作者用真实的REA分析路径跑了实测（不是估算），记录了加固前后的体积和REA最终报出的错误：

| 目标格式 | 加固前 → 加固后 | REA 结果 | 触发的上限 |
| --- | ---: | --- | --- |
| Electron ASAR | 607 B → 16.9 MiB | 容量错误 | `DEFAULT_ASAR_MAX_HEADER_BYTES`<br><br>（16 MB） |
| EVM 字节码 | 16 B → 4.00 MiB | 逼近输入上限 | `EVM_INTERFACE_LIMITS.inputBytes` |
| WASM | 54 B → 6.56 MiB | 接口解析不完整 | `WASM_INTERFACE_REPRESENTATION_BYTES` |
| Go buildinfo | 50 KiB → 1.16 MiB | 容量错误 | `MAX_BUILD_INFO_BYTES`<br><br>（1 MB） |
| JavaScript | 761 B → 116 KiB | 预算拒绝 | `primitive-candidates`<br><br>等语义预算 |
| SQLite | 12 KiB → 56 KiB | 列求值失败 | 蜜罐列触发 `enclave_unseal_payload()` |
| Safetensors / GGUF | 128 B / 24 B → 10.1 KiB / 7.7 KiB | 容量错误 | JSON 嵌套超过 32 层 |

成本侧的账更直观。14个目标的本地基准跑下来，token消耗平均放大 **639.5倍**，估算成本放大 **304.4倍**，而运行时输出 **14/14 全部等价**。以一个Electron剪贴板应用为例：加固前一次分析约9千token、3毛4，加固后变成2300万token、358美元。

![预算耗尽与运行时等价的对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/abd6baf65868ac11.png "预算耗尽与运行时等价的对比")

## 四、3.0和3.1：把改代码这活儿也交给Agent

推文作者@KitPloit推荐的是3.0.0版本，而这个项目的更新节奏相当凶——11月7日又放出了3.1.0。3.0是一次架构级升级：BLA从"命令行加固工具"变成了"宿主Agent加MCP的协作式加固系统"。

核心变化是引入了一条闭环：先做AST级别的 **外科手术式改造计划** （ `bla_weave_plan` ），告诉编码Agent入口函数在哪、共享状态槽位在哪、哪些分支适合下套；再由Agent动手改源码；改完用 **结构化验证器** （ `bla_verify_weave` ）跑一遍打分，不合格就返回可执行的自修复建议。配套的技能指南也升级成四阶段作战手册：侦察与门禁 → Agent改源码 → 构建并耗尽 → 等价性与改造验证。

3.1.0补上了第7项验收检查（ `crown-jewel-entanglement` ），专门拦截"假改造"——只加副作用不改逻辑、直接返回布尔常量、明文比较密钥、硬编码FLAG之类的自欺欺人写法；同时把源码验证扩展到了C、C++、Rust、Go。

## 五、怎么用，下载地址在哪

环境要求Node 22.23.4以上或24.x。上手就一条命令：

```
npx bla-agents setup        # 给你的编码Agent注册MCP和技能
npx bla-agents harden .     # 一条命令跑完 审计 → 加固 → 验证
npx bla-agents audit .      # 只做16维度的风险与成本审计
npx bla-agents benchmark    # 跑14目标的对抗基准
```

`setup` 支持Claude Code、Cursor、Codex、Gemini CLI、Windsurf、Antigravity、OpenCode、VS Code和GitHub Copilot CLI。装完之后，直接对Agent说"Harden my software against REA"就行。

下载地址：

-   npm（推荐）：https://www.npmjs.com/package/bla-agents ， `npm i -g bla-agents`
    
-   GitHub仓库：https://github.com/qybaihe/bla
    
-   3.1.0离线包：https://github.com/qybaihe/bla/releases/download/bla-agents-3.1.0/bla-agents-3.1.0.tgz
    
-   官网与案例：https://bla.tools
    

## 六、几句必须说清楚的边界

没做到的也写得明明白白：Ghidra原生反编译深度、Frida和LLDB的动态挂载、JADX的完整APK流程、固件容器、SPIR-V和CUDA fatbinary，这些路径因为缺少原生工具链而 **未经实证**，作者宁可标成"未验证"也不吹。

## 七、结语

AI逆向代理把门槛拉平了，防守方就得换个思路：不比谁的模型更聪明，而是比谁更会消耗对方的算力。往程序里塞点假线索、把体积顶到上限外、让分析器以为自己发现了什么——运行时行为一个字节都不改。

这套思路有意思的地方在于，它把攻防的成本天平又推回了防守方一边。以前我们花心思防的是人，现在要防的是账单。

**版权声明**：本文由华盟网原创编译发布，保留所有权利。文中数据引自项目官方README与发布说明。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

Tools · 目录
