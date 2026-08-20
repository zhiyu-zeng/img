---
title: 【先知】docker cp 逃逸三部曲：从符号链接竞态到内核 openat2 包含
source: https://xz.aliyun.com/news/92699
source_host: xz.aliyun.com
clip_date: 2026-08-20T14:01:47+08:00
trace_id: f083db06-0511-4e10-999b-e8d29e68b1ce
content_hash: 76b3d5c671d1fcab77cd0b81389dc8d928c902ef2426f68b3c3f9a93aeffc1dc
status: synced
tags:
  - 先知
  - 漏洞分析
  - Linux安全
series: null
feed_source: 先知安全技术社区
ai_summary: TL;DR：docker cp 跨安全域的归档/解包设计从 2019 到 2026 接连被符号链接 TOCTOU、NSS 注入与字符串前缀检查绕过击穿，最终以内核 openat2/os.Root 强制路径包含收口。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c275244-d011-8188-aadd-c5cec784c02c
ioc:
  cves:
    - CVE-2017-1002101
    - CVE-2018-15664
    - CVE-2019-10152
    - CVE-2019-14271
    - CVE-2019-18466
    - CVE-2019-5736
    - CVE-2021-25741
    - CVE-2021-30465
    - CVE-2022-23648
    - CVE-2023-0778
    - CVE-2026-17106
    - CVE-2026-41567
    - CVE-2026-41568
    - CVE-2026-42306
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：docker cp 跨安全域的归档/解包设计从 2019 到 2026 接连被符号链接 TOCTOU、NSS 注入与字符串前缀检查绕过击穿，最终以内核 openat2/os.Root 强制路径包含收口。
> 
> - **根因：** docker cp 打包与解包跨越容器/宿主机两个安全域，隔离只约束“容器→主机”，主机进程访问容器文件系统必须在用户态自行保证不逃逸、不加载容器控制内容；CCS '23 称这类问题为 Pamir（路径误解析）。
> - **CVE-2018-15664：** 打包前 FollowSymlinkInScope 解析与真正 TarWithOptions 打开之间存在 TOCTOU，容器内用 renameat2(RENAME_EXCHANGE) 交换目录/符号链接可让 daemon 以 root 读写宿主机文件；修复为 spawn docker-tar/docker-untar 并 chroot 到容器根（18.09.7）。
> - **CVE-2019-14271：** docker-tar 在主机命名空间以 root 运行，chroot 后 tar 头构造调用 os/user 触发 glibc NSS dlopen，libnss_*.so 从容器内解析；恶意构造函数以宿主机 root 执行。修复层层加码：chroot 前预加载 NSS → fork archive/tar 禁用 Uname/Gname → nosysFileInfo/tar.FileInfoNames。
> - **CVE-2026-17106（CopyEscape）：** 打包端 WalkDir（判断目录）与 addTarFile 的 Lstat（判断类型）两次观察竞态，可产出“符号链接指向 /usr/bin + 其子项 runc”的归档；客户端检查 filepath.Join(targetPath) 却用原始 Linkname 创建绝对链接，字符串前缀≠路径包含，子项穿透逃出目标目录；sudo docker cp 可覆盖 /usr/bin/runc 提权 root。
> - **最终收口：** Docker 23.0 放弃 chroot 辅助进程，改 containerFSView（私有挂载命名空间+pivot_root）；go-archive v0.3.0 用 os.Root/openat2 RESOLVE_BENEATH 由内核强制解包包含性。结论：检查值必须等于使用值，用户态包含手段本质不完备，需原子化（openat2/fd 钉住）或冻结输入（复制前停容器）。

## 0\. 概述

`docker cp` 用于在容器与宿主机之间复制文件，是 CI/CD、调试与取证场景中的常用命令。  
2019 年至 2026 年间， `docker cp` 的归档管线先后暴露三个高危漏洞：

|     |     |     |
| --- | --- | --- |  
| CVE | 漏洞位置 | 影响  |
| CVE-2018-15664 | daemon 打包前的路径解析（TOCTOU） | 容器 → 宿主机文件系统任意读写 |
| CVE-2019-14271 | chroot 辅助进程 `docker-tar` 的动态库加载 | 容器 → 宿主机 root 代码执行 |
| CVE-2026-17106（CopyEscape） | 打包端的归档一致性与解包端的包含性 | 以运行 CLI 的用户权限在宿主机任意位置写入文件（ `sudo docker cp` 场景可提权为 root） |

这三个漏洞并非相互独立：它们源于同一设计缺陷—— `docker cp` 的打包与解包跨越容器与宿主机两个安全域，  
而安全边界在用户态无法被可靠地维持。历次修复只是把边界逐层迁移：无边界 → chroot 辅助进程 →  
进程内视图切换 + 客户端字符串检查 → 内核 openat2 包含。本文基于 moby/moby 源码分析三个漏洞的成因  
与完整触发链路（从输入到触发所经过的函数），并在第 4 章讨论 Docker 放弃 chroot 方案的原因。

文中所有文件与提交引用均给出 GitHub 链接，可对照源码核实。

> **阅读说明**：第 1 章为背景知识（不熟悉容器与文件系统基础的读者建议阅读）；第 2、3、5 章分别分析三个漏洞；  
> 第 4 章介绍 Docker 23.0 的架构变更及放弃 chroot 方案的原因；第 6–8 章为相关漏洞、时间线与总结。

* * *

## 1\. 背景知识

### 1.1 容器文件系统隔离的单向性

容器通过 Linux 内核的以下机制实现文件系统隔离：mount namespace 提供独立的挂载视图；  
pivot_root / chroot 将进程根目录切换到容器 rootfs。这套机制能阻止 **容器内进程** 访问宿主机文件系统，  
但存在一个方向性问题：

> 宿主机上运行的进程（包括 Docker daemon、CLI 及其调用的第三方组件）在访问容器文件系统时不受任何约束。

即隔离只约束了"容器 → 主机"方向，没有约束"主机 → 容器"方向。因此，凡是主机进程为了某种交互  
（copy、volume、export 等）而访问容器文件系统的场景，都必须由容器工具在用户态自行保证安全：  
路径解析不能逃出容器、不能加载容器内控制的执行内容。本文分析的三个漏洞均属于这一范畴。  
在论文CCS '23， [《Lost along the Way: Understanding and Mitigating Path-Misresolution Threats to Container Isolation》](https://doi.org/10.1145/3576915.3623154) 中  
将这类问题统称为 **Pamir（路径误解析）**，并指出用户态修复本质上无法根除该类风险（详见 4.5 节）。

### 1.2 docker cp 的归档管线与两条安全性质

`docker cp` 并非文件系统到文件系统的直接复制，其数据通路为：

```plain
容器内路径 ──daemon 遍历容器活跃文件系统──> tar 流 ──> CLI（或 API 调用方）在客户端解包
```

-   容器 → 主机： `GET /containers/{id}/archive` ，daemon 打包、客户端解包；
-   主机 → 容器： `PUT /containers/{id}/archive` ，客户端打包、daemon 在容器文件系统视图内解包；
-   早期 `POST /containers/{id}/copy` 已在 API v1.23 后移除（ [提交 b3a0ff9944](https://github.com/moby/moby/commit/b3a0ff994450e60890ac8a81e80bbd49004ac8b6) ）。

打包与解包发生在不同的进程、不同的安全域中：容器控制归档的内容，解包方以运行 `docker cp` 的用户的权限  
执行文件系统操作。因此安全模型必须同时维持两条性质：

1.  **一致性**：daemon 必须从容器文件系统产出一个自洽的归档（归档中的符号链接与其子项不能描述两个不同时刻的文件系统）；
2.  **包含性**：解包端必须把每个条目（以及符号链接跟随的结果）限制在用户指定的目标目录内。

三个漏洞分别击穿这两条性质的不同环节：CVE-2018-15664 击穿打包前的路径解析；  
CVE-2026-17106 同时击穿打包端的归档一致性与解包端的包含性。

### 1.3 符号链接解析的命名空间问题

符号链接（symlink）存储的是一个路径字符串，其含义取决于 **解析时进程的根目录视角**：

-   进程根目录为 `/` （宿主机视角）时， `escape -> /usr/bin` 指向宿主机 `/usr/bin` ；
-   进程被 chroot 到容器 rootfs 后，同样的链接指向容器内 `/usr/bin` 。

攻击者要做的，就是让宿主机进程在错误的视角下解析容器内的符号链接。

### 1.4 chroot 的作用与局限

`chroot` 将进程根目录切换到新目录，进程此后只能看到新根之下的文件。但需要注意两点：

1.  chroot 只改变文件视图，不改变进程的权限与能力——以 root 运行的进程 chroot 后仍然是 root；
2.  chroot 之后，进程按需加载的动态库、可执行文件都会从新根中解析——新根的属主可以决定进程加载什么。

因此 chroot 不是沙箱。这一局限直接导致 CVE-2019-14271（第 3 章）。

### 1.5 TOCTOU（检查-使用竞态）

TOCTOU（Time-of-Check to Time-of-Use）指"先检查、后使用"的模式中，检查与使用之间存在时间窗口，  
攻击者可在此窗口内改变检查对象的状态，使检查结果与使用时的实际情况不一致。容器文件系统是  
并发可变的输入：容器内进程可以在 daemon 的任意两次文件系统操作之间修改路径、替换目录、创建符号链接。  
CVE-2018-15664 与 CVE-2026-17106 的生产端竞态均属于 TOCTOU。

* * *

## 2\. CVE-2018-15664：路径解析与使用的 TOCTOU

### 2.1 机制

修复前（Docker ≤ 18.06.x），daemon 直接在宿主机的命名空间中对容器 rootfs（ `/var/lib/docker/...`）执行 tar。  
`daemon.ContainerArchivePath` 的处理流程（ [daemon/archive.go，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/daemon/archive.go) ）：

```plain
用户输入:  docker cp mycontainer:/var/logs /some/host/path
   │
   ▼ CLI  ——— GET /containers/{id}/archive?path=/var/logs ———▶ daemon
   ▼ daemon: daemon.ContainerArchivePath(name, path)
   │    └─ containerArchivePath(ctr, path)
   │         ├─ container.Lock()
   │         ├─ container.ResolvePath(path)                     // ① "安全解析"符号链接
   │         │     └─ symlink.FollowSymlinkInScope(join(Root, path), Root)   // [container/container.go:340，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/container/container.go#L340)
   │         ├─ container.StatPath(resolvedPath, absPath)       // ② stat（再次使用路径）
   │         ├─ archive.TarResourceRebaseOpts(...)              // ③ 计算 rebase 选项
   │         └─ archive.TarWithOptions(sourceDir, opts)         // ④ 打开并打包（最后一次使用路径）
```

`FollowSymlinkInScope` 将路径"当作进程在容器内"逐段解析，保证解析结果不逃出容器根目录。  
但解析（①）与真正打开路径（④）之间隔着 stat、rebase 计算等步骤，容器内的进程可以在这些步骤之间修改文件系统。  
若攻击者在①之后、④之前向路径中插入指向宿主机路径的符号链接，daemon 就会在宿主机视角下跟随它，  
以 root 身份读写宿主机任意文件。

2019-05-28，Aleksa Sarai（cyphar）在 [oss-security](http://www.openwall.com/lists/oss-security/2019/05/28/1) 公开该漏洞，  
披露时不存在任何已发布的修复版本。NVD 的描述直接指出了两种可行修复方向：

> ... daemon/archive.go does not do archive operations on a frozen filesystem (or from within a chroot).

### 2.2 攻击过程

cyphar 的 PoC 在容器内运行一个二进制，循环执行 `renameat2(RENAME_EXCHANGE)` ，将"指向 `/` 的符号链接"  
与"空目录"反复交换，以命中 daemon 解析与使用之间的窗口：

-   读方向（ `docker cp container:/path host/` ）：单次命中概率低于 1%，数十次尝试即可获得宿主机文件的读取；
-   写方向（ `docker cp host/ container:/path` ）：只需极少数次迭代。原因是当时的 `chrootarchive.Untar`  
    将进程 chroot 到 **归档目标目录的父目录**，而该目录由攻击者控制；一旦竞态命中，chroot 已发生在错误的位置，  
    后续写操作必然逃逸。

### 2.3 修复：chroot 方案的引入

当时存在两个候选方案：

-   **方案 A：复制期间暂停容器**。cyphar 在 [PR #39252](https://github.com/moby/moby/pull/39252)  
    （"daemon: archive: pause containers before doing filesystem operations"）中提出，最终 **未合入**。  
    PR 正文说明：最彻底的方案是让 chrootarchive 始终以容器 rootfs 为根执行归档操作，  
    但修改该核心组件的成本过高（TarUntar 接口存在大量拷贝与重实现），因此退而求其次选择暂停容器，  
    并承认这不是理想方案（存在共享卷等攻击场景）。
-   **方案 B：chroot 到容器根**。Brian Goff 在 [PR #39292](https://github.com/moby/moby/pull/39292)  
    （"Pass root to chroot to for chroot Tar/Untar (CVE-2018-15664)"，明确 replaces #39252）中实现， **合入**。

方案 B 的改动（2019-06-04 合入，提交 [d089b63937](https://github.com/moby/moby/commit/d089b639372a8f9301747ea56eaf0a42df24016a)  
与 [3029e765e2](https://github.com/moby/moby/commit/3029e765e241ea2b5249868705dbf9095bc4d529) ）：

```go
// daemon/archive.go（修复后，v20.10.10）
func extractArchive(i interface{}, src io.Reader, dst string, opts *archive.TarOptions, root string) error {
    ...
    return chrootarchive.UntarWithRoot(src, dst, opts, root)   // 总是 chroot 到容器根
}
func archivePath(i interface{}, src string, opts *archive.TarOptions, root string) (io.ReadCloser, error) {
    ...
    return chrootarchive.Tar(src, opts, root)                  // 打包方向同样 chroot
}
```

配套实现位于 [pkg/chrootarchive/archive_unix.go，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/pkg/chrootarchive/archive_unix.go) ：  
daemon fork 自身并重新执行，注册 `docker-tar` （打包）与 `docker-untar` （解包）两个辅助进程，  
先 chroot 到容器根，再在 chroot 内完成归档操作。 `chrootarchive.UntarWithRoot` 的注释直接引用了本漏洞：

```go
// ... Normally `ResolveSymlinksInScope` would handle this, however
// sanitizing symlinks in this manner is inherrently racey:
// ref: CVE-2018-15664
```

**版本信息**：NVD/OSV 记载受影响版本为 Docker through 18.06.1-ce-rc2；由于修复在披露之后才合入，  
实际受影响范围覆盖当时所有已发布版本。修复随 docker-ce \*\*18.09.7（2019-06-27）\*\*与 \*\*19.03.0（2019-07-22）\*\*发布  
（docker-ce 官方 changelog 将修复列于 18.09.7，docs.docker.com 列于 18.09.8，两处记载略异；  
18.09/19.03 分支回溯分别为 [docker/engine#253](https://github.com/docker/engine/pull/253) 与 [docker/engine#254](https://github.com/docker/engine/pull/254) ）。

* * *

## 3\. CVE-2019-14271：chroot 辅助进程的 NSS 动态库注入

### 3.1 机制

`docker-tar` 的运行环境有两个关键属性（ [Unit 42 研究](https://unit42.paloaltonetworks.com/docker-patched-the-most-severe-copy-vulnerability-to-date-with-cve-2019-14271/) ）：

1.  它 chroot 到容器 rootfs，但 **不是容器化的进程**：运行在主机命名空间，具备全部 root 能力，  
    不受 cgroup 或 seccomp 限制；
2.  它使用 Go 标准库 `archive/tar` 生成 tar 头，而 `tar.FileInfoHeader` 在构造 `Header` 时  
    会通过 `os/user.LookupId` / `LookupGroupId` 将文件的 UID/GID 解析为用户/组名  
    （Go 1.9 引入，见 [golang/go 提交 29a18899379c](https://github.com/golang/go/commit/29a18899379c) ，  
    该行为后被 moby 的 [tar fork 补丁](https://github.com/moby/moby/blob/master/patches/0001-archive-tar-do-not-populate-user-group-names.patch) 移除）。

`os/user` 的 cgo 实现调用 libc 的 `getpwuid_r` / `getgrgid_r` ，第一次调用时 glibc 按 `/etc/nsswitch.conf`  
的配置通过 NSS（Name Service Switch）机制 `dlopen` 对应的 `libnss_*.so` 模块。由于这次调用发生在  
`docker-tar` chroot **之后**， `dlopen` 的路径解析落在 **容器文件系统** 内，攻击者可通过替换容器内的  
`libnss_*.so` 注入代码，以宿主机 root 身份执行。

该漏洞最初由用户报告 `docker cp` 从 `debian:buster-slim` 复制失败而暴露：该镜像不包含 libnss 库，  
`docker-tar` 加载失败崩溃（ [issue #39449](https://github.com/moby/moby/issues/39449) ）。

从输入到触发的完整函数链：

```plain
用户输入:  docker cp mycontainer:/logs /some/host/path
   │
   ▼ daemon: containerArchivePath → archivePath(...) → chrootarchive.Tar(src, opts, root)
   │         └─ invokePack() → reexec.Command("docker-tar", relSrc, root)
   ▼ docker-tar 进程（主机命名空间，root）
   ├─ realChroot(root)                                   // ① chroot 进容器 rootfs
   ├─ archive.TarWithOptions(src, &options)              // ② 在 chroot 内打包
   │    └─ tarAppender.addTarFile(path, name)
   │         └─ FileInfoHeader(name, fi, link)           // ③ 构造 tar 头
   │              └─ tar.FileInfoHeader(fi)              //    Go 标准库 archive/tar
   │                   └─ sysStat(fi, hdr)               //    archive/tar/stat_unix.go
   │                        ├─ h.Uid = sys.Uid; h.Gid = sys.Gid
   │                        └─ h.Uname = user.LookupId(strconv.Itoa(h.Uid))   // 触发点
   │                             └─ os/user（cgo）→ getpwuid_r() → glibc NSS
   │                                  └─ dlopen("libnss_files.so.2")           // 从 chroot 内解析
   │                                       └─ 恶意库的 constructor 函数以 host root 执行
   └─ 逃逸载荷在 docker-tar 上下文运行 → 宿主机 root
```

moby 官方在移除 archive/tar fork 的提交（ [e9bbc41dd1](https://github.com/moby/moby/commit/e9bbc41dd146d692e28660a392b068c9c112f2ad) ）中  
对上述链路有完整描述，并明确指出 *"escape the chroot (which is not a sandbox) into the host"*。

### 3.2 利用方式

Unit 42 的 PoC 构造恶意 `libnss_files.so` ，其中包含一个以 GCC `__attribute__((constructor))` 修饰的函数  
`run_at_link()` ：库被 `dlopen` 时构造函数先于其他代码执行。函数先判断自身是否运行在 `docker-tar` 上下文  
（通过能否打开 `/proc/self/exe` ），随后将真正的 libnss 换回原位（避免影响后续进程），再 `fork` + `execve`  
执行容器内预置的逃逸程序（如挂载宿主机文件系统、写任意文件）：

```c
__attribute__ ((constructor)) void run_at_link(void)
{
    if (!is_priviliged())   // 通过能否打开 /proc/self/exe 判断是否运行在 docker-tar 上下文
        return;
    rename(ORIGINAL_LIBNSS, LIBNSS_PATH);   // 换回真正的 libnss，避免影响后续进程
    if (!fork()) {
        argv_break[0] = strdup("/breakout");
        argv_break[1] = NULL;
        execve("/breakout", argv_break, NULL);  // 执行容器内预置的逃逸程序
    }
    ...
}
```

### 3.3 修复的三层演化

该漏洞的修复经历了三个阶段，每一阶段都暴露了"chroot 辅助进程"模式的深层问题：

**第 1 层：chroot 前预加载 NSS 库（19.03.1，2019-07-26）。** 在 [pkg/chrootarchive/archive.go，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/pkg/chrootarchive/archive.go) 的  
`init()` 中强制触发一次用户/主机名解析，使 glibc 在 chroot 之前从宿主机加载 NSS 库：

```go
func init() {
    // initialize nss libraries in Glibc so that the dynamic libraries are loaded in the host
    // environment not in the chroot from untrusted files.
    _, _ = user.Lookup("docker")
    _, _ = net.LookupHost("localhost")
}
```

（提交 [a316b10dab](https://github.com/moby/moby/commit/a316b10dab79d9298b02c7930958ed52e0ccf4e4) ，合并于 [PR #39612](https://github.com/moby/moby/pull/39612) ）。  
该方案是 ad-hoc 修复：glibc 的 nsswitch 支持自动重载配置（ [glibc bug #12459](https://sourceware.org/bugzilla/show_bug.cgi?id=12459) ），  
某些 nscd 配置下上下文切换后库会被重新加载，一次 glibc 更新即可使修复失效  
（CCS '23 论文对此有明确论述）。

**第 2 层：fork Go 标准库 archive/tar（19.03.8，2020-03-11）。** 为覆盖"某些 nscd 配置"的缺口，  
moby 在 master/20.10 分支（2020-01-17，提交 [7260adfff9](https://github.com/moby/moby/commit/7260adfff98ff46230ede3c2b3fbad1b607ebf5c) ）  
与 19.03 分支分别 fork 了标准库 archive/tar，通过补丁  
[patches/0001-archive-tar-do-not-populate-user-group-names.patch，master](https://github.com/moby/moby/blob/master/patches/0001-archive-tar-do-not-populate-user-group-names.patch)  
直接删除 `statUnix` 中的 `user.LookupId` / `user.LookupGroupId` 调用（Uname/Gname 留空），从源头阻断 NSS 触发：

```diff
 func statUnix(fi os.FileInfo, h *Header) error {
     sys, ok := fi.Sys().(*syscall.Stat_t)
     ...
     h.Uid = int(sys.Uid)
     h.Gid = int(sys.Gid)
-
-	// Best effort at populating Uname and Gname.
-	if u, ok := userMap.Load(h.Uid); ok {
-		h.Uname = u.(string)
-	} else if u, err := user.LookupId(strconv.Itoa(h.Uid)); err == nil {
-		h.Uname = u.Username
-		...
```

代价是巨大的维护负担：vendor 标准库包不被 Go module 模式支持，每次 Go 升级都需同步该 fork  
（CCS '23 论文统计约 7,498 行级改动； [issue #42402](https://github.com/moby/moby/issues/42402) 专门跟踪其移除）。

**第 3 层：** `nosysFileInfo` **→** `tar.FileInfoNames` **（2022-2024）。**

-   [e9bbc41dd1](https://github.com/moby/moby/commit/e9bbc41dd146d692e28660a392b068c9c112f2ad) （2022-01-24，随 Docker 23.0.0 发布）：  
    删除 fork，改用 `nosysFileInfo` ——自定义 `fs.FileInfo` 包装器，隐藏 `fi.Sys()` 中的 `*syscall.Stat_t` ，  
    使 `tar.FileInfoHeader` 无法获得 UID/GID，从而无法发起查找（Fixes #42402；20.10 分支因 EOL 保留 fork）；
-   [2b4db9383c](https://github.com/moby/moby/commit/2b4db9383c5136bbfb2d695a90b169a27a738730) （2024-12-20，随 Docker 28.0.0 发布）：  
    Go 1.23 采纳提案 [go.dev/issue/50102](https://go.dev/issue/50102) （ `archive/tar.FileInfoNames` 接口），  
    `nosysFileInfo` 实现该接口，将"禁用查找"契约化；
-   现行 go-archive 的 `FileInfoHeader` 直接调用 `tarheader.FileInfoHeaderNoLookups`  
    （ [go-archive v0.2.0 archive.go](https://github.com/moby/go-archive/blob/v0.2.0/archive.go) ），注释明确  
    *"safe to call from a chrooted process"*。

**版本信息**：受影响版本为 Docker 19.03.0（唯一同时具备 docker-tar、Go 1.11、glibc 组合的正式版；  
NVD 表述为 "Docker 19.03.x before 19.03.1"）。修复随 \*\*19.03.1（2019-07-26）\*\*发布，  
docker-ce 18.09 系列回溯（ [docker/engine#305](https://github.com/docker/engine/pull/305) ，2019-07-26 合入）修复于  
**18.09.9（2019-09-03）**；Ubuntu（USN）、Debian（DSA-4521）等发行版对各自维护的 18.09/19.03 包做了同步修复。

* * *

## 4\. Docker 23.0 的架构变更：为什么放弃 chroot 辅助进程

### 4.1 工程原因一：挂载命名空间污染（直接原因）

chroot 的实现要求 daemon 在 **主机挂载命名空间** 中将容器的卷 bind-mount 到容器 rootfs 目录下。  
当 `/var/lib/docker` 本身被作为卷 bind 进容器（如 DinD 场景）时，挂载事件跨命名空间传播：  
每次 docker cp 都会在容器挂载命名空间中留下无法回收的挂载，挂载表持续增长直至内核上限，  
报错 "no space left on device"（ [issue #38995](https://github.com/moby/moby/issues/38995) 、 [issue #43390](https://github.com/moby/moby/issues/43390) ）。

[PR #44210](https://github.com/moby/moby/pull/44210) （"Fix 'docker cp' mount table explosion, take four"，2022-11-11 合入，  
随 23.0.0 于 2023-02-01 发布）的提交信息（ [2bdc7fb0a1](https://github.com/moby/moby/commit/2bdc7fb0a1e00439aa88438f1164677dda95737f) ）指出，  
唯一不受竞态影响且无其他阻塞性副作用的方案，是 **不在主机挂载命名空间向容器 rootfs 挂载卷**，  
而是在私有挂载命名空间（ `unshare(CLONE_NEWNS)` ）中完成归档操作。

### 4.2 工程原因二：性能开销

CCS '23 论文对 chroot 化修复后的 docker cp 做了基准测试（docker-ce v18.03.1 基线对比修复版本），  
复制 1MB–1GB 文件的额外开销为 **98.25%–216.13%**，且随文件增大而上升；开销主要来自每次复制  
spawn 新进程、chroot 以及通过管道传输。在 CI、serverless 等 docker cp 的高频场景中，这一代价过高。

### 4.3 安全原因一：chroot 辅助进程模式本身是持续的攻击面

第 3 章的修复演化可以视为该模式的失败记录：docker-tar 是主机命名空间中以 root 运行的进程，  
chroot 只限制其文件视图，不限制其能力；任何"chroot 之后发生的按需加载/按需执行"都会把解析路径  
（动态库、可执行文件、PATH 查找）交给容器控制的内容。针对 CVE-2019-14271 的修复不得不逐层加码——  
预加载 NSS 库（可被 glibc 的 nsswitch 自动重载特性失效）、fork 标准库 archive/tar 禁用用户名查找  
（约 7,498 行级改动，且 vendor 标准库不被 Go module 模式支持）、最终以 `nosysFileInfo` +  
`tar.FileInfoNames` 接口从源头禁止查找。每一次修复都只堵住一个加载点，而"主机 root 进程进入  
攻击者控制的目录树"这一模式本身，无法保证没有下一个加载点（如 CVE-2026-41567 中按容器内 PATH  
解析解压器二进制，就是同一模式的新变体）。

### 4.4 安全原因二：客户端解包不具备使用 chroot 的条件

容器→宿主机方向的解包发生在运行 CLI 的机器上，存在三个硬约束：

1.  CLI 是非特权进程，没有 `CAP_SYS_CHROOT` ，无法执行 chroot；
2.  CLI 运行在 macOS / Windows / Linux 等多种平台，macOS 上不存在可依赖的 chroot 语义；
3.  目标目录可能尚不存在，且用户期望目标路径上的符号链接被正常跟随——chroot 到目标目录会改变  
    docker cp 的正常语义。

因此客户端解包端从来只有"字符串前缀检查"这一道防线，这也正是 CVE-2026-17106 击穿的位置。  
修复只能选择不依赖进程权限的机制——即由内核在路径解析时强制包含性（openat2 的 `RESOLVE_BENEATH`  
语义，经 `os.Root` 封装），这也是 go-archive v0.3.0 的实际做法。

### 4.5 安全原因三：用户态包含手段的本质局限

CCS '23 论文对 12 个同类漏洞（Pamir，路径误解析）的分析表明：容器文件系统是 **并发可变的输入**——  
容器进程可以在宿主机进程"解析路径"与"使用路径"之间的任意时刻修改文件系统；  
而任何用户态包含手段（chroot 属于其中一种）都无法原子地保证"解析结果等于使用结果"。  
chroot 能保证视图内符号链接的解析范围，但无法阻止容器进程在两次操作之间改变路径的含义  
（这也是 CVE-2026-17106 生产端竞态存在的原因）。因此用户态修复只能缓解，不能根除；  
可靠的方案是把包含性检查下沉到内核的路径解析过程。openat2 的 `RESOLVE_BENEATH` 是当前 Linux  
提供的机制；论文提出的 PATROL（对 VFS dentry 标记安全级别并在路径查找例程中执行访问控制）是  
该思路更彻底的形态，但尚未进入主线内核。

### 4.6 关于“复制前停止容器”

需要区分两个不同的方案： **在复制期间暂停/停止容器**，与 **在复制之前由用户手动停止容器**。

-   2019 年 cyphar 在 [PR #39252](https://github.com/moby/moby/pull/39252) 中提出过复制期间暂停容器，但未合入（见 2.3 节）；
-   Podman 采用了复制期间暂停容器的方案，论文实测其开销为 13.26%–72.61%，并且该方案可被绕过：  
    当多个容器共享一个卷时，被暂停的容器仍可通过卷上的文件发起 TOCTOU 竞态；
-   2026 年 CopyEscape 的缓解建议是"复制前先停止容器"，其作用机制是消除生产端竞态的前提条件——  
    容器没有运行的进程，就没有人能在打包期间修改文件系统。它并不能修复客户端解包的包含性缺陷，  
    因此只是缓解措施，不构成修复。

### 4.7 新架构：containerFSView

新实现不再 spawn `docker-tar` / `docker-untar` ，改为为每次复制建立 `containerFSView` （容器文件系统视图，  
[daemon/containerfs_linux.go，docker-v29.6.1](https://github.com/moby/moby/blob/docker-v29.6.1/daemon/containerfs_linux.go) ）：

```go
err = unshare.Go(unix.CLONE_NEWNS,                 // ① 私有挂载命名空间
    func() error {
        if err := mount.MakeRSlave("/"); err != nil { ... }
        root, err := os.OpenRoot(ctr.BaseFS)        // ② os.Root（openat2）打开容器根
        ...
        for _, m := range mounts { /* 私有命名空间内 bind 卷 */ }
        return mounttree.SwitchRoot(ctr.BaseFS)     // ③ pivot_root 切换到容器根（失败回退 chroot）
    }, ...)
```

打包端（ [daemon/archive_unix.go 第 76-82 行，docker-v29.6.1](https://github.com/moby/moby/blob/docker-v29.6.1/daemon/archive_unix.go#L76-L82) ）：

```go
opts := archive.TarResourceRebaseOpts(sourceBase, filepath.Base(absPath))
tb, err := archive.NewTarballer(sourceDir, opts)   // go-archive 的 tarballer
cfs.GoInFS(context.TODO(), tb.Do)                  // 在容器文件系统视图内执行打包
data := tb.Reader()
```

配套变化： `pkg/chrootarchive` 本身也改为不再 re-exec 辅助进程（"chrootarchive-without-reexec"）；  
2025 年 `pkg/archive` / `pkg/chrootarchive` 被废弃（ [57a042b77c](https://github.com/moby/moby/commit/57a042b77c67048f4612fcaef8c16a094f904260) ，2025-04-03）  
并移除（ [66e9cd97f2](https://github.com/moby/moby/commit/66e9cd97f29ac2758dfd3814040033bb879d706d) ，2025-06-16），  
daemon 与 CLI 统一使用外部模块 `github.com/moby/go-archive` （v0.2.0 于 2025-12-19 vendor，  
[2a9eb66ddc](https://github.com/moby/moby/commit/2a9eb66ddcf7c47ffbf22f52ce888dc3da9e5fac) ，随 Docker 29.2.0 于 2026-01-26 发布）。  
该版本即 CVE-2026-17106 的受影响代码基线。

### 4.8 安全语义变化

新架构在安全语义上有三点变化，是理解 CVE-2026-17106 的前提：

1.  **没有独立的 chroot 辅助进程**：打包在 daemon 进程内完成。daemon 端仍会 pivot_root 到容器根，  
    但这是视图切换， **不能阻止容器进程对底层文件系统的并发修改**——容器与 daemon 的视图共享同一批 inode；
2.  **容器在复制期间保持运行**： `container.Lock()` 只保护 daemon 内部状态，  
    **不会冻结容器内的进程** （ [Imperva 研究](https://www.imperva.com/blog/copyescape-taking-over-docker-hosts-with-docker-cp/) 原文：  
    "it does not freeze processes running inside the container"）；
3.  **CLI 端解包没有 chroot**：容器 → 宿主机的解包发生在客户端机器（CLI 为非特权进程、跨平台、  
    目标目录可能不存在），其唯一防线是 go-archive 中的字符串前缀检查。

综上，2026 年的修复选择 os.Root/openat2 而不是重新引入 chroot，是上述五方面原因共同作用的结果：  
chroot 辅助进程模式存在工程与安全两方面的不可持续性，客户端解包在架构上无法使用 chroot，  
而用户态包含手段（包括 chroot）对“并发可变的容器文件系统”这一输入本质上不完备；  
相比之下，openat2 由内核强制路径包含性，与运行位置（daemon 或 CLI）和进程权限无关，  
是当前条件下唯一能同时覆盖打包端与解包端的机制。

* * *

## 5\. CVE-2026-17106（CopyEscape）

### 5.1 概述

2026-06-24，公开 PoC（ [issue #52948](https://github.com/moby/moby/issues/52948) ，Docker 29.4.0 复现）与随后的  
[Imperva 报告](https://www.imperva.com/blog/copyescape-taking-over-docker-hosts-with-docker-cp/) 披露该漏洞，  
Docker 确认同一 CVE 同时影响 Docker Sandboxes 的 `sbx cp` 复制出沙箱场景。

攻击效果：恶意容器可将文件写入运行 `docker cp` 的机器上的任意可写位置，权限等同于运行该命令的用户。

-   **macOS** （Docker Desktop 4.81.0 验证）：解包发生在 macOS 上的 CLI 进程，符号链接在 Mac 文件系统命名空间中解析，  
    可覆盖 shell 启动脚本、 `~/Library/LaunchAgents` 持久化、SSH 配置等；
-   **Linux** （Docker Engine 29.6.1 验证）： `sudo docker cp` 或 root 自动化场景下，可覆盖 `/usr/bin/runc` ，  
    在下一次容器生命周期操作执行它时获得 root 代码执行。

漏洞由两个相互独立的缺陷串联而成：打包端的归档一致性被破坏（生产端竞态），  
以及解包端的包含性失效（字符串前缀检查缺陷）。

### 5.2 生产端：归档一致性的破坏

打包由 go-archive v0.2.0 的 tarballer 完成，遍历使用 `filepath.WalkDir`  
（ [archive.go 第 691-802 行，v0.2.0](https://github.com/moby/go-archive/blob/v0.2.0/archive.go#L691-L802) ），  
每个条目交给 `addTarFile` （ [archive.go 第 295-317 行，v0.2.0](https://github.com/moby/go-archive/blob/v0.2.0/archive.go#L295-L317) ）：

```go
// moby/go-archive v0.2.0，遍历
_ = filepath.WalkDir(walkRoot, func(filePath string, f os.DirEntry, err error) error {
    ...
    if f.IsDir() {                       // 观察①：基于父目录 ReadDir 的 DirEntry 判断是否目录、是否下钻
        parentDirs = append(parentDirs, relFilePath)
        ...
    }
    ...
    if err := ta.addTarFile(filePath, relFilePath); err != nil { ... }
})

// addTarFile
func (ta *tarAppender) addTarFile(path, name string) error {
    fi, err := os.Lstat(path)            // 观察②：重新 Lstat，决定条目类型
    ...
}
```

同一个路径名在两个时刻回答两个问题：遍历决策（是否目录、是否下钻）基于观察①；  
归档元数据（文件/目录/符号链接）基于观察②。容器进程可在两次观察之间修改路径：  
例如将目录 `escape` 换成指向 `/usr/bin` 的符号链接。 `WalkDir` 下钻时 `os.ReadDir` 会跟随符号链接，  
因此归档中会出现一对自相矛盾的条目：

```plain
file.txt/escape  ->  /usr/bin      （符号链接条目，来自观察②）
file.txt/escape/runc                 （子项条目，来自观察①的"目录"决策）
```

将竞态变为可重复序列的技术（Imperva PoC）：容器内用 `LD_PRELOAD` 拦截器使容器内进程将 `/watched/file.txt`  
视为普通文件（精确访问重定向到隐藏后备文件），而 daemon 看到的是可遍历的目录树；  
在枢轴目录前放置大文件（拉长时间窗口）并用文件系统通知监控 daemon 打开它的时机（"时钟"），  
收到信号后执行两次 `rename` 完成目录 → 符号链接的切换。

### 5.3 消费端：解包包含性的失效

CLI 解包调用链： `archive.CopyTo` （ [copy.go 第 418-437 行，v0.2.0](https://github.com/moby/go-archive/blob/v0.2.0/copy.go#L418-L437) ）  
→ `PrepareArchiveCopy` → `Untar` （ `NoLchown:true, NoOverwriteDirNonDir:true` ）→ `createTarFile` 。  
符号链接条目的处理（ [archive.go 第 480-492 行，v0.2.0](https://github.com/moby/go-archive/blob/v0.2.0/archive.go#L480-L492) ）：

```go
case tar.TypeSymlink:
    targetPath := filepath.Join(filepath.Dir(path), hdr.Linkname)
    if !strings.HasPrefix(targetPath, extractDir) {
        return breakoutError(fmt.Errorf("invalid symlink %q -> %q", path, hdr.Linkname))
    }
    if err := os.Symlink(hdr.Linkname, path); err != nil { ... }   // 创建时使用原始 Linkname
```

该实现存在三个叠加缺陷：

1.  **检查的值与使用的值不一致**：包含检查针对 `filepath.Join` 构造的 `targetPath` ，  
    而 `os.Symlink` 使用归档中的原始 `hdr.Linkname` 。对提取路径 `/safe/output/file.txt/escape` 与链接目标  
    `/usr/bin` ： `filepath.Join("/safe/output/file.txt", "/usr/bin")` 结果为 `/safe/output/file.txt/usr/bin` ，  
    以 `/safe/output` 开头，检查通过；内核实际创建的却是绝对符号链接 `/usr/bin` 。  
    [GHSA-hfg8-hc9c-6c3h](https://github.com/moby/go-archive/security/advisories/GHSA-hfg8-hc9c-6c3h) 的官方表述：  
    *"The extractor decides where each archive entry lands using lexical string checks and then performs  
    the filesystem operation on a path that is resolved by the OS"*；
2.  **字符串前缀不等于路径包含**： `/safe/output-elsewhere` 同样以 `/safe/output` 开头，可通过检查；
3.  **子条目不重新验证**：子条目 `file.txt/escape/runc` 的词法检查（清理、`../` 检查）只针对文件名文本，  
    但前一个条目已将路径在磁盘上的含义改变为"穿过 `escape -> /usr/bin` "——创建子文件时内核直接跟随符号链接。

### 5.4 完整利用链

```plain
① WalkDir 记录 escape 为目录
② 容器将其替换为绝对符号链接（两次 rename，inotify 定时）
③ addTarFile 的 Lstat 看到符号链接，写入 tar：escape -> /usr/bin
④ WalkDir 按旧记录下钻，发出子项条目 escape/runc
⑤ CLI 验证"构造出来的目标路径"通过，却用原始 Linkname 创建绝对符号链接
⑥ CLI 解包子文件，内核跟随符号链接 → 写入目标目录之外（权限 = 运行 docker cp 的用户）
⑦ sudo docker cp / root 自动化 → 覆盖 /usr/bin/runc → 下一次容器操作 = root 代码执行
```

### 5.5 修复：os.Root/openat2

go-archive v0.3.0（2026-07-30， [PR #45](https://github.com/moby/go-archive/pull/45)  
"archive: harden tar extraction against path traversal"）将解包器重写为基于 `os.Root` （openat2）的实现：  
所有文件系统操作经 `os.Root` 执行，路径包含性由内核保证（ `RESOLVE_BENEATH` 语义）。  
修复后的符号链接分支（ [archive.go，v0.3.0](https://github.com/moby/go-archive/blob/v0.3.0/archive.go) ）：

```go
case tar.TypeSymlink:
    // os.Root.Symlink contains the symlink's location (newname) within
    // root but stores the target (oldname) verbatim, so absolute targets
    // such as /usr/lib -- common and legitimate in container images -- are
    // preserved rather than rejected. ... containment applies when the
    // symlink is followed, not at creation.
    if err := root.Symlink(linkTarget, dstPath); err != nil { ... }
```

符号链接节点仍会被创建（目标原样保存，兼容镜像中常见的绝对链接），但任何穿过该符号链接的后续操作  
都经 openat2 语义执行——内核拒绝跟随逃出根目录的链接。字符串前缀检查被废弃。

### 5.6 版本信息与缓解

|     |     |     |
| --- | --- | --- |  
| 组件  | 版本  | 说明  |
| 受影响范围 | **Docker 29.2.0（2026-01-26）～ 29.6.2（2026-07-16）** | 均使用 go-archive v0.2.0（29.4.0 由公开 PoC 复现、29.6.1 由 Imperva 实测；28.x 系列以 28.5.2 为最后受影响版本，OSV last_affected） |
| go-archive | **v0.3.0（2026-07-30）** | 核心修复（os.Root 化解包；affected <0.2.2，patched 0.3.0） |
| Docker Engine / CLI | **29.7.0（2026-07-30）** | 升级 go-archive v0.3.0（ [moby#53247](https://github.com/moby/moby/pull/53247) 、 [docker/cli#7139](https://github.com/docker/cli/pull/7139) ） |
| Docker Engine / CLI | **29.7.2（2026-08-06）** | go-archive v0.3.3：修复 v0.3.0 引入的硬链接/权限回归（ [moby#53305](https://github.com/moby/moby/pull/53305) ）；daemon 解包加 `WithProcSelfFD` （路径改写为 `/proc/self/fd/N` 钉住 inode） |
| Docker Desktop | **4.86.0（2026-08）** | 同 CVE 修复（ [发布说明](https://docs.docker.com/desktop/release-notes/#4860) ） |
| Docker Sandboxes | **0.38.0（2026-08-06）** | 修复 `sbx cp` 复制出沙箱的目标逃逸（ [sandboxes#3788](https://github.com/docker/sandboxes/issues/3788) ） |

缓解措施（无法升级时）：复制前先停止容器（消除生产端竞态的前提条件）；避免 `sudo docker cp` 与以 root 运行的复制自动化；  
以最小权限运行 CLI；从不可信容器取数时使用一次性隔离环境。

* * *

## 6\. 相关漏洞

### 6.1 2026 年 5 月的一簇（29.5.1 修复）

同一研究周期内，新架构暴露出三个同类问题：

1.  **CVE-2026-41567（** [GHSA-x86f-5xw2-fm2r](https://osv.dev/vulnerability/GHSA-x86f-5xw2-fm2r) **）——容器内解压器以主机 root 执行**：  
    `PUT /containers/{id}/archive` 收到压缩归档时，daemon 在已切换到容器文件系统的视图内调用解压，  
    解压二进制（xz、unpigz）按容器内 PATH 解析。修复（ [提交 2022313ffe](https://github.com/moby/moby/commit/2022313ffe5a8c04890b5295bc52670ee6df8070) ）：  
    **进入容器文件系统之前先解压**；
2.  **CVE-2026-41568（** [GHSA-vp62-88p7-qqf5](https://osv.dev/vulnerability/GHSA-vp62-88p7-qqf5) **）——挂载点创建时的符号链接交换**：  
    创建挂载点的 `createIfNotExists` 使用 `os.MkdirAll` / `os.OpenFile` 沿已解析的绝对路径操作，  
    中间路径组件被容器换成符号链接 → 在宿主机任意绝对路径以 root 创建空文件/目录（持久 DoS）。  
    修复（ [提交 64a22d80b9](https://github.com/moby/moby/commit/64a22d80b93ddc1416b501b5145df02947312249) ）：改用 `os.Root` 限定；
3.  **CVE-2026-42306（** [GHSA-rg2x-37c3-w2rh](https://osv.dev/vulnerability/GHSA-rg2x-37c3-w2rh) **）——bind mount 目标重定向**：  
    `createIfNotExists` 与 `mount()` 之间，容器将目标换成符号链接， `mount()` 跟随 → 卷被 bind 到宿主机任意路径。  
    修复（ [提交 43fa458a9c](https://github.com/moby/moby/commit/43fa458a9c40873867e75221454de10709b04236) ）：  
    通过 `os.Root` 打开目标获得钉住 inode 的文件描述符，用 `/proc/self/fd/<fd>` 作为 mount 目标。

三个修复方向与 CopyEscape 一致：用 os.Root/openat2 将路径解析交给内核。  
受影响 Docker ≤ 29.5.0（OSV 记录 28.5.2 为最后受影响版本），修复于 **29.5.1（2026-05-18）**，25.x/29.x 维护线有同步回溯。

### 6.2 其他工具的同源漏洞（Pamir）

|     |     |     |
| --- | --- | --- |  
| CVE | 工具/特性 | 说明  |
| CVE-2018-15664 | Docker copy | 符号链接交换 → 宿主机任意读写 |
| CVE-2019-14271 | Docker copy | chroot 内加载 libnss → root RCE |
| CVE-2019-10152 / CVE-2019-18466 | Podman copy | 同类符号链接逃逸 |
| **CVE-2023-0778** | **Podman export volume** （CCS '23 论文发现，受影响 <4.4.2，修复于 4.4.2，2023-02-23） | "修复 copy 后，新增 export 功能重新暴露同类风险" |
| CVE-2017-1002101 / CVE-2021-25741 | Kubernetes volume/subPath | 卷路径被符号链接劫持 |
| CVE-2021-30465 / CVE-2022-23648 | runc / containerd | 卷相关 TOCTOU |
| CVE-2019-5736 | runc | 经 /proc/self/exe 覆写 runc 自身 |

* * *

## 7\. 时间线（含版本号）

|     |     |     |
| --- | --- | --- |  
| 时间  | 事件  | 版本  |
| ≤ 2018 | docker cp 在 daemon 内直接对容器 rootfs 做 tar（无 chroot） | Docker ≤ 18.06.1-ce-rc2 |
| 2019-05-28 | cyphar 在 oss-security 披露 CVE-2018-15664（披露时无任何已发布修复） | 所有已发布版本 |
| 2019-06 | 修复路线之争：PR #39252（暂停容器，未合入）→ PR #39292（chroot 到容器根）；docker-tar/docker-untar 诞生 | **18.09.7（2019-06-27）** / 19.03.0（2019-07-22） |
| 2019-07-26 | CVE-2019-14271 修复：chroot 前预加载 NSS | **19.03.1（2019-07-26）**；18.09 系列回溯至 **18.09.9（2019-09-03）** |
| 2020-03-11 | 为补 nscd 缺口 fork Go 标准库 archive/tar（补丁：不填充 Uname/Gname） | **19.03.8（2020-03-11）**；master/20.10 分支 2020-01-17 引入 |
| 2022-01-24 | 移除 tar fork，改 nosysFileInfo | 随 \*\*23.0.0（2023-02-01）\*\*发布（20.10 分支保留 fork） |
| 2022-11-11 | PR #44210：docker cp 改进程内实现（私有挂载 ns + pivot_root），弃用 chroot 辅助进程 | 随 \*\*23.0.0（2023-02-01）\*\*发布 |
| 2024-12-20 | nosysFileInfo 实现 tar.FileInfoNames（Go 1.23） | 随 \*\*28.0.0（2025-02-19）\*\*发布 |
| 2025-04-03 / 2025-06-16 | pkg/archive、pkg/chrootarchive 废弃并移除，统一 go-archive | Docker 28.x；go-archive v0.2.0 于 2025-12-19 vendor，随 \*\*29.2.0（2026-01-26）\*\*发布 |
| 2026-05-18 | 修复 CVE-2026-41567/41568/42306 | **29.5.1（2026-05-18）** |
| 2026-06-24 | CopyEscape 公开披露（issue #52948，v29.4.0 复现） | 受影响：29.2.0～29.6.2 |
| 2026-07-30 | go-archive v0.3.0 用 os.Root 重写解包（GHSA-hfg8-hc9c-6c3h） | Engine/CLI **29.7.0（2026-07-30）** |
| 2026-08-06 | v0.3.3 修复回归 + daemon 端 WithProcSelfFD；Sandboxes 0.38.0 修复 sbx cp | Engine/CLI **29.7.2（2026-08-06）**、Desktop **4.86.0（2026-08）** |

* * *

## 8\. 总结

docker cp 的安全边界经历了四个阶段：

```plain
无边界（≤2019）→ chroot 辅助进程（2019-2022）→ 进程内视图 + 客户端字符串检查（23.0+）→ 内核 openat2 包含（2026）
     15664 逃逸               14271 逃逸                   CopyEscape 逃逸                （当前收口）
```

每一阶段的"修复"都只把边界推到了下一层，而攻击者总能找到下一层的缝隙：  
字符串前缀不是路径包含、检查的值与使用的值不一致、容器进程在两次观察之间修改路径、  
chroot 后的进程会从容器内加载攻击者控制的库。

**防御建议**：

1.  升级：Engine/CLI ≥ 29.7.2，Desktop ≥ 4.86.0，Sandboxes ≥ 0.38.0；
2.  从不可信容器复制前先停止容器（消除生产端竞态）；
3.  避免 `sudo docker cp` ，不以 root 运行复制自动化，CLI 使用最小权限；
4.  将容器取出的文件按不可信输入处理；
5.  涉及"主机访问容器文件系统"的新功能（copy/export/volume/沙箱），上线前检查：  
    路径解析发生在谁的视角、检查与使用之间是否存在竞态窗口、加载/执行是否可能落到容器控制的内容上。

**核心结论**：

-   检查的值必须等于使用的值（验证 `targetPath` 、创建 `Linkname` 等于没有检查）；
-   运行中的容器文件系统是并发可变的输入，任何"先解析、后使用"都面临 TOCTOU，  
    要么原子化（openat2/fd 钉住），要么冻结输入（停止容器）；
-   用户态包含手段（含 chroot）本质上不完备，由内核在路径解析时强制包含性  
    （openat2 `RESOLVE_BENEATH` ，乃至 dentry 级隔离）才是问题的终局。

* * *

## 9\. 参考资料

**源码（GitHub 链接）**

-   moby： [daemon/archive.go，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/daemon/archive.go) 、 [container/container.go:340，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/container/container.go#L340) 、 [pkg/chrootarchive/archive_unix.go，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/pkg/chrootarchive/archive_unix.go) 、 [pkg/chrootarchive/archive.go，v20.10.10](https://github.com/moby/moby/blob/v20.10.10/pkg/chrootarchive/archive.go) 、 [daemon/containerfs_linux.go，docker-v29.6.1](https://github.com/moby/moby/blob/docker-v29.6.1/daemon/containerfs_linux.go) 、 [daemon/archive_unix.go:76-82，docker-v29.6.1](https://github.com/moby/moby/blob/docker-v29.6.1/daemon/archive_unix.go#L76-L82) 、 [patches/0001-archive-tar-do-not-populate-user-group-names.patch，master](https://github.com/moby/moby/blob/master/patches/0001-archive-tar-do-not-populate-user-group-names.patch)
-   go-archive： [archive.go v0.2.0](https://github.com/moby/go-archive/blob/v0.2.0/archive.go) （addTarFile: L295-L317、WalkDir: L691-L802、TypeSymlink: L480-L492）、 [copy.go v0.2.0](https://github.com/moby/go-archive/blob/v0.2.0/copy.go) （CopyTo: L418-L437）、 [archive.go v0.3.0](https://github.com/moby/go-archive/blob/v0.3.0/archive.go) （os.Root 化解包）

**提交（GitHub 链接）**

-   [d089b63937](https://github.com/moby/moby/commit/d089b639372a8f9301747ea56eaf0a42df24016a) 、 [3029e765e2](https://github.com/moby/moby/commit/3029e765e241ea2b5249868705dbf9095bc4d529) （CVE-2018-15664 修复）
-   [a316b10dab](https://github.com/moby/moby/commit/a316b10dab79d9298b02c7930958ed52e0ccf4e4) （CVE-2019-14271 修复）、 [e9bbc41dd1](https://github.com/moby/moby/commit/e9bbc41dd146d692e28660a392b068c9c112f2ad) 、 [2b4db9383c](https://github.com/moby/moby/commit/2b4db9383c5136bbfb2d695a90b169a27a738730) （no-lookups）
-   [2bdc7fb0a1](https://github.com/moby/moby/commit/2bdc7fb0a1e00439aa88438f1164677dda95737f) （PR #44210）、 [2a9eb66ddc](https://github.com/moby/moby/commit/2a9eb66ddcf7c47ffbf22f52ce888dc3da9e5fac) （vendor go-archive v0.2.0）、 [57a042b77c](https://github.com/moby/moby/commit/57a042b77c67048f4612fcaef8c16a094f904260) 、 [66e9cd97f2](https://github.com/moby/moby/commit/66e9cd97f29ac2758dfd3814040033bb879d706d)
-   [2022313ffe](https://github.com/moby/moby/commit/2022313ffe5a8c04890b5295bc52670ee6df8070) 、 [64a22d80b9](https://github.com/moby/moby/commit/64a22d80b93ddc1416b501b5145df02947312249) 、 [43fa458a9c](https://github.com/moby/moby/commit/43fa458a9c40873867e75221454de10709b04236) （2026 修复）

**GitHub PR / Issue**

-   [moby#39252](https://github.com/moby/moby/pull/39252) （暂停容器方案，未合入）、 [moby#39292](https://github.com/moby/moby/pull/39292) （chroot 方案，合入）
-   [docker/engine#253](https://github.com/docker/engine/pull/253) 、 [docker/engine#254](https://github.com/docker/engine/pull/254) 、 [docker/engine#305](https://github.com/docker/engine/pull/305) （18.09/19.03 回溯）
-   [moby#39612](https://github.com/moby/moby/pull/39612) （NSS 预加载）、 [moby#42402](https://github.com/moby/moby/issues/42402) （tar fork 移除）、 [moby#44210](https://github.com/moby/moby/pull/44210) （挂载表爆炸）、 [moby#38995](https://github.com/moby/moby/issues/38995) 、 [moby#43390](https://github.com/moby/moby/issues/43390) 、 [moby#39449](https://github.com/moby/moby/issues/39449)
-   [moby#52948](https://github.com/moby/moby/issues/52948) （CopyEscape 披露）、 [moby#53247](https://github.com/moby/moby/pull/53247) 、 [docker/cli#7139](https://github.com/docker/cli/pull/7139) 、 [go-archive#45](https://github.com/moby/go-archive/pull/45)
-   [docker/sandboxes#3788](https://github.com/docker/sandboxes/issues/3788) （sbx cp）

**论文与研究报告**

-   [Zhi Li et al., *Lost along the Way: Understanding and Mitigating Path-Misresolution Threats to Container Isolation*, CCS '23](https://doi.org/10.1145/3576915.3623154)
-   [oss-security: CVE-2018-15664（cyphar 披露）](http://www.openwall.com/lists/oss-security/2019/05/28/1)
-   [Unit 42: Docker Patched the Most Severe Copy Vulnerability to Date With CVE-2019-14271](https://unit42.paloaltonetworks.com/docker-patched-the-most-severe-copy-vulnerability-to-date-with-cve-2019-14271/)
-   [Imperva: CopyEscape — Taking Over Docker Hosts With docker cp](https://www.imperva.com/blog/copyescape-taking-over-docker-hosts-with-docker-cp/)
-   [cn-sec: CopyEscape：用 docker cp 接管 Docker 宿主机](http://cn-sec.com/archives/5389977.html)
-   [Metarget: docker-cve-2019-14271 复现](https://github.com/Metarget/metarget/blob/master/writeups_cnv/docker-cve-2019-14271/README.md)

**漏洞库与发布说明**

-   OSV： [CVE-2018-15664](https://osv.dev/vulnerability/CVE-2018-15664) 、 [CVE-2019-14271](https://osv.dev/vulnerability/CVE-2019-14271) 、 [GHSA-x86f-5xw2-fm2r](https://osv.dev/vulnerability/GHSA-x86f-5xw2-fm2r) 、 [GHSA-vp62-88p7-qqf5](https://osv.dev/vulnerability/GHSA-vp62-88p7-qqf5) 、 [GHSA-rg2x-37c3-w2rh](https://osv.dev/vulnerability/GHSA-rg2x-37c3-w2rh)
-   NVD： [CVE-2019-14271](https://nvd.nist.gov/vuln/detail/CVE-2019-14271) ； [CVE-2026-17106](https://www.cve.org/CVERecord?id=CVE-2026-17106)
-   发布说明： [Docker Engine 29.5.1](https://github.com/moby/moby/releases/tag/docker-v29.5.1) 、 [29.7.0](https://github.com/moby/moby/releases/tag/docker-v29.7.0) 、 [29.7.2](https://github.com/moby/moby/releases/tag/docker-v29.7.2) 、 [go-archive v0.3.0](https://github.com/moby/go-archive/releases/tag/v0.3.0)
-   其他： [华为云 CCE Docker 文件复制逃逸漏洞公告](https://support.huaweicloud.com/bulletin-cce/cce_bulletin_0138.html) 、 [SUSE Bug 1208364（CVE-2023-0778, Podman）](https://bugzilla.suse.com/show_bug.cgi?id=1208364) 、 [glibc bug #12459](https://sourceware.org/bugzilla/show_bug.cgi?id=12459) 、 [go.dev/issue/50102](https://go.dev/issue/50102)
