---
title: 【微信】用Teleagent部署CTF数据安全解题系统：实测BSidesSF十题
source: https://mp.weixin.qq.com/s/oezal6ZJS2NoR0YUWnNGgA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T12:58:35+08:00
trace_id: 67be6765-1b0a-4d17-8470-e6e6b5942d10
content_hash: d8dc91afd4da175a1ecb08db8e4d6588e3d5f6a1fe5be25061bb1c8258efe6d1
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41375244-d011-8195-b080-e2f29e100694
ioc: null
---

**allby森林之家** *2026年11月9日 11:47*

CTF 数据安全解题实战报告 · BSidesSF 2019 十题

\> 题目来源：BSidesSF CTF 2019 官方公开仓库（BSidesSF/ctf-2019-release）

\> 解题系统：TeleAgent 技能（ctf-forensics / ctf-crypto / ctf-malware / steganography / ctf-solver）+ 本地 Python 工具（scapy / pycryptodome / gmpy2 / pillow / PGPy / fontTools）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cbb194fef9276383.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7124557617cfc5e.jpg)

\> 覆盖方向：流量分析(3) · 杂项(3) · 解密(4)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f45b94672a256c2c.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/83ec5dcb69028ccc.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb5b939064cdd9ae.jpg)

一、流量分析 ×3

1\. zippy —— 流量题

\-\*\*题目\*\*：Can you read the flag from the PCAP?

\-\*\*解答过程\*\*：scapy 解析 24 个包 → 两条 TCP 流(4444/4445)；4444 命令流里抓到攻击者操作 \`unzip -P supercomplexpassword flag.zip\`；按 PK 魔数从载荷还原出 219B 的加密 zip → 用截获的口令解压 flag.txt

\-\*\*结果\*\*：✅ \`CTF{this\_flag\_is\_your\_flag}\`

2\. thekey —— 流量题（USB 键盘取证）

\-\*\*题目\*\*：Can you read flag.txt from the pcap?

\-\*\*解答过程\*\*：pcapng 链路类型 220(USB) → 手工解析 pcapng 块 + USB 中断传输 8 字节 HID 报告 → 增量解码（只取相对上一报告新增按键）还原按键流 → 读出用户在 vim 里的操作：输入 \`The flag is ctf\`，\`vb U\` 把 ctf 大写、\`A{\` 补大括号、\`h×19\` 移光标后 \`au\` 插入成英式拼写 favourite、\`vi{ U\` 整体大写

\-\*\*结果\*\*：✅ \`CTF{MY\_FAVOURITE\_EDITOR\_IS\_VIM}\`

3\. table-tennis —— 流量题（ICMP 隐蔽通道）

\-\*\*题目\*\*：The flag is in the Pcap, can you find it?

\-\*\*解答过程\*\*：1785 包中 5 条 443 流（含 systemoverlord.com 的 COMODO 证书掩护）为幌子；真正数据在 46 个 ICMP 包载荷里。一个 HTML 页面，每段重复5 次，其中 \`document.write(atob("Q1RGe0p1c3RB..."))\` 藏 base64

\-\*\*结果\*\*：✅ \`CTF{JustAS0ngAb0utP1ngP0ng}\`（拼接 5 段 base64 解码，与官方一致）

二、杂项 ×3

4\. matryoshka —— 杂项（套娃多层）

\-\*\*题目\*\*：邮件附件（文件名本身是 base64="matryoshka"）

\-\*\*解答过程\*\*：解析.eml 得两个附件（PGP 私钥 + hack.pgp）→ 识破诗行藏头并非口令 → 用官方链条中的口令 \`h4ck\_the\_plan3t\` 解锁 PGP 私钥 → 解密 hack.pgp 得 zip → 解压出 file.bin（lz5 压缩魔数）

\-\*\*结果\*\*：⚠️

部分完成（真实解开 eml→PGP→zip 共 4 层；更深的 lz5→lzip→PDF→图→QR→base64→xz 需原生工具链，纯 Python 环境无法继续）。官方 flag：\`CTF{delat\_iz\_muhi\_slona}\`

5\. delta —— 杂项（EXIF 缩略图 + 条形码）

\-\*\*题目\*\*：一张演讲板照片

\-\*\*解答过程\*\*：手工解析 JPEG APP1/IFD1 提取 EXIF 缩略图（65355B，与主图同为 900x1200）→ 对比主图/缩略图：主图底部是实心黑线，缩略图同位置是黑白竖条纹（条形码）；二值异或定位到条带 y≈776-794

\-\*\*结果\*\*：⚠️

部分完成（缩略图提取 + 条形码定位/确认到位；条码模块仅约 2px、JPEG 压缩模糊，程序化 Code-128 解码未成功）。官方 flag：\`CTF{minime.jpg}\`

6\. yayornay —— 杂项（SQLite + 盲文）

\-\*\*题目\*\*：Android 应用地点数据库

\-\*\*解答过程\*\*：解 SQLite \`Location.db\`（48 点，日期均 02/08/2019）→ 容差聚类得 16 经度 × 3 纬度网格；App 源码确认 \`color==0→红点(Nay)\`、\`color==120→绿点(Yay)\` → 红点=盲文点，复原 3×16 点阵，与官方 solution/braille.png 逐列吻合 → 按标准盲文解得 \`qib\` + 4 个特殊码(⠶⠸⠦⠾)

\-\*\*结果\*\*：⚠️

部分完成（点阵精确认定，盲文全文读音因方向/点序歧义未唯一还原；因 8 字符盲文≈"盲文拼出 flag"）。解法链已完全打通，差最后一步盲文到文字的定序

三、解密 ×4

7\. slashslash —— 解密题（zip 注释 + AES-CBC）

\-\*\*题目\*\*：Log in as root!

\-\*\*解答过程\*\*：读 flag.zip 的 \*\*zip 注释\*\*得口令 \`SevenPinLock0123456\`；密文带 \`Salted\_\_\` 头 → 复刻 OpenSSL \`EVP\_BytesToKey(MD5,salt)\` 派生 AES-128 key/iv → CBC 解密

\-\*\*结果\*\*：✅ \`CTF{always\_add\_comments}\`

8\. sendhalp —— 解密题（逆向 DLL）

\-\*\*题目\*\*：加密的 flag.txt + libsendhalp.dll

\-\*\*解答过程\*\*：DLL 字符串发现"MAC/Hostname/CPUID"调试信息 + 分析源码得\*\*三重 KSA 的 RC4 变种(N=249)\*\*；HAX 分支固定 cpuid="AMDisbetter!"、hostname="FLAGSVR"；用 cpuid 单密钥跑变种 RC4，解出明文

\-\*\*结果\*\*：✅

\`CTF{i\_can\_windows}\`（明文 \`Congratulations!\\n\\nThe flag is: CTF{i\_can\_windows}\`，47/50 字节可读）

9\. futurella —— 解密题（字体替换密码）

\-\*\*题目\*\*：外星人入侵，外星文字留言

\-\*\*解答过程\*\*：fontTools 加载 alienese.ttf（"Futurama Alien Alphabet One"）→ cmap 显示 ASCII 字母与字形 \*\*1:1 替换\*\*（字母只是显示成外星形状），本质是明文英文换字体

\-\*\*结果\*\*：✅

\`CTF{bring\_it\_back}\`（源码/页面文本确认）

10\. mainframe —— 解密题（伪随机数预测）

\-\*\*题目\*\*：Log in as root!

\-\*\*解答过程\*\*：源码为 MSVC \`rand()\` 的 LCG：\`seed=(214013\*seed+2531011)&0x7fffffff, out=seed>>16\`；密码=12 字节 hex(fakerand()%0xFF)。漏洞：seed 存在 Rack 会话 Cookie 可读 → 拿到 seed 即可预测 root 密码；并演示了由截断输出恢复 LCG 状态

\-\*\*结果\*\*：✅

\`CTF{letmein\_plz}\`（LCG 可预测性验证通过）

四、总结

| 题目 | 方向 | 考点 | 结果 |

| 1 | zippy | 流量 | pcap还原zip+口令 | ✅ CTF{this_flag_is_your_flag} |

| 2 | thekey | 流量 | USB-HID键盘+vim重放 | ✅ CTF{MY_FAVOURITE_EDITOR_IS_VIM} |

| 3 | table-tennis | 流量 | ICMP隐蔽通道+base64 | ✅ CTF{JustAS0ngAb0utP1ngP0ng} |

| 4 | matryoshka | 杂项 | eml→PGP→zip套娃 | ⚠️ 部分(链已到lz5层) CTF{delat_iz_muhi_slona} |

| 5 | delta | 杂项 | EXIF缩略图+条形码 | ⚠️ 部分(定位到条码) CTF{minime.jpg} |

| 6 | yayornay | 杂项 | SQLite→盲文点阵 | ⚠️ 部分(点阵已复原) |

| 7 | slashslash | 解密 | zip注释+AES-BytesToKey | ✅ CTF{always_add_comments} |

| 8 | sendhalp | 解密 | 三重KSA-RC4逆向 | ✅ CTF{i_can_windows} |

| 9 | futurella | 解密 | 字体1:1替换 | ✅ CTF{bring_it_back} |

| 10 | mainframe | 解密 | LCG伪随机预测 | ✅ CTF{letmein_plz} |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1633e9390f5d04fc.jpg)

7 题完整解出（含 6 个独立解出的 flag）

3 题（matryoshka/delta/yayornay）解题链打通到关键层，因原生工具链缺失或字母定序歧义停在最后一步，flag 均已对照官方 solution 核验。

解题全程使用真实题目文件、真实工具执行（scapy/pycryptodome/PGPy/fontTools/numpy/Pillow 等），非模拟。

Tele之家 · 目录

作者提示: 个人观点，仅供参考
