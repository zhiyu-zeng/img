---
title: Gergely's hack blog – Corrections regarding rename()
source: https://gergelykalman.com/corrections-regarding-rename.html
source_host: gergelykalman.com
clip_date: 2026-09-24T10:28:10+08:00
trace_id: 2b94759f-95c2-4bd4-8aab-c3bbd1b4353c
content_hash: de7b2e69a90c029b95cdb88b635c6075b3d799391965a5830aeec6c949925c13
status: synced
tags:
  - 漏洞分析
  - 内核
series: null
feed_source: Gergely Kalman·Apple安全
ai_summary: 作者更正了自己关于 `rename()` 竞态的错误示例：`rename("./a", "./b")` 并**不可**利用，正确的可利用形式应包含攻击者可控的中间目录。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-81d2-8ec3-d756f687ad1f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 作者更正了自己关于 `rename()` 竞态的错误示例：`rename("./a", "./b")` 并**不可**利用，正确的可利用形式应包含攻击者可控的中间目录。
> 
> - **更正结论：** `rename("./a","./b")` 是特例，基本安全；绝对路径重命名不受影响；只有当相对路径中存在攻击者可控子目录（如 `rename("./tmp/a","./tmp/b")`）时才存在竞态。`.` 不算子目录。
> - **安全前提：** 该特例安全依赖两点——程序 `CWD` 无法被修改，且 `.` 不会重新解析当前目录。二者任一被打破即可出问题。
> - **macOS 例外：** Linux 上 CWD 按预期不可变；但 macOS 可通过挂载覆盖 CWD（或前置路径组件），让内核静默替换 vnode，`umount -f` 甚至可永久搞坏目标程序，且用 `../` 无法恢复。
> - **可利用场景：** 该特例只提供"在任意目录创建/覆盖固定文件名"的原语。若应用以 root 运行，可针对 `/etc/sudoers.d` 实现 root LPE（sudo 不在意文件名，可借竞态控制源 inode 或用符号链接绕过权限检查）；若攻击者能控制文件名，只需引入子目录即可退回普通可利用情形。
> - **修正措施：** 已更新相关博文与 alligatorcon、OBTS 的幻灯片，并更正 lateralus 博文，标注变更。

While researching the filesystem training I came across a particularly bad example I have given in my talks and slides about how `rename()` works, and I felt it's prudent that I own up to this mistake and publish the correction.

### TL;DR:

My provided example of `rename("./a", "./b")` is **NOT** racy. It is a special case of `rename()` that is actually (sort of) secure, more on that below.

Absolute path `rename()` s are unaffected: (like `rename("/Users/test/tmp/a", "/Users/test/tmp/b")`).

Relative path renames are unaffected if there is an attacker-controlled subdirectory in `CWD` (like `rename("./tmp/a", "./tmp/b")`). In this case if `tmp` is attacker controlled, the race is still there.

It's important to note that `.` does not result in an actual path resolution, at least not in my latest tests. There are caveats to this as well, more on that below.

All in all, I have made the unfortunate mistake of using this special case example that is - quite infuriatingly - a rare case that is not exploitable in real life. All examples should have contained the correct `rename("./tmp/a", "./tmp/b")` form.

If this affected you in any way, I'm sorry. I owe you a beer.

### What went wrong?

The example I originally wanted to put in my slides and talk was from the lateralus exploit, where I encountered `rename()` 's racyness. In that exploit there was a `rename()` operation with two long absolute paths. I shortened these paths as I was under the (incorrect) assumption that this did not matter.

While absolute paths allow you to race any non-last path component, relative paths require you to race any non-final path component under `CWD`. Basically, if the relative `rename()` is being performed in any subdirectory there is a race, if there's no (attacker-controlled) subdirectory, there isn't one. It further complicates things that the special `.` directory does not count as a subdirectory.

As you might imagine, testing something like this is really difficult to do correctly. I believe I have made a mistake in the tester code. I did not investigate this as close as I should have as my real-life exploits worked, which makes sense because none of them exploited this specific case.

### How prevalent is this special case?

**This use-case is common, however only a very small subset are exploitable to begin with.**

Generally in this case the two filenames (src and dst) are not attacker-controlled. The problem with exploitation here is the fact that since we can't overwrite an **arbitrary** filename, what we end up having is an **"overwrite/create a file with a fixed static filename in any directory"** primitive.

Exploiting this is possible in specific situations. One of these situations is if the vulnerable application runs as root. In this case, we can place a random filename as root in an arbitrary directory and target `sudo`.

By targeting `/etc/sudoers.d` this results in a root LPE, as `sudo` does not care about the file's name. It does care about permissions though, but due to the race we can fully control the source inode, and employ some clever tricks to bypass the check or we can just use a symlink. Again, I'm simplifying a bit, but doing this is not that difficult. I have submitted bugs like this.

Another situation where this might be exploitable is if the attacker did control the filename. Since now the attacker can turn this back into the non-special case - by introducing a subdirectory into the filename - exploiting is trivial. From all the situations I have seen though, this is very rare.

Finally, if the attacker truly had no filename control and the vulnerable application was not running as root, there is no good vector to exploitation that I have in mind. I tried to come up with something generic to turn these into exploitable situations, but most entitled applications simply look for files with fixed names and creating random files in the directories they access has no effect.

This is the next frontier though:

> If you can find a privileged application that can be attacked by placing a file with a static random name somewhere, hit me up. Such an attack vector would be the key to unlocking a lot of (currently) non-exploitable bugs. Even if `rename()` is not as racy as I originally thought.

So to summarize, `rename()` is actually a little less scary than I originally suggested, however in practice this effect is quite small.

### Why is rename("./a", "./b") only sort-of secure?

This operation is secure because:

-   the `CWD` of a program can't be modified, and
-   `.` does not result in re-resolving the current directory

If either of these assumptions break, we can have a problem here.

Firstly, I suspect the `.` resolution is either a cache or a special case somewhere in the kernel, however I can't guarantee that this is true in every situation/filesystem/special case. Since path resolution in the kernel (particularly `namei()` and `lookup()`) is unbelievably complicated, investigating this too deeply is not something I could spend the time on right now. Considering how complicated all of this is though, I would be surprised if this condition held true in **all** cases.

Secondly, regarding the `CWD` being unmodifiable: this is not true on macOS. On Linux this works as expected (the program still sees the old directory), but on macOS you can simply mount over the `CWD` directory (or any preceding path component) and the kernel will silently swap out the directory vnode under the running application.

This is truly horrific.

If then you use `umount -f` on that mount you can permanently brick the application, making all relative-path file operations fail, until the targeted application reinitialized it's `CWD` with an absolute path. Funnily enough, using `../` will not work. Needless to say, all of this is incredibly weird.

In any case, the usefulness of this trick is debatable, and off the top of my head I don't know any good tricks that could be used to have something useful happen, but this behaviour is a feature of the operating system. I tried messing around with this, but the best I could do was to redirect the `rename()` onto the mount point. Since I can't externally restore the old `CWD` in the target program though, this proved to be useless.

Then again, the same thing applies as before:

> This requires a lot of further investigation, so DM me any tips if you know better.

### Fixing the problem

As a fix for these mistakes I have updated all the relevant blogposts and slides to contain the accurate information and will mark the changes accordingly.

I uploaded to this blog the corrected slides for alligatorcon and OBTS. I also corrected the lateralus blogpost.
