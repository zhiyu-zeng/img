---
title: What Xcode's new JSON project file means for security (Part 1)
source: https://ivrodriguez.com/what-xcodes-new-json-project-file-means-for-security-part1/
source_host: ivrodriguez.com
clip_date: 2026-11-03T10:26:58+08:00
trace_id: a46d788c-d4b4-47a7-8580-501fa13d8f93
content_hash: 7b1cf7432968495ea80b30c1b6ca75be59190669c178501c08127498052ce7c7
status: synced
tags:
  - 供应链安全
  - Xcode
series: null
feed_source: Ivan Rodriguez·移动安全
ai_summary: Xcode 27.2 用 JSON5 格式的 project.xcproj 取代 pbxproj，虽带来可校验的规范化字节形式，但存在 4 个解析差异，会让审查工具读到的内容与 Xcode 实际执行的不一致。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40d75244-d011-8179-9352-dbd9cc3f1265
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Xcode 27.2 用 JSON5 格式的 project.xcproj 取代 pbxproj，虽带来可校验的规范化字节形式，但存在 4 个解析差异，会让审查工具读到的内容与 Xcode 实际执行的不一致。
> 
> - **规范化字节形式成立：** `xcprojformatter` 输出幂等且与 Xcode 写入结果字节一致，一条 `cmp` 管道即可做完整性校验；但别用 RFC 8785 JCS，Apple 故意用自定义键序，按字母排序会得到 Xcode 从不写入的字节。
> - **它是 JSON5 不是 JSON：** 尾随逗号合法，实测 Python `json`、`jq`、Node `JSON.parse` 全部拒绝全部 9 个真实项目文件，CI 里把 `project.xcproj` 管给 `jq` 的检查形同虚设，甚至可能 fail open；用正则去注释还会破坏含 `//`、`/*` 的脚本体。
> - **重复键语义相反：** Xcode 经 `JSONSerialization` 实现-first-wins，Python/jq/Node 均 last-wins；双 `script` 键时 Xcode 运行 `echo FIRST` 而工具读到 `echo SECOND`，且 `xcprojformatter` 会静默丢弃败者键，让文件“看起来干净”。应把任何重复键当硬失败。
> - **Unicode 规范等价陷阱：** Swift 字符串相等基于 Unicode canonical equivalence，`MY_KÉY` 的 NFC 与 NFD 两种拼写在屏幕上完全相同，Python 看到两个键，Xcode 只保留一个。
> - **脚本有两种合法拼写：** 单行脚本是字符串、多行是数组，同一 Xcode 写出的文件里两者并存，且加一行就会在两种形态间翻转，锚定 `"script": "` 的正则对公开项目有确认的假阴性。

Xcode 27.2 replaces `project.pbxproj`, the NeXT-era property list, with `project.xcproj`, a JSON file. Apple wants readable diffs and fewer merge conflicts, and they open sourced the implementation as [apple/xcode-project-format](https://github.com/apple/xcode-project-format).

IMO it’s the most interesting thing to happen to Xcode projects in 20 years, because a project file isn’t just data, it’s a program: a run-script build phase runs on your machine, as you, the moment you build, with your keychain, your SSH agent and your signing identity.

[XCSSET](https://www.trendmicro.com/en_us/research/20/h/xcsset-mac-malware--infects-xcode-projects--uses-0-days.html) has been infecting Xcode projects since 2020 by putting its payload into a build phase or a build rule, and it spreads through shared source, you build an infected project and now every Xcode project on your machine has one too. Microsoft wrote up [another new variant](https://www.microsoft.com/en-us/security/blog/2025/09/25/xcsset-evolves-again-analyzing-the-latest-updates-to-xcssets-inventory/) in September 2025.

My guess is whoever maintains it is already looking at the new format, they’ve been shipping new versions for 6 years and one of the things the newer ones already do is write the `.pbxproj` file directly. Nothing I read says XCSSET has gone after `project.xcproj` though, and 27.2 is still a beta, so the point is the mechanism, not an attack on the new format.

In a `.pbxproj` that injection hid very, very well inside a wall of hex identifiers, and a JSON file renders it as a block a human can read.

So I wanted to know what the new format does, not what the announcement says. Everything here was checked on Sep 18th 2026 against Xcode 27.2 beta (build 27B5019i), the `xcprojformatter` binary it ships, 9 real `project.xcproj` files and Apple’s library on a few constructed edge cases.

This post ended up being a bit too long, so I decided to split it in two parts:

-   **Part 1**: The canonical byte form, and 4 reasons your tooling reads a different file than Xcode runs
-   **Part 2**: What can hurt you in a project file, the `.gitattributes` line that turns the benefit off, and a bug in Apple’s `xcodeproj` CLI

## The canonical byte form

The good part first. For any integrity scheme over a structured file the hard part is normally canonicalization, the same document has many byte spellings, so you have to invent a normal form and hope everyone agrees. Here you don’t have to invent anything.

I ran `xcprojformatter` over the 9 real project files, using both a build from Apple’s published source and the binary shipped inside Xcode 27.2, and the two agree byte for byte. The output was idempotent for all 9 and byte-identical to what Xcode itself had written for 8. The one that wasn’t is a hand-authored test fixture from the [XcodeProj](https://github.com/tuist/XcodeProj) repo, not Xcode output, which is *exactly* the result you’d hope for.

So a meaningful integrity check is one line:

```plaintext
xcprojformatter --input App.xcodeproj/project.xcproj | cmp - App.xcodeproj/project.xcproj
```

If they match, the file is in Xcode’s own normal form and a digest over its bytes means something. If they don’t, something other than Xcode wrote it.

One warning if you go down this road: don’t reach for the [JSON Canonicalization Scheme](https://datatracker.ietf.org/doc/html/rfc8785), it mandates lexicographically sorted keys and Apple’s writer deliberately uses a custom key order so that, in their words, “the type of an object can be quickly discerned”. Canonicalizing that way gives you bytes Xcode never writes.

## Strict JSON parsers fail on every real project file

The format is JSON5, not JSON. Apple’s reader calls [`JSONSerialization`](https://developer.apple.com/documentation/foundation/jsonserialization) with `.json5Allowed`, so [comments and trailing commas](https://json5.org/) are legal, and Xcode’s own writer emits trailing commas everywhere.

Every real file I tested is rejected by Python’s `json`, by `jq` and by Node’s `JSON.parse`. Not some of them, all 9:

```
  strict-json FAIL virtualbuddy.xcproj        Expecting value (line 11)
  strict-json FAIL secretive.xcproj           Expecting value (line 8)
  strict-json FAIL zoonk.xcproj               Expecting value (line 6)
  ...
  python json.loads: 0 ok, 9 failed
```

Every real file uses trailing commas, and that’s what all 3 of those parsers are choking on. So if you already wrote a CI check that pipes `project.xcproj` into `jq`, that check isn’t checking anything. It’s failing, and depending on how you wrote it, it might be failing open. And that’s the check anybody writes first, because the file is finally JSON and `jq` is right there on every CI image.

The obvious workaround, stripping the comments with a regular expression before you parse, is worse than the problem it solves. Build scripts are full of `//` inside URLs and `/*` inside shell globs, so a regex stripper will corrupt script bodies in ways that are hard to notice. What you want is a JSON5 parser, not a JSON one, and even then you’re only past this first trap.

## Xcode keeps the first duplicate key, everyone else keeps the last

This one is genuinely nasty, and I got it wrong myself before I tested it.

Apple’s `Decoder.swift` builds its keyed container by assigning into a Swift dictionary in document order:

```swift
for fieldOrComment in fieldOrComments {
    if let field = fieldOrComment.field {
        self.fields[field.key] = field.value
    }
}
```

Read that and you conclude last-wins. But that’s wrong, the loop runs over an already-parsed tree, and on Darwin the real read path is `JSONSerialization.jsonObject(options: [.json5Allowed, .fragmentsAllowed])` in `Serialization/Values/Value.swift`, and it resolves the duplicates before that loop ever sees them. So Xcode is first-wins and everything else is last-wins. I checked this 3 ways, one of them against the binary Xcode 27.2 ships. Given a build phase with two `script` keys, this is what each parser says the script is:

| Parser | Result |
| --- | --- |
| Xcode 27.2 `xcprojformatter` (shipped binary) | `echo FIRST` |
| Apple’s `XcodeProjectFormat` library | `echo FIRST` |
| Python `json.loads` | `echo SECOND` |
| `jq` | `echo SECOND` |
| Node `JSON.parse` | `echo SECOND` |

In other words a project file with a duplicated key runs one script under Xcode and reports a different one to every review tool anyone would build. Write the obvious one, the weekend script that pulls `script` out of every build phase and diffs it against what you approved, and it shows you the line that never runs. And it gets better, `xcprojformatter` drops the losing key without a word, so as soon as somebody runs it, or just opens the project in Xcode, the file looks clean, the duplicate is *gone* from the diff and the only script left in there is the one that was running all along. yay reviewability!

There’s no legitimate reason for Xcode’s writer to emit a duplicate key, so treat any duplicate as a hard failure instead of picking a side.

## Two keys that look different are the same key

Build settings decode into a Swift `[String: BuildSetting]`, and Swift string equality is [Unicode canonical equivalence](https://unicode.org/reports/tr15/), not code point equality.

I gave the shipped binary a project with 2 build settings, `MY_KÉY` written precomposed (U+00C9) and `MY_KÉY` written decomposed (`E` followed by U+0301), and this is what went in:

```json
"build-settings": { "MY_KÉY": "precomposed", "MY_KÉY": "decomposed" }
```

Python sees 2 distinct keys, Xcode emits one, and on screen the 2 spellings are *identical*. I’m guessing it’s the same first-wins behaviour as above, but all I tested is that 2 keys go in and 1 comes out.

It’s the same trick as the duplicate key, your tool reports 2 build settings and Xcode applies 1, except this time your eyes can’t help you either, the diff looks like 2 perfectly normal keys and nothing in it tells you which one Xcode kept. Normalizing to NFC before you compare costs nothing, and it’s the kind of bug you’d only find out about once somebody used it on you.

## One script, two legal spellings

`XCSchema.MultilineText` encodes a single-line script as a plain JSON string and a multi-line one as an array of lines. Both spellings are legal, and both of them show up inside one single Xcode-written file. [VirtualBuddy](https://github.com/insidegui/VirtualBuddy) ’s project has 3 script phases, and one of them carries its body as a string:

```json
"script": "./Scripts/check_guest_app_deployment_target.sh\n",
```

The other 2 carry their bodies as an array instead, one string per line, and it’s the same kind of shell script either way, just a different spelling of it:

```json
"script": [
  "# Go into the VirtualBuddy.app/Contents/MacOS path",
  "cd \"$BUILT_PRODUCTS_DIR/$CONTENTS_FOLDER_PATH/MacOS\"",
  "",
  "# Symlink VirtualBuddy as vctool for VirtualCatalog command-line tool",
  "ln -fs $EXECUTABLE_NAME vctool",
  "",
],
```

So a regular expression anchored on `"script": "` has a confirmed false negative against real Xcode output, and not against something I cooked up, against a project anybody can clone right now. The spelling isn’t stable either: appending one line to a single-line script flips it from the string form into the array form, so a check written against today’s file misses tomorrow’s change entirely. If the plan was a grep, this is where it stops working. Normalize both forms into one string before you hash or match anything.

## Reproduce this yourself

None of this needs any code from me, it’s all checkable with Xcode 27.2 and a couple of public repos. Any project written by Xcode 27.2 works, I used VirtualBuddy, [Secretive](https://github.com/maxgoedjen/secretive) and [zoonk](https://github.com/zoonk/zoonk) among others. To confirm the results rather than take my word for it, first get the formatter and a real project file:

```plaintext
FMT="$(xcode-select -p)/usr/bin/xcprojformatter"     # or /usr/bin/xcprojformatter

gh api repos/insidegui/VirtualBuddy/contents/VirtualBuddy.xcodeproj/project.xcproj \
  -H 'Accept: application/vnd.github.raw' > real.xcproj
```

Xcode’s own output should already be canonical, and formatting it again gives the same bytes back:

```plaintext
"$FMT" --input real.xcproj | cmp - real.xcproj && echo "already canonical"
"$FMT" --input real.xcproj > once.xcproj
"$FMT" --input once.xcproj | cmp - once.xcproj && echo "idempotent"
```

All 3 strict parsers should fail on that same file:

```plaintext
python3 -c 'import json,sys; json.load(open("real.xcproj"))'
jq . real.xcproj
node -e 'JSON.parse(require("fs").readFileSync("real.xcproj","utf8"))'
```

If you only run one of these, run the duplicate key one. Put two `script` keys in one build phase and ask each parser what the script is:

```plaintext
cat > dup.xcproj <<'EOF'
{
  "default-configuration": "Release",
  "configurations": [ "Release" ],
  "localizations": { "development": "en" },
  "files": [],
  "targets": [
    { "name": "App", "id": "APPTARGET000000000000001", "product-type": "application",
      "build-phases": [
        { "kind": "script", "name": "Phase", "shell": "/bin/sh",
          "script": "echo FIRST",
          "script": "echo SECOND" } ] } ],
  "build-settings": {}
}
EOF

"$FMT" --input dup.xcproj | grep '"script":'         # echo FIRST
jq -r '.targets[0]["build-phases"][0].script' dup.xcproj   # echo SECOND
```

And for the Unicode collision, 2 build settings spelled precomposed and decomposed come back as one:

```plaintext
python3 - <<'EOF' > norm.xcproj
print('{"default-configuration":"Release","configurations":["Release"],'
      '"localizations":{"development":"en"},"files":[],"targets":[],'
      '"build-settings":{"MY_KÉY":"precomposed","MY_KÉY":"decomposed"}}')
EOF

"$FMT" --input norm.xcproj | grep -A3 build-settings
```

*Note: this is all Xcode 27.2 beta, build 27B5019i, so on a different build your results might differ.*

## Conclusions

-   **There’s a canonical byte form and Xcode already writes it, so a digest over a project file’s bytes finally means something.**
-   Strict JSON parsers reject all 9 real project files, so a CI check that pipes `project.xcproj` into `jq` isn’t checking anything and might be failing open.
-   Xcode reads the first duplicate key and everything else reads the last, so one file can run one script and report a different one to your tooling. Same for 2 keys that differ only in their Unicode spelling.
-   This is all against a beta, and 9 project files is a small corpus, but it’s 9 more than zero and it already proved me wrong about which duplicate key wins. I’ll update this post when/if that changes.
-   Sadly none of this tells you if a project is safe to build, only whether your tool reads it the way Xcode does.

As always, if you see anything that’s incorrect please let me know ([@ivMobAppSec](https://twitter.com/ivMobAppSec)) and I’ll fix it. In [Part 2](https://ivrodriguez.com/what-xcodes-new-json-project-file-means-for-security-part2/) I’ll go over which parts of a project file can hurt you and how short that list is, the one line of `.gitattributes` that turns every future diff into `Binary files differ`, and a data-loss bug I found in Apple’s new `xcodeproj` CLI.
