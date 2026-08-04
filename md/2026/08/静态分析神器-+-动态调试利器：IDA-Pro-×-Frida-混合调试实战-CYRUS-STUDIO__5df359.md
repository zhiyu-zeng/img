---
title: 静态分析神器 + 动态调试利器：IDA Pro × Frida 混合调试实战 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E9%9D%99%E6%80%81%E5%88%86%E6%9E%90%E7%A5%9E%E5%99%A8-+-%E5%8A%A8%E6%80%81%E8%B0%83%E8%AF%95%E5%88%A9%E5%99%A8ida-pro--frida-%E6%B7%B7%E5%90%88%E8%B0%83%E8%AF%95%E5%AE%9E%E6%88%98/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T13:59:33+08:00
trace_id: 7cb8783e-8d9f-4d93-8cca-9056d071dd42
content_hash: dc05aabeb9cb19f2a18a4d2a8b4a15e9a78961fd4d63179c9c2ee584e3efff0e
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: |-
  在IDA Pro中集成Frida实现Android动态调试可通过手动安装预编译包解决依赖，并编写脚本自动获取目标so模块的基址信息。
  - **Python版本确认：** IDA Pro 7.7内置Python 3.8.10，python.exe位于安装目录下的 `python38` 文件夹。
  - **安装问题：** 直接pip安装frida 14.2.18会因PyPI停用XMLRPC API而失败，需下载官方预编译了.egg或.whl格式的库文件。
  - **手动安装方法：** 将解压后的frida文件夹和frida_tools文件夹复制到IDA的`site-packages`目录，便能在IDA Python中成功导入使用。
  - **辅助脚本功能：** 通过配置包名、模块名和是否spawn，可附加前台应用或spawn启动并用Hook dlopen捕获目标so加载事件，最终输出模块基址、大小和名称。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3b275244-d011-819d-b359-ca096383f4c7
ioc:
  cves: []
  cwes: []
  hashes:
    - d2b25c48b01748e6bfb04c1245fc6a82
    - ffca4ce9b4cb815038075288489d59297fce89452c5357491ad7e5d9426b8a9c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 在IDA Pro中集成Frida实现Android动态调试可通过手动安装预编译包解决依赖，并编写脚本自动获取目标so模块的基址信息。
> - **Python版本确认：** IDA Pro 7.7内置Python 3.8.10，python.exe位于安装目录下的 `python38` 文件夹。
> - **安装问题：** 直接pip安装frida 14.2.18会因PyPI停用XMLRPC API而失败，需下载官方预编译了.egg或.whl格式的库文件。
> - **手动安装方法：** 将解压后的frida文件夹和frida_tools文件夹复制到IDA的`site-packages`目录，便能在IDA Python中成功导入使用。
> - **辅助脚本功能：** 通过配置包名、模块名和是否spawn，可附加前台应用或spawn启动并用Hook dlopen捕获目标so加载事件，最终输出模块基址、大小和名称。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

IDA Pro 作为静态分析神器，能快速反编译 so 库，展示清晰的函数结构和反汇编代码，但它对运行时行为却一无所知；而 Frida 能在设备上动态 Hook 任意函数，实时观察寄存器、参数、返回值。

把 Frida 直接集成进 IDA Pro！这样我们就能在 **IDA 里调用 Frida API**，实时获取目标 App 中 so 的基址、动态执行状态，甚至一键启动 Trace。

## 1\. 确认 IDA Pro 内置的 Python 版本

IDA Pro 自带 Python 解释器，不一定跟你系统 Python 一致。

在 **IDA Python 控制台** （快捷键 Shift+F2）里输入：

```
import sys
print(sys.version)
print(sys.executable)
```

输出类似：

```
3.8.10 (tags/v3.8.10:3d8993a, May  3 2021, 11:48:03) [MSC v.1928 64 bit (AMD64)]
D:\App\IDA_Pro\IDA_Pro_7.7\ida64.exe
```

这里有两个关键信息：

1.  IDA Pro 7.7 自带的是 Python 3.8.10
    
2.  ida64.exe 所在路径
    

## 2\. IDA Python 安装第三方库

这里 IDA 的 Python 是 3.8.10，python.exe 在 IDA 安装目录的 python38 目录下：

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/51a3db76dc32bb0a.png)](data:image/png;base64,inline-150534B)

可以这样：

```
D:\App\IDA_Pro\IDA_Pro_7.7\python38\python.exe -m pip install frida frida-tools
```

或者指定安装版本：

```
D:\App\IDA_Pro\IDA_Pro_7.7\python38\python.exe -m pip install frida==14.2.18 frida-tools==9.2.2
```

这样库会被安装到 IDA 自带 Python 的 site-packages 目录中。

## 3\. 安装 frida 报错

执行命令后日志输出如下：

```rust
(base) PS D:\App\android\sdk\platform-tools> D:\App\IDA_Pro\IDA_Pro_7.7\python38\python.exe -m pip install frida==14.2.18 frida-tools==9.2.2
Collecting frida==14.2.18
  Using cached frida-14.2.18.tar.gz (7.7 kB)
  Preparing metadata (setup.py) ... done
Collecting frida-tools==9.2.2
  Using cached frida-tools-9.2.2.tar.gz (37 kB)
  Preparing metadata (setup.py) ... done
Requirement already satisfied: setuptools in d:\app\ida_pro\ida_pro_7.7\python38\lib\site-packages (from frida==14.2.18) (60.9.3)
Collecting colorama<1.0.0,>=0.2.7 (from frida-tools==9.2.2)
  Using cached colorama-0.4.6-py2.py3-none-any.whl.metadata (17 kB)
Collecting prompt-toolkit<4.0.0,>=2.0.0 (from frida-tools==9.2.2)
  Downloading prompt_toolkit-3.0.51-py3-none-any.whl.metadata (6.4 kB)
Collecting pygments<3.0.0,>=2.0.2 (from frida-tools==9.2.2)
  Downloading pygments-2.19.2-py3-none-any.whl.metadata (2.5 kB)
Collecting wcwidth (from prompt-toolkit<4.0.0,>=2.0.0->frida-tools==9.2.2)
  Downloading wcwidth-0.2.13-py2.py3-none-any.whl.metadata (14 kB)
Using cached colorama-0.4.6-py2.py3-none-any.whl (25 kB)
Downloading prompt_toolkit-3.0.51-py3-none-any.whl (387 kB)
Downloading pygments-2.19.2-py3-none-any.whl (1.2 MB)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.2/1.2 MB 893.4 kB/s eta 0:00:00
Downloading wcwidth-0.2.13-py2.py3-none-any.whl (34 kB)
Building wheels for collected packages: frida, frida-tools
  Building wheel for frida (setup.py) ... error
  error: subprocess-exited-with-error

  × python setup.py bdist_wheel did not run successfully.
  │ exit code: 1
  ╰─> [69 lines of output]
      running bdist_wheel
      running build
      running build_py
      creating build
      creating build\lib.win-amd64-cpython-38
      creating build\lib.win-amd64-cpython-38\frida
      copying frida\core.py -> build\lib.win-amd64-cpython-38\frida
      copying frida\__init__.py -> build\lib.win-amd64-cpython-38\frida
      running build_ext
      Traceback (most recent call last):
        File "C:\Users\cyrus\AppData\Local\Temp\pip-install-uf4a5lj6\frida_d2b25c48b01748e6bfb04c1245fc6a82\setup.py", line 101, in build_extension
          with open(egg_path, "rb") as cache:
      FileNotFoundError: [Errno 2] No such file or directory: 'C:\\Users\\cyrus/frida-14.2.18-py3.8-win-amd64.egg'

      During handling of the above exception, another exception occurred:

      Traceback (most recent call last):
        File "<string>", line 2, in <module>
        File "<pip-setuptools-caller>", line 34, in <module>
        File "C:\Users\cyrus\AppData\Local\Temp\pip-install-uf4a5lj6\frida_d2b25c48b01748e6bfb04c1245fc6a82\setup.py", line 155, in <module>
          setup(
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\__init__.py", line 87, in setup
          return distutils.core.setup(**attrs)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\core.py", line 148, in setup
          return run_commands(dist)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\core.py", line 163, in run_commands
          dist.run_commands()
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\dist.py", line 967, in run_commands
          self.run_command(cmd)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\dist.py", line 1224, in run_command
          super().run_command(command)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\dist.py", line 986, in run_command
          cmd_obj.run()
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\wheel\bdist_wheel.py", line 299, in run
          self.run_command('build')
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\cmd.py", line 313, in run_command
          self.distribution.run_command(command)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\dist.py", line 1224, in run_command
          super().run_command(command)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\dist.py", line 986, in run_command
          cmd_obj.run()
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\command\build.py", line 136, in run
          self.run_command(cmd_name)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\cmd.py", line 313, in run_command
          self.distribution.run_command(command)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\dist.py", line 1224, in run_command
          super().run_command(command)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\dist.py", line 986, in run_command
          cmd_obj.run()
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\command\build_ext.py", line 79, in run
          _build_ext.run(self)
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\command\build_ext.py", line 339, in run
          self.build_extensions()
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\command\build_ext.py", line 448, in build_extensions
          self._build_extensions_serial()
        File "D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\setuptools\_distutils\command\build_ext.py", line 473, in _build_extensions_serial
          self.build_extension(ext)
        File "C:\Users\cyrus\AppData\Local\Temp\pip-install-uf4a5lj6\frida_d2b25c48b01748e6bfb04c1245fc6a82\setup.py", line 108, in build_extension
          urls = client.release_urls("frida", frida_version)
        File "xmlrpc\client.py", line 1109, in __call__
        File "xmlrpc\client.py", line 1450, in __request
        File "C:\Users\cyrus\AppData\Local\Temp\pip-install-uf4a5lj6\frida_d2b25c48b01748e6bfb04c1245fc6a82\setup.py", line 58, in request
          return self.parse_response(fp)
        File "xmlrpc\client.py", line 1341, in parse_response
        File "xmlrpc\client.py", line 655, in close
      xmlrpc.client.Fault: <Fault -32500: 'RuntimeError: PyPI no longer supports the XMLRPC package_releases method. Use JSON or Simple API instead. See https://warehouse.pypa.io/api-reference/xml-rpc.html#deprecated-methods for more information.'>
      looking for prebuilt extension in home directory, i.e. C:\Users\cyrus/frida-14.2.18-py3.8-win-amd64.egg
      prebuilt extension not found in home directory, will try downloading it
      querying pypi for available prebuilds
      [end of output]

  note: This error originates from a subprocess, and is likely not a problem with pip.
  ERROR: Failed building wheel for frida
  Running setup.py clean for frida
  Building wheel for frida-tools (setup.py) ... done
  Created wheel for frida-tools: filename=frida_tools-9.2.2-py3-none-any.whl size=41502 sha256=ffca4ce9b4cb815038075288489d59297fce89452c5357491ad7e5d9426b8a9c
  Stored in directory: c:\users\cyrus\appdata\local\pip\cache\wheels\f7\6d\3e\f1f44850a1146281b51e2055df574bd66f948f7c871f535ef8
Successfully built frida-tools
Failed to build frida
ERROR: Failed to build installable wheels for some pyproject.toml based projects (frida)
```

这里遇到的问题主要有两个：

1.  在 IDA Pro 自带的 **Python 3.8.10** 环境里用 pip install frida==14.2.18 时，setup.py 会尝试从 PyPI XMLRPC API 下载 **预编译扩展（.egg）**，但 PyPI 早就停用了这个接口 → 所以报错。
    
2.  frida **不能从源码编译** （需要 C++17 工具链 + Frida SDK），而官方是直接发布 **预编译 wheel 包** （.whl 文件）。
    

## 4\. 通过预编译 wheel 安装 frida

不要用 pip 从源码构建，直接用官方 wheel 包。

## 1\. 下载对应的预编译 wheel

Frida 官方有 Windows 的预编译 wheel： [https://pypi.org/project/frida/#history](https://pypi.org/project/frida/#history)

比如你需要：

-   Python 3.8
    
-   Windows 64-bit (AMD64)
    

 [![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/975e22339e8a1f52.png)](data:image/png;base64,inline-169758B)[https://pypi.org/project/frida/14.2.18/#files](https://pypi.org/project/frida/14.2.18/#files)

对应的文件名大概是：

```
frida-14.2.18-cp38-cp38-win_amd64.whl
```

或者

```
frida-14.2.18-py3.8-win-amd64.egg
```

.egg 是早期 setuptools 分发的二进制包格式，作用等同于.whl。

把.whl 或者.egg 下载到本地。

## 2\. 用 IDA 自带 Python 安装 frida

如果是.whl 直接用 pip install

```
D:\App\IDA_Pro\IDA_Pro_7.7\python38\python.exe -m pip install "D:\Downloads\frida-17.2.16-cp37-abi3-win_arm64.whl"
```

如果是.egg 使用 easy_install

```
D:\App\IDA_Pro\IDA_Pro_7.7\python38\python.exe -m easy_install "D:\Downloads\frida-14.2.18-py3.8-win-amd64.egg"
```

easy_install 是 setuptools 里带的一个命令，专门支持 egg 格式。

用 IDA 自带 Python 安装 frida 提示 No module named easy_install

```
D:\App\IDA_Pro\IDA_Pro_7.7\python38\python.exe: No module named easy_install
```

easy_install 早期版本才有，现在很多 Python 环境默认不带了。

先确认 IDA 自带 Python 里有没有 setuptools：

```yaml
(base) PS D:\Downloads> D:\App\IDA_Pro\IDA_Pro_7.7\python38\python.exe -m pip show setuptools
Name: setuptools
Version: 60.9.3
Summary: Easily download, build, install, upgrade, and uninstall Python packages
Home-page: https://github.com/pypa/setuptools
Author: Python Packaging Authority
Author-email: distutils-sig@python.org
License: UNKNOWN
Location: d:\app\ida_pro\ida_pro_7.7\python38\lib\site-packages
Requires:
Required-by: sip
```

如果版本很新（>=50），那么 **可能已经不再提供 easy_install。**

## 3\. 手动安装 egg

egg 本质上就是一个 **zip 文件**，可以直接手动解压丢进 site-packages。

解压 frida-14.2.18-py3.8-win-amd64.egg，得到 frida python 库源码。

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/11ec8aa55dc8b17d.png)](data:image/png;base64,inline-29486B)

解压出来并复制到：

```
D:\App\IDA_Pro\IDA_Pro_7.7\python38\Lib\site-packages\
```

大概这样：

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a7735713ac0beb19.png)](data:image/png;base64,inline-100798B)

启动 IDA Python 测试：

```
import frida
print(frida.__version__)
```

能正常输出版本号代表安装成功。

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4c07b71896dd59d8.png)](data:image/png;base64,inline-6026B)

## 5\. 安装 frida-tools

frida-tools 版本列表： [https://pypi.org/project/frida-tools/#history](https://pypi.org/project/frida-tools/#history)

比如这里安装的是 frida-tools 9.2.2，下载 [frida-tools-9.2.2.tar.gz](https://files.pythonhosted.org/packages/d6/cd/6086bd6fc3a32a3258b00e43348954a4c1078353f7538e9cb6217d48fcc2/frida-tools-9.2.2.tar.gz)

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bf65f7c819e5fac2.png)](data:image/png;base64,inline-104350B)

把压缩包里的 frida_tools 文件夹复制到 D:\\App\\IDA_Pro\\IDA_Pro_7.7\\python38\\Lib\\site-packages\\

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d1350e468d5179af.png)](data:image/png;base64,inline-57570B)

IDA Python 中测试是否安装成功：

```
Python>import frida_tools
print(frida_tools.__file__)
D:\App\IDA_Pro\IDA_Pro_7.7\python38\lib\site-packages\frida_tools\__init__.py
```

如果能打印出路径（比如 …\\site-packages\\frida_tools\_ *init* \_.py），说明安装好了。

## 6\. Frida Python 脚本：自动捕获目标模块信息

编写一个 **Frida Python 辅助脚本**：

-   支持配置 **包名 / 模块名 / 是否 spawn**，一键切换调试策略；
    
-   支持 **attach 前台应用** 或 **spawn 启动应用**；
    
-   spawn 模式下，通过 Hook dlopen & android_dlopen_ext 捕获 so 加载事件；
    
-   attach 模式下，直接枚举已加载模块；
    
-   输出模块的 **基址、大小和名称**，方便后续 Trace、断点或内存分析。
    

frida_get_module_info.py

```python
# -*- coding: utf-8 -*-
"""
Frida Attach Helper
===================
一个简单的 Frida 辅助脚本：
1. 支持配置包名 / 模块名 / 是否 spawn
2. 支持附加前台应用或指定应用
3. 自动捕获目标 so 基址信息
"""

import frida

# =========================
# 配置区 (根据需要修改)
# =========================
REMOTE_ADDR = "127.0.0.1:1234"  # frida-server 地址
PACKAGE_NAME = "com.cyrus.example"  # 目标应用包名
MODULE_NAME = "libnative-lib.so"  # 目标 so 名称
USE_SPAWN = False  # True=spawn 启动, False=附加前台应用


# =========================
# Frida 辅助函数
# =========================

# 连接远程设备并附加到前台应用
def attach_frontmost(remote_addr=REMOTE_ADDR):
    # 连接远程 frida-server
    device = frida.get_device_manager().add_remote_device(remote_addr)
    print(f"[+] 已连接到远程设备: {remote_addr}")

    # 附加到前台应用
    app = device.get_frontmost_application()
    print(f"[+] 前台应用: {app.identifier} (pid={app.pid})")

    session = device.attach(app.pid)
    return device, session, app.pid


# 连接远程设备并附加到指定应用
def attach_package(package_name, remote_addr=REMOTE_ADDR):
    # 连接远程 frida-server
    device = frida.get_device_manager().add_remote_device(remote_addr)
    print(f"[+] 已连接到远程设备: {remote_addr}")

    # 启动目标应用 (相当于 -f)
    pid = device.spawn([package_name])
    print(f"[+] 已启动进程: {package_name} (pid={pid})")

    # 附加到目标进程
    session = device.attach(pid)
    return device, session, pid


def find_module(session, module_name):
    """直接 enumerateModules 查找目标模块"""
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


def hook_dlopen_and_wait(session, module_name, on_load):
    """
    Hook dlopen / android_dlopen_ext，捕获目标模块加载完成事件
    :param session: frida.Session
    :param module_name: 目标模块名 (字符串，支持部分匹配)
    :param on_load: 回调函数，参数为 module_info(dict)
    """

    js_code = f"""
        var target = "{module_name}";

        function notifyModule(name) {{
            if (name.indexOf(target) >= 0) {{
                try {{
                    var m = Process.getModuleByName(name);
                    var result = {{
                        name: m.name,
                        base: m.base.toString(),
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

    script = session.create_script(js_code)

    def on_message(msg, data):
        if msg["type"] == "send":
            module_info = msg["payload"]
            print(f"[+] 捕获到目标模块加载: {module_info}")
            if on_load:
                on_load(module_info)
        elif msg["type"] == "error":
            print(f"[!] Frida 脚本错误: {msg['stack']}")

    script.on("message", on_message)
    script.load()
    return script


# =========================
# 主逻辑入口
# =========================
if __name__ == "__main__":
    if USE_SPAWN:
        device, session, pid = attach_package(PACKAGE_NAME, REMOTE_ADDR)


        def module_loaded_callback(module_info):
            print(f"===> 回调触发: 模块加载完成 {module_info}")
            session.detach()


        # Hook dlopen / android_dlopen_ext，捕获目标模块加载完成事件
        hook_dlopen_and_wait(session, MODULE_NAME, module_loaded_callback)

        # 让 APP 继续运行
        device.resume(pid)

    else:
        device, session, pid = attach_frontmost(REMOTE_ADDR)
        module_info = find_module(session, MODULE_NAME)
        print("模块信息:", module_info)
        session.detach()
```

在 IDA Pro 中，Alt + F7 执行该脚本文件

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1772ec9ee3d58feb.png)](data:image/png;base64,inline-29774B)

输出如下：

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6014217e5b619ab1.png)](data:image/png;base64,inline-66538B)
