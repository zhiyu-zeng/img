---
title: "[Research] 진실은 언제나 하나…? (KR)"
source: https://hackyboiz.github.io/2026/11/21/SeoPPak/Windows_Double_Fetch_Exploit/KR/
source_host: hackyboiz.github.io
clip_date: 2026-11-21T19:44:37+08:00
trace_id: b56f7d7e-dc0b-4f10-9ce4-df601b5773f4
content_hash: 57e27584a4fe1480ef39d40a19d88bb9f718b888e6c9a53eb5b62bd9fc00884b
status: synced
tags:
  - 漏洞分析
  - 内核
series: null
feed_source: hackyboiz·Android/Windows/macOS漏洞
ai_summary: CVE-2024-30088 的同一个 double fetch 只能写入固定字符串，但把这次写入对准令牌或 I/O Ring，会形成从父进程句柄创建 SYSTEM 子进程、或建立内核任意读写两条完全不同的提权链。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 41f75244-d011-81dd-a2ec-f0e0f2c74bc4
ioc:
  cves:
    - CVE-2024-30088
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CVE-2024-30088 的同一个 double fetch 只能写入固定字符串，但把这次写入对准令牌或 I/O Ring，会形成从父进程句柄创建 SYSTEM 子进程、或建立内核任意读写两条完全不同的提权链。
> 
> - **原始缺陷：** `NtQueryInformationToken`（class 22）把在用户缓冲中构造的 destination descriptor 交给 `RtlCopyUnicodeString` 复用，在 write-then-read-back 窗口内改写 `MaximumLength`/`Buffer`，只能覆盖固定串 `TSA://ProcUnique`（UTF-16 共 32 字节）。
> - **令牌路径：** 每轮把 `MaximumLength` 置 2、`Buffer` 置 `token+0x40-4`，5,000 次查询中第 32 次拿到 `winlogon.exe` 的 `PROCESS_ALL_ACCESS`，再经 `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS` 生成 S-1-5-18 子进程；靠 `Privileges` 位 20（`SE_DEBUG_PRIVILEGE`）置位，而非改写自身 `_EPROCESS.Token`。
> - **I/O Ring 路径：** 偏移实测 `CompletionUserEvent +0xA8`、`RegBuffersCount +0xB0`、`RegBuffers +0xB8`；从 `ring+0x9D` 起写使 `RegBuffers` 变成 `0x65007500`，配合 `VirtualAlloc(0x65000000,…)` 与伪造 `_IOP_MC_BUFFER_ENTRY`，用 `BuildIoRingReadFile` 写内核、`BuildIoRingWriteFile` 读内核，再按 `+0x440`/`+0x4B8` 换当前进程令牌并原样回写。
> - **踩坑修复：** 32 字节同时破坏事件字段，故首个 I/O Ring 操作用于清零 `ring+0x90` 起 0x20 字节做修复；读取结果 PID 全为 0 是 `ioring_read` 未在 `ReadFile` 前调用 `SetFilePointer(..., FILE_BEGIN)`，属助手代码 bug。
> - **边界声明：** 实验仅在 Medium integrity、未打补丁的构建上验证，未测 SMAP/SMEP/HVCI/PatchGuard，也未比较两条链的成功率（查询次数 27,809 与 2,758 不可直接对比）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9b0663a7ee4d529.jpg)

안녕하세요. 요즘 들어 부쩍 날씨가 추워지고 있는데, 다들 건강하게 지내고 계신가요?

2026년 8월부터 새롭게 Hackyboiz에 합류하게 된 SeoPPak 이라고 합니다. 저의 첫 번째 연구글에 오신 걸 환영합니다! 😄

처음 해키보이즈에 들어와서 배운 것이 윈도우 1-Day 재현이다 보니 자연스럽게 윈도우를 좀 더 깊게 파보고 싶어 커널까지도 기웃거리고 있습니다.

그 첫 번째 단계로 minzu 님과 함께 Windows 커널 취약점을 **버그 → 확보 가능한 primitive → 타겟 객체 → 익스플로잇 결과** 로 연결해 볼 수 있도록 DB화 해보려고 합니다. 단순히 CVE 번호와 재현 성공 여부를 모으기보다, 주어진 읽기/쓰기 능력이 어떤 조건에서 권한 상승으로 이어지는지 설명할 수 있는 자료를 쌓고 싶었습니다.

오늘은 CVE-2024-30088을 심층 분석하며, 하나의 취약점이 서로 다른 두 경로를 거쳐 어떻게 권한 상승으로 이어지는지 비교해 보겠습니다.

취약 함수의 리버싱과 패치 내용은 앞서 쓴 하루한줄 분석글에서 더 자세히 다뤘습니다. 여기서는 먼저 **무엇을 쓸 수 있었는지** 만 정리하고, 그 능력이 각각 어디로 이어졌는지 살펴보겠습니다.

## 1\. 동일한 출발점

## 1-1. Double Fetch

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dfe3234b9c7d48a5.png)

두 경로는 모두 같은 **Double Fetch 계열의 race** 에서 출발합니다. 정확히는 커널이 사용자 버퍼에 destination descriptor를 쓴 뒤 다시 읽는 **write-then-read-back** 형태입니다. 이 race로 고정 문자열 쓰기를 얻은 다음, 그 쓰기를 어떤 객체에 적용하느냐에 따라 익스플로잇 경로가 갈립니다.

-   **토큰 방식:** 고정 문자열 쓰기를 토큰의 `Privileges` 필드에 맞춰 권한 비트를 오염시키고, 얻은 프로세스 핸들로 SYSTEM 자식을 만듭니다.
-   **I/O Ring 방식:** 같은 쓰기로 I/O Ring 객체의 `RegBuffers` 를 오염시켜 커널 임의 읽기/쓰기로 확장한 뒤, 현재 프로세스의 토큰을 교체합니다.

I/O Ring 권한 상승 경로는 carrot_c4k3의 글 CVE-2024-30088 Pwning Windows Kernel @ Pwn2Own Vancouver 2024 (Plus Xbox)에서 소개한 Windows 익스플로잇 체인과 이후 Xbox용으로 공개된 collateral-damage 코드를 참고해 재현했습니다.

## 1-2. 취약점이 만든 프리미티브

#### 토큰 정보 조회의 Destination Descriptor

액세스 토큰에서 지정한 종류의 정보를 조회하는 함수인 `NtQueryInformationToken(..., TokenAccessInformation = 22, ...)` 은 토큰의 보안 특성을 사용자 출력 버퍼로 내보냅니다. 커널은 특성 이름을 받을 `UNICODE_STRING` destination descriptor를 **유저 버퍼 안에** 만들어 놓고, Unicode 문자열을 복사하는 `RtlCopyUnicodeString` 의 destination 인자로 다시 사용합니다. 바로 이 사이에 사용자 스레드가 descriptor의 `MaximumLength` 와 `Buffer` 를 바꿀 수 있습니다. carrot_c4k3가 지적한 write-then-read-back Race 조건이 여기서 생깁니다.

복사 길이와 주소가 어떻게 결정되는지도 중요합니다. 복사 길이는 원본 길이와 목적지 `MaximumLength` 중 작은 값이고, 실제 쓰기 위치는 목적지 `Buffer` 입니다. Microsoft 문서에 따르면 이 함수가 목적지의 `MaximumLength` 나 `Buffer` 를 대신 고쳐 주지는 않습니다. 그러니 사용자 메모리의 descriptor를 그대로 다시 읽는 동안 목적지 주소가 바뀌면, 커널이 처음 준비한 곳과 실제 복사할 곳이 달라질 수 있습니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b091444eefe07a62.png)

```makefile
커널: 사용자 출력 버퍼에 destination UNICODE_STRING 작성사용자 스레드: 같은 descriptor의 길이와 포인터 필드 변경커널: RtlCopyUnicodeString에서 변경 가능했던 descriptor 재사용
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d9e580c85f55eb4f.png)

그렇다면 원하는 값을 마음대로 쓸 수 있을까요?

복사되는 이름은 `TSA://ProcUnique` 로 고정되어 있습니다. UTF-16로 표현하면 **32바이트** 입니다. 즉 첫 단계에서 얻는 능력은 임의의 8바이트 포인터 쓰기가 아니라, **원하는 위치에 알려진 바이트열을 겹쳐 쓰는 제한적 쓰기** 입니다. 이후의 두 경로는 모두 이 제약을 어떻게 쓸모 있는 상태로 바꾸느냐에서 시작합니다. carrot_c4k3의 분석

### 실험에서 공유한 조건

문자열을 놓을 위치를 계산하려면 타겟 커널 객체의 주소부터 알아야 합니다. 두 코드 모두 Medium integrity에서 지정한 종류의 시스템 정보를 조회하는 `NtQuerySystemInformation` 으로 핸들 정보를 얻었습니다. 다만 정보 클래스는 다릅니다. 토큰 PoC는 `SystemExtendedHandleInformation` (64)로 자기 토큰 주소를 찾고, 이번 포트의 헬퍼는 `SystemHandleInformation` (16)에서 I/O Ring과 프로세스 객체 주소를 찾습니다.

**토큰 PoC**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9e61a973bf826724.png)

**I/O Ring 포트**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cacec6b84cce1aa8.png)

레이스가 성공했다는 메시지만으로 권한 상승까지 됐다고 보기도 어렵습니다. 그래서 첫 경로에서는 이전에는 열리지 않던 프로세스의 핸들과 새 자식의 토큰을, 두 번째 경로에서는 링 필드를 다시 읽은 값과 현재 프로세스의 토큰을 확인했습니다. 이제 각각의 경로를 살펴보겠습니다.

## 2\. 하나의 쓰기 프리미티브, 두 갈래의 익스플로잇

## 2-1. 첫 번째 경로: 권한을 이용하기

### 짧은 경로의 핵심

먼저, 첫 번째 방법은 현재 프로세스의 **토큰 객체를 타겟** 으로 삼습니다. 레이싱 스레드는 출력 버퍼에 있는 descriptor의 `MaximumLength` 를 `2` 로, `Buffer` 를 `token + 0x40 - 4` 로 반복해서 바꿉니다. 이 빌드에서 `_TOKEN.Privileges` 는 `+0x40` 에 있으므로, 고정 문자열이 권한 마스크를 덮어쓰도록 시작 주소를 4바이트 앞에 둔 것입니다. 메인 스레드는 같은 버퍼로 정보 클래스 22의 `NtQueryInformationToken` 을 5,000번 호출합니다. 한 차례의 레이스가 끝나면 `OpenProcess` 로 `winlogon.exe` 에 `PROCESS_ALL_ACCESS` 를 요청하고, 핸들이 열릴 때까지 반복합니다.

```cpp
ULONGLONG value = kTokenAddr + 0x40 - 4;*(WORD*)(RaceAddr + 2) = 2;             // MaximumLength*(ULONGLONG*)(RaceAddr + 8) = value;     // Buffer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5549e6f0db8b2d3.png)

여기서 `MaximumLength = 2` 는 조금 이상해 보일 수 있습니다.

레이싱 스레드가 `2` 를 기록하더라도, 커널이 복사 길이를 정할 때 그 값을 읽었다는 뜻은 아닙니다. `2` 가 적용됐다면 `token + 0x3C` 부터 2바이트만 기록되므로 `+0x40` 에서 시작하는 `_TOKEN.Privileges` 는 바뀌지 않습니다. `winlogon.exe` 핸들이 열린 결과는 커널이 권한 비트를 덮어쓸 만큼 긴 복사 길이와 변경된 `Buffer` 주소를 함께 사용했다고 보는 것이 맞습니다.

### 확인한 결과

실행 결과는 어땠을까요? `winlogon.exe` 핸들은 30번째 시도까지 거부됐고, 32번째 시도에서 열렸습니다. 자식 프로세스를 만들 때 부모를 지정하는 속성인 `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS` 에 이 핸들을 넣자, 자식에서 LocalSystem의 SID(`S-1-5-18`)와 System integrity(`S-1-16-16384`)가 기록됐습니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8cea415f9574d094.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f6a3a32b3537460c.png)

이 경로에서 **SYSTEM이 된 주체는 새로 만든 자식 프로세스** 입니다. 원래 프로세스의 `_EPROCESS.Token` 을 SYSTEM 토큰으로 바꾼 결과는 아닙니다.

## 2-2. 두 번째 경로: 읽기와 쓰기 만들기

이제 이번에 재현한 I/O Ring 경로를 보겠습니다. carrot_c4k3가 제시한 체인을 따라가되, 데스크톱 환경에 맞춰 포트를 만들었습니다. 앞선 토큰 경로와 달리 링 객체의 상태를 여러 단계에 걸쳐 맞춰 줘야 했는데요. 저는 과정을 **주소 확인 → descriptor 레이스 → 링 주변 필드 복구 → 커널 읽기와 쓰기 확인 → 토큰 검증 → 원복** 으로 나눠 살펴봤습니다.

### A. 주소 확인

첫 준비물은 링 객체의 주소입니다. I/O Ring은 요청을 큐에 쌓아 비동기 I/O를 처리하는 인터페이스입니다. 포트는 링을 만드는 `CreateIoRing(IORING_VERSION_3, ...)` 을 호출하고, 해당 핸들을 기준으로 `NtQuerySystemInformation(SystemHandleInformation)` 결과에서 커널 `_IORING_OBJECT` 주소를 찾습니다. 링을 만들 수 있어야 하고 수정할 객체 주소도 알아야 하는 것이죠. `CreateIoRing` 은 Windows 빌드 22000부터 제공되므로, API가 없는 환경에는 이 경로를 그대로 적용할 수 없습니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dc13f9ddc320d481.png)

### B. descriptor 레이스

다음은 레이스를 걸 구조체의 위치입니다. 기존 PoC는 private 보안 특성 리스트를 따라가며 destination descriptor를 찾습니다. 이번 포트에서는 출력 버퍼에서 `TSA://ProcUnique` 의 UTF-16 바이트열을 먼저 찾고, 그 주소를 가리키는 포인터 필드를 다시 검색해 `Buffer` 의 위치를 정했습니다.

같은 취약 함수와 문자열을 쓰더라도 **레이스 대상의 위치를 찾는 방법부터 구현이 갈라지는 셈** 입니다!!

```c
/* 실험 포트에서 확인할 수 있는 핵심 관계 */magic_ptr = address_of_UTF16_name_in(output_buf);smash_ptr = address_of_pointer_to(magic_ptr, output_buf);smash_target = ring_addr + 0x9D;/* 경쟁 스레드가 *smash_ptr = smash_target을 반복 */
```

위 코드는 검색 흐름만 남긴 의사코드입니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9180875ead1dd4db.png)

실제 포트는 쿼리 직전에 원래 이름 위치를 0으로 지우고, 쿼리가 돌아온 뒤에도 0인지 확인해 `race-observation` 을 기록했습니다. 하지만 이것은 **원래 버퍼에 복사되지 않았다는 관찰** 일 뿐, 링에 원하는 값이 쓰였다는 증명은 아니죠.

그래서 뒤에서 링 필드를 다시 읽어 확인했습니다.

#### 등록 버퍼 포인터에 남는 값

주소를 찾았다고 해서 아무 위치에나 32바이트를 쓸 수는 없습니다. 고정 문자열이 **어떤 필드에 어떤 값으로 남는지** 계산해야 합니다.

`CompletionUserEvent` 는 `+0xA8`, `RegBuffersCount` 는 `+0xB0`, `RegBuffers` 는 `+0xB8` 로 확인했습니다. 새 링 객체의 `RegBuffers` 가 처음에 0인 상태에서 문자열의 시작점을 `ring + 0x9D` 로 맞췄습니다. `0xB8 - 0x9D = 0x1B` 이므로, `RegBuffers` 의 첫 바이트는 문자열의 28번째 바이트가 됩니다.

문자열 끝의 `00 75 00 65 00` 이 포인터의 하위 5바이트에 들어가고, 상위 3바이트는 원래의 0으로 남습니다. 이를 little-endian 값으로 읽으면 `0x0000000065007500` 이 되죠.

포트는 프로세스의 가상 주소 공간에 메모리를 할당하는 `VirtualAlloc(0x65000000, 0x100000, ...)` 으로 사용자 영역을 확보했고, 이 주소는 그 안에 들어옵니다.

마음대로 고를 수 없는 문자열을 썼는데도, 결과적으로 **사용자 메모리에 둔 가짜 등록 버퍼 배열을 가리키는 포인터** 가 생긴 겁니다!!

carrot_c4k3는 문자열을 포인터보다 **28바이트 앞** 에 놓고 마지막 4바이트로 낮은 주소를 만드는 예를 듭니다. 제가 재현한 데스크톱 포트는 `+0x9D` 에서 쓰기 시작하므로 `RegBuffers` 보다 **27바이트 앞** 입니다. 그래서 마지막 5바이트가 걸치고 결과도 `0x65007500` 이 됩니다. 원리는 같지만, **글 속의 일반적인 정렬과 실제 포트의 정렬은 구분** 해서 보는 편이 정확합니다.

```
ring + 0xB0  RegBuffersCount = 0x710069006e005500ring + 0xB8  RegBuffers      = 0x0000000065007500
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f93c7512e48f009b.png)

### C. 링 주변 필드 복구

여기서 문제가 있는데, 고정 문자열 32바이트가 연속된 범위에 기록되면서 `RegBuffers` 뿐 아니라 앞쪽의 `SignalCompletionEvent`, `CompletionUserEvent`, `RegBuffersCount` 도 함께 바뀝니다.  
특히 `CompletionUserEvent` 에 잘못된 포인터가 남으면 링 작업의 완료 처리에서 문제가 생길 수 있습니다.

carrot_c4k3는 **첫 I/O Ring 쓰기가 그 완료 경로의 문제를 만나기 전에 수행되는 순서** 를 이용해 이벤트 포인터를 복구했다고 설명합니다.

그래서 저도 레이스 직후의 첫 I/O Ring 작업은 공격 대상이 아니라 **링 자체의 복구** 에 사용했습니다.

`ring + 0x90` 부터 `0x20` 바이트를 0으로 기록하면 `+0x90..+0xAF` 의 이벤트 필드 영역을 덮어쓸 수 있습니다. 그 뒤 `RegBuffersCount` 와 `RegBuffers` 를 다시 읽어 값을 확인했습니다. `race-observation=1` 만으로는 원하는 링 필드가 실제로 바뀌었는지 알 수 없기 때문이죠.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2282a555c3377027.png)

```
race-observation=1 queries=2758initial repair write succeededkernel-read status=0RegBuffersCount=710069006e005500RegBuffers=0000000065007500
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c8234cf37aa5505.png)

로그에서 눈에 띄는 것은 `RegBuffersCount` 가 정상적인 개수 `1` 이 아니라 문자열 바이트로 만들어진 큰 값이라는 점입니다. 포트는 가짜 배열의 첫 항목만 사용했고, 이 빌드에서는 필요한 작업이 그 상태로 성공했습니다. 이후에는 손상된 이벤트 리스트 링크를 다시 쓰고, 종료 전에 등록 버퍼 관련 필드를 0으로 돌리는 작업도 넣었습니다.

### D. 커널 읽기와 쓰기 확인

#### 가짜 등록 버퍼로 읽기와 쓰기 만들기

이제 `RegBuffers` 는 User Address `0x65007500` 을 가리킵니다. 그곳에 있는 배열의 첫 항목을 가짜 `_IOP_MC_BUFFER_ENTRY` 로 채울 차례입니다.

포트에서는 사용자 쪽 `HIORING` 의 `RegBufferArray` 도 같은 주소로 맞추고 `BufferArraySize` 를 `0x1000` 으로 설정했습니다. 가짜 엔트리의 `Address` 와 `Length` 에는 읽거나 쓸 커널 위치와 크기를 넣습니다.

처음의 고정 문자열 쓰기로는 원하는 토큰 포인터를 직접 기록할 수 없었지만, 링이 이 가짜 등록 버퍼를 사용하면 **대상을 골라 읽고 쓸 수 있는 단계** 로 넘어갑니다. 이 원리는 앞선 I/O Ring 연구에서도 설명됐습니다.

`BuildIoRingReadFile` 과 `BuildIoRingWriteFile` 은 각각 I/O Ring의 파일 읽기와 쓰기 요청을 구성하는 함수입니다. 포트에서는 파일과 가짜 등록 버퍼 사이에 데이터를 옮겨 다음처럼 사용했습니다.

| 포트에서 사용한 요청 | 파일과 버퍼 사이의 이동 | 커널에서 얻는 효과 |
| --- | --- | --- |
| `BuildIoRingReadFile` | 임시 파일 → 가짜 등록 버퍼의 `Address` | 선택한 커널 주소에 쓰기 |
| `BuildIoRingWriteFile` | 가짜 등록 버퍼의 `Address` → 임시 파일 | 선택한 커널 주소에서 읽기 |

헬퍼 코드의 변수명에는 `Pipe` 가 남아 있지만, 이번 데스크톱 포트에서 실제 전송 매체는 `%TEMP%` 에 만든 임시 파일 두 개입니다.

API 이름 때문에 방향이 헷갈릴 수 있지만, **파일에서 읽어 커널 버퍼에 넣는 요청이 커널 쓰기** 이고, **커널 버퍼의 내용을 파일로 내보내는 요청이 커널 읽기** 입니다.

#### 읽기 결과 검증하기

처음 토큰 교체를 시도했을 때는 잠깐 멈춰야 했습니다. 예상했던 값과는 다른 값이 나오네요…

`kernel-read status=0` 이 나왔고 `RegBuffers=0x65007500` 도 확인했는데, 읽어 온 두 프로세스의 PID가 모두 0이었습니다. 여기서 토큰 포인터를 쓰지 않고 실행을 중단했습니다. 로그를 보니 **링 필드 읽기가 성공해도 뒤에 읽은 프로세스 필드의 값까지 맞다고 볼 수는 없겠네요.**

```
kernel-read status=0 RegBuffers=0000000065007500process-object status=0/0process IDs SYSTEM=0 current=0chain_exit=8
```

원인을 따라가 보니 파일 기반 읽기 헬퍼(ioring_read)를 연속 호출할 때 파일 포인터가 시작점으로 돌아오지 않았습니다. 이것 때문에 다음 호출에서는 파일을 처음부터 읽지 못했던 거죠.

포트의 커널 읽기 헬퍼 `ioring_read` 에서 파일의 읽기 위치를 바꾸는 `SetFilePointer(hOutPipe, 0, NULL, FILE_BEGIN)` 를 `ReadFile` 앞에 넣었습니다. 다행히 다음 실행에서는 SYSTEM 프로세스의 PID `4` 와 현재 PID를 정상적으로 확인했습니다.

이때 수정한 부분은 취약점이나 링 필드가 아니라 **임시 파일의 데이터를 사용자 버퍼로 가져오는 헬퍼의 파일 위치 처리** 입니다.

### E. 토큰 검증

이제 거의 다 왔습니다. 읽기 값이 제대로 나오는 것을 확인했으니, 토큰 교체로 넘어가 볼까요?

포트는 핸들 정보에서 PID 4와 현재 프로세스의 `_EPROCESS` 주소를 얻고, I/O Ring 읽기로 각 객체의 `UniqueProcessId` (`+0x440`)와 `Token` (`+0x4B8`)을 확인합니다.

PID가 예상한 값인지 검사한 다음, 현재 프로세스의 토큰 필드에 SYSTEM 토큰 값을 잠시 기록했습니다. 그 상태에서 토큰에서 지정한 항목을 조회하는 `GetTokenInformation` 으로 **현재 프로세스 자체** 의 `TokenUser` 와 `TokenIntegrityLevel` 을 읽었습니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6eaab3257bcf58dc.png)

최종 로그의 `token-user-is-LocalSystem=1` 은 사용자 SID가 LocalSystem과 일치한다는 뜻이고, `integrity-RID=16384` 는 System 무결성 수준을 뜻합니다. 첫 번째 경로에서는 **새 자식 프로세스** 가 SYSTEM 토큰으로 실행됐습니다. 이번 경로에서는 **실행 중인 원래 프로세스** 의 토큰 필드가 잠시 SYSTEM 토큰을 가리켰습니다.

```
process IDs SYSTEM=4 current=6012token-user-is-LocalSystem=1 integrity-RID=16384
```

토큰 교체는 별도의 실행 두 번에서 성공했습니다. 레이스 쿼리 횟수는 각각 `27,809` 회와 `2,758` 회였는데, 이 숫자만으로 성공률이나 두 방식의 안정성을 비교할 수는 없습니다.

### F. 원복

토큰 상태를 확인한 뒤 보관한 원래 **`Token`** 필드 값을 다시 기록했습니다. 같은 필드를 다시 읽어 이전 값과 일치하는지도 확인했습니다.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae81b2d0f6004426.png)

```
restore-original-token=0 verify-read=0 matches=1restore-list=0 restore-registry=0 token-check=1chain_exit=0
```

최종 실행에서는 토큰 포인터를 **다시 읽어 원복을 확인** 했습니다.

## 3\. 두 경로를 비교하면

## 직관적으로 보이는 차이점들

이제 두 경로를 비교해 보겠습니다.

둘 다 동일한 32바이트 문자열을 이용했고 끝에는 SYSTEM 권한을 확인했지만, 그 사이에서 얻은 능력과 밟아야 했던 단계는 꽤 달랐습니다. 어디까지가 공통이고 어디서 갈라졌는지를 표로 먼저 정리해봤습니다.

| 단계  | 기존 토큰 경로 | 이번 I/O Ring 경로 |
| --- | --- | --- |
| 진입점 | `NtQueryInformationToken` class 22의 보안 특성 출력 | 동일  |
| 복사될 값 | `TSA://ProcUnique`, UTF-16LE 32바이트 | 동일  |
| 프리미티브 | 주소를 고르는 제한적 쓰기 | 동일  |
| 필요한 객체 주소 | 현재 토큰 | 현재 I/O Ring, 이후 두 `_EPROCESS` |
| 레이스 대상 찾기 | private 특성 리스트에서 destination descriptor 추적 | 출력 버퍼의 문자열과 그 포인터를 검색 |
| 레이스 구동 | `MaximumLength` 와 `Buffer` 를 반복 수정 | `Buffer` 만 반복 수정, 원래 문자열 위치 변화 관찰 |
| 쓰기 대상 | `_TOKEN.Privileges` 앞쪽 `-4` | `_IORING_OBJECT.RegBuffers` 앞쪽 `-0x1B` |
| 쓰기 뒤 얻은 프리미티브 | 기존 권한으로 열 수 없던 프로세스의 강한 핸들 | 링을 통한 커널 읽기와 쓰기 |
| 권한 상승 결과 | `winlogon.exe` 를 부모로 둔 SYSTEM 자식 프로세스 | 현재 프로세스의 토큰을 일시 교체 |

표에서 앞의 세 줄은 같습니다. 같은 함수에서 같은 문자열을 내보내고, 그 문자열이 쓰일 위치를 경쟁으로 바꿉니다. 하지만 코드를 보면 주소를 얻는 방식, descriptor를 찾는 방식, 바꾸는 필드부터 달라집니다.

그리고 **첫 쓰기의 타겟을 고르는 순간부터 익스플로잇의 목적이 본격적으로 갈라집니다.** 토큰 경로는 권한 비트 자체를 바꾸고, 링 경로는 포인터를 사용자 버퍼 쪽으로 돌려 읽기와 쓰기 능력을 만듭니다.

## 타겟 선정 과정은?

왜 하필 토큰과 I/O Ring이었을까요?

먼저 토큰 경로에는 임의의 포인터 값이 필요하지 않았습니다. `_TOKEN.Privileges` 가 시작하는 `+0x40` 보다 4바이트 앞에 문자열을 놓으면, 8바이트씩 이어지는 `Present` 와 `Enabled` 마스크에 아래 패턴이 겹쳐집니다. 두 값은 문자열과 이 빌드의 필드 배치에서 **계산한 것** 입니다. 실행 중 토큰 메모리를 직접 읽어 얻은 값은 아닙니다.

```
Present  (+0x40) = 0x002f002f003a0041Enabled  (+0x48) = 0x0063006f00720050두 값 모두 bit 20 = 1
```

WDK 헤더에서 `SE_DEBUG_PRIVILEGE` 의 번호는 `20` 입니다. 두 값 모두 bit 20이 1이니까, 이 배치는 `SeDebugPrivilege` 의 present와 enabled 비트를 켜려는 설계로 읽힙니다. Microsoft의 `OpenProcess` 문서도 이 권한이 켜진 경우 요청한 접근 권한을 얻을 수 있다고 설명하고 있어요.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00d1429f933d01ee.png)

실제로 `winlogon.exe` 핸들이 열린 결과와 잘 맞지만, 이번 실행 로그에는 변경된 토큰의 권한 마스크를 직접 확인한 기록은 없습니다.

I/O Ring 경로에서 찾은 유용한 값은 권한 비트가 아니라 **가짜 배열을 가리킬 수 있는 주소** 였습니다. `RegBuffers` 의 상위 바이트가 0인 상태에서 문자열 끝부분을 포인터의 하위 바이트에 걸치면 `0x65007500` 이 만들어집니다. 포트가 그 주소를 실제로 매핑했기 때문에 링은 사용자 메모리의 가짜 등록 버퍼를 참조할 수 있었습니다. 대신 32바이트가 옆의 이벤트 필드까지 건드리는 문제를 해결해야 했습니다. 그래서 **첫 복구 쓰기와 링 상태 확인이 이 경로에 꼭 들어갑니다.**

결국 두 선택의 공통점은 **고정된 문자열로도 쓸모 있는 상태가 되는 필드** 를 찾았다는 것입니다. 토큰에서는 비트 패턴이 곧 필요한 권한으로 이어졌고, 링에서는 포인터 패턴이 다음 읽기와 쓰기 기능의 입구가 됐습니다. 처음부터 원하는 SYSTEM 토큰 포인터를 쓸 수는 없었으므로, 각 경로는 이렇게 얻은 중간 능력을 한 번 더 이용해야 했습니다.

### 어느 방어와 제약이 영향을 줬나

방어기법과 환경 조건도 이 선택에 영향을 줍니다. 다만 직접 실험에서 확인한 일과 carrot_c4k3가 설명한 조건, 아직 측정하지 않은 부분을 섞어 쓰면 결론이 과해집니다. 아래 표에서는 각 조건이 어느 단계에 영향을 주는지와 제가 확인한 범위를 함께 적었습니다.

| 조건  | 두 경로에 미친 영향 | 확인 범위 |
| --- | --- | --- |
| 패치된 copyout 경로 | 사용자 버퍼의 descriptor를 커널 소유 메모리에 캡처하면 공통 제한 쓰기가 성립하지 않아 두 경로 모두 첫 단계에서 멈춤 | 공개 분석과 기존 패치 분석에 근거; 이 글의 실험은 취약 빌드에서 수행 |
| 객체 주소의 비공개성 | 두 경로 모두 표적 주소가 필요해 핸들 정보 조회를 사용 | Medium integrity VM에서 주소 획득 성공을 코드와 로그로 확인 |
| Low integrity의 주소 공개 제한 | carrot_c4k3의 Xbox 경로는 제한된 호출자인지 판정하는 `ExIsRestrictedCaller` 검사 때문에 추가 주소 획득 단계가 필요했음 | 이번 재현은 Medium integrity이므로 해당 우회를 시험하지 않음 |
| 프로세스 접근 검사 | 첫 경로는 `winlogon.exe` 의 `PROCESS_ALL_ACCESS` 가 거부에서 성공으로 바뀌어야 다음 단계가 가능 | 최종 실행에서 attempt 32의 핸들 성공 관찰. 보호 프로세스 일반에 대한 통과를 뜻하지 않음 |
| I/O Ring 인접 필드 | 두 번째 경로는 32바이트가 이벤트 포인터까지 바꿔 첫 쓰기로 복구해야 함 | 첫 복구 쓰기 성공과 등록 버퍼 필드 재읽기 확인 |

I/O Ring 경로에서 사용자 주소를 가리키는 `RegBuffers` 가 통하는 이유도 짚어 볼 만합니다. carrot_c4k3는 Windows가 **SMAP을 사용하지 않아** 커널이 사용자 메모리의 가짜 구조체를 읽는 설계가 가능하다고 설명합니다. 이번 VM에서 CPU 보호 비트를 따로 계측한 것은 아니므로, 이 실험으로 “SMAP을 우회했다”고 주장할 근거는 없습니다.

SMEP, Kernel CFG, CET처럼 **코드 실행과 제어 흐름을 보호하는 기법** 도 두 결과를 설명할 때 조심해서 다뤄야 합니다. 이번 두 경로는 명령 포인터를 바꾸거나 커널에서 사용자 코드를 실행한 것이 아니라 데이터 필드를 바꿨습니다. 따라서 이 보호들을 직접 우회했다고 보기는 어렵습니다. HVCI/VBS 역시 **켜짐 상태별 비교 실험을 하지 않았습니다.** 이 로그만으로 켜진 환경에서의 성공 여부를 일반화할 수 없습니다.

x64의 Kernel Patch Protection(PatchGuard)은 일부 커널 코드와 구조체 변경을 감시합니다. 이번에는 토큰 포인터를 짧게 교체했다가 원복했고, 장시간 실행이나 해당 필드의 검사 여부는 측정하지 않았습니다. 따라서 **PatchGuard를 우회했다고 결론 내리지는 않겠습니다.** Microsoft의 x64 커널 제한 설명

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ccfbf8343959e7e.png)

주소 배치 무작위화의 영향은 두 코드에서 비교적 분명하게 보입니다. 커널 객체의 절대 주소를 고정해 둔 것이 아니라, 실행 중 핸들 정보로 주소를 얻고 상대 오프셋을 더했습니다. 그렇다고 **KASLR 자체가 꺼져 있었다거나 모든 주소 공개 제한을 넘었다는 뜻은 아닙니다.** 특히 Low integrity에서는 carrot_c4k3가 설명한 추가 제한이 있으므로, 이번 Medium integrity 결과를 Xbox 경로 전체로 넓혀 해석하지 않겠습니다.

### 결과가 달라진 이유

첫 경로의 선택을 다시 보면, 고정 문자열이 권한 비트를 켜는 정렬을 찾은 뒤 `winlogon.exe` 핸들과 Windows의 프로세스 생성 기능을 이용해 SYSTEM 자식에 도달했습니다. 중간에 필요한 능력이 **강한 프로세스 핸들** 이어서 단계가 비교적 짧습니다. 다만 해당 프로세스의 접근 검사와 자식 생성 조건에 기대는 경로이며, 이 실행으로 커널 임의 주소를 읽고 쓰는 능력까지 확인한 것은 아닙니다.

두 번째 경로는 문자열 끝부분으로 매핑 가능한 포인터를 만들고, 링의 등록 버퍼 기능을 커널 읽기와 쓰기로 확장했습니다. 그렇게 얻은 능력으로 현재 프로세스의 토큰을 바꿨습니다. 하지만 그 전에 링 객체의 배치를 맞추고, 주변 필드를 복구하고, 파일로 데이터를 옮기고, 읽은 값이 맞는지 검증해야 했습니다. 토큰을 되돌리는 일도 필요했습니다. **중간 능력은 더 강해졌지만 관리할 상태와 실패 지점도 늘어난 셈입니다.**

물론 두 경로가 CVE-2024-30088의 유일한 활용법이라는 뜻은 아닙니다. 이번 비교에서 확인할 수 있는 것은 **같은 고정 문자열을 각 타겟이 어떤 상태로 받아들였는지**, 그리고 실험 빌드에서 각 체인이 성립하려면 무엇이 필요했는지입니다. 두 실행의 시도 횟수도 측정 단위가 다르므로 어느 경로의 성공률이 더 높다고 비교하지는 않겠습니다.

## 4\. 마무리

처음 질문으로 돌아와 보겠습니다. 하나의 취약점에서 출발했는데 왜 권한 상승 방법은 달라졌을까요?

두 경로의 프리미티브는 똑같은 **고정 문자열 쓰기** 였습니다. 토큰 경로는 그 바이트를 권한 마스크에 맞춰 SYSTEM 자식을 만들 수 있는 핸들로 이어 갔고, I/O Ring 경로는 등록 버퍼 포인터에 맞춰 커널 읽기와 쓰기로 확장했습니다.

제가 이번 재현에서 가장 흥미롭게 본 지점은 **버그 다음에 무엇을 타겟으로 삼느냐에 따라 필요한 준비와 검증까지 달라진다** 는 것이었습니다.

타겟 필드가 받아들일 수 있는 값, 함께 손상되는 필드, 객체 주소를 얻는 조건, 마지막에 권한을 확인할 프로세스가 모두 달랐습니다. 결국 두 경로를 가른 것은 레이스 자체보다, **고정 문자열이 어느 필드에 기록되고 그 객체가 이후 그 값을 어떻게 사용하느냐** 였습니다.

직접 재현해 보니 생각보다 다른 길이었어요.

특히 링 필드는 제대로 읽혔는데 프로세스 PID가 `0` 으로 나오던 순간에는 “이제 다 된 줄 알았는데?” 싶었습니다… 파일 포인터 문제를 찾고 나니 성공 메시지보다 **그다음 단계에 쓸 값이 제대로 들어왔는지** 보는 게 중요하다는 말이 새삼 실감 나더라고요.

예상보다 돌아가는 길이 많았지만, 그만큼 재미있었습니다. 여기까지 읽어주셔서 감사합니다! 다음 글에서 뵙겠습니다 😄

## Reference

-   [carrot_c4k3, CVE-2024-30088 Pwning Windows Kernel @ Pwn2Own Vancouver 2024 (Plus Xbox)](https://exploits.forsale/pwn2own-2024/)
-   [exploits-forsale/collateral-damage 공개 코드와 MIT 라이선스](https://github.com/exploits-forsale/collateral-damage)
-   [tykawaii98/CVE-2024-30088 공개 PoC, 검토한 커밋](https://github.com/tykawaii98/CVE-2024-30088/blob/bffcbbccac2f024024938a805ab32c693b260b91/poc/main.cpp)
-   [IBM X-Force, I/O Ring 등록 버퍼를 통한 커널 읽기와 쓰기](https://www.ibm.com/think/x-force/patch-tuesday-exploit-wednesday-pwning-windows-ancillary-function-driver-winsock)
-   Microsoft: [RtlCopyUnicodeString](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-rtlcopyunicodestring), [OpenProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess), [CreateIoRing](https://learn.microsoft.com/en-us/windows/win32/api/ioringapi/nf-ioringapi-createioring)
-   Microsoft: [NtQuerySystemInformation](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntquerysysteminformation), [VirtualAlloc](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtualalloc), [SetFilePointer](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfilepointer), [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation)
-   [Hackyboiz 하루한줄: CVE-2024-30088 취약 경로와 패치](https://hackyboiz.github.io/2026/10/21/SeoPPak/CVE-2024-30088/)
