---
title: 【微信】script用法速查-终端录像与回放，再也不怕写WP的时候忘了命令辣
source: https://mp.weixin.qq.com/s/DJSSE-RkbrLeZP2NOkbCgw
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T10:12:29+08:00
trace_id: 6509e393-a833-48eb-a455-a4d7b2c4a125
content_hash: 70bbd4cbc7a5530efd3b635a3da7d597c7dfe41b22634787ff175edcc30404f4
status: synced
tags:
  - 微信
  - Linux安全
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Linux 自带 `script` 命令可完整录制 shell 会话（含颜色、控制字符、时序），配合 `scriptreplay` 回放，是渗透测试复盘与写 WP 的利器。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40f75244-d011-815a-98b8-d6c6868caff5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Linux 自带 `script` 命令可完整录制 shell 会话（含颜色、控制字符、时序），配合 `scriptreplay` 回放，是渗透测试复盘与写 WP 的利器。
> 
> - **核心选项：** `-q` 静默、`-a` 追加、`-c` 录单条命令后退出、`-f` 逐行刷盘可配 `tail -f` 实时监控、`-t` 记录每字符延迟供回放、`-e` 返回被录命令的退出码。
> - **典型场景：** 录完整靶机打通过程一遍过写 WP；`script -q -c "nc -lvnp 80" log` 一体化录制反弹 shell 全程；`-f -c "hashcat ..."` 边录边看长时间任务进度。
> - **查看与回放：** 直接 `cat` 会见 ANSI 乱码，可用 `col -b`、`ansi2txt` 或 `less -R` 清理；`scriptreplay -t timing.log -s session.log` 按原始速度回放，末尾跟数字可 2 倍速或 0.5 倍慢放。
> - **语法坑：** util-linux 新版 `-t` 语法有变，录制须写 `-t=timing.log`（等号），回放则用空格 `-t timing.log`。
> - **安全与组合：** 录像为纯文本，含密码/token/反弹 shell 信息，写完 WP 应 grep 检查、sed 脱敏、`shred -u` 销毁；与 rlwrap 正交，`script -q -c "rlwrap nc -lvnp 80"` 可同时获得历史补全与全程录像。

**泷羽Sec-静安** *2026年11月4日 23:34*

> Linux 自带的"终端录像机"——把整个 shell 会话（输入 + 输出 + 颜色 + 控制字符）原封不动录下来。  
> **PG/OSCP 实战**：复盘、写 WP、留 evidence 的神器。录完一个 session，回放 = 完整 WP 草稿。

## 1\. 基础用法

```bash
# 启动录制（默认录到 typescript 文件）
script
# 提示 "Script started on ..."，进入新 shell
# ... 你的所有操作都会被录 ...
exit
# 提示 "Script done on ..."

# 指定输出文件
script session.log

# 静默模式（不显示 "Script started/done" 那两行）
script -q session.log

# 追加（默认是覆盖）
script -a session.log
```

**录出来的文件是什么**：

-   • 完整保真：包含 ANSI 颜色、转义序列、Ctrl-C 字符
    
-   • 包含 timing 信息（如果你加了 `-t` ）
    
-   • 文件所有权归当前用户， **默认权限 644** （其他人能读，注意敏感操作）
    

![Pasted image 20261104224644.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/017f0168907708ff.png)

Pasted image 20261104224644.png

* * *

## 2\. 实战关键选项

```bash
# -c, --command <cmd>：录一个具体命令就退出（不进入交互 shell）
script -c "nmap -sV target" nmap.log

# -f, --flush：每写一行就 flush 到磁盘（实时看，像 tail -f）
#   适合长时间任务边录边看
script -f session.log
# 然后在另一个终端：tail -f session.log

# -q, --quiet：静默，不显示 "Script started" / "Script done"
script -q session.log

# -a, --append：追加到已有文件
script -a session.log

# -t[FILE], --timing[=FILE]：把 timing 数据也录下来（每个字符的延迟）
#   关键 - 重放时能模拟"原始速度"，可以慢动作回放
script -t=timing.log session.log

# -e, --return：返回被录制 shell 的 exit code
script -e -c "./exploit.sh" exploit.log
echo $?   # 拿到 exploit.sh 的退出码，不是 script 的

# -V, --version
# -h, --help
```

![Pasted image 20261104224816.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/adf753bc559ec616.png)

Pasted image 20261104224816.png

![script.gif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d29319280e9f6e8a.gif)

script.gif

* * *

## 3\. 渗透测试高频用法

### 3.1 完整录一个 PG 靶机打通过程（写 WP 一遍过）

```bash
# 攻击机上开始
script -q -t=/tmp/ochima.timing /tmp/ochima.full.log

# 完整的 nmap / 漏洞利用 / 提权全程
# ... 1 小时后 ...
exit

# 录完得到两个文件：
#   /tmp/ochima.full.log   - 终端完整输出
#   /tmp/ochima.timing     - 每个字符的延迟
```

### 3.2 只录一个工具的输出

```
# 录整个目录扫描过程
script -q -c "gobuster dir -u http://target -w /usr/share/wordlists/..." gobuster.log

# 录漏洞利用过程（带完整交互）
script -q -c "python3 exploit.py 10.10.10.10 80 http://target:8338" exploit.log
```

### 3.3 录反弹 shell 的所有操作

```
# 攻击机监听 + 录制一体化
script -q -c "nc -lvnp 80" reverse_shell.log
# 拿到 shell 后的所有命令、输出、读 flag、提权 → 全在 reverse_shell.log 里
```

![Pasted image 20261104225646.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2dcb9f4ebb490b26.png)

Pasted image 20261104225646.png

### 3.4 长时间任务进度监控

```powershell
# 跑 hashcat / john / ffuf 这种可能跑几小时的任务
# 实时看进度，同时录下来
script -f -c "hashcat -m 0 hashes.txt rockyou.txt" hashcat.log &
# 另一个终端：
tail -f hashcat.log
```

* * *

## 4\. 录完怎么处理

### 4.1 直接 cat：会看到 ANSI 控制字符

```
$ cat session.log
Script started on ...[K
[1;31mroot@kali[0m:[1;34m~[0m$ id
[?2004huid=0(root) ...
```

**看着乱**——那是因为终端用 ANSI 转义序列做了颜色和光标移动，录的时候一并录下来。

### 4.2 干净查看的几种方法

```bash
# 1. col -b 过滤掉 backspace 类控制字符（保留颜色）
cat session.log | col -b

# 2. ansi2txt 工具（更彻底，去掉所有 ANSI 序列）
# 装：pip install ansi2txt 或 apt install colorized
ansi2txt < session.log > clean.log

# 3. 直接用 less -R 看（less 自动解释 ANSI 颜色）
less -R session.log

# 4. 用脚本回放（保留原始速度，-t 提供 timing）
scriptreplay -t timing.log -s session.log
# 脚本回放时像慢动作重放，对写 WP 时回顾操作流程很有用
# script 的 -t 在 util-linux 新版里改了语法，录制的时候不能再跟一个裸参数
# 录制用-t=timing.log
# 回访用 -t timing.log  中间是空格
```

![scriptreplay.gif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f12e63517806660c.gif)

scriptreplay.gif

### 4.3 提取特定行

```python
# 找执行过的命令（通常带行首的提示符特征）
grep -E '^\$' session.log

# 找 flag
grep -E 'flag{|FLAG{|HTB{|THM{' session.log

# 找关键错误
grep -i 'error\|fail\|denied' session.log
```

### 4.4 删掉"Script started/done" 那两行

录出来的文件头尾有这两行垃圾，开 WP 的时候要删：

```python
# 删头
sed -i '1,2d' session.log    # 删前 2 行
# 删尾
sed -i '$d' session.log        # 删最后 1 行（"Script done"）

# 或者直接 grep 掉
grep -v "^Script \(started\|done\)" session.log > clean.log
```

* * *

## 5\. 实战小技巧

### 5.1 录制 + 实时回看（边录边监控）

```
# 终端 A：启动录制
script -f -q session.log

# 终端 B：实时看
tail -f session.log
# 内容会随终端 A 的操作同步出现
```

### 5.2 录制时存到专门目录

```bash
# PG 考试环境建议
mkdir -p ~/pg-sessions/$(date +%Y%m%d)
cd ~/pg-sessions/$(date +%Y%m%d)
script -q -t timing.log -c "bash" full.log
```

### 5.3 录制敏感信息时要小心

`script` 录的是 **纯文本**，会包含：

-   • 密码 / API key / token
    
-   • 反弹 shell 的命令（攻击者 IP / 端口）
    
-   • `cat /etc/shadow` 之类
    

**写完 WP 后建议**：

```bash
# 1. 检查有没有敏感字符串
grep -i 'password\|api\|key\|token' session.log
# 2. 替换或脱敏
sed -i 's/password=[^&]*/password=REDACTED/g' session.log
# 3. 删原文件
shred -u session.log  # 安全删除
```

### 5.4 配合 scriptreplay 做"教学视频"

```lua
# 录的时候带 timing
script -q -t timing.log session.log

# 重放（按原始速度）
scriptreplay -t timing.log -s session.log

# 加速 / 慢放
scriptreplay -t timing.log -s session.log 2.0    # 2 倍速
scriptreplay -t timing.log -s session.log 0.5    # 半速（讲解用）
```

### 5.5 录 SSH 登录后的所有操作

```bash
# 在跳板机/堡垒机上 record
script -q /var/log/audit/ssh_session_$(whoami)_$(date +%s).log

# 之后审计能回放整个会话
```

* * *

## 6\. 一句话 vs rlwrap 对比

| 工具  | 解决啥问题 |
| :--- | :--- |
| `rlwrap` | 给程序加 readline（历史/补全） |
| `script` | 录下整个会话给以后看 |

**两者正交，经常一起用**：

```
# 录一个带历史补全的交互会话（PG 考试时神器）
script -q -c "rlwrap nc -lvnp 80" reverse_shell.log
```

> 这条组合拳 = 拿到 shell 后能 ↑↓ 翻历史命令 + 整个 session 录下来回放 = **不用记笔记也能写 WP**。
