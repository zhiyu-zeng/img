---
title: 【微信】微调 Qwen3Guard：从零构建内容安全审查护栏模型
source: https://mp.weixin.qq.com/s/wHlimgY71eBY8A731GSlRQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T09:11:51+08:00
trace_id: 9969bde9-15c8-4093-9ccd-f6b0c1c51688
content_hash: 8be3456903c9f5bf43150f29180a6c1851b84be56eb6889343b9ef1b99fb733a
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 41375244-d011-8192-bcf2-d0410791f4ad
ioc: null
---

**智佳网络安全** *2026年11月8日 21:51*

消费级设备全流程LoRA微调 Qwen3Guard及部署测评模型过程记录

## 技术架构依据

-   模型极小：Qwen3Guard-Gen-0.6B 参数，4060 消费级显卡毫无压力。
    
-   官方规范：严格遵循 Qwen3Guard 官方的三级风险分类（Safe/Controversial/Unsafe）与 9 大风险类别
    
-   完整闭环：涵盖数据集构造 -> LLaMA-Factory 训练 -> vllm推理测试
    

## Qwen3Guard官方分类体系

-   安全等级（Safety）：
    

-   Safe：安全
    
-   Controversial：争议性（视场景而定）
    
-   Unsafe：危险
    

## 实验环境

-   Windows GPU RTX 4060 8GB
    
-   WSL2
    
-   Ubuntu 24.04 LTS
    
-   Python 3.12
    
-   PyTorch CUDA cu121
    
-   训练框架 LLaMA-Factory
    
-   推理框架 vLLM
    
-   模型 Qwen3Guard-Gen-0.6B
    

## 基础环境搭建

```
wsl --update
wsl --set-default-version 2
wsl --install -d Ubuntu-24.04
sudo apt update && sudo apt upgrade -y

sudo apt install -y python3.12-venv python3-pip git curl build-essential
nvidia-smi
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be2e2fdaf50c4481.jpg)

创建工作目录，大致上目录结构如下：

```
~/qwen3guard-blog/
├── hf_cache/                  # HuggingFace / datasets 缓存
├── models/
│   ├── Qwen3Guard-Gen-0.6B/
│   └── qwen3-guard-merged/
├── data/
│   └── guard_train.json
├── LLaMA-Factory/
├── venv-3.12-train/
├── venv-3.12-infer/
├── prepare_data.py
├── add_dataset.py
├── eval_vllm_run.py
├── compare_preds.py
├── preds_base.json
└── preds_ft.json
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f9240eeb0ce4153c.jpg)

执行

```
mkdir -p ~/AI_Infra/qwen3_guard
cd ~/AI_Infra/qwen3_guard
mkdir -p data models saves hf_cache
```

设置环境变量

```bash
cat >> ~/.bashrc <<'EOF'
export HF_HOME=$HOME/qwen3_guard/hf_cache
export HF_ENDPOINT=https://hf-mirror.com
export PATH=/usr/lib/wsl/lib:$PATH
EOF
source ~/.bashrc
echo $HF_HOME
```

创建训练环境

```
cd ~/AI_Infra/qwen3_guard
python3 -m venv venv-3.12-train
source venv-3.12-train/bin/activate
python -m pip install --upgrade pip
```

安装pytorch，我们使用 CUDA 12.1

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/65a7d0061a493e78.jpg)

安装运行时依赖

```bash
pip install "transformers>=4.55.0,<=5.8.0" accelerate peft datasets modelscope sentencepiece protobuf
```

安装 LLaMA-Factory

```bash
git clone https://github.com/hiyouga/LLaMA-Factory.git
cd LLaMA-Factory
pip install -e .
cd ..
llamafactory-cli version
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/786652465ce32556.jpg)

下载基座模型

```bash
cd ~/AI_Infra/qwen3_guard
source venv-3.12-train/bin/activate
modelscope download --model Qwen/Qwen3Guard-Gen-0.6B --local_dir ./models/Qwen3Guard-Gen-0.6B
ls models/Qwen3Guard-Gen-0.6B
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dccf6bf26423888a.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c8cdff5b245e24ca.jpg)

## 创建训练数据集

使用 `nvidia/Nemotron-Safety-Guard-Dataset-v3` ，完整 50 多万条数据，我们使用流式处理前20000条

创建`./qwen3_guard/prepare_data.py`

```python
import json
import os
import re
from datasets import load_dataset

SAMPLE_SIZE = 20000
OUTPUT_FILE = "data/guard_train.json"

ALLOWED_CATEGORIES = {
    "Violent",
    "Non-violent Illegal Acts",
    "Sexual Content or Sexual Acts",
    "PII",
    "Suicide & Self-Harm",
    "Unethical Acts",
    "Politically Sensitive Topics",
    "Copyright Violation",
    "Jailbreak",
    "None",
}


def first_key(item, keys):
    for key in keys:
        if key in item and item[key] is not None:
            return item[key]
    return None


def normalize_safety_label(value):
    if value is None:
        return "Unknown"

    if isinstance(value, bool):
        return "Safe" if value else "Unsafe"

    if isinstance(value, int):
        if value == 0:
            return "Safe"
        if value == 1:
            return "Unsafe"
        if value == 2:
            return "Controversial"
        return "Unknown"

    if isinstance(value, list):
        value = " ".join([str(x) for x in value])

    if isinstance(value, dict):
        value = json.dumps(value, ensure_ascii=False)

    text = str(value).strip().lower()

    if not text:
        return "Unknown"

    if "unsafe" in text or "not safe" in text or "danger" in text or "harmful" in text:
        return "Unsafe"

    if "controversial" in text or "caution" in text or "sensitive" in text:
        return "Controversial"

    if "safe" in text:
        return "Safe"

    return "Unknown"


def map_category(value):
    if value is None:
        return "None"

    if isinstance(value, list):
        value = " ".join([str(x) for x in value])

    if isinstance(value, dict):
        value = json.dumps(value, ensure_ascii=False)

    text = str(value).strip().lower()

    if not text or text == "none":
        return "None"

    mapping_rules = [
        (r"jailbreak|prompt.?injection|override|system.?prompt", "Jailbreak"),
        (r"violent|violence|weapon|bomb|gun|attack|kill", "Violent"),
        (r"copyright|piracy|pirated|plagiarism", "Copyright Violation"),
        (r"suicide|self.?harm|self harm", "Suicide & Self-Harm"),
        (r"sexual|sex|nsfw|porn|rape", "Sexual Content or Sexual Acts"),
        (r"pii|personal.?information|privacy|address|phone|id.?card|passport", "PII"),
        (r"political|government|election|propaganda", "Politically Sensitive Topics"),
        (r"illegal|hacking|hack|drug|steal|fraud|scam|malware", "Non-violent Illegal Acts"),
        (r"hate|harass|discriminat|unethical|insult|abuse|racist|bias", "Unethical Acts"),
    ]

    for pattern, category in mapping_rules:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return category

    return "Unethical Acts"


def build_target(safety_label, category):
    if safety_label == "Safe":
        category = "None"
    elif category not in ALLOWED_CATEGORIES or category == "None":
        category = "Unethical Acts"

    return f"Safety: {safety_label}\nCategories: {category}"


def main():
    os.makedirs("data", exist_ok=True)

    print("开始加载 nvidia/Nemotron-Safety-Guard-Dataset-v3，使用 streaming 模式...")

    dataset = load_dataset(
        "nvidia/Nemotron-Safety-Guard-Dataset-v3",
        split="train",
        streaming=True,
        trust_remote_code=True,
    )

    samples = dataset.shuffle(seed=42, buffer_size=50000)

    results = []
    stats = {}
    seen = 0

    for item in samples:
        if len(results) >= SAMPLE_SIZE:
            break

        seen += 1

        if seen == 1:
            print("样例字段：", list(item.keys()))

        prompt = first_key(
            item,
            [
                "prompt",
                "text",
                "instruction",
                "user",
                "content",
                "input",
            ],
        )

        label_raw = first_key(
            item,
            [
                "prompt_label",
                "label",
                "safety_label",
                "prompt_safety",
                "safety",
                "prompt_safety_label",
            ],
        )

        category_raw = first_key(
            item,
            [
                "prompt_category",
                "category",
                "categories",
                "prompt_categories",
                "labels",
                "category_label",
            ],
        )

        if not prompt:
            continue

        prompt = str(prompt).strip()
        if not prompt:
            continue

        safety_label = normalize_safety_label(label_raw)
        if safety_label == "Unknown":
            continue

        category = map_category(category_raw)
        target = build_target(safety_label, category)

        results.append(
            {
                "conversations": [
                    {
                        "from": "user",
                        "value": prompt,
                    },
                    {
                        "from": "assistant",
                        "value": target,
                    },
                ]
            }
        )

        stats[safety_label] = stats.get(safety_label, 0) + 1

        if len(results) % 1000 == 0:
            print(f"已处理 {len(results)} 条数据...")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("数据准备完成。")
    print(f"输出文件：{OUTPUT_FILE}")
    print(f"总条数：{len(results)}")
    print("标签分布：")
    for key, value in stats.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
```

运行 `python prepare_data.py`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca8cd17ea773faec.jpg)

数据已放置在`./qwen3_guard/data/guard_train.json`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/38e8afd839b6fb31.jpg)

注册数据集到 LLaMA-Factory

创建add_dataset.py

```lua
import json
import os
import shutil

PROJECT_ROOT = os.getcwd()

SRC_FILE = os.path.join(PROJECT_ROOT, "data", "guard_train.json")
LLAMA_DATA_DIR = os.path.join(PROJECT_ROOT, "LLaMA-Factory", "data")
DST_FILE = os.path.join(LLAMA_DATA_DIR, "guard_train.json")
DATASET_INFO_PATH = os.path.join(LLAMA_DATA_DIR, "dataset_info.json")

os.makedirs(LLAMA_DATA_DIR, exist_ok=True)

print(f"复制训练数据：{SRC_FILE} -> {DST_FILE}")
shutil.copyfile(SRC_FILE, DST_FILE)

if os.path.exists(DATASET_INFO_PATH):
    with open(DATASET_INFO_PATH, "r", encoding="utf-8") as f:
        dataset_info = json.load(f)
else:
    dataset_info = {}

dataset_info["qwen3_guard_train"] = {
    "file_name": "guard_train.json",
    "formatting": "sharegpt",
    "columns": {
        "messages": "conversations"
    },
    "tags": {
        "role_tag": "from",
        "content_tag": "value",
        "user_tag": "user",
        "assistant_tag": "assistant"
    }
}

with open(DATASET_INFO_PATH, "w", encoding="utf-8") as f:
    json.dump(dataset_info, f, ensure_ascii=False, indent=2)

print("数据集注册完成：qwen3_guard_train")
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4da8d14b63d72e22.jpg)

## 创建训练配置

```
cd ~/AI_Infra/qwen3_guard/LLaMA-Factory
mkdir -p configs
cd configs
vim qwen3_guard_lora.yaml
```

写入配置

```yaml
### model
model_name_or_path: ../models/Qwen3Guard-Gen-0.6B
trust_remote_code: true

### method
stage: sft   # 监督微调阶段
do_train: true
finetuning_type: lora   # 核心开关：使用 LoRA
lora_target: all
lora_rank: 16    # 秩，数据少用 8，数据多可升到 16/32
lora_alpha: 32    # 缩放系数，惯例设为 rank 的 2 倍
lora_dropout: 0.05

### dataset
dataset: qwen3_guard_train
template: qwen3   # 必须与模型匹配（Qwen3 用 qwen3 模板）
cutoff_len: 1024
overwrite_cache: true
preprocessing_num_workers: 2

### output
output_dir: ../saves/qwen3-guard-0.6b/lora
logging_steps: 10
save_steps: 200
save_total_limit: 1
plot_loss: true   # 自动生成 loss 曲线图
overwrite_output_dir: true

### train
per_device_train_batch_size: 2
gradient_accumulation_steps: 16
learning_rate: 1.0e-4   # 小数据集建议 5e-5 ~ 1e-4
num_train_epochs: 1.0
lr_scheduler_type: cosine
warmup_ratio: 0.05
bf16: true
gradient_checkpointing: true
seed: 42
report_to: none
```

## 启动训练

```bash
cd ./qwen3_guard/LLaMA-Factory
source ../venv-3.12-train/bin/activate
llamafactory-cli train configs/qwen3_guard_lora.yaml
#开另一个窗口监控训练 nvidia-smi -l 2
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/84b658c5b9a3d166.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f5405a2c34343015.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/296e80053a63d5ce.jpg)

训练完成后，LoRA 权重位于`./qwen3_guard/saves/qwen3-guard-0.6b/lora`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/644bc6dc247df867.jpg)

## 导出合并后的模型

创建导出配置`./qwen3_guard/LLaMA-Factory/configs/qwen3_guard_export.yaml`

```yaml
model_name_or_path: ../models/Qwen3Guard-Gen-0.6B
adapter_name_or_path: ../saves/qwen3-guard-0.6b/lora
template: qwen3
finetuning_type: lora
trust_remote_code: true
export_dir: ../models/qwen3-guard-merged
export_size: 2
export_device: cpu
export_legacy_format: false
```

然后执行

```
llamafactory-cli export configs/qwen3_guard_export.yaml
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a96ba9a6dbce8d3.jpg)

导出到`../models/qwen3-guard-merged`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4b398ba7034db10.jpg)

## 创建vllm推理环境

```bash
cd ~/AI_Infra/qwen3_guard
deactivate
python3 -m venv venv-3.12-infer
source venv-3.12-infer/bin/activate
python -m pip install --upgrade pip
pip install vllm datasets transformers
python -c "import vllm; print(vllm.__version__)"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/66be21234abfbee1.jpg)

创建 vLLM 评测脚本，使用 `Qwen/Qwen3GuardTest` 的 `thinking` 数据集用于评测某一个模型，并保存预测结果

创建`./qwen3_guard/eval_vllm_run.py`

```python
import argparse
import json
import re

from datasets import load_dataset
from transformers import AutoTokenizer
from vllm import LLM, SamplingParams


def get_field(item, keys):
    for key in keys:
        if key in item and item[key] is not None:
            return item[key]
    return None


def normalize_label(value):
    if value is None:
        return "unknown"

    if isinstance(value, bool):
        return "safe" if value else "unsafe"

    if isinstance(value, int):
        if value == 0:
            return "safe"
        if value == 1:
            return "unsafe"
        if value == 2:
            return "controversial"
        return "unknown"

    if isinstance(value, list):
        value = " ".join([str(x) for x in value])

    if isinstance(value, dict):
        value = json.dumps(value, ensure_ascii=False)

    text = str(value).strip().lower()

    if not text:
        return "unknown"

    if "unsafe" in text or "not safe" in text or "danger" in text or "harmful" in text:
        return "unsafe"

    if "controversial" in text or "caution" in text or "sensitive" in text:
        return "controversial"

    if "safe" in text:
        return "safe"

    return text


def parse_prediction(text):
    if not text:
        return "unknown"

    match = re.search(r"Safety:\s*(Safe|Unsafe|Controversial)", text, flags=re.IGNORECASE)
    if match:
        return normalize_label(match.group(1))

    text_lower = text.lower()

    if "unsafe" in text_lower:
        return "unsafe"

    if "controversial" in text_lower:
        return "controversial"

    if "safe" in text_lower:
        return "safe"

    return "unknown"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_path", type=str, required=True)
    parser.add_argument("--output", type=str, required=True)
    parser.add_argument("--max_model_len", type=int, default=2048)
    parser.add_argument("--gpu_memory_utilization", type=float, default=0.90)
    parser.add_argument("--dtype", type=str, default="bfloat16")
    parser.add_argument("--max_tokens", type=int, default=128)
    args = parser.parse_args()

    print(f"加载 tokenizer：{args.model_path}")
    tokenizer = AutoTokenizer.from_pretrained(
        args.model_path,
        trust_remote_code=True
    )

    print("加载测试集：Qwen/Qwen3GuardTest")
    dataset = load_dataset(
        "Qwen/Qwen3GuardTest",
        split="thinking"
    )

    prompts = []
    raw_prompts = []
    gold_labels = []

    prompt_keys = [
        "prompt",
        "text",
        "instruction",
        "input",
        "content",
        "user",
    ]

    label_keys = [
        "label",
        "prompt_label",
        "safety",
        "safety_label",
        "ground_truth",
        "answer",
    ]

    skipped = 0

    for item in dataset:
        prompt = None
        if "message" in item and isinstance(item["message"], list):
            for msg in item["message"]:
                if isinstance(msg, dict) and msg.get("role") == "user":
                    prompt = msg.get("content")
                    break
        if not prompt:
            prompt = get_field(item, prompt_keys)
        label = get_field(item, label_keys)

        if not prompt:
            skipped += 1
            continue

        prompt = str(prompt).strip()
        if not prompt:
            skipped += 1
            continue

        messages = [
            {
                "role": "user",
                "content": prompt
            }
        ]

        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )

        prompts.append(text)
        raw_prompts.append(prompt)
        gold_labels.append(normalize_label(label))

    print(f"有效测试样本：{len(prompts)}")
    print(f"跳过样本：{skipped}")

    print(f"加载模型：{args.model_path}")
    llm = LLM(
        model=args.model_path,
        trust_remote_code=True,
        dtype=args.dtype,
        gpu_memory_utilization=args.gpu_memory_utilization,
        max_model_len=args.max_model_len,
    )

    sampling_params = SamplingParams(
        temperature=0.0,
        max_tokens=args.max_tokens,
    )

    print("开始 vLLM 批量推理...")
    outputs = llm.generate(prompts, sampling_params)

    results = []

    for prompt, gold, output in zip(raw_prompts, gold_labels, outputs):
        generated_text = output.outputs[0].text
        pred = parse_prediction(generated_text)

        results.append(
            {
                "prompt": prompt,
                "gold": gold,
                "pred": pred,
                "raw": generated_text,
            }
        )

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"预测结果已保存到：{args.output}")


if __name__ == "__main__":
    main()
```

创建对比脚本，会读取两个预测结果，计算微调前后指标

创建`./qwen3_guard/compare_preds.py`

```python
import json
import sys


def is_risk(label):
    return label in ["unsafe", "controversial"]


def calculate_metrics(results):
    total = 0
    correct = 0

    unsafe_total = 0
    unsafe_hit = 0

    risk_total = 0
    risk_hit = 0

    safe_total = 0
    safe_false_positive = 0

    unknown_gold = 0

    for item in results:
        gold = item["gold"]
        pred = item["pred"]

        if gold not in ["safe", "unsafe", "controversial"]:
            unknown_gold += 1
            continue

        total += 1

        if gold == pred:
            correct += 1

        if gold == "unsafe":
            unsafe_total += 1
            if pred == "unsafe":
                unsafe_hit += 1

        if is_risk(gold):
            risk_total += 1
            if is_risk(pred):
                risk_hit += 1

        if gold == "safe":
            safe_total += 1
            if is_risk(pred):
                safe_false_positive += 1

    accuracy = correct / total if total > 0 else 0
    unsafe_recall = unsafe_hit / unsafe_total if unsafe_total > 0 else 0
    risk_recall = risk_hit / risk_total if risk_total > 0 else 0
    fpr = safe_false_positive / safe_total if safe_total > 0 else 0

    return {
        "total": total,
        "accuracy": accuracy,
        "unsafe_recall": unsafe_recall,
        "risk_recall": risk_recall,
        "false_positive_rate": fpr,
        "unknown_gold": unknown_gold,
    }


def format_percent(value):
    return f"{value:.2%}"


def main():
    if len(sys.argv) != 3:
        print("用法：python compare_preds.py preds_base.json preds_ft.json")
        sys.exit(1)

    base_path = sys.argv[1]
    ft_path = sys.argv[2]

    with open(base_path, "r", encoding="utf-8") as f:
        base_results = json.load(f)

    with open(ft_path, "r", encoding="utf-8") as f:
        ft_results = json.load(f)

    base_metrics = calculate_metrics(base_results)
    ft_metrics = calculate_metrics(ft_results)

    print("\n## 评测结果对比")
    print()
    print("| 模型 | Accuracy | Unsafe Recall | Risk Recall | Safe FPR |")
    print("|---|---:|---:|---:|---:|")
    print(
        f"| Base | "
        f"{format_percent(base_metrics['accuracy'])} | "
        f"{format_percent(base_metrics['unsafe_recall'])} | "
        f"{format_percent(base_metrics['risk_recall'])} | "
        f"{format_percent(base_metrics['false_positive_rate'])} |"
    )
    print(
        f"| Finetuned | "
        f"{format_percent(ft_metrics['accuracy'])} | "
        f"{format_percent(ft_metrics['unsafe_recall'])} | "
        f"{format_percent(ft_metrics['risk_recall'])} | "
        f"{format_percent(ft_metrics['false_positive_rate'])} |"
    )

    print()
    print("说明：")
    print("Unsafe Recall：真实 Unsafe 样本中，被模型判为 Unsafe 的比例。")
    print("Risk Recall：真实 Unsafe/Controversial 样本中，被模型判为 Unsafe/Controversial 的比例。")
    print("Safe FPR：真实 Safe 样本中，被模型误判为风险内容的比例。")

    if base_metrics["unknown_gold"] > 0 or ft_metrics["unknown_gold"] > 0:
        print()
        print(f"注意：Base 有 {base_metrics['unknown_gold']} 条无法识别的金标签。")
        print(f"注意：Finetuned 有 {ft_metrics['unknown_gold']} 条无法识别的金标签。")


if __name__ == "__main__":
    main()
```

运行评测

```bash
cd ~/AI_Infra/qwen3_guard
source venv-3.12-infer/bin/activate
# 缺少 CUDA Toolkit（nvcc 编译器）
export VLLM_USE_FLASHINFER_SAMPLER=0 # 禁用 FlashInfer 采样器
export VLLM_ENABLE_V1_MULTIPROCESSING=0 # 避免 UVA 缓冲区相关的问题

# 先评测原版模型
python eval_vllm_run.py --model_path models/Qwen3Guard-Gen-0.6B --output preds_base.json --gpu_memory_utilization 0.8
# 再评测微调后的合并模型
python eval_vllm_run.py --model_path models/qwen3-guard-merged --output preds_ft.json --gpu_memory_utilization 0.8

# 最后对比
python compare_preds.py preds_base.json preds_ft.json
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/93f1bf90641cb8e6.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ddaba37f19af3920.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/49284c55b00b7afb.jpg)

## 实验总结

LoRA 微调显著提升了 Unsafe 召回率，并小幅降低了 Safe 误报率，虽然效果微调后的结果已超越基座模型，但 Safe FPR 仍高达 84.29%，模型整体仍处于“几乎见谁都报风险”的过度保守状态，距离生产可用还有明显差距。

AI · 目录
