---
title: 【看雪】010 Editor 注册算法分析与注册机实现
source: https://bbs.kanxue.com/thread-293074.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-27T18:11:53+08:00
trace_id: e84b18d8-da64-4e0c-8c07-b65cc05a4b72
content_hash: 41debf2a81495d9e72355e031d01e8a7637d905cca95050b60274cf51888f887
status: synced
tags:
  - 看雪
  - 软件注册逆向
  - 算法逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: 010 Editor 的注册校验由内层验证器 sub_14043D0E0 产出结果码、外层翻译官 sub_14043DC50 映射为提示，核心是 name 大写 hash 与 license 第 4~7 字节比对，据此可写出注册机。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3e875244-d011-8175-84e3-c4037fcec8ea
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 010 Editor 的注册校验由内层验证器 sub_14043D0E0 产出结果码、外层翻译官 sub_14043DC50 映射为提示，核心是 name 大写 hash 与 license 第 4~7 字节比对，据此可写出注册机。
> 
> - **定位路径：** 从字符串 `Invalid name or license` 的 xref 找到宣判块，逆推结果码分派区得到内层验证器 `sub_14043D0E0`；内层码 45/78/147/231 经翻译官映射为 219（成功）/237 或 524（版本旧）/113（试用）/375（无效）。
> - **mgr 结构：** 用 x64dbg 分别改 name、license 后对比快照，确认 +0x28 是 name 长度、+0x40 是 license 长度，+0x7C 为联网审查开关。
> - **license 格式与类型：** 长度须为 19（四段）或 24（五段），第 4/9/14（及 19）位必须是 `-`，每两位 hex 解出 1 字节；b3 为类型字节（0x9C 零售、0xFC 试用、0xAC 加强）。
> - **核心校验等式：** 小端 `hash(name, 1, 0, 盐)` 的 4 字节必须等于 b4~b7；解出版本须 ≥17，盐须落在 [1,1000]。`AD76(x)=((x^0x18)+0x3D)^0xA7` 与 `8C5B` 均双射可逆，可反解 b0/b1/b2。
> - **hash 细节与反盗版：** hash 先 toupper 再查 256 项常量表，四个 u8 游标步进 9/13/7/19，必须“先取表值、后步进游标”；另有黑名单（用户 999/AnyOne、名字前缀+倒序 license 指纹）和分段用立即数拼出的 sweetscape.com 联网校验，状态持久化在 HKCU。

贴主是逆向初学菜鸟，第一次逆向学习大型软件（虽然是入门级），写下这个帖子留作纪念

* * *

## 一、定位校验逻辑

### 1.1 从错误提示入手

在 010 的注册界面中输入任意 Name/License，弹出 `Invalid name or license...`。字符串窗口找到该文案，xref 定位到"宣判块"（错误提示所在基本块）。

下图中异色（青）块即错误提示所在的基本块，可以看到它位于一长串分支逻辑的末尾——所有验证失败的路径最终都汇集到这一层：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/81e5ab6f50efb0f3.webp)

放大分派区，可以看到一组连续的结果码比较： `cmp ebx, 237` 、 `cmp ebx, 524` 、 `cmp r15d, 147` 等——不同的结果码被分流到不同的提示分支，一个"结果码 → 提示文案"的分派区浮出水面：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1907101b064578f5.webp)

继续向上追溯结果码的来源：图中红块是 `cmp ebx, 219` （激活成功判定），其上方是 `call sub_1400088A5` （参数为 `mgr, 17, 20300` ，返回值存入 ebx），再往上还有 `cmp dword ptr [rcx+124], 0` 的判断——0x7C(124) 这个字段是联网审查开关，后文会详细讲：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/186c83658a7e17e7.webp)

### 1.2 两级结果码

顺着分派区继续向上，找到了结果码的"生产车间"——下面这一整块 30 多行的顺序逻辑。看着密，其实拆成三段就很好读，我们一段一段来：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc14d22c7b301644.webp)

**第一段（取输入）**：块里唯一的外部库调用是 `QLineEdit::text()` ——Qt 函数名是现成的路标，这是从注册窗口的输入框把 License 文本取出来，再经两个内部函数（ `sub_1400014AB` 、 `sub_14000B9B0` ）存进全局对象 `qword_140FFADB8` 。这个对象后面会反复出现，我们叫它 **mgr** （管理器），可以把它想象成一个"档案袋"，name、license、验证结果全装在里面。

**第二段（双调用）**：接下来是肉眼可见的"复制粘贴"—— `mov edx, 17` / `mov r8d, 20300` / `call XXX` 一模一样的配方出现两次，只是调用目标不同（先 `sub_140003D64` 后 `sub_1400088A5` ），返回值一个进 r15d、一个进 ebx。两个吃同样参数的调用挨在一起，大概率是"一个负责验证、一个负责转述"的关系。

**第三段（路由）**：块尾 `cmp r15d, 231` / `jz` ，加上下面小块里的 `cmp dword ptr [rcx+124], 0` / `jz` ——两道条件跳决定流程走向：满足任一就去本地宣判（红块 `cmp ebx, 219` 那里），都不满足则落入另一条分支（后文会讲，那是联网审查通道）。

三段读完，这块代码的全貌就出来了： **取输入 → 双调用产出两个结果码 → 按码路由**。

```c

r15d = sub_140003D64(mgr, 17, 20300);   // 内层验证（thunk → sub_14043D0E0）

ebx  = sub_1400088A5(mgr, 17, 20300);   // 翻译官（thunk → sub_14043DC50）

cmp  r15d, 231

jz   本地宣判                            // r15d==231 → 查 ebx

cmp  [mgr+0x7C], 0

jz   本地宣判                            // 审查开关==0 → 查 ebx

// 否则走联网审查分支
```

这两个结果码分工不同： **r15d 是"路由器"，ebx 才是"法官"**。凭什么这么说？看它们各自的"出场位置"：

-   **r15d** 只出现在 `cmp r15d, 231` / `jz` 和 `cmp [mgr+0x7C], 0` / `jz` 这两道跳转里——它决定的是 **流程走哪条路** （本地宣判还是联网审查），并不直接判定成败
-   **ebx** 出现在红块 `cmp ebx, 219` / `jnz 失败` ——它才是 **最终判定激活成功与否** 的那个

一个管"去哪"，一个管"判什么"。还有个佐证：就算 r15d == 231 走了本地宣判这条路，由于内层验证失败（231）经翻译官映射后 ebx=375≠219，法官照样判死——所以 r15d 真的只负责指路，生杀大权全在 ebx 手里。

再看这两个函数的身份： `sub_140003D64` 是个 thunk，真身 `sub_14043D0E0` 就是 **内层验证器** （本文主角，第二章详析）； `sub_1400088A5` 真身 `sub_14043DC50` ，跟进去发现它 **内部又调了一遍内层验证**，然后对返回值做 switch 映射——它是个"翻译官"：

```c

// sub_14043DC50（删除噪音）
__int64 __fastcall sub_14043DC50(__int64 a1, __int64 a2, __int64 a3)
{
  v3 = a2;
  if ( *(_DWORD *)(a1 + 124) != 0 )
    return 275;
  v6 = sub_140003D64(a1, a2, a3);
  switch ( v6 )
  {
    case 45:
      return 219;
    case 78:
      v12 = sub_14000C8AB(a1, a2: v3);
      v13 = 524;
      if ( v12 != 23 )
        return 237;
      return v13;
    case 231:
      return 375;
    default:
      ...   // 试用路径的辅助校验（sub_14000C8AB / sub_14000EC3C 等），
            // 可能返回 113/249/375，与激活主线无关，从略
  }
}
```

拿着翻译官的映射表，回到分派区逐个确认各结局的提示块：

**① ebx==219（内层 45）→ 激活成功。** `cmp ebx, 219` / `jnz` ：不等则跳往失败分派， **相等则直接落入下方的成功提示块**——拼的字符串是 `License activated. This license entitles...`：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f166a01f6ba175ca.webp)

**② mgr+0x7C ≠ 0 → 联网审查。** `cmp dword ptr [rcx+124], 0` / `jz` ：开关为 0 回本地宣判； **非 0 则落入联网分支**——跟进发现函数 `sub_1402B5140` 在拼接 `https://www.sweetscape.com/` 开头的 URL 并发起 HTTP 请求，这就是 **联网反盗版校验** （第六章详析）。校验失败直接弹反盗版警告，通过则回到 219 的判定：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/377374770621631e.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c62cd24a4db35cf0.webp)

**③ ebx==237 / 524（内层 78）→ 版本太旧。** 两个比较任一成立（jz）都跳到拼 `The license you entered is for an earlier version...` 的提示块：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ea4d16f95f93c0d.webp)

**④ r15d==147 → 试用。** `cmp r15d, 147` / `jnz` ： **不等于 147 跳向 Invalid 块**——就是最开始定位的那个青色块，拼 `Invalid name or license` ，激活码错误：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d03512d070fc96f.webp)

等于 147 则落入试用路径，再由 `cmp ebx, 71h` （113）细分两种结局：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/14266b9f1458499f.webp)

-   **ebx==113（不跳）** → `License code accepted. Your trial period has been extended` （试用期已延长）：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/abda24e692f2e474.webp)

-   **ebx≠113（跳 loc_1402B2DAA）** → `License accepted but the trial period is already over` （试用已结束）：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f8d23ae50890ba9f.webp)

把 switch 的分支和分派区的提示块一一对应，得到完整的 **码表**：

| 内层码 | 外层码 | 含义  |
| --- | --- | --- |
| 45  | 219 | 激活成功（License activated） |
| 78  | 524 / 237 | license 版本太旧（earlier version） |
| 147 | 113 | 试用：试用期延长 / 试用已结束 |
| 231 | 375 | 无效（Invalid name or license） |

* * *

## 二、验证器 sub_14043D0E0 解剖

内层验证器的参数是 `(mgr, 17, 20300)` 。读它之前，先搞清楚 mgr 这个"档案袋"里装了什么。

**方法：x64dbg 连拍四张快照做对比**——断在验证前、弹 Invalid 后、改 license 后、改 name 后，逐格对比 mgr 内存：

| 偏移  | ① 验证前  <br>(NAME+五段) | ② 弹Invalid后  <br>(输入没动) | ③ 改license后  <br>(删掉一段) | ④ 改name后  <br>(改成5字符) |
| --- | --- | --- | --- | --- |
| +0x18/+0x20（name 指针） | `…52E7EE0/E7EF0` | 变   | 变   | 变   |
| **+0x28** | 4   | 4   | 4   | **5** |
| +0x30/+0x38（license 指针） | `…5371300/371310` | 不变  | 变   | 不变  |
| **+0x40** | 24  | 24  | **20** | 20  |

（快照③关键行原貌： `F0 1C 72 55 E8 01 00 00 00 1D 72 55 E8 01 00 00` （license 的 d/ptr）下一行 `14 00 00 00` ——即 +0x40 = 0x14 = 20，正是删了一段后的字符数。）

两个规律自己跳出来： **+0x28 只在改 name 时变（4→5），+0x40 只在改 license 时变（24→20）**——控制变量，谁变跟谁走。而指针列的"变与不变"正好对应 QString 重新分配（改谁的内容谁才重建缓冲区）。由此实锤： **+0x28 是 name 长度、+0x40 是 license 长度**，两个 QString 都是 {d, ptr, size} 三连布局（d 与 ptr 恒差 0x10，即 16 字节管理头）。

### 2.1 入口检查

```c
*(mgr + 128) = 0;
*(mgr + 104) = 0;
if ( *(mgr + 40) == 0 || *(mgr + 64) == 0 )
    return 147;      // name 或 license 为空串，直接拒
```

知道了 +40/+64 是两个 size 字段，这段就一目了然： **空串检查** （return 147）。

### 2.2 license 解析：sub_14043E820（hex 解码器）

`sub_14000E214(a1, &v39)` 把 license 字符串解码成字节数组（v39 起，记 b0~b9）。三个动作：

**① 转单字节**：先 `QString::toLatin1` 把 license 从 UTF-16 压成单字节（x64 动态跟进 ptr 可看到 `31 00 31 00` → `31 31` 的压缩过程）。

**② 格式闸机**：长度必须 **19（四段）或 24（五段）**，且第 4/9/14(/19) 位必须是 `-` （45 = 0x2D），反编译原文：

```c
v4 = *(_QWORD *)(a1 + 64);                       // license 长度（+64 = size）
sub_1400053F3(v37, a1 + 48);                     // 内部即 QString::toLatin1
*(_QWORD *)(a2 + 2) = 0;
*(_WORD *)a2 = 0;                                // 先清零 10 字节输出
if ( ((_DWORD)v4 == 19 || (_DWORD)v4 == 24)      // 长度闸：19 或 24
  && *(_BYTE *)QByteArray::operator[](v37, 4) == 45    // 第 4 位必须是 '-'
  && *(_BYTE *)QByteArray::operator[](v37, 9) == 45    // 第 9 位
  && *(_BYTE *)QByteArray::operator[](v37, 14) == 45   // 第 14 位
  && ((_DWORD)v4 != 24 || *(_BYTE *)QByteArray::operator[](v37, 19) == 45) )  // 五段再加第 19 位
```

**③ 逐字符解码**：每两行为一组——取两个字符 → `B2DA` 转数值 → `16 * 高 + 低` 拼一个字节，注意下标跳过横杠：

```c
v5 = *(_BYTE *)QByteArray::operator[](v37, 0);
v7 = (unsigned __int8 *)QByteArray::operator[](v37, 1);
v8 = 16 * sub_14000B2DA(a1, v5);
*(_BYTE *)a2 = sub_14000B2DA(a1, *v7) + v8;              // b0
v9 = *(_BYTE *)QByteArray::operator[](v37, 2);
v10 = (unsigned __int8 *)QByteArray::operator[](v37, 3);
v11 = 16 * sub_14000B2DA(a1, v9);
*(_BYTE *)(a2 + 1) = sub_14000B2DA(a1, *v10) + v11;      // b1
// [5][6]→b2（跳过横杠[4]）、[7][8]→b3（类型字节）、[10][11]→b4、
// [12][13]→b5、[15][16]→b6、[17][18]→b7，写法与上面完全相同（略）
if ( (_DWORD)v4 == 24 )                          // 五段：再解 b8、b9（[20][21]、[22][23]）
{ ... }
```

其中 `sub_14000B2DA` （真身 43E7D0）是"字符 → 数值"转换表，从上到下挨个分类：

```c
__int64 __fastcall sub_14043E7D0(__int64 a1, char a2)
{
  if ( (unsigned __int8)(a2 - 48) <= 9u )
    return (unsigned int)(a2 - 48);          // '0'~'9' → 0~9
  if ( ((a2 - 79) & 0xDF) == 0 )             // &0xDF 大小写合一：'O'(0x4F)/'o'(0x6F)
    return 0;
  if ( a2 == 108 )
    return 1;                                // 'l' → 1（易混淆字符容错）
  if ( (unsigned __int8)(a2 - 97) <= 0x19u )
    return (unsigned int)(a2 - 87);          // 'a'~'z' → 10~35
  if ( (unsigned __int8)(a2 - 65) <= 0x19u )
    return (unsigned int)(a2 - 55);          // 'A'~'Z' → 10~35
  else
    return 0;
}
```

注意它收的是 **整个字母表** （不只是 A-F），但只有 0-9A-F（值 0~15）才能在 `16x+y` 里不溢出——生成码时用标准 hex 字符即可。

**动态验证**：输 `AAAA-BBCC-DDEE-FF00` ，断在解码后看 `&v39` ： `AA AA BB CC DD EE FF 00` 一字不差——v39 ~~v46 = b0~~ b7 实锤。

### 2.3 内置黑名单（两道）

**第一道：用户名撞表。** 拿 name 挨个 `QString::operator==` 比对内置表 `off_140E1C5C0` ，表内容就两条： `999` 、 `AnyOne` ——都是网上流传泄露 key 的用户名，撞中 return 231。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0ac377b72bc6f4a7.webp)

**第二道：前缀 + 指纹组合。** name 长度 >1 时，按 12 字节表项循环（ `v6 += 12` ）：

```c
// 表项 = [2 字符 name 前缀][10 字节 license 指纹（倒序存储）]
if ( toUpper(name[0]) == 前缀[0] && toUpper(name[1]) == 前缀[1] )
{
    v13 = v6 + 10;
    for (i = 0; i < 10; i++, v13--)
        if ( b[i] != *v13 ) break;   // v39 正序读，表项倒序读
    if (全中 10 字节) return 231;
}
```

即"名字前缀 + 泄露 license 指纹"的组合黑名单，指纹 **倒序存放** （v13 递减），dump 里直接看不出是哪条 key。第一个表项前缀是 `OW` 。

动态验证：mgr+0x18 的 name QString 与 mgr+0x30 的 license QString 背靠背，跟进 ptr 能看到输入的明文。

### 2.4 类型字节分派：0x9C / 0xFC / 0xAC

**b3（v42）是类型字节** （-100/-4/-84 转 hex 即 0x9C/0xFC/0xAC），驱动稀疏 switch：

| b3  | 类型  | 行为  |
| --- | --- | --- |
| 0x9C | 正式零售版 | 解出版本上限（mgr+108）、盐（mgr+112），见下 |
| 0xFC | 试用版 | 全写死常量（108=255、112=1、128=1）， **不读 license 任何字节**，最好成绩仅 147 |
| 0xAC | 加强版 | 同 0x9C 公式但闸更宽（1~5000），额外用 b8/b9 解出等级（mgr+132，需五段 10 字节） |

**0x9C 主分支** （注册机目标，fall-through 路径）：

```c
v20 = (u8)(b5 ^ b2) + ((u8)(b7 ^ b1) << 8);   // 4 字节两两异或拼 16 位
*(mgr+108) = AD76( (u8)(b6 ^ b0) );            // → 授权版本上限
v21 = C5B( v20 );
*(mgr+112) = v21;                              // → 盐
if ( 版本 == 0 || v21 - 1 > 999 ) return 231;  // 两道闸：版本非 0、盐 ∈ [1,1000]
a3 = (版本 < 2) ? 版本 : 0;                     // 版本 ≥ 2 时 a3 恒 0
```

**版本约束推演** （决定 a3 能不能焊死为 0）：版本=0 → 231 闸死；版本∈\[1,16\] → 后面 `17 > 版本` 给 78（旧版本）也活不成； **只有版本 ≥ 17 能走到最后**——而 ≥17 必然 ≥2，所以 a3 恒为 0。

（动态验证：+108 改为 5，真码立刻报"旧版本"；真码的 +108=255、+112=230。）

### 2.5 核心校验：LABEL_26

所有分支汇合到这里，一句话概括： **name 过 hash，和 license 的 b4~b7 逐字节比对**。

```c
LABEL_26:
  QString::toUtf8(a1: a1 + 24, a2: v38);        // name 转 UTF-8 字节
  v25 = *(_DWORD *)(a1 + 112);                   // a4 = 盐
  LOBYTE(v4) = v19 != -4;                        // flag：b3≠0xFC → 0x9C 路径恒为 1
  v26 = QByteArray::data(this: (QByteArray *)v38);
  v27 = sub_14000C9AF(a1: v26, a2: v4, a3: v23, a4: v25);  // hash（第三章）
  if ( v43 == (_BYTE)v27 && (_BYTE)v15 == BYTE1(v27)       // v43~v46 = b4~b7
    && v45 == BYTE2(v27) && v46 == HIBYTE(v27) )           // 四字节全等（小端）
  {
    if ( v19 == -100 )                          // 0x9C
    {
      if ( v36 > *(_DWORD *)(a1 + 108) )        // 17 > 版本字段 ?
      {
        v28 = 78;                               //   是 → 版本太旧
        goto LABEL_45;
      }
LABEL_34:
      v28 = 45;                                 //   否 → ★ 通过（45 映射 219）
      goto LABEL_45;
    }
    if ( v19 == -4 )                            // 0xFC 试用
    {
      v29 = sub_14000B0FA(a1: v39 + (v40 << 8) + (v41 << 16), a2: v27);  // hash 当密钥解期限
      if ( v29 != 0 )
      {
        *(_DWORD *)(a1 + 104) = v29;
        v28 = 147;
        goto LABEL_45;
      }
    }
    else if ( v31 != 0 )                        // 0xAC：等级检查（略）
    {
      if ( v37 > v31 ) { v28 = 78; goto LABEL_45; }
      goto LABEL_34;
    }
  }
  v28 = 231;                                    // 四字节不全等 → 无效
```

（0xFC 路径的 B0FA 也顺手贴了： `((k ^ key ^ 0x22C078) - 180597) ^ 0xFFE53167` ，取低 24 位后要求能被 17 整除再除以 17——一个"解密+模校验"的小变换，解出的值存 mgr+104，推测是试用期限。）

**校验等式**： `小端(hash(name, 1, 0, 盐)) == license 的 b4~b7` ——已用合法码动态验证：hash 输出 `0x6D791498` ，拆开正是 b4~b7 的 `98 14 79 6D` 。

* * *

## 三、hash 算法：sub_14043C0B0

结构一句话： `strlen(name)` → 逐字符 `toupper` （name 不区分大小写）→ 查 **256 项 uint32 常量表** （ `dword_140E1C0F0` ）累加出 32 位校验和。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5335fb30a98fea17.webp)

原反编译（行内注释）：

```c
__int64 __fastcall sub_14043C0B0(__int64 a1, int a2, char a3, char a4)
//                                   name      flag    盐a3     盐a4
{
  v5 = 0;
  v6 = -1;
  do ++v6; while ( *(a1 + v6) != 0 );            // 手写 strlen
  v7 = (int)v6;                                  // name 长度
  if ( v7 > 0 )
  {
    v8 = 0;                                      // i
    v9 = 0;                                      // 游标1，步进 19
    v10 = 15 * a4;                               // 游标2，步进 13，起点由 a4 定
    v11 = 0;                                     // 游标3，步进 7
    v12 = 17 * a3;                               // 游标4，步进 9，起点由 a3 定
    do
    {
      v13 = toupper( *(unsigned __int8 *)(v8 + a1) );   // 逐字符转大写
      v15 = &dword_140E1C0F0[v12];               // ★ 先取表项地址（旧游标）
      v16 = &dword_140E1C0F0[v10];
      v17 = v5 + dword_140E1C0F0[v13];           // acc + S[字符]
      if ( a2 != 0 )                             // flag=1（0x9C）：用偏移 13/47
      {
        v18 = dword_140E1C0F0[(unsigned __int8)(v13 + 13)] ^ v17;
        v19 = (unsigned __int8)(v13 + 47);
        v20 = v9;
      }
      else                                       // flag=0（0xFC）：用偏移 63/23
      {
        v18 = dword_140E1C0F0[(unsigned __int8)(v13 + 63)] ^ v17;
        v19 = (unsigned __int8)(v13 + 23);
        v20 = v11;
      }
      v5 = *v16 + *v15                           // ★ 用①的旧表项累加
         + dword_140E1C0F0[v20]
         + dword_140E1C0F0[v19] * v18;           // uint32 乘法自然截断
      v12 += 9;  v10 += 13;  v9 += 19;  v11 += 7;  // ★ 算完才步进（u8 回绕）
      ++v8;
    }
    while ( v8 < v7 );
  }
  return v5;
}
```

四个 u8 游标步进各异（9/13/7/19），使同一字符在 name 不同位置贡献不同；a3/a4 只影响游标起点（盐的作用）；flag 选择两组偏移。

**踩坑**：注意 ★ 标记的顺序——程序是" **先取表值、后步进游标** "（ `v15/v16` 在 += 之前取址），翻写时步进必须放在取值之后，否则每轮拿错表项。

* * *

## 四、字段解码器与逆变换

### 4.1 AD76（版本字段解码）：sub_14043C060

```c

y = ((x ^ 0x18) + 0x3D) ^ 0xA7
```

xor/加/xor 三步全可逆 → **双射**。逆函数：

```c

x = ((y ^ 0xA7) - 0x3D) ^ 0x18        // 验证: AD76(3)=255 ⇔ AD76_inv(255)=3
```

### 4.2 8C5B（盐解码）：sub_14043BFD0

```c

v1 = ((x ^ 0x7892) + 0x4D30) ^ 0x3421;

if (v1 % 11 != 0) return 0;

return v1 / 11;
```

前半段可逆；后半段 `/11` 看似单向，但函数 **保证 v1 是 11 的倍数**——给定商 q，v1 = 11q 唯一确定，故合法输出域内可逆：

```c

v1 = 11 * q;

x  = ((v1 ^ 0x3421) - 0x4D30) ^ 0x7892;   // mod 2^16
```

* * *

## 五、注册机实现

### 5.1 激活码逐字节怎么生成

license 一共 8 个字节，每个字节的"来历"全部已知，直接列成表：

| 字节  | 怎么生成 | 说明  |
| --- | --- | --- |
| b3  | **固定写死 0x9C** | 类型字节，选正式零售版 |
| b4  | hash(name) 的第 1 字节（最低位） | 算出来的，不能动 |
| b5  | hash(name) 的第 2 字节 | 同上  |
| b6  | hash(name) 的第 3 字节 | 同上  |
| b7  | hash(name) 的第 4 字节（最高位） | 同上  |
| b2  | `b5 ^ (v20 低字节)` | 反解：让程序算出的盐 = 你选的值 |
| b1  | `b7 ^ (v20 高字节)` | 同上（v20 = 8C5B逆(你选的盐)） |
| b0  | `b6 ^ AD76逆(255)` | 反解：让程序解出的版本 = 255（全版本通吃） |

生成顺序（注意先后依赖）： **先** 把 b3 写死、用 name 算出 hash 填好 b4~b7； **然后** b5/b7 已知了，用公式反解出 b2、b1（让盐合法）； **最后** b6 已知，反解 b0（让版本 = 255）。

### 5.2 源码

```python

// 算法来源: verifyLicense=sub_14043D0E0, hash=sub_14043C0B0
// license 结构 (0x9C 类型, 四段 8 字节):
//   b0 b1 b2 : 自由字节 (吸收盐/版本约束)
//   b3       : 0x9C 类型字节 (正式零售版)
//   b4..b7   : hash(name, 1, 0, a4) 的小端 4 字节
// 约束: AD76(b6^b0) >= 17 (取 255 全版本); 8C5B((b5^b2)+((b7^b1)<<8)) = a4 ∈ [1,1000]
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <ctype.h>

// 256 项 S-Box: IDA dword_140E1C0F0 原样导出
static const uint32_t S[256] = {
    0x39CB44B8, 0x23754F67, 0x5F017211, 0x3EBB24DA, 0x351707C6,
    0x63F9774B, 0x17827288, 0x0FE74821, 0x5B5F670F, 0x48315AE8,
    0x785B7769, 0x2B7A1547, 0x38D11292, 0x42A11B32, 0x35332244,
    0x77437B60, 0x1EAB3B10, 0x53810000, 0x1D0212AE, 0x6F0377A8,
    0x43C03092, 0x2D3C0A8E, 0x62950CBF, 0x30F06FFA, 0x34F710E0,
    0x28F417FB, 0x350D2F95, 0x5A361D5A, 0x15CC060B, 0x0AFD13CC,
    0x28603BCF, 0x3371066B, 0x30CD14E4, 0x175D3A67, 0x6DD66A13,
    0x2D3409F9, 0x581E7B82, 0x76526B99, 0x5C8D5188, 0x2C857971,
    0x15F51FC0, 0x68CC0D11, 0x49F55E5C, 0x275E4364, 0x2D1E0DBC,
    0x4CEE7CE3, 0x32555840, 0x112E2E08, 0x6978065A, 0x72921406,
    0x314578E7, 0x175621B7, 0x40771DBF, 0x3FC238D6, 0x4A31128A,
    0x2DAD036E, 0x41A069D6, 0x25400192, 0x00DD4667, 0x6AFC1F4F,
    0x571040CE, 0x62FE66DF, 0x41DB4B3E, 0x3582231F, 0x55F6079A,
    0x1CA70644, 0x1B1643D2, 0x3F7228C9, 0x5F141070, 0x3E1474AB,
    0x444B256E, 0x537050D9, 0x0F42094B, 0x2FD820E6, 0x778B2E5E,
    0x71176D02, 0x7FEA7A69, 0x5BB54628, 0x19BA6C71, 0x39763A99,
    0x178D54CD, 0x01246E88, 0x3313537E, 0x2B8E2D17, 0x2A3D10BE,
    0x59D10582, 0x37A163DB, 0x30D6489A, 0x6A215C46, 0x0E1C7A76,
    0x1FC760E7, 0x79B80C65, 0x27F459B4, 0x799A7326, 0x50BA1782,
    0x2A116D5C, 0x63866E1B, 0x3F920E3C, 0x55023490, 0x55B56089,
    0x2C391FD1, 0x2F8035C2, 0x64FD2B7A, 0x4CE8759A, 0x518504F0,
    0x799501A8, 0x3F5B2CAD, 0x38E60160, 0x637641D8, 0x33352A42,
    0x51A22C19, 0x085C5851, 0x032917AB, 0x2B770AC7, 0x30AC77B3,
    0x2BEC1907, 0x035202D0, 0x0FA933D3, 0x61255DF3, 0x22AD06BF,
    0x58B86971, 0x5FCA0DE5, 0x700D6456, 0x56A973DB, 0x5AB759FD,
    0x330E0BE2, 0x5B3C0DDD, 0x495D3C60, 0x53BD59A6, 0x4C5E6D91,
    0x49D9318D, 0x103D5079, 0x61CE42E3, 0x7ED5121D, 0x14E160ED,
    0x212D4EF2, 0x270133F0, 0x62435A96, 0x1FA75E8B, 0x6F092FBE,
    0x4A000D49, 0x57AE1C70, 0x004E2477, 0x561E7E72, 0x468C0033,
    0x5DCC2402, 0x78507AC6, 0x58AF24C7, 0x0DF62D34, 0x358A4708,
    0x3CFB1E11, 0x2B71451C, 0x77A75295, 0x56890721, 0x0FEF75F3,
    0x120F24F1, 0x01990AE7, 0x339C4452, 0x27A15B8E, 0x0BA7276D,
    0x60DC1B7B, 0x4F4B7F82, 0x67DB7007, 0x4F4A57D9, 0x621252E8,
    0x20532CFC, 0x6A390306, 0x18800423, 0x19F3778A, 0x462316F0,
    0x56AE0937, 0x43C2675C, 0x65CA45FD, 0x0D604FF2, 0x0BFD22CB,
    0x3AFE643B, 0x3BF67FA6, 0x44623579, 0x184031F8, 0x32174F97,
    0x4C6A092A, 0x5FB50261, 0x01650174, 0x33634AF1, 0x712D18F4,
    0x6E997169, 0x5DAB7AFE, 0x7C2B2EE8, 0x6EDB75B4, 0x5F836FB6,
    0x3C2A6DD6, 0x292D05C2, 0x052244DB, 0x149A5F4F, 0x5D486540,
    0x331D15EA, 0x4F456920, 0x483A699F, 0x3B450F05, 0x3B207C6C,
    0x749D70FE, 0x417461F6, 0x62B031F1, 0x2750577B, 0x29131533,
    0x588C3808, 0x1AEF3456, 0x0F3C00EC, 0x7DA74742, 0x4B797A6C,
    0x5EBB3287, 0x786558B8, 0x00ED4FF2, 0x6269691E, 0x24A2255F,
    0x62C11F7E, 0x2F8A7DCD, 0x643B17FE, 0x778318B8, 0x253B60FE,
    0x34BB63A3, 0x5B03214F, 0x5F1571F4, 0x1A316E9F, 0x7ACF2704,
    0x28896838, 0x18614677, 0x1BF569EB, 0x0BA85EC9, 0x6ACA6B46,
    0x1E43422A, 0x514D5F0E, 0x413E018C, 0x307626E9, 0x01ED1DFA,
    0x49F46F5A, 0x461B642B, 0x7D7007F2, 0x13652657, 0x6B160BC5,
    0x65E04849, 0x1F526E1C, 0x5A0251B6, 0x2BD73F69, 0x2DBF7ACD,
    0x51E63E80, 0x5CF2670F, 0x21CD0A03, 0x5CFF0261, 0x33AE061E,
    0x3BB6345F, 0x5D814A75, 0x257B5DF4, 0x0A5C2C5B, 0x16A45527,
    0x16F23945
};

// hash: sub_14043C0B0 逐行翻写
// name: UTF-8 字节串; flag: 0x9C 路径恒 1; a3: 恒 0; a4: 盐 [1,1000]
static uint32_t CalcHash(const char* name, int flag, uint8_t a3, uint8_t a4)
{
    uint32_t acc = 0;
    size_t len = strlen(name);
    if (len > 0)
    {
        uint8_t g1 = 0;            // 游标1, 步进 19
        uint8_t g2 = 15 * a4;      // 游标2, 步进 13, 起点由 a4 定
        uint8_t g3 = 0;            // 游标3, 步进 7
        uint8_t g4 = 17 * a3;      // 游标4, 步进 9, 起点由 a3 定
        for (size_t i = 0; i < len; i++)
        {
            uint8_t c = (uint8_t)toupper((uint8_t)name[i]);  
            uint32_t t = acc + S[c];
            uint32_t v18;
            uint8_t v19, v20;
            if (flag != 0) {
                v18 = S[(uint8_t)(c + 13)] ^ t;
                v19 = (uint8_t)(c + 47);
                v20 = g1;
            }
            else {
                v18 = S[(uint8_t)(c + 63)] ^ t;
                v19 = (uint8_t)(c + 23);
                v20 = g3;
            }
            //  程序先取表值后步进
            acc = S[g2] + S[g4] + S[v20] + S[v19] * v18;    
            g4 += 9; g2 += 13; g1 += 19; g3 += 7;
        }
    }
    return acc;
}

// AD76 逆: y = ((x^0x18)+0x3D)^0xA7  →  x = ((y^0xA7)-0x3D)^0x18
static uint8_t AD76_inv(uint8_t y)
{
    return (uint8_t)(((y ^ 0xA7) - 0x3D) ^ 0x18);
}

// 8C5B 逆: 正向 v1=((x^0x7892)+0x4D30)^0x3421, 返回 v1/11 (要求 v1%11==0)
// 给定商 q → v1 = 11*q (唯一) → 逆变换
static uint16_t C5B_inv(uint16_t q)
{
    uint32_t v1 = 11u * q;
    return (uint16_t)(((v1 ^ 0x3421) - 0x4D30) ^ 0x7892);
}

int main()
{

    char name[256] = { 0 };
    printf("Name: ");
    if (!fgets(name, sizeof(name), stdin)) return 1;
    name[strcspn(name, "\r\n")] = 0;   

    const uint16_t salt = 230;    // a4, [1,1000] 内任意
    const uint8_t  ver = 255;    // 版本上限, >=17

    uint8_t b[8] = { 0 };
    b[3] = 0x9C;                                   // 类型字节: 正式版
    uint32_t h = CalcHash(name, 1, 0, (uint8_t)salt);
    b[4] = (uint8_t)(h);                           // 小端拆 4 字节
    b[5] = (uint8_t)(h >> 8);
    b[6] = (uint8_t)(h >> 16);
    b[7] = (uint8_t)(h >> 24);

    uint16_t v20 = C5B_inv(salt);                  // 反解盐: 8C5B(v20)==salt
    b[2] = (uint8_t)(b[5] ^ (v20 & 0xFF));         // 程序里 v20=(b5^b2)+((b7^b1)<<8)
    b[1] = (uint8_t)(b[7] ^ (v20 >> 8));
    b[0] = (uint8_t)(b[6] ^ AD76_inv(ver));        // 程序里 ver=AD76(b6^b0)

    printf("License: %02X%02X-%02X%02X-%02X%02X-%02X%02X\n",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]);

    //  name 避开黑名单 AnyOne / 999, 前两字母避开 OW/JU 前缀
    system("pause");
    return 0;
}
```

* * *

## 六、反盗版机制

本地算法只是第一道门，软件还有纵深：

1.  **内置黑名单**：泄露 key 用户名表 + 名字前缀/key 指纹表（见 2.2）
    
2.  **联网审查**：mgr+0x7C 开关置位时（注册表持久化状态），调用 `sub_1402B5140` ，拼接 URL 上传 name/license 校验：
    

```python

https://www.sweetscape.com/cgibin/010editor_check_license_9b.php?t=<name>&sum=<license>&id=..&chk=..&typ=..
```

有意思的是 URL 的拼法—— **被拆成 20 余段**， `strcpy` 到末尾再逐段续接，中间还夹着立即数直接写内存：

```c
strcpy(v55, "https://www.sweetscape.com/");
// 此后每段都是 "do ++p; while(*p);"（strlen 内联）走到串尾，再 strcpy 续接
strcpy(p, "cgibin");      *(_WORD *)p = '/';
strcpy(p, "010editor");   *(_WORD *)p = '_';
strcpy(p, "check");       *(_WORD *)p = '_';
*(_QWORD *)p = 0x65736E6563696CLL;   // 小端读字节: 6C 69 63 65 6E 73 65 = "license"
*(_WORD *)p = '_';
*(_WORD *)p = '9';  *(_WORD *)p = 'b';  *(_WORD *)p = '.';
*(_DWORD *)p = 7366768;              // = "php"
strcpy(p, "?"); *(_WORD *)p = 't'; *(_WORD *)p = '=';
p += sprintf(p, "%s", urlencode(name));                  // ?t=<name>
p += sprintf(p, "&%s=%s", "sum", urlencode(license));    // &sum=<license>，立即数 7173491="sum"
p += sprintf(p, "&id=%d&chk=%d&typ=%d", ...);            // 7039075="chk"、7371124="typ"
// a2==0 走同步 HTTP（sub_140009A25），否则挂异步回调 "On_HttpCheckLicenseFinished"
```

**这就是为什么在字符串窗口搜 "sweetscape" 一无所获**——完整 URL 在.rdata 里根本不存在，全是运行时用立即数现场拼的（ `0x65736E6563696C` 小端 = "license"、 `7366768` = "php"），反静态搜索的典型手段。

审查失败弹出 "has detected that you have entered an invalid license" 反盗版警告（改值实验动态证实：把 +0x7C 从 0 改成 1，注册时立刻触发该警告）。

3.  **试用状态持久化**：审查/试用状态写 `HKCU\Software\SweetScape\010 Editor` ——改值实验触发反盗版警告后，+0x7C 被持久化，后续每次启动都恢复为 1，甚至导致试用期作废。异常时删除该注册表项即可重置。
