---
title: 【微信】macOS 最好看的终端：Ghostty 配置教程，5 分钟从毛坯房到精装修
source: https://mp.weixin.qq.com/s/K-VnHjiZlSQ3sDCJdVFqSA
source_host: mp.weixin.qq.com
clip_date: 2026-06-05T12:07:55+08:00
trace_id: 21393e04-ff19-41fc-a58a-65a33a58c14d
content_hash: 586d32c8d01092dbc3e1c63ef2f613632d0c273794f1990c81ed4b8bd49b18d3
status: synced
tags:
  - 微信
  - 开发工具
series: null
ai_summary: 通过Ghostty、Starship和三个zsh插件，可快速构建macOS上极速、美观的终端环境，替代传统臃肿的iTerm2 + oh-my-zsh方案。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3ab75244-d011-8176-9520-ff8fc68aa7db
---

> 💡 **AI 总结（key-points）**
>
> 通过Ghostty、Starship和三个zsh插件，可快速构建macOS上极速、美观的终端环境，替代传统臃肿的iTerm2 + oh-my-zsh方案。
> 
> - **整体架构：** 方案分为三层独立模块：Ghostty（终端模拟器）、Starship（提示符）、zsh插件（Shell增强），全装后启动快、颜值高且配置简单。
> - **Ghostty特性：** 原生macOS、GPU加速渲染、冷启动快于0.5秒，支持半透明毛玻璃窗口和主题即时生效，配置仅需一个纯文本文件。
> - **Starship提示符：** 替代oh-my-zsh主题，提供彩虹渐变提示符，实时显示当前目录、Git分支和语言版本信息，视觉更优。
> - **zsh插件选择：** 用三个轻量插件替代oh-my-zsh框架：zsh-autosuggestions（历史命令建议）、zsh-syntax-highlighting（命令实时高亮）、zsh-completions（扩展Tab补全）。
> - **CLI工具增强：** 推荐安装fzf（模糊搜索历史和文件）、zoxide（智能目录跳转）、eza（带图标替代ls）、bat（语法高亮替代cat）、yazi（终端文件管理器）提升操作效率。

小麦 *2026年6月2日 08:13*

> 🌾 关注我，每天带你看最新科技黑科技，苹果生态深度解读。

文章满满都是干货，大家不要忘记先「点赞」和「收藏」以免之后找不到了。

你打开 Mac 终端的那一瞬间，是不是有种"毛坯房"的感觉？

白底黑字、毫无美感、功能原始。用着自带 Terminal.app，就像住在一个没装修的房子里——能用，但不舒服。

我把用了五年的 iTerm2 + oh-my-zsh 全换了。换完这套，我愿称之为 macOS 最强、最快、最好看的终端——秒开、彩虹渐变提示符、半透明毛玻璃窗口透出桌面壁纸。

不是旧方案不好，是太臃肿了。oh-my-zsh 自带 300 多个插件我只用 5 个，框架每次启动都要加载一堆东西，开个新窗口都要卡一下。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/7d535667eb5b76fb.png)

这篇手把手教你装，复制一行命令 5 分钟搞定。

* * *

## 整体架构

这套方案一共三层：

-   • **Ghostty** （终端模拟器）— 窗口本身，半透明、GPU 加速、原生 macOS
    
-   • **Starship** （提示符）— 命令行那行彩色信息，路径、Git 分支、语言版本
    
-   • **zsh + 插件** （Shell 增强）— 补全、搜索、高亮、跳转，日常操作效率
    

三层互不依赖，你可以只装其中一层。但全装上之后的化学反应是最舒服的。

* * *

## 第一层：Ghostty — 终端本身

Ghostty 是 Zig 语言写的新一代终端模拟器。原生 macOS、GPU 渲染、启动快、配置简单。对标 iTerm2 / Alacritty / Kitty，但更轻更现代。

官网：https://ghostty.org

**安装：**

```
brew install --cask ghostty
```

**配置文件位置：** `~/.config/ghostty/config`

Ghostty 的配置就一个纯文本文件，改完保存即时生效，不用重启终端。

**我配置的效果：**

-   • 半透明毛玻璃窗口——透出桌面壁纸，但不影响代码阅读
    
-   • Catppuccin Mocha 深色主题——配色柔和不刺眼
    
-   • Maple Mono NF 字体——支持 Nerd Font 图标显示
    
-   • 关掉再打开，标签页、分屏布局、窗口位置全部自动恢复
    

**常用快捷键（装好就能用）：**

-   • `⌘+T` — 新建标签页
    
-   • `⌘+D` — 右侧分屏（竖分）
    
-   • `⌘+Shift+D` — 下方分屏（横分）
    
-   • `⌘+]` / `⌘+[` — 在分屏之间切换焦点
    
-   • `⌘+Shift+Enter` — 当前分屏最大化/还原
    
-   • `⌘+W` — 关闭当前分屏/标签
    
-   • `⌘+=` / `⌘+-` — 放大/缩小字体
    
-   • `⌘+,` — 快速打开配置文件
    
-   • `⌘+Shift+,` — 重新加载配置（改完不用重启终端）
    

**和 iTerm2 有什么不同？**

说实话功能上 iTerm2 更全（profile 系统、触发器、tmux 集成那些）。但 Ghostty 的优势是：

-   • **启动快** ——冷启动体感不到 0.5 秒，iTerm2 要等一下
    
-   • **配置简单** ——一个纯文本文件，不用在 GUI 里翻半天
    
-   • **原生渲染** ——GPU 加速，内存占用低很多
    
-   • **改配置即时生效** ——保存文件的瞬间终端就变了，不用重启
    

如果你不需要 iTerm2 那些高级功能（大部分人确实不需要），Ghostty 各方面体验都更好。

想预览所有内置主题？终端里输入 `ghostty +list-themes` ，300 多个主题全列出来，挑个名字换上就行。

* * *

## 第二层：Starship — 彩虹提示符

Starship 是用 Rust 写的跨平台提示符，替代 oh-my-zsh 的 theme，但快得多。

**装 Starship 最大的理由就是好看。** 每次打开终端看到这条彩虹色信息条心情就很好，比 oh-my-zsh 那些主题高出好几个档次。而且好看的同时还实用——每个颜色块对应一类信息：

一眼能看到当前目录、Git 分支、Node/Python/Rust 版本、时间。

**安装：**

```
brew install starship
```

**在 `~/.zshrc` 末尾加一行：**

```
eval "$(starship init zsh)"
```

看到这里大家帮忙点个关注不过分吧？

下面继续说说我的配置

**我的配置特点：**

-   • 基于官方 catppuccin-powerline 预设，多色渐变
    
-   • 加了换行——信息条完整展示在第一行，光标在第二行，你永远有一整行来输入命令
    
-   • Git 状态实时显示——有未提交的修改？有未推送的 commit？提示符上直接看到，不用每次 `git status`
    

* * *

## 第三层：三个 zsh 插件 — 不用 oh-my-zsh

oh-my-zsh 的问题是太重了。就算你只启用几个插件，它的框架本身每次启动都要加载一堆东西。其实我们只需要 3 个独立插件就够了，不需要一个框架帮你"管理"它们。

### ① zsh-autosuggestions — 输入命令不用打完

你开始输入命令的时候，它会在光标后面用灰色显示一条历史命令建议。如果就是你想要的，按 `→` 键或者 `Ctrl+F` 一键接受整条命令。

比如你之前跑过 `docker compose up -d` ，下次只要输入 `dock` 它就自动补出完整命令。日常 90% 的命令都是重复的，这个插件省掉的敲键盘次数比你想象的多。

### ② zsh-syntax-highlighting — 打错命令立刻知道

你还没按回车，命令的颜色就告诉你对不对了：

-   • 命令存在 → 绿色
    
-   • 命令不存在（打错了）→ 红色
    
-   • 字符串 → 带引号高亮
    
-   • 路径存在 → 下划线
    

再也不用回车之后才发现 `command not found` 。一边输入一边就能看到问题。

### ③ zsh-completions — Tab 补全更聪明

系统自带的 Tab 补全只能补文件名和少数命令。zsh-completions 扩展了几百个命令的参数补全——git、docker、brew、kubectl 这些复杂命令的参数都能补全。

举个例子： `git checkout` 按 Tab，直接列出所有本地分支让你选，不用先 `git branch` 查一遍再手打分支名。 `docker run` 按 Tab 能补出 `--rm` 、 `-it` 、 `-v` 这些参数，不用每次去翻文档。

按 Tab 弹出候选菜单，连续按 Tab 可以用光标在列表里移动选择。而且大小写不敏感，输入 `cd dow` 能补出 `Downloads` 。

**安装三个插件：**

```
brew install zsh-autosuggestions zsh-syntax-highlighting zsh-completions
```

* * *

## 五个现代 CLI 工具

### ① fzf — 模糊搜索（最值得装的一个）

fzf 本质是一个通用的模糊过滤器，装完之后 zsh 里自动多了两个快捷键：

-   • **`Ctrl+R`** → 模糊搜索历史命令
    
-   • **`Ctrl+T`** → 模糊搜索当前目录下的文件
    

最常用的是 `Ctrl+R` 。场景：你两小时前跑过一个很长的 Docker 命令，现在想再跑一次。以前要按 `↑` 一直翻，或者 `history | grep xxx` 去猜关键词。现在 `Ctrl+R` 弹出搜索框，输入你记得的任意片段（哪怕只记得中间几个字母），实时过滤，选中回车直接执行。

还有个隐藏用法：在命令后面输入两个星号再按 Tab 触发 fzf 补全。比如输入 `cd **` 然后按 Tab，会弹出 fzf 搜索所有子目录；输入 `kill **` 按 Tab，会列出所有进程让你选。

```
brew install fzf
```

### ② zoxide — 智能跳转（用了回不去的那种）

zoxide 会在后台默默记录你 `cd` 过的所有目录，按访问频率和时间排序。然后你用 `z` 命令替代 `cd` ，只需要打路径里的几个关键字：

```
z ghost    # 直接跳到 ~/UserData/GitHubProjects/ghostty-terminal-configz obsi     # 直接跳到 ~/UserData/ObsidianProjectsz down     # 直接跳到 ~/Downloads
```

不用记完整路径，不用 Tab 一层层补全。你去过的目录它都记得，用得越多越准。

如果有重名冲突（比如多个目录都包含 "config"），用 `zi` 进入交互模式，配合 fzf 列出所有匹配项让你选。

一个小细节：zoxide 的数据会自动衰减。长时间没去的目录权重会慢慢降低，不用手动清理。

⚠️ 注意：不要设置 `alias cd="z"` ，会出问题。直接用 `z` 就好，习惯很快就养成了。

```
brew install zoxide
```

### ③ eza — 替代 ls（看一眼就不想用回系统 ls）

系统自带的 `ls` 输出就是白花花一片文件名，什么信息都看不出来。eza 加了图标、颜色、目录优先排序，文件夹和文件一眼就能区分。

我配了三个别名覆盖系统命令：

-   • `ls` — 日常看文件列表，文件夹排前面，每个文件前面有对应类型的小图标
    
-   • `ll` — 详细信息（权限、大小、修改时间），按名称排序
    
-   • `lt` — 树形视图，展开两层目录结构，快速了解项目布局
    

```
brew install eza
```

### ④ bat — 替代 cat（终端里看代码终于有颜色了）

系统 `cat` 输出的代码全是白色纯文本，看多了眼睛疼。bat 自动识别文件类型，加语法高亮——Python 是一套颜色，JavaScript 是一套颜色，JSON/YAML/Markdown 都有对应的高亮方案。

我用别名直接覆盖了 `cat` ，用起来习惯完全一样，但输出好看多了。

日常场景：快速看一个配置文件 `cat ~/.zshrc` ，注释、命令、字符串一眼就分清了。排查问题的时候特别明显，没颜色的纯文本真的看不懂。

```
brew install bat
```

### ⑤ yazi — 终端文件管理器

yazi 是一个终端里的双栏文件管理器，用方向键和快捷键操作，支持图片预览、批量重命名、Git 状态显示。

在终端里输入 `y` 就启动，比 Finder 快得多，而且不离开键盘。

```
brew install yazi
```

* * *

## 一键安装（推荐）

如果你不想一个一个手动装，直接跑这个脚本，5 分钟搞定：

公众号后台回复：「Ghostty」，免费获取一键安装的命令。

不嫌麻烦的也可以去直接去仓库地址下载：https://github.com/justhalfbit/ghostty-terminal-config

安装前会询问确认，确认后自动执行：

1.  1\. 通过 Homebrew 安装所有依赖
    
2.  2\. 备份已有 Ghostty 和 Starship 配置文件
    
3.  3\. 安装 Ghostty 和 Starship 配置（覆盖）
    
4.  4\. 将 zsh 配置追加到 `~/.zshrc` 尾部（不覆盖用户已有内容）
    

执行完就是跟我同款的终端环境。

想手动安装的去仓库看 README，有完整的步骤说明。安装完之后打开 `~/.zshrc` ，每个插件都写了详细注释——是什么、怎么用、注意事项，忘了用法直接看这个文件就行。

* * *

## 搭配 Alfred Workflow，一键启动 Claude Code

配合 Alfred Workflow， `⌘+Space` → `cc` → 回车，Ghostty 弹出来直接进 Claude Code，开始 vibe coding。

这套终端不只是好看，更是面向 AI 开发时代的效率工具。Claude Code 官方推荐的终端就是 Ghostty。

文章满满都是干货，大家最后千万不要忘记「点赞」和「收藏」以免之后找不到了。

* * *

**你的终端现在用的什么？有没有自己的美化方案？评论区聊聊，说不定你的配置比我的还好看 👀**

* * *

🌾 **觉得有用？点个「在看」+「关注」，苹果 & 科技圈最新干货第一时间推送，不迷路。**

🔥 Mac教程 · 目录

继续滑动看下一个

苹果黑科技

向上滑动看下一个
