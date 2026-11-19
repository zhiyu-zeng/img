---
title: 基于路径简化实现的轨迹压缩算法
source: https://fjqisba.github.io/2026/01/26/2026/%E5%9F%BA%E4%BA%8E%E8%B7%AF%E5%BE%84%E7%AE%80%E5%8C%96%E5%AE%9E%E7%8E%B0%E7%9A%84%E8%BD%A8%E8%BF%B9%E5%8E%8B%E7%BC%A9%E7%AE%97%E6%B3%95/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:54:45+08:00
trace_id: 0b756830-873b-4944-a8b9-f4f0f20d18b7
content_hash: 16a9af361efeeb638628b9c3f81ee85f0e797f6a8f0ec8b183cc1c71f4022594
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81ea-9568-c3dbdc8241bd
ioc: null
---

## 基于路径简化实现的轨迹压缩算法

正常来说轨迹点由(x,y)这样的二维时间序列构成，在大规模数据应用场景下，可能会需要对这些轨迹特征进行压缩处理，即将轨迹序列压缩成指定长度。

## 道格拉斯算法转换

1、假设有三个连续点 `P1(x1,y1)，P2(x2,y2)，P3(x3,y3)` ，那么按照道格拉斯算法来计算垂距，其公式是:

我们要计算的是： **中间点 到 直线 的垂直距离**。

### 公式解析：

-   **分母**：
    -   这是 **线段 的长度** （即三角形的底边长）。
-   **分子**：
    -   这在几何上等于 **三角形 面积的 2 倍**。
    -   这也是向量 和向量 的二维 **叉积** （Cross Product）。

* * *

2、现在将三个点进行向量转换，我们能得到两组向量 `v1(DX1,DY1),v2(DX2,DY2)` ，其中：

`DX1=x2-x1，DY1=y2-y1，DX2=x3-x2，DY2=y3-y2`

那么依然，计算两组向量之间的垂距，公式就变成了：

* * *

### 公式拆解

#### 1\. 分子：

这是 **向量 v1 和 向量 v2 的二维叉积 (Cross Product)** 的模。

-   **几何意义**：它等于向量 和 构成的平行四边形的面积。
-   **为什么和夹角有关**：  
      
    这直接证明了：如果两个向量 和 的夹角 越小（方向越一致），分子就越小，垂距 也就越小。

#### 2\. 分母：

这是 **合成向量 () 的长度**。

-   **几何意义**：从起点 直接走到终点 的直线距离（底边长）。
-   **逻辑**： 是总的 X 轴位移， 是总的 Y 轴位移。

#### 3\. 整体意义

### 代码实现 (Python)

既然你已经有转换好的向量，代码会比处理原始坐标简单得多：

```python
import math
import numpy as np

def calc_vector_dist(dx1, dy1, dx2, dy2):
    """
    计算 v1(dx1, dy1) 和 v2(dx2, dy2) 连接处的垂距
    """
    # 1. 计算合成向量长度 (底边)
    sum_dx = dx1 + dx2
    sum_dy = dy1 + dy2
    base_length = math.hypot(sum_dx, sum_dy)
    
    # 2. 极限情况处理：如果起点和终点重合 (v1 + v2 = 0)
    if base_length == 0:
        return math.hypot(dx1, dy1) 

    # 3. 正常情况：计算叉积 / 底边
    cross_product = abs(dx1 * dy2 - dx2 * dy1)
    return cross_product / base_length
PYTHON
```

## Visvalingam–Whyatt算法转换

上述算法转换过程本质上是对DP算法的变种，那么同理能推导出对VW算法的变种：

```python
import math
import numpy as np

def calc_triangle_area(dx1, dy1, dx2, dy2):
    """
    计算由向量 v1(dx1, dy1) 和 v2(dx2, dy2) 形成的三角形面积。
    这是 Visvalingam-Whyatt 算法用于评估点重要性的核心指标。
    
    参数:
    dx1, dy1: 前一个点到当前点的向量 (P_prev -> P_curr)
    dx2, dy2: 当前点到下一个点的向量 (P_curr -> P_next)
    """
    # 1. 计算叉积 (Cross Product)
    # 二维向量叉积的几何意义：两向量构成的平行四边形的有向面积
    cross_product = dx1 * dy2 - dx2 * dy1
    
    # 2. 计算三角形面积
    # 三角形面积 = |平行四边形面积| / 2
    area = 0.5 * abs(cross_product)
    
    return area
PYTHON
```

## 压缩过程

有了上述推导公式，那就可以开始对轨迹进行压缩了，步骤如下：

1、先将N个轨迹点，前后相减，转换成N-1组轨迹向量

2、按照向量顺序分别计算向量之间的 **损失值**，每次执行合并向量，都取损失值最小的向量进行合并，直到向量数量减少到指定数目。算法复杂度为 `O(nlogn)`

这里我们也可以发现，DP算法和VW算法本质上的不同，其实就是对损失值的定义不同，实际业务往往需要根据目标来优化损失值定义，你甚至可以将二者算法相结合，例如对于向量之间夹角较小的算法使用VW，对向量之间夹角较大的使用DP。

## 参考资料

Visvalingam–Whyatt算法： [https://en.wikipedia.org/wiki/Visvalingam%E2%80%93Whyatt_algorithm](https://en.wikipedia.org/wiki/Visvalingam%E2%80%93Whyatt_algorithm)

Douglas-Peucker算法： [https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm](https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm)

本文为fjqisba原创文章，转载请注明出处。
