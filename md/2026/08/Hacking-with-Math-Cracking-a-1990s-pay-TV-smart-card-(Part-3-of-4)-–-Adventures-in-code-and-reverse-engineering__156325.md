---
title: "Hacking with Math: Cracking a 1990s pay TV smart card (Part 3 of 4) – Adventures in code and reverse engineering"
source: https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/
source_host: katyscode.wordpress.com
clip_date: 2026-08-04T16:02:14+08:00
trace_id: cffee3a9-4cee-44a7-b0c7-3b12b6a03395
content_hash: 10b0df6f335f0d2abfbec9e7be251d611983bd3ada1691942d57ff0c010f7e5a
status: synced
tags:
  - 密码学
  - 协议分析
series: null
feed_source: Katy's Code·IL2CPP逆向
ai_summary: 通过缩放消元与二次方程求根，把1990年代付费电视智能卡签名搜索从251^8暴力降为251^6，运行时间从2.6万年降至约242天，再用查找表优化到205天。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-815d-8981-e8e141801b52
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过缩放消元与二次方程求根，把1990年代付费电视智能卡签名搜索从251^8暴力降为251^6，运行时间从2.6万年降至约242天，再用查找表优化到205天。
> 
> - **算法架构：** 8字节摘要经二次展开为36字节，与8张点积表逐项点积得到8字节输出；签名的验证逻辑相同，且签名使用的S表比摘要使用的M表左旋一列，满足 q_d=q_s 才判定有效。
> - **暴力搜索耗时：** 签名8字节每字节可取0-250，搜索空间约251^8≈2^64；在2020年高端PC上运行约需26,000年，不可行。
> - **缩放攻击：** 二次展开满足 e(xs)=x^2 e(s)，因此可固定 s0=1 并把其余字节按比例缩放，再比较映射“形状”而非精确值；搜索空间降到251^7≈2^56，时间约98年。
> - **二次公式消元：** 固定s0后任选一条二次方程，把其他6个变量作为已知值，只留s3为未知数，用二次求根公式直接解出；搜索空间降到251^6≈2^48，运行时间约242天。
> - **查找表优化：** 对GF(251)上的求逆、开方和二次方程求解结果预构建LUT，可在搜索中把计算换成查表，再获得约15%提速，最终约205天；其中二次方程求解LUT约128MB。

Rate This

Greetings! This is a continuation of a mini-series about gaining an advantage in reverse engineering certain problems by learning some math, hopefully in a hacker-friendly way!

In [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) of this series, we did a quick crash course in writing equations and modular arithmetic.

In [part 2](https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/), we looked at the message signing algorithm in a particular pay TV smart card from the 1990s, exploring how the algorithm works, and expressing it both mathematically and with code, introducing the concepts of vectors, quadratic expansion, dot products and quadratic mappings.

Today, we will strike at the heart of the enemy: how we can leverage everything we have learned to crack the algorithm so that we can sign any message. With this ability, if we can craft a message to tell the card we have just subscribed to every TV channel, we will be able to sign it with a valid signature and fool the card into believing the message was sent by the broadcaster, thereby enabling us to watch all channels without a subscription.

In this part, we will start with a naive approach of trying every possible signature until we find one that is valid, then use the mathematical properties of the algorithm to exploit subtle weaknesses in it, narrowing down the number of signatures we have to try.

*NOTE: For this part and onwards, we shall be using Rust for the code examples. Rust is a high-performance low-level language that is easier to use and less error-prone than C, and speed is of the essence when we need to do trillions of calculations quickly. You do not need to know Rust to be able to understand the examples; provided you understand another language such as C, C# or Java, you will probably be able to pick it up. I’ll mention any Rust-specific quirks as we go along.*

### Recap of the algorithm

We start with an 8-byte message digest created using a one-way hash function from a 23-byte input message, which gives instructions to the card of the broadcaster’s choice. This might be to add or remove channels or PPV events to a subscriber’s channel package, for example. We also have an 8-byte message signature that the card will verify to prove that the message came from the broadcaster before processing it, to prevent tampering.

We perform quadratic expansion on the digest to produce a 36-byte sequence. For each byte in the digest, the expansion is used as the left side of a dot product, while the right size is one of eight tables chosen using the byte index. This produces an 8-byte output. We then perform the same operations on the signature with a different set of eight tables to produce another 8-byte output. We then compare the two sets of outputs: if they match, the signature is valid, otherwise it is invalid.

In mathematical notation:

𝐝 \= (d 0,d 1,d 2) 𝐬 \= (s 0,s 1,s 2) 𝐞 𝐝 \= \[d 0 2 d 0 d 1 d 0 d 2 d 1 2 d 1 d 2 d 2 2\],𝐞 𝐬 \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] 𝐪 𝐝 \= 𝐞 𝐝 T 𝐌 (m o d 251) 𝐪 𝐬 \= 𝐞 𝐬 T 𝐒 (m o d 251) Signature is correct if 𝐪 𝐝 \= 𝐪 𝐬 \\begin{align} \\mathbf{d} = (d_0, d_1, d_2) \\\\ \\mathbf{s} = (s_0, s_1, s_2) \\\\ \\\\ \\mathbf{e_d} = \\begin{bmatrix} d_0^2 \\\\ d_0d_1 \\\\ d_0d_2 \\\\ d_1^2 \\\\ d_1d_2 \\\\ d_2^2 \\end{bmatrix}, \\quad \\mathbf{e_s} =\\begin{bmatrix} s_0^2 \\\\ s_0s_1 \\\\ s_0s_2 \\\\ s_1^2 \\\\ s_1s_2 \\\\ s_2^2 \\end{bmatrix} \\\\ \\\\ \\mathbf{q_d} = \\mathbf{e_d}^T \\mathbf{M}\\quad(mod\\; 251)\\\\ \\mathbf{q_s} = \\mathbf{e_s}^T \\mathbf{S}\\quad(mod\\; 251)\\\\ \\\\ \\text{Signature is correct if }\\mathbf{q_d} = \\mathbf{q_s} \\end{align}

A detailed explanation of this plus the equivalent code can be found in [part 2](https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/).

One point relevant to this specific card that I haven’t mentioned until now is that the two sets of 8 tables 𝐌 \\mathbf{M} and 𝐒 \\mathbf{S} are actually the same except that 𝐌 \\bf{M} is “rotated left” by one column. That is, if you imagine 8 tables 𝐭 𝟎 − 𝟕 \\mathbf{t\_{0{-}7}}, then:

𝐌 \= \[𝐭 𝟏 𝐭 𝟐 𝐭 𝟑 𝐭 𝟒 𝐭 𝟓 𝐭 𝟔 𝐭 𝟕 𝐭 𝟎\] 𝐒 \= \[𝐭 𝟎 𝐭 𝟏 𝐭 𝟐 𝐭 𝟑 𝐭 𝟒 𝐭 𝟓 𝐭 𝟔 𝐭 𝟕\] \\begin{align} \\mathbf{M} = \\begin{bmatrix} \\mathbf{t_1} & \\mathbf{t_2} & \\mathbf{t_3} & \\mathbf{t_4} & \\mathbf{t_5} & \\mathbf{t_6} & \\mathbf{t_7} & \\mathbf{t_0} \\end{bmatrix} \\\\ \\mathbf{S} = \\begin{bmatrix} \\mathbf{t_0} & \\mathbf{t_1} & \\mathbf{t_2} & \\mathbf{t_3} & \\mathbf{t_4} & \\mathbf{t_5} & \\mathbf{t_6} & \\mathbf{t_7} \\end{bmatrix} \\end{align}

(Notice a new piece of notation here: we used a range subscript 0-7 in 𝐭 𝟎 − 𝟕 \\mathbf{t\_{0{-}7}} to show that there are 8 items in 𝐭 \\mathbf{t}, numbered 0-7. This is just like writing an array’s lower and upper bounds in code)

We can write this more succinctly as:

𝐌 𝐢 \= 𝐒 𝐢 + 𝟏 (mod 8) \\mathbf{M_i} = \\mathbf{S\_{i{+}1 \\;\\text{(mod 8)}}}

Additionally, the card actually has another two sets of tables just like these, and the broadcaster can choose which set to use by setting or clearing a single bit in the message. We’ll ignore that and focus on only one set of tables here; the steps to crack signatures for the other set of tables are identical.

Neither the table rotation nor additional two sets of tables make any practical difference to our work, but I include it for completeness. Now we have documented the complete algorithm.

The full dot product tables from the smart card for the curious 𝐓 \= \[19 148 184 58 155 20 43 2 93 48 17 132 89 15 25 123 145 137 124 39 91 101 189 22 65 52 99 221 227 70 82 160 19 54 204 23 178 158 110 134 131 57 177 143 181 1 249 4 94 27 94 21 43 145 214 198 213 129 61 115 106 199 28 245 15 120 142 162 244 145 94 246 110 10 77 135 184 3 46 50 188 103 113 23 73 167 162 232 113 220 238 129 166 244 22 206 213 74 114 146 9 19 165 73 122 13 25 72 173 93 101 49 52 22 157 55 230 34 58 131 135 194 106 186 153 138 205 60 3 97 123 219 137 148 148 238 108 197 153 201 186 24 17 158 168 39 69 151 233 89 184 190 115 105 105 240 14 50 110 38 169 72 139 17 117 41 229 48 13 26 231 163 55 5 185 176 33 137 226 81 69 235 213 221 153 22 166 173 208 18 203 118 203 201 227 113 115 39 201 242 5 167 52 117 51 145 181 81 79 189 159 218 101 106 108 7 30 62 246 62 185 101 92 73 208 0 136 99 136 210 30 208 162 182 184 174 72 208 227 109 195 224 62 42 149 113 42 30 217 134 125 81 211 205 94 2 207 169 26 11 112 21 177 198 153 40 115 84 132 115 124 82 152 169 242 243 121 211 27 159 144 220 217 22 17 59 249 141\] \\mathbf{T} =\\begin{bmatrix} 19 & 148 & 184 & 58 & 155 & 20 & 43 & 2 \\\\ 93 & 48 & 17 & 132 & 89 & 15 & 25 & 123 \\\\ 145 & 137 & 124 & 39 & 91 & 101 & 189 & 22 \\\\ 65 & 52 & 99 & 221 & 227 & 70 & 82 & 160 \\\\ 19 & 54 & 204 & 23 & 178 & 158 & 110 & 134 \\\\ 131 & 57 & 177 & 143 & 181 & 1 & 249 & 4 \\\\ 94 & 27 & 94 & 21 & 43 & 145 & 214 & 198 \\\\ 213 & 129 & 61 & 115 & 106 & 199 & 28 & 245 \\\\ 15 & 120 & 142 & 162 & 244 & 145 & 94 & 246 \\\\ 110 & 10 & 77 & 135 & 184 & 3 & 46 & 50 \\\\ 188 & 103 & 113 & 23 & 73 & 167 & 162 & 232 \\\\ 113 & 220 & 238 & 129 & 166 & 244 & 22 & 206 \\\\ 213 & 74 & 114 & 146 & 9 & 19 & 165 & 73 \\\\ 122 & 13 & 25 & 72 & 173 & 93 & 101 & 49 \\\\ 52 & 22 & 157 & 55 & 230 & 34 & 58 & 131 \\\\ 135 & 194 & 106 & 186 & 153 & 138 & 205 & 60 \\\\ 3 & 97 & 123 & 219 & 137 & 148 & 148 & 238 \\\\ 108 & 197 & 153 & 201 & 186 & 24 & 17 & 158 \\\\ 168 & 39 & 69 & 151 & 233 & 89 & 184 & 190 \\\\ 115 & 105 & 105 & 240 & 14 & 50 & 110 & 38 \\\\ 169 & 72 & 139 & 17 & 117 & 41 & 229 & 48 \\\\ 13 & 26 & 231 & 163 & 55 & 5 & 185 & 176 \\\\ 33 & 137 & 226 & 81 & 69 & 235 & 213 & 221 \\\\ 153 & 22 & 166 & 173 & 208 & 18 & 203 & 118 \\\\ 203 & 201 & 227 & 113 & 115 & 39 & 201 & 242 \\\\ 5 & 167 & 52 & 117 & 51 & 145 & 181 & 81 \\\\ 79 & 189 & 159 & 218 & 101 & 106 & 108 & 7 \\\\ 30 & 62 & 246 & 62 & 185 & 101 & 92 & 73 \\\\ 208 & 0 & 136 & 99 & 136 & 210 & 30 & 208 \\\\ 162 & 182 & 184 & 174 & 72 & 208 & 227 & 109 \\\\ 195 & 224 & 62 & 42 & 149 & 113 & 42 & 30 \\\\ 217 & 134 & 125 & 81 & 211 & 205 & 94 & 2 \\\\ 207 & 169 & 26 & 11 & 112 & 21 & 177 & 198 \\\\ 153 & 40 & 115 & 84 & 132 & 115 & 124 & 82 \\\\ 152 & 169 & 242 & 243 & 121 & 211 & 27 & 159 \\\\ 144 & 220 & 217 & 22 & 17 & 59 & 249 & 141 \\\\ \\end{bmatrix}

The second set as mentioned above:

𝐔 \= \[155 123 43 105 208 56 220 179 33 193 166 246 42 74 127 190 48 157 179 92 234 103 76 142 23 242 173 12 35 32 123 212 1 120 55 221 58 134 125 63 172 201 152 246 35 66 226 245 92 234 113 0 45 180 103 210 79 121 21 241 86 64 34 158 136 48 201 48 79 195 107 111 117 59 61 215 54 107 190 46 172 74 77 242 160 8 205 38 153 205 159 84 28 126 76 109 11 238 60 145 228 189 79 69 18 102 107 21 38 128 90 139 38 99 45 248 221 130 88 176 107 126 51 204 131 202 21 113 211 224 194 96 163 178 23 141 32 197 211 220 36 8 16 20 226 50 189 20 109 134 182 157 116 146 180 18 213 61 74 143 149 214 38 98 58 166 74 183 102 24 93 78 79 187 229 219 210 13 47 54 77 51 89 190 39 62 19 47 82 73 173 245 99 197 170 63 249 174 102 67 199 96 196 160 103 220 1 57 207 127 120 69 198 112 225 147 238 166 155 38 103 146 235 218 109 206 151 237 91 30 157 149 214 37 130 94 227 143 234 58 89 91 137 29 239 142 103 172 129 107 203 45 169 141 170 195 214 44 27 167 44 82 155 58 79 77 114 92 72 19 107 151 224 214 181 77 225 243 45 121 220 74 233 46 215 162 131 128\] \\mathbf{U} = \\begin{bmatrix} 155 & 123 & 43 & 105 & 208 & 56 & 220 & 179 \\\\ 33 & 193 & 166 & 246 & 42 & 74 & 127 & 190 \\\\ 48 & 157 & 179 & 92 & 234 & 103 & 76 & 142 \\\\ 23 & 242 & 173 & 12 & 35 & 32 & 123 & 212 \\\\ 1 & 120 & 55 & 221 & 58 & 134 & 125 & 63 \\\\ 172 & 201 & 152 & 246 & 35 & 66 & 226 & 245 \\\\ 92 & 234 & 113 & 0 & 45 & 180 & 103 & 210 \\\\ 79 & 121 & 21 & 241 & 86 & 64 & 34 & 158 \\\\ 136 & 48 & 201 & 48 & 79 & 195 & 107 & 111 \\\\ 117 & 59 & 61 & 215 & 54 & 107 & 190 & 46 \\\\ 172 & 74 & 77 & 242 & 160 & 8 & 205 & 38 \\\\ 153 & 205 & 159 & 84 & 28 & 126 & 76 & 109 \\\\ 11 & 238 & 60 & 145 & 228 & 189 & 79 & 69 \\\\ 18 & 102 & 107 & 21 & 38 & 128 & 90 & 139 \\\\ 38 & 99 & 45 & 248 & 221 & 130 & 88 & 176 \\\\ 107 & 126 & 51 & 204 & 131 & 202 & 21 & 113 \\\\ 211 & 224 & 194 & 96 & 163 & 178 & 23 & 141 \\\\ 32 & 197 & 211 & 220 & 36 & 8 & 16 & 20 \\\\ 226 & 50 & 189 & 20 & 109 & 134 & 182 & 157 \\\\ 116 & 146 & 180 & 18 & 213 & 61 & 74 & 143 \\\\ 149 & 214 & 38 & 98 & 58 & 166 & 74 & 183 \\\\ 102 & 24 & 93 & 78 & 79 & 187 & 229 & 219 \\\\ 210 & 13 & 47 & 54 & 77 & 51 & 89 & 190 \\\\ 39 & 62 & 19 & 47 & 82 & 73 & 173 & 245 \\\\ 99 & 197 & 170 & 63 & 249 & 174 & 102 & 67 \\\\ 199 & 96 & 196 & 160 & 103 & 220 & 1 & 57 \\\\ 207 & 127 & 120 & 69 & 198 & 112 & 225 & 147 \\\\ 238 & 166 & 155 & 38 & 103 & 146 & 235 & 218 \\\\ 109 & 206 & 151 & 237 & 91 & 30 & 157 & 149 \\\\ 214 & 37 & 130 & 94 & 227 & 143 & 234 & 58 \\\\ 89 & 91 & 137 & 29 & 239 & 142 & 103 & 172 \\\\ 129 & 107 & 203 & 45 & 169 & 141 & 170 & 195 \\\\ 214 & 44 & 27 & 167 & 44 & 82 & 155 & 58 \\\\ 79 & 77 & 114 & 92 & 72 & 19 & 107 & 151 \\\\ 224 & 214 & 181 & 77 & 225 & 243 & 45 & 121 \\\\ 220 & 74 & 233 & 46 & 215 & 162 & 131 & 128 \\\\ \\end{bmatrix}

### Searching for answers: the brute-force attack

A *brute-force attack* in cryptography is a simple concept: try every single value until you find the right one. Most often this is for a decryption key, but in this case it’s for a signature. The steps are simple:

-   Calculate the quadratic mapping for the message digest once
-   Iterating over every possible signature value, calculate its quadratic mapping and compare it to the one from the message digest

Eventually, we’ll find one that matches, and this is our valid signature.

When we talk about search-based attacks, we like to be able to measure the *search space*, or *keyspace* when searching for a secret key. This is total the number of possible values we may have to try – the worst case scenario where we have to check every single value – and is a measure of how long it will take to complete a search. If each search has only one correct value, and these values are evenly distributed over the search space, then we can expect to search on average about half of the values for each brute-force attack we perform.

Suppose you have 100 apples. 99 of them are just plain old regular green apples, but one special apple is golden, and you want to find it. The apples come along a conveyor belt in no particular order and you can only see one at a time. You look at every apple until you find the golden one, then stop.

Now imagine you have many piles of 100 apples, each of which we again watch as they come along the conveyor belt until we find the golden apple. Where might the apple be each time? It could be the first apple that we see, or it might be the very last apple on the conveyor belt. If we search through enough piles of apples over a long time though, on average we’re going to have to look through about half of them. This is because the golden apples are *evenly distributed* on the belt – occasionally the first, occasionally the last, but most likely somewhere in between, and each apple has an equal likelihood of being the golden one.

In this example, each pile of apples represents one brute-force attack, the search space is 100 items, and the seemingly random placement of each golden apple on the conveyor represents even distribution among the search space.

We like to measure search space in bits, for example 2 64 is a 64-bit space. Why? Because a single binary digit is either 0 or 1, which is two possible values to search; two binary digits can be 00, 01, 10 or 11 giving four possible values, and so on. Each additional bit we add doubles the total search space. If we have an 8-bit search space – ie. 8 binary digits – then the total number of values to search is two per binary bit: 2 \* 2 \* 2 \* 2 \* 2 \* 2 \* 2 \* 2, which if I’ve typed the right number of 2’s is 2 8. Hence, 2 x is an x-bit search space. Each byte we add to the search space increases its size by a factor of 256, also written as 2 8.

In our signature algorithm, we are operating in 𝔽 251 \\mathbb{F}\_{251}, so we are not actually quite using every possible combination of every bit, because a single byte can store the values 0-255 but we are only using the values 0-250. The search space is therefore 251 8 because we have 8 bytes to test with possible values of 0-250 in each. However, as I mentioned we like to use the number of bits in the search space as a measurement, and in reality this is just a little under 2 64 so we’ll glibly round up when we use this measurement.

So how do we implement this? First, we’re going to need a couple of utility functions.

Quadratic expansion (Rust)

```rust
pub type DotProductTable = [u32; 36];

// Prime field we are working in
pub const P: u32 = 251;

// Perform quadratic expansion from 8 bytes to 36 bytes,
// v0.v0, v0.v1 ... v0.v7, v1.v1 ... v1.v7 ... v6.v7, v7.v7
#[inline(always)]
pub fn expand(values: &[u32]) -> DotProductTable {
    let mut expansion: DotProductTable = [0u32; 36];

    let mut index = 0;
    for i in 0..8 {
        for j in i..8 {
            expansion[index] = (values[i] * (values[j])) % P;
            index += 1;
        }
    }
    expansion
}
```

Dot product (Rust)

```rust
#[inline(always)]
pub fn dot_product(left: &[u32], right: &[u32]) -> u32 {
    left.iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum()
}
```

Quadratic mapping (Rust)

```rust
pub type Vector8 = [u32; 8];

// For message digest: bytes 0-6 use tables 1-7, and byte 7 uses table 0
// For signature: bytes 0-7 use tables 0-7
// Therefore, set first_table == 1 for message digest,
//                first_table == 0 for packet signature
fn quadratic_mapping(
    input: Vector8,
    dot_product_tables: &[DotProductTable],
    first_table: usize,
) -> Vector8 {
    let expanded = expand(&input);

    let mut dot_products: Vector8 = [0u32; 8];

    let mut table_index: usize = first_table;
    for i in 0..8 {
        dot_products[i] = dot_product(&expanded, &dot_product_tables[table_index]);
        table_index = (table_index + 1) % 8;
    }

    // Mod 251
    let qm = dot_products.map(|d| d % P);
    qm
}
```

Python versions of these and their explanations can be found in [part 2](https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/).

**TIP:** *If you’re not used to Rust, just ignore every mention of iter(), into_iter() and & or \* appearing before variable names; they are Rust-specific mechanisms that don’t have any impact on the intent of the code*. *Also note that the `return` keyword is omitted if it is the final line of the function.*

Of course, we’ll need the dot product tables as well:

Dot product tables (Rust)

```rust
pub const DOT_PRODUCT_TABLES: [DotProductTable; 8] = [
    [
        0x13, 0x5D, 0x91, 0x41, 0x13, 0x83, 0x5E, 0xD5, 0xF, 0x6E, 0xBC, 0x71, 0xD5, 0x7A, 0x34,
        0x87, 3, 0x6C, 0xA8, 0x73, 0xA9, 0xD, 0x21, 0x99, 0xCB, 5, 0x4F, 0x1E, 0xD0, 0xA2, 0xC3,
        0xD9, 0xCF, 0x99, 0x98, 0x90,
    ],
    [
        0x94, 0x30, 0x89, 0x34, 0x36, 0x39, 0x1B, 0x81, 0x78, 0xA, 0x67, 0xDC, 0x4A, 0xD, 0x16,
        0xC2, 0x61, 0xC5, 0x27, 0x69, 0x48, 0x1A, 0x89, 0x16, 0xC9, 0xA7, 0xBD, 0x3E, 0, 0xB6,
        0xE0, 0x86, 0xA9, 0x28, 0xA9, 0xDC,
    ],
    [
        0xB8, 0x11, 0x7C, 0x63, 0xCC, 0xB1, 0x5E, 0x3D, 0x8E, 0x4D, 0x71, 0xEE, 0x72, 0x19, 0x9D,
        0x6A, 0x7B, 0x99, 0x45, 0x69, 0x8B, 0xE7, 0xE2, 0xA6, 0xE3, 0x34, 0x9F, 0xF6, 0x88, 0xB8,
        0x3E, 0x7D, 0x1A, 0x73, 0xF2, 0xD9,
    ],
    [
        0x3A, 0x84, 0x27, 0xDD, 0x17, 0x8F, 0x15, 0x73, 0xA2, 0x87, 0x17, 0x81, 0x92, 0x48, 0x37,
        0xBA, 0xDB, 0xC9, 0x97, 0xF0, 0x11, 0xA3, 0x51, 0xAD, 0x71, 0x75, 0xDA, 0x3E, 0x63, 0xAE,
        0x2A, 0x51, 0xB, 0x54, 0xF3, 0x16,
    ],
    [
        0x9B, 0x59, 0x5B, 0xE3, 0xB2, 0xB5, 0x2B, 0x6A, 0xF4, 0xB8, 0x49, 0xA6, 9, 0xAD, 0xE6,
        0x99, 0x89, 0xBA, 0xE9, 0xE, 0x75, 0x37, 0x45, 0xD0, 0x73, 0x33, 0x65, 0xB9, 0x88, 0x48,
        0x95, 0xD3, 0x70, 0x84, 0x79, 0x11,
    ],
    [
        0x14, 0xF, 0x65, 0x46, 0x9E, 1, 0x91, 0xC7, 0x91, 3, 0xA7, 0xF4, 0x13, 0x5D, 0x22, 0x8A,
        0x94, 0x18, 0x59, 0x32, 0x29, 5, 0xEB, 0x12, 0x27, 0x91, 0x6A, 0x65, 0xD2, 0xD0, 0x71,
        0xCD, 0x15, 0x73, 0xD3, 0x3B,
    ],
    [
        0x2B, 0x19, 0xBD, 0x52, 0x6E, 0xF9, 0xD6, 0x1C, 0x5E, 0x2E, 0xA2, 0x16, 0xA5, 0x65, 0x3A,
        0xCD, 0x94, 0x11, 0xB8, 0x6E, 0xE5, 0xB9, 0xD5, 0xCB, 0xC9, 0xB5, 0x6C, 0x5C, 0x1E, 0xE3,
        0x2A, 0x5E, 0xB1, 0x7C, 0x1B, 0xF9,
    ],
    [
        2, 0x7B, 0x16, 0xA0, 0x86, 4, 0xC6, 0xF5, 0xF6, 0x32, 0xE8, 0xCE, 0x49, 0x31, 0x83, 0x3C,
        0xEE, 0x9E, 0xBE, 0x26, 0x30, 0xB0, 0xDD, 0x76, 0xF2, 0x51, 7, 0x49, 0xD0, 0x6D, 0x1E, 2,
        0xC6, 0x52, 0x9F, 0x8D,
    ],
];
```

Next, calculate the quadratic mapping for the message digest:

```rust
let message_digest = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
let digest_mapping = quadratic_mapping(message_digest, &DOT_PRODUCT_TABLES, 1);
```

Note the “1” here as the last argument in the call to `quadratic_mapping` to indicate we shall use the tables in the order \[𝐭 𝟏 𝐭 𝟐 𝐭 𝟑 𝐭 𝟒 𝐭 𝟓 𝐭 𝟔 𝐭 𝟕 𝐭 𝟎\] \\begin{bmatrix} \\mathbf{t_1} & \\mathbf{t_2} & \\mathbf{t_3} & \\mathbf{t_4} & \\mathbf{t_5} & \\mathbf{t_6} & \\mathbf{t_7} & \\mathbf{t_0} \\end{bmatrix}.

Now we simply need to drown our PC in a quagmire of nested for loops, each time calculating the quadratic mappings for the signature and comparing them:

```rust
for s0 in 0..P {
  for s1 in 0..P {
    for s2 in 0..P {
      for s3 in 0..P {
        for s4 in 0..P {
          for s5 in 0..P {
            for s6 in 0..P {
              for s7 in 0..P {
                let expanded = expand(&[s0, s1, s2, s3, s4, s5, s6, s7]);
                for byte_index in 0..8 {
                  let d = dot_product(&expanded, &DOT_PRODUCT_TABLES[byte_index]);
                  if d % P != digest_mapping[byte_index] {
                    break;
                  }
                  if byte_index == 7 {
                    let result = format!("{s0:02x} {s1:02x} {s2:02x} {s3:02x} {s4:02x} {s5:02x} {s6:02x} {s7:02x}");
                    println!("Signature solved: {result}");
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

This time we use the tables in the order \[𝐭 𝟎 𝐭 𝟏 𝐭 𝟐 𝐭 𝟑 𝐭 𝟒 𝐭 𝟓 𝐭 𝟔 𝐭 𝟕\] \\begin{bmatrix} \\mathbf{t_0} & \\mathbf{t_1} & \\mathbf{t_2} & \\mathbf{t_3} & \\mathbf{t_4} & \\mathbf{t_5} & \\mathbf{t_6} & \\mathbf{t_7} \\end{bmatrix}, and that’s literally it – this tests every possible value of the signature. Note that in order to improve performance, we break out of the inner loop as soon as one quadratic mapping doesn’t match, so that we don’t waste time calculating all 8 every time.

The runtime on a high-end PC from 2020? **26,000 years.** That’s a problem. We can actually re-arrange this code and make quite a lot of optimizations, but no matter what we do, we can never escape the computationally infeasible amount of nested looping. We have to analyze the algorithm instead – which is where knowing the math comes in handy!

### Exploiting quadratic expansion

Suppose you have a 3-byte signature 𝐬 \\bf{s} that you want to test, so you produce its quadratic expansion, just as before:

𝐬 \= \[s 0 s 1 s 2\] 𝐞 𝐬 \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] \\begin{align} \\mathbf{s} = \\begin{bmatrix} s_0 & s_1 & s_2\\end{bmatrix} \\\\ \\mathbf{e_s} = \\begin{bmatrix} s_0^2 & s_0s_1 & s_0s_2 & s_1^2 & s_1s_2 & s_2^2\\end{bmatrix} \\end{align}

Now imagine – just for fun – that you double the value of every signature byte:

𝐬 \= \[2 s 0 2 s 1 2 s 2\] \\mathbf{s} = \\begin{bmatrix} 2s_0 & 2s_1 & 2s_2\\end{bmatrix}

What happens to the quadratic expansion?

𝐞 𝐬 \= \[2 s 0 ⋅ 2 s 0 2 s 0 ⋅ 2 s 1 2 s 0 ⋅ 2 s 2 2 s 1 ⋅ 2 s 1 2 s 1 ⋅ 2 s 2 2 s 2 ⋅ 2 s 2\] \= \[4 s 0 2 4 s 0 s 1 4 s 0 s 2 4 s 1 2 4 s 1 s 2 4 s 2 2\] \\begin{align} \\mathbf{e_s} = \\begin{bmatrix} 2s_0 \\cdot 2s_0 & 2s_0 \\cdot 2s_1 & 2s_0 \\cdot 2s_2 & 2s_1 \\cdot 2s_1 & 2s_1 \\cdot 2s_2 & 2s_2 \\cdot 2s_2\\end{bmatrix} \\\\ = \\begin{bmatrix} 4s_0^2 & 4s_0s_1 & 4s_0s_2 & 4s_1^2 & 4s_1s_2 & 4s_2^2\\end{bmatrix} \\end{align}

Wow! Everything is multiplied by 4. This happens because every term in the quadratic expansion is the multiplication of two terms from the test signature, so if you double them all, every item will be multiplied by 2 \* 2 = 4.

As it happens, multiplying the input values by any number multiplies each output of the quadratic expansion by the square of that number. A succinct way of expressing that is:

e (x 𝐬) \= x 2 e (𝐬) e(x\\mathbf{s}) = x^2e(\\bf{s})

This just says, “if e e is the expansion function, then multiplying all the inputs by x x is the same as doing the expansion normally, but then multiplying all the outputs by x squared”. For example, as we saw above:

e (2 𝐬) \= 4 e (𝐬) e(2\\mathbf{s}) = 4 e(\\bf{s})

What happens to the quadratic mapping? Recall that the quadratic expansion is just multiplied by a table of coefficients in a dot product to get the output byte (mod 251). Since, by multiplying the input signature bytes by 2, we’ve caused the quadratic expansion bytes to be multiplied by 4, then the dot product also changes:

q s 0 \= 4 s 0 2 ⋅ t 0 0 + 4 s 0 s 1 ⋅ t 0 1 + 4 s 0 s 2 ⋅ t 0 2 + 4 s 1 2 ⋅ t 0 3 + 4 s 1 s 2 ⋅ t 0 4 + 4 s 2 2 ⋅ t 0 5 q\_{s_0} = 4s_0^2 \\cdot t\_{0_0} + 4s_0s_1 \\cdot t\_{0_1} + 4s_0s_2\\cdot t\_{0_2} + 4s_1^2\\cdot t\_{0_3} + 4s_1s_2 \\cdot t\_{0_4} +4s_2^2 \\cdot t\_{0_5}

(remember that 𝐭 𝟎 \\bf{t_0} is the dot product table for the first byte of the signature s 0 s_0)

Note that every term is now multiplied by 4. This means the result of the dot product and therefore the output of the quadratic mapping will also be multiplied by 4, as we can see if we factor the equation (just ignore this part if you don’t understand it):

q s 0 \= 4 (s 0 2 ⋅ t 0 0 + s 0 s 1 ⋅ t 0 1 + s 0 s 2 ⋅ t 0 2 + s 1 2 ⋅ t 0 3 + s 1 s 2 ⋅ t 0 4 + s 2 2 ⋅ t 0 5) q\_{s_0} = 4(s_0^2 \\cdot t\_{0_0} + s_0s_1 \\cdot t\_{0_1} + s_0s_2\\cdot t\_{0_2} + s_1^2\\cdot t\_{0_3} + s_1s_2 \\cdot t\_{0_4} +s_2^2 \\cdot t\_{0_5})

Or alternatively since reading long equations sucks:

𝐪 𝐬 \= 4 𝐞 𝐬 𝐒 \\mathbf{q_s} = 4\\mathbf{e_s}\\bf{S}

As you can see, multiplying the input signature bytes by 2 multiplies each quadratic mapping byte output by 4.

Therefore, we can scale the values of the test signature up or down however we like, without losing any information, and we can also reverse the scaling just as easily. The “shape” of the quadratic mapping outputs stays the same.

Okay, that’s super great Katy, but how does this help us? Well, if we scale every test signature such that one of the bytes – say s 0 s_0 – is always the same, then compare the resultant mappings to the *shape* of the message digest mappings instead of against exact equal values, we eliminate the need to search for the correct value of s 0 s_0 altogether, bringing our search space down from 251 8 to 251 7, or about 2 56.

When I say “shape” of the mappings, I mean how it would look if you plotted them on a line graph:

[![](https://katyscode.wordpress.com/wp-content/uploads/2026/03/image-1.png?w=946)](https://katyscode.wordpress.com/wp-content/uploads/2026/03/image-1.png)

Here, the blue line shows the desired quadratic mapping target values in circles, and the orange line shows the one we have calculated for the signature we’re testing. In the basic brute-force search, we would check these values for equality and the two lines would have to be identical. In this case, the numbers do not match so we can’t have the right signature. However, take a look at this:

[![](https://katyscode.wordpress.com/wp-content/uploads/2026/03/image-2.png?w=946)](https://katyscode.wordpress.com/wp-content/uploads/2026/03/image-2.png)

You’ll notice that that the signature mapping candidate output (orange) does not have the same values as the message digest mapping output (blue), so you might think we should reject it. However, we know we can scale it! Each orange value is 4x each blue value, therefore if we simply divide each byte of our input signature by 2, the orange line will match the blue line and we will have a valid signature!

We determine if the shape of each line is the same by creating two other lines:

-   Multiply the first value in the target by all of the values in the candidate
-   Multiply the first value in the candidate by all of the values in the target

Both of these lines will be identical if the shape of the two sets of quadratic mappings is the same. This is shown in the green/yellow line in the graph above – there are actually two lines, but they’re identical, so they sit at exactly the same place in the graph, confirming a match. Here is an example where the shapes are different, and what happens:

[![](https://katyscode.wordpress.com/wp-content/uploads/2026/03/image-3.png?w=946)](https://katyscode.wordpress.com/wp-content/uploads/2026/03/image-3.png)

Here the target and candidate do not share the same shape, and the shape testing lines are not identical.

The simplest way to scale our inputs is to fix s 0 s_0 to 1 and scale all the other input bytes by the same amount, by dividing them all by s 0 s_0:

𝐬 𝐬 𝐜 𝐚 𝐥 𝐞 𝐝 \= \[s 0 s 1 ⋯ s 7\] s 0 \\mathbf{s\_{scaled}} = \\frac{ \\begin{bmatrix}s_0 & s_1 & \\cdots & s_7\\end{bmatrix}}{s_0}

Having now reduced the first byte of the input to nothing more than a scaling factor, the byte will always be 1, and we can eliminate it from the search space.

Notice that this won’t find every valid signature, only ones where s 0 \= d 0 s_0 = d_0, that is to say, when the first valid signature byte is the same as the first message digest byte, because both have been scaled to be 1. This may seem weird – why would they be related and what if no such signature exists? The answer is that they don’t have to be related, because such a signature must *always* exist. Since we are working in 𝔽 251 \\mathbb{F}\_{251}, there are 250 possible shapes that can be scaled to a valid signature when using any given byte of 𝐬 \\bf{s} as the scaling factor (every possible value except zero). We’re using s 0 s_0, so since every possible value of s 0 s_0 must appear in a matching shape (valid signature), one of them by definition must also equal d 0 d_0.

**WARNING: This does not work if** s 0 s_0 **is zero!** Assuming valid signatures are evenly distributed, this means there is a 1 in 251 chance we might miss a valid signature if the first byte happens to be 0. You can work around this by choosing any non-zero value in 𝐬 \\bf{s} as the scaling variable. This necessitates re-writing the code to keep track of which one you are using and shuffle all the loops around, of course. In this series, we’re going to casually sweep this problem under the rug and pretend it’s not there, like the true pro who adds `TODO` comments everywhere and then never actually does any of them. I should probably fix those one day.

#### The code

We’ll start by scaling the message digest before we search:

```rust
let scale_factor = message_digest[0];

// Divide every item in the message digest by message_digest[0]
let scaled_digest = message_digest.into_iter().map(|v| div_mod(*v, scale_factor));

// Get quadratic mapping of scaled message digest
let digest_mapping = quadratic_mapping(scaled_digest, &DOT_PRODUCT_TABLES, 1);
```

(note that `div_mod` performs modular division, we’ll come back to that later)

We eliminate the outer for loop searching over `s0` because we’ll no longer need it, and instead we’ll just assume that `s0 == 1` all the time.

The key part is where we check the results of the dot products, we have to check proportionality instead of an exact value. So instead of:

```rust
let expanded = expand(&[s0, s1, s2, s3, s4, s5, s6, s7]);
for byte_index in 0..8 {
  let d = dot_product(&expanded, &DOT_PRODUCT_TABLES[byte_index]);
  if d % P != digest_mapping[byte_index] {
    break;
  }
  if byte_index == 7 {
    let result = format!("{s0:02x} {s1:02x} {s2:02x} {s3:02x} {s4:02x} {s5:02x} {s6:02x} {s7:02x}");
    println!("Signature solved: {result}");
  }
```

we instead write:

```rust
let expanded = expand(&[1, s1, s2, s3, s4, s5, s6, s7]); // v0 replaced with 1
let mut signature_mapping_byte_0 = 0;
for byte_index in 0..8 {
  let d = dot_product(&expanded, &DOT_PRODUCT_TABLES[byte_index]);
  if byte_index == 0 {
    signature_mapping_byte_0 = d;
  }
  if (d * digest_mapping[0]) % P != (signature_mapping_byte_0 * digest_mapping[item]) % P {
    break;
  }
  if byte_index == 7 {
    let result = [1, s1, s2, s3, s4, s5, s6, s7].map(|v| (v * scale_factor) % P);
    let result = result.map(|r| format!("{r:02x}"));
    println!("Signature solved: {result}");
  }
```

We made several changes here:

-   we replace `s0` with `1` as this is our fixed value for `s0` after scaling
-   we store the quadratic mapping of the first byte of the signature in `signature_mapping_byte_0` because we need it to calculate the gradients
-   instead of checking for value equality on each mapping, we check if the line gradients are the same using the multiplication trick described earlier
-   if we find a match, we have to remember to un-scale the result before printing it out

After cutting the search space by a factor of 251x, our new search time is … **98 years**. Sad trumpet. It is, however, a massive speedup compared to 26,000 years, so, at least it’s not measured in millennia now.

Can we do better than this? Of course we can!

### Exploiting a quadratic with one unknown variable

The original system is 8 quadratic equations over 8 unknown variables. By replacing one of the inputs s 0 s_0 with 1, we now have 8 quadratic equations over 7 unknowns. Currently we are brute-forcing all 7 variables (7 bytes), but if we can reduce any of the equations to a single unknown variable, we can trivially solve it. This is because the basic quadratic equation form:

a x 2 + b x + c \= 0 ax^2 + bx + c = 0

where x x is the unknown, can be solved with a well-known formula called the *quadratic formula*. You don’t need to understand the formula in order to use it, but we will need to implement it in code for 𝔽 251 \\mathbb{F}\_{251}, so let’s just leave it here:

x \= − b ± b 2 − 4 a c 2 a x=\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}

*(the symbol ± \\pm simply means we are writing shorthand for two versions of the same formula: one where we replace it with a +, and one where we replace it with a -)*

Woah, stay calm! I realize this may look quite alarming to many of you, so I’ll reiterate, *we only need to write code for this, we don’t need to understand how it works*. What we do need to understand is that it only works when there is a single unknown variable, and that’s why we want to try to reduce one of our eight equations to have one variable.

Fortunately, this is pretty straightforward: we pick a variable that we want to solve for. I chose s 3 s_3 (which would become x x in the formula above) but it doesn’t matter which you choose. We remove the loop for it, leaving us with a brute force over the six variables s 1,s 2,s 4,s 5,s 6,s 7 s_1, s_2, s_4, s_5, s_6, s_7, plus we already fixed s 0 s_0 to 1 via scaling, so now we have a total of 7 variables with known, assigned values. We can substitute these values into any of the 8 quadratic equations of our choosing (again, it doesn’t matter which), replacing all of the letters with numbers and leaving just one unknown s 3 s_3, which we can then solve by using it as x x in the quadratic formula.

Notice how this trick and the scaling trick are completely independent, but can be stacked for double (or 251x if you’re being pedantic) the brute-force power!

You can read more about quadratic equations in [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) of this series but I’m going to walk through this step by step, because while this is relatively straightforward to describe, understanding how it actually works and implementing it in code is somewhat challenging. Let’s return to our trusty 3-byte toy example, and take as much time as you need to work back and forth through the explanation.

#### Building the equation

We say hello to our little friend, the 3-byte signature and its expansion:

𝐬 \= \[s 0 s 1 s 2\] 𝐞 𝐬 \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] \\begin{align} \\mathbf{s} = \\begin{bmatrix} s_0 & s_1 & s_2\\end{bmatrix} \\\\ \\mathbf{e_s} = \\begin{bmatrix} s_0^2 & s_0s_1 & s_0s_2 & s_1^2 & s_1s_2 & s_2^2\\end{bmatrix} \\end{align}

Back in [part 2](https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/) we also invented some dot product tables for this, and we’re going to need those too. I’m too old to remember a table of 18 numbers nowadays so let’s reproduce them here:

𝐭 𝟎 \= \[13 4 8 7 3 10\],𝐭 𝟏 \= \[2 15 11 12 8 7\],𝐭 𝟐 \= \[5 6 8 12 13 9\] \\mathbf{t_0}=\\begin{bmatrix} 13 \\\\ 4 \\\\ 8 \\\\ 7 \\\\ 3 \\\\ 10 \\end{bmatrix},\\quad \\mathbf{t_1}= \\begin{bmatrix} 2 \\\\ 15 \\\\ 11 \\\\ 12 \\\\ 8 \\\\ 7 \\end{bmatrix},\\quad \\mathbf{t_2}=\\begin{bmatrix} 5 \\\\ 6 \\\\ 8 \\\\ 12 \\\\ 13 \\\\ 9 \\end{bmatrix}

There are three equations – one for each byte. Let’s write the first one, as we did in part 2:

q s 0 \= 13 s 0 2 + 4 s 0 s 1 + 8 s 0 s 2 + 7 s 1 2 + 3 s 1 s 2 + 10 s 2 2 q\_{s_0} = 13s_0^2 + 4s_0s_1 + 8s_0s_2 + 7s_1^2 + 3s_1s_2 + 10s_2^2

Each quadratic expansion term is multiplied with each entry in 𝐭 𝟎 \\bf{t_0}, and they are summed to get the mapping for the first byte.

We are calculating the first byte of the signature mapping here, and we would compare q s 0 q\_{s_0} to q d 0 q\_{d_0} later to check that the byte matches the first byte of the message digest mapping. In other words, we want the result of the equation (the first byte of the signature mapping) to equal the first byte of the message digest mapping. If we can’t pick values for 𝐬 \\bf{s} that satisfy this requirement, then we can’t be trying a valid signature. So, instead of writing *what we’re calculating* by assigning the result of the equation to q s 0 q\_{s_0}, we can instead write *what we actually want*:

13 s 0 2 + 4 s 0 s 1 + 8 s 0 s 2 + 7 s 1 2 + 3 s 1 s 2 + 10 s 2 2 \= q d 0 13s_0^2 + 4s_0s_1 + 8s_0s_2 + 7s_1^2 + 3s_1s_2 + 10s_2^2 = q\_{d_0}

We don’t bother “saving” the result of the equation in q s 0 q\_{s_0}. Instead we say, we need this equation’s value to be the same as the first byte of the message digest mapping (q d 0 q\_{d_0}). If it’s not, we have the wrong values for 𝐬 \\bf{s}.

The next step is to replace 𝐬 \\bf{s} and make sure we’re using the scaled version of 𝐬 \\bf{s} instead:

𝐬 𝐬 𝐜 𝐚 𝐥 𝐞 𝐝 \= \[s 0 s 1 s 2\] s 0 \= \[1 s 1 s 0 s 2 s 0\] \\mathbf{s\_{scaled}} = \\frac{ \\begin{bmatrix}s_0 & s_1 & s_2\\end{bmatrix}}{s_0} = \\begin{bmatrix}1 & \\frac{s1}{s0} & \\frac{s2}{s0} \\end{bmatrix}

Now let’s say we re-write 𝐬 𝐬 𝐜 𝐚 𝐥 𝐞 𝐝 \\bf{s\_{scaled}} like this:

𝐬 𝐬 𝐜 𝐚 𝐥 𝐞 𝐝 \= \[1 s s c a l e d 1 s s c a l e d 2\] \\mathbf{s\_{scaled}} = \\begin{bmatrix}1 & s\_{scaled_1} & s\_{scaled_2} \\end{bmatrix}

This says, hey, we don’t actually care what s 1 s_1 or s 2 s_2 are because we’re just going to work with the scaled versions of the inputs – but crucially – it tells us that s s c a l e d 0 s\_{scaled_0} is always 1, so we can remove that as an unknown variable in the equation.

Now re-write the equation, replacing 𝐬 \\bf{s} with 𝐬 𝐬 𝐜 𝐚 𝐥 𝐞 𝐝 \\bf{s\_{scaled}}:

13 + 4 s s c a l e d 1 + 8 s s c a l e d 2 + 7 s s c a l e d 1 2 + 3 s s c a l e d 1 s s c a l e d 2 + 10 s s c a l e d 2 2 \= q d 0 13 + 4s\_{scaled_1} + 8s\_{scaled_2} + {7s\_{scaled_1}}^2 + 3s\_{scaled_1}s\_{scaled_2} + {10s\_{scaled_2}}^2 = q\_{d_0}

Now we’re going to brute-force s s c a l e d 2 s\_{scaled_2}. This will leave only s s c a l e d 1 s\_{scaled_1} as the single unknown, then we can re-arrange the equation into the standard quadratic form, calculating a a, b b, and c c.

Let’s say for argument’s sake that we are currently testing a value of 50. Replace all s s c a l e d 2 s\_{scaled_2} in the equation with 50:

13 + 4 s s c a l e d 1 + 8 ⋅ 50 + 7 s s c a l e d 1 2 + 3 s s c a l e d 1 ⋅ 50 + 10 ⋅ 50 2 \= q d 0 13 + 4s\_{scaled_1} + 8\\cdot50 + {7s\_{scaled_1}}^2 + 3s\_{scaled_1}\\cdot50 + {10}\\cdot50^2 = q\_{d_0}

Now we can mop up all the loose values and collect them together. First the constants:

4 s s c a l e d 1 + 7 s s c a l e d 1 2 + 3 s s c a l e d 1 ⋅ 50 + 25413 \= q d 0 4s\_{scaled_1} + {7s\_{scaled_1}}^2 + 3s\_{scaled_1}\\cdot50 + 25413 = q\_{d_0}

Then the linear terms (the ones that are just a number multiplied by s s c a l e d 1 s\_{scaled_1}):

7 s s c a l e d 1 2 + 154 s s c a l e d 1 + 25413 \= q d 0 {7s\_{scaled_1}}^2 + 154s\_{scaled_1} + 25413 = q\_{d_0}

The right-hand side of the standard quadratic form must always be zero, which we can accomplish by simply subtracting q d 0 q\_{d_0} from both sides:

7 s s c a l e d 1 2 + 154 s s c a l e d 1 + 25413 − q d 0 \= 0 {7s\_{scaled_1}}^2 + 154s\_{scaled_1} + 25413 – q\_{d_0} = 0

And now we can see this is in the standard quadratic form:

a x 2 + b x + c \= 0 x \= s s c a l e d 1 a \= 7 b \= 154 c \= 25413 − q d 0 \\begin{align} ax^2 + bx + c = 0 \\\\ \\\\ \\\\ x = s\_{scaled_1} \\\\ \\\\ a = 7 \\\\ \\\\ b = 154 \\\\ \\\\ c = 25413 – q\_{d_0} \\end{align}

Now we are finally ready to solve the equation using the quadratic formula, and can calculate s s c a l e d 1 s\_{scaled_1} directly. In this manner, we avoid brute-forcing s s c a l e d 1 s\_{scaled_1} altogether and instead calculate it by solving a single quadratic using the other two selected values – 1 and s s c a l e d 2 s\_{scaled_2} (in the real algorithm, it would be 7 known values – 1 and six brute-forced variables)

#### Coefficient calculation

Let’s look more closely at where the coefficients came from, because we’re going to need to find a way to calculate them in code. Each of a,b,c a, b, c is a summation of known values in 𝐬 \\bf{s} multiplied by entries from the dot product table for this byte (table 𝐭 𝟎 \\bf{t_0}), but we have to be really careful how we combine them. There are three possibilities:

-   **quadratic terms in only the unknown variable s s c a l e d 1 s\_{scaled_1}.** – *quadratic terms*  
      
    There will always be only a single quadratic term a ⋅ s s c a l e d 1 2 {a \\cdot s\_{scaled_1}}^2 in our equations. The value a a is called the *quadratic coefficient* (because it multiplies with a quadratic term).  
    
-   **quadratic terms that involve both s s c a l e d 1 s\_{scaled_1} and one of the other signature input bytes.** – *cross terms*  
      
    Ignoring scaling for a moment, the terms would be \[b 0 ⋅ s s c a l e d 0 s s c a l e d 1 b 1 ⋅ s s c a l e d 1 s s c a l e d 2\] \\begin{bmatrix} b_0 \\cdot s\_{scaled_0}s\_{scaled_1} & b_1 \\cdot s\_{scaled_1}s\_{scaled_2} \\end{bmatrix} in our equations, where b x b_x is just some entry from the dot product table. We would like to reduce these to only involve s s c a l e d 1 s\_{scaled_1}, and we’ll see how to do that shortly. When we reduce them to contain just the coefficient b b and s s c a l e d 1 s\_{scaled_1}, they become linear terms because now the coefficient is only multiplied by one variable instead of two. The value b b is then called the linear coefficient (because it multiplies with a single variable).  
    
-   **any term that doesn’t involve s s c a l e d 1 s\_{scaled_1} at all.** – *constant terms*  
      
    This would be: \[c 0 ⋅ s s c a l e d 0 2 c 1 ⋅ s s c a l e d 0 s s c a l e d 2 c 2 ⋅ s s c a l e d 2 2\] \\begin{bmatrix} {c_0 \\cdot s\_{scaled_0}}^2 & c_1 \\cdot s\_{scaled_0}s\_{scaled_2} & c_2 \\cdot {s\_{scaled_2}}^2 \\end{bmatrix} where again, c x c_x is just some entry from the dot product table. c c is called the *constant coefficient*.

So, let’s clear the slate, start with the basic quadratic equation, figure out the coefficients one at a time and fill them in. The starting point:

a x 2 + b x + c \= 0 ax^2 + bx + c = 0

The dot product for this input byte again for reference:

𝐪 𝐬 𝟎 \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] ∙ \[13 4 8 7 3 10\] \\mathbf{q\_{s_0}} = \\begin{bmatrix} s_0^2 \\\\ s_0s_1 \\\\ s_0s_2 \\\\ s_1^2 \\\\ s_1s_2 \\\\ s_2^2 \\end{bmatrix} \\bullet \\begin{bmatrix} 13 \\\\ 4 \\\\ 8 \\\\ 7 \\\\ 3 \\\\ 10 \\end{bmatrix}

Let’s build! The unscaled version of s s c a l e d 1 2 {s\_{scaled_1}}^2 appears in row 3 (s 1 2 s_1^2), so we can trivially set the quadratic coefficient:

a \= 7 a = 7

This lets us fill in the first (quadratic) part of the quadratic equation:

7 x 2 + b x + c \= 0 7x^2 + bx + c = 0

The unscaled version of the cross-terms \[b 0 ⋅ s s c a l e d 0 s s c a l e d 1 b 1 ⋅ s s c a l e d 1 s s c a l e d 2\] \\begin{bmatrix} b_0 \\cdot s\_{scaled_0}s\_{scaled_1} & b_1 \\cdot s\_{scaled_1}s\_{scaled_2} \\end{bmatrix} appear in rows 1 and 4, but remember, we are trying to solve for s s c a l e d 1 s\_{scaled_1}, we know the values for the other inputs and we only want the coefficient, so we divide all the terms by s s c a l e d 1 s\_{scaled_1} to get rid of it, and we are left with the linear coefficient:

b \= t 0 1 ⋅ s s c a l e d 0 + t 0 4 ⋅ s s c a l e d 2 \= 4 ⋅ 1 + 3 ⋅ 50 \= 154 \\begin{align} b = t\_{0_1} \\cdot s\_{scaled_0} + t\_{0_4} \\cdot s\_{scaled_2} \\\\ \\\\ = 4 \\cdot 1 + 3 \\cdot 50 = 154 \\end{align}

(remember that we are currently brute-forcing s s c a l e d 2 \= 50 s\_{scaled_2} = 50)

This lets us fill in second (linear) part of the quadratic equation:

7 x 2 + 154 x + c \= 0 7x^2 + 154x + c = 0

Finally, we come to the constant terms \[c 0 ⋅ s s c a l e d 0 2 c 1 ⋅ s s c a l e d 0 s s c a l e d 2 c 2 ⋅ s s c a l e d 2 2\] \\begin{bmatrix} {c_0 \\cdot s\_{scaled_0}}^2 & c_1 \\cdot s\_{scaled_0}s\_{scaled_2} & c_2 \\cdot {s\_{scaled_2}}^2 \\end{bmatrix}.

This is much simpler because we know every value!

c \= 13 ⋅ 1 2 + 8 ⋅ 1 ⋅ 50 + 10 ⋅ 50 2 − q d 0 \= 25413 − q d 0 c = 13 \\cdot 1^2 + 8 \\cdot 1 \\cdot 50 + 10 \\cdot 50^2 – q\_{d_0} = 25413 – q\_{d_0}

We can then fill in the third (constant) part of the quadratic equation:

7 x 2 + 154 x + 25413 − q d 0 \= 0 7x^2 + 154x + 25413 – q\_{d_0} = 0

Note:

-   We have used every term of the quadratic expansion exactly once
-   We have used every value in the dot product table exactly once
-   We remember to subtract the message digest mapping we’re looking for so that the right-hand side of the quadratic equation equals zero

Let’s see how to do it in code:

```rust
// Scale message digest
let scale_factor = message_digest[0];

// Divide every item in the message digest by message_digest[0]
let scaled_digest = message_digest.into_iter().map(|v| div_mod(*v, scale_factor));

// Get quadratic mapping of scaled message digest
let digest_mapping = quadratic_mapping(scaled_digest, &DOT_PRODUCT_TABLES, 1);

// Fix s0
let s0 = 1;

// Using first equation, so select first table
// NOT the one for the byte we are solving for!
let t = DOT_PRODUCT_TABLES[0];    

// Brute-force s2
for s2 in 0..P {
  let a = t[3];                     // Quadratic coefficient
  let b = t[1] * s0 + t[4] * s2;    // Linear coefficient
  let c = t[0] * s0 * s0 + t[2] * s0 * s2 + t[5] * s2 * s2 - digest_mapping[0];
                                    // Constant coefficient
  // Solve
  let s1 = solve_quadratic(a, b, c);
}
```

…or so you would hope. Unfortunately there is a bit of a snag. Due to the way division in prime fields works, quadratic formulas in 𝔽 251 \\mathbb{F}\_{251} can have either 0 or 2 solutions, or *roots*. This means we have to:

-   check the number of roots
-   if none, skip to the next value of s s c a l e d 2 s\_{scaled_2} in the brute-force search
-   if two, check *both* roots as possible solutions to the equation, and pick the right one

That looks something like this:

```rust
// Takes the known values we calculated from the expansion,
// the dot product table for a particular byte, calculates
// its quadratic mapping and checks if it equals
// the corresponding digest mapping byte
fn check_equation(expansion_terms: &[u32], coefficients: &DotProductTable, expected: u32) -> bool {
  let d = dot_product(expansion_terms, coefficients);
  d == expected
}

// .....
// Inside brute-force loop
let s1_roots = solve_quadratic(a, b, c);
if s1_roots.len() == 0 {
  continue;
}

let s1;
if check_equation(&[1, s1_roots[0], s2], &t, digest_mapping[0]) {
  s1 = s1_roots[0];
} else {
  // If it's not one root, it must be the other one
  // since we know there is a valid solution
  s1 = s1_roots[1];
}
```

Note for Rust programmers

The idiomatic way of doing this in Rust is to use an `Option<(u32, 32)>` as the return value from `solve_quadratic` and write the code as follows:

```rust
let s1_roots = solve_quadratic(a, b, c);
let s1 = if let Some((s1_root1, s1_root2)) = s1_roots {
  if check_equation(&[1, s1_root1, s2], &t, digest_mapping[0]) {
    s1_root1
  } else {
    s1_root2
  }
} else {
  continue;
};
```

I’m going to stick with the more portable version above to avoid getting too deep into Rust semantics for those less familiar.

Once we have found the roots for s s c a l e d 1 s\_{scaled_1}, it’s then necessary to check it against the other the other two equations for the other two bytes just like before. Here is the complete code:

```rust
fn find_signature(message_digest: &[u32]) {
  // Scale message digest
  let scale_factor = message_digest[0];
  let scaled_digest = message_digest.into_iter().map(|v| div_mod(*v, scale_factor));
  let digest_mapping = quadratic_mapping(scaled_digest, &DOT_PRODUCT_TABLES, 1);

  // Fix s0
  let s0 = 0;

  // Using first equation, so select first table
  // NOT the one we are solving for!
  let t = &DOT_PRODUCT_TABLES[0]; 
  
  // Brute-force over s2
  for s2 in 0..P {

    // Quadratic coefficient
    let a = t[3];

    // Linear coefficient
    let b = t[1] * s0 + t[4] * s2;

    // Constant coefficient
    // Remember to subtract q_d_0!
    let c = t[0] * s0 * s0 + t[2] * s0 * s2 + t[5] * s2 * s2 - digest_mapping[0];

    // Solve
    let s1_roots = solve_quadratic(a, b, c);
    if s1_roots.len() == 0 {
      continue;
    }
    
    let s1;
    let expanded = expand(&[1, s1_roots[0], s2]);
    if check_equation(&expanded, &t, digest_mapping[0]) {
      s1 = s1_roots[0];
    } else {
      // If it's not one root, it must be the other one
      // since we know there is a valid solution
      s1 = s1_roots[1];
    }

    // Perform expansion only once for all of the remaining equations
    let expanded = expand(&[1, s1, s2]);

    // Index starts at 1 because we don't need to check the first equation
    for byte_index in 1..3 {
      if !check_equation(&expanded, &DOT_PRODUCT_TABLES[byte_index], digest_mapping[byte_index]) {
        break;
      }
      if byte_index == 2 {
        let result = [1, s1, s2].map(|v| (v * scale_factor) % P);
        let result = result.map(|r| format!("{r:02x}"));
        println!("Signature solved: {result}");
      }
    }
  }
}
```

There’s no need to check the first equation anymore because we already solved it.

The solution for the full 8-byte signature algorithm is exactly the same as this, except we have 6 nested loops instead of a single one, and the calculations of `b` and `c` require many more terms. To save needlessly calculating some of the coefficients over and over, we also put some of the calculations in loops above the inner one and re-use them. For example:

```rust
for s4 in 0..P {
  for s5 in 0..P {
    for s6 in 0..P {
      for s7 in 0..P {
        // Calculate the part of c that uses s4-s7
        let mut c_outer = 0;
        for i in 4..8 {
            for j in i..8 {
                c_outer += expanded_by_index[i][j] * s[i] * s[j];
            }
        }
        for s1 in 0..P {
          for s2 in 0..P {
            // When we calculate a, b and the part of c that uses
            // s1 and s2 here, we can add c_outer to c
            // to avoid recalculating that part of c 251^2 times
          }
        }
      }
    }
  }
}
```

*(in this example, `expanded_by_index` is an array that lets you address the coefficients in the dot product table by indexing them via their signature byte pair expansion indexes, eg. `expanded_by_index[1][2]` is the coefficient for* s 1 s 2 s_1s_2. *The process of making an array like this is called* diagonalizing *and we’ll look at it in part 4)*

If you made it this far, congratulations (and also damn, well done). We have once again cut down the search space by a factor of 251, from 251 7 to 251 6 – or around 2 48.

How is our runtime looking now? **242 days** on our test PC. That might still sound like a lot, but remember that this is single-threaded execution and we only need to craft one or a small number of messages to achieve our goals. With many optimizations that we’ll look at later, I was able to reduce the runtime to approximately **131 days**, then by achieving near-linear scaling with multi-threading using all 24 cores (48 threads) available on our test PC, this time was further reduced to about **75 hours** or just over 3 days. This was in fact the first version of the crack with which we were able to produce valid signatures that could fool the smart card.

Notice how going from 251 8 to 251 7 gave us approximately the expected speedup of 251x (it was actually around 265x), but going from 251 7 to 251 6 – ie. 98 years to 242 days – is only a 147x speedup. Why is this? The answer is simply that the inner loop now has much more work to do – instead of just calculating a quadratic mapping, we are now also building and solving an equation. So while the search space has reduced, the time to test each individual signature has increased. Obviously, the trade-off is more than worth it.

## Prime field modular arithmetic in code

You may have noticed that we didn’t provide a code implementation of the quadratic formula yet, or the division that allows us to scale the test inputs. That is because – as you may recall from [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) – to perform division in a prime field requires you to multiply a number by its inverse, which we also stated was non-trivial to calculate. The reason for this is that the solution requires us to calculate x 249, which is a very high exponent when you’re working with 64-bit integers (the exponent is the number we’re raising to the power of; when we square a number as in 5 2, the exponent is 2). The highest number we might want to invert is 250, and 250 249 equals 10 600 – or 1 with almost 600 zeroes after it! That’s about 10 520 **times** more than the number of atoms in the known universe. By comparison, a 64-bit integer can store a measly 18 \* 10 18 values. Similarly, calculating a square root in a prime field – as required by the quadratic formula – also requires calculations using large exponents. We’re going to have to get creative; and by that, I mean we’re going to have to steal well-known algorithms designed by people much smarter than us.

***This section is completely optional.** If you don’t care about the algorithms here, that’s fine: just copy paste the code and skip the entire section because again, it’s only tangential to our work. However, since we do need to implement these functions, I’m going to include a brief description of each.*

#### Exponentiation by squaring

Exponentiation by squaring is a method of calculating b e b^e – that is, base b b to the power of exponent e e, used when e e is a potentially large number. There are many implementations, but the one we use will:

-   start with a base value b b that is the same as the supplied base
-   start with a result value n n of 1, and perform a loop where:
    -   if the current exponent is odd, multiply the result by the base
    -   in all cases, square the base
    -   halve the exponent

Mathematically, and using t t to represent each each loop iteration, we can write:

n t \= { n t − 1 ⋅ b t − 1 iff e is odd n t − 1 iff e is even n_t = \\begin{cases} n\_{t{-}1} \\cdot b\_{t{-}1}\\quad\\;\\text{iff}\\; e\\;\\text{is odd} \\\\ n\_{t{-}1} \\quad\\quad \\text{iff} \\;e\\;\\text{is even} \\end{cases} b t \= b t − 1 2 b_t = {b\_{t{-}1}}^2 e t \= e t − 1 2 e_t = \\frac{e\_{t{-}1}}{2}

*(the large curly bracket notation just represents the arms of an `if` statement, or cases in a `switch` statement. The difference is that the output of the `if` or `case` comes at the start of each statement, and the condition comes at the end. i f f iff means “if and only if”*)

Let’s see how this works out for the simple example of 3 9 = 19,683.

We start with:

n \= 1,b \= 3,e \= 9 n = 1, \\quad b = 3, \\quad e = 9

Let’s see how they evolve over each loop iteration:

t n b e 0 3 9 4 1 3 81 2 2 3 6561 1 3 𝟏𝟗𝟔𝟖𝟑 43046721 0 \\begin{array}{c|c|c|c} \\hline t & n & b & e \\\\ \\hline 0 & 3 & 9 & 4 \\\\ 1 & 3 & 81 & 2 \\\\ 2 & 3 & 6561 & 1 \\\\ 3 & \\mathbf{19683} & 43046721 & 0 \\\\ \\hline \\end{array}

Because it only involves multiplication, we can trivially convert this to work in 𝔽 251 \\mathbb{F}\_{251} by performing each multiplication mod 251.

Exponentiation by squaring in Rust

```rust
// Fast exponentiation - calculate base^exp in mod P space
// Runs in O(n log x)^k) time
pub fn fast_exp_mod(mut base: u32, mut exp: u32) -> u32 {
    let mut result = 1;
    base %= P;

    while exp > 0 {
        if exp & 1 == 1 {              // Check if exponent is odd
            result = (result * base) % P;
        }
        base = (base * base) % P;
        exp >>= 1;                     // exp is integer so halving rounds down
    }
    result
}
```

See [Exponentiation by squaring](https://en.wikipedia.org/wiki/Exponentiation_by_squaring) on Wikipedia for more detailed information.

#### Finding the inverse: Fermat’s little theorem

The basis of Fermat’s little theorem is that for any number x x in a prime field 𝔽 p \\mathbb{F}\_p:

x p \= x (m o d p) x^p = x\\quad(mod\\;p)

That is to say, in our field, 5 251 = 5 and 20 251 = 20, and so on for any value.

Recall in [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) that we wanted to calculate the inverse i i of a number by satisfying this equation:

x ∗ i \= 1 (m o d p) x \* i = 1\\quad(mod\\ p)

We’d like to get i i on its own somehow. If we take Fermat’s equation and divide both sides by x x, we get:

x p − 1 \= 1 (m o d p) x^{p{-}1} = 1\\quad(mod\\;p)

Notice that both equations now equal 1, which means they are equivalent:

x p − 1 \= x ∗ i (m o d p) x^{p{-}1} = x \* i\\quad(mod\\;p)

Finally, divide both sides by x x once more:

x p − 2 \= i (m o d p) x^{p{-}2} = i\\quad(mod\\;p)

Now we have isolated i i and know how to calculate it! Since we’re working in 𝔽 251 \\mathbb{F}\_{251}, getting the inverse of any value x x is now easy:

i \= x 249 (m o d 251) i = x^{249}\\quad(mod\\;251)

Since we’ve implemented exponentiation by squaring already, this is now trivial to implement in code. It’s literally just:

```rust
fn inv_mod(x: u32) -> u32 {
  fast_exp_mod(x, P - 2)
}
```

See [Fermat’s little theorem](https://en.wikipedia.org/wiki/Fermat's_little_theorem) on Wikipedia for more information.

#### Division

Division is now super-easy because all we have to do is multiply the value we want to divide (the dividend) by the inverse of the value we want to divide *by* (the divisor):

```rust
fn div_mod(a: u32, b: u32) -> u32 {
  let i = inv_mod(b);
  (a * i) % P
}
```

#### Square roots in F251F\_{251}: A special case of Euler’s criterion

As you probably know, taking the *square root* of a number is like reversing a squaring operation. If 3 2 \= 9 3^2 = 9, then 9 \= 3 \\sqrt{9} = 3. It’s pretty easy to square a number – you just multiply it by itself. Finding the square root of a number is much more tricky and generally involves starting with a guess and tweaking it up or down while squaring it to find an approximate answer.

The rules for square roots in finite fields are rather complicated, but thanks to the choice of the designers to use 𝔽 251 \\mathbb{F}\_{251}, help is on the way! In *odd number-sized finite fields* such as this, *every number has exactly 0 or 2 roots*. A formula called Euler’s criterion gives a yes/no answer as to whether a particular value has square roots:

x p − 1 2 (m o d p) \= { 1 iff x has roots − 1 iff x does not have roots x^\\frac{p{-}1}{2} \\;(mod\\;p)= \\begin{cases} 1\\quad\\text{iff }x\\text{ has roots} \\\\ -1\\quad\\text{iff }x\\text{ does not have roots} \\end{cases}

In our work specifically, x 125 x^{125} will tell us if whether or not a number has roots. As it happens, only about half of the numbers in the field have roots, which immediately makes many quadratics unsolvable, allowing us to stop and move to the next signature to test without wasting extra time if we encounter this.

How do we calculate the actual roots? At this point, we’d be in quite a bit of trouble with a bunch of slow options to choose from, were it not for the fact that there is a special case of Euler’s criterion that our prime field just happens to satisfy: if, and only if, a prime field is over 3 (m o d 4) 3\\;(mod\\;4), we can use a special formula to calculate the square roots. As luck would have it, 251 m o d 4 \= 3 251 \\;mod\\; 4 = 3. How convenient!

The special formula is simple enough:

r \= ± x (p + 1) / 4 r = \\pm x^{(p{+}1)/4}

In our field, this means:

r 1 \= x 63 (m o d 251) r 2 \= − x 63 (m o d 251) \\begin{align} r_1 = x^{63} \\quad(mod\\;251)\\\\ r_2 = -x^{63} \\quad(mod\\;251) \\end{align}

where r 1 r_1 and r 2 r_2 are the two roots. We can’t have negative numbers of course, so we add the field size p \= 251 p = 251 to r 2 r_2, giving:

r 2 \= p − x 63 (m o d 251) r_2 = p – x^{63}\\quad(mod\\;251)

which is the same as:

r 2 \= p − r 1 (m o d 251) r_2 = p – r_1\\quad(mod\\;251)

Therefore, we don’t need to calculate the two roots individually – we can easily calculate one from the other just by subtracting it from 251.

Here is the code:

```rust
fn sqrt_mod(i: u32) -> Option<(u32, u32)> {
  // Euler's criterion: if v^((P - 1) / 2) != 1, there is a square root
  // -1 means no square root (note: since we're working mod 251, -1 == 250)
  
  let has_roots = fast_exp_mod(i, 125) == 1;
  if !has_roots {
    return None;
  }
  
  // sqrt(a) = a^((P+1)/4) % P, in a prime field where p mod 3 == 4
  root_1 = fast_exp_mod(i, 63) % P;
  root_2 = (P - root_1).rem_euclid(P);
  
  (root_1, root_2)
}
```

*Note for non-Rust programmers: the function `x.rem_euclid(P)` is exactly the same as `x % P` in other languages and you can read it as such. In most languages, the `%` operator forces the input to become a positive integer starting at 0, but less than the mod amount. In Rust, `%` also ensures the value is less than the mod amount, but does not change negative numbers. The `rem_euclid` function ensures the result is a positive integer, like `%` in other languages. Naturally, this function is only needed when we perform subtraction. Elsewhere, we use `%` as normal.*

See [Euler’s Criterion](https://en.wikipedia.org/wiki/Euler%27s_criterion) on Wikipedia for more information about Euler’s Criterion, and Ebru Adiguzel-Goktas and Enver Ozdemir’s paper [Square root computation in finite fields](https://www.researchgate.net/publication/378905037_Square_root_computation_in_finite_fields) for an in-depth treatise on this problem.

### Solving the quadratic in code

Finally, FINALLY!… we can write a function to solve a quadratic equation: Recapping the quadratic formula from earlier:

x \= − b ± b 2 − 4 a c 2 a x=\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}

We write the code as follows:

```rust
// Solves ax^2 + bx + c = 0
// There are either 0 or 2 solutions
// 0 solutions if there is no square root for the discriminant (b^2 - 4ac)
// 2 solutions otherwise
pub fn solve_quadratic(a: u32, b: u32, c: u32) -> Vec<u32> {
    // Non-quadratic will cause division by zero
    debug_assert_ne!(a, 0);

    let b_squared: i64 = b as i64 * b as i64;
    let four_ac: i64 = 4 * a as i64 * c as i64;
    let discriminant = (b_squared - four_ac).rem_euclid(P as i64) as u32;

    // Only about half of numbers in GF(251) have square roots
    // We'll either get 0 or 2 roots
    if let Some((root1, root2)) = sqrt_mod(discriminant) {
        let neg_b = (-(b as i32)).rem_euclid(P as i32);
        let mul_2a = 2 * a;

        // We can calculate x and -x now return them
        let x1 = div_mod((neg_b + root1 as i32) as u32, mul_2a);
        let x2 = div_mod((neg_b + root2 as i32) as u32, mul_2a);

        return vec![x1, x2];
    }
    vec![]       // Empty result if there are no roots
}
```

*Note to Rust programmers: Again, we would use `Option<(u32, u32)>` here as a return value instead of `Vec<u32>` but we’re keeping it readable for newcomers, as much as possible.*

There’s an unfortunate mountain of casts and a couple of calls to `rem_euclid` needed here in Rust to make sure nothing overflows or underflows, particularly because the quadratic formula can produce negative numbers. If you strip all that away, it’s a pretty vanilla implementation of the quadratic formula.

This was the final piece of the puzzle we needed to write a fully working crack tool – all that is left is to slam it all together into a file and compile it! You still remember we’re cracking a pay TV smart card, right?

### Pre-computation

You might be thinking that all of this exponentiation, inversing, division, calculating square roots and quadratic equation solving must be hella slow, and you’d be right. Computers love addition, subtraction and multiplication. They pretty much hate every other kind of arithmetic operation. When I benchmarked the program at this point, about 15% of the execution time was in these calculations, which is a lot when you’re talking about a runtime of days, weeks or even months (another major bottleneck was the quadratic expansion code).

Fortunately, finite fields come to the rescue yet again! Because there are only 251 possible values for any given argument to these functions, and the return values are either zero, one or two numbers with 251 possible values as well, we can make look-up tables (*LUTs)* of every possible return value for every possible combination of inputs to each function, doing all of the math before the search begins, and during the search we simply look up the results for any calculation we need to do in an array instead. In other words: we cheat the system.

Building a LUT is easy: you just perform the operation for every input and store the results in an array. Here’s an example for inversion mod P in Python for readability:

```python
def make_inv_table():
  let inv = []
  for m in range(P):
    inverted = fast_exp_mod(m, P-2)
    inv.append(inverted)
  return inv

# ...
MOD_INVERSE = make_inv_table()
```

Or if you prefer:

```python
MOD_INVERSE = [fast_exp_mod(m, P-2) for m in range(P)]
```

Rust equivalent:

```rust
const fn make_inv_table() -> [u32; P as usize] {
    let mut inv = [0u32; P as usize];

    let mut m = 0;
    while m < P {
        inv[m as usize] = fast_exp_mod(m, P - 2);
        m += 1;
    }
    inv
}

// ...
const MOD_INVERSE: [u32; P as usize] = make_inv_table();
```

Here, `[u32; P as usize]` is nothing more than a 251-item array of 32-bit integers. The variable `m` loops through every inversion we want to calculate – 0 to 250 – and the result is stored at the corresponding array index. The final array is assigned to `MOD_INVERSE` at startup. Now we just change the `inv_mod` function as follows:

```rust
#[inline(always)]
pub fn inv_mod(m: u32) -> u32 {
    MOD_INVERSE[(m % P) as usize]
}
```

Now, inversion mod 251 during search is just an array lookup. All we need to do is make sure that `m` is actually mod 251 before performing the lookup.

The techniques for the others are similar:

-   For square roots, we need two LUTs: one indicating whether any roots exist, and another for the first root. We don’t need to store the second root since it’s just `251 - root1`.
-   For quadratic solves, we create a single 3-dimensional LUT – `lut[a, b, c]` in languages that support it, otherwise nested arrays ie. `lut[a][b][c]`. `a`, `b` and `c` are the coefficients for the equation, and each array item is either nothing if there are no roots, or the two roots. This is typically `None` or `null` for nothing, and a two-item tuple or array for the roots.
-   For division, there is no real benefit in creating a LUT because the calculation is just `a * MOD_INVERSE[b]`
-   For exponentiation by squaring, it is used only by the functions that calculate the inverse and square roots, so there is no LUT to generate – the function isn’t used again once the inverse and square root tables have been generated

*Side note: In Rust you can use `const` functions to generate these tables at compile-time, but in most languages you’ll just call a function at the start of the program to generate all the tables.*

Once you’ve created all the LUTs, you can simply replace the function calls that would normally do the math with array lookups, and you’re done! In this particular program, we gain another 15% in search speed as a result of this optimization.

**Technical notes on optimization**  
  
You may notice that we use 32-bit integers (`u32`) for everything even though the maximum value 250 fits into a single 8-bit byte. This is for performance reasons: CPUs tend to prefer memory access in their native memory word size (32 or 64 bits on modern PCs); single byte access can actually be slower as the CPU is forced to fetch a 32-bit slice of memory and then rotate the bits around to get the 8 bits you want. You need to profile (benchmark) the behaviour of the program with LUTs as both 8, 32 and 64-bit integers to find the fastest option. The downside of this is that the tables use 4x more memory than they need to.  
  
For the quadratic solve tables, a 256 x 256 x 256 table may work better than 251 x 251 x 251 table because when indexing an array, it is easier for the CPU to multiply by 256 than 251. Multiplication by 256 only requires adding eight binary 0s to the end of a binary number (this is called a *left shift*). Multiplication by 251 actually requires several additions and left shifts and is much slower.  
  
Most of the LUTs are very small, but the quadratic table at 256 x 256 x 256 x 8 bytes (that’s 4 for each of the two possible solutions stored as 32-bit integers) is a relatively gigantic 128MB. This means it has to be allocated on the heap, whereas the other tables can generally be stored on the stack. It’s important to make sure you allocate a single contiguous block of memory so that calculating the memory address of a particular entry is easy either for the CPU or for you – just an offset from the start of the block where the starting areas for the lookups for `a`, `b` and `c` can be found using only left shifts. In C this is easily done with `malloc`, but in other languages it may not be so simple, for example in Python where you don’t have overt control over memory allocation. In the real implementation we used for this crack, the quadratic solve lookup is:  
  
`let solve = quadratic_lut[(a << 16) + (b << 8) + c) as usize];`  
  
where `<<` is left shift. Note this technique also reduces the number of array lookups from 3 to 1.  
  
Optimization is often a trade-off like this. Sometimes you may want to optimize for performance, other times to reduce memory footprint – for example if you’re writing software for a small embedded microcontroller (like a smart card!). However, optimizing for one usually leads to degradation of the other. Here we traded a chunk of memory in exchange for improved search speed. I mention this because it’s important to understand that optimization isn’t always “free”. Sometimes it comes with a cost, and the cost of building LUTs here is 128MB plus a few kilobytes for the other tables, whereas the program without LUTs uses about 2MB when running.  
  
Note also that the optimized code is harder to read, and therefore harder to maintain. It’s also more restrictive: the LUTs only work when the prime field is 𝔽 251 \\mathbb{F}\_{251}; if you change the prime field to 𝔽 7 \\mathbb{F}\_7 or 𝔽 13 \\mathbb{F}\_{13} for example, all of the LUTs become incorrect and have to be re-calculated. It’s important, then, that you do not begin to optimize your code until it actually works properly and produces the correct results. It’s also really important to profile your program to see where the bottlenecks actually lie. They are often not where you might intuitively expect, and you don’t want to waste tons of time optimizing the wrong thing. You can think of it like opening up huge highways for traffic, while neglecting that in order to get on those highways, all the cars have to drive through a tiny one-lane street made of cobblestones first.  
  
This happens for a whole host of reasons, suffice to say that memory, cache and thread management in both the OS and CPU, plus the instruction pipeline on the CPU, compiler behaviour and optimizations, resource locking and other considerations are all incredibly complicated nowadays and low-level behaviour can be very challenging for a human to understand. Profiling typically involves finding which functions the program spends the most time in – either because they’re slow or called very often from a hot path. Profiling your app lets you home in on the bottlenecks and address them – so you can fix the cobblestone street before determining whether you need new highways or not.  
  
**Inlining**  
  
Inlining tells the compiler to replace function calls with the function code directly, to eliminate the performance bottleneck of the time it takes to call and return from a function. This is negligible under normal conditions, but if you are calling the same function billions or trillions of times, it adds up. Imagine:  
  
`fn add(a: u64, b: u64) -> u64 { a + b }`  
  
`fn main():   let mut total = 0;   for i in 0..1_000_000_000 {   total = add(i, total);   }   `  
The majority of time spent in this loop will be calling and returning from `add`. The actual logic in the function executes far quicker than the actual call and return. We can force the compiler to “inline” the function by adding an attribute:  
  
`**#[inline(always)]**   fn add(a: u64, b: u64) -> u64 { a + b }   `  
Now the compiler will replace the call to `add` in the loop with:  
  
`for i in 0..1_000_000_000 {   total = i + total;   }`  
  
No function calls, improved performance. You can achieve the same in C with the `inline` keyword:  
  
`**inline** long long add(long long a, long long b) { return a + b; }`  
  
There is one difference: in C, `inline` is a *suggestion* to the compiler, whereas in Rust, you’re putting your foot down and demanding that the function *always* be inlined. The small functions in our Rust program are always prefixed with `#[inline(always)]` to squeeze out some extra drops of performance.

## Next time

In this article we started the crack with a computationally infeasible 2 64 -ish brute-force search, then leveraged the multiplicative properties of quadratic expansion and the ability to reduce one of the eight quadratics to be expressed with only one unknown variable in order to reduce the search space to 2 48, and in the process reduce the runtime from 26,000 years to 242 days. We also saw how to use LUTs to provide another approximately 15% speed increase to bring this down further to 205 days.

In part 4 of this series, we’re going full send as we deploy even more devious math to rewrite the search algorithm to run in 2 32 space, then add multi-threading to reduce the search time to 80 seconds. I hope you’re enjoying the series so far. Until next time!
