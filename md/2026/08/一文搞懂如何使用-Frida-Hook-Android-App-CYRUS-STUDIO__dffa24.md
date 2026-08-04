---
title: 一文搞懂如何使用 Frida Hook Android App // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E4%B8%80%E6%96%87%E6%90%9E%E6%87%82%E5%A6%82%E4%BD%95%E4%BD%BF%E7%94%A8-frida-hook-android-app/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T13:56:46+08:00
trace_id: 1bdcb160-5823-42ad-ab66-b4a156a0174f
content_hash: 315480d71f4b1ddf12743fb36a11e6ffeb6e4b2721f3fb41777bcf05b945cd0f
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: Frida 通过注入 JavaScript 可 Hook Android 函数，核心在于配置匹配的 frida-server 版本，并能使用多种方式附加到进程以监控调用、绕过反调试。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3b275244-d011-8125-a97b-c33eb1a69f6e
ioc:
  cves: []
  cwes: []
  hashes:
    - 46b2b9f55dbd4291a67681f098292389
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Frida 通过注入 JavaScript 可 Hook Android 函数，核心在于配置匹配的 frida-server 版本，并能使用多种方式附加到进程以监控调用、绕过反调试。
> 
> - **环境准备：** 安装 `frida-tools`，根据设备 CPU 架构下载对应 `frida-server` 并推送至 `/data/local/tmp/fs`，赋予执行权限后启动；可通过 `-l 0.0.0.0:1234` 自定义端口并转发。
> - **启动方式：** `-F` 附加前台应用，`-f` 启动并附加（需 `%resume`），`-n` 按包名附加，`-p` 按进程 ID 附加。
> - **Hook 示例：** 可 Hook `dlopen` 和 `android_dlopen_ext` 打印加载的 SO 路径，或 Hook `HashMap.put` 输出键值；运行时支持直接调用 `Java.perform` 动态修改或 `%reload` 重新加载脚本。
> - **反调试绕过：** 当加载 `libmsaoaidsec.so` 导致 Frida 被杀时，直接删除该 SO 文件即可恢复 Hook 功能。
> - **版本匹配：** Android 10 需 frida-server 14.0.0，12 需 17.2.16；如 pip 安装报错找不到 `.egg` 文件，可从 pypi 下载并置于用户目录后重试。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## Frida

Frida 通过注入自定义 JavaScript 代码，可以 Hook 函数、修改参数、监控函数调用和拦截返回值，适用于逆向工程、调试和安全分析等场景。

使用 Frida 前需要先下载和安装包括：

-   Frida 是核心库，提供 API 和功能。
    
-   Frida-Tool 是命令行工具，通常与 Frida 版本相对应。
    
-   Frida-Server 是运行在 Android 设备上的服务器端组件，允许 Frida 客户端与设备进行通信。
    

## 环境准备

## 1\. 安装 frida 和 frida-tools

```bash
pip install frida-tools
```

## 2\. frida server

获取设备CPU架构

```
adb shell getprop ro.product.cpu.abi
```

下载与设备对应架构的 frida-server： [https://github.com/frida/frida/releases](https://github.com/frida/frida/releases)

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c7ee0811531ca52b.png)](data:image/png;base64,inline-86654B)

把 frida-server 推送到设备 /data/local/tmp 目录下

```
adb push "D:\Python\anti-app\frida-server\frida-server-14.0.0-android-arm64" /data/local/tmp/fs
```

启动 frida-server

```haskell
# 启用超级管理员
adb root

# 进入命令行
adb shell 

# 添加可执行权限
chmod +x /data/local/tmp/fs

# 启动frida-server
/data/local/tmp/fs
```

## 3\. 自定义 frida 端口

frida-server 默认端口为 27042，如果想自定义端口可以通过下面的命令实现

```
# 启动frida-server，并指定端口
/data/local/tmp/fs -l 0.0.0.0:1234

# 端口转发到本地
adb forward tcp:1234 tcp:1234
```

frida 通过 -H 自定义地址和端口号

```
frida -H 127.0.0.1:1234 -l script.js -n com.shizhuang.duapp
```

## 4\. 重启 frida server

用于某些情况下 frida server 不响应的时候。

获取 frida server 进程 id，进入 adb shell 指向下面命令

```
# 获取进程fs的pid
pidof fs

# 或者
# 获取1234端口进程的pid
lsof | grep 1234
```

强制停止进程

```
 kill -9 pid
```

## 5\. 自动化脚本

### frida-server-upload.bat

创建 frida-server-upload.bat，实现拖入 frida-server 直接推送到设备并添加执行权限。

```bash
@echo off
setlocal

REM 提示用户输入文件路径
set /p filepath=请输入frida-server文件路径（可直接拖入）: 

REM 检查输入是否为空
if "%filepath%"=="" (
    echo 你没有输入文件路径.
    pause
    exit /b
)

REM 检查文件是否存在
if not exist "%filepath%" (
    echo 文件不存在，请检查路径.
    pause
    exit /b
)


REM 把 frida-server 推送到设备 /data/local/tmp 目录下
adb push "%filepath%" /data/local/tmp/fs

REM 启用超级管理员
adb root

REM 添加可执行权限
adb shell chmod +x /data/local/tmp/fs

pause
```

### frida-server-start.bat

创建 frida-server-start.bat，实现一键启动 frida-server 并转发端口

```bash
@echo off

REM 启用超级管理员权限
adb root

setlocal

REM 获取 frida server 的 PID，如果已经启动则强制停止进程
for /f "delims=" %%i in ('adb shell pidof fs') do set PID=%%i

REM 判断 PID 是否为空
if defined PID (
    echo Found PID: %PID%
    adb shell kill -9 %PID%
) else (
    echo No fs process found.
)

endlocal

REM 启动frida-server
adb shell "/data/local/tmp/fs -l 0.0.0.0:1234 > /dev/null 2>&1 &"

REM 等待 2 秒
timeout /t 2

REM 查看frida-server进程是否启动成功
adb shell "lsof | grep 1234"

REM 转发到本地1234端口
adb forward tcp:1234 tcp:1234

pause
```

## Frida 相关命令

## 1\. frida-ps

打印设备上的进程

```
# 列出本地设备所有进程
frida-ps


# 列出USB设备上所有进程
frida-ps -U

# 列出远程设备上的进程
frida-ps -H 127.0.0.1:1234
```

## 2\. frida-ls-devices

列出可用的设备

```
frida-ls-devices 
```

## 3\. frida

启动 frida 并执行脚本

```powershell
# 连接到 USB 设备
# -U 表示连接到 USB 设备
# -f 指定应用包名，Frida 会启动该应用
# -l 脚本路径
frida -U -l script.js -f com.shizhuang.duapp 

# 连接到远程设备
# -H：远程设备地址和端口
# -l：脚本路径
# -n：指定应用包名
frida -H 127.0.0.1:1234 -l script.js -n com.shizhuang.duapp
```

## Frida 的几种启动方式

## 1\. 附加到当前设备的前台应用

\-F 表示附加到前台应用程序

```
frida -H 127.0.0.1:1234 -F -l script.js
```

此命令会自动找到当前设备上的前台应用并附加到它，无需手动指定应用程序包名。

## 2\. 启动应用并附加到当前启动进程

\-f 指定要启动的应用包名

```
frida -H 127.0.0.1:1234 -l script.js -f com.shizhuang.duapp
```

此命令会自动启动应用并附加到它，启动后应用默认处于暂停状态，执行 %resume 命令恢复执行。

## 3\. 通过包名附加到正在运行的应用

\-n 指定要附加的应用包名

```
frida -H 127.0.0.1:1234 -l script.js -n com.shizhuang.duapp
```

## 4\. 通过进程 id 附加到正在运行的应用

1.  通过 frida-ps 命令查看当前设备所有进程信息，并通过 findstr 过滤出指定 app 的进程信息

```
frida-ps  -H 127.0.0.1:1234 | findstr duapp

32347  com.shizhuang.duapp:pushservice
```

2.  通过 -p 参数指定进程id，附加到目标进程

```
frida -H 127.0.0.1:1234 -p 32347 
```

或者，附加到目标进程，并执行指定脚本

```
frida -H 127.0.0.1:1234  -l script.js  -p 32347
```

3.  调用 Frida JS 调试当前进程

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/42216074174b97ea.png)](data:image/png;base64,inline-141342B)

## 示例

## 1\. Hook dlopen & android_dlopen_ext

创建 hook_so_load.js，调用 Frida JS 库，Hook dlopen 和 android_dlopen_ext 函数并打印加载的 so 文件路径。

Frida JS库官方文档： [https://frida.re/docs/javascript-api](https://frida.re/docs/javascript-api/)

```javascript
function hook_so_load(package_name) {
    // Hook dlopen 函数
    const dlopenAddr = Module.findExportByName(null, "dlopen");
    const dlopen = new NativeFunction(dlopenAddr, 'pointer', ['pointer', 'int']);
    Interceptor.attach(dlopen, {
        onEnter(args) {
            // 获取传递给 dlopen 的参数（SO 文件路径）
            const soPath = Memory.readUtf8String(args[0]);
            // 如果是目标app SO 文件，则打印路径
            if (soPath.includes(package_name)) {
                // 打印信息
                console.log("dlopen() - Loaded SO file:", soPath);
            }
            // console.log("dlopen() - Loaded SO file:", soPath);
        }, onLeave(retval) {
        }
    });

    // Hook android_dlopen_ext 函数
    const android_dlopen_extAddr = Module.findExportByName(null, "android_dlopen_ext");
    const android_dlopen_ext = new NativeFunction(android_dlopen_extAddr, 'pointer', ['pointer', 'int', 'pointer']);
    Interceptor.attach(android_dlopen_ext, {
        onEnter(args) {
            // 获取传递给 android_dlopen_ext 的参数（SO 文件路径）
            const soPath = Memory.readUtf8String(args[0]);
            // 如果是目标app SO 文件，则打印路径
            if (soPath.includes(package_name)) {
                // 打印信息
                console.log("android_dlopen_ext() - Loaded SO file:", soPath);
            }
            // console.log("android_dlopen_ext() - Loaded SO file:", soPath);
        }, onLeave(retval) {
        }
    });
}


hook_so_load("com.shizhuang.duapp")
```

运行脚本

```
frida -H 127.0.0.1:1234 -l hook_so_load.js -f com.shizhuang.duapp
```

日志输出如下

```bash

     ____
    / _  |   Frida 14.2.18 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://www.frida.re/docs/home/
Spawned `com.shizhuang.duapp`. Use %resume to let the main thread start executing!
[Remote::com.shizhuang.duapp]-> %resume
[Remote::com.shizhuang.duapp]-> android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/oat/arm64/base.odex
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libmmkv.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libxcrash.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libdulog.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libduhook.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libheif.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libdewuffmpeg.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libduplayer.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libstatic-webp.so
android_dlopen_ext() - Loaded SO file: /data/user/0/com.shizhuang.duapp/files/soloader_x64/libxyvodsdk.so
android_dlopen_ext() - Loaded SO file: /data/user/0/com.shizhuang.duapp/files/soloader_x64/libijmdetect_drisk.so
android_dlopen_ext() - Loaded SO file: /data/user/0/com.shizhuang.duapp/files/soloader_x64/libdu_security.so
```

## 2\. 运行中调试

在 Frida 运行中可以调用 Frida JS 库，可以方便地 Hook 方法、修改数据、跟踪执行流等

比如，调用 console.log 打印日志

```
[Remote::com.shizhuang.duapp]-> console.log("hello")
hello
```

获取当前 app 进程id

```
[Remote::com.shizhuang.duapp]-> Process.id
7098
```

hook java.util.HashMap 的 put 方法并打印 key 和 value

```javascript
[Remote::com.shizhuang.duapp]-> Java.perform(function() {
    // 获取 HashMap 类引用
    var HashMap = Java.use('java.util.HashMap');

    // Hook HashMap.put() 方法
    HashMap.put.implementation = function (key, value) {
        // 打印 HashMap 的 key 和 value
        console.log("HashMap.put() called:[", key.toString(), "][", value.toString(), "]");
        // 调用原始的 put() 方法
        return this.put(key, value);
    };
});
```

重新加载脚本文件

```
[Remote::com.shizhuang.duapp]-> %reload
```

退出 Frida

```
[Remote::com.shizhuang.duapp]-> exit
```

## 3\. Hook HashMap

创建 hook_hashmap.js，Hook java 标准库中的 HashMap 并打印 key 和 value。

```javascript
function hook_hashmap() {
    // 获取 HashMap 类引用
    var HashMap = Java.use('java.util.HashMap');

    // Hook HashMap.put() 方法
    HashMap.put.implementation = function (key, value) {
        // 打印 HashMap 的 key 和 value
        console.log("HashMap.put() called:[", key.toString(), "][", value.toString(), "]");
        // 调用原始的 put() 方法
        return this.put(key, value);
    };
}


Java.perform(function () {
    hook_hashmap()
})
```

运行脚本

```
frida -H 127.0.0.1:1234 -l hook_hashmap.js -f com.shizhuang.duapp
```

## 4\. 枚举 Java 对象

Java.choose 函数是 Frida 提供的一个用于在 Android 应用程序中枚举 Java 对象的便捷函数。它允许你查找和选择特定类型的 Java 对象（如 Activity、Service、自定义类实例等）。

choose 方法会遍历 JVM 中的所有 Java 对象，并将符合条件的对象传递给回调函数。

```javascript
Java.choose(className, {
    onMatch: function(instance) { 
        // 当找到符合条件的实例时调用
    },
    onComplete: function() { 
        // 遍历完成时调用
    }
});
```

## 绕过 Frida 反调试

启动 frida，但 app 启动不久 frida 就直接被杀掉了。

通过 hook dlopen 函数打印加载的 so 文件，发现当加载到 libmsaoaidsec.so 时，frida 就停止了，日志信息如下

```bash
Spawned `com.shizhuang.duapp`. Resuming main thread!                
[Remote::com.shizhuang.duapp ]-> android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/oat/arm64/base.odex
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libGameVMP.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libmmkv.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libxcrash.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libdulog.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libduhook.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libszstone.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libdewuhelper.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libdusanwa.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libc++_shared.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libdu_mediacache.so
android_dlopen_ext() - Loaded SO file: /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libmsaoaidsec.so
Process terminated
```

直接删除 libmsaoaidsec.so 试试看

```
adb shell rm /data/app/com.shizhuang.duapp-fTxemmnM8l6298xbBELksQ==/lib/arm64/libmsaoaidsec.so
```

重新启动 frida，能正常运行。

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/530c3e93b7b844c2.png)](data:image/png;base64,inline-160318B)

## Failed to spawn: timeout was reached

执行 frida 命令时，提示 Failed to spawn: timeout was reached。

这是因为 frida 版本与 android 版本不匹配导致的。

根据自己的 android 版本，降级或升级 frida、frida-tool、frida-server的版本即可，比如 android10 / 12 实测可用的版本如下：

| Frida 版本 | Frida-Tool 版本 | Frida-Server 版本 | Android 版本 |
| --- | --- | --- | --- |
| 14.2.18 | 9.2.2 | frida-server-14.0.0-android-arm64 | Android 10 |
| 17.2.16 | 14.0.0 | frida-server-17.2.16-android-arm64 | Android 12 |

卸载当前的 frida 和 frida-tools

```bash
pip uninstall -y frida frida-tools
```

创建 python3.8 环境

```
conda create -n anti-app python=3.8.20
```

Python 环境管理参考这篇文章： [Miniconda 全攻略：优雅管理你的 Python 环境](https://cyrus-studio.github.io/blog/posts/miniconda-%E5%85%A8%E6%94%BB%E7%95%A5%E4%BC%98%E9%9B%85%E7%AE%A1%E7%90%86%E4%BD%A0%E7%9A%84-python-%E7%8E%AF%E5%A2%83/)

重新安装对应版本的 frida 和 frida-tools。

```bash
# 安装 frida 和 frida-tools
pip install frida==14.2.18 frida-tools==9.2.2
```

在安装 frida 时候提示找不到 frida-14.2.18-py3.8-win-amd64.egg

```bash
pip install frida==14.2.18

Collecting frida==14.2.18
  Using cached frida-14.2.18.tar.gz (7.7 kB)
  Preparing metadata (setup.py) ... done
Requirement already satisfied: setuptools in d:\app\miniconda3\envs\anti-app\lib\site-packages (from frida==14.2.18) (75.1.0)
Building wheels for collected packages: frida
  Building wheel for frida (setup.py) ... error
  error: subprocess-exited-with-error

  × python setup.py bdist_wheel did not run successfully.
  │ exit code: 1
  ╰─> [71 lines of output]
      running bdist_wheel
      running build
      running build_py
      creating build\lib.win-amd64-cpython-38\frida
      copying frida\core.py -> build\lib.win-amd64-cpython-38\frida
      copying frida\__init__.py -> build\lib.win-amd64-cpython-38\frida
      running build_ext
      looking for prebuilt extension in home directory, i.e. C:\Users\cyrus/frida-14.2.18-py3.8-win-amd64.egg
      prebuilt extension not found in home directory, will try downloading it
      querying pypi for available prebuilds
      Traceback (most recent call last):
        File "C:\Users\cyrus\AppData\Local\Temp\pip-install-udcju8m2\frida_46b2b9f55dbd4291a67681f098292389\setup.py", line 101, in build_extension     
          with open(egg_path, "rb") as cache:
      FileNotFoundError: [Errno 2] No such file or directory: 'C:\\Users\\cyrus/frida-14.2.18-py3.8-win-amd64.egg'

 
  note: This error originates from a subprocess, and is likely not a problem with pip.
  ERROR: Failed building wheel for frida
  Running setup.py clean for frida
Failed to build frida
ERROR: ERROR: Failed to build installable wheels for some pyproject.toml based projects (frida)
```

直接从 [https://pypi.org/simple/frida/](https://pypi.org/simple/frida/) 上下载 frida-14.2.18-py3.8-win-amd64.egg

 [![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/98fa1027870bac12.png)](data:image/png;base64,inline-153198B)下载完成后放到用户目录下，并重新执行 pip install frida==14.2.18 即可。

下载对应版本的 frida-server 并更新到设备上： [https://github.com/frida/frida/releases?page=14](https://github.com/frida/frida/releases?page=14)

## 把日志输出到文件

通过 -o 设置项把日志输出到文件（exit frida 时候保存日志到文件）

```
frida -H 127.0.0.1:1234 -F -l  script.js -o log.txt
```

或者通过 tee 命令同时将标准输出内容打印到终端，并写入文件。（实时保存日志到文件）

```
frida -H 127.0.0.1:1234 -F -l  script.js | tee log.txt
```

## 打印寄存器

通过 JSON.stringify(this.context) 获取所有寄存器的值。

registers.js

```javascript
function hook_native_func(targetAddress) {
    Interceptor.attach(targetAddress, {
        onEnter: function (args) {
            this.log = 'Entering native function at: ' + targetAddress + '\n'
            this.log += JSON.stringify(this.context) + '\n'
        },

        onLeave: function (retval) {
            this.log += 'Leaving native function，retval: ' + retval + '\n'
            console.log(this.log)
        }
    });
}


setImmediate(function () {
    Java.perform(function () {
        var baseAddress = Module.findBaseAddress("libGameVMP.so")
        hook_native_func(baseAddress.add(0xdfa8))
    });
})
```

执行脚本：

```
frida -H 127.0.0.1:1234 -F -l registers.js
```

效果如下：

```bash
Entering native function at: 0x7802451fa8
{"pc":"0x7802451fa8","sp":"0x775186b0d0","x0":"0x773f5b7fc0","x1":"0x775186b0e4","x2":"0x775186b0e8","x3":"0x709f8770","x4":"0x14e14fb0","x5":"0xf07
","x6":"0x14e14fc0","x7":"0x10","x8":"0xc1a1cd6540f6681f","x9":"0xc1a1cd6540f6681f","x10":"0x430000","x11":"0x780d9e1000","x12":"0x4f3b28","x13":"0x
0","x14":"0x9f5a5a70","x15":"0xe4dc","x16":"0x7805b01000","x17":"0x77a3ec1330","x18":"0x1","x19":"0x770c876800","x20":"0x7802451fa8","x21":"0x13f336
b0","x22":"0x14e14f68","x23":"0x14e14f98","x24":"0x14e14fb0","x25":"0x9f2de680","x26":"0x1396ba90","x27":"0x14e14ea8","x28":"0x14e14f68","fp":"0x13f336b0","lr":"0x7797f4a4a0"}
Leaving native function，retval: 0x41
```
