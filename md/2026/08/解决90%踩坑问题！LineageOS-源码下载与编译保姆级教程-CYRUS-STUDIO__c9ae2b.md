---
title: 解决90%踩坑问题！LineageOS 源码下载与编译保姆级教程 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E8%A7%A3%E5%86%B390%E8%B8%A9%E5%9D%91%E9%97%AE%E9%A2%98lineageos-%E6%BA%90%E7%A0%81%E4%B8%8B%E8%BD%BD%E4%B8%8E%E7%BC%96%E8%AF%91%E4%BF%9D%E5%A7%86%E7%BA%A7%E6%95%99%E7%A8%8B/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:19:15+08:00
trace_id: c8d12acb-e169-4153-b8d3-544dcbf7d315
content_hash: 5ec6753324b985f6d95d6b9b7260086432076f3a571a3511c6ef6ec9e81d1e91
status: synced
tags:
  - LineageOS
  - Android源码编译
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: |-
  解决 LineageOS 源码下载与编译全流程，耗时约 150GB 至 300GB 磁盘，重点破解国内镜像、大小写敏感文件系统、内存不足等踩坑点。  
  - **磁盘与容量：** 源码约需 150GB，编译完成约 300GB；WSL 下需用 ext4 镜像挂载到 /mnt/case_sensitive 解决大小写敏感问题，并可通过 dd/resize2fs/truncate 扩容或缩容。  
  - **镜像与下载：** 设置 REPO_URL 为清华镜像，并通过 ~/.gitconfig 把 googlesource、github 等地址替换到国内镜像；若 webview 同步失败，需删除 external/chromium-webview/prebuilt 后移除镜像改用 GitHub 同步。  
  - **设备与厂商仓库：** 在 .repo/local_manifests/wayne.xml 手动声明 Device/Kernel/Common/Vendor 仓库；vendor 闭源文件可从 TheMuppets 仓库 clone，或用设备端 extract-files.sh 配合 proprietary-files.txt 提取。  
  - **编译环境：** 编译要求至少 16GB 内存，不足可创建 swap 并写入 /etc/fstab；WSL 默认内存为物理内存 50%，可通过 .wslconfig 的 memory 项调整。  
  - **常见错误修复：** sepolicy 重复 genfscon 条目导致编译失败时，需编辑 device/xiaomi/sdm660-common/sepolicy/vendor/genfs_contexts 删除重复行，然后 make clean 重新 brunch；成品 zip 在 out/target/product/wayne 下，通过 Recovery 格式化后用 adb sideload 刷入。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3b275244-d011-814f-b259-ce878b2928d8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 解决 LineageOS 源码下载与编译全流程，耗时约 150GB 至 300GB 磁盘，重点破解国内镜像、大小写敏感文件系统、内存不足等踩坑点。  
> - **磁盘与容量：** 源码约需 150GB，编译完成约 300GB；WSL 下需用 ext4 镜像挂载到 /mnt/case_sensitive 解决大小写敏感问题，并可通过 dd/resize2fs/truncate 扩容或缩容。  
> - **镜像与下载：** 设置 REPO_URL 为清华镜像，并通过 ~/.gitconfig 把 googlesource、github 等地址替换到国内镜像；若 webview 同步失败，需删除 external/chromium-webview/prebuilt 后移除镜像改用 GitHub 同步。  
> - **设备与厂商仓库：** 在 .repo/local_manifests/wayne.xml 手动声明 Device/Kernel/Common/Vendor 仓库；vendor 闭源文件可从 TheMuppets 仓库 clone，或用设备端 extract-files.sh 配合 proprietary-files.txt 提取。  
> - **编译环境：** 编译要求至少 16GB 内存，不足可创建 swap 并写入 /etc/fstab；WSL 默认内存为物理内存 50%，可通过 .wslconfig 的 memory 项调整。  
> - **常见错误修复：** sepolicy 重复 genfscon 条目导致编译失败时，需编辑 device/xiaomi/sdm660-common/sepolicy/vendor/genfs_contexts 删除重复行，然后 make clean 重新 brunch；成品 zip 在 out/target/product/wayne 下，通过 Recovery 格式化后用 adb sideload 刷入。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 一、源码下载

-   LineageOS官网： [https://lineageos.org/](https://lineageos.org/)
    
-   LineageOS源码 github 地址： [https://github.com/LineageOS/android](https://github.com/LineageOS/android)
    
-   LineageOS源码国内镜像地址： [https://mirrors.tuna.tsinghua.edu.cn/help/lineageOS/](https://mirrors.tuna.tsinghua.edu.cn/help/lineageOS/)
    

源码大概需要150GB的硬盘空间，编译完成差不多300G

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ed8afca7739ab7fe.png)](data:image/png;base64,inline-27202B)

## 1\. 配置git

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

## 2\. 安装 repo

```bash
mkdir ~/bin
PATH=~/bin:$PATH
curl https://storage.googleapis.com/git-repo-downloads/repo > ~/bin/repo
chmod a+x ~/bin/repo
```

## 3\. 安装 Git LFS

```bash
sudo apt install git-lfs
git lfs install
```

## 4\. 安装 Android SDK Platform-Tools

在 Linux 中配置 [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools?hl=zh-cn) ，可以按照以下步骤进行

### 4.1 下载 Android SDK Platform-Tools：

```bash
# cd 到存放 platform-tools 的目录
cd /mnt/case_sensitive
# 下载 platform-tools
wget https://dl.google.com/android/repository/platform-tools-latest-linux.zip
# 解压 platform-tools
unzip platform-tools-latest-linux.zip
```

### 4.2 配置环境变量：

为了在任何地方都能使用 adb 和 fastboot 命令，你需要将 platform-tools 目录添加到你的 PATH 中。

编辑 ~/.bashrc 文件

```
nano ~/.bashrc
```

在文件末尾添加以下行

```ruby
export PATH=$PATH:/mnt/case_sensitive/platform-tools
```

然后重新加载.bashrc 文件

```
source ~/.bashrc
```

### 4.3 验证配置

你可以通过以下命令检查 adb 是否配置成功

```
adb version
```

测试连接设备，确保你的 Android 设备已经通过 USB 连接，并且启用了开发者模式和 USB 调试。

```
adb devices
```

这将列出已连接的设备。

## 5\. 镜像设置

找到 repo 所在路径

```
which repo
```

编辑 repo

```
nano /home/cyrus/bin/repo
```

 [![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e711e37db29edb51.png)](data:image/png;base64,inline-64606B)可以看到repo会优先取环境变量中的REPO_URL，否则默认使用googlesource

Ctrl +X 退出nano

通过下面的脚本设置 REPO_URL 环境变量的值为清华大学镜像源，解决国内访问不了 googlesource 问题，并且修改.gitconfig，把访问 LineageOS 仓库的 url 替换为使用清华大学镜像源。

add_mirrors.sh（设置镜像）

```bash
#!/bin/bash

export REPO_URL=https://mirrors.tuna.tsinghua.edu.cn/git/git-repo/
echo "REPO_URL="$REPO_URL

# 定义要添加的配置
config=$(cat <<EOF
[url "https://mirrors.tuna.tsinghua.edu.cn/git/git-repo"]
    insteadof = https://gerrit.googlesource.com/git-repo
[url "https://mirrors.tuna.tsinghua.edu.cn/git/lineageOS/"]
    insteadof = https://review.lineageos.org/
[url "https://mirrors.tuna.tsinghua.edu.cn/git/AOSP/"]
    insteadof = https://android.googlesource.com/
[url "https://mirrors.tuna.tsinghua.edu.cn/git/lineageOS/LineageOS/"]
    insteadof = https://github.com/LineageOS/
EOF
)

# 检查配置是否已存在于 ~/.gitconfig
if grep -q "https://mirrors.tuna.tsinghua.edu.cn/git/git-repo" ~/.gitconfig; then
    echo "URL替换已经存在，未进行重复添加。"
else
    # 如果配置不存在，添加到 ~/.gitconfig
    echo "$config" >> ~/.gitconfig
    echo "URL替换已添加到 ~/.gitconfig"
fi


cat ~/.gitconfig 
```

remove_mirrors.sh（移除镜像）

```bash
#!/bin/bash

unset REPO_URL
echo "REPO_URL="$REPO_URL

# 使用sed命令删除整个URL配置块，包括URL和相关的instedof行
sed -i '/\[url "https:\/\/mirrors\.tuna\.tsinghua\.edu\.cn\/git\/git-repo"\]/,+1d' ~/.gitconfig
sed -i '/\[url "https:\/\/mirrors\.tuna\.tsinghua\.edu\.cn\/git\/lineageOS\/"\]/,+1d' ~/.gitconfig
sed -i '/\[url "https:\/\/mirrors\.tuna\.tsinghua\.edu\.cn\/git\/AOSP"\]/,+1d' ~/.gitconfig
sed -i '/\[url "https:\/\/mirrors\.tuna\.tsinghua\.edu\.cn\/git\/lineageOS\/LineageOS"\]/,+1d' ~/.gitconfig

echo "URL替换已从 ~/.gitconfig 中移除"

cat ~/.gitconfig
```

给脚本文件增加执行权限

```
chmod +x add_mirrors.sh remove_mirrors.sh
```

设置使用镜像

```
./add_mirrors.sh
```

## 6\. 下载源码

创建目录

```
mkdir lineage-17.1
```

进入到 lineageos 目录

```
cd lineage-17.1
```

如果可正常访问 github，使用下面的命令初始化 repo

```
repo init -u https://github.com/LineageOS/android.git -b lineage-17.1 --git-lfs --depth=1
```

否则，使用清华大学镜像初始化 repo，并修改 default.xml

```
repo init -u https://mirrors.tuna.tsinghua.edu.cn/git/lineageOS/LineageOS/android.git -b lineage-17.1 --git-lfs --depth=1\
```

最后，同步源码

```
repo sync
```

或者使用下面命令下载浅克隆的源码

```
repo sync --no-clone-bundle --current-branch --no-tags -j$(nproc)
```

这会浅克隆当前分支最新的 LineageOS 源码，节省下载时间和空间。

## 7\. 解决 webview 同步失败问题

```bash
error: Unable to fully sync the tree
error: Checking out local projects failed.
Failing repos:
external/chromium-webview/prebuilt/arm
external/chromium-webview/prebuilt/arm64
external/chromium-webview/prebuilt/x86
external/chromium-webview/prebuilt/x86_64
Try re-running with "-j1 --fail-fast" to exit at the first error.
================================================================================
Repo command failed due to the following `SyncError` errors:
Cannot initialize work tree for LineageOS/android_external_chromium-webview_prebuilt_arm
Cannot initialize work tree for LineageOS/android_external_chromium-webview_prebuilt_arm64
Cannot initialize work tree for LineageOS/android_external_chromium-webview_prebuilt_x86
Cannot initialize work tree for LineageOS/android_external_chromium-webview_prebuilt_x86_64
```

从镜像地址同步 weview 一直失败

删除 chromium-webview/prebuilt

```
rm -rf external/chromium-webview/prebuilt/*
```

执行 remove_mirrors.sh 移除镜像，开启代理，重新从 github 同步就可以了。

```
repo sync --no-clone-bundle --current-branch --no-tags -j$(nproc)
```

## 8\. 手动添加设备仓库

在.repo/local_manifests 创建 wayne.xml，手动添加 wayne（小米 6x）的设备配置仓库。

执行 nano.repo/local_manifests/wayne.xml 命令

```
mkdir .repo/local_manifests
nano .repo/local_manifests/wayne.xml
```

配置 Device tree、Common tree、Kernel、Vendor 仓库

```html
<manifest>
<remote  name="real_github"
           fetch="https://github.com" />

<project name="LineageOS-MI-A2-MI-6X/android_device_xiaomi_wayne" path="device/xiaomi/wayne" remote="real_github" revision="lineageos-17.1"/>
<project name="LineageOS-MI-A2-MI-6X/android_device_xiaomi_sdm660-common" path="device/xiaomi/sdm660-common" remote="real_github" revision="lineageos-17.1"/>
<project name="LineageOS-MI-A2-MI-6X/android_kernel_xiaomi_sdm660" path="kernel/xiaomi/sdm660" remote="real_github" revision="master"/>
<project name="LineageOS-MI-A2-MI-6X/android_vendor_xiaomi_sdm660-common" path="vendor/xiaomi/sdm660-common" remote="real_github" revision="master"/>
<project name="LineageOS-MI-A2-MI-6X/android_vendor_xiaomi_wayne-common" path="vendor/xiaomi/wayne-common" remote="real_github" revision="master"/>
</manifest>
```

其中：

-   name=“GitHub 用户名/仓库名称”
    
-   path 是存放代码的位置。
    

Kernel：内核是操作系统的核心，负责硬件与软件的交互。Android 内核是基于 Linux 内核开发的，负责管理设备的资源和硬件驱动。

Device Tree：设备树是一种硬件描述文件，用来告诉操作系统设备的硬件布局，避免内核代码与具体硬件的紧耦合。设备树通常位于 device/ 目录中，包含设备特定的配置。

Common Tree：通用树包含多个设备共享的通用代码和配置。例如，某些设备共享相同的硬件平台（如 sm7250），这些配置放在 Common Tree 中，避免重复代码。

Vendor Tree：Vendor Tree 包含特定设备或硬件供应商（如 Qualcomm、Xiaomi）提供的专有二进制驱动程序、库和其他软件组件。这些组件是设备能够正确运行的关键部分，特别是涉及专有硬件（如调制解调器、相机、GPU等）的功能。

Vendor Tree 通常包含在 vendor/ 目录中，是设备厂商提供的闭源组件。与 Kernel 和 Device Tree 不同，它涉及硬件相关的二进制文件和库，而不是内核或硬件描述。

完成后，运行 repo sync 同步源码

```
repo sync --no-clone-bundle --current-branch --no-tags -j$(nproc)
```

或者手动去 clone 一下

```bash
git clone https://github.com/LineageOS-MI-A2-MI-6X/android_device_xiaomi_wayne.git device/xiaomi/wayne
git clone https://github.com/LineageOS-MI-A2-MI-6X/android_device_xiaomi_sdm660-common.git device/xiaomi/sdm660-common
git clone https://github.com/LineageOS-MI-A2-MI-6X/android_kernel_xiaomi_sdm660.git kernel/xiaomi/sdm660
git clone https://github.com/LineageOS-MI-A2-MI-6X/android_vendor_xiaomi_sdm660-common.git vendor/xiaomi/sdm660-common
git clone https://github.com/LineageOS-MI-A2-MI-6X/android_vendor_xiaomi_wayne-common.git vendor/xiaomi/wayne-common
```

## 二、代理设置

由于在编译过程需要连接 github 下载设备树和内核，所以需要先设置一下代理。

关于 Linux 下代理设置可以参考 [这篇文章](https://cyrus-studio.github.io/blog/posts/linux-%E4%B8%8B%E9%85%8D%E7%BD%AE-clash-%E4%BB%A3%E7%90%86%E8%AF%A6%E7%BB%86%E6%95%99%E7%A8%8B%E8%A7%A3%E5%86%B3%E4%B9%B1%E7%A0%81%E8%87%AA%E5%8A%A8%E8%84%9A%E6%9C%AC%E7%9B%B4%E8%BF%9E%E9%85%8D%E7%BD%AE/) 。

如果你想在 WSL 内完美融合代理，可以在 Windows 的用户目录 C:\\Users\\<用户名>.wslconfig 中配置镜像网络（Mirrored mode，需 Win11 新版 WSL）：

```
[wsl2]
networkingMode=mirrored
```

使用 curl 测试外网连通性与 IP 地址

```
curl -I https://www.google.com
```

-   **成功现象**：返回 HTTP/2 200 或 HTTP/1.1 200 OK 响应头。
    
-   **失败现象**：长时间卡住超时（Timeout）或提示 Connection refused。
    

检查代理出口 IP，通过命令行查询你当前的“公网 IP 地址”及其地理位置信息

```
curl ip.sb
# 或
curl cip.cc
```

-   **验证标准**：如果返回的是你 **代理服务器（节点）的 IP**，而不是你本地宽带的 IP，说明代理转发完全正常！

## 三、设置缓存

创建缓存目录

```
mkdir -p /mnt/case_sensitive/ccache
```

把缓存配置添加到环境变量配置文件.bashrc结尾

```
cat >> ~/.bashrc <<EOF
# 使用缓存
export USE_CCACHE=1
# ccache文件路径
export CCACHE_EXEC=/usr/bin/ccache
# 设置缓存目录
export CCACHE_DIR=/mnt/case_sensitive/ccache
EOF
```

执行下面命令使配置生效

```
source ~/.bashrc
```

设置最大缓存空间为 50GB

```
ccache -M 50G
```

启用 ccache 的压缩功能，可以减少缓存文件所占用的磁盘空间

```
ccache -o compression=true
```

## 四、源码编译

## 1\. 初始化编译环境

```
# 初始化编译环境
source build/envsetup.sh

# 设置编译目标
# 如果本地没有设备仓库将会从LineageOS仓库中下载设备的Device tree和Kernel
breakfast wayne
```

## 2\. 补充厂商文件

由于厂商文件是闭源的，而且版权原因不能直接放进去， Lineageos 没有直接提供厂商文件。

执行 breakfast 命令后如果提示缺少 vendor

```lua
In file included from build/make/core/config.mk:291:
In file included from build/make/core/envsetup.mk:266:
vendor/xiaomi/wayne-common/wayne-common-vendor.mk:782: error: _nic.PRODUCTS.[[device/xiaomi/wayne/lineage_wayne.mk]]: "vendor/xiaomi/wayne/wayne-vendor.mk" does not exist.
16:24:01 dumpvars failed with: exit status 1
In file included from build/make/core/config.mk:291:
In file included from build/make/core/envsetup.mk:266:
vendor/xiaomi/wayne-common/wayne-common-vendor.mk:782: error: _nic.PRODUCTS.[[device/xiaomi/wayne/lineage_wayne.mk]]: "vendor/xiaomi/wayne/wayne-vendor.mk" does not exist.
16:24:01 dumpvars failed with: exit status 1
```

根据错误提示可以通过以下2种方式之一补充对应的 vendor 文件

### 2.1 使用 TheMuppets 的厂商仓库

在 LineageOS 项目中，部分设备的厂商文件已经由社区维护，并保存在名为TheMuppets 的仓库中。

仓库地址： [https://github.com/orgs/TheMuppets/repositories](https://github.com/orgs/TheMuppets/repositories)

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/73faa3d48e972dcb.png)](data:image/png;base64,inline-131934B)

把 vendor 仓库 clone 到本地

```bash
git clone https://github.com/TheMuppets/proprietary_vendor_xiaomi_sdm660-common.git vendor/xiaomi/sdm660-common

git clone https://github.com/TheMuppets/proprietary_vendor_xiaomi_wayne-common.git vendor/xiaomi/wayne-common

git clone https://github.com/TheMuppets/proprietary_vendor_xiaomi_wayne.git vendor/xiaomi/wayne
```

### 2.2 从设备中提取

注意：此步骤要求设备已经安装当前编译分支对应的 LineageOS。（可以先刷机再提取）

现在确保你的设备通过 USB 线连接到计算机，并启用 adb调试和 root，并且位于 device/xiaomi/wayne 目录下

在这个目录下，通常可以找到两个关键文件：

-   extract-files.sh: 用于从设备或固件中提取厂商文件的脚本。
    
-   proprietary-files.txt: 该文件列出了设备所需的所有厂商文件。
    

运行 extract-files.sh 脚本

```
./extract-files.sh
```

厂商驱动文件将会自动拉取到 vendor/xiaomi 文件夹中。

## 3\. 开始编译

```
# 回到 Android 源码树的根目录
croot
# 开始编译
brunch wayne
```

## 五、解决WSL中编译提示文件系统不支持大小写敏感问题

```sql
21:38:08 ************************************************************
21:38:08 You are building on a case-insensitive filesystem.
21:38:08 Please move your source tree to a case-sensitive filesystem.
21:38:08 ************************************************************
21:38:08 Case-insensitive filesystems not supported
```

## 1\. 创建一个区分大小写的文件系统

创建一个大小为300GB的ext4文件系统映像文件，并将其挂载到/mnt/case_sensitive，以提供一个区分大小写的文件系统

```bash
# 创建一个大小为300GB的空文件
dd if=/dev/zero of=/mnt/e/case_sensitive.img bs=1G count=300



# 将这个文件格式化为ext4文件系统
mkfs.ext4 /mnt/e/case_sensitive.img

# 创建一个新的挂载点目录
sudo mkdir /mnt/case_sensitive

# 将格式化后的文件挂载到新创建的挂载点
sudo mount /mnt/e/case_sensitive.img /mnt/case_sensitive

# 将你的LineageOS源码目录复制到新挂载的虚拟磁盘上
# -a: 归档模式，意味着递归复制目录，并且保留符号链接、权限、时间戳、拥有者等信息。
# -v: 显示详细信息。
# --progress: 显示文件传输进度。
sudo rsync -av --progress /mnt/e/android_source_code/lineageos/ /mnt/case_sensitive/lineageos/
# 或
# 将你的LineageOS源码目录移动到新挂载的虚拟磁盘上
sudo mv /mnt/e/android_source_code/lineageos /mnt/case_sensitive/

cd /mnt/case_sensitive/lineageos
```

为了确保 case_sensitive.img 在每次系统启动时自动挂载到 /mnt/case_sensitive。

1.  打开 /etc/fstab 文件

```
sudo nano /etc/fstab
```

2.  添加以下行

```
/mnt/e/case_sensitive.img  /mnt/case_sensitive  ext4  loop  0  0
```

## 2\. 在 windows 下访问 case_sensitive

访问路径如下：

```
\\wsl.localhost\Ubuntu\mnt\case_sensitive
```

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d8b38e70fc9c0258.png)](data:image/png;base64,inline-138674B)

确保 Windows 用户对该目录有足够的权限。你可能需要在 WSL 中设置一些权限

```
sudo chmod -R 777 /mnt/case_sensitive
```

这样，你应该可以在 Windows 中访问和使用 WSL 中的大小写敏感文件系统。

## 3\. case_sensitive.img 扩容

如果 case_sensitive.img 空间不够用如何扩容？

1.  卸载文件系统

```
sudo umount /mnt/case_sensitive
```

这一行命令卸载当前挂载的 case_sensitive.img 文件系统，以确保文件系统在扩展过程中不被使用。

2.  增加镜像文件的大小

```
dd if=/dev/zero bs=1G count=100 >> /mnt/e/case_sensitive.img
```

参数说明：

-   dd 命令用于向 case_sensitive.img 文件追加 100GB 空间。
    
-   if=/dev/zero：表示输入文件是 /dev/zero，一个无限输出零字节的设备文件。
    
-   bs=1G：表示块大小为 1GB。
    
-   count=100：表示写入 100 个 1GB 的块。
    
-   > > /mnt/e/case_sensitive.img：表示将输出追加到现有的 case_sensitive.img 文件。
    

3.  检查和修复文件系统

```
sudo e2fsck -f /mnt/e/case_sensitive.img
```

参数说明：

-   e2fsck 命令用于检查和修复 ext2/ext3/ext4 文件系统。
    
-   \-f 选项强制进行文件系统检查，即使文件系统看起来是干净的。
    

4.  调整文件系统大小

```
sudo resize2fs /mnt/e/case_sensitive.img
```

resize2fs 命令用于调整 ext2/ext3/ext4 文件系统的大小以适应新的镜像文件大小。

5.  检查分区表

首先，需要使用 parted 来检查并调整分区表。

```
sudo parted /mnt/e/case_sensitive.img
```

在 parted 中执行以下命令

```
(parted) print
```

这将打印出当前的分区信息。然后，使用以下命令调整分区大小

```
(parted) resizepart 1 100%
```

退出 parted

```
(parted) quit
```

6.  重新挂载文件系统

```
sudo mount /mnt/e/case_sensitive.img /mnt/case_sensitive
```

通过这些步骤，你可以扩展 case_sensitive.img 的空间而不影响现有数据。

## 4\. 查看磁盘空间大小

```
cyrus:/mnt/case_sensitive$ df -h /mnt/case_sensitive
Filesystem      Size  Used Avail Use% Mounted on
/dev/loop0      393G  212G  162G  57% /mnt/case_sensitive
```

-   Size：总空间
    
-   Used：已用
    
-   Avail：剩余
    
-   Use%：使用率
    

## 5\. 减少 case_sensitive.img 容量

比如现在是 393G，想减少到 290G

```
cyrus:/mnt/case_sensitive$ df -h /mnt/case_sensitive
Filesystem      Size  Used Avail Use% Mounted on
/dev/loop0      393G  212G  162G  57% /mnt/case_sensitive
```

先卸载文件系统，释放 loop 关联：

```
# 1. 确保卸载挂载点
sudo umount /mnt/case_sensitive

# 2. 断开所有可能占用的旧 loop 设备
sudo losetup -D
```

假设你的镜像文件路径是 /mnt/e/case_sensitive.img，强制检查镜像文件：

```
cyrus:~$ sudo e2fsck -f /mnt/e/case_sensitive.img
e2fsck 1.46.5 (30-Dec-2021)
/mnt/e/case_sensitive.img: recovering journal
Pass 1: Checking inodes, blocks, and sizes
Inode 8787269 extent tree (at level 1) could be shorter.  Optimize<y>? yes

Pass 1E: Optimizing extent trees
Pass 2: Checking directory structure
Pass 3: Checking directory connectivity
Pass 4: Checking reference counts
Pass 5: Checking group summary information

/mnt/e/case_sensitive.img: ***** FILE SYSTEM WAS MODIFIED *****
/mnt/e/case_sensitive.img: 2291625/26214400 files (2.3% non-contiguous), 57333409/104857600 blocks
```

缩小 ext4 文件系统至 290G：

```
cyrus:~$ sudo resize2fs /mnt/e/case_sensitive.img 290G
resize2fs 1.46.5 (30-Dec-2021)
Resizing the filesystem on /mnt/e/case_sensitive.img to 76021760 (4k) blocks.
The filesystem on /mnt/e/case_sensitive.img is now 76021760 (4k) blocks long.
```

截断物理镜像文件大小（ truncate ），缩小内部文件系统后，将外部文件截断至大约 295G（留 5G 冗余防止边界截断）：

```
truncate -s 295G /mnt/e/case_sensitive.img
```

处理完毕后，重新将镜像文件挂载回原目录：

```
# 1. 重新执行 fstab 中的全部挂载
sudo mount -a

# 2. 启用 fstab 中的 swap
sudo swapon -a
```

此时查看 df -h，文件系统的大小应该已经成功缩减到了 290G 左右！

```
cyrus:/mnt/case_sensitive$ df -h /mnt/case_sensitive
Filesystem      Size  Used Avail Use% Mounted on
/dev/loop0      285G  212G   59G  79% /mnt/case_sensitive
```

## 6\. 解决 case_sensitive.img 过度裁剪问题

```
cyrus@:/mnt/case_sensitive$ sudo mount -a
mount: /mnt/case_sensitive: wrong fs type, bad option, bad superblock on /dev/loop0, missing codepage or helper program, or other error.
```

出现 wrong fs type, bad option, bad superblock 错误，说明 **底层镜像文件 /mnt/e/case_sensitive.img 被过度裁剪（截断）了**。

在执行 truncate -s 292G 时，因为 Linux 内部算出来的 290G（76021760 blocks \* 4KB）或者底层扇区对齐的原因，导致 292G 的文件实际边界切掉了文件系统最末尾的关键元数据（例如备份 Superblock、Group Descriptors 等），使得 ext4 识别失效。

不过别担心，实际数据（约 212G）和大部分 ext4 结构都是完好无损的。只要把镜像文件“放大”拉伸回去，Superblock 就能自动恢复识别。

先把镜像文件的大小恢复到一个较大的安全范围（例如 300G），让被裁掉的末尾结构“露”出来：

```
# 1. 确保释放 loop 绑定
sudo losetup -D

# 2. 将镜像文件重新放大回 300G（物理扩展，不会破坏现有数据）
truncate -s 300G /mnt/e/case_sensitive.img
```

放大文件后，运行 e2fsck 让系统自动修正文件系统头和尾部的 Block 数量记录：

```
sudo e2fsck -fy /mnt/e/case_sensitive.img
```

将 ext4 文件系统设为 290G：

```
sudo resize2fs /mnt/e/case_sensitive.img 290G
```

之前保留 2G 稍微有点紧，这次直接保留到 **295G** （只比预想的少缩 5G，但能确保 100% 稳妥）：

```
truncate -s 295G /mnt/e/case_sensitive.img
```

现在再次测试挂载：

```
# 1. 执行 mount -a 挂载
sudo mount -a

# 2. 检查挂载状态
df -h /mnt/case_sensitive
```

## 六、解决编译提示内存不足

```sql
21:38:07 You are building on a machine with 7.62GB of RAM
21:38:07
21:38:07 The minimum required amount of free memory is around 16GB,
21:38:07 and even with that, some configurations may not work.
21:38:07
21:38:07 If you run into segfaults or other errors, try reducing your
21:38:07 -j value.
21:38:07 ************************************************************
```

创建虚拟内存

```bash
# 创建一个大小为8GB的文件，路径为/mnt/case_sensitive/swapfile。fallocate是一个快速创建大文件的工具。
sudo fallocate -l 8G /mnt/case_sensitive/swapfile

# 更改/swapfile的权限，使其只有所有者（root）有读写权限。这是为了安全，防止其他用户访问交换文件。
sudo chmod 600 /mnt/case_sensitive/swapfile

# 将/mnt/case_sensitive/swapfile初始化为交换空间。这个命令会设置文件系统标记，使操作系统知道这是一个交换文件。
sudo mkswap /mnt/case_sensitive/swapfile

# 启用/mnt/e/swapfile作为交换空间。这个命令会激活交换文件，使其可以被系统使用。
sudo swapon /mnt/case_sensitive/swapfile

# 查看交换空间的使用情况
swapon --show
```

如何内存还不够？

将虚拟内存大小从8G改为16G

```bash
# 关闭当前的交换文件
sudo swapoff /mnt/case_sensitive/swapfile

# 创建一个新的16G交换文件
sudo fallocate -l 16G /mnt/case_sensitive/swapfile

# 将交换文件的权限设置为600，以确保只有root用户可以读取和写入该文件。
sudo chmod 600 /mnt/case_sensitive/swapfile

# 将交换文件格式化为swap格式
sudo mkswap /mnt/case_sensitive/swapfile

# 启用新的交换文件
sudo swapon /mnt/case_sensitive/swapfile

# 使用 swapon --show 或 free -h 命令验证新的交换文件是否已正确启用。
swapon --show
# 或
free -h
```

为了确保 /mnt/case_sensitive/swapfile 在重启后仍然有效，将其添加到/etc/fstab文件中

```
echo '/mnt/case_sensitive/swapfile swap swap sw 0 0
' | sudo tee -a /etc/fstab
```

设置完成后再编译，如果真实物理内存没有超过16G，提示还会存在，但不影响正常编译。

WSL默认会设置最大可用内存为真实物理内存的50%，如果想修改WSL的最大可用内存可以通过修改.wslconfig 实现：

```
[wsl2]
memory=16GB
```

## 七、解决编译报错

## ‘duplicate entry for genfs entry \*’ at token ‘genfscon’

```swift
FAILED: out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/sepolicy_neverallows
/bin/bash -c "(ASAN_OPTIONS=detect_leaks=0 out/host/linux-x86/bin/checkpolicy -M -c             30 -o out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/sepolicy_neverallows.tmp out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/policy.conf ) && (out/host/linux-x86/bin/sepolicy-analyze out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/sepolicy_neverallows.tmp neverallow -w -f out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/policy_2.conf ||      ( echo \"\" 1>&2;      echo \"sepolicy-analyze failed. This is most likely due to the use\" 1>&2;      echo \"of an expanded attribute in a neverallow assertion. Please fix\" 1>&2;        echo \"the policy.\" 1>&2;      exit 1 ) ) && (touch out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/sepolicy_neverallows.tmp ) && (mv out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/sepolicy_neverallows.tmp out/target/product/wayne/obj/ETC/sepolicy_neverallows_intermediates/sepolicy_neverallows )"
device/xiaomi/sdm660-common/sepolicy/vendor/genfs_contexts:31:ERROR 'duplicate entry for genfs entry (sysfs, /devices/soc/800f000.qcom,spmi/spmi-0/spmi0-00/800f000.qcom,spmi:qcom,pm660@0:qcom,pm660_rtc/rtc)' at token 'genfscon' on line 85793:
# Touchscreen
genfscon proc /nvt_wake_gesture                                 u:object_r:proc_dt2w:s0
checkpolicy:  error(s) encountered while parsing configuration
```

在 sepolicy 配置文件中存在重复的 genfscon 条目。

路径 /devices/soc/800f000.qcom,spmi/spmi-0/spmi0-00/800f000.qcom,spmi:qcom,pm660@0:qcom,pm660_rtc/rtc 被定义了两次。

在 device/xiaomi/sdm660-common/sepolicy/vendor/genfs_contexts 文件中找到并移除重复定义的那一行。

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e4fd9065aa963c3c.png)](data:image/png;base64,inline-306298B)

清理缓存并重新编译

```
make clean
brunch wayne
```

## 八、编译完成

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6091c6bc02f50255.png)](data:image/png;base64,inline-252026B)

编译完成后可以在 out/target/product/wayne 目录下看到下面两个zip文件：

-   lineage-17.1-20240914-UNOFFICIAL-wayne.zip 是完整的 LineageOS ROM，通常用于全新安装或重刷设备。
    
-   lineage_wayne-ota-eng.cyrus.zip 是一个 OTA 更新包，可能用于增量更新现有的 LineageOS 安装，通常不用于首次刷机。
    

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/111c7a888d4e75ca.png)](data:image/png;base64,inline-150442B)

## 九、刷机

进入recovery，先格式化数据，再用 adb sideload 开始刷机

 [![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7180ceeccceaabdf.png)](data:image/png;base64,inline-350654B)等待刷机完成，重启系统。

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/126b4a6d7173db50.png)](data:image/png;base64,inline-626794B)

相关链接：

-   [教你从零刷入 LineageOS：Recovery + Sideload 全流程实操指南](https://cyrus-studio.github.io/blog/posts/%E6%95%99%E4%BD%A0%E4%BB%8E%E9%9B%B6%E5%88%B7%E5%85%A5-lineageosrecovery-+-sideload-%E5%85%A8%E6%B5%81%E7%A8%8B%E5%AE%9E%E6%93%8D%E6%8C%87%E5%8D%97/)
    
-   [https://wiki.lineageos.org/devices/wayne/build/](https://wiki.lineageos.org/devices/wayne/build/)
    
-   [\[ROM\]\[OTA\]\[10.x\] LineageOS 17.1 Unofficial \[wayne/ Mi 6X\]](https://xdaforums.com/t/rom-ota-10-x-lineageos-17-1-unofficial-wayne-mi-6x.3989193/)
