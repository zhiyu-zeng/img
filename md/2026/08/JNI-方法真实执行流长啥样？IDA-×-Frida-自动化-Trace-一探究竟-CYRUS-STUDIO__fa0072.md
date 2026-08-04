---
title: JNI 方法真实执行流长啥样？IDA × Frida 自动化 Trace 一探究竟 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/jni-%E6%96%B9%E6%B3%95%E7%9C%9F%E5%AE%9E%E6%89%A7%E8%A1%8C%E6%B5%81%E9%95%BF%E5%95%A5%E6%A0%B7ida--frida-%E8%87%AA%E5%8A%A8%E5%8C%96-trace-%E4%B8%80%E6%8E%A2%E7%A9%B6%E7%AB%9F/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:09:49+08:00
trace_id: 21178bb0-1a23-42ca-b847-c79566f0394e
content_hash: 6d02a3799e2780fd10bd022c04558d93f813dd80aa4926f9183376d14cf903b6
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 结合Frida动态获取so基址与IDA Pro指令级跟踪，可实现JNI方法执行流自动化Trace，精准控制跟踪范围并排除无关系统库指令。
ai_summary_style: key-points
images_status:
  total: 22
  succeeded: 22
  failed_urls: []
notion_page_id: 3b275244-d011-81ae-a3b8-c8dc61968210
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 结合Frida动态获取so基址与IDA Pro指令级跟踪，可实现JNI方法执行流自动化Trace，精准控制跟踪范围并排除无关系统库指令。
> 
> - **Frida获取模块基址：** 通过`Process.enumerateModules()`实时获取目标so的基址和大小，用于计算Trace起始与结束地址，并自动注入脚本监听dlopen等动态加载事件。
> - **IDA调试钩子控制范围：** 继承`ida_dbg.DBG_Hooks`，在`dbg_trace`中判断当前地址是否在目标so内；不在时记录LR，允许外部执行1步后强制跳回LR，避免trace漂移到系统库。
> - **自动化断点与追踪管理：** 脚本在起始和结束偏移地址自动设置断点，命中起始点时开启`enable_insn_trace`和`enable_step_trace`，到达结束点时自动关闭并暂停进程。
> - **完整工具链集成：** 提供`AutoTracer`类，支持spawn或attach模式，整合Frida注入与IDA调试事件，实现“一次配置、全程自动化”的工作流，显著提升JNI逆向分析效率。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在逆向分析 Android 应用时，我们常常需要分析 **JNI 函数的调用逻辑**。很多安全相关的逻辑（如加解密、签名校验、反调试检查）都会放在 Native 层的 so 库中。

如果我们想要理清 JNI 函数真实的执行流程，单纯依靠下断点和单步调试往往效率不高，IDA Pro 提供的 **Tracing（跟踪）功能** 就非常有用。它可以捕获指令级别的执行轨迹，再结合 **Frida 的动态信息**，就能构建出一套高效的 **自动化 Trace 流程**。

本文将带你从 **IDA Trace 的基本使用** 开始，逐步深入到 **IDA × Frida 混合调试的自动化 Trace 实践。**

## 定位 JNI 方法内存地址

在 Trace 之前，先找到 JNI 方法在内存中的地址，通过 jni_addr.py 得到目标 JNI 方法内存地址为 0x72e9d1cfa8

```sql
------------ [ #7 Native Method ] ------------
Method Name     : public static native java.lang.Object lte.NCall.IL(java.lang.Object[])
ArtMethod Ptr   : 0x9f63a680
Native Addr     : 0x72e9d1cfa8
Module Name     : libGameVMP.so
Module Offset   : 0xdfa8
Module Base     : 0x7b6b447000
Module Size     : 462848 bytes
Module Path     : /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
------------------------------------------------
```

具体参考： [逆向 JNI 函数找不到入口？动态注册定位技巧全解析](https://cyrus-studio.github.io/blog/posts/%E9%80%86%E5%90%91-jni-%E5%87%BD%E6%95%B0%E6%89%BE%E4%B8%8D%E5%88%B0%E5%85%A5%E5%8F%A3%E5%8A%A8%E6%80%81%E6%B3%A8%E5%86%8C%E5%AE%9A%E4%BD%8D%E6%8A%80%E5%B7%A7%E5%85%A8%E8%A7%A3%E6%9E%90/)

## 附加到目标进程

IDA 附加到目标 app

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7ee868985b59043b.png)](data:image/png;base64,inline-39074B)

附加成功后，IDA 默认会将目标进程 暂停，方便你人工选择调试起点。

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d0bf119b1786bde3.png)](data:image/png;base64,inline-266578B)

按 G 跳转到 0x72e9d1cfa8 下断点

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1d9f8b26f25465ed.png)](data:image/png;base64,inline-117950B)

有反调试

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4cbc55d08de54513.png)](data:image/png;base64,inline-20314B)

把其他线程先全部挂起

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dcbbd3e46ed21f14.png)](data:image/png;base64,inline-312410B)

相关文章： [静态分析根本不够！IDA Pro 动态调试 Android 应用的完整实战](https://cyrus-studio.github.io/blog/posts/%E9%9D%99%E6%80%81%E5%88%86%E6%9E%90%E6%A0%B9%E6%9C%AC%E4%B8%8D%E5%A4%9Fida-pro-%E5%8A%A8%E6%80%81%E8%B0%83%E8%AF%95-android-%E5%BA%94%E7%94%A8%E7%9A%84%E5%AE%8C%E6%95%B4%E5%AE%9E%E6%88%98/)

## 使用 IDA Trace 跟踪函数执行过程

## 1\. Tracing options 设置

-   设置 Trace 文件保存路径
    
-   去掉勾选 Trace over debugger segments，减少不必要的 Tracing 数据量（控制的是 tracing 操作是否仅限于当前调试器的代码段（segments），还是可以跨越所有内存段执行指令追踪）。
    

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b8fa8b963117ac5e.png)](data:image/png;base64,inline-55562B)

## 2\. 下断点

按 G 跳转到目标函数地址，在函数开始地址和结束地址下断点

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9899fb4d823b9bfb.png)](data:image/png;base64,inline-122630B)

## 3\. 开启 Instruction tracing

断点触发，开启 Instruction tracing，然后 F8 单步执行

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a18a85fa0269cfc4.png)](data:image/png;base64,inline-66566B)

可以看到执行过的指令都会黄色高亮显示

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1ebe37b44311bcd4.png)](data:image/png;base64,inline-114682B)

## 4\. 到达结束地址，关闭 Instruction tracing

执行到函数 RET 位置，关闭 Instruction tracing

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a6dace83e661f30f.png)](data:image/png;base64,inline-57666B)

## 查看 Trace 记录

打开 Tracing window 可以看到跟踪记录的每条指令和寄存器的值

[![word/media/image11.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9b9111eb8bf824e3.png)](data:image/png;base64,inline-65022B)

[![word/media/image12.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/15ae9e896c957e09.png)](data:image/png;base64,inline-252666B)

打开 trace 文件也可以看到跟踪记录

[![word/media/image13.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/020949c8a9449e5a.png)](data:image/png;base64,inline-576818B)

## Trace 回放

## 1\. 保存 Trace 记录到文件

Save trace，保存 trace 记录到文件

[![word/media/image14.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/db40057a679ebd32.png)](data:image/png;base64,inline-199090B)

设置文件名

[![word/media/image15.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ca4458a06f73b771.png)](data:image/png;base64,inline-7174B)

## 2\. 回放 Trace 记录

调试器选择 Trace replayer

[![word/media/image16.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/257360aa02d8f839.png)](data:image/png;base64,inline-34146B)

tracing window 中加载保存的 trc 文件

[![word/media/image17.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0b3f5f5540cdd94d.png)](data:image/png;base64,inline-29286B)

按 F9 开始重新执行 trace 记录

参考： [Using Trace Replayer Debugger and Managing Traces in IDA](https://hex-rays.com/hubfs/freefile/trace_replayer.pdf)

## IDA × Frida 混合调试自动化 Trace

**单纯依赖 IDA Pro 手动 Trace JNI 方法存在很大不便**：

-   需要手动找到 so 模块的加载基址，并计算 JNI 方法的偏移地址。
    
-   每次调试时都要 **重新设置断点、配置 Trace 选项、手动开启/关闭指令 Trace**。
    
-   如果目标 so 是通过 dlopen 动态加载的，还必须反复等待并确认其真正的加载时机。
    
-   过程繁琐、容易出错，效率极低。
    

而引入 **Frida** 后情况完全不同：

-   Frida 可以实时监控 dlopen/android_dlopen_ext，在 so 模块加载的瞬间就获取基址。
    
-   脚本可以自动将模块基址与 JNI 方法偏移计算结合，自动设置断点。
    
-   当函数进入时自动开启 Trace，到达返回点时自动关闭 Trace， **完全免去手动操作**。
    
-   最终 Trace 记录可以保存和回放，形成一套 **“一次配置、全程自动化”** 的工作流。
    

因此， **结合 Frida 的动态注入能力与 IDA Pro 的强大调试追踪能力**，我们就能实现对 Android so 模块的 **自动化 Trace**，既避免了手动调试的繁琐，也能得到更完整、更真实的执行指令流，大幅提升逆向效率。

## 1\. 通过 Frida 获取模块信息

-   脚本使用 frida.get_device_manager().add_remote_device 连接远程设备，并附加到前台应用。
    
-   注入一段 Frida JS 脚本，调用 Process.enumerateModules() 获取指定 so 的 base 和 size。
    
-   返回模块信息（字典结构，包含 name, base, size）。
    

```python
# =========================
# Frida 辅助函数
# =========================
# 连接远程设备并附加到前台应用
def attach_frontmost_app(remote_addr="127.0.0.1:1234"):
    device = frida.get_device_manager().add_remote_device(remote_addr)
    app = device.get_frontmost_application()
    print(f"[+] 前台应用: {app.identifier} (pid={app.pid})")

    session = device.attach(app.pid)
    return device, session, app


# 获取指定模块的基址和大小
def get_module_info(session, module_name):
    js_code = f"""
        rpc.exports = {{
            findmodule: function() {{
                var results = [];
                Process.enumerateModules().forEach(function(m) {{
                    if (m.name.indexOf("{module_name}") >= 0) {{
                        results.push({{
                            name: m.name,
                            base: m.base.toString(),
                            size: m.size
                        }});
                    }}
                }});
                return results;
            }}
        }};
    """
    script = session.create_script(js_code)
    script.load()
    module_info = script.exports.findmodule()

    if not module_info:
        print(f"[!] 没找到模块: {module_name}")
        return None
    else:
        print(f"[+] 找到 {module_name}: {module_info[0]}")
        return module_info[0]
```

**目的**：确保 IDA 中的 Trace 范围可以精确映射到目标 so。

具体参考： [静态分析神器 + 动态调试利器：IDA Pro × Frida 混合调试实战](https://cyrus-studio.github.io/blog/posts/%E9%9D%99%E6%80%81%E5%88%86%E6%9E%90%E7%A5%9E%E5%99%A8-+-%E5%8A%A8%E6%80%81%E8%B0%83%E8%AF%95%E5%88%A9%E5%99%A8ida-pro--frida-%E6%B7%B7%E5%90%88%E8%B0%83%E8%AF%95%E5%AE%9E%E6%88%98/)

## 2\. IDA 中自动设置断点

根据 Frida 获取的 base 地址 + 配置的偏移量，自动计算出 Trace 的起始点和结束点。

```
start_ea = module_info["base"] + TRACE_START_OFFSET
end_eas = [module_info["base"] + off for off in TRACE_END_OFFSETS]

set_breakpoint(start_ea)
for ea in end_eas:
    set_breakpoint(ea)
```

通过 idc.add_bpt 在 IDA 调试器中设置断点。

```python
def set_breakpoint(ea):
    """在指定地址设置断点"""
    idc.create_insn(ea)
    idc.add_bpt(ea)
    print(f"[+] 设置断点: 0x{ea:x}")
```

**作用**：让 Trace 从关键函数入口点开始，并在目标位置结束。

## 3\. 自定义调试 Hook

在 **IDA Pro** 的 Python API 里，ida_dbg.DBG_Hooks 是一个 **调试事件回调类（调试 Hook 基类）**。

你可以继承它，并重写里面的回调方法，来捕获调试过程中发生的各种事件（比如断点触发、单步执行、进程暂停/退出、线程创建/销毁、trace 命中等）。

IDA Python3 API 库所在路径：IDA_Pro_7.7\\python\\3

[![word/media/image18.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7c0ed7827a3a542a.png)](data:image/png;base64,inline-347374B)

文档： [https://cpp.docs.hex-rays.com/group\__dbg\__funcs\__flow.html](https://cpp.docs.hex-rays.com/group__dbg__funcs__flow.html)

dbg_bpt：命中断点时检查是否到达 Trace 起始点，如是则开始指令追踪。

```python
def dbg_bpt(self, tid, ea):
    """
    命中断点时触发
    """
    print(f"[TraceHook] Breakpoint hit: ea=0x{ea:x}, tid={tid}")

    # 命中 Trace 起始点
    if ea == self.start_ea:
        print("[TraceHook] Hit start breakpoint → 开始指令追踪")
        self.line_trace = True
        # 清除所有 tracing 数据
        ida_dbg.clear_trace()
        # 开启指令跟踪
        self.enable_instruction_tracing()
        # 挂起其他线程
        # suspend_other_threads()

    return super().dbg_bpt(tid, ea)
```

dbg_trace：逐条指令 Trace，控制 Trace 范围。

-   判断是否命中 Trace 结束点，如是则停止追踪并暂停进程。
    
-   判断当前指令是否落在目标 so 内部。
    
-   如果跳出 so，则保存 LR（返回地址），并在执行若干步后强制跳回 LR，避免 Trace 漂移。
    
-   限制 Trace 数量（默认 300,000 条），避免占满缓冲区。
    

```python
def dbg_trace(self, tid, ea):
    """
    单步 trace 事件 (仅在启用 tracing 时触发)
    """
    if not self.line_trace:
        return super().dbg_trace(tid, ea)

    # 命中 Trace 结束点
    if self.last_ea in self.end_eas:
        print("[TraceHook] Hit end breakpoint → 停止追踪并暂停进程")
        self.disable_instruction_tracing()
        ida_dbg.suspend_process()
        return super().dbg_trace(tid, ea)

    self.last_ea = ea

    # 判断当前地址是否在目标 so 内
    in_target_so = self.module_info["base"] <= ea <= (self.module_info["base"] + self.module_info["size"])

    # trace 步数统计
    self.trace_count += 1

    # 处理目标 so 之外的逻辑
    if not in_target_so or ea in self.skip_functions:

        # 步入目标 so 外，但未超过限制
        if self.return_addr != 0 and self.outside_steps < self.max_outside_steps:
            self.outside_steps += 1
            return super().dbg_trace(tid, ea)

        # 已超出目标 so 步数限制
        if self.return_addr != 0 and self.outside_steps == self.max_outside_steps:
            print("[TraceHook] Exceeded outside step limit → Jump to LR")
            self.disable_instruction_tracing()
            ida_dbg.suspend_process()

            # trace buffer 超限清理
            if self.trace_count > self.trace_limit:
                print("[TraceHook] Trace count exceeded limit, clearing trace buffer")
                self.trace_count = 0
                ida_dbg.request_clear_trace()
                ida_dbg.run_requests()

            # 跳转回 LR
            ida_dbg.request_run_to(self.return_addr)
            ida_dbg.run_requests()

            # 重置状态
            self.return_addr = 0
            self.outside_steps = 0

            return super().dbg_trace(tid, ea)

        # 记录返回地址 (ARM64 LR = X30)
        if self.return_addr == 0:
            self.return_addr = get_reg_value("X30")

    return super().dbg_trace(tid, ea)
```

**Trace “漂移”问题**

-   在 **IDA 的 trace** 模式下，如果不加控制，CPU 会不断地被单步跟踪（insn trace/step trace）。
    
-   一旦函数调用 **跳出了目标 so** （例如调用 libc.so 或系统 API），IDA 仍然会继续跟踪，导致 trace 数据膨胀，采集到大量无关指令。
    
-   更糟的是：trace 跟着跑进系统库， **上下文逻辑就“漂移”了**，不再停留在我们真正关心的 so 内部。
    

**保存 LR + 跳回** 的设计是为了让 trace 始终聚焦在目标 so，不会跟着跑进系统库。如果不这么做，trace 结果会掺杂一大堆系统库指令，分析难度大、效率低。

dbg_run_to：在 Run-To 事件中启用指令级 Trace 和单步跟踪。

```python
def dbg_run_to(self, pid, tid=0, ea=0):
    """
    run_to 请求完成时触发
    """
    print(f"[TraceHook] dbg_run_to: ea=0x{ea:x}, pid={pid}, tid={tid}")
    if self.line_trace:
        self.enable_instruction_tracing()
    return super().dbg_run_to(pid, tid, ea)
```

调试目标进程退出 / 断开 **解除 hook** 和 **释放资源**

```python
def dbg_process_exit(self, pid, tid, ea, exit_code):
    """
    调试目标进程退出时触发 (进程终止)
    """
    print(f"[TraceHook] dbg_process_exit: pid={pid}, tid={tid}, ea=0x{ea:x}, code={exit_code}")
    self.unhook()
    print("[TraceHook] 已解除 hook (process exit)")
    return super().dbg_process_exit(pid, tid, ea, exit_code)

def dbg_process_detach(self, pid, tid, ea):
    """
    调试器主动分离时触发 (进程继续运行)
    """
    print(f"[TraceHook] dbg_process_detach: pid={pid}, tid={tid}, ea=0x{ea:x}")
    self.unhook()
    print("[TraceHook] 已解除 hook (detach)")
    return super().dbg_process_detach(pid, tid, ea)
```

**效果**：只 Trace 目标 so 内的执行路径，自动跳过无关代码，减少噪音。

## 自动化 Trace 脚本完整源码

ida_frida_hybrid_tracer.py

```python
# -*- coding: utf-8 -*-
"""
IDA-Frida Hybrid Tracer
=======================
一个结合 IDA Pro 与 Frida 的调试辅助脚本：
1. 使用 Frida 获取指定 so 模块基址与大小
2. 在 IDA Pro 中自动设置断点
3. 利用 IDA Python 调试 Hook 实现 Trace 控制
"""
import ida_dbg
import idc
import ida_idd
import frida

# =========================
# 配置区 (根据需要修改)
# =========================

REMOTE_ADDR = "127.0.0.1:1234"  # frida-server 地址
PACKAGE_NAME = "com.cyrus.example"  # 目标应用包名
MODULE_NAME = "libnative-lib.so"  # 目标 so 名称
TRACE_START_OFFSET = 0x25C40  # trace 起始偏移
TRACE_END_OFFSETS = [0x25C80, 0x25C5C]  # trace 结束偏移，可多个
USE_SPAWN = False  # True=spawn 启动, False=附加前台应用

# 跳过的函数入口地址（相对偏移），例如：["0x1234", "0x5678"]
SKIP_FUNCTIONS = [
    # 0x10000,  # 示例：目标 so 中需要跳过的函数偏移
]


# =========================
# 工具函数
# =========================

def to_hex(ea):
    """格式化地址为 16 进制字符串"""
    return hex(ea)


def set_breakpoint(ea):
    """在指定地址设置断点"""
    idc.create_insn(ea)  # 强制让 IDA 在 ea 处反汇编并生成一条指令（防止 add_bpt() 因为地址未被识别为指令而失败）
    idc.add_bpt(ea)
    print(f"[+] 设置断点: 0x{ea:x}")


def clear_all_breakpoints():
    """
    清空 IDA 中的所有断点
    """
    bpt_count = idc.get_bpt_qty()
    if bpt_count == 0:
        print("[*] 当前没有断点")
        return

    eas = [idc.get_bpt_ea(i) for i in range(bpt_count)]
    for ea in eas:
        try:
            idc.del_bpt(ea)
            print(f"[-] 已清除断点: 0x{ea:x}")
        except Exception as e:
            print(f"[!] 清除断点失败: 0x{ea:x}, 错误: {e}")

    print(f"[*] 共清理 {len(eas)} 个断点")


def get_reg_value(register):
    """获取指定寄存器的值"""
    rv = ida_idd.regval_t()
    ida_dbg.get_reg_val(register, rv)
    return rv.ival


def suspend_other_threads():
    """挂起除当前线程以外的所有线程"""
    current_thread = idc.get_current_thread()
    for i in range(idc.get_thread_qty()):
        tid = idc.getn_thread(i)
        if tid != current_thread:
            idc.suspend_thread(tid)


def resume_all_threads():
    """恢复所有线程"""
    for i in range(idc.get_thread_qty()):
        tid = idc.getn_thread(i)
        idc.resume_thread(tid)
    idc.resume_process()


def clear_all_hooks():
    """卸载所有已安装的 DBG_Hooks"""
    removed = 0
    for obj in list(globals().values()):
        if isinstance(obj, ida_dbg.DBG_Hooks):
            try:
                obj.unhook()
                print(f"[-] Unhooked {obj.__class__.__name__}")
                removed += 1
            except Exception as e:
                print(f"[!] Failed to unhook {obj}: {e}")
    if removed == 0:
        print("[*] No hooks to clear.")
    else:
        print(f"[+] Cleared {removed} hooks.")


# =========================
# Debug Hook 类
# =========================

class TraceHook(ida_dbg.DBG_Hooks):
    """调试事件 Hook，结合模块信息进行 trace 控制"""

    def __init__(self, start_ea, end_eas, module_info, skip_functions):
        super().__init__()
        self.module_info = module_info
        self.start_ea = start_ea
        self.end_eas = end_eas
        self.skip_functions = skip_functions

        self.trace_count = 0
        self.trace_limit = 300000
        self.outside_steps = 0  # 已连续在目标 so 之外执行的步数
        self.max_outside_steps = 1  # 允许在目标 so 外的最大连续步数
        self.return_addr = 0
        self.line_trace = False
        self.last_ea = None  # 上一次执行的地址

        print("[TraceHook] 初始化完成")
        print(f"[TraceHook] module_info       = {self.module_info}")
        print(f"[TraceHook] start_ea          = {hex(self.start_ea) if self.start_ea else None}")
        print(f"[TraceHook] end_eas           = {[hex(ea) for ea in self.end_eas] if self.end_eas else None}")
        print(f"[TraceHook] skip_functions    = {self.skip_functions}")
        print(f"[TraceHook] trace_count       = {self.trace_count}")
        print(f"[TraceHook] trace_limit       = {self.trace_limit}")
        print(f"[TraceHook] outside_steps     = {self.outside_steps}")
        print(f"[TraceHook] max_outside_steps = {self.max_outside_steps}")
        print(f"[TraceHook] return_addr       = {hex(self.return_addr)}")
        print(f"[TraceHook] line_trace        = {self.line_trace}")

    # ==========================================================
    # Trace 控制
    # ==========================================================
    def enable_instruction_tracing(self):
        """启用指令级 tracing 并继续执行"""
        ida_dbg.enable_insn_trace()
        ida_dbg.enable_step_trace()
        ida_dbg.request_continue_process()
        ida_dbg.run_requests()
        print("[TraceHook] Instruction tracing enabled")

    def disable_instruction_tracing(self):
        """禁用指令级 tracing"""
        ida_dbg.disable_insn_trace()
        ida_dbg.disable_step_trace()
        print("[TraceHook] Instruction tracing disabled")

    # ==========================================================
    # 调试事件回调
    # ==========================================================
    def dbg_bpt(self, tid, ea):
        """
        命中断点时触发
        """
        print(f"[TraceHook] Breakpoint hit: ea=0x{ea:x}, tid={tid}")

        # 命中 Trace 起始点
        if ea == self.start_ea:
            print("[TraceHook] Hit start breakpoint → 开始指令追踪")
            self.line_trace = True
            # 清除所有 tracing 数据
            ida_dbg.clear_trace()
            # 开启指令跟踪
            self.enable_instruction_tracing()
            # 挂起其他线程
            # suspend_other_threads()

        return super().dbg_bpt(tid, ea)

    def dbg_suspend_process(self):
        """
        调试目标进程暂停时触发
        """
        print("[TraceHook] dbg_suspend_process triggered")
        return super().dbg_suspend_process()

    def dbg_trace(self, tid, ea):
        """
        单步 trace 事件 (仅在启用 tracing 时触发)
        """
        if not self.line_trace:
            return super().dbg_trace(tid, ea)

        # 命中 Trace 结束点
        if self.last_ea in self.end_eas:
            print("[TraceHook] Hit end breakpoint → 停止追踪并暂停进程")
            self.disable_instruction_tracing()
            ida_dbg.suspend_process()
            return super().dbg_trace(tid, ea)

        self.last_ea = ea

        # 判断当前地址是否在目标 so 内
        in_target_so = self.module_info["base"] <= ea <= (self.module_info["base"] + self.module_info["size"])

        # trace 步数统计
        self.trace_count += 1

        # 处理目标 so 之外的逻辑
        if not in_target_so or ea in self.skip_functions:

            # 步入目标 so 外，但未超过限制
            if self.return_addr != 0 and self.outside_steps < self.max_outside_steps:
                self.outside_steps += 1
                return super().dbg_trace(tid, ea)

            # 已超出目标 so 步数限制
            if self.return_addr != 0 and self.outside_steps == self.max_outside_steps:
                print("[TraceHook] Exceeded outside step limit → Jump to LR")
                self.disable_instruction_tracing()
                ida_dbg.suspend_process()

                # trace buffer 超限清理
                if self.trace_count > self.trace_limit:
                    print("[TraceHook] Trace count exceeded limit, clearing trace buffer")
                    self.trace_count = 0
                    ida_dbg.request_clear_trace()
                    ida_dbg.run_requests()

                # 跳转回 LR
                ida_dbg.request_run_to(self.return_addr)
                ida_dbg.run_requests()

                # 重置状态
                self.return_addr = 0
                self.outside_steps = 0

                return super().dbg_trace(tid, ea)

            # 记录返回地址 (ARM64 LR = X30)
            if self.return_addr == 0:
                self.return_addr = get_reg_value("X30")

        return super().dbg_trace(tid, ea)

    def dbg_run_to(self, pid, tid=0, ea=0):
        """
        run_to 请求完成时触发
        """
        print(f"[TraceHook] dbg_run_to: ea=0x{ea:x}, pid={pid}, tid={tid}")
        if self.line_trace:
            self.enable_instruction_tracing()
        return super().dbg_run_to(pid, tid, ea)

    def dbg_process_exit(self, pid, tid, ea, exit_code):
        """
        调试目标进程退出时触发 (进程终止)
        """
        print(f"[TraceHook] dbg_process_exit: pid={pid}, tid={tid}, ea=0x{ea:x}, code={exit_code}")
        self.unhook()
        print("[TraceHook] 已解除 hook (process exit)")
        return super().dbg_process_exit(pid, tid, ea, exit_code)

    def dbg_process_detach(self, pid, tid, ea):
        """
        调试器主动分离时触发 (进程继续运行)
        """
        print(f"[TraceHook] dbg_process_detach: pid={pid}, tid={tid}, ea=0x{ea:x}")
        self.unhook()
        print("[TraceHook] 已解除 hook (detach)")
        return super().dbg_process_detach(pid, tid, ea)


# =========================
# Frida 辅助类
# =========================

class FridaHelper:
    def __init__(self, remote_addr):
        self.remote_addr = remote_addr
        self.device = None
        self.session = None
        self.pid = None
        print(f"[FridaHelper] 初始化完成 (remote_addr={remote_addr})")

    def connect(self):
        """连接远程 frida-server"""
        self.device = frida.get_device_manager().add_remote_device(self.remote_addr)
        print(f"[FridaHelper] 已连接到远程设备: {self.remote_addr}")
        return self.device

    def attach_frontmost(self):
        """附加到前台应用"""
        if not self.device:
            self.connect()
        app = self.device.get_frontmost_application()
        self.session = self.device.attach(app.pid)
        self.pid = app.pid
        print(f"[FridaHelper] 前台应用: {app.identifier} (pid={app.pid})")
        return self.device, self.session, self.pid

    def attach_package(self, package_name):
        """启动并附加到指定应用"""
        if not self.device:
            self.connect()
        pid = self.device.spawn([package_name])
        self.session = self.device.attach(pid)
        self.pid = pid
        print(f"[FridaHelper] 已启动进程: {package_name} (pid={pid})")
        return self.device, self.session, self.pid

    def detach(self):
        """安全地从目标进程分离"""
        if self.session:
            try:
                self.session.detach()
                print(f"[FridaHelper] 已从进程 {self.pid} 分离")
            except Exception as e:
                print(f"[FridaHelper] 分离失败: {e}")
        else:
            print("[FridaHelper] 没有活跃的 session")
        # 清理状态
        self.session = None
        self.pid = None
        self.device = None

    def resume(self, pid=None):
        """恢复进程执行 (适用于 spawn attach 的场景)"""
        if not self.device:
            print("[FridaHelper] 没有可用的设备")
            return
        target_pid = pid or self.pid
        if not target_pid:
            print("[FridaHelper] 没有可恢复的 pid")
            return
        try:
            self.device.resume(target_pid)
            print(f"[FridaHelper] 已恢复进程: pid={target_pid}")
        except Exception as e:
            print(f"[FridaHelper] 恢复进程失败: {e}")

    def find_module(self, module_name):
        """查找目标模块"""
        if not self.session:
            raise RuntimeError("[FridaHelper] 未附加到任何进程")

        js_code = f"""
            rpc.exports = {{
                findmodule: function() {{
                    var results = [];
                    Process.enumerateModules().forEach(function(m) {{
                        if (m.name.indexOf("{module_name}") >= 0) {{
                            results.push({{
                                name: m.name,
                                base: m.base,
                                size: m.size
                            }});
                        }}
                    }});
                    return results;
                }}
            }};
        """
        script = self.session.create_script(js_code)
        script.load()
        module_info = script.exports.findmodule()

        if not module_info:
            print(f"[FridaHelper] 未找到模块: {module_name}")
            return None
        else:
            print(f"[FridaHelper] 找到模块: {module_info[0]}")
            return module_info[0]

    def hook_dlopen_and_wait(self, module_name, on_load=None):
        """
        Hook dlopen / android_dlopen_ext，捕获目标模块加载完成事件
        """
        if not self.session:
            raise RuntimeError("[FridaHelper] 未附加到任何进程")

        js_code = f"""
            var target = "{module_name}";

            function notifyModule(name) {{
                if (name.indexOf(target) >= 0) {{
                    try {{
                        var m = Process.getModuleByName(name);
                        var result = {{
                            name: m.name,
                            base: m.base,
                            size: m.size
                        }};
                        send(result);
                    }} catch (e) {{
                        console.log("[-] getModuleByName failed: " + e);
                    }}
                }}
            }}

            function hookFunc(name) {{
                var addr = Module.findExportByName(null, name) ||
                           Module.findExportByName("libdl.so", name);
                if (!addr) {{
                    console.log("[-] Not found: " + name);
                    return;
                }}
                Interceptor.attach(addr, {{
                    onEnter: function(args) {{
                        this.path = args[0].readUtf8String();
                    }},
                    onLeave: function(retval) {{
                        if (this.path) {{
                            notifyModule(this.path);
                        }}
                    }}
                }});
                console.log("[+] Hooked " + name + " @ " + addr);
            }}

            hookFunc("dlopen");
            hookFunc("android_dlopen_ext");
        """

        script = self.session.create_script(js_code)

        def on_message(msg, data):
            if msg["type"] == "send":
                module_info = msg["payload"]
                print(f"[FridaHelper] 捕获到目标模块加载: {module_info}")
                if on_load:
                    on_load(module_info)
            elif msg["type"] == "error":
                print(f"[FridaHelper] 脚本错误: {msg['stack']}")

        script.on("message", on_message)
        script.load()
        return script


# =========================
# 自动化 Trace 工具
# =========================

class AutoTracer:
    """自动化 Trace 工具，结合 Frida 和 IDA"""

    def __init__(self, package_name, module_name, trace_start_off, trace_end_offs, skip_funcs=None, use_spawn=True, remote_addr=REMOTE_ADDR):
        self.package_name = package_name
        self.module_name = module_name
        self.trace_start_off = trace_start_off
        self.trace_end_offs = trace_end_offs
        self.skip_funcs = skip_funcs or []
        self.use_spawn = use_spawn

        self.frida = FridaHelper(remote_addr)
        self.trace_hook = None

        print(f"[AutoTracer] 初始化完成: package={package_name}, module={module_name}, use_spawn={use_spawn}")

    def _start_trace(self, module_info):
        """内部方法：启动 TraceHook"""
        module_info["base"] = int(module_info["base"], 16)

        # 转换 skip 函数地址
        skip_functions = [module_info["base"] + off for off in self.skip_funcs]

        # 计算 trace 起止点
        start_ea = module_info["base"] + self.trace_start_off
        end_eas = [module_info["base"] + off for off in self.trace_end_offs]

        # 设置断点
        set_breakpoint(start_ea)
        for ea in end_eas:
            set_breakpoint(ea)

        # 启动 trace hook
        self.trace_hook = TraceHook(start_ea, end_eas, module_info, skip_functions)
        self.trace_hook.hook()
        print(f"[AutoTracer] Trace 启动完成: start=0x{start_ea:x}, ends={[hex(ea) for ea in end_eas]}")

    def run(self):
        """运行自动化 Trace 流程"""
        clear_all_hooks()
        clear_all_breakpoints()
        print("[AutoTracer] 清理完成 (hooks & breakpoints)")

        if self.use_spawn:
            # spawn 模式
            self.frida.attach_package(self.package_name)

            def module_loaded_callback(module_info):
                print(f"[AutoTracer] 捕获到模块加载: {module_info}")
                self.frida.detach()
                self._start_trace(module_info)

            # Hook 模块加载
            self.frida.hook_dlopen_and_wait(self.module_name, module_loaded_callback)

            # 继续执行
            self.frida.resume()
            print("[AutoTracer] APP 已恢复运行")
        else:
            # attach 模式
            self.frida.attach_frontmost()
            module_info = self.frida.find_module(self.module_name)
            if not module_info:
                print(f"[AutoTracer] 未找到模块 {self.module_name}")
                return
            print(f"[AutoTracer] 已找到模块: {module_info}")
            self.frida.detach()

            self._start_trace(module_info)


# =========================
# 主逻辑入口
# =========================
if __name__ == "__main__":
    # 自动化 Trace
    tracer = AutoTracer(
        package_name=PACKAGE_NAME,
        module_name=MODULE_NAME,
        trace_start_off=TRACE_START_OFFSET,
        trace_end_offs=TRACE_END_OFFSETS,
        skip_funcs=SKIP_FUNCTIONS,
        use_spawn=USE_SPAWN
    )
    tracer.run()
```

## IDA 中使用自动化 Trace 脚本

先把 Frida 注入目标 app 进程（spawn 模式）

```
frida -H 127.0.0.1:1234 -f com.cyrus.example
```

或者 attach

```
frida -H 127.0.0.1:1234 -F
```

根据目标修改配置区：

```toml
# =========================
# 配置区 (根据需要修改)
# =========================

REMOTE_ADDR = "127.0.0.1:1234"  # frida-server 地址
PACKAGE_NAME = "com.cyrus.example"  # 目标应用包名
MODULE_NAME = "libnative-lib.so"  # 目标 so 名称
TRACE_START_OFFSET = 0x25C40  # trace 起始偏移
TRACE_END_OFFSETS = [0x25C80, 0x25C5C]  # trace 结束偏移，可多个
USE_SPAWN = False  # True=spawn 启动, False=附加前台应用

# 跳过的函数入口地址（相对偏移），例如：["0x1234", "0x5678"]
SKIP_FUNCTIONS = [
    # 0x10000,  # 示例：目标 so 中需要跳过的函数偏移
]
```

附加到目标APP

[![word/media/image19.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6a932604964d5f7d.png)](data:image/png;base64,inline-85870B)

Tracing options 设置

[![word/media/image20.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c7ae1c3b92dec442.png)](data:image/png;base64,inline-63382B)

Alt + F7 执行脚本文件

[![word/media/image21.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d88b50a0201be72d.png)](data:image/png;base64,inline-33430B)

开始地址断点触发后开始自动跟踪，Output 窗口日志输出如下：

```python
[FridaHelper] 初始化完成 (remote_addr=127.0.0.1:1234)
[AutoTracer] 初始化完成: package=com.cyrus.example, module=libnative-lib.so, use_spawn=False
[*] No hooks to clear.
[-] 已清除断点: 0x79232c0c40
[-] 已清除断点: 0x79232c0c5c
[-] 已清除断点: 0x79232c0c80
[*] 共清理 3 个断点
[AutoTracer] 清理完成 (hooks & breakpoints)
[FridaHelper] 已连接到远程设备: 127.0.0.1:1234
[FridaHelper] 前台应用: com.cyrus.example (pid=2702)
[FridaHelper] 找到模块: {'name': 'libnative-lib.so', 'base': '0x792329b000', 'size': 401408}
[AutoTracer] 已找到模块: {'name': 'libnative-lib.so', 'base': '0x792329b000', 'size': 401408}
[FridaHelper] 已从进程 2702 分离
[+] 设置断点: 0x79232c0c40
[+] 设置断点: 0x79232c0c80
[+] 设置断点: 0x79232c0c5c
[TraceHook] 初始化完成
[TraceHook] module_info       = {'name': 'libnative-lib.so', 'base': 520280977408, 'size': 401408}
[TraceHook] start_ea          = 0x79232c0c40
[TraceHook] end_eas           = ['0x79232c0c80', '0x79232c0c5c']
[TraceHook] skip_functions    = []
[TraceHook] trace_count       = 0
[TraceHook] trace_limit       = 300000
[TraceHook] outside_steps     = 0
[TraceHook] max_outside_steps = 1
[TraceHook] return_addr       = 0x0
[TraceHook] line_trace        = False
[AutoTracer] Trace 启动完成: start=0x79232c0c40, ends=['0x79232c0c80', '0x79232c0c5c']
[TraceHook] Breakpoint hit: ea=0x79232c0c40, tid=2702
[TraceHook] Hit start breakpoint → 开始指令追踪
[TraceHook] Instruction tracing enabled
[TraceHook] Breakpoint hit: ea=0x79232c0c5c, tid=2702
[TraceHook] dbg_suspend_process triggered
```

到达结束地址，自动结束 Trace，打开 Tracing 窗口可以看到 Trace 记录。

[![word/media/image22.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/261fb69738313822.png)](data:image/png;base64,inline-303222B)
