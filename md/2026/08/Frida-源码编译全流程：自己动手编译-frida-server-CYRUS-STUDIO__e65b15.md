---
title: Frida 源码编译全流程：自己动手编译 frida-server // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/frida-%E6%BA%90%E7%A0%81%E7%BC%96%E8%AF%91%E5%85%A8%E6%B5%81%E7%A8%8B%E8%87%AA%E5%B7%B1%E5%8A%A8%E6%89%8B%E7%BC%96%E8%AF%91-frida-server/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:11:56+08:00
trace_id: eab8c27c-dd70-4709-87b9-123d082a4ab7
content_hash: 0eea8d8d670c7253f30839ab8c6a7a676d6782f54a820ba8c2b26f5736f062e1
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 编译Frida-server的核心步骤包括配置Python/Node.js/NDK环境，解决pyconfig.h缺失和SDK下载中断问题，并可根据tag编译指定版本。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3b275244-d011-8105-ac1d-d69b4e16f92a
ioc:
  cves: []
  cwes: []
  hashes:
    - 5e96669f06077099aa41290cdb4c5e6fa0f59349
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 编译Frida-server的核心步骤包括配置Python/Node.js/NDK环境，解决pyconfig.h缺失和SDK下载中断问题，并可根据tag编译指定版本。
> 
> - **编译环境：** 在Ubuntu上需安装build-essential、lib32stdc++-9-dev、Python3开发工具，并通过nvm管理Node.js（推荐v18）以实现版本隔离。
> - **缺失pyconfig.h：** 编译时若报告`fatal error: pyconfig.h: No such file or directory`，通过`sudo ln -s /usr/include/python3.10/ /usr/lib/include/`创建软链接即可修复。
> - **SDK下载中断：** 自动下载SDK出现`EOFError`表示tar.xz损坏；手动从`https://build.frida.re/deps/`下载对应版本的sdk-android-arm64.tar.xz并解压到`deps/`目录后重新配置可解决。
> - **编译指定版本：** 使用`git checkout <tag>`切换版本后必须同步子模块（`git submodule update --init --recursive --force`），且需将ANDROID_NDK_ROOT指向项目要求的NDK版本（如frida 16.7.19要求NDK r25）。
> - **产物输出：** 编译成功后frida-server生成在`frida/build/subprojects/frida-core/server/frida-server`。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 下载 Frida 源码

Frida 源码： [https://github.com/frida/frida](https://github.com/frida/frida)

官方文档： [https://frida.re/docs/building/](https://frida.re/docs/building/)

下载源码

```bash
git clone https://github.com/frida/frida.git
```

安装相关依赖：

```
sudo apt-get install build-essential git lib32stdc++-9-dev \
    libc6-dev-i386 nodejs npm
```

## 安装 Python

```
sudo apt install -y python3-dev python3-setuptools python3-wheel python3-pip
```

## 安装 Node.js

nvm 是一个 Node.js 版本管理器，在同一台机器上管理多个 Node.js 版本，并随时切换。

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

source ~/.bashrc

nvm install 18
nvm use 18
```

安装任意版本 Node.js

```
nvm install 18
nvm install 20
```

一键切换

```
nvm use 18
```

实现项目隔离，你可以：

```
nvm use 18   # 编译 Frida
nvm use 16   # 其他项目
```

验证：

```
node -v
```

## 安装 NDK

下载并解压 ndk

```
mkdir ndk
cd ndk

wget https://dl.google.com/android/repository/android-ndk-r29-linux.zip
unzip android-ndk-r29-linux.zip
```

配置 ANDROID_NDK_ROOT

```
export ANDROID_NDK_ROOT=~/ndk/android-ndk-r29
```

## 编译 Frida

设置目标运行平台（host）是 Android ARM64（aarch64）

```
$ ./configure --host=android-arm64
The Meson build system
Version: 1.4.99
Source dir: /mnt/case_sensitive/frida
Build dir: /mnt/case_sensitive/frida/build
Build type: cross build
Project name: frida
Project version: 17.8.3
C compiler for the host machine: /mnt/case_sensitive/ndk/android-ndk-r29/toolchains/llvm/prebuilt/linux-x86_64/bin/clang -target aarch64-none-linux-android21 (clang 21.0.0 "Android (13989888, +pgo, +bolt, +lto, +mlgo, based on r563880c) clang version 21.0.0 (https://android.googlesource.com/toolchain/llvm-project 5e96669f06077099aa41290cdb4c5e6fa0f59349)")
C linker for the host machine: /mnt/case_sensitive/ndk/android-ndk-r29/toolchains/llvm/prebuilt/linux-x86_64/bin/clang -target aarch64-none-linux-android21 ld.lld 21.0.0
C compiler for the build machine: /usr/bin/cc (gcc 11.4.0 "cc (Ubuntu 11.4.0-1ubuntu1~22.04.3) 11.4.0")
C linker for the build machine: /usr/bin/cc ld.bfd 2.38
Build machine cpu family: x86_64
Build machine cpu: x86_64
Host machine cpu family: aarch64
Host machine cpu: aarch64
Target machine cpu family: aarch64
Target machine cpu: aarch64
Program python3 found: YES (/usr/bin/python3)
...
```

开始编译

```
make
```

## 解决编译报错

## fatal error: pyconfig.h: No such file or directory

编译器找不到：pyconfig.h

```swift
[347/349] Compiling C object subprojects/frida-python/frida/_frida/_frida.abi3.so.p/extension.c.o
FAILED: subprojects/frida-python/frida/_frida/_frida.abi3.so.p/extension.c.o
/usr/bin/cc -Isubprojects/frida-python/frida/_frida/_frida.abi3.so.p -Isubprojects/frida-python/frida/_frida -I../subprojects/frida-python/frida/_frida -Isubprojects/frida-core/src/api -I../subprojects/frida-core/src/api -Isubprojects/frida-gum -I../subprojects/frida-gum -Isubprojects/frida-gum/gum -I../subprojects/frida-gum/gum -I../subprojects/frida-gum/gum/arch-x86 -I../subprojects/frida-gum/gum/arch-arm -I../subprojects/frida-gum/gum/arch-arm64 -I../subprojects/frida-gum/gum/arch-mips -Isubprojects/frida-gum/libs -I../subprojects/frida-gum/libs -Isubprojects/frida-gum/libs/gum/heap -I../subprojects/frida-gum/libs/gum/heap -Isubprojects/frida-gum/libs/gum/prof -I../subprojects/frida-gum/libs/gum/prof -I../subprojects/frida-gum/gum/backend-linux/include -I../subprojects/frida-gum/gum/backend-elf -I../subprojects/frida-gum/gum/backend-libunwind/include -Isubprojects/frida-gum/bindings -I../subprojects/frida-gum/bindings -I/usr/lib/include/python3.10 -I/usr/lib/include/x86_64-linux-gnu/python3.10 -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/glib-2.0 -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/lib/glib-2.0/include -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/gee-0.8 -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/json-glib-1.0 -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/capstone -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/libsoup-3.0 -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/gio-unix-2.0 -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/libusb-1.0 -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/quickjs -I/mnt/case_sensitive/frida/deps/sdk-linux-x86_64/include/nice -fvisibility=hidden -fdiagnostics-color=always -DNDEBUG -D_FILE_OFFSET_BITS=64 -Wall -Winvalid-pch -Os -g -ffunction-sections -fdata-sections -fPIC -pthread -DNGTCP2_STATICLIB -DNGHTTP2_STATICLIB -DGUM_STATIC -DFFI_STATIC_BUILD -DG_DISABLE_ASSERT -DG_DISABLE_CHECKS -DG_DISABLE_CAST_CHECKS -DPy_LIMITED_API=0x03070000 -MD -MQ subprojects/frida-python/frida/_frida/_frida.abi3.so.p/extension.c.o -MF subprojects/frida-python/frida/_frida/_frida.abi3.so.p/extension.c.o.d -o subprojects/frida-python/frida/_frida/_frida.abi3.so.p/extension.c.o -c ../subprojects/frida-python/frida/_frida/extension.c
../subprojects/frida-python/frida/_frida/extension.c:33:11: fatal error: pyconfig.h: No such file or directory
   33 | # include <pyconfig.h>
      |           ^~~~~~~~~~~~
compilation terminated.
[348/349] Generating subprojects/frida-core/src/api/frida-core-library with a custom command
ninja: build stopped: subcommand failed.
Command '['/usr/bin/python3', '/mnt/case_sensitive/frida/releng/meson/meson.py', 'compile']' returned non-zero exit status 1.
make: *** [Makefile:4: all] Error 1
```

解决方案：

```bash
# 创建目录
sudo mkdir /usr/lib/include/

# 创建一个软链接（symbolic link）
sudo ln -s /usr/include/python3.10/ /usr/lib/include/
```

参考： [https://github.com/frida/frida/issues/3253](https://github.com/frida/frida/issues/3253)

当访问 /usr/include/python3.10 时，实际访问 /usr/lib/include/python3.10

```bash
/mnt/case_sensitive/frida$ find /usr/ -name pyconfig.h
/usr/include/x86_64-linux-gnu/python3.10/pyconfig.h
/usr/include/python3.10/pyconfig.h
```

清理并重编译

```
rm -rf build
make
```

查看指定目录的软链接：

```
$ ls -l /usr/lib/include
total 0
lrwxrwxrwx 1 root root 24 Mar 27 13:25 python3.10 -> /usr/include/python3.10/
```

有 -> 才是软链接

如果想删除软链接：

```
sudo rm /usr/lib/include/python3.10
```

只删除：/usr/lib/include/python3.10 (link)，不会删除：/usr/include/python3.10 (真实目录)

## EOFError: Compressed file ended before the end-of-stream marker was reached

tar.xz 没下载完整 / 被截断 / 缓存坏了

```swift
$ make
INFO: autodetecting backend as ninja
INFO: calculating backend command to run: /mnt/case_sensitive/frida/deps/toolchain-linux-x86_64/bin/ninja
[265/309] Generating subprojects/frida-core/lib/gadget/frida-gadget with a custom command
[266/309] Generating subprojects/frida-core/compat/arch-support with a custom command
FAILED: subprojects/frida-core/compat/arch-support.bundle subprojects/frida-core/compat/frida-helper subprojects/frida-core/compat/frida-agent.so subprojects/frida-core/compat/frida-gadget.so
/usr/bin/python3 ../subprojects/frida-core/compat/build.py compile subprojects/frida-core/compat/arch-support.bundle.p gASVKQMAAAAAAACMCF9fbWFpbl9flIwFU3RhdGWUk5QpgZR9lCiMBHJvbGWUjApzdWJwcm9qZWN0lIwIYnVpbGRkaXKUjAdwYXRobGlilIwJUG9zaXhQYXRolJOUKIwBL5SMA21udJSMDmNhc2Vfc2Vuc2l0aXZllIwFZnJpZGGUjAVidWlsZJSMC3N1YnByb2plY3RzlIwKZnJpZGEtY29yZZSMBmNvbXBhdJR0lFKUjAx0b3BfYnVpbGRkaXKUaAooaAtoDGgNaA5oD3SUUpSMDWZyaWRhX3ZlcnNpb26UjAYxNy44LjOUjAdob3N0X29zlIwHYW5kcm9pZJSMC2hvc3RfY29uZmlnlE6MEWFsbG93ZWRfcHJlYnVpbGRzlI+UKIwJdG9vbGNoYWlulIwIc2RrOmhvc3SUjAlzZGs6YnVpbGSUkIwHb3V0cHV0c5SMC2NvbGxlY3Rpb25zlIwLT3JkZXJlZERpY3SUk5QpUpQoaACMC091dHB1dEdyb3VwlJOUKYGUfZQojARhcmNolE6MB3RyaXBsZXSUTowNZXh0cmFfZW52aXJvbpR9lHViXZRoAIwGT3V0cHV0lJOUKYGUfZQojAppZGVudGlmaWVylIwTYXJjaF9zdXBwb3J0X2J1bmRsZZSMBG5hbWWUjBNhcmNoLXN1cHBvcnQuYnVuZGxllIwEZmlsZZRoCmgShZRSlIwGdGFyZ2V0lIwAlHViYWgoKYGUfZQoaCuMA2FybZRoLE5oLX2UdWJdlChoMSmBlH2UKGg0jA1oZWxwZXJfbGVnYWN5lGg2jAxmcmlkYS1oZWxwZXKUaDhoCowDc3JjlGhFhpRSlGg7aEV1YmgxKYGUfZQoaDSMDGFnZW50X2xlZ2FjeZRoNowOZnJpZGEtYWdlbnQuc2+UaDhoCowDbGlilIwFYWdlbnSUaEyHlFKUaDuMC2ZyaWRhLWFnZW50lHViaDEpgZR9lChoNIwNZ2FkZ2V0X2xlZ2FjeZRoNowPZnJpZGEtZ2FkZ2V0LnNvlGg4aApoTYwGZ2FkZ2V0lGhVh5RSlGg7jAxmcmlkYS1nYWRnZXSUdWJldXViLg==
Traceback (most recent call last):
  File "/mnt/case_sensitive/frida/build/../subprojects/frida-core/compat/build.py", line 680, in <module>
    main(sys.argv)
  File "/mnt/case_sensitive/frida/build/../subprojects/frida-core/compat/build.py", line 66, in main
    args.func(args)
  File "/mnt/case_sensitive/frida/build/../subprojects/frida-core/compat/build.py", line 61, in <lambda>
    command.set_defaults(func=lambda args: compile(args.privdir, pickle.loads(base64.b64decode(args.state))))
  File "/mnt/case_sensitive/frida/build/../subprojects/frida-core/compat/build.py", line 443, in compile
    configure(sourcedir=REPO_ROOT,
  File "/mnt/case_sensitive/frida/releng/meson_configure.py", line 199, in configure
    host_sdk_prefix, _ = deps.ensure_sdk(host_machine, deps_dir, on_progress=on_progress)
  File "/mnt/case_sensitive/frida/releng/deps.py", line 142, in ensure_sdk
    state = sync(Bundle.SDK, machine, sdk_prefix, version, on_progress)
  File "/mnt/case_sensitive/frida/releng/deps.py", line 208, in sync
    tar.extractall(staging_dir)
  File "/usr/lib/python3.10/tarfile.py", line 2289, in extractall
    self._extract_one(tarinfo, path, set_attrs=not tarinfo.isdir(),
  File "/usr/lib/python3.10/tarfile.py", line 2352, in _extract_one
    self._extract_member(tarinfo, os.path.join(path, tarinfo.name),
  File "/usr/lib/python3.10/tarfile.py", line 2435, in _extract_member
    self.makefile(tarinfo, targetpath)
  File "/usr/lib/python3.10/tarfile.py", line 2488, in makefile
    copyfileobj(source, target, tarinfo.size, ReadError, bufsize)
  File "/usr/lib/python3.10/tarfile.py", line 252, in copyfileobj
    buf = src.read(bufsize)
  File "/usr/lib/python3.10/lzma.py", line 200, in read
    return self._buffer.read(size)
  File "/usr/lib/python3.10/_compression.py", line 68, in readinto
    data = self.read(len(byte_view))
  File "/usr/lib/python3.10/_compression.py", line 99, in read
    raise EOFError("Compressed file ended before the "
EOFError: Compressed file ended before the end-of-stream marker was reached
ninja: build stopped: subcommand failed.
Command '['/usr/bin/python3', '/mnt/case_sensitive/frida/releng/meson/meson.py', 'compile']' returned non-zero exit status 1.
make: *** [Makefile:4: all] Error 1
```

解决方案：

```bash
# 删除损坏的 SDK
rm -rf deps/sdk-android-arm64

# 删除 build
rm -rf build/

# 重新下载
./configure --host=android-arm64
```

但一直卡在 Downloading SDK …

```
$ ./configure --host=android-arm64
Downloading SDK 20260311 for android-arm64...
```

Frida 的 SDK 实际来自：

```
https://build.frida.re/deps/
```

当前日志：

```
Downloading SDK 20260311 for android-arm64
```

对应文件是：

```
sdk-android-arm64.tar.xz
```

下载地址是：

```
https://build.frida.re/deps/20260311/sdk-android-arm64.tar.xz
```

sdk下载链接生成规则就在 releng/deps.py 中

```swift
$ grep -R "build.frida.re" -n releng/
releng/deps.py:249:    s3_url = "s3://build.frida.re/deps/{version}/{filename}".format(version=version, filename=filename)
releng/deps.py:1096:BUNDLE_URL = "https://build.frida.re/deps/{version}/{filename}"
grep: releng/__pycache__/deps.cpython-310.pyc: binary file matches
releng/post-process-oabi.py:12:ARM64E_URL = "https://build.frida.re/deps/{version}/sdk-ios-arm64e.tar.xz"
```

手动下载并解压 SDK 到 deps

```bash
# 1. 进入 deps
cd ./deps/

# 2. 手动下载
$ wget https://build.frida.re/deps/20260311/sdk-android-arm64.tar.xz

# 3. 解压
mkdir -p ./sdk-android-arm64 && tar -xf sdk-android-arm64.tar.xz -C ./sdk-android-arm64 --strip-components=1

# 4. 返回
cd ..

# 5. 继续配置
./configure --host=android-arm64
```

## 编译完成

编译完成 frida-server 生成在：

```
frida\build\subprojects\frida-core\server\frida-server
```

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ea91bb1229df28b0.png)](data:image/png;base64,inline-45218B)

## 编译指定版本的 Frida

## 查看所有 Frida 版本

列出所有版本（tags）

```bash
git tag
```

如果只看 Frida 主版本（过滤）：

```bash
git tag | grep ^16
```

或者按时间排序：

```bash
git tag --sort=-creatordate
```

## 查看当前版本

```bash
git describe --tags
```

或：

```bash
git tag --points-at HEAD
```

## 编译指定版本

比如编译 frida 16.7.19

```bash
# 切版本
git checkout 16.7.19

# 强制同步 submodule 到 tag 对应版本
git submodule update --init --recursive --force

# 确认子模块是否已经同步
git submodule status

# 清理旧构建
rm -rf build

# 配置（Android）
./configure --host=android-arm64

# 编译
make
```

下载对应版本的 deps

```
~/frida$ ./configure --host=android-arm64
Downloading toolchain 20250512...
Extracting toolchain...
Downloading SDK 20250512 for linux-x86_64...
Extracting SDK...
Downloading SDK 20250512 for android-arm64...
Extracting SDK...
NDK r25 is required (found r29, which is unsupported)
```

不同版本对 NDK 版本要求也不一样

```bash
# 下载对应版本的 NDK
wget https://dl.google.com/android/repository/android-ndk-r25-linux.zip
# 解压 NDK
unzip android-ndk-r29-linux.zip

# 修改 ANDROID_NDK_ROOT
export ANDROID_NDK_ROOT=~/ndk/android-ndk-r25

# 查看当前 ANDROID_NDK_ROOT
echo $ANDROID_NDK_ROOT
```
