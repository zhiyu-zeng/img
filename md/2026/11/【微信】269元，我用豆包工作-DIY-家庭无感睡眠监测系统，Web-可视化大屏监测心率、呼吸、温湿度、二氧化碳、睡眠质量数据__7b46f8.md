---
title: 【微信】269元，我用豆包工作 DIY 家庭无感睡眠监测系统，Web 可视化大屏监测心率、呼吸、温湿度、二氧化碳、睡眠质量数据
source: https://mp.weixin.qq.com/s/ZI82Co4GH16MfCM6jsSJeg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:53:56+08:00
trace_id: bdb04852-785a-4b2e-92c4-3714ce6e7c28
content_hash: 877ab87d91f54f5a25769a09a00310257000f8eb21b53d95faeeec217af70e4f
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 41475244-d011-816f-bd29-c0fea0e5963a
ioc: null
---

**IoT物联网技术** *2026年11月10日 08:27*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f6008da1a0aeabc8.png)

> 睡眠质量、心率、呼吸、温湿度、二氧化碳

上周，趁着学校秋假，飞哥带孩子去游乐园畅玩了一整天。

第二天女儿就没精打采，发起了高烧。医生检查后确诊：不幸被传染了乙流。

安顿好女儿后，飞哥坐在客厅很想知道孩子的睡眠情况，又担心同一个屋里陪睡会被传染，不如让豆包工作设计一套无感的家庭睡眠监测系统。

说干就干，先让豆包工作干！

**无感睡眠监测方案设计**

飞哥先打开电脑，把一句话需求发给了豆包工作：

> 我熟悉esp32开发板，想结合激光雷达、二氧化碳监测、温湿度传感器，搭建一套无感的睡眠监测系统，数据存储到云端，并通过Web网页端可视化大屏展示出来，先帮我做一个整体方案架构设计参考吧

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3dc4f10d08524af5.png)

几分钟后，豆包工作给出了从传感器硬件到平台设备接入、存储服务、前端大屏的三层整体架构参考：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8e13e22c94d866af.png)

**硬件选型参考**

豆包工作还推荐了设备端传感器的选型参考。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9c5069b3f6c5d21e.jpg)

-   为什么不建议只用 24GHz：24GHz 波长约 12.5mm、带宽约 250MHz，距离分辨率只有 0.75m，很难捕捉呼吸心跳这类毫米级微动；60GHz 波长约 5mm、带宽可达 4GHz 以上，距离分辨率到厘米级，才能实现呼吸心率监测。
    
-   为什么建议两个雷达搭配：60GHz 体征雷达的作用距离只有 0.4–1.5m，覆盖不了整个房间；人翻身、离开床后就会丢失目标。用 LD2410C 负责 “房间里有没有人、是否上床”，60GHz 负责 “床上的体征”，逻辑才完整，也能做出 “入睡 / 离床” 事件。
    

众所周知，嵌入式硬件开发涉及供电和接线，因此飞哥让豆包工作分析了一下电源和接口规划、安装建议。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ecf8393d6c2d787f.png)

综合分析后，飞哥选定了 ESP32-S3主控、传感器 毫米波激光雷达R60ABD1、二氧化碳监测 SCD41、温湿度传感器 SHT45，于是让豆包工作生成硬件接线图。

> 好的，初步选型乐鑫ESP32-S3作为主控，Micradar R60ABD1 用来检测呼吸、心率、睡眠状态，SCD41 检测二氧化碳，SHT45检测室内温湿度，请你按这个组合绘制一下引脚连接图。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68de0fb8e57de82b.png)

几分钟后，豆包给出了接线图，并解释了背后的原因，也指出了两个容易出问题的地方：

-   I²C 地址分配：SCD41 固定为 0x62，SHT45 可在 0x44 或 0x45 之间选择，两者默认地址不冲突，可以接在同一条总线上。
    
-   R60ABD1 电平：它的 UART 输出是 3.3V TTL，与 ESP32-S3 直连即可。
    

最终选定的硬件 BOM 参考

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/adf1e56539e5512e.png)

**嵌入式代码开发**

嵌入式开发最繁琐的就是对接传感器协议，于是飞哥让豆包工作先分析毫米波雷达 R60ABD1 传感器协议，并编写ESP32程序读取关键睡眠数据。

> 帮我分析一下 R60ABD1 毫米波雷达的协议，主控采用乐鑫esp32 ，生成对应的 C 程序，读取呼吸、心率、睡眠数据

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/80ce96f0949bb25d.png)

**20多分钟后，豆包工作给出了协议分析结果。**

协议结构

> 53 59 | ctrl | cmd | lenH lenL | data\[n\] | sum | 54 43
> 
> 帧头 控制字 命令字 长度(大端) 数据 校验 帧尾

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb99831a70ac3f6f.png)

## 核心帧分析

> 睡眠阶段编码顺序容易记反：00 深睡、01 浅睡、02 清醒、03 无。

## 最后，豆包工作生成了基于ESP32的核心代码片段

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d927654fbc201136.png)

**于是，飞哥又让豆包工作分别编写二氧化碳传感器SCD41、温湿度传感器SHT45的数据读取代码，这里就不再赘述了。**

**数据库设计**

**因为要存储采集到的数据，飞哥让豆包工作设计了数据库。**

> 帮我设计一个张数据库表，用来存储家中多个房间室内的温度，湿度，二氧化碳值，以便后续做统计分析

**很快豆包工作给出了结果，并不是飞哥要的一张表，而是更合理的三张表：房间、设备、读数分开存。核心思路是 **把时序数据单独放在一张窄表里**，房间信息只放一处，避免“客厅温湿度”字段跟着读数一起重复一万遍。**

**豆包工作同时给出了不同场景下三张表聚合查询的 SQL 示例：**

```sql
-- 全屋今日 CO2 峰值（找通风最差的房间）
SELECT r.name,
       round(avg(s.temperature),1) AS t_avg,
       round(avg(s.humidity),1)    AS rh_avg,
       max(s.co2)                  AS co2_peak
FROM sensor_readings s
JOIN devices d ON d.id = s.device_id
JOIN rooms   r ON r.id = d.room_id
WHERE s.ts >= date_trunc('day', now())
GROUP BY r.name ORDER BY co2_peak DESC;

-- 近 7 天按小时聚合（画折线图用）
SELECT date_trunc('hour', s.ts) AS hour, r.name,
       round(avg(s.temperature),1) AS t, round(avg(s.co2)) AS co2
FROM sensor_readings s
JOIN devices d ON d.id = s.device_id
JOIN rooms   r ON r.id = d.room_id
WHERE s.ts >= now() - interval '7 days'
GROUP BY 1, 2 ORDER BY 1 DESC;
```

**飞哥追问了三张表的关系，豆包工作也给出了示例参考，一目了然。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b8297cb99bfca677.png)

**在此基础上飞哥又让豆包工作添加了睡眠数据字段，就不再赘述了。**

**睡眠监控可视化大屏设计**

这次可视化大屏仅飞哥自己用，主要关注几个核心指标，因此没有做设计稿，直接让豆包工作自由发挥。

> 请你帮我生成一个睡眠监控大屏 HTML 页面，其中组件可以自适应屏幕大小，左侧为二氧化碳、温度、湿度三个环境指标，右侧为核心睡眠数据，包含睡眠时长，睡眠状态（良好、一般、较差）、入睡时间点、醒来时间点、饼图方式展示睡眠结构分析（深睡时间、浅睡时间、清醒时间）、平均心率、心率曲线、平均呼吸频率、呼吸频率曲线，以及按时间段的睡眠阶段分析。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a32856eabd181f7.png)

豆包工作很快交出了第一版，飞哥也发现了细节问题，催着豆包工作马上做了修改。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a04400d8a6b53759.png)

最终，飞哥得到了满意的版本：整体很清爽，心率、呼吸和睡眠数据、二氧化碳、温湿度等环境数据全部呈现出来了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bac78683848d013e.png)

**此大屏呈现仅为示意数据，并非真实截图**

**写在最后**

飞哥作为 AIoT 智能硬件开发达人，从起念头到硬件选型、传感器接线、联调协议、编写固件、搭建可视化大屏，有了豆包工作，不再需要一页页翻传感器协议文档，一行行从零敲代码，一天时间就搞定了过去两三周的工作。

> 本监测系统数据仅作日常作息与体动参考，不用于诊断病情或判断疗效，如有身体异常请以医院检查为准。

如果你也从事物联网开发，欢迎体验豆包工作的程序设计和编码能力： **网页搜索「豆包工作」下载电脑端，新用户直接领30天免费体验套餐；老用户每天签到就能攒额度，做任务的时候放心用。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fef1030bb7b76f7e.jpg)

* * *

点个关注 **🌟，精彩不迷路 ❤️**

本公众号所发布的内容来源于互联网，我们会尊重并维护原作者的权益。由于信息来源众多，若文章内容出现版权问题，或文中使用的图片、资料、下载链接等，如涉及侵权，请及时告知，我们将尽快处理。

IoT物联网 · 目录
