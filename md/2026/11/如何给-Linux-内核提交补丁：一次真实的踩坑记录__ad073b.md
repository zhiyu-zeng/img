---
title: 如何给 Linux 内核提交补丁：一次真实的踩坑记录
source: https://bestwing.me/How-to-patch-a-linux-kernel-bug-zh.html
source_host: bestwing.me
clip_date: 2026-11-04T10:22:49+08:00
trace_id: f83dcb41-73cf-4146-9f27-1c754fb6bcd0
content_hash: 0369790a4166ff4cdd00afc76dd191437f3ef3907d8d1296f635bc9c0abe6b5f
status: synced
tags:
  - 内核
  - Linux安全
series: null
feed_source: Swings·漏洞/二进制
ai_summary: TL;DR：作者修复了 `skbuff_fclone_cache` 缺失 usercopy 区域导致 `CONFIG_HARDENED_USERCOPY` 下内核 panic 的 bug，完整记录补丁提交流程，最终合并并获 CVE-2026-22977。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-812f-8b4b-ee4cbb30026f
ioc:
  cves:
    - CVE-2026-22977
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：作者修复了 `skbuff_fclone_cache` 缺失 usercopy 区域导致 `CONFIG_HARDENED_USERCOPY` 下内核 panic 的 bug，完整记录补丁提交流程，最终合并并获 CVE-2026-22977。
> 
> - **Bug 根因：** `skbuff_fclone_cache` 创建时未定义 usercopy 区域（`skbuff_head_cache` 有），TCP 经 `alloc_skb_fclone()` → `skb_clone()` → 错误队列 → `recvmsg(MSG_ERRQUEUE)` → `put_cmsg()` 拷贝克隆 skb 的 `cb` 字段时触发 BUG()；崩溃偏移 296 = 232（第二个 fclone skb 起点）+ 40（`cb` 偏移）+ 24，落在 `sock_exterr_skb.ee` 内。
> - **修复演进：** v4 方案是用 `kmem_cache_create_usercopy()` 给 fclone cache 加 `cb` 白名单；netdev 维护者 Eric Dumazet 建议 v5 改为在 `sock_recv_errqueue()` 中用栈上 bounce buffer 中转拷贝，不动 slab 配置、安全性更好，最终合并（commit `f9ac7befe5f1`）。
> - **环境与工具：** bug 修复要克隆 `net.git`（新功能用 `net-next.git`），不要直接用 Linus 主仓；发补丁必须用 `git send-email` + `mutt`，Gmail 网页版会把纯文本转 HTML、替换 Tab 导致补丁损坏。
> - **发前自测：** `checkpatch.pl --strict` 查风格，`defconfig`/`allyesconfig` 双配置编译，用 `virtme-ng`（`vng --build --run`）启动跑 PoC 验证，跑对应子系统 selftests；作者因跳过本地编译被 kernel test robot 打回 v2。
> - **提交细节：** 提交信息标题为"子系统: 简短描述"（≤72 字符）、正文每行 ≤75 字符，带 `Fixes:`/`Reported-by:`/`Signed-off-by:` 标签；调用栈先用 `decode_stacktrace.sh` 解码再精简；已公开的补丁不要抄送 security@kernel.org；CVE 在补丁进 stable 树后自动分配，`cve@kernel.org` 仅接收已合并修复的申请。

BEGIN_PAYLOAD20260201

最近给 Linux 内核提交了一个补丁，修复 `skbuff_fclone_cache` 的 usercopy 问题，过程中踩了不少坑。这篇文章记录一下整个流程，希望能帮到想给内核提补丁的朋友。

## 背景

事情是这样的，n132和我发现了一个内核 panic，在启用 `CONFIG_HARDENED_USERCOPY` 的时候会触发。

问题出在 `skbuff_fclone_cache` 这个 slab 缓存创建的时候没有定义 usercopy 区域，但是 `skbuff_head_cache` 是有的。这就导致内核在尝试把 `sk_buff.cb` 的数据拷贝到用户空间的时候会 BUG()。

崩溃的调用链大概是这样：

1.  TCP 用 `alloc_skb_fclone()` 分配 skb
2.  `skb_clone()` 克隆这个 skb
3.  克隆的 skb 被放到 `sk_error_queue`
4.  用户空间调用 `recvmsg(MSG_ERRQUEUE)` 读错误队列
5.  `sock_recv_errqueue()` 调用 `put_cmsg()` 拷贝数据
6.  然后 `__check_heap_object()` 检查失败触发内核崩溃

崩溃日志长这样：

```yaml
[    5.379589] usercopy: Kernel memory exposure attempt detected from SLUB object 'skbuff_fclone_cache' (offset 296, size 16)!
[    5.382796] kernel BUG at mm/usercopy.c:102!
[    5.383923] Oops: invalid opcode: 0000 [#1] SMP KASAN NOPTI
[    5.384903] CPU: 1 UID: 0 PID: 138 Comm: poc_put_cmsg Not tainted 6.12.57 #7
[    5.384903] Hardware name: QEMU Standard PC (i440FX + PIIX, 1996), BIOS rel-1.16.3-0-ga6ed6b701f0a-prebuilt.qemu.org 04/01/2014
[    5.384903] RIP: 0010:usercopy_abort+0x6c/0x80
[    5.384903] Code: 1a 86 51 48 c7 c2 40 15 1a 86 41 52 48 c7 c7 c0 15 1a 86 48 0f 45 d6 48 c7 c6 80 15 1a 86 48 89 c1 49 0f 45 f3 e8 84 27 88 ff <0f> 0b 490
[    5.384903] RSP: 0018:ffffc900006f77a8 EFLAGS: 00010246
[    5.384903] RAX: 000000000000006f RBX: ffff88800f0ad2a8 RCX: 1ffffffff0f72e74
[    5.384903] RDX: 0000000000000000 RSI: 0000000000000004 RDI: ffffffff87b973a0
[    5.384903] RBP: 0000000000000010 R08: 0000000000000000 R09: fffffbfff0f72e74
[    5.384903] R10: 0000000000000003 R11: 79706f6372657375 R12: 0000000000000001
[    5.384903] R13: ffff88800f0ad2b8 R14: ffffea00003c2b40 R15: ffffea00003c2b00
[    5.384903] FS:  0000000011bc4380(0000) GS:ffff8880bf100000(0000) knlGS:0000000000000000
[    5.384903] CS:  0010 DS: 0000 ES: 0000 CR0: 0000000080050033
[    5.384903] CR2: 000056aa3b8e5fe4 CR3: 000000000ea26004 CR4: 0000000000770ef0
[    5.384903] PKRU: 55555554
[    5.384903] Call Trace:
[    5.384903]  <TASK>
[    5.384903]  __check_heap_object+0x9a/0xd0
[    5.384903]  __check_object_size+0x46c/0x690
[    5.384903]  put_cmsg+0x129/0x5e0
[    5.384903]  sock_recv_errqueue+0x22f/0x380
[    5.384903]  tls_sw_recvmsg+0x7ed/0x1960
[    5.384903]  ? srso_alias_return_thunk+0x5/0xfbef5
[    5.384903]  ? schedule+0x6d/0x270
[    5.384903]  ? srso_alias_return_thunk+0x5/0xfbef5
[    5.384903]  ? mutex_unlock+0x81/0xd0
[    5.384903]  ? __pfx_mutex_unlock+0x10/0x10
[    5.384903]  ? __pfx_tls_sw_recvmsg+0x10/0x10
[    5.384903]  ? _raw_spin_lock_irqsave+0x8f/0xf0
[    5.384903]  ? _raw_read_unlock_irqrestore+0x20/0x40
[    5.384903]  ? srso_alias_return_thunk+0x5/0xfbef5
```

这个 bug 后来被分配了 [CVE-2026-22977](https://vulert.com/vuln-db/net--sock--fix-hardened-usercopy-panic-in-sock-recv-errqueue) 。

### 分析一下崩溃

崩溃信息里说 `offset 296, size 16` ，我们来算一下：

```
sizeof(struct sk_buff) = 232
offsetof(struct sk_buff, cb) = 40

sk_buff_fclones 里面：
- skb1 从 0 开始
- skb2 从 232 开始

所以 skb2.cb 的偏移 = 232 + 40 = 272
崩溃偏移 296 = 272 + 24，刚好在 sock_exterr_skb.ee 里面
```

这就确认了问题确实出在克隆 skb 的 `cb` 字段。

## 第一步：环境准备

### 克隆正确的仓库

这里点，我们 **不要直接克隆 Linus 的主仓库**！要根据你的补丁类型选择对应的子系统仓库：

```bash
# 网络相关的 bug 修复，用这个：
git clone https://git.kernel.org/pub/scm/linux/kernel/git/netdev/net.git
cd net

# 网络相关的新功能，用这个：
git clone https://git.kernel.org/pub/scm/linux/kernel/git/netdev/net-next.git

# 其他通用的：
git clone https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git
```

| 仓库  | 用途  |
| --- | --- |
| `net.git` | 当前版本的 bug 修复 |
| `net-next.git` | 下一版本的新功能 |
| `linux.git` | 通用开发 |

我这个是 net模块里的代码，所以应该用 `net.git` 。

### 配置 Git 邮件

编辑 `~/.gitconfig` ：

```toml
[user]
    name = Weiming Shi
    email = bestswngs@gmail.com

[sendemail]
    smtpserver = smtp.gmail.com
    smtpserverport = 587
    smtpencryption = tls
    smtpuser = bestswngs@gmail.com
```

用 Gmail 的话需要去 Google 账户安全设置里生成一个应用专用密码。

### 为什么用 Mutt？

这里要特别说一下， **千万不要用 Gmail 网页版发补丁**！

Gmail 网页版会：

-   把纯文本转成 HTML
-   自动换行，直接把补丁搞坏
-   把 Tab 换成空格
-   各种编码问题

内核要求纯文本邮件，补丁要内联在邮件里（不是附件）。推荐的组合是：

-   **`git send-email`** 发补丁
-   **`mutt`** 看维护者回复

Mutt 配置 `~/.muttrc` ：

```bash
set realname = "Weiming Shi"
set from = "bestswngs@gmail.com"
set use_from = yes
set envelope_from = yes

set my_user = "bestswngs@gmail.com"
set my_pass = "xxxx xxxx xxxx xxxx"  # 应用专用密码

set imap_user = $my_user
set imap_pass = $my_pass
set folder = "imaps://imap.gmail.com:993"
set spoolfile = "+INBOX"

set smtp_url = "smtps://$my_user:$my_pass@smtp.gmail.com:465/"
set ssl_force_tls = yes

set postponed = "+[Gmail]/Drafts"
set record = "+[Gmail]/Sent Mail"

set header_cache = ~/.mutt/cache/headers
set message_cachedir = ~/.mutt/cache/bodies
set certificate_file = ~/.mutt/certificates
```

## 第二步：写修复代码

创建工作分支：

```bash
git checkout -b fix-skbuff-fclone-usercopy
```

修复其实很简单，把 `kmem_cache_create()` 换成 `kmem_cache_create_usercopy()` ：

```objectivec
-    net_hotdata.skbuff_fclone_cache = kmem_cache_create("skbuff_fclone_cache",
+    net_hotdata.skbuff_fclone_cache = kmem_cache_create_usercopy("skbuff_fclone_cache",
                         sizeof(struct sk_buff_fclones),
                         0,
                         SLAB_HWCACHE_ALIGN|SLAB_PANIC,
+                        offsetof(struct sk_buff, cb),
+                        sizeof(struct sk_buff) + sizeof_field(struct sk_buff, cb),
                         NULL);
```

## 第三步：测试

编译：

```bash
make menuconfig  # 启用 CONFIG_HARDENED_USERCOPY=y
make -j$(nproc)
```

测试的话推荐用 `virtme-ng` ，比手动搞 initramfs 方便太多了：

```bash
# 安装
sudo apt install qemu-system-x86 qemu-kvm
pip install virtme-ng

# 直接启动，不用 initramfs
vng --build --run

# 跑 PoC 验证
vng --build --run -- ./poc_put_cmsg
```

## 第四步：自测清单

发补丁之前一定要过一遍这个清单，我就是因为跳过了编译测试，结果收到了 kernel test robot 的构建失败邮件，很尴尬。

### 代码风格

```bash
./scripts/checkpatch.pl --strict 0001-your-patch.patch
```

常见问题：行太长、缩进用了空格（应该用 Tab）、行尾有空白。

### 多配置编译

```bash
make defconfig && make -j$(nproc)
make allyesconfig && make -j$(nproc)
```

### 启动测试

```bash
vng --build --run
```

### 验证修复

```bash
./poc_put_cmsg
dmesg | grep -i "usercopy\|BUG\|panic"
```

打补丁前会 panic，打完应该没事了。

### 跑 selftests

```bash
make -C tools/testing/selftests/net run_tests
```

### 拼写检查

```bash
codespell your-patch.patch
```

## 第五步：写提交信息

这是我踩坑最多的地方。

一个合格的提交信息长这样：

```kotlin
net: skbuff: add usercopy region to skbuff_fclone_cache

skbuff_fclone_cache was created without defining a usercopy region,
unlike skbuff_head_cache which properly whitelists the cb[] field.
This causes a usercopy BUG() when CONFIG_HARDENED_USERCOPY is enabled...

[精简后的崩溃日志]

Fix by using kmem_cache_create_usercopy() with the same cb[] region
whitelist as skbuff_head_cache.

Fixes: 6d07d1cd300f ("usercopy: Restrict non-usercopy caches to size 0")
Reported-by: Xiang Mei <xmei5@asu.edu>
Signed-off-by: Weiming Shi <bestswngs@gmail.com>
```

### 几个要点

1.  **标题格式**： `子系统: 简短描述` ，不超过 72 字符
2.  **正文每行不超过 75 字符**，这个很重要！可以用 vim 的 `:set cc=75` 画条线
3.  **Fixes 标签**：指向引入 bug 的那个提交
4.  **Signed-off-by**：你的名字和邮箱

### 调用栈怎么写

Eric Dumazet 给我的反馈：

> *“下次发调用栈之前，先跑一下 scripts/decode_stacktrace.sh 拿到有意义的符号。”*

所以要先处理一下：

```bash
./scripts/decode_stacktrace.sh vmlinux < raw_stack_trace.txt
```

然后 **精简**，不要把整个 dmesg 贴上去。删掉时间戳、寄存器 dump、模块列表，只保留错误信息和关键调用链：

```
usercopy: Kernel memory exposure attempt detected from SLUB object
'skbuff_fclone_cache' (offset 296, size 16)!
kernel BUG at mm/usercopy.c:102!
Call Trace:
 __check_heap_object
 __check_object_size
 put_cmsg
 sock_recv_errqueue
```

## 第六步：生成和发送补丁

生成补丁：

```bash
git format-patch -1 -v4 --subject-prefix="PATCH net"
```

`-v4` 表示第 4 版。

检查一下：

```bash
./scripts/checkpatch.pl *.patch
```

找维护者：

```bash
./scripts/get_maintainer.pl net/core/skbuff.c
```

发送：

```bash
git send-email \
    --to="davem@davemloft.net" \
    --to="edumazet@google.com" \
    --to="kuba@kernel.org" \
    --to="pabeni@redhat.com" \
    --cc="netdev@vger.kernel.org" \
    --cc="linux-kernel@vger.kernel.org" \
    *.patch
```

### 一个坑：security@kernel.org

Eric Dumazet 还跟我说：

> *“如果你已经在公开邮件列表上发了，就不要再抄送 [security@kernel.org](mailto:security@kernel.org) 了，没用。”*

规则：

-   私下披露 → 抄送 `security@kernel.org`
-   已经公开 → 不要抄送

## 第七步：处理反馈

发完补丁会收到各种反馈：

-   **Kernel Test Robot**：自动构建测试，会告诉你编译有没有问题
-   **维护者**：代码审查
-   **其他开发者**：评论

我的 v2 就收到了 robot 的构建失败报告，因为函数参数传错了。教训就是本地一定要先编译测试。

收到反馈后：

-   不要在邮件里直接回复修复代码，发新版本
-   用 `-v3` 、 `-v4` 标记版本
-   在 `---` 下面加更新日志说明改了什么

## 第八步：申请 CVE

**等补丁合并之后再说**。

根据 [内核 CVE 文档](https://docs.kernel.org/process/cve.html) ，未修复的问题不会分配 CVE，要等补丁进了 stable 树才行。

大多数情况下 CVE 会自动分配，内核 CVE 团队（Greg KH、Sasha Levin、Lee Jones）会审查每个进 stable 的补丁。如果他们觉得是安全问题就会自动分配 CVE，公告在 [linux-cve-announce](https://lore.kernel.org/linux-cve-announce/) 。

如果漏了，可以发邮件到 `cve@kernel.org` 。注意这个地址 **只用于已合并的修复**，未修复的安全问题发 `security@kernel.org` 。

我这个补丁合并后被分配了 CVE-2026-22977。

## 和维护者的邮件沟通

这里要特别说一下和 Eric Dumazet（Google 的 netdev 维护者）的沟通过程。

我最开始的方案（v4）是直接给 `skbuff_fclone_cache` 加 usercopy region：

```c
// v4 方案：修改 net/core/skbuff.c
kmem_cache_create_usercopy("skbuff_fclone_cache", ...,
    offsetof(struct sk_buff, cb),
    sizeof_field(struct sk_buff, cb), ...);
```

但 Eric 在 [邮件](https://lkml.org/lkml/2025/12/23/566) 里提了另一种思路：

> *“use a bounce buffer for copying skb->mark”*

他的意思是，与其放宽 `skbuff_fclone_cache` 的安全限制，不如在 `sock_recv_errqueue()` 里用一个栈上的临时变量做中转：

```c
// v5 方案：修改 net/core/sock.c
struct sock_extended_err ee;
ee = SKB_EXT_ERR(skb)->ee;  // 先拷贝到栈上
put_cmsg(msg, level, type, sizeof(ee), &ee);  // 再从栈上拷贝到用户空间
```

这样就不用动 slab cache 的配置，安全性更好。

所以我发了 v5 用 bounce buffer 的方案，最终合并的就是这个版本。这个过程让我学到了： **维护者的反馈很有价值，他们比你更了解代码的设计意图**。

## 我踩过的坑

1.  **v1：提交信息格式全错**，标题写成了 `Signed-off-by:`，离谱
2.  **v2：漏了 From 头**，`.gitconfig` 没配好
3.  **v2：忘了抄送邮件列表**，一定要跑 `get_maintainer.pl`
4.  **v3：代码写错了**，偏移量算错，本地没测就发了
5.  **v4：amend 了十几次**，说明提交前应该检查更仔细
6.  **调用栈没解码**，被 Eric 提醒了
7.  \*\*不该抄送 security@\*\*，已经公开了还抄送没意义

## 时间线

| 日期  | 版本  | 改动  |
| --- | --- | --- |
| 12月15日 | v1  | 初次提交，格式全错 |
| 12月16日 | v2  | 修了提交信息 |
| 12月16日 | v3  | 加了 From 头，修了 CC/TO |
| 12月16日 | v4  | 修了代码 |
| 12月24日 | v5  | 试了另一种方案 |

## 小结

回顾一下整个流程：

-   下载内核源码， **注意选对仓库** （bug 修复用 `net.git` ，新功能用 `net-next.git` ）
-   改代码，修 bug
-   编译，确保没 warning
-   用 `vng` 或 QEMU 启动测试，跑 PoC 确认修复了
-   **跑对应模块的测试**，不同子系统有不同的测试工具：
    -   网络： `make -C tools/testing/selftests/net run_tests`
    -   BPF： `make -C tools/testing/selftests/bpf run_tests`
    -   内存管理： `make -C tools/testing/selftests/mm run_tests`
    -   文件系统： `make -C tools/testing/selftests/filesystems run_tests`
    -   通用： `make kselftest TARGETS=<子系统>`
-   跑 `./scripts/checkpatch.pl --strict` 检查代码风格
-   写提交信息， **每行 75 字符**，用 `:set cc=75` 画线对齐
-   调用栈要用 `./scripts/decode_stacktrace.sh` 解码，然后精简
-   加上 `Fixes:`、 `Reported-by:`、 `Signed-off-by:` 这些标签
-   `git format-patch` 生成补丁
-   `./scripts/get_maintainer.pl` 找维护者
-   `git send-email` 发送， **不要用 Gmail 网页版**
-   如果已经公开了， **不要抄送 [security@kernel.org](mailto:security@kernel.org)**
-   收到反馈就发新版本（ `-v2` 、 `-v3` ），不要在邮件里直接回复代码
-   等合并后 CVE 会自动分配，或者发邮件给 `cve@kernel.org`

* * *

最后，Eric Dumazet 在邮件里说了一句，当时看到时候还蛮开心的（

> *“Congratulations on your first linux contribution!”*

从分析 bug 到补丁被合并（commit `f9ac7befe5f1` ），这个过程n132可谓是手把手教我了，这里得再次感谢一下他。

## 参考资料

EOFCHECKSUM_OK

1.  1.[提交补丁文档](https://www.kernel.org/doc/html/latest/process/submitting-patches.html)
    
2.  2.[邮件客户端配置](https://www.kernel.org/doc/html/latest/process/email-clients.html)
    
3.  3.[内核 CVE 流程](https://docs.kernel.org/process/cve.html)
    
4.  4.[Elixir Bootlin](https://elixir.bootlin.com/) - 带超链接的内核源码浏览
    
5.  5.[linux-cve-announce](https://lore.kernel.org/linux-cve-announce/) - CVE 公告
    
6.  6.[我的 v2 被 robot 打回的邮件](https://lkml.org/lkml/2025/12/20/364)
    
7.  7.[Eric Dumazet 建议 bounce buffer 方案的邮件](https://lkml.org/lkml/2025/12/23/566)
    
8.  8.https://n132.github.io/2025/07/10/How-to-patch-a-linux-kernel-bug.html
