---
title: 【微信】【实战教学】超融合：把兩台配备vLLM的Nvidia DGX工作站，以607.8 tok/s的速度处理GLM-5.3
source: https://mp.weixin.qq.com/s/V2e4oz9Myeu2SZxQ8RVqIg
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:09:09+08:00
trace_id: e06fe07e-4425-41ee-b61a-190bc6753569
content_hash: d583de0bf05b5fb05d0a1fdc1b37458d9d63e8a10f2b5abd1cee0739f63d4ab8
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41d75244-d011-8181-b532-d6278b7154a9
ioc:
  cves: []
  cwes: []
  hashes:
    - 4864d46625cbc3307623e29ac742030655e27249feba7b97ec925ce4cc4dfb56
    - e3b8f9f2fad29727dfa95e766c5cac18ea1414bf
  domains: []
  tools: []
  techniques: []
---

**像梦又似花** *2026年11月18日 09:36*

当大模型规模冲到千亿级别，单卡显存再大也会触碰到天花板。最近英伟达官方放出了一套完整的落地方案：用两台 DGX Station GB300，通过 ConnectX-8 RDMA 高速互联，基于 vLLM 张量并行跑起了 7530 亿参数的 GLM-5.3 NVFP4 量化模型，对外提供统一的 OpenAI 兼容接口。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a5851fdb09e01f5.png)

今天我们把这套官方方案拆解清楚，从架构原理、部署步骤到实测性能一次讲透。---实战内容放在后面

* * *

## 一、为什么必须跨机部署？

这次部署的主角是GLM-5.3 NVFP4，一款经过量化的混合专家（MoE）大模型：

-   总参数量：7530 亿
    
-   每 Token 激活参数：400 亿
    
-   模型权重体积：约 464 GB
    

虽然稀疏激活大幅降低了计算量，但所有权重必须常驻显存才能保证路由效率。而单块 GB300 GPU 仅配备 252 GB HBM3e 显存，哪怕是量化版本也无法完整容纳。

解决方案是张量并行（Tensor Parallelism, TP=2）：把模型的权重张量按维度切分，均匀分布到两张 GPU 上；每一步推理时，两张 GPU 各自计算部分结果，通过高速互联交换中间数据，最终合并输出。

* * *

## 二、整体架构：两台机器，一个统一接口

整套方案的硬件和软件栈非常清晰，对外只暴露一个 API 端点，上层业务完全感知不到底层是两台机器。

请在微信客户端打开

### 硬件底座

-   两台 NVIDIA DGX Station GB300
    
-   ConnectX-8 网卡 RDMA 直连，400Gbps 带宽，支持 GPU Direct RDMA
    
-   数据直接在 GPU 显存间传输，不经过 CPU 和系统内存，延迟极低
    

### 软件与角色分工

-   推理引擎：vLLM，原生支持分布式张量并行
    
-   Station A（Rank 0）：主节点，对外提供 OpenAI 兼容 API，负责请求接入与结果返回
    
-   Station B（Rank 1）：纯计算工作节点，不对外暴露接口，只参与模型计算
    
-   每台机器各承担约一半的权重存储与计算量

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2551f884cde9667b.png)
    

图1. 两个节点服务于同一个模型：每个GPU负责在选定的RDMA连接上存储和计算模型的一部分数据。它们的内存仍然是独立的。

### 三项核心性能优化

为了在跨机场景下仍保持高吞吐，方案中启用了 vLLM 的多项关键优化：

1.  多 Token 预测（MTP）：一种推测解码技术，每步先生成 4 个候选 Token 再校验，有效提升生成吞吐量
    
2.  FP8 KV 缓存：相比传统 FP16 缓存，显存占用减半，可容纳更长上下文与更多并发请求
    
3.  前缀缓存：重复的提示词前缀无需重复计算，多轮对话、同类请求场景下收益显著
    

* * *

## 三、部署全流程：五步跑通分布式推理

官方给出了完整的可复现步骤，我们提炼成 5 个核心阶段，适合技术团队参考落地。

### 第一步：环境与组网校验

两台机器分别完成基础环境检查：

-   确认 Docker 与 NVIDIA Container Toolkit 正常可用
    
-   验证 RDMA 链路状态、网卡名称、IP 地址
    
-   测试巨帧 ping 连通性、时间同步、GPU 状态
    
-   配置主节点到从节点的 SSH 免密登录，用于后续模型同步
    

### 第二步：模型下载与同步

1.  在主节点通过 Hugging Face 下载 GLM-5.3 NVFP4 权重（约 464 GB）
    
2.  通过 rsync 将模型完整同步到从节点，确保两边文件完全一致
    
3.  校验文件清单、结构与配置字段，确认模型完整性
    

> 张量并行要求两边运行完全相同的软件版本与权重文件，一致性校验是避免诡异报错的关键。

### 第三步：编写启动配置

两台机器分别写入环境配置文件，定义：

-   节点角色（Rank 0 / Rank 1）
    
-   主从节点 IP、RDMA 网卡与设备名
    
-   模型路径、容器镜像、端口等通用参数
    

### 第四步：启动分布式服务

启动顺序有讲究：先启从节点，再启主节点。

-   从节点以无头模式启动，等待主节点连接
    
-   主节点启动后，vLLM 自动通过 NCCL 建立分布式通信组
    
-   两边分别加载一半权重，预热内核、捕获 CUDA 图
    
-   主节点日志输出 `Application startup complete` 即代表服务就绪
    

### 第五步：健康检查与验证

1.  调用健康检查接口，确认主节点 API 正常响应
    
2.  检查 NCCL 日志，确认走的是 GPU Direct RDMA 而非 TCP 回退
    
3.  发送测试对话请求，验证输出正常、结束标志正确
    
4.  查看 nvidia-smi，确认两边各有约 231 GB 显存用于权重，验证模型切分正确
    

* * *

请在微信客户端打开

## 四、实测性能：并发16时吞吐峰值607.8 token/s

官方使用 AIPerf 工具，基于 SPEED-Bench Coding 数据集（80 段编程对话）做了完整压测，全程开启前缀缓存、MTP 推测解码与 FP8 KV 缓存。(下表怎么来的往下看就知道了)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0a89083dd319e9c5.png)

| 配置并发数 | 总吞吐量 (token/s) | 平均请求延迟 (s) | 首 Token 延迟 (ms) | 单 Token 间隔 (ms) |
| --- | --- | --- | --- | --- |
| 1   | 107.4 | 49.84 | 479.75 | 8.78 |
| 8   | 386.0 | 114.17 | 433.79 | 19.01 |
| 16  | 607.8 | 136.46 | 482.90 | 23.77 |
| 32  | 385.0 | 453.54 | 899.36 | 77.90 |

### 关键结论

-   吞吐量峰值出现在并发 16 的位置，达到 607.8 token/s
    
-   并发提升到 32 时，吞吐量不升反降，KV 缓存与调度开销成为瓶颈，请求延迟大幅上升
    
-   单请求场景首 Token 延迟不到 500ms，生成速度约 110 token/s，体验流畅
    
-   前缀缓存对真实业务场景的吞吐提升贡献显著
    

* * *

## 五、适用场景与落地建议

这套方案最适合以下场景：

-   需要本地部署超大参数模型，数据敏感不能上云
    
-   单卡 / 单机显存无法容纳模型规模
    
-   对推理延迟、吞吐量有较高要求的企业级内部服务
    

### 几个落地避坑提示

1.  网络是跨机并行的生命线：必须用 RDMA 高速互联，普通 TCP 网络会让通信延迟成为主要瓶颈，性能大幅下降
    
2.  并发不是越高越好：根据显存与业务延迟要求，找到最优并发点，盲目堆并发反而会降低吞吐
    
3.  张量并行适合小规模扩展：2~8 卡规模优先用张量并行；更大规模建议结合流水线并行、专家并行做分层拆分
    

上面的概念看完了，该动手进入实战环节

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e6f95a1210ac4c6b.png)

实战环节(Nvidia官方)

## 步骤 1：准备两个站点

本教程使用一台独立的计算机（例如笔记本电脑）来管理这两个站点。首先，从该计算机分别打开与每个站点的 SSH 连接。或者，也可以在每个站点上使用本地终端进行操作。在这一步中，需要在两个站点上执行所有的命令，除非这些命令以“On A.”开头。

这两个站点运行着相同的容器和检查点，但职责不同：站点 A（等级为 0）负责托管 API，而站点 B（等级为 1）仅作为工作节点运行，没有独立的 API 服务器。

* * *

## 首先，检查 Docker 访问权限，并收集之后会使用的网络信息：

```nginx
docker version
ibdev2netdev
ip -br addr
```

注意：如果 `docker version` 的输出中没有 `Server` 部分，那么客户端就无法与 Docker 守护进程进行通信。如果出现 `permission denied` 错误，请按照 Docker 安装后的操作进行修复：使用 `sudo usermod -aG docker "$USER"` 命令将用户添加到 `docker` 组中，然后运行 `exit` 命令。之后重新连接设备并再次运行 `docker version` 命令。 `docker` 组拥有 root 级别的权限。

在 `ibdev2netdev` 中，列出了两个直接使用的路径： `cx8r0` 和 `cx8r1` 。可以选择其中一个来处理流量，比如 `cx8r1` 。同时，需要在每个站点上为它记录两件事：

-   **Its RDMA device**
    
    在 `ibdev2netdev` 行中，这是一个 RDMA 设备，该行的末尾是轨道的名称。而在 `mlx5_1 port 1 ==> cx8r1 (Up)` 行中，这个设备的名称是 `mlx5_1` 。
    
-   **Its IPv4 address**
    
    它的 IPv4 地址位于以铁路名称开头的 `ip -br addr` 行中。而在 `cx8r1 UP 192.168.101.1/24` 行中，地址则被标记为 `192.168.101.1` 。
    

这两个站点使用的铁路名称和设备都是相同的；唯一的区别是在 IPv4 地址上有所不同。

接下来，在每个站点上创建 `~/glm53.env` 。这个文件存储了后续命令所使用的数值。

```bash
nano ~/glm53.env
```

请粘贴以下文本，并将每个 `<...>` 的占位符替换为你记下的数值，注意保持引号的保留。

```makefile
RANK="<NODE_RANK>"                    # RANK="0" on Station A, RANK="1" on Station B 
HEAD_IP="<STATION_A_IPV4_ADDRESS>"    # IPv4 address you noted on Station A; same in both files
WORKER_IP="<STATION_B_IPV4_ADDRESS>"  # IPv4 address you noted on Station B; same in both files
RAIL_IFACE="<RAIL_NAME>"              # Rail you picked, for example cx8r1; same in both files
RAIL_HCA="<RDMA_DEVICE>"              # RDMA device you noted, for example mlx5_1; same in both files

IMG=vllm/vllm-openai:v0.30.0-aarch64
IMG+=@sha256:4864d46625cbc3307623e29ac742030655e27249feba7b97ec925ce4cc4dfb56
MODEL_REPO=nvidia/GLM-5.3-NVFP4
MODEL_REV=e3b8f9f2fad29727dfa95e766c5cac18ea1414bf
MODEL_HOST="$HOME/models/GLM-5.3-NVFP4"
CONTAINER=glm53-full
PORT=8000

if [ "$RANK" = 0 ]; then
  NODE_IP=$HEAD_IP; PEER_IP=$WORKER_IP
else
  NODE_IP=$WORKER_IP; PEER_IP=$HEAD_IP
fi

GPU_UUID=$(nvidia-smi --query-gpu=uuid,name --format=csv,noheader |
  awk -F, '$2 ~ /GB300/ {gsub(/ /,"",$1); print $1; exit}')
```

例如，使用默认的地址 `cx8r1` 时，站点 A 的文件结构是这样的。站点 B 的文件结构也相同，只是 `RANK="1"` 的位置有所不同。

```ini
RANK="0"
HEAD_IP="192.168.101.1"
WORKER_IP="192.168.101.2"
RAIL_IFACE="cx8r1"
RAIL_HCA="mlx5_1"
```

## MODEL_HOST 是从你的主目录构建的，而步骤 2 则通过 SSH 将检查点复制到 B 站的同一路径中。

## 注意：后续的操作都从 source ~/glm53.env 开始，这些数值需要被加载到程序中。每次打开新的 SSH 会话时，都请再次执行此命令。

## 在两个站点上，都请填入相关数值，并检查存储情况、连接状况以及基础内存使用情况：

```bash
source ~/glm53.env
mkdir -p "$MODEL_HOST" && df -h "$MODEL_HOST"
ethtool "$RAIL_IFACE"
ip link show dev "$RAIL_IFACE"
ping -I "$RAIL_IFACE" -M do -s 8972 -c 3 "$PEER_IP"
timedatectl show -p NTPSynchronized --value
nvidia-smi
```

## 这些检查能够在布线设置和地址分配出现错误之前将其捕捉到，从而避免出现 NCCL 超时问题。预计会看到 400000Mb/s 这样的链接，MTU 为 9000，成功发送了巨型帧 ping，时间同步也正常。 nvidia-smi 在 GB300 上应该不会出现计算进程。在配备了显示 GPU 的站台上，Xorg 可能会同时出现在两个 GPU 上，占用一些内存空间。

## 提示：请注意 nvidia-smi 所显示的 GPU 内存使用情况；第四步会将实际内存使用情况与模型加载后的内存使用情况进行比较。

## 2\. 通过 SSH 将检查点从 A 复制到 B。因此，A 需要无密码访问 B。在 A 上，创建一个没有密码短语的密钥（详情请参阅关于 SSH 密钥的部分）。在确认了 B 的主机指纹后，将它的公共密钥复制到 B 上，然后确认登录成功：

```bash
ssh-keygen -t ed25519
ssh-copy-id "$WORKER_IP"
ssh -o BatchMode=yes "$WORKER_IP" hostname
```

## 步骤 2：下载并复制该模型

## 张量并行性要求两个处理节点能够使用相同的软件来处理相同的权重数据。首先，在两个节点上同时加载固定的图像：

```nginx
docker pull "$IMG" &&
docker image inspect "$IMG" --format '{{.Architecture}} {{.RepoDigests}}'
```

## 这个过程可能需要几分钟的时间。通过匹配 arm64 摘要，可以确保两个等级运行相同的软件。

## 在 A 点上，下载固定的检查点文件。该文件的大小约为 464GB，下载时间大约为 1 小时，当下载速度为 1GB/s 时；或者大约 6 分钟，当下载速度为 10GB/s 时。

```bash
mkdir -p "$MODEL_HOST"
docker run --rm --network host -v "$MODEL_HOST:/model" \
  --entrypoint bash "$IMG" -lc \
  "exec hf download '$MODEL_REPO' --revision '$MODEL_REV' --local-dir /model"
```

## 当 hf download 打印出 Downloaded 时，请将文件复制到 B 盘上。在 A 盘上：

```nginx
ssh "$WORKER_IP" "mkdir -p '$MODEL_HOST'" &&
rsync -aH --info=progress2 --exclude '.cache/' \
  "$MODEL_HOST/" "$WORKER_IP:$MODEL_HOST/"
```

## 每个磁盘都保存了完整的检查点数据；在加载数据时，vLLM 会将权重分布到各个 GPU 上，而无需进行进一步的量化处理。

## 在 A 阶段，比较这两份副本（通过 SSH 方式对 B 的文件列表进行比对）。然后验证这个检查点是否准确无误：

```bash
(
  set -euo pipefail
  L=$(find "$MODEL_HOST" -path '*/.cache' -prune -o \
    -type f -printf '%P %s\n' | LC_ALL=C sort | sha256sum)
  R=$(ssh "$WORKER_IP" "set -o pipefail; find '$MODEL_HOST' \
    -path '*/.cache' -prune -o -type f -printf '%P %s\\n' | \
    LC_ALL=C sort | sha256sum")
  test "$L" = "$R"
  test "$(find "$MODEL_HOST" -maxdepth 1 \
    -name 'model-*-of-00050.safetensors' | wc -l)" = 50
  python3 -c "import json; c=json.load(open('$MODEL_HOST/config.json')); \
assert c['architectures']==['GlmMoeDsaForCausalLM']; \
assert c['quantization_config']['quant_algo']=='MIXED_PRECISION'"
  echo MODEL_READY
)
```

## MODEL_READY 表示两个站点的文件名和大小都符合预期的要求。 MIXED_PRECISION 则指的是：NVFP4 量化目标中，每个张量的权重和激活函数都是 MoE 块的线性形式，而不是每个张量都采用这种形式。

## 步骤 3：启动分布式服务。

## 这一步骤将两台机器合并为一台服务：相同的启动脚本会在两台机器上运行，读取 ~/glm53.env 数据，并分别在每台机器上启动一个 vLLM 推理器。在进行调整时，有两个设置非常重要： --max-model-len 98304 ，即令牌数量上限，这个数值需要涵盖输入和输出； --gpu-memory-utilization 0.93 ，即 vLLM 可以占用 93%的 GPU 内存。如果你修改了其他参数，请逐一进行更改并重新测试。

## 有关最新的推荐配置信息，请参考 NVIDIA 的本地 AI 配置指南文档。

## 安全提示： --host 0.0.0.0 与 --network host 的连接使得每个 Station A 接口的未认证 API 都暴露了出来，包括管理功能。请将该端口进行防火墙保护，仅允许目标客户端访问；在实现更广泛的访问权限之前，请先添加认证和 TLS 加密机制。

## 在两个站点上，都创建一个名为 ~/launch-glm53.sh 的文件。

```bash
nano ~/launch-glm53.sh
```

## 该脚本支持多令牌预测功能，这是一种推测性解码方式：模型的 MTP 层在每一步会生成四个令牌，而 vLLM 会在接受这些令牌之前通过完整模型进行验证。因此，每一步都可以产生多个令牌。这种机制的收益取决于令牌被接受的频率，而这一频率会随着提示的不同而有所变化。

## FP8 的 KV 缓存存储容量是 16 位存储的一半，因此能够容纳更多的令牌。启用了前缀缓存功能，这样可以避免服务器需要重新处理那些已经见过的提示前缀。请粘贴以下脚本；该脚本会检查您的配置，找到所选铁路的 RoCE GID 索引，然后开始在容器中启动此站点的 vLLM 排名功能。

```bash
set -euo pipefail
source "$HOME/glm53.env"
case "$RANK" in 0|1) ;; *) echo "Invalid RANK" >&2; exit 1;; esac
test -n "$GPU_UUID"
test -f "$MODEL_HOST/config.json"
GID_INDEX=$(/usr/sbin/show_gids 2>/dev/null |
  awk -v d="$RAIL_HCA" -v ip="$NODE_IP" \
  '$1==d && $5==ip && $6=="v2" {g=$3} END {if(g!="") print g}')
test -n "$GID_INDEX"
HEADLESS=
if [ "$RANK" = 1 ]; then HEADLESS=--headless; fi
SPEC_CONFIG='{"method":"mtp","num_speculative_tokens":4}'
KERNEL_CONFIG='{"enable_flashinfer_autotune":false,"moe_backend":"flashinfer_cutlass"}'
COMPILE_CONFIG='{"cudagraph_mode":"FULL_DECODE_ONLY","cudagraph_capture_sizes":[5,10,20,40,80],"pass_config":{"fuse_allreduce_rms":false}}'

docker run -d --name "$CONTAINER" \
  --gpus device="$GPU_UUID" --network host --ipc host --shm-size 32g \
  --device /dev/infiniband --cap-add IPC_LOCK \
  --ulimit memlock=-1 --ulimit stack=67108864 \
  -v "$MODEL_HOST:/model:ro" \
  -e RANK="$RANK" -e HEADLESS="$HEADLESS" \
  -e MASTER_ADDR="$HEAD_IP" -e MODEL_REPO="$MODEL_REPO" -e PORT="$PORT" \
  -e SPEC_CONFIG="$SPEC_CONFIG" -e KERNEL_CONFIG="$KERNEL_CONFIG" \
  -e COMPILE_CONFIG="$COMPILE_CONFIG" \
  -e NCCL_CUMEM_ENABLE=1 -e NCCL_IB_HCA="$RAIL_HCA" \
  -e NCCL_IB_GID_INDEX="$GID_INDEX" \
  -e NCCL_IB_TIMEOUT=22 -e NCCL_IB_RETRY_CNT=7 \
  -e VLLM_ALLREDUCE_USE_FLASHINFER=0 -e VLLM_ALLREDUCE_USE_SYMM_MEM=0 \
  -e NCCL_SOCKET_IFNAME="$RAIL_IFACE" -e GLOO_SOCKET_IFNAME="$RAIL_IFACE" \
  -e NCCL_NET_GDR_LEVEL=5 -e NCCL_DEBUG=INFO -e NCCL_DEBUG_SUBSYS=INIT,NET \
  -e NCCL_DEBUG_FILE='/tmp/nccl_%h_%p.log' -e VLLM_HOST_IP="$NODE_IP" \
  -e VLLM_EXECUTE_MODEL_TIMEOUT_SECONDS=1800 \
  -e PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
  -e VLLM_ALLOW_LONG_MAX_MODEL_LEN=1 -e FLASHINFER_DISABLE_VERSION_CHECK=1 \
  --entrypoint bash "$IMG" -lc '
    set -euo pipefail  
    # Use NCCL 2.30.7 from the image: older versions can deadlock
    # cross-node CUDA graph replays over RoCE (vLLM issue #52504).
    export VLLM_NCCL_SO_PATH=$(python3 -c "import nvidia.nccl,os;
print(os.path.join(list(nvidia.nccl.__path__)[0], \"lib\", \"libnccl.so.2\"))")
    test -f "$VLLM_NCCL_SO_PATH"
    EXTRA=()
    if [ -n "$HEADLESS" ]; then EXTRA+=("$HEADLESS"); fi
    exec vllm serve /model --served-model-name "$MODEL_REPO" \
      --host 0.0.0.0 --port "$PORT" \
      --nnodes 2 --node-rank "$RANK" --master-addr "$MASTER_ADDR" \
      --master-port 29501 --tensor-parallel-size 2 \
      --speculative-config "$SPEC_CONFIG" \
      --max-model-len 98304  --max-num-batched-tokens 8192 \
      --block-size 128 --max-num-seqs 16 \
      --trust-remote-code --disable-custom-all-reduce \
      --kv-cache-dtype fp8 --enable-prefix-caching \
      --gpu-memory-utilization 0.93 \
      --enable-prompt-tokens-details \
      --kernel-config "$KERNEL_CONFIG" --compilation-config "$COMPILE_CONFIG" \
      --distributed-timeout-seconds 1800 \
      --enable-auto-tool-choice --tool-call-parser glm47 --reasoning-parser glm47 \
      "${EXTRA[@]}"
  '
```

## 先在 B 上运行该脚本，然后再在 A 上运行。

```bash
bash ~/launch-glm53.sh
```

## 每个命令都会打印出一个容器 ID，并立即返回结果；此时服务尚未完全就绪。B 的 worker 正在等待 A 的加入，然后每个站点都会从本地存储中加载属于自己的权重数据，准备内核代码，并捕获 CUDA 图形数据。这个过程需要几分钟的时间。

## 在 A 阶段，请跟随日志文件，了解服务何时可以投入使用（ --since 会隐藏之前运行时的输出信息）：

```python
docker logs --follow --since "$(docker inspect \
  --format '{{.State.StartedAt}}' "$CONTAINER")" "$CONTAINER"
```

## 当日志显示 Application startup complete 时，按 Ctrl+C 停止跟踪该日志；不过，服务仍然会继续运行。

## 在此时，一个模型需要运行在两台机器上。每台 GPU 都持有完整的副本，但任何一方都无法单独处理请求：所有的数据都需要通过 RoCE 协议在双方之间交换，才能得出最终结果。

## 剩余的 GPU 内存中存有 KV 缓存，用于存储正在处理的请求上下文信息。启动日志中显示了该缓存的容量（即 GPU KV 缓存的大小）。所有正在处理的请求都会共享这一缓存资源，因此较长的提示信息或更多的用户会消耗更多的缓存空间。如果缓存不足，请减少请求数量或降低并发请求数。

## 步骤 4：验证服务是否正常，然后发送请求。

## 关于 A，请检查 API 的配置（ 127.0.0.1 就是 A 本身）：

```bash
docker exec "$CONTAINER" curl -fsS --max-time 10 \
  "http://127.0.0.1:$PORT/health" >/dev/null && echo HEALTH_OK
```

## HEALTH_OK 证明了 A 站是正确的答案。接下来，需要在两个站上确认：通信数据是通过 GPU RDMA 协议进行的，而不是使用 TCP 套接字。这一检查是通过 NCCL_DEBUG=INFO 读取 NCCL 日志来完成的，而同一块内存也显示了所加载的数据。

```swift
docker exec "$CONTAINER" bash -lc '
  set -euo pipefail
  files=(/tmp/nccl_*.log)
  test -e "${files[0]}"
  grep -hE "NET/IB.*GDRDMA|GPU Direct RDMA Enabled" "${files[@]}" >/dev/null
  grep -hF "$NCCL_IB_HCA" "${files[@]}" >/dev/null
  if grep -hE "NET/Socket|NCCL WARN|NCCL ERROR" "${files[@]}"; then
    exit 1
  fi
  echo RDMA_CHECK_OK
'
nvidia-smi
```

## RDMA_CHECK_OK 表示检查通过，没有出现警告。在 nvidia-smi 中，A 表示 VLLM::Worker_TP0 进程，而 B 表示 VLLM::Worker_TP1 进程，每个 GPU 对应一个处理线程。启动日志显示，每个 GPU 负责处理约 218 GiB 的数据，这大约是检查点数据的一半，这说明模型确实被分到了两个 GPU 上进行处理。

| Measurement 测量 | Station A 车站 A | Station B 车站 B |
| --- | --- | --- |
| GB300 GPU used (GiB) 使用的 GB300 GPU 存储容量：GiB | 0.01 → 231.35 | 0.00 → 231.34 |

*表 1. 在模型加载之前和之后，GPU 内存的使用情况。数据包括权重、KV 缓存以及运行时的缓冲区。*

请在微信客户端打开

## 在 A 上，通过支持 OpenAI 的 API 发送一个聊天请求：

```swift
docker exec "$CONTAINER" curl -fsS --max-time 120 \
  "http://127.0.0.1:$PORT/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{"model":"nvidia/GLM-5.3-NVFP4",
    "messages":[{"role":"user","content":"Quarterly units sold: Q1 = 120; Q2 = 180; Q3 = 150. Summarize the trend in one sentence and calculate the percentage change from Q1 to Q2."}],
    "temperature":0,"max_tokens":4096,
    "chat_template_kwargs":{"reasoning_effort":"low"}}' |
python3 -c 'import json,sys; c=json.load(sys.stdin)["choices"][0];
print(c["message"]["content"]); print("finish_reason:",c["finish_reason"])'
```

## 回复返回应该如下所示：

```markdown
**Trend:** Units sold rose sharply in Q2 before partially declining in Q3, remaining above the Q1 level.
**Q1 → Q2 percentage change:** (180 - 120) / 120 × 100 = **50% increase**
finish_reason: stop
```

## finish_reason: stop 表示模型已经完成了回答，而不是达到了令牌限制。该请求将在 chat_template_kwargs 中将 reasoning_effort 的值设置为 low 。GLM-5.3 还接受 high 和 max 作为参数，这使得模型可以在更长的时间内进行推理，不过这会增加延迟。因为启动器支持工具调用 ( --enable-auto-tool-choice )，所以使用 OpenAI 工具 API 的代理框架可以调用相同的端点。

## 步骤 5：并发处理与资源释放

## AIPerf 是 NVIDIA 提供的用于推理端点的性能测试工具，它能够衡量系统的吞吐量和延迟情况。在将 AIPerf 安装到服务容器中时，可能会改变 vLLM 的依赖关系。因此，在 A 平台上使用时，建议将 AIPerf 安装在其独立的虚拟环境中。

```bash
sudo apt update &&
sudo apt install -y python3.12-venv python3.12-dev build-essential &&
python3.12 -m venv "$HOME/.venvs/aiperf-0.12.0" &&
"$HOME/.venvs/aiperf-0.12.0/bin/pip" install 'aiperf==0.12.0' &&
"$HOME/.venvs/aiperf-0.12.0/bin/pip" check
```

## 安装过程应以 No broken requirements found 结束。

## AIPerf 可以发送合成的提示，或者重新播放现有的数据集。本教程使用了来自 SPEED-Bench 的 80 个编码对话场景，这些场景都是为评估推测性解码而设计的真实提示。因此，在测量 MTP 时，我们会使用真实的文本数据。SPEED-Bench 的准备工作脚本从多个 Hugging Face 数据集中提取这些提示，其中包括 gated cais/hle。如果你还没有这样做，请先打开该页面，选择“同意”并访问仓库，然后再继续。之后，在 A 平台上登录 Hugging Face。

```bash
"$HOME/.venvs/aiperf-0.12.0/bin/hf" auth login
```

## 接下来，需要下载并准备数据集。详情请参阅官方的 AIPerf 指南：

```bash
SPEED_BENCH_DIR="$HOME/datasets/speed-bench"
mkdir -p "$SPEED_BENCH_DIR"
curl -fLsS https://raw.githubusercontent.com/NVIDIA-NeMo/Skills/refs/heads/main/nemo_skills/dataset/speed-bench/prepare.py | \
  "$HOME/.venvs/aiperf-0.12.0/bin/python" - --config qualitative --output_dir "$SPEED_BENCH_DIR"
```

## 在 A 点上，检查数据集和服务状况。如果检查结果显示正常，则继续操作；否则请暂停并查看详细信息 BENCHMARK_READY 。

```sql
(
  set -euo pipefail
  source ~/glm53.env
  curl -fsS "http://$HEAD_IP:$PORT/health" >/dev/null
  "$HOME/.venvs/aiperf-0.12.0/bin/python" - <<'PY_CHECK'
import json
from pathlib import Path
root = Path.home()
path = root / "datasets/speed-bench/qualitative.jsonl"
assert path.exists(), "Dataset missing: rerun the SPEED-Bench preparation"
rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
coding = [row for row in rows if row["category"] == "coding"]
assert len(coding) == 80, "Expected 80 Coding conversations"
assert sum(len(row["messages"]) for row in coding) == 89
assert all("FULL BENCHMARK DATA SHOULD BE FETCHED" not in message["content"]
           for row in coding for message in row["messages"])
print("BENCHMARK_READY: dataset has 80 Coding conversations, 89 turns in total.")

PY_CHECK
)
```

## 整个测试涵盖了 1、8、16 和 32 个并发级别。在每个级别中，AIPerf 会发送 3×C 次热身请求，然后测量 10×C 次实际请求的情况，其中 C 表示并发级别。在更高的并发级别下，某些会话会被多次发送。

## 基准测试要求模型使用默认的推理强度（最大强度），并且输出结果的最大数量为 8,192 个令牌；响应结果可能在达到最大输出数量之前就完成。完整的扫描操作可能需要几个小时的时间。

## 两小时的请求超时时间为冗长的响应提供了空间。 --server-metrics 负责收集用于衡量 MTP 接受度的服务器计数器信息，而 --export-level raw 则负责保存每一条响应结果以供检查。

## 为了进行快速测试，请在 A 环境中运行下面的代码块，同时确保两个容器都在运行，并且没有其他 API 流量干扰。该测试针对的是启用了前缀缓存的 C1 和 C8 节点，具体配置与表 2 中的参考测量数据一致。

```bash
(
  set -euo pipefail
  source ~/glm53.env
  CODING_DATASET="$HOME/datasets/speed-bench/qualitative.jsonl"
  test -f "$CODING_DATASET"
 export CONCURRENCIES=${CONCURRENCIES:-"1 8"} # Quick run: C1 and C8.
  # Optional full benchmark: follow the reproduction instructions below.
  # Step 3: --max-num-seqs 16 -> export CONCURRENCIES="1 8 16"
  # Step 3: --max-num-seqs 32 -> export CONCURRENCIES=32

  RUN_DIR="$HOME/aiperf-results/blog-coding-$(date +%Y%m%d-%H%M%S)"
  for C in $CONCURRENCIES;  do
    ART="$RUN_DIR/c$C"
    env -u HF_HUB_OFFLINE -u TRANSFORMERS_OFFLINE \
      "$HOME/.venvs/aiperf-0.12.0/bin/aiperf" profile \
      -m "$MODEL_REPO" --url "http://$HEAD_IP:$PORT" \
      --endpoint-type chat --streaming --tokenizer "$MODEL_HOST" \
      --custom-dataset-type speed_bench_coding --input-file "$CODING_DATASET" \
      --request-count "$((10 * C))" --warmup-request-count "$((3 * C))" \
      --osl 8192 \
      --use-server-token-count --concurrency "$C" --random-seed 42 \
      --request-timeout-seconds 7200 \
      --server-metrics "http://$HEAD_IP:$PORT/metrics" \
      --export-level raw --artifact-dir "$ART"
    printf "Results: %s\n" "$ART"
  done
  printf "Results directory: %s\n" "$RUN_DIR"
)
```

## AIPerf 将各种指标、原始响应数据以及日志文件保存在结果目录中。预热请求不会被计入报告的指标数据中。

## 可选：重新执行表 2 中的操作。在步骤 3 中，同时在两个站点上执行 ~/launch-glm53.sh 操作，保留 --enable-prefix-caching ，并将 --max-num-seqs 设置为 16 或 32，以匹配上述注释中的相应组。在每个组执行之前，先停止并在 A 站点移除当前的容器，然后执行 docker stop --timeout 60 "$CONTAINER" 和 docker rm "$CONTAINER" 操作。在 B 站点重新启动更新后的脚本，然后使用 bash 执行 ~/launch-glm53.sh 操作，并等待 Application startup complete 事件的触发。在 A 站点，执行注释中的匹配命令 export CONCURRENCIES ，然后重新运行 AIPerf 模块。

## 为了测试无前缀缓存的情况，需要在两个站点的第三步脚本中，将 --enable-prefix-caching 替换为 --no-enable-prefix-caching 。然后像上面那样重新创建容器。性能可能会与表 2 中的结果有所不同。

## 图 2 比较了各种测量请求的整体输出吞吐量以及每位用户的平均吞吐量。令牌计数部分也包含了相关的计算过程。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0f635545527f977e.png)

## 图 2 展示了在 SPEED-Bench Coding 平台上，启用前缀缓存功能时，整体输出吞吐量与每个用户的平均吞吐量之间的关系。其中，C1、C8、C16 和 C32 分别表示不同的并发配置水平。

## 下表展示了，随着更多请求共享同一服务，吞吐量和延迟会如何发生变化。

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| **Configured concurrency** 配置的并发能力 | **Overall throughput 总体吞吐量**<br><br>**(tok/s) （ Tok/S ）** | **Mean request latency 请求延迟时间**<br><br>**(s)** | **Mean TTFT 意思是 TTFT**<br><br>**(ms) （女士）** | **Mean inter-token latency 平均交互延迟时间**<br><br>**(ms/token) （女士/代币）** |
| 1   | 107.4 | 49.84 | 479.75 | 8.78 |
| 8   | 386.0 | 114.17 | 433.79 | 19.01 |
| 16  | 607.8 | 136.46 | 482.90 | 23.77 |
| 32  | 385.0 | 453.54 | 899.36 | 77.90 |

## 表 2. SPEED-Bench 编码的结果：启用了前缀缓存功能，每步处理四个 MTP 草稿令牌，并使用了 FP8 KV 缓存。延迟指标为所有测量请求的平均值；热身阶段的数据被排除在外。TTFT 指标指的是到达第一个令牌所需的时间，这也可能涉及推理过程。

## 在 C16 时，总吞吐量达到最高值，为 607.8 Tok/s。而在 C32 时，吞吐量下降到 385.0 Tok/s。此时，平均请求延迟为 453.5 秒。更高的并发水平还会降低每用户的吞吐量，从 C1 时的 115.3 Tok/s 降至 C32 时的 13.0 Tok/s。

## 当所有请求处理完成后，停止位于 A 上的 vLLM 容器，然后停止位于 B 上的容器。

```bash
docker stop --timeout 60 "$CONTAINER"
docker inspect --format \
  'Status={{.State.Status}} Running={{.State.Running}}' "$CONTAINER"
nvidia-smi
```

## 当前状态应为 Status=exited Running=false ，且 nvidia-smi 中没有 vLLM 进程；检查点、容器和结果都保存在磁盘上。要恢复操作，请依次在 B 和 A 上运行 docker start "$CONTAINER" ，然后重复步骤 4 中的检查。

## 解决常见的阻塞问题：

-   缺少变量或 SSH 连接失败：在重新连接后 `source ~/glm53.env` 条命令执行失败；请确认从 A 到 B 的密钥认证以及 B 的指纹是否正确。
    
-   SPEED-Bench 的准备工作出现错误，提示“有相关的数据集未被正确识别”。请使用同一账号登录 Hugging Face，打开 cais/hle 页面，选择“同意并访问仓库”，然后重新运行准备工作。
    
-   创业公司或 RDMA 检查失败：请检查两个节点上的 `docker logs "$CONTAINER"` ；确认检查点及 GID 的正确性，然后重新运行 playbook 的验证脚本（脚本 07）。
    
-   CUDA 资源不足：请降低 `--max-model-len` 的并发度，或尝试重新测试。
    

实战结语：

现在，你拥有一个拥有 753 亿参数的模型，该模型在两个 NVIDIA DGX 站点上的本地 API 中运行，每个权重都存储在 GPU 内存中。这使得那些在托管端点上难以实现的任务成为可能：对敏感或专有数据进行推理处理、在本地原型化智能体，以及无需为每个标记付出成本即可迭代优化提示词。

使用 vLLM 服务文档来连接你的应用程序，然后重新运行 AIPerf，结合你的提示来找到适合你工作负载的并发级别。现在，一个面向前沿应用的模型已经准备好可以开始了，你可以立刻在桌旁开始构建它了。

## 最后

从单卡到跨机，本质是大模型规模增长带来的必然趋势。vLLM + RDMA + 张量并行的组合，已经把跨机分布式推理的落地门槛降到了非常低的水平——两台工作站、一条高速链路，就能跑起 7530 亿参数的前沿模型。

对于需要本地部署超大规模模型、又不想直接上马整柜算力的团队来说，这是一条非常务实的过渡路径。

你还想看哪类大模型部署的实战拆解？欢迎在评论区留言~

技术分享 · 目录
