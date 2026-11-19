---
title: "Modeling Collatz in Binary Full-Adder Space: Carry-Kill Bulkheads, Orthogonal Bit-Rooms, and the CDP Master Equation"
source: https://netacoding.com/posts/collatz-binary-full-adder-cdp/
source_host: netacoding.com
clip_date: 2026-11-19T09:30:14+08:00
trace_id: ce22955d-bfaf-4e29-8e53-bc3cc7988eb1
content_hash: 396819ab4989d6bfcaa46e526e28185fe68a84c4a35499188e7c31b771168bf5
status: synced
tags: []
series: null
feed_source: Netacoding·协议/逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81e6-b113-efce4869bc41
ioc: null
---

I am not an analytic number theorist. My background is in cryptographic state-space modeling and low-level systems architecture — specifically **Cyclic Digit-sum Projection (CDP)**, a framework of 130+ theorems I developed to analyze carry trees, zero-masking barriers, and bit-weight conservation in ARX (Add-Rotate-Xor) primitives like SHA-256.

Recently, I applied that exact cryptographic lens to the accelerated **Collatz (Syracuse) operator** (3 n + 1 3n+1). Instead of treating trajectories as abstract scalar magnitudes, I modeled the transformation directly as a synchronous **Binary Full-Adder State Automaton**.

The formal mathematical preprint is archived on Zenodo (**DOI:** [10.5281/zenodo.24311418](https://doi.org/10.5281/zenodo.24311418)), building on my foundational CDP v5 framework (**DOI:** [10.5281/zenodo.22690410](https://doi.org/10.5281/zenodo.22690410)).

This post presents the complete **CDP–Collatz Master System**— an exact, zero-approximation four-part algebraic characterization of how bit rooms, Hamming weights, and carry waves evolve at every step, together with the deterministic bridge identity, the signed corridor decomposition, and non-tautological sliding-window diagnostics.

* * *

## 1\. Beyond Base-10 Magnitude: The Binary Full-Adder Engine

The accelerated Collatz rule on positive odd integers n ∈ N odd n \\in \\mathbb{N}\_{\\text{odd}} is simple: multiply n n by 3 3, add 1 1, and divide out the highest power of 2 2 so that you land on the next odd integer:

T (n) \= 3 n + 1 2 δ (n),δ (n) \= v 2 (3 n + 1)

When you watch a trajectory like n \= 27 n = 27 climb to 9232 9232 before collapsing to 1 1 in decimal (base-10), the sequence looks erratic. Decimal representation hides the structural invariants of binary addition because base-10 digits do not align with powers of 2 2.

In binary hardware, there is no abstract “multiplication by 3.” Multiplying an odd integer n n by 3 3 and adding 1 1 is identically a single-bit left shift coupled with a binary addition:

3 n + 1 \= (2 n + 1) + n \= ((n ≪ 1) ∨ 1) + n

And dividing by 2 δ (n) 2^{\\delta(n)} is a bitwise right-shift (≫ δ (n) \\gg \\delta(n)) that strips trailing zeros (`000...`) from the least significant end of the register.

Viewed at the gate level, the Collatz map is a **Binary Full-Adder Bit-Flush Engine**. Every iteration injects a root carry at the bottom of the register, triggering an internal carry wave that collides with existing bit pairs, modifies the internal Hamming weight, and flushes trailing zeros.

* * *

## 2\. Anatomy of Trajectory Growth: Why δ(n)=1\\delta(n) = 1 Cannot Persist Unchecked

In heuristic binary drift arguments, each odd step multiplies the number by 3 3 (adding log ⁡ 2 (3) ≈ 1.585 \\log_2(3) \\approx 1.585 bits of length) while stripping an average of E \[δ\] \= 2 \\mathbb{E}\[\\delta\] = 2 trailing zeros over uniform odd inputs, yielding a net contractive drift of − 0.415 \-0.415 bits per step.

Why isn’t the heuristic drift argument a rigorous proof for *all* n n? Because a global proof must account for adversarial bit configurations that repeatedly force the minimum shift δ (n) \= 1 \\delta(n) = 1 (where 3 n + 1 3n+1 is divisible by 2 2 only once), causing the trajectory to climb.

In binary full-adder space, what does it actually take to force δ (n) \= 1 \\delta(n) = 1?

-   As we prove in Section 4, getting a single trailing zero (δ (n) \= 1 \\delta(n) = 1) occurs **if and only if** the two lowest bits of n n are `11` (b 1 \= 1,b 0 \= 1 b_1 = 1, b_0 = 1).
-   Sustaining δ \= 1 \\delta = 1 for k k consecutive steps requires stacking a contiguous block of k + 1 k+1 ones at the bottom of the number (`...0111...11_2`).
-   However, every finite integer n n has a finite bit-length and must contain a first `0` bit (b k + 1 \= 0 b\_{k+1} = 0) bounding the lower `11...1` block. Each step erodes this lower `11...1` block by exactly one bit (k ↦ k − 1 k \\mapsto k - 1) as it converts 2 k + 1 − 1 ↦ 3 ⋅ 2 k − 1 2^{k+1} - 1 \\mapsto 3 \\cdot 2^k - 1, until the boundary `0` bit reaches index 1 1 and forces a multi-bit flush (δ ≥ 2 \\delta \\ge 2).

Thus, a trajectory can never climb forever using a *single* static block of ones. To sustain growth across a long orbit, the upper bits of the number must continually **synthesize new `11...1` blocks** faster than lower-corridor flushes can erode them. To analyze how such regeneration occurs, we first decouple the carry tree of (2 n + 1) + n (2n+1)+n.

* * *

## 3\. Carry-Tree Decoupling: Orthogonal Bit-Room Masks

A natural systems question arises when moving from fixed-width cryptography (like 32-bit words in SHA-256) to arbitrary-precision integers: *In Collatz, an integer can be millions of bits long. Can a carry wave originating at bit 0 0 ripple uncontrollably across the entire bit-length of n n?*

**CDP Theorem 116 (Carry-Kill Bulkhead Law)** proves that it cannot.

Let any odd integer be written in binary as n \= ∑ i \= 0 L b i 2 i n = \\sum\_{i=0}^{L} b_i 2^i (with b 0 \= 1 b_0 = 1, leading bit b L \= 1 b_L = 1, b i \= 0 b_i = 0 for i \> L i > L, boundary condition b − 1 \= 0 b\_{-1} = 0, and initial root carry c 0 \= 1 c_0 = 1). By inspecting adjacent bit pairs (b i,b i − 1) (b_i, b\_{i-1}) at every index i ≥ 0 i \\ge 0, we project the number into three mutually orthogonal **Bit-Room Masks**:

U i \= b i ⊕︎ b i − 1 (Open Propagate Room: 𝟶𝟷  or  𝟷𝟶)

G i \= b i ∧ b i − 1 (Carry-Generate Wall: 𝟷𝟷)

Z i \= ¬ b i ∧ ¬ b i − 1 (Zero-Absorb Wall: 𝟶𝟶)

### Intuitive Hardware Picture (Corridors and Bulkheads)

Think of the binary representation of n n as a corridor partitioned into rooms, with the carry bit c i c_i flowing from right to left (from LSB to MSB):

-   **Open Propagate Rooms (U i \= 1 U_i = 1):** Whenever adjacent bits differ (`01` or `10`), the room is open. An incoming carry c i \= 1 c_i = 1 passes straight through to room i + 1 i+1 while flipping the room’s sum bit s i s_i to `0`.
-   **Bulkhead Walls (U i \= 0 U_i = 0):** Whenever adjacent bits are equal (`00` or `11`), U i \= 0 U_i = 0. This forms an impenetrable bulkhead. **Carry information from lower rooms can never pass through a `00` or `11` wall.** A `00` wall (Z i \= 1 Z_i = 1) absorbs the incoming carry and outputs c i + 1 \= 0 c\_{i+1} = 0. A `11` wall (G i \= 1 G_i = 1) blocks the incoming carry and initiates a fresh carry c i + 1 \= 1 c\_{i+1} = 1 of its own.

### Formal Algebraic Formulation (Partition of Unity)

At every bit index i ≥ 0 i \\ge 0, the masks U i,G i,Z i ∈ 0,1 U_i, G_i, Z_i \\in {0, 1} are pairwise disjoint and partition unity:

U i + G i + Z i ≡ 1,U i ∧ G i ≡ G i ∧ Z i ≡ Z i ∧ U i ≡ 0

Furthermore, because b i + b i − 1 \= U i + 2 G i b_i + b\_{i-1} = U_i + 2G_i, summing over all i ≥ 0 i \\ge 0 yields the exact Hamming weight relation:

2 w (n) \= w (U) + 2 w (G) (Lemma 1)

Under the full-adder decomposition 3 n + 1 \= (2 n + 1) + n \= ∑ i ≥ 0 s i 2 i 3n + 1 = (2n + 1) + n = \\sum\_{i \\ge 0} s_i 2^i, the sum bit s i s_i and carry-pipe bit c i + 1 c\_{i+1} satisfy:

s i \= U i ⊕︎ c i,c i + 1 \= Maj ⁡ (b i,b i − 1,c i) \= G i + (U i ∧ c i) ≡ G i ⊕︎ (U i ∧ c i)

Because U i ∧ G i ≡ 0 U_i \\land G_i \\equiv 0, the carry transition c i + 1 \= G i + (U i ∧ c i) c\_{i+1} = G_i + (U_i \\land c_i) produces **zero secondary carries**, establishing an exact linear equivalence between Boolean (F 2 \\mathbb{F}\_2) logic and integer arithmetic. At any wall index r r where U r \= 0 U_r = 0, the propagation term (U r ∧ c r) (U_r \\land c_r) vanishes identically:

U r \= 0 ⟹ c r + 1 \= G r \= b r (CDP Theorem 116)

Every `00` and `11` pair completely severs the carry tree into independent, finite segments.

* * *

## 4\. The Zero-Search Flush Law: Exact δ(n)\\delta(n) Without Multiplication

At the root room i \= 0 i = 0, the boundary conditions b 0 \= 1,b − 1 \= 0,c 0 \= 1 b_0 = 1, b\_{-1} = 0, c_0 = 1 lock U 0 \= 1 U_0 = 1 and G 0 \= 0 G_0 = 0, producing:

s 0 \= U 0 ⊕︎ c 0 \= 1 ⊕︎ 1 \= 0,c 1 \= G 0 + (U 0 ∧ c 0) \= 1

The injected carry c 1 \= 1 c_1 = 1 propagates unattenuated through every consecutive open room U i \= 1 U_i = 1 (1 ≤ i < v 1 \\le i < v), annihilating each sum bit into zero (s i \= 1 ⊕ 1 \= 0,;c i + 1 \= 1 s_i = 1 \\oplus 1 = 0,; c\_{i+1} = 1) until it collides with the very first wall room U v \= 0 U_v = 0, where it terminates as s v \= 0 ⊕ 1 \= 1 s_v = 0 \\oplus 1 = 1.

This establishes **CDP Theorems 46 & 99 (The Zero-Search Lower-Corridor Flush Law)**: the exact 2-adic valuation δ (n) \= v 2 (3 n + 1) \\delta(n) = v_2(3n+1) is determined **with zero multiplication** by the index of the first identical adjacent bit pair:

$$ \\delta(n) = v_2(3n + 1) = \\min \\left{ i \\ge 1: U_i = 0 \\right} = \\min \\left{ i \\ge 1: b_i = b\_{i-1} \\right} $$

-   **Example 1 (n \= 5 \= 00101 2 n = 5 = \\mathtt{00101}\_2):** Scanning from LSB to MSB (`1, 0, 1, 0, 0`), the bits alternate until the first `00` pair at index i \= 4 i = 4. Thus δ (5) \= 4 \\delta(5) = 4 (3 (5) + 1 \= 16 \= 2 4 3(5)+1 = 16 = 2^4).
-   **Example 2 (n \= 13 \= 01101 2 n = 13 = \\mathtt{01101}\_2):** Scanning from LSB to MSB (`1, 0, 1, 1`), the first identical pair `11` occurs at index i \= 3 i = 3. Thus δ (13) \= 3 \\delta(13) = 3 (3 (13) + 1 \= 40 \= 2 3 × 5 3(13)+1 = 40 = 2^3 \\times 5).

* * *

## 5\. The Unified CDP–Collatz Master Equation & Bridge Identity

By combining the Zero-Search Flush Law with **CDP Theorem 124 (Weight-Carry Conservation)** and **CDP Theorem 136 (Carry-Free Multiplexer Evolution)**, we lock the step-to-step evolution (t ↦ t + 1 t \\mapsto t+1) of any odd Collatz state into an exact four-part closed-form system:

1.  **Exact Lower-Corridor Flush (Zero-Search Law):** $$ \\delta(n_t) = \\min\\left{ i \\ge 1: U_i^{(t)} = 0 \\right} $$
    
2.  **Global Weight-Carry Conservation (CDP Theorem 124):** Because right-shifting by δ (n t) \\delta(n_t) strips only trailing zeros, w (n t + 1) \= w (3 n t + 1) w(n\_{t+1}) = w(3n_t+1). Summing the single-bit full-adder identity s i + c i + 1 − c i \= U i (t) + G i (t) − (U i (t) ∧ c i (t)) s_i + c\_{i+1} - c_i = U_i^{(t)} + G_i^{(t)} - \\left(U_i^{(t)} \\land c_i^{(t)}\\right) across the upper corridor i \> δ (n t) i > \\delta(n_t) telescopes the carry chain to the bulkhead boundary c δ + 1 (t) \= G δ (n t) (t) c\_{\\delta+1}^{(t)} = G\_{\\delta(n_t)}^{(t)} (by Theorem 116) plus the sentinel bit s δ (n t) \= 1 s\_{\\delta(n_t)} = 1: w (n t + 1) \= w (3 n t + 1) \= 1 + G δ (n t) (t) + ∑ i \= δ (n t) + 1 L t U i (t) + ∑ i \= δ (n t) + 1 L t G i (t) − ∑ i \= δ (n t) + 1 L t (U i (t) ∧ c i (t)) Splitting the upper open rooms into uncarried open rooms U 0,upper (t) \= ∑ i \> δ (U i (t) ∧ ¬ c i (t)) U\_{0,\\text{upper}}^{(t)} = \\sum\_{i>\\delta} (U_i^{(t)} \\land \\neg c_i^{(t)}) and carried (vacuumed) open rooms U 1,upper (t) \= ∑ i \> δ (U i (t) ∧ c i (t)) U\_{1,\\text{upper}}^{(t)} = \\sum\_{i>\\delta} (U_i^{(t)} \\land c_i^{(t)}) yields the simplified positive-definite form: w (n t + 1) \= 1 + G δ (n t) (t) + G upper (t) + U 0,upper (t)
    
3.  **Shifted Orthogonal Room Evolution (∀ m ≥ 1,;i \= m + δ (n t) \\forall m \\ge 1,; i = m + \\delta(n_t)):** $$ G_m^{(t+1)} = \\underbrace{\\left(U_i^{(t)} \\land U\_{i-1}^{(t)} \\land \\neg c\_{i-1}^{(t)}\\right)} *{\\text{Channel 1: Carry-Free Corridor}} + \\underbrace{\\left(U_i^{(t)} \\land Z* {i-1}^{(t)} \\land c\_{i-1}^{(t)}\\right)} *{\\text{Channel 2: Wall Collision}} + \\underbrace{\\left(\\neg U_i^{(t)} \\land G* {i-1}^{(t)} \\land c\_{i-1}^{(t)}\\right)}\_{\\text{Channel 3: Block Survival}} $$
    
    Z m (t + 1) \= (U i (t) ∧ U i − 1 (t) ∧ c i − 1 (t)) + (¬ U i (t) ∧ Z i − 1 (t) ∧ ¬ c i − 1 (t)) + (U i (t) ∧ G i − 1 (t) ∧ ¬ c i − 1 (t))
    
    U m (t + 1) \= 1 − G m (t + 1) − Z m (t + 1)
    
4.  **Telescopic Trajectory Identity (N N Odd Steps):** $$ n_N = \\frac{3^N n_0 + \\sum\_{j=1}^{N} 3^{N-j} 2^{\\Sigma\_{j-1}}}{2^{\\Sigma_N}}, \\qquad \\Sigma_N = \\sum\_{t=0}^{N-1} \\min\\left{ i \\ge 1: U_i^{(t)} = 0 \\right} $$
    

### Corollary: Bridge Identity, Signed Corridor Decomposition & Cycle Condition

Combining Lemma 1 (2 w (n t) \= δ (n t) + U 0,upper (t) + U 1,upper (t) + 2 G δ (n t) (t) + 2 G upper (t) 2w(n_t) = \\delta(n_t) + U\_{0,\\text{upper}}^{(t)} + U\_{1,\\text{upper}}^{(t)} + 2G\_{\\delta(n_t)}^{(t)} + 2G\_{\\text{upper}}^{(t)}) with Equation (2) eliminates the generator counts G G entirely and links the lower-corridor shift δ (n t) \\delta(n_t) directly to the upper open-room imbalance and Hamming weight change Δ w t \= w (n t + 1) − w (n t) \\Delta w_t = w(n\_{t+1}) - w(n_t):

δ (n t) \= 2 + (U 0,upper (t) − U 1,upper (t)) − 2 Δ w t

Furthermore, by Theorem 116 (c r + 1 \= b r c\_{r+1} = b_r at every wall U r \= 0 U_r = 0), the carry bit c i c_i is constant across each contiguous open corridor $k \\in \\mathcal{C} *{\\text{upper}}(n_t) o f l e n g t h of length L_k a b o v e i n d e x above index \\delta(n_t) a n d e q u a l s t h e b i t v a l u e and equals the bit value b* {r_k} \\in {0, 1}$ of the wall immediately beneath it. This yields the exact geometric decomposition:

$$ U\_{1,\\text{upper}}^{(t)} - U\_{0,\\text{upper}}^{(t)} = \\sum\_{k \\in \\mathcal{C} *{\\text{upper}}(n_t)} (2b* {r_k} - 1),L_k $$

In plain terms: open corridors sitting above `11` walls contribute + L k +L_k, while open corridors sitting above `00` walls contribute − L k \-L_k.

Summing the Bridge Identity over any periodic cycle of length N N (n N \= n 0 n_N = n_0, where ∑ Δ w t \= 0 \\sum \\Delta w_t = 0 and Σ N / N \= log ⁡ 2 3 + ϵ N \\Sigma_N / N = \\log_2 3 + \\epsilon_N) yields the exact necessary condition for any cycle:

⟨ U 1,upper − U 0,upper ⟩ cycle \= 2 − log 2 ⁡ 3 − ϵ N,ϵ N \= 1 N ∑ j \= 0 N − 1 log 2 ⁡!(1 + 1 3 n j) \> 0

At the unique known cycle n 0 \= 1 n_0 = 1, ϵ 1 \= log ⁡ 2 (4 / 3) \= 2 − log ⁡ 2 3 ≈ 0.41504 \\epsilon_1 = \\log_2(4/3) = 2 - \\log_2 3 \\approx 0.41504, giving ⟨ U 1,upper − U 0,upper ⟩ \= 0 \\langle U\_{1,\\text{upper}} - U\_{0,\\text{upper}} \\rangle = 0 identically.

* * *

## 6\. Channel Dynamics and the Adversarial Family nk=1+8(4k−1)/3n_k = 1 + 8(4^k-1)/3

Equation (3) decomposes the creation and survival of `11` carry-generating walls (G m (t + 1) \= 1 G_m^{(t+1)} = 1) into three mutually exclusive Boolean channels:

1.  **Channel 3 (Block Survival & Mandatory Boundary Erosion):** For an existing contiguous `11` block of length L L to survive at index i i, it requires both G i − 1 (t) \= 1 G\_{i-1}^{(t)} = 1 and c i − 1 (t) \= 1 c\_{i-1}^{(t)} = 1. At the lower boundary of any isolated `11` block, the preceding room has G i − 1 (t) \= 0 G\_{i-1}^{(t)} = 0; at the upper boundary where the block meets an open room (U k + 1 (t) \= 1 U\_{k+1}^{(t)} = 1), ¬ U k + 1 (t) \= 0 \\neg U\_{k+1}^{(t)} = 0. Consequently, existing `11` blocks cannot self-expand via Channel 3 and erode by at least one room per step (L ↦ L − 1 L \\mapsto L - 1).
    
2.  **Pure Channel 2 Isolation ($\\text{Ch2} *m \\land \\text{Ch2}* {m-1} \\equiv 0$):** Two adjacent rooms cannot both become `11` walls purely via Channel 2 carry-wall collisions, because index i − 1 i-1 cannot simultaneously satisfy Z i − 1 (t) \= 1 Z\_{i-1}^{(t)} = 1 (required for $\\text{Ch2} *m) a n d) and U* {i-1}^{(t)} = 1 (r e q u i r e d f o r (required for \\text{Ch2} *{m-1}):): $ G* {m,\\text{Ch2}}^{(t+1)} \\land G\_{m-1,\\text{Ch2}}^{(t+1)} \\equiv 0 $$
    
3.  **Cross-Channel Cooperativity (Ch2 + Ch1 ∗ \\text{Ch2} + \\text{Ch1}^\* Synthesis & Inductive Erosion Proof):** While pure Channel 2 births are strictly isolated, contiguous G (t + 1) G^{(t+1)} blocks of arbitrary single-step length 2 k 2k *are* synthesized when Channel 2 couples with Channel 1 across a `00` bulkhead (Z i − 1 (t) \= 1 Z\_{i-1}^{(t)} = 1) positioned directly beneath an alternating open propagate corridor of length 2 k 2k (U i (t) \= ⋯ \= U i + 2 k − 1 (t) \= 1 U_i^{(t)} = \\dots = U\_{i+2k-1}^{(t)} = 1). Specifically, for all k ≥ 1 k \\ge 1, the seed family n k \= 1 + 8 (4 k − 1) 3 (𝟶𝟷𝟶𝟷 … 𝟶𝟷𝟶𝟶𝟷 2) contains **zero** initial `11` walls (G (t) \= 0 G^{(t)} = 0 everywhere), yet satisfies 3 n k + 1 \= 4 (2 2 k + 1 − 1) 3n_k + 1 = 4(2^{2k+1} - 1), converting its upper alternating corridor into x 0 \= 2 2 k + 1 − 1 x_0 = 2^{2k+1} - 1 in a single δ \= 2 \\delta = 2 step via Ch2 + Ch1 2 k − 1 \\text{Ch2} + \\text{Ch1}^{2k-1}.
    
    **Inductive Erosion Proof (∀ k ≥ 1 \\forall k \\ge 1):** Define x j \= 3 j ⋅ 2 2 k + 1 − j − 1 x_j = 3^j \\cdot 2^{2k+1-j} - 1 for 0 ≤ j ≤ 2 k 0 \\le j \\le 2k. Then 3 x j + 1 \= 2 (3 j + 1 ⋅ 2 2 k − j − 1) \= 2 x j + 1 3x_j + 1 = 2(3^{j+1} \\cdot 2^{2k-j} - 1) = 2x\_{j+1}. For 0 ≤ j ≤ 2 k − 1 0 \\le j \\le 2k - 1, x j + 1 x\_{j+1} is odd, forcing δ (x j) \= 1 \\delta(x_j) = 1 for 2 k 2k consecutive steps until x 2 k \= 2 ⋅ 3 2 k − 1 x\_{2k} = 2 \\cdot 3^{2k} - 1. At the next step, 3 x 2 k + 1 \= 2 (3 2 k + 1 − 1) 3x\_{2k} + 1 = 2(3^{2k+1} - 1); because 3 2 k + 1 − 1 ≡ 2 (m o d 4) 3^{2k+1} - 1 \\equiv 2 \\pmod 4, δ (x 2 k) \= 2 \\delta(x\_{2k}) = 2, yielding the exact multi-step transition for all k ≥ 1 k \\ge 1:
    

n k \= 1 + 8 (4 k − 1) 3 → δ \= 2 2 2 k + 1 − 1 → 2 k  steps of  δ \= 1 2 ⋅ 3 2 k − 1 → δ \= 2 3 2 k + 1 − 1 2

| k k | Seed n k n_k | Step 1 Output (2 2 k + 1 − 1 2^{2k+1}-1) | After 2 k 2k Steps (2 ⋅ 3 2 k − 1 2 \\cdot 3^{2k}-1) | Next Step ((3 2 k + 1 − 1) / 2,;δ \= 2 (3^{2k+1}-1)/2,; \\delta=2) |
| --- | --- | --- | --- | --- |
| 1 1 | 9 9 | 7 7 | 17 17 | 13 13 |
| 2 2 | 41 41 | 31 31 | 161 161 | 121 121 |
| 3 3 | 169 169 | 127 127 | 1457 1457 | 1093 1093 |
| 4 4 | 681 681 | 511 511 | 13121 13121 | 9841 9841 |
| 5 5 | 2729 2729 | 2047 2047 | 118097 118097 | 88573 88573 |
| 6 6 | 10921 10921 | 8191 8191 | 1062881 1062881 | 797161 797161 |
| 7 7 | 43689 43689 | 32767 32767 | 9565937 9565937 | 7174453 7174453 |

* * *

## 7\. Conditional Framework and Reproducible Diagnostics

What does this four-part characterization prove unconditionally, and how does it formulate the open global question?

1.  **Unconditional Identities vs. Drift Regimes:** Equations (1)–(4), the Deterministic Bridge Identity, the Signed Corridor Decomposition, the bulkhead decoupling law (U r \= 0    ⟹    c r + 1 \= G r U_r = 0 \\implies c\_{r+1} = G_r), pure Channel 2 isolation ($\\text{Ch2} *m \\land \\text{Ch2}* {m-1} \\equiv 0),a n d t h e i n d u c t i v e e r o s i o n o f), and the inductive erosion of n_k h o l d u n c o n d i t i o n a l l y f o r a l l o d d i n t e g e r s.S i n g l e − s t e p b u l k h e a d d e c o u p l i n g a l s o h o l d s i n g e n e r a l i z e d hold unconditionally for all odd integers. Single-step bulkhead decoupling also holds in generalized (2^k+1)n+1 a d d e r s s u c h a s adders such as 5n+1 ( (k=2),w h i c h n o n e t h e l e s s a d m i t s c y c l e s (), which nonetheless admits cycles (13 \\to 33 \\to 83 \\to 13) b e c a u s e i t s b i t g r o w t h () because its bit growth (\\log_2 5 \\approx 2.322) e x c e e d s) exceeds \\mathbb{E}\[\\delta\] = 2$.
2.  **Avoiding the Convergent-Orbit Tautology:** By Equation (4), 2 Σ N n N \> 3 N n 0 2^{\\Sigma_N} n_N > 3^N n_0. Any trajectory that reaches n N \= 1 n_N = 1 in N N steps automatically obeys ⟨ δ ⟩ \= Σ N / N \> log ⁡ 2 3 + (log ⁡ 2 n 0) / N \> 1.5850 \\langle \\delta \\rangle = \\Sigma_N / N > \\log_2 3 + (\\log_2 n_0)/N > 1.5850. Measuring ⟨ δ ⟩ \> log ⁡ 2 3 \\langle \\delta \\rangle > \\log_2 3 on completed orbits is therefore a tautological consequence of convergence.
3.  **Sliding-Window Diagnostic W max ⁡ (B) W\_{\\max}(B) (B \= 4 … 14 B = 4 \\dots 14):** Without assuming convergence, we measure the longest contiguous window W max ⁡ (B) W\_{\\max}(B) along any trajectory starting in 2 B − 1 < n 0 < 2 B 2^{B-1} < n_0 < 2^B over which the window-averaged flush remains strictly expansive (∑ j \= t t + W − 1 δ (n j) < W log ⁡ 2 3 \\sum\_{j=t}^{t+W-1} \\delta(n_j) < W \\log_2 3), alongside the maximum odd stopping time N max ⁡ (B) N\_{\\max}(B). The observed growth of W max ⁡ (B) W\_{\\max}(B) across B ∈ \[4,14\] B \\in \[4, 14\] is consistent with the O (B) O(B) scaling predicted by standard geometric random-walk models:

| Bit-Length B B | Worst Seed n 0 n_0 | Static 2 B − 1 2^B-1 Window | Max Expansive Window W max ⁡ (B) W\_{\\max}(B) | Max Odd Steps N max ⁡ (B) N\_{\\max}(B) | Ratio W max ⁡ (B) / B W\_{\\max}(B) / B |
| --- | --- | --- | --- | --- | --- |
| 4 4 | 9 9 | 3 3 | 4 4 | 6 6 | 1.000 1.000 |
| 5 5 | 27 27 | 37 37 | 39 39 | 41 41 | 7.800 7.800 |
| 6 6 | 41 41 | 33 33 | 38 38 | 41 41 | 6.333 6.333 |
| 7 7 | 109 109 | 8 8 | 38 38 | 43 43 | 5.429 5.429 |
| 8 8 | 231 231 | 7 7 | 40 40 | 46 46 | 5.000 5.000 |
| 9 9 | 327 327 | 10 10 | 45 45 | 52 52 | 5.000 5.000 |
| 10 10 | 871 871 | 10 10 | 56 56 | 65 65 | 5.600 5.600 |
| 11 11 | 1161 1161 | 35 35 | 57 57 | 66 66 | 5.182 5.182 |
| 12 12 | 2919 2919 | 33 33 | 67 67 | 87 87 | 5.583 5.583 |
| 13 13 | 6919 6919 | 34 34 | 68 68 | 96 96 | 5.231 5.231 |
| 14 14 | 9225 9225 | 31 31 | 69 69 | 101 101 | 4.929 4.929 |

4.  **Per-Room Normalized Densities (100% Reproducible via Companion Script):** Normalizing cross-channel synthesis ρ synth \= (Ch2 + Ch1 ∗) / L t \\rho\_{\\text{synth}} = (\\text{Ch2}+\\text{Ch1}^\*)/L_t, carry vacuuming ρ vac \= U 1,upper / L t \\rho\_{\\text{vac}} = U\_{1,\\text{upper}}/L_t, and uncarried open rooms ρ U 0 \= U 0,upper / L t \\rho\_{U_0} = U\_{0,\\text{upper}}/L_t by active bit-length L t \= ⌊ log ⁡ 2 n t ⌋ + 1 L_t = \\lfloor \\log_2 n_t \\rfloor + 1 allows direct comparison against the analytic i.i.d. Bernoulli(1 / 2 1/2) baseline (ρ synth iid \= 1 / 12 ≈ 0.0833 \\rho\_{\\text{synth}}^{\\text{iid}} = 1/12 \\approx 0.0833, ρ vac iid \= ρ U 0 iid \= 1 / 4 \= 0.2500 \\rho\_{\\text{vac}}^{\\text{iid}} = \\rho\_{U_0}^{\\text{iid}} = 1/4 = 0.2500, with finite- L L boundary offset E \[U 1,upper − U 0,upper\] ≈ 2 − log ⁡ 2 3 ≈ 0.415 \\mathbb{E}\[U\_{1,\\text{upper}} - U\_{0,\\text{upper}}\] \\approx 2 - \\log_2 3 \\approx 0.415 and asymptotic weight drift E \[Δ w\] ≈ 1 2 (log ⁡ 2 3 − 2) ≈ − 0.2075 \\mathbb{E}\[\\Delta w\] \\approx \\frac{1}{2}(\\log_2 3 - 2) \\approx -0.2075):

| Evaluated Regime / Scale | Mean ⟨ δ ⟩ \\langle \\delta \\rangle | Mean ρ synth \\rho\_{\\text{synth}} | Mean ρ vac \\rho\_{\\text{vac}} (U 1 / L U_1/L) | Mean ρ U 0 \\rho\_{U_0} (U 0 / L U_0/L) | Mean ⟨ Δ w ⟩ \\langle \\Delta w \\rangle |
| --- | --- | --- | --- | --- | --- |
| Asymptotic i.i.d. Theory (L → ∞ L \\to \\infty) | 2.0000 2.0000 | 0.0833 0.0833 | 0.2500 0.2500 | 0.2500 0.2500 | − 0.2075 \-0.2075 |
| Random 256 256 -Bit Odd Sample (N \= 2,000 N = 2,000, seed \= 42 \= 42) | 1.9690 1.9690 | 0.0829 0.0829 | 0.2503 0.2503 | 0.2481 0.2481 | − 0.2840 \-0.2840 |
| Exact 13 13 -Bit Odd Set (L L -Matched Baseline, N \= 2,048 N = 2,048) | 2.0005 2.0005 | 0.0897 0.0897 | 0.2564 0.2564 | 0.2051 0.2051 | − 0.3335 \-0.3335 |
| Full Orbits of All 13 13 -Bit Odd Seeds (N \= 66,061 N = 66,061 steps) | 1.9812 1.9812 | 0.0838 0.0838 | 0.2489 0.2489 | 0.1923 0.1923 | − 0.2015 \-0.2015 |
| Conditioned on W max ⁡ W\_{\\max} Windows (B \= 10 … 14 B=10\\dots14, N \= 317 N = 317 steps) | 1.5647 1.5647 | 0.1022 0.1022 | 0.2649 0.2649 | 0.2241 0.2241 | − 0.0063 \-0.0063 |

### Exact Window Equivalence of the Open Convergence Problem

By the Bridge Identity, over any window of W W consecutive steps, the window-averaged flush rate satisfies:

⟨ U 1,upper − U 0,upper ⟩ W + 2 ⟨ Δ w ⟩ W \= 2 − ⟨ δ ⟩ W

Notice why retaining the weight-drift term 2 ⟨ Δ w ⟩ W 2\\langle \\Delta w \\rangle_W is essential: in a hypothetical divergent trajectory with random-like bit density where Hamming weight grows at half the bit-length rate (⟨ Δ w ⟩ W ≈ 1 2 (log ⁡ 2 3 − ⟨ δ ⟩ W) \> 0 \\langle \\Delta w \\rangle_W \\approx \\frac{1}{2}(\\log_2 3 - \\langle \\delta \\rangle_W) > 0), the corridor imbalance ⟨ U 1,upper − U 0,upper ⟩ W \\langle U\_{1,\\text{upper}} - U\_{0,\\text{upper}} \\rangle_W also sits right at 2 − log ⁡ 2 3 ≈ 0.415 2 - \\log_2 3 \\approx 0.415. Thus, bounding ⟨ U 1,upper − U 0,upper ⟩ W \\langle U\_{1,\\text{upper}} - U\_{0,\\text{upper}} \\rangle_W alone is sufficient to rule out non-trivial cycles (where ⟨ Δ w ⟩ cycle ≡ 0 \\langle \\Delta w \\rangle\_{\\text{cycle}} \\equiv 0), whereas establishing uniform trajectory contraction (⟨ δ ⟩ W ≥ log ⁡ 2 3 + η \\langle \\delta \\rangle_W \\ge \\log_2 3 + \\eta) is equivalent to establishing the joint window bound:

⟨ U 1,upper − U 0,upper ⟩ W + 2 ⟨ Δ w ⟩ W ≤ 2 − log 2 ⁡ 3 − η
