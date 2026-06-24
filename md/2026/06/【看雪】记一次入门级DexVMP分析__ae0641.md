---
title: 【看雪】记一次入门级DexVMP分析
source: https://bbs.kanxue.com/thread-291779.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-25T00:03:29+08:00
trace_id: d5c9dc15-1491-426c-a2bd-53639047b90a
content_hash: 1e8cbd49379b29cf6fd3c790a8bcf430978085e7f5d94687c9d9efd444c205b2
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 通过对加固样本的逆向分析，成功解密了DexVMP保护的代码和字符串，并绕过了反调试检测。
ai_summary_style: key-points
images_status:
  total: 54
  succeeded: 54
  failed_urls: []
notion_page_id: 38975244-d011-81ae-a634-c9806b2cb61a
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - bbs.kanxue.com
    - cdn.jsdelivr.net
    - github.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过对加固样本的逆向分析，成功解密了DexVMP保护的代码和字符串，并绕过了反调试检测。
> 
> - **解密过程：** 在init_array函数中，使用异或密钥解密代码段和数据段，并通过syscall mprotect修改内存权限以生效解密内容。
> - **字符串解密：** 通过匹配特征指令和函数，使用不同异或密钥循环解密出大量十六进制字符串，用于后续分析。
> - **反检测绕过：** 识别出Frida检测函数sub_30310，通过hook该函数使应用不再因反调试而闪退。
> - **VMP执行分析：** 通过trace日志和hook技术，还原了VMP上下文初始化、指令表重排及分发逻辑，确认其模拟Dalvik字节码执行。
> - **文件恢复：** 从APK中提取加密文件，解密头部字节后通过zlib解压，恢复出原始DEX和相关数据。

最近找到一份apk加固样本，粗略的看了下，确定是某搜索引擎的加固，并且部分函数带了DexVMP，可以参考以下大佬的文章  
[某企业加固dex vmp简单分析](https://bbs.kanxue.com/thread-291492.htm)  
[某企业壳逆向分析——从过检测到dex代码抽取还原](https://bbs.kanxue.com/thread-291069.htm)  
[简单分析onCreate](https://bbs.kanxue.com/thread-291584.htm)  
[nmmp基于dex-vm运行dalvik字节码从而对dex进行保护](https://bbs.kanxue.com/elink@712K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6E0j5h3!0S2j5X3y4Q4x3V1k6F1L8h3#2H3)

老套路，先Hook linker call\_array，判断加载到哪个so闪退  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c0bedd4a56215dfc.webp)  
观察Logcat，发现退出会打印 **XOX: state=545**  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/061cd6992034a09d.webp)
  
JNI\_OnLoad 被加密，第三个init\_array函数出现调用未解密的函数，由此判断解密的逻辑在前两个init\_array函数  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/fae7db5ab25ad4c3.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/0a766dad2ccb6395.webp)
  

明显能看出，第一个函数在做一些偏移计算，并且sub\_9F090调用syscall mprotect，这是要修改内存里的代码、数据的前提条件  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/32ca6ac2fc2280ac.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a83c90892cfcf6c2.webp)
  
  
sub\_9F130 解密data段，依次XOR 67 69 BD E7 11 D1 54 3C ，v2起始地址，qword\_D0010对应的是长度  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/488a7203d81a907f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b1c111aea9a092b6.webp)
  
  
sub\_9B7D4 对一个区域的代码做刷新缓存，让解密后的代码/数据生效（D-cache），Hook sub\_9B7D4打印参数一、参数二，出现两次结果，先看第一次  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8833670ed5972235.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/fc25058424a93341.webp)
  
  
0xad080 是data段 起始地址，那么0xb5898对应的是结束地址，  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/92f2056408a0514f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a5f4741881382bbd.webp)
  

sub\_9F370 插了很多不透明谓词，把代码段的解密、修补、权限切换、cache flush 打散进状态机  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b00185e93e98b3ac.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/61e9cb1fb80075a8.webp)
  

这么一看，还原成算法有点麻烦，不过手里有数据段跟代码段需要解密的起始地址跟长度，在执行完sub\_9F370，把这两段给dump下来

dump下来的数据段、代码段，在010编辑器找到对应的偏移，覆盖掉，图下前后对比  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/bdbfb3a1eb4849fe.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/10ab99a6fdc0dfaf.webp)
  

修复完的so，直接打开，不需要sofix（假如内存dump整个so，再sofix，会出现写内存地址，导入函数识别错误的情况）JNI\_OnLoad能正常查看  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3c3de92d8bc19c26.webp)
  
字符串表多了一大堆十六进制的字符串  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6c97be4d9095ef6f.webp)
  
随便挑一个字符串引用的地方，发现统一当做参数1来传给xxx函数  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f08f7dd5c406cd51.webp)
  
malloc申请对应的大小内存，byte\_AE4B9当做key，循环按位异或解密出字符串，算法很简单，但是有很多个字符串跟秘钥，只能用ida python来匹配出字符串+秘钥的组合再模拟解密  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/337b94d59ec0973d.webp)
  
粗略的看下，发现解密算法都一样，唯独key不一样，对应的汇编指令也一样，取下面这组指令，在.text段从头到尾匹配一遍

大概的逻辑是  
1、匹配包含算法特征的函数  
2、函数匹配出key地址  
3、查找当前函数引用  
4、匹配待解密字符串地址  
这样就能解密出大部分的字符串

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ed3562b1b7cea670.webp)

开头有提到Logcat 打印的 **XOX: state=545** ，在字符串表搜索state=，随便找个引用的地方，一目了然，甚至直接打印对应的数字，这就好办，直接搜索545这个常数  
  
有三处地方打印了545，都在同一个函数  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f472d1e221d49650.webp)
  
发现sub\_30310里面全是检测Frida的特征，Interceptor.replace该函数发现应用不闪退了  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dd6ee48bcc109000.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b62d4b0f94aa74c9.webp)
  

分析JNI\_OnLoad，发现一堆不透明谓词混淆，根据混淆设定，这些判断条件永远都不执行，因为dword\_D7ED0所在可读可写区域，ida不清楚它会是什么值，所以伪代码将这些垃圾代码保留，让用户自己去判断，这种情况要么将dword\_D7ED0所在的段修改成只读不可写，或者手动patch 0  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/f6f435dab8083351.webp)

patch完，ida F5重新分析函数，JNI\_Onload变得清新脱俗  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/afa4df6569eaffa1.webp)

用yang佬的dump dex 直接dump出所有dex（会dump出一些奇奇怪怪的）  
[yang佬的dump dex脚本](https://bbs.kanxue.com/elink@15aK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6D9j5i4y4@1K9h3&6Y4i4K6u0V1P5h3q4F1k6#2\)9J5c8X3k6J5K9h3c8S2i4K6g2X3k6s2g2E0M7q4\)9J5c8X3u0D9L8$3u0Q4x3V1k6E0j5i4y4@1k6i4u0Q4x3V1k6V1N6h3#2H3i4K6g2X3k6r3g2^5i4K6u0W2K9Y4x3%60.)

详细的分析过程就不写了，太长了，感觉单独出一篇也够了，索性直接列出

这些文件开头都有共同的特征，14 94 B5 35  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4bd3d56315b905d7.webp)
  
他没有调用assets open，而是打开/data/app/xxx/base.apk，然后按照zip 的方式提取出需要的项目  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1f81cb2423a87a60.webp)
  
提取出来的文件，需要经过一次解密，把头部0x100（d.jar是0x200）给解密还原成zlib正确的文件头，准确来说

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/502d705f1bfdb6af.webp)

  
已知 key 是0x10个字节，固定存放在baiduprotect.md，直接dump g\_payload\_index\_header，让AI给生成对应的解密算法  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/dd1467d261293b4f.webp)

GPT5.5 一拳下去，裤子都给打掉，太强了（代码在文章末尾）  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/6fbbbae2a80070d3.webp)

OnCreate原本的函数体变成AB.v调用，不同的函数，参数一的数值不一样，估计就是用这个来区分vmp method  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4575ca3ea09c5081.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/ac19b55c2fb284c2.webp)
  

AB.v 函数动态注册指向0x4e020

段落引用  
\[RegisterNatives\] java\_class: com.sagittarius.v6.AB name: v sig: (ILjava/lang/Object;\[Ljava/lang/Object;)V fnPtr: 0x78a6d27020 module\_name: libbaiduprotect.so module\_base: 0x78a6cd9000 offset: 0x4e020

方便后续分析，先trace一份日志，推荐几个大佬写的trace项目  
[https://github.com/zgy0x01/QTrace](https://bbs.kanxue.com/elink@644K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6*7k6%4V1H3P5o6l9I4i4K6u0r3f1g2c8J5j5h3y4W2)  
[https://github.com/lidongyooo/GumTrace](https://bbs.kanxue.com/elink@48aK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6D9K9h3c8G2L8X3N6&6L8$3!0G2i4K6u0r3c8%4g2E0g2s2u0S2j5$3f1%60.) 文章用的这个  
**trace过程会报错中断，需要修改transform\_callback，跳过报错指令，不然trace不下去**  
trace完才13M，估计是原本的函数代码也没多少  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/06873d4607e158e8.webp)
  
0x4e020也是很简单的直接调用，这里因为堆栈的原因，ida识别参数错误了，应该后面不是0 0 0 0，而是i2的低16位，跟obj objarr等  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a0970864b868ad83.webp)

g\_vmp\_context\_by\_id\[256\]是已经初始化好的上下文，来源 baiduprotect1.d.jar，跟dex的方式一样，提取、解密头0x200字节、zlib解压，最后vmp\_load\_context\_from\_dex\_and\_register\_bridge解析  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3d59e9751643719e.webp)
  
进来就看到解析Dex头部，解析出一堆Dex 字段偏移地址  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3468d3e51c727b3a.webp)
  
大概还原下返回的结构体，主要method\_ids、class\_defs、field\_ids、string\_ids，因为ins 转换成smali是需要用上这些信息

while循环将初始化的 context 塞进 vmp\_context 数组里  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/1e4e55cf255e9c52.webp)

回到vmp\_execute\_method，参数一命名为vmp\_ctx，参数二是method\_id，其他都是Java层传进来的参数，首先一进来会把JNI参数给压到栈里，最终的handler会去使用  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/e0c8239e2798f7e0.webp)
  
Tips：DexVmp 最后都逃不掉JNI的 反射调用（除if等逻辑运算，所以那些dexvmp dump系统用的jni trace也只能还原一部分call调用）

vmp\_interpreter\_enter 是最终分发 opcode handler的函数，这是强制让ida 识别为Switch的Graph图  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/4535141c203a57bd.webp)
  
大概还原下vmp\_interpreter\_enter参数3 method\_desc 的结构体

从g\_vmp\_base\_handler\_table 取handler，间接跳转过去  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/5d358a7853227e60.webp)

g\_vmp\_base\_handler\_table 并不是按照默认的顺序，第一次调用会根据vmp\_ctx 进行一次重排  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/21b2afb1f9235593.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/fa7df1dbbf64a6b2.webp)
  
  
Frida hook vmp\_build\_runtime\_handler\_table，循环打印g\_vmp\_base\_handler\_table 256次，取指针减去libso base地址，然后patch到ida

重排后的前后对比  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/73729d3c0cae645f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/9ae5743bb5594fe5.webp)
  

当重排handler表，看第一次分发的指令对应的handler，第一次在0x59FF0  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/825ebe075e425cca.webp)
  
0x59FF0在日志只出现一次，它并不是循环解析来调用，类似控制PC，或者goto的形式，第一次调用的是0x60bcc，0x60bcc在handler表排第151（0x97）  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/8872dd2b67273516.webp)
  
0x59f9c 取x26寄存器的两个字节到w22，即0x2097  
0x59fa0 add x8, x16, w22, uxtb #3; w22取低8位，即0x97，对应了上面的0x60bcc  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b598e8e5495e8c53.webp)

0x789bb1ef02 取值来自 \[x19, #0x18\]，对上了 uint16\_t \*insns; // +0x18, VMP 指令起始地址  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/52e37d4f3c26035a.webp)
  
Frida hook vmp\_interpreter\_enter 打印出当前函数所有ins  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c7077214ef7af336.webp)
  
97 20 对上符合 trace日志，注意，目前还是DEX CodeItem 里的 Dalvik 字节码（可能混淆加密过的）  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/c02f8f58f648c074.webp)

一进来看到各种JNI GetMethodID，这时候就可以大胆推测是模拟 invoke-\*\*\*  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/bf1aaa708a9584d6.webp)
  
dex\_get\_method\_ref\_info(a1, method\_idx, out\_class\_idx, out\_class\_desc, out\_name, out\_sig, out\_return\_type) 结合AI给的注释，Frida hook 打印一下，基本确定就是invoke-\*\*\* ，并且只改了opcode，method\_idx 1486也对得上dex里的method\[1486\]  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/a0dba4fc65bef541.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/3ab6f3cf32f1c776.webp)
  

先看下正常的Dalvik 字节码格式跟smali的关系

[回复或点赞可查看完整内容](#quick_reply_form)

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)

* * *

## 评论

> **New对象处 · 2 楼**
> 
> 求各位大佬们分享个简单的arm64 vmp样本 ![](https://bbs.kanxue.com/view/img/face/086.gif)
