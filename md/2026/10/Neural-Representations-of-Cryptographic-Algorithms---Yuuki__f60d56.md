---
title: Neural Representations of Cryptographic Algorithms - Yuuki
source: https://yuuki.cool/posts/neuralcrypto/
source_host: yuuki.cool
clip_date: 2026-10-23T15:06:53+08:00
trace_id: 0cf34be4-fd21-4429-b16d-9a3903382c24
content_hash: e230c954e11171ed1963568141e78c1c013cf15fd1a6f21e871f94c8285316d8
status: synced
tags:
  - 密码学
  - 白盒分析
series: null
feed_source: Yuuki·移动安全
ai_summary: TL;DR：以 AES-128-CBC 为例，研究密码算法能否被神经网络逐位精确执行；结论是局部 S 盒简化并不带来整机加速，只有把状态整体改为双极性编码才有稳定收益，而且各类混淆都不能提供额外的密钥隐藏。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 40275244-d011-812d-adb7-dc460f0fd21c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：以 AES-128-CBC 为例，研究密码算法能否被神经网络逐位精确执行；结论是局部 S 盒简化并不带来整机加速，只有把状态整体改为双极性编码才有稳定收益，而且各类混淆都不能提供额外的密钥隐藏。
> 
> - **正确性验证：** 7 种 FP32 配置在三种进程、2 种执行模式、4 种批次形状下共完成 3360 次完整加密比对，原始比特与解码字节全部一致；与作者原始 DNC 代码比较另有 1440 次一致。
> - **性能排序：** 在编译后的 MPS 上处理 32 条消息、每条 16 块时，全双极性状态相对二进制电路的中位配对加速为 1.48，置信区间 [1.44,1.53]，60 对中有 59 对更快；而仅改 S 盒编码的中位比值为 1.000 [0.980,1.028]，没有稳定收益。相对作者 T-table 实现，二进制电路和全双极性状态分别中位加速 2.78 与 4.08；在 Eager CPU 上则仅 bit MLP 最快（2.38），二进制电路反而只有 0.47。
> - **速度上限：** 最快的神经配置处理同一负载仍需 4.562 ms，而原生 AES-CBC 仅需 0.1528 ms；排序随工作负载规模变化，因此门数少不等于张量运行时开销低。
> - **构造与泛化：** 角点探测器在二进制输入上即布尔最小项，可替换为共享逻辑，并采用 Boyar-Peralta/BearSSL 电路（83 个 XOR、32 个 AND、4 个输出反相），每个门用 ReLU 恒等式直接实现；SM4 是第二个已实现的电路复用案例，ChaCha20/MD5/素域曲线则指出了还需进位感知字加、多字模运算与例外情况选择。
> - **安全边界：** 只有采用“仅接受合法字节输入、内部编解码”的接口，才能证明与 AES-CBC 等价，任意张量与可读参数不在覆盖范围内；静态读取即可从 7 种配置恢复全部 280 组轮密钥（中位 0.0596 ms）；局部编码、32 位线性混合、Chow 编译及再混淆各自 20/20 恢复主密钥或原始表，混淆仅把静态重建中位时间由 31.87 ms 升至 80.83 ms、持久张量翻倍，没有建立额外密钥隐藏。

Yuuki

[shuangxve@gmail.com](mailto:shuangxve@gmail.com)

## Abstract

Exact neural execution of a cipher requires both a suitable representation and a numerical argument for its deployed operators. We study these choices through AES-128-CBC. Starting from DNC’s affine-ReLU corner construction, we use its Boolean interpretation to share repeated logic and substitute an existing compact S-box circuit. We compare this construction with interpolation, learned small-domain models, and alternative state encodings. Seven FP32 configurations pass 3360 complete-encryption comparisons in three processes on an Apple M4. For 32 messages of 16 blocks on compiled MPS, a fully bipolar state achieves a median paired speedup of 1.48 over the binary circuit; changing only the S-box encoding gives no stable gain. A separate 20-workload comparison with the authors’ T-table implementation gives median speedups of 2.78 for the binary circuit and 4.08 for the fully bipolar state. Eager CPU produces a different ranking, and all tested neural configurations remain slower than native AES. SM4 supplies a second implemented case of circuit reuse; constructions for ChaCha20, MD5, and prime-field curves identify the additional arithmetic and composition requirements. Security analysis distinguishes a public generator from a released key-dependent instance. Adapted analyses recover keys in the tested encoding, Chow compilation, and local obfuscation experiments, with local execution required for some paths. These transformations do not establish additional key hiding.

**Keywords:** cryptographic implementation; neural representation; Boolean circuits; finite precision; AES; white-box analysis.

## I Introduction

A neural implementation of a cipher must reproduce its discrete computation exactly. Coefficients, activations, and connections take the place of the integer and Boolean operations used in an ordinary implementation. The central questions are how to construct that representation, retain correctness under the deployed arithmetic, and control the cost of the resulting graph.

Deep Neural Cryptography (DNC) gives exact constructions using affine maps and ReLU, and studies the query surface introduced by extending binary functions to real inputs \[1\]. Its public AES implementation includes both a corner-based substitution and a T-table variant that combines SubBytes with finite-field multiplication \[7\]. TensorCrypt instead translates cryptographic programs into tensor graphs with integer arithmetic, shifts, bitwise operations, and lookup \[2\]. These approaches avoid learning an entire cipher from examples, but permit different operators. Exact constrained training for small domains, including 8-bit arithmetic in code obfuscation, is another established route \[5\].

We investigate alternative representations of the same computation. At binary inputs, the detectors in a corner network are Boolean minterms. Repeated matching can therefore be replaced by shared logic, leading to circuit representations. We explain that relationship through an actual AES cofactor, then use a compact published S-box circuit \[3,4\]. The substitution preserves the function on legal inputs, rather than its extension to every real input.

Finite substitutions also admit directly specified interpolants and trained candidate networks with deterministic decoding. Their correctness conditions and execution costs differ. Fewer gates need not mean less tensor-runtime overhead, and predictions close to a target need not yield exact cipher bits. We separate the representation of a finite function from its state encoding and evaluate the resulting configurations through a common cipher interface.

The main contributions and findings are as follows.

1.  **Representation and correctness conditions.** We connect corner expansion to shared Boolean logic and an existing compact circuit, and integrate circuit, interpolation, and learned S-boxes into the same AES interface. Direct constructions use discrete-domain identities; learned candidates require deterministic decoding and exhaustive component checks. State encoding is treated as a separate choice.
    
2.  **Performance ranking and encoding gains.** The ranking of seven configurations changes with execution mode and workload. At 32 messages of 16 blocks, the bit MLP is fastest on eager CPU and the fully bipolar state on compiled MPS. The latter gives a median paired speedup of 1.48 over the binary circuit, while changing only the S-box encoding gives a median ratio of 1.000. The whole-state gain therefore cannot be explained by local gate encoding alone. In a separate 20-workload comparison against the authors’ T-table code, the MPS binary circuit and fully bipolar state achieve median speedups of 2.78 and 4.08; the CPU binary circuit is slower.
    
3.  **Units required beyond AES.** SM4 implementation and substitution experiments test both shared construction units and reuse of a dedicated circuit. For ChaCha20, MD5, and prime-field curves, we specify the additional carry-aware word arithmetic, multiword modular operations, and exceptional-case selection needed for composition.
    
4.  **Security boundaries and model exposure.** We distinguish legal-byte queries from tensor queries and a public generator from a released key-dependent instance. State reading, fused encodings, Chow compilation, and local neural obfuscation are evaluated for key recovery and functional copying. Adapted analyses still undo the tested transformations despite increased storage and runtime, with static reading and execution-assisted recovery reported separately.
    

## II Foundations and Scope

### A AES-CBC

AES-128 encrypts a 128-bit block under a 128-bit key. Its key schedule produces eleven round keys, including the original key \[6\]. Cipher Block Chaining (CBC) applies that block permutation after XOR with the previous ciphertext:

C 0 \= I V,C i \= AES K ⁡ (P i ⊕︎ C i − 1),1 ≤ i ≤ ℓ.(1)

All quantities in this equation are 128-bit vectors. Our interface accepts whole blocks and a separate 16-byte IV for each message; padding is outside its scope. The fixed or public IVs used in tests support reproducibility. Actual CBC encryption also requires the IV conditions specified by the mode, including unpredictability \[13\].

![Figure 1 AES-128-CBC encryption](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f1c744f6b09281b.svg)

**Figure 1 AES-128-CBC encryption**

Figure 1 separates message chaining from the block cipher. Blocks of one message have a sequential dependency during encryption. Independent messages can be processed together, so the number of messages and the number of blocks per message are distinct workload dimensions.

For a single block, let X (0) \= P ⊕ K (0) X^{(0)}=P\\oplus K^{(0)}. The remaining computation is

X (r) \= MC ⁡ (SR ⁡ (SB ⁡ (X (r − 1)))) ⊕︎ K (r),1 ≤ r ≤ 9,C \= SR ⁡ (SB ⁡ (X (9))) ⊕︎ K (10).(2)

SubBytes (SB) applies an 8-bit substitution independently to each byte. ShiftRows (SR) permutes positions, MixColumns (MC) is linear over F 2 \\mathbb{F}\_2 when expressed on bits, and AddRoundKey is XOR with a round key. The final round omits MixColumns. Because the same S-box acts independently at every byte, SB and SR commute. This permits a convenient ordering of their tensor operations without changing AES.

### B Legal inputs and correctness

The legal inputs are 128-bit AES blocks and whole-block CBC messages, with keys, IVs, and chaining defined by the target algorithm. A fixed message length gives a fixed input dimension; an outer interface organizes other lengths. We encode each bit as a floating-point 0 or 1. For encoding and decoding maps enc ⁡ \\operatorname{enc} and dec ⁡ \\operatorname{dec}, the requirement is

N K (enc ⁡ (P)) \= enc ⁡ (AES K ⁡ (P)),dec ⁡ ∘ N K ∘ enc ⁡ \= AES K ⁡.(3)

The first equality requires correct binary outputs before byte reconstruction. For a regression-based component, prescribed rounding belongs to the deployed module; its unrounded prediction can still differ from the target integer.

### C Operator models

We distinguish three permitted operator sets.

-   **Affine maps and ReLU.** Corner networks, binary Boolean circuits, and bitwise interpolants use these operators and fixed wiring. The bit MLP uses ReLU hidden layers and deterministic clipping expressible with the same operators.
-   **Elementwise multiplication added.** Bipolar encoding replaces XOR by products of state values. It therefore extends the affine-ReLU model.
-   **Tanh and rounding added.** The scalar learned model uses tanh internally and rounds before deterministic bit decoding. Rounding is part of its functional specification.

Permutations use indexing or fixed connections. Ordinary program logic composes modules and manages message chaining. The seven main configurations store constants, coefficients, and round keys as model state; Section VII separately tests fused functions whose coefficients absorb the keys. No custom native AES or S-box operator is invoked inside the cipher graph. AES key expansion runs during ordinary preprocessing, outside encryption timing. TensorCrypt’s integer and bitwise graph is a different operator model.

### D Validation levels

Learning error, inference randomness, numerical differences, and agreement across configurations require separate checks. The first concerns the fitted function; the second concerns sampling or nondeterministic execution; the third concerns finite precision and evaluation order; the fourth concerns devices, batch layouts, and compilation.

We distinguish mathematical equivalence, a finite-precision argument for specified operators, and bitwise tests of deployed configurations. Learned internal values may be approximate, but their prescribed decoded bits must be correct. Later analysis of DNC also shows why exact-real security arguments require scrutiny under floating-point execution \[8,9\].

The implemented cipher evaluations cover AES-128-CBC and SM4 on the recorded platform. ChaCha20, MD5, and ECC identify construction requirements. The encoding, mixing, Chow, and obfuscation experiments in Section VII are separate from the seven-configuration performance study.

## III Constructing Neural AES

We begin with DNC’s corner construction and connect finite substitutions, permutations, and XOR into AES. Section IV changes the S-box representation and state encoding.

### A Corner construction

Write ρ (t) \= max ⁡ (t,0) \\rho(t)=\\max(t,0). For each vertex v ∈ { 0,1 } n v\\in\\{0,1\\}^n, define

h v (x) \= ρ (1 − ∑ i \= 1 n | x i − v i |) \= ρ (1 − ∑ i v i + ∑ i (2 v i − 1) x i).(4)

The affine expression for the distance is valid on \[0,1\] n \[0,1\]^n. At a binary input, its argument is one minus the Hamming distance: exactly one detector has value 1, and all others have value 0. Consequently, any Boolean map f:{ 0,1 } n → { 0,1 } m f:\\{0,1\\}^n\\to\\{0,1\\}^m has the exact representation

N f (x) \= ∑ v ∈ { 0,1 } n f (v) h v (x).(5)

The first layer’s weights and biases specify the detectors. The second layer’s weights contain the output vectors f (v) f(v). For an 8-bit S-box, 256 hidden units are shared by all eight output bits. Constructing eight separate sets of input detectors would duplicate work.

![Figure 2 Corner-based S-box](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5eefc7abc1481ec1.svg)

**Figure 2 Corner-based S-box**

In Figure 2, input 53 \\mathtt{53} activates one detector and returns E D \\mathtt{ED}. The network specifies a continuous extension between vertices, but only its values at valid inputs are needed for cipher correctness.

AES defines this finite mapping through inversion and an affine transformation. For a a in F 2 \[t\] / (t 8 + t 4 + t 3 + t + 1) \\mathbb{F}\_2\[t\]/(t^8+t^4+t^3+t+1), set b \= a − 1 b=a^{-1} with 0 − 1 \= 0 0^{-1}=0. Numbering the least significant bit as zero,

S (a) i \= b i ⊕︎ b (i + 4) mod 8 ⊕︎ b (i + 5) mod 8 ⊕︎ b (i + 6) mod 8 ⊕︎ b (i + 7) mod 8 ⊕︎ (𝟼𝟹) i.(6)

The corner construction installs the 256 results of this definition; it does not perform a field inversion at inference time. A Boolean circuit instead exploits structure and shared intermediate values in the same finite map.

### B Round transformations

For a fixed key bit k k, XOR is already affine:

x ⊕︎ k \= (1 − 2 k) x + k.(7)

Thus a network coefficient can carry key information just as directly as a named key buffer. ShiftRows needs only fixed wiring.

For MixColumns, each output bit is the parity of a fixed set of input bits. If their integer sum is s ∈ { 0,…,d } s\\in\\{0,\\ldots,d\\}, then

parity ⁡ (s) \= s + 2 ∑ j \= 1 d − 1 (− 1) j ρ (s − j).(8)

The slope alternates on successive unit intervals, giving s m o d 2 s\\bmod2 at every integer argument. Fixed linear maps followed by this piecewise-linear function therefore suffice. Decomposing the same map into XOR gates provides another exact implementation, with different depth, intermediate storage, and opportunities for reuse.

### C Composition and finite precision

Correctness can be checked at module boundaries. Suppose each module agrees with its discrete specification on its legal domain and preserves the encoding required by the next module. Substituting these equalities proves the complete block-cipher equality in (3). Induction over (1) then proves CBC correctness: a correct previous ciphertext yields the correct next XOR input and hence the correct next ciphertext. Exhausting the full AES domain is unnecessary for this compositional argument.

Real-arithmetic identities do not by themselves establish floating-point correctness. One sufficient condition for an integer-coefficient construction is that every operand, product, partial sum, and result be an exactly representable integer, without overflow. A binary format with precision p p represents every integer of magnitude at most 2 p 2^p. If the evaluated graph stays within these conditions, induction over its operations establishes exact results. The small ranges in corner detectors and Boolean gates make this condition useful.

This is a sufficient condition for a specified evaluation, not a certification of every compiler rewrite, precision reduction, or backend. It also says nothing about arbitrary nonbinary queries. For learned models, the internal values need not be exact integers; correctness instead depends on a verified decoding margin. We therefore distinguish a mathematical construction, a finite-precision argument under stated assumptions, and tests of particular deployed executions.

### D Learning the whole cipher

Fixing K K leaves exactly 2 128 2^{128} possible AES input blocks. Equation (5) gives an exact full-cipher representation:

N K (x) \= ∑ v ∈ { 0,1 } 128 enc ⁡ (AES K ⁡ (v)) h v (x),128 ⋅ 2 128   bits \= 2 132   bytes.(9)

The storage term counts raw outputs alone, before input indexing and network connections. We train only small components whose complete input domains can be checked, and compose them with deterministic round transformations.

## IV S-box Representations

We first compare circuits, interpolation, and learned models, then separate the choice of state encoding.

### A Cost of table expansion

AES-128 applies its S-box 160 times per block. A dense 8 → 256 → 8 8\\to256\\to8 corner implementation contains 4096 weight products per byte, before counting activation, movement, or layout costs. This algebraic count is not an instruction count, but it explains why a fast native byte lookup need not remain fast when expanded into neural layers.

Reusing the model avoids repeated construction. Sharing the detector bank avoids eight copies of the same matching operation, and batching increases the work available to each kernel. Neither removes the full expansion over 256 possible inputs. A structural optimization must change that representation. At the same time, replacing matrix operations with many small gates may exchange arithmetic redundancy for tensor-launch and storage costs. The alternatives must be evaluated as executable graphs.

### B Shared Boolean structure

On binary inputs, a corner detector is a Boolean minterm:

h v (x) \= ⋀ i \= 0 7 ℓ v i (x i),ℓ 1 (x i) \= x i,ℓ 0 (x i) \= ¬ x i.(10)

An output bit is the OR of its selected minterms. Because distinct minterms are mutually exclusive, OR, XOR, and real addition agree on their values. Shared negations, matching prefixes, and repeated subfunctions can therefore replace parts of the expanded network without changing any valid output.

For an output function g g, Shannon expansion gives

g (x) \= (¬ x i ∧ g | x i \= 0) ∨ (x i ∧ g | x i \= 1).(11)

Identical cofactors can share a node, and irrelevant variables can be removed. Decision diagrams formalize such sharing \[18\]; their size depends on variable order and representation. Sharing the original 256 detectors is a useful first step, but does not by itself synthesize a small S-box circuit.

### C AES S-box circuit

Consider actual AES inputs with the six-bit prefix 010100 010100. Let u,v u,v be the final two bits:

| u v uv | Input | Output | Input bits | Output bits |
| :---: | :---: | :---: | :---: | :---: |
| 00  | `50` | `53` | 01010000 | 01010011 |
| 01  | `51` | `D1` | 01010001 | 11010001 |
| 10  | `52` | `00` | 01010010 | 00000000 |
| 11  | `53` | `ED` | 01010011 | 11101101 |

Four corner detectors followed by eight sums implement this cofactor. Simplifying the columns gives, in most-significant-bit order,

q \= u ∧ v,r \= 1 ⊕︎ u ⊕︎ q,t \= ¬ u ∧ ¬ v,S (010100 u v) \= (v,  r,  q,  ¬ u,  q,  q,  t,  r).(12)

The terms q q and r r feed several output bits. For u \= v \= 1 u=v=1, the result is 11101101 11101101, or E D \\mathtt{ED}. A single shared computation now handles all four inputs; it does not select among four separately executed circuits.

![Figure 3 Shared logic in an AES cofactor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7973b286a447ef01.svg)

**Figure 3 Shared logic in an AES cofactor**

Figure 3 shows the shared terms q,r,t q,r,t for the fixed-prefix cofactor in (12).

For the full substitution, we use the Boyar-Peralta connection implemented by BearSSL \[4\]; related low-depth circuit constructions are described in \[3\]. This connection differs from the depth-16 version and contains 83 XORs, 32 ANDs, and four output inversions. The grouped equations are extracted from the implementation.

Each gate has a direct neural realization:

AND ⁡ (a,b) \= ρ (a + b − 1),XOR ⁡ (a,b) \= a + b − 2 ρ (a + b − 1),NOT ⁡ (a) \= 1 − a.(13)

Following the circuit dependencies produces a network of affine maps, ReLU, and wiring. Each gate preserves binary outputs, so correctness follows by induction over the dependency graph. This network agrees with the corner construction on binary inputs; their behavior outside that domain can differ, so security properties involving those inputs require separate analysis.

The execution cost of a circuit can be decomposed as

T ≈ T launch + T compute + T memory + T transfer + T sync.(14)

These terms can overlap. Gate count, logic depth, live tensors, and opportunities for operator fusion jointly affect execution; performance must be measured.

Figure 4 organizes the implemented connection into an input linear map, a nonlinear core, a product layer, and an output affine map. The stage interfaces are a 22-bit shared vector u \\mathbf u, a 9-bit vector v \\mathbf v, an 18-bit product vector z \\mathbf z, and the 8-bit output s \\mathbf s. They satisfy u \= A x \\mathbf u=A\\mathbf x, v \= G (u) \\mathbf v=G(\\mathbf u), z \= P (u,v) \\mathbf z=P(\\mathbf u,\\mathbf v), and s \= B z ⊕ c \\mathbf s=B\\mathbf z\\oplus\\mathbf c. The linear maps are over F 2 \\mathbb{F}\_2, with c \\mathbf c encoding byte 63 \\mathtt{63}; their logical operations are realized neurally using (13). The upper branch carries 18 selected bits of u \\mathbf u directly to the product layer, preserving shared signals across stages.

![Figure 4 AES S-box structure](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fd0055a9e2c277a1.svg)

**Figure 4 AES S-box structure**

Figure 5 lists all 119 assignments, grouped by the four stages. Within each stage, read down each column from left to right.

![Figure 5 AES S-box program](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d07a93522dca90d.svg)

**Figure 5 AES S-box program**

### D Piecewise-linear interpolation

A table can also be specified by its values along the integer byte axis. For y 0,…,y 255 y_0,\\ldots,y\_{255}, write d j \= y j + 1 − y j d_j=y\_{j+1}-y_j. Then

p (a) \= y 0 + ∑ j \= 0 254 d j \[ρ (a − j) − ρ (a − j − 1)\].(15)

At an integer a \= k a=k, the bracket is 1 for j < k j<k and 0 otherwise. The sum telescopes to y k y_k. Choosing each output bit as a separate sequence yields eight curves with shared knot activations. Choosing y j \= S (j) y_j=S(j) yields a single byte-valued curve, equivalently

p (a) \= y 0 + d 0 a + ∑ j \= 1 254 (d j − d j − 1) ρ (a − j),0 ≤ a ≤ 255.(16)

At legal byte inputs, each ramp in (15) is 0 or 1. Bit-output coefficients lie in { − 1,0,1 } \\{-1,0,1\\} and scalar-output coefficients in \[− 255,255\] \[-255,255\]. Including the initial value, the magnitudes of all partial sums are bounded by 256 and 65280, respectively. Both are within FP32’s exact integer range, so cancellation in this implementation does not by itself introduce rounding error. Scalar outputs still require bit decoding. The unified comparison uses the bitwise interpolant to preserve the binary AES interface. Both sets of coefficients come directly from the table, without training.

### E Learned small-domain models

We train two fully connected models on all 256 S-box pairs. The bit model first maps its inputs through 2 x − 1 2x-1 and has shape 8 → 64 → 64 → 8 8\\to64\\to64\\to8, with ReLU hidden layers and output logits.

Its deployed output uses the deterministic clipping function

c (z) \= 1 − ρ (1 − ρ (z)),z ≤ 0 ⇒ c (z) \= 0,z ≥ 1 ⇒ c (z) \= 1.(17)

High classification accuracy or probabilities close to 0 and 1 would not suffice. We check every logit against the appropriate saturation region and verify the resulting binary values.

The scalar model has shape 1 → 1024 → 1 1\\to1024\\to1, with tanh in the hidden layer. It is trained without prescribing 256 input-indicator units. For a network f θ f\_\\theta on normalized coordinates, its scales are

a ~ \= a 127.5 − 1,y ~ \= S (a) − 127.5 127.5,g θ (a) \= 127.5 f θ (a ~) + 127.5.

Training uses damped Levenberg-Marquardt in FP64; deployment evaluates in FP32 and rounds:

S ^ (a) \= round ⁡ (g θ (a)),max a ∈ { 0,…,255 } ⁡ | g θ (a) − S (a) | < 1 2.(18)

The strict bound avoids rounding ties and is sufficient for exact bytes, which are then decoded into bits. This decoding can also use ReLU: for a rounded byte r r, visit w \= 128,64,…,1 w=128,64,\\ldots,1, compute b w \= ρ (r − w + 1) − ρ (r − w) b_w=\\rho(r-w+1)-\\rho(r-w), and update r ← r − w b w r\\leftarrow r-wb_w. Tanh and rounding are part of this deployment model, so it is not a pure ReLU construction.

After freezing a candidate, exhaustive evaluation covers the S-box’s entire input domain. This is a finite-domain validation problem, not a claim about prediction on unseen byte values. Nor does success at this scale establish a practical training method for the complete AES mapping.

### F State encoding

A binary external interface does not require every internal value to use the encoding { 0,1 } \\{0,1\\}. With σ b \= 1 − 2 b ∈ { − 1,1 } \\sigma_b=1-2b\\in\\{-1,1\\},

σ a ⊕︎ b \= σ a σ b,σ ¬ a \= − σ a,σ a ∧ b \= 1 − ρ (− σ a − σ b) \= 1 2 (1 + σ a + σ b − σ a σ b).(19)

The two AND expressions agree on bipolar inputs. The first retains ReLU; the second uses a product. XOR becomes multiplication, so this representation extends the affine-ReLU operator set. Calling it merely a smaller instance of the original DNC model would omit that change.

The coefficient 1 / 2 1/2 is exactly representable in binary floating point. Its presence does not imply approximate computation: exactness depends on the values and operations together. With bipolar states, key addition is multiplication by fixed signs, CBC XOR is elementwise multiplication, and parity becomes

σ b 1 ⊕︎ ⋯ ⊕︎ b d \= ∏ i \= 1 d σ b i,b \= 1 − σ b 2.(20)

Rewriting MixColumns and retaining the encoding across rounds avoids repeated conversion. We distinguish an S-box-only bipolar variant from a fully bipolar state variant. Their performance difference cannot be attributed solely to changing the gates inside SubBytes.

![Figure 6 Binary and bipolar gates](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6c687748155a0980.svg)

**Figure 6 Binary and bipolar gates**

Function representation and state encoding are independent dimensions. Circuits, interpolation, and training specify the substitution, while binary and bipolar encodings specify how modules pass state. Table 1 identifies the seven configurations used below.

**Table 1 AES configurations**

| Configuration | S-box representation | State between rounds | Extra operators | Output or conversion |
| :--- | :--- | :--- | :--- | :--- |
| Corner | Corner detectors and output map | Binary | None | Direct bits |
| Binary circuit | Existing AES Boolean circuit | Binary | None | Direct bits |
| Bit spline | Bitwise linear interpolation | Binary | None | Interpolated bits |
| Bit MLP | ReLU bit MLP | Binary | None | ReLU clipping |
| Scalar tanh | Scalar tanh regression | Binary | Tanh, rounding | Round, then decode bits |
| Bipolar S-box | Bipolar AES circuit | Binary; bipolar inside S-box | Elementwise product | Binary at S-box boundary |
| Fully bipolar | Bipolar AES circuit | Bipolar | Elementwise product | Convert at CBC input/output |

Extra operators are relative to affine maps, ReLU, and fixed wiring. The state column describes round interfaces, not every hidden value. The fully bipolar configuration also rewrites MixColumns, key addition, and CBC chaining.

## V Evaluation

We compare AES correctness and execution cost, then the original DNC code, stored state, and training replication. Section VI combines the SM4 construction with its separate substitution experiment.

### A Protocol

The recorded platform is an Apple M4 with 24 GiB of unified memory, running macOS 15.6, Python 3.11.9, PyTorch 2.14.1, and PyCryptodome 4.0.1. CPU measurements use four threads and eager execution. MPS measurements compile the shared CBC block step. All seven AES representations use FP32. Device comparisons therefore also include a change in execution mode; they do not isolate the speedup due to GPU hardware.

The seven variants are the corner network, binary circuit, bitwise spline, learned bit MLP, learned scalar tanh model, bipolar S-box, and fully bipolar state. The corner variant follows the DNC construction in our framework; Figure 9 separately compares the authors’ original AES cores. The learned and multiplication-based variants have the operator differences specified above.

Three fresh processes repeat the same 20 key/input workloads. Each workload is measured at four shapes (M,B) (M,B): (1,1) (1,1), (1,16) (1,16), (32,16) (32,16), and (256,16) (256,16), where M M is the number of messages and B B the blocks per message. This yields 60 measurements per configuration. Models and compiled steps are reused, with round-key state updated outside timing. Construction, key expansion and updates, training, compilation, and warmup are excluded. Processes can share an on-disk compilation cache, so these runs do not measure fully cold compilation.

Core latency starts with plaintext and IV bit tensors resident on the device and ends with raw ciphertext bits, including CBC chaining. Byte-interface latency includes packing, transfers, inference, the exact-binary output check, and conversion back to bytes. MPS timing synchronizes at measurement boundaries. Calibration selects between 2 and 30 internal repeats; those repeats are averaged rather than treated as independent observations.

The two latency measures are sampled separately. An occasional byte-interface mean below a core mean is therefore not evidence of negative conversion cost, and their difference is not a precise transfer measurement. The native comparison uses PyCryptodome CBC with a new context for each message, including that context creation in the measured call.

Table 1 lists the seven configurations. Tables 2 and 3 use our corner implementation; Figure 9 reports the additional author-code comparison.

### B Correctness

Validation checks the NIST CBC known-answer example, message permutation and partitioning, continuation through successive chunks, empty inputs, and rejected invalid lengths. Separate S-box checks enumerate all 256 inputs under batches of 1, 3, 32, and 256, including reordered and repeated values and a sweep through every byte position. They exercise eager CPU and compiled MPS component execution.

Across processes, workloads, variants, execution configurations, and shapes, there are 3 × 20 × 7 × 2 × 4 \= 3360 3\\times20\\times7\\times2\\times4=3360 complete-encryption comparisons. Raw output bits, decoded bytes, and repeated results agree in every case. All deployed decoders are deterministic. These checks support the recorded hardware, formats, layouts, and execution modes. The all-input mathematical argument remains the compositional one given above; testing does not exhaust the full AES domain or certify arbitrary future backends.

The author-code comparison separately checks 20 × 9 × 2 × 4 \= 1440 20\\times9\\times2\\times4=1440 complete encryptions: two original DNC implementations and our seven configurations. Raw bits, decoded bytes, and repeated results all agree. These are repeated checks of the same 20 key/input workloads, rather than that many independent keys.

### C Latency

**Table 2 AES-CBC latency, 32 messages of 16 blocks (ms)**

| Representation | CPU core | CPU bytes | MPS core | MPS bytes |
| :--- | ---: | ---: | ---: | ---: |
| Corner | 23.010 | 21.963 | 11.489 | 12.479 |
| Binary circuit | 74.709 | 76.890 | 5.345 | 6.937 |
| Bit spline | 25.967 | 25.021 | 9.381 | 10.523 |
| Bit MLP | 15.667 | 15.658 | 14.477 | 16.006 |
| Scalar tanh | 125.903 | 118.101 | 10.724 | 11.835 |
| Bipolar S-box | 32.092 | 32.299 | 5.242 | 6.683 |
| Bipolar state | 28.455 | 29.116 | 3.284 | 4.562 |

Means of 60 measurements: 20 workloads in each of three processes. CPU is eager; MPS is compiled. Native CBC takes 0.1528 ms through its byte interface. Setup, compilation, and warmup are excluded.

For (M,B) \= (32,16) (M,B)=(32,16), the compiled MPS binary circuit takes 6.937 ms through the byte interface, versus 12.479 ms for the corner construction. Keeping the complete state bipolar reduces this to 4.562 ms. The ordering changes on eager CPU: the learned bit MLP takes 15.658 ms and is fastest among the neural variants at this shape, while the binary circuit takes 76.890 ms. A lower Boolean gate count therefore does not determine the fastest neural implementation.

Even the fastest neural result in Table 2 is slower than native CBC, which takes 0.1528 ms for the same workload. The experiment measures tradeoffs between representations in a neural runtime; it does not establish a replacement for optimized native AES.

To compare variants without discarding workload pairing, let s s index processes and g g index the repeated workloads:

R s,g \= T s,g circuit T s,g candidate,R ^ \= median s,g ⁡ R s,g.(21)

Here T T is byte-interface latency. We resample process and workload indices independently and retain their crossed combinations, using 2000 bootstrap draws. At (32,16) (32,16) on MPS, the fully bipolar state has a median speedup of 1.48 relative to the binary circuit, with a 95% bootstrap interval of \[1.44,1.53\] \[1.44,1.53\]; it is faster in 59 of 60 pairs.

![Figure 7 AES-CBC encoding speedup](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/37fd6336cb5fa718.svg)

**Figure 7 AES-CBC encoding speedup**

Points show median paired speedups relative to the binary circuit; horizontal bars show 95% bootstrap intervals. The workload is 32 messages of 16 blocks on compiled MPS. The dashed line marks a speedup of 1. The medians and intervals are computed from paired latency ratios, rather than ratios of the means in Table 2.

Figure 7 compares the local and full-state encoding changes. Changing only the S-box encoding gives a median ratio of 1.000, an interval of \[0.980,1.028\] \[0.980,1.028\], and 30 faster pairs. It does not show a stable end-to-end gain under this protocol. The full variant also changes MixColumns and conversion boundaries, so its improvement cannot be assigned to S-box encoding alone. These intervals describe resampling of the recorded processes and workloads, not variability across hardware families.

![Figure 8 AES-CBC batch latency](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9fd20bd3ab65e319.svg)

**Figure 8 AES-CBC batch latency**

Each message contains 16 blocks; message counts are 1, 32, and 256. The panels show eager CPU and compiled MPS execution, with shared logarithmic axes. Each point is a mean of 60 byte-interface measurements. Line styles and markers distinguish four neural variants and native AES. Table 3 gives the complete numerical data, including the single-block workloads. Native AES runs on CPU; the same CPU reference is shown in both panels.

**Table 3 CBC byte-interface latency across workloads (ms)**

| Shape | Config. | Corner | Circuit | Bit MLP | Bipolar state | Native |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| 1 × 1 1\\times 1 | CPU | 0.281 | 4.515 | 0.430 | 1.721 | 0.0043 |
| 1 × 1 1\\times 1 | MPS | 2.024 | 1.326 | 1.958 | 1.073 | 0.0043 |
| 1 × 16 1\\times 16 | CPU | 3.755 | 71.127 | 6.516 | 26.670 | 0.0050 |
| 1 × 16 1\\times 16 | MPS | 11.217 | 6.263 | 14.332 | 3.785 | 0.0050 |
| 32 × 16 32\\times 16 | CPU | 21.963 | 76.890 | 15.658 | 29.116 | 0.1528 |
| 32 × 16 32\\times 16 | MPS | 12.479 | 6.937 | 16.006 | 4.562 | 0.1528 |
| 256 × 16 256\\times 16 | CPU | 140.710 | 132.424 | 94.015 | 56.629 | 1.1796 |
| 256 × 16 256\\times 16 | MPS | 30.069 | 9.909 | 18.246 | 7.565 | 1.1796 |

Means of 60 measurements: the same 20 workloads repeated in three processes. CPU is eager; MPS is compiled. Bipolar state denotes the fully bipolar variant. Native AES includes context creation for each message. Setup, compilation, and warmup are excluded.

Figure 8 shows that the ranking depends on workload size. Among the four plotted neural variants on eager CPU, Corner has the lowest latency at one message, the bit MLP at 32 messages, and the fully bipolar state at 256 messages. The fully bipolar state has the lowest latency among the plotted neural variants at all three compiled-MPS batch sizes. Larger batches expose parallelism between messages, but never remove the dependency between blocks within one CBC encryption. These panels compare the recorded execution configurations; CPU and MPS also differ in compilation mode. TensorCrypt principally reports CTR results and also compares CPU timings for CBC and other modes \[2\]. Its reported throughput is therefore not a prediction for the CBC workloads here.

For a direct comparison with the original code, we integrate `NeuralAESBase` and `TTablesNeuralAES` at commit `b2c230fc` \[7\]. The source files are unchanged; a common wrapper supplies CBC chaining and the byte interface. Both use ten rounds, `c_parameter=1.0`, `protected=False`, and FP32. Our seven configurations are remeasured in the same process. Hashes confirm that keys, plaintexts, and IVs match the earlier three-process workloads. CPU remains four-thread eager execution; MPS compiles the shared block step. Models, key buffers, and compiled code are reused, with preparation excluded.

![Figure 9 Performance relative to DNC](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ad8c254471c7f931.svg)

**Figure 9 Performance relative to DNC**

Panel (a) uses eager CPU and panel (b) compiled MPS. Both measure the complete FP32 byte interface for 32 messages of 16 blocks. Points are medians of 20 paired speedups; horizontal bars are 95% bootstrap intervals, with medians printed at the right. The panels share logarithmic axes. The dashed reference is DNC T-table at 1; values above 1 are faster and values below 1 slower.

Figure 9 comes from a separate fresh process, unlike the three-process measurements in Figures 7 and 8. Each ratio divides DNC T-table latency by the corresponding candidate latency. The interval resamples workloads 2000 times and describes within-process variation only.

On compiled MPS, the binary circuit and fully bipolar state achieve paired median speedups of 2.78 and 4.08 over the authors’ T-table version, with intervals \[2.72,2.84\] \[2.72,2.84\] and \[4.04,4.15\] \[4.04,4.15\]; both are faster in all 20 pairs. On eager CPU, the binary circuit gives 0.47, with interval \[0.46,0.48\] \[0.46,0.48\], while the bit MLP gives 2.38, with interval \[2.15,2.49\] \[2.15,2.49\]. Circuit substitution therefore remains dependent on execution conditions.

The fully bipolar configuration adds multiplication and must be distinguished from an affine-ReLU binary circuit. Whole-implementation differences also include MixColumns, key handling, and encoding boundaries, so the complete gain cannot be assigned to the S-box circuit alone.

### D State and resources

**Table 4 Parameters and stored state**

| Representation | Parameters | Tensors (KiB) | Archive (KiB) |
| :--- | ---: | ---: | ---: |
| Corner | 0   | 32.20 | 35.69 |
| Binary circuit | 0   | 15.20 | 18.02 |
| Bit spline | 0   | 24.23 | 27.94 |
| Bit MLP | 5256 | 35.73 | 40.06 |
| Scalar tanh | 3073 | 27.24 | 31.37 |
| Bipolar S-box | 0   | 15.20 | 18.02 |
| Bipolar state | 0   | 15.20 | 18.02 |

Parameters count learned weights and biases. Persistent tensor storage also includes buffers, fixed coefficients, and round keys. The archive excludes source code, the runtime, and compiled artifacts.

Table 4 distinguishes learned parameters, persistent tensor storage, and serialized state. Learned parameters are frozen for deployment. Constructed networks retain fixed coefficients, state, and keys, many stored as buffers, even when they have no learned parameters.

Fourteen additional processes record resource use for the seven variants on CPU and MPS. The reported process high-water RSS ranges from 327.8 to 393.8 MiB on CPU and from 536.7 to 575.8 MiB on MPS. These values include the interpreter, framework, and compilation/runtime resources. MPS allocator and driver readings are post-execution snapshots, not peak device-memory measurements. On unified memory, adding these readings to process RSS would also risk double counting.

### E Training replication

**Table 5 Training across seeds**

| Model | Seed | Steps | Time (s) | Margin / error |
| :--- | :--- | ---: | ---: | ---: |
| Bit MLP | 0   | 200 | 0.066 | 3.9299 |
| tanh | 0   | 25  | 0.253 | 0.003113 |
| Bit MLP | 1   | 200 | 0.048 | 4.1056 |
| tanh | 1   | 16  | 0.126 | 0.003624 |
| Bit MLP | 2   | 200 | 0.048 | 3.7516 |
| tanh | 2   | 25  | 0.230 | 0.003265 |

Bit MLP: minimum signed logit. Scalar tanh: maximum byte error after conversion to FP32. All 256 decoded outputs are correct in every run.

Both learned models are retrained sequentially with seeds 0, 1, and 2 in one fresh process, using all 256 S-box pairs and four CPU threads. Seed 0 reproduces the state tensors of the frozen checkpoints selected before unified timing. Other seeds are reported as training repetitions, not substituted into those timing results.

For the bit MLP, the reported minimum signed logit is m \= min ⁡ a,j (2 S (a) j − 1) z j (a) m=\\min\_{a,j}(2S(a)\_j-1)z_j(a), with target bit S (a) j S(a)\_j and score z j (a) z_j(a); m ≥ 1 m\\geq1 suffices for (17) to decode correctly. The bit MLP uses full-batch binary cross-entropy with logits and Adam at learning rate 0.01. Its stopping condition is a minimum signed logit of at least 3, checked every 100 steps, or a limit of 5000 steps. All three runs satisfy the condition at 200 steps. At inference, (17) converts the checked margins into exact bits.

The tanh model uses damped dual Levenberg-Marquardt in FP64. Initial first-layer weights and biases are scaled by 512; all layers remain trainable. Damping starts at 10 − 4 10^{-4}, is multiplied by 0.3 after an accepted step and by 10 after rejection, with at most 12 trial steps. Training stops when the maximum byte error falls below 10 − 9 10^{-9}, backtracking fails, or 200 iterations are reached. The three runs use 25, 16, and 25 iterations. Conversion to FP32 precedes deployment validation.

For a fixed scalar model, numerical portability is governed by the remaining decoding margin. An output perturbation δ (a) \\delta(a) preserves the rounded byte whenever

| δ (a) | < 1 2 − | g θ (a) − S (a) | for every  a,(22)

The frozen model’s maximum raw byte error is approximately 0.003113 on CPU and 0.005508 on MPS in the recorded checks. Its real-valued predictions differ across configurations, while every rounded output agrees. This is evidence of a margin in those executions, not a backend-independent error bound.

Training times include optimization and stopping checks, excluding process startup, initialization, and saving.

## VI Beyond AES

Extension begins by identifying which substitutions, Boolean operations, and wiring can be reused, then adds carry, reduction, inversion, and selection. SM4 is implemented and measured. ChaCha20, MD5, and prime-field curves supply constructions and interface conditions; their implementation and performance evaluation remain future work.

### A SM4

SM4 retains much of the construction vocabulary: an 8-bit substitution, XOR, and fixed wiring. Its state consists of four 32-bit words and evolves through 32 rounds \[10\]:

X i + 4 \= X i ⊕︎ L (τ (X i + 1 ⊕︎ X i + 2 ⊕︎ X i + 3 ⊕︎ r k i)).(23)

where τ \\tau substitutes each of the four bytes. The encryption and key-schedule linear maps are

L (B) \= B ⊕︎ ROL 2 ⁡ (B) ⊕︎ ROL 10 ⁡ (B) ⊕︎ ROL 18 ⁡ (B) ⊕︎ ROL 24 ⁡ (B),L ′ (B) \= B ⊕︎ ROL 13 ⁡ (B) ⊕︎ ROL 23 ⁡ (B).(24)

Rotations are permutations of bit positions. Replacing the S-box and connecting these operations therefore yields an SM4 network, with the final word reversal specified by the cipher. A dedicated substitution circuit can avoid the affine wrappers around an AES circuit \[11,12\]. The artifact includes a tensor key schedule as a separate setup computation; neither the AES nor SM4 encryption timings include key expansion.

The SM4 comparison replaces an affine-AES-circuit-affine S-box with Saarinen’s dedicated SM4 circuit \[10,11,12\], preserving the encryption round function, packing, linear maps, and round keys. In the recorded operation accounting, the original S-box has 113 XORs, 32 ANDs, and eight inversions; the dedicated one has 81 XORs, 14 XNORs, and 34 ANDs. Both are evaluated with bipolar arithmetic.

Each configuration uses the same 20 workloads at 1, 16, 256, and 4096 independent 16-byte blocks. The isolated S-box and complete cipher are timed separately. The existing tensor key-schedule module is checked against the ordinary reference and supplies identical round keys to both variants outside the timed encryption.

**Table 6 SM4 core latency for 4096 bytes (ms)**

| Device | Precision | S-box | S-box layer | Full cipher |
| :--- | :--- | :--- | :--- | ---: |
| CPU | FP32 | Affine/AES | 0.4490 | 8.7221 |
| CPU | FP32 | Dedicated | 0.3570 | 6.8195 |
| MPS | FP16 | Affine/AES | 0.2554 | 1.3286 |
| MPS | FP16 | Dedicated | 0.2549 | 0.8478 |
| MPS | FP32 | Affine/AES | 0.3878 | 1.7304 |
| MPS | FP32 | Dedicated | 0.2839 | 0.9682 |

Means of 20 workloads. The isolated layer substitutes each of 4096 bytes once; full SM4 performs 32 rounds, so the columns measure different work. CPU is eager; MPS is compiled.

Table 6 reports the 4096-byte workload. The dedicated circuit improves complete-cipher latency in all listed configurations, but isolated S-box gains depend on the execution format; the MPS FP16 layer times are nearly equal. Native SM4 through cryptography/OpenSSL averages 0.02171 ms for this workload. The separate native S-box reference is a standalone C lookup helper compiled with `cc -O3`, not an exported OpenSSL S-box interface.

All 256 substitutions, known-answer vectors, random complete encryptions, repeated executions, and the recorded batch partitions pass the bit and byte checks. This supports replacing a reused component with a suitable cipher-specific circuit on this platform. It does not establish that the dedicated circuit is best on every backend.

### B Integer arithmetic

ChaCha20 and MD5 add modular word arithmetic. Prime-field curves additionally need multiword operations and reduction. A single FP32 scalar cannot represent all unsigned 32-bit integers exactly. Bit vectors, or bounded limbs with explicit carry handling, avoid relying on such a scalar representation.

For least-significant-bit-first operands and c 0 \= 0 c_0=0, a full adder is

p i \= a i ⊕︎ b i,s i \= p i ⊕︎ c i,c i + 1 \= (a i ∧ b i) ∨ (p i ∧ c i).(25)

Discarding the final carry computes addition modulo 2 w 2^w; retaining it gives a (w + 1) (w+1) -bit sum. AND, XOR, and NOT are available from (13), and OR follows by De Morgan’s law. Ripple carry has depth O (w) O(w). Parallel-prefix carry reduces depth at the cost of additional nodes and wiring; we have not compared their neural execution costs.

Multiplication follows from partial products and adders:

a b \= ∑ j \= 0 w − 1 2 j ∑ i \= 0 w − 1 2 i (a i ∧ b j).(26)

This notation describes significance and addition of bit vectors with enough output bits. It does not require storing a large integer sum in one floating-point value. Comparison can use subtraction borrow or a most-significant-bit prefix. Conditional choice is also a Boolean operation:

sel ⁡ (c,u,v) \= (c ∧ u) ∨ (¬ c ∧ v),sel ⁡ (1,u,v) \= u.(27)

Selection acts componentwise on word or point encodings.

For a,b < p a,b<p, compute t \= a + b t=a+b with the extra carry bit. A modular adder then uses

a + p b \= sel ⁡ (\[t ≥ p\],t − p,t).(28)

Comparison, subtraction, and selection are bit-vector subcircuits. Since t < 2 p t<2p, one conditional subtraction suffices. Dropping the extra bit before comparison would be incorrect.

A simple modular multiplier maintains reduced states. Starting with r 0 \= 0 r_0=0 and q 0 \= b q_0=b, use the bits a j a_j of a a:

r j + 1 \= r j + p sel ⁡ (a j,q j,0),q j + 1 \= q j + p q j,0 ≤ j < w.(29)

The invariant r j,q j < p r_j,q_j<p preserves the modular-adder precondition, and r w \= a b m o d p r_w=ab\\bmod p. For a public exponent e \= ∑ e j 2 j e=\\sum e_j2^j, a fixed sequence of modular multiplications gives

r 0 \= 1,q 0 \= a,r j + 1 \= { r j q j mod p,e j \= 1,r j,e j \= 0,q j + 1 \= q j 2 mod p.(30)

Public exponent bits determine wiring during construction. Secret exponent inputs instead require selection between candidate results. These are finite arithmetic constructions, not proposals to train an exhaustive table over the large operand domain.

### C ChaCha20

ChaCha20 uses sixteen 32-bit words. Its quarter round combines modular addition, XOR, and rotations \[14\]:

a ← a + b,d ← ROL 16 ⁡ (d ⊕︎ a),c ← c + d,b ← ROL 12 ⁡ (b ⊕︎ c),a ← a + b,d ← ROL 8 ⁡ (d ⊕︎ a),c ← c + d,b ← ROL 7 ⁡ (b ⊕︎ c).(31)

All additions are modulo 2 32 2^{32}. Ten column/diagonal double rounds are followed by wordwise addition of the initial state, little-endian serialization, and XOR with the message to produce the stream-cipher output. The main new unit beyond AES is carry-aware word addition; rotations and Boolean operations are already available.

A complete interface must specify the key, nonce, counter, and message length, rather than treat a fixed-nonce example as a complete deployment. We give a construction route for ChaCha20, but no implementation or measurements.

### D MD5

MD5 pads its message, appends the length, and processes 512-bit blocks as sixteen little-endian words through 64 compression steps \[15\]. Its four word functions are

F (B,C,D) \= (B ∧ C) ∨ (¬ B ∧ D),G (B,C,D) \= (B ∧ D) ∨ (C ∧ ¬ D),H (B,C,D) \= B ⊕︎ C ⊕︎ D,I (B,C,D) \= C ⊕︎ (B ∨ ¬ D).(32)

With the function f f selected by the step, public constant T j T_j, rotation s j s_j, and message index g j g_j, an update is

(A,B,C,D) ← (D,  B + ROL s j ⁡ (A + f (B,C,D) + M \[g j\] + T j),  B,  C).(33)

Additions are modulo 2 32 2^{32}, and the final working state is added to the incoming chaining value. The same gates and modular adders therefore cover compression. A complete hash also needs padding, length handling, and chaining across blocks. We do not implement it here. MD5’s collision resistance is unsuitable for modern collision-resistant applications \[17\]; it serves only as an example of the required computation.

### E Prime-field elliptic curves

For a prime p \> 3 p>3, consider a nonsingular short Weierstrass curve \[16\]:

E (𝔽 p):  y 2 \= x 3 + a x + b (mod p),4 a 3 + 27 b 2 ≢ 0 (mod p).(34)

Field elements use ⌈ log ⁡ 2 p ⌉ \\lceil\\log_2p\\rceil bits, with additional width retained as required by intermediate computations; an additional flag represents the point at infinity O \\mathcal O. Curve parameters are public. The intended input domain must specify valid points and scalars, and include point and subgroup validation if required by the target algorithm.

For P \= (x 1,y 1) P=(x_1,y_1) and Q \= (x 2,y 2) Q=(x_2,y_2) with x 1 ≠ x 2 x_1\\ne x_2, affine addition is

λ \= (y 2 − y 1) (x 2 − x 1) − 1,x 3 \= λ 2 − x 1 − x 2,y 3 \= λ (x 1 − x 3) − y 1 (mod p).(35)

For doubling with y 1 ≠ 0 y_1\\ne0,

λ \= (3 x 1 2 + a) (2 y 1) − 1,x 3 \= λ 2 − 2 x 1,y 3 \= λ (x 1 − x 3) − y 1 (mod p).(36)

Thus ECC adds multiword modular addition, subtraction, multiplication, inversion, and exceptional-case selection.

For a fixed prime, inversion has the finite construction

a − 1 \= a p − 2 (mod p),a ∈ 𝔽 p ∖ { 0 }.(37)

Fixing the public exponent in (30) produces a fixed modular-arithmetic network. At zero, exponentiation still has a value, but that value is not an inverse. Flags and selection must handle the exceptional cases:

P + 𝒪 \= P,𝒪 + Q \= Q,P + (− P) \= 𝒪,\[2\] (x,0) \= 𝒪.(38)

Ordinary-addition and doubling candidates can be computed and selected by valid bit conditions, using a defined dummy result for a zero denominator. Complete formulas for a chosen curve provide another route. Projective coordinates reduce intermediate inversions, but still require a specified infinity representation and final coordinate conversion.

Extended Euclid is an alternative inversion method. Starting from (r 0,r 1) \= (p,a) (r_0,r_1)=(p,a) and (t 0,t 1) \= (0,1) (t_0,t_1)=(0,1), it repeats

q \= ⌊ r 0 / r 1 ⌋,(r 0,r 1) ← (r 1,r 0 − q r 1),(t 0,t 1) ← (t 1,t 0 − q t 1).(39)

At termination with r 0 \= 1 r_0=1, t 0 a ≡ 1 (m o d p) t_0a\\equiv1\\pmod p. Division, signed coefficients, and a variable iteration count require additional treatment before this loop becomes a fixed graph. A bound on unrolling and preservation of the terminal state would need proof. Fixed-exponent inversion gives the more direct existence construction here.

Finally, scan the scalar bits k m − 1,…,k 0 k\_{m-1},\\ldots,k_0 from high to low:

R m \= 𝒪,D i \= \[2\] R i + 1,R i \= sel ⁡ (k i,D i + P,D i),i \= m − 1,…,0.(40)

Selection covers both coordinates and the infinity flag; the result is R 0 \= \[k\] P R_0=\[k\]P. Correct arithmetic units, complete exceptional-case logic, and preserved encodings suffice for functional equivalence. This argument establishes neither side-channel resistance nor competitive performance. ECC, ChaCha20, and MD5 remain constructions in this paper, distinct from the implemented AES and SM4 results.

## VII Security

Publishing a generator and publishing a key-dependent instance disclose different objects. For a public generator G e n \\mathsf{Gen}, key K K, and construction randomness r r, write

N K,r \= 𝖦 𝖾 𝗇 (K;r).(41)

Knowing the generator or constructing instances for chosen keys does not disclose the parameters of the target instance. Ordinary AES source accepts a key as input; a fixed-key model is itself a key-dependent artifact. Once a model is delivered to a client, local reading must also be considered.

We separate legal-byte queries, arbitrary tensor queries, artifact reading, local execution, and faults, and assess key recovery and functional copying separately. File parsing and algebra on constants are static analysis. Evaluating a target or extracted subnetwork at chosen inputs requires execution capability. Construction keys and validation challenges are reserved for post-attack checks.

### A Black-box interfaces

Suppose the interface accepts only legal byte strings, performs encoding and deterministic decoding internally, and returns only IV and ciphertext. The required equality is

𝒪 N (P,V) \= CBC ⁡ \[N K,r\] (P,V) \= CBC ⁡ \[AES K ⁡\] (P,V) \= 𝒪 AES (P,V).(42)

Under the same key distribution, IV rules, and query restrictions, forwarding each query to ordinary AES-CBC produces the same answer. This remains true for adaptive interaction. The claim is conditional interface equivalence, not security stronger than AES. A public generator supplies no additional target parameters through these answers. Equality is required on every legal input; timing, error details, and other state leakage are outside this argument and were not evaluated. CBC still requires its prescribed IV conditions \[13\].

Allowing arbitrary floating-point vectors exposes behavior outside the binary domain. Checking shape, FP32 format, and device does not check membership in { 0,1 } n \\{0,1\\}^n. DNC treats this query surface and gives input/output protection in an exact-real model \[1\]. Later work reports a floating-point bypass that recovers the first round key in 128 chosen queries and proposes clamping before rounding \[8,9\]. These are literature results, not independently reproduced experiments in this study.

A tensor interface therefore needs an explicit policy for nonbinary, out-of-range, and nonfinite inputs, checked along its actual numerical path. Query protection alone does not establish key hiding when parameters become readable.

### B Readable models

Static analysis reads the graph, weights, biases, and serialized state. We examine explicit key state, fused encodings, white-box compilation, and parameter obfuscation.

The seven main configurations store eleven round keys; AES-128 round key zero is the master key. Binary values b j,i b\_{j,i} or bipolar values σ j,i \\sigma\_{j,i} decode as

k j \= ∑ i \= 0 7 2 7 − i b j,i,b j,i \= 1 − σ j,i 2,0 ≤ j < 16.(43)

The same 20 keys across seven configurations form 140 targets. Both state encodings are checked for each target, giving 280 successful static recoveries. Median extraction time is 0.0596 ms, with 0.3897 ms for separately measured deserialization. Recovery makes no model queries. Absorbing a key into the affine coefficients of (7) does not hide it either.

The inspected DNC code at commit `b2c230fc` also retains `buff_round_keys`; `protected=True` wraps the same core \[7\]. Reading its complete state therefore still exposes the master key. This conclusion follows from source inspection.

To remove explicit round-key buffers, we first fuse key operations with SubBytes, MixColumns, or their fragments and add local encodings. We then add invertible 32-bit linear mixing at each column-contribution output. Neither deployment separately stores round keys, encoding seeds, or decoding matrices. A visible first-round function in the local-encoding version satisfies

L i (x) \= β i (hi 4 ⁡ (S (x ⊕︎ k i) ⊕︎ c i)),L i (x) \= L i (y) ⟺ hi 4 ⁡ S (x ⊕︎ k i) \= hi 4 ⁡ S (y ⊕︎ k i).(44)

Here β i \\beta_i is an unknown bijection and c i c_i a round-key share. Constant XOR and output relabeling preserve collision classes. The public S-box produces distinct partitions for the 256 candidate key bytes, allowing bytewise matching. Corner-network coefficients reveal the finite function statically, without model execution.

The 32-bit mixing preserves the cipher through commutation of linear maps and XOR. Although it defeats the original partition template, the visible fragment remains an S-box under an unknown linear projection. For candidate key byte t t,

G i (x) \= β i (A i S (x ⊕︎ k i) ⊕︎ a i),A i ∈ 𝔽 2 4 × 8,𝒟 i,t \= span 𝔽 2 ⁡ { S (x ⊕︎ t) ⊕︎ S (y ⊕︎ t):G i (x) \= G i (y) },dim ⁡ 𝒟 i,k i \= 8 − r i,r i \= log 2 ⁡ | im ⁡ G i |.(45)

For the correct key, each collision class is a coset of the linear kernel. Enumerating candidates and checking binary rank bypasses the unknown mixing matrix. Both versions yield the master key in all 20 paired workloads, with uniqueness checked for every candidate. Each version also passes 240 complete CPU/MPS encryption comparisons. Mixing increases persistent tensor storage by 86.22%; paired encryption-time ratios at 32 × 16 32\\times16 are 1.812 on CPU and 1.750 on MPS, without corresponding key-hiding evidence.

We next compile the full Chow construction from OpenWhiteBox at commit `b7fcb3c27b63` \[19,20\]. The compiler C C reads only serialized deployment tables W K W_K, without construction keys, seeds, or encoding matrices, and requires

N K \= C (W K),N K (enc ⁡ (P)) \= enc ⁡ (W K (P)) \= enc ⁡ (AES K ⁡ (P)).(46)

Corner networks represent finite functions of sizes 8 → 4 8\\to4, 8 → 32 8\\to32, and 8 → 128 8\\to128, preserving mixing, inverse mixing, encoded XOR, and inter-round connections. No new activation or custom cipher operator is needed. The model contains 3008 finite functions grouped into 104 modules, each function with a 256-element input domain. Encoded XOR must retain the interface

X ^ β,γ,δ (u,v) \= δ (β − 1 (u) ⊕︎ γ − 1 (v)),(47)

Ordinary XOR on encoded labels would be incorrect. Small integer detectors, single active terms, and binary outputs meet the composition and FP32 conditions of Section III. We use identity external input/output encodings to expose standard AES-CBC; the results do not cover deployment that relies on private external encodings.

Compilation preserves an invertible parameter structure: identifying input rows and packing output coefficients gives D (C (W K)) \= W K D(C(W_K))=W_K. All 20 targets yield exactly the original 770048-byte table artifact through static analysis. Original white-box analyses can then be applied; when they require local execution, the recovery workflow includes those steps.

We also transform all 104 modules through hidden-unit permutation, positive scaling, unit splitting, and output affine factorization, retaining module boundaries. For permutation matrix P P and positive diagonal D D, ReLU homogeneity gives

W ′ \= P D W,b ′ \= P D b,V ′ \= V D − 1 P − 1,V ′ ρ (W ′ x + b ′) \= V ρ (W x + b).(48)

Each detector h a \= ρ (w a x + b a) h_a=\\rho(w_ax+b_a) with output row v a v_a is split into two positively scaled units with canceling output shares. Writing B \= R − 1 B=R^{-1},

h ~ a,j \= s a,j h a,u a,j \= s a,j − 1 (1 2 v a R + (− 1) j z a),j ∈ { 0,1 },(s a,0 u a,0 + s a,1 u a,1) B \= v a.(49)

Output translations are canceled by corresponding biases; general matrix changes occur only in affine layers after ReLU. Powers-of-two scales and bounded integer matrices keep the relevant legal-input accumulations below 2 14 2^{14} in magnitude and binary denominators at most 8, retaining exactness on the evaluated FP32 path.

The original reader fails on the changed structure. An adapted static analysis normalizes detector directions, merges duplicate units, and folds the output factors using (49). It processes constants only, without target execution, construction seeds, or the original tables. All 20 obfuscated targets yield the original Chow tables. These local transformations are therefore algebraically removable in the tested construction.

### C Execution and faults

After reconstructing the Chow tables, we run OpenWhiteBox’s existing SAS recovery program locally, supplying chosen inputs to the extracted second- and third-round functions \[20\]. The master key is recovered for all 20 original and all 20 obfuscated networks.

**Table 7 Model exposure experiments**

| Model | Static analysis | Offline execution-assisted results |
| --- | --- | --- |
| Seven main configurations | 280 recoveries: 140 targets, two decodings each | All 140 functional-copy targets pass |
| Local encoding | 20 / 20 master keys | 20 / 20 functional copies |
| 32-bit mixing | 20 / 20 master keys | 20 / 20 functional copies |
| Chow network | 20 / 20 original table artifacts | 20 / 20 master keys |
| Obfuscated Chow | 20 / 20 original table artifacts | 20 / 20 master keys |

Counts refer to the targets in each experiment. Local-encoding copying comes from an earlier run; the Chow rows use the 20-workload paired study. Static programs receive only the target artifact and public structure; an evaluator subsequently checks keys and fresh messages. Both versions in the obfuscation study pass 240 complete CPU/MPS encryption comparisons each. All 61,603,840 component-input checks pass, covering each component’s complete input domain.

**Table 8 Cost of Chow obfuscation**

| Metric | Chow network | Obfuscated network |
| --- | ---: | ---: |
| Median static reconstruction / ms | 31.874 | 80.831 |
| Median local-execution recovery / ms | 2114.532 | 2075.023 |
| Persistent tensor bytes | 24,650,912 | 51,419,680 |
| Mean CPU encryption / ms | 285.592 | 598.271 |
| Mean MPS encryption / ms | 103.609 | 176.710 |

Encryption uses 32 messages of 16 blocks, FP32 eager execution, and includes byte conversion, transfers, and binary checks. Each measurement uses two warmups and three timed repeats; CPU uses four threads and MPS synchronizes at timing boundaries. Static reconstruction has a paired median time ratio of 2.540 with interval \[2.461,2.614\] \[2.461,2.614\]. Persistent tensor storage grows by 2.086, while paired encryption-time ratios are 2.053 on CPU and 1.548 on MPS. Identical reconstructed tables mean that the small difference in local recovery time does not indicate changed attack complexity. Total wall time including process startup also shows no stable increase. Reported attack runtime excludes human analysis and development.

A separate Chow compilation experiment compares the original Go white-box implementation with the network. Both yield keys in all 20 trials, with median local recovery times of 2.037 s and 2.144 s. At the same 32 × 16 32\\times16 workload, mean encryption times are 7.574 ms for Go and 114.138 ms for MPS, with a median paired time ratio of 13.76. Slower network inference does not stop an adversary from reconstructing tables and using the original implementation.

Functional copying does not require key recovery. All 140 main-configuration targets, and all 20 local-encoding and 20 mixing targets, correctly process fresh messages after their state is loaded in independent processes. Chow and obfuscated targets also support execution through reconstructed tables. The tested implementations therefore establish no restriction on reuse in a compatible environment.

Differential fault analysis additionally requires faults that satisfy a specified model and access to normal and faulty outputs \[21\]. In an encoded network, modifying one neuron need not correspond to a single-byte fault in the logical AES state. We have not verified that mapping or performed DFA injection and recovery. DFA is included only as a conditional risk supported by prior work.

## VIII Conclusion

The Boolean interpretation of corner expansion connects exact neural AES to shared logic and existing compact circuits. Interpolants and learned small-domain components provide further choices, each with its own finite-precision and decoding requirements. State encoding remains an independent design dimension.

The main empirical finding is that local S-box simplification does not determine complete-cipher gains. For 32 messages of 16 blocks on compiled MPS, changing only the S-box encoding gives a median paired ratio of 1.000 with interval \[0.980,1.028\] \[0.980,1.028\] relative to the binary circuit. Keeping the entire state bipolar instead gives 1.48 with interval \[1.44,1.53\] \[1.44,1.53\], while also changing MixColumns and conversion boundaries. A separate 20-workload comparison with the authors’ original T-table implementation gives speedups of 2.78 for the binary circuit and 4.08 for the fully bipolar state on MPS; the binary circuit is slower on CPU. Rankings also vary with workload, and all tested neural configurations remain slower than native AES.

SM4 supplies a second implemented circuit-substitution case. ChaCha20, MD5, and ECC identify the additional word arithmetic, multiword modular operations, and exceptional-case selection required beyond AES. Legal-byte interface equivalence does not cover arbitrary tensors or readable parameters. The tested encoding, Chow compilation, and obfuscation add no established key hiding. Obfuscation raises median static table-reconstruction time from 31.87 ms to 80.83 ms, yet adapted analysis reconstructs all 20 targets and local execution recovers their keys. Increased representation complexity and runtime cost are insufficient evidence of improved security.

## References

\[1\] D. Gérault, A. Hambitzer, E. Ronen, and A. Shamir. Deep Neural Cryptography. EUROCRYPT, 2026. [Cryptology ePrint Archive, 2025/288](https://eprint.iacr.org/2025/288).

\[2\] X. Jin, S. Ma, and Z. Lin. Repurposing Neural Networks for Efficient Cryptographic Computation. NDSS Symposium, 2025. [doi:10.14722/ndss.2025.240955](https://doi.org/10.14722/ndss.2025.240955).

\[3\] J. Boyar and R. Peralta. A depth-16 circuit for the AES S-box. [Cryptology ePrint Archive, 2011/332](https://eprint.iacr.org/2011/332).

\[4\] T. Pornin. BearSSL: bitsliced AES implementation, `src/symcipher/aes_ct.c`. [Author source](https://bearssl.org/gitweb/?p=BearSSL;a=blob;f=src/symcipher/aes_ct.c;hb=HEAD).

\[5\] N. Shi, L. Xu, T. Zhu, et al. Exact constrained-training neural networks for confidential 8-bit arithmetic primitives in code obfuscation. Journal of Systems Architecture, 173:103729, 2026. [doi:10.1016/j.sysarc.2026.103729](https://doi.org/10.1016/j.sysarc.2026.103729).

\[6\] NIST. Advanced Encryption Standard (AES). FIPS 197, updated 2023. [doi:10.6028/NIST.FIPS.197-upd1](https://doi.org/10.6028/NIST.FIPS.197-upd1).

\[7\] D. Gérault et al. Deep Neural Cryptography: companion implementation. [Commit `b2c230fc`](https://github.com/DavidGerault/deep_neural_cryptography/tree/b2c230fc4d1ebe224a29e3c06e9e914e8dc2faf6), 2026.

\[8\] S. Kim, M. Lee, and D. Lee. Second Round Key Recovery and a Floating-Point Attack on DNN-based AES Implementations. [Cryptology ePrint Archive, 2026/1919](https://eprint.iacr.org/2026/1919), revised September 2026.

\[9\] S. Kim, M. Lee, and D. Lee. Breaking Deep Neural Cryptography: artifacts. [Author implementation](https://github.com/cqc-lab/breaking-deep-neural-cryptography), 2026.

\[10\] R. Tse and W. Wong. The SM4 Blockcipher Algorithm and Its Modes of Operations. [Internet-Draft, draft-ribose-cfrg-sm4-10](https://datatracker.ietf.org/doc/html/draft-ribose-cfrg-sm4-10), 2018. Expired draft, not an RFC.

\[11\] M.-J. O. Saarinen. A Lightweight ISA Extension for AES and SM4. [arXiv:2002.07041](https://arxiv.org/abs/2002.07041), 2020.

\[12\] M.-J. O. Saarinen. `lwaes_isa`: AES and SM4 S-box circuits. [`hdl/sboxes.v`, commit `75277ed8`](https://github.com/mjosaarinen/lwaes_isa/blob/75277ed816e7b11fd6f4f4df62ba44993fb1f94f/hdl/sboxes.v), 2020.

\[13\] M. Dworkin. Recommendation for Block Cipher Modes of Operation: Methods and Techniques. NIST SP 800-38A, 2001. [doi:10.6028/NIST.SP.800-38A](https://doi.org/10.6028/NIST.SP.800-38A).

\[14\] Y. Nir and A. Langley. ChaCha20 and Poly1305 for IETF Protocols. RFC 8439, 2018. [RFC Editor](https://www.rfc-editor.org/rfc/rfc8439).

\[15\] R. Rivest. The MD5 Message-Digest Algorithm. RFC 1321, 1992. [RFC Editor](https://www.rfc-editor.org/rfc/rfc1321).

\[16\] D. McGrew, K. Igoe, and M. Salter. Fundamental Elliptic Curve Cryptography Algorithms. RFC 6090, 2011. [RFC Editor](https://www.rfc-editor.org/rfc/rfc6090).

\[17\] S. Turner and L. Chen. Updated Security Considerations for the MD5 Message-Digest and the HMAC-MD5 Algorithms. RFC 6151, 2011. [RFC Editor](https://www.rfc-editor.org/rfc/rfc6151).

\[18\] R. E. Bryant. Graph-Based Algorithms for Boolean Function Manipulation. IEEE Transactions on Computers, C-35(8):677-691, 1986. [doi:10.1109/TC.1986.1676819](https://doi.org/10.1109/TC.1986.1676819).

\[19\] J. A. Muir. A Tutorial on White-box AES. [Cryptology ePrint Archive, 2013/104](https://eprint.iacr.org/2013/104), 2013.

\[20\] OpenWhiteBox. AES: Chow construction and companion cryptanalysis. [Commit `b7fcb3c27b63`](https://github.com/OpenWhiteBox/AES/tree/b7fcb3c27b6322aa3496d91f7f70c7de1e220478), 2016.

\[21\] Y. Li, S. Gomisawa, K. Sakiyama, and K. Ohta. An Information Theoretic Perspective on the Differential Fault Analysis against AES. [Cryptology ePrint Archive, 2010/032](https://eprint.iacr.org/2010/032), revised July 2010.

[](#)

Twikoo 评论管理

密码
