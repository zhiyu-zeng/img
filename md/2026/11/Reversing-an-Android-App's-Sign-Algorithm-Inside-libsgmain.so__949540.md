---
title: "Reversing an Android App's Sign Algorithm: Inside libsgmain.so"
source: https://www.colinxiao.com/reversing-android-sign-algorithm-libsgmain/
source_host: www.colinxiao.com
clip_date: 2026-11-05T10:25:30+08:00
trace_id: 047b66ec-ed44-4c7d-824a-153b01716119
content_hash: 7dd983515e1d4004650cf1b58f7632f4cc077cf6e8e4ac790cdcce6139a44741
status: synced
tags:
  - Android逆向
  - 协议分析
series: null
feed_source: Colin Xiao·逆向/安全研究
ai_summary: 阿里安全SDK libsgmain.so 的 sign 实为 key2 经 0x36/0x5C 异或填充的 HMAC 类运算，20 字节结果再按半字节编码扩展为 40 字符。
ai_summary_style: key-points
images_status:
  total: 31
  succeeded: 31
  failed_urls: []
notion_page_id: 40f75244-d011-8160-aa34-d63babd9758c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 阿里安全SDK libsgmain.so 的 sign 实为 key2 经 0x36/0x5C 异或填充的 HMAC 类运算，20 字节结果再按半字节编码扩展为 40 字符。
> 
> - **协议与入口：** 应用协议为明文传输，仅靠单一 `sign` 字段校验；Java 层调用链为 SecuritySignature.sign() → JNICLibrary.doCommandNative(10401, hash+time+"6.3", UUID, 3, "0335")，最终进入 native。
> - **伪装与混淆：** `libsgmain.so` 实为 JAR 伪装；函数入口/出口读取内存值做比较形成控制流混淆，patch 掉比较即可让 IDA 正常 F5。类字符串用 RC4 解密（密钥 `DcO/lcK+h? m3c*q@`，跨版本相同），`doCommandNative` 在 0xbdce 注册，实际实现地址为 0x29d0d。
> - **反编译陷阱：** IDA 将 BEQ 反编译成 `if (!v8)`，按汇编逻辑应为 `if (v8)`——对象数组非空时才对参数调用 `String.getBytes`，作者在此卡了数日。
> - **sign 算法：** 位于 0x75dda 方法 case 0x17（偏移 0x76ff6）：key2 复制 64 字节后分别异或 0x36/0x5C（HMAC ipad/opad 结构），各追加 hash 运算两轮得 20 字节 key_3；再对每字节高/低 4 位分别 `|0x30` 或 `+0x57` 编码，扩展为 0x28 字节最终 sign。
> - **校验与遗留问题：** 四层 switch 迷宫中来源不明的 key_2 疑似绑定 APK 签名——重打包或改密钥均无法得到有效 sign；token 在换 imei、重新注册、换热点后均不变，疑似源自底层设备 ID，未能还原。

> **About the author.** I’m Colin Xiao — an independent reverse engineer, mostly working solo on contract jobs. I dig into compiled code of every kind, including but not limited to: Android and iOS apps, x86/x64/ARM native binaries, packers and obfuscators, DRM and license checks, network protocols and APIs, crypto and signature algorithms, malware, game binaries, and embedded/IoT firmware. I also handle large-scale data collection and vulnerability research. If you have any project in mind, I’d be glad to take it on — whatever it is, as long as it’s within my wheelhouse. Just reach out. You can reach me on X at @colinxiao_lab or on Telegram at [https://t.me/ColinXiao666](https://t.me/ColinXiao666).

> *This research is published for educational and defensive purposes. The target sample is anonymized throughout.*

* * *

At the start of 2020 I was stuck at home, so I pulled out an APK I’d come across and took it apart. I’m no expert — just having fun.

The app’s protocol is plaintext, with a single `sign` field for verification.

## 1\. The protocol

**Long-connection heartbeat:**

![Heartbeat](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d65199b02e4c3c16.webp)

Response:

```json
{"cod":"0","type":"5","msg":"success","username":"ii12qqaa","vip":"regular member","time":"8888888888","jifen":"0","login":"106","userid":"4232206e2a","token":"9f1ff9900178b5d0fe3db2a37d078ac5201c02380ebb0ba71a3bbf71bb2a8b2c0e18907e0383e8341dc00ee45fbc6923be0313f558197894"}
```

**Login and registration:**

![Login and registration](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5a3cdf968ee9d07.webp)

`Type 1 = login, 2 = register`. `username` and `password` are the credentials; `imei` is the device serial; `t` is the timestamp; `sign` is the encrypted verification.

Response:

```json
{"cod":"0","type":"2","msg":"registered","username":"yyyyyy1234qq","vip":"regular member","time":"8888888888","jifen":"0","login":"0","userid":"06ef899b13","token":"9f1ff9900178b5d0fe3db2a77951decf2913053b5cbb0ba71a3bbf71bb2a8b2c0e18907e0383e8341dc00ee45fbc6923be0313f558197894"}
```

**Search.** `Name` is the search term:

![Search protocol](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c04b12369a29f573.webp)

Tapping a list item sends `urn:btih:`, a timestamp, and `sign` to the server:

![Tapping a list item](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/051e92b35aea5355.webp)

Response:

```json
{"msg":"0","list":[{"name":"1.rm","data":"83a371d890c1178e8ecc8c060f17d2acf4a0eff707955035be407f7ce707d8ed49d5689a4abbffb8","size":""}]}
```

Tapping again:

![Tapping again](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b7939bdea5cd472.webp)

Response:

```json
{"url":"http://[redacted]/video.php?host=[redacted]&code=87d1e08d092c1d05527947754d542095aade3db0cf4619df17e81d10b6e414c4fe101e3622bbcc09f45404c17b601e05d2861bfb4799b740e087e2d94ab886f7&data=83a371d890c1178e8ecc8c060f17d2acf4a0eff707955035be407f7ce707d8ed49d5689a4abbffb81d30aadc7fb85e082658c7","cookie":"b4d29c58","msg":"0"}
```

That’s the video source. Time to find the `sign` algorithm.

## 2\. The APK source

In `com.Soku.jxActivity` ’s inner class `madaper`, `onBindViewHolder` sends the hash and data to get the video address:

![onBindViewHolder](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae3e3b071d68ceac.webp)

`sign` is the return value of `com.Soku.Sign.getsign`, passed `hash+time` (`BuildConfig.VERSION_NAME` is `"6.3"`):

![getsign](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/156f0674fce2a675.webp)

Then it calls `suritySignature.sign()`, a class in `ibaba.wireless.security.jaq.SecuritySignature` (`SecureSignatureDefine.OPEN_KEY_SIGN_INPUT` is `"INPUT"`):

![SecuritySignature](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/720048ddb3222d74.webp)

Next is an interface, `IsecureSignatureComponent`, implemented in `lib/armeabi/d1libsgmain.so` — which isn’t actually a `.so` but a JAR.

I used DDMS to draw the function trace and get the full call chain:

```text
com.alibaba.wireless.security.a.h.a.sign()
  -> com.taobao.wireless.security.adapter.a.b.a()   // checks the passed-in map type
  -> com.taobao.wireless.security.adapter.a.b.a()   // overload; converts Unicode bytes to UTF-8
  -> com.taobao.wireless.security.adapter.JNICLibrary.doCommandNative(int i, Object... objArr)
```

Finally it hits the native function. The passed arguments are `10401`, `new Object{ hash+time+"6.3", "3be780bc-8cf2-446c-9e03-de3a8fd9d0a7", Integer.valueOf(3), "0335" }`.

## 3\. Analyzing libsgmain.so

Inside the JAR, `lib/armeabi/libsgmain-5.4.56.so`. Crudely zero out all the section-header offsets and sizes, then open it in IDA. The `.so` has heavy control-flow obfuscation — see [this writeup](https://www.anquanke.com/post/id/179080) for details.

A lot of functions can’t be decompiled. The pattern: at function entry and exit, the code reads a value in memory and compares them; if unequal it jumps to another address. That value isn’t used in the actual computation, so patching it out doesn’t affect analysis and lets IDA happily F5.

![Before](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/28b98edfca9c4035.webp) ![After](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/31d127b7000d4c8d.webp)

**Execution flow.** First the `.so` looks up `Boolean`, `String`, `Integer` and makes global references to the methods. Then at `0xb9b0` it decrypts and loads `com/taobao/wireless/security/adapter/common/HttpUtil`.

The decrypt function is `sub_903F0`: arg1 is the data to decrypt, arg2 the return buffer, arg3 the size. It first allocates 56 bytes (`malloc_56`), then 11 bytes, and puts the 11-byte pointer into the start of `malloc_56`. The 11 bytes hold a 10-byte RC4 key; `malloc_56[1]` is 0, `malloc_56[2]` is 11, and the rest are function pointers:

![The malloc\_56 structure](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df351a745354b16b.webp)

The key is `DcO/lcK+h? m3c*q@` (seems to be the same across versions):

![The RC4 key](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/720b7107b9a819e9.webp)

![The RC4 key](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b4c02caa9a36eb07.webp)

Then it allocates another `malloc_56`, whose first field holds the address of the data to decrypt. A `switch` in `0x75DDA` calls `sub_7C700` — the RC4 decrypt. `RC4_Initialization` sets up the XOR box, `RC4_Decrypt` decrypts:

![RC4 init and decrypt](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c648477aaa90e07c.webp)

`sub_7CA82` is `RC4_Decrypt`:

![sub\_7CA82 = RC4\_Decrypt](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/36e6dabf39986b4d.webp)

After several rounds of decrypting and loading other classes, at offset `0xB986` it decrypts and loads `com.taobao.wireless.security.adapter.JNICLibrary`:

![Loading JNICLibrary](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91432dee9576acd3.webp)

After `JNICLibrary` loads it doesn’t immediately call `RegisterNatives`; it keeps decrypting and loading more classes, creating globals. Finally at `0xbdce` it registers `doCommandNative`, with the function at `0xbc38`:

![Registering doCommandNative](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5b6577cd824993da.webp)

`doCommandNative` ’s return value `v6` comes from `loc_9CD0`:

![doCommandNative](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/10864335e777e249.webp)

The return value `v9` comes from an `off` function, obtained via `sub_9630` decryption. `doCommandNative` is passed `1, 4, 1, 1, m_off, 0`, and the resolved address is `0x29d0d`:

![The off function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f22d492c91064f2c.webp)

`m_off + 16` is the `objarray` passed from Java, `m_off + 12` is the `env` (this method doesn’t end at `sub_29F9C`, it just jumps there):

```c
void __fastcall 29E6C(int m_off, _DWORD *a2, int a3, int a4, int a5, int a6)
{
  v21 = m_off;
  v22 = *(_DWORD *)off_ABBA8;   // get the value here; fetched again at function end
  *a2 = 99;
  v23 = *(_DWORD *)(m_off + 16);
  (*(void (**)(void))(**(_DWORD **)(m_off + 12) + 692))();   // JNI::GetObjectArrayElement
  v24 = *(_DWORD *)(v21 + 12);
  sub_9A568();                 // process arg[0] (hash+time+6.3)
  v25 = *(_DWORD *)(v21 + 16);
  sub_9C6E0(*(JNIEnv **)(v21 + 12));   // process arg[1] key
  sub_9C7AC(*(_DWORD *)(v21 + 12), *(_DWORD *)(v21 + 16), 2);   // process arg[2], call intValue
  v26 = *(_DWORD *)(v21 + 16);
  sub_9C6E0(*(JNIEnv **)(v21 + 12));   // process arg[3]
  sub_29F9C();
}
```

`sub_9A568` mallocs a block of size `ArrayLength * 4`:

![sub\_9A568 malloc](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e693afd01e65c16d.webp)

There’s a small bug here:

```c
v8 = ((int (__fastcall *)(JNIEnv *, int, int))(*v4)->GetObjectArrayElement)(v4, v12, v7) == 0;
v9 = 0;
if ( !v8 )
  sub_9A138();
*(_DWORD *)(v13 + 4 * v7++) = v9;
```

`if (!v8)`? `v8` is the object array — on success it just gets thrown away?? So later, loading a value from this malloc gives `LDR R0, 0x0000000`? This bugged me for days; I thought some later function must be touching this malloc.

The assembly:

![The BLX R3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/002c21954070698d.webp)

`BLX R3` is the `GetObjectArrayElement` call. `BEQ` branches on equal, so the decompiled C should really be `if (v8)`:

![The BEQ](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/236e470b46124a6a.webp)

`sub_9A138` calls the Java method `String.getBytes` on the object array just obtained, then reads its `ArrayLength` and `ByteArrayElements`. It allocates a 56-byte block (`malloc_56`) with the same structure as the class-name decrypt, copies `ByteArrayElements` into `malloc_arr`, and returns:

![sub\_9A138](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a0fe7bbc66dbf483.webp)

`sub_9C6E0` (the key handler) is similar: it gets the key’s object array, calls `GetStringUTFChars`, allocates `malloc_32` and `malloc_128`, stores the `malloc_128` pointer in `malloc_32[0]`, the size in `malloc_32[2]`, plus function pointers, then appends the UTF-8 key after `malloc_32`:

![sub\_9C6E0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b16ccddb7b09e603.webp)

![sub\_9C6E0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f17bd483694ddd43.webp)

`sub_9C7AC` calls the Java `intValue` method to get the return value. There’s another decrypt function, `sub_903F0` — running it directly returns 0. The Java-layer arguments are now fully processed.

Next it processes `sub_9A568` ’s return value again, allocating `malloc_8`:

```c
malloc_8 = (_DWORD *)malloc_0(8);
if ( !malloc_8 )
{
  sub_A1308(0, v22, v23, v24, 0, v22);
  __asm { LDCL            p15, c15, [R8], {0xFF} }
}
*malloc_8 = 0;
malloc_8[1] = 0;
v23 = 4 * number;
*malloc_8 = **(_DWORD **)(hashobj + 4 * number);
malloc_8[1] = *(_DWORD *)(*(_DWORD *)(hashobj + 4 * number) + 4);
*(_DWORD *)(malloc_off + 4 * number) = malloc_8;
```

`malloc_off` is the `ArrayLength * 4` block allocated by the decrypt function (the `ArrayLength` in `sub_9A568`):

![malloc\_off](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fcd5ff7a2f34d109.webp)

Then it calls `sub_46708` with the `malloc_off` pointer and a pointer holding `0x63`. `sub_46708` calls `0x9db0` three times, discarding all return values — no idea what it does:

![sub\_46708](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd80eb28cd265760.webp)

`0x9db0` is the function that decrypts `doCommandNative` ’s processed arguments. At `0x46BD2` there’s a `switch` with `r1 = 0x4977c`:

![The switch at 0x46BD2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/595f43df46f4ecc2.webp)

`0x4977c` holds a big switch loop — IDA couldn’t “Specify switch idiom” for some reason, so I had to squint through it:

![The big switch](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac74cf6f1db91640.webp)

`switch_2`:

![switch\_2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/74924e3b132280e6.webp)

I haven’t found where this data comes from, but re-packaging the APK or changing the key both fail to return a valid `sign` — so this data is probably the APK’s signature. These four switch layers are a maze:

![The four-layer switch maze](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c42c581aae44f8e.webp)

`key_2` isn’t derived from the key by encryption or anything — I suspect it’s tied to the APK’s signature verification.

The final `sign` algorithm is in `case 0x17` of the `0x75dda` method, at offset `0x76ff6`. Both arguments are `malloc_56` structs: the first holds `key2`, the second holds `hash+time+"6.3"` (or just `time+"6.3"` for heartbeat):

```c
int __fastcall Decryptkey(int key2_malloc, int hash)
{
  hash_ = hash;
  v48 = *off_ABBA8;
  v3 = 0;
  if ( key2_malloc )
  {
    if ( hash )
    {
      key2_size = *(key2_malloc + 4);
      if ( key2_size )
      {
        if ( *(hash_ + 4) )
        {
          if ( key2_size < 65 )
            v5 = (*(key2_malloc + 40))();       // create a malloc_56 struct and copy key2 over
          else
            sub_78530();
          v7 = v5;
          m_key2 = 0;
          if ( v5 )
          {
            v9 = *(v5 + 4) == 0;
            v10 = 0;
            v11 = 0;
            v3 = 0;
            if ( !v9 )
            {
              v44 = mirror_key2_1;
              key2 = v7;
              v45 = v7;
              aeabi_memclr4(mirror_key2_1, 64);
              aeabi_memclr4(mirror_key2_2, 64);
              memcpy8(mirror_key2_1, *key2, key2[1]);
              memcpy8(mirror_key2_2, *key2, key2[1]);
              i = 0;
              do
              {
                mirror_key2_1[-i] ^= 0x36u;
                mirror_key2_2[-i] ^= 0x5Cu;
                --i;
              }
              while ( i != -64 );
              sub_97DA4();                      // allocate malloc_56_100
              m_key2 = malloc_56_100;
              (*(malloc_56_100 + 12))();        // copy mirror_key2_1
              (*(m_key2 + 48))(m_key2, hash_);  // append hash to mirror_key2_1
              sub_78530();                      // not worth reading into this one
              v16 = v15;
              v11 = 0;
              if ( v15 )
              {
                v3 = 0;
                v7 = v45;
                if ( *(v15 + 4) )
                {
                  sub_98594();                  // allocate malloc_56 with 0x40 of data, copy mirror_key2_2 over
                  v18 = v17;
                  (*(v17 + 48))();              // append hash to mirror_key2_2 in the new malloc_56
                  sub_78530();                  // run it again; the return value is key_3
                  v11 = v18;
                  v7 = v45;
                  v3 = v19;
                }
              }
              else
              {
                v3 = 0;
                v7 = v45;
              }
              v10 = v16;
            }
          }
          else
          {
            v10 = 0;
            v11 = 0;
            v3 = 0;
          }
          v20 = v10;
          free_malloc56(v7, v7, v11, v6, v43, v44, v45, v11);
          free_malloc56(m_key2, v21, v22, v23, v24, v25, v26, v27);
          free_malloc56(v20, v28, v29, v30, v31, v32, v33, v34);
          free_malloc56(v41, v35, v36, v37, v38, v39, v40, v41);
        }
      }
    }
  }
  result = *off_ABBA8 - v48;
  if ( *off_ABBA8 == v48 )
    result = v3;
  return result;
}
```

I wanted to reproduce the algorithm, but I got lost tracing it. By then the lockdown was winding down, so I moved on to job hunting.

Anyway, I’ve released the original `.so`; the signature function’s location is described above for anyone interested.

This function returns a 20-byte (`0x14`) block — call it `key_3` — which then goes through:

```c
do
{
  _byte = *(*key_3 - i);              // fetch one byte of key_3
  v7 = (_byte >> 4) + 87;             // loop: get a byte from key_3
  if ( _byte >> 5 <= 4 )              // if byte < 0x80: logical-right-shift 4 then OR 0x30
                                      // otherwise: logical-right-shift 4 then add 87 (0x57)
    v7 = (_byte >> 4) | 0x30;
  offset = 2 * i;
  *(*sign - 2 * i) = v7;              // put the value into sign (result); i is negative
  v9 = _byte & 0xF;                   // byte & 0xF; if < 0xA OR 0x30, else add 0x5C
                                      // 0x30-0x39 are 0-9, 0x61-0x7A are lowercase letters
  if ( v9 < 0xA )
  {
    v11 = v9 | 0x30;
    sign_off = *sign - offset;
  }
  else
  {
    sign_off = *sign - offset;
    v11 = v9 + 87;
  }
  *(sign_off + 1) = v11;              // put into sign
  --i;
  key_3 = key_3_;
}
while ( -var_0x14 != i );
```

That expands `key_3` to `0x28` bytes — the final `sign`.

As for the `token`: I tried packet-capturing and changing the login protocol’s `imei`, and re-registering accounts — even switching hotspots returned the same value. I suspect it’s derived from a lower-level device id. That’s beyond me for now.

* * *

**Colin Xiao**— I take on contract reverse-engineering work, and writeups like this are how I show what I can do. If you need help with anything in this space — including but not limited to the areas I cover above — I’m available. No project is too big or too small — if it’s reverse engineering and I can do it, I’ll take it. DM me on X (@colinxiao_lab) or Telegram (@ColinXiao666).

**Get in touch**
