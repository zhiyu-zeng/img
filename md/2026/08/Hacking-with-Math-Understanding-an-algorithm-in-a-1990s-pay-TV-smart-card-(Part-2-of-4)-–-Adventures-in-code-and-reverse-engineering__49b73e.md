---
title: "Hacking with Math: Understanding an algorithm in a 1990s pay TV smart card (Part 2 of 4) – Adventures in code and reverse engineering"
source: https://katyscode.wordpress.com/2026/03/12/hacking-with-math-part-2-of-4/
source_host: katyscode.wordpress.com
clip_date: 2026-08-04T16:01:40+08:00
trace_id: 51568eb4-9524-4d37-bf0a-59fc38104fdd
content_hash: c0776da4da9d1ee7aaac8bd35e3705fdf2aca3c410e23efd5183ce6c2be23346
status: synced
tags:
  - 密码学
  - 智能卡逆向
series: null
feed_source: Katy's Code·IL2CPP逆向
ai_summary: 破解1997-1999年某付费电视智能卡签名的核心难题：消息摘要和签名各自经过两套不同的二次映射，需要找出使 q_s=q_d 的8字节签名s。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-8184-8dcc-d5e8d7c50853
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 破解1997-1999年某付费电视智能卡签名的核心难题：消息摘要和签名各自经过两套不同的二次映射，需要找出使 q_s=q_d 的8字节签名s。
> 
> - **系统结构：** 每条控制消息23字节，附带8字节（64位）签名；卡内校验先把消息压缩成8字节摘要，再分别对摘要和签名各用8个二次映射（在 𝔽_251 中）得到8字节输出，比较相等即通过。
> - **签名验证原理：** 摘要使用点积表集合 M，签名使用另一组点积表 S，两组输出一致才算有效；点积表藏在卡内，攻击者即使 dump 固件拿到 M/S，仍不知道签名端输入如何生成合法签名。
> - **数学形式：** 每个二次映射先将输入做二次展开（n 个输入产生 n(n+1)/2 个二次项：3字节示例为6项，实际8字节为36项），再与对应的系数做点积并取模251；整套算法可写成8个二次方程、8个未知数、每个方程含36个二次项、0个线性项、0个常数。
> - **攻击难点：** 合法签名由发送方持有的秘密函数生成，该函数与公开的 M/S 都有数学关系；仅凭卡内信息无法推出，只能对给定摘要大量穷举候选签名并验证，属于选择密文攻击场景。

1 Vote

In the [first part](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) of this mini-series, we hammered through a quick primer on equations and modular arithmetic in prime fields. In this part, we’ll examine a case study and use what we learned to:

-   understand and write down an algorithm used by a smart card to protect itself from malicious instructions sent by a bad actor
-   implement a copy of the algorithm in modern programming languages
-   get an overview on the problem we actually need to solve in order to reverse engineer it

As we go along, I’ll provide code equivalents to all the math to help you understand what all the symbols mean! We’ll primarily use Python for this, but *you do not need to have any experience with Python* as it is almost entirely just for loops, math and function calls, so if you can understand any language like JavaScript, C, C#, Java or Rust you will be fine here!

You will need to understand everything in [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) as this article builds upon that foundation.

### Case study

Pay TV is – as you probably know – a form of paywalled content delivery for TV channels and pay-per-view events. Subscribers pay for specific channel packages and these will become available to the viewer via their set-top box (STB, also known as a “receiver” or “decoder”), but no others. The subscriber can change their channel packages and premium channels at any time, and order PPV events (like one-time sport events), usually through a web site, app, or the box itself.

How does the broadcaster control which subscribers can see which content? There are various systems out there, but one is *smart card-based access control*. In this scenario, the broadcaster issues the subscriber with a physical smart card, which they leave inserted into a card slot in the receiver. This card contains the secret information needed to decrypt the picture and a list of channels the subscriber has paid for – and, crucially – the card will only give up this information when the receiver is tuned in to a subscribed channel.

How is the list of subscribed channels on the card kept up to date? The broadcaster sends additional information along with the sound and picture about which cards are subscribed to which channels. This information is fed to the smart card via the receiver, which then updates itself. If the user changes their channel package, the broadcaster will send a message to the affected card (again, via the receiver) to update its list of subscribed channels.

So far so good – but the astute reader might notice there is immediately a security problem. What is to stop a malicious user who wants to watch TV for free from just sending a message to their own card to enable every channel? This is where *digital signatures* come into play. A digital signature – much like a handwritten one – is designed to prove that a document or message did actually come from the person who claimed to write or create it, by virtue of signing it. On paper, this is probably a hieroglyphic scribble of your name, but in cryptography – the scientific discipline of techniques for secure communications – it is performed via some clever math.

The idea of digital signatures is that they should be very easy to check (“verify”) for legitimacy, but incredibly difficult to fake – ie. for a bad actor to sign a message. The legitimate person signing the message possesses some secret information (a “private key”) which makes it easy for them to mathematically sign any message they write, but – in a cryptographically secure system – virtually impossible for anyone who doesn’t have the key.

I want to stress that everything I just wrote applies only to the particular type of smart card system we are examining in this series, and there are several other methodologies used in other systems to accomplish the same goals. This is also all a magnificent simplification, but it sets the stage for what we’ll look at today: cracking how to sign any message we want for this particular type of smart card – which was used by a major pay TV provider from 1997-1999 – and therefore, if we know the message format, the ability to send a signed message to the card asking it to enable every channel for free viewing without a subscription.

#### The algorithm

Each message is 23 bytes long with an 8 byte (64-bit) signature. Signature verification works like this:

![](https://katyscode.wordpress.com/wp-content/uploads/2026/03/image.png?w=1024)

What values can I pick for 𝐬 \\mathbf{s} that will make 𝐪 \\mathbf{q_s} = 𝐝 \\mathbf{q_d}?

First the message is crunched into a *message digest*. You can think of this like a digital version of a fingerprint: you can get a fingerprint from a person, and you can check if a person has a certain fingerprint, but you can’t re-create a person just from the fingerprint alone, plus it’s extremely unlikely that two people have exactly the same fingerprint.

The same is true of message digests: you can get a digest from a message, and you can check if a message has a particular digest, but you can’t re-create the original message just from the digest alone, plus it’s extremely unlikely that two messages have exactly the same digest. This is ensured by making sure that the message digest is created using a *one-way hash function*, that is, a mathematical algorithm that jumbles up the message in such a way that too much information is lost to re-create the original message, but is still related closely enough to the original message that other messages are exceptionally unlikely to have the same message digest (in the event this happens, it’s called a *hash collision* or just a *collision*).

In this smart card, the created message digest and the supplied signature are both 8 bytes. We apply a *quadratic mapping* (see below) in 𝔽 251 \\mathbb{F}\_{251} to each byte in both (see [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) for more information about finite fields). The message digest uses a set of 8 mappings that we’ll call M M, and the signature uses a set of 8 mappings that we’ll call S S – a total of 16 quadratic mappings. This gives us two 8-byte outputs, which we then simply compare. If they’re the same, the signature is verified (and, in this case, the card will process any messages to activate new channels); if they’re different, the signature is wrong, and the card will ignore it, self-destruct or whatever else the broadcaster decides is appropriate punishment for our rude behaviour.

Code (Python)

```python
def calculate_quadratic_mappings(input, mapping_type):
  output = []
  for i in range(8):                               # one mapping for each byte
    mapping = calculate_single_quadratic_mapping(i, input[i], mapping_type)
    output.append(mapping % 251)                   # work in mod 251
  return output

# message is 23 bytes, signature is 8 bytes
def check_signature(message, signature):
  message_digest = calculate_digest(message)                      # 8 bytes

  q_map_digest = calculate_quadratic_mappings(message_digest, M)  # 8 bytes
  q_map_signature = calculate_quadratic_mappings(signature, S)    # 8 bytes

  if q_map_digest == q_map_signature:
     return True                                # signature correct
  else:
     return False                               # signature wrong
```

### Quadratic mapping

Quadratic mapping is basically when you take a bunch of values, multiply them all together to make lots of quadratic terms, multiply each term by a set of pre-defined coefficients and add it all together to get some number. Every starting value has to be multiplied by every other starting value (and itself) when making the list of quadratic terms.

Let’s take this real slow.

#### Quadratic expansion

Suppose you have three variables, x x y y and z z.

First we apply the step of *quadratic expansion*, which is the part where we multiply them all together. We get this list:

x 2,x y,x z,y 2,y z,z 2 x^2,\\newline xy,\\newline xz,\\newline y^2,\\newline yz,\\newline z^2

This is every possible combination in which we can multiply the variables together (note that x 2 x^2 is just the same as x x xx and so on)

What happened here? We took three linear terms (the three variables on their own) and turned them into six quadratic terms – because each variable is now multiplied by another variable (or itself). Hence the name quadratic *expansion*, because it expands a set of linear terms into a larger set of quadratic terms.

Code (Python)

```python
def quadratic_expansion(input):
  expansion = []
  for i in range(len(input)):                  # 0,         1,      2
    for j in range(i, len(input)):             # 0, 1, 2,   1, 2,   2
      expansion.append(input[i] * input[j])
  return expansion

def main():
  v = [x, y, z]
  expansion = quadratic_expansion(v)

  # Equivalent to:
  # expansion = [x * x, x * y, x * z, y * y, y * z, z * z]
```

#### Dot products

A dot product is when we take two lists of numbers, multiply the first item in each list, multiply the second item in each list and so on, then add them all together. It’s called dot product because “product” is a fancy term for multiply, and “dot” is the symbol used in equations for the operation.

If we have tables like:

\[2 3 4\] \\begin{bmatrix} 2 \\\\ 3 \\\\ 4 \\end{bmatrix}

and:

\[5 6 7\] \\begin{bmatrix} 5 \\\\ 6 \\\\ 7 \\end{bmatrix}

We can write the dot product of these tables as follows:

\[2 3 4\] ⋅ \[5 6 7\] \= 2 ⋅ 5 + 3 ⋅ 6 + 4 ⋅ 7 \= 10 + 18 + 28 \= 56 \\begin{align} \\begin{bmatrix}2 \\\\ 3 \\\\ 4\\end{bmatrix} \\cdot \\begin{bmatrix}5 \\\\ 6 \\\\ 7\\end{bmatrix} = 2\\cdot5 + 3\\cdot6 + 4\\cdot7 = 10 + 18 + 28 = 56 \\end{align}

Tables like these in math are called *matrices* (singular: *matrix*). A matrix is nothing more than a one or two-dimensional array of numbers, just as in regular coding – that’s it. A matrix with only one column like the tables above is called a column vector. A matrix with only one row is – perhaps unsurprisingly – called a row vector.

We’ll call column vectors used for dot products as above *dot product tables*, but please note that this is **not** an official mathematical term.

Code (Python using for loops)

```python
def dot_product(left, right):
  assert len(left) == len(right), "Both dot product vectors must be the same length"

  for i in range(len(left)):
    total += left[i] * right[i]
  return total

def main():
  left = [2, 3, 4]
  right = [5, 6, 7]
  dp = dot_product(left, right)
```

Code (JavaScript with zip, map and sum for a more functional programming approach)

```javascript
const _ = require("lodash");

const left = [2, 3, 4];
const right = [5, 6, 7];

const pairs = _.zip(left, right);                 // Create list of tuples
const multiplied = pairs.map(([a, b]) => a * b);  // Multiply each tuple pair
const dotProduct = _.sum(multiplied);             // Sum the multiplied values
```

#### Putting it together

Now, to create a particular quadratic mapping, we take all the values we calculated from the quadratic expansion, and a table of coefficients (the dot product table) chosen for the mapping, then calculate their dot product.

We can write the column vectors like this:

𝐥 \= \[x 2 x y x z y 2 y z z 2\],𝐫 \= \[1 2 3 4 5 6\] \\mathbf{l} = \\begin{bmatrix} x^2 \\\\ xy \\\\ xz \\\\ y^2 \\\\ yz \\\\ z^2 \\end{bmatrix},\\quad \\mathbf{r}= \\begin{bmatrix} 1 \\\\ 2 \\\\ 3 \\\\ 4 \\\\ 5 \\\\ 6 \\end{bmatrix}

(𝐥 \\mathbf{l} for left and 𝐫 \\mathbf{r} for right, but you can use any letters you like; note that we use **bold** lowercase letters to denote vectors)

and then write this to represent the dot product:

𝐥 ⋅ 𝐫 \\mathbf{l} \\cdot \\mathbf{r}

The bold text lets us know we are multiplying two vectors and not two regular numbers (also known as *scalars*). This is a much neater way of expressing what we are talking about without having to write the equation in full, which in this case is:

x 2 + 2 x y + 3 x z + 4 y 2 + 5 y z + 6 z 2 x^2 + 2xy + 3xz + 4y^2 + 5yz + 6z^2

Each item from the left list is multiplied with the corresponding item from the right list, and they are all added together.

As you can see, this produces a quadratic equation with:

-   6 quadratic terms – the number of terms created by the quadratic expansion
-   0 linear terms – quadratic expansion removes all linear terms
-   3 unknown variables – the number of unknown variables we started with
-   6 coefficients – one coefficient for each entry in the dot product table
-   0 constants

Code (Python)

```python
# 3 bytes of input
# 6 entries for the dot product table
# 1 byte output

# We don't use byte_index yet but we'll see how it comes in handy later
def calculate_single_quadratic_mapping(byte_index, input, dot_product_table):
  l = quadratic_expansion(input)          # Produces 6 bytes
  r = dot_product_table
  
  mapping = dot_product(l, r)
  return mapping % 251        # Returns one byte
```

#### Quadratic mappings walkthrough

So where does the difficulty of cracking this come from? If we know or can calculate the message digest for a particular message, why can’t we just use that as the signature? After all, both of them go through a set of quadratic mappings to get the final values we want to compare.

The answer is that the dot product tables for the quadratic mappings used for the message digest and signature – what we called M M and S S earlier – are *different*. These tables are squirreled away secretly in the card, but even if a hacker manages to acquire them by dumping the firmware, they still have to somehow guess the inputs to one set of quadratic mappings that produces outputs that match the outputs from the *other* set of quadratic mappings.

This might be difficult to visualize, so let’s illustrate with an example. Let’s imagine you have a very simple 3-byte signature, and that the message digest is also 3 bytes. For this, we will create 6 dot product tables: three for quadratic mappings on the message digest, and three for quadratic mappings on the signature. For this example I have just invented some random tables.

First, three dot product tables that will be applied to the message digest, one for each byte:

𝐦 𝟎 \= \[3 5 7 9 11 13\],𝐦 𝟏 \= \[7 2 4 12 10 5\],𝐦 𝟐 \= \[8 14 2 9 7 4\] \\mathbf{m_0}=\\begin{bmatrix} 3 \\\\ 5 \\\\ 7 \\\\ 9 \\\\ 11 \\\\ 13 \\end{bmatrix},\\quad \\mathbf{m_1}= \\begin{bmatrix} 7 \\\\ 2 \\\\ 4 \\\\ 12 \\\\ 10 \\\\ 5 \\end{bmatrix},\\quad \\mathbf{m_2}=\\begin{bmatrix} 8 \\\\ 14 \\\\ 2 \\\\ 9 \\\\ 7 \\\\ 4 \\end{bmatrix}

Next, three dot product tables that will be applied to the signature, one for each byte:

𝐬 𝟎 \= \[13 4 8 7 3 10\],𝐬 𝟏 \= \[2 15 11 12 8 7\],𝐬 𝟐 \= \[5 6 8 12 13 9\] \\mathbf{s_0}=\\begin{bmatrix} 13 \\\\ 4 \\\\ 8 \\\\ 7 \\\\ 3 \\\\ 10 \\end{bmatrix},\\quad \\mathbf{s_1}= \\begin{bmatrix} 2 \\\\ 15 \\\\ 11 \\\\ 12 \\\\ 8 \\\\ 7 \\end{bmatrix},\\quad \\mathbf{s_2}=\\begin{bmatrix} 5 \\\\ 6 \\\\ 8 \\\\ 12 \\\\ 13 \\\\ 9 \\end{bmatrix} Code

```
m = [
  [3, 5, 7, 9, 11, 13],
  [7, 2, 4, 12, 10, 5],
  [8, 14, 2, 9, 7, 4]
]

s = [
  [13, 4, 8, 7, 3, 10],
  [2, 15, 11, 12, 8, 7],
  [5, 6, 8, 12, 13, 9]
]
```

You’ll notice I used some funny numbers in the column vector names – 0, 1, 2. These are just like array indexes in programming, so you can refer to a particular item when you have more than one of them, just as with an array of integers for example. Here 𝐦 𝐱 \\mathbf{m_x} refers to one of three column vectors – one for each dot product table for the message digest – so we if we want to refer to the first one, we can just write 𝐦 𝟎 \\mathbf{m_0} in math and `m[0]` in code, and so on. This is called *subscript notation*. Nothing to be afraid of!

*(Note: in practice, we would combine all of these vectors into a single 6×3 matrix – a two-dimensional array in coding, but I’m trying to keep it simple for now. If you’re interested you can read the section “Calculating a set of dot products with transposition” below. We will look at this technique in more detail in part 4 when we need some über-hacking!)*

Now suppose the message digest is:

𝐝 \= (50,72,84) \\mathbf{d} = (50, 72, 84)

This is just three bytes, nothing special. Again I have made this up entirely randomly (as much as the human brain can generate random numbers, which it turns out is actually quite poorly).

Let us now calculate the quadratic mapping for the message digest. As before we will start with the quadratic expansion, but this time I will call each byte d 0 d_0, d 1 d_1 and d 2 d_2, and show the actual numbers as we go:

𝐞 𝐝 \= \[d 0 2 d 0 d 1 d 0 d 2 d 1 2 d 1 d 2 d 2 2\] \= \[50 ∗ 50 50 ∗ 72 50 ∗ 84 72 ∗ 72 72 ∗ 84 84 ∗ 84\] \= \[2500 3600 4200 5184 6048 7056\] \\mathbf{e_d} = \\begin{bmatrix} d_0^2 \\\\ d_0d_1 \\\\ d_0d_2 \\\\ d_1^2 \\\\ d_1d_2 \\\\ d_2^2 \\end{bmatrix}\\:=\\: \\begin{bmatrix} 50 \* 50 \\\\ 50 \* 72 \\\\ 50 \* 84 \\\\ 72 \* 72 \\\\ 72 \* 84 \\\\ 84 \* 84 \\end{bmatrix} \\:=\\: \\begin{bmatrix} 2500 \\\\ 3600 \\\\ 4200 \\\\ 5184 \\\\ 6048 \\\\ 7056 \\end{bmatrix}

Remember, this is exactly the same as before – we have just replaced x,y,z x, y, z with d 0,d 1,d 2 d_0, d_1, d_2. The letters make *no difference whatsoever* to the meaning, you can pick any letters you like just as with variable names in code, but by using the subscript notation, we make it clear that d d (the message digest) has several related items, just as with the matrices above. We also use 𝐞 𝐝 \\mathbf{e_d} to say, hey, there are two sets of quadratic expansions, and this one is for the message digest 𝐝 \\mathbf{d}. This is like indexing an array in code, but instead of using a numerical index, we use 𝐝 \\mathbf{d} as the index instead.

Since we are operating in 𝔽 251 \\mathbb{F}\_{251}, we take the modulo of each number to get the final expansion:

𝐞 𝐝 \= \[241 86 184 164 24 28\] (mod 251) \\mathbf{e_d}= \\begin{bmatrix} 241 \\\\ 86 \\\\ 184 \\\\ 164 \\\\ 24 \\\\ 28 \\end{bmatrix} \\quad\\text{(mod 251)} Code (Python)

```python
d = [50, 72, 84]                 # d0, d1, d2

e_d = quadratic_expansion(d)     # as defined earlier in the article

for i in range(len(e_d)):        # operate in mod 251
  e_d[i] = e_d[i] % 251
```

Great! This expansion will be used as the left-hand side dot product table for each byte in the quadratic mapping for the message digest. We now have to combine this with each of the other dot product tables to get the quadratic mapping for each byte.

Here is an example for the first byte:

q d 0 \= \[241 86 184 164 24 28\] ∙ \[3 5 7 9 11 13\] \= 221 + 179 + 33 + 221 + 13 + 113 \= 780 q d 0 \= 27 (mod 251) \\begin{align} q\_{d_0}=\\begin{bmatrix} 241 \\\\ 86 \\\\ 184 \\\\ 164 \\\\ 24 \\\\ 28 \\end{bmatrix} \\:\\bullet\\: \\begin{bmatrix} 3 \\\\ 5 \\\\ 7 \\\\ 9 \\\\ 11 \\\\ 13 \\end{bmatrix} \\:=\\:221 + 179 + 33 + 221 + 13 + 113 = 780 \\\\ \\\\ q\_{d_0} = 27\\;\\text{(mod 251)} \\end{align}

Here we use q d 0 q\_{d_0} to say, hey, there are quadratic mappings for more than one set of items (bytes in this case), and this one is for the first byte of the message digest. You can think of this as like indexing a nested array in code. In this example the array would be `q[2][3]` because we have 2 sets of mappings (one for the message digest and one for the signature), and each set has three individual mappings – one for each byte. So, if we imagine that `d = 0` and `s = 1` for argument’s sake, `q[d]` refers to the message digest and `q[s]` refers to the signature, then q d 0 q\_{d_0} just refers to `q[d][0]` – the mapping for the first byte of the message digest.

Now we repeat this for the remaining two bytes in the message digest:

q d 1 \= 𝐞 𝐝 ∙ 𝐦 𝟏 (mod 251) q d 2 \= 𝐞 𝐝 ∙ 𝐦 𝟐 (mod 251) \\begin{align} q\_{d_1} = \\mathbf{e_d} \\bullet \\mathbf{m_1}\\;\\text{(mod 251)} \\\\ q\_{d_2} = \\mathbf{e_d} \\bullet \\mathbf{m_2}\\;\\text{(mod 251)} \\end{align}

This is just the same as when we wrote 𝐥 ∙ 𝐫 \\mathbf{l} \\bullet \\mathbf{r} earlier, except now we are specifying column vectors (arrays) from our algorithm. Each result is the dot product of the quadratic expansion (left-hand side) and the dot product table for the corresponding byte of the message digest (right-hand side). Remember we have 3 bytes and 3 dot product tables for the digest, so calculating all three mappings gives us the complete 3-byte 𝐪 𝐝 \\mathbf{q_d} – or `q[d]` if we use the code example above.

Code (Python)

```python
d = [50, 72, 84]
q_d = []

e_d = quadratic_expansion(d)               # 3 bytes in, 6 bytes out

for i in range(3):
  # Each byte has its own dot product table, selected by i
  q_d_i = dot_product(e_d, M[i]) % 251     # work in mode 251
  q_d.append(q_d_i)
```

We’ll also repeat the same for the signature, which is identical except that we use the quadratic expansion and dot products for the signature instead. The code is also identical. For readability, we just replace 𝐝 \\mathbf{d} with 𝐠 \\mathbf{g} (digest with signature – we picked 𝐠 \\mathbf{g} instead of 𝐬 \\mathbf{s} here to avoid confusion with the names of the dot product tables; this is just any available letter), and 𝐦 \\mathbf{m} for 𝐬 \\mathbf{s} (dot product tables for the message with dot product tables for the signature):

𝐠 \= (g 0,g 1,g 2) 𝐞 𝐠 \= q u a d r a t i c \_ e x p a n s i o n (𝐠) q g 0 \= 𝐞 𝐠 ∙ 𝐬 𝟎 (mod 251) q g 1 \= 𝐞 𝐠 ∙ 𝐬 𝟏 (mod 251) q g 2 \= 𝐞 𝐠 ∙ 𝐬 𝟐 (mod 251) \\begin{align} \\mathbf{g} = (g_0, g_1, g_2) \\\\ \\\\ \\\\ \\mathbf{e_g} = quadratic\\\_expansion(\\mathbf{g}) \\\\ \\\\ \\\\ q\_{g_0} = \\mathbf{e_g} \\bullet \\mathbf{s_0}\\;\\text{(mod 251)} \\\\ q\_{g_1} = \\mathbf{e_g} \\bullet \\mathbf{s_1}\\;\\text{(mod 251)} \\\\ q\_{g_2} = \\mathbf{e_g} \\bullet \\mathbf{s_2}\\;\\text{(mod 251)} \\\\ \\end{align}

Again, this is the same before, except that we replaced random numbers for the message digest with letters g 0 g_0, g 1 g_1 and g 2 g_2 to represent an unknown signature.

#### Calculating a set of dot products with transposition

*NOTE: This section has no bearing on the reverse engineering aspect of the series, only mathematical representation, so you can skip it if you like!*

You may have noticed that we wrote each equation for the quadratic mapping of each byte (q g 0 \= 𝐞 𝐠 ∙ 𝐬 𝟎 q\_{g_0} = \\mathbf{e_g} \\bullet \\mathbf{s_0} etc.) one at a time. However, we have a better way – this should do the trick:

𝐪 𝐠 \= 𝐞 𝐠 T 𝐒 \\mathbf{q_g} = \\mathbf{e_g}^T \\mathbf{S}

Wait wait, what is going on here?! This is a bit of a mathematical quirk: in order to perform a bunch of dot products at the same time, we merge the column vectors 𝐬 𝟎,𝐬 𝟏,𝐬 𝟐 \\mathbf{s_0, s_1, s_2} into a single 6×3 matrix – one column per vector:

𝐒 \= \[13 2 5 4 15 6 8 11 8 7 12 12 3 8 13 10 7 9\] \\mathbf{S}=\\begin{bmatrix} 13 & 2 & 5 \\\\ 4 & 15 & 6\\\\ 8 & 11 & 8\\\\ 7 & 12 & 12\\\\ 3 & 8 & 13\\\\ 10 & 7 & 9\\\\ \\end{bmatrix}

Notice here we use a capital letter 𝐒 \\mathbf{S} to indicate that the variable is a 2D matrix and not just a vector.

It’s not possible to use the dot product operator directly on a two-dimensional table like this, but what we can do instead is multiply a row vector with it to get the same result. Our quadratic expansion 𝐞 𝐠 \\mathbf{e_g} is a column vector, but we can easily convert it into a row vector using an operation called *transposing*.

Transposing allows you to convert a column vector to a row vector and vice versa (or any matrix’s columns into rows and vice versa) by simply rewriting the vector as a row or column, without changing the order of its values.  
  
We use the symbol T ^T to indicate a matrix has been transposed like this:

𝐱 \= \[5 10 15 20\] \\mathbf{x} = \\begin{bmatrix} 5 \\\\ 10 \\\\ 15 \\\\ 20\\end{bmatrix} 𝐱 T \= \[5 10 15 20\] \\mathbf{x}^T = \\begin{bmatrix} 5 & 10 & 15 & 20 \\end{bmatrix}

Now, recalling that our signature expansion E s E_s is:

𝐞 𝐠 \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] \\mathbf{e_g} = \\begin{bmatrix} s_0^2 \\\\ s_0s_1 \\\\ s_0s_2 \\\\ s_1^2 \\\\ s_1s_2 \\\\ s_2^2 \\end{bmatrix}

then we can write its transposed version like so:

𝐞 𝐠 T \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] \\mathbf{e_g}^T = \\begin{bmatrix}s_0^2 & s_0s_1 & s_0s_2 & s_1^2 & s_1s_2 & s_2^2\\end{bmatrix}

Now we can use it as a row vector and multiply it with the 6×3 matrix to calculate all the dot products at once:

𝐪 𝐠 \= 𝐞 𝐠 T 𝐒 𝐪 𝐠 \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] \[13 2 5 4 15 6 8 11 8 7 12 12 3 8 13 10 7 9\] \\begin{align} \\mathbf{q_g} = \\mathbf{e_g}^T \\mathbf{S} \\\\ \\\\ \\mathbf{q_g} = \\begin{bmatrix}s_0^2 & s_0s_1 & s_0s_2 & s_1^2 & s_1s_2 & s_2^2\\end{bmatrix} \\; \\begin{bmatrix} 13 & 2 & 5 \\\\ 4 & 15 & 6\\\\ 8 & 11 & 8\\\\ 7 & 12 & 12\\\\ 3 & 8 & 13\\\\ 10 & 7 & 9\\\\ \\end{bmatrix} \\end{align}

This gives us a row vector with the quadratic mapping for each byte, because the expansion 𝐞 𝐬 \\mathbf{e_s} is multiplied with each column vector (𝐬 𝟎,𝐬 𝟏,𝐬 𝟐 \\mathbf{s_0, s_1, s_2}) merged into 𝐒 \\mathbf{S} and the results stored in a row (q g 0,q g 1,q g 2) (q\_{g_0}, q\_{g_1}, q\_{g_2}). Perfect!

There is no associated code for this because all we are doing here is basically futzing around trying to find a more elegant way of writing down an algorithm, but since this operation calculates every dot product together, you can think of it as making the code multi-threaded.

Note carefully that we don’t actually use the dot product operator in 𝐪 𝐠 \= 𝐞 𝐠 T 𝐒 \\mathbf{q_g} = \\mathbf{e_g}^T\\mathbf{S} because we are not actually directly calculating a single dot product – rather, we are multiplying a row vector by a matrix. Although the results are the same, the way the operation is performed is different. Additionally, the row vector *must go on the left-hand side* of the multiplication. This is because multiplication is not commutative in matrix math – that is to say, the order of the matrices matters – and for dot product calculations, the row vector must come first. I’m going to take the liberty of skipping the explanation of why, because it doesn’t matter for our reverse engineering. Just know that as long as you keep the row vector on the left-hand side, you’re good.  
  
**You don’t need to understand any of this! It does not affect the way we will reverse engineer the algorithm, only the way we write it.**

### The full algorithm in math and code

Whew, what a sticky pickle we worked our way through there! Thankfully, we can now write our toy 3 byte signature verification code very succinctly:

𝐝 \= (d 0,d 1,d 2) 𝐬 \= (s 0,s 1,s 2) 𝐞 𝐝 \= \[d 0 2 d 0 d 1 d 0 d 2 d 1 2 d 1 d 2 d 2 2\],𝐞 𝐬 \= \[s 0 2 s 0 s 1 s 0 s 2 s 1 2 s 1 s 2 s 2 2\] 𝐪 𝐝 \= 𝐞 𝐝 T 𝐌 (m o d 251) 𝐪 𝐬 \= 𝐞 𝐬 T 𝐒 (m o d 251) Signature is correct if 𝐪 𝐝 \= 𝐪 𝐬 \\begin{align} \\mathbf{d} = (d_0, d_1, d_2) \\\\ \\mathbf{s} = (s_0, s_1, s_2) \\\\ \\\\ \\mathbf{e_d} = \\begin{bmatrix} d_0^2 \\\\ d_0d_1 \\\\ d_0d_2 \\\\ d_1^2 \\\\ d_1d_2 \\\\ d_2^2 \\end{bmatrix}, \\quad \\mathbf{e_s} =\\begin{bmatrix} s_0^2 \\\\ s_0s_1 \\\\ s_0s_2 \\\\ s_1^2 \\\\ s_1s_2 \\\\ s_2^2 \\end{bmatrix} \\\\ \\\\ \\mathbf{q_d} = \\mathbf{e_d}^T \\mathbf{M}\\quad(mod\\; 251)\\\\ \\mathbf{q_s} = \\mathbf{e_s}^T \\mathbf{S}\\quad(mod\\; 251)\\\\ \\\\ \\text{Signature is correct if }\\mathbf{q_d} = \\mathbf{q_s} \\end{align}

Equivalent code in Python:

```python
# Dot product tables for message digest
M = [
  [3, 5, 7, 9, 11, 13],
  [7, 2, 4, 12, 10, 5],
  [8, 14, 2, 9, 7, 4]
]

# Dot product tables for signature
S = [
  [13, 4, 8, 7, 3, 10],
  [2, 15, 11, 12, 8, 7],
  [5, 6, 8, 12, 13, 9]
]

def quadratic_expansion(input):
  expansion = []
  for i in range(len(input)):                  # 0,         1,      2
    for j in range(i, len(input)):             # 0, 1, 2,   1, 2,   2
      expansion.append(input[i] * input[j])
  return expansion

def dot_product(left, right):
  assert len(left) == len(right), "Both dot product tables must be the same length"

  for i in range(len(left)):
    total += left[i] * right[i]
  return total

def quadratic_mappings(input, dot_product_tables):
  e = quadratic_expansion(input)
  q = []
  for i in range(3):
    q.append(dot_product(e, dot_product_tables[i]))
  return q

# Message digest is supplied as d
def verify_signature(d, s):
  q_d = quadratic_mappings(d, M)
  q_s = quadratic_mappings(s, S)

  return q_d == q_s
 
def main():
  message = [1, 2, 3, 4, 5, 6, 7, 8]  # any message
  s = [44, 55, 66]                    # s0, s1, d2 - signature to verify

  d = get_message_digest(message)     # d0, d1, d2 - message digest
  signature_ok = verify_signature(d, s)
```

The actual code is not that complicated, but understanding how the algorithm works is crucial to learning how to exploit it.

You might be feeling overwhelmed at this point and I don’t blame you – I’ve been there too. Just give it a few re-reads and take all the time you need.

### Surveying the landscape

To keep the signature algorithm secure, it is imperative that an attacker cannot calculate the signature from publicly available information, including – in this case – extracting the entire contents of the smart card. We basically assume that a hacker has access to all information in the field: messages, message digests and all of the dot product tables. We also assume she can make any message she likes and calculate the message digest and quadratic mappings from it, as many times as she likes. We also assume she can try any signature she likes and see the outputs of the quadratic mappings from those, too. These last two operations are called *chosen ciphertext attack* s and are considered to be very powerful because you can adapt your inputs to try to learn more about the algorithm or encryption key. In this case, the algorithm isn’t a secret (assuming you’ve extracted the card’s firmware), but the relationship between how a message digest and valid signature can somehow go through two unrelated sets of quadratic mappings and have the outputs match most certainly is.

To stop an attacker from taking a message digest and turning it into a valid signature, we need to ensure that any signature verification algorithm uses a one-way hash function. There are good and bad one-way hash functions; good ones have properties including but not limited to:

-   **Irreversibility**: it should not be possible to recover the original message from the hash
-   **Preimage resistance**: it should not be possible to find a message that hashes to a chosen hash
-   **High diffusion**: changing one bit in the input should change many bits in the output (also known as the *avalanche test*)
-   **Collision resistance**: different messages should wherever possible never generate the same hash (otherwise one message can be substituted for another; the less collision resistance there is, the more messages will generate the same hash)

Quadratic mappings are not inherently secure or appropriate for one-way hash functions as we shall see later – rather, they are used as *cryptographic primitives*, which is to say one tool in the toolbox that can be combined with others to make something that is ultimately secure as a whole.

How does the message creator sign messages in near real-time? If there is truly no relation between the dot product tables, then signing a message legitimately has the same difficulty as reverse engineering a signature. This doesn’t make sense, of course; the answer is that messages are signed using a secret function known only to the sender, which has a mathematical relation to both sets of public dot product tables. The sender must absolutely have a way to compute a valid signature from a message digest – but having the dot product tables doesn’t tell us how. At ground zero, the best we can do is to search for a valid signature for a given message digest by trying many signatures as fast as possible and checking if any of them generate the quadratic mapping needed for the message to be verified.

#### What we need to solve

Earlier we discussed how the difficulty in reverse engineering this primitive so that we can sign any message comes from the fact that the quadratic mappings for the message digest and signature use two different sets of dot product tables. To hammer this home and showcase the algorithm in the way we will actually analyze it in software, let’s use what we learned in [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) of the series to rewrite it as a system of quadratic equations.

We’ve already seen earlier that the quadratic mapping of one byte in the message digest can be written as a formula:

x 2 + 2 x y + 3 x z + 4 y 2 + 5 y z + 6 z 2 x^2 + 2xy + 3xz + 4y^2 + 5yz + 6z^2

where:

𝐝 \= (x,y,z) 𝐦 \= \[1 2 3 4 5 6\] \\begin{align} \\mathbf{d} = (x, y, z) \\\\ \\\\ \\mathbf{m} = \\begin{bmatrix} 1 \\\\ 2 \\\\ 3 \\\\ 4 \\\\ 5 \\\\ 6 \\end{bmatrix} \\end{align}

All we need to do to rewrite the algorithm as a system of quadratic equations is to repeat this for every byte. We will use the letters we chose earlier to keep things consistent, and substitute in the values we chose for the dot product tables what seems like several years ago at this point.

For the message digest:

q d 0 \= 3 d 0 2 + 5 d 0 d 1 + 7 d 0 d 2 + 9 d 1 2 + 11 d 1 d 2 + 13 d 2 2 q d 1 \= 7 d 0 2 + 2 d 0 d 1 + 4 d 0 d 2 + 12 d 1 2 + 10 d 1 d 2 + 5 d 2 2 q d 2 \= 8 d 0 2 + 14 d 0 d 1 + 12 d 0 d 2 + 9 d 1 2 + 7 d 1 d 2 + 4 d 2 2 \\begin{align} q\_{d_0} = 3d_0^2 + 5d_0d_1 + 7d_0d_2 + 9d_1^2 + 11d_1d_2 + 13d_2^2 \\\\ \\\\ q\_{d_1} = 7 d_0^2 + 2d_0d_1 + 4d_0d_2 + 12d_1^2 + 10d_1d_2 + 5d_2^2 \\\\ \\\\ q\_{d_2} = 8 d_0^2 + 14d_0d_1 + 12d_0d_2 + 9d_1^2 + 7d_1d_2 + 4d_2^2 \\\\ \\\\ \\end{align}

For the signature:

q s 0 \= 13 s 0 2 + 4 s 0 s 1 + 8 s 0 s 2 + 7 s 1 2 + 3 s 1 s 2 + 10 s 2 2 q s 1 \= 2 s 0 2 + 15 s 0 s 1 + 11 s 0 s 2 + 12 s 1 2 + 8 s 1 s 2 + 7 s 2 2 q s 2 \= 5 s 0 2 + 6 s 0 s 1 + 8 s 0 s 2 + 12 s 1 2 + 13 s 1 s 2 + 9 s 2 2 \\begin{align} q\_{s_0} = 13s_0^2 + 4s_0s_1 + 8s_0s_2 + 7s_1^2 + 3s_1s_2 + 10s_2^2 \\\\ \\\\ q\_{s_1} = 2s_0^2 + 15s_0s_1 + 11s_0s_2 + 12s_1^2 + 8s_1s_2 + 7s_2^2 \\\\ \\\\ q\_{s_2} = 5 s_0^2 + 6s_0s_1 + 8s_0s_2 + 12s_1^2 + 13s_1s_2 + 9s_2^2 \\\\ \\\\ \\end{align} Generalized form q i j \= P j,0 i 0 2 + P j,1 i 0 i 1 + P j,2 i 0 i 2 + P j,3 i 1 2 + P j,4 i 1 i 2 + P j,5 i 2 2 where:P \= dot product tables i \= vector of input values j \= index of byte to calculate \\begin{align} q\_{i_j} = P\_{j,0} i_0^2 + P\_{j,1}i_0i_1 + P\_{j,2}i_0i_2 + P\_{j,3}i_1^2 + P\_{j,4}i_1i_2 + P\_{j,5}i_2^2 \\\\ \\\\ \\text{where:} \\\\ \\\\ \\\\ P = \\text{dot product tables} \\\\ \\\\ i = \\text{vector of input values} \\\\ \\\\ j = \\text{index of byte to calculate} \\end{align}

(but that part is fortunately not important here as we have a very specific use case)

The equations are quadratic because each coefficient is multiplied by two variables (see [part 1](https://katyscode.wordpress.com/2026/03/10/hacking-with-math-part-1-of-4/) for details).

Notice that the problem is now represented as a system of:

-   3 equations
-   3 unknown variables
-   6 quadratic terms, 0 linear terms and 0 constants per equation
-   6 coefficients per equation

Remember, this is just our small example version – the real algorithm has 8 inputs and therefore is a system of:

-   8 equations
-   8 unknown variables
-   36 quadratic terms, 0 linear terms and 0 constants per equation
-   36 coefficients per equation

(36 comes from the size of the quadratic expansion: 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1 = 36 terms)

We now arrive at the crux of the problem and can see where the difficulty comes from. The ultimate question is:

**What values can I pick for 𝐬 \\mathbf{s} that will make 𝐪 𝐬 \\mathbf{q_s} = 𝐪 𝐝 \\mathbf{q_d}?**

If your reaction to that question after looking at the equations above is “uhhhhh….” or “I have absolutely no idea whatsoever”, then you’re on the right track, and in [part 3](https://katyscode.wordpress.com/2026/03/15/hacking-with-math-part-3-of-4/) we’ll figure that out and enable ourselves to send instructions of our choice to the smart card. Until next time!
