---
title: 【看雪】Frida spawn 小米设备 超时问题排查与解决
source: https://bbs.kanxue.com/thread-292217.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-29T14:09:48+08:00
trace_id: 20b542d9-efb8-479d-b3d3-d3f8ba64a495
content_hash: 6a451f134b2109435f75f9569b985eef23be2975e8cae0c37d33fe8aa69509c3
status: synced
tags:
  - 看雪
  - Android逆向
  - Frida
series: null
feed_source: 看雪·Android安全
ai_summary: 小米 Android 15 设备 Frida spawn 超时的根因是 USAP 预 fork 池绕过 zygote fork 信号，关闭 USAP 并重启 frida-server 即可解决。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ac75244-d011-8171-9328-cad101790f3a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 小米 Android 15 设备 Frida spawn 超时的根因是 USAP 预 fork 池绕过 zygote fork 信号，关闭 USAP 并重启 frida-server 即可解决。
> 
> - **故障现象：** `frida -U -f` 或 `device.spawn()` 报错 “unexpectedly timed out while waiting for signal”，严重时手机重启，logcat 显示 zygote64 收到 SIGABRT。
> - **排查关键：** attach 模式正常、SELinux 已 Permissive，排除系统安全模块；搜索相关 issue 并通过 `getprop | grep usap` 确认 `persist.sys.usap_pool_enabled` 等属性为 true，定位 USAP 为根因。
> - **冲突原理：** Android 10 引入的 USAP 使用预 fork 进程池，启动应用不再经过 zygote fork；Frida spawn 依赖监控 zygote fork 事件来注入，USAP 绕过该步骤导致 Frida 收不到信号而超时。
> - **解决方法：** 临时方案将 `persist.sys.usap_pool_enabled`、`dynamic_usap_enabled`、`device_config.runtime_native.usap_pool_enabled` 置为 false 并重启服务；永久方案将相同 setprop 命令写入 KernelSU 的 `/data/adb/service.d/` 或 Magisk 的 `/data/adb/post-fs-data.d/` 脚本，赋予执行权限后重启生效。
> - **验证与影响：** 重启后 `getprop | grep usap` 全部显示 false，执行 `frida -U -f <包名>` 成功；关闭 USAP 仅轻微增加 50-100ms 的应用启动耗时，日常使用几乎无感知。

\# Frida spawn 超时问题排查与解决

\*\*设备环境：\*\* 小米 2211133C (Android 15)

\*\*Root 方案：\*\* KernelSU

\---

\## 问题现象

启动 frida-server 后，使用 \`device.spawn()\` 或 \`frida -U -f <package>\` 时报错：

\`\`\`bash

Failed to spawn: unexpectedly timed out while waiting for signal from process with PID xxx

\`\`\`

或者 Python 版本：

\`\`\`python

frida.TimedOutError: unexpectedly timed out while waiting for signal from process with PID xxx

\`\`\`

更严重的情况：启动 frida-server 后手机直接重启，logcat 显示 zygote64 收到 SIGABRT 信号。

\---

\## 排查过程

\### 第一步：排除 SELinux 和 systemhelper

查看日志发现：

\- \`com.mobiletools.systemhelper\`（小米系统安全助手）在 app 启动时介入

\- zygote64 收到 SIGABRT 后触发系统重启

但实际测试发现：

\- SELinux 已经是 Permissive 模式

\- \*\*attach 模式（\`frida -U -p <PID>\`）完全正常\*\*

\- 只有 spawn 模式失败

这说明问题不在 SELinux 或 systemhelper，而是 spawn 机制本身的问题。

\### 第二步：发现 USAP 是关键

查阅 GitHub issues 发现大量讨论指向 \*\*USAP（Unspecialized App Process）\*\*：

\- \[frida/frida#2516\](https://github.com/frida/frida/issues/2516)

\- 多个 Android 10+ 设备报告此问题

验证设备状态：

\`\`\`bash

adb shell "getprop | grep usap"

\`\`\`

输出：

\`\`\`

\[dalvik.vm.usap_pool_enabled\]: \[false\]

\[persist.sys.dynamic_usap_enabled\]: \[true\]

\[persist.sys.usap_pool_enabled\]: \[true\]

\`\`\`

\*\*确认 USAP 已启用，这就是根因。\*\*

\---

\## 什么是 USAP？

USAP（Unspecialized App Process）是 Android 10 引入的进程预 fork 机制，用于加速 app 启动。

\### 传统模式（zygote fork）

\`\`\`

App 启动请求

↓

ActivityManager 发送请求到 zygote

↓

zygote fork 出新进程

↓

新进程加载 app 代码

\`\`\`

\### USAP 模式（预 fork 池）

\`\`\`

系统启动时预 fork 多个进程到池中

↓

App 启动请求

↓

ActivityManager 直接从池中取一个进程

↓

跳过 zygote fork 步骤，加速启动

\`\`\`

\### Frida spawn 的工作原理

\`\`\`

frida spawn 请求

↓

frida 监控 zygote fork 事件

↓

等待 zygote fork 出新进程

↓

自动 attach 到新进程

\`\`\`

\*\*冲突点：\*\* USAP 绕过了 zygote fork，Frida 收不到信号，超时。

\---

\## 解决方案

\### 临时方案（重启失效）

\`\`\`bash

\# 关闭 USAP

adb shell "su -c 'setprop persist.sys.usap_pool_enabled false'"

adb shell "su -c 'setprop persist.sys.dynamic_usap_enabled false'"

adb shell "su -c 'setprop persist.device_config.runtime_native.usap_pool_enabled false'"

\# 重启 frida-server

adb shell "su -c 'pkill -9 fs64'"

adb shell "su -c '/data/local/tmp/fs64 -D'"

\`\`\`

验证：

\`\`\`bash

adb shell "getprop | grep usap"

\# 应该全部显示 false

\`\`\`

\### 永久方案（推荐）

写入 KernelSU/Magisk 的开机启动脚本：

\#### KernelSU

\`\`\`bash

adb shell "su -c 'cat > /data/adb/service.d/disable_usap.sh'" << 'EOFX'

#!/system/bin/sh

\# 关闭 USAP 进程池，修复 Frida spawn 超时问题

setprop persist.sys.usap_pool_enabled false

setprop persist.sys.dynamic_usap_enabled false

setprop persist.device_config.runtime_native.usap_pool_enabled false

EOFX

adb shell "su -c 'chmod +x /data/adb/service.d/disable_usap.sh'"

\`\`\`

\#### Magisk

\`\`\`bash

adb shell "su -c 'cat > /data/adb/post-fs-data.d/disable_usap.sh'" << 'EOFX'

#!/system/bin/sh

setprop persist.sys.usap_pool_enabled false

setprop persist.sys.dynamic_usap_enabled false

setprop persist.device_config.runtime_native.usap_pool_enabled false

EOFX

adb shell "su -c 'chmod +x /data/adb/post-fs-data.d/disable_usap.sh'"

\`\`\`

\---

\## 验证修复

重启后检查：

\`\`\`bash

adb shell "getprop | grep usap"

\`\`\`

所有 USAP 相关属性应为 \`false\`。

测试 spawn：

\`\`\`python

import frida

device = frida.get_usb_device()

pid = device.spawn('com.example.app')

print(f'Spawn successful, PID={pid}')

\`\`\`

或使用命令行：

\`\`\`bash

frida -U -f com.example.app --no-pause

\`\`\`

\---

\## 常见问题

\### Q1: 关闭 USAP 会影响性能吗？

\*\*A:\*\* 轻微影响。USAP 的主要作用是加速 app 启动（跳过 zygote fork），关闭后启动速度可能慢 50-100ms，日常使用几乎无感知。对于逆向分析场景，这点性能损失完全可以接受。

\### Q2: 为什么 attach 模式不受影响？

\*\*A:\*\* attach 模式（\`frida -U -p <PID>\`）是直接注入已运行的进程，不涉及进程创建，所以不依赖 zygote fork 事件。

\### Q3: 还有其他可能导致 spawn 失败的原因吗？

\*\*A:\*\* 是的，包括但不限于：

\- \*\*SELinux Enforcing 模式\*\*：阻止 ptrace 注入

\- \*\*厂商安全模块\*\*：如小米 systemhelper、华为 TrustSpace

\- \*\*App 内置反调试\*\*：检测 frida 后主动退出

\- \*\*Root 权限配置\*\*：Magisk/KernelSU 的超级用户访问权限设置

\---

\## 完整排查清单

遇到 Frida spawn 超时时，按顺序检查：

1\. \*\*确认 USAP 状态\*\*

\`\`\`bash

adb shell "getprop | grep usap"

\`\`\`

2\. \*\*检查 SELinux\*\*

\`\`\`bash

adb shell "getenforce"

\# 应为 Permissive

\`\`\`

3\. \*\*测试 attach 模式\*\*

\`\`\`bash

adb shell am start -n <package>/<activity>

sleep 3

frida -U -p <PID>

\`\`\`

4\. \*\*查看 logcat 崩溃信息\*\*

\`\`\`bash

adb logcat -v time | grep -E "frida|panic|reboot|fatal|kill"

\`\`\`

5\. \*\*检查 Root 框架配置\*\*

\- Magisk：超级用户 → 超级用户访问权限

\- KernelSU：查看 \`/data/adb/ksu/.allowlist\`

\---

\## 参考资料

\- \[Frida GitHub Issue #2516\](https://github.com/frida/frida/issues/2516)

\- \[Android USAP 机制分析\](https://source.android.com/docs/core/runtime/usap)

\- \[Frida 官方文档 - Spawning\](https://frida.re/docs/spawning/)

\---

\*\*标签：\*\* Frida, Android逆向, USAP, spawn超时, KernelSU, Magisk
