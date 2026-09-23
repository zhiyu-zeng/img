---
title: "Will's Root: A Syzkaller Summer: Fixing False Positive Soft Lockups in net/sched Fuzzing"
source: https://www.willsroot.io/2025/09/syz-summer-2025.html
source_host: www.willsroot.io
clip_date: 2026-09-23T10:46:03+08:00
trace_id: 8077718b-0e2e-493a-8380-2030030e6c0b
content_hash: 4d0bbea3a198f461b880c82ad3719669c8fdf7a8cad14d499e7e3123ddd36468
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: Wills Root·内核漏洞
ai_summary: net/sched 的软锁死多为误报：fq qdisc 中极小 quantum 叠加巨大 stab overhead 会使 credit 长期为负陷入循环，并非真实漏洞，可用 Syzlang 约束修复。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 0
  failed_urls:
    - https://blogger.googleusercontent.com/img/a/AVvXsEjKIW6BNZF7M5ILEpS55OZtmvpSzr3fJIIdvHAmupYt0FRKSptKBAYx-UnXdXYK50dzNFjtVgwi6XhRD0UsYqnX8V_XEIwhoCmg0VQ8HbEj5G24YRukh7o7slCZbu2RTgNOKI-FzmEo5iKfJdXlblMmBAxEkeJQV50MZgZZcoASw8ONA3t9yRbGb2Y663E_=w640-h435
notion_page_id: 3e475244-d011-8124-9ed9-df487b14a6dc
ioc:
  cves:
    - CVE-2024-58240
    - CVE-2025-38001
    - CVE-2025-38616
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> net/sched 的软锁死多为误报：fq qdisc 中极小 quantum 叠加巨大 stab overhead 会使 credit 长期为负陷入循环，并非真实漏洞，可用 Syzlang 约束修复。
> 
> - **误报根因：** `fq_dequeue` 中 quantum 决定每轮取包获得的 credit，stab overhead 为每包加字节；quantum 极小 + overhead 巨大时首包出队后 credit 变负，陷入循环，watchdog 约 25 秒后报 soft lockup，最终自行恢复，故非真 bug。
> - **复现难点：** `syz-repro` 难复现，因 executor 的 `reset_net_namespace` 实际不重置网络命名空间，前序程序残留的 qdisc 层级永久改变内核状态、污染覆盖率信号；需手动二分到 2–3 个程序。
> - **诊断方法：** 用 `nsenter` 进入 syz-executor 的网络命名空间，循环 dump `tc -d qdisc/class show dev lo` 还原状态，最终得到单条 ip/tc 复现命令。
> - **修复补丁：** 在 Syzlang 中为 `tc_ratespec`/`tc_sizespec` 的 overhead 及 netem 的 packet/cell_overhead 加 `[0:256]` 约束；更激进的做法是直接移除 `TCA_STAB` 联合体变体。
> - **衍生成果：** 该现象被做成 corCTF 2025 挑战 HangBuzz101（篡改 watchdog 打印 flag），仅 2 队解出；作者与 Savy 合计约 8 个 CVE（6 net/sched、2 kTLS、1 io_uring），仅 3 个可利用，含 kernelCTF 约 82k 赏金的 CVE-2025-38001。

I spent a lot of time working on kernel fuzzing this summer after graduation as a continuation of my MEng research. In this post, I will detail an interesting scenario I encountered. There was a consistent repeated false positive hang in net/sched, which I transformed into the CTF challenge HangBuzz101 for corCTF 2025. I will also conclude with a tldr of the overall hobbyist vulnerability research and bug bounty experience in collaboration with [syst3mfailure](https://syst3mfailure.io/) in the past few months.

## net/sched 模糊测试背景

As every kernelCTFer can attest to, [net/sched](https://en.wikipedia.org/wiki/Network_scheduler#Linux_kernel) was a 0-day gold mine. So naturally, I fuzzed it a lot. One thing I noticed repeatedly was an occasional reported soft lockup or a task hang. Examples included:

-   `BUG: soft lockup in net_tx_action`
-   `BUG: soft lockup in sys_sendto`
-   `BUG: soft lockup in ip_rcv`
-   `BUG: soft lockup in tc_modify_qdisc`
-   `BUG: soft lockup in inet_stream_connect`
-   `BUG: soft lockup in sys_sendto`

In certain fuzzing campaigns (depending on the corpus), I would have flooded supressed reports with watchdog reports on a soft lockup as well. Many of the reports looked like the below, usually affecting the [fq](https://man7.org/linux/man-pages/man8/tc-fq.8.html) (fair queue) qdisc.

![⚠️ 图片托管失败](https://blogger.googleusercontent.com/img/a/AVvXsEjKIW6BNZF7M5ILEpS55OZtmvpSzr3fJIIdvHAmupYt0FRKSptKBAYx-UnXdXYK50dzNFjtVgwi6XhRD0UsYqnX8V_XEIwhoCmg0VQ8HbEj5G24YRukh7o7slCZbu2RTgNOKI-FzmEo5iKfJdXlblMmBAxEkeJQV50MZgZZcoASw8ONA3t9yRbGb2Y663E_=w640-h435)

## 复现困难与命名空间污染

Interestingly enough, while vanilla Syzkaller’s `syz-repro` could not reproduce many of these hangs, manually re-running the entire log with `./syz-execprog -enable net_dev -repeat 0 log` often resulted in the same hang. As a result, I began manual bisection, reducing the number of programs. In the end, it would often require me to end up with 2 to 3 programs for the hang to reproduce. This turned out to be the case because Syzkaller’s executor does not truly [reset network namespaces](https://github.com/google/syzkaller/blob/d291dd2d58a1885c00a60561048b6ceb1bf1206a/executor/common_linux.h#L3694) despite the function name `reset_net_namespace`. This means that previous Syzlang programs would leave their modifications to the qdisc hierarchy in the kernel and permanently affect subsequent executions, thereby permanently altering kernel state. This decision was made for performance, based on comments, but this makes the very metric (coverage/signals) vanilla Syzkaller judge programs by unreliable.

Anyways, once I had a simplified single program Syzlang repro. I would run the executor in the shell along with the following command to dump the tc state:

while true; do pid="$(lsns -t net -n -o NS,PID,COMMAND | grep syz-executor | awk '{print $2}' | head -n1)" echo "Entering network namespace of PID $pid" nsenter -t "$pid" -n \\ sh -c 'tc -d qdisc show dev lo; tc -d class show dev lo' done

This would show me the qdisc state to reconstruct, and I ended up with the following repro eventually:

ip link set dev lo up tc qdisc add dev lo root handle 8001: stab linklayer atm overhead 77174400 mtu 1 tsize 1 \\ fq \\ limit 1 \\ flow_limit 1 \\ buckets 2 \\ orphan_mask 1 \\ quantum 1 \\ maxrate 10bit \\ low_rate_threshold 1bit tc -s -d qdisc show dev lo ping -I lo -s1000 -c4 127.0.0.1

## 根因：quantum 与 overhead

Alas, this “bug” finally made sense. A tiny quantum parameter combined with a huge stab overhead value! Looking at [`fq_dequeue`](https://elixir.bootlin.com/linux/v6.16.5/source/net/sched/sch_fq.c#L696), the quantum determines the credit earnings per dequeue round, and the stab overhead adds the specified number of bytes to each packet. Hence, we become stuck in a scenario where we are very negative in credit (after the [first packet dequeues](https://elixir.bootlin.com/linux/v6.16.5/source/net/sched/sch_fq.c#L733)) and are stuck [looping](https://elixir.bootlin.com/linux/v6.16.5/source/net/sched/sch_fq.c#L699) due to the low quantum count.

begin: head = fq_pband_head_select(pband); if (!head) { while (++retry <= FQ_BANDS) { if (++q->band_nr == FQ_BANDS) q->band_nr = 0; pband = &q->band_flows\[q->band_nr\]; pband->credit = min(pband->credit + pband->quantum, pband->quantum); if (pband->credit > 0) goto begin; retry = 0; } if (q->time_next_delayed_flow!= ~0ULL) qdisc_watchdog_schedule_range_ns(&q->watchdog, q->time_next_delayed_flow, q->timer_slack); return NULL; } f = head->first; retry = 0; if (f->credit <= 0) { f->credit += q->quantum; head->first = f->next; fq_flow_add_tail(q, f, OLD_FLOW); goto begin; }

There were a few other variations in other qdiscs, but none of these are actual bugs in my opinion. These lockups do not last forever (as soft lockup watchdog warnings just trigger around after 25ish seconds) as the quantum value will eventually correct itself. Additionally, this behavior only triggers reliably on native systems with KCOV and KASAN due to the additional instrumentation weight. They can reliably replicate in non-accelerated hypervisor environments, but this is definitely not the common case.

To stop these false positives, I made the following changes to net/sched grammar in Syzlang.

## Syzlang 语法修复

@@ -454,9 +454,9 @@ tc_netem_corrupt { tc_netem_rate { rate int32 - packet_overhead int32 + packet_overhead int32\[0:256\] cell_size int32 - cell_overhead int32 + cell_overhead int32\[0:256\] } tc_netem_slot { @@ -1181,7 +1181,7 @@ tc_police { tc_ratespec { cell_log int8 linklayer flags\[linklayer, int8\] - overhead int16 + overhead int16\[0:256\] cell_align int16 mpu int16 rate int32 @@ -1293,7 +1293,7 @@ tc_sizespec { cell_log int8 size_log int8 cell_align int16 - overhead int32 + overhead int32\[0:256\] linklayer flags\[linklayer, int32\] mpu int32 mtu int32

A more aggressive approach could also be to just remove the `TCA_STAB` variant from the `rtm_tca_policy` Syzlang union definition.

## HangBuzz101 挑战构造

For corCTF 2025, I made this into a challenge called HangBuzz101 by rebuilding the kernel after the following patch command:

`sed -i "s/BUG: soft lockup/BUG: soft lockup, here is your flag: ${FLAG}/g" kernel/watchdog.c`

Surprisingly, only 2 teams solved this challenge, even though I provided a pretty minimal kernel configuration and emphasized net/sched. Perhaps this is just authorship bias, as I meant for this to be an easy challenge.

## CVE 成果汇总

I would say this venture into fuzzing has been fruitful. By the end of the summer, my custom version of Syzkaller yielded some nice results. My longtime collaborator Savy and I managed to find in total around 8 CVEs (6 in net/sched, 2 in kTLS, and 1 in io_uring), though these were mostly local DOS bugs. I also used this as an opportunity to make commits into the Linux kernel, which [Brad Spengler](https://x.com/spendergrsec/status/1956322583726399671) called out as “Google indirectly funding extensive network scheduler developer.” My friends termed this “unemployment behavior” because it was all for *free* but honestly this was a worthwhile experience that I would like to continue to pursue - thank you to all the netdev maintainers for the help.

Out of the bugs we found, only 3 were exploitable. The first one was [CVE-2025-38001](https://syst3mfailure.io/rbtree-family-drama/), in which we compromised kernelCTF’s LTS, COS, and mitigation instance for a payout of around 82k. We also caused Google to take down the PoW system afterwards as a member of the Crusaders of Rust Security Research Group managed to break the Sloth VDF with some [Zen5 AVX512 acceleration](https://anemato.de/blog/kctf-vdf).

The second one was [CVE-2025-38616](https://lore.kernel.org/netdev/tFjq_kf7sWIG3A7CrCg_egb8CVsT_gsmHAK0_wxDPJXfIzxFAMxqmLwp3MlU5EHiet0AwwJldaaFdgyHpeIUCS-3m3llsmRzp9xIOBR4lAI=@syst3mfailure.io/), which we publicly disclosed with a very detailed bug report after we failed to find an exploitable path. Unfortunately, it actually was exploitable and we identified the very path required to do so, but could not trigger it due to a single character typo (we jokingly refer to this as the “100k typo”). The gist of the matter was that an attack path would only arise if the crypto algorithms operated in asynchronous mode, which the [cryptd](https://elixir.bootlin.com/linux/v6.6.100/source/crypto/cryptd.c) and socket_alg interface allowed us to force. However, crypto algorithms with SIMD support like [GCM](https://elixir.bootlin.com/linux/v6.6.100/source/arch/x86/crypto/aesni-intel_glue.c) would unconditionally override them back into synchronous mode. We needed to find a crypto algorithm supported by TLS and kernelCTF without SIMD support to trigger exploitability, and CCM was one such candidate. But we made a single character typo - while registering TLS to operate under CCM mode, we registered GCM instead of CCM for asynchronous operation with cryptd. In the end, congratulations to [n0psledbyte](https://x.com/n0psledbyte) of Starlabs for claiming the kernelCTF bounty for an expected reward of 82k-92k, which the 0-day bonus could have brought to over 100k. This is not to say we definitely would have been able to claim this bug bounty, but it remains a funny (albeit painful) story highlighting the difficult and competitive nature of vulnerability research.

Our final submission was [CVE-2024-58240](https://lore.kernel.org/linux-cve-announce/2025082836-CVE-2024-58240-b2b3@gregkh/T/#u). We targeted the COS-113 instance for an expected payout of 21k (as unprivileged user namespaces were not required). Interestingly enough, this bug was caused by a backporting mistake to the 6.1.x branch of Linux in the kTLS subsystem left uncaught for the past 1.5 years - commit [13114dc5543069](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=13114dc5543069f7b97991e3b79937b6da05f5b0) was backported without its dependent commit [41532b785e9d79](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=41532b785e9d79636b3815a64ddf6a096647d011). This submission is a small redemption for our previous blunder.

Overall, I really enjoyed this summer of vulnerability research. Before my MEng, I have not seriously focused on real world VR for a year or two due to other interests at school, following the typical SWE pipeline. The ability to direct my own research and craft actual exploits has re-sparked a passion for this field and I hope to continue with it. Thank you to Professor [Mengjia Yan](https://people.csail.mit.edu/mengjia/) and the MATCHA group at MIT CSAIL for graciously funding my summer research. As always, feel free to let me know of any questions, concerns, corrections, inquiries, or anything else.
