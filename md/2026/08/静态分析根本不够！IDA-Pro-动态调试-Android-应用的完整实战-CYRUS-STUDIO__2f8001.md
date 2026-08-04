---
title: 静态分析根本不够！IDA Pro 动态调试 Android 应用的完整实战 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E9%9D%99%E6%80%81%E5%88%86%E6%9E%90%E6%A0%B9%E6%9C%AC%E4%B8%8D%E5%A4%9Fida-pro-%E5%8A%A8%E6%80%81%E8%B0%83%E8%AF%95-android-%E5%BA%94%E7%94%A8%E7%9A%84%E5%AE%8C%E6%95%B4%E5%AE%9E%E6%88%98/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T13:57:41+08:00
trace_id: 1cee3bc9-ad57-4bc4-8e38-0e88fa368824
content_hash: c9f6dcbc50686ca87580a591b1028244dc0007a7ed833a98a0dee9e82cab8efb
status: synced
tags:
  - Android逆向
  - 安全工具
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: "TL;DR: 动态调试是突破Android逆向分析中静态限制的关键手段，本文完整实践了从环境搭建、android_server部署、IDA连接、断点控制到自动化脚本的全流程。"
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3b275244-d011-813b-9562-d3b8134fbc19
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: 动态调试是突破Android逆向分析中静态限制的关键手段，本文完整实践了从环境搭建、android_server部署、IDA连接、断点控制到自动化脚本的全流程。
> 
> - **动态调试价值：** 面对混淆、加壳与动态加载，静态分析难以还原完整逻辑；借助动态调试可实时跟踪函数调用、监控寄存器与内存变化、分析加解密输入输出，并定位与绕过反调试。
> - **android_server部署三步骤：** 根据设备CPU架构从`IDA安装目录/dbgsrv`选择正确的`android_server`二进制，推送至`/data/local/tmp`并赋予执行权限，以`-p`指定端口启动，再通过`adb forward tcp:本地端口 tcp:设备端口`建立转发。
> - **启动前附加进程：** 使用`adb shell am start -D -n 包名/启动Activity`以调试模式挂起目标应用，通过DDMS获取进程，IDA附加后利用`jdb -connect com.sun.jdi.SocketAttach:hostname=127.0.0.1,port=8700`恢复执行，适用于启动前完成Hook等前置操作。
> - **Python脚本辅助调试：** 利用IDAPython遍历段信息获取已加载的`.so`文件列表（基址与大小），或Hook `dlopen`函数在断点触发时打印加载的库名，提高分析效率。
> - **端口占用与自动化：** 通过`lsof`定位占用端口的android_server进程PID并`kill -9`强制停止；编写批处理脚本自动处理清理、启动与端口转发，实现一键就绪。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 一、前言

在进行 Android 应用逆向分析时，很多时候仅靠静态分析（例如反编译 Java 代码或反汇编 so 库）是远远不够的。开发者常常会使用混淆、加壳、动态加载等技术，使得代码逻辑在静态视角下难以完整还原。此时，动态调试就显得尤为重要。

通过动态调试，我们可以在应用运行过程中实时观察其行为，例如：

-   精确跟踪函数调用过程
    
-   监控寄存器与内存的变化
    
-   分析加密/解密算法的输入与输出
    
-   定位并绕过反调试逻辑
    

**IDA Pro** 作为最常用的逆向分析工具之一，不仅提供强大的静态反编译能力，还支持配合 android_server 在 Android 设备上实现远程动态调试。这样，我们既能利用 IDA 的反编译界面理解代码结构，又能在实际执行过程中验证推测的逻辑，从而大大提升分析效率。

## 二、调试环境准备

必备工具：IDA Pro、adb、android_server

测试设备要求（已 root 的 Android 手机 / 模拟器）

手机 root 和 开启全局调试 参考：

-   [小米刷机全攻略：解锁BL、刷机、Root 一步到位](https://cyrus-studio.github.io/blog/posts/%E5%B0%8F%E7%B1%B3%E5%88%B7%E6%9C%BA%E5%85%A8%E6%94%BB%E7%95%A5%E8%A7%A3%E9%94%81bl%E5%88%B7%E6%9C%BAroot-%E4%B8%80%E6%AD%A5%E5%88%B0%E4%BD%8D/)
    
-   [Magisk 修改 ro.debuggable 开启 Android 系统全局调试模式](https://cyrus-studio.github.io/blog/posts/magisk-%E4%BF%AE%E6%94%B9-ro.debuggable-%E5%BC%80%E5%90%AF-android-%E7%B3%BB%E7%BB%9F%E5%85%A8%E5%B1%80%E8%B0%83%E8%AF%95%E6%A8%A1%E5%BC%8F/)
    

## 三、android_server 简介

android_server 是 **IDA Pro** 在 Android 设备上运行的远程调试服务端程序。

通过在设备上启动 android_server，IDA Pro 可以与 Android 应用建立调试会话，实现如下功能：

-   设置与管理断点
    
-   查看与修改内存
    
-   检查与操作寄存器
    

IDA Pro 与 android_server 之间的通信通常依赖 **ADB（Android Debug Bridge）**。IDA Pro 将调试命令通过 ADB 转发至 android_server，后者在设备本地执行相应操作，并将结果回传给 IDA Pro，从而实现完整的远程调试流程。

## 四、部署 android_server

根据设备的 CPU 架构从 IDA 安装目录/dbgsrv 下获取 android_server 二进制文件

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e9d818052a3c6572.png)](data:image/png;base64,inline-91894B)

把 android_server push 到设备 /data/local/tmp 路径下

```
adb push "D:\App\IDA_Pro\IDA_Pro_7.7\dbgsrv\android_server64" /data/local/tmp/as
```

进入 adb shell 启动 androd server

```haskell
# 获取 root 权限
su
# 给 android server 增加执行权限
chmod +x /data/local/tmp/as

# 通过指定端口启动 android_server，假设你要使用端口 12345
/data/local/tmp/as -p 12345
```

将 adb 12345 端口转发到本地 12345 端口

```
adb forward tcp:12345 tcp:12345
```

## 五、IDA Pro 连接调试

## 附加到正在运行的进程

在调试器类型中选择 Remote ARM Linux/Android debugger

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0e0ff48096a35ca4.png)](data:image/png;base64,inline-40562B)

调试设置 Host=127.0.0.1，Port=12345

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/887916996a2cdc01.png)](data:image/png;base64,inline-24534B)

选择你要动态调试的 app 进程，点击 Search（Alt + T） 可以通过搜索关键字查找进程

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1950ab35251eb3fd.png)](data:image/png;base64,inline-242658B)

## 启动前附加进程

首先，通过 [Androird Killer](https://github.com/CherylVolta/android-killer.git) 反编译 apk ，在 AndroidManifest.xml 中搜索 android.intent.action.MAIN 找到 app 的启动入口

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4a2fc6eab3d4afb1.png)](data:image/png;base64,inline-477930B)

或者进入 adb shell 通过下面的命令查找最近启动的 Activity

```bash
dumpsys activity activities | grep "Hist" | head -n 5

* Hist #0: ActivityRecord{1088151 u0 com.cyrus.example/.MainActivity t66}
  keysPaused=false inHistory=true visible=true sleeping=false idle=true mStartingWindowState=STARTING_WINDOW_SHOWN
* Hist #0: ActivityRecord{3afa4ee u0 com.android.launcher3/.lineage.LineageLauncher t56}
  keysPaused=false inHistory=true visible=false sleeping=false idle=true mStartingWindowState=STARTING_WINDOW_NOT_SHOWN
* Hist #0: ActivityRecord{f256169 u0 com.shizhuang.duapp/.modules.home.ui.HomeActivity t58}
```

以调试模式启动 app

```
adb shell am start -D -n com.shizhuang.duapp/com.shizhuang.duapp.modules.home.ui.SplashActivity
```

启动DDMS（sdk\\tools\\monitor.bat）

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fae44582338e5da4.png)](data:image/png;base64,inline-47046B)

解决jdk版本过高导致的DDMS启动失败问题：

-   [下载 jdk8 的 zip 文件](https://www.openlogic.com/openjdk-downloads?field_java_parent_version_target_id=416&field_operating_system_target_id=All&field_architecture_target_id=All&field_java_package_target_id=All)
    
-   解压 jdk 到本地
    
-   在 monitor.bat 前面加上下面的代码（强制使用jdk8）
    

```python
@echo off
REM 设置 JDK 路径
set JAVA_HOME=D:\App\jdk-8

REM 更新 PATH 变量
set PATH=%JAVA_HOME%\bin;%PATH%

REM 验证 JDK 设置
echo JAVA_HOME is set to %JAVA_HOME%
java -version
```

IDA 附加到你要动态调试的 app 进程

 [![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d83ad076f08af623.png)](data:image/png;base64,inline-26526B)现在你就可以做一下在 APP 启动前需要完成的一些操作了，比如在 APP 启动前 Hook 某个函数。

创建一个 jdb_connect.bat，使用 jdb 命令恢复程序执行

```python
@echo off
REM 设置使用 JDK8
set JAVA_HOME=D:\App\jdk-8

REM 更新 PATH 变量
set PATH=%JAVA_HOME%\bin;%PATH%

REM 验证 JDK 设置
echo JAVA_HOME is set to %JAVA_HOME%
java -version

REM 使用 jdb 命令恢复程序执行
jdb -connect com.sun.jdi.SocketAttach:hostname=127.0.0.1,port=8700
```

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f705486206dfb561.png)](data:image/png;base64,inline-71778B)

## 六、使用 Python 代码调试进程

下面脚本代码是基于IDA Pro 7.7.220118，不同版本之间可能会有差异。

IDA6 到 IDA7 api 变化对比： [https://hex-rays.com/products/ida/support/ida74_idapython_no_bc695_porting_guide.shtml](https://hex-rays.com/products/ida/support/ida74_idapython_no_bc695_porting_guide.shtml)

## 1\. 调用函数来列出加载的.so 文件

File -> Script command，然后运行下面的 Python 脚本

```python
import idaapi

def list_loaded_so_files():
    # 获取所有段（模块）信息
    seg_qty = idaapi.get_segm_qty()
    
    if seg_qty == 0:
        print("No segments loaded.")
        return
    
    print("Loaded .so files:")
    
    # 遍历所有段，获取段信息
    for i in range(seg_qty):
        seg = idaapi.getnseg(i)
        if seg:
            seg_name = idaapi.get_segm_name(seg)
            # 如果段名以 .so 结尾，则打印模块信息
            if seg_name.endswith(".so"):
                seg_start = seg.start_ea
                seg_end = seg.end_ea
                seg_size = seg_end - seg_start
                print(f"Name: {seg_name}, Base: {hex(seg_start)}, Size: {seg_size}")

# 调用函数来列出加载的 .so 文件
list_loaded_so_files()
```

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5124d229389eddb2.png)](data:image/png;base64,inline-60578B)

## 2\. hook dlopen函数

Hook dlopen 函数并打印出加载的库

```python
import idaapi
import idc

class DlopenHook(idaapi.IDB_Hooks):
    def __init__(self):
        idaapi.IDB_Hooks.__init__(self)

    def dbg_bpt(self, tid, ea):
        # 当断点被触发时，打印库信息
        print(f"Breakpoint hit at: {hex(ea)}")
        # 获取 dlopen 的参数
        esp = idc.get_reg_value('esp')
        # 假设库名称在栈上参数位置 + 4
        lib_name_addr = esp + 4
        lib_name = idc.get_strlit_contents(lib_name_addr)
        if lib_name:
            print(f"dlopen called with: {lib_name.decode('utf-8')}")
        else:
            print("dlopen called with unknown library")
        return 0

def main():
    # 获取 dlopen 函数的地址
    dlopen_addr = idc.get_name_ea_simple("dlopen")
    
    if dlopen_addr == idc.BADADDR:
        print("dlopen function not found.")
        return
    
    # 设置断点
    idaapi.add_bpt(dlopen_addr)
    print(f"Breakpoint set at dlopen: {hex(dlopen_addr)}")

    # 实例化钩子并添加到 IDA Pro
    hook = DlopenHook()
    hook.hook()

# 运行主函数
main()
```

## 七、断点调试

在调试过程中，你可以使用以下命令来控制程序的执行：

-   Step Into (F7)：进入当前行调用的函数内部。
    
-   Step Over (F8)：跳过当前行，执行到下一行。
    
-   Run (F9)：继续运行程序，直到下一个断点或程序结束。
    

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2aa7f60e9272ff4d.png)](data:image/png;base64,inline-63054B)

## 八、解决端口占用问题

如果在启动 android server 时提示端口占用

```
/data/local/tmp/as -p 12345

IDA Android 64-bit remote debug server(ST) v7.7.27. Hex-Rays (c) 2004-2022
0.0.0.0:12345: bind: Address already in use
```

列出占用端口的进程

```
lsof | grep 12345
 
as        12679       root    3u     IPv4                          0t0     246861 TCP :12345->:0 (LISTEN)
as        12679       root    4u     IPv4                          0t0     523893 TCP :12345->:43865 (CLOSE_WAIT)
```

强制停止占用端口的进程

```
kill -9 12679
```

现在，重新启动 android server 就可以了

## 九、自动化脚本

创建 android-server-start.bat，实现一键启动 android server 并转发端口

```bash
@echo off

REM 启用超级管理员权限
adb root

setlocal

REM 获取 frida server 的 PID，如果已经启动则强制停止进程
for /f "delims=" %%i in ('adb shell pidof as') do set PID=%%i

REM 判断 PID 是否为空
if defined PID (
    echo Found PID: %PID%
    adb shell kill -9 %PID%
) else (
    echo No as process found.
)

endlocal

REM 启动 android server
adb shell "/data/local/tmp/as -p 12345 > /dev/null 2>&1 &"

REM 等待 2 秒
timeout /t 2

REM 查看 android server 进程是否启动成功
adb shell "lsof | grep 12345"

REM 转发到本地 12345 端口
adb forward tcp:12345 tcp:12345

pause
```

运行效果如下：

[![word/media/image11.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/970dd10072f6fb03.png)](data:image/png;base64,inline-33634B)
