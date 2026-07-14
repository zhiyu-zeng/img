---
title: 【微信】最新Linux的本地提权漏洞分析
source: https://mp.weixin.qq.com/s?__biz=MzU3MTY5MzQxMA==&mid=2247485280&idx=1&sn=1fcdc3c1ef0b8299952a470ef99300d9
source_host: mp.weixin.qq.com
clip_date: 2026-07-14T10:00:52+08:00
trace_id: 933c2687-59b3-4298-b2eb-689c19a7c2d7
content_hash: 0048612978d270ec0bc95632a37474fc4f665746832fb1fda58198da54599b10
status: summarized
tags:
  - 微信
  - Linux
  - 内核漏洞
  - 本地提权
  - DirtyClone
  - 网络安全
series: null
feed_source: 公众号·软件安全与逆向分析
ai_summary: DirtyClone 是一个 Linux 本地提权漏洞，利用内核网络栈的回归绕过，通过修改文件页缓存来获取 root 权限。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 39d75244-d011-81f9-a0c0-ca554b1930e9
ioc:
  cves:
    - CVE-2026-43503
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> DirtyClone 是一个 Linux 本地提权漏洞，利用内核网络栈的回归绕过，通过修改文件页缓存来获取 root 权限。
> 
> - **漏洞根源：** `__pskb_copy_fclone()` 克隆 skb 时丢失 SKBFL_SHARED_FRAG 标记，导致 esp_input() 将页缓存误判为普通缓冲区并直接解密。
> - **利用流程：** 攻击者通过 TEE 或 nft dup to local 复制网络包，控制 seq_hi 字节反复写入，覆盖 `/usr/bin/su` 前 192 字节以注入 shellcode。
> - **系统限制：** Ubuntu 24.04 默认启用 AppArmor 限制非特权 user namespace，PoC 需调整策略或禁用限制才能触发。
> - **补丁措施：** 主线修复已合入 v7.1-rc5，建议升级内核；临时缓解包括限制 CAP_NET_ADMIN 和避免自动加载相关模块。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/730e65948d090a15.jpg)

最新Linux的本地提权漏洞分析

2026年6月25日，JFrog Security Research公开了DirtyClone（CVE-2026-43503）。它不是一个全新的内核原语，而是DirtyFrag修复链上的回归绕过： `__pskb_copy_fclone()` 在克隆 `skb` 时丢掉了 `SKBFL_SHARED_FRAG` ，于是 `esp_input()` 把一张仍然挂着文件页缓存的页误判成普通网络缓冲区，最后在原地解密时把数据写回了页缓存。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dad77f8ac3aaaf87.png)

从NVD的变更记录看，这也不是单点失误，而是一组frag-transfer helper在转移frag描述符时都可能把共享标记弄丢；DirtyClone公开利用的是其中最直接的 `__pskb_copy_fclone()` 克隆路径。

```bash
文件页缓存
  -> TEE/dup to local克隆
  -> `__pskb_copy_fclone()`
  -> `SKBFL_SHARED_FRAG`丢失
  -> `esp_input()`
  -> 原地decrypt
  -> 页缓存被改写
```

## 1 漏洞成因

DirtyFrag原本已经补过一次：只要 `skb` 带着外部共享页， `esp_input()` 就应该先走 `skb_cow_data()` ，再做解密。DirtyClone的问题在于， `__pskb_copy_fclone()` 先复制frag描述符，再把剩余的 `shinfo` 交给 `skb_copy_header()` ，但后者只处理gso相关字段，不会把 `skb_shinfo()->flags` 里的 `SKBFL_SHARED_FRAG` 带过去。结果是，页还在，标记没了， `skb_has_shared_frag()` 就会返回false。

再往下看，问题就变成了典型的“看起来不共享，实际上还共享”。 `esp_input()` 依据错误的标记跳过COW，后续的IPsec原地解密直接落在页缓存页上。磁盘文件本身没有被改，改动只停在内存里的page cache里，所以文件完整性监控和重启后的磁盘校验都看不见这个状态。

## 2 利用链

DirtyClone的PoC没有重新发明写原语，而是把DirtyFrag里已经验证过的 `seq_hi` 控字节技巧接了回来。大致流程是：

```javascript
只读打开`/usr/bin/su`
  -> 把目标页塞进ESP包
  -> 用`TEE`或等价的`nft dup to local`在内核里复制该包
  -> 复制后的`skb`丢标记
  -> `esp_input()`原地写回
  -> 反复48次，覆盖`su`前192字节
  -> 执行被污染的`su`得到root
```

这里真正可控的是每个4字节word。PoC通过XFRM状态里的 `seq_hi` 携带目标word，再配合AES-CBC的IV和封装方式，让解密结果写成想要的字节。目标文件通常选 `/usr/bin/su` ，因为只要把它的前192字节换成一个极小的 `setuid(0)+execve("/bin/sh")` ELF，下一次执行时就能拿到root。

PoC里用的是 `TEE` ，本质上只要能走到 `nf_dup_ipv4()` 并触发 `__pskb_copy_fclone()` ，思路就成立。

## 3 Ubuntu24.04上的现实约束

Ubuntu24.04和更高版本默认启用了AppArmor对非特权user namespace的限制。也就是说，标准的 `unshare(CLONE_NEWUSER|CLONE_NEWNET)` 起手式不再像Debian、Fedora那样顺手，PoC想拿到 `CAP_NET_ADMIN` 会被默认策略卡住。JFrog公开的代码也明确提到，在Ubuntu上需要放开 `kernel.apparmor_restrict_unprivileged_userns` ，或者让目标进程落在允许 `userns` 的AppArmor配置里。

所以，Ubuntu24.04不是“没有这个洞”，而是默认把最常见的利用起点收紧了。对普通本地用户来说，它更像是把标准打法从“开箱即用”变成了“还得先过一层系统策略”。

## 4 补丁与缓解

主线修复在2026年5月21日合入，首个修复标签是 `v7.1-rc5` 。真正稳妥的处理只有升级内核，并确认发行版回补链路完整。临时缓解只能缩小面：保留Ubuntu的userns限制，尽量别让普通用户获得 `CAP_NET_ADMIN` ，同时避免 `xt_TEE` 、 `esp4` 、 `esp6` 这类触发面自动加载。
