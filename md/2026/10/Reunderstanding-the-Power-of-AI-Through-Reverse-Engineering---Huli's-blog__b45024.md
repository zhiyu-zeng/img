---
title: Reunderstanding the Power of AI Through Reverse Engineering - Huli's blog
source: https://blog.huli.tw/2026/04/18/en/ai-reverse-engineering-op/
source_host: blog.huli.tw
clip_date: 2026-10-13T10:25:35+08:00
trace_id: 1e0b1c07-135d-43d3-8698-730421fd43d4
content_hash: a13e3bf0fd3c9ac9e4729d176dfbdc1dbfdbd2de55aef557d277a35f52c013c1
status: synced
tags:
  - AI辅助逆向
  - 脱壳与加固
series: null
feed_source: Huli·安全/逆向
ai_summary: AI 已能端到端完成逆向（静态分析、脱壳、解密、绕过反调试），作者的认知从"AI 干不了这个"变成"我才是限制 AI 的人"。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-8152-be6e-f7dd3d0e9488
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AI 已能端到端完成逆向（静态分析、脱壳、解密、绕过反调试），作者的认知从"AI 干不了这个"变成"我才是限制 AI 的人"。
> 
> - **工具与成本：** Cursor + Claude Opus 4.6 高思考模式，不装 skills，提示词仅一句"把 xxx 文件夹下的 apk 逆回源码"；单个 App 约 30 分钟、不到 5 美元，Claude Code 跑 Unity 游戏耗 4000 万 token 约 27 美元。
> - **代表性打法：** Cocos2d 游戏纯静态分析定位 Blowfish 与逐字符拼接的 32 字节密钥；另一款用 Unicorn 无果后转 Frida hook 公开的 `xxtea_decrypt` 取密钥；Unity 游戏靠 1500 个密文文件前 54 字节重复，猜明文为注释符 `-`，反推 6 字节循环 XOR 密钥 `c3 70 43 22 34 a6`，另有案例还原 1 万行 Lua 源码。
> - **银行级 App：** 商业壳加密 `.text` 与 `.rodata`，native 层含扫 `/proc/self/maps` 反注入、读 `/proc/self/task/*/comm` 查 `pool-frida` 线程、`ptrace` 反调试，Java 层有 Root/模拟器/SSL Pinning 检测，AI 自行脱壳并逐一绕过，成功 hook 请求。
> - **失败与陷阱：** 双重加密的商业壳游戏（Case 7）一天未能完全脱壳，改从加密 Lua 资源侧拿到核心逻辑；AI 有时只还原接口就"编"出合理逻辑，必须追问实现代码。
> - **核心结论：** 客户端没有秘密，加固只是拖延时间；AI 的成功来自"观察—尝试—按日志调整"的循环，只要环境、日志、验证和时间给够，桌面临、APK、WASM 都能逆。

Previously, I wrote a post titled [Using AI to Do Simple Reverse Engineering](https://blog.huli.tw/2026/03/01/en/reverse-engineering-with-ai-ghidra-mcp/), describing how I combined an AI agent with Ghidra MCP to reverse engineer a stripped Golang binary. Although there were some minor errors in the results, the overall direction was correct.

Nearly two months have passed, and during this time, I used AI to reverse engineer more things, including many that I thought AI couldn’t handle. However, AI slapped me in the face, revealing that I was the ignorant one.

This article documents what AI can achieve and concludes with how this experience has changed my perspective on AI.

## Selected Cases

The following cases are all Android applications unless otherwise specified.

### Case 1: Cocos2d Game

After AI unpacked the APK, it used jadx to decompile the Java and found that the game logic was not included.

Upon observation, it was discovered that the game was written in Cocos2d, with a large number of encrypted JavaScript and JSON files under the assets directory, as well as a `libcocos2djs.so`.

The next step was to parse the symbols within `libcocos2djs.so`, where some encryption and decryption functions were indeed found. However, since this SO file was 35 MB, AI deemed it too large and chose to reverse engineer from the decryption functions instead, identifying that the encryption algorithm was Blowfish.

Next, I traced who called the function that set the key, and after decompiling that segment, I restored the key, which was constructed in the original code by concatenating strings one by one:

```c
std::string key;
key.push_back('7');  // MOV W8, 0x37
key.push_back('2');  // MOV W8, 0x32
key.push_back('c');  // MOV W8, 0x63
key.push_back('d');  // MOV W8, 0x64
....（32 in total）
```

This is particularly noteworthy because before attempting this method, AI first scanned the code to see if there were any strings resembling the key, but found none. By this point, AI understood that since the key was added one by one, it was not continuous in the code and could not be directly scanned.

Then, I wrote a Python script to decrypt all resources, ultimately obtaining the JavaScript and restoring the game logic and client-side configuration.

This case primarily involved pure static analysis, where AI used static analysis alone to find the encryption and decryption functions as well as the key-setting location, then decompiled back to derive the key’s content and decrypted the game resources.

### Case 2: Another Cocos2d Game

Similarly, after unpacking and using jadx, it was found that the DEX had a shell added. However, this game was also observed to be Cocos2d, so the DEX was set aside for now, and AI first looked at `libcocos2djs.so`, where a suspicious key was found.

However, since this key could not decrypt the encrypted JSC, AI took a different approach and used Unicorn Engine to simulate the execution of this SO, but there was no progress, as it got stuck after running for a while.

Since static analysis did not yield results, AI switched to dynamic analysis, installing an Android emulator and Frida to hook multiple parameters. Both `Memory.scanSync` and `fopen` failed, and later AI looked for the functions exported by `libcocos2djs.so`, discovering that `xxtea_decrypt` was public, so AI hooked `xxtea_decrypt`.

After running the game, AI obtained the correct key and restored the encrypted JSC files, which also contained the game logic and configuration.

After reaching this point, since the game had already been restored, AI stopped. I wanted to continue testing its capabilities, so I said to it, “Why don’t you try to unpack that shell?” As a result, the protection of that shell was quite weak, and after running it, frida-dexdump quickly dumped all the DEX.

This case switched from static analysis to dynamic analysis with hooking, and also conveniently unpacked a shell (although the shell was quite weak).

### Case 3: Unity Game

After unpacking the APK, there were three SO files: libil2cpp, libunity, and libxlua. It was speculated that the core logic was at the Lua layer. AI then used Il2CppDumper to unpack the global-metadata, extracting some C# files and DLLs. After decompiling with ILSpy, it was found that they were all classes with empty implementations (seemingly how IL2CPP works?).

Using jadx to decompile Java also yielded some SDKs, with no game logic, so AI focused on finding the Lua files.

Using UnityPy to scan all asset bundles for TextAssets, AI only found four Lua scripts, none of which contained the core game logic. From the C# code AI obtained earlier, AI found some strings indicating that the game had a hot update system. AI attempted to download using the URLs and AES key and IV found within, but all returned 404 errors and could not be downloaded.

Later, AI turned back to the asset bundle and found a bundle containing 3000 TextAssets (which AI didn’t check the first time). From the file names, AI confirmed they were encrypted Lua scripts.

Upon observation, AI noticed that many of these files had the same first 6 bytes, speculating that they were the beginning of Lua 5.3 compiled bytecode. AI attempted to reverse-engineer the key using XOR but found it impossible to decrypt. Then AI tried several different encryption methods, various AES modes, but still couldn’t decrypt it.

Next, AI decompiled libil2cpp and saw that the decryption process indeed used XOR, and the key was a 6-byte sequence that repeated. In C#, AI couldn’t find it using a static method with global-metadata, and AI hit a roadblock, so I intervened.

I asked him, “Would dynamic analysis be faster?”

The AI provided two options: one was Frida hook, and the other was Unicorn simulation. I chose the latter, and during the script writing, the AI cleverly cracked it using a different method. It said it observed those files and found that the first 54 bytes of half of them were identical, and they were a repeating sequence of 6 bytes: `c3 70 43 22 34 a6`.

If the key is a 6-byte repeating XOR, then the repetition in the ciphertext indicates that the plaintext is also repeated. What Lua file would have so many identical characters at the beginning?

The AI boldly guessed: “Comments.” Lua comments start with `--`, and many frameworks have a habit of placing a long comment starting with `-----` as a separator. Based on this assumption, it XORed to obtain the key, then decrypted the Lua scripts, discovering that everything was unlocked, revealing readable source code.

The key to this case is that the AI is observant and employs various methods to attempt decryption. Below is the process the AI followed while solving this case, showing that it tried many methods in between but none worked, so it moved on to the next method:

```sql
XAPK unpack
  ↓
Il2CppDumper + ILSpy + JADX  ← standard workflow, nothing unusual
  ↓
UnityPy scan → only 4 tool scripts found  ← assumed core logic is server-side
  ↓
Locate AppConfig → obtained CDN URL and AES key
  ↓
Attempt download → all 404  ← dead end
  ↓
Re-examine AssetBundle → found encrypted files!
  ↓
Inspect ciphertext → noticed repeating 6-byte pattern
  ↓
❌ Wrong assumption: Lua bytecode → derived incorrect keystream
  ↓
❌ Tried AES-CBC/ECB/OFB/CTR/CFB → none matched
❌ Tried RC4 → no match
❌ Tried .NET Random (10K seeds) → no match
  ↓
Reverse engineered libil2cpp.so → confirmed it's simple repeating XOR (not a stream cipher)
  ↓
❌ Tried statically finding ENCRYPT_BYTES → failed
❌ Tried metadata defaultValues → failed
❌ Tried ELF GOT/RELA → too deep
  ↓
Revisited ciphertext patterns → 1500 files share a 62-byte prefix
  ↓
💡 Hypothesis: plaintext is repeated '-' (0x2d) → XOR to recover key → decryption succeeded!
```

### Case Four: Another Unity Game

Similar to the previous one, it was also discovered to be Unity + Lua, but this time the decryption method was simpler. After dumping the C#, AI searched using “encrypt” as a keyword and directly found the LuaEncryption key and the custom asset bundle offset, needing to skip the first 12 bytes.

Next, AI skipped 12 bytes and used the key to XOR, obtaining the Lua bytecode (this time it was bytecode, not source code), which was then concatenated into a large asset.

Next, the AI wrote a Python script:

1.  Skip the first 12 bytes of the custom header
2.  Scan all positions marked with `UnityFS\x00`
3.  Cut into independent bundles by offset
4.  Parse each bundle using UnityPy
5.  Extract all `.lua.bytes` files
6.  Decrypt each file using the key with XOR

This resulted in over 7000 Lua JIT bytecodes, which were then all fed into ljd to recover, yielding much more readable Lua source code, totaling 10 million lines.

This case is similar to the first one; static analysis handled everything, directly finding the encryption key and method, recovering all resources.

### Case Five: Obfuscated App

This is a common app that has undergone some protection. The Java layer has been obfuscated to make it difficult to reverse, and the encryption and decryption logic is placed in the so files, accessed via JNI. When sending requests, it goes through some encryption plus a signature; if the algorithm cannot be cracked, it cannot be used outside the app.

The AI discovered that after obfuscation, it wrote a de-obfuscation script that restored several core class names, then began to reverse-engineer that section of the so file, using capstone + lief to disassemble the arm64-v8a version, restoring it to pseudo-C.

With this code, further analysis was possible, ultimately restoring the encryption and decryption algorithms along with the key.

So, despite the obfuscation, the AI could derive some methods to attempt restoration through observation. Even if it couldn’t restore everything, the AI’s ability to read obfuscated code is far superior to that of a human.

### Case Six: Bank-Level App

After trying the above cases, I decided to challenge the boss: a bank-level app.

Banks usually have stricter requirements for information security, so there will definitely be a lot of encryption, obfuscation, and packing, along with various anti-root and anti-hook mechanisms. Therefore, “bank-level” refers to similar specifications.

The goal is clear: to be able to open the app on a rooted emulator and hook to see the request content. Achieving this means that the internal protection mechanisms have been bypassed.

This bank-level app is packaged with what is commonly known as a commercial shell (meaning a shell specifically made by a certain company; these commercial solutions can be quite expensive, costing hundreds of thousands of TWD per year), with the main logic contained in a so file.

The AI first used `objdump -h` to check the section headers and found two non-standard sections. Then, more than half of the `.text` section was encrypted and could not be disassembled, and the `.rodata` section was also completely encrypted. However, from other clues, it had already inferred which company’s shell it was.

Next, the AI began trying to remove the shell of the so file, experimenting with several methods that all failed, such as attempting to brute-force the key.

After several failed attempts, it started to solve some areas that could be resolved. After trying a few methods, it understood how the shell operated and successfully removed it.

Once the shell was removed, it could see what was inside and the protective measures in place. At the native layer, there were these protections:

-   Anti-injection detection: Scanning `/proc/self/maps` for memory mappings like `frida-agent`, `frida-gadget`, etc.
-   Thread name scanning: Reading `/proc/self/task/*/comm` to find Frida characteristic threads like `pool-frida`.
-   Anti-debug: `ptrace(PTRACE_TRACEME)` self-attach to prevent debuggers.
-   String matching: Searching for Frida keywords in memory using functions like `strstr`, `strncmp`, etc.
-   SO shell: The `.text` segment is encrypted, dynamically decrypted at runtime, making static analysis impossible.

At the Java layer, there were these:

-   Root detection: `File.exists()` checks for paths like su, magisk, supersu, etc.
-   Emulator detection.
-   SystemProperties detection.
-   Anti-debug.
-   SSL Pinning.

The bypass method was to hook various methods in advance, making them undetectable, and then the native layer would pass the results to Java, where patching could also be done. Since it was already aware of the detection methods, it could handle them accordingly.

As for the obfuscation at the Java layer, the AI wrote a 1000-line Python script based on various rules to restore the strings, resulting in highly readable strings.

In summary, it was successful in the end; the app could be opened, and requests could be hooked, with all protective measures bypassed.

### Case Seven: A Packaged Game

Since learning that AI could also remove shells, I thought perhaps there was nothing that AI couldn’t crack, so I looked for another packaged game.

This game’s difficulty was higher than the previous one; it also used a commercial shell and implemented double encryption. Its dex was first encrypted with one so file, and then that so file was encrypted with another so file, while the entry point’s so file itself was also shelled, preventing decryption.

I let the AI try for a day, but in the end, it didn’t yield any results. Even though I found other articles online that had already removed the shell, it still couldn’t fully crack it; the shell of the so file remained intact, and it encountered some obstacles.

However, after I directed the AI to change its approach, it discovered that the main logic of this Unity game was actually in Lua. Although the resources in Lua were encrypted, after observing the encrypted hex, it quickly identified the pattern and managed to decrypt it.

So, although the Java layer’s code wasn’t fully decrypted and the shell wasn’t removed, the core game logic was obtained.

This should count as a success, right? Given more time, more reference materials, and better tools, I believe it could also remove that shell.

## My AI Usage and Costs

I used Cursor paired with Claude Opus 4.6 high thinking, without installing any skills, and the prompt was very simple:

> There is an apk under the xxx folder, reverse it to restore it to the original code.

If it got stuck on something midway, I would give it some instructions, for example, when encountering a shelled file:

> How did it achieve static analysis resistance? What kind of encryption method is used, and when will it be decrypted? Try to see if you can remove the shell.

Sometimes, I would give more specific instructions:

> Let’s plan what to do next; I’m going to sleep soon.
> 
> 1.  Restore the.so to C.
> 2.  Check what other protections the apk has and how to crack them.
> 3.  Restore the Java from the obfuscated code; at least understand the logic or observe which patterns indicate it’s Android’s own lib.
> 
> These are the main tasks. I want you to have a thorough understanding of the protection methods of this apk, as if you have the source code, and come up with a cracking method.

I granted it all permissions, and it installed all the tools itself. It usually starts with static analysis, and when it gets stuck for a long time, I switch it to dynamic analysis, installing an Android emulator with Frida hook.

I observe what the AI is doing, and if I feel it’s straying too far from the direction, I intervene and give suggestions (though this happens rarely). After the AI finishes, I ask it to summarize what it did, where it got stuck, and how it resolved those issues.

After reversing many apps, I summarize these experiences into skills, allowing for faster speeds next time.

The time taken to reverse each app varies, but most are around 30 minutes. I haven’t calculated the tokens in detail, but under Cursor’s billing, reversing an app costs less than 5 dollars.

However, I also tried using Claude Code once, and one Unity game took 40 million tokens, which translates to about 27 dollars.

Therefore, a more fair statement would be that, purely based on token usage, I guess the average falls around 30 dollars. As for why using Cursor is so cheap, I don’t know; it’s clearly the same model.

## The Limitations of AI

Although it is said that everything that can be solved has been solved, some things are only perceived to be solved, but in reality, they are not done well at all.

For example, after decompiling a game’s APK, it usually uses some tools to extract DLL files and then restore them to C#. Typically, my instruction is to “restore the source code,” but sometimes it only restores to the interface, with only method definitions and parameters, lacking the implementation logic.

Next comes the part where AI can easily deceive you. Even if it only has the interface, it can guess the operational logic based on these names and structures, so if you ask it to write a report analyzing what is present, it can write convincingly.

If you don’t follow up on the details, you might think it has truly restored the source code, but that’s not the case.

This is a place that requires great caution. I always follow up with it, asking, “So, did you get the source code? Let’s take a look at the implementation of the login system; we need to see the implementation for it to count,” forcing it to dig deeper and restore what I want.

This confirmation process is very important; without this step, it becomes incomplete, and you can be deceived by AI. Conversely, if you confirm properly, the output from AI will definitely satisfy you.

## Some Insights

### It Turns Out I Limited AI

My previous understanding of AI was: “Reversing some small things is definitely no problem, but it probably can’t unpack,” but later AI proved me wrong.

That’s when I realized I was the limiter of AI.

I hadn’t tried it myself, but I thought AI couldn’t do it. In the past, during software development, I had similar thoughts; some tasks I did myself because I felt AI couldn’t handle them. For example, needing to modify multiple projects simultaneously, or a larger feature that required a deep understanding of the overall architecture, I would think AI couldn’t do it, so I might as well do it myself.

But later, as I started delegating more and more tasks to AI, I found that it could handle most of them, reaffirming that I was the limiter of AI. No wonder some people say that in certain fields, those who don’t understand use AI better because they don’t assume AI can’t do something and let it try everything; if it can’t do it, then they address it.

Returning to the topic of AI reversing, I observed the processes of AI reversing so many apps and found that, at its core, they are all the same: making various attempts and observing the output, then improving based on the output or trying a different approach.

For example, once Frida hooks are set up, if the hook fails, it will modify based on the error log. If the app closes itself after the hook, it will change the timing of the hook or test which part is being detected, then make adjustments.

Perhaps, as long as you can provide AI with an environment where it can thrive, ensure it can see enough logs and validate correctness, and give it enough time, there is nothing that cannot be reversed. I later also tried desktop apps and wasm, and they worked too.

Even if it’s packed, as long as you let AI observe and track, just like the human reversing process, it can slowly observe, take action, adjust based on results, and then try again, repeatedly, until it succeeds.

Although I already knew AI was strong, I didn’t expect it to be this powerful. As I mentioned before in [a previous post](https://blog.huli.tw/2023/04/27/en/android-apk-decompile-intro-1/), I have a bit of knowledge about reverse engineering, but when it comes to the native layer, I am completely lost, while AI has surpassed my capabilities, accomplishing things I couldn’t do, even things I thought it couldn’t do.

After this exploration, my perspective on AI’s capabilities has completely changed, and I have given more thought to the idea of “AI replacing software engineers.” If what I said earlier, “there is nothing that cannot be reversed,” is true, can this also be applied to software development? If AI can plan, write code, test, and validate results on its own, could it continuously run and produce a complete application with good quality?

Let’s save this topic for later; there are other angles we can explore together.

### The Balance of Offense and Defense

As long as it is something on the client side, there are no secrets.

Obfuscation or packing is just a way to delay the time it takes to be reversed; as long as enough time is spent, all your code runs on the client, so everything can be reversed.

Therefore, many defensive techniques are based on “increasing difficulty to prolong cracking time.” We all know there are no secrets on the client, but there are still some things on the client side that we want to protect as much as possible to increase the difficulty of reversing.

Thus, the defending side obfuscates the code, turning variables into a bunch of unreadable text, or even encrypting constants that can only be decrypted when executed, not wanting you to see the plaintext so easily. Packing is the same; they don’t want you to easily see what is running inside, and anti-debugging is also aimed at preventing you from rooting, hooking, or debugging, so they try to detect whether various reverse engineering tools exist.

On the other hand, the attacking side spends time reversing your original logic, relying on experience to speed up, knowing that this pattern looks like AES, this looks like XOR, this pattern has appeared before, and figuring out how to crack it, etc. As long as the defending side makes even a slight adjustment, the final output could be completely different, and the attacking side would need to start over.

However, with AI reversing becoming so powerful, will the positions start to reverse? The shell that the attacking side spent so much time creating could be removed by AI in just an hour. After thinking of so many obfuscation methods and implementing a new algorithm, AI could just look at it and write a reverse script, reassembling everything back together.

If the defenders want to keep up, they may need to use magic against magic, using AI to obfuscate. Each time they obfuscate, they should use a completely new method or pattern, and it’s not just a simple change; it should be made more complex by AI to ensure that the attackers have to start from scratch.

But even so, in front of AI, will it only take one or two hours to crack it? I don’t know.

## Summary

I am not a reverse engineering expert, so I won’t comment much on the impact of AI in this field. But at least for someone like me who is not very skilled in reverse engineering, AI has almost completely met my needs for reverse engineering. Desktop applications can be reversed, APKs can be reversed, WASM can be reversed, shells can be stripped, and encryption can be decrypted.

For binary reverse engineering, although sometimes I need to assist in opening Ghidra and help set up Ghidra MCP, these are minor issues.

After this experience and witnessing the capabilities of AI, I have already submitted to AI.

Is there anything that AI cannot crack? Perhaps there is; for example, the case I mentioned above, Case Seven, has not actually been cracked. It just obtained what I wanted in a different way without fully restoring the APP. But aside from that, it has indeed cracked everything else (by the way, I am curious if AI can crack the [commercial shell](https://www.hybridclr.cn/en/docs/business/basicencryption) of HybridCLR, but I haven’t encountered this commercial version yet).

Is it possible that I make AI reverse engineering sound very powerful, while in the eyes of professionals, it is not that impressive? That is also possible, after all, the things I have dismantled can also be dismantled by the experts in the kanxue (a well-known reverse engineering community in China), and some things have already been dismantled and shared, which AI has referenced.

But in any case, the original intention of this article is to record my experience with AI reverse engineering, summed up in one word: “amazing”. This experience has completely influenced my view of AI’s capabilities.

And it’s not “AI-assisted reverse engineering”; it’s full AI reverse engineering. The tool installs itself, analyzes itself, and decompiles itself. I just stand by and say, “You should be able to crack this, try again.”
