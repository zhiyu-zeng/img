---
title: 【微信】RestrictedPython：一句格式化字符串，为什么能走出沙箱
source: https://mp.weixin.qq.com/s/LiTvxXEbocHFE6aDBYBEgg
source_host: mp.weixin.qq.com
clip_date: 2026-09-30T09:17:31+08:00
trace_id: effeadce-fdfd-4c51-9aff-204e976dc85c
content_hash: 848c54bb933a29198f5cd7cc84a5bd8322fbbb0cb8f2cc3f3052801b0036a381
status: synced
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: RestrictedPython 8.4 修复 CVE-2026-76825：沙箱守卫拦的是被改写过的属性访问点，而 `string.Formatter.get_field()` 在标准库内部自行实现查找，绕过了守卫，可读出沙箱外文件。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3eb75244-d011-815c-8024-f105eef6166a
ioc:
  cves:
    - CVE-2026-76825
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> RestrictedPython 8.4 修复 CVE-2026-76825：沙箱守卫拦的是被改写过的属性访问点，而 `string.Formatter.get_field()` 在标准库内部自行实现查找，绕过了守卫，可读出沙箱外文件。
> 
> - **漏洞成因：** 编译期改写 + 运行期 `_getattr_`/`_getitem_` 守卫，只覆盖“被改写过的访问点”；任何在 C 层或标准库中自实现查找的接口（如 `string.Formatter`）都不走这扇门。
> - **利用路径：** 沙箱放开 `string` 模块（模板常用 `str.format`）即可借 `get_field` 逐层取到绑定方法的 `__globals__`、`__builtins__`、`__import__`，再以宿主进程身份执行命令并读取沙箱外凭据文件。
> - **验证实测：** 沙箱内 `open` 不可用，但 `compile_restricted` 仍报“0 错误 0 告警”，逃逸后代码以宿主身份运行——编译期无告警、运行期才暴露。
> - **修复取舍：** 8.4 直接让 `string.Formatter` 在沙箱内不可用（抛 `NotImplementedError`），而非给 `get_field` 补守卫；依赖该能力的业务模板需在应用层改为受控实现，不能回退版本。
> - **落地动作：** 复测三件事——原脚本运行期是否被拒、沙箱外敏感文件是否仍受保护、沙箱进程权限/目录/网络是否最小化；把“沙箱内可用模块清单”写入发布检查项，并把异常类型突变、子进程创建、外部文件读取纳入告警。

**云梦安全** *2026年9月30日 08:51*

2026 年 9 月，RestrictedPython 发布 8.4，修复了 CVE-2026-76825（GHSA-hp3v-5vw7-fx9w）。这个库在 Python 生态里的角色很特殊：它本身不提供任何业务功能，只提供“受限执行”——把用户提交的代码放进一个被裁剪过的解释器环境。低代码平台、规则引擎、在线评测、报表模板，以及越来越多 AI Agent 的代码沙箱，都把它当成最后一道墙。

值得单独写一篇的原因，是这次的问题不在“沙箱写错了”，而在“沙箱守的那扇门，和字符串自己走的那扇门，不是同一扇”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ee130457c664ffec.png)

## 守卫拦的是属性访问，而 Formatter 不走这扇门

RestrictedPython 的核心思路分两步：编译期把受限代码改写成“用受控的访问函数替代原生属性访问”，运行期再由 `_getattr_` 、 `_getitem_` 这类守卫决定哪些属性允许被摸到。只要没被放开的属性， `__globals__` 、 `__builtins__` 这些经典逃逸跳板就都摸不到。

但这套守卫只在“被改写过的那些访问点”上生效。Python 标准库里有不少函数自己实现了一套属性查找， `string.Formatter.get_field()` 就是其中之一：为了让 `"{0.name}"` 这种字段名能取到对象属性，它内部绕开普通的点号语法，直接做属性查找和下标查找。于是，只要沙箱里放开了 `string` 模块——这非常常见，因为业务模板经常要用 `str.format` ——这条链路就绕过了守卫。

这里其实是一个通用教训：沙箱守卫的效率，取决于“所有访问路径都经过它”这个前提。任何在 C 层或标准库里自己实现查找的接口，都会在这个前提上开一个洞。

## 在隔离环境里，这条链是“逐层借壳”

本地实验准备了一个最小沙箱：builtins 里不含 `open` 、 `exec` 、 `eval` ，工作目录限定在 `sandbox_root/` ，同时在沙箱目录之外放了一个 `outside_secret.env` ，模拟宿主机上的凭据文件。

验证脚本先确认沙箱内 `open` 不可用（输出为 False），再把一段受控代码交给 `compile_restricted` 编译——结果是“0 错误 0 告警”，顺利通过。运行之后，脚本打印的中间步骤显示：借助 `get_field` 依次取到了绑定方法上的 `__globals__` 、 `__builtins__` 和 `__import__` ，随后以宿主进程身份执行了 `whoami` ，并把沙箱外那个凭据文件整段读了出来。

三个事实值得记下：沙箱内明明没有 `open` ，代码却读到了文件； `compile_restricted` 在编译期毫无告警；逃逸后执行的代码，身份是宿主进程，不是沙箱。

## 8.4 的修复是“把能力拿走”，不是“把守卫补上”

升级到 8.4 后，同一个脚本的对照结果很说明问题： `compile_restricted` 依然 0 错误 0 告警，但运行阶段直接抛出 `NotImplementedError: string.Formatter is not safe` 。

也就是说，8.4 的处理方式是让 `string.Formatter` 在沙箱内彻底不可用，而不是给 `get_field` 加上守卫。这个取舍本身合理——不能安全支持的能力，先关掉。但它带来两个必须落实到位的动作。

一是评估业务模板是否依赖 `string.Formatter` 或 `str.format` 的字段取值。如果依赖，升级后会从“能跑但危险”变成“直接报错”，正确做法是在应用层换成受控实现，而不是把库版本回退。二是不要把“升级后脚本报错”当成验证通过的唯一标准，真正的验证是确认异常链在运行期被阻断，并且沙箱内不再存在可达的系统调用路径。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a688c4f152ac21c.png)

## 谁需要认真看这件事

RestrictedPython 通常出现在三类位置：面向外部租户的低代码或自动化平台；接受用户自定义规则和插件的内部系统；以及替 AI Agent 执行模型生成代码的沙箱。这三类场景有个共同点——写代码的人不受信任，但代码跑在一个能摸到业务数据和内网的环境里。

因此核查可以从三个问题入手：我们的沙箱放开了哪些模块，尤其是 `string` 、 `os` 、 `subprocess` 这一类；沙箱进程以什么身份运行、在哪个目录、能访问哪些网络；沙箱外的文件、环境变量和元数据服务对它是否可见。只要第三个问题的答案是“能看见”，第二个问题的答案就不该是“生产节点上的高权限账号”。

## 检测与复测怎么落地

日志侧可以关注沙箱执行器的异常类型突变：短时间内大量 `NotImplementedError` 、属性访问被拒绝的记录，往往意味着有人在试边界，而不是业务模板突然写错了。系统侧则应把沙箱进程的子进程创建、外部文件读取、非预期 DNS 解析纳入基线告警。

升级后的复测建议固定三件事：原验证脚本是否在运行期被拒；沙箱外的敏感文件是否仍在保护范围内；沙箱进程的权限、目录与网络出口是否按最小化配置。同时把“沙箱内可用模块清单”写进发布检查项——沙箱的强度不取决于它拦住了什么，而取决于它被允许用什么。

## 一句话总结

受限执行的边界，等于“所有可达路径的交集”。这次交集里漏掉了标准库自己实现查找的那条路，于是沙箱外的文件就变成了沙箱内的变量。
