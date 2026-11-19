---
title: Dealing with Floating-Point Precision in Swift
source: https://amin.benarieb.com/posts/floating-precision/
source_host: amin.benarieb.com
clip_date: 2026-11-19T10:56:49+08:00
trace_id: de1ca5d7-2270-426a-b984-d4080a65760c
content_hash: 9bc5d2dc26f99afbf34519b6c3481574f886ecffd5ef2f15cf1d403e0c13861a
status: synced
tags: []
series: null
feed_source: Amin Benarieb·移动安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81de-a7da-d4e95e0102a4
ioc: null
---

During my junior years at university, we had a course dedicated to data structures and algorithms. One of the first tasks was working with large numbers, particularly floating-point numbers. At the time, I completed the task successfully. However, I eventually forgot the key lesson about the pitfalls of floating-point numbers and their rounding errors.

Take a look at the following Swift code:

```
let a = 12.31
let b = 8.2
print(a + b)
// Output: 20.509999999999998
```

Surprisingly, instead of 20.51, you’re more likely to get `20.509999999999998`. And if you print values of `a` and `b` you also get something strange:

```
a: Double = 12.31
b: Double = 8.1999999999999993
```

Another example: if you sum 0.1 ten times (which should be equivalent to 0.1 \* 10 = 1), you might get it wrong again:

```
var sum = 0.0
for i in 0..<10 {
  sum += 0.1
}
// Result: Double = 0.99999999999999988
```

You can play around with this behavior [here on SwiftFiddle](https://swiftfiddle.com/mtt4kbx36bg57emyqzmzz4dt5q).

#### Why Does This Happen?

The reason for this behavior lies in how floating-point numbers are stored in memory. This is a common issue across many programming languages, not just Swift. Here’s a great [video explanation](https://www.youtube.com/watch?v=8RvnnUuoHTA&ab_channel=EngineerMan) along with an interactive [playground](https://evanw.github.io/float-toy/) that visually demonstrates how floating-point precision works.

#### When Does Precision Matter?

Floating-point precision errors might seem trivial, but they can have serious impacts depending on the field — especially in scientific, engineering, or financial applications.

In iOS development, the most common cases involve billing, purchases, and paywalls. On the backend, even a rounding error of $0.01 per transaction can scale into significant financial discrepancies across thousands of users. On the mobile side, these errors can lead to misleading prices, poor user experience, and ultimately bad reviews or increased **churn rates**.

But generally, we don't care much about it: for UI animations, graphics, or games, floating-point errors are often negligible since small rounding errors won’t visibly affect the user experience.

#### How to Solve It

One solution is to store values as integers (e.g., by multiplying by 100 to avoid decimals). However, the solution I prefer is using [Decimal](https://developer.apple.com/documentation/foundation/nsnumber/1407409-decimalvalue) from Foundation.

`Decimal` is designed to handle precise decimal arithmetic, making it ideal for financial and high-accuracy calculations. Unlike `Double`, which uses binary floating-point representation, `Decimal` relies on a **base-10 system**. This eliminates many common rounding errors that occur when working with currency or other exact values.

That said, `Decimal` does come with trade-offs:

-   slower performance compared to `Double` for large-scale computations.
-   higher memory usage.
-   more verbose API, requiring additional steps for arithmetic operations.

For a deeper dive into the differences between Decimal and Double, I recommend this great [article by Jesse Squires](https://www.jessesquires.com/blog/2022/02/01/decimal-vs-double/).
