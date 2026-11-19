---
title: "Why OSI Is Lying to You: A Practitioner's Network Model for the Modern Stack"
source: https://netacoding.com/posts/a-better-network-model/
source_host: netacoding.com
clip_date: 2026-11-19T09:29:52+08:00
trace_id: 7fbf8ac6-6783-473c-8abe-a2b89be47070
content_hash: 9a16c09daa22bc590a6322e23bf66865fc1a8f46520c18aa93d89dfb9ba2d90a
status: synced
tags: []
series: null
feed_source: Netacoding·协议/逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-818b-ba4e-c9d6a88a43e4
ioc: null
---

Let me start with a simple exam question.

> *To which OSI model layer do port numbers apply?* A. Network / B. Session / C. Data link / D. Transport

The correct answer is D. Transport — TCP and UDP both live at layer 4, port numbers are their addressing scheme, done. But sit with that for a second. If you answered Network, it’s not because you don’t understand networking. It’s because the question is kind of a trap. “Network” feels right when you think about ports because ports *are* how you reach services over a network. The fact that the answer requires you to distinguish between “Network (IP)” and “Transport (TCP/UDP)” is already a hint that something about the model is forcing artificial separations.

That’s the problem I want to talk about.

* * *

## The OSI Model Is a Teaching Tool, Not a Reality

The OSI model was standardized in 1984. The technology it was designed to describe wasn’t bidirectional, nested, or userspace-driven — it was clean, sequential, and relatively simple. Each layer had one job and didn’t cross into another’s territory.

So the model made sense then. Layer 3 does routing, layer 4 does transport, layer 6 does presentation. Draw your diagram, take your exam, go home.

But here’s what the model tells you that reality disagrees with:

-   Every packet goes through all 7 layers in order
-   Each layer only communicates with the one directly above and below it
-   The OS is just… infrastructure, not a layer worth naming
-   Proxies and middleware are part of the application
-   TLS lives in Presentation (layer 6)

None of that is true in 2024. Let me show you why, and then let me propose something better.

* * *

## What Actually Happens on a Modern System

Let’s trace a real HTTPS request through a modern Kubernetes service and see what it touches:

1.  A frame arrives at the NIC
2.  The driver raises an IRQ (or polls, if NAPI is active)
3.  The kernel TCP/IP stack reassembles the stream
4.  A socket bound to port 443 receives the data
5.  An Envoy sidecar intercepts it (iptables redirect or eBPF)
6.  Envoy terminates TLS, inspects headers, routes to the app container
7.  The app receives plaintext HTTP/2 or HTTP/3
8.  The app processes the request and responds

Where is the OS in the OSI model? Layer 3 and 4, kind of, but the kernel as a distinct actor — doing socket management, IRQ handling, memory copying, TCP reassembly — has no home. Where is Envoy? Layer 7? But it’s not the application. It’s between the network and the application. And where is TLS in this picture, when Envoy is terminating it before the app even sees the data?

The OSI model has no good answers to any of this.

* * *

## The Base Model

So I built a different one. Still 7 layers — not because 7 is magic, but because the real stack genuinely has this many meaningful abstraction boundaries:

```css
[ Physical / Ethernet ]     ← NIC, cable, frame
[ OS Kernel ]               ← TCP/IP stack, socket API, IRQ
                               eBPF XDP/TC hooks, io_uring, AF_XDP
[ Internal Ports ]          ← bind(), port ownership, fd
                               eBPF socket/cgroup firewalls
[ Network / IP Services ]   ← routing, DNS, NAT, port mapping
[ Proxy / Middleware ]      ← Nginx, Envoy, service mesh
[ App Protocols ]           ← HTTP, gRPC, WebSocket, QUIC, TLS, DoH
[ App ]                     ← business logic
```

The differences from OSI that matter most:

**OS Kernel is its own layer.** OSI pretends the kernel is invisible infrastructure. It’s not — it’s the layer where TCP reassembly happens, where socket buffers live, where IRQs are processed, where eBPF programs run. Any performance engineer or security researcher will tell you the kernel is a distinct actor in the stack, not a footnote.

**Proxy/Middleware is its own layer.** In 2024, Envoy is not “part of the application.” Neither is Nginx, or a service mesh ingress controller, or an API gateway. They are their own layer — they terminate TLS, route traffic, enforce policy, and they do this *between* the network and the app. Giving them their own seat in the model makes this explicit.

**Physical stays honest.** It’s NICs and frames. Nothing else needs to live there.

* * *

## Floating Layers

Here’s where the model gets interesting. Some protocols don’t stay in one place. They shift depending on where they’re deployed. I call these **floating layers**.

### TLS

Ask the 1984 OSI model where TLS belongs: Presentation (layer 6), maybe Session (layer 5). But is that right?

In practice TLS terminates in three different places:

-   **Proxy/Middleware**— Nginx or a load balancer handles TLS before your app sees anything. The app receives plaintext. Very common in production.
-   **App Protocols**— your application uses rustls or OpenSSL directly. End-to-end encryption, the proxy never sees plaintext.
-   **OS Kernel**— kTLS offloads encryption/decryption to the kernel. Faster, but the kernel’s TLS and your app’s TLS don’t share state — they’re not the same thing.

The cleanest default placement is **App Protocols**, because TLS is supposed to have a direct relationship with the application. Proxy termination breaks end-to-end guarantees. kTLS is a performance optimization, not a design intent. But the point is that TLS *floats*— where you put it in the stack depends on where it terminates.

### QUIC

QUIC runs over UDP, so the kernel only sees a UDP socket. Everything else — reliability, congestion control, stream multiplexing, head-of-line blocking elimination — is implemented in userspace, in libraries like `quiche` or `ngtcp2`. OSI would call that Transport layer behavior.

But QUIC’s actual code lives next to your HTTP/3 logic, not in the kernel. It’s not a kernel protocol. It belongs in **App Protocols**.

This also means QUIC collapses what OSI would call layers 4, 5, and 6 into a single userspace library. The layer model isn’t wrong — it’s just describing where the code lives, and in QUIC’s case, it all lives in one place.

### eBPF

eBPF is the most interesting floating layer because it floats based on its *hook point*, not its purpose:

```
XDP hook         → Kernel layer        (NIC driver level,
TC hook          → Kernel layer         before socket API exists)
socket filter    → Internal Ports      (fd/bind level)
cgroup/sock_ops  → Internal Ports      (process-level socket control)
```

An eBPF-based application firewall using cgroup or socket filters belongs in **Internal Ports**— it operates at the bind()/fd boundary, which is exactly what that layer represents. But an XDP-based packet filter (like parts of Cilium) belongs in **Kernel**, because it runs before the socket API is even involved.

Same technology. Different layer. Depending on the hook.

### mTLS

mTLS floats the same way TLS does — the layer depends on who performs the handshake:

-   **App Protocols**— the application directly presents and verifies certificates. The client proves its identity to the server through the protocol itself. This is end-to-end and directly tied to application identity.
-   **Proxy/Middleware**— a sidecar like Envoy handles mTLS transparently. The application doesn’t know it’s happening. Istio’s zero-trust pod-to-pod authentication works this way.

The distinction matters for security analysis. Application-level mTLS gives you end-to-end identity guarantees. Proxy-level mTLS gives you infrastructure-level auth with a completely different threat model — you’re trusting the mesh, not the endpoints.

* * *

## Resolved Positions

These are the questions this model answers that OSI can’t touch.

### DNS-over-HTTPS → App Protocols

Normal DNS goes through the kernel’s UDP socket at port 53. Everyone in the path can see it — a proxy, a middleware, a NAT box, an ISP.

```
Normal DNS:  App → Kernel UDP → port 53 → resolver
             (visible to everything in the path)

DoH:         App → TLS → HTTPS → resolver
             (encrypted before it touches proxy or middleware)
```

DoH’s entire security value depends on the Proxy and Middleware layers *not* being able to see or modify it. If DoH resolved inside Proxy/Middleware, that guarantee disappears — you’d just be pushing the interception point one layer up.

It belongs in **App Protocols**. Its stub resolver (like systemd-resolved acting as a local DoH client) is infrastructure; the DoH protocol itself is application-layer by design.

### io_uring → Kernel

io_uring changes how the kernel exposes async I/O — the ring buffer lives in kernel memory, completion events are kernel-side. The async nature is just how it’s exposed to userspace. Nothing about it moves a boundary. It’s an implementation detail inside the Kernel layer, not a new abstraction above or below it.

### Hardware Offloads (TOE, crypto offload) → Layer boundary stays

TCP Offload Engines move TCP processing from the kernel onto NIC hardware. Crypto offload moves encryption to dedicated silicon. But the kernel still presents the same socket API above them.

The layer boundary doesn’t move. Only the implementation underneath changes. Optimization is not architecture.

### AF_XDP → Kernel

AF_XDP uses the socket() syscall, which makes it look like it belongs in Internal Ports. But it bypasses the kernel TCP/IP stack entirely, operating at NIC driver level with zero-copy packet access via shared memory rings.

Even though it uses a socket call, it doesn’t use any of the abstractions that Internal Ports represents — port ownership, bind(), fd-level access control. It belongs in **Kernel**.

* * *

## Stack Profiles — When Layers Don’t All Exist

Here’s the thing OSI fundamentally cannot express: **layers are not always present, and they’re not always singular.**

Some deployments skip layers. Some extend them. Some duplicate them. I call these **stack profiles**— the base model configured for a specific deployment reality.

```
STANDARD
[ Physical ] → [ Kernel ] → [ Ports ] → [ Network ]
→ [ Proxy ] → [ App Protocols ] → [ App ]
All layers present. Normal path.

DPDK / KERNEL BYPASS
[ Physical ] ──────────────────────────────────────→ [ App ]
  Kernel, Ports, and Network layers don't exist
  in this path. The NIC maps memory directly to
  userspace via VFIO/UIO. The kernel is only
  touched at initialization (hugepages, device
  binding) — not during packet processing.

eBPF / XDP EXTENSION
[ Physical ] → [ Kernel* ] → [ Ports ] → ...
  Kernel layer is extended. eBPF programs run
  at the network driver level before packets
  reach the socket API. The asterisk means the
  layer is larger than its base definition.

SERVICE MESH (Sidecar)
... → [ Proxy ] → [ Proxy ] → [ App Protocols ] → [ App ]
  Proxy layer appears twice. The sidecar (Envoy)
  and the ingress controller are both proxies,
  both handling TLS or mTLS, both routing.
  Duplication is the point — it's intentional
  in zero-trust architectures.
```

In a Kubernetes cluster with Cilium eBPF, you have a kernel-extended path. With SR-IOV, you have a bypass path. With Istio, you have a doubled proxy layer with mTLS at the proxy level instead of the application. These aren’t edge cases — they’re mainstream production deployments. A model that can’t describe them isn’t a model of the modern stack, it’s a model of 1984.

* * *

## Open Questions

This model takes positions on most things, but not everything. Some areas worth thinking about further:

**DoH, mTLS, and kTLS setup tradeoffs**— this post places all three but doesn’t go deep on what choosing each means operationally. kTLS gets you performance but loses app-level TLS state. Proxy mTLS gets you infrastructure auth but shifts your trust boundary. DoH at the app level gets you privacy but makes centralized DNS monitoring harder. Each placement decision has consequences.

**CNI deep dive**— Calico, Cilium, and Flannel each implement a different stack profile. Mapping them explicitly onto this model would make the profiles concrete rather than abstract.

**Security surface per layer**— if each layer is a distinct actor, each layer is also a distinct attack surface. What does an attacker targeting the Kernel layer look like versus one targeting Proxy/Middleware? The model provides a natural frame for threat modeling that OSI doesn’t.

These are worth their own posts. For now, the model stands as a proposal — a way of describing the modern network stack that doesn’t require you to pretend QUIC is just Transport or that Envoy is just Application. It’s a starting point, not a standard. Push back on it, break it, find the cases it doesn’t cover. That’s how it gets better.
