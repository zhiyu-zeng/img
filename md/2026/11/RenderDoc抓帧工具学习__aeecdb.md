---
title: RenderDoc抓帧工具学习
source: https://fjqisba.github.io/2025/12/17/2025/RenderDoc%E6%8A%93%E5%B8%A7%E5%B7%A5%E5%85%B7%E5%AD%A6%E4%B9%A0/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:53:48+08:00
trace_id: 1d7d59c2-5f3e-47f6-b912-cefc37e071e1
content_hash: 37a093601374319260f9a8c4b7d53e47290128c351792849e65e2c8fcbb5a417
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-817a-83e3-ccf2296d96df
ioc: null
---

## RenderDoc抓帧工具学习

项目地址： [https://github.com/baldurk/renderdoc](https://github.com/baldurk/renderdoc)

二进制包下载： [https://renderdoc.org/builds](https://renderdoc.org/builds)

## 关于编译

官方编译指南:[https://github.com/baldurk/renderdoc/blob/v1.x/docs/CONTRIBUTING/Compiling.md](https://github.com/baldurk/renderdoc/blob/v1.x/docs/CONTRIBUTING/Compiling.md)

自己查看依赖： [https://github.com/baldurk/renderdoc/blob/v1.x/docs/CONTRIBUTING/Dependencies.md](https://github.com/baldurk/renderdoc/blob/v1.x/docs/CONTRIBUTING/Dependencies.md)

## Linux编译Android

比较丝滑，对着教程来即可，这里我记录一下。

安装JDK

```
sudo add-apt-repository ppa:openjdk-r/ppa
sudo apt-get update
sudo apt-get install openjdk-8-jdk
sudo apt-get install build-essential
SMALI
```

安装Android SDK，路径自己填，例如 `/home/fjqisba/MyLib/android_sdk`

```bash
wget http://dl.google.com/android/repository/sdk-tools-linux-3859397.zip
unzip sdk-tools-linux-3859397.zip
cd tools/bin/
./sdkmanager --sdk_root=/home/fjqisba/MyLib/android_sdk "build-tools;26.0.1" "platforms;android-23"
BASH
```

安装Android NDK，路径自己填

```
wget http://dl.google.com/android/repository/android-ndk-r14b-linux-x86_64.zip
unzip android-ndk-r14b-linux-x86_64.zip
X86ASM
```

开始安装，可以建个build.sh文件

```bash
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export ANDROID_SDK=/home/fjqisba/MyLib/android_sdk
export ANDROID_NDK=/home/fjqisba/MyLib/android-ndk-r14b
cmake -DBUILD_ANDROID=On -DANDROID_ABI=armeabi-v7a ..
make -j4
ROUTEROS
```

### 编译interceptor-lib

看懂英文，按照里面的教程即可:[https://github.com/baldurk/renderdoc/tree/v1.x/renderdoc/3rdparty/interceptor-lib](https://github.com/baldurk/renderdoc/tree/v1.x/renderdoc/3rdparty/interceptor-lib)

环境变量记得先安装一下Python。

如果出现提示 `CMakeFiles/LLVMHello.dir/Hello.cpp.o:/home/fjqisba/Desktop/RenderDoc/llvm/lib/Transforms/Hello/Hello.cpp:vtable for (anonymous namespace)::Hello: error: undefined reference to 'llvm::Pass::~Pass()`

需要注释掉 `lib/Transforms/CMakeLists.txt` 里面的 `add_subdirectory(Hello)`

注释掉 `test/CMakeLists.txt` 里面的LLVMHello

### 可能会出错的问题

1、在ubuntu 24.04环境下编译报错

```gradle
/home/fjqisba/MyLib/android-ndk-r14b/toolchains/llvm/prebuilt/linux-x86_64/bin/clang++: error while loading shared libraries: libncurses.so.5: cannot open shared object file: No such file or directory
GRADLE
```

解决办法，安装libncurses5

```bash
#没权限就先创建文件
echo "deb http://security.ubuntu.com/ubuntu focal-security main universe" > /etc/apt/sources.list.d/ubuntu-focal-sources.list
sudo apt update
sudo apt-get install libncurses5
BASH
```

2、出现Facing the failed to fetch us.archive.ubuntu.com类似指令

修改DNS，添加阿里云DNS，然后刷新DNS缓存

```arduino
resolvectl flush-caches
ARDUINO
```

## Windows端编译Android

安装JDK，自己下载

SDK和NDK基本和上面一样

1、安装MSYS2，搞点必备工具

```bash
pacman -Syu
pacman -S mingw-w64-x86_64-cmake
pacman -S mingw-w64-x86_64-make
pacman -S mingw-w64-x86_64-gcc
pacman -S mingw-w64-x86_64-toolchain
pacman -S git
LLVM
```

配置CMake环境，打开里面的mingw64.exe，执行命令

```bash
export JAVA_HOME=/D/App/Android\ Studio/jbr
export ANDROID_HOME=/C/Users/fjqisba/AppData/Local/Android/Sdk
export ANDROID_NDK_HOME=/C/Users/fjqisba/AppData/Local/Android/Sdk/ndk/26.1.10909125
export PATH=$PATH:$JAVA_HOME/bin
cmake -DBUILD_ANDROID=On -DCMAKE_BUILD_TYPE=Release -DANDROID_ABI=arm64-v8a -G "MinGW Makefiles" ..
mingw32-make -j20
ROUTEROS
```

### 可能会出错的问题

1、执行cmake命令的时候，提示

```gradle
CMake Error at D:/App/MYSYS2/mingw64/share/cmake/Modules/Platform/Android-Common.cmake:102 (message)
 Android: STL 'gnustl_static' include directory not found:
GRADLE
```

解决方案，cmake带上命令，换个STL库版本

```
-DCMAKE_ANDROID_STL_TYPE=c++_static
INI
```

2、执行mingw32-make的时候，提示.

```
CMake Error at renderdoccmd/CMakeLists.txt:118 (message):
  Building Android requires the 'java' program in your PATH.  It must be at
  least Java 8 (1.8)
APACHE
```

解决方案，修改renderdoccmd/CMakeLists.txt，前面加上#符号，注释掉语句

```
#set(ENV{JAVA_HOME} "")
LEAF
```

## Windows端编译RenderDoc1.13版本

低版本建议最好是使用Visual Studio 2017

VS 2015社区版下载地址:[https://go.microsoft.com/fwlink/?LinkId=615448](https://go.microsoft.com/fwlink/?LinkId=615448)

VS 2017社区版下载地址:[https://aka.ms/vs/15/release/vs_community.exe](https://aka.ms/vs/15/release/vs_community.exe)

编译的时候下面这句代码如果报错:

```
int2 sign = p ? -1 : 1;
APACHE
```

手动修改一下即可:

```
int2 sign = select(p, -1, 1);
APACHE
```

## Windows端抓帧原理

看看renderdoc的源码，会发现核心就是renderdoc.dll模块。

抓帧工具原理是启动注入renderdoc.dll，之后模块会针对dxgi.dll、d3d11.dll里面的几个导出函数，进行导入表HOOK

可能会接管下面几种模块

```ruby
D3D11Hook:d3d11.dll
D3D9Hook:d3d9.dll
D3D12Hook:d3d12.dll
AMDHook:atidxx32.dll、atidxx64.dll、amdxc32.dll、amdxc64.dll、amd_ags_x86.dll、amd_ags_x64.dll
NVHook:nvapi.dll、nvapi64.dll、nvEncodeAPI.dll、nvEncodeAPI64.dll
DXGIHook:dxgi.dll
EGLHook:libEGL.dll、libGLESv3.dll
GLHook:opengl32.dll
WGLHook:opengl32.dll
VulkanHook:实际上不是hook
AVRASM
```

接管完了，后面就通过网络和客户端GUI通讯了。

## Android端抓帧原理

1、对于OpenGL引擎，RenderDoc会对支持的安卓设备优先采用 **添加OpenGL调试层** 这种方式进行抓帧，原理是设置手机调试层，例如设置一堆命令

```
adb shell settings put global enable_gpu_debug_layers 1
adb shell settings put global gpu_debug_app <package_name>
adb shell settings put global gpu_debug_layer_app <package1:package2:packageN>
adb shell settings put global gpu_debug_layers_gles libVkLayer_GLES_RenderDoc.so
VIM
```

具体原理可以参考文章 [https://developer.android.com/ndk/guides/rootless-debug-gles?hl=zh-cn](https://developer.android.com/ndk/guides/rootless-debug-gles?hl=zh-cn)

游戏启动后会以极高的优先级加载 `org.renderdoc.renderdoccmd.arm64` 包里面的的 `libVkLayer_GLES_RenderDoc.so` ，so代码只需要提供导出函数 `AndroidGLESLayer_Initialize` 和 `AndroidGLESLayer_GetProcAddress` 即可，这样RenderDoc完成了OpenGL原函数地址的获取和替换.

如果安卓设备不支持这类调试的话，就会使用JDWP调试启动APK，再主动注入so吧。

## 关于对抗

有的游戏会不让你用RenderDoc抓帧。这个时候可以考虑以下方式：

1、修改RenderDoc的源码，将 **修改每个模块的导入表** 改成 **只对D3D模块进行Inline hook**，从逆向的角度来说这样也更能容易过检测。

2、在Renderdoc的源码中，存在着一个标志位的检查，当程序Hook了D3D11CreateDevice函数，发现传入的参数 `Flags` 包含 `D3D11_CREATE_DEVICE_PREVENT_ALTERING_LAYER_SETTINGS_FROM_REGISTRY` ，Renderoc会选择做一个老实人，放弃抓帧。。。

改代码让RenderDoc继续抓帧就行了。

3、修改注入模块的名字，例如libVkLayer_GLES_RenderDoc.so

## 关于使用

截至到目前的RenderDoc v1.41版本，在使用工具的过程中还遇到了一些问题:

1、RenderDoc一连接上手机就卡死

刷了Magisk，执行了 `magisk resetprop ro.debuggable 1` 命令，重启后使用RenderDoc，抓帧过程中会切开adb连接。

可能是Magisk的BUG，执行 `adb root` 命令时会导致adb卡死，可以通过修改RenderDoc源码来暂时屏蔽掉这些指令。

2、RenderDoc抓帧一会儿就断开连接

手机连接上游戏了并且可以抓帧，过了一分钟左右，RenderDoc就会断开连接，如果重连的话，adb也会进入卡死状态

可能是手机厂商使用了电池优化技术，手机后台应用会被冻结连接，需要去 `设置 -> 电池` 里面关掉电池优化

3、RenderDoc启动注入安卓游戏失败

这是由于注入需要往手机属性里面写入字段，某些手机厂商增加了额外限制。  
有的手机需要进入开发者选项，把 **禁止权限监控** 这个开关给打开并重启设备；有的手机则需要开启 **USB调试(安全设置)**

4、游戏抓帧启动直接黑屏卡住

尤其容易出现在游戏启动时加载mp4过场动画上，这是因为RenderDoc代码不够完善，无法有效处理一些OPENGL函数，比如

`glEGLImageTargetTexture2DOES` ，需要修改RenderDoc源码，从OpenGL函数HOOK入手，尝试屏蔽掉这些函数。

## 参考资料

[https://zhuanlan.zhihu.com/p/690214444](https://zhuanlan.zhihu.com/p/690214444)
