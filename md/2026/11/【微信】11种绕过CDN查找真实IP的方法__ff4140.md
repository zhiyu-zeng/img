---
title: 【微信】11种绕过CDN查找真实IP的方法
source: https://mp.weixin.qq.com/s/wasRAhCAEN5z2Tcb5N8dLg
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T11:15:28+08:00
trace_id: 07e1ae7e-4f91-4fff-8347-c8ac3ebe2fe7
content_hash: 0e8439b53cbf997ee254098b92ef5706c6c8ff05e9de896fed5b8953f6ef5750
status: synced
tags:
  - 微信
  - 渗透测试
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: CDN 只改变“域名解析给谁”，改变不了服务器自身的暴露痕迹——证书、历史解析、旁站子域、邮件头、页面指纹和负载均衡 Cookie 都可反推源站真实 IP。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 40f75244-d011-8173-8883-d60f46f97252
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> CDN 只改变“域名解析给谁”，改变不了服务器自身的暴露痕迹——证书、历史解析、旁站子域、邮件头、页面指纹和负载均衡 Cookie 都可反推源站真实 IP。
> 
> - **先花两分钟确认是否真在 CDN 后：** 查 CNAME 链（如阿里云 `*.kunlun*.com`、Cloudflare `*.cdn.cloudflare.net`）是最硬证据；多地解析须按 IP 归属判断而非 IP 数量，注意 Anycast 会造成“各地不同”的误判。
> - **11 条旁路方法按成本从低到高：** 历史 DNS（SecurityTrails、微步）、MX/SPF/TXT 记录、子域名旁站、证书透明度反查（Censys 可按证书指纹列出 IPv4 主机）、直连 IP 读证书（openssl 需带 SNI）、测绘平台指纹搜索、GA 追踪 ID 等页面标识、邮件 Received 头（从下往上读）、境外节点解析、C 段扫描、F5 Cookie 解码。
> - **favicon hash 是其中最好用的一招：** 对 favicon.ico 内容用 mmh3 算哈希（值前加负号），丢进 FOFA `icon_hash` 或 Shodan `http.favicon.hash`，常直接命中未上 CDN 的机器，且与域名解绑不易撞车。
> - **F5 Cookie 解码需纠正流传说法：** `BIGipServer` Cookie 首段十进制按十六进制从后往前解码，得到的通常是 pool member 的内网地址而非公网 IP，实战价值在架构判断和偶发的公网段候选。
> - **验证靠四信号，防守靠五动作：** 带 Host 头访问返回目标页面（最强证据）、证书 SAN 含目标域名、开放 22/3306/3389 等管理端口、反查记录对上；防守侧回源白名单＋源站证书隔离即可废掉大半方法。

**菜鸟学安全** *2026年11月4日 23:04*

## CDN 挡得住流量，挡不住源站

手上只有一个域名。dig 一下，回来四五个 IP，落在浙江、广东、北京，一问归属全是某云的 CDN 节点；端口扫过去只开 80 和 443，Web 指纹一个都对不上。真正那台服务器在哪，一无所知。

这是打点时最常见的第一道墙。但要说清楚一件事：CDN 解决的是"外部访问域名时该去哪"，它不负责改变服务器本身长什么样。只要源站还挂在公网上，证书、历史解析、旁站子域、邮件头、负载均衡的 Cookie，总有一条缝漏出来。

下面分三层写：先在不在 CDN 后面（这步最容易被跳过，跳过就意味着后面全白干），再从旁路信息反推源站，最后是怎么确认找到的是真的。

## 第一步：先确认它到底在不在 CDN 后面

很多人一上来就查历史 DNS，其实有相当比例的目标根本没上 CDN，多解析出来几个 IP 只是因为做了双线或 DNS 轮询。先花两分钟确认，能省掉后面一个小时的瞎猜。

### 看 CNAME 链

这是最硬的证据，比"IP 数量多"可靠得多。

```
dig +short www.example.com CNAME
dig www.example.com | grep -E "CNAME|A\s"
```

解析结果里有 CNAME 指向 CDN 厂商的域名，基本可以定性了。常见的形态：

| 厂商  | CNAME 特征 |
| --- | --- |
| 阿里云 | `*.kunlun*.com`<br><br>、 `*.alicdn.com` |
| 腾讯云 | `*.dnsv1.com`<br><br>、 `*.cdntip.com` |
| Cloudflare | `*.cdn.cloudflare.net` |
| CloudFront | `*.cloudfront.net` |
| Akamai | `*.akamaiedge.net`<br><br>、 `*.edgekey.net` |

没有 CNAME、直接给一串 A 记录，也不一定没上 CDN——有些厂商支持 A 记录接入。所以还要看第二步。

### 看 IP 归属和多地解析

多地解析的在线工具有不少， `itdog.cn` 、 `ping.chinaz.com` 、 `boce.com` 都能一次给出全国几十个节点的结果。

判断逻辑不是"IP 不唯一就是 CDN"，而是：

• **不同省份解析到不同 IP，且这些 IP 的归属都是同一家 CDN 厂商的地址段** → 上 CDN 了

• **所有地方解析到同一组 IP，只是组内轮询** → 大概率没上 CDN，是 DNS 轮询

• **不同地区解析到不同 IP，但归属是不同运营商的自有地址段** → 双线机房，不是 CDN

这一步的坑在于 Anycast。有些服务用 Anycast 让全球解析到同一个 IP 段，测量时看着"各地不同"，实际是路由层面的就近接入，跟 CDN 不是一回事。所以判断要以归属为准，不能只看 IP 数量。

### 一个快速验证

拿到任意一个解析 IP，直接访问它，看返回什么：

```
curl -k -H "Host: www.example.com" https://<解析IP>/ -I
```

返回 CDN 的错误页、或者 `Server` 头是 CDN 厂商的标识、或者干脆拒绝——就是节点。返回了目标站点正常的响应头，那这个 IP 就可能直接是源站，后面的活都可以省了。

## 第二步：11 条从旁路反推源站的路子

按成本从低到高排。前面几条几秒钟能出结果，后面的要花时间和算力，别一上来就动全网扫描。

### 1\. 历史解析记录

换 CDN 之前的裸解析、或者某个时间段漏配的记录，经常留在第三方平台的历史库里。

常用入口：

• SecurityTrails（ `securitytrails.com` ，免费额度有限）

• 微步在线（ `x.threatbook.cn` ，域名情报里有 DNS 历史）

• DNSDumpster（ `dnsdumpster.com` ）

• ViewDNS（ `viewdns.info` ，有 DNS History）

![SecurityTrails 的历史 DNS 记录页面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c8e7491df36966d.png)

这个界面按记录类型分了 A / AAAA / MX / NS / SOA / TXT 几个页签，A 记录里按时间段排出历史 IP， `First Seen` 和 `Last Seen` 一对，就能看出某个时间点上解析是不是突然换了一批——换 CDN 的时间点往往就藏在这个交界处。

![DNSDB 查询 A 记录的界面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b6fa57b7c0b81d3.png)

DNSDB 这个查询界面早几年用得很多，直接 域名 type:A 就能把子域和对应 IP 一起列出来。不过这个站已经停止服务了，图留着当个参照，实际检索用上面几个平台代替。

**关键判断：历史记录里出现一个 IP 不代表它就是源站。** 常见三种误判——那条记录是别人共享这个 IP 的，跟目标没关系；那台机器早就下线了；那只是某个子域的临时解析。

验证方式有三个，按顺序做：拿 IP 反查域名（看是否还挂着目标的其他子域）、看 IP 的开放端口是否像 Web 服务器、直接带 Host 头访问看返回。三条都对得上，才值得往下走。

### 2\. 非 Web 记录里的 IP

邮件相关的 DNS 记录经常被遗忘，是性价比很高的一条路。

```
dig +short MX example.com
dig +short TXT example.com
```

• **MX 记录**：如果指向自建邮件服务器，那台机器往往和 Web 在同一机房甚至同一台。查它的 A 记录。

• **SPF 记录**： `v=spf1 ip4:1.2.3.4 ip4:1.2.3.0/24 -all` ，这行直接就把发信 IP 段写出来了，运气好的话和 Web 段重合。

• **TXT 验证记录**：域名所有权验证、第三方服务接入验证，偶尔能推出用了哪些外部服务，进而定位到资产。

• **DKIM**：选择器名（ `selector._domainkey` ）能看出用的哪家邮件服务，如果用的是自建，同样可以反查。

失效条件：用第三方邮件服务（腾讯企业邮、阿里云邮、SendGrid 之类），这条路就拿不到有用的东西。

### 3\. 子域名旁站

CDN 是按流量和带宽计费的，主站上了不代表所有子域都上。老系统、测试环境、运维面板、内网穿透出来的服务、历史遗留的二级站，很多都还裸着。

而且这些裸着的子域，往往和主站在同一台服务器或同一个 C 段。

找子域的三条路，组合用效果最好：

```powershell
# 证书透明度，最全且免费
curl -s "https://crt.sh/?q=%25.example.com&output=json" | jq -r '.[].name_value' | sort -u

# 被动聚合（subfinder 会调几十个数据源）
subfinder -d example.com -silent

# 字典爆破兜底
subfinder -d example.com -all -silent
```

再加上搜索引擎语法， `site:example.com -www` 能把索引里的子域翻出来一批。

![微步在线查 baidu.com 的子域名](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a6a60898dd0a2f5.png)

微步的子域查询是现成的入口，免费额度有限，适合先看一眼、心里有个数再决定要不要上工具。

![用 site: 语法翻子域名](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aad6bd7ad494c3b8.png)

`site:baidu.com -www` 这种语法捞的是搜索引擎已经索引到的页面，好处是不用付出任何请求成本，坏处是只能捞到被收录的那些，测试环境、运维后台这类页面一个都出不来。

![子域名挖掘机批量爆破的结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/715ead950b79a387.png)

字典爆破出来的结果会带上端口、服务器类型和网站状态，这一列信息比域名本身更有用——同一批解析里那些没挂 CDN、Web 服务器版本还比较老的，往往就是旁站的入口。

拿到子域清单后，逐个解析，把 **没有 CNAME 到 CDN 的** 挑出来——这些的 A 记录就是候选源站 IP，或者给出源站所在的 C 段。

### 4\. 证书透明度日志反查

`crt.sh` 是现在最顺手的入口，因为免费、不需要账号、数据全。

```
# 搜某个域名签过的所有证书
curl -s "https://crt.sh/?q=example.com&output=json" | jq -r '.[] | "\(.not_before) \(.name_value)"' | sort -u
```

从结果里能拿两样东西：一是完整的子域清单（证书的 SAN 里列全了），二是证书的签发组织（ `O=` 字段），用来确认这批资产到底属不属于目标单位。

Censys 也能做同样的事，而且可以按证书指纹找 IPv4 主机，但它现在需要注册且有额度限制，日常用 crt.sh 更快。搜索语法大致是 `parsed.names: example.com and tags.raw: trusted` ，找到证书后从 `Explore` 里看 `IPv4 Hosts` ，使用同一张证书的主机就列出来了。

![Censys 按域名搜证书](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/84ad233485e0f9a9.png)

搜出来的是这个域名签过的所有证书，按签发时间排。左栏的 `Issuer` 统计挺好用——如果目标历史上换过 CA，不同时期的证书会分到不同的签发人下面，能据此判断哪张是当前的、哪张是老的。

![证书详情页，右下角是 Explore 菜单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ec180f75b42afa8a.png)

点开任意一张证书，基本信息里是 `Subject DN` 、 `Issuer DN` 、有效期和指纹。真正的入口在右下角的 `Explore` ，往下展开就是 `What's using this certificate?`。

![按证书指纹反查 IPv4 主机](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/754d103db3e7fbd7.png)

这张结果很说明问题：同一张 `*.rocket-internet.com` 的证书，被十几台主机共同使用，访问这些 IP 的 443 端口会直接回 `403 Forbidden` 并把域名带出来。源站和 CDN 两边用同一张证书，是这类反查能成立的根本原因。

### 5\. 直连 IP 读证书

原理不复杂：CDN 回源这一段也是加密的，源站自己得持有域名证书。所以直接对候选 IP 的 443 端口发起 TLS 握手，源站会把证书吐出来。

```
openssl s_client -connect 1.2.3.4:443 -servername www.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

`-servername` 必须带，这是 SNI。不带的话，源站可能返回一张默认证书，看不出任何域名信息。

证书里出现目标域名，这个 IP 基本就锁定是源站了。

两个失效条件要注意：源站防火墙只放行 CDN 回源 IP 段的话，你从公网连过去直接超时，这条路走不通；源站用内部 CA 签证书的话，证书里没有公网域名，也看不出关联。所以这招通常不是第一步用，而是 **在已经拿到候选 IP 段之后做验证**。

### 6\. 指纹搜索

网络空间测绘平台的思路是：源站的页面特征和 CDN 边缘节点上的几乎一样，用特征反查收录的 IP。

![FOFA Pro 的检索入口](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/771fe037a3edec4c.png)

几个可用的查询维度，从稳到松：

```python
# Shodan
http.title:"目标站点标题"
http.html:"页面里独有的那串字符"
http.favicon.hash:-123456789

# FOFA
title="目标站点标题"
body="页面独有字符串"
icon_hash="-123456789"
```

`Server` 头也能查，但 CDN 通常会改写或隐藏，参考价值不高，除非目标用的是自建 CDN 或者配置粗糙。

![用 server 头筛 Cloudflare 主机的查询结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/72c9a825e77e658a.png)

这张图正好说明为什么这招不好使： `80.http.get.headers.server: cloudflare` 一下子命中十几万台主机，全是 Cloudflare 自己的节点和别人的代理，结果集大到没有筛选意义。头字段只能作为组合条件里的一条，单用它等于没查。

**favicon hash 是这里最好用的一招**，原文没提。同一个 favicon 文件算出来的哈希是固定的，跟域名无关，拿它去测绘平台搜，经常能直接命中没上 CDN 的那台机器。算法是 mmh3：

```python
import mmh3, requests, codecs
r = requests.get("https://www.example.com/favicon.ico", verify=False, timeout=10)
print(mmh3.hash(codecs.lookup("base64").encode(r.content)[0]))
```

算出来的值前面加个负号就是结果，直接丢进 FOFA 的 `icon_hash` 或 Shodan 的 `http.favicon.hash` 。

失效条件：目标换了默认 favicon、或者源站的 favicon 和 CDN 上返回的不一致（有些 CDN 会缓存旧版本）。

### 7\. 页面里的第三方标识和泄露文件

页面源码里有一批跟域名无关、跟"这套代码"绑定的标识：

• Google Analytics / GTM 的 `UA-XXXX` 、 `G-XXXX` 追踪 ID

• 百度统计的 `hm.js?xxxxx`

• 客服、在线咨询脚本的站点 ID

• reCAPTCHA 的 site key

拿这些去 Shodan 或 FOFA 搜 `http.html:` / `body=` ，能捞出所有部署了同一套代码的主机，其中就可能有没上 CDN 的。

![用 GA 追踪 ID 反查主机](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/866e4255419fcd58.png)

`http.html:"UA-32023260-1"` 这个查询只回了 1 条记录，那台主机就是这套代码的部署位置之一。追踪 ID 的特点是和域名完全解绑，所以它比标题、正文这些容易撞车的特征精准得多——前提是目标真的用了 GA，而且没跟别的站共用同一个 ID。

另外几类容易漏的位置：

• `phpinfo` 之类的探针页，里面有 `SERVER_ADDR` 、 `DOCUMENT_ROOT` 的绝对路径

• `.git/config` 、`.svn` 、备份压缩包

• 报错页面里的堆栈和内网地址

• Swagger / actuator 之类的接口文档

**注意区分：内网 IP 说明的是架构，不等于公网可达。** 从 `10.x` 、 `192.168.x` 反推公网源站是没有意义的，只能用来判断是否同机。

### 8\. 邮件回信头

触发一封系统邮件：注册验证、找回密码、RSS 订阅、留言通知。拿到邮件原文，看 `Received` 头。

`Received` 是从发送方到接收方逐跳追加的， **从下往上读**，第一条不是邮件服务商的记录，就是发信服务器。如果 Web 和邮件同机，那个 IP 就是源站。

`Message-ID` 里的主机名、 `X-Mailer` 也能提供线索，尤其是自建邮件系统的情况。

失效条件：用第三方邮件服务发信，链路里全是服务商的 IP；或者 SPF 配置严格、邮件走独立发信域名，这条就断了。

### 9\. 用境外节点解析

部分 CDN 厂商的套餐只做国内加速，海外线路没有节点，或者只做转发不做缓存。从境外主机直接解析、访问，可能拿到回源的真实 IP。

```
# 境外 DNS 直接查
dig @8.8.8.8 www.example.com +short
dig @1.1.1.1 www.example.com +short
```

更好的是用境外 VPS 直接 `curl` 一遍，看能不能拿到页面。

这招的效力在下降：主流云厂商的 CDN 全球节点已经很完整了，现在主要对中小厂商、区域型 CDN、"国内加速"这种低价套餐还有效。而且就算解析到不同 IP，也要按第一步的逻辑确认那是不是源站，别把海外节点当成源站。

### 10\. C 段扫描和全网扫描

到这一步说明前面都没收口，需要花算力和时间了。前提是 **已经有一个候选 IP 或者候选 C 段**，漫无目的地扫是浪费。

有了 C 段之后，思路是：扫这个段里开放的 80/443，然后逐个带 `Host` 头发请求，比对返回内容。

```bash
# 先扫端口
masscan 1.2.3.0/24 -p80,443 --rate 2000 -oG scan.txt

# 再逐个带 Host 头验证，取响应长度和标题比对
while read ip; do
  echo -n "$ip  "
  curl -k -s -H "Host: www.example.com" --max-time 5 "https://$ip/" | head -c 200 | tr -d '\n'
  echo
done < iplist.txt
```

返回内容和 CDN 上一致、或者直接跳转到目标域名的，就是源站。

如果连候选段都没有，才考虑全网扫描：Zmap 收 443 端口的证书，按证书里的域名过滤。这个方法成本很高（几十 GB 流量、需要专线或云主机），而且目标越小越不划算。实际工作中更常用的是直接拿测绘平台按 C 段查：

```
# FOFA
ip="1.2.3.0/24"
```

比扫描快几十倍，也不用自己出带宽。

顺带一句边界：主动扫描他人 C 段，在授权范围外的法律风险很实在，别把自己扫进去。

### 11\. F5 LTM 的 Cookie 解码

目标用 F5 BIG-IP 做负载均衡时，响应头里会出现这样的 Cookie：

```
Set-Cookie: BIGipServerpool_8.29_8030=487098378.24095.0000; path=/
```

第一段十进制数就是后端节点的地址编码，解码规则固定：

```
487098378  →  十六进制  1d08880a
从后往前每两位一组：0a . 88 . 08 . 1d
逐组转十进制：      10 . 136 . 8 . 29
结果：10.136.8.29
```

**这里要纠正一个流传很广的说法：解出来的通常不是"公网真实 IP"，而是 F5 后面那台 pool member 的内网地址。** 这个值确实能反映真实服务器的地址，但它是内网视角的，能不能从公网直接访问到，取决于 F5 有没有把它暴露出来。

实战价值在于两点：一是确认目标用的是 F5 而不是云 CDN（架构判断），二是如果解出来的是公网段地址，那就直接是候选源站。看一眼 Cookie 名字， `BIGipServer` 、 `BIGipServerpool` 开头的都适用，有些厂商的自研负载均衡也会在 Cookie 里带类似的后端标识，值得顺手解一下。

## 第三步：怎么确认找到的是真的

候选 IP 拿到手之后，别急着写结论。四个信号，对得上越多越可信：

**信号一：带 Host 头访问，返回目标页面**

```
curl -k -s -H "Host: www.example.com" https://<候选IP>/ | head -50
```

返回的 HTML 和 CDN 上访问到的内容一致（标题、logo、关键字符串都能对上），这是最强的证据。

**信号二：证书对得上**

直连该 IP 的 443，证书的 `subjectAltName` 里包含目标域名或者它的子域，同时证书签发时间不是最近才换的。

**信号三：这台机器有别的东西**

源站通常不只跑一个 Web。扫一下这个 IP 的其他端口，如果开着 22、3306、3389、8080、8443 之类的管理服务，说明它是台真机器，不是 CDN 边缘节点。

**信号四：反向解析能对上**

拿 IP 反查域名（PTR、微步反查、Shodan 的 `hostname` ），如果反查出目标自己的域名，或者同 C 段的其他资产也指向这个单位，可信度就上去了。

反面信号同样重要：只返回 CDN 的错误页、只开 80/443、响应头里全是 CDN 厂商标识、用国外 IP 访问和用国内 IP 访问内容完全一致——这些说明你还在边缘节点上打转。

## 写在最后

这些方法说到底是一条线索： **CDN 改变的是"域名解析给谁"，改变不了"服务器自己怎么说话"**。证书里写着它认哪些域名，响应头里带着服务端指纹，页面里有跟代码绑定的追踪 ID，Cookie 里有负载均衡的内网地址——这些都是源站不得不暴露的痕迹。

顺序上建议按成本走：先做 CNAME 和归属确认（两分钟），再查历史 DNS 和子域（几分钟），然后才是证书反查和指纹搜索，最后才动 C 段扫描和全网扫描。全网扫描是收口手段，动静大、代价高，别当成第一步。

从防守那一侧看，想把这 11 条堵掉大半，只有几个关键动作：

• 证书隔离：源站用内部 CA 签，或者至少不要让主域名证书出现在源站的 443 上

• 回源白名单：源站防火墙只放行 CDN 回源 IP 段，其余全 drop，这一条能废掉一大半方法

• 邮件分离：MX 不要和 Web 同机，用独立发信域名

• 子域收敛：要么统一上 CDN，要么别解析到公网；测试环境、运维面板尤其要注意

• 去掉指纹：favicon 换掉， `Server` 、 `X-Powered-By` 清掉，第三方统计能不自建就别自建

这几条做到位，剩下的那几条路子成本会高到大多数人不愿意继续。

渗透测试 · 目录

作者提示: 个人观点，仅供参考
