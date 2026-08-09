---
title: 【看雪】GameGuard NP CS_Auth3协议 （一）
source: https://bbs.kanxue.com/thread-292371.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-10T00:21:59+08:00
trace_id: 78631be7-8a1f-4a14-a011-29dedd633de2
content_hash: ca3777a2db53329806a7f73b0b9d7e76a9ca56f038d695868f8b91af5b1c6be5
status: synced
tags:
  - 看雪
  - 协议分析
  - 游戏安全
series: 【看雪】GameGuard NP CS_Auth3协议
feed_source: 看雪·逆向工程
ai_summary: CS_Auth3是NP反作弊的加密协议；通过抓包与客户端二进制逆向，还原出包结构、KDF/XOR头加密、双重CRC、TLV消息与状态结构，并给出伪造客户端包的方法。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b775244-d011-819a-999f-cec17e2be6de
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> CS_Auth3是NP反作弊的加密协议；通过抓包与客户端二进制逆向，还原出包结构、KDF/XOR头加密、双重CRC、TLV消息与状态结构，并给出伪造客户端包的方法。
> 
> - **包结构：** 客户端/服务器包统一为16字节KDF加密头 + 8字节对齐TLV载荷 + 2字节CRC2 + 2字节CRC1；首包服务器76B、客户端28B，头部解密后magic恒为0x001E，首包seq=1、msg_count=3、flags=0x0002。
> - **头加密：** 头部用derive_K(seed)派生32位K，首包counter=0时K固定0x91284712，密钥流为{K,2K,3K,4K}按字节XOR，后续包以counter为种子。
> - **CRC校验：** CRC1为固定多项式（0x0FAE）的CRC16，覆盖[0,size-3]；CRC2为带key的变体，counter=0时key=0x96E8（来自0x245D96E8低16位），覆盖解密头+载荷；两端均小端存储。
> - **错误码与TLV：** 对端以0xBAE为首包标志，0xBB8为CRC2错误映射基值，0xCE9/0xCEA分别表示CRC1/magic错误；载荷TLV消息type 1同步、2认证、11查表（索引≤50）、12列表（≤10项×10B）、13扩展、20-24状态，消息数由头msg_count指定。
> - **状态与伪造：** 客户端GameMon维护1456字节CsAuth3State（含magic 0x11223344、prev_size、counter、list、status等）；伪造包流程为derive_K→填头→载荷8字节对齐→先CRC2后CRC1，载荷必须含type 1同步以保证后续CRC2 key一致。

抓包 + 客户端二进制

* * *

## 1\. 包结构

```python
客户端包:
┌────────┬──────────────┬───────┬───────┐
│ 头 16B │ 载荷 (8对齐)  │ CRC2  │ CRC1  │
│ KDF加密│ TLV消息       │ 2B    │ 2B    │
└────────┴──────────────┴───────┴───────┘
                        ↑size-4 ↑size-2

服务器包: 同结构 (头16 + 载荷56 + CRC2 + CRC1)
```

头部明文（KDF解密后）:

```c
struct CsAuth3Header {
    uint16_t magic;     // 0x001E
    uint16_t seq;       // ≤5
    uint16_t msg_count;  // 期望消息数
    uint16_t flags;      // bit0=错误码映射 bit2=首包
    uint8_t  reserved[8];
};
```

首包（76B）解密头: `1E 00 01 00 03 00 02 00 00 00 00 00 00 00 00 00`

## 1.5 完整往返示例 (首包, counter=0)

```python
【服务器发来】 76B
0C 47 29 91 27 8E 52 22 36 D5 78 B3 48 1C A1 44   <- 头(密文)
C5 83 18 C9 C8 F8 43 40 06 70 09 20 B8 79 4C A9   <- 载荷
28 4D 4D 3B FA CB E7 9D 10 96 F2 AC E1 23 08 CB
CB E4 91 8F 92 37 C6 C1 9B 78 E2 B9 47 F9 98 F9
39 A0 BB 9F 36 4C CE 6F                          <- 载荷尾
67 5B                                            <- CRC2(服务器包不用)
8B 51                                            <- CRC1

解密头 (XOR K=0x91284712):
  1E 00 01 00 03 00 02 00 00 00 00 00 00 00 00 00
  magic=0x001E seq=1 msg_count=3 flags=0x0002
CRC1 = 0x518B = 存储 8B 51 ✓

【客户端回发】 28B
0C 47 29 91 27 8E 52 22 36 D5 78 B3 48 1C A1 44   <- 头(同K, 同counter)
00 00 00 00 00 00 00 00                          <- 载荷(8字节)
00 00                                            <- CRC2 = 0
EB 0B                                            <- CRC1

解密头: 同服务器包头
CRC1 = 0x0BEB = 存储 EB 0B ✓
CRC2 = 0x0000 (counter=0首包特征)
```

两端头相同（同 K=0x91284712, counter=0）。客户端包载荷 8 字节全 0。

* * *

## 2\. 头部 KDF + XOR

```c
uint32_t derive_K(uint32_t seed) {
    uint32_t K = (seed == 0) ? 0x91284712 : seed;
    if (K >= 100) K %= 100;
    if (K % 100 != 0) {
        for (int i = 0; i < K % 100; i++) {
            K = K * 0x27D2 - ((uint64_t)K * 0x76C4E92B >> 16) * 0x55D49D5A;
            if (K == 0) K = 0x7FFFFFFF;
        }
    }
    return K;
}

void encrypt_header(uint8_t plain[16], uint32_t K, uint8_t out[16]) {
    uint32_t key[4] = { K, 2*K, 3*K, 4*K };
    for (int i = 0; i < 16; i++)
        out[i] = plain[i] ^ ((uint8_t*)key)[i];
}
```

首包 K=0x91284712，密钥流 = `12 47 28 91 24 8E 50 24 36 D5 78 B3 48 1C A1 44` 。  
首包 seed=0（包计数器清零后），后续包 seed=counter。

* * *

## 3\. CRC1（固定多项式）

```c
uint16_t crc1(const uint8_t *data, int len) {
    uint16_t crc = 0;
    for (int i = 0; i < len; i++) {
        uint16_t e = data[i] << 8;
        for (int b = 0; b < 8; b++) {
            if ((e ^ crc) & 0x8000)
                crc = (crc ^ 0x0FAE) << 1;
            else
                crc <<= 1;
            e <<= 1;
        }
    }
    return ~crc;
}
// 范围 [0 .. size-3]，存 [size-2]，小端
```

76B 首包: crc1(pkt\[0:74\]) = 0x518B = 存储值 `8B 51`

* * *

## 4\. CRC2（keyed）

```c
uint16_t crc2(const uint8_t *data, int len, uint16_t key16) {
    uint16_t crc = 0;
    for (int i = 0; i < len; i++) {
        uint16_t br = data[i] << 8;
        for (int b = 0; b < 8; b++) {
            uint16_t t = br ^ crc;
            crc <<= 1;                          // shift 先
            if (t & 0x8000) crc ^= key16;        // xor 后
            br <<= 1;
        }
    }
    return ~crc;
}
// 范围 [0 .. size-5]，存 [size-4]，小端
```

key 派生：

```c
uint16_t derive_crc2_key(uint16_t counter, uint32_t prev_size) {
    uint32_t key;
    if (counter == 0)
        key = 0x245D96E8;
    else
        key = ((prev_size * 0x4912 - 0x918) * prev_size) * 0x9184;
    return key & 0xFFFF;   // 只用低16位 = 0x96E8 (counter=0)
}
```

CRC2 覆盖 = 解密头(16) + 载荷。76B 服务器包: crc2(解密头+载荷, 0x96E8) = 0x5B67 = 存储值

* * *

## 5\. 错误码

发包后对端返回的错误码（抓包/客户端日志可观测）:

| 码   | 含义  |
| --- | --- |
| 0xBAE | 首包标志（正常） |
| 0xBB8 | CRC2 不匹配（映射模式基值） |
| 0xCE5 | seq > 5 |
| 0xCE8 | CRC2 不匹配（严格） |
| 0xCE9 | CRC1 不匹配 |
| 0xCEA | magic ≠ 0x1E |
| 0xCEC | size < 16 |
| 0xCEE | size > 0x1000 |
| 0xCEF | size < 16（body） |
| 0xD4A | body 未 8 对齐 |
| 0xD52 | 消息数不符 |
| 0xD67 | 消息类型2 失败 |
| 0xD7A | 消息类型11 内容不符 |
| 0xD913 | 消息类型1 哈希失败 |
| ≥0xBB8 | 置错误标志 → 后续 Check 假通过、Get 停发 |

* * *

## 6\. TLV 消息（载荷）

```c
struct TlvMsg {
    uint16_t type;
    uint16_t length;   // 含头
    uint32_t value;
    // 后续字段按类型定
};
```

| type | 含义  | 关键操作 |
| --- | --- | --- |
| 1   | 同步  | hash = value² × msg.word2 × 0x622B60B；同步下个包大小(CRC2 key源) |
| 2   | 认证  | 设 ID/IP；模块查表校验 |
| 3   | 日志  | —   |
| 10  | 配置  | —   |
| 11  | 查表  | 索引 ≤ 50 |
| 12  | 列表  | ≤10 项 × 10 字节 |
| 13  | 扩展  | 按模式分支 |
| 20-24 | 状态  | 写状态字段，含 magic 0x9128/0x8757/0x4813 |

msg_count（头 word2）= 期望消息数。

* * *

## 7\. State 结构（1456 = 0x5B0 字节）

客户端 GameMon 内维护的状态结构：

```c
struct CsAuth3State {        // offset
    uint32_t magic;          // +0x04  0x11223344
    uint32_t flags;          // +0x08  bit0/2/3
    uint16_t word1;          // +0x5A  消息1同步
    uint32_t prev_size;      // +0x5C  CRC2 key源
    uint16_t first_pkt;      // +0x60
    char    *user_id;        // +0x64
    char    *ip_addr;        // +0x68
    uint16_t counter;        // +0x6C  KDF种子
    char    *exinfo;         // +0x70
    uint8_t  list[100*10];   // +0x47C 消息12
    uint16_t list_count;     // +0x4E0
    uint32_t ext_info[6];    // +0x4E8 消息13
    uint16_t status[4];      // +0x502 消息20-24
    uint8_t  ready;          // +0x510
    uint32_t error_flag;     // +0x5A8 ≥0xBB8置位
};
```

* * *

## 8\. 伪造客户端包

```c
void build_client_pkt(uint8_t *out, uint16_t counter, uint32_t prev_size,
                      uint8_t *tlv_payload, int payload_len) {
    // 1. 头
    uint32_t K = derive_K(counter);
    CsAuth3Header hdr = { 0x001E, 1, msg_count, 0, {0} };
    encrypt_header((uint8_t*)&hdr, K, out);

    // 2. 载荷补齐8字节
    int body_len = payload_len;
    memcpy(out+16, tlv_payload, body_len);
    while (body_len % 8) out[16 + body_len++] = 0;
    int size = 16 + body_len + 4;

    // 3. CRC2
    uint16_t k2 = derive_crc2_key(counter, prev_size);
    *(uint16_t*)(out + size - 4) = crc2(out, size - 4, k2);

    // 4. CRC1
    *(uint16_t*)(out + size - 2) = crc1(out, size - 2);
}
```

载荷需含至少消息类型1（同步包大小），否则后续 CRC2 key 源对不上。

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#问题讨论](https://bbs.kanxue.com/forum-4-1-197.htm)
