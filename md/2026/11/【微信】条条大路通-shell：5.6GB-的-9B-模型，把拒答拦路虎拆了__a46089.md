---
title: 【微信】条条大路通 shell：5.6GB 的 9B 模型，把拒答拦路虎拆了
source: https://mp.weixin.qq.com/s/lQs2oOWe3HuiG8kaZEJdtA
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T11:02:52+08:00
trace_id: eeafb189-e25c-48be-bbad-ec0e3bea41f6
content_hash: 945fa84f76616b05a909a077625f9fe381cf5aeb5c434c5667f449758feb485e
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 41475244-d011-813d-903e-e4665a026244
ioc: null
---

**黑白之道** *2026年11月10日 09:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：一句 `pip install -U heretic-llm` ，一个模型 ID，一台普通笔记本。跑完这一遍，DeepSeek 的推理能力留在了 9B 参数里，拒答机制被削掉了：100 条越界请求只拒 3 次，GSM8K 94.5% 反超蒸馏它的教师模型，5.6GB 的权重、Apache 2.0 协议，社区量化版被下了 30 万次。它现在能干什么、代价在哪，这篇一次说清。

![护栏被拆的 9B 模型](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9bc37ba9792d6f2e.png "护栏被拆的 9B 模型")

## 一、先把好处摆出来

**第一，体积小得离谱。** Q4_K_M 量化文件 5.24GiB，换成十进制就是 5.6GB——这正是各大新闻里"5.6GB"的来历。更小的有 IQ4_XS 4.84GB、Q4_K_S 4.98GB，效果更好的 Q8_0 8.87GB。8G 显存、16G 内存的笔记本就能跑，不用买卡。

**第二，一分钱不花，数据不出门。** 不联网、不烧 API 费、不看服务商脸色。敏感样本喂进去只在你自己的机器上转，合规审查里最难解释的"数据会不会发出去"，答案是不用发。

**第三，协议干净。** Apache 2.0，商用、改动、再分发都没问题，不用像很多"开放权重"那样先读三页 EULA。

**第四，拆护栏这件事本身可以复现。** 这个模型不是团队手工魔改的，是开源工具 Heretic v2.0.0.dev0 跑一遍出来的——有配置文件、有命令行、有文档。任何人拿一个 Hugging Face 模型 ID，一条命令就能得到同款"几乎不拒绝"的版本。

**第五，热度不是虚的。** 主仓库 7088 次下载、814 个赞；两个 GGUF 量化仓库分别 13.6 万和 14.4 万次；社区 fork 出的 24 个衍生版本累计下载超过 30 万次，光主仓加社区镜像就已经 1.9 万次以上。

**第六，成绩是真的硬**，见下文。

## 二、这是什么来路

底座是 Qwen3.5-9B，教师模型是 DeepSeek-V4-Pro 的 Max Effect 模式。训练用大约 25 万条数学和 STEM 样本做监督微调，之后再走一段轻量强化学习，强化算法是 GSPO（分组逐步偏好优化）。

底座作者本人还拿它做过一个能玩的 Demo——硬件工程师 Kyle Hessling 用它搭了个叫 Star Skip 的互动小游戏，仓库在 `KyleHessling1/starskip` 。9B 能不能撑起交互式应用，从这侧面能看出点门道。

最后一步才是关键：发布者用 Heretic（开源的去审查工具）处理了一遍，把拒答机制从权重里剥掉。

![蒸馏与剥离链路](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e26c8a097a064a7f.png "蒸馏与剥离链路")

## 三、成绩单：9B 打赢了 70B

先看 GSM8K（小学数学应用题基准）。NVFP4 量化、vLLM 后端、连跑四次的平均值是 94.50%。教师模型 DeepSeek-V4-Pro 本身是 92.60%，学生反超了老师一线；参考位上的 Llama-3.3-70B-Instruct 是 94.84%，基本贴着。

MMLU-Pro 更狠。数学、物理、化学各抽 500 题，平均 90.53%，是测试过的 9B 里最高的。对照组：官方 Qwen3.5-9B 89.60%，Claude Mythos 蒸馏 9B 只有 81.07%，27B 版本 86.20%。

![模型卡性能快照](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d53d50418020539d.jpg "模型卡性能快照")

真正反直觉的是 token 成本。同样 1500 道题，它平均每题只烧 2858 个推理 token，每答对一题的中位数成本 676 个 token；官方 Qwen3.5-9B 是 4425 和 3214。按每百万 token 能产出多少正确答案算，这个模型 316.8 个，比 Qwen 高 56.4%，比 Claude Mythos 蒸馏 9B 高 29.3%。又准又省，这才是蒸馏该有的样子。

还有一个细节值得记：题目要求"思考之后只输出一个大写字母"，它 97.2% 照做，官方 Qwen3.5-9B 只有 37.3%，Claude Mythos 蒸馏 9B 是 69.6%。格式服从性这一项，现在很多大模型都栽跟头。

GSM8K 那 2638 条原始轨迹也统计过：平均每题 1627 个推理 token，中位数 372，P90 到 3042。大部分题它三两下就推完了，只有难题才展开长链。分科看 token 省幅：数学省 47.4%、化学省 32.1%、物理省 30.8%。

## 四、护栏是怎么被拆的

老办法叫 abliteration（方向消融）：在残差流里找一根"拒答方向"的向量，从激活里减掉。问题也在这——为了拿掉一个方向，顺手砍掉了模型的其他能力。

Heretic 2.0 默认用 ARA（任意秩消融），思路不同：直接重写权重矩阵，在网络里挖出一个多维的拒答子空间，秩是任意的。剥得更干净，能力损伤更小。

这个模型的具体参数写在模型卡里：改写层 9 到 24，保留正常行为的权重 0.8264，压制异常行为的权重 0.0003，过校正相对权重 0.9645，邻居计数 12。

![模型卡上的 ARA 参数](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/87186af56568e3d9.jpg "模型卡上的 ARA 参数")

代价指标是 KL 散度，衡量原模型行为被改动多少。这个模型 0.0422，越低越接近原模型。拿另一个模型做参照：Gemma-3-12B-IT 上手工做的消融，KL 是 1.04，差距二十多倍。

Heretic 本身也不止能拆护栏：config.noslop 去废话，config.nohumor 去幽默，config.nosyco 去谄媚，config.emotions 调情绪对齐。它是训练无关的工具，不重训、不动数据集，装上就能跑：

```bash
pip install -U heretic-llm
heretic xtools-at/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic
```

官方给的显存经验值是每十亿参数约 2.5GB，处理 9B 大概要 22GB 显存，家用卡得认真算算。

## 五、下载地址

要完整权重，走主仓库（safetensors 格式，transformers 或 vLLM 加载）： `https://huggingface.co/xtools-at/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic`

要量化版，用 i1 这个 GGUF 仓库（llama.cpp、LM Studio、Ollama 都能吃）： `https://huggingface.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-i1-GGUF`

量化给得很全：IQ4_XS 4.84GB、IQ4_NL 5.05GB、Q4_K_M 5.24GiB、Q4_1 5.41GB、Q8_0 8.87GB。

```
llama-cli -m DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic.i1-Q4_K_M.gguf -c 8192
```

另一份量化更全的 GGUF 仓库（14.4 万次下载）： `https://huggingface.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-GGUF`

内存吃紧的话有 4B 版本，配置基本一样： `https://huggingface.co/xtools-at/DeepSeek-V4-Pro-Qwen3.5-4B-UNCENSORED-heretic`

Mac 用户直接上 MLX 4bit： `https://huggingface.co/laewr/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-MLX-4bit`

想留着有护栏的版本做对照： `https://huggingface.co/Jackrong/DeepSeek-V4-Pro-Qwen3.5-9B`

工具本体：GitHub `https://github.com/p-e-w/heretic` ，文档站 `https://heretic-project.org` 。

## 六、红队视角：这东西值不值得装进机器

值得的理由很实在：本地跑，不联网，不烧 API 钱，样本数据不外流。做 PoC 验证、造对抗样本、或者需要一个"不会跟你打太极"的模型去生成越界测试用例时，它是够格的工具。5 点几个 G 的体积意味着红队同事人手一台，不用申请 GPU 配额。

但账要算清楚。护栏拆掉不等于变聪明——模型卡自己的 Limitations 里写着，复杂指令下更容易出现逻辑幻觉；MMLU-Pro 只抽了每个子集 500 题，不算全面评测；GSM8K 和 MMLU-Pro 用的量化构建和推理后端不同，两个分数不能互推。

网易那篇《5.6GB跑9B无审查模型，拒答只剩3条》结尾那句话说得挺准：去审查不等于更正确，它只是更敢说了。把它放进测试沙盒，做实验、跑验证、折腾想法都行；关键决策链，别让它单独站着。

**原文链接**： 网易号 报错免疫体《5.6GB跑9B无审查模型，拒答只剩3条》 https://www.163.com/dy/article/LB615A2R05561FZJ_pdya11y.html X 推文 @0x0SojalSec https://x.com/0x0SojalSec/status/2119171678395834518

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
