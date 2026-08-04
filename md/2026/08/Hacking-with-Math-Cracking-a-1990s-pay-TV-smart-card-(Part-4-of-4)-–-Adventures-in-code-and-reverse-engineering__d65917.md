---
title: "Hacking with Math: Cracking a 1990s pay TV smart card (Part 4 of 4) – Adventures in code and reverse engineering"
source: https://katyscode.wordpress.com/2026/04/07/hacking-with-math-cracking-a-1990s-pay-tv-smart-card-part-4-of-4/
source_host: katyscode.wordpress.com
clip_date: 2026-08-04T16:02:52+08:00
trace_id: 09504b62-3909-47d4-a009-c405e2b47e48
content_hash: d257019bdb34e97b8d98437203b1c70a02fee37f38251a2976c037f1cffed481
status: synced
tags:
  - 密码学
  - 漏洞分析
series: null
feed_source: Katy's Code·IL2CPP逆向
ai_summary: 通过高斯消元、Cramer法则与二次公式，将破解1990年代付费电视智能卡签名算法的搜索空间从2^64降到2^32，多线程下平均144秒即可找到有效签名。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-812d-aea6-f95861820bf8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过高斯消元、Cramer法则与二次公式，将破解1990年代付费电视智能卡签名算法的搜索空间从2^64降到2^32，多线程下平均144秒即可找到有效签名。
> 
> - **搜索空间缩减：** 用高斯消元将8个二次方程化为两个线性方程，再经Cramer法则把s1、s2表示成仅含s3的线性式，最终只需暴力搜索s4–s7（约251⁴≈2³²种组合），较原本的2⁶⁴大幅缩短。
> - **实际性能：** 在2020年台式机上，单线程平均破解耗时43分钟；用50线程的Rayon并行搜索后降至161秒，加入优化表后为144秒。
> - **熵分析：** 该签名算法的有效熵远低于表面上的64位；固定某字节为比例因子后，2³²搜索空间必能命中至少一个有效签名；每个消息摘要共有约14056个有效签名。
> - **密码学背景：** 算法属于多元二次（MQ）密码体制，私钥由矩阵A、B与隐藏线性方程F构成，公钥D=B∘F∘A；攻击者无需恢复私钥，仅靠数学化简即可在可接受时间内伪造签名。
> - **结论：** 二次映射作为密码学原语并非固有安全；当变量数较少、素数域较小时，即使问题为NP完全，仍能被快速求解。

Rate This

Hello! This is the final part of a mini-series on cracking the signature algorithm in a smart card used by a major pay TV provider in the 1990s.

In [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) of this series, we did a quick crash course in writing equations and modular arithmetic.

In [part 2](https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/), we looked at the message signing algorithm in a particular pay TV smart card from the 1990s, exploring how the algorithm works, and expressing it both mathematically and with code, introducing the concepts of vectors, quadratic expansion, dot products and quadratic mappings.

In [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/), we wrote a brute-force search for the algorithm and exploited two different weaknesses in the signature verification algorithm to reduce the search space from approximately 2 64 to 2 48. We learned how to solve quadratic equations in a prime field with code, and how to pre-compute various mathematical information to increase the search speed further.

I won’t be going over the algorithms again here, so check out parts 2 and 3 first before reading on! I’ll assume you have read those and have a thorough understanding of everything in parts 1-3, and the problem we are trying to solve.

In this part, we will:

-   Perform a search in 2 32 that guarantees to find at least one valid signature
-   Look at the algorithm’s entropy to understand why a search of 1.75 x 2 45 finds all valid signatures for a particular message digest
-   Give a very brief overview of how to make our solution multi-threaded to make full use of the available computing power

The code examples in this part will be a mix of Python and Rust, although the vast majority of it is just variable assignment and for loops, nothing fancy, so it shouldn’t be too hard to pick up even if you’ve never worked with those languages before.

### The Plan

This is an overview of how we are going to reduce the search to 2 32, so that you know what we are working towards and why.

We start with the requirement to solve 8 quadratic equations with 8 unknown variables. This is our baseline for cracking a single signature.

We’ll still brute force s 4 − 7 s\_{4{-}7}, and we’ll still fix s 0 s_0 to 1 for a total of 251 4 (just under 2 32) potential searches, but this time, instead of just solving a single quadratic for s 3 s_3, we’ll solve for s 1 − 3 s\_{1{-}3}.

But.. Katy… you said that we had to reduce a quadratic to a single variable to solve it with the quadratic formula, and you’d be right about that, which is why we’re going to take a different approach (stay calm, I’ll explain each of these steps as we go!):

1.  Before starting the search, diagonalize the coefficients in the dot product tables
2.  Use Gaussian elimination to reduce the 8 quadratics in 8 unknowns to two linear equations in three unknowns s 1 − 3 s\_{1{-}3}
3.  Use Cramer’s rule to rewrite s 1 s_1 and s 2 s_2 in terms of s 3 s_3
4.  Factor the two linear equations to get linear coefficients and constants for s 1 s_1 and s 2 s_2 in a quadratic with three unknowns s 1 − 3 s\_{1{-}3}
5.  Substitute all uses of s 1 s_1 and s 2 s_2 in the quadratic with the re-written linear equations to reduce it to one unknown variable s 3 s_3
6.  Solve the quadratic with the quadratic formula
7.  Substitute the two roots for s 3 s_3 into the linear equations for s 1 s_1 and s 2 s_2
8.  Solve the linear equations for each root
9.  Now we have s 0 − 7 s\_{0{-}7} and have indirectly solved the first of the eight quadratic mappings, calculate the other 7 and test each byte against the quadratic mappings for the message digest

Clear as mud? Excellent.

Let’s elaborate a little. Solving a system of quadratic equations as required by the signature algorithm is very difficult, however solving a system of linear equations is quite manageable with one major criterion: you must have *at least as many linear equations as there are unknown variables*. This means if you have 8 variables, you need at least 8 linear equations to solve for them. Think about it:

a + b \= 5 a + b = 5

This is one equation with two unknowns. a a and b b could be 1 and 4, or 2 and 3, or 5 and 0 – we have no way to know. However, introduce a second equation and:

2 a + b \= 9 2a + b = 9

now there is no doubt that a a is 4 and b b is 1, because 4 + 1 \= 5 4 + 1 = 5 and 2 ⋅ 4 + 1 \= 9 2 \\cdot 4 + 1 = 9. Once we have 2 linear equations with 2 unknowns, we’re able to solve it.

If we could convert our quadratics into linear equations, we could solve them immediately and gain the ability to sign messages in real-time on demand. Unfortunately, if it were that easy, then it would also be just as easy to solve any system of quadratics! What we *can* do is produce a smaller amount of linear equations using a technique known as *Gaussian elimination*. Specifically, if we can construct a single quadratic in three unknowns – let’s say s 1 − 3 s\_{1{-}3}, we can use Gaussian elimination to convert it into two linear equations with three unknowns. We are able to do this if we fix five of the signature bytes, leaving just the three unknowns.

This is the reason that we end up with a 2 32 search: we try every possible value for four bytes s 4 − 7 s\_{4{-}7}, plus we have fixed one byte s 0 s_0 as the scale factor, leaving three unknowns s 1 − 3 s\_{1{-}3} (it doesn’t matter which bytes you use for what, as long as you’re consistent).

Solving two linear equations with three unknowns is not possible, but we still have the three variable quadratic over s 1 − 3 s\_{1{-}3} that we fed into the Gaussian elimination algorithm in the first place. Using another technique called *Cramer’s rule*, we can express two of the unknowns from the linear equations (let’s say s 1 s_1 and s 2 s_2) in terms of only the third unknown s 3 s_3. This basically means that we end up with two equations where the left hand side of each is one of the unknowns (one for s 1 s_1 and one for s 2 s_2), and the right-hand side is a gooey mess that uses only numbers and the third unknown s 3 s_3. We can then factor these equations, which is a fancy way of saying that we re-arrange them in a particular way that makes them more useful for the work we’re doing.

From the factored equations, we can extract the quadratic, linear and constant coefficients for the two unknowns we expressed in terms of the third one, which enables us to remove those two unknowns and their coefficients from the quadratic equation, and replace them with the re-calculated coefficients. This leaves us with a quadratic in a single unknown – s 3 s_3 – which we then solve using the quadratic formula.

There will be either zero or two solutions to the equation as discussed in [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/). If there are solutions, we can now solve the linear equations: we can replace s 3 s_3 in those equations with its numerical value, leaving us with two linear equations in two unknowns – a small solvable system. We proceed to do that to acquire s 1 s_1 and s 2 s_2, and at this point we have all 8 signature bytes, which we can test against the message digest’s quadratic mapping as before.

Let’s roll up our sleeves and get cracking then!

### Matrix row and column notation

Just before we kick off, we need to introduce one more piece of math notation (oh my goodness, another one?! When will the madness end). Until now we’ve mostly kept all of the dot product coefficients for each byte in their own column vectors. For this part, to make things less laborious to read and write, we will combine them into a single 8 x 36 matrix – that is, 8 rows and 36 columns, and each column vector (each dot product table) will become a row instead. For our 3-byte toy version where the quadratic expansion and each dot product table has 6 entries, we would have a 3 x 6 matrix:

𝐒 \= \[t 0 0 t 0 1 t 0 2 t 0 3 t 0 4 t 0 5 t 1 0 t 1 1 t 1 2 t 1 3 t 1 4 t 1 5 t 2 0 t 2 1 t 2 2 t 2 3 t 2 4 t 2 5\] \\mathbf{S} = \\begin{bmatrix}t\_{0_0} && t\_{0_1} && t\_{0_2} && t\_{0_3} && t\_{0_4} && t\_{0_5} \\\\ t\_{1_0} && t\_{1_1} && t\_{1_2} && t\_{1_3} && t\_{1_4} && t\_{1_5} \\\\ t\_{2_0} && t\_{2_1} && t\_{2_2} && t\_{2_3} && t\_{2_4} && t\_{2_5} \\end{bmatrix}

These are dot product tables for three equations: one row for each equation. Each row uses its own dot product table t 0 − t 2 t_0{-}t_2, because each row is the equation for a single byte. Recall that up until now, we have always written the equations like this:

q s 0 \= s 0 2 t 0 0 + s 0 s 1 t 0 1 + s 0 s 2 t 0 2 + s 1 2 t 0 3 + s 1 s 2 t 0 4 + s 2 2 t 0 5 q\_{s_0} = s_0^2t\_{0_0} + s_0s_1t\_{0_1} + s_0s_2t\_{0_2} + s_1^2t\_{0_3} + s_1s_2t\_{0_4} + s_2^2t\_{0_5}

Each term is one item from the quadratic expansion multiplied by the corresponding entry in the dot product table for the equation. Nothing new there.

Sometimes in this part, we may want to refer to an entire row or column at once – and we’re also going to be building some other, more sneaky matrices where this can help make things easier to read. Here is what you need to know:

-   M i,j M\_{i,j} – refers to a particular item in a matrix, row i i column j j
-   M i,:M\_{i,:} – refers to an entire row in a matrix, row i i
-   M:,j M\_{:,j} – refers to an entire column in a matrix, column j j

For example, let’s say we have this matrix:

𝐌 \= \[10 7 3 4 5 2 11 9 6 1 8 12\] \\mathbf{M} = \\begin{bmatrix} 10 & 7 & 3 & 4 \\\\ 5 & 2 & 11 & 9 \\\\ 6 & 1 & 8 & 12 \\end{bmatrix}

Each row and column is numbered starting from zero, eg. the top-left corner is M 0,0 M\_{0,0}. Then:

M 2,3 \= 12 M 1,:\= \[5,2,11,9\] M:,2 \= \[3 11 8\] o r M:,2 \= \[3,11,8\] T \\begin{align} M\_{2,3} = 12 \\\\ \\\\ M\_{1,:} = \[5, 2, 11, 9\] \\\\ \\\\ M\_{:,2} = \\begin{bmatrix}3 \\\\ 11 \\\\ 8\\end{bmatrix} \\\\ \\\\ or \\\\ \\\\ M\_{:,2} = \[3, 11, 8\]^T \\end{align}

*(the operator* T ^T *means simply to transpose a vector or matrix, so that all of its rows become columns and vice versa. You can read more about this in [part 2](https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/))*

Now, if we want to write all of the dot products for a particular equation, we can write S i,:S\_{i,:} instead of t i t_i (where t t is the byte – or equation – number), and if we want the first dot product coefficient for every equation, we can write S:,j S\_{:,j } (where j j is the index into the dot product table), which we didn’t have an easy way to represent before.

### Diagonalization

Diagonalization means transforming a column vector (like one of our dot product coefficient tables) to an *upper triangle matrix*. In plain English, it lets us use a nested array to access the dot product coefficients for a particular expansion term. In plain plain English, it means that instead of figuring out which array entry in the dot product table is the coefficient for multiplying for bytes 3 and 4, we can just write `dot_table[3][4]` instead. Amazing how mathematicians can over-complicate stuff, right?

The quadratic expansion for s 0 − 7 s\_{0{-}7} has 36 entries, but they are hard to find. If we want to find the coefficient for s 2 s 3 s_2s_3, we need to access `dot_product_table[16]` for example. Diagonalizing solves this problem. The code for this is much more straightforward than the explanation:

```rust
type DotProductTable = [u32; 36];
type Row = [u32; 8];

pub fn diagonalize(list: &DotProductTable) -> [Row; 8] {
    let mut triangle = [[0u32; 8]; 8];

    let mut index = 0;
    for row in 0..8 {
        for column in i..8 {
            triangle[row][column] = list[index];
            index += 1;
        }
    }
    triangle
}
```

The code above translates a 36-item array into an 8 x 8 array, but a 3-value version with a 6-item array would translate a list of coefficients like:

\[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] \\begin{bmatrix}s_0^2 \\\\ s_0s_1 \\\\ s_0s_2 \\\\ s_1^2 \\\\ s_1s_2 \\\\ s_2^2 \\end{bmatrix}

Into a 2D array like this:

\[s 0 2 s 0 s 1 s 0 s 2 0 s 1 2 s 1 s 2 0 0 s 2 2\] \\begin{bmatrix}s_0^2 && s_0s_1 && s_0s_2 \\\\ 0 && s_1^2 && s_1s_2 \\\\ 0 && 0 && s_2^2 \\end{bmatrix}

Then to index, say s 1 s 2 s_1s_2, we can use `dot_table[1][2]` instead of `dot_table[4]` and save ourselves a lot of headache trying to figure out array indices down the road. The reason it is called an *upper triangle matrix* is because – as you can see – only part of the array is filled, and forms a triangular shape.

### Loops in math

This section is about mathematical notation for summation loops. It is not directly related to, or necessary, for our work, but I hope that this makes the text more readable as we head into using the full 8-byte signature algorithm instead of the 3-byte toy example.

Writing all these long quadratic equations over and over becomes not only quite tiresome, but also difficult to read. Luckily, loops can be represented in math with *sigma notation*.

Sigma notation basically denotes a for loop where each item is added together. Consider this:

∑ i \= 1 5 i \\sum\_{i=1}^{5} i

Yikes, that looks scary! Actually, it’s a really simple for loop, where the starting value is 1, ending value is 5 and the item to sum each loop iteration is `i`:

```python
total = 0
for i in range(1, 6):
  total += i
```

In sigma notation, the line under the big sigma symbol gives the name of the loop index variable and its first value, the number at the top is the final value, and the math after the symbol shows what to add up.

Here is a slightly more complex one, using some letters too:

∑ i \= m n i 2 \\sum\_{i=m}^{n}i^2

What is going on here? We start the loop at `m`, end it at `n`, and add the current loop index squared to the total:

```python
total = 0
for i in range(m, n + 1):
  total += i * i
```

**WARNING**: Note that in sigma notation, the top value is *included* in the loop; this is the opposite of many programming languages and why we have used `6` and `n + 1` in the code examples here instead of `5` and `n`.

If we want to add the top row in the 3×4 matrix 𝐌 \\mathbf{M} above, we can write:

∑ i \= 0 3 M 0,i \\sum\_{i=0}^{3}M\_{0,i}

This is the same as:

M 0 0 + M 0 1 + M 0 2 + M 0 3 M\_{0_0} + M\_{0_1} + M\_{0_2} + M\_{0_3}

Sigma notation is perfect for the kind of multiply and add we repeat in our quadratic equations. Imagine in our toy 3-byte example that we want all of the quadratic terms, but not the cross-terms, and we have both the quadratic expansion and the dot product coefficients in two diagonalized matrices 𝐄 \\bf{E} and 𝐃 \\bf{D}. We can write:

∑ i \= 0 2 D i,i ⋅ E i,i \\sum\_{i=0}^{2}D\_{i,i} \\cdot E\_{i,i}

This is equivalent to:

D 0,0 ⋅ E 0,0 + D 1,1 ⋅ E 1,1 + D 2,2 ⋅ E 2,2 D\_{0,0} \\cdot E\_{0,0} + D\_{1,1} \\cdot E\_{1,1} + D\_{2,2} \\cdot E\_{2,2}

Given the way we have diagonalized the matrices, this is equivalent to:

D 0,0 ⋅ s 0 2 + D 1,1 ⋅ s 1 2 + D 2,2 ⋅ s 2 2 D\_{0,0} \\cdot s_0^2 + D\_{1,1} \\cdot s_1^2 + D\_{2,2} \\cdot s_2^2

#### Nested loops

Just like in code where you can put one `for` loop inside another, so in math notation you can put one sigma inside another. For example:

∑ i \= 2 4 ∑ j \= 1 3 i j \\sum\_{i=2}^{4} \\sum\_{j=1}^{3} ij

Is the same as:

```python
total = 0
for i in range(2, 4 + 1):
  for j in range(1, 3 + 1):
    total += i * j
```

Let’s take a look at how we can write a quadratic expansion in math notation. We already have the code from [part 2](https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/):

```python
def quadratic_expansion(input):
  expansion = []
  for i in range(len(input)):                  # 0,         1,      2
    for j in range(i, len(input)):             # 0, 1, 2,   1, 2,   2
      expansion.append(input[i] * input[j])
  return expansion
```

Looks suspiciously like a nested loop! If 𝐬 \\bf{s} is the input, and using the standard notation ‖ 𝐬 ‖ \\|\\mathbf{s}\\| to represent the length of the input (`len(input)`), then how about this:

∑ i \= 0 ‖ 𝐬 ‖ ∑ j \= i ‖ 𝐬 ‖ s i s j \\sum\_{i=0}^{\\|\\mathbf{s}\\|} \\sum\_{j=i}^{\\|\\mathbf{s}\\|} s_i s_j

Oops! This looks pretty good on first sight, but it doesn’t create a vector. It *adds* all of the expansion terms together, which is not what we want. However, we can *combine* the expansion and dot product multiplication into a single step by employing our diagonalized matrix:

∑ i \= 0 ‖ 𝐬 ‖ ∑ j \= i ‖ 𝐬 ‖ D i,j ⋅ s i s j \\sum\_{i=0}^{\\|\\mathbf{s}\\|} \\sum\_{j=i}^{\\|\\mathbf{s}\\|} D\_{i,j} \\cdot s_is_j

In our 3-byte toy example, this is equivalent to:

D 0,0 ⋅ s 0 2 + D 0,1 ⋅ s 0 s 1 + D 0,2 ⋅ s 0 s 2 + D 1,1 ⋅ s 1 2 + D 1,2 ⋅ s 1 s 2 + D 2,2 ⋅ s 2 2 D\_{0,0} \\cdot s_0^2 + D\_{0,1} \\cdot s_0s_1 + D\_{0,2} \\cdot s_0s_2 + D\_{1,1} \\cdot s_1^2 + D\_{1,2} \\cdot s_1s_2 + D\_{2,2} \\cdot s_2^2

Hopefully you will agree that the sigma version is much easier to understand!

Notice two things:

1.  Although this would be possible to express without diagonalizing, it would be much more complicated
2.  It generalizes to any input size: the expression is the same for both our 3-byte example and the full 8-byte algorithm

I’ll show the sigma versions of the equations as we work along, if you need some time to get used to them!

### Creating a quadratic with coefficients for three unknowns

In the previous part, we fixed s 0 s_0 and brute-forced s 1 − 2,s 4 − 7 s\_{1{-}2}, s\_{4{-}7} to allow us to solve a quadratic formula with a single unknown s 3 s_3. Now we have three unknowns, so calculating the coefficients is a bit more tricky. As mentioned in the overview, Gaussian elimination will let us reduce 8 quadratics in 3 unknowns to 2 linear equations in 3 unknowns, but in order to do that, we first need to reformulate all of the quadratic mapping equations to have 3 unknowns instead of 8. That means we need to calculate every quadratic, linear and constant coefficient for each quadratic mapping in terms of the three unknowns first.

Recall that we’re looking for s 1 − 3 s\_{1{-}3} and we know s 0 s_0 and s 4 − 7 s\_{4{-}7} We also placed the set of dot product tables (that is, the list of coefficients for the mappings) into 8 matrices – one for each table, which we have now diagonalized – let’s call the matrices 𝐃 𝟎 − 𝟕 \\bf{D\_{0{-}7}} (you can see the actual numbers in [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/) if you’re so inclined!).

We’d like to construct a quadratic equation in s 1 − 3 s\_{1{-}3} that we can solve and recover these three values. Since we know the other 5 variables, we can rewrite any of the equations that perform the quadratic mapping in terms of just the three we don’t know. Here is the first one:

D 0 1,1 ∙ s 1 2 + D 0 1,2 ∙ s 1 s 2 + D 0 1,3 ∙ s 1 s 3 + D 0 2,2 ∙ s 2 2 + D 0 2,3 ∙ s 2 s 3 + D 0 3,3 ∙ s 3 2 + b 1 ∙ s 1 + b 2 ∙ s 2 + b 3 ∙ s 3 + c \= 0 D\_{0\_{1,1}} \\bullet s_1^2 + D\_{0\_{1,2}} \\bullet s_1s_2 + D\_{0\_{1,3}} \\bullet s_1s_3 + D\_{0\_{2,2}} \\bullet s_2^2 + D\_{0\_{2,3}} \\bullet s_2s_3 + D\_{0\_{3,3}} \\bullet s_3^2 + b_1 \\bullet s_1 + b_2 \\bullet s_2 + b_3 \\bullet s_3 + c= 0

which, if you like, you can also write as (but this is purely optional if you find it hard to understand):

∑ i \= 1 3 ∑ j \= i 3 D 0 i,j s i s j + ∑ i \= 1 3 b i s i + c \= 0 \\sum\_{i=1}^{3}\\sum\_{j=i}^{3}D\_{0\_{i,j}}s_is_j + \\sum\_{i=1}^3b_is_i + c = 0

Wait wait hold the phone… what on Earth is *that*?! In the section “Coefficient calculation” in [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/), we talked about building quadratic equations in three parts: the quadratic terms, the cross-terms and the constant term. What we’ve done above is:

-   kept all of the six quadratic terms for s 1 − 3 s\_{1{-}3}
-   kept all of the three cross-terms that involve a single byte from s 1 − 3 s\_{1{-}3} plus one other signature byte not including s 1 − 3 s\_{1{-}3}, and used the fact we know s 0,s 4 − 7 s_0, s\_{4{-}7} to convert them into linear terms (eg. we can change the cross-term s 1 s 5 s_1s_5 into a linear term because we know s 5 s_5 so we can just replace it with a number)
-   created a constant term which is every coefficient of the quadratic mapping not used in any of the terms above (eg. we know what s 4 s 5 s_4s_5 is, so we just turn it into a number)

The quadratic part of the first equation is:

D 0 1,1 ∙ s 1 2 + D 0 1,2 ∙ s 1 s 2 + D 0 1,3 ∙ s 1 s 3 + D 0 2,2 ∙ s 2 2 + D 0 2,3 ∙ s 2 s 3 + D 0 3,3 ∙ s 3 2 D\_{0\_{1,1}} \\bullet s_1^2 + D\_{0\_{1,2}} \\bullet s_1s_2 + D\_{0\_{1,3}} \\bullet s_1s_3 + D\_{0\_{2,2}} \\bullet s_2^2 + D\_{0\_{2,3}} \\bullet s_2s_3 + D\_{0\_{3,3}} \\bullet s_3^2

or:

∑ i \= 1 3 ∑ j \= i 3 D 0 i,j ⋅ s i s j \\sum\_{i=1}^{3} \\sum\_{j=i}^{3} D\_{0\_{i,j}} \\cdot s_is_j

The cross-term part when converted to linear terms is:

b 1 ∙ s 1 + b 2 ∙ s 2 + b 3 ∙ s 3 b_1 \\bullet s_1 + b_2 \\bullet s_2 + b_3 \\bullet s_3

or:

∑ i \= 1 3 b i ⋅ s i \\sum\_{i=1}^{3} b_i \\cdot s_i

And the constant part is just c c.

We now need to find all of the coefficients so we can build a numerical version of the equation instead of just using letters.

The coefficients for the quadratic part are easy – we just grab them straight from 𝐃 𝟎 \\bf{D_0}.

How do we calculate the linear coefficients 𝐛 \\bf{b}?

We have to construct it in three parts, one for each unknown:

-   b 1 b_1 – all of the cross-terms using s 1 s_1 and any other signature byte except s 2 s_2 and s 3 s_3 (because those are covered in the quadratic terms)
-   b 2 b_2 – all of the cross-terms using s 2 s_2 and any other signature byte except s 1 s_1 and s 3 s_3
-   b 3 b_3 – all of the cross-terms using s 3 s_3 and any other signature byte except s 1 s_1 and s 2 s_2

Let’s take the linear term for b 2 ∙ s 2 b_2 \\bullet s_2 for example. We need to figure out what b 2 b_2 is. Let’s start by expanding it to show all of the parts:

b 2 ∙ s 2 \= D 0 0,2 ∙ s 0 s 2 + D 0 2,4 ∙ s 2 s 4 + D 0 2,5 ∙ s 2 s 5 + D 0 2,6 ∙ s 2 s 6 + D 0 2,7 ∙ s 2 s 7 b_2 \\bullet s_2 = D\_{0\_{0,2}} \\bullet s_0s_2 + D\_{0\_{2,4}} \\bullet s_2s_4 + D\_{0\_{2,5}} \\bullet s_2s_5 + D\_{0\_{2,6}} \\bullet s_2s_6 + D\_{0\_{2,7}} \\bullet s_2s_7

or:

b 2 ⋅ s 2 \= D 0 0,2 ⋅ s 0 s 2 + ∑ i \= 4 7 D 0 2,i ⋅ s 2 s i b_2 \\cdot s_2 = D\_{0\_{0,2}} \\cdot s_0s_2 + \\sum\_{i=4}^{7} D\_{0\_{2,i}} \\cdot s_2s_i

This is every cross-term that *does* refer to s 2 s_2 but *does not* refer to s 1 s_1 or s 3 s_3. Every term in this equation is multiplied by s 2 s_2, so we can factor it easily:

b 2 ∙ s 2 \= s 2 (D 0 0,2 ∙ s 0 + D 0 2,4 ∙ s 4 + D 0 2,5 ∙ s 5 + D 0 2,6 ∙ s 6 + D 0 2,7 ∙ s 7) b_2 \\bullet s_2 = s_2(D\_{0\_{0,2}} \\bullet s_0 + D\_{0\_{2,4}} \\bullet s_4 + D\_{0\_{2,5}} \\bullet s_5 + D\_{0\_{2,6}} \\bullet s_6 + D\_{0\_{2,7}} \\bullet s_7)

or:

b 2 ⋅ s 2 \= s 2 (D 0 0,2 ⋅ s 0 + ∑ i \= 4 7 D 0 2,i ⋅ s i) b_2 \\cdot s_2 = s_2(D\_{0\_{0,2}} \\cdot s_0 + \\sum\_{i=4}^{7} D\_{0\_{2,i}} \\cdot s_i)

and then divide both sides by s 2 s_2:

b 2 \= D 0 0,2 ∙ s 0 + D 0 2,4 ∙ s 4 + D 0 2,5 ∙ s 5 + D 0 2,6 ∙ s 6 + D 0 2,7 ∙ s 7 b_2 = D\_{0\_{0,2}} \\bullet s_0 + D\_{0\_{2,4}} \\bullet s_4 + D\_{0\_{2,5}} \\bullet s_5 + D\_{0\_{2,6}} \\bullet s_6 + D\_{0\_{2,7}} \\bullet s_7

or:

b 2 \= D 0 0,2 ⋅ s 0 + ∑ i \= 4 7 D 0 2,i ⋅ s i b_2 = D\_{0\_{0,2}} \\cdot s_0 + \\sum\_{i=4}^{7} D\_{0\_{2,i}} \\cdot s_i

We know all of these values, so we can turn b 2 b_2 into a single number and insert it into the quadratic formula! We repeat this for b 1 b_1 and b 3 b_3 to fill in the coefficients for every cross-term.

Finally we turn to the constant term c c. This is everything that’s left over. There are no unknowns involved, so we can just add up all the coefficients we haven’t used yet from 𝐃 𝟎 \\bf{D_0}, remember to subtract the message digest mapping byte value we’re looking for so that the right hand side of the equation equals zero, and we’re golden:

c \= { ∑ i \= 4 7 ∑ j \= i 7 D 0 i,j ⋅ s i s j } − q d 0 c = \\left\\{ \\sum\_{i=4}^{7} \\sum\_{j=i}^{7} D\_{0\_{i,j}} \\cdot s_is_j \\right\\} – q\_{d_0}

What we’re left with is 10 coefficients – 6 quadratic coefficients straight from 𝐃 𝟎 \\bf{D_0}, three linear coefficients b 1 − 3 b\_{1{-}3} that we have calculated, and the constant coefficient c c which we have also calculated. This gives us a quadratic equation with 10 terms and 3 unknowns.

We now repeat this for the other 7 equations and build an 8×10 matrix with all of the coefficients:

\[D 0 1,1 D 0 2,2 D 0 3,3 D 0 1,2 D 0 1,3 D 0 2,3 b 1 0 b 2 0 b 3 0 c 0 D 1 1,1 D 1 2,2 D 1 3,3 D 1 1,2 D 1 1,3 D 1 2,3 b 1 1 b 2 1 b 3 1 c 1 ⋯ D 7 1,1 D 7 2,2 D 7 3,3 D 7 1,2 D 7 1,3 D 7 2,3 b 1 7 b 2 7 b 3 7 c 7\] \\begin{bmatrix} D\_{0\_{1,1}} && D\_{0\_{2,2}} && D\_{0\_{3,3}} && D\_{0\_{1,2}} && D\_{0\_{1,3}} && D\_{0\_{2,3}} && b\_{1_0} && b\_{2_0} && b\_{3_0} && c_0 \\\\ D\_{1\_{1,1}} && D\_{1\_{2,2}} && D\_{1\_{3,3}} && D\_{1\_{1,2}} && D\_{1\_{1,3}} && D\_{1\_{2,3}} && b\_{1_1} && b\_{2_1} && b\_{3_1} && c_1 \\\\ \\\\ \\cdots \\\\ D\_{7\_{1,1}} && D\_{7\_{2,2}} && D\_{7\_{3,3}} && D\_{7\_{1,2}} && D\_{7\_{1,3}} && D\_{7\_{2,3}} && b\_{1_7} && b\_{2_7} && b\_{3_7} && c_7 \\\\ \\end{bmatrix}

(where with b 3 1 b\_{3_1} we mean b 3 b_3 for equation 1, and with c 1 c_1 we mean c c for equation 1 etc.)

This matrix will form the basis of our Gaussian elimination step.

It’s quite possible you just skipped all that because your eyes glazed over, so here is the code to produce the entire matrix in `coeffs`, using diagonalized `dot_tables` where `e` is the equation number. Hopefully it helps:

```rust
// Put all 8 quadratic equations with all 10 coefficients into a matrix
// Six quadratic terms, three linear terms and a constant
// D11 v1^2 + D22 v2^2 + D33 v3^2 + D12 v1v2 + D13 v1v3 + D23 v2v3 + b1 v1 + b2 v2 + b2 v3 + c
let mut coeffs = [[0u32; 10]; 8];

// 8 equations, 36 terms total per equation
for e in 0..8 {
    // quadratic terms in v1-v3
    coeffs[e][0] = dot_tables[e][1][1]; // v1^2
    coeffs[e][1] = dot_tables[e][2][2]; // v2^2
    coeffs[e][2] = dot_tables[e][3][3]; // v3^2
    coeffs[e][3] = dot_tables[e][1][2]; // v1 * v2
    coeffs[e][4] = dot_tables[e][1][3]; // v1 * v3
    coeffs[e][5] = dot_tables[e][2][3]; // v2 * v3
  
    // b1 - everything linear involving v1 but not v2 or v3
    coeffs[e][6] = dot_tables[e][0][1] * v0
        + dot_tables[e][1][4] * v4
        + dot_tables[e][1][5] * v5
        + dot_tables[e][1][6] * v6
        + dot_tables[e][1][7] * v7;
  
    // b2 - everything linear involving v2 but not v1 or v3
    coeffs[e][7] = dot_tables[e][0][2] * v0
        + dot_tables[e][2][4] * v4
        + dot_tables[e][2][5] * v5
        + dot_tables[e][2][6] * v6
        + dot_tables[e][2][7] * v7;
  
    // b3 - everything linear involving v3 but not v1 or v2
    coeffs[e][8] = dot_tables[e][0][3] * v0
        + dot_tables[e][3][4] * v4
        + dot_tables[e][3][5] * v5
        + dot_tables[e][3][6] * v6
        + dot_tables[e][3][7] * v7;
  
    // c - everything not involving v1, v2 or v3
    coeffs[e][9] = dot_tables[e][0][0] * v0 * v0
        + dot_tables[e][0][4] * v0 * v4
        + dot_tables[e][0][5] * v0 * v5
        + dot_tables[e][0][6] * v0 * v6
        + dot_tables[e][0][7] * v0 * v7
        + dot_tables[e][4][4] * v4 * v4
        + dot_tables[e][4][5] * v4 * v5
        + dot_tables[e][4][6] * v4 * v6
        + dot_tables[e][4][7] * v4 * v7
        + dot_tables[e][5][5] * v5 * v5
        + dot_tables[e][5][6] * v5 * v6
        + dot_tables[e][5][7] * v5 * v7
        + dot_tables[e][6][6] * v6 * v6
        + dot_tables[e][6][7] * v6 * v7
        + dot_tables[e][7][7] * v7 * v7;

    // So that ax^2 + bx + c = 0 instead of ax^2 + bx + c = target
    // because the quadratic solver expects the answer to be zero
    coeffs[e][9] =
        (coeffs[e][9] as i32 - target[e] as i32).rem_euclid(P as i32) as u32;

    // Make sure everything is mod 251
    for j in 0..9 {
        coeffs[e][j] %= P;
    }
}
```

Notice that working through the mathematical reasoning was essential before writing any code – it would be a hopeless task to figure this out without considering the algorithm first.

### Gaussian elimination

Gaussian elimination is a technique that converts systems of equations into a form that is easier to solve. Ostensibly, the technique is intended to solve systems of linear equations, but we are going to bastardize it here by using the quadratic mapping coefficient matrix we just made and temporarily “pretend” the variables are all linear.

Let’s call the matrix we created in the last section 𝐆 \\bf{G} – the Gaussian input matrix. The algorithm works as follows:

-   We start at column c \= 0 c=0, row r \= 0 r=0
-   We fetch G r,c G\_{r,c} and divide everything in the same row G r,:G\_{r,:} by it (normalize the row)
-   For each row r n e x t r\_{next} under the current row:
    -   Let a multiplication factor f r n e x t \= G r n e x t,r f\_{r\_{next}} = G\_{{r\_{next}},r}
    -   We subtract everything in the same row by f r n e x t ⋅ G r,:f\_{r\_{next}} \\cdot G\_{r,:}
-   Increment both r r and c c

What you end up with is an upper triangle matrix where the bottom row contains one linear equation coefficient, the row above has two and so on – or, if there are no solutions, zeroes.

Let’s work through an example because most of what I found on the internet was over-complicated. Let’s start with a simple 4 x 4 matrix, representing a set of four linear equations with unknowns x 1 − 4 x\_{1{-}4}:

𝐆 \= \[1 2 3 4 2 3 1 2 3 1 2 3 1 1 1 1\] \\mathbf{G} = \\begin{bmatrix} 1 && 2 && 3 && 4 \\\\ 2 && 3 && 1 && 2 \\\\ 3 && 1 && 2 && 3 \\\\ 1 && 1 && 1 && 1 \\end{bmatrix}

Normalize first row:

G 0,:→ G 0,:G 0,0 \= \[1 2 3 4\] 1 \= \[1 2 3 4\] G\_{0,:} \\to \\frac{G\_{0,:}}{G\_{0,0}} = \\frac{\\begin{bmatrix}1 && 2 && 3 && 4 \\end{bmatrix}}{1} = \\begin{bmatrix}1 && 2 && 3 && 4 \\end{bmatrix}

Get multiplication factor for second row:

f 1 \= G 1,0 \= 2 f_1 = G\_{1,0} = 2

Subtract first row multiplied by factor from second row:

G 1,:→ G 1,:− f 1 ⋅ G 0,:\= \[2 − 2 ∗ 1 3 − 2 ∗ 2 1 − 2 ∗ 3 2 − 2 ∗ 4\] \= \[0 − 1 − 5 − 6\] G\_{1,:} \\to G\_{1,:} – f_1 \\cdot G\_{0,:} = \\begin{bmatrix}2 – 2*1 && 3-2*2 && 1-2*3 && 2-2*4\\end{bmatrix} = \\begin{bmatrix} 0 && -1 && -5 && -6\\end{bmatrix}

Repeat for the other two rows:

G 2,:→ G 2,:− f 2 ⋅ G 0,:\= \[3 − 3 ∗ 1 1 − 3 ∗ 2 2 − 3 ∗ 3 3 − 3 ∗ 4\] \= \[0 − 5 − 7 − 9\] G\_{2,:} \\to G\_{2,:} – f_2 \\cdot G\_{0,:} = \\begin{bmatrix}3 – 3*1 && 1-3*2 && 2-3*3 && 3-3*4\\end{bmatrix} = \\begin{bmatrix} 0 && -5 && -7 && -9\\end{bmatrix} G 3,:→ G 3,:− f 3 ⋅ G 0,:\= \[1 − 1 ∗ 1 1 − 1 ∗ 2 1 − 1 ∗ 3 1 − 1 ∗ 4\] \= \[0 − 1 − 2 − 3\] G\_{3,:} \\to G\_{3,:} – f_3 \\cdot G\_{0,:} = \\begin{bmatrix}1 – 1*1 && 1-1*2 && 1-1*3 && 1-1*4\\end{bmatrix} = \\begin{bmatrix} 0 && -1 && -2 && -3\\end{bmatrix}

The matrix now looks like this:

𝐆 \= \[1 2 3 4 0 − 1 − 5 − 6 0 − 5 − 7 − 9 0 − 1 − 2 − 3\] \\mathbf{G} = \\begin{bmatrix} 1 && 2 && 3 && 4 \\\\ 0 && -1 && -5 && -6 \\\\ 0 && -5 && -7 && -9 \\\\ 0 && -1 && -2 && -3 \\end{bmatrix}

Notice how the left-hand column has become zero.

For the second round, we’ll start at G 1,1 G\_{1,1}:

G 1,:\= G 1,:G 1,1 \= \[0 − 1 − 5 − 6\] − 1 \= \[0 1 5 6\] G\_{1,:} = \\frac{G\_{1,:}}{G\_{1,1}} = \\frac{\\begin{bmatrix}0 && -1 && -5 && -6 \\end{bmatrix}}{-1} = \\begin{bmatrix}0 && 1 && 5 && 6 \\end{bmatrix}

This time the multiplication factors come from the second column and the row to subtract is the second row:

f 2 \= G 2,1 \= − 5 G 2,:→ G 2,:− f 2 ⋅ G 1,:\= \[0 − 5 − 7 − 9\] + 5 \[0 1 5 6\] \= \[0 0 18 21\] \\begin{align} f_2 = G\_{2,1} = -5 \\\\ \\\\ G\_{2,:} \\to G\_{2,:} – f_2 \\cdot G\_{1,:} = \\begin{bmatrix} 0 && -5 && -7 && -9 \\end{bmatrix} + 5 \\begin{bmatrix}0 && 1 && 5 && 6\\end{bmatrix} = \\begin{bmatrix}0 && 0 && 18 && 21 \\end{bmatrix} \\end{align} f 3 \= G 3,1 \= − 1 G 3,:→ G 3,:− f 3 ⋅ G 1,:\= \[0 − 1 − 2 − 3\] + \[0 1 5 6\] \= \[0 0 3 3\] \\begin{align} f_3 = G\_{3,1} = -1 \\\\ \\\\ G\_{3,:} \\to G\_{3,:} – f_3 \\cdot G\_{1,:} = \\begin{bmatrix} 0 && -1 && -2 && -3 \\end{bmatrix} + \\begin{bmatrix}0 && 1 && 5 && 6\\end{bmatrix} = \\begin{bmatrix}0 && 0 && 3 && 3\\end{bmatrix} \\end{align}

The matrix now looks like this:

𝐆 \= \[1 2 3 4 0 1 5 6 0 0 18 21 0 0 3 3\] \\mathbf{G} = \\begin{bmatrix} 1 && 2 && 3 && 4 \\\\ 0 && 1 && 5 && 6 \\\\ 0 && 0 && 18 && 21 \\\\ 0 && 0 && 3 && 3 \\end{bmatrix}

Now we move along to G 2,2 G\_{2,2} and continue in the same way:

G 2,:\= G 2,:G 2,2 \= \[0 0 18 21\] 18 \= \[0 0 1 7 6\] G\_{2,:} = \\frac{G\_{2,:}}{G\_{2,2}} = \\frac{\\begin{bmatrix}0 && 0 && 18 && 21 \\end{bmatrix}}{18} = \\begin{bmatrix}0 && 0 && 1 && \\frac{7}{6} \\end{bmatrix} f 3 \= G 3,2 \= 3 G 3,:→ G 3,:− f 3 ⋅ G 2,:\= \[0 0 3 3\] − 3 \[0 0 1 7 6\] \= \[0 0 0 − 1 2\] \\begin{align} f_3 = G\_{3,2} = 3 \\\\ \\\\ G\_{3,:} \\to G\_{3,:} – f_3 \\cdot G\_{2,:} = \\begin{bmatrix} 0 && 0 && 3 && 3\\end{bmatrix} -3 \\begin{bmatrix}0 && 0 && 1 && \\frac{7}{6} \\end{bmatrix} = \\begin{bmatrix}0 && 0 && 0 && – \\frac{1}{2}\\end{bmatrix} \\end{align}

Nearly there! The matrix now looks like this:

𝐆 \= \[1 2 3 4 0 1 5 6 0 0 1 7 6 0 0 0 − 1 2\] \\mathbf{G} = \\begin{bmatrix} 1 && 2 && 3 && 4 \\\\ 0 && 1 && 5 && 6 \\\\ 0 && 0 && 1 && \\frac{7}{6} \\\\ 0 && 0 && 0 && -\\frac{1}{2} \\\\ \\end{bmatrix}

For the last row, we normalize it as before, using G 3,3 G\_{3,3} as the divisor, ultimately just dividing the bottom-right cell by itself, leaving us with:

𝐆 \= \[1 2 3 4 0 1 5 6 0 0 1 7 6 0 0 0 1\] \\mathbf{G} = \\begin{bmatrix} 1 && 2 && 3 && 4 \\\\ 0 && 1 && 5 && 6 \\\\ 0 && 0 && 1 && \\frac{7}{6} \\\\ 0 && 0 && 0 && 1 \\end{bmatrix}

As you can see we now have an upper triangle matrix of coefficients. This method is called *forward elimination*.

Sometimes, the cell you use to normalize might be a zero, in which case you have a problem because you can’t divide by zero. Gaussian elimination has a simple solution to this: just swap it with a row that’s non-zero! This makes absolutely no difference whatsoever to the results; it simply causes the equations to be processed in a different order.

Here is the complete code in Python in 𝔽 251 \\mathbb{F}\_{251} using `numpy` and `galois`, including row swapping:

```python
import numpy as np
import galois

GF = galois.GF(251)

A = GF(
    [
        [15, 135, 13, 110, 188, 3, 121, 247, 199, 79],
        [120, 194, 26, 10, 103, 97, 167, 155, 212, 97],
        [142, 106, 231, 77, 113, 123, 61, 164, 84, 13],
        [162, 186, 163, 135, 23, 219, 191, 82, 104, 157],
        [244, 153, 55, 184, 73, 137, 73, 26, 221, 35],
        [145, 138, 5, 3, 167, 148, 201, 68, 28, 41],
        [94, 205, 185, 46, 162, 148, 129, 97, 196, 242],
        [246, 60, 176, 50, 232, 238, 27, 104, 114, 125],
    ]
)

rows, cols = A.shape

pivot_row = 0

for pivot_col in range(cols):
    if pivot_row >= rows:
        break

    # Find non-zero pivot
    nonzero = np.where(A[pivot_row:, pivot_col] != 0)[0]
    if len(nonzero) == 0:
        continue

    pivot = nonzero[0] + pivot_row

    # Swap rows
    if pivot != pivot_row:
        A[[pivot_row, pivot]] = A[[pivot, pivot_row]]
        print(f"\nSwap row {pivot_row} <-> {pivot}")
        print(A)

    # Normalize pivot row
    inv = A[pivot_row, pivot_col] ** -1
    print(f"\nNormalizing {inv} {pivot_row} {pivot_col} {A[pivot_row, pivot_col]}")
    A[pivot_row] *= inv

    print(f"\nNormalize row {pivot_row}")
    print(A)

    # Eliminate below
    for r in range(pivot_row + 1, rows):
        factor = A[r, pivot_col]
        if factor != 0:
            A[r] -= factor * A[pivot_row]
            print(factor)
            print(f"\nEliminate row {r}")
            print(A)

    pivot_row += 1

print(A)
```

#### Gaussian elimination in our hack

We’ll make an 8 x 10 matrix that we load up with the quadratic, linear and constant coefficients for each of the 8 equations. The matrix looks like this:

\[D 0 1,1 D 0 2,2 D 0 3,3 D 0 1,2 D 0 1,3 D 0 2,3 b 1 0 b 2 0 b 3 0 c 0 D 1 1,1 D 1 2,2 D 1 3,3 D 1 1,2 D 1 1,3 D 1 2,3 b 1 1 b 2 1 b 3 1 c 1 ⋯ D 7 1,1 D 7 2,2 D 7 3,3 D 7 1,2 D 7 1,3 D 7 2,3 b 1 7 b 2 7 b 3 7 c 7\] \\begin{bmatrix} D\_{0\_{1,1}} && D\_{0\_{2,2}} && D\_{0\_{3,3}} && D\_{0\_{1,2}} && D\_{0\_{1,3}} && D\_{0\_{2,3}} && b\_{1_0} && b\_{2_0} && b\_{3_0} && c_0 \\\\ D\_{1\_{1,1}} && D\_{1\_{2,2}} && D\_{1\_{3,3}} && D\_{1\_{1,2}} && D\_{1\_{1,3}} && D\_{1\_{2,3}} && b\_{1_1} && b\_{2_1} && b\_{3_1} && c_1 \\\\ \\\\ \\cdots \\\\ D\_{7\_{1,1}} && D\_{7\_{2,2}} && D\_{7\_{3,3}} && D\_{7\_{1,2}} && D\_{7\_{1,3}} && D\_{7\_{2,3}} && b\_{1_7} && b\_{2_7} && b\_{3_7} && c_7 \\\\ \\end{bmatrix}

We want to get rid of the quadratic terms – the leftmost six items in each row, so we perform 6 rounds of forward elimination. This will give us a matrix that looks like this:

\[1 ∗ ∗ ∗ ∗ ∗ ∗ ∗ ∗ ∗ 0 1 ∗ ∗ ∗ ∗ ∗ ∗ ∗ ∗ 0 0 1 ∗ ∗ ∗ ∗ ∗ ∗ ∗ 0 0 0 1 ∗ ∗ ∗ ∗ ∗ ∗ 0 0 0 0 1 ∗ ∗ ∗ ∗ ∗ 0 0 0 0 0 1 ∗ ∗ ∗ ∗ 0 0 0 0 0 0 x 1 x 2 x 3 z 1 0 0 0 0 0 0 y 1 y 2 y 3 z 2\] \\begin{bmatrix} 1 && \* && \* && \* && \* && \* && \* && \* && \* && \* \\\\ 0 && 1 && \* && \* && \* && \* && \* && \* && \* && \* \\\\ 0 && 0 && 1 && \* && \* && \* && \* && \* && \* && \* \\\\ 0 && 0 && 0 && 1 && \* && \* && \* && \* && \* && \* \\\\ 0 && 0 && 0 && 0 && 1 && \* && \* && \* && \* && \* \\\\ 0 && 0 && 0 && 0 && 0 && 1 && \* && \* && \* && \* \\\\ 0 && 0 && 0 && 0 && 0 && 0 && x_1 && x_2 && x_3 && z_1 \\\\ 0 && 0 && 0 && 0 && 0 && 0 && y_1 && y_2 && y_3 && z_2 \\end{bmatrix}

With all the quadratic terms gone and only the linear terms remaining, we can extract the coefficients from the matrix and make two new linear equations:

x 1 s 1 + x 2 s 2 + x 3 s 3 + z 1 \= 0 y 1 s 1 + y 2 s 2 + y 3 s 3 + z 2 \= 0 \\begin{align} x_1s_1 + x_2s_2 + x_3s_3 + z_1 = 0 \\\\ \\\\ y_1s_1 + y_2s_2 + y_3s_3 + z_2 = 0 \\end{align}

Nice! We have reduced the system of 8 quadratics in three unknowns to 2 linear equations in three unknowns. Not bad!

See the [Wikipedia page on Gaussian elimination](https://en.wikipedia.org/wiki/Gaussian_elimination) for more information.

### Cramer’s rule

Cramer’s rule is a formula for solving systems of linear equations. The [Wikipedia page on Cramer’s rule](https://en.wikipedia.org/wiki/Cramer%27s_rule) goes into great detail about its various forms and applications, but for the purposes of our work here, this is a simplified version, which is what we need to know:

d \= x 1 y 2 − x 2 y 1 s 1 \= r h s 1 ⋅ y 2 − r h s 2 ⋅ x 2 d s 2 \= r h s 2 ⋅ x 1 − r h s 1 ⋅ y 1 d \\begin{align} d = x_1y_2 – x_2y_1 \\\\ \\\\ s_1 = \\frac{rhs_1 \\cdot y_2 – rhs_2 \\cdot x_2}{d} \\\\ \\\\ s_2 = \\frac{rhs_2 \\cdot x_1 – rhs_1 \\cdot y_1}{d} \\end{align}

By r h s rhs, what we mean is the right-hand side of the two linear equations we just extracted, when they are re-arranged such that only s 1 s_1 and s 2 s_2 appear on the left, and that only s 3 s_3 and constants appear on the right. This is easy – we just subtract the terms with s 3 s_3 and z z from both sides:

x 1 s 1 + x 2 s 2 \= − x 3 s 3 − z 1 y 1 s 1 + y 2 s 2 \= − y 3 s 3 − z 2 \\begin{align} x_1s_1 + x_2s_2 = -x_3s_3 – z_1 \\\\ \\\\ y_1s_1 + y_2s_2 = -y_3s_3 -z_2 \\end{align}

So:

r h s 1 \= − x 3 s 3 − z 1 r h s 2 \= − y 3 s 3 − z 2 \\begin{align} rhs_1 = -x_3s_3 – z_1 \\\\ \\\\ rhs_2 = -y_3s_3 – z_2 \\end{align}

Now we can plug these values into Cramer’s rule:

s 1 \= (− x 3 s 3 − z 1) ⋅ y 2 − (− y 3 s 3 − z 2) ⋅ x 2 d s 2 \= (− y 3 s 3 − z 2) ⋅ x 1 − (− x 3 s 3 − z 1) ⋅ y 1 d \\begin{align} s_1 = \\frac{(-x_3s_3 -z_1) \\cdot y_2 – (-y_3s_3-z_2) \\cdot x_2}{d} \\\\ \\\\ s_2 = \\frac{(-y_3s_3-z_2) \\cdot x_1 – (-x_3s_3 -z_1) \\cdot y_1}{d} \\end{align}

By some kind of miracle, we have now managed to express s 1 s_1 and s 2 s_2 in terms of s 3 s_3 – and remember, we know every other value here so they can be replaced by numbers.

Just in case you forgot, we’re hacking a pay TV smart card.

#### Simplifying the output

We need to extract coefficients and constants for s 1 s_1 and s 2 s_2 from the linear equations. Although it’s not necessary in code, let’s re-arrange them to make those clear (also, reducing the amount of math in the hot loop is good):

s 1 \= (− x 3 s 3 − z 1) ⋅ y 2 − (− y 3 s 3 − z 2) ⋅ x 2 d \\begin{align} s_1 = \\frac{(-x_3s_3 -z_1) \\cdot y_2 – (-y_3s_3-z_2) \\cdot x_2}{d} \\end{align}

Expand x 2 x_2 and y 2 y_2:

s 1 \= (− x 3 s 3 y 2 − z 1 y 2) − (x 2 ⋅ − y 3 s 3 + x 2 z 2) d \\\\ \\\\ s_1 = \\frac{(-x_3s_3y_2 – z_1y_2) – (x_2 \\cdot -y_3s_3 + x_2z_2)}{d}

Partially factor s 3 s_3 and move constant terms to the end:

s 1 \= s 3 (− x 3 y 2) − s 3 (x 2 ⋅ − y 3) − z 1 y 2 + x 2 z 2 d \\\\ \\\\ s_1 = \\frac{s_3(-x_3y_2) – s_3(x_2 \\cdot -y_3) – z_1y_2 + x_2z_2}{d}

Factor s 3 s_3:

s 1 \= s 3 (x 2 y 3 − x 3 y 2) − z 1 y 2 + x 2 z 2 d \\\\ \\\\ s_1 = \\frac{s_3(x_2y_3-x_3y_2) -z_1y_2 + x_2z_2}{d}

Now we have expressed s 1 s_1 purely in terms of linear and constant coefficients in s 3 s_3!

The linear coefficient is therefore the first part of he equation divided by s 3 s_3:

b s 1 \= x 2 y 3 − x 3 y 2 d b\_{s_1} = \\frac{x_2y_3-x_3y_2}{d}

The constant is the second half of the equation:

c s 1 \= x 2 z 2 − z 1 y 2 d c\_{s_1} = \\frac{x_2z_2 – z_1y_2}{d}

You can repeat this exercise with s 2 s_2 and find similar results:

b s 2 \= x 3 y 1 − x 1 y 3 d b\_{s_2} = \\frac{x_3y_1-x_1y_3}{d} c s 2 \= y 1 z 1 − x 1 z 2 d c\_{s_2} = \\frac{y_1z_1-x_1z_2}{d}

So, we arrive at the apex of our climb:

s 1 \= b s 1 s 3 + c s 1 s 2 \= b s 2 s 3 + c s 2 \\begin{align} s_1 = b\_{s_1} s_3 + c\_{s_1} \\\\ \\\\ s_2 = b\_{s_2} s_3 + c\_{s_2} \\end{align}

There is one small kink with this otherwise brilliant plan. What happens if the so-called determinant d d is zero? That indeed would be a conundrum, because we can’t divide by zero. This leads us into a quagmire of edge cases that I’ll leave you to the depths of the internet to explore (not too deep please). Mercifully, after a great deal of testing, I’m happy to report that although there are some zero determinants in this particular brute-force search, it has had no (meaningful?) impact on the ability to recover signatures.

The code for Cramer’s rule and the calculation of the linear and constant coefficients looks like this:

```python
# Get linear terms from the bottom two rows of the Guassian matrix
x1, x2, x3, z1 = coeffs[6][6:10]
y1, y2, y3, z3 = coeffs[7][6:10]

# Calculate determinant; skip zero determinants for this example
d = ((x1 * y2) - (x2 * y1)) % P
if d == 0:
  continue

# Calculate the linear and constant coefficients of s1 and s2
# in terms of s3
bs1 = ((x2 * y3) - (x3 * y2)) % P
cs1 = ((x2 * z2) - (z1 * y2)) % P

bs2 = ((x3 * y1) - (x1 * y3)) % P
cs2 = ((y1 * z1) - (x1 * z2)) % P

bs1 = div_mod(bs1, d)
bs2 = div_mod(bs2, d)

cs1 = div_mod(cs1, d)
cs2 = div_mod(cs2, d)
```

### Building the new single-variable quadratic

We now come to building the quadratic in the single variable s 3 s_3. As per usual we’re going to just use the first equation of the 8 quadratic mappings since it has no bearing on the outcome.

Let’s recap the equation we’d like to solve to get our hands on s 3 s_3:

D 0 1,1 ∙ s 1 2 + D 0 1,2 ∙ s 1 s 2 + D 0 1,3 ∙ s 1 s 3 + D 0 2,2 ∙ s 2 2 + D 0 2,3 ∙ s 2 s 3 + D 0 3,3 ∙ s 3 2 + b 1 ∙ s 1 + b 2 ∙ s 2 + b 3 ∙ s 3 + c \= 0 D\_{0\_{1,1}} \\bullet s_1^2 + D\_{0\_{1,2}} \\bullet s_1s_2 + D\_{0\_{1,3}} \\bullet s_1s_3 + D\_{0\_{2,2}} \\bullet s_2^2 + D\_{0\_{2,3}} \\bullet s_2s_3 + D\_{0\_{3,3}} \\bullet s_3^2 + b_1 \\bullet s_1 + b_2 \\bullet s_2 + b_3 \\bullet s_3 + c= 0

and the equations we just derived:

s 1 \= b s 1 s 3 + c s 1 s 2 \= b s 2 s 3 + c s 2 \\begin{align} s_1 = b\_{s_1} s_3 + c\_{s_1} \\\\ \\\\ s_2 = b\_{s_2} s_3 + c\_{s_2} \\end{align}

Also remember the basic quadratic form that we need to ultimately build in order to solve s 3 s_3:

a 2 + b x + c \= 0 a^2 + bx + c = 0

What we need to do is build a new quadratic equation that doesn’t include s 1 s_1 or s 2 s_2 at all. This essentially just means replacing all instances of s 1 s_1 and s 2 s_2 with the derived linear equations, however just doing this verbatim creates a mathematical visual riot with so many terms that it becomes hard to figure out what a a, b b and c c actually are – so we’ll build it step by step from scratch instead.

Don’t mix up your b b ‘s and c c ‘s! Let’s be clear:

-   b s 1,c s 1,b s 2 b\_{s_1}, c\_{s_1}, b\_{s_2} and c s 2 c\_{s_2} are the linear and constant coefficients for the equations in s 1 s_1 and s 2 s_2 that we derived above
-   b 1 − 3 b\_{1{-}3} are the linear coefficients in the equation we want to solve
-   c c is the constant coefficient in the equation we want to solve

To re-build the equation, for each term in the existing one, we need to assess its *contribution* towards the coefficients for s 3 s_3 and decompose it into quadratic, linear and constant coefficients so we can add them all together.

#### Decomposing the quadratic terms

Let’s work through the first term as an example. We start with:

D 0 1,1 ⋅ s 1 2 D\_{0\_{1,1}} \\cdot s_1^2

When we substitute s 1 s_1 with the equation we derived for it, we get:

D 0 1,1 ⋅ (b s 1 s 3 + c s 1) 2 D\_{0\_{1,1}} \\cdot (b\_{s_1}s_3 + c\_{s_1})^2

We expand this:

D 0 1,1 ⋅ (b s 1 s 3 + c s 1) (b s 1 s 3 + c s 1) D\_{0\_{1,1}} \\cdot (b\_{s_1}s_3 + c\_{s_1})(b\_{s_1}s_3 + c\_{s_1})

D 0 1,1 (b s 1 s 3) 2 + 2 D 0 1,1 (b s 1 s 3 c s 1) + D 0 1,1 c s 1 2 D\_{0\_{1,1}} (b\_{s_1}s_3)^2 + 2D\_{0\_{1,1}} (b\_{s_1}s_3 c\_{s_1}) + D\_{0\_{1,1}} c\_{s_1}^2

D 0 1,1 b s 1 2 s 3 2 + 2 D 0 1,1 (b s 1 c s 1) s 3 + D 0 1,1 c s 1 2 D\_{0\_{1,1}} {b\_{s_1}}^2{s_3}^2 + 2D\_{0\_{1,1}} (b\_{s_1} c\_{s_1})s_3 + D\_{0\_{1,1}} c\_{s_1}^2

Notice that this single term has now become a quadratic equation in s 3 s_3. Just by eye, we can decompose it into the coefficients a a, b b and c c:

a \= D 0 1,1 b s 1 2 a = D\_{0\_{1,1}} {b\_{s_1}}^2

b \= 2 D 0 1,1 (b s 1 c s 1) b = 2D\_{0\_{1,1}} (b\_{s_1} c\_{s_1})

c \= D 0 1,1 c s 1 2 c = D\_{0\_{1,1}} c\_{s_1}^2

We repeat this for the rest of the quadratic terms, replacing all instances of s 1 s_1 and s 2 s_2 with the linearized versions, determining each term’s contribution to a a, b b and c c and then add them up to get the final, single quadratic coefficient for s 3 s_3. In total there will be 6 quadratic coefficients, 5 linear coefficients and 3 constant coefficients to add up (expand the other 5 quadratic terms to see why – some of the coefficients will expand to zero).

The actual code for all of this is remarkably simple, but only if you have calculated the algebra for all of the terms in advance! Assuming `coeffs` is the Gaussian elimination matrix:

```rust
// The quadratic:

// d11 s1^2 + d12 s1s2 + d13 s1s3 + d22 s2^2 + d23 s2s3 + d33 s3^2 + b1 s1 + b2 s2 + b3 s3 + c = 0

// s1 and s2 are defined only in terms of s3 and known constants
// Therefore when substituted, it all becomes a quadratic in s3 only

// Quadratic coefficients for s1^2, s2^2, s3^2, s1s2, s1s3 and s2s3
// Remember, this is the order we loaded them into the Gaussian matrix
let d11 = coeffs[0][0];
let d22 = coeffs[0][1];
let d33 = coeffs[0][2];
let d12 = coeffs[0][3];
let d13 = coeffs[0][4];
let d23 = coeffs[0][5];

// Add coefficients from quadratic decomposition of s1 and s2
// to quadratic coefficients
let a_0 = d11 * bs1 * bs1;   // dot[1][1] * s1^2
let a_1 = d22 * bs2 * bs2;   // dot[2][2] * s2^2
let a_2 = d33;               // dot[3][3] * 1 * 1       - s3^2
let a_3 = d12 * bs1 * bs2;   // dot[1][2] * s1 * s2
let a_4 = d13 * bs1;         // dot[1][3] * s1 * 1      - s1s3
let a_5 = d23 * bs2;         // dot[2][3] * s2 * 1      - s2s3

let a = (a_0 + a_1 + a_2 + a_3 + a_4 + a_5) % P;

// Add coefficients from linear decomposition of s1 and s2
// to linear coefficients
// This doesn't include cross-terms for s1.s4-s7 or s2.s4-s7 yet
let mut b;
b = 2 * d11 * bs1 * cs1;             // s1^2
b += 2 * d22 * bs2 * cs2;            // s2^2
b += d12 * (bs1 * cs2 + bs2 * cs1);  // s1.s2
b += d13 * cs1;                      // s1.s3
b += d23 * cs2;                      // s2.s3

// Add coefficients from constant decomposition of s1 and s2 to constant
// This doesn't include terms for s0, s4-s7 yet
let mut c;
c = d11 * cs1 * cs1; // s1^2
c += d22 * cs2 * cs2; // s2^2
c += d12 * cs1 * cs2; // s1.v2
```

That constructs the coefficients decomposed from the quadratic terms. We also have to handle the linear terms.

#### Decomposing the linear terms

There is almost nothing to this. We already created linear coefficients for s 1 − 3 s\_{1{-}3} way back when we created the equations for the Gaussian matrix. If we replace s 1 s_1 and s 2 s_2, we get their linear coefficients in s 3 s_3 as we just saw:

s 1 \= b s 1 s 3 + c s 1 s 2 \= b s 2 s 3 + c s 2 \\begin{align} s_1 = b\_{s_1} s_3 + c\_{s_1} \\\\ \\\\ s_2 = b\_{s_2} s_3 + c\_{s_2} \\end{align}

For example, a single term from the original equation might look like:

s 1 s 4 s_1s_4

Looking at the derived equations above, the linear part of s 1 s_1 when rewritten purely in terms of s 3 s_3 is:

b s 1 b\_{s_1}

So we can easily rewrite s 1 s 4 s_1s_4 as:

b s 1 s 4 b\_{s_1}s_4

Now remember the code we originally wrote to create the coefficients for the Guassian matrix:

```rust
// b1 - everything linear involving s1 but not s2 or s3
coeffs[e][6] = dot_tables[e][0][1] * s0
    + dot_tables[e][1][4] * s4
    + dot_tables[e][1][5] * s5
    + dot_tables[e][1][6] * s6
    + dot_tables[e][1][7] * s7;

// b2 - everything linear involving s2 but not s1 or s3
coeffs[e][7] = dot_tables[e][0][2] * s0
    + dot_tables[e][2][4] * s4
    + dot_tables[e][2][5] * s5
    + dot_tables[e][2][6] * s6
    + dot_tables[e][2][7] * s7;

// b3 - everything linear involving s3 but not s1 or s2
coeffs[e][8] = dot_tables[e][0][3] * s0
    + dot_tables[e][3][4] * s4
    + dot_tables[e][3][5] * s5
    + dot_tables[e][3][6] * s6
    + dot_tables[e][3][7] * s7;
```

All we have to do is multiply b 1 b_1 from the original equation by b s 1 b\_{s_1}, and b 2 b_2 by b s 2 b\_{s_2}, and add them to the linear term we are constructing:

```rust
b += coeffs[e][6] * bs1; // s0.s1, s1.s4, s1.s5, s1.s6, s1.s7
b += coeffs[e][7] * bs2; // s0.s2, s2.s4, s2.s5, s2.s6, s2.s7
b += coeffs[e][8];       // s0.s3, s3.s4, s3.s5, s3.s6, s3.s7
b %= P;
```

The final coefficient is already linear in just s 3 s_3 so there is nothing to multiply.

#### Decomposing the constant term

It’s much the same story for the constant. We just repeat what we did for the linear terms but just adding the constants c s 1 c\_{s_1} and c s 2 c\_{s_2} instead:

```rust
c += coeffs[e][6] * cs1; // s0.s1, s1.s4, s1.s5, s1.s6, s1.s7
c += coeffs[e][7] * cs2; // s0.s2, s2.s4, s2.s5, s2.s6, s2.s7
c += coeffs[e][8];       // s0.s3, s3.s4, s3.s5, s3.s6, s3.s7
c %= P;
```

Consider what we have accomplished here:

-   all of the terms that were quadratic in s 1 s_1 or s 2 s_2, plus s 3 s_3, are now quadratic in only s 3 s_3
-   all of the terms that were quadratic cross-terms in s 1 s_1 and s 2 s_2 are now linear in only s 3 s_3
-   all of the terms that were previously linear in s 1 s_1 and s 2 s_2 ar now constants

Perfect! This equation is a standard quadratic in a single variable and we can now solve it as before with the quadratic formula discussed in [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/) (or use a LUT – also described in part 3), allowing us to recover the candidate value of s 3 s_3 without brute-forcing it.

### Checking for a valid solution

Now that we know s 3 s_3, it is a simple matter to plug it into the two linear equations we derived to also recover s 1 s_1 and s 2 s_2:

s 1 \= b s 1 s 3 + c s 1 s 2 \= b s 2 s 3 + c s 2 \\begin{align} s_1 = b\_{s_1} s_3 + c\_{s_1} \\\\ \\\\ s_2 = b\_{s_2} s_3 + c\_{s_2} \\end{align}

Don’t forget that s 3 s_3 may have 0 or 2 roots as discussed in [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/), so either we get to prune this candidate altogether, or we have to calculate both possible values for s 1 s_1 and s 2 s_2 and check both. Then it’s just a question of performing the quadratic expansion on our 8 variables and checking it against the remaining 7 equations just as we did in part 3:

```rust
// Get the 0 or 2 roots for a^2 + bx + c = 0
let solve = quadratic_formula(a, b, c);

// No roots?
if solve.is_none() {
    continue;
}

// These are the two possible solutions for the first equation
let (s3_root1, s3_root2) = solve.unwrap();

// Now we can calculate s1 and s2 and try them in the other 7 equations
for s3 in [s3_root1, s3_root2] {
  
    // Calculate the two linear equations for s1 and s2
    let s1 = (bs1 * s3 + cs1) % P;
    let s2 = (bs2 * s3 + cs2) % P;

    let expanded = expand(&[s0, s1, s2, s3, s4, s5, s6, s7]);

    // Check the other 7 equations (we've solved the first one)
    // Early exit if one of them doesn't match
    for equation in 1..8 {
        let d = dot_product(&expanded, &dot_product_tables[equation]);
        if d % P != target[equation] {
            break;
        }

        // If last iteration and we haven't exited the loop
        if equation == 7 {
          // Solution found: [s0, s1, s2, s3, s4, s5, s6, s7]
        }
    }
}
```

And that’s it! We have now eliminated the need to brute-force any of s 0 − 3 s\_{0{-}3} as they are calculated on the fly, reducing the search space to a mere 251 4 or around 2 32.

To recap, we:

-   brute force over s 4 − 7 s\_{4{-}7}
-   use s 0 s_0 as a fixed scale factor
-   create a single variable quadratic in s 3 s_3 and two linear equations for s 1 s_1 and s 2 s_2
-   solve the quadratic in s 3 s_3
-   calculate s 1 s_1 and s 2 s_2
-   calculate the quadratic mapping for these 8 variables and check if it matches the target

### The results

So how did we do? At our previous best of 251 6, the average solve time on our 2020 desktop PC was approximately 242 days – or 205 days with the performance optimizations discussed in [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/). Our new implementation has an average single-threaded solve time of just **43 minutes**, or 38 minutes for the optimized version. This sounds great – and obviously it is – but note that while the search space was reduced by a factor of 251 2 (63001x), the real-world speedup is about 8000x. Just as last time when we went from 251 8 to 251 6, this is because although we slashed the search space, each iteration now has to do a lot more work. Obviously, not only is an 8000x speed gain more than enough to justify the work, it much more importantly brings solving the quadratic mappings from the realm of waiting many months to an actual realistic usable real-world solve time (as long as you don’t need real-time solving, of course). However, we can do even better…

### Multi-threading

As this is a series on using math in hacking, a full discourse on multi-threading is outside the scope of this article, but here are a few notes.

Brute-force searches of this nature are called *embarrassingly parallel problems*. That means they are very easy to parallelize, because no particular iteration in the search depends on any previous iteration, and there is no shared data or need for co-ordination. You can tell each thread “I want to search from values X to Y” and it can just get on with it. The only issue is to stop all the threads when a solution is found, or how to collect all the solutions together if we’re searching for more than one. So-called *fork/join parallelism* solves this easily. The general approach goes like this:

-   Choose a set of search areas for each thread, keeping them relatively small each. This is called *chunking*.
-   Launch – *fork* – a thread for each search area (optimally, this is usually slightly less than the total number of available cores on the CPU, leaving a couple for the OS to operate)
-   Each thread performs its search, returning whether or not it found a solution and closing down – *joining* – the main program again
-   The main program stores or prints the solution, then selects a new search area and creates a new thread
-   Repeat until all wanted solutions are found

Nowadays, modern parallelism libraries handle this in a much more sophisticated way, automatically figuring out the chunk size, how many threads to use, keeping a *thread pool* (a set of threads it can re-purpose) to minimize the cost of forking and joining threads all the time and making sure each thread always has enough work to do, to avoid *thread starvation* where some threads are sitting around doing nothing, which can happen if you are waiting for all threads to finish their search before launching a new set.

Every language has its own toolset for this and they are very specific to each language, so it’s impossible to give a generalized implementation here. For this project, I used the [Rayon](https://github.com/rayon-rs/rayon) library in Rust which makes it laughably easy to parallelize this kind of workload due to its *parallel iterators* feature, which is literally a drop-in replacement for normal iterators.

Using this closure as the search function:

```rust
let search = |s0, s4| {
    if let Some(signature) = search_partial(
        s0,
        s4,
        target_mapping,
        &dot_product_set,
        &quadratic_lut,
    ) {
        // Signature found, print it in hex
        println!("{}", signature.map(|c| format!("{c:02x}")).join(""));
      }
};
```

where:

-   `s0` and `s4` are the scale factor and fixed value of `s4` for this thread (we’ll brute-force over `s5-s7`)
-   `target_mapping` is the quadratic mapping we’re looking for
-   `dot_product_set` is the list of dot product tables to use
-   `quadratic_lut` is the table of quadratic equation solutions

A single-threaded search over every value of `s4` with the scale factor fixed to 1 looks like this:

```rust
(0..P).into_iter().for_each(|s4| search(1, s4));
```

and a multi-threaded search with Rayon looks like this:

```rust
(0..P).into_par_iter().for_each(|s4| search(1, s4));
```

You read that right – the only difference is using `into_par_iter` instead of `into_iter`. This is multi-threading dragged into the 21st century folks.

In our tests on the same hardware as before, using 50 threads, the average solve time is reduced from 43 minutes to **161 seconds**, or 144 seconds for the optimized version. Parallelization does not quite scale linearly for various reasons – even in an embarrassingly parallel workload – and here we get a 14x speedup on a 24-core machine. The optimizations add another 12% to this.

### Entropy analysis

Entropy, very loosely described, is a measure of how much disorder – or randomness – there is in something. If my frenemy thinks of a number between 1 and 100, and their thinking is truly random, then they have an equal chance of thinking of any particular number and there is no advantage in guessing one number over another – this situation has the maximum possible entropy. If, on the other hand, they always pick 10 or 50, then there are not really 100 items to guess – there are only two. This is a very low entropy situation – 98 of the possible numbers are just “wasted” and have no meaningful use.

Similar to our frenemy, an encryption algorithm – or message signing algorithm – may appear to output random numbers, but if there are hidden patterns in the outputs that link some of the bits to each other, that means they can be inferred without knowing all of them. For example if an algorithm outputs eight bytes b 0 − b 7 b_0{-}b_7, it may appear to have 64 bits of entropy – namely, that every bit is random. However, if b 2 b_2 is always the inverse of b 6 b_6, then suddenly it loses 8 bits of entropy, because we can infer b 6 b_6 just from b 2 b_2 or vice versa. This is a very clear example, and in reality the inferences are often extremely convoluted, some examples of which we have seen in this series.

In our smart card, if you know any 5 bytes of a *valid* signature for a given message, there is exactly one valid set of values for the other 3 – in other words, the other 3 bytes are basically irrelevant. For a specific chosen group of 5 bytes with unknown values (we’ve been using s 0 s_0 and s 4 − s 7 s_4{-}s_7 in this series, but it could be any group), this reduces the search space – the entropy – from 251 8 to 251 5 (because you have to brute-force those five bytes but you can calculate the other three as we saw in this article).

It gets worse, though. Recall from [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/), we said that we can pick any single byte as a quadratic scale factor, and there must be at least one valid signature for every possible scale factor. That is, you can pick any single byte from a candidate signature, set it to anything at all, and you are still guaranteed to find at least 251 valid signatures among the remaining 251 7 possibilities. So, if we just imagine that one of the five bytes we chose to brute-force is the scale factor byte, then we know for sure that our 251 5 search space will contain at least 251 valid signatures, distributed in such a way that there is at least one valid signature for every possible scale factor. We don’t need a valid signature for every scale factor though, usually we only need one, so we can just fix one of the five bytes to anything, then search the remaining four bytes and *still* be guaranteed to find at least one valid signature. This reduces the entropy of the algorithm even further to 251 4.

To find *every* valid signature for a given message digest, we have to perform a brute-force search for every possible group of 5 bytes, and calculate the other 3, eg. we would need to search s 0 − s 4 s_0{-}s_4 and calculate s 5 − s 7 s_5{-}s_7, search through s 1,s 3,s 5,s 6,s 7 s_1, s_3, s_5, s_6, s_7 and calculate s 0,s 2,s 4 s_0, s_2, s_4 etc. for every possible combination of 5 bytes you could select. In math we write this as (n r) \\binom{n}{r}, which means if we have a bag of n n items, calculate how many ways there are of picking r r of them, and we say “n choose r”. In this case we want “8 choose 5” – (8 5) \\binom{8}{5} – which, without showing the calculations here, turns out to be 56. Therefore, the *total search space to find all valid signatures for a specific message digest* is 56 ∙ 251 5 56 \\bullet 251^{5}.

To recap:

-   251 4 251^4 – search space guarantees to find at least one valid signature if we use one of the bytes not being brute-forced as a scale factor
-   251 5 251^5 – search space guarantees to find all valid signatures for any given five bytes selected for the search (no scale factor required; the three bytes not being brute-forced are solved on each iteration)
-   56 ∙ 251 5 56 \\bullet 251^5 – search space guarantees to find every valid signature

As mentioned, we prefer to express entropy in bits, so given that we’re actually only using a maximum of 251 values per byte:

-   2 31.88 ≈ 2 32 2^{31.88} \\approx 2^{32} to guarantee at least one valid signature
-   2 39.86 ≈ 2 40 2^{39.86} \\approx 2^{40} to find all valid signatures for any given five-byte grouping
-   2 45.67 ≈ 2 45 + 2 44 + 2 42 ≈ 1.75 ⋅ 2 45 2^{45.67} \\approx 2^{45} + 2^{44} + 2^{42} \\approx 1.75 \\cdot 2^{45} to find every valid signature

Assuming the worst possible case of only one signature per 251 4 area of the search space, we can say that we expect to find:

251 5 251 4 \= 251 \\frac{251^5}{251^4} = 251

signatures for a five-byte grouping, and

56 ⋅ 251 5 251 4 \= 251 ∙ 56 \= 14056 \\frac{56 \\cdot 251^5}{251^4} = 251 \\bullet 56 = 14056

total signatures for a given message digest – that is to say, there are 14,056 valid ways to sign any given message. Assuming even distribution, a naive brute-force would in the worst case have to search:

l o g 2 (251 8 251 ∙ 56) \= 49.99 log_2(\\frac{251^8}{251 \\bullet 56}) = 49.99

about 2 50 values to find a valid signature, and about 2 49 on average, on an algorithm that putatively has a 2 64 search space. Yikes!

### Signing a message legitimately

Questions remain. You may now be wondering, how do the legitimate authors of these messages actually sign them? There is no obvious correlation between the eight dot product tables, but if they are truly random, then signing a message legitimately would take the same effort as an attacker signing one fraudulently. Obviously this doesn’t make any sense – signing should be quick to perform, quicker to verify, and extremely challenging to forge. But how?

The system we have discussed in this series is a form of *multivariate quadratic cryptography*, or MQ for short – putatively, a series of non-linear equations that must be solved in order to forge a signature; quadratic equations in our case. It is more or less equivalent to the designs specified in [Efficient Signature Schemes Based on Birational Permutations](https://link.springer.com/chapter/10.1007/3-540-48329-2_1) by Adi Shamir – a predecessor to J. Patarin’s more well-known [Unbalanced oil and vinegar scheme](https://en.wikipedia.org/wiki/Unbalanced_oil_and_vinegar_scheme). In brief, this is a form of *asymmetric cryptography* where the signer knows some secret information that the verifier does not. This secret information, or *private key*, allows a message to be signed easily, while another key – a *public key* – allows the verifier to check the signature is valid. The public key is derived from the private key in such a way that they are mathematically related, but it is incredibly difficult to figure out the private key from the public key. With only the public key, it’s easy and quick to verify a signature, but virtually impossible to forge a message signature in a secure system.

In MQ systems, the keys are long. In fact, the entire set of coefficients for the system of equations *is* the public key. To generate the key in this scheme, the signer chooses two random secret matrices 𝐀 \\mathbf{A} and 𝐁 \\mathbf{B} of size x × x x\\cross x, where x x is the number of bytes we want to sign (and therefore the number of equations) – in our case, 8 × 8 8\\cross8. The first matrix 𝐀 \\mathbf{A} is a “variable” transformation which mixes up the individual variables to turn them into quadratics. The second matrix 𝐁 \\mathbf{B} is a “mixing” transformation, which basically jumbles all the numbers up to create new equations. Sandwiched between those is a simple set of linear equations that are easy to solve and form the crux of the algorithm, but are obscured by 𝐀 \\mathbf{A} and 𝐁 \\mathbf{B} to make them look like random quadratic equations. We have been referring to the public key as a dot product matrix 𝐃 \\mathbf{D}, so now we learn that it is constructed like this:

𝐃 \= 𝐁 ∘ 𝐅 ∘ 𝐀 \\mathbf{D} = \\mathbf{B} \\circ \\mathbf{F} \\circ \\mathbf{A}

where 𝐅 \\mathbf{F} are the hidden linear equations and the circles mean the transformations happen from right to left.

To sign a message, we need to calculate a signature from the message digest in such a way that:

𝐁 ⋅ 𝐅 (𝐀 𝐬) \= 𝐃 𝐬 \\mathbf{B \\cdot F(As)} = \\mathbf{Ds}

Here we just say that when we plug each byte of the signature into the public matrix 𝐃 \\mathbf{D}, it should give the same result as multiplying the signature by the secret matrix 𝐀 \\mathbf{A}, using the result as inputs to the set of linear equations 𝐅 \\mathbf{F}, then multiplying these linear solutions by 𝐁 \\mathbf{B}.

To actually create a signature from a message digest, we have to work backwards, calculating 𝐬 \\mathbf{s} from the message digest 𝐦 \\mathbf{m}. Reversing the effect of a matrix or function (“inverting” it) is denoted by placing \-1 above its letter, so the signer can create a signature like so:

𝐬 \= 𝐀 − 1 ⋅ 𝐅 − 1 (𝐁 − 1 𝐦) \\mathbf{s} = \\mathbf{A}^{-1} \\cdot \\mathbf{F}^{-1}(\\mathbf{B}^{-1}\\mathbf{m})

This time, we solve for 𝐅 \\mathbf{F} instead of just calculating it.

The public key is not used at all when signing a message. If you know the individual components 𝐀,𝐅,𝐁 \\mathbf{A, F, B}, it’s very easy to sign a message, but if you don’t then you’re out of luck. If the entire public key was just the two matrices multiplied together, it would be super easy to reverse because in that case 𝐃 − 1 \= 𝐀 − 1 𝐁 − 1 \\mathbf{D}^{-1} = \\mathbf{A}^{-1}\\mathbf{B}^{-1}; it is the presence of the unknown linear equations 𝐅 \\mathbf{F} that give the algorithm is security.

**Note**: this is an *extremely* simplified explanation with a lot of omissions; I strongly recommend reading the original paper if you’re feeling up to it!

### Conclusion

Starting from a naive brute-force search of 251 8 search space that would take 26,000 years on our PC from 2020, we reduced the work to a pizza and beer-worthy 251 4. Overall, we have reduced the total search space to find a single signature (note: not *all* signatures, see the entropy analysis for details) down by a factor of 3.9 billion, and the average solve time by 5.7 billion, from 26,000 years to 144 seconds. Although we haven’t actually *cracked* the signature algorithm per se (because we didn’t recover the secret matrices), we have made it solvable in a very reasonable timeframe (again, assuming you don’t need real-time signing). Sorry for the clickbait title.

Crucially – and to the point of this series – we saw that none of this would be possible without some grasp of mathematics. It looks scary, and I feel that many people find all the letters and squiggles so intimidating that they shy away from it. It’s important to put the ordeal we went through into context: high-level mathematics is tremendously, vastly more complex than anything here. I myself struggled with a lot of this while working through the algorithm. I learned a lot, I got confused a lot, then I learned some more, so if you think this is all just trivial and straightforward to your writer, think again. I’m not a math expert. As software engineers, we are used to writing code and we find it easy to read. The kind of mathematical equations we saw in this series look really convoluted and difficult, but when we translate them to code, they are really not that hard – as you hopefully saw from the accompanying code examples. By learning some math, we took the impenetrable and turned it into a very manageable problem.

Math aside, what did we ultimately learn from all this, besides how to watch boxing matches for free in the period April 1997 to July 1999?

**Quadratic mappings are not inherently cryptographically secure.**

The problem of solving quadratic mappings and other forms of MQ is considered [NP-complete](https://en.wikipedia.org/wiki/NP-completeness) – the hardest kind of mathematical problem to solve. However, you can have an NP-complete problem and still solve it quickly if the search space is small enough, as we demonstrated here. Using a much larger number of variables – several hundred – and a much larger prime field, the time to solve becomes very unwieldy. Generally though, quadratic mappings are just one tool in the toolbox – so-called cryptographic *primitives* – that can be combined together to make a secure algorithm.

Putting things in context, in the mid-to-late 90s, using a quadratic mapping as a one-way hash function for a signature algorithm in a small 8-bit smart card with limited processing power and tight limits on timing and power consumption, that is not life-critical and only designed to be in the field for two years anyway, may have been deemed “good enough” to deter all but the most well-funded commercial pirates. We might be able to solve for one signature in 80 seconds thirty years later, but would-be pirates at the time would need access to distributed computing or specialized hardware to perform the signing. Alternatively, the card designers may simply have not been aware of the weaknesses. Either way, I think it’s fair to say that for the time period, the algorithm absolutely served its purpose.

I really hope you enjoyed this series as much as I enjoyed writing it, and hopefully even learned something – even if it was a little mind-bending! Feel free to write a comment if you’d like to say hello. Besides that, take care and happy hacking!  

```
c0 02 00 4f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 63 0c 80 66 01 04 f1 bd 0d cb 02 38 00
```
