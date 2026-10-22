---
title: "Bringing Chinese Chess Master III: Jiangzu Back to Life :: Xusheng Li"
source: https://xusheng.dev/posts/rebuilding-a-dos-xiangqi-engine/
source_host: xusheng.dev
clip_date: 2026-10-22T10:28:42+08:00
trace_id: 2599d72f-fd0d-4bec-867d-a6bc5aa0be4c
content_hash: c786e586705cb462ca6d90a086b134c5c78a50b9f9dd2b9c30a166270ab94751
status: synced
tags:
  - AI辅助逆向
  - 模拟执行
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: |-
  用 Codex 辅助逆向 1992 年 DOS 象棋游戏《將族》的引擎，重写为约 3400 行 C 代码，加入 UCI 和 UCCI 支持，并在 408,708 个局面上与原版逐一比对验证。
  - **引擎结构：** `CMS1.EXE` 是被主程序 `CCH.EXE` 加载的模块，采用 alpha-beta 搜索与手写评估表；36 个“对手”共用同一引擎，差异主要是搜索时间预算或固定两层搜索。
  - **验证方法：** 用 Unicorn 直接运行 16 位原引擎代码，批量生成合法走法局面，在同一深度、关闭开局库的条件下比较选招与分值，发现差异后回溯修复。
  - **细节一致性：** 曾出现双方同招但评分 157 与 156 不一致，追查到炮将军时逃子着法的搜索顺序不同，修正顺序后消除。
  - **收敛与边界：** 最终 408,708 例（多为 2–4 层）走法与分值一致，最后三批各 2 万浅层新局面无差异；但程序等价不可判定，不能称完美重写。
  - **棋力与发布：** 对 `UCI_Elo=1400` 的 Pikafish 13 胜 11 负，粗估 1429；对 ElephantEye 0:8 落败；仓库含引擎与冒烟测试，不含原游戏二进制、开局库与美术。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40175244-d011-81e1-b28c-dcb00e0ce772
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 Codex 辅助逆向 1992 年 DOS 象棋游戏《將族》的引擎，重写为约 3400 行 C 代码，加入 UCI 和 UCCI 支持，并在 408,708 个局面上与原版逐一比对验证。
> - **引擎结构：** `CMS1.EXE` 是被主程序 `CCH.EXE` 加载的模块，采用 alpha-beta 搜索与手写评估表；36 个“对手”共用同一引擎，差异主要是搜索时间预算或固定两层搜索。
> - **验证方法：** 用 Unicorn 直接运行 16 位原引擎代码，批量生成合法走法局面，在同一深度、关闭开局库的条件下比较选招与分值，发现差异后回溯修复。
> - **细节一致性：** 曾出现双方同招但评分 157 与 156 不一致，追查到炮将军时逃子着法的搜索顺序不同，修正顺序后消除。
> - **收敛与边界：** 最终 408,708 例（多为 2–4 层）走法与分值一致，最后三批各 2 万浅层新局面无差异；但程序等价不可判定，不能称完美重写。
> - **棋力与发布：** 对 `UCI_Elo=1400` 的 Pikafish 13 胜 11 负，粗估 1429；对 ElephantEye 0:8 落败；仓库含引擎与冒烟测试，不含原游戏二进制、开局库与美术。

[简体中文版](https://xusheng.dev/posts/rebuilding-a-dos-xiangqi-engine-zh/)

*Chinese Chess Master III: Jiangzu* (象棋大師 III／將族) was a popular DOS Xiangqi game. Its developer’s [historical company profile](https://games.sina.com.cn/zhuanqu/guangpu/intro.shtml) claims 200,000 copies sold. I played a number of games against it when I was yong and won most of them. I’m an [international Xiangqi grandmaster](https://xusheng.dev/posts/grandmaster/), so that wasn’t particularly surprising, but I still found it a worthwhile opponent.

My father is also a Xiangqi fan and used to play this game when he was younger. I found his disk and played it a little myself. It came out in **1992**, the same year I was born.

![The original 將族 title screen, with gold calligraphy and a red seal, running in DOSBox-X](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fbde3b5f0eebc4c3.png)

The original 將族 title screen. Game screenshots captured in DOSBox-X; original artwork belongs to its respective owners.

I liked the interface, especially the opponent-selection screen. It includes characters from the Chinese novel *Journey to the West* (西遊記), each with a portrait and a short description.

![An open-book opponent-selection screen showing Spoon Sa, his portrait, biography, and strength rating](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/85b0daecc430f568.png)

The opponent-selection screen, with Spoon Sa selected.

Eventually I wanted to do more than run it in DOS. Could I preserve the engine and play against it in a modern GUI?

**TL;DR:** With Codex’s help, I rewrote the engine in C, added UCI/UCCI support, and checked it against the original on **408,708 test cases**. [The code is on GitHub](https://github.com/xusheng6/cch-cms1).

## A little background

The game was developed by **Yu Hsi-Shun (虞希舜)** and **T-Time Technology (光譜資訊)**. It grew out of Yu’s earlier Xiangqi programming work and became a commercial DOS game with graphics, named opponents, and a challenge-based progression. [This historical account](https://read.99csw.com/book/579/18112.html) describes how the 1992 release built on the earlier program.

Its 36 opponents look like different personalities, but underneath they share the same engine. Seven use a fixed two-ply search—roughly a move and a reply, with extra tactical searching. The others get different game clocks, which determine how much thinking time the engine can spend. Bogey gets one minute, Hand eight, and Skeleton 47: whole-game allowances, not time per move.

So the characters mostly change the search budget, not the engine’s understanding of Xiangqi. Some even share identical settings.

## Rebuilding the engine

I used Codex to investigate the game and write a portable C version. We used [Binary Ninja](https://binary.ninja/) and disassembly to inspect the DOS code, then [DOSBox-X](https://dosbox-x.com/) to run the game and capture its initialized memory.

![The original Xiangqi board with Spoon Sa’s portrait above the human player’s portrait on the left](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2c834c7685fc3da1.png)

Playing against Spoon Sa in the original DOS game—the board and portraits I wanted to remember, even though the port itself is just the engine.

The engine lives in `CMS1.EXE`, a module loaded by the main game, `CCH.EXE`. It is a classical engine: it searches moves and replies using alpha-beta search, then evaluates positions with hand-written rules and tables.

Getting a working rewrite was only part of the job. It soon agreed with the original on many positions, but there were still plenty of disagreements. I wanted more than an engine that played reasonably well. I wanted this particular engine’s decisions.

That meant recovering the small details too: exact evaluation constants, move order, repetition handling, and special cases in the search.

The rewrite comes to about [**3,400 lines of C code**](https://github.com/xusheng6/cch-cms1/tree/main/port).

## Building a feedback loop

Rather than keep asking Codex to “make it more accurate,” I pushed for a repeatable test loop.

We built a harness using [Unicorn](https://www.unicorn-engine.org/) to run the original 16-bit engine code without clicking through the DOS interface. Then we could:

1.  Generate a large batch of positions from legal move histories.
2.  Run the original and the rewrite at the same search depth, with opening books disabled.
3.  Compare their chosen moves and scores.
4.  Investigate disagreements, fix the rewrite, and repeat with fresh positions.

This is how I think about **harness engineering** here: give the coding agent a way to run its work, measure the result, and get concrete feedback. The original program was our reference, so we did not have to trust that a plausible-looking translation was correct.

Some differences were tiny. In one case, both engines chose the same move, but one scored it 157 and the other 156. We traced that to the order in which they searched escape moves during a cannon check. Fixing the ordering resolved the discrepancy.

As the tests got faster, I kept asking for larger batches. When one batch matched, we generated another.

![The test corpus grows to 408,708 cases across development checkpoints](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e17bd9ca60dd5d0e.svg)

The chart shows the growing test corpus, not an accuracy percentage. The final rewrite matched the original’s move and score on **408,708 cases**, mostly at depths 2–4, with a smaller set of deeper searches. The last three fresh shallow batches had 20,000 cases each and found no differences.

That does not mean the algorithm is a perfect rewrite. Since [program equivalence is undecidable in general](https://arxiv.org/abs/2507.07480), the testing convergence gives me enough confidence to call the rewrite successful.

## How strong is it?

I also wanted a rough strength estimate. Full-strength [Pikafish](https://github.com/official-pikafish/Pikafish) would be far too strong, so we used a version with calibrated strength controls: `UCI_LimitStrength` enables reduced-strength play, and `UCI_Elo` sets the target rating.

Against Pikafish set to 1400, CCH won 13 games and lost 11. That gives a rough estimate of **1,429 on Pikafish’s engine-rating scale**. It is a small sample with wide uncertainty, not an official human Elo. These matches also preceded the final fidelity fixes.

We tested ElephantEye, another open-source Xiangqi engine. It is much weaker than full-strength Pikafish, but still comfortably stronger than CCH: it beat our experimental larger-cache CCH variant 8–0. The [validation notes](https://github.com/xusheng6/cch-cms1/blob/main/VALIDATION.md#strength-is-a-different-question) explain the limitations of these comparisons.

None of that takes away from what I like about the game. I wanted to bring back an opponent my father and I had played, not turn it into a modern champion.

The port now runs natively, speaks UCI and UCCI, and works in my Xiangqi GUI, Pikaboard. The [repository](https://github.com/xusheng6/cch-cms1) includes the engine and smoke tests, but not the original game binaries, opening book, or artwork. Recovered numeric tables are included; [NOTICE](https://github.com/xusheng6/cch-cms1/blob/main/NOTICE.md) explains their provenance and the license scope.

An engine born in the same year as me gets to keep playing.
