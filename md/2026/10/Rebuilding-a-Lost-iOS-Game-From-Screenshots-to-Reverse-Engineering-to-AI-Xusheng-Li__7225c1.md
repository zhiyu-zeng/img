---
title: "Rebuilding a Lost iOS Game: From Screenshots to Reverse Engineering to AI :: Xusheng Li"
source: https://xusheng.dev/posts/rebuilding-a-lost-ios-game/
source_host: xusheng.dev
clip_date: 2026-10-22T10:27:34+08:00
trace_id: 07a18651-f975-4377-97c7-da73ca6ebfcb
content_hash: bba801063c0fcc50e04d7ea9e5b8a6fa5ae24bb829123ca407e3b545d0818adb
status: synced
tags:
  - Android逆向
  - 游戏安全
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: "**TL;DR：** 已下架 iOS 游戏可通过旧购买记录加越狱设备恢复出解密 IPA，逆向出精确的方块生成规则与计分公式，再用搜索式 AI 复现并超越人类分数。"
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40175244-d011-81b6-9a56-fc83ef6bdfa3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 已下架 iOS 游戏可通过旧购买记录加越狱设备恢复出解密 IPA，逆向出精确的方块生成规则与计分公式，再用搜索式 AI 复现并超越人类分数。
> 
> - **回收通道：** 游戏已从 App Store 下架，但旧 Apple ID 在 2016 年购买过，所以仍能通过 ipatool-py 下载到 1.7 版 IPA（App Store ID `1052414239`，Bundle ID `com.balabafire.1010hex`，约 11 MB，FairPlay `cryptid 1` 加密）。
> - **解密条件：** Corellium 虚拟机无法运行 App Store 加密版，必须用真机；iPhone 8 Plus 经 palera1n 越狱，配合 AppSync Unified 与 `appinst` 安装，再用 ipadecrypt（经 `iproxy` 转发 OpenSSH）导出解密 IPA。授权是否可用取决于 Apple ID，并不取决于原先下载的设备。
> - **六边形模式规则：** 二进制在 Binary Ninja 中显示为 22 种方块（1 个单格点加 21 个四格形），等概率 `1/22 ≈ 4.545%`；另有 2 个形似方块的掩码常量未加入活动目录。棋盘有 61 格，中线 9 格，三条轴向可消行；1 级即开放全部方块。
> - **计分公式：** 普通放置不得分；消行得分为 `去重格子数 + 行数 × (10 + 5 × (行数 - 1))`，即 1/2/3/4 行分别为 10/30/60/100 分，交叉格只计一次。方形模式另用 9 个形状族加权重 20 的生成器，例如点与 3×3 各 5%，2×2 占 15%。
> - **AI 对局：** 同一 20 局固定种子、每局上限 1000 步，随机平均 49.75、贪心 1055.30、采样 expectimax 最高 3721.55（单局最高 10346），随机 rollout 中位数更优但耗时翻倍；神经网络加搜索反而更差（2532 对 5074）。作者妻子最好成绩约 6000 分。

My wife used to play an iOS puzzle game called *Block Crush Blitz*. When we wanted to install it on a new iPad in march 2026, we found that it was no longer available in the App Store. She liked the game, and it did not look too complicated to recreate. So I decided to give it a try. Happy wife, happy life.

I started by asking [Claude](https://claude.ai/) to rewrite it from screenshots. That got us a working game quite quickly, but some of the pieces were different from the original. To figure out which pieces should actually appear, I eventually had to download the old app, buy an iPhone, jailbreak it, and reverse engineer the executable. Then I got distracted by another idea: how well could an AI play this game?

## The first attempt: rebuild what I could see

In March 2026, I gave Claude screenshots of the original game and asked it to recreate it. The rules are simple: drag a piece onto the board, and when a line is full, the blocks on that line disappear. On the hexagonal board, lines can run in three directions.

I asked Claude to reproduce the shapes and colors in the images. I used [Flutter](https://flutter.dev/) so I could run it on both the iPad and my Mac, and I called the remake [Hexris](https://github.com/xusheng6/hexris). After a few rounds of fixing dragging and adjusting the piece sizes, it was playable.

![The first Hexris remake running in hex mode](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/65d6cdb67c62acb5.png)

However, after playing it for a while, we noticed that some pieces did not seem to belong. The remake generated shapes that we did not remember seeing in the original, and some were quite difficult to place.

I tried removing the shapes that seemed wrong. This improved the game, but I was still relying on memory. I did not know whether I had removed the right pieces, or whether the remaining ones appeared with the right frequencies.

At that point I wanted to find the original app and look at its code. There had to be a piece generator somewhere in it.

## Recovering a delisted IPA

Getting a copy was harder than I expected. The app was no longer listed in either the Chinese or US App Store. I also thought I might have saved a copy on my Mac, but could not find one.

Fortunately, my wife’s Apple ID had acquired it in 2016. Although the listing was gone, Apple still had a copy available to that account. An archived store page helped us identify the App Store ID, `1052414239`, and bundle ID, `com.balabafire.1010hex`.

I used [ipatool-py](https://github.com/yuhao7370/ipatool-py) to download it from Apple. The downloader needed some fixes because Apple’s authentication endpoints had changed, but eventually it worked. I got version 1.7, an IPA of about 11 MB.

Of course, an IPA downloaded from the App Store is still encrypted with FairPlay. Both the ARMv7 and ARM64 slices had `cryptid 1`. I could inspect the resources and some unencrypted data, but the code I needed was in the encrypted region.

## Why a virtual iPhone was not enough

I did not have a jailbroken device, so I first looked into using [Corellium](https://www.corellium.com/). I hoped I could sign into the account on a virtual iPhone, launch the app, and dump the decrypted code there.

That did not work out. Corellium requires an already-decrypted IPA for this use; its virtual devices cannot run the encrypted App Store copy through the normal Apple services. I had the wrong half of the solution.

I bought an iPhone 8 Plus and jailbroke it with [palera1n](https://github.com/palera1n/palera1n). Getting the phone into DFU mode took many attempts. I watched videos, retried the button sequence, and kept seeing the Apple logo. After replacing the USB cable, I finally got it working. I had spent quite a bit of time blaming my button timing.

I then signed into the account that had acquired the app and installed the encrypted copy using `appinst`, with [AppSync Unified](https://github.com/akemin-dayo/AppSync) on the phone. It launched! This worked because the authorization to use the purchased app was tied to the Apple ID, rather than limited to the device on which it was originally downloaded. I could use that account on the newly bought iPhone to run the encrypted copy, even though the app was no longer listed in the store.

For the dump, I used [ipadecrypt](https://github.com/londek/ipadecrypt), which handled the device-side helper and produced a decrypted IPA for analysis. It used [OpenSSH](https://www.openssh.com/) to communicate with the phone, with the USB connection forwarded through `iproxy` from [libusbmuxd](https://github.com/libimobiledevice/libusbmuxd).

This was a nice discovery on its own. An app disappearing from the store does not necessarily mean its binary is lost. In this case, a previous purchase let me download it, and a compatible physical device let me run it. It still depends on Apple serving the app and on the old app working on the available iOS version. A purchase record alone cannot guarantee either of those things.

## Reverse engineering the game

The game uses [Cocos2d-x](https://github.com/cocos2d/cocos2d-x) and native C++. Before decryption, we had already checked the resources for shape definitions. There were UI scenes and sprite atlases, but no gameplay scripts or per-piece images. The game draws pieces by repeating a single hexagonal sprite. The actual shapes were defined in the executable.

With the decrypted ARM64 code open in [Binary Ninja](https://binary.ninja/), we could finally follow the catalog construction and random selection routines. The answer to my original question was quite specific: hex mode has **22 possible pieces**, consisting of a one-cell dot and 21 four-cell shapes. Each entry is selected uniformly, with a probability of `1/22`, or about 4.545%.

There were also two masks elsewhere in the configuration that looked like pieces, but they were not added to the active catalog. Simply collecting every shape-like constant would have given us the wrong answer. We needed to follow how the generator used them.

![The 22 recovered hex pieces](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ee92db7054b8a21b.png)

We also checked the surrounding rules. The board has 61 cells, with nine across the middle. Full lines clear along three axes. A used tray slot is replaced immediately, and the game ends when none of the three available pieces can fit. The level calculation does not change the active hex piece distribution in version 1.7; all 22 entries are already available at level one.

Scoring was another difference from the first remake. Ordinary placement gives no points. When a move clears lines, it awards:

```text
distinct cells removed + lineCount × (10 + 5 × (lineCount - 1))
```

Intersections count only once among removed cells. The line bonuses are therefore 10, 30, 60, and 100 points for one, two, three, and four simultaneous lines.

The square mode turned out to use a different generator. It selects one of nine shape families using integer weights totaling 20, then selects an orientation uniformly within that family. For example, the dot and 3×3 square each occur 5% of the time, while the 2×2 square occurs 15%. Hex mode is simpler: all 22 active catalog entries are equally likely.

I asked AI to add the recovered rules to Hexris as an optional Classic mode, keeping Undo for convenience. The previous version remains the default, so we can play either one.

## Then I wondered: can an AI play it?

After getting the rules working, I suddenly wanted to see how well an AI could play. I asked the coding agent to try a few approaches using a simulator of the recovered hex rules.

We compared random moves, a greedy player that evaluates one move at a time, a trained version of that evaluator, and two search methods that look ahead at possible future pieces. Each played the same 20 seeded games, with a limit of 1,000 moves per game:

| Agent | Mean score | Median score |
| --- | --- | --- |
| Random | 49.75 | 18.5 |
| Greedy | 1,055.30 | 899.5 |
| Learned linear | 1,061.95 | 661.0 |
| Sampled expectimax | **3,721.55** | 2,537.0 |
| Stochastic rollout | 3,256.90 | **2,777.0** |

Looking ahead helped much more than tuning the evaluator. Expectimax had the highest average score, with its best game reaching 10,346. Rollout had a slightly better median, but took more than twice as long.

I also tried a small neural network. Combined with search, it averaged 2,532 points in a separate test, versus 5,074 for the handwritten evaluator on the same seeds. So the neural version did not improve things this time.

Here is one complete expectimax game. It is a representative run rather than the longest one: 2,309 points over 235 moves. The three available pieces are shown below the board, and the gold outline marks the piece that was just played.

 Your browser does not support embedded video. [Download the video](https://xusheng.dev/posts/rebuilding-a-lost-ios-game/ai-play-expectimax.mp4) instead.

My wife’s best was around **6,000 points**. This was not a controlled comparison, but it was fun to see some of the agents’ games exceed that score.

I originally expected to spend a little time getting Claude to draw a board and some pieces. I certainly did not expect to buy an old iPhone to find out which pieces belonged in it. But now I think it is totally worth the time and effort!
