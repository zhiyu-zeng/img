---
title: 【看雪】罗克韦尔（Rockwell）PLC 开发 EtherNet/IP 通讯协议驱动：连接、并发、结构体模板与 .acd 归档的完整实现
source: https://bbs.kanxue.com/thread-293455.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-07T21:57:22+08:00
trace_id: 06263422-4109-433a-8d62-c72ce3f04346
content_hash: 62448b5fbcc6017d4ad977b1d20f3095faa65bdcb1eb3367ad075b65126bc40a
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41175244-d011-8168-873b-ca7806110f08
ioc: null
---

> 本文记录一个纯 C#（.NET 4.0，零依赖）为罗克韦尔 Allen-Bradley ControlLogix /  
> CompactLogix / SoftLogix 系列 PLC 开发的 EtherNet/IP 通信驱动全过程。  
> 目标环境为 SoftLogix5800 v21.11（1789-L60/A），所有结论均经真机抓包/实测验证，  
> 关键代码可直接在文末指向的仓库结构中复现。

## 目录

1.  [EtherNet/IP 与 CIP：一分钟背景](#1-ethernetip-%E4%B8%8E-cip%E4%B8%80%E5%88%86%E9%92%9F%E8%83%8C%E6%99%AF)

-   [核心库功能总览](#%E6%A0%B8%E5%BF%83%E5%BA%93%E5%8A%9F%E8%83%BD%E6%80%BB%E8%A7%88)

## 1\. EtherNet/IP 与 CIP：一分钟背景

EtherNet/IP 是 ODVA 标准的工业以太网协议，它在标准 TCP/UDP 之上封装了 **CIP（Common Industrial Protocol）** 对象模型。与 Modbus 这类"地址+功能码"的扁平协议不同，CIP 世界里一切皆是 **对象** （Object）：

-   **Identity Object（0x01）**：厂商 ID、设备类型、产品代码、版本、序列号——即"这台设备是什么"；
-   **Symbol Object（0x6B）**：控制器里的标签（变量）元数据；
-   **Template Object（0x6C）**：用户自定义结构体（UDT）的 **成员布局模板**；
-   **Message Router（0x02）**：所有读写的入口。

报文分两层：

```python
┌─────────────────────────── EIP 封装头（24 字节，固定） ───────────────────────────┐
│ Command(2) Length(2) SessionHandle(4) Status(4) SenderContext(8) Options(4)      │
├──────────────── CIP 头（InterfaceHandle 4 + Timeout 2 + ItemCount 2）─────────────┤
│ ┌─ Item 1: Connected Address (0x00A1) → Connection ID ──┐                        │
│ ┌─ Item 2: Connected Data  (0x00B1) → 序号(2) + CIP 服务 ─┤                        │
│ │   Service(1) RequestPathSize(1) RequestPath(N) Data(M) │                        │
│ └─────────────────────────────────────────────────────────┘                        │
└───────────────────────────────────────────────────────────────────────────────────┘
```

两类核心命令：

-   **SendRRData** （未连接报文）：注册会话、ForwardOpen、按符号名读写（每次都带完整路由）；
-   **SendUnitData** （连接报文）：建立 CIP 连接之后的常规读写，开销更小—— **生产环境应该用这类**。

"按符号名读一个标签"本质上是：对 Message Router 实例发 `Read Tag (0x4C)` 服务，请求路径里编码 ANSI 扩展符号段（0x91）。听起来简单，但魔鬼全在细节里，下面逐个讲。

## 核心库功能总览

在进入实现细节之前，先把这个驱动 **能做什么、怎么做** 交代清楚。驱动对外暴露的主类是 `AllenBradleyEipDriver` （命名空间 `AB_EIP_CONTROL_LOGIX_SERIES` ），主要功能与实现位置的对应关系如下：

| 功能  | 对外 API | 实现要点 | 详见  |
| --- | --- | --- | --- |
| 设备连接 | `Connect(ip, slot, port)` / `Disconnect()` | TCP 44818 → RegisterSession → ForwardOpen/LargeForwardOpen 大包协商 | §2  |
| 设备信息 | `ControllerInfo` | Identity Object 解析 + CIP 厂商/设备类型编码表 → RSLinx 风格描述 | §2  |
| 单标签 / 批量读 | `Read(List<string>, out List<PValue>)` | 多服务打包（0x0A）+ 按协商包大小分组 + Partial Transfer 自动降级单读 | §3、§4 |
| 数组批量读 | `Read(tag, count, out List<PValue>)` | 0x4C 带元素个数一次取回连续元素 | §5  |
| 结构体整体读写 | `Read/Write` + `ValueStruct` | Template Object 模板解析 + 按成员偏移编解码 | §5、§6 |
| 结构体数组 | 同上，tag 带 `[i,j]` | 元素路径请求 + 模板按结构句柄解析 | §5、§6 |
| 位地址读写 | `Read/Write("Tag.0" / "Tag.DN")` | 符号路径位段解析；位写走 Read-Modify-Write（0x4E） | §3  |
| 在线变量树 | `LoadSymbolsFromPLC()` + `Browse(handle)` | Symbol Object 0x55 实例列举 + 懒加载逐层展开 | §8  |
| 离线变量树 | `LoadSymbolsFromFile(path)` | .acd 工程归档解析（TagInfo.XML），无需连接 PLC | §7  |
| 外部访问权限 | `ItemAddress.ExternalAccess` | 在线取 0x55 属性 10；离线从 Comps.Dat 提取 | §8  |
| 断线自动重连 | `Reconnect` 配置 + 三个事件 | 指数退避重试 + 连接重建 + 阻塞调用唤醒 | §9  |

分层架构上，代码按职责切成四层，下层对上层透明：

```python
┌────────────────────────────────────────────────────────┐
│ 应用层：Read/Write/Browse/LoadSymbols*/事件    (驱动主类) │
├────────────────────────────────────────────────────────┤
│ 编解码层：StructCodec 结构体模板编解码 / PValue 值体系     │
├────────────────────────────────────────────────────────┤
│ 报文层：Encapsulation EIP 封装构建 / CIP 结构解析         │
├────────────────────────────────────────────────────────┤
│ 传输层：TcpClient 异步接收 / PDU 切包 / 序号校验 / 重连    │
└────────────────────────────────────────────────────────┘
```

对应到源码文件： `AllenBradleyEipDriver.cs` （主类，约 2200 行）/ `StructCodec.cs` （结构体编解码）/ `Encapsulation.cs` + `EIPStructures.cs` （报文）/ `TcpClient.cs` （传输）/ `AllenBradleyACDFile.cs` （离线归档）/ `PValue.cs` （值体系）。全部纯 C#、.NET 4.0、零第三方依赖——这对需要嵌入老产线软件（很多还在.NET 4.0 时代）的场合是个硬约束。后面各章按"功能 → 协议交互 → 实现代码 → 实测验证"的顺序展开。

* * *

## 2\. 连接建立：不是"连上 TCP 就能读标签"

驱动的 `Connect()` 实际做了四件事，任何一步失败都不能算"已连接"：

```python
TCP Connect(44818)
   │  先试 LargeForwardOpen(0x5B) 大包连接，被老固件拒绝则回退 ForwardOpen(0x54)
   ▼
RegisterSession (0x65)        ← 拿到 SessionHandle，之后所有报文都要带
   ▼
ForwardOpen / LargeForwardOpen ← 拿到 ConnectionID + 协商 O→T/T→O 包大小
   ▼
就绪：之后走 SendUnitData，ConnectionID 放进 0x00A1 Item
```

LargeForwardOpen 的价值在于协商 **更大的 PDU** （4002 字节级 vs 普通约 500 字节级）。批量读 100 个标签时，大包意味着更少的分包往返。驱动在连接建立后按协商结果设定分包阈值（大包 4002-100，小包 490）。

**一个容易忽略的细节**：第一次接触一台陌生控制器时，最快的可用性探测不是 ping，而是走完整 `RegisterSession → UnRegisterSession` 握手再断开——这验证了"IP 可达 + 44818 开放 + 对方真的是 EtherNet/IP 设备"三件事，比单纯 TCP 探测可靠得多。驱动的连接前检查就是这么做的。

* * *

## 3\. TCP 客户端层：吞吐量的敌人是"队头阻塞"

这是最值得写的一段。初版 TCP 接收层用了三个经典组件：异步 `BeginReceive` 收字节、 `BlockingCollection<byte[]>` 把字节块转给后台线程、后台线程按"长度前缀"切 PDU。切包函数长这样（问题版本）：

```csharp
// 问题版本：SplitByteArrayByLength
private bool SplitByteArrayByLength(List<byte> data, out List<byte[]> groups)
{
    groups = new List<byte[]>();
    byte[] byteArray = data.ToArray();
    int offset = 0;
    while (offset < byteArray.Length)
    {
        if (byteArray.Length < offset + 4) return false;          // ← 关键
        ushort length = (ushort)(BitConverter.ToUInt16(byteArray, offset + 2) + 24);
        if (offset + length > byteArray.Length) return false;     // ← 关键
        ...
    }
    return true;
}

private void doWork()
{
    foreach (byte[] recvData in recvDataQueue.GetConsumingEnumerable())
    {
        recvBuffer.AddRange(recvData);
        if (SplitByteArrayByLength(recvBuffer, out List<byte[]> group))
        {
            recvBuffer.Clear();
            foreach (byte[] segment in group) { pduQueue.Enqueue(segment); pduAvailableEvent.Set(); }
        }
        // else：什么都不做，等下一个 TCP 段
    }
}
```

EIP 封装头的 Length 字段（偏移 2，2 字节）+ 24 字节固定头 = 一个完整 PDU 的长度。 **问题在哪？** 假设 PLC 的响应是 3000 字节，TCP 把它拆成两个段发过来：第一段 1460 字节（含完整 PDU 头 + 1236 字节数据），第二段 1540 字节。如果第一段里还捎带了 **下一个响应的部分字节** （粘包），或者反过来—— `SplitByteArrayByLength` 只要看到末尾有半个 PDU，就整体返回 `false` 。

后果是灾难性的： **已经完整到达的 PDU 也不入队**，请求方干等 2 秒超时。而大包响应（批量读、结构体模板、browse）几乎必然跨段。这就是典型的 **队头阻塞（Head-of-Line Blocking）**——不是网络慢，是自己的缓冲区策略把快数据扣下了。

修复方案一句话： **能切多少切多少，剩下的留在缓冲区**。

```csharp
// 修复版本
private void doWork()
{
    foreach (byte[] recvData in recvDataQueue.GetConsumingEnumerable())
    {
        recvBuffer.AddRange(recvData);
        while (TryExtractPdu(recvBuffer, out byte[] pdu))   // 循环！不是一个 if
            pduQueue.Add(pdu);
    }
}

private bool TryExtractPdu(List<byte> data, out byte[] pdu)
{
    pdu = null;
    if (data.Count < 4) return false;
    ushort length = (ushort)(BitConverter.ToUInt16(new[] { data[2], data[3] }, 0) + 24);
    if (data.Count < length) return false;                 // 半个 PDU：留着，等下一波
    pdu = data.GetRange(0, length).ToArray();
    data.RemoveRange(0, length);                           // 只移除已消费部分
    return true;
}
```

同层还有两处值得一并改掉的：

**信号-出队竞态**。旧版响应队列是 `ConcurrentQueue + ManualResetEventSlim` ：消费者 `Wait(timeout)` 被唤醒后，要再 `TryDequeue()` 取数据。这个"信号"和"取数"分两步的窗口里可能挤进逻辑：Set() 之后 Reset() 之前，新 PDU 到达并入队，随后 Reset 把信号清掉，Wait 返回 true 但队列语义已经乱了。换成 `BlockingCollection.TryTake(out pdu, timeout)` 后， **等待与出队是原子的**，竞态窗口彻底消失。

**生命周期三件套**：

-   旧版 `Connect` 先起后台线程再连 socket——连接失败就留个空转线程；重试多次就泄漏多份。新版先 `CleanupPreviousConnection()` 释放上次的 socket/线程/队列，先连上 socket 成功后才起线程。
-   旧版 `Disconnect` 用 `Thread.Abort()` 杀后台线程——Abort 可能让线程死在持有 `recvBuffer` 的瞬间，状态损坏。新版用 `CompleteAdding()` 让消费循环自然退出 + `Join(2000)` 。
-   旧版对端 **优雅关闭** （recv 返回 0 字节）完全没处理：连接实际已死， `IsConnected` 还显示在线，所有请求干等超时。新版 `HandleRemoteClosed()` 标记断开、CompleteAdding 唤醒全部阻塞中的 `SendAndReceive` ，并触发上层重连事件。

* * *

## 4\. 请求-响应匹配：幽灵响应与序号校验

连接上同一时刻只允许一个未完成请求（发送锁串行化），但仍有两种"响应错位"场景：

**场景 A：迟到响应**。请求 X 超时（2 秒）后，PLC 的响应才慢悠悠到达，滞留在队列里。下一个请求 Y 发出后，取到的竟是 X 的响应——解析出来的就是张冠李戴的数据。

修复很简单也很暴力： **每次发送前把响应队列清空**。

```csharp
lock (_sendLock)
{
    while (pduQueue.TryTake(out _)) { }   // 清滞留
    _socket.Send(sendData);
    ...
}
```

**场景 B：错乱响应**。在某些网络抖动下，迟到响应可能在下一个请求的等待窗口内到达。光靠"发送前清空"堵不死——响应可能在清空 **之后**、正确响应 **之前** 到达。彻底方案是 **序号校验**：SendUnitData 的 0x00B1 Item 里有 2 字节连接序号，请求方递增、响应方回显。收到 PDU 时核对序号，不匹配的直接丢弃、在剩余超时内继续等：

```csharp
// Encapsulation.cs：从响应中提取序号
public static bool TryGetUnitDataSequence(byte[] data, out ushort sequence)
{
    sequence = 0;
    if (data == null || data.Length < 32) return false;
    if (BitConverter.ToUInt16(data, 0) != (ushort)Command.SendUnitData) return false;
    int offset = 32;                                    // 24 头 + 4 + 2 + 2
    ushort itemCount = BitConverter.ToUInt16(data, 30);
    for (int i = 0; i < itemCount; i++)
    {
        ushort typeId = BitConverter.ToUInt16(data, offset);
        ushort length = BitConverter.ToUInt16(data, offset + 2);
        offset += 4;
        if (typeId == 0x00b1 && length >= 2)            // Connected Data Item
        {
            sequence = BitConverter.ToUInt16(data, offset);
            return true;
        }
        offset += length;
    }
    return false;
}
```

调用侧把"生成序号"从表达式里提出来，连请求带校验一起传：

```csharp
ushort seq = (ushort)Interlocked.Increment(ref sequenceCount);
byte[] response = client.SendAndReceive(
    Encapsulation.BuildGetAttributePacket(..., seq, ...),
    2000, seq);                       // expectedSequence：不匹配则丢弃重等
```

驱动里 9 处 `SendUnitData` 调用全部接线。SendRRData（无连接报文）没有这个序号字段，保持默认不校验——配合发送前清空已经足够。

* * *

## 5\. 结构体模板：一个 2 字节句柄的三种语义

按符号名读一个 UDT 标签（比如 `ut1` ）时，PLC 不会直接回成员值，而是回：

```python
[DataType = 0x02A0 (AbbreviatedSTRUCT)] [2 字节句柄] [原始字节块]
```

PLC 把结构体当一坨字节给你， **怎么切分是客户端的责任**——答案藏在 Template Object（0x6C）里：每个模板实例的 Get_Attributes_All 返回成员数量，再 0x4C 读模板数据，每成员 8 字节（info 2 + rawType 2 + offset 4），后面跟着成员名字符串。rawType 的位布局： `bit15=是否结构体` 、 `bit13-14=数组维数` 、 `bit0-11=原子类型码或结构体实例号` 。

问题出在那个 **2 字节句柄** 上。用探针实测同一台 PLC 上两种类型的响应：

| 标签  | 响应句柄 | 它到底是什么 |
| --- | --- | --- |
| `timer1` （预定义 TIMER） | `0x0F83` (3971) | **就是** 0x6C 模板实例号， `Get_Attributes_All(class=0x6C, instance=3971)` 直接成功 |
| `ut1` （用户 UDT） | `0x313B` (12603) | 模板布局的 **CRC 校验值**，不是实例号。拿它当实例号请求 → `Path destination unknown (0x05)` |

进一步验证：把 TIMER 的模板取回来，其 Get_Attributes_All 数据的前 2 字节恰好就是 `0x0F83` —— **模板自己知道自己对外的句柄**。而用户 UDT 的实例号（ `ut1` 的类型实例是 `0x0920` ）只存在于 Symbol Object 的属性里。

所以这个句柄的解析必须分级（ `ResolveStructTemplate` ）：

```csharp
private AllenBradleyStructObj ResolveStructTemplate(ushort handle, string tag)
{
    // ① 已缓存模板按 StructureHandle 匹配
    //    （只要曾经浏览/读过这种类型，CRC→模板 的映射就在缓存里）
    foreach (var cached in abStructObjByIdCache.Values)
        if (cached.StructureHandle == handle) return cached;

    // ② 句柄本身即实例号（预定义类型在这台固件上如此）
    try { return FetchStructTemplate(handle); }
    catch (CIPException) { /* 不是实例号，继续 */ }

    // ③ 用户 UDT：从已加载的符号树按路径反查类型实例号
    //    "ut11[0,0]" 这类数组元素要剥掉末尾下标段再查父节点
    string lookup = tag;
    while (!string.IsNullOrEmpty(lookup))
    {
        if (varTreeCache.TryGetValue(GetUniqueIdentifier(lookup), out var node)
            && node.NodeContent is AllenBradleyVarNodeObj nvo
            && nvo.NodeDataTypeObj.DataType == AllenBradleyVarType.STRUCT)
            return FetchStructTemplate(nvo.InstanceId);
        int bracket = lookup.LastIndexOf('[');
        if (bracket < 0) break;
        lookup = lookup.Substring(0, bracket);
    }
    throw new CIPException($"无法解析结构体模板: 句柄 0x{handle:X4}, 标签 {tag}");
}
```

这个设计顺带回答了一个架构问题： **冷读用户 UDT 整体（完全没加载过变量树）在协议层面就是不可解的**——句柄是 CRC，你没有 CRC→实例号的映射表。pycomm3 要求"先 browse 再读结构体"也是同一个原因。驱动的选择是把这种情况变成一个明确的错误信息，而不是让 PLC 的 `Path destination unknown` 去误导调用方。

模板到手后的解码也有讲究：

-   **BOOL 成员** 不占独立字节，它们打包在一个 `ZZZZZZZZZZ...` 宿主成员里，靠 info 字段的 **位号** 提取： `(data[offset] & (1 << member.Info)) != 0` ；
-   **STRING 成员** 句柄固定是 `0x0FCE` （内建 ASCIISTRING82），布局 LEN(4) + DATA(82)，要特判；
-   **TIMER 等预定义类型的成员名** 在模板里是 `Control` /原始命名，而在线 browse 看到的是 `CTL` /DWORD——离线树要和在线树对齐，得做命名映射；
-   成员数组的 info 字段是 **元素个数**，不是字节数。

* * *

## 6\. 整体写结构体：句柄与对齐填充的实现要点

读路径打通后，写路径还有两个实现要点。写 UDT 的报文数据段格式是：

```python
[A0 02] [2 字节结构句柄] [2 字节元素个数=1] [结构体原始字节]
```

**要点 1：句柄字段不是实例号。** 第一版实现填的是模板实例号（ `0x0920` ），PLC 回了厂商专有错误 `0xFF` ，附加状态字 `0x2107` 。改成 CRC 句柄（ `0x313B` ）后错误立刻变化——说明字段本身被接受了。

**要点 2：结构体大小含对齐填充。** 改完句柄后 PLC 报 `Not enough data (0x13)` 。 `ut1` 的模板成员偏移：BOOL 宿主@0、INT@2、REAL@4、INT\[3\]@8，按成员末尾算是 14 字节；但 PLC 要求的是 **含对齐填充的 16 字节**。推算尺寸是靠不住的——模板 Get_Attributes_All 数据的 `[4-5]` 字节就是官方结构体大小（TIMER 是 12、STRING 是 88，与实测完全吻合）：

```csharp
// FetchStructTemplate 内
// Get_Attributes_All 数据布局：
// [0-1]结构句柄 [2-3]成员数 [4-5]结构体字节大小 [6-7]模板数据大小(字)
structObj.StructureHandle = BitConverter.ToUInt16(dataContent.ToArray(), 0);
structObj.StructureSize   = BitConverter.ToUInt16(dataContent.ToArray(), 4);
```

修复后的往返验证（真机）：写 `userint1=12345, userbool1=true, userreal1=3.25` → 读回逐项一致 → 恢复原值 → 再校验通过。二维结构体数组 `ut11[1,2]` 的元素路径写（ `ut11[0,1]` ）同样通过，且同数组其他元素不受影响。

顺手的诊断增强：Multiple Service Packet 的外层状态 `0x1E` 只是"内嵌服务有错误"的汇总，第一版遇到它直接抛，看不到真因。现在逐内嵌服务报告 `[序号]service/status/附加状态/数据片段` ，排查时间从"抓包重放"变成"看异常消息"。

* * *

## 7\. 离线变量树：直接解析.acd 工程归档

调试现场经常遇到"PLC 不在手边，但工程文件在"的场景。RSLogix 5000 的 `.acd` 工程归档 **不是 ZIP**，结构是：

```python
[文本头]
[文件数据区]   ← 每个文件可能 gzip 压缩（魔数 1F 8B，DeflateStream 可解）
[尾部文件表]   ← 每个文件 528 字节：520 字节 UTF-16 文件名 + 长度 + 偏移
```

归档里有 Rockwell 自己维护的 **TagInfo.XML** （UTF-16），包含全部数据类型定义（成员/隐藏成员/位/维度）和控制器/程序标签列表——比从 PLC 导出 TXT/L5X 再解析既全又准。一个反直觉的实测结论： **二进制 Comps.Dat 里的数组维度字段在 v21 文件里不填充（全 0），维度只能信 XML** （ `ba=64` 元素 BOOL 数组、 `ut11=[1,2]` 二维数组都由 XML 正确给出）。

解析器生成与在线 browse 完全同构的变量树，包括：

-   用户 UDT 递归展开成员（含嵌套与数组成员）；
-   预定义类型（TIMER/ALARM 等 100+ 种）与 `AB:` 模块类型 **与在线行为一致地展开成员** （而不是像 L5X 导出那样折叠成 STRUCT 叶子——在线/离线两棵树必须能逐符号 diff）；
-   `Hidden="true"` 成员（BOOL 打包宿主）保留在树中；
-   BOOL 数组按 DWORD 打包（与 PLC 实际存储一致）。

离线模式的另一个收益是 **控制器信息不丢**：从 Comps.Dat 根记录（ext 0x75/0x65/0x66，FILETIME）解析工程创建/修改时间、序列号，从 QuickInfo.XML 读保存软件版本，配合内置 CIP 身份表（1,14,15 → 1789-L60）还原出 `tsoft / 1789-L60 v21.11、SN 16#7024_4aa5、RSLogix 5000 v21.00` 这样的完整信息。

最终验收标准就一条： **在线 browse 与离线.acd 解析出的两棵树，785 个符号按"名称+类型+权限"逐项 diff 为空**。

* * *

## 8\. 标签外部访问权限（External Access）

RSLogix 里每个标签可以设置 External Access： `Read/Write` 、 `Read Only` 、 `None` 。控制器 scope 的权限在线读： **Symbol Object 的 Get_Instance_Attribute_List（0x55）响应里带**——但属性集有讲究。请求属性 `{1,2,3,5,6,8,10}` （1=名 2=类型 3=符号地址 5=符号对象地址 6=软件控制 8=维度 **10=外部访问**），其中 **属性 10 需要固件 v18+**。响应记录布局（无填充，逐字段紧跟）：

```python
实例句柄(4) | 名长(2)+名 | 类型(2) | 符号地址(4) | 对象地址(4) | 软件控制(4) | 维度 3×(4) | 访问(1)
```

离线侧 TagInfo.XML 不含权限字段，要从 **Comps.Dat** 提取：现代 RxTag 布局权限在记录 `u16@48` （限 cip_type 0x68/0x6B 标签记录），v20 遗留布局在元数据属性 0x01 内 `u16@0x21E` 。

一个容易误判的点： **External Access = None 的标签会被 Rockwell 对外整体隐藏**——在线 0x55 和离线 XML 都不列出它。这不是丢数据，恰是 "None" 的语义。它的值（3）仍能从 Comps.Dat 记录里解析到，用于"为什么我的标签不见了"的排查。

对外暴露统一为 `ABExternalAccess` 枚举（ReadWrite=0/ReadOnly=2/None=3/Unknown=255，与 CIP 取值一致），树节点和 `ItemAddress.ExternalAccess` 都能取到；结构体成员不携带独立权限，继承所属标签——这与 PLC 的行为一致。

* * *

## 9\. 断线自动重连

重连不应该是"发现断了再从头 Connect"那么简单，我们的设计：

-   **触发源**：接收回调异常/对端 0 字节关闭 → `ConnectionLost` 事件 → 驱动的 `HandleCommunicationFailure` ；KeepAlive 定时器的探测失败同样走这条路。 `volatile bool` 标志保证事件只触发一次。
-   **退避策略**： `delay = min(InitialDelayMs × Multiplier^attempt, MaxDelayMs)` ，默认 1s 起步、2 倍增长、30s 封顶、0=不限次数。
-   **重建动作**： `ReconnectOnce()` = 新 TCP 连接 + RegisterSession + 重新 ForwardOpen + 恢复计时器。注意必须 **新建 TcpClient 实例** 而不是复用——旧 socket 的状态不可信。
-   **可取消**：用户主动 `Disconnect()` 时 `CancelReconnect()` 终止重连线程（避免"用户都退出了它还在后台重试"的尴尬）。

怎么测拔线？没有管理员权限改防火墙，就在本机起一个 **TCP 转发代理** （监听 127.0.0.1:44800 → 转发到 PLC），让驱动连代理，代理在指定时间窗内"黑洞"数据——等效拔线，且可以精确控制断线/恢复时刻。实测时间线：

```python
7.3s   代理掐断 → OnConnectionLost 立即触发，阻塞中的读取被唤醒
8.3s   第 1 次重试（失败：注册会话 5s 超时）
10.3s  第 2 次重试（失败）
14.3s  第 3 次重试（失败）
19.4s  第 4 次重试 → OnReconnected，读取无中断恢复
```

* * *

## 10\. 性能实测数据

SoftLogix5800 v21.11，本机千兆网段，Debug 构建：

| 测试项 | 结果  |
| --- | --- |
| 单标签读 RTT（200 次均值） | **0.70 ms** （约 1430 次/秒） |
| 批量读 100 标签 × 20 轮 | **4.2 ms/轮** （约 2.4 万标签值/秒） |
| 结构体整体读（TIMER/STRING/UDT/数组元素） | 0.6 ~ 0.7 ms/次 |

第 3 节的队头阻塞修复对大包场景的收益最明显：大包响应不再等"凑齐"才交付。剩余的亚毫秒级开销基本是 PLC 自身的响应时间。

## 11\. 常见问题速查表

| #   | 现象  | 根因  | 解法  |
| --- | --- | --- | --- |
| 1   | 大包响应偶发超时 | 切包函数"全有或全无"导致队头阻塞 | 循环提取完整 PDU，残留留缓冲区 |
| 2   | 响应偶尔错位 | 信号/出队分两步竞态 | BlockingCollection.TryTake 原子等待 |
| 3   | 上次超时的响应被下次请求消费 | 滞留响应未清理 | 发送前清空队列 |
| 4   | 含路径符号报 Path segment error (0x04) | 符号路径未按 `.` 分段编码 | 每段独立处理数组下标与 ANSI 段 |
| 5   | UDT 整读报 Path destination unknown (0x05) | 响应句柄是模板 CRC 非实例号 | 三级解析：缓存匹配/实例直取/符号树反查 |
| 6   | UDT 整写报厂商错 0xFF/0x2107 | 写句柄字段填了实例号 | A0 02 段填结构句柄（CRC） |
| 7   | UDT 整写报 Not enough data (0x13) | 按成员推算尺寸漏了对齐填充 | 用模板 Get_Attributes_All \[4-5\] 的官方大小 |
| 8   | 0x55 属性集缺权限 | 属性 10 需固件 v18+ 且不在默认集里 | 请求集扩为 {1,2,3,5,6,8,10} 并重写记录解析 |
| 9   | 离线数组维度全 0 | v21 的 Comps.Dat 不填维度 | 维度以 TagInfo.XML 为准 |
| 10  | None 权限标签"丢失" | Rockwell 对外整体隐藏 None 标签 | 语义如此；值可从 Comps.Dat 解析用于排查 |
| 11  | 断线后长时间假在线 | 对端 0 字节关闭未处理 | HandleRemoteClosed 标记+唤醒+事件 |
| 12  | 重连泄漏 socket/线程 | Connect 无重入清理 | CleanupPreviousConnection + 先连后起线程 |

* * *

## 12\. 与开源方案的对比

开发过程中我们实际对照过 node-ethernet-ip（JavaScript 实现，本驱动的功能同步参照对象）与主流的 libplctag（C 库）。客观对比一波优缺点，供选型参考。

**相对优势：**

-   **零依赖、可嵌入老产线**：纯 C#、.NET 4.0、零第三方库。node-ethernet-ip 需要 Node.js 运行时，libplctag 是原生 C 库需 P/Invoke 封装——要嵌入还在.NET 4.0 时代的老上位机软件，本驱动是唯一不用带运行时的选项。
-   **离线工程解析是独有能力**：主流开源方案只能"在线连 PLC 再列举标签"；本驱动直接解析 RSLogix `.acd` 工程归档还原完整变量树（含 UDT 模板、预定义类型、模块结构体、外部访问权限），并保证与在线树 785 符号逐项一致。无 PLC 时调试 HMI/上位机逻辑，这是刚需。
-   **外部访问权限暴露**：开源方案均不返回 Read Only / None 权限标志，本驱动在线（0x55 属性 10）、离线（Comps.Dat）两条路径都补齐了。
-   **大包协商与批量策略开箱即用**：LargeForwardOpen 大包协商 + 多服务打包（0x0A）+ Partial Transfer 自动降级单读，这些在开源方案里要么没有、要么需要调用方自己拼。
-   **源码全可控、全中文注释**：协议细节（句柄语义、对齐填充、权限编码）都有据可查，改行为不用等上游。

**相对劣势：**

-   **生态与成熟度**：libplctag 跨平台（Windows/Linux/嵌入式）、经受了大量固件版本与产线环境的长期检验，社区和问题档案都厚；本驱动只实测过 SoftLogix5800 v21.11 一台控制器，跨固件、跨型号的兼容性矩阵尚未铺开。
-   **机型覆盖窄**：libplctag 还覆盖 PLC-5、SLC、MicroLogix 等老机型（走 PCCC 封装）；本驱动只做 ControlLogix/CompactLogix/SoftLogix 的 CIP 符号访问。
-   **主动砍掉的能力**：UDP 广播设备发现、Scanner 标签订阅（周期性数据上报）node-ethernet-ip 都有，我们在明确需求边界后删掉了——如果项目需要"一进软件自动扫网段找 PLC"或"PLC 主动推变位"，得自己补回来或用别的轮子。
-   **维护成本自担**：没有社区兜底，协议细节全部自研自查，后续每适配一个新固件版本都是一次完整的抓包回归。

一句话总结：要"嵌入.NET 老软件 + 离线工程文件调试 + 权限感知"，本驱动更合适；要"跨平台 + 多机型 + 久经考验"，libplctag 仍是更稳的选择。

* * *

## 结语

这个驱动从"能读一个 DINT"到"785 个符号在线/离线树逐项一致、结构体整体读写、断线自愈"，中间隔着的基本都是 **协议语义而不是编码量**：2 字节句柄的三种身份、0x1E 只是错误汇总、None 权限的隐藏语义、v21 文件不填维度……工业协议驱动的可靠性，说到底是被这些细节一遍遍磨出来的。文中所有结论均有真机抓包或探针实测支撑，测试工具（树对比、性能基准、断线代理、结构体读写往返）已整理为可复用的回归套件。

## 源码与测试工程

核心库源码、两个测试 Demo（控制台 / GUI）及全部回归测试工具已开源，仓库地址：

**Gitee**： [https://gitee.com/lircy/Rockwell-AllenBradleyEipDriver.git](https://gitee.com/lircy/Rockwell-AllenBradleyEipDriver.git)
