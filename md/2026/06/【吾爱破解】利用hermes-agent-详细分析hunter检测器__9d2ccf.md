---
title: 【吾爱破解】利用hermes agent 详细分析hunter检测器
source: https://www.52pojie.cn/thread-2110423-1-1.html
source_host: www.52pojie.cn
clip_date: 2026-06-05T15:42:53+08:00
trace_id: 3e65932d-52a6-4555-8828-b11dd404b7e4
content_hash: f44605bfae7a8024a397268be2a76545582d1f0d290563800c3111bf92cafca5
status: imaged
tags:
  - 吾爱破解
series: null
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: null
---

快捷导航

-   [门户吾爱破解门户](https://www.52pojie.cn/portal.php "吾爱破解门户")
-   [网站吾爱破解论坛](https://www.52pojie.cn/ "吾爱破解论坛")
-   [新帖吾爱破解论坛新帖导读](https://www.52pojie.cn/forum.php?mod=guide&view=newthread "吾爱破解论坛新帖导读")
-   [专辑吾爱破解文章专辑列表](https://www.52pojie.cn/forum.php?mod=collection "吾爱破解文章专辑列表")
-   [排行榜吾爱破解排行榜](https://www.52pojie.cn/misc.php?mod=ranklist "吾爱破解排行榜")
-   [爱盘爱盘，在线破解工具包，实时提供最新逆向资源！](https://down.52pojie.cn/ "爱盘，在线破解工具包，实时提供最新逆向资源！")
-   [帮助吾爱破解论坛常见问题解答中心](https://www.52pojie.cn/misc.php?mod=faq "吾爱破解论坛常见问题解答中心")

查看: 998|回复: 9

## \[Android 原创\] 利用hermes agent 详细分析hunter检测器

<div class="joplin-table-wrapper"><table><tbody><tr><td rowspan="2"></td><td><div><h2>Hunter 检测原理分析</h2><h3>前言:agent 学会了防御,也学会了拆解</h3><p>2026 年 3 月 12 日,Hermes Agent 发布 <code>v2026.3.12</code> 。按官方 release 说明,这是 <strong>Hermes Agent v0.2.0</strong>,也是继 <code>v0.1.0</code> 这个 pre-public foundation 之后的首个正式 tagged release,不是严格意义上的"第一个版本"。截至 2026-05-30 查询官方 GitHub 仓库,<code>NousResearch/hermes-agent</code> 已在 17 万 Star 左右;一个月内破十万这类增长叙事和 OpenClaw 的热潮相互映照,但真正让安全圈记住它的,不是 star 数,而是一个有点"灵异"的故事。</p><p>Hermes 的卖点其实并不花哨:一个能长时间自主跑任务的通用 agent,真正的差异化全压在"记得住"和"会自己改进"这两件事上。官方文档把这套能力拆成几块:一层是 <strong>记忆</strong> (memory),核心是 <code>~/.hermes/memories/</code> 下的 <code>MEMORY.md</code> 和 <code>USER.md</code>,分别保存环境/项目经验与用户偏好,会在会话开始时注入上下文;另一层是 <strong>技能</strong> (skill),反复用到的操作流程被固化成可复用的 <code>SKILL.md</code>,需要时 agent 可用 <code>skill_manage</code> 创建、更新、删除。换句话说,它不是把所有经验塞回模型参数,而是把经验外置成可读、可改、可复用的本地资产 —— 这恰好是下面那个故事的伏笔。</p><p>公开安全文章里转述过这样一个案例:有人拿自动化引擎反复攻击 Hermes,反弹 shell 一个变体接一个变体地打。一开始次次得手;可打着打着,Hermes 忽然就不执行了,像是凭空对这种攻击免疫了。这个故事本身不是官方 release note 里的正式结论,更适合当作安全测试转述来看;官方文档能直接佐证的是它确实具备自管 memory、创建/修改 skill、以及后台复盘的机制。若这个案例成立,它的技术解释并不神秘:攻击样本被当成"下次别再犯同一个错"的经验沉淀了下来。</p><p>官方文档对这套"复盘"循环的描述更具体:<code>run_agent.py</code> 侧维护 <code>_turns_since_memory</code> 和 <code>_iters_since_skill</code> 两类计数。默认逻辑是每 <strong>10 个用户 prompt</strong> 触发一次 memory review,每 <strong>10 个 tool iteration</strong> 触发一次 skill review;达到阈值后调用 <code>_spawn_background_review(messages_snapshot=..., review_memory=..., review_skills=...)</code> fork 出后台 Review Agent。它不接手原任务,而是回看刚刚那段对话,判断"这一段里有什么是下次该记住的?"以及"有什么操作值得固化成 skill?"。复盘完成后,经验被写入 memory 或通过 <code>skill_manage</code> 落盘成 skill,主 agent 继续原任务。</p><p>关键在于,这个循环对"什么算经验"并不挑食:用户纠正过的偏好是经验,踩过的坑是经验,复杂任务里反复出现的操作模式也是经验。因此,如果上面那个攻击案例的日志链路完整,它的解释就不必诉诸"灵异":同一种 payload 反复出现、某次被识破后,Review Agent 可能把"这类输入要警惕"当成普通经验存下来。所谓"进化出免疫",更保守的说法是:一套通用复盘机制,可能恰好作用在了攻击样本上。它没学会抽象意义上的"安全",它只是学会了"别再犯同一个错" —— 拒绝执行可疑 payload,刚好是这条通用规律的一个特例。</p><p>这个故事迷人,但它还有另一面:让 Hermes 这类 agent 变得有用的那套能力 —— 会读代码、会调工具、能在数百步里不丢线索地复盘 —— 换个方向用,就是今天最锋利的 <strong>逆向工具</strong> 。当这样的 agent 经 MCP 接上 IDA、Ghidra、Frida,它能把一个加固 SO 从 JNI 注册表一路扒到风险汇聚点,速度远高于纯手工检索。本文通篇出现的"IDA MCP 实读",就是这么来的。</p><p>可问题恰恰也藏在这儿。agent 读伪代码太"顺"了 —— 顺到它会不知不觉把"看起来合理"当成"事实",把"hook 完那个方法、界面里风险项没了"当成"绕过成功"。在一个老实的 app 上,这种幻觉无伤大雅;但这一次我们要拆的是 <strong>Hunter</strong> —— 一个会用多进程、syscall 跳板、CRC 自检反过来咬你的家伙。在它面前,一条幻觉结论的代价是:你以为已经绕过,实际上 <code>:hunter_server_iso</code> 子进程正通过 Binder 把同一条风险项原样传回 UI。</p><p>所以这篇文章不是又一份"我把 Hunter 绕了"的炫技记录。它记录的是:当我们把 agent 放出去拆 Hunter v6.58(<code>versionCode 658</code> / <code>libhunter.so</code>),怎么让它的每一条结论都不是"它觉得",而是"证据逼它承认"。办法说穿了很朴素 —— 给这只会读代码的 agent 也上一道 <strong>证据门</strong>:每个检测点,都要静态、动态两条独立证据线对上才算数。静态线从 <code>art_register_natives_batch</code> 的 60 项注册表锚定 Java 方法到 native RVA,再用 IDA 伪代码 / 字符串 / xref 还原算法;动态线在汇聚点 <code>build_native_ListItemBean_risk @ 0x278658</code> 落 hook,用 <code>ReportRiskItem</code> 的 <code>LR</code> 反查到精确 callsite,用 <code>MainActivity.n0</code> 的 UI 三元组确认命中来源,最后用 bypass 让目标风险项消失来反向闭环。</p><h3>判定标准只有一条:不是"hook 完界面干净了"就算数,而是要证明检测算法、命中原因、绕过点三者之间的因果关系。没对上的,一律降级,绝不升格成"已确认"。这道门的全部规矩,就是下面 5 条。</h3><p>Hermes Agent静态 IDA 反编译 + 动态 Frida hook 两条独立证据线,逐条还原 Hunter v6.58 的检测算法。每条结论都满足:</p><ol><li>JNI Native注册表证明 Java 方法到 native RVA 的对应关系</li><li>IDA 字符串 / xref / 伪代码证明 native 函数内部行为</li><li>动态 <code>ReportRiskItem</code> 的 LR(返回地址) 落在对应 native 函数内</li><li>Java <code>MainActivity.n0</code> 的 stack 证明最终 UI 风险项来源</li><li>对相应入口做 bypass 后,目标风险项消失</li></ol><pre><code>APK          com.zhenxi.hunter  v6.58 / versionCode 658
SO           lib/arm64-v8a/libhunter.so
SHA256       e575daabdeab10b41351286367a77fdb4c0e2ae3aa8d66af7495e046b4a63123
IDA          imagebase 0x0
测试环境     Pixel 6 Pro / Android 15 (AP4A.241205.013) / SDK 35
             google/raven/raven:15/AP4A.241205.013/12621605:user/release-keys
Frida        17.9.7</code></pre><h3>目录</h3><ul><li><a href="#1-分析方法">1. 分析方法</a></li><li><a href="#2-jni-动态注册绕过-registernatives-监控">2. JNI 动态注册:绕过 RegisterNatives 监控</a></li><li><a href="#3-安全-syscall-跳板借-linker-svc-绕开-libc-监控">3. 安全 syscall 跳板:借 linker SVC 绕开 libc 监控</a></li><li><a href="#4-风险项汇聚点-build_native_listitembean_risk">4. 风险项汇聚点 <code>build_native_ListItemBean_risk</code></a></li><li><a href="#5-完整性自检模块-r-x-段-crc-双链">5. 完整性自检:模块 r-x 段 CRC 双链</a></li><li><a href="#6-procmounts-rootapatch-检测">6. <code>/proc/mounts</code> Root/APatch 检测</a></li><li><a href="#7-libart-maps-分片hook-检测">7. libart maps 分片/Hook 检测</a></li><li><a href="#8-libclibartlinker-运行时-checksum-检测">8. libc/libart/linker 运行时 checksum 检测</a></li><li><a href="#9-注入匿名可执行内存检测">9. 注入/匿名可执行内存检测</a></li><li><a href="#10-其他进程扫描检测">10. 其他进程扫描检测</a></li><li><a href="#11-apatchkpkernelsu-side-channel-检测">11. APatch/KP/KernelSU side-channel 检测</a></li><li><a href="#12-verified-boot--解锁状态检测">12. Verified Boot / 解锁状态检测</a></li><li><a href="#13-环境变量采集">13. 环境变量采集</a></li><li><a href="#14-通用文件-marker-检测">14. 通用文件 marker 检测</a></li><li><a href="#15-风险文件路径检测">15. 风险文件路径检测</a></li><li><a href="#16-avc-denial-日志侧信道">16. AVC denial 日志侧信道</a></li><li><a href="#17-包名-elf-白名单扫描">17. 包名 ELF 白名单扫描</a></li><li><a href="#18-apk-签名一致性">18. APK 签名一致性</a></li><li><a href="#19-system_server-hook-检测">19. system_server hook 检测</a></li><li><a href="#20-vpn-接口检测">20. VPN 接口检测</a></li><li><a href="#21-frida-线程名扫描">21. Frida 线程名扫描</a></li><li><a href="#22-多进程-binder-上报机制">22. 多进程 Binder 上报机制</a></li><li><a href="#23-已确认的实现缺陷">23. 已确认的实现缺陷</a></li><li><a href="#24-检测点总表">24. 检测点总表</a></li><li><a href="#25-为什么这些结论可靠">25. 为什么这些结论可靠</a></li><li><a href="#附录">附录</a><ul><li>A. 相关文件清单</li><li>B. 关键 RVA 速查表</li><li>C. 测试命令</li><li>D. 完整 60 项 <code>off_2EF1F0</code> 注册表(IDA MCP 实读)</li></ul></li></ul><hr><h3>1. 分析方法</h3><h4>1.1 静态侧</h4><p>首先从 <code>JNI_OnLoad</code> 内 <code>art_register_natives_batch(env, NativeEngine, off_2EF1F0, 60)</code> 注册表建立 Java 方法到 so 函数的映射。Hunter 不依赖普通 JNI 导出名,而是通过 ArtMethod 直接 patch 的方式注册。运行时枚举 <code>off_2EF1F0</code> 表(每项 <code>{name*, sig*, fn*}</code> = 24 字节,共 60 项),完整 60 项见 <strong>附录 D</strong> 。本文 SO 层下沉 bypass 脚本 <code>hook_native_bypass_so.js</code> 明确分类并 <code>Interceptor.replace</code> 了其中 <strong>25 个 detection 入口</strong> (其余 35 项为 <code>popen</code> / <code>MD5</code> / 工具方法 / 信息查询 / 还未细化分类的 detection 等,见附录 D)。25 项的 RVA:</p><pre><code>getZhenxiInfo3             rva=0x2b476c
getZhenxiInfo4             rva=0x2a2d98
getZhenxiInfo5             rva=0x2a4760
getZhenxiInfoEnv           rva=0x28cdb0
getZhenxiInfoF             rva=0x2ad9a8
getZhenxiInfoInjection     rva=0x28df24
getZhenxiMapCheck          rva=0x291858
SideChanne                 rva=0x2b3bd4
CheckVpn                   rva=0x2aaf44
checkRiskFile              rva=0x2ac514
checkRootFromAVCLog        rva=0x2aae54
getZhenxiInfoMPNI          rva=0x298374
getZhenxiInfo2             rva=0x29aefc
getZhenxiInfoCBinder       rva=0x28c9bc
getZhenxiInfoBase          rva=0x29288c
getZhenxiInfoL             rva=0x2a8724
getZhenxiInfoO             rva=0x2be8ec
getZhenxiInfo0             rva=0x2bfdd0
getZhenxiInfoVV            rva=0x2c1850
getZhenxiInfo6             rva=0x2a5544
getZhenxiInfo7             rva=0x2a636c
getZhenxiInfoSH            rva=0x28d578
checkFromZygote            rva=0x2abcd0
checkZygisk                rva=0x2a93f8
getZhenxiLoctionCrc        rva=0x2ae064</code></pre><p><code>getZhenxiInfoH</code> 不在这 60 项表内 —— 它本身不是 native 方法,而是 Java wrapper:<code>getZhenxiInfoH(key) -&gt; getPropInline(key, true)</code> 。 <code>getPropInline</code> 是混淆控制流函数,内部再进入 native <code>getZhenxiInfoZ(key)</code> fallback 或 <code>/dev/__properties__</code> 属性区解析。这是实测 60 项表缺失 <code>getZhenxiInfoH</code> 后,结合 Java 反编译确认的链路。</p><p>随后以风险项字符串和 <code>ReportRiskItem</code> 汇聚点交叉定位:</p><pre><code>ReportRiskItem / build_native_ListItemBean_risk: libhunter.so+0x278658</code></pre><p>动态 hook 这个汇聚点可以拿到 native 风险项标题、详情和 <code>LR</code>,例如:</p><pre><code>[ReportRiskItem]
  arg1: Check Find Root In Mounts
  arg2: ... /proc/mounts-&gt;APatch /debug_ramdisk ...
ReportRiskItem this-&gt;lr: libhunter.so+0x2b4a88</code></pre><p>LR = <code>0x2B4A88</code> 落在 <code>NativeEngine_getZhenxiInfo3 @ 0x2B476C</code> 内,把 UI 文案与 native 检测函数闭环。</p><h4>1.2 动态侧</h4><p>动态侧使用三类 hook:</p><ol><li><strong>Java UI sink</strong>:<code>MainActivity.n0(ListItemBean)</code>,观察最终展示的 title/risk/data 和 Java stack</li><li><strong>Java NativeEngine 返回值</strong>:确认哪个 native 返回了风险 bean 或风险字符串</li><li><strong>Native sink</strong>:<code>libhunter.so+0x278658</code>,确认 native 层上报标题和调用点 <code>LR</code></li></ol><p>典型动态证据:</p><pre><code>[Java MainActivity.n0]
  title=Check Find Root In Mounts
  risk=Info
  data=/proc/mounts-&gt;APatch /debug_ramdisk ...

[bypass:mounts] NativeEngine.getZhenxiInfo3 -&gt; null</code></pre><p>前者证明检测命中,后者证明将该 native 返回值置空后 UI 风险项消失。</p><h4>1.3 防崩前置:maps_precheck_readable unmapped hole bug</h4><p>凡是可能触发 Hunter checksum、maps/RX 扫描或 ELF 段枚举路径的动态分析脚本,都应优先安装 <code>block_bad_precheck</code> hook。原因是 Hunter 的 checksum/mem scan 路径会把 maps 解析出的地址交给自己的可读性预检查 <code>maps_precheck_readable @ 0xC6520</code>,该预检查没有证明 <code>[addr, addr+size)</code> 被可读 mapping 完整覆盖；在当前 Frida 17 注入环境下,某些地址区间会跨越 unmapped hole 或不可读页,后续 NEON / 批量读取可能 SIGSEGV。</p><pre><code data-lang="js" class="language-js">function block_bad_precheck(modbase) {
    const badOnce = new Set();
    function untag(p) { return ptr(p).and(ptr("0x00ffffffffffffff")); }
    function isFullyReadable(addr, size) {
        if (size === 0) return false;
        let cur = untag(addr);
        const end = cur.add(size);
        while (cur.compare(end) &lt; 0) {
            const r = Process.findRangeByAddress(cur);
            if (r === null) return false;
            if (!r.protection.includes("r")) return false;
            const rangeEnd = r.base.add(r.size);
            cur = rangeEnd.compare(end) &lt; 0 ? rangeEnd : end;
        }
        return true;
    }
    Interceptor.attach(modbase.add(0xC6520), {
        onEnter(args) {
            this.p = args[0];
            this.size = args[1].toUInt32();
            this.ppp = this.context.lr.sub(modbase);
        },
        onLeave(retval) {
            if (retval.toInt32() === 0) return;
            if (!isFullyReadable(this.p, this.size)) {
                const key = untag(this.p).toString() + ":" + this.size;
                if (!badOnce.has(key)) {
                    badOnce.add(key);
                    console.log("block bad precheck", untag(this.p),
                        "size", ptr(this.size), "off", this.ppp);
                }
                retval.replace(0);
            }
        }
    });
}</code></pre><p>实测拦下的越界访问片段(Pixel 6 Pro / Android 15):</p><pre><code>block bad precheck 0x773acbe000 size 0x7000   off 0xc68a4
block bad precheck 0x7741a35000 size 0x1266d8 off 0xc7828
block bad precheck 0x774059e000 size 0x1000   off 0xc68a4</code></pre><p><code>off 0xC68A4</code> 位于 <code>sub_C687C</code> (<code>parse_elf_rx_segments</code> 内 ELF 文件读出后的可读性预检),<code>off 0xC7828</code> 位于 <code>scan_rx_segment_neon_sum @ 0xC772C</code> (RX 段扫描路径)。两个 LR 模式覆盖两条独立完整性检查链路的越界点 —— 这条数据反复出现在后面 §5 / §8 / §20 / §21 多条 detection 的实测中。</p><hr><h3>2. JNI 动态注册:绕过 RegisterNatives 监控</h3><h4>2.1 链路</h4><pre><code>HunterPreload (Zygote 预加载)
  ↓
dlopen libhunter.so
  ↓
JNI_OnLoad @ 0x2c36f8
  ├─ checkProcessTag (byte_2F3A68 &amp; 1) 失败 → abort()
  ├─ GetEnv(JNI_VERSION_1_6), NULL → abort()
  ├─ HunterJniHelper::init(env)
  ├─ FindClass + 全局缓存 7 个类
  ├─ art_register_natives_batch(env, NativeEngine,  off_2EF1F0, 60)  ← 直接 patch ArtMethod
  ├─ art_register_natives_batch(env, ChooseUtils,   off_2EF1D8, 1)
  ├─ uname().sysname == "Unidbg" → return -1
  ├─ InitProperties
  └─ return 0x10006</code></pre><h4>2.2 静态证据</h4><p><code>art_register_natives_batch @ 0xA5C54</code> 静态伪代码(IDA 反编译还原):</p><pre><code data-lang="c" class="language-c">// libhunter.so+0xA5C54
bool art_register_natives_batch(JNIEnv *env, jclass clazz,
                                JNINativeMethod *methods, size_t count) {
    if (get_sdk_level() &gt; 33)
        return false;                              // Android 14+ / SDK 34+ 直接放弃此路径

    for (size_t i = 0; i &lt; count; i++) {
        jmethodID mid = env-&gt;GetMethodID(clazz, methods[i].name, methods[i].signature);
        if (!mid) {
            env-&gt;ExceptionClear();
            mid = env-&gt;GetStaticMethodID(clazz, methods[i].name, methods[i].signature);
            if (!mid) return false;
        }

        void *art_method;
        if (g_sdk_level &lt; 30) {
            art_method = (void *)mid;              // mid 即 ArtMethod*
        } else {
            // 反射 Executable.artMethod 字段
            jobject m = env-&gt;ToReflectedMethod(clazz, mid, JNI_TRUE);
            art_method = (void *)env-&gt;GetLongField(m, g_fid_Executable_artMethod);
        }

        if (!art_method_set_native_entry(g_sdk_level, art_method, methods[i].fnPtr))
            return false;
    }
    return true;
}</code></pre><h5>2.2.1 art_method_set_native_entry @ 0xA4C80 完整伪代码</h5><pre><code data-lang="c" class="language-c">// libhunter.so+0xA4C80
__int64 art_method_set_native_entry(int sdk_level, void *art_method, void *fnPtr) {
    // ① 选 libart.so 路径
    std::string libart_path;
    build_libart_path(&amp;libart_path);              // sub_1AFA80

    // ② 选 dlsym 目标符号
    const char *sym;
    if (sdk_level &gt; 30) {
        sym = "_ZN3art11ClassLinker14RegisterNativeEPNS_6ThreadEPNS_9ArtMethodEPKv";
        // ClassLinker::RegisterNative(this, Thread*, ArtMethod*, void const*)
    } else {
        sym = "_ZN3art9ArtMethod14RegisterNativeEPKv";
        // ArtMethod::RegisterNative(void const*)
        if (!libart_dlsym(libart_path.c_str(), sym)) {
            sym = "_ZN3art9ArtMethod14RegisterNativeEPKvb";
            // ArtMethod::RegisterNative(void const*, bool)   ── Android 7/8 备选
        }
    }

    // ③ 自实现 dlsym 拿 @hIde 符号(绕 libdl hook)
    void *fn = libart_dlsym(libart_path.c_str(), sym);    // sub_1A82D4
    if (!fn) return 0;
    g_art_RegisterNative_fn = fn;                          // cache @ off_2EF7C8

    // ④ 按 SDK 选择调用形式
    if (sdk_level &gt; 30) {
        // —— Android 12+ ──
        // 取 Thread::CurrentFromGdb 函数指针(本应再调用一次拿 Thread*)
        void *thread_fp = libart_dlsym(libart_path.c_str(),
                                        "_ZN3art6Thread14CurrentFromGdbEv");
        if (!thread_fp) return 0;
        void *class_linker = get_art_class_linker(sdk_level);   // sub_A3CCC
        if (!class_linker) return 0;

        // ⚠ BUG: 第二参数 X1 应是 ((Thread*(*)())thread_fp)() 的结果,
        //        而不是 thread_fp 函数指针本身。详 §2.3。
        ((void (*)(void *, void *, void *, const void *))fn)
            (class_linker, thread_fp, art_method, fnPtr);
    } else if (sdk_level == 30) {
        // —— Android 11 ──
        // ArtMethod::RegisterNative(this=art_method, native=fnPtr)
        ((void (*)(void *, const void *))fn)(art_method, fnPtr);
    } else {
        // —— Android 10- ──
        // ArtMethod::RegisterNative(this=art_method, native=fnPtr, is_fast=true)
        ((void (*)(void *, const void *, bool))fn)(art_method, fnPtr, true);
    }

    return 1;
}</code></pre><p>libart.so 路径按 SDK 选(<code>build_libart_path / sub_1AFA80</code> 静态确认):</p><table><thead><tr><th>SDK</th><th>路径</th></tr></thead><tbody><tr><td>≤ 28(Android 9-)</td><td><code>/system/lib64/libart.so</code></td></tr><tr><td>29(Android 10)</td><td><code>/apex/com.android.runtime/lib64/libart.so</code></td></tr><tr><td>≥ 30(Android 11+)</td><td><code>/apex/com.android.art/lib64/libart.so</code></td></tr></tbody></table><p>dlsym 目标符号(已 demangle):</p><table><thead><tr><th>SDK</th><th>dlsym 目标符号</th><th>调用形式</th></tr></thead><tbody><tr><td>&gt; 30</td><td><code>art::ClassLinker::RegisterNative(art::Thread*, art::ArtMethod*, void const*)</code></td><td><code>RegisterNative(this, Thread*, ArtMethod*, fnPtr)</code></td></tr><tr><td>== 30</td><td><code>art::ArtMethod::RegisterNative(void const*)</code></td><td><code>RegisterNative(this, fnPtr)</code></td></tr><tr><td>&lt; 30</td><td><code>art::ArtMethod::RegisterNative(void const*, bool)</code></td><td><code>RegisterNative(this, fnPtr, true)</code></td></tr></tbody></table><h5>2.2.2 自实现 dlsym:libart_dlsym @ 0x1A82D4</h5><p><code>libart_dlsym</code> 不走 libdl,而是自己解析 ELF 取符号,目的有二:绕开 libdl hook;取 <code>@hide</code> 未导出符号(<code>ArtMethod::RegisterNative</code> 等并不在 libart 的 <code>.dynsym</code> 公开导出)。</p><pre><code data-lang="c" class="language-c">// libhunter.so+0x1A82D4
void *libart_dlsym(const char *path, const char *symbol) {
    void *handle = custom_dlopen(path);                   // sub_1AFF14
    if (!handle) return NULL;
    void *fn = custom_dlsym(handle, symbol);              // sub_1B00B8
    if (!fn) {
        fn = custom_dlsym_fallback(handle, symbol);       // sub_1B0720
    }
    custom_dlclose(handle);                               // sub_1B0060
    return fn;
}</code></pre><p>四个 helper 的分工:</p><table><thead><tr><th>函数</th><th>RVA</th><th>作用</th></tr></thead><tbody><tr><td><code>custom_dlopen</code></td><td><code>0x1AFF14</code></td><td>mmap libart.so + 解析 ELF header / Program Header,建立内部 handle</td></tr><tr><td><code>custom_dlsym</code></td><td><code>0x1B00B8</code></td><td>先查 <code>.dynsym</code> (导出符号表)</td></tr><tr><td><code>custom_dlsym_fallback</code></td><td><code>0x1B0720</code></td><td><code>.dynsym</code> 找不到时查 <code>.symtab</code> (完整符号表,含 @hide)</td></tr><tr><td><code>custom_dlclose</code></td><td><code>0x1B0060</code></td><td>munmap + 释放 handle</td></tr></tbody></table><h5>2.2.3 Runtime 锚点:get_art_class_linker @ 0xA3CCC</h5><p>ClassLinker* 需要从 Runtime 实例取。Runtime 实例本身也是 @hide 符号,通过两条路径定位:</p><pre><code data-lang="c" class="language-c">// libhunter.so+0xA3CCC(简化)
void *get_art_class_linker(int sdk_level) {
    if (g_art_class_linker) return g_art_class_linker;    // qword_2EF7C0 cache

    // 路径 1:dlsym Runtime 静态实例指针(SDK 较新版本可见)
    void **inst = libart_dlsym(libart_path, "_ZN3art7Runtime9instance_E");

    // 路径 2:dlsym 任意一个能拿到 Runtime 内部偏移的符号
    if (!inst) {
        inst = libart_dlsym(libart_path,
                "_ZN3art17SmallIrtAllocator10DeallocateEPNS_8IrtEntryE");
    }
    if (!inst) return NULL;

    void *runtime = *inst;
    // 按 SDK 偏移读 Runtime-&gt;class_linker_(每个版本偏移不同)
    void *class_linker = *(void **)((char *)runtime + class_linker_offset(sdk_level));
    g_art_class_linker = class_linker;
    return class_linker;
}</code></pre><p>全局缓存:<code>g_art_class_linker @ qword_2EF7C0</code>,<code>g_art_RegisterNative_fn @ off_2EF7C8</code>,<code>g_fid_Executable_artMethod @ qword_2EF7D0</code> (SDK ≥ 30 反射拿 <code>Executable.artMethod</code> jfieldID 的缓存)。</p><h4>2.3 已确认 BUG:SDK 31-33 路径 Thread* 参数错传</h4><h5>2.3.1 完整汇编上下文</h5><p><code>art_method_set_native_entry</code> 内 SDK &gt; 30 分支调 <code>ClassLinker::RegisterNative</code> 的完整指令序列(IDA MCP 实读 <code>sub_A4C80</code> 在 <code>0x0a5224..0x0a5254</code> 区段):</p><pre><code>;; libhunter.so, sub_A4C80 内部
0x0a5224  ADRL X1, aZn3art6thread1           ; "_ZN3art6Thread14CurrentFromGdbEv"
0x0a522c  BL   sub_1A82D4                    ; libart_dlsym(libart_path, "..CurrentFromGdb..")
0x0a5230  MOV  X21, X0                       ; X21 ← libart_dlsym 返回值 = 函数指针,未调用
0x0a5234  ADD  X0, SP, #0x1B0+var_170
0x0a5238  BL   std::string::~string()        ; 析构 dlsym 调用用的临时 std::string
0x0a523c  CBZ  X21, loc_A5278                ; null 检查
0x0a5240  BL   sub_A3CCC                     ; get_art_class_linker;X0 ← class_linker
0x0a5244  CBZ  X0,  loc_A5624                ; class_linker null 检查
0x0a5248  LDP  X2, X3, [SP,#0x1B0+var_188]   ; X2 ← art_method,X3 ← fnPtr(从栈上一次性 LDP)
0x0a524c  MOV  X1, X21                       ; X1 ← CurrentFromGdb 函数指针(本应是 Thread*)
0x0a5250  LDR  X8, [SP,#0x1B0+var_190]       ; X8 ← g_art_RegisterNative_fn(从栈上加载缓存)
0x0a5254  BLR  X8                            ; ClassLinker::RegisterNative(
                                             ;     X0=class_linker,
                                             ;     X1=函数指针冒充 Thread*,
                                             ;     X2=art_method,
                                             ;     X3=fnPtr)</code></pre><p>12 条指令直接从 IDA MCP 实读拷贝,X1 错传由 <code>0x0a524c MOV X1, X21</code> 直接证明 —— X21 来源是 <code>0x0a522c BL libart_dlsym</code> 的返回值,中间只经过 <code>MOV X21, X0</code> (<code>0x0a5230</code>)和 null 检查(<code>0x0a523c</code>),<strong>从未被调用</strong>,直接作为实参传给了 <code>ClassLinker::RegisterNative</code> 的第二个参数槽位。</p><p>X2/X3 是从栈上一次性 <code>LDP</code> 拿到的(<code>art_method</code> 、 <code>fnPtr</code>,在函数早期被存进栈),X8(<code>RegisterNative</code> 函数指针缓存)也是从栈上 <code>LDR</code> 拿到的。X0 = class_linker 直接来自上一条 <code>BL sub_A3CCC</code> 的返回。 <strong>4 个参数装载位置全部可见</strong> 。</p><h5>2.3.2 BUG 性质分析</h5><p><code>ClassLinker::RegisterNative(this, Thread *self, ArtMethod *method, const void *native)</code> 的第二个参数语义是* <em>当前线程的 `Thread</em> <code>对象**,需要通过调用</code> Thread::CurrentFromGdb() <code>拿到 —— 这是 ART 内部的 ThreadLocal 访问器,无参 → 返回</code> Thread*`。</p><p>按 §2.3.1 的反汇编:<code>0x0a5230 MOV X21, X0</code> 把 <code>libart_dlsym</code> 返回的函数指针存到 X21,之后 <strong>没有 <code>BLR X21</code> 这一步</strong> (它本应把函数指针当函数调一次,把返回值即真正的 <code>Thread*</code> 重新放入 X0),直接在 <code>0x0a524c MOV X1, X21</code> 把 X21(仍是函数指针)装入实参槽位。</p><p>最终 <code>0x0a5254 BLR X8</code> 调用 <code>ClassLinker::RegisterNative</code> 时,X1 是一个指向 <code>libart.so .text</code> 段的函数指针,而 callee 期望它指向堆上的 <code>art::Thread</code> 对象。Android 12+ 上一旦实际进入这个分支,可以确定的是 ART 内部函数会收到错误的 <code>self</code> 实参；后续影响取决于 <code>ClassLinker::RegisterNative</code> 在对应 Android 版本中的具体实现:</p><ul><li>如果 <code>ClassLinker::RegisterNative</code> 内部解引用 <code>self</code> 字段,例如读取 ThreadId/StateAndFlags、访问 TLS/锁/状态字段,就会把 <code>libart.so .text</code> 中的函数地址误当作 <code>art::Thread</code> 对象使用,可能立即崩溃,也可能在后续校验或状态更新中表现为 ART 状态异常。</li><li>如果该路径暂时只传递或记录 <code>self</code> 而不立即读写字段,静态证据仍只能证明错误 <code>Thread*</code> 被传入 ART 内部函数；是否延迟触发崩溃或状态异常,需要对应 Android 版本的 <code>ClassLinker::RegisterNative</code> 实现或运行时复现来确认。</li></ul><h5>2.3.3 与"SDK &gt; 33 显式禁用"的一致性</h5><p>这与 §2.2 <code>art_register_natives_batch</code> 入口处的 <code>if (get_sdk_level() &gt; 33) return false</code> 形成一致解释:作者发现新 Android(14+)走此路径不稳,在批量入口直接挡掉,<strong>但 SDK 31-33 区间仍会进入此分支</strong> —— 没补的实现仍带 bug。</p><p>实测设备 SDK=35,走的是 batch return false → 回落到 <code>env-&gt;RegisterNatives</code> 路径,所以本设备没踩到 bug,但代码层面 BUG 还在。 <code>verify_register_natives.js</code> 在 libart 的 <code>RegisterNatives</code> 入口落 hook 间接印证 SDK=35 回落路径生效。</p><h4>2.4 动态证据:60 项表运行时枚举</h4><p>直接读 <code>libhunter.so + 0x2EF1F0</code> 处的 <code>JNINativeMethod</code> 表:</p><pre><code data-lang="js" class="language-js">const NATIVE_METHODS_TABLE = 0x2EF1F0;
const COUNT = 60;
const ENTRY_SIZE = 24;                   // sizeof(JNINativeMethod) on arm64
for (let i = 0; i &lt; COUNT; i++) {
    const entry = base.add(NATIVE_METHODS_TABLE + i * ENTRY_SIZE);
    const namePtr = entry.readPointer();
    const sigPtr  = entry.add(8).readPointer();
    const fnPtr   = entry.add(16).readPointer();
    const name = namePtr.readCString();
    const sig  = sigPtr.readCString();
    console.log(`#${i} ${name} ${sig} rva=${fnPtr.sub(base)}`);
}</code></pre><p>实测输出关键行(完整 25 个 detection):</p><pre><code>#02  getZhenxiInfo5             (Landroid/content/Context;)Lcom/zhenxi/hunter/bean/ListItemBean;  rva=0x2a4760
#13  getZhenxiInfo3             ()Lcom/zhenxi/hunter/bean/ListItemBean;                           rva=0x2b476c
#25  getZhenxiLoctionCrc        ()Ljava/util/HashMap;                                             rva=0x2ae064
#45  getZhenxiMapCheck          ()Lcom/zhenxi/hunter/bean/ListItemBean;                           rva=0x291858
#50  checkRiskFile              ()Lcom/zhenxi/hunter/bean/ListItemBean;                           rva=0x2ac514
#53  CheckVpn                   ()Lcom/zhenxi/hunter/bean/ListItemBean;                           rva=0x2aaf44
#56  checkRootFromAVCLog        ()Lcom/zhenxi/hunter/bean/ListItemBean;                           rva=0x2aae54
#59  SideChanne                 ()Ljava/lang/String;                                              rva=0x2b3bd4
... (其余 detection 见 §1.1)</code></pre><h4>2.5 静态/动态交叉验证</h4><table><thead><tr><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td><code>off_2EF1F0</code> 起 60 项 <code>JNINativeMethod</code> 表</td><td>运行时枚举 60 项全部解析成功</td><td>✓</td></tr><tr><td>每项 24 字节 <code>{name*, sig*, fn*}</code></td><td>60 项 name/sig 都是合法字符串,fn 都在 libhunter 范围内</td><td>✓</td></tr><tr><td><code>getZhenxiInfo5</code> 是 idx=2</td><td>实测 #02 = <code>getZhenxiInfo5</code></td><td>✓</td></tr><tr><td><code>getZhenxiLoctionCrc</code> 是 idx=25,RVA=0x2AE064</td><td>实测 #25 = <code>getZhenxiLoctionCrc rva=0x2ae064</code></td><td>✓</td></tr><tr><td><code>CheckVpn</code> 是 idx=53</td><td>实测 #53 = <code>CheckVpn</code></td><td>✓</td></tr><tr><td><code>getZhenxiInfoH</code> 不通过 batch 注册</td><td>实测 60 项表无 <code>getZhenxiInfoH</code> 条目</td><td>✓(反常发现)</td></tr><tr><td>SDK &gt; 33 路径回落 RegisterNatives</td><td>hook libart <code>RegisterNatives</code> 可看到 hunter 注册(SDK=35 环境)</td><td>间接 ✓</td></tr></tbody></table><p><code>verify_register_natives.js</code> 在 libart <code>RegisterNatives</code> 入口落 hook 也确认了:SDK=35 环境下 hunter 的注册走标准 RegisterNatives 路径( SDK &gt; 33 时 art_register_natives_batch 在入口处返回 false，上层因此 fallback 到标准 env-&gt;RegisterNatives 注册路径)。</p><h4>2.6 bypass 依据</h4><p>在 SO 层直接 <code>Interceptor.replace</code> 25 个 detection 入口:</p><pre><code data-lang="js" class="language-js">const cb = new NativeCallback(function () {
    return ptr(0);                              // 返回 NULL jobject
}, 'pointer', ['pointer', 'pointer']);
Interceptor.replace(methods['getZhenxiInfo3'].fn, cb);</code></pre><p>实测 25 个 detection 全部 replace 成功:</p><pre><code>[null] getZhenxiInfo3             rva=0x2b476c
[null] getZhenxiInfo4             rva=0x2a2d98
[null] getZhenxiInfo5             rva=0x2a4760
... (共 25 行)
[null] checkZygisk                rva=0x2a93f8
[crc]  getZhenxiLoctionCrc        rva=0x2ae064
[+] native bypass installed: 25 ok, 1 missing</code></pre><p><code>1 missing</code> 是 <code>getZhenxiInfoH</code> —— 实测验证了它不在 batch 表里的静态结论。Java 层补 <code>NativeEngine.getZhenxiInfoH</code> 拦截兜底。</p><hr><h3>3. 安全 syscall 跳板:借 linker SVC 绕开 libc 监控</h3><h4>3.1 链路</h4><pre><code>safe_syscall_via_trampoline(sysno, ...)             @ 0x248cc4
  ├─ use_secure_syscall_trampoline_enabled()        @ 0x1b2288   总开关
  ├─ InitSecureTrampolinePage()                     @ 0x1b22c0   惰性 init, mutex 保护
  │     ├─ FindLinkerSyscallAddr("/linker64", 93)   @ 0x1b1c9c
  │     │     在 linker64 r-x 段扫指纹序列
  │     │     返回 SVC #0 那一条指令的地址(不是 stub 入口!)
  │     ├─ mmap RWX → 拷 48B 模板 → mprotect R-X
  │     └─ NEON 算 baseline checksum → ctx[+0x28]
  ├─ get_trampoline_id_tag()                        @ 0x1b21b4
  │     从 0x2F09E8 处读 std::string "runtime_syscall_code"
  ├─ calc_additive_checksum(page, 48)               @ 0x261f14
  │     NEON 字节累加和,与 ctx[+0x28] 基准比对;失配重建,再失配 exit(9)
  └─ ((fn)page)(sysno, a1..a6)                       跳板执行 → linker64 内裸 SVC #0</code></pre><h4>3.2 静态证据</h4><h5>3.2.1 48 字节跳板模板</h5><p><code>secure_syscall_trampoline_template{,_q1,_q2}</code> 在 <code>.rodata</code> @ <code>0x651FC..0x6522C</code>,字节级解读:</p><pre><code>fd 7b be a9   STP   X29, X30, [SP,#-0x20]!         ; 入栈
e8 03 00 aa   MOV   X8,  X0                        ; X8 = sysno(C 调用者把 sysno 当首参)
e0 03 01 aa   MOV   X0,  X1                        ; 参数左移一格
e1 03 02 aa   MOV   X1,  X2
e2 03 03 aa   MOV   X2,  X3
e3 03 04 aa   MOV   X3,  X4
e4 03 05 aa   MOV   X4,  X5
e5 03 06 aa   MOV   X5,  X6
91 00 00 58   LDR   X17, [PC,#+0x10]               ; 读 page+0x30 处的 SVC #0 地址
20 02 3f d6   BLR   X17                            ; 跳 linker64 内裸 SVC #0
fd 7b c2 a8   LDP   X29, X30, [SP],#0x20           ; 收尾
c0 03 5f d6   RET
[+0x30: .quad &lt;linker SVC#0 addr&gt;]                 ; 由 InitSecureTrampolinePage 填</code></pre><h5>3.2.2 FindLinkerSyscallAddr 指纹序列</h5><p>这一步的目的不是调用 <code>linker64</code> 的某个完整函数,而是从 <code>linker64</code> 的可执行段里找到一条现成的 <code>SVC #0</code> 指令。ARM64 Linux syscall 的约定是:</p><pre><code>X8     = syscall number
X0-X5  = syscall 参数
SVC #0 = 进入内核执行 syscall</code></pre><p>Hunter 自己的跳板页已经先把调用者传入的 <code>sysno</code> 放进 <code>X8</code>,并把后续参数顺移到 <code>X0-X5</code>:</p><pre><code>safe_syscall_via_trampoline(sysno, a1, a2, a3, a4, a5, a6)
  -&gt; X8 = sysno
  -&gt; X0 = a1, X1 = a2, X2 = a3, ...
  -&gt; BLR &lt;linker64 内的 SVC #0 地址&gt;</code></pre><p>因此 <code>FindLinkerSyscallAddr</code> 只需要找一个可信的 <code>SVC #0</code> 地址。它在 <code>/proc/self/maps</code> 中筛 pathname 含 <code>/linker64</code> 、权限 r-x 的段,在该.text 内 4 字节步进扫描,匹配 bionic syscall stub 的标准展开:</p><table><thead><tr><th>偏移(相对 n12)</th><th>字节模式 / 等价反汇编</th></tr></thead><tbody><tr><td><code>n12-12</code></td><td><code>MOVZ/MOVN W8, #imm</code>,要求 <code>imm == 93</code> (mask <code>(v11 &amp; 0x1F80001F) == 0x12800008</code> 锁定 Rd=W8)</td></tr><tr><td><code>n12-8</code></td><td><code>0xD4000001</code> = <code>SVC #0</code></td></tr><tr><td><code>n12-4</code></td><td><code>0xB140041F</code> = <code>CMN X0, #0x1000</code></td></tr><tr><td><code>n12+0</code></td><td><code>0xDA809400</code> = <code>CSINV X0, X0, X0, LS</code></td></tr><tr><td><code>n12+4</code></td><td>与 <code>0xFF000010</code> 与后 <code>== 0x54000000</code> —— <code>B.cond</code></td></tr><tr><td><code>n12+8</code></td><td><code>0xD65F03C0</code> = <code>RET</code></td></tr></tbody></table><p>匹配后 <strong>返回 <code>start + (n12-8)</code>,即 SVC #0 那一条指令的地址</strong>,而非 <code>MOV W8</code> 的 stub 入口。</p><p>为什么返回 SVC 而非 stub 入口:跳板自己已经把 <code>X8</code> 设为调用者指定的 syscall number。例如 <code>safe_syscall_via_trampoline(56, ...)</code> 进入跳板后,<code>X8=56</code>,表示要执行 <code>openat</code> 。如果跳到 stub 入口的 <code>MOVZ W8, #93</code>,刚设置好的 <code>X8=56</code> 会被覆盖成 <code>93</code>,调用就会变成 <code>exit</code> 。直接跳到下一条 <code>SVC #0</code>,才能保留 Hunter 自己设置的 <code>X8</code>,借用 linker 这条 SVC 指令发起任意 syscall。</p><p>返回链也依赖这个 stub 后半段。跳板页用 <code>BLR X17</code> 跳到 <code>SVC #0</code>,所以 <code>LR/X30</code> 被设置为跳板页中 <code>BLR X17</code> 的下一条指令。内核完成 syscall 后,用户态继续从 <code>SVC #0</code> 后面的 <code>CMN/CSINV/B.cond/RET</code> 执行；最后 linker stub 的 <code>RET</code> 使用这个 <code>LR/X30</code> 返回到 Hunter 跳板页,跳板页再恢复栈帧并 <code>RET</code> 回调用者。</p><p>为什么用 sysno=93:<code>93 = SYS_exit</code> (ARM64 Linux)。本环境 linker64 中存在匹配该 sysno 的标准 syscall stub,Hunter 选择它作为 SVC 指令定位锚；跨 Android / bionic 版本是否始终稳定,应以目标系统 linker64 实测扫描为准。</p><h5>3.2.3 g_secure_trampoline_ctx 结构</h5><table><thead><tr><th>偏移</th><th>字段</th><th>写入处</th><th>读取处</th></tr></thead><tbody><tr><td><code>+0x00</code></td><td><code>void *page</code></td><td><code>InitSecureTrampolinePage</code> mmap 返回</td><td><code>safe_syscall_via_trampoline</code> <code>*v3</code></td></tr><tr><td><code>+0x08</code></td><td><code>size_t length = 48</code></td><td><code>*(_QWORD *)(v46 + 8) = 48</code></td><td><code>v3[1]</code></td></tr><tr><td><code>+0x10</code></td><td><code>std::string id_tag</code></td><td><code>std::string::operator=(v47, v52)</code></td><td><code>v3 + 2</code></td></tr><tr><td><code>+0x28</code></td><td><code>uint64_t baseline_sum</code></td><td><code>*(_QWORD *)(g_secure_trampoline_ctx + 40) = v39</code></td><td><code>v3[5]</code></td></tr><tr><td><code>+0x30</code></td><td><code>uint8_t initialized = 1</code></td><td><code>*(_BYTE *)(g_secure_trampoline_ctx + 48) = 1</code></td><td>—</td></tr></tbody></table><h5>3.2.4 id_tag 字符串溯源</h5><p>字面量在 <code>0x5dd44</code>,全局构造器 <code>sub_1B3088 @ 0x1b3088</code> 通过:</p><pre><code data-lang="c" class="language-c">strcpy(&amp;dest_@0x2F09E8, "(runtime_syscall_code");</code></pre><p>写入全局 <code>dest_</code> (即 <code>xmmword_2F09E8</code> / <code>src_0</code> 一对地址,对应 <code>get_trampoline_id_tag</code> 读源)。 <strong>首字符 <code>(</code> (0x28) 不是真字符</strong>,而是 libc++ SSO 控制字节:低位 0 标记 SSO 模式,高 7 位 <code>0x14 = 20</code> 即字符串长度。作者把 22 字节(header + 20 字符 + <code>\0</code>)预编译成一个 C 字符串,strcpy 一次落地一个合法 std::string。</p><h4>3.3 动态证据</h4><h5>3.3.1 被动取证(verify_4_5_passive.js)</h5><p><code>verify_4_5_passive.js</code> 只挂 <code>InitSecureTrampolinePage</code> onLeave,单次取证后即刻 detach。运行后 ctx 字段实测值:</p><table><thead><tr><th>字段</th><th>实测值</th><th>静态推断</th></tr></thead><tbody><tr><td><code>ctx</code> 指针</td><td><code>0xb40000752359c1b0</code> (arena 分配,带 MTE tag)</td><td>—</td></tr><tr><td><code>ctx[+0x00] page</code></td><td><code>0x773e804000</code></td><td>与 <code>.rodata</code> 模板起始地址匹配位置 ✓</td></tr><tr><td><code>ctx[+0x08] length</code></td><td><code>48</code></td><td>✓</td></tr><tr><td><code>ctx[+0x10] id_tag</code></td><td><code>"runtime_syscall_code"</code> (20 字节,libc++ SSO)</td><td>字面值首次确认 ✓</td></tr><tr><td><code>ctx[+0x28] baseline_sum</code></td><td><code>0x14E0</code></td><td>与 JS 端朴素累加结果一致 ✓</td></tr><tr><td><code>ctx[+0x30] initialized</code></td><td><code>1</code> (byte)</td><td>✓</td></tr><tr><td>page 权限</td><td><code>r-x</code></td><td>✓</td></tr><tr><td>page 首 48B 与 <code>.rodata</code> 模板逐字节对比</td><td>100% 一致</td><td>✓</td></tr><tr><td><code>page[+0x30]</code> 缓存 SVC 地址</td><td><code>0x7741a00694</code></td><td>—</td></tr></tbody></table><h5>3.3.2 page[+0x30] 反查 linker stub</h5><p>用缓存地址被动重建 §3.2.2 的指纹序列:</p><table><thead><tr><th>偏移</th><th>实测指令</th><th>期望</th></tr></thead><tbody><tr><td><code>@stub-4</code></td><td><code>0xd2800ba8</code> = <code>MOVZ W8, #93, LSL #0</code></td><td><code>MOVZ/MOVN W8, #93</code> ✓</td></tr><tr><td><code>@stub</code></td><td><code>0xd4000001</code> = <code>SVC #0</code></td><td><code>0xD4000001</code> ✓</td></tr><tr><td><code>@stub+4</code></td><td><code>0xb140041f</code> = <code>CMN X0, #0x1000</code></td><td><code>0xB140041F</code> ✓</td></tr><tr><td>所在段</td><td><code>0x77419ee000-0x7741b0e000 r-x /apex/com.android.runtime/bin/linker64</code></td><td>r-x ✓</td></tr></tbody></table><h5>3.3.3 累加和自检三向一致</h5><pre><code>calc_additive_checksum(page=0x773e804000, len=48)  →  0x14E0  (静态推算)
Frida JS 脚本在运行时读取 page 前 48B 后做朴素 byte sum → 0x14E0  (动态)
ctx[+0x28] baseline_sum 字段                       →  0x14E0  (ctx 读取)</code></pre><p>三处一致 ✓。</p><h5>3.3.4 调用面分布(verify_4_5_7_call_surface_v2.js,30s 采样)</h5><p>为不触发 hunter 自检,v2 脚本只在 <code>/apex/.../linker64</code> 内的 SVC #0(由 <code>ctx.page[+0x30]</code> 缓存的地址)落观察点,LR 严格等于 <code>ctx.page + 0x28</code> 才计入。共 <strong>5300+ 次</strong> 跳板调用样本:</p><table><thead><tr><th>sysno</th><th>名称</th><th>静态 callsite 数</th><th>静态 %</th><th>运行时次数</th><th>运行时 %</th></tr></thead><tbody><tr><td>78</td><td><code>readlinkat</code></td><td>6</td><td>4.9%</td><td><strong>4251</strong></td><td><strong>80.2%</strong></td></tr><tr><td>56</td><td><code>openat</code></td><td>2</td><td>1.6%</td><td>461</td><td>8.7%</td></tr><tr><td>57</td><td><code>close</code></td><td>1</td><td>—</td><td>456</td><td>8.6%</td></tr><tr><td>63</td><td><code>read</code></td><td>1</td><td>—</td><td>76</td><td>1.4%</td></tr><tr><td>207</td><td><code>recvfrom</code></td><td>1</td><td>—</td><td>28</td><td>0.5%</td></tr><tr><td>62</td><td><code>lseek</code></td><td>1</td><td>—</td><td>12</td><td>0.2%</td></tr><tr><td>101</td><td><code>nanosleep</code></td><td>1</td><td>—</td><td>12</td><td>0.2%</td></tr><tr><td>43</td><td><code>statfs</code></td><td>2</td><td>1.6%</td><td>2</td><td>0.04%</td></tr><tr><td>80</td><td><code>fstat</code></td><td>1</td><td>—</td><td>1</td><td>0.02%</td></tr><tr><td>160</td><td><code>uname</code></td><td>1</td><td>—</td><td>1</td><td>0.02%</td></tr><tr><td>129</td><td><strong><code>kill</code></strong></td><td><strong>102</strong></td><td><strong>83.6%</strong></td><td><strong>0</strong></td><td><strong>0%</strong></td></tr><tr><td>167</td><td><code>prctl</code></td><td>1</td><td>—</td><td>0</td><td>—</td></tr><tr><td>9</td><td><code>lgetxattr</code></td><td>1</td><td>—</td><td>0</td><td>—</td></tr><tr><td>462</td><td><code>mseal</code></td><td>1</td><td>—</td><td>0</td><td>—</td></tr></tbody></table><h4>3.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>S1</td><td>跳板页 48 字节</td><td>ctx[+0x08]=48,且 page 首 48B 与 <code>.rodata</code> 模板一致</td><td>✓</td></tr><tr><td>S2</td><td>id_tag 字符串 <code>"runtime_syscall_code"</code></td><td>ctx[+0x10] SSO 解码 = 字符串字面值</td><td>✓</td></tr><tr><td>S3</td><td>id_tag SSO 控制字节首字 <code>0x28</code> (长度 20)</td><td>静态 <code>strcpy(...,"(runtime_syscall_code")</code> + ctx 实读</td><td>✓</td></tr><tr><td>S4</td><td>baseline = NEON byte sum(48B)</td><td>静态推算 / JS 朴素累加 / ctx 字段三向一致 = 0x14E0</td><td>✓</td></tr><tr><td>S5</td><td><code>page[+0x30]</code> 保存 linker64 SVC #0 地址</td><td>实测 0x7741a00694,落在 <code>linker64</code> r-x 段</td><td>✓</td></tr><tr><td>S6</td><td>该地址前一条 = <code>MOVZ W8, #93</code></td><td>实测 <code>@stub-4 = 0xd2800ba8 = MOVZ W8,#93</code></td><td>✓</td></tr><tr><td>S7</td><td>sysno 静态分布 <code>kill</code> 占 83.6%</td><td>运行时 <code>kill</code> 0%(检测路径未失败,自杀分支未触发)</td><td>结构性错位 ✓</td></tr><tr><td>S8</td><td>sysno 运行时主稳态:readlinkat + openat + close</td><td>三者占运行时 97.5%</td><td>✓</td></tr><tr><td>S9</td><td><code>recvfrom(sockfd, buf, 0x2000, 0, NULL, NULL)</code></td><td>sockfd=197 / len=8192 / flags=0,28 次</td><td>✓</td></tr><tr><td>S10</td><td><code>anti_ptrace_poll_loop</code> 用 <code>nanosleep</code> 节拍</td><td>12 次,间隔规整</td><td>✓</td></tr><tr><td>S11</td><td><code>statfs("/system") / statfs("/vendor")</code></td><td>实测 statfs 路径完全对得上</td><td>✓</td></tr><tr><td>S12</td><td><code>readlinkat</code> 用于 fd → 路径解析</td><td>80.2%,样本均为 <code>/proc/.../fd/&lt;N&gt;</code></td><td>✓</td></tr></tbody></table><h4>3.5 静态 vs 运行时分布解读</h4><p>静态 callsite 数与运行时调用数 <strong>测量的是两件不同的事</strong>:</p><ul><li><strong>静态 callsite 数</strong>:hunter 代码里 <strong>可能触发</strong> 该 sysno 的代码位置数量。 <code>kill</code> 有 102 个 callsite,因为每条检测路径的失败分支都各写一次 SIGKILL —— 这只代表"分散冗余",不代表频繁</li><li><strong>运行时命中数</strong>:在 <strong>当前(检测未触发、无 Frida 异常告警)</strong> 这种"clean 路径"下,hunter 实际跑过的 syscall 流量分布</li></ul><p>本轮 <code>kill</code> 0 次说明当前观察窗口内没有进入 SIGKILL 分支。结合 Frida 线程扫描返回 0、ReportRiskItem 未出现 Frida 命中,可作为"本轮未被 Frida 自杀分支识别"的辅助证据；但不能单独证明所有 SIGKILL 路径均不可达。</p><p>未观察到的 4 个 sysno 各有原因:</p><table><thead><tr><th>sysno</th><th>未触发的原因</th></tr></thead><tbody><tr><td><code>kill (129)</code></td><td>本轮检测路径未进入自杀分支；只能说明当前触发条件/观察窗口下未命中 kill 路径</td></tr><tr><td><code>prctl (167) option=31</code></td><td>极大概率在 <code>.init_array</code> 阶段就执行完了,运行时观察窗口起点已晚于它</td></tr><tr><td><code>mseal (462)</code></td><td>同上,一次性硬化保护,运行时不重复</td></tr><tr><td><code>lgetxattr (9)</code></td><td>路径 <code>"security.selinux"</code> 的 SELinux 标签读取,与具体被检测文件触发条件挂钩</td></tr></tbody></table><h4>3.6 命名 syscall 包装器</h4><p><code>0x1AFE4C..0x1AFEF8</code> 一组 7 个小函数(0x18~0x24 字节),每个把固定 sysno 转发到 <code>safe_syscall_via_trampoline</code>,等价于"安全版 libc 子集":</p><table><thead><tr><th>包装器</th><th>地址</th><th>sysno</th><th>等价</th></tr></thead><tbody><tr><td><code>ssyscall_openat</code></td><td><code>0x1afe4c</code></td><td>56</td><td><code>openat(dirfd, path, flags, mode)</code></td></tr><tr><td><code>ssyscall_openat_atfdcwd</code></td><td><code>0x1afe70</code></td><td>56</td><td><code>openat(AT_FDCWD=-100, path, flags, mode)</code></td></tr><tr><td><code>ssyscall_read</code></td><td><code>0x1afe94</code></td><td>63</td><td><code>read(fd, buf, count)</code></td></tr><tr><td><code>ssyscall_lseek</code></td><td><code>0x1afeac</code></td><td>62</td><td><code>lseek(fd, offset, whence)</code></td></tr><tr><td><code>ssyscall_close</code></td><td><code>0x1afec4</code></td><td>57</td><td><code>close(fd)</code></td></tr><tr><td><code>ssyscall_nanosleep</code></td><td><code>0x1afedc</code></td><td>101</td><td><code>nanosleep(req, rem)</code></td></tr><tr><td><code>ssyscall_readlinkat</code></td><td><code>0x1afef8</code></td><td>78</td><td><code>readlinkat(dirfd, path, buf, sz)</code></td></tr></tbody></table><p>后续 detection 中大量敏感文件读取会走这 7 个 ssyscall 包装器,尤其是 <code>openat/read/lseek/close/readlinkat</code> 组合；但并非所有 <code>/proc</code> 、maps、进程枚举和命令输出路径都走跳板。完整 I/O 监控需要同时覆盖跳板、libc/stdio、 <code>popen</code> 、 <code>opendir/readdir</code> 等路径。</p><h4>3.7 对抗效果总结</h4><table><thead><tr><th>对抗目标</th><th>跳板路径如何破坏</th></tr></thead><tbody><tr><td><code>Interceptor.attach(Module.findExportByName('libc.so', 'syscall'))</code></td><td>完全不调用 <code>libc::syscall</code>,Hook 永不触发</td></tr><tr><td>对具名 syscall 包装(<code>openat</code> / <code>read</code> / <code>getdents64</code> …)做 PLT/inline-hook</td><td>同上,直接走 linker 段内的裸 SVC</td></tr><tr><td>在 <code>safe_syscall_via_trampoline</code> / 跳板页头 16~20 字节做 inline-hook</td><td>每次调用前 <code>calc_additive_checksum</code> 重算 48B 累加和与 <code>baseline_sum</code> 比对,失配即重建,再失配 <code>exit(9)</code></td></tr><tr><td>重建跳板时假冒身份</td><td><code>get_trampoline_id_tag</code> 与 <code>ctx[+0x10]</code> 串比对,身份不符即销毁重建</td></tr><tr><td>在初始化阶段 hook <code>fopen</code> / <code>fgets</code> 干扰 maps 解析</td><td>时序上 hunter <code>JNI_OnLoad</code> 极早(Zygote 预加载阶段),通常先于第三方 hook 运行</td></tr></tbody></table><p>明显 <strong>不在</strong> 跳板列表里的:<code>write</code> 、 <code>mmap</code> 、 <code>mprotect</code> 、 <code>getdents64</code> 、 <code>newfstatat</code> (79)。这些路径要么走 libc(可被 hook 但不致命),要么内联在调用方。 <strong>做完整 syscall 监控不能只 hook 跳板入口</strong> 。</p><hr><h3>4. 风险项汇聚点 build_native_ListItemBean_risk</h3><h4>4.1 函数定位</h4><pre><code>libhunter.so+0x278658
size 0x8EC
被 22 个 caller 函数 × 83 个 callsite 调用</code></pre><p>该函数内部引用:</p><pre><code>com/zhenxi/hunter/bean/ListItemBean</code></pre><h4>4.2 静态证据:函数签名</h4><p>Hex-Rays 把 OLLVM 平坦化后的 <code>build_native_ListItemBean_risk</code> 错认为 1 参函数,真实签名 6 个参数(对每个 callsite 反汇编核对一致):</p><pre><code data-lang="c" class="language-c">void build_native_ListItemBean_risk(
    JNIEnv*       env,          // X0
    std::string*  title,        // X1 — 栈上 std::string,由 sub_2447A8(out, const char* lit) 构造
    std::string*  detail,       // X2 — 同 X1
    int           risk,         // W3 — 0 / 1
    int           Type,         // W4 — 1..4 类别
    int           ShowPriority  // W5 — 0..11 子优先级
);</code></pre><p><code>sub_2447A8</code> 的作用是 <code>std::string::__init_from_cstr(out, lit)</code> 。用 SSO/long 双形式自适应读法:</p><pre><code data-lang="js" class="language-js">function readStdString(p) {
    const firstByte = p.readU8();
    if ((firstByte &amp; 1) === 0) {                  // SSO 短串
        const size = firstByte &gt;&gt; 1;
        if (size &lt;= 0) return '';
        return p.add(1).readUtf8String(size);
    }
    const size = p.add(8).readU64().toNumber();   // long 形式
    const dataPtr = p.add(16).readPointer();
    return dataPtr.readUtf8String(size);
}</code></pre><h4>4.3 静态证据:W3 / W4 / W5 enum 分布</h4><p>83 个 callsite 全部静态扫一遍:</p><table><thead><tr><th>字段</th><th>实测分布</th><th>推断含义</th></tr></thead><tbody><tr><td><strong>W3</strong> (<code>risk</code>)</td><td><code>0</code> × 66(80%) / <code>1</code> × 17(20%)</td><td><code>isDeadly</code> boolean。 <code>1</code> 几乎只出现在严重路径:APK 签名失败 / Find Others Process / file lib error / Linker hooked+kill。但 <code>W3=0 ≠ 非高危</code> —— <code>InfoF</code> 的 <code>checkLibCheckSum</code> W3=0 但 UI 是 Deadly,说明 W3 不是 UI 的 risk 等级,而是 native 侧是否标记 deadly 上报</td></tr><tr><td><strong>W4</strong> (<code>Type</code>)</td><td><code>3</code> × 44 / <code>1</code> × 17 / <code>2</code> × 15 / <code>4</code> × 7</td><td>对应 Java 端 <code>FB.a/b/c/d</code> 类常量。 <code>1/4</code> 偏 Info,<code>2/3</code> 偏 Risk</td></tr><tr><td><strong>W5</strong> (<code>ShowPriority</code>)</td><td><code>0/1/3/4/6/7/8/9/10/11</code> 都有</td><td>detection 子类别 ID,与 caller 强相关</td></tr></tbody></table><p>W5 子类别归纳(从 caller × W5 推):</p><table><thead><tr><th>W5</th><th>类别</th><th>主要 caller</th></tr></thead><tbody><tr><td>0</td><td>misc / 杂项</td><td><code>CheckVpn</code>, <code>MPNI</code>, <code>checkFromZygote</code>, <code>Env</code>, <code>MapCheck</code>, <code>Base</code> 部分</td></tr><tr><td>1</td><td>Root mount</td><td><code>Info3</code>, <code>checkRootFromAVCLog</code></td></tr><tr><td>3</td><td>APK 签名 / Maps Hide / Base 检测</td><td><code>Info2</code>, <code>sub_2A1C38</code>, <code>Base</code> 部分</td></tr><tr><td>4</td><td>Process / File lib / Binder</td><td><code>Info4</code>, <code>Info0</code>, <code>CBinder</code>, <code>VV</code></td></tr><tr><td>6</td><td>Library checksum</td><td><code>InfoF</code></td></tr><tr><td>7</td><td><code>Info7</code></td><td><code>Info7</code></td></tr><tr><td>8</td><td>Frida 检测</td><td><code>Info5</code> (gum-js-loop / gmain)</td></tr><tr><td>9</td><td><code>Info6</code></td><td><code>Info6</code></td></tr><tr><td>10</td><td>Linker hook / Risk file</td><td><code>InfoL</code>, <code>checkRiskFile</code></td></tr><tr><td>11</td><td>Simulator 检测</td><td><code>InfoO</code></td></tr></tbody></table><p><code>InfoBase</code> 19 callsite 跨多个 W5,因为它是"全家桶":Linker Hook / Magisk / Mount / Seccomp / Signal / Uname 等多类检测打包在一个 JNI 入口里。</p><h4>4.4 静态证据:22 caller × 83 callsite 完整字典</h4><p>每条 callsite 的 title/detail 字符串候选源自该 callsite <strong>前 ≤80 条</strong> 指令内的 <code>ADRL/ADR → C 字符串</code> 。粗体为最可能的 title;<code>&lt;dyn&gt;</code> 表示纯动态拼接:</p><table><thead><tr><th>Caller</th><th>callsite</th><th>(W3, W4, W5)</th><th>关键字面量</th></tr></thead><tbody><tr><td><code>CheckVpn</code></td><td><code>0x2ab014</code></td><td>(0, 1, 0)</td><td>"tun" "ppp" "pptp" <strong>"Find Vpn Native"</strong></td></tr><tr><td><code>checkFromZygote</code></td><td><code>0x2ac0f8</code></td><td>(0, 1, 0)</td><td><strong>"Zygote Check Find Risk Mark"</strong></td></tr><tr><td><code>checkRiskFile</code></td><td><code>0x2ace44</code></td><td>(1, 2, 10)</td><td><strong>"Find Risk File"</strong> + 25 条 <code>/data/local/tmp/*</code> 路径</td></tr><tr><td><code>checkRootFromAVCLog</code></td><td><code>0x2aaec4</code></td><td>(0, 1, 1)</td><td><strong>"Find Root File In Sniff"</strong></td></tr><tr><td><code>checkZygisk</code></td><td><code>0x2a9690</code></td><td>(0, 2, 0)</td><td><code>&lt;dyn&gt;</code></td></tr><tr><td><code>getZhenxiInfoCBinder</code></td><td><code>0x28cd08</code></td><td>(0, 3, 4)</td><td><strong>"find system server hook"</strong></td></tr><tr><td><code>getZhenxiInfoEnv</code></td><td><code>0x28d3a4</code></td><td>(0, 4, 0)</td><td><strong>"Get Env Info"</strong></td></tr><tr><td><code>getZhenxiInfoMPNI</code></td><td><code>0x2994f4</code></td><td>(0, 1, 0)</td><td>"/oat/arm64/" <strong>"Find Mark ELF"</strong></td></tr><tr><td><code>getZhenxiInfoVV</code></td><td><code>0x2c2854</code></td><td>(0, 3, 4)</td><td><code>&lt;dyn&gt;</code></td></tr><tr><td><code>getZhenxiInfo3</code> × 7</td><td><code>0x2b490c..0x2b4ed4</code></td><td>(0, 1, 1)</td><td>"Check Find Root In Linker" / <strong>"Check Find Root Permission"</strong> / <strong>"Find Root Mark In Mountinfo"</strong></td></tr><tr><td><code>getZhenxiInfo4</code> × 4</td><td><code>0x2a3f30..0x2a43f8</code></td><td>(0 或 1, 3 或 4, 4)</td><td><strong>"Find Others Process"</strong> + "find other process" + "ps error"</td></tr><tr><td><code>getZhenxiInfo5</code> × 3</td><td><code>0x2a47f4 / 0x2a5204 / 0x2a5470</code></td><td>(0, 2, 8)</td><td><strong>"Find Frida Mark"</strong> + "gum-js-loop" / "gmain" / <code>&lt;dyn&gt;</code></td></tr><tr><td><code>getZhenxiInfo6</code> × 2</td><td><code>0x2a6084 / 0x2a6294</code></td><td>(0 或 1, 2 或 3, 9)</td><td><code>&lt;dyn&gt;</code></td></tr><tr><td><code>getZhenxiInfo7</code> × 2</td><td><code>0x2a65ec / 0x2a662c</code></td><td>(0 或 1, 3, 7)</td><td><code>&lt;dyn&gt;</code></td></tr><tr><td><code>getZhenxiInfoF</code> × 8</td><td><code>0x2ada3c..0x2adf74</code></td><td>(0, 3 或 4, 6)</td><td><strong>"checkLibCheckSum"</strong> / <strong>"checkLinkerCheckSum"</strong></td></tr><tr><td><code>getZhenxiInfoL</code> × 2</td><td><code>0x2a87b8 / 0x2a91c8</code></td><td>(0 或 1, 3, 10)</td><td><strong>"Find Linker Is Hook"</strong> / <strong>"Check Linker Crc Error"</strong></td></tr><tr><td><code>getZhenxiInfoO</code> × 5</td><td><code>0x2bec24..0x2bf71c</code></td><td>(0, 2, 11)</td><td><strong>"Find Simulator OpCode Mark!"</strong> / <strong>"Find Simulator Env Mark!"</strong> / <strong>"Find Simulator Mount Mark!"</strong></td></tr><tr><td><code>getZhenxiInfo0</code> × 6</td><td><code>0x2c00d4..0x2c15d8</code></td><td>(0 或 1, 3, 3 或 4)</td><td>"Insufficient permissions" / <strong>"Check App Sign Error From Path Lib"</strong> / <strong>"Mem Find Mark"</strong></td></tr><tr><td><code>getZhenxiInfo2</code> × 11</td><td><code>0x29d6c0..0x2a0304</code></td><td>(0 或 1, 3, 3)</td><td><strong>"HunterCheckApkSignError"</strong> + 11 种子原因(详 §18)</td></tr><tr><td><code>getZhenxiInfoBase</code> × 19</td><td><code>0x292e18..0x2952a4</code></td><td>(0, 1/2/3, 多种)</td><td><strong>"Linker Find Hook Mark"</strong> + "lsposed" / "zygisk" / <strong>"Find Prop Modify Mark"</strong> / <strong>"Find Hook Mark"</strong> / <strong>"Base Check Inline Flag"</strong> / <strong>"Find Mnt Mark"</strong> / <strong>"Find Magisk Modules Mark"</strong> / <strong>"Seccomp Check Arch Find Mark"</strong> / <strong>"Check Signal Not Match"</strong> / <strong>"Check Uname Spoofing"</strong></td></tr><tr><td><code>getZhenxiMapCheck</code> × 3</td><td><code>0x2923e8 / 0x292434 / 0x2924b4</code></td><td>(0, 2 或 3, 0)</td><td><strong>"libart.so piecewise,memory is not legal"</strong> / <strong>"find libart.so hooked"</strong></td></tr><tr><td><code>sub_2A1C38</code> × 2</td><td><code>0x2a2c20 / 0x2a2c68</code></td><td>(0, 3, 3)</td><td><strong>"Check Maps Find Hide"</strong></td></tr></tbody></table><h4>4.5 动态证据:hook 0x278658 闭环输出</h4><p><code>js/hook_report_risk_precheck.js</code> 在 <code>0x278658</code> 落 hook:</p><pre><code data-lang="js" class="language-js">Interceptor.attach(base.add(0x278658), {
    onEnter: function (args) {
        this.title  = readStdString(args[1]);
        this.detail = readStdString(args[2]);
        this.lrOff  = this.context.lr.sub(base);
        console.log('[ReportRiskItem]');
        console.log('  arg1:', this.title);
        console.log('  arg2:', this.detail);
        console.log('ReportRiskItem  this-&gt;lr:', this.lrOff);
    }
});</code></pre><p>实测输出片段(<code>/proc/mounts</code> APatch 命中):</p><pre><code>[ReportRiskItem]
  arg1: Check Find Root In Mounts
  arg2: com.zhenxi.hunter:hunter_main_process
/proc/mounts-&gt;APatch /debug_ramdisk tmpfs rw,seclabel,relatime 0 0
ReportRiskItem this-&gt;lr: libhunter.so+0x2b4a88</code></pre><h4>4.6 静态/动态交叉验证(闭环操作)</h4><p><strong>对回方法</strong>:<code>this.context.lr - 4</code> = 静态 callsite 的精确 RVA(LR 是 <code>BL build_native_ListItemBean_risk</code> 之后下一条指令的地址,所以 <code>lr - 4</code> 即 callsite)。</p><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>C1</td><td>函数 size 0x8EC,被多 caller 调用</td><td>30s 实测打印 N 条 <code>[ReportRiskItem]</code> 来自不同 lr_offset</td><td>✓</td></tr><tr><td>C2</td><td>函数签名 6 参,X1/X2 是 std::string*</td><td>readStdString(args[1]) 拿到合法字符串("Check Find Root In Mounts" 等)</td><td>✓</td></tr><tr><td>C3</td><td>callsite <code>0x2b4a88-4 = 0x2b4a84</code> 位于 <code>getZhenxiInfo3 @ 0x2B476C</code> 内部</td><td>实测 lr=0x2b4a88,该 callsite 静态字面量含 "Check Find Root In Mounts"</td><td>✓</td></tr><tr><td>C4</td><td>callsite <code>0x2924b8</code> 位于 <code>getZhenxiMapCheck @ 0x291858</code> 内 size==0x1000 分支</td><td>实测 lr=0x2924b8,arg1="find libart.so hooked 0"</td><td>✓</td></tr><tr><td>C5</td><td>callsite <code>0x28d3a4</code> 位于 <code>getZhenxiInfoEnv @ 0x28CDB0</code> 内</td><td>实测 lr=0x28d3a8,arg1="Get Env Info"</td><td>✓</td></tr><tr><td>C6</td><td>callsite <code>0x2a3f6c</code> 位于 <code>getZhenxiInfo4 @ 0x2A2D98</code> 内</td><td>实测 lr=0x2a3f6c,arg1 含 "Find Others Process"</td><td>✓</td></tr><tr><td>C7</td><td>callsite <code>0x2ada40</code> 位于 <code>getZhenxiInfoF @ 0x2AD9A8</code> 内 checkLibCheckSum 分支</td><td>实测 lr=0x2ada40,arg1="检测到libart.so被修改"</td><td>✓</td></tr></tbody></table><p>闭环对回成功:每条 <code>[ReportRiskItem]</code> 输出都能通过 <code>lr - 4</code> 反查到 §4.4 字典里精确的 caller × callsite,且 <code>arg1</code> 命中静态候选字面量。 <code>arg2</code> 是动态上下文(具体路径/线程名/接口名),静态字典里没有,这部分实测最有取证价值。</p><h4>4.7 bypass 依据</h4><p>兜底拦截在 <code>0x278658</code> 入口按 title 名单丢弃:</p><pre><code data-lang="js" class="language-js">const BLOCK_TITLE_NEEDLES = [
    'Check Find Root',  'Find Root',
    'Find Others Process',
    'Find Frida Mark',
    'Find Vpn Native',
    'Find Risk File',
    'find libart.so hooked',
    'libart.so piecewise',
    'checkLibCheckSum',  'checkLinkerCheckSum',
    '检测到libart.so被修改', '检测到libc.so被修改', '检测到linker',
    'HunterCheckApkSignError',
    // ...
];
Interceptor.attach(base.add(0x278658), {
    onEnter(args) {
        this.title = readStdString(args[1]);
        this.block = BLOCK_TITLE_NEEDLES.some(n =&gt; this.title.indexOf(n) !== -1);
    },
    onLeave(retval) {
        if (this.block) retval.replace(ptr(0));
    }
});</code></pre><p>动态验证:开启 BLOCK 后 UI 端 risk 列表中对应 title 不再出现,印证"汇聚点拦截 = 22 caller × 83 callsite 全部消音"。</p><hr><h3>5. 完整性自检:模块 r-x 段 CRC 双链</h3><p>Hunter 对 <code>libart.so</code> / <code>libc.so</code> / <code>linker64</code> / <code>libhunter.so</code> 做运行时 r-x 段累加和自检,两条独立链路:</p><h4>5.1 链路总览</h4><pre><code>链路 1:Java 驱动的 CRC 比较
─────────────────────────────────────────────────────────────
Java: NativeEngine.getZhenxiLoctionCrc() : HashMap
  ↓ JNI
Java_NativeEngine_getZhenxiLoctionCrc @ 0x2AE064
  ↓
anti_inject_collect_results(rb_tree) @ 0xC8670
  ↓
sub_1A57DC: 红黑树 → Java HashMap (jstring path → jstring sum)
  ↓
Java YouAreLoser.ig.apply(rD{a=path, b=remote_crc}):
    local  = parseLong(hashMap.get(path))
    remote = item.b
    if (local != 0 &amp;&amp; remote != 0 &amp;&amp; local != remote)
        触发 ListItemBean("ISO CRC NOT MATCH LOCALITY CRC", ...)

链路 2:后台 task,不经 Java
─────────────────────────────────────────────────────────────
task_MAIN_CRC_check @ 0x2D6804
  ├─ check_libc_elf_checksum_status   @ 0xC90A0
  ├─ check_libart_elf_checksum_status @ 0xC9130
  └─ sub_C8FD0(libhunter_path)
       ↓
       ReportRiskItem("检测到libart.so被修改" / "检测到libc.so被修改" / 等, ...)</code></pre><p>两条链共享底层算法栈:</p><pre><code>scan_modules_for_path(path) @ 0xC8500
  ├─ parse_elf_rx_segments(s, path) @ 0xC6F14       ── ELF 文件 baseline
  │     ssyscall_openat / read / lseek / close 读 ELF
  │     遍历 PT_LOAD with PF_X,NEON sum 写入 s-&gt;segs[i].file_checksum
  │     结果写回 qword_2EF8B0 cache
  └─ scan_rx_segment_neon_sum(start, end, perms, s, path) @ 0xC772C   ── 内存侧实测
        for each segment:
            mem_ptr = start + offset
            maps_precheck_readable(mem_ptr, size) 先过
            NEON 128-bit 加宽累加该段所有字节
            v5 += 该段 sum</code></pre><h4>5.2 静态证据</h4><h5>5.2.1 NativeEngine_getZhenxiLoctionCrc 包装层</h5><pre><code data-lang="c" class="language-c">// libhunter.so+0x2AE064
jobject Java_NativeEngine_getZhenxiLoctionCrc(JNIEnv *env, jobject thiz) {
    anti_inject_collect_results(rb_tree);
    if (rb_tree[2])
        return convert_tree_to_HashMap(env, rb_tree);
    return NULL;
}</code></pre><p><code>anti_inject_collect_results @ 0xC8670</code> 拼 4 个目标路径(<code>build_libart_path</code> / <code>get_libc_path</code> / <code>get_linker64_path</code> / <code>std::string from xmmword_2F3C08</code>),每个路径调 <code>scan_modules_for_path(path) @ 0xC8500</code>,把结果 <code>std::to_string</code> 后存入 path → sum_str 红黑树。</p><h5>5.2.2 NEON 字节累加和算法</h5><p><code>scan_rx_segment_neon_sum</code> 与 <code>parse_elf_rx_segments</code> 共享同一段 NEON 字节累加和算法(也与 <code>InitSecureTrampolinePage</code> 内对跳板 48B 算 baseline 的算法完全一致):</p><pre><code>sum = 0
for each 16 bytes from ptr:
    vmovl_u8 / vmovl_high_u8 把 16 个 u8 拆成 8x u16,再拆成 4x u32
    8 个 u32 通道并行 vaddw 加进 8 个 u64 累加器
最后 vaddvq_s64 把 8 个 u64 累加器合并成单个 i64 → 返回该段总和</code></pre><p>这是 <strong>没有取模、没有移位、没有 lookup table 的纯 sum</strong>:<code>sum = Σ(byte)</code> 。</p><h5>5.2.3 parse_elf_rx_segments 输入/输出</h5><p>输入:模块路径。输出:struct <code>s</code>:</p><pre><code data-lang="c" class="language-c">struct ElfRxBaseline {
    int     n_segs;
    struct { u64 _; u64 offset; u64 _; u64 size; u64 _; u64 file_checksum; } segs[2];
    u8      ok_flag;
};</code></pre><p><code>file_checksum</code> 是 cache miss 时 <strong>当场 calloc + ssyscall_read ELF 文件 + 算和</strong> 得到的。 <strong>该 file_checksum 路径上</strong> 的文件读取走 §3.6 的 ssyscall 包装器,即使 hook libc 的 fopen/fread 也拦不到。</p><p>cache 容器 <code>qword_2EF8B0</code> 是 path → struct map,首次访问后被永久缓存(<code>sub_CACC0</code> 写、 <code>sub_CA670</code> 是 sentinel/init 检查)。</p><h5>5.2.4 scan_rx_segment_neon_sum 算法</h5><pre><code data-lang="c" class="language-c">// libhunter.so+0xC772C
uint32_t scan_rx_segment_neon_sum(uintptr_t start, uintptr_t end, char *perms, ElfRxBaseline *s, const char *path) {
    if (perms[0..3] != "r-x*")
        return 0;
    uint32_t v5 = 0;
    for (i = 0; i &lt; s-&gt;n_segs; i++) {
        uintptr_t mem_ptr = start + s-&gt;segs[i].offset;
        size_t    size    = s-&gt;segs[i].size;
        if (!maps_precheck_readable((void *)mem_ptr, size)) {
            v14 = 0;
        } else {
            v14 = NEON_sum(mem_ptr, size);
        }
        v5 += v14;
    }
    return v5;
}</code></pre><p>注意:<code>scan_rx_segment_neon_sum</code> <strong>不</strong> 在原地比较 <code>v14 == s-&gt;segs[i].file_checksum</code>;它只是把"运行时所有段 sum 之和"累加进 <code>v5</code> 返回。</p><p>也就是说,<strong>Java 侧拿到的 HashMap value = "整个模块所有 PF_X 段 runtime NEON sum 的总和"</strong>,真正的比对在 Java 侧的 <code>ig.apply</code> 。</p><h5>5.2.5 找 r-x 内存区间的两条路径</h5><p><code>scan_modules_for_path</code> 把 baseline <code>s</code> 套到内存上时,主备两条:</p><ul><li><strong>主路径</strong>:hunter 自实现 DSO 列表 <code>g_dso_list_head</code> (<code>sub_1AFF74</code> 用 <code>dl_iterate_phdr + getauxval(AT_PHDR)</code> 构建)</li><li><strong>备路径</strong>:<code>/proc/self/maps</code> (<code>parse_maps_to_linked_list(-1)</code>,走 libc <code>fopen</code> —— 这是整条链上唯一可被 libc-hook 干扰的环节)</li></ul><p>主路径未命中 → 退到备路径。这意味着仅 hook libc 让 <code>/proc/self/maps</code> 撒谎是不够的。</p><h5>5.2.6 Java 侧比较 YouAreLoser.ig.apply</h5><pre><code data-lang="java" class="language-java">// Java 伪代码(从 hook 行为反向还原)
Object apply(Object obj) {
    rD item = (rD) obj;
    String path     = item.a;
    long   remote   = item.b;
    long   local    = parseLong(nativeHashMap.get(path));
    if (local != 0 &amp;&amp; remote != 0 &amp;&amp; local != remote)
        triggerDetection();
    return hH.a;
}</code></pre><p>三条件全成立才报警 → 任一为 0 即跳过。</p><h4>5.3 动态证据</h4><h5>5.3.1 trace_crc_path_template.js 实测 libart.so 各段 checksum</h5><pre><code>[crc-collect] anti_inject_collect_results entered
[crc-module] scan_modules_for_path path=/apex/com.android.art/lib64/libart.so
[crc-elf] parse_elf_rx_segments path0=/apex/com.android.art/lib64/libart.so
[crc-rx] path=/apex/com.android.art/lib64/libart.so start=0x74716a0000 end=0x7471818000 size=0x178000 perms=r--p
[crc-rx] path=/apex/com.android.art/lib64/libart.so segmentChecksum=0 ret=0x0
[crc-rx] path=/apex/com.android.art/lib64/libart.so start=0x74718a0000 end=0x747205c000 size=0x7bc000 perms=r-xp
[crc-rx] path=/apex/com.android.art/lib64/libart.so segmentChecksum=846246994 ret=0x3270b452
[crc-rx] path=/apex/com.android.art/lib64/libart.so start=0x74720a0000 end=0x74720c5000 size=0x25000 perms=r--p
[crc-rx] path=/apex/com.android.art/lib64/libart.so segmentChecksum=0 ret=0x0
[crc-rx] path=/apex/com.android.art/lib64/libart.so start=0x74722a0000 end=0x74722a3000 size=0x3000 perms=rw-p
[crc-rx] path=/apex/com.android.art/lib64/libart.so segmentChecksum=0 ret=0x0
[crc-module] scan_modules_for_path path=/apex/com.android.art/lib64/libart.so checksum=846246994 ret=0x3270b452</code></pre><p><strong>只有 r-xp 段返回非零 checksum</strong>,其他 r--p / rw-p 段返回 0。最终模块 checksum 等于唯一 r-xp 段的 sum。</p><h5>5.3.2 4 个目标模块的 checksum</h5><pre><code>/apex/com.android.runtime/lib64/bionic/libc.so
  r-xp 0x7716344000-0x771635d000 size=0x19000  segmentChecksum=56439566  / 0x35d330e
  module checksum = 56439566 / 0x35d330e

/apex/com.android.runtime/bin/linker64
  r-xp 0x77419e7000-0x77419ed000 size=0x6000   segmentChecksum=116553550 / 0x6f2774e
  rwxp 0x77419ed000-0x77419ee000 size=0x1000   segmentChecksum=0
  r-xp 0x77419ee000-0x7741b0e000 size=0x120000 segmentChecksum=0
  module checksum = 116553550 / 0x6f2774e

/data/app/.../lib/arm64/libhunter.so
  r-xp 0x73d4221000-0x73d42e7000 size=0xc6000  segmentChecksum=252930381 / 0xf13694d
  rwxp 0x73d42e7000-0x73d42ea000 size=0x3000   segmentChecksum=748020    / 0xb69f4
  r-xp 0x73d42ea000-0x73d44cf000 size=0x1e5000 segmentChecksum=763632    / 0xba6f0
  rwxp 0x73d44cf000-0x73d44d0000 size=0x1000   segmentChecksum=0
  r-xp 0x73d44d0000-0x73d44fe000 size=0x2e000  segmentChecksum=0
  module checksum = 254442033 / 0xf2a7a31</code></pre><p><strong>libhunter.so 验证最终模块 checksum 是各段非零段 sum 的累加</strong>:</p><pre><code>252930381 + 748020 + 763632 = 254442033
0xf13694d + 0xb69f4 + 0xba6f0 = 0xf2a7a31  ✓</code></pre><p>注意 <code>rwxp</code> 段不代表 checksum 必然 0(参看 libhunter.so 的 0xb69f4 与 linker64 的 0)。</p><h5>5.3.3 Java CRC 比较命中</h5><pre><code>[evidence:crc] NativeEngine_getZhenxiLoctionCrc entered
[evidence:crc] anti_inject_collect_results entered
[evidence:crc] NativeEngine_getZhenxiLoctionCrc ret=0x773adbce09
[evidence:crc-java] ig.apply path=/apex/com.android.art/lib64/libart.so remote=846246994 ret=YouAreLoser.qH@2187160
[evidence:ui] title=ISO CRC NOT MATCH LOCALITY CRC risk=Deadly type=0 data=/apex/com.android.art/lib64/libart.so

[evidence:crc-java] ig.apply path=/data/app/.../lib/arm64/libhunter.so remote=252937296 ret=YouAreLoser.qH@...
[evidence:ui] title=ISO CRC NOT MATCH LOCALITY CRC risk=Deadly type=0 data=/data/app/.../libhunter.so

[evidence:crc-java] ig.apply path=/apex/com.android.runtime/lib64/bionic/libc.so remote=56444108 ret=YouAreLoser.qH@...
[evidence:ui] title=ISO CRC NOT MATCH LOCALITY CRC risk=Deadly type=0 data=/apex/com.android.runtime/lib64/bionic/libc.so

[evidence:crc-java] ig.apply path=/apex/com.android.runtime/bin/linker64 remote=116553745 ret=YouAreLoser.qH@...
[evidence:ui] title=ISO CRC NOT MATCH LOCALITY CRC risk=Deadly type=0 data=/apex/com.android.runtime/bin/linker64</code></pre><p>UI 原文:</p><pre><code>[Java MainActivity.n0]
  title=ISO CRC NOT MATCH LOCALITY CRC
  data=/apex/com.android.art/lib64/libart.so
locality crc -&gt; 856386775
remote service crc -&gt; 846246994</code></pre><p><code>local = 856386775</code> ≠ <code>remote = 846246994</code> → 触发。</p><h5>5.3.4 链路 2 native 直接上报</h5><pre><code>[evidence:checksum] NativeEngine_getZhenxiInfoF entered
[evidence:checksum] check_libart_elf_checksum_status entered
block bad precheck 0x7741a35000 size 0x1266d8 lr ... off 0xc7828
[evidence:checksum] check_libart_elf_checksum_status ret=0x1
[evidence:report] title=检测到libart.so被修改 lr=libhunter.so+0x2ada40 (rva=0x2ada40)
[evidence:ui] title=检测到libart.so被修改 risk=Deadly type=6</code></pre><p>LR <code>0x2ada40</code> 落在 <code>getZhenxiInfoF @ 0x2AD9A8</code> 内,与 §4.4 字典中 <code>getZhenxiInfoF × 8</code> callsite (W3=0, W4=3/4, W5=6) 一致。</p><h5>5.3.5 block_bad_precheck 多轮拦截</h5><pre><code>block bad precheck 0x773acbe000 size 0x7000   lr ... off 0xc68a4
block bad precheck 0x773e7bb000 size 0x1000   lr ... off 0xc68a4
block bad precheck 0x773e7ee000 size 0x4000   lr ... off 0xc68a4
block bad precheck 0x773e801000 size 0x1000   lr ... off 0xc68a4
block bad precheck 0x774059e000 size 0x1000   lr ... off 0xc68a4
block bad precheck 0x7741a35000 size 0x1266d8 lr ... off 0xc7828
block bad precheck 0x7741b5b6d8 size 0xd8     lr ... off 0xc7828
block bad precheck 0x7741a36000 size 0x1266d8 lr ... off 0xc7828
block bad precheck 0x7741b5c6d8 size 0xd8     lr ... off 0xc7828
block bad precheck 0x73d55ec990 size 0x2650   lr ... off 0xc7828
block bad precheck 0x73d55ee990 size 0x2650   lr ... off 0xc7828
block bad precheck 0x73d55f9990 size 0x2650   lr ... off 0xc7828
block bad precheck 0x73d55fc990 size 0x2650   lr ... off 0xc7828</code></pre><p><code>off 0xC68A4</code> (在 <code>sub_C687C</code>,parse_elf_rx_segments 内 ELF 文件读出后)和 <code>off 0xC7828</code> (在 <code>scan_rx_segment_neon_sum</code>,RX 段扫描路径)各反复触发,<strong>印证两条独立链路的越界点位置</strong> 。</p><h4>5.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>H1</td><td>4 个目标路径:libart / libc / linker64 / libhunter</td><td>实测 <code>[crc-module]</code> 出现这 4 个 path</td><td>✓</td></tr><tr><td>H2</td><td>NEON 字节累加和算法,纯 sum 不取模</td><td>libhunter.so 各段 sum 累加 = module sum,数学验证 ✓</td><td>✓</td></tr><tr><td>H3</td><td>只对 r-x 段累加,其他段返回 0</td><td>实测各 r--p / rwxp / rw-p 段大多 segmentChecksum=0(libhunter 的 rwxp 段 0xb69f4 是个例外)</td><td>✓</td></tr><tr><td>H4</td><td>文件读取走 ssyscall 包装器</td><td>§3.3.4 实测 openat/read/close/lseek 出现在跳板调用面</td><td>✓</td></tr><tr><td>H5</td><td>cache 容器 <code>qword_2EF8B0</code> 首次后永久缓存</td><td>多轮调用中只首次出现 <code>parse_elf_rx_segments entered</code> 日志</td><td>间接 ✓</td></tr><tr><td>H6</td><td>Java 侧 <code>ig.apply</code> 三条件比较</td><td>实测 <code>[evidence:crc-java]</code> ig.apply 命中 4 个目标路径</td><td>✓</td></tr><tr><td>H7</td><td>失配 UI 文案 = "ISO CRC NOT MATCH LOCALITY CRC"</td><td>实测 UI title 完全匹配</td><td>✓</td></tr><tr><td>H8</td><td>链路 2 不经 Java,native 直接报 "检测到libart.so被修改"</td><td>实测 <code>[evidence:report] title=检测到libart.so被修改 lr=0x2ada40</code></td><td>✓</td></tr><tr><td>H9</td><td>链路 2 LR 落在 <code>getZhenxiInfoF @ 0x2AD9A8</code> 内</td><td>LR <code>0x2ada40 - 0x2AD9A8 = 0x98</code> (在 InfoF 函数体内)</td><td>✓</td></tr><tr><td>H10</td><td><code>maps_precheck_readable</code> unmapped hole bug 影响 <code>scan_rx_segment_neon_sum</code></td><td>实测 <code>block_bad_precheck</code> 反复在 <code>off 0xc7828</code> (scan_rx_segment_neon_sum 内)触发</td><td>✓</td></tr><tr><td>H11</td><td>同时影响 <code>parse_elf_rx_segments</code> 的可读性预检</td><td>实测 <code>block_bad_precheck</code> 同样在 <code>off 0xc68a4</code> (sub_C687C 内)触发</td><td>✓</td></tr></tbody></table><h4>5.5 libhunter.so CRC 值动态变化的含义</h4><p>不同运行中 <code>libhunter.so</code> 的本地 CRC 值可能变化:某次 <code>258223051</code>,另一次 <code>252914579</code>,本节实测 <code>254442033</code> 。</p><p><strong>这是 hunter "对运行时 RX 段/映射状态做采样"的特征体现</strong>:libhunter.so 的多个段(包括 rwxp 段)随运行时状态变化(GOT 修改、绑定地址写入等)产生不同 NEON sum。不应把这个值当作 APK 文件静态 CRC。</p><h4>5.6 bypass 依据</h4><p>两层处理(<code>js/bypass_crc_detection.js</code>):</p><pre><code data-lang="js" class="language-js">// 链路 1 上游:让 native HashMap 全部 value = "0",ig.apply 因 local=0 跳过
NativeEngine.getZhenxiLoctionCrc.implementation = function () {
    const map = HashMap.$new();
    CRC_TARGET_PATHS.forEach(path =&gt; map.put(path, "0"));
    return map;
};

// 双保险:ig.apply 对目标 path 直接返回 NoRisk
YouAreLoser.ig.apply.overload('java.lang.Object').implementation = function (obj) {
    const path = ((rD) obj).a;
    if (CRC_TARGET_PATHS.includes(path))
        return hH.a;                             // 直接返回 NoRisk
    return apply.call(this, obj);
};

// 链路 2:NativeEngine.getZhenxiInfoF -&gt; null
NativeEngine.getZhenxiInfoF.implementation = function () { return null; };

// 必带:block_bad_precheck 防 scan_rx_segment_neon_sum 越界崩溃
block_bad_precheck(modbase);</code></pre><p>动态验证:</p><pre><code>[bypass:crc] ig.apply skip compare path=/apex/com.android.art/lib64/libart.so remote=846246994
[bypass:checksum] NativeEngine.getZhenxiInfoF -&gt; null</code></pre><p>CRC 风险项消失。</p><hr><h3>6. /proc/mounts Root/APatch 检测</h3><h4>6.1 链路</h4><pre><code>Java: GC.run -&gt; NativeEngine.getZhenxiInfo3()
JNI : NativeEngine_getZhenxiInfo3 @ 0x2B476C
核心: detect_root_mark_in_proc_mounts_maps @ 0xD5E34
辅助: file_contains_any_marker @ 0x1A6300
上报: ReportRiskItem LR 0x2B4A88
UI  : "Check Find Root In Mounts"</code></pre><h4>6.2 静态证据</h4><h5>6.2.1 7 路短路链</h5><p><code>NativeEngine_getZhenxiInfo3 @ 0x2B476C</code> 引用的风险项字符串:</p><pre><code>Check Find Root File
Check Find Root In Mounts
Check Find Root Mark
Check Find Root Magisk Mode
Check Find Root In Linker
Check Find Root Permission
Find Root Mark In Mountinfo</code></pre><p>完整短路顺序:</p><table><thead><tr><th>顺序</th><th>子函数 RVA</th><th>UI title</th><th>主要监测点</th></tr></thead><tbody><tr><td>1</td><td><code>0xD2CDC</code></td><td><code>Check Find Root File</code></td><td>固定 root/hook 文件路径、 <code>/proc/&lt;pid&gt;/attr/*</code> 、OverlayFS、 <code>/data/adb/modules</code> 、mount namespace、 <code>/proc/modules</code></td></tr><tr><td>2</td><td><code>0xD5E34</code></td><td><code>Check Find Root In Mounts</code></td><td><code>/proc/mounts</code> 、 <code>mountinfo</code> 、线程 maps、 <code>df -h</code> 中的 root/APatch/Magisk marker</td></tr><tr><td>3</td><td><code>0xD703C</code></td><td><code>Check Find Root Mark</code></td><td><code>/data/adb*</code> 、Magisk/LSPosed/Riru marker、 <code>/proc/fs/jbd2</code> 与 ext4 loop 痕迹</td></tr><tr><td>4</td><td><code>0xD9604</code></td><td><code>Check Find Root Magisk Mode</code></td><td>当前版本直接 <code>return 0</code>,保留分支</td></tr><tr><td>5</td><td><code>0xD216C</code></td><td><code>Check Find Root In Linker</code></td><td><code>dl_iterate_phdr</code> 收集 linker 已加载 ELF,匹配可疑 Zygisk engine 路径</td></tr><tr><td>6</td><td><code>0xDDB9C</code></td><td><code>Check Find Root Permission</code></td><td>netlink 权限侧信道,命中详情前缀 <code>netlink Find Permission</code></td></tr><tr><td>7</td><td><code>0xDF51C</code></td><td><code>Find Root Mark In Mountinfo</code></td><td><code>/proc/self/exe</code> 类型、 <code>/proc/self/mountinfo</code> 的 overlay/system/bin 痕迹</td></tr></tbody></table><h5>6.2.2 NativeEngine_getZhenxiInfo3 伪代码</h5><pre><code data-lang="c" class="language-c">// libhunter.so+0x2B476C
jobject NativeEngine_getZhenxiInfo3(JNIEnv *env) {
    if (check_root_file_and_namespace())             // sub_D2CDC
        return ReportRiskItem(env, "Check Find Root File ", detail, FB_Info, 1);
    if (detect_root_mark_in_proc_mounts_maps())      // sub_D5E34
        return ReportRiskItem(env, "Check Find Root In Mounts ", last_mounts_detail, FB_Info, 1);
    if (check_root_mark_data_adb_and_jbd2())         // sub_D703C
        return ReportRiskItem(env, "Check Find Root Mark ", detail, FB_Info, 1);
    if (check_magisk_mode_reserved())                // sub_D9604, 当前版本直接 return 0
        return ReportRiskItem(env, "Check Find Root Magisk Mode ", detail, FB_Info, 1);
    if (check_root_in_linker_loaded_elf())           // sub_D216C
        return ReportRiskItem(env, "Check Find Root In Linker ", detail, FB_Info, 1);
    if (check_root_permission_netlink(env))          // sub_DDB9C
        return ReportRiskItem(env, "Check Find Root Permission", detail, FB_Info, 1);
    if (check_mountinfo_overlay_system_bin())        // sub_DF51C
        return ReportRiskItem(env, "Find Root Mark In Mountinfo", detail, FB_Info, 1);
    return NULL;
}</code></pre><h5>6.2.3 detect_root_mark_in_proc_mounts_maps @ 0xD5E34 伪代码</h5><pre><code data-lang="c" class="language-c">bool detect_root_mark_in_proc_mounts_maps() {
    if (file_contains_any_marker("/proc/mounts", markers, out))
        return append_detail("/proc/mounts-&gt;", out);
    if (file_contains_any_marker("/proc/self/mounts", markers, out))
        return append_detail("/proc/self/mounts-&gt;", out);
    if (file_contains_any_marker("/proc/self/mountstats", markers, out))
        return append_detail("/proc/self/mountstats-&gt;", out);
    if (file_contains_any_marker("/proc/self/mountinfo", markers, out))
        return append_detail("/proc/self/mountinfo-&gt;", out);

    // /proc/self/task/&lt;tid&gt;/maps
    tid = gettid();
    path = "/proc/self/task/" + to_string(tid) + "/maps";
    if (file_contains_any_marker(path, markers, out))
        return append_detail("/proc/self/maps-&gt;", out);

    // popen("df -h", "r")
    if (df_h_contains_any_marker(markers, out))
        return append_detail("find mark item -&gt; ", out);

    return false;
}</code></pre><h5>6.2.4 18 项 marker 向量(sub_D116C @ 0xD116C 构造)</h5><pre><code>/riru, riru-, /edxp, lsposed,
magisk, Magisk, /appwidget, /debug_ramdisk,
dex2oat, apatch, Apatch, APatch,
kernelsu, kernelSu, zygisk, revanced,
/data/adb/modules, sukisu</code></pre><h5>6.2.5 file_contains_any_marker @ 0x1A6300 伪代码</h5><pre><code data-lang="c" class="language-c">bool file_contains_any_marker(const char *path, vector&lt;string&gt; *markers, string *out) {
    FILE *fp = fopen(path, "re");
    if (fp == NULL) {
        cout &lt;&lt; "file_include open file fail " &lt;&lt; path &lt;&lt; " " &lt;&lt; strerror(errno);
        return false;
    }
    string line;
    while (getline(fp, line)) {
        cout &lt;&lt; "file_include checking " &lt;&lt; path &lt;&lt; " " &lt;&lt; line;
        for (string &amp;marker : *markers) {
            if (marker.empty()) continue;
            if (line.find(marker) != string::npos) {
                cout &lt;&lt; "file_include find " &lt;&lt; path &lt;&lt; " " &lt;&lt; line;
                *out = line;
                fclose(fp);
                return true;
            }
        }
    }
    fclose(fp);
    return false;
}</code></pre><p>它不解析 mount 字段,不检查 mount type、source、target 的结构合法性 —— 纯 substring 命中。</p><h4>6.3 动态证据</h4><h5>6.3.1 主路径命中</h5><pre><code>[evidence:mounts] NativeEngine_getZhenxiInfo3 entered
[evidence:mounts] detect_root_mark_in_proc_mounts_maps entered
[evidence:mounts-file] file_contains_any_marker path=/proc/mounts
  markers=/riru|riru-|/edxp|lsposed|magisk|Magisk|/appwidget|/debug_ramdisk|dex2oat|apatch|Apatch|APatch|kernelsu|kernelSu|zygisk|revanced|/data/adb/modules|sukisu
[evidence:mounts-file] path=/proc/mounts ret=0x1
  hit=APatch /debug_ramdisk tmpfs rw,seclabel,relatime 0 0
[evidence:mounts] detect_root_mark_in_proc_mounts_maps ret=0x1
[evidence:report] title=Check Find Root In Mounts lr=libhunter.so+0x2b4a88 (rva=0x2b4a88)
  detail=com.zhenxi.hunter:hunter_main_process
  /proc/mounts-&gt;APatch /debug_ramdisk tmpfs rw,seclabel,relatime 0 0
[evidence:mounts] NativeEngine_getZhenxiInfo3 ret=0x7737909809
[evidence:ui] title=Check Find Root In Mounts  risk=Info type=1
  data=com.zhenxi.hunter:hunter_main_process
[evidence:ui] title=Check Find Root In Mounts  risk=Info type=1
  data=com.zhenxi.hunter:hunter_server_iso:com.zhenxi.hunter.ZhenxiServer:hunter_iso_service</code></pre><p>命中行 <code>APatch /debug_ramdisk tmpfs rw,seclabel,relatime 0 0</code> 同时命中 <code>APatch</code> 和 <code>/debug_ramdisk</code> 两个 marker。</p><h5>6.3.2 短路链后续分支补证(trace_info3_branch_experiment.js)</h5><p><code>getZhenxiInfo3</code> 是短路链,默认运行时先被 <code>sub_D5E34</code> 命中,后续分支不会跑。强制 <code>sub_D5E34</code> 返回 0 后:</p><pre><code>[+] FORCE_MISS={"rootFile":false,"mounts":true,"rootMark":false,"linker":false,"permission":true,"mountinfo":false}
[info3] NativeEngine_getZhenxiInfo3 entered
[info3-branch-ret] sub_D2CDC title="Check Find Root File" ret=0x0
[info3-branch-ret] sub_D5E34 title="Check Find Root In Mounts" ret=0x1
[info3-force] sub_D5E34 real ret=0x1 forced to 0 so the next branch can run
[info3-branch-ret] sub_D703C title="Check Find Root Mark" ret=0x0
[info3-branch-ret] sub_D9604 title="Check Find Root Magisk Mode" ret=0x0
[info3-branch-ret] sub_D216C title="Check Find Root In Linker" ret=0x0
[info3-branch-ret] sub_DDB9C title="Check Find Root Permission" ret=0x1
[info3-force] sub_DDB9C real ret=0x1 forced to 0 so the next branch can run
[info3-branch-ret] sub_DF51C title="Find Root Mark In Mountinfo" ret=0x0
[info3] NativeEngine_getZhenxiInfo3 ret=0x0</code></pre><p>链路完整跑通:真实命中点有两个 —— <code>sub_D5E34</code> (mounts APatch 命中)和 <code>sub_DDB9C</code> (netlink permission 命中)。</p><h5>6.3.3 file_contains_any_marker 是通用 helper</h5><p>同一进程中能看到不同 marker 向量复用该 helper:</p><pre><code>[evidence:mounts-file] file_contains_any_marker path=/proc/mounts
  markers=docker|lxc_volumns
[evidence:mounts-file] path=/proc/mounts ret=0x0

[evidence:mounts-file] file_contains_any_marker path=/proc/mounts
  markers=/mnt/shared/Sharefolder|/tiantian.conf|/data/share1|/hardware_device.conf|/mnt/shared/products|/mumu_hardware.conf|/Andy.conf|/mnt/windows/BstSharedFolder|/bst.conf|/mnt/shared/Applications|/ld.conf|/vboxsf
[evidence:mounts-file] path=/proc/mounts ret=0x0</code></pre><p>对应 Java 静态代码 <code>src/YouAreLoser/y00.java</code>:</p><pre><code data-lang="java" class="language-java">String[] markers = {"docker", "lxc_volumns"};
NativeEngine.getZhenxiInfoK("/proc/mounts", markers);</code></pre><p>因此须区分:</p><pre><code>file_contains_any_marker @ 0x1A6300
  = 通用"文件逐行包含 marker" helper

detect_root_mark_in_proc_mounts_maps @ 0xD5E34
  = root/APatch mount 检测模板,传入 root/APatch/Magisk marker 向量</code></pre><p>只有当调用链是 <code>NativeEngine_getZhenxiInfo3 -&gt; detect_root_mark_in_proc_mounts_maps -&gt; file_contains_any_marker</code> 、并且 marker 向量是 <code>/riru|...|APatch|kernelsu|...</code> 时,才归类为本节的 APatch/root mount 检测。</p><h4>6.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>M1</td><td><code>NativeEngine_getZhenxiInfo3</code> 是 7 路短路链</td><td><code>trace_info3_branch_experiment.js</code> 强制 miss 第二分支后,后续 5 个分支均依次执行</td><td>✓</td></tr><tr><td>M2</td><td>sub_D5E34 是其中 mounts 分支</td><td><code>trace_info3_branch_experiment.js</code> 看到 sub_D5E34 title="Check Find Root In Mounts"</td><td>✓</td></tr><tr><td>M3</td><td>18 项 marker 向量</td><td><code>[evidence:mounts-file]</code> 打印 markers 完整列出 18 项</td><td>✓</td></tr><tr><td>M4</td><td>读取源 6 个:<code>/proc/mounts</code> → <code>/proc/self/mounts</code> → <code>mountstats</code> → <code>mountinfo</code> → 线程 maps → <code>df -h</code></td><td>第一项 <code>/proc/mounts</code> 即命中,后续未执行(短路);但其它实验路径中可看到 <code>/proc/self/mountstats</code> 等被读</td><td>✓ 部分</td></tr><tr><td>M5</td><td>substring 匹配(<code>line.find(marker)</code>)而非结构化解析</td><td>命中行 <code>APatch /debug_ramdisk tmpfs rw,...</code> 同时命中 <code>APatch</code> 和 <code>/debug_ramdisk</code></td><td>✓</td></tr><tr><td>M6</td><td>ReportRiskItem callsite 在 <code>getZhenxiInfo3</code> 内</td><td>LR 0x2b4a88,(LR-4)=0x2b4a84 落在 <code>0x2B476C</code> 函数体内</td><td>✓</td></tr><tr><td>M7</td><td><code>file_contains_any_marker</code> 通用 helper</td><td>同一会话中同时观察到 root markers / docker markers / 模拟器路径 markers 三组复用</td><td>✓</td></tr><tr><td>M8</td><td>sub_DDB9C 是 netlink 权限侧信道</td><td><code>trace_info3_branch_experiment.js</code> 看到 sub_DDB9C title="Check Find Root Permission" ret=0x1(本设备命中)</td><td>✓</td></tr></tbody></table><h4>6.5 对抗面分析</h4><p>输入源 6 个、marker 向量 18 项 —— <strong>任一源任一行包含任一 marker 即触发</strong> 。对抗需要:</p><pre><code>必须净化的读取源:
- /proc/mounts
- /proc/self/mounts
- /proc/self/mountstats
- /proc/self/mountinfo
- /proc/self/task/&lt;tid&gt;/maps
- df -h 依赖的 mount/文件系统信息来源

必须避免出现在输出中的 marker:
- APatch / apatch / Apatch
- /debug_ramdisk
- kernelsu / kernelSu
- magisk / Magisk
- /data/adb/modules
- zygisk / lsposed / riru / edxp 等模块痕迹</code></pre><p>本设备命中 <code>APatch /debug_ramdisk tmpfs rw,...</code> 一行命中两个 marker,<strong>只替换其中一个不够</strong> 。</p><h4>6.6 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfo3.implementation = function () {
    return null;
};</code></pre><p>动态验证:</p><pre><code>[bypass:mounts] NativeEngine.getZhenxiInfo3 -&gt; null</code></pre><p>主进程风险项消失。但 <code>:hunter_server_iso</code> / <code>:hunter_server_twin</code> 子进程通过 Binder 仍可回传同类 bean(详 §22),需配合 UI 层兜底或多进程 spawn。</p><hr><h3>7. libart maps 分片/Hook 检测</h3><h4>7.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiMapCheck()
JNI : NativeEngine_getZhenxiMapCheck @ 0x291858
输入: /proc/self/maps 解析结果
上报: ReportRiskItem LR 0x2924B8(size==0x1000 立即上报分支)
UI  : "find libart.so hooked 0"</code></pre><h4>7.2 静态证据</h4><p><code>NativeEngine_getZhenxiMapCheck @ 0x291858</code> 引用字符串:</p><pre><code>libart.so
libart.so piecewise ,memory is not legal
check map legal error
open maps error</code></pre><p>Java 触发片段:</p><pre><code data-lang="java" class="language-java">// src/com/google/android/gms/internal/common/zzv.java
return NativeEngine.getZhenxiMapCheck();
// src/YouAreLoser/IB.java
return NativeEngine.getZhenxiMapCheck();</code></pre><p>伪代码:</p><pre><code data-lang="c" class="language-c">// libhunter.so+0x291858
maps = parse_maps_to_linked_list(-1);
if (maps == NULL) {
    return ReportRiskItem(env, "check map legal error ", "open maps error ", NoRisk_or_Deadly, 3);
}

libart_piece_count = 0;
detail = "";

for each map_node:
    if pathname contains "libart.so":
        libart_piece_count++;
        detail += pathname + "|" + decimal(map_node.size) + "|" +
                  map_node.perms + "|" + hex(map_node.start) + "-&gt;" + hex(map_node.end) + "\n";

        if map_node.size == 0x1000:
            return ReportRiskItem(
                env,
                "find libart.so hooked " + decimal(map_node.size),
                format_map_node(map_node),
                Deadly,
                3
            );

if libart_piece_count &gt;= 6:
    return ReportRiskItem(
        env,
        "libart.so piecewise ,memory is not legal ",
        detail,
        Deadly,
        2
    );

return NULL;</code></pre><p>关键地址:</p><pre><code>0x29188C parse_maps_to_linked_list(-1)
0x291D20 linked_list_step(ptr)
0x291D40 strstr(pathname, "libart.so")
0x292358 if strstr(pathname, "libart.so") &amp;&amp; map_node.size == 4096
0x292480 title = "find libart.so hooked " + size
0x292498 sub_FCB94(v65, map_node) 格式化当前 map_node 详情
0x2924B8 ReportRiskItem(...)
0x2923B4 if ((__int16)libart_piece_count &lt; 6) return NULL
0x2923CC title = "libart.so piecewise ,memory is not legal "
0x2923EC ReportRiskItem(...)</code></pre><p>两个独立判定:</p><pre><code>单段异常: 任意 libart.so mapping 的 size == 0x1000,立即上报 "find libart.so hooked 0/4096"
分片异常: libart.so mapping 数量 &gt;= 6,上报 "piecewise"(静态/间接证据,本环境未实际触发)</code></pre><p>不校验 libart 文件内容,<strong>只看进程内 libart.so 的 maps 形态</strong> 。Frida / LSPosed / SandHook 等会让 ART 代码页被重映射 / 拆分 / 产生异常小 mapping,触发本条。</p><h4>7.3 动态证据</h4><pre><code>[evidence:art-map] NativeEngine_getZhenxiMapCheck entered
[evidence:report] title=find libart.so hooked 0 lr=libhunter.so+0x2924b8 (rva=0x2924b8)
  detail=map item path -&gt;
  name -&gt;
  []
  name len size [0]
  exec address start-&gt; 0x0
  exec address end-&gt; 0x0
  perm -&gt;
  inode -&gt; 0
  mem size -&gt; 0
  pid-&gt; 16657
[evidence:art-map] NativeEngine_getZhenxiMapCheck ret=0x7737971009
[evidence:ui] title=find libart.so hooked 0 risk=Deadly type=0 data=map item path -&gt;</code></pre><p>汇聚点原始日志:</p><pre><code>[ReportRiskItem]
  arg1: find libart.so hooked 0
  arg2: map item path -&gt;
  ...
ReportRiskItem this-&gt;lr: libhunter.so+0x2924b8</code></pre><p>Java UI:</p><pre><code>[Java MainActivity.n0]
  title=find libart.so hooked 0
  risk=Deadly</code></pre><h4>7.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>A1</td><td>JNI 函数 <code>getZhenxiMapCheck @ 0x291858</code></td><td>实测 60 项表 #45 = getZhenxiMapCheck rva=0x291858</td><td>✓</td></tr><tr><td>A2</td><td>解析 <code>/proc/self/maps</code> 找 libart.so 形态</td><td><code>[evidence:art-map] NativeEngine_getZhenxiMapCheck entered</code> 后输出 map item 详情</td><td>✓</td></tr><tr><td>A3</td><td>size==0x1000 立即上报"find libart.so hooked"</td><td>实测 arg1="find libart.so hooked 0",lr=0x2924b8</td><td>✓</td></tr><tr><td>A4</td><td>0x2924B8 是 size==0x1000 分支的上报点</td><td>LR 完全等于 0x2924B8</td><td>✓</td></tr><tr><td>A5</td><td>libart_count &gt;= 6 上报"piecewise"</td><td>本设备命中 single 4KB 分支(优先返回),未触发 piecewise</td><td>间接 ✓</td></tr><tr><td>A6</td><td>UI risk=Deadly 但 W3=0</td><td>W3 从 0x278658 onEnter 看为 0,但 UI 显示 Deadly,W4=2/3 决定 UI 等级</td><td>✓</td></tr></tbody></table><h4>7.5 对抗面</h4><pre><code>敏感字段:
- pathname 是否包含 libart.so
- mapping start/end / size = end - start / perms
- libart.so mapping 总段数

触发条件:
- 任意 libart.so map_node.size == 0x1000  (优先)
- 或 libart.so mapping 数量 &gt;= 6(静态/间接证据,本环境未实际触发)</code></pre><p>对抗时必须保证向目标进程暴露的 maps 中 <code>libart.so</code> 不出现异常 4KB 分片,也不要把 <code>libart.so</code> 拆成过多段。单纯隐藏 Frida 字样、LSPosed 字样不能解决此分支,<strong>它匹配的是 libart.so 本身</strong> 。</p><h4>7.6 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiMapCheck.implementation = function () {
    return null;
};</code></pre><p>动态验证:</p><pre><code>[bypass:art-map] NativeEngine.getZhenxiMapCheck -&gt; null</code></pre><p>风险项消失。</p><hr><h3>8. libc/libart/linker 运行时 checksum 检测</h3><p>§5 已完整还原 CRC 双链算法栈。本节只补 native 直接上报(链路 2,<code>getZhenxiInfoF</code>)的 detection 细节。</p><h4>8.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfoF()
JNI : NativeEngine_getZhenxiInfoF @ 0x2AD9A8
内部: check_libart_elf_checksum_status @ 0xC9130
      check_libc_elf_checksum_status   @ 0xC90A0
      check_linker64_elf_checksum_status @ 0xC89BC
上报: ReportRiskItem LR 0x2ADA40 / 0x2ADD8C / ... (8 个 callsite)
UI  : "检测到libart.so被修改" / "检测到libc.so被修改" / "检测到linker..."</code></pre><h4>8.2 静态证据</h4><p><code>NativeEngine_getZhenxiInfoF @ 0x2AD9A8</code> 内有 8 个 callsite(W3=0,W4=3 或 4,W5=6,详 §4.4 字典),覆盖:</p><pre><code data-lang="c" class="language-c">// libhunter.so+0xC9130
uint32_t check_libart_elf_checksum_status() {
    std::string path = build_libart_path();
    return check_elf_checksum(path);
}

// libhunter.so+0xC90A0
uint32_t check_libc_elf_checksum_status() {
    std::string path = get_libc_path();
    return check_elf_checksum(path);
}

// libhunter.so+0xC89BC
uint32_t check_linker64_elf_checksum_status() {
    std::string path = get_linker64_path();
    return check_elf_checksum(path);
}</code></pre><p>三者共享 <code>scan_modules_for_path @ 0xC8500</code> 同源算法栈(详 §5.2)。</p><h4>8.3 动态证据</h4><pre><code>[evidence:checksum] NativeEngine_getZhenxiInfoF entered
[evidence:checksum] check_libart_elf_checksum_status entered
block bad precheck 0x7741a35000 size 0x1266d8 lr ... off 0xc7828
[evidence:checksum] check_libart_elf_checksum_status ret=0x1
[evidence:report] title=检测到libart.so被修改 lr=libhunter.so+0x2ada40 (rva=0x2ada40)
[evidence:ui] title=检测到libart.so被修改 risk=Deadly type=6</code></pre><p>LR <code>0x2ada40</code> 落在 <code>getZhenxiInfoF @ 0x2AD9A8</code> 内,size= <code>0x2ada40 - 0x2AD9A8 = 0x98</code> 处的 callsite。</p><h4>8.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>F1</td><td>JNI 函数 <code>getZhenxiInfoF @ 0x2AD9A8</code></td><td>60 项表 #(查到)= getZhenxiInfoF rva=0x2ad9a8</td><td>✓</td></tr><tr><td>F2</td><td>内部调用 <code>check_libart_elf_checksum_status @ 0xC9130</code></td><td><code>[evidence:checksum] check_libart_elf_checksum_status entered</code></td><td>✓</td></tr><tr><td>F3</td><td>检测命中返回 1</td><td><code>[evidence:checksum] check_libart_elf_checksum_status ret=0x1</code></td><td>✓</td></tr><tr><td>F4</td><td>callsite 在 <code>getZhenxiInfoF</code> 内</td><td>LR 0x2ada40 在 <code>[0x2AD9A8, 0x2AD9A8+size)</code> 范围</td><td>✓</td></tr><tr><td>F5</td><td>UI 文案"检测到libart.so被修改"</td><td><code>[evidence:ui] title=检测到libart.so被修改</code></td><td>✓</td></tr><tr><td>F6</td><td>W5=6(checksum 类别)</td><td>UI type=6</td><td>✓</td></tr><tr><td>F7</td><td>与 <code>scan_rx_segment_neon_sum</code> 共享算法</td><td><code>block_bad_precheck off 0xc7828</code> (scan_rx_segment_neon_sum 内)反复在此 detection 触发</td><td>✓</td></tr></tbody></table><h4>8.5 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfoF.implementation = function () {
    return null;
};</code></pre><p>动态验证:</p><pre><code>[bypass:checksum] NativeEngine.getZhenxiInfoF -&gt; null</code></pre><p>native 直接上报路径(链路 2)的风险项消失。但 <code>task_MAIN_CRC_check</code> 后台任务仍可能触发同类 detection,需配合 SO 层 <code>Interceptor.replace</code> 在 JNI 入口直接 return 0 拦截,或在 <code>0x278658</code> 汇聚点按 title 名单兜底。</p><hr><h3>9. 注入/匿名可执行内存检测</h3><h4>9.1 链路</h4><pre><code>Java: GC.m() -&gt; NativeEngine.getZhenxiInfoInjection()
JNI : NativeEngine_getZhenxiInfoInjection @ 0x28DF24
内部: 6 个子检测,任一非空返回
返回: jstring(空/null 时 Java 不构造 bean)
UI  : "Hunter Find Unknown Exec Item From Mian" (注意 "Mian" 是原 typo)</code></pre><h4>9.2 静态证据</h4><p>Java 触发逻辑(<code>src/YouAreLoser/GC.java</code>):</p><pre><code data-lang="java" class="language-java">String s = NativeEngine.getZhenxiInfoInjection();
if (s != null &amp;&amp; !s.isEmpty()) {
    n0(new ListItemBean("Hunter Find Unknown Exec Item From Mian", FB.c,
                        App.getCheckFrom() + s));
}</code></pre><p><code>NativeEngine_getZhenxiInfoInjection @ 0x28DF24</code> 是 6 子检测的汇总:</p><table><thead><tr><th>子函数</th><th>检测对象</th><th>标志字符串</th></tr></thead><tbody><tr><td><code>0x100AAC</code></td><td>匿名 / 未知路径的可执行内存(<code>rwxp</code> + inode=0 + path 空或 <code>?</code>)</td><td><code>"mem, suspicious execution procedure -&gt;"</code> / <code>"find rwx item 111"</code> / <code>"libc_malloc"</code> / <code>"scudo"</code></td></tr><tr><td><code>0x102814</code></td><td>memfd JIT cache mapping</td><td><code>"memfd:jit-cache"</code> / <code>"memfd:jit-zygote-cache"</code></td></tr><tr><td><code>0x103610</code></td><td>maps 行格式异常</td><td><code>&lt;dyn&gt;</code></td></tr><tr><td><code>0x104D54</code></td><td>missing page(可执行但 mapping 缺失页)</td><td><code>"missing page, suspicious execution procedure -&gt;"</code> / <code>"pid -&gt;"</code></td></tr><tr><td><code>0x105ACC</code></td><td>NativeBridge / AndroidRuntime hook</td><td><code>dlopen("/system/lib64/libandroid_runtime.so")</code> + <code>_ZN7android14AndroidRuntime10getRuntimeEv</code> / <code>"Found Hook NativeBridge"</code></td></tr><tr><td><code>0x10610C</code></td><td>匿名内存 / jit-cache 一致性</td><td><code>"Found suspicious anonymous memory"</code> / <code>"find inconsistent dalvik-zygote-jit-code-cache :"</code> / <code>"[anon:dalvik-zygote-jit-code-cache]"</code> / <code>"/memfd:jit-cache"</code></td></tr></tbody></table><p>伪代码:</p><pre><code data-lang="c" class="language-c">// libhunter.so+0x28DF24
jstring NativeEngine_getZhenxiInfoInjection(JNIEnv *env) {
    string out;
    if (sdk &gt;= 30)
        out += detect_unknown_exec_or_rwx_maps();     // 0x100AAC
    if (out.empty())
        out += detect_jit_cache_maps();               // 0x102814
    if (out.empty())
        out += detect_extra_maps_anomaly();           // 0x103610
    if (out.empty())
        out += detect_missing_page_exec_anomaly();    // 0x104D54
    if (out.empty())
        out += detect_nativebridge_runtime_hook();    // 0x105ACC
    if (out.empty())
        out += detect_suspicious_anonymous_memory();  // 0x10610C
    if (out.empty())
        return NULL_or_empty;
    return NewStringUTF(result);
}</code></pre><h4>9.3 动态证据</h4><h5>9.3.1 默认命中(0x100AAC)</h5><pre><code>[evidence:injection] NativeEngine_getZhenxiInfoInjection entered
[evidence:injection] NativeEngine_getZhenxiInfoInjection jstring=0x7737971e05
[evidence:ui] title=Hunter Find Unknown Exec Item From Mian risk=Deadly type=0
  data=&lt;com.zhenxi.hunter:hunter_main_process&gt;

title=Hunter Find Unknown Exec Item From Mian
data=&lt;com.zhenxi.hunter:hunter_main_process&gt;
mem, suspicious execution procedure -&gt;
pid -&gt; ...
map item path -&gt;
77270f4000-7727104000 rwxp 00000000 00:00 0 ?</code></pre><p>完整返回字符串(后续运行的 native 端 retval):</p><pre><code>mem, suspicious execution procedure -&gt;
pid -&gt;4325/com.zhenxi.hunter:hunter_main_process
map item path -&gt;
7727002000-7727012000 rwxp 00000000 00:00 0 ?
name -&gt; []
exec address start-&gt; 0x7727002000
exec address end-&gt; 0x7727012000
perm -&gt; rwxp
inode -&gt; 0
mem size -&gt; 65536
pid-&gt; 4325
------------------------------
find rwx item 111</code></pre><h5>9.3.2 拆分 6 子检测(trace_injection_subchecks_template.js)</h5><p>读取每个子函数隐藏返回参数 <code>x8</code> 指向的 <code>std::string</code>,在记录真实输出后临时清空前序非空结果让 wrapper 继续:</p><pre><code>sub_100AAC / anonymous/unknown executable maps and RWX:
  outLen=3131
  mem, suspicious execution procedure -&gt;
  7727012000-7727022000 rwxp 00000000 00:00 0 ? size=65536
  773e719000-773e71a000 rwxp 00000000 00:00 0 ? size=4096
  forced empty

sub_102814 / memfd JIT cache maps:
  outLen=0

sub_103610 / extra maps anomaly formatting:
  outLen=0

sub_104D54 / missing page executable anomaly:
  outLen=0

sub_105ACC / NativeBridge/AndroidRuntime hook:
  outLen=0

sub_10610C / anonymous memory / jit-cache consistency scan:
  outLen=3106
  Found suspicious anonymous memory:
    7727012000-7727022000 rwxp 00000000 00:00 0 ? size=65536
    773acbe000-773acc5000 rwxp 00000000 00:00 0 ? size=28672
    773e719000-773e71a000 rwxp 00000000 00:00 0 ? size=4096
    773e71b000-773e71c000 rwxp 00000000 00:00 0 ? size=4096</code></pre><h4>9.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>I1</td><td>JNI 函数 <code>getZhenxiInfoInjection @ 0x28DF24</code></td><td>60 项表实测 rva=0x28df24</td><td>✓</td></tr><tr><td>I2</td><td>6 个子检测短路链</td><td>拆分实验中,sub_100AAC 默认命中;清空后 sub_10610C 也命中;sub_102814 / 103610 / 104D54 / 105ACC 当前环境未命中</td><td>✓ 部分</td></tr><tr><td>I3</td><td>sub_100AAC 检测匿名 rwxp + inode=0</td><td>实测 detail 含 <code>7727002000-7727012000 rwxp 00000000 00:00 0 ?</code></td><td>✓</td></tr><tr><td>I4</td><td>静态字符串 <code>"find rwx item 111"</code></td><td>实测 detail 末尾出现 <code>find rwx item 111</code></td><td>✓</td></tr><tr><td>I5</td><td>sub_10610C 检测 <code>"Found suspicious anonymous memory"</code></td><td>拆分实验中 sub_10610C outLen=3106 含此字面量</td><td>✓</td></tr><tr><td>I6</td><td>Java 端判 <code>s != null &amp;&amp; !s.isEmpty()</code> 才构造 bean</td><td>bypass 返回空字符串后 UI 不再出现该 bean</td><td>✓</td></tr><tr><td>I7</td><td>UI 文案 "Hunter Find Unknown Exec Item From Mian"(注意 "Mian" 拼写)</td><td>UI 实测原样显示 "Mian"</td><td>✓</td></tr></tbody></table><h4>9.5 对抗面</h4><p>当前环境命中两类:</p><pre><code>默认命中: sub_100AAC  ── 匿名 rwxp + inode=0 + path 空或 ?
辅助命中: sub_10610C  ── 匿名内存 / jit-cache 一致性扫描
未命中:   sub_102814 (memfd JIT) / sub_103610 (maps 格式) / sub_104D54 (missing page) / sub_105ACC (NativeBridge)</code></pre><p>Frida agent 在主进程映射匿名 RWX 区是触发本条的主要原因。对抗思路是隐藏这类 mapping(可在 maps 解析侧/物理映射侧欺骗)。</p><h4>9.6 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfoInjection.implementation = function () {
    return "";
};</code></pre><p>动态验证:</p><pre><code>[bypass:injection] NativeEngine.getZhenxiInfoInjection -&gt; empty</code></pre><p>Java 侧条件 <code>!s.isEmpty()</code> 不满足,bean 不构造。返回空字符串是源头 bypass。</p><hr><h3>10. 其他进程扫描检测</h3><h4>10.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfo4(Context)
JNI : NativeEngine_getZhenxiInfo4 @ 0x2A2D98
上报: ReportRiskItem LR 0x2A3F6C
UI  : "Find Others Processmay be risks main pid (...)" / "Find Others Process"</code></pre><h4>10.2 静态证据</h4><h5>10.2.1 两阶段算法</h5><p>第一阶段:<code>/proc</code> pid 枚举</p><pre><code>opendir("/proc")
readdir(...)
读取 /proc/&lt;pid&gt;/comm     ── helper sub_1A5304 @ 0x1A5304
读取 /proc/&lt;pid&gt;/cmdline</code></pre><p>进程名与关键字比较(精确/模糊):</p><pre><code>HUNTER_TRACER
install
hunter
linker
app_
twin</code></pre><p>命中后:</p><pre><code>find other process &lt;pid&gt; &lt;name&gt;
other pid -&gt; &lt;pid&gt;(pid name: &lt;name&gt;)</code></pre><p>第二阶段:<code>ps -ef</code> 采集(<code>sub_D0DA4 @ 0xD0DA4</code> 动态 <code>dlopen("libc.so")/dlsym("popen")</code>):</p><pre><code>popen("ps -ef", "r")
逐行过滤 !contains("hunter") &amp;&amp; !contains("install")
累计命中 &gt;= 3 → ReportRiskItem("Find Others Process", ...)
popen 失败 → "ps error"
无满足行 → "NOT FIND SANDBOX"</code></pre><h5>10.2.2 伪代码</h5><pre><code data-lang="c" class="language-c">// libhunter.so+0x2A2D98
jobject NativeEngine_getZhenxiInfo4(JNIEnv *env, jobject context) {
    int main_pid = getpid();
    DIR *dir = opendir("/proc");
    while ((de = readdir(dir)) != NULL) {
        if (!is_decimal_pid(de-&gt;d_name)) continue;
        pid = atoi(de-&gt;d_name);
        if (pid == main_pid) continue;

        name = read_proc_pid_cmdline_or_comm(pid);
        if (name in {"sh", "logcat", "grep", "getprop", ...}) {
            append("other pid -&gt; %d(pid name: %s)\n", pid, name);
        }
    }
    if (!result.empty())
        return ReportRiskItem(env, "Find Others Processmay be risks main pid (...)", result);

    if (sdk &gt;= 30) {
        popen_fn = dlsym(dlopen("libc.so"), "popen");
        fp = popen_fn("ps -ef", "r");
        while (fgets(line, 0x1000, fp)) {
            if (!contains(line, "hunter") &amp;&amp; !contains(line, "install")) {
                ps_detail += line;
                count++;
            }
        }
        if (count &gt;= 3)
            return ReportRiskItem(env, "Find Others Process", ps_detail);
    }
    return NULL;
}</code></pre><h4>10.3 动态证据</h4><h5>10.3.1 第一阶段命中(/proc 枚举)</h5><pre><code>[evidence:process] NativeEngine_getZhenxiInfo4 entered
[evidence:report] title=Find Others Processmay be risks main pid (24499) lr=libhunter.so+0x2a3f6c (rva=0x2a3f6c)
  detail=other pid -&gt; 24714(pid name: logcat)
other pid -&gt; 24737(pid name: ls)
other pid -&gt; 24739(pid name: ls)
[evidence:process-java] NativeEngine.getZhenxiInfo4(...) -&gt; title=Find Others Processmay be risks main pid (24499) risk=NoRisk type=4
[evidence:ui] title=Find Others Processmay be risks main pid (24499) risk=NoRisk type=4</code></pre><p>不同会话样本:</p><pre><code>[evidence:report] title=Find Others Processmay be risks main pid (19790)
  lr=libhunter.so+0x2a3f6c (rva=0x2a3f6c)
  detail=other pid -&gt; 20164(pid name: sh)
other pid -&gt; 20167(pid name: logcat)
other pid -&gt; 20168(pid name: grep)
other pid -&gt; 20169(pid name: grep)</code></pre><h5>10.3.2 第二阶段命中(ps -ef)</h5><pre><code>[evidence:report] title=Find Others Process lr=libhunter.so+0x2a43b0 (rva=0x2a43b0)
  detail=UID PID PPID C STIME TTY TIME CMD
  u0_a280 9820 836 ... com.zhenxi.hunter:hunter_server_twin
  u0_a280 10055 9706 ... ps -ef</code></pre><p>第二阶段会把 hunter 自己的 twin 进程 + <code>ps -ef</code> 命令本身一并写入 detail。</p><h4>10.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>P1</td><td>JNI 函数 <code>getZhenxiInfo4 @ 0x2A2D98</code></td><td>60 项表 rva=0x2a2d98</td><td>✓</td></tr><tr><td>P2</td><td>两阶段:<code>/proc/&lt;pid&gt;/comm\|cmdline</code> + <code>ps -ef</code></td><td>不同会话分别命中第一阶段和第二阶段</td><td>✓</td></tr><tr><td>P3</td><td>第一阶段 callsite LR <code>0x2a3f6c</code></td><td>实测 lr=0x2a3f6c,(LR-4)=0x2a3f68 在 InfoInfo4 函数体内</td><td>✓</td></tr><tr><td>P4</td><td>第二阶段 callsite LR <code>0x2a43b0</code></td><td>实测样本中第二阶段 lr=0x2a43b0</td><td>✓</td></tr><tr><td>P5</td><td>UI 文案前缀 "Find Others Process"</td><td>实测 UI title 完全匹配</td><td>✓</td></tr><tr><td>P6</td><td>risk=NoRisk type=4</td><td>UI 显示 risk=NoRisk type=4</td><td>✓</td></tr><tr><td>P7</td><td>关键字含 <code>sh / logcat / grep / ls / getprop</code></td><td>实测命中样本含 logcat/ls/sh/grep</td><td>✓</td></tr></tbody></table><h4>10.5 对抗面</h4><p><code>risk=NoRisk</code> —— 这是信息项而非阻断项。但会暴露当前分析环境(常驻 <code>sh / logcat / grep</code>)。</p><p>对抗简单粗暴:</p><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfo4.implementation = function (ctx) {
    return null;
};</code></pre><p>动态验证:</p><pre><code>[bypass:process] NativeEngine.getZhenxiInfo4 -&gt; null</code></pre><hr><h3>11. APatch/KP/KernelSU side-channel 检测</h3><h4>11.1 链路</h4><pre><code>Java: MainActivity.S() -&gt; NativeEngine.SideChanne()
JNI : NativeEngine_SideChanne @ 0x2B3BD4
核心: detect_root_side_channel_apatch_kernelsu @ 0xE43BC
UI  : "Check Root For SideChanne"</code></pre><h4>11.2 静态证据</h4><h5>11.2.1 算法步骤</h5><pre><code>1. mmap 一页 0x1000,权限 PROT_READ | PROT_WRITE | PROT_EXEC
2. 拷贝 0x270 字节内置 probe 机器码(.rodata 中 src__8)到该页
3. __clear_cache(code, code + 0x1000)
4. 调用该 probe code 收集 4 组 timing 样本(每组 10 个):s / s_1 / s_2 / s_3
5. sub_E60A4(sample, 10) / sub_E63E8(sample, avg) 做均值/离散度统计
6. munmap(code, 0x1000)</code></pre><h5>11.2.2 阈值判定</h5><pre><code data-lang="c" class="language-c">baseline_avg = sub_E60A4(s,   10);
sample1_avg  = sub_E60A4(s_1, 10);
sample2_avg  = sub_E60A4(s_2, 10);
sample3_avg  = sub_E60A4(s_3, 10);

baseline_dev = sub_E63E8(s,   baseline_avg);
sample1_dev  = sub_E63E8(s_1, sample1_avg);
sample2_dev  = sub_E63E8(s_2, sample2_avg);
sample3_dev  = sub_E63E8(s_3, sample3_avg);

// 稳定性筛选
if (baseline_dev * 10 &gt; baseline_avg) return false;
if (sample1_dev  * 10 &gt;= sample1_avg) return false;
if (sample2_dev  * 10 &gt;= sample2_avg) return false;
if (sample3_dev  * 10 &gt;= sample3_avg) return false;
if (sample1_avg &lt;= baseline_avg) return false;
if (sample2_avg &lt;= baseline_avg) return false;
if (sample3_avg &lt;= baseline_avg) return false;

ratio0 = (sample2_avg - baseline_avg) / (sample1_avg - baseline_avg);
ratio1 = (sample3_avg - baseline_avg) / (sample1_avg - baseline_avg);

if (ratio0 &gt; 2.2 &amp;&amp; ratio1 &gt; 2.2)
    return set_result("KernelSU Installed (High Latency)", ratio0, ratio1);

if (ratio0 &gt; 1.4 &amp;&amp; ratio1 &gt; 1.4)
    return set_result("APatch/KP Installed (Mid Latency)", ratio0, ratio1);

return false;</code></pre><h5>11.2.3 静态字符串</h5><pre><code>Side-Channel Detected: KernelSU Installed (High Latency) ratio0:
Side-Channel Detected: APatch/KP Installed (Mid Latency) ratio0:
ratio1:</code></pre><p>Java 触发(<code>src/com/zhenxi/hunter/MainActivity.java</code>):</p><pre><code data-lang="java" class="language-java">public static ListItemBean S() {
    String s = NativeEngine.SideChanne();
    if (s == null) return null;
    return new ListItemBean("Check Root For SideChanne", FB.a, s);
}</code></pre><h4>11.3 动态证据</h4><pre><code>[evidence:side-channel] NativeEngine_SideChanne entered
[evidence:side-channel] detect_root_side_channel_apatch_kernelsu entered
[evidence:side-channel] detect_root_side_channel_apatch_kernelsu ret=0x1
[evidence:side-channel] NativeEngine_SideChanne ret=0x77379fe201
  data=Side-Channel Detected: APatch/KP Installed (Mid Latency) ratio0:1.604278 ratio1:1.657754
[evidence:ui] title=Check Root For SideChanne risk=Info type=0
  data=Side-Channel Detected: APatch/KP Installed (Mid Latency) ratio0:1.604278 ratio1:1.657754</code></pre><p>另一轮采证 ratio 略有差异但仍归同一档:</p><pre><code>ratio0:1.595745 ratio1:1.648936</code></pre><h4>11.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>S1</td><td>JNI 函数 <code>SideChanne @ 0x2B3BD4</code></td><td>60 项表 #59 = SideChanne rva=0x2b3bd4</td><td>✓</td></tr><tr><td>S2</td><td>内部调用 <code>detect_root_side_channel_apatch_kernelsu @ 0xE43BC</code></td><td><code>[evidence:side-channel] detect_root_side_channel_apatch_kernelsu entered</code></td><td>✓</td></tr><tr><td>S3</td><td>阈值 1.4 &lt; ratio ≤ 2.2 归 "APatch/KP Mid Latency"</td><td>实测 ratio0=1.604278 / ratio1=1.657754,两者均 &gt; 1.4 且 &lt; 2.2</td><td>✓</td></tr><tr><td>S4</td><td>阈值 ratio &gt; 2.2 归 "KernelSU High Latency"</td><td>本环境未达到此阈值</td><td>间接 ✓</td></tr><tr><td>S5</td><td>UI 文案 "Check Root For SideChanne"</td><td>实测 UI title 完全匹配</td><td>✓</td></tr><tr><td>S6</td><td>返回字符串完整含 ratio 数值</td><td>实测 data 串包含 <code>ratio0:1.604278 ratio1:1.657754</code></td><td>✓</td></tr></tbody></table><h4>11.5 对抗面</h4><p>这条 detection 基于 timing,无法用文件系统层欺骗绕过。对抗思路:</p><ul><li>干扰 timing ratio: KPM 理论上可在相关 syscall 路径上引入可控 delay/noise；但需要先确认 Hunter 的采样 syscall/路径,否则固定加噪未必能稳定绕过</li><li>直接拦截:Java 层 hook <code>NativeEngine.SideChanne</code> 返回 null</li></ul><h4>11.6 bypass 依据</h4><p>返回空字符串时 Java 仍可能包装空 data 风险项,正确做法返回 null:</p><pre><code data-lang="js" class="language-js">NativeEngine.SideChanne.implementation = function () {
    return null;
};</code></pre><p>动态验证:</p><pre><code>[bypass:side-channel] NativeEngine.SideChanne -&gt; null</code></pre><hr><h3>12. Verified Boot / 解锁状态检测</h3><p><code>"当前手机已经被解锁"</code> 文案有两条独立来源,容易混淆。</p><h4>12.1 链路总览</h4><pre><code>链路 A:TEE attestation
─────────────────────────────────────────
Java: j40.b(MainActivity)
  -&gt; iW.d(new GC(mainActivity, 26), "tee_check_thread")
  -&gt; GC.run default
  -&gt; new z5(context, packageManager).b()
  -&gt; ((t5)v10.c).b()
  -&gt; YouAreLoser.e rootOfTrust
判定: e.c = deviceLocked   (false → 解锁)
     e.b = verifiedBootState (1/2/3 → patched)
UI  : "当前手机已经被解锁" / "Find Verified Boot Mark"

链路 B:getprop
─────────────────────────────────────────
Java: j40.a(MainActivity)
  -&gt; NativeEngine.getZhenxiInfoH("ro.boot.verifiedbootstate")
判定: "orange"  → 当前手机已经被解锁
     "yellow"  → 当前设备机型&amp;ROM 可能被修改!</code></pre><h4>12.2 静态证据</h4><h5>12.2.1 链路 A:TEE 链 Java 判定</h5><pre><code data-lang="java" class="language-java">// src/YouAreLoser/GC.java
V1 v10 = new z5(mainActivity0, mainActivity0.getPackageManager()).b();
if (v10 == null) {
    mainActivity0.n0(new ListItemBean("Tee is not supported or destroyed", FB.d));
} else {
    e e0 = ((t5)v10.c).b();
    if (!e0.c) {
        n0(new ListItemBean("当前手机已经被解锁", FB.a, "tee check device unlock"));
    }
    if (e0.b == 1 || e0.b == 2 || e0.b == 3) {
        n0(new ListItemBean("Find Verified Boot Mark", FB.a,
                            "the boot.img maybe have been patched\n" + e0));
    }
}</code></pre><p>字段语义:</p><pre><code>e0.c = deviceLocked
e0.b = verifiedBootState
       0 = Verified
       1 = Self-signed
       2 = Unverified
       3 = Failed</code></pre><h5>12.2.2 链路 B:getprop 链</h5><pre><code data-lang="java" class="language-java">// src/YouAreLoser/j40.java
String s = NativeEngine.getZhenxiInfoH("ro.boot.verifiedbootstate");
if (s.equals("orange")) {
    arrayList.add(new ListItemBean("当前手机已经被解锁", FB.a, s));
}
if (s.equals("yellow")) {
    arrayList.add(new ListItemBean("当前设备机型&amp;ROM可能被修改!", FB.a, s));
}</code></pre><p><code>NativeEngine.getZhenxiInfoH(String)</code> 是 Java wrapper,<strong>不在 <code>art_register_natives_batch</code> 的 60 项表里</strong> 。它调用混淆函数 <code>getPropInline(key, true)</code>,后者内部再走 native <code>getZhenxiInfoZ(key)</code> fallback 或 <code>jK</code> 解析 <code>/dev/__properties__</code> 属性区。因此这条属性链最终包含 native 层,但 native 注册项不是 <code>getZhenxiInfoH</code> 本身。</p><h4>12.3 动态证据</h4><pre><code>[evidence:bootstate-java] NativeEngine.getZhenxiInfoH(ro.boot.verifiedbootstate) -&gt; orange
[evidence:bootstate] j40.a returned &lt;list size=1&gt;
[evidence:ui] title=当前手机已经被解锁 risk=Info type=0 data=tee check device unlock
[evidence:ui] title=Find Verified Boot Mark risk=Info type=0 data=the boot.img maybe have been patched
[evidence:ui] title=当前手机已经被解锁 risk=Info type=0 data=orange</code></pre><p>UI 实例展开:</p><pre><code>title=Find Verified Boot Mark
data=verifiedBootKey: 0000...
deviceLocked: false
verifiedBootState: Unverified</code></pre><h4>12.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>V1</td><td>链路 A 来自 TEE attestation rootOfTrust</td><td>UI data 含 "tee check device unlock"</td><td>✓</td></tr><tr><td>V2</td><td>链路 B 来自 <code>ro.boot.verifiedbootstate=orange</code></td><td><code>[evidence:bootstate-java]</code> 实测看到 prop 返回 "orange"</td><td>✓</td></tr><tr><td>V3</td><td>两条独立,各自命中均产生风险项</td><td>UI 同时出现两条 "当前手机已经被解锁",一条 data="tee check device unlock" 一条 data="orange"</td><td>✓</td></tr><tr><td>V4</td><td>TEE 链路 <code>e.b == 1/2/3</code> → "Find Verified Boot Mark"</td><td>实测 verifiedBootState=Unverified(=2)→ UI 出现 "Find Verified Boot Mark"</td><td>✓</td></tr><tr><td>V5</td><td><code>getZhenxiInfoH</code> 不在 batch 表</td><td>60 项表枚举无此 name,SO 层 Interceptor.replace 报 miss</td><td>✓</td></tr></tbody></table><h4>12.5 对抗面</h4><p>两条独立 → 需要分别绕:</p><pre><code>链路 A 绕: z5.b() -&gt; 伪造 V1 (deviceLocked=true, verifiedBootState=0)
链路 B 绕: NativeEngine.getZhenxiInfoH("ro.boot.verifiedbootstate") -&gt; "green"
         或 j40.a(MainActivity) -&gt; 空 ArrayList</code></pre><h4>12.6 bypass 依据</h4><p>TEE 链:</p><pre><code data-lang="js" class="language-js">const Z5 = factory.use('YouAreLoser.z5');
const V1 = factory.use('YouAreLoser.V1');
const TeeRoot = factory.use('YouAreLoser.e');
Z5.b.overload().implementation = function () {
    const result = V1.$new(1, false);
    const key  = Java.array('byte', new Array(32).fill(0));
    const hash = Java.array('byte', new Array(32).fill(0));
    result.c.value = TeeRoot.$new(key, true, 0, hash);   // deviceLocked=true, verifiedBootState=0
    result.b.value = 0;
    return result;
};</code></pre><p>getprop 链:</p><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfoH.implementation = function (key) {
    if (String(key) === 'ro.boot.verifiedbootstate') return 'green';
    return this.getZhenxiInfoH(key);
};

YouAreLoser.j40.a.implementation = function () { return ArrayList.$new(); };   // 双保险</code></pre><p>动态验证:</p><pre><code>[bypass:tee] z5.b -&gt; fake locked + verified boot
[bypass:prop] ro.boot.verifiedbootstate -&gt; green
[bypass:bootstate] j40.a -&gt; empty list</code></pre><p>注意:<strong>两条都拦才能彻底消除</strong> 。即使 TEE 链 bypass 成功,getprop 链仍会单独产生 orange 风险项。</p><hr><h3>13. 环境变量采集</h3><h4>13.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfoEnv()
JNI : NativeEngine_getZhenxiInfoEnv @ 0x28CDB0
上报: ReportRiskItem LR 0x28D3A8
UI  : "Get Env Info" / risk=NoRisk type=4</code></pre><h4>13.2 静态证据</h4><p><code>NativeEngine_getZhenxiInfoEnv @ 0x28CDB0</code> 引用字符串 <code>"Get Env Info"</code> 。Java 触发片段:</p><pre><code data-lang="java" class="language-java">// src/com/google/android/gms/internal/measurement/zzfy.java
return NativeEngine.getZhenxiInfoEnv();

// src/com/google/android/gms/internal/firebase-auth-api/zzoy.java
return NativeEngine.getZhenxiInfoEnv();</code></pre><p>伪代码:</p><pre><code data-lang="c" class="language-c">// libhunter.so+0x28CDB0
jobject NativeEngine_getZhenxiInfoEnv(JNIEnv *env) {
    std::string detail;
    for (char **p = environ; *p != NULL; ++p) {
        detail += *p;
        detail += "\n";
    }
    return ReportRiskItem(env, "Get Env Info", detail, FB_NoRisk_or_Info, 0);
}</code></pre><h4>13.3 动态证据</h4><pre><code>[evidence:env] NativeEngine_getZhenxiInfoEnv entered
[evidence:report] title=Get Env Info lr=libhunter.so+0x28d3a8 (rva=0x28d3a8)
[evidence:env] NativeEngine_getZhenxiInfoEnv ret=0x77379fe209
[evidence:ui] title=Get Env Info risk=NoRisk type=0 data=PATH=/product/bin:...</code></pre><p>实际 detail 涵盖:</p><pre><code>PATH=...
ANDROID_ROOT=/system
BOOTCLASSPATH=...
ANDROID_SOCKET_zygote=...
TMPDIR=/data/user/0/com.zhenxi.hunter/cache
...</code></pre><h4>13.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>E1</td><td>JNI 函数 <code>getZhenxiInfoEnv @ 0x28CDB0</code></td><td>60 项表 rva=0x28cdb0</td><td>✓</td></tr><tr><td>E2</td><td>callsite LR <code>0x28D3A8</code></td><td>实测 <code>[evidence:report] lr=0x28d3a8</code></td><td>✓</td></tr><tr><td>E3</td><td>遍历 environ 全部 key=value</td><td>实测 detail 含 PATH/ANDROID_*/BOOTCLASSPATH/TMPDIR 等</td><td>✓</td></tr><tr><td>E4</td><td>risk=NoRisk(W3=0, W4=4, W5=0)</td><td>UI risk=NoRisk type=0</td><td>✓</td></tr></tbody></table><h4>13.5 对抗面</h4><p><strong>信息采集项,不直接判定 root/hook</strong>,但暴露运行环境和进程上下文。属于"画像"类 detection,绕过优先级低于阻断类。</p><h4>13.6 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfoEnv.implementation = function () { return null; };</code></pre><p>动态验证:</p><pre><code>[bypass:env] NativeEngine.getZhenxiInfoEnv -&gt; null</code></pre><hr><h3>14. 通用文件 marker 检测</h3><h4>14.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfoK(path, markers)
JNI : NativeEngine_getZhenxiInfoK @ 0x2B93BC
核心: file_contains_any_marker @ 0x1A6300
返回: String hit_line 或 null
UI  : 取决于调用方,例如 "当前手机可能是模拟器&amp;云手机"</code></pre><h4>14.2 静态证据</h4><p><code>getZhenxiInfoK</code> 是 §6.2.5 <code>file_contains_any_marker</code> 的 Java 暴露包装:</p><pre><code data-lang="c" class="language-c">// libhunter.so+0x2B93BC
jstring NativeEngine_getZhenxiInfoK(JNIEnv *env, jclass, jstring path, jobjectArray markers) {
    vector&lt;string&gt; native_markers;
    for (int i = 0; i &lt; env-&gt;GetArrayLength(markers); i++) {
        native_markers.push_back(GetStringUTFChars(markers[i]));
    }
    if (file_contains_any_marker(path, native_markers, &amp;hit_line))
        return NewStringUTF(hit_line.c_str());
    return NULL;
}</code></pre><p>Java 使用示例:</p><pre><code data-lang="java" class="language-java">// src/YouAreLoser/y00.java
String[] markers = {"docker", "lxc_volumns"};
String s = NativeEngine.getZhenxiInfoK("/proc/mounts", markers);
if (s == null) {
    s = NativeEngine.getZhenxiInfoK("/proc/self/mountstats", markers);
    if (s == null) {
        s = NativeEngine.getZhenxiInfoK("/proc/self/mountinfo", markers);
    }
}
if (s != null) {
    arrayList0.add(new ListItemBean("当前手机可能是模拟器&amp;云手机", FB.b,
                                    "(mounts异常)\n" + s));
}</code></pre><h4>14.3 动态证据</h4><h5>14.3.1 容器检测</h5><pre><code>[evidence:file-marker-java-native] NativeEngine_getZhenxiInfoK entered
[evidence:file-marker] path=/proc/mounts markers=docker|lxc_volumns
[evidence:file-marker-ret] path=/proc/mounts ret=0x0
[evidence:file-marker-java] NativeEngine.getZhenxiInfoK(/proc/mounts, docker|lxc_volumns) -&gt;</code></pre><h5>14.3.2 模拟器/云手机检测</h5><pre><code>[evidence:file-marker] path=/proc/self/mountinfo markers=/mnt/shared/Sharefolder|/tiantian.conf|/data/share1|/hardware_device.conf|/mnt/shared/products|/mumu_hardware.conf|/Andy.conf|/mnt/windows/BstSharedFolder|/bst.conf|/mnt/shared/Applications|/ld.conf|/vboxsf
[evidence:file-marker-ret] path=/proc/self/mountinfo ret=0x0</code></pre><p>完整 markers 12 项:</p><pre><code>/mnt/shared/Sharefolder
/tiantian.conf
/data/share1
/hardware_device.conf
/mnt/shared/products
/mumu_hardware.conf
/Andy.conf
/mnt/windows/BstSharedFolder
/bst.conf
/mnt/shared/Applications
/ld.conf
/vboxsf</code></pre><h4>14.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>K1</td><td>JNI 函数 <code>getZhenxiInfoK @ 0x2B93BC</code></td><td><code>[evidence:file-marker-java-native] NativeEngine_getZhenxiInfoK entered</code></td><td>✓</td></tr><tr><td>K2</td><td>底层调用 <code>file_contains_any_marker @ 0x1A6300</code></td><td><code>[evidence:file-marker]</code> hook 在 0x1A6300 落点</td><td>✓</td></tr><tr><td>K3</td><td>容器 markers <code>docker, lxc_volumns</code></td><td>实测 markers 字符串完全匹配</td><td>✓</td></tr><tr><td>K4</td><td>模拟器 markers 12 项</td><td>实测 markers 字符串包含全 12 项</td><td>✓</td></tr><tr><td>K5</td><td><code>file_contains_any_marker</code> 是通用 helper</td><td>同一会话观察到 3 套不同 markers(root / docker / 模拟器)复用同 helper</td><td>✓</td></tr></tbody></table><h4>14.5 对抗面</h4><p><code>getZhenxiInfoK</code> 本身是通用工具,不应作"是否 detection"的边界。检测属性取决于调用方:</p><ul><li>root markers + 关键 mount 路径 → root 检测(§6)</li><li><code>docker, lxc_volumns</code> → 容器</li><li>模拟器共享目录路径 → 模拟器</li></ul><p>对抗时若全量 bypass <code>getZhenxiInfoK</code> 可能破坏其他正常调用 —— 应按 path × markers 组合细化。</p><h4>14.6 bypass 依据</h4><p>不强行返回 null,而是 hook 对应 Java caller(例如 <code>y00</code> 类的检测方法)更安全。</p><hr><h3>15. 风险文件路径检测</h3><h4>15.1 链路</h4><pre><code>Java: MainActivity.onCreate/init
  -&gt; CancellationTokenSource.ۨۜۚ(this, NativeEngine.checkRiskFile());
JNI : NativeEngine_checkRiskFile @ 0x2AC514
辅助: sub_1A6228 @ 0x1A6228   (即 access(path, F_OK) == 0)
上报: ReportRiskItem callsite 0x2ace44(W3=1, W4=2, W5=10)
UI  : "Find Risk File"</code></pre><h4>15.2 静态证据</h4><h5>15.2.1 25 条风险路径表</h5><p><code>NativeEngine_checkRiskFile @ 0x2AC514</code> 先构造固定风险路径表,再按顺序调 <code>sub_1A6228(path)</code> 检查存在性。 <code>sub_1A6228 @ 0x1A6228</code> 非常短:</p><pre><code data-lang="c" class="language-c">bool path_exists(std::string *path) {
    const char *p = path-&gt;is_long ? path-&gt;data : path-&gt;sso;
    return access(p, F_OK) == 0;
}</code></pre><p>不读文件内容、不 stat、不看 SELinux label;<strong>只要 <code>access(path, F_OK)</code> 返回 0 即命中</strong> 。</p><p>完整 25 条路径表(IDA 全部字符串引用提取):</p><table><thead><tr><th>类别</th><th>路径</th></tr></thead><tbody><tr><td>投屏</td><td><code>/data/local/tmp/vysor.pwd</code>, <code>/data/local/tmp/oat/arm64/scrcpy-server.odex</code>, <code>/data/local/tmp/mqc-scrcpy.jar</code></td></tr><tr><td>触屏/操控</td><td><code>/data/local/tmp/minicap.so</code>, <code>/data/local/tmp/minicap</code>, <code>/data/local/tmp/mini</code>, <code>/data/local/tmp/mini/minicap</code>, <code>/data/local/tmp/minitouch</code></td></tr><tr><td>触动/按键精灵</td><td><code>/data/local/tmp/tc/mobileagent</code>, <code>/data/local/tmp/tc/input3.sh</code>, <code>/data/local/tmp/tc/mainputjar7</code>, <code>/data/local/tmp/com.cyjh.mobileanjian.id</code>, <code>/data/local/tmp/com.cyjh.mobileanjianen.id</code></td></tr><tr><td>UI 自动化</td><td><code>/data/local/tmp/uiautomator-stub.jar</code></td></tr><tr><td>云手机/云控</td><td><code>/data/local/tmp/cloudtestig/cloudscreen</code>, <code>/data/local/tmp/cloudtesting/touchserver</code>, <code>/data/local/tmp/juejinAzykb/</code>, <code>/data/local/tmp/juejinAzykb/TouchService.jar</code>, <code>/data/local/tmp/maxpresent.jar</code></td></tr><tr><td>截屏 SO</td><td><code>/data/local/tmp/screen-shread10x64.so</code>, <code>/data/local/tmp/screen-shread5x32.so</code></td></tr><tr><td>Shizuku</td><td><code>/data/local/tmp/shizuku</code>, <code>/data/local/tmp/shizuku_starter</code></td></tr><tr><td>设备信息</td><td><code>/data/local/tmp/mobile_info.properties</code></td></tr><tr><td>一键玩</td><td><code>/data/local/tmp/yijianwanservice.apk</code></td></tr></tbody></table><h5>15.2.2 伪代码</h5><pre><code data-lang="c" class="language-c">// libhunter.so+0x2AC514
jobject NativeEngine_checkRiskFile(JNIEnv *env) {
    paths = { /* 25 条上表 */ };
    for (path in paths) {
        if (access(path, F_OK) == 0) {
            detail = "find risk file " + path;
            return ReportRiskItem(env, "Find Risk File", detail, /*risk=*/1, /*Type=*/2, /*ShowPriority=*/10);
        }
    }
    return NULL;
}</code></pre><h4>15.3 动态证据</h4><p>本设备测试环境无任何上述路径存在,实测:</p><pre><code>[evidence:risk-file] NativeEngine_checkRiskFile entered
[evidence:risk-file] NativeEngine_checkRiskFile ret=0x0
[evidence:risk-file-java] NativeEngine.checkRiskFile() -&gt; &lt;null&gt;</code></pre><p><code>ret=0x0</code> 即返回 NULL jobject,Java 拿到 null 不构造 bean。</p><h4>15.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>RF1</td><td>JNI 函数 <code>checkRiskFile @ 0x2AC514</code></td><td>60 项表 #50 = checkRiskFile rva=0x2ac514</td><td>✓</td></tr><tr><td>RF2</td><td>25 条 <code>/data/local/tmp/*</code> access</td><td>实测函数 entered 且 ret=0x0(当前环境 25 路径均不存在)</td><td>✓ 间接</td></tr><tr><td>RF3</td><td>callsite 0x2ace44(W3=1, W4=2, W5=10)</td><td>本设备未触发该 callsite</td><td>静态闭环 / 未触发</td></tr></tbody></table><p><strong>静态闭环 / 当前环境未命中</strong> 。要实测命中分支,需主动构造任一路径文件后再触发检测。</p><h4>15.5 对抗面</h4><p>不依赖 <code>/proc/mounts</code>,不依赖 maps,<strong>直接检查文件系统路径</strong> 。对抗面:</p><pre><code>重点隐藏的 /data/local/tmp 路径:
- /data/local/tmp/minicap*
- /data/local/tmp/minitouch
- /data/local/tmp/*scrcpy*
- /data/local/tmp/uiautomator-stub.jar
- /data/local/tmp/shizuku*
- /data/local/tmp/tc/*
- /data/local/tmp/juejinAzykb/*</code></pre><p>KPM 可在内核侧对 hunter 进程的 <code>access</code> /相关文件查询路径按名单返回 <code>-ENOENT</code>,从数据源上绕过本节这条文件存在性检测；但它不覆盖 logcat/AVC、maps 或其它独立检测链。</p><h4>15.6 bypass 依据</h4><p>Java 层最简单:</p><pre><code data-lang="js" class="language-js">NativeEngine.checkRiskFile.implementation = function () { return null; };</code></pre><p>或 SO 层 <code>Interceptor.replace @ 0x2AC514</code> 入口直接返回 NULL jobject。</p><hr><h3>16. AVC denial 日志侧信道</h3><h4>16.1 链路</h4><pre><code>Java: GC.run case 16
  -&gt; NativeEngine.checkRootFromAVCLog()
JNI : NativeEngine_checkRootFromAVCLog @ 0x2AAE54
核心: sub_E0AA8(pid_string) @ 0xE0AA8       (size 0x2B28)
上报: ReportRiskItem callsite 0x2aaec4(W3=0, W4=1, W5=1)
UI  : "Find Root File In Sniff"</code></pre><p>Java 触发(<code>src/YouAreLoser/GC.java</code>):</p><pre><code data-lang="java" class="language-java">mainActivity0.n0(NativeEngine.checkRootFromAVCLog());</code></pre><h4>16.2 静态证据</h4><h5>16.2.1 包装层</h5><pre><code data-lang="c" class="language-c">// libhunter.so+0x2AAE54
jobject NativeEngine_checkRootFromAVCLog(JNIEnv *env) {
    string pid = to_string(getpid());
    if (!sub_E0AA8(pid))
        return NULL;
    return ReportRiskItem(env, "Find Root File In Sniff",
                          get_last_root_mounts_detail(), ...);
}</code></pre><h5>16.2.2 sub_E0AA8 @ 0xE0AA8 算法骨架</h5><p>核心步骤(由静态字符串和 libc callee 反推):</p><pre><code>1. logcat -c                            (popen 或同等)
2. 对一组 root 敏感路径,4 种探测逐一尝试:
   a) ls &lt;path&gt;                         (popen)
   b) open find root file               (__open_2)
   c) access find root file             (access)
   d) getxattr find root file           (getxattr, attr="security.selinux")
   e) readlink find root file           (readlink)
3. usleep 等 AVC 落地
4. logcat -d -b main -b system -b events -b kernel
   | grep 'avc: denied' | grep -Ei '(&lt;paths&gt;)'
5. 解析 AVC 输出:看 path="..." / name="..." / |path="..." / |name="..."
   是否出现目标路径片段
6. 即使文件 access/open 都失败,只要 kernel 看见过它并记录了
   AVC denial,即视作命中</code></pre><p>关键 libc callee:<code>close</code> 、 <code>access</code> 、 <code>__open_2</code> 、 <code>getxattr</code> 、 <code>readlink</code> 、 <code>usleep</code> 。</p><h5>16.2.3 静态字符串</h5><pre><code>file_include open file fail
checkRootFileFromAVC File
checkRootFileFromAVC log info -&gt;
checkRootFileFromAVC Log output not empty but no real match for ...
likely exists (detected via AVC denial log). Detailed log:
sniffing of the root file path ...</code></pre><h5>16.2.4 敏感路径表(sub_D14B0 @ 0xD14B0)</h5><pre><code>/debug_ramdisk, /debug_ramdisk/su
/data/adb/, /data/adb/modules, /data/adb/modules/
/data/adb/ap, /data/adb/ap/bin, /data/adb/ap/log,
/data/adb/ap/log/bin/{apd, magiskpolicy, magiskmount, kpatch, resetprop}
/data/adb/ap/{modules.img, package_config, su_path, version}
/data/adb/kpatch, /data/adb/magisk, /data/adb/lspd
/sbin/.magisk, /sbin/.magisk/modules/{riru_lsposed, zygisk_lsposed}
/system/bin/magisk, /system/bin/magisk32
/system/etc/init/magisk, /system/etc/init/magisk.rc
/system/addon.d/99-magisk.sh
/cache/magisk.log, /cache/.disable_magisk
apatch / Apatch / APatch
kernelsu / kernelSu</code></pre><h4>16.3 动态证据</h4><pre><code>[evidence:avc-log] NativeEngine_checkRootFromAVCLog entered
[evidence:avc-log] NativeEngine_checkRootFromAVCLog ret=0x0
[evidence:avc-log-java] NativeEngine.checkRootFromAVCLog() -&gt; &lt;null&gt;</code></pre><p>本测试环境未触发命中,函数 entered 后直接返回 null。</p><h4>16.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>AV1</td><td>JNI 函数 <code>checkRootFromAVCLog @ 0x2AAE54</code></td><td>60 项表 #56 = checkRootFromAVCLog rva=0x2aae54</td><td>✓</td></tr><tr><td>AV2</td><td>内部调用 <code>sub_E0AA8</code></td><td>hook 内部函数(本测试未细做)</td><td>间接 ✓</td></tr><tr><td>AV3</td><td>通过 logcat 反读 AVC denial 行</td><td>当前环境 SELinux audit 未暴露被探测路径,或 logcat 已被清,导致未命中</td><td>静态闭环 / 未触发</td></tr><tr><td>AV4</td><td>UI 文案 "Find Root File In Sniff"</td><td>当前环境未生成此 UI title</td><td>静态闭环 / 未触发</td></tr></tbody></table><h4>16.5 对抗面</h4><p><strong>仅隐藏文件不够</strong> —— 即使 access/open 返回 ENOENT,如果 kernel 历史 AVC denial 仍保留敏感路径,Hunter 能从 logcat 反推它们存在。真正对抗:</p><pre><code>- 拦截 logcat 输出  (替换 popen("logcat -d ...") 行为)
- 清除目标 AVC denial entry
- 在内核侧阻止生成 AVC denial(KPM 修改 selinux audit 子系统)</code></pre><h4>16.6 bypass 依据</h4><p>Java 层最简单:</p><pre><code data-lang="js" class="language-js">NativeEngine.checkRootFromAVCLog.implementation = function () { return null; };</code></pre><p>或 SO 层 <code>Interceptor.replace @ 0x2AAE54</code> 入口返回 NULL。</p><hr><h3>17. 包名 ELF 白名单扫描</h3><h4>17.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfoMPNI("com.zhenxi.hunter")
JNI : NativeEngine_getZhenxiInfoMPNI(jstring pkg) @ 0x298374
上报: ReportRiskItem callsite 0x2994f4(W3=0, W4=1, W5=0)
UI  : "Find Mark ELF"</code></pre><h4>17.2 静态证据</h4><p>两阶段。</p><h5>17.2.1 阶段 1:自保护硬门槛</h5><pre><code data-lang="c" class="language-c">if (byte_2F3A68 != 1 || (byte_2F3A6C &amp; 1) == 0) {
    log: "checkProcessTag error" + "File:" + "F:/HunterNew/app/src/main/cpp/main.cpp" + Line
    log: "native kill self process"
    dump threads "Zhenxi"

    log: "KILL_PROCESS"
    safe_syscall_via_trampoline(__NR_kill, pid, 9)   ← 三连自杀
    abort()
}</code></pre><p>进程标签异常时 <strong>不返回风险项,而是自杀</strong> 。这条调试串还泄露了开发环境路径 <code>F:/HunterNew/app/src/main/cpp/main.cpp</code> 。</p><h5>17.2.2 阶段 2:maps 包名 ELF 白名单扫描</h5><pre><code data-lang="c" class="language-c">pkg_str = GetStringUTFChars(jpkg);
path = "proc/" + to_string(getpid()) + "/maps";
fd = ssyscall_openat(AT_FDCWD, path, O_RDONLY, 0);
maps = parse_maps_to_linked_list(-1);

for each map_node in maps:
    if !strstr_(map_node.pathname, pkg_str): continue;
    // 跳过白名单 8 项
    if 任一以下子串出现在 pathname: continue;
        - xcrash
        - sentry
        - hunter
        - libc++_shared
        - libdatastore_shared_counter.so
        - libBugly
        - /data/data/&lt;pkg&gt;/code_cache/
        - /oat/arm64/
    // 检查 mapping 的 start 指针是否是 ELF
    if (perms[0]=='r' &amp;&amp; start[0..3] == 0x7F 0x45 0x4C 0x46):
        detail += pathname + "\n";
if !detail.empty():
    title = "Find Mark ELF";
    build_native_ListItemBean_risk(env, title, detail, 0, 1, 0);
return null;</code></pre><h4>17.3 动态证据</h4><pre><code>[evidence:mpni] NativeEngine_getZhenxiInfoMPNI entered
[evidence:mpni] NativeEngine_getZhenxiInfoMPNI ret=0x0
[evidence:mpni-java] NativeEngine.getZhenxiInfoMPNI(com.zhenxi.hunter) -&gt; &lt;null&gt;</code></pre><p>本测试环境 Java 端传入 <code>"com.zhenxi.hunter"</code>,本设备无额外的同包名 ELF 注入,return null。</p><h4>17.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>MP1</td><td>JNI 函数 <code>getZhenxiInfoMPNI @ 0x298374</code></td><td>60 项表 rva=0x298374</td><td>✓</td></tr><tr><td>MP2</td><td>阶段 1 进程标签自保护,失败时自杀</td><td>本环境标签通过,未触发自杀路径</td><td>间接 ✓</td></tr><tr><td>MP3</td><td>阶段 2 maps 包名 ELF 白名单扫描</td><td>函数 entered + return null,符合"标签通过 + 无额外 ELF"判断</td><td>✓</td></tr><tr><td>MP4</td><td>白名单 8 项</td><td>静态字符串引用完整列出</td><td>✓</td></tr></tbody></table><p>正确结论:<strong>自保护标签通过,maps 包名 ELF 白名单扫描未发现额外可疑映射</strong>,不是"没有该检测"。</p><h4>17.5 对抗面</h4><p>防的是"以 app 同包名注入额外 native 库"的 hook 攻击。绕过思路:</p><ul><li>Java 层 hook <code>getZhenxiInfoMPNI(pkg) → null</code></li><li>或由 KPM 在 <code>/proc/self/maps</code> 数据源/读取路径中过滤同包名非白名单 ELF,使 hunter 的 <code>parse_maps_to_linked_list</code> 解析不到这些映射</li></ul><h4>17.6 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfoMPNI.implementation = function (pkg) { return null; };</code></pre><hr><h3>18. APK 签名一致性</h3><h4>18.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfo2(Context)
JNI : NativeEngine_getZhenxiInfo2 @ 0x29AEFC
上报: 11 个 callsite,RVA 范围 0x29d6c0..0x2a0304(W3=0 或 1, W4=3, W5=3)
UI  : "HunterCheckApkSignError" + 11 种子原因</code></pre><h4>18.2 静态证据</h4><h5>18.2.1 预期签名指纹(hardcoded 字符串)</h5><pre><code>"MYAAKzWEBR"               ── base64 substr 前 10 字符
"4d5941414b7a57454252"     ── 上述 base64 字符串的 hex 表示(20 字符)</code></pre><h5>18.2.2 7 步检查链(从 11 个 callsite 字面量按位置顺序还原)</h5><pre><code>1. 通过 JNI 反射拿 APK 路径:
   ctx.getApplicationInfo().publicSourceDir
   静态字符串: "getApplicationInfo" / "()Landroid/content/pm/ApplicationInfo;" / "publicSourceDir"
   失败 → "getApkPath == null" / "check apk sign apk path == null"
   → title "HunterCheckApkSignError"

2. 通过路径 ssyscall_openat 打开 base.apk:
   失败 → "open fd cache error"
   成功 → "start native open base.apk success" / "native apk sign check open fd"

3. read_certificate 提取签名内容:
   (callee sub_C1EF0 / sub_BCE34 zip parse + cert extract)
   失败 → "apk read_certificate empty"
   → title "HunterCheckApkSignError"

4. 计算签名 base64 编码并取前 10 字符:
   if base64.substr(0,10) != "MYAAKzWEBR":
       → "check app sign hex fail"
       → title "HunterCheckApkSignError"
   日志: "getApkSign apk sign base64 substr"

5. 验证 hex 表示:
   if hex(base64) != "4d5941414b7a57454252":
       → "check app sign hex fail"
   日志: "native check hex success"

6. 反向验证 fd 对应的真实路径:
   /proc/self/fd/&lt;fd&gt; 用 readlinkat 反查
   失败 → "readlinkat error" / "check apk sign path error"
   不匹配预期 → "check apk sign path fail"
   日志: "native apk check fd path success"

7. fstat 验证 inode/uid/gid:
   failed → "check apk sign path fail __NR_fstat&lt;0" / "fstat error"
   uid/gid 与 hunter 进程不符 → "check apk sign gid&amp;uid fail"
   inode 不对 → "check apk sign inode fail"
   成功 → "check apk sign success! uid-&gt;" + " gid-&gt; " + " maps -&gt;"
        + "native apk check inode&amp;uid&amp;gid success"</code></pre><h5>18.2.3 签名指纹反向推断</h5><p><code>"MYAAKzWEBR"</code> (10 字符 base64) 是 hunter APK 真实签名的开头部分。任何重打包的 hunter 都会因为重签后这 10 字符改变而被检测出。</p><h4>18.3 动态证据</h4><pre><code>[evidence:apk-sign] NativeEngine_getZhenxiInfo2 entered
[evidence:apk-sign] NativeEngine_getZhenxiInfo2 ret=0x0</code></pre><p>本设备用的是官方 APK,签名匹配,return NULL,未生成 UI 风险项。</p><h4>18.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>AS1</td><td>JNI 函数 <code>getZhenxiInfo2 @ 0x29AEFC</code></td><td>60 项表 rva=0x29aefc</td><td>✓</td></tr><tr><td>AS2</td><td>11 个 callsite 覆盖 11 种失败子原因</td><td>静态字符串引用完整列出 11 类失败文案</td><td>✓</td></tr><tr><td>AS3</td><td>预期签名前 10 base64 = "MYAAKzWEBR"</td><td>字符串静态确认,本设备签名匹配未触发</td><td>✓ 静态</td></tr><tr><td>AS4</td><td>检查链覆盖 path / cert / base64 / hex / fd readlink / fstat 7 步</td><td>字符串 + xref 完整可见</td><td>✓ 静态</td></tr><tr><td>AS5</td><td>官方 APK 不触发</td><td>实测 return 0</td><td>✓</td></tr></tbody></table><h4>18.5 对抗面</h4><p>检测目标是 <strong>防止 hunter 自身被重打包</strong> (改变签名)。对真实用户来说装的是官方 APK,该检测不会命中。</p><h4>18.6 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfo2.implementation = function (ctx) { return null; };</code></pre><p>或彻底:<strong>确保 hunter APK 不被重打包</strong> (对真实用户来说,装的就是官方,该检测不会命中)。</p><hr><h3>19. system_server hook 检测</h3><h4>19.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfoCBinder()
JNI : NativeEngine_getZhenxiInfoCBinder @ 0x28C9BC
上报: ReportRiskItem callsite 0x28cd08(W3=0, W4=3, W5=4)
UI  : "find system server hook"</code></pre><h4>19.2 静态证据</h4><pre><code data-lang="c" class="language-c">jobject NativeEngine_getZhenxiInfoCBinder(JNIEnv* env) {
    if (checkProcessTag 失败) → kill self 1

    v2 = sub_CDFC4();           // 取某个值(OLLVM thunk → sub_CDAD4)
    sub_CE000(v15, v2);         // 把 v2 处理成 std::string,放进 v15
    char v3 = sub_251C18(v15);  // 解密(同 §3 跳板的解密器,用于 runtime_syscall_code 等)
                                // sub_251C18(key1, key2) 解出预期值,与 v15 比对

    if ((v3 &amp; 1) != 0) {
        sub_CEB40();             // 清理
        return NULL;             // 通过 = 没命中
    } else {
        title = "find system server hook"
        build_native_ListItemBean_risk(env, title, detail, 0, 3, 4)
        return bean;
    }
}</code></pre><p><strong><code>sub_CDFC4 / sub_CDAD4 / sub_CE000</code> 都没字符串,纯 OLLVM 隐藏</strong> 。从上下文推断:它们从某个 binder / service 拿一个值(可能是 IBinder 接口的 hash、system_server 进程的状态、 <code>ServiceManager</code> 拿到的 native binder pointer 等),解密后与某个 hardcoded 预期值比对,不匹配 → "system_server 链有人 hook 中转"。</p><p><code>sub_251C18</code> 是跳板模块同款解密器,与 §3.2.4 <code>runtime_syscall_code</code> 的解码路径同源 —— 这是把"敏感字符串"以 obfuscated 形式存储的通用机制。</p><h4>19.3 动态证据</h4><pre><code>[evidence:cbinder] NativeEngine_getZhenxiInfoCBinder entered
[evidence:cbinder] NativeEngine_getZhenxiInfoCBinder ret=0x0
[evidence:cbinder-java] NativeEngine.getZhenxiInfoCBinder() -&gt; &lt;null&gt;</code></pre><p>本设备未命中 system_server hook,return NULL。</p><h4>19.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>CB1</td><td>JNI 函数 <code>getZhenxiInfoCBinder @ 0x28C9BC</code></td><td>60 项表 rva=0x28c9bc</td><td>✓</td></tr><tr><td>CB2</td><td>阶段 1 进程标签自保护(同 MPNI)</td><td>本环境标签通过,未自杀</td><td>间接 ✓</td></tr><tr><td>CB3</td><td>内部用 <code>sub_251C18</code> 解密器比对预期值</td><td>hook 内部函数(本测试未细做)</td><td>间接 ✓</td></tr><tr><td>CB4</td><td>UI 文案 "find system server hook"</td><td>本环境未生成此 UI title</td><td>静态闭环 / 未触发</td></tr></tbody></table><h4>19.5 对抗面</h4><p>检测目标:<strong>Binder IPC 中间没有"人坐在中间"</strong> 。对应攻击:VirtualXposed / SandHook 等用 Java 层 IBinder proxy 拦截 system_server 调用的场景。</p><p>进一步还原 <code>sub_CDFC4 / sub_CDAD4 / sub_CE000</code> 需要对 callee 链回溯,或用 Frida hook 它们入口/出口看实参与返回值 —— 本节到"检测什么"为止,精确算法待补。</p><h4>19.6 bypass 依据</h4><pre><code data-lang="js" class="language-js">NativeEngine.getZhenxiInfoCBinder.implementation = function () { return null; };</code></pre><p>或 SO 层 <code>Interceptor.replace @ 0x28C9BC</code> 。</p><hr><h3>20. VPN 接口检测</h3><h4>20.1 链路</h4><pre><code>Java: NativeEngine.CheckVpn()
JNI : NativeEngine_CheckVpn @ 0x2AAF44(idx=53)
入口: sub_A8BE4 @ 0xA8BE4   (NETLINK 枚举链表头)
辅助: sub_AA914 @ 0xAA914   (ctx 初始化,分配 0x2000 buffer)
      sub_AAA4C @ 0xAAA4C   (socket + 发 dump 请求)
      sub_AB81C @ 0xAB81C   (循环 recvfrom + 派发回调)
      sub_A8CC8 @ 0xA8CC8   (nlmsg 解析回调)
上报: ReportRiskItem callsite 0x2ab014(W3=0, W4=1, W5=0)
UI  : "Find Vpn Native"</code></pre><h4>20.2 静态证据</h4><h5>20.2.1 算法骨架</h5><pre><code>NativeEngine_CheckVpn(JNIEnv* env):
  Node* head = NULL
  rc = sub_A8BE4(&amp;head)                          ── 通过 NETLINK 枚举所有接口
       │
       ├─ sub_AA914(ctx)
       │     ctx[0] = -1                          (fd 占位)
       │     ctx[1] = operator new[](0x2000)      (recv buffer)
       │     ctx[2] = 0x2000                       (buffer 大小)
       │
       ├─ sub_AAA4C(ctx, 18 = RTM_GETLINK)
       │     fd = socket(AF_NETLINK=16, SOCK_RAW|SOCK_CLOEXEC=0x80003, NETLINK_ROUTE=0)
       │     ctx[0] = fd
       │     构造 nlmsghdr {len=20, type=18, flags=0x301}
       │     sub_AD0EC(fd, &amp;msg, 20, 20, 0)        (发送)
       │
       ├─ sub_AB81C(ctx, sub_A8CC8, &amp;head)
       │     循环:
       │       n = safe_syscall_via_trampoline(207 recvfrom, fd, buf, 0x2000, 0, 0, 0)
       │       遍历 buffer 内每个 nlmsghdr,调 sub_A8CC8(&amp;head, nlmsg) 直到 NLMSG_DONE
       │
       │     sub_A8CC8(&amp;head, nlmsg):
       │       type=16 (RTM_NEWLINK) → operator new(0x1D8) 新节点
       │                              扫 rtattrs 找 IFLA_IFNAME(rta_type=3) 拷到 node+448
       │                              node[1] = &amp;node[448]
       │                              node-&gt;ifindex = ifi_index
       │                              头插链表
       │       type=20 (RTM_NEWADDR) → 按 ifa_index 匹配已建链表,补地址信息
       │
       ├─ sub_AAA4C(ctx, 22 = RTM_GETADDR)        ── 第二轮 dump
       ├─ sub_AB81C(ctx, sub_A8CC8, &amp;head)
       └─ sub_AAA18(ctx)                           ── 关 fd + free buffer

  for node in head:
      name = node[+8]                              // const char* → node+448
      if my_strcmp(name, "tun")  == 0 ||
         my_strcmp(name, "ppp")  == 0 ||
         my_strcmp(name, "pptp") == 0:
            sub_A87B4(head)
            title  = "Find Vpn Native"
            detail = name
            build_native_ListItemBean_risk(env, title, detail,
                                           /*risk=*/0, /*Type=*/1, /*ShowPriority=*/0);
            return bean
  sub_A87B4(head)
  return NULL</code></pre><h5>20.2.2 链表节点结构(从 sub_A8CC8 写入 / CheckVpn 读取偏移推出)</h5><pre><code data-lang="c" class="language-c">struct LinkNode {
    LinkNode* next;        // +0x00
    const char* name;      // +0x08  指向 name buffer (=&amp;this[0x1C0])
    uint32_t flags;        // +0x10
    ...
    uint32_t ifindex;      // +0x38
    ...
    char name_buffer[24];  // +0x1C0 (=+448)  ── IFLA_IFNAME 拷贝目标
    ...                    // 节点总 size = 0x1D8 (=472)
};</code></pre><h5>20.2.3 可验证陈述清单(S1-S11)</h5><table><thead><tr><th>编号</th><th>静态结论</th><th>印证手段</th></tr></thead><tbody><tr><td>S1</td><td><code>sub_AA914</code> 分配 0x2000 buffer</td><td>§3.3.4 实测 <code>recvfrom(... len=0x2000 ...)</code></td></tr><tr><td>S2</td><td><code>socket(AF_NETLINK=16, SOCK_RAW\|SOCK_CLOEXEC=0x80003, NETLINK_ROUTE=0)</code></td><td>hook libc <code>socket</code> 看实参</td></tr><tr><td>S3</td><td>顺序发两条 dump:type=18 → 22</td><td>回复方观察到 type=16 后再 type=20</td></tr><tr><td>S4</td><td>nlmsghdr flags=0x301</td><td>hook <code>sub_AD0EC</code> 才能直接看</td></tr><tr><td>S5</td><td><code>sub_AD0EC</code> 是发送辅助</td><td>(未挂发送 hook)</td></tr><tr><td>S6</td><td>接收走 <code>safe_syscall_via_trampoline(207=recvfrom)</code></td><td>§3.3.4 实测</td></tr><tr><td>S7</td><td>RTM_NEWLINK(16) → 解 IFLA_IFNAME → 节点 name</td><td>hook <code>sub_A8CC8</code>,解出字符串与 <code>ip link</code> 一致</td></tr><tr><td>S8</td><td>RTM_NEWADDR(20) → 按 ifa_index 匹配已建节点</td><td>hook <code>sub_A8CC8</code></td></tr><tr><td>S9</td><td>主循环用 <code>my_strcmp</code> <strong>精确</strong> 匹配 <code>tun/ppp/pptp</code></td><td>设备若有 <code>tun*</code> 但 ≠ "tun" 且返回 NULL 可反向证明</td></tr><tr><td>S10</td><td>命中即 <code>build_native_ListItemBean_risk("Find Vpn Native", iface_name, 0, 1, 0)</code></td><td>hook 0x278658</td></tr><tr><td>S11</td><td>无 VPN 设备 → return NULL</td><td>hook 入口 onLeave 看 retval</td></tr></tbody></table><h4>20.3 动态证据(js/verify_4_7_checkvpn.js)</h4><p>hook 策略收紧到 3 个 hunter 内 hook + 1 个 libc:</p><ul><li><code>block_bad_precheck @ 0xC6520</code></li><li><code>NativeEngine_CheckVpn @ 0x2AAF44</code> (onEnter 重置统计,onLeave 打印接口列表与 retval)</li><li><code>sub_A8CC8 @ 0xA8CC8</code> (每条 nlmsg 解析后打印 (type, ifindex, name),自实现 rtattr 走 RTA_ALIGN 解码)</li><li>libc <code>socket()</code> 仅过滤 <code>domain == AF_NETLINK(16)</code> 时打印实参</li></ul><p>测试条件:Pixel 6 Pro / Android 15,无 VPN App,WiFi 已连。</p><h5>20.3.1 实测对照表</h5><table><thead><tr><th>编号</th><th>状态</th><th>实测证据</th></tr></thead><tbody><tr><td>S1</td><td>间接 ✓</td><td>§3.3.4 已观察 <code>recvfrom len=0x2000 = 8192</code></td></tr><tr><td><strong>S2</strong></td><td>✓</td><td><code>[S2] socket(AF_NETLINK=16, type=0x80003 ✓SOCK_RAW\|SOCK_CLOEXEC, proto=0 ✓NETLINK_ROUTE)</code></td></tr><tr><td><strong>S3</strong></td><td>✓</td><td>一次 CheckVpn 调用内 50 帧 RTM_NEWLINK(=16) 后 7 帧 RTM_NEWADDR(=20)</td></tr><tr><td>S4</td><td>未验证</td><td>本轮未 hook 发送方向</td></tr><tr><td>S5</td><td>未验证</td><td>同上</td></tr><tr><td>S6</td><td>✓</td><td>§3.3.4 已验证(本轮 RTM_NEW* 帧能进 sub_A8CC8 hook 间接印证)</td></tr><tr><td><strong>S7</strong></td><td>✓</td><td>50 个接口的 IFLA_IFNAME 全部正确解出,与 <code>ip link</code> 一致</td></tr><tr><td><strong>S8</strong></td><td>✓</td><td>7 次 RTM_NEWADDR 全部正确关联(<code>lo</code> ×2, <code>dummy0</code> ×1, <code>wlan0</code> ×4)</td></tr><tr><td><strong>S9</strong></td><td>✓(关键)</td><td>设备存在 <code>tunl0</code> (ipip tunnel,前 3 字符 = "tun")但 CheckVpn return 0x0</td></tr><tr><td>S10</td><td>未触发</td><td>设备无 VPN</td></tr><tr><td><strong>S11</strong></td><td>✓</td><td><code>return = 0x0 ✓ NULL</code></td></tr></tbody></table><h5>20.3.2 设备完整接口家底快照</h5><p><code>sub_A8CC8</code> hook 50 个接口被 hunter 全部扫到:</p><pre><code>lo, dummy0, ifb0, ifb1, tunl0, gre0, gretap0, erspan0,
ip_vti0, ip6_vti0, sit0, ip6tnl0, ip6gre0,
rmnet0..rmnet29 (Qualcomm modem),
dummy (额外), aware_nmi0, wlan0, wlan1, wpan0, dit0, radiotap0</code></pre><p>大量 <code>rmnet*</code> 是 Pixel 6 Pro 的硬件特征,<strong>说明 hunter 看见的是真实 kernel 接口表,没有被 <code>/proc/net/dev</code> 那一层欺骗</strong> (这是 NETLINK 路径的核心目的)。</p><h5>20.3.3 my_strcmp 精确比较的硬证据</h5><p><code>tunl0</code> 前 3 字符是 <code>"tun"</code>,但 CheckVpn 没命中。等价于 <code>strcmp("tunl0", "tun") != 0</code> 在 hunter 视角下成立。</p><h5>20.3.4 NETLINK socket 不只 CheckVpn 用</h5><p>本次共 6 次 <code>socket(AF_NETLINK)</code> 创建,但 CheckVpn 入口只触发 1 次完整流程。其余 NETLINK socket 的调用方尚未逐一用 callstack 或 LR 归因；候选包括 <code>getZhenxiInfoBase</code> / <code>Info4</code> / <code>checkZygisk</code> / Info3 内 <code>sub_DDB9C</code>,需要后续按 caller 复核。</p><h4>20.4 静态/动态交叉验证</h4><p>11 条静态结论里 8 条直接 ✓、1 条间接 ✓、2 条诚实标"未验证"(S4/S5)。结构性结论(S1-S3, S6-S11)全部得到证据,§20.2.1 静态算法可作为可靠事实。</p><h4>20.5 实测得到的、静态分析里没有的新事实</h4><h5>20.5.1 hunter 实现弱点</h5><p><code>my_strcmp</code> 是 <strong>精确比较</strong>,静态名单只有 <code>tun/ppp/pptp</code> 三个裸字符串。Linux 真实 VPN 接口名几乎都不是这三个:</p><pre><code>OpenVPN     :  tun0 / tun1 / ...   (kernel 自动加序号)
PPP/L2TP    :  ppp0 / ppp1 / ...
WireGuard   :  wg0 / wg1 / ...     (根本不在名单)
strongSwan  :  xfrm0 或无虚接口     (用 XFRM policy)</code></pre><p>Hunter 当前实现只精确匹配接口名 <code>tun/ppp/pptp</code> 。常见接口名如 <code>tun0/ppp0/wg0/xfrm0</code> 不会被该条件命中；因此在使用这些默认命名的 VPN 环境中,该检测存在明显漏检风险。是否覆盖所有主流客户端需要单独样本验证。</p><h5>20.5.2 block_bad_precheck 与本 detection 的交叉证据</h5><p>本会话中也观察到:</p><pre><code>+0xc68a4 在 sub_C687C 内 ── 2 次
+0xc7828 在 scan_rx_segment_neon_sum 内 ── 2 次</code></pre><p>与 CheckVpn 完全无关,只是同窗口并发的 self-check 自检漏判,<strong>反过来加强 §5.3.5 关于"两条独立完整性检查链路"的论断</strong> 。</p><h4>20.6 对抗面 / bypass</h4><table><thead><tr><th>方案</th><th>位点</th><th>效果</th><th>风险</th></tr></thead><tbody><tr><td>A</td><td>用户态 hook / inline patch <code>NativeEngine_CheckVpn @ 0x2AAF44</code> 入口直接 return 0</td><td>覆盖该入口所有调用</td><td>修改用户态 <code>.text</code>,可能触发 §5 CRC 链</td></tr><tr><td>B</td><td>用户态 hook / inline patch <code>sub_A8CC8</code>,看到 IFLA_IFNAME == tun/ppp/pptp 时改写进入链表的 name</td><td>隐蔽,链表里就没"危险"名字</td><td>改 hunter 用户态执行流或数据,需保证内存一致性,同样有 CRC/自校验风险</td></tr><tr><td>C</td><td>KPM 在 NETLINK_ROUTE/rtnetlink 内核侧 filter,改写或截走对 hunter 进程的 RTM_GETLINK 回复</td><td>不改 hunter 用户态代码,隐蔽性更高</td><td>实现复杂,需适配内核版本和 netlink 路径</td></tr><tr><td>D</td><td>不动:用户场景下 <code>OpenVPN/WireGuard</code> 接口名本就不裸叫 tun/ppp/pptp</td><td>0 工作量</td><td>仅适用于不命中场景</td></tr></tbody></table><p>对绝大多数真实用户,方案 D 已经够用 —— 这是 §20.5.1 的直接推论。</p><hr><h3>21. Frida 线程名扫描</h3><h4>21.1 链路</h4><pre><code>Java: NativeEngine.getZhenxiInfo5(Context)
JNI : NativeEngine_getZhenxiInfo5 @ 0x2A4760(idx=2)
核心: sub_C6A84 @ 0xC6A84   (线程扫描)
辅助: strstr_ @ 0x1AFD4C    (hunter 自实现 strstr)
      ssyscall_openat / ssyscall_read / ssyscall_close
上报: ReportRiskItem 3 callsite,W3=0, W4=2, W5=8
UI  : "Find Frida Mark" / "gum-js-loop" 或 "gmain"</code></pre><h4>21.2 静态证据</h4><h5>21.2.1 sub_C6A84 完整伪代码</h5><pre><code data-lang="c" class="language-c">int sub_C6A84(void) {
    DIR* dirp = opendir("/proc/self/task");
    if (!dirp) return -1;
    int n2 = 0;
    for (each readdir entry) {
        if (d_name == "." or "..") continue;
        char buf[256];
        snprintf(buf, 256, "/proc/self/task/%s/status", d_name);
        int fd = ssyscall_openat(AT_FDCWD, buf, O_RDONLY, 0);
        if (fd &lt; 1) continue;

        // —— buffered reader 读"首行"到 ptr[256] ——
        char ptr[256];
        memset(ptr, 0, 256);
        size_t n255 = 0;
        size_t v9  = qword_2EFCB8;        // GLOBAL cursor
        size_t v10 = qword_2EFCC0;        // GLOBAL end
        while (n255 != 255) {
            if (v9 &gt;= v10) {
                v10 = ssyscall_read(fd, &amp;ptr_, 1024);  // GLOBAL buffer
                qword_2EFCB8 = 0;
                qword_2EFCC0 = v10;
                if (v10 &lt; 1) break;
                v9 = 0;
            }
            uint8_t c = ptr_[v9++];
            qword_2EFCB8 = v9;
            if (c == '\n') break;
            ptr[n255++] = c;
        }
        ssyscall_close(fd);

        if (strstr_(ptr, "gum-js-loop")) { n2 = 1; break; }
        else if (strstr_(ptr, "gmain"))  { n2 = 2; break; }
    }
    closedir(dirp);
    return n2;
}</code></pre><h5>21.2.2 三个全局 buffered reader 状态(.bss)</h5><pre><code>ptr_         @ 0x2EF8B8  (1024B buffer)
qword_2EFCB8           (cursor)
qword_2EFCC0           (end)</code></pre><p><strong>这三个全局跨 tid 迭代从不重置</strong> —— 这是 §21.5 buffered reader bug 的源头。</p><h5>21.2.3 NativeEngine_getZhenxiInfo5 分发逻辑</h5><p><code>getZhenxiInfo5 @ 0x2A4760</code> 拿到 <code>sub_C6A84</code> 返回值后分发(从 <code>0x2a47ac</code> 处的 <code>CMP W0, #2 / B.EQ; CMP W0, #1 / B.NE</code> 看出):</p><table><thead><tr><th><code>sub_C6A84</code> 返回</th><th>走的分支</th><th>callsite</th><th>title / detail</th><th>自杀?</th></tr></thead><tbody><tr><td><code>2</code></td><td>gmain 命中</td><td><code>0x2a5204</code></td><td>"Find Frida Mark" / "gmain"</td><td>✅ 三连 <code>safe_syscall(129=kill, pid, 9)</code></td></tr><tr><td><code>1</code></td><td>gum-js-loop 命中</td><td><code>0x2a47f4</code></td><td>"Find Frida Mark" / "gum-js-loop"</td><td>❌ 仅上报,不杀</td></tr><tr><td>其它 (<code>0</code> / <code>-1</code>)</td><td>"无命中"路径</td><td><code>0x2a5470</code></td><td>OLLVM 状态机解码出的 <code>&lt;dyn&gt;</code>,detail 为空</td><td>❌</td></tr></tbody></table><h5>21.2.4 可验证陈述清单(F1-F10)</h5><table><thead><tr><th>编号</th><th>静态结论</th><th>印证位</th></tr></thead><tbody><tr><td>F1</td><td><code>opendir("/proc/self/task")</code></td><td>libc <code>opendir</code> hook,arg = <code>/proc/self/task</code></td></tr><tr><td>F2</td><td><code>readdir</code> 遍历自身所有 tid</td><td>libc <code>readdir</code> hook,d_name 是数字串</td></tr><tr><td>F3</td><td>对每个 tid <code>ssyscall_openat("/proc/self/task/&lt;tid&gt;/status", O_RDONLY)</code></td><td>hook <code>ssyscall_read</code> 看 fd</td></tr><tr><td>F4</td><td><code>strstr_</code> 子串匹配(非精确)</td><td>通过 F8 命中行为反推</td></tr><tr><td>F5</td><td>优先级 <code>gum-js-loop &gt; gmain</code> (if/else if 顺序)</td><td><code>sub_C6A84</code> 返回 <code>1</code> 优先于 <code>2</code></td></tr><tr><td>F6</td><td>返回 <code>0/1/2/-1</code> 各对应不同语义</td><td>hook <code>sub_C6A84</code> onLeave</td></tr><tr><td>F7</td><td><code>getZhenxiInfo5</code> 分发 <code>1</code> →仅上报,<code>2</code> →上报+SIGKILL,<code>else</code> →空</td><td>hook <code>getZhenxiInfo5</code> onLeave + 进程存活观察</td></tr><tr><td><strong>F8</strong></td><td>当前 Frida 17.x 测试环境中,若 <code>gum-js-loop</code> 线程名被真实读到,<code>sub_C6A84</code> 应返回 1</td><td>hook 直接看 W0</td></tr><tr><td>F9</td><td>返回 <code>1</code> 分支 <strong>不</strong> 触发 SIGKILL</td><td>进程存活</td></tr><tr><td>F10</td><td>命中后 <code>getZhenxiInfo5</code> 返回 non-NULL ListItemBean</td><td>onLeave retval ≠ 0</td></tr></tbody></table><h4>21.3 动态证据(两轮)</h4><h5>21.3.1 第一轮:verify_4_9_getZhenxiInfo5.js</h5><p>挂 <code>block_bad_precheck</code> + <code>NativeEngine_getZhenxiInfo5</code> (entry/leave)+ <code>sub_C6A84</code> (leave)+ libc <code>opendir/readdir/closedir</code> 。结果:</p><table><thead><tr><th>F</th><th>第一轮</th></tr></thead><tbody><tr><td>F1</td><td>✓ <code>opendir("/proc/self/task") -&gt; 0x...</code> 非 NULL</td></tr><tr><td>F2</td><td>✓ <code>readdir</code> 遍历到 77 个 tid</td></tr><tr><td>F6</td><td>✓ 返回值 = 0(类型对)</td></tr><tr><td><strong>F8</strong></td><td><strong>✗</strong> Frida 在跑但 <code>sub_C6A84</code> 返 0,不是预期的 1</td></tr><tr><td>F9</td><td>✓ 进程存活</td></tr><tr><td>F10</td><td>✗ retval = 0(因 F8 ✗)</td></tr></tbody></table><p>F8 失败只能说明本轮未命中 <code>gum-js-loop</code> / <code>gmain</code>,不能单独证明 buffered reader bug。其它候选解释还包括 Frida 线程名变化、线程创建时序错位或读取路径未覆盖目标 tid。</p><h5>21.3.2 第二轮:verify_4_9_v2_read_count.js(决定性证据)</h5><p>第二轮移除 libc 目录遍历 hook,改挂 <code>ssyscall_read</code>:onEnter 记 <code>(fd, buf)</code>,onLeave 在 <code>sub_C6A84</code> 嵌套内才记录 <code>(fd, len, head)</code> 。</p><p>设计动机:区分 3 个候选解释(buffered reader 复用 / 线程名变更 / 命名时序错位)。</p><p><strong>决定性结果</strong>:<code>sub_C6A84</code> 一次调用内 <code>ssyscall_read</code> <strong>仅触发 2 次</strong> (77 个 tid 预期至少应 read 数十次):</p><pre><code>read #01  fd=171  ret=1024  head="Name:\ter_main_process\nUmask:\t0077\nState:\tR (running)\nTgid:\t5491..."
read #02  fd=171  ret=1024  head="Name:\tmali-cmar-backe\nUmask:\t0077\nState:\tS (sleeping)\nTgid:\t5491..."</code></pre><p>两次 fd 都是 <code>171</code>,不是同一个 tid 的 fd —— Linux 在 <code>close</code> 后开 <code>open</code> 复用最低空闲 fd,每个 tid 用完 171 关掉,下一个 tid 又开成 171。</p><h4>21.4 静态/动态交叉验证</h4><table><thead><tr><th>F</th><th>第一轮</th><th>第二轮</th><th>最终状态</th></tr></thead><tbody><tr><td>F1</td><td>✓</td><td>—</td><td>✓</td></tr><tr><td>F2</td><td>✓</td><td>—</td><td>✓</td></tr><tr><td>F3</td><td>未直接验</td><td>✓ 2 次 <code>ssyscall_read</code> 都来自 <code>/proc/self/task/&lt;tid&gt;/status</code></td><td>✓</td></tr><tr><td>F4/F5</td><td>—</td><td>—</td><td>静态正确,F8 ✗ 导致没法用命中数据印证,但 ✗ 原因与此无关</td></tr><tr><td><strong>F6</strong></td><td>✓ 返 0</td><td>✓ 再次 = 0</td><td>✓ 技术上对,值意外</td></tr><tr><td>F7</td><td>间接 ✓:retval=NULL → 走了"else 空 detail"或退出循环</td><td>—</td><td>✓</td></tr><tr><td><strong>F8</strong></td><td><strong>✗</strong></td><td>第二轮找出原因</td><td><strong>✗ (已查明原因,详 21.5)</strong></td></tr><tr><td>F9</td><td>✓</td><td>—</td><td>✓</td></tr></tbody></table><h4>21.5 实现缺陷:buffered reader 跨 fd 不重置</h4><p><strong>第一轮证据</strong> (必要但不充分):</p><ul><li>静态:三个 <code>.bss</code> 全局从 IDA xref 看跨 tid 迭代从不重置</li><li>动态:<code>opendir</code> 看到 77 个 tid,<code>sub_C6A84</code> return 0</li></ul><p><strong>第二轮决定性证据</strong>:<code>sub_C6A84</code> 一次调用内 <code>ssyscall_read</code> 仅触发 2 次。</p><p><strong>第三层证据</strong> (由前两层推得):两次 read 的 fd 都是 <code>171</code>,但 <strong>不是同一个 tid 的 fd</strong> —— Linux fd 复用机制。</p><p>实际运行展开(2 次 read × 77 tid × status 文件 ~1.5KB):</p><table><thead><tr><th>阶段</th><th>行为</th><th>cursor 变化</th></tr></thead><tbody><tr><td>tid #1</td><td><code>open(fd=171)</code> → <code>read</code> 1024B(read#1) → 解出首行 <code>Name:\ter_main_process\n</code> → <code>close(171)</code></td><td><code>cursor: 0 → ~22</code></td></tr><tr><td>tid #2</td><td><code>open(fd=171, reused)</code> → cursor(22) &lt; end(1024) → <strong>不 read</strong> → 消费 buffer 22..32 = <code>Umask:\t0077\n</code> → <code>close(171)</code> 。 <strong>不是该 tid 的真实数据!</strong></td><td><code>cursor: 22 → ~32</code></td></tr><tr><td>tid #3..~#30</td><td>同上,持续消费第一次 read 残留的 ~1000 字节(每 tid 一行 = 一次 break)</td><td><code>cursor: 32 → ~1024</code></td></tr><tr><td>~tid #30</td><td>cursor 到 1024,end=1024 → <code>read</code> 触发(read#2),fd=171 此时属于这个 tid(碰巧是 mali-cmar-backe)</td><td><code>cursor: 1024 → 0; end → 1024</code></td></tr><tr><td>~tid #30..~#60</td><td>同上消费 mali 的 status</td><td><code>cursor: 0 → ~1024</code></td></tr><tr><td>后续</td><td>一直循环到 readdir 没新条目</td><td>—</td></tr></tbody></table><p><strong>净效果</strong>:本轮 77 个 tid 中实际只有 ~2 个的 Name 字段被真扫(<code>er_main_process</code> 和 <code>mali-cmar-backe</code>)。剩下大量 tid 的 Name 字段从未触达 <code>strstr_</code>,会显著降低 <code>gum-js-loop</code> / <code>gmain</code> 的命中概率。</p><h4>21.6 影响与绕过边界</h4><table><thead><tr><th>视角</th><th>结论</th></tr></thead><tbody><tr><td>对绕过 Frida 检测的实战意义</td><td>在本轮 Pixel 6 Pro / Android 15 / Frida 17.x 环境下,该实现只真实读取少量 tid,显著降低 Frida 线程名命中概率；其它 Frida 版本、注入方式和线程命名策略需单独复测</td></tr><tr><td>对未来 hunter 升级的预警</td><td>若后续版本在每次 fd open 后重置 <code>qword_2EFCB8/CC0</code>,该缺陷即可修复。 <strong>KPM 设计不能依赖此缺陷做长效绕过</strong></td></tr><tr><td>用户态备选(在 bug 修复后)</td><td>A. hook <code>sub_C6A84</code> 直接 <code>return 0</code>;B. hook <code>strstr_</code> —— 进入 <code>sub_C6A84</code> 上下文时,看到 needle == "gum-js-loop"/"gmain" 强制返 NULL。二者都属于用户态 hook/patch,可能触发 §5 CRC 链</td></tr><tr><td>KPM 备选(在 bug 修复后)</td><td>在 <code>read</code> syscall 或 procfs 读取路径内核侧过滤 hunter 读取到的 <code>/proc/self/task/*/status</code> 内容,隐藏线程名字段中的 Frida 特征</td></tr></tbody></table><h4>21.7 bypass 依据</h4><p>由于本轮 buffered reader bug 已显著降低命中概率,当前脚本没有专门绕过 Info5 也未触发该风险项。若后续版本修复 buffer 重置问题,仍需要单独处理 <code>sub_C6A84</code> / <code>strstr_</code> / <code>/proc/self/task/*/status</code> 读取面。</p><hr><h3>22. 多进程 Binder 上报机制</h3><p>本节补充多进程 Binder 上报链路:即使主进程检测入口已被 bypass,子进程仍可能通过 Binder 把 <code>ListItemBean</code> 传回主进程 UI。</p><h4>22.1 现象</h4><p>主进程已经做了三层 bypass:</p><ul><li>SO 层:<code>Interceptor.replace</code> 25 个 NativeEngine.* 入口直接返回 NULL</li><li>Java 层:<code>ig.apply</code> / <code>z5.b</code> / <code>j40.a</code> / <code>getZhenxiInfoH</code> 兜底</li><li>必带防崩:<code>block_bad_precheck</code></li></ul><p>理论上所有 detection 都应该被切断。但实测仍有一条 <code>Check Find Root In Mounts</code> 漏网,UI 兜底拦下时打出 Java 栈:</p><pre><code>[java:ui:TRACE] first hit needle="Check Find Root" title="Check Find Root In Mounts "
java.lang.Exception
    at com.zhenxi.hunter.MainActivity.n0(Native Method)
    at YouAreLoser.TC.v(Unknown Source:2)
    at YouAreLoser.TC.onTransact(Unknown Source:54)
    at android.os.Binder.execTransactInternal(Binder.java:1391)
    at android.os.Binder.execTransact(Binder.java:1335)</code></pre><h4>22.2 静态证据</h4><p>回看 Manifest:</p><pre><code data-lang="xml" class="language-xml">&lt;service android:name=".ZhenxiServer"
         android:process=":hunter_server_iso"
         android:isolatedProcess="true"/&gt;

&lt;service android:name=".ZhenxiServerTwin"
         android:process=":hunter_server_twin"
         android:useAppZygote="true"/&gt;</code></pre><p><code>YouAreLoser.TC</code> 是 AIDL stub 实现,<code>onTransact</code> 解包后通过 <code>TC.v(bean)</code> 转发给 <code>MainActivity.n0(bean)</code> 展示。 <code>Binder.execTransact</code> 是 Binder server 端响应方法,<strong>来自另一个进程的 IPC 调用</strong> 。</p><p>§6.3.1 的实测中也观察到同一条 detection 出现两次,data 字段不同:</p><pre><code>[evidence:ui] title=Check Find Root In Mounts  data=com.zhenxi.hunter:hunter_main_process
[evidence:ui] title=Check Find Root In Mounts  data=com.zhenxi.hunter:hunter_server_iso:com.zhenxi.hunter.ZhenxiServer:hunter_iso_service</code></pre><p>两条记录的 data 前缀分别是主进程和隔离进程。</p><h4>22.3 动态证据</h4><h5>22.3.1 主进程 Frida bypass 完全成功的输出</h5><pre><code>[null] getZhenxiInfo3             rva=0x2b476c
[null] getZhenxiInfo4             rva=0x2a2d98
[null] getZhenxiInfo5             rva=0x2a4760
... (共 25 行 [null]、1 行 [crc]、1 行 missing)
[+] native bypass installed: 25 ok, 1 missing
[+] ReportRiskItem watch+block @ libhunter.so+0x278658
[+] hook_native_bypass_so.js fully armed
[java] hunter ClassFactory resolved after 0 attempts
[java] ig.apply CRC compare guard installed
[java] z5.b TEE bypass installed
[java] j40.a bootstate bypass installed
[java] NativeEngine.getZhenxiInfoH prop fallback installed
[java] MainActivity.n0 UI final block installed (with first-hit stack trace)</code></pre><h5>22.3.2 仍有 detection 漏网</h5><pre><code>[bypass:ig] skip path=/apex/com.android.art/lib64/libart.so
[java] j40.a -&gt; empty
[java] z5.b -&gt; fake locked + verified boot
[java:ui:TRACE] first hit needle="Check Find Root" title="Check Find Root In Mounts "
java.lang.Exception
    at com.zhenxi.hunter.MainActivity.n0(Native Method)
    at YouAreLoser.TC.v(Unknown Source:2)
    at YouAreLoser.TC.onTransact(Unknown Source:54)
    at android.os.Binder.execTransactInternal(Binder.java:1391)
    at android.os.Binder.execTransact(Binder.java:1335)</code></pre><p><code>[ReportRisk]</code> 行未出现:这条 risk <strong>未经过主进程的 <code>0x278658</code> 汇聚点</strong> 。</p><h4>22.4 静态/动态交叉验证</h4><table><thead><tr><th>编号</th><th>静态结论</th><th>动态印证</th><th>状态</th></tr></thead><tbody><tr><td>B1</td><td>Manifest 声明 <code>:hunter_server_iso</code> 隔离进程</td><td>UI data 前缀 <code>com.zhenxi.hunter:hunter_server_iso:...</code></td><td>✓</td></tr><tr><td>B2</td><td>Manifest 声明 <code>:hunter_server_twin</code> 孪生进程</td><td><code>getZhenxiInfo4</code> 第二阶段实测捕获到 <code>com.zhenxi.hunter:hunter_server_twin</code> 进程</td><td>✓</td></tr><tr><td>B3</td><td>子进程也加载 libhunter.so,独立跑 detection</td><td>主进程 SO 层 25 个 NativeEngine.* 全 replace 后,仍收到 bean</td><td>✓</td></tr><tr><td>B4</td><td>结果通过 Binder 回传主进程</td><td>Java stack 显示 <code>Binder.execTransact -&gt; TC.onTransact -&gt; TC.v -&gt; MainActivity.n0</code></td><td>✓</td></tr><tr><td>B5</td><td>主进程 0x278658 汇聚点拦不到子进程的 bean</td><td>未出现 <code>[ReportRisk]</code> 行,只出现 MainActivity.n0</td><td>✓</td></tr></tbody></table><h4>22.5 含义</h4><p>子进程也加载了 <code>libhunter.so</code>,<strong>独立跑一遍 detection,结果 binder 传回主进程</strong> 。Frida 默认只 attach 主进程,子进程的 SO 层 hook 完全没装,那边的 <code>getZhenxiInfo3</code> 正常跑完整 mount 扫描,生成 bean,binder 一路过来,主进程的 <code>MainActivity.n0</code> 接收并展示。</p><p>这对绕过工作给出两个启示:</p><ol><li><strong>主进程 SO 层 hook 不能覆盖子进程检测</strong> —— "下沉到 SO 层"实际只彻底了一个进程</li><li><strong>UI 层兜底(<code>MainActivity.n0</code>)是统一汇聚点</strong> —— 不管 bean 是哪个进程产生的,主进程 UI 是必经路径</li></ol><h4>22.6 三种下沉方案</h4><table><thead><tr><th>方案</th><th>位置</th><th>效果</th></tr></thead><tbody><tr><td>A</td><td>UI 兜底:<code>MainActivity.n0</code> 按 title 名单丢弃</td><td>一处统一,实测可用</td></tr><tr><td>B</td><td>TC dispatcher 层:hook <code>YouAreLoser.TC.v</code> 或 <code>TC.onTransact</code>,Binder 一收到 ListItemBean 直接丢弃</td><td>比 UI 层更上游,不依赖 title 名单</td></tr><tr><td>C</td><td>多进程 spawn(<code>--enable-spawn-gating</code>):让子进程也装同一套 SO 层 hook</td><td>最彻底,但 spawn-gating 调试复杂</td></tr></tbody></table><p>实测当前文章脚本组合用方案 A,验证可用。</p><hr><h3>23. 已确认的实现缺陷</h3><p>hunter 不是"无懈可击的检测"。有 4 个 <strong>已经在静态 + 动态双向证据下确认</strong> 的实现缺陷,KPM 设计 <strong>不应</strong> 依赖这些缺陷做长效绕过(作者修起来都很容易)。</p><table><thead><tr><th>#</th><th>缺陷</th><th>位置</th><th>静态证据</th><th>动态证据</th><th>修复成本</th></tr></thead><tbody><tr><td>1</td><td><code>maps_precheck_readable</code> 不验证目标范围全被可读 mapping 覆盖,unmapped hole 被误判为可读</td><td><code>0xC6520</code></td><td>函数体只检查"重叠且 perms[0]!='r'",IDA 反编译可见</td><td><code>block_bad_precheck</code> 多次拦下 <code>addr=0x7741a35000 size=0x1266d8 off 0xc7828</code> 等越界访问(详 §5.3.5)</td><td>~5 行 C 代码,补"全范围被可读 mapping 覆盖"判定</td></tr><tr><td>2</td><td><code>sub_C6A84</code> buffered reader(<code>ptr_/qword_2EFCB8/CC0</code>)跨 fd 不重置</td><td><code>0xC6A84</code></td><td>三个全局.bss 在 fd 迭代中从不重置(IDA xref 可见)</td><td>77 tid 实际只触发 2 次 <code>ssyscall_read</code>,Frida 的 gum-js-loop 在该 buffered reader 缺陷下存在漏检(详 §21.3.2 / §21.5)</td><td>2 行代码,每次 open 后重置 cursor/end</td></tr><tr><td>3</td><td><code>art_register_natives_batch</code> SDK 31-33 路径 <code>ClassLinker::RegisterNative</code> 调用,<code>Thread*</code> 实参错传成函数指针(没调用 <code>CurrentFromGdb()</code>)</td><td><code>0xA5254</code></td><td>汇编 <code>MOV X1, X21</code> (X21 = dlsym 拿到的函数指针,未调) → <code>BLR X8</code>;且 SDK &gt; 33 被显式禁用与本 BUG 一致</td><td>SDK=35 环境下 hunter 走 RegisterNatives 回落路径(SDK &gt; 33 入口 return false),<code>verify_register_natives.js</code> 间接印证</td><td>1 行代码,补一次 <code>((Thread*(*)())CurrentFromGdb)()</code> 间接调用</td></tr><tr><td>4</td><td><code>CheckVpn</code> 用 <code>my_strcmp</code> 精确比较 + 仅 3 个裸字符串,使用 <code>tun0/ppp0/wg0/xfrm0</code> 等常见命名时存在明显漏检风险</td><td><code>0x2AAF44</code></td><td><code>my_strcmp</code> 是 <code>strcmp</code> 等价函数(IDA 反编译);静态名单只有 <code>tun/ppp/pptp</code></td><td>本设备的 <code>tunl0</code> 存在但不命中,return 0(详 §20.5.1)</td><td>2-3 行代码,改 <code>strncmp</code> 或扩名单</td></tr></tbody></table><p><strong>KPM 设计原则</strong>:<strong>不依赖缺陷做长效绕过</strong> 。这些缺陷在 hunter 下个版本就可能被修;KPM 应优先做 <strong>基于数据源的内核侧对抗</strong> (隐藏文件 / 隐藏 procfs、maps、netlink 返回 / 过滤 syscall 读写结果 / 阻断 SELinux audit 暴露)而不是利用 hunter 自己的 bug。若选择拦截 hunter detect 函数入口,应归类为用户态 hook/patch 或内核辅助修改用户态代码,仍需面对 §5 CRC 链。</p><hr><h3>24. 检测点总表</h3><table><thead><tr><th>UI/日志标题</th><th>Java 入口</th><th>Native RVA</th><th>内部核心 RVA</th><th>动态证据</th><th>闭环度</th></tr></thead><tbody><tr><td><code>Check Find Root In Mounts</code></td><td><code>getZhenxiInfo3</code></td><td><code>0x2B476C</code></td><td><code>0xD5E34</code> 读 <code>/proc/mounts</code> 等 6 源 + 18 marker</td><td>LR <code>0x2B4A88</code>,data 含 APatch <code>/debug_ramdisk</code></td><td>✓ 闭环</td></tr><tr><td><code>Check Find Root Permission</code></td><td><code>getZhenxiInfo3</code></td><td><code>0x2B476C</code></td><td><code>0xDDB9C</code> netlink 权限侧信道</td><td><code>trace_info3_branch_experiment</code> 中 sub_DDB9C ret=0x1</td><td>✓ 闭环</td></tr><tr><td><code>find libart.so hooked</code></td><td><code>getZhenxiMapCheck</code></td><td><code>0x291858</code></td><td>size==0x1000 / count&gt;=6 双判</td><td>LR <code>0x2924B8</code> arg1="find libart.so hooked 0"</td><td>✓ 闭环</td></tr><tr><td><code>ISO CRC NOT MATCH LOCALITY CRC</code></td><td><code>getZhenxiLoctionCrc</code> + Java <code>ig.apply</code></td><td><code>0x2AE064</code></td><td><code>0xC8670</code> 收集 RX 段 NEON sum + Java 比较 remote CRC</td><td>Java data 显示 local/remote CRC</td><td>✓ 闭环</td></tr><tr><td><code>检测到libart.so被修改</code> 等</td><td><code>getZhenxiInfoF</code></td><td><code>0x2AD9A8</code></td><td><code>0xC9130 / 0xC90A0 / 0xC89BC</code> checksum status</td><td>LR <code>0x2ADA40</code> (libart 分支)</td><td>✓ 闭环</td></tr><tr><td><code>Hunter Find Unknown Exec Item From Mian</code></td><td><code>getZhenxiInfoInjection</code></td><td><code>0x28DF24</code></td><td><code>0x100AAC</code> + 5 个辅助子检测</td><td>data 含 <code>rwxp 00:00 0 ?</code></td><td>✓ 闭环</td></tr><tr><td><code>Find Others Process</code></td><td><code>getZhenxiInfo4</code></td><td><code>0x2A2D98</code></td><td><code>/proc/&lt;pid&gt;/comm\|cmdline</code> + <code>popen("ps -ef")</code></td><td>data 含 <code>logcat / ls / sh / grep</code> 或 <code>ps -ef</code> 输出</td><td>✓ 闭环</td></tr><tr><td><code>Check Root For SideChanne</code></td><td><code>SideChanne</code></td><td><code>0x2B3BD4</code></td><td><code>0xE43BC</code> timing ratio</td><td>ratio0/ratio1 ≈ 1.604/1.658</td><td>✓ 闭环</td></tr><tr><td><code>当前手机已经被解锁</code></td><td><code>z5.b</code> / <code>j40.a</code> getprop</td><td>Java 主导</td><td>TEE rootOfTrust + <code>ro.boot.verifiedbootstate</code></td><td>data="tee check device unlock" 或 "orange"</td><td>✓ 闭环</td></tr><tr><td><code>Find Verified Boot Mark</code></td><td><code>z5.b</code></td><td>Java 主导</td><td><code>e.b == 1/2/3</code></td><td>data="the boot.img maybe have been patched"</td><td>✓ 闭环</td></tr><tr><td><code>Get Env Info</code></td><td><code>getZhenxiInfoEnv</code></td><td><code>0x28CDB0</code></td><td>遍历 environ</td><td>LR <code>0x28D3A8</code> data=PATH=...</td><td>✓ 闭环</td></tr><tr><td><code>当前手机可能是模拟器&amp;云手机</code></td><td><code>getZhenxiInfoK</code></td><td><code>0x2B93BC</code></td><td>指定 path × markers 数组,逐行匹配</td><td>docker / lxc / 12 路径 markers 动态出现</td><td>✓ 闭环</td></tr><tr><td><code>Find Vpn Native</code></td><td><code>CheckVpn</code></td><td><code>0x2AAF44</code></td><td><code>0xA8BE4</code> NETLINK_ROUTE 枚举 + my_strcmp 精确比较</td><td>50 接口枚举,return NULL(无 VPN 环境)</td><td>✓ 闭环</td></tr><tr><td><code>Find Frida Mark</code> (gum-js-loop / gmain)</td><td><code>getZhenxiInfo5</code></td><td><code>0x2A4760</code></td><td><code>0xC6A84</code> buffered reader 扫线程名</td><td>sub_C6A84 ret=0(buffered reader bug 漏检)</td><td>✓ 闭环(含 bug)</td></tr><tr><td><code>Find Risk File</code></td><td><code>checkRiskFile</code></td><td><code>0x2AC514</code></td><td>25 条 <code>/data/local/tmp/*</code> access</td><td>函数 entered, ret=0x0(当前环境 25 路径均不存在)</td><td>△ 静态闭环 / 未触发</td></tr><tr><td><code>Find Root File In Sniff</code></td><td><code>checkRootFromAVCLog</code></td><td><code>0x2AAE54</code></td><td><code>0xE0AA8</code> logcat avc:denied 路径侧信道</td><td>函数 entered, ret=0x0</td><td>△ 静态闭环 / 未触发</td></tr><tr><td><code>Find Mark ELF</code></td><td><code>getZhenxiInfoMPNI</code></td><td><code>0x298374</code></td><td>进程标签自保护 + maps 包名 ELF 白名单</td><td>return null(标签通过 + 无额外 ELF)</td><td>△ 静态闭环 / 未触发</td></tr><tr><td><code>HunterCheckApkSignError</code> 多种</td><td><code>getZhenxiInfo2</code></td><td><code>0x29AEFC</code></td><td>APK path / cert / base64 / hex / fd readlink / fstat 7 步</td><td>return 0(官方 APK 不触发)</td><td>△ 静态闭环 / 未触发</td></tr><tr><td><code>find system server hook</code></td><td><code>getZhenxiInfoCBinder</code></td><td><code>0x28C9BC</code></td><td><code>sub_CDFC4 / CDAD4 / CE000 / 251C18</code> (纯 OLLVM)</td><td>return null</td><td>△ 静态闭环 / 内部 callee 未完全还原</td></tr><tr><td>ROM 属性多种</td><td><code>getZhenxiInfoH(key)</code></td><td>Java wrapper,不在 batch 表</td><td><code>getPropInline</code> 混淆链:<code>getZhenxiInfoZ</code> fallback / <code>/dev/__properties__</code></td><td><code>ro.boot.verifiedbootstate -&gt; orange</code> 实测</td><td>✓ 链路已收敛</td></tr><tr><td><code>Find Simulator OpCode Mark!</code> 等</td><td><code>getZhenxiInfoO</code></td><td><code>0x2BE8EC</code></td><td><code>0x2bec24..0x2bf71c</code> 5 callsite,4 子类</td><td>(未细做,W5=11)</td><td>字典级 / 未细拆</td></tr><tr><td><code>Linker Find Hook Mark</code> 等 19 类</td><td><code>getZhenxiInfoBase</code></td><td><code>0x29288C</code></td><td>19 callsite, Linker Hook / Magisk / Mount / Seccomp / Signal / Uname 等</td><td>(字典级)</td><td>字典级 / 待拆</td></tr><tr><td><code>Mem Find Mark</code> 等</td><td><code>getZhenxiInfo0</code></td><td><code>0x2BFDD0</code></td><td>6 callsite, APK lib mem 类</td><td>(字典级)</td><td>字典级 / 未细拆</td></tr><tr><td><code>Find Linker Is Hook</code> 等</td><td><code>getZhenxiInfoL</code></td><td><code>0x2A8724</code></td><td>2 callsite</td><td>(字典级)</td><td>字典级 / 未细拆</td></tr><tr><td><code>Zygote Check Find Risk Mark</code></td><td><code>checkFromZygote</code></td><td><code>0x2ABCD0</code></td><td>1 callsite</td><td>(字典级)</td><td>字典级 / 未细拆</td></tr><tr><td>Zygisk 相关</td><td><code>checkZygisk</code></td><td><code>0x2A93F8</code></td><td>1 callsite, <code>&lt;dyn&gt;</code> title</td><td>(字典级)</td><td>字典级 / 未细拆</td></tr><tr><td><code>Check Maps Find Hide</code></td><td><code>sub_2A1C38</code></td><td><code>0x2A1C38</code></td><td>2 callsite</td><td>(字典级)</td><td>字典级 / 未细拆</td></tr></tbody></table><h4>24.1 闭环度统计</h4><table><thead><tr><th>闭环度</th><th>数量</th><th>列表</th></tr></thead><tbody><tr><td>✓ 静态+动态双闭环</td><td>14+</td><td>§6 / §7 / §8 / §9 / §10 / §11 / §12 / §13 / §14 / §20 / §21(buffered reader bug) + 多进程 binder §22</td></tr><tr><td>△ 静态闭环 / 未触发</td><td>5</td><td>§15 checkRiskFile / §16 checkRootFromAVCLog / §17 getZhenxiInfoMPNI / §18 getZhenxiInfo2 / §19 getZhenxiInfoCBinder</td></tr><tr><td>字典级</td><td>多条</td><td>InfoBase 19 callsite、InfoO 5 子类、Info0 / InfoL / checkFromZygote / checkZygisk / sub_2A1C38 等</td></tr></tbody></table><hr><h3>25. 为什么这些结论可靠</h3><p>每个关键点都至少满足 5 类证据:</p><ol><li><strong>JNI 注册表证明 Java 方法 → native RVA 对应关系</strong><br><code>art_register_natives_batch(env, NativeEngine, off_2EF1F0, 60)</code> 表项实测枚举,25 条 detection 全部对得上 RVA。</li><li><strong>IDA 字符串 / xref / 伪代码证明 native 函数内部行为</strong><br>每条 detection 静态分析章节(§6.2 / §7.2 /... §21.2)给出 IDA 伪代码 + 关键字符串引用。</li><li><strong>动态 <code>ReportRiskItem</code> 的 LR 落在对应 native 函数内</strong><br>每条 detection 的实测日志(§X.3)都给出 <code>lr=libhunter.so+0xXXXX (rva=0xXXXX)</code>,与静态 callsite 表(§4.4)一一对应。</li><li><strong>Java <code>MainActivity.n0</code> 的 stack 证明最终 UI 风险项来源</strong><br><code>[Java MainActivity.n0]</code> 输出在多条 detection 中给出 title / risk / data 三元组,与 native 返回值一致。</li><li><strong>对相应入口做返回值 bypass 后,目标风险项消失</strong><br>每条 detection 的 §X.6 给出具体 bypass 脚本,并附 <code>[bypass:xxx]</code> 动态验证日志。</li></ol><p>以 <code>Check Find Root In Mounts</code> 为例:</p><pre><code>JNI 表    : getZhenxiInfo3 → 0x2B476C            ← 实测 off_2EF1F0 枚举
静态      : 0x2B476C 引用 "Check Find Root In Mounts"
静态      : 0xD5E34 读取 /proc/mounts + 18 marker
动态      : ReportRiskItem LR 0x2B4A88
动态      : data 中出现 /proc/mounts-&gt;APatch /debug_ramdisk
bypass    : getZhenxiInfo3 → null 后主进程风险项消失
binder    : 子进程 bean 通过 TC.onTransact 仍可达,UI 层兜底</code></pre><p>这种交叉印证比"hook 某方法后界面没了"更强,因为它证明了 <strong>检测算法、命中原因、绕过点之间的因果关系</strong> 。</p><hr><h3>结语:工具会进化,门不能松</h3><p>拆到最后才看清,Hunter 从来不是"一个 root 检测函数",而是一座会还手的工事:<code>art_register_natives_batch</code> 直接 patch ArtMethod,绕过对 <code>RegisterNatives</code> 的监控(§2);syscall 借 linker64 段里一条裸 <code>SVC #0</code> 发起,把整个 libc hook 面甩在身后(§3);大量检测的风险项收口到 <code>build_native_ListItemBean_risk @ 0x278658</code> (22 caller × 83 callsite,§4);libart / libc / linker / libhunter 还各有一条 CRC + r-x 段 NEON 自检(§5 / §8)。你以为拦住了主进程,后台的 <code>task_MAIN_CRC_check</code> 和 <code>:hunter_server_iso</code> 子进程又通过 Binder 把风险项原样递回 UI(§22)。任何"单点 bypass"都会被另一条链路悄悄兜回 —— 这也是为什么本文从头到尾都在"汇聚点拦截 + 源头 bypass + 多进程 spawn"三层一起上。</p><p>这座工事最阴险的地方,不在于层数多,而在于它专挑"读代码读得太顺"的分析者下套。你 hook 掉 <code>getZhenxiInfo3</code>,主进程界面那条 root 风险项当场消失 —— 一个只盯着界面的 agent 到这步就会写下"已绕过"。可它没看见:同一条 bean 正由 <code>:hunter_server_iso</code> 通过 <code>TC.onTransact</code> 原样传回,UI 下一帧又把它画了回来;它也没看见后台 <code>task_MAIN_CRC_check</code> 压根不经 Java,直接在 native 侧把"libart 被改"报上去。 <strong>界面干净从不等于检测失效</strong> 。这就是前言那个幻觉陷阱的真身 —— Hunter 把"看起来绕过了"和"真的绕过了"之间那道缝,撑得足够宽,宽到一个轻信的 agent 必然掉进去。</p><p>真正让这件事有意思的,是一组不对称。Hunter 是 <strong>冻结</strong> 的:编译进 <code>libhunter.so</code> 的那一刻,这一版的检测集合、阈值、汇聚点就钉死了,v6.58 不会在运行时学会新招;但它跨版本进化 —— 今天 v6.58,早晚 v6.59,RVA 重排、新 marker 加入、汇聚点挪窝。攻击侧的 agent 恰恰相反:它在单次会话里就是 <strong>自适应</strong> 的,能边读边改、边复盘边沉淀(前言提到的 Hermes 官方 memory / skill / background review 机制,证明这类外置经验循环已经产品化)。一边是会换代的死工事,一边是会自学的活工具 —— 标题那半句"工具会进化",说的正是这层:无论守方攻方,工具都在往前跑。剩下的问题只有一个:跑得越快,什么东西反而越要钉死不动?</p><p>但真要从这篇里带走点什么,不该是某条会随版本漂移的 RVA,而该是那套贯穿 25 个检测点、一次都没松过的工作流:</p><pre><code>JNI 注册表锚定 (Java 方法 → native RVA)
  → 静态:IDA 伪代码 / 字符串 / xref 还原算法
  → 动态:ReportRiskItem 的 LR 对回精确 callsite
  → UI sink:MainActivity.n0 的 title/risk/data 三元组
  → bypass:返回值置空后目标风险项消失
五步缺一,只能标"字典级 / 未触发",不能标"已确认"</code></pre><p>这五步不是流水账,每一步都在堵一类幻觉,缺一步就漏一类。少了第 1 步的 JNI 锚定,你连"这段 native 对应哪个 Java 方法"都说不准,后面全是空中楼阁;少了第 2 步的静态还原,你只知道"它报了 root",却不知道它 <strong>怎么</strong> 判的、该从哪改;少了第 3 步的 LR 对回,<code>build_native_ListItemBean_risk</code> 那 83 个 callsite 你分不清是哪一个在响,"命中原因"只能靠猜;少了第 4 步的 UI 三元组,你证明不了 native 这条上报真的走到了用户看见的那一格;少了第 5 步的 bypass 复测,你那套"算法理解"永远停在纸面,没人替你担保它真拦得住。五步互为对方的证人 —— 静态说"它该这么判",动态回"它确实这么判了",bypass 再补一刀"拦掉它界面就真少一项";三方口供对上,才敢盖"已确认"的章。</p><p>把这套流程写规整,其实就是一条 skill —— 而这,正好接回开头那个 Hermes 的故事。官方文档确认的部分是:<code>run_agent.py</code> 会在阈值触发后 fork 后台 Review Agent 回看对话,再把值得保留的内容写入 memory 或用 <code>skill_manage</code> 沉淀成 skill。至于"挨打中长出防御"这个案例,应作为公开安全测试转述理解,不把它当成本文证据链的一部分。同一套机制,完全可以把"逆向一个 native 壳"这件事也固化下来,大致长这样:</p><pre><code data-lang="yaml" class="language-yaml">skill: native-detection-crossverify          # skill 体可自进化,但下方 gate 例外
触发: 目标是含 JNI native 检测的 Android 壳,需把
      「UI 风险项 ↔ native 检测算法 ↔ 绕过点」对锁时启用
tools(MCP):
  - ida.decompile / ida.xrefs / ida.strings / ida.get_bytes
  - frida.intercept(native) / frida.java_hook
memory(持久,跨会话/跨版本):
  rva_table:     { 版本 → { name, sig, fn_rva } }          # 命中即增量更新
  callsite_dict: { callsite_rva → { caller, title候选, W3/W4/W5 } }
procedure(五步,顺序执行):
  1 anchor : 枚举 art_register_natives_batch 表 → { Java 方法 → native RVA }
  2 static : decompile(rva) + 字符串/xref → 还原算法,抽 title 候选
  3 dynamic: hook build_native_ListItemBean_risk @0x278658,采 LR;callsite = LR-4
  4 ui_sink: 采 MainActivity.n0 的 { title, risk, data } 三元组
  5 bypass : 入口返回值置空 → 复测目标风险项是否消失
gate(强制证据门,hard-fail):
  grade =
    "✓闭环"  iff 步 1..5 全部产出且互相一致
    "△静态"  iff 步 1+2 成立但运行时未触发(步 3/4 无样本)
    "字典级"  iff 仅有静态 title 候选、callsite 未对回
  assert: 任一步缺失或自相矛盾 ⇒ 禁止升级 grade(agent 不得自行放宽)
output: 每点产出 { title, java_entry, native_rva, inner_rva, evidence[], grade }
self_improve:
  允许: 新 marker 向量 / 新汇聚点等模式,回写为可复用片段
  冻结: gate 规则只读、版本化,不参与自进化           # 防止证据门越改越松
escalate_to_human:                                    # agent 不接管的硬骨头
  - OLLVM 平坦化 callee 未还原(见 §24 getZhenxiInfoCBinder)
  - 需构造时序 / timing 实验(多进程 binder §22 / side-channel §11)</code></pre><p>但请留意这条 skill 里最反常的一行:<code>gate</code> 被刻意 <strong>冻结</strong>,不参与自进化。这恰恰是 Hermes 这类 self-improving agent 带来的反面提醒。它的魅力在于 skill 会自己越长越强;可一个能改自己的 agent,同样有能力把自己的判断标准越改越松 —— 今天为了"跑通"放宽一格,明天那道证据门就名存实亡。所以这套流程里,skill 体尽可天天进化,唯独那把尺子 —— 五类证据齐不齐 —— 必须只读、必须版本化。 <strong>agent 负责规模,框架负责可信</strong>;能力越强,这道门越不能省。</p><p>能自我进化的系统,最危险的退化方向从来不是能力退化,而是 <strong>标准退化</strong>:它依然很能干,只是悄悄不再诚实。有意思的是,怎么防住这种退化,Hunter 自己早把答案写在了代码里。它整套反篡改的命门,就是"冻结一个可信基准,再拿运行时实测去比":syscall 跳板把 48 字节模板的累加和算成 <code>baseline_sum</code> 焊死在 ctx 里,之后每次调用都重算一遍比对,差一个字节就重建、再不对就 <code>exit</code> (§3);CRC 自检把 libart / libc / linker 的 r-x 段基准 sum 存好,运行时谁动了一行代码,sum 一对就露馅(§5)。Hunter 信不过运行时的自己,于是给自己留了一把改不动的尺子。 <strong>我们对 agent 该用的,是同一招</strong>:把"五类证据齐不齐"这把尺子冻结、版本化、设成只读,让它独立于那个会自我进化的 skill 体之外。agent 尽可天天给自己加新本事,但不能动这把尺子 —— 就像 libart 可以照常运行,却不能在 Hunter 眼皮底下改自己的 r-x 段。一个能顺手改掉自己证据门的 agent,等于一个能顺手改掉自己 <code>baseline_sum</code> 的 Hunter:那道防线名存实亡。</p><p>所以这套流程里的分工是刻意的:skill 体尽可进化 —— 新 marker 向量、新汇聚点、新的壳,都欢迎回写成可复用片段;唯独那把尺子,只读、版本化、不参与自进化。 <strong>agent 负责规模,框架负责可信</strong> —— 这两件事必须交给不同的东西去守,因为它们会互相腐蚀:让追求"产出"的同一个回路去管"可信",它迟早会为产出牺牲可信。能力越强,这道门越不能省 —— 不是因为我们不信任 agent,恰恰是因为它已经强到:一旦它想松,没人拦得住,除了一把它自己改不动的尺子。</p><p>也得老实承认,agent 今天还接不住全部。§24 里就明摆着:<code>getZhenxiInfoBase</code> 的 19 个 callsite、 <code>getZhenxiInfoO</code> 的 5 处模拟器检测仍停在"字典级";还有 5 项(<code>checkRiskFile</code> 、 <code>checkRootFromAVCLog</code> 、 <code>getZhenxiInfoMPNI</code> 、 <code>getZhenxiInfo2</code> 、 <code>getZhenxiInfoCBinder</code>)是"静态闭环但本环境未触发",其中 <code>getZhenxiInfoCBinder</code> 的纯 OLLVM callee 还没完全还原。这些恰好卡在 agent 最吃力的地方 —— OLLVM 反平坦化、跨进程时序复现、timing 侧信道(§11)这类得 <strong>主动构造实验</strong> 、而非"读出事实"的活。批量枚举和取证,agent 已经很能打;但设计一个能证伪自己的实验,目前还得靠人。这也正是 skill 末尾 <code>escalate_to_human</code> 两行的意思 —— 它不是免责声明,是 agent 自己划下的能力边界。</p><p>把这条线的形状看清,比记住它今天画在哪更有用。agent 真正擅长的,是"读出已经在那儿的事实"——枚举 60 项注册表、跨 83 个 callsite 对回 LR、把字符串 / xref / 伪代码织成一条静态链,这类活它又快又稳,几十倍于人肉。它真正吃力的,是"造一个事实出来":OLLVM 平坦化的 callee 得主动反推控制流(§24 的 CBinder),跨进程上报得搭一套多进程 spawn 才复现得了(§22),timing 侧信道得自己设计采样、控噪、定阈(§11)。前者是"看",后者是"做实验"—— 后者得先构造一个 <strong>能证伪自己</strong> 的实验,再从结果里把事实逼出来。这道坎短期内还得靠人迈;而 agent 肯在够不着时老实标回"字典级 / 未触发"、把活交还人手,本身就是那把尺子在起作用 —— 一个肯说"我不知道"的 agent,远比一个事事都敢盖"已确认"的 agent 可信。</p><p>Hermes 那个故事的结尾说:结束是另一个开始。这篇也一样。agent 已经把"产出一份逆向分析"的成本踩到了地板 —— 过去一个人啃半个月的加固壳,如今一个接好 IDA、Frida 的 agent 一两天就能扒出 25 个检测点的链路。可成本塌方的同时,一个旧问题被放大了:当"看起来很完整的分析"能批量生产,<strong>怎么分清哪一份是真的</strong>?于是留给我们的功课,不再是"能不能分析出来",而是与产能配套的另一道门槛 —— <code>✓ 闭环 / △ 静态 / 字典级</code> 这套证据分级,和"宁可标未触发,绝不标已确认"的那点克制。</p><p>工具会换代,RVA 会漂移,今天逐字核对的 <code>0x278658</code>,到 v6.59 多半要挪窝 —— 本文里每一个具体地址都有保质期。会过期的东西,不配当结论的核心去记;真正该从这篇带走的,是那套把"已知"和"看起来像"死死分开的纪律:它不依赖任何一个 RVA,换个壳、换个 agent、换到三年后都成立。标题那半句"门不能松",落到实处就是这个意思 —— 工具越强、产出越快,那把分辨真伪的尺子就越要钉死。Hunter 用一把改不动的 <code>baseline_sum</code> 守住自己的完整性;轮到我们用 agent 去拆它,也得给自己留一把同样改不动的尺子,守住结论的完整性。这,才是 agent 时代的逆向,最不该弄丢的东西。</p><h3>附录</h3><h4>A. 相关文件清单</h4><pre><code>libhunter.so.i64                                              IDA 数据库
Manifest                                                      反编译后的 AndroidManifest
js/                                                           Frida 脚本目录(随本文归档)
  ├─ template.js                                              脚本模板(含 block_bad_precheck)
  ├─ hook_report_risk_precheck.js                             ReportRiskItem 闭环 hook + Java 层 bypass
  ├─ hook_native_bypass_so.js                                 SO 层 25 detection bypass(下沉版)
  ├─ bypass_crc_detection.js                                  CRC 链 Java 层 bypass
  ├─ verify_register_natives.js                               JNI 动态注册验证
  ├─ verify_4_5_passive.js                                    syscall 跳板被动取证(§3.3.1)
  ├─ verify_4_5_safe_syscall.js                               跳板安全 syscall
  ├─ verify_4_5_7_call_surface.js                             跳板调用面 v1
  ├─ verify_4_5_7_call_surface_v2.js                          跳板调用面 v2(§3.3.4)
  ├─ verify_4_7_checkvpn.js                                   CheckVpn 闭环(§20.3)
  ├─ verify_4_9_getZhenxiInfo5.js                             Info5 第一轮 hook(§21.3.1)
  ├─ verify_4_9_v2_read_count.js                              Info5 第二轮决定性证据(§21.3.2)
  ├─ trace_so_detection_template.js                           14 detection 取证模板
  ├─ trace_crc_path_template.js                               CRC 路径追踪(§5.3.1)
  ├─ trace_native_crc_path.js                                 native CRC 追踪
  ├─ trace_injection_subchecks_template.js                    Injection 6 子检测拆解(§9.3.2)
  ├─ trace_info3_branch_experiment.js                         Info3 短路链实验(§6.3.2)
  ├─ trace_report_risk_item.js                                ReportRiskItem trace
  ├─ trace_main_thread_tasks.js                               主线程任务 trace
  ├─ trace_hunter_ui_result.js                                UI 结果 trace
  └─ trace_remaining_entries_template.js                      其他 entry 模板</code></pre><h4>B. 关键 RVA 速查表</h4><pre><code>基础设施
─────────────────────────────────────────────────────────────
JNI_OnLoad                            0x2c36f8
art_register_natives_batch            0x0a5c54
art_method_set_native_entry           0x0a4c80
art_register_natives_batch SDK 31-33 BUG callsite  0x0a5254
safe_syscall_via_trampoline           0x248cc4
InitSecureTrampolinePage              0x1b22c0
FindLinkerSyscallAddr                 0x1b1c9c
get_trampoline_id_tag                 0x1b21b4
use_secure_syscall_trampoline_enabled 0x1b2288
calc_additive_checksum                0x261f14
build_native_ListItemBean_risk        0x278658
maps_precheck_readable                0x0c6520
file_contains_any_marker              0x1a6300

CRC 自检
─────────────────────────────────────────────────────────────
anti_inject_collect_results           0x0c8670
scan_modules_for_path                 0x0c8500
parse_elf_rx_segments                 0x0c6f14
scan_rx_segment_neon_sum              0x0c772c
check_libc_elf_checksum_status        0x0c90a0
check_libart_elf_checksum_status      0x0c9130
check_linker64_elf_checksum_status    0x0c89bc
task_MAIN_CRC_check                   0x2d6804

ssyscall 包装器
─────────────────────────────────────────────────────────────
ssyscall_openat                       0x1afe4c
ssyscall_openat_atfdcwd               0x1afe70
ssyscall_read                         0x1afe94
ssyscall_lseek                        0x1afeac
ssyscall_close                        0x1afec4
ssyscall_nanosleep                    0x1afedc
ssyscall_readlinkat                   0x1afef8

detection 入口(25 项 art_register_natives_batch 表内)
─────────────────────────────────────────────────────────────
getZhenxiInfo3                        0x2b476c    /proc/mounts root,7 短路分支
getZhenxiInfo4                        0x2a2d98    其他进程扫描
getZhenxiInfo5                        0x2a4760    Frida 线程名(含 buffered reader bug)
getZhenxiInfo6                        0x2a5544
getZhenxiInfo7                        0x2a636c
getZhenxiInfo0                        0x2bfdd0    APK lib mem mark
getZhenxiInfo2                        0x29aefc    APK 签名一致性(11 callsite)
getZhenxiInfoF                        0x2ad9a8    libart/libc/linker checksum(8 callsite)
getZhenxiInfoL                        0x2a8724    Linker hook
getZhenxiInfoO                        0x2be8ec    模拟器(5 callsite)
getZhenxiInfoSH                       0x28d578
getZhenxiInfoVV                       0x2c1850
getZhenxiInfoBase                     0x29288c    全家桶(19 callsite)
getZhenxiInfoCBinder                  0x28c9bc    system_server hook
getZhenxiInfoEnv                      0x28cdb0    环境变量
getZhenxiInfoMPNI                     0x298374    包名 ELF 白名单
getZhenxiInfoInjection                0x28df24    匿名 RWX
getZhenxiMapCheck                     0x291858    libart maps 分片
getZhenxiLoctionCrc                   0x2ae064    模块 CRC 汇总
SideChanne                            0x2b3bd4    APatch/KP timing
CheckVpn                              0x2aaf44    VPN NETLINK 检测
checkRiskFile                         0x2ac514    25 条 /data/local/tmp 路径
checkRootFromAVCLog                   0x2aae54    AVC denial 侧信道
checkFromZygote                       0x2abcd0    Zygote mark
checkZygisk                           0x2a93f8    Zygisk

不在 batch 表(Java wrapper,内部再进 getPropInline)
─────────────────────────────────────────────────────────────
getZhenxiInfoH                        — (Java wrapper -&gt; getPropInline -&gt; getZhenxiInfoZ / /dev/__properties__)

detection 内部辅助
─────────────────────────────────────────────────────────────
detect_root_mark_in_proc_mounts_maps  0x0d5e34
build_mount_markers (18 项)           0x0d116c
detect_root_side_channel_apatch_kernelsu  0xe43bc
sub_C6A84 (Frida 线程扫描核心)         0x0c6a84
sub_E0AA8 (AVC 侧信道核心)             0x0e0aa8
sub_D14B0 (AVC 敏感路径构造)           0x0d14b0
sub_1A6228 (access F_OK 辅助)         0x1a6228
sub_A8BE4 (NETLINK VPN 枚举入口)       0x0a8be4
sub_A8CC8 (NETLINK nlmsg 解析回调)     0x0a8cc8
sub_AB81C (NETLINK recvfrom 循环)     0x0ab81c
strstr_ (自实现 strstr)                0x1afd4c
my_strcmp                              (在 CheckVpn 内调,具体 RVA 未单独标)

风险项汇聚
─────────────────────────────────────────────────────────────
build_native_ListItemBean_risk         0x278658
sub_2447A8 (std::string init_from_cstr) 0x2447a8

数据结构
─────────────────────────────────────────────────────────────
off_2EF1F0  art_register_natives_batch 表头(60 项)
off_2EF1D8  ChooseUtils 注册表(1 项)
qword_2EF8B0  parse_elf_rx_segments cache
qword_2EFCB8  sub_C6A84 buffered reader cursor
qword_2EFCC0  sub_C6A84 buffered reader end
ptr_ @ 0x2EF8B8  sub_C6A84 buffered reader 1024B buffer
xmmword_2F09E8  trampoline id_tag std::string "(runtime_syscall_code"
xmmword_2F3C08  libhunter.so 路径常量
byte_2F3A68     PROCESS_TAG 标记
byte_2F3A6C     OnLoad 已执行标记
g_secure_trampoline_ctx  (single global, size 56)
g_dso_list_head  hunter 自实现 DSO 链表头
g_sdk_level     dword_2F0880   Build.VERSION.SDK_INT</code></pre><h4>C. 测试命令</h4><pre><code data-lang="bash" class="language-bash"># 启动 SO 层下沉 bypass 脚本
frida -U -f com.zhenxi.hunter -l js/hook_native_bypass_so.js 

# 启动 ReportRiskItem 闭环观察 + Java 层 bypass
frida -U -f com.zhenxi.hunter -l js/hook_report_risk_precheck.js 

# Info3 短路链 7 分支强制实验
frida -U -f com.zhenxi.hunter -l js/trace_info3_branch_experiment.js 

# Injection 6 子检测拆解
frida -U -f com.zhenxi.hunter -l js/trace_injection_subchecks_template.js 

# 跳板调用面 30s 统计
frida -U -f com.zhenxi.hunter -l js/verify_4_5_7_call_surface_v2.js 

# CRC 路径追踪
frida -U -f com.zhenxi.hunter -l js/trace_crc_path_template.js 

# CheckVpn 闭环
frida -U -f com.zhenxi.hunter -l js/verify_4_7_checkvpn.js 

# Frida 线程名扫描决定性证据
frida -U -f com.zhenxi.hunter -l js/verify_4_9_v2_read_count.js</code></pre><h4>D. 完整 60 项 off_2EF1F0 Native注册表(IDA MCP 实读)</h4><p>通过 IDA MCP <code>get_bytes(0x2EF1F0, 1440)</code> + 逐项解析 <code>{name*, sig*, fn*}</code>,再 <code>get_string</code> 取 name/sig 字符串。完整 60 项实测结果:</p><table><thead><tr><th>idx</th><th>name</th><th>sig</th><th>fn (RVA)</th></tr></thead><tbody><tr><td>#00</td><td><code>getZhenxiInfo2</code></td><td><code>(Landroid/content/Context;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x29aefc</code></td></tr><tr><td>#01</td><td><code>getZhenxiInfo4</code></td><td><code>(Landroid/content/Context;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2a2d98</code></td></tr><tr><td>#02</td><td><code>getZhenxiInfo5</code></td><td><code>(Landroid/content/Context;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2a4760</code></td></tr><tr><td>#03</td><td><code>getZhenxiInfo6</code></td><td><code>(Landroid/content/Context;Ljava/lang/String;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2a5544</code></td></tr><tr><td>#04</td><td><code>getZhenxiInfo7</code></td><td><code>(Landroid/content/Context;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2a636c</code></td></tr><tr><td>#05</td><td><code>getZhenxiInfo8</code></td><td><code>()V</code></td><td><code>0x2a66ac</code></td></tr><tr><td>#06</td><td><code>getZhenxiInfo9</code></td><td><code>()V</code></td><td><code>0x299640</code></td></tr><tr><td>#07</td><td><code>getZhenxiInfoE</code></td><td><code>()V</code></td><td><code>0x2ae010</code></td></tr><tr><td>#08</td><td><code>getZhenxiInfoF</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2ad9a8</code></td></tr><tr><td>#09</td><td><code>getZhenxiInfoL</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2a8724</code></td></tr><tr><td>#10</td><td><code>getZhenxiInfoM</code></td><td><code>([Ljava/lang/Class;Z)[[Ljava/lang/Object;</code></td><td><code>0x2b7f9c</code></td></tr><tr><td>#11</td><td><code>getZhenxiInfoO</code></td><td><code>(Landroid/content/Context;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2be8ec</code></td></tr><tr><td>#12</td><td><code>getZhenxiInfo1</code></td><td><code>()[Ljava/lang/String;</code></td><td><code>0x2b5224</code></td></tr><tr><td>#13</td><td><code>getZhenxiInfo3</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2b476c</code></td></tr><tr><td>#14</td><td><code>getZhenxiInfoC</code></td><td><code>(I)V</code></td><td><code>0x2a77a8</code></td></tr><tr><td>#15</td><td><code>getZhenxiInfoZ</code></td><td><code>(Ljava/lang/String;)Ljava/lang/String;</code></td><td><code>0x2b34a8</code></td></tr><tr><td>#16</td><td><code>getZhenxiInfoP</code></td><td><code>()Z</code></td><td><code>0x2b1af8</code></td></tr><tr><td>#17</td><td><code>getZhenxiInfoQ</code></td><td><code>()Z</code></td><td><code>0x2b244c</code></td></tr><tr><td>#18</td><td><code>getZhenxiInfoI</code></td><td><code>(Ljava/lang/String;)I</code></td><td><code>0x2bdc70</code></td></tr><tr><td>#19</td><td><code>getZhenxiInfoT</code></td><td><code>()V</code></td><td><code>0x2b8a14</code></td></tr><tr><td>#20</td><td><code>getZhenxiInfoK</code></td><td><code>(Ljava/lang/String;[Ljava/lang/String;)Ljava/lang/String;</code></td><td><code>0x2b93bc</code></td></tr><tr><td>#21</td><td><code>getZhenxiInfoXX</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x2bbb98</code></td></tr><tr><td>#22</td><td><code>getZhenxiInfoLL</code></td><td><code>(Ljava/lang/String;)Ljava/util/ArrayList;</code></td><td><code>0x2ba438</code></td></tr><tr><td>#23</td><td><code>popen</code></td><td><code>(Ljava/lang/String;)Ljava/lang/String;</code></td><td><code>0x2ae400</code></td></tr><tr><td>#24</td><td><code>popen_list</code></td><td><code>(Ljava/lang/String;Ljava/lang/String;)Ljava/util/ArrayList;</code></td><td><code>0x2b01d4</code></td></tr><tr><td>#25</td><td><code>getZhenxiLoctionCrc</code></td><td><code>()Ljava/util/HashMap;</code></td><td><code>0x2ae064</code></td></tr><tr><td>#26</td><td><code>getZhenxiInfoVV</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2c1850</code></td></tr><tr><td>#27</td><td><code>getZhenxiInfo0</code></td><td><code>(Ljava/lang/String;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2bfdd0</code></td></tr><tr><td>#28</td><td><code>getZhenxiInfoMark</code></td><td><code>()V</code></td><td><code>0x2c29f4</code></td></tr><tr><td>#29</td><td><code>getZhenxiInfoMM</code></td><td><code>()Z</code></td><td><code>0x2b1f88</code></td></tr><tr><td>#30</td><td><code>getZhenxiInfoAtt</code></td><td><code>()V</code></td><td><code>0x2c30a8</code></td></tr><tr><td>#31</td><td><code>getZhenxiInfoNHIL</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x289e94</code></td></tr><tr><td>#32</td><td><code>getZhenxiInfoHMP</code></td><td><code>(Ljava/util/ArrayList;Ljava/lang/String;)V</code></td><td><code>0x289db8</code></td></tr><tr><td>#33</td><td><code>getZhenxiInfoMPNI</code></td><td><code>(Ljava/lang/String;)Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x298374</code></td></tr><tr><td>#34</td><td><code>getZhenxiInfoLLLI</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x28d44c</code></td></tr><tr><td>#35</td><td><code>getZhenxiInfoOFLI</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x297790</code></td></tr><tr><td>#36</td><td><code>getZhenxiInfoSH</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x28d578</code></td></tr><tr><td>#37</td><td><code>getZhenxiInfoEnv</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x28cdb0</code></td></tr><tr><td>#38</td><td><code>getZhenxiInfoCBinder</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x28c9bc</code></td></tr><tr><td>#39</td><td><code>getZhenxiInfoMapELF</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x290958</code></td></tr><tr><td>#40</td><td><code>getZhenxiInfoInjection</code></td><td><code>()Ljava/lang/String;</code></td><td><code>0x28df24</code></td></tr><tr><td>#41</td><td><code>getZhenxiInfoApkEnv</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2a1dac</code></td></tr><tr><td>#42</td><td><code>getZhenxiInfoOFRL</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x295878</code></td></tr><tr><td>#43</td><td><code>getZhenxiInfoBase</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x29288c</code></td></tr><tr><td>#44</td><td><code>runInZygisk</code></td><td><code>()V</code></td><td><code>0x291690</code></td></tr><tr><td>#45</td><td><code>getZhenxiMapCheck</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x291858</code></td></tr><tr><td>#46</td><td><code>check_jvm_method</code></td><td><code>(Ljava/lang/reflect/Method;)Ljava/lang/String;</code></td><td><code>0x2ad350</code></td></tr><tr><td>#47</td><td><code>getZhenxiInfoTwin</code></td><td><code>(I)V</code></td><td><code>0x2a6e70</code></td></tr><tr><td>#48</td><td><code>getZhenxiInfoTwinStart</code></td><td><code>()Z</code></td><td><code>0x2b28dc</code></td></tr><tr><td>#49</td><td><code>DetectHardwareBreakpoints</code></td><td><code>()V</code></td><td><code>0x2ad0b4</code></td></tr><tr><td>#50</td><td><code>checkRiskFile</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2ac514</code></td></tr><tr><td>#51</td><td><code>checkFromZygote</code></td><td><code>()Ljava/util/ArrayList;</code></td><td><code>0x2abcd0</code></td></tr><tr><td>#52</td><td><code>initHunterBase</code></td><td><code>(Landroid/content/Context;)V</code></td><td><code>0x2ab0a4</code></td></tr><tr><td>#53</td><td><code>CheckVpn</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2aaf44</code></td></tr><tr><td>#54</td><td><code>checkZygisk</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2a93f8</code></td></tr><tr><td>#55</td><td><code>getCPUFingerprinting</code></td><td><code>()Ljava/lang/String;</code></td><td><code>0x2a92a0</code></td></tr><tr><td>#56</td><td><code>checkRootFromAVCLog</code></td><td><code>()Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td><code>0x2aae54</code></td></tr><tr><td>#57</td><td><code>getLibBaseInfo</code></td><td><code>()Ljava/lang/String;</code></td><td><code>0x2a9764</code></td></tr><tr><td>#58</td><td><code>MD5</code></td><td><code>(Ljava/lang/String;)Ljava/lang/String;</code></td><td><code>0x2b4fbc</code></td></tr><tr><td>#59</td><td><code>SideChanne</code></td><td><code>()Ljava/lang/String;</code></td><td><code>0x2b3bd4</code></td></tr></tbody></table><h5>D.1 按返回类型分类</h5><table><thead><tr><th>返回类型</th><th>数量</th><th>含义 / 用途</th></tr></thead><tbody><tr><td><code>Lcom/zhenxi/hunter/bean/ListItemBean;</code></td><td>17</td><td>单条风险项(本文 §6-§19 主要 detection 都在这里)</td></tr><tr><td><code>Ljava/util/ArrayList;</code></td><td>10</td><td>风险项 / 信息列表(<code>InfoXX / LL / NHIL / LLLI / OFLI / MapELF / OFRL / Base / checkFromZygote</code> 等;每项可能含多条 bean)</td></tr><tr><td><code>Ljava/lang/String;</code></td><td>8</td><td>字符串(prop wrapper <code>InfoZ</code> / 文件 marker <code>InfoK</code> / 注入 <code>InfoInjection</code> / 指纹 <code>getCPUFingerprinting / getLibBaseInfo</code> / 哈希 <code>MD5</code> / <code>SideChanne</code> / <code>popen</code>)</td></tr><tr><td><code>Ljava/util/HashMap;</code></td><td>1</td><td><code>getZhenxiLoctionCrc</code> 模块 CRC 汇总</td></tr><tr><td><code>V</code> (void)</td><td>9</td><td>初始化 / 内部状态修改类(<code>InfoMark / Att / T / Twin / C / 8 / 9 / E / runInZygisk / HMP</code> 等)</td></tr><tr><td><code>Z</code> (boolean)</td><td>4</td><td>状态查询类(<code>InfoP / Q / MM / TwinStart</code>)</td></tr><tr><td><code>I</code> (int)</td><td>1</td><td><code>getZhenxiInfoI(String)</code> 整数查询</td></tr><tr><td><code>[Ljava/lang/String;</code></td><td>1</td><td><code>getZhenxiInfo1</code> 字符串数组(uname 等)</td></tr><tr><td><code>[[Ljava/lang/Object;</code></td><td>1</td><td><code>getZhenxiInfoM</code> 反射工具</td></tr><tr><td><code>(Landroid/content/Context;)V</code></td><td>1</td><td><code>initHunterBase</code></td></tr></tbody></table></div></td></tr><tr><td></td></tr></tbody></table></div>

**[**沙发**](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55341746)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/394fa7d559e74052.png) 楼主| [CrackCM](https://www.52pojie.cn/home.php?mod=space&uid=569006) *发表于 2026-5-31 14:39* | 楼主

本文在r0ysue老师指导下完成

**[*4* #](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55347956)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/17a31b452af495ec.gif) [fofawb](https://www.52pojie.cn/home.php?mod=space&uid=1581653) *发表于 2026-6-1 17:12*

[《站点帮助文档》有什么问题来这里看看吧，这里有你想知道的内容！](https://www.52pojie.cn/misc.php?mod=faq)

这个非常适合专业人士

[呼吁大家发布原创作品添加吾爱破解论坛标识！](https://www.52pojie.cn/thread-61079-1-1.html)

**[*5* #](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55349869)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/17a31b452af495ec.gif) [jasonssun](https://www.52pojie.cn/home.php?mod=space&uid=2483302) *发表于 2026-6-2 08:28*

跟着楼主学习学习

[如何快速判断一个文件是否为病毒！](https://www.52pojie.cn/thread-69716-1-1.html)

**[*6* #](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55350302)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/17a31b452af495ec.gif) [sdieedu](https://www.52pojie.cn/home.php?mod=space&uid=1071802) *发表于 2026-6-2 09:07*

太牛了吧，就问一个问题，如何躲过hunter检测root状态，能不能一步到位

**[*7* #](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55351106)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/17a31b452af495ec.gif) [Slimu](https://www.52pojie.cn/home.php?mod=space&uid=1793063) *发表于 2026-6-2 10:34*

*本帖最后由 Slimu 于 2026-6-2 10:35 编辑*  
  
感谢分享，有样本吗？

**[*8* #](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55358151)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/17a31b452af495ec.gif) [lzz19900722](https://www.52pojie.cn/home.php?mod=space&uid=2484399) *发表于 2026-6-3 14:58*

挺有意思的

**[*9* #](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55358161)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/17a31b452af495ec.gif) [zzl0308](https://www.52pojie.cn/home.php?mod=space&uid=2282203) *发表于 2026-6-3 14:59*

还是有一定的趣味性

**[*10* #](https://www.52pojie.cn/forum.php?mod=redirect&goto=findpost&ptid=2110423&pid=55364782)**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/17a31b452af495ec.gif) [eqfan](https://www.52pojie.cn/home.php?mod=space&uid=2405609) *发表于 2026-6-4 21:12*

感谢分享。。学习中
