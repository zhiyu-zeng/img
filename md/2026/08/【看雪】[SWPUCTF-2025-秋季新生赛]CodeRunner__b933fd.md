---
title: 【看雪】[SWPUCTF 2025 秋季新生赛]CodeRunner
source: https://bbs.kanxue.com/thread-292348.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-07T14:53:45+08:00
trace_id: 892ca00f-c7af-49ed-917c-d165cfd49d02
content_hash: 5ef1b626660318e083662708684f00ad32fe237fd91176b705527ad9a6fe9d8c
status: synced
tags:
  - 看雪
  - CTF
  - 脱壳与加固
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过脱壳与 IDA 分析，发现二维码矩阵被藏在 global-metadata.dat 中，用特征码扫描 29x29 数据块并生成二维码得到 flag。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 0
  failed_urls:
    - https://hynuxtsec.feishu.cn/space/api/box/stream/download/asynccode/?code=MDc0NWZmOGFjOWZlNGM0NWE1MWRmNGY1YjM5N2U0YTlfc004aUtKMmFHRnhCQXVBRElUbkJoa094b3o2RHZMN0tfVG9rZW46R0d6S2JFdFZIbzF0S0N4dkhBT2NUTng1blRlXzE3ODYwNzYxNzk6MTc4NjA3OTc3OV9WNA&add_watermark=true&scene_type=CCM
    - https://hynuxtsec.feishu.cn/space/api/box/stream/download/asynccode/?code=NjMxNDYxMjY3NzYxZGIyNjQ2ZWQ1MTYyMTIwOWZmZTRfR0pOQU8xdHBUWnlQcjQwbXpweFJrWWJFZEhSY0JqTlJfVG9rZW46RVdwbWJJT1pwbzYwSTV4ZHRXQmM2Zkd0bjNjXzE3ODYwNzYxNzk6MTc4NjA3OTc3OV9WNA&add_watermark=true&scene_type=CCM
    - https://hynuxtsec.feishu.cn/space/api/box/stream/download/asynccode/?code=OWI5N2Y5ODk4M2QzYTczMTBjZDdmOTYwYjdjMzQzNzRfT29VbENBY0QyQzQ3b2Nzd3lheWdBQWtVWnZtbjlYV3hfVG9rZW46S25wMWJ4Y0pab1l6VXR4dHJrRWM1Q3hrbkpnXzE3ODYwNzYxNzk6MTc4NjA3OTc3OV9WNA&add_watermark=true&scene_type=CCM
notion_page_id: 3b575244-d011-813b-9f9b-dd000a371fdd
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过脱壳与 IDA 分析，发现二维码矩阵被藏在 global-metadata.dat 中，用特征码扫描 29x29 数据块并生成二维码得到 flag。
> 
> - **拆包定位：** AssetStudio 未发现成品二维码，但找到黑白块资源和 QRCodeBuilder 函数，推断程序动态生成二维码。
> - **壳与脱壳：** Il2CppDumper 因缺文件报错，发现程序加壳；脱壳后才成功提取结构信息。
> - **关键逻辑：** ILSpy 中 Assembly-CSharp.dll 为空壳，IDA 反编译 ConstructQRCode 只见双重 for 循环，按 qrMatrix 放置黑白块。
> - **数据来源：** 构造函数创建 29x29 矩阵，从 qword_182F726A8 拷贝数据；IDA .data 段中的 80000003h 是 IL2CPP Metadata Token，指向 global-metadata.dat 里的二进制数据。
> - **特征扫描：** 用 Python 在 global-metadata.dat 中匹配连续 7 个 int(1)+1 个 int(0) 的二维码定位特征，成功截取矩阵并生成 flag_qrcode.png。

做这道题的时候我一直在网上找wp，根本没有  
个人感觉超级难，一开始打开是这样的

![img](⚠️ https://hynuxtsec.feishu.cn/space/api/box/stream/download/asynccode/?code=MDc0NWZmOGFjOWZlNGM0NWE1MWRmNGY1YjM5N2U0YTlfc004aUtKMmFHRnhCQXVBRElUbkJoa094b3o2RHZMN0tfVG9rZW46R0d6S2JFdFZIbzF0S0N4dkhBT2NUTng1blRlXzE3ODYwNzYxNzk6MTc4NjA3OTc3OV9WNA&add_watermark=true&scene_type=CCM)

## 拆包发现QRCodeBuilder

运行之后发现脚底下是一个二维码，但是看不到全貌，这道题的提示说扫码就可以得到flag，是不是非常简单，实则不然，所以我想应该只有两种可能，一种是生成二维码，一种是二维码已经在了，所以我打算拆包，使用AssetStudio，但是没有找到二维码，但是找到了和黑块和白块，以及QRCodeBuilder函数，所以基本断定应该是制作二维码

后面我想使用 Il2CppDumper 来找找结构信息，看看能不能对解题产生什么帮助，但是这一步报错了，是没有其中一个文件，但是是有的，所以才发现是壳，蜕壳之后成功取得结构信息

## IDA反编译ConstructQRCode

把结构信息中的Assembly-CSharp.dll拉入ILSpy，找到QRCodeBuilder类，发现伪造的 DLL 是空壳，但拿到了函数的真实内存地址，将脱壳后的 `GameAssembly.dll` 拖入 IDA Pro。利用快捷键 `G` 跳至 `ConstructQRCode` 方法。按 `F5` 反编译后，发现这里只有“按图纸铺地砖”的双重 `for` 循环逻辑，通过读取 `*(a1 + 72)` （即 `qrMatrix` ）来判断放黑块还是白块

跳入 `QRCodeBuilder` 的构造函数（`.ctor` ），终于看到了决定性代码

```
v8[0] = 29;
v8[1] = 29; // 创建 29x29 的矩阵 (Version 3 二维码)
sub_181652960(v9, qword_182F726A8, 0); // 从内存深处拷贝数据
```

## Metadata Token指向

在 IDA 的 `.data` 段追踪 `182F726A8` ，发现那里的数据是 `80000003h` 。这并不是真实数据，而是 IL2CPP 引擎的 Metadata Token。它指向了存放在 `global-metadata.dat` 中的一串二进制死数据

既然我们知道数据在 `global-metadata.dat` 里，且二维码大小是 ，那干脆不按常理出牌，直接祭出 CTF 的终极奥义： **特征码\*\*\*\*扫描**。 所有二维码的左上角都有一个 7x7 的定位方块（黑黑黑黑黑黑黑白）。在 int 数组中，这就意味着必然存在连续的 7 个 1 和 1 个 0。 编写 Python 脚本，直接在 `global-metadata.dat` 里进行地毯式爆破：

```python
import os
from PIL import Image

def find_and_draw():
    filepath = "global-metadata.dat"
    # 二维码左上角特征：连续 7 个黑块(1) 和 1 个白块(0)
    # 扫描模式 A：int 数组 (4字节 Little Endian)
    pattern_int = (b'\x01\x00\x00\x00' * 7) + b'\x00\x00\x00\x00'
    
    print(f"[*] 正在扫描 {filepath} ...")
    with open(filepath, "rb") as f:
        data = f.read()
        
    offset = 0
    while True:
        offset = data.find(pattern_int, offset)
        if offset == -1:
            break
            
        # 截取 29x29 = 3364 字节
        chunk = data[offset : offset + 3364]
        # 校验：确保这 3364 字节全是 0 或 1
        if len(chunk) == 3364 and all(chunk[i:i+4] in (b'\x00\x00\x00\x00', b'\x01\x00\x00\x00') for i in range(0, 3364, 4)):
            print(f"[+] 在偏移 {hex(offset)} 处成功捕获矩阵！")
            
            # 画图还原
            width, height = 29, 29
            img = Image.new('1', (width, height), 1)
            pixels = img.load()
            
            for y in range(height):
                for x in range(width):
                    val = chunk[(y * width + x) * 4] 
                    if val == 1:
                        pixels[x, y] = 0  # 1 代表黑块
                        
            img = img.resize((290, 290), Image.NEAREST)
            img.save("flag_qrcode.png")
            print("[+] 二维码已生成！")
            return
        offset += 1

if __name__ == "__main__":
    find_and_draw()
```
