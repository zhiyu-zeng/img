---
title: One-Click Mobile Traffic Interception
source: https://blog.azzahid.com/posts/zero-config-mobile-security-testing-gateway/
source_host: blog.azzahid.com
clip_date: 2026-11-04T10:20:43+08:00
trace_id: 0fb37c5c-0ddc-4976-b98e-96bf27579611
content_hash: ec05ec14113801e06e68d7d2593cee3916d79268b7af69fe29813574eededa19
status: synced
tags:
  - 网络工具
  - 安全工具
series: null
feed_source: Zahid·Android安全
ai_summary: 用 Docker 容器化路由器配合 REST API 与 iptables 的 DNAT/SNAT 规则，实现网络层透明移动流量拦截，免除逐台设备配置代理的负担。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-818b-afec-eb485d775053
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 Docker 容器化路由器配合 REST API 与 iptables 的 DNAT/SNAT 规则，实现网络层透明移动流量拦截，免除逐台设备配置代理的负担。
> 
> - **架构组成：** 由三部分构成——macvlan 网络的 Docker 容器（拥有独立 MAC/IP、伪装为物理设备）、管理 iptables 规则的 REST 服务、以及将默认网关指向容器 IP 的移动设备；设备可正常 DHCP 接入。
> - **重定向原理：** 收到 API 请求后，在 PREROUTING 链添加 DNAT 规则把指定源 IP 的 TCP 流量转向分析机端口，再在 POSTROUTING 链添加 SNAT 规则确保回程流量经容器正确路由。
> - **隐蔽与调试兼顾：** 拦截在网络层透明进行，可绕过反代理检测；同时从重定向规则中排除 SSH(22)、ADB(5555)、Frida(27042) 端口，保留直连调试通道。
> - **部署要点：** 需 root 权限 Docker、Linux 宿主机及支持混杂模式的网卡；容器须以 `--privileged` 运行以操作 iptables，通过 `ROUTER_DNS`、`ROUTER_SUBNET` 等环境变量注入配置，`--restart unless-stopped` 保证重启存活。
> - **API 与运维：** 8000 端口提供 addRedirect/deleteRedirect/getRedirects 三个接口，实现拦截与正常上网的即时切换、多设备并行测试；建议用 DHCP 按 MAC 保留静态 IP，避免 IP 变动导致重定向规则失效。

Traditional mobile security testing requires configuring proxy settings on each device, manually switching between intercepted and normal modes, and reconfiguring settings when passing devices between team members. This creates overhead and breaks testing flow.

This article presents a network-level solution that eliminates device configuration entirely. A containerized router acts as an intelligent gateway, allowing teams to dynamically redirect traffic from any device to any analyst’s machine through simple API calls. Devices connect normally via DHCP while the router uses targeted iptables rules for selective interception.

The interception operates transparently at the network layer, bypassing anti-proxy detection while preserving access to debugging tools through excluded SSH, ADB, and Frida ports. Since it’s Docker-based, the setup is easily redeployable across environments with consistent configurations.

## High-Level Overview

The system consists of three components on the same network:

-   **Docker container with macvlan networking** - appears as a physical device with its own MAC and IP
-   **REST service** - manages iptables rules for dynamic traffic redirection via API calls
-   **Mobile devices** - configured to use container IP as default gateway for transparent interception

## Prerequisites

-   Docker installed with root privileges
-   Linux host machine running Docker (Ubuntu/Debian recommended for network interface management)
-   Network interface with promiscuous mode support
-   Administrative access for network modifications
-   Network subnet information (gateway IP, subnet range, available IPs)

## Network Setup

### Single Interface Configuration

```bash
# Enable promiscuous mode on your network interface
sudo ip link set dev eth0 promisc on

# Restart networking service (may cause brief disconnection)
sudo systemctl restart NetworkManager

# Create Docker macvlan network
docker network create -d macvlan \
    --subnet=192.168.1.0/24 \
    --gateway=192.168.1.1 \
    -o parent=eth0 \
    interceptor-network
```

Replace `eth0` with your interface name and adjust subnet/gateway to match your network.

## Container Deployment

### Build the Router Image

```bash
# Clone or create project directory with source files
# Build the container image
docker build -t traffic-interceptor .
```

### Deploy the Container

```bash
# Run the interceptor container
docker run -d --privileged \
    --name traffic-interceptor \
    --network=interceptor-network \
    --ip=192.168.1.200 \
    --restart unless-stopped \
    -e ROUTER_DNS=8.8.8.8,1.1.1.1 \
    -e ROUTER_SUBNET=192.168.1.0/24 \
    traffic-interceptor
```

Key parameters:

-   `--privileged`: Required for iptables manipulation
-   `--ip`: Static IP that devices will use as gateway
-   `--restart unless-stopped`: Survives host reboots
-   `ROUTER_DNS`: DNS servers for name resolution
-   `ROUTER_SUBNET`: Network range for traffic filtering

## Device Configuration

Configure mobile devices to use the container as default gateway:

### Manual Configuration

-   **Gateway**: 192.168.1.200 (container IP)
-   **DNS**: 8.8.8.8, 1.1.1.1
-   **Subnet**: Match your network (e.g., 192.168.1.0/24)

### DHCP Server Configuration (Recommended)

Configure your DHCP server to assign the container IP as default gateway, eliminating manual device configuration. For consistency and reliable API targeting, ensure each device receives a static IP assignment through DHCP reservations based on MAC address - this prevents IP changes that would break existing redirection rules.

## How It Works

The container runs a REST service that manages iptables rules through system calls. When you make API requests, the service:

1.  **Receives REST API calls** on port 8000 for traffic redirection requests
2.  **Executes iptables commands** using sudo (configured for passwordless iptables access)
3.  **Applies DNAT rules** in the PREROUTING chain to redirect traffic from source IPs
4.  **Applies SNAT rules** in the POSTROUTING chain to ensure return traffic routes correctly

### Traffic Redirection Mechanism

When adding a redirect rule, the system creates two iptables rules:

```bash
# Redirect incoming traffic from source IP to destination
iptables -t nat -A PREROUTING -p tcp -s <srcIp> -j DNAT --to-destination <destIp>:<destPort>

# Ensure response traffic returns via the container
iptables -t nat -A POSTROUTING -p tcp -d <destIp> --dport <destPort> -j SNAT --to-source <containerIP>
```

The container preserves access to debugging ports (SSH:22, ADB:5555, Frida:27042) by excluding them from redirection rules, allowing researchers to maintain direct access to devices.

## API Usage

The container exposes a REST API on port 8000 for traffic management:

### Redirect Traffic

```bash
curl -X POST http://192.168.1.200:8000/api/router/addRedirect \
  -H "Content-Type: application/json" \
  -d '{
    "srcIp": "192.168.1.150",
    "destIp": "192.168.1.100",
    "destPort": 8080
  }'
```

Redirects all traffic from device `192.168.1.150` to analysis tools on `192.168.1.100:8080`.

### Remove Redirection

```bash
curl -X DELETE http://192.168.1.200:8000/api/router/deleteRedirect \
  -H "Content-Type: application/json" \
  -d '{
    "srcIp": "192.168.1.150",
    "destIp": "192.168.1.100",
    "destPort": 8080
  }'
```

### List Active Redirections

```bash
curl http://192.168.1.200:8000/api/router/getRedirects
```

## Workflow Integration

The system enables seamless testing workflows:

1.  **Device Assignment**: Devices connect normally and auto-route through container
2.  **Traffic Redirection**: API calls redirect specific devices to analysis workstations
3.  **Dynamic Switching**: Instantly toggle between intercepted and normal internet access
4.  **Team Collaboration**: Reassign devices between members without reconfiguration
5.  **Parallel Testing**: Run multiple simultaneous interception sessions

## Troubleshooting

### Container Connectivity Issues

```bash
# Test container network connectivity
docker exec -it traffic-interceptor ping 8.8.8.8

# Check container logs
docker logs traffic-interceptor

# Verify interface supports promiscuous mode
```

### Device Communication Problems

```bash
# Check iptables rules
docker exec -it traffic-interceptor iptables -t nat -L

# Verify no IP conflicts with existing devices
```

### API Access Issues

```bash
# Confirm API service is listening
docker exec -it traffic-interceptor netstat -tlnp | grep 8000

# Check for firewall blocks to container
```

This network-level approach transforms mobile security testing by eliminating configuration overhead and enabling dynamic, transparent traffic redirection. Teams can focus on analysis rather than proxy configurations, while the containerized solution ensures consistent, reproducible testing environments.
