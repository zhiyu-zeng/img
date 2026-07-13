---
title: 【微信】Frida17.12.0的功能与变化
source: https://mp.weixin.qq.com/s?__biz=MzU3MTY5MzQxMA==&mid=2247485254&idx=1&sn=32ca95e377824e9841fd305f7a77e2aa
source_host: mp.weixin.qq.com
clip_date: 2026-07-14T00:40:18+08:00
trace_id: 9e80f392-d4b6-4f0b-9180-259b523185f5
content_hash: f8ea525dfb8bf6d11ff3bbacfd5372e2ff2e720f1d1bfa5327aa93fd1754a740
status: summarized
tags:
  - 微信
  - Frida
  - 逆向工程
  - 代码分析
  - 注入器
  - GumJS
  - 稳定性修复
series: null
feed_source: null
ai_summary: Frida 17.12.0 增强了代码分析能力，并提升了 Linux 注入与 Windows arm64 场景的稳定性。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 39c75244-d011-81b6-a6f6-cea80af0a6db
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.12.0 增强了代码分析能力，并提升了 Linux 注入与 Windows arm64 场景的稳定性。
> 
> - **新增API：** Gum库和GumJS中新增了 `Process.findFunctionRange()` 和 `ControlFlowGraph` 接口，可用于在无符号信息时定位函数边界及分析控制流。
> - **Linux注入改进：** 优化了触发点选择逻辑，增加了eBPF不可用时的回退采样，并改进了多线程下触发点写入与恢复的流程。
> - **Interceptor刷新：** 新增 `gum_interceptor_flush_function()` 和 `gum_interceptor_flush_listener()` 接口，支持按函数或监听器进行细粒度刷新。
> - **路径与修复：** 修正了agent的dlopen路径以兼容调试器，并修复了Windows arm64平台上Stalker和Exceptor的相关问题。
> - **文档补充：** 补充了Gum和Core的公开API文档，改善了GObject introspection的数据生成。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/aeb803b9494d321b.jpg)

Frida17.12.0发布于2026年6月10日。官方发布说明列出的更新集中在四个方向：Gum/GumJS新增代码形状分析接口，Linux注入器调整触发点选择和agent装载路径，Interceptor增加细粒度刷新接口，Windows arm64相关的Stalker和Exceptor修复。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a8fc3b0648631153.bin)

## 更新范围

17.12.0对应的主要提交如下。

| 子仓库 | 提交  | 更新内容 |
| --- | --- | --- |
| `frida-gum` | `67a1b9c` | 新增 `gum_process_find_function_range()` |
| `frida-gum` | `5e2fd31` | 新增 `GumControlFlowGraph` 模块 |
| `frida-gum` | `b3273ea` | 在GumJS暴露 `Process.findFunctionRange()` 和 `ControlFlowGraph` |
| `frida-gum` | `f04c3e3` | 调整控制流图公开命名，例如 `findBlockContaining()` 和 `capacity` |
| `frida-gum` | `779f9b0` | 新增 `gum_interceptor_flush_function()` 和 `gum_interceptor_flush_listener()` |
| `frida-core` | `a0a8838` | eBPF采样不可用时回退到 `/proc/<pid>/task/<tid>/syscall` |
| `frida-core` | `33e5879` | 按实际bootstrap stub大小筛选触发函数 |
| `frida-core` | `880f7ac` | 采样线程栈，寻找可容纳注入stub的libc调用点 |
| `frida-core` | `f0cc3b4` | 安装和恢复触发点时使用对称写回流程 |
| `frida-core` | `f51327f` | agent通过 `/proc/<pid>/fd/<fd>` 路径装载 |
| `frida-core` | `21dc508` | 捕获libbpf诊断日志并写入错误信息 |

这些提交覆盖了两个层面。 `frida-gum` 侧增加公开API和GumJS绑定，主要供脚本和嵌入式使用； `frida-core` 侧调整Linux注入实现，主要影响 `frida-server` 、attach和注入稳定性。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fe842ee39a9a8afa.png)

## 函数范围定位

`frida-gum` 提交 `67a1b9c` 新增 `gum_process_find_function_range()` ，用于根据函数内部地址查找该地址所在函数的连续代码范围。

头文件中的声明如下：

```
GUM_API gboolean gum_process_find_function_range(gconstpointer address,
    GumMemoryRange * range);
```

该接口不要求目标二进制保留符号。实现侧会优先读取平台的unwind信息：POSIX平台通过 `_Unwind_Find_FDE` 并解析FDE编码，Windows平台通过 `RtlLookupFunctionEntry` 查询运行时函数表。若unwind信息不可用，则退回到符号边界查询。

GumJS侧对应接口是 `Process.findFunctionRange()` 。它接收一个 `NativePointer` ，返回 `{ base, size }` 形式的内存范围；如果无法定位函数范围，则返回 `null` 。

官方测试中的调用方式如下：

```go
const f = ptr.strip();
const range = Process.findFunctionRange(f);
send(range !== null);
send(range.base.compare(f) <= 0 &&
    f.compare(range.base.add(range.size)) < 0);
```

在实际脚本中， `ptr` 可以替换为某个导出函数地址、符号地址，或者任意落在目标函数内部的指令地址。例如：

```go
const openPtr = Module.getGlobalExportByName('open');
const range = Process.findFunctionRange(openPtr);
if (range !== null) {
console.log('base=' + range.base + ', size=' + range.size);
}
```

该接口可用于确定函数边界、检查某个Hook点是否位于同一函数内，或者在指令重定位前获取可分析范围。

## 控制流图接口

`frida-gum` 提交 `5e2fd31` 新增 `GumControlFlowGraph` 。该模块基于Capstone反汇编函数代码，构建基本块、前驱、后继和支配关系。提交说明中提到，它使用resolver定位函数范围，并通过直接分支发现多段函数，例如热路径和冷路径分离的函数片段。

公开头文件中的主要接口如下：

```
typedefgboolean(* GumControlFlowGraphFindRangeFunc)(gconstpointer address,
    GumMemoryRange * range, gpointer user_data);
typedefgboolean(* GumFoundDominatingSiteFunc)(gconstpointer site,
    gsize capacity, gpointer user_data);
GUM_API GumControlFlowGraph * gum_control_flow_graph_new(gconstpointer entry,
    cs_arch arch, cs_mode mode, GumControlFlowGraphFindRangeFunc find_range,
    gpointer user_data);
GUM_API GumControlFlowGraph * gum_control_flow_graph_new_for_function(
    gconstpointer entry_point);
GUM_API gboolean gum_control_flow_graph_dominates(GumControlFlowGraph * self,
    gconstpointer a, gconstpointer b);
GUM_API voidgum_control_flow_graph_enumerate_dominating_sites(
    GumControlFlowGraph * self, gconstpointer target,
    GumFoundDominatingSiteFunc func, gpointer user_data);
```

其中 `gum_control_flow_graph_dominates()` 用于判断地址 `a` 是否支配地址 `b` 。 `gum_control_flow_graph_enumerate_dominating_sites()` 会枚举支配目标地址的可写入位置，并给出 `capacity` ，表示从该位置开始、不会被其它控制流边落入的连续字节数。

测试用例中构造了一个类似 `start_thread` 的短函数，用来验证支配关系和可写入位置。

```
TESTCASE (single_range_dominators_and_sites)
{
staticconst guint8 code[] = {
0x48, 0x85, 0xc0, 0x74, 0x04, 0xff, 0xd0, 0xeb, 0x03, 0xff, 0xd0, 0x90,
0xc3,
  };
  GumTestCode layout = { code, sizeof (code), NULL, 0 };
  GumControlFlowGraph * cfg;
  GumCollectedSites sites = { { NULL, }, };
  cs_arch_register_x86 ();
  cfg = gum_control_flow_graph_new (code, CS_ARCH_X86, CS_MODE_64,
      gum_test_find_range, &layout);
  g_assert_true (
      gum_control_flow_graph_dominates (cfg, code + 0x00, code + 0x09));
  g_assert_true (
      gum_control_flow_graph_dominates (cfg, code + 0x03, code + 0x09));
  g_assert_false (
      gum_control_flow_graph_dominates (cfg, code + 0x05, code + 0x09));
  gum_control_flow_graph_enumerate_dominating_sites (cfg, code + 0x09,
      gum_test_collect_site, &sites);
}
```

这段测试说明了接口的判定语义：只有位于所有到达目标路径上的指令才算支配目标；被条件分支绕过的指令不会被当作支配点。

## GumJS控制流图用法

`frida-gum` 提交 `b3273ea` 把控制流图接口暴露到GumJS。17.12.0最终公开的JS对象包括 `ControlFlowGraph` 和 `BasicBlock` 。

官方测试中的调用方式如下：

```javascript
const cfg = newControlFlowGraph(ptr);
const entry = cfg.entryBlock;
send(entry !== null);
send(cfg.blocks.length > 0);
send(cfg.findBlockContaining(entry.start).start.equals(entry.start));
send(cfg.dominates(entry.start, entry.start));
const insns = entry.instructions;
send(insns.length > 0);
send(insns[0].address.equals(entry.start));
send(Array.isArray(entry.successors));
send(Array.isArray(entry.predecessors));
const sites = cfg.enumerateDominatingSites(entry.start);
send(sites.length > 0);
send(sites[0].address.equals(entry.start));
send(typeof sites[0].capacity === 'number');
```

实际使用时，可以先取一个函数地址，再构建控制流图：

```javascript
const target = Module.getGlobalExportByName('pthread_create');
const cfg = newControlFlowGraph(target);
console.log('block count=' + cfg.blocks.length);
for (const site of cfg.enumerateDominatingSites(target)) {
console.log('site=' + site.address + ', capacity=' + site.capacity);
}
```

如果脚本需要检查某个地址属于哪个基本块，可以使用 `findBlockContaining()` ：

```javascript
const block = cfg.findBlockContaining(target);
if (block !== null) {
console.log('block start=' + block.start);
console.log('block end=' + block.end);
console.log('instruction count=' + block.instructions.length);
}
```

这组接口可用于Hook点筛选、函数内控制流查看、基本块粒度分析等场景。

## C层控制流图用法

嵌入Gum或开发原生组件时，可直接使用C接口。

```javascript
static gboolean
on_site(gconstpointer site, gsize capacity, gpointer user_data)
{
  g_print ("site=%p capacity=%zu\n", site, capacity);
return TRUE;
}
void
inspect_target(gconstpointer target)
{
  GumControlFlowGraph * cfg;
  cfg = gum_control_flow_graph_new_for_function (target);
  gum_control_flow_graph_enumerate_dominating_sites (cfg, target, on_site, NULL);
  gum_control_flow_graph_free (cfg);
}
```

如果只查询函数范围，可直接使用 `gum_process_find_function_range()` ：

```python
GumMemoryRange range;
if (gum_process_find_function_range (target, &range))
{
  g_print ("function range: %p - %p\n",
      (void *) range.base_address,
      (void *) (range.base_address + range.size));
}
```

## Linux注入器触发点采样

17.12.0中， `frida-core` 对Linux的 `proc-mem` 注入链路做了多处修改。相关代码位于 `src/linux/proc-mem-injector.vala` 。

提交 `a0a8838` 增加了采样回退逻辑。优先使用 `ActivitySampler` 采样；如果eBPF或perf因为权限限制不可用，则读取 `/proc/<pid>/task/<tid>/syscall` 。

```java
privateasyncuint64 discover_trigger (ProcMapsSnapshot maps, RegionLayout region, StackRendezvous rendezvous,
uint64 mmap_impl, uint64 exclude, Cancellable? cancellable) throws Error, IOError {
Gee.List<SampledStack> stacks;
var sampler = new ActivitySampler (pid);
try {
    sampler.start ();
    yield sleep_ms (SAMPLE_WINDOW_MS);
    sampler.stop ();
    stacks = sampler.stacks;
  } catch (Error e) {
    stacks = yield sample_threads_via_proc (maps, cancellable);
  }
return hottest_libc_function (maps, region, rendezvous, mmap_impl, stacks, exclude);
}
```

提交 `880f7ac` 扩展 `/proc` 路径的采样内容。修改前只读取线程当前PC；修改后还会读取栈指针附近的若干栈字，形成候选调用帧。

```kotlin
privateuint64[] read_thread_frames (ProcMapsSnapshot maps, uint tid) throws Error {
string contents;
try {
    FileUtils.get_contents ("/proc/%u/task/%u/syscall".printf (pid, tid), out contents);
  } catch (FileError e) {
return {};
  }
string[] fields = contents.strip ().split (" ");
if (fields.length < 2)
return {};
uint64 pc;
if (!uint64.try_parse (fields[fields.length - 1], out pc, null, 0) || pc == 0)
return {};
uint64 sp;
var stack = (uint64.try_parse (fields[fields.length - 2], out sp, null, 0) && sp != 0)
    ? maps.find_mapping (sp)
    : null;
if (stack == null)
returnnewuint64[] { pc };
uint depth = uint.min (STACK_SCAN_DEPTH, (uint) ((stack.end - sp) / 8));
var frames = newuint64[1 + depth];
  frames[0] = pc;
for (uint i = 0; i != depth; i++)
    frames[1 + i] = mem.read_pointer (sp + (uint64) i * 8);
return frames;
}
```

这段逻辑用于处理多线程目标中的一种情况：线程可能停在很短的syscall wrapper里，当前PC所在函数空间不足以写入bootstrap stub。读取栈上的返回地址后，注入器可在调用链中查找可容纳stub的libc函数作为触发点。

提交 `33e5879` 调整了触发函数大小判定方式。修改前使用固定最小长度；修改后先构造实际要写入的stub，再用实际长度筛选候选函数。

```
privateuint64 trigger_stub_footprint (uint64 sample_target, RegionLayout region, StackRendezvous rendezvous,
uint64 mmap_impl) throws Error {
uint8[] stub = build_trigger_stub (sample_target, rendezvous.cas, mmap_impl, 0, region.total,
    region.entry_offset);
return BOOTSTRAP_OFFSET + stub.length;
}
```

## 触发点写入与恢复

提交 `f0cc3b4` 调整了触发函数恢复过程。恢复时先让调用者停在触发点入口，再写回stub覆盖区域，最后恢复函数前导指令。

```
privateasyncvoid restore_trigger (uint64 target, uint8[] original) throws Error, IOError {
  block_callers (target);
  yield sleep_ms (DRAIN_MS);
  mem.write_memory (target + BOOTSTRAP_OFFSET, original[BOOTSTRAP_OFFSET:original.length]);
  restore_prologue (target, original);
}
```

对应的安装流程也先调用 `block_callers()` ，等待短时间后再写入bootstrap。

```
privateasyncvoid install_bootstrap (uint64 target, uint8[] stub) throws Error, IOError {
  block_callers (target);
  yield sleep_ms (DRAIN_MS);
  mem.write_memory (target + BOOTSTRAP_OFFSET, stub);
  release_callers (target);
}
```

该修改针对的是多线程进程中触发函数正在被其它线程执行的情况，避免恢复过程中出现半写入的函数前导区域。

## Agent装载路径

提交 `f51327f` 修改了Linux loader中agent的 `dlopen()` 路径。旧路径使用 `/proc/self/fd/<fd>` ，新路径改为 `/proc/<pid>/fd/<fd>` 。

补丁中的核心代码如下：

```
staticpid_t
frida_getpid(void)
{
return frida_syscall_0 (SYS_getpid);
}
```

```rust
libc->sprintf (agent_path, "/proc/%d/fd/%d", frida_getpid (), agent_codefd);
ctx->agent_handle = libc->dlopen (agent_path, libc->dlopen_flags, pretend_caller_addr);
if (ctx->agent_handle == NULL)
goto dlopen_failed;
```

提交说明指出，附加调试器会在动态链接器的库加载事件中读取 `dlopen()` 传入的路径。若路径是 `/proc/self/fd/<fd>` ，调试器侧解析到的是调试器自己的fd表，而不是目标进程的fd表，可能导致读取失败并让加载线程停在动态链接器断点处。改成 `/proc/<pid>/fd/<fd>` 后，目标进程内部和外部观察者解析到同一个对象路径。

## libbpf诊断信息

提交 `21dc508` 修改了libbpf错误日志处理方式。此前libbpf诊断信息可能直接输出到 `stderr` ，这次改为捕获日志并写入抛出的错误信息中。

该修改主要影响失败场景的可观测性。eBPF加载失败时，调用方可从异常消息中看到verifier或权限相关信息，而不是只能依赖外部标准错误输出。

## Interceptor刷新接口

提交 `779f9b0` 给 `GumInterceptor` 新增两个刷新接口。

```
GUM_API gboolean gum_interceptor_flush_function(GumInterceptor * self,
    gconstpointer function_address);
GUM_API gboolean gum_interceptor_flush_listener(GumInterceptor * self,
    GumInvocationListener * listener);
```

`gum_interceptor_flush()` 是全局刷新；新增的两个接口分别按函数地址和监听器刷新。源码中的实现会检查当前transaction状态和待销毁任务，只在指定函数或指定listener相关任务仍未完成时返回 `FALSE` 。

最小调用方式如下：

```
if (!gum_interceptor_flush_function (interceptor, target))
  g_print ("target still busy\n");
if (!gum_interceptor_flush_listener (interceptor, listener))
  g_print ("listener still busy\n");
```

该接口可供原生Gum使用者在卸载单个Hook或释放某个listener前确认相关调用已结束。

## Windows arm64修复

17.12.0还包含多项Windows arm64相关修复。发布说明中列出的主要内容包括：

1.  `stalker-arm64`
    
    修复远距离backpatch epilog丢失 `BL` 的问题。
    
2.  `stalker`
    
    在Windows上检测线程退出，避免继续跟踪进入 `ntdll` 线程清理路径。
    
3.  `exceptor`
    
    在Windows arm64上改用 `RtlRestoreContext()` 恢复上下文，避免 `longjmp()` 处理合成栈帧时终止进程。
    
4.  CI增加Windows arm64原生任务。
    

这些修改集中在稳定性修复，不涉及新的脚本API。

## 公共API文档

17.12.0还补充了Gum和Core的公开API文档。发布说明中列出的Gum文档对象包括 `Interceptor` 、 `Stalker` 、 `Exceptor` 、 `Module` 、 `ModuleMap` 、 `ModuleRegistry` 、 `MemoryMap` 、 `MemoryAccessMonitor` 和 `DarwinGrafter` 。 `frida-core` 侧也新增了Vala文档注释注入GIR的相关提交。

这部分更新主要影响文档生成、GObject introspection数据和下游绑定维护。

## 总结

Frida17.12.0的更新包括以下几类：

1.  Gum新增函数范围定位和控制流图接口，GumJS增加对应的 `Process.findFunctionRange()` 和 `ControlFlowGraph` 。
    
2.  Linux注入器调整触发点采样、触发函数大小判断、触发点恢复和agent装载路径。
    
3.  Interceptor增加按函数和按listener刷新的接口。
    
4.  Windows arm64相关的Stalker、Exceptor和CI配置得到修复和补充。
    
5.  Gum和Core补充公开API文档和GObject introspection发布流程。
    

对脚本使用者来说，直接可用的新接口是 `Process.findFunctionRange()` 和 `ControlFlowGraph` 。对嵌入Gum或维护Frida集成的人来说，相关接口包括 `gum_process_find_function_range()` 、 `gum_control_flow_graph_*()` 和新的Interceptor刷新接口。Linux注入器相关修改属于内部实现调整，主要体现在attach和注入失败场景的行为变化。

## 参考

1.  Frida新闻页： `https://frida.re/news/`
    
2.  Frida17.12.0发布页： `https://frida.re/news/2026/06/10/frida-17-12-0-released/`
    
3.  `frida-gum`
    
    提交 `67a1b9c` 、 `5e2fd31` 、 `b3273ea` 、 `f04c3e3` 、 `779f9b0`
    
4.  `frida-core`
    
    提交 `a0a8838` 、 `33e5879` 、 `880f7ac` 、 `f0cc3b4` 、 `f51327f` 、 `21dc508`
    

[跳转微信打开](https://wechat2rss.xlab.app/link-proxy/?k=aebb448b&r=1&u=https%3A%2F%2Fmp.weixin.qq.com%2Fs%3F__biz%3DMzU3MTY5MzQxMA%3D%3D%26mid%3D2247485254%26idx%3D1%26sn%3D32ca95e377824e9841fd305f7a77e2aa)
