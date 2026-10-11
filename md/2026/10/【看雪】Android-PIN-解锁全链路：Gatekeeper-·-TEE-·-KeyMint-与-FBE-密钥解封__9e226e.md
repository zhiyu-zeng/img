---
title: 【看雪】Android PIN 解锁全链路：Gatekeeper · TEE · KeyMint 与 FBE 密钥解封
source: https://bbs.kanxue.com/thread-293176.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-11T22:03:06+08:00
trace_id: a51ea96e-564e-41b1-9c66-40a9ef71db45
content_hash: 078395d409b8c46c2d6d54bb733e1f15994a9e360af6cc5da540910074dff90c
status: synced
tags:
  - 看雪
  - Android逆向
  - 密码学
series: null
feed_source: 看雪·Android安全
ai_summary: Android 的 PIN 从不明文存储也从不"解密后比对"，只在硬件唯一密钥（HUK）参与下留一个不可逆 verifier；真正解密 /data 的 CE 密钥由认证通过后的 AuthToken 另走 KeyMint 链路换得。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f675244-d011-81dc-8abd-ed10eae82f55
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Android 的 PIN 从不明文存储也从不"解密后比对"，只在硬件唯一密钥（HUK）参与下留一个不可逆 verifier；真正解密 /data 的 CE 密钥由认证通过后的 AuthToken 另走 KeyMint 链路换得。
> 
> - **注册不存 PIN：** TEE 只返回 `handle = {version, salt, H}`，其中 `H = KDF(HUK, salt, PIN)`；HUK 熔在 OTP 内、永不出硬件，因此落盘数据无法离线爆破。
> - **校验是 verifier↔verifier：** 用 handle 里的 salt 重算 `H′` 与 `H` 做常数时间比对；且错误计数先 +1 写入 RPMB 再比对，比对前杀进程也绕不过节流。
> - **换密钥另走一条链：** TEE 签发含 KeyMint challenge 的 AuthToken → KeyMint 验签并派生/释放 CE 密钥 → 载入硬件加密引擎解密 /data；此过程与"PIN 是否正确"完全解耦。
> - **存储位置：** verifier 由 REE 保存在 `/data/system_de/<user_id>/spblob/`（`*.pwd` 含 salt+H，`*.spblob` 为加密的 synthetic password）；TEE 的 RPMB 只存错误计数、冷却状态与 `secure_user_id`。
> - **安全边界：** 整套机制只依赖"HUK 保密"，物理侵入 SoC 读出 HUK 即可离线穷举 4–6 位 PIN（仅 10⁴–10⁶ 种）；高价值场景需强口令并叠加 StrongBox/SE 与抗侧信道、故障注入设计。

> **一句话**：你按下的 6 位 PIN，从来没被"存起来"，也从来没被"解密出来比对过"——它只留下一个 **带硬件根密钥的指纹**；真正解密 `/data` 的密钥，是认证通过后由 TEE 的签名凭证 **换** 来的。
> 
> **适合谁读**：想搞清楚"输一次 PIN → 用户数据可访问"中间到底发生了什么的人（系统/安全/驱动/测试都适用）。  
> **怎么读**：先看 §1 的 **图① 总览** 建立地图，再按 §2 → §3 → §4 读 **图② 注册 / 图③ 校验 / 图④ 密钥解封**；§5–§6 讲"东西存在哪"和"防护边界在哪"，§7 是一页速查，§8 是附录。  
> **适用版本**：Android 9+（FBE + synthetic password；14/15 同构）。文中路径/文件名属 AOSP 实现细节，已标注置信度。

* * *

## 0\. 术语速查

| 术语  | 含义  |
| --- | --- |
| **REE** | Rich Execution Environment，普通 Android 系统侧（含内核） |
| **TEE** | Trusted Execution Environment，可信安全世界 |
| **HUK** | Hardware Unique Key，每芯片唯一密钥，熔在 OTP 里、 **不出硬件** |
| **LSKF** | Lock Screen Knowledge Factor，锁屏知识因子（PIN / 图案 / 密码） |
| **verifier / handle** | gatekeeper password handle = `{version, salt, H}` ，其中 `H = KDF(HUK, salt, PIN)` |
| **AuthToken** | TEE 签名的认证凭证，用来向 KeyMint 证明"该用户已通过认证" |
| **SP** | Synthetic Password，随机主密钥；被凭据派生出的密钥加密后存盘 |
| **CE / DE** | Credential Encrypted / Device Encrypted 存储（CE 在解锁后才可访问） |
| **RPMB** | Replay Protected Memory Block，防回滚存储（本项目里放节流状态） |

* * *

## 1\. 舞台与角色

| 组件  | 所在侧 | 职责  |
| --- | --- | --- |
| 锁屏 UI | REE | 收 PIN、显示失败与倒计时 |
| LockSettingsService | REE | 编排校验流程、管理 SP 凭据 |
| gatekeeperd / Gatekeeper HAL | REE | 把 enroll / verify 请求转进 TEE |
| Gatekeeper TA | TEE | **唯一持有比对逻辑**，读写 RPMB 节流状态 |
| KeyMint TA | TEE | 校验 AuthToken，授权派生 / 释放 CE 密钥 |
| RPMB | 硬件  | 错误计数、冷却状态、per-user `secure_user_id` |
| OTP HUK | 硬件  | KDF 的硬件根密钥，只在硬件内部参与运算 |
| 硬件加密引擎 | SoC 片内 | 用 CE 密钥解密 `/data` |

**图① 总览：一次 PIN 解锁走的四段路** （后文 §2–§4 分别展开）

```

  The "iframe" tag is not supported by your browser.
```

* * *

## 2\. 凭据注册（Enroll）：PIN 只留下"指纹"

**核心结论：系统从不保存 PIN**——既不存明文，也不存"能解出 PIN 的密文"。注册时 TEE 只吐出一个 **verifier**：

```python
H = KDF(HUK, salt, PIN)        # salt 随机，HUK 在熔丝里
handle = {version, salt, H}     # 这个 handle 才落盘
```

PIN 通常只有 4–6 位（熵极低），所以 **任何可逆保存的方案都等于泄露 PIN**；把 `HUK` 放进熔丝、只保存不可逆的 `H` ，才能保证"拿到落盘数据也无法离线爆破"。

**图② Enroll：落盘的只有 verifier 与加密后的 SP**

```

  The "iframe" tag is not supported by your browser.
```

* * *

## 3\. PIN 校验（Verify）：重算 verifier 再比对

**最容易搞错的一点**：校验 **不是** "用 PIN 派生密钥去解密某段密文，再拿解密结果和原始 PIN 对比"。既没有可比对的明文，也没有可解的 PIN 密文。

真实过程只有两步（都在 TEE 内）：

1.  用 handle 里的 **salt** + 候选 PIN，重算 `H′ = KDF(HUK, salt, PIN′)` ；
2.  与 handle 里的 **H** 做 **常数时间比对**——这是 **verifier ↔ verifier**，不是明文比对。

而且 **节流是前置的**：先把错误计数 `+1` 落盘到 RPMB，再开始比对——这样即使攻击者在比对前杀掉进程，也 **无法绕过计数**。

**图③ Verify：节流前置 + 重算比对（失败与冷却都在这张图里）**

```

  The "iframe" tag is not supported by your browser.
```

* * *

## 4\. 从"认证通过"到"拿到密钥"：AuthToken → KeyMint → CE

比对成功 **不等于** 数据能解密了。中间还要过一次"授权"：

1.  TEE 用只有它能用的密钥签一个 **AuthToken** （含 user SID、时间戳、以及 **由 KeyMint 侧下发的 challenge**）；
2.  REE 把它交给 **KeyMint / keystore2**，验签 + 校验 challenge 与新鲜度 → 授权 **auth-bound key** 操作；
3.  KeyMint 据此 **派生 / 释放 CE 密钥** （FBE 下还要解开 SP 的包裹），并把密钥 **载入硬件加密引擎**；
4.  加密引擎用它解密 `/data` ，CE 目录随即挂载。

> **注意**：这里的"解密"解的是 **用户数据与密钥包裹（SP blob）**，与 PIN 没有任何比对关系——两份职责在图里是彻底分开的。

**图④ 凭据换密钥：AuthToken → KeyMint → CE 密钥 → 硬件引擎**

```

  The "iframe" tag is not supported by your browser.
```

## 5\. 存储：verifier 到底放在哪

**一句话**：verifier **不存在 TEE 里**，而是由 **REE（Android 侧）保存在 `/data` 分区** 上，作为 **synthetic password（SP）体系** 的一部分；TEE 只在 **RPMB** 里保存 **节流 / 防回滚状态与 `secure_user_id`**。

### 5.1 三处各存什么

| 位置  | 存的是 | 是否含 PIN 相关信息 |
| --- | --- | --- |
| **REE `/data` （DE 存储）** | **gatekeeper password handle** = `{version, salt, signature(H)}` ，其中 `H = KDF(HUK, salt, PIN)` | ✅ **verifier 本体在此** |
| **TEE 侧 RPMB** | 连续错误计数、冷却/锁定状态、per-user `secure_user_id` | ❌ 只有节流状态， **没有 H** |
| **OTP 熔丝** | **HUK** （每芯片唯一密钥） | ❌ 永不出硬件 |

即： **verifier 是"REE 持有、每次 verify 时传入 TEE"，TEE 不持久化它**—— 对应 **图③-4 / ③-5** （候选 PIN + handle 一起送进 TEE）与 **图③-6、③-13、③-17、图④-1** （只在 RPMB 读写节流状态）。

### 5.2 具体落在哪个文件（置信度标注）

| 场景  | 路径  | 置信度 |
| --- | --- | --- |
| **Android 9+ 带 FBE + SP（含 14/15）** | **`/data/system_de/<user_id>/spblob/`** 目录下：  <br>· `*.pwd` → 序列化的 **PasswordData**， **内含 gatekeeper handle（salt + H）**  <br>· `*.spblob` → 被 LSKF 派生密钥加密的 **synthetic password**  <br>· 文件名 = handle 的哈希（ `Long.toHexString(...)` ） | 架构：高  <br>文件名编码：中 |
| 早期 FBE（Android 7–8，无 SP） | `/data/system/gatekeeper/` （如 `password.key` ）、 `/data/misc/gatekeeper/` | 中（版本相关） |

**数据流**

-   **Enroll** （图②-7 → ②-8）：TA 返回 handle → framework（ `SyntheticPasswordManager` ）把 handle 连同 escrow / 加密后的 SP 写进 `spblob/*.pwd` ；
-   **Verify** （图③-15）：framework 从 `spblob/` 取出 handle（protector 数量很少）→ `gatekeeper.verify(challenge, handle, PIN)` → TA 用 handle 里的 **salt** 重算 `H′` ，与 handle 里的 **H** 在 TEE 内比对。

### 5.3 为什么放在 /data（DE）上也安全

`/data/system_de` （DE = Device Encrypted）在 **解锁前就可读**，看上去危险，但：

-   里面只有 `salt + H` ， **H 是带 HUK 的不可逆 KDF 输出**；
-   **HUK 在熔丝内、只能由硬件内部参与运算** （对应 **图③-15** 那条 `Note` ）⇒ 拿到 handle 也 **无法离线爆破** PIN；
-   RPMB 的 **节流状态按设备计** ⇒ 攻击者拿不到"免费的尝试次数"。

⇒ 这正是" **存 verifier、不存 PIN 密文** "的设计动机：若把 PIN 加密保存，"解密出 PIN 再比对"反而会让 `/data` 上的密文成为离线爆破的目标。

* * *

## 6\. 威胁模型与防护边界（HUK 的定位）

`H = KDF(HUK, salt, PIN)` 的安全性 **只依赖一个硬假设：HUK 保密**。  
若攻击者同时拿到 **handle** （在 `/data` ，可读）与 **HUK**，即可在外部对候选 PIN 重算 KDF 并比对， **完全绕过 RPMB 的节流 / 错误计数**——因为那套逻辑只在"验证请求必须经过 TEE"时成立，离线爆破不走 TEE。

| 攻击者能力 | 能否拿到 HUK | 能否离线爆破 PIN |
| --- | --- | --- |
| 恶意 App / Root / 篡改系统镜像 | ✘   | ✘（在线猜，受 RPMB 节流限制） |
| 拆机 + 离线读写存储 / RPMB 重放 | ✘（HUK 在 SoC 内） | ✘   |
| **物理侵入 SoC** （去封装 + FIB/微探针读熔丝，或探硬件 KDF 中间值） | **✔（实验室级）** | **✔（可离线穷举）** |
| 侧信道 / 故障注入（功耗、EM、电压/时钟毛刺） | 取决于实现 | 可能绕过比对或提取中间值 |

要点：

1.  **HUK 每芯片唯一** ⇒ 读出只攻破该台设备， **无法横向扩散** （不是"解一个破一万"）；
2.  物理侵入是 **单体、昂贵、不可批量** 的攻击，与"装个 App 就能爆破"不是一个量级；
3.  **熔丝读出保护 / 调试口锁定** 能抬高中断门槛，但各厂实现差异大， **不宜当作数学保证**——安全设计通常假设物理侵入者最终能读到；
4.  真正决定"HUK 泄露后还能否爆破"的是 **口令熵**：4–6 位 PIN 只有 10⁴–10⁶ 种， **HUK 泄露后必然秒破**；故高价值场景需 **强口令**，或把验证搬入 **StrongBox / 独立安全芯片（SE）**，并叠加抗侧信道 / 抗故障注入与失败熔断设计。

⇒ **本机制防的是"软件与离线攻击"；物理侵入（读 HUK）明确不在其防护边界内**，需由安全芯片（StrongBox/SE）与防篡改设计覆盖。即 HUK 的作用不是"不可破"，而是把攻击成本从"软件可及" **抬到"必须物理侵入单颗芯片"**。

* * *

## 7\. 安全要点速查

| #   | 要点  | 为什么 |
| --- | --- | --- |
| 1   | **不存 PIN**，只存 `H = KDF(HUK, salt, PIN)` | PIN 熵极低，任何可逆保存都等于泄露 |
| 2   | 校验 = **重算 verifier 再比对**，不是"解密后比对明文" | 既没有 PIN 密文，也没有比对对象 |
| 3   | 错误计数 **先 +1 落 RPMB**，再开始比对 | 比对前杀进程也绕不过计数 |
| 4   | **HUK 全程不出硬件**，只作 KDF 内部输入 | 落盘数据无法离线爆破 |
| 5   | AuthToken 由 **TEE 签名** （REE 无法伪造），且含 KeyMint 下发的 challenge | 认证绑定到具体密钥请求，防重放 |
| 6   | **CE 密钥载入硬件加密引擎**，不导出到 REE 内存 | 主系统拿不到明文密钥 |
| 7   | 节流状态放 **RPMB（按设备计）** | 攻击者没有"免费尝试次数" |
| 8   | 解密用户数据走 **AuthToken → KeyMint → CE 密钥另一条链** | 与"PIN 对不对"职责分离，互不耦合 |

* * *

## 8\. 附录：真机核实命令（需 root）

```bash
adb shell su -c 'ls -l /data/system_de/0/spblob/'
adb shell su -c 'ls -l /data/system/gatekeeper/ /data/misc/gatekeeper/ 2>/dev/null'
adb shell su -c 'xxd /data/system_de/0/spblob/*.pwd | head'   # 仅示意二进制结构
```

* * *

**结语**：整条链路的设计意图可以用一句话概括—— **"PIN 只留指纹，密钥另走一条路"**。  
把"判断 PIN 对不对"（TEE 内的哈希比对）与"拿到能解密数据的密钥"（AuthToken → KeyMint → CE 密钥）彻底分开，既让低熵的 PIN 不至于变成数据安全的单点，也让数据密钥永远不必明文出现在 Android 主系统里。而这条链的安全边界，最终由 **HUK 的物理保密** 与 **安全芯片** 共同决定。
