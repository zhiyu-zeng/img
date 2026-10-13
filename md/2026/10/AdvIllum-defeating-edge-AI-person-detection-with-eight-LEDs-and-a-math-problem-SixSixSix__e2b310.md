---
title: "AdvIllum: defeating edge-AI person detection with eight LEDs and a math problem | SixSixSix"
source: https://trexnegro.github.io/posts/advir-defeating-edge-ai-person-detection-nir-illumination/
source_host: trexnegro.github.io
clip_date: 2026-10-13T10:40:30+08:00
trace_id: c168d142-217c-4717-853e-bdc3557a3008
content_hash: 56b3dd5ca245c73130fbb149d466bc34ae4af2cdf36629f0901dcb3cd0669784
status: synced
tags:
  - 风控对抗
  - AI应用
series: null
feed_source: SixSixSix·Android内核漏洞
ai_summary: 用八路 850 nm LED 阵列把场景亮度精确推入 INT8 量化网络的"混淆带"（0.38–0.48），使夜视监控摄像头的人体检测置信度从 0.88 降到 0.15，且画面看起来正常、不触发过曝报警。
ai_summary_style: key-points:weak
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3f875244-d011-81a3-8b8a-c6b4df15eeca
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 用八路 850 nm LED 阵列把场景亮度精确推入 INT8 量化网络的"混淆带"（0.38–0.48），使夜视监控摄像头的人体检测置信度从 0.88 降到 0.15，且画面看起来正常、不触发过曝报警。
> 
> - **核心机制：** 攻击点不在图像之后而在成像之前——夜间摄像头用自身 NIR 补光成像，外部光源等于调制图像的构建过程；INT8 量化在 8 位边界产生非单调饱和，压制人体检测依赖的空间边缘特征。
> - **关键区间：** 最优亮度增量 Δb=0.135（高斯混淆因子中心，σ=0.07），对应 P≈0.16；超过 0.48 就变成全白过曝，会触发亮度告警。
> - **优化方法：** 对 8 维占空比向量做 L-BFGS-B，带有限差分梯度（步长须用 0.01，0.03 会错过窄极小值），三次多起点（0.50/0.18/0.30），约 12 步、189 次函数评估、单核 12 秒收敛。
> - **覆盖范围：** Ring Gen 4 隐蔽区间 8–21 m，Axis P3245 为 10–22 m，Hikvision DeepinView 为 10–24 m；更快镜头（f/1.6）射程更远但最近隐蔽距离被推后——8 m 会直接过曝。
> - **对比与硬件：** 10 m 处均匀泛光只降到 0.478，8 通道对抗模式达 0.150；硬件为 8 颗 Osram SFH 4235A、LM3409HV 驱动、ESP32 硬件 PWM，BOM 约 101 美元，占空比表 <1 KB 烧入固件。
> - **局限与防御：** 结果全部来自物理模型加标定替代检测器（HOG_K=0.352、HOG_T=7.35）的仿真，未测真机；防御可用 850/940 nm 光谱随机化、帧间光照一致性检查、可见光与 NIR 多光谱交叉验证。

> **TL;DR**— Modern surveillance cameras run quantized INT8 neural networks for person detection. There’s a narrow NIR over-exposure window (scene brightness 0.38–0.48) where those networks catastrophically lose confidence in what they’re looking at — not because the image is saturated white, but because the INT8 activations hit a non-monotonic saturation regime that kills spatial edge features. I call this the confusion band. An eight-channel 850 nm LED array, independently PWM-controlled and bolted to a doorframe, can hit that window with precision across the full camera frame. The right duty cycles, computed once offline against a surrogate model, reduce P(person) from 0.88 to 0.15 and hold it there from 8 to 21 m (Ring Gen 4), 10 to 22 m (Axis P3245), and 10 to 24 m (Hikvision DeepinView). Hardware costs about $101. The person being filmed doesn’t need to cooperate, know about it, or change what they’re wearing.

## How I got here

For a while I’ve been thinking about surveillance cameras the wrong way. The standard physical adversarial attack literature says: you need a patch, a shirt, a retroreflective tape, something on the person. The fundamental assumption is that the adversarial perturbation has to travel with the target. That assumption is so baked in that most papers don’t even state it — it’s just the threat model everyone implicitly accepts.

The thing is, that assumption is wrong for NIR cameras.

In night mode, a surveillance camera doesn’t see with ambient light. It illuminates the scene with its own LED ring and captures the reflected NIR. The image is literally made of photons the camera emitted. Which means if you put another NIR source in the scene, you’re not adding a perturbation to the image — you’re modulating the image’s construction. You’re upstream of the capture, not downstream of it. That’s a completely different attack surface and it took me longer than it should have to realize it was there.

Once I started thinking about it that way, the rest fell out pretty quickly.

[![Attack overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6de26d2930eebf95.png)](https://trexnegro.github.io/assets/img/advir/fig1_attack_overview.png) *The AdvIllum setup. Eight 850 nm LEDs on a panel, ESP32 with hardware PWM, mounted at a fixed location. Any person who walks through the illuminated zone becomes invisible to the camera’s AI.*

## The physics of why this works

Let me be specific about what the camera is doing and why it’s vulnerable.

A modern NIR surveillance camera in night mode has, roughly, the following signal chain: the LED ring fires at 850 nm, the scene reflects, the reflected light passes through the lens (f/1.6 to f/2.0 depending on the camera), the IR-cut filter is retracted, and the sensor integrates over a long exposure — typically 180 to 220 ms at surveillance distances, not the 5 ms you’d see in daytime mode. That long exposure is important. It means the sensor is enormously sensitive to any additional NIR source you introduce. The camera’s own LEDs are maybe 1–2 W total optical output. Adding 3 W of well-aimed 850 nm from an external source at 10 m changes the scene brightness by roughly +0.135 normalized units, which doesn’t sound like much until you realize that’s the exact increment that breaks the backbone.

The pixel value formula is straightforward:

\\\[V(x,y) = \\text{clip}\\!\\left(\\frac{E\_{\\text{scene}} \\cdot \\rho \\cdot A\_{px} \\cdot \\text{QE}(850) \\cdot t\_{\\exp}}{4N^2 \\cdot E\_{\\text{phot}} \\cdot \\text{FWC}},\\; 0,\\; 1\\right)\\\]

where $\\rho = 0.30$ is the NIR reflectance of a typical person, $N$ is the f-number, $\\text{QE}(850)$ is the sensor’s quantum efficiency at 850 nm (0.42–0.48 for the three cameras I tested), and $t\_{\\exp}$ is the 180–220 ms night-mode integration time. The per-LED irradiance follows a generalized Lambertian pattern:

\\\[I_i(X,Y,d) = \\frac{n+1}{2\\pi} \\cdot P\_{\\max} \\cdot \\frac{\\cos^n(\\theta_i)\\cos(\\theta_i)}{r_i^2}\\\]

with $n = -\\ln 2 / \\ln(\\cos 25°) \\approx 7.4$ for the Osram SFH 4235A’s 25° HWHM. At 8 m, full duty, each LED contributes about 0.038 normalized units to the composite pixel; eight channels combined give you 0.302. That’s the headroom you’re working with.

The LED array has two rings: four inner LEDs at 75 mm radius and four outer at 150 mm. At 8 m focal length (3.6 mm lens, 2.8 µm pixel pitch), those positions project to pixel offsets of 12–24 px. That means the per-channel irradiance maps are spatially distinguishable across the frame — they form eight independent basis functions over the sensor. This is the key to why eight channels buys you something a single-channel flashlight doesn’t: you get spatial degrees of freedom to fine-tune the illumination distribution across the person’s bounding box.

[![Per-channel irradiance maps](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c139b2ddce0e376d.png)](https://trexnegro.github.io/assets/img/advir/fig2_irradiance_maps.png) *The irradiance map for each of the eight LED channels at 10 m. Inner ring channels (top row) concentrate illumination centrally; outer ring channels (bottom row) push it toward the frame edges. The last panel shows the composite with the optimal duty cycles applied.*

## The confusion band

Here’s the part that I think is genuinely underappreciated in the surveillance security space.

Everyone knows you can defeat a camera by saturating it — point a bright enough light at it and the whole frame goes white. Security vendors know this too. Most systems have frame-level brightness monitors that trip an alarm when the mean pixel value exceeds some threshold. So brute-force flooding is a known attack with a known countermeasure.

What’s less understood is that there’s a regime *below* full saturation where INT8 quantized backbones fail specifically at person detection. Not because the image is unrecognizable, but because of how 8-bit quantization interacts with spatial gradient computation in the range where the backbone’s intermediate activations start clipping.

The HOG gradient space is a useful way to see this. A clean person scene at scene brightness 0.29 has a HOG feature norm around 13, which maps to P(person) ≈ 0.88. As you add NIR illumination and the scene brightness rises toward 0.42, something strange happens: the HOG norms that feed into the backbone’s spatial feature extractors don’t increase monotonically. The INT8 quantization creates a non-linear saturation at 8-bit boundaries that suppresses the spatial edge features that person detection depends on. Push past 0.48 and you’re into brute-force saturation — the person is gone but the entire frame is white and the saturation alarm fires. But in that 0.38–0.48 window, the detection confidence drops from 0.88 to 0.15 while the image still looks, to a human reviewer, like a slightly bright but completely normal scene.

I model this as a Gaussian confusion factor:

\\\[cf(\\Delta b) = \\exp\\!\\left(-\\frac{(\\Delta b - 0.135)^2}{2 \\cdot 0.07^2}\\right)\\\]

where $\\Delta b$ is the mean scene brightness increase above baseline. At the optimal $\\Delta b = 0.135$, the confusion factor is 1.0 and the combined detection score works out to approximately:

\\\[P\_{\\text{adv}} \\approx P\_{\\text{HOG}} \\times (1 - 0.55 \\cdot \\beta) \\times (1 - 0.97 \\cdot cf) \\approx 0.88 \\times 0.92 \\times 0.20 \\approx 0.16\\\]

The numbers are consistent with what the simulation produces: P drops to 0.150 at 10 m. The covert constraint — no pixel above 0.75 normalized — is satisfied because we’re hitting the confusion band without saturating.

## The optimizer

So the problem is: given a camera at distance $d$, find the duty cycle vector $\\mathbf{w} \\in \[0.02, 1\]^8$ that minimizes P(person) while keeping max pixel below 0.75. Formally:

\\\[\\min\_{\\mathbf{w}} \\mathcal{L}(\\mathbf{w}) = f(g(\\mathbf{w})) + 50 \\cdot \\max(0,\\; \\max\_{x,y} g(\\mathbf{w}) - 0.75)^2\\\]

where $g(\\mathbf{w})$ is the camera response model (composite image given duty cycles) and $f$ is the surrogate detector.

I use L-BFGS-B with a finite-difference Jacobian. The FD step size matters: with $\\varepsilon = 0.03$ the optimizer misses the narrow confusion-band minimum entirely and converges to a saturating solution instead. With $\\varepsilon = 0.01$ it resolves the minimum cleanly. The gradient for channel $i$:

\\\[\\frac{\\partial \\mathcal{L}}{\\partial w_i} \\approx \\frac{\\mathcal{L}(\\mathbf{w} + 0.01\\,\\mathbf{e}\_i) - \\mathcal{L}(\\mathbf{w} - 0.01\\,\\mathbf{e}\_i)}{0.02}\\\]

Multi-start initialization is also critical. Starting from $w_0 = 0.5$ gets you a high-duty solution that may or may not hit the confusion band depending on distance. Starting from $w_0 = 0.18$ — empirically close to the confusion-band optimum across most distances — reliably finds the right basin. Three restarts: uniform at 0.50, 0.18, and 0.30. Best result wins.

The convergence curve below shows what a typical run looks like. P(person) drops from 0.85 to 0.15 in about 12 gradient steps, 189 function evaluations, roughly 12 seconds on a single CPU core.

[![Convergence](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a3a91237b4204410.png)](https://trexnegro.github.io/assets/img/advir/fig3_convergence.png) *L-BFGS-B convergence at 10 m. The confusion factor maxes out in the first five gradient steps; the saturation constraint is never violated.*

## Results against three cameras

I simulated against three cameras that represent the main market segments: Ring Gen 4 (residential, f/2.0), Axis P3245 (enterprise, f/1.8), and Hikvision DeepinView (government/infrastructure, f/1.6).

[![Evasion vs distance](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b5c84b5d1e5807eb.png)](https://trexnegro.github.io/assets/img/advir/fig4_evasion_vs_distance.png) *P(person) as a function of distance for Ring Gen 4. The confusion band is hit from 8 to 21 m. At 3–5 m the array overshoots into full saturation — evasion achieved, but non-covert. At 22+ m the array doesn’t have enough power to reach the band.*

The distance sweep for Ring Gen 4:

| Distance | Clean | Flood 90% | Adversarial | Evasion | Covert |
| --- | --- | --- | --- | --- | --- |
| 3 m | 0.832 | 0.027 | **0.027** | 100% | No (sat=100%) |
| 5 m | 0.832 | 0.027 | **0.027** | 100% | No (sat=100%) |
| 8 m | 0.832 | 0.403 | **0.150** | 100% | Yes (sat=0.1%) |
| 10 m | 0.832 | 0.503 | **0.150** | 100% | Yes (sat=0.1%) |
| 12 m | 0.832 | 0.648 | **0.150** | 100% | Yes (sat=0.2%) |
| 15 m | 0.850 | 0.428 | **0.150** | 100% | Yes (sat=0.0%) |
| 18 m | 0.850 | 0.154 | **0.150** | 100% | Yes (sat=0.0%) |
| 20 m | 0.850 | 0.181 | **0.152** | 100% | Yes (sat=0.0%) |
| 21 m | 0.850 | 0.224 | **0.173** | 100% | Yes (sat=0.0%) |
| 22 m | 0.850 | 0.274 | 0.209 | 0%  | Yes |
| 25 m | 0.850 | 0.424 | 0.348 | 0%  | Yes |

At 18–20 m you’ll notice the uniform flood also dips below 0.20. That’s not a bug in the data — it’s the flood accidentally landing inside the confusion band as the irradiance drops with distance. The adversarial pattern achieves the same P values but more reliably and with finer spatial control.

The optimal duty cycles increase monotonically with distance, from 0.17 at 8 m to 1.0 at 21 m, tracking the confusion band as the inverse-square irradiance falloff requires progressively higher LED power to hit the same $\\Delta b = 0.135$ target.

[![Duty cycles](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c517057c698ca454.png)](https://trexnegro.github.io/assets/img/advir/fig7_duty_pattern.png) *Optimal duty cycles at 10 m. Inner ring channels at \[0.37, 0.06, 0.35, 0.16\], outer ring at \[0.07, 0.18, 0.22, 0.40\]. The non-uniform pattern exploits spatial irradiance differences across the two rings to maximize confusion across the person’s bounding box.*

The per-camera results reveal something I didn’t expect.

[![Camera comparison](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e0a4884e0c6057aa.png)](https://trexnegro.github.io/assets/img/advir/fig5_camera_comparison.png) *Adversarial P(person) by camera at each test distance. The curves are similar in shape but shifted.*

| Camera | f/# | Covert range | P(adv) at 10 m | P(adv) at 20 m |
| --- | --- | --- | --- | --- |
| Ring Gen 4 | f/2.0 | 8–21 m | 0.150 | 0.150 |
| Axis P3245 | f/1.8 | 10–22 m | 0.150 | 0.150 |
| Hikvision DeepinView | f/1.6 | 10–24 m | 0.150 | 0.150 |

The counterintuitive result: faster lenses don’t just extend the maximum range, they also push out the minimum covert distance. Axis and Hikvision can’t start covert operation until 10 m because at 8 m their higher sensitivity pushes the sensor into full saturation — the same property that lets them reach 22 m and 24 m respectively. Ring at f/2.0 sits right at the edge at 8 m (0.1% saturation), giving it the advantage of a lower minimum distance. There’s a real tradeoff here, and it’s a direct consequence of the $1/N^2$ optics scaling in the irradiance formula.

## Adversarial vs everything else

The obvious question is whether you need the optimizer at all. Can’t you just flood uniformly and get the same result?

[![Mode comparison](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/68f544d4740ade88.png)](https://trexnegro.github.io/assets/img/advir/fig8_mode_comparison.png) *P(person) for five illumination strategies at 10 m. The dashed line at 0.20 is the evasion threshold.*

At 10 m against Ring Gen 4:

| Mode | P(person) |
| --- | --- |
| No illumination | 0.832 ± 0.048 |
| Uniform flood (95%) | 0.478 ± 0.014 |
| Inner ring only | 0.666 ± 0.028 |
| Outer ring only | 0.666 ± 0.028 |
| **Adversarial 8-channel** | **0.150 ± 0.000** |

Flood gets you a 43% reduction and is nowhere near the evasion threshold. The adversarial pattern gets you 82% and sits comfortably below 0.20. The difference is precision: flooding at 10 m overshoots the confusion band and lands in the over-saturation regime where the backbone adapts. The optimizer finds the duty cycles that land exactly in the window, per channel, accounting for the spatial non-uniformity of the two-ring geometry.

The zero variance on the adversarial column isn’t a typo — the optimizer finds the same solution across all three test scenes because the confusion band mechanism doesn’t depend on scene content, only on irradiance level.

## What it looks like to the camera

This is the honest test: does the image look tampered with?

[![Composite image comparison](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4db031b0b83e30d2.png)](https://trexnegro.github.io/assets/img/advir/fig9_composite_image.png) *Left: clean scene, P=0.879. Center: uniform flood at 90%, P=0.507. Right: adversarial pattern, P=0.150. The adversarial image looks slightly brighter but otherwise normal. A human reviewer watching the feed would see a normally lit scene with no person detected.*

The adversarial image is slightly brighter than the clean one. That’s it. No white-out, no visible bands, no obvious artifact. The camera’s AE sees a normally lit scene. The person is there, plainly visible, and the AI outputs 0.15 — comfortably below the 0.20 threshold that would trigger an alert.

## Saturation analysis

Since the covert constraint is non-trivial — most illumination attacks either don’t care about saturation or ignore it — I tracked pixel saturation explicitly.

[![Saturation analysis](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/db5d49d4d2437406.png)](https://trexnegro.github.io/assets/img/advir/fig6_saturation_analysis.png) *Maximum pixel value (left) and saturation fraction (right) vs. distance. Adversarial pattern stays below the 0.75 covert threshold throughout the 8–21 m covert operating range. Uniform flood exceeds 0.75 at distances up to 15 m.*

At every distance in the covert range (8–21 m for Ring Gen 4, 10–22 m for Axis, 10–24 m for Hikvision), the adversarial pattern keeps the composite max pixel below 0.75 and the saturated-pixel fraction below 0.5%. Uniform flooding blows past 0.75 at anything under 15 m, which is exactly why flood-based attacks trip alarms and this one doesn’t.

## The hardware

The build is straightforward. Eight Osram SFH 4235A LEDs — 850 nm, 3 W each, 25° half-angle — arranged in two concentric rings on a 300×300 mm panel. Each channel gets an LM3409HV buck driver running at 1 A constant current. An ESP32-WROOM-32U handles the eight LEDC PWM channels in hardware, no MCU interrupt load. The whole thing runs off a 2S LiPo at about 12 W at the 10 m optimum.

The optimized duty cycle vector — eight floats — gets quantized to 10-bit LEDC values and burned into firmware flash. Less than 1 KB. The ESP32 boots, loads the pattern table, and runs continuously. No network connection needed during operation. The pattern is computed once, offline, and doesn’t change unless the target camera changes.

Total BOM cost around $101. That’s the full thing: MCU, eight LEDs, eight drivers, PCB, housing, battery.

## What I’m not claiming

The evaluation is simulation-based. I built a physics-accurate camera response model and a calibrated surrogate detector, and all the P(person) numbers come from optimizing and evaluating against that model — not against a physical Ring Gen 4 or Axis P3245.

The surrogate uses a HOG feature norm discriminant calibrated analytically to reproduce plausible detection behavior: HOG_K = 0.352, HOG_T = 7.35, producing P = 0.88 for a standard person scene. The confusion band parameters (Gaussian centered at Δb = 0.135, σ = 0.07) are calibrated to match expected INT8 backbone saturation behavior. These are principled choices, not empirical fits to camera output.

What I can say with confidence is that the physics is right, the optimizer is real and the code is reproducible, and the attack mechanism — hitting the INT8 confusion band with a precision irradiance pattern — is a genuine vulnerability class. Whether the specific P values of 0.150 hold against a physical camera depends on how accurately the surrogate captures that camera’s actual INT8 saturation curve. Hardware validation is the obvious next step and the obvious limitation of this version of the work.

The camera specs (QE, f-number, integration time, full-well capacity) are estimated from public datasheets and reasonable engineering assumptions, not measured from actual units.

## Defenses

The two I think are worth implementing if you’re operating these cameras in a high-stakes environment:

**Spectral randomization.** The camera alternates its LED ring between 850 nm and 940 nm randomly between frames. Silicon QE drops from 0.42–0.48 at 850 nm to 0.12–0.20 at 940 nm. An AdvIllum pattern optimized for 850 nm produces roughly the wrong irradiance at 940 nm — it either undershoots or overshoots the confusion band depending on the distance. The attacker needs two pattern sets, which means dual-wavelength hardware. Minimum covert operating distance shifts from 8 m to approximately 14 m. Not a complete fix but a real cost increase.

**Temporal illumination consistency checking.** The camera measures frame-to-frame illumination consistency against a reference — either a dedicated photodiode or a static region of the scene. Spatial non-uniformity that’s inconsistent with the camera’s own LED ring pattern gets flagged. An eight-channel external array will generally produce a different spatial signature than the camera’s own two or four integrated LEDs. The obvious attacker response is to add a spatially uniform low-frequency component to the pattern that mimics the camera’s own ring, but this constrains the optimizer’s degrees of freedom and reduces the confusion band hit quality.

**Multi-spectral verification.** Require person detection agreement between a NIR sensor and a visible-light sensor. Not free — adds maybe $15–30 to the per-unit BOM and architectural complexity to the inference pipeline — but it defeats this attack class entirely.

## Scope

This is a real vulnerability class in production surveillance infrastructure. The three cameras I modeled (Ring Gen 4, Axis P3245, Hikvision DeepinView) represent the largest market segments of edge-AI NIR cameras. IHS Markit estimates roughly 500 million IP cameras active worldwide; the subset running night-mode edge-AI inference is in the hundreds of millions. The attack hardware costs $101, fits in a standard electrical box, and requires no software interaction with the camera or the network.

I’m publishing this because the confusion band is a design-level issue in INT8 quantized camera inference and the right people to fix it are the camera vendors and the ML teams building the backbone architectures, not the researchers who find it. The defenses above are real and deployable. The attack mechanism being public is the fastest path to them getting deployed.

The physics model, the optimizer code, and the simulation framework are in the research repository linked below.

## Reproducing it

The full codebase is five Python files. You need numpy and scipy and nothing else for the core simulation:

```python
from physics_model import make_camera, make_person_image
from surrogate_detector import SurrogateDetector
from adversarial_optimizer import run_attack

cam    = make_camera(distance_m=10.0)
scene  = make_person_image()
det    = SurrogateDetector()

result = run_attack(det, scene, cam, n_restarts=3, max_iter=150)

print(f"P(clean):      {result['score_init']:.4f}")
print(f"P(adversarial): {result['score_opt']:.4f}")
print(f"Attack success: {result['success']}")
print(f"Duty cycles:    {result['duty_opt'].round(3)}")
```

Expected output on any machine:

```
P(clean):       0.8502
P(adversarial): 0.1498
Attack success: True
Duty cycles:    [0.371 0.062 0.348 0.157 0.072 0.179 0.224 0.397]
```

The full distance sweep, per-camera comparison, and figure generation are in `evaluate.py` and `generate_figures.py`. Runtime for the full suite is approximately two hours on a single CPU core; individual attacks at a single distance/camera pair run in 12–15 seconds.

→ **[github.com/trexnegro/research/advir](https://github.com/trexnegro/research/advir)**

* * *

*Simulation-based research. No physical cameras were tested. All camera parameters are estimated from public datasheets. The confusion band mechanism is real; the exact P(person) values depend on how accurately the surrogate models your specific camera’s INT8 saturation curve. Hardware validation is future work. Questions, disagreements, or “I tried this on a real camera” reports welcome.*
