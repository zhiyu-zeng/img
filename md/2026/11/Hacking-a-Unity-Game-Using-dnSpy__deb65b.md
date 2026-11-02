---
title: Hacking a Unity Game Using dnSpy
source: https://0xk3r0.github.io/posts/unity-reverse-engineer/
source_host: 0xk3r0.github.io
clip_date: 2026-11-02T10:43:31+08:00
trace_id: 663bd33e-608b-4dfd-bcb4-8936c503c7a8
content_hash: fc4f1ec17257282c953132b5742f037d439c33f33914f24aa9cd5102f652190c
status: synced
tags:
  - .NET逆向
  - 游戏安全
series: null
feed_source: Kyrillos Nady·iOS/Android RE
ai_summary: 用 dnSpy 逆向 Unity 游戏 `Assembly-CSharp.dll`，将扣血逻辑改为加血，即可实现角色无敌、轻松通关。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 0
  failed_urls:
    - https://miro.medium.com/v2/resize:fit:1100/format:webp/1*gh72Up3J1GCURdlPBEMUXA.png
    - https://miro.medium.com/v2/resize:fit:750/format:webp/1*s1oVKZ_DCo0QqZ1P7amtQg.gif
    - https://miro.medium.com/v2/format:webp/1*WzOhMDh41DHt7BXc8j1z0g.png
notion_page_id: 40c75244-d011-814d-9f32-d0211ad2cd4d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 dnSpy 逆向 Unity 游戏 `Assembly-CSharp.dll`，将扣血逻辑改为加血，即可实现角色无敌、轻松通关。
> 
> - **游戏难点：** 目标游戏 HORROR MAZE 中僵尸碰到玩家即瞬间死亡，击杀一只僵尸需 4 发子弹，关卡难度极高。
> - **逆向入口：** Unity 应用基于 .NET/C#，全部游戏逻辑集中在游戏目录的 `Assembly-CSharp.dll` 中，用 dnSpy 直接打开即可浏览源码。
> - **关键代码：** 定位到 `EnemyHealth` 类的 `TakeDamage` 方法，它将伤害从当前血量中扣除，血量 ≤ 0 时触发 `Die()`。
> - **破解手法：** 把 `this.currentHealth -= damageAmount` 改为 `+=`，僵尸每次攻击反而给玩家回血；游戏本身已有防溢出检查，血量不会超过上限。
> - **操作步骤：** dnSpy 中右键方法 → Edit Method (C#) 修改代码 → Compile → 顶栏 Save All 保存 → 关闭 dnSpy 启动游戏即生效。

Hi everyone! In this article, I’ll walk you through an example of hacking a Unity application using a tool called **dnSpy**. The target? A Unity game developed by my friend **George**.

It all started when my friend challenged me to beat the **first-level** of her game. He made it intentionally difficult, confident I couldn’t pass it. As a cybersecurity enthusiast with a focus on penetration testing and reverse engineering, I accepted the challenge — but I had a few tricks up my sleeve.

* * *

## The Game: HORROR MAZE

[![⚠️ 图片托管失败](https://miro.medium.com/v2/resize:fit:1100/format:webp/1*gh72Up3J1GCURdlPBEMUXA.png)](https://miro.medium.com/v2/resize:fit:1100/format:webp/1*gh72Up3J1GCURdlPBEMUXA.png) Let me introduce you to the game. It’s called **HORROR MAZE**. Once you hit the start button, you’re dropped into a maze filled with zombies. You’re armed with a gun, and your mission is to survive and shoot the zombies. There’s a health bar on the bottom-right corner of the screen showing your current health. Here’s the catch:

-   If a zombie touches you — you die instantly.
-   It takes **four bullets** to kill a zombie.
-   That’s why the level is so tough!

* * *

## How Unity Applications Work

Unity applications are built using the **.NET framework**, meaning the underlying code is usually written in **C#**. When you explore a Unity application, you’ll find a DLL file called `Assembly-CSharp.dll`. This file contains all the game logic — and this is what we’ll reverse engineer.

* * *

## Step-by-Step: Reversing with dnSpy

First, download and open [**dnSpy**](https://github.com/dnSpy/dnSpy/releases) — a powerful tool for **.NET** reverse engineering. Once open:

1.  Go to `File > Open` and select the `Assembly-CSharp.dll` file from the game directory.
2.  Browse through the code to understand how the game mechanics work.
3.  In my case, I found the class responsible for managing the player’s health.

Here’s a snippet of the code I found:

```csharp
using System;
using UnityEngine;

public class EnemyHealth : MonoBehaviour
{
    private void Start()
    {
        this.currentHealth = this.maxHealth;
    }

    public void TakeDamage(int damageAmount)
    {
        this.currentHealth -= damageAmount;
        if (this.currentHealth <= 0)
        {
            this.Die();
        }
    }

    private void Die()
    {
        base.gameObject.GetComponent<Animator>().SetBool("Death", true);
    }

    public int maxHealth = 100;
    private int currentHealth;
}
```

## The Hack: Infinite Health

As you can see, this method handles damage:

```csharp
public void TakeDamage(int damageAmount)
{
    this.currentHealth -= damageAmount;
    if (this.currentHealth <= 0)
    {
        this.Die();
    }
}
```

It subtracts the damage from your current health. When health hits 0, the player dies.

But here’s the funny part: I changed it to **add** the damage instead of subtracting it:

```csharp
this.currentHealth += damageAmount;
```

[![⚠️ 图片托管失败](https://miro.medium.com/v2/resize:fit:750/format:webp/1*s1oVKZ_DCo0QqZ1P7amtQg.gif)](https://miro.medium.com/v2/resize:fit:750/format:webp/1*s1oVKZ_DCo0QqZ1P7amtQg.gif)

So now, every time a zombie hits me, my health increases instead of decreasing! 😂

The game already has a check in place that prevents overflow, so there were no issues with the health going above the max limit.

To make this change in dnSpy:

1.  Right-click on the method → Select **Edit Method (C#).**
2.  Modify the code
3.  Right-click again → Choose **Compile**
4.  From the top bar, click **Save All** to apply changes
5.  Close dnSpy and launch the game

And NOW — I’m now invincible in the game. The zombies keep attacking, but I don’t lose a single point of health. Mission accomplished. 🎉

[![⚠️ 图片托管失败](https://miro.medium.com/v2/format:webp/1*WzOhMDh41DHt7BXc8j1z0g.png)](https://miro.medium.com/v2/format:webp/1*WzOhMDh41DHt7BXc8j1z0g.png)

**THANKS FOR READING ❤️**
