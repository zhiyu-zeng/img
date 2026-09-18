---
title: ESP-IDF setup guide - elttam
source: https://www.elttam.com/blog/esp-idf-setup-guide
source_host: www.elttam.com
clip_date: 2026-09-18T10:40:38+08:00
trace_id: 0e5e2a07-507e-4406-9004-81988135ba10
content_hash: 6b15300c03c1ab383a7ec9b2eb0281803ab93849681310bbe3c75a733ac73ba4
status: summarized
tags:
  - 硬件逆向
  - 模拟执行
series: null
feed_source: elttam
ai_summary: 搭建 ESP32/esp-idf 固件安全审计环境的完整流程，在 Linux 上加入 ccls LSP 代码导航与 QEMU 模拟执行，无需实体硬件即可构建、烧写和调试固件。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: null
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 搭建 ESP32/esp-idf 固件安全审计环境的完整流程，在 Linux 上加入 ccls LSP 代码导航与 QEMU 模拟执行，无需实体硬件即可构建、烧写和调试固件。
> 
> - **环境前提：** Ubuntu 20.04 x64（其他发行版可微调），需预设 `SRC_HOME`、`WORKSPACE_HOME`、`PROJ_HOME` 三个变量；建议 4 核、8GB 内存+swap、128GB 磁盘。
> - **框架与项目：** apt 装依赖后递归克隆 esp-idf 并执行 `install.sh esp32`，用 `export.sh` 配置 PATH；随后 `idf.py set-target esp32`、`menuconfig`、`build`，构建时设 `CMAKE_EXPORT_COMPILE_COMMANDS=1` 生成 `compile_commands.json`。
> - **代码导航：** 需用 Espressif 的 llvm-project fork 自建支持 Xtensa 的 LLVM，再据此编译安装 ccls；在 `WORKSPACE_HOME` 放 `.ccls-root` 和 `.ccls`，指定 `--target=xtensa-esp32` 与 xtensa 工具链路径，编辑器侧指向 `compile_commands.json`（读 Bootloader 代码要用 bootloader 目录下的那份）。
> - **QEMU 模拟：** 编译 Espressif QEMU fork（`xtensa-softmmu`），以 8MB 空文件当 SPI flash、124 字节文件当 eFuse；GPIO strap 置 `0x0f` 进入 flash 下载模式，配合 `ESPPORT=socket://localhost:5555 idf.py flash` 烧写，去掉 strap 即正常启动，`Ctrl-A x` 退出。
> - **调试与延伸用法：** QEMU 加 `-s -S` 等待调试器，用 `xtensa-esp32-elf-gdb` 连接 `:1234` 并复位、在 `app_main` 下断点单步；还可借 nbdkit 对任意 ESP32 设备的 flash 访问做中间人，用于挖掘 TOCTOU 类漏洞。

## Introduction

Since 2016 the ESP32 has steadily become a ubiquitous component to many devices in the world, from IoT consumer devices through to industrial systems. With this rise of popularity comes an increased relevance for security research opportunities to understand the evolving security features of the chipset and the knock-on security considerations for smart devices.

In recent years there has been some solid research articles targeting the ESP32, with a couple of notable examples being blog posts from [LimitedResults](https://twitter.com/limitedresults) that detail attacks such as [bypassing the secure boot using fault injection](https://limitedresults.com/2019/09/pwn-the-esp32-secure-boot/) and [achieving a full readout of FEK and SBK via voltage glitching](https://limitedresults.com/2019/11/pwn-the-esp32-forever-flash-encryption-and-sec-boot-keys-extraction/). If reading such posts or watching their [Blackhat presentation](https://www.youtube.com/watch?v=vwwTC_ivG00) triggers an aspiration for similar levels of pwnage, going down the path of following a guide such as [Espressif Get Started guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/index.html) is a sensible start. However, you may quickly find most guides will create an environment that miss a couple of features that come in handy when getting into the weeds of vulnerability research.

In this post we share a guide that adds some key features for security auditors to a Linux test environment for [Espressif’s IoT Development Framework (esp-idf)](https://github.com/espressif/esp-idf), which is the defacto development framework used by projects targeting the ESP32 series of microcontrollers. The environment includes an LSP server which is useful for code review, as well as an emulator for the ESP32 MCU/eFuses which enables rapid build, test, and debugging of framework components without requiring a physical device.

The instructions assume you’re running [Ubuntu Linux 20.04 LTS](https://releases.ubuntu.com/20.04/) on x64, but will work on other distros too with minor adjustments. The instructions also assume you have the following environment variables `SRC_HOME`, `WORKSPACE_HOME`, and `PROJ_HOME` configured, which should look something like the following:

```bash
# Where to download code and inc. dependencies
export SRC_HOME='${HOME}/src'
# Where to put our 'workspace' related repos
export WORKSPACE_HOME='${SRC_HOME}/audit'
# Where to put our demo/target project
export PROJ_HOME='${WORKSPACE_HOME}/hello_world'
```

As we’ll be building lots of projects from source and running CPU intensive tasks, you should ensure your computer has decent resources available. The author has used a VM with 4 cores, 8GB RAM + swap, and 128GB disk space available.

## Espressif IoT Development Framework (ESP-IDF)

The most accurate information on downloading and installing esp-idf is found in the official docs at [https://idf.espressif.com/](https://idf.espressif.com/). However, you can run the following commands to get set up quickly, which will install dependencies and clone the esp-idf framework repo. It will also install cross-compiler/debug toolchains which target the Tensilica Xtensa ISA (ESP32 CPU):

**Note:** This will also copy a `hello_world` project from the esp-idf examples into your `${PROJ_HOME}` directory. You could use any example/real-world project you like though.

```bash
sudo apt-get install -y git wget jq flex bison gperf python3 python3-pip python3-setuptools python3-venv cmake ninja-build ccache libffi-dev libssl-dev dfu-util libusb-1.0-0 && \
git clone --recursive https://github.com/espressif/esp-idf.git ${WORKSPACE_HOME}/esp-idf/ && \
${WORKSPACE_HOME}/esp-idf/install.sh esp32 && \
cp -r ${WORKSPACE_HOME}/esp-idf/examples/get-started/hello_world ${PROJ_HOME}
```

Once you have the esp-idf framework and toolchains installed, you will need to run the following command to configure your `PATH` and other environment variables:

```bash
source ${WORKSPACE_HOME}/esp-idf/export.sh
```

## hello world project configuration

The next step is to configure your project which is located in `${PROJ_HOME}`. The first thing you’ll need to do is set the target MCU for the project, which in our case will be `esp32`:

```bash
idf.py -C ${PROJ_HOME} set-target esp32
```

Before building the code you can configure project components, peripherals, and boot related settings by running `idf.py -C ${PROJ_HOME} menuconfig`. Once the project is configured to your liking, you can build with the following command (`CMAKE_EXPORT_COMPILE_COMMANDS=1` will create a `compile_commands.json` file which is used by our language server later):

```bash
CMAKE_EXPORT_COMPILE_COMMANDS=1 idf.py -C ${PROJ_HOME} build
```

![idf.py build output](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f59db0c01b4cb01f.gif)

idf.py build output

## Language Server Protocol (LSP)

The next step is to configure a language server, which will allow us to easily navigate the projects codebase with accuracy when using features like goto definition and find references. My preferred language server for C/C++ code is [ccls](https://github.com/MaskRay/ccls). However, before we can use it we’ll need to build our own version of LLVM which supports the Xtensa architecture. Fortunately, this is straightforward as Espressif provide a llvm-project fork found [here](https://github.com/espressif/llvm-project). We just need to run the following commands to clone that repo and build LLVM:

```bash
git clone https://github.com/espressif/llvm-project.git ${SRC_HOME}/llvm-project &&\
cd ${SRC_HOME}/llvm-project && \
cmake -S llvm -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
-DLLVM_ENABLE_PROJECTS='clang;clang-tools-extra' -DLLVM_TARGETS_TO_BUILD=Xtensa \
-DLLVM_EXPERIMENTAL_TARGETS_TO_BUILD=Xtensa && \
ninja -C build
```

Assuming your LLVM built without errors, you can then proceed to clone ccls and build/link against our LLVM as shown in the following commands:

**Note:** It’s OK to ignore the error `fatal: No names found, cannot describe anything`.

```bash
git clone --depth=1 --recursive https://github.com/MaskRay/ccls ${SRC_HOME}/ccls && \
cd ${SRC_HOME}/ccls && \
cmake -H. -BRelease -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=${HOME}/src/llvm-project/build/ && \
cd Release && \
sudo make install
```

Now that your language server is built/installed, the next step is to configure it by creating a `.ccls` config file in your `${WORKSPACE_HOME}`. The settings we configure instruct ccls to use the `compile_commands.json` file generated by `idf.py build` to parse source files, while also giving some additional settings related to target architecture/headers which is needed for its LLVM backend:

```bash
touch ${WORKSPACE_HOME}/.ccls-root
cat > ${WORKSPACE_HOME}/.ccls<<EOF
%compile_commands.json
--target=xtensa-esp32
--gcc-toolchain=$(echo ${PATH} | tr ':' '\n' | grep xtensa-esp32-elf | xargs dirname)
EOF
```

## Editor Configuration

**9/06/22 Update:** In retrospect, using vscode isn’t the best example of why we’re using ccls 😅 The author actually uses Emacs, where vscode-cpptools [isn’t an option](https://github.com/microsoft/vscode-cpptools/issues/2679).

The final step in configuring LSP is to configure your editor. We’ll use Visual Studio Code in our example, but many other editors are supported too (just see [here](https://github.com/MaskRay/ccls/wiki/Editor-Configuration)). Start by installing the `ccls-project.ccls` extension, and configure its `compilationDatabaseDirectory` setting to the location of your `compile_commands.json` file. It’s typically located in your `${PROJ_HOME}/build` directory, but if you’re interested in reading bootloader related code you will need to use the file under `${PROJ_HOME}/bootloader/`.

```bash
code --install-extension ccls-project.ccls && \
mkdir -p ${WORKSPACE_HOME}/.vscode && \
jq -n '.\'ccls.misc.compilationDatabaseDirectory\'=\'${PROJ_HOME}/build\'' > ${WORKSPACE_HOME}/.vscode/settings.json
```

At this point you’re ready to open your `${WORKSPACE_HOME}` folder in Visual Studio Code, and the ccls extension will automagically index the code base and give you enhanced navigation features as shown below:

![vscode ccls navigation example](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ae48ee3dd018bf56.gif)

vscode ccls navigation example

## Emulation

While it’s great being able to build your own firmware and develop with LSP support, there are some cases where it can be useful to run your firmware without needing to have a physical device. Fortunately, Espressif have forked [QEMU](https://github.com/espressif/qemu/wiki) and provide support for the ESP32. You’ll need to install dependencies and build from source as shown below:

**Note:** This will enable deb-src repos to your list of apt repositories.

```bash
sudo sed -i '/deb-src/s/^# //' /etc/apt/sources.list && \
sudo apt-get update && \
sudo apt-get install -y libgcrypt20-dev && \
sudo apt-get build-dep -y qemu && \
git clone https://github.com/espressif/qemu.git ${SRC_HOME}/qemu && \
cd ${SRC_HOME}/qemu && \
./configure --target-list=xtensa-softmmu --enable-gcrypt --enable-debug --enable-sanitizers --disable-strip --disable-user --disable-capstone --disable-vnc --disable-sdl --disable-gtk && \
ninja -C build
```

The next step is to boot QEMU in “flash download mode” by setting a GPIO strap. We’ll also use an empty 8MB file to act as SPI flash memory, and another 124 byte file to act as eFuse storage.

```bash
truncate ${PROJ_HOME}/qemu_flash.bin -s 8M && \
truncate ${PROJ_HOME}/qemu_efuse.bin -s 124 && \
${SRC_HOME}/qemu/build/qemu-system-xtensa -nographic \
-machine esp32 \
-drive file=${PROJ_HOME}/qemu_flash.bin,if=mtd,format=raw \
-drive file=${PROJ_HOME}/qemu_efuse.bin,if=none,format=raw,id=efuse \
-global driver=nvram.esp32.efuse,property=drive,value=efuse \
-global driver=esp32.gpio,property=strap_mode,value=0x0f \
-serial tcp::5555,server,nowait
```

In another terminal window, we can flash our firmware to the VM with the following command:

```bash
ESPPORT=socket://localhost:5555 idf.py -C ${PROJ_HOME} flash
```

If everything goes well you should see something like the following:

![qemu-system-xtensa firmware download mode and idf.py flash](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/962585e5fe8afbf7.gif)

qemu-system-xtensa firmware download mode and idf.py flash

Finally, you can now run your newly flashed firmware by launching QEMU in normal boot mode with the following command:

**Note:** You can quit QEMU by typing `Ctrl-A x`. Other useful information on running QEMU can be found in the Espressif wiki at [wiki](https://github.com/espressif/qemu/wiki).

```bash
${SRC_HOME}/qemu/build/qemu-system-xtensa -nographic \
-machine esp32 \
-drive file=${PROJ_HOME}/qemu_flash.bin,if=mtd,format=raw \
-drive file=${PROJ_HOME}/qemu_efuse.bin,if=none,format=raw,id=efuse \
-global driver=nvram.esp32.efuse,property=drive,value=efuse
```

![qemu-system-xtensa hello world output](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da212e4ef8dc7073.gif)

qemu-system-xtensa hello world output

## Debugging

Debugging firmware in QEMU is actually pretty straight forward, only requiring you to add the `-s -S` command line arguments as shown below:

```bash
${SRC_HOME}/qemu/build/qemu-system-xtensa -nographic \
-machine esp32 \
-s -S \
-drive file=${PROJ_HOME}/qemu_flash.bin,if=mtd,format=raw \
-drive file=${PROJ_HOME}/qemu_efuse.bin,if=none,format=raw,id=efuse \
-global driver=nvram.esp32.efuse,property=drive,value=efuse
```

QEMU will wait for your debugger to attach before continuing, which you can do with the following command:

```bash
xtensa-esp32-elf-gdb ${PROJ_HOME}/build/hello_world.elf \
-ex 'target remote :1234' \
-ex 'monitor system_reset' \
-ex 'tb app_main' \
-ex 'c'
```

If everything goes well you’ll be single-stepping in no time:

![xtensa-esp32-elf-gdb example](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e2536595dcd9f955.gif)

xtensa-esp32-elf-gdb example

## Recap

In this post we’ve shared how to set up a useful audit environment for security researchers interested in learning more about ESP32 and the esp-idf framework. Navigating complex code-bases with many compile-time options becomes a refreshingly smoother process using the configured language server. In some instances where a vulnerability is discovered or runtime debugging would be useful, it’s also possible to run your ESP32 firmware in QEMU, which comes with a bunch of additional advantages.

It’s worth noting that it’s possible to use QEMU to emulate firmware pulled directly from external flash of arbitrary ESP32 devices. This provides lots of advantages for bug hunting, for example one could use [nbdkit](https://github.com/libguestfs/nbdkit) to Person-in-the-middle (PITM) flash access in the pursuit of finding TOCTOU issues.

That’s all for now folks, thanks for reading and happy hacking!
