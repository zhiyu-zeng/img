---
title: 【看雪】记录一次完整的IL2CPP手游逆向（frida）——以某二游为例
source: https://bbs.kanxue.com/thread-292432.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-11T13:55:16+08:00
trace_id: b4ada828-ec64-445c-b092-f143dbe859b4
content_hash: d92fc9ad2f9dd4315a3b3176e57931cfc1b26d8af5c9f1526acd8b1ce7fd187d
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 单抽改十抽可行：通过Frida Hook RC4加密函数和Send_begin，解析出该二游网络包格式为4字节消息ID+Protobuf Varint编码数据，修改抽卡数量位即可实现。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3b975244-d011-8162-ba26-df85ce518a39
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 单抽改十抽可行：通过Frida Hook RC4加密函数和Send_begin，解析出该二游网络包格式为4字节消息ID+Protobuf Varint编码数据，修改抽卡数量位即可实现。
> 
> - **目标环境：** 使用Frida 16.x + frida-il2cpp-bridge，配合Il2CppDumper和dnspy分析某二游，`global-metadata.dat`未加密，可直接Dump出C#类与方法。
> - **关键Hook点：** 在`libil2cpp.so`中Hook RC4类的`Crypt`函数（偏移0x2FB80A8），可捕获TCP传输明文数据；打印调用栈并结合dump.cs比对，确定发送函数为`Send_begin`，由此确认消息格式为`[4字节消息ID][Protobuf编码数据]`。
> - **协议解码验证：** 抽卡请求消息ID为`0xa2b`；后续数据按Protobuf Varint编码解析，如`08 d2 10 10 01`对应两个int32字段：poolSn=2130、num=1，验证单抽/十抽仅由最后一个字节（0x01单抽、0x00十抽）区分。
> - **修改效果：** Hook `Send_begin`并在发送前将第5字节改为0x00，游戏内点击单抽会触发十抽动画；材料不足10张时提示材料不足，验证修改生效。

本文仅用于安全研究与技术交流，所有分析均在本地测试环境完成。  
请勿将文中方法用于任何侵犯他人权益或触犯法律法规的行为。  
因使用本文内容产生的任何后果由使用者自行承担，与作者无关。

## 0x001 目标与环境

## 目标

本文的目标是使用 `frida` 、 `frida-il2cpp-bridge` 等工具来实现对某二游的抽卡相关的功能进行一些简单的逆向。

## 环境

Frida16.x + frida-il2cpp-bridge  
Il2CppDumper  
一部已root的Android设备  
脑子。。。

## 0x010 基础工作

1.  apk  
    从网上下载好安卓apk安装包，然后使用解压工具提取出来数据。  
    本文提取结果如下图：  
    ![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bc297ca56098d452.webp)
    
2.  adb  
    将usb与安卓设备进行连接，再使用adb工具将安装包推送到手机进行安装。  
    安装完毕后，再用adb获取一些基础信息，比如获取包名之类的信息等等。
    
3.  il2cppDumper  
    将解包出来的apk文件夹中的 `global-metadata.dat` 和 `libil2cpp.so` 这两个文件作为输入送入il2cppDumper，比较幸运地是，本文逆向的二游并未对 `global-metadata.dat` 文件加密，正常的文件魔术是开头前4个字节应该为 `0xAF 0x1B 0xB1 0xFA` ，其余开头的一律判断为已加密，对于加密的文件，本人还没找到方法实现解密，目前对本文来说已经可以了，该文件并未加密。美滋滋~  
      
    下图是用il2cppDumper工具获取的dump文件：  
      
    其中本文主要使用的是 `dump.cs` 以及 `DummyDll\Assembly-CSharp.dll` 这两个文件。
    
4.  dnspy  
    将 `Assembly-CSharp.dll` 输入到dnspy工具中可以查看一些类的相关签名，主要是便于搜索、分析函数的使用、被引用情况以及查看某个类或者某个函数在那一个dll模块中，这是为了方便frida-il2cpp-bridge查找Base。  
    如下图：  
    
5.  frida以及frida-il2cpp-bridge  
    自己去网上查找环境配置等相关工作，本文不再开展，对于frida需要为手机中放置一个frida-server，同时电脑上用pip下载frida注意版本一定要统一，脚本文件用的是ts、js来做需要提前准备nodejs。  
      
    上图是进行hook的目录，如果之前配置好开发环境会有 `node_modules/` 、 `package.json` 这两个文件，先修改好package.json文件再生成node包，如下图：  
      
    注意版本，frida-il2cpp-bridge太高的版本可能不和frida兼容，这里 `watch` 的 `your_hookname_index.ts` 这个文件将来就是写hook脚本，爱取啥取啥都无所谓，运行 `npm run watch` 此时就会将这个ts文件编译为 `hook.js` 文件，注意这个文件才是真正被frida读取的hook文件。
    
6.  正式hook游戏  
    adb连接后用su启动frida-server文件，frida使用 `spawn` 模式和运行时hook都是可以的，以下是两种方式的命令：
    

```python
1、frida -U -f com.xxx.xxx -l hook.js    // com.xxx.xxx是游戏包名称
2、frida -UF -l hook.js
```

运行后没有报错hook基础工作到此结束  
如图：

```typescript
// index.ts
import "frida-il2cpp-bridge";

setTimeout(() => {
    Il2Cpp.perform(() => {
        console.log("Hello Frida!");
    });
}, 1000);
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/956736679688ffff.webp)

## 0x011 简单分析

我的目标是想要查看抽卡相关的功能并尝试修改，以下是一些简单的分析。

1.  从简单做起吧，先找抽卡相关的英文，这里列举几个 `Gacha、Summon、Lottery、Pool、Probability、Rate` ，先去dump.cs里面搜索一下这些字段，对于本文分析的游戏来说，仅仅只有Gacha这个名称有相关的类以及成员方法，如下图：  
      
    这里Gacha相关的字段几乎都是围绕着抽卡的历史数据围绕，这个其实没啥意思，因为游戏中就能直接查看。。。所以在dump.cs相关的字段基本没有了，所以这条路不太好。
    
2.  后面用ai辅助分析了2、3天了，发现这个游戏是用Lua写游戏逻辑，而C#提供渲染、网络、资源加载等事件，像抽卡这种核心逻辑都放到lua里面了，而apk中的lua代码已经被编译为LuaJIT字节码了，网上工具比较少，我也懒的折腾了，所以再研究一下C#这边的代码。C#这边就直接hook网络传输这些事件了，由于dump.cs代码足足有上百万行，我干脆把类名提取出来，然后让ai找一下网络相关类，下图是部分类展示：  
    

```java
// Namespace: xxx
public class RC4 // TypeDefIndex: 1988
{
    // Fields
    private byte[] S; // 0x10
    private int _i; // 0x18
    private int _j; // 0x1C

    // Methods

    // RVA: 0x2FB78F4 Offset: 0x2FB38F4 VA: 0x2FB78F4
    public void .ctor(byte[] key) { }

    // RVA: 0x2FB80A8 Offset: 0x2FB40A8 VA: 0x2FB80A8
    public void Crypt(byte[] pt, int start, int end) { }
}
```

其中这个 `rc4` 类非常重要出现这个类可以说明这个游戏 `tcp` 传输可能用 `rc4` 对数据包进行加解密，换句话来说我只要hook了 `Crypt` 这个函数那么在该游戏网络传输中，我就能捕获到明文的数据， `Crypt` 函数三个参数解释一下，第一个pt是字节数组，数据应该存在这里，第二个start和第三个end用于指示pt的开头和结尾，应该是这样理解的，说干就干，下面代码就是对这个函数的hook：

```typescript
import "frida-il2cpp-bridge";

setTimeout(() => {
    const module = Process.findModuleByName("libil2cpp.so");
    if (!module) return;
    const base = module.base;

    Interceptor.attach(base.add(0x2FB80A8), {
        onEnter: function(args) {
            this.bufPtr = args[1];
            this.start = args[2].toInt32();
            this.end = args[3].toInt32();
            this.len = this.end - this.start;
            
            // onEnter是加密前/解密前的原始数据
            const preData = this.bufPtr.add(0x20).add(this.start).readByteArray(this.len);
            console.log(`[RC4 PRE] (${this.len}B) ${hexdump(preData, { offset: 0, length: Math.min(this.len, 64) })}`);
        },
        onLeave: function(retval) {
            // onLeave是加密后/解密后的数据
            if (this.len >= 4) {
                const postData = this.bufPtr.add(0x20).add(this.start).readByteArray(this.len);
                console.log(`[RC4 POST] (${this.len}B) ${hexdump(postData, { offset: 0, length: Math.min(this.len, 64) })}`);
            }
        }
    });
}, 1000);
```

通常来说onEnter此时获取到的是未加密的数据，而onLeave获取的是加密后的数据，捕获结果如下图：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e670cfd567a7ffd8.webp)

加密后的数据暂时不用关心，只看加密前的数据，经过多次触发同一个事件验证发现像 `0x00 0x00 0x04 0xb1` 开头前4个字节总是重复出现，切换其他事件时前4个字节又会发生变化，这很难不让人猜想，这前4个字节的用途，起初我猜想的应该是用来标记每个事件的id号吧？用的uint32_t存储的数据，那么不妨大胆猜想，假设有9B数据，前4B猜想为事件id号，那么后面5B应该就是传输的数据包信息了吧？但是这5个字节的二进制数据我如何转换为人类可读的信息呢，这时需要找到该apk使用 `Protobuf` 传输协议定义了，这里是第二个猜想：后续5个字节就是按照 `Protobuf` 协议规则填充的，在之前解包的apk文件中的确存在定义传输协议的文件，如下图：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f9f215ae979c41d4.webp)
  
以上是一种message定义，有两个字段，而名称和type一目了然，所以现在 `Protobuf传输协议定义` 我也有了，那么找到二进制数据与message对应这也只是时间上的问题了，不过不好找，我不可能从5w多行的传输协议中找到某条符合二进制数据的message吧，所以还是使用过滤，将含有 `Gacha` 相关的message都放到一个文件中，单独分析，现在新的protobuf只有1000行，现在就好多了。

接下来，要分析抽卡，观察一下抽卡的数据包（其实还是看不懂。。。）  
**抽卡数据包**

```typescript
第一次抽卡（单抽）：
[RC4 PRE] (9B) // 记住这9B数据，后续经常要用
00000000  00 00 0a 2b 08 d2 10 10 01                       ...+.....
[RC4 PRE] (9B)
00000000  00 00 04 5e 0d 00 80 fa 43                       ...^....C
[RC4 PRE] (150B)
00000000  00 00 06 4a 18 00 10 49 10 28 10 2f 10 45 10 10  ...J...I.(./.E..
00000010  10 1d 10 0f 10 21 10 0a 10 24 10 11 10 4e 10 16  .....!...$...N..
00000020  10 1a 10 43 10 0b 10 50 10 07 10 0c 10 1c 10 32  ...C...P.......2
00000030  10 36 10 1e 10 1b 10 08 10 20 10 39 10 26 10 46  .6....... .9.&.F
```

3.**猜想验证一**

在分析它时先把之前的猜想给验证了，之前我的猜想是 `头4B为事件ID，后面的全为数据` 这是第一个猜想，那么如何验证呢，方法也很简单，看看是谁调用了我这个 `Crypt` 函数，也就是说需要打印堆栈信息，

```typescript
    Interceptor.attach(base.add(0x2FB80A8), {
        onEnter: function(args) {
            this.bufPtr = args[1];
            this.start = args[2].toInt32();
            this.end = args[3].toInt32();
            this.len = this.end - this.start;
            
            // onEnter是加密前/解密前的原始数据
            const preData = this.bufPtr.add(0x20).add(this.start).readByteArray(this.len);
            console.log(`[RC4 PRE] (${this.len}B) ${hexdump(preData, { offset: 0, length: Math.min(this.len, 64) })}`);
            // 这里是新加的打印堆栈代码
            console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                        .map(DebugSymbol.fromAddress).join('\n'));
        },
```

**输出**

```typescript
// 格式：文件偏移 lib库!RVA

0x704a82ac6c libil2cpp.so!0x2fb7c6c
0x704a82ad7c libil2cpp.so!0x2fb7d7c
0x704a82afb0 libil2cpp.so!0x2fb7fb0
0x704a6cae0c libil2cpp.so!0x2e57e0c
0x7049ae39b0 libil2cpp.so!0x22709b0
0x6ed2d8f398 libtolua.so!tolua_closure+0x24
0x6ed2e872d4 libtolua.so!lj_BC_FUNCC+0x2c
0x6ed2e9c6c4 libtolua.so!lua_pcall+0x98
0x704a77a008 libil2cpp.so!0x2f07008
0x704a783c64 libil2cpp.so!0x2f10c64
0x704a776984 libil2cpp.so!0x2f03984
0x704a70d864 libil2cpp.so!0x2e9a864
0x704a8d3764 libil2cpp.so!0x3060764
0x704a859150 libil2cpp.so!0x2fe6150
0x704a880fec libil2cpp.so!0x300dfec
0x704a88bc70 libil2cpp.so!0x3018c70
```

这里打印了调用堆栈，从 `底部` 到 `顶部` 是 `第一层调用` 到 `最后一层（当前函数不包含）调用` ，换句话说第一行的RVA：0x2fb7c6c就是我上一层调用了我这个 `Crypt` 函数，但有一个问题，这个RVA地址实际上在dump.cs中并未找到完全符合的函数，这是由于存在ASLR的关系，导致dump.cs里面的静态RVA无法对应上动态获取的RVA，实际上解决这个办法很简单，就是找出和这个0x2fb7c6c最相近的RVA地址，如下图所示：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2fb2f1fe7e528277.webp)
  
也就是这个Send_begin函数，其中这个函数的参数含义大概是第一个int是消息ID，第二个是字节数组，第三个是数据长度，看到这里其实答案已经出现了，前4字节就是存储的int类型的消息ID，而后续的都是data数据，动手验证一下吧

```typescript
// index.ts
import "frida-il2cpp-bridge";

setTimeout(() => {
    const module = Process.findModuleByName("libil2cpp.so");
    if (!module) return;
    const base = module.base;

    // Send_begin RVA: 0x2FB7C8C 这里hook了Send_begin函数
    Interceptor.attach(base.add(0x2FB7C8C), {
        onEnter: function(args) {
            const msgId = args[1].toInt32();
            const dataPtr = args[2];
            const dataSize = args[3].toInt32();

            if (dataSize > 0 && dataSize < 10000) {
                const data = dataPtr.add(0x20).readByteArray(dataSize);
                console.log(`\n[Send_begin] msgId=0x${msgId.toString(16)} (${dataSize}B)`);
                console.log(hexdump(data, { offset: 0, length: Math.min(dataSize, 80) }));
            }
        }
    });
}, 1000);
```

**输出**

```typescript
// 这里需要去抽卡数据包（第一次抽卡的）那里的代码对照一下
Crypthook的结果是：
[RC4 PRE] (9B)
00000000  00 00 0a 2b 08 d2 10 10 01 

[Send_begin] msgId=0xa2b(5B)
00000000  08 d2 10 10 01
```

这里非常明显msgId=0xa2b这个就是头4字节，到此对于数据格式的验证初步解析结束

**协议格式初步总结**  
该二游发送出的数据有两部分组成：

```cpp
[前4B：mesId][后续字节：data]
```

4.**猜想验证二**  
第二个猜想是后续字节的填充是按照 `Protobuf` 协议填充的，这里需要介绍一下网络传输 `Protobuf` 协议是如何发挥作用的。  
**Protobuf**  
Protobuf为了减少传输字节数，尽可能用少的字节来表达数据，于是Protobuf使用Varint编码规则来对数据进行编码，

```cpp
Protobuf编码 = Tag(1B) + Value(NB)

对于Tag的编码:
    这里Tag指的是前文message_type种的field编号，用于指示哪一个field，
    比如第一个filed它的number为1，那么对其编码就会将1 << 3位，再加上type字段的编码，
    这里假设type=TYPE_INT32，那么type字段的编码就是三位编码000b，
    那么组合起来Tag = (0b0000 0b1000) | 0b000 = 0x08

对于Value的编码:
    这里Value指的就是filed对应的数值了，每字节最高位是【是否继续】标记，低7位是数据，按小端序拼接：
    0x01       0000 0001              1 字节，值=1
    0x81 0x01  1000 0001 0000 0001    2 字节，值=(0x01 << 7) | 0x01 = 129（十进制）
    0xd4 0x10  1101 0100 0001 0000    2 字节，值=(0x54) | (0x10 << 7) = 2132（十进制）

组合起来Protobuf最终的编码是（以上面案例组合）:
    1、0x08 0x01
    2、0x08 0x81
    3、0x08 0x08 0x52
```

具体如何编码的可以找其他文章查阅，这里我仅仅只是简单介绍。

**尝试解码**  
这里我选取前文捕获到的抽卡数据，比如这个 `0x08 0xd2 0x10 0x10 0x01` 这5个字节的数据，我自己手动解码一下，过程如下：

```cpp
开头是一个0x08字节，按照前文介绍的Varint编码这个应该是一个Tag标记，用于指示哪个字段的，
之前也分析过了这里0x08解析出是filed.number = 1，type = TYPE_INT32，
所以这个应该是字段1类型是int32，接下来分析后续的Value由于字段类型是int32，
所以后面四个字节 `0xd2 0x10` 应该是Value，解密：Value = (0x10 << 7) | (0x52) = 2130，
后续字节估摸着也是一个字段，这里解密省略，分析后发现后续这个字段也是一个int32的类型，Value = 1,
```

**总结一下**  
这个5个字节代表的含义是该message拥有两个字段，两个字段都是int32类型的，第一个字段的Vaule是2130，第二个字段的值为1，猜想验证基本没问题，后续的data就是使用Varint进行编码。  
结合之前的分析

```cpp
[前4B：mesId][后续字节：使用Varint编码的明文数据]
```

5.**分析 `0x08 0xd2 0x10 0x10 0x01`**  
这5B数据是当时我单抽情况下触发的，现在就是要分析找找看是哪一个message定义的这个数据，经过我和ai的不屑努力（笑哭），终于锁定了一个名叫"xxxxxx"的message定义

```cpp
message_type {
  name: "xxxxxx"
  field {
    name: "poolSn"
    number: 1
    label: LABEL_REQUIRED
    type: TYPE_INT32
  }
  field {
    name: "num"
    number: 2
    label: LABEL_REQUIRED
    type: TYPE_INT32
  }
  options {
  }
}
```

这里数据都能对上，但含义我不能完全保证对的上，于是我又去验证，这里poolSn给出的含义是卡池Id，而字段2的num估计就是抽卡的数量吧，那么我就换一个卡池、换十抽测试一下，如下图这里我只换了十抽测试：

```cpp
十连抽的数据(没带msgId)： 角色池
[Send_begin] msgId=0xa2b size=5 // 待分析字节
           0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
00000000  08 d4 10 10 00                                   .....

[Send_begin] msgId=0x45e size=5
           0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
00000000  0d 00 80 fa 43                                   ....C

[Send_begin] msgId=0x64a size=146
           0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
00000000  18 00 10 49 10 28 10 2f 10 45 10 10 10 1d 10 0f  ...I.(./.E......
00000010  10 21 10 0a 10 24 10 11 10 4e 10 16 10 1a 10 43  .!...$...N.....C
00000020  10 0b 10 50 10 07 10 0c 10 1c 10 32 10 36 10 1e  ...P.......2.6..
00000030  10 1b 10 08 10 20 10 39 10 26 10 46 10 4f 10 44  ..... .9.&.F.O.D
00000040  10 48 10 15 10 2e 10 12 10 01 10 23 10 18 10 09  .H.........#....
```

很明显，最后的0x00就是代表的是十抽的含义，也就是说，协议使用0x01代表单抽，0x00代表十抽，除外，后面两个数据包5B和146B的数据包单抽和十抽的差不多了，所以不用管他们的数据。

## 0x100 尝试对数据包进行修改

根据前文所述，要对数据包修改，比较直观的效果是将 `单抽` 改为 `十抽` ，也就是在发送之前hook，然后修改data\[4\]这个字节为0x00，这样原本按单抽的按钮实际发送要抽取十抽的请求，案例代码如下：

```typescript
import "frida-il2cpp-bridge";

setTimeout(() => {
    Il2Cpp.perform(() => {
        const TcpClient = Il2Cpp.domain.assembly("Assembly-CSharp")
            .image.class("xxxxx.xxxxx");

        TcpClient.method("Send_begin", 3).implementation = function (msgId: number, data: Il2Cpp.Array<number>, dataSize: number) {
            if (msgId === 0xa2b && dataSize === 5) {
                const bytes = Memory.readByteArray(data.handle.add(0x20), dataSize);
                console.log(`\n原始: 5
`);

                // 强制改成十抽
                data.handle.add(0x20 + 4).writeU8(0x00);

                const modified = Memory.readByteArray(data.handle.add(0x20), dataSize);
                console.log(`修改后: 5
`);
            }
            return this.method("Send_begin", 3).invoke(msgId, data, dataSize);
        };
    });
}, 1000);
```

**输出**

```cpp
原始:            0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
00000000  08 d2 10 10 01                                   .....
修改后:            0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
00000000  08 d2 10 10 00                                   .....
```

很明显数据已经改变了，这里不方便上游戏实际抽卡的效果图，这里我口述测试效果：  
**游戏抽卡测试**

1.  当材料未满10张时，此时点击单抽，直接触发 `材料不足请搜集好材料` 之类的提示框；
2.  当材料已满10张时，此时点击单抽，此时触发的不是单抽的动画，而是十抽的动画。

**小结一下**  
经过以上两个测试说明本文的分析和修改应该是正确的。

## 0x101 最后

如果对以上分析有任何疑惑的，欢迎通过邮箱QQ `2636427505@qq.com` 来找我。  
还请记住以上技术仅做交流学习，切忌做超过底线的事情。  
若要引用本文，还需与作者联系。

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm) [#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm)
