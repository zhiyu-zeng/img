---
title: Apple Security Research
source: https://security.apple.com/blog/secure-exclaves
source_host: security.apple.com
clip_date: 2026-11-19T08:10:48+08:00
trace_id: 528e5e89-0467-4823-ab76-86ec73c9e957
content_hash: a985ced8220a95ee62a5a4b4d9836405421270abf04d949caedb57a047f2e04f
status: synced
tags: []
series: null
feed_source: Apple Security Research
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8167-80c8-cd65a72adc69
ioc: null
---

We recently introduced HomeView, which can recognize up to six people to deliver a rich and personalized experience. This capability relies on *ambient sensing*: using the microphone and camera to understand the surrounding environment and recognize an enrolled user’s voice and face. We have always believed features like this must be designed from the ground up to protect user security and privacy, and are now taking these protections even further, with a new security architecture in Apple silicon that’s purpose-built for ambient sensing. This work both benefits our newest features and strengthens the security of features we already ship, such as “Hey Siri” detection. Our goal is to keep ambient sensor data secure even against highly sophisticated attacks, while giving users a clear, reliable, and tamper-resistant signal whenever their sensors are fully active.

While ambient sensing relies on processing input from the camera or microphone, it must never record audio or video, nor expose it to the rest of the operating system. Instead, it must reduce the sensor stream to far simpler signals, such as whether a specific sound was detected or whether an enrolled user’s face or voice was recognized, while protecting the raw sensor data during processing and discarding it once complete.

Hardwired LED sensor indicator lights are easy to understand and play an important role in privacy and security across our products, but aren’t suitable for ambient sensing use cases, because they would glow continuously. This would defeat the utility of the indicator, and prevent the user from distinguishing background sensing — such as a device listening for a “Hey Siri” invocation — from active audio and video recording. We set out instead to enable ambient sensing to run in a strongly isolated environment with the full power of the main application processor, with a precisely controlled interface into the rest of the system, and with a secure indication mechanism so the user is aware when audio or video data is allowed to leave the isolation boundary.

To accomplish this, we have created **Secure Exclaves**: protected and compartmentalized runtimes used to process camera and microphone data separately from the rest of the system. Isolation features added across many core components of the silicon work in tandem to protect Secure Exclaves and keep them segregated from the rest of the system. Data that is processed and analyzed in a Secure Exclave cannot be accessed by the main operating system, apps, or Apple.

We use Secure Exclaves to protect entirely new use cases, like person recognition on HomeView as well as Siri Recap and Live Rewind, as described [here](https://www.apple.com/privacy/docs/Audio_Intelligence_Privacy_Overview_Sep_2026.pdf). We also use them to protect the on-screen camera and microphone indicators used in iPhone 18 Pro, iPhone 18 Pro Max, and iPhone Duo, as well as the camera indicators in MacBook Neo and HomeView, improving security for our users across the board.

We believe Secure Exclaves are the most advanced architecture for ambient sensing in the industry, defining an ambitious new level of security and privacy for these use cases.

### The Architecture of Secure Exclaves

To protect ambient sensing, we aimed to build a system that operated in two distinct modes: ambient mode and active mode, for both camera and microphone. In ambient mode, a sensor can respond to particular triggers in the world around it, but only specific metadata may be shared with the rest of the system. In active mode, full sensor data can be released to the main operating system (OS), and a secure indicator reliably informs the user that it’s happening.

Meeting this challenge ultimately required building a new, isolated computing environment that could handle the full performance demands of ambient sensing use cases, yet stay cleanly separated from the main OS with three primary requirements:

-   **Isolation**: data processed in Secure Exclaves must not be extractable or modifiable from the main OS.
-   **Controlled interface**: only a precisely specified set of information can cross the boundary from Secure Exclaves to the main OS.
-   **Secure indication**: the user must be able to see whether an active sensor session is in progress, without interference from the main OS.

Building a new secure runtime requires a highly secure OS foundation. For this reason, we utilized an Apple-customized version of the L4 microkernel which we originally built for some of our most security-sensitive deployments, including the Secure Enclave Processor (SEP). This microkernel uses capabilities, which are secure resource handles that both identify and authorize access to the underlying resource. This simple but powerful mechanism is applied to both memory isolation and IPC security, enabling us to build a secure system that contains no extraneous authority. The exclaves microkernel, and our approach to formal verification of its correctness, are described in detail later in this post.

##### Isolation

Secure Exclaves run in a different processor execution context from the main OS, which allows us to employ an independent operating system specially designed to handle high-security, high-performance workloads. But isolation also requires careful handling of all shared resources available to the application processor: most importantly, system memory and communication with coprocessors.

Isolating memory for the exclusive use of Secure Exclaves presented a serious engineering challenge: management of the page tables, which organize and protect main device memory, is usually handled by the main OS. We laid the groundwork for isolation in earlier releases, by carving out and rebuilding this subsystem as the [Secure Page Table Monitor](https://support.apple.com/guide/security/operating-system-integrity-sec8b776536b/1/web/1#secd022396fb) (SPTM): a standalone component that handles page table and memory logic, and runs at a higher privilege level than the main OS kernel. It doesn’t share data or code with the main OS, and is separately loaded by the boot loader. This rearchitecture not only hardened the entire system against certain kernel-level attacks, but also created the foundation for isolating Secure Exclave memory.

SPTM relies on Apple silicon primitives to protect the memory used by exclaves from the rest of the system. It manages every physical page of memory used by the application processor, and enforces that software executing in Secure Exclaves have a separate and isolated view of memory than that seen by the main OS. Microkernel capabilities are used to control memory permissions of every individual exclave. This allows each exclave to access only its own memory, providing an additional layer of protection.

Next, Secure Exclaves must account for the other coprocessors and sensors connected to the Apple silicon fabric. Where a coprocessor is essential to secure sensing, such as our Always-On Processor (AOP), a secure compartment within that coprocessor’s operating system handles the processing needed for communication with Secure Exclaves. The coprocessor secure compartment is also built on top of the exclaves microkernel, maintaining security assurance continuity across the application processor and coprocessors. Other resources like sensor memory are protected with specialized memory filters, placed between each resource and the shared fabric, which can only be configured by the SPTM. This propagates the memory isolation property throughout the system.

Some of the secure sensing workloads that run in Secure Exclaves need access to high-performance inference hardware to run demanding machine learning models. To enable this, we extended the Apple Neural Engine (ANE) by adding isolated workload queues, like those we use in the SEP. Memory filters protect those queues from being modified or accessed by the main OS, and switching from an isolated to a standard queue flushes any local storage to prevent information leaks. With these changes, we can offer high-performance inference to power intelligent ambient sensing.

Altogether, the computational, memory, and peripheral isolation technologies stack together to create an isolated but high-performance execution context. Within this context, we can place a specialized, secure operating system with microphone and camera access, running with the full power of Apple silicon.

##### Controlled Interface

To handle ambient sensing tasks, Secure Exclaves must be able to exchange small amounts of metadata with the main OS. Traditional inter-process communication (IPC) mechanisms are designed for maximum flexibility, providing open-ended interfaces that can be composed with arbitrary complexity when moving data. For Secure Exclaves, we approached the problem from the opposite angle, and set out to design IPC primitives that could enable tightly restricted, completely predictable communication.

To do so, we built a new communication mechanism called Secure IPC, written in Swift for memory safety. It combines an interface description language with a runtime that securely connects the components that are allowed to communicate. All exclaves use Secure IPC to communicate with each other and with the main OS. This design prevents unanticipated crosstalk between components and ensures that only authorized information can flow across IPC boundaries. Each Secure IPC interface from an exclave to the main OS is rigorously audited to ensure that only the minimal metadata needed to run an ambient sensing use case can leave the exclave.

Microkernel capabilities are used to control the IPC connections of every exclave. By default, exclaves are unable to communicate or even refer to one another. An exclave may only initiate IPC if it has an explicit capability to an IPC connection. Therefore, Secure Exclaves have complete control over every IPC interface *and* connection in the system. The combination of the exclaves microkernel and Secure IPC makes Secure Exclaves the most secure runtime Apple has ever created, and we’ve put it at the heart of how we secure ambient sensing.

##### Secure Indication

When moving from ambient sensing to a full, active sensor use case, such as a conversation with Siri or a FaceTime video session, the system must communicate to the user that it is now sharing broad access to the sensor with the app that has requested it. We build on our existing visual language to communicate this — either an LED, or an indicator dot drawn on the display — but back it with a novel, high level of security that’s without industry precedent.

A specialized exclave, called the Exclave Indicator Controller, is the overall system gatekeeper for sensor data. It only allows data to flow after establishing that the indicator is activated, and has been visible for a sufficient amount of time. Since multiple apps can request audio and video data simultaneously, the Indicator Controller deconflicts these requests and makes sure the appropriate indicator appears.

For products like HomeView that use an LED, just the Exclave Indicator Controller is needed. It can toggle the LED directly and ensure that it is bright enough to be visible.

For products like iPhone that use an indicator dot on the screen, an additional exclave works to ensure that the dot is visible whenever the system is sharing full sensor data. This display exclave uses a specialized hardware block in the display subsystem to check what pixels have been drawn to the screen. This enforcement provides affordances for various operating system modes, like [Night Shift](https://support.apple.com/en-us/118583), that can affect the appearance of the indicator dot. It also ensures that the pixels meet a minimum brightness threshold and are not obscured by nearby pixels. Trusted firmware in the display controller shares precise backlight values with the exclave, ensuring the indicator is truly visible to the user.

Together with the isolation and controlled interface components of Secure Exclaves, this system provides an incredibly powerful mechanism for securely processing high-sensitivity workloads.

### The Person Recognition Flow on HomeView

To illustrate how these components work together, we describe the person recognition flow using the camera on HomeView — an ambient sensing use case protected by Secure Exclaves. HomeView must passively perform minimal visual processing at all times to detect whether a person is in the field of view, but this must not make camera data available to the broader system. The Secure Exclaves system allows person recognition to occur quickly and accurately, while keeping the ambient visual data protected within exclaves. This means HomeView can recognize who is using it, react to nearby movement, and display content based on whether a user is nearby or far away.

![perception-flow](https://security.apple.com/assets/image/generated/xlarge_perception-flow-light.jpg)

perception-flow

At startup, the person recognition exclave loads previously enrolled face and voice recognition models and the identity database from the secure storage exclave (1).

A continuous stream of camera frames is passed to the camera exclave, which detects faces, applies a bounding box, and queues the frames for further processing (2). The camera exclave informs daemons in the main OS that a person may be present; however, no image data leaves the Secure Exclaves (3).

At the same time, microphone audio data is processed through the audio exclaves for anomaly detection and echo cancellation, before being passed to the person recognition exclave (4). As above, the exclaves inform daemons in the main OS that someone may be present, without sharing audio data (5).

Next, the person recognition exclave requests that the Neural Engine exclave load the face and voice print models to produce face and voice prints (6). All data remains in exclave-controlled memory at all times and is not accessible by the main OS. To achieve this, the Neural Engine uses isolated work queues that are dedicated to exclaves, ensuring that the state of the Neural Engine is cleared after each model completes.

Finally, the orchestration service within the person recognition exclave matches the resulting prints against the identity database of enrolled users, and combines the face and voice identification to produce a confidence score. Only this metadata — person identifier, position, and confidence level — is returned to the person recognition daemon running in the main OS (7). The system integrates the outputs so that they are properly reflected in features that depend on user identity, such as Calendar, Messages, Apple Music, or compatible third-party audio and video apps from your iPhone (8). No audio or video data is shared with the operating system as this recognition process is performed.

### The “Hey Siri” Flow on iPhone 18 Pro

We also describe the “Hey Siri” flow on the latest iPhone models to show how this new architecture can improve security for existing use cases. A phone must passively perform minimal audio processing at all times to detect when a user has said the wake words for Siri. The Secure Exclaves system allows the “Hey Siri” flow to occur quickly and accurately, while keeping the ambient audio protected within exclaves until an active Siri session begins.

![hey-siri-flow-blocks](https://security.apple.com/assets/image/generated/xlarge_hey-siri-flow-blocks-light.jpg)

hey-siri-flow-blocks

The flow begins with the Always-On Processor (AOP), a low-power coprocessor that continuously monitors for wake-word utterances (1). If the rough first-pass filter on the AOP detects a potential “Hey Siri,” it wakes up the main processor and passes the audio buffer to the audio exclave (2). This exclave performs an echo cancellation pass to make the audio more intelligible, and then passes the audio to the Siri exclave (3).

Now the Siri exclave runs a second pass on the audio to confirm whether wake words were in fact said (4). This model is larger and more finely tuned — running on the main processor lets it filter out significantly more false positives than the AOP can do on its own.

If this second pass confirms the wake-word detection, the Siri exclave notifies the Siri daemon running in the main OS (5). No audio is shared with the daemon at this point: just the flag that it should wake up. The Siri daemon then begins an active session by requesting microphone access from the audio driver (6). The driver calls into the UI to draw a microphone indicator (7), then asks for audio access from the Exclave Indicator Controller (EIC) (8).

The EIC asks the secure display exclave to check that the pixels rendered to the display — including their colors, shape, and display duration — all match what’s expected for a microphone indicator (9). If that check passes, the system transitions from ambient mode to active mode. The EIC permits the audio transfer (10), and the Siri exclave sends its daemon the historical audio that includes “Hey Siri” along with the rest of the request (11). The EIC ensures that the indicator stays on screen until the Siri daemon ends the audio session, with a minimum duration of three seconds.

### Technical Deep Dive

This section takes a closer look at the underpinnings of Secure Exclaves for those readers who have particular interest in the technical details of the system’s implementation.

![exclaves-architecture](https://security.apple.com/assets/image/generated/xlarge_exclaves-architecture-light.jpg)

exclaves-architecture

##### The Exclaves Microkernel

Microkernels allow large, secure systems to be constructed by minimizing the trusted computing base (TCB), which is the set of code that must be trusted to maintain system security. Unlike traditional kernels, such as XNU or Linux, which handle hardware, networking, and resource management in the kernel, the exclaves microkernel implements only the absolute minimum functionality required to run and isolate application services.

While the exclaves microkernel was developed from scratch at Apple, its design is guided by modern microkernel research. It is a capability-based kernel, like seL4 or keyKOS, meaning that system components have no permissions by default. Instead, components may only interact with other components or hardware if explicitly granted a capability to do so.

Because the exclaves microkernel has such a small TCB, Apple has been able to incrementally apply formal verification, using mathematical proofs to verify that the kernel's C implementation behaves exactly as defined by a high-level functional specification. This rigorous process has proven highly effective at discovering and eliminating subtle, critical logic bugs in core subsystems that could have otherwise led to kernel compromise: incomplete input validation of syscalls, inconsistent state updates, misaligned reads, and malformed page-table updates. It has also eliminated some classes of C undefined behavior.

To integrate with the existing operating system, the microkernel implements a user-level scheduling model inspired by the Composite component-based OS. In this model, the microkernel relies on XNU to donate CPU execution time. When XNU calls into the microkernel, the user-level scheduler executes the appropriate threads. When a thread completes, a timer tick occurs, or an interrupt fires, control is handed back to XNU, which can then call back into the microkernel to resume execution.

Building Secure Exclaves on top of the exclaves microkernel lets complex system services run as isolated user-level tasks. This architecture ensures that these components operate with strong isolation from each other and from the rest of the system, preventing a compromise in one service from affecting the others.

Formal verification uses mathematical proofs to demonstrate that a system satisfies specific properties that we define. At Apple, we've performed extensive formal verification in silicon development for over 15 years, and in 2019 we began using formal verification to prove classical cryptography, including the hardware Public Key Accelerator (PKA) — the part of Apple silicon that performs elliptic-curve public-key operations. More recently, corecrypto, Apple's cryptographic library, gained implementations of the quantum-secure ML-KEM and ML-DSA algorithms. These implementations have been [formally verified](https://security.apple.com/blog/formal-verification-corecrypto/) to ensure that they are faithful to the FIPS 203 and FIPS 204 specifications.

For the exclaves microkernel — the centerpiece in the security of exclave-based systems — we draw on the same internal expertise to formally verify that our C implementation satisfies an abstract functional specification: a precise, mathematical description of what the code should do. This provides a significantly greater degree of assurance than conventional software testing allows; in theory, it gives us strong confidence that our implementation behaves exactly as specified wherever the proof applies. The practical considerations are more complicated. Regardless of how it is applied, formal verification requires a tremendous investment of time and deep expertise. The implementation and its specification must be represented with carefully chosen mathematical formulas. To draw correct conclusions, the formulas must faithfully model the relevant behaviors of both the implementation and the specification, and be structured so as to enable the proof to be written in simple steps.

Since the exclaves microkernel is actively developed and frequently changing, our formal verification efforts serve primarily as a tool to discover deep logic problems — for example, incomplete input validation of syscalls, inconsistent state updates, misaligned reads, and malformed page-table updates. As a side effect, we also show the absence of some classes of C undefined behavior for the code we formally verify. While other methods, such as testing and fuzzing, are useful for identifying bugs in the implementation and are often the first line of defense, formal verification has been able to discover subtle but critical problems in many of the kernel's subsystems, with the potential for full kernel compromise — for example, in the recursive algorithm used to free a capability storage object (CNode), in the implementation of sending capabilities over inter-process communication (IPC), and in execution-context (EC) state management when running on a multiprocessor (SMP) system. Thanks to close collaboration between the kernel engineers and the formal verification engineers, many of these issues have been discovered at early stages of development. Because of these constant changes, we do not claim complete coverage of all aspects of the kernel; instead, formal verification is applied gradually and incrementally to different parts. To do this, we rely on [Isabelle/HOL](https://isabelle.in.tum.de/) with [AutoCorres2](https://isa-afp.org/entries/AutoCorres2.html) to build a mathematical model of the kernel implementation from the C source code, against which we perform our formal verification.

##### The exclaveOS external architecture

exclaveOS builds on the exclaves microkernel to create an environment isolated from XNU and Darwin user space. Software with direct access to devices that capture sensitive personal information, such as cameras and microphones, is placed into exclaveOS along with software that manages access to exclaveOS. Drivers, daemons, and applications running in Darwin must call through the access management software in exclaveOS in order to gain access to these devices.

All of the software in XNU, Darwin user space, and exclaveOS executes on the application processor cores. When user-level code in Darwin or an in-kernel driver wishes to communicate with software in exclaveOS, it performs a remote procedure call (RPC). This call is passed via the XNU kernel to a specific unit of software on the exclaveOS side, which can then interact with the remainder of exclaveOS as part of handling the RPC.

Because each RPC is handled on behalf of code that was running on a thread in XNU, the code that handles the RPC in exclaveOS runs on the same XNU thread. This means that XNU is responsible for scheduling all code running in exclaveOS, which gives exclaveOS the benefits of all the optimization provided by the XNU scheduler. Whenever code is preempted or synchronizes in exclaveOS, the state of that code is captured by the microkernel; a user-level scheduler in exclaves provides XNU only enough information to synchronize related threads and to later resume execution.

Both Darwin and exclaveOS have small trusted elements that manage low-level access to resources, primarily by restricting what physical and device memory either side is permitted to directly map and access. The SPTM controls what XNU and Darwin user space are permitted to access and the exclaves microkernel controls what software in exclaveOS is permitted to access. These two components mutually trust each other to enforce the access restrictions that the other side relies on, forming the lowest-level boundary between the two sides and cooperatively managing execution on the shared processor cores.

Secure Exclaves have a file storage protocol that is designed to prevent unauthorized communication channels between XNU and exclaves, as well as between individual exclaves. File system access is not presumed — it is statically expressed in system configuration, and only granted to components that genuinely need it.

File access can be read-only, and there are also specialized, component-only read-write sections of the file system. All read-only files are checked against an integrity catalog that ships with the OS. All writable files are only readable by the exclave that wrote them, and all writes are encrypted.

To boot exclaves, iBoot places the exclaves microkernel and an initial static code bundle, along with an integrity catalog for the read-only parts of the file system, into wired memory. Signatures for dynamically loadable code are read and compared against the integrity catalog at boot. During runtime, to load dynamic components of the system, code is read from the read-only file system, and then validated against the in-memory signatures before being made executable. No code can execute that did not ship with Secure Exclaves.

##### The exclaveOS internal architecture

exclaveOS is the operating system and runtime we use on top of the microkernel to run sensitive code. As a microkernel-based operating system, exclaveOS implements the majority of OS functionality as user-level servers, each with a minimal set of capabilities required to function. Significant portions of exclaveOS are written in Swift for built-in memory safety. The OS builds on several key concepts:

-   A static, build-time system description that describes all address spaces in the system, what resources they can access, and how they communicate.
-   A root task, which sets up the initial system and then frees itself.
-   ExclaveCores, static-lifetime address spaces that implement system services and drivers.
-   ExclaveKits, dynamic-lifetime address spaces that are grouped together with a Darwin daemon and form a conclave.

At boot, the exclaveOS root task runs, creates all of the ExclaveCore address spaces as described, and distributes the relevant kernel capabilities. Included in the distributed resources are communication endpoints to other address spaces. After boot, the root task is destroyed, and the ability to create new connections between address spaces is irreversibly removed from the running system.

The creation and destruction of ExclaveKit address spaces is not done by the root task. Instead, each conclave has an associated ExclaveCore called a *conclave launcher*. Each conclave launcher maintains a connection to XNU so that its corresponding daemon can invoke it to create the ExclaveKit address spaces in its conclave. If a daemon is terminated, XNU invokes that daemon’s conclave launcher to terminate the daemon’s ExclaveKit address spaces. Importantly, while a conclave launcher can create and destroy address spaces, it cannot create the connections between address spaces, but instead must use the existing connections that the root task gave it at boot.

Once the root task is destroyed, no remaining part of the system has such broad authority. For example, the root task gives the capability to manage physical memory to the physical memory server but restricts that capability such that memory mapped through it can only be mapped read-only or read-write. On the other hand, the capability to distribute read-execute (but not writable) access to physical memory is given to a code loading server. Every component in the system can request memory from the physical memory server, but only conclave launchers are connected to the code loading server.

exclaveOS puts a component architecture on top of the capability model that the exclaves microkernel provides. Communication between these components is handled by Secure IPC.

##### Secure IPC

Secure IPC is a system for describing software components and the interfaces they provide, and managing their behavior at runtime. All communication between components, as well as into and out of exclaveOS, is handled by Secure IPC. Component interfaces are described ahead of time in a type-safe description language, allowing RPC data flow around the system to be audited and approved before it’s ever run.

This system comprises four main pieces:

1.  An Interface Description Language (IDL) that is used to describe components, the services they provide, and the methods clients can invoke on them.
2.  A compiler that takes IDL descriptions as input and produces the source code that implements the interfaces.
3.  A component runtime that handles the initialization and management of components.
4.  An RPC runtime that abstracts the IPC systems that Secure IPC sits on top of away from the compiler-generated code.

Secure IPC is used to describe the interface for all software in exclaveOS, allowing for the movement of all RPC data to be audited and understood at build time. At runtime, the system description is used by the root task to hand the components for each address space only the capabilities they need to construct their pre-approved RPC links. This strict build-time declaration of interfaces as well as the one-time construction of RPC links at runtime enables the static, type-safe transmission of data around the system.

The Secure IPC IDL is a Swift-like, type-safe language where interfaces are described using scalar values, structures, and enumerations. These are used to declare methods and the services they are a part of. Components tie everything together by implementing a set of services as well as declaring the services they themselves are clients of in their initializers.

For example:

```c
enum PlaybackStatus {
    case stopped = 1
    case playing = 2
}

struct TrackInfo {
    let trackIdentifier: UInt64
    let status: PlaybackStatus
}

service PlaybackController {
    func play(_ position: UInt64) -> Bool
    func stop()
    func getTrackInfo() -> TrackInfo
}

component MediaPlayer: PlaybackController {
    init(audioOutput: AudioOutputController)
}
```

The Secure IPC compiler takes these IDL files for each component and then generates the Swift and optionally C source code that provides a runtime interface for the software they describe. The generated implementation makes use of a single, audited set of encode and decode methods for each of the types used in the interface, completely centralizing the processing of arbitrary data in the system.

In exclaveOS, the initialization and management of software is completely handled by the operating system. At boot, the Secure IPC component runtime exists in each exclaveOS address space, and the root task hands it data generated at build time as well as runtime handles such as endpoint capabilities. Secure IPC passes this data to the component initializers that were constructed by the compiler to create their runtime instances. The runtime then handles notifying the component instances of new clients arriving or departing, for example an ExclaveCore component being told that a client in a conclave has launched or exited.

At the very lowest layer, Secure IPC interacts with the operating system it’s running on to move RPC data between instances of components and services. When communicating between components in exclaveOS, Secure IPC encodes a message into a microkernel IPC buffer and invokes the endpoint capability attached to the service. The same runtime is then also used to manage data transmission from a daemon running in Darwin user space to its conclave running in exclaveOS, in which case it encodes into a buffer that it hands to XNU with a system call.

##### Secure Page Table Monitor

The SPTM is a highly privileged piece of software that defines and enforces the security policies that govern page table management for the kernel, user applications, and coprocessors. Its intent is to protect the overall system by securing the page tables against attackers without trusting the kernel. On SPTM-protected products, the kernel cannot write a page table entry itself. Every mapping change is a request to the SPTM, which validates it against policy before applying it.

In order to enforce security policies at this level, the SPTM must necessarily own all of the architectural state that pertains to CPU and IOMMU page table management. This covers the page tables themselves, the data and code that manage them, and the VMSA (Virtual Memory System Architecture) registers and IOMMU translation control registers. The SPTM achieves this by placing itself in a separate, more privileged execution mode that the hardware isolates from the kernel, and by protecting all of the memory that backs page tables and ancillary data structures such that even the kernel itself cannot modify them.

The SPTM governs every page of DRAM exposed to the application processor using a powerful type system. Every page holds an associated type and may be retyped to another type subject to an allow-list of permitted transitions and security policy decisions. Pages mapped into a userspace process carry one type, while pages backing kernel private memory can carry a significantly more policy-constrained type that, for example, only ever permits a single kernel mapping of the page to exist.

This type system centrally enables the SPTM to define a given page type's owner, mapping permissions and policy that must apply when executing under each of the SPTM, XNU kernel, and Secure Exclave execution contexts. The result is a separate permission view for each context, enforced at the hardware level by Apple silicon.

The SPTM, coupled with Apple silicon security advancements, provides the foundation for modern secure memory management principles across our platforms. Under this design, Secure Exclave private memory is assigned types that only the Secure Exclave context owns. The OS kernel cannot retype these pages, and cannot map them into another CPU or IOMMU address space or otherwise have a path to read their contents. Even the SPTM itself, by design, keeps no mapping to this memory. This provides clean separation between kernel and Secure Exclave private memory resources.

### Conclusion

We believe Secure Exclaves set a new standard for operating system security in the industry. This high-performance, high-assurance system can handle the most demanding workloads for ambient sensing, while providing an exceptional level of protection for the audio and visual data captured by device sensors. No security architecture is ever finished, and Secure Exclaves are no exception. And we are committed to continuing to harden this system, fueled by AI-accelerated vulnerability research and expanded formal verification coverage. As our products deliver increasingly intelligent features to our users, we see Secure Exclaves as a critical step in giving our users clarity and confidence about how their Apple products respond to the world around them.
