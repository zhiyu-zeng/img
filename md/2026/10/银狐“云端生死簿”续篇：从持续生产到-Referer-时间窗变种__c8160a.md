---
title: 银狐“云端生死簿”续篇：从持续生产到 Referer 时间窗变种
source: https://blog.netlab.360.com/yin-hu-yun-duan-sheng-si-bo-xu-pian-cong-chi-xu-sheng-chan-dao-referer-shi-jian-chuang-bian-chong/
source_host: blog.netlab.360.com
clip_date: 2026-10-15T13:10:02+08:00
trace_id: 7226ec75-0994-437a-803d-2b8f32ff6cae
content_hash: c85208bb0297f768271113235482024a70c96f678e0710237669327dd842fa98
status: synced
tags:
  - 恶意样本
  - 协议分析
series: null
feed_source: 360 Netlab
ai_summary: 银狐投递链的调度接口已进入第五阶段：白名单命中叠加 00:00—08:00 时间窗，命中不再返回样本地址，而是返回 `https://www.360.com/`，该无害返回仍可用来识别银狐域名。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-815d-aa64-e21c595aa27d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 银狐投递链的调度接口已进入第五阶段：白名单命中叠加 00:00—08:00 时间窗，命中不再返回样本地址，而是返回 `https://www.360.com/`，该无害返回仍可用来识别银狐域名。
> 
> - **阶段判定：** 第五阶段不是白名单失效，而是命中条件加时间窗、命中响应由样本下载地址变为 360 官网，转变时间未知，不能以 9/14 日报或 9/22 实验起点代替。
> - **生产机制两段：** 9/14—17 用 `referer` 头请求 `noah-ssh.com.cn`；9/18 起改用 `h` 查询参数，节点为 `game-houtai2.com.cn`，10/3 起换 `game-houtai9.com.cn`；`t` 为毫秒时间戳。生产窗口为 00:00—08:00。
> - **实验规模：** 8 个域名、每域名 959 轮、7,672 条采样、30,688 个模式结果；原始域名组返回 360 为 2,034/2,025 次，删除首字符的破坏域名组为 0 次；代理/直连配对 6,539 与 6,547 对返回 URL 完全一致，未见客户端地址影响。
> - **生产成果：** 27 份日报逐日累计 2,043 个次（Referer 491、h 参数 1,552），跨日去重 1,930 个域名；HTTP 200 共 8,748,258 次，非 200/失败 846,905 次。缺报、全失败与未命中需分开记录。
> - **遗留疑问：** 命中银狐域名反而返回 360 官网、非银狐域名却可能返回样本入口，“控制夜间带宽成本”难以完整解释，服务端实现与运营动机均未还原。

## 摘要：投递链、生产实践与实验的位置

本文是 360 Netlab [《银狐云端“生死簿”：从“无条件返回”到“黑名单”机制》](https://blog.netlab.360.com/yin-hu-yun-duan-sheng-si-bo-cong-wu-tiao-jian-fan-hui-dao-hei-ming-dan-ji-zhi/) 的后续分析，承接前文四阶段时间线。本轮实验确认了一个新的阶段—— **第五阶段：Referer 的时间窗变种**。这不是第二阶段白名单机制的简单失效，而是 **白名单判定增加了时间窗口，命中后的返回内容也发生了变化**：第二阶段命中返回样本下载地址；第五阶段命中且处于 00:00—08:00 时，返回 `https://www.360.com/` 。具体何时发生这一转变，现有材料尚无法确定。持续生产又分为两部分：先以 Referer 请求头传递候选域名，随后改用 h 请求参数。

前文还原的银狐投递链由几部分共同组成：仿冒下载页面负责引流并触发请求； `relays.json` 提供中转池；调度接口 `api.php` 返回 `download_link` ；下载入口负责后续投递；访问统计作为旁路组件。本文的生产与实验都围绕其中的 **调度返回环节** 展开，不是对下载载荷内容的重新鉴定。

我们先持续利用返回差异生产域名数据，日报从 **2026 年 9 月 14 日** 开始；生产中偶尔发现白天识别失效，但日常生产仍能获得数据，于是怀疑有效识别信号受时段影响，再从 **9 月 22 日** 开始每半小时一次的原始／破坏域名、代理／直连四模式实验。现有材料未记录首次白天失效的精确日期。

四模式实验保存了 8 个域名、7,672 条采样、30,688 个模式结果。多个日期的夜间，原始域名组返回 360 官网，破坏域名组同期仍返回其他入口；08:00—08:30 相邻采样之间，四组恢复一致。原始域名代理组与直连组分别记录到 360 返回 **2,034 次和 2,025 次**，破坏组两组均为 **0 次**。这些是重复观测次数，与生产的每日域名数量不能相加。

生产在 **00:00—08:00** 窗口进行。27 份日报中， `download_link` 为 `https://www.360.com/` 的 count，按本次生产口径计为当日识别的银狐域名数：Referer 阶段 **491 个次**，参数阶段 **1,552 个次**，逐日累计 **2,043 个次**；对应列表跨日去重为 **1,930 个域名**。这里的 360 官网是无害返回信号，不是银狐恶意下载域名。

本文区分三类证据：前文提供链路背景，日报说明已使用的输入机制和生产成果，连续实验确认域名命中与时间窗口共同影响返回。 **虽然第五阶段命中后返回的不是样本下载地址，不能沿用第二阶段的方式下载样本，但这个返回特征仍能用于识别银狐域名。** 服务端具体实现和规则转变的准确时间仍未还原。

银狐投递链：持续生产中的异常推动半小时实验 投递链的调度返回环节是研究位置。9月14日起的日报展示先使用Referer、后使用h参数的生产实践；白天识别偶发失效与日常仍有产出的反差，促使9月22日起开展四模式半小时实验。 01 / 银狐投递链 · 本次研究位置 前文架构：仿冒页面 → 中转池 → 调度接口 → 下载入口；本次研究调度返回差异。 观察位置：api.php → download_link 仿冒下载页面 引流 / 页面脚本 发起带来源信息的请求 中转池发现 relays.json 提供调度节点 调度接口 api.php 按输入条件返回 URL 返回 URL · 观测终点 360.com / 其他下载入口 本轮记录返回值 访问统计（旁路） 前文组件 / 记录到访 下载与后续投递 用户点击后的链路 / 前文背景 生产日报与连续实验均围绕调度返回环节开展。 两组数据的节点、输入和统计单位分别保留。 02 / 已有生产实践 · 日报自 09/14 开始 候选域名 批量输入候选 生产窗口 00:00—08:00 域名输入 · 两个部分 09/14—17：Referer 请求头 09/18 起：h 请求参数 10/03 起更换参数机制节点 筛选响应 download_link = 360.com 对应当日识别域名 其他响应 / 失败分别记录 真实生产结果 逐日累计 2,043 个次 跨日去重 1,930 个域名 27 份日报 / 3 个缺报日期 实验动机 · 持续生产中的实际观察 持续利用机制生产 → 偶尔发现白天识别失效 → 日常生产仍有产出 → 怀疑时间条件 “白天失效”指识别信号失去区分能力；不等同于接口宕机。首次异常日期未精确记录。 03 / 为解释生产现象，09/22 起每半小时做一次四模式实验 8 个域名 Original：原始域名 Broken：删除首字符 959 条记录 / 域名 网络路径 原始域名 破坏域名 使用代理 直接访问 Original + Proxy Broken + Proxy Original + Direct Broken + Direct 返回值记录 约半小时一轮 t / tb + 四组 URL 空值保留为缺失 时序比较 夜间 / 日间对照 原始 / 破坏对照 随日期变化 实验结果与生产成果分别计数 实验：7,672 条记录 / 30,688 个结果；原始组返回 360 为 2,034 / 2,025 次，不能与生产域名数相加。 图 1 / 生产先于连续实验；代理用于检验客户端地址影响，破坏域名用于构造非银狐域名对照。

图 1｜上部链路架构依据前文；中部显示已有生产及其异常如何推动研究；下部为四模式观测。

## 一、第五阶段中的两部分生产机制

### 1.1 从前文四阶段到本次第五阶段

连续实验表明，本轮面对的是一个新的响应阶段，而不是第二阶段白名单机制失去了识别能力。 **名单命中仍然能够区分银狐域名与非银狐域名，但这种差异增加了 00:00—08:00 的时间条件，命中响应也从样本下载地址变成了 360 官网。** 前文第二阶段的 Referer 白名单与第四阶段的黑名单构成演化背景；现有记录不足以确定策略何时转变，不能把 9 月 14 日的日报起点或 9 月 22 日的实验起点当作规则上线日期。

| 阶段  | 性质  | 核心行为或观察信号 |
| --- | --- | --- |
| 第一阶段：无条件返回 | 投递策略 | 访问中转节点即可获得下载地址 |
| 第二阶段：白名单限制 | 投递策略 | Referer 命中在投域名才下发有效载荷 |
| 第三阶段：批量探测 | 研究者探测行动 | 利用白名单返回差异识别候选域名 |
| 第四阶段：云端黑名单 | 服务端策略调整 | 名单内返回无害素材，名单外返回载荷入口 |
| 第五阶段：Referer 的时间窗变种 | 白名单叠加时间窗口的新阶段 | 白名单命中且处于 00:00—08:00，返回 360 官网；该差异可用于识别银狐域名 |

第二阶段与第五阶段的关键区别，不在于“还能否下载到某个文件”，而在于命中条件及命中响应发生了什么变化：

| 比较项 | 第二阶段：白名单限制 | 第五阶段：白名单叠加时间窗口 |
| --- | --- | --- |
| 核心命中条件 | 白名单命中 | 白名单命中，且处于 00:00—08:00 |
| 命中响应 | 样本下载地址 | `https://www.360.com/` |
| 能否按命中响应下载样本 | 可以据返回地址继续获取样本 | 不能，返回的是 360 官网 |
| 域名识别价值 | 利用是否返回样本地址进行区分 | 利用窗口内是否返回 360 官网进行区分 |
| 规则转变发生时间 | —   | 尚不清楚，不能以本轮记录起点代替 |

前四阶段的机制及研究背景见 [前文](https://blog.netlab.360.com/yin-hu-yun-duan-sheng-si-bo-cong-wu-tiao-jian-fan-hui-dao-hei-ming-dan-ji-zhi/) 。实验中的新线索是“同一个域名条件，白天与夜间表现不同；同一个时段，原始与破坏域名又表现不同”。只取某一时刻的响应，容易把暂时的无害返回误认为持续失效。

### 1.2 第一部分：9 月 14—17 日，以 Referer 传递域名

这四份日报在介绍区记录了以下用法，将候选域名放在 Referer 请求头中，目标节点为 `noah-ssh.com.cn` ：

```bash
curl 'https://noah-ssh.com.cn/api.php' \
  -H 'referer: https://domain/'
```

`domain` 是日报示例中的候选域名占位符。分析响应中的 `download_link` ，取返回 360 官网的候选域名进入每日生产结果。四天逐日数量分别为 **0、109、219、163**，合计 **491 个次**。9 月 14 日虽有成功响应，但没有 360 返回，不能把其他响应分组的 count 计入这项产出。

### 1.3 第二部分：9 月 18 日起，以 h 请求参数传递域名

9 月 18 日起，日报中的请求改为在查询参数 `h` 中传递候选域名，先请求 `game-houtai2.com.cn` ：

```bash
curl 'https://game-houtai2.com.cn/api.php?t=1789524062949&h=114phonepc.com.cn'
```

10 月 3 日起，日报记录的节点更换为 `game-houtai9.com.cn` ：

```bash
curl 'https://game-houtai9.com.cn/api.php?t=1789524062949&h=114phonepc.com.cn'
```

以上为已有生产方式的记录，URL 用引号保护 `&` ，本次整理不执行这些请求。其中， **h 承载候选域名，t 传入请求时的当前时间戳，单位为毫秒**。上述 curl 保留日报中的历史示例值，用于展示参数结构；实际使用时， `t` 应取当前毫秒级时间戳。生产日期仍按日报文件名统计。这部分有 23 份日报，合计 **1,552 个次**。

这里的 `t` 是接口请求参数，与后文实验 HTML 中用于记录观测时间的 `t` ／ `tb` 字段不同，不应混为同一个数据字段。

这两个部分属于本次第五阶段中的 **生产输入机制变化**，不应与前文“第一阶段、第二阶段”的整体时间线混淆。已有日报证明用法发生变化；只有日期级材料，不能推定切换发生在当天哪一秒。

生产先于实验的两阶段机制时间线 9月14日至17日Referer机制，9月18日起h参数机制，10月3日起参数节点更换。9月22日才开始四模式连续实验，持续到10月12日。 先持续生产，再为解释白天失效启动连续实验 09/14 09/18 09/22 10/03 10/13 第一部分 · Referer 09/14—17 noah-ssh.com.cn 第二部分 · h 参数 game-houtai2.com.cn game-houtai9.com.cn 四模式半小时实验 09/22 起 · 8 个域名 · 原始 / 破坏 × 代理 / 直连 生产记录延续至 10/13；实验记录止于 10/12。此图按日期定位，不补造缺报日期的数据。 白天识别偶发失效 + 日常仍有产出 → 怀疑时段因素 → 每半小时观测；首次异常日期未精确记录。

图 2｜生产日报早于正式实验：9 月 14 日开始已有记录，9 月 22 日才启动四模式连续观测。生产记录延续至 10 月 13 日，实验数据止于 10 月 12 日；图中日期跨度不表示缺日报日期已被补齐。

## 二、为什么启动每半小时一次的连续实验

研究动机来自持续生产的实际反差：我们一直使用上述机制获取域名数据，偶尔在白天复测时发现它失去有效区分信号，但日常生产又仍然有产出。这意味着“某一次白天无法识别”并不能解释机制在整个日期是否有效，时间因素值得单独检验。

这里的 **白天失效** 是指在时间窗口之外，域名识别信号失去了有效区分能力， **不代表白名单判定本身消失或永久失效**，也不等同于调度接口宕机、仿冒网站下线或样本停止投递。日报存在零命中和全失败，因此“持续生产”表示持续开展生产工作，不表示每一天都有非零命中。

为解释这个反差，随后才设计半小时对照实验：对同一批 8 个域名，比较原始／删除首字符的破坏域名，并各自区分代理／直连，连续记录四组返回值。它把“域名输入条件”和“观测时间”放到一起比较，帮助判断何时能看到差异，何时差异消失。

## 三、实验设计：把 2 × 2 对照放到时间轴上

### 3.1 数据规模与字段口径

| 指标  | 实测规模 |
| --- | --- |
| 域名数 | 8   |
| 每个域名的采样记录 | 959 |
| 总采样记录 | 7,672 |
| 每条记录包含的访问模式 | 4   |
| 总模式结果 | 30,688（含空值） |
| 原始组时间 t 的全局范围 | 2026-09-22 11:30:04 — 2026-10-12 10:30:41 |
| 破坏组时间 tb 的全局范围 | 2026-09-22 11:30:07 — 2026-10-12 10:30:43 |

记录主要以半小时为间隔。这里的 7,672 条是“域名 × 采样轮次”的记录数，30,688 是四个结果槽位的数量，不能当作已确认的成功请求数。

### 3.2 变量矩阵

| 网络路径 | 原始域名 Original | 破坏域名 Broken |
| --- | --- | --- |
| 使用代理 Proxy | OP / Original + Proxy | BP / Broken + Proxy |
| 直接访问 Direct | OD / Original + Direct | BD / Broken + Direct |

所有破坏域名均由银狐域名删除首字符得到。例如， `huawei-download.com.cn` 对应 `uawei-download.com.cn` 。 **破坏域名作为非银狐域名对照，用于检验非银狐域名与银狐域名的返回是否存在差异。**

**代理／直连对照用于检验返回是否受客户端地址影响。** 两种网络路径在相同域名条件下进行对比，检查改变客户端出口地址后，返回 URL 是否变化；原始／破坏域名则在相同网络路径下比较，检查域名条件带来的差异。

| 原始域名（Original） | 删除首字符后的域名（Broken） |
| --- | --- |
| `huawei-download.com.cn` | `uawei-download.com.cn` |
| `shalou-tool.com.cn` | `halou-tool.com.cn` |
| `uc-dev.com.cn` | `c-dev.com.cn` |
| `i4setup.com.cn` | `4setup.com.cn` |
| `intel-download.com.cn` | `ntel-download.com.cn` |
| `itunes-setup.com.cn` | `tunes-setup.com.cn` |
| `tianyancha-ca.com.cn` | `ianyancha-ca.com.cn` |
| `finalshell-cn.com.cn` | `inalshell-cn.com.cn` |

实验以四组返回 URL 为观测指标；空值单独保留，不当作 360 返回或其他下载入口。空值的具体错误原因未记录，不能据此直接判断接口宕机或请求被拦截。

### 3.3 先看组间差异：360 返回只在原始域名组

| 访问模式 | 模式结果数 | 返回 `360.com` | 其他非空 URL | 空值  |
| --- | --- | --- | --- | --- |
| Original + Proxy | 7,672 | 2,034 | 4,564 | 1,074 |
| Original + Direct | 7,672 | 2,025 | 4,525 | 1,122 |
| Broken + Proxy | 7,672 | 0   | 6,602 | 1,070 |
| Broken + Direct | 7,672 | 0   | 6,556 | 1,116 |

这里的“其他非空 URL”是其余六个观测地址的合计。原始域名在有效窗口内可返回 360，而作为非银狐对照的破坏域名从未返回 360。 **这证明域名命中差异没有消失，只是在第五阶段变成了带时间窗口的 360 返回信号。**

再看客户端地址对照：仅比较代理与直连两侧均取得非空返回的记录，原始域名组有 6,539 对，破坏域名组有 6,547 对，返回 URL 均完全一致。

| 同一域名条件下的网络对照 | 两侧均非空的配对记录 | 返回 URL 一致 | 返回 URL 不同 | 至少一侧为空 |
| --- | --- | --- | --- | --- |
| 原始域名：Proxy / Direct | 6,539 | 6,539 | 0   | 1,133 |
| 破坏域名：Proxy / Direct | 6,547 | 6,547 | 0   | 1,125 |

因此，在本次代理／直连条件下， **未观察到客户端地址改变导致有效返回 URL 不同**；原始与非银狐对照域名之间的差异则十分明显。两侧都非空的配对一致率为 100%，但空值仍需单独处理，也不能由有限出口地址的实验推断所有客户端地址均无影响。

### 3.4 全实验周期：四条轨道怎样共同变化

只看两个典型日期，容易忽略实验过程中响应规则的连续变化。下面把 **8 个域名、每个域名 959 轮采样的四组结果** 放到同一幅全周期总览中：每个域名上方两条轨道为原始域名，下方两条为破坏域名；Proxy／Direct 分别表示代理和直连。颜色与典型日期图一致，连续相同返回值合并成色段，仍完整覆盖全部 30,688 个结果。

全实验周期：8 个域名的四模式响应总览 每个域名四条轨道，覆盖959轮采样、全体30688个结果。原始两组反复出现360返回，破坏两组保持下载入口，跨日共同空值和末段入口更新在全周期上可直接比较。 全实验周期 · 四模式整体响应 8 个域名 / 7,672 条采样 / 30,688 个结果 / 7 个非空返回 URL 360（官网） L0 L1 L2 L3 L4 L5 空值 huawei-download.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy huawei-download.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 huawei-download.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 199 个结果 huawei-download.com.cn / Original + Proxy / https://www.360.com/ / 255 个结果 huawei-download.com.cn / Original + Proxy / 空值 / 134 个结果 huawei-download.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 huawei-download.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 huawei-download.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 huawei-download.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct huawei-download.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 huawei-download.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 195 个结果 huawei-download.com.cn / Original + Direct / https://www.360.com/ / 253 个结果 huawei-download.com.cn / Original + Direct / 空值 / 143 个结果 huawei-download.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 138 个结果 huawei-download.com.cn / Original + Direct / https://www.wenb481.com/down666 / 112 个结果 huawei-download.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 huawei-download.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy huawei-download.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 huawei-download.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 317 个结果 huawei-download.com.cn / Broken + Proxy / 空值 / 135 个结果 huawei-download.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 huawei-download.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 huawei-download.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 huawei-download.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct huawei-download.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 huawei-download.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 316 个结果 huawei-download.com.cn / Broken + Direct / 空值 / 136 个结果 huawei-download.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 207 个结果 huawei-download.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 162 个结果 huawei-download.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 42 个结果 huawei-download.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 shalou-tool.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy shalou-tool.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 shalou-tool.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 198 个结果 shalou-tool.com.cn / Original + Proxy / https://www.360.com/ / 255 个结果 shalou-tool.com.cn / Original + Proxy / 空值 / 135 个结果 shalou-tool.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 shalou-tool.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 shalou-tool.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 shalou-tool.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct shalou-tool.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 shalou-tool.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 198 个结果 shalou-tool.com.cn / Original + Direct / https://www.360.com/ / 252 个结果 shalou-tool.com.cn / Original + Direct / 空值 / 141 个结果 shalou-tool.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 137 个结果 shalou-tool.com.cn / Original + Direct / https://www.wenb481.com/down666 / 113 个结果 shalou-tool.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 shalou-tool.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy shalou-tool.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 shalou-tool.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 316 个结果 shalou-tool.com.cn / Broken + Proxy / 空值 / 136 个结果 shalou-tool.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 shalou-tool.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 shalou-tool.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 shalou-tool.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct shalou-tool.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 shalou-tool.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 315 个结果 shalou-tool.com.cn / Broken + Direct / 空值 / 139 个结果 shalou-tool.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 206 个结果 shalou-tool.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 162 个结果 shalou-tool.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 41 个结果 shalou-tool.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 uc-dev.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy uc-dev.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 uc-dev.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 202 个结果 uc-dev.com.cn / Original + Proxy / https://www.360.com/ / 251 个结果 uc-dev.com.cn / Original + Proxy / 空值 / 135 个结果 uc-dev.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 uc-dev.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 uc-dev.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 uc-dev.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct uc-dev.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 uc-dev.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 201 个结果 uc-dev.com.cn / Original + Direct / https://www.360.com/ / 250 个结果 uc-dev.com.cn / Original + Direct / 空值 / 139 个结果 uc-dev.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 138 个结果 uc-dev.com.cn / Original + Direct / https://www.wenb481.com/down666 / 113 个结果 uc-dev.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 uc-dev.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy uc-dev.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 uc-dev.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 320 个结果 uc-dev.com.cn / Broken + Proxy / 空值 / 132 个结果 uc-dev.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 uc-dev.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 uc-dev.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 uc-dev.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct uc-dev.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 uc-dev.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 315 个结果 uc-dev.com.cn / Broken + Direct / 空值 / 140 个结果 uc-dev.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 204 个结果 uc-dev.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 162 个结果 uc-dev.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 42 个结果 uc-dev.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 i4setup.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy i4setup.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 i4setup.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 199 个结果 i4setup.com.cn / Original + Proxy / https://www.360.com/ / 255 个结果 i4setup.com.cn / Original + Proxy / 空值 / 134 个结果 i4setup.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 i4setup.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 i4setup.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 i4setup.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct i4setup.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 i4setup.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 197 个结果 i4setup.com.cn / Original + Direct / https://www.360.com/ / 254 个结果 i4setup.com.cn / Original + Direct / 空值 / 140 个结果 i4setup.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 137 个结果 i4setup.com.cn / Original + Direct / https://www.wenb481.com/down666 / 113 个结果 i4setup.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 i4setup.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy i4setup.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 i4setup.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 319 个结果 i4setup.com.cn / Broken + Proxy / 空值 / 133 个结果 i4setup.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 i4setup.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 i4setup.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 i4setup.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct i4setup.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 i4setup.com.cn / Broken + Direct / 空值 / 142 个结果 i4setup.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 314 个结果 i4setup.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 205 个结果 i4setup.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 160 个结果 i4setup.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 42 个结果 i4setup.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 intel-download.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy intel-download.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 intel-download.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 198 个结果 intel-download.com.cn / Original + Proxy / https://www.360.com/ / 255 个结果 intel-download.com.cn / Original + Proxy / 空值 / 135 个结果 intel-download.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 intel-download.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 intel-download.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 intel-download.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct intel-download.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 intel-download.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 196 个结果 intel-download.com.cn / Original + Direct / https://www.360.com/ / 255 个结果 intel-download.com.cn / Original + Direct / 空值 / 141 个结果 intel-download.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 138 个结果 intel-download.com.cn / Original + Direct / https://www.wenb481.com/down666 / 111 个结果 intel-download.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 intel-download.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy intel-download.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 intel-download.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 318 个结果 intel-download.com.cn / Broken + Proxy / 空值 / 134 个结果 intel-download.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 intel-download.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 intel-download.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 intel-download.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct intel-download.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 intel-download.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 315 个结果 intel-download.com.cn / Broken + Direct / 空值 / 140 个结果 intel-download.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 204 个结果 intel-download.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 162 个结果 intel-download.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 42 个结果 intel-download.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 itunes-setup.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy itunes-setup.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 itunes-setup.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 200 个结果 itunes-setup.com.cn / Original + Proxy / https://www.360.com/ / 255 个结果 itunes-setup.com.cn / Original + Proxy / 空值 / 133 个结果 itunes-setup.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 itunes-setup.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 itunes-setup.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 itunes-setup.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct itunes-setup.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 itunes-setup.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 196 个结果 itunes-setup.com.cn / Original + Direct / https://www.360.com/ / 254 个结果 itunes-setup.com.cn / Original + Direct / 空值 / 141 个结果 itunes-setup.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 136 个结果 itunes-setup.com.cn / Original + Direct / https://www.wenb481.com/down666 / 114 个结果 itunes-setup.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 itunes-setup.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy itunes-setup.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 itunes-setup.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 318 个结果 itunes-setup.com.cn / Broken + Proxy / 空值 / 134 个结果 itunes-setup.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 itunes-setup.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 itunes-setup.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 itunes-setup.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct itunes-setup.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 itunes-setup.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 314 个结果 itunes-setup.com.cn / Broken + Direct / 空值 / 141 个结果 itunes-setup.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 206 个结果 itunes-setup.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 160 个结果 itunes-setup.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 42 个结果 itunes-setup.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 tianyancha-ca.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy tianyancha-ca.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 tianyancha-ca.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 202 个结果 tianyancha-ca.com.cn / Original + Proxy / https://www.360.com/ / 253 个结果 tianyancha-ca.com.cn / Original + Proxy / 空值 / 133 个结果 tianyancha-ca.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 tianyancha-ca.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 tianyancha-ca.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 tianyancha-ca.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct tianyancha-ca.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 tianyancha-ca.com.cn / Original + Direct / 空值 / 139 个结果 tianyancha-ca.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 199 个结果 tianyancha-ca.com.cn / Original + Direct / https://www.360.com/ / 252 个结果 tianyancha-ca.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 137 个结果 tianyancha-ca.com.cn / Original + Direct / https://www.wenb481.com/down666 / 114 个结果 tianyancha-ca.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 tianyancha-ca.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy tianyancha-ca.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 tianyancha-ca.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 320 个结果 tianyancha-ca.com.cn / Broken + Proxy / 空值 / 132 个结果 tianyancha-ca.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 tianyancha-ca.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 tianyancha-ca.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 tianyancha-ca.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct tianyancha-ca.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 tianyancha-ca.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 317 个结果 tianyancha-ca.com.cn / Broken + Direct / 空值 / 138 个结果 tianyancha-ca.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 205 个结果 tianyancha-ca.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 161 个结果 tianyancha-ca.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 42 个结果 tianyancha-ca.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 finalshell-cn.com.cn 959 次采样 · 09/22—10/12 09/22 11:30 09/26 11:30 09/30 11:30 10/04 11:30 10/08 11:30 10/12 10:30 Original + Proxy finalshell-cn.com.cn / Original + Proxy / https://www.vh59l74.com/920down / 23 个结果 finalshell-cn.com.cn / Original + Proxy / https://www.oj44472.com/insdow92 / 198 个结果 finalshell-cn.com.cn / Original + Proxy / https://www.360.com/ / 255 个结果 finalshell-cn.com.cn / Original + Proxy / 空值 / 135 个结果 finalshell-cn.com.cn / Original + Proxy / https://www.xhxjz08.com/30load / 139 个结果 finalshell-cn.com.cn / Original + Proxy / https://www.wenb481.com/down666 / 114 个结果 finalshell-cn.com.cn / Original + Proxy / https://www.wqhu584.com/10load / 22 个结果 finalshell-cn.com.cn / Original + Proxy / https://www.eyqw474.com/11load / 73 个结果 Original + Direct finalshell-cn.com.cn / Original + Direct / https://www.vh59l74.com/920down / 23 个结果 finalshell-cn.com.cn / Original + Direct / https://www.oj44472.com/insdow92 / 198 个结果 finalshell-cn.com.cn / Original + Direct / https://www.360.com/ / 255 个结果 finalshell-cn.com.cn / Original + Direct / 空值 / 138 个结果 finalshell-cn.com.cn / Original + Direct / https://www.xhxjz08.com/30load / 138 个结果 finalshell-cn.com.cn / Original + Direct / https://www.wenb481.com/down666 / 112 个结果 finalshell-cn.com.cn / Original + Direct / https://www.wqhu584.com/10load / 22 个结果 finalshell-cn.com.cn / Original + Direct / https://www.eyqw474.com/11load / 73 个结果 Broken + Proxy finalshell-cn.com.cn / Broken + Proxy / https://www.vh59l74.com/920down / 23 个结果 finalshell-cn.com.cn / Broken + Proxy / https://www.oj44472.com/insdow92 / 318 个结果 finalshell-cn.com.cn / Broken + Proxy / 空值 / 134 个结果 finalshell-cn.com.cn / Broken + Proxy / https://www.xhxjz08.com/30load / 207 个结果 finalshell-cn.com.cn / Broken + Proxy / https://www.wenb481.com/down666 / 162 个结果 finalshell-cn.com.cn / Broken + Proxy / https://www.wqhu584.com/10load / 42 个结果 finalshell-cn.com.cn / Broken + Proxy / https://www.eyqw474.com/11load / 73 个结果 Broken + Direct finalshell-cn.com.cn / Broken + Direct / https://www.vh59l74.com/920down / 23 个结果 finalshell-cn.com.cn / Broken + Direct / https://www.oj44472.com/insdow92 / 314 个结果 finalshell-cn.com.cn / Broken + Direct / 空值 / 140 个结果 finalshell-cn.com.cn / Broken + Direct / https://www.xhxjz08.com/30load / 206 个结果 finalshell-cn.com.cn / Broken + Direct / https://www.wenb481.com/down666 / 161 个结果 finalshell-cn.com.cn / Broken + Direct / https://www.wqhu584.com/10load / 42 个结果 finalshell-cn.com.cn / Broken + Direct / https://www.eyqw474.com/11load / 73 个结果 连续相同返回值合并为色段，完整保留全部采样；空值为灰色。L0—L5 对应正文返回地址索引。

图 3｜全实验周期的整体响应：8 个域名均展示四条轨道。黄色为 360 官网，灰色为空值，其余颜色为 L0—L5 下载入口；同一横向位置对应同一轮采样，便于比较网络路径、域名条件及多域名之间的变化。

总览最有意思的地方，是几种不同层次的变化同时出现： **原始域名轨道反复穿插黄色，非银狐对照域名同期仍保持其他入口**；同一域名的代理与直连在两侧均有有效返回时保持一致；中段出现跨域名、跨模式的共同灰色空值带；恢复后，下载入口继续成片更新，而末段四条轨道又收敛到新的入口，原始组不再出现黄色。

这幅图说明，实验响应并非一次性的“命中／未命中”：域名条件造成的分流、整个采样链路的缺失，以及共同的入口更新，需要分开解释。客户端地址对照与非银狐域名对照，也因此有了各自清晰的观察位置。下文再用典型日期展开这些整体变化。

## 四、时段发现：夜间差异、跨日缺失与链接更新

### 4.1 典型夜间：原始域名返回 360，破坏域名仍返回下载入口

以 `huawei-download.com.cn` 为例，9 月 22 日 23:30 的四组结果一致，均为 L1。9 月 23 日 00:00 的采样开始出现分裂：原始域名两组变为 360，破坏域名两组保持 L1。到 08:00，差异仍然存在；08:30 的采样中，四组又均为 L1。

| 原始组记录时间 t | 破坏组记录时间 tb | OP  | OD  | BP  | BD  |
| --- | --- | --- | --- | --- | --- |
| 2026-09-22 23:30:06 | 2026-09-22 23:30:13 | L1  | L1  | L1  | L1  |
| 2026-09-23 00:00:05 | 2026-09-23 00:00:09 | 360 | 360 | L1  | L1  |
| 2026-09-23 08:00:04 | 2026-09-23 08:00:06 | 360 | 360 | L1  | L1  |
| 2026-09-23 08:30:04 | 2026-09-23 08:30:06 | L1  | L1  | L1  | L1  |

表中 360 指 `https://www.360.com/` ，L1 指 `https://www.oj44472.com/insdow92` ；完整返回地址见后文。

2026-09-23 四模式返回 URL 对比 夜间分流，08:30 附近重新一致 2026-09-23 / 夜间分流，08:30 附近重新一致 原始 huawei-download.com.cn / 破坏 uawei-download.com.cn · 四轨道各 48 个采样 00:00 04:00 08:30 12:00 16:00 20:00 24:00 Original + Proxy 原始域名 · 代理 | 2026-09-23 00:00:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 00:30:06 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 01:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 01:30:06 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 02:00:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 02:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 03:00:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 03:30:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 04:00:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 04:30:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 05:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 05:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 06:00:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 06:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 07:00:05 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 07:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 08:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-09-23 08:30:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 09:00:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 09:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 10:00:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 10:30:07 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 11:00:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 11:30:07 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 12:00:06 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 12:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 13:00:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 13:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 14:00:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 14:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 15:00:06 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 15:30:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 16:00:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 16:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 17:00:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 17:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 18:00:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 18:30:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 19:00:04 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 19:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 20:00:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 20:30:05 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 21:00:07 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 21:30:06 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 22:00:07 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 22:30:15 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 23:00:08 | https://www.oj44472.com/insdow92 原始域名 · 代理 | 2026-09-23 23:30:06 | https://www.oj44472.com/insdow92 Original + Direct 原始域名 · 直连 | 2026-09-23 00:00:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 00:30:06 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 01:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 01:30:06 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 02:00:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 02:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 03:00:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 03:30:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 04:00:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 04:30:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 05:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 05:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 06:00:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 06:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 07:00:05 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 07:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 08:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-09-23 08:30:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 09:00:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 09:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 10:00:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 10:30:07 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 11:00:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 11:30:07 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 12:00:06 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 12:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 13:00:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 13:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 14:00:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 14:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 15:00:06 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 15:30:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 16:00:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 16:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 17:00:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 17:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 18:00:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 18:30:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 19:00:04 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 19:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 20:00:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 20:30:05 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 21:00:07 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 21:30:06 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 22:00:07 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 22:30:15 | 空值 / 未保留原因 原始域名 · 直连 | 2026-09-23 23:00:08 | https://www.oj44472.com/insdow92 原始域名 · 直连 | 2026-09-23 23:30:06 | https://www.oj44472.com/insdow92 Broken + Proxy 破坏域名 · 代理 | 2026-09-23 00:00:09 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 00:30:09 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 01:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 01:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 02:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 02:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 03:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 03:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 04:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 04:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 05:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 05:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 06:00:09 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 06:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 07:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 07:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 08:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 08:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 09:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 09:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 10:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 10:30:09 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 11:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 11:30:10 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 12:00:09 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 12:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 13:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 13:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 14:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 14:30:09 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 15:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 15:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 16:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 16:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 17:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 17:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 18:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 18:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 19:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 19:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 20:00:10 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 20:30:10 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 21:00:10 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 21:30:10 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 22:00:18 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 22:30:17 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 23:00:12 | https://www.oj44472.com/insdow92 破坏域名 · 代理 | 2026-09-23 23:30:10 | https://www.oj44472.com/insdow92 Broken + Direct 破坏域名 · 直连 | 2026-09-23 00:00:09 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 00:30:09 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 01:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 01:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 02:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 02:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 03:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 03:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 04:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 04:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 05:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 05:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 06:00:09 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 06:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 07:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 07:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 08:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 08:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 09:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 09:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 10:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 10:30:09 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 11:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 11:30:10 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 12:00:09 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 12:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 13:00:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 13:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 14:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 14:30:09 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 15:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 15:30:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 16:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 16:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 17:00:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 17:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 18:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 18:30:08 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 19:00:06 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 19:30:07 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 20:00:10 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 20:30:10 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 21:00:10 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 21:30:10 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 22:00:18 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 22:30:17 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 23:00:12 | https://www.oj44472.com/insdow92 破坏域名 · 直连 | 2026-09-23 23:30:10 | https://www.oj44472.com/insdow92 https://www.360.com/ https://www.oj44472.com/insdow92 空值 / 原因未知 每个色块对应一条采样；悬停查看时间与完整 URL。代理 / 直连检验客户端地址影响；原始 / 破坏域名检验域名条件差异。

图 4｜9 月 23 日的典型对照。原始组在夜间为黄色，破坏组保持 L1 的红色；08:30 附近四组重新一致。灰色块为实际空值，每个色块对应一个采样结果。

本例首次观察到夜间 360 返回为 00:00:05，末次为 08:00:04；前一个采样 9 月 22 日 23:30:06 仍为 L1，后一个采样 9 月 23 日 08:30:04 已恢复 L1。可写成“在午夜附近切换，08:00—08:30 之间恢复”，不能由这些离散样本断言服务端在 00:00:00 或 08:30:00 精确执行任务。

以该域名代理组为例，9 月 23—29 日、10 月 3—10 日的 15 个完整日期，均在 00:00 至 08:00 的 17 个采样点记录了 360 返回。但其他域名存在个别夜间非 360 返回和空值，因此这是一种反复出现的主导模式，并非全域名无例外的固定规则。

### 4.2 跨日空值：持续缺失必须单独处理

9 月 29 日中午，多个模式交替出现空值和 L1，随后进入持续缺失。上述代表域名在 9 月 29 日 16:30:03 的四组结果已经全部为空，到 10 月 2 日 08:30:02 仍全部为空；10 月 2 日 09:00:04 才重新出现 L2。

进一步横向核对，8 个域名在 **9 月 29 日 17:00 至 10 月 2 日 08:30** 的 128 个半小时采样轮次中，四组均为空。这一共同缺失区间包含 1,024 条记录、4,096 个结果槽位。它覆盖了多个完整夜间，因此这期间“没有返回 360”不能解释为夜间策略已经取消。

缺失原因可能来自采样链路、接口可用性或响应处理，HTML 没有保留足够信息作出归因。统计时应保留“空值”这一状态，并在计算非空结果比例时单独处理。

### 4.3 链接更新：特定日期的节点与重复日界分开看

| 日期与原记录时间附近 | 观察到的变化 | 解读  |
| --- | --- | --- |
| 9 月 22 日 23:00 | L0 → L1 | 下载入口更新 |
| 10 月 2 日 09:00 | 空值 → L2 | 缺失区间结束后恢复非空返回 |
| 10 月 6 日 16:30 | L2 → L3 | 多个域名与模式出现共同更新 |
| 10 月 10 日 01:30 | 破坏组 L3 → L4，原始组仍为 360 | 夜间差异仍在，其他入口发生变化 |
| 10 月 10 日 08:30 | 原始组 360 → L4 | 日间四组重新一致 |
| 10 月 10 日 13:00 | 原始组 L4 → L3，破坏组保持 L4 | 日间也出现来源组差异 |
| 10 月 10 日 16:00 | 原始组 L3 → L4 | 四组重新一致 |
| 10 月 10 日 22:30 | 四组 L4 → L5 | 下载入口再次共同更新 |

表中时间以代表域名采样为参照，其他域名可有秒级延迟。00:00／08:30 附近的反复变化支持日内时段相关性；10 月 6 日 16:30 和 10 月 10 日 22:30 是特定日期的更新事件，尚不足以推导每日固定轮换表。

2026-10-10 四模式返回 URL 对比 来源差异与链接更新同时出现 2026-10-10 / 来源差异与链接更新同时出现 原始 huawei-download.com.cn / 破坏 uawei-download.com.cn · 四轨道各 48 个采样 00:00 04:00 08:30 12:00 16:00 20:00 24:00 Original + Proxy 原始域名 · 代理 | 2026-10-10 00:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 00:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 01:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 01:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 02:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 02:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 03:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 03:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 04:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 04:30:03 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 05:00:03 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 05:30:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 06:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 06:30:03 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 07:00:04 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 07:30:03 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 08:00:03 | https://www.360.com/ 原始域名 · 代理 | 2026-10-10 08:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 09:00:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 09:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 10:00:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 10:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 11:00:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 11:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 12:00:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 12:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 13:00:05 | https://www.wenb481.com/down666 原始域名 · 代理 | 2026-10-10 13:30:05 | https://www.wenb481.com/down666 原始域名 · 代理 | 2026-10-10 14:00:03 | https://www.wenb481.com/down666 原始域名 · 代理 | 2026-10-10 14:30:04 | https://www.wenb481.com/down666 原始域名 · 代理 | 2026-10-10 15:00:05 | https://www.wenb481.com/down666 原始域名 · 代理 | 2026-10-10 15:30:05 | https://www.wenb481.com/down666 原始域名 · 代理 | 2026-10-10 16:00:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 16:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 17:00:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 17:30:05 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 18:00:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 18:30:05 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 19:00:05 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 19:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 20:00:05 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 20:30:04 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 21:00:05 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 21:30:05 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 22:00:06 | https://www.wqhu584.com/10load 原始域名 · 代理 | 2026-10-10 22:30:05 | https://www.eyqw474.com/11load 原始域名 · 代理 | 2026-10-10 23:00:04 | https://www.eyqw474.com/11load 原始域名 · 代理 | 2026-10-10 23:30:05 | https://www.eyqw474.com/11load Original + Direct 原始域名 · 直连 | 2026-10-10 00:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 00:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 01:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 01:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 02:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 02:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 03:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 03:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 04:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 04:30:03 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 05:00:03 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 05:30:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 06:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 06:30:03 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 07:00:04 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 07:30:03 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 08:00:03 | https://www.360.com/ 原始域名 · 直连 | 2026-10-10 08:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 09:00:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 09:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 10:00:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 10:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 11:00:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 11:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 12:00:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 12:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 13:00:05 | https://www.wenb481.com/down666 原始域名 · 直连 | 2026-10-10 13:30:05 | https://www.wenb481.com/down666 原始域名 · 直连 | 2026-10-10 14:00:03 | https://www.wenb481.com/down666 原始域名 · 直连 | 2026-10-10 14:30:04 | https://www.wenb481.com/down666 原始域名 · 直连 | 2026-10-10 15:00:05 | https://www.wenb481.com/down666 原始域名 · 直连 | 2026-10-10 15:30:05 | https://www.wenb481.com/down666 原始域名 · 直连 | 2026-10-10 16:00:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 16:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 17:00:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 17:30:05 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 18:00:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 18:30:05 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 19:00:05 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 19:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 20:00:05 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 20:30:04 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 21:00:05 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 21:30:05 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 22:00:06 | https://www.wqhu584.com/10load 原始域名 · 直连 | 2026-10-10 22:30:05 | https://www.eyqw474.com/11load 原始域名 · 直连 | 2026-10-10 23:00:04 | https://www.eyqw474.com/11load 原始域名 · 直连 | 2026-10-10 23:30:05 | https://www.eyqw474.com/11load Broken + Proxy 破坏域名 · 代理 | 2026-10-10 00:00:07 | https://www.wenb481.com/down666 破坏域名 · 代理 | 2026-10-10 00:30:06 | https://www.wenb481.com/down666 破坏域名 · 代理 | 2026-10-10 01:00:06 | https://www.wenb481.com/down666 破坏域名 · 代理 | 2026-10-10 01:30:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 02:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 02:30:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 03:00:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 03:30:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 04:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 04:30:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 05:00:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 05:30:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 06:00:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 06:30:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 07:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 07:30:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 08:00:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 08:30:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 09:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 09:30:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 10:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 10:30:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 11:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 11:30:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 12:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 12:30:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 13:00:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 13:30:08 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 14:00:05 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 14:30:08 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 15:00:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 15:30:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 16:00:06 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 16:30:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 17:00:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 17:30:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 18:00:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 18:30:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 19:00:08 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 19:30:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 20:00:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 20:30:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 21:00:07 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 21:30:08 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 22:00:08 | https://www.wqhu584.com/10load 破坏域名 · 代理 | 2026-10-10 22:30:07 | https://www.eyqw474.com/11load 破坏域名 · 代理 | 2026-10-10 23:00:07 | https://www.eyqw474.com/11load 破坏域名 · 代理 | 2026-10-10 23:30:09 | https://www.eyqw474.com/11load Broken + Direct 破坏域名 · 直连 | 2026-10-10 00:00:07 | https://www.wenb481.com/down666 破坏域名 · 直连 | 2026-10-10 00:30:06 | https://www.wenb481.com/down666 破坏域名 · 直连 | 2026-10-10 01:00:06 | https://www.wenb481.com/down666 破坏域名 · 直连 | 2026-10-10 01:30:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 02:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 02:30:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 03:00:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 03:30:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 04:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 04:30:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 05:00:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 05:30:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 06:00:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 06:30:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 07:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 07:30:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 08:00:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 08:30:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 09:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 09:30:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 10:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 10:30:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 11:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 11:30:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 12:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 12:30:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 13:00:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 13:30:08 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 14:00:05 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 14:30:08 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 15:00:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 15:30:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 16:00:06 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 16:30:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 17:00:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 17:30:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 18:00:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 18:30:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 19:00:08 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 19:30:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 20:00:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 20:30:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 21:00:07 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 21:30:08 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 22:00:08 | https://www.wqhu584.com/10load 破坏域名 · 直连 | 2026-10-10 22:30:07 | https://www.eyqw474.com/11load 破坏域名 · 直连 | 2026-10-10 23:00:07 | https://www.eyqw474.com/11load 破坏域名 · 直连 | 2026-10-10 23:30:09 | https://www.eyqw474.com/11load https://www.360.com/ https://www.wenb481.com/down666 https://www.wqhu584.com/10load https://www.eyqw474.com/11load 每个色块对应一条采样；悬停查看时间与完整 URL。代理 / 直连检验客户端地址影响；原始 / 破坏域名检验域名条件差异。

图 5｜10 月 10 日同时出现夜间差异、13:00 附近的日间来源组差异，以及 22:30 附近的共同入口更新。四组结果并非始终同步。

### 4.4 10 月 11—12 日：夜间 360 返回未再出现

全量数据最后一次记录到 360 返回，是 10 月 10 日 08:00:41 的原始组记录。10 月 11 日完整一天和 10 月 12 日截至本轮结束的记录中，原始组未再返回 360，非空值均为 L5；个别空值仍按缺失保留。

这说明此前夜间模式在观测末段已经变化。它支持“返回规则随日期调整”的判断，但样本只覆盖后续有限时间，不能据此宣布该模式永久终止。

### 4.5 返回地址索引

| 简写  | 完整返回 URL | 文中用途 |
| --- | --- | --- |
| 360 | `https://www.360.com/` | 第五阶段窗口内的域名命中识别信号，不是样本下载地址 |
| L0  | `https://www.vh59l74.com/920down` | 真实样本下载地址 |
| L1  | `https://www.oj44472.com/insdow92` | 真实样本下载地址 |
| L2  | `https://www.xhxjz08.com/30load` | 真实样本下载地址 |
| L3  | `https://www.wenb481.com/down666` | 真实样本下载地址 |
| L4  | `https://www.wqhu584.com/10load` | 真实样本下载地址 |
| L5  | `https://www.eyqw474.com/11load` | 真实样本下载地址 |

在本次第五阶段中，360 官网地址是 **时间窗口内的域名命中识别信号**。它不是样本下载地址，不能据此下载银狐样本；识别的是提交给调度层的候选域名，而不是 360 官网本身。360 官网不是银狐恶意域名，不应被加入恶意域名 IOC。L0—L5 为真实样本下载地址，应与用于域名识别的 360 官网返回分开处理。

## 五、已生产的数据：每日识别数量与异常状态

### 5.1 统计口径与两部分汇总

本节统计的是 **已有生产结果**，不是根据实验提出的未来采样设想。每份日报先核对 HTTP 200 数与响应分组 count 之和，再以返回 `https://www.360.com/` 的 count 统计当日识别域名，并核对其下域名列表。27 份日报的 360 分组计数均与列表长度及当日去重数一致。

| 生产机制 | 日报日期范围 | 日报数 | 逐日检测域名数合计 |
| --- | --- | --- | --- |
| Referer | 2026-09-14 — 2026-09-17 | 4   | 491 个次 |
| h 参数 | 2026-09-18 — 2026-10-13 | 23  | 1,552 个次 |
| 合计  | 2026-09-14 — 2026-10-13 | 27  | 2,043 个次 |

逐日累计 **2,043 个次** 表示一个域名在多天出现会多次计入；将所有日报的 360 分组列表合并后，跨日去重为 **1,930 个域名**。这两种数量分别回答“生产了多少每日识别记录”和“覆盖了多少不同域名”。不把非 360 分组的域名列表计入识别数量，也不把四模式实验的 2,034／2,025 次重复返回计入生产成果。

全体日报的 HTTP 200 响应为 **8,748,258 次**，非 200／失败记录为 **846,905 次**。这些是日报状态统计，不等于跨日唯一候选域名数。状态码 `-1` 作为原始记录中的失败标记保留，不是实际 HTTP 状态码。

银狐每日生产结果：2026年9月14日至10月13日 蓝色为Referer阶段、紫色为h参数阶段，按返回360的count统计每日识别域名。逐日累计2043个次，跨日去重1930个域名。缺日报与全失败分别标记。 每日识别银狐域名 · download_link = 360.com 00:00—08:00 生产窗口 · 27 份日报 · 合计 2,043 个次 / 跨日去重 1,930 个域名 0 100 200 300 400 09/18 · h 参数 2026-09-14 | Referer | noah-ssh.com.cn | 银狐域名 0 | HTTP 200 258733 | 非200/失败 1402 | 未命中 0 09/14 2026-09-15 | Referer | noah-ssh.com.cn | 银狐域名 109 | HTTP 200 346344 | 非200/失败 1307 | 有产出 109 09/15 2026-09-16 | Referer | noah-ssh.com.cn | 银狐域名 219 | HTTP 200 375715 | 非200/失败 1929 | 有产出 219 09/16 2026-09-17 | Referer | noah-ssh.com.cn | 银狐域名 163 | HTTP 200 658293 | 非200/失败 8533 | 有产出 163 09/17 2026-09-18 | h 参数 | game-houtai2.com.cn | 银狐域名 7 | HTTP 200 768012 | 非200/失败 13142 | 有产出 7 09/18 2026-09-19 | h 参数 | game-houtai2.com.cn | 银狐域名 1 | HTTP 200 326699 | 非200/失败 1540 | 有产出 1 09/19 2026-09-20 | 缺少日报，数量未知 — 09/20 2026-09-21 | h 参数 | game-houtai2.com.cn | 银狐域名 10 | HTTP 200 284910 | 非200/失败 1653 | 有产出 10 09/21 2026-09-22 | 缺少日报，数量未知 — 09/22 2026-09-23 | h 参数 | game-houtai2.com.cn | 银狐域名 252 | HTTP 200 335722 | 非200/失败 2257 | 有产出 252 09/23 2026-09-24 | h 参数 | game-houtai2.com.cn | 银狐域名 84 | HTTP 200 403991 | 非200/失败 1333 | 有产出 84 09/24 2026-09-25 | h 参数 | game-houtai2.com.cn | 银狐域名 101 | HTTP 200 346033 | 非200/失败 1460 | 有产出 101 09/25 2026-09-26 | h 参数 | game-houtai2.com.cn | 银狐域名 0 | HTTP 200 341198 | 非200/失败 1108 | 未命中 0 09/26 2026-09-27 | h 参数 | game-houtai2.com.cn | 银狐域名 0 | HTTP 200 312681 | 非200/失败 1184 | 未命中 0 09/27 2026-09-28 | h 参数 | game-houtai2.com.cn | 银狐域名 355 | HTTP 200 281786 | 非200/失败 893 | 有产出 355 09/28 2026-09-29 | h 参数 | game-houtai2.com.cn | 银狐域名 16 | HTTP 200 205739 | 非200/失败 6482 | 有产出 16 09/29 2026-09-30 | 缺少日报，数量未知 — 09/30 2026-10-01 | h 参数 | game-houtai2.com.cn | 银狐域名 0 | HTTP 200 0 | 非200/失败 422032 | 全失败 · 无法有效评估 失败 10/01 2026-10-02 | h 参数 | game-houtai2.com.cn | 银狐域名 0 | HTTP 200 0 | 非200/失败 350117 | 全失败 · 无法有效评估 失败 10/02 2026-10-03 | h 参数 | game-houtai9.com.cn | 银狐域名 95 | HTTP 200 329327 | 非200/失败 3009 | 有产出 95 10/03 2026-10-04 | h 参数 | game-houtai9.com.cn | 银狐域名 32 | HTTP 200 140097 | 非200/失败 2144 | 有产出 32 10/04 2026-10-05 | h 参数 | game-houtai9.com.cn | 银狐域名 97 | HTTP 200 329762 | 非200/失败 1954 | 有产出 97 10/05 2026-10-06 | h 参数 | game-houtai9.com.cn | 银狐域名 49 | HTTP 200 268515 | 非200/失败 2501 | 有产出 49 10/06 2026-10-07 | h 参数 | game-houtai9.com.cn | 银狐域名 54 | HTTP 200 349260 | 非200/失败 2385 | 有产出 54 10/07 2026-10-08 | h 参数 | game-houtai9.com.cn | 银狐域名 26 | HTTP 200 191365 | 非200/失败 1253 | 有产出 26 10/08 2026-10-09 | h 参数 | game-houtai9.com.cn | 银狐域名 178 | HTTP 200 213891 | 非200/失败 6955 | 有产出 178 10/09 2026-10-10 | h 参数 | game-houtai9.com.cn | 银狐域名 195 | HTTP 200 590656 | 非200/失败 2038 | 有产出 195 10/10 2026-10-11 | h 参数 | game-houtai9.com.cn | 银狐域名 0 | HTTP 200 307919 | 非200/失败 1727 | 未命中 0 10/11 2026-10-12 | h 参数 | game-houtai9.com.cn | 银狐域名 0 | HTTP 200 208780 | 非200/失败 1377 | 未命中 0 10/12 2026-10-13 | h 参数 | game-houtai9.com.cn | 银狐域名 0 | HTTP 200 572830 | 非200/失败 5190 | 未命中 0 10/13 Referer 阶段 h 参数阶段 缺少日报 全失败 / 无法评估 有成功响应，但未命中 悬停查看日期、节点和状态统计。柱高为当日域名数；不能与四模式实验中的重复返回次数相加。

图 6｜蓝色为 Referer 部分，紫色为 h 参数部分。缺日报为斜线标记，全失败为叉号，有成功响应但未命中为零值圆点。柱高是每日识别数量，不是实验响应次数。

### 5.2 日期级生产表

生产日期取自日报文件名。下表包含 9 月 14 日至 10 月 13 日全部日历日期。原始日报按 refer-生产数据/status_YYYYMMDD.md 命名，日期与文件名一一对应。

| 日期 / 日报 | 机制  | 目标节点 | HTTP 200 数 | 非200 / 失败数 | 当日银狐域名数 | 备注  |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-14 | Referer | `noah-ssh.com.cn` | 258,733 | 1,402 | 0   | 未命中 |
| 2026-09-15 | Referer | `noah-ssh.com.cn` | 346,344 | 1,307 | 109 | 有产出 |
| 2026-09-16 | Referer | `noah-ssh.com.cn` | 375,715 | 1,929 | 219 | 有产出 |
| 2026-09-17 | Referer | `noah-ssh.com.cn` | 658,293 | 8,533 | 163 | 有产出 |
| 2026-09-18 | h 参数 | `game-houtai2.com.cn` | 768,012 | 13,142 | 7   | 有产出 |
| 2026-09-19 | h 参数 | `game-houtai2.com.cn` | 326,699 | 1,540 | 1   | 有产出 |
| 2026-09-20 | —   | —   | —   | —   | —   | 缺少日报 |
| 2026-09-21 | h 参数 | `game-houtai2.com.cn` | 284,910 | 1,653 | 10  | 有产出 |
| 2026-09-22 | —   | —   | —   | —   | —   | 缺少日报 |
| 2026-09-23 | h 参数 | `game-houtai2.com.cn` | 335,722 | 2,257 | 252 | 有产出 |
| 2026-09-24 | h 参数 | `game-houtai2.com.cn` | 403,991 | 1,333 | 84  | 有产出；429：25 / 521：5 |
| 2026-09-25 | h 参数 | `game-houtai2.com.cn` | 346,033 | 1,460 | 101 | 有产出 |
| 2026-09-26 | h 参数 | `game-houtai2.com.cn` | 341,198 | 1,108 | 0   | 未命中 |
| 2026-09-27 | h 参数 | `game-houtai2.com.cn` | 312,681 | 1,184 | 0   | 未命中 |
| 2026-09-28 | h 参数 | `game-houtai2.com.cn` | 281,786 | 893 | 355 | 有产出 |
| 2026-09-29 | h 参数 | `game-houtai2.com.cn` | 205,739 | 6,482 | 16  | 有产出 |
| 2026-09-30 | —   | —   | —   | —   | —   | 缺少日报 |
| 2026-10-01 | h 参数 | `game-houtai2.com.cn` | 0   | 422,032 | 0   | 全失败 · 无法有效评估 |
| 2026-10-02 | h 参数 | `game-houtai2.com.cn` | 0   | 350,117 | 0   | 全失败 · 无法有效评估 |
| 2026-10-03 | h 参数 | `game-houtai9.com.cn` | 329,327 | 3,009 | 95  | 有产出 |
| 2026-10-04 | h 参数 | `game-houtai9.com.cn` | 140,097 | 2,144 | 32  | 有产出 |
| 2026-10-05 | h 参数 | `game-houtai9.com.cn` | 329,762 | 1,954 | 97  | 有产出 |
| 2026-10-06 | h 参数 | `game-houtai9.com.cn` | 268,515 | 2,501 | 49  | 有产出 |
| 2026-10-07 | h 参数 | `game-houtai9.com.cn` | 349,260 | 2,385 | 54  | 有产出 |
| 2026-10-08 | h 参数 | `game-houtai9.com.cn` | 191,365 | 1,253 | 26  | 有产出 |
| 2026-10-09 | h 参数 | `game-houtai9.com.cn` | 213,891 | 6,955 | 178 | 有产出 |
| 2026-10-10 | h 参数 | `game-houtai9.com.cn` | 590,656 | 2,038 | 195 | 有产出 |
| 2026-10-11 | h 参数 | `game-houtai9.com.cn` | 307,919 | 1,727 | 0   | 未命中 |
| 2026-10-12 | h 参数 | `game-houtai9.com.cn` | 208,780 | 1,377 | 0   | 未命中 |
| 2026-10-13 | h 参数 | `game-houtai9.com.cn` | 572,830 | 5,190 | 0   | 未命中 |

### 5.3 缺报、失败和未命中不能合并

9 月 20、22、30 日缺少日报，数量留空，不按零处理，也不推断当天使用的目标节点。10 月 1—2 日只有失败记录、没有 HTTP 200，标记为 **全失败／无法有效评估**。9 月 14、26—27 日及 10 月 11—13 日有成功响应但没有 360 返回，才标记为 **未命中**。

9 月 24 日除 `-1` 外，还记录了 25 次 HTTP 429 和 5 次 HTTP 521，这些均进入非 200／失败合计。没有错误上下文，不把异常码或零命中直接解释为服务端封禁。

由此可见，持续生产既有数量较高的日期，也有零命中、失败与缺报。本文保留这种真实波动，不把“天天开展生产”改写成“所有日期均有非零检测结果”。

## 六、机制分析：生产成果怎样推动时序解释

### 6.1 两类数据互补，但不是同一配置的重复实验

日报记录了输入机制、目标节点、响应分组和域名列表，说明返回 360 的识别信号已经用于生产。四模式 HTML 则记录固定域名集合的时序差异，解释为什么单次复测可能与日常生产表现不同。 **先有生产实践，再有解释它的连续实验**，是本篇的发现主线。

两类材料来自不同节点／输入条件与域名集合，原 HTML 又没有完整请求上下文，因此不要求逐日结果完全一致。例如，9 月 26—27 日生产有成功响应却没有 360 命中，但四模式原始组仍有 360 返回；不能用后一种结果补造前一种产出，或据此否定日报。10 月 1—2 日生产全失败与实验跨日空值在日期上重叠，也仅是共现，尚不能证明共同故障原因。

### 6.2 新阶段的判定关系与未知的转变时间

实验确认的核心关系是： **第二阶段白名单命中后返回样本下载地址；第五阶段则在白名单命中且处于 00:00—08:00 时返回 360 官网。** 因此，新阶段不是白名单识别能力消失，而是命中判定增加了时间窗口，命中响应的含义也从“提供样本入口”变为“暴露域名识别特征”。

原始两组反复出现窗口内的 360 返回，非银狐对照两组全周期未出现；同一域名在窗口之外又恢复为相同入口。这些结果共同解释了为什么白天复测可能看不到差异，而日常生产仍可取得银狐域名数据。生产阶段正是利用这个特征开展识别，不需要先下载到样本才能获得域名命中结果。

目前仍不知道这一规则从何时开始生效。日报起点、正式实验起点和首次记录到的响应，只能说明我们何时已有证据，不能替代服务端实际切换时间。10 月 10 日的日间差异及 10 月 11—12 日的末段变化也继续保留为实测事实，需要跟踪后续调整，不能把已经观察到的规律写成永久不变的时刻表。

这里确认的是新阶段的外部响应机制，并未还原服务端代码；名单查询、定时任务、缓存或入口配置的具体实现仍未知。生产的 h 参数也不能自动推定为四模式采样脚本的参数。

## 七、结语：这个“蹩脚”的机制，究竟为了什么？

这次发现不是从一次精心选定的实验开始，而是从持续生产中冒出的疑问开始：为什么白天偶尔失去区分能力，日常又还能获得域名数据？随后开展的半小时四模式实验，把这个反差转成了可复核的时序证据。

本轮实验确认了一个新的阶段： **白名单不是简单失效，而是叠加了时间窗口；命中响应由样本下载地址变为 360 官网。** 我们尚不知道这种转变发生在什么时候，但已经能够利用“命中且处于 00:00—08:00 时返回 360 官网”这一特征识别银狐域名。虽然不能据此下载样本，域名识别能力仍然可用，并已形成逐日累计 2,043 个次、跨日去重 1,930 个域名的生产成果。

但机制的行为可以验证，设计它的目的却还没有答案： **为什么偏偏在 00:00—08:00，不向命中银狐域名的请求返回真实样本下载地址？** 是不是考虑到这个时段大多数人都在休息，真实下载需求较少，而样本分发可能产生较大的流量与带宽开销，因此想通过时间窗口控制成本？这只是一个猜测，目前没有足够证据确认其运营动机。

更奇怪的是， **直接访问中转节点，或将域名参数设为非银狐网站，反而仍会返回真实样本下载地址。** 也就是说，指向银狐网站的请求拿到的是 360 官网，不指向银狐网站的请求却可能拿到样本。如果只是为了减少夜间样本分发、节省流量成本，为什么这些请求没有一起受到限制？

这种反差让“控制成本”的解释显得并不充分。它究竟是在刻意区分不同来路，还是不同策略叠加后留下了一个逻辑缺口？至少从研究结果看，这套机制没有消除识别线索，反而留下了一个可以持续生产银狐域名数据的特征。

**这个看起来“蹩脚”的时间窗机制，到底想达到什么目的？** 这仍是后续追踪中值得继续寻找答案的问题。
