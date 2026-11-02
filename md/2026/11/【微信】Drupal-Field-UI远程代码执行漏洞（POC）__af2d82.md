---
title: 【微信】Drupal Field UI远程代码执行漏洞（POC）
source: https://mp.weixin.qq.com/s/5DjYqKV6mhwj-Cdg-Cerwg
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T09:56:23+08:00
trace_id: bf3fbd3e-3789-468a-b25b-0160736e6454
content_hash: 903a397dc5f0101041664031f8f8ca79e0e34fd2cf6987a7bb50fb08502df6d8
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
notion_page_id: 40c75244-d011-81d3-8a2e-c98f76e5a9be
ioc:
  cves:
    - CVE-2026-108097
    - CVE-2026-108099
  cwes:
    - CWE-470
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## CVE-2026-108097 | Drupal Field UI远程代码执行漏洞（POC）

**信安百科** *2026年11月2日 09:15*

## 0x00、前言

在内容管理系统这个赛道里，Drupal 一直是"重型装备"的代名词。它诞生于 2001 年，以灵活的数据建模和严格的权限体系著称，长期被政府机构、高等院校和大型企业用于构建公开站点与内部门户。这种定位也意味着它的每一个安全公告都会牵动一批高价值目标。

2026 年 10 月 14 日，Drupal 安全团队发布 SA-CORE-2026-014：核心模块 Field UI 存在远程代码执行漏洞（CVE-2026-108097），按 Drupal 自有风险标尺评为 Critical 19/25。

这份公告里藏着一个听起来自相矛盾的表述——"仅核心本身不可直接利用，但存在多条严重的利用路径，且至少一条无需认证"。同一个漏洞，既危险又不危险，差别全部取决于你的站点装了什么。这篇文章把这句话拆开讲清楚。

## 0x01、漏洞描述

漏洞位于 FieldUiTable::tablePreRender：Field UI 表格渲染时会把 row 的 #region_callback 当作 PHP callable 直接调用，并把整行数组按引用传入。

如果目标站点存在一个贡献模块或自定义代码路径，允许 HTTP 请求数据影响 Field UI row的#region_callback，攻击者就可以让 Drupal 执行任意 PHP callable。

## 0x02、CVE 编号

| 项目  | 内容  |
| --- | --- |
| CVE 编号 | CVE-2026-108097（姊妹：CVE-2026-108099，Entity List 模块） |
| 漏洞类型 | CWE-470 不安全反射 / CAPEC-138 反射注入 |
| 受影响组件 | Drupal core Field UI（field_ui，FieldUiTable.php） |
| 官方公告 | SA-CORE-2026-014（2026-10-14） |
| 修复版本 | 10.6.19 / 11.3.19 / 11.4.10 / 12.0.0-beta2 |

**利用条件**

目标启用 Field UI，且存在把请求数据写入 #region_callback 的模块/自定义代码。

## 0x03、影响版本

| 分支  | 受影响版本 | 修复版本 |
| --- | --- | --- |
| 8.9 – 10.6 | 8.9.0 ≤ v < 10.6.19 | 10.6.19 |
| 11.0 – 11.3 | 11.0.0 ≤ v < 11.3.19 | 11.3.19 |
| 11.4 | 11.4.0 ≤ v < 11.4.10 | 11.4.10 |
| 12.0 预发布 | 12.0.0-alpha1 ≤ v < 12.0.0-beta2 | 12.0.0-beta2 |

## 0x04、漏洞详情

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/46fe4f4d8cd469f1.png)

## 0x05、个人观察与判断

**升级是全局解。** 10.6.19 / 11.3.19 / 11.4.10，sink 本身被移除，任何 writer 都够不着。无法立刻升级时，卸载 `field_ui` 模块可在窗口期内提供保护（代价是字段管理后台不可用）。Drupal Steward 只覆盖部分已知路径，不能替代升级。

**审计自定义代码。** 在 contrib 与自定义模块里搜 `region_callback` 、 `field_ui_table` 、 `tablePreRender` ，重点找"请求或提交数据流向渲染数组行"的路径。

**把 files 目录当敌意目录。** 保留默认.htaccess（Apache）或 PHP 禁止段（nginx），对 `files/.htaccess` 的任何变更告警； `sites/default/files/` 下突然出现 `settings.php` 副本或新的 `.php` ，是强 IoC。

## 0x06、参考链接

**1\. Drupal 官方安全公告 SA-CORE-2026-014**

https://www.drupal.org/sa-core-2026-014

受影响版本、风险标尺构成与官方缓解措施的原始出处。

**2\. Fortbridge 深度技术分析与实验室证据**

https://fortbridge.co.uk/research/cve-2026-108097-deep-dive-turning-a-drupal-field-ui-callback-into-rce/

gadget 枚举、利用链复现与评分分歧讨论，证据包已开源。

3.Github项目地址：

https://github.com/fortbridge/cve-2026-108097-research/tree/master

* * *

> **— END —**
> 
> **❤ 如果觉得有帮助，点个红心支持一下吧。**

每周威胁情报 · 目录

作者提示: 个人观点，仅供参考
