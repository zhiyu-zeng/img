---
title: "Filter generation in practice: from algorithms to LLMs"
source: https://securelist.com/practical-filter-generation/121697/
source_host: securelist.com
clip_date: 2026-10-31T02:47:30+08:00
trace_id: 7370f404-06eb-4142-ab46-43186eba2f4a
content_hash: 682a4cd9b36790f382709d5adaa8f468f805165325a5cc3e94e8390cb9f4b654
status: synced
tags:
  - AI应用
  - SOC误报过滤
series: null
feed_source: Kaspersky Securelist
ai_summary: 安全告警的误报过滤器可由算法、单个LLM或多AI代理自动生成，实测单LLM方案将误报削减99%、分析师效率提升17%。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 40975244-d011-8195-98de-fe2cdb8cbea8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 安全告警的误报过滤器可由算法、单个LLM或多AI代理自动生成，实测单LLM方案将误报削减99%、分析师效率提升17%。
> 
> - **有效性标准：** 好过滤器应尽量完整覆盖规则片段触发的上下文且不越界；过宽（如仅按PowerShell过滤）或过窄（如仅按单个ID）均无效。
> - **三大难点：** 事件平均约400个字段（通常仅4个左右够用），需先筛除无关字段；字符串需归一化（路径替换为环境变量、统一大小写）；过滤器不得照搬检测规则所用字段，否则等效于关闭该规则。
> - **算法方案：** 用FP-Growth在上下文中挖掘高频字段组合并排序，向分析师推荐前3个；确定性、可解释、无外部依赖，但依赖上下文积累（首次触发的规则无法生成），且归一化难以覆盖非典型情况。
> - **LLM方案：** 字段筛选仍交给算法，LLM生成3个附带解释的过滤器，摆脱上下文依赖、归一化更灵活，但缺少输出语法校验，且单一系统提示“牵一发而动全身”；四代理方案（Selector/Generator/Validator/Commentator）增加了校验与纠错能力，但调用更多、速度更慢且依赖模型可用性。
> - **实测结论：** 用Approval rate（3个候选中至少1个被采纳）和FP drop（部署前后误报降幅）评估；单LLM与多代理效果几乎相同，最终选择更简单的单提示LLM：误报减少99%、日均生成过滤器数量+28%、告警处理效率+17%。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7169393ca09fbf1a.jpg)

A modern organization protects its information systems with a whole suite of technologies that generate thousands of security alerts every day. Looking at these alerts in bulk, you’ll see that a significant share are false positives. Ideally, these alerts would be filtered out automatically so that analysts could focus on the ones that may point to a real incident. However, writing filters is a time-consuming task in itself. To create a correct filter, an analyst needs to:

-   Review the logs
-   Identify the source of the activity
-   Define filtering boundaries
-   Choose filtering criteria
-   Write a rule
-   Check that the filter is robust

This post looks at how filter creation itself can be automated to reduce analyst workload.

## Filter validity criteria

In the context of security alerts, a filter is a combination of event field values that marks a detection as a false positive and not worth the analyst’s attention. Filters can be generated for any combination of event fields, but not every combination yields a valid filter. That’s why we need to define validity criteria: conditions showing that a specific filter actually removes noise and doesn’t suppress useful alerts.

Detection rules in security systems typically contain a set of conditions, and each of them can generate an alert. A specific event triggers a given fragment of a detection rule. The set of events that a given fragment responds to is what we’ll call its context. A good filter should cover the entire context where possible, without going beyond it. Filters that are too broad or too narrow are useless. For example, a filter based solely on PowerShell would exclude too many events, including some that deserve the analyst’s attention. Most of the filtered events would also be unrelated to the rule in question. A filter on a specific ID, on the other hand, would cover only one event, which may never recur.

## Problems in filter generation

We can run into a number of problems when creating filters. First, events often contain an excessive number of fields (around 400 on average), and most of them aren’t needed for filtering. At the same time, generating and ranking combinations of these fields is also fairly resource-intensive. So, the first step is to discard the irrelevant fields and keep only those worth using in the filter. For example, out of 400 fields in an event, four may be enough for filtering.

Another problem is string normalization. Field values (for example, the path to the same application on different systems) can vary depending on system settings, user folder names, and so on. For a filter to account for all these variations, the strings must be normalized. For file paths, in particular, you can replace the drive letter and user folders with standard environment variables and convert all paths to a single case.

Finally, if a filter completely mirrors the query of a detection rule, it effectively disables that rule. To fix this, remove the event fields used in the detection rule from the filter. For example, if a rule triggers on a file path, there are two ways to filter out unwanted alerts:

-   In the filter, use fields other than the file path.
-   Use a part of the file path that the rule doesn’t use. For example, for the rule `file_path: ".../something.exe"`, you can set up a filter that excludes events with the `user/unique_files/` directory in the file path.

## Filtering security alerts with an algorithm

Given the problems described above, automatically generating filters for security alerts should consist of the following steps:

1.  An analyst receives a security alert that they assess as a false positive and uses the filter generator.
2.  The generator takes the 400-field event from the alert, along with the rule that triggered on it, and determines the context.
3.  The generator selects the fields that are relevant to the filter.
4.  The generator normalizes the strings.
5.  The generator builds different combinations of the selected fields. To do this, we applied the [FP-Growth (frequent pattern growth)](https://en.wikipedia.org/wiki/Association_rule_learning#FP-growth_algorithm) algorithm to the context determined earlier. FP Growth builds a tree of frequently occurring items (fields) from a dataset (in our case, the context) and discards items that aren’t frequent enough. This reduces the number of combinations to check, which lowers the cost of finding the most relevant ones.
6.  The generator ranks the resulting combinations and offers the analyst the top three to choose from.

For example, consider an event described by the following JSON:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ec60e566ea61dd28.png "practical-filter-generation1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/29195226/practical-filter-generation1.png)

After generating and ranking the combinations, we got three filters based on file paths:

-   ```swift
    processcmdline:("nodejs\\node.exe" AND "*****\\appdata\\roaming\\npm\/node_modules\/pi-coding-agent\/dist\/cli.js")
    ```
    
-   ```
    file_path:"*****/.pi\\agent\\bin\\fd.exe"
    ```
    
-   ```
    processcmdline: "programfiles\\nodejs\\node.exe"
    ```
    

The last filter turned out to be too broad, but the analyst marked the other two as valid.

### Pros and cons of the algorithmic approach

The algorithmic approach to filter generation has several advantages. First, it’s simple and deterministic: the same alert always produces the same result. Second, it’s interpretable, meaning we can see why a given combination ranked near the top of the list and why a particular field didn’t make it into the list of candidate fields at all. Third, the stages of the process are independent of each other, so individual steps can be improved and tuned without the risk of breaking the algorithm elsewhere. Finally, it has no external dependencies or models, which makes it easy to deploy in any customer environment.

However, it also has drawbacks. The first is its dependence on context. If there’s no context for some reason — for example, the rule’s first-ever trigger — a filter can’t be created. The second problem is string normalization. There’s a high chance of running into atypical cases that the normalization rules don’t cover. Often such cases can’t be described correctly at all, because they contradict each other.

These problems can be solved with large language models (LLMs). When an LLM generates the filters, no context is needed, because the LLM doesn’t iterate over or rank combinations. The LLM also takes a more flexible approach to string normalization, including non-standard cases. That said, an LLM doesn’t have to be involved at every stage of the generation process. We decided to keep the algorithmic solution where it works well. For example, a simple algorithm selects suitable fields without errors, so we didn’t move this stage to the model.

## Filter generation with an LLM

The LLM-based filter generation looks like this:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0ba0060da58df5ae.png "2_EN-scaled-1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/29202841/2_EN-scaled-1.png)

The input is still an alert containing an event with 400 fields, plus the rule that triggered on that event. Then an algorithm selects the most suitable fields for the filter. Next, the LLM processes the input — the event, the selected fields, and the detection rule — and generates three filter options along with an explanation for them. The explanation helps the analyst understand why these particular filters were suggested and make an informed choice.

Consider the following event in JSON format:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b50d3075cd342c78.png "practical-filter-generation3")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/29195639/practical-filter-generation3.png)

The LLM suggested three filter options that all contain the same command line fragment:

-   ```
    file_path: "\\WindowsPowerShell\\powershell.exe" AND filecmdline: "Get-VM -Name kafka\*"
    ```
    
-   ```
    filecmdline: "Get-VM -Name kafka\*"
    ```
    
-   ```
    filecmdline: "kafka*"
    ```
    

As in the previous example, two of the three output filters were valid. The last one was too broad to be usable. The analyst chose the first filter with minor edits:

```
file_path: "powershell.exe" AND filecmdline: "Get-VM -Name kafka\*"
```

### Pros and cons of generating filters with an LLM

Using an LLM solved the problems of purely algorithmic filter generation: dependence on context and errors in string normalization. However, the single-request approach had its own drawbacks. First, it had no output validation. The LLM returned filters as-is, with no syntax check and no way to correct errors. Second, unlike in the algorithmic version, all filter generation tasks were handled by a single system prompt. As a result, a minor fix in one place could break the logic in another.

## Using multiple AI agents

To address the problems of generating filters with a single model and a single system prompt, we tried distributing the tasks across different LLM agents. In this version, we brought in agents as early as the stage of selecting relevant fields. The chain includes four agents in total:

-   Selector: selects the relevant fields.
-   Generator: generates filters.
-   Validator: evaluates the generated filters. If the filters are found to be invalid, it returns the task to the generator. If the selected fields are found to be irrelevant, it starts a new field selection cycle. If the filters pass validation, or the limit on regeneration attempts is reached, the valid filters (or the best ones available) are passed to the analyst.
-   Commentator: analyzes the output filters and explains which field values were used and why.

For the following JSON event, the agents produce three valid filters based on the file path.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/97a9f2cdb54acf76.png "practical-filter-generation4")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/29195750/practical-filter-generation4.png)

The filters differ in the additional parameters that support the detection:

-   ```
    file_path:"sysvol\\domain\\scripts\\logon.bat"
    ```
    
-   ```
    file_path:"sysvol\\domain\\scripts\\logon.bat" AND file_md5:"0x7..6E"
    ```
    
-   ```swift
    autorun_entry: "Group Policy\\State" AND file_path: "SYSVOL\\domain\\scripts\\logon.bat"
    ```
    

### Pros and cons of the agent-based approach

LLM agents give us a system that can validate and correct filters. Its modular architecture also lets us tune and improve different stages of generation independently. However, this approach makes more LLM calls than the previous ones, so the system is slower. It also depends on access to a model, which may not be available in the organization’s isolated environment.

## Evaluating the filter generation system

To evaluate how well the filter generation system works, we use two main metrics:

-   Approval rate. For each security alert, the system suggests three filters. If the analyst selects at least one of them, we count the generation as successful. For example, in the case below, the approval rate is 2/3.  
    [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9240ff25c1427386.png "1_EN-scaled-1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/29202908/1_EN-scaled-1.png)
-   False positive reduction rate (FP drop). This metric shows how much a filter helps reduce the number of false positives. It can only be measured over time, because we need to compare the number of false positive alerts received during a set period before and after the filter is deployed.

Below is a comparison of the three filter generation approaches by these metrics:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/69601b5e188ff7d1.png "3_EN-scaled-1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/29202944/3_EN-scaled-1.png)

As the results show, LLMs significantly improve the efficiency of filter generation. At the same time, the LLM agentless and agent-based approaches perform almost identically. So we chose the simpler and faster option: an LLM with a single system prompt. As a result, we cut false positives by 99%, increased the number of filters generated per day by 28%, and made analysts’ alert handling 17% more efficient.

## Takeaways

Practice has shown that filter generation can be automated effectively. We’ve looked at several options for automatically generating filters for false-positive security alerts: a purely algorithmic approach, an LLM-based approach, and an approach built on a group of LLM agents. All of them can generate valid filters and make the analyst’s work much easier, but each has its own pros and cons.

The algorithmic approach scored lower on the evaluation metrics, but in two-thirds of cases, it still produces filters that satisfy the analyst. It works especially well when there’s already a set of similar events to filter out, meaning enough context has accumulated. The algorithmic generator can also be deployed in any environment. Both standalone LLM and multi-agent LLM approaches show high accuracy, and their results differ only slightly, so the slower agent-based approach looks excessive at this stage. If an LLM is available, the best option appears to be a single model that handles several stages of the generation cycle.
