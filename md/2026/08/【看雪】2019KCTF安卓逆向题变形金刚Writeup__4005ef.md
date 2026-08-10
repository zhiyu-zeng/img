---
title: 【看雪】2019KCTF安卓逆向题变形金刚Writeup
source: https://bbs.kanxue.com/thread-292041.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-10T21:06:27+08:00
trace_id: c534c78f-e270-43e8-8a1b-a668004726c0
content_hash: dae4a4881d91a783a07cbbd9f9efe40346e56eb0650a03055c49cac5647a84dd
status: synced
tags:
  - 看雪
  - Android逆向
  - CTF
series: null
feed_source: 看雪·逆向工程
ai_summary: |-
  通过动态注册定位、.init_array解密和魔改RC4/自定义Base64逆向，还原出KCTF安卓题《变形金刚》的正确密码 fu0kzHp2aqtZAuY6。  
  - **入口定位：** 控件 login_button 的点击事件实际执行 AppCompatActivity 中的逻辑；密码来自 m.Password，校验函数是 native 方法 eq，校验通过后 Java 层还会调用 dec 生成 flag，因此只 patch Java 判断无法得到真正 flag。  
  - **解密链：** liboo000oo.so 在加载阶段先由 .init_array 触发 datadiv_decode5009363700628197108，早于 JNI_OnLoad 和 sub_784；byte_4020 前 37 字节、byte_4050 前 66 字节均 XOR 0xA5，40CA 区域 XOR 0xFC 后还原出函数名 eq\0，JNI_OnLoad 再动态注册 eq。  
  - **算法识别：** sub_784 前半段将解密后的 byte_4020 加工成 key：36f36b3c-a03e-4996-8759-8408e626c215；后半段是魔改 RC4，初始 S 表被打乱但仍覆盖 0..255，核心仍是 after_decode[i] = input[i] ^ keystream[i]。  
  - **Base64 与长度：** after_decode 不直接比较，而是转换成自定义 alphabet 的 cmp 后与 24 字节目标比较；目标结尾 3B 3B 对应自定义编码表的 padding ';'，因此 after_decode 实为 16 字节而非 17 字节。反推时应先撤销输出层 XOR：每组第 0 个 XOR 7、第 2 个 XOR 0xF。  
  - **最终输入：** 用动态调试直接截取异或结果得到合法 input，即 password = fu0kzHp2aqtZAuY6，输入后成功打印 flag。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3b875244-d011-810a-8cc7-f58ff978e834
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过动态注册定位、.init_array解密和魔改RC4/自定义Base64逆向，还原出KCTF安卓题《变形金刚》的正确密码 fu0kzHp2aqtZAuY6。  
> - **入口定位：** 控件 login_button 的点击事件实际执行 AppCompatActivity 中的逻辑；密码来自 m.Password，校验函数是 native 方法 eq，校验通过后 Java 层还会调用 dec 生成 flag，因此只 patch Java 判断无法得到真正 flag。  
> - **解密链：** liboo000oo.so 在加载阶段先由 .init_array 触发 datadiv_decode5009363700628197108，早于 JNI_OnLoad 和 sub_784；byte_4020 前 37 字节、byte_4050 前 66 字节均 XOR 0xA5，40CA 区域 XOR 0xFC 后还原出函数名 eq\0，JNI_OnLoad 再动态注册 eq。  
> - **算法识别：** sub_784 前半段将解密后的 byte_4020 加工成 key：36f36b3c-a03e-4996-8759-8408e626c215；后半段是魔改 RC4，初始 S 表被打乱但仍覆盖 0..255，核心仍是 after_decode[i] = input[i] ^ keystream[i]。  
> - **Base64 与长度：** after_decode 不直接比较，而是转换成自定义 alphabet 的 cmp 后与 24 字节目标比较；目标结尾 3B 3B 对应自定义编码表的 padding ';'，因此 after_decode 实为 16 字节而非 17 字节。反推时应先撤销输出层 XOR：每组第 0 个 XOR 7、第 2 个 XOR 0xF。  
> - **最终输入：** 用动态调试直接截取异或结果得到合法 input，即 password = fu0kzHp2aqtZAuY6，输入后成功打印 flag。

马上准备迎战今年的kctf，找了下往年的题练练手。原题在此： [看雪CTF 攻防战](https://ctf.kanxue.com/game-season_fight-93.htm)

已经有前辈发过这题wp了，个人主要提炼了一些做题过程的思考，整理复盘了一下这两天的做题思路。

1.Java 层入口定位： 用控件名 login_button 往回找点击事件，会看到 MainActivity 和 AppCompatActivity 两处都出现了相关逻辑。实际运行时 MainActivity 继承自 AppCompatActivity，并且关键 onStart 在父类中，所以真实执行的是 AppCompatActivity 里的点击处理。 这里能确认两件事：密码来自 m.Password，校验函数是 native 方法 eq；校验通过后，Java 层还会调用 dec 生成最终 flag。也就是说，native 层必须得到正确输入，简单 patch Java 层判断不会得到真正 flag。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bc2f66003cb1f916.webp)

2\. JNI 动态注册与构造器解密 进入 liboo000oo.so 后，JNI_OnLoad 里通过动态注册把 Java 层的 eq 映射到 native 函数。静态看 off_4014 一带时，方法名并不直观，这是因为相关字符串和表在库加载阶段会先被构造器解密。off_4014 本身是 JNINativeMethod 表的起点，后续字段才是指向 sub_784+1 的函数指针。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/778e32d126f5370a.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d5cc9f4a8fb88178.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2f95d4101cdd26b7.webp)

## 构造器解密

datadiv_decode5009363700628197108 是这题很关键的一步。它由.init_array 在库加载阶段触发，早于 JNI_OnLoad 和 sub_784，把多个.data 区域恢复成运行时真正使用的数据。之前讨论里提到的 0xA5就来自这里：byte_4020 的前 37 字节和 byte_4050 的前 66 字节都会 XOR 0xA5。函数名 eq\\0 则是 40CA 一带 XOR 0xFC 后得到的。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3cc0a7c41f42e74c.webp)

3\. Key 生成与魔改 RC4 sub_784 前半段会先把 byte_4020 解密后的内容加工成 key。原文档里通过 IDA 动态调试直接抓到了处理后的 key：36f36b3c-a03e-4996-8759-8408e626c215。这个 key 后面参与 KSA，生成输入异或用的密钥流

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6c305058a0ab04df.webp)

## 魔改RC4

后面的结构非常像 RC4：KSA 初始化置换表，PRGA 每轮交换状态并取 keystream，再与输入字节异或。不同点在于 S 盒不是标准的 s\[i\] = i，而是一张已经打乱但仍覆盖 0..255 的初始表。这种改动不会破坏“输入 XOR 同一密钥流得到 after_decode”的基本性质

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a72c9be22b684c2a.webp)

字符处理逻辑

after_decode\[i\] = input\[i\] ^ keystream\[i\]

input\[i\] = after_decode\[i\] ^ keystream\[i\]

(input ^ key_stream) ^ key_stream = input

4\. 比较目标与长度判断 RC4 之后的 after_decode 并不是直接比较，而是先被编码成 cmp，再与固定 24 字节目标比较。目标数组为：

20 7B 39 2A 38 67 61 2A 6C 21 54 6E 3F 40 23 66 6A 27 6A 24 5C 67 3B 3B

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1c970f06c0ebfd97.webp)

## Base64长度判断

这里最容易误判的是长度。公开源码和 IDA 伪代码都能看到 15163，也就是 0x3B3B。它在小端内存里写入两个 0x3B，正好对应自定义编码表里的 padding 字符 ';'。目标结尾也是 3B 3B，所以这是 Base64 式“剩 1 字节”的尾部分支，after_decode 的长度应为 16 字节，而不是 17 字节

5\. after_decode 转成最终待校验数组cmp，通过Base64转换

cmp 的生成方式每 3 轮循环一次：3 个 after_decode 字节被拆成 4 个 6-bit 下标，再查 byte_4050 表。这个结构和标准 Base64 的分组完全一致，只是换了 alphabet，并且在部分输出字节上额外 XOR。

转换部分如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f85aae3998d7be60.webp)

Base64中3字符转4字符转换逻辑：

q0 = a >> 2

q1 = ((a & 0x03) << 4) | (b >> 4)

q2 = ((b & 0x0F) << 2) | (c >> 6)

q3 = c & 0x3F

题目中的处理方法类似，不过多做了两次异或处理，后续解密时需要先还原

## 从cmp反推afterdecode

6\. 从 cmp 反推 after_decode 反推时要先撤销输出层的 XOR：每组 4 个 cmp 中，第 0 个先 XOR 7，第 2 个先 XOR 0xF；第 1、第 3 个直接查表。最后两个 0x3B 是 padding，不参与还原有效字节

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b80d14b3deec0300.webp)

以第一组为例：目标 20 7B 39 2A 先还原成 27 7B 36 2A；它们在自定义表里的下标是 63、17、58、10。把 6-bit 串拼起来：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3458ade26aed26ab.webp)

7\. 还原最终输入

程序中after_decode=密钥流 xor input

现在已经有after_decode了，直接动态调试代入input的位置，截取到的异或结果就是合法预期input

## 还原最终输入

得到最终 password fu0kzHp2aqtZAuY6

打开app输入，成功打印flag
