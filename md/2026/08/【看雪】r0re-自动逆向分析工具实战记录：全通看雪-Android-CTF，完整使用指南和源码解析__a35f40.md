---
title: 【看雪】r0re 自动逆向分析工具实战记录：全通看雪 Android CTF，完整使用指南和源码解析
source: https://bbs.kanxue.com/thread-292470.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-12T09:55:54+08:00
trace_id: 1ad3b5ed-e7b0-4104-83c7-621f9fb06f72
content_hash: cb74c3ec8b01c177c75f6df9b2b077017f653afe88e46a401f28add8fdb595b9
status: synced
tags:
  - 看雪
  - Android逆向
  - AI辅助逆向
series: null
feed_source: 看雪·Android安全
ai_summary: r0re 是一个基于 Cairn 重写的 Android 自动逆向 Agent，通过黑板 Fact/Intent/Hint、受限协议和验证门控，跑通看雪 Android CTF 9 题，并能在错误候选后靠 Hint 继续收敛。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3ba75244-d011-811b-861b-e4d250e54179
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> r0re 是一个基于 Cairn 重写的 Android 自动逆向 Agent，通过黑板 Fact/Intent/Hint、受限协议和验证门控，跑通看雪 Android CTF 9 题，并能在错误候选后靠 Hint 继续收敛。
> 
> - **核心架构：** r0re 延续 Cairn 黑板思想，只用 Fact、Intent、Hint 三类对象；dispatcher 独立于服务进程，通过 SQLite 共享状态，Worker 在 Docker 容器中调用 jadx/apktool/Frida/ADB 等工具，并将 trace、脚本、报告回写项目目录。
> - **关键设计：** 所有黑板写入集中在 R0reService；任务只有 bootstrap、reason、explore 三种；Worker 认领 Intent 后可写回 Fact 或 dead_end；模型输出必须落入受限协议，不能只交自然语言结论。
> - **完成门控：** 候选 Flag 先入 completion_candidates 保持 pending，需通过 verifier、真实分析产物和带通过语义的 verifier/solver 事件等检查后才 finalize；AliCrackme_2、AliCrackme_4 首次候选失败后均保留失败痕迹并靠新 Hint 重新收敛。
> - **实战数据：** 9 道看雪 Android CTF 全部通过；AliCrackme_1 从 assets/logo.png 恢复 256 项 UTF-8 映射表反推出输入 581026 并回验；AliCrackme_3 含阿里 dex 壳、反调试和摩斯码变换；AliCrackme_4 静态走不通时转入 Frida 动态分析。
> - **使用方式：** 需要 Java 17、Docker 和 Android 分析镜像；启动命令为 ./scripts/r0re-preflight.sh 和 ./start-r0re.sh，可加 --adb-device 与 --adb-mode wifi 指定真机/模拟器；WebUI 地址为 http://127.0.0.1:8001。

做 Android CTF 时经常碰到同一个问题：前面用 JADX、strings 很快能摸到入口，后面一碰到壳、动态注册 JNI、native 自解密或反调试，就开始在好几个终端和工具之间来回切。最后即便拿到一串“像答案”的内容，过几天再看，往往说不清它从哪一层来的，也不知道有没有真正走到校验点。

所以我把 Cairn 用 Java 重写，再把 Android 逆向常用的工具、提示词和验证环节接进去，做成了 **r0re**。它干的事情很简单：把任务拆小，把每一步看到的东西留下来；候选错了，就从错误处继续，而不是重新开一个聊天窗口。

这次用它跑完了看雪论坛公开 Android CTF 题集。AliCrackme_2、AliCrackme_4 都出现过首个候选不对、补 Hint 后才重新收敛的情况，我把这些过程保留下来了。对我来说，逆向 Agent 能不能第一次完成不是最关键的；更重要的是错误后能不能留下原因，并继续往下走。

> 说明：文中的样本仅用于公开 CTF/CrackMe 学习和授权逆向场景。源码、配置模板和测试记录随帖附件提供；发布时请将自己的模型 Key、设备地址和本机绝对路径从配置文件中移除。

## 一、测试结果：9 题通过

本次测试覆盖题集中的 9 道题，下图是最终记录。后面只展开 5 道：我想把篇幅留给出错后的处理、Hint 怎么生效，以及最终结果怎么验，而不是逐题堆截图。

![看雪 Android CTF 9 题全通结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1c095c5387df3bdd.png)

## 二、我为什么从 Cairn 开始改

r0re 不是凭空起的项目。它基于 **Cairn** 的架构思想进行 Java 重实现，再针对 Android 逆向补齐工具、提示词、运行态观测和验证环节。

Cairn 的开发者是 **淚笑**，并在开源组织「起零衍迹 / Oritera」发布； **Bytex** 是他参加腾讯云黑客松时使用的战队名。该系统在那次比赛中完成 54/54，是该届唯一 AK 队伍。我参考它，主要不是因为这个成绩，而是因为它把复杂任务压缩成了一个很清楚的模型：已知 `origin` ，设定 `goal` ，中间路径未知，就持续补事实、拆下一步。 [Cairn 源码](https://github.com/oritera/Cairn) 与 [作者复盘](https://www.gm7.org/archives/90095) 在这里。

Cairn 的核心很克制：黑板上只有 Fact、Intent 和 Hint 三种对象。Fact 是已确认的发现；Intent 是下一步准备探索的方向；Hint 是人随时可以写入的判断。Worker 围绕同一张黑板读取信息、探索、再写回事实，不靠“信息收集 Agent / 利用 Agent / 报告 Agent”这样的固定角色切分工作。

这个思路刚好适合 Android 逆向。一个 APK 的校验路径可能横跨 Java、资源、JNI 和运行时内存，起手时谁也画不准流程图。先把确定的东西记下来，再盯着当前缺口往下挖，比硬规定一套“第一步、第二步、第三步”更实际。

不过，原版 Cairn 面向通用问题求解与渗透测试，Android 逆向还有自己的硬约束：JADX 和 JNI 映射要可回查，动态分析要能连设备，候选 Flag 不能只凭一段自然语言结论完成。因此 r0re 保留了 Cairn 的黑板、 `serve + dispatch` 双进程和任务图思想，同时增加了 Android CTF 专用 prompt、产物索引、runtime event、Frida/ADB 工作路径，以及最终候选的验证门控。

所以 r0re 不是要另起一套理论。Cairn 给了问题推进的骨架；我做的部分，是把它接到 APK、so、设备和验证脚本上。

## 三、做 r0re 时，我盯着的几个问题

脚本适合把已经知道的算法批量化；大模型比较擅长在陌生二进制里找方向。两者之间还差一个能长期保存上下文、允许人中途纠偏的工作台。r0re 就是补这个空档。

它把一个项目拆为三类可追踪对象：

-   **Fact**：已经观察到的事实，例如 Manifest 入口、某个 JNI 映射、一次 Frida hook 的参数或已导出的 dex；
-   **Intent**：下一步可独立完成的工作，例如“定位 `RegisterNatives` 的注册表”或“复现 AES 解密链”；
-   **Hint**：人为补充的约束和方向，例如“先检查 `libmobisec.so` ”“候选必须在真机输入通过后才可结束”。

Worker 不能只写一段长篇结论就宣布完成。它需要说明依据哪些 Fact，产出了什么文件，哪些结论已经由真实工具输出验证。候选答案随后进入单独的 verification/finalize 流程；验证失败，候选会保留失败痕迹而不是悄悄覆盖。

这套设计直接针对 Android CTF 里最常见的三个坑：

1.  可见字符串、Base64、Morse 表只是线索，不等于 Flag；
2.  静态分析卡在壳或自修改 native 时，需要切到设备动态分析；
3.  一个“看起来正确”的答案必须能通过原 App、重建算法或独立验证器中的至少一种验证。

## 四、源码拆解：从创建项目到验证收口

源码仓库： [github.com/fyrlove/r0re](https://github.com/fyrlove/r0re) 。r0re 使用 Java 17、Spring Boot 和 SQLite；服务进程负责保存黑板、项目和完成状态，dispatcher 是独立进程，按项目状态调用容器中的 Worker。这个拆分不是为了把架构画得复杂，而是为了把“模型调用”与“分析现场”分离：模型超时、容器退出、机器休眠，都不应该让已经得到的证据消失。

```
WebUI / HTTP API
       │
       ▼
SQLite 黑板：projects / facts / intents / hints / runtime_events
       │
       ▼
Dispatcher：bootstrap → reason → explore → verify → finalize
       │
       ▼
Docker Worker：jadx / apktool / readelf / Frida / ADB / 自定义 solver
       │
       └── analysis 产物、trace、报告回写到项目目录
```

### 4.1 先把状态落下来

最核心的 schema 在 `src/main/resources/schema.sql` 。 `projects` 保存项目生命周期； `facts` 、 `intents` 、 `intent_sources` 和 `hints` 组成可回放的事实图； `runtime_events` 记录每个 Worker 在什么阶段、用了什么工具、生成了什么产物； `completion_candidates` 与 `verification_intents` 则把“模型声称完成”拆成待验证的候选和独立验证任务。

这个数据结构解决了一个很现实的问题：同样一句“已找到 Flag”，在逆向里含金量完全不同。它可能是 strings 里看见的值，也可能是对 `memcmp` 参数的 hook 结果，还可能是本地脚本正向/逆向都跑通的输入。r0re 用 `verified` 、 `kind` 和 artifact 路径把这些状态分开保存。 `dead_end` 也会作为事实保留——例如“静态 dump 没有解密代码页”，后续任务就不会再沿同一条路无休止搜索。

从源码看，所有黑板写入集中在 `src/main/java/com/fyr/r0re/server/R0reService.java` ，而 `DispatcherRunner` 只通过 HTTP API 获取项目、认领任务和回传结果，不直接碰 SQLite。这样 WebUI、dispatcher 和 Worker 看到的是同一个事实来源，不会出现“页面里已经加了 Hint，容器还在拿旧上下文”的两套状态。

### 4.2 调度循环怎么转起来

`src/main/java/com/fyr/r0re/dispatcher/DispatcherRunner.java` 是整个系统的心脏。每次 tick 会回收结束任务、读取活跃项目、刷新运行态、处理容器清理，然后为可执行项目补位。任务只有三种：

-   `bootstrap` ：项目刚创建时做首轮侦察，建立 APK 的基本认识；
-   `reason` ：读取当前事实图，判断目标是否达成，或生成下一批更小的 Intent；
-   `explore` ：认领一个 Intent，真正调用工具完成分析，并把结果写回为新的 Fact。

把它写成伪代码，大致就是：

```
项目创建 → bootstrap
新 Fact / 新 Hint / 有空闲任务槽位 → reason
reason 产生 Intent → Worker 认领 → explore
explore 产出 Fact 或 dead_end → 再次 reason
候选答案 → verifier → finalize
```

这里最重要的是 `reason` 不负责“替人写一份计划书”，而是只提出当前证据支持、且可以验收的下一步。例如已经发现 `System.loadLibrary` ，下一条 Intent 应该是“枚举 JNI 声明并定位 RegisterNatives”，而不是“继续深入分析”。一条 Intent 只要能产生一个明确事实，就值得被调度；无法完成的宽泛描述则不应进入队列。

在 `dispatch.kimi.swarm.yaml` 中可以设置同一项目的 Worker 并发。它们不是固定分工的角色，而是围绕不同 Intent 并行探索：一个追 Java 入口，一个追 native 注册，一个准备动态 hook。谁先把可验证证据写回黑板，其他路径就能利用它或被及时否定。这也是 r0re 从 Cairn 继承得最完整的一点。

### 4.3 Worker 如何拿到上下文，又如何留下现场

`ExternalCliWorkerAdapter.java` 负责将一次任务变成容器内的 CLI 执行。它创建/复用项目容器，渲染 prompt，启动外部 Agent CLI，持续上报心跳，解析结构化结果，并将 trace、workspace snapshot、脚本和报告同步回 `output/live-analysis/<project_id>/` 。因此网页上看到的不是“模型最后一段回答”，而是可以回到本地查看的 JADX 输出、Frida 脚本、内存 dump 或 solver。

`runtime_events` 是这层的旁路记录。每条事件可以带 `phase` 、 `step` 、工具名、当前进度和 artifact。遇到长时间没有更新的 native 任务时，使用者能判断它是在跑 `jadx` 、卡在 CLI，还是已经开始调设备，而不用盯着一段没有意义的“分析中”。这也是文章里 AliCrackme_4 能从静态分析转向 Frida 的基础：方向变化会留下事件、Hint 和产物，不靠口头交接。

### 4.4 Android 题的 Prompt 为什么要拆开

`PromptFactory.java` 并非简单地把整张黑板塞给模型。它会为 `reason` 和 `explore` 导出更紧凑的事实图，附带最近产物、可检索目录和 JNI 摘要；再根据 Intent 选择模板。Android CTF 的模板位于 `src/main/resources/prompts/android-ctf/` ，native 相关任务进一步分为：

-   `explore_native_jni.md` ：Java/Smali native 声明、 `System.loadLibrary` 与 `RegisterNatives` 对应关系；
-   `explore_native_constants.md` ：密钥、查表、比较缓冲区等常量恢复；
-   `explore_native_smc.md` ： `mprotect` 、解密、按需执行等自修改代码路线；
-   `explore_native_packed.md` ：壳、动态 dex、Godot 或资源包的恢复；
-   `explore_native_verify.md` ：把候选输入回放到已恢复的校验链中。

这类拆分看似只是 prompt 工程，实际是在给分析过程设“可交付物”。比如 JNI 任务要交出方法映射，常量恢复要交出偏移/字节和提取方法，验证任务要交出可以运行的命令或脚本。只说“发现了 AES”不能让项目结束；只有证明密钥、密文与最终比较之间的调用关系，才是能复用的事实。

### 4.5 Flag 为什么不能直接宣布完成

CTF 题最危险的假阳性，是模型用流畅的文字把猜测说成答案。r0re 因而没有接受原始 `complete` 后立即结束项目的做法。 `CompletionPolicyService.java` 会对逆向项目检查四类东西：是否存在 verifier、是否写入验证时间、分析目录是否有真实产物、最近运行事件中是否有 verifier 或 solver 的通过证据。任一项缺失，候选只能停留在 pending，而不能 finalize。

这个约束对应前面的测试记录：AliCrackme_2、AliCrackme_4 的首个候选被 App 否决后，错误没有被“覆盖”；它们留在事件和事实图里，新的 Hint 再驱动下一轮 reason。对使用者来说，多出来的不是一个漂亮状态，而是一张可以解释“为什么这次答案可信”的收据。

### 4.6 跑一题样本

本地准备好 Java 17、Docker 和 Android 分析镜像后，可以这样启动：

```bash
./scripts/r0re-preflight.sh
./start-r0re.sh --no-bridge --config=dispatch.kimi.swarm.yaml
```

需要真机/模拟器动态分析时，显式指定 ADB 设备，避免多设备误连：

```bash
./start-r0re.sh \
  --adb-device <serial-or-ip:port> \
  --adb-mode wifi \
  --config=dispatch.kimi.swarm.yaml
```

打开 `http://127.0.0.1:8001` 创建项目即可。APK 放在 `container-android/test_apk/` ，任务中使用容器内路径 `/home/reverser/workspace/test_apk/<sample>.apk` 。详细启动、排障和检查命令见仓库的 `operations-manual.md` 与 `docs/r0re-swarm-操作手册.md` 。

### 4.7 Fact、Intent、Hint 为什么分开存

在 r0re 里，三者表面上都是文本，职责却完全不同。 `facts` 表示已经掌握的状态， `intents` 表示从已知状态向未知状态迈出的一步， `hints` 则是人类对搜索方向的干预。如果把它们都塞进“任务日志”，模型下一轮只能阅读长篇上下文；而拆成事实图后，系统可以问得更精确：哪些事实已验证？哪条 Intent 还没有认领？某个 Hint 是在什么时候改变了搜索方向？

`facts` 有三个值得读源码时重点关注的字段：

-   `kind` ：普通事实为 `fact` ，已排除路线为 `dead_end` ；
-   `verified` ：仅表示真实工具输出已确认，不因模型自述而自动置位；
-   `creator` ：记录事实由哪个 Worker 或人工写入。

普通 `conclude` 会生成新的 Fact，但默认不是 verified。Worker 如果通过 Frida、solver、真机运行等方式得到硬证据，应通过 Blackboard API 显式写入已验证 Fact。这个区分看起来严格，却是防止报告“越写越真”的基础：候选 Flag、历史 writeup 线索、JADX 观察和真实运行结果可以共存，但它们的证据等级不同。

`intents` 则是一个没有显式 status 字段的小状态机。 `worker IS NULL AND concluded_at IS NULL` 代表 open；有 worker 但未 conclude 代表 claimed； `concluded_at` 有值即闭环。Worker 第一次 heartbeat 就是认领，租约到期会释放 worker，使 Intent 回到 open。reason 的项目级租约同样保存在 `projects` 的 `reason_worker` 、 `reason_trigger` 、 `reason_started_at` 、 `reason_last_heartbeat_at` 四列中，保证同一时间一个项目只跑一个规划任务。

`runtime_events` 是唯一的事件总线，不只是调试日志。心跳载荷、任务启动/完成、候选验证、人工恢复都会落在这里，并可带 `phase` 、 `step` 、 `tool` 、 `artifact` 、 `progress_current` 、 `progress_total` 。 `completion_candidates` 与 `verification_intents` 则将结果验证独立出来； `project_health` 存放正常、待验证、需恢复、需人工复核等项目级信号； `automation_jobs` 记录周期性的冲突候选扫描、待验证重试、调度健康检查等维护任务。

### 4.8 Origin / Goal / Hint 的完整调用链

把 WebUI 的“创建项目”按钮展开，调用链如下：

```
index.html:createProject()
  → POST /projects
  → ProjectsController.createProject()
  → R0reService.createProject()
  → INSERT projects
  → INSERT facts(origin)、facts(goal)
  → INSERT hints（创建表单中携带的 Hint）
  → 返回 ProjectDetail
```

Origin 和 Goal 在这里首先是数据库中的两条种子 Fact，随后才被 `PromptFactory.bootstrap()` 注入给 Worker。这个先后顺序决定了它们不是一次性 prompt 内容：即使项目跑了几小时，Origin、Goal 仍是图的固定锚点，可以被导出、复核和重新打开的项目继续使用。

Goal 有三重特殊性。第一，它不能被作为 Intent 的 `from` ，服务端会拒绝“因为目标是找 Flag，所以我已经有 Flag”这种循环论证；第二，完成时生成的 Intent 会把 `to_fact_id` 指向 `goal` ，表示图真正闭合；第三，Goal 和标题、Origin 一起参与逆向项目识别，从而决定是否启用严格完成门控。也就是说，Goal 不只是写作提示，也是系统的验收契约。

运行中添加 Hint 的路径更有意思： `HintsController` 转发到 `R0reService.createHint()` 后，服务端会保留 Hint，并从最近的非 Goal Fact 中选出来源，生成一条 `Human hint follow-up: ...` 的开放 Intent；同时释放旧 reason 租约并唤醒 dispatcher。于是一个 Hint 会同时影响执行和规划：新的 follow-up Intent 可以马上被 explore，Hint 计数变化也会触发下一轮 reason。这解释了为什么在错误候选出现后，加一条足够具体的 Hint 比“重新运行一遍”更有效。

### 4.9 Classic 与 Swarm：两种调度方式如何共存

classic 模式采用“dispatcher 先认领再执行”的方式。 `tryDispatchProject()` 依次检查项目是否 active、是否在清理、同项目并发是否达到上限、是否有待处理 candidate；然后在 bootstrap、reason 与未认领 explore Intent 之间选择。每个任务开始前，dispatcher 都会通过 API 取得租约，再提交给本地线程池。

swarm 模式的变化不是简单把 `max_workers` 调大。冷启动时 dispatcher 会启动 race，让多个 Worker 同时读黑板；后续 Worker 自己通过 Blackboard skill 竞争 claim Intent。抢到的 Worker 执行，没抢到的 Worker 换一条开放 Intent。执行过程中它们可以直写 Fact、dead_end 和结论，服务端会按归一化文本做去重，避免三个 Worker 因为同一句观察而把黑板刷屏。

两种模式的共性是：没有预设“反编译专家”“Frida 专家”或“写报告专家”。逆向问题的关键路径在开始前不可知，角色分工容易使 Worker 在自己职责边界内空转。r0re 更看重共享的事实图和可竞争的任务：能证明 JNI 映射的人先写入证据，另一个 Worker 就可以立刻用它去做 native 还原或动态验证。

这里也要把当前边界说清楚：源码中已经有按阶段记录进展、识别 stalled task、准备恢复 Hint 的辅助逻辑，但当前主 tick 为保持 Cairn 调度行为，并没有直接调用这套 stalled 恢复路径。现阶段真正生效的恢复主要是租约过期后的释放，以及 swarm 对 `recovery_required` 项目的自动 resume；手动停止的项目不会被系统擅自拉起。把“已实现的观测能力”和“已经接入主循环的自动恢复”分开，是阅读和使用这套系统时应有的判断。

### 4.10 从 Prompt 到容器命令：一次 Worker 执行的实际形态

以 bootstrap 或 explore 为例， `ExternalCliWorkerAdapter` 会依次执行以下动作：

1.  调用 `DockerCli.ensureRunning()` ，确保项目对应的长驻容器可用；
2.  通过 `PromptFactory` 选择模板，并把 Origin、Goal、Hint 或 compact graph 填入；
3.  由相应 `WorkerDriver` 构造 Kimi、Codex、Claude Code、Pi 等 CLI 的命令与会话；
4.  注入 `R0RE_BLACKBOARD_URL` 、项目 ID、Worker 名等环境变量，使容器内工具可以回写黑板；
5.  `docker exec` 运行命令，同时由 `HeartbeatLease` 续约；
6.  提取事件流中的 assistant 结果，检查配额、可重试错误和 API 错误，再交给 `JsonOutputParser` ；
7.  保存 execution trace 与工作区产物，最后把受限的 `WorkerResult` 交回 dispatcher。

这里的“受限”非常重要。解析器接受的不是任意自然语言，而是 Fact、Intents、Complete、Rejected 等有限结果。它会依次尝试完整 JSON、JSON 代码块和文本中的对象片段；无法解析时，bootstrap/explore 可以在保留 session 的前提下进行一次 conclude fallback，要求 Worker 立即停止并提交结构化总结。reason 刻意没有这条兜底：规划为空或不合约应当失败并等待新的事实/Hints，而不是被一段补救文字伪装成成功。

### 4.11 完成状态机：从“有答案”到“可以发布答案”

下面这条链路是 r0re 专门为逆向结果增加的约束，也是我认为最值得保留的源码改造：

```
Worker / 人工提交 complete
       ↓
completion_candidates：pending
       ↓
approve / start-verification
       ↓
verifier、artifact、通过事件满足门控
       ↓
finalizeCompletion()
       ↓
写入 to_fact_id='goal' 的完成 Intent
       ↓
projects.status = completed
```

`complete()` 只创建候选，不会直接改变项目状态。候选保存候选值、来源 Fact、证据摘要、产物路径和验证状态。 `CompletionPolicyService` 对被识别为 reverse/CTF/APK/JNI 等场景的项目执行更严格检查：必须有 verifier Worker、验证时间、真实分析产物，以及带有通过语义的 verifier/solver 运行事件。任一条件缺失，finalize 都会被拒绝。

最终收口时， `finalizeCompletion()` 会再检查候选来源的 Fact 是否仍有效，写入一条目标为 `goal` 的完成 Intent，更新 candidate 和 project health，最后才把项目标为 completed。图上的最后一条边由此可见、可导出。验证失败则不是“静默重试”：它会进入可重试失败或人工复核分支，保留失败原因，必要时再由自动化 job 或新 Hint 推动下一步。

### 4.12 这套源码里真正有用的部分

读完这一套实现后，可以发现 r0re 的重点并不是换了哪一个模型。真正可复用的是四个工程约束：事实写后不改，错误路线也保留；任务必须引用已知事实，不能拿 Goal 自证；模型输出必须落入受限协议；完成结论必须经过证据门控。它们让大模型的探索能力可以被接到 APK 静态分析、JNI、动态 hook 和算法复现上，又不会把每次模型回答都当作真相。

这也是本文能够展示 9 题全通、同时保留错误候选和人工 Hint 过程的原因。成绩可以作为结果，但源码中的状态、产物和验证链，才是结果可被他人复查、复用甚至反驳的基础。

## 五、Origin、Goal 该怎么写

一开始我只在任务里写“分析 APK，找正确 Flag”。这会让 Worker 很容易跑偏：找到一个可疑常量就停止，或者在没有证据时盲目猜测。

后来固定为两个部分。Origin 说明样本来源、保护特征、允许工具和证据边界；Goal 则只写验收条件。下面是适用于 AliCrackme_3 的精简版本：

```
Origin
这是看雪与阿里 2015 移动安全挑战赛的公开 Android CTF 样本。
已知可能包含 dex 壳、反调试、JNI/native 校验和摩斯码变换。
APK 是唯一可信输入；公开资料只能作为线索，不能单独作为最终证据。
允许使用静态分析、脱壳、ADB/Frida 动态分析和本地算法复现。

Goal
找出能被程序接受的输入，并形成可复现报告：入口、校验链、关键产物、
重建脚本或真机验证结果。没有通过恢复逻辑或实际运行验证的候选，不得作为最终答案。
```

这段话不是为了让模型突然变聪明，而是为了把停下来的条件写死：看到一个字符串不算完成；找到比较点、复现变换，或者在 App 中跑通，才算。

## 六、实战记录：5 道题和几次回退

### 1\. AliCrackme_1：从资源伪装中还原映射表

第一题用于验证最基础的流程。创建项目后，Worker 先列出 APK 结构和入口，再把资源文件与 Java 层 `bytesToAliSmsCode` 的调用关系写到黑板。最终不是凭“看起来像密码”的字符串结束，而是从 `assets/logo.png` 中恢复 256 项 UTF-8 映射表，反推出输入 `581026` ，并用正向映射回验。

![创建项目](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d8afb74ba7465d03.png)

![开始分析](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5faaf49baec4ae46.png)

![App 中验证正确](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0c3cecd34d34fe56.png)

这个题不难，但它定下了后面的规矩：资源文件也可能是数据表；答案必须能回到校验函数。

### 2\. AliCrackme_2：首个答案错误后，补 Hint 重新拆题

第二题在第一次分析结束后，将候选输入 App 验证，结果错误。

![首次分析](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9806d2a7f300d139.png)

![首次候选验证失败](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4bf0eb3f59c1da98.png)

这时没有把项目推倒重来，也没有手动修改结论，而是补充了“候选必须沿完整校验链验证，并继续定位 native 比较/变换点”的 Hint。Dispatcher 在下一轮看到 Hint 和失败记录后重新派发更窄的 Intent，第二次结果通过了 App 验证。

![补充 Hint](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5cd542a3ae96e31b.png)

![重新分析](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/31f08be2f6b6b98c.png)

![再次验证正确](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b7510cb0e5022d68.png)

人工hint在这里做的不是替 AI 解题，而是把“错误候选”转译成下一轮可以执行的约束。对复杂样本而言，这是比反复换 prompt 更可靠的协作方式。

### 3\. AliCrackme_3：壳、反调试与 Morse 线索不能直接等同于答案

第三题包含阿里 dex 壳、反调试和摩斯码变换。创建项目时我直接把这些已知信息放进 Origin，同时明确“公开 writeup 只能作线索”。随后由 Worker 分别推进壳/DEX、Java 调用链、JNI/native 和算法验证，避免一条任务同时承担所有不确定性。

![AliCrackme\_3 创建项目](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/55838403d9555e62.png)

![AliCrackme\_3 分析过程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/33d2b275463bd2c1.png)

![AliCrackme\_3 分析结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/74dcc6b213be94e0.png)

这里特别强调一个容易被忽略的点：Morse 表、 `hashCode` 条件或历史文章给出的候选，都只能提高优先级，不能跳过验证。r0re 会把“已观察到的表”和“已证明到达最终比较的逻辑”分开记录。这样的记录也能避免后面写报告时，把线索误写成结论。

### 4\. AliCrackme_4：静态分析走不通，就让动态证据接管

第四题的第一次候选同样没有通过验证。

![AliCrackme\_4 创建项目](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/666dec10e7fac9bf.png)

![首次验证失败](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fbeaea5f0e6adaf3.png)

这次的 Hint 指向连接设备并观察运行时校验。r0re 自动进入 Frida 动态分析路径：在触发校验时 hook native 比较相关调用，结合脱壳后 dex 中的 AES 常量和密文，复现出完整变换链，再回到设备验证。

![动态分析得到结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/06898ae1b92ad5bd.png)

![设备中输入验证](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d6edf478b21e6cdb.png)

这类题的经验很直接：当 native 代码按需解密、静态 dump 里仍然是高熵数据时，不要让 Worker 在静态工具里无限打转。将“运行时触发校验、抓取比较参数或注册表”声明成独立 Intent，反而更快收敛。

### 5\. AliCrackme_2_3

![AliCrackme\_2\_3 的候选](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/68ddf748600e5e02.png)

## 七、这轮测试留下的三点经验

第一， **把并行用在互相独立的假设上**。例如一个 Worker 看 Java 入口，一个看 JNI 映射，一个准备 Frida hook；不要让三个人同时泛泛地“分析整个 APK”。swarm 模式会竞争认领 Intent，已经被验证的 Fact 直接给后续任务使用。

第二， **让失败可见且可消费**。runtime events 会记录 Worker 的阶段、进度、产物和失败原因； `dead_end` 用来标识已排除的路线。这样重试不是把同一个 prompt 再跑一次，而是带着“为什么上一条路不通”重新调度。

第三， **把完成当作一个状态机，而不是一句话**。候选答案先进入 completion candidate；独立 verifier 检查证据和产物；满足门控后才 finalize。对于逆向题，这一步虽然显得慢，却能明显减少“模型把猜测写得很自信”的问题。

## 八、写在最后

这轮看雪 Android CTF 测试之后，r0re 不再只是“能调模型的服务”。它能拆任务、保存过程、接收人工方向，也能把错误候选留在项目里继续处理，最终完成整个逆向分析过程的到结果。

如果想试，建议先挑一题 Java 层校验清楚的 CrackMe，Goal 里直接写验证条件。把 facts、intents、产物和完成门控走通，再上壳、JNI 和动态分析题。

源码已公开在 [fyrlove/r0re](https://github.com/fyrlove/r0re) 。欢迎在公开 CTF、教学样本和已获授权的 App 安全测试中使用，也欢迎把新的样本特征、验证脚本和失败路径补进来。
