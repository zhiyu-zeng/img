---
title: What Xcode's new JSON project file means for security (Part 2)
source: https://ivrodriguez.com/what-xcodes-new-json-project-file-means-for-security-part2/
source_host: ivrodriguez.com
clip_date: 2026-11-03T10:28:06+08:00
trace_id: a7ae7c49-3ab8-4922-ba1a-1f0f7952edf8
content_hash: 1b200c746b66072f33584a6752599302600e71516a53a0b29fcec17cedcc4ef2
status: synced
tags:
  - 开发工具
  - 供应链安全
series: null
feed_source: Ivan Rodriguez·移动安全
ai_summary: TL;DR：Xcode 新 JSON 工程格式的安全价值几乎全在可读 diff，但 .gitattributes 一行即可关闭审查；工程文件内仅 5 类元素能执行代码。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40d75244-d011-816b-b38d-d3456f6f2914
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Xcode 新 JSON 工程格式的安全价值几乎全在可读 diff，但 .gitattributes 一行即可关闭审查；工程文件内仅 5 类元素能执行代码。
> 
> - **五类可执行元素：** script 构建阶段、带 script 的 build rule、external-build-system 目标、AppleScript 构建阶段、SwiftPM build tool plugin；最后者最易漏看——只是依赖列表里一行，脚本代码却在他人仓库，XCSSET 恶意软件正是藏身于构建阶段和 build rule。
> - **project.xcproj 不是全部：** scheme 的 pre/post-action（XML 属性里的 scriptText）、xcconfig 文件、Package.resolved 都在 bundle 其他位置，新格式的可读性改进完全没覆盖它们，只查一个文件会留门。
> - **可审查性可自我撤销：** .gitattributes 一行 `project.xcproj binary` 就让 diff 只显示 "Binary files differ"，且该文件短小不起眼、Git 支持任意目录层级，比新增 run-script 阶段更容易混过 PR 审查。
> - **官方 CLI 缺陷：** Xcode 27.2 的 `xcodeproj target phase add-script` 会顺带删除同步文件夹排除项（如 Subscriptions.storekit），使其被打进 app 包；写出的文件仍符合规范字节形式，字节级校验放行，只有 diff 能暴露，已报 Feedback Assistant。
> - **防御阶梯：** 首选 CODEOWNERS 覆盖 project.xcproj、xcschemes、xcconfig、Package.resolved 和 .gitattributes 并强制 owner 审查；进阶为构建前通读脚本、CI 校验可执行面清单、带用户确认的 ssh 签名；但签名挡不住已在本机运行的恶意软件，真正的防线在 CI。

This is the second part of the “What Xcode’s new JSON project file means for security” series. In the [first part of the series](https://ivrodriguez.com/what-xcodes-new-json-project-file-means-for-security-part1/) we went over the good news, that there’s a canonical byte form and Xcode already writes it, and the 4 places where your tooling and Xcode disagree about what’s in the file. That one was about parsing the file correctly, this one is about what’s worth looking at once you can.

In this second and final part I’ll go over:

-   The 5 things in a project file that run a program on your machine, and the one everybody will miss
-   `App.xcodeproj/project.xcproj binary`, one line in `.gitattributes`, and every future diff is `Binary files differ`
-   `xcodeproj target phase add-script` deleting an exclusion nobody asked it to touch, and shipping the file that was excluded

## What can hurt you in a project file

Most of a project file is inert, paths, groups, localization settings and the bulk of the build settings can’t hurt you. The part that can is small enough to write down on one screen, and these 5 run a program during the build:

-   **Script build phases**: `targets[].build-phases[]` with `"kind": "script"`, the `shell` and `script` fields
-   **Build rules with a script**: `targets[].build-rules[]`, the `processor` and `script` fields
-   **External build system targets**: `"kind": "external-build-system"`, with a `build-tool-path` and `build-tool-arguments` that can point anywhere
-   **AppleScript build phases**: `"kind": "apple-script"` (*yes, those are still a thing*)
-   **SwiftPM build tool plugins**: `dependencies[]` with `"product-type": "build-tool-plugin"`

That last one is the easiest to miss by a mile, one unremarkable line in a dependency list, no script anywhere near it, and the code it runs lives in somebody else’s repo. It’s not exotic either, [zoonk](https://github.com/zoonk/zoonk) depends on [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) *exactly* that way:

```json
{ "kind": "package", "package": "swift-openapi-generator", "product-name": "OpenAPIGenerator", "product-type": "build-tool-plugin" },
```

Then there’s the stuff that moves the trust boundary, package repository URLs and version constraints, local package paths, xcconfig references and cross-project dependencies. None of that runs anything by itself, it just changes whose code you end up compiling. And then the settings that switch off a protection you already have, `ENABLE_USER_SCRIPT_SANDBOXING` (which is what wraps your run-script phases in a sandbox), the `OTHER_*FLAGS` family, the code signing settings and `ENABLE_HARDENED_RUNTIME`, where the dangerous change is a value, not a new line, so a diff that adds nothing can still take a protection away.

That’s not a theoretical list of places a program could hide, the build phase and the build rule are exactly where XCSSET puts its payload.

Pulling just that subgraph out is what makes it readable by a human:

| Project | Raw lines | Security-relevant items |
| --- | --- | --- |
| VirtualBuddy | 1100 | 15  |
| Secretive | 771 | 1   |
| zoonk | 288 | 7   |

VirtualBuddy’s 1100-line project file comes down to 15 things, 3 run-script phases, 9 package pins and 3 xcconfig references, and you can read all of them in under a minute. Secretive’s 771 come down to one.

One tuning note, and this one cost me a rewrite. My first version also pinned every security-relevant build setting, which gave me 113 items for VirtualBuddy, 80 of them stable signing configuration repeated per target per build configuration. A tool that asks you for 80 approvals gets 80 rubber stamps, and the 3 items that mattered end up no safer than before, so those settings get watched for *dangerous values* instead and nobody gets asked to approve them.

## project.xcproj isn’t the whole bundle

Schemes are the big one, and they aren’t in `project.xcproj` at all. Scheme pre-actions and post-actions live in `App.xcodeproj/xcshareddata/xcschemes/*.xcscheme`, they’re XML, they’re committed by convention and they travel with a clone. What runs is an `ExecutionAction` whose `ActionContent` carries a `scriptText` attribute, a shell script sitting inside an XML attribute, and it fires when the scheme’s action runs. Pre-action output isn’t shown in the build log by default.

None of the new format’s readability improvements touch any of that, it’s a different file in a different language. Same story for `.xcconfig` files, which can set any build setting from outside the project, including the ones that turn off the script sandbox, and `Package.resolved`, which pins the exact revision of every package that gets compiled.

So a check that covers `project.xcproj` and stops there has left a well-known door open.

## A repository can revoke its own reviewability

Everything good about this format for security depends on one thing, a change producing a diff a human can read. But that property is granted by git, not by the format, and a repo can take it away from itself with one line in `.gitattributes`:

```plaintext
App.xcodeproj/project.xcproj binary
```

A change that normally renders as `4 insertions, 3 deletions` with full context comes out like this instead:

```
 App.xcodeproj/project.xcproj | Bin 10570 -> 10627 bytes
 Binary files a/App.xcodeproj/project.xcproj and b/App.xcodeproj/project.xcproj differ
```

57 bytes bigger, and that’s everything the review is going to tell you about that change. [`-diff` and `-text`](https://git-scm.com/docs/gitattributes) do the same thing, and [`linguist-generated`](https://github.com/github-linguist/linguist) is the soft version, GitHub keeps the diff and folds it behind a click *nobody* clicks.

This works because `.gitattributes` is short, boring and already full of entries that look just like it. I’m guessing that line sails through a pull request a lot more comfortably than a new run-script phase does, and it switches off the review that would’ve caught that phase. Git honours a `.gitattributes` in any directory too, so one dropped next to the `.xcodeproj` is even less likely to be read.

And that’s the part that bothers me the most. Nobody has done this to a `project.xcproj` as far as I know, and this is still a beta, but the mechanism is sitting right there: the kind of injection XCSSET has been shipping for 6 years used to get through review because nobody could read a `.pbxproj` diff, this format finally gives a reviewer a fair shot at catching it, and then one line, in a file nobody reads with any suspicion, takes that shot away again.

## The xcodeproj CLI, and a bug in it

Xcode 27.2 also ships `xcodeproj`, a first-party CLI that reads and writes project files, and I didn’t find it in the [Xcode 27.2 beta release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27_2-release-notes). Here’s what it does:

```plaintext
xcodeproj setting set <KEY> <VALUE> [--target T] [--config C]
xcodeproj target phase add-script --target T --name N --script S
xcodeproj target add | add-aggregate | add-dependency | remove
xcodeproj group add | add-file | include | exclude | remove
```

So modifying a project doesn’t require parsing anything anymore, which matters if your detection logic assumes project files are only written by Xcode. And `xcodeproj setting set ENABLE_USER_SCRIPT_SANDBOXING NO` takes the sandbox off every run-script phase in the project, in one command, from a binary that’s signed and notarized by Apple. Whatever you have watching for odd tools touching project files isn’t going to blink at that one.

While testing that CLI I found a bug. Running `add-script` against zoonk’s project at commit `0445f26`, about as boring an edit as you can make:

```plaintext
xcodeproj target phase add-script \
    --project Zoonk.xcodeproj \
    --target Zoonk \
    --name "Lint" \
    --script 'echo hi'
```

That adds the phase you asked for and deletes an unrelated entry from a synchronized folder’s exclusion list in the same write, with nothing in the output to say so:

```
  "exclusions": [
    "Info-Debug.plist",
    "Info.plist",
-   "Resources/StoreKit/Subscriptions.storekit",
  ]
```

What it does say is `Added script build phase named 'Lint' to target 'Zoonk' at index 4.` and that’s the whole report!

`Subscriptions.storekit` had been deliberately excluded from that target, so it now joins the target and gets copied into the shipped app bundle. Put a credentials plist or an internal config file in there instead and you’ve shipped it. It reproduces every time on 27B5019i, and I’ve written it up for Apple through [Feedback Assistant](https://feedbackassistant.apple.com/).

The file it wrote is still byte-identical to `xcprojformatter` output, so the canonical form check from Part 1 passes it. What catches it is the diff, one deleted line, which in the old `.pbxproj` nobody was ever going to spot. The format is working exactly as intended here, which is a strange thing to say about a bug that widens what ships in your app.

## So what should you do?

A ladder, cheapest first, and the cheap rungs carry most of the weight. First one is CODEOWNERS, today, for free:

```plaintext
*.xcodeproj/project.xcproj          @your-org/appsec
*.xcodeproj/xcshareddata/xcschemes/ @your-org/appsec
*.xcconfig                          @your-org/appsec
Package.resolved                    @your-org/appsec
.gitattributes                      @your-org/appsec
```

`.gitattributes` is on that list on purpose, it’s the file that can switch off everything else. Add a branch protection rule requiring Code Owner review and that’s the whole control, no tool, no keys, no false positives, and it’s enforced server side where a compromised laptop can’t reach it. In my opinion there’s nothing else in here that buys you this much for this little work.

The other 3 rungs, in order:

1.  Look at a project before you build it. Against a repository you have no history with there’s no baseline, so the question isn’t whether it changed, it’s what it does at all, so read the script phases before you press Build.
2.  A committed manifest of the executable surface, verified in CI, so changing a script phase means changing 2 files and the second is small enough somebody will read it.
3.  Signatures, and only with user presence. Ed25519 detached signatures with [`ssh-keygen -Y sign`](https://man.openbsd.org/ssh-keygen.1) and `-Y verify` against a committed `allowed_signers` file, never HMAC, because a shared secret has to exist wherever verification happens, so every verifier is a forger too.

But be honest about what that last one buys you. Against malware already running as you, on your machine, it buys much less than it looks like, anything you can sign without a prompt it can sign too, it injects, re-signs and verification passes. What signing protects is everybody downstream who pulls, and CI, because CI isn’t the attacker’s machine. That’s also why user presence matters, a key that can’t sign without somebody touching a sensor means the malware can’t get a signature without making noise.

## What I wouldn’t build

An Xcode plugin that checks a project before it opens or builds it. That’s the obvious shape, it’s the first thing I looked into, and it can’t be built. `XCSourceEditorExtension` is the whole supported extension surface and its entire public API is 4 types that work on a text buffer, you get buffer lines and a completion handler. It’s never told which file it’s editing, it gets no project or workspace reference, it has no lifecycle event for project open or for build, and no way to say no. The `DVTPlugIn` era ended with Xcode 8, and the “plug-ins” new in Xcode 27 are agent plug-ins that add skills and MCP servers to the coding assistant, nowhere near the document lifecycle.

So the gate has to live outside the IDE. Gating *open and build* instead of commit and merge means an Endpoint Security system extension, and that’s a restricted entitlement from Apple, notarization and MDM deployment, so it’s a real project and not a weekend one.

And Xcode still has no project trust prompt. [VS Code](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust) has Workspace Trust and JetBrains has trusted projects, but in Xcode cloning a repo and pressing Build just runs what’s in it. The JSON format didn’t change that either way.

## Conclusions

-   **Almost all of the security benefit here is reviewability, not anything cryptographic, and one line of `.gitattributes` switches it off, so `.gitattributes` belongs in CODEOWNERS right next to the project file.**
-   The list of things inside a project file that can run code is short, 5 kinds, and the one people will miss is the SwiftPM build tool plugin, it looks like a dependency and there’s no script in sight.
-   `project.xcproj` isn’t the whole bundle, schemes, xcconfig files and `Package.resolved` are all outside it and none got easier to read.
-   Apple’s own `xcodeproj` CLI deleted an exclusion nobody asked it to touch, and the file it wrote is still canonical, so a byte level check says it’s fine.
-   Sadly nothing here stops malware that’s already running as you, CI is where that gets caught, because CI isn’t your laptop.
-   If you only do one thing, make sure the right person reads the diff.

If you see an error or have any questions, please reach out [@ivMobAppSec](https://twitter.com/ivMobAppSec).
