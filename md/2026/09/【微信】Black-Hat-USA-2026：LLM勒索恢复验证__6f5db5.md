---
title: 【微信】Black Hat USA 2026：LLM勒索恢复验证
source: https://mp.weixin.qq.com/s/6aZFiQamVYcHMsrp86PrSw
source_host: mp.weixin.qq.com
clip_date: 2026-09-11T13:08:53+08:00
trace_id: 801f163d-6154-4242-8674-6e33fca50996
content_hash: 4e8278c86619d965410db028230d722d5f2d54918eb4635f882c7eef72277a4c
status: synced
tags:
  - 微信
  - 恶意样本
  - AI辅助逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 勒索恢复的关键不是攻破 RSA，而是发现密钥生成代码缺陷：循环内重复 `srand(time(0))` 使 ChaCha20 key/nonce 退化为重复字节，key 空间仅剩 256。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 3d875244-d011-8184-871a-e020ee796a74
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 勒索恢复的关键不是攻破 RSA，而是发现密钥生成代码缺陷：循环内重复 `srand(time(0))` 使 ChaCha20 key/nonce 退化为重复字节，key 空间仅剩 256。
> 
> - **核心缺陷：** `srand(time(0))` 在循环内反复播种，同一秒内每次 `rand()` 首值相同，导致 32 字节 key 与 12 字节 nonce 各字节相同，实际只需枚举 256 个候选。
> - **恢复顺序：** 先证据冻结（快照/只读镜像 + SHA256 manifest），再攻击分析、发现缺陷、开发工具、恢复；decryptor 只写 `work/`，不碰原件。
> - **布局陷阱：** `ratio=3` 即加密 1MB、跳过 3MB，且每个加密块 counter 从 1 重置；恢复循环必须是 1MB 解密 + 3MB 原样复制，明文区误 XOR 会造成二次破坏。
> - **多层剥离：** 同一文件可被加密 2–3 次；用 Oracle 固定 header 的 8 字节已知明文筛候选，双层降至秒级，三层约 20 分钟，逐层输出并校验后再剥下一层。
> - **性能与验证：** LLM 辅助逆向解释、生成与 Python→C 移植；C 单核 355–366MiB/s、AVX2 最高约 2.19GB/s，100GB 从约 16 小时降到 147 秒。候选 key 需 entropy、magic、ASCII 比例、UTF-8 多信号判定；服务在攻击后 81 小时恢复。

**白帽子罗棋琛** *2026年9月11日 09:19*

## 用 LLM 把勒索恢复做成可验证工程

勒索事件进入恢复阶段后，最危险的误判之一，是把“找到密码学缺陷”当成“数据已经能安全恢复”。PoC 在一个文件上跑通，只能证明方向可能正确；生产恢复还要回答更多问题：同一存储是否被加密多次，间歇加密的 block layout 是否一致，如何判断候选 key，解密器中断后能否续跑，怎样确保不会把原本的明文再次 XOR 成垃圾。

Black Hat USA 2026 公开课件《Cracking the Chains》复盘了一起针对 Linux/Oracle 数据库环境的 Gunra 勒索事件。研究团队从二进制逆向入手，发现攻击者的 ChaCha20 key/nonce 生成代码错误地在循环内使用 `srand(time(0))` ，使 32 字节 key 和 12 字节 nonce 都退化成重复字节，实际 key 搜索空间只剩 256。团队借助 LLM 解释反编译代码、重建算法、生成初版工具并辅助从 Python 移植到 C，最终把 100GB 的处理时间从约 16 小时降到 147 秒，并在事件发生后 81 小时恢复主要服务。

这不是“LLM 破解 RSA-4096”的故事。RSA 封装仍然没有被数学攻破；失效的是封装前的密钥生成。LLM 也不是独立做出恢复决策的主体，它参与了逆向解释、代码草拟和工程迭代，关键结论仍由样本、已知明文、文件结构和恢复后的可挂载性验证。

本文依据公开课件整理，不以现场参会视角叙述。示例仅用于已授权事件响应和离线副本，不应直接对唯一一份受损介质执行写操作。

## 1、恢复工作先从证据冻结开始

课件把事件处置压缩为四个环节：攻击分析、发现密码学缺陷、开发工具、恢复。这个顺序不能倒过来。没有先确认样本版本、参数和文件布局，就直接拿通用 decryptor 批量写盘，可能造成第二次不可逆破坏。

![从分析到恢复的闭环](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c57c58f54e3bb88a.jpg)

*图 1：找到缺陷只是中点，后面还有工具工程化与恢复验证*

第一份操作对象应当是快照或只读镜像。为样本、keystore、脚本、加密卷和日志建立 manifest，并记录获取时间、源设备、时区与 hash：

bash

```bash
# 在取证工作站执行；源块设备应通过写保护或只读映射暴露 CASE_DIR="case-2025-0714"mkdir -p "${CASE_DIR}"/{evidence,work,logs} cd"${CASE_DIR}"sha256sum \   evidence/enc \   evidence/.keystore \   evidence/R3ADM3.txt \   evidence/volume01.img \   > case-2025-0714/logs/SHA256SUMS  lsblk -o NAME,RO,SIZE,MODEL,SERIAL,MOUNTPOINTS blockdev --getro /dev/mapper/volume01-ro  # 工作副本再次校验，不修改 evidence 原件cp --reflink=always evidence/volume01.img work/volume01-test.img sha256sum evidence/volume01.img work/volume01-test.img \   > logs/IMAGE_COPY_SHA256.txt 
```

`cp --reflink` 是否可用取决于文件系统；不可用时应创建新的镜像副本或快照。任何 decryptor 都只允许写 `work/` ，并在命令行显式传入独立输出路径。

## 2、先还原样本“做了什么”，不要只看勒索信

课件样本 `enc` 支持 `--limit` 、 `--ratio` 、 `--device` 和扩展名选择，能够面向普通文件或 raw block device。它跳过自己的 `R3ADM3.txt` 勒索信和已经带 `.ENCRT` 后缀的文件，避免同一遍历过程重复加密。

![加密器参数与行为](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c2397922550bd113.jpg)

*图 2：参数决定目标类型、加密上限与间歇加密比例，恢复器必须逐项对齐*

事件目录 `/root/crypt` 中还包含公钥、keystore、执行脚本和进度文件。值得注意的是，脚本里计划使用的参数与实际运行二进制不一致：二进制拒绝了部分选项，说明攻击者最后部署了另一个 build。恢复分析必须以 **真实执行的 hash 和遥测** 为准，不能以落地脚本推断全部行为。

可以把逆向结论先结构化，要求每个字段附证据来源：

yaml

```
sample_profile:sha256:REPLACE_WITH_ACTUAL_HASHbuild_id:unknownobserved_execution:host:db-node-07timestamp_utc:2025-07-13T15:49:00Zargv_source:auditdcrypto:stream_cipher:chacha20key_bytes:32nonce_bytes:12initial_counter_per_encrypted_chunk:1layout:encrypted_chunk_bytes:1048576plaintext_chunks_skipped:3byte_limit:unknownevidence:-decompiler_function:sub_REPLACE-entropy_map:logs/volume01.entropy.json-suffix_depth:2
```

`unknown` 比猜一个默认值更安全。恢复器只有在关键参数被样本、命令行日志或数据分布确认后，才允许从 dry-run 进入写输出阶段。

## 3、RSA没有失效，随机数生成把密钥空间压成了256

样本原本采用常见的 hybrid encryption：随机生成 32 字节 ChaCha20 key、12 字节 nonce，再把 key material、ratio 和 limit 一起用 RSA-4096 公钥封装进 512 字节 `.keystore` 。没有攻击者私钥时，直接解 RSA 在计算上不可行。

![keystore中的密钥材料](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7acd4c9ffd8201e3.jpg)

*图 3：RSA 保护的是 52 字节参数块；参数块生成前已经出现致命弱点*

反编译代码显示生成循环反复调用 `srand(time(0))` 。循环在同一秒内完成，每次播种相同，随后取得的第一次 `rand()` 结果也相同，因此 key 和 nonce 的每个位置得到同一个 byte。

![循环内重复播种](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13f26cfd22840025.jpg)

*图 4：问题不是单纯“时间种子可预测”，而是每个字节前重新播种，使每次都取同一序列的第一个值*

下面的最小模型只用于说明熵坍缩，不复刻特定 libc 的 `rand()` ：

python

```python
defflawed_material(first_prng_byte: int) -> tuple[bytes, bytes]:     ifnot0 <= first_prng_byte <= 255:         raise ValueError("candidate must be one byte")     key = bytes([first_prng_byte]) * 32     nonce = bytes([first_prng_byte]) * 12return key, nonce  candidates = [flawed_material(b) for b inrange(256)] assertlen({key for key, _ in candidates}) == 256
```

![256位密钥退化为8位](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c3dee754764a9997.jpg)

*图 5：课件验证 key 的 32 个字节相同，实际只需枚举 256 个候选 byte*

若走时间戳路线，还必须使用与目标相同的 C runtime 和 `rand()` 实现；glibc、musl、不同平台的输出不应假定一致。重复字节路线则直接枚举最终 byte，绕开了文件 mtime 被修改和时间窗口过宽的问题。

## 4、间歇加密的布局比候选Key更容易毁掉数据

课件中的 `ratio=3` 表示加密 1MB，再跳过 3MB 明文，如此循环。熵图上会出现高熵与正常数据交替的条带。

![间歇加密熵图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/86d91dffe8b2d62b.jpg)

*图 6：高熵块显示被加密区间，低熵和结构化区域保留原始明文*

恢复器不能把 ChaCha20 keystream 从文件头连续跑到文件尾。材料指出，每个被加密的 1MB block 都以 counter 1 重新开始；中间 3MB 必须原样复制。对明文区错误执行 XOR，会把可恢复数据主动破坏。

![间歇加密逆向布局](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a3c26f10dcc3688.jpg)

*图 7：恢复循环是 1MB decrypt、3MB copy，并受原始 limit 限制*

将布局与 cipher 实现分离，便于测试：

python

```python
from collections.abc importCallable, Iterator  MiB = 1024 * 1024defregions(file_size: int, ratio: int, limit: int | None) -> Iterator[tuple[int, int, bool]]:     cursor = 0     encrypted_total = 0while cursor < file_size:         enc_len = min(MiB, file_size - cursor)         if limit isnotNone:             enc_len = min(enc_len, max(0, limit - encrypted_total))         if enc_len == 0:             yield cursor, file_size - cursor, Falsereturnyield cursor, enc_len, True         cursor += enc_len         encrypted_total += enc_len          skip_len = min(ratio * MiB, file_size - cursor)         if skip_len:             yield cursor, skip_len, False             cursor += skip_len  defrecover_stream(src, dst, plan, decrypt_chunk: Callable[[bytes], bytes]):     for offset, length, encrypted in regions(plan.size, plan.ratio, plan.limit):         src.seek(offset)         data = src.read(length)         iflen(data) != length:             raise IOError(f"short read at {offset}")         dst.seek(offset)         dst.write(decrypt_chunk(data) if encrypted else data) 
```

这里故意不实现 ChaCha20，避免把未经核对的 nonce/counter 细节和布局逻辑耦合。实际 `decrypt_chunk` 应调用经过测试的密码库，并为每个 encrypted region 明确重置 counter。

## 5、LLM适合压缩工程时间，不适合签署恢复结论

课件把 LLM 的参与分成四类：辅助理解 Hex-Rays 输出、还原 keystream、生成和移植工具、协助验证。这个边界很务实。模型擅长解释控制流、补齐样板代码、对照 Python/C 逻辑，却不能从一段看似合理的反编译代码保证语义正确。

![LLM辅助工程流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bb25753cd15fdff3.jpg)

*图 8：AI 位于工程循环中，最终验证仍由熵、magic bytes 和 known plaintext 完成*

给 LLM 的任务应当足够小，并带输入证据和验收测试：

text

```
任务：解释函数 sub_401A20 的 key/nonce 生成语义。  输入： - Ghidra/Hex-Rays 伪代码 - 对应汇编 basic block - imported symbols 与目标 libc 版本 - 两组动态跟踪中的 key buffer  输出约束： 1. 逐条区分“由代码证明”和“推测”； 2. 标出整数宽度、符号扩展、循环边界； 3. 生成最小单元测试，不生成批量覆盖磁盘代码； 4. 若伪代码与汇编冲突，以汇编为准并报告冲突。 
```

任何由模型生成的恢复代码都应经过人工 code review、静态分析、sanitizer、已知向量和差分测试。恢复现场不接受“模型解释看起来对”作为证据。

## 6、正确Key的判定必须使用多信号验证器

256 次枚举本身几乎没有成本，困难在于自动判断哪个候选产生了正确明文。课件使用 entropy、magic bytes、ASCII ratio、byte diversity 与 UTF-8 解码组成验证 pipeline。

![候选密钥验证流水线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/965e7253adf2b4dc.jpg)

*图 9：错误候选通常保持高熵噪声，正确候选则恢复格式头或可解释结构*

单个启发式会误判。压缩文件和加密数据库页本来就可能高熵，文本页也未必以 UTF-8 编码。验证器应根据资产类型加载 profile，并返回分项证据而不是一个神秘总分：

python

```python
import math from collections import Counter from dataclasses import dataclass  MAGIC = {     "pdf": b"%PDF-",     "png": b"\x89PNG\r\n\x1a\n",     "zip": b"PK\x03\x04",     "oracle_reco": b"ORCLDISKRECO",     "oracle_data": b"ORCLDISKDATA", }  defentropy(data: bytes) -> float:     ifnot data:         return0.0     counts = Counter(data)     return -sum((n / len(data)) * math.log2(n / len(data)) for n in counts.values())  @dataclass(frozen=True)classVerdict:     accepted: bool     magic: str | None     entropy: float     printable_ratio: floatdefvalidate_sample(data: bytes, expected_magic: set[str]) -> Verdict:     matched = next((name for name in expected_magic if data.startswith(MAGIC[name])), None)     printable = sum(b inb"\t\n\r"or32 <= b < 127for b in data) / max(len(data), 1)     h = entropy(data)     accepted = matched isnotNoneor (h < 7.5and printable > 0.85)     return Verdict(accepted, matched, h, printable) 
```

上线时还应检查结构校验：ZIP central directory、PDF xref、数据库 page checksum、文件系统 superblock。只凭“entropy 下降”批准整卷覆盖，风险仍然过高。

## 7、多层加密要逐层剥离，不能组合后直接写盘

课件发现多个服务器同时访问共享存储，同一文件可能出现 `.ENCRT.ENCRT.ENCRT` ，意味着被不同进程加密两到三次。单层 256 个候选很小，双层组合为 65,536，三层达到 16,777,216。

材料用 Oracle 固定 header 做 known-plaintext，只取固定 offset 的 8 字节进行候选筛选；匹配后先剥一层，再对下一层重复。相较每个候选都处理数 GB 文件，这把双层搜索压到秒级，三层约 20 分钟。

![利用已知明文剥离多层加密](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/59bf4a7c694b06df.jpg)

*图 10：小样本用于筛选候选，整文件恢复只对已经确认的层执行*

工程上要把“发现 key”和“应用 key”拆成两个命令：

yaml

```
layer_recovery_plan:input_sha256:REPLACE_MEsuffix_depth_observed:3known_plaintext:offset:0bytes_hex:4f52434c4449534b# ORCLDISKcandidates:-layer:3repeated_byte:"REPLACE_AFTER_VERIFICATION"confidence:header_and_page_checksum-layer:2repeated_byte:"REPLACE_AFTER_VERIFICATION"confidence:header_and_page_checksum-layer:1repeated_byte:"UNKNOWN"confidence:pendingapply:mode:dry_runoutput:volume01.recovered.imgoverwrite_input:false
```

每剥一层都生成独立输出与 hash，检查 header、页校验和及 entropy map，再进入下一层。即使第三层判断错误，也能回退到第二层产物，而不是重新读取现场原件。

## 8、从Python移植到C之前，先建立差分测试

课件中的首个 Python 工具处理 100GB 约需 16 小时；优化 C 版本单核达到 355—366MiB/s，AVX2 路径最高约 2.19GB/s，对应 147 秒。性能提升主要来自固定宽度 32 位运算、编译器优化和 SIMD，而不是让 LLM “写得更聪明”。

![C与AVX2性能提升](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cc42088272199f78.jpg)

*图 11：大规模恢复必须提升吞吐，但优化只能发生在逻辑已验证之后*

ChaCha20 quarter round 对溢出和 rotate 语义敏感。Python 整数不自动截断到 32 位，C 中又要避免未定义行为；移植时必须用官方 test vector 与 Python reference 做差分。

python

```python
import os import subprocess import tempfile  defdifferential_test(reference_decrypt, c_binary, key: bytes, nonce: bytes):     for size in (0, 1, 63, 64, 65, 4096, 1024 * 1024):         ciphertext = os.urandom(size)         expected = reference_decrypt(ciphertext, key, nonce, counter=1)         with tempfile.TemporaryDirectory() as d:             src = f"{d}/in.bin"             dst = f"{d}/out.bin"open(src, "wb").write(ciphertext)             subprocess.run(                 [c_binary, "--input", src, "--output", dst,                  "--key-hex", key.hex(), "--nonce-hex", nonce.hex(),                  "--counter", "1"],                 check=True, timeout=30,             )             actual = open(dst, "rb").read()             assert actual == expected, f"mismatch at size={size}"
```

生产 C build 还应启用 `-Wall -Wextra -Wconversion -Werror` 、ASan/UBSan 测试构建和大文件支持；AVX2 路径运行前检查 CPUID，并保留 portable fallback。147 秒是特定硬件和数据条件下的课件结果，不是所有恢复节点的 SLA。

## 9、解密完成不等于恢复完成

课件以恢复后的 `ORCLDISKRECO` header 作为关键证据，随后还需要卷识别、数据库挂载与服务级验证。

![恢复后的Oracle磁盘头](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/702ae9d7fc8fe682.jpg)

*图 12：从随机字节恢复出 Oracle 磁盘签名，证明 key 与布局方向正确，但仍需数据库一致性检查*

恢复验收至少分四层：

text

```
byte layer      输出 hash、抽样对比、未加密区保持不变 format layer    magic、superblock、page checksum、文件边界 database layer  control file、redo/undo、一致性检查、只读打开 service layer   关键查询、依赖服务、数据时间点、业务方签字 
```

可以对所有“应当复制”的明文 region 做不变性断言：

python

```python
import hashlib  defdigest_region(path: str, offset: int, length: int) -> str:     h = hashlib.sha256()     withopen(path, "rb", buffering=0) as f:         f.seek(offset)         remaining = length         while remaining:             block = f.read(min(4 * 1024 * 1024, remaining))             ifnot block:                 raise IOError("unexpected EOF")             h.update(block)             remaining -= len(block)     return h.hexdigest()  assert digest_region("encrypted.img", 1 << 20, 3 << 20) == \        digest_region("recovered.img", 1 << 20, 3 << 20) 
```

课件称主要公共服务在攻击后 81 小时恢复，所有数据库服务器得到恢复，并在之后完成全部恢复。这一结果依赖具体密码学缺陷和团队已有基础设施，不能替代离线、不可变备份与恢复演练。

![81小时恢复时间线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/81b6e4a97d862423.jpg)

*图 13：服务恢复是分析、工具开发、验证和基础设施协同的结果*

## 10、真正可复制的是恢复流水线，不是等待攻击者再犯错

课件推测缺陷来自攻击者最后 26 小时将 40 多个目标定制 build 合并成统一二进制，几乎没有 QA，最终把同一个 `srand` 错误扩散到所有目标。这解释了本次事件为何能被技术恢复，却不能据此假设下一次勒索样本也会留下同样缺陷。

![攻击者工具链的26小时转向](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/adb53f725e50d3a3.jpg)

*图 14：攻击者为了降低运维成本统一工具，反而引入共享的致命实现错误*

防守方应在事件前准备恢复工程，而不是在事件后临时寻找“万能解密器”：

yaml

```
ransomware_recovery_gate:evidence:immutable_source_image:truemalware_and_script_hashes_recorded:trueexecution_argv_and_timestamps_preserved:truetimezone_normalized:trueanalysis:exact_sample_build_identified:truecrypto_and_io_paths_reviewed_by_two_people:truepartial_encryption_layout_confirmed:truemulti_layer_encryption_checked:truetooling:input_never_overwritten:truedry_run_and_resume_supported:trueevery_output_has_manifest_and_hash:truereference_and_optimized_implementations_diff_tested:truefailure_is_fail_closed:trueverification:candidate_key_uses_multiple_signals:trueskipped_regions_are_byte_identical:trueformat_and_database_checks_pass:truerestored_service_has_business_owner_approval:trueresilience:offline_immutable_backup_available:truerestore_rto_rpo_drill_current:trueexfiltration_investigation_continues:truecredentials_and_persistence_rotated:true
```

![防守方的恢复与韧性要求](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a2de3c937988584f.jpg)

*图 15：勒索恢复不只处理加密，还要同时面对入侵面、双重勒索和长期韧性*

这场案例给 LLM 的定位也很清楚：它能把反编译解释、原型代码和移植工作压缩到更短时间，却不能替代证据保全、密码学判断和数据所有者验收。最可靠的“AI 辅助恢复”不是让模型直接对生产卷写入，而是让每个模型建议都进入可回放的工程链：输入有 hash，假设有依据，代码有测试，输出有独立验证，错误可以回滚。

* * *

资料：

-   Black Hat 官方 Session 页面
    
-   Black Hat USA 2026 Session
    

**原始会议材料（仓库内）**

-   演讲课件 PDF
    

开源资料与原始议题 PDF

本文对应的 Markdown 原稿、Black Hat 原始议题 PDF 与配图已整理到 GitHub，可按文章编号查找和下载。

https://github.com/cybermaxluo/black-hat-usa-2026-talks

也可以点击文末“阅读原文”进入仓库。欢迎 Star、提交 Issue 或参与勘误。

Black Hat · 目录
