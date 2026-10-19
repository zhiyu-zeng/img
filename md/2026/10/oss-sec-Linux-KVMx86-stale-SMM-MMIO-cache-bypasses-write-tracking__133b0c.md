---
title: "oss-sec: Linux KVM/x86: stale SMM MMIO cache bypasses write tracking"
source: https://seclists.org/oss-sec/2026/q4/227
source_host: seclists.org
clip_date: 2026-10-20T01:06:25+08:00
trace_id: 2fbcce03-7efe-41d1-a062-6a6ec786b0aa
content_hash: 8b3d05f6ca43ec8eae788e25c81140f4d69b914a0be2b470b56e7074172ed50c
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: oss-security·漏洞披露
ai_summary: KVM/x86 的 per-vCPU MMIO 缓存使用了错误的 memslot 地址空间 generation，因此在从 SMM 返回后，旧的缓存条目仍会被判定为有效，从而形成可由 guest 触发的写跟踪绕过。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fe75244-d011-8168-823f-d658ad2a4402
ioc:
  cves: []
  cwes: []
  hashes:
    - b3e6212dea2e4328a841ceb37f377583176dc735
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> KVM/x86 的 per-vCPU MMIO 缓存使用了错误的 memslot 地址空间 generation，因此在从 SMM 返回后，旧的缓存条目仍会被判定为有效，从而形成可由 guest 触发的写跟踪绕过。
> 
> - **漏洞根因：** 缓存填充与有效性校验函数 `vcpu_cache_mmio_info()` / `vcpu_match_mmio_gen()` 都调用 `kvm_memslots(vcpu->kvm)`，于是即使 vCPU 正在使用 SMM 地址空间，它们取到的仍是普通地址空间的 generation；当 SMM memslot 更新后，旧的 SMM 缓存条目就可能残留为有效。
> - **直接后果：** 对受跟踪 RAM 的写入被误报为 `KVM_EXIT_MMIO`，并触发 `kvm_mmu_write_protect_fault()` 中的 `WARN_ON_ONCE()`；如果 VMM 针对 RAM 完成这次 exit，就能在 KVM 写跟踪之外修改后备页。KVM 自测可复现。
> - **最坏影响：** 如果后备页承载嵌套 EPT 表，未跟踪的写入就会使 KVM 继续沿用基于旧表内容构建的影子翻译；在 Linux 6.1.74（后续 shadow-MMU 加固之前）上，这足以让 guest 获得宿主任意内存读写权限，并在宿主内核中执行代码；作者借助嵌套 VMX/EPT 与 Q35 SMM，在 L1 guest 内核级控制下完成了复现。
> - **引入与修复：** 该问题由 commit `699023e23965` 引入 SMM 地址空间却未同步修改缓存检查导致；上游 commit `b3e6212dea2e4328a841ceb37f377583176dc735` 将两处检查改为使用 vCPU 当前活跃的 memslots，该修复已随 Linux v7.3 发布。

## oss-sec mailing list archives

## Linux KVM/x86: stale SMM MMIO cache bypasses write tracking

* * *

*From*: Jinu Kim <kimjw04271234 () gmail com>  
*Date*: Mon, 19 Oct 2026 15:54:08 +0900  

* * *

```sql
Hello,

I found a guest-triggerable write-tracking bypass in KVM/x86's per-vCPU
MMIO cache. On pre-fix mainline, a KVM selftest reproduces a tracked RAM
write misreported as KVM_EXIT_MMIO and the WARN_ON_ONCE() in
kvm_mmu_write_protect_fault(). A VMM completing such an exit against RAM
can modify the backing page without KVM write tracking.

KVM has separate normal and SMM memslot address spaces. The MMIO cache
fill and validity checks, vcpu_cache_mmio_info() and
vcpu_match_mmio_gen(), used kvm_memslots(vcpu->kvm), which selects the
normal address space's generation even when the vCPU is using the SMM
address space. An SMM memslot update can therefore leave an old SMM
cache entry valid after the guest returns from SMM. If the backing page
holds a nested EPT table, the untracked write can leave KVM using shadow
translations built from the table's old contents.

On Linux 6.1.74, before later shadow-MMU hardening, this same cache
bug enabled guest-to-host code execution. A stale MMIO cache entry
turned an L1 guest's write to a tracked EPT12 page into an MMIO
completion, so KVM missed the page-table change. The resulting stale
shadow translations were used to obtain arbitrary host memory read and
write and execute code in the host kernel. I reproduced this with
nested VMX/EPT and Q35 SMM under kernel-level control of the L1 guest.

The bug was introduced when commit 699023e23965 added the SMM address
space without making these cache checks use its memslots. Upstream commit
b3e6212dea2e4328a841ceb37f377583176dc735 fixes both checks to use
the vCPU's active memslots. The fix is included in Linux v7.3.

Upstream fix:
https://github.com/torvalds/linux/commit/b3e6212dea2e4328a841ceb37f377583176dc735

Regards,
Jinu Kim

```

* * *

### Current thread:

-   **Linux KVM/x86: stale SMM MMIO cache bypasses write tracking** *Jinu Kim (Oct 19)*
