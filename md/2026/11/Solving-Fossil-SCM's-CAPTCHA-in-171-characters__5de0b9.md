---
title: Solving Fossil SCM's CAPTCHA in 171 characters
source: https://blog.nns.ee/2026/01/29/fossil-captcha-solver/
source_host: blog.nns.ee
clip_date: 2026-11-02T10:14:58+08:00
trace_id: 11c422fa-bc92-4cc6-ada0-e0e9ee8f7837
content_hash: 186de66c11e331dbc27227af5aeae95ca75a5afd09ee5cc450a60f3c8b52d26f
status: synced
tags:
  - 风控对抗
  - Python
series: null
feed_source: nns.ee·Android/漏洞研究
ai_summary: Fossil SCM 的 ASCII 艺术验证码只需读取第 3、6 行即可唯一区分 16 个十六进制字符，经 XOR+模运算压缩查找表后可用 171 字符的 Python 单行破解。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-81d4-9bf6-ca56fbfcd4e4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Fossil SCM 的 ASCII 艺术验证码只需读取第 3、6 行即可唯一区分 16 个十六进制字符，经 XOR+模运算压缩查找表后可用 171 字符的 Python 单行破解。
> 
> - **脆弱根源：** 该验证码用 5×7 位图字体将十六进制数字渲染为 `██` 块字符画，每位占 12 字符宽，字体数据明文存于 captcha.c。
> - **关键降维：** 作者穷举验证发现仅取第 3、6 两行即可唯一标识全部 16 个字符，模式从 35 位压缩到 10 位。
> - **查找表压缩：** 10 位模式值（46~990）先 XOR 293 再 mod 21 仍保持 16 个唯一余数，查找表从 43 字符缩至 21 字符。
> - **Code Golf 技巧：** 海象运算符内联赋值、用 `字符 > '!'` 单字符判定（█=9608、空格=32、!=33）、布尔转整数的位偏移公式 `5*(r<4)+4-c`。
> - **官方态度：** Fossil 源码注释承认该验证码易被攻破，实际依赖 robot.c 中的 proof-of-work 机制防自动化脚本。

I recently stumbled upon what might be the most charmingly naive CAPTCHA implementation I've ever seen: [Fossil SCM](https://fossil-scm.org/) 's text-based CAPTCHA. It renders hex digits as ASCII art using unicode block characters, and asks users to type what they see. You can find a live example [here](https://fossil-scm.org/home/ityaar).

Here's what `69B34B04` looks like:

```plain
  ██████      ██████    ████████      ██████          ██    ████████      ██████          ██    
██      ██  ██      ██  ██      ██  ██      ██      ████    ██      ██  ██    ████      ████    
██          ██      ██  ██      ██          ██    ██  ██    ██      ██  ██  ██  ██    ██  ██    
████████      ████████  ████████        ████    ██    ██    ████████    ████    ██  ██    ██    
██      ██          ██  ██      ██          ██  ██████████  ██      ██  ██      ██  ██████████  
██      ██  ██      ██  ██      ██  ██      ██        ██    ██      ██  ██      ██        ██    
  ██████      ██████    ████████      ██████          ██    ████████      ██████          ██    
```

My immediate thought was to try and write a solver for it for fun, but while doing so I wondered how small the solver could possibly go. Having never done any sort of code golfing before, this seemed like a good excuse to try.

### Understanding the Font

Digging into Fossil's [captcha.c](https://fossil-scm.org/home/file?name=src/captcha.c&ci=e2bdc10572c51069), we find a 5*7 bitmap font. Each hex digit is defined as 7 bytes, where each byte represents a row of 5 pixels:

```c
static const unsigned char aFont2[] = {
  /* 0 */  0x0e, 0x13, 0x15, 0x19, 0x11, 0x11, 0x0e,
  /* 1 */  0x02, 0x06, 0x0A, 0x02, 0x02, 0x02, 0x02,
  // ... and so on for all 16 hex digits
};
```

When rendered, each "on" pixel becomes `██` (two block characters) and each "off" pixel becomes two spaces. Characters are separated by two additional spaces, resulting in a 12-character stride per digit.

### Version 1: The straightforward approach

My first solver was relatively readable and obvious: pre-render all 16 patterns from the font, then match each digit.

```python
FONT = bytes.fromhex(
    '0e13151911110e'  # 0
    '02060a02020202'  # 1
    # ... all 16 digits
)

def solve(captcha):
    lines = captcha.split('\n')[:7]
    result = ''
    for pos in range(0, len(lines[0]), 12):
        # extract 7-byte pattern
        pattern = bytes(
            sum(1 << (4-col) for col in range(5) 
                if lines[row][pos+col*2:pos+col*2+2] == '██')
            for row in range(7)
        )
        char_idx = FONT.find(pattern) // 7
        result += '0123456789abcdef'[char_idx]
    return result
```

This works, but it's fairly bulky. The font data alone is 224 hex characters. Maybe we don't need the entire font map.

### Version 2: Two rows are enough

I wondered if we actually needed every row of every digit. If we can find a pair of rows that uniquely identifies all 16 hex digits, we can ignore the rest.

I wrote a quick script to check all row combinations:

```python
for r1 in range(7):
    for r2 in range(r1+1, 7):
        patterns = [(font[digit][r1], font[digit][r2]) for digit in range(16)]
        if len(set(patterns)) == 16:
            print(f"rows {r1},{r2} are unique!")
```

Rows (0,3) and (3,6) both seemed to work. When doing my experiments, I attempted everything with both options, but the final most optimal result ended up being (3,6) in the end.

This reduces our pattern from 35 bits (7 rows \* 5 bits) to just 10 bits (2 rows \* 5 bits).

With 10-bit patterns, our values range from 46 to 990. A direct lookup table would need 991 entries with only 16 used, which is incredibly wasteful.

Instead, I searched for a modulus where all 16 patterns give unique remainders:

```python
patterns = [814, 66, 95, 206, 578, 46, 974, 136,
            462, 494, 561, 990, 526, 572, 927, 976]

for m in range(16, 100):
    if len(set(p % m for p in patterns)) == 16:
        print(f"mod {m} works!")
        break

# Output: mod 43 works!
```

Now I can build a sparse 43-character lookup string:

```python
lookup = ['?'] * 43
for pattern, char in zip(patterns, '0123456789abcdef'):
    lookup[pattern % 43] = char

# Result: ?ba5???7?2c??d?????4?9?1e???6?f?8?3?????0??
```

The `?` characters are never accessed, they're essentially just padding so the lookup works.

### Version 3: Let's go golfing

Here's a readable version of what we have so far:

```python
def solve(captcha):
    LOOKUP = '?ba5???7?2c??d?????4?9?1e???6?f?8?3?????0??'
    lines = captcha.split('\n')
    result = ''
    for pos in range(0, len(lines[0]), 12):
        pattern = 0
        for row in (3, 6):
            for col in range(5):
                if lines[row][pos + col*2 : pos + col*2 + 2] == '██':
                    bit_position = 5 * (row < 4) + 4 - col
                    pattern |= 1 << bit_position
        result += LOOKUP[pattern % 43]
    return result
```

I browsed the [code golfing Stack Exchange](https://codegolf.stackexchange.com/) for some inspiration and found a few tricks we could apply here.

**Trick 1: Walrus operator for assignment-in-expression**

```python
s = lambda t: (L := t.split('\n')) and ''.join(...)
```

The walrus operator (`:=`) assigns `L` and returns it. Since a non-empty list is truthy, `and` evaluates and returns the right side.

**Trick 2: Single-character pixel detection**

Instead of `lines[row][pos+col*2:pos+col*2+2] == '██'`, we can check just one character:

```python
lines[row][pos + col + col] > '!'
```

The reason this works is that the block character `█` has the unicode value 9608 and space is 32. `!` is 33, which means `char > '!'` is `True` for blocks, `False` for spaces. This saves a mere one character by not having to use the comparison operator `==`.

**Trick 3: Bit position formula**

Since boolean values map to `0` and `1` when used as integers, we can use a comparison to pack the bit position calculation into one formula for both rows: `5*(r<4)+4-c`.

So for both rows:

-   When `r=3`: `5*True + 4 - c` = `5 + 4 - c` = bits 9,8,7,6,5
-   When `r=6`: `5*False + 4 - c` = `0 + 4 - c` = bits 4,3,2,1,0

**Result: 187 characters**

```python
s=lambda t:(L:=t.split('\n'))and''.join('?ba5???7?2c??d?????4?9?1e???6?f?8?3?????0??'[sum((L[r][p+c+c]>'!')<<5*(r<4)+4-c for r in(3,6)for c in range(5))%43]for p in range(0,len(L[0]),12))
```

This was pretty good compared to the original.

### Version 4: Why 43?

At this point I wondered whether could we shrink the lookup table further by transforming the pattern values.

The modulus of 43 felt a bit arbitrary. What if we XOR the pattern with some constant before taking the modulo? This might "scramble" the values into a smaller range.

I brute-forced it:

```python
patterns = [814, 66, 95, 206, 578, 46, 974, 136,
            462, 494, 561, 990, 526, 572, 927, 976]

for xor_val in range(1, 2048):
    transformed = [p ^ xor_val for p in patterns]
    for m in range(16, 43):
        if len(set(t % m for t in transformed)) == 16:
            print(f"^{xor_val} %{m} works")
            break
```

This resulted in a few valid options that were smaller, but the smallest result ended up being `^293 %21`. By XORing the result with 293 before taking mod 21, we still have unique values for all 16 digits. The lookup table shrinks from 43 to just 21 characters:

```plain
2f1?8e?b374a6c95d??0?
```

The tradeoff is that we need parentheses around the XOR operation (since `^` has lower precedence than `%`), adding a few characters of syntax, but the 22-character reduction in the lookup table more than compensates.

The final, fully golfed version is only **171 characters** long:

```python
s=lambda t:(L:=t.split('\n'))and''.join('2f1?8e?b374a6c95d??0?'[(sum((L[r][p+c+c]>'!')<<5*(r<4)+4-c for r in(3,6)for c in range(5))^293)%21]for p in range(0,len(L[0]),12))
```

Annotated:

```python
s = lambda t: (
    (L := t.split('\n'))                   # split into lines, assign to L
    and                                    # L is truthy, so evaluate right side
    ''.join(
        '2f1?8e?b374a6c95d??0?'[           # lookup table
            (
                sum(                       # sum of bit contributions
                    (L[r][p+c+c] > '!')    # 1 if block char, 0 if space
                    << 5*(r<4) + 4 - c     # shift to correct bit position
                    for r in (3, 6)        # only rows 3 and 6
                    for c in range(5)      # 5 columns per row
                ) ^ 293                    # XOR to scramble values
            ) % 21                         # modulo for table lookup
        ]
        for p in range(0, len(L[0]), 12)   # step through each character position
    )
)
```

### Final thoughts

I hope I haven't caused the Fossil people any extra work by having to scramble and come up with a new CAPTCHA system! They do seem to [admit](https://fossil-scm.org/home/file?ci=e2bdc10572c51069&name=src%2Fcaptcha.c&ln=18) that their CAPTCHA isn't exactly the most secure:

```c
/*
** This file contains code to a simple text-based CAPTCHA.  Though easily
** defeated by a sophisticated attacker, this CAPTCHA does at least make
** scripting attacks more difficult.
*/
```

Luckily, they do seem to be actively using a proof-of-work approach for deterring bots which you can see in [robot.c](https://fossil-scm.org/home/file?name=src/robot.c&ci=e2bdc10572c51069).

As for the code golf part, it was fun trying to come up with tricks and techniques to optimize for *code size* instead of performance or any other metric I usually optimize for. I'm sure that seasoned golfers can spot some obvious optimizations that I missed, but 171 characters seemed like a good stopping point for me.
