---
title: 【微信】银狐木马藏进ISO镜像：双语言剧本共用一个载荷，新C2与官方预警IP同属CTG机房
source: https://mp.weixin.qq.com/s/PlX-pFHNhde4706NsoLQfA
source_host: mp.weixin.qq.com
clip_date: 2026-10-14T09:43:16+08:00
trace_id: b3015e48-d567-43c9-937f-3a183f557168
content_hash: 6431c7ce67813848871242e48d5b9ef23bc255b8cd950e0e4f613bf498ea034b
status: synced
tags:
  - 微信
  - 恶意样本
  - 威胁情报
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 银狐 ValleyRAT 首次确认以 .img.zip（ISO 镜像）双层容器投递，双语言诱饵共用同一 stager，新 C2 与官方预警 IP 同属 CTG Server 机房，形成"三日五样本"实锤。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f975244-d011-8104-b2e8-f3abf81908ce
ioc:
  cves:
    - CVE-2026-36425
  cwes: []
  hashes:
    - b5ae5e8325ab0d35efa8f0c6b9b50702eede7f32edede7516cdfdfe3d42951c6
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 银狐 ValleyRAT 首次确认以 .img.zip（ISO 镜像）双层容器投递，双语言诱饵共用同一 stager，新 C2 与官方预警 IP 同属 CTG Server 机房，形成"三日五样本"实锤。
> 
> - **投递形态升级：** 10/11 双样本外层为 `.img.zip`（zip→ISO 9660），挂载后执行包内诱饵，天然绕过 MOTW；文件名内嵌打包时间与 `DX03` 批次号，打包到投递约 3 天。
> - **通用 stager 复用：** 繁体「人事變動與薪資調整.exe」与英文「Notice from Tax Departmen.exe」（少一个 t 为指纹）SHA256 相同（7eca6ff7…，106KB），同一载荷仅切换语言剧本；繁体诱饵为本报首见。
> - **新 C2 与段级结论：** 新增 14.128.53.155:21131/21132（连号双端口）、27.124.12.236:449/443；202.61.157.33:21357 累计 3 样本。14.128.53.155 与官方预警 14.128.47.87 同在 CTG Server 香港段 14.128.40.0/21，CTG 成为量产期首选 C2 供应商。
> - **Backdoor/Lotok 排查：** 47MB 素材包安装器 + 白加黑 aWNCH.exe 侧载 DLL，双伪装服务（显示 Stopped 但进程存活）+ Winlogon Userinit 追加 + 隐藏计划任务，首次在银狐命名样本中出现 ardrv.sys（CVE-2026-36425）BYOVD；C2 222.167.35.123:443 待核实。
> - **防护要点：** 邮件网关阻断 .img/.iso 附件；对 CTG 双段启动段级告警并封禁新 C2；检测同宿主 60 秒内对同一 IP 连号端口顺序连接；对 Userinit 任何追加写入高保真告警。

**AI和提效工具实验记** *2026年10月14日 09:17*

## 银狐木马藏进ISO镜像：双语言剧本共用一个载荷，新C2与官方预警IP同属CTG机房

SILVER FOX THREAT INTELLIGENCE DAILY

## 一、今日概览

1.**头号增量：昨日待办兑现——Triage 沙箱结束连续多日 502 宕机恢复访问，10/11–10/12 共 8 个 ValleyRAT 样本的 C2 配置补验全部完成**。结果将昨日 CTG Server 供应商定性从「双 IP 互证」升级为「三日五样本实锤」：10/12 六样本中三枚共享全新 C2 **14.128.53.155:21131/21132** （CTG 香港段第 4 个出现 IP，双端口连号冗余），另两枚确认 **202.61.157.33:21357** （CTG 新加坡段，累计 3 样本）；10/11 双样本中一枚再回连 202.61.157.33、一枚使用新 C2 **27.124.12.236:449/443**。

2.**投递形态结构性更新：银狐 ValleyRAT 链首次确认.img（ISO 镜像）容器投递**——10/11 双样本均为 `.img.zip` 双层打包，文件名内嵌提交时间戳与批次编号（ `DX03` 系列），且包内出现 **繁体中文诱饵「人事變動與薪資調整.exe」** （本报历史首见繁体诱饵，此前语料圈为简体/英文印度税务/柬埔寨语）。

3.**次增量：博客园 10-13 发布 Backdoor/Lotok（Defender 银狐命名）企业排查实录**，披露本报历史无记录的 C2 **222.167.35.123:443**，且 **OPSWAT AppRemover 漏洞驱动 ardrv.sys（CVE-2026-36425）首次出现在 Defender 银狐命名样本中** （8-28 时该驱动仅见于柬埔寨 SparkRAT 谱系外活动），BYOVD 驱动池扩散信号明确。

4\. 监测面：Derp 样本库 71 持平（10/13–10/14 暂无新样本入库）；微步热点 IoC 仍为「12日更新」批次（连续第 2 日静止，处于历史 2–3 天刷新规律上限内）；CCTGA 第六批通报 23 天未发；厂商披露面过去 24h 零增量（甄别见脚注）。

5\. 微信公众号渠道说明：本期通过草稿箱发布流程正常执行（详见文末状态标注）。

## 二、重点事件

### 事件 1（★头号）：CTG Server 双段 C2 三日五样本实锤，10/12 批次 C2 补验结案

• **时间**：样本分析于 10/11–10/12（UTC），补验完成 2026-10-14

• **来源**：Triage 公开沙箱报告（261011-b7wp8ady3t / 261011-cpymjacy7l / 261012-dsejhavv9p / 261012-c4c95svs5n / 261012-b75ywsea92）、Derp ValleyRAT 样本库

• **要点**：

• **10/12 六样本分两组**：

**RF01_0196.zip 组** （06af7db1… / 20eb85e5… / b952ed6c…）：诱饵 `Notice from Tax Departmen.exe` （印度税务剧本，拼写少一个 t 为指纹），载荷 `desk_compositor_x64.dll` （1.5MB，valleyrat_s2）+ `msvcp120.dll` ，C2 = **202.61.157.33:21357**；

• **DX03_702A.img 组** （2c77d954… / 7aad0628… / c7ca7733…）：C2 = **14.128.53.155:21131/21132** （双端口连号）。

-   **10/11 双样本**
    
    ： `11102026_0147_08102026_DX03_817.img.zip` （b502a8d4…）C2 = **202.61.157.33:21357**； `11102026_0215_08102026_202610.08.img.zip` （0c0c27e5…）C2 = **27.124.12.236:449/443** （双端口，449 为本报首见端口）。
    
-   **关键证据链**
    
    ：14.128.53.155 与 10-12 日报确认的官方预警 C2 14.128.47.87（南京农业大学 10-08 预警披露） **同属 CTG Server Ltd. 香港段 14.128.40.0/21**；202.61.157.33 属 CTG 新加坡段（abuse@ctgserver.net 同一注册主体）；14.128.53.x 段内.229/.194 在 9 月微步热点与银狐链中已有出现史—— **段级结论：CTG Server 是当前 ValleyRAT 投放量产期首选 C2 供应商**。
    
-   **通用 stager 复用证据**
    
    ：诱饵 人事變動與薪資調整.exe（SHA256 7eca6ff7…）与 `Notice from Tax Departmen.exe` **为同一文件**——同一 stager 载荷在打包层切换语言剧本，分别装入繁体人事 ISO 包与英文税务 zip 包。
    
-   **影响面**
    
    ：10 月 campaign 10.8 新线（构建/打包标记 202610.08、DX03 系列）至少 3 个 C2、8+ 样本在 4 天内投放；CTG 双段（14.128.40.0/21、202.61.157.0/24）+ 27.124.12.0/24 段级封禁的证据基础从昨日「whois 定性」升级为「多样本行为互证」。
    

### 事件 2：ISO 镜像容器投递 + 繁体中文诱饵首现（DX03 系列）

• **时间**：样本提交 10/11 01:47–02:15 UTC

• **来源**：Triage 报告（261011-b7wp8ady3t / 261011-cpymjacy7l）

• **要点**：

• 10/11 双样本外层均为 **`.img.zip` 双层容器**：zip 解压出 ISO 9660 镜像（.img），挂载后执行包内诱饵 exe—— **银狐 ValleyRAT 本体链本报首次确认 ISO 容器投递** （此前银狐链以 zip/exe 直投为主；9-17 JUMPSEC PAPERMILL 的 ISO 投递为「谱系相邻」非本体）。ISO 容器天然绕过 Mark-of-the-Web（MOTW）Alternate Data Stream 传播。

• 文件名自带运营元数据： `11102026_0147_08102026_DX03_817.img.zip` = {YYMMDD} *{HHMM}* {打包日期 YYMMDD}\_{系列\_编号}，显示 10-08 打包、10-11 提交沙箱， **打包到投递间隔约 3 天**；DX03_817 与 10/12 的 DX03_702A 为同系列不同批次。

• **繁体诱饵「人事變動與薪資調整.exe」** 为本报历史首见繁体中文语料——此前 Q3 社工热词（人员名单/裁员/补偿）均为简体， **猎物圈或已扩展至港台/繁体环境用户** （待后续样本佐证）。

• **影响面**：邮件网关与终端策略需覆盖.img/.iso 附件阻断（多数企业现网仅拦 exe/scr）；人事调薪主题在 Q4 考核季的社工命中率预计上升。

### 事件 3：Backdoor/Lotok 排查实录披露新 C2 与银狐命名样本中的 ardrv.sys BYOVD

• **时间**：2026-10-13 14:45 发布（感染发生于 7 月中旬，属回顾性复盘）

• **来源**：博客园（cnblogs.com/azure011328/p/23286092，作者 淮竹i，AIGC 辅助标注，阅读量低位；交叉引用 52pojie thread-2117771 同期感染案例）

• **要点**：

• Defender 检出名 **Backdoor/Lotok.kw** （国内厂商通称银狐）的企业端排查实录：47MB「素材包」安装器（内含演示视频/图片做掩护）→ `C:\Drivers\MdudrUu\` 隐藏目录落盘。

• **白加黑结构**：签名白文件 `aWNCH.exe` （有效签名、版本信息全空，签名主体为某办公软件厂商）+ 侧载 DLL `dtfbase.dll` / `ipc_core.dll` / `filter_installer_biz.dll` ；主样本 SHA256 `B5AE5E8325AB0D35EFA8F0C6B9B50702EEDE7F32EDEDE7516CDFDFE3D42951C6` 。

• **四重复活点**：双伪装服务（LogHelper→aWNCH.exe、RemoteHandler→XUo.exe，cmd start 拉起后服务显示 Stopped 但进程存活）+ Winlogon Userinit 追加劫持（`,C:\Drivers\MdudrUu\aWNCH.exe.,` 带障眼法尾巴）+ 同名隐藏计划任务 + **ardrv.sys 内核驱动（OPSWAT AppRemover，CVE-2026-36425）BYOVD**。

• **C2：222.167.35.123:443** （长连接 + 反复回连；本报历史无记录， **待核实**——单源 AIGC 辅助文章，建议 PassiveDNS 复核后入库）。

• **ardrv.sys 动态信号**：该驱动 8-28 日报中仅见于柬埔寨 SparkRAT 活动（谱系外），本次为 **Defender 银狐命名样本首次实证**——银狐 BYOVD 驱动池继续扩散，与 10-07 Alpha Cyber「13+ 签名漏洞驱动清点」的兵工厂画像一致。

• **影响面**：回顾性案例（7 月感染、10 月成文），无在野爆发证据；价值在 IOC 补全与驱动池画像更新。

### 事件 4（监测面）：三监测源同步低频 + 二次传播甄别

• **时间**：2026-10-13 — 10-14

• **要点**：

• **Derp**：样本库 71 持平，10/13–10/14 无新样本入库（10 月累计 57 个占 80% 格局不变）；按 T+3 回填纪律，10/13 计数今日仍不引用。

• **微步共享站**：热点 IoC 连续第 2 日静止（仍「12日更新」，三榜与昨日零变化：OSS 桶 6/15、156.251.x 双 IP 等）；IoC 总量连续第 4 日不可读（页面 JS 动态渲染）； **明日若仍静止则达历史 2–3 天刷新规律上限，需按平台管线异常升级处置**。

• **CCTGA**：第六批通报 23 天未发（历史最大间隔 10 天的两倍以上），专项转入常态化后的节奏断档持续。

• **Triage**：从连续 502 宕机中恢复，本次补验全程可用。

• **甄别（不计增量）**：cn-sec 10-12 转载《银狐ValleyRAT十月新投放活动曝光》= 本报公众号 10-10 日报二次传播；mwwr.cn「伪装 AnyDesk 攻击链剖析」= 内容农场科普（无新 IOC 无日期）；CVERC《网络空间安全态势分析报告(2026)》= 9-02 天津大会旧发布（银狐章节为 5-21 预警 + 6-16 公安部 5 案已知内容）；XWorm C2 面板 RCE PoC = 黑产工具链事件，与银狐谱系无关。

## 三、技术分析

### 3.1 10.8 活动（campaign 202610.08 / DX03 系列）加载链还原

```css
邮件/IM 投递   └─ xxx.img.zip（双层容器：zip → ISO 9660 镜像）        [T1566.001/1566.002 投递]        └─ 用户挂载 ISO 后执行诱饵 exe                      [T1204.002 用户执行]             ├─ 剧本 A（繁体）：人事變動與薪資調整.exe（7eca6ff7…，106KB stager）             ├─ 剧本 B（英文/印度）：Notice from Tax Departmen.exe（同 SHA256，拼写指纹）             └─ 释放 desk_compositor_x64.dll（1.5MB，valleyrat_s2 后门本体）                  ├─ msvcp120.dll 等运行库伪装组件                  ├─ Run Key 自启                                          [T1547.001]                  ├─ UAC bypass                                            [T1548.002]                  ├─ 枚举已安装软件（Uninstall 注册表键）                    [T1012/T1082]                  ├─ 枚举非 C: 盘根路径                                    [T1120]                  └─ C2 回连：                       ├─ 14.128.53.155:21131/21132（CTG HK，双端口连号）                       ├─ 202.61.157.33:21357（CTG SG，单高位端口）                       └─ 27.124.12.236:449/443（亚太托管，449 非标端口） 
```

**10 月 C2 配置模板全景** （campaign 归组）：

| 活动线 | 构建标记 | C2  | 端口形态 | 确认样本数 |
| --- | --- | --- | --- | --- |
| 9.3 线 | 2026.9.3 | 161.248.14.38（.15.160 同段） | 443/80 + 127.0.0.1 兜底 | 多样本（10-13 日报） |
| 10.4 线 | 2026.10.4 | 156.247.40.74 | 9295/9296 双端口 | ≥4（10-10 日报） |
| **10.8 新线** | 202610.08 / DX03 | **202.61.157.33** | 21357 单端口 | **3**<br><br>（b502a8d4/b952ed6c/06af7db1 组） |
| **10.8 新线** | 202610.08 / DX03 | **14.128.53.155** | 21131/21132 连号双端口 | **3**<br><br>（2c77d954/7aad0628/c7ca7733 组） |
| **10.8 新线** | 202610.08 | **27.124.12.236** | 449/443 双端口 | 1（0c0c27e5） |

**行为要点** （自 Triage 行为报告）：同批样本在 Win10 2004 与 Win11 LTSC 2024 双环境均触发 16 条签名；0c0c27e5 配置提取中可见 base64 编码注册表路径（ `\Shell\Manage\command` 、 `Software\Classes\CLSID` ）与 `Wlhod2JHOXlaWEl1WlhobElITm9aV3hzT2pvNg==` （解码含 VHDL/Shell 语义字符串），提示 **注册表嵌入式配置/持久化新形态** （待样本层面深挖，标注待核实）。

### 3.2 Backdoor/Lotok 样本 ATT&CK 映射（事件 3）

| 战术  | 技术  | 实现细节 |
| --- | --- | --- |
| 初始访问 | T1566.001 | 47MB「素材包」伪装安装器（installer.exe） |
| 执行  | T1036.005 / T1574.001 | 白加黑：签名 aWNCH.exe（版本信息全空）+ dtfbase/ipc_core/filter_installer_biz.dll 侧载 |
| 持久化 | T1543.003 | 双伪装服务 LogHelper / RemoteHandler（cmd start 拉起，服务态显示 Stopped） |
| 持久化 | T1547.001 变体 | Winlogon Userinit 追加 `,C:\Drivers\MdudrUu\aWNCH.exe.,`（登录复活） |
| 持久化 | T1053.005 | 隐藏计划任务 LogHelper |
| 防御规避 | T1553.003 / BYOVD | ardrv.sys（OPSWAT AppRemover，CVE-2026-36425）内核态杀防护 |
| 指挥控制 | T1071.001 / T1571 | 222.167.35.123:443（HTTPS 端口非标路径，长连接 + 反复回连）【待核实】 |

### 3.3 与 8-28 柬埔寨 SparkRAT 案的驱动池交叉

ardrv.sys（CVE-2026-36425）两次出现的活动背景对比：

| 维度  | 8-28 柬埔寨 SparkRAT | 本次 Backdoor/Lotok |
| --- | --- | --- |
| 家族归属 | SparkRAT（谱系外） | Defender 银狐命名（Lotok） |
| 目标  | 柬埔寨定向 | 国内企业端 |
| 杀软目标 | 火绒 HipsTray.exe | 未明示（内核关防护 + 杀回调） |
| 投递  | Inno Setup + 签名腾讯 EXE | 素材包安装器 |

→ **OPSWAT ARD 驱动已从东南亚定向活动扩散至国内银狐主力样本池**，建议未将该驱动加入黑名单的企业立即补入（与既有 IQMW64E.sys、HCamDrv.sys 等统一管理）。

## 四、IOC 清单

### 4.1 C2（10.8 活动，Triage 配置提取，置信度高）

| 类型  | 值   | 关联样本 | 状态  |
| --- | --- | --- | --- |
| IP:端口 | **14.128.53.155:21131** | 2c77d954 / 7aad0628 / c7ca7733（10/12） | 🆕 新披露 |
| IP:端口 | **14.128.53.155:21132** | 同上（连号冗余） | 🆕 新披露 |
| IP:端口 | **27.124.12.236:449** | 0c0c27e5（10/11） | 🆕 新披露 |
| IP:端口 | **27.124.12.236:443** | 同上  | 🆕 新披露 |
| IP:端口 | 202.61.157.33:21357 | b502a8d4 / b952ed6c 组（10/11–10/12） | 10-13 已披露，样本数 +1 |
| IP:端口 | 222.167.35.123:443 | aWNCH.exe（Backdoor/Lotok） | 🆕 **待核实** （单源 AIGC 辅助文章） |

### 4.2 样本哈希（10/11–10/12 批次，valleyrat_s2）

| SHA256（前 16） | 容器/诱饵 | C2 组 |
| --- | --- | --- |
| 0c0c27e53ab7e73e | 11102026_0215\_…202610.08.img.zip | 27.124.12.236 |
| b502a8d46136ad83 | 11102026_0147\_…DX03_817.img.zip | 202.61.157.33 |
| 06af7db1507c6851 | RF01_0196.zip（Notice from Tax Departmen.exe） | 202.61.157.33 |
| 20eb85e5a8ff1bc2 | RF01_0196.zip 同批 | 202.61.157.33 |
| b952ed6cbad32801 | RF01_0196.zip（desk_compositor_x64.dll） | 202.61.157.33 |
| 2c77d954eb79cc5b | DX03_702A.img（裸 exe 提交） | 14.128.53.155 |
| 7aad062881f577d7 | DX03_702A.img.zip（desk_compositor_x64.dll） | 14.128.53.155 |
| c7ca77338b2d2c51 | DX03_702A.img 同批 | 14.128.53.155 |
| 7eca6ff78c9a0672 | **人事變動與薪資調整.exe**<br><br>（通用 stager，与 Notice from Tax Departmen.exe 同哈希） | —   |
| B5AE5E8325AB0D35 | aWNCH.exe（Backdoor/Lotok 白文件） | 222.167.35.123【待核实】 |

### 4.3 文件路径与组件（Backdoor/Lotok，待核实标注）

| 类型  | 值   |
| --- | --- |
| 落盘目录 | `C:\Drivers\MdudrUu\`<br><br>（Hidden+System）、 `C:\Drivers\93Yb3h\` （安装器）、 `C:\Drivers\oY8Uz\` （\*.cnt） |
| 内核驱动 | `ardrv.sys`<br><br>（服务名 ardrv，CVE-2026-36425） |
| 侧载 DLL | dtfbase.dll / ipc_core.dll / filter_installer_biz.dll |
| 伪装服务 | LogHelper / RemoteHandler |
| 注册表 | Winlogon Userinit 追加 `C:\Drivers\MdudrUu\aWNCH.exe` |
| 运行日志 | `C:\Drivers\drivers.dat*` |

### 4.4 段级封禁参考（累计证据）

| 网段  | 归属  | 出现 IP | 建议  |
| --- | --- | --- | --- |
| 14.128.40.0/21（含 14.128.47.x / 14.128.53.x） | CTG Server HK | .47.87（官方预警）、.53.155（新）、.53.229/.53.194（9 月历史） | 段级评分告警 |
| 202.61.157.0/24 | CTG Server SG | .157.33（3 样本） | 段级封禁评估 |
| 27.124.12.0/24 | 亚太托管 | .236（新）、.24/.4（历史） | 观察段 |

## 五、检测与防护建议

1.**邮件网关 / 附件策略**：将 `.img` / `.iso` / `.img.zip` / `.iso.zip` 纳入附件阻断或沙箱 detonation 强制类型（本次 DX03 系列全部走 ISO 容器，绕 MOTW；多数现网策略仅覆盖 exe/scr/zip 内 exe）。同时警惕双语言剧本： **英文「税务通知」与繁体「人事變動與薪資調整」共用同一 stager**，内容过滤规则不应只盯简体关键词。

2.**网络层（NDR/防火墙）**：

3\. 立即封禁 4.1 表新 C2；对 **14.128.40.0/21 与 202.61.157.0/24（CTG Server）** 启动段级评分告警（非标高位端口 21131/21132/21357 + 449 为本活动指纹端口）；

4\. 检测规则增加「同宿主 60 秒内对同一 IP 双连号端口（n / n+1）顺序连接」模式——10.4 线 9295/9296 与 10.8 线 21131/21132 均为该形态。

5.**端点（EDR）狩猎**：

6\. YARA/文件名规则： `desk_compositor_x64.dll` （不在系统目录）、 `Notice from Tax Departmen*.exe` （拼写缺 t）、人事變動與薪資調整\*.exe、 `svchost_[A-Za-z]{40,60}\.exe` （延续）；

7\. 通用 stager 哈希 7eca6ff7… 直接入库封禁（双剧本复用，命中即两端剧本都在投）；

8\. Winlogon Userinit 值监控：任何对 `Userinit` 的追加写入（合法值仅 `userinit.exe` ）直接高保真告警；

9\. 服务异常态交叉：「服务显示 Stopped 但 PathName 指向 cmd /c start」组合为本次 Lotok 样本指纹。

10.**BYOVD 防线**：将 **ardrv.sys（OPSWAT AppRemover，CVE-2026-36425）** 加入微软易受攻击驱动黑名单同步清单（若尚未）；结合 10-07 Alpha Cyber 13+ 驱动清点，建议按月度例行核对微软 VLCK 更新。

11.**运营节奏**：微步共享站若明日（10-15）仍未刷新（第 3 日），按平台管线异常处置：以 Derp + Triage 检索为替代主源，并联系微步渠道确认；CCTGA 第六批断档 23 天，建议企业侧暂以自有回撞结果为准。

## 六、参考来源

| #   | 标题  | 链接  | 日期  |
| --- | --- | --- | --- |
| 1   | Triage: 261011-b7wp8ady3t（DX03_817.img.zip / valleyrat_s2 / C2 202.61.157.33:21357） | https://tria.ge/261011-b7wp8ady3t | 2026-10-11 |
| 2   | Triage: 261011-cpymjacy7l（202610.08.img.zip / valleyrat_s2 / C2 27.124.12.236:449/443） | https://tria.ge/261011-cpymjacy7l | 2026-10-11 |
| 3   | Triage: 261012-dsejhavv9p（RF01_0196.zip / Notice from Tax Departmen.exe / C2 202.61.157.33:21357） | https://tria.ge/261012-dsejhavv9p | 2026-10-12 |
| 4   | Triage: 261012-c4c95svs5n（valleyrat_s2 / C2 14.128.53.155:21131/21132） | https://tria.ge/261012-c4c95svs5n | 2026-10-12 |
| 5   | Triage: 261012-b75ywsea92（DX03_702A.img.zip / valleyrat_s2 / C2 14.128.53.155） | https://tria.ge/261012-b75ywsea92 | 2026-10-12 |
| 6   | Derp ValleyRAT Malware Profile（样本库 71 / ATT&CK 105） | https://www.derp.ca/win_valley_rat | 2026-10-14 检索 |
| 7   | 博客园：双份 tasklist 快照揪出隐藏后门——Backdoor/Lotok（银狐）排查与清除实录 | https://www.cnblogs.com/azure011328/p/23286092 | 2026-10-13 |
| 8   | 微步在线银狐情报共享站（热点 IoC「12日更新」批次） | https://s.threatbook.cn/cybercrime/silverfox | 2026-10-14 检索 |
| 9   | 南京农业大学 ValleyRAT 风险提示（14.128.47.87 官方预警，背景） | 见 2026-10-12 日报参考来源 | 2026-10-08 |
| 10  | CVERC《网络空间安全态势分析报告(2026)》（旧发布，甄别脚注） | https://www.cverc.org.cn/head/jishubaogao/wlkjaqtsfxbg2026.pdf | 2026-09-02 |

### 脚注：历史背景与数据纪律

• **CTG Server 定性沿革**：10-12 日报以 whois 定性 14.128.47.87（官方预警 C2）与 202.61.157.33（新投放 C2）同属 CTG Server Ltd.（HK 段 14.128.40.0/21 + SG 段 202.61.157.0/24，同 abuse@ctgserver.net）；本期以 10/11–10/12 共 5 样本 C2 行为互证完成加固。CTG Server 为 Derp 历史 C2 窗口长期榜首托管商。

• **Derp 回填纪律**：样本入库存在 1–2 天回填滞后，单日计数 T+3 复核后方可引用（10/12=6 已于今日二次核对持平）。

• **ISO 投递谱系**：银狐谱系相邻的 PAPERMILL（JUMPSEC 9-15）已用 ISO 容器；本次为 ValleyRAT 本体链首见，两者是否共享打包基础设施 **待核实**。

• **公众号状态**：本期草稿箱发布流程已执行，结果见推送状态标注（若标注失败请按闭环手动补发）。

本日报由自动化脚本生成 · 仅供企业蓝队参考
