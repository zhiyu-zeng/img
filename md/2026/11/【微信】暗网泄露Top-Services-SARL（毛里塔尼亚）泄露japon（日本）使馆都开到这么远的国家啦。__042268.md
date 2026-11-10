---
title: 【微信】暗网泄露:Top-Services SARL（毛里塔尼亚）泄露japon（日本）使馆都开到这么远的国家啦。
source: https://mp.weixin.qq.com/s/tOAC1hXiSlhRxLLRw1vE8Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T12:44:00+08:00
trace_id: cdadb111-f81e-4719-96bc-37f12095e061
content_hash: 5542f6f068c1700e3abbb8d68c82aa67e9ef12de35e45072d1d8be61eaad44b0
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
notion_page_id: 41475244-d011-8160-a038-c91cf2bae4ec
ioc: null
---

**开源情报技术研究院** *2026年11月10日 07:15*

俺捏个看了一下，这个还挺有意思的，japon（日本）使馆都开到这么远的国家啦。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d337b97bddf097fa.png)

一家位于毛里塔尼亚（Mauritanie）的 **大型综合性服务与人力资源外包公司** （极有可能就是你之前提到的 `Top-Services SARL` 或其核心实体）。该公司主要为跨国机构、政府、外国大使馆和大型企业提供安保、保洁、行政派遣等综合支持服务。

以下是根据文件名拆解的具体业务板块及风险点：

### 1\. 核心业务一：外包服务与大型项目合同

这家公司是一个“中间商/服务提供商”，承接了多个重量级跨国项目的合同，并按分包协议（Counterpart contract）向下分配服务。

-   **`OIM_...` (国际移民组织)**：

-   `OIM_BUREAU_NKCT.pdf` (办公室)
-   `OIM_NETTOY_NKCT.pdf` (保洁服务)
-   `OIM_RESIDENCES_NKCT.pdf` (员工住所)
-   `OIM_SELIBABY.pdf` (塞尔巴比地区的项目)
-   **分析**：OIM 是联合国下属机构。这说明该公司承接了国际组织的本地化后勤、保洁和安保合同。

-   **`GIZ_Contrat_n83400564_Avenant_n1.pdf`**：

-   **分析**：GIZ 是德国国际合作机构（德国政府的国际援助部门）。这进一步印证了其承接的是政府级或国际援助项目的外包服务。

-   **`Neemba_Mauritanie_-_Contrat_gardiennage_menage.pdf`**：

-   **分析**：Neemba 是毛里塔尼亚著名的石油和天然气勘探公司（前身为 Woodside Mauritania）。该合同明确写着 `gardienage menage` （**安保与保洁**）。

-   **`AMBASSADE_DU_JAPON_...` (日本大使馆)**：

-   包含 `Ambassade.pdf` （大使馆）、 `Résidence.pdf` （大使官邸）等文件。说明其为外国使领馆提供本地支持服务。

### 2\. 核心业务二：人力资源派遣与员工管理

这是该公司的主要业务模式，即招聘本地员工，将其派驻到上述客户（OIM, GIZ, 大使馆等）的办公地点工作。

-   **`Liste_Agents_2026-11-04.xlsx`**：

-   **分析**： **“代理人/员工名单”**。这是泄露数据中 **最敏感的部分之一**。里面可能包含大量基层员工（如保安、清洁工、司机、行政人员）的个人信息。

-   **`Affectations_Agents_2026-11-04.xlsx`**：

-   **分析**： **“员工任务分配表”**。记录了具体哪个员工被派往哪个客户地点（例如：哪个保安去了OIM的哪个办公楼）。

-   **`Liste_Sites_2026-11-04_full.xlsx`**：

-   **分析**： **“服务地点清单”**。汇总了该公司所有的派驻点、办公室或仓库地址。

### 3\. 财务与行政管理

-   **`Liste_Contrats_2026-11-04.xlsx`**：所有对外签订合同的汇总，包含合同金额、有效期等。
-   **`Liste_Factures_2026-11-04.xlsx`**：发票清单，泄露后可能暴露客户的付款记录和价格结构。
-   **`Besoin_Postes_2026-11-04.xlsx`**： **“岗位需求表”**，记录了当前正在招聘或需要填补的职位。
