---
title: 结合AI对WhatsApp的分析 (一) - 奋飞安全
source: http://91fans.com.cn/post/whatsappone/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:29:03+08:00
trace_id: 1cce7610-f626-499c-a04d-38792911139a
content_hash: 8a7bedc9bfe80363ddfc0dc3e2edfc7315f25f916225b75bc967ea4f000b83d8
status: synced
tags: []
series: null
feed_source: 91fans·逆向
ai_summary: "TL;DR: 结合AI辅助与IDA/Frida，定位新版WhatsApp中libwhatsapp.so的Base64操作并Hook，验证AI在逆向流程中的提效作用。"
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3b275244-d011-8137-b566-c9320197d588
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: 结合AI辅助与IDA/Frida，定位新版WhatsApp中libwhatsapp.so的Base64操作并Hook，验证AI在逆向流程中的提效作用。
> 
> - **核心路径：** 新版APK无libwhatsapp.so，需先安装运行后通过 `find / -name 'libwhatsapp.so'` 在 `/data/user/0/com.whatsapp/files/decompressed/libs.spo/` 找到解压出的so文件。
> - **判断依据：** H算法特征像Base64；Hook Java层Base64函数无结果，推测Base64在so内实现，因此转向IDA分析so。
> - **辅助工具：** IDA配合FindCrypt插件定位so中Base64相关函数，使用Frida按偏移 `0x89F7C8` 附加Hook，读取返回字符串，成功拿到目标数据。
> - **作者观点：** AI能抹平初级与中级程序员的技术差距，但无法替代入门级与资深间差距；未来只会存在使用AI辅助的程序员，并主张借此提高工作效率甚至加薪。TAGS: ["Android逆向","Frida"]

一、目标

## 一、目标

![main](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7b8441dfca0e2d5e.png)

1:main

好希望未来的世界是这样的:

```bash
小X同学，请帮我写一个ws的H算法，并且详细解释入参和结果。
```

可惜现实是这样的

![ws1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c7955a30914f8cf2.png)

1:ws1

也好，起码飞哥还不至于失业，李老板还得老老实实给我发工资。然后含泪退掉了他偷偷买的4090，原计划他准备搭个DeepSeek来优化我的。

## 二、步骤

### 遇事不决先问AI

工具是死的，人是活到。个人认为目前的AI，抹平了初级程序员和中级的程序员之间的技术差距。但是抹平不了李老板和入门级的程序员之间的技术差距。

作为一个有证的程序员，应该这样问AI才靠谱

![ws2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8be4fe686bfa51fc.png)

1:ws2

这里面的关键信息就是 AES SHA256 和 libwhatsapp.so 了，

### 找朋友 libwhatsapp.so

我们遇到的第一个困难就是， 最新版的apk里面只有libsuperpack.so 和 libunwindstack.so， 并没有我们期待的 libwhatsapp.so

不过这也难不倒我们，继续问AI呗。这次 AI给出了几个方案，它怀疑 WhatsApp 可能已经将多个.so 库合并进一个单独的 libsuperpack.so 文件，减少 APK 体积并提高加载效率。

所以我们先安装Apk，然后用上最原始的查找大法

```bash
find / -name 'libwhatsapp.so' -type f

# 结果出来了
/data/user/0/com.whatsapp/files/decompressed/libs.spo/libwhatsapp.so
```

### IDA

这个 H 一看就是个Base64， 所以第一反应就是 hook java的 base64函数，但是没有结果，那就说明大概率是在 so里面做的base64。

这时候就请IDA上场了。

我感觉下一个版本的ida可能就会增加AI窗口了， 咱们直接输入一个:

```bash
请帮我标出这个so中做Base64操作的函数，并且生成frida Hook的代码
```

好吧，在ida没有更新之前，只能飞哥上场了。

挂上心爱的 FindCrypt插件

![ida1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d878e37e61c91d7d.png)

1:ida1

啥也不说了，先Hook它

```javascript
    let libWhatsAppAddress = Module.findBaseAddress('libwhatsapp.so');
    console.log(" ==> libwhatsapp : " + libWhatsAppAddress)

    let offset = 0x89F7C8;
    let funcAddr = libWhatsAppAddress.add(offset);
    Interceptor.attach(funcAddr, {
        onEnter: function(args) {
        },
        onLeave: function(retval) {

            console.log('--> retval: ' + retval);
            try {
                let strIn = Memory.readUtf8String(retval);
                console.log(strIn);
            } catch (e) {
                Log( "#### Base64 A Rc Error");
            }

            console.log(`/* TID ${gettid()} */ =======  Base64 A retval ====`);
        }
    });
```

跑一下 ，熟悉的味道

![rc1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6916a0c3e8ec25c8.png)

1:rc1

## 三、总结

再强调一遍，以后的程序员只会有一种，利用辅助AI工具的程序员。不会使用AI的程序员一定是要被淘汰的。

早用早享受，不用担心AI会替代你，AI的出现只会让你的工作更加高效。以此为理由找李老板提加工资。

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cea195d7b39073a0.jpg)

1:ffshow

这台机器不会取代我们任何一个人

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
