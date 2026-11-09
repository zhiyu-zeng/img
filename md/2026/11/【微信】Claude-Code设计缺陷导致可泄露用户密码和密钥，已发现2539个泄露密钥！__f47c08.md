---
title: 【微信】Claude Code设计缺陷导致可泄露用户密码和密钥，已发现2539个泄露密钥！
source: https://mp.weixin.qq.com/s/s8HbUZoQPro4fODlB2H7aw
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:17:33+08:00
trace_id: dcb5204d-a679-41a7-9249-882be47c47d0
content_hash: aed81232eb8306275a9e4cb1050299cc53abee688f9597c95e01ca4ad2b8e785
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41375244-d011-81c7-804e-f41677af7315
ioc: null
---

**AGI安全** *2026年11月8日 08:40*

## 泄露规模

11 月 5 日，安全公司 Apiiro 公布了一组统计：GitHub 上公开的.claude/settings.local.json 有 104,185 份，其中 1,122 份至少包含一个真实密钥，去重后共 1,379 个。把 git 历史、fork 和团队共享的.claude/settings.json 一并计入，总数是 2,539 个密钥，分布在 1,994 个仓库、63 家组织。

这些密钥不是被攻击者窃取的，是 Claude Code 在用户确认命令时写入的。

104,185 份公开的 settings.local.json 中，1,122 份含至少一个真密钥，合计 1,379 个；按类型拆分以数据库口令最多 公开文件的统计结果 Apiiro 2026 年 11 月 5 日公布 104,185 份公开的 settings.local.json 1,122 份至少含一个真密钥 1,379 个互不相同的密钥 数据库口令 379 Supabase service_role 122 Supabase 账号令牌 103 SSH 登录 43 GitHub / GitLab / npm 42 AWS 访问密钥 23 私钥文件 6 计入历史与 fork 后：1,994 个仓库 · 63 家组织 1,122 份文件含有真密钥 104,185 份公开文件中， 1,122 份含至少一个真实密钥。

根据类型统计，数据库口令 379 个，Supabase service_role 密钥 122 个、账号令牌 103 个，SSH 登录 43 个（部分含 sshpass 传递的 root 口令），GitHub / GitLab / npm 令牌 42 个，AWS 访问密钥 23 个，私钥文件 6 个。

Apiiro 在 11 月 2 日至 3 日通知了仓库所有者，但没有逐个验证密钥是否仍然有效，只有一家公司回复说其中一把仍可用。因此这些数字是暴露量，不是损失量。

## 泄露过程

第 1 步命令中包含明文口令

连接生产库时直接输入：mysql -u root -pPr0d!x9 -h db.prod。口令以明文出现在命令里。

第 2 步Claude Code 请求确认

确认框提供三个选项：是 / 是，且以后不用再问这条命令 / 否。

第 3 步选择第 2 项

Claude Code 把整条命令原样写进.claude/settings.local.json 的 permissions.allow 数组，包括 -pPr0d!x9。它保存的不是「允许运行 mysql」这样的规则，而是命令字符串本身。

Claude Code 弹出命令确认，选择「是，且以后不用再问这条命令」后，含明文口令的整条命令被逐字写入.claude/settings.local.json 的 permissions.allow 写入过程 选择第 2 项后，命令被原样保存 Claude Code 请求执行这条命令： $ mysql -u root -pPr0d!x9 -h db.prod 1 是 2 是，且以后不用再问这条命令 3 否，我来告诉它换个做法 选择第 2 项 → 命令写入 allow 数组 settings.local.json { "permissions": { "allow": \["Bash(mysql -u root \-pPr0d!x9 …)",\] } } 同时，Claude Code 把这个文件加入了本机的全局 git excludes。 该规则只在这台机器上生效，不写入项目的.gitignore，也不随仓库分发。 配置提交后，命令对所有 clone 的人可见 命令被原样写入配置 permissions.allow 中保存的 是带明文口令的完整命令。

这样设计是为了让相同操作不再触发确认，但「相同操作」被实现为「相同字符串」，口令因此成为规则的一部分。任何写在命令行里的凭据都会遇到同样的情况：PGPASSWORD=、sshpass -p、mysql -p、连接串中的 user:pass@、curl 的 Authorization 头。

注意本机 git excludes 的适用范围

Claude Code 首次在仓库中写入这个文件时，会把它加入本机的全局 git excludes。这条规则只在同一台机器、同一用户、文件尚未被提交的情况下有效。它不会写进项目自己的.gitignore，所以在其他机器 clone、CI 拉取代码、同事接手时都不存在；文件一旦被 git add 过，excludes 也无法阻止后续提交。

## git rm 删除文件不能解决所有问题

git rm --cached 只影响下一次提交，以下三处仍保留副本：

注意历史提交、fork，以及 Claude 自己提交的那一次

734 个密钥只存在于旧版本的提交中，分布在 509 个仓库；74 个仓库的 211 个 fork 各有一份副本；在 1,105 个被追踪的仓库中，539 个出现过以 Claude 为共同作者的提交修改过这个文件——也就是说它经常是由 Claude 自己提交的。 含密钥的文件在默认分支上的中位存活时间是 **217 天**。团队共享的.claude/settings.json 有 76,011 份公开，其中 298 份含密钥。

删除文件只影响当前版本：git 历史里留着 509 个仓库的 734 个密钥，74 个仓库的 211 个 fork 各带副本，中位存活 217 天 删除文件后的三处残留 当前版本、历史提交、fork HEAD 已经删除 工作区和最新提交中 不再包含该文件 历史 509 个仓库 734 个密钥只存在于 旧版本的提交中 Fork 74 个仓库 211 个 fork 各有一份 该文件的副本 217 天 中位存活时间 539 / 1,105 Claude 参与提交 298 份 settings.json 含密钥 先轮换凭据，再清理 git 历史 删除后仍有三处残留 git rm 只影响当前版本， 历史提交和 fork 仍保留副本。

因此处理顺序是 **先轮换，再清理**。凭据一旦进入公开仓库就应视为已泄露：先在各系统中作废并重新签发，再清理 git 历史。顺序反过来，清理完成后旧凭据仍然可用。

## 扫描器为什么没有检出

这类文件本应被 secret scanning 拦截，但两个常用工具的检出率都只有一半多：gitleaks 在 1,122 份中检出 564 份，TruffleHog 检出 643 份， **215 份两个都没有检出**。

gitleaks 抓到 564 份、TruffleHog 抓到 643 份，215 份两个都没抓到，因为 PGPASSWORD、sshpass、Bearer 里的口令没有固定前缀 两个扫描器的检出情况 1,122 份含密钥的文件 gitleaks 564 / 1,122 检出 50% TruffleHog 643 / 1,122 检出 57% 两个都未检出 215 份 占 1,122 份的 19% 至少一方检出 907 份 占 81% PGPASSWORD=Pr0d!x9 pg_dump -h db.prod app sshpass -p 'Summer2026' ssh deploy@10.0.3.7 curl -H 'Authorization: Bearer sk-live-…' api.x.dev 带固定前缀的密钥可由正则匹配，这三行中的口令没有可匹配的前缀。 两个扫描器漏掉 215 份 gitleaks 检出 564 份， TruffleHog 检出 643 份。

原因是匹配方式。AKIA…、ghp\_…、sk-… 有固定前缀，正则可以识别；PGPASSWORD=Pr0d!x9 中的口令没有前缀，与周围文本没有语法区别。能够识别它的检测需要理解这条命令在做什么，多数扫描器不做这种判断。

提示文件大小与含密钥比例相关

超过 8 KB 的文件中，约每 10 份有 1 份含真实密钥；小于 500 字节的文件中，不到 500 份有 1 份。文件越大，说明「不用再问」被选择得越多。

## 处理方法

第 1 步轮换凭据

把这些文件中出现的每个口令、令牌、私钥在所属系统中作废并重新签发。

第 2 步停止追踪，并写入项目自己的.gitignore

\# 先完成凭据轮换，再执行下面这些

git rm --cached.claude/settings.local.json

echo '.claude/settings.local.json' >>.gitignore

git commit -m 'stop tracking claude local settings'

\# 历史提交里的也要清理（会重写 hash，协作者需要重新 clone）

git filter-repo --path.claude/settings.local.json --invert-paths

第 3 步不在命令行中写值

使用环境变量或密钥管理器取值：

psql "$DB_URL" -c 'select 1'

PGPASSWORD="$PGPASS" pg_dump -h db.prod app > app.sql

\# 允许规则写成前缀，不写整条命令

Bash(npm run:\*)

Bash(git status)

第 4 步把 agent 配置目录视为可能含密钥的目录

需要检查的不只是.claude/：.cursor/、.gemini/、.specstory/（对话记录）也会保留命令原文。可以在 CI 中添加规则，这些路径下包含 =、-p、Bearer、://user: 的行触发告警。

## 问题报告与处理经过

2025 年 8 月 11 日有人在 GitHub 上报告：权限规则中保存的是明文口令。2026 年 1 月 3 日，该 issue 被自动化机器人以 **not planned** 关闭，同一机器人还关闭了另外三个相关报告。研究公开时，厂商没有公开回应。

2025 年 8 月 11 日的 GitHub issue 报告明文保存，2026 年 1 月 3 日被机器人以 not planned 关闭，同一机器人关掉 4 个相关报告，2026 年 11 月 5 日研究公开 报告与处理经过 2025 年 8 月 — 2026 年 11 月 2025-08-11 提交报告 2026-01-03 标记 not planned 2026-11-05 研究公开 报告内容 权限规则里保存的 是明文口令 处理结果 自动关闭 标注 not planned 同一机器人 还关闭了另外 3 个相关报告 两份厂商文档都没有提到：这个文件默认保存命令原文，且仅靠本机 excludes 保护。 按文档比较 16 款编码代理，只有 Claude Code 这样保存 问题报告与处理经过 2025 年 8 月已有人提交报告， 2026 年 1 月被标记 not planned。

Apiiro 按文档比较了 16 款编码代理，只有 Claude Code 被确认会把完整的批准命令默认写入项目内的文件。

选择「不用再问」是产品提供的正常操作，问题在于这个操作的结果：一条含明文口令的字符串被持久化、纳入版本控制，并随仓库分发给所有 clone 的人；界面没有说明这一点，保护措施也只在单机上有效。 在行为改变之前，应做到两点：命令行上不写明文凭据；已经写入过的配置，视为已经公开。
