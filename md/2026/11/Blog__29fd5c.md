---
title: Blog
source: https://www.thezdi.com/blog/2026/11/17/hostile-inference-exploiting-docker-model-runner-for-container-escapes
source_host: www.thezdi.com
clip_date: 2026-11-19T09:03:10+08:00
trace_id: 1f62e6b6-bfd5-48e3-b81c-02e5d6bd8520
content_hash: 0057f6352892ddb2556f6ee68ffebed2bef09135c2ab3a34315e9c9e0b049f76
status: synced
tags: []
series: null
feed_source: ZDI Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-818a-b3f5-d68146dbbd72
ioc:
  cves:
    - CVE-2026-28400
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Local LLM inference is seeing adoption in default developer workflows, and the tooling that serves those models now ships inside products developers already trust. One of those is Docker Model Runner (DMR), the feature in Docker Desktop that pulls, runs, and serves models locally. In November 2025, we reported [ZDI-26-150](https://www.zerodayinitiative.com/advisories/ZDI-26-150/) / [CVE-2026-28400](https://www.cve.org/CVERecord?id=CVE-2026-28400), a denial-of-service (on macOS) stemming from an unauthenticated argument-injection vulnerability in DMR. A container created with the default set of privileges could overwrite and corrupt the Docker Desktop VM’s data disk. Further analysis, under non-default configurations, turned the same primitive into arbitrary code execution on the host, on both macOS and Windows.

In this post, we walk through the full chain: the argument-injection primitive, the host file read/write foothold it grants, how we take partial control of what gets written, and the payoff that turns a constrained file write into arbitrary code execution on the host through Docker Extensions. We then cover two further escapes we found along the way: one from an overly permissive Seatbelt sandbox configuration on macOS, and one that pivots the WSL2 VM-to-host boundary through Docker Extensions.

## Background: Docker Model Runner and the host boundary

[Docker Desktop](https://www.docker.com/products/docker-desktop/) helps run Docker containers on macOS, Windows, and Linux. Docker Desktop for Windows with Windows containers and Docker Desktop for Linux are out of scope for this blog. Since macOS and Windows don’t come with a Linux kernel to run Linux containers, Docker Desktop ships a [LinuxKit](https://github.com/linuxkit/linuxkit) VM that hosts the container runtime; on macOS the VM runs using the [Apple Virtualization Framework](https://docs.docker.com/desktop/features/vmm/#apple-virtualization-framework), while on Windows it runs under [WSL2](https://docs.docker.com/desktop/features/wsl/) by default.

Linux containers and the Docker Engine components (runc, containerd, dockerd) run in the Linux VM. Bridging the gap between the host OS and the VM is a daemon called Docker Backend: `com.docker.backend` (macOS) or `com.docker.backend.exe` (Windows). This process is responsible for managing the execution environment and brokering all inter-process communication (IPC) across the VM–OS boundary.

[DMR](https://docs.docker.com/ai/model-runner/) lets users pull, run, and serve models over OpenAI-compatible APIs using the same idioms as running containers (`docker model pull`, `docker model run`). Models are distributed as OCI artifacts through OCI-compliant registries and stored on the host. At the time of our research, DMR would create an instance of llama.cpp’s llama-server for inference tasks. DMR is compiled into the Docker Backend. The detail that makes this interesting: on macOS and Windows the inference process does not run inside the VM; it runs on the host, as a child of the Docker Backend, with the privileges of the user running Docker Desktop. Because models are, correctly, treated as untrusted input, the inference process is wrapped in an OS-native sandbox using Seatbelt on macOS and Job Objects on Windows. These are not equivalent boundaries, and that difference carries much of the weight on Windows, as we will see in a bit.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bce5d0fec27b7174.webp)

The DMR REST API is unauthenticated and reachable from any container at the container-internal DNS name `model-runner.docker.internal` over HTTP. The question we set out to answer was whether a stock container, created with no additional capabilities, flags, mounts, or privileges, could lead to a container-to-host compromise.

## The Primitive: Argument Injection in \_configure

We refer throughout to the DMR repository at [docker/model-runner@38a800](https://github.com/docker/model-runner/tree/38a800e02582964de7591aaf74953b55935e2a2a). The API is split by two prefixes, both served over `model-runner.docker.internal`:
